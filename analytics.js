/* =====================================================================
   PORTFOLIO ANALYTICS
   ---------------------------------------------------------------------
   Three kinds of money, never added together:
     · Owner money — rent and other income collected for owners, repairs
       taken from it, and what was paid out to them. It isn't PHD's.
     · PHD revenue — PM fees, admin fees, leasing fees and other fees
       PHD keeps (the same figures as the PHD income page).
     · PHD expenses — the deductions recorded on the PHD income page.
   Every figure comes from the month rows the rest of the console uses
   (pmCalc / pmMonthRoll); nothing is stored. Click through to the
   month or the rental behind a number; download any table as CSV.
   ===================================================================== */
(function(){
if(typeof render !== "function") return;

function anMonths(n){
  const cur = pmCurrentMonth(), ms = pmMonths().filter(m => m <= cur);
  return ms.slice(-n);
}
function anData(ms){
  const months = ms.map(m => { const R = pmMonthRoll(m); return {m, R,
    owner:{recvC:R.recv, otherC:0, repairsC:R.repairsC, payoutC:R.payoutC, dueC:R.dueC, shortC:R.short},
    phd:{pmFeeC:R.pmFeeC, adminC:R.adminC, leasingC:R.leasingC, extrasC:R.extrasC, revC:R.phdC},
    exp:{deductC:-(R.deductC || 0)}, netC:R.netC}; });
  // per rental and per owner over the range
  const props = new Map();
  ms.forEach(m => pmMonthRows(m).forEach(({row, prop}) => { if(row.detailOnly) return;
    const c = pmCalc(row, prop), x = props.get(prop.id) || {p:prop, dueC:0, recvC:0, repairsC:0, payoutC:0, phdC:0, months:0, short:0, owes:0};
    x.dueC += c.dueC; x.recvC += c.recv; x.repairsC += c.repairsC; x.payoutC += c.payoutC; x.phdC += c.phdC; x.months++;
    if(c.dueNowC > 0 && c.recv < c.dueNowC) x.short++; if(c.payoutC < 0) x.owes++;
    otherAdd(months, m, c); props.set(prop.id, x); }));
  const owners = new Map();
  props.forEach(x => { const o = ownerById(x.p.ownerId); const k = o ? o.id : "-"; const y = owners.get(k) || {o, n:0, dueC:0, recvC:0, repairsC:0, payoutC:0, phdC:0};
    y.n++; ["dueC","recvC","repairsC","payoutC","phdC"].forEach(f => y[f] += x[f]); owners.set(k, y); });
  return {months, props:[...props.values()], owners:[...owners.values()]};
}
function otherAdd(months, m, c){ const x = months.find(y => y.m === m); if(x) x.owner.otherC += c.otherC || 0; }
const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 + "%" : "—";

/* a small bar chart: one series per month, values in cents. Bars for negative values hang below the line. */
function anBars(rows, series, opt){
  const W = 640, H = opt.h || 170, padL = 54, padB = 22, padT = 8, n = rows.length, g = (W - padL) / Math.max(1, n), bw = Math.max(6, Math.min(26, g / (series.length + 1)));
  const vals = rows.flatMap(r => series.map(s => s.get(r))), max = Math.max(1, ...vals), min = Math.min(0, ...vals), y = v => padT + (max - v) / (max - min) * (H - padT - padB);
  const tick = v => v >= 100000 ? "$" + Math.round(v / 100000) + "k" : "$" + Math.round(v / 100);
  return `<svg viewBox="0 0 ${W} ${H}" class="an-svg" role="img" aria-label="${esc(opt.label || "")}">
    ${[max, (max + min) / 2, min].map(v => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="an-grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="an-ax" text-anchor="end">${tick(v)}</text>`).join("")}
    ${rows.map((r, i) => series.map((s, j) => { const v = s.get(r), x = padL + i * g + (g - bw * series.length) / 2 + j * bw, y0 = y(Math.max(0, v)), h = Math.max(1, Math.abs(y(v) - y(0)));
      return `<rect x="${x}" y="${y0}" width="${bw - 2}" height="${h}" rx="2" class="an-b s${j}" data-anm="${r.m}"><title>${esc(monthLabel(r.m))} · ${esc(s.name)}: ${usd(v)}</title></rect>`; }).join("")
      + `<text x="${padL + i * g + g / 2}" y="${H - 6}" class="an-ax" text-anchor="middle">${esc(monthShort(r.m).split(" ")[0])}</text>`).join("")}
  </svg><div class="an-leg">${series.map((s, j) => `<span><i class="s${j}"></i>${esc(s.name)}</span>`).join("")}</div>`;
}
function anCsv(name, head, rows){ if(typeof download === "function" && typeof toCSV === "function") download(name, toCSV([head].concat(rows))); }
const d = c => (c / 100).toFixed(2);

function pgAnalytics(){
  $("#pgCrumb").textContent = "Rentals"; $("#pgTitle").textContent = "Portfolio analytics";
  const ui = S.ui, n = ui.anN || 6, ms = anMonths(n), v = $("#view");
  if(!ms.length){ v.innerHTML = `<div class="card"><div class="empty"><b>No months yet</b><p>Analytics fill in once Month close has rows.</p></div></div>`; return; }
  const D = anData(ms), sum = (f) => D.months.reduce((a, x) => a + f(x), 0);
  $("#pgSub").textContent = `${monthLabel(ms[0])} – ${monthLabel(ms[ms.length - 1])} · owner money, PHD revenue and PHD expenses kept apart`;
  const live = pmLiveProps(), vacant = live.filter(p => p.status !== "active");
  const dueC = sum(x => x.owner.dueC), recvC = sum(x => x.owner.recvC);
  const top = elm("div", "card an-top");
  top.innerHTML = `<div class="sc-seg">${[3, 6, 12].map(k => `<button data-ann="${k}" class="${n === k ? "on" : ""}">${k} months</button>`).join("")}</div>
    <div class="an-kpis">
      <div><span>Rentals</span><b>${live.length}</b><em>${vacant.length ? `${vacant.length} not leased now (${pct(vacant.length, live.length)})` : "All leased"}</em></div>
      <div><span>Rent collected for owners</span><b>${usd(recvC)}</b><em>${pct(recvC, dueC)} of ${usd(dueC)} due</em></div>
      <div><span>Paid out to owners</span><b>${usd(sum(x => x.owner.payoutC))}</b><em>${usd(sum(x => x.owner.repairsC))} went on repairs</em></div>
      <div class="phd"><span>PHD revenue</span><b>${usd(sum(x => x.phd.revC))}</b><em>${usd(sum(x => x.phd.pmFeeC))} PM fees</em></div>
      <div class="phd"><span>PHD net</span><b>${usd(sum(x => x.netC))}</b><em>after ${usd(sum(x => x.exp.deductC))} recorded expenses</em></div>
    </div>`;
  v.appendChild(top);
  top.querySelectorAll("[data-ann]").forEach(b => b.onclick = () => { ui.anN = +b.dataset.ann; persistUi(); render(); });

  const grid = elm("div", "an-grid");
  const c1 = elm("div", "card"), c2 = elm("div", "card");
  c1.innerHTML = `<div class="card-h"><h3>Owner money</h3><span class="muted" style="margin-left:auto;font-size:12px">Not PHD's money</span></div><div class="an-ch">${anBars(D.months, [{name:"Rent collected", get:x => x.owner.recvC}, {name:"Repairs from owner money", get:x => x.owner.repairsC}, {name:"Paid out", get:x => x.owner.payoutC}], {label:"Owner money by month"})}</div>`;
  c2.innerHTML = `<div class="card-h"><h3>PHD revenue and expenses</h3></div><div class="an-ch">${anBars(D.months, [{name:"PHD revenue", get:x => x.phd.revC}, {name:"Recorded expenses", get:x => x.exp.deductC}], {label:"PHD revenue and expenses by month"})}</div>`;
  grid.appendChild(c1); grid.appendChild(c2); v.appendChild(grid);
  grid.querySelectorAll("[data-anm]").forEach(r => r.onclick = () => { S.ui.pmMonth = r.dataset.anm; go("pmMonth"); });

  // month table
  const mt = elm("div", "card");
  mt.innerHTML = `<div class="card-h"><h3>By month</h3><button class="btn sm ghost" data-csv="m" style="margin-left:auto">Download CSV</button></div>
    <div class="tbl-wrap"><table class="tbl an-t"><thead><tr><th>Month</th><th class="r an-o">Rent due</th><th class="r an-o">Collected</th><th class="r an-o">Repairs</th><th class="r an-o">Paid out</th><th class="r an-p">PM fees</th><th class="r an-p">Admin</th><th class="r an-p">Leasing &amp; other</th><th class="r an-p">PHD revenue</th><th class="r an-x">Expenses</th><th class="r an-p">PHD net</th></tr></thead>
    <tbody>${D.months.slice().reverse().map(x => `<tr class="tk-r" data-anmo="${x.m}"><td><b>${esc(monthLabel(x.m))}</b>${(pmState().meta[x.m] || {}).closed ? "" : ` <span class="tag gold">open</span>`}</td>
      <td class="r num">${usd(x.owner.dueC)}</td><td class="r num">${usd(x.owner.recvC)}<div class="sub">${pct(x.owner.recvC, x.owner.dueC)}</div></td><td class="r num">${usd(x.owner.repairsC)}</td><td class="r num">${usd(x.owner.payoutC)}</td>
      <td class="r num">${usd(x.phd.pmFeeC)}</td><td class="r num">${usd(x.phd.adminC)}</td><td class="r num">${usd(x.phd.leasingC + x.phd.extrasC)}</td><td class="r num"><b>${usd(x.phd.revC)}</b></td><td class="r num">${x.exp.deductC ? usd(-x.exp.deductC) : "—"}</td><td class="r num"><b>${usd(x.netC)}</b></td></tr>`).join("")}</tbody></table></div>
    <p class="help" style="padding:6px 16px 12px">Owner columns are money held for owners. PHD columns match the PHD income page; expenses are the deductions recorded there. Click a month to open it.</p>`;
  v.appendChild(mt);
  mt.querySelectorAll("[data-anmo]").forEach(r => r.onclick = () => { S.ui.pmMonth = r.dataset.anmo; go("pmMonth"); });
  mt.querySelector("[data-csv]").onclick = () => anCsv(`Portfolio by month ${ms[0]} to ${ms[ms.length - 1]}.csv`, ["Month", "Rent due", "Collected", "Repairs (owner money)", "Paid out to owners", "PM fees", "Admin fees", "Leasing and other fees", "PHD revenue", "PHD expenses", "PHD net"],
    D.months.map(x => [x.m, d(x.owner.dueC), d(x.owner.recvC), d(x.owner.repairsC), d(x.owner.payoutC), d(x.phd.pmFeeC), d(x.phd.adminC), d(x.phd.leasingC + x.phd.extrasC), d(x.phd.revC), d(x.exp.deductC), d(x.netC)]));

  // rentals and owners
  const tab = ui.anTab || "props", sort = ui.anSort || "phdC";
  const pt = elm("div", "card");
  const rowsP = D.props.slice().sort((a, b) => sort === "name" ? a.p.name.localeCompare(b.p.name, undefined, {numeric:true}) : sort === "rate" ? (a.recvC / (a.dueC || 1)) - (b.recvC / (b.dueC || 1)) : b[sort] - a[sort]);
  const rowsO = D.owners.slice().sort((a, b) => sort === "name" ? ownerLabel(a.o || {}).localeCompare(ownerLabel(b.o || {})) : b[sort === "rate" ? "recvC" : sort] - a[sort === "rate" ? "recvC" : sort]);
  const th = (k, l, cls) => `<th class="${cls || "r"} an-s ${sort === k ? "on" : ""}" data-ans="${k}">${l}</th>`;
  pt.innerHTML = `<div class="card-h"><div class="sc-seg"><button data-ant="props" class="${tab === "props" ? "on" : ""}">By rental · ${D.props.length}</button><button data-ant="owners" class="${tab === "owners" ? "on" : ""}">By owner · ${D.owners.length}</button></div><button class="btn sm ghost" data-csv="p" style="margin-left:auto">Download CSV</button></div>
    <div class="tbl-wrap"><table class="tbl an-t"><thead><tr>${th("name", tab === "props" ? "Rental" : "Owner", "")}${tab === "owners" ? `<th class="r">Rentals</th>` : ""}${th("dueC", "Rent due")}${th("recvC", "Collected")}${th("rate", "Rate")}${th("repairsC", "Repairs")}${th("payoutC", "Paid out")}${th("phdC", "PHD revenue")}${tab === "props" ? `<th class="r">Months short</th>` : ""}</tr></thead>
    <tbody>${tab === "props" ? rowsP.map(x => `<tr class="tk-r" data-anp="${esc(x.p.id)}"><td><b>${esc(x.p.name)}</b><div class="sub">${esc(ownerLabel(ownerById(x.p.ownerId) || {}) || "No owner")}${x.p.status !== "active" ? ` · <span class="tag grey">${esc(x.p.status || "not leased")}</span>` : ""}</div></td>
        <td class="r num">${usd(x.dueC)}</td><td class="r num">${usd(x.recvC)}</td><td class="r num ${x.dueC && x.recvC / x.dueC < 0.95 ? "tk-late" : ""}">${pct(x.recvC, x.dueC)}</td><td class="r num">${usd(x.repairsC)}</td><td class="r num">${usd(x.payoutC)}</td><td class="r num">${usd(x.phdC)}</td><td class="r">${x.short || "—"}</td></tr>`).join("")
      : rowsO.map(x => `<tr class="tk-r" data-ano="${esc(x.o ? x.o.id : "")}"><td><b>${esc(x.o ? ownerLabel(x.o) : "No owner")}</b></td><td class="r">${x.n}</td><td class="r num">${usd(x.dueC)}</td><td class="r num">${usd(x.recvC)}</td><td class="r num">${pct(x.recvC, x.dueC)}</td><td class="r num">${usd(x.repairsC)}</td><td class="r num">${usd(x.payoutC)}</td><td class="r num">${usd(x.phdC)}</td></tr>`).join("")}</tbody></table></div>`;
  v.appendChild(pt);
  pt.querySelectorAll("[data-ant]").forEach(b => b.onclick = () => { ui.anTab = b.dataset.ant; persistUi(); render(); });
  pt.querySelectorAll("[data-ans]").forEach(b => b.onclick = () => { ui.anSort = b.dataset.ans; persistUi(); render(); });
  pt.querySelectorAll("[data-anp]").forEach(r => r.onclick = () => { S.ui.pmPropId = r.dataset.anp; S.ui.pmPropM = ms[ms.length - 1]; go("pmProperty"); });
  pt.querySelectorAll("[data-ano]").forEach(r => r.onclick = () => { if(!r.dataset.ano) return; S.ui.ownerId = r.dataset.ano; go("owners"); });
  pt.querySelector("[data-csv]").onclick = () => tab === "props"
    ? anCsv(`Portfolio by rental ${ms[0]} to ${ms[ms.length - 1]}.csv`, ["Rental", "Owner", "Status", "Rent due", "Collected", "Repairs (owner money)", "Paid out to owners", "PHD revenue", "Months short"], rowsP.map(x => [x.p.name, ownerLabel(ownerById(x.p.ownerId) || {}), x.p.status || "", d(x.dueC), d(x.recvC), d(x.repairsC), d(x.payoutC), d(x.phdC), x.short]))
    : anCsv(`Portfolio by owner ${ms[0]} to ${ms[ms.length - 1]}.csv`, ["Owner", "Rentals", "Rent due", "Collected", "Repairs (owner money)", "Paid out to owners", "PHD revenue"], rowsO.map(x => [x.o ? ownerLabel(x.o) : "No owner", x.n, d(x.dueC), d(x.recvC), d(x.repairsC), d(x.payoutC), d(x.phdC)]));

  // operations: tasks and inspections, when those are in use
  const ops = [];
  try{ const T = Object.values(S.tasks || {}).filter(t => t && !t.deleted); if(T.length){ const open = T.filter(t => t.status !== "done"), late = open.filter(t => t.due && t.due < todayISO()); ops.push(["Open tasks", open.length, late.length ? `${late.length} late` : "none late", "tasks"]); } }catch(e){}
  try{ const I = Object.values(S.insp || {}).filter(x => x && !x.deleted); if(I.length){ const yr = new Date(); yr.setFullYear(yr.getFullYear() - 1); const cut = yr.toISOString().slice(0, 10);
    const done = new Set(I.filter(x => x.status === "done" && x.date >= cut).map(x => x.pid)); ops.push(["Inspected in the last 12 months", `${live.filter(p => done.has(p.id)).length} of ${live.length}`, `${I.filter(x => x.status === "draft").length} in progress`, "inspections"]); } }catch(e){}
  if(ops.length){ const c = elm("div", "card an-ops"); c.innerHTML = `<div class="card-h"><h3>Operations</h3></div><div class="an-kpis">${ops.map(([l, b, e, go2]) => `<div class="tk-r" data-ang="${go2}"><span>${esc(l)}</span><b>${esc(String(b))}</b><em>${esc(e)}</em></div>`).join("")}</div>`; v.appendChild(c);
    c.querySelectorAll("[data-ang]").forEach(x => x.onclick = () => go(x.dataset.ang)); }
}

window.PAGE_EXT = Object.assign(window.PAGE_EXT || {}, {analytics:pgAnalytics});
if(typeof PM_VIEWS !== "undefined") PM_VIEWS.add("analytics");
Object.assign(window, {pgAnalytics, anData});
})();
