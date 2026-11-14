/* =====================================================================
   TEAM TASKS
   ---------------------------------------------------------------------
   One record per task (shared doc "task:<id>"), so two people editing
   different tasks never overwrite each other, and two people editing the
   same task are merged by the console's usual three-way merge.
   Views: My tasks · All · Board · Calendar. Tasks link to a rental, an
   owner, a bill, a bank line or an inspection, and "New task" buttons on
   those pages fill the link in. @mentions and assignments show up as
   "For you" in the console — no email is sent by this page.
   Recurring tasks: when one is completed the next one is made with an id
   built from the series and its due date, so it's only ever made once,
   whichever browser does it.
   ===================================================================== */
(function(){
if(typeof render !== "function") return;

const TK_ST = {todo:["To do", "grey"], doing:["In progress", "gold"], waiting:["Waiting", "grey"], done:["Done", "green"]};
const TK_PR = {low:["Low", "grey"], normal:["Normal", ""], high:["High", "gold"], urgent:["Urgent", "red"]};
const TK_RE = {"":"Doesn't repeat", weekly:"Every week", monthly:"Every month", quarterly:"Every 3 months", yearly:"Every year"};
const TK = () => { S.tasks = S.tasks && typeof S.tasks === "object" ? S.tasks : {}; return S.tasks; };
const me = () => String((typeof Cloud !== "undefined" && Cloud.email) || "").toLowerCase();
const staff = () => ((typeof Cloud !== "undefined" && Cloud.staff) || []).filter(s => s.active !== false);
const who = e => { if(!e) return "Nobody"; const s = staff().find(x => String(x.email).toLowerCase() === String(e).toLowerCase()); return (s && s.name) || String(e).split("@")[0]; };
const live = () => Object.values(TK()).filter(t => t && !t.deleted);
const now = () => new Date().toISOString();
const tkOpen = t => t.status !== "done";
const tkLate = t => tkOpen(t) && t.due && t.due < todayISO();

function tkAddDays(iso, freq){
  const d = new Date(iso + "T12:00:00");
  if(freq === "weekly") d.setDate(d.getDate() + 7);
  else if(freq === "monthly") d.setMonth(d.getMonth() + 1);
  else if(freq === "quarterly") d.setMonth(d.getMonth() + 3);
  else if(freq === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
function tkHist(t, what){ t.history = (t.history || []).concat([{at:now(), by:me() || "This browser", what:String(what).slice(0, 200)}]).slice(-60); t.updatedAt = now(); t.updatedBy = me(); }
function tkNotify(t, email, why){ email = String(email || "").toLowerCase(); if(!email || email === me()) return; t.notify = Object.assign({}, t.notify || {}); t.notify[email] = {at:now(), why, by:me(), seen:false}; }
// @mentions: "@Gabe" or "@gabe@phd…" — matched to the team list by name or email
function tkMentions(text){
  const out = new Set(), low = String(text || "").toLowerCase();
  staff().forEach(s => { const e = String(s.email).toLowerCase(), first = String(s.name || "").trim().split(/\s+/)[0].toLowerCase(), local = e.split("@")[0];
    if(low.includes("@" + e) || (first && new RegExp("@" + first.replace(/[^a-z0-9]/g, "") + "\\b").test(low)) || new RegExp("@" + local.replace(/[^a-z0-9.]/g, "").replace(/\./g, "\\.") + "\\b").test(low)) out.add(e); });
  return [...out];
}
function tkNew(o){
  o = Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined));
  const t = Object.assign({id:"t" + uid() + uid(), title:"", desc:"", status:"todo", priority:"normal", assignee:me(), due:"", link:null, recur:"", checklist:[], comments:[], history:[], notify:{}, createdAt:now(), createdBy:me()}, o || {});
  tkHist(t, "Created"); if(t.assignee) tkNotify(t, t.assignee, "assigned");
  return t;
}
function tkSave(t, what){ snapshot(); if(what) tkHist(t, what); TK()[t.id] = t; commit(); }
// completing a recurring task makes the next one (once — its id comes from the series and the due date)
function tkRecur(t){
  if(!t.recur || t.status !== "done") return null;
  const series = t.series || t.id, base = t.due || todayISO(), next = tkAddDays(base, t.recur), id = `${series}_${next.replace(/-/g, "")}`;
  if(TK()[id]) { t.nextId = id; return null; }
  const n = tkNew({id, series, title:t.title, desc:t.desc, priority:t.priority, assignee:t.assignee, due:next, link:t.link, recur:t.recur,
    checklist:(t.checklist || []).map(c => ({t:c.t, done:false})), prev:t.id});
  n.history = [{at:now(), by:me(), what:`Made when the ${fdateS(base)} one was completed (${TK_RE[t.recur].toLowerCase()})`}];
  TK()[id] = n; t.nextId = id; t.series = series;
  return n;
}
function tkSetStatus(t, st){
  if(t.status === st) return;
  snapshot();
  const was = t.status; t.status = st;
  if(st === "done"){ t.doneAt = now(); t.doneBy = me(); } else { delete t.doneAt; delete t.doneBy; }
  tkHist(t, `${TK_ST[was][0]} → ${TK_ST[st][0]}`);
  if(t.createdBy && st === "done") tkNotify(t, t.createdBy, "completed");
  const n = tkRecur(t);
  commit();
  if(n) toast(`Next one made for ${fdateS(n.due)}`, true);
}

/* ---------- links to the console's records ---------- */
function tkLinkLabel(l){
  if(!l) return "";
  if(l.t === "pm"){ const p = typeof pmProp === "function" && pmProp(l.id); return p ? p.name : l.label || "Rental"; }
  if(l.t === "owner"){ const o = ownerById(l.id); return o ? ownerLabel(o) : l.label || "Owner"; }
  return l.label || l.t;
}
function tkLinkIcon(l){ return !l ? "" : ({pm:"Rental", owner:"Owner", bill:"Bill", bank:"Bank line", insp:"Inspection", month:"Month"})[l.t] || "Record"; }
function tkOpenLink(l){
  if(!l) return;
  closeSheet();
  if(l.t === "pm"){ S.ui.pmPropId = l.id; if(l.m) S.ui.pmPropM = l.m; go("pmProperty"); }
  else if(l.t === "owner"){ S.ui.ownerId = l.id; go("owners"); }
  else if(l.t === "bill" && typeof billSheet === "function"){ billSheet(l.id); }
  else if(l.t === "bank"){ S.ui.brAcct = l.k || S.ui.brAcct; if(l.m) S.ui.brMonth = l.m; go("bankrec"); }
  else if(l.t === "insp"){ S.ui.inspId = l.id; go("inspections"); }
  else if(l.t === "month"){ go("pmMonth"); }
}
const tkFor = (t, id) => live().filter(x => x.link && x.link.t === t && x.link.id === id);

/* ---------- the task sheet ---------- */
function tkSheet(id, preset){
  const cur = id && TK()[id], t = cur ? JSON.parse(JSON.stringify(cur)) : tkNew(preset || {}), isNew = !cur;
  const sh = $("#sheet");
  // opening a task you were told about marks it seen
  if(cur && cur.notify && cur.notify[me()] && !cur.notify[me()].seen){ snapshot(); cur.notify[me()].seen = true; commit(); t.notify = cur.notify; }
  const draw = () => {
    const ppl = staff();
    sh.innerHTML = `<div class="sheet-h"><div><h3>${isNew ? "New task" : "Task"}</h3>${t.link ? `<div class="muted" style="font-size:12.5px;margin-top:3px">${esc(tkLinkIcon(t.link))} · <a href="#" id="tkLk">${esc(tkLinkLabel(t.link))}</a></div>` : ""}</div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
      <div class="sheet-b tk-sheet">
        <label class="fld"><span>What needs doing</span><input type="text" id="tkT" maxlength="200" value="${esc(t.title)}" placeholder="e.g. Get the W-9 from the new plumber"></label>
        <label class="fld"><span>Details</span><textarea id="tkD" rows="3" maxlength="4000">${esc(t.desc || "")}</textarea></label>
        <div class="f2">
          <label class="fld"><span>Assigned to</span><select id="tkA"><option value="">Nobody yet</option>${ppl.map(s => `<option value="${esc(String(s.email).toLowerCase())}" ${String(s.email).toLowerCase() === t.assignee ? "selected" : ""}>${esc(s.name || s.email)}</option>`).join("")}${t.assignee && !ppl.some(s => String(s.email).toLowerCase() === t.assignee) ? `<option value="${esc(t.assignee)}" selected>${esc(t.assignee)}</option>` : ""}</select></label>
          <label class="fld"><span>Due</span><input type="date" id="tkDue" value="${esc(t.due || "")}"></label>
        </div>
        <div class="f2">
          <label class="fld"><span>Status</span><select id="tkS">${Object.entries(TK_ST).map(([k, v]) => `<option value="${k}" ${k === t.status ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
          <label class="fld"><span>Priority</span><select id="tkP">${Object.entries(TK_PR).map(([k, v]) => `<option value="${k}" ${k === t.priority ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
        </div>
        <label class="fld"><span>Repeats</span><select id="tkR">${Object.entries(TK_RE).map(([k, v]) => `<option value="${k}" ${k === (t.recur || "") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        ${t.recur ? `<p class="help" style="margin-top:-6px">When it's marked done, the next one is made ${TK_RE[t.recur].toLowerCase().replace("every", "for the following")} with the same details${t.due ? "" : " — give it a due date so the next one knows when"}.</p>` : ""}
        <div class="sectl">Check list</div>
        <div class="tk-cl">${(t.checklist || []).map((c, i) => `<label><input type="checkbox" data-tkc="${i}" ${c.done ? "checked" : ""}> <span>${esc(c.t)}</span> <a href="#" data-tkcx="${i}" class="muted">remove</a></label>`).join("")}
          <div class="tk-cl-add"><input type="text" id="tkCi" placeholder="Add a step and press Enter"></div></div>
        ${isNew ? "" : `<div class="sectl">Comments</div>
        <div class="tk-cm">${(t.comments || []).map(c => `<div class="tk-c"><div class="tk-c-h"><b>${esc(who(c.by))}</b> <span class="muted">${esc(fdateS(String(c.at).slice(0, 10)))} ${esc(String(c.at).slice(11, 16))}</span></div><div>${esc(c.text).replace(/(^|\s)@([\w.@-]+)/g, '$1<b class="tk-at">@$2</b>')}</div></div>`).join("") || `<p class="muted" style="margin:0">No comments yet.</p>`}
          <textarea id="tkCm" rows="2" placeholder="Write a comment — @name tells someone on the team"></textarea>
          <button class="btn sm" id="tkCmGo" type="button">Comment</button></div>
        <details class="tk-h"><summary>History · ${(t.history || []).length}</summary>${(t.history || []).slice().reverse().map(h => `<div>${esc(fdateS(String(h.at).slice(0, 10)))} · ${esc(who(h.by))} — ${esc(h.what)}</div>`).join("")}</details>`}
      </div>
      <div class="sheet-f">${isNew ? "" : `<button class="btn ghost sm" id="tkDel">Delete</button>`}<span style="flex:1"></span><button class="btn" id="tkCancel">Cancel</button><button class="btn primary" id="tkOk">${isNew ? "Add task" : "Save"}</button></div>`;
    const keep = () => { t.title = $("#tkT").value.trim(); t.desc = $("#tkD").value; t.assignee = $("#tkA").value; t.due = $("#tkDue").value; t.status = $("#tkS").value; t.priority = $("#tkP").value; t.recur = $("#tkR").value; };
    $("#shClose").onclick = $("#tkCancel").onclick = () => closeSheet();
    const lk = $("#tkLk"); if(lk) lk.onclick = e => { e.preventDefault(); tkOpenLink(t.link); };
    $("#tkR").onchange = () => { keep(); draw(); };
    sh.querySelectorAll("[data-tkc]").forEach(c => c.onchange = () => { keep(); t.checklist[+c.dataset.tkc].done = c.checked; });
    sh.querySelectorAll("[data-tkcx]").forEach(a => a.onclick = e => { e.preventDefault(); keep(); t.checklist.splice(+a.dataset.tkcx, 1); draw(); });
    $("#tkCi").onkeydown = e => { if(e.key === "Enter" && e.target.value.trim()){ e.preventDefault(); keep(); t.checklist = (t.checklist || []).concat([{t:e.target.value.trim().slice(0, 200), done:false}]); draw(); $("#tkCi").focus(); } };
    const cg = $("#tkCmGo"); if(cg) cg.onclick = () => {
      const text = $("#tkCm").value.trim(); if(!text) return;
      keep(); const base = TK()[t.id]; if(!base) return;
      snapshot();
      base.comments = (base.comments || []).concat([{at:now(), by:me(), text:text.slice(0, 4000)}]);
      tkMentions(text).forEach(e => tkNotify(base, e, "mentioned"));
      if(base.assignee && !tkMentions(text).includes(base.assignee)) tkNotify(base, base.assignee, "comment");
      tkHist(base, "Commented"); commit();
      t.comments = base.comments; t.history = base.history; t.notify = base.notify; draw();
    };
    const del = $("#tkDel"); if(del) del.onclick = () => { if(!confirm(`Delete "${t.title}"? Its comments and history go with it.`)) return; snapshot(); delete TK()[t.id]; commit(); actLog("tasks", `Task deleted: ${t.title}`, {side:"pm"}); closeSheet(); };
    $("#tkOk").onclick = () => {
      keep(); if(!t.title) return toast("Say what needs doing");
      const base = TK()[t.id];
      if(isNew){ snapshot(); tkMentions(t.desc).forEach(e => tkNotify(t, e, "mentioned")); TK()[t.id] = t; if(t.status === "done") tkRecur(t); commit(); actLog("tasks", `Task added: ${t.title}${t.assignee ? " → " + who(t.assignee) : ""}`, {side:"pm"}); toast("Task added", true); closeSheet(); return; }
      snapshot();
      const ch = [];
      if(base.title !== t.title) ch.push("renamed");
      if((base.desc || "") !== (t.desc || "")) ch.push("details changed");
      if(base.assignee !== t.assignee){ ch.push(`assigned to ${who(t.assignee)}`); tkNotify(t, t.assignee, "assigned"); }
      if((base.due || "") !== (t.due || "")) ch.push(`due ${t.due ? fdateS(t.due) : "date removed"}`);
      if(base.priority !== t.priority) ch.push(`priority ${TK_PR[t.priority][0].toLowerCase()}`);
      if((base.recur || "") !== (t.recur || "")) ch.push(TK_RE[t.recur || ""].toLowerCase());
      if(JSON.stringify(base.checklist || []) !== JSON.stringify(t.checklist || [])) ch.push("check list");
      const stCh = base.status !== t.status, was = base.status;
      Object.assign(base, {title:t.title, desc:t.desc, assignee:t.assignee, due:t.due, priority:t.priority, recur:t.recur, checklist:t.checklist, notify:t.notify});
      if(stCh){ base.status = t.status; ch.push(`${TK_ST[was][0]} → ${TK_ST[t.status][0]}`); if(t.status === "done"){ base.doneAt = now(); base.doneBy = me(); if(base.createdBy) tkNotify(base, base.createdBy, "completed"); } }
      if(ch.length) tkHist(base, ch.join(", "));
      const n = stCh ? tkRecur(base) : null;
      commit(); closeSheet(); if(n) toast(`Next one made for ${fdateS(n.due)}`, true);
    };
  };
  draw(); openPanel();
  if(isNew) setTimeout(() => { const i = $("#tkT"); if(i) i.focus(); }, 50);
}

/* ---------- the page ---------- */
function tkRowHTML(t){
  const st = TK_ST[t.status] || TK_ST.todo, pr = TK_PR[t.priority] || TK_PR.normal, n = (t.notify || {})[me()];
  const cl = (t.checklist || []).length ? `${t.checklist.filter(c => c.done).length}/${t.checklist.length}` : "";
  return `<tr class="tk-r ${t.status === "done" ? "off" : ""}" data-tk="${esc(t.id)}">
    <td style="width:28px"><input type="checkbox" data-tkdone="${esc(t.id)}" ${t.status === "done" ? "checked" : ""} title="Done"></td>
    <td><b>${esc(t.title)}</b>${n && !n.seen ? ` <span class="tag accent" title="${esc(who(n.by) + " · " + n.why)}">New for you</span>` : ""}${t.recur ? ` <span class="muted" title="${esc(TK_RE[t.recur])}">↻</span>` : ""}
      <div class="sub">${t.link ? `${esc(tkLinkIcon(t.link))}: <a href="#" data-tklk="${esc(t.id)}">${esc(tkLinkLabel(t.link))}</a>` : ""}${(t.comments || []).length ? `${t.link ? " · " : ""}${t.comments.length} comment${t.comments.length === 1 ? "" : "s"}` : ""}${cl ? ` · ${cl} steps` : ""}</div></td>
    <td>${esc(who(t.assignee))}</td>
    <td class="${tkLate(t) ? "tk-late" : ""}">${t.due ? esc(fdateS(t.due)) : `<span class="muted">—</span>`}</td>
    <td>${pr[1] || t.priority !== "normal" ? `<span class="tag ${pr[1]}">${pr[0]}</span>` : `<span class="muted">Normal</span>`}</td>
    <td><span class="tag ${st[1]}">${st[0]}</span></td></tr>`;
}
function tkWire(el){
  el.querySelectorAll("[data-tk]").forEach(r => r.onclick = e => { if(e.target.closest("input,a,button,select")) return; tkSheet(r.dataset.tk); });
  el.querySelectorAll("[data-tkdone]").forEach(c => c.onchange = () => { const t = TK()[c.dataset.tkdone]; if(t) tkSetStatus(t, c.checked ? "done" : "todo"); });
  el.querySelectorAll("[data-tklk]").forEach(a => a.onclick = e => { e.preventDefault(); const t = TK()[a.dataset.tklk]; if(t) tkOpenLink(t.link); });
}
function pgTasks(){
  $("#pgCrumb").textContent = "Team"; $("#pgTitle").textContent = "Tasks";
  const ui = S.ui, view = ui.tkView || "mine", v = $("#view"), all = live();
  const mine = all.filter(t => t.assignee === me()), forMe = all.filter(t => (t.notify || {})[me()] && !t.notify[me()].seen);
  $("#pgSub").textContent = `${mine.filter(tkOpen).length} open for you${mine.filter(tkLate).length ? ` · ${mine.filter(tkLate).length} late` : ""} · ${all.filter(tkOpen).length} open across the team`;
  actions([["New task", () => tkSheet(null), "primary"]]);
  const bar = elm("div", "card tk-bar");
  const ppl = staff();
  bar.innerHTML = `<div class="sc-seg">${[["mine", "My tasks"], ["all", "All"], ["board", "Board"], ["cal", "Calendar"]].map(([k, l]) => `<button data-tkv="${k}" class="${view === k ? "on" : ""}">${l}</button>`).join("")}</div>
    ${view !== "mine" ? `<select id="tkFa"><option value="">Everyone</option>${ppl.map(s => `<option value="${esc(String(s.email).toLowerCase())}" ${ui.tkFa === String(s.email).toLowerCase() ? "selected" : ""}>${esc(s.name || s.email)}</option>`).join("")}<option value="-" ${ui.tkFa === "-" ? "selected" : ""}>Nobody yet</option></select>` : ""}
    <select id="tkFp"><option value="">Any priority</option>${Object.entries(TK_PR).map(([k, x]) => `<option value="${k}" ${ui.tkFp === k ? "selected" : ""}>${x[0]}</option>`).join("")}</select>
    ${view !== "board" ? `<label class="tk-chk"><input type="checkbox" id="tkFd" ${ui.tkFd ? "checked" : ""}> Show done</label>` : ""}
    <input type="search" id="tkQ" placeholder="Search tasks" value="${esc(ui.tkQ || "")}">`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-tkv]").forEach(b => b.onclick = () => { ui.tkView = b.dataset.tkv; persistUi(); render(); });
  const fa = bar.querySelector("#tkFa"); if(fa) fa.onchange = () => { ui.tkFa = fa.value; persistUi(); render(); };
  bar.querySelector("#tkFp").onchange = e => { ui.tkFp = e.target.value; persistUi(); render(); };
  const fd = bar.querySelector("#tkFd"); if(fd) fd.onchange = () => { ui.tkFd = fd.checked; persistUi(); render(); };
  bar.querySelector("#tkQ").oninput = e => { ui.tkQ = e.target.value; clearTimeout(pgTasks.t); pgTasks.t = setTimeout(() => { render(); const q = $("#tkQ"); if(q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); };

  const q = String(ui.tkQ || "").toLowerCase();
  let list = view === "mine" ? mine : all;
  if(view !== "mine" && ui.tkFa) list = list.filter(t => ui.tkFa === "-" ? !t.assignee : t.assignee === ui.tkFa);
  if(ui.tkFp) list = list.filter(t => t.priority === ui.tkFp);
  if(q) list = list.filter(t => [t.title, t.desc, tkLinkLabel(t.link), who(t.assignee), ...(t.comments || []).map(c => c.text)].join(" ").toLowerCase().includes(q));
  const prio = {urgent:0, high:1, normal:2, low:3};
  const sort = (a, b) => (a.status === "done") - (b.status === "done") || String(a.due || "9999").localeCompare(String(b.due || "9999")) || (prio[a.priority] ?? 2) - (prio[b.priority] ?? 2) || String(a.title).localeCompare(String(b.title));

  if(forMe.length && view === "mine"){
    const c = elm("div", "card tk-for");
    c.innerHTML = `<div class="card-h"><h3>For you · ${forMe.length}</h3><a href="#" id="tkSeen" style="margin-left:auto;font-size:13px">Mark all seen</a></div><div class="tk-for-b">${forMe.sort((a, b) => String(b.notify[me()].at).localeCompare(a.notify[me()].at)).slice(0, 12).map(t => { const n = t.notify[me()];
      return `<div class="tk-n" data-tk="${esc(t.id)}"><b>${esc(who(n.by))}</b> ${n.why === "mentioned" ? "mentioned you in" : n.why === "assigned" ? "gave you" : n.why === "completed" ? "finished" : "commented on"} <a href="#">${esc(t.title)}</a> <span class="muted">· ${esc(fdateS(String(n.at).slice(0, 10)))}</span></div>`; }).join("")}</div>`;
    v.appendChild(c);
    c.querySelectorAll("[data-tk]").forEach(r => r.onclick = e => { e.preventDefault(); tkSheet(r.dataset.tk); });
    c.querySelector("#tkSeen").onclick = e => { e.preventDefault(); snapshot(); forMe.forEach(t => { t.notify[me()].seen = true; }); commit(); };
  }

  if(view === "board"){
    const b = elm("div", "tk-board");
    b.innerHTML = Object.entries(TK_ST).map(([k, st]) => { const col = list.filter(t => t.status === k && (k !== "done" || !t.doneAt || Date.now() - Date.parse(t.doneAt) < 14 * 864e5)).sort(sort);
      return `<div class="tk-col" data-tkcol="${k}"><div class="tk-col-h"><span class="tag ${st[1]}">${st[0]}</span> <span class="muted">${col.length}</span></div>
        ${col.map(t => `<div class="tk-card" draggable="true" data-tkd="${esc(t.id)}" data-tk="${esc(t.id)}"><b>${esc(t.title)}</b>
          <div class="sub">${esc(who(t.assignee))}${t.due ? ` · <span class="${tkLate(t) ? "tk-late" : ""}">${esc(fdateS(t.due))}</span>` : ""}${t.priority !== "normal" ? ` · <span class="tag ${TK_PR[t.priority][1]}">${TK_PR[t.priority][0]}</span>` : ""}</div>
          ${t.link ? `<div class="sub">${esc(tkLinkLabel(t.link))}</div>` : ""}</div>`).join("") || `<div class="muted tk-empty">Drop a task here</div>`}</div>`; }).join("");
    v.appendChild(b);
    b.querySelectorAll("[data-tkd]").forEach(c => { c.ondragstart = e => { e.dataTransfer.setData("text/plain", c.dataset.tkd); c.classList.add("drag"); }; c.ondragend = () => c.classList.remove("drag"); });
    b.querySelectorAll("[data-tkcol]").forEach(col => { col.ondragover = e => { e.preventDefault(); col.classList.add("over"); }; col.ondragleave = () => col.classList.remove("over");
      col.ondrop = e => { e.preventDefault(); col.classList.remove("over"); const t = TK()[e.dataTransfer.getData("text/plain")]; if(t) tkSetStatus(t, col.dataset.tkcol); }; });
    b.querySelectorAll("[data-tk]").forEach(r => r.onclick = () => tkSheet(r.dataset.tk));
    return;
  }
  if(view === "cal"){
    const mm = /^\d{4}-\d{2}$/.test(ui.tkCal || "") ? ui.tkCal : todayISO().slice(0, 7);
    const first = new Date(mm + "-01T12:00:00"), start = new Date(first); start.setDate(1 - first.getDay());
    const days = []; for(let i = 0; i < 42; i++){ const d = new Date(start); d.setDate(start.getDate() + i); days.push(d.toISOString().slice(0, 10)); }
    const c = elm("div", "card tk-cal");
    const shown = list.filter(t => t.due && (ui.tkFd || tkOpen(t)));
    c.innerHTML = `<div class="card-h"><button class="btn ghost sm" id="tkCp">‹</button><h3 style="margin:0 10px">${esc(monthLabel(mm))}</h3><button class="btn ghost sm" id="tkCn">›</button><span class="muted" style="margin-left:auto;font-size:12.5px">${list.filter(t => !t.due && tkOpen(t)).length} open with no due date</span></div>
      <div class="tk-grid">${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="tk-dow">${d}</div>`).join("")}
      ${days.map(d => { const ts = shown.filter(t => t.due === d); return `<div class="tk-day ${d.slice(0, 7) !== mm ? "out" : ""} ${d === todayISO() ? "today" : ""}"><div class="tk-dn">${+d.slice(8)}</div>${ts.slice(0, 4).map(t => `<div class="tk-ev ${tkLate(t) ? "late" : ""} ${t.status === "done" ? "done" : ""}" data-tk="${esc(t.id)}" title="${esc(t.title + " · " + who(t.assignee))}">${esc(t.title)}</div>`).join("")}${ts.length > 4 ? `<div class="muted" style="font-size:11px">+${ts.length - 4} more</div>` : ""}</div>`; }).join("")}</div>`;
    v.appendChild(c);
    c.querySelector("#tkCp").onclick = () => { ui.tkCal = PMCore.monthAdd(mm, -1); render(); };
    c.querySelector("#tkCn").onclick = () => { ui.tkCal = PMCore.monthAdd(mm, 1); render(); };
    c.querySelectorAll("[data-tk]").forEach(r => r.onclick = () => tkSheet(r.dataset.tk));
    return;
  }
  if(!ui.tkFd) list = list.filter(tkOpen);
  list = list.sort(sort);
  const groups = view === "mine" ? [["Late", list.filter(tkLate)], ["Due in the next 7 days", list.filter(t => tkOpen(t) && t.due && t.due >= todayISO() && t.due <= tkAddDaysN(7))], ["Later or no date", list.filter(t => tkOpen(t) && (!t.due || t.due > tkAddDaysN(7)))], ["Done", list.filter(t => !tkOpen(t))]] : [["", list]];
  groups.forEach(([h, ts]) => { if(!ts.length && h) return;
    const c = elm("div", "card");
    c.innerHTML = `${h ? `<div class="card-h"><h3>${h} · ${ts.length}</h3></div>` : ""}${ts.length ? `<div class="tbl-wrap"><table class="tbl tk-tbl"><thead><tr><th></th><th>Task</th><th>Who</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead><tbody>${ts.map(tkRowHTML).join("")}</tbody></table></div>`
      : `<div class="empty"><b>${all.length ? "Nothing matches" : "No tasks yet"}</b><p>${all.length ? "Try another filter." : "Add one with New task, or from a rental, an owner, a bill or a bank line."}</p></div>`}`;
    v.appendChild(c); tkWire(c); });
  if(view === "mine" && !list.length && !forMe.length){ const c = elm("div", "card"); c.innerHTML = `<div class="empty"><b>Nothing on your list</b><p>${all.filter(tkOpen).length ? `${all.filter(tkOpen).length} open across the team — see All.` : "Add a task with New task."}</p></div>`; v.appendChild(c); }
}
const tkAddDaysN = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/* a "Tasks" card for any record's page */
function tkCardFor(v, link, title){
  const ts = tkFor(link.t, link.id).sort((a, b) => (a.status === "done") - (b.status === "done") || String(a.due || "9").localeCompare(String(b.due || "9")));
  const open = ts.filter(tkOpen), c = elm("div", "card");
  c.innerHTML = `<div class="card-h"><h3>Tasks${open.length ? " · " + open.length + " open" : ""}</h3><button class="btn sm" data-tknew style="margin-left:auto">New task</button></div>
    ${ts.length ? `<div class="tbl-wrap"><table class="tbl tk-tbl"><tbody>${ts.slice(0, 12).map(tkRowHTML).join("")}</tbody></table></div>` : `<p class="help" style="padding:0 16px 12px">No tasks for ${esc(title)}.</p>`}`;
  v.appendChild(c); tkWire(c);
  c.querySelector("[data-tknew]").onclick = () => tkSheet(null, {link});
}

/* ---------- wiring ---------- */
window.PAGE_EXT = Object.assign(window.PAGE_EXT || {}, {tasks:pgTasks});
if(typeof PM_VIEWS !== "undefined") PM_VIEWS.add("tasks");
if(typeof cloudDocs === "function"){ const d0 = cloudDocs; cloudDocs = function(){ const out = d0.apply(this, arguments); Object.values(TK()).forEach(t => { if(t && t.id) out.set("shared/task:" + t.id, t); }); return out; }; }
if(typeof cloudApply === "function"){ const a0 = cloudApply; cloudApply = function(kind, id, data, deleted){ if(kind === "shared" && /^task:/.test(id)){ const k = id.slice(5); if(deleted) delete TK()[k]; else TK()[k] = data; return; } return a0.apply(this, arguments); }; }
if(typeof cloudLabel === "function"){ const l0 = cloudLabel; cloudLabel = function(kind, id){ if(kind === "shared" && /^task:/.test(id)){ const t = TK()[id.slice(5)]; return "task" + (t ? ` "${t.title}"` : ""); } return l0.apply(this, arguments); }; }
window.tkNavBadge = () => { try{ const all = live(), late = all.filter(t => t.assignee === me() && tkLate(t)).length, nw = all.filter(t => (t.notify || {})[me()] && !t.notify[me()].seen).length, open = all.filter(t => t.assignee === me() && tkOpen(t)).length;
  return late || nw ? navBadge(late + nw, late ? "alert" : "goldfill", `${late ? late + " late" : ""}${late && nw ? " · " : ""}${nw ? nw + " new for you" : ""}`) : open ? navBadge(open, null, "Open for you") : null; }catch(e){ return null; } };
// rental and owner pages get a Tasks card
if(typeof pgPmProperty === "function"){ const pp = pgPmProperty; pgPmProperty = function(){ const r = pp.apply(this, arguments); try{ const p = pmProp(S.ui.pmPropId); if(p) tkCardFor($("#view"), {t:"pm", id:p.id, label:p.name}, p.name); }catch(e){ console.error(e); } return r; }; }
if(typeof pgOwnerDetail === "function"){ const po = pgOwnerDetail; pgOwnerDetail = function(o){ const r = po.apply(this, arguments); try{ if(o && S.ui.mode === "pm") tkCardFor($("#view"), {t:"owner", id:o.id, label:ownerLabel(o)}, ownerLabel(o)); }catch(e){ console.error(e); } return r; }; }
// a bill's sheet gets a "New task" button
if(typeof billSheet === "function"){ const bs = billSheet; billSheet = function(id){ const r = bs.apply(this, arguments);
  try{ const b = id && typeof billList === "function" && billList().find(x => x.id === id), f = $("#sheet .sheet-f");
    if(b && f && !f.querySelector("[data-tkbill]")){ const n = tkFor("bill", b.id).filter(tkOpen).length, btn = elm("button", "btn ghost sm", `New task${n ? ` (${n} open)` : ""}`); btn.dataset.tkbill = "1"; btn.type = "button";
      btn.onclick = () => tkSheet(null, {link:{t:"bill", id:b.id, label:`${b.vendor || "Bill"} · ${usd(cents(b.amount || 0))}${b.billNo ? " · #" + b.billNo : ""}`}}); f.insertBefore(btn, f.firstChild); } }catch(e){ console.error(e); }
  return r; }; }
Object.assign(window, {tkSheet, tkCardFor, tkFor, tkNew, tkRecur, tkMentions, pgTasks, TK_ST});
})();
