// PMCore copied from supabase/magicdoor/engine.js (itself generated from pmcore.js) — the console's own month math,
// so the assistant's numbers are the ones on screen. Don't edit here; re-copy when pmcore.js changes.
/* =====================================================================
   PMCore — the property-management math and the alert rules.
   Pure functions with no screen code, so the console and the Google
   Apps Script morning digest run exactly the same logic.
   ===================================================================== */
const PMCore = (function(){
  const cents = n => Math.round((Number(n) || 0) * 100);
  const has = v => v != null && v !== "";
  const nz = v => has(v) ? cents(v) : 0;
  const usd = c => (c < 0 ? "−" : "") + "$" + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const usd0 = c => (c < 0 ? "−" : "") + "$" + Math.round(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const EXTRA = ["applications", "lateFee", "reimbursement", "filters"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthLabel = m => { const [y, mm] = String(m).split("-").map(Number); return `${MONTHS[mm - 1]} ${y}`; };
  const monthAdd = (m, n) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const dayNum = iso => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
  const isoOf = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const endOfMonth = m => { const [y, mm] = m.split("-").map(Number); return isoOf(Math.floor(Date.UTC(y, mm, 0) / 864e5)); };
  const shortDate = iso => { const [y, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1].slice(0, 3)} ${d}`; };

  const DEFAULTS = {
    lateAfterDay: 5,        // rent counts as late after this day of the month
    payoutDays: 0,          // owner payouts due this many days after month end (0 = by the last day)
    startByDay: 2,          // remind to start the month after this day
    closeByDay: 15,         // previous month should be closed by this day
    renewalDays: 60,        // lease-renewal heads-up window
    depositDays: 30,        // SC: deposit returned (with itemized list) within 30 days of move-out
    vacancyDays: 30,        // vacant / marketing longer than this
    inboxStaleDays: 2       // receipts waiting for review longer than this
  };

  function feeRuleText(r){ if(!r) return "10%"; return r.type === "flat" ? `${usd(cents(r.amount))} flat` : `${Number(r.rate)}%`; }
  function itemFee(it, prop){
    if(it.feeMode === "none") return 0;
    if(it.feeMode === "custom" || (it.feeMode == null && it.fee != null)) return cents(it.fee);
    return Math.round(cents(it.amount) * Number(prop && prop.adminRate != null ? prop.adminRate : 10) / 100);
  }

  /* one row's numbers, all in cents */
  function calc(row, prop, today){
    const items = row.repairItems || [];
    const itemsC = items.reduce((a, it) => a + cents(it.amount), 0);
    const itemsFeeC = items.reduce((a, it) => a + itemFee(it, prop), 0);
    const recv = nz(row.rentReceived);
    const repairsC = has(row.repairs) ? cents(row.repairs) : itemsC;
    const adminC = has(row.adminFee) ? cents(row.adminFee) : itemsFeeC;
    const rule = (prop && prop.feeRule) || {type:"pct", rate:10};
    const ruleFeeC = rule.type === "flat" ? (recv > 0 ? cents(rule.amount) : 0) : Math.round(recv * Number(rule.rate || 0) / 100);
    const pmFeeC = has(row.pmFee) ? cents(row.pmFee) : ruleFeeC;
    const leasingC = nz(row.leasingFee), otherC = nz(row.otherIncome);
    const adjC = (row.adjustments || []).reduce((a, x) => a + cents(x.amount), 0);
    const calcC = recv - repairsC - adminC - pmFeeC - leasingC + otherC + adjC;
    const recordedC = has(row.ownerPayout) ? cents(row.ownerPayout) : null;
    const payoutC = recordedC != null ? recordedC : calcC;
    const extrasC = EXTRA.reduce((a, k) => a + nz(row[k]), 0);
    const phdC = pmFeeC + adminC + leasingC + extrasC;
    const dueC = nz(row.rentDue);
    const thisM = (today || new Date().toISOString().slice(0, 10)).slice(0, 7);
    const flags = [];
    if(recordedC != null && Math.abs(recordedC - calcC) > 1)
      flags.push({level:"warn", text:`Recorded payout ${usd(recordedC)} is ${usd(Math.abs(recordedC - calcC))} ${recordedC > calcC ? "more" : "less"} than the formula (${usd(calcC)})`});
    if(dueC > 0 && recv > 0 && recv < dueC && !row.locked) flags.push({level:"warn", text:`${usd(dueC - recv)} short of rent due`});
    if(dueC > 0 && !recv && !row.locked && row.month <= thisM) flags.push({level:"info", text:"Rent not recorded yet"});
    // rent still to come this month isn't a shortfall: only say the owner owes once rent is in (or the month is over)
    const waiting = dueC > 0 && !recv && !row.locked && row.month >= thisM;
    if(payoutC < 0 && !waiting) flags.push({level:"warn", text:`Owner owes ${usd(-payoutC)} this month — repairs exceed rent`});
    if(!has(row.pmFee) && rule.check) flags.push({level:"info", text:`Fee rule ${feeRuleText(rule)} came from the workbook — confirm it`});
    // MagicDoor's owner statement says what the owner is owed for the month; anything else here is a mistake somewhere
    if(has(row.mdNet) && !row.locked && Math.abs(calcC - cents(row.mdNet)) > 1)
      flags.push({level:"warn", text:`Doesn't match MagicDoor's owner statement: MagicDoor says ${usd(cents(row.mdNet))}, the console works out ${usd(calcC)} (${usd(Math.abs(calcC - cents(row.mdNet)))} ${calcC > cents(row.mdNet) ? "more" : "less"})`});
    const mdFee = row.md && has(row.md.pmFee) && cents(row.md.pmFee) === cents(row.pmFee);
    if(has(row.pmFee) && !mdFee && !row.locked && Math.abs(cents(row.pmFee) - ruleFeeC) > 1) flags.push({level:"info", text:`PM fee set by hand (${usd(cents(row.pmFee))}; rule gives ${usd(ruleFeeC)})`});
    const [y, mo] = String(row.month).split("-").map(Number);
    items.forEach(it => { if(it.date){ const months = (y - +it.date.slice(0, 4)) * 12 + (mo - +it.date.slice(5, 7));
      if(months > 14 || months < -2) flags.push({level:"info", text:`Repair date ${it.date} (${it.vendor || it.memo || "item"}) looks like a typo`}); } });
    return {dueC, recv, repairsC, adminC, pmFeeC, ruleFeeC, leasingC, otherC, adjC, calcC, recordedC, payoutC, extrasC, phdC, itemsC, itemsFeeC, flags};
  }

  /* where a property stands for one month: used for colours and filters everywhere */
  function rentStatus(row, prop, today){
    if(!prop || prop.status === "inactive") return "inactive";
    if(!row || row.detailOnly){ return prop.status === "active" ? "none" : "vacant"; }
    const c = calc(row, prop, today);
    if(c.dueC <= 0 && !c.recv) return prop.status === "active" ? "nodue" : "vacant";
    if(c.recv >= c.dueC && c.recv > 0) return "paid";
    if(c.recv > 0) return "partial";
    const m = row.month, t = today.slice(0, 7), day = +today.slice(8, 10);
    if(m < t) return "late";
    if(m > t) return "upcoming";
    return day > (row._lateAfter || DEFAULTS.lateAfterDay) ? "late" : "due";
  }

  /* every alert that needs a person, newest rules first in severity */
  /* ---------- MagicDoor: match console properties to MagicDoor units ---------- */
  const SUFFIX = {street:"st", str:"st", avenue:"ave", av:"ave", drive:"dr", drv:"dr", road:"rd", circle:"cir", boulevard:"blvd", lane:"ln", court:"ct",
    place:"pl", parkway:"pkwy", terrace:"ter", trail:"trl", highway:"hwy", square:"sq", cove:"cv", point:"pt", crossing:"xing", north:"n", south:"s", east:"e", west:"w"};
  // "342 King St, A, Charleston, SC 29401" → "342 king st a";  "120 Smith St Charleston. SC 29403" → "120 smith st"
  const STREET_END = new Set(["st","ave","dr","rd","cir","blvd","ln","ct","pl","pkwy","ter","trl","hwy","sq","cv","pt","xing","way","row","loop","run","walk","aly","bnd","pass","path"]);
  const CITY_WORDS = new Set(["charleston","north","n","mount","mt","pleasant","summerville","johns","john","s","island","hanahan","ladson","goose","creek","moncks","corner","bonneau","isle","of","palms","folly","beach","james","daniel","ravenel","hollywood","awendaw","wando","west","ashley","ridgeville","walterboro"]);
  function normAddr(x){
    const segs = String(x || "").toLowerCase().split(",").map(z => z.trim()).filter(Boolean);
    if(!segs.length) return "";
    let t = segs[0];
    // a short second part is the unit ("A", "Unit 1371", "Suite 100", "A - Downstairs") when a city follows it
    const UNIT = /^((unit|apt|suite|ste|#)\s*[a-z0-9-]{1,6}|[a-z0-9]{1,4}(\s*-\s*[a-z ]{1,14})?)$/;
    if(segs.length >= 2 && UNIT.test(segs[1])) t += " " + segs[1];                 // "342 King St, A" / "949 E Estates Blvd, #304"
    const cityFollows = segs.length > 1 && /^(sc|nc|ga)\b|^\d{5}/.test(segs[segs.length - 1]) && segs.length === 2;
    t = t.replace(/\b(unit|apt|apartment|suite|ste|no)\b\.?/g, " ").replace(/[#.]/g, " ").replace(/[^a-z0-9 ]/g, " ");
    let w = t.split(/\s+/).filter(Boolean).map(z => SUFFIX[z] || z);
    // drop a city / state / zip run on the end ("... st charleston sc 29403")
    let cut = w.findIndex((z, i) => i > 1 && (/^\d{5}$/.test(z) || (z === "sc" && i === w.length - 1) || (z === "sc" && /^\d{5}$/.test(w[i + 1] || ""))));
    if(cut < 0 && cityFollows) cut = w.length;                       // "12 Bee St #D Charleston, SC 29403"
    if(cut > 0){
      w = w.slice(0, cut);
      let last = -1; w.forEach((z, i) => { if(STREET_END.has(z)) last = i; });
      if(last < 0) while(w.length > 2 && CITY_WORDS.has(w[w.length - 1])) w.pop();   // "7633 Ireland Charleston SC" → "7633 ireland"
      if(last > 0){ const nx = w[last + 1]; w = w.slice(0, last + 1 + (nx && /^([a-z]|\d{1,5}|[a-z]\d{1,4})$/.test(nx) && !/^(n|s|e|w)$/.test(nx) ? 1 : 0)); }
    }
    return w.join(" ");
  }
  // extra spellings of one address: without a repeated house number ("1371 hopton cir 1371" → "hopton cir 1371")
  // extra spellings of one address: without a repeated house number ("1371 hopton cir 1371" → "hopton cir 1371"),
  // and without the street type ("1213 captain rivers dr" → "1213 captain rivers") as a last resort
  function addrVariants(k){
    const out = [k], w = k.split(" ");
    if(/^\d+$/.test(w[0]) && w.slice(1).includes(w[0])) out.push(w.slice(1).join(" "));
    const noType = w.filter((z, i) => !(i > 1 && STREET_END.has(z))).join(" ");
    if(noType !== k && noType.split(" ").length >= 2) out.push(noType);
    return out;
  }
  function unitKeys(u, mp){
    const base = normAddr((mp && mp.addr && mp.addr.street) || (u.addr && u.addr.street) || u.line);
    const nm = normAddr(u.name), out = new Set();
    if(base && (!nm || nm === base || base.endsWith(" " + nm) || nm === "home" || (mp && mp.unitCount === 1))) out.add(base);
    if(base && nm && nm !== base && nm !== "home") out.add(nm.startsWith(base) ? nm : base + " " + nm.split(" ")[0]);
    if(u.line) out.add(normAddr(u.line));
    [...out].forEach(k => addrVariants(k).forEach(v => out.add(v)));
    return out;
  }
  const mdLinkVal = v => String(v || "");
  // links: {pmPropId: mdUnitId | "p:" + mdPropertyId | "none"} chosen by people; everything else is matched by address.
  // A property here can be one MagicDoor unit, or a whole MagicDoor property (a building with several units).
  // MagicDoor properties that are only for testing or templates never become properties here
  const MD_SKIP = /\b(test address|test property|application template|template property)\b/i;
  // opts: {ignore: {unitId|"p:"+propId: true}, score: pid => number (history; the higher one is kept when two rows are the same unit)}
  function mdIndex(md, pmProps, links, opts){
    links = links || {}; opts = opts || {};
    const ignore = opts.ignore || {}, score = opts.score || (() => 0);
    const uniq = list => { const m = new Map(); (list || []).forEach(x => m.set(x.id, x)); return [...m.values()]; };
    const props = {}; uniq(md.properties).forEach(x => props[x.id] = x);
    const skipProp = mp => !mp || mp.active === false || MD_SKIP.test(mp.name || "") || ignore["p:" + mp.id];
    const units = uniq(md.units).filter(u => u.active !== false && !skipProp(props[u.propertyId]) && !ignore[u.id]);
    const unitById = {}; units.forEach(u => unitById[u.id] = u);
    const unitsOf = pid => units.filter(u => u.propertyId === pid);
    const byKey = {}, propByKey = {};
    units.forEach(u => unitKeys(u, props[u.propertyId]).forEach(k => (byKey[k] = byKey[k] || []).push(u)));
    Object.values(props).filter(x => !skipProp(x)).forEach(x => new Set([normAddr(x.addr && x.addr.street), normAddr(x.name)]).forEach(k => { if(k) (propByKey[k] = propByKey[k] || []).push(x); }));
    const leases = uniq(md.leases);
    const leaseFor = uid => {
      const mine = leases.filter(l => l.unitId === uid);
      return {active:mine.find(l => !l.ended) || null, ended:mine.filter(l => l.ended).sort((a, b) => String(b.end).localeCompare(String(a.end)))[0] || null};
    };
    const pick = {};
    const all = pmProps.filter(p => !p.deleted);
    all.forEach(p => {
      const l = mdLinkVal(links[p.id]);
      if(l === "none") return;
      if(l.startsWith("p:") && props[l.slice(2)] && !skipProp(props[l.slice(2)])){ pick[p.id] = {propId:l.slice(2), how:"manual"}; return; }
      if(l && unitById[l]){ pick[p.id] = {unitId:l, how:"manual"}; return; }
      const keys = [...new Set([p.address, p.name].concat(p.aliases || []).map(normAddr).filter(Boolean).flatMap(addrVariants))].sort((a, b) => b.length - a.length);
      for(const k of keys){ const h = byKey[k] || []; if(h.length === 1){ pick[p.id] = {unitId:h[0].id, how:"auto"}; return; } }
      for(const k of keys){ const h = propByKey[k] || []; if(h.length === 1){ pick[p.id] = {propId:h[0].id, how:"auto"}; return; } }
    });
    // the same MagicDoor unit (or building) claimed by more than one property here: keep one, report the rest as duplicates
    const claims = {};
    const owns = x => x.unitId ? [x.unitId, "p:" + (unitById[x.unitId] ? unitById[x.unitId].propertyId : "")] : unitsOf(x.propId).map(u => u.id).concat(["p:" + x.propId]);
    Object.entries(pick).forEach(([pid, x]) => owns(x).forEach(k => (claims[k] = claims[k] || []).push(pid)));
    const byId = {}; all.forEach(p => byId[p.id] = p);
    const rank = pid => [score(pid), pick[pid].how === "manual" ? 1 : 0, byId[pid].status !== "inactive" ? 1 : 0];   // the row with history wins
    const better = (a, b) => { const A = rank(a), B = rank(b); for(let i = 0; i < A.length; i++) if(A[i] !== B[i]) return A[i] > B[i] ? a : b; return a < b ? a : b; };
    const dupes = [], seenDup = new Set();
    Object.entries(claims).forEach(([k, pids]) => {
      const live2 = [...new Set(pids)].filter(pid => pick[pid]);
      if(live2.length < 2) return;
      // a unit link and a whole-building link on different units of one building aren't duplicates
      if(k.startsWith("p:") && live2.every(pid => pick[pid].unitId) && new Set(live2.map(pid => pick[pid].unitId)).size === live2.length) return;
      const keep = live2.reduce(better);
      live2.filter(pid => pid !== keep).forEach(pid => { if(!seenDup.has(pid)){ seenDup.add(pid); dupes.push({keep, drop:pid, unitId:pick[pid].unitId || null, propId:pick[pid].propId || null}); } delete pick[pid]; });
    });
    const byProp = {}, taken = new Set();
    Object.entries(pick).forEach(([pid, x]) => {
      if(x.unitId){
        const u = unitById[x.unitId]; taken.add(u.id);
        const L = leaseFor(u.id);
        byProp[pid] = {unit:u, property:props[u.propertyId] || null, lease:L.active, endedLease:L.ended, how:x.how};
      } else {
        const mp = props[x.propId], us = unitsOf(x.propId); us.forEach(u => taken.add(u.id));
        const act = leases.filter(l => l.propertyId === x.propId && !l.ended), ended = leases.filter(l => l.propertyId === x.propId && l.ended).sort((a, b) => String(b.end).localeCompare(String(a.end)));
        byProp[pid] = {unit:null, units:us, property:mp, whole:true, leases:act, lease:act.length === 1 ? act[0] : act.length ? mdCombine(act) : null, endedLease:act.length ? null : ended[0] || null, how:x.how};
      }
    });
    const linkedPerMdProp = {};
    Object.values(byProp).forEach(x => { if(x.property) linkedPerMdProp[x.property.id] = (linkedPerMdProp[x.property.id] || 0) + 1; });
    const manualUnits = new Set(Object.values(links).map(String));
    const live = all.filter(p => p.status !== "inactive");
    return {byProp, linkedPerMdProp, syncedAt:md.syncedAt, dupes, props,
      unmatchedUnits:units.filter(u => !taken.has(u.id) && !manualUnits.has(u.id)),
      unmatchedProps:live.filter(p => !byProp[p.id] && links[p.id] !== "none" && !dupes.some(d => d.drop === p.id))};
  }
  // several leases in one building, read as one: totals, the worst lateness, the latest payment
  function mdCombine(ls){
    const max = (k) => ls.map(l => l[k]).filter(Boolean).sort().pop() || null, min = (k) => ls.map(l => l[k]).filter(Boolean).sort()[0] || null;
    const sum = k => Math.round(ls.reduce((a, l) => a + (Number(l[k]) || 0), 0) * 100) / 100;
    const owing = ls.filter(l => (l.balance || 0) > 0);
    return {id:"all", combined:true, count:ls.length, rent:sum("rent"), balance:sum("balance"), depositPaid:sum("depositPaid"), depositDue:sum("depositDue"),
      pastDueDays:Math.max(0, ...ls.map(l => l.pastDueDays || 0)), lastPayment:max("lastPayment"), unpaidSince:owing.map(l => l.unpaidSince).filter(Boolean).sort()[0] || null,
      start:min("start"), end:null, monthToMonth:false, eviction:ls.some(l => l.eviction), owingCount:owing.length,
      tenants:ls.flatMap(l => (l.tenants || []).filter(t => !t.movedOut)),
      months:ls.some(l => l.months) ? ls.reduce((acc, l) => { Object.entries(l.months || {}).forEach(([m, g]) => { const o = acc[m] = acc[m] || {}; Object.entries(g).forEach(([k, v]) => { o[k] = Math.round(((o[k] || 0) + (Number(v) || 0)) * 100) / 100; }); }); return acc; }, {}) : null};
  }
  // nothing owed, and either a payment this month or a credit balance
  function mdPaidThisMonth(L, m){ return (L.balance || 0) <= 0 && ((L.lastPayment && L.lastPayment.slice(0, 7) >= m) || (L.balance || 0) < 0); }
  // vendor bill lines for one MagicDoor property in one month (by bill date); company bills and fee/owner accounts left out
  // MagicDoor records PHD's 10% admin fee (and management fees) as bill lines of their own. The console works the
  // admin fee out itself from the repairs, so those lines are never repairs — taking them in would charge 10% twice.
  const NOT_REPAIR = /admin(istrative)?\s*fee|management fee|distribution|owner contribution|security deposit|leasing fee|rent income/i;
  function mdIsRepairLine(li, b){ return !!(li && li.amount && !(b && b.company) && !NOT_REPAIR.test(li.account || "") && !/\badmin(istrative)?\s*fee\b/i.test(li.text || "")); }
  // the description to show for a bill line: on a one-line bill it's the bill's memo (what MagicDoor's bill list shows
  // and what gets edited there — editing it doesn't touch the line's own text); on a split bill each line's own text
  function mdLineMemo(li, b){
    const t = String((li && li.text) || "").trim(), m = String((b && b.memo) || "").trim();
    const twice = t && m.replace(/\s+/g, "") === (t + t).replace(/\s+/g, "");   // a memo pasted in twice
    return ((b && (b.lines || []).length <= 1 && !twice) ? (m || t) : (t || m));
  }
  /* ---- MagicDoor's owner statements: the month a bill or a payout counts in is the month MagicDoor's owner statement
     puts it in (cash basis — a bill dated the 28th and paid the 3rd counts the month it was paid), so every month here
     adds up to what the owner was actually paid. Without statements: the bill date, and the payout date. ---- */
  const vkey = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const _bm = new WeakMap();
  function mdStmt(md, mdPropId, month){ const s = md && md.stmts && md.stmts[mdPropId]; return s ? s[month] || null : null; }
  // bill line id → the statement month it was paid in
  function mdBillMonths(md, mdPropId){
    if(!md || !md.stmts || !md.stmts[mdPropId]) return null;
    let byMd = _bm.get(md); if(!byMd){ byMd = {}; _bm.set(md, byMd); }
    if(byMd[mdPropId]) return byMd[mdPropId];
    const st = md.stmts[mdPropId], months = Object.keys(st).sort(), pool = [];
    months.forEach(m => (st[m].bills || []).forEach(x => pool.push({m, v:vkey(x.v), c:cents(x.a), unpaid:!!x.unpaid, used:false})));
    const lines = [];
    (md.bills || []).forEach(b => { if(b.company || !b.date) return; (b.lines || []).forEach(li => { if(li.propertyId === mdPropId && mdIsRepairLine(li, b)) lines.push({li, b}); }); });
    lines.sort((x, y) => String(x.b.date).localeCompare(y.b.date));
    const map = new Map();
    // a bill still owed in MagicDoor can only be one of the statement's unpaid bills, and a paid one only a payment;
    // an entry with a vendor name only matches that vendor
    // a bill MagicDoor still owes belongs to the latest statement that lists it (that's the month it comes off what the
    // owner is paid); a paid one to the statement it was paid in
    const rev = pool.slice().reverse();
    const take = (li, b, sameVendor) => (Number(b.owed) > 0 ? rev : pool).find(e => !e.used && e.c === cents(li.amount) && e.m >= b.date.slice(0, 7)
      && e.unpaid === (Number(b.owed) > 0) && (e.v ? !vkey(b.vendor) || e.v === vkey(b.vendor) : !sameVendor || true));
    [true, false].forEach(sameVendor => lines.forEach(({li, b}) => { if(map.has(li.id)) return; const e = take(li, b, sameVendor); if(e){ e.used = true; map.set(li.id, e.m); } }));
    byMd[mdPropId] = map;
    return map;
  }
  // vendor bill lines for one MagicDoor property in one month; company bills and fee/owner accounts left out
  function mdBillLines(md, mdPropId, month){
    const out = [], paid = mdBillMonths(md, mdPropId);
    (md.bills || []).forEach(b => { if(b.company || !b.date) return;
      (b.lines || []).forEach(li => { if(li.propertyId !== mdPropId || !mdIsRepairLine(li, b)) return;
        const m = (paid && paid.get(li.id)) || b.date.slice(0, 7); if(m !== month) return;
        out.push({id:li.id, billId:b.id, date:b.date, vendor:b.vendor, memo:mdLineMemo(li, b), amount:li.amount, account:li.account, owed:b.owed, paidIn:paid && paid.get(li.id) || null}); }); });
    return out;
  }
  // which month an owner payout is for. PHD pays the owner mid-month for that month; a payout in the first days of a
  // month is for the month before. MagicDoor's statement settles it when it has the payout.
  function mdPayoutMonth(date){ return +date.slice(8, 10) <= 5 ? monthAdd(date.slice(0, 7), -1) : date.slice(0, 7); }
  function mdDistMonth(md, mdPropId, date, amount){
    const st = md && md.stmts && md.stmts[mdPropId];
    if(st) for(const m of Object.keys(st)){
      const x = st[m]; if(!(x.dists || []).some(d => d.d === date && cents(d.a) === cents(amount))) continue;
      // last month's money still held when this month began is paid out first
      return x.left > 0 && cents(amount) <= cents(x.left) + 1 ? monthAdd(m, -1) : m;
    }
    return mdPayoutMonth(date);
  }
  // a payout MagicDoor hasn't finished sending (pending, processing, failed, cancelled) isn't paid
  const mdDistOpen = st => /pend|process|schedul|queue|draft|await|hold|approv|partly/.test(String(st || "")), mdDistDead = st => /cancel|void|fail|reject|return|revers|delet/.test(String(st || ""));
  function mdDistributions(md, mdPropId, month, all){
    const out = [];
    (md.distributions || []).forEach(x => (x.lines || []).forEach(li => { if(li.propertyId !== mdPropId || !x.date) return;
      const pending = mdDistOpen(x.status), dead = mdDistDead(x.status);
      if(!all && (pending || dead)) return;
      const m = mdDistMonth(md, mdPropId, x.date, li.amount); if(month && m !== month) return;
      out.push({id:x.id, date:x.date, amount:li.amount, ownerId:x.ownerId, month:m, status:x.status || "", pending, dead}); }));
    return out;
  }
  /* One month of a MagicDoor owner statement, in the console's terms (all in dollars):
       recv     rent the owner received for the month (paid early last month + paid this month)
       pmFee / leasing   MagicDoor's management fees, the PM fee being the one that matches the property's rate
       bills / admin     repairs paid and PHD's admin fee on them        other   anything else (signed)
       net      what the owner is owed for the month: MagicDoor's own number                           */
  function mdStmtMonth(st, prop){
    if(!st || st.pre == null) return null;
    const rule = (prop && prop.feeRule) || {type:"pct", rate:10}, rate = Number(rule.rate || 0);
    const fees = (st.fees || []).map(cents).filter(c => c);
    const base = cents(st.pre + st.rentIn);
    // money that came in after last month's payout (last month was paid out, and it ended with a balance) is this
    // month's: the part MagicDoor charged the PM fee on is rent, the rest other income (a pet fee, say)
    // money MagicDoor held over from last month without taking its PM fee on it (it came in after that month's payout)
    const unfeed = st.prevIn != null && rate > 0 && rule.type !== "flat" ? Math.max(0, cents(st.prevIn) - Math.round(cents(st.prevFees || 0) * 100 / rate)) : 0;
    const late = st.left > 0 && unfeed > 100 ? Math.min(cents(st.left), unfeed) : 0;
    // management fees: a fee above the PM fee the rate gives is a leasing fee; the rest (it can come in pieces) is the PM fee
    const feeFor = r => rule.type === "flat" ? cents(rule.amount) : Math.round(r * rate / 100);
    const wantBase = feeFor(base), isLease = c => wantBase > 0 ? c > wantBase * 1.2 + 100 : fees.length > 1 && c === Math.max(...fees);
    const best = {pm:fees.filter(c => !isLease(c)), recvC:base};
    const pmC = best.pm.reduce((a, c) => a + c, 0), leaseC = fees.reduce((a, c) => a + c, 0) - pmC;
    // the rent part of late money: what the PM fee was worked out on, above this month's own rent
    let rentC = best.recvC, lateOtherC = 0;
    if(late && rate > 0 && rule.type !== "flat"){
      const feeBase = Math.round(pmC * 100 / rate), extra = Math.max(0, Math.min(late, feeBase - base));
      rentC = base + extra; lateOtherC = late - extra;
    } else if(late && best.recvC === base) lateOtherC = 0;
    const billsC = (st.bills || []).reduce((a, x) => a + cents(x.a), 0), adminC = (st.admin || []).reduce((a, x) => a + cents(x.a), 0);
    const otherC = (st.other || []).reduce((a, x) => a + cents(x.a), 0);
    const netC = rentC + lateOtherC - pmC - leaseC - billsC - adminC + otherC;
    return {recv:rentC / 100, lateOther:lateOtherC / 100, pmFee:pmC / 100, leasing:leaseC / 100, bills:billsC / 100, admin:adminC / 100, other:otherC / 100, otherLines:st.other || [], net:netC / 100, unpaid:st.unpaid || 0};
  }


  /* MagicDoor bills don't say which unit they're for. When several console properties share one MagicDoor property
     (1635 Memminger #A and #B), each bill there waits for someone to pick the unit; the pick is kept in mdLinks.billUnit. */
  function mdUnitPending(md, mdx, links, rows, months, ok){
    if(!md || !mdx) return [];
    const pick = (links && links.billUnit) || {}, on = new Set();
    Object.values(rows || {}).forEach(r => { if(!r.deleted) (r.repairItems || []).forEach(i => { if(i.mdLine) on.add(String(i.mdLine)); }); });
    const units = {};
    Object.entries(mdx.byProp).forEach(([pid, x]) => { if(x.property && mdx.linkedPerMdProp[x.property.id] > 1 && (!ok || ok.has(pid))) (units[x.property.id] = units[x.property.id] || []).push(pid); });
    const out = [];
    Object.entries(units).forEach(([mpId, pids]) => months.forEach(m => mdBillLines(md, mpId, m).forEach(li => {
      if(pick[li.id] || on.has(String(li.id)) || /admin\s*fee/i.test(String(li.memo || "") + " " + String(li.account || ""))) return;
      out.push(Object.assign({mdPropId:mpId, month:m, units:pids}, li));
    })));
    return out;
  }
  function mdRenewal(md, leaseId){ return (md.renewals || []).find(r => r.leaseId === leaseId && !r.finalized && /offered|signing|draft|pending/i.test(r.status || "")) || null; }
  function mdFee(md, mdPropId, month){ const f = (md.fees || []).find(x => x.propertyId === mdPropId && x.month === month); return f ? f.amount : null; }

  function alerts(o){
    const pm = o.pm || {}, props = (pm.properties || []).filter(p => !p.deleted), rows = pm.rows || {}, meta = pm.meta || {}, deps = pm.deposits || {};
    const S = Object.assign({}, DEFAULTS, o.settings || {});
    const today = o.today, curM = today.slice(0, 7), prevM = monthAdd(curM, -1), day = +today.slice(8, 10), tn = dayNum(today);
    const state = o.state || {}, owners = o.owners || [];
    const out = [];
    const add = a => { const st = state[a.key]; if(st && (st.state === "dismissed" || (st.state === "snoozed" && st.until > today))) return; out.push(a); };
    const live = props.filter(p => p.status !== "inactive");
    const skip = new Set(props.filter(p => p.skipClose).map(p => p.id));
    const monthRows = m => Object.values(rows).filter(r => r.month === m && !r.deleted && !r.detailOnly && !skip.has(r.propertyId));
    const ownerName = id => { const w = owners.find(x => x.id === id); return w ? (w.name || w.company || "") : ""; };
    const md = o.md && Array.isArray(o.md.units) ? o.md : null;
    const mdx = md ? mdIndex(md, props, o.mdLinks) : null;
    const mdOf = pid => mdx && mdx.byProp[pid];

    // month housekeeping
    if(live.length && day > S.startByDay && !monthRows(curM).length)
      add({key:`start|${curM}`, type:"start", level:"warn", title:`${monthLabel(curM)} hasn't been started`, detail:"Rent due, recurring charges and carried balances are filled in when it starts.", month:curM, action:"startMonth"});
    if(monthRows(prevM).length && !(meta[prevM] || {}).closed && day > S.closeByDay)
      add({key:`close|${prevM}`, type:"close", level:"warn", title:`${monthLabel(prevM)} is still open`, detail:`Months should be closed by the ${S.closeByDay}th of the next month.`, month:prevM, action:"openMonth"});

    // rent, payouts, owners owing — open months only
    [prevM, curM].forEach(m => {
      if((meta[m] || {}).closed) return;
      const payDue = isoOf(dayNum(endOfMonth(m)) + Number(S.payoutDays || 0));
      monthRows(m).forEach(r => {
        const p = props.find(x => x.id === r.propertyId); if(!p || p.status === "inactive") return;
        const c = calc(r, p, today);
        const late = (m < curM || day > S.lateAfterDay) && !(mdOf(p.id) && mdOf(p.id).lease);   // MagicDoor's balance decides instead
        const own = ownerName(p.ownerId);
        if(c.dueC > 0 && !c.recv && late){
          const days = tn - dayNum(m + "-01");
          add({key:`late|${p.id}|${m}`, type:"late", level:"urgent", propId:p.id, month:m, title:`Rent late · ${p.name}`,
               detail:`${usd(c.dueC)} due ${shortDate(m + "-01")} — nothing recorded (${days} day${days === 1 ? "" : "s"})${p.tenants ? " · " + p.tenants : ""}`, action:"openRow"});
        } else if(c.dueC > 0 && c.recv > 0 && c.recv < c.dueC && late && !r.shortOk){
          add({key:`short|${p.id}|${m}`, type:"short", level:"warn", propId:p.id, month:m, title:`Rent short · ${p.name}`,
               detail:`${usd(c.recv)} of ${usd(c.dueC)} received — ${usd(c.dueC - c.recv)} outstanding`, action:"openRow"});
        }
        if(c.recv > 0 && !r.paidOut && today > payDue && c.payoutC > 0)
          add({key:`payout|${p.id}|${m}`, type:"payout", level:"warn", propId:p.id, month:m, title:`Owner payout not marked paid · ${p.name}`,
               detail:`${usd(c.payoutC)} to ${own || "the owner"} for ${monthLabel(m)} was due by ${shortDate(payDue)}`, action:"markPaid"});
        if(c.payoutC < 0 && !(c.dueC > 0 && !c.recv && m >= curM))
          add({key:`owes|${p.id}|${m}`, type:"owes", level:"warn", propId:p.id, month:m, title:`Owner owes ${usd(-c.payoutC)} · ${p.name}`,
               detail:`Repairs and fees exceeded rent in ${monthLabel(m)}. It carries into next month automatically, or bill ${own || "the owner"} directly.`, action:"openRow"});
        c.flags.filter(f => f.level === "warn" && /Recorded payout/.test(f.text)).forEach(f =>
          add({key:`mismatch|${p.id}|${m}`, type:"mismatch", level:"info", propId:p.id, month:m, title:`Payout doesn't match the formula · ${p.name}`, detail:f.text, action:"openRow"}));
        c.flags.filter(f => f.level === "warn" && /^Doesn't match MagicDoor/.test(f.text)).forEach(f =>
          add({key:`mdstmt|${p.id}|${m}|${Math.round(c.calcC)}`, type:"mismatch", level:"warn", propId:p.id, month:m, title:`Doesn't match MagicDoor · ${p.name}`, detail:f.text.replace(/^Doesn't match MagicDoor's owner statement: /, "") + ` — ${monthLabel(m)}.`, action:"openRow"}));
      });
    });

    // leases, vacancy, setup gaps
    const noOwner = [];
    live.forEach(p => {
      const mdRen = mdx && mdOf(p.id) && mdOf(p.id).lease && !mdOf(p.id).lease.combined ? mdRenewal(md, mdOf(p.id).lease.id) : null;
      if(mdRen) add({key:`mdren|${p.id}|${mdRen.id}|${mdRen.status}`, type:"lease", level:"info", propId:p.id, title:`Renewal ${/sign/i.test(mdRen.status) ? "out for signing" : "offered"} · ${p.name}`,
                     detail:`In MagicDoor${mdRen.newEnd ? " · new end date " + shortDate(mdRen.newEnd) + " '" + mdRen.newEnd.slice(2, 4) : ""}${mdRen.newRent ? " · new rent " + usd(cents(mdRen.newRent)) : ""}.`, action:"openProp"});
      else if(p.status === "active" && p.leaseEnd && !p.monthToMonth){
        const left = dayNum(p.leaseEnd) - tn;
        if(left < 0 && left > -400) add({key:`expired|${p.id}|${p.leaseEnd}`, type:"lease", level:"warn", propId:p.id, title:`Lease ended ${shortDate(p.leaseEnd)} · ${p.name}`, detail:"Renew, confirm month-to-month, or record the move-out.", action:"openProp"});
        else if(left >= 0 && left <= S.renewalDays) add({key:`renew|${p.id}|${p.leaseEnd}`, type:"lease", level:left <= 30 ? "warn" : "info", propId:p.id, title:`Lease ends in ${left} day${left === 1 ? "" : "s"} · ${p.name}`, detail:`Ends ${shortDate(p.leaseEnd)}${p.tenants ? " · " + p.tenants : ""} — start the renewal conversation.`, action:"openProp"});
      }
      if((p.status === "marketing" || p.status === "vacant") && p.statusSince){
        const d = tn - dayNum(p.statusSince);
        if(d > S.vacancyDays) add({key:`vacant|${p.id}|${p.statusSince}`, type:"vacant", level:"info", propId:p.id, title:`Vacant ${d} days · ${p.name}`, detail:`${p.status === "marketing" ? "Marketing" : "Vacant"} since ${shortDate(p.statusSince)}${p.rent ? " · " + usd0(cents(p.rent)) + "/mo of rent" : ""}`, action:"openProp"});
      }
      if(p.status === "active" && !p.ownerId) noOwner.push(p);
      if(p.feeRule && p.feeRule.check) add({key:`fee|${p.id}`, type:"setup", level:"info", propId:p.id, title:`Confirm the PM fee · ${p.name}`, detail:`${feeRuleText(p.feeRule)} was worked out from the workbook.`, action:"openProp"});
    });

    // one line for missing owners, not one per property
    if(noOwner.length === 1) add({key:`owner|${noOwner[0].id}`, type:"setup", level:"info", propId:noOwner[0].id, title:`No owner on file · ${noOwner[0].name}`, detail:"Statements and the owner page need one.", action:"openProp"});
    else if(noOwner.length > 1) add({key:`owners|missing`, type:"setup", level:"info", title:`${noOwner.length} properties have no owner on file`,
      detail:noOwner.slice(0, 4).map(p => p.name).join(", ") + (noOwner.length > 4 ? ` and ${noOwner.length - 4} more` : "") + " — owner statements need one.", action:"openProps"});

    // deposits after move-out
    Object.entries(deps).forEach(([pid, d]) => {
      const f = d && d.former; if(!f || !f.names || !f.moveOut || String(f.returned || "").trim()) return;
      const p = props.find(x => x.id === pid); if(!p) return;
      const due = isoOf(dayNum(f.moveOut) + S.depositDays), left = dayNum(due) - tn;
      if(left <= 10) add({key:`deposit|${pid}|${f.moveOut}`, type:"deposit", level:left < 0 ? "urgent" : "warn", propId:pid,
        title:left < 0 ? `Deposit return overdue · ${p.name}` : `Deposit return due in ${left} day${left === 1 ? "" : "s"} · ${p.name}`,
        detail:`${f.names}${f.amount ? " · " + usd(cents(f.amount)) : ""} — moved out ${shortDate(f.moveOut)}; itemized return due ${shortDate(due)}.`, action:"openDeposit"});
    });

    // MagicDoor: live balances, evictions, deposits after move-out, fees, links
    if(mdx){
      const synced = md.syncedAt ? String(md.syncedAt).slice(0, 10) : "";
      if(synced && tn - dayNum(synced) >= 2) add({key:`mdstale|${synced}`, type:"setup", level:"warn", title:`MagicDoor hasn't synced since ${shortDate(synced)}`, detail:"Rent balances may be out of date. Open MagicDoor and click Sync now; if it fails, the message says why.", action:"openMd"});
      live.forEach(p => {
        const x = mdOf(p.id); if(!x) return;
        const L = x.lease, who = L && !L.combined && L.tenants && L.tenants.length ? " · " + L.tenants.filter(t => !t.movedOut).map(t => t.name).join(" / ") : "";
        if(L && (L.balance || 0) > 0 && (L.pastDueDays || 0) > 0 && (day > S.lateAfterDay || (L.pastDueDays || 0) > S.lateAfterDay)){
          add({key:`mdlate|${p.id}|${L.unpaidSince || curM}`, type:"late", level:"urgent", propId:p.id, month:curM, title:`Rent past due · ${p.name}`,
               detail:`${usd(cents(L.balance))} owed${L.combined ? ` across ${L.owingCount} of ${L.count} units` : ""} · ${L.pastDueDays} day${L.pastDueDays === 1 ? "" : "s"} past due${L.unpaidSince ? " (since " + shortDate(L.unpaidSince) + ")" : ""}${L.lastPayment ? " · last payment " + shortDate(L.lastPayment) : ""}${who} — from MagicDoor`, action:"openProp"});
        }
        if(L && L.eviction) add({key:`evict|${p.id}|${L.id}`, type:"late", level:"warn", propId:p.id, title:`Eviction in progress · ${p.name}`, detail:`Marked as an eviction in MagicDoor${L.balance > 0 ? " · " + usd(cents(L.balance)) + " owed" : ""}.`, action:"openProp"});
        const E = x.endedLease;
        if(!L && E && E.end && (E.depositPaid || 0) > 0){
          const due = isoOf(dayNum(E.end) + S.depositDays), left = dayNum(due) - tn;
          if(left <= 10 && left >= -15) add({key:`mddep|${p.id}|${E.id}`, type:"deposit", level:left < 0 ? "urgent" : "warn", propId:p.id,
            title:left < 0 ? `Deposit return may be overdue · ${p.name}` : `Deposit return due in ${left} day${left === 1 ? "" : "s"} · ${p.name}`,
            detail:`${usd(cents(E.depositPaid))} held · lease ended ${shortDate(E.end)}; itemized return due ${shortDate(due)}. Dismiss once it's sent.`, action:"openDeposit"});
        }
        // management fee: compare last month with MagicDoor (only when one console property maps to that MagicDoor property)
        if(x.property && mdx.linkedPerMdProp[x.property.id] === 1){
          const r = monthRows(prevM).find(r => r.propertyId === p.id), mf = mdFee(md, x.property.id, prevM);
          if(r && mf != null){
            const c = calc(r, p, today);
            if(c.pmFeeC > 0 && Math.abs(cents(mf) - c.pmFeeC) > 100)
              add({key:`mdfee|${p.id}|${prevM}`, type:"mismatch", level:"info", propId:p.id, month:prevM, title:`PM fee differs from MagicDoor · ${p.name}`,
                   detail:`${monthLabel(prevM)}: console ${usd(c.pmFeeC)} · MagicDoor ${usd(cents(mf))}.`, action:"openRow"});
          }
        }
      });
      // MagicDoor bills on a property several units here share: someone picks the unit
      {
        const pend = mdUnitPending(md, mdx, o.mdLinks, rows, [prevM, curM].filter(m => !(meta[m] || {}).closed), new Set(live.filter(p => !p.skipClose).map(p => p.id)));
        const byMp = {}; pend.forEach(l => (byMp[l.mdPropId] = byMp[l.mdPropId] || []).push(l));
        Object.entries(byMp).forEach(([mpId, ls]) => {
          const mp = (md.properties || []).find(z => z.id === mpId), tot = ls.reduce((a, l) => a + cents(l.amount), 0);
          add({key:`mdunit|${mpId}|${ls.map(l => l.id).sort().join(",").slice(-60)}`, type:"mismatch", level:"warn", mdPropId:mpId,
            title:`Pick the unit for ${ls.length} MagicDoor bill${ls.length === 1 ? "" : "s"} · ${mp ? mp.name : "shared property"}`,
            detail:`${usd(tot)} — MagicDoor doesn't say which unit, so ${ls.length === 1 ? "it isn't" : "they aren't"} on any owner payout yet.`, action:"mdUnit"});
        });
      }
      // rent MagicDoor shows as paid this month that isn't in Month close yet (Fill from MagicDoor does it in one click)
      const unrec = monthRows(curM).filter(r => { const x = mdOf(r.propertyId); return x && x.lease && !has(r.rentReceived) && mdPaidThisMonth(x.lease, curM); });
      if(unrec.length) add({key:`mdrec|${curM}|${unrec.length}`, type:"setup", level:"info", month:curM, title:`${unrec.length} rent payment${unrec.length === 1 ? "" : "s"} in MagicDoor not recorded yet`, detail:`Paid in full in MagicDoor for ${monthLabel(curM)}. Fill from MagicDoor in Month close records them.`, action:"openMonth"});
      const um = mdx.unmatchedUnits.length;
      if(um) add({key:`mdunits|${um}`, type:"setup", level:"info", title:`${um} MagicDoor unit${um === 1 ? "" : "s"} not linked to a property here`, detail:"Link them, or mark properties that aren't in MagicDoor, on the MagicDoor page.", action:"openMd"});
    }

    // receipts waiting
    const waiting = (o.inbox || []).filter(x => x.status === "pending" && x.received_at && tn - dayNum(String(x.received_at).slice(0, 10)) >= S.inboxStaleDays);
    if(waiting.length) add({key:`inbox|${today}`, type:"inbox", level:"info", title:`${waiting.length} receipt${waiting.length === 1 ? "" : "s"} waiting over ${S.inboxStaleDays} days`, detail:"Approve or dismiss them in the Receipt inbox.", action:"openInbox"});

    const rank = {urgent:0, warn:1, info:2};
    return out.sort((a, b) => rank[a.level] - rank[b.level] || String(a.month || "").localeCompare(String(b.month || "")) || a.title.localeCompare(b.title));
  }

  return {mdUnitPending, normAddr, mdIndex, mdCombine, mdIsRepairLine, mdLineMemo, mdBillLines, mdBillMonths, mdPayoutMonth, mdDistMonth, mdDistributions, mdStmt, mdStmtMonth, mdRenewal, mdFee, mdPaidThisMonth, cents, has, nz, usd, usd0, calc, alerts, rentStatus, itemFee, feeRuleText, monthLabel, monthAdd, endOfMonth, dayNum, isoOf, shortDate, DEFAULTS, EXTRA};
})();
export { PMCore };
