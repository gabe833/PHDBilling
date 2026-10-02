// PHD Billing — payments (Supabase Edge Function "payments")
// ---------------------------------------------------------------------
// Nickel: pays vendor bills (ACH or mailed check), asks vendors for their bank
// details through Nickel's own secure form, sends owner invoices as Nickel pay
// links, and picks up payments (hourly, and on demand).
// QuickBooks Online: records bills, bill payments, owner invoices and owner
// payments — Nickel doesn't do that for anything made through its API.
//
// Keys live in Supabase → Edge Functions → Secrets, never in the browser:
//   NICKEL_API_KEY, NICKEL_ENV (sandbox | live)
//   QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENV (production | sandbox)
// QuickBooks sign-in tokens are kept in public.private_settings (no browser access).
// Who may send money: private_settings key "payers" (comma-separated emails),
// checked here on every payment — the screen can't get around it.
//
// No bank or card numbers ever pass through this function.

const SB = Deno.env.get("SUPABASE_URL")!;
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const NK_KEY = (Deno.env.get("NICKEL_API_KEY") || "").trim();
const NK_ENV = /^(live|prod|production)$/i.test(Deno.env.get("NICKEL_ENV") || "") ? "live" : "sandbox";
const NK_BASE = NK_ENV === "live" ? "https://rest.nickel.com" : "https://rest.staging.nickel.com";
const NK_MCP_TOKEN = (Deno.env.get("NICKEL_MCP_TOKEN") || "").trim();
const NK_MCP_URL = "https://mcp.nickel.com/mcp";
const QBO_ID = (Deno.env.get("QBO_CLIENT_ID") || "").trim();
const QBO_SECRET = (Deno.env.get("QBO_CLIENT_SECRET") || "").trim();
const QBO_ENV = /^sandbox$/i.test(Deno.env.get("QBO_ENV") || "") ? "sandbox" : "production";
const QBO_BASE = QBO_ENV === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_REDIRECT = SB + "/functions/v1/payments?qbo=callback";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
type Obj = Record<string, any>;
const S = (v: unknown) => (v == null ? "" : String(v));
const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const usd = (c: number) => "$" + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/* ---------- database (service role) ---------- */
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
// read → change → save with the version it was read at; retried if someone saved in between
const touched = new Set<string>();
async function updateDoc(kind: string, id: string, fn: (d: Obj) => unknown, create = false): Promise<Obj> {
  for (let i = 0; i < 5; i++) {
    const d = await getDoc(kind, id);
    if (!d) {
      if (!create) throw new Error(`${kind} ${id} not found`);
      const data: Obj = {}; fn(data);
      const r = await fetch(SB + "/rest/v1/docs", { method: "POST", headers: { apikey: SRV, Authorization: "Bearer " + SRV, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ kind, id, data }) });
      if (r.ok) { touched.add(kind + "/" + id); return data; }
      continue;                                                    // created a moment ago by someone else: read it and try again
    }
    const data = structuredClone(d.data || {});
    if (fn(data) === false) return data;
    const r = await rest(`docs?kind=eq.${kind}&id=eq.${encodeURIComponent(id)}&version=eq.${d.version}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data, deleted: false }) });
    if ((await r.json()).length) { touched.add(kind + "/" + id); return data; }
  }
  throw new Error("Someone kept editing this record — try again in a moment");
}

/* ---------- who's calling ---------- */
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
   NICKEL
   ==================================================================== */
async function nk(method: string, path: string, body?: unknown) {
  if (!NK_KEY) throw new Error("Nickel isn't connected: add NICKEL_API_KEY in Supabase → Edge Functions → Secrets.");
  const r = await fetch(NK_BASE + path, { method, headers: { Authorization: "Bearer " + NK_KEY, "Content-Type": "application/json", Accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* not JSON */ }
  if (r.status === 401) throw new Error("Nickel didn't accept the API key (401). Check NICKEL_API_KEY and NICKEL_ENV (sandbox keys only work in sandbox).");
  if (!r.ok) throw new Error(`Nickel: ${(j && (j.error || j.message)) || t.slice(0, 200) || r.status}`);
  return j;
}
function payMethodLabel(m: Obj) {
  if (m.type === "NickelBalance" && m.nickelBalanceDetails) { const d = m.nickelBalanceDetails; return `Nickel ${d.nickname || "account"} ····${d.accountNumberLastFour || ""} (${usd(Number(d.spendableCents) || 0)} available)`; }
  if (m.type === "ACH" && m.achDetails) return `${m.achDetails.bankName || "Bank"} ····${m.achDetails.accountNumberLastFour || ""}`;
  if (m.type === "Card" && m.cardDetails) return `${m.cardDetails.brand || "Card"} ····${m.cardDetails.last4 || ""}`;
  return m.type || "Account";
}
async function nkPayMethods() {
  const j = await nk("GET", "/billPaymentMethods");
  return ((j && j.billPaymentMethods) || []).map((m: Obj) => ({ id: m.id, type: m.type, label: payMethodLabel(m) }));
}
const SUCCEEDED = /SUCCEED|COMPLETE|PAID|SETTLED|DEPOSITED|DELIVERED/i, FAILED = /FAIL|CANCEL|RETURN|VOID|REJECT/i;
async function vendorsDoc(): Promise<Obj[]> { const d = await getDoc("shared", "vendors"); return (d && d.data && d.data.list) || []; }
async function nkMap(): Promise<Obj> { const d = await getDoc("shared", "nickel"); return (d && d.data) || {}; }
async function saveNkVendor(vid: string, patch: Obj) { await updateDoc("shared", "nickel", (d) => { d.vendors = d.vendors || {}; d.vendors[vid] = { ...(d.vendors[vid] || {}), ...patch }; }, true); }
// read the vendor's delivery methods from Nickel (bank account / check address), without keeping any numbers
async function nkVendorCheck(vid: string, nkId: string) {
  const v = await nk("GET", `/vendor/${encodeURIComponent(nkId)}`);
  const ms: Obj[] = (v && v.vendorDeliveryMethods) || [];
  const ach = ms.find((m) => /ach/i.test(S(m.type))), chk = ms.find((m) => /check/i.test(S(m.type)));
  const info = { ach: ach ? ach.id : "", check: chk ? [chk.street, chk.city].filter(Boolean).join(", ") || "on file" : "", checkId: chk ? chk.id : "", bank: ach ? S(ach.bankName) : "", checkedAt: new Date().toISOString() };
  await saveNkVendor(vid, info);
  return info;
}
async function nkEnsureVendor(vid: string): Promise<string> {
  const map = await nkMap(), cur = (map.vendors || {})[vid];
  if (cur && cur.id) return cur.id;
  const v = (await vendorsDoc()).find((x) => x.id === vid);
  if (!v) throw new Error("Vendor not found");
  const body: Obj = { name: v.name, emails: v.email ? [v.email] : [], type: "BUSINESS" };
  if (v.address && v.city && v.state && v.zip) body.address = { street1: v.address, city: v.city, state: v.state, zip: v.zip, country: "US" };
  const r = await nk("POST", "/vendor", body);
  await saveNkVendor(vid, { id: r.id });
  return r.id;
}
async function nkAskVendor(vid: string) {
  const v = (await vendorsDoc()).find((x) => x.id === vid);
  if (!v) throw new Error("Vendor not found");
  if (!v.email) throw new Error("Add the vendor's billing email first");
  const id = await nkEnsureVendor(vid);
  const r = await nk("POST", `/vendor/${encodeURIComponent(id)}/requestDeliveryDetails`, { emails: [v.email], allowedDeliveryMethods: ["ACH", "CHECK"] });
  await saveNkVendor(vid, { requested: new Date().toISOString(), formUrl: (r && r.url) || "" });
  return { url: (r && r.url) || "" };
}
// what can be paid right now, and why not otherwise
async function nkPlan(billIds: string[], email: string) {
  const vendors = await vendorsDoc(), map = await nkMap(), out: Obj[] = [];
  for (const id of billIds.slice(0, 50)) {
    const d = await getDoc("pm_bill", id), b = d && d.data;
    if (!b || d!.deleted) { out.push({ id, ready: false, why: "Bill not found" }); continue; }
    if (b.status !== "open") { out.push({ id, ready: false, why: "Already paid or in progress" }); continue; }
    if (!(cents(b.amount) > 0)) { out.push({ id, ready: false, why: "No amount" }); continue; }
    const v = vendors.find((x) => x.id === b.vendorId) || vendors.find((x) => S(x.name).toLowerCase() === S(b.vendor).toLowerCase());
    if (!v) { out.push({ id, ready: false, why: "Vendor not on the Vendors page" }); continue; }
    const nv = (map.vendors || {})[v.id] || {};
    let info = nv;
    if (nv.id) { try { info = { ...nv, ...(await nkVendorCheck(v.id, nv.id)) }; } catch (_) { /* keep what we knew */ } }
    if (!nv.id || (!info.ach && !info.check)) { out.push({ id, ready: false, vendorId: v.id, needsDetails: true, why: nv.requested ? `Waiting for ${v.name} to enter bank details (asked ${S(nv.requested).slice(0, 10)})` : `${v.name} hasn't given Nickel their bank details yet` }); continue; }
    out.push({ id, ready: true, vendorId: v.id, delivery: info.ach ? `ACH${info.bank ? " · " + info.bank : ""}` : `Check · ${info.check}` });
  }
  const ps = await payers();
  return { bills: out, payMethods: await nkPayMethods(), payers: ps, canPay: ps.includes(email) };
}
async function nkPay(billIds: string[], payMethodId: string, date: string, email: string) {
  const ps = await payers();
  if (!ps.includes(email)) throw new Error("You're not on the payments list, so you can't send money. Ask someone who is, or add yourself to private_settings → payers.");
  const methods = await nkPayMethods();
  if (!methods.some((m: Obj) => m.id === payMethodId)) throw new Error("Pick the account to pay from");
  const t = today(), when = /^\d{4}-\d{2}-\d{2}$/.test(date) && date > t ? date : t;
  const vendors = await vendorsDoc(), map = await nkMap();
  let sent = 0, scheduled = 0, failed = 0; const errors: string[] = [];
  for (const id of billIds.slice(0, 50)) {
    const d = await getDoc("pm_bill", id), b = d && d.data;
    if (!b || d!.deleted || b.status !== "open" || !(cents(b.amount) > 0)) continue;   // only open bills, at the amount saved — never one sent by the screen
    const v = vendors.find((x) => x.id === b.vendorId) || vendors.find((x) => S(x.name).toLowerCase() === S(b.vendor).toLowerCase());
    const nv = v && (map.vendors || {})[v.id];
    try {
      if (!v || !nv || !nv.id) throw new Error(`${b.vendor} isn't set up in Nickel`);
      const info = await nkVendorCheck(v.id, nv.id);
      const deliveryId = info.ach || info.checkId;
      if (!deliveryId) throw new Error(`${b.vendor} has no bank account or check address in Nickel`);
      const prop = await getDoc("pm_property", b.propertyId);
      const reason = `${prop && prop.data ? prop.data.name + " — " : ""}${b.memo || b.category || "Bill"}`.slice(0, 140);
      // the Nickel bill (made once; kept if a payment is cancelled and sent again)
      let nkBill = b.nickel && b.nickel.billId && cents(b.nickel.amount) === cents(b.amount) ? b.nickel.billId : "";
      if (!nkBill) {
        const nb = await nk("POST", "/bill", { vendorId: nv.id, amountCents: cents(b.amount), dueDateEpochMillis: Date.parse((b.due || when) + "T12:00:00Z"), reason, billNumber: S(b.billNo || b.id).slice(0, 40) });
        nkBill = nb.id;
        await updateDoc("pm_bill", id, (x) => { x.nickel = { billId: nkBill, amount: Number(b.amount) }; });
      }
      const pay: Obj = { billId: nkBill, vendorId: nv.id, merchantPaymentMethodId: payMethodId, vendorDeliveryMethodId: deliveryId, vendorMemo: S(b.billNo ? `Invoice ${b.billNo}` : reason).slice(0, 80) };
      if (v.email) pay.notificationEmails = [v.email];
      if (when > t) pay.withdrawalDateEpochMillis = Date.parse(when + "T14:00:00Z");
      const r = await nk("POST", "/bill/pay", { payments: [pay], idempotencyKey: `phd-${id}-${nkBill}-${when}` });
      const bp = (r.billPayments || [])[0], sc = (r.scheduled || [])[0], er = (r.billErrors || [])[0];
      if (er && !bp && !sc) throw new Error(S(er.error || er.message || er.reason) || JSON.stringify(er).slice(0, 160));
      await updateDoc("pm_bill", id, (x) => {
        if (x.status !== "open") return false;
        x.status = "paying";
        x.pay = { method: "Nickel", date: when, by: email, at: new Date().toISOString(), delivery: info.ach ? "ACH" : "Check", nickel: { billId: nkBill, paymentId: bp ? bp.id : "", status: bp ? bp.status : "SCHEDULED" }, scheduled: sc ? S(sc.withdrawalDate || when).slice(0, 10) : "" };
        x.updatedAt = new Date().toISOString(); x.updatedBy = email;
      });
      if (sc) scheduled++; else sent++;
    } catch (e) {
      failed++; const msg = String((e as Error).message || e); errors.push(`${b.vendor}: ${msg}`);
      await updateDoc("pm_bill", id, (x) => { x.pay = { ...(x.pay || {}), failed: true, failReason: msg.slice(0, 200), at: new Date().toISOString() }; }).catch(() => {});
    }
  }
  return { sent, scheduled, failed, errors };
}
async function nkCancel(billId: string, email: string) {
  if (!(await payers()).includes(email)) throw new Error("You're not on the payments list.");
  const d = await getDoc("pm_bill", billId), b = d && d.data;
  if (!b || b.status !== "paying" || !b.pay || !b.pay.nickel) throw new Error("This bill has no Nickel payment in progress");
  if (b.pay.nickel.paymentId) await nk("POST", `/billPayment/${encodeURIComponent(b.pay.nickel.paymentId)}/cancel`, {});
  else await nk("POST", `/bill/${encodeURIComponent(b.pay.nickel.billId)}/cancelScheduledPayment`, {});
  await updateDoc("pm_bill", billId, (x) => { x.status = "open"; x.pay = null; x.updatedAt = new Date().toISOString(); x.updatedBy = email; });
  return { ok: true };
}
async function ownerOf(ownerId: string): Promise<Obj | null> {
  const m = await getDoc("shared", "main");
  return ((m && m.data && m.data.owners) || []).find((o: Obj) => o.id === ownerId) || null;
}
function invTotals(v: Obj) {
  const totalC = (v.lines || []).reduce((a: number, l: Obj) => a + cents(l.amount) + cents(l.fee || 0), 0);
  const paidC = (v.payments || []).reduce((a: number, x: Obj) => a + cents(x.amount), 0);
  return { totalC, paidC, dueC: Math.max(0, totalC - paidC) };
}
async function nkInvoice(id: string, emails: string[], card: boolean, email: string) {
  const d = await getDoc("pm_invoice", id), inv = d && d.data;
  if (!inv) throw new Error("Invoice not found");
  if (inv.status !== "draft") throw new Error("This invoice was already sent");
  const t = invTotals(inv);
  if (!(t.totalC > 0)) throw new Error("The invoice is empty");
  const o = await ownerOf(inv.ownerId); if (!o) throw new Error("Owner not found");
  const to = emails.map((e) => S(e).trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)).slice(0, 5);
  if (!to.length) throw new Error("Add the owner's email");
  const name = S(o.name || o.company) || "Owner";
  let custId = ((await nkMap()).customers || {})[inv.ownerId];
  if (!custId) {
    const c = await nk("POST", "/customer", { name, emails: to, syncToQbo: false });   // QuickBooks gets the owner from our own QuickBooks connection
    custId = c.id;
    await updateDoc("shared", "nickel", (x) => { x.customers = x.customers || {}; x.customers[inv.ownerId] = custId; }, true);
  }
  const link = await nk("POST", "/paymentLink", { customerId: custId, name: inv.no, requestedAmountCents: t.totalC, dueDate: inv.due || undefined, achEnabled: true, creditCardEnabled: !!card, feePassthroughPercent: card ? 100 : 0, amountEditable: false });
  await nk("POST", `/paymentLink/${encodeURIComponent(link.id)}/send`, { recipients: to.map((e) => ({ email: e, name })) });
  await updateDoc("pm_invoice", id, (x) => {
    x.status = "sent"; x.sentAt = new Date().toISOString(); x.sentBy = email; x.sentTo = to.join(", ");
    x.nickel = { customerId: custId, linkId: link.id, url: link.url || "" };
  });
  return { url: link.url || "" };
}
async function nkExternal(id: string, paymentId: string) {
  const d = await getDoc("pm_invoice", id), inv = d && d.data;
  if (!inv || !inv.nickel || !inv.nickel.linkId) return { ok: true };
  const p = (inv.payments || []).find((x: Obj) => x.id === paymentId);
  if (!p || p.nickelPaymentId) return { ok: true };
  await nk("POST", `/paymentLink/${encodeURIComponent(inv.nickel.linkId)}/externalPayment`, { amountCents: cents(p.amount), paidAt: S(p.date).slice(0, 10), externalReferenceId: p.id });
  return { ok: true };
}
async function nkVoidInvoice(id: string) {
  const d = await getDoc("pm_invoice", id), inv = d && d.data;
  if (inv && inv.nickel && inv.nickel.linkId) await nk("DELETE", `/paymentLink/${encodeURIComponent(inv.nickel.linkId)}`);
  return { ok: true };
}
// pick up what happened in Nickel: vendor payments cleared or failed, owner invoices paid, vendors who filled in the form
async function nkRefresh() {
  let changed = 0; const pushes: Obj[] = [];
  const bills = await (await rest("docs?select=id,data&kind=eq.pm_bill&deleted=is.false&data->>status=eq.paying")).json();
  for (const row of bills) {
    const b = row.data, n = (b.pay || {}).nickel || {};
    try {
      let state = "", when = "";
      if (n.paymentId) {
        const p = await nk("GET", `/billPayment/${encodeURIComponent(n.paymentId)}`);
        if (SUCCEEDED.test(S(p.status))) state = "paid"; else if (FAILED.test(S(p.status))) state = "failed";
      } else if (n.billId) {
        const nb = await nk("GET", `/bill/${encodeURIComponent(n.billId)}`);
        if (/paid/i.test(S(nb.status)) || Number(nb.amountDueInCents) === 0) state = "paid";
      }
      if (!state) continue;
      when = today();
      await updateDoc("pm_bill", row.id, (x) => {
        if (x.status !== "paying") return false;
        if (state === "paid") { x.status = "paid"; x.pay = { ...(x.pay || {}), date: when, cleared: true }; }
        else { x.status = "open"; x.pay = { ...(x.pay || {}), failed: true, failReason: "Nickel reported the payment failed or was cancelled" }; }
      });
      changed++; if (state === "paid") pushes.push({ kind: "bill", id: row.id });
    } catch (_) { /* try again next hour */ }
  }
  const invs = await (await rest("docs?select=id,data&kind=eq.pm_invoice&deleted=is.false&data->>status=eq.sent")).json();
  for (const row of invs) {
    const inv = row.data; if (!inv.nickel || !inv.nickel.linkId) continue;
    try {
      const link = await nk("GET", `/paymentLink/${encodeURIComponent(inv.nickel.linkId)}`);
      const got = ((link && link.payments) || []).filter((p: Obj) => SUCCEEDED.test(S(p.status)));
      const known = new Set((inv.payments || []).map((p: Obj) => p.nickelPaymentId).filter(Boolean));
      const fresh = got.filter((p: Obj) => !known.has(p.id));
      if (!fresh.length) continue;
      await updateDoc("pm_invoice", row.id, (x) => {
        const have = new Set((x.payments || []).map((p: Obj) => p.nickelPaymentId).filter(Boolean));
        const add = fresh.filter((p: Obj) => !have.has(p.id)).map((p: Obj) => ({ id: "pay_" + p.id, nickelPaymentId: p.id, amount: (Number(p.amountInCents) || 0) / 100,
          date: p.createdAt ? new Date(Number(p.createdAt) || p.createdAt).toISOString().slice(0, 10) : today(), method: "Nickel" + (p.paymentMethod && p.paymentMethod.type ? " · " + p.paymentMethod.type : ""), by: "Nickel" }));
        if (!add.length) return false;
        x.payments = (x.payments || []).concat(add);
        if (invTotals(x).dueC === 0) x.status = "paid";
      });
      changed++; pushes.push({ kind: "invoice", id: row.id });
    } catch (_) { /* next time */ }
  }
  // vendors who were asked for bank details
  const map = await nkMap();
  for (const [vid, nv] of Object.entries((map.vendors || {}) as Obj)) {
    if (!nv.id || nv.ach || nv.check || !nv.requested) continue;
    try { const info = await nkVendorCheck(vid, nv.id); if (info.ach || info.check) changed++; } catch (_) { /* next time */ }
  }
  await updateDoc("shared", "nickel", (x) => { x.lastRefresh = new Date().toISOString(); }, true);
  // QuickBooks, when it's set to record things automatically
  const acct = ((await getDoc("shared", "accounting")) || { data: {} }).data || {};
  if (acct.qboAuto && (await getSetting("qbo_tokens"))) for (const p of pushes) { try { await qboPush(p.kind, p.id); } catch (_) { /* shown on the record */ } }
  return { changed };
}

