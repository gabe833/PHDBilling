// PHD Billing — QuickBooks Online (Supabase Edge Function "qbo")
// ---------------------------------------------------------------------
// Reads the company's books and saves a snapshot the console uses to check
// project expenses against QuickBooks: bank and credit-card accounts (with
// balances), the chart of accounts, vendors, customers/projects, classes,
// and every posted expense since the first project (expenses, checks,
// card charges and credits, bills, vendor credits).
//
// It changes QuickBooks only when a person on the team asks it to, one
// confirmed batch at a time: the category (account), customer/project,
// class and billable flag on expense lines, and journal entries that move
// the cost of PHD inventory used on a project into that project's materials.
// It never deletes or pays anything, and never touches bank feeds or reconciliations.
//
// Keys live in Supabase → Edge Functions → Secrets (never in the browser):
//   QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENV (production | sandbox)
// Sign-in tokens are kept in public.private_settings ("qbo_tokens"), which no browser can read.
//
// Modes (POST body {mode}):
//   status      connected? company name                     (team)
//   sync        read QuickBooks and save the snapshot       (team, or the hourly schedule)
//   apply       change categories on expense lines          (team) {changes:[{type,id,line,account?,customer?,cls?,billable?}]}
//   journal     inventory used on a project: asset → materials (team) {entries:[{ref,date,amount,debit,credit,customer?,memo}]}
//   connect     sign-in link to (re)connect QuickBooks      (team)
//   disconnect  revoke and forget the sign-in               (team)
// GET ?qbo=callback is where Intuit sends the browser back after signing in.

