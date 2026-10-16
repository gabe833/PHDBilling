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
  // an owner can have several Nickel customers on one email (e.g. "Kenneth Ansin" and an old "3108 Terry Dr").
  // Bill the person: a name that isn't a street address and shares the owner's last name wins.
  const addrLike = (n: string) => /^\s*\d+[A-Za-z]?\s+\S/.test(n);
  const custScore = (x: Obj, o: Obj) => { const n = S(x.name), last = S(o.name).trim().split(/\s+/).pop() || ""; return (addrLike(n) ? 0 : 4) + (last.length > 1 && nkey(n).includes(nkey(last)) ? 2 : 0) + (x.quickBooksSynced ? 1 : 0); };
  for (const o of owners) {
    const cur = (map.customers || {})[o.id] || {};
    const ems = [o.email].concat(S(o.cc).split(/[,;\s]+/)).map((e) => S(e).toLowerCase().trim()).filter(isEmail);
    const c = ncs.filter((x) => (x.emails || []).some((e: string) => ems.includes(S(e).toLowerCase())));
    let nc = cur.created && cur.id ? ncs.find((x) => x.id === cur.id) : null;     // one the console added itself stays
    if (!nc && c.length) nc = c.slice().sort((a, b) => custScore(b, o) - custScore(a, o) || (a.id === cur.id ? -1 : b.id === cur.id ? 1 : 0))[0];
    if (!nc && cur.id) nc = ncs.find((x) => x.id === cur.id) || null;
    if (nc) cOut[o.id] = { id: nc.id, name: S(nc.name), emails: nc.emails || [], synced: !!nc.quickBooksSynced, url: S(nc.dashboardUrl), created: !!(cur.created && cur.id === nc.id),
      onFile: ((nc.paymentMethodsOnFile || []) as Obj[]).map((m) => ({ id: S(m.id), label: [S(m.type || m.kind).replace(/_/g, " ").toLowerCase(), S(m.bankName || m.brand), (m.last4 || m.accountNumberLastFour) ? "····" + S(m.last4 || m.accountNumberLastFour) : ""].filter(Boolean).join(" ") || "Account on file" })),
      ...(cur.autopayAsked ? { autopayAsked: cur.autopayAsked } : {}) };
  }
  // every Nickel vendor (names, emails, address, how they're paid — never bank numbers), so the console can list them
  const all = nvs.map((x) => ({ ...vendorRecord(x), address: S(x.address), city: S(x.city), state: S(x.state), zip: S(x.zip) }));
  const allC = ncs.map((x) => ({ id: x.id, name: S(x.name), emails: x.emails || [], synced: !!x.quickBooksSynced }));
  const counts = { nickelVendors: nvs.length, nickelCustomers: ncs.length, vendorsMatched: Object.values(vOut).filter((x: Obj) => x.id).length, ownersMatched: Object.keys(cOut).length, owners: owners.length };
  await saveMap((m) => { m.vendors = vOut; m.customers = cOut; m.nickelVendors = all; m.nickelCustomers = allC; m.counts = counts; m.matchedAt = new Date().toISOString(); });
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
  const itm = (d: Obj) => ((d && d.items) || []).map((a: Obj) => ({ id: a.id, name: S(a.name), type: S(a.type) })).sort((a: Obj, b: Obj) => a.name.localeCompare(b.name));
  return { expense: acc(ex), revenue: acc(rv), revenueItems: itm(rv) };
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
   PROJECT INVOICES: bill the same Nickel customer as the property's earlier invoices
   ==================================================================== */
