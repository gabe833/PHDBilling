/* =====================================================================
   1099 Tax Center — preparation, reconciliation, export and filing tracking
   ---------------------------------------------------------------------
   The console does NOT file anything with the IRS. It works out who gets
   a 1099 and for how much, shows every payment behind each amount, checks
   the data, exports approved recipients for the filing service or IRIS,
   and tracks what staff record happened after that (submitted, accepted,
   rejected, copies delivered, corrections). Statuses past "Exported" are
   only ever set by a person, with the provider's own confirmation details.

   Recipients (one per tax identity)
     · Owners → 1099-MISC box 1 (rents): rent collected for them, from the
       statement rows. Gross rent, other owner income, fees, repairs and net
       paid out are kept apart; box 1 is gross rent unless the year is set
       otherwise (net needs the CPA's sign-off recorded).
     · Vendors → 1099-NEC box 1: what PHD paid them, from paid rental bills,
       project expenses, MagicDoor bills, QuickBooks imports and outside
       payments recorded here. Card payments are left out (1099-K).
     · One recipient can carry several owner records or vendor names
       (links); their amounts add up on one form.
   Payments are never changed: staff decisions (category, payment date,
   duplicate yes/no, exclusions, adjustments) sit on top of the original
   values, each with a reason, and every change is written to the audit log.

   Thresholds: $600 through 2025; $2,000 for payments in 2026 (One Big
   Beautiful Bill Act; indexed for inflation after 2026 — set per year).

   Tax ID numbers are never typed in or stored here. They stay on the
   W-9s and are entered at the filing service / IRIS.

   Storage (table "docs", kind "shared" — nothing new in the database):
     shared/tax1099      year settings, filing method + IRIS TCC status,
                         payment decisions, outside payments, audit log
     shared/t9r:<id>     one record per tax recipient (identity, links,
                         W-9 tracking, adjustments, filing status by year)
   ===================================================================== */
