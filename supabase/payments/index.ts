// PHD Billing — payments (Supabase Edge Function "payments")
// ---------------------------------------------------------------------
// Talks to Nickel through Nickel's MCP server (free plan). The token lives only in
// Supabase → Edge Functions → Secrets → NICKEL_MCP_TOKEN, never in the browser.
//
// Every change in Nickel (add a vendor, add a bill, pay, create or send an invoice)
// is confirmed by a person: Nickel sends a confirmation request, this function hands
// Nickel's exact wording to the console, and only the click of the person who started
// the action is passed back. If nobody answers in time, nothing runs and Nickel's own
// approval link is offered instead.
//
// Reading (matching vendors and owners, payment status) needs no confirmation and runs
// hourly. QuickBooks is updated by Nickel's own QuickBooks connection.
//
// Who may send money: private_settings key "payers" (comma-separated emails), checked
// here on every payment. No bank or card numbers pass through this function.

import { AsyncLocalStorage } from "node:async_hooks";

const SB = Deno.env.get("SUPABASE_URL")!;
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const TOKEN = (Deno.env.get("NICKEL_MCP_TOKEN") || "").trim();
const MCP_URL = "https://mcp.nickel.com/mcp";
const WAIT_MS = Number(Deno.env.get("NK_WAIT_MS")) || 100_000;   // how long a confirmation waits for a click (Supabase stops a request at ~150s)

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
type Obj = Record<string, any>;
const S = (v: unknown) => (v == null ? "" : String(v));
const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nkey = (s: unknown) => S(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const isEmail = (e: unknown) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(S(e).trim());

/* ====================================================================
   DATABASE (service role)
   ==================================================================== */
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(SB + "/rest/v1/" + path, { ...init, headers: { apikey: SRV, Authorization: "Bearer " + SRV, "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`database ${init.method || "GET"} ${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r;
}
async function getSetting(key: string): Promise<string | null> {
  const j = await (await rest(`private_settings?select=value&key=eq.${encodeURIComponent(key)}`)).json();
  return j.length ? j[0].value : null;
}
async function setSetting(key: string, value: string) {
  await rest("private_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key, value }) });
}
async function delSetting(key: string) { await rest(`private_settings?key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }); }
async function getDoc(kind: string, id: string): Promise<{ data: Obj; version: number; deleted: boolean } | null> {
  const j = await (await rest(`docs?select=data,version,deleted&kind=eq.${kind}&id=eq.${encodeURIComponent(id)}`)).json();
  return j.length ? j[0] : null;
}
// Each request keeps its own state (several can run at once in one server process,
// e.g. the console checking for a confirmation while a payment request is waiting).
type Ctx = { touched: Set<string>; session: string; nextId: number; opened: boolean };
const ctx = new AsyncLocalStorage<Ctx>();
const C = (): Ctx => ctx.getStore() || { touched: new Set(), session: "", nextId: 1, opened: false };
// read → change → save at the version it was read; retried if someone saved in between
async function updateDoc(kind: string, id: string, fn: (d: Obj) => unknown, create = false): Promise<Obj> {
  for (let i = 0; i < 6; i++) {
    const d = await getDoc(kind, id);
    if (!d) {
      if (!create) throw new Error(`${kind} ${id} not found`);
      const data: Obj = {}; fn(data);
      const r = await fetch(SB + "/rest/v1/docs", { method: "POST", headers: { apikey: SRV, Authorization: "Bearer " + SRV, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ kind, id, data }) });
      if (r.ok) { C().touched.add(kind + "/" + id); return data; }
      continue;
    }
    const data = structuredClone(d.data || {});
    if (fn(data) === false) return data;
    const r = await rest(`docs?kind=eq.${kind}&id=eq.${encodeURIComponent(id)}&version=eq.${d.version}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data, deleted: false }) });
    if ((await r.json()).length) { C().touched.add(kind + "/" + id); return data; }
  }
  throw new Error("Someone kept editing this record — try again in a moment");
}
const docData = async (kind: string, id: string) => { const d = await getDoc(kind, id); return d && !d.deleted ? d.data : null; };
async function nkMap(): Promise<Obj> { return (await docData("shared", "nickel")) || {}; }
const saveMap = (fn: (m: Obj) => unknown) => updateDoc("shared", "nickel", (m) => { m.vendors = m.vendors || {}; m.customers = m.customers || {}; return fn(m); }, true);
async function vendorsList(): Promise<Obj[]> { const d = await docData("shared", "vendors"); return (d && d.list) || []; }
async function ownersList(): Promise<Obj[]> { const d = await docData("shared", "main"); return (d && d.owners) || []; }
async function accounting(): Promise<Obj> { return (await docData("shared", "accounting")) || {}; }
const vendorOf = (vendors: Obj[], b: Obj) => vendors.find((x) => x.id === b.vendorId) || vendors.find((x) => nkey(x.name) === nkey(b.vendor)) || null;