/* ====================================================================
   QUICKBOOKS ONLINE
   ==================================================================== */
type Tok = { access: string; refresh: string; exp: number; realmId: string; at?: string; by?: string };
const b64 = (s: string) => btoa(s);
async function qboTokenCall(params: Record<string, string>) {
  const r = await fetch(QBO_TOKEN_URL, { method: "POST", headers: { Authorization: "Basic " + b64(QBO_ID + ":" + QBO_SECRET), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("QuickBooks sign-in: " + (j.error_description || j.error || r.status));
  return j;
}
let tokCache: Tok | null = null;
async function qboTok(force = false): Promise<Tok> {
  const t: Tok | null = tokCache || JSON.parse((await getSetting("qbo_tokens")) || "null");
  if (!t) throw new Error("QuickBooks isn't connected — open Payments setup and press Connect.");
  if (!force && Date.now() < t.exp - 90000) { tokCache = t; return t; }
  const j = await qboTokenCall({ grant_type: "refresh_token", refresh_token: t.refresh });
  const n: Tok = { ...t, access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + Number(j.expires_in || 3600) * 1000 };
  await setSetting("qbo_tokens", JSON.stringify(n));
  tokCache = n; return n;
}
async function qbo(method: string, path: string, body?: unknown, retry = true): Promise<any> {
  const t = await qboTok();
  const url = `${QBO_BASE}/v3/company/${t.realmId}/${path}${path.includes("?") ? "&" : "?"}minorversion=75`;
  const r = await fetch(url, { method, headers: { Authorization: "Bearer " + t.access, Accept: "application/json", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  if (r.status === 401 && retry) { await qboTok(true); return qbo(method, path, body, false); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.Fault) {
    const e = ((j.Fault && j.Fault.Error) || [])[0] || {};
    const err = new Error(e.Message ? `${e.Message}${e.Detail ? " — " + e.Detail : ""}` : `QuickBooks answered ${r.status}`) as Error & { code?: string };
    err.code = S(e.code); throw err;
  }
  return j;
}
const qq = (s: string) => S(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function qboQuery(q: string): Promise<Obj> { return ((await qbo("GET", "query?query=" + encodeURIComponent(q))).QueryResponse) || {}; }
async function qboMap(): Promise<Obj> { const d = await getDoc("shared", "qbomap"); return (d && d.data) || {}; }
async function qboSetMap(group: string, key: string, val: string) { await updateDoc("shared", "qbomap", (x) => { x[group] = x[group] || {}; x[group][key] = val; }, true); }
// find by name, or create; QuickBooks names must be unique across vendors and customers, so a clash gets a suffix
async function qboEnsure(entity: "Vendor" | "Customer", group: string, key: string, name: string, extra: Obj) {
  const m = (await qboMap())[group] || {};
  if (m[key]) return m[key];
  const base = S(name).replace(/[:\t\n]/g, " ").trim().slice(0, 95) || "Unnamed";
  for (const nm of [base, `${base} (${entity === "Vendor" ? "Vendor" : "Owner"})`]) {
    const found = (await qboQuery(`select Id from ${entity} where DisplayName = '${qq(nm)}'`))[entity];
    if (found && found.length) { await qboSetMap(group, key, found[0].Id); return found[0].Id; }
    try {
      const r = await qbo("POST", entity.toLowerCase(), { DisplayName: nm, ...extra });
      const id = r[entity].Id; await qboSetMap(group, key, id); return id;
    } catch (e) { if ((e as Obj).code === "6240") continue; throw e; }        // "Duplicate Name Exists" (used by the other kind): try with a suffix
  }
  throw new Error(`QuickBooks already has a different record named “${base}”`);
}
async function qboStatus() {
  const out: Obj = { configured: !!(QBO_ID && QBO_SECRET), redirectUri: QBO_REDIRECT, env: QBO_ENV, connected: false };
  if (!out.configured) return out;
  const raw = await getSetting("qbo_tokens"); if (!raw) return out;
  try {
    const t = await qboTok();
    const ci = await qbo("GET", `companyinfo/${t.realmId}`);
    out.connected = true; out.company = ci.CompanyInfo && ci.CompanyInfo.CompanyName;
    const accts = (await qboQuery("select Id, FullyQualifiedName, AccountType from Account where Active = true maxresults 1000")).Account || [];
    const pick = (types: string[]) => accts.filter((a: Obj) => types.includes(a.AccountType)).map((a: Obj) => ({ id: a.Id, name: a.FullyQualifiedName })).sort((a: Obj, b: Obj) => a.name.localeCompare(b.name));
    out.accounts = { bank: pick(["Bank"]), expense: pick(["Expense", "Other Expense", "Cost of Goods Sold", "Other Current Asset", "Other Current Liability"]) };
    out.items = ((await qboQuery("select Id, FullyQualifiedName, Type from Item where Active = true maxresults 1000")).Item || [])
      .filter((i: Obj) => ["Service", "NonInventory", "Other Charge", "OtherCharge"].includes(i.Type)).map((i: Obj) => ({ id: i.Id, name: i.FullyQualifiedName })).sort((a: Obj, b: Obj) => a.name.localeCompare(b.name));
  } catch (e) { out.error = String((e as Error).message || e); }
  return out;
}
async function qboConnect(email: string) {
  if (!(QBO_ID && QBO_SECRET)) throw new Error("Add QBO_CLIENT_ID and QBO_CLIENT_SECRET in Supabase → Edge Functions → Secrets first.");
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await setSetting("qbo_state", JSON.stringify({ state, exp: Date.now() + 15 * 60000, by: email }));
  const u = new URL("https://appcenter.intuit.com/connect/oauth2");
  u.search = new URLSearchParams({ client_id: QBO_ID, response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: QBO_REDIRECT, state }).toString();
  return { url: u.toString() };
}
const page = (title: string, msg: string) => new Response(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:15px system-ui;padding:40px;color:#1A2322"><h2 style="font-weight:600">${title}</h2><p>${msg}</p><script>setTimeout(()=>window.close(),2500)</script></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
async function qboCallback(url: URL) {
  const st = JSON.parse((await getSetting("qbo_state")) || "null");
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "", realmId = url.searchParams.get("realmId") || "";
  if (url.searchParams.get("error")) return page("QuickBooks wasn't connected", "The sign-in was cancelled. You can close this window.");
  if (!st || st.state !== state || Date.now() > st.exp || !code || !realmId) return page("QuickBooks wasn't connected", "This sign-in link expired or didn't come from the console. Press Connect again.");
  await delSetting("qbo_state");
  const j = await qboTokenCall({ grant_type: "authorization_code", code, redirect_uri: QBO_REDIRECT });
  const t: Tok = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + Number(j.expires_in || 3600) * 1000, realmId, at: new Date().toISOString(), by: st.by };
  await setSetting("qbo_tokens", JSON.stringify(t));
  return page("QuickBooks is connected", "You can close this window and go back to the console.");
}
async function qboDisconnect() {
  const t = JSON.parse((await getSetting("qbo_tokens")) || "null");
  if (t) { await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", { method: "POST", headers: { Authorization: "Basic " + b64(QBO_ID + ":" + QBO_SECRET), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ token: t.refresh }) }).catch(() => {}); }
  await delSetting("qbo_tokens"); tokCache = null;
  return { ok: true };
}
async function qboUpsert(entity: string, id: string | null, body: Obj) {
  if (id) { const cur = (await qbo("GET", `${entity.toLowerCase()}/${id}`))[entity]; const r = await qbo("POST", entity.toLowerCase(), { ...body, Id: id, SyncToken: cur.SyncToken, sparse: false }); return r[entity].Id; }
  const r = await qbo("POST", entity.toLowerCase(), body); return r[entity].Id;
}
async function qboPush(kind: string, id: string) {
  const acct = ((await getDoc("shared", "accounting")) || { data: {} }).data || {};
  try {
    if (kind === "bill") return await qboPushBill(id, acct);
    if (kind === "invoice") return await qboPushInvoice(id, acct);
    throw new Error("Unknown record");
  } catch (e) {
    const msg = String((e as Error).message || e).slice(0, 240);
    await updateDoc(kind === "bill" ? "pm_bill" : "pm_invoice", id, (x) => { x.qbo = { ...(x.qbo || {}), error: msg, at: new Date().toISOString() }; }).catch(() => {});
    throw e;
  }
}
async function qboPushBill(id: string, acct: Obj) {
  const d = await getDoc("pm_bill", id), b = d && d.data; if (!b) throw new Error("Bill not found");
  const q = b.qbo || {};
  if (b.status === "void") {
    if (q.billId && !q.paymentId) { const cur = (await qbo("GET", `bill/${q.billId}`)).Bill; await qbo("POST", "bill?operation=delete", { Id: q.billId, SyncToken: cur.SyncToken }); }
    else if (q.paymentId) throw new Error("Voided after it was paid — fix it in QuickBooks");
    await updateDoc("pm_bill", id, (x) => { x.qbo = { removed: true, at: new Date().toISOString() }; });
    return { ok: true };
  }
  if (!acct.qboExpense) throw new Error("Choose the expense account on Payments setup");
  const vendors = await vendorsDoc(), v = vendors.find((x) => x.id === b.vendorId) || { id: "name:" + S(b.vendor).toLowerCase(), name: b.vendor };
  const vid = await qboEnsure("Vendor", "vendors", v.id, v.name, v.email ? { PrimaryEmailAddr: { Address: v.email } } : {});
  const prop = await getDoc("pm_property", b.propertyId), pname = prop && prop.data ? prop.data.name : "";
  const body: Obj = { VendorRef: { value: vid }, TxnDate: b.date, PrivateNote: `PHD console bill ${b.id}${pname ? " · " + pname : ""}`.slice(0, 4000),
    Line: [{ DetailType: "AccountBasedExpenseLineDetail", Amount: Number(b.amount), Description: `${pname}${pname ? " — " : ""}${b.memo || b.category || "Bill"}`.slice(0, 4000), AccountBasedExpenseLineDetail: { AccountRef: { value: acct.qboExpense } } }] };
  if (b.due) body.DueDate = b.due;
  if (b.billNo) body.DocNumber = S(b.billNo).slice(0, 21);
  if (q.paymentId && q.billId) { /* paid in QuickBooks already: amounts are locked there */ }
  const billId = q.paymentId ? q.billId : await qboUpsert("Bill", q.billId || null, body);
  let paymentId = q.paymentId || "";
  if (b.status === "paid" && !paymentId) {
    if (!acct.qboBank) throw new Error("Choose the bank account vendor payments come out of, on Payments setup");
    const p = b.pay || {};
    const r = await qbo("POST", "billpayment", { VendorRef: { value: vid }, PayType: "Check", CheckPayment: { BankAccountRef: { value: acct.qboBank } }, TotalAmt: Number(b.amount), TxnDate: S(p.date || b.date).slice(0, 10),
      PrivateNote: `${p.method || ""}${p.ref ? " #" + p.ref : ""} · PHD console bill ${b.id}`.slice(0, 4000), Line: [{ Amount: Number(b.amount), LinkedTxn: [{ TxnId: billId, TxnType: "Bill" }] }] });
    paymentId = r.BillPayment.Id;
  }
  await updateDoc("pm_bill", id, (x) => { x.qbo = { billId, paymentId, at: new Date().toISOString(), stale: false, error: "" }; });
  return { ok: true, billId, paymentId };
}
async function qboPushInvoice(id: string, acct: Obj) {
  const d = await getDoc("pm_invoice", id), inv = d && d.data; if (!inv) throw new Error("Invoice not found");
  const q = inv.qbo || {};
  if (inv.status === "void") {
    if (q.invoiceId) { const cur = (await qbo("GET", `invoice/${q.invoiceId}`)).Invoice; await qbo("POST", "invoice?operation=void", { Id: q.invoiceId, SyncToken: cur.SyncToken }); }
    await updateDoc("pm_invoice", id, (x) => { x.qbo = { ...(x.qbo || {}), voided: true, at: new Date().toISOString() }; });
    return { ok: true };
  }
  if (inv.status === "draft") throw new Error("Send the invoice first — drafts stay out of QuickBooks");
  if (!acct.qboItemReimb) throw new Error("Choose the item for reimbursed bills on Payments setup");
  const feeC = (inv.lines || []).reduce((a: number, l: Obj) => a + cents(l.fee || 0), 0);
  if (feeC && !acct.qboItemFee) throw new Error("Choose the item for the admin fee on Payments setup");
  const o = await ownerOf(inv.ownerId); if (!o) throw new Error("Owner not found");
  const extra: Obj = {}; if (o.email) extra.PrimaryEmailAddr = { Address: o.email };
  if (o.address) extra.BillAddr = { Line1: o.address, City: o.city || undefined, CountrySubDivisionCode: o.state || undefined, PostalCode: o.zip || undefined };
  const cid = await qboEnsure("Customer", "customers", inv.ownerId, S(o.name || o.company), extra);
  const lines: Obj[] = (inv.lines || []).map((l: Obj) => ({ DetailType: "SalesItemLineDetail", Amount: Number(l.amount), Description: `${l.date} · ${l.property} · ${l.vendor} — ${l.desc}`.slice(0, 4000), SalesItemLineDetail: { ItemRef: { value: acct.qboItemReimb }, Qty: 1, UnitPrice: Number(l.amount) } }));
  if (feeC) lines.push({ DetailType: "SalesItemLineDetail", Amount: feeC / 100, Description: "Admin fee", SalesItemLineDetail: { ItemRef: { value: acct.qboItemFee }, Qty: 1, UnitPrice: feeC / 100 } });
  const body: Obj = { CustomerRef: { value: cid }, DocNumber: S(inv.no).slice(0, 21), TxnDate: inv.date, DueDate: inv.due || undefined, Line: lines, PrivateMemo: `PHD console invoice ${inv.id}`, CustomerMemo: { value: "Thank you for your continued business." } };
  if (o.email) body.BillEmail = { Address: o.email };
  const invoiceId = (q.payments && Object.keys(q.payments).length) ? q.invoiceId : await qboUpsert("Invoice", q.invoiceId || null, body);
  const done: Obj = { ...(q.payments || {}) };
  for (const p of inv.payments || []) {
    if (done[p.id]) continue;
    const pb: Obj = { CustomerRef: { value: cid }, TotalAmt: Number(p.amount), TxnDate: S(p.date).slice(0, 10), PaymentRefNum: S(p.ref || p.nickelPaymentId || "").slice(0, 21) || undefined, PrivateNote: `${p.method || ""} · PHD console ${inv.no}`, Line: [{ Amount: Number(p.amount), LinkedTxn: [{ TxnId: invoiceId, TxnType: "Invoice" }] }] };
    if (acct.qboDeposit) pb.DepositToAccountRef = { value: acct.qboDeposit };
    done[p.id] = (await qbo("POST", "payment", pb)).Payment.Id;
  }
  await updateDoc("pm_invoice", id, (x) => { x.qbo = { invoiceId, payments: done, at: new Date().toISOString(), error: "" }; });
  return { ok: true, invoiceId };
}

/* ====================================================================
   ROUTER
   ==================================================================== */
async function status(email: string) {
  const out: Obj = { nickel: { ok: false, env: NK_ENV }, qbo: await qboStatus() };
  if (NK_KEY) {
    try { const map = await nkMap(); out.nickel = { ok: true, env: NK_ENV, payMethods: await nkPayMethods(), payers: await payers(), lastRefresh: map.lastRefresh || "" }; out.nickel.canPay = out.nickel.payers.includes(email); }
    catch (e) { out.nickel = { ok: false, env: NK_ENV, error: String((e as Error).message || e) }; }
  } else out.nickel.error = "Add NICKEL_API_KEY in Supabase → Edge Functions → Secrets.";
  return out;
}
/* ---------- Nickel MCP (free plan). Read-only probe for now: lists the tools, never calls one that changes anything. ---------- */
let mcpSession = "";
async function mcpRpc(method: string, params: Obj = {}, notify = false): Promise<any> {
  if (!NK_MCP_TOKEN) throw new Error("Add NICKEL_MCP_TOKEN in Supabase → Edge Functions → Secrets.");
  const headers: Obj = { "Authorization": "Bearer " + NK_MCP_TOKEN, "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
  if (mcpSession) headers["Mcp-Session-Id"] = mcpSession;
  const msg: Obj = { jsonrpc: "2.0", method, params }; if (!notify) msg.id = crypto.randomUUID();
  const r = await fetch(NK_MCP_URL, { method: "POST", headers, body: JSON.stringify(msg) });
  const sid = r.headers.get("mcp-session-id"); if (sid) mcpSession = sid;
  const text = await r.text();
  if (!r.ok) throw new Error(`Nickel MCP ${r.status}: ${text.slice(0, 300)}`);
  if (notify || !text.trim()) return null;
  let data: any = null;
  if ((r.headers.get("content-type") || "").includes("event-stream")) {
    for (const line of text.split(/\r?\n/)) if (line.startsWith("data:")) { try { const d = JSON.parse(line.slice(5)); if (d.id === msg.id) data = d; } catch { /* skip */ } }
  } else data = JSON.parse(text);
  if (!data) throw new Error("Nickel MCP sent no answer");
  if (data.error) throw new Error("Nickel MCP: " + (data.error.message || JSON.stringify(data.error)));
  return data.result;
}
async function mcpOpen() {
  mcpSession = "";
  const init = await mcpRpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "phd-billing-console", version: "1.0" } });
  await mcpRpc("notifications/initialized", {}, true);
  return init;
}
async function mcpProbe() {
  const init = await mcpOpen();
  const tools: Obj[] = [];
  let cursor: string | undefined;
  do { const r = await mcpRpc("tools/list", cursor ? { cursor } : {}); tools.push(...(r.tools || [])); cursor = r.nextCursor; } while (cursor);
  const want = /^(propose_plan|pay_bill|create_bill|search_bills|get_bill_payment|check_bill_approval|create_invoice|send_invoice|search_invoices|get_invoice|create_vendor|search_vendors|create_customer|search_customers|get_plan|.*plan.*|.*approv.*)$/;
  return {
    server: init && init.serverInfo, protocol: init && init.protocolVersion, count: tools.length,
    names: tools.map((t) => t.name).sort(),
    detail: tools.filter((t) => want.test(t.name)).map((t) => ({ name: t.name, description: t.description, input: t.inputSchema, annotations: t.annotations })),
  };
}

Deno.serve(async (req) => {
  touched.clear();
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("qbo") === "callback") {
    try { return await qboCallback(url); } catch (e) { return page("QuickBooks wasn't connected", String((e as Error).message || e)); }
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SRV) return json({ error: "SUPABASE_SERVICE_ROLE_KEY isn't available to the function" }, 500);
  try {
    const body = await req.json().catch(() => ({})) as Obj;
    const mode = S(body.mode);
    if (mode === "nickel.refresh" && await isSchedule(req)) return json(await nkRefresh());
    if (mode === "nkmcp.probe" && await isSchedule(req)) return json(await mcpProbe());
    const who = await caller(req);
    if (!who.staff) return json({ error: "Not on the team list" }, 403);
    const done = (r: Obj) => json({ ...r, docs: [...touched] });
    switch (mode) {
      case "status": return json(await status(who.email));
      case "nickel.plan": return done(await nkPlan((body.billIds || []).map(S), who.email));
      case "nickel.pay": return done(await nkPay((body.billIds || []).map(S), S(body.payMethodId), S(body.date), who.email));
      case "nickel.cancel": return done(await nkCancel(S(body.billId), who.email));
      case "nickel.askVendor": return done(await nkAskVendor(S(body.vendorId)));
      case "nickel.invoice": return done(await nkInvoice(S(body.id), (body.emails || []).map(S), !!body.card, who.email));
      case "nickel.external": return done(await nkExternal(S(body.id), S(body.paymentId)));
      case "nickel.voidInvoice": return done(await nkVoidInvoice(S(body.id)));
      case "nickel.refresh": return done(await nkRefresh());
      case "nkmcp.probe": return json(await mcpProbe());
      case "qbo.connect": return json(await qboConnect(who.email));
      case "qbo.disconnect": return json(await qboDisconnect());
      case "qbo.push": return done(await qboPush(S(body.kind), S(body.id)));
      default: return json({ error: "Unknown mode" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e), docs: [...touched] }, 200);
  }
});
