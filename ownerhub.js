/* =====================================================================
   OWNER RELATIONSHIP HUB
   ---------------------------------------------------------------------
   Adds to the existing owner page on the Rentals side (it doesn't
   replace it): how the relationship is doing, a timeline built from the
   console's own records (payouts, statements, invoices, holds, money
   being won back, tasks) — read where they live, never copied — plus a
   log of calls, emails and meetings, and the owner's documents (stored
   as links to Drive with a type and an end date; nothing is uploaded
   from here). One record per owner: shared doc "oh:<owner id>".
   ===================================================================== */
(function(){
if(typeof render !== "function") return;

const OH = () => { S.ownerHub = S.ownerHub && typeof S.ownerHub === "object" ? S.ownerHub : {}; return S.ownerHub; };
const ohRec = id => { const H = OH(); H[id] = H[id] || {id, log:[], docs:[]}; H[id].log = H[id].log || []; H[id].docs = H[id].docs || []; return H[id]; };
const ohPeek = id => OH()[id] || {log:[], docs:[]};
const me = () => (typeof Cloud !== "undefined" && Cloud.email) || "";
const whoS = e => { const s = ((typeof Cloud !== "undefined" && Cloud.staff) || []).find(x => x.email === e); return (s && s.name) || String(e || "").split("@")[0] || "—"; };
const OH_KIND = {call:"Call", email:"Email", meeting:"Meeting", text:"Text", note:"Note"};
const OH_DOC = {agreement:"Management agreement", w9:"W-9", insurance:"Insurance", id:"ID / entity papers", bank:"Bank letter", other:"Other"};
const ohDay = x => { const s = String(x || ""); if(s.length <= 10) return s; const d = new Date(s); return isNaN(d) ? s.slice(0, 10) : d.toLocaleDateString("en-CA"); };
const ohDays = d => Math.round((Date.parse(todayISO() + "T12:00:00") - Date.parse(String(d).slice(0, 10) + "T12:00:00")) / 864e5);

/* ---------- what the console already knows about this owner ---------- */
function ohTimeline(o){
  const pids = new Set(ownerPmProps(o).map(p => p.id)), ev = [], P2 = pmState(), pn = id => (pmProp(id) || {}).name || "a rental";
  Object.values(P2.rows).forEach(r => { if(!pids.has(r.propertyId)) return;
    const po = r.paidOut;
    if(po && po.date) ev.push({d:po.sentAt ? ohDay(po.sentAt) : String(po.date).slice(0, 10), k:"payout", t:`Payout ${po.scheduled || po.pending ? "sent" : "paid"} · ${usd(cents(po.amount || 0))}`, s:`${pn(r.propertyId)} · ${monthLabel(r.month)}${po.method ? " · " + po.method : ""}${po.batch && po.batch.name ? " · " + po.batch.name : ""}`, pid:r.propertyId, m:r.month}); });
  // owner statements emailed (the last 8 months)
  if(typeof stmtCandidates === "function"){ let m = pmCurrentMonth(); for(let i = 0; i < 8; i++, m = PMCore.monthAdd(m, -1)){ try{
    const seen = new Set();
    stmtCandidates(m).filter(c => pids.has(c.p.id) && c.done && c.done.state === "sent").forEach(c => { const k = m + String(c.done.sentAt || c.done.at); if(seen.has(k)) return; seen.add(k);
      ev.push({d:ohDay(c.done.sentAt || c.done.at) || m + "-28", k:"statement", t:`${monthLabel(m)} statement emailed`, s:c.p.name}); });
  }catch(e){} } }
  (typeof invList === "function" ? invList() : []).filter(x => x.ownerId === o.id && x.status !== "void").forEach(x => { const t = invTotals(x);
    ev.push({d:String(x.sentAt || x.date || x.createdAt || "").slice(0, 10), k:"invoice", t:`Invoice ${x.no || ""} · ${usd(t.totalC)}`, s:typeof invStatus === "function" ? invStatus(x).label : x.status}); });
  ((S.fin || {}).holds || []).filter(h => (h.propIds || []).some(id => pids.has(id))).forEach(h => ev.push({d:String(h.at || h.from || "").slice(0, 10), k:"hold", t:`Payout hold: ${h.title || "held"}`, s:h.status === "active" ? "Active" : "Released"}));
  ((S.recov || {}).items || []).filter(it => pids.has(it.pid)).forEach(it => ev.push({d:String(it.at || it.month + "-15").slice(0, 10), k:"recovery", t:`Winning back a double payout · ${usd(it.amountC)}`, s:`${pn(it.pid)} · ${typeof rvLeftC === "function" ? usd(rvLeftC(it)) + " left" : ""}`}));
  if(typeof tkFor === "function"){ const ts = tkFor("owner", o.id).concat(...[...pids].map(id => tkFor("pm", id)));
    ts.forEach(t => ev.push({d:ohDay(t.doneAt || t.createdAt), k:"task", t:`Task ${t.status === "done" ? "done" : "opened"}: ${t.title}`, s:whoS(t.assignee), task:t.id})); }
  ohPeek(o.id).log.forEach(l => ev.push({d:l.date, k:"log", t:`${OH_KIND[l.kind] || "Note"}${l.subject ? ": " + l.subject : ""}`, s:`${whoS(l.by)}${l.text ? " — " + String(l.text).slice(0, 140) : ""}`, log:l.id}));
  return ev.filter(e => e.d).sort((a, b) => b.d.localeCompare(a.d));
}
/* how the relationship is doing — every item says why */
function ohHealth(o){
  const out = [], pids = ownerPmProps(o).map(p => p.id), P2 = pmState(), H = ohPeek(o.id);
  if(!o.email) out.push(["red", "No email on file — statements can't go out"]);
  try{ const pe = typeof poPayee === "function" ? poPayee(o.id) : null; if(pe && !pe.id) out.push(["gold", "Not a payee in Nickel yet"]); else if(pe && !(pe.payout || []).some(m => String(m.type || "").toUpperCase() !== "CHECK")) out.push(["gold", "No bank account in Nickel — payouts can't be sent"]); }catch(e){}
  const m = pmCurrentMonth(), pm1 = PMCore.monthAdd(m, -1);
  [pm1, m].forEach(mm => pids.forEach(pid => { const r = P2.rows[mm + "|" + pid]; if(!r || r.paidOut) return; try{ const c = pmCalc(r, pmProp(pid)); if(c.payoutC < 0) out.push(["red", `Owes ${usd(-c.payoutC)} on ${pmProp(pid).name} · ${monthLabel(mm)}`]); }catch(e){} }));
  const holds = ((S.fin || {}).holds || []).filter(h => h.status === "active" && (h.propIds || []).some(id => pids.includes(id)));
  if(holds.length) out.push(["gold", `${holds.length} payout hold${holds.length === 1 ? "" : "s"} active`]);
  const inv = (typeof invList === "function" ? invList() : []).filter(x => x.ownerId === o.id && x.status === "sent" && invTotals(x).dueC > 0);
  if(inv.length) out.push([inv.some(x => x.due && x.due < todayISO()) ? "red" : "gold", `${inv.length} owner invoice${inv.length === 1 ? "" : "s"} unpaid · ${usd(inv.reduce((a, x) => a + invTotals(x).dueC, 0))}`]);
  const rec = ((S.recov || {}).items || []).filter(it => pids.includes(it.pid) && typeof rvLeftC === "function" && rvLeftC(it) > 0);
  if(rec.length) out.push(["gold", `Double payout still being won back · ${usd(rec.reduce((a, it) => a + rvLeftC(it), 0))}`]);
  if(typeof tkFor === "function"){ const late = tkFor("owner", o.id).concat(...pids.map(id => tkFor("pm", id))).filter(t => t.status !== "done" && t.due && t.due < todayISO()); if(late.length) out.push(["red", `${late.length} late task${late.length === 1 ? "" : "s"}`]); }
  const last = H.log.map(l => l.date).sort().pop();
  if(!last) out.push(["grey", "No calls, emails or meetings logged yet"]); else if(ohDays(last) > 90) out.push(["gold", `Last contact logged ${ohDays(last)} days ago`]);
  H.docs.forEach(d => { if(d.expires){ const n = -ohDays(d.expires); if(n < 0) out.push(["red", `${OH_DOC[d.type] || "Document"} ended ${fdateS(d.expires)}`]); else if(n <= 45) out.push(["gold", `${OH_DOC[d.type] || "Document"} ends ${fdateS(d.expires)}`]); } });
  if(!H.docs.some(d => d.type === "agreement")) out.push(["grey", "No management agreement on file here"]);
  return out;
}

/* ---------- the cards ---------- */
function ohCards(v, o){
  const H = ohPeek(o.id), hl = ohHealth(o), tl = ohTimeline(o), ui = S.ui;
  const score = hl.filter(x => x[0] === "red").length ? ["red", "Needs attention"] : hl.filter(x => x[0] === "gold").length ? ["gold", "A few things to follow up"] : ["green", "In good shape"];
  const c = elm("div", "card oh-health");
  c.innerHTML = `<div class="card-h"><h3>Relationship</h3><span class="tag ${score[0]}" style="margin-left:10px">${score[1]}</span>
      <span style="margin-left:auto;display:flex;gap:8px"><button class="btn sm" data-ohlog>Log a call or email</button>${typeof tkSheet === "function" ? `<button class="btn sm ghost" data-ohtask>New task</button>` : ""}</span></div>
    <div class="oh-hl">${hl.length ? hl.map(([cls, t]) => `<div class="oh-h ${cls}"><span class="oh-dot"></span>${esc(t)}</div>`).join("") : `<div class="oh-h green"><span class="oh-dot"></span>Nothing to follow up</div>`}</div>`;
  v.appendChild(c);
  c.querySelector("[data-ohlog]").onclick = () => ohLogSheet(o, null);
  const nt = c.querySelector("[data-ohtask]"); if(nt) nt.onclick = () => tkSheet(null, {link:{t:"owner", id:o.id, label:ownerLabel(o)}});

  const grid = elm("div", "oh-grid");
  // timeline
  const kinds = {payout:"Payouts", statement:"Statements", invoice:"Invoices", log:"Calls & notes", task:"Tasks", hold:"Holds", recovery:"Double payouts"};
  const f = ui.ohF || "", shown = tl.filter(e => !f || e.k === f), lim = ui.ohMore ? 200 : 25;
  const t = elm("div", "card");
  t.innerHTML = `<div class="card-h"><h3>Timeline</h3><select id="ohF" style="margin-left:auto;width:auto"><option value="">Everything · ${tl.length}</option>${Object.entries(kinds).map(([k, l]) => { const n = tl.filter(e => e.k === k).length; return n ? `<option value="${k}" ${f === k ? "selected" : ""}>${l} · ${n}</option>` : ""; }).join("")}</select></div>
    <div class="oh-tl">${shown.slice(0, lim).map(e => `<div class="oh-ev k-${e.k}" ${e.log ? `data-ohl="${esc(e.log)}"` : e.task ? `data-oht="${esc(e.task)}"` : e.pid ? `data-ohp="${esc(e.pid)}" data-ohm="${esc(e.m)}"` : ""}><div class="oh-d">${esc(fdateS(e.d))}</div><div><b>${esc(e.t)}</b>${e.s ? `<div class="sub">${esc(e.s)}</div>` : ""}</div></div>`).join("") || `<p class="muted" style="padding:0 16px">Nothing yet.</p>`}
    ${shown.length > lim ? `<a href="#" id="ohMore" class="oh-more">Show all ${shown.length}</a>` : ""}</div>`;
  grid.appendChild(t);
  // documents
  const d = elm("div", "card");
  d.innerHTML = `<div class="card-h"><h3>Documents</h3><button class="btn sm" data-ohdoc style="margin-left:auto">Add a document</button></div>
    ${H.docs.length ? `<div class="oh-docs">${H.docs.slice().sort((a, b) => String(a.type).localeCompare(b.type)).map(x => { const n = x.expires ? -ohDays(x.expires) : null;
      return `<div class="oh-doc"><div><b>${esc(OH_DOC[x.type] || "Document")}</b>${x.name ? ` · ${esc(x.name)}` : ""}<div class="sub">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">Open</a> · ` : ""}${x.signed ? "signed " + esc(fdateS(x.signed)) + " · " : ""}${x.expires ? `<span class="${n < 0 ? "tk-late" : n <= 45 ? "oh-soon" : ""}">${n < 0 ? "ended" : "ends"} ${esc(fdateS(x.expires))}</span> · ` : ""}added by ${esc(whoS(x.by))}</div></div><a href="#" data-ohdx="${esc(x.id)}" class="muted" style="font-size:12px">edit</a></div>`; }).join("")}</div>`
      : `<p class="help" style="padding:0 16px 14px">Keep the management agreement, W-9 and insurance here as links to where they're stored (Drive), with the date each one ends.</p>`}`;
  grid.appendChild(d);
  v.appendChild(grid);
  t.querySelector("#ohF").onchange = e => { ui.ohF = e.target.value; render(); };
  const mo = t.querySelector("#ohMore"); if(mo) mo.onclick = e => { e.preventDefault(); ui.ohMore = true; render(); };
  t.querySelectorAll("[data-ohl]").forEach(x => x.onclick = () => ohLogSheet(o, x.dataset.ohl));
  t.querySelectorAll("[data-oht]").forEach(x => x.onclick = () => tkSheet(x.dataset.oht));
  t.querySelectorAll("[data-ohp]").forEach(x => x.onclick = () => { S.ui.pmPropId = x.dataset.ohp; S.ui.pmPropM = x.dataset.ohm; go("pmProperty"); });
  d.querySelector("[data-ohdoc]").onclick = () => ohDocSheet(o, null);
  d.querySelectorAll("[data-ohdx]").forEach(x => x.onclick = e => { e.preventDefault(); ohDocSheet(o, x.dataset.ohdx); });
}
function ohLogSheet(o, id){
  const cur = id ? ohPeek(o.id).log.find(l => l.id === id) : null, l = cur ? Object.assign({}, cur) : {id:"l" + uid(), kind:"call", date:todayISO(), subject:"", text:"", followUp:""};
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>${cur ? "Contact log" : "Log a call or email"}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(ownerLabel(o))}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="f2"><label class="fld"><span>What</span><select id="ohK">${Object.entries(OH_KIND).map(([k, v]) => `<option value="${k}" ${k === l.kind ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="fld"><span>When</span><input type="date" id="ohD" value="${esc(l.date)}"></label></div>
      <label class="fld"><span>About</span><input type="text" id="ohS" maxlength="160" value="${esc(l.subject || "")}" placeholder="e.g. October payout timing"></label>
      <label class="fld"><span>What was said</span><textarea id="ohT" rows="5" maxlength="4000">${esc(l.text || "")}</textarea></label>
      ${!cur && typeof tkSheet === "function" ? `<label class="fld"><span>Follow-up task (optional)</span><input type="text" id="ohFu" maxlength="200" placeholder="e.g. Send the updated statement"></label><label class="fld"><span>Follow up by</span><input type="date" id="ohFd"></label>` : ""}
      ${cur ? `<p class="help">Logged by ${esc(whoS(cur.by))} · ${esc(fdateS(String(cur.at).slice(0, 10)))}${cur.editedAt ? ` · edited by ${esc(whoS(cur.editedBy))} ${esc(fdateS(String(cur.editedAt).slice(0, 10)))}` : ""}</p>` : ""}
      <p class="help">Kept with this owner for the team. Don't put bank or tax numbers here.</p>
    </div>
    <div class="sheet-f">${cur ? `<button class="btn ghost sm" id="ohDel">Delete</button>` : ""}<span style="flex:1"></span><button class="btn" id="ohCancel">Cancel</button><button class="btn primary" id="ohOk">Save</button></div>`;
  openPanel();
  $("#shClose").onclick = $("#ohCancel").onclick = () => closeSheet();
  const del = $("#ohDel"); if(del) del.onclick = () => { if(!confirm("Delete this entry?")) return; snapshot(); const R = ohRec(o.id); R.log = R.log.filter(x => x.id !== l.id); commit(); actLog("owners", `Contact log entry deleted · ${ownerLabel(o)}`, {side:"pm"}); closeSheet(); };
  $("#ohOk").onclick = () => {
    const nl = Object.assign(l, {kind:$("#ohK").value, date:$("#ohD").value || todayISO(), subject:$("#ohS").value.trim(), text:$("#ohT").value.trim()});
    if(!nl.subject && !nl.text) return toast("Say what it was about");
    snapshot(); const R = ohRec(o.id);
    if(cur){ nl.editedAt = new Date().toISOString(); nl.editedBy = me(); R.log = R.log.map(x => x.id === nl.id ? nl : x); }
    else { nl.at = new Date().toISOString(); nl.by = me(); R.log = R.log.concat([nl]).slice(-500); }
    const fu = $("#ohFu") && $("#ohFu").value.trim();
    if(fu && typeof tkNew === "function"){ const t = tkNew({title:fu, due:($("#ohFd") || {}).value || "", link:{t:"owner", id:o.id, label:ownerLabel(o)}, desc:`From the ${OH_KIND[nl.kind].toLowerCase()} on ${fdateS(nl.date)}${nl.subject ? ": " + nl.subject : ""}`}); S.tasks = S.tasks || {}; S.tasks[t.id] = t; }
    commit(); actLog("owners", `${OH_KIND[nl.kind]} logged · ${ownerLabel(o)}${nl.subject ? " — " + nl.subject : ""}`, {side:"pm"}); toast("Saved", true); closeSheet();
  };
}
function ohDocSheet(o, id){
  const cur = id ? ohPeek(o.id).docs.find(x => x.id === id) : null, d = cur ? Object.assign({}, cur) : {id:"d" + uid(), type:"agreement", name:"", url:"", signed:"", expires:""};
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>${cur ? "Document" : "Add a document"}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(ownerLabel(o))}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <label class="fld"><span>Type</span><select id="odT">${Object.entries(OH_DOC).map(([k, v]) => `<option value="${k}" ${k === d.type ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="fld"><span>Name</span><input type="text" id="odN" maxlength="160" value="${esc(d.name)}" placeholder="e.g. 2026 agreement — 432 Coopers Hawk"></label>
      <label class="fld"><span>Link (Google Drive)</span><input type="url" id="odU" value="${esc(d.url)}" placeholder="https://drive.google.com/…"></label>
      <div class="f2"><label class="fld"><span>Signed or dated</span><input type="date" id="odS" value="${esc(d.signed || "")}"></label><label class="fld"><span>Ends</span><input type="date" id="odE" value="${esc(d.expires || "")}"></label></div>
      <p class="help">Only the link is kept here, not the file — it opens with whoever's Drive access. Tax ID numbers stay in the file, never in the console.</p>
    </div>
    <div class="sheet-f">${cur ? `<button class="btn ghost sm" id="odDel">Remove</button>` : ""}<span style="flex:1"></span><button class="btn" id="odCancel">Cancel</button><button class="btn primary" id="odOk">Save</button></div>`;
  openPanel();
  $("#shClose").onclick = $("#odCancel").onclick = () => closeSheet();
  const del = $("#odDel"); if(del) del.onclick = () => { if(!confirm("Remove this document from the owner's page? The file itself isn't touched.")) return; snapshot(); const R = ohRec(o.id); R.docs = R.docs.filter(x => x.id !== d.id); commit(); actLog("owners", `Document removed · ${ownerLabel(o)} · ${OH_DOC[d.type]}`, {side:"pm"}); closeSheet(); };
  $("#odOk").onclick = () => {
    const url = $("#odU").value.trim();
    if(url && !/^https:\/\//i.test(url)) return toast("The link has to start with https://");
    Object.assign(d, {type:$("#odT").value, name:$("#odN").value.trim(), url, signed:$("#odS").value, expires:$("#odE").value});
    snapshot(); const R = ohRec(o.id);
    if(cur){ d.editedAt = new Date().toISOString(); d.editedBy = me(); R.docs = R.docs.map(x => x.id === d.id ? d : x); }
    else { d.at = new Date().toISOString(); d.by = me(); R.docs = R.docs.concat([d]); }
    commit(); actLog("owners", `Document ${cur ? "updated" : "added"} · ${ownerLabel(o)} · ${OH_DOC[d.type]}`, {side:"pm"}); toast("Saved", true); closeSheet();
  };
}

/* ---------- wiring ---------- */
if(typeof cloudDocs === "function"){ const d0 = cloudDocs; cloudDocs = function(){ const out = d0.apply(this, arguments); Object.entries(OH()).forEach(([id, r]) => { if(r && ((r.log || []).length || (r.docs || []).length)) out.set("shared/oh:" + id, r); }); return out; }; }
if(typeof cloudApply === "function"){ const a0 = cloudApply; cloudApply = function(kind, id, data, deleted){ if(kind === "shared" && /^oh:/.test(id)){ const k = id.slice(3); if(deleted) delete OH()[k]; else OH()[k] = data; return; } return a0.apply(this, arguments); }; }
if(typeof cloudLabel === "function"){ const l0 = cloudLabel; cloudLabel = function(kind, id){ if(kind === "shared" && /^oh:/.test(id)){ const o = ownerById(id.slice(3)); return "owner notes" + (o ? " · " + ownerLabel(o) : ""); } return l0.apply(this, arguments); }; }
if(typeof pgOwnerDetail === "function"){ const po = pgOwnerDetail; pgOwnerDetail = function(o){ const r = po.apply(this, arguments);
  try{ if(o && S.ui.mode === "pm" && ownerPmProps(o).length){
    const v = $("#view"), tmp = document.createElement("div"); ohCards(tmp, o);
    // relationship and timeline go under the owner's rentals, above the contact details
    let at = [...v.children].find(c => /Managed properties/.test(((c.querySelector(".card-h h3") || {}).textContent) || ""));
    [...tmp.children].forEach(ch => { if(at){ at.after(ch); at = ch; } else v.appendChild(ch); });
  } }catch(e){ console.error(e); }
  return r; }; }
Object.assign(window, {ohTimeline, ohHealth, ohLogSheet, ohDocSheet});
})();
