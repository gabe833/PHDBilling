/* =====================================================================
   BANK RECONCILIATION CENTER
   ---------------------------------------------------------------------
   Two views of the same money, kept apart on purpose:
     · Cash activity  — what actually moved through a bank account, from
       the bank's own export (Nickel's "Balance transactions" CSV, or any
       bank CSV with Date / Description / Amount / Balance).
     · Rent allocation — which rental period each tenant payment was
       applied to, from MagicDoor's payment-to-charge links (L.alloc).
   Nothing here moves money or changes a month's figures. Bank lines are
   stored once (keyed by the bank's transaction ID, so importing the same
   file twice adds nothing), matched to what the console already knows
   (owner payouts by their OWN- reference, MagicDoor's funding debits,
   vendor bills, transfers), and anything left over is an exception that
   needs a person's explanation before the month can be finalized.
   Stored in the shared doc "bank" (S.bank).
   ===================================================================== */
(function(){
if(typeof app === "undefined" && typeof render !== "function") return;

const BR_ACCTS = [
  {key:"nk-6588", name:"Nickel PM Rental Income", last4:"6588", kind:"rental", nickel:/rental income/i},
  {key:"nk-2680", name:"Nickel PM Operating", last4:"2680", kind:"operating", nickel:/pm operating/i},
  {key:"nk-6759", name:"Nickel Real Estate Operating", last4:"6759", kind:"operating", nickel:/real estate operating/i},
  {key:"fcb-4096", name:"First Citizens Rental Income", last4:"4096", kind:"rental"},
  {key:"fcb-4091", name:"First Citizens Rental Operating", last4:"4091", kind:"operating"},
  {key:"fcb-8191", name:"First Citizens Security Deposits", last4:"8191", kind:"deposits"}
];
const BR_CATS = {
  md_deposit:["MagicDoor rent deposit", "in"], owner_payout:["Owner payout", "out"], owner_return:["Owner payout returned / cancelled", "in"],
  md_funding:["MagicDoor funding debit (payouts MagicDoor sent)", "out"], vendor:["Vendor / bill payment", "out"], vendor_return:["Bill payment returned / cancelled", "in"],
  transfer_out:["Transfer to another account", "xfer"], transfer_in:["Transfer from another account", "xfer"], interest:["Interest", "in"],
  owner_in:["Money from an owner", "in"], payroll:["Staff pay", "out"], fee:["Bank fee", "out"], other_in:["Other money in", "in"], other_out:["Other money out", "out"]
};
const BR = () => { S.bank = S.bank && typeof S.bank === "object" ? S.bank : {v:1, accts:{}, notes:{}, cats:{}, links:{}, recs:{}}; ["accts","notes","cats","links","recs"].forEach(k => S.bank[k] = S.bank[k] || {}); return S.bank; };
const brAcct = k => BR_ACCTS.find(a => a.key === k) || BR_ACCTS[0];
const brTx = k => Object.values(((BR().accts[k] || {}).txns) || {}).sort((a, b) => String(a.posted || a.date).localeCompare(String(b.posted || b.date)) || (a.seq || 0) - (b.seq || 0));
const brMonthTx = (k, m) => brTx(k).filter(t => String(t.date).slice(0, 7) === m);
const brNoteKey = (k, id) => k + "|" + id;
const C = n => Math.round(Number(String(n == null ? "" : n).replace(/[$,\s]/g, "")) * 100) || 0;

/* ---------- CSV import ---------- */
function brCsv(text){
  const rows = []; let row = [], f = "", q = false;
  text = String(text || "").replace(/^﻿/, "");
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(q){ if(ch === '"'){ if(text[i + 1] === '"'){ f += '"'; i++; } else q = false; } else f += ch; }
    else if(ch === '"') q = true;
    else if(ch === ","){ row.push(f); f = ""; }
    else if(ch === "\n" || ch === "\r"){ if(ch === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if(row.some(x => x !== "")) rows.push(row); row = []; }
    else f += ch;
  }
  row.push(f); if(row.some(x => x !== "")) rows.push(row);
  return rows;
}
function brHash(s){ let h = 2166136261; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function brParse(text){
  const rows = brCsv(text); if(rows.length < 2) throw new Error("The file has no transactions");
  const H = rows[0].map(h => h.trim().toLowerCase()), col = (...names) => { for(const n of names){ const i = H.indexOf(n); if(i >= 0) return i; } return -1; };
  const iD = col("date", "transaction date", "posting date", "posted date"), iP = col("posted at", "settlement date"), iDesc = col("description", "memo", "details"),
    iRef = col("reference", "ref", "check number"), iCp = col("counterparty", "payee", "name"), iA = col("amount"), iDr = col("debit", "withdrawal", "withdrawals"),
    iCr = col("credit", "deposit", "deposits"), iBal = col("balance", "running balance"), iT = col("type", "transaction type"), iId = col("transaction id", "id", "fitid");
  if(iD < 0 || (iA < 0 && iDr < 0 && iCr < 0)) throw new Error("Couldn't find the Date and Amount columns — export the bank's CSV with those headers");
  const iso = d => { const s = String(d || "").trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; return ""; };
  const out = [];
  rows.slice(1).forEach((r, n) => {
    const date = iso(r[iD]); if(!date) return;
    let amtC = iA >= 0 ? C(r[iA]) : C(r[iCr]) - Math.abs(C(r[iDr]));
    const t = {date, posted:iP >= 0 ? String(r[iP] || "").trim() : "", desc:String(r[iDesc] || "").trim(), ref:iRef >= 0 ? String(r[iRef] || "").trim() : "",
      cp:iCp >= 0 ? String(r[iCp] || "").trim() : "", amtC, balC:iBal >= 0 && String(r[iBal]).trim() !== "" ? C(r[iBal]) : null, type:iT >= 0 ? String(r[iT] || "").trim() : "", seq:n};
    t.id = iId >= 0 && String(r[iId] || "").trim() ? String(r[iId]).trim() : "h_" + brHash([t.date, t.posted, t.desc, t.ref, t.amtC, t.balC].join("|"));
    out.push(t);
  });
  if(!out.length) throw new Error("No dated transactions in the file");
  return out;
}
function brImport(k, text, fileName){
  const list = brParse(text), B = BR(), A = B.accts[k] = B.accts[k] || {txns:{}, files:[]};
  let added = 0, same = 0;
  snapshot();
  list.forEach(t => { if(A.txns[t.id]) same++; else { A.txns[t.id] = Object.assign(t, {at:new Date().toISOString()}); added++; } });
  const ds = list.map(t => t.date).sort();
  A.files = (A.files || []).concat([{name:String(fileName || "CSV").slice(0, 120), at:new Date().toISOString(), by:(typeof billWho === "function" ? billWho() : ""), rows:list.length, added, from:ds[0], to:ds[ds.length - 1]}]).slice(-40);
  commit();
  actLog("finance", `Bank reconciliation · ${brAcct(k).name}: imported ${fileName || "a CSV"} — ${added} new transaction${added === 1 ? "" : "s"}${same ? `, ${same} already here` : ""} (${fdateS(ds[0])} – ${fdateS(ds[ds.length - 1])})`, {side:"pm"});
  return {added, same, from:ds[0], to:ds[ds.length - 1]};
}

/* ---------- what each bank line is ---------- */
function brCat(k, t){
  const o = BR().cats[brNoteKey(k, t.id)]; if(o) return o.cat;
  const d = (t.desc + " " + t.cp + " " + t.type).toLowerCase(), ref = String(t.ref || "").toUpperCase(), back = /cancel|return|revers/i.test(t.desc + " " + t.type);
  if(/payabli/.test(d) && t.amtC > 0) return "md_deposit";
  if(/^OWN-/.test(ref) || /\bOWN-[A-Z0-9]/i.test(t.desc)) return t.amtC < 0 ? "owner_payout" : "owner_return";
  if(/funding/.test(d) && t.amtC < 0) return "md_funding";
  if(/interest/.test(d)) return "interest";
  if(/transfer to|transfer out/.test(d)) return "transfer_out";
  if(/transfer from|transfer in/.test(d)) return "transfer_in";
  if(/^PAY-\d{8}-/.test(ref)) return "payroll";
  if(/bill payment/.test(d)) return t.amtC < 0 ? "vendor" : back ? "vendor_return" : "other_in";
  if(/\bfee\b/.test(d) && t.amtC < 0 && Math.abs(t.amtC) < 10000) return "fee";
  if(t.amtC > 0 && pmState().properties.some(p => p.ownerId && t.cp && ownerLabel(ownerById(p.ownerId)).toLowerCase().includes(String(t.cp).toLowerCase().split(" ")[0]))) return "owner_in";
  return t.amtC < 0 ? "other_out" : "other_in";
}
/* Match each line to the console's own records. Returns {st, why, recs:[{label, open}], warn}
   st: matched (source evidence) · reversed (paid and cancelled in the same account) · classified (its kind explains it) ·
       explained (a person noted why) · review (a likely match a person should confirm) · unmatched */
function brMatchAll(k, txs){
  const res = new Map(), note = id => BR().notes[brNoteKey(k, id)];
  const refIx = typeof finRefIndex === "function" ? finRefIndex() : new Map();
  // owner payouts: by reference; a payment and its own cancellation (same reference, opposite amount) cancel out
  const byRef = new Map();
  txs.forEach(t => { const c = brCat(k, t); if(c !== "owner_payout" && c !== "owner_return" && c !== "vendor" && c !== "vendor_return") return; const r = String(t.ref || "").toUpperCase(); if(!r) return; (byRef.get(r) || byRef.set(r, []).get(r)).push(t); });
  const all = brTx(k);
  byRef.forEach((list, ref) => {
    const every = all.filter(t => String(t.ref || "").toUpperCase() === ref);          // the whole history, not just this month
    every.filter(t => t.amtC > 0).forEach(ret => { const pay = every.find(p => p.amtC === -ret.amtC && !res.has(p.id + "#pair") && String(p.date) <= String(ret.date));
      if(pay){ res.set(pay.id + "#pair", ret.id); res.set(ret.id, {st:"reversed", why:`Cancelled — returns the ${usd(-pay.amtC)} payment of ${fdateS(pay.date)} (same reference ${ref})`, pair:pay.id}); res.set(pay.id, {st:"reversed", why:`Cancelled on ${fdateS(ret.date)} — the money came back (same reference ${ref})`, pair:ret.id}); } });
  });
  txs.forEach(t => {
    if(res.has(t.id)) return;
    const c = brCat(k, t), ref = String(t.ref || "").toUpperCase(), n = note(t.id);
    let out = null;
    if(c === "owner_payout"){
      const rows = refIx.get(ref) || [], o = typeof finOwnRef === "function" ? finOwnRef(ref) : null;
      if(rows.length){
        const recC = rows.reduce((a, r) => a + cents(r.paidOut.amount || 0), 0), grp = rows[0].paidOut.group;
        const recs = rows.map(r => ({label:`${(pmProp(r.propertyId) || {}).name || "?"} · ${monthLabel(r.month)}`, pid:r.propertyId, m:r.month}));
        const amtOk = grp ? true : Math.abs(recC + t.amtC) <= 1;
        // the same reference paid twice in the bank (neither cancelled) is a duplicate
        const live = all.filter(x => String(x.ref || "").toUpperCase() === ref && x.amtC < 0 && !(res.get(x.id) || {}).pair);
        out = live.length > 1 ? {st:"review", why:`Paid ${live.length} times under ${ref} — check it isn't a duplicate payout`, recs, dup:true}
          : amtOk ? {st:"matched", why:`Owner payout recorded in the console (${ref})${grp ? " — one of a group payout" : ""}`, recs}
          : {st:"review", why:`The console recorded ${usd(recC)} under ${ref}; the bank shows ${usd(-t.amtC)}`, recs, amt:true};
      } else if(o && o.props.length){
        out = {st:"review", why:`Looks like ${o.props.map(p => p.name).join(" / ")} · ${monthLabel(o.month)}, but no payout is recorded under ${ref} in the console`, recs:o.props.map(p => ({label:`${p.name} · ${monthLabel(o.month)}`, pid:p.id, m:o.month}))};
      } else out = {st:"unmatched", why:`No owner payout in the console has the reference ${ref || "on this line"}`};
    }
    else if(c === "md_funding"){
      // MagicDoor pulls the money for the payouts it sends itself: the sum of the console's "paid by MagicDoor" payouts that week
      const d0 = new Date(t.date + "T12:00:00"), rows = Object.values(pmState().rows).filter(r => r.paidOut && /magic/i.test(String(r.paidOut.by) + " " + String(r.paidOut.method)) && r.paidOut.date && Math.abs(new Date(r.paidOut.date + "T12:00:00") - d0) <= 10 * 864e5);
      const sumC = rows.reduce((a, r) => a + cents(r.paidOut.amount || 0), 0);
      out = rows.length && Math.abs(sumC + t.amtC) <= 1 ? {st:"matched", why:`Pays for the ${rows.length} owner payouts MagicDoor sent itself (${fdateS(rows[0].paidOut.date)}) — ${usd(sumC)} to the cent`, recs:rows.map(r => ({label:`${(pmProp(r.propertyId) || {}).name} · ${monthLabel(r.month)} ${usd(cents(r.paidOut.amount))}`, pid:r.propertyId, m:r.month}))}
        : {st:"review", why:rows.length ? `MagicDoor-paid payouts that week add up to ${usd(sumC)}, not ${usd(-t.amtC)}` : "No owner payouts recorded as paid by MagicDoor within 10 days"};
    }
    else if(c === "vendor" || c === "vendor_return"){
      const no = (String(t.ref || "").match(/\d{2,}/) || [])[0], amt = Math.abs(t.amtC);
      const bills = billList().filter(b => b.status !== "void" && Math.abs(cents(b.amount) - amt) <= 1 && ((no && String(b.billNo || "").replace(/\D/g, "") === no) || (t.cp && vendorKey(b.vendor) === vendorKey(t.cp))));
      out = bills.length === 1 ? {st:"matched", why:`Bill ${bills[0].billNo || ""} — ${bills[0].vendor} ${usd(cents(bills[0].amount))}`, recs:[{label:`${bills[0].vendor} · ${usd(cents(bills[0].amount))}`, bill:bills[0].id}]}
        : bills.length ? {st:"review", why:`${bills.length} bills could be this one`, recs:bills.map(b => ({label:`${b.vendor} · ${fdateS(b.date)}`, bill:b.id}))}
        : {st:"unmatched", why:"No bill in the console for this payment"};
    }
    else if(c === "md_deposit") out = {st:"classified", why:"Rent MagicDoor collected and deposited — see Rent allocation for which months it pays"};
    else if(c === "interest") out = {st:"classified", why:"Interest the bank paid"};
    else if(c === "transfer_out" || c === "transfer_in") out = {st:n && n.note ? "explained" : "classified", why:t.ref ? `Transfer: ${t.ref}` : "Transfer between accounts"};
    else if(c === "payroll") out = {st:"classified", why:"Staff pay run"};
    else out = {st:"unmatched", why:c === "owner_in" ? "Money from an owner — say what it's for" : "Nothing in the console explains this line yet"};
    if(n && n.note && (out.st === "unmatched" || out.st === "review")) out = Object.assign({}, out, {st:"explained", why:n.note, was:out.why});
    res.set(t.id, out);
  });
  return res;
}

/* ---------- the month's figures ---------- */
function brMonth(k, m){
  const all = brTx(k), txs = all.filter(t => String(t.date).slice(0, 7) === m), M = brMatchAll(k, txs);
  // opening: the balance just before the month's first line (bank's own running balance)
  const before = all.filter(t => String(t.date).slice(0, 7) < m), first = txs[0], last = txs[txs.length - 1];
  const openC = first && first.balC != null ? first.balC - first.amtC : before.length && before[before.length - 1].balC != null ? before[before.length - 1].balC : null;
  const closeC = last && last.balC != null ? last.balC : openC;
  let inC = 0, outC = 0, xferC = 0;
  txs.forEach(t => { const c = brCat(k, t), dir = (BR_CATS[c] || [])[1]; if(dir === "xfer") xferC += t.amtC; else if(t.amtC > 0) inC += t.amtC; else outC += t.amtC; });
  const netC = txs.reduce((a, t) => a + t.amtC, 0);
  // the bank's own arithmetic: opening + every line = closing; if not, lines are missing from the import
  const gapC = openC != null && closeC != null ? closeC - (openC + netC) : null;
  // owner payouts the console has as sent from this account in the month that the bank doesn't show yet
  const outstanding = [];
  if(brAcct(k).key === "nk-6588"){
    const refs = new Set(all.filter(t => t.amtC < 0).map(t => String(t.ref || "").toUpperCase()));
    Object.values(pmState().rows).forEach(r => { const po = r.paidOut; if(!po || po.by !== "Nickel" || !po.date || String(po.date).slice(0, 7) !== m) return;
      const rs = [po.ref, ...((po.group || {}).refs || [])].filter(Boolean).map(x => String(x).toUpperCase());
      rs.forEach(ref => { if(!refs.has(ref) && !outstanding.some(o => o.ref === ref)) outstanding.push({ref, row:r, amtC:po.group ? null : cents(po.amount || 0)}); }); });
  }
  const ex = txs.filter(t => { const s = (M.get(t.id) || {}).st; return s === "unmatched" || s === "review"; });
  return {k, m, txs, M, openC, closeC, inC, outC, xferC, netC, gapC, outstanding, ex, rec:BR().recs[k + "|" + m] || null};
}

/* ---------- rent allocation (MagicDoor) ---------- */
function brAlloc(m){
  const seen = new Set(), lines = [];
  pmState().properties.filter(p => !p.deleted).forEach(p => {
    const L = typeof pmMdLease === "function" ? pmMdLease(p) : null; if(!L || !Array.isArray(L.alloc) || seen.has(L.id)) return; seen.add(L.id);
    L.alloc.forEach(([d, amt, parts]) => {
      const inMonth = String(d).slice(0, 7) === m, forMonth = (parts || []).filter(x => x[0] === m);
      if(!inMonth && !forMonth.length) return;
      lines.push({p, lease:L, date:d, amtC:Math.round(Number(amt) || 0), parts:(parts || []).map(([mm, kind, c]) => ({m:mm, kind, c:Math.round(Number(c) || 0)})), inMonth});
    });
  });
  const sum = f => lines.reduce((a, l) => a + l.parts.filter(f).reduce((b, x) => b + x.c, 0), 0);
  const cashC = lines.filter(l => l.inMonth).reduce((a, l) => a + l.amtC, 0);
  const T = {
    cashC,
    cashForM:lines.filter(l => l.inMonth).reduce((a, l) => a + l.parts.filter(x => x.m === m).reduce((b, x) => b + x.c, 0), 0),
    cashEarly:lines.filter(l => l.inMonth).reduce((a, l) => a + l.parts.filter(x => x.m > m).reduce((b, x) => b + x.c, 0), 0),
    cashLate:lines.filter(l => l.inMonth).reduce((a, l) => a + l.parts.filter(x => x.m && x.m < m).reduce((b, x) => b + x.c, 0), 0),
    cashAhead:lines.filter(l => l.inMonth).reduce((a, l) => a + l.parts.filter(x => !x.m).reduce((b, x) => b + x.c, 0), 0),
    priorForM:lines.filter(l => !l.inMonth && String(l.date).slice(0, 7) < m).reduce((a, l) => a + l.parts.filter(x => x.m === m).reduce((b, x) => b + x.c, 0), 0),
    laterForM:lines.filter(l => !l.inMonth && String(l.date).slice(0, 7) > m).reduce((a, l) => a + l.parts.filter(x => x.m === m).reduce((b, x) => b + x.c, 0), 0),
    allForM:sum(x => x.m === m), rentForM:sum(x => x.m === m && x.kind === "rent")
  };
  return {lines:lines.sort((a, b) => String(a.date).localeCompare(String(b.date))), T};
}

/* ---------- the page ---------- */
const ST = {matched:["Matched","green"], reversed:["Cancelled pair","grey"], classified:["Explained by type","acc"], explained:["Noted","acc"], review:["Check","gold"], unmatched:["Unmatched","red"]};
function pgBankRec(){
  $("#pgCrumb").textContent = "Money"; $("#pgTitle").textContent = "Bank reconciliation";
  const B = BR(), ui = S.ui, k = ui.brAcct || "nk-6588", A = brAcct(k);
  const months = [...new Set(brTx(k).map(t => String(t.date).slice(0, 7)))].sort();
  const m = ui.brMonth && /^\d{4}-\d{2}$/.test(ui.brMonth) ? ui.brMonth : (months[months.length - 1] || thisMonth());
  const tab = ui.brTab || "cash";
  $("#pgSub").textContent = `${A.name} ····${A.last4} · ${monthLabel(m)} · bank lines matched to the console's records; nothing here moves money`;
  const pick = document.createElement("input"); pick.type = "file"; pick.accept = ".csv,text/csv"; pick.style.display = "none"; document.body.appendChild(pick);
  pick.onchange = () => { const f = pick.files && pick.files[0]; if(!f) return; const r = new FileReader();
    r.onload = () => { try{ const x = brImport(k, r.result, f.name); toast(`${x.added} new line${x.added === 1 ? "" : "s"}${x.same ? ` · ${x.same} already imported` : ""}`, true); if(x.to) ui.brMonth = String(x.to).slice(0, 7); render(); }catch(e){ toast(e.message); } pick.remove(); };
    r.readAsText(f); };
  actions([["Import bank CSV", () => pick.click(), "primary"]]);
  const v = $("#view");
  const D = brMonth(k, m);

  // account + month bar
  const bar = elm("div", "br-bar");
  bar.innerHTML = `<label class="br-sel"><span>Account</span><select id="brA">${BR_ACCTS.map(a => `<option value="${a.key}" ${a.key === k ? "selected" : ""}>${esc(a.name)} ····${a.last4}${(B.accts[a.key] && Object.keys(B.accts[a.key].txns || {}).length) ? "" : " (no import yet)"}</option>`).join("")}</select></label>
    <label class="br-sel"><span>Month</span><input type="month" id="brM" value="${m}"></label>
    <div class="sc-seg br-tabs">${[["cash","Cash activity"],["ex",`Exceptions${D.ex.length + D.outstanding.length ? " · " + (D.ex.length + D.outstanding.length) : ""}`],["report","Reconciliation report"],["alloc","Rent allocation"]].map(([t, l]) => `<button data-t="${t}" class="${t === tab ? "on" : ""}">${l}</button>`).join("")}</div>`;
  v.appendChild(bar);
  bar.querySelector("#brA").onchange = e => { ui.brAcct = e.target.value; ui.brMonth = ""; persistUi(); render(); };
  bar.querySelector("#brM").onchange = e => { ui.brMonth = e.target.value; persistUi(); render(); };
  bar.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { ui.brTab = b.dataset.t; persistUi(); render(); });

  const files = (B.accts[k] || {}).files || [];
  if(!D.txs.length && tab !== "alloc"){
    const c = elm("div", "card");
    c.innerHTML = `<div class="empty"><b>No bank lines for ${esc(monthLabel(m))} yet</b>
      <p>${A.key.startsWith("nk") ? `In Nickel: Banking → ${esc(A.name.replace("Nickel ", ""))} → Export → <b>Balance transactions</b> (CSV) for the month, then press <b>Import bank CSV</b>.` : "Download the account's transactions as CSV from the bank's website (Date, Description, Amount and Balance columns), then press Import bank CSV."}
      Importing the same file again adds nothing — every line is kept once by the bank's own ID.</p>
      ${files.length ? `<p class="muted">Last import: ${esc(files[files.length - 1].name)} · ${esc(fdateS(String(files[files.length - 1].at).slice(0, 10)))} · covers ${esc(fdateS(files[files.length - 1].from))} – ${esc(fdateS(files[files.length - 1].to))}</p>` : ""}</div>`;
    v.appendChild(c); return;
  }

  // summary strip
  const fin = D.rec && D.rec.status === "final";
  const sum = elm("div", "br-sum");
  const box = (l, c, sub, cls) => `<div class="br-box ${cls || ""}"><span>${l}</span><b class="num">${c == null ? "—" : (c < 0 ? "−" : "") + usd(Math.abs(c))}</b>${sub ? `<em>${sub}</em>` : ""}</div>`;
  sum.innerHTML = box("Opening balance", D.openC, "from the bank's running balance")
    + box("Money in", D.inC, `${D.txs.filter(t => t.amtC > 0 && (BR_CATS[brCat(k, t)] || [])[1] !== "xfer").length} lines`)
    + box("Money out", D.outC, `${D.txs.filter(t => t.amtC < 0 && (BR_CATS[brCat(k, t)] || [])[1] !== "xfer").length} lines`)
    + box("Transfers", D.xferC, "between PHD's accounts")
    + box("Closing balance", D.closeC, D.gapC == null ? "" : Math.abs(D.gapC) <= 1 ? "opening + lines = closing ✓" : `${usd(Math.abs(D.gapC))} the import doesn't explain`, D.gapC != null && Math.abs(D.gapC) > 1 ? "bad" : "")
    + box(fin ? "Finalized" : "Left to explain", fin ? null : D.ex.length + D.outstanding.length, fin ? `by ${esc(String(D.rec.by || "").split("@")[0])} · ${esc(fdateS(String(D.rec.at).slice(0, 10)))}` : D.ex.length + D.outstanding.length ? "see Exceptions" : "everything is explained", fin ? "ok" : D.ex.length + D.outstanding.length ? "warn" : "ok");
  // the count box shows a number, not money
  sum.lastElementChild.querySelector("b").textContent = fin ? "✓" : String(D.ex.length + D.outstanding.length);
  v.appendChild(sum);

  if(tab === "cash") brCashTab(v, D);
  else if(tab === "ex") brExTab(v, D);
  else if(tab === "report") brReportTab(v, D);
  else brAllocTab(v, m);
}
function brRecLinks(x){ return (x && x.recs || []).slice(0, 4).map(r => r.pid ? `<a href="#" data-brp="${esc(r.pid)}" data-brm="${esc(r.m || "")}">${esc(r.label)}</a>` : r.bill ? `<a href="#" data-brb="${esc(r.bill)}">${esc(r.label)}</a>` : esc(r.label)).join(" · ") + ((x && x.recs || []).length > 4 ? ` +${x.recs.length - 4} more` : ""); }
function brWire(el, D){
  el.querySelectorAll("[data-brp]").forEach(a => a.onclick = e => { e.preventDefault(); e.stopPropagation(); if(a.dataset.brm) S.ui.pmMonth = a.dataset.brm; pmOpenProperty(a.dataset.brp); });
  el.querySelectorAll("[data-brb]").forEach(a => a.onclick = e => { e.preventDefault(); e.stopPropagation(); if(typeof billSheet === "function") billSheet(a.dataset.brb); });
  el.querySelectorAll("[data-brt]").forEach(tr => tr.onclick = () => brLineSheet(D.k, tr.dataset.brt));
}
function brCashTab(v, D){
  const f = S.ui.brF || "all", q = (S.ui.brQ || "").toLowerCase();
  const F = [["all","All"],["in","Money in"],["out","Money out"],["open","To explain"],["owner","Owner payouts"]];
  const keep = t => { const c = brCat(D.k, t), s = (D.M.get(t.id) || {}).st;
    if(q && !`${t.desc} ${t.cp} ${t.ref} ${usd(Math.abs(t.amtC))}`.toLowerCase().includes(q)) return false;
    return f === "all" || (f === "in" && t.amtC > 0) || (f === "out" && t.amtC < 0) || (f === "open" && (s === "unmatched" || s === "review")) || (f === "owner" && /^owner/.test(c)); };
  const bar = elm("div", "sc-bar");
  bar.innerHTML = `<div class="sc-seg">${F.map(([x, l]) => `<button data-f="${x}" class="${x === f ? "on" : ""}">${l}</button>`).join("")}</div><div class="sc-q"><input type="text" id="brQ" placeholder="Find an amount, name or reference…" value="${esc(S.ui.brQ || "")}"></div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ui.brF = b.dataset.f; render(); });
  const qi = bar.querySelector("#brQ"); qi.oninput = () => { S.ui.brQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#brQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 200); };
  const list = D.txs.filter(keep), c = elm("div", "card br-led");
  c.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Description</th><th>What it is</th><th>Matches</th><th class="r">Amount</th><th class="r">Balance</th></tr></thead><tbody>
    ${list.map(t => { const x = D.M.get(t.id) || {}, s = ST[x.st] || ["", "grey"], cat = BR_CATS[brCat(D.k, t)] || ["Other"], n = BR().notes[brNoteKey(D.k, t.id)];
      return `<tr data-brt="${esc(t.id)}" class="br-r ${x.st}"><td class="muted nowrap">${esc(fdateS(t.date))}</td>
        <td><div class="item-t">${esc(t.cp || t.desc)}</div><div class="item-s">${esc(t.cp ? t.desc : "")}${t.ref && !String(t.desc).toUpperCase().includes(String(t.ref).toUpperCase()) ? ` · <span class="mono-s">${esc(t.ref)}</span>` : ""}</div></td>
        <td><span class="br-cat">${esc(cat[0])}</span></td>
        <td><span class="tag ${s[1]}">${s[0]}</span>${n && n.assignee && !n.done ? ` <span class="tag grey" title="Assigned">${esc(String(n.assignee).split("@")[0])}</span>` : ""}<div class="item-s">${esc(x.why || "")}${x.recs && x.recs.length ? "<br>" + brRecLinks(x) : ""}</div></td>
        <td class="r num ${t.amtC < 0 ? "neg" : "pos"}">${t.amtC < 0 ? "−" : ""}${usd(Math.abs(t.amtC))}</td><td class="r num muted">${t.balC == null ? "" : usd(t.balC)}</td></tr>`; }).join("")}
    </tbody></table></div>${!list.length ? `<div class="empty"><p>No lines match.</p></div>` : ""}`;
  v.appendChild(c); brWire(c, D);
}
function brExTab(v, D){
  const c = elm("div", "card");
  const groups = [
    ["Duplicate payouts to check", D.ex.filter(t => (D.M.get(t.id) || {}).dup)],
    ["Amounts that differ from the console", D.ex.filter(t => (D.M.get(t.id) || {}).amt)],
    ["Likely matches to confirm", D.ex.filter(t => { const x = D.M.get(t.id) || {}; return x.st === "review" && !x.dup && !x.amt; })],
    ["Bank lines nothing explains", D.ex.filter(t => (D.M.get(t.id) || {}).st === "unmatched")]
  ];
  let h = "";
  groups.forEach(([title, list]) => { if(!list.length) return;
    h += `<div class="br-exh">${esc(title)} · ${list.length}</div><div class="tbl-wrap"><table class="tbl"><tbody>${list.map(t => { const x = D.M.get(t.id) || {}, n = BR().notes[brNoteKey(D.k, t.id)];
      return `<tr data-brt="${esc(t.id)}" class="br-r"><td class="muted nowrap">${esc(fdateS(t.date))}</td><td><div class="item-t">${esc(t.cp || t.desc)}</div><div class="item-s">${esc(x.why || "")}${x.recs && x.recs.length ? "<br>" + brRecLinks(x) : ""}</div></td>
        <td>${n && n.assignee ? `<span class="tag grey">${esc(String(n.assignee).split("@")[0])}</span>` : ""}</td><td class="r num">${t.amtC < 0 ? "−" : ""}${usd(Math.abs(t.amtC))}</td><td class="act"><span class="sc-go">›</span></td></tr>`; }).join("")}</tbody></table></div>`; });
  if(D.outstanding.length){
    h += `<div class="br-exh">Owner payouts the console has as sent that the bank doesn't show · ${D.outstanding.length}</div><div class="tbl-wrap"><table class="tbl"><tbody>${D.outstanding.map(o => `<tr><td><div class="item-t">${esc((pmProp(o.row.propertyId) || {}).name || "")} · ${esc(monthLabel(o.row.month))}</div><div class="item-s mono-s">${esc(o.ref)} · recorded ${esc(fdateS(o.row.paidOut.date))}${o.row.paidOut.pending ? " · pending" : ""}</div></td>
      <td class="muted">Not in this import yet — still processing, sent from another account, or missing from the CSV</td><td class="r num">${o.amtC == null ? "group" : usd(o.amtC)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  if(D.gapC != null && Math.abs(D.gapC) > 1) h = `<div class="pm-banner">The bank's balances don't add up across this import: opening ${usd(D.openC)} plus the lines doesn't reach the closing ${usd(D.closeC)} (${usd(Math.abs(D.gapC))} apart). Some lines are missing — import the full month again.</div>` + h;
  c.innerHTML = h || `<div class="empty"><b>Nothing to explain</b><p>Every bank line in ${esc(monthLabel(D.m))} matches a record, is explained by its type, or has a note.</p></div>`;
  v.appendChild(c); brWire(c, D);
}
function brReportTab(v, D){
  const A = brAcct(D.k), cats = {};
  D.txs.forEach(t => { const c = brCat(D.k, t); cats[c] = cats[c] || {n:0, c:0}; cats[c].n++; cats[c].c += t.amtC; });
  const outC = D.outstanding.reduce((a, o) => a + (o.amtC || 0), 0);
  const fin = D.rec && D.rec.status === "final", open = D.ex.length + D.outstanding.length;
  const c = elm("div", "card br-rep");
  const row = (l, cv, sub, cls) => `<tr class="${cls || ""}"><td>${l}${sub ? `<div class="item-s">${sub}</div>` : ""}</td><td class="r num">${cv == null ? "—" : (cv < 0 ? "−" : "") + usd(Math.abs(cv))}</td></tr>`;
  c.innerHTML = `<div class="card-h"><h3>${esc(A.name)} ····${A.last4} · ${esc(monthLabel(D.m))}</h3>${fin ? `<span class="tag green">Finalized ${esc(fdateS(String(D.rec.at).slice(0, 10)))}</span>` : `<span class="tag gold">Open</span>`}</div>
    <div class="tbl-wrap"><table class="tbl"><tbody>
      ${row("<b>Opening balance</b>", D.openC)}
      ${Object.entries(cats).sort((a, b) => b[1].c - a[1].c).map(([cat, x]) => row(esc((BR_CATS[cat] || [cat])[0]), x.c, `${x.n} line${x.n === 1 ? "" : "s"}`)).join("")}
      ${row("<b>Closing balance (bank)</b>", D.closeC, "", "due")}
      ${row("Opening + lines", D.openC == null ? null : D.openC + D.netC, D.gapC == null ? "" : Math.abs(D.gapC) <= 1 ? "agrees with the bank's closing balance" : `${usd(Math.abs(D.gapC))} short of the bank's closing — lines missing from the import`)}
      ${row("Owner payouts recorded but not in the bank yet", -outC, D.outstanding.length ? `${D.outstanding.length} payment${D.outstanding.length === 1 ? "" : "s"} still processing or from another account` : "None")}
      ${row("Adjusted balance", D.closeC == null ? null : D.closeC - outC, "closing less what's still on its way out")}
      ${row("Unmatched lines", D.ex.reduce((a, t) => a + t.amtC, 0), `${D.ex.length} line${D.ex.length === 1 ? "" : "s"} to explain`)}
    </tbody></table></div>
    <div class="card-b"><p class="help" style="margin-top:0">This is the bank side only. Which month's rent each deposit pays is on <b>Rent allocation</b>; whether the account should end the month at $0 is on Owner payouts → “Rental income account → $0”.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${fin ? `<button class="btn" id="brReopen">Reopen</button>` : `<button class="btn primary" id="brFin">${open ? `Finalize with ${open} open item${open === 1 ? "" : "s"}…` : "Finalize this month"}</button>`}
        <button class="btn ghost" id="brCsvOut">Download CSV</button></div>
      ${(D.rec && D.rec.history || []).length ? `<div class="item-s" style="margin-top:8px">${D.rec.history.slice(-5).map(h => `${esc(h.what)} · ${esc(String(h.by || "").split("@")[0])} · ${esc(fdateS(String(h.at).slice(0, 10)))}`).join("<br>")}</div>` : ""}</div>`;
  v.appendChild(c);
  const fb = c.querySelector("#brFin"); if(fb) fb.onclick = () => {
    if(open && !confirm(`${open} item${open === 1 ? " is" : "s are"} still unexplained. Finalize ${monthLabel(D.m)} anyway? They stay listed as exceptions.`)) return;
    snapshot(); const B = BR(), key = D.k + "|" + D.m, who = billWho(), prev = B.recs[key] || {};
    B.recs[key] = {status:"final", at:new Date().toISOString(), by:who, openC:D.openC, closeC:D.closeC, open, history:(prev.history || []).concat([{what:`Finalized (${open} open)`, by:who, at:new Date().toISOString()}])};
    commit(); actLog("finance", `Bank reconciliation · ${A.name}: ${monthLabel(D.m)} finalized${open ? ` with ${open} open item${open === 1 ? "" : "s"}` : ""} · closing ${usd(D.closeC || 0)}`, {side:"pm"}); render(); };
  const rb = c.querySelector("#brReopen"); if(rb) rb.onclick = () => { const why = prompt("Why reopen it?"); if(!why) return;
    snapshot(); const B = BR(), key = D.k + "|" + D.m, who = billWho(), prev = B.recs[key] || {};
    B.recs[key] = Object.assign({}, prev, {status:"open", history:(prev.history || []).concat([{what:"Reopened: " + why.slice(0, 200), by:who, at:new Date().toISOString()}])});
    commit(); actLog("finance", `Bank reconciliation · ${A.name}: ${monthLabel(D.m)} reopened — ${why}`, {side:"pm"}); render(); };
  c.querySelector("#brCsvOut").onclick = () => {
    const q = s => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const lines = [["Date","Description","Counterparty","Reference","Category","Match","Explanation","Amount","Balance"].map(q).join(",")]
      .concat(D.txs.map(t => { const x = D.M.get(t.id) || {}; return [t.date, t.desc, t.cp, t.ref, (BR_CATS[brCat(D.k, t)] || [""])[0], (ST[x.st] || [""])[0], x.why, (t.amtC / 100).toFixed(2), t.balC == null ? "" : (t.balC / 100).toFixed(2)].map(q).join(","); }));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([lines.join("\n")], {type:"text/csv"})); a.download = `bank-reconciliation-${A.last4}-${D.m}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
}
function brAllocTab(v, m){
  const X = brAlloc(m), T = X.T;
  const c = elm("div", "card");
  const row = (l, cv, sub, cls) => `<tr class="${cls || ""}"><td>${l}${sub ? `<div class="item-s">${sub}</div>` : ""}</td><td class="r num">${usd(cv)}</td></tr>`;
  c.innerHTML = `<div class="card-h"><h3>Rent allocation · ${esc(monthLabel(m))}</h3><span class="muted" style="font-size:12.5px">From MagicDoor's payment-to-charge links · ${esc(typeof mdAgo === "function" && S.md && S.md.syncedAt ? "synced " + mdAgo(S.md.syncedAt) : "")}</span></div>
    <div class="tbl-wrap"><table class="tbl"><tbody>
      ${row(`<b>Tenant payments made in ${esc(monthLabel(m))}</b>`, T.cashC, "cash view — the day the tenant paid (MagicDoor deposits reach the bank 1–3 business days later)")}
      ${row(`… applied to ${esc(monthLabel(m))}'s charges`, T.cashForM)}
      ${row(`… applied to later months (paid early)`, T.cashEarly)}
      ${row(`… applied to earlier months (paid late)`, T.cashLate)}
      ${T.cashAhead ? row("… not applied to any charge yet (credit on the ledger)", T.cashAhead) : ""}
      ${row(`<b>Paid toward ${esc(monthLabel(m))}'s charges, whenever paid</b>`, T.allForM, "allocation view", "due")}
      ${row(`… paid before ${esc(monthLabel(m))}`, T.priorForM, "early payments for this month")}
      ${row(`… paid during ${esc(monthLabel(m))}`, T.cashForM)}
      ${row(`… paid after ${esc(monthLabel(m))}`, T.laterForM)}
      ${row(`of which rent`, T.rentForM, "the rest is fees, utilities and other charges")}
    </tbody></table></div>
    <div class="card-b"><p class="help" style="margin-top:0">Nothing moves between months here — each payment shows exactly what MagicDoor applied it to. Payments MagicDoor couldn't link to a charge show as not applied.</p></div>`;
  v.appendChild(c);
  const d = elm("div", "card");
  const kinds = {rent:"Rent", fees:"Filters / fees", late:"Late fee", phd:"PHD charge", other:"Other", ahead:"Ahead (no charge yet)"};
  d.innerHTML = `<div class="card-h"><h3>Every payment · ${X.lines.length}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Paid</th><th>Rental</th><th>Applied to</th><th class="r">Amount</th></tr></thead><tbody>
    ${X.lines.map(l => `<tr><td class="muted nowrap">${esc(fdateS(l.date))}</td><td><a href="#" data-brp="${esc(l.p.id)}" data-brm="${esc(m)}">${esc(l.p.name)}</a>${l.lease.unitName ? `<div class="item-s">${esc(l.lease.unitName)}</div>` : ""}</td>
      <td>${l.parts.map(x => `<span class="br-part ${x.m === m ? "here" : ""}">${x.m ? esc(monthShort(x.m)) : "—"} · ${esc(kinds[x.kind] || x.kind)} ${usd(x.c)}</span>`).join(" ")}</td><td class="r num">${usd(l.amtC)}</td></tr>`).join("")}
  </tbody></table></div>`;
  v.appendChild(d); brWire(d, {k:"", M:new Map()});
}
function brLineSheet(k, id){
  const t = ((BR().accts[k] || {}).txns || {})[id]; if(!t) return;
  const D = brMonth(k, String(t.date).slice(0, 7)), x = D.M.get(id) || {}, key = brNoteKey(k, id), n = BR().notes[key] || {}, cat = brCat(k, t), autoCat = (() => { const o = BR().cats[key]; delete BR().cats[key]; const a = brCat(k, t); if(o) BR().cats[key] = o; return a; })();
  const staff = (typeof Cloud !== "undefined" && Cloud.staff ? Cloud.staff : []).filter(s => s && s.active !== false).map(s => s.email || s).filter(Boolean);
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>${t.amtC < 0 ? "−" : ""}${usd(Math.abs(t.amtC))} · ${esc(fdateS(t.date))}</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="ps-kv"><span>Description</span><b>${esc(t.desc)}</b></div>
      ${t.cp ? `<div class="ps-kv"><span>Counterparty</span><b>${esc(t.cp)}</b></div>` : ""}
      ${t.ref ? `<div class="ps-kv"><span>Reference</span><b class="mono-s">${esc(t.ref)}</b></div>` : ""}
      ${t.type ? `<div class="ps-kv"><span>Bank type</span><b>${esc(t.type)}</b></div>` : ""}
      ${t.posted ? `<div class="ps-kv"><span>Posted</span><b>${esc(String(t.posted).replace("T", " ").slice(0, 16))}</b></div>` : ""}
      <div class="ps-kv"><span>Balance after</span><b>${t.balC == null ? "—" : usd(t.balC)}</b></div>
      <div class="ps-kv"><span>Bank's ID</span><b class="mono-s">${esc(t.id)}</b></div>
      <div class="sectl">Match</div>
      <p style="margin:0 0 6px"><span class="tag ${(ST[x.st] || [, "grey"])[1]}">${(ST[x.st] || ["—"])[0]}</span> ${esc(x.was || x.why || "")}</p>
      ${x.recs && x.recs.length ? `<p class="help" style="margin-top:0">${brRecLinks(x)}</p>` : ""}
      <label class="fld"><span>What it is</span><select id="brCat">${Object.entries(BR_CATS).map(([c, l]) => `<option value="${c}" ${c === cat ? "selected" : ""}>${esc(l[0])}${c === autoCat ? " (worked out)" : ""}</option>`).join("")}</select></label>
      <label class="fld"><span>Explanation</span><textarea id="brNote" rows="3" placeholder="Why this line is here — e.g. “Hayden returned September's payout; owed back”">${esc(n.note || "")}</textarea></label>
      <div class="f2"><label class="fld"><span>Assigned to</span>${staff.length ? `<select id="brWho"><option value="">Nobody</option>${staff.map(e => `<option value="${esc(e)}" ${n.assignee === e ? "selected" : ""}>${esc(e.split("@")[0])}</option>`).join("")}</select>` : `<input type="email" id="brWho" value="${esc(n.assignee || "")}" placeholder="name@phdproperties.realestate">`}</label>
        <label class="fld"><span>Status</span><select id="brDone"><option value="">Open</option><option value="1" ${n.done ? "selected" : ""}>Resolved</option></select></label></div>
      ${(n.history || []).length ? `<div class="item-s">${n.history.slice(-6).map(h => `${esc(h.what)} · ${esc(String(h.by || "").split("@")[0])} · ${esc(fdateS(String(h.at).slice(0, 10)))}`).join("<br>")}</div>` : ""}
      <p class="help">A note explains the line for this reconciliation — it never changes a month's figures or a payout.</p>
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="brSave">Save</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  $("#brSave").onclick = () => {
    const B = BR(), who = billWho(), now = new Date().toISOString(), newCat = $("#brCat").value, note = $("#brNote").value.trim(), as = $("#brWho").value.trim(), done = !!$("#brDone").value;
    snapshot();
    if(newCat !== autoCat) B.cats[key] = {cat:newCat, by:who, at:now}; else delete B.cats[key];
    const hist = (n.history || []).slice();
    if(note !== (n.note || "")) hist.push({what:note ? "Explained: " + note.slice(0, 120) : "Explanation removed", by:who, at:now});
    if(as !== (n.assignee || "")) hist.push({what:as ? "Assigned to " + as.split("@")[0] : "Unassigned", by:who, at:now});
    if(done !== !!n.done) hist.push({what:done ? "Resolved" : "Reopened", by:who, at:now});
    if(newCat !== cat) hist.push({what:`Marked as ${BR_CATS[newCat][0]}`, by:who, at:now});
    if(note || as || done || hist.length) B.notes[key] = {note, assignee:as, done, history:hist.slice(-30), at:now, by:who}; else delete B.notes[key];
    commit(); closeSheet(); render();
  };
}

/* ---------- wiring into the console ---------- */
window.pgBankRec = pgBankRec;
window.PAGE_EXT = Object.assign(window.PAGE_EXT || {}, {bankrec:pgBankRec});
if(typeof PM_VIEWS !== "undefined") PM_VIEWS.add("bankrec");
// stored as the shared doc "bank"
if(typeof cloudDocs === "function"){ const d0 = cloudDocs; cloudDocs = function(){ const out = d0.apply(this, arguments); if(S.bank) out.set("shared/bank", S.bank); return out; }; }
if(typeof cloudApply === "function"){ const a0 = cloudApply; cloudApply = function(kind, id, data, deleted){ if(kind === "shared" && id === "bank"){ S.bank = deleted ? null : data; return; } return a0.apply(this, arguments); }; }
if(typeof cloudLabel === "function"){ const l0 = cloudLabel; cloudLabel = function(kind, id){ if(kind === "shared" && id === "bank") return "bank reconciliation"; return l0.apply(this, arguments); }; }
if(typeof ACT_PM_DOCS !== "undefined") ACT_PM_DOCS.add("bank");
// the menu badge: lines still to explain in the latest imported month of the rental income account
window.brNavBadge = () => { try{ const k = "nk-6588", ms = [...new Set(brTx(k).map(t => String(t.date).slice(0, 7)))].sort(), m = ms[ms.length - 1]; if(!m) return null;
  const D = brMonth(k, m); if(D.rec && D.rec.status === "final") return null; const n = D.ex.length + D.outstanding.length; return n ? navBadge(n, null, `${n} to explain · ${monthLabel(m)}`) : null; }catch(e){ return null; } };
window.brMonth = brMonth; window.brAlloc = brAlloc; window.brParse = brParse; window.brImport = brImport; window.brMatchAll = brMatchAll;
})();