/* ====================================================================
   WHO IS CALLING
   ==================================================================== */
async function caller(req: Request): Promise<{ email: string; staff: boolean }> {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return { email: "", staff: false };
  const apikey = req.headers.get("apikey") || ANON;
  const u = await fetch(SB + "/auth/v1/user", { headers: { apikey, Authorization: auth } });
  if (!u.ok) return { email: "", staff: false };
  const email = S((await u.json()).email).toLowerCase();
  const r = await fetch(SB + "/rest/v1/rpc/is_staff", { method: "POST", headers: { apikey, Authorization: auth, "Content-Type": "application/json" }, body: "{}" });
  return { email, staff: r.ok && (await r.json()) === true };
}
async function isSchedule(req: Request): Promise<boolean> {
  const given = req.headers.get("x-md-cron") || "";
  if (given.length < 32) return false;
  return (await getSetting("md_cron_token")) === given;
}
async function payers(): Promise<string[]> { return S(await getSetting("payers")).split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@")); }

/* ====================================================================
   NICKEL MCP CLIENT
   ==================================================================== */
type Ask = (params: Obj) => Promise<Obj>;     // answers a confirmation: {action:"accept",content:{confirm:true}} | {action:"decline"} | {action:"cancel"}
async function post(msg: Obj) {
  if (!TOKEN) throw new Error("Nickel isn't connected: add NICKEL_MCP_TOKEN in Supabase → Edge Functions → Secrets.");
  const h: Obj = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const c = C(); if (c.session) h["Mcp-Session-Id"] = c.session;
  const r = await fetch(MCP_URL, { method: "POST", headers: h, body: JSON.stringify(msg) });
  const sid = r.headers.get("mcp-session-id"); if (sid) c.session = sid;
  if (r.status === 401 || r.status === 403) throw new Error("Nickel didn't accept the token. Make a new one in Nickel → Settings → MCP → API tokens and update NICKEL_MCP_TOKEN in Supabase.");
  if (!r.ok && r.status !== 202) throw new Error(`Nickel answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}
// one request; requests Nickel sends meanwhile (confirmations) go to `ask`
async function rpc(method: string, params: Obj, ask?: Ask): Promise<Obj> {
  const id = C().nextId++;
  const r = await post({ jsonrpc: "2.0", id, method, params });
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("event-stream")) { const t = await r.text(); const m = t ? JSON.parse(t) : {}; if (m.error) throw new Error("Nickel: " + (m.error.message || JSON.stringify(m.error))); return m.result || {}; }
  const reader = r.body!.getReader(), dec = new TextDecoder(); let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const ev = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = ev.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("");
        if (!data.trim()) continue;
        let m: Obj; try { m = JSON.parse(data); } catch { continue; }
        if (m.method && m.id !== undefined) {
          const ans = m.method === "elicitation/create" ? (ask ? await ask(m.params || {}) : { action: "cancel" }) : {};
          await (await post({ jsonrpc: "2.0", id: m.id, result: ans })).text().catch(() => "");
        } else if (m.id === id) {
          if (m.error) throw new Error("Nickel: " + (m.error.message || JSON.stringify(m.error)));
          return m.result || {};
        }
      }
    }
  } finally { try { reader.cancel(); } catch { /* closed */ } }
  throw new Error("Nickel closed the connection without an answer");
}
async function open() {
  if (C().opened) return;
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: { elicitation: {} }, clientInfo: { name: "phd-billing-console", version: "2.0" } });
  await (await post({ jsonrpc: "2.0", method: "notifications/initialized" })).text().catch(() => "");
  C().opened = true;
}
// call a Nickel tool → {ok, data} or {ok:false, error:{message, approvalUrl}}
async function tool(name: string, args: Obj, ask?: Ask): Promise<Obj> {
  await open();
  const res = await rpc("tools/call", { name, arguments: args }, ask);
  let out: Obj | null = res.structuredContent || null;
  if (!out) { const t = S(res.content && res.content[0] && res.content[0].text); try { out = JSON.parse(t); } catch { out = { ok: !res.isError, text: t }; } }
  if (res.isError || out!.ok === false) {
    const e = out!.error || {}, msg = S(e.message || out!.text || "Nickel refused the request");
    const url = (msg.match(/https:\/\/app\.nickel\.com\/dashboard\/agent-approvals\/[A-Za-z0-9_-]+/) || [])[0] || "";
    return { ok: false, error: { message: msg, kind: S(e.kind), approvalUrl: url }, data: out!.data };
  }
  return { ok: true, data: out!.data !== undefined ? out!.data : out, summary: S(out!.summary) };
}
async function read(name: string, args: Obj = {}) {
  const r = await tool(name, args);
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}
const items = (d: any): Obj[] => (Array.isArray(d) ? d : (d && Array.isArray(d.items) ? d.items : []));
async function readAll(name: string, args: Obj = {}, max = 20): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let page = 1; page <= max; page++) {
    const d = await read(name, { ...args, page, pageSize: 100 });
    out.push(...items(d));
    if (!d || !d.hasMore) break;
  }
  return out;
}
// a new record's id, wherever Nickel put it in the answer
function newId(d: any, ...keys: string[]): string {
  if (!d || typeof d !== "object") return "";
  for (const k of ["id", ...keys]) if (typeof d[k] === "string" && d[k]) return d[k];
  for (const k of Object.keys(d)) { const v = d[k]; if (v && typeof v === "object" && !Array.isArray(v) && typeof v.id === "string") return v.id; }
  return "";
}

/* ====================================================================
   CONFIRMATIONS: Nickel asks → the console shows it → the person clicks
   ==================================================================== */
const pendKey = (runId: string) => "nkc:" + runId;
function confirmer(runId: string, by: string, title: string): Ask {
  return async (params: Obj) => {
    const props = (params.requestedSchema && params.requestedSchema.properties) || {};
    const field = Object.keys(props)[0] || "confirm";
    await setSetting(pendKey(runId), JSON.stringify({ by, title, message: S(params.message), question: S((props[field] || {}).title), note: S((props[field] || {}).description), at: Date.now(), until: Date.now() + WAIT_MS }));
    const stop = Date.now() + WAIT_MS;
    try {
      while (Date.now() < stop) {
        await sleep(900);
        const raw = await getSetting(pendKey(runId)); if (!raw) return { action: "cancel" };
        const p = JSON.parse(raw);
        if (p.answer && p.answeredBy === by) return p.answer === "confirm" ? { action: "accept", content: { [field]: true } } : { action: "decline" };
      }
      return { action: "cancel" };
    } finally { await delSetting(pendKey(runId)).catch(() => {}); }
  };
}
function refused(r: Obj, what: string) {
  const m = r.error.message, declined = /came back "decline"/i.test(m), timedOut = /came back "cancel"/i.test(m);
  if (declined) return { ok: false, declined: true, error: `${what} was cancelled. Nothing changed in Nickel.` };
  return { ok: false, timedOut, approvalUrl: r.error.approvalUrl, error: timedOut ? `No answer in time, so nothing ran. You can still approve it in Nickel.` : m };
}

/* ====================================================================
   MATCHING console vendors/owners with Nickel (read-only)
   ==================================================================== */
const payoutLabel = (m: Obj) => S(m.type).toUpperCase() === "ACH" ? `Bank${m.bankName ? " · " + m.bankName : ""}${m.accountNumberLastFour ? " ····" + m.accountNumberLastFour : ""}`
  : `Check to ${[m.street, m.city].filter(Boolean).join(", ") || "address on file"}`;
function vendorRecord(nv: Obj, extra: Obj = {}) {
  const pm = (nv.vendorPayoutMethods || []).filter((m: Obj) => ["ACH", "CHECK"].includes(S(m.type).toUpperCase()))
    .map((m: Obj) => ({ id: m.id, type: S(m.type).toUpperCase(), label: payoutLabel(m) }))
    .sort((a: Obj, b: Obj) => (a.type === "ACH" ? 0 : 1) - (b.type === "ACH" ? 0 : 1));
  return { id: nv.id, name: S(nv.name), emails: nv.emails || [], payout: pm, synced: !!nv.quickBooksSynced, url: S(nv.dashboardUrl), checkedAt: new Date().toISOString(), ...extra };
}
async function syncMatches() {
  const [vendors, owners, map] = await Promise.all([vendorsList(), ownersList(), nkMap()]);
  const nvs = await readAll("search_vendors"), ncs = await readAll("search_customers");
  const best = (c: Obj[], good: (x: Obj) => boolean) => c.slice().sort((a, b) => (good(b) ? 1 : 0) - (good(a) ? 1 : 0))[0];
  const vOut: Obj = {}, cOut: Obj = {};
  for (const v of vendors) {
    const cur = (map.vendors || {})[v.id] || {};
    let nv = cur.id ? nvs.find((x) => x.id === cur.id) : null;
    if (!nv) {
      const em = S(v.email).toLowerCase().trim();
      const byEmail = em ? nvs.filter((x) => (x.emails || []).some((e: string) => S(e).toLowerCase() === em)) : [];
      const c = byEmail.length ? byEmail : nvs.filter((x) => nkey(x.name) === nkey(v.name));
      nv = c.length ? best(c, (x) => (x.vendorPayoutMethods || []).length > 0) : null;
    }
    if (nv) vOut[v.id] = vendorRecord(nv, { requested: S(cur.requested) });
    else if (cur.requested) vOut[v.id] = { requested: cur.requested };
  }
  for (const o of owners) {
    const cur = (map.customers || {})[o.id] || {};
    let nc = cur.id ? ncs.find((x) => x.id === cur.id) : null;
    if (!nc) {
      const ems = [o.email].concat(S(o.cc).split(/[,;\s]+/)).map((e) => S(e).toLowerCase().trim()).filter(isEmail);
      const c = ncs.filter((x) => (x.emails || []).some((e: string) => ems.includes(S(e).toLowerCase())));
      nc = c.length ? best(c, (x) => !!x.quickBooksSynced) : null;
    }
    if (nc) cOut[o.id] = { id: nc.id, name: S(nc.name), emails: nc.emails || [], synced: !!nc.quickBooksSynced, url: S(nc.dashboardUrl) };
  }
  // every Nickel vendor (names, emails, address, how they're paid — never bank numbers), so the console can list them
  const all = nvs.map((x) => ({ ...vendorRecord(x), address: S(x.address), city: S(x.city), state: S(x.state), zip: S(x.zip) }));
  const counts = { nickelVendors: nvs.length, nickelCustomers: ncs.length, vendorsMatched: Object.values(vOut).filter((x: Obj) => x.id).length, ownersMatched: Object.keys(cOut).length, owners: owners.length };
  await saveMap((m) => { m.vendors = vOut; m.customers = cOut; m.nickelVendors = all; m.counts = counts; m.matchedAt = new Date().toISOString(); });
  return counts;
}

/* ====================================================================
   STATUS
   ==================================================================== */
const money = (c: number) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const payFromLabel = (m: Obj) => `${S(m.nickname) || S(m.bankName) || (/balance/i.test(S(m.type)) ? "Nickel account" : S(m.type) || "Account")}${m.last4 ? " ····" + m.last4 : ""}${typeof m.spendableCents === "number" ? " · " + money(m.spendableCents) + " available" : ""}`;
async function payFrom() { return items(await read("get_merchant_payment_methods")).map((m) => ({ id: m.id, type: S(m.type), label: payFromLabel(m), isDefault: !!m.isDefault })); }
async function qbStatus() { try { const d = await read("get_accounting_integration_status"); return { connected: !!(d && d.connected), syncSupported: !!(d && d.syncSupported) }; } catch { return { connected: false, syncSupported: false }; } }
async function status(email: string) {
  if (!TOKEN) return { nickel: { ok: false, error: "Add NICKEL_MCP_TOKEN in Supabase → Edge Functions → Secrets." } };
  try {
    const [pf, qb, ps, map] = await Promise.all([payFrom(), qbStatus(), payers(), nkMap()]);
    return { nickel: { ok: true, payFrom: pf, qbo: qb, payers: ps, canPay: ps.includes(email), lastRefresh: S(map.lastRefresh), matchedAt: S(map.matchedAt) } };
  } catch (e) { return { nickel: { ok: false, error: String((e as Error).message || e) } }; }
}
async function qbLists() {
  const ex = await read("get_quickbooks_accounts_and_items", { side: "EXPENSE" }), rv = await read("get_quickbooks_accounts_and_items", { side: "REVENUE" });
  const acc = (d: Obj) => ((d && d.accounts) || []).map((a: Obj) => ({ id: a.id, name: S(a.name), type: S(a.accountType) })).sort((a: Obj, b: Obj) => a.name.localeCompare(b.name));
  return { expense: acc(ex), revenue: acc(rv) };
}

/* ====================================================================
   PLAN: what each bill needs before it can be paid (read-only)
   ==================================================================== */
async function plan(billIds: string[], email: string) {
  await syncMatches();
  const [map, vendors, ps, pf] = await Promise.all([nkMap(), vendorsList(), payers(), payFrom()]);
  const out: Obj[] = [];
  for (const id of billIds.slice(0, 40)) {
    const b = await docData("pm_bill", id);
    if (!b) { out.push({ id, need: "gone", why: "Bill not found" }); continue; }
    if (b.status !== "open") { out.push({ id, need: "done", why: "Already paid or in progress" }); continue; }
    const v = vendorOf(vendors, b), nv = v ? (map.vendors || {})[v.id] || {} : {};
    if (!v || !nv.id) { out.push({ id, vendorId: v ? v.id : "", need: "vendor", why: `${b.vendor} isn't in Nickel yet` }); continue; }
    if (!(nv.payout || []).length) { out.push({ id, vendorId: v.id, need: "details", why: nv.requested ? `Waiting for ${b.vendor} to fill in Nickel's bank-details form (sent ${S(nv.requested).slice(0, 10)})` : `${b.vendor} has no bank account or check address in Nickel` }); continue; }
    out.push({ id, vendorId: v.id, need: b.nickel && b.nickel.billId ? "" : "bill", delivery: nv.payout[0].label });
  }
  return { bills: out, payFrom: pf, payers: ps, canPay: ps.includes(email) };
}

/* ====================================================================
   ACTIONS THAT CHANGE NICKEL — each one confirmed by the person in the console
   ==================================================================== */
async function act(op: string, body: Obj, by: string, runId: string): Promise<Obj> {
  const ask = (title: string) => confirmer(runId, by, title);
  const map = await nkMap(), acct = await accounting();

  if (op === "vendor.create") {
    const v = (await vendorsList()).find((x) => x.id === S(body.vendorId)); if (!v) throw new Error("Vendor not found");
    if (((map.vendors || {})[v.id] || {}).id) return { ok: true, already: true };
    const qb = await qbStatus();
    const args: Obj = { name: S(v.name).trim() }; if (isEmail(v.email)) args.emails = [S(v.email).trim()]; if (qb.connected) args.syncToQbo = true;
    const r = await tool("create_vendor", args, ask(`Add ${v.name} to Nickel`));
    if (!r.ok) return refused(r, "Adding the vendor");
    const nid = newId(r.data, "vendorId");
    await saveMap((m) => { m.vendors[v.id] = { ...(m.vendors[v.id] || {}), id: nid, name: args.name, emails: args.emails || [], payout: [], synced: !!args.syncToQbo, checkedAt: new Date().toISOString() }; });
    return { ok: true, nickelId: nid };
  }

  if (op === "vendor.ask") {
    const v = (await vendorsList()).find((x) => x.id === S(body.vendorId)); if (!v) throw new Error("Vendor not found");
    const nv = (map.vendors || {})[v.id]; if (!nv || !nv.id) throw new Error("Add the vendor to Nickel first");
    if (!isEmail(v.email)) throw new Error("Add the vendor's billing email first (Vendors page)");
    const r = await tool("request_vendor_delivery_details", { requests: [{ vendorId: nv.id, emails: [S(v.email).trim()] }] }, ask(`Email ${v.name} Nickel's bank-details form`));
    if (!r.ok) return refused(r, "The request");
    await saveMap((m) => { m.vendors[v.id] = { ...(m.vendors[v.id] || {}), requested: new Date().toISOString() }; });
    return { ok: true };
  }

  if (op === "bill.create") {
    const id = S(body.billId), b = await docData("pm_bill", id); if (!b) throw new Error("Bill not found");
    if (b.nickel && b.nickel.billId) return { ok: true, already: true };
    if (b.status !== "open") throw new Error("Only unpaid bills are added to Nickel");
    const v = vendorOf(await vendorsList(), b), nv = v && (map.vendors || {})[v.id]; if (!nv || !nv.id) throw new Error(`${b.vendor} isn't in Nickel yet`);
    const prop = await docData("pm_property", b.propertyId), pname = S(prop && prop.name);
    const amt = cents(b.amount); if (!(amt > 0)) throw new Error("The bill has no amount");
    const desc = `${pname ? pname + " — " : ""}${b.memo || b.category || "Bill"}`.slice(0, 200);
    const ref = S(b.billNo || "PHD-" + id.replace(/^bl_/, "").slice(-10)).slice(0, 40);
    const args: Obj = { vendorId: nv.id, amountInCents: amt, dueDate: S(b.due || b.date || today()).slice(0, 10), description: desc, invoiceNumber: ref };
    const qb = await qbStatus();
    if (qb.connected && nv.synced && acct.nkExpense) args.lines = { categories: [{ id: acct.nkExpense, amountCents: amt, description: desc }] };
    const r = await tool("create_bill", args, ask(`Add the ${b.vendor} bill to Nickel`));
    if (!r.ok) return refused(r, "Adding the bill");
    let nbid = newId(r.data, "billId");
    if (!nbid) { try { const f = items(await read("search_bills", { invoiceNumbers: [ref] })).find((x) => x.vendorId === nv.id); nbid = f ? f.id : ""; } catch { /* below */ } }
    if (!nbid) throw new Error("Nickel added the bill but didn't say its id. Open it in Nickel to pay it.");
    await updateDoc("pm_bill", id, (x) => { x.nickel = { billId: nbid, ref, at: new Date().toISOString(), by, qb: !!args.lines }; });
    return { ok: true, nickelId: nbid };
  }

  if (op === "bill.pay") {
    if (!(await payers()).includes(by)) throw new Error("You're not on the payments list, so you can't send money.");
    const from = S(body.payFrom), pf = await payFrom(); if (!pf.some((m) => m.id === from)) throw new Error("Pick the account to pay from");
    const vendors = await vendorsList(), rows: Obj[] = [], ids: string[] = [], kinds: string[] = [];
    for (const id of (body.billIds || []).map(S).slice(0, 40)) {
      const b = await docData("pm_bill", id);
      if (!b || b.status !== "open" || !(b.nickel && b.nickel.billId)) continue;   // only unpaid bills already in Nickel
      const v = vendorOf(vendors, b), nv = v && (map.vendors || {})[v.id];
      if (!nv || !nv.id || !(nv.payout || []).length) continue;
      const row: Obj = { billId: b.nickel.billId, vendorId: nv.id, merchantPaymentMethodId: from, vendorPayoutMethodId: nv.payout[0].id };
      if (body.byDue && b.due && b.due > today()) row.arrivalDate = b.due;
      rows.push(row); ids.push(id); kinds.push(nv.payout[0].type === "CHECK" ? "Check" : "ACH");
    }
    if (!rows.length) throw new Error("None of these bills is ready to pay yet");
    const r = await tool("pay_bill", { bills: rows }, ask(`Pay ${rows.length} bill${rows.length === 1 ? "" : "s"}`));
    if (!r.ok) return refused(r, "The payment");
    // read each bill back from Nickel instead of guessing from the answer's shape
    const res = JSON.stringify(r.data || {});
    let paying = 0, approval = 0, failed = 0; const errors: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const nb = rows[i].billId, near = (re: string) => new RegExp(`\\{[^{}]*"billId":"${nb}"[^{}]*${re}[^{}]*\\}|\\{[^{}]*${re}[^{}]*"billId":"${nb}"[^{}]*\\}`).test(res);
      let st: Obj = {}; try { st = (await read("get_bill", { billId: nb })) || {}; } catch { /* keep going */ }
      const moving = ((st.amountScheduled || {}).amountInCents || 0) + ((st.amountPaid || {}).amountInCents || 0) > 0 || S(st.paidStatus).toUpperCase() !== "UNPAID";
      const routed = near(`"routedForApproval":true`);
      const errM = (res.match(new RegExp(`"billId":"${nb}"[^{}]*?"(?:error|message|reason)":"([^"]{3,200})"`)) || [])[1] || "";
      if (!moving && !routed && errM) {
        failed++; errors.push(errM);
        await updateDoc("pm_bill", ids[i], (x) => { x.pay = { ...(x.pay || {}), failed: true, failReason: errM.slice(0, 200), at: new Date().toISOString() }; });
        continue;
      }
      await updateDoc("pm_bill", ids[i], (x) => {
        if (x.status !== "open") return false;
        x.status = S(st.paidStatus).toUpperCase() === "PAID" ? "paid" : "paying";
        x.pay = { method: "Nickel", date: today(), by, at: new Date().toISOString(), delivery: kinds[i], nickel: { billId: nb }, approval: routed, scheduled: rows[i].arrivalDate || "" };
        x.updatedAt = new Date().toISOString(); x.updatedBy = by;
      });
      if (routed) approval++; else paying++;
    }
    return { ok: true, paying, approval, failed, errors };
  }

  if (op === "bill.record") {   // paid outside Nickel: record it there too, so QuickBooks matches
    const id = S(body.billId), b = await docData("pm_bill", id); if (!b || !(b.nickel && b.nickel.billId)) return { ok: true, skipped: true };
    const args: Obj = { billId: b.nickel.billId, amountInCents: cents(b.amount) };
    const d = S((b.pay || {}).date).slice(0, 10); if (d && d < today()) args.paidDate = d;
    const r = await tool("record_bill_payment", args, ask(`Record the ${b.vendor} payment in Nickel`));
    if (!r.ok) return refused(r, "Recording the payment");
    await updateDoc("pm_bill", id, (x) => { x.nickel = { ...(x.nickel || {}), recorded: new Date().toISOString() }; });
    return { ok: true };
  }

  if (op === "owner.create") {
    const o = (await ownersList()).find((x) => x.id === S(body.ownerId)); if (!o) throw new Error("Owner not found");
    if (((map.customers || {})[o.id] || {}).id) return { ok: true, already: true };
    if (!isEmail(o.email)) throw new Error("Add the owner's email first (Owners page)");
    const qb = await qbStatus();
    const args: Obj = { name: S(o.name || o.company).trim() || "Owner", emails: [S(o.email).trim()] }; if (qb.connected) args.syncToQbo = true;
    const r = await tool("create_customer", args, ask(`Add ${args.name} to Nickel`));
    if (!r.ok) return refused(r, "Adding the owner");
    const cid = newId(r.data, "customerId");
    await saveMap((m) => { m.customers[o.id] = { id: cid, name: args.name, emails: args.emails, synced: !!args.syncToQbo }; });
    return { ok: true, nickelId: cid };
  }

  if (op === "invoice.create") {
    const id = S(body.invoiceId), inv = await docData("pm_invoice", id); if (!inv) throw new Error("Invoice not found");
    if (inv.nickel && inv.nickel.invoiceId) return { ok: true, already: true };
    const c = (map.customers || {})[inv.ownerId]; if (!c || !c.id) throw new Error("Add the owner to Nickel first");
    const lines: Obj[] = inv.lines || [];
    const feeC = lines.reduce((a: number, l: Obj) => a + cents(l.fee || 0), 0), total = lines.reduce((a: number, l: Obj) => a + cents(l.amount), 0) + feeC;
    if (!(total > 0)) throw new Error("The invoice is empty");
    const memo = (lines.map((l: Obj) => `${l.property}: ${l.vendor} — ${l.desc} ${money(cents(l.amount))}`).join("; ") + (feeC ? `; Admin fee ${money(feeC)}` : "")).slice(0, 900);
    const args: Obj = { customerId: c.id, invoiceNumber: S(inv.no).slice(0, 21), amountInCents: total, memo };
    if (inv.due) args.dueDate = S(inv.due).slice(0, 10);
    if (inv.date) args.invoiceDate = S(inv.date).slice(0, 10);
    const qb = await qbStatus();
    if (qb.connected && c.synced && acct.nkReimb && (!feeC || acct.nkFee)) {
      const cats = lines.map((l: Obj) => ({ id: acct.nkReimb, amountCents: cents(l.amount), description: `${l.property} · ${l.vendor} — ${l.desc}`.slice(0, 200) }));
      if (feeC) cats.push({ id: acct.nkFee, amountCents: feeC, description: "Admin fee" });
      args.lines = { categories: cats };
    }
    const r = await tool("create_invoice", args, ask(`Create invoice ${inv.no} in Nickel`));
    if (!r.ok) return refused(r, "Creating the invoice");
    const iid = newId(r.data, "invoiceId", "paymentLinkId"); if (!iid) throw new Error("Nickel created the invoice but didn't say its id. Send it from Nickel.");
    const url = S(r.data && r.data.url);
    await updateDoc("pm_invoice", id, (x) => { x.nickel = { invoiceId: iid, url, at: new Date().toISOString(), qb: !!args.lines }; });
    return { ok: true, nickelId: iid };
  }

  if (op === "invoice.send") {
    const id = S(body.invoiceId), inv = await docData("pm_invoice", id); if (!inv || !(inv.nickel && inv.nickel.invoiceId)) throw new Error("Create the invoice in Nickel first");
    const o = (await ownersList()).find((x) => x.id === inv.ownerId);
    const to = (body.emails || []).map((e: unknown) => S(e).trim()).filter(isEmail).slice(0, 5);
    if (!to.length) throw new Error("Add the owner's email");
    const name = S(o && (o.name || o.company));
    const r = await tool("send_invoice", { invoiceId: inv.nickel.invoiceId, recipients: to.map((e: string) => (name ? { email: e, name } : { email: e })) }, ask(`Email invoice ${inv.no}`));
    if (!r.ok) return refused(r, "Sending the invoice");
    let url = S(inv.nickel.url); if (!url) { try { url = S((await read("get_invoice", { invoiceId: inv.nickel.invoiceId }) || {}).url); } catch { /* keep */ } }
    await updateDoc("pm_invoice", id, (x) => { if (x.status === "draft") x.status = "sent"; x.sentAt = new Date().toISOString(); x.sentBy = by; x.sentTo = to.join(", "); x.nickel = { ...(x.nickel || {}), url }; });
    return { ok: true, url };
  }

  throw new Error("Unknown action");
}