const SB = Deno.env.get("SUPABASE_URL")!;
const SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const QBO_ID = (Deno.env.get("QBO_CLIENT_ID") || "").trim();
const QBO_SECRET = (Deno.env.get("QBO_CLIENT_SECRET") || "").trim();
const QBO_ENV = /^sandbox$/i.test(Deno.env.get("QBO_ENV") || "") ? "sandbox" : "production";
const QBO_BASE = QBO_ENV === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_REDIRECT = SB + "/functions/v1/qbo?qbo=callback";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
type Obj = Record<string, any>;
const S = (v: unknown) => (v == null ? "" : String(v));
const N = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? 0 : Math.round(Number(v) * 100) / 100);
const todayNY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

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
async function getDoc(kind: string, id: string): Promise<Obj | null> {
  const j = await (await rest(`docs?select=data&kind=eq.${kind}&id=eq.${encodeURIComponent(id)}&deleted=is.false`)).json();
  return j.length ? j[0].data : null;
}
async function saveSnapshot(data: unknown) {
  await rest("docs?on_conflict=kind,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ kind: "shared", id: "qbo", data, deleted: false }) });
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
// the hourly schedule sends a token only the database knows; with it the function can run "sync" and nothing else
async function isSchedule(req: Request): Promise<boolean> {
  const given = req.headers.get("x-md-cron") || "";
  if (given.length < 32) return false;
  return (await getSetting("md_cron_token")) === given;
}

/* ---------- QuickBooks sign-in ---------- */
type Tok = { access: string; refresh: string; exp: number; realmId: string; at?: string; by?: string };
async function tokenCall(params: Record<string, string>) {
  const r = await fetch(QBO_TOKEN_URL, { method: "POST", headers: { Authorization: "Basic " + btoa(QBO_ID + ":" + QBO_SECRET), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error === "invalid_grant" ? "QuickBooks needs to be connected again (the sign-in expired or was revoked)" : "QuickBooks sign-in: " + (j.error_description || j.error || r.status));
  return j;
}
let tokCache: Tok | null = null;
async function tok(force = false): Promise<Tok> {
  if (!(QBO_ID && QBO_SECRET)) throw new Error("QBO_CLIENT_ID and QBO_CLIENT_SECRET aren't set in Supabase → Edge Functions → Secrets");
  const t: Tok | null = tokCache || JSON.parse((await getSetting("qbo_tokens")) || "null");
  if (!t) throw new Error("QuickBooks isn't connected");
  if (!force && Date.now() < t.exp - 90000) { tokCache = t; return t; }
  const j = await tokenCall({ grant_type: "refresh_token", refresh_token: t.refresh });
  const n: Tok = { ...t, access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + Number(j.expires_in || 3600) * 1000 };
  await setSetting("qbo_tokens", JSON.stringify(n));        // Intuit rotates the refresh token: always keep the newest
  tokCache = n; return n;
}
async function qbo(method: string, path: string, body?: unknown, retry = true): Promise<any> {
  const t = await tok();
  const url = `${QBO_BASE}/v3/company/${t.realmId}/${path}${path.includes("?") ? "&" : "?"}minorversion=75`;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { method, headers: { Authorization: "Bearer " + (tokCache || t).access, Accept: "application/json", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (r.status === 401 && retry) { await tok(true); return qbo(method, path, body, false); }
    if ((r.status === 429 || r.status >= 500) && attempt < 2) { await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1))); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.Fault) {
      const e = ((j.Fault && j.Fault.Error) || [])[0] || {};
      const err = new Error(e.Message ? `${e.Message}${e.Detail ? " — " + e.Detail : ""}` : `QuickBooks answered ${r.status}`) as Error & { code?: string };
      err.code = S(e.code); throw err;
    }
    return j;
  }
}
const qq = (s: string) => S(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function queryAll(entity: string, where = "", fields = "*"): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let start = 1; start < 50000; start += 1000) {
    const q = `select ${fields} from ${entity}${where ? " where " + where : ""} startposition ${start} maxresults 1000`;
    const page = ((await qbo("GET", "query?query=" + encodeURIComponent(q))).QueryResponse || {})[entity] || [];
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

/* ---------- the snapshot: only what matching and categorizing need ---------- */
const ref = (r: Obj | undefined) => (r && r.value ? { id: S(r.value), name: S(r.name) } : null);
function cleanLine(l: Obj) {
  const a = l.AccountBasedExpenseLineDetail, i = l.ItemBasedExpenseLineDetail, d = a || i || {};
  if (!a && !i) return null;                                    // subtotals, discounts and the like
  return {
    id: S(l.Id), amount: N(l.Amount), desc: S(l.Description).slice(0, 200), kind: a ? "account" : "item",
    account: ref(a && a.AccountRef), item: ref(i && i.ItemRef), customer: ref(d.CustomerRef), cls: ref(d.ClassRef),
    billable: S(d.BillableStatus),                               // Billable | NotBillable | HasBeenBilled
  };
}
function cleanTxn(type: string, x: Obj) {
  const credit = type === "VendorCredit" || (type === "Purchase" && x.Credit === true);
  const lines = ((x.Line as Obj[]) || []).map(cleanLine).filter(Boolean);
  return {
    type, id: S(x.Id), date: S(x.TxnDate), doc: S(x.DocNumber).slice(0, 40), memo: S(x.PrivateNote).slice(0, 200),
    payType: S(x.PaymentType),                                   // Purchase: Cash | Check | CreditCard
    from: ref(x.AccountRef || x.APAccountRef),                    // the bank or card it came out of (A/P for bills)
    vendor: ref(x.EntityRef || x.VendorRef), credit,
    total: N(x.TotalAmt), balance: x.Balance != null ? N(x.Balance) : null, due: S(x.DueDate),
    created: S(x.MetaData && x.MetaData.CreateTime).slice(0, 19), updated: S(x.MetaData && x.MetaData.LastUpdatedTime).slice(0, 19),
    lines,
  };
}
async function sync() {
  const t0 = Date.now();
  const t = await tok();
  const ci = ((await qbo("GET", `companyinfo/${t.realmId}`)).CompanyInfo) || {};
  // how far back: the earliest project expense in the console (less a month), never before 2025
  let from = "2026-01-01";
  try {
    const r = await (await rest("docs?select=data->transactions&kind=eq.pj_property&deleted=is.false")).json();
    const ds = (r as Obj[]).flatMap((x) => ((x.transactions as Obj[]) || []).map((y) => S(y.date))).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort();
    if (ds.length) { const d = new Date(ds[0] + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 31); from = d.toISOString().slice(0, 10); }
  } catch { /* keep the default */ }
  if (from < "2025-01-01") from = "2025-01-01";
  const [accounts, vendors, customers, classes, items] = await Promise.all([
    queryAll("Account", "Active = true"),
    queryAll("Vendor", "Active = true"),
    queryAll("Customer", "Active = true"),
    queryAll("Class", "Active = true").catch(() => [] as Obj[]),           // classes may be switched off
    queryAll("Item", "Active = true"),
  ]);
  const notes: string[] = [];
  const pull = async (entity: string) => { try { return (await queryAll(entity, `TxnDate >= '${from}'`)).map((x) => cleanTxn(entity, x)); } catch (e) { notes.push(`${entity}: ${String((e as Error).message || e)}`); return []; } };
  const [purchases, bills, credits] = await Promise.all([pull("Purchase"), pull("Bill"), pull("VendorCredit")]);
  const snap = {
    v: 1, syncedAt: new Date().toISOString(), env: QBO_ENV, company: S(ci.CompanyName), from,
    accounts: accounts.map((a) => ({ id: S(a.Id), name: S(a.FullyQualifiedName || a.Name), type: S(a.AccountType), sub: S(a.AccountSubType), cls: S(a.Classification),
      balance: ["Bank", "Credit Card"].includes(S(a.AccountType)) ? N(a.CurrentBalance) : undefined })),
    vendors: vendors.map((v) => ({ id: S(v.Id), name: S(v.DisplayName) })),
    customers: customers.map((c) => ({ id: S(c.Id), name: S(c.DisplayName), full: S(c.FullyQualifiedName), parent: c.ParentRef ? S(c.ParentRef.value) : "", job: !!c.Job,
      addr: c.BillAddr ? [S(c.BillAddr.Line1), S(c.BillAddr.City)].filter(Boolean).join(", ") : "" })),
    classes: classes.map((c) => ({ id: S(c.Id), name: S(c.FullyQualifiedName) })),
    items: items.map((i) => ({ id: S(i.Id), name: S(i.FullyQualifiedName), type: S(i.Type), expAccount: i.ExpenseAccountRef ? S(i.ExpenseAccountRef.value) : "" })),
    txns: [...purchases, ...bills, ...credits].sort((a, b) => b.date.localeCompare(a.date)),
    notes, took: Math.round((Date.now() - t0) / 100) / 10,
  };
  await saveSnapshot(snap);
  return { ok: true, syncedAt: snap.syncedAt, company: snap.company, from, counts: { accounts: snap.accounts.length, vendors: snap.vendors.length, customers: snap.customers.length, purchases: purchases.length, bills: bills.length, credits: credits.length }, took: snap.took, notes };
}

/* ---------- categorize: change account / customer / class / billable on chosen expense lines ---------- */
// One QuickBooks record at a time: read it fresh (with its SyncToken), change only the named lines and fields,
// and save the whole line list back (QuickBooks replaces lines as a set). Nothing else on the record changes.
const ENTITY: Record<string, string> = { Purchase: "purchase", Bill: "bill", VendorCredit: "vendorcredit" };
async function apply(changes: Obj[], email: string) {
  if (!Array.isArray(changes) || !changes.length) throw new Error("Nothing to change");
  if (changes.length > 200) throw new Error("Too many at once — 200 lines at most");
  const byTxn = new Map<string, Obj[]>();
  for (const c of changes) {
    if (!ENTITY[S(c.type)] || !/^\d+$/.test(S(c.id)) || !/^\d+$/.test(S(c.line))) throw new Error("A change didn't name a QuickBooks expense line");
    const k = c.type + "/" + c.id; if (!byTxn.has(k)) byTxn.set(k, []); byTxn.get(k)!.push(c);
  }
  const results: Obj[] = [];
  for (const [k, cs] of byTxn) {
    const [type, id] = k.split("/");
    try {
      const cur = (await qbo("GET", `${ENTITY[type]}/${id}`))[type];
      const lines = structuredClone(cur.Line || []);
      for (const c of cs) {
        const l = lines.find((x: Obj) => S(x.Id) === S(c.line));
        if (!l) throw new Error(`line ${c.line} isn't on it any more`);
        if (c.expectAmount != null && Math.abs(N(l.Amount) - N(c.expectAmount)) > 0.005) throw new Error(`line ${c.line} changed in QuickBooks since the last sync`);
        const isAcct = !!l.AccountBasedExpenseLineDetail, d = l.AccountBasedExpenseLineDetail || l.ItemBasedExpenseLineDetail;
        if (!d) throw new Error(`line ${c.line} isn't an expense line`);
        if (c.account) { if (!isAcct) throw new Error(`line ${c.line} uses a product/service, so its category comes from that item`); d.AccountRef = { value: S(c.account) }; }
        if (c.customer !== undefined) { if (c.customer) d.CustomerRef = { value: S(c.customer) }; else delete d.CustomerRef; }
        if (c.cls !== undefined) { if (c.cls) d.ClassRef = { value: S(c.cls) }; else delete d.ClassRef; }
        if (c.billable) d.BillableStatus = c.billable === "Billable" ? "Billable" : "NotBillable";
        if (d.BillableStatus === "Billable" && !d.CustomerRef) d.BillableStatus = "NotBillable";   // QuickBooks requires a customer to bill
      }
      // a full update (the whole record as QuickBooks sent it, with the new lines) works for every expense type;
      // QuickBooks doesn't take a partial ("sparse") update of the lines on some of them
      const full: Obj = { ...cur, Line: lines };
      delete full.MetaData; delete full.PurchaseEx; delete full.domain; delete full.sparse;
      let saved: Obj;
      try { saved = (await qbo("POST", ENTITY[type], full))[type]; }
      catch (e1) {
        console.error(`apply ${type} ${id} full update: ${(e1 as Error).message}`);
        saved = (await qbo("POST", ENTITY[type], { Id: id, SyncToken: cur.SyncToken, sparse: true, Line: lines }))[type];
      }
      results.push({ type, id, ok: true, txn: cleanTxn(type, saved) });
    } catch (e) {
      const msg = String((e as Error).message || e).slice(0, 300);
      console.error(`apply ${type} ${id} failed: ${msg}`);
      results.push({ type, id, ok: false, error: msg });
    }
  }
  // fold the saved records into the snapshot so the console sees them right away
  const ok = results.filter((r) => r.ok);
  if (ok.length) {
    const snap = await getDoc("shared", "qbo");
    if (snap && Array.isArray(snap.txns)) {
      for (const r of ok) { const i = snap.txns.findIndex((x: Obj) => x.type === r.type && x.id === r.id); if (i >= 0) snap.txns[i] = r.txn; }
      snap.appliedAt = new Date().toISOString(); snap.appliedBy = email;
      await saveSnapshot(snap);
    }
  }
  return { ok: true, results: results.map(({ txn, ...r }) => r), changed: ok.length };
}

/* ---------- journal entries: inventory used on a project ----------
   Moves the cost of PHD inventory used on a project out of the inventory asset account and into the
   project's materials account, with the project's customer on the materials side. One entry per use;
   the console keeps the id so it's never posted twice. {entries:[{ref, date, amount, debit, credit, customer?, memo}]} */
async function journal(entries: Obj[], email: string) {
  if (!Array.isArray(entries) || !entries.length) throw new Error("Nothing to post");
  if (entries.length > 50) throw new Error("Too many at once — 50 entries at most");
  const results: Obj[] = [];
  for (const e of entries) {
    const amt = N(e.amount);
    try {
      if (!(amt > 0)) throw new Error("amount must be more than 0");
      if (!/^\d+$/.test(S(e.debit)) || !/^\d+$/.test(S(e.credit))) throw new Error("missing an account");
      if (!/^\d{4}-\d\d-\d\d$/.test(S(e.date))) throw new Error("missing a date");
      const memo = S(e.memo).slice(0, 4000);
      const debit: Obj = { PostingType: "Debit", AccountRef: { value: S(e.debit) } };
      if (/^\d+$/.test(S(e.customer))) debit.Entity = { Type: "Customer", EntityRef: { value: S(e.customer) } };
      const je = {
        TxnDate: S(e.date), DocNumber: S(e.doc || "").slice(0, 21) || undefined, PrivateNote: (memo + " · posted from the PHD billing console by " + email).slice(0, 4000),
        Line: [
          { DetailType: "JournalEntryLineDetail", Amount: amt, Description: memo.slice(0, 4000), JournalEntryLineDetail: debit },
          { DetailType: "JournalEntryLineDetail", Amount: amt, Description: memo.slice(0, 4000), JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: S(e.credit) } } },
        ],
      };
      const saved = (await qbo("POST", "journalentry", je)).JournalEntry || {};
      results.push({ ref: S(e.ref), ok: true, id: S(saved.Id), doc: S(saved.DocNumber), at: new Date().toISOString() });
    } catch (err) {
      const msg = String((err as Error).message || err).slice(0, 300);
      console.error(`journal ${S(e.ref)} failed: ${msg}`);
      results.push({ ref: S(e.ref), ok: false, error: msg });
    }
  }
  return { ok: true, results, posted: results.filter((r) => r.ok).length };
}

/* ---------- connect / disconnect ---------- */
async function qboStatus() {
  const out: Obj = { configured: !!(QBO_ID && QBO_SECRET), env: QBO_ENV, redirectUri: QBO_REDIRECT, connected: false };
  if (!out.configured) return out;
  const raw = await getSetting("qbo_tokens"); if (!raw) return out;
  try {
    const t = await tok(); const ci = (await qbo("GET", `companyinfo/${t.realmId}`)).CompanyInfo || {};
    out.connected = true; out.company = S(ci.CompanyName); out.since = S(t.at).slice(0, 10); out.by = S(t.by);
  } catch (e) { out.error = String((e as Error).message || e); }
  return out;
}
async function connect(email: string) {
  if (!(QBO_ID && QBO_SECRET)) throw new Error("Add QBO_CLIENT_ID and QBO_CLIENT_SECRET in Supabase → Edge Functions → Secrets first");
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await setSetting("qbo_state", JSON.stringify({ state, exp: Date.now() + 15 * 60000, by: email }));
  const u = new URL("https://appcenter.intuit.com/connect/oauth2");
  u.search = new URLSearchParams({ client_id: QBO_ID, response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: QBO_REDIRECT, state }).toString();
  return { url: u.toString(), redirectUri: QBO_REDIRECT };
}
const page = (title: string, msg: string) => new Response(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:15px system-ui;padding:40px;color:#1A2322"><h2 style="font-weight:600">${title}</h2><p>${msg}</p><script>setTimeout(()=>window.close(),2500)</script></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
async function callback(url: URL) {
  if (url.searchParams.get("error")) return page("QuickBooks wasn't connected", "The sign-in was cancelled. You can close this window.");
  const st = JSON.parse((await getSetting("qbo_state")) || "null");
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "", realmId = url.searchParams.get("realmId") || "";
  if (!st || st.state !== state || Date.now() > st.exp || !code || !/^\d+$/.test(realmId)) return page("QuickBooks wasn't connected", "This sign-in link expired or didn't come from the console. Press Connect again.");
  await delSetting("qbo_state");
  const j = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: QBO_REDIRECT });
  await setSetting("qbo_tokens", JSON.stringify({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + Number(j.expires_in || 3600) * 1000, realmId, at: new Date().toISOString(), by: st.by }));
  tokCache = null;
  try { await sync(); } catch { /* the next hourly sync picks it up */ }
  return page("QuickBooks is connected", "You can close this window and go back to the console.");
}
async function disconnect() {
  const t = JSON.parse((await getSetting("qbo_tokens")) || "null");
  if (t && QBO_ID) await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", { method: "POST", headers: { Authorization: "Basic " + btoa(QBO_ID + ":" + QBO_SECRET), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ token: t.refresh }) }).catch(() => {});
  await delSetting("qbo_tokens"); tokCache = null;
  return { ok: true };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("qbo") === "callback") {
    try { return await callback(url); } catch (e) { return page("QuickBooks wasn't connected", String((e as Error).message || e)); }
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SRV) return json({ error: "SUPABASE_SERVICE_ROLE_KEY isn't available to the function" }, 500);
  try {
    const body = await req.json().catch(() => ({})) as Obj;
    const mode = S(body.mode);
    if (mode === "sync" && await isSchedule(req)) return json(await sync());
    const who = await caller(req);
    if (!who.staff) return json({ error: "Not on the team list" }, 403);
    if (mode === "status") return json(await qboStatus());
    if (mode === "sync") return json(await sync());
    if (mode === "apply") return json(await apply(body.changes, who.email));
    if (mode === "journal") return json(await journal(body.entries, who.email));
    if (mode === "connect") return json(await connect(who.email));
    if (mode === "disconnect") return json(await disconnect());
    return json({ error: "Unknown mode" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 502);
  }
});
