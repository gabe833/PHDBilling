/* =====================================================================
   PROJECT FEE SPLITS — Office → Agents → Project fee splits (admins)
   ---------------------------------------------------------------------
   When an agent brings in a renovation project, they get a share of what
   PHD earns on it. PHD's fees are read straight from the project's invoices
   (the frozen lines each invoice was sent with), and only invoices that have
   been collected count:
     · PHD charges billed at cost (consultation fee …)  — PHD-billed lines
     · PM fee on labor the owner paid directly            — PHD lines with feeFor
     · PM fee on billed expenses / materials               — the invoice's fee
   If an invoice was collected short (a discount or credit taken at payment),
   the shortfall comes off PHD's fees by default — PHD absorbed it.
   The agent's share goes on their next pay run as a confirmed commission
   (kind "commission", linked back by splitId), so it's paid, approved and
   recorded exactly like every other commission. Paid shares are never
   counted twice: what's due is the share less everything already added.

   Storage: Office records (kind "hr", admins only)
     split:<projectId>:<personId>  {projectId, person, pct, count:{phd, labor, materials},
                                    deductShort, note, by, at, history:[…]}
   Nothing here moves money.
   ===================================================================== */
(function(){
if(typeof OF_VIEWS === "undefined" || typeof ofAll !== "function") return;
OF_VIEWS.add("ofSplits"); OF_ADMIN_VIEWS.add("ofSplits");

const PHD = /^phd\b|^phd properties/i;
const C2 = c => usd(Math.round(c));
const splits = () => ofList("split:").sort((a, b) => String(a.projectId).localeCompare(String(b.projectId)));
const projects = () => (S.properties || []).filter(p => p && !p.deleted);
const proj = id => projects().find(p => p.id === id) || null;
const rid = () => Math.random().toString(36).slice(2, 10);
const unitName = (p, uid) => ((p.units || []).find(u => u.id === uid) || {}).name || uid;

/* PHD's fees on one project, invoice by invoice */
function projectFees(p){
  const tx = Object.fromEntries((p.transactions || []).map(t => [t.id, t]));
  const onInv = new Set(), invs = [];
  Object.entries(p.register || {}).forEach(([k, g]) => {
    const f = g && g.frozen; if(!f || !(f.totalC > 0)) return;
    const [uid, n] = k.split("|");
    const row = {key:k, unit:unitName(p, uid), n:+n, ref:/^\d|^[A-Z0-9]+-/.test(String(g.ref || "")) && !/nickel|ach/i.test(g.ref) ? g.ref : (g.nickel && g.nickel.number) || `${unitName(p, uid)} #${n}`,
      totalC:f.totalC, phdC:0, laborC:0, matC:f.feeC || 0, creditC:0, lines:[], paid:!!g.paid, datePaid:g.datePaid || "", sent:g.dateSent || ""};
    (f.lines || []).forEach(l => { const t = tx[l.txnId]; onInv.add(l.txnId); if(!t || !PHD.test(t.vendor || "")) return;
      if(l.expC < 0){ row.creditC += -l.expC; row.lines.push(["credit", t.desc, l.expC]); }
      else if(t.feeFor){ row.laborC += l.expC; row.lines.push(["labor", t.desc, l.expC]); }
      else { row.phdC += l.expC; row.lines.push(["phd", t.desc, l.expC]); } });
    const nk = g.nickel || {};
    row.paidC = typeof nk.paidC === "number" ? nk.paidC : row.paid ? row.totalC : 0;
    row.state = row.paid || (nk.outstandingC === 0 && row.paidC > 0) ? "collected" : row.paidC > 0 ? "partial" : g.dateSent || nk.invoiceId ? "billed" : "draft";
    row.shortC = row.state === "collected" ? Math.max(0, row.totalC - row.paidC) : 0;
    invs.push(row);
  });
  invs.sort((a, b) => (a.sent || a.datePaid || "9").localeCompare(b.sent || b.datePaid || "9") || a.n - b.n || a.unit.localeCompare(b.unit));
  // PHD lines not on any invoice yet (unbilled fees, or credits waiting for the next invoice)
  const loose = (p.transactions || []).filter(t => PHD.test(t.vendor || "") && !onInv.has(t.id) && t.status !== "excluded" && !t.deleted && Number(t.amount));
  return {invs, loose};
}
function splitCalc(sp){
  const p = proj(sp.projectId); if(!p) return null;
  const cnt = Object.assign({phd:true, labor:true, materials:true}, sp.count || {}), F = projectFees(p);
  const fee = r => (cnt.phd ? r.phdC : 0) + (cnt.labor ? r.laborC : 0) + (cnt.materials ? r.matC : 0) - r.creditC;
  const got = F.invs.filter(r => r.state === "collected"), wait = F.invs.filter(r => r.state !== "collected" && r.state !== "draft");
  const t = {phdC:0, laborC:0, matC:0, creditC:0, shortC:0};
  got.forEach(r => { t.phdC += cnt.phd ? r.phdC : 0; t.laborC += cnt.labor ? r.laborC : 0; t.matC += cnt.materials ? r.matC : 0; t.creditC += r.creditC; t.shortC += r.shortC; });
  const poolC = got.reduce((a, r) => a + fee(r), 0) - (sp.deductShort !== false ? t.shortC : 0);
  const pendC = wait.reduce((a, r) => a + fee(r), 0);
  const pct = +sp.pct || 0, shareC = Math.round(poolC * pct / 100), pendShareC = Math.round(pendC * pct / 100);
  const added = ofEntries().filter(e => e.splitId === sp.id && e.status !== "rejected");
  const creditedC = added.reduce((a, e) => a + ofEntryC(e), 0), paidC = added.filter(e => e.status === "paid").reduce((a, e) => a + ofEntryC(e), 0);
  return {p, F, cnt, got, wait, t, poolC, pendC, pct, shareC, pendShareC, added, creditedC, paidC, dueC:shareC - creditedC, fee};
}

/* ---- page ---- */
function pgOfSplits(){
  const v = $("#view");
  actions([["Set up a split", () => splitSheet(null), "primary"]]);
  const L = splits().map(sp => Object.assign({sp}, splitCalc(sp) || {})).filter(x => x.p);
  const due = L.reduce((a, x) => a + Math.max(0, x.dueC), 0), pend = L.reduce((a, x) => a + x.pendShareC, 0), paid = L.reduce((a, x) => a + x.paidC, 0);
  const hero = elm("div", "card pf-hero");
  hero.innerHTML = `<div class="pf-cell"><div class="label">Owed to agents now</div><div class="pf-v">${C2(due)}</div><div class="pf-note">collected, not on a pay run yet</div></div>
    <div class="pf-cell"><div class="label">Waiting on owner payments</div><div class="pf-v">${C2(pend)}</div><div class="pf-note">share of invoices still open</div></div>
    <div class="pf-cell"><div class="label">Paid to agents</div><div class="pf-v g">${C2(paid)}</div><div class="pf-note">through pay runs</div></div>`;
  v.appendChild(hero);
  const c = elm("div", "card");
  c.innerHTML = L.length ? `<div class="tbl-wrap"><table class="tbl of-tbl"><thead><tr><th>Project</th><th>Agent</th><th class="r">PHD fees collected</th><th class="r">Agent share</th><th class="r">Already added</th><th class="r">Due now</th><th></th></tr></thead><tbody>
    ${L.map((x, i) => `<tr data-s="${i}" tabindex="0" style="cursor:pointer"><td><div class="item-t">${esc(x.p.name)}</div><div class="item-s">${x.got.length} of ${x.F.invs.length} invoices collected${x.wait.length ? ` · ${x.wait.length} open` : ""}</div></td>
      <td>${esc((ofPerson(x.sp.person) || {}).name || "—")}<div class="item-s">${x.pct}%</div></td>
      <td class="r num">${C2(x.poolC)}</td><td class="r num">${C2(x.shareC)}${x.pendShareC ? `<div class="item-s">+${C2(x.pendShareC)} when paid</div>` : ""}</td><td class="r num">${C2(x.creditedC)}</td>
      <td class="r num"><b>${C2(Math.max(0, x.dueC))}</b>${x.dueC < 0 ? `<div class="item-s" style="color:var(--red)">over by ${C2(-x.dueC)}</div>` : ""}</td>
      <td class="nw">${x.dueC > 0 ? `<button class="btn sm primary" data-add="${i}">Add to pay run</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><b>No project splits yet</b><p>When an agent brings in a renovation project, set up their split here: pick the project, the agent and their share of PHD's fees. The console works out PHD's fees from the project's collected invoices and puts the agent's share on their next pay run.</p></div>`;
  v.appendChild(c);
  c.querySelectorAll("[data-s]").forEach(tr => tr.onclick = e => { if(e.target.closest("button")) return; splitDetail(L[+tr.dataset.s].sp.id); });
  c.querySelectorAll("[data-add]").forEach(b => b.onclick = () => addToRun(L[+b.dataset.add].sp.id));
}

/* ---- one split, invoice by invoice ---- */
function splitDetail(id){
  const sp = ofAll()[id] ? Object.assign({id}, ofAll()[id]) : null; if(!sp) return;
  const x = splitCalc(sp); if(!x){ toast("That project isn't in the console any more"); return; }
  const who = ofPerson(sp.person) || {name:"—"}, sh = $("#sheet");
  const st = r => ({collected:`<span class="st st-green"><i></i>Collected${r.datePaid ? " " + esc(fdateS(r.datePaid)) : ""}</span>`, partial:`<span class="st st-gold"><i></i>Part paid</span>`, billed:`<span class="st st-gold"><i></i>Waiting on owner</span>`, draft:`<span class="st st-grey"><i></i>Not sent</span>`})[r.state];
  const rows = x.F.invs.filter(r => r.state !== "draft").map(r => `<tr${r.state === "collected" ? "" : ' style="opacity:.6"'}><td><div class="item-t">${esc(r.ref)}</div><div class="item-s">${esc(r.unit)}</div></td><td>${st(r)}</td>
      <td class="r num">${C2(r.totalC)}${r.shortC ? `<div class="item-s" style="color:var(--red)">collected ${C2(r.paidC)}</div>` : ""}</td>
      <td class="r num">${x.cnt.phd ? C2(r.phdC) : "—"}</td><td class="r num">${x.cnt.labor ? C2(r.laborC) : "—"}</td><td class="r num">${x.cnt.materials ? C2(r.matC) : "—"}</td>
      <td class="r num"><b>${C2(x.fee(r) - (r.shortC && sp.deductShort !== false ? r.shortC : 0))}</b>${r.shortC && sp.deductShort !== false ? `<div class="item-s">less ${C2(r.shortC)} short</div>` : ""}</td></tr>`).join("");
  const T = x.t, refs = x.got.map(r => r.ref).join(", ");
  const text = `${x.p.name} — PHD project fees on collected invoices (${refs}):\n`
    + (x.cnt.phd ? `  PHD charges (consultation fee etc.): ${C2(T.phdC)}\n` : "") + (x.cnt.labor ? `  PM fee on labor the owner paid directly: ${C2(T.laborC)}\n` : "") + (x.cnt.materials ? `  PM fee on billed expenses / materials: ${C2(T.matC)}\n` : "")
    + (T.creditC ? `  Less PHD credits on the invoices: −${C2(T.creditC)}\n` : "") + (T.shortC && sp.deductShort !== false ? `  Less collected short (discounts/credits taken at payment): −${C2(T.shortC)}\n` : "")
    + `  PHD fees collected: ${C2(x.poolC)}\n  ${who.name}'s share at ${x.pct}%: ${C2(x.shareC)}\n` + (x.creditedC ? `  Already added to pay: ${C2(x.creditedC)}\n  Due now: ${C2(Math.max(0, x.dueC))}\n` : "")
    + (x.pendShareC ? `  Still to come when open invoices are paid: ${C2(x.pendShareC)}\n` : "");
  sh.innerHTML = `<div class="sheet-h"><div><h3>${esc(x.p.name)} · ${esc(who.name)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${x.pct}% of PHD's fees on collected invoices${sp.note ? " · " + esc(sp.note) : ""}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b">
    <div class="pf-hero card" style="margin-bottom:14px"><div class="pf-cell"><div class="label">PHD fees collected</div><div class="pf-v">${C2(x.poolC)}</div></div><div class="pf-cell"><div class="label">${esc(who.name)}'s share</div><div class="pf-v">${C2(x.shareC)}</div></div><div class="pf-cell"><div class="label">Due now</div><div class="pf-v g">${C2(Math.max(0, x.dueC))}</div></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Status</th><th class="r">Billed</th><th class="r">PHD charges</th><th class="r">Fee on owner-paid labor</th><th class="r">Fee on expenses</th><th class="r">PHD fees</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="muted">No invoices sent on this project yet.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="3"><b>Collected</b></td><td class="r num">${x.cnt.phd ? C2(T.phdC) : "—"}</td><td class="r num">${x.cnt.labor ? C2(T.laborC) : "—"}</td><td class="r num">${x.cnt.materials ? C2(T.matC) : "—"}</td><td class="r num"><b>${C2(x.poolC)}</b></td></tr></tfoot></table></div>
    ${T.shortC ? `<p class="pm-banner" style="margin-top:12px">Collected ${C2(T.shortC)} less than billed (${x.got.filter(r => r.shortC).map(r => `${esc(r.ref)} −${C2(r.shortC)}`).join(", ")}). ${sp.deductShort !== false ? "That comes off PHD's fees here, since PHD absorbed it." : "It isn't taken off PHD's fees for this split."} Change it in Edit split.</p>` : ""}
    ${x.F.loose.filter(t => Number(t.amount) > 0).length ? `<p class="help">PHD fees not invoiced yet: ${x.F.loose.filter(t => Number(t.amount) > 0).map(t => `${esc(t.desc)} ${usd(cents(t.amount))}`).join(" · ")} — they count once invoiced and collected.</p>` : ""}
    ${x.F.loose.filter(t => Number(t.amount) < 0).length ? `<p class="help">PHD credits on the project but not on an invoice: ${x.F.loose.filter(t => Number(t.amount) < 0).map(t => `${esc(t.desc)} ${usd(cents(t.amount))}`).join(" · ")}${T.shortC ? " — the short payment above is likely this credit, so it's already accounted for" : ""}.</p>` : ""}
    <div class="sectl">On pay runs</div>
    ${x.added.length ? ofTable(ofSortE(x.added), {noPerson:true}) : `<p class="muted">Nothing added yet.</p>`}
    <div class="sectl">Breakdown to send</div>
    <textarea id="spTxt" rows="10" style="width:100%;font:12.5px/1.5 ui-monospace,Menlo,monospace" readonly>${esc(text)}</textarea>
  </div>
  <div class="sheet-f"><button class="btn ghost" id="spEd">Edit split</button><button class="btn ghost" id="spCp">Copy breakdown</button><span style="flex:1"></span>${x.dueC > 0 ? `<button class="btn primary" id="spAdd">Add ${C2(x.dueC)} to ${esc(who.name.split(" ")[0])}'s next pay run</button>` : `<button class="btn" id="spCx">Close</button>`}</div>`;
  openPanel(); sh.classList.add("t9-wide"); closeSheet.before = () => sh.classList.remove("t9-wide");
  $("#shClose").onclick = () => closeSheet(); const cx = $("#spCx"); if(cx) cx.onclick = () => closeSheet();
  $("#spEd").onclick = () => splitSheet(id);
  $("#spCp").onclick = async () => { try{ await navigator.clipboard.writeText(text); toast("Breakdown copied"); }catch(e){ const ta = $("#spTxt"); ta.focus(); ta.select(); toast("Select and copy the text"); } };
  const ad = $("#spAdd"); if(ad) ad.onclick = () => addToRun(id);
  ofWireRows(sh);
}

/* ---- put the agent's share on their next pay run ---- */
function addToRun(id){
  const sp = Object.assign({id}, ofAll()[id] || {}), x = splitCalc(sp); if(!x || x.dueC <= 0) return toast("Nothing due on this split");
  const who = ofPerson(sp.person); if(!who) return toast("That agent isn't in People any more");
  const refs = x.got.map(r => r.ref).join(", ");
  if(!confirm(`Add ${C2(x.dueC)} for ${who.name} — ${x.pct}% of PHD's fees on ${x.p.name} (${refs})?\n\nIt goes on their next pay run as a confirmed commission. Nothing is paid until the pay run is approved and sent.`)) return;
  const now = new Date().toISOString();
  ofPut("entry:" + rid(), {person:who.id, email:who.email || "", name:who.name, kind:"commission", date:todayISO(), amountC:x.dueC, dealC:x.poolC, pct:x.pct,
    desc:`${x.p.name} — ${x.pct}% of PHD project fees (${refs})`, address:x.p.name, status:"confirmed", splitId:id, projectId:x.p.id, invoices:x.got.map(r => r.key),
    note:x.creditedC ? `Share ${usd(x.shareC)} less ${usd(x.creditedC)} added before` : "", by:ofWho(), at:now, reviewedBy:ofWho(), reviewedAt:now});
  closeSheet(); render(); toast(`Added to ${who.name}'s next pay run`);
}

/* ---- set up or change a split ---- */
function splitSheet(id){
  $("#sheet").classList.remove("t9-wide");
  const cur = id ? Object.assign({id}, ofAll()[id]) : null, sh = $("#sheet");
  const agents = ofPeople().filter(p => p.active !== false), ps = projects().filter(p => !p.archived || (cur && cur.projectId === p.id));
  const sp = cur || {projectId:"", person:(agents.find(a => a.role === "agent") || {}).id || "", pct:50, count:{phd:true, labor:true, materials:true}, deductShort:true, note:""};
  const cnt = Object.assign({phd:true, labor:true, materials:true}, sp.count || {});
  sh.innerHTML = `<div class="sheet-h"><div><h3>${cur ? "Edit split" : "Set up a project split"}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">An agent's share of what PHD earns on a renovation project</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
  <div class="sheet-b">
    <div class="f2"><label class="fld"><span>Project</span><select id="spP" ${cur ? "disabled" : ""}><option value="">Choose…</option>${ps.map(p => `<option value="${esc(p.id)}" ${p.id === sp.projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <label class="fld"><span>Agent</span><select id="spA" ${cur ? "disabled" : ""}>${agents.map(a => `<option value="${esc(a.id)}" ${a.id === sp.person ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label></div>
    <label class="fld"><span>Agent's share of PHD's fees (%)</span><input type="number" id="spPct" step="0.5" min="0" max="100" value="${esc(sp.pct)}"></label>
    <div class="sectl">Which PHD fees are split</div>
    <label class="check"><input type="checkbox" id="spC1" ${cnt.phd ? "checked" : ""}> PHD charges billed at cost (consultation fee …)</label>
    <label class="check"><input type="checkbox" id="spC2" ${cnt.labor ? "checked" : ""}> PM fee on labor the owner paid directly</label>
    <label class="check"><input type="checkbox" id="spC3" ${cnt.materials ? "checked" : ""}> PM fee on billed expenses / materials</label>
    <label class="check" style="margin-top:8px"><input type="checkbox" id="spSh" ${sp.deductShort !== false ? "checked" : ""}> When an invoice is collected short (a discount or credit), take it off PHD's fees before splitting</label>
    <label class="fld" style="margin-top:8px"><span>Note</span><input type="text" id="spN" value="${esc(sp.note || "")}" placeholder="e.g. 50/50 agreed with Peter"></label>
    ${!agents.some(a => a.role === "agent") ? `<p class="help">Add the agent under People first.</p>` : ""}
    <p class="help" id="spPrev"></p>
  </div>
  <div class="sheet-f">${cur ? `<button class="btn ghost" id="spDel">Delete split</button>` : ""}<span style="flex:1"></span><button class="btn" id="spCx">Cancel</button><button class="btn primary" id="spSv">Save</button></div>`;
  openPanel();
  const read = () => ({projectId:cur ? cur.projectId : $("#spP").value, person:cur ? cur.person : $("#spA").value, pct:+$("#spPct").value || 0,
    count:{phd:$("#spC1").checked, labor:$("#spC2").checked, materials:$("#spC3").checked}, deductShort:$("#spSh").checked, note:$("#spN").value.trim()});
  const prev = () => { const n = read(); if(!n.projectId) { $("#spPrev").textContent = ""; return; } const x = splitCalc(Object.assign({id:"_"}, n)); if(!x) return;
    $("#spPrev").textContent = `PHD fees collected so far: ${C2(x.poolC)} → ${x.pct}% is ${C2(x.shareC)}${x.pendShareC ? `, plus ${C2(x.pendShareC)} when the open invoices are paid` : ""}.`; };
  sh.querySelectorAll("input,select").forEach(n => n.addEventListener("input", prev)); prev();
  $("#shClose").onclick = $("#spCx").onclick = () => closeSheet();
  const dl = $("#spDel"); if(dl) dl.onclick = () => { if(!confirm("Delete this split? Amounts already added to pay stay as they are.")) return; ofPut(id, Object.assign({}, ofAll()[id], {deleted:true})); closeSheet(); render(); };
  $("#spSv").onclick = () => {
    const n = read(); if(!n.projectId) return toast("Pick the project"); if(!n.person) return toast("Pick the agent"); if(!(n.pct > 0 && n.pct <= 100)) return toast("Enter a share between 0 and 100%");
    const key = cur ? cur.id : `split:${n.projectId}:${n.person}`;
    if(!cur && ofAll()[key] && !ofAll()[key].deleted) return toast("That agent already has a split on this project — open it to change it");
    const now = new Date().toISOString(), old = ofAll()[key] && !ofAll()[key].deleted ? ofAll()[key] : null;
    const what = old ? ["pct", "deductShort", "note"].filter(k => JSON.stringify(old[k]) !== JSON.stringify(n[k])).concat(JSON.stringify(old.count) !== JSON.stringify(n.count) ? ["fees counted"] : []).join(", ") : "set up";
    ofPut(key, Object.assign({}, old || {}, n, {by:(old && old.by) || ofWho(), at:(old && old.at) || now, history:((old && old.history) || []).concat([{at:now, by:ofWho(), what:what || "saved"}]).slice(-30)}));
    closeSheet(); render(); splitDetail(key);
  };
}

/* ---- wiring into the Office side ---- */
const nav0 = renderNav;
renderNav = function(){
  nav0.apply(this, arguments);
  if(S.ui.mode !== "office" || !ofIsAdmin()) return;
  const n = $("#nav"), comm = [...n.querySelectorAll("button")].find(b => /Commissions/.test(b.textContent)); if(!comm) return;
  const due = splits().reduce((a, sp) => { const x = splitCalc(Object.assign({}, sp)); return a + (x && x.dueC > 0 ? 1 : 0); }, 0);
  const b = elm("button", null, `${icon("receipt")}<span>Project fee splits</span>${due ? `<i class="badge">${due}</i>` : ""}`);
  b.setAttribute("aria-current", S.ui.view === "ofSplits"); b.onclick = () => go("ofSplits");
  comm.after(b);
};
const render0 = render;
render = function(){
  if(S.ui.mode !== "office" || S.ui.view !== "ofSplits") return render0.apply(this, arguments);
  ofLoadAdmin(); renderModeSwitch(); renderNav();
  if(OF.admin != null && !ofCanSee("ofSplits")){ S.ui.view = "ofMe"; return render0.apply(this, arguments); }
  document.body.classList.add("mode-office"); document.body.classList.remove("mode-pm");
  $("#pgCrumb").textContent = "Office · Agents"; $("#pgTitle").textContent = "Project fee splits"; $("#pgSub").textContent = "Agents' share of PHD's fees on the renovation projects they brought in";
  $("#pgActions").innerHTML = "";
  const v = $("#view"); v.innerHTML = "";
  if(typeof Cloud !== "undefined" && Cloud.ready && OF.admin == null) v.appendChild(elm("div", "card", `<div class="empty"><p class="muted">Loading…</p></div>`));
  else pgOfSplits();
  if(typeof chip === "function") chip();
  const mn = $("#mName"); if(mn){ mn.textContent = "Project fee splits"; const ms = $("#mSub"); if(ms) ms.textContent = "Office"; }
};
if(typeof cloudLabel === "function"){ const l0 = cloudLabel; cloudLabel = function(kind, id){ if(kind === "hr" && /^split:/.test(id)) return "a project split"; return l0.apply(this, arguments); }; }
Object.assign(window, {projectFees, splitCalc, pgOfSplits, splitSheet, splitDetail, splitAddToRun:addToRun});
})();
