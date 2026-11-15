/* =====================================================================
   SECURITY DEPOSITS — one ledger for every deposit PHD holds
   ---------------------------------------------------------------------
   Built to replace the Master Tracker / "Security Deposit Reconciliation"
   workbook. One record per deposit (not per rental), kept inside each
   rental's pm_deposit doc as `records`; deposits that aren't a rental's
   (the Reed & Welt reserve, the Judy portfolio, unidentified receipts,
   rentals not in the console) live in the "_other" doc, which also keeps
   the escrow check.

   Each record:
     names · received · amount (incl. any pet fee) · pet (non-refundable,
     goes to the owner) · account (escrow / income / split) ·
     stage (future → held → moveout → settled) · moveOut · deductions[] ·
     refund {amount, date, how, ref} · keptMoved (date the kept part went
     escrow → operating) · petPaid (date the pet fee went to the owner) ·
     check (matches / mismatch / missing) · notes · history[]
   Still held = amount − returned − kept − pet already paid to the owner.

   What the page does:
     · the ledger, filterable, with what each record still holds
     · transfers that are owed: kept deductions escrow → operating,
       deposits that landed in Rental Income → escrow, pet fees → owners
       (recorded here when done; nothing moves money)
     · the escrow check: balance − deposits held in escrow − interest −
       kept not yet moved = unexplained
     · move-out → deductions (move-out inspection findings and MagicDoor's
       unpaid balance one click away) → refund → itemized SC notice (PDF)
     · import the workbook's Deposit Ledger tab (CSV), safely re-runnable
   The old current / future / former fields are kept in step so alerts and
   the rental pages keep working.
   ===================================================================== */