(function(){
if(typeof render !== "function" || typeof pmState !== "function") return;

/* ---------- store ---------- */
const T = () => { S.tax1099 = S.tax1099 && typeof S.tax1099 === "object" ? S.tax1099 : {}; const t = S.tax1099;
  t.years = t.years || {}; t.vendors = t.vendors || {}; t.owners = t.owners || {}; t.alias = t.alias || {};
  t.pay = t.pay || {}; t.manual = Array.isArray(t.manual) ? t.manual : []; t.filing = t.filing || {}; t.log = Array.isArray(t.log) ? t.log : [];
  t.vcat = t.vcat || {}; t.self = t.self || {}; t.exports = Array.isArray(t.exports) ? t.exports : []; return t; };
const RD = () => (S.t9r = S.t9r && typeof S.t9r === "object" ? S.t9r : {});
const me = () => (typeof Cloud !== "undefined" && Cloud.email) || "This browser";
const C = x => x == null || x === "" ? 0 : cents(x);
const key = s => (typeof mdVendorLoose === "function" ? mdVendorLoose(s) : String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
const nk = s => String(s || "").toLowerCase().replace(/\b(llc|inc|co|corp|corporation|company|the)\b/g, "").replace(/[^a-z0-9]/g, "");
const PHD_SELF = /^phd(propert|propertymanagement|properties|handyman|realty)?/;    // a suggestion only — staff confirm it
const GOODS_HINT = /^(lowes|homedepot|amazon|costco|walmart|target|sherwinwilliams|ferguson|grainger|acehardware|menards|samsclub|dominion|charlestonwater|sceg|santeecooper|berkeleyelectric|comcast|xfinity|att|verizon|spectrum|republicservices)/; // suggestion only
const LAW_HINT = /attorney|law ?(firm|office|group)|\besq\b|legal/i;
const rid8 = () => Math.random().toString(36).slice(2, 10);
const fY = iso => { if(!iso) return ""; const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"}); };
const dn = iso => PMCore.dayNum(String(iso).slice(0, 10));
const yearCfg = y => { const c = T().years[y] || {}, def = Number(y) >= 2026 ? 2000 : 600;
  return {threshold:c.threshold != null ? Number(c.threshold) : def, thresholdMisc:c.thresholdMisc != null ? Number(c.thresholdMisc) : (c.threshold != null ? Number(c.threshold) : def),
    ownerBasis:c.ownerBasis || "gross", cpaNote:c.cpaNote || ""}; };
let RC = null; const dirty = () => { RC = null; };

const CLS = [["", "Not set"], ["individual", "Individual / sole proprietor"], ["smllc", "Single-member LLC (disregarded)"], ["llc", "LLC — tax classification not set"], ["llc_p", "LLC taxed as a partnership"], ["llc_s", "LLC taxed as an S corporation"], ["llc_c", "LLC taxed as a C corporation"], ["partnership", "Partnership"], ["scorp", "S corporation"], ["ccorp", "C corporation"], ["trust", "Trust / estate"], ["exempt", "Tax-exempt organization / government"], ["other", "Other"]];
const CORPISH = new Set(["llc_s", "llc_c", "scorp", "ccorp", "exempt"]);
const clsLabel = k => (CLS.find(c => c[0] === (k || "")) || CLS[0])[1];
const CATS = [["", "Not categorized yet"], ["service", "Services (labor — incl. parts and materials used on the job)"], ["goods", "Goods / merchandise only"], ["utility", "Utilities, telecom or freight"], ["nr", "Not reportable — other reason"]];
const catLabel = k => (CATS.find(c => c[0] === (k || "")) || CATS[0])[1];
const W9S = [["none", "Not requested"], ["sent", "Request sent"], ["waiting", "Awaiting response"], ["received", "Received"], ["verified", "Verified"], ["fix", "Needs correction"]];
const w9Label = k => (W9S.find(c => c[0] === k) || W9S[0])[1];
const TINS = [["", "Not checked"], ["w9", "Matches the W-9 (reviewed by staff)"], ["match", "IRS TIN matching — matched"], ["fail", "IRS TIN matching — no match"]];
const FS = [["not_reviewed", "Not reviewed"], ["needs_info", "Needs information"], ["ready", "Ready for review"], ["approved", "Approved for filing"], ["exported", "Exported"], ["submitted", "Submitted"], ["accepted", "IRS accepted"], ["rejected", "IRS rejected"], ["delivered", "Recipient copy delivered"], ["correction", "Correction required"], ["complete", "Complete"]];
const formShort = f => ({"NEC-1":"1099-NEC", "MISC-1":"1099-MISC (rents)", "MISC-10":"1099-MISC box 10", "none":"None"})[f] || f;
const fsLabel = k => (FS.find(c => c[0] === k) || FS[0])[1];
const fsTag = k => ({not_reviewed:"grey", needs_info:"gold", ready:"", approved:"green", exported:"green", submitted:"green", accepted:"green", rejected:"red", delivered:"green", correction:"red", complete:"green"})[k] || "";
const FORMS = {"NEC-1":"1099-NEC box 1 (nonemployee compensation)", "MISC-1":"1099-MISC box 1 (rents)", "MISC-10":"1099-MISC box 10 (gross proceeds paid to an attorney)", "none":"No 1099"};
const METHODS = [["qbo", "QuickBooks Online"], ["tax1099", "Tax1099"], ["avalara", "Avalara 1099 & W-9"], ["iris", "IRS IRIS Taxpayer Portal"], ["other", "Other third-party filing service"]];
const methodLabel = k => (METHODS.find(m => m[0] === k) || [, "Not chosen"])[1];
const IRIS_TCC_URL = "https://www.irs.gov/tax-professionals/iris-application-for-tcc";
const IRIS_URL = "https://www.irs.gov/iris", IRIS_PORTAL = "https://la.www4.irs.gov/irportal/", W9_URL = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";

/* ---------- audit log (never edited, only added to) ---------- */
function audit(rid, y, what){
  const e = {at:new Date().toISOString(), by:me(), rid:rid || "", y:String(y || ""), what};
  const t = T(); t.log = t.log.concat([e]).slice(-600);
  const d = rid && RD()[rid]; if(d) d.log = (d.log || []).concat([e]).slice(-200);
  try{ actLog("tax", `1099${y ? " " + y : ""}: ${what}`, {side:"pm"}); }catch(_){}
}
const save = fn => { snapshot(); fn(); dirty(); commit(); };

/* ---------- vendor payments, every system, every year ---------- */
function allVendorPays(){
  const out = [], vlist = typeof pmVendors === "function" ? pmVendors() : [];
  const byKey = new Map(); vlist.forEach(v => byKey.set(key(v.name), v));
  Object.entries(T().alias).forEach(([k, vid]) => { const v = vlist.find(x => x.id === vid); if(v) byKey.set(k, v); });
  const who = name => byKey.get(key(name)) || null;
  // MagicDoor bill ID → console bill, from the statement lines that carry both
  const mdToBill = new Map(); Object.values(pmState().rows).forEach(r => { if(!r || r.deleted) return; (r.repairItems || []).forEach(it => { if(it.billId && it.mdBill) mdToBill.set(String(it.mdBill), it.billId); }); });
  // 1. rental bills paid from the console — payment date
  (typeof billList === "function" ? billList() : []).forEach(b => { if(b.status !== "paid") return; const d = String((b.pay && b.pay.date) || "").slice(0, 10); if(!d) return;
    const how = String((b.pay && b.pay.method) || ""), card = /card|amex|visa|mastercard|paypal|venmo/i.test(how);
    out.push({pk:"bill:" + b.id, src:"Rental bill", sys:"PHD Console", id:b.id, ref:(b.pay && b.pay.ref) || "", date:d, dateKind:"paid", billDate:String(b.date || "").slice(0, 10), name:b.vendor,
      v:b.vendorId ? vlist.find(x => x.id === b.vendorId) || who(b.vendor) : who(b.vendor), amountC:cents(b.amount), card, how:how || "—", where:(pmProp(b.propertyId) || {}).name || ""}); });
  // 2. project expenses paid to a vendor — Nickel / recorded payment date, otherwise the expense date
  (S.properties || []).forEach(p => (p.transactions || []).forEach(t => { if(!t.vendor || !(Number(t.amount) > 0)) return;
    if(typeof pjVendorOpen === "function" && pjVendorOpen(t)) return;
    const np = t.nickelPay && !t.nickelPay.dismissed && t.nickelPay.date, vp = t.vendorPaid && t.vendorPaid.date;
    const d = String(np || vp || t.date || "").slice(0, 10); if(!d) return;
    const how = t.nickelPay ? "Nickel" : t.vendorPaid ? (t.vendorPaid.method || "Paid") : "Project expense";
    out.push({pk:"pj:" + p.id + ":" + t.id, src:"Project expense", sys:"PHD Console (projects)", id:t.id, ref:(t.nickelPay && (t.nickelPay.id || t.nickelPay.ref)) || "", date:d, dateKind:np || vp ? "paid" : "txn", billDate:String(t.date || "").slice(0, 10),
      name:t.vendor, v:who(t.vendor), amountC:cents(t.amount), card:/card/i.test(how), how, where:p.name + " (project)"}); }));
  // 3. MagicDoor bills paid in full — MagicDoor gives the bill date, not the payment date
  ((S.md && S.md.bills) || []).forEach(b => { if(!b.date || C(b.owed) !== 0 || !(Number(b.total) > 0)) return;
    const k = key(b.vendor), prop = (b.lines || [])[0] && ((S.md && S.md.properties) || []).find(pp => pp.id === b.lines[0].propertyId);
    const x = {pk:"md:" + b.id, src:"MagicDoor bill", sys:"MagicDoor", id:b.id, ref:b.ref || "", date:String(b.date).slice(0, 10), dateKind:"bill", billDate:String(b.date).slice(0, 10), name:b.vendor, v:who(b.vendor),
      amountC:cents(b.total), card:false, how:"MagicDoor", where:prop ? prop.name : b.company ? "PHD (company bill)" : "", memo:b.memo || "", accounts:[...new Set((b.lines || []).map(l => l.account).filter(Boolean))].join(", ")};
    const linked = mdToBill.get(String(b.id)), twinId = linked && out.find(o => o.pk === "bill:" + linked);
    if(twinId){ x.dupOf = twinId.pk; x.dupBy = "id"; x.dupWhy = "the console bill carries this MagicDoor bill's ID"; }
    else { const twin = out.find(o => o.src === "Rental bill" && key(o.name) === k && o.amountC === x.amountC && Math.abs(dn(o.date) - dn(x.date)) <= 21 && !o.mdTwin);
      if(twin){ twin.mdTwin = x.pk; x.dupOf = twin.pk; x.dupBy = "match"; x.dupWhy = "same vendor and amount, dates within 21 days"; } }
    out.push(x); });
  // 4. QuickBooks imports and outside payments recorded here
  T().manual.forEach(m => { if(!m || m.deleted) return;
    const x = {pk:"mn:" + m.id, src:m.sys === "qbo" ? "QuickBooks import" : "Outside payment", sys:m.sys === "qbo" ? "QuickBooks" : "Recorded in the console", id:m.id, ref:m.ref || "", date:String(m.date || "").slice(0, 10), dateKind:"paid",
      billDate:"", name:m.name, v:m.vendorId ? vlist.find(v => v.id === m.vendorId) || who(m.name) : who(m.name), amountC:C(m.amount), card:/card|paypal|venmo/i.test(m.method || ""), how:m.method || "—", where:m.where || "", memo:m.note || "", file:m.file || ""};
    const twin = out.find(o => !o.pk.startsWith("mn:") && !o.dupOf && key(o.name) === key(x.name) && o.amountC === x.amountC && Math.abs(dn(o.date) - dn(x.date)) <= 7);
    if(twin){ x.dupOf = twin.pk; x.dupBy = "match"; x.dupWhy = "same vendor and amount, dates within 7 days"; }
    out.push(x); });
  // 5. Office pay runs recorded as paid — base pay, hours, work invoices, commissions and bonuses; reimbursements are left out
  //    (paying back someone's own expense isn't income). One payment per person per run, dated the day the run was paid.
  if(typeof ofRuns === "function" && typeof ofAll === "function") ofRuns().filter(r => r.status === "paid").forEach(r => (r.lines || []).forEach(l => {
    const d = String(r.paidOn || r.payDate || "").slice(0, 10); if(!d) return;
    const p = typeof ofPerson === "function" ? ofPerson(l.person) : null, name = (p && p.name) || l.name || "Someone";
    const items = (l.entries || []).map(k => ofAll()[k]).filter(Boolean), reimbC = items.filter(e => e.kind === "expense").reduce((a, e) => a + ofEntryC(e), 0);
    const amt = (+l.baseC || 0) + items.filter(e => e.kind !== "expense").reduce((a, e) => a + ofEntryC(e), 0); if(!amt) return;
    const kinds = [...new Set(items.filter(e => e.kind !== "expense").map(e => (typeof OF_KIND !== "undefined" && OF_KIND[e.kind]) || e.kind))].concat(+l.baseC ? ["Base pay"] : []);
    out.push({pk:"of:" + r._id + ":" + l.person, src:"Office pay run", sys:"PHD Console (Office)", id:r._id, ref:(l.nickel && l.nickel.ref) || "", date:d, dateKind:"paid", billDate:"", name, v:who(name),
      amountC:amt, card:false, how:r.method || "Pay run", where:`Office pay ${fY(r.periodStart)} – ${fY(r.periodEnd)}`, memo:kinds.join(", ") + (reimbC ? ` · leaves out ${usd(reimbC)} of reimbursements` : ""),
      person:l.person, w2:!!(p && p.taxForm === "w2"), defCat:"service", reimbC});
  }));
  out.forEach(x => { x.gk = x.v ? "v:" + x.v.id : "n:" + key(x.name); const o = T().pay[x.pk] || {};
    x.o = o; x.effDate = o.paidDate || x.date; x.dateOk = x.dateKind === "paid" || !!o.paidDate || !!o.dateOk; });
  return out;
}
// how one payment counts
function payCalc(x, y){
  const o = x.o || {}, ov = (T().vendors[x.gk] || {})[y] || {}, tax = (x.v && x.v.tax) || {};
  if(x.dupOf && !o.notDup) return {inc:false, rep:0, ex:"dup", why:`Counted once — same payment as ${x.dupOf.split(":")[0] === "bill" ? "a console bill" : x.dupOf.split(":")[0] === "md" ? "a MagicDoor bill" : "another record"} (${x.dupWhy})`};
  if(x.card) return {inc:false, rep:0, ex:"card", why:"Paid by card or a payment app — the processor reports it on a 1099-K"};
  if(o.exclude) return {inc:false, rep:0, ex:"manual", why:o.why || "Left out"};
  if(x.w2 && !o.cat) return {inc:false, rep:0, ex:"cat", cat:"nr", why:"Employee pay (W-2 payroll) — reported on a W-2, not a 1099. Change it on the person in Office → People."};
  const cat = o.cat || T().vcat[x.gk] || x.defCat || (ov.kind === "goods" ? "goods" : ov.kind === "include" || tax.f1099 === "yes" ? "service" : "");
  if(cat === "goods" || cat === "utility" || cat === "nr") return {inc:false, rep:0, ex:"cat", cat, why:catLabel(cat) + (o.why ? " — " + o.why : "")};
  return {inc:true, rep:x.amountC, cat, why:cat ? "" : "Not categorized yet — counted until someone decides"};
}

/* ---------- owners: statement rows, every amount kept apart ---------- */
function ownerLines(y){
  const P2 = pmState(), rows = Object.values(P2.rows).filter(r => r && !r.deleted && !r.detailOnly && String(r.month || "").startsWith(y));
  const seen = new Map(); rows.forEach(r => { const k = r.propertyId + "|" + r.month; seen.set(k, (seen.get(k) || 0) + 1); });
  const cur = todayISO().slice(0, 7);
  return rows.map(r => { const p = pmProp(r.propertyId); if(!p) return null; const c = pmCalc(r, p), o = ownerById(p.ownerId);
    const L = {pk:"row:" + r.id, rowId:r.id, month:r.month, propertyId:p.id, where:p.name, ownerId:o ? o.id : "-", rentC:c.recv || 0, dueC:c.dueC || 0, otherC:c.otherC || 0,
      feeC:(c.pmFeeC || 0) + (c.feeAdjC || 0), leasingC:c.leasingC || 0, repairsC:(c.repairsC || 0), adminC:c.adminC || 0, adjC:(c.adjC || 0) + (c.feeAdjC || 0), netC:c.payoutC || 0,
      paidC:r.paidOut ? cents(r.paidOut.amount || 0) : 0, paidDate:r.paidOut ? String(r.paidOut.date || r.paidOut.at || "").slice(0, 10) : "", locked:!!r.locked};
    L.o = T().pay[L.pk] || {}; L.flags = [];
    if(seen.get(p.id + "|" + r.month) > 1) L.flags.push({k:"duprow", lv:"block", t:`Two statement rows for ${p.name}, ${r.month} — both are counted. Leave one out or confirm both are real.`});
    if(L.rentC < 0) L.flags.push({k:"neg", lv:"warn", t:"Negative rent (refund, reversal or void) — it lowers the year's rent"});
    if(L.dueC > 0 && L.rentC > L.dueC * 1.5) L.flags.push({k:"prepaid", lv:"warn", t:`Rent collected (${usd(L.rentC)}) is well over rent due (${usd(L.dueC)}) — prepaid rent counts in the year it was received`});
    if(L.paidC && Math.abs(L.paidC - L.netC) > 100) L.flags.push({k:"paidnet", lv:"warn", t:`Paid out ${usd(L.paidC)} but the statement works out to ${usd(L.netC)} — check for a duplicate or missing distribution (box 1 uses rent, not payouts)`});
    if(!L.locked && r.month <= cur && Number(y) <= Number(cur.slice(0, 4))) L.flags.push({k:"open", lv:"warn", t:"Month isn't finalized yet — amounts can still change"});
    return L; }).filter(Boolean);
}
const lineRep = (L, cfg) => L.o.exclude ? 0 : cfg.ownerBasis === "net" ? Math.max(0, L.netC) : cfg.ownerBasis === "gross_other" ? L.rentC + L.otherC : L.rentC;

/* ---------- tax recipients ---------- */
const vrid = gk => "v-" + gk.replace(/[^a-z0-9]/gi, "_");
function vendorFromGk(gk){ return gk.startsWith("v:") ? (typeof pmVendors === "function" ? pmVendors().find(v => v.id === gk.slice(2)) : null) || null : null; }
function build(y){
  if(RC && RC.y === y && Date.now() - RC.at < 400) return RC.v;
  const cfg = yearCfg(y), pays = allVendorPays(), docs = RD();
  const VG = new Map(); pays.forEach(x => { const g = VG.get(x.gk) || {gk:x.gk, v:x.v, name:x.v ? x.v.name : x.name, names:new Set(), all:[]}; g.names.add(x.name); g.all.push(x); VG.set(x.gk, g); });
  const lines = ownerLines(y), OG = new Map(); lines.forEach(L => { const g = OG.get(L.ownerId) || []; g.push(L); OG.set(L.ownerId, g); });
  const claimO = new Map(), claimV = new Map(), live = Object.values(docs).filter(d => d && d.id && !d.deleted);
  live.forEach(d => { ((d.links || {}).owners || []).forEach(id => claimO.set(id, d.id)); ((d.links || {}).vendors || []).forEach(gk => claimV.set(gk, d.id)); });
  const list = live.map(d => assemble(y, cfg, d, VG, OG, false));
  OG.forEach((g, oid) => { if(oid !== "-" && !claimO.has(oid)) list.push(assemble(y, cfg, {id:"o-" + oid, type:"owner", links:{owners:[oid], vendors:[]}}, VG, OG, true)); });
  VG.forEach((g, gk) => { if(!claimV.has(gk) && g.all.some(x => String(x.effDate).startsWith(y) || nearPrev(x, y))) list.push(assemble(y, cfg, {id:vrid(gk), type:"vendor", links:{owners:[], vendors:[gk]}}, VG, OG, true)); });
  list.forEach(r => validate(r, y, cfg, list));
  const noOwner = OG.get("-") || [];
  const v = {list, cfg, noOwner, pays}; RC = {y, at:Date.now(), v}; return v;
}
// a bill-dated payment from the last weeks of the year before might have been paid in this year
const nearPrev = (x, y) => !x.dateOk && String(x.effDate).startsWith(String(Number(y) - 1)) && dn(x.effDate) >= dn(`${Number(y) - 1}-11-16`);
function assemble(y, cfg, d, VG, OG, virtual){
  const links = {owners:((d.links || {}).owners || []).slice(), vendors:((d.links || {}).vendors || []).slice()};
  const r = {id:d.id, doc:d, virtual, type:d.type || (links.owners.length ? "owner" : "vendor"), links, y};
  if(r.type === "owner"){
    const o0 = ownerById(links.owners[0]) || {}, info = T().owners[o0.id] || {};
    const ohW9 = o0.id && S.ownerHub && S.ownerHub[o0.id] && (S.ownerHub[o0.id].docs || []).find(x => x.type === "w9");
    const w9f = info.w9 || (ohW9 ? {date:ohW9.signed || "", url:ohW9.url} : null);
    Object.assign(r, {o0, legal:d.legal || info.payee || o0.name || (o0.id ? ownerLabel(o0) : ""), display:d.display || (o0.id ? ownerLabel(o0) : d.legal || "Owner"), cls:d.cls != null ? d.cls : (info.entity || ""),
      email:d.email != null ? d.email : (o0.email || ""), addr:d.addr || {line1:o0.address || "", line2:"", city:o0.city || "", state:o0.state || "", zip:o0.zip || ""},
      w9file:w9f, asked:info.w9Asked || "", legacyEx:info.exclude ? (info.note || "Marked not reportable") : "", attorney:false});
    r.joint = links.owners.some(id => { const o = ownerById(id); return o && /joint|\band\b|&/i.test(ownerLabel(o)); });
    r.lines = links.owners.flatMap(id => OG.get(id) || []);
    r.grossC = r.lines.reduce((a, L) => a + (L.o.exclude ? 0 : L.rentC), 0); r.otherC = r.lines.reduce((a, L) => a + (L.o.exclude ? 0 : L.otherC), 0);
    r.feeC = r.lines.reduce((a, L) => a + L.feeC + L.leasingC + L.adminC, 0); r.repairsC = r.lines.reduce((a, L) => a + L.repairsC, 0);
    r.netC = r.lines.reduce((a, L) => a + L.netC, 0); r.paidC = r.lines.reduce((a, L) => a + L.paidC, 0);
    r.baseC = r.lines.reduce((a, L) => a + lineRep(L, cfg), 0); r.thrC = Math.round(cfg.thresholdMisc * 100); r.autoForm = "MISC-1";
  } else {
    const g0 = VG.get(links.vendors[0]), v0 = (g0 && g0.v) || vendorFromGk(links.vendors[0] || "") || {}, tax = v0.tax || {};
    const legacy = links.vendors.map(gk => (T().vendors[gk] || {})[y] || {});
    Object.assign(r, {v0, legal:d.legal || v0.name || (g0 && g0.name) || "", display:d.display || v0.name || (g0 && g0.name) || "Vendor", cls:d.cls != null ? d.cls : (tax.entity || ""),
      email:d.email != null ? d.email : (v0.email || ""), addr:d.addr || {line1:v0.address || "", line2:"", city:v0.city || "", state:v0.state || "", zip:v0.zip || ""},
      w9file:v0.id && typeof vdW9 === "function" ? vdW9(v0) : null, asked:tax.w9Asked || "", attorney:d.attorney != null ? !!d.attorney : tax.attorney === true,
      legacyEx:legacy.find(ov => ov.kind === "exclude") ? (legacy.find(ov => ov.kind === "exclude").note || "Marked not reportable") : tax.f1099 === "no" ? "Set to no 1099 on the vendor" : "",
      forced:legacy.some(ov => ov.kind === "include") || tax.f1099 === "yes"});
    r.names = new Set(); r.pays = [];
    links.vendors.forEach(gk => { const g = VG.get(gk); if(!g) return; g.names.forEach(n => r.names.add(n));
      g.all.forEach(x => { const inYear = String(x.effDate).startsWith(y), maybe = nearPrev(x, y); if(!inYear && !maybe) return;
        const c = inYear ? payCalc(x, y) : {inc:false, rep:0, ex:"prev", why:`Bill dated ${fY(x.effDate)} — counted in ${Number(y) - 1} unless the payment date was in ${y}`};
        r.pays.push(Object.assign({}, x, {c, inYear, dateIssue:inYear && !x.dateOk && dn(x.effDate) >= dn(`${y}-11-16`)})); }); });
    r.pays.sort((a, b) => String(a.effDate).localeCompare(String(b.effDate)));
    const cnt = r.pays.filter(x => x.inYear && !(x.c.ex === "dup"));
    r.grossC = cnt.reduce((a, x) => a + x.amountC, 0); r.cardC = cnt.filter(x => x.c.ex === "card").reduce((a, x) => a + x.amountC, 0);
    r.exclC = cnt.filter(x => x.c.ex === "cat" || x.c.ex === "manual").reduce((a, x) => a + x.amountC, 0);
    r.pendC = cnt.filter(x => x.c.inc && !x.c.cat).reduce((a, x) => a + x.amountC, 0);
    r.baseC = cnt.reduce((a, x) => a + x.c.rep, 0); r.thrC = Math.round(cfg.threshold * 100); r.autoForm = "NEC-1";
    r.legacyAdj = legacy.map((ov, i) => ov.adjust ? {id:"legacy" + i, amountC:C(ov.adjust), why:(ov.note || "Earlier adjustment") + " (set before the Tax Center update)", by:"", at:""} : null).filter(Boolean);
  }
  r.adj = ((d.adj || {})[y] || []).concat(r.legacyAdj || []);
  r.adjC = r.adj.reduce((a, x) => a + (Number(x.amountC) || 0), 0);
  r.repC = Math.max(0, r.baseC + r.adjC);
  r.form = (d.formOv || {})[y] || r.autoForm;
  const w = d.w9 || {};
  r.w9s = w.status || (r.w9file ? "received" : r.asked ? "sent" : "none");
  r.w9date = w.received || (r.w9file && (r.w9file.date || String(r.w9file.at || "").slice(0, 10))) || "";
  r.w9url = w.url || (r.w9file && r.w9file.url) || "";
  r.w9reqs = (w.requests || []).slice(); if(r.asked && !r.w9reqs.length) r.w9reqs.push({at:r.asked, by:"", kind:"request (recorded earlier)"});
  r.tin = d.tin || "";
  const exY = (d.exclude || {})[y];
  r.selfSuggest = r.type === "vendor" && !T().self[r.id] && !(d.notSelf) && PHD_SELF.test(key(r.legal));
  r.exempt = exY ? "Not reportable — " + exY.why : r.legacyEx ? "Not reportable — " + r.legacyEx : T().self[r.id] ? "PHD's own company — not a 1099 recipient"
    : r.form === "none" ? "Set to no 1099" : CORPISH.has(r.cls) && !(r.type === "vendor" && r.attorney) ? (r.cls === "exempt" ? "Tax-exempt / government — generally no 1099" : "Corporation — no 1099" + (r.type === "vendor" ? " (unless legal or medical services)" : "")) : "";
  r.k = r.exempt ? "no" : (r.repC >= r.thrC || r.forced) && r.repC > 0 ? "potential" : "under";
  return r;
}

/* ---------- validation (blocking errors and warnings) ---------- */
function validate(r, y, cfg, all){
  const I = r.issues = [], B = (k, t) => I.push({lv:"block", k, t}), W = (k, t) => I.push({lv:"warn", k, t});
  const ack = ((r.doc.ack || {})[y]) || {};
  if(r.selfSuggest) B("self", "The name looks like PHD's own company — confirm (PHD can't send itself a 1099) or say it's a different business");
  if(r.k === "potential"){
    if(!r.legal) B("legal", "Legal name missing (as on the W-9, line 1)");
    if(!r.cls) B("cls", "Federal tax classification not set (W-9 line 3)");
    else if(r.cls === "llc") B("cls", "LLC — pick its tax classification from the W-9 (an LLC is not automatically exempt)");
    if(r.w9s === "fix") B("w9", "W-9 needs correction");
    else if(!["received", "verified"].includes(r.w9s)) B("w9", "No W-9 on file — the TIN for the form comes from it");
    if(r.tin === "fail") B("tin", "IRS TIN matching says the name and TIN don't match — get a corrected W-9");
    else if(r.tin !== "match" && r.tin !== "w9") W("tin", "Tax ID not checked yet (W-9 review or IRS TIN matching)");
    const a = r.addr || {}; if(!a.line1 || !a.city || !a.state || !a.zip) B("addr", "Mailing address incomplete (street, city, state, ZIP)");
    if(!r.email) W("email", "No email — the recipient copy will need to be mailed (email only with their consent)");
    if(r.type === "owner" && r.joint && !(r.doc.legal || (T().owners[(r.o0 || {}).id] || {}).payee)) B("joint", "Joint owners — set the legal name to the person whose TIN is on the W-9");
    if(r.type === "owner" && cfg.ownerBasis === "net" && !cfg.cpaNote) B("basis", "Box 1 is set to net paid out — record the CPA's confirmation in Filing setup, or use gross rent");
    if(r.type === "owner" && !["MISC-1"].includes(r.form)) W("form", `Owner set to ${FORMS[r.form] || r.form} — rents normally go in 1099-MISC box 1`);
    if(r.type === "vendor" && r.form === "MISC-1") W("form", "Vendor set to 1099-MISC box 1 (rents) — make sure these were rent payments");
    if(r.type === "vendor" && !r.attorney && LAW_HINT.test(r.legal)) W("law", "The name suggests legal services — tick Attorney if so (attorneys get a 1099-NEC even as a corporation)");
    if(r.type === "vendor" && !r.cls && GOODS_HINT.test(key(r.legal))) W("goodshint", "The name suggests a store or utility — categorize the payments (nothing is left out by name)");
    if(r.adj.length) W("adj", `${r.adj.length} manual adjustment${r.adj.length === 1 ? "" : "s"} (${usd(r.adjC)}) — each has a reason in the history`);
    // duplicate tax recipients
    all.forEach(o => { if(o === r || o.type !== r.type || o.k === "no") return; if((r.doc.distinct || []).includes(o.id) || (o.doc.distinct || []).includes(r.id)) return;
      if((nk(o.legal) && nk(o.legal) === nk(r.legal)) || (r.email && o.email && r.email.toLowerCase() === o.email.toLowerCase())) B("dup:" + o.id, `Possibly the same tax recipient as "${o.display}" — link them or mark them as different`); });
  }
  if(r.type === "vendor"){
    const unc = r.pays.filter(x => x.inYear && x.c.inc && !x.c.cat), dates = r.pays.filter(x => x.dateIssue && x.c.inc), dups = r.pays.filter(x => x.inYear && x.dupBy === "match" && !x.o.notDup && !x.o.dupOk);
    const prev = r.pays.filter(x => !x.inYear);
    if(r.k === "potential" && unc.length) B("uncat", `${unc.length} payment${unc.length === 1 ? "" : "s"} not categorized (services or goods) — ${usd(unc.reduce((a, x) => a + x.amountC, 0))}`);
    if(dates.length) B("dates", `${dates.length} payment date${dates.length === 1 ? "" : "s"} not confirmed near year-end (MagicDoor gives bill dates) — confirm the year they were paid`);
    if(dups.length) B("dups", `${dups.length} probable duplicate${dups.length === 1 ? "" : "s"} across systems — confirm same or different`);
    if(prev.length) W("prev", `${prev.length} bill${prev.length === 1 ? "" : "s"} dated late ${Number(y) - 1} with no payment date — counted in ${Number(y) - 1}; set the payment date if paid in ${y}`);
  } else {
    r.lines.forEach(L => L.flags.forEach(f => { if(L.o.ok || L.o.exclude) return; (f.lv === "block" ? B : W)("line:" + L.pk + ":" + f.k, f.t); }));
  }
  const f = ((r.doc.filing || {})[y]) || {}, ap = f.approval;
  r.stale = !!(ap && ["approved", "exported"].includes(f.status) && (ap.amountC !== r.repC || ap.form !== r.form));
  if(r.stale) B("stale", `Approved at ${usd(ap.amountC)} (${ap.form}) — it's ${usd(r.repC)} (${r.form}) now. Approve again.`);
  I.forEach(i => { if(i.lv === "warn" && ack[i.k]) i.acked = ack[i.k]; });
  r.blocking = I.filter(i => i.lv === "block"); r.warns = I.filter(i => i.lv === "warn" && !i.acked);
  // filing status
  let s = f.status || "";
  if(!s || ["not_reviewed", "needs_info", "ready"].includes(s)) s = r.k !== "potential" ? "not_reviewed" : !f.reviewed ? "not_reviewed" : r.blocking.length ? "needs_info" : "ready";
  r.fs = s; r.f = f;
}

/* ---------- filing status changes (people only, with details) ---------- */
function ensureDoc(r){
  const docs = RD(); if(docs[r.id]) return docs[r.id];
  const d = {id:r.id, type:r.type, links:{owners:r.links.owners.slice(), vendors:r.links.vendors.slice()}, created:new Date().toISOString(), by:me(), log:[]};
  docs[r.id] = d; return d;
}
const filingOf = (d, y) => { d.filing = d.filing || {}; return (d.filing[y] = d.filing[y] || {history:[]}); };
function setStatus(r, y, to, extra, note){
  const d = ensureDoc(r), f = filingOf(d, y), from = r.fs;
  Object.assign(f, extra || {}); f.status = to;
  f.history = (f.history || []).concat([{at:new Date().toISOString(), by:me(), from, to, note:note || ""}]).slice(-60);
  audit(r.id, y, `${r.display}: ${fsLabel(from)} → ${fsLabel(to)}${note ? " — " + note : ""}`);
}
const CAN = {   // what each manual step needs first
  approve:r => r.k === "potential" && !r.blocking.filter(i => i.k !== "stale").length && ["ready", "approved", "exported", "correction"].includes(r.fs),
  submitted:r => ["approved", "exported", "correction", "rejected"].includes(r.fs) && !r.stale,
  accepted:r => ["submitted"].includes(r.fs) || (r.fs === "delivered" && r.f.submitted),
  rejected:r => ["submitted"].includes(r.fs) || (r.fs === "delivered" && r.f.submitted),
  delivered:r => ["approved", "exported", "submitted", "accepted"].includes(r.fs),
  correction:r => ["accepted", "rejected", "delivered", "complete", "submitted"].includes(r.fs),
  complete:r => !!(r.f.accepted && r.f.delivered)
};

/* =====================================================================
   The page
   ===================================================================== */
const deadlines = y => { const n = Number(y) + 1;
  const bd = iso => { const d = new Date(iso + "T12:00:00"); while(d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  return {recip:bd(`${n}-01-31`), nec:bd(`${n}-01-31`), miscE:bd(`${n}-03-31`), miscP:bd(`${n}-02-28`), w9:`${y}-12-31`, recon:`${n}-01-10`, review:`${n}-01-20`}; };
const daysTo = iso => dn(iso) - dn(todayISO());
function reminders(y, B){
  const dl = deadlines(y), F = T().filing, P = B.list.filter(r => r.k === "potential"), out = [];
  const missW9 = P.filter(r => !["received", "verified"].includes(r.w9s));
  const add = (date, what, open, extra) => out.push({date, what, open, d:daysTo(date), extra:extra || ""});
  if(F.method === "iris" && (F.tcc || {}).status !== "approved") add(new Date(new Date(dl.nec + "T12:00:00").getTime() - 45 * 864e5).toISOString().slice(0, 10), "IRIS TCC approved (apply at least 45 days before filing)", true, (F.tcc || {}).status === "applied" ? `Applied ${fY(F.tcc.applied)} — the IRS says allow up to 45 days` : "Not applied for yet — the IRS says allow up to 45 days");
  add(dl.w9, `W-9s in from every recipient`, missW9.length > 0, missW9.length ? `${missW9.length} still missing` : "All in");
  const unrec = B.list.filter(r => r.blocking.some(i => ["uncat", "dates", "dups"].includes(i.k) || i.k.startsWith("line:") || i.k.startsWith("dup:")));
  add(dl.recon, "Final reconciliation of payments (categories, dates, duplicates)", unrec.length > 0, unrec.length ? `${unrec.length} recipients with open items` : "Nothing open");
  const unap = P.filter(r => !["approved", "exported", "submitted", "accepted", "delivered", "complete"].includes(r.fs));
  add(dl.review, "Every form reviewed and approved", unap.length > 0, unap.length ? `${unap.length} not approved` : "All approved");
  const nec = P.filter(r => r.form === "NEC-1"), misc = P.filter(r => r.form !== "NEC-1");
  const notSub = L => L.filter(r => !["submitted", "accepted", "delivered", "complete"].includes(r.fs) && !(r.fs === "delivered" && r.f.submitted)).length;
  const notDel = L => L.filter(r => !r.f.delivered).length;
  add(dl.nec, "1099-NEC filed with the IRS", notSub(nec) > 0, `${notSub(nec)} of ${nec.length} not submitted`);
  add(dl.recip, "Recipient copies sent (1099-NEC and 1099-MISC)", notDel(P) > 0, `${notDel(P)} of ${P.length} not delivered`);
  add(dl.miscE, "1099-MISC e-filed with the IRS", notSub(misc) > 0, `${notSub(misc)} of ${misc.length} not submitted (paper deadline ${fY(dl.miscP)})`);
  const rej = B.list.filter(r => r.fs === "rejected" || r.fs === "correction");
  if(rej.length) add(todayISO(), "Fix and resubmit rejected / corrected forms", true, rej.map(r => r.display).slice(0, 4).join(", ") + (rej.length > 4 ? ` +${rej.length - 4}` : ""));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function pg1099(){
  const ui = S.ui, now = todayISO(), y = ui.t9Y || String(Number(now.slice(0, 4)) - (now.slice(5, 7) <= "04" ? 1 : 0)), cfg = yearCfg(y), v = $("#view");
  dirty(); const B = build(y), L = B.list, P = L.filter(r => r.k === "potential"), dl = deadlines(y), F = T().filing;
  $("#pgSub").textContent = `Tax year ${y} · ${P.length} forms likely · ${F.method ? "filing through " + methodLabel(F.method) : "filing method not chosen"}`;
  actions([["Export for filing", () => { ui.t9Tab = "export"; persistUi(); render(); }, "primary"], ["Payment audit report (CSV)", () => t9Audit(y)]]);

  /* hero: year, thresholds, the numbers that matter */
  const hero = elm("div", "card t9-hero");
  const k = (lab, n, sub, cls, go) => `<div class="t9-k ${cls || ""}" ${go ? `data-t9go="${go}" style="cursor:pointer"` : ""}><span>${lab}</span><b>${n}</b><em>${sub}</em></div>`;
  const cntS = st => P.filter(r => st.includes(r.fs)).length;
  const missW9 = P.filter(r => !["received", "verified"].includes(r.w9s)).length, needRev = P.filter(r => ["not_reviewed", "needs_info", "ready"].includes(r.fs)).length;
  hero.innerHTML = `<div class="t9-yr"><label>Tax year <select id="t9Y">${[0, 1, 2].map(i => String(Number(now.slice(0, 4)) - i)).map(x => `<option ${x === y ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label title="1099-NEC threshold">NEC threshold $<input type="number" id="t9T" value="${cfg.threshold}" step="1"></label>
      <label title="1099-MISC rents threshold">MISC rents threshold $<input type="number" id="t9TM" value="${cfg.thresholdMisc}" step="1"></label>
      <label>Owner box 1 <select id="t9B"><option value="gross" ${cfg.ownerBasis === "gross" ? "selected" : ""}>Gross rent collected</option><option value="gross_other" ${cfg.ownerBasis === "gross_other" ? "selected" : ""}>Gross rent + other owner income (late fees…)</option><option value="net" ${cfg.ownerBasis === "net" ? "selected" : ""}>Net paid to the owner (CPA sign-off needed)</option></select></label></div>
    <div class="t9-ks t9-ks8">
      ${k("Potential recipients", P.length, `${P.filter(r => r.type === "owner").length} owners · ${P.filter(r => r.type === "vendor").length} vendors`, "", "rcp:need")}
      ${k("Reportable", usd(P.reduce((a, r) => a + r.repC, 0)), `${usd(P.filter(r => r.type === "owner").reduce((a, r) => a + r.repC, 0))} rents · ${usd(P.filter(r => r.type === "vendor").reduce((a, r) => a + r.repC, 0))} NEC`)}
      ${k("Missing W-9s", missW9, missW9 ? "request them now" : "all in", missW9 ? "warn" : "ok", "rcp:w9")}
      ${k("Need review", needRev, `${P.filter(r => r.blocking.length).length} with blocking issues`, needRev ? "warn" : "ok", "rcp:review")}
      ${k("Approved", cntS(["approved", "exported"]), `${cntS(["exported"])} exported`, "", "rcp:approved")}
      ${k("Submitted", cntS(["submitted", "accepted", "delivered", "complete"].filter(s => s !== "delivered")) + P.filter(r => r.fs === "delivered" && r.f.submitted).length, "recorded by staff", "", "rcp:submitted")}
      ${k("IRS accepted", P.filter(r => r.f.accepted).length, `of ${P.length}`, "", "rcp:accepted")}
      ${k("Need correction", cntS(["rejected", "correction"]), cntS(["rejected", "correction"]) ? "fix and resubmit" : "none", cntS(["rejected", "correction"]) ? "bad" : "ok", "rcp:fix")}
    </div>`;
  v.appendChild(hero);
  hero.querySelector("#t9Y").onchange = e => { ui.t9Y = e.target.value; persistUi(); render(); };
  const saveCfg = () => { const nx = {threshold:Number(hero.querySelector("#t9T").value) || cfg.threshold, thresholdMisc:Number(hero.querySelector("#t9TM").value) || cfg.thresholdMisc, ownerBasis:hero.querySelector("#t9B").value, cpaNote:cfg.cpaNote, by:me(), at:new Date().toISOString()};
    save(() => { T().years[y] = nx; audit("", y, `Settings: NEC threshold ${usd(Math.round(nx.threshold * 100))}, MISC rents threshold ${usd(Math.round(nx.thresholdMisc * 100))}, owner box 1 = ${nx.ownerBasis}`); }); render(); };
  ["#t9T", "#t9TM", "#t9B"].forEach(s => hero.querySelector(s).onchange = saveCfg);
  hero.querySelectorAll("[data-t9go]").forEach(n => n.onclick = () => { const [tb, f] = n.dataset.t9go.split(":"); ui.t9Tab = "rcp"; ui.t9F = f; persistUi(); render(); });

  /* alerts */
  const alerts = [];
  if(!F.method) alerts.push(["warn", `Pick how PHD will file the ${y} 1099s — <a href="#" data-t9tab="setup">Filing setup</a>.`]);
  if(F.method === "iris" && (F.tcc || {}).status !== "approved") alerts.push(["bad", `Filing through IRIS needs PHD's own IRIS Transmitter Control Code (TCC). ${(F.tcc || {}).status === "applied" ? `Applied ${esc(fY(F.tcc.applied))} — not approved yet.` : "Not applied for yet."} The IRS says to allow up to 45 days. <a href="${IRIS_TCC_URL}" target="_blank" rel="noopener">IRIS TCC application</a> · <a href="#" data-t9tab="setup">Track it</a>`]);
  const dW9 = daysTo(dl.nec); if(missW9 && dW9 <= 75) alerts.push([dW9 <= 30 ? "bad" : "warn", `${missW9} recipient${missW9 === 1 ? "" : "s"} still without a W-9 on file, ${dW9 >= 0 ? `${dW9} days before the ${fY(dl.nec)} deadline` : "and the deadline has passed"}. <a href="#" data-t9go2="rcp:w9">See who</a>`]);
  const stale = P.filter(r => r.stale).length; if(stale) alerts.push(["warn", `${stale} approval${stale === 1 ? " is" : "s are"} out of date — the amount or form changed after approval. <a href="#" data-t9go2="rcp:review">Review</a>`]);
  if(B.noOwner.length) alerts.push(["warn", `${B.noOwner.length} statement row${B.noOwner.length === 1 ? "" : "s"} in ${y} belong to rentals with no owner — their rent isn't on anyone's 1099 yet.`]);
  if(alerts.length){ const a = elm("div", "t9-alerts"); a.innerHTML = alerts.map(([lv, h]) => `<div class="t9-al ${lv}">${h}</div>`).join(""); v.appendChild(a);
    a.querySelectorAll("[data-t9tab]").forEach(n => n.onclick = e => { e.preventDefault(); ui.t9Tab = n.dataset.t9tab; persistUi(); render(); });
    a.querySelectorAll("[data-t9go2]").forEach(n => n.onclick = e => { e.preventDefault(); const [, f] = n.dataset.t9go2.split(":"); ui.t9Tab = "rcp"; ui.t9F = f; persistUi(); render(); }); }

  /* tabs */
  let tab = ui.t9Tab || "overview"; if(tab === "vendors" || tab === "owners"){ ui.t9Type = tab === "vendors" ? "vendor" : "owner"; tab = "rcp"; }
  const queue = reviewQueue(y, B);
  const bar = elm("div", "card dp-bar");
  bar.innerHTML = `<div class="sc-seg">${[["overview", "Overview"], ["rcp", "Recipients", L.length], ["queue", "Review queue", queue.n], ["export", "Export for filing"], ["setup", "Filing setup"], ["guide", "How filing works"]].map(([kk, l, n]) => `<button data-t9t="${kk}" class="${tab === kk ? "on" : ""}">${l}${n != null ? ` <span>${n}</span>` : ""}</button>`).join("")}</div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-t9t]").forEach(b => b.onclick = () => { ui.t9Tab = b.dataset.t9t; persistUi(); render(); });
  if(tab === "overview") return t9Overview(v, y, B, dl);
  if(tab === "rcp") return t9Recipients(v, y, B);
  if(tab === "queue") return t9Queue(v, y, B, queue);
  if(tab === "export") return t9ExportCenter(v, y, B);
  if(tab === "setup") return t9Setup(v, y, B);
  return t9Guide(v, y, dl, cfg);
}

/* ---------- overview: deadlines, reminders, where things stand ---------- */
function t9Overview(v, y, B, dl){
  const R = reminders(y, B), P = B.list.filter(r => r.k === "potential"), F = T().filing;
  const c = elm("div", "card"); c.innerHTML = `<div class="card-h"><h3>Deadlines and reminders · tax year ${esc(y)}</h3></div>
    <div class="t9-dl">${R.map(x => `<div class="t9-dlr ${!x.open ? "done" : x.d < 0 ? "late" : x.d <= 14 ? "soon" : ""}"><div class="t9-dld"><b>${esc(fY(x.date))}</b><em>${!x.open ? "Done" : x.d < 0 ? `${-x.d} days late` : x.d === 0 ? "Today" : `in ${x.d} days`}</em></div><div><div class="item-t">${esc(x.what)}</div><div class="item-s">${esc(x.extra)}</div></div></div>`).join("")}</div>
    <p class="help" style="padding:0 16px 14px">IRS dates for tax year ${esc(y)}: 1099-NEC to the IRS and to recipients by ${esc(fY(dl.nec))}; 1099-MISC recipient copies by ${esc(fY(dl.recip))}; 1099-MISC to the IRS by ${esc(fY(dl.miscE))} if e-filed (${esc(fY(dl.miscP))} on paper). Dates that fall on a weekend move to the next business day. PHD files electronically once it has 10 or more information returns in total.</p>`;
  v.appendChild(c);
  const by = {}; P.forEach(r => { by[r.fs] = (by[r.fs] || 0) + 1; });
  const s = elm("div", "card"); s.innerHTML = `<div class="card-h"><h3>Where the ${P.length} forms stand</h3></div>
    <div class="t9-pipe">${FS.map(([kk, l]) => `<button class="t9-pp ${by[kk] ? "" : "zero"}" data-fs="${kk}"><b>${by[kk] || 0}</b><span>${l}</span></button>`).join("")}</div>
    <div style="padding:0 16px 14px" class="help">Filing method: <b>${esc(methodLabel(F.method))}</b>${F.method === "iris" ? ` · IRIS TCC: <b>${esc({approved:"Approved", applied:"Applied"}[(F.tcc || {}).status] || "Not started")}</b>` : ""}. Statuses after “Exported” are set by staff from what the filing service or IRIS shows — downloading a file never marks anything as filed.</div>`;
  v.appendChild(s);
  s.querySelectorAll("[data-fs]").forEach(b => b.onclick = () => { S.ui.t9Tab = "rcp"; S.ui.t9F = "fs:" + b.dataset.fs; persistUi(); render(); });
  const lg = T().log.filter(e => !e.y || e.y === y).slice(-12).reverse();
  if(lg.length){ const h = elm("div", "card"); h.innerHTML = `<div class="card-h"><h3>Recent changes</h3></div><div class="t9-log">${lg.map(e => `<div><span>${esc(fdateS(String(e.at).slice(0, 10)))} · ${esc(String(e.by).split("@")[0])}</span> ${esc(e.what)}</div>`).join("")}</div>`; v.appendChild(h); }
}

/* ---------- recipients list ---------- */
function t9Recipients(v, y, B){
  const ui = S.ui, F = ui.t9F || "need", TY = ui.t9Type || "all", Q = String(ui.t9Q || "").toLowerCase();
  const filt = {need:["Need a form", r => r.k === "potential"], w9:["Missing W-9", r => r.k === "potential" && !["received", "verified"].includes(r.w9s)], review:["Need review", r => r.k === "potential" && (["not_reviewed", "needs_info", "ready"].includes(r.fs) || r.stale)],
    approved:["Approved", r => r.k === "potential" && ["approved", "exported"].includes(r.fs)], submitted:["Submitted", r => r.k === "potential" && (["submitted", "accepted", "complete"].includes(r.fs) || !!r.f.submitted)],
    accepted:["Accepted", r => !!r.f.accepted], fix:["Correction", r => ["rejected", "correction"].includes(r.fs)], under:["Under threshold", r => r.k === "under"], no:["Not reportable", r => r.k === "no"], all:["All", () => true]};
  const fsF = F.startsWith("fs:") ? F.slice(3) : null;
  const typed = B.list.filter(r => TY === "all" || r.type === TY).filter(r => !Q || (r.display + " " + r.legal + " " + (r.names ? [...r.names].join(" ") : "")).toLowerCase().includes(Q));
  const list = typed.filter(fsF ? r => r.k === "potential" && r.fs === fsF : (filt[F] || filt.need)[1]).sort((a, b) => b.repC - a.repC);
  const bar = elm("div", "card dp-bar");
  bar.innerHTML = `<div class="sc-seg">${[["all", "All"], ["owner", "Owners · 1099-MISC"], ["vendor", "Vendors · 1099-NEC"]].map(([kk, l]) => `<button data-ty="${kk}" class="${TY === kk ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="sc-seg">${Object.entries(filt).map(([kk, [l, fn]]) => `<button data-t9f="${kk}" class="${F === kk ? "on" : ""}">${l} <span>${typed.filter(fn).length}</span></button>`).join("")}${fsF ? `<button class="on">${esc(fsLabel(fsF))}</button>` : ""}</div>
    <input type="search" id="t9Q" placeholder="Find a recipient" value="${esc(ui.t9Q || "")}">`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-ty]").forEach(b => b.onclick = () => { ui.t9Type = b.dataset.ty; persistUi(); render(); });
  bar.querySelectorAll("[data-t9f]").forEach(b => b.onclick = () => { ui.t9F = b.dataset.t9f; persistUi(); render(); });
  const q = bar.querySelector("#t9Q"); q.oninput = () => { clearTimeout(q._t); q._t = setTimeout(() => { ui.t9Q = q.value; render(); setTimeout(() => { const n = $("#t9Q"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 0); }, 250); };
  const c = elm("div", "card");
  const w9Tag = r => `<span class="tag ${r.w9s === "verified" || r.w9s === "received" ? "green" : r.w9s === "fix" ? "red" : r.w9s === "none" ? "grey" : "gold"}">${esc(w9Label(r.w9s))}</span>`;
  const iss = r => r.blocking.length ? `<span class="tag red" title="${esc(r.blocking.map(i => i.t).join("\n"))}">${r.blocking.length} to fix</span>` : r.warns.length ? `<span class="tag gold" title="${esc(r.warns.map(i => i.t).join("\n"))}">${r.warns.length} warning${r.warns.length === 1 ? "" : "s"}</span>` : r.k === "potential" ? `<span class="tag green">Clean</span>` : "";
  c.innerHTML = list.length ? `<div class="t9-bulk" id="t9Bulk" hidden><b id="t9BN"></b> selected <button class="btn sm" data-bk="approve">Approve for filing</button><button class="btn sm" data-bk="submitted">Mark submitted…</button><button class="btn sm" data-bk="accepted">Mark IRS accepted…</button><button class="btn sm" data-bk="delivered">Mark copies delivered…</button><button class="btn sm ghost" data-bk="w9">Draft W-9 requests</button></div>
    <div class="tbl-wrap"><table class="tbl t9-tbl"><thead><tr><th style="width:28px"><input type="checkbox" id="t9All"></th><th>Recipient</th><th>Form</th><th class="r">Reportable</th><th>W-9</th><th>Checks</th><th>Filing status</th><th></th></tr></thead><tbody>
    ${list.map((r, i) => `<tr class="tk-r" data-i="${i}"><td class="nosel"><input type="checkbox" data-sel="${i}"></td>
      <td><div class="item-t">${esc(r.display)} <span class="tag ${r.type === "owner" ? "" : "grey"}">${r.type === "owner" ? "Owner" : "Vendor"}</span>${r.attorney ? ` <span class="tag">attorney</span>` : ""}</div><div class="item-s">${r.legal !== r.display ? "Legal: " + esc(r.legal) + " · " : ""}${esc(clsLabel(r.cls))}${(r.links.owners.length + r.links.vendors.length) > 1 ? ` · ${r.links.owners.length + r.links.vendors.length} linked records` : ""}${r.names && r.names.size > 1 ? ` · also paid as ${esc([...r.names].filter(n => n !== r.display).slice(0, 2).join(", "))}` : ""}</div></td>
      <td>${r.k === "no" ? `<span class="muted">${esc(r.exempt)}</span>` : esc(formShort(r.form))}</td>
      <td class="r num"><a href="#" class="t9-amt" data-amt="${i}"><b>${usd(r.repC)}</b></a>${r.k === "under" ? `<div class="item-s">under ${usd(r.thrC)}</div>` : r.k !== "no" && r.type === "vendor" && r.pendC ? `<div class="item-s">${usd(r.pendC)} not categorized</div>` : r.type === "owner" && r.grossC !== r.repC ? `<div class="item-s">gross ${usd(r.grossC)}</div>` : ""}</td>
      <td>${r.k === "potential" ? w9Tag(r) : `<span class="muted">—</span>`}</td><td>${iss(r)}</td>
      <td>${r.k === "potential" ? `<span class="tag ${fsTag(r.fs)}">${esc(fsLabel(r.fs))}</span>${r.stale ? ` <span class="tag red">re-approve</span>` : ""}` : `<span class="muted">${r.k === "under" ? "Under threshold" : "—"}</span>`}</td><td class="act"><span class="sc-go">›</span></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><b>No recipients here</b><p>Try another filter or year.</p></div>`;
  v.appendChild(c);
  c.querySelectorAll("tr[data-i]").forEach(tr => tr.onclick = e => { if(e.target.closest(".nosel") || e.target.closest(".t9-amt")) return; t9RecipientSheet(y, list[+tr.dataset.i].id); });
  c.querySelectorAll("[data-amt]").forEach(a => a.onclick = e => { e.preventDefault(); e.stopPropagation(); t9AmountSheet(y, list[+a.dataset.amt].id); });
  const sel = () => [...c.querySelectorAll("[data-sel]:checked")].map(n => list[+n.dataset.sel]);
  const upd = () => { const n = sel().length, bk = $("#t9Bulk"); if(bk){ bk.hidden = !n; $("#t9BN").textContent = n; } };
  c.querySelectorAll("[data-sel]").forEach(n => n.onchange = upd);
  const all = c.querySelector("#t9All"); if(all) all.onchange = () => { c.querySelectorAll("[data-sel]").forEach(n => n.checked = all.checked); upd(); };
  c.querySelectorAll("[data-bk]").forEach(b => b.onclick = () => t9Bulk(y, b.dataset.bk, sel()));
}

/* ---------- one recipient ---------- */
const rcpById = (y, id) => build(y).list.find(r => r.id === id);
function t9RecipientSheet(y, id){
  $("#sheet").classList.remove("t9-wide");
  dirty(); const r = rcpById(y, id); if(!r) return toast("That recipient isn't in this year any more");
  const sh = $("#sheet"), d = r.doc, a = r.addr || {}, cfg = yearCfg(y), F = T().filing;
  const others = build(y).list.filter(o => o.type === r.type && o.id !== r.id && o.virtual).sort((p, q) => p.display.localeCompare(q.display));
  const linkName = (kind, idv) => kind === "owners" ? (ownerById(idv) ? ownerLabel(ownerById(idv)) : idv) : ((vendorFromGk(idv) || {}).name || idv.replace(/^n:/, ""));
  const issues = r.issues.map(i => `<div class="t9-iss ${i.lv}${i.acked ? " acked" : ""}"><b>${i.lv === "block" ? "Fix" : "Check"}</b> ${esc(i.t)}${i.lv === "warn" && !i.acked && !/^(tin|email|adj)$/.test(i.k) ? ` <a href="#" data-ack="${esc(i.k)}">Checked — OK</a>` : ""}${i.k.startsWith("dup:") ? ` <a href="#" data-link="${esc(i.k.slice(4))}">Link them</a> · <a href="#" data-distinct="${esc(i.k.slice(4))}">Different people</a>` : ""}${i.k === "self" ? ` <a href="#" data-self="1">Yes, it's PHD</a> · <a href="#" data-self="0">No, a different business</a>` : ""}${i.acked ? ` <span class="muted">— checked by ${esc(String(i.acked.by).split("@")[0])}</span>` : ""}</div>`).join("");
  const steps = [["review", "Mark reviewed", r.k === "potential" && ["not_reviewed", "needs_info", "ready"].includes(r.fs) && !r.f.reviewed], ["approve", r.stale ? "Approve again" : "Approve for filing", CAN.approve(r) && (r.fs !== "approved" || r.stale)],
    ["unapprove", "Take back the approval", ["approved", "exported"].includes(r.fs)], ["submitted", "Record submission…", CAN.submitted(r)], ["accepted", "Record IRS acceptance…", CAN.accepted(r)], ["rejected", "Record IRS rejection…", CAN.rejected(r)],
    ["delivered", "Record recipient copy sent…", CAN.delivered(r) && !r.f.delivered], ["correction", "Correction required…", CAN.correction(r)], ["complete", "Mark complete", CAN.complete(r) && r.fs !== "complete"]].filter(s => s[2]);
  const fh = (r.f.history || []).slice().reverse();
  sh.innerHTML = `<div class="sheet-h"><div><h3>${esc(r.display)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${r.type === "owner" ? "Owner" : "Vendor"} · ${esc(FORMS[r.form] || r.form)} · tax year ${esc(y)} · ${r.k === "potential" ? esc(fsLabel(r.fs)) : esc(r.exempt || `under ${usd(r.thrC)}`)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b">
    <div class="vb-sum"><div><span>${r.type === "owner" ? "Gross rent" : "Paid in " + esc(y)}</span><b>${usd(r.grossC)}</b><em>${r.type === "owner" ? `${r.lines.length} rental-months` : `${r.pays.filter(x => x.inYear).length} payments`}</em></div>
      <div><span>${r.type === "owner" ? "Net to owner" : "Left out"}</span><b>${usd(r.type === "owner" ? r.netC : r.cardC + r.exclC)}</b><em>${r.type === "owner" ? `fees ${usd(r.feeC)} · repairs ${usd(r.repairsC)}` : `card ${usd(r.cardC)} · goods/other ${usd(r.exclC)}`}</em></div>
      <div><span>Reportable</span><b><a href="#" id="t9Amt">${usd(r.repC)}</a></b><em>${r.adjC ? `incl. ${usd(r.adjC)} adjustments` : "click for every transaction"}</em></div></div>
    ${r.issues.length ? `<div class="sectl">Checks</div>${issues}` : r.k === "potential" ? `<p class="help">✓ No problems found.</p>` : ""}
    ${r.k === "potential" ? `<div class="sectl">Filing status</div>
      <div class="t9-fs"><span class="tag ${fsTag(r.fs)}">${esc(fsLabel(r.fs))}</span>${r.f.approval ? ` <span class="muted">approved ${esc(fdateS(String(r.f.approval.at).slice(0, 10)))} by ${esc(String(r.f.approval.by).split("@")[0])} at ${usd(r.f.approval.amountC)}</span>` : ""}
        ${r.f.batch ? `<div class="item-s">Batch ${esc(r.f.batch)}${r.f.provider ? " · " + esc(methodLabel(r.f.provider)) : ""}${r.f.submitted ? " · submitted " + esc(fY(r.f.submitted)) : ""}${r.f.receipt ? " · ID " + esc(r.f.receipt) : ""}${r.f.accepted ? " · accepted " + esc(fY(r.f.accepted)) : ""}${r.f.rejected ? " · rejected " + esc(fY(r.f.rejected)) + (r.f.rejectWhy ? " (" + esc(r.f.rejectWhy) + ")" : "") : ""}</div>` : ""}
        ${r.f.delivered ? `<div class="item-s">Copy sent ${esc(fY(r.f.delivered.date))} by ${esc(r.f.delivered.method)}</div>` : ""}</div>
      <div class="bl-pay" style="margin:8px 0;flex-wrap:wrap">${steps.map(([kk, l]) => `<button class="btn sm ${kk === "approve" ? "primary" : ""}" data-step="${kk}">${l}</button>`).join("") || `<span class="muted">${r.blocking.length ? "Fix the items above before it can be approved." : ""}</span>`}</div>` : ""}
    <div class="sectl">Recipient</div>
    <div class="f2"><label class="fld"><span>Legal name (W-9 line 1)</span><input type="text" id="rL" value="${esc(r.legal)}"></label><label class="fld"><span>Display name</span><input type="text" id="rD" value="${esc(r.display)}"></label></div>
    <div class="f2"><label class="fld"><span>Federal tax classification (W-9 line 3)</span><select id="rC">${CLS.map(([kk, l]) => `<option value="${kk}" ${(r.cls || "") === kk ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="fld"><span>Email</span><input type="text" id="rE" type="email" value="${esc(r.email)}"></label></div>
    ${r.type === "vendor" ? `<label class="check" style="margin:4px 0 8px"><input type="checkbox" id="rAt" ${r.attorney ? "checked" : ""}> Attorney or law firm — legal services get a 1099-NEC even when paid to a corporation</label>` : ""}
    <div class="f2"><label class="fld"><span>Street</span><input type="text" id="rA1" value="${esc(a.line1 || "")}"></label><label class="fld"><span>Suite / unit</span><input type="text" id="rA2" value="${esc(a.line2 || "")}"></label></div>
    <div class="f3"><label class="fld"><span>City</span><input type="text" id="rAc" value="${esc(a.city || "")}"></label><label class="fld"><span>State</span><input type="text" id="rAs" value="${esc(a.state || "")}" maxlength="2"></label><label class="fld"><span>ZIP</span><input type="text" id="rAz" value="${esc(a.zip || "")}"></label></div>
    <label class="fld"><span>Form for ${esc(y)}</span><select id="rF">${Object.entries(FORMS).map(([kk, l]) => `<option value="${kk}" ${r.form === kk ? "selected" : ""}>${l}${kk === r.autoForm ? " — usual" : ""}</option>`).join("")}</select></label>
    <div class="sectl">W-9 and tax ID</div>
    <div class="f2"><label class="fld"><span>W-9 status</span><select id="rWs">${W9S.map(([kk, l]) => `<option value="${kk}" ${r.w9s === kk ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="fld"><span>Received on</span><input type="date" id="rWd" value="${esc(r.w9date)}"></label></div>
    <div class="f2"><label class="fld"><span>W-9 file (secure Drive link)</span><input type="url" id="rWu" value="${esc(r.w9url)}" placeholder="https://drive.google.com/…"></label><label class="fld"><span>Tax ID check</span><select id="rT">${TINS.map(([kk, l]) => `<option value="${kk}" ${r.tin === kk ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <div class="bl-pay" style="margin:6px 0"><button class="btn sm" id="rReq">Draft a W-9 request</button>${r.w9reqs.length ? `<button class="btn sm ghost" id="rRem">Draft a reminder</button>` : ""}<span class="muted" style="font-size:12px">${r.w9reqs.length ? `Asked ${r.w9reqs.length}×, last ${esc(fY(String(r.w9reqs[r.w9reqs.length - 1].at).slice(0, 10)))}` : "Never asked"}</span></div>
    <p class="help">The TIN itself is never typed in or stored here — it stays on the W-9 and is entered at the filing service or IRIS.</p>
    <div class="sectl">Linked records (one tax identity)</div>
    <div class="t9-links">${["owners", "vendors"].flatMap(kind => r.links[kind].map(idv => `<div><span>${esc(linkName(kind, idv))}</span>${r.links.owners.length + r.links.vendors.length > 1 ? `<a href="#" data-unlink="${kind}|${esc(idv)}">Unlink</a>` : ""}</div>`)).join("")}</div>
    ${others.length ? `<div class="f2"><label class="fld"><span>Add another ${r.type === "owner" ? "owner record" : "vendor name"} with the same tax ID</span><select id="rLk"><option value="">Choose…</option>${others.map(o => `<option value="${esc(o.id)}">${esc(o.display)} — ${usd(o.repC)}</option>`).join("")}</select></label><div class="fld"><span>&nbsp;</span><button class="btn sm" id="rLkB">Link</button></div></div>` : ""}
    ${r.type === "vendor" ? `<p class="help">Vendor records: ${r.v0 && r.v0.id ? `<a href="#" id="rOpenV">open ${esc(r.v0.name)}</a>` : `none yet — <a href="#" id="rMkV">make one</a>`}</p>` : r.o0 && r.o0.id ? `<p class="help"><a href="#" id="rOpenO">Open the owner</a></p>` : ""}
    <div class="sectl">Adjust or leave out</div>
    ${r.adj.length ? `<div class="t9-adj">${r.adj.map(x => `<div><b class="num">${x.amountC >= 0 ? "+" : "−"}${usd(Math.abs(x.amountC))}</b> ${esc(x.why)} <span class="muted">${x.by ? esc(String(x.by).split("@")[0]) + " · " + esc(fdateS(String(x.at).slice(0, 10))) : ""}</span>${x.id.startsWith("legacy") ? "" : ` <a href="#" data-unadj="${esc(x.id)}">Remove</a>`}</div>`).join("")}</div>` : ""}
    <div class="f2"><label class="fld"><span>Adjustment $ (+/−)</span><input type="number" step="0.01" id="rJ"></label><label class="fld"><span>Reason (required, kept in the audit log)</span><input type="text" id="rJw" placeholder="e.g. refund received in March"></label></div>
    <label class="check" style="margin:6px 0"><input type="checkbox" id="rX" ${(d.exclude || {})[y] ? "checked" : ""}> Not reportable for ${esc(y)}</label>
    <label class="fld"><span>Why not reportable</span><input type="text" id="rXw" value="${esc(((d.exclude || {})[y] || {}).why || "")}"></label>
    ${fh.length || (d.log || []).length ? `<details class="tk-h"><summary>History · ${(d.log || []).length || fh.length}</summary>${((d.log || []).length ? (d.log || []).slice().reverse() : fh.map(h => ({at:h.at, by:h.by, what:`${fsLabel(h.from)} → ${fsLabel(h.to)}${h.note ? " — " + h.note : ""}`}))).map(h => `<div>${esc(fdateS(String(h.at).slice(0, 10)))} · ${esc(String(h.by).split("@")[0])} — ${esc(h.what)}</div>`).join("")}</details>` : ""}
  </div>
  <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="rCx">Close</button><button class="btn primary" id="rSv">Save details</button></div>`;
  openPanel();
  const reopen = () => { dirty(); render(); t9RecipientSheet(y, ensureId(r)); };
  $("#shClose").onclick = $("#rCx").onclick = () => closeSheet();
  $("#t9Amt").onclick = e => { e.preventDefault(); t9AmountSheet(y, r.id); };
  sh.querySelectorAll("[data-ack]").forEach(n => n.onclick = e => { e.preventDefault(); const why = prompt("What did you check? (kept in the audit log)", ""); if(!why) return;
    save(() => { const dd = ensureDoc(r); dd.ack = dd.ack || {}; dd.ack[y] = dd.ack[y] || {}; dd.ack[y][n.dataset.ack] = {by:me(), at:new Date().toISOString(), why};
      const it = r.issues.find(i => i.k === n.dataset.ack); audit(r.id, y, `${r.display}: checked "${it ? it.t : n.dataset.ack}" — ${why}`); }); reopen(); });
  sh.querySelectorAll("[data-distinct]").forEach(n => n.onclick = e => { e.preventDefault(); const o = rcpById(y, n.dataset.distinct); if(!o) return;
    if(!confirm(`Mark "${r.display}" and "${o.display}" as different tax recipients? Only do this if their W-9s show different tax IDs.`)) return;
    save(() => { const dd = ensureDoc(r); dd.distinct = [...new Set((dd.distinct || []).concat([o.id]))]; audit(r.id, y, `${r.display} and ${o.display} marked as different tax recipients`); }); reopen(); });
  sh.querySelectorAll("[data-link]").forEach(n => n.onclick = e => { e.preventDefault(); linkInto(y, r, n.dataset.link); reopen(); });
  sh.querySelectorAll("[data-self]").forEach(n => n.onclick = e => { e.preventDefault(); const yes = n.dataset.self === "1";
    save(() => { const dd = ensureDoc(r); if(yes) T().self[r.id] = {by:me(), at:new Date().toISOString()}; else { dd.notSelf = true; delete T().self[r.id]; } audit(r.id, y, `${r.display}: ${yes ? "confirmed as PHD's own company (no 1099)" : "confirmed as a different business, not PHD"}`); }); reopen(); });
  sh.querySelectorAll("[data-step]").forEach(b => b.onclick = () => t9Step(y, r, b.dataset.step, reopen));
  sh.querySelectorAll("[data-unlink]").forEach(n => n.onclick = e => { e.preventDefault(); const [kind, idv] = n.dataset.unlink.split("|");
    save(() => { const dd = ensureDoc(r); dd.links[kind] = dd.links[kind].filter(x => x !== idv); audit(r.id, y, `${r.display}: unlinked ${linkName(kind, idv)}`); }); reopen(); });
  const lkb = $("#rLkB"); if(lkb) lkb.onclick = () => { const o = $("#rLk").value; if(!o) return; linkInto(y, r, o); reopen(); };
  sh.querySelectorAll("[data-unadj]").forEach(n => n.onclick = e => { e.preventDefault(); const why = prompt("Why remove this adjustment?", ""); if(!why) return;
    save(() => { const dd = ensureDoc(r); const lst = ((dd.adj || {})[y] || []), x = lst.find(z => z.id === n.dataset.unadj); dd.adj[y] = lst.filter(z => z.id !== n.dataset.unadj); audit(r.id, y, `${r.display}: removed adjustment ${usd(x ? x.amountC : 0)} (${x ? x.why : ""}) — ${why}`); }); reopen(); });
  $("#rReq").onclick = () => t9W9Draft(y, [r], "request"); const rem = $("#rRem"); if(rem) rem.onclick = () => t9W9Draft(y, [r], "reminder");
  const ov = $("#rOpenV"); if(ov) ov.onclick = e => { e.preventDefault(); vendorSheet(r.v0.id); };
  const mv = $("#rMkV"); if(mv) mv.onclick = e => { e.preventDefault(); snapshot(); const nv = vendorEnsure(r.legal); dirty(); commit(); vendorSheet(nv.id); };
  const oo = $("#rOpenO"); if(oo) oo.onclick = e => { e.preventDefault(); closeSheet(); S.ui.ownerId = r.o0.id; go("owners"); };
  $("#rSv").onclick = () => {
    const url = $("#rWu").value.trim(); if(url && !/^https:\/\//i.test(url)) return toast("The W-9 link has to start with https://");
    const adjV = $("#rJ").value, adjW = $("#rJw").value.trim(); if(adjV !== "" && Number(adjV) && !adjW) return toast("Give the adjustment a reason");
    const ex = $("#rX").checked, exW = $("#rXw").value.trim(); if(ex && !exW) return toast("Say why it isn't reportable");
    const nx = {legal:$("#rL").value.trim(), display:$("#rD").value.trim() || $("#rL").value.trim(), cls:$("#rC").value, email:$("#rE").value.trim(),
      addr:{line1:$("#rA1").value.trim(), line2:$("#rA2").value.trim(), city:$("#rAc").value.trim(), state:$("#rAs").value.trim().toUpperCase(), zip:$("#rAz").value.trim()}};
    const form = $("#rF").value, ws = $("#rWs").value, wd = $("#rWd").value, tin = $("#rT").value, att = $("#rAt") ? $("#rAt").checked : null;
    const ch = [];
    ["legal", "display", "cls", "email"].forEach(f => { if(nx[f] !== (r[f] || "")) ch.push(`${f} → ${f === "cls" ? clsLabel(nx[f]) : nx[f] || "(blank)"}`); });
    if(JSON.stringify(nx.addr) !== JSON.stringify(Object.assign({line1:"", line2:"", city:"", state:"", zip:""}, r.addr))) ch.push("mailing address");
    if(form !== r.form) ch.push(`form → ${form}`); if(ws !== r.w9s) ch.push(`W-9 → ${w9Label(ws)}`); if(wd !== r.w9date) ch.push(`W-9 received ${wd || "(blank)"}`); if(url !== r.w9url) ch.push("W-9 link");
    if(tin !== r.tin) ch.push(`tax ID check → ${(TINS.find(t => t[0] === tin) || [, ""])[1]}`); if(att != null && att !== r.attorney) ch.push(att ? "attorney" : "not an attorney");
    const exNow = !!(d.exclude || {})[y]; if(ex !== exNow || (ex && exW !== (((d.exclude || {})[y] || {}).why))) ch.push(ex ? `not reportable — ${exW}` : "reportable again");
    if(adjV !== "" && Number(adjV)) ch.push(`adjust ${usd(Math.round(Number(adjV) * 100))} — ${adjW}`);
    if(!ch.length) return closeSheet();
    save(() => { const dd = ensureDoc(r);
      ["legal", "display", "cls", "email"].forEach(f => { if(nx[f] !== (r[f] || "")) dd[f] = nx[f]; });
      if(ch.includes("mailing address")) dd.addr = nx.addr;
      if(form !== r.form){ dd.formOv = dd.formOv || {}; dd.formOv[y] = form; }
      if(att != null && att !== r.attorney) dd.attorney = att;
      dd.w9 = Object.assign({requests:(d.w9 || {}).requests || []}, d.w9 || {}, {status:ws, received:wd, url});
      if(ws === "verified" && r.w9s !== "verified"){ dd.w9.verifiedBy = me(); dd.w9.verifiedAt = new Date().toISOString(); }
      if(tin !== r.tin) dd.tin = tin;
      dd.exclude = dd.exclude || {}; if(ex) dd.exclude[y] = {why:exW, by:me(), at:new Date().toISOString()}; else delete dd.exclude[y];
      if(adjV !== "" && Number(adjV)){ dd.adj = dd.adj || {}; dd.adj[y] = (dd.adj[y] || []).concat([{id:rid8(), amountC:Math.round(Number(adjV) * 100), why:adjW, by:me(), at:new Date().toISOString()}]); }
      audit(r.id, y, `${r.display}: ${ch.join("; ")}`); });
    toast("Saved", true); reopen();
  };
}
const ensureId = r => r.id;
function linkInto(y, r, otherId){
  const o = rcpById(y, otherId); if(!o) return;
  if(!confirm(`Link "${o.display}" into "${r.display}"? Do this only when their W-9s show the same tax ID — the amounts will be added together on one ${r.type === "owner" ? "1099-MISC" : "1099-NEC"}.`)) return;
  save(() => { const dd = ensureDoc(r); ["owners", "vendors"].forEach(kind => { dd.links[kind] = [...new Set(dd.links[kind].concat(o.links[kind]))]; });
    const od = RD()[o.id]; if(od) od.deleted = true;   // its own record steps aside; the links now live here
    audit(r.id, y, `${r.display}: linked ${o.display} (same tax identity) — ${usd(o.repC)} added`); });
}

/* ---------- filing steps (each one asks for what the service or IRS showed) ---------- */
function t9Step(y, r, step, done){
  if(step === "review"){ save(() => { const f = filingOf(ensureDoc(r), y); f.reviewed = {by:me(), at:new Date().toISOString()}; audit(r.id, y, `${r.display}: reviewed`); }); return done(); }
  if(step === "approve"){
    if(!CAN.approve(r)) return toast("Fix the blocking items first");
    const tp = T().filing.twoPerson, rv = r.f.reviewed; if(tp && rv && rv.by === me()) return toast("Two-person rule is on — someone other than the reviewer approves");
    if(!confirm(`Approve ${r.display} for filing: ${FORMS[r.form]}, ${usd(r.repC)}?\n\nThis doesn't file anything — it lets the form go into an export.`)) return;
    save(() => { setStatus(r, y, "approved", {approval:{amountC:r.repC, form:r.form, by:me(), at:new Date().toISOString()}, reviewed:r.f.reviewed || {by:me(), at:new Date().toISOString()}}, `${usd(r.repC)} on ${r.form}`); }); return done();
  }
  if(step === "unapprove"){ const why = prompt("Why take the approval back?", ""); if(!why) return; save(() => { const f = filingOf(ensureDoc(r), y); delete f.approval; setStatus(r, y, "ready", {}, why); }); return done(); }
  if(step === "complete"){ save(() => setStatus(r, y, "complete", {}, "IRS accepted and recipient copy sent")); return done(); }
  t9StepSheet(y, [r], step, done);
}
function t9StepSheet(y, rs, step, done){
  const F = T().filing, sh = $("#sheet"), today = todayISO(), one = rs.length === 1 ? rs[0] : null;
  const L = {submitted:["Record submission", "Only record this after the filing service or IRIS shows the forms as submitted / transmitted. Enter what it shows."],
    accepted:["Record IRS acceptance", "Only record this when the filing service or IRIS shows the IRS accepted the forms (IRIS status “Accepted” or “Accepted with errors”)."],
    rejected:["Record IRS rejection", "Enter the rejection and the reason the IRS or the filing service gave. The form goes to the correction list."],
    delivered:["Record recipient copy sent", "When the recipient's copy was mailed, emailed (with their consent) or posted to the provider's portal."],
    correction:["Correction required", "Say what needs correcting. A corrected form is filed through the same service; IRIS corrects with Correct/Replace."]}[step];
  sh.innerHTML = `<div class="sheet-h"><div><h3>${L[0]}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${one ? esc(one.display) : rs.length + " recipients"} · tax year ${esc(y)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b"><p class="dp-warn">${esc(L[1])}</p>
    ${step === "submitted" ? `<div class="f2"><label class="fld"><span>Filed through</span><select id="sP">${METHODS.map(([kk, l]) => `<option value="${kk}" ${(F.method || "") === kk ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="fld"><span>Submitted on</span><input type="date" id="sD" value="${today}"></label></div>
      <div class="f2"><label class="fld"><span>Batch / submission ID (from the provider or IRIS receipt ID)</span><input type="text" id="sB" value="${esc((one && one.f.batch) || "")}"></label><label class="fld"><span>Confirmation / receipt number</span><input type="text" id="sR"></label></div>` : ""}
    ${step === "accepted" ? `<div class="f2"><label class="fld"><span>Accepted on</span><input type="date" id="sD" value="${today}"></label><label class="fld"><span>Receipt / acknowledgment ID</span><input type="text" id="sR" value="${esc((one && one.f.receipt) || "")}"></label></div><label class="check"><input type="checkbox" id="sE"> Accepted with errors (check the error report)</label>` : ""}
    ${step === "rejected" ? `<div class="f2"><label class="fld"><span>Rejected on</span><input type="date" id="sD" value="${today}"></label><label class="fld"><span>Reason given</span><input type="text" id="sW"></label></div>` : ""}
    ${step === "delivered" ? `<div class="f2"><label class="fld"><span>Sent on</span><input type="date" id="sD" value="${today}"></label><label class="fld"><span>How</span><select id="sM"><option>Mailed</option><option>Emailed (recipient consented)</option><option>Provider portal / e-delivery</option><option>Handed over</option></select></label></div>` : ""}
    ${step === "correction" ? `<label class="fld"><span>What needs correcting</span><input type="text" id="sW"></label>` : ""}
    <label class="check" style="margin-top:8px"><input type="checkbox" id="sOk"> I've seen this in the filing service / IRIS (not just downloaded a file)</label>
  </div><div class="sheet-f"><span style="flex:1"></span><button class="btn" id="sC">Cancel</button><button class="btn primary" id="sS">Record</button></div>`;
  openPanel();
  $("#shClose").onclick = $("#sC").onclick = () => closeSheet();
  $("#sS").onclick = () => {
    if(!$("#sOk").checked) return toast("Tick the box — only record what the service or IRIS shows");
    const val = s => ($(s) || {}).value ? $(s).value.trim() : "", date = val("#sD");
    if(step !== "correction" && !date) return toast("Enter the date");
    if(step === "submitted" && !val("#sB") && !val("#sR")) return toast("Enter the batch / submission ID or the confirmation number");
    if((step === "rejected" || step === "correction") && !val("#sW")) return toast("Enter the reason");
    const okRs = rs.filter(r => CAN[step] ? CAN[step](r) : true), skipped = rs.length - okRs.length;
    if(!okRs.length) return toast("None of these can take that step yet");
    save(() => okRs.forEach(r => {
      if(step === "submitted") setStatus(r, y, "submitted", {provider:val("#sP"), submitted:date, batch:val("#sB") || r.f.batch || "", receipt:val("#sR"), rejected:"", rejectWhy:""}, `${methodLabel(val("#sP"))} ${val("#sB") || val("#sR")}`);
      if(step === "accepted") setStatus(r, y, "accepted", {accepted:date, receipt:val("#sR") || r.f.receipt || "", acceptedErrors:$("#sE").checked}, $("#sE").checked ? "accepted with errors" : "");
      if(step === "rejected") setStatus(r, y, "rejected", {rejected:date, rejectWhy:val("#sW")}, val("#sW"));
      if(step === "delivered"){ const f = filingOf(ensureDoc(r), y); f.delivered = {date, method:val("#sM"), by:me()};
        if(f.accepted) setStatus(r, y, "delivered", {}, val("#sM")); else { f.history = (f.history || []).concat([{at:new Date().toISOString(), by:me(), from:r.fs, to:r.fs, note:`recipient copy sent (${val("#sM")})`}]); audit(r.id, y, `${r.display}: recipient copy sent ${date} (${val("#sM")})`); } }
      if(step === "correction") setStatus(r, y, "correction", {correctWhy:val("#sW")}, val("#sW"));
    }));
    toast(`Recorded for ${okRs.length}${skipped ? ` · ${skipped} skipped (not at that step)` : ""}`, true); closeSheet(); (done || render)();
  };
}
function t9Bulk(y, what, rs){
  if(!rs.length) return;
  if(what === "w9") return t9W9Draft(y, rs.filter(r => !["received", "verified"].includes(r.w9s)), "request");
  if(what === "approve"){
    const ok = rs.filter(r => CAN.approve(r) && (r.fs !== "approved" || r.stale)), tp = T().filing.twoPerson, ok2 = tp ? ok.filter(r => !(r.f.reviewed && r.f.reviewed.by === me())) : ok;
    if(!ok2.length) return toast("None of these can be approved yet — fix the blocking items first");
    if(!confirm(`Approve ${ok2.length} form${ok2.length === 1 ? "" : "s"} for filing (${usd(ok2.reduce((a, r) => a + r.repC, 0))})?${rs.length - ok2.length ? `\n${rs.length - ok2.length} can't be approved yet and will be skipped.` : ""}\n\nThis doesn't file anything.`)) return;
    save(() => ok2.forEach(r => setStatus(r, y, "approved", {approval:{amountC:r.repC, form:r.form, by:me(), at:new Date().toISOString()}, reviewed:r.f.reviewed || {by:me(), at:new Date().toISOString()}}, `${usd(r.repC)} on ${r.form} (bulk)`)));
    return render();
  }
  t9StepSheet(y, rs, what, render);
}

/* ---------- W-9 requests: drafted here, sent by a person, never asking for a TIN by email ---------- */
function t9W9Draft(y, rs, kind){
  rs = rs.filter(Boolean); if(!rs.length) return toast("Everyone selected already has a W-9");
  const F = T().filing, link = F.w9Link || "", mail = F.w9Mail || "", prov = F.w9Provider || "";
  if(!link && !mail && !prov) return toast("Add a secure W-9 link or mailing address in Filing setup first");
  const body = r => `Hi ${r.display},\n\n${kind === "reminder" ? "A reminder — we still need" : "For PHD's year-end 1099s, we need"} a completed and signed IRS Form W-9 from you${r.type === "owner" ? " for the rent we collect on your behalf" : ""}.\n\n${prov ? `You'll get a separate secure request from ${prov} to fill it in online.\n` : link ? `Please fill it in or upload it here (secure): ${link}\n` : ""}${mail ? `${prov || link ? "Or m" : "M"}ail or drop off the signed form at: ${mail}\n` : ""}\nPlease don't reply to this email with the form or your Social Security number / EIN, and don't send it by text — email isn't a secure way to send a tax ID.\n\nBlank form: ${W9_URL}\n\nThank you,\nPHD Properties`;
  const sub = kind === "reminder" ? "Reminder: W-9 needed for your 1099 — PHD Properties" : "W-9 needed for your 1099 — PHD Properties";
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>${kind === "reminder" ? "W-9 reminder" : "W-9 request"}${rs.length > 1 ? "s" : ""}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${rs.length} recipient${rs.length === 1 ? "" : "s"} · nothing is sent from here — your email opens with the draft</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b">${prov ? `<p class="help">Secure collection through <b>${esc(prov)}</b>: send the W-9 request from ${esc(prov)} first, then use this email as a heads-up and record it below.</p>` : ""}
    <label class="fld"><span>Message (edit as needed — keep the line about not emailing a tax ID)</span><textarea id="wB" rows="12">${esc(body(rs[0]))}</textarea></label>
    <div class="t9-wl">${rs.map((r, i) => `<div><span><b>${esc(r.display)}</b> ${r.email ? esc(r.email) : `<span class="muted">no email</span>`} · ${esc(w9Label(r.w9s))}${r.w9reqs.length ? ` · asked ${r.w9reqs.length}×` : ""}</span>${r.email ? `<a class="btn sm" data-mail="${i}" href="#">Open email</a>` : ""}<button class="btn sm ghost" data-rec="${i}">Mark ${kind === "reminder" ? "reminder" : "request"} sent</button></div>`).join("")}</div>
  </div><div class="sheet-f"><span style="flex:1"></span><button class="btn" id="wC">Close</button>${rs.length > 1 ? `<button class="btn primary" id="wAll">Mark all ${rs.length} sent</button>` : ""}</div>`;
  openPanel();
  $("#shClose").onclick = $("#wC").onclick = () => { closeSheet(); render(); };
  const txt = r => { const t = $("#wB").value; return rs.length > 1 ? t.replace(/^Hi [^,\n]*,/, `Hi ${r.display},`) : t; };
  sh.querySelectorAll("[data-mail]").forEach(a => a.onclick = e => { e.preventDefault(); const r = rs[+a.dataset.mail], t = txt(r);
    if(!/don't reply|do not reply|don't send|do not send/i.test(t)) return toast("Keep the line asking them not to email the form or tax ID");
    location.href = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(t)}`; });
  const rec = list => { save(() => list.forEach(r => { const dd = ensureDoc(r); dd.w9 = Object.assign({}, dd.w9 || {}); dd.w9.requests = (dd.w9.requests || []).concat([{at:new Date().toISOString(), by:me(), kind, via:prov || (link ? "secure link" : "mail")}]);
      if(!["received", "verified", "fix"].includes(r.w9s) || r.w9s === "fix") dd.w9.status = kind === "reminder" ? "waiting" : (r.w9s === "fix" ? "fix" : "sent");
      audit(r.id, y, `${r.display}: W-9 ${kind} sent (${prov || (link ? "secure link" : "mail")})`); })); toast("Recorded", true); };
  sh.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => { rec([rs[+b.dataset.rec]]); b.disabled = true; b.textContent = "Recorded"; });
  const allB = $("#wAll"); if(allB) allB.onclick = () => { rec(rs); closeSheet(); render(); };
}

/* ---------- every transaction behind an amount ---------- */
function t9AmountSheet(y, id){
  dirty(); const r = rcpById(y, id); if(!r) return; const cfg = yearCfg(y), sh = $("#sheet");
  let rows;
  if(r.type === "vendor") rows = r.pays.map((x, i) => `<tr data-pi="${i}" class="tk-r ${x.c.inc ? "" : "t9-out"}"><td>${esc(fY(x.effDate))}${x.o.paidDate ? `<div class="item-s">paid date set by staff (was ${esc(x.dateKind)} ${esc(fY(x.date))})</div>` : x.dateKind !== "paid" ? `<div class="item-s">${x.dateKind === "bill" ? "bill date" : "expense date"} — ${x.dateOk ? "checked" : "payment date not known"}</div>` : x.billDate && x.billDate !== x.date ? `<div class="item-s">billed ${esc(fY(x.billDate))}</div>` : ""}</td>
      <td>${esc(x.name)}</td><td>${esc(x.where || "—")}</td><td>${esc(x.sys)}<div class="item-s">${esc(x.src)}</div></td><td>${esc(x.how)}</td><td class="mono">${esc(String(x.id).slice(0, 14))}${x.ref ? `<div class="item-s">${esc(String(x.ref).slice(0, 20))}</div>` : ""}</td>
      <td class="r num">${usd(x.amountC)}</td><td class="r num"><b>${usd(x.c.rep)}</b></td><td>${x.c.cat ? esc(catLabel(x.c.cat).split(" (")[0]) : ""}${x.c.why ? `<div class="item-s">${esc(x.c.why)}</div>` : ""}</td></tr>`).join("");
  else rows = r.lines.slice().sort((p, q) => p.month.localeCompare(q.month) || p.where.localeCompare(q.where)).map(L => `<tr data-li="${esc(L.pk)}" class="tk-r ${L.o.exclude ? "t9-out" : ""}"><td>${esc(L.month)}<div class="item-s">rent month${L.paidDate ? ` · paid out ${esc(fY(L.paidDate))}` : ""}</div></td><td>${esc((ownerById(L.ownerId) && ownerLabel(ownerById(L.ownerId))) || "")}</td><td>${esc(L.where)}</td><td>PHD Console<div class="item-s">statement row (MagicDoor rent)</div></td><td>Rent collected</td><td class="mono">${esc(String(L.rowId).slice(0, 18))}</td>
      <td class="r num">${usd(L.rentC)}<div class="item-s">other ${usd(L.otherC)} · fees ${usd(L.feeC + L.leasingC + L.adminC)} · repairs ${usd(L.repairsC)} · net ${usd(L.netC)}${L.paidC ? ` · paid ${usd(L.paidC)}` : ""}</div></td>
      <td class="r num"><b>${usd(lineRep(L, cfg))}</b></td><td>${L.o.exclude ? esc("Left out — " + (L.o.why || "")) : ""}${L.flags.map(f => `<div class="item-s ${f.lv === "block" ? "t9-red" : ""}">${esc(f.t)}${L.o.ok ? " (checked)" : ""}</div>`).join("")}</td></tr>`).join("");
  sh.innerHTML = `<div class="sheet-h"><div><h3>${esc(r.display)} — ${usd(r.repC)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">Every transaction behind the ${esc(y)} amount · click a row to decide on it · originals are never changed</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b"><div class="tbl-wrap"><table class="tbl t9-at"><thead><tr><th>Payment date</th><th>Payee</th><th>Property</th><th>Source</th><th>Method</th><th>Original ID</th><th class="r">Gross</th><th class="r">Reportable</th><th>Category / exclusion</th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="muted">No transactions in ${esc(y)}.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="6">${r.adj.length ? r.adj.map(x => `Adjustment ${x.amountC >= 0 ? "+" : "−"}${usd(Math.abs(x.amountC))}: ${esc(x.why)}`).join("<br>") : "No adjustments"}</td><td class="r num">${usd(r.grossC)}</td><td class="r num"><b>${usd(r.repC)}</b></td><td></td></tr></tfoot></table></div>
    ${r.type === "owner" ? `<p class="help">Box 1 is ${cfg.ownerBasis === "net" ? "net paid to the owner" : cfg.ownerBasis === "gross_other" ? "gross rent plus other owner income" : "gross rent collected"} (Filing setup / the year settings). Rent is counted by statement month; rent paid ahead (prepaid) belongs in the year it was received — check flagged months.</p>` : `<p class="help">Payment dates: console bills and Nickel payments carry the real payment date; MagicDoor only gives the bill date, and project expenses without a recorded payment use the expense date — set the paid date when it matters (late in the year).</p>`}
  </div><div class="sheet-f"><button class="btn ghost sm" id="aBack">Back to ${esc(r.display)}</button><span style="flex:1"></span><button class="btn" id="aC">Close</button></div>`;
  openPanel(); sh.classList.add("t9-wide"); closeSheet.before = () => sh.classList.remove("t9-wide");
  $("#shClose").onclick = $("#aC").onclick = () => closeSheet(); $("#aBack").onclick = () => t9RecipientSheet(y, r.id);
  sh.querySelectorAll("[data-pi]").forEach(tr => tr.onclick = () => t9PaySheet(y, r.id, r.pays[+tr.dataset.pi].pk));
  sh.querySelectorAll("[data-li]").forEach(tr => tr.onclick = () => t9LineSheet(y, r.id, tr.dataset.li));
}
function t9PaySheet(y, rid, pk){
  $("#sheet").classList.remove("t9-wide");
  const r = rcpById(y, rid), x = r && r.pays.find(p => p.pk === pk); if(!x) return;
  const o = T().pay[pk] || {}, sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>${usd(x.amountC)} · ${esc(x.name)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(x.sys)} · ${esc(x.src)} · ID ${esc(x.id)}${x.ref ? " · ref " + esc(x.ref) : ""}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b">
    <div class="ps-kv"><span>Original date</span><b>${esc(fY(x.date))} (${esc(x.dateKind === "paid" ? "payment date" : x.dateKind === "bill" ? "MagicDoor bill date" : "expense date")})</b></div>
    <div class="ps-kv"><span>Property</span><b>${esc(x.where || "—")}</b></div><div class="ps-kv"><span>Method</span><b>${esc(x.how)}</b></div>
    ${x.memo ? `<div class="ps-kv"><span>Memo</span><b>${esc(x.memo)}</b></div>` : ""}${x.accounts ? `<div class="ps-kv"><span>MagicDoor accounts</span><b>${esc(x.accounts)}</b></div>` : ""}
    <div class="ps-kv"><span>Counts now</span><b>${usd(x.c.rep)}${x.c.why ? " — " + esc(x.c.why) : ""}</b></div>
    ${x.dupOf ? `<div class="sectl">Possible duplicate</div><p class="help">Matched to ${esc(x.dupOf)} because ${esc(x.dupWhy)}.</p>
      <div class="bl-pay"><button class="btn sm ${!o.notDup && o.dupOk ? "primary" : ""}" id="pSame">Same payment — count once</button><button class="btn sm ${o.notDup ? "primary" : ""}" id="pDiff">Two different payments — count both</button></div>` : ""}
    <div class="sectl">Decide</div>
    <div class="f2"><label class="fld"><span>Category</span><select id="pCat">${CATS.map(([kk, l]) => `<option value="${kk}" ${(o.cat || "") === kk ? "selected" : ""}>${kk === "" ? `Use the vendor's (${esc(catLabel(T().vcat[x.gk] || ""))})` : l}</option>`).join("")}</select></label>
      <label class="fld"><span>Actual payment date</span><input type="date" id="pD" value="${esc(o.paidDate || "")}"></label></div>
    ${x.dateKind !== "paid" ? `<label class="check"><input type="checkbox" id="pDok" ${o.dateOk ? "checked" : ""}> I checked — it was paid in the same year as the ${x.dateKind === "bill" ? "bill" : "expense"} date</label>` : ""}
    <label class="check" style="margin:6px 0"><input type="checkbox" id="pX" ${o.exclude ? "checked" : ""}> Leave this payment out</label>
    <label class="fld"><span>Reason (required for any change)</span><input type="text" id="pW" value="${esc(o.why || "")}"></label>
    ${(o.history || []).length ? `<details class="tk-h"><summary>History · ${o.history.length}</summary>${o.history.slice().reverse().map(h => `<div>${esc(fdateS(String(h.at).slice(0, 10)))} · ${esc(String(h.by).split("@")[0])} — ${esc(h.what)}</div>`).join("")}</details>` : ""}
  </div><div class="sheet-f"><button class="btn ghost sm" id="pBack">Back</button><span style="flex:1"></span><button class="btn primary" id="pS">Save</button></div>`;
  openPanel();
  const back = () => t9AmountSheet(y, rid);
  $("#shClose").onclick = () => closeSheet(); $("#pBack").onclick = back;
  const put = (patch, what) => { save(() => { const cur = T().pay[pk] || {}; T().pay[pk] = Object.assign({}, cur, patch, {history:(cur.history || []).concat([{at:new Date().toISOString(), by:me(), what}]).slice(-20)}); audit(rid, y, `${x.name} ${usd(x.amountC)} (${x.src} ${x.id}): ${what}`); }); back(); };
  const sm = $("#pSame"); if(sm) sm.onclick = () => put({dupOk:true, notDup:false}, "confirmed duplicate — counted once");
  const df = $("#pDiff"); if(df) df.onclick = () => { const w = $("#pW").value.trim() || prompt("Why are these two different payments?", ""); if(!w) return; put({notDup:true, dupOk:false, why:w}, "two different payments — " + w); };
  $("#pS").onclick = () => { const cat = $("#pCat").value, pd = $("#pD").value, ex = $("#pX").checked, why = $("#pW").value.trim(), dok = $("#pDok") ? $("#pDok").checked : !!o.dateOk;
    const ch = []; if(cat !== (o.cat || "")) ch.push(`category → ${catLabel(cat)}`); if(pd !== (o.paidDate || "")) ch.push(`paid ${pd || "(original date)"}`); if(ex !== !!o.exclude) ch.push(ex ? "left out" : "counted again"); if(dok !== !!o.dateOk) ch.push(dok ? "date checked" : "date not checked");
    if(!ch.length) return back(); if(!why) return toast("Give a reason — it's kept in the audit log");
    if(pd && !/^\d{4}-\d{2}-\d{2}$/.test(pd)) return toast("Check the date");
    put({cat, paidDate:pd, exclude:ex, why, dateOk:dok}, ch.join(", ") + " — " + why); };
}
function t9LineSheet(y, rid, pk){
  const r = rcpById(y, rid), L = r && r.lines.find(l => l.pk === pk); if(!L) return;
  const o = T().pay[pk] || {};
  const why = prompt(`${L.where}, ${L.month}: rent ${usd(L.rentC)}.\n${L.flags.map(f => "• " + f.t).join("\n") || "No flags."}\n\nType a reason to ${o.exclude ? "count this month again" : "leave this month out of the 1099"}, or start with "ok:" to mark the flags as checked and keep counting it.`, "");
  if(!why) return;
  const okOnly = /^ok:/i.test(why), text = why.replace(/^ok:\s*/i, "");
  save(() => { const cur = T().pay[pk] || {}; T().pay[pk] = Object.assign({}, cur, okOnly ? {ok:true, why:text} : {exclude:!cur.exclude, why:text}, {history:(cur.history || []).concat([{at:new Date().toISOString(), by:me(), what:(okOnly ? "checked — " : cur.exclude ? "counted again — " : "left out — ") + text}])});
    audit(rid, y, `${L.where} ${L.month} rent ${usd(L.rentC)}: ${okOnly ? "flags checked" : cur.exclude ? "counted again" : "left out"} — ${text}`); });
  t9AmountSheet(y, rid);
}

/* ---------- review queue: everything that needs a person, in one place ---------- */
function reviewQueue(y, B){
  const q = {uncat:[], dates:[], dups:[], self:[], dupR:[], lines:[], prev:[]};
  const vcatDone = new Set();
  B.list.forEach(r => {
    if(r.selfSuggest) q.self.push(r);
    r.issues.filter(i => i.k.startsWith("dup:")).forEach(i => { const key2 = [r.id, i.k.slice(4)].sort().join("|"); if(!q.dupR.some(z => z.key === key2)) q.dupR.push({key:key2, a:r, b:i.k.slice(4)}); });
    if(r.type === "vendor"){ if(r.k !== "no"){ const un = r.pays.filter(x => x.inYear && x.c.inc && !x.c.cat); if(un.length && r.repC >= r.thrC * 0.5 && !vcatDone.has(r.id)){ vcatDone.add(r.id); q.uncat.push({r, n:un.length, c:un.reduce((a, x) => a + x.amountC, 0)}); } }
      r.pays.forEach(x => { if(x.dateIssue && x.c.inc) q.dates.push({r, x}); if(x.inYear && x.dupBy === "match" && !x.o.notDup && !x.o.dupOk) q.dups.push({r, x}); if(!x.inYear) q.prev.push({r, x}); }); }
    else r.lines.forEach(L => L.flags.forEach(f => { if(!L.o.ok && !L.o.exclude && (f.lv === "block" || r.k === "potential")) q.lines.push({r, L, f}); }));
  });
  q.n = q.uncat.length + q.dates.length + q.dups.length + q.self.length + q.dupR.length + q.lines.filter(z => z.f.lv === "block").length;
  return q;
}
function t9Queue(v, y, B, q){
  const sect = (title, help, html, n) => { const c = elm("div", "card"); c.innerHTML = `<div class="card-h"><h3>${title} <span class="muted">· ${n}</span></h3></div><p class="help" style="padding:0 16px">${help}</p>${n ? html : `<p class="muted" style="padding:0 16px 14px">Nothing to do.</p>`}`; v.appendChild(c); return c; };
  const tools = elm("div", "card dp-bar"); tools.innerHTML = `<button class="btn sm" id="qAdd">Record an outside payment</button><button class="btn sm" id="qQbo">Import QuickBooks payments (CSV)</button><span class="muted" style="font-size:12.5px">Payments made outside the console and MagicDoor (checks from another account, QuickBooks bill payments) count here once recorded.</span>`; v.appendChild(tools);
  tools.querySelector("#qAdd").onclick = () => t9ManualSheet(y); tools.querySelector("#qQbo").onclick = () => t9QboImport(y);
  const c1 = sect("Vendors to categorize", "Services (including parts and materials used on a job) are reportable on a 1099-NEC; pure goods, utilities and freight aren't. Nothing is left out by name — pick for the vendor, or per payment from the amount.",
    `<div class="t9-q">${q.uncat.sort((a, b) => b.c - a.c).map((z, i) => `<div><span><b>${esc(z.r.display)}</b> · ${z.n} payment${z.n === 1 ? "" : "s"} · ${usd(z.c)}${GOODS_HINT.test(key(z.r.legal)) ? ` <span class="tag grey">name suggests goods/utility</span>` : ""}</span><select data-vc="${i}">${CATS.map(([kk, l]) => `<option value="${kk}">${kk ? l.split(" (")[0] : "Choose…"}</option>`).join("")}</select><a href="#" data-op="${esc(z.r.id)}">Open</a></div>`).join("")}</div>`, q.uncat.length);
  c1.querySelectorAll("[data-vc]").forEach(s => s.onchange = () => { const z = q.uncat[+s.dataset.vc], cat = s.value; if(!cat) return; const why = prompt(`Why are ${z.r.display}'s payments "${catLabel(cat)}"?`, cat === "service" ? "contractor — labor" : ""); if(!why){ s.value = ""; return; }
    save(() => { z.r.links.vendors.forEach(gk => { T().vcat[gk] = cat; }); audit(z.r.id, y, `${z.r.display}: all payments categorized as ${catLabel(cat)} — ${why}`); }); render(); });
  const c2 = sect("Payment dates to confirm", "MagicDoor gives the bill date, not the day it was paid, and some project expenses have no payment recorded. For anything dated in the last weeks of the year, confirm the year it was actually paid.",
    `<div class="t9-q">${q.dates.map((z, i) => `<div><span><b>${esc(z.r.display)}</b> · ${usd(z.x.amountC)} · ${esc(z.x.sys)} ${esc(z.x.dateKind)} date ${esc(fY(z.x.date))} · ${esc(z.x.where || "")}</span><a href="#" data-pq="${i}">Decide</a></div>`).join("")}</div>`, q.dates.length);
  c2.querySelectorAll("[data-pq]").forEach(a => a.onclick = e => { e.preventDefault(); const z = q.dates[+a.dataset.pq]; t9PaySheet(y, z.r.id, z.x.pk); });
  const c3 = sect("Probable duplicates across systems", "Matched on vendor, amount and close dates, without a shared ID. Each one is counted once until someone confirms — open it to say same or different.",
    `<div class="t9-q">${q.dups.map((z, i) => `<div><span><b>${esc(z.r.display)}</b> · ${usd(z.x.amountC)} · ${esc(z.x.src)} ${esc(fY(z.x.date))} ↔ ${esc(z.x.dupOf.startsWith("bill:") ? "console bill" : z.x.dupOf.startsWith("md:") ? "MagicDoor bill" : z.x.dupOf.startsWith("pj:") ? "project expense" : "another record")} (${esc(z.x.dupWhy)})</span><a href="#" data-dq="${i}">Decide</a></div>`).join("")}</div>`, q.dups.length);
  c3.querySelectorAll("[data-dq]").forEach(a => a.onclick = e => { e.preventDefault(); const z = q.dups[+a.dataset.dq]; t9PaySheet(y, z.r.id, z.x.pk); });
  const c4 = sect("Possibly the same tax recipient", "Same name or email on two owner records or two vendor names (for example an owner with a record for each property). If the W-9s show the same tax ID, link them so the amounts go on one form.",
    `<div class="t9-q">${q.dupR.map((z, i) => { const b = B.list.find(o => o.id === z.b); return `<div><span><b>${esc(z.a.display)}</b> (${usd(z.a.repC)}) and <b>${esc(b ? b.display : z.b)}</b> (${usd(b ? b.repC : 0)})</span><a href="#" data-op="${esc(z.a.id)}">Open</a></div>`; }).join("")}</div>`, q.dupR.length);
  const c5 = sect("Is this PHD?", "These names look like PHD's own companies (management fees billed through MagicDoor, for example). PHD doesn't send itself a 1099 — confirm each one.",
    `<div class="t9-q">${q.self.map(r => `<div><span><b>${esc(r.display)}</b> · ${usd(r.repC)}</span><a href="#" data-op="${esc(r.id)}">Open</a></div>`).join("")}</div>`, q.self.length);
  const c6 = sect("Owner statement months to check", "Duplicate rows, refunds and reversals, prepaid rent, and payouts that don't match the statement. Duplicate rows block filing; the rest are warnings.",
    `<div class="t9-q">${q.lines.map((z, i) => `<div><span><b>${esc(z.r.display)}</b> · ${esc(z.L.where)} ${esc(z.L.month)} · ${esc(z.f.t)}</span><a href="#" data-lq="${i}">${z.f.lv === "block" ? "Fix" : "Check"}</a></div>`).join("")}</div>`, q.lines.length);
  c6.querySelectorAll("[data-lq]").forEach(a => a.onclick = e => { e.preventDefault(); const z = q.lines[+a.dataset.lq]; t9LineSheet(y, z.r.id, z.L.pk); render(); });
  if(q.prev.length){ const c7 = sect(`Late-${Number(y) - 1} bills that may have been paid in ${y}`, `MagicDoor bills dated after mid-November ${Number(y) - 1} with no payment date. They count in ${Number(y) - 1} unless you set a ${y} payment date.`,
    `<div class="t9-q">${q.prev.map((z, i) => `<div><span><b>${esc(z.r.display)}</b> · ${usd(z.x.amountC)} · bill ${esc(fY(z.x.date))}</span><a href="#" data-vq="${i}">Set the date</a></div>`).join("")}</div>`, q.prev.length);
    c7.querySelectorAll("[data-vq]").forEach(a => a.onclick = e => { e.preventDefault(); const z = q.prev[+a.dataset.vq]; t9PaySheet(y, z.r.id, z.x.pk); }); }
  v.querySelectorAll("[data-op]").forEach(a => a.onclick = e => { e.preventDefault(); t9RecipientSheet(y, a.dataset.op); });
}
function t9ManualSheet(y){
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>Record an outside payment</h3><div class="muted" style="font-size:12.5px;margin-top:3px">A payment PHD made that isn't in the console or MagicDoor</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b"><div class="f2"><label class="fld"><span>Paid to</span><input type="text" id="mN" list="mNl"><datalist id="mNl">${(typeof pmVendors === "function" ? pmVendors() : []).map(v => `<option value="${esc(v.name)}">`).join("")}</datalist></label><label class="fld"><span>Payment date</span><input type="date" id="mD"></label></div>
    <div class="f2"><label class="fld"><span>Amount</span><input type="number" step="0.01" id="mA"></label><label class="fld"><span>Method</span><select id="mM">${["Check", "ACH / bank transfer", "Wire", "Cash", "Card", "PayPal / Venmo / app", "Other"].map(m => `<option>${m}</option>`).join("")}</select></label></div>
    <div class="f2"><label class="fld"><span>Check # / transaction ID</span><input type="text" id="mR"></label><label class="fld"><span>Property (optional)</span><input type="text" id="mW"></label></div>
    <label class="fld"><span>What it was for (required)</span><input type="text" id="mT"></label></div>
  <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="mC">Cancel</button><button class="btn primary" id="mS">Record</button></div>`;
  openPanel(); $("#shClose").onclick = $("#mC").onclick = () => closeSheet();
  $("#mS").onclick = () => { const m = {id:rid8(), sys:"manual", name:$("#mN").value.trim(), date:$("#mD").value, amount:Number($("#mA").value), method:$("#mM").value, ref:$("#mR").value.trim(), where:$("#mW").value.trim(), note:$("#mT").value.trim(), by:me(), at:new Date().toISOString()};
    if(!m.name || !m.date || !(m.amount > 0) || !m.note) return toast("Fill in who, when, how much and what for");
    const vv = typeof vendorFind === "function" ? vendorFind(m.name) : null; if(vv) m.vendorId = vv.id;
    save(() => { T().manual.push(m); audit("", m.date.slice(0, 4), `Outside payment recorded: ${m.name} ${usd(Math.round(m.amount * 100))} on ${m.date} (${m.method}${m.ref ? " " + m.ref : ""}) — ${m.note}`); }); closeSheet(); render(); };
}
function csvRows(text){ if(typeof brCsvSafe === "function") return brCsvSafe(text);
  const out = []; let row = [], cell = "", q = false; for(let i = 0; i < text.length; i++){ const ch = text[i];
    if(q){ if(ch === '"' && text[i + 1] === '"'){ cell += '"'; i++; } else if(ch === '"') q = false; else cell += ch; }
    else if(ch === '"') q = true; else if(ch === ","){ row.push(cell); cell = ""; } else if(ch === "\n" || ch === "\r"){ if(ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; } else cell += ch; }
  if(cell || row.length){ row.push(cell); out.push(row); } return out; }
const isoOf = s => { s = String(s || "").trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[0]; m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if(m){ const yy = m[3].length === 2 ? "20" + m[3] : m[3]; return `${yy}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; } return ""; };
function t9QboParse(text){
  const rows = csvRows(text), hi = rows.findIndex(r => r.some(c => /^date$/i.test(String(c).trim())) && r.some(c => /amount|paid|total/i.test(c)));
  if(hi < 0) throw new Error("Couldn't find a header row with Date and Amount — export a QuickBooks report (e.g. Transaction List by Vendor) to CSV");
  const H = rows[hi].map(c => String(c).trim().toLowerCase()), col = re => H.findIndex(h => re.test(h));
  const ci = {date:col(/^date$/), name:col(/^(name|vendor|payee|vendor name)$/), amt:col(/^(amount|paid amount|total|payment amount)$/), num:col(/^(num|no\.?|ref|ref no\.?|transaction id|id|check no\.?)$/), type:col(/^(transaction type|type)$/), method:col(/payment method|method/), memo:col(/memo|description/)};
  if(ci.name < 0 || ci.amt < 0) throw new Error("Need Name/Vendor and Amount columns");
  let lastName = "";
  return rows.slice(hi + 1).map(r => { const d = isoOf(r[ci.date]); let nm = String(r[ci.name] || "").trim(); if(!nm && !d && r[0]) { lastName = String(r[0]).trim(); return null; } nm = nm || lastName;
    const amt = Math.abs(Number(String(r[ci.amt] || "").replace(/[$,()\s]/g, ""))), type = ci.type >= 0 ? String(r[ci.type] || "") : "";
    if(!d || !nm || !(amt > 0)) return null; if(type && !/bill payment|check|expense|payment/i.test(type)) return null;
    return {date:d, name:nm, amount:amt, ref:ci.num >= 0 ? String(r[ci.num] || "").trim() : "", method:ci.method >= 0 ? String(r[ci.method] || "").trim() || type : type || "QuickBooks", note:ci.memo >= 0 ? String(r[ci.memo] || "").trim() : ""}; }).filter(Boolean);
}
function t9QboImport(y){
  const sh = $("#sheet"); let parsed = null, fname = "";
  sh.innerHTML = `<div class="sheet-h"><div><h3>Import QuickBooks payments</h3><div class="muted" style="font-size:12.5px;margin-top:3px">For payments made in QuickBooks that aren't in the console or MagicDoor</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b"><p class="help">In QuickBooks: Reports → <b>Transaction List by Vendor</b> (or Bill Payment List / Check Detail) for ${esc(y)} → export to CSV. Needs Date, Name (or Vendor), Amount; Num and Transaction type help. Bill payments, checks and expenses are kept; the rest are skipped. Anything matching a payment already in the console or MagicDoor (same vendor and amount within 7 days, or the same reference) is flagged as a probable duplicate and counted once.</p>
    <input type="file" id="qF" accept=".csv,text/csv"><div id="qO" style="margin-top:12px"></div></div>
  <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="qC">Cancel</button><button class="btn primary" id="qS" disabled>Import</button></div>`;
  openPanel(); $("#shClose").onclick = $("#qC").onclick = () => closeSheet();
  $("#qF").onchange = async e => { const f = e.target.files[0]; if(!f) return; fname = f.name;
    try{ parsed = t9QboParse(await f.text()); }catch(err){ $("#qO").innerHTML = `<p class="dp-warn">${esc(err.message)}</p>`; return; }
    const have = new Set(T().manual.filter(m => !m.deleted && m.sys === "qbo").map(m => m.ref + "|" + m.date + "|" + m.amount));
    parsed.forEach(p => { p.dupe = have.has(p.ref + "|" + p.date + "|" + p.amount); });
    const nw = parsed.filter(p => !p.dupe);
    $("#qO").innerHTML = `<p><b>${parsed.length}</b> payments found, <b>${nw.length}</b> new (${parsed.length - nw.length} already imported).</p><div class="tbl-wrap" style="max-height:300px;overflow:auto"><table class="tbl"><tbody>${parsed.slice(0, 200).map(p => `<tr class="${p.dupe ? "t9-out" : ""}"><td>${esc(p.date)}</td><td>${esc(p.name)}</td><td class="r num">${usd(Math.round(p.amount * 100))}</td><td>${esc(p.ref)}</td><td>${esc(p.method)}</td></tr>`).join("")}</tbody></table></div>`;
    $("#qS").disabled = !nw.length; };
  $("#qS").onclick = () => { const nw = (parsed || []).filter(p => !p.dupe); if(!nw.length) return;
    save(() => { nw.forEach(p => { const vv = typeof vendorFind === "function" ? vendorFind(p.name) : null; T().manual.push(Object.assign({id:rid8(), sys:"qbo", file:fname, by:me(), at:new Date().toISOString()}, p, vv ? {vendorId:vv.id} : {})); });
      audit("", y, `QuickBooks import "${fname}": ${nw.length} payments, ${usd(nw.reduce((a, p) => a + Math.round(p.amount * 100), 0))}`); });
    closeSheet(); toast(`Imported ${nw.length}`, true); render(); };
}

/* =====================================================================
   Export for filing — validated, approved recipients only
   ===================================================================== */
const PROVIDERS = {
  tax1099:{name:"Tax1099", file:"for Tax1099", how:["Tax1099's bulk import takes a spreadsheet: download their 1099-NEC / 1099-MISC template, or upload this file and match its columns to their fields in the import's mapping step.", "Enter each recipient's TIN in Tax1099 from the W-9 (this file leaves it blank). Tax1099 transmits to the IRS under its own credentials — PHD doesn't need its own TCC.", "Column names here are the console's, not Tax1099's template headers (their template isn't published) — map them on import."]},
  avalara:{name:"Avalara 1099 & W-9", file:"for Avalara", how:["In Avalara: 1099 → Import Data → Create Forms CSV. Use Avalara's template, or this file and map the fields during import.", "Add each TIN from the W-9 (or collect W-9s through Avalara and use its TIN matching). Avalara transmits under its own credentials — PHD doesn't need its own TCC.", "Column names here are the console's, not Avalara's template headers — map them on import. If the TIN-type column is blank, Avalara guesses from the dashes in the TIN."]},
  iris:{name:"IRS IRIS (worksheet)", file:"IRIS worksheet", how:["IRIS only accepts its own CSV template for the tax year — download it in the IRIS Taxpayer Portal (Upload CSV with Form Data) and copy these values into it. This file is a worksheet, not the IRIS upload file: the console couldn't verify the TY2026 template's columns, so it doesn't claim to match them.", "One form type and one tax year per IRIS file; the portal takes up to 100 forms per submission — this export splits into parts of 100.", "Enter TINs from the W-9s (with dashes). IRIS needs PHD's own IRIS TCC, a Responsible Official's sign-in, and the payer EIN."]},
  generic_nec:{name:"Generic 1099-NEC CSV", file:"1099-NEC", how:["One row per 1099-NEC with every field the form needs, TIN blank. For an accountant or any service with a column-mapping import."]},
  generic_misc:{name:"Generic 1099-MISC CSV", file:"1099-MISC", how:["One row per 1099-MISC (box 1 rents, box 10 attorney gross proceeds), TIN blank."]},
  qbo:{name:"QuickBooks Online (worksheet)", file:"QuickBooks check", how:["QuickBooks Online builds 1099s from the vendor payments recorded in QuickBooks and its account-to-box mapping — it has no import for 1099 amounts. This worksheet lists what the console says each recipient should get, to compare with QuickBooks' 1099 review screen and fix QuickBooks before filing.", "Payments made from MagicDoor, owner trust money or Nickel won't be in QuickBooks unless they were recorded there, and owner rents (1099-MISC box 1) usually aren't — check that QuickBooks can produce those before choosing it.", "Intuit transmits to the IRS — PHD doesn't need its own TCC."]},
};
const acct = r => ("PHD" + r.id.replace(/[^a-z0-9]/gi, "")).slice(0, 20).toUpperCase();
function exportable(y, B){ return B.list.filter(r => r.k === "potential" && ["approved", "exported"].includes(r.fs) && !r.stale && !r.blocking.length); }
function t9ExportCenter(v, y, B){
  const P = B.list.filter(r => r.k === "potential"), E = exportable(y, B), notE = P.filter(r => !E.includes(r));
  const blockN = P.filter(r => r.blocking.length).length, warnN = P.filter(r => r.warns.length).length;
  const sum = elm("div", "card"); sum.innerHTML = `<div class="card-h"><h3>Validation report · ${esc(y)}</h3></div>
    <div class="an-kpis" style="padding:0 16px 12px;margin:0"><div><span>Ready to export</span><b>${E.length}</b><em>approved, no blocking errors · ${usd(E.reduce((a, r) => a + r.repC, 0))}</em></div><div class="${blockN ? "t9-bad" : ""}"><span>Blocking errors</span><b>${blockN}</b><em>recipients that can't be exported</em></div><div><span>Warnings</span><b>${warnN}</b><em>don't block, worth a look</em></div><div><span>Not approved yet</span><b>${notE.length}</b><em>left out of every export</em></div></div>
    ${P.length ? `<div class="tbl-wrap"><table class="tbl t9-tbl"><thead><tr><th>Recipient</th><th>Form</th><th class="r">Amount</th><th>Status</th><th>Blocking errors</th><th>Warnings</th></tr></thead><tbody>${P.slice().sort((a, b) => b.blocking.length - a.blocking.length || b.repC - a.repC).map(r => `<tr class="tk-r" data-op="${esc(r.id)}"><td>${esc(r.display)}</td><td>${esc(formShort(r.form))}</td><td class="r num">${usd(r.repC)}</td><td><span class="tag ${fsTag(r.fs)}">${esc(fsLabel(r.fs))}</span></td><td>${r.blocking.map(i => `<div class="item-s t9-red">${esc(i.t)}</div>`).join("") || "—"}</td><td>${r.warns.map(i => `<div class="item-s">${esc(i.t)}</div>`).join("") || "—"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="padding:0 16px 14px">No forms needed for ${esc(y)} yet.</p>`}`;
  v.appendChild(sum);
  sum.querySelectorAll("[data-op]").forEach(tr => tr.onclick = () => t9RecipientSheet(y, tr.dataset.op));
  const ex = elm("div", "card"); const F = T().filing;
  ex.innerHTML = `<div class="card-h"><h3>Exports</h3></div><p class="help" style="padding:0 16px">Every file holds only the ${E.length} approved recipient${E.length === 1 ? "" : "s"} with no blocking errors. Tax IDs are never in these files — they're added at the filing service / IRIS from the W-9s, so no file here is complete enough to upload as-is without that step. Exporting marks the forms “Exported” with a batch ID; it never marks anything as submitted or filed.</p>
    <div class="t9-ex">${Object.entries(PROVIDERS).map(([kk, p]) => `<div class="t9-exc ${F.method === kk || (kk.startsWith("generic") && F.method === "other") ? "pick" : ""}"><b>${esc(p.name)}</b>${p.how.map(h => `<p>${esc(h)}</p>`).join("")}<button class="btn sm ${F.method === kk ? "primary" : ""}" data-ex="${kk}" ${E.length ? "" : "disabled"}>Download</button></div>`).join("")}
      <div class="t9-exc"><b>Payment audit report (accountant)</b><p>Every payment and statement month behind every recipient — source system, original IDs, dates, gross, reportable, exclusions and adjustments with reasons. Includes all recipients, approved or not.</p><button class="btn sm" data-ex="audit">Download</button></div></div>
    ${T().exports.filter(e => e.y === y).length ? `<details class="tk-h" style="margin:0 16px 14px"><summary>Export history · ${T().exports.filter(e => e.y === y).length}</summary>${T().exports.filter(e => e.y === y).slice().reverse().map(e => `<div>${esc(fdateS(String(e.at).slice(0, 10)))} · ${esc(String(e.by).split("@")[0])} — ${esc(e.provider)} · batch ${esc(e.batch)} · ${e.n} forms · ${usd(e.c)}</div>`).join("")}</details>` : ""}`;
  v.appendChild(ex);
  ex.querySelectorAll("[data-ex]").forEach(b => b.onclick = () => b.dataset.ex === "audit" ? t9Audit(y) : t9Export(y, b.dataset.ex));
  const im = elm("div", "card dp-bar"); im.innerHTML = `<b>Filing results</b><span class="muted" style="font-size:12.5px">Import the status file your filing service gives you (CSV) to record submissions, acceptances and rejections — matched by the account number in the export.</span><button class="btn sm" id="t9Imp">Import results…</button>`;
  v.appendChild(im); im.querySelector("#t9Imp").onclick = () => t9ResultsImport(y);
}
const rowNEC = (y, r, batch) => [`1099-NEC`, y, acct(r), r.legal, r.display !== r.legal ? r.display : "", r.type === "owner" ? "Owner" : "Vendor", clsLabel(r.cls), "", "", r.addr.line1, r.addr.line2 || "", r.addr.city, r.addr.state, r.addr.zip, "US", r.email,
  (r.repC / 100).toFixed(2), "0.00", r.attorney ? "Yes" : "No", r.f.approval ? String(r.f.approval.by).split("@")[0] : "", r.f.approval ? String(r.f.approval.at).slice(0, 10) : "", batch];
const rowMISC = (y, r, batch) => [`1099-MISC`, y, acct(r), r.legal, r.display !== r.legal ? r.display : "", r.type === "owner" ? "Owner" : "Vendor", clsLabel(r.cls), "", "", r.addr.line1, r.addr.line2 || "", r.addr.city, r.addr.state, r.addr.zip, "US", r.email,
  r.form === "MISC-1" ? (r.repC / 100).toFixed(2) : "0.00", r.form === "MISC-10" ? (r.repC / 100).toFixed(2) : "0.00", "0.00", r.f.approval ? String(r.f.approval.by).split("@")[0] : "", r.f.approval ? String(r.f.approval.at).slice(0, 10) : "", batch];
const HEAD = ["Form", "Tax year", "Payer account number", "Recipient legal name", "Recipient business / DBA name", "Recipient type", "Federal tax classification", "Recipient TIN (enter from the W-9 — not stored in the console)", "TIN type (SSN/EIN — from the W-9)", "Address line 1", "Address line 2", "City", "State", "ZIP", "Country", "Email"];
const HEAD_NEC = HEAD.concat(["Box 1 Nonemployee compensation", "Box 4 Federal income tax withheld", "Attorney (legal services)", "Approved by", "Approved on", "Export batch"]);
const HEAD_MISC = HEAD.concat(["Box 1 Rents", "Box 10 Gross proceeds paid to an attorney", "Box 4 Federal income tax withheld", "Approved by", "Approved on", "Export batch"]);
function t9Export(y, provider){
  dirty(); const B = build(y), E = exportable(y, B); if(!E.length) return toast("Nothing approved for filing yet");
  const p = PROVIDERS[provider], stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").slice(2), batch = `${y}-${provider.toUpperCase().slice(0, 6)}-${stamp}`;
  const nec = E.filter(r => r.form === "NEC-1"), misc = E.filter(r => r.form === "MISC-1" || r.form === "MISC-10"), files = [];
  if(provider === "qbo"){
    const rows = [["Recipient", "Legal name", "Type", "Form", "Console reportable", "Gross paid / rent", "Left out (card, goods, duplicates)", "Adjustments", "Sources in the console", "In QuickBooks? (fill in)", "QuickBooks 1099 amount (fill in)", "Difference"]];
    E.forEach(r => rows.push([r.display, r.legal, r.type, r.form, (r.repC / 100).toFixed(2), (r.grossC / 100).toFixed(2), ((r.cardC || 0) + (r.exclC || 0)) / 100, (r.adjC / 100).toFixed(2), r.type === "owner" ? "Statement rows (MagicDoor rent)" : [...new Set(r.pays.filter(x => x.inYear && x.c.inc).map(x => x.sys))].join(" + "), "", "", ""]));
    files.push([`1099s ${y} - QuickBooks check - ${batch}.csv`, rows]);
  } else {
    const chunk = provider === "iris" ? 100 : 100000;
    const mk = (list, head, fn, form) => { for(let i = 0; i < list.length; i += chunk){ const part = list.slice(i, i + chunk), n = Math.ceil(list.length / chunk);
      files.push([`1099s ${y} - ${form} - ${p.file}${n > 1 ? ` part ${i / chunk + 1} of ${n}` : ""} - ${batch} - TIN needed from W-9s.csv`, [head].concat(part.map(r => fn(y, r, batch)))]); } };
    if(provider !== "generic_misc" && nec.length) mk(nec, HEAD_NEC, rowNEC, "1099-NEC");
    if(provider !== "generic_nec" && misc.length) mk(misc, HEAD_MISC, rowMISC, "1099-MISC");
    if(!files.length) return toast(`No approved ${provider === "generic_nec" ? "1099-NEC" : "1099-MISC"} forms`);
  }
  files.forEach(([n, rows]) => download(n, toCSV(rows)));
  const sent = provider === "qbo" ? [] : E.filter(r => provider === "generic_nec" ? r.form === "NEC-1" : provider === "generic_misc" ? r.form !== "NEC-1" : true);
  save(() => { sent.forEach(r => { const f = filingOf(ensureDoc(r), y); f.exports = (f.exports || []).concat([{batch, provider, at:new Date().toISOString(), by:me(), amountC:r.repC}]).slice(-20);
      if(r.fs === "approved" || r.fs === "exported"){ f.batch = batch; f.provider = provider; setStatus(r, y, "exported", {}, `${p.name} · batch ${batch}`); } });
    T().exports.push({y, provider:p.name, batch, n:provider === "qbo" ? E.length : sent.length, c:(provider === "qbo" ? E : sent).reduce((a, r) => a + r.repC, 0), at:new Date().toISOString(), by:me()}); T().exports = T().exports.slice(-100);
    audit("", y, `Export ${p.name}: ${files.length} file${files.length === 1 ? "" : "s"}, ${provider === "qbo" ? E.length : sent.length} recipients, batch ${batch}`); });
  toast(`Downloaded ${files.length} file${files.length === 1 ? "" : "s"} — add TINs at the ${provider === "iris" ? "IRIS portal" : "filing service"}; nothing has been filed`, true); render();
}
function t9Audit(y){
  dirty(); const B = build(y), cfg = B.cfg;
  const rows = [["Recipient", "Recipient ID", "Form", "Recipient status", "Filing status", "Line type", "Payment date", "Date type", "Bill / rent month", "Payee as recorded", "Property", "Source system", "Source", "Payment method", "Original transaction / bill ID", "Reference", "Gross amount", "Reportable amount", "Category", "Exclusion / note", "Staff decision", "Decision reason"]];
  B.list.forEach(r => {
    const base = [r.display, r.id, r.form, r.k === "potential" ? "Needs a form" : r.k === "under" ? "Under threshold" : r.exempt, r.k === "potential" ? fsLabel(r.fs) : ""];
    if(r.type === "vendor") r.pays.forEach(x => rows.push(base.concat(["Payment", x.effDate, x.o.paidDate ? "paid (set by staff)" : x.dateKind === "paid" ? "paid" : x.dateKind === "bill" ? "bill date" : "expense date", x.billDate || "", x.name, x.where || "", x.sys, x.src, x.how, x.id, x.ref || "", (x.amountC / 100).toFixed(2), (x.c.rep / 100).toFixed(2), catLabel(x.c.cat), x.c.why || "", [x.o.cat ? "category" : "", x.o.paidDate ? "date" : "", x.o.exclude ? "left out" : "", x.o.notDup ? "not a duplicate" : x.o.dupOk ? "duplicate confirmed" : ""].filter(Boolean).join(", "), x.o.why || ""])));
    else r.lines.forEach(L => rows.push(base.concat(["Statement month", L.paidDate || "", L.paidDate ? "owner payout date" : "", L.month, ownerById(L.ownerId) ? ownerLabel(ownerById(L.ownerId)) : "", L.where, "PHD Console", "Statement row (MagicDoor rent)", "Rent collected", L.rowId, "", (L.rentC / 100).toFixed(2), (lineRep(L, cfg) / 100).toFixed(2), `rent; other income ${(L.otherC / 100).toFixed(2)}; fees ${((L.feeC + L.leasingC + L.adminC) / 100).toFixed(2)}; repairs ${(L.repairsC / 100).toFixed(2)}; net ${(L.netC / 100).toFixed(2)}; paid out ${(L.paidC / 100).toFixed(2)}`, L.flags.map(f => f.t).join(" | "), L.o.exclude ? "left out" : L.o.ok ? "checked" : "", L.o.why || ""])));
    r.adj.forEach(x => rows.push(base.concat(["Adjustment", String(x.at || "").slice(0, 10), "", "", "", "", "Console", "Manual adjustment", "", x.id, "", "", (x.amountC / 100).toFixed(2), "", "", "adjustment", x.why])));
  });
  download(`1099 payment audit ${y}.csv`, toCSV(rows)); audit("", y, `Payment audit report downloaded (${rows.length - 1} lines)`); dirty(); commit();
}
function t9ResultsImport(y){
  const sh = $("#sheet"); let plan = [];
  sh.innerHTML = `<div class="sheet-h"><div><h3>Import filing results</h3><div class="muted" style="font-size:12.5px;margin-top:3px">A status file from the filing service (CSV)</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b"><p class="help">Needs a column with the payer account number from the export (or the recipient name) and a status column (submitted / accepted / rejected). Date, receipt or submission ID and reason columns are picked up when present. You'll see every change before it's recorded.</p><input type="file" id="iF" accept=".csv,text/csv"><div id="iO" style="margin-top:12px"></div>
  <label class="check" style="margin-top:8px"><input type="checkbox" id="iOk"> This file came from the filing service / IRIS</label></div>
  <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="iC">Cancel</button><button class="btn primary" id="iS" disabled>Record</button></div>`;
  openPanel(); $("#shClose").onclick = $("#iC").onclick = () => closeSheet();
  $("#iF").onchange = async e => { const f = e.target.files[0]; if(!f) return; const rows = csvRows(await f.text()), hi = rows.findIndex(r => r.some(c => /status/i.test(c)));
    if(hi < 0){ $("#iO").innerHTML = `<p class="dp-warn">No Status column found.</p>`; return; }
    const H = rows[hi].map(c => String(c).trim().toLowerCase()), col = re => H.findIndex(h => re.test(h));
    const ci = {acct:col(/account/), name:col(/recipient|name|payee/), st:col(/status/), date:col(/date/), id:col(/receipt|submission|confirmation|batch|tracking/), why:col(/reason|error|message/)};
    const B = build(y); plan = rows.slice(hi + 1).map(r => { const a = ci.acct >= 0 ? String(r[ci.acct] || "").trim().toUpperCase() : "", nm = ci.name >= 0 ? String(r[ci.name] || "").trim() : "";
      const rc = B.list.find(x => a && acct(x) === a) || B.list.find(x => nm && nk(x.legal) === nk(nm)) || null, st = String(r[ci.st] || "").toLowerCase();
      const to = /reject|error(?!s)/.test(st) && !/accepted/.test(st) ? "rejected" : /accept/.test(st) ? "accepted" : /submit|transmit|filed|sent to irs/.test(st) ? "submitted" : "";
      return {rc, to, raw:r[ci.st], date:isoOf(ci.date >= 0 ? r[ci.date] : "") || todayISO(), id:ci.id >= 0 ? String(r[ci.id] || "").trim() : "", why:ci.why >= 0 ? String(r[ci.why] || "").trim() : "", who:a || nm,
        ok:false}; }).filter(p => p.who);
    plan.forEach(p => { p.ok = !!(p.rc && p.to && (p.to === "submitted" ? CAN.submitted(p.rc) : CAN[p.to](p.rc) || (p.to !== "submitted" && CAN.submitted(p.rc)))); });
    $("#iO").innerHTML = `<div class="tbl-wrap" style="max-height:320px;overflow:auto"><table class="tbl"><tbody>${plan.map(p => `<tr class="${p.ok ? "" : "t9-out"}"><td>${esc(p.who)}</td><td>${p.rc ? esc(p.rc.display) : `<span class="muted">no match</span>`}</td><td>${esc(p.raw || "")}</td><td>${p.ok ? `→ ${esc(fsLabel(p.to))} ${esc(p.date)}` : p.rc ? `<span class="muted">can't go from ${esc(fsLabel(p.rc.fs))}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
    $("#iS").disabled = !plan.some(p => p.ok); };
  $("#iS").onclick = () => { if(!$("#iOk").checked) return toast("Tick the box to confirm the file came from the filing service");
    const go2 = plan.filter(p => p.ok);
    save(() => go2.forEach(p => { const r = p.rc;
      if(p.to !== "submitted" && !["submitted", "delivered"].includes(r.fs)) setStatus(r, y, "submitted", {submitted:p.date, receipt:p.id, provider:T().filing.method || ""}, "from the results file");
      if(p.to === "submitted") setStatus(r, y, "submitted", {submitted:p.date, receipt:p.id, provider:T().filing.method || ""}, "from the results file");
      if(p.to === "accepted") setStatus(r, y, "accepted", {accepted:p.date, receipt:p.id || r.f.receipt || ""}, "from the results file");
      if(p.to === "rejected") setStatus(r, y, "rejected", {rejected:p.date, rejectWhy:p.why || "see the results file"}, p.why || "from the results file"); }));
    toast(`Recorded ${go2.length}`, true); closeSheet(); render(); };
}

/* ---------- filing setup: method, IRIS TCC, W-9 collection ---------- */
const METHOD_HELP = {
  qbo:"QuickBooks Online prepares 1099s from vendor payments recorded in QuickBooks, using its account-to-box mapping, leaves out card payments and corporations, e-files federal 1099-NEC and 1099-MISC, and can email or mail recipient copies (extra fees may apply). There's no import of outside 1099 amounts: anything paid from MagicDoor, Nickel or owner trust money has to be in QuickBooks for it to count, and owner rents usually aren't. Intuit transmits — PHD doesn't need its own TCC. Use the QuickBooks worksheet export to compare.",
  tax1099:"Tax1099 imports forms from its spreadsheet template (with a column-mapping step), e-files under its own transmitter credentials and can mail or e-deliver recipient copies. PHD doesn't need its own TCC. Add TINs in Tax1099 from the W-9s, or use its W-9 collection if your plan includes it.",
  avalara:"Avalara 1099 & W-9 imports forms with its Create Forms CSV (template or field mapping), offers W-9 collection and real-time IRS TIN matching, and e-files under its own credentials. PHD doesn't need its own TCC.",
  iris:"The IRS's free IRIS Taxpayer Portal: enter forms one by one or upload the IRS's CSV template for the tax year (one form type per file; up to 100 forms per submission). PHD needs its own IRIS Transmitter Control Code (TCC) — a separate code from the old FIRE system, which stops taking returns after the 2026 season. After Jan 1, 2027 IRIS is the IRS's only e-file system. You download recipient copies from the portal and send them yourself.",
  other:"Another filing service: most transmit under their own credentials (PHD doesn't need its own TCC) and take a spreadsheet with column mapping — use the generic 1099-NEC / 1099-MISC exports. Check the service's own template before uploading."
};
function t9Setup(v, y, B){
  const F = T().filing, tcc = F.tcc || {}, cfg = yearCfg(y);
  const c = elm("div", "card"); c.innerHTML = `<div class="card-h"><h3>How PHD files</h3></div><div style="padding:0 16px 14px">
    <div class="t9-meth">${METHODS.map(([kk, l]) => `<label class="t9-m ${F.method === kk ? "on" : ""}"><input type="radio" name="t9m" value="${kk}" ${F.method === kk ? "checked" : ""}><b>${l}</b><span>${esc(METHOD_HELP[kk])}</span></label>`).join("")}</div>
    <p class="help">Picking a method doesn't file anything. Forms only move to “Submitted” when someone records what the service or IRIS shows.</p>
    ${F.method === "iris" ? `<div class="t9-al bad" style="margin:10px 0">PHD must have its own <b>IRIS Transmitter Control Code (TCC)</b> to file through IRIS. A FIRE TCC doesn't carry over. The IRS says to allow up to 45 days for the application to be processed, and it needs PHD's EIN and a Responsible Official who signs in to IRS e-Services. <a href="${IRIS_TCC_URL}" target="_blank" rel="noopener">Apply: IRIS Application for TCC (irs.gov)</a> · <a href="${IRIS_URL}" target="_blank" rel="noopener">About IRIS</a> · <a href="${IRIS_PORTAL}" target="_blank" rel="noopener">IRIS Taxpayer Portal</a><br><br>Having a TCC doesn't mean any 1099 has been filed — it only lets PHD log in and submit.</div>
      <div class="f3"><label class="fld"><span>TCC application</span><select id="tS"><option value="">Not started</option><option value="applied" ${tcc.status === "applied" ? "selected" : ""}>Applied</option><option value="approved" ${tcc.status === "approved" ? "selected" : ""}>Approved</option></select></label><label class="fld"><span>Applied on</span><input type="date" id="tA" value="${esc(tcc.applied || "")}"></label><label class="fld"><span>Approved on</span><input type="date" id="tP" value="${esc(tcc.approved || "")}"></label></div>
      <label class="fld"><span>Notes (who the Responsible Official is, where the TCC letter is kept — not the code itself)</span><input type="text" id="tN" value="${esc(tcc.note || "")}"></label>` : F.method ? `<p class="help" style="margin-top:10px">With ${esc(methodLabel(F.method))} the service transmits to the IRS under its own credentials, so PHD generally doesn't need its own TCC. Export: <b>${esc((PROVIDERS[F.method] || PROVIDERS.generic_nec).name)}</b> on the Export tab.</p>` : ""}
    <div class="sectl">W-9 collection</div>
    <div class="f2"><label class="fld"><span>Secure W-9 link (provider request page or secure upload — https)</span><input type="url" id="wL" value="${esc(F.w9Link || "")}" placeholder="https://…"></label><label class="fld"><span>Filing service that sends secure W-9 requests (if you use one)</span><input type="text" id="wP" value="${esc(F.w9Provider || "")}" placeholder="e.g. Avalara"></label></div>
    <label class="fld"><span>Mail / drop-off address for paper W-9s</span><input type="text" id="wM" value="${esc(F.w9Mail || "")}"></label>
    <p class="help">W-9 request emails point people to the secure link, the provider's request, or the mailing address — they always ask people not to email their tax ID.</p>
    <div class="sectl">Approvals and owner amounts</div>
    <label class="check"><input type="checkbox" id="w2" ${F.twoPerson ? "checked" : ""}> Two-person rule — the person who reviews a form can't also approve it</label>
    <label class="fld" style="margin-top:8px"><span>CPA confirmation for the ${esc(y)} owner box 1 basis (required if it's net)</span><input type="text" id="wC" value="${esc(cfg.cpaNote)}" placeholder="e.g. Confirmed gross rent with J. Smith CPA, 11/20/2026"></label>
    <div class="bl-pay" style="margin-top:10px"><button class="btn primary" id="wS">Save</button></div></div>`;
  v.appendChild(c);
  c.querySelectorAll("[name=t9m]").forEach(n => n.onchange = () => { save(() => { const was = F.method; F.method = n.value; audit("", y, `Filing method: ${methodLabel(was)} → ${methodLabel(n.value)}`); }); render(); });
  c.querySelector("#wS").onclick = () => {
    const link = c.querySelector("#wL").value.trim(); if(link && !/^https:\/\//i.test(link)) return toast("The secure link has to start with https://");
    const ch = [];
    save(() => {
      if(F.method === "iris"){ const nt = {status:c.querySelector("#tS").value, applied:c.querySelector("#tA").value, approved:c.querySelector("#tP").value, note:c.querySelector("#tN").value.trim()};
        if(nt.status === "approved" && !nt.approved) nt.approved = todayISO(); if(nt.status && !nt.applied) nt.applied = tcc.applied || todayISO();
        if(JSON.stringify(nt) !== JSON.stringify(Object.assign({status:"", applied:"", approved:"", note:""}, tcc))){ F.tcc = nt; ch.push(`IRIS TCC: ${nt.status || "not started"}${nt.applied ? `, applied ${nt.applied}` : ""}${nt.approved ? `, approved ${nt.approved}` : ""}`); } }
      if(link !== (F.w9Link || "")){ F.w9Link = link; ch.push("secure W-9 link"); }
      const wp = c.querySelector("#wP").value.trim(), wm = c.querySelector("#wM").value.trim();
      if(wp !== (F.w9Provider || "")){ F.w9Provider = wp; ch.push(`W-9 provider: ${wp || "none"}`); } if(wm !== (F.w9Mail || "")){ F.w9Mail = wm; ch.push("W-9 mailing address"); }
      const tp = c.querySelector("#w2").checked; if(tp !== !!F.twoPerson){ F.twoPerson = tp; ch.push(`two-person rule ${tp ? "on" : "off"}`); }
      const cn = c.querySelector("#wC").value.trim(); if(cn !== cfg.cpaNote){ T().years[y] = Object.assign({}, T().years[y] || {}, {cpaNote:cn}); ch.push(`CPA note for ${y}: ${cn || "(cleared)"}`); }
      if(ch.length) audit("", y, "Filing setup: " + ch.join("; "));
    });
    toast(ch.length ? "Saved" : "No changes", true); render(); };
}
function t9Guide(v, y, dl, cfg){
  const c = elm("div", "card t9-guide");
  c.innerHTML = `<div class="card-h"><h3>Filing the ${esc(y)} 1099s</h3></div><div style="padding:0 16px 14px;font-size:14px;line-height:1.55">
    <ol>
      <li><b>Filing setup:</b> pick the filing method. For IRIS, apply for PHD's IRIS TCC right away (allow up to 45 days). For QuickBooks, Tax1099 or Avalara, the service transmits for PHD.</li>
      <li><b>W-9s (now through December):</b> on Recipients → Missing W-9, select everyone and “Draft W-9 requests”. Send through the secure link or the provider — never ask for a tax ID by email. Record each request and reminder; set the status to Received when it arrives and Verified once checked (or TIN-matched).</li>
      <li><b>Review queue (early January):</b> categorize vendors (services vs goods), confirm year-end payment dates for MagicDoor bills, settle probable duplicates, link owner records or vendor names that share a tax ID, and check flagged statement months. Record any payment made outside the console (or import QuickBooks payments).</li>
      <li><b>Review and approve each form:</b> open a recipient, check the amount (click it to see every transaction), Mark reviewed, then Approve for filing. Approvals go out of date if the amount changes.</li>
      <li><b>Export for filing:</b> only approved forms with no blocking errors go into the files. Add TINs from the W-9s at the filing service / IRIS, then submit there.</li>
      <li><b>Record what happened:</b> Submitted (with the batch or receipt ID), IRS accepted / rejected, recipient copy sent, correction required — or import the service's results file. Nothing is marked filed because a file was downloaded.</li>
    </ol>
    <table class="tbl" style="max-width:680px"><tbody>
      <tr><td>1099-NEC to the IRS and recipients</td><td><b>${esc(fY(dl.nec))}</b></td></tr>
      <tr><td>1099-MISC recipient copies (box 1 rents)</td><td><b>${esc(fY(dl.recip))}</b></td></tr>
      <tr><td>1099-MISC to the IRS</td><td><b>${esc(fY(dl.miscE))}</b> e-filed (${esc(fY(dl.miscP))} on paper)</td></tr>
      <tr><td>Thresholds for ${esc(y)}</td><td><b>${usd(Math.round(cfg.threshold * 100))}</b> NEC · <b>${usd(Math.round(cfg.thresholdMisc * 100))}</b> MISC rents ${Number(y) >= 2026 ? "(was $600 through 2025; indexed for inflation after 2026)" : ""}</td></tr>
      <tr><td>E-filing</td><td>Required at 10 or more information returns in total. FIRE stops after the 2026 season; IRIS is the IRS's only e-file system from Jan 1, 2027.</td></tr></tbody></table>
    <p class="help" style="margin-top:12px">Rules the console applies: card and payment-app payments are left out (the processor files a 1099-K). Payments to corporations — including LLCs that elected C or S treatment — get no 1099, except legal (and medical) services; an LLC isn't exempt just because it's an LLC. Services including the parts and materials used on the job are reportable; pure goods aren't. Owners get a 1099-MISC box 1 for rent collected for them, unless they're a corporation. Box 1 is gross rent unless PHD's CPA confirms otherwise. The console prepares and tracks — filing happens at the service or IRIS.</p>
    <p class="help">Sources: <a href="https://www.irs.gov/iris" target="_blank" rel="noopener">IRS — E-file information returns with IRIS</a> · <a href="https://www.irs.gov/filing/fire-system-retirement" target="_blank" rel="noopener">FIRE system retirement</a> · <a href="https://www.irs.gov/businesses/small-businesses-self-employed/Am-I-Required-to-File-a-Form-1099-or-Other-Information-Return" target="_blank" rel="noopener">Am I required to file a Form 1099?</a> · <a href="https://www.irs.gov/pub/irs-pdf/pub5903.pdf" target="_blank" rel="noopener">Pub 5903 (IRIS TCC application)</a></p>
  </div>`;
  v.appendChild(c);
}

/* ---------- compatibility: the vendor page and older callers ---------- */
function vendorRows(y){
  return build(y).list.filter(r => r.type === "vendor").map(r => ({g:{gk:r.links.vendors[0], name:r.display, names:r.names || new Set(), pays:r.pays.filter(x => x.inYear)}, v:r.v0 && r.v0.id ? r.v0 : null, totC:r.grossC, cardC:r.cardC, adjC:r.adjC, repC:r.repC,
    st:{k:r.k === "potential" ? (r.blocking.length ? "todo" : "ready") : r.k, t:r.k === "potential" ? fsLabel(r.fs) + (r.blocking.length ? ` · ${r.blocking.length} to fix` : "") : r.k === "under" ? `Under ${usd(r.thrC)}` : r.exempt}, w9:r.w9file, tax:(r.v0 && r.v0.tax) || {}, attorney:r.attorney, rid:r.id}));
}
function ownerRows(y){
  return build(y).list.filter(r => r.type === "owner").map(r => ({o:r.o0 && r.o0.id ? r.o0 : null, grossC:r.grossC, netC:r.netC, paidC:r.paidC, amtC:r.repC, props:new Set(r.lines.map(L => L.where)), months:r.lines.length,
    st:{k:r.k === "potential" ? (r.blocking.length ? "todo" : "ready") : r.k, t:r.k === "potential" ? fsLabel(r.fs) : r.k === "under" ? `Under ${usd(r.thrC)}` : r.exempt}, rid:r.id}));
}

/* ---------- wiring ---------- */
window.PAGE_EXT = Object.assign(window.PAGE_EXT || {}, {tax1099:() => { $("#pgCrumb").textContent = "Money"; $("#pgTitle").textContent = "1099 Tax Center"; pg1099(); }});
if(typeof PM_VIEWS !== "undefined") PM_VIEWS.add("tax1099");
if(typeof cloudDocs === "function"){ const d0 = cloudDocs; cloudDocs = function(){ const out = d0.apply(this, arguments); if(S.tax1099) out.set("shared/tax1099", S.tax1099);
  Object.values(RD()).forEach(d => { if(d && d.id) out.set("shared/t9r:" + d.id, d); }); return out; }; }
if(typeof cloudApply === "function"){ const a0 = cloudApply; cloudApply = function(kind, id, data, deleted){
  if(kind === "shared" && id === "tax1099"){ S.tax1099 = deleted ? {} : data; dirty(); return; }
  if(kind === "shared" && /^t9r:/.test(id)){ const k = id.slice(4); if(deleted) delete RD()[k]; else RD()[k] = data; dirty(); return; }
  return a0.apply(this, arguments); }; }
if(typeof cloudLabel === "function"){ const l0 = cloudLabel; cloudLabel = function(kind, id){ if(kind === "shared" && id === "tax1099") return "1099 settings"; if(kind === "shared" && /^t9r:/.test(id)){ const d = RD()[id.slice(4)]; return "1099 recipient" + (d && (d.display || d.legal) ? ` "${d.display || d.legal}"` : ""); } return l0.apply(this, arguments); }; }
window.t9NavBadge = () => { try{ const m = todayISO().slice(5, 7); if(m >= "05" && m <= "09") return null;
  const y = String(Number(todayISO().slice(0, 4)) - (m <= "04" ? 1 : 0)), L = build(y).list.filter(r => r.k === "potential");
  const n = L.filter(r => !["received", "verified"].includes(r.w9s) || r.blocking.length || ["rejected", "correction"].includes(r.fs)).length;
  return n ? navBadge(n, m <= "03" || ["rejected", "correction"].some(s => L.some(r => r.fs === s)) ? "alert" : "goldfill", "1099s: missing W-9s, items to fix or rejected forms") : null; }catch(e){ return null; } };
Object.assign(window, {pg1099, vendorRows, ownerRows, vendorPayments:y => allVendorPays().filter(x => String(x.effDate).startsWith(y)), t9YearCfg:yearCfg,
  t9Build:y => { dirty(); return build(y); }, t9Export, t9Exportable:y => { dirty(); return exportable(y, build(y)); }, t9Step, t9QboParse, t9CAN:CAN, t9Deadlines:deadlines, t9RecipientSheet, t9AmountSheet});
})();
