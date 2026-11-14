/* =====================================================================
   DISTRIBUTION CONTROL — owner payouts
   ---------------------------------------------------------------------
   Adds to the existing Owner payouts page (it doesn't replace it):
     · Approval, a step of its own, separate from the statement being
       reviewed or sent and from Nickel's status. Approvals are written by
       the payments function into storage only it can change; when the
       rule "approval required" is on, the function refuses to send
       anything not approved at its current amount and payee(s), however
       it's called. Changing the amount or payee undoes the approval.
     · A check list before sending: already paid, already in Nickel,
       held, month warnings, more than the month took in, payee bank,
       approval, and money in the account.
     · Named batches, recorded on each payout.
     · Bank settlement, from Bank reconciliation's imported bank lines.
   Nothing here sends money: sending is still the Send button and
   Nickel's own confirmation for each batch.
   ===================================================================== */
(function(){
if(typeof render !== "function") return;

const DC = window.DC = {data:null, at:0, busy:false, err:"", months:""};
async function dcLoad(months, force){
  const key = months.slice().sort().join(",");
  if(DC.busy || (!force && DC.data && DC.months === key && Date.now() - DC.at < 90000)) return DC.data;
  if(typeof nickelOn === "function" && !nickelOn()) return null;
  DC.busy = true;
  try{ DC.data = await payCall("po.approvals", {months}, {noSave:true}); DC.err = DC.data && DC.data.error ? DC.data.error : ""; DC.months = key; }
  catch(e){ DC.err = e.message; }
  DC.busy = false; DC.at = Date.now();
  if(S.ui.view === "payouts") render();
  return DC.data;
}
const dcPol = () => (DC.data && DC.data.policy) || {require:false, twoPerson:false};
const dcKey = x => x.split ? "split:" + (x.split.key || x.split.name) : x.p.id;
const dcPids = x => x.split ? x.rows.map(r => r.p.id) : [x.p.id];
const dcPayees = x => x.split ? x.shares.filter(sh => sh.amountC > 0).map(sh => sh.vendorId).filter(Boolean)
  : [(typeof poPayeeFor === "function" ? poPayeeFor(x) : {}).id].filter(Boolean);
const dcLabel = x => x.split ? `${x.split.name} (${x.rows.length} properties)` : `${ownerLabel(x.o)} · ${x.p.name}`;
const dcRec = x => (((DC.data || {}).approvals || {})[x.m] || {})[dcKey(x)] || null;
// {k: approved | stale | revoked | none, why}
function dcStatus(x){
  const r = dcRec(x);
  if(!r) return {k:"none", why:"Not approved yet"};
  if(r.status === "revoked") return {k:"revoked", r, why:`Approval taken back by ${r.revokedBy} · ${fdateS(String(r.revokedAt).slice(0, 10))}${r.why ? " — " + r.why : ""}`};
  if(Math.round(r.amountC) !== Math.round(x.amountC)) return {k:"stale", r, why:`Approved at ${usd(r.amountC)} — it's ${usd(x.amountC)} now, approve it again`};
  const a = (r.payees || []).slice().sort().join(","), b = dcPayees(x).slice().sort().join(",");
  if(a !== b) return {k:"stale", r, why:"The payee changed since it was approved — approve it again"};
  if(dcPol().twoPerson && String(r.by).toLowerCase() === String((DC.data || {}).me || "").toLowerCase()) return {k:"approved", r, self:true, why:`Approved by you — with the two-person rule someone else has to send it`};
  return {k:"approved", r, why:`Approved by ${r.by} · ${fdateS(String(r.at).slice(0, 10))}${r.note ? " — " + r.note : ""}`};
}
function dcChip(x){
  if(!DC.data) return "";
  const s = dcStatus(x), cls = s.k === "approved" ? "green" : s.k === "stale" || s.k === "revoked" ? "gold" : "grey";
  const txt = s.k === "approved" ? "✓ Approved" : s.k === "stale" ? "Approval out of date" : s.k === "revoked" ? "Approval taken back" : "Not approved";
  return `<span class="tag ${cls} dc-chip" title="${esc(s.why)}">${txt}</span>`;
}
// what the month took in — the same cap the payments function applies
function dcTookInC(row){
  const plus = (row.adjustments || []).reduce((a, x) => a + Math.max(0, cents(x.amount) || 0), 0);
  return cents(row.rentReceived || 0) + cents(row.otherIncome || 0) + plus;
}
/* the check list for one payout → [{lv: block|warn|ok, t}] ; "block" stops it being picked */
function dcChecks(x){
  const out = [], rows = x.split ? x.rows : [x];
  rows.forEach(r => {
    const nm = x.split ? r.p.name + ": " : "";
    if(r.row.paidOut) out.push({lv:"block", t:`${nm}already recorded as paid${r.row.paidOut.date ? " " + fdateS(r.row.paidOut.date) : ""}`});
    if(r.s && r.s.hold) out.push({lv:"block", t:`${nm}on hold — ${(r.s.hold.title || "held")}`});
    if(r.amountC > dcTookInC(r.row) + 100) out.push({lv:"block", t:`${nm}${usd(r.amountC)} is more than the month took in (${usd(dcTookInC(r.row))})`});
    const bills = ((typeof NKOB !== "undefined" && NKOB.data && NKOB.data.bills) || []).filter(b => b.month === x.m && (b.pids || []).includes(r.p.id));
    bills.forEach(b => { if(b.status === "paid" || b.status === "pending" || b.status === "scheduled") out.push({lv:"block", t:`${nm}Nickel already shows ${b.ref} ${usd(b.amountC)} as ${b.status === "paid" ? "paid" : "on its way"} — possible duplicate`});
      else if(b.status === "unpaid") out.push({lv:"warn", t:`${nm}Nickel has an unpaid bill ${b.ref} ${usd(b.amountC)} — it'll be reused${b.amountC !== (x.split ? null : x.amountC) && !x.split ? " and brought up to " + usd(x.amountC) : ""}`}); });
    if(r.row.nkOpen && !bills.length) out.push({lv:"warn", t:`${nm}a Nickel bill was started ${fdateS(String(r.row.nkOpen.at).slice(0, 10))} (${r.row.nkOpen.ref}) and never finished`});
    const c = (r.s && r.s.c) || null;
    (c && c.flags || []).filter(f => f.level === "warn").slice(0, 3).forEach(f => out.push({lv:"warn", t:nm + f.text}));
    if(r.via === "magicdoor") out.push({lv:"warn", t:`${nm}set to be paid by MagicDoor`});
  });
  if(!(x.amountC > 0)) out.push({lv:"block", t:"Nothing to pay"});
  const st = dcStatus(x);
  // approval is required and the approvals couldn't be read: hold everything back rather than guess (the server checks too)
  if(DC.data && dcPol().require && st.k !== "approved") out.push({lv:"block", appr:true, t:st.why});
  else if(DC.data && dcPol().require && st.self) out.push({lv:"block", appr:true, t:st.why});
  return out;
}
const dcBlocked = (x, noAppr) => dcChecks(x).some(c => c.lv === "block" && !(noAppr && c.appr));

/* "Before you send" — sits above the send bar */
function dcCard(v, m, ready, chosen, picked){
  dcLoad([m]);
  const pol = dcPol(), D = DC.data || {}, c = elm("div", "card dc-card");
  const totC = picked.reduce((a, x) => a + x.amountC, 0);
  // approval itself is summed up in the header, not listed payout by payout
  const issues = ready.map(x => ({x, cs:dcChecks(x).filter(c => !c.appr)})).filter(r => r.cs.length);
  const blocked = issues.filter(r => r.cs.some(c => c.lv === "block")), warned = issues.filter(r => !r.cs.some(c => c.lv === "block"));
  const appr = ready.filter(x => dcStatus(x).k === "approved").length;
  const balC = typeof NKBAL !== "undefined" ? NKBAL.c : null;
  const fund = balC == null ? {lv:"warn", t:"Couldn't read the rental income account balance from Nickel"} : totC > balC ? {lv:"block", t:`The picked payouts (${usd(totC)}) are more than the rental income account holds (${usd(balC)})`} : {lv:"ok", t:`The account holds ${usd(balC)} — ${usd(balC - totC)} left after these`};
  const toApprove = chosen.filter(x => dcStatus(x).k !== "approved");
  c.innerHTML = `<div class="card-h"><h3>Before you send</h3>
      <span class="muted" style="margin-left:auto;font-size:12.5px">${DC.err ? `Approvals couldn't load: ${esc(DC.err)}` : !DC.data ? "Loading approvals…" : `Approval ${pol.require ? "<b>required</b>" : "optional"}${pol.twoPerson ? " · two people" : ""} · ${appr} of ${ready.length} approved`}${D.canPay ? ` · <a href="#" id="dcRules">Approval rules</a>` : ""}</span></div>
    <div class="dc-b">
      <div class="dc-sum">
        <div class="dc-k ${fund.lv}"><span>Money in the account</span><b>${esc(fund.t)}</b></div>
        <div class="dc-k ${!DC.data ? "" : appr === ready.length ? "ok" : pol.require ? "block" : "warn"}"><span>Approved</span><b>${DC.data ? `${appr} of ${ready.length}${pol.require && appr < ready.length ? " — the rest can't be sent yet" : ""}` : "…"}</b></div>
        <div class="dc-k ${blocked.length ? "block" : "ok"}"><span>Can't send</span><b>${blocked.length ? `${blocked.length} payout${blocked.length === 1 ? "" : "s"} held back` : "Nothing blocked"}</b></div>
        <div class="dc-k ${warned.length ? "warn" : "ok"}"><span>Worth a look</span><b>${warned.length ? `${warned.length} payout${warned.length === 1 ? "" : "s"}` : "Nothing flagged"}</b></div>
      </div>
      ${issues.length ? `<div class="dc-list">${issues.map(r => `<div class="dc-it"><div><b>${esc(dcLabel(r.x))}</b> <span class="num muted">${usd(r.x.amountC)}</span></div>${r.cs.map(c => `<div class="dc-c ${c.lv}">${c.lv === "block" ? "✕" : "!"} ${esc(c.t)}</div>`).join("")}</div>`).join("")}</div>` : ""}
      ${D.canApprove ? `<div class="dc-act">${toApprove.length ? `<button class="btn sm" id="dcAppr">Approve ${toApprove.length} picked · ${usd(toApprove.reduce((a, x) => a + x.amountC, 0))}</button>` : chosen.length ? `<span class="muted">Every picked payout is approved at its current amount.</span>` : ""}
        ${chosen.some(x => dcStatus(x).k === "approved") ? `<button class="btn sm ghost" id="dcUnappr">Take back approval…</button>` : ""}</div>`
        : DC.data ? `<p class="help" style="margin:8px 0 0">Approvers: ${esc((D.approvers || []).join(", ") || "the payments list")}.</p>` : ""}
    </div>`;
  v.appendChild(c);
  const ap = c.querySelector("#dcAppr"); if(ap) ap.onclick = () => dcApprove(m, toApprove);
  const un = c.querySelector("#dcUnappr"); if(un) un.onclick = () => dcUnapprove(m, chosen.filter(x => dcStatus(x).k === "approved"));
  const ru = c.querySelector("#dcRules"); if(ru) ru.onclick = e => { e.preventDefault(); dcRulesSheet(); };
}
async function dcApprove(m, list){
  if(!list.length) return;
  const blocked = list.filter(x => dcBlocked(x, true));
  if(blocked.length && !confirm(`${blocked.length} of these can't be sent right now (see "Before you send"). Approve them anyway?`)) return;
  const note = prompt(`Approve ${list.length} owner payout${list.length === 1 ? "" : "s"} — ${usd(list.reduce((a, x) => a + x.amountC, 0))}?\n\n${list.slice(0, 20).map(x => `· ${dcLabel(x)} — ${usd(x.amountC)}`).join("\n")}${list.length > 20 ? `\n…and ${list.length - 20} more` : ""}\n\nThis doesn't send anything. A note (optional):`, "");
  if(note === null) return;
  try{
    const r = await payCall("po.approve", {month:m, note, items:list.map(x => ({key:dcKey(x), amountC:x.amountC, payees:dcPayees(x), pids:dcPids(x), label:dcLabel(x)}))}, {noSave:true});
    if(r && r.error) throw new Error(r.error);
    actLog("finance", `Owner payouts approved (${monthLabel(m)}): ${list.length} · ${usd(list.reduce((a, x) => a + x.amountC, 0))}${note ? " — " + note : ""}`, {side:"pm"});
    toast(`${(r.done || []).length} approved`, true);
  }catch(e){ toast(e.message); }
  await dcLoad([m], true);
}
async function dcUnapprove(m, list){
  if(!list.length) return;
  const why = prompt(`Take back the approval for ${list.length} payout${list.length === 1 ? "" : "s"}?\n\n${list.slice(0, 20).map(x => `· ${dcLabel(x)} — ${usd(x.amountC)}`).join("\n")}\n\nWhy?`, "");
  if(!why) return;
  try{ const r = await payCall("po.unapprove", {month:m, why, items:list.map(x => ({key:dcKey(x)}))}, {noSave:true}); if(r && r.error) throw new Error(r.error);
    actLog("finance", `Owner payout approval taken back (${monthLabel(m)}): ${list.map(dcLabel).join("; ")} — ${why}`, {side:"pm"}); toast("Approval taken back", true); }
  catch(e){ toast(e.message); }
  await dcLoad([m], true);
}
function dcRulesSheet(){
  const D = DC.data || {}, pol = dcPol(), sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>Approval rules</h3><div class="muted" style="font-size:12.5px;margin-top:3px">Checked by the payments function on every send, not just on this page</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <label class="dc-opt"><input type="checkbox" id="dcReq" ${pol.require ? "checked" : ""}> <span><b>Approval required before sending</b><br><span class="muted">A payout has to be approved at its current amount and payee. Changing either undoes the approval.</span></span></label>
      <label class="dc-opt"><input type="checkbox" id="dcTwo" ${pol.twoPerson ? "checked" : ""}> <span><b>Two people</b><br><span class="muted">Whoever approves a payout can't be the one who sends it.</span></span></label>
      <label class="fld"><span>Approvers (emails, comma-separated — empty means the payments list: ${esc(((typeof PAY !== "undefined" && PAY.status && PAY.status.nickel && PAY.status.nickel.payers) || []).join(", ") || "—")})</span><input type="text" id="dcAps" value="${esc((D.approvers || []).join(", "))}"></label>
      <label class="fld"><span>Why the change (kept with the history)</span><input type="text" id="dcWhy"></label>
      ${(pol.history || []).length ? `<div class="sectl" style="margin-top:12px">History</div><div class="dc-hist">${pol.history.slice().reverse().map(h => `<div>${esc(fdateS(String(h.at).slice(0, 10)))} · ${esc(h.by)} — ${h.require ? "required" : "optional"}${h.twoPerson ? ", two people" : ""}${h.why ? ` · ${esc(h.why)}` : ""}</div>`).join("")}</div>` : ""}
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn primary" id="dcSave">Save rules</button></div>`;
  openPanel();
  $("#shClose").onclick = () => closeSheet();
  $("#dcSave").onclick = async () => {
    const body = {require:$("#dcReq").checked, twoPerson:$("#dcTwo").checked, approvers:$("#dcAps").value.split(/[,;\s]+/).filter(Boolean), why:$("#dcWhy").value.trim()};
    try{ const r = await payCall("po.policy", body, {noSave:true}); if(r && r.error) throw new Error(r.error);
      actLog("finance", `Owner payout approval rules: ${body.require ? "approval required" : "approval optional"}${body.twoPerson ? ", two people" : ""}${body.why ? " — " + body.why : ""}`, {side:"pm"});
      toast("Approval rules saved", true); closeSheet(); }
    catch(e){ toast(e.message); }
    await dcLoad([S.ui.poMonth || pmCurrentMonth()], true);
  };
}
// the bank line a sent payout settled on (Bank reconciliation's imported lines), if any
function dcSettle(po){
  if(!po || typeof window.brFindRef !== "function") return null;
  const refs = [po.ref, ...((po.group || {}).refs || [])].filter(Boolean);
  return window.brFindRef(refs);
}
function dcDoneTag(x){
  const po = x.row && x.row.paidOut; if(!po) return "";
  const bits = [];
  if(po.batch && po.batch.name) bits.push(`<span class="tag grey" title="Batch">${esc(po.batch.name)}</span>`);
  if(po.approved) bits.push(`<span class="tag green" title="${esc("Approved by " + po.approved.by + " · " + fdateS(String(po.approved.at).slice(0, 10)))}">✓ Approved</span>`);
  const st = dcSettle(po);
  if(st) bits.push(st.reversed ? `<span class="tag red" title="${esc(st.why || "")}">Cancelled in the bank</span>` : `<span class="tag green" title="${esc(st.desc || "")}">Settled ${esc(fdateS(st.date))}${st.amtC != null && !po.group && Math.abs(-st.amtC - cents(po.amount || 0)) > 1 ? ` · bank ${usd(-st.amtC)}` : ""}</span>`);
  else if(po.by === "Nickel" && typeof window.brFindRef === "function") bits.push(`<span class="tag grey" title="Not in the imported bank lines yet — import Nickel's CSV in Bank reconciliation">Not in the bank yet</span>`);
  return bits.join(" ");
}
const dcBatchDefault = m => `${monthLabel(m)} payouts · ${new Date().toLocaleDateString("en-US", {month:"short", day:"numeric"})}`;

Object.assign(window, {dcLoad, dcStatus, dcChip, dcChecks, dcBlocked, dcCard, dcDoneTag, dcBatchDefault, dcKey, dcPayees});
})();