/* ====================================================================
   REFRESH: payments that cleared, invoices paid, vendors who sent bank details (read-only)
   ==================================================================== */
async function refresh() {
  if (!TOKEN) return { changed: 0, skipped: "no token" };
  let changed = 0;
  try { await syncMatches(); } catch (_) { /* next time */ }
  const bills = await (await rest("docs?select=id,data&kind=eq.pm_bill&deleted=is.false&data->>status=eq.paying")).json();
  for (const row of bills) {
    const nb = ((row.data.pay || {}).nickel || {}).billId || (row.data.nickel || {}).billId; if (!nb) continue;
    try {
      const st = await read("get_bill", { billId: nb });
      if (S(st && st.paidStatus).toUpperCase() !== "PAID") continue;
      await updateDoc("pm_bill", row.id, (x) => { if (x.status !== "paying") return false; x.status = "paid"; x.pay = { ...(x.pay || {}), date: S(st.paidDate).slice(0, 10) || today(), cleared: true, approval: false }; });
      changed++;
    } catch (_) { /* next hour */ }
  }
  const invs = await (await rest("docs?select=id,data&kind=eq.pm_invoice&deleted=is.false&data->>status=eq.sent")).json();
  for (const row of invs) {
    const iid = (row.data.nickel || {}).invoiceId; if (!iid) continue;
    try {
      const g = await read("get_invoice", { invoiceId: iid });
      const paidC = Number((g && g.amountPaid && g.amountPaid.amountInCents) || 0);
      const viaNk = (x: Obj) => (x.payments || []).filter((p: Obj) => p.by === "Nickel").reduce((a: number, p: Obj) => a + cents(p.amount), 0);
      if (paidC <= viaNk(row.data)) continue;
      await updateDoc("pm_invoice", row.id, (x) => {
        const k = viaNk(x); if (paidC <= k) return false;
        x.payments = (x.payments || []).concat([{ id: "pay_nk_" + Date.now(), amount: (paidC - k) / 100, date: S(g.paidDate).slice(0, 10) || today(), method: "Nickel", by: "Nickel" }]);
        const tot = (x.lines || []).reduce((a: number, l: Obj) => a + cents(l.amount) + cents(l.fee || 0), 0), got = (x.payments || []).reduce((a: number, p: Obj) => a + cents(p.amount), 0);
        if (got >= tot) x.status = "paid";
      });
      changed++;
    } catch (_) { /* next hour */ }
  }
  await saveMap((m) => { m.lastRefresh = new Date().toISOString(); });
  return { changed };
}