(function(){
if(typeof render !== "function" || typeof pmState !== "function") return;

const DED = {cleaning:"Cleaning", damage:"Damage / repairs", rent:"Unpaid rent", fees:"Unpaid fees", utilities:"Utilities", keys:"Keys / locks", pet:"Pet damage", other:"Other"};
const HOW = {check:"Check", ach:"ACH / bank transfer", nickel:"Nickel", applied:"Applied to what they owe (nothing returned)", other:"Other"};
const ACCT = {escrow:"Escrow", income:"Rental Income", split:"Escrow + Rental Income", "":"Not recorded"};
const STAGE = {future:"Future tenant", held:"Held", moveout:"Moved out — to settle", settled:"Settled"};
const CHECK = {matches:["Matches", "green"], mismatch:["Mismatch", "gold"], missing:["Missing info", "gold"], "":["Not checked", "grey"]};
const OTHER = "_other";
const me = () => (typeof Cloud !== "undefined" && Cloud.email) || "This browser";
const dDays = () => Number((pmSettings() || {}).depositDays) || 30;
const C = x => x == null || x === "" ? 0 : cents(x);
const today = () => todayISO();
const plusDays = (iso, n) => PMCore.isoOf(PMCore.dayNum(iso) + n);
const daysTo = iso => PMCore.dayNum(iso) - PMCore.dayNum(today());
const DEPS = () => pmState().deposits;
const fY = iso => { if(!iso) return ""; const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"}); };

/* ---------- money on one record ---------- */
const keptC = r => (r.deductions || []).reduce((a, x) => a + C(x.amount), 0);
const petC = r => C(r.pet);
const returnedC = r => r.refund && r.refund.amount != null && r.refund.amount !== "" ? C(r.refund.amount) : r.stage === "settled" ? Math.max(0, C(r.amount) - petC(r) - keptC(r)) : 0;
const dueBackC = r => Math.max(0, C(r.amount) - petC(r) - keptC(r));
const owesC = r => Math.max(0, keptC(r) - (C(r.amount) - petC(r)));
function heldC(r){
  const paidPet = r.petPaid ? petC(r) : 0;
  if(r.stage === "settled") return Math.max(0, C(r.amount) - returnedC(r) - keptC(r) - paidPet);
  return Math.max(0, C(r.amount) - paidPet);
}
// the kept part still sitting in escrow, waiting to go to operating
const keptWaitingC = r => r.stage === "settled" && !r.keptMoved && !r.keptNa && (r.account === "escrow" || r.account === "split") ? keptC(r) : 0;
function rState(r){
  if(r.stage !== "moveout") return {k:r.stage || "held"};
  if(!r.moveOut) return {k:"nodate"};
  const due = plusDays(r.moveOut, dDays()), left = daysTo(due);
  return {k:left < 0 ? "overdue" : "open", due, left};
}

/* ---------- records: stored ones, or read from the old current / future / former fields ---------- */
const legacyDone = f => /^(yes|returned|done|refund|sent|paid|mailed|applied)/i.test(String(f.returned || "").trim());
function fromLegacy(d){
  const out = [], mk = (x, stage, extra) => x && (x.names || x.amount || x.moveOut) ? out.push(Object.assign({id:"lg_" + stage, names:x.names || "", amount:x.amount ?? null, received:x.collectedOn || "", account:"", stage, check:"",
    notes:[x.notes, x.amountText && !x.amount ? `Amount noted as "${x.amountText}"` : ""].filter(Boolean).join(" · "), deductions:x.deductions || [], refund:x.refund || {}, moveOut:x.moveOut || "", legacy:true}, extra || {})) : 0;
  mk(d.current, "held"); mk(d.future, "future");
  if(d.former) mk(d.former, legacyDone(d.former) || d.former.settledOn ? "settled" : "moveout", {returnedNote:d.former.returned || "", settledOn:d.former.settledOn || ""});
  return out;
}
const recsOf = id => { const d = DEPS()[id]; return !d ? [] : Array.isArray(d.records) ? d.records : fromLegacy(d); };
// keep the old fields in step, so the alerts, the property list and the property page still read the right thing
function syncLegacy(d){
  const R = d.records || [], pick = st => R.filter(r => r.stage === st);
  const join = rs => ({names:rs.map(r => r.names).filter(Boolean).join(" · "), amount:rs.length ? rs.reduce((a, r) => a + heldC(r), 0) / 100 : null});
  d.current = pick("held").length ? join(pick("held")) : {};
  d.future = pick("future").length ? join(pick("future")) : {};
  const mo = pick("moveout").sort((a, b) => String(a.moveOut).localeCompare(b.moveOut))[0];
  const st = R.filter(r => r.stage === "settled").sort((a, b) => String(b.settledOn || "").localeCompare(a.settledOn || ""))[0];
  d.former = mo ? {names:mo.names, amount:C(mo.amount) / 100, moveOut:mo.moveOut || "", returned:""} : st ? {names:st.names, amount:C(st.amount) / 100, moveOut:st.moveOut || "", returned:st.returnedNote || `Settled ${st.settledOn || ""}`} : {};
}
function hist(r, what){ r.history = (r.history || []).concat([{at:new Date().toISOString(), by:me(), what:String(what).slice(0, 240)}]).slice(-80); }
function saveRecs(id, recs, log){
  const d = JSON.parse(JSON.stringify(DEPS()[id] || {propertyId:id === OTHER ? null : id}));
  if(!Array.isArray(d.records) && !d.legacy) d.legacy = {current:d.current || null, future:d.future || null, former:d.former || null};
  d.records = recs.map(r => { const x = Object.assign({}, r); if(x.legacy){ delete x.legacy; x.id = "dp_" + uid(); } return x; });
  if(id !== OTHER) syncLegacy(d);
  snapshot(); DEPS()[id] = d; commit();
  if(log) actLog("deposits", log, {side:"pm", pid:id === OTHER ? undefined : id});
}
const otherDoc = () => DEPS()[OTHER] || {};

/* ---------- MagicDoor's view ---------- */
function mdDep(pid){
  try{ const x = typeof mdFor === "function" && mdFor(pid); if(!x) return null;
    const L = x.lease, E = x.endedLease;
    return {paidC:L ? C(L.depositPaid) : null, dueC:L ? C(L.depositDue) : 0, names:L && typeof mdTenants === "function" ? mdTenants(L) : "", endedBal:E ? C(E.balance) : 0, endedEnd:E ? E.end : null,
      endedNames:E ? (E.tenants || []).map(t => t.name).filter(Boolean).join(" / ") : ""}; }catch(e){ return null; }
}

/* ---------- everything, flattened ---------- */
function dAll(){
  const P2 = pmState(), out = [];
  P2.properties.filter(p => !p.deleted).forEach(p => recsOf(p.id).forEach(r => out.push({r, p, docId:p.id, place:p.name})));
  recsOf(OTHER).forEach(r => out.push({r, p:null, docId:OTHER, place:r.place || "Other"}));
  out.forEach(x => { const r = x.r, s = rState(r), iss = [];
    if(s.k === "overdue") iss.push(`Return ${-s.left} day${s.left === -1 ? "" : "s"} overdue`);
    else if(s.k === "open" && s.left <= 10) iss.push(`Return due in ${s.left} day${s.left === 1 ? "" : "s"}`);
    if(s.k === "nodate") iss.push("Move-out date missing");
    if(r.check === "mismatch") iss.push("Sources disagree");
    if(r.check === "missing") iss.push("Missing information");
    if(r.stage !== "settled" && !C(r.amount)) iss.push("No amount");
    if(r.account === "income" && heldC(r) > 0) iss.push("Sitting in Rental Income");
    if(keptWaitingC(r)) iss.push(`${usd(keptWaitingC(r))} kept, not moved to operating`);
    if(petC(r) && !r.petPaid && r.stage === "settled") iss.push(`${usd(petC(r))} pet fee owed to the owner`);
    x.s = s; x.issues = iss; x.held = heldC(r); });
  return out;
}
function dTotals(all){
  const t = {heldC:0, escrowC:0, incomeC:0, splitC:0, futC:0, moveN:0, moveC:0, overdueN:0, keptWaitC:0, petOwedC:0, incomeHeldC:0, n:{matches:0, mismatch:0, missing:0, "":0}};
  all.forEach(({r, s, held}) => { t.heldC += held; if(r.account === "escrow") t.escrowC += held; else if(r.account === "income") t.incomeC += held; else if(r.account === "split") t.splitC += held;
    if(r.stage === "future") t.futC += held;
    if(r.stage === "moveout"){ t.moveN++; t.moveC += held; if(s.k === "overdue") t.overdueN++; }
    t.keptWaitC += keptWaitingC(r); if(petC(r) && !r.petPaid) t.petOwedC += petC(r); if(r.account === "income" && held > 0) t.incomeHeldC += held;
    t.n[r.check || ""] = (t.n[r.check || ""] || 0) + 1; });
  return t;
}
function bankBal(){
  try{ if(typeof window.brTx !== "function") return null;
    const tx = window.brTx("fcb-8191").filter(t => t.balC != null), last = tx[tx.length - 1];
    return last ? {c:last.balC, date:last.date, src:"First Citizens 8191 statement (Bank reconciliation)"} : null; }catch(e){ return null; }
}

/* ---------- the page ---------- */
function pgDeposits(){
  const P2 = pmState(); if(!P2.properties.length) return pmEmpty();
  const ui = S.ui, all = dAll(), T = dTotals(all), v = $("#view"), rc = otherDoc().recon || {}, bb = bankBal();
  actions([["Import tracker", () => dImportSheet()], ["Add a deposit", () => dRecordSheet(null, null)], ["Download CSV", () => dCsv(all)]]);
  const tab = ui.dpTab || "ledger";
  const hero = elm("div", "card dp-hero");
  hero.innerHTML = `<div class="dp-k main"><span>Deposits PHD holds</span><b>${usd(T.heldC)}</b><em>${all.filter(x => x.held > 0).length} deposits · ${usd(T.escrowC)} in escrow${T.incomeC ? ` · ${usd(T.incomeC)} in Rental Income` : ""}${T.splitC ? ` · ${usd(T.splitC)} split` : ""}</em></div>
    <div class="dp-k ${T.overdueN ? "bad" : T.moveN ? "warn" : ""}"><span>Move-outs to settle</span><b>${T.moveN}${T.moveC ? " · " + usd(T.moveC) : ""}</b><em>${T.overdueN ? `${T.overdueN} past the ${dDays()}-day deadline` : `${dDays()} days from move-out (South Carolina)`}</em></div>
    <div class="dp-k ${T.keptWaitC || T.incomeHeldC || T.petOwedC ? "warn" : "ok"}"><span>Transfers owed</span><b>${usd(T.keptWaitC + T.incomeHeldC + T.petOwedC)}</b><em>${[T.keptWaitC && `${usd(T.keptWaitC)} kept → operating`, T.incomeHeldC && `${usd(T.incomeHeldC)} income → escrow`, T.petOwedC && `${usd(T.petOwedC)} pet fees → owners`].filter(Boolean).join(" · ") || "Nothing to move"}</em></div>
    <div class="dp-k ${T.n.mismatch || T.n.missing ? "warn" : ""}"><span>Checked against the books</span><b>${T.n.matches || 0} match</b><em>${T.n.mismatch || 0} mismatch · ${T.n.missing || 0} missing info${T.n[""] ? ` · ${T.n[""]} not checked` : ""}</em></div>`;
  v.appendChild(hero);
  const bar = elm("div", "card dp-bar");
  const tabs = [["ledger", "Ledger"], ["transfers", "Transfers owed"], ["escrow", "Escrow check"]];
  bar.innerHTML = `<div class="sc-seg">${tabs.map(([k, l]) => `<button data-dpt="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-dpt]").forEach(b => b.onclick = () => { ui.dpTab = b.dataset.dpt; persistUi(); render(); });
  if(tab === "transfers") return dTransfers(v, all);
  if(tab === "escrow") return dEscrow(v, all, T, rc, bb);

  const F = ui.dpF || "held", q = String(ui.dpQ || "").toLowerCase();
  const filt = {held:["Held now", x => x.held > 0], attn:["Needs a look", x => x.issues.length], move:["Move-outs", x => x.r.stage === "moveout"], fut:["Future tenants", x => x.r.stage === "future"], settled:["Settled", x => x.r.stage === "settled"], all:["All", () => true]};
  const fb = elm("div", "dp-fb");
  fb.innerHTML = `<div class="sc-seg">${Object.entries(filt).map(([k, [l, fn]]) => `<button data-dpf="${k}" class="${F === k ? "on" : ""}">${l} · ${all.filter(fn).length}</button>`).join("")}</div><input type="search" id="dpQ" placeholder="Search rentals, tenants or notes" value="${esc(ui.dpQ || "")}">`;
  bar.appendChild(fb);
  fb.querySelectorAll("[data-dpf]").forEach(b => b.onclick = () => { ui.dpF = b.dataset.dpf; persistUi(); render(); });
  fb.querySelector("#dpQ").oninput = e => { ui.dpQ = e.target.value; clearTimeout(pgDeposits.t); pgDeposits.t = setTimeout(() => { render(); const i = $("#dpQ"); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  const list = all.filter(filt[F] ? filt[F][1] : () => true).filter(x => !q || [x.place, x.r.names, x.r.notes].join(" ").toLowerCase().includes(q))
    .sort((a, b) => a.place.localeCompare(b.place, undefined, {numeric:true}) || String(a.r.received || "").localeCompare(b.r.received || ""));
  const stageTag = x => { const s = x.s, r = x.r;
    if(s.k === "overdue") return `<span class="tag red">Overdue ${-s.left}d</span>`;
    if(s.k === "open") return `<span class="tag ${s.left <= 10 ? "gold" : "grey"}">Return by ${esc(fdateS(s.due))}</span>`;
    if(s.k === "nodate") return `<span class="tag gold">Moved out · no date</span>`;
    if(r.stage === "settled") return `<span class="tag green">Settled${r.settledOn ? " " + esc(fY(r.settledOn)) : ""}</span>`;
    if(r.stage === "future") return `<span class="tag grey">Future tenant</span>`;
    return `<span class="tag">Held</span>`; };
  const c = elm("div", "card");
  const sum = k => list.reduce((a, x) => a + k(x), 0);
  c.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl dp-tbl"><thead><tr><th>Rental</th><th>Tenants</th><th>Received</th><th class="r">Deposit</th><th>Account</th><th class="r">Returned</th><th class="r">Kept</th><th class="r">Still held</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map((x, i) => { const r = x.r, md = x.p ? mdDep(x.p.id) : null; return `<tr data-dpi="${i}" class="tk-r">
      <td><div class="item-t">${esc(x.place)}</div>${x.r.unitNote ? `<div class="item-s muted">${esc(x.r.unitNote)}</div>` : ""}${!x.p ? `<div class="item-s muted">${r.kind === "reserve" ? "Owner reserve" : r.kind === "unidentified" ? "Not identified yet" : "Not a console rental"}</div>` : ""}</td>
      <td>${esc(r.names || "—")}${petC(r) ? `<div class="item-s">incl. ${usd(petC(r))} pet fee${r.petPaid ? " (paid to owner)" : ""}</div>` : ""}</td>
      <td>${r.received ? esc(fY(r.received)) : `<span class="muted">—</span>`}</td>
      <td class="r num">${C(r.amount) ? usd(C(r.amount)) : `<span class="muted">—</span>`}</td>
      <td>${r.account ? esc(ACCT[r.account]) : `<span class="muted">—</span>`}</td>
      <td class="r num">${returnedC(r) ? usd(returnedC(r)) : ""}</td><td class="r num">${keptC(r) ? usd(keptC(r)) : ""}</td>
      <td class="r num"><b>${x.held ? usd(x.held) : "—"}</b></td>
      <td>${stageTag(x)} ${r.check ? `<span class="tag ${CHECK[r.check][1]}">${CHECK[r.check][0]}</span>` : ""}${x.issues.filter(t => !/^Return|Sources|Missing information/.test(t)).map(t => `<div class="dp-i">${esc(t)}</div>`).join("")}${md && md.paidC != null && r.stage === "held" && Math.abs(md.paidC - C(r.amount)) > 100 && recsOf(x.p.id).filter(y => y.stage === "held").length === 1 ? `<div class="dp-i">MagicDoor shows ${usd(md.paidC)}</div>` : ""}</td>
      <td class="act"><span class="sc-go">›</span></td></tr>`; }).join("")}</tbody>
    <tfoot><tr><td colspan="3"><b>${list.length} deposit${list.length === 1 ? "" : "s"}</b></td><td class="r num"><b>${usd(sum(x => C(x.r.amount)))}</b></td><td></td><td class="r num"><b>${usd(sum(x => returnedC(x.r)))}</b></td><td class="r num"><b>${usd(sum(x => keptC(x.r)))}</b></td><td class="r num"><b>${usd(sum(x => x.held))}</b></td><td colspan="2"></td></tr></tfoot></table></div>`
    : `<div class="empty"><b>${all.length ? "Nothing here" : "No deposits yet"}</b><p>${all.length ? "Try another filter." : "Import the tracker (its Deposit Ledger tab, saved as CSV) or add deposits one by one."}</p></div>`;
  v.appendChild(c);
  c.querySelectorAll("[data-dpi]").forEach(tr => tr.onclick = () => { const x = list[+tr.dataset.dpi]; dRecordSheet(x.docId, x.r.id); });
}

/* what has to move between accounts — recorded here when done */
function dTransfers(v, all){
  const kept = all.filter(x => keptWaitingC(x.r)), inc = all.filter(x => x.r.account === "income" && x.held > 0), split = all.filter(x => x.r.account === "split" && x.held > 0), pet = all.filter(x => petC(x.r) && !x.r.petPaid);
  const sec = (title, help, rows, amt, btn, fn) => { const c = elm("div", "card");
    c.innerHTML = `<div class="card-h"><h3>${title} · ${usd(rows.reduce((a, x) => a + amt(x), 0))}</h3></div><p class="help" style="padding:0 16px">${help}</p>
      ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${rows.map((x, i) => `<tr><td><b>${esc(x.place)}</b><div class="item-s">${esc(x.r.names || "")}</div></td><td>${esc(fn ? fn(x) : "")}</td><td class="r num"><b>${usd(amt(x))}</b></td><td class="r">${btn ? `<button class="btn sm" data-tr="${i}">${btn}</button>` : ""}<a href="#" data-to="${i}" style="margin-left:8px;font-size:12.5px">Open</a></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted" style="padding:0 16px 12px">Nothing to move.</p>`}`;
    v.appendChild(c); return c; };
  const wire = (c, rows, on) => { c.querySelectorAll("[data-to]").forEach(a => a.onclick = e => { e.preventDefault(); const x = rows[+a.dataset.to]; dRecordSheet(x.docId, x.r.id); });
    c.querySelectorAll("[data-tr]").forEach(b => b.onclick = () => on(rows[+b.dataset.tr])); };
  const mark = (x, what, apply) => { const when = prompt(`${what}\n\nDate it was done (YYYY-MM-DD). This only records it — no money moves from here.`, today()); if(!when) return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(when)) return toast("Use YYYY-MM-DD");
    const recs = recsOf(x.docId).map(r => r.id === x.r.id ? Object.assign({}, r) : r), r = recs.find(y => y.id === x.r.id); apply(r, when); hist(r, `${what} — done ${when}`);
    saveRecs(x.docId, recs, `Deposit transfer recorded · ${x.place} · ${what}`); toast("Recorded", true); };
  wire(sec("Kept deductions: escrow → operating", "What was kept at move-out is PHD's or the owner's, not the tenant's — it leaves escrow once the refund has gone.", kept, x => keptWaitingC(x.r), "Mark moved", x => `${x.r.refund && x.r.refund.date ? "Refund sent " + fdateS(x.r.refund.date) : "Settled"}${x.r.keptMemo ? " · " + x.r.keptMemo : ""}`), kept,
    x => mark(x, `${usd(keptWaitingC(x.r))} kept moved escrow → operating`, (r, w) => { r.keptMoved = w; }));
  wire(sec("Received into Rental Income: → escrow", "Deposits paid into the Rental Income account belong in escrow while they're held.", inc, x => x.held, "Mark moved", x => x.r.received ? "Received " + fdateS(x.r.received) : ""), inc,
    x => mark(x, `${usd(x.held)} moved Rental Income → escrow`, r => { r.account = "escrow"; }));
  if(split.length) wire(sec("Split between escrow and Rental Income", "The split isn't recorded — check the bank, then set the account on the deposit.", split, x => x.held, null, () => ""), split, () => {});
  wire(sec("Pet fees owed to owners", "Pet fees are non-refundable and go to the owner (Peter, Nov 12, 2026).", pet, x => petC(x.r), "Mark paid to owner", x => x.r.stage === "settled" ? "Tenant moved out — release now" : "Tenant still in place"), pet,
    x => mark(x, `${usd(petC(x.r))} pet fee paid to the owner`, (r, w) => { r.petPaid = w; }));
}

/* the escrow account against what it should hold */
function dEscrow(v, all, T, rc, bb){
  const escrowHeld = all.filter(x => x.r.account === "escrow").reduce((a, x) => a + x.held, 0);
  const balC = rc.balance != null && rc.balance !== "" ? C(rc.balance) : bb ? bb.c : null, intC = C(rc.interest), unexpl = balC == null ? null : balC - escrowHeld - intC - T.keptWaitC;
  const c = elm("div", "card dp-esc");
  c.innerHTML = `<div class="card-h"><h3>Escrow check</h3></div>
    <div class="dp-escg">
      <div class="dp-escf"><label class="fld"><span>Escrow balance</span><input type="number" step="0.01" id="esB" value="${rc.balance ?? ""}" placeholder="${bb ? (bb.c / 100).toFixed(2) : ""}"></label>
        <label class="fld"><span>As of</span><input type="date" id="esD" value="${esc(rc.asOf || (bb ? bb.date : ""))}"></label>
        <label class="fld"><span>From</span><input type="text" id="esS" value="${esc(rc.source || (bb ? bb.src : ""))}" placeholder="e.g. QuickBooks SD Escrow, bank statement"></label>
        <label class="fld"><span>Interest earned and left in escrow</span><input type="number" step="0.01" id="esI" value="${rc.interest ?? ""}"></label>
        <label class="fld"><span>Notes</span><textarea id="esN" rows="2">${esc(rc.notes || "")}</textarea></label>
        <button class="btn sm primary" id="esSave">Save</button></div>
      <table class="tbl dp-esct"><tbody>
        <tr><td>Escrow balance${rc.asOf ? ` · ${esc(fdateS(rc.asOf))}` : ""}</td><td class="r num">${balC == null ? "—" : usd(balC)}</td></tr>
        <tr><td>Less deposits held in escrow (${all.filter(x => x.r.account === "escrow" && x.held > 0).length})</td><td class="r num">−${usd(escrowHeld)}</td></tr>
        <tr><td>Less interest left in escrow</td><td class="r num">−${usd(intC)}</td></tr>
        <tr><td>Less kept deductions not yet moved to operating</td><td class="r num">−${usd(T.keptWaitC)}</td></tr>
        <tr class="tot"><td><b>Unexplained</b></td><td class="r num"><b class="${unexpl != null && Math.abs(unexpl) > 100 ? "tk-late" : ""}">${unexpl == null ? "—" : usd(unexpl)}</b></td></tr>
        <tr><td class="muted">Held in Rental Income (not in escrow)</td><td class="r num muted">${usd(T.incomeC)}</td></tr>
        <tr><td class="muted">Held, account split or not recorded</td><td class="r num muted">${usd(T.splitC + all.filter(x => !x.r.account).reduce((a, x) => a + x.held, 0))}</td></tr>
      </tbody></table></div>
    <p class="help" style="padding:0 16px 14px">Unexplained is usually deposits or past returns that aren't in the ledger yet. ${bb ? `The First Citizens 8191 statement in Bank reconciliation shows ${usd(bb.c)} on ${esc(fdateS(bb.date))}.` : "Import the escrow account's bank statement in Bank reconciliation to fill the balance from the bank."}</p>`;
  v.appendChild(c);
  c.querySelector("#esSave").onclick = () => {
    const d = JSON.parse(JSON.stringify(otherDoc())); d.records = recsOf(OTHER);
    const was = d.recon || {};
    d.recon = {balance:$("#esB").value === "" ? null : Number($("#esB").value), asOf:$("#esD").value, source:$("#esS").value.trim(), interest:$("#esI").value === "" ? null : Number($("#esI").value), notes:$("#esN").value.trim(), at:new Date().toISOString(), by:me()};
    d.reconHistory = (d.reconHistory || []).concat([was.at ? was : null].filter(Boolean)).slice(-24);
    snapshot(); DEPS()[OTHER] = d; commit(); actLog("deposits", `Escrow check saved: ${d.recon.balance != null ? usd(C(d.recon.balance)) : "no balance"} as of ${d.recon.asOf || "?"}`, {side:"pm"}); toast("Saved", true);
  };
}

/* ---------- one deposit ---------- */
function dRecordSheet(docId, rid, preset){
  const isNew = !rid, P2 = pmState();
  let recs = docId ? recsOf(docId).map(r => JSON.parse(JSON.stringify(r))) : [];
  let r = rid ? recs.find(x => x.id === rid) : Object.assign({id:"dp_" + uid(), names:"", amount:null, received:today(), account:"escrow", stage:"held", check:"", deductions:[], refund:{}, notes:""}, preset || {});
  if(!r) return toast("That deposit isn't there any more");
  r.deductions = r.deductions || []; r.refund = r.refund || {};
  let pid = docId && docId !== OTHER ? docId : (preset && preset.pid) || "";
  const sh = $("#sheet"); let dirty = false;
  const read = () => {
    const g = id => sh.querySelector(id);
    if(g("#drP")) pid = g("#drP").value;
    sh.querySelectorAll("[data-f]").forEach(el => { const f = el.dataset.f; r[f] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value.trim(); });
    sh.querySelectorAll("[data-dd]").forEach(el => { const x = r.deductions[+el.dataset.dd]; if(!x) return; x.kind = el.querySelector("[data-k]").value; x.label = el.querySelector("[data-l]").value.trim(); x.amount = el.querySelector("[data-a]").value === "" ? null : Number(el.querySelector("[data-a]").value); });
    ["date", "how", "ref"].forEach(k => { const el = sh.querySelector(`[data-rf="${k}"]`); if(el) r.refund[k] = el.value.trim(); });
    const ra = sh.querySelector('[data-rf="amount"]'); if(ra) r.refund.amount = ra.value === "" ? null : Number(ra.value);
  };
  const draw = () => {
    const p = pid ? pmProp(pid) : null, md = p ? mdDep(p.id) : null, s = rState(r), done = r.stage === "settled";
    const insp = p ? Object.values(S.insp || {}).filter(x => x && x.pid === p.id && x.kind === "move_out").sort((a, b) => String(b.date).localeCompare(a.date))[0] : null;
    const findings = insp && typeof inFindings === "function" ? inFindings(insp) : [];
    const f = (k, label, type, extra) => `<label class="fld"><span>${label}</span><input type="${type || "text"}" ${type === "number" ? 'step="0.01"' : ""} data-f="${k}" value="${esc(r[k] ?? "")}" ${extra || ""}></label>`;
    const sel = (k, label, opts) => `<label class="fld"><span>${label}</span><select data-f="${k}">${Object.entries(opts).map(([v, l]) => `<option value="${v}" ${(r[k] || "") === v ? "selected" : ""}>${Array.isArray(l) ? l[0] : l}</option>`).join("")}</select></label>`;
    sh.innerHTML = `<div class="sheet-h"><div><h3>${isNew ? "Add a deposit" : esc(r.names || "Deposit")}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${p ? esc(p.name) : esc(r.place || "Not a console rental")}${md && md.paidC != null ? ` · MagicDoor: ${usd(md.paidC)} paid${md.names ? " by " + esc(md.names) : ""}${md.dueC ? `, ${usd(md.dueC)} still owed` : ""}` : ""}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b dp-sheet">
      <section class="dp-sec">
        <label class="fld"><span>Rental</span><select id="drP"><option value="">Not a console rental (or not a tenant's)</option>${P2.properties.filter(x => !x.deleted).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true})).map(x => `<option value="${esc(x.id)}" ${x.id === pid ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
        ${!pid ? `<div class="f2">${f("place", "Rental or what it is")}${sel("kind", "Kind", {tenant:"A tenant's deposit", reserve:"Owner reserve", unidentified:"Not identified yet", other:"Other"})}</div>` : ""}
        <div class="f2">${f("names", "Tenants")}${f("received", "Received", "date")}</div>
        <div class="f2">${f("amount", "Deposit (incl. any pet fee)", "number")}${f("pet", "Of which pet fee (goes to the owner)", "number")}</div>
        <div class="f2">${sel("account", "Account it's in", ACCT)}${sel("stage", "Stage", STAGE)}</div>
        ${md && md.paidC != null && r.stage === "held" && Math.abs(md.paidC - C(r.amount)) > 100 ? `<p class="dp-warn">MagicDoor shows ${usd(md.paidC)} paid for this rental's current lease.</p>` : ""}
        ${r.stage === "held" && !isNew ? `<button class="btn sm" id="drMove" type="button">Start move-out</button>` : ""}${r.stage === "future" && !isNew ? `<button class="btn sm" id="drIn" type="button">Moved in — now held</button>` : ""}
      </section>
      ${r.stage === "moveout" || r.stage === "settled" ? `<section class="dp-sec ${s.k === "overdue" ? "bad" : ""}"><div class="dp-sh"><h4>Move-out</h4>${s.k === "overdue" ? `<span class="tag red">Return ${-s.left} day${s.left === -1 ? "" : "s"} overdue</span>` : s.k === "open" ? `<span class="tag ${s.left <= 10 ? "gold" : "grey"}">Return by ${esc(fdateS(s.due))} · ${s.left} day${s.left === 1 ? "" : "s"}</span>` : done ? `<span class="tag green">Settled${r.settledOn ? " " + esc(fdateS(r.settledOn)) : ""}</span>` : ""}</div>
        <div class="f2">${f("moveOut", "Moved out", "date")}${f("forwarding", "Forwarding address")}</div>
        <p class="help" style="margin-top:-4px">South Carolina: the deposit, less an itemized list of what was kept, goes back within ${dDays()} days of move-out. ${petC(r) ? `The ${usd(petC(r))} pet fee isn't refunded — it goes to the owner.` : ""}</p>
        <div class="dp-sub">Kept</div>
        <div class="dp-ded">${r.deductions.map((x, i) => `<div class="dp-dr" data-dd="${i}"><select data-k>${Object.entries(DED).map(([k, l]) => `<option value="${k}" ${k === x.kind ? "selected" : ""}>${l}</option>`).join("")}</select>
            <input type="text" data-l placeholder="What it was for" value="${esc(x.label || "")}"><input type="number" step="0.01" data-a placeholder="0.00" value="${x.amount ?? ""}"><a href="#" data-ddx="${i}" class="muted">✕</a>${x.src ? `<div class="dp-src">${esc(x.src)}</div>` : ""}</div>`).join("") || `<p class="muted" style="margin:0 0 6px">Nothing kept so far.</p>`}
          <div class="dp-add"><button class="btn sm ghost" id="drAddD" type="button">Add a deduction</button>
            ${findings.length ? `<button class="btn sm ghost" id="drInsp" type="button">Add ${findings.length} finding${findings.length === 1 ? "" : "s"} from the ${esc(fdateS(insp.date))} move-out inspection</button>` : ""}
            ${md && md.endedBal > 0 ? `<button class="btn sm ghost" id="drBal" type="button">Add ${usd(md.endedBal)} unpaid (MagicDoor)</button>` : ""}</div></div>
        <div class="dp-sum"><div><span>Deposit${petC(r) ? " less pet fee" : ""}</span><b class="num">${usd(C(r.amount) - petC(r))}</b></div><div><span>Kept</span><b class="num">−${usd(keptC(r))}</b></div><div class="${owesC(r) ? "bad" : ""}"><span>${owesC(r) ? "Tenant still owes" : "Back to the tenant"}</span><b class="num">${usd(owesC(r) || dueBackC(r))}</b></div></div>
        <div class="dp-sub">Refund</div>
        <div class="f2"><label class="fld"><span>How</span><select data-rf="how"><option value="">—</option>${Object.entries(HOW).map(([k, l]) => `<option value="${k}" ${r.refund.how === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="fld"><span>Date sent</span><input type="date" data-rf="date" value="${esc(r.refund.date || "")}"></label></div>
        <div class="f2"><label class="fld"><span>Amount sent (if not ${usd(dueBackC(r))})</span><input type="number" step="0.01" data-rf="amount" value="${r.refund.amount ?? ""}"></label>
          <label class="fld"><span>Check # / reference</span><input type="text" data-rf="ref" value="${esc(r.refund.ref || "")}"></label></div>
        <div class="f2">${f("noticeSent", "Itemized notice sent", "date")}${f("keptMoved", "Kept part moved to operating", "date")}</div>
        ${r.returnedNote ? `<p class="help">Earlier note: ${esc(r.returnedNote)}</p>` : ""}
        <div class="dp-act"><button class="btn sm" id="drPdf" type="button">Itemized notice (PDF)</button>${done ? "" : `<button class="btn sm primary" id="drSettle" type="button">Mark settled</button>`}</div>
      </section>` : ""}
      <section class="dp-sec"><div class="f2">${sel("check", "Checked against the books", CHECK)}${petC(r) ? f("petPaid", "Pet fee paid to the owner", "date") : "<span></span>"}</div>
        <label class="fld"><span>Notes</span><textarea rows="3" data-f="notes">${esc(r.notes || "")}</textarea></label></section>
      ${(r.history || []).length ? `<details class="tk-h"><summary>History · ${r.history.length}</summary>${r.history.slice().reverse().map(h => `<div>${esc(fdateS(String(h.at).slice(0, 10)))} · ${esc(String(h.by).split("@")[0])} — ${esc(h.what)}</div>`).join("")}</details>` : ""}
    </div>
    <div class="sheet-f">${isNew ? "" : `<button class="btn ghost sm" id="drDel">Delete</button>`}<span style="flex:1"></span><button class="btn" id="drCancel">Cancel</button><button class="btn primary" id="drSave">${isNew ? "Add" : "Save"}</button></div>`;
    wire();
  };
  const wire = () => {
    const g = id => sh.querySelector(id);
    sh.querySelectorAll("input,select,textarea").forEach(el => el.addEventListener("input", () => { dirty = true; }));
    $("#shClose").onclick = $("#drCancel").onclick = () => { if(dirty && !confirm("Close without saving?")) return; closeSheet(); };
    g("#drP").onchange = () => { read(); dirty = true; draw(); };
    sh.querySelector('[data-f="stage"]').onchange = () => { read(); dirty = true; draw(); };
    if(g("#drMove")) g("#drMove").onclick = () => { read(); const w = prompt(`Move-out date for ${r.names || "the tenants"} (YYYY-MM-DD)`, today()); if(!w) return; if(!/^\d{4}-\d{2}-\d{2}$/.test(w)) return toast("Use YYYY-MM-DD");
      r.stage = "moveout"; r.moveOut = w; r._log = (r._log || []).concat([`Move-out started (${w})`]); dirty = true; draw(); };
    if(g("#drIn")) g("#drIn").onclick = () => { read(); r.stage = "held"; r._log = (r._log || []).concat(["Moved in"]); dirty = true; draw(); };
    if(g("#drAddD")) g("#drAddD").onclick = () => { read(); r.deductions.push({id:uid(), kind:"cleaning", label:"", amount:null}); dirty = true; draw(); };
    sh.querySelectorAll("[data-ddx]").forEach(a => a.onclick = e => { e.preventDefault(); read(); r.deductions.splice(+a.dataset.ddx, 1); dirty = true; draw(); });
    if(g("#drInsp")) g("#drInsp").onclick = () => { read(); const insp = Object.values(S.insp || {}).filter(x => x && x.pid === pid && x.kind === "move_out").sort((a, b) => String(b.date).localeCompare(a.date))[0];
      inFindings(insp).forEach(({r:room, it}) => { const key = insp.id + "|" + it.id; if(r.deductions.some(x => x.key === key)) return;
        r.deductions.push({id:uid(), key, kind:"damage", label:`${room.name} · ${it.name}${it.note ? " — " + it.note : ""}`, amount:null, src:`Move-out inspection ${fdateS(insp.date)}`}); });
      dirty = true; draw(); };
    if(g("#drBal")) g("#drBal").onclick = () => { read(); const md = mdDep(pid); r.deductions.push({id:uid(), kind:"rent", label:`Unpaid balance${md.endedNames ? " — " + md.endedNames : ""}`, amount:md.endedBal / 100, src:`MagicDoor ledger${md.endedEnd ? ", lease ended " + fdateS(md.endedEnd) : ""}`}); dirty = true; draw(); };
    if(g("#drPdf")) g("#drPdf").onclick = () => { read(); dNotice(pid ? pmProp(pid) : {name:r.place || "Rental", address:r.place}, r); };
    if(g("#drSettle")) g("#drSettle").onclick = () => { read();
      if(!r.moveOut) return toast("Add the move-out date first");
      if(r.deductions.some(x => !(C(x.amount) > 0))) return toast("Every deduction needs an amount (remove the empty ones)");
      const back = r.refund.amount != null && r.refund.amount !== "" ? C(r.refund.amount) : dueBackC(r);
      if(back > 0 && (!r.refund.how || !r.refund.date)) return toast("Say how and when the refund went back");
      if(!confirm(`Mark settled?\n\nDeposit ${usd(C(r.amount))}${petC(r) ? ` (incl. ${usd(petC(r))} pet fee for the owner)` : ""} · kept ${usd(keptC(r))} · ${owesC(r) ? `tenant still owes ${usd(owesC(r))}` : `back to the tenant ${usd(back)}`}.\n\nThis records it; it doesn't send any money.`)) return;
      r.stage = "settled"; r.settledOn = r.refund.date || today(); r.settledBy = me();
      r.returnedNote = `${back ? `Returned ${usd(back)}` : "Nothing returned"}${keptC(r) ? `, kept ${usd(keptC(r))}` : ""}${r.refund.how ? ` · ${HOW[r.refund.how]}` : ""}${r.refund.ref ? " #" + r.refund.ref : ""} · ${fdateS(r.settledOn)}`;
      r._log = (r._log || []).concat([`Settled: ${r.returnedNote}`]); save(); };
    if(g("#drDel")) g("#drDel").onclick = () => { if(!confirm(`Delete this deposit record (${r.names || "no names"}, ${usd(C(r.amount))})? Its history goes with it.`)) return;
      saveRecs(docId, recs.filter(x => x.id !== r.id), `Deposit record deleted · ${(pmProp(docId) || {}).name || r.place || ""} · ${r.names || ""} ${usd(C(r.amount))}`); closeSheet(); };
    $("#drSave").onclick = () => { read(); save(); };
  };
  const save = () => {
    if(!pid && !r.place) return toast("Pick the rental, or say what this deposit is for");
    const target = pid || OTHER;
    const old = docId ? recsOf(docId).find(x => x.id === r.id) : null, ch = [];
    if(!old) ch.push(`Added: ${r.names || "—"} ${usd(C(r.amount))}`);
    else { [["names", "tenants"], ["amount", "deposit"], ["pet", "pet fee"], ["account", "account"], ["stage", "stage"], ["moveOut", "moved out"], ["check", "check"], ["keptMoved", "kept moved"], ["petPaid", "pet fee paid"]].forEach(([k, l]) => { if(String(old[k] ?? "") !== String(r[k] ?? "")) ch.push(`${l}: ${r[k] ?? "—"}`); });
      if(keptC(old) !== keptC(r)) ch.push(`kept ${usd(keptC(r))}`); if(JSON.stringify(old.refund || {}) !== JSON.stringify(r.refund || {})) ch.push("refund details"); }
    (r._log || []).forEach(x => hist(r, x)); delete r._log; if(ch.length) hist(r, ch.join(" · "));
    if(target !== OTHER) delete r.place;
    if(docId && docId !== target){ saveRecs(docId, recs.filter(x => x.id !== r.id)); recs = recsOf(target).slice(); }
    else if(!docId) recs = recsOf(target).slice();
    const i = recs.findIndex(x => x.id === r.id); if(i >= 0) recs[i] = r; else recs.push(r);
    saveRecs(target, recs, `Deposit ${old ? "updated" : "added"} · ${(pmProp(target) || {}).name || r.place || ""} · ${r.names || ""}${ch.length ? " — " + ch.join(" · ") : ""}`);
    dirty = false; closeSheet(); toast("Saved", true);
  };
  draw(); openPanel();
}
// a rental's deposits (the alerts and the rental page open this)
function dPropSheet(pid){
  const p = pmProp(pid); if(!p) return;
  const R = recsOf(pid), md = mdDep(pid), sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>Deposits · ${esc(p.name)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${md && md.paidC != null ? `MagicDoor: ${usd(md.paidC)} paid${md.names ? " by " + esc(md.names) : ""}` : "Not linked to a MagicDoor lease"}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">${R.length ? R.slice().sort((a, b) => ["future", "held", "moveout", "settled"].indexOf(a.stage) - ["future", "held", "moveout", "settled"].indexOf(b.stage)).map(r => { const s = rState(r);
      return `<div class="dp-pr" data-r="${esc(r.id)}"><div><b>${esc(r.names || "—")}</b><div class="item-s">${esc(STAGE[r.stage] || r.stage)}${r.received ? " · received " + esc(fdateS(r.received)) : ""}${s.due ? ` · return by ${esc(fdateS(s.due))}` : ""}${r.account ? " · " + esc(ACCT[r.account]) : ""}</div></div><div class="r num"><b>${usd(heldC(r))}</b><div class="item-s">of ${usd(C(r.amount))}</div></div></div>`; }).join("")
      : `<p class="muted">No deposits recorded for this rental.</p>`}</div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="dpsClose">Close</button><button class="btn primary" id="dpsAdd">Add a deposit</button></div>`;
  $("#shClose").onclick = $("#dpsClose").onclick = () => closeSheet();
  $("#dpsAdd").onclick = () => dRecordSheet(null, null, {pid, names:md && md.names || "", amount:md && md.paidC ? md.paidC / 100 : null});
  sh.querySelectorAll("[data-r]").forEach(el => el.onclick = () => dRecordSheet(pid, el.dataset.r));
  openPanel();
}

/* the itemized statement South Carolina asks for */
function dNotice(p, r){
  const o = p && p.ownerId ? ownerById(p.ownerId) : null, due = r.moveOut ? plusDays(r.moveOut, dDays()) : "", back = r.refund && r.refund.amount != null && r.refund.amount !== "" ? C(r.refund.amount) : dueBackC(r);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Security deposit — ${esc(p.name)}</title><style>
    body{font:12px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d2420;margin:0} h1{font-size:18px;margin:0 0 4px} .m{color:#5d6863}
    table{width:100%;border-collapse:collapse;margin-top:14px} td{padding:6px 4px;border-bottom:1px solid #e3e6e2} td.r{text-align:right;font-variant-numeric:tabular-nums} tr.t td{border-top:1.5px solid #1d2420;font-weight:700;border-bottom:none}
    .box{margin-top:16px;border:1px solid #e3e6e2;border-radius:6px;padding:10px 12px} .sig{margin-top:36px;width:45%;border-top:1px solid #1d2420;padding-top:4px;color:#5d6863}</style></head><body>
    <h1>Itemized statement of security deposit</h1><div class="m">PHD Properties · ${esc(fdateS(today()))}</div>
    <div class="box"><b>Tenant${/\/|,| and /.test(r.names || "") ? "s" : ""}:</b> ${esc(r.names || "")}<br><b>Rental:</b> ${esc(p.address || p.name)}<br><b>Moved out:</b> ${r.moveOut ? esc(fdateS(r.moveOut)) : "—"}${r.forwarding ? `<br><b>Forwarding address:</b> ${esc(r.forwarding)}` : ""}${o ? `<br><b>Owner:</b> ${esc(ownerLabel(o))}` : ""}</div>
    <table><tr><td>Security deposit held</td><td class="r">${usd(C(r.amount) - petC(r))}</td></tr>
      ${(r.deductions || []).map(x => `<tr><td>Less: ${esc(DED[x.kind] || "Other")}${x.label ? " — " + esc(x.label) : ""}</td><td class="r">−${usd(C(x.amount))}</td></tr>`).join("")}
      <tr class="t"><td>${owesC(r) ? "Balance the tenant still owes" : "Amount returned to the tenant"}</td><td class="r">${usd(owesC(r) || back)}</td></tr></table>
    ${petC(r) ? `<p class="m" style="margin-top:8px">A non-refundable pet fee of ${usd(petC(r))} was paid with the deposit and isn't included above.</p>` : ""}
    ${!owesC(r) && back ? `<p style="margin-top:14px">${r.refund && r.refund.how ? `Returned by ${esc(HOW[r.refund.how] || r.refund.how)}${r.refund.ref ? `, reference ${esc(r.refund.ref)}` : ""}${r.refund.date ? `, on ${esc(fdateS(r.refund.date))}` : ""}.` : "The amount above will be returned to the tenant."}</p>` : ""}
    ${owesC(r) ? `<p style="margin-top:14px">The deductions are more than the deposit. Please pay the balance above to PHD Properties.</p>` : ""}
    <p class="m" style="margin-top:14px">Provided under South Carolina law (S.C. Code § 27-40-410), within ${dDays()} days of the end of the tenancy${due ? ` (by ${esc(fdateS(due))})` : ""}.</p>
    <div class="sig">PHD Properties, property manager</div></body></html>`;
  if(typeof downloadPdf === "function") downloadPdf(html, `Security deposit - ${p.name} - ${(r.names || "tenant").replace(/[\\/:*?"<>|]/g, "-")}.pdf`);
}
function dCsv(all){
  const out = [["Rental", "Tenants", "Received", "Deposit", "Pet fee", "Account", "Stage", "Moved out", "Return due", "Returned", "Kept", "Still held", "Refund date", "Kept moved to operating", "Pet fee paid to owner", "Check", "Needs a look", "Notes"]];
  all.forEach(({r, place, s, held, issues}) => out.push([place, r.names || "", r.received || "", (C(r.amount) / 100).toFixed(2), (petC(r) / 100).toFixed(2), ACCT[r.account || ""], STAGE[r.stage] || r.stage, r.moveOut || "", s.due || "",
    (returnedC(r) / 100).toFixed(2), (keptC(r) / 100).toFixed(2), (held / 100).toFixed(2), (r.refund || {}).date || "", r.keptMoved || (r.keptNa ? "n/a" : ""), r.petPaid || "", CHECK[r.check || ""][0], issues.join("; "), r.notes || ""]));
  download(`Security deposits ${today()}.csv`, toCSV(out));
}

/* ---------- import the workbook's Deposit Ledger tab (saved as CSV) ---------- */
const normA = s => String(s || "").toLowerCase().replace(/\b(unit|suite|apt|#)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\b(street|st|road|rd|drive|dr|avenue|ave|circle|cir|boulevard|blvd|lane|ln|way|court|ct)\b/g, " ").replace(/\s+/g, " ").trim();
function matchProp(place){
  const props = pmState().properties.filter(p => !p.deleted), n = normA(place), toks = n.split(" "), num = toks[0], word = toks[1] || "", unit = toks.length > 2 ? toks[toks.length - 1] : "";
  const cand = props.filter(p => { const t = normA(p.name).split(" "); return t[0] === num && (t[1] || "") === word; });
  if(cand.length === 1 && (!unit || /^\d+$/.test(unit) && unit === num)) return cand[0];
  if(unit){ const u = cand.filter(p => { const t = normA(p.name).split(" "); return t[t.length - 1] === unit; }); if(u.length === 1) return u[0]; }
  return cand.length === 1 ? cand[0] : null;
}
const isoD = s => { s = String(s || "").trim(); if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if(m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; return ""; };
const num = s => { const v = String(s ?? "").replace(/[$,\s]/g, ""); return v === "" || isNaN(Number(v)) ? null : Number(v); };
function dParseLedger(text){
  const rows = brCsvSafe(text); let hi = rows.findIndex(r => r.some(c => /^property$/i.test(String(c).trim())) && r.some(c => /tenant/i.test(c)));
  if(hi < 0) throw new Error("Couldn't find the header row (Property, Tenant(s), Date received, Deposit…)");
  const H = rows[hi].map(c => String(c).trim().toLowerCase()), col = re => H.findIndex(h => re.test(h));
  const ci = {place:col(/^property$/), names:col(/tenant/), rec:col(/date received/), amt:col(/^deposit$/), acct:col(/account/), ret:col(/^returned$/), kept:col(/^kept$/), held:col(/still held/), dret:col(/date returned/), moved:col(/moved to operating/), st:col(/^status$/), notes:col(/^notes$/)};
  const out = [];
  rows.slice(hi + 1).forEach(r => { const place = String(r[ci.place] || "").trim(); if(!place || /^(totals|count:|sd escrow|difference|of which|unexplained)/i.test(place)) return;
    const names = String(r[ci.names] || "").trim(), notes = String(r[ci.notes] || "").trim(), amount = num(r[ci.amt]), ret = num(r[ci.ret]), kept = num(r[ci.kept]), dret = isoD(r[ci.dret]), moved = String(r[ci.moved] || "").trim();
    const acctT = String(r[ci.acct] || "").toLowerCase(), account = /escrow/.test(acctT) && /income/.test(acctT) ? "split" : /escrow/.test(acctT) ? "escrow" : /income/.test(acctT) ? "income" : "";
    const petM = notes.match(/\$([\d,]+(?:\.\d+)?)\s*pet fee/i), stT = String(r[ci.st] || "").toLowerCase();
    const kind = /reserve/i.test(place) ? "reserve" : /unidentified/i.test(place) ? "unidentified" : /portfolio|takeover/i.test(place) ? "other" : "tenant";
    const settled = ret != null || kept != null || !!dret;
    const rec = {id:"imp_" + (typeof brHashSafe === "function" ? brHashSafe([place, names, isoD(r[ci.rec]), amount].join("|")) : uid()), names:names === "(not recorded)" ? "" : names, received:isoD(r[ci.rec]), amount, pet:petM ? num(petM[1]) : null, account, kind,
      stage:settled ? "settled" : "held", settledOn:settled ? dret : "", moveOut:settled ? dret : "", deductions:kept ? [{id:uid(), kind:"other", label:"Kept at move-out (from the tracker)", amount:kept}] : [],
      refund:ret != null ? {amount:ret, date:dret, how:"", ref:""} : {}, keptMoved:/^\d/.test(moved) || /\//.test(moved) ? isoD(moved) : "", keptNa:/^n\/?a$/i.test(moved),
      check:/match/.test(stT) && !/mis/.test(stT) ? "matches" : /mismatch/.test(stT) ? "mismatch" : /missing/.test(stT) ? "missing" : "", notes, src:"Imported from the tracker", heldInFile:num(r[ci.held])};
    const prop = kind === "tenant" ? matchProp(place) : null;
    if(prop && normA(place) !== normA(prop.name)) rec.unitNote = place;     // "120 Smith St, Unit A" on the one "120 Smith St" rental
    out.push({place, rec, prop}); });
  return out;
}
function brCsvSafe(text){ // the same CSV reader Bank reconciliation uses, or a plain one
  if(typeof window.brCsv === "function") return window.brCsv(text);
  const rows = []; let row = [], cur = "", q = false;
  for(let i = 0; i < text.length; i++){ const ch = text[i];
    if(q){ if(ch === '"' && text[i + 1] === '"'){ cur += '"'; i++; } else if(ch === '"') q = false; else cur += ch; }
    else if(ch === '"') q = true; else if(ch === ","){ row.push(cur); cur = ""; } else if(ch === "\n" || ch === "\r"){ if(ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; } else cur += ch; }
  if(cur || row.length){ row.push(cur); rows.push(row); } return rows;
}
function brHashSafe(s){ let h = 2166136261; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function dImportSheet(){
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>Import the deposit tracker</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="help" style="margin-top:0">Open the reconciliation workbook, go to the <b>Deposit Ledger</b> tab and save it as CSV (File → Download → CSV). Each row becomes one deposit, matched to its rental by address. Rows that aren't a console rental (the Reed &amp; Welt reserve, the Judy portfolio, unidentified receipts) are kept under "Other". Running it again skips rows already imported.</p>
      <input type="file" id="diF" accept=".csv,text/csv"><div id="diOut" style="margin-top:12px"></div></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="diCancel">Cancel</button><button class="btn primary" id="diGo" disabled>Import</button></div>`;
  openPanel();
  let parsed = null;
  $("#shClose").onclick = $("#diCancel").onclick = () => closeSheet();
  $("#diF").onchange = async e => { const f = e.target.files[0]; if(!f) return;
    try{ parsed = dParseLedger(await f.text()); }catch(err){ $("#diOut").innerHTML = `<p class="dp-warn">${esc(err.message)}</p>`; return; }
    const have = new Set(dAll().map(x => x.r.id)), fresh = parsed.filter(x => !have.has(x.rec.id)), unm = fresh.filter(x => x.rec.kind === "tenant" && !x.prop);
    const heldSum = parsed.reduce((a, x) => a + heldC(x.rec), 0), fileHeld = parsed.reduce((a, x) => a + C(x.rec.heldInFile), 0);
    $("#diOut").innerHTML = `<p><b>${parsed.length}</b> deposits in the file · <b>${fresh.length}</b> new · ${parsed.length - fresh.length} already here</p>
      <p>Still held: <b>${usd(heldSum)}</b>${Math.abs(heldSum - fileHeld) > 100 ? ` <span class="dp-i">(the file's own column says ${usd(fileHeld)})</span>` : " — same as the file"}</p>
      ${unm.length ? `<p class="dp-warn">${unm.length} row${unm.length === 1 ? "" : "s"} didn't match a console rental and will go under "Other": ${unm.map(x => esc(x.place)).join(", ")}</p>` : ""}
      <p class="help">Rentals that already have deposits here get the imported rows added; rentals with only the old current / future / former fields get the imported rows instead (the old fields are kept on the record).</p>`;
    $("#diGo").disabled = !fresh.length; parsed = fresh; };
  $("#diGo").onclick = () => { if(!parsed || !parsed.length) return;
    const by = {}; parsed.forEach(x => { const id = x.prop ? x.prop.id : OTHER; (by[id] = by[id] || []).push(Object.assign(x.rec, x.prop ? {} : {place:x.place})); });
    Object.entries(by).forEach(([id, add]) => { const d = DEPS()[id], base = d && Array.isArray(d.records) ? d.records.slice() : [];
      add.forEach(r => { delete r.heldInFile; hist(r, "Imported from the tracker"); }); saveRecs(id, base.concat(add)); });
    actLog("deposits", `Deposit tracker imported: ${parsed.length} deposits`, {side:"pm"});
    toast(`${parsed.length} deposits imported`, true); closeSheet(); S.ui.dpF = "all"; render(); };
}

// take over the old page and sheet (the alerts and the rental page call these by name)
pgPmDeposits = pgDeposits;
pmDepositSheet = dPropSheet;
Object.assign(window, {dAll, dTotals, dParseLedger, dRecordSheet, dPropSheet, matchProp, heldC});
})();