const pjPrefix = (number: string) => S(number).trim().toUpperCase().replace(/-\d+$/, "");
async function projCustomer(p: Obj, number: string, map: Obj): Promise<Obj> {
  const prefix = pjPrefix(number), named = (id: string) => S(((map.nickelCustomers || []) as Obj[]).find((x) => x.id === id)?.name);
  if (prefix.length >= 3) {
    try {
      const rows = (await readAll("search_invoices", { query: prefix }, 3))
        .filter((x) => S(x.name).toUpperCase().startsWith(prefix + "-") && S(x.name).toUpperCase() !== S(number).trim().toUpperCase() && S(x.status).toUpperCase() !== "CANCELED" && x.customerId)
        .sort((a, b) => S(b.createdAt).localeCompare(S(a.createdAt)));
      // the customer most of them went to (newest breaks a tie), so one mis-billed invoice doesn't steer the next
      const n: Obj = {}; rows.forEach((x) => { n[x.customerId] = (n[x.customerId] || 0) + 1; });
      if (rows.length) { const r0 = rows.slice().sort((a, b) => n[b.customerId] - n[a.customerId])[0]; return { id: S(r0.customerId), name: named(r0.customerId), synced: !!r0.quickBooksSynced || !!((map.nickelCustomers || []) as Obj[]).find((x) => x.id === r0.customerId && x.synced), from: S(r0.name) }; }
    } catch (_) { /* fall back to the owner's match */ }
  }
  const c = (map.customers || {})[S(p.ownerId)] || {};
  return c.id ? { id: c.id, name: S(c.name), synced: !!c.synced, from: "" } : {};
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
    await updateDoc("pm_bill", id, (x) => { x.nickel = { billId: nbid, ref, at: new Date().toISOString(), by, qb: !!args.lines, sent: { amountC: amt, due: args.dueDate, desc } }; });
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
      const payId = (res.match(new RegExp(`"billId":"${nb}"[^{}]*?"(?:billPaymentId|paymentId)":"([^"]+)"`)) || res.match(new RegExp(`"(?:billPaymentId|paymentId)":"([^"]+)"[^{}]*?"billId":"${nb}"`)) || [])[1] || "";
      const errM = (res.match(new RegExp(`"billId":"${nb}"[^{}]*?"(?:error|message|reason)":"([^"]{3,200})"`)) || [])[1] || "";
      if (!moving && !routed && errM) {
        failed++; errors.push(errM);
        await updateDoc("pm_bill", ids[i], (x) => { x.pay = { ...(x.pay || {}), failed: true, failReason: errM.slice(0, 200), at: new Date().toISOString() }; });
        continue;
      }
      await updateDoc("pm_bill", ids[i], (x) => {
        if (x.status !== "open") return false;
        x.status = S(st.paidStatus).toUpperCase() === "PAID" ? "paid" : "paying";
        x.pay = { method: "Nickel", date: today(), by, at: new Date().toISOString(), delivery: kinds[i], nickel: { billId: nb }, approval: routed, scheduled: rows[i].arrivalDate || "", paymentId: payId };
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
    await saveMap((m) => { m.customers[o.id] = { id: cid, name: args.name, emails: args.emails, synced: !!args.syncToQbo, created: true }; });
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

  /* ---- project side: a locked invoice → Nickel invoice (and QuickBooks through Nickel) + pay link ---- */
  if (op === "project.invoice" || op === "project.send") {
    const pid = S(body.propertyId), key = `${S(body.unitId)}|${Number(body.no) || 0}`;
    const p = await docData("pj_property", pid); if (!p) throw new Error("Project not found");
    const reg = (p.register || {})[key] || {}, fz = reg.frozen, unit = (p.units || []).find((u: Obj) => u.id === S(body.unitId));
    if (!unit) throw new Error("Unit not found");
    if (!fz) throw new Error("Lock the invoice first, so its lines can't change after it's in QuickBooks");
    const label = `${p.name}${(p.units || []).length > 1 ? " · " + unit.name : ""} · Invoice ${Number(body.no)}`;
    if (op === "project.send") {
      const nk = reg.nickel || {}; if (!nk.invoiceId) throw new Error("Create it in Nickel first");
      const o = (await ownersList()).find((x) => x.id === p.ownerId);
      const to = (body.emails || []).map((e: unknown) => S(e).trim()).filter(isEmail).slice(0, 5); if (!to.length) throw new Error("Add the owner's email");
      const name = S(o && (o.name || o.company));
      const r = await tool("send_invoice", { invoiceId: nk.invoiceId, recipients: to.map((e: string) => (name ? { email: e, name } : { email: e })) }, ask(`Email ${label}`));
      if (!r.ok) return refused(r, "Sending the invoice");
      await updateDoc("pj_property", pid, (x) => { const g = x.register[key] = x.register[key] || {}; g.nickel = { ...(g.nickel || {}), sentTo: to.join(", "), sentAt: new Date().toISOString() }; if (!g.dateSent) g.dateSent = today(); });
      return { ok: true };
    }
    if (reg.nickel && reg.nickel.invoiceId) return { ok: true, already: true, url: reg.nickel.url };
    const number0 = S(body.invoiceNumber).replace(/[^A-Za-z0-9 #._\/-]/g, "").trim().slice(0, 21);
    const c = await projCustomer(p, number0, map); if (!c.id) throw new Error("Add the owner to Nickel first");
    const totalC = Number(fz.totalC) || 0, feeC = Number(fz.feeC) || 0, lines: Obj[] = fz.lines || [];
    if (!(totalC > 0)) throw new Error("The invoice total is zero");
    const txn = (id: string) => (p.transactions || []).find((t: Obj) => t.id === id) || {};
    const single = (p.units || []).length <= 1, where = single ? "" : ` — ${unit.name}`;
    const number = number0 || `${unit.name}-${Number(body.no)}`.slice(0, 21);
    // line wording from the console (labels only); amounts always from the locked invoice
    const said: Obj = {}; for (const l of (Array.isArray(body.lines) ? body.lines : [])) if (l && l.txnId) said[S(l.txnId)] = S(l.desc).slice(0, 300);
    const lineText = (l: Obj) => said[l.txnId] || (() => { const t = txn(l.txnId); return `${t.desc || "Project expense"}${t.vendor ? ` (${t.vendor})` : ""}${l.feeApplies === false ? " — billed at cost" : ""}`; })();
    const feeText = `${S(p.feeLabel) || "Project Management Fee"} (${p.feePct}%)${where} — Invoice ${Number(body.no)}`;
    const capTxt = money(Math.round((Number(p.invoiceTarget) || 10000) * 100));
    const memo = S(acct.nkProjMemo || `Invoices will be issued once the accumulated project balance, including the project management fee, reaches {cap}. Any remaining balance will carry forward to the next invoice.\n\nIf you have any questions or concerns, please feel free to reach out via email at billing@phdproperties.realestate or call us at 843-212-6383. Thank you for your business!`).replace(/\{cap\}/g, capTxt).slice(0, 1000);
    const args: Obj = { customerId: c.id, invoiceNumber: number, amountInCents: totalC, memo, invoiceDate: S(fz.at || today()).slice(0, 10) };
    if (/^\d{4}-\d{2}-\d{2}$/.test(S(body.dueDate))) args.dueDate = S(body.dueDate);
    const qb = await qbStatus(); let qbWhy = "";
    // fee product: one named for this fee % (e.g. "10% Project Management Fee") wins over the default
    const feeItem = S((body.feeItem && /^[A-Za-z0-9_-]+$/.test(S(body.feeItem)) ? body.feeItem : "") || acct.nkProjFeeItem);
    const useItems = !!(acct.nkProjItem && (!feeC || feeItem));
    if (!qb.connected) qbWhy = "Nickel isn't connected to QuickBooks";
    else if (!c.synced) qbWhy = "this owner isn't linked to QuickBooks in Nickel";
    else if (!useItems && (!acct.nkProjExp || (feeC && !acct.nkProjFee))) qbWhy = "pick the QuickBooks products for project invoices on Payments setup";
    else {
      const ls = lines.filter((l: Obj) => Number(l.expC));
      if (useItems) {
        const its = ls.map((l: Obj) => ({ id: acct.nkProjItem, quantity: 1, rate: Number(l.expC) / 100, amountCents: Number(l.expC), description: lineText(l).slice(0, 300) }));
        if (feeC) its.push({ id: feeItem, quantity: 1, rate: feeC / 100, amountCents: feeC, description: feeText.slice(0, 300) });
        if (its.reduce((a: number, x: Obj) => a + x.amountCents, 0) !== totalC) qbWhy = "the invoice lines don't add up to its total";
        else args.lines = { items: its };
      } else {
        const cats = ls.map((l: Obj) => ({ id: acct.nkProjExp, amountCents: Number(l.expC), description: lineText(l).slice(0, 200) }));
        if (feeC) cats.push({ id: acct.nkProjFee, amountCents: feeC, description: feeText.slice(0, 200) });
        if (cats.reduce((a: number, x: Obj) => a + x.amountCents, 0) !== totalC) qbWhy = "the invoice lines don't add up to its total";
        else args.lines = { categories: cats };
      }
    }
    if (qbWhy && body.requireQb) return { ok: false, error: `Not created: ${qbWhy}.` };
    const r = await tool("create_invoice", args, ask(`Create ${label} in Nickel${args.lines ? " and QuickBooks" : ""}`));
    if (!r.ok) return refused(r, "Creating the invoice");
    const iid = newId(r.data, "invoiceId", "paymentLinkId"); if (!iid) throw new Error("Nickel created the invoice but didn't say its id. Find it in Nickel.");
    let url = S(r.data && r.data.url); if (!url) { try { url = S((await read("get_invoice", { invoiceId: iid }) || {}).url); } catch { /* shown as missing */ } }
    await updateDoc("pj_property", pid, (x) => { x.register = x.register || {}; const g = x.register[key] = x.register[key] || {}; g.nickel = { invoiceId: iid, url, number, customer: c.name || "", customerId: c.id, amountC: totalC, at: new Date().toISOString(), by, qb: !!args.lines, qbWhy }; if (url && !g.link) g.link = url; });
    return { ok: true, url, qb: !!args.lines, qbWhy };
  }

  /* ---- fixing things after the fact: change, cancel, delete, record, charge, remind ---- */
  if (op === "bill.update" || op === "bill.delete" || op === "bill.cancel") {
    const id = S(body.billId), b = await docData("pm_bill", id); if (!b) throw new Error("Bill not found");
    const nbId = S((b.nickel || {}).billId); if (!nbId) throw new Error("This bill isn't in Nickel");
    if (op === "bill.update") {
      if (b.status !== "open") throw new Error("Only unpaid bills can be changed in Nickel");
      const prop = await docData("pm_property", b.propertyId), pname = S(prop && prop.name);
      const args: Obj = { billId: nbId, amountInCents: cents(b.amount), description: `${pname ? pname + " — " : ""}${b.memo || b.category || "Bill"}`.slice(0, 200) };
      if (/^\d{4}-\d{2}-\d{2}$/.test(day(b.due))) args.dueDate = day(b.due);
      if (b.billNo) args.invoiceNumber = S(b.billNo).slice(0, 40);
      const r = await tool("update_bill", args, ask(`Update the ${b.vendor} bill in Nickel`));
      if (!r.ok) return refused(r, "Updating the bill");
      await patch("pm_bill", id, (x) => { x.nickel = { ...(x.nickel || {}), sent: { amountC: args.amountInCents, due: args.dueDate || "", desc: args.description } }; });
      return { ok: true };
    }
    if (op === "bill.delete") {
      if (b.status === "paid" || b.status === "paying") throw new Error("A paid bill can't be deleted in Nickel");
      const r = await tool("delete_bill", { billId: nbId }, ask(`Delete the ${b.vendor} bill (${money(cents(b.amount))}) in Nickel`));
      if (!r.ok) return refused(r, "Deleting the bill");
      await patch("pm_bill", id, (x) => { x.nickelOld = { ...(x.nickel || {}), deleted: new Date().toISOString() }; delete x.nickel; });
      return { ok: true };
    }
    if (b.status !== "paying") throw new Error("There's no payment in progress to cancel");
    let pid = S((b.pay || {}).scheduledId);
    if (!pid) { try { const nb = await read("get_bill", { billId: nbId }); pid = S((((nb && nb.scheduledPayments) || [])[0] || {}).id); } catch { /* below */ } }
    if (!pid) pid = S((b.pay || {}).paymentId || ((b.pay || {}).receipt || {}).id);
    if (!pid) throw new Error("Couldn't find the payment in Nickel. Cancel it in Nickel's dashboard.");
    const r = await tool("cancel_bill_payment", { billPaymentId: pid }, ask(`Cancel the ${money(cents(b.amount))} payment to ${b.vendor}`));
    if (!r.ok) return refused(r, "Cancelling the payment");
    await patch("pm_bill", id, (x) => { x.status = "open"; x.pay = { canceled: new Date().toISOString(), canceledBy: by }; });
    return { ok: true };
  }

  if (op === "invoice.delete" || op === "invoice.record" || op === "invoice.charge" || op === "invoice.update") {
    const id = S(body.invoiceId), inv = await docData("pm_invoice", id); if (!inv) throw new Error("Invoice not found");
    const iid = S((inv.nickel || {}).invoiceId); if (!iid || (inv.nickel || {}).deleted) throw new Error("This invoice isn't in Nickel");
    if (op === "invoice.delete") {
      const r = await tool("delete_invoice", { invoiceId: iid }, ask(`Delete ${inv.no} in Nickel (its pay link stops working)`));
      if (!r.ok) return refused(r, "Deleting the invoice");
      await patch("pm_invoice", id, (x) => { x.nickel = { ...(x.nickel || {}), deleted: new Date().toISOString() }; });
      return { ok: true };
    }
    if (op === "invoice.update") {
      const args: Obj = { invoiceId: iid }; if (/^\d{4}-\d{2}-\d{2}$/.test(S(body.dueDate))) args.dueDate = S(body.dueDate);
      if (Object.keys(args).length === 1) throw new Error("Nothing to change");
      const r = await tool("update_invoice", args, ask(`Change ${inv.no}'s due date in Nickel`));
      if (!r.ok) return refused(r, "Updating the invoice");
      await patch("pm_invoice", id, (x) => { if (args.dueDate) x.due = args.dueDate; });
      return { ok: true };
    }
    if (op === "invoice.record") {
      const pay = (inv.payments || []).find((p: Obj) => p.id === S(body.paymentId)); if (!pay) throw new Error("Payment not found");
      if (pay.nkExt || pay.nkId) return { ok: true, already: true };
      const g = await read("get_invoice", { invoiceId: iid }), out = cIn(g && g.amountOutstanding); if (!(out > 0)) return { ok: true, already: true };
      const amt = Math.min(cents(pay.amount), out), args: Obj = { invoiceId: iid, amountInCents: amt };
      if (day(pay.date) && day(pay.date) < today()) args.paidDate = day(pay.date);
      const r = await tool("record_invoice_payment", args, ask(`Mark ${inv.no} paid in Nickel: ${money(amt)} by ${pay.method || "check"}`));
      if (!r.ok) return refused(r, "Recording the payment");
      const ext = newId(r.data, "externalPaymentId") || "recorded";
      await patch("pm_invoice", id, (x) => { const p2 = (x.payments || []).find((p: Obj) => p.id === pay.id); if (p2) p2.nkExt = ext; });
      return { ok: true };
    }
    const c = (map.customers || {})[S(inv.ownerId)] || {}, cust = c.id ? await read("get_customer", { customerId: c.id }) : null;
    const m = ((cust && cust.paymentMethodsOnFile) || []).find((x: Obj) => x.id === S(body.methodId)); if (!m) throw new Error("That payment method isn't on file in Nickel");
    const r = await tool("charge_payment_methods_on_file", { charges: [{ paymentMethodOnFileId: m.id, invoiceId: iid }] }, ask(`Charge ${inv.no} to the owner's account on file`));
    if (!r.ok) return refused(r, "The charge");
    await syncPmInvoice(id, (await docData("pm_invoice", id)) || inv, { left: 6 });
    return { ok: true };
  }

  if (op === "project.delete" || op === "project.record" || op === "project.charge") {
    const pid = S(body.propertyId), key = `${S(body.unitId)}|${Number(body.no) || 0}`;
    const p = await docData("pj_property", pid); if (!p) throw new Error("Project not found");
    const g = (p.register || {})[key] || {}, nk = g.nickel || {}; if (!nk.invoiceId) throw new Error("This invoice isn't in Nickel");
    const name = nk.number || `${p.name} invoice ${Number(body.no)}`;
    if (op === "project.delete") {
      const r = await tool("delete_invoice", { invoiceId: nk.invoiceId }, ask(`Delete ${name} in Nickel (and QuickBooks, through Nickel)`));
      if (!r.ok) return refused(r, "Deleting the invoice");
      await patch("pj_property", pid, (x) => { const r2 = (x.register || {})[key]; if (!r2) return; r2.nickelOld = { ...(r2.nickel || {}), deleted: new Date().toISOString() }; if (r2.link && r2.nickel && r2.link === r2.nickel.url) delete r2.link; delete r2.nickel; });
      return { ok: true };
    }
    const inv = await read("get_invoice", { invoiceId: nk.invoiceId }), out = cIn(inv && inv.amountOutstanding);
    if (!(out > 0)) return { ok: true, already: true };
    if (op === "project.record") {
      const args: Obj = { invoiceId: nk.invoiceId, amountInCents: out };
      if (/^\d{4}-\d{2}-\d{2}$/.test(S(g.datePaid)) && S(g.datePaid) < today()) args.paidDate = S(g.datePaid);
      const r = await tool("record_invoice_payment", args, ask(`Mark ${name} paid in Nickel: ${money(out)}${g.ref ? " (" + S(g.ref).slice(0, 40) + ")" : ""}`));
      if (!r.ok) return refused(r, "Recording the payment");
    } else {
      const cust = await read("get_customer", { customerId: S(inv.customerId) });
      const m = ((cust && cust.paymentMethodsOnFile) || []).find((x: Obj) => x.id === S(body.methodId)); if (!m) throw new Error("That payment method isn't on file in Nickel");
      const r = await tool("charge_payment_methods_on_file", { charges: [{ paymentMethodOnFileId: m.id, invoiceId: nk.invoiceId }] }, ask(`Charge ${name} (${money(out)}) to the owner's account on file`));
      if (!r.ok) return refused(r, "The charge");
    }
    const fresh = await docData("pj_property", pid); await syncProject(pid, key, ((fresh && fresh.register) || {})[key] || g, { left: 6 });
    return { ok: true };
  }

  if (op === "owner.autopay") {
    const o = (await ownersList()).find((x) => x.id === S(body.ownerId)); if (!o) throw new Error("Owner not found");
    const c = (map.customers || {})[o.id]; if (!c || !c.id) throw new Error("Add the owner to Nickel first");
    const to = ((body.emails || []) as unknown[]).map((e) => S(e).trim()).filter(isEmail).slice(0, 5); if (!to.length && isEmail(o.email)) to.push(S(o.email).trim());
    if (!to.length) throw new Error("Add the owner's email");
    const req: Obj = { customerId: c.id, emails: to }; if (S(body.memo).trim()) req.memo = S(body.memo).trim().slice(0, 240);
    const r = await tool("request_payment_method_on_file", { requests: [req] }, ask(`Email ${S(o.name || o.company)} Nickel's form to put a bank account on file`));
    if (!r.ok) return refused(r, "The request");
    await saveMap((m) => { m.customers[o.id] = { ...(m.customers[o.id] || {}), autopayAsked: new Date().toISOString() }; });
    return { ok: true };
  }

  if (op === "vendor.update") {
    const v = (await vendorsList()).find((x) => x.id === S(body.vendorId)); if (!v) throw new Error("Vendor not found");
    const nv = (map.vendors || {})[v.id]; if (!nv || !nv.id) throw new Error("Add the vendor to Nickel first");
    const cur = ((map.nickelVendors || []) as Obj[]).find((x) => x.id === nv.id) || nv, low = (e: unknown) => S(e).trim().toLowerCase();
    const args: Obj = { vendorId: nv.id };
    if (S(v.name).trim() && S(v.name).trim() !== S(cur.name)) args.name = S(v.name).trim();
    if (isEmail(v.email) && !(cur.emails || []).map(low).includes(low(v.email))) args.emails = [...(cur.emails || []).filter(isEmail), S(v.email).trim()];
    if (S(v.address).trim() && S(v.city).trim() && S(v.state).trim() && /^\d{5}$/.test(S(v.zip).trim()) && [["address", "address"], ["city", "city"], ["state", "state"], ["zip", "zip"]].some(([a, k]) => low(v[a]) !== low(cur[k])))
      Object.assign(args, { street: S(v.address).trim(), city: S(v.city).trim(), state: S(v.state).trim(), zip: S(v.zip).trim() });
    if (Object.keys(args).length === 1) return { ok: true, already: true, nothing: true };
    const r = await tool("update_vendor", args, ask(`Update ${v.name} in Nickel`));
    if (!r.ok) return refused(r, "Updating the vendor");
    await saveMap((m) => { const x = m.vendors[v.id]; if (x) { if (args.name) x.name = args.name; if (args.emails) x.emails = args.emails; }
      const y = ((m.nickelVendors || []) as Obj[]).find((z) => z.id === nv.id); if (y) { if (args.name) y.name = args.name; if (args.emails) y.emails = args.emails; if (args.street) Object.assign(y, { address: args.street, city: args.city, state: args.state, zip: args.zip }); } });
    return { ok: true };
  }

  if (op === "deposit.apply") {
    const transferId = S(body.transferId), amt = Math.round(Number(body.amountC) || 0);
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(transferId) || !(amt > 0)) throw new Error("Pick the check and the amount");
    let iid = "", label = "", after: () => Promise<unknown> = async () => {};
    if (body.kind === "pm") {
      const id = S(body.invoiceId), inv = await docData("pm_invoice", id); iid = S(inv && inv.nickel && inv.nickel.invoiceId); label = S(inv && inv.no);
      after = async () => syncPmInvoice(id, (await docData("pm_invoice", id)) || inv || {}, { left: 6 });
    } else {
      const pid = S(body.propertyId), key = `${S(body.unitId)}|${Number(body.no) || 0}`, p = await docData("pj_property", pid), g = p && (p.register || {})[key];
      iid = S(g && g.nickel && g.nickel.invoiceId); label = S(g && g.nickel && g.nickel.number) || `${S(p && p.name)} invoice ${Number(body.no)}`;
      after = async () => { const f = await docData("pj_property", pid); return syncProject(pid, key, ((f && f.register) || {})[key], { left: 6 }); };
    }
    if (!iid) throw new Error("That invoice isn't in Nickel");
    const r = await tool("apply_check_deposit_to_invoice", { transferId, invoiceId: iid, amountInCents: amt }, ask(`Apply ${money(amt)} from the deposited check to ${label}`));
    if (!r.ok) return refused(r, "Applying the check");
    await after();
    return { ok: true };
  }

  /* ---- project expenses: bill a vendor in Nickel and pay it, from the transaction ---- */
  if (op === "txn.bill" || op === "txn.pay") {
    const pid = S(body.propertyId), tid = S(body.txnId), p = await docData("pj_property", pid); if (!p) throw new Error("Project not found");
    const t = (p.transactions || []).find((x: Obj) => x.id === tid); if (!t) throw new Error("Transaction not found");
    const amt = cents(t.amount); if (!(amt > 0)) throw new Error("The expense has no amount");
    const setTxn = (fn: (x: Obj) => void) => patch("pj_property", pid, (x) => { const y = (x.transactions || []).find((z: Obj) => z.id === tid); if (y) fn(y); });
    if (op === "txn.bill") {
      if (t.nickelBill && t.nickelBill.billId) return { ok: true, already: true };
      const nvId = S(body.nickelVendorId), nv = ((map.nickelVendors || []) as Obj[]).find((x) => x.id === nvId); if (!nv) throw new Error("Pick the vendor in Nickel");
      const m = S(p.name).match(/^\s*(\d+)\s+([A-Za-z]+)/), ref = S(body.ref).trim().slice(0, 40) || (m ? `${m[1]} ${m[2]}`.toUpperCase() : S(p.name).toUpperCase().slice(0, 30));
      const desc = `${S(p.name)} — ${S(t.desc || "Project expense")}`.slice(0, 200);
      const due = /^\d{4}-\d{2}-\d{2}$/.test(S(body.dueDate)) ? S(body.dueDate) : today();
      const args: Obj = { vendorId: nv.id, amountInCents: amt, dueDate: due, description: desc, invoiceNumber: ref };
      const qb = await qbStatus();
      if (qb.connected && nv.synced && acct.nkProjBillExp) args.lines = { categories: [{ id: acct.nkProjBillExp, amountCents: amt, description: desc }] };
      const r = await tool("create_bill", args, ask(`Add the ${nv.name} bill (${money(amt)}) to Nickel`));
      if (!r.ok) return refused(r, "Adding the bill");
      let nbid = newId(r.data, "billId");
      if (!nbid) { try { const f = items(await read("search_bills", { invoiceNumbers: [ref] })).find((x) => x.vendorId === nv.id && Number(x.amountInCents) === amt); nbid = f ? f.id : ""; } catch { /* below */ } }
      if (!nbid) throw new Error("Nickel added the bill but didn't say its id. Pay it in Nickel.");
      await setTxn((y) => { y.nickelBill = { billId: nbid, vendorId: nv.id, vendor: S(nv.name), ref, at: new Date().toISOString(), by, qb: !!args.lines }; });
      return { ok: true, nickelId: nbid };
    }
    if (!(await payers()).includes(by)) throw new Error("You're not on the payments list, so you can't send money.");
    const nb = t.nickelBill || {}; if (!nb.billId) throw new Error("Add the bill to Nickel first");
    if (t.nickelPay && t.nickelPay.id && !t.nickelPay.dismissed) return { ok: true, already: true };
    const from = S(body.payFrom), pf = await payFrom(); if (!pf.some((x) => x.id === from)) throw new Error("Pick the account to pay from");
    const nv = ((map.nickelVendors || []) as Obj[]).find((x) => x.id === nb.vendorId); if (!nv || !(nv.payout || []).length) throw new Error(`${S(nb.vendor) || "The vendor"} has no bank account or check address in Nickel`);
    const row: Obj = { billId: nb.billId, vendorId: nv.id, merchantPaymentMethodId: from, vendorPayoutMethodId: nv.payout[0].id };
    if (/^\d{4}-\d{2}-\d{2}$/.test(S(body.arrivalDate)) && S(body.arrivalDate) > today()) row.arrivalDate = S(body.arrivalDate);
    const r = await tool("pay_bill", { bills: [row] }, ask(`Pay ${S(nv.name)} ${money(amt)} (${S(p.name)})`));
    if (!r.ok) return refused(r, "The payment");
    const res = JSON.stringify(r.data || {});
    const payId = (res.match(/"(?:billPaymentId|paymentId)":"([^"]+)"/) || [])[1] || "";
    const errM = (res.match(/"(?:error|reason)":"([^"]{3,200})"/) || [])[1] || "";
    if (!payId && errM) { await setTxn((y) => { y.nickelBill = { ...(y.nickelBill || {}), failed: errM.slice(0, 200) }; }); return { ok: false, error: `Nickel didn't send it: ${errM}` }; }
    const info = payId ? await billPaymentInfo(payId) : null;
    await setTxn((y) => {
      y.nickelBill = { ...(y.nickelBill || {}), paymentId: payId, paidAt: new Date().toISOString(), paidBy: by, scheduled: row.arrivalDate || "" };
      y.nickelPay = { id: payId, url: S(info && info.url), link: S(info && info.link), date: today(), to: S(nv.name), status: S((info && info.delivery) || "PROCESSING"), bill: nb.ref || "" };
      if (!S(y.link).trim() && info && info.url) { y.link = info.url; y.linkFromNickel = true; }
    });
    return { ok: true, paymentId: payId };
  }

  throw new Error("Unknown action");
}

/* ====================================================================
   SYNC (read-only in Nickel): paid status, payments and their receipts
   ==================================================================== */
const cIn = (m: any) => Number((m && m.amountInCents) || 0);
const day = (s: unknown) => S(s).slice(0, 10);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Budget = { left: number };
const spend = (b: Budget) => b.left-- > 0;
// change a record only when something really changed (keeps versions quiet)
async function patch(kind: string, id: string, fn: (x: Obj) => void): Promise<boolean> {
  let changed = false;
  await updateDoc(kind, id, (x) => { const before = JSON.stringify(x); fn(x); changed = JSON.stringify(x) !== before; return changed ? undefined : false; });
  return changed;
}
// Nickel's receipt for a vendor payment (a PDF anyone with the link can open), with delivery status
async function billPaymentInfo(id: string): Promise<Obj | null> {
  try {
    const p = await read("get_bill_payment", { billPaymentId: id }); if (!p) return null;
    const d = p.delivery || {}, st = S(d.status || p.status).toUpperCase();
    return { id, url: S(p.pdfUrl), link: S(p.dashboardUrl), amountC: cIn(p), method: S(p.deliveryMethod), delivery: st, eta: day(d.estimatedArrivalDate), deliveredAt: day(d.settledAt), failed: S(p.failureReason || d.failureReason), final: ["DEPOSITED", "FAILED", "RETURNED", "CANCELLED", "CANCELED"].includes(st) };
  } catch { return null; }
}
// find the payment Nickel sent for a bill when the console didn't keep its id (paid in Nickel's dashboard)
async function findBillPayment(nb: Obj): Promise<string> {
  try {
    const rows = items(await read("search_payment_activities", { source: "PAYABLE", customerName: S(nb.vendorName).slice(0, 60), pageSize: 40 }));
    const ref = S(nb.reference || nb.invoiceNumber).toUpperCase(), amt = cIn(nb.amountPaid) || cIn(nb);
    const hit = rows.filter((r) => r.entityId && Number(r.amountInCents) === amt && !/CANCEL|FAIL|REJECT/i.test(S(r.status)))
      .sort((a, b) => (S(b.billNumber).toUpperCase() === ref ? 1 : 0) - (S(a.billNumber).toUpperCase() === ref ? 1 : 0) || S(b.createdAt).localeCompare(S(a.createdAt)))[0];
    return hit ? S(hit.entityId) : "";
  } catch { return ""; }
}
async function syncBill(id: string, b: Obj, bud: Budget): Promise<boolean> {
  const nbId = S((b.nickel || {}).billId); if (!nbId || !spend(bud)) return false;
  let nb: Obj; try { nb = (await read("get_bill", { billId: nbId })) || {}; } catch { return false; }
  const ps = S(nb.paidStatus).toUpperCase(), sched = (nb.scheduledPayments || [])[0] || null;
  const extC = (nb.externalPayments || []).reduce((a: number, e: Obj) => a + cIn(e.amount || e), 0), paidC = cIn(nb.amountPaid);
  const viaNickel = paidC > extC || !!sched;
  let rc: Obj | null = (b.pay || {}).receipt || null;
  if ((ps === "PAID" || ps === "PARTIALLY_PAID" || paidC > 0) && viaNickel && !(rc && rc.final) && spend(bud)) {
    const pid = S((b.pay || {}).paymentId || (rc && rc.id)) || await findBillPayment(nb);
    if (pid) rc = (await billPaymentInfo(pid)) || rc;
  }
  return patch("pm_bill", id, (x) => {
    if (x.status === "void") return;
    x.pay = x.pay || null;
    if (ps === "PAID") {
      if (x.status !== "paid") { x.status = "paid"; x.pay = { ...(x.pay || {}), method: viaNickel ? "Nickel" : (x.pay && x.pay.method) || "Recorded in Nickel", date: day(nb.paidDate) || today(), by: (x.pay && x.pay.by) || "Nickel", approval: false }; }
      else if (viaNickel && x.pay && x.pay.method === "Nickel" && nb.paidDate) x.pay.date = day(nb.paidDate);
    } else if (sched || ps === "SCHEDULED") {
      if (x.status === "open") x.status = "paying";
      if (x.status === "paying") x.pay = { ...(x.pay || {}), method: "Nickel", by: (x.pay && x.pay.by) || "Nickel", date: (x.pay && x.pay.date) || today(), scheduled: day(sched && (sched.estimatedArrivalDate || sched.withdrawalDate)) || (x.pay && x.pay.scheduled) || "", scheduledId: S(sched && sched.id) || (x.pay && x.pay.scheduledId) || "" };
    } else if (ps === "UNPAID" && x.status === "paying" && paidC === 0 && x.pay && Date.now() - Date.parse(x.pay.at || x.updatedAt || 0) > 36e5 && !(rc && !rc.final && !rc.failed)) {
      x.status = "open"; x.pay = { ...(x.pay || {}), canceled: true };     // cancelled or failed in Nickel: back to To pay
    }
    if (rc) { x.pay = x.pay || {}; x.pay.receipt = rc; if (rc.failed && x.status === "paying") { x.status = "open"; x.pay.failed = true; x.pay.failReason = rc.failed; } }
    if (S((x.nickel || {}).status) !== ps) x.nickel = { ...(x.nickel || {}), status: ps };
  });
}
// every payment Nickel holds for an invoice, with the receipt for each one paid through Nickel
async function invoicePayments(g: Obj, prior: Obj[], bud: Budget): Promise<Obj[]> {
  const out: Obj[] = [];
  for (const p of (g.payments || [])) {
    const st = S(p.status).toUpperCase(); if (/FAIL|CANCEL|REFUNDED/.test(st)) continue;
    const old = (prior || []).find((x) => x.id === p.id) || {};
    let url = S(old.url), link = S(old.link), disb = S(old.disbursement);
    if ((!url || disb !== "DEPOSITED") && spend(bud)) { try { const d = await read("get_payment", { paymentId: p.id }); url = S(d && d.pdfUrl) || url; link = S(d && d.dashboardUrl) || link; disb = S(d && d.disbursement && d.disbursement.status).toUpperCase() || disb; } catch { /* next hour */ } }
    out.push({ id: S(p.id), amountC: cIn(p), date: day(p.createdAt), method: S(p.method).toLowerCase() === "ach" ? "Nickel · bank (ACH)" : S(p.method).toLowerCase() === "card" ? "Nickel · card" : "Nickel" + (p.method ? " · " + S(p.method) : ""), status: st, url, link, disbursement: disb });
  }
  for (const e of (g.externalPayments || [])) out.push({ id: S(e.id), external: true, amountC: cIn(e.amount || e), date: day(e.paidDate || e.createdAt), method: "Recorded in Nickel", status: "RECORDED" });
  return out;
}
async function syncPmInvoice(id: string, inv: Obj, bud: Budget): Promise<boolean> {
  const iid = S((inv.nickel || {}).invoiceId); if (!iid || (inv.nickel || {}).deleted || !spend(bud)) return false;
  let g: Obj; try { g = (await read("get_invoice", { invoiceId: iid })) || {}; } catch { return false; }
  const pays = await invoicePayments(g, (inv.nickel || {}).payments || [], bud);
  return patch("pm_invoice", id, (x) => {
    const nk = x.nickel = { ...(x.nickel || {}) };
    nk.payments = pays; nk.status = S(g.status).toUpperCase(); nk.paidC = cIn(g.amountPaid); nk.outstandingC = cIn(g.amountOutstanding);
    if (g.url && !nk.url) nk.url = S(g.url);
    if (nk.status === "CANCELED") nk.canceled = true; else delete nk.canceled;
    // the invoice's payments here: what was entered by hand stays; Nickel's own are listed once each
    const keep = (x.payments || []).filter((p: Obj) => !(p.by === "Nickel" && (p.nkId || /^pay_nk_/.test(S(p.id)) || p.nkExt)));
    for (const p of pays) {
      if (p.external) { const mine = keep.find((k: Obj) => k.nkExt === p.id) || keep.find((k: Obj) => k.nkExt === "recorded" && cents(k.amount) === p.amountC) || keep.find((k: Obj) => !k.nkExt && !k.nkId && cents(k.amount) === p.amountC); if (mine) { mine.nkExt = p.id; continue; } }
      keep.push({ id: (p.external ? "nkx_" : "nk_") + p.id, [p.external ? "nkExt" : "nkId"]: p.id, amount: p.amountC / 100, date: p.date || today(), method: p.method, by: "Nickel", receipt: p.url || "", pending: !p.external && p.status !== "SUCCEEDED" });
    }
    x.payments = keep;
    const tot = (x.lines || []).reduce((a: number, l: Obj) => a + cents(l.amount) + cents(l.fee || 0), 0), got = keep.reduce((a: number, p: Obj) => a + cents(p.amount), 0);
    if (x.status === "draft" && pays.length) x.status = "sent";
    if (x.status === "sent" && tot > 0 && got >= tot) x.status = "paid";
  });
}
async function syncProject(pid: string, key: string, gIn: Obj, bud: Budget): Promise<boolean> {
  const iid = S(gIn && gIn.nickel && gIn.nickel.invoiceId); if (!iid || !spend(bud)) return false;
  let inv: Obj; try { inv = (await read("get_invoice", { invoiceId: iid })) || {}; } catch { return false; }
  const pays = await invoicePayments(inv, gIn.nickel.payments || [], bud);
  const paidC = cIn(inv.amountPaid), outC = cIn(inv.amountOutstanding), stN = S(inv.status).toUpperCase();
  return patch("pj_property", pid, (x) => {
    const r2 = (x.register || {})[key]; if (!r2 || !r2.nickel || r2.nickel.invoiceId !== iid) return;
    const nk = r2.nickel; nk.payments = pays; nk.paidC = paidC; nk.outstandingC = outC; nk.status = stN; if (inv.url && !nk.url) nk.url = S(inv.url);
    if (stN === "CANCELED") nk.canceled = true; else delete nk.canceled;
    if (paidC > 0 && outC === 0) {
      if (!r2.paid) { r2.paid = true; r2.datePaid = day(inv.paidDate) || today(); }
      if (!r2.ref) { const m = pays.filter((p) => !p.external).length ? pays.find((p) => !p.external)!.method.replace("Nickel · ", "Nickel ") : "Recorded in Nickel"; r2.ref = m; }
      nk.done = pays.every((p) => p.external || (p.url && p.disbursement === "DEPOSITED")) || undefined;
    }
    nk.openInNickel = r2.paid && outC > 0 ? outC : undefined;
    for (const k of Object.keys(nk)) if (nk[k] === undefined) delete nk[k];
    if (r2.link === undefined && nk.url) r2.link = nk.url;
  });
}
// console bills that are already in Nickel (added there by hand): link them when vendor and amount match exactly one
async function linkBills(bud: Budget, map: Obj): Promise<number> {
  const rows = await (await rest("docs?select=id,data&kind=eq.pm_bill&deleted=is.false&data->>status=eq.open")).json();
  const all = await (await rest("docs?select=id,data&kind=eq.pm_bill&deleted=is.false")).json();
  const taken = new Set(all.map((r: Obj) => S((r.data.nickel || {}).billId)).filter(Boolean)), vendors = await vendorsList();
  let n = 0;
  for (const row of rows) {
    const b = row.data; if ((b.nickel || {}).billId || b.nickelTried === today()) continue;
    const v = vendorOf(vendors, b), nv = v && (map.vendors || {})[v.id]; if (!nv || !nv.id) continue;
    if (!spend(bud)) break;
    const amt = cents(b.amount);
    let found: Obj[] = []; try { found = items(await read("search_bills", { vendorName: S(nv.name).slice(0, 60), minAmountInCents: amt, maxAmountInCents: amt, pageSize: 10 })).filter((x) => x.vendorId === nv.id && !taken.has(S(x.id))); } catch { continue; }
    if (found.length === 1) { taken.add(found[0].id); n++; await patch("pm_bill", row.id, (x) => { x.nickel = { billId: S(found[0].id), ref: S(found[0].reference || found[0].invoiceNumber), linked: true, at: new Date().toISOString() }; }); }
    else await patch("pm_bill", row.id, (x) => { x.nickelTried = today(); });
  }
  return n;
}
// project expenses PHD paid through Nickel: attach Nickel's payment receipt to the matching transaction
// (same amount, within 45 days, and the vendor or the property named on the Nickel bill). Read-only in Nickel.
async function projExpenses(bud: Budget): Promise<number> {
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10), acts: Obj[] = [];
  for (let page = 1; page <= 4; page++) {
    let d: Obj; try { d = await read("search_payment_activities", { source: "PAYABLE", startDate: since, endDate: today(), page, pageSize: 100 }); } catch { break; }
    acts.push(...items(d).filter((r) => r.entityId && !/CANCEL|FAIL|REJECT|RETURN/i.test(S(r.status))));
    if (!d || !d.hasMore) break;
  }

  const projs = await (await rest("docs?select=id,data&kind=eq.pj_property&deleted=is.false")).json();
  const used = new Set<string>(); for (const row of projs) for (const t of (row.data.transactions || [])) if (t && t.nickelPay && t.nickelPay.id) used.add(S(t.nickelPay.id));
  const placeKey = (name: string) => { const m = S(name).match(/^\s*(\d+)\s+([A-Za-z]+)/); return m ? nkey(m[1] + m[2]) : ""; };
  let n = 0;
  for (const row of projs) {
    const pk = placeKey(row.data.name), found: Obj = {}, upd: Obj = {};
    for (const t of (row.data.transactions || [])) {
      const n = t && t.nickelPay; if (!n || !n.id || n.dismissed || (n.url && /DEPOSITED|FAILED|RETURNED|CANCEL/.test(S(n.status)))) continue;
      if (!spend(bud)) break;
      const info = await billPaymentInfo(S(n.id)); if (info) upd[t.id] = { url: info.url || S(n.url), link: info.link || S(n.link), status: S(info.delivery) };
    }
    for (const t of (row.data.transactions || [])) {
      if (!t || !t.id || (t.nickelPay && t.nickelPay.id) || t.deleted || !(Number(t.amount) > 0) || !t.date) continue;
      const amt = cents(t.amount), tDay = Date.parse(S(t.date)); if (!(tDay > Date.now() - 130 * 864e5)) continue;
      const v = nkey(t.vendor);
      const hits = acts.filter((a) => Number(a.amountInCents) === amt && !used.has(S(a.entityId)) && Math.abs(Date.parse(S(a.createdAt)) - tDay) <= 45 * 864e5 && (() => {
        const who = nkey(a.counterpartyName), what = nkey(S(a.billNumber) + " " + S(a.billReason) + " " + S(a.description));
        return (v.length > 2 && who && (who.includes(v) || v.includes(who))) || (pk.length > 3 && what.includes(pk));
      })());
      if (hits.length !== 1) continue;
      const a = hits[0]; used.add(S(a.entityId));
      const info = spend(bud) ? await billPaymentInfo(S(a.entityId)) : null;
      found[t.id] = { id: S(a.entityId), url: S(info && info.url), link: S(a.dashboardUrl), date: day(a.createdAt), to: S(a.counterpartyName), status: S((info && info.delivery) || a.status).toUpperCase(), bill: S(a.billNumber) };
    }
    if (Object.keys(upd).length && await patch("pj_property", row.id, (x) => { for (const t of (x.transactions || [])) { const u = upd[t.id]; if (u && t.nickelPay && t.nickelPay.id) { Object.assign(t.nickelPay, u); if (!S(t.link).trim() && u.url) { t.link = u.url; t.linkFromNickel = true; } } } })) n += Object.keys(upd).length;
    if (!Object.keys(found).length) continue;
    if (await patch("pj_property", row.id, (x) => { for (const t of (x.transactions || [])) { const f = found[t.id]; if (f && !(t.nickelPay && t.nickelPay.id)) { t.nickelPay = f; if (!S(t.link).trim() && f.url) { t.link = f.url; t.linkFromNickel = true; } } } })) n += Object.keys(found).length;
  }
  return n;
}
// project invoices made by hand in Nickel: link them by number every hour (same numbering as the console:
// 3282HARTWELL-006 · 120SMITH-B-001), so nobody has to open the invoice for its status to come in
const PJ_STREET = /\b(st|street|dr|drive|rd|road|ave|avenue|ln|lane|blvd|boulevard|ct|court|way|pl|place|cir|circle|hwy|highway|pkwy|parkway|ter|terrace|trl|trail)\b\.?/gi;
function pjNumber(p: Obj, unit: Obj, no: number): string {
  const base = (S(p.qbPrefix) || S(p.name).replace(PJ_STREET, "")).toUpperCase().replace(/[^A-Z0-9]/g, "") || "INV";
  const u = (p.units || []).length > 1 ? S(unit.name).replace(/^unit\s*/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  const tail = `${u ? "-" + u : ""}-${String(no).padStart(3, "0")}`;
  return base.slice(0, 21 - tail.length) + tail;
}
async function linkAllProjects(): Promise<number> {
  const projs = await (await rest("docs?select=id,data&kind=eq.pj_property&deleted=is.false")).json();
  let n = 0;
  for (const row of projs) {
    const p = row.data, items: Obj[] = [];
    for (const [key, g] of Object.entries((p.register || {}) as Obj)) {
      if (!g || (g.nickel && g.nickel.invoiceId) || !(g.frozen || g.dateSent || g.paid || g.lock)) continue;
      const [unitId, noS] = key.split("|"), unit = (p.units || []).find((u: Obj) => u.id === unitId), no = Number(noS);
      if (unit && no > 0) items.push({ unitId, no, number: pjNumber(p, unit, no) });
    }
    if (!items.length) continue;
    try { n += (await linkProject({ propertyId: row.id, items })).linked || 0; } catch (_) { /* next hour */ }
  }
  return n;
}
// What Nickel's payment tools accept (tool names, descriptions and option lists — no data), saved once a day,
// so the console can offer the choices Nickel supports (for example how fast a payment goes out).
async function saveToolSchemas() {
  const last = Number(await getSetting("nk_tools_at") || 0);
  if (Date.now() - last < 20 * 3600e3) return;
  await open();
  const all: Obj[] = []; let cursor = "";
  for (let i = 0; i < 10; i++) {
    const res = await rpc("tools/list", cursor ? { cursor } : {});
    all.push(...((res.tools as Obj[]) || []));
    cursor = S(res.nextCursor); if (!cursor) break;
  }
  const keep = all.filter((t) => /bill|pay|vendor/i.test(S(t.name))).map((t) => ({ name: S(t.name), description: S(t.description).slice(0, 2000), input: t.inputSchema || null }));
  await setSetting("nk_tools", JSON.stringify({ at: new Date().toISOString(), names: all.map((t) => S(t.name)), tools: keep }));
  await setSetting("nk_tools_at", String(Date.now()));
}
/* ---- owner payouts paid in Nickel ----
   The office pays owners as Nickel bills. Two ways they're found and recorded on a property's month:
   1. One bill per property, numbered OWN-<year>-<month>-<property> (OWN-2026-10-228MORNIN, OWN-2026-10-342KING-A).
   2. Several bills paying several properties together — an owner with more than one property, or a couple paid
      separately plus a joint account (Susan, Stephen and their joint account for 12 Bee #D, 31 and 90 Radcliffe).
      Bills to the same owners are grouped with those owners' properties, and the payouts are recorded only when
      the bills add up exactly to what those properties' owners are owed for the month.
   A payout recorded by hand in the console is never overwritten; one taken from MagicDoor is replaced, because
   the payout actually went out from Nickel. A payout Nickel shows as pending says so, and a stopped one comes off. */
const alnum = (x: unknown) => S(x).toUpperCase().replace(/[^A-Z0-9]/g, "");
const cAmt = (b: Obj) => { for (const k of ["amountInCents", "totalAmountInCents", "amountCents", "totalInCents"]) if (b[k] != null && !isNaN(Number(b[k]))) return Math.round(Number(b[k])); for (const k of ["amount", "totalAmount", "total"]) if (b[k] != null && !isNaN(Number(b[k]))) return Math.round(Number(b[k]) * 100); return 0; };
const refOf = (b: Obj) => S(b.invoiceNumber || b.billNumber || b.reference).toUpperCase();
const OWN_RE = /^OWN-(\d{4})-(\d{2})-(.+)$/;
const STREET_WORDS = /\b(N|S|E|W|NE|NW|SE|SW|NORTH|SOUTH|EAST|WEST|ST|STREET|AVE|AVENUE|DR|DRIVE|RD|ROAD|BLVD|BOULEVARD|LN|LANE|CT|COURT|CIR|CIRCLE|WAY|PL|PLACE|PKWY|HWY|UNIT|APT|SUITE)\b\.?/gi;
// a property's name as the office abbreviates it: "140 W Mariners Cay Dr" → 140WMARINERSCAYDR, 140MARINERSCAY…; "342 King St #A" → 342KINGA
const nameForms = (t: unknown) => { const x = String(t || "").split(",")[0]; return [alnum(x), alnum(x.replace(/\b(N|S|E|W|NE|NW|SE|SW|North|South|East|West)\b\.?/gi, " ")), alnum(x.replace(STREET_WORDS, " "))]; };
// the people an owner record names: "Susan Reed and Stephen Welt - Joint Account" → Susan Reed, Stephen Welt
const NOT_NAME = /^(LLC|INC|THE|AND|JOINT|ACCOUNT|TRUST|PROPERTIES|PROPERTY|HOLDINGS|GROUP|DBA|OWNER|LIVING|INVESTMENTS?|COMPANY|CO|LP|LTD)$/;
const surnames = (o: Obj) => { const out = new Set<string>(); [S(o.name), S(o.company)].join(" / ").split(/\s+(?:and|&)\s+|[\/,()]|\s+-\s*|\s*-\s+/i).forEach((part) => { const w = part.split(/\s+/).map(alnum).filter((x) => x.length >= 3 && !NOT_NAME.test(x)); if (w.length >= 2) out.add(w[w.length - 1]); }); return [...out]; };
async function ownerPayouts(): Promise<number> {
  const from = new Date(Date.now() - 75 * 864e5).toISOString().slice(0, 10);
  const props = ((await (await rest("docs?select=id,data&kind=eq.pm_property&deleted=is.false")).json()) as Obj[]).map((r) => r.data).filter((p) => p && p.id && !p.deleted);
  const main = await docData("shared", "main"), owners: Obj[] = (main && main.owners) || [];
  const ownerOf = (p: Obj) => owners.find((o) => o.id === p.ownerId) || null;
  // bills: every OWN-… bill, plus any recent bill to a vendor who is one of the owners (paid under another number)
  const vendTokens = (b: Obj) => new Set(S(b.vendorName || (b.vendor && b.vendor.name)).split(/[^A-Za-z0-9]+/).map(alnum).filter(Boolean));
  const ownerHit = (b: Obj, o: Obj | null) => { if (!o) return false; const t = vendTokens(b); return surnames(o).some((x) => t.has(x)) || [o.company, o.name].some((n) => alnum(n).length >= 6 && alnum(b.vendorName).includes(alnum(n))); };
  const byId = new Map<string, Obj>();
  for (const b of await readAll("search_bills", { query: "OWN-", invoiceDateAfter: from }, 10)) if (OWN_RE.test(refOf(b))) byId.set(S(b.id), b);
  try { for (const b of await readAll("search_bills", { invoiceDateAfter: from }, 10)) if (!byId.has(S(b.id)) && owners.some((o) => ownerHit(b, o))) byId.set(S(b.id), b); } catch (_) { /* OWN- bills only */ }
  const bills = [...byId.values()];
  try { if (bills[0]) await setSetting("nk_owner_bill_shape", JSON.stringify(Object.keys(bills[0]))); } catch (_) { /* only for checking */ }
  if (!bills.length) return 0;
  // where each payout's money stands (a bill can read "paid" while its payment is pending, or was stopped)
  const moneyState: Record<string, string> = {};
  try {
    const acts = await readAll("search_payment_activities", { source: "PAYABLE", startDate: from, endDate: today() }, 10);
    acts.sort((x, y) => S(x.createdAt).localeCompare(S(y.createdAt))).forEach((r) => { const k = S(r.billNumber || r.invoiceLabel).toUpperCase(); if (k) moneyState[k] = S(r.status).toUpperCase(); });
  } catch (_) { /* the bill's own status */ }
  const stateOf = (b: Obj) => {
    const st = S(b.paidStatus).toUpperCase(), sch = (b.scheduledPayments as Obj[]) || [], ms = moneyState[refOf(b)] || "";
    if (/FAIL|REJECT|CANCEL|RETURN/.test(ms)) return null;
    if (st === "PAID" && !(Number(b.amountScheduled) > 0)) return { date: day(b.paidDate) || today(), pending: /PEND|PROCESS/.test(ms) };
    if (st === "SCHEDULED" || sch.length || Number(b.amountScheduled) > 0) return { date: day((sch[0] || {}).withdrawalDate || (sch[0] || {}).scheduledDate || b.dueDate) || today(), scheduled: true, arrives: day((sch[0] || {}).estimatedArrivalDate) };
    return null;
  };
  const rowCache = new Map<string, Obj | null>();
  const rowOf = async (m: string, pid: string) => { const k = `${m}|${pid}`; if (!rowCache.has(k)) rowCache.set(k, await docData("pm_row", k)); return rowCache.get(k) || null; };
  const owedOf = (r: Obj | null) => r ? (r.mdNet != null ? Math.round(Number(r.mdNet) * 100) : r.ownerPayout != null ? Math.round(Number(r.ownerPayout) * 100) : null) : null;
  let changed = 0; const unmatched: string[] = [];
  const write = async (month: string, p: Obj, rec: Obj | null, billIds: string[]) => {
    const rowId = `${month}|${p.id}`, cur = await rowOf(month, p.id); if (!cur) return;
    const was = cur.paidOut || null;
    if (was && !["MagicDoor", "Nickel"].includes(S(was.by))) return;                                        // marked by a person: theirs
    if (!rec && !(was && was.by === "Nickel" && billIds.includes(S(was.nickelBillId) || S((was.group || {}).ids?.[0])))) return;
    if (rec && was && JSON.stringify(was) === JSON.stringify(rec)) return;
    await updateDoc("pm_row", rowId, (r) => { if (rec) r.paidOut = rec; else delete r.paidOut; r.updatedAt = new Date().toISOString(); r.updatedBy = "Nickel sync"; });
    changed++;
  };
  // 1) one bill per property, by its OWN- number
  const done = new Set<string>(), left: Obj[] = [];
  for (const b of bills) {
    const ref = refOf(b), m = ref.match(OWN_RE); if (!m) { left.push(b); continue; }
    const month = `${m[1]}-${m[2]}`, key = alnum(m[3]), amt = cAmt(b);
    let hits = props.filter((p) => key && [...nameForms(p.name), ...nameForms(p.address)].some((f) => f && f.startsWith(key)));
    if (hits.length > 1) { const h = hits.filter((p) => ownerHit(b, ownerOf(p))); if (h.length) hits = h; }
    if (hits.length > 1) { const h: Obj[] = []; for (const p of hits) if (owedOf(await rowOf(month, p.id)) === amt) h.push(p); if (h.length === 1) hits = h; }
    if (hits.length !== 1) { (b as Obj)._month = month; left.push(b); continue; }
    const p = hits[0], s0 = stateOf(b);
    await write(month, p, s0 ? { date: s0.date, method: "Nickel", by: "Nickel", amount: amt / 100, nickelBillId: S(b.id), ref, ...(s0.pending ? { pending: true } : {}), ...(s0.scheduled ? { scheduled: true, arrives: s0.arrives } : {}) } : null, [S(b.id)]);
    done.add(`${month}|${p.id}`);
  }
  // 2) bills paying several properties together: group bills and properties that share owners, and record the
  //    payouts only when the bills add up exactly to what those properties are owed
  const monthOf = (b: Obj) => (b as Obj)._month || S(b.invoiceDate || b.dueDate || b.paidDate).slice(0, 7);
  const groups: { month: string; bills: Obj[]; props: Map<string, Obj> }[] = [];
  for (const b of left) {
    const month = monthOf(b); if (!/^\d{4}-\d{2}$/.test(month)) { unmatched.push(`${refOf(b)} · ${S(b.vendorName)} · ${(cAmt(b) / 100).toFixed(2)} · no month`); continue; }
    const mine = props.filter((p) => !done.has(`${month}|${p.id}`) && ownerHit(b, ownerOf(p)));
    if (!mine.length) { unmatched.push(`${refOf(b)} · ${S(b.vendorName)} · ${(cAmt(b) / 100).toFixed(2)} · no property with this owner`); continue; }
    const into = groups.filter((g) => g.month === month && mine.some((p) => g.props.has(p.id)));
    const g = into[0] || { month, bills: [], props: new Map() };
    if (!into.length) groups.push(g);
    into.slice(1).forEach((o) => { o.bills.forEach((x) => g.bills.push(x)); o.props.forEach((v, k) => g.props.set(k, v)); groups.splice(groups.indexOf(o), 1); });
    g.bills.push(b); mine.forEach((p) => g.props.set(p.id, p));
  }
  for (const g of groups) {
    const billC = g.bills.reduce((a, b) => a + cAmt(b), 0);
    const owed: { p: Obj; c: number }[] = [];
    for (const p of g.props.values()) { const r = await rowOf(g.month, p.id), c = owedOf(r); if (r && c != null && c > 0) owed.push({ p, c }); }
    const owedC = owed.reduce((a, x) => a + x.c, 0), refs = g.bills.map(refOf), ids = g.bills.map((b) => S(b.id));
    if (!owed.length || Math.abs(owedC - billC) > 1) {
      unmatched.push(`${refs.join(" + ")} · ${(billC / 100).toFixed(2)} for ${[...g.props.values()].map((p) => p.name).join(", ")} · owed ${(owedC / 100).toFixed(2)}`);
      continue;
    }
    const states = g.bills.map(stateOf);
    const any = (k: string) => states.some((x) => x && (x as Obj)[k]);
    const recFor = (c: number): Obj | null => states.some((x) => !x) ? null : {
      date: states.map((x) => x!.date).sort().pop(), method: "Nickel", by: "Nickel", amount: c / 100, nickelBillId: ids[0], ref: refs.join(" + "),
      group: { ids, refs, totalC: billC, props: owed.map((x) => x.p.name) }, ...(any("pending") ? { pending: true } : {}), ...(any("scheduled") ? { scheduled: true } : {}) };
    for (const x of owed) await write(g.month, x.p, recFor(x.c), ids);
  }
  try { await setSetting("nk_owner_unmatched", JSON.stringify({ at: new Date().toISOString(), bills: unmatched })); } catch (_) { /* only for checking */ }
  return changed;
}
async function refresh(only?: Obj) {
  if (!TOKEN) return { changed: 0, skipped: "no token" };
  if (!only) { try { await saveToolSchemas(); } catch (_) { /* next hour */ } }
  let changed = 0; const bud: Budget = { left: only ? 12 : 140 };
  const map = await nkMap();
  if (!only) { try { await syncMatches(); } catch (_) { /* next time */ } }
  const want = (k: string, id: string) => !only || (only.kind === k && only.id === id);
  // vendor bills
  const bills = (await (await rest("docs?select=id,data&kind=eq.pm_bill&deleted=is.false&data->nickel->>billId=not.is.null")).json()).filter((r: Obj) => (r.data.nickel || {}).billId);
  const recent = (b: Obj) => Date.now() - Date.parse(S((b.pay || {}).date || b.updatedAt || 0)) < 60 * 864e5;
  const billTodo = bills.filter((r: Obj) => want("bill", r.id) && (["open", "paying"].includes(r.data.status) || (r.data.status === "paid" && (r.data.pay || {}).method === "Nickel" && !((r.data.pay || {}).receipt || {}).final && recent(r.data))))
    .sort((a: Obj, b: Obj) => (a.data.status === "paying" ? 0 : 1) - (b.data.status === "paying" ? 0 : 1));
  for (const r of billTodo) { try { if (await syncBill(r.id, r.data, bud)) changed++; } catch (_) { /* next hour */ } }
  // owner invoices
  const invs = (await (await rest("docs?select=id,data&kind=eq.pm_invoice&deleted=is.false&data->nickel->>invoiceId=not.is.null")).json()).filter((r: Obj) => (r.data.nickel || {}).invoiceId);
  for (const r of invs) {
    const x = r.data; if (!want("pmInvoice", r.id)) continue;
    const settled = x.status === "paid" && ((x.nickel || {}).payments || []).every((p: Obj) => p.external || (p.url && p.disbursement === "DEPOSITED"));
    if (x.status === "void" || (settled && !only)) continue;
    try { if (await syncPmInvoice(r.id, x, bud)) changed++; } catch (_) { /* next hour */ }
  }
  // project invoices
  const projs = await (await rest("docs?select=id,data&kind=eq.pj_property&deleted=is.false")).json();
  for (const row of projs) for (const [key, g] of Object.entries((row.data.register || {}) as Obj)) {
    if (!g || !g.nickel || !g.nickel.invoiceId || g.nickel.deleted) continue;
    if (only ? !(only.kind === "project" && only.id === row.id && (!only.key || only.key === key)) : (g.nickel.done && g.paid)) continue;
    try { if (await syncProject(row.id, key, g, bud)) changed++; } catch (_) { /* next hour */ }
  }
  if (!only || only.kind === "ownerPayouts") { try { changed += await ownerPayouts(); } catch (_) { /* next hour */ } }
  if (!only) { try { changed += await linkBills(bud, map); } catch (_) { /* next hour */ } }
  if (!only || only.kind === "projects") { try { changed += await linkAllProjects(); } catch (_) { /* next hour */ } }
  if (!only || only.kind === "expenses") { try { changed += await projExpenses(only ? { left: 30 } : bud); } catch (_) { /* next hour */ } }
  if (!only) await saveMap((m) => { m.lastRefresh = new Date().toISOString(); });
  return { changed, more: bud.left <= 0 };
}

/* ====================================================================
   READING FOR THE PAYMENTS PAGE: balances, money in and out, receipts, deposited checks
   ==================================================================== */
async function activity(body: Obj) {
  let balances: Obj[] = [];
  try { balances = items(await read("list_nickel_banking_accounts")).map((a) => ({ id: S(a.id), name: S(a.nickname) || "Nickel account", last4: S(a.accountNumberLast4), balanceC: cIn(a.balance), holdsC: cIn(a.pendingCardHolds), link: S(a.dashboardUrl) })); } catch { /* not on Nickel Banking */ }
  const args: Obj = { page: Math.max(1, Number(body.page) || 1), pageSize: 25 };
  const src = S(body.source);
  if (["RECEIVABLE", "PAYABLE", "REFUND", "RETURN", "DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST"].includes(src)) args.source = src;
  // owner payouts are bills numbered OWN-…; "PAYABLE" on its own means every other bill payment
  if (src === "OWNERPAY") { args.source = "PAYABLE"; args.payableFilters = { billLabel: "OWN-" }; }
  if (S(body.q).trim()) args.customerName = S(body.q).trim().slice(0, 60);
  const d = await read("search_payment_activities", args);
  const isOwn = (r: Obj) => S(r.source) === "PAYABLE" && /^OWN-\d{4}-\d{2}-/i.test(S(r.billNumber || r.invoiceLabel));
  const kept = items(d).filter((r) => src === "OWNERPAY" ? isOwn(r) : src === "PAYABLE" ? !isOwn(r) : true);
  const rows = kept.map((r) => ({ owner: isOwn(r), id: S(r.id), entityId: S(r.entityId), source: S(r.source), status: S(r.status), at: S(r.createdAt), amountC: Number(r.amountInCents) || 0, who: S(r.counterpartyName), what: S(r.invoiceLabel || r.billNumber), desc: S(r.description).slice(0, 220), link: S(r.dashboardUrl), account: S(r.nickelBalanceAccount && r.nickelBalanceAccount.nickname) }));
  return { balances, items: rows, hasMore: !!(d && d.hasMore), total: Number(d && d.totalResults) || rows.length };
}
async function receipt(body: Obj) {
  const id = S(body.id); if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) throw new Error("Missing payment id");
  const d = S(body.source) === "PAYABLE" ? await read("get_bill_payment", { billPaymentId: id }) : await read("get_payment", { paymentId: id });
  return { url: S(d && d.pdfUrl), link: S(d && d.dashboardUrl) };
}
async function deposits() {
  try {
    const d = await read("list_check_deposits", { unappliedOnly: true, limit: 30 });
    return { items: items(d).map((x) => ({ transferId: S(x.transferId), payer: S(x.payerName || x.payer || (x.payer && x.payer.name)), amountC: cIn(x.amount) || Number(x.amountInCents) || 0, unappliedC: cIn(x.unappliedAmount) || Number(x.unappliedAmountInCents) || 0, status: S(x.status), at: day(x.createdAt || x.depositedAt), memo: S(x.description || x.memo).slice(0, 120) })).filter((x) => x.transferId) };
  } catch (e) { return { items: [], note: String((e as Error).message || e) }; }
}
async function customerInfo(body: Obj) {
  const c = ((await nkMap()).customers || {})[S(body.ownerId)] || {}; if (!c.id) return { customer: null };
  const d = await read("get_customer", { customerId: c.id });
  return { customer: { id: c.id, name: S(d && d.name), emails: (d && d.emails) || [], url: S(d && d.dashboardUrl), onFile: (((d && d.paymentMethodsOnFile) || []) as Obj[]).map((m) => ({ id: S(m.id), label: [S(m.type || m.kind).replace(/_/g, " ").toLowerCase(), S(m.bankName || m.brand), (m.last4 || m.accountNumberLastFour) ? "····" + S(m.last4 || m.accountNumberLastFour) : ""].filter(Boolean).join(" ") || "Account on file" })), autopayAsked: S(c.autopayAsked) } };
}
// project invoices already in Nickel (made by hand before the console): link them by their number
async function linkProject(body: Obj) {
  const pid = S(body.propertyId), p = await docData("pj_property", pid); if (!p) throw new Error("Project not found");
  const list = ((Array.isArray(body.items) ? body.items : []) as Obj[]).slice(0, 80).map((i) => ({ key: `${S(i.unitId)}|${Number(i.no) || 0}`, number: S(i.number).trim().toUpperCase() }))
    .filter((i) => /^[A-Z0-9 #._\/-]{3,21}$/.test(i.number) && !((((p.register || {})[i.key] || {}).nickel || {}).invoiceId));
  if (!list.length) return { linked: 0 };
  const found: Obj[] = [];
  for (const pre of [...new Set(list.map((i) => pjPrefix(i.number)))].slice(0, 4)) { try { found.push(...await readAll("search_invoices", { query: pre }, 3)); } catch { /* none */ } }
  const map = await nkMap(), named = (id: string) => S(((map.nickelCustomers || []) as Obj[]).find((x) => x.id === id)?.name);
  const hits = list.map((i) => ({ i, inv: found.filter((x) => S(x.name).trim().toUpperCase() === i.number && S(x.status).toUpperCase() !== "CANCELED").sort((a, b) => S(b.createdAt).localeCompare(S(a.createdAt)))[0] })).filter((h) => h.inv);
  if (!hits.length) return { linked: 0 };
  let n = 0;
  await patch("pj_property", pid, (x) => {
    x.register = x.register || {};
    const used = new Set(Object.values(x.register as Obj).map((g: Obj) => g && g.nickel && g.nickel.invoiceId).filter(Boolean));
    for (const h of hits) {
      if (used.has(h.inv.id)) continue;
      const g = x.register[h.i.key] = x.register[h.i.key] || {}; if (g.nickel && g.nickel.invoiceId) continue;
      g.nickel = { invoiceId: S(h.inv.id), url: S(h.inv.url), number: S(h.inv.name), customer: named(h.inv.customerId), customerId: S(h.inv.customerId), amountC: cIn(h.inv), linked: true, at: new Date().toISOString(), qb: !!h.inv.quickBooksSynced };
      if (!g.link && h.inv.url) g.link = S(h.inv.url);
      used.add(h.inv.id); n++;
    }
  });
  const fresh = await docData("pj_property", pid), bud: Budget = { left: 40 };
  for (const h of hits) { const g = ((fresh && fresh.register) || {})[h.i.key]; if (g && g.nickel && g.nickel.invoiceId === h.inv.id) { try { await syncProject(pid, h.i.key, g, bud); } catch { /* next hour */ } } }
  return { linked: n };
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
      case "nk.projCustomer": {   // who a project invoice will bill (read-only)
        const p = await docData("pj_property", S(body.propertyId)); if (!p) throw new Error("Project not found");
        return json({ customer: await projCustomer(p, S(body.invoiceNumber), await nkMap()) });
      }
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
      case "nk.sync": return done(await refresh({ kind: S(body.kind), id: S(body.id), key: S(body.key) || undefined }));
      case "nk.linkProject": return done(await linkProject(body));
      case "nk.activity": return json(await activity(body));
      case "nk.receipt": return json(await receipt(body));
      case "nk.deposits": return json(await deposits());
      case "nk.customer": return json(await customerInfo(body));
      default: return json({ error: "Unknown mode" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e), docs: [...C().touched] }, 200);
  }
}