/* ====================================================================
   ROUTER
   ==================================================================== */
Deno.serve((req) => ctx.run({ touched: new Set(), session: "", nextId: 1, opened: false }, () => handle(req)));
async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SRV) return json({ error: "SUPABASE_SERVICE_ROLE_KEY isn't available to the function" }, 500);
  try {
    const body = await req.json().catch(() => ({})) as Obj;
    const mode = S(body.mode);
    if (mode === "nickel.refresh" && await isSchedule(req)) return json(await refresh());
    const who = await caller(req);
    if (!who.staff) return json({ error: "Not on the team list" }, 403);
    const done = (r: Obj) => json({ ...r, docs: [...C().touched] });
    switch (mode) {
      case "status": return json(await status(who.email));
      case "nk.lists": return json(await qbLists());
      case "nk.match": return done(await syncMatches());
      case "nk.plan": return done(await plan((body.billIds || []).map(S), who.email));
      case "nk.do": {
        const runId = S(body.runId); if (!/^[A-Za-z0-9_-]{8,64}$/.test(runId)) throw new Error("Missing run id");
        return done(await act(S(body.op), body, who.email, runId));
      }
      case "nk.pending": {
        const raw = await getSetting(pendKey(S(body.runId))); if (!raw) return json({ pending: null });
        const p = JSON.parse(raw); if (p.by !== who.email) return json({ pending: null });
        return json({ pending: { title: p.title, message: p.message, question: p.question, note: p.note, secondsLeft: Math.max(0, Math.round((p.until - Date.now()) / 1000)), answered: !!p.answer } });
      }
      case "nk.answer": {
        const key = pendKey(S(body.runId)), raw = await getSetting(key); if (!raw) return json({ ok: false, error: "That confirmation has expired" });
        const p = JSON.parse(raw); if (p.by !== who.email) return json({ ok: false, error: "Only the person who started this can confirm it" });
        if (!p.answer) { p.answer = body.confirm === true ? "confirm" : "decline"; p.answeredBy = who.email; await setSetting(key, JSON.stringify(p)); }
        return json({ ok: true });
      }
      case "nickel.refresh": return done(await refresh());
      default: return json({ error: "Unknown mode" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e), docs: [...C().touched] }, 200);
  }
}
