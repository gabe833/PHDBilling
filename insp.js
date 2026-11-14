/* =====================================================================
   INSPECTIONS & PROPERTY CONDITION
   ---------------------------------------------------------------------
   Move-in, move-out, routine and drive-by inspections, room by room,
   built to be filled in on a phone. Each item gets a condition, a note
   and photos. A photo goes to Drive (Inspections / <rental> / <date>
   <kind>, through the receipt inbox script, version 18 or later) and a
   small preview is kept with the inspection so the report and the
   move-in / move-out comparison work without opening Drive.
   Findings become tasks. The report downloads as a PDF.
   One record per inspection: shared doc "insp:<id>".
   CompanyCam isn't connected to the console: photos are taken here.
   ===================================================================== */
(function(){
if(typeof render !== "function") return;

const IN_KIND = {move_in:"Move-in", move_out:"Move-out", routine:"Routine", annual:"Annual", drive_by:"Drive-by"};
const IN_COND = {good:["Good", "green"], fair:["Fair", "gold"], poor:["Poor", "red"], damaged:["Damaged", "red"], na:["N/A", "grey"]};
const IN_RANK = {good:0, fair:1, poor:2, damaged:3};
const IN_TPL = {
  standard:{name:"Standard rental", rooms:[
    ["Entry & halls", ["Front door & locks", "Floors", "Walls & ceiling", "Lights & switches", "Smoke detector"]],
    ["Living room", ["Floors", "Walls & ceiling", "Windows & blinds", "Lights & outlets", "Ceiling fan"]],
    ["Kitchen", ["Cabinets & counters", "Sink & faucet", "Refrigerator", "Range & oven", "Dishwasher", "Microwave / hood", "Floors", "Walls & ceiling"]],
    ["Bathroom", ["Toilet", "Sink & vanity", "Tub / shower", "Exhaust fan", "Floors", "Walls & ceiling", "Mirror & fixtures"]],
    ["Bedroom", ["Floors", "Walls & ceiling", "Closet & doors", "Windows & blinds", "Lights & outlets", "Smoke detector"]],
    ["Laundry", ["Washer", "Dryer & vent", "Floors"]],
    ["Systems", ["HVAC & thermostat", "Air filter", "Water heater", "Electrical panel", "CO detector"]],
    ["Exterior", ["Roof & gutters", "Siding & paint", "Yard & landscaping", "Driveway & walks", "Deck / porch", "Exterior lights"]]]},
  condo:{name:"Condo / apartment", rooms:[
    ["Entry", ["Front door & locks", "Floors", "Walls & ceiling", "Smoke detector"]],
    ["Living & dining", ["Floors", "Walls & ceiling", "Windows & blinds", "Lights & outlets", "Balcony"]],
    ["Kitchen", ["Cabinets & counters", "Sink & faucet", "Refrigerator", "Range & oven", "Dishwasher", "Microwave / hood", "Floors"]],
    ["Bathroom", ["Toilet", "Sink & vanity", "Tub / shower", "Exhaust fan", "Floors"]],
    ["Bedroom", ["Floors", "Walls & ceiling", "Closet & doors", "Windows & blinds", "Smoke detector"]],
    ["Systems", ["HVAC & thermostat", "Air filter", "Water heater", "Washer / dryer"]]]},
  drive_by:{name:"Drive-by", rooms:[["Exterior", ["Roof & gutters", "Siding & paint", "Yard & landscaping", "Driveway & walks", "Trash & debris", "Signs of occupancy"]]]}
};
const INS = () => { S.insp = S.insp && typeof S.insp === "object" ? S.insp : {}; return S.insp; };
const live = () => Object.values(INS()).filter(x => x && !x.deleted);
const me = () => (typeof Cloud !== "undefined" && Cloud.email) || "";
const whoS = e => { const s = ((typeof Cloud !== "undefined" && Cloud.staff) || []).find(x => x.email === e); return (s && s.name) || String(e || "").split("@")[0] || "—"; };
const pname = id => ((typeof pmProp === "function" && pmProp(id)) || {}).name || "Rental";
const inLabel = x => `${IN_KIND[x.kind] || "Inspection"} · ${pname(x.pid)} · ${fdateS(x.date)}`;
function inHist(x, what){ x.history = (x.history || []).concat([{at:new Date().toISOString(), by:me(), what}]).slice(-80); x.updatedAt = new Date().toISOString(); x.updatedBy = me(); }
function inNew(pid, kind, tpl){
  const T = IN_TPL[tpl] || IN_TPL[kind === "drive_by" ? "drive_by" : "standard"];
  const x = {id:"in" + uid() + uid(), pid, kind, date:todayISO(), inspector:me(), tenant:"", status:"draft", tpl:tpl || (kind === "drive_by" ? "drive_by" : "standard"), summary:"",
    rooms:T.rooms.map(([name, items]) => ({id:"r" + uid(), name, items:items.map(n => ({id:"i" + uid(), name:n, cond:"", note:"", photos:[]}))})), createdAt:new Date().toISOString(), createdBy:me(), history:[]};
  inHist(x, "Started"); return x;
}
const inItems = x => (x.rooms || []).flatMap(r => (r.items || []).map(it => ({r, it})));
const inFindings = x => inItems(x).filter(({it}) => it.cond === "poor" || it.cond === "damaged");
const inProgress = x => { const all = inItems(x); return {done:all.filter(({it}) => it.cond).length, all:all.length}; };
// the move-in this move-out is compared with: the latest move-in for the same rental before it
const inBaseline = x => x.kind !== "move_out" ? null : live().filter(y => y.pid === x.pid && y.kind === "move_in" && y.date <= x.date && y.id !== x.id).sort((a, b) => b.date.localeCompare(a.date))[0] || null;
function inCompare(out, base){
  if(!base) return [];
  const key = (r, it) => (r.name + "|" + it.name).toLowerCase(), B = new Map(inItems(base).map(({r, it}) => [key(r, it), {r, it}]));
  return inItems(out).map(({r, it}) => { const b = B.get(key(r, it)); if(!b || !it.cond || !b.it.cond || it.cond === "na" || b.it.cond === "na") return null;
    const d = (IN_RANK[it.cond] ?? 0) - (IN_RANK[b.it.cond] ?? 0); return d > 0 ? {r, it, was:b.it, d} : null; }).filter(Boolean);
}

/* ---------- photos ---------- */
async function inThumb(file){
  const img = await new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Couldn't read that photo")); }; i.src = u; });
  const k = Math.min(1, 220 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.62);
}
async function inPhotoAdd(x, r, it, file){
  const mime = String(file.type || "").toLowerCase();
  if(!/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error("Take or pick a JPG or PNG photo");
  const nPh = inItems(x).reduce((a, y) => a + (y.it.photos || []).length, 0); if(nPh >= 120) throw new Error("This inspection already has 120 photos");
  const thumb = await inThumb(file), ph = {id:"ph" + uid(), thumb, at:new Date().toISOString(), by:me(), caption:`${r.name} · ${it.name}`};
  // the full photo goes to Drive; if the script can't take it, the preview is still kept and the photo is marked as not in Drive
  try{
    const sm = typeof shrinkPhoto === "function" ? await shrinkPhoto(file, mime) : {file, mime};
    const res = typeof inboxPost === "function" ? await inboxPost({action:"inspPhoto", property:pname(x.pid), folder:`${x.date} ${IN_KIND[x.kind]}`, name:`${r.name} - ${it.name} - ${ph.id}.jpg`, caption:ph.caption, mime:sm.mime || mime, data:await buBase64(sm.file || file), by:me()}) : null;
    if(res && res.ok && res.file){ ph.url = res.file.url; ph.fileId = res.file.id; x.folderUrl = res.file.folderUrl; }
    else ph.driveErr = (res && res.error) || "The receipt inbox script didn't take it (needs version 18)";
  }catch(e){ ph.driveErr = e.message; }
  return ph;
}

/* ---------- the page ---------- */
function pgInspections(){
  const id = S.ui.inspId && INS()[S.ui.inspId] ? S.ui.inspId : null;
  if(id) return inEdit(INS()[id]);
  $("#pgCrumb").textContent = "Rentals"; $("#pgTitle").textContent = "Inspections";
  const all = live().sort((a, b) => b.date.localeCompare(a.date)), v = $("#view");
  const props = pmState().properties.filter(p => !p.deleted && p.status !== "inactive").sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  $("#pgSub").textContent = `${all.filter(x => x.status === "draft").length} in progress · ${all.filter(x => x.status === "done").length} finished · photos kept in Drive`;
  actions([["New inspection", () => inStartSheet(null), "primary"]]);
  // rentals with no inspection in the last 12 months
  const yr = new Date(); yr.setFullYear(yr.getFullYear() - 1); const cut = yr.toISOString().slice(0, 10);
  const stale = props.filter(p => p.status === "active" && !all.some(x => x.pid === p.id && x.status === "done" && x.date >= cut));
  const c = elm("div", "card");
  c.innerHTML = `${all.length ? `<div class="tbl-wrap"><table class="tbl in-tbl"><thead><tr><th>Inspection</th><th>Rental</th><th>By</th><th>Progress</th><th>Findings</th><th>Status</th></tr></thead><tbody>${all.map(x => { const pr = inProgress(x), f = inFindings(x).length;
      return `<tr data-in="${esc(x.id)}" class="tk-r"><td><b>${esc(IN_KIND[x.kind])}</b><div class="sub">${esc(fdateS(x.date))}${x.tenant ? " · " + esc(x.tenant) : ""}</div></td><td>${esc(pname(x.pid))}</td><td>${esc(whoS(x.inspector))}</td>
        <td>${pr.done}/${pr.all}</td><td>${f ? `<span class="tag red">${f}</span>` : `<span class="muted">—</span>`}</td><td><span class="tag ${x.status === "done" ? "green" : "gold"}">${x.status === "done" ? "Finished" : "In progress"}</span></td></tr>`; }).join("")}</tbody></table></div>`
    : `<div class="empty"><b>No inspections yet</b><p>Start one with New inspection — it works on a phone, room by room.</p></div>`}`;
  v.appendChild(c);
  c.querySelectorAll("[data-in]").forEach(r => r.onclick = () => { S.ui.inspId = r.dataset.in; render(); });
  if(stale.length){ const s = elm("div", "card"); s.innerHTML = `<div class="card-h"><h3>Not inspected in the last 12 months · ${stale.length}</h3></div><div class="in-stale">${stale.map(p => `<a href="#" data-ip="${esc(p.id)}">${esc(p.name)}</a>`).join("")}</div>`; v.appendChild(s);
    s.querySelectorAll("[data-ip]").forEach(a => a.onclick = e => { e.preventDefault(); inStartSheet(a.dataset.ip); }); }
}
function inStartSheet(pid){
  const props = pmState().properties.filter(p => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>New inspection</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <label class="fld"><span>Rental</span><select id="inP">${props.map(p => `<option value="${esc(p.id)}" ${p.id === pid ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <div class="f2"><label class="fld"><span>Kind</span><select id="inK">${Object.entries(IN_KIND).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
        <label class="fld"><span>Rooms to check</span><select id="inT">${Object.entries(IN_TPL).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join("")}</select></label></div>
      <p class="help">You can add or remove rooms and items as you go.</p>
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="inCancel">Cancel</button><button class="btn primary" id="inGo">Start</button></div>`;
  openPanel();
  $("#inK").onchange = () => { if($("#inK").value === "drive_by") $("#inT").value = "drive_by"; };
  $("#shClose").onclick = $("#inCancel").onclick = () => closeSheet();
  $("#inGo").onclick = () => { const x = inNew($("#inP").value, $("#inK").value, $("#inT").value);
    snapshot(); INS()[x.id] = x; commit(); actLog("rentals", `Inspection started · ${inLabel(x)}`, {side:"pm", pid:x.pid}); closeSheet(); S.ui.inspId = x.id; go("inspections"); };
}
function inEdit(x){
  $("#pgCrumb").textContent = "Rentals · Inspections"; $("#pgTitle").textContent = `${IN_KIND[x.kind]} inspection`;
  const pr = inProgress(x), F = inFindings(x), base = inBaseline(x), cmp = inCompare(x, base), ro = x.status === "done";
  $("#pgSub").textContent = `${pname(x.pid)} · ${fdateS(x.date)} · ${pr.done} of ${pr.all} checked${F.length ? ` · ${F.length} finding${F.length === 1 ? "" : "s"}` : ""}${x.status === "done" ? " · finished" : ""}`;
  actions([["All inspections", () => { S.ui.inspId = null; render(); }, "ghost"], ["Download PDF", () => inPdf(x)], ro ? ["Reopen", () => { const why = prompt("Reopen this finished inspection? Why?", ""); if(!why) return; snapshot(); x.status = "draft"; inHist(x, "Reopened — " + why); commit(); }, "ghost"] : ["Finish", () => inFinish(x), "primary"]]);
  const v = $("#view"), save = what => { snapshot(); if(what) inHist(x, what); commit(); };
  const head = elm("div", "card in-head");
  head.innerHTML = `<div class="in-hf">
      <label class="fld"><span>Date</span><input type="date" id="ihD" value="${esc(x.date)}" ${ro ? "disabled" : ""}></label>
      <label class="fld"><span>Inspector</span><input type="text" id="ihI" value="${esc(whoS(x.inspector))}" disabled></label>
      <label class="fld"><span>Tenant present / name</span><input type="text" id="ihT" maxlength="120" value="${esc(x.tenant || "")}" ${ro ? "disabled" : ""}></label>
    </div>
    <label class="fld" style="padding:0 16px"><span>Summary</span><textarea id="ihS" rows="2" maxlength="3000" ${ro ? "disabled" : ""}>${esc(x.summary || "")}</textarea></label>
    <div class="in-prog"><div style="width:${pr.all ? Math.round(pr.done / pr.all * 100) : 0}%"></div></div>
    ${x.folderUrl ? `<p class="help" style="padding:0 16px 10px"><a href="${esc(x.folderUrl)}" target="_blank" rel="noopener">Photos in Drive</a></p>` : ""}`;
  v.appendChild(head);
  if(!ro){ head.querySelector("#ihD").onchange = e => { x.date = e.target.value || x.date; save("Date " + x.date); };
    head.querySelector("#ihT").onchange = e => { x.tenant = e.target.value.trim(); save(); };
    head.querySelector("#ihS").onchange = e => { x.summary = e.target.value; save(); }; }
  if(x.kind === "move_out"){
    const c = elm("div", "card");
    c.innerHTML = `<div class="card-h"><h3>Compared with move-in</h3><span class="muted" style="margin-left:auto;font-size:12.5px">${base ? `<a href="#" id="inBase">${esc(fdateS(base.date))} move-in</a>` : "No move-in inspection for this rental"}</span></div>
      ${base ? (cmp.length ? `<div class="in-cmp">${cmp.map(d => `<div class="in-cr"><div><b>${esc(d.r.name)} · ${esc(d.it.name)}</b><div class="sub">${IN_COND[d.was.cond][0]} at move-in → <span class="tk-late">${IN_COND[d.it.cond][0]}</span>${d.it.note ? " — " + esc(d.it.note) : ""}</div></div>
        <div class="in-pair">${(d.was.photos || []).slice(0, 2).map(p => `<img src="${p.thumb}" alt="" title="Move-in">`).join("")}<span>→</span>${(d.it.photos || []).slice(0, 2).map(p => `<img src="${p.thumb}" alt="" title="Move-out">`).join("")}</div></div>`).join("")}</div>`
        : `<p class="help" style="padding:0 16px 12px">Nothing is worse than at move-in${pr.done < pr.all ? " so far" : ""}.</p>`) : `<p class="help" style="padding:0 16px 12px">With a move-in inspection on file, anything worse at move-out is listed here with both photos — useful for the deposit.</p>`}`;
    v.appendChild(c);
    const bl = c.querySelector("#inBase"); if(bl) bl.onclick = e => { e.preventDefault(); S.ui.inspId = base.id; render(); };
  }
  const open = S.ui.inRoom || (x.rooms[0] || {}).id;
  x.rooms.forEach((r, ri) => {
    const done = r.items.filter(it => it.cond).length, bad = r.items.filter(it => it.cond === "poor" || it.cond === "damaged").length, isOpen = open === r.id;
    const c = elm("div", "card in-room" + (isOpen ? " open" : ""));
    c.innerHTML = `<div class="card-h in-rh" data-rt="${esc(r.id)}"><h3>${esc(r.name)}</h3><span class="muted" style="margin-left:10px;font-size:12.5px">${done}/${r.items.length}${bad ? ` · <span class="tk-late">${bad} finding${bad === 1 ? "" : "s"}</span>` : ""}</span><span style="margin-left:auto" class="muted">${isOpen ? "▾" : "▸"}</span></div>
      ${isOpen ? `<div class="in-items">${r.items.map((it, ii) => `<div class="in-it" data-it="${ii}">
          <div class="in-itn"><b>${esc(it.name)}</b>${!ro ? ` <a href="#" data-itx="${ii}" class="muted" style="font-size:11.5px">remove</a>` : ""}</div>
          <div class="in-cond">${Object.entries(IN_COND).map(([k, l]) => `<button type="button" data-c="${k}" class="${it.cond === k ? "on " + l[1] : ""}" ${ro ? "disabled" : ""}>${l[0]}</button>`).join("")}</div>
          <input type="text" class="in-note" data-n="${ii}" maxlength="500" placeholder="Note" value="${esc(it.note || "")}" ${ro ? "disabled" : ""}>
          <div class="in-ph">${(it.photos || []).map(p => `<a ${p.url ? `href="${esc(p.url)}" target="_blank" rel="noopener"` : ""} title="${esc(p.driveErr ? "Not in Drive: " + p.driveErr : "Open in Drive")}" class="${p.driveErr ? "nd" : ""}"><img src="${p.thumb}" alt=""></a>`).join("")}
            ${!ro ? `<label class="in-add">📷<input type="file" accept="image/*" capture="environment" data-ph="${ii}"></label>` : ""}</div>
          ${(it.cond === "poor" || it.cond === "damaged") && typeof tkSheet === "function" ? `<div>${it.task ? `<a href="#" data-tko="${ii}" class="in-task">Task: ${esc(((S.tasks || {})[it.task] || {}).title || "open")}</a>` : `<button type="button" class="btn sm ghost" data-tkn="${ii}">Make a task</button>`}</div>` : ""}
        </div>`).join("")}
        ${!ro ? `<div class="in-addit"><input type="text" placeholder="Add an item to ${esc(r.name)} and press Enter" data-addit="1"> <a href="#" data-rx="1" class="muted" style="font-size:12px">remove room</a></div>` : ""}</div>` : ""}`;
    v.appendChild(c);
    c.querySelector("[data-rt]").onclick = () => { S.ui.inRoom = isOpen ? "-" : r.id; render(); };
    if(!isOpen) return;
    c.querySelectorAll(".in-it").forEach(el => { const it = r.items[+el.dataset.it];
      el.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { if(ro) return; const was = it.cond; it.cond = it.cond === b.dataset.c ? "" : b.dataset.c; save(`${r.name} · ${it.name}: ${was ? IN_COND[was][0] : "—"} → ${it.cond ? IN_COND[it.cond][0] : "—"}`); });
      const n = el.querySelector("[data-n]"); if(n) n.onchange = () => { it.note = n.value.trim(); save(); };
      const ph = el.querySelector("[data-ph]"); if(ph) ph.onchange = async () => { const f = ph.files && ph.files[0]; if(!f) return; toast("Saving the photo…");
        try{ const p = await inPhotoAdd(x, r, it, f); snapshot(); it.photos = (it.photos || []).concat([p]); inHist(x, `Photo · ${r.name} · ${it.name}`); commit(); toast(p.driveErr ? `Kept here, but not in Drive: ${p.driveErr}` : "Photo saved to Drive", !p.driveErr); }catch(e){ toast(e.message); } };
      const tn = el.querySelector("[data-tkn]"); if(tn) tn.onclick = () => { const t = tkNew({title:`${pname(x.pid)}: ${it.name} (${r.name}) — ${IN_COND[it.cond][0].toLowerCase()}`, desc:`From the ${IN_KIND[x.kind].toLowerCase()} inspection on ${fdateS(x.date)}.${it.note ? "\n" + it.note : ""}`, priority:it.cond === "damaged" ? "high" : "normal", link:{t:"pm", id:x.pid, label:pname(x.pid)}});
        snapshot(); S.tasks = S.tasks || {}; S.tasks[t.id] = t; it.task = t.id; inHist(x, `Task made · ${r.name} · ${it.name}`); commit(); toast("Task made", true); };
      const to = el.querySelector("[data-tko]"); if(to) to.onclick = e => { e.preventDefault(); tkSheet(it.task); };
      const rx = el.querySelector("[data-itx]"); if(rx) rx.onclick = e => { e.preventDefault(); if((it.photos || []).length && !confirm(`Remove ${it.name}? Its photos stay in Drive.`)) return; r.items.splice(+el.dataset.it, 1); save(`Removed ${r.name} · ${it.name}`); };
    });
    const ai = c.querySelector("[data-addit]"); if(ai) ai.onkeydown = e => { if(e.key === "Enter" && ai.value.trim()){ r.items.push({id:"i" + uid(), name:ai.value.trim().slice(0, 80), cond:"", note:"", photos:[]}); save(`Added ${r.name} · ${ai.value.trim()}`); } };
    const rx = c.querySelector("[data-rx]"); if(rx) rx.onclick = e => { e.preventDefault(); if(!confirm(`Remove the whole ${r.name}?`)) return; x.rooms.splice(ri, 1); save(`Removed room ${r.name}`); };
  });
  if(!ro){ const a = elm("div", "card in-addroom"); a.innerHTML = `<div class="card-b"><input type="text" placeholder="Add a room (e.g. Bedroom 2) and press Enter" id="inAddR"></div>`; v.appendChild(a);
    a.querySelector("#inAddR").onkeydown = e => { const t = e.target.value.trim(); if(e.key !== "Enter" || !t) return;
      const like = Object.values(IN_TPL).flatMap(T => T.rooms).find(([n]) => t.toLowerCase().startsWith(n.toLowerCase().split(" ")[0]));
      const r = {id:"r" + uid(), name:t.slice(0, 60), items:(like ? like[1] : ["Floors", "Walls & ceiling"]).map(n => ({id:"i" + uid(), name:n, cond:"", note:"", photos:[]}))};
      x.rooms.push(r); S.ui.inRoom = r.id; save(`Added room ${r.name}`); }; }
  const h = elm("div", "card"); h.innerHTML = `<details class="tk-h" style="padding:12px 16px"><summary>History · ${(x.history || []).length}</summary>${(x.history || []).slice().reverse().map(e => `<div>${esc(fdateS(String(e.at).slice(0, 10)))} ${esc(String(e.at).slice(11, 16))} · ${esc(whoS(e.by))} — ${esc(e.what)}</div>`).join("")}</details>
    ${!ro ? `<div style="padding:0 16px 12px"><a href="#" id="inDel" class="muted" style="font-size:12.5px">Delete this inspection</a></div>` : ""}`; v.appendChild(h);
  const dl = h.querySelector("#inDel"); if(dl) dl.onclick = e => { e.preventDefault(); if(!confirm("Delete this inspection? Its photos stay in Drive.")) return; snapshot(); delete INS()[x.id]; commit(); actLog("rentals", `Inspection deleted · ${inLabel(x)}`, {side:"pm", pid:x.pid}); S.ui.inspId = null; render(); };
}
function inFinish(x){
  const pr = inProgress(x), F = inFindings(x), open = F.filter(({it}) => !it.task);
  if(pr.done < pr.all && !confirm(`${pr.all - pr.done} item${pr.all - pr.done === 1 ? " isn't" : "s aren't"} checked yet. Finish anyway?`)) return;
  const mk = open.length && typeof tkNew === "function" && confirm(`Make a task for ${open.length === 1 ? "the finding" : `each of the ${open.length} findings`} that doesn't have one?`);
  snapshot();
  if(mk) open.forEach(({r, it}) => { const t = tkNew({title:`${pname(x.pid)}: ${it.name} (${r.name}) — ${IN_COND[it.cond][0].toLowerCase()}`, desc:`From the ${IN_KIND[x.kind].toLowerCase()} inspection on ${fdateS(x.date)}.${it.note ? "\n" + it.note : ""}`, priority:it.cond === "damaged" ? "high" : "normal", link:{t:"pm", id:x.pid, label:pname(x.pid)}}); S.tasks = S.tasks || {}; S.tasks[t.id] = t; it.task = t.id; });
  x.status = "done"; x.doneAt = new Date().toISOString(); x.doneBy = me(); inHist(x, `Finished · ${F.length} finding${F.length === 1 ? "" : "s"}${mk ? `, ${open.length} task${open.length === 1 ? "" : "s"} made` : ""}`);
  commit(); actLog("rentals", `Inspection finished · ${inLabel(x)} · ${F.length} finding${F.length === 1 ? "" : "s"}`, {side:"pm", pid:x.pid}); toast("Finished", true);
}
function inPdf(x){
  const base = inBaseline(x), cmp = inCompare(x, base), F = inFindings(x), p = pmProp(x.pid) || {};
  const row = (r, it) => `<tr><td>${esc(it.name)}</td><td class="c ${it.cond}">${it.cond ? IN_COND[it.cond][0] : "—"}</td><td>${esc(it.note || "")}${(it.photos || []).length ? `<div class="ph">${it.photos.slice(0, 4).map(ph => `<img src="${ph.thumb}">`).join("")}</div>` : ""}</td></tr>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(inLabel(x))}</title><style>
    body{font:11px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d2420;margin:0}
    h1{font-size:19px;margin:0 0 2px} .m{color:#5d6863} h2{font-size:13px;margin:16px 0 5px;border-bottom:1.5px solid #1d2420;padding-bottom:3px}
    table{width:100%;border-collapse:collapse} td{border-bottom:1px solid #e3e6e2;padding:4px 5px;vertical-align:top} td:first-child{width:30%} td.c{width:62px;font-weight:600}
    .poor,.damaged{color:#a3311f} .fair{color:#8a6512} .good{color:#2f6b47} .ph img{height:62px;margin:3px 3px 0 0;border-radius:3px} tr{page-break-inside:avoid}
    .box{border:1px solid #e3e6e2;border-radius:6px;padding:8px 10px;margin-top:10px} .sig{margin-top:28px;display:flex;gap:40px} .sig div{flex:1;border-top:1px solid #1d2420;padding-top:4px;color:#5d6863}
  </style></head><body>
    <h1>${esc(IN_KIND[x.kind])} inspection</h1>
    <div class="m">${esc(p.name || "")}${p.address ? " · " + esc(p.address) : ""} · ${esc(fdateS(x.date))} · inspected by ${esc(whoS(x.inspector))}${x.tenant ? " · tenant: " + esc(x.tenant) : ""}</div>
    ${x.summary ? `<div class="box">${esc(x.summary)}</div>` : ""}
    ${F.length ? `<h2>Findings · ${F.length}</h2><table>${F.map(({r, it}) => `<tr><td>${esc(r.name)} · ${esc(it.name)}</td><td class="c ${it.cond}">${IN_COND[it.cond][0]}</td><td>${esc(it.note || "")}</td></tr>`).join("")}</table>` : ""}
    ${x.kind === "move_out" && base ? `<h2>Worse than at move-in (${esc(fdateS(base.date))})</h2>${cmp.length ? `<table>${cmp.map(d => `<tr><td>${esc(d.r.name)} · ${esc(d.it.name)}</td><td class="c ${d.it.cond}">${IN_COND[d.was.cond][0]} → ${IN_COND[d.it.cond][0]}</td><td>${esc(d.it.note || "")}<div class="ph">${(d.was.photos || []).slice(0, 2).map(ph => `<img src="${ph.thumb}">`).join("")}${(d.it.photos || []).slice(0, 2).map(ph => `<img src="${ph.thumb}">`).join("")}</div></td></tr>`).join("")}</table>` : `<p>Nothing is worse than at move-in.</p>`}` : ""}
    ${x.rooms.map(r => `<h2>${esc(r.name)}</h2><table>${r.items.map(it => row(r, it)).join("")}</table>`).join("")}
    <div class="sig"><div>Inspector</div><div>Tenant</div></div>
    <p class="m" style="margin-top:14px">PHD Properties · ${x.status === "done" ? "finished " + esc(fdateS(String(x.doneAt || "").slice(0, 10))) : "in progress"} · full-size photos are kept in Drive.</p>
  </body></html>`;
  if(typeof downloadPdf === "function") downloadPdf(html, `${IN_KIND[x.kind]} inspection - ${p.name || "Rental"} - ${x.date}`);
}

/* ---------- wiring ---------- */
window.PAGE_EXT = Object.assign(window.PAGE_EXT || {}, {inspections:pgInspections});
if(typeof PM_VIEWS !== "undefined") PM_VIEWS.add("inspections");
if(typeof cloudDocs === "function"){ const d0 = cloudDocs; cloudDocs = function(){ const out = d0.apply(this, arguments); Object.values(INS()).forEach(x => { if(x && x.id) out.set("shared/insp:" + x.id, x); }); return out; }; }
if(typeof cloudApply === "function"){ const a0 = cloudApply; cloudApply = function(kind, id, data, deleted){ if(kind === "shared" && /^insp:/.test(id)){ const k = id.slice(5); if(deleted) delete INS()[k]; else INS()[k] = data; return; } return a0.apply(this, arguments); }; }
if(typeof cloudLabel === "function"){ const l0 = cloudLabel; cloudLabel = function(kind, id){ if(kind === "shared" && /^insp:/.test(id)){ const x = INS()[id.slice(5)]; return "inspection" + (x ? " · " + inLabel(x) : ""); } return l0.apply(this, arguments); }; }
// a rental's page lists its inspections
if(typeof pgPmProperty === "function"){ const pp = pgPmProperty; pgPmProperty = function(){ const r = pp.apply(this, arguments);
  try{ const p = pmProp(S.ui.pmPropId); if(p){ const xs = live().filter(x => x.pid === p.id).sort((a, b) => b.date.localeCompare(a.date)), c = elm("div", "card");
    c.innerHTML = `<div class="card-h"><h3>Inspections${xs.length ? " · " + xs.length : ""}</h3><button class="btn sm" data-innew style="margin-left:auto">New inspection</button></div>
      ${xs.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${xs.slice(0, 8).map(x => `<tr class="tk-r" data-in="${esc(x.id)}"><td><b>${esc(IN_KIND[x.kind])}</b> · ${esc(fdateS(x.date))}</td><td>${inFindings(x).length ? `<span class="tag red">${inFindings(x).length} finding${inFindings(x).length === 1 ? "" : "s"}</span>` : ""}</td><td class="r"><span class="tag ${x.status === "done" ? "green" : "gold"}">${x.status === "done" ? "Finished" : "In progress"}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="help" style="padding:0 16px 12px">No inspections for this rental yet.</p>`}`;
    $("#view").appendChild(c);
    c.querySelector("[data-innew]").onclick = () => inStartSheet(p.id);
    c.querySelectorAll("[data-in]").forEach(r => r.onclick = () => { S.ui.inspId = r.dataset.in; go("inspections"); }); } }catch(e){ console.error(e); }
  return r; }; }
Object.assign(window, {pgInspections, inNew, inCompare, inBaseline, inFindings, IN_TPL});
})();
