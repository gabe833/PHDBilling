
"use strict";
const $ = s => document.querySelector(s);
const elm = (t,c,h) => { const n=document.createElement(t); if(c)n.className=c; if(h!=null)n.innerHTML=h; return n; };
function toast(m, withUndo){
  const t = $("#toast"); t.innerHTML = "";
  t.appendChild(document.createTextNode(m));
  if(withUndo){ const b = document.createElement("button"); b.textContent = "Undo"; b.onclick = () => { t.classList.remove("show"); undo(); }; t.appendChild(b); }
  t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), withUndo ? 4200 : 2200);
}

/* ===================== chrome ===================== */
function render(){
  const p = P();
  const portfolioView = S.ui.view === "portfolio" || S.ui.view === "reconcile" || S.ui.view === "owners" || S.ui.view === "inbox" || S.ui.view === "team" || S.ui.view === "payments" || S.ui.view === "today" || S.ui.view === "charges" || S.ui.view === "inventory" || S.ui.mode === "pm";
  renderModeSwitch();
  $("#swName").textContent = S.ui.view === "portfolio" ? "All properties" : S.ui.view === "reconcile" ? "Reconcile" : S.ui.view === "owners" ? "Owners" : S.ui.view === "inbox" ? "Receipt inbox" : S.ui.view === "team" ? "Team" : S.ui.view === "payments" ? "Payments" : S.ui.view === "today" ? "Today" : S.ui.view === "charges" ? "Back-charges" : S.ui.view === "inventory" ? "Inventory" : p.name;
  $("#swSub").textContent  = portfolioView
    ? `${live().length} propert${live().length===1?"y":"ies"}`
    : `${usd0(cents(p.invoiceTarget))} cap · ${p.feePct}% fee`;
  renderMenu(); renderNav();

  const T = {
    portfolio:["", "Portfolio", "Every property in one place"],
    reconcile:["", "Reconcile", "Match your records against what's actually happened"],
    overview: [p.name, "Overview", "Where every dollar stands today"],
    txns:     [p.name, "Transactions", "Billing order decides how invoices fill"],
    scope:    [p.name, "Scope of work", "Budgets track themselves against the ledger"],
    invoices: [p.name, "Invoices", `Each one packed to ${usd0(cents(p.invoiceTarget))} and never over`],
    owner:    [p.name, "Owner", "The person this property bills"],
    owners:   ["", "Owners", "Everyone you bill, across every property"],
    inbox:    ["", "Receipt inbox", "Receipts read for you — nothing is added until you approve it"],
    team:     ["", "Team", "Who has access, and who changed what"],
    pmMonth:  ["Property management", "Month close", ""],
    pmHome:   ["Property management", "Overview", ""],
    pmAlerts: ["Property management", "Action center", ""],
    pmProperty:["Property management", "Property", ""],
    pmSettings:["Property management", "Alert rules", "When rent counts as late, payouts as due, leases as ending"],
    pmMd:     ["Property management", "MagicDoor", ""],
    pmProps:  ["Property management", "Properties", "Every rental PHD manages — rent, fee rule and owner"],
    pmDeposits:["Property management", "Security deposits", "What PHD is holding, for whom"],
    pmIncome: ["Property management", "Income", "PHD's management income, month by month"],
    pmBills:  ["Property management", "Bills", ""],
    pmInvoices:["Property management", "Owner invoices", ""],
    pmVendors:["Property management", "Vendors", ""],
    pmPaySetup:["Shared", "Payments", ""],
    payments: ["Shared", "Payments", ""],
    today:    ["", "Today", ""],
    charges:  ["Projects", "Back-charges", ""],
    inventory:["Projects", "Inventory", ""],
    settings: [p.name, "Property settings", "Units, fee, and cap for this property"]
  }[S.ui.view] || [p.name, "Overview", ""];
  $("#pgCrumb").textContent = T[0]; $("#pgTitle").textContent = T[1]; $("#pgSub").textContent = T[2];
  $("#pgActions").innerHTML = "";
  const v = $("#view"); v.innerHTML = "";
  (({portfolio:pgPortfolio, reconcile:pgReconcile, overview:pgOverview, txns:pgTxns, scope:pgScope, invoices:pgInvoices, owner:pgOwner, owners:pgOwners, inbox:pgInbox, team:pgTeam, pmMonth:pgPmMonth, pmHome:pgPmHome, pmAlerts:pgPmAlerts, pmProperty:pgPmProperty, pmSettings:pgPmSettings, pmMd:pgPmMd, pmProps:pgPmProps, pmDeposits:pgPmDeposits, pmIncome:pgPmIncome, pmBills:pgPmBills, pmInvoices:pgPmInvoices, pmVendors:pgPmVendors, pmPaySetup:pgPmPaySetup, payments:pgPayments, today:pgToday, charges:pgCharges, inventory:pgInventory, settings:pgSettings})[S.ui.view] || pgOverview)();
  chip();
}
function actions(list){
  const box = $("#pgActions");
  list.forEach(([lbl,fn,cls]) => { const b = elm("button","btn "+(cls||""),lbl); b.onclick = fn; box.appendChild(b); });
}
function go(view, propId){
  if(PM_VIEWS.has(view)) S.ui.mode = "pm";
  else if(!["owners","inbox","team","payments","today"].includes(view)) S.ui.mode = "projects";
  const switching = propId && propId !== S.activeId;
  if(propId) S.activeId = propId;
  S.ui.view = view;
  fixActive();
  if(switching){ S.ui.open = {}; S.ui.query = ""; S.ui.sel = []; S.ui.page = 1; S.ui.filterUnit = ""; S.ui.filterStatus = ""; S.ui.filterTag = ""; S.ui.catClosed = {}; }
  COMP = ALL[S.activeId]; AUDIT = AUDITS[S.activeId] || [];   // repoint at the new property
  persistUi(); render(); window.scrollTo(0,0);
}
/* Navigation is state too — save it so returning to the tab lands you back here. */
function persistUi(){ Store.save(S); AutoFile.queue(); }

function renderNav(){
  if(S.ui.mode === "pm") return renderNavPM();
  const n = $("#nav"); n.innerHTML = "";
  const mk = (k, lbl, ic, badge) => {
    const b = elm("button", null, `${icon(ic)}<span>${lbl}</span>${badge != null ? badge : ""}`);
    b.setAttribute("aria-current", S.ui.view === k);
    b.onclick = () => go(k); n.appendChild(b);
  };
  const pr = portfolioRoll();
  mk("today", "Today", "bolt");
  mk("portfolio", "All properties", "grid", pr.issues ? `<i class="badge alert">${pr.issues}</i>` : `<i class="badge">${pr.props}</i>`);
  { const nOwn = (S.owners||[]).filter(ownerLabel).length;
    mk("owners", "Owners", "user", `<i class="badge">${nOwn}</i>`);
    n.lastChild.onclick = () => { S.ui.ownerId = null; go("owners"); }; }
  { const nIn = inboxCount();
    mk("inbox", "Receipt inbox", "receipt", nIn ? `<i class="badge alert" style="background:var(--accent);color:#fff">${nIn}</i>` : (inboxConn() ? null : `<i class="badge" style="color:var(--gold)">set up</i>`));
    n.lastChild.onclick = () => { go("inbox"); inboxRefresh(); }; }
  if(typeof payOnline === "function" && payOnline()) mk("payments", "Payments", "card", payNavBadge());
  { const nCh = typeof chOpenCount === "function" ? chOpenCount() : 0; mk("charges", "Back-charges", "receipt", nCh ? `<i class="badge" style="color:var(--gold)">${nCh}</i>` : null); }
  if(typeof pgInventory === "function"){ const nLow = invLowCount(); mk("inventory", "Inventory", "box", nLow ? `<i class="badge" style="color:var(--gold)" title="Running low">${nLow} low</i>` : null); }
  if(typeof Cloud !== "undefined" && Cloud.ready) mk("team", "Team", "user", Cloud.online.length ? `<i class="badge" style="color:var(--green)">${Cloud.online.length + 1} on</i>` : null);
  const qbN = typeof qbCounts === "function" ? qbCounts() : null;
  const unrec = qbN ? qbN.none + qbN.gone : reconcileEntries().filter(e => !e.reconciled).length;
  mk("reconcile", "Reconcile", "check", unrec ? `<i class="badge"${qbN ? ' title="Project expenses not in QuickBooks"' : ""}>${unrec}</i>` : null);
  n.appendChild(elm("div","nav-gap"));
  const p = P();
  n.appendChild(elm("div","nav-head", esc(p.name)));
  const errs = (COMP.notes.filter(x => x.level === "err").length) + AUDIT.length;
  mk("overview", "Overview", "home", errs ? `<i class="badge alert">${errs}</i>` : null);
  mk("txns", "Transactions", "list", `<i class="badge">${p.transactions.length}</i>`);
  mk("invoices", "Invoices", "file", `<i class="badge">${COMP.roll.invoices}</i>`);
  mk("scope", "Scope of work", "clip", (p.scope||[]).length ? `<i class="badge">${(p.scope||[]).length}</i>` : null);
  mk("owner", "Owner", "user", ownerName(p) ? null : `<i class="badge" style="color:var(--gold)">add</i>`);
  mk("settings", "Settings", "gear");
}

function renderMenu(){
  const m = $("#propMenu"); m.innerHTML = "";
  const all = elm("button","menu-i","All properties");
  all.setAttribute("aria-current", S.ui.view === "portfolio");
  all.onclick = () => { m.classList.remove("on"); go("portfolio"); };
  m.appendChild(all);
  m.appendChild(elm("div","menu-sep"));
  S.properties.filter(p => !p.archived).forEach(p => {
    const c = ALL[p.id], bal = c ? c.roll.chargesC - c.roll.paidC : 0;
    const hot = c && c.roll.readyC > 0;
    const b = elm("button","menu-i",
      `<i class="pip ${hot?"hot":bal===0?"ok":""}"></i><span>${esc(p.name)}</span><span class="bal">${usd0(bal)}</span>`);
    b.setAttribute("aria-current", p.id === S.activeId && S.ui.view !== "portfolio");
    b.onclick = () => { m.classList.remove("on"); go(S.ui.view === "portfolio" ? "overview" : S.ui.view, p.id); };
    m.appendChild(b);
  });
  const arch = S.properties.filter(p => p.archived);
  if(arch.length){
    m.appendChild(elm("div","menu-sep"));
    arch.forEach(p => {
      const b = elm("button","menu-i",`<i class="pip"></i><span class="muted">${esc(p.name)}</span><span class="bal">archived</span>`);
      b.onclick = () => { m.classList.remove("on"); go("overview", p.id); };
      m.appendChild(b);
    });
  }
  m.appendChild(elm("div","menu-sep"));
  const add = elm("button","menu-i add","+  New property");
  add.onclick = () => { m.classList.remove("on"); newPropSheet(); };
  m.appendChild(add);
}
$("#switcher").onclick = e => { e.stopPropagation(); $("#propMenu").classList.toggle("on"); };
document.addEventListener("click", () => $("#propMenu").classList.remove("on"));

/* ===================== PORTFOLIO ===================== */
function pgPortfolio(){
  actions([["Download backup", backup, "ghost"], ["New property", newPropSheet, "primary"]]);
  const v = $("#view"), r = portfolioRoll();

  const hero = elm("div","card pf-hero");
  hero.innerHTML = `
    <div class="pf-cell"><div class="label">Charges built</div><div class="pf-v">${usd(r.chargesC)}</div></div>
    <div class="pf-cell"><div class="label">Collected</div><div class="pf-v sm g">${usd(r.paidC)}</div></div>
    <div class="pf-cell"><div class="label">Outstanding</div><div class="pf-v sm">${usd(r.sentC)}</div></div>
    <div class="pf-cell"><div class="label">Ready to send</div><div class="pf-v sm a">${usd(r.readyC)}</div></div>
    <div class="pf-cell"><div class="label">Fees collected</div><div class="pf-v sm g">${usd(r.feePaidC)}</div>
      <div class="pf-note">${usd(r.feeC - r.feePaidC)} more built into invoices you haven't been paid for</div></div>
    ${r.heldC?`<div class="pf-cell"><div class="label">Held for final billing</div><div class="pf-v sm">${usd(r.heldC)}</div>
      <div class="pf-note">${esc(live().filter(x => (ALL[x.id]||{roll:{}}).roll.heldC > 0).length === 1
        ? heldNote(live().find(x => ALL[x.id].roll.heldC > 0))
        : "Quoted work not yet invoiced — subject to change")}</div></div>`:""}`;
  v.appendChild(hero);

  const card = elm("div","card"); card.style.marginTop = "16px";
  if(!live().length){
    card.innerHTML = `<div class="empty"><b>No properties yet</b>Add one to start tracking expenses and building invoices.</div>`;
    v.appendChild(card); return;
  }
  const wrap = elm("div","tbl-wrap"), t = elm("table","tbl");
  t.innerHTML = `<thead><tr><th>Property</th><th>Units</th><th class="r">Invoices</th><th>Progress</th>
    <th class="r">Charges</th><th class="r">Collected</th><th class="r">Balance</th><th>Next step</th><th></th></tr></thead>`;
  const tb = elm("tbody");
  S.properties.forEach(p => {
    const c = ALL[p.id]; if(!c) return;
    const issues = c.notes.filter(n => n.level === "err").length + (AUDITS[p.id]||[]).length;
    const invs = [].concat(...p.units.map(u => c.units[u.id]||[]));
    const spark = invs.slice(0,10).map(i =>
      `<i title="Invoice ${i.no} — ${usd(i.totalC)}"><b style="height:${Math.max(8,i.totalC/c.targetC*100)}%;background:${
        i.status==="Paid"?"var(--green)":i.status==="Sent"?"var(--gold)":i.status.startsWith("Ready")?"var(--accent-2)":"var(--accent-3)"}"></b></i>`).join("");
    /* every open action shows at once: fix, send, and chase can all apply to one property */
    const steps = [];
    if(issues) steps.push(`<span class="tag red">${issues} to fix</span>`);
    if(c.roll.readyC > 0) steps.push(`<span class="tag acc">Send ${usd0(c.roll.readyC)}</span>`);
    if(c.roll.sentC > 0) steps.push(`<span class="tag gold">Awaiting ${usd0(c.roll.sentC)}</span>`);
    if(!steps.length) steps.push(c.roll.chargesC && c.roll.chargesC === c.roll.paidC ? `<span class="tag green">Settled</span>` : `<span class="tag grey">Building</span>`);
    const next = `<div class="next-steps">${steps.join("")}</div>`;
    const tr = elm("tr");
    tr.innerHTML = `
      <td><div class="prop-nm">${esc(p.name)}${p.archived?' <span class="mark grey">Archived</span>':""}</div>
          ${ownerName(p)?`<div class="item-s">${esc(ownerName(p))}</div>`:""}</td>
      <td style="font-size:13px">${p.units.map(u=>esc(u.name)).join(", ")}</td>
      <td class="r num">${c.roll.invoices}</td>
      <td><span class="spark">${spark || '<span class="muted" style="font-size:12.5px">—</span>'}</span></td>
      <td class="r num">${usd(c.roll.chargesC)}</td>
      <td class="r num" style="color:var(--green)">${usd(c.roll.paidC)}</td>
      <td class="r num">${usd(c.roll.chargesC - c.roll.paidC)}</td>
      <td>${next}</td>
      <td class="act"><button class="btn sm ghost">›</button></td>`;
    tr.onclick = () => go("overview", p.id);
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t); card.appendChild(wrap); v.appendChild(card);
}

/* ===================== OVERVIEW ===================== */
/* ===================== RECONCILE ===================== */
const PAGE_RC = 40;
function pgReconcile(){
  actions([["Export unreconciled", exportUnreconciledCsv, "ghost"]]);
  const v = $("#view");
  if(typeof qbReconcileSection === "function"){ qbReconcileSection(v); const hd = elm("div", "qb-sub"); hd.innerHTML = `<h3>Checklist</h3><span class="muted">Tick expenses off by hand against a bank or card statement</span>`; v.appendChild(hd); }
  const all = reconcileEntries();
  const done = all.filter(e => e.reconciled), openE = all.filter(e => !e.reconciled);
  const sumAbs = arr => arr.reduce((a,e) => a + cents(Math.abs(e.amount)), 0);

  const hero = elm("div","card pf-hero");
  hero.innerHTML = `
    <div class="pf-cell"><div class="label">Transactions</div><div class="pf-v">${all.length}</div></div>
    <div class="pf-cell" id="pf_done" style="cursor:pointer"><div class="label">Reconciled</div><div class="pf-v sm g">${usd(sumAbs(done))}</div>
      <div class="pf-note">${done.length} of ${all.length} — view the register</div></div>
    <div class="pf-cell" id="pf_open" style="cursor:pointer"><div class="label">Unreconciled</div><div class="pf-v sm a">${usd(sumAbs(openE))}</div>
      <div class="pf-note">${openE.length} to review</div></div>
    <div class="pf-cell"><div class="label">Progress</div><div class="pf-v sm">${all.length?Math.round(done.length/all.length*100):100}%</div></div>`;
  hero.querySelector("#pf_done").onclick = () => { S.ui.rcTab = "done"; S.ui.rcPage = 1; render(); };
  hero.querySelector("#pf_open").onclick = () => { S.ui.rcTab = "open"; S.ui.rcPage = 1; render(); };
  v.appendChild(hero);

  /* ---- search: type an amount or a name, jump straight to the match ---- */
  const sc = elm("div","card"); sc.style.marginTop = "16px";
  sc.innerHTML = `<div class="card-h"><h3>Find a transaction</h3></div>
    <div class="card-b">
      <input type="text" id="rc_q" placeholder="Amount — try 88.28 — or a vendor / item name" value="${esc(S.ui.rcQuery||"")}">
      <div id="rc_results"></div>
    </div>`;
  v.appendChild(sc);
  const drawResults = () => {
    const q = $("#rc_q").value, box = $("#rc_results");
    if(!q.trim()){ box.innerHTML = ""; return; }
    const hits = searchReconcile(q);
    box.innerHTML = hits.length
      ? `<div class="rc-list">${hits.map(entryRowHTML).join("")}</div>`
      : `<div class="rc-empty">No transaction matches "${esc(q)}" — it may not be entered yet, or check for a typo.</div>`;
    wireRcRows(box);
  };

  /* ---- register: Unreconciled and Reconciled as two tabs, QuickBooks-style ---- */
  const tab = S.ui.rcTab === "done" ? "done" : "open";
  const wc = elm("div","card"); wc.style.marginTop = "16px";
  const head = elm("div","card-h");
  head.innerHTML = `<div class="seg-ctl" id="rc_tabs">
      <button type="button" data-tab="open" aria-pressed="${tab==="open"}">Unreconciled <span class="muted" style="font-size:11.5px">${openE.length}</span></button>
      <button type="button" data-tab="done" aria-pressed="${tab==="done"}">Reconciled <span class="muted" style="font-size:11.5px">${done.length}</span></button>
    </div>
    <select class="filt" id="rc_pf" style="margin-left:auto"><option value="">All properties</option>
      ${S.properties.map(p=>`<option value="${p.id}" ${S.ui.rcPropFilter===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select>
    <span class="muted" style="font-size:12.5px">${tab==="done"?"Most recently reconciled first":"Most recent first"}</span>`;
  wc.appendChild(head);

  const source = tab === "done" ? done : openE;
  const filtered = source.filter(e => !S.ui.rcPropFilter || e.propId === S.ui.rcPropFilter)
    .sort((a,b) => tab === "done"
      ? (b.reconciledAt||b.date||"").localeCompare(a.reconciledAt||a.date||"")
      : (b.date||"").localeCompare(a.date||""));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_RC));
  if(!S.ui.rcPage || S.ui.rcPage > pages) S.ui.rcPage = 1;
  const from = (S.ui.rcPage - 1) * PAGE_RC, slice = filtered.slice(from, from + PAGE_RC);
  const listWrap = elm("div");
  listWrap.innerHTML = slice.length
    ? `<div class="rc-list">${slice.map(entryRowHTML).join("")}</div>`
    : `<div class="empty"><b>${tab==="done"?"Nothing reconciled yet":"Nothing left to reconcile"}</b>${
        S.ui.rcPropFilter ? "Not for this property, anyway." :
        tab==="done" ? "Check something off in Unreconciled and it lands here." : "Every transaction in the portfolio is checked off."}</div>`;
  wc.appendChild(listWrap);
  const tal = elm("div","tallies");
  tal.innerHTML = `<span>Showing <b>${slice.length?from+1:0}–${Math.min(from+PAGE_RC,filtered.length)}</b> of <b>${filtered.length}</b> ${tab==="done"?"reconciled":"unreconciled"}</span>`;
  wc.appendChild(tal);
  if(pages > 1){
    const pg = elm("div","pager");
    pg.innerHTML = `<button class="btn sm" id="rc_prev" ${S.ui.rcPage<=1?"disabled":""}>Previous</button>
      <span>Page <b class="num">${S.ui.rcPage}</b> of <b class="num">${pages}</b></span>
      <button class="btn sm" id="rc_next" ${S.ui.rcPage>=pages?"disabled":""}>Next</button>`;
    wc.appendChild(pg);
  }
  v.appendChild(wc);

  /* ---- bulk match: paste a statement, see what's missing ---- */
  const mc = elm("div","card"); mc.style.marginTop = "16px";
  mc.innerHTML = `<div class="card-h"><h3>Match a statement</h3></div>
    <div class="card-b">
      <p class="muted" style="font-size:13.3px;margin:0 0 10px">Paste amounts from a bank or card statement — one per line, or a column out of a spreadsheet. Each one is checked against every property.</p>
      <textarea id="rc_paste" rows="4" placeholder="88.28&#10;3,452.85&#10;-192.20"></textarea>
      <button class="btn" id="rc_match" style="margin-top:9px">Match</button>
      <div id="rc_matchout" style="margin-top:14px"></div>
    </div>`;
  v.appendChild(mc);

  setTimeout(() => {
    $("#rc_q").oninput = () => { S.ui.rcQuery = $("#rc_q").value; drawResults(); };
    drawResults();
    wireRcRows(wc);
    wc.querySelectorAll("[data-tab]").forEach(btn => btn.onclick = () => { S.ui.rcTab = btn.dataset.tab; S.ui.rcPage = 1; render(); });
    $("#rc_pf").onchange = e => { S.ui.rcPropFilter = e.target.value; S.ui.rcPage = 1; render(); };
    if($("#rc_prev")) $("#rc_prev").onclick = () => { S.ui.rcPage--; render(); window.scrollTo(0,0); };
    if($("#rc_next")) $("#rc_next").onclick = () => { S.ui.rcPage++; render(); window.scrollTo(0,0); };

    const paste = $("#rc_paste");
    paste.value = S.ui.rcPaste || "";
    paste.oninput = () => { S.ui.rcPaste = paste.value; };

    const runMatch = () => {
      const lines = paste.value.split(/[\n,]/).map(x => x.trim()).filter(Boolean);
      const out = $("#rc_matchout");
      if(!lines.length){ out.innerHTML = ""; return; }
      const rows = lines.map(line => {
        const n = parseFloat(line.replace(/[^0-9.\-]/g,""));
        if(!isFinite(n)) return {line, n:null, matches:[]};
        const matches = reconcileEntries().filter(e => Math.abs(Math.abs(e.amount) - Math.abs(n)) < 0.005);
        return {line, n, matches};
      });
      out.innerHTML = `<table class="tbl"><thead><tr><th>Statement amount</th><th>Match</th><th></th></tr></thead><tbody>
        ${rows.map(r => {
          if(r.n === null) return `<tr><td class="num">${esc(r.line)}</td><td colspan="2" class="muted">Not a number — skipped</td></tr>`;
          if(!r.matches.length) return `<tr><td class="num">${usd(cents(Math.abs(r.n)))}</td><td><span class="tag red">No match</span></td><td class="muted" style="font-size:12px">not entered yet, or a typo</td></tr>`;
          if(r.matches.length === 1){
            const m = r.matches[0];
            return `<tr class="mrow" data-mprop="${m.propId}" data-mtxn="${m.txnId}">
              <td class="num">${usd(cents(Math.abs(r.n)))}</td>
              <td><span class="tag ${m.reconciled?"green":"acc"}">${esc(m.propName)} · ${esc(m.vendor||m.desc)}</span></td>
              <td><button class="btn sm" data-mrecon="${m.propId}|${m.txnId}">${m.reconciled?"Reconciled ✓":"Mark reconciled"}</button></td></tr>`;
          }
          return `<tr><td class="num">${usd(cents(Math.abs(r.n)))}</td><td colspan="2">
            <span class="tag gold">${r.matches.length} possible matches</span>
            ${r.matches.map(m => `<button class="btn sm" data-mgo="${m.propId}|${m.txnId}" style="margin-left:5px;margin-top:4px">${esc(m.propName)}: ${esc(m.vendor||m.desc)}</button>`).join("")}</td></tr>`;
        }).join("")}
      </tbody></table>`;
      out.querySelectorAll("tr.mrow").forEach(tr => tr.onclick = e => {
        if(e.target.closest("[data-mrecon]")) return;
        go("txns", tr.dataset.mprop); openSheet(tr.dataset.mtxn);
      });
      out.querySelectorAll("[data-mrecon]").forEach(btn => btn.onclick = e => {
        e.stopPropagation();
        const [pid,tid] = btn.dataset.mrecon.split("|");
        toggleReconciled(pid,tid);   // re-renders the whole page; the paste text is restored from S.ui.rcPaste and matched again below
      });
      out.querySelectorAll("[data-mgo]").forEach(btn => btn.onclick = e => {
        e.stopPropagation();
        const [pid,tid] = btn.dataset.mgo.split("|"); go("txns", pid); openSheet(tid);
      });
    };
    $("#rc_match").onclick = runMatch;
    if(S.ui.rcPaste && S.ui.rcPaste.trim()) runMatch();
  },0);
}

function pgOverview(){
  const p = P();
  actions([["Undo", undo, "ghost"], ["Client report", reportSheet]]);
  const v = $("#view"), r = COMP.roll;
  const pct = c => r.chargesC ? (c / r.chargesC * 100) : 0;

  const hero = elm("div","card hero");
  hero.innerHTML = `
    <div class="hero-l">
      <div class="label">Charges built so far</div>
      <div class="hero-fig">${usd(r.chargesC)}</div>
      <div class="hero-cap">${usd(r.expenseC)} of expenses plus ${usd(r.feeC)} in project fees, packed into ${r.invoices} invoice${r.invoices===1?"":"s"} of ${usd0(COMP.targetC)} or less.${
        r.heldC?` A further ${usd(r.heldC)} is held back and not yet invoiced.`:""}</div>
      <div class="hero-bar">
        <i style="width:${pct(r.paidC)}%;background:var(--green)"></i>
        <i style="width:${pct(r.sentC)}%;background:var(--gold)"></i>
        <i style="width:${pct(r.readyC)}%;background:var(--accent-2)"></i>
        <i style="width:${pct(r.draftC)}%;background:var(--accent-3);opacity:.45"></i>
      </div>
      <div class="hero-key">
        <span><i class="dotk" style="background:var(--green)"></i>Paid <b>${usd0(r.paidC)}</b></span>
        <span><i class="dotk" style="background:var(--gold)"></i>Sent <b>${usd0(r.sentC)}</b></span>
        <span><i class="dotk" style="background:var(--accent-2)"></i>Ready <b>${usd0(r.readyC)}</b></span>
        <span><i class="dotk" style="background:var(--accent-3);opacity:.5"></i>Draft <b>${usd0(r.draftC)}</b></span>
      </div>
    </div>
    <div class="hero-r">
      <div class="stat"><div class="label">Owner balance</div><div class="stat-v">${usd(r.chargesC - r.paidC)}</div></div>
      <div class="stat"><div class="label">Ready to send</div><div class="stat-v a">${usd(r.readyC)}</div></div>
      <div class="stat"><div class="label">Collected</div><div class="stat-v g">${usd(r.paidC)}</div></div>
      <div class="stat"><div class="label">Fees collected</div><div class="stat-v g">${usd(r.feePaidC)}</div>
        <div class="pf-note">${usd(r.feeC - r.feePaidC)} still to collect</div></div>
      ${r.heldC?`<div class="stat wide"><div class="label">Held for final billing</div>
        <div class="stat-v">${usd(r.heldC)}</div>
        <div class="pf-note">${esc(heldNote(p))}</div></div>`:""}
    </div>`;
  v.appendChild(hero);

  { const o = ownerOf(p), nm = ownerName(p);
    const bt = elm("div","card billto");
    bt.innerHTML = nm
      ? `<div class="avatar sm">${esc(initials(nm))}</div>
         <div class="who"><b>Bill to ${esc(o.name || o.company)}</b><span>${[o.name && o.company ? o.company : "", o.email, o.phone, o.method ? "pays by " + o.method : ""].filter(Boolean).map(esc).join(" · ") || "No contact details yet"}</span></div>
         <div class="links">${o.email ? `<a class="btn sm" href="mailto:${esc(o.email)}">${icon("mail")} Email</a>` : ""}<button class="btn sm ghost" id="btEdit">Owner details ${icon("arrow")}</button></div>`
      : `<div class="avatar sm">?</div><div class="who"><b>No owner on file</b><span>Add who this property bills — it prints as <i>Bill to</i> on every invoice and statement.</span></div>
         <div class="links"><button class="btn sm primary" id="btEdit">Add owner</button></div>`;
    v.appendChild(bt);
    setTimeout(() => { const b = $("#btEdit"); if(b) b.onclick = () => go("owner"); }, 0);
  }

  const grid = elm("div","grid2");
  p.units.forEach(u => {
    const b = COMP.roll.byUnit[u.id] || {}, invs = COMP.units[u.id] || [];
    const c = elm("div","card");
    c.innerHTML = `<div class="card-b">
      <div class="unit-row"><span class="unit-name">${esc(u.name)}</span>
        <span class="muted" style="font-size:12.5px">${invs.length} invoice${invs.length===1?"":"s"}</span>
        <span class="unit-tot">${usd(b.chargesC||0)}</span></div>
      ${invs.map(i => `<div class="mini-inv">
          <span class="n">${i.no}</span>
          <span class="mini-bar"><i style="width:${i.expC/COMP.targetC*100}%;background:var(--accent-2)"></i><i style="width:${i.feeC/COMP.targetC*100}%;background:var(--gold);opacity:.75"></i></span>
          <span class="tag ${i.status==="Paid"?"green":i.status==="Sent"?"gold":i.status.startsWith("Ready")?"acc":"grey"}">${i.status.replace(" — closed short","")}</span>
          <span class="amt">${usd(i.totalC)}</span></div>`).join("")
        || `<div class="muted" style="font-size:13px;padding:6px 0">Nothing billable yet.</div>`}
    </div>`;
    c.querySelectorAll(".mini-inv").forEach((row,ix) => {
      row.style.cursor = "pointer";
      row.onclick = () => { S.ui.unit = u.id; S.ui.open[u.id+"|"+invs[ix].no] = true; go("invoices"); };
    });
    grid.appendChild(c);
  });
  v.appendChild(grid);

  if((p.scope||[]).length){
    const R = COMP.workRoll, vc = R.budgetC - R.actualC;
    const sc = elm("div","card"); sc.style.marginTop = "16px";
    sc.innerHTML = `<div class="card-h"><h3>Scope of work</h3>
      <span class="muted" style="margin-left:auto;font-size:12.5px">${R.done} of ${R.items} complete${R.over?` · ${R.over} over budget`:""}</span></div>
      <div class="card-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(122px,1fr));gap:18px">
      ${[["Budget",usd(R.budgetC)],["Actual",usd(R.actualC)],
         ["Variance",`<span class="${vc<0?"varneg":"varpos"}">${vc<0?"−":""}${usd(Math.abs(vc))}</span>`],
         ["Invoiced",usd(R.billedC)],["Collected",usd(R.paidC)]]
        .map(([l,val])=>`<div><div class="label">${l}</div><div class="num" style="font-size:16px;font-weight:500;margin-top:3px">${val}</div></div>`).join("")}</div>`;
    sc.style.cursor = "pointer"; sc.onclick = () => go("scope");
    v.appendChild(sc);
  }

  const notes = [...AUDIT.map(m => ({level:"err", msg:m})), ...COMP.notes];
  const card = elm("div","card"); card.style.marginTop = "16px";
  if(!notes.length){
    card.innerHTML = `<div class="card-h"><h3>Everything checks out</h3></div>
      <div class="card-b muted" style="font-size:13.3px">Splits total 100%, every expense is allocated, each fee matches its base, and no invoice exceeds ${usd0(COMP.targetC)}.</div>`;
  } else {
    card.innerHTML = `<div class="card-h"><h3>Needs a look</h3><span class="muted" style="margin-left:auto;font-size:12.5px">${notes.length} item${notes.length===1?"":"s"}</span></div>`;
    const list = elm("div","attn-list");
    notes.slice(0,8).forEach(n => {
      const row = elm("div","attn " + n.level);
      row.innerHTML = `<i class="ico">${n.level==="info"?"i":"!"}</i><span>${esc(n.msg)}</span>`;
      if(n.txnId){ const b = elm("button","btn sm go","Open"); b.onclick = () => openSheet(n.txnId); row.appendChild(b); }
      list.appendChild(row);
    });
    card.appendChild(list);
  }
  v.appendChild(card);
}

/* ===================== TRANSACTIONS ===================== */
const PAGE = 60;
const linkOf = t => {
  const l = String(t.link||"").trim();
  if(l) return l;
  const r = String(t.receipt||"").trim();
  return /^(https?:\/\/|www\.)/i.test(r) ? (/^www\./i.test(r) ? "https://"+r : r) : "";
};
const docLabel = u => /\.pdf(\?|#|$)/i.test(u) ? "PDF" : "Open";

function visibleTxns(p){
  const q = (S.ui.query||"").toLowerCase().trim();
  const fu = S.ui.filterUnit || "", fs = S.ui.filterStatus || "", ft = S.ui.filterTag || "";
  return p.transactions.map((t,i) => ({t, i})).filter(({t}) => {
    if(!S.ui.showExcluded && t.status !== "billable" && !t.charge) return false;
    if(fs && (COMP.txn[t.id]||{}).pay !== fs) return false;
    if(ft && !(t.tags||[]).includes(ft)) return false;
    if(fu){
      const on = t.scope.type === "single" ? t.scope.unit === fu : Number(t.scope.splits[fu]) > 0;
      if(!on) return false;
    }
    if(q && ![t.vendor,t.desc,t.receipt,t.notes,t.link].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}

function pgTxns(){
  const p = P();
  actions([["Undo", undo, "ghost"], ["Import", importSheet], ["Export CSV", exportTxnCsv], ["Full form", () => openSheet(null)]]);
  const v = $("#view"), card = elm("div","card");
  const rows = visibleTxns(p);
  const filtered = !!(S.ui.query || S.ui.filterUnit || S.ui.filterStatus || S.ui.filterTag);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  if(!S.ui.page || S.ui.page > pages) S.ui.page = 1;
  const from = (S.ui.page - 1) * PAGE, slice = rows.slice(from, from + PAGE);
  const sel = S.ui.sel = (S.ui.sel||[]).filter(id => p.transactions.some(t => t.id === id));

  const states = ["Unbilled","Invoiced","Part invoiced","Paid","Part paid","On hold","Back-charge","Back-charge settled","Excluded","Unassigned"];
  const bar = elm("div","toolbar");
  bar.innerHTML = `
    <input class="search" type="text" id="q" placeholder="Search vendor, item, receipt…" value="${esc(S.ui.query||"")}">
    <select class="filt" id="fu"><option value="">All units</option>
      ${p.units.map(u=>`<option value="${u.id}" ${S.ui.filterUnit===u.id?"selected":""}>${esc(u.name)}</option>`).join("")}</select>
    <select class="filt" id="fs"><option value="">Any status</option>
      ${states.map(x=>`<option value="${x}" ${S.ui.filterStatus===x?"selected":""}>${x}</option>`).join("")}</select>
    <select class="filt" id="ftag"><option value="">Any tag</option>
      ${(p.tags||[]).map(tg=>`<option value="${tg.id}" ${S.ui.filterTag===tg.id?"selected":""}>${esc(tg.name)}</option>`).join("")}</select>
    <label class="switchbox muted"><input type="checkbox" id="showEx" ${S.ui.showExcluded?"checked":""}> Non-billable</label>
    <label class="switchbox muted"><input type="checkbox" id="dense" ${S.ui.dense?"checked":""}> Compact</label>
    ${filtered?`<button class="btn sm" id="clearF">Clear filters</button>`:""}
    <span style="margin-left:auto"></span>
    <select class="filt" id="sortBy"><option value="">Reorder…</option>
      <option value="date">By date</option><option value="amount">Largest first</option><option value="vendor">By vendor</option></select>`;
  card.appendChild(quickEntryBar(p));
  card.appendChild(bar);

  if(sel.length){
    const bulk = elm("div","bulk");
    bulk.innerHTML = `<b>${sel.length}</b> selected
      <select id="b_state"><option value="">Set billing state…</option>
        <option value="billable">Bill to owner</option><option value="review">On hold</option><option value="excluded">Not billable</option><option value="charge">Bill to a contractor…</option></select>
      <select id="b_unit"><option value="">Assign to unit…</option>
        ${p.units.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select>
      <button class="btn sm" id="b_fee">Fee on</button>
      <button class="btn sm" id="b_nofee">Bill at cost</button>
      <span style="flex:1"></span>
      <button class="btn sm" id="b_del">Delete</button>
      <button class="btn sm" id="b_clear">Clear</button>`;
    card.appendChild(bulk);
  }

  const pending = p.transactions.filter(x => x.status === "billable" && holdMatch(x, p));
  if(pending.length){
    const amt = pending.reduce((a,x) => a + cents(x.amount), 0);
    const nag = elm("div","toolbar");
    nag.style.cssText = "background:var(--gold-soft);border-bottom:1px solid #E6D6AE";
    nag.innerHTML = `<span style="font-size:13.3px;color:#79530F"><b>${pending.length}</b> charge${pending.length===1?"":"s"} worth <b>${usd(amt)}</b> match your deferred billing rule but are still being invoiced.</span>
      <button class="btn sm" id="holdNow" style="margin-left:auto">Put them on hold</button>`;
    card.appendChild(nag);
  }

  const wrap = elm("div","tbl-wrap"), t = elm("table","tbl" + (S.ui.dense?" dense":""));
  const allPicked = slice.length && slice.every(({t:x}) => sel.includes(x.id));
  t.innerHTML = `<thead><tr>
    <th class="pick"><input type="checkbox" id="pickAll" ${allPicked?"checked":""} title="Select the rows on this page"></th>
    <th>#</th><th>Date</th><th>Item</th><th>Unit</th><th class="r">Amount</th><th>Invoice</th><th>Status</th><th></th></tr></thead>`;
  const tb = elm("tbody");
  slice.forEach(({t:x, i}) => tb.appendChild(txnRow(x, i, p, filtered, sel.includes(x.id))));
  if(!slice.length) tb.innerHTML = `<tr><td colspan="9"><div class="empty"><b>Nothing to show</b>${
    filtered ? "No transaction matches these filters." : "Add or import transactions to start building invoices."}</div></td></tr>`;
  t.appendChild(tb); wrap.appendChild(t); card.appendChild(wrap);

  const sum = rows.reduce((a,{t:x}) => a + cents(x.amount), 0);
  const bill = rows.filter(({t:x}) => x.status === "billable").reduce((a,{t:x}) => a + cents(x.amount), 0);
  const tal = elm("div","tallies");
  tal.innerHTML = `<span>Showing <b>${rows.length ? from+1 : 0}–${Math.min(from+PAGE, rows.length)}</b> of <b>${rows.length}</b>${
    rows.length !== p.transactions.length ? ` (of ${p.transactions.length} total)` : ""}</span>
    <span>Listed <b>${usd(sum)}</b></span><span>Billable <b>${usd(bill)}</b></span>
    ${filtered?`<span class="hint-inline">Filtered — clear to drag rows into a new order</span>`:""}`;
  card.appendChild(tal);

  if(pages > 1){
    const pg = elm("div","pager");
    pg.innerHTML = `<button class="btn sm" id="pPrev" ${S.ui.page<=1?"disabled":""}>Previous</button>
      <span>Page <b class="num">${S.ui.page}</b> of <b class="num">${pages}</b></span>
      <button class="btn sm" id="pNext" ${S.ui.page>=pages?"disabled":""}>Next</button>`;
    card.appendChild(pg);
  }
  v.appendChild(card);

  setTimeout(() => {
    const re = (fn) => { snapshot(); fn(); commit(); };
    const openIds = () => sel.filter(id => !((COMP.txn[id]||{}).lockedC));
    const skipped = () => sel.length - openIds().length;
    const note = n => n ? ` · ${n} locked and left alone` : "";
    const fromQe = S.ui.qeFocus;
    if(S.ui.qeFocus){ S.ui.qeFocus = false; const qn = $("#qeIn"); if(qn){ S.ui.qeDraft = ""; qn.value = ""; qn.dispatchEvent(new Event("input")); qn.focus({preventScroll:true}); } }
    if(S.ui.flash){ const fr = document.querySelector(`tr[data-id="${S.ui.flash}"]`); if(fr){ fr.classList.add("flash"); if(!fromQe) fr.scrollIntoView({block:"nearest"}); } S.ui.flash = null; }
    $("#q").oninput = e => { S.ui.query = e.target.value; S.ui.page = 1; const c = e.target.selectionStart; render(); const n = $("#q"); if(n){ n.focus(); n.setSelectionRange(c,c); } };
    $("#fu").onchange = e => { S.ui.filterUnit = e.target.value; S.ui.page = 1; render(); };
    $("#fs").onchange = e => { S.ui.filterStatus = e.target.value; S.ui.page = 1; render(); };
    $("#ftag").onchange = e => { S.ui.filterTag = e.target.value; S.ui.page = 1; render(); };
    $("#showEx").onchange = e => { S.ui.showExcluded = e.target.checked; S.ui.page = 1; render(); };
    $("#dense").onchange = e => { S.ui.dense = e.target.checked; persistUi(); render(); };
    if($("#clearF")) $("#clearF").onclick = () => { S.ui.query=""; S.ui.filterUnit=""; S.ui.filterStatus=""; S.ui.filterTag=""; S.ui.page=1; render(); };
    if($("#pPrev")) $("#pPrev").onclick = () => { S.ui.page--; render(); window.scrollTo(0,0); };
    if($("#pNext")) $("#pNext").onclick = () => { S.ui.page++; render(); window.scrollTo(0,0); };
    $("#sortBy").onchange = e => {
      const k = e.target.value; if(!k) return;
      re(() => {
        const T = P().transactions;
        if(k === "date")   T.sort((a,b) => (a.date||"").localeCompare(b.date||""));
        if(k === "amount") T.sort((a,b) => cents(b.amount) - cents(a.amount));
        if(k === "vendor") T.sort((a,b) => (a.vendor||"").localeCompare(b.vendor||"") || (a.date||"").localeCompare(b.date||""));
      });
      toast("Billing order updated — invoices repacked");
    };
    if($("#holdNow")) $("#holdNow").onclick = () => {
      snapshot(); let n = 0;
      P().transactions.forEach(x => { if(x.status === "billable" && holdMatch(x, P())){ x.status = "review"; n++; } });
      commit(); toast(`${n} charge${n===1?"":"s"} moved to on hold`);
    };
    $("#pickAll").onchange = e => {
      const ids = slice.map(({t:x}) => x.id);
      S.ui.sel = e.target.checked ? [...new Set([...sel, ...ids])] : sel.filter(id => !ids.includes(id));
      render();
    };
    const bs = $("#b_state"); if(bs) bs.onchange = e => { const val = e.target.value; if(!val) return;
      const ids = openIds(), sk = skipped();
      if(val === "charge") return chBulkSheet(ids);
      re(() => P().transactions.forEach(x => { if(ids.includes(x.id)){ x.status = val; delete x.charge; } })); toast(`${ids.length} updated${note(sk)}`); };
    const bu = $("#b_unit"); if(bu) bu.onchange = e => { const val = e.target.value; if(!val) return;
      const ids = openIds(), sk = skipped();
      re(() => P().transactions.forEach(x => { if(ids.includes(x.id)) x.scope = {type:"single", unit:val, splits:{}}; })); toast(`${ids.length} reassigned${note(sk)}`); };
    if($("#b_fee"))   $("#b_fee").onclick   = () => { const ids = openIds(), sk = skipped();
      re(() => P().transactions.forEach(x => { if(ids.includes(x.id)) x.applyFee = true; })); toast(`Fee applied${note(sk)}`); };
    if($("#b_nofee")) $("#b_nofee").onclick = () => { const ids = openIds(), sk = skipped();
      re(() => P().transactions.forEach(x => { if(ids.includes(x.id)) x.applyFee = false; })); toast(`Billing at cost${note(sk)}`); };
    if($("#b_clear")) $("#b_clear").onclick = () => { S.ui.sel = []; render(); };
    if($("#b_del"))   $("#b_del").onclick   = () => {
      const ids = openIds(), sk = skipped();
      if(!ids.length) return toast("All selected charges are locked on issued invoices");
      if(!confirm(`Delete ${ids.length} transaction${ids.length===1?"":"s"}?${sk?`\n\n${sk} locked on issued invoices will be left alone.`:""}`)) return;
      re(() => { P().transactions = P().transactions.filter(x => !ids.includes(x.id)); S.ui.sel = []; });
      toast(`Deleted${note(sk)}`);
    };
  },0);
}

function txnRow(t, idx, p, filtered, picked){
  const info = COMP.txn[t.id] || {parts:[]};
  const lockedC = info.lockedC || 0;
  const fullyLocked = lockedC !== 0 && Math.abs(lockedC) >= Math.abs(cents(t.amount));
  const isCredit = cents(t.amount) < 0;
  const tr = elm("tr"); tr.dataset.id = t.id;
  tr.draggable = !filtered && !fullyLocked;
  if(picked) tr.classList.add("sel");
  if(t.status !== "billable" && !t.charge) tr.classList.add("off");
  if(COMP.notes.some(n => n.txnId === t.id && n.level === "err")) tr.classList.add("bad");
  const unit = t.scope.type === "single"
    ? (p.units.find(u => u.id === t.scope.unit)?.name || "—")
    : p.units.filter(u => Number(t.scope.splits[u.id]) > 0).map(u => `${u.name} ${t.scope.splits[u.id]}%`).join(" · ");
  let marks = "";
  if(t.reconciled) marks += `<button type="button" class="mark green" data-rchip title="Reconciled${t.reconciledAt?" "+t.reconciledAt:""} — click to unmark">✓ Reconciled</button>`;
  if(typeof qbChip === "function" && qbReady()) marks += qbChip(p, t);
  if(isCredit) marks += `<span class="mark green">Credit</span>`;
  if(lockedC) marks += `<span class="mark grey" title="On an invoice that has been issued">${fullyLocked?"Locked":"Part locked"}</span>`;
  if(t.status === "review" && holdMatch(t, p)) marks += `<span class="mark gold">Deferred</span>`;
  if(!t.applyFee)     marks += `<span class="mark gold">No fee</span>`;
  if(!t.allowPartial) marks += `<span class="mark acc">Keep whole</span>`;
  if(t.pin)           marks += `<span class="mark grey">Pin ${t.pin}</span>`;
  const byUnit = {};
  info.parts.forEach(x => (byUnit[x.unitId] = byUnit[x.unitId] || []).push(x));
  const lands = Object.entries(byUnit).map(([id,ps]) => {
    const nm = p.units.length > 1 ? (p.units.find(u => u.id === id)?.name.replace(/^Unit /,"") + " ") : "";
    return `<span class="inv-ref" title="${ps.map(x=>"#"+x.no+" "+usd(x.expC)).join(", ")}">${nm}${ps.map(x=>"#"+x.no).join(", ")}</span>`;
  }).join("<br>") || `<span class="muted">—</span>`;
  const tagCls = {Paid:"green","Part paid":"green",Invoiced:"acc","Part invoiced":"acc",
                  Unbilled:"grey",Excluded:"grey","On hold":"gold",Unassigned:"red"}[info.pay] || "grey";
  const url = linkOf(t);
  const doc = url ? `<a class="doc" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(t.receipt||url)}">${docLabel(url)}</a>` : "";

  tr.innerHTML = `
    <td class="pick"><input type="checkbox" ${picked?"checked":""} aria-label="Select"></td>
    <td class="ord">${filtered||fullyLocked?"":`<span class="grip" title="Drag to reorder">⣿</span>`}<span class="num">${idx+1}</span></td>
    <td class="num muted" style="font-size:12.5px;white-space:nowrap">${fdateS(t.date)}</td>
    <td><div class="item-t">${esc(t.desc||"Untitled")}${marks?`<span class="marks">${marks}</span>`:""}<span class="tagpills">${tagPillsHTML(t,p)}</span><button type="button" class="tagbtn" data-tagbtn title="Add tags">🏷</button></div>
        <div class="item-s">${esc(t.vendor||"—")}${t.receipt?" · "+esc(String(t.receipt).slice(0,54)):""}${typeof nkTxnChip === "function" ? nkTxnChip(t) : ""}</div></td>
    <td style="font-size:13px">${esc(unit)}</td>
    <td class="r num"${isCredit?' style="color:var(--green)"':""}>${usd(cents(t.amount))}</td>
    <td>${lands}</td>
    <td>${t.charge ? chTagHTML(t) : `<span class="tag ${tagCls}">${info.pay}</span>`}${doc?" "+doc:""}</td>
    <td class="act"><button class="btn sm ghost">›</button></td>`;

  tr.querySelector(".pick input").onclick = e => {
    e.stopPropagation();
    const cur = S.ui.sel || [];
    S.ui.sel = e.target.checked ? [...cur, t.id] : cur.filter(x => x !== t.id);
    render();
  };
  const anchor = tr.querySelector("a.doc");
  if(anchor) anchor.onclick = e => e.stopPropagation();
  tr.onclick = () => openSheet(t.id);
  const tagBtn = tr.querySelector("[data-tagbtn]");
  if(tagBtn) tagBtn.onclick = e => { e.stopPropagation(); openTagPop(tagBtn, t.id); };
  const rchip = tr.querySelector("[data-rchip]");
  if(rchip) rchip.onclick = e => { e.stopPropagation(); toggleReconciled(p.id, t.id); };
  if(!filtered && !fullyLocked){
    tr.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed="move"; tr.classList.add("dragging"); });
    tr.addEventListener("dragend", () => { tr.classList.remove("dragging"); clearDrop(); });
    tr.addEventListener("dragover", e => { e.preventDefault(); clearDrop();
      const r = tr.getBoundingClientRect(); tr.classList.add(e.clientY < r.top + r.height/2 ? "drop-above" : "drop-below"); });
    tr.addEventListener("drop", e => {
      e.preventDefault(); e.stopPropagation();
      const src = e.dataTransfer.getData("text/plain");
      const r = tr.getBoundingClientRect(), after = e.clientY >= r.top + r.height/2;
      clearDrop(); if(src && src !== t.id) reorder(src, t.id, after);
    });
  }
  return tr;
}

function clearDrop(){ document.querySelectorAll(".drop-above,.drop-below").forEach(n => n.classList.remove("drop-above","drop-below")); }
function reorder(src, tgt, after){
  snapshot();
  const T = P().transactions;
  const i = T.findIndex(t => t.id === src);
  const [t] = T.splice(i,1);
  const j = T.findIndex(x => x.id === tgt);
  T.splice(after ? j+1 : j, 0, t);
  commit(); toast("Order updated — invoices repacked");
}

/* ===================== SCOPE OF WORK ===================== */
function pgScope(){
  const p = P(), C = COMP;
  const anyClosed = Object.values(S.ui.catClosed||{}).some(Boolean);
  actions([["Undo", undo, "ghost"],
           [anyClosed ? "Expand all" : "Collapse all", () => {
              const cats = [...new Set((P().scope||[]).map(x => x.cat || ""))];
              S.ui.catClosed = {}; if(!anyClosed) cats.forEach(c => S.ui.catClosed[c] = true);
              persistUi(); render();
            }, "ghost"],
           ["Paste a scope list", scopeImportSheet], ["Build from transactions", autoScope],
           ["Report", reportSheet], ["Add work item", () => workSheet(null), "primary"]]);
  const v = $("#view"), R = C.workRoll;

  if(!(p.scope||[]).length){
    const card = elm("div","card");
    card.innerHTML = `<div class="empty">
      <b>No scope yet</b>
      <p style="max-width:46ch;margin:0 auto 16px">Work items carry a budget and a set of match words. Anything already in the ledger that matches lands in the item automatically, so actual spend never gets typed in twice.</p>
      <button class="btn primary" id="paste1">Paste a scope list</button>
      <button class="btn" id="auto1">Build it from my ${p.transactions.length} transactions</button>
      <button class="btn" id="add1">Add one by hand</button></div>`;
    v.appendChild(card);
    setTimeout(() => { $("#paste1").onclick = scopeImportSheet; $("#auto1").onclick = autoScope; $("#add1").onclick = () => workSheet(null); },0);
    return;
  }

  const ZERO = {actualC:0,holdC:0,billedC:0,paidC:0,count:0};
  const rows = p.scope.map(item => {
    const w = C.work[item.id] || ZERO;
    return {item, w, b:cents(item.budget), st:workStatus(item, w)};
  });
  const ST = [["Complete","green"],["In progress","acc"],["At budget","gold"],["Over budget","red"],["Not started","grey"]];
  const count = {}; ST.forEach(([s]) => count[s] = rows.filter(r => r.st === s).length);

  /* ---------- hero ---------- */
  const varC = R.budgetC - R.actualC;
  const pct = R.budgetC > 0 ? R.actualC / R.budgetC * 100 : 0;
  const donePct = R.items ? Math.round(R.done / R.items * 100) : 0;
  const ring = (val, col) => { const r = 34, c = 2*Math.PI*r, f = Math.max(0, Math.min(100, val)) / 100;
    return `<svg viewBox="0 0 84 84" class="sc-ring"><circle cx="42" cy="42" r="${r}" stroke="var(--line-2)"/>
      <circle cx="42" cy="42" r="${r}" stroke="${col}" stroke-dasharray="${(c*f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/></svg>`; };
  const hero = elm("div","card sc-hero");
  hero.innerHTML = `
    <div class="sc-main">
      <div class="sc-ringwrap">${ring(pct, pct>100?"var(--red)":"var(--accent-2)")}<span class="num">${R.budgetC?Math.round(pct)+"%":"—"}</span></div>
      <div>
        <div class="label">Spent against budget</div>
        <div class="sc-big"><span class="num">${usd(R.actualC)}</span> <span class="muted">of ${R.budgetC?usd(R.budgetC):"no budget set"}</span></div>
        <div class="sc-sub">${R.budgetC?`<span class="${varC<0?"varneg":"varpos"}">${varC<0?"−":""}${usd(Math.abs(varC))} ${varC<0?"over":"remaining"}</span> · `:""}${usd(R.billedC)} invoiced${R.holdC?` · ${usd(R.holdC)} held for final billing`:""}</div>
      </div>
    </div>
    <div class="sc-side">
      <div class="sc-done"><div class="label">Complete</div><div><span class="num sc-dn">${R.done}</span><span class="muted"> of ${R.items} items · ${donePct}%</span></div></div>
      <div class="sc-dist">${ST.filter(([s]) => count[s]).map(([s,c]) => `<i class="d-${c}" style="flex:${count[s]}" title="${s}: ${count[s]}"></i>`).join("")}</div>
      <div class="sc-legend">${ST.map(([s,c]) => `<span><i class="d-${c}"></i>${s} <b>${count[s]}</b></span>`).join("")}</div>
    </div>`;
  v.appendChild(hero);

  /* ---------- filters ---------- */
  const f = S.ui.scopeF || "all", q = (S.ui.scopeQ || "").toLowerCase();
  const bar = elm("div","sc-bar");
  bar.innerHTML = `<div class="sc-seg">${[["all","All",R.items],...ST.map(([s]) => [s,s,count[s]])].filter(([k,,n]) => k==="all"||n)
      .map(([k,l,n]) => `<button data-sf="${esc(k)}" class="${f===k?"on":""}">${l} <span>${n}</span></button>`).join("")}</div>
    <div class="sc-q"><input type="text" id="scQ" class="input" placeholder="Filter work items…" value="${esc(S.ui.scopeQ||"")}"></div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-sf]").forEach(b => b.onclick = () => { S.ui.scopeF = b.dataset.sf; render(); });
  const qi = bar.querySelector("#scQ");
  qi.oninput = () => { S.ui.scopeQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#scQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 160); };

  const visible = r => (f === "all" || r.st === f) &&
    (!q || `${r.item.name} ${r.item.cat||""} ${(r.item.match||[]).join(" ")} ${r.item.notes||""}`.toLowerCase().includes(q));

  /* ---------- categories ---------- */
  const cats = [];
  rows.forEach(r => { const c = r.item.cat || ""; let g = cats.find(x => x.cat === c); if(!g) cats.push(g = {cat:c, rows:[]}); g.rows.push(r); });
  let shown = 0;
  cats.forEach(g => {
    const vis = g.rows.filter(visible);
    if(!vis.length) return;
    shown += vis.length;
    const gb = g.rows.reduce((a,r) => a + r.b, 0), ga = g.rows.reduce((a,r) => a + r.w.actualC, 0);
    const gd = g.rows.filter(r => r.item.done).length;
    const gp = gb ? Math.min(100, ga / gb * 100) : (ga ? 100 : 0);
    const closed = !!(S.ui.catClosed||{})[g.cat] && !q && f === "all";
    const sec = elm("section","card sc-cat" + (closed ? " closed" : ""));
    sec.innerHTML = `<header class="sc-ch">
        <span class="chev">›</span>
        <div class="sc-cn"><b>${esc(g.cat || "Uncategorised")}</b><span class="muted">${g.rows.length} item${g.rows.length===1?"":"s"}${gd?` · ${gd} done`:""}</span></div>
        <div class="sc-cbar"><i style="width:${gp}%;${gb&&ga>gb?"background:var(--red)":""}"></i></div>
        <div class="sc-ct num">${usd(ga)}<span class="muted">${gb?" / "+usd(gb):""}</span></div>
      </header>`;
    sec.querySelector(".sc-ch").onclick = () => { S.ui.catClosed = S.ui.catClosed || {}; S.ui.catClosed[g.cat] = !closed; persistUi(); render(); };
    if(!closed){
      const list = elm("div","sc-list");
      vis.forEach(({item, w, b, st}) => {
        const vc = b - w.actualC;
        const pa = b > 0 ? Math.min(100, w.actualC / b * 100) : (w.actualC ? 100 : 0);
        const pb = b > 0 ? Math.min(pa, w.billedC / b * 100) : 0;
        const cls = {"Complete":"green","Over budget":"red","At budget":"gold","In progress":"acc","Not started":"grey"}[st];
        const unitNm = item.unit==="all"||!item.unit ? "" : (p.units.find(u=>u.id===item.unit)?.name||"");
        const row = elm("div","sc-row" + (item.done ? " done" : ""));
        row.innerHTML = `
          <button class="sc-chk" title="${item.done?"Mark not complete":"Mark complete"}" aria-label="Toggle complete">${item.done?`<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`:""}</button>
          <div class="sc-name">
            <div class="item-t">${esc(item.name)}${item.qty?`<span class="sc-qty">× ${esc(item.qty)}</span>`:""}${unitNm?`<span class="mark grey">${esc(unitNm)}</span>`:""}</div>
            <div class="item-s">${w.count ? `${w.count} transaction${w.count===1?"":"s"}` : "No spend yet"}${w.holdC?` · <span style="color:var(--gold)">${usd(w.holdC)} held</span>`:""}${(item.match||[]).length?` · <span class="sc-terms">${item.match.map(m=>esc(m)).join(" + ")}</span>`:""}${item.notes?` · ${esc(String(item.notes).slice(0,60))}`:""}</div>
          </div>
          <div class="sc-prog">
            <div class="sc-pbar"><i class="a" style="width:${pa}%;${st==="Over budget"?"background:var(--red)":""}"></i><i class="b" style="width:${pb}%"></i></div>
            <div class="sc-pl num"><span>${usd(w.actualC)}</span><span class="muted">${b?usd(b):"no budget"}</span></div>
          </div>
          <div class="sc-var num ${b?(vc<0?"varneg":"varpos"):""}">${b?(vc<0?"−":"+")+usd(Math.abs(vc)):`<span class="muted">—</span>`}</div>
          <div><span class="tag ${cls}">${st}</span></div>
          <span class="sc-go">›</span>`;
        row.onclick = () => workSheet(item.id);
        row.querySelector(".sc-chk").onclick = e => {
          e.stopPropagation(); snapshot();
          const it = P().scope.find(x => x.id === item.id); it.done = !it.done;
          commit(); toast(it.done ? `“${it.name}” marked complete` : `“${it.name}” reopened`, true);
        };
        list.appendChild(row);
      });
      sec.appendChild(list);
    }
    v.appendChild(sec);
  });
  if(!shown){
    const e = elm("div","card"); e.innerHTML = `<div class="empty"><b>Nothing matches</b><p>No work items fit this filter.</p></div>`; v.appendChild(e);
  }

  const un = C.work._none;
  const tal = elm("div","card sc-foot");
  tal.innerHTML = un.count
    ? `<span><b>${un.count}</b> transaction${un.count===1?"":"s"} worth <b class="num">${usd(un.actualC)}</b> match no work item</span>
       <button class="btn sm" id="showUn" style="margin-left:auto">Review with suggestions</button>`
    : `<span class="muted">Every billable transaction is matched to a work item.</span>`;
  v.appendChild(tal);
  if(un.count) setTimeout(() => { $("#showUn").onclick = () => unmatchedSheet(); },0);
}

function autoScope(){
  const p = P();
  const groups = {};
  p.transactions.forEach(t => {
    if(t.status === "excluded") return;
    const words = workWords(t.desc).slice(0,3);
    if(!words.length) return;
    const key = words.join(" ");
    (groups[key] = groups[key] || {words, ids:[], amt:0, label:t.desc}).ids.push(t.id);
    groups[key].amt += cents(t.amount);
  });
  const existing = new Set((p.scope||[]).map(i => (i.match||[]).join(" ")));
  const added = Object.values(groups)
    .filter(g => !existing.has(g.words.join(" ")))
    .sort((a,b) => b.amt - a.amt)
    .map(g => ({ id:uid(), cat:"From ledger", name:g.label, qty:"", unit:"all",
                 budget:+(g.amt/100).toFixed(2), match:g.words, done:false, notes:"" }));
  if(!added.length) return toast("Nothing new to add — every group already has a work item");
  snapshot();
  p.scope = (p.scope||[]).concat(added);
  commit();
  toast(`${added.length} work item${added.length===1?"":"s"} built — budgets seeded from actuals, edit as needed`);
}

function workSheet(id){
  const p = P(), isNew = !id;
  const item = isNew
    ? {id:uid(), cat:"", name:"", qty:"", unit:"all", budget:"", match:[], done:false, notes:""}
    : JSON.parse(JSON.stringify(p.scope.find(x => x.id === id)));
  const w = (COMP.work[item.id]) || {actualC:0,holdC:0,billedC:0,paidC:0,count:0,ids:[]};
  const sh = $("#sheet");
  sh.innerHTML = `
    <div class="sheet-h"><h3>${isNew?"New work item":"Work item"}</h3>
      <button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="f2">
        <label class="fld"><span>Category</span><input type="text" id="w_cat" value="${esc(item.cat||"")}" placeholder="Kitchen" list="catlist">
          <datalist id="catlist">${[...new Set((p.scope||[]).map(x=>x.cat).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join("")}</datalist></label>
        <label class="fld"><span>Quantity</span><input type="text" id="w_qty" value="${esc(item.qty||"")}" placeholder="1, or 1 Lot"></label>
      </div>
      <label class="fld"><span>Name</span><input type="text" id="w_name" value="${esc(item.name)}" placeholder="Kitchen faucet"></label>
      <div class="f2">
        <label class="fld"><span>Budget</span><input type="number" step="0.01" min="0" id="w_budget" value="${item.budget}"></label>
        <label class="fld"><span>Unit</span><select id="w_unit">
          <option value="all" ${item.unit==="all"||!item.unit?"selected":""}>All units</option>
          ${p.units.map(u=>`<option value="${u.id}" ${item.unit===u.id?"selected":""}>${esc(u.name)}</option>`).join("")}
        </select></label>
      </div>
      <label class="fld"><span>Match words</span>
        <input type="text" id="w_match" value="${esc((item.match||[]).join(", "))}" placeholder="cabinet, kitchen">
        <span class="help">Comma separated. A transaction joins this item when <b>every</b> word appears in its item or vendor text. Leave blank to only collect transactions you pin by hand.</span></label>
      <label class="opt"><input type="checkbox" id="w_done" ${item.done?"checked":""}>
        <span><b>Mark complete</b><small>Locks the status regardless of how the budget and actual compare.</small></span></label>
      <label class="fld"><span>Notes</span><textarea id="w_notes" rows="2">${esc(item.notes||"")}</textarea></label>
      <div id="w_live"></div>
    </div>
    <div class="sheet-f">
      ${isNew?"":`<button class="btn danger" id="w_del">Delete</button>`}
      <span style="flex:1"></span>
      <button class="btn" id="w_cancel">Cancel</button>
      <button class="btn primary" id="w_save">${isNew?"Add":"Save"}</button>
    </div>`;

  const live = () => {
    const terms = $("#w_match").value.split(",").map(x=>x.trim()).filter(Boolean);
    const unit  = $("#w_unit").value;
    const probe = {id:item.id, match:terms, unit};
    const hits = p.transactions.filter(t => {
      if(t.status === "excluded") return false;
      if(t.work === item.id) return true;
      if(!terms.length) return false;
      const text = workText(t);
      return terms.every(x => text.includes(x.toLowerCase())) && workTouchesUnit(t, unit, p.units);
    });
    const amt = hits.reduce((a,t) => a + cents(t.amount), 0);
    const b = cents($("#w_budget").value);
    $("#w_live").innerHTML = `<hr class="sep">
      <div class="label" style="margin-bottom:6px">Matches right now</div>
      <div style="display:flex;gap:18px;margin-bottom:10px">
        <div><div class="muted" style="font-size:12px">Transactions</div><div class="num" style="font-size:15px">${hits.length}</div></div>
        <div><div class="muted" style="font-size:12px">Actual</div><div class="num" style="font-size:15px">${usd(amt)}</div></div>
        <div><div class="muted" style="font-size:12px">Variance</div><div class="num ${b-amt<0?"varneg":"varpos"}" style="font-size:15px">${b?((b-amt<0?"−":"")+usd(Math.abs(b-amt))):"—"}</div></div>
      </div>
      ${hits.slice(0,12).map(t => `<div style="display:flex;gap:8px;font-size:13px;padding:4px 0;border-top:1px solid var(--line-2)">
        <span>${esc(t.desc||"")}<span class="muted"> · ${esc(t.vendor||"")}</span></span>
        <span class="num" style="margin-left:auto">${usd(cents(t.amount))}</span></div>`).join("")}
      ${hits.length>12?`<div class="muted" style="font-size:12.5px;margin-top:6px">and ${hits.length-12} more</div>`:""}
      ${!hits.length?`<div class="muted" style="font-size:13px">Nothing matches yet.</div>`:""}`;
  };
  ["#w_match","#w_unit","#w_budget"].forEach(sel => { $(sel).oninput = live; $(sel).onchange = live; });
  live();
  $("#shClose").onclick = $("#w_cancel").onclick = closeSheet;
  if($("#w_del")) $("#w_del").onclick = () => {
    if(!confirm(`Delete “${item.name}”? The transactions stay; they just stop rolling up here.`)) return;
    snapshot();
    P().scope = P().scope.filter(x => x.id !== id);
    P().transactions.forEach(t => { if(t.work === id) delete t.work; });
    closeSheet(); commit(); toast("Work item deleted");
  };
  $("#w_save").onclick = () => {
    snapshot();
    const rec = {
      id:item.id, cat:$("#w_cat").value.trim(), qty:$("#w_qty").value.trim(),
      name:$("#w_name").value.trim() || "Untitled work",
      unit:$("#w_unit").value, budget:Number($("#w_budget").value)||0,
      match:$("#w_match").value.split(",").map(x=>x.trim()).filter(Boolean),
      done:$("#w_done").checked, notes:$("#w_notes").value.trim()
    };
    const L = P().scope;
    if(isNew) L.push(rec); else L[L.findIndex(x => x.id === id)] = rec;
    closeSheet(); commit(); toast(isNew ? "Work item added" : "Saved");
  };
  openPanel();
  setTimeout(() => $("#w_name").focus(), 280);
}

/* ---- paste a scope list: Category / Item / Qty / Notes ---- */
const SFIELDS = [["skip","Skip"],["cat","Category"],["name","Work item"],["qty","Quantity"],["budget","Budget"],["notes","Notes"]];
const ACTION_WORDS = new Set(["replace","install","add","repair","new","needs","need","all","improve","change",
  "match","verify","clean","seal","open","including","needed","entire","might","look","currently","located",
  "remove","unused","items","pending","decision","optional","uniform","already","throughout","package","lot"]);
function matchFromName(name){
  const w = workWords(name).filter(x => !ACTION_WORDS.has(x));
  return w.slice(0, 2);
}
function guessScopeField(h){
  const x = String(h||"").toLowerCase().trim();
  if(/categ|group|area|room|trade/.test(x)) return "cat";
  if(/item|work|task|scope|desc/.test(x)) return "name";
  if(/qty|quantity|count|unit/.test(x)) return "qty";
  if(/budget|cost|price|estimate|amount/.test(x)) return "budget";
  if(/note|comment|detail/.test(x)) return "notes";
  return "skip";
}

function scopeImportSheet(){
  const p = P();
  const sh = $("#sheet");
  sh.innerHTML = `
    <div class="sheet-h"><h3>Paste a scope list</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <p class="muted" style="font-size:13.3px;margin-top:0">Paste straight from a spreadsheet. Blank separator rows are ignored, and a row with a category but no item name becomes an item of its own. Everything lands in <b>${esc(p.name)}</b>.</p>
      <label class="fld"><span>Pasted rows</span><textarea id="s_text" rows="8" placeholder="Kitchen&#9;Kitchen faucet&#9;1&#9;&#9;&#9;&#10;Kitchen&#9;Cabinet hardware&#9;&#9;&#9;&#9;For TV console"></textarea></label>
      <button class="btn" id="s_parse">Read the columns</button>
      <div id="s_map"></div>
    </div>
    <div class="sheet-f"><span style="flex:1"></span>
      <button class="btn" id="s_cancel">Cancel</button>
      <button class="btn primary" id="s_go" disabled>Import</button></div>`;
  $("#shClose").onclick = $("#s_cancel").onclick = closeSheet;

  let rows = [], map = [], hasHeader = false, guessMatch = true;

  const build = () => {
    const body = hasHeader ? rows.slice(1) : rows;
    const col = f => map.indexOf(f);
    const get = (r,f) => col(f) >= 0 ? String(r[col(f)] ?? "").trim() : "";
    let cat = "";
    return body.map(r => {
      const c = get(r,"cat"); if(c) cat = c;
      let name = get(r,"name");
      if(!name && c) name = c;                     // "Blinds" with no item of its own
      if(!name) return null;
      return { id:uid(), cat, name, qty:get(r,"qty"),
               budget:Number(String(get(r,"budget")).replace(/[^0-9.]/g,"")) || 0,
               unit:"all", match:guessMatch ? matchFromName(name) : [],
               done:false, notes:get(r,"notes") };
    }).filter(Boolean);
  };

  const draw = () => {
    const head = rows[0] || [];
    const items = build();
    const cats = [...new Set(items.map(i => i.cat).filter(Boolean))];
    $("#s_map").innerHTML = `<hr class="sep">
      <label class="switchbox" style="margin-bottom:10px"><input type="checkbox" id="s_head" ${hasHeader?"checked":""}> First row is a header</label>
      <label class="switchbox" style="margin-bottom:12px"><input type="checkbox" id="s_gm" ${guessMatch?"checked":""}> Suggest match words from each item name</label>
      <div class="label" style="margin-bottom:8px">Match your columns</div>
      ${head.map((h,i) => `<div class="map-r"><span class="muted">${esc(hasHeader ? (h||"Column "+(i+1)) : "Column "+(i+1))}</span>
        <select data-scol="${i}">${SFIELDS.map(([v,l]) => `<option value="${v}" ${map[i]===v?"selected":""}>${l}</option>`).join("")}</select></div>`).join("")}
      <div class="prev"><table><thead><tr><th>Category</th><th>Work item</th><th>Qty</th><th>Notes</th></tr></thead>
        <tbody>${items.slice(0,10).map(i=>`<tr><td>${esc(i.cat)}</td><td>${esc(i.name)}</td><td>${esc(i.qty)}</td><td>${esc(String(i.notes).slice(0,32))}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted" style="font-size:12.5px"><b>${items.length}</b> work item${items.length===1?"":"s"} across <b>${cats.length}</b> categor${cats.length===1?"y":"ies"}${cats.length?": "+esc(cats.join(", ")):""}.</p>
      <p id="s_why" style="font-size:12.5px;color:var(--gold);margin:6px 0 0"></p>`;
    $("#s_head").onchange = e => { hasHeader = e.target.checked; draw(); };
    $("#s_gm").onchange   = e => { guessMatch = e.target.checked; draw(); };
    $("#s_map").querySelectorAll("[data-scol]").forEach(sel => sel.onchange = e => {
      map[+e.target.dataset.scol] = e.target.value; draw();
    });
    const why = !items.length ? "Nothing to import — set one column to “Work item”." : "";
    $("#s_why").textContent = why;
    const go = $("#s_go");
    go.disabled = !!why;
    go.textContent = why ? "Import" : `Import ${items.length} item${items.length===1?"":"s"}`;
  };

  $("#s_parse").onclick = () => {
    rows = parseTable($("#s_text").value);
    if(!rows.length) return toast("Nothing to read — paste some rows first");
    const cols = Math.max(...rows.map(r => r.length));
    rows = rows.map(r => { const c = r.slice(); while(c.length < cols) c.push(""); return c; });
    map = rows[0].map(h => guessScopeField(h));
    hasHeader = map.filter(m => m !== "skip").length >= 2;
    if(!hasHeader){
      // positional: category, item, qty, then the first column that still has content is notes
      map = rows[0].map(() => "skip");
      const filled = i => rows.some(r => String(r[i]||"").trim() !== "");
      const cols_ = [];
      for(let i=0;i<rows[0].length;i++) if(filled(i)) cols_.push(i);
      if(cols_[0] !== undefined) map[cols_[0]] = "cat";
      if(cols_[1] !== undefined) map[cols_[1]] = "name";
      if(cols_[2] !== undefined) map[cols_[2]] = "qty";
      if(cols_[3] !== undefined) map[cols_[3]] = "notes";
    }
    draw();
  };
  $("#s_go").onclick = () => {
    const items = build();
    snapshot();
    P().scope = (P().scope||[]).concat(items);
    closeSheet(); commit();
    toast(`${items.length} work items added`);
  };
  openPanel();
  setTimeout(() => $("#s_text").focus(), 280);
}

function unmatchedSheet(){
  const p = P(), ids = COMP.work._none.ids;
  const sh = $("#sheet");
  sh.innerHTML = `
    <div class="sheet-h"><h3>Unmatched transactions</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <p class="muted" style="font-size:13.3px;margin-top:0">These aren't rolling up to any work item. Pin one to an item, or add a work item whose match words cover it.</p>
      ${ids.map(id => { const t = p.transactions.find(x => x.id === id);
        /* rank work items by how many significant words they share with this transaction */
        const tw = new Set(workWords(`${t.desc||""} ${t.vendor||""}`));
        const near = (p.scope||[]).map(i => ({ i,
            score: workWords(i.name).filter(w => !ACTION_WORDS.has(w) && tw.has(w)).length }))
          .filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0,3);
        return `
        <div style="border-top:1px solid var(--line-2);padding:10px 0">
          <div style="display:flex;gap:8px"><span class="item-t">${esc(t.desc||"Untitled")}</span>
            <span class="num" style="margin-left:auto">${usd(cents(t.amount))}</span></div>
          <div class="item-s" style="margin-bottom:6px">${esc(t.vendor||"")}</div>
          ${near.length?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px">
            ${near.map(x=>`<button class="btn sm" data-sug="${t.id}" data-item="${x.i.id}">${esc(x.i.name)}</button>`).join("")}</div>`:""}
          <select data-pin="${t.id}"><option value="">Not assigned</option>
            ${(p.scope||[]).map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join("")}
            <option value="none">Never match this one</option></select>
        </div>`; }).join("")}
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="u_close">Done</button></div>`;
  $("#shClose").onclick = $("#u_close").onclick = closeSheet;
  sh.querySelectorAll("[data-pin]").forEach(sel => sel.onchange = e => {
    const t = P().transactions.find(x => x.id === e.target.dataset.pin);
    snapshot();
    if(!e.target.value) delete t.work; else t.work = e.target.value;
    commit(); toast("Assigned");
  });
  sh.querySelectorAll("[data-sug]").forEach(btn => btn.onclick = () => {
    const t = P().transactions.find(x => x.id === btn.dataset.sug);
    snapshot(); t.work = btn.dataset.item; commit();
    toast("Assigned"); unmatchedSheet();
  });
  openPanel();
}

/* ===================== INVOICES ===================== */
function pgInvoices(){
  const p = P();
  const u = p.units.find(x => x.id === S.ui.unit) || p.units[0];
  actions([["Expand all", () => { (COMP.units[u.id]||[]).forEach(i => S.ui.open[u.id+"|"+i.no] = true); render(); }, "ghost"],
           ["Collapse all", () => { S.ui.open = {}; render(); }, "ghost"]]);
  const v = $("#view");
  if(!u){ v.appendChild(elm("div","card",`<div class="empty"><b>No units</b>Add one in Settings.</div>`)); return; }
  if(p.units.length > 1){
    const seg = elm("div","seg-ctl"); seg.style.marginBottom = "16px";
    p.units.forEach(x => { const b = elm("button",null,esc(x.name));
      b.setAttribute("aria-pressed", x.id === u.id);
      b.onclick = () => { S.ui.unit = x.id; persistUi(); render(); }; seg.appendChild(b); });
    v.appendChild(seg);
  }
  const b = COMP.roll.byUnit[u.id] || {};
  const head = elm("div","card"); head.style.marginBottom = "16px";
  head.innerHTML = `<div class="card-b" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(122px,1fr));gap:18px">
    ${[["Invoices",b.invoices||0],["Expenses",usd(b.expenseC||0)],[`${p.feePct}% fee`,usd(b.feeC||0)],
       ["Total charges",usd(b.chargesC||0)],["Collected",usd(b.paidC||0)],["Balance",usd((b.chargesC||0)-(b.paidC||0))]]
      .map(([l,val]) => `<div><div class="label">${l}</div><div class="num" style="font-size:16px;font-weight:500;margin-top:3px">${val}</div></div>`).join("")}
  </div>`;
  v.appendChild(head);
  const invs = COMP.units[u.id] || [];
  if(!invs.length){ v.appendChild(elm("div","card",`<div class="empty"><b>Nothing to bill for ${esc(u.name)}</b>Assign billable transactions to this unit and invoices build themselves.</div>`)); return; }
  const card = elm("div","card");
  invs.forEach(i => card.appendChild(invoiceBlock(i, u, p)));
  v.appendChild(card);
}

function invoiceBlock(inv, unit, p){
  const key = unit.id + "|" + inv.no;
  const open = !!S.ui.open[key];
  const wrap = elm("div","inv"); if(open) wrap.setAttribute("open","");
  let segs = "", i = 0;
  inv.lines.forEach(l => {
    if(l.expC <= 0) return;
    const fee = l.feeApplies ? Math.round(l.expC * COMP.rate) : 0;
    segs += `<i style="width:${l.expC/COMP.targetC*100}%;background:${["#2C7FA6","#3F92B8","#1F6689","#5CA3C4"][i%4]}" title="${esc(l.txn?.desc||"")} — ${usd(l.expC)}"></i>`;
    if(fee) segs += `<i style="width:${fee/COMP.targetC*100}%;background:var(--gold);opacity:.8" title="Fee — ${usd(fee)}"></i>`;
    i++;
  });
  const tagCls = inv.status === "Paid" ? "green" : inv.status === "Sent" ? "gold" : inv.status.startsWith("Ready") ? "acc" : "grey";
  const head = elm("div","inv-head");
  head.innerHTML = `<span class="chev">›</span><span class="inv-n">Invoice ${inv.no}</span>
    <span class="inv-tags"><span class="tag ${tagCls}">${inv.status}</span>${inv.locked?`<span class="mark grey" title="Contents frozen as issued">Locked</span>`:""}</span>
    <span class="fill ${inv.full?"done":""}">${segs}</span>
    <span class="inv-amt">${usd(inv.totalC)}<small>${inv.full ? "at cap" : usd(COMP.targetC-inv.totalC)+" left"}</small></span>`;
  head.onclick = () => { S.ui.open[key] = !open; persistUi(); render(); };
  wrap.appendChild(head);
  if(!open) return wrap;

  const body = elm("div","inv-body");
  const rows = inv.lines.map(l => {
    const parts = COMP.txn[l.txnId].parts.filter(x => x.unitId === unit.id);
    const pi = parts.findIndex(x => x.no === inv.no);
    const bits = [];
    if(l.credit) bits.push(`<span class="mark green">Credit</span>`);
    else if(l.partial) bits.push(`<span class="mark acc">Part ${pi+1} of ${parts.length}</span>`);
    if(!l.feeApplies) bits.push(`<span class="mark gold">No fee</span>`);
    if(l.txn && l.txn.scope.type === "split") bits.push(`<span class="mark grey">Split ${p.units.filter(u=>Number(l.txn.scope.splits[u.id])>0).map(u=>l.txn.scope.splits[u.id]+"%").join("/")}</span>`);
    const u = l.txn ? linkOf(l.txn) : "";
    return `<tr><td class="muted num" style="font-size:12.5px;white-space:nowrap">${fdateS(l.txn?.date)}</td>
      <td><div>${esc(l.txn?.desc||"")}${u?` <a class="doc no-print" href="${esc(u)}" target="_blank" rel="noopener">${docLabel(u)}</a>`:""}</div>
      <div class="item-s">${esc(l.txn?.vendor||"")} ${bits.join(" ")}</div>
      ${l.partial?`<div class="item-s">${usd(l.expC)} of ${usd(l.fullC)}</div>`:""}</td>
      <td class="r"${l.credit?' style="color:var(--green)"':""}>${usd(l.expC)}</td></tr>`;
  }).join("");
  body.innerHTML = `
    <table class="lines"><thead><tr><th>Date</th><th>Item</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${rows}
        <tr class="fee"><td></td><td>${esc(p.feeLabel)} · ${p.feePct}% of ${usd(inv.feeBaseC)}</td><td class="r">${usd(inv.feeC)}</td></tr>
        <tr class="tot"><td></td><td>Invoice total</td><td class="r">${usd(inv.totalC)}</td></tr>
      </tbody></table>
    <div class="reg">
      <label class="fld"><span>Date sent</span><input type="date" data-reg="dateSent" value="${esc(inv.reg.dateSent||"")}"></label>
      <label class="fld"><span>Date paid</span><input type="date" data-reg="datePaid" value="${esc(inv.reg.datePaid||"")}"></label>
      <label class="fld"><span>Payment ref</span><input type="text" data-reg="ref" value="${esc(inv.reg.ref||"")}" placeholder="Check #"></label>
      <label class="fld"><span>Invoice link</span><input type="text" data-reg="link" value="${esc(inv.reg.link||"")}" placeholder="Nickel pay link or QuickBooks URL"></label>
    </div>
    ${inv.locked?`<div style="margin-top:14px;padding:10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-sm);font-size:12.5px;color:var(--muted)">
      ${inv.reg.paid||inv.reg.dateSent
        ? `Frozen as issued${inv.reg.frozen && inv.reg.frozen.at?` on ${esc(inv.reg.frozen.at)}`:""}.`
        : `Locked${inv.reg.frozen && inv.reg.frozen.at?` on ${esc(inv.reg.frozen.at)}`:""} before sending.`}
      These ${inv.lines.length} line${inv.lines.length===1?"":"s"} stay put no matter how transactions are reordered. Correct anything wrong with a credit.
      ${inv.reg.paid||inv.reg.dateSent?`<button class="btn sm" data-x="unlock" style="margin-left:8px">Unlock</button>`:""}</div>`:""}
    <div class="inv-acts">
      <label class="switchbox" title="${inv.reg.paid||inv.reg.dateSent
        ? "Sent and paid invoices are always locked"
        : "Freeze these line items so reordering or new charges can't change this invoice"}">
        <input type="checkbox" data-x="lock" ${inv.locked?"checked":""} ${inv.reg.paid||inv.reg.dateSent?"disabled":""}> Lock contents</label>
      <label class="switchbox"><input type="checkbox" data-reg="paid" ${inv.reg.paid?"checked":""}> Paid in full</label>
      <span style="flex:1"></span>
      <button class="btn sm" data-x="copy">Copy for QuickBooks</button>
      <button class="btn sm" data-x="csv">CSV</button>
      <button class="btn sm primary" data-x="print">Invoice PDF</button><button class="btn sm" data-x="html">Download</button>
      ${inv.reg.link?`<a class="btn sm" href="${esc(inv.reg.link)}" target="_blank" rel="noopener">Open</a>`:""}
    </div>`;
  body.querySelectorAll("[data-reg]").forEach(inp => inp.onchange = () => {
    snapshot();
    const r = P().register[key] = P().register[key] || {};
    r[inp.dataset.reg] = inp.type === "checkbox" ? inp.checked : inp.value;
    if(inp.dataset.reg === "paid" && inp.checked && !r.datePaid) r.datePaid = new Date().toISOString().slice(0,10);
    commit();
  });
  const lockBox = body.querySelector('[data-x="lock"]');
  if(lockBox) lockBox.onchange = () => {
    const g = P().register[key] = P().register[key] || {};
    if(lockBox.checked){
      snapshot(); g.lock = true; commit();
      toast(`Invoice ${inv.no} locked — ${inv.lines.length} line${inv.lines.length===1?"":"s"} frozen`);
    } else {
      if(!confirm(`Unlock invoice ${inv.no}?\n\nIts contents will repack from the current billing order, which can change what this invoice contains.`)){
        lockBox.checked = true; return;
      }
      snapshot(); delete g.lock; delete g.frozen; commit();
      toast("Unlocked and repacked");
    }
  };
  const unlockBtn = body.querySelector('[data-x="unlock"]');
  if(unlockBtn) unlockBtn.onclick = () => {
    if(!confirm(`Unlock invoice ${inv.no}?\n\nIts contents will repack from the current billing order, which can change what this invoice contains. Only do this if it was marked issued by mistake.`)) return;
    snapshot();
    const g = P().register[key]; if(g){ delete g.frozen; delete g.lock; g.paid = false; delete g.dateSent; }
    commit(); toast("Invoice unlocked and repacked");
  };
  body.querySelector('[data-x="copy"]').onclick  = () => { navigator.clipboard.writeText(toTSV(invRows(inv,unit,p))); toast("Lines copied — paste into QuickBooks"); };
  body.querySelector('[data-x="csv"]').onclick   = () => download(`${p.name} ${unit.name} Invoice ${inv.no}.csv`, toCSV(invRows(inv,unit,p)));
  body.querySelector('[data-x="print"]').onclick = () => { printDoc(invoiceDocHTML(p, unit, inv)); toast("Opening the print dialog — choose Save as PDF"); };
  body.querySelector('[data-x="html"]').onclick  = () => download(`${p.name} ${p.units.length > 1 ? unit.name + " " : ""}Invoice ${inv.no}.html`, invoiceDocHTML(p, unit, inv));
  wrap.appendChild(body);
  return wrap;
}

/* ===================== SETTINGS ===================== */
function pgSettings(){
  const p = P();
  actions([["Duplicate as template", dupProp, "ghost"], ["Report", reportSheet], ["Download backup", backup], ["Restore backup", () => $("#filePick").click()]]);
  const v = $("#view"), g = elm("div","grid2"); g.style.marginTop = "0";

  const c1 = elm("div","card");
  c1.innerHTML = `<div class="card-h"><h3>${esc(p.name)}</h3></div><div class="card-b">
    <label class="fld"><span>Property name</span><input type="text" id="sName" value="${esc(p.name)}"></label>
    <label class="fld"><span>Property address</span><input type="text" id="sAddr" value="${esc(p.address||"")}" placeholder="3282 Hartwell St, Charleston, SC 29405">
      <span class="help">Printed under the property name on invoices. Who gets billed lives on the <a href="#" id="sOwnerLink" style="color:var(--accent)">Owner page</a>.</span></label>
    <div class="f2">
      <label class="fld"><span>Invoice cap</span><input type="number" step="1" id="sTarget" value="${p.invoiceTarget}"></label>
      <label class="fld"><span>Project fee %</span><input type="number" step="0.01" id="sFee" value="${p.feePct}"></label>
    </div>
    <label class="fld"><span>Fee line label</span><input type="text" id="sFeeLabel" value="${esc(p.feeLabel)}">
      <span class="help">Expense room in a full invoice: <b class="num">${usd(Math.round(COMP.targetC/(1+COMP.rate)))}</b> before the fee.</span></label>
  </div>`;
  g.appendChild(c1);

  const c2 = elm("div","card");
  c2.innerHTML = `<div class="card-h"><h3>Units</h3><button class="btn sm" id="addUnit" style="margin-left:auto">Add unit</button></div>
    <div class="card-b" id="unitList"></div>`;
  g.appendChild(c2);

  const c3 = elm("div","card");
  c3.innerHTML = `<div class="card-h"><h3>Autosave</h3></div><div class="card-b">
    <p class="muted" id="autoDesc" style="font-size:13.3px;margin:0 0 14px"></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="sAuto"></button>
      <button class="btn" id="sAutoOff" style="display:none">Turn off</button></div></div>`;
  g.appendChild(c3);

  const ch = elm("div","card");
  const matching = p.transactions.filter(t => t.status === "billable" && holdMatch(t, p));
  const held = p.transactions.filter(t => t.status === "review");
  ch.innerHTML = `<div class="card-h"><h3>Deferred billing</h3></div><div class="card-b">
    <p class="muted" style="font-size:13.3px;margin:0 0 14px">Anything matching these words is held back and billed at the end of the job. New and imported transactions pick the rule up automatically.</p>
    <label class="fld"><span>Hold anything matching</span>
      <input type="text" id="sHold" value="${esc((p.holdRules||[]).join(", "))}" placeholder="labor, labour">
      <span class="help">Comma separated. A transaction is held when <b>any</b> word appears in its item or vendor text.</span></label>
    <label class="fld"><span>Note shown with the held total</span>
      <input type="text" id="sHeldNote" value="${esc(p.heldNote || "")}" placeholder="${esc(HELD_NOTE_DEFAULT)}">
      <span class="help">Appears under the held figure and in the client statement. Blank uses the default.</span></label>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      ${matching.length?`<button class="btn primary" id="sHoldApply">Put ${matching.length} matching charge${matching.length===1?"":"s"} on hold</button>`:""}
      ${held.length?`<button class="btn" id="sHoldRelease">Release all ${held.length} held</button>`:""}
    </div>
    <p class="muted" style="font-size:12.5px;margin:12px 0 0">Currently holding <b class="num">${usd(COMP.roll.heldC)}</b> across ${held.length} transaction${held.length===1?"":"s"}.</p>
  </div>`;
  g.appendChild(ch);

  const ct = elm("div","card");
  ct.innerHTML = `<div class="card-h"><h3>Tags</h3><button class="btn sm" id="addTag" style="margin-left:auto">Add tag</button></div>
    <div class="card-b">
      <p class="muted" style="font-size:13.3px;margin:0 0 4px">Yours to organize with — a tag never appears on an invoice or the client statement. Click a color to change it.</p>
      <div id="tagList"></div>
    </div>`;
  g.appendChild(ct);

  const c4 = elm("div","card");
  c4.innerHTML = `<div class="card-h"><h3>This property</h3></div><div class="card-b">
    <p class="muted" style="font-size:13.3px;margin:0 0 14px">Archiving keeps the records but hides the property from the portfolio totals.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" id="sArchive">${p.archived?"Unarchive":"Archive"}</button>
      <button class="btn" id="sCsv">Export transactions</button>
      <button class="btn danger" id="sDelete">Delete property</button>
    </div></div>`;
  g.appendChild(c4);
  v.appendChild(g);

  setTimeout(() => {
    const ul = $("#unitList");
    p.units.forEach((u,i) => {
      const r = elm("div","split-r");
      r.innerHTML = `<input type="text" value="${esc(u.name)}" style="flex:1"><button class="btn sm danger">Remove</button>`;
      r.querySelector("input").onchange = e => { snapshot(); u.name = e.target.value; commit(); };
      r.querySelector("button").onclick = () => {
        if(p.units.length <= 1) return toast("Keep at least one unit");
        if(!confirm(`Remove ${u.name}? Transactions assigned to it will need reassigning.`)) return;
        snapshot(); p.units.splice(i,1);
        if(S.ui.unit === u.id) S.ui.unit = p.units[0].id;
        commit();
      };
      ul.appendChild(r);
    });
    $("#addUnit").onclick = () => { snapshot(); p.units.push({id:uid(), name:"Unit "+(p.units.length+1)}); commit(); };

    const tl = $("#tagList");
    (p.tags||[]).forEach(tg => {
      const c = tagColor(tg.color);
      const used = p.transactions.filter(t => (t.tags||[]).includes(tg.id)).length;
      const row = elm("div","tag-row");
      row.innerHTML = `
        <span class="swatchpick" data-tid="${tg.id}">${TAG_PALETTE.map(x=>`<i class="sw" data-c="${x.k}" style="background:${x.fg}" ${x.k===tg.color?'data-sel="1"':""}></i>`).join("")}</span>
        <input type="text" value="${esc(tg.name)}" data-tname="${tg.id}">
        <span class="utag" style="background:${c.bg};border-color:${c.bd};color:${c.fg}">${esc(tg.name)}</span>
        <span class="muted" style="font-size:12px">${used ? `on ${used} transaction${used===1?"":"s"}` : "unused"}</span>
        <button class="btn sm danger" data-tdel="${tg.id}" style="margin-left:auto">Delete</button>`;
      tl.appendChild(row);
    });
    if(!(p.tags||[]).length) tl.innerHTML = `<p class="muted" style="font-size:13.3px">No tags yet.</p>`;
    tl.querySelectorAll("[data-tname]").forEach(inp => inp.onchange = e => {
      const tg = P().tags.find(x => x.id === e.target.dataset.tname);
      if(tg){ snapshot(); tg.name = e.target.value.trim() || tg.name; commit(); }
    });
    tl.querySelectorAll(".sw").forEach(sw => sw.onclick = () => {
      const tg = P().tags.find(x => x.id === sw.parentElement.dataset.tid);
      if(tg){ snapshot(); tg.color = sw.dataset.c; commit(); }
    });
    tl.querySelectorAll("[data-tdel]").forEach(btn => btn.onclick = () => {
      const tid = btn.dataset.tdel, tg = P().tags.find(x => x.id === tid); if(!tg) return;
      const n = P().transactions.filter(t => (t.tags||[]).includes(tid)).length;
      if(!confirm(`Delete the "${tg.name}" tag?${n?` It's on ${n} transaction${n===1?"":"s"} — they'll just lose the tag, nothing else changes.`:""}`)) return;
      snapshot();
      P().tags = P().tags.filter(x => x.id !== tid);
      P().transactions.forEach(t => { if(t.tags) t.tags = t.tags.filter(x => x !== tid); });
      commit(); toast("Tag deleted");
    });
    $("#addTag").onclick = () => {
      snapshot();
      const used = new Set((P().tags||[]).map(x => x.color));
      const free = TAG_PALETTE.find(c => !used.has(c.k)) || TAG_PALETTE[(P().tags||[]).length % TAG_PALETTE.length];
      P().tags = P().tags || []; P().tags.push({id:uid(), name:"New tag", color:free.k});
      commit(); toast("Tag added — rename it below");
    };
    const bind = (sel,k,num) => $(sel).onchange = e => { snapshot(); P()[k] = num ? (Number(e.target.value)||0) : e.target.value; commit(); };
    bind("#sName","name"); bind("#sAddr","address");
    if($("#sOwnerLink")) $("#sOwnerLink").onclick = e => { e.preventDefault(); go("owner"); }; bind("#sTarget","invoiceTarget",true); bind("#sFee","feePct",true); bind("#sFeeLabel","feeLabel");
    $("#sHold").onchange = e => { snapshot(); P().holdRules = e.target.value.split(",").map(x=>x.trim()).filter(Boolean); commit(); };
    $("#sHeldNote").onchange = e => { snapshot(); P().heldNote = e.target.value.trim(); commit(); };
    if($("#sHoldApply")) $("#sHoldApply").onclick = () => {
      snapshot(); let n = 0;
      P().transactions.forEach(t => { if(t.status === "billable" && holdMatch(t, P())){ t.status = "review"; n++; } });
      commit(); toast(`${n} charge${n===1?"":"s"} moved to on hold`);
    };
    if($("#sHoldRelease")) $("#sHoldRelease").onclick = () => {
      if(!confirm("Release every held charge back into billing? They'll flow into invoices immediately.")) return;
      snapshot(); let n = 0;
      P().transactions.forEach(t => { if(t.status === "review"){ t.status = "billable"; n++; } });
      commit(); toast(`${n} released into billing`);
    };

    const ad = $("#autoDesc"), ab = $("#sAuto"), ao = $("#sAutoOff");
    if(!AutoFile.supported()){
      ad.textContent = "This browser keeps everything in its own storage. Autosaving to a file needs Chrome or Edge — until then, download a backup after each session.";
      ab.textContent = "Not available here"; ab.disabled = true;
    } else if(AutoFile.state === "on"){
      ad.innerHTML = `Every change to every property writes to <b>${esc(AutoFile.name)}</b>. Keep that file in a synced folder and the whole portfolio follows you between machines.`;
      ab.textContent = "Change file"; ao.style.display = "";
    } else if(AutoFile.state === "needs"){
      ad.innerHTML = `Chrome needs one click per session before it can write to <b>${esc(AutoFile.name)}</b> again.`;
      ab.textContent = "Reconnect";
    } else {
      ad.textContent = "Choose a .json file once and every change writes straight to it — no account, no server. One file holds every property.";
      ab.textContent = "Choose a file";
    }
    ab.onclick = () => (AutoFile.state === "needs" ? AutoFile.regrant() : AutoFile.connect()).then(render);
    ao.onclick = () => AutoFile.disconnect().then(render);
    $("#sCsv").onclick = exportTxnCsv;
    $("#sArchive").onclick = () => { snapshot(); P().archived = !P().archived; commit(); toast(P().archived?"Archived":"Unarchived"); };
    $("#sDelete").onclick = () => {
      if(S.properties.length <= 1) return toast("Keep at least one property");
      if(!confirm(`Delete ${P().name} and all ${P().transactions.length} of its transactions? This can be undone with Ctrl+Z until you reload.`)) return;
      snapshot();
      S.properties = S.properties.filter(x => x.id !== S.activeId);
      S.activeId = S.properties[0].id; S.ui.view = "portfolio";
      commit(); toast("Property deleted");
    };
  },0);
}

function dupProp(){
  const p = P();
  snapshot();
  const map = {};
  const units = p.units.map(u => { const n = {id:uid(), name:u.name}; map[u.id] = n.id; return n; });
  const split = {}; Object.entries(p.defaultSplit||{}).forEach(([k,v]) => { if(map[k]) split[map[k]] = v; });
  const np = newProperty({name:p.name + " (copy)", owner:p.owner, invoiceTarget:p.invoiceTarget,
    feePct:p.feePct, feeLabel:p.feeLabel, units, defaultSplit:split, ownerInfo:JSON.parse(JSON.stringify(ownerOf(p))), holdRules:(p.holdRules||[]).slice()});
  np.ownerId = p.ownerId || null;
  S.properties.push(np); S.activeId = np.id; S.ui.view = "settings";
  commit(); toast("Template created — same units, fee, and cap; no transactions");
}

/* ===================== NEW PROPERTY ===================== */
function newPropSheet(){
  const sh = $("#sheet");
  sh.innerHTML = `
    <div class="sheet-h"><h3>New property</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <label class="fld"><span>Property name</span><input type="text" id="n_name" placeholder="118 Rutledge Ave"></label>
      <label class="fld"><span>Owner</span><select id="n_pick">
        <option value="__new">+ New owner</option>
        ${(S.owners||[]).filter(ownerLabel).sort((a,b) => ownerLabel(a).localeCompare(ownerLabel(b))).map(o => { const n = ownerProps(o, true).length; return `<option value="${o.id}">${esc(ownerLabel(o))}${n ? ` — already owns ${n}` : ""}</option>`; }).join("")}
      </select><span class="help">Pick an existing owner if they already own another property here — invoices still stay separate.</span></label>
      <div class="f2" id="n_newown"><label class="fld"><span>Owner name</span><input type="text" id="n_owner" placeholder="Who gets billed"></label>
      <label class="fld"><span>Owner email</span><input type="email" id="n_email" placeholder="optional"></label></div>
      <div class="f2">
        <label class="fld"><span>Invoice cap</span><input type="number" id="n_target" value="10000"></label>
        <label class="fld"><span>Project fee %</span><input type="number" step="0.01" id="n_fee" value="15"></label>
      </div>
      <label class="fld"><span>Units</span><input type="text" id="n_units" placeholder="Unit A, Unit B">
        <span class="help">Comma separated. Leave blank for a single-unit property — one invoice run for the whole building.</span></label>
    </div>
    <div class="sheet-f"><span style="flex:1"></span>
      <button class="btn" id="n_cancel">Cancel</button><button class="btn primary" id="n_save">Create</button></div>`;
  $("#shClose").onclick = $("#n_cancel").onclick = closeSheet;
  $("#n_save").onclick = () => {
    const names = ($("#n_units").value.split(",").map(s => s.trim()).filter(Boolean));
    const units = (names.length ? names : ["Whole property"]).map(n => ({id:uid(), name:n}));
    snapshot();
    const p = newProperty({
      name:$("#n_name").value.trim() || "New property", owner:$("#n_owner").value.trim(),
      invoiceTarget:Number($("#n_target").value)||10000, feePct:Number($("#n_fee").value)||0, units
    });
    if(units.length === 2) p.defaultSplit = {[units[0].id]:50,[units[1].id]:50};
    { const pick = $("#n_pick") ? $("#n_pick").value : "__new";
      if(pick !== "__new"){ p.ownerId = pick; }
      else { const nm = $("#n_owner").value.trim(), em = $("#n_email").value.trim();
        p.ownerId = null;
        if(nm || em){ const m = findOwnerMatch({name:nm, email:em});
          if(m) p.ownerId = m.id;
          else { const o = cleanOwner(Object.assign(blankOwner(), {id:uid(), name:nm, email:em})); S.owners = S.owners || []; S.owners.push(o); p.ownerId = o.id; } } } }
    S.properties.push(p); S.activeId = p.id; S.ui.view = "txns"; S.ui.unit = units[0].id;
    closeSheet(); commit(); toast("Property created — import or add transactions next");
  };
  openPanel();
}

/* ===================== IMPORT ===================== */
const FIELDS = [["skip","Skip"],["date","Date"],["vendor","Vendor"],["desc","Item / description"],
  ["amount","Amount"],["unit","Unit"],["receipt","Receipt / source"],["notes","Notes"]];
function guessField(h){
  const s = h.toLowerCase().trim();
  if(/date/.test(s)) return "date";
  if(/vendor|payee|merchant|supplier|company/.test(s)) return "vendor";
  if(/desc|item|memo|detail|scope of work|work/.test(s)) return "desc";
  if(/amount|total|cost|price|billable|charge/.test(s)) return "amount";
  if(/unit|apt|suite|property|scope/.test(s)) return "unit";
  if(/receipt|source|file|invoice|doc|link|attach/.test(s)) return "receipt";
  if(/note|comment/.test(s)) return "notes";
  return "skip";
}
function parseTable(text){
  const raw = text.replace(/\r\n/g,"\n").trim();
  if(!raw) return [];
  const delim = (raw.split("\n")[0].match(/\t/g)||[]).length >= (raw.split("\n")[0].match(/,/g)||[]).length ? "\t" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for(let i=0;i<raw.length;i++){
    const ch = raw[i];
    if(q){ if(ch === '"'){ if(raw[i+1] === '"'){ cell += '"'; i++; } else q = false; } else cell += ch; }
    else if(ch === '"') q = true;
    else if(ch === delim){ row.push(cell); cell = ""; }
    else if(ch === "\n"){ row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  row.push(cell); rows.push(row);
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}
const parseAmount = v => {
  const raw = String(v).trim();
  const neg = /^\(.*\)$/.test(raw) || /^-/.test(raw);      // accounting exports wrap credits in parentheses
  const n = Number(raw.replace(/[^0-9.]/g,""));
  return isFinite(n) ? (neg ? -n : n) : 0;
};
function parseDate(v){
  const s = String(v).trim(); if(!s) return "";
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){ let y = m[3]; if(y.length === 2) y = "20"+y; return `${y}-${String(m[1]).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`; }
  const d = new Date(s); return isNaN(d) ? "" : d.toISOString().slice(0,10);
}

function importSheet(){
  const p = P();
  const sh = $("#sheet");
  sh.innerHTML = `
    <div class="sheet-h"><h3>Import transactions</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <p class="muted" style="font-size:13.3px;margin-top:0">Copy the rows straight out of a spreadsheet — headers included — and paste them here. Everything lands in <b>${esc(p.name)}</b> at the end of the billing order.</p>
      <label class="fld"><span>Pasted rows</span><textarea id="i_text" rows="7" placeholder="Date	Vendor	Description	Unit	Amount&#10;7/28/2026	Lowes	Countertops	Unit K	3821.31"></textarea></label>
      <button class="btn" id="i_parse">Read the columns</button>
      <div id="i_map"></div>
    </div>
    <div class="sheet-f"><span style="flex:1"></span>
      <button class="btn" id="i_cancel">Cancel</button>
      <button class="btn primary" id="i_go" disabled>Import</button></div>`;
  $("#shClose").onclick = $("#i_cancel").onclick = closeSheet;

  let rows = [], map = [], hasHeader = true;
  const draw = () => {
    const head = rows[0] || [];
    const body = hasHeader ? rows.slice(1) : rows;
    $("#i_map").innerHTML = `<hr class="sep">
      <label class="switchbox" style="margin-bottom:12px"><input type="checkbox" id="i_head" ${hasHeader?"checked":""}> First row is a header</label>
      <div class="label" style="margin-bottom:8px">Match your columns</div>
      ${head.map((h,i) => `<div class="map-r"><span class="muted">${esc(hasHeader ? (h||"Column "+(i+1)) : "Column "+(i+1))}</span>
        <select data-col="${i}">${FIELDS.map(([v,l]) => `<option value="${v}" ${map[i]===v?"selected":""}>${l}</option>`).join("")}</select></div>`).join("")}
      <div class="prev"><table><thead><tr>${head.map((h,i)=>`<th>${esc(hasHeader?h:"Col "+(i+1))}</th>`).join("")}</tr></thead>
        <tbody>${body.slice(0,6).map(r=>`<tr>${r.map(c=>`<td>${esc(String(c).slice(0,28))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="muted" style="font-size:12.5px">${body.length} row${body.length===1?"":"s"} ready. Unit names are matched to this property's units; anything unrecognised goes to <b>${esc(p.units[0].name)}</b> and gets flagged.</p>
      <p id="i_why" style="font-size:12.5px;color:var(--gold);margin:6px 0 0"></p>`;
    $("#i_head").onchange = e => { hasHeader = e.target.checked; draw(); };
    // re-check after EVERY mapping change — otherwise fixing the dropdown left the button stuck disabled
    $("#i_map").querySelectorAll("[data-col]").forEach(sel => sel.onchange = e => {
      map[+e.target.dataset.col] = e.target.value; validate();
    });
    validate();
  };
  const validate = () => {
    const body = hasHeader ? rows.slice(1) : rows;
    const why = !body.length ? "Nothing to import — paste some rows above."
      : !map.includes("amount") ? "Set one column to “Amount” before importing."
      : map.filter(m => m !== "skip").length !== new Set(map.filter(m => m !== "skip")).size
        ? "Two columns are mapped to the same field — each one can only be used once."
      : "";
    const n = $("#i_why"); if(n) n.textContent = why;
    const go = $("#i_go");
    if(go){ go.disabled = !!why; go.textContent = why ? "Import" : `Import ${body.length} row${body.length===1?"":"s"}`; }
  };
  $("#i_parse").onclick = () => {
    rows = parseTable($("#i_text").value);
    if(!rows.length) return toast("Nothing to read — paste some rows first");
    const cols = Math.max(...rows.map(r => r.length));
    rows = rows.map(r => { const c = r.slice(); while(c.length < cols) c.push(""); return c; });
    map = rows[0].map(h => guessField(String(h)));
    if(!map.includes("amount") && !map.includes("desc")){ hasHeader = false; map = rows[0].map(() => "skip"); }
    draw();
  };
  $("#i_go").onclick = () => {
    const body = hasHeader ? rows.slice(1) : rows;
    const col = f => map.indexOf(f);
    const unitByName = {};
    p.units.forEach(u => unitByName[u.name.toLowerCase().trim()] = u.id);
    let unmatched = 0;
    snapshot();
    body.forEach(r => {
      const get = f => col(f) >= 0 ? String(r[col(f)] ?? "").trim() : "";
      const amt = parseAmount(get("amount"));
      const uname = get("unit").toLowerCase();
      let unitId = unitByName[uname];
      if(!unitId){
        const hit = Object.keys(unitByName).find(k => uname && (k.includes(uname) || uname.includes(k)));
        unitId = hit ? unitByName[hit] : p.units[0].id;
        if(!hit && get("unit")) unmatched++;
      }
      const rec = get("receipt");
      p.transactions.push({
        id:uid(), date:parseDate(get("date")), vendor:get("vendor"), desc:get("desc") || "Imported item",
        receipt:rec, link:/^(https?:\/\/|www\.)/i.test(rec) ? rec : "", amount:amt,
        scope:{type:"single", unit:unitId, splits:{}},
        status: (amt > 0 && !holdMatch({desc:get("desc"), vendor:get("vendor")}, p)) ? "billable" : "review",
        applyFee:true, allowPartial:true, pin:null, party:"Owner",
        notes:get("notes") + (get("unit") && !unitByName[uname] ? ` [imported unit "${get("unit")}" — confirm]` : "")
      });
    });
    closeSheet(); commit();
    toast(`Imported ${body.length} transaction${body.length===1?"":"s"}${unmatched?` · ${unmatched} need a unit confirmed`:""}`);
  };
  openPanel();
}

/* ===================== ORGANIZATION TAGS ===================== */
/* Tags never touch billing math, so toggling one skips recalc() entirely —
   just patch the DOM in place, unless a tag filter is active and the row
   might need to appear or disappear. */
/* ============================================================
   RECONCILIATION
   ------------------------------------------------------------
   "Reconciled" means matched against your own bank/card record —
   entirely separate from whether the owner has been billed or
   paid. It spans every property, on and off the books (excluded
   transactions still cost real money and still need matching),
   so it lives at the portfolio level rather than per-property.
   ============================================================ */
function reconcileEntries(){
  const out = [];
  S.properties.forEach(p => p.transactions.forEach(t => {
    const c = ALL[p.id];
    const info = c ? c.txn[t.id] : null;
    out.push({
      propId:p.id, propName:p.name, txnId:t.id,
      date:t.date||"", vendor:t.vendor||"", desc:t.desc||"", amount:Number(t.amount)||0,
      receipt:t.receipt||"", link:linkOf(t), status:t.status,
      pay: info ? info.pay : "",
      reconciled: !!t.reconciled, reconciledAt: t.reconciledAt||"",
      unit: t.scope.type === "single" ? ((p.units.find(u => u.id === t.scope.unit)||{}).name||"") : "Split"
    });
  }));
  return out;
}
function toggleReconciled(propId, txnId){
  const p = S.properties.find(x => x.id === propId); if(!p) return;
  const t = p.transactions.find(x => x.id === txnId); if(!t) return;
  snapshot();
  t.reconciled = !t.reconciled;
  t.reconciledAt = t.reconciled ? new Date().toISOString().slice(0,10) : "";
  Store.save(S); AutoFile.queue(); render();     // membership in lists can change, so a full render is right here
  if(S.ui.view === "reconcile") toast(t.reconciled ? "Reconciled — see the Reconciled tab below" : "Back in Unreconciled");
}
function searchReconcile(q){
  q = (q||"").trim(); if(!q) return [];
  const digits = q.replace(/[^0-9.]/g,"");
  const qNum = digits.length ? parseFloat(digits) : null;
  const qLower = q.toLowerCase();
  const scored = [];
  reconcileEntries().forEach(e => {
    let score = null;
    const absAmt = Math.abs(e.amount);
    if(qNum != null){
      if(Math.abs(absAmt - qNum) < 0.005) score = 0;
      else if(digits.length >= 2 && absAmt.toFixed(2).replace(".","").includes(digits.replace(".",""))) score = 1;
    }
    if(score === null && qLower.length >= 2){
      const hay = `${e.vendor} ${e.desc} ${e.receipt}`.toLowerCase();
      if(hay.includes(qLower)) score = 2;
    }
    if(score !== null) scored.push(Object.assign({score}, e));
  });
  scored.sort((a,b) => a.score - b.score || (b.date||"").localeCompare(a.date||""));
  return scored.slice(0,30);
}
function entryRowHTML(e){
  const payCls = {Paid:"green","Part paid":"green",Invoiced:"acc","Part invoiced":"acc",Unbilled:"grey"}[e.pay] || "grey";
  const stTag = e.status === "excluded" ? `<span class="tag grey">Not billable</span>`
    : e.status === "review" ? `<span class="tag gold">On hold</span>`
    : e.pay ? `<span class="tag ${payCls}">${esc(e.pay)}</span>` : "";
  const reconTag = e.reconciled ? `<span class="tag green" title="Marked reconciled${e.reconciledAt?" on "+fdateS(e.reconciledAt):""}">✓ Reconciled${e.reconciledAt?" · "+fdateS(e.reconciledAt):""}</span>` : "";
  return `<div class="rc-row${e.reconciled?" rc-done":""}" data-prop="${e.propId}" data-txn="${e.txnId}">
    <label class="rc-check"><input type="checkbox" ${e.reconciled?"checked":""} data-recon="${e.propId}|${e.txnId}"></label>
    <div class="rc-main">
      <div class="rc-top"><b class="num"${e.amount<0?' style="color:var(--green)"':""}>${usd(cents(e.amount))}</b>
        <span class="rc-prop">${esc(e.propName)}</span>${e.unit && e.unit !== "Split" ? ` · ${esc(e.unit)}` : ""}</div>
      <div class="rc-sub">${esc(e.desc||"Untitled")} <span class="muted">· ${esc(e.vendor||"—")}</span>${e.date?` · ${fdateS(e.date)}`:""}</div>
    </div>
    ${reconTag}${stTag}<span class="chev">›</span></div>`;
}
function wireRcRows(container){
  container.querySelectorAll(".rc-row").forEach(row => {
    row.onclick = e => {
      if(e.target.closest("[data-recon]")) return;
      go("txns", row.dataset.prop);
      openSheet(row.dataset.txn);
    };
    const cb = row.querySelector("[data-recon]");
    if(cb) cb.onclick = e => { e.stopPropagation(); const [pid,tid] = cb.dataset.recon.split("|"); toggleReconciled(pid,tid); };
  });
}
function exportUnreconciledCsv(){
  const rows = [["Property","Date","Vendor","Item","Amount","Receipt","Receipt link"]];
  reconcileEntries().filter(e => !e.reconciled).forEach(e => {
    rows.push([e.propName, e.date, e.vendor, e.desc, e.amount.toFixed(2), e.receipt, e.link]);
  });
  download("Unreconciled transactions.csv", toCSV(rows));
}

function toggleTag(txnId, tagId){
  const t = P().transactions.find(x => x.id === txnId); if(!t) return;
  snapshot();
  t.tags = t.tags || [];
  const i = t.tags.indexOf(tagId);
  if(i >= 0) t.tags.splice(i,1); else t.tags.push(tagId);
  Store.save(S); AutoFile.queue();
  if(S.ui.filterTag){ render(); return; }
  const row = document.querySelector(`tr[data-id="${txnId}"] .tagpills`);
  if(row) row.innerHTML = tagPillsHTML(t, P());
  const chip = document.querySelector(`.tagchip[data-tid="${tagId}"]`);
  if(chip){ const c = tagColor((P().tags.find(x=>x.id===tagId)||{}).color);
    const on = t.tags.includes(tagId);
    chip.setAttribute("aria-pressed", on); chip.style.background = on ? c.bg : "#fff"; }
}
function ensureTagPop(){
  let el = document.getElementById("tagPop");
  if(!el){ el = document.createElement("div"); el.id = "tagPop"; el.className = "tagpop"; document.body.appendChild(el); }
  return el;
}
function closeTagPop(){ const el = document.getElementById("tagPop"); if(el) el.classList.remove("on"); }
function onDocClickTagPop(e){
  const el = document.getElementById("tagPop"); if(!el) return;
  if(el.contains(e.target) || e.target.closest("[data-tagbtn]")) return;
  closeTagPop(); document.removeEventListener("click", onDocClickTagPop);
}
function openTagPop(anchor, txnId){
  const el = ensureTagPop();
  const draw = () => {
    const t = P().transactions.find(x => x.id === txnId); if(!t) return;
    const tags = P().tags || [];
    el.innerHTML = `<div class="tagpop-list">${
      tags.length ? tags.map(tg => { const c = tagColor(tg.color), on = (t.tags||[]).includes(tg.id);
        return `<label class="tagpop-row"><input type="checkbox" data-tog="${tg.id}" ${on?"checked":""}>
          <i class="dot" style="background:${c.fg}"></i><span>${esc(tg.name)}</span></label>`; }).join("")
        : `<div class="muted" style="font-size:12.5px;padding:4px 2px">No tags yet — add one below.</div>`
    }</div>
    <div class="tagpop-add"><input type="text" id="tp_new" placeholder="New tag…" maxlength="24"><button class="btn sm" id="tp_addbtn">Add</button></div>
    <button class="btn sm ghost" id="tp_manage" style="width:100%;margin-top:6px">Manage tags</button>`;
    el.querySelectorAll("[data-tog]").forEach(cb => cb.onchange = () => toggleTag(txnId, cb.dataset.tog));
    el.querySelector("#tp_addbtn").onclick = () => {
      const name = el.querySelector("#tp_new").value.trim(); if(!name) return;
      snapshot();
      const used = new Set((P().tags||[]).map(x => x.color));
      const free = TAG_PALETTE.find(c => !used.has(c.k)) || TAG_PALETTE[(P().tags||[]).length % TAG_PALETTE.length];
      const nt = {id:uid(), name, color:free.k};
      P().tags = P().tags || []; P().tags.push(nt);
      const live = P().transactions.find(x => x.id === txnId);
      if(live){ live.tags = live.tags || []; live.tags.push(nt.id); }
      Store.save(S); AutoFile.queue();
      const row = document.querySelector(`tr[data-id="${txnId}"] .tagpills`);
      if(row && live) row.innerHTML = tagPillsHTML(live, P());
      draw();
    };
    el.querySelector("#tp_new").onkeydown = e => { if(e.key === "Enter") el.querySelector("#tp_addbtn").click(); };
    el.querySelector("#tp_manage").onclick = () => { closeTagPop(); go("settings"); };
  };
  draw();
  const r = anchor.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 226)) + "px";
  el.style.top  = (r.bottom + 6) + "px";
  el.classList.add("on");
  setTimeout(() => document.addEventListener("click", onDocClickTagPop), 0);
}

/* ===================== TRANSACTION EDITOR ===================== */
function openPanel(){ const sh=$("#sheet"); sh.classList.add("on"); $("#scrim").classList.add("on"); sh.setAttribute("aria-hidden","false"); }
function closeSheet(){ $("#sheet").onkeydown = null; $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on"); $("#sheet").setAttribute("aria-hidden","true"); }

function openSheet(id, preset){
  const p = P();
  const isNew = !id;
  const t = isNew
    ? Object.assign({id:uid(), date:new Date().toISOString().slice(0,10), vendor:"", desc:"", receipt:"", amount:"",
       link:"", scope:{type:"single", unit:p.units[0]?.id, splits:{}}, status:"billable", applyFee:true, allowPartial:true, pin:null, notes:""},
       preset ? JSON.parse(JSON.stringify(preset)) : {}, {id:uid()})
    : JSON.parse(JSON.stringify(p.transactions.find(x => x.id === id)));

  const sh = $("#sheet");
  sh.innerHTML = `
    <div class="sheet-h"><h3>${isNew ? "New transaction" : "Edit transaction"}</h3>
      <button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="f2">
        <label class="fld"><span>Date</span><input type="date" id="e_date" value="${esc(t.date)}"></label>
        <label class="fld"><span id="e_amtlabel">Amount</span>
          <input type="number" step="0.01" min="0" id="e_amt" value="${t.amount === "" ? "" : Math.abs(Number(t.amount)||0)}">
          <span class="help" id="e_amthint"></span></label>
      </div>
      <label class="opt" style="margin-bottom:14px"><input type="checkbox" id="e_credit" ${Number(t.amount)<0?"checked":""}>
        <span><b>This is a credit or refund</b><small>A returned item or a price correction. It reduces the next open invoice instead of adding to it.</small></span></label>
      <label class="fld"><span>Vendor</span><input type="text" id="e_vendor" value="${esc(t.vendor)}" placeholder="Lowes" list="vendorList" autocomplete="off"><datalist id="vendorList">${knownVendors().map(v => `<option value="${esc(v.name)}">`).join("")}</datalist></label>
      <label class="fld"><span>Item</span><input type="text" id="e_desc" value="${esc(t.desc)}" placeholder="Kitchen cabinets"></label>
      <label class="fld"><span>Receipt or source</span><input type="text" id="e_receipt" value="${esc(t.receipt)}" placeholder="File name"></label>
      <label class="fld"><span>Receipt link</span>
        <input type="text" id="e_link" value="${esc(t.link||"")}" placeholder="https://… link to the PDF">
        <span class="help" id="e_linkrow"></span></label>
      <hr class="sep">
      <label class="fld"><span>Assigned to</span>
        <select id="e_scope">
          <option value="single" ${t.scope.type==="single"?"selected":""}>One unit</option>
          <option value="split" ${t.scope.type==="split"?"selected":""}>Split across units</option>
        </select></label>
      <div id="e_single" style="${t.scope.type==="single"?"":"display:none"}">
        <label class="fld"><span>Unit</span><select id="e_unit">${p.units.map(u=>`<option value="${u.id}" ${t.scope.unit===u.id?"selected":""}>${esc(u.name)}</option>`).join("")}</select></label>
      </div>
      <div id="e_split" style="${t.scope.type==="split"?"":"display:none"}">
        ${p.units.map(u=>`<div class="split-r"><span>${esc(u.name)}</span>
          <input type="number" min="0" max="100" step="0.01" data-sp="${u.id}" value="${t.scope.splits?.[u.id] ?? (p.defaultSplit?.[u.id] ?? "")}"><span style="flex:none">%</span></div>`).join("")}
        <div class="muted" style="font-size:12.5px" id="e_sum"></div>
      </div>
      <hr class="sep">
      <label class="fld"><span>Billing state</span>
        <select id="e_status">
          <option value="billable" ${t.status==="billable"?"selected":""}>Bill to owner</option>
          <option value="review" ${t.status==="review"?"selected":""}>On hold</option>
          <option value="excluded" ${t.status==="excluded"&&!t.charge?"selected":""}>Not billable (PHD absorbs it)</option>
          <option value="charge" ${t.charge?"selected":""}>Bill to a contractor or vendor</option>
        </select></label>
      <label class="opt"><input type="checkbox" id="e_fee" ${t.applyFee!==false?"checked":""}>
        <span><b>Charge the ${p.feePct}% project fee</b><small>Turn off for pass-through items billed at cost — consultation fees, permits, deposits.</small></span></label>
      <label class="opt"><input type="checkbox" id="e_whole" ${t.allowPartial===false?"checked":""}>
        <span><b>Keep whole on one invoice</b><small>Off by default. When on, if the amount won't fit, the current invoice closes early and this starts the next one.</small></span></label>
      <label class="fld"><span>Start on invoice</span><input type="number" min="1" id="e_pin" value="${t.pin||""}" placeholder="Automatic">
        <span class="help">Forces where this begins. Anything past the ${usd0(cents(p.invoiceTarget))} cap continues on the next invoice.</span></label>
      <label class="fld"><span>Work item</span>
        <select id="e_work">
          <option value="">Match automatically</option>
          ${(p.scope||[]).map(i=>`<option value="${i.id}" ${t.work===i.id?"selected":""}>${esc(i.name)}</option>`).join("")}
          <option value="none" ${t.work==="none"?"selected":""}>Never match</option>
        </select><span class="help" id="e_workhint"></span></label>
      <label class="fld"><span>Notes</span><textarea id="e_notes" rows="2">${esc(t.notes||"")}</textarea></label>
      <hr class="sep">
      <label class="opt"><input type="checkbox" id="e_reconciled" ${t.reconciled?"checked":""}>
        <span><b>Reconciled</b><small>Matched against your bank or card statement. Nothing to do with whether the owner has been billed.</small></span></label>
      <hr class="sep">
      <div class="label" style="margin-bottom:8px;display:flex;align-items:center;gap:8px">Tags
        <button type="button" class="btn sm ghost" id="e_tagmanage" style="margin-left:auto">Manage tags</button></div>
      <div class="tagchips" id="e_tagchips">${(p.tags||[]).map(tg => { const c = tagColor(tg.color), on = (t.tags||[]).includes(tg.id);
        return `<button type="button" class="tagchip" data-tid="${tg.id}" aria-pressed="${on}" style="border-color:${c.bd};color:${c.fg};background:${on?c.bg:"#fff"}">${esc(tg.name)}</button>`; }).join("")
        || `<span class="muted" style="font-size:12.5px">No tags yet — Manage tags to add some.</span>`}</div>
      <p class="help" style="margin:-10px 0 16px">For your own organizing — never shown to the owner or on any invoice. Changes save as you click, independent of the rest of this form.</p>
      <div id="e_where"></div>
    </div>
    <div class="sheet-f">
      ${isNew?"":`<button class="btn danger" id="e_del">Delete</button><button class="btn ghost" id="e_dup" title="Start a new transaction with these details">Duplicate</button>`}
      <span style="flex:1"></span>
      <button class="btn ghost" id="e_cancel">Cancel</button>
      ${isNew?`<button class="btn" id="e_again" title="Save and start another with the same date, vendor and unit">Save &amp; add another</button>`:""}
      <button class="btn primary" id="e_save">${isNew?"Add":"Save"} <kbd>⌘↵</kbd></button>
    </div>`;

  const lockedC = isNew ? 0 : ((COMP.txn[id]||{}).lockedC || 0);
  if(lockedC){
    const full = Math.abs(lockedC) >= Math.abs(cents(t.amount));
    const fullLockedUsd = Math.abs(lockedC) / 100;
    const banner = elm("div","");
    banner.style.cssText = "background:var(--gold-soft);border:1px solid #E6D6AE;border-radius:var(--r-sm);padding:12px 14px;margin-bottom:16px";
    banner.innerHTML = `<div style="font-weight:600;font-size:13.3px;color:#79530F;margin-bottom:4px">
        ${full?"Locked — already invoiced":"Partly locked — already invoiced"}</div>
      <div style="font-size:12.5px;color:#79530F;line-height:1.5">
        ${usd(Math.abs(lockedC))} of this charge sits on an invoice that has been issued, so it can't be edited here.
        Correct it with a credit instead — say only 3 of the 20 items on this order came back, credit just that portion.
        It lands on the next open invoice and this line stays on the record as billed.</div>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:11px">
        <label class="fld" style="margin:0;flex:1;min-width:130px"><span style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#79530F;font-weight:600;display:block;margin-bottom:4px">Credit amount</span>
          <input type="number" step="0.01" min="0.01" id="e_creditamt" value="${fullLockedUsd.toFixed(2)}"></label>
        <button class="btn primary sm" id="e_makecredit" style="margin-bottom:1px">Add credit</button>
      </div>
      <p id="e_creditamt_hint" style="font-size:12px;color:#79530F;margin:6px 0 0"></p>
      <label class="fld" style="margin:8px 0 0"><span style="font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#79530F;font-weight:600;display:block;margin-bottom:4px">Note (optional)</span>
        <input type="text" id="e_creditnote" placeholder="e.g. 3 of the 20 items returned"></label>`;
    $(".sheet-b").prepend(banner);
    ["e_date","e_amt","e_vendor","e_desc","e_scope","e_unit","e_status","e_fee","e_whole","e_pin"]
      .forEach(k => { const n = $("#"+k); if(n) n.disabled = true; });
    /* a disabled tickbox just invites clicking — remove it and point at the real action */
    const cbox = $("#e_credit");
    if(cbox && cbox.closest("label")) cbox.closest("label").remove();
    sh.querySelectorAll("[data-sp]").forEach(n => n.disabled = true);
    if($("#e_del")) $("#e_del").remove();

    /* Notes, receipt/link, and work item are the record-keeping fields — they
       don't touch billing, so they stay editable on a locked charge. Save is
       a no-op here (below), so these save the moment you leave the field. */
    const liveSave = (field, read) => {
      const n = $("#"+field); if(!n) return;
      n.addEventListener("change", () => {
        const live = P().transactions.find(x => x.id === t.id); if(!live) return;
        const val = read ? read(n) : n.value.trim();
        if(live[field.replace("e_","")] === val) return;
        snapshot();
        live[field.replace("e_","")] = val;
        commit();
      });
    };
    liveSave("e_notes"); liveSave("e_receipt"); liveSave("e_link");
  const rbox = $("#e_reconciled");
  if(rbox && !isNew) rbox.onchange = () => {
    const live = P().transactions.find(x => x.id === id); if(!live) return;
    snapshot(); live.reconciled = rbox.checked; live.reconciledAt = rbox.checked ? new Date().toISOString().slice(0,10) : "";
    commit();
  };
    const workSel = $("#e_work");
    if(workSel) workSel.addEventListener("change", () => {
      const live = P().transactions.find(x => x.id === t.id); if(!live) return;
      snapshot();
      if(workSel.value) live.work = workSel.value; else delete live.work;
      commit();
    });

    const creditHint = () => {
      const amt = Math.abs(Number($("#e_creditamt").value)||0);
      const h = $("#e_creditamt_hint"); if(!h) return;
      if(!(amt > 0)) h.textContent = "Enter how much of this charge is being credited.";
      else if(amt < fullLockedUsd - 0.004) h.textContent = `Partial — the rest of this line (${usd(cents(fullLockedUsd - amt))}) stays billed as-is.`;
      else if(amt > fullLockedUsd + 0.004) h.textContent = `More than the ${usd(cents(fullLockedUsd))} invoiced on this line — whatever doesn't offset an open charge carries forward.`;
      else h.textContent = `Credits this line in full.`;
    };
    $("#e_creditamt").oninput = creditHint; creditHint();
    const submitCredit = () => {
      const amt = Math.abs(Number($("#e_creditamt").value)||0);
      if(!(amt > 0)) return toast("Enter a credit amount greater than zero");
      const extra = $("#e_creditnote").value.trim();
      const partial = Math.abs(amt - fullLockedUsd) > 0.004;
      const p2 = P();
      snapshot();
      const hasReturnTag = p2.tags && p2.tags.some(tg => tg.id === RETURN_TAG_ID);
      const creditTags = hasReturnTag ? [RETURN_TAG_ID] : [];
      const baseNote = partial
        ? `Partial credit against ${t.desc||"charge"} — ${usd(cents(amt))} of ${usd(cents(fullLockedUsd))} invoiced.`
        : `Credit against ${t.desc||"charge"} billed on a locked invoice.`;
      p2.transactions.push({
        id:uid(), date:new Date().toISOString().slice(0,10),
        vendor:t.vendor, desc:(t.desc||"Charge") + (partial ? " — partial return" : " — return"),
        receipt:"", link:"", amount:-amt,
        scope:JSON.parse(JSON.stringify(t.scope)), status:"billable",
        applyFee:t.applyFee !== false, allowPartial:true, pin:null, party:t.party||"Owner",
        notes:[baseNote, extra].filter(Boolean).join(" "),
        tags:creditTags
      });
      // mark the original charge too, so it's easy to spot in the ledger
      const liveOrig = p2.transactions.find(x => x.id === t.id);
      if(liveOrig && hasReturnTag){ liveOrig.tags = liveOrig.tags || []; if(!liveOrig.tags.includes(RETURN_TAG_ID)) liveOrig.tags.push(RETURN_TAG_ID); }
      closeSheet(); commit();
      toast(`Credit of ${usd(cents(amt))} added — both charges tagged Return`);
    };
    $("#e_makecredit").onclick = submitCredit;
    $("#e_creditamt").addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); submitCredit(); } });
    $("#e_creditnote").addEventListener("keydown", e => { if(e.key === "Enter"){ e.preventDefault(); submitCredit(); } });
  }
  if(!isNew){
    const parts = COMP.txn[id].parts;
    $("#e_where").innerHTML = parts.length
      ? `<hr class="sep"><div class="label" style="margin-bottom:6px">Currently billed on</div>` +
        parts.map(x => `<div style="display:flex;gap:8px;font-size:13.3px;padding:4px 0"><span>${esc(p.units.find(u=>u.id===x.unitId)?.name)} · invoice ${x.no}</span><span class="num" style="margin-left:auto">${usd(x.expC)}</span></div>`).join("")
      : "";
  }
  const sum = () => {
    const s = [...sh.querySelectorAll("[data-sp]")].reduce((a,i)=>a+(Number(i.value)||0),0);
    $("#e_sum").innerHTML = Math.abs(s-100) < .001 ? "Totals 100%" : `<span style="color:var(--red)">Totals ${s}% — must be 100%</span>`;
  };
  $("#e_scope").onchange = e => {
    $("#e_single").style.display = e.target.value === "single" ? "" : "none";
    $("#e_split").style.display  = e.target.value === "split" ? "" : "none"; sum();
  };
  sh.querySelectorAll("[data-sp]").forEach(i => i.oninput = sum); sum();
  const showLink = () => {
    const u = linkOf({link:$("#e_link").value, receipt:$("#e_receipt").value});
    $("#e_linkrow").innerHTML = u
      ? `<a class="doc" href="${esc(u)}" target="_blank" rel="noopener">${docLabel(u)}</a> opens in a new tab`
      : "Paste a Drive, Dropbox, or QuickBooks link and it becomes a button on the row and the invoice.";
  };
  $("#e_link").oninput = showLink; $("#e_receipt").oninput = showLink; showLink();
  sh.querySelectorAll(".tagchip").forEach(b2 => b2.onclick = () => {
    const tid = b2.dataset.tid;
    if(isNew){
      const on = b2.getAttribute("aria-pressed") === "true";
      const c = tagColor(((p.tags||[]).find(x=>x.id===tid)||{}).color);
      b2.setAttribute("aria-pressed", (!on).toString());
      b2.style.background = !on ? c.bg : "#fff";
    } else {
      toggleTag(id, tid);
      const nowOn = ((P().transactions.find(x=>x.id===id)||{}).tags||[]).includes(tid);
      const c = tagColor(((p.tags||[]).find(x=>x.id===tid)||{}).color);
      b2.setAttribute("aria-pressed", nowOn.toString());
      b2.style.background = nowOn ? c.bg : "#fff";
    }
  });
  if($("#e_tagmanage")) $("#e_tagmanage").onclick = () => { closeSheet(); go("settings"); };
  const CREDIT_RE = /\b(credit|return|returned|refund|refunded)\b/i;
  const SUFFIX = " — return";
  const paintCredit = () => {
    const box = $("#e_credit"); if(!box) return;
    const cr = box.checked;
    const v = Math.abs(Number($("#e_amt").value)||0);
    $("#e_amtlabel").textContent = cr ? "Credit amount" : "Amount";
    $("#e_amthint").textContent = cr
      ? (v ? `Takes ${usd(cents(v))} off the next open invoice, fee included.`
           : "Enter the amount coming back to the owner.")
      : "";
    const h = sh.querySelector(".sheet-h h3");
    if(h) h.textContent = cr ? (isNew ? "New credit or refund" : "Credit or refund")
                             : (isNew ? "New transaction" : "Edit transaction");
    let tag = sh.querySelector("#e_credittag");
    if(cr && !tag){
      tag = elm("span","tag green","Credit"); tag.id = "e_credittag";
      h.insertAdjacentElement("afterend", tag);
    } else if(!cr && tag) tag.remove();
  };
  /* ticking the box labels the item itself, visibly and reversibly */
  const labelDesc = () => {
    const box = $("#e_credit"), d = $("#e_desc"); if(!box || !d) return;
    const txt = d.value.trim();
    if(box.checked){ if(txt && !CREDIT_RE.test(txt)) d.value = txt + SUFFIX; }
    else if(txt.endsWith(SUFFIX)) d.value = txt.slice(0, -SUFFIX.length);
  };
  if($("#e_credit")) $("#e_credit").onchange = () => { labelDesc(); paintCredit(); };
  $("#e_amt").oninput = () => {
    /* a pasted negative means a credit — normalise rather than fight the caret */
    if(String($("#e_amt").value).trim().startsWith("-")){
      const box = $("#e_credit");
      if(box && !box.disabled && !box.checked){ box.checked = true; labelDesc(); }
      $("#e_amt").value = Math.abs(Number($("#e_amt").value)||0);
    }
    paintCredit();
  };
  paintCredit();
  const wh = $("#e_workhint");
  if(wh){
    const auto = isNew ? null : COMP.workOf[id];
    const nm = auto ? (p.scope.find(i => i.id === auto)||{}).name : null;
    wh.textContent = (!t.work && nm) ? `Currently matching “${nm}” on its match words.`
      : (!t.work ? "No work item matches this yet." : "Pinned by hand — match words are ignored.");
  }
  $("#shClose").onclick = $("#e_cancel").onclick = closeSheet;
  if($("#e_del")) $("#e_del").onclick = () => {
    if(!confirm("Delete this transaction?")) return;
    snapshot(); P().transactions = P().transactions.filter(x => x.id !== id);
    closeSheet(); commit(); toast("Deleted");
  };
  const doSave = (again) => {
    if(lockedC){ closeSheet(); return toast("Locked — use a credit to correct an invoiced charge"); }
    snapshot();
    const rec = {
      id:t.id, date:$("#e_date").value, vendor:$("#e_vendor").value.trim(), desc:$("#e_desc").value.trim(),
      receipt:$("#e_receipt").value.trim(), link:$("#e_link").value.trim(),
      amount:(() => { const v = Math.abs(Number($("#e_amt").value)||0);
                      return ($("#e_credit") && $("#e_credit").checked) ? -v : v; })(),
      status:$("#e_status").value === "charge" ? "excluded" : $("#e_status").value,
      charge:chargeFromSheet(t),
      party:$("#e_status").value === "charge" ? "Contractor" : "Owner", notes:$("#e_notes").value.trim(),
      work:$("#e_work") && $("#e_work").value ? $("#e_work").value : undefined,
      applyFee:$("#e_fee").checked, allowPartial:!$("#e_whole").checked,
      pin:$("#e_pin").value.trim()==="" ? null : Math.max(1, parseInt($("#e_pin").value,10)||1),
      scope:{type:$("#e_scope").value, unit:$("#e_unit")?.value, splits:{}}
    };
    sh.querySelectorAll("[data-sp]").forEach(i => { const v = Number(i.value)||0; if(v) rec.scope.splits[i.dataset.sp] = v; });
    const T = P().transactions;
    if(isNew){
      rec.tags = [...sh.querySelectorAll('.tagchip[aria-pressed="true"]')].map(b2 => b2.dataset.tid);
      rec.reconciled = !!($("#e_reconciled") && $("#e_reconciled").checked);
      rec.reconciledAt = rec.reconciled ? new Date().toISOString().slice(0,10) : "";
      applyHoldRule(rec, P()); T.push(rec);
    } else {
      // tags and reconciled status are already live-saved by their own handlers — carry them over rather than resetting
      const prior = T.find(x => x.id === id) || {};
      rec.tags = prior.tags || [];
      rec.reconciled = !!prior.reconciled;
      rec.reconciledAt = prior.reconciledAt || "";
      T[T.findIndex(x => x.id === id)] = rec;
    }
    closeSheet(); commit(); toast(isNew ? "Transaction added" : "Saved", true);
    if(again) setTimeout(() => openSheet(null, {date:rec.date, vendor:rec.vendor, scope:rec.scope, applyFee:rec.applyFee, status:rec.status}), 340);
  };
  $("#e_save").onclick = () => doSave(false);
  if($("#e_again")) $("#e_again").onclick = () => doSave(true);
  if($("#e_dup")) $("#e_dup").onclick = () => {
    const src_ = P().transactions.find(x => x.id === id); if(!src_) return;
    closeSheet();
    setTimeout(() => openSheet(null, {date:new Date().toISOString().slice(0,10), vendor:src_.vendor, desc:src_.desc,
      amount:Math.abs(Number(src_.amount)||0), scope:JSON.parse(JSON.stringify(src_.scope)), applyFee:src_.applyFee !== false,
      allowPartial:src_.allowPartial !== false, status:src_.status === "excluded" ? "excluded" : "billable", receipt:"", link:""}), 320);
  };
  sh.onkeydown = e => { if((e.metaKey || e.ctrlKey) && e.key === "Enter"){ e.preventDefault(); if(lockedC) closeSheet(); else doSave(false); } };
  openPanel();
  setTimeout(() => { const f = (isNew && t.vendor) ? ($("#e_desc").value ? $("#e_amt") : $("#e_desc")) : $("#e_vendor"); if(f && !f.disabled) f.focus(); }, 300);
}

/* =====================================================================
   PRINTED DOCUMENTS — client statement and single-invoice document
   ---------------------------------------------------------------------
   Both share one stylesheet built for paper:
   · table headers repeat at the top of every page they continue onto
   · a row never splits across a page; totals never separate from each other
   · headings and invoice headers stay with the first rows beneath them
   · short invoices move to the next page whole; long ones break cleanly
     with their frame redrawn on each page
   · every page carries the sender, the document, and "Page n of N"
   ===================================================================== */
const cssStr = s => '"' + String(s||"").replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\n/g," ") + '"';
const docLong  = d => d ? new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"long", day:"numeric", year:"numeric"}) : "";
const docShort = d => d ? new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short", day:"numeric", year:"numeric"}) : "";

function docCSS(footLeft, compact, zoom){
  return `
  @page{size:letter;margin:16mm 14mm 18mm 14mm;
    @bottom-left{content:${cssStr(footLeft)};font:500 8.5px/1 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#8A9694}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);font:500 8.5px/1 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#8A9694}}
  *{box-sizing:border-box}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font:12.5px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:#1A2322;margin:0;padding:44px 48px;background:#fff;orphans:3;widows:3}
  .mono,td.r,th.r{font-variant-numeric:tabular-nums lining-nums;font-feature-settings:"tnum" 1}
  .serif{font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif}
  .head{display:flex;align-items:flex-start;gap:24px;padding-bottom:20px;border-bottom:2px solid #1A2322}
  .mark{display:flex;align-items:center;gap:10px}
  .mark i{width:30px;height:30px;border-radius:7px;background:#1A2322;color:#fff;display:grid;place-items:center;font:400 18px/1 Georgia,serif;font-style:normal}
  .mark b{font:600 13px/1.2 inherit;letter-spacing:.01em}
  .mark span{display:block;font-size:10.5px;color:#6B7775;font-weight:400}
  h1{font:400 30px/1.1 "Iowan Old Style","Palatino Linotype",Georgia,serif;margin:16px 0 0;letter-spacing:-.01em}
  .prop{font-size:13px;color:#3A4745;margin-top:5px}
  .head .right{margin-left:auto;text-align:right;font-size:11.5px;color:#6B7775;line-height:1.55}
  .head .right b{display:block;color:#1A2322;font-weight:600;font-size:12.5px}
  .head .right .big{font:400 26px/1 "Iowan Old Style",Georgia,serif;color:#1A2322;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px}
  .parties{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-top:22px;border:1px solid #E2E6E4;border-radius:8px;break-inside:avoid;page-break-inside:avoid}
  .parties > div{padding:13px 16px}
  .parties > div + div{border-left:1px solid #E2E6E4}
  .pk{font:600 9px/1 inherit;letter-spacing:.1em;text-transform:uppercase;color:#6B7775;margin-bottom:7px}
  .pv{font-size:12px;line-height:1.5;color:#1A2322}
  .pv b{font-weight:600;font-size:12.5px}
  .pv .m{color:#6B7775}
  .msg{margin:18px 0 0;padding:13px 16px;background:#F3F7F6;border-left:3px solid #1D5C57;font-size:12.5px;white-space:pre-wrap;break-inside:avoid}
  h2{font:600 10px/1 inherit;letter-spacing:.12em;text-transform:uppercase;color:#6B7775;margin:34px 0 12px;padding-bottom:8px;border-bottom:1px solid #E2E6E4;break-after:avoid;page-break-after:avoid}
  h2.tight{margin-top:0}
  h3.unit{font:600 12.5px/1 inherit;margin:24px 0 10px;color:#1D5C57;break-after:avoid;page-break-after:avoid}
  .lead{color:#5B6866;font-size:12px;margin:0 0 12px;max-width:80ch;break-after:avoid;page-break-after:avoid}
  .acct{display:flex;gap:24px;align-items:flex-start;margin-top:26px;break-inside:avoid;page-break-inside:avoid}
  .acct-t{flex:1 1 340px;min-width:0}
  table{width:100%;border-collapse:collapse}
  thead{display:table-header-group}
  tr{break-inside:avoid;page-break-inside:avoid}
  tbody.totals{break-inside:avoid;page-break-inside:avoid;break-before:avoid;page-break-before:avoid}
  tbody.keep{break-inside:avoid;page-break-inside:avoid;break-after:avoid;page-break-after:avoid}
  th{text-align:left;font:600 9px/1 inherit;letter-spacing:.09em;text-transform:uppercase;color:#6B7775;padding:8px 10px;border-bottom:1px solid #D5DBD8;background:#F9FAF9}
  td{padding:8px 10px;border-bottom:1px solid #EEF1EF;vertical-align:top}
  td.r,th.r{text-align:right;white-space:nowrap}
  td.dt,td.vn{white-space:nowrap;color:#5B6866;font-size:11.5px}
  td.rc,th.rc{width:56px;text-align:right;white-space:nowrap}
  .sub{color:#7A8785;font-size:11px;margin-top:2px}
  a{color:#1D5C57;text-decoration:none;border-bottom:1px solid #BCD6D2;font-size:11px}
  .zebra tr.z > td{background:#FAFBFA}
  tbody.hd{break-inside:avoid;page-break-inside:avoid}
  table.sum td{padding:6px 0;border:0;font-size:12.5px}
  table.sum td.r{text-align:right}
  table.sum tr.rule td{border-top:1px solid #D5DBD8;border-bottom:1px solid #D5DBD8;font-weight:600;padding:8px 0}
  table.sum tr.due td{border-top:2px solid #1A2322;font-weight:700;font-size:14px;padding-top:10px}
  table.sum tr.soft td{color:#5B6866;font-size:12px;padding-top:10px}
  .acct-c{flex:0 0 214px;border:1px solid #E2E6E4;border-radius:8px;padding:17px 19px;background:#F7F9F8}
  .acct-c .cap{font:600 9px/1 inherit;letter-spacing:.1em;text-transform:uppercase;color:#6B7775}
  .acct-c .big{font-size:28px;font-weight:600;line-height:1.05;margin-top:9px;letter-spacing:-.02em;font-variant-numeric:tabular-nums lining-nums}
  .acct-c .capsub{font-size:11px;color:#5B6866;margin-top:10px;line-height:1.45}
  .inv{margin:0 0 22px;border:1px solid #E2E6E4;border-radius:8px;overflow:hidden;box-decoration-break:clone;-webkit-box-decoration-break:clone}
  .inv.short{break-inside:avoid;page-break-inside:avoid}
  .invh{display:flex;align-items:center;gap:11px;padding:11px 14px;background:#F7F9F8;border-bottom:1px solid #E2E6E4;break-after:avoid;page-break-after:avoid}
  .invh .n{font-weight:600;font-size:13.5px}
  .invh .t{margin-left:auto;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums lining-nums}
  .invm{padding:7px 14px;font-size:11px;color:#6B7775;border-bottom:1px solid #EEF1EF;break-after:avoid;page-break-after:avoid}
  .b{font:600 8.5px/1 inherit;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:20px;border:1px solid}
  .b.paid{background:#E5F2EA;border-color:#C3DFCD;color:#2B7A4B}
  .b.sent{background:#F6EEDD;border-color:#E6D3AA;color:#7A5715}
  .b.ready,.b.draft{background:#F1F3F1;border-color:#E2E6E4;color:#6B7775}
  .inv th{background:#FCFDFC}
  .inv td:first-child,.inv th:first-child{padding-left:14px}
  .inv td:last-child,.inv th:last-child{padding-right:14px}
  tbody.totals td{background:#fff;border-bottom:0;color:#5B6866;font-size:11.5px;padding-top:5px;padding-bottom:5px}
  tbody.totals tr:first-child td{padding-top:11px;border-top:1px solid #D5DBD8}
  tbody.totals tr.tot td{color:#1A2322;font-weight:700;font-size:12.5px;border-top:1px solid #D5DBD8;padding-top:9px;padding-bottom:11px}
  tbody.totals tr.bal td{color:#1A2322;font-weight:700;font-size:14px;border-top:2px solid #1A2322;padding-top:10px}
  tr.cat td{background:#F3F6F5;font:600 9px/1 inherit;letter-spacing:.09em;text-transform:uppercase;color:#3A4745;padding:8px 10px}
  tr.cat .cnt{font-weight:400;letter-spacing:0;text-transform:none;color:#7A8785;font-size:10.5px;margin-left:6px}
  .notes{margin-top:30px;padding-top:12px;border-top:1px solid #E2E6E4;break-inside:avoid}
  .notes ul{margin:0;padding-left:16px}
  .notes li{font-size:11px;color:#5B6866;margin-bottom:4px}
  .terms{margin-top:18px;font-size:11px;color:#5B6866;max-width:80ch;white-space:pre-wrap;break-inside:avoid}
  .totbox{margin-left:auto;width:300px;margin-top:4px}
  .paybox{margin-top:26px;display:flex;gap:18px;align-items:flex-start;break-inside:avoid}
  .paybox .terms{margin-top:0;flex:1}
  @media print{body{padding:0}}
  ${compact?`
  body{font-size:11px;line-height:1.4;padding:30px 34px}
  h1{font-size:24px;margin-top:12px}.prop{font-size:12px}
  h2{margin:20px 0 9px;padding-bottom:6px}
  .parties{margin-top:14px}.parties > div{padding:9px 12px}
  .acct{margin-top:16px;gap:16px}
  .acct-c{flex:0 0 176px;padding:12px 14px}.acct-c .big{font-size:23px}
  table.sum td{padding:3.5px 0;font-size:11.5px}
  td{padding:5px 8px}th{padding:6px 8px}
  .inv{margin-bottom:13px}.invh{padding:7px 11px}.invh .n{font-size:12px}.invh .t{font-size:12.5px}
  .inv td:first-child,.inv th:first-child{padding-left:11px}
  .inv td:last-child,.inv th:last-child{padding-right:11px}
  .msg{margin-top:12px;padding:9px 12px;font-size:11.5px}
  .lead{font-size:11px;margin-bottom:8px}
  .notes{margin-top:18px}.notes li{font-size:10px;margin-bottom:2px}
  .terms{font-size:10px}
  .sub{font-size:10px}`:""}
  ${zoom && zoom !== 1 ? `body{zoom:${zoom}}` : ""}`;
}

function docMark(from){
  const f = from || "PHD Properties";
  return `<div class="mark"><i>${esc(f.trim().charAt(0).toUpperCase())}</i><div><b>${esc(f)}</b><span>Property management &amp; renovation</span></div></div>`;
}
function billToHTML(p){
  const o = ownerOf(p);
  if(!ownerName(p)) return `<div class="pv m">No owner on file</div>`;
  const addr = ownerAddressLines(o);
  return `<div class="pv"><b>${esc(o.name || o.company)}</b>${o.name && o.company ? `<br>${esc(o.company)}` : ""}
    ${addr.map(l => `<br>${esc(l)}`).join("")}
    ${o.email ? `<br><span class="m">${esc(o.email)}</span>` : ""}${o.phone ? `<br><span class="m">${esc(o.phone)}</span>` : ""}</div>`;
}
function propertyHTML(p, unitName){
  return `<div class="pv"><b>${esc(p.name)}</b>${unitName ? `<br>${esc(unitName)}` : (p.units.length > 1 ? `<br>${p.units.map(u=>esc(u.name)).join(", ")}` : "")}
    ${p.address ? `<br><span class="m">${esc(p.address)}</span>` : ""}</div>`;
}

/* ------------------------------------------------------------------ */
/* Single invoice — the document you actually send the owner          */
/* ------------------------------------------------------------------ */

/* Page-break tidy-up for any document table body:
   · the first three rows stay together (a heading never strands with one line under it)
   · the last two rows stay with the totals below them (a page never opens on a bare total)
   · zebra striping is fixed per row so it survives the split                                  */
function tidyBreaks(html){
  return html.replace(/<tbody>([\s\S]*?)<\/tbody>(\s*<tbody class="totals">)?/g, (m, inner, tot) => {
    const rows = inner.split(/(?<=<\/tr>)/).map(r => r.trim()).filter(Boolean);
    const z = rows.map((r, i) => i % 2 ? r.replace(/^<tr class="/, '<tr class="z ').replace(/^<tr(?=[\s>])(?! class)/, '<tr class="z"') : r);
    if(z.length < 6) return `<tbody class="hd">${z.join("")}</tbody>${tot || ""}`;
    const tailN = tot ? 2 : 0;
    const lead = z.slice(0, 3), mid = z.slice(3, z.length - tailN), tail = z.slice(z.length - tailN);
    return `<tbody class="hd">${lead.join("")}</tbody><tbody>${mid.join("")}</tbody>${tail.length ? `<tbody class="keep">${tail.join("")}</tbody>` : ""}${tot || ""}`;
  });
}

function invoiceDocHTML(p, unit, inv){
  const C = ALL[p.id], rep = p.report || {};
  const from = rep.from || "PHD Properties";
  const reg = inv.reg || {};
  const issued = reg.dateSent || new Date().toISOString().slice(0,10);
  const multi = p.units.length > 1;
  const status = reg.paid ? "Paid" + (reg.datePaid ? " " + docShort(reg.datePaid) : "")
               : reg.dateSent ? "Due on receipt" : "Draft — not yet issued";
  const rowList = inv.lines.map(l => {
    const parts = C.txn[l.txnId].parts.filter(x => x.unitId === unit.id);
    const pi = parts.findIndex(x => x.no === inv.no);
    const note = [];
    if(l.credit) note.push("credit — returned or corrected");
    else if(l.partial) note.push(`portion ${pi+1} of ${parts.length} of ${usd(l.fullC)}`);
    if(!l.feeApplies) note.push("billed at cost");
    if(l.txn && l.txn.scope.type === "split") note.push("split " + p.units.filter(u => Number(l.txn.scope.splits[u.id]) > 0).map(u => `${u.name} ${l.txn.scope.splits[u.id]}%`).join(" / "));
    return `<tr><td class="dt">${docShort(l.txn?.date)}</td>
      <td>${esc(l.txn?.desc || "Removed item")}${note.length ? `<div class="sub">${esc(note.join(" · "))}</div>` : ""}</td>
      <td class="vn">${esc(l.txn?.vendor || "")}</td><td class="r">${usd(l.expC)}</td></tr>`;
  });
  const rows = rowList.join("");
  const docName = `Invoice ${inv.no}${multi ? " · " + unit.name : ""}`;
  return tidyBreaks(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(p.name)} — ${esc(docName)}</title>
  <style>${docCSS(`${from} · ${p.name} · ${docName}`, false, 1)}</style></head><body>
    <div class="head">
      <div>${docMark(from)}</div>
      <div class="right"><div class="big">Invoice</div>
        <b>No. ${inv.no}${multi ? " · " + esc(unit.name) : ""}</b>
        Issued ${docLong(issued)}<br>${esc(status)}</div>
    </div>
    <div class="parties">
      <div><div class="pk">Bill to</div>${billToHTML(p)}</div>
      <div><div class="pk">Property</div>${propertyHTML(p, multi ? unit.name : "")}</div>
      <div><div class="pk">Amount due</div><div class="pv"><b class="mono" style="font-size:18px">${usd(reg.paid ? 0 : inv.totalC)}</b>
        <br><span class="m">${reg.paid ? "Paid in full — thank you" : "Payable to " + esc(from)}</span></div></div>
    </div>
    <h2>Charges</h2>
    <table class="zebra">
      <thead><tr><th style="width:92px">Date</th><th>Description</th><th style="width:150px">Vendor</th><th class="r" style="width:110px">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tbody class="totals">
        <tr><td></td><td colspan="2">Project expenses</td><td class="r">${usd(inv.expC)}</td></tr>
        <tr><td></td><td colspan="2">${esc(p.feeLabel)} · ${p.feePct}%${inv.feeBaseC !== inv.expC ? ` of ${usd(inv.feeBaseC)}` : ""}</td><td class="r">${usd(inv.feeC)}</td></tr>
        <tr class="tot"><td></td><td colspan="2">Invoice total</td><td class="r">${usd(inv.totalC)}</td></tr>
        ${reg.paid ? `<tr><td></td><td colspan="2">Payment received${reg.ref ? " · ref " + esc(reg.ref) : ""}</td><td class="r">−${usd(inv.totalC)}</td></tr>` : ""}
        <tr class="bal"><td></td><td colspan="2">Balance due</td><td class="r">${usd(reg.paid ? 0 : inv.totalC)}</td></tr>
      </tbody>
    </table>
    ${!reg.paid && reg.nickel && reg.nickel.url ? `<div class="paybox"><div class="terms"><b>Pay online:</b> <a href="${esc(reg.nickel.url)}">${esc(reg.nickel.url)}</a></div></div>` : ""}
    ${rep.terms ? `<div class="paybox"><div class="terms">${esc(rep.terms)}</div></div>` : ""}
  </body></html>`);
}

/* ------------------------------------------------------------------ */
/* Client statement                                                   */
/* ------------------------------------------------------------------ */
function reportHTML(p, opt){
  const o = Object.assign({
    title:"Renovation Billing Statement", from:"PHD Properties", preparedFor:ownerName(p),
    message:"", asOf:new Date().toISOString().slice(0,10),
    dueBasis:"issued", layout:"detailed", fitOnePage:false, zoom:1,
    showBillTo:true, showSummary:true, showInvoices:true, showLines:true, showUnissued:true, showDeferred:true,
    showScope:true, showLedger:false, showReceipts:true, showTerms:true,
    terms:"Please make payment to PHD Properties. Questions on any line item are welcome — receipts are on file for every charge."
  }, p.report || {}, opt || {});
  if(!o.preparedFor) o.preparedFor = ownerName(p);

  const C = ALL[p.id], r = C.roll, money = usd, rd = docShort;
  const issued = r.paidC + r.sentC;
  const notYet = r.chargesC - issued;
  const onCharges = o.dueBasis === "charges";
  const due = onCharges ? (r.chargesC - r.paidC) : (issued - r.paidC);
  const compact = o.layout === "compact" || o.layout === "summary";
  if(o.layout === "summary") o.showLines = false;
  const held = p.transactions.filter(t => t.status === "review");
  const label = inv => inv.reg.paid ? ["Paid","paid"] : inv.reg.dateSent ? ["Awaiting payment","sent"]
                     : inv.full ? ["Not yet issued","ready"] : ["In progress","draft"];
  const linkCell = (on, url) => on ? `<td class="rc">${url ? `<a href="${esc(url)}">View</a>` : ""}</td>` : "";

  /* ---- invoices ---- */
  let invBlock = "", hiddenCount = 0;
  if(o.showInvoices && o.layout === "summary"){
    let body = "";
    p.units.forEach(u => {
      const all = C.units[u.id] || [];
      const invs = o.showUnissued ? all : all.filter(i => i.reg.paid || i.reg.dateSent);
      hiddenCount += all.length - invs.length;
      if(!invs.length) return;
      if(p.units.length > 1) body += `<tr class="cat"><td colspan="6">${esc(u.name)}</td></tr>`;
      invs.forEach(inv => {
        const [txt, cls] = label(inv);
        body += `<tr><td>Invoice ${inv.no}</td><td><span class="b ${cls}">${txt}</span></td>
          <td class="dt">${inv.reg.dateSent ? rd(inv.reg.dateSent) : "—"}</td>
          <td class="r">${money(inv.expC)}</td><td class="r">${money(inv.feeC)}</td><td class="r"><b>${money(inv.totalC)}</b></td></tr>`;
      });
    });
    invBlock = body ? `<table class="zebra"><thead><tr><th>Invoice</th><th>Status</th><th>Issued</th>
      <th class="r">Expenses</th><th class="r">Fee</th><th class="r">Total</th></tr></thead><tbody>${body}</tbody>
      <tbody class="totals"><tr class="tot"><td colspan="3">Total charges</td><td class="r">${money(r.expenseC)}</td>
        <td class="r">${money(r.feeC)}</td><td class="r">${money(r.chargesC)}</td></tr></tbody></table>` : "";
  } else if(o.showInvoices){
    p.units.forEach(u => {
      const all = C.units[u.id] || [];
      const invs = o.showUnissued ? all : all.filter(i => i.reg.paid || i.reg.dateSent);
      hiddenCount += all.length - invs.length;
      if(!invs.length) return;
      if(p.units.length > 1) invBlock += `<h3 class="unit">${esc(u.name)}</h3>`;
      invs.forEach(inv => {
        const [txt, cls] = label(inv);
        const meta = [inv.reg.dateSent ? "Issued " + rd(inv.reg.dateSent) : "",
                      inv.reg.paid && inv.reg.datePaid ? "Paid " + rd(inv.reg.datePaid) : "",
                      inv.reg.ref ? "Reference " + inv.reg.ref : ""].filter(Boolean).join("  ·  ");
        const useRc = o.showReceipts && inv.lines.some(l => l.txn && linkOf(l.txn));
        const lines = o.showLines ? inv.lines.map(l => {
          const parts = C.txn[l.txnId].parts.filter(x => x.unitId === u.id);
          const pi = parts.findIndex(x => x.no === inv.no);
          const note = [];
          if(l.credit) note.push("credit — returned or corrected");
          else if(l.partial) note.push(`portion ${pi+1} of ${parts.length} of ${money(l.fullC)}`);
          if(!l.feeApplies) note.push("billed at cost");
          return `<tr><td class="dt">${rd(l.txn?.date)}</td>
            <td>${esc(l.txn?.desc || "Removed item")}${note.length ? `<div class="sub">${esc(note.join(" · "))}</div>` : ""}</td>
            <td class="vn">${esc(l.txn?.vendor || "")}</td>${linkCell(useRc, o.showReceipts && l.txn ? linkOf(l.txn) : "")}
            <td class="r">${money(l.expC)}</td></tr>`;
        }).join("") : "";
        const span = useRc ? 3 : 2;
        /* a short invoice moves to the next page whole; a long one is allowed to break */
        const short = !o.showLines || inv.lines.length <= 12;
        invBlock += `<div class="inv${short ? " short" : ""}">
          <div class="invh"><span class="n">Invoice ${inv.no}</span><span class="b ${cls}">${txt}</span><span class="t">${money(inv.totalC)}</span></div>
          ${meta ? `<div class="invm">${esc(meta)}</div>` : ""}
          <table>${o.showLines ? `<thead><tr><th style="width:92px">Date</th><th>Description</th><th style="width:140px">Vendor</th>${useRc ? "<th class='rc'>Receipt</th>" : ""}<th class="r" style="width:104px">Amount</th></tr></thead><tbody>${lines}</tbody>` : ""}
          <tbody class="totals">
            <tr><td></td><td colspan="${span}">Project expenses</td><td class="r">${money(inv.expC)}</td></tr>
            <tr><td></td><td colspan="${span}">${esc(p.feeLabel)} · ${p.feePct}%</td><td class="r">${money(inv.feeC)}</td></tr>
            <tr class="tot"><td></td><td colspan="${span}">Invoice total</td><td class="r">${money(inv.totalC)}</td></tr>
          </tbody></table></div>`;
      });
    });
  }

  /* ---- deferred ---- */
  let defBlock = "";
  if(o.showDeferred && held.length){
    const useRc = o.showReceipts && held.some(t => linkOf(t));
    const list = o.layout === "summary" ? held.slice(0,6) : held;
    defBlock = `<h2>Deferred to final billing</h2>
      <p class="lead">Recorded but deliberately not invoiced yet — these will be billed together when the project closes out. ${esc(heldNote(p))}</p>
      <table class="zebra"><thead><tr><th style="width:92px">Date</th><th>Description</th><th style="width:140px">Vendor</th>${useRc ? "<th class='rc'>Receipt</th>" : ""}<th class="r" style="width:104px">Amount</th></tr></thead><tbody>
      ${list.map(t => `<tr><td class="dt">${rd(t.date)}</td><td>${esc(t.desc || "")}</td><td class="vn">${esc(t.vendor || "")}</td>
        ${linkCell(useRc, linkOf(t))}<td class="r">${money(cents(t.amount))}</td></tr>`).join("")}
      ${o.layout === "summary" && held.length > 6 ? `<tr><td></td><td colspan="${useRc ? 3 : 2}" class="sub">and ${held.length - 6} more held charge${held.length - 6 === 1 ? "" : "s"}</td><td></td></tr>` : ""}
      </tbody><tbody class="totals"><tr class="tot"><td></td><td colspan="${useRc ? 3 : 2}">Total held</td><td class="r">${money(r.heldC)}</td></tr></tbody></table>`;
  }

  /* ---- scope ---- */
  let scopeBlock = "";
  if(o.showScope && (p.scope||[]).length){
    let cat = null, body = "";
    p.scope.forEach(it => {
      const w = C.work[it.id] || {actualC:0};
      if((it.cat||"") !== cat){
        cat = it.cat || "";
        const peers = p.scope.filter(x => (x.cat||"") === cat);
        body += `<tr class="cat"><td colspan="5">${esc(cat || "Other")} <span class="cnt">${peers.length} item${peers.length === 1 ? "" : "s"}</span></td></tr>`;
      }
      body += `<tr><td>${esc(it.name)}${it.notes ? `<div class="sub">${esc(it.notes)}</div>` : ""}</td>
        <td class="dt">${esc(it.qty || "")}</td>
        <td class="r">${cents(it.budget) ? money(cents(it.budget)) : "—"}</td>
        <td class="r">${w.actualC ? money(w.actualC) : "—"}</td>
        <td class="dt">${esc(workStatus(it, w))}</td></tr>`;
    });
    scopeBlock = `<h2>Scope of work</h2>
      <table><thead><tr><th>Item</th><th style="width:70px">Qty</th><th class="r" style="width:104px">Budget</th><th class="r" style="width:104px">Spent</th><th style="width:100px">Status</th></tr></thead>
      <tbody>${body}</tbody><tbody class="totals"><tr class="tot"><td colspan="2">Total</td><td class="r">${money(C.workRoll.budgetC)}</td>
        <td class="r">${money(C.workRoll.actualC)}</td><td></td></tr></tbody></table>`;
  }

  /* ---- full ledger ---- */
  let ledger = "";
  if(o.showLedger){
    const rows = p.transactions.filter(t => t.status !== "excluded");
    const useRc = o.showReceipts && rows.some(t => linkOf(t));
    ledger = `<h2>Expense detail</h2>
      <table class="zebra"><thead><tr><th style="width:92px">Date</th><th>Description</th><th>Vendor</th>${p.units.length > 1 ? "<th>Unit</th>" : ""}<th>Status</th>${useRc ? "<th class='rc'>Receipt</th>" : ""}<th class="r" style="width:104px">Amount</th></tr></thead><tbody>
      ${rows.map(t => {
        const info = C.txn[t.id];
        const unit = t.scope.type === "single" ? (p.units.find(u => u.id === t.scope.unit)?.name || "")
          : p.units.filter(u => Number(t.scope.splits[u.id]) > 0).map(u => `${u.name} ${t.scope.splits[u.id]}%`).join(" / ");
        const st = t.status === "review" ? "Deferred" : info.pay === "Unbilled" ? "Not yet invoiced" : info.pay === "Invoiced" ? "Awaiting payment" : info.pay;
        return `<tr><td class="dt">${rd(t.date)}</td><td>${esc(t.desc || "")}</td><td class="vn">${esc(t.vendor || "")}</td>
          ${p.units.length > 1 ? `<td class="vn">${esc(unit)}</td>` : ""}<td class="dt">${esc(st)}</td>
          ${linkCell(useRc, linkOf(t))}<td class="r">${money(cents(t.amount))}</td></tr>`;
      }).join("")}</tbody></table>`;
  }

  /* ---- account summary ---- */
  const line = (k,v,cls) => `<tr class="${cls||""}"><td>${k}</td><td class="r">${v}</td></tr>`;
  const summary = o.showSummary ? `
    <div class="acct">
      <div class="acct-t">
        <h2 class="tight">Account summary</h2>
        <table class="sum">
          ${line("Project expenses", money(r.expenseC))}
          ${line(`${esc(p.feeLabel)} · ${p.feePct}%`, money(r.feeC))}
          ${line("Total charges to date", money(r.chargesC), "rule")}
          ${onCharges ? "" : line("Invoiced to date", money(issued))}
          ${line("Payments received", (r.paidC ? "−" : "") + money(r.paidC))}
          ${line(onCharges ? "Balance due" : "Balance due on issued invoices", money(due), "due")}
          ${onCharges ? (notYet ? line("Included above, not yet invoiced", money(notYet), "soft") : "")
                      : (notYet ? line("Charges not yet invoiced", money(notYet), "soft") : "")}
          ${r.heldC ? line("Held for final billing", money(r.heldC), "soft") : ""}
        </table>
      </div>
      <div class="acct-c">
        <div class="cap">${due > 0 ? "Balance due today" : (notYet ? "Nothing due today" : "Balance due today")}</div>
        <div class="big">${money(due)}</div>
        ${notYet || r.heldC ? `<div class="capsub">${[
            notYet ? (onCharges ? `${money(notYet)} of that is work completed but not yet invoiced`
                                : `${money(notYet)} of completed work is not yet invoiced and will follow`) : "",
            r.heldC ? `${money(r.heldC)} is held for final billing` : ""
          ].filter(Boolean).join(". ")}.</div>` : ""}
      </div>
    </div>` : "";

  const footnotes = [];
  if(notYet) footnotes.push(onCharges
    ? `The balance due includes ${money(notYet)} of completed work that has not been invoiced yet; an invoice will follow.`
    : `“Total charges to date” includes ${money(notYet)} of completed work that has not been invoiced yet, so it is higher than the amount currently due.`);
  if(hiddenCount) footnotes.push(`${hiddenCount} invoice${hiddenCount === 1 ? " that has" : "s that have"} not been issued yet ${hiddenCount === 1 ? "is" : "are"} omitted from this statement.`);
  if(r.heldC) footnotes.push(`Held charges are not included in any invoice above. ${heldNote(p)}`);

  return tidyBreaks(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(p.name)} — ${esc(o.title)}</title>
  <style>${docCSS(`${o.from || "PHD Properties"} · ${p.name} · ${o.title} · ${docShort(o.asOf)}`, compact, o.zoom)}</style></head><body>
    <div class="head">
      <div>${docMark(o.from)}
        <h1>${esc(o.title)}</h1>
        <div class="prop">${esc(p.name)}${p.units.length > 1 ? ` · ${p.units.map(u => esc(u.name)).join(", ")}` : ""}</div>
      </div>
      <div class="right"><b>${docLong(o.asOf)}</b>${o.preparedFor ? `Prepared for ${esc(o.preparedFor)}` : ""}</div>
    </div>
    ${o.showBillTo ? `<div class="parties">
      <div><div class="pk">Bill to</div>${billToHTML(p)}</div>
      <div><div class="pk">Property</div>${propertyHTML(p)}</div>
      <div><div class="pk">Statement</div><div class="pv"><b>${docLong(o.asOf)}</b><br><span class="m">${r.invoices} invoice${r.invoices === 1 ? "" : "s"} · ${money(cents(p.invoiceTarget))} cap each</span></div></div>
    </div>` : ""}
    ${o.message ? `<div class="msg">${esc(o.message)}</div>` : ""}
    ${summary}
    ${o.showInvoices ? `<h2>Invoices</h2>${invBlock || "<p class='lead'>No invoices have been issued yet.</p>"}` : ""}
    ${defBlock}
    ${scopeBlock}
    ${ledger}
    ${footnotes.length ? `<div class="notes"><ul>${footnotes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
    ${o.showTerms && o.terms ? `<div class="terms">${esc(o.terms)}</div>` : ""}
  </body></html>`);
}

/* Print any finished document through a hidden frame so the app itself never reflows. */
function printDoc(html){
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0";
  f.srcdoc = html;
  f.onload = () => { try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){} setTimeout(() => f.remove(), 60000); };
  document.body.appendChild(f);
}

/* Letter at 96dpi minus the print margins declared in the report stylesheet. */
/* letter: 8.5 × 11 in at 96dpi, less the 14mm side and 16/18mm top/bottom margins */
const PAGE_W = 710, PAGE_H = 927, MIN_ZOOM = 0.62;

/* Render offscreen and measure for real — guessing page counts from row counts
   is always wrong once a description wraps. */
function measureReport(html){
  return new Promise(res => {
    const f = document.createElement("iframe");
    f.style.cssText = `position:fixed;left:-9999px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;visibility:hidden`;
    let done = false;
    const finish = () => {
      if(done) return; done = true;
      let h = PAGE_H;
      try{
        const d = f.contentDocument;
        /* body.scrollHeight ignores CSS zoom; documentElement reflects it. */
        h = Math.ceil(Math.max(d.documentElement.scrollHeight, d.body.getBoundingClientRect().height));
      }catch(e){}
      f.remove(); res(h);
    };
    f.onload = () => setTimeout(finish, 60);
    setTimeout(finish, 1200);
    document.body.appendChild(f);
    /* measure the printed layout: no screen padding, page-width content */
    f.srcdoc = html.replace("</head>", "<style>body{padding:0!important}</style></head>");
  });
}

/* Build the report, and when asked, shrink it just enough to land on one page. */
async function buildReport(p, opt){
  const o = Object.assign({}, opt || {});
  let html = reportHTML(p, Object.assign({}, o, {zoom:1}));
  let h = await measureReport(html);
  let zoom = 1;
  if(o.fitOnePage && h > PAGE_H){
    zoom = Math.max(MIN_ZOOM, Math.floor((PAGE_H / h) * 100) / 100);
    html = reportHTML(p, Object.assign({}, o, {zoom}));
    h = await measureReport(html);
    /* zoom changes wrapping, so give it one corrective pass */
    if(h > PAGE_H && zoom > MIN_ZOOM){
      zoom = Math.max(MIN_ZOOM, Math.floor((zoom * PAGE_H / h) * 100) / 100);
      html = reportHTML(p, Object.assign({}, o, {zoom}));
      h = await measureReport(html);
    }
  }
  return { html, zoom, pages: Math.max(1, Math.ceil(h / PAGE_H)), height:h };
}

function printReport(p, opt, html){ printDoc(html || reportHTML(p, opt)); }

function reportSheet(){
  const p = P(), C = ALL[p.id], r = C.roll;
  const o = Object.assign({
    title:"Renovation Billing Statement", from:"PHD Properties", preparedFor:ownerName(p),
    message:"", asOf:new Date().toISOString().slice(0,10),
    dueBasis:"issued", layout:"detailed", fitOnePage:false, zoom:1,
    showBillTo:true, showSummary:true, showInvoices:true, showLines:true, showUnissued:true, showDeferred:true,
    showScope:true, showLedger:false, showReceipts:true, showTerms:true,
    terms:"Please make payment to PHD Properties. Questions on any line item are welcome — receipts are on file for every charge."
  }, p.report || {});

  const toggles = [
    ["showBillTo","Bill-to block", ownerName(p) ? `Owner, property and statement date — billing ${ownerName(p)}` : "Owner, property and statement date — add the owner on the Owner page"],
    ["showSummary","Summary panel","Charges, invoiced, paid, balance due"],
    ["showInvoices","Invoices","Each invoice with its status and totals"],
    ["showLines","Line items inside invoices","Off gives a one-line-per-invoice statement"],
    ["showUnissued","Invoices not yet issued","Off shows only what the owner has actually received"],
    ["showDeferred","Deferred charges",`Held work billed at the end${r.heldC?` — ${usd(r.heldC)} right now`:""}`],
    ["showScope","Scope of work",`Budget and spend by category${(p.scope||[]).length?` — ${p.scope.length} items`:" — none yet"}`],
    ["showLedger","Full expense detail","Every transaction; long, but nothing hidden"],
    ["showReceipts","Receipt links","Clickable in the HTML and the PDF"],
    ["showTerms","Closing note","Payment instructions at the foot"]
  ];

  const sh = $("#sheet");
  sh.innerHTML = `
    <div class="sheet-h"><h3>Client report</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="f2">
        <label class="fld"><span>From</span><input type="text" id="o_from" value="${esc(o.from)}" placeholder="PHD Properties"></label>
        <label class="fld"><span>Statement date</span><input type="date" id="o_asOf" value="${esc(o.asOf)}"></label>
      </div>
      <label class="fld"><span>Title</span><input type="text" id="o_title" value="${esc(o.title)}"></label>
      <label class="fld"><span>Prepared for</span><input type="text" id="o_for" value="${esc(o.preparedFor)}" placeholder="Owner name"></label>
      <label class="fld"><span>Opening note</span><textarea id="o_msg" rows="3" placeholder="Optional — a short message at the top of the statement.">${esc(o.message)}</textarea></label>
      <hr class="sep">
      <div class="f2">
        <label class="fld"><span>Layout</span>
          <select id="o_layout">
            <option value="detailed" ${o.layout==="detailed"?"selected":""}>Detailed — every line item</option>
            <option value="compact" ${o.layout==="compact"?"selected":""}>Compact — tighter type</option>
            <option value="summary" ${o.layout==="summary"?"selected":""}>Summary — one row per invoice</option>
          </select></label>
        <label class="fld"><span>Balance due means</span>
          <select id="o_basis">
            <option value="issued" ${o.dueBasis==="issued"?"selected":""}>Invoices actually issued</option>
            <option value="charges" ${o.dueBasis==="charges"?"selected":""}>All charges to date</option>
          </select>
          <span class="help" id="o_basisHelp"></span></label>
      </div>
      <label class="opt"><input type="checkbox" id="o_fit" ${o.fitOnePage?"checked":""}>
        <span><b>Fit onto one page</b><small>Scales the statement down just enough to fit, to a floor of 62%. Below that it stays multi-page.</small></span></label>
      <div id="o_pages" class="muted" style="font-size:12.5px;margin:-4px 0 14px"></div>
      <hr class="sep">
      <div class="label" style="margin-bottom:10px">Include</div>
      ${toggles.map(([k,t,d]) => `<label class="opt"><input type="checkbox" data-opt="${k}" ${o[k]?"checked":""}>
        <span><b>${t}</b><small>${d}</small></span></label>`).join("")}
      <label class="fld"><span>Closing note</span><textarea id="o_terms" rows="3">${esc(o.terms)}</textarea></label>
      <hr class="sep">
      <div class="label" style="margin-bottom:8px">Preview</div>
      <div style="border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;background:#fff">
        <iframe id="o_prev" style="width:100%;height:330px;border:0;display:block" title="Report preview"></iframe>
      </div>
      <p class="muted" style="font-size:12.5px;margin-top:8px">Settings are remembered for ${esc(p.name)}.</p>
    </div>
    <div class="sheet-f">
      <button class="btn" id="r_csv">CSV</button>
      ${(p.scope||[]).length?`<button class="btn" id="r_scope">Scope CSV</button>`:""}
      <span style="flex:1"></span>
      <button class="btn" id="r_html">Download HTML</button>
      <button class="btn primary" id="r_pdf">Print / Save as PDF</button>
    </div>`;

  const read = () => {
    const out = { title:$("#o_title").value, from:$("#o_from").value, preparedFor:$("#o_for").value,
                  message:$("#o_msg").value, asOf:$("#o_asOf").value, terms:$("#o_terms").value,
                  layout:$("#o_layout").value, dueBasis:$("#o_basis").value, fitOnePage:$("#o_fit").checked };
    sh.querySelectorAll("[data-opt]").forEach(c => out[c.dataset.opt] = c.checked);
    return out;
  };
  let timer = null, token = 0, lastHTML = "";
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const mine = ++token, opts = read();
      $("#o_basisHelp").textContent = opts.dueBasis === "charges"
        ? "Counts completed work that hasn't been invoiced yet."
        : "Only what the owner has actually been sent.";
      const st = $("#o_pages"); if(st) st.textContent = "Measuring…";
      const out = await buildReport(p, opts);
      if(mine !== token) return;
      lastHTML = out.html;
      const f = $("#o_prev"); if(f) f.srcdoc = out.html;
      if(st) st.innerHTML = out.pages === 1
        ? `Fits on <b>1 page</b>${out.zoom < 1 ? ` — scaled to ${Math.round(out.zoom*100)}%` : ""}.`
        : `About <b>${out.pages} pages</b>${opts.fitOnePage ? " — too much content to fit on one; try the Summary layout or switch off some sections." : ". Turn on “Fit onto one page” or use the Summary layout."}`;
    }, 200);
  };
  const save = () => { P().report = read(); Store.save(S); AutoFile.queue(); };
  sh.querySelectorAll("input,textarea,select").forEach(n => { n.oninput = () => { refresh(); save(); }; n.onchange = () => { refresh(); save(); }; });
  refresh();

  $("#shClose").onclick = closeSheet;
  $("#r_pdf").onclick  = async () => { save(); const o = await buildReport(p, read()); printReport(p, null, o.html); toast("Opening the print dialog"); };
  $("#r_html").onclick = async () => { save(); const o = await buildReport(p, read()); download(`${p.name} statement.html`, o.html); };
  $("#r_csv").onclick  = exportTxnCsv;
  if($("#r_scope")) $("#r_scope").onclick = () => {
    const rows = [["Category","Work item","Qty","Unit","Budget","Actual","On hold","Variance","Invoiced","Collected","Transactions","Status","Match words","Notes"]];
    p.scope.forEach(it => { const w = C.work[it.id]||{}; const bg = cents(it.budget);
      rows.push([it.cat||"", it.name, it.qty||"", it.unit==="all"||!it.unit?"All units":(p.units.find(u=>u.id===it.unit)?.name||""),
        (bg/100).toFixed(2), ((w.actualC||0)/100).toFixed(2), ((w.holdC||0)/100).toFixed(2),
        ((bg-(w.actualC||0))/100).toFixed(2), ((w.billedC||0)/100).toFixed(2), ((w.paidC||0)/100).toFixed(2),
        w.count||0, workStatus(it,w||{actualC:0,holdC:0}), (it.match||[]).join(" + "), it.notes||""]); });
    download(`${p.name} scope of work.csv`, toCSV(rows));
  };
  openPanel();
}

/* ===================== EXPORT ===================== */
function invRows(inv, unit, p){
  const rows = [["Date","Product/Service","Vendor","Description","Amount","Source","Receipt link"]];
  inv.lines.forEach(l => {
    const parts = COMP.txn[l.txnId].parts.filter(x => x.unitId === unit.id);
    const pi = parts.findIndex(x => x.no === inv.no);
    let d = l.txn?.desc || "";
    if(l.partial) d += ` — part ${pi+1} of ${parts.length} of ${usd(l.fullC)}`;
    if(l.txn && l.txn.scope.type === "split") d += ` — split ${p.units.filter(u=>Number(l.txn.scope.splits[u.id])>0).map(u=>u.name+" "+l.txn.scope.splits[u.id]+"%").join("/")}`;
    if(!l.feeApplies) d += " — billed at cost";
    rows.push([l.txn?.date||"", "Project Expense", l.txn?.vendor||"", d, (l.expC/100).toFixed(2), l.txn?.receipt||"", l.txn?linkOf(l.txn):""]);
  });
  rows.push(["", "Project Management", p.name, `${p.feeLabel} (${p.feePct}%) — ${unit.name} — Invoice ${inv.no}`, (inv.feeC/100).toFixed(2), "", ""]);
  rows.push(["", "", "", "INVOICE TOTAL", (inv.totalC/100).toFixed(2), "", ""]);
  return rows;
}
const csvCell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : String(v);
const toCSV = r => r.map(x => x.map(csvCell).join(",")).join("\r\n");
const toTSV = r => r.map(x => x.map(c => String(c).replace(/\t/g," ")).join("\t")).join("\n");

function exportTxnCsv(){
  const p = P(), C = COMP;
  const rows = [["Order","Date","Vendor","Item","Amount","Unit","State","Fee","Keep whole","Start invoice","Billed on","Status","Work item","Receipt","Receipt link","Notes"]];
  p.transactions.forEach((t,i) => {
    const info = C.txn[t.id];
    const unit = t.scope.type === "single" ? (p.units.find(u=>u.id===t.scope.unit)?.name||"")
      : p.units.filter(u=>Number(t.scope.splits[u.id])>0).map(u=>`${u.name} ${t.scope.splits[u.id]}%`).join(" / ");
    rows.push([i+1, t.date, t.vendor, t.desc, Number(t.amount).toFixed(2), unit, t.status,
      t.applyFee?`${p.feePct}%`:"none", t.allowPartial?"no":"yes", t.pin||"",
      info.parts.map(x=>`${p.units.find(u=>u.id===x.unitId)?.name} #${x.no} ${usd(x.expC)}`).join("; "),
      info.pay, (C.workOf[t.id] ? (p.scope.find(x=>x.id===C.workOf[t.id])||{}).name : ""),
      t.receipt, linkOf(t), t.notes]);
  });
  download(`${p.name} transactions.csv`, toCSV(rows));
}
function download(name, text){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text],{type:"text/plain;charset=utf-8"}));
  a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast("Downloaded " + name);
}
function backup(){ const c = Object.assign({}, S); delete c.inboxConn; download(`billing console ${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(c,null,2)); }

/* =====================================================================
   ICONS — one stroke set, drawn at 16px
   ===================================================================== */
const ICON_PATHS = {
  grid:'<rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/>',
  check:'<circle cx="8" cy="8" r="6"/><path d="M5.4 8.2l1.8 1.8 3.4-3.6"/>',
  home:'<path d="M2.5 7.2L8 2.8l5.5 4.4V13a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8z"/><path d="M6.3 13.8V10h3.4v3.8"/>',
  list:'<path d="M5.5 4h8M5.5 8h8M5.5 12h8"/><circle cx="2.6" cy="4" r=".7"/><circle cx="2.6" cy="8" r=".7"/><circle cx="2.6" cy="12" r=".7"/>',
  clip:'<rect x="3" y="2.8" width="10" height="11.4" rx="1.4"/><path d="M6 2.8V2h4v.8M5.8 7h4.4M5.8 10h3"/>',
  file:'<path d="M4 1.8h5.2L12.5 5v8.4a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V2.6a.8.8 0 0 1 .8-.8z"/><path d="M9 1.8V5h3.5M5.6 8.5h5M5.6 11h3.6"/>',
  user:'<circle cx="8" cy="5.4" r="2.8"/><path d="M2.8 14c.6-2.8 2.7-4.2 5.2-4.2s4.6 1.4 5.2 4.2"/>',
  gear:'<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M3.5 12.5l1.1-1.1M11.4 4.6l1.1-1.1"/>',
  plus:'<path d="M8 3v10M3 8h10"/>',
  card:'<rect x="1.8" y="3.5" width="12.4" height="9" rx="1.4"/><path d="M1.8 6.6h12.4M4.4 10h2.6"/>',
  bolt:'<path d="M9 1.8L3.6 9h4l-1 5.2L12.4 7h-4z"/>',
  arrow:'<path d="M3 8h10M9 4l4 4-4 4"/>',
  receipt:'<path d="M3.5 1.8h9v12.4l-2.2-1.3-2.3 1.3-2.3-1.3-2.2 1.3z"/><path d="M6 5.5h4M6 8.3h4"/>',
  download:'<path d="M8 2v8M4.8 7L8 10.2 11.2 7M3 13.5h10"/>',
  undo:'<path d="M5 3L2 6l3 3"/><path d="M2.4 6H10a3.8 3.8 0 0 1 0 7.6H7"/>',
  mail:'<rect x="2" y="3.5" width="12" height="9" rx="1.4"/><path d="M2.4 4.2L8 8.6l5.6-4.4"/>',
  phone:'<path d="M4.5 2.2l2 3.2-1.4 1.2a8 8 0 0 0 4.3 4.3l1.2-1.4 3.2 2-1 2.2c-6 .3-10.8-4.5-10.5-10.5z"/>',
  building:'<rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 5h1M9 5h1M6 8h1M9 8h1M7 14v-3h2v3"/>'
};
const icon = (n, cls) => `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[n] || ""}</svg>`;

/* =====================================================================
   OWNERS — one shared record per person or entity we bill.
   Several properties can point at the same owner; editing the owner
   updates every property that bills them. Invoices never merge across
   properties — each property keeps its own cap, fee and numbering.
   ===================================================================== */
const OWNER_FIELDS = ["name","company","email","phone","address","city","state","zip","method","terms","notes","cc"];
const blankOwner = () => { const o = {}; OWNER_FIELDS.forEach(k => o[k] = ""); return o; };
const ownerKeyName = o => String((o && (o.name || o.company)) || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ownerHasData = o => !!o && OWNER_FIELDS.some(k => String(o[k] || "").trim());

function cleanOwner(o){
  OWNER_FIELDS.forEach(k => { if(typeof o[k] !== "string") o[k] = o[k] == null ? "" : String(o[k]); });
  if(!o.id) o.id = uid();
  return o;
}
function findOwnerMatch(info){
  const em = String(info.email || "").trim().toLowerCase();
  const nm = ownerKeyName(info);
  const co = String(info.company || "").trim().toLowerCase();
  return (S.owners || []).find(o =>
    (em && String(o.email || "").trim().toLowerCase() === em) ||
    (nm && ownerKeyName(o) === nm && (!co || !o.company || o.company.trim().toLowerCase() === co)));
}

/* Called from fixActive on every recalc: builds the owner registry from older saves
   (one owner block per property), links same-person properties, and mirrors each
   owner back onto its properties so older exports still read correctly. */
function syncOwners(){
  if(!Array.isArray(S.owners)) S.owners = [];
  S.owners.forEach(cleanOwner);
  const used = new Set(S.properties.map(p => p.ownerId).concat(((S.pm && S.pm.properties) || []).map(p => p.ownerId)).filter(Boolean));
  S.owners = S.owners.filter(o => ownerHasData(o) || used.has(o.id) || (S.ui && S.ui.ownerId === o.id));
  const ids = new Set(S.owners.map(o => o.id));
  S.properties.forEach(p => {
    if(p.ownerId && !ids.has(p.ownerId)) p.ownerId = null;
    if(p.ownerId === undefined){
      const info = Object.assign(blankOwner(), p.ownerInfo || {});
      if(!info.name && !info.company && p.owner) info.name = p.owner;
      if(ownerHasData(info)){
        let o = findOwnerMatch(info);
        if(o){ OWNER_FIELDS.forEach(k => { if(!o[k] && info[k]) o[k] = info[k]; }); }
        else { o = cleanOwner(Object.assign(blankOwner(), info, {id:uid()})); S.owners.push(o); ids.add(o.id); }
        p.ownerId = o.id;
      } else p.ownerId = null;
    }
  });
  S.properties.forEach(p => {
    const o = S.owners.find(x => x.id === p.ownerId);
    const mirror = blankOwner(); if(o) OWNER_FIELDS.forEach(k => mirror[k] = o[k]);
    p.ownerInfo = mirror;
    p.owner = o ? (o.name || o.company || "") : "";
  });
}

const ownerById = id => (S.owners || []).find(o => o.id === id) || null;
const ownerRec = p => p ? ownerById(p.ownerId) : null;
function ownerOf(p){ return ownerRec(p) || blankOwner(); }         // read-only view when no owner is linked
const ownerLabel = o => o ? (o.name || o.company || "").trim() : "";
const ownerName = p => ownerLabel(ownerRec(p));
const ownerProps = (o, all) => o ? S.properties.filter(p => p.ownerId === o.id && (all || !p.archived)) : [];

/* link a property to an owner (null to clear); returns the owner */
function linkOwner(p, ownerId){
  p.ownerId = ownerId || null;
  syncOwners();
  return ownerRec(p);
}
/* the record this property's form writes to — created on first keystroke */
function ensureOwner(p){
  let o = ownerRec(p);
  if(!o){ o = cleanOwner(Object.assign(blankOwner(), {id:uid()})); S.owners.push(o); p.ownerId = o.id; }
  return o;
}
function ownerAddressLines(o){
  const cityLine = [o.city, [o.state, o.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [o.address, cityLine].map(x => (x||"").trim()).filter(Boolean);
}
const initials = s => (s||"?").trim().split(/\s+/).filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join("") || "?";

/* money across every property an owner has */
function ownerRoll(o){
  const r = {props:0, chargesC:0, paidC:0, sentC:0, readyC:0, draftC:0, heldC:0, invoices:0, expenseC:0, feeC:0};
  ownerProps(o).forEach(p => {
    const c = ALL[p.id]; if(!c) return;
    r.props++;
    ["chargesC","paidC","sentC","readyC","draftC","heldC","invoices","expenseC","feeC"].forEach(k => r[k] += c.roll[k] || 0);
  });
  r.dueC = r.sentC;                                  // issued and unpaid
  r.notYetC = r.chargesC - r.paidC - r.sentC;        // built but not issued
  return r;
}

/* ---------- shared pieces ---------- */
function ownerCardHTML(o, props, opt){
  const name = ownerLabel(o), addr = ownerAddressLines(o), op = opt || {};
  return `
    <div class="owner-top">
      <div class="avatar">${esc(initials(name))}</div>
      <div style="min-width:0">
        <h2>${name ? esc(o.name || o.company) : `<span class="muted">${esc(op.emptyTitle || "No owner yet")}</span>`}</h2>
        <div class="co">${o.name && o.company ? esc(o.company) : esc(op.emptySub || "")}</div>
      </div>
    </div>
    <dl class="kv">
      <dt>Email</dt><dd>${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : `<span class="muted">—</span>`}</dd>
      <dt>Phone</dt><dd>${o.phone ? `<a href="tel:${esc(o.phone.replace(/[^\d+]/g,""))}">${esc(o.phone)}</a>` : `<span class="muted">—</span>`}</dd>
      <dt>Billing address</dt><dd>${addr.length ? addr.map(esc).join("<br>") : `<span class="muted">—</span>`}</dd>
      <dt>Pays by</dt><dd>${o.method ? esc(o.method) : `<span class="muted">—</span>`}</dd>
      <dt>Terms</dt><dd>${o.terms ? esc(o.terms) : `<span class="muted">—</span>`}</dd>
      ${o.cc ? `<dt>Also send to</dt><dd>${esc(o.cc)}</dd>` : ""}
      ${op.extraKV || ""}
    </dl>
    ${o.email ? `<div style="padding:0 22px 22px;display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn sm" href="mailto:${esc(o.email)}${o.cc ? "?cc=" + encodeURIComponent(o.cc) : ""}">${icon("mail")} Email ${esc((o.name||o.company).split(" ")[0])}</a>
      ${o.phone ? `<a class="btn sm" href="tel:${esc(o.phone.replace(/[^\d+]/g,""))}">${icon("phone")} Call</a>` : ""}</div>` : ""}`;
}

function ownerFormHTML(o, footNote){
  const f = (k, label, ph, type) => `<label class="fld"><span>${label}</span><input type="${type||"text"}" data-own="${k}" value="${esc(o[k])}" placeholder="${esc(ph||"")}" autocomplete="off"></label>`;
  return `<div class="card-h"><h3>Owner details</h3><span class="muted" style="margin-left:auto;font-size:12px" id="ownSaved">Saves as you type</span></div>
    <div class="card-b">
      <div class="sectl">Who we bill</div>
      <div class="f2">${f("name","Contact name","Jane Doe")}${f("company","Company or entity","Doe Holdings LLC")}</div>
      <div class="f2">${f("email","Email","owner@example.com","email")}${f("phone","Phone","(843) 555-0123","tel")}</div>
      ${f("cc","Also send invoices to","accountant@example.com")}
      <div class="sectl" style="margin-top:6px">Billing address</div>
      ${f("address","Street","123 King St")}
      <div class="f3">${f("city","City","Charleston")}${f("state","State","SC")}${f("zip","ZIP","29401")}</div>
      <div class="sectl" style="margin-top:6px">Payment</div>
      <div class="f2">
        <label class="fld"><span>Pays by</span><select data-own="method">
          ${["","ACH / bank transfer","Check","Nickel","QuickBooks payment link","Zelle","Card","Other"].map(m => `<option ${o.method===m?"selected":""} value="${esc(m)}">${m || "Not set"}</option>`).join("")}
        </select></label>
        ${f("terms","Terms","Due on receipt")}
      </div>
      <label class="fld"><span>Notes</span><textarea data-own="notes" rows="3" placeholder="Preferences, who approves invoices, anything worth remembering">${esc(o.notes)}</textarea></label>
      <p class="help" style="margin:0">${footNote || ""}</p>
    </div>`;
}

/* getRec() returns the owner record to write into (creating it if needed) */
function wireOwnerForm(form, getRec){
  let t = null;
  form.querySelectorAll("[data-own]").forEach(inp => {
    const save = () => {
      const own = getRec();
      own[inp.dataset.own] = inp.value.trim();
      syncOwners();
      Store.save(S); AutoFile.queue();
      const s = $("#ownSaved"); if(s){ s.textContent = "Saved"; clearTimeout(t); t = setTimeout(() => { if($("#ownSaved")) $("#ownSaved").textContent = "Saves as you type"; }, 1400); }
    };
    inp.addEventListener("input", save);
    inp.addEventListener("change", () => {
      save();
      /* refresh the card once focus has settled, then put focus back wherever the user went */
      setTimeout(() => {
        const a = document.activeElement, k = a && a.dataset ? a.dataset.own : null;
        const pos = a && typeof a.selectionStart === "number" ? a.selectionStart : null;
        const y = window.scrollY;
        render(); window.scrollTo(0, y);
        if(k){ const n = document.querySelector(`[data-own="${k}"]`); if(n){ n.focus(); if(pos != null && n.setSelectionRange) try{ n.setSelectionRange(pos, pos); }catch(_){} } }
      }, 0);
    });
  });
}

function ownerPropsTableHTML(o){
  const props = ownerProps(o);
  if(!props.length) return `<div class="empty" style="padding:28px"><b>No properties</b><p>Link this owner from a property's Owner page.</p></div>`;
  const R = ownerRoll(o);
  const row = p => { const r = ALL[p.id].roll, due = r.sentC, notYet = r.chargesC - r.paidC - r.sentC;
    return `<tr data-op="${p.id}" style="cursor:pointer"><td><div class="item-t">${esc(p.name)}</div><div class="item-s">${p.units.length} unit${p.units.length===1?"":"s"} · ${p.feePct}% fee · ${r.invoices} invoice${r.invoices===1?"":"s"}</div></td>
      <td class="r num">${usd(r.chargesC)}</td><td class="r num">${usd(r.paidC)}</td>
      <td class="r num">${due ? `<b>${usd(due)}</b>` : `<span class="muted">${usd(0)}</span>`}</td>
      <td class="r num">${r.readyC ? `<span style="color:var(--gold)">${usd(r.readyC)}</span>` : `<span class="muted">—</span>`}</td>
      <td class="r num">${r.draftC ? usd(r.draftC) : `<span class="muted">—</span>`}</td>
      <td class="act"><span class="sc-go">›</span></td></tr>`; };
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Property</th><th class="r">Charges</th><th class="r">Collected</th><th class="r">Due now</th><th class="r">Ready to send</th><th class="r">In progress</th><th></th></tr></thead>
    <tbody>${props.map(row).join("")}
    ${props.length > 1 ? `<tr class="ow-tot"><td><b>All ${props.length} properties</b></td><td class="r num"><b>${usd(R.chargesC)}</b></td><td class="r num"><b>${usd(R.paidC)}</b></td><td class="r num"><b>${usd(R.dueC)}</b></td><td class="r num"><b>${usd(R.readyC)}</b></td><td class="r num"><b>${usd(R.draftC)}</b></td><td></td></tr>` : ""}
    </tbody></table></div>`;
}
function wirePropRows(root){
  root.querySelectorAll("[data-op]").forEach(tr => tr.onclick = () => go("overview", tr.dataset.op));
}

/* ---------- per-property Owner page ---------- */
function pgOwner(){
  const p = P(), rec = ownerRec(p), o = ownerOf(p);
  const others = rec ? ownerProps(rec).filter(x => x.id !== p.id) : [];
  const acts = [["Client report", reportSheet]];
  if(rec && others.length) acts.unshift(["Combined statement", () => ownerStatementSheet(rec.id)]);
  actions(acts);
  const v = $("#view");

  /* ---- who this property bills: pick an existing owner or start a new one ---- */
  const link = elm("div","card ow-link");
  const choices = (S.owners||[]).filter(x => ownerLabel(x) || x.id === p.ownerId)
    .sort((a,b) => ownerLabel(a).localeCompare(ownerLabel(b)));
  link.innerHTML = `
    <div class="ow-link-l">${icon("user")}<span>Billed to</span>
      <select id="owPick">
        <option value="">${rec ? "— Remove owner from this property —" : "Choose an owner…"}</option>
        ${choices.map(x => { const n = ownerProps(x, true).length;
          return `<option value="${x.id}" ${x.id === p.ownerId ? "selected" : ""}>${esc(ownerLabel(x) || "Unnamed owner")}${x.company && x.name ? " · " + esc(x.company) : ""}${n ? ` (${n} propert${n===1?"y":"ies"})` : ""}</option>`; }).join("")}
        <option value="__new">+ New owner…</option>
      </select></div>
    <div class="ow-link-r">${others.length
      ? `<span class="muted">Also owns</span> ${others.map(x => `<button class="chip-link" data-go="${x.id}">${icon("building")}${esc(x.name)}</button>`).join("")}`
      : rec ? `<span class="muted">Only property for this owner — pick them on another property's Owner page to link it here.</span>`
            : `<span class="muted">Already bill this person for another property? Choose them from the list.</span>`}</div>`;
  v.appendChild(link);
  link.querySelector("#owPick").onchange = e => {
    const val = e.target.value;
    snapshot();
    if(val === "__new"){ const n = cleanOwner(Object.assign(blankOwner(), {id:uid()})); S.owners.push(n); linkOwner(p, n.id); commit(); toast("New owner started — fill in the details"); setTimeout(() => { const f = document.querySelector('[data-own="name"]'); if(f) f.focus(); }, 30); return; }
    linkOwner(p, val || null); commit();
    toast(val ? `${p.name} now bills ${ownerLabel(ownerById(val)) || "that owner"}` : `Owner removed from ${p.name}`, true);
  };
  link.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go("owner", b.dataset.go));

  const grid = elm("div","owner-grid");
  const r = COMP.roll;
  const card = elm("div","card");
  const R = rec ? ownerRoll(rec) : null;
  card.innerHTML = ownerCardHTML(o, null, {
    emptyTitle:"No owner yet", emptySub: rec ? "" : "Add who gets billed for " + p.name,
    extraKV:`<dt>This property</dt><dd class="num">${usd(r.chargesC - r.paidC)} <span class="muted" style="font-family:var(--sans)">open · ${usd(r.paidC)} paid</span></dd>
      ${others.length ? `<dt>All properties</dt><dd class="num">${usd(R.chargesC - R.paidC)} <span class="muted" style="font-family:var(--sans)">open across ${R.props} · <a href="#" id="owAll">see all</a></span></dd>` : ""}`
  });
  grid.appendChild(card);
  const form = elm("div","card");
  form.innerHTML = ownerFormHTML(o, others.length
    ? `<b>Shared with ${others.map(x => esc(x.name)).join(", ")}.</b> Changes here update every property this owner is billed for. <a href="#" id="owDetach" style="color:var(--accent)">Keep a separate copy for ${esc(p.name)} instead</a>`
    : `Appears as <b>Bill to</b> on every invoice and client statement for ${esc(p.name)}.`);
  grid.appendChild(form);
  v.appendChild(grid);
  wireOwnerForm(form, () => ensureOwner(P()));
  const all = card.querySelector("#owAll"); if(all) all.onclick = e => { e.preventDefault(); openOwner(rec.id); };
  const det = form.querySelector("#owDetach");
  if(det) det.onclick = e => {
    e.preventDefault(); snapshot();
    const copy = cleanOwner(Object.assign(blankOwner(), JSON.parse(JSON.stringify(rec)), {id:uid()}));
    S.owners.push(copy); linkOwner(p, copy.id); commit();
    toast(`${p.name} now has its own copy — edits here no longer touch ${others.length === 1 ? others[0].name : others.length + " other properties"}`, true);
  };
}

/* ---------- portfolio-wide Owners page ---------- */
function openOwner(id){ S.ui.ownerId = id; go("owners"); }
function pgOwners(){
  const id = S.ui.ownerId && ownerById(S.ui.ownerId) ? S.ui.ownerId : null;
  if(id) return pgOwnerDetail(ownerById(id));
  actions([["New owner", () => { snapshot(); const n = cleanOwner(Object.assign(blankOwner(), {id:uid()})); S.owners.push(n); Store.save(S); openOwner(n.id); }, "primary"]]);
  const v = $("#view");
  const owners = (S.owners||[]).filter(o => ownerLabel(o) || ownerProps(o, true).length || ownerPmProps(o).length)
    .map(o => ({o, R:ownerRoll(o), props:ownerProps(o), pm:ownerPmProps(o)}))
    .sort((a,b) => b.props.length - a.props.length || ownerLabel(a.o).localeCompare(ownerLabel(b.o)));
  const unassigned = live().filter(p => !p.ownerId);

  if(!owners.length && !unassigned.length){
    v.appendChild(elm("div","card",`<div class="empty"><b>No owners yet</b><p>Add owners from each property's Owner page.</p></div>`));
    return;
  }
  const list = elm("div","ow-cards");
  owners.forEach(({o, R, props, pm}) => {
    const c = elm("button","card ow-card");
    c.innerHTML = `<div class="ow-card-h"><div class="avatar sm">${esc(initials(ownerLabel(o)))}</div>
        <div style="min-width:0"><b>${esc(ownerLabel(o) || "Unnamed owner")}</b><span>${esc([o.name && o.company ? o.company : "", o.email].filter(Boolean).join(" · ") || "No contact details yet")}</span></div>
        ${props.length + pm.length > 1 ? `<span class="tag acc" style="margin-left:auto">${props.length + pm.length} properties</span>` : ""}</div>
      <div class="ow-props">${props.length || pm.length ? props.map(p => `<span title="Project billing">${icon("clip")}${esc(p.name)}</span>`).join("") + pm.map(p => `<span title="Property management">${icon("home")}${esc(p.name)}</span>`).join("") : `<span class="muted">No active properties</span>`}</div>
      <div class="ow-nums">
        <div><div class="label">Charges</div><div class="num">${usd(R.chargesC)}</div></div>
        <div><div class="label">Collected</div><div class="num" style="color:var(--green)">${usd(R.paidC)}</div></div>
        <div><div class="label">Due now</div><div class="num">${usd(R.dueC)}</div></div>
        <div><div class="label">Ready</div><div class="num"${R.readyC ? ' style="color:var(--gold)"' : ""}>${usd(R.readyC)}</div></div>
      </div>`;
    c.onclick = () => openOwner(o.id);
    list.appendChild(c);
  });
  v.appendChild(list);

  if(unassigned.length){
    const u = elm("div","card");
    const opts = `<option value="">Assign owner…</option>${(S.owners||[]).filter(ownerLabel).map(o => `<option value="${o.id}">${esc(ownerLabel(o))}</option>`).join("")}<option value="__new">+ New owner…</option>`;
    u.innerHTML = `<div class="card-h"><h3>No owner on file</h3><span class="muted" style="margin-left:auto;font-size:12px">${unassigned.length} propert${unassigned.length===1?"y":"ies"}</span></div>
      ${unassigned.map(p => `<div class="ow-un"><span>${icon("building")}<b>${esc(p.name)}</b></span><select data-assign="${p.id}">${opts}</select></div>`).join("")}`;
    u.querySelectorAll("[data-assign]").forEach(sel => sel.onchange = () => {
      const p = S.properties.find(x => x.id === sel.dataset.assign);
      if(sel.value === "__new"){ go("owner", p.id); setTimeout(() => { const pk = $("#owPick"); if(pk){ pk.value = "__new"; pk.dispatchEvent(new Event("change")); } }, 30); return; }
      if(!sel.value) return;
      snapshot(); linkOwner(p, sel.value); commit(); toast(`${p.name} now bills ${ownerLabel(ownerById(sel.value))}`, true);
    });
    v.appendChild(u);
  }
}

function pgOwnerDetail(o){
  const props = ownerProps(o), allProps = ownerProps(o, true);
  $("#pgCrumb").textContent = "Owners";
  $("#pgTitle").textContent = ownerLabel(o) || "New owner";
  { const n = props.length + ownerPmProps(o).length; $("#pgSub").textContent = n ? `${n} propert${n===1?"y":"ies"}${props.length && ownerPmProps(o).length ? " · projects and management" : ""}` : "Not linked to a property yet"; }
  const acts = [["All owners", () => { S.ui.ownerId = null; persistUi(); render(); }, "ghost"]];
  if(!allProps.length && !ownerPmProps(o).length) acts.push(["Delete owner", () => {
    if(!confirm(`Delete ${ownerLabel(o) || "this owner"}? No property uses them.`)) return;
    snapshot(); S.owners = S.owners.filter(x => x.id !== o.id); S.ui.ownerId = null; commit(); toast("Owner deleted", true); }, "ghost"]);
  if(props.length) acts.push(["Combined statement", () => ownerStatementSheet(o.id), "primary"]);
  actions(acts);
  const v = $("#view"), R = ownerRoll(o);

  if(props.length){
    const st = elm("div","card ow-stats");
    st.innerHTML = [["Total charges", usd(R.chargesC), ""],["Collected", usd(R.paidC), "var(--green)"],
      ["Due now", usd(R.dueC), R.dueC ? "var(--ink)" : ""],["Ready to send", usd(R.readyC), R.readyC ? "var(--gold)" : ""],
      ["In progress", usd(R.draftC), ""]]
      .map(([l,val,c]) => `<div><div class="label">${l}</div><div class="num"${c ? ` style="color:${c}"` : ""}>${val}</div></div>`).join("");
    v.appendChild(st);
    const pt = elm("div","card"); pt.style.marginBottom = "16px";
    pt.innerHTML = `<div class="card-h"><h3>Properties</h3><span class="muted" style="margin-left:auto;font-size:12px">Each property invoices separately under its own cap and fee</span></div>${ownerPropsTableHTML(o)}`;
    wirePropRows(pt);
    v.appendChild(pt);
  }
  const pmT = ownerPmTableHTML(o);
  if(pmT){ const pc = elm("div","card"); pc.style.marginBottom = "16px"; pc.innerHTML = `<div class="card-h"><h3>Managed properties</h3><span class="muted" style="margin-left:auto;font-size:12px">Rent, fees and payouts from property management</span></div>${pmT}`; v.appendChild(pc); }
  const grid = elm("div","owner-grid");
  const card = elm("div","card"); card.innerHTML = ownerCardHTML(o, props, {emptyTitle:"New owner", emptySub:"Fill in the details on the right"});
  grid.appendChild(card);
  const form = elm("div","card");
  form.innerHTML = ownerFormHTML(o, props.length > 1
    ? `Changes here update ${props.length === 2 ? "both" : "all " + props.length} properties: ${props.map(p => esc(p.name)).join(", ")}.`
    : props.length ? `Appears as <b>Bill to</b> on invoices and statements for ${esc(props[0].name)}.` : "Link this owner from a property's Owner page.");
  grid.appendChild(form);
  v.appendChild(grid);
  wireOwnerForm(form, () => o);
}

/* ---------- combined statement across an owner's properties ---------- */
function ownerStatementHTML(o, opt){
  const x = Object.assign({title:"Owner Statement", from:(P().report||{}).from || "PHD Properties",
    asOf:new Date().toISOString().slice(0,10), message:"", showInvoices:true, showUnissued:true,
    terms:"Please make payment to PHD Properties. Each property is invoiced separately — invoice numbers restart per property and unit. Receipts are on file for every charge."}, opt || {});
  const props = ownerProps(o), R = ownerRoll(o), money = usd;
  const addr = ownerAddressLines(o);
  const bill = `<div class="pv"><b>${esc(o.name || o.company || "—")}</b>${o.name && o.company ? `<br>${esc(o.company)}` : ""}${addr.map(l => `<br>${esc(l)}`).join("")}${o.email ? `<br><span class="m">${esc(o.email)}</span>` : ""}${o.phone ? `<br><span class="m">${esc(o.phone)}</span>` : ""}</div>`;
  const label = inv => inv.reg.paid ? ["Paid","paid"] : inv.reg.dateSent ? ["Awaiting payment","sent"] : inv.full ? ["Not yet issued","ready"] : ["In progress","draft"];

  const summaryRows = props.map(p => { const r = ALL[p.id].roll;
    return `<tr><td>${esc(p.name)}<div class="sub">${p.feePct}% fee · ${r.invoices} invoice${r.invoices===1?"":"s"}</div></td><td class="r">${money(r.expenseC)}</td><td class="r">${money(r.feeC)}</td><td class="r">${money(r.chargesC)}</td><td class="r">${money(r.paidC)}</td><td class="r">${money(r.sentC)}</td></tr>`; }).join("");

  let invBlock = "";
  if(x.showInvoices) props.forEach(p => {
    const C = ALL[p.id], multi = p.units.length > 1;
    const rows = [];
    p.units.forEach(u => (C.units[u.id] || []).forEach(inv => {
      if(!x.showUnissued && !(inv.reg.paid || inv.reg.dateSent)) return;
      const [lt] = label(inv);
      rows.push(`<tr><td>Invoice ${inv.no}${multi ? ` · ${esc(u.name)}` : ""}</td><td class="dt">${esc(lt)}</td><td class="dt">${inv.reg.dateSent ? docShort(inv.reg.dateSent) : "—"}</td><td class="r">${money(inv.totalC)}</td><td class="r">${money(inv.reg.paid ? 0 : inv.reg.dateSent ? inv.totalC : 0)}</td></tr>`);
    }));
    invBlock += `<h3 class="unit">${esc(p.name)}</h3>${rows.length
      ? `<table class="zebra"><thead><tr><th>Invoice</th><th style="width:130px">Status</th><th style="width:100px">Issued</th><th class="r" style="width:110px">Total</th><th class="r" style="width:110px">Due</th></tr></thead><tbody>${rows.join("")}</tbody>
         <tbody class="totals"><tr class="tot"><td colspan="3">${esc(p.name)} total</td><td class="r">${money(C.roll.chargesC)}</td><td class="r">${money(C.roll.sentC)}</td></tr></tbody></table>`
      : `<p class="lead">No invoices issued yet.</p>`}`;
  });

  const line = (k,v,cls) => `<tr class="${cls||""}"><td>${k}</td><td class="r">${v}</td></tr>`;
  const notes = [];
  if(R.notYetC) notes.push(`“Total charges to date” includes ${money(R.notYetC)} of completed work that has not been invoiced yet, so it is higher than the amount currently due.`);
  if(R.heldC) notes.push(`${money(R.heldC)} is held for final billing and not included in any invoice above.`);

  return tidyBreaks(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(ownerLabel(o))} — ${esc(x.title)}</title>
  <style>${docCSS(`${x.from} · ${ownerLabel(o)} · ${x.title} · ${docShort(x.asOf)}`, false, 1)}
    .ptab td{font-size:12px}</style></head><body>
    <div class="head">
      <div>${docMark(x.from)}<h1>${esc(x.title)}</h1><div class="prop">${props.map(p => esc(p.name)).join(" · ")}</div></div>
      <div class="right"><b>${docLong(x.asOf)}</b>Prepared for ${esc(ownerLabel(o))}</div>
    </div>
    <div class="parties">
      <div><div class="pk">Bill to</div>${bill}</div>
      <div><div class="pk">Properties</div><div class="pv">${props.map(p => `<b>${esc(p.name)}</b>${p.address ? `<br><span class="m">${esc(p.address)}</span>` : ""}`).join("<br>")}</div></div>
      <div><div class="pk">Statement</div><div class="pv"><b>${docLong(x.asOf)}</b><br><span class="m">${props.length} propert${props.length===1?"y":"ies"} · ${R.invoices} invoice${R.invoices===1?"":"s"}</span></div></div>
    </div>
    ${x.message ? `<div class="msg">${esc(x.message)}</div>` : ""}
    <div class="acct">
      <div class="acct-t"><h2 class="tight">Account summary · all properties</h2>
        <table class="sum">
          ${line("Project expenses", money(R.expenseC))}
          ${line("Project management fees", money(R.feeC))}
          ${line("Total charges to date", money(R.chargesC), "rule")}
          ${line("Invoiced to date", money(R.paidC + R.sentC))}
          ${line("Payments received", (R.paidC ? "−" : "") + money(R.paidC))}
          ${line("Balance due on issued invoices", money(R.dueC), "due")}
          ${R.notYetC ? line("Charges not yet invoiced", money(R.notYetC), "soft") : ""}
        </table></div>
      <div class="acct-c"><div class="cap">${R.dueC ? "Balance due today" : "Nothing due today"}</div><div class="big">${money(R.dueC)}</div>
        ${R.notYetC ? `<div class="capsub">${money(R.notYetC)} of completed work is not yet invoiced and will follow.</div>` : ""}</div>
    </div>
    <h2>By property</h2>
    <table class="zebra ptab"><thead><tr><th>Property</th><th class="r">Expenses</th><th class="r">Fees</th><th class="r">Charges</th><th class="r">Paid</th><th class="r">Due now</th></tr></thead>
      <tbody>${summaryRows}</tbody>
      <tbody class="totals"><tr class="tot"><td>All properties</td><td class="r">${money(R.expenseC)}</td><td class="r">${money(R.feeC)}</td><td class="r">${money(R.chargesC)}</td><td class="r">${money(R.paidC)}</td><td class="r">${money(R.dueC)}</td></tr></tbody></table>
    ${x.showInvoices ? `<h2>Invoices</h2>${invBlock}` : ""}
    ${notes.length ? `<div class="notes"><ul>${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
    ${x.terms ? `<div class="terms">${esc(x.terms)}</div>` : ""}
  </body></html>`);
}

function ownerStatementSheet(id){
  const o = ownerById(id); if(!o) return;
  const props = ownerProps(o);
  const st = S.ui.ownStmt = Object.assign({showInvoices:true, showUnissued:true, message:""}, S.ui.ownStmt || {});
  const sh = $("#sheet");
  sh.innerHTML = `
    <div class="sheet-h"><h3>Combined statement</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <p class="muted" style="font-size:13.3px;margin-top:0">One statement for <b>${esc(ownerLabel(o))}</b> covering ${props.map(p => esc(p.name)).join(", ")}. Invoices stay separate per property — this rolls them up so the owner sees one balance.</p>
      <label class="fld"><span>Message</span><textarea id="os_msg" rows="3" placeholder="Optional note at the top of the statement">${esc(st.message)}</textarea></label>
      <label class="opt"><input type="checkbox" id="os_inv" ${st.showInvoices ? "checked" : ""}><span><b>List invoices</b><small>Every invoice per property with its status and amount due.</small></span></label>
      <label class="opt"><input type="checkbox" id="os_un" ${st.showUnissued ? "checked" : ""}><span><b>Include invoices not yet sent</b><small>Off shows only what has been issued.</small></span></label>
      <div class="os-prev"><div class="os-in"><iframe id="os_frame" title="Preview"></iframe></div></div>
    </div>
    <div class="sheet-f"><span style="flex:1"></span>
      <button class="btn" id="os_dl">${icon("download")} Download</button>
      <button class="btn primary" id="os_pdf">Save as PDF</button></div>`;
  const html = () => ownerStatementHTML(o, {message:$("#os_msg").value.trim(), showInvoices:$("#os_inv").checked, showUnissued:$("#os_un").checked});
  const draw = () => { st.message = $("#os_msg").value; st.showInvoices = $("#os_inv").checked; st.showUnissued = $("#os_un").checked; $("#os_frame").srcdoc = html(); };
  ["#os_msg","#os_inv","#os_un"].forEach(s => { $(s).oninput = draw; $(s).onchange = draw; });
  draw();
  $("#shClose").onclick = closeSheet;
  $("#os_pdf").onclick = () => { printDoc(html()); toast("Opening the print dialog — choose Save as PDF"); };
  $("#os_dl").onclick = () => download(`${ownerLabel(o)} Owner Statement ${new Date().toISOString().slice(0,10)}.html`, html());
  openPanel();
}

/* =====================================================================
   QUICK ENTRY — type it the way you'd say it
   "Lowes 245.18 kitchen faucet unit b" → date, vendor, item, unit, amount
   ===================================================================== */
const normV = s => String(s||"").toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9& ]+/g," ").replace(/\s+/g," ").trim();
function knownVendors(){
  const m = new Map();
  S.properties.forEach(p => p.transactions.forEach(t => {
    const v = (t.vendor||"").trim(); if(!v) return;
    const k = normV(v); if(!k) return;
    const e = m.get(k) || {key:k, name:v, n:0, last:""};
    e.n++; if((t.date||"") >= e.last){ e.last = t.date||""; e.name = v; }
    m.set(k, e);
  }));
  return [...m.values()].sort((a,b) => b.n - a.n);
}
const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function parseQuick(text, p){
  const out = {date:iso(new Date()), dateSet:false, vendor:"", vendorNew:false, desc:"", amount:null, credit:false,
               scope:null, unitLabel:"", applyFee:true, status:"billable", allowPartial:true, flags:[]};
  let toks = String(text||"").trim().split(/\s+/).filter(Boolean);
  if(!toks.length) return out;
  const low = () => toks.map(t => t.toLowerCase());
  const take = (i, n) => toks.splice(i, n||1);

  /* dates */
  for(let i = 0; i < toks.length; i++){
    const w = toks[i].toLowerCase().replace(/,$/,"");
    let d = null, n = 1;
    if(w === "today") d = new Date();
    else if(w === "yesterday" || w === "yday"){ d = new Date(); d.setDate(d.getDate()-1); }
    else if(/^\d{4}-\d{2}-\d{2}$/.test(w)) d = new Date(w+"T00:00:00");
    else if(/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(w)){
      const [m, dd, y] = w.split("/"); const yr = y ? (y.length === 2 ? 2000 + +y : +y) : new Date().getFullYear();
      d = new Date(yr, +m-1, +dd);
    } else if(MONTHS[w] && /^\d{1,2}(st|nd|rd|th)?,?$/.test((toks[i+1]||"").toLowerCase())){
      d = new Date(new Date().getFullYear(), MONTHS[w]-1, parseInt(toks[i+1],10)); n = 2;
    }
    if(d && !isNaN(d)){ out.date = iso(d); out.dateSet = true; take(i, n); break; }
  }

  /* flags */
  const phrase = (words, fn) => {
    const L = low();
    for(let i = 0; i <= L.length - words.length; i++){
      if(words.every((w,j) => L[i+j].replace(/[^a-z]/g,"") === w)){ take(i, words.length); fn(); return true; }
    }
    return false;
  };
  phrase(["no","fee"], () => { out.applyFee = false; out.flags.push("No fee"); }) ||
  phrase(["at","cost"], () => { out.applyFee = false; out.flags.push("No fee"); }) ||
  phrase(["nofee"], () => { out.applyFee = false; out.flags.push("No fee"); });
  phrase(["keep","whole"], () => { out.allowPartial = false; out.flags.push("Keep whole"); });
  phrase(["on","hold"], () => { out.status = "review"; out.flags.push("On hold"); }) ||
  phrase(["hold"], () => { out.status = "review"; out.flags.push("On hold"); });
  ["refund","return","returned","credit"].some(w => phrase([w], () => { out.credit = true; }));

  /* unit */
  if(p.units.length === 1){ out.scope = {type:"single", unit:p.units[0].id, splits:{}}; out.unitLabel = p.units[0].name; }
  else {
    const L = low();
    const bi = L.findIndex(w => w === "both" || w === "split");
    if(bi >= 0){
      take(bi);
      const splits = {};
      const ds = p.defaultSplit && Object.keys(p.defaultSplit).length ? p.defaultSplit : null;
      p.units.forEach(u => splits[u.id] = ds ? (Number(ds[u.id])||0) : +(100 / p.units.length).toFixed(2));
      out.scope = {type:"split", unit:null, splits};
      out.unitLabel = "Split " + p.units.map(u => `${u.name} ${splits[u.id]}%`).join(" / ");
    } else {
      /* longest unit name that appears as whole words wins */
      const byLen = [...p.units].sort((a,b) => b.name.length - a.name.length);
      for(const u of byLen){
        const uw = normV(u.name).split(" ");
        const L2 = low().map(normV);
        for(let i = 0; i <= L2.length - uw.length; i++){
          if(uw.every((w,j) => L2[i+j] === w)){ take(i, uw.length); out.scope = {type:"single", unit:u.id, splits:{}}; out.unitLabel = u.name; break; }
        }
        if(out.scope) break;
      }
      /* "unit b" when the unit is literally named "Unit B" was handled above; also accept "u b" / "#b" */
      if(!out.scope){
        const L3 = low();
        for(let i = 0; i < L3.length; i++){
          const m = L3[i].match(/^#([a-z0-9]+)$/);
          const hit = m && p.units.find(u => normV(u.name).split(" ").pop() === m[1]);
          if(hit){ take(i); out.scope = {type:"single", unit:hit.id, splits:{}}; out.unitLabel = hit.name; break; }
        }
      }
    }
  }

  /* amount — a $ or a cents value beats a bare integer; dimensions like "30 x 60" never count */
  const cands = [];
  toks.forEach((tk, i) => {
    const m = tk.match(/^(-)?\(?\$?(-)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\)?$/);
    if(!m) return;
    const near = [toks[i-1], toks[i+1]].map(x => (x||"").toLowerCase());
    if(near.includes("x") || near.includes("×")) return;
    let score = /\$/.test(tk) ? 3 : m[4] ? 2 : 1;
    cands.push({i, score, neg: !!(m[1] || m[2] || /^\(.*\)$/.test(tk)), val: parseFloat((m[3] + (m[4]||"")).replace(/,/g,""))});
  });
  if(cands.length){
    const best = cands.sort((a,b) => b.score - a.score || b.i - a.i)[0];
    if(best.score > 1 || cands.length === 1 || toks.length > 1){
      out.amount = best.val; if(best.neg) out.credit = true; take(best.i);
    }
  }

  /* vendor — the longest vendor you've used before, wherever it appears; else the first word */
  const vendors = knownVendors();
  const L4 = toks.map(normV);
  let vHit = null;
  vendors.forEach(v => {
    const vw = v.key.split(" ");
    for(let i = 0; i <= L4.length - vw.length; i++){
      if(vw.every((w,j) => L4[i+j] === w)){
        if(!vHit || vw.length > vHit.len || (vw.length === vHit.len && i < vHit.i)) vHit = {v, i, len:vw.length};
        break;
      }
    }
  });
  if(vHit){ out.vendor = vHit.v.name; take(vHit.i, vHit.len); }
  else if(toks.length >= 2){ out.vendor = toks[0].charAt(0).toUpperCase() + toks[0].slice(1); out.vendorNew = true; take(0); }

  let d = toks.join(" ").replace(/^[-–—:,\s]+|[-–—:,\s]+$/g,"");
  d = d.charAt(0).toUpperCase() + d.slice(1);
  if(out.credit && d && !/\b(return|refund|credit)/i.test(d)) d += " — return";
  if(out.credit && !d) d = "Return";
  out.desc = d;
  if(!out.scope) out.scope = null;
  return out;
}

function quickEntryBar(p){
  const box = elm("div","qe");
  box.innerHTML = `<div class="qe-row">
      <div class="qe-in">${icon("bolt")}<input type="text" id="qeIn" autocomplete="off" spellcheck="false"
        placeholder="${esc(p.units.length > 1 ? `Lowes 245.18 kitchen faucet ${p.units[p.units.length-1].name.toLowerCase()}` : "Lowes 245.18 kitchen faucet")}"></div>
      <button class="btn" id="qeMore" title="Open the full form (Shift+Enter)">Details</button>
      <button class="btn primary" id="qeAdd" disabled>Add</button>
    </div>
    <div class="qe-chips" id="qeChips"><span class="qe-hint" style="margin-left:0">Type vendor, amount, and what it was${p.units.length > 1 ? " — plus the unit, or “both” to split" : ""}. Dates like “yesterday” or “9/12”, and “no fee”, “hold”, “return” work too.</span></div>`;
  const inp = box.querySelector("#qeIn"), chips = box.querySelector("#qeChips"), addB = box.querySelector("#qeAdd");
  let parsed = null;
  const draw = () => {
    const txt = inp.value;
    if(!txt.trim()){
      parsed = null; addB.disabled = true;
      chips.innerHTML = `<span class="qe-hint" style="margin-left:0">Type vendor, amount, and what it was${p.units.length > 1 ? " — plus the unit, or “both” to split" : ""}. Dates like “yesterday” or “9/12”, and “no fee”, “hold”, “return” work too.</span>`;
      return;
    }
    parsed = parseQuick(txt, P());
    const needUnit = !parsed.scope;
    const c = [];
    c.push(`<span class="qchip"><i>Date</i>${fdateS(parsed.date)}</span>`);
    c.push(parsed.vendor ? `<span class="qchip"><i>${parsed.vendorNew ? "New vendor" : "Vendor"}</i>${esc(parsed.vendor)}</span>` : `<span class="qchip miss"><i>Vendor</i>none</span>`);
    c.push(parsed.desc ? `<span class="qchip"><i>Item</i>${esc(parsed.desc)}</span>` : `<span class="qchip miss"><i>Item</i>none</span>`);
    c.push(needUnit ? `<span class="qchip miss"><i>Unit</i>add ${P().units.map(u => esc(u.name.toLowerCase())).join(", ")} or “both”</span>`
                    : `<span class="qchip"><i>Unit</i>${esc(parsed.unitLabel)}</span>`);
    c.push(parsed.amount != null ? `<span class="qchip ${parsed.credit ? "cr" : "amt"}"><i>${parsed.credit ? "Credit" : "Amount"}</i>${parsed.credit ? "−" : ""}${usd(cents(parsed.amount))}</span>`
                                 : `<span class="qchip miss"><i>Amount</i>none</span>`);
    parsed.flags.forEach(f => c.push(`<span class="qchip flag">${esc(f)}</span>`));
    c.push(`<span class="qe-hint"><kbd>↵</kbd> add · <kbd>⇧</kbd><kbd>↵</kbd> details</span>`);
    chips.innerHTML = c.join("");
    addB.disabled = parsed.amount == null || !(parsed.amount > 0) || needUnit;
  };
  const toPreset = pr => ({date:pr.date, vendor:pr.vendor, desc:pr.desc, amount:pr.amount == null ? "" : (pr.credit ? -pr.amount : pr.amount),
    scope:pr.scope || {type:"single", unit:P().units[0].id, splits:{}}, status:pr.status, applyFee:pr.applyFee, allowPartial:pr.allowPartial});
  const add = () => {
    if(!parsed || addB.disabled) return;
    const pr = parsed, p2 = P();
    snapshot();
    const rec = Object.assign({id:uid(), receipt:"", link:"", pin:null, party:"Owner", notes:"", tags:[], reconciled:false, reconciledAt:""}, toPreset(pr));
    if(pr.credit && p2.tags.some(t => t.id === RETURN_TAG_ID)) rec.tags = [RETURN_TAG_ID];
    applyHoldRule(rec, p2);
    p2.transactions.push(rec);
    S.ui.flash = rec.id; S.ui.qeFocus = true;
    S.ui.qeRecent = [rec.id].concat((S.ui.qeRecent||[]).filter(x => x !== rec.id)).slice(0, 4);
    const lastPage = Math.max(1, Math.ceil(visibleTxns(p2).length / PAGE));
    S.ui.page = lastPage;
    commit();
    toast(`Added ${pr.credit ? "credit " : ""}${usd(cents(Math.abs(rec.amount)))} · ${rec.vendor || "no vendor"}${rec.status === "review" ? " · on hold" : ""}`, true);
  };
  inp.addEventListener("input", draw);
  inp.addEventListener("keydown", e => {
    if(e.key === "Enter" && e.shiftKey){ e.preventDefault(); openSheet(null, parsed ? toPreset(parsed) : null); }
    else if(e.key === "Enter"){ e.preventDefault(); add(); }
    else if(e.key === "Escape"){ inp.value = ""; draw(); inp.blur(); }
    else if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !inp.value){ e.preventDefault(); undo(); }
  });
  addB.onclick = add;
  box.querySelector("#qeMore").onclick = () => openSheet(null, parsed ? toPreset(parsed) : null);
  /* just-added strip: stays under the entry bar so rapid entry never loses sight of what went in */
  const recent = (S.ui.qeRecent||[]).map(id => p.transactions.find(t => t.id === id)).filter(Boolean);
  if(recent.length){
    const rb = elm("div","qe-recent");
    rb.innerHTML = `<span class="label">Just added</span>` + recent.map(t => {
      const u = t.scope.type === "single" ? (p.units.find(x => x.id === t.scope.unit)?.name || "") : "Split";
      return `<button type="button" class="qe-r" data-qr="${t.id}"><b class="num"${cents(t.amount)<0?' style="color:var(--green)"':""}>${usd(cents(t.amount))}</b>
        <span>${esc(t.vendor||"—")} · ${esc(t.desc||"Untitled")}</span><span class="muted">${esc(u)}${t.status==="review"?" · on hold":""}</span></button>`;
    }).join("") + `<button type="button" class="btn ghost sm" id="qeClr" style="margin-left:auto">Clear</button>`;
    rb.querySelectorAll("[data-qr]").forEach(b => b.onclick = () => openSheet(b.dataset.qr));
    rb.querySelector("#qeClr").onclick = () => { S.ui.qeRecent = []; render(); };
    box.appendChild(rb);
  }
  if(S.ui.qeDraft){ inp.value = S.ui.qeDraft; draw(); }
  inp.addEventListener("input", () => { S.ui.qeDraft = inp.value; });
  return box;
}

/* =====================================================================
   COMMAND PALETTE — ⌘K / Ctrl+K from anywhere
   ===================================================================== */
const CMD = {items:[], sel:0};
function cmdItems(q){
  const qq = (q||"").trim().toLowerCase();
  const p = P(), out = [];
  const push = (sec, ic, main, sub, amt, run) => out.push({sec, ic, main, sub, amt, run});
  const pages = S.ui.mode === "pm"
    ? [["pmMonth","Month close","check"],["pmProps","Properties","building"],["pmDeposits","Deposits","receipt"],["pmIncome","Income","grid"]]
    : [["overview","Overview","home"],["txns","Transactions","list"],["invoices","Invoices","file"],
       ["owner","Owner","user"],["scope","Scope of work","clip"],["settings","Settings","gear"]];
  const acts = [
    ["New transaction", "plus", "in " + p.name, () => goQuick()],
    ["Import transactions", "download", "paste rows from a spreadsheet", () => { go("txns"); importSheet(); }],
    ["Client report", "file", "statement for " + p.name, () => { if(["portfolio","reconcile","owners"].includes(S.ui.view)) go("overview"); reportSheet(); }],
    ["Reconcile", "check", "match bank and card activity", () => go("reconcile")],
    ["Switch to " + (S.ui.mode === "pm" ? "project billing" : "property management"), "arrow", "", () => setMode(S.ui.mode === "pm" ? "projects" : "pm")],
    ["Record rent", "home", "property management · this month", () => { S.ui.mode = "pm"; pmQuick(); }],
    ["Team & activity", "user", "who has access, who changed what", () => go("team")],
    ["Receipt inbox", "receipt", "review receipts read from email and Drive", () => { go("inbox"); inboxRefresh(); }],
    ["New property", "building", "", () => newPropSheet()],
    ["Undo last change", "undo", "", () => undo()],
    ["Download backup", "download", "everything, as a JSON file", () => backup()]
  ];
  if(!qq){
    pages.forEach(([k,l,ic]) => push(S.ui.mode === "pm" ? "Go to — property management" : "Go to — " + p.name, ic, l, "", "", () => go(k)));
    push("Go to — portfolio", "grid", "All properties", "", "", () => go("portfolio"));
    push("Go to — portfolio", "user", "Owners", `${(S.owners||[]).filter(ownerLabel).length} on file`, "", () => { S.ui.ownerId = null; go("owners"); });
    live().filter(x => x.id !== p.id).forEach(x => push("Go to — portfolio", "building", x.name, ownerName(x), "", () => go("overview", x.id)));
    acts.forEach(([l,ic,s,fn]) => push("Actions", ic, l, s, "", fn));
    return out;
  }
  /* transactions first when the query looks like money */
  const hits = searchReconcile(q).slice(0, 8);
  const money = /\d/.test(qq);
  const txnRows = () => hits.forEach(e => push("Transactions", "receipt", e.desc || "Untitled",
      `${e.propName} · ${e.vendor || "—"}${e.date ? " · " + fdateS(e.date) : ""}${e.reconciled ? " · reconciled" : ""}`,
      usd(cents(e.amount)), () => { go("txns", e.propId); openSheet(e.txnId); }));
  if(money) txnRows();
  (S.owners||[]).filter(o => ownerLabel(o) && `${o.name} ${o.company} ${o.email}`.toLowerCase().includes(qq))
    .forEach(o => { const ps = ownerProps(o); push("Owners", "user", ownerLabel(o), ps.map(p => p.name).join(" · ") || "no properties", "", () => openOwner(o.id)); });
  pmState().properties.filter(x => !x.deleted && `${x.name} ${x.address} ${ownerLabel(ownerById(x.ownerId))}`.toLowerCase().includes(qq)).slice(0, 8)
    .forEach(x => push("Managed properties", "home", x.name, [ownerLabel(ownerById(x.ownerId)), PM_STATUS[x.status]].filter(Boolean).join(" · "), x.rent ? usd(cents(x.rent)) : "",
      () => { S.ui.mode = "pm"; const m = pmCurrentMonth(); go("pmMonth"); setTimeout(() => pmRowSheet(m, x.id), 30); }));
  S.properties.filter(x => (x.name + " " + ownerName(x)).toLowerCase().includes(qq))
    .forEach(x => push("Properties", "building", x.name, ownerName(x) || (x.archived ? "archived" : ""), "", () => go("overview", x.id)));
  pages.filter(([,l]) => l.toLowerCase().includes(qq)).forEach(([k,l,ic]) => push("Pages — " + p.name, ic, l, "", "", () => go(k)));
  if("all properties portfolio".includes(qq)) push("Pages", "grid", "All properties", "", "", () => go("portfolio"));
  if("owners".includes(qq)) push("Pages", "user", "Owners", "", "", () => { S.ui.ownerId = null; go("owners"); });
  acts.filter(([l,,s]) => (l + " " + s).toLowerCase().includes(qq)).forEach(([l,ic,s,fn]) => push("Actions", ic, l, s, "", fn));
  if(!money) txnRows();
  return out;
}
function drawCmd(){
  const list = $("#cmdkList");
  CMD.items = cmdItems($("#cmdkIn").value);
  if(CMD.sel >= CMD.items.length) CMD.sel = Math.max(0, CMD.items.length - 1);
  if(!CMD.items.length){ list.innerHTML = `<div class="cmdk-empty">Nothing matches — try an amount like 88.28 or a vendor name.</div>`; return; }
  let html = "", sec = null;
  CMD.items.forEach((it, i) => {
    if(it.sec !== sec){ sec = it.sec; html += `<div class="cmdk-sec">${esc(sec)}</div>`; }
    html += `<div class="cmdk-i" data-i="${i}" aria-selected="${i === CMD.sel}">${icon(it.ic)}
      <div class="main"><span>${esc(it.main)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ""}</div>
      ${it.amt ? `<span class="amt">${esc(it.amt)}</span>` : ""}</div>`;
  });
  list.innerHTML = html;
  list.querySelectorAll(".cmdk-i").forEach(n => {
    n.onmousemove = () => { if(CMD.sel !== +n.dataset.i){ CMD.sel = +n.dataset.i; list.querySelectorAll(".cmdk-i").forEach(x => x.setAttribute("aria-selected", x === n)); } };
    n.onclick = () => runCmd(+n.dataset.i);
  });
  const cur = list.querySelector('[aria-selected="true"]'); if(cur) cur.scrollIntoView({block:"nearest"});
}
function runCmd(i){ const it = CMD.items[i]; if(!it) return; closeCmd(); setTimeout(() => it.run(), 0); }
function openCmd(prefill){
  closeSheet();
  const c = $("#cmdk"); c.classList.add("on"); c.setAttribute("aria-hidden","false");
  const inp = $("#cmdkIn"); inp.value = prefill || ""; CMD.sel = 0; drawCmd();
  setTimeout(() => inp.focus(), 10);
}
function closeCmd(){ const c = $("#cmdk"); c.classList.remove("on"); c.setAttribute("aria-hidden","true"); }
$("#cmdkIn").addEventListener("input", () => { CMD.sel = 0; drawCmd(); });
$("#cmdkIn").addEventListener("keydown", e => {
  if(e.key === "ArrowDown"){ e.preventDefault(); CMD.sel = Math.min(CMD.items.length - 1, CMD.sel + 1); drawCmd(); }
  else if(e.key === "ArrowUp"){ e.preventDefault(); CMD.sel = Math.max(0, CMD.sel - 1); drawCmd(); }
  else if(e.key === "Enter"){ e.preventDefault(); runCmd(CMD.sel); }
  else if(e.key === "Escape"){ e.preventDefault(); closeCmd(); }
});
$("#cmdk").addEventListener("mousedown", e => { if(e.target.id === "cmdk") closeCmd(); });

/* go to the current property's quick-entry bar, ready to type */
function goQuick(){
  if(S.ui.mode === "pm") return pmQuick();
  if(S.ui.view !== "txns") go("txns");
  setTimeout(() => { const n = $("#qeIn"); if(n){ n.focus(); n.scrollIntoView({block:"center", behavior:"smooth"}); } }, 30);
}

/* =====================================================================
   RECEIPT INBOX — receipts read by the Google Apps Script intake,
   waiting for your approval before they touch a ledger.
   The web-app URL and key live only in this browser (not in backups).
   ===================================================================== */
const INBOX_KEY = "phd-inbox-conn";
const INBOX = {items:[], loading:false, err:"", last:0, tried:false, open:{}, draft:{}};

function inboxConn(){
  if(typeof Cloud !== "undefined" && Cloud.ready){ const v = S.inboxConn; return v && v.url && v.token ? v : null; }   // hosted: shared by the office, stored in the database
  try{ const v = JSON.parse(localStorage.getItem(INBOX_KEY) || "null"); if(v && v.url && v.token) return v; }catch(e){}
  return null;
}
function setInboxConn(v){
  if(typeof Cloud !== "undefined" && Cloud.ready){ S.inboxConn = v || null; Store.save(S); return; }
  try{ v ? localStorage.setItem(INBOX_KEY, JSON.stringify(v)) : localStorage.removeItem(INBOX_KEY); }catch(e){}
}
async function inboxGet(params){
  const c = inboxConn(); if(!c) throw new Error("Not connected");
  const q = new URLSearchParams(Object.assign({token:c.token}, params || {}));
  const r = await fetch(c.url + (c.url.includes("?") ? "&" : "?") + q.toString(), {method:"GET", redirect:"follow"});
  const j = await r.json();
  if(!j.ok) throw new Error(j.error === "unauthorized" ? "The inbox key was not accepted — paste it again from the script log" : (j.error || "Inbox error"));
  return j;
}
async function inboxPost(body){
  const c = inboxConn(); if(!c) throw new Error("Not connected");
  // text/plain keeps this a "simple" request, which Apps Script accepts from a local file
  const r = await fetch(c.url, {method:"POST", redirect:"follow", body:JSON.stringify(Object.assign({token:c.token}, body))});
  const j = await r.json();
  if(!j.ok) throw new Error(j.error || "Inbox error");
  return j;
}

/* Send the property list so Claude can guess property and unit. Only when it changed. */
async function inboxSyncConfig(force){
  const list = live().map(p => ({id:p.id, name:p.name, address:p.address || "", side:"projects", units:p.units.map(u => ({id:u.id, name:u.name}))}))
    .concat(pmLiveProps().map(p => ({id:p.id, name:p.name + " (managed rental)", address:p.address || "", side:"pm", units:[]})));
  const sig = JSON.stringify(list);
  let last = ""; try{ last = localStorage.getItem(INBOX_KEY + "-cfg") || ""; }catch(e){}
  if(!force && last === sig) return;
  await inboxPost({action:"config", properties:list});
  try{ localStorage.setItem(INBOX_KEY + "-cfg", sig); }catch(e){}
}

/* Items already approved here but whose "approved" message didn't reach the sheet yet */
function inboxDone(){ if(!S.inboxDone || typeof S.inboxDone !== "object") S.inboxDone = {}; return S.inboxDone; }

async function inboxRefresh(quiet){
  if(!inboxConn() || INBOX.loading) return;
  INBOX.loading = true; INBOX.err = ""; INBOX.tried = true;
  if(!quiet && S.ui.view === "inbox") render();
  try{
    inboxSyncConfig(false).catch(() => {});
    const j = await inboxGet({action:"list"});
    const done = inboxDone();
    // re-send decisions that didn't land last time
    for(const it of j.items.filter(x => done[x.id])){
      try{ await inboxPost(Object.assign({action:"decide", id:it.id}, done[it.id].msg)); delete done[it.id]; }catch(e){}
    }
    INBOX.items = j.items.filter(x => !done[x.id]);
    INBOX.last = Date.now();
  }catch(e){
    INBOX.err = String(e.message || e);
  }
  INBOX.loading = false;
  if(S.ui.view === "inbox") render(); else renderNav();
}
const inboxCount = () => INBOX.items.filter(i => i.status === "pending").length;

/* ---------- the page ---------- */
function pgInbox(){
  const v = $("#view"), conn = inboxConn();
  if(!conn) return inboxSetup(v);

  actions([["Disconnect", () => { if(!confirm("Disconnect this browser from the receipt inbox? Receipts keep collecting in Google; you can reconnect any time.")) return; setInboxConn(null); INBOX.items = []; render(); }, "ghost"],
           ["Open sheet", () => inboxGet({action:"ping"}).then(j => j.sheet && window.open(j.sheet, "_blank", "noopener")).catch(e => toast(e.message))],
           [INBOX.loading ? "Checking…" : "Check now", () => inboxRefresh(), "primary"]]);

  if(INBOX.err){
    v.appendChild(elm("div","card ib-err",`<b>Couldn't reach the inbox.</b> <span>${esc(INBOX.err)}</span>`));
  }
  const sideOf = i => i.side || (pmProp(i.property_id) ? "pm" : S.properties.some(p => p.id === i.property_id) ? "projects" : "");
  const F = S.ui.ibSide || (S.ui.mode === "pm" ? "pm" : "projects");
  const cnt = k => INBOX.items.filter(i => (i.status === "pending" || i.status === "error") && (k === "all" || sideOf(i) === k || !sideOf(i))).length;
  const items = INBOX.items.filter(i => F === "all" || sideOf(i) === F || !sideOf(i));
  const pend = items.filter(i => i.status === "pending"), errs = items.filter(i => i.status === "error");
  if(INBOX.items.length){
    const seg = elm("div","sc-bar");
    seg.innerHTML = `<div class="sc-seg">${[["pm","Property management"],["projects","Projects"],["all","All"]].map(([k, l]) => `<button data-sd="${k}" class="${F === k ? "on" : ""}">${l} <span>${cnt(k)}</span></button>`).join("")}</div>
      <span class="muted" style="font-size:12.5px">Mail to <b>PMBilling@</b> lands under Property management, <b>ProjectBilling@</b> under Projects.</span>`;
    seg.querySelectorAll("[data-sd]").forEach(b => b.onclick = () => { S.ui.ibSide = b.dataset.sd; persistUi(); render(); });
    v.appendChild(seg);
  }
  if(!items.length){
    v.appendChild(elm("div","card",`<div class="empty"><b>${INBOX.loading ? "Checking the inbox…" : INBOX.last ? "Inbox zero" : INBOX.err ? "Not reachable right now" : "Loading…"}</b>
      <p style="max-width:52ch;margin:0 auto">Forward a receipt to your receipts address, or drop a PDF or photo into <b>PHD Receipts / _Drop here</b> in Google Drive. New receipts show up here within about five minutes.</p>
      ${INBOX.last ? `<p class="muted" style="font-size:12px;margin-top:10px">Last checked ${new Date(INBOX.last).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}</p>` : ""}</div>`));
    if(!INBOX.tried && !INBOX.loading) setTimeout(() => inboxRefresh(true), 0);
    return;
  }
  const head = elm("div","ib-head");
  head.innerHTML = `<span><b>${pend.length}</b> waiting for review${errs.length ? ` · <span style="color:var(--red)">${errs.length} couldn't be read</span>` : ""}</span>
    <span class="muted">Last checked ${new Date(INBOX.last).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}</span>`;
  v.appendChild(head);
  [...pend, ...errs].forEach(it => v.appendChild(inboxCard(it)));
}

function inboxSetup(v){
  const c = elm("div","card");
  c.innerHTML = `<div class="card-h"><h3>Connect the receipt inbox</h3></div>
    <div class="card-b" style="max-width:640px">
      <p class="muted" style="margin-top:0;font-size:13.3px">Paste the two values from your Google Apps Script: the <b>web app URL</b> (Deploy → Manage deployments) and the <b>console key</b> printed when you ran <code>setup()</code>. They're saved in this browser only — not in backups or the autosave file.</p>
      <label class="fld"><span>Web app URL</span><input type="url" id="ib_url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
      <label class="fld"><span>Console key</span><input type="password" id="ib_tok" placeholder="64 characters" autocomplete="off"></label>
      <button class="btn primary" id="ib_go">Connect</button> <span id="ib_msg" class="muted" style="font-size:12.5px;margin-left:8px"></span>
    </div>`;
  v.appendChild(c);
  c.querySelector("#ib_go").onclick = async () => {
    const url = c.querySelector("#ib_url").value.trim(), token = c.querySelector("#ib_tok").value.trim();
    const msg = c.querySelector("#ib_msg");
    if(!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)){ msg.textContent = "That should be a script.google.com …/exec URL."; return; }
    if(token.length < 32){ msg.textContent = "The key looks too short."; return; }
    msg.textContent = "Checking…";
    setInboxConn({url, token});
    try{
      await inboxGet({action:"ping"});
      await inboxSyncConfig(true);
      toast("Inbox connected — your property list was sent so receipts can be matched");
      INBOX.last = 0; INBOX.tried = false; render(); inboxRefresh();
    }catch(e){ setInboxConn(null); msg.textContent = String(e.message || e); }
  };
}

function inboxCard(it){
  const card = elm("div","card ib-card");
  const d = INBOX.draft[it.id] = INBOX.draft[it.id] || {
    propId: it.property_id && (S.properties.some(p => p.id === it.property_id) || pmProp(it.property_id)) ? it.property_id : "",
    unit: it.unit_id || "", date: it.date || "", vendor: it.vendor || "", desc: it.description || "",
    amount: it.total ? String(it.total) : "", credit: !!it.is_credit,
    pmPaid: it.pay_status === "to_pay" ? "topay" : "paid", toPay: it.pay_status === "to_pay", due: it.due_date || ""
  };
  const prop = S.properties.find(p => p.id === d.propId), pmp = prop ? null : pmProp(d.propId);
  if(prop && d.unit !== "split" && !prop.units.some(u => u.id === d.unit)) d.unit = prop.units.length === 1 ? prop.units[0].id : "";
  const conf = {high:"green", medium:"gold", low:"grey"}[it.confidence] || "grey";
  const preview = it.file_url ? it.file_url.replace(/\/view(\?.*)?$/, "/preview") : "";
  const dup = prop ? inboxDupes(prop, d, it) : pmp ? inboxPmDupes(pmp, d, it) : [];
  const isErr = it.status === "error";

  card.innerHTML = `
    <div class="ib-top">
      <div class="ib-src">${icon(it.source === "drive" ? "download" : "mail")}
        <div><b>${esc(it.vendor || it.subject || it.file_name || "Receipt")}</b>
        <span>${esc([it.source === "drive" ? "Dropped in Drive" : it.source === "Upload" ? "Uploaded" + (it.from ? " by " + it.from : "") : (it.from || "Email"), it.side === "pm" ? "to PMBilling@" : it.side === "projects" ? "to ProjectBilling@" : "", it.received_at ? fdateS(String(it.received_at).slice(0,10)) : "", it.order_no ? "Invoice " + it.order_no : ""].filter(Boolean).join(" · "))}</span></div></div>
      ${isErr ? `<span class="tag red">Couldn't read</span>` : `<span class="tag ${conf}" title="${esc(it.reason || "")}">${it.confidence === "high" ? "Confident match" : it.confidence === "medium" ? "Likely match" : "Check the details"}</span>`}
      ${it.file_url ? `<a class="btn sm" href="${esc(it.file_url)}" target="_blank" rel="noopener">${icon("file")} Open receipt</a>` : ""}
      ${preview ? `<button class="btn sm ghost" data-x="prev">${INBOX.open[it.id] ? "Hide preview" : "Preview"}</button>` : ""}
    </div>
    ${isErr ? `<div class="ib-errline">${esc(it.error || "Unknown error")}</div>` : ""}
    ${it.reason && !isErr ? `<div class="ib-why">${icon("bolt")} ${esc(it.reason)}</div>` : ""}
    ${it.pay_status && !isErr ? `<div class="ib-why ib-pay ${it.pay_status === "to_pay" ? "due" : ""}"><span class="tag ${it.pay_status === "to_pay" ? "gold" : "green"}">${it.pay_status === "to_pay" ? "Not paid yet" : "Already paid"}</span>${it.pay_note ? " " + esc(it.pay_note) : ""}${it.due_date && it.pay_status === "to_pay" ? ` · due ${esc(fdateS(it.due_date))}` : ""}</div>` : ""}
    <div class="ib-body">
      <div class="ib-form">
        <div class="f2">
          <label class="fld"><span>Property</span><select data-f="propId"><option value="">Choose…</option>
            ${it.side === "pm" ? "" : `<optgroup label="Project billing">${live().map(p => `<option value="${p.id}" ${p.id === d.propId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>`}
            ${pmLiveProps().length ? `<optgroup label="Property management — adds a bill">${pmLiveProps().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true})).map(p => `<option value="${p.id}" ${p.id === d.propId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>` : ""}
            ${it.side === "pm" ? `<optgroup label="Project billing">${live().map(p => `<option value="${p.id}" ${p.id === d.propId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>` : ""}</select></label>
          ${pmp ? `<label class="fld"><span>Month</span><select data-f="pmMonth">${[...new Set([inboxPmMonth(), ...pmMonths().slice(-3)])].sort().reverse().map(mm => `<option value="${mm}" ${(d.pmMonth || inboxPmMonth()) === mm ? "selected" : ""}>${monthLabel(mm)}${(pmState().meta[mm] || {}).closed ? " (closed)" : ""}</option>`).join("")}</select></label>` : `<label class="fld"><span>Unit</span><select data-f="unit" ${prop ? "" : "disabled"}>`}
            ${pmp ? "" : (prop ? (prop.units.length > 1 ? `<option value="">Choose…</option>` : "") + prop.units.map(u => `<option value="${u.id}" ${u.id === d.unit ? "selected" : ""}>${esc(u.name)}</option>`).join("")
                   + (prop.units.length > 1 ? `<option value="split" ${d.unit === "split" ? "selected" : ""}>Split — default split</option>` : "") : `<option>—</option>`) + "</select></label>"}
        </div>
        <div class="f2">
          <label class="fld"><span>Vendor</span><input type="text" data-f="vendor" value="${esc(d.vendor)}"></label>
          <label class="fld"><span>Item</span><input type="text" data-f="desc" value="${esc(d.desc)}" placeholder="Kitchen faucet"></label>
        </div>
        <div class="f2">
          <label class="fld"><span>Date</span><input type="date" data-f="date" value="${esc(d.date)}"></label>
          <label class="fld"><span>${d.credit ? "Credit amount" : "Amount"}</span><input type="number" step="0.01" min="0" data-f="amount" value="${esc(d.amount)}"></label>
        </div>
        ${pmp && !d.credit ? `<div class="f2"><label class="fld"><span>This is</span><select data-f="pmPaid"><option value="paid" ${d.pmPaid !== "topay" ? "selected" : ""}>A receipt — already paid</option><option value="topay" ${d.pmPaid === "topay" ? "selected" : ""}>A vendor invoice — needs paying</option></select></label>
          <label class="fld"><span>Owner</span><select data-f="pmRec">${Object.entries(BILL_REC).map(([k, l]) => `<option value="${k}" ${(d.pmRec || (pmp.ownerId ? "deduct" : "phd")) === k ? "selected" : ""} ${k !== "phd" && !pmp.ownerId ? "disabled" : ""}>${l}</option>`).join("")}</select></label></div>` : ""}
        <label class="switchbox"><input type="checkbox" data-f="credit" ${d.credit ? "checked" : ""}> Refund / return — reduces the next open invoice</label>
        ${prop && !d.credit ? `<label class="switchbox"><input type="checkbox" data-f="toPay" ${d.toPay ? "checked" : ""}> The vendor still needs to be paid — keep it on the unpaid list${d.toPay ? ` <input type="date" data-f="due" value="${esc(d.due)}" title="Due" style="margin-left:8px">` : ""}</label>` : ""}
      </div>
      <div class="ib-side">
        ${(it.line_items||[]).length ? `<div class="label" style="margin-bottom:6px">Items on the receipt</div>
          <div class="ib-lines">${it.line_items.slice(0, 12).map(li => `<div><span>${esc(li.desc)}</span><span class="num">${li.amount ? usd(cents(li.amount)) : ""}</span></div>`).join("")}
          ${it.line_items.length > 12 ? `<div class="muted">and ${it.line_items.length - 12} more</div>` : ""}</div>` : `<div class="muted" style="font-size:12.5px">${esc(it.notes || it.subject || "")}</div>`}
        ${dup.length ? `<div class="ib-dup">${icon("receipt")} <span><b>Possible duplicate.</b> ${dup.map(t => `${esc(t.vendor || "")} ${usd(cents(t.amount))} on ${fdateS(t.date)}`).join("; ")} is already in ${esc(prop.name)}.</span></div>` : ""}
      </div>
    </div>
    ${INBOX.open[it.id] && preview ? `<div class="ib-prev"><iframe src="${esc(preview)}" title="Receipt preview" loading="lazy"></iframe></div>` : ""}
    <div class="ib-foot">
      <button class="btn sm${isErr ? "" : " ghost"}" data-x="retry">${isErr ? "Try reading again" : "Read again"}</button>
      <button class="btn sm ghost danger" data-x="reject">Not billable — dismiss</button>
      <span style="flex:1"></span>
      <button class="btn sm" data-x="edit" ${inboxReady(d) ? "" : "disabled"}>Approve & open</button>
      <button class="btn sm primary" data-x="ok" ${inboxReady(d) ? "" : "disabled"}>Approve${prop ? " to " + esc(prop.name) : ""}</button>
    </div>`;

  card.querySelectorAll("[data-f]").forEach(inp => {
    const k = inp.dataset.f;
    const upd = () => { d[k] = inp.type === "checkbox" ? inp.checked : inp.value;
      if(k === "propId" || k === "unit" || k === "credit" || k === "amount" || k === "toPay") card.replaceWith(inboxCard(it));
      else { const ok = inboxReady(d); card.querySelectorAll('[data-x="ok"],[data-x="edit"]').forEach(b => b.disabled = !ok); } };
    inp.addEventListener(inp.tagName === "SELECT" || inp.type === "checkbox" ? "change" : (k === "amount" ? "change" : "input"), upd);
  });
  const act = (x, fn) => { const b = card.querySelector(`[data-x="${x}"]`); if(b) b.onclick = fn; };
  act("prev", () => { INBOX.open[it.id] = !INBOX.open[it.id]; card.replaceWith(inboxCard(it)); });
  act("ok", () => inboxApprove(it, false));
  act("edit", () => inboxApprove(it, true));
  act("reject", () => inboxReject(it));
  act("retry", async () => { try{ toast("Reading it again…"); await inboxPost({action:"retry", id:it.id}); delete INBOX.draft[it.id]; inboxRefresh(); }catch(e){ toast(e.message); } });
  return card;
}
function inboxPmMonth(){ const open = pmMonths().filter(m => !(pmState().meta[m] || {}).closed); return open.length ? open[open.length - 1] : thisMonth(); }
function inboxPmDupes(p, d, it){
  const c = cents(Number(d.amount) || 0); if(!c) return [];
  const out = [];
  Object.values(pmState().rows).filter(r => r.propertyId === p.id).forEach(r => (r.repairItems || []).forEach(x => {
    if((it.file_url && x.link === it.file_url) || (cents(x.amount) === c && d.date && x.date && Math.abs(new Date(x.date) - new Date(d.date)) <= 14 * 864e5)) out.push({vendor:x.vendor, amount:x.amount, date:x.date || r.month + "-01"});
  }));
  return out.slice(0, 3);
}
function inboxReady(d){
  if(pmProp(d.propId)) return !!(Number(d.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date || ""));
  const p = S.properties.find(x => x.id === d.propId);
  return !!(p && Number(d.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") && (d.unit === "split" || p.units.some(u => u.id === d.unit)));
}
function inboxDupes(p, d, it){
  const c = cents(Number(d.amount) || 0); if(!c) return [];
  const t0 = new Date((d.date || "1970-01-01") + "T00:00:00").getTime();
  return p.transactions.filter(t =>
    (it.file_url && t.link === it.file_url) ||
    (Math.abs(cents(t.amount)) === c && Math.abs(new Date((t.date || "1970-01-01") + "T00:00:00").getTime() - t0) <= 14 * 864e5)
  ).slice(0, 3);
}

async function inboxApprove(it, openAfter){
  const d = INBOX.draft[it.id], p = S.properties.find(x => x.id === d.propId);
  if(!inboxReady(d)) return;
  if(!p && pmProp(d.propId)) return inboxApprovePm(it, openAfter);
  let scope;
  if(d.unit === "split"){
    const sp = {}; let sum = 0;
    p.units.forEach(u => { const v = Number((p.defaultSplit||{})[u.id]) || 0; sp[u.id] = v; sum += v; });
    if(Math.abs(sum - 100) > 0.01){ const even = +(100 / p.units.length).toFixed(2); p.units.forEach((u, i) => sp[u.id] = i === p.units.length - 1 ? +(100 - even * (p.units.length - 1)).toFixed(2) : even); }
    scope = {type:"split", unit:null, splits:sp};
  } else scope = {type:"single", unit:d.unit, splits:{}};
  const amt = Math.round(Number(d.amount) * 100) / 100;
  const ext = ((it.file_name || "").match(/\.[a-z0-9]{2,4}$/i) || [".pdf"])[0];
  const fileName = `${d.date.replace(/-/g, "")} - ${p.name} - ${d.desc || "Receipt"} - ${d.vendor || ""}`.replace(/\s+-\s*$/, "") + ext;
  snapshot();
  const rec = {id:uid(), receipt:fileName, link:it.file_url || "", pin:null, party:"Owner",
    notes:[it.order_no ? "Order " + it.order_no : "", "From receipt inbox"].filter(Boolean).join(" · "),
    tags:[], reconciled:false, reconciledAt:"", date:d.date, vendor:d.vendor.trim(), desc:(d.desc || "").trim() + (d.credit && !/return|refund|credit/i.test(d.desc) ? " — return" : ""),
    amount: d.credit ? -amt : amt, scope, status:"billable", applyFee:true, allowPartial:true};
  if(d.toPay && !d.credit) rec.vendorDue = {since:todayISO(), due:d.due || "", note:it.pay_note || "", by:billWho()};
  if(d.credit && p.tags.some(t => t.id === RETURN_TAG_ID)) rec.tags = [RETURN_TAG_ID];
  applyHoldRule(rec, p);
  p.transactions.push(rec);
  const msg = {decision:"approved", txnId:rec.id, propertyName:p.name, fileName};
  inboxDone()[it.id] = {txn:rec.id, msg};
  INBOX.items = INBOX.items.filter(x => x.id !== it.id); delete INBOX.draft[it.id];
  commit();
  toast(`Added ${d.credit ? "credit " : ""}${usd(cents(amt))} to ${p.name}${rec.status === "review" ? " · on hold (labor)" : ""}`);
  if(openAfter){ go("txns", p.id); openSheet(rec.id); }
  try{ await inboxPost(Object.assign({action:"decide", id:it.id}, msg)); delete inboxDone()[it.id]; Store.save(S); }catch(e){ /* retried on next check */ }
}
async function inboxReject(it){
  try{
    await inboxPost({action:"decide", id:it.id, decision:"rejected"});
    INBOX.items = INBOX.items.filter(x => x.id !== it.id); delete INBOX.draft[it.id];
    render(); toast("Dismissed — it stays in Drive and the sheet, marked rejected");
  }catch(e){ toast(e.message); }
}

/* light background check so the sidebar badge stays current */
setInterval(() => { if(inboxConn() && document.visibilityState === "visible" && S.ui.view !== "inbox") inboxRefresh(true); }, 5 * 60 * 1000);
setTimeout(() => { if(inboxConn()) inboxRefresh(true); }, 1500);

/* a receipt or vendor invoice for a managed rental becomes a bill (the owner side follows the bill) */
async function inboxApprovePm(it, openAfter){
  const d = INBOX.draft[it.id], p = pmProp(d.propId), m = d.pmMonth || inboxPmMonth();
  if(d.credit && (pmState().meta[m] || {}).closed && !confirm(`${monthLabel(m)} is closed. Add this refund to it anyway?`)) return;
  const amt = Math.round(Number(d.amount) * 100) / 100;
  const ext = ((it.file_name || "").match(/\.[a-z0-9]{2,4}$/i) || [".pdf"])[0];
  const fileName = `${d.date.replace(/-/g, "")} - ${p.name} - ${d.desc || "Repair"} - ${d.vendor || ""}`.replace(/\s+-\s*$/, "") + ext;
  snapshot();
  const row = pmEnsureRow(m, p.id);
  row.repairItems = row.repairItems || [];
  let bill = null;
  if(d.credit){ row.adjustments = (row.adjustments || []).concat([{amount:amt, note:`Refund — ${d.vendor || ""} ${d.desc || ""}`.trim()}]); if(row.locked){ row.repairs = null; row.adminFee = null; } pmTouch(row); }
  else {
    // receipts and vendor invoices become bills: paid already, or waiting to be paid; the owner side follows the bill
    const rec = d.pmRec || (p.ownerId ? "deduct" : "phd"), paid = d.pmPaid !== "topay";
    bill = billNew({propertyId:p.id, vendor:d.vendor, amount:amt, date:d.date, memo:d.desc, recover:p.ownerId ? rec : "phd", deductMonth:m,
      receipt:it.file_url ? {url:it.file_url, name:fileName} : null, source:"Receipt inbox", inbox:it.id, payNote:paid ? "" : (it.pay_note || ""), due:paid ? "" : (it.due_date || ""),
      status:paid ? "paid" : "open", pay:paid ? {method:"Card / receipt", date:d.date, ref:"", by:billWho(), at:new Date().toISOString()} : null});
    billSave(bill, true);
  }
  const msg = {decision:"approved", txnId:"pm:" + m + "|" + p.id, propertyName:p.name, fileName};
  inboxDone()[it.id] = {txn:msg.txnId, msg};
  INBOX.items = INBOX.items.filter(x => x.id !== it.id); delete INBOX.draft[it.id];
  commit();
  toast(d.credit ? `Refund ${usd(cents(amt))} added to ${p.name} · ${monthLabel(m)}` : `Bill ${usd(cents(amt))} added — ${p.name}${bill && bill.status === "open" ? " · waiting to be paid" : ""}`);
  if(openAfter){ S.ui.mode = "pm"; if(bill){ go("pmBills"); billSheet(bill.id); } else { S.ui.pmMonth = m; go("pmMonth"); pmRowSheet(m, p.id, "repairs"); } }
  try{ await inboxPost(Object.assign({action:"decide", id:it.id}, msg)); delete inboxDone()[it.id]; Store.save(S); }catch(e){}
}

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
    if(has(row.pmFee) && !row.locked && Math.abs(cents(row.pmFee) - ruleFeeC) > 1) flags.push({level:"info", text:`PM fee set by hand (${usd(cents(row.pmFee))}; rule gives ${usd(ruleFeeC)})`});
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
      tenants:ls.flatMap(l => (l.tenants || []).filter(t => !t.movedOut))};
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
  function mdBillLines(md, mdPropId, month){
    const out = [];
    (md.bills || []).forEach(b => { if(b.company || !b.date || b.date.slice(0, 7) !== month) return;
      (b.lines || []).forEach(li => { if(li.propertyId === mdPropId && mdIsRepairLine(li, b)) out.push({id:li.id, billId:b.id, date:b.date, vendor:b.vendor, memo:mdLineMemo(li, b), amount:li.amount, account:li.account, owed:b.owed}); }); });
    return out;
  }
  // which month an owner distribution pays: from the 20th of a month to the 19th of the next
  function mdPayoutMonth(date){ const d = +date.slice(8, 10); return d >= 20 ? date.slice(0, 7) : monthAdd(date.slice(0, 7), -1); }
  function mdDistributions(md, mdPropId, month){
    const out = [];
    (md.distributions || []).forEach(x => (x.lines || []).forEach(li => { if(li.propertyId === mdPropId && x.date && (!month || mdPayoutMonth(x.date) === month)) out.push({id:x.id, date:x.date, amount:li.amount, ownerId:x.ownerId}); }));
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
    const monthRows = m => Object.values(rows).filter(r => r.month === m && !r.deleted && !r.detailOnly);
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

  return {normAddr, mdIndex, mdCombine, mdIsRepairLine, mdLineMemo, mdBillLines, mdPayoutMonth, mdDistributions, mdRenewal, mdFee, mdPaidThisMonth, cents, has, nz, usd, usd0, calc, alerts, rentStatus, itemFee, feeRuleText, monthLabel, monthAdd, endOfMonth, dayNum, isoOf, shortDate, DEFAULTS, EXTRA};
})();

/* =====================================================================
   PROPERTY MANAGEMENT — monthly rent, repairs, fees and owner payouts.
   Replaces the "TOTAL MONTHLY PM INCOME REPORTING" workbook.

   Owner payout = rent received − repairs − admin fee − PM fee − leasing fee
                  + other owner income ± adjustments
   PHD income   = PM fee + admin fee + leasing fee + applications + late fees
                  + reimbursements + filters
   Months imported from the workbook keep the numbers exactly as recorded;
   the formula still runs so any difference is flagged, never hidden.
   ===================================================================== */
const PM_MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const PM_STATUS = {active:"Leased", marketing:"Marketing", vacant:"Vacant", inactive:"No longer managed"};
const PM_EXTRA = [["applications","Applications"],["lateFee","Late fees"],["reimbursement","Reimbursements"],["filters","Filters"]];

function pmState(){
  if(!S.pm || typeof S.pm !== "object") S.pm = {};
  const P2 = S.pm;
  if(!Array.isArray(P2.properties)) P2.properties = [];
  if(!P2.rows || typeof P2.rows !== "object") P2.rows = {};
  if(!P2.meta || typeof P2.meta !== "object") P2.meta = {};
  if(!P2.deposits || typeof P2.deposits !== "object") P2.deposits = {};
  if(!P2.bills || typeof P2.bills !== "object") P2.bills = {};          // vendor bills (Bills page)
  if(!P2.invoices || typeof P2.invoices !== "object") P2.invoices = {};  // owner invoices (Owner invoices page)
  return P2;
}
const pmProp = id => pmState().properties.find(p => p.id === id) || null;
const pmKey = (m, pid) => m + "|" + pid;
const pmRow = (m, pid) => pmState().rows[pmKey(m, pid)] || null;
const monthLabel = m => { const [y, mm] = String(m).split("-").map(Number); return `${PM_MONTHS[mm-1]} ${y}`; };
const monthShort = m => { const [y, mm] = String(m).split("-").map(Number); return `${PM_MONTHS[mm-1].slice(0,3)} ${String(y).slice(2)}`; };
const monthAdd = (m, n) => { const [y, mm] = m.split("-").map(Number); const d = new Date(y, mm - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const pmMonths = () => [...new Set(Object.values(pmState().rows).map(r => r.month))].sort();
const pmLastPaidMonth = () => { const cl = pmMonths().filter(m => (pmState().meta[m] || {}).closed); if(cl.length) return cl[cl.length - 1]; const ms = pmMonths().filter(m => Object.values(pmState().rows).some(r => r.month === m && has(r.rentReceived) && Number(r.rentReceived) > 0)); return ms[ms.length - 1]; };
const pmLiveProps = () => pmState().properties.filter(p => p.status !== "inactive" && !p.deleted);
const nz = v => v == null || v === "" ? 0 : cents(v);
const has = v => v != null && v !== "";

const feeRuleText = r => PMCore.feeRuleText(r);
const itemFeeC = (it, prop) => PMCore.itemFee(it, prop);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
/* one row's numbers, all in cents — the math lives in PMCore so the email digest uses the same rules */
function pmCalc(row, prop){ return PMCore.calc(row, prop, todayISO()); }
function pmSettings(){ return Object.assign({}, PMCore.DEFAULTS, S.pmSettings || {}); }
function pmAlertState(){ if(!S.pmAlerts || typeof S.pmAlerts !== "object") S.pmAlerts = {}; return S.pmAlerts; }
function pmAlerts(){
  if(!pmState().properties.length) return [];
  return PMCore.alerts({pm:pmState(), owners:S.owners || [], settings:pmSettings(), today:todayISO(), state:pmAlertState(), md:mdReady() ? S.md : null, mdLinks:mdLinks().links,
                        inbox:(typeof INBOX !== "undefined" ? INBOX.items : [])});
}
function pmRentStatus(m, p){ const r = pmRow(m, p.id); if(r) r._lateAfter = pmSettings().lateAfterDay; return PMCore.rentStatus(r, p, todayISO()); }
// this month's status, with MagicDoor's live balance deciding when rent isn't recorded here yet (same rule as the alerts)
function pmMdLease(p){ const x = typeof mdReady === "function" && mdReady() ? mdFor(p.id) : null; return x && x.lease || null; }
function pmLiveStatus(m, p){
  const st = pmRentStatus(m, p);
  if(m !== thisMonth() || !["due","late","none","upcoming"].includes(st)) return st;
  const L = pmMdLease(p); if(!L) return st;
  const late = pmSettings().lateAfterDay, day = +todayISO().slice(8, 10);
  if(L.balance > 0 && L.pastDueDays > 0 && (day > late || L.pastDueDays > late)) return "late";
  if(PMCore.mdPaidThisMonth(L, m)) return "paid";
  return st === "late" ? "due" : st;
}

function pmMonthRows(m){
  const P2 = pmState();
  return Object.values(P2.rows).filter(r => r.month === m && !r.deleted)
    .map(r => ({row:r, prop:pmProp(r.propertyId)})).filter(x => x.prop)
    .sort((a, b) => a.prop.name.localeCompare(b.prop.name, undefined, {numeric:true}));
}
function pmMonthRoll(m){
  const t = {dueC:0, recv:0, repairsC:0, adminC:0, pmFeeC:0, leasingC:0, otherC:0, payoutC:0, extrasC:0, phdC:0, flags:0, rows:0, short:0};
  const extras = {}; PM_EXTRA.forEach(([k]) => extras[k] = 0);
  pmMonthRows(m).forEach(({row, prop}) => {
    if(row.detailOnly) return;
    const c = pmCalc(row, prop); t.rows++;
    ["dueC","recv","repairsC","adminC","pmFeeC","leasingC","otherC","payoutC","extrasC","phdC"].forEach(k => t[k] += c[k]);
    PM_EXTRA.forEach(([k]) => extras[k] += nz(row[k]));
    if(c.flags.some(f => f.level === "warn")) t.flags++;
    if(c.dueC > 0 && c.recv < c.dueC) t.short += c.dueC - c.recv;
  });
  const meta = pmState().meta[m] || {};
  t.deductC = (meta.deductions || []).reduce((a, d) => a + cents(d.amount), 0);   // stored negative
  t.netC = t.phdC + t.deductC;
  t.extras = extras;
  return t;
}
function pmCurrentMonth(){
  const ms = pmMonths();
  if(S.ui.pmMonth && /^\d{4}-\d{2}$/.test(S.ui.pmMonth)) return S.ui.pmMonth;
  const open = ms.filter(m => !(pmState().meta[m] || {}).closed);
  return open.length ? open[open.length - 1] : (ms[ms.length - 1] || thisMonth());
}

/* ---------------- address matching (Magicdoor, receipts) ---------------- */
const PM_DIRS = new Set(["n","s","e","w","north","south","east","west"]);
function pmAddrKey(a){
  let low = String(a || "").toLowerCase().replace(/[\n\t]/g, " ").replace(/\s+/g, " ").trim();
  const m = low.match(/^(\d+)(?:-([a-z]))?\s+(.*)$/); if(!m) return "";
  const parts = m[3].split(",").map(s => s.trim());
  let street = parts[0], unit = m[2] || "";
  const um = street.match(/#\s*([a-z0-9]+)/); if(um){ unit = unit || um[1]; street = street.slice(0, um.index).trim(); }
  const um2 = street.match(/\b(?:unit|apt|suite|ste)\s*([a-z0-9]+)/); if(um2){ unit = unit || um2[1]; street = street.slice(0, um2.index).trim(); }
  if(parts[1] && parts[1].replace("#", "").trim().length <= 8 && !/\b(sc|charleston|summerville)\b/.test(parts[1]) && !/\s/.test(parts[1].trim())) unit = unit || parts[1].replace("#", "").trim();
  const words = street.replace(/[^a-z0-9 ]/g, " ").split(" ").filter(w => w && !PM_DIRS.has(w));
  return `${m[1]}-${words[0] || ""}${unit ? "-" + unit : ""}`;
}
function pmMatchProperty(text){
  const t = String(text || "").trim(); if(!t) return null;
  const props = pmState().properties.filter(p => !p.deleted);
  const k = pmAddrKey(t);
  if(k){
    let hit = props.find(p => [p.address, p.name, ...(p.aliases || [])].some(a => pmAddrKey(a) === k));
    if(hit) return hit;
    const base = k.split("-").slice(0, 2).join("-");
    const cands = props.filter(p => [p.address, p.name, ...(p.aliases || [])].some(a => pmAddrKey(a).startsWith(base)));
    if(cands.length === 1) return cands[0];
  }
  const low = t.toLowerCase();
  const byName = props.filter(p => low.includes(p.name.toLowerCase().replace(/\s+#.*$/, "")));
  return byName.length === 1 ? byName[0] : null;
}

/* ====================================================================
   MONTH CLOSE
   ==================================================================== */
function pgPmMonth(){
  const P2 = pmState();
  if(!P2.properties.length) return pmEmpty();
  const m = pmCurrentMonth(); S.ui.pmMonth = m;
  const meta = P2.meta[m] || {};
  const rows = pmMonthRows(m);
  const R = pmMonthRoll(m);
  const ms = pmMonths(), closed = !!meta.closed;
  $("#pgCrumb").textContent = "Property management";
  $("#pgTitle").textContent = monthLabel(m);
  $("#pgSub").textContent = closed ? (String(meta.closedBy || "").startsWith("Imported") ? "Imported from the workbook — read only" : `Closed${meta.closedAt ? " " + fdateS(meta.closedAt.slice(0,10)) : ""}${meta.closedBy ? " by " + meta.closedBy : ""}`) : rows.length ? "Open — enter rent as it arrives; fees and payouts calculate themselves" : "Not started";

  const acts = [["‹", () => { S.ui.pmMonth = monthAdd(m, -1); persistUi(); render(); }, "ghost"],
                ["›", () => { S.ui.pmMonth = monthAdd(m, 1); persistUi(); render(); }, "ghost"]];
  if(rows.length){
    acts.push(["Export CSV", () => pmExportCsv(m)]);
    acts.push(["Owner statements", () => pmStatementSheet(m)]);
    { const nd = stmtCandidates(m).filter(x => !x.why && !x.done).length; acts.push([nd ? `Email statements (${nd})` : "Email statements", () => pmStatementMailSheet(m)]); }
    if(!closed && m === todayISO().slice(0, 7) && mdReady()){ const pl = mdPlan(), nF = pl.rows.length + pl.filters.length; if(nF) acts.push([`Fill from MagicDoor (${nF})`, () => { mdApply({rowsOnly:true}); render(); }, "primary"]); }
    if(!closed && !mdReady()) acts.push(["Import Magicdoor", () => pmImportSheet(m)]);
    const unpaid = rows.filter(({row, prop}) => !row.detailOnly && !row.locked && !row.paidOut && pmCalc(row, prop).recv > 0 && pmCalc(row, prop).payoutC > 0).map(x => x.prop.id);
    if(!closed && unpaid.length) acts.push([`Mark payouts sent (${unpaid.length})`, () => pmMarkPaidSheet(m, unpaid)]);
    acts.push(closed ? ["Reopen month", () => pmCloseMonth(m, false)] : ["Close month", () => pmCloseMonth(m, true), "primary"]);
  } else acts.push([`Start ${monthLabel(m)}`, () => pmStartMonth(m), "primary"]);
  actions(acts);
  const v = $("#view");

  if(!rows.length){
    const prev = [...ms].reverse().find(x => x < m);
    v.appendChild(elm("div","card",`<div class="empty"><b>${monthLabel(m)} hasn't started</b>
      <p style="max-width:52ch;margin:0 auto 16px">Starting a month adds a line for every leased and marketing property with its rent due${prev ? `, carried from ${monthLabel(prev)}` : ""}. You then enter what came in — or import it from Magicdoor.</p>
      <button class="btn primary" id="pmStart">Start ${monthLabel(m)}</button></div>`));
    setTimeout(() => { const b = $("#pmStart"); if(b) b.onclick = () => pmStartMonth(m); }, 0);
    return;
  }

  /* ---- tiles ---- */
  const pct = R.dueC ? Math.round(R.recv / R.dueC * 100) : 0;
  const tiles = elm("div","card pf-hero");
  tiles.innerHTML = `
    <div class="pf-cell"><div class="label">Rent collected</div><div class="pf-v">${usd(R.recv)}</div>
      <div class="pf-note">${R.dueC ? `${pct}% of ${usd(R.dueC)} due` : ""}${R.short ? ` · <span style="color:var(--gold)">${usd(R.short)} short</span>` : ""}</div></div>
    <div class="pf-cell"><div class="label">Repairs + admin fee</div><div class="pf-v">${usd(R.repairsC + R.adminC)}</div><div class="pf-note">${usd(R.repairsC)} repairs · ${usd(R.adminC)} admin</div></div>
    <div class="pf-cell"><div class="label">Owner payouts</div><div class="pf-v g">${usd(R.payoutC)}</div><div class="pf-note">${R.rows} propert${R.rows === 1 ? "y" : "ies"}</div></div>
    <div class="pf-cell"><div class="label">PHD income</div><div class="pf-v a">${usd(R.netC)}</div><div class="pf-note">${usd(R.pmFeeC)} PM fees${R.deductC ? ` · ${usd(-R.deductC)} deductions` : ""}</div></div>
    <div class="pf-cell"><div class="label">Needs a look</div><div class="pf-v"${R.flags ? ' style="color:var(--gold)"' : ""}>${R.flags}</div><div class="pf-note">${R.flags ? "rows with a warning" : "Everything adds up"}</div></div>`;
  v.appendChild(tiles);

  /* ---- filters ---- */
  const f = S.ui.pmFilter || "all", q = (S.ui.pmQ || "").toLowerCase();
  const bar = elm("div","sc-bar"); bar.style.marginTop = "16px";
  const counts = {all:rows.filter(x => !x.row.detailOnly).length, attn:0, short:0, repairs:0, payout:0};
  rows.forEach(({row, prop}) => { if(row.detailOnly) return; const c = pmCalc(row, prop);
    if(c.flags.some(x => x.level === "warn")) counts.attn++; if(c.dueC > 0 && c.recv < c.dueC) counts.short++; if(c.repairsC) counts.repairs++;
    if(!row.locked && !row.paidOut && c.recv > 0 && c.payoutC > 0) counts.payout++; });
  bar.innerHTML = `<div class="sc-seg">${[["all","All"],["attn","Needs a look"],["short","Unpaid / short"],["payout","Payout to send"],["repairs","Has repairs"]]
      .map(([k, l]) => `<button data-pf="${k}" class="${f === k ? "on" : ""}">${l} <span>${counts[k]}</span></button>`).join("")}</div>
    <div class="sc-q"><input type="text" id="pmQ" placeholder="Find a property…" value="${esc(S.ui.pmQ || "")}"></div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { S.ui.pmFilter = b.dataset.pf; render(); });
  const qi = bar.querySelector("#pmQ");
  qi.oninput = () => { S.ui.pmQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#pmQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 160); };

  /* ---- ledger ---- */
  const card = elm("div","card");
  const wrap = elm("div","tbl-wrap"), t = elm("table","tbl pm-tbl");
  t.innerHTML = `<thead><tr><th>Property</th><th class="r">Rent due</th><th class="r">Received</th><th class="r">Repairs</th><th class="r">Admin fee</th>
    <th class="r">PM fee</th><th class="r">Leasing</th><th class="r">Other</th><th class="r">Owner payout</th><th>Paid out</th><th></th></tr></thead>`;
  const tb = elm("tbody");
  const vis = rows.filter(({row, prop}) => {
    if(row.detailOnly) return false;
    if(q && !`${prop.name} ${prop.address} ${ownerLabel(ownerById(prop.ownerId))}`.toLowerCase().includes(q)) return false;
    if(f === "all") return true;
    const c = pmCalc(row, prop);
    return f === "attn" ? c.flags.some(x => x.level === "warn") : f === "short" ? (c.dueC > 0 && c.recv < c.dueC) : f === "repairs" ? c.repairsC > 0
      : f === "payout" ? (!row.locked && !row.paidOut && c.recv > 0 && c.payoutC > 0) : true;
  });
  vis.forEach(({row, prop}) => {
    const c = pmCalc(row, prop), locked = row.locked || closed;
    const warn = c.flags.filter(x => x.level === "warn"), info = c.flags.filter(x => x.level === "info");
    const own = ownerLabel(ownerById(prop.ownerId));
    const tr = elm("tr"); tr.dataset.pm = prop.id;
    const status = row.status ? `<span class="mark grey">${esc(row.status)}</span>` : "";
    const cell = (vC, extra) => vC ? `<td class="r num"${extra || ""}>${usd(vC)}</td>` : `<td class="r num muted">—</td>`;
    tr.innerHTML = `
      <td><div class="item-t">${esc(prop.name)}${status}</div>
        <div class="item-s">${own ? esc(own) + " · " : ""}${feeRuleText(prop.feeRule)} fee${(row.payments || []).length ? ` · ${row.payments.length} payment${row.payments.length === 1 ? "" : "s"}` : ""}${!closed && m === todayISO().slice(0, 7) && mdReady() ? mdMonthTag(prop) : ""}</div></td>
      ${cell(c.dueC)}
      <td class="r">${locked ? `<span class="num">${c.recv ? usd(c.recv) : "—"}</span>` : `<input class="pm-in num" type="number" step="0.01" data-recv="${prop.id}" value="${has(row.rentReceived) ? row.rentReceived : ""}" placeholder="${c.dueC ? (c.dueC / 100).toFixed(2) : "0.00"}">`}</td>
      <td class="r num">${c.repairsC ? `<button class="linkish" data-rep="${prop.id}">${usd(c.repairsC)}</button>` : `<span class="muted">—</span>`}${(row.repairItems || []).length ? `<div class="sub-n">${row.repairItems.length} item${row.repairItems.length === 1 ? "" : "s"}</div>` : ""}</td>
      ${cell(c.adminC)}${cell(c.pmFeeC)}${cell(c.leasingC)}${cell(c.otherC + c.adjC)}
      <td class="r num"><b${c.payoutC < 0 ? ' style="color:var(--red)"' : ""}>${usd(c.payoutC)}</b>${warn.length ? `<div class="sub-n" style="color:var(--gold)" title="${esc(warn.map(x => x.text).join("\n"))}">● check</div>` : ""}</td>
      <td class="pm-po">${row.paidOut ? `<button class="po-done" data-unpay="${prop.id}" title="Sent ${esc(row.paidOut.date)}${row.paidOut.method ? " by " + esc(row.paidOut.method) : ""}${row.paidOut.by ? " · marked by " + esc(row.paidOut.by) : ""} — click to undo">✓ ${esc(fdateS(row.paidOut.date))}</button>`
          : locked ? `<span class="muted">—</span>` : c.recv > 0 && c.payoutC > 0 ? `<button class="btn sm" data-pay="${prop.id}">Mark sent</button>` : `<span class="muted">—</span>`}</td>
      <td class="act">${warn.length ? `<span class="pm-dot warn" title="${esc(warn.map(x => x.text).join("\n"))}"></span>` : info.length ? `<span class="pm-dot" title="${esc(info.map(x => x.text).join("\n"))}"></span>` : ""}<span class="sc-go">›</span></td>`;
    tr.onclick = e => { if(e.target.closest("input,button")) return; pmRowSheet(m, prop.id); };
    tb.appendChild(tr);
  });
  const foot = elm("tr","ow-tot");
  foot.innerHTML = `<td><b>${vis.length === counts.all ? "All properties" : vis.length + " shown"}</b></td><td class="r num"><b>${usd(R.dueC)}</b></td><td class="r num"><b>${usd(R.recv)}</b></td>
    <td class="r num"><b>${usd(R.repairsC)}</b></td><td class="r num"><b>${usd(R.adminC)}</b></td><td class="r num"><b>${usd(R.pmFeeC)}</b></td>
    <td class="r num"><b>${usd(R.leasingC)}</b></td><td class="r num"><b>${usd(R.otherC)}</b></td><td class="r num"><b>${usd(R.payoutC)}</b></td><td></td><td></td>`;
  tb.appendChild(foot);
  t.appendChild(tb); wrap.appendChild(t); card.appendChild(wrap);
  if(!vis.length) card.appendChild(elm("div","empty",`<b>Nothing here</b><p>No properties match this filter.</p>`));
  v.appendChild(card);

  /* fast entry: type the amount, Enter/Tab moves down the column */
  t.querySelectorAll("[data-recv]").forEach(inp => {
    const save = () => {
      const pid = inp.dataset.recv, r = pmEnsureRow(m, pid);
      const val = inp.value.trim() === "" ? null : Math.round(Number(inp.value) * 100) / 100;
      if((r.rentReceived ?? null) === val) return false;
      snapshot(); r.rentReceived = val; pmTouch(r); return true;
    };
    inp.addEventListener("keydown", e => {
      if(e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)){
        e.preventDefault();
        const all = [...t.querySelectorAll("[data-recv]")], i = all.indexOf(inp), next = all[i + 1];
        if(e.key === "Enter" && !inp.value && inp.placeholder && inp.placeholder !== "0.00") inp.value = inp.placeholder;   // Enter on blank = paid in full
        const nid = next && next.dataset.recv;
        if(save()){ commit(); if(nid){ const n = document.querySelector(`[data-recv="${nid}"]`); if(n){ n.focus(); n.select(); } } }
        else if(next){ next.focus(); next.select(); }
      }
    });
    inp.addEventListener("change", () => { if(save()){ const y = window.scrollY; commit(); window.scrollTo(0, y); } });
  });
  t.querySelectorAll("[data-rep]").forEach(b => b.onclick = e => { e.stopPropagation(); pmRowSheet(m, b.dataset.rep, "repairs"); });
  t.querySelectorAll("[data-pay]").forEach(b => b.onclick = e => { e.stopPropagation(); pmMarkPaidSheet(m, [b.dataset.pay]); });
  t.querySelectorAll("[data-unpay]").forEach(b => b.onclick = e => { e.stopPropagation();
    if(!confirm("Undo the payout record for this property?")) return; snapshot(); const r = pmRow(m, b.dataset.unpay); delete r.paidOut; pmTouch(r); commit(); });

  /* ---- PHD income + money movement ---- */
  const inc = elm("div","pm-grid2");
  const lines = [["PM fees", R.pmFeeC], ["Admin fees on repairs", R.adminC], ["Leasing fees", R.leasingC],
                 ...PM_EXTRA.map(([k, l]) => [l, cents((R.extras[k] || 0) / 100)])];
  inc.innerHTML = `
    <div class="card"><div class="card-h"><h3>PHD income · ${monthLabel(m)}</h3></div>
      <div class="card-b"><table class="pm-sum">${lines.map(([l, vC]) => `<tr><td>${l}</td><td class="r num">${usd(vC)}</td></tr>`).join("")}
        <tr class="rule"><td>Total earned</td><td class="r num">${usd(R.phdC)}</td></tr>
        ${(meta.deductions || []).map((d, i) => `<tr class="ded"><td>${esc(d.label)}${d.note ? `<span class="muted"> · ${esc(d.note)}</span>` : ""}${closed ? "" : ` <button class="linkish" data-dd="${i}">remove</button>`}</td><td class="r num">${usd(cents(d.amount))}</td></tr>`).join("")}
        <tr class="due"><td>Net PHD income</td><td class="r num">${usd(R.netC)}</td></tr></table>
        ${closed ? "" : `<div class="pm-add"><input type="text" id="ddL" placeholder="Deduction (e.g. Magicdoor invoices)"><input type="number" step="0.01" id="ddA" placeholder="Amount"><button class="btn sm" id="ddGo">Add</button></div>`}</div></div>
    <div class="card"><div class="card-h"><h3>Money movement</h3></div>
      <div class="card-b"><table class="pm-sum">
        <tr><td>Rent &amp; income received</td><td class="r num">${usd(R.recv + R.otherC + R.extrasC)}</td></tr>
        <tr><td>Repairs reimbursed to PHD</td><td class="r num">${usd(R.repairsC)}</td></tr>
        <tr><td>Paid to owners</td><td class="r num">${usd(R.payoutC)}</td></tr>
        <tr class="rule"><td>PHD income to withdraw</td><td class="r num">${usd(R.netC)}</td></tr></table>
        <div class="label" style="margin:16px 0 8px">Withdrawals</div>
        ${(meta.withdrawals || []).length ? `<table class="pm-sum">${meta.withdrawals.map((w, i) => `<tr><td>${esc(fdateS(w.date))}${w.note ? ` · ${esc(w.note)}` : ""}${closed ? "" : ` <button class="linkish" data-wd="${i}">remove</button>`}</td><td class="r num">${w.amount != null ? usd(cents(w.amount)) : "—"}</td></tr>`).join("")}</table>` : `<p class="muted" style="font-size:12.5px;margin:0 0 8px">None recorded yet.</p>`}
        ${closed ? "" : `<div class="pm-add"><input type="date" id="wdD"><input type="number" step="0.01" id="wdA" placeholder="Amount"><input type="text" id="wdN" placeholder="e.g. Nickel → Chase"><button class="btn sm" id="wdGo">Add</button></div>`}</div></div>`;
  v.appendChild(inc);
  const metaW = () => { const mm = pmState().meta[m] = pmState().meta[m] || {month:m}; mm.deductions = mm.deductions || []; mm.withdrawals = mm.withdrawals || []; return mm; };
  const ddGo = inc.querySelector("#ddGo");
  if(ddGo) ddGo.onclick = () => { const l = inc.querySelector("#ddL").value.trim(), a = Number(inc.querySelector("#ddA").value);
    if(!l || !a) return toast("Add a label and an amount"); snapshot(); metaW().deductions.push({label:l, amount:-Math.abs(a), note:""}); commit(); };
  inc.querySelectorAll("[data-dd]").forEach(b => b.onclick = () => { snapshot(); metaW().deductions.splice(+b.dataset.dd, 1); commit(); });
  const wdGo = inc.querySelector("#wdGo");
  if(wdGo) wdGo.onclick = () => { const d = inc.querySelector("#wdD").value, a = inc.querySelector("#wdA").value, n = inc.querySelector("#wdN").value.trim();
    if(!d) return toast("Pick the date it was withdrawn"); snapshot(); metaW().withdrawals.push({date:d, amount:a ? Number(a) : null, note:n}); commit(); };
  inc.querySelectorAll("[data-wd]").forEach(b => b.onclick = () => { snapshot(); metaW().withdrawals.splice(+b.dataset.wd, 1); commit(); });
}

function pmEnsureRow(m, pid){
  const P2 = pmState(), k = pmKey(m, pid);
  if(!P2.rows[k]){ const p = pmProp(pid); P2.rows[k] = {propertyId:pid, month:m, rentDue:p && p.rent != null ? p.rent : null, repairItems:[], adjustments:[]}; }
  return P2.rows[k];
}
function pmTouch(r){ r.updatedAt = new Date().toISOString(); r.updatedBy = (typeof Cloud !== "undefined" && Cloud.email) || ""; }

/* Starting a month does the assistant's set-up work:
   rent due from each lease, recurring vendor charges (pest control, lawn care…),
   the monthly filter fee, and any balance an owner still owes from last month. */
function pmStartMonth(m, quiet){
  const props = pmLiveProps();
  if(!props.length) return toast("Add properties first");
  snapshot();
  const P2 = pmState(), prevM = monthAdd(m, -1);
  let recurring = 0, carried = 0;
  props.forEach(p => {
    const k = pmKey(m, p.id); if(P2.rows[k]) return;
    const row = {propertyId:p.id, month:m, rentDue:p.status === "active" ? p.rent : null,
                 status:p.status === "active" ? "" : PM_STATUS[p.status] || "", repairItems:[], adjustments:[], auto:true};
    if(p.status === "active"){
      (p.recurring || []).filter(x => x && Number(x.amount) > 0).forEach(x => {
        row.repairItems.push({id:uid(), date:m + "-01", vendor:x.vendor || "", memo:x.memo || "Monthly service", amount:Number(x.amount), feeMode:x.feeMode || "auto", recurring:true});
        recurring++;
      });
      if(Number(p.monthlyFilters) > 0) row.filters = Number(p.monthlyFilters);
    }
    const prev = P2.rows[pmKey(prevM, p.id)];
    if(prev && !prev.detailOnly){
      const c = pmCalc(prev, p);
      if(c.payoutC < 0 && !prev.ownerBilled){ row.adjustments.push({amount:c.payoutC / 100, note:`Balance owed from ${monthLabel(prevM)}`, carried:true}); carried++; }
    }
    P2.rows[k] = row;
  });
  P2.meta[m] = Object.assign({month:m, deductions:[], withdrawals:[]}, P2.meta[m] || {});
  P2.meta[m].startedAt = new Date().toISOString(); P2.meta[m].startedBy = (typeof Cloud !== "undefined" && Cloud.email) || "";
  S.ui.pmMonth = m; commit();
  toast(`${monthLabel(m)} started — ${props.length} properties${recurring ? ` · ${recurring} recurring charge${recurring === 1 ? "" : "s"} added` : ""}${carried ? ` · ${carried} balance${carried === 1 ? "" : "s"} carried` : ""}`, !quiet);
}
/* the first person to open the console in a new month starts it, so nobody has to remember */
function pmAutoStart(){
  const m = thisMonth(), P2 = pmState();
  if(!P2.properties.length || pmMonthRows(m).length || S.ui._autoTried === m) return false;
  S.ui._autoTried = m;
  if(!pmMonths().includes(monthAdd(m, -1))) return false;        // only continue an existing run of months
  pmStartMonth(m, true); return true;
}
/* owner payouts: mark one or many as sent */
function pmMarkPaid(m, pids, date, method){
  snapshot();
  const by = (typeof Cloud !== "undefined" && Cloud.email) || "";
  pids.forEach(pid => { const r = pmEnsureRow(m, pid); r.paidOut = {date, method:method || "", by}; pmTouch(r); });
  commit(); toast(`${pids.length} payout${pids.length === 1 ? "" : "s"} marked sent ${fdateS(date)}`, true);
}
function pmMarkPaidSheet(m, pids){
  const rows = pids.map(pid => ({p:pmProp(pid), c:pmCalc(pmRow(m, pid), pmProp(pid))}));
  const total = rows.reduce((a, x) => a + x.c.payoutC, 0);
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>Mark owner payouts sent</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <p class="muted" style="font-size:13.3px;margin-top:0">${rows.length} payout${rows.length === 1 ? "" : "s"} for ${monthLabel(m)} totaling <b class="num">${usd(total)}</b>.</p>
      <div class="f2"><label class="fld"><span>Date sent</span><input type="date" id="mpD" value="${todayISO()}"></label>
        <label class="fld"><span>How</span><select id="mpM"><option>ACH</option><option>Nickel</option><option>Check</option><option>Zelle</option><option>Other</option></select></label></div>
      <div class="md-list">${rows.map(x => `<div class="md-r" style="grid-template-columns:1fr auto"><span>${esc(x.p.name)}<span class="muted"> · ${esc(ownerLabel(ownerById(x.p.ownerId)) || "no owner")}</span></span><b class="num">${usd(x.c.payoutC)}</b></div>`).join("")}</div>
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="mpGo">Mark ${rows.length} sent</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  $("#mpGo").onclick = () => { const d = $("#mpD").value; if(!d) return toast("Pick a date"); closeSheet(); pmMarkPaid(m, pids, d, $("#mpM").value); };
  openPanel();
}
function pmCloseMonth(m, close){
  const R = pmMonthRoll(m);
  if(close && R.flags && !confirm(`${R.flags} propert${R.flags === 1 ? "y has" : "ies have"} a warning. Close ${monthLabel(m)} anyway? You can reopen it later.`)) return;
  snapshot();
  const mm = pmState().meta[m] = Object.assign({month:m, deductions:[], withdrawals:[]}, pmState().meta[m] || {});
  mm.closed = !!close; mm.closedAt = close ? new Date().toISOString() : null; mm.closedBy = close ? ((typeof Cloud !== "undefined" && Cloud.email) || "") : null;
  if(!close) pmMonthRows(m).forEach(({row}) => { if(row.locked) row.locked = false; });   // reopening an imported month makes it editable
  commit(); toast(close ? `${monthLabel(m)} closed` : `${monthLabel(m)} reopened`, true);
  if(close) setTimeout(() => stmtAutoOnClose(m), 600);   // owner statement drafts in Gmail
}

/* ---------------- one property, one month ---------------- */
function pmRowSheet(m, pid, focus){
  const prop = pmProp(pid); if(!prop) return;
  const row = JSON.parse(JSON.stringify(pmEnsureRow(m, pid)));
  row.repairItems = row.repairItems || []; row.adjustments = row.adjustments || [];
  const closed = !!(pmState().meta[m] || {}).closed, ro = closed || row.locked;
  const sh = $("#sheet");
  const kept = [];          // MagicDoor bills taken off this statement in this sheet (saved with the row)
  let ask = -1;             // which MagicDoor item is asking "why off the statement?"
  const keptList = () => typeof mdLinks === "function" ? Object.entries(mdLinks().skip || {}).filter(([, x]) => x && !x.keep && x.pid === pid && x.month === m) : [];
  const SKIP_WHY = {project:"Project expense — billed on the project invoice", other:"Not the owner's cost"};
  const num = (k, label, help) => `<label class="fld"><span>${label}</span><input type="number" step="0.01" data-k="${k}" value="${has(row[k]) ? row[k] : ""}" ${ro ? "disabled" : ""}>${help ? `<span class="help">${help}</span>` : ""}</label>`;
  const draw = () => {
    const c = pmCalc(row, prop);
    sh.innerHTML = `
      <div class="sheet-h"><div><h3>${esc(prop.name)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${monthLabel(m)} · ${feeRuleText(prop.feeRule)} PM fee · ${prop.adminRate ?? 10}% admin fee on repairs</div></div>
        <button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
      <div class="sheet-b">
        ${ro ? `<div class="pm-banner">${row.locked ? "Imported from the workbook — numbers are shown exactly as recorded." : "This month is closed."} Reopen the month to edit.</div>` : ""}
        ${c.flags.length ? `<div class="pm-flags">${c.flags.map(x => `<div class="${x.level}">${esc(x.text)}</div>`).join("")}</div>` : ""}
        <div class="f2">${num("rentDue","Rent due")}${num("rentReceived","Rent received")}</div>
        <div class="f2">${num("leasingFee","Leasing fee","Taken from the owner")}${num("otherIncome","Other owner income","Paid to the owner, e.g. utility credit")}</div>
        <div class="sectl">Collected for PHD</div>
        <div class="f2">${PM_EXTRA.map(([k, l]) => num(k, l)).join("")}</div>
        <div class="sectl">Repairs</div>
        <div class="pm-items">${row.repairItems.map((it, i) => `
          <div class="pm-item" data-i="${i}">
            <input type="date" data-ik="date" value="${esc(it.date || "")}" ${ro ? "disabled" : ""}>
            <input type="text" data-ik="vendor" value="${esc(it.vendor || "")}" placeholder="Vendor" ${ro ? "disabled" : ""}>
            <input type="text" data-ik="memo" value="${esc(it.memo || "")}" placeholder="What was done" ${ro ? "disabled" : ""}>
            <input type="number" step="0.01" data-ik="amount" value="${it.amount ?? ""}" placeholder="0.00" ${ro ? "disabled" : ""}>
            <select data-ik="feeMode" ${ro ? "disabled" : ""}><option value="auto" ${(it.feeMode || (it.fee != null ? "custom" : "auto")) === "auto" ? "selected" : ""}>${prop.adminRate ?? 10}% fee</option>
              <option value="none" ${it.feeMode === "none" ? "selected" : ""}>No fee</option>
              <option value="custom" ${(it.feeMode === "custom" || (it.feeMode == null && it.fee != null)) ? "selected" : ""}>Fee ${usd(itemFeeC(it, prop))}</option></select>
            <div class="pm-item-x">${stmtInvLink(stmtLine(it), "btn sm ghost")}${ro ? "" : `<button class="btn sm ghost" data-del="${i}" title="${it.mdLine ? "Take this MagicDoor bill off the statement" : "Remove"}">✕</button>`}</div>
            ${it.mdLine && typeof mdBillWho === "function" && mdBillWho(it.mdLine) ? `<div class="pm-item-who">${esc(mdBillWho(it.mdLine))}</div>` : ""}
            ${it.mdLine && ask === i ? `<div class="pm-ask"><span>Keep this MagicDoor bill off the owner statement?</span><button class="btn sm primary" data-why="project">Project expense</button><button class="btn sm" data-why="other">Not the owner's cost</button><button class="btn sm ghost" data-why="">Cancel</button></div>` : ""}
            ${ro ? "" : `<input type="url" class="pm-link" data-ik="link" value="${esc(it.link || "")}" placeholder="Receipt link (optional)">`}
          </div>`).join("") || `<p class="muted" style="font-size:12.5px;margin:0">No repairs this month.</p>`}</div>
        ${ro ? "" : `<button class="btn sm" id="addItem">${icon("plus")} Add repair</button>`}
        ${(() => { const ks = keptList().filter(([id]) => !kept.some(k => k.it.mdLine === id)).concat(kept.map(k => [k.it.mdLine, {why:k.why, vendor:k.it.vendor, amount:k.it.amount, memo:k.it.memo, pending:true}]));
          return ks.length ? `<div class="pm-kept"><div class="label">Kept off this statement · ${ks.length} MagicDoor bill${ks.length === 1 ? "" : "s"}</div>${ks.map(([id, x]) => `<div class="pm-kept-r"><span><b>${esc(x.vendor || "Bill")}</b> ${esc(x.memo || "")}<div class="muted">${x.why === "project" ? (x.pjName ? `On the ${esc(x.pjName)} project${x.pjDesc ? " · " + esc(x.pjDesc.slice(0, 60)) : ""}${x.auto ? " · matched automatically" : ""}` : "Project expense") : "Not the owner's cost"}${x.pending ? " · saves with this month" : ""}</div></span><span class="num">${usd(cents(x.amount))}</span>${ro || x.pending ? "" : `<button class="btn sm ghost" data-restore="${esc(id)}">Put back</button>`}</div>`).join("")}</div>` : ""; })()}
        ${has(row.repairs) && Math.abs(cents(row.repairs) - c.itemsC) > 1 ? `<p class="help">Workbook total ${usd(cents(row.repairs))}; the itemised detail adds to ${usd(c.itemsC)}.</p>` : ""}
        <div class="sectl" style="margin-top:14px">Adjustments to the owner</div>
        ${row.adjustments.map((a, i) => `<div class="pm-add"><input type="number" step="0.01" data-aj="${i}" data-ak="amount" value="${a.amount ?? ""}" ${ro ? "disabled" : ""}><input type="text" data-aj="${i}" data-ak="note" value="${esc(a.note || "")}" placeholder="Why (required)" ${ro ? "disabled" : ""}>${ro ? "" : `<button class="btn sm ghost" data-ajdel="${i}">✕</button>`}</div>`).join("")}
        ${ro ? "" : `<button class="btn sm ghost" id="addAdj">${icon("plus")} Add an adjustment</button><p class="help">Credits (+) or charges (−) that aren't repairs — e.g. a balance carried from last month. Each needs a reason, so a payout never changes without one.</p>`}
        <div class="sectl" style="margin-top:14px">PM fee</div>
        <div class="f2"><label class="fld"><span>PM fee</span><input type="number" step="0.01" data-k="pmFee" value="${has(row.pmFee) ? row.pmFee : ""}" placeholder="${(c.ruleFeeC / 100).toFixed(2)}" ${ro ? "disabled" : ""}>
          <span class="help">Blank uses the rule: ${feeRuleText(prop.feeRule)} of rent received = ${usd(c.ruleFeeC)}</span></label>
          <label class="fld"><span>Notes</span><input type="text" data-k="notes" value="${esc(row.notes || "")}" ${ro ? "disabled" : ""}></label></div>
        <div class="sectl" style="margin-top:6px">Owner payout</div>
        <div class="f2"><label class="fld"><span>Sent on</span><input type="date" id="poD" value="${esc((row.paidOut || {}).date || "")}" ${ro ? "disabled" : ""}></label>
          <label class="fld"><span>How</span><select id="poM" ${ro ? "disabled" : ""}>${["","ACH","Nickel","Check","Zelle","Other"].map(x => `<option ${((row.paidOut || {}).method || "") === x ? "selected" : ""} value="${x}">${x || "—"}</option>`).join("")}</select></label></div>
        <label class="switchbox"><input type="checkbox" id="shortOk" ${row.shortOk ? "checked" : ""} ${ro ? "disabled" : ""}> Partial rent is expected this month — don't raise a "rent short" alert</label>
        ${(row.payments || []).length ? `<div class="sectl">Payments received</div><div class="ib-lines">${row.payments.map(p => `<div><span>${esc([p.date ? fdateS(p.date) : "", p.name, p.via, p.type && p.type !== "rent" ? p.type : ""].filter(Boolean).join(" · "))}</span><span class="num">${usd(cents(p.amount))}</span></div>`).join("")}</div>` : ""}
        <div class="sectl" style="margin-top:14px">Owner statement</div>
        <table class="pm-sum wf">
          <tr><td>Rent received</td><td class="r num">${usd(c.recv)}</td></tr>
          <tr><td>Repairs</td><td class="r num">−${usd(c.repairsC)}</td></tr>
          <tr><td>Admin fee on repairs</td><td class="r num">−${usd(c.adminC)}</td></tr>
          <tr><td>PM fee</td><td class="r num">−${usd(c.pmFeeC)}</td></tr>
          ${c.leasingC ? `<tr><td>Leasing fee</td><td class="r num">−${usd(c.leasingC)}</td></tr>` : ""}
          ${c.otherC ? `<tr><td>Other income</td><td class="r num">${usd(c.otherC)}</td></tr>` : ""}
          ${c.adjC ? `<tr><td>Adjustments</td><td class="r num">${c.adjC < 0 ? "−" : ""}${usd(Math.abs(c.adjC))}</td></tr>` : ""}
          <tr class="due"><td>${c.recordedC != null ? "Owner payout (formula)" : "Owner payout"}</td><td class="r num">${usd(c.calcC)}</td></tr>
          ${c.recordedC != null ? `<tr><td>Recorded in the workbook</td><td class="r num">${usd(c.recordedC)}</td></tr>` : ""}
        </table>
      </div>
      <div class="sheet-f">
        <button class="btn" id="pmStmt">${icon("file")} Statement PDF</button>
        <span style="flex:1"></span>
        <button class="btn" id="shCancel">${ro ? "Close" : "Cancel"}</button>
        ${ro ? "" : `<button class="btn primary" id="pmSave">Save</button>`}
      </div>`;
    wire();
  };
  const wire = () => {
    $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
    $("#pmStmt").onclick = () => { pmCommitRow(m, pid, row, ro); printDoc(pmStatementHTML(m, [pid])); };
    if(ro) return;
    const poD = $("#poD"), poM = $("#poM"), so = $("#shortOk");
    if(poD) poD.onchange = poM.onchange = () => { row.paidOut = poD.value ? {date:poD.value, method:poM.value, by:(typeof Cloud !== "undefined" && Cloud.email) || ""} : undefined; if(!poD.value) delete row.paidOut; };
    if(so) so.onchange = () => { row.shortOk = so.checked || undefined; if(!so.checked) delete row.shortOk; };
    sh.querySelectorAll("[data-k]").forEach(inp => inp.onchange = () => {
      const k = inp.dataset.k;
      row[k] = k === "notes" ? inp.value : (inp.value.trim() === "" ? null : Math.round(Number(inp.value) * 100) / 100);
      draw();
    });
    sh.querySelectorAll(".pm-item").forEach(el => {
      const i = +el.dataset.i;
      el.querySelectorAll("[data-ik]").forEach(inp => inp.onchange = () => {
        const k = inp.dataset.ik, it = row.repairItems[i];
        if(k === "amount") it.amount = inp.value === "" ? null : Math.round(Number(inp.value) * 100) / 100;
        else if(k === "feeMode"){
          it.feeMode = inp.value;
          if(inp.value === "custom"){ const f = prompt("Admin fee for this item ($)", it.fee != null ? it.fee : (itemFeeC(Object.assign({}, it, {feeMode:"auto"}), prop) / 100).toFixed(2)); if(f === null){ it.feeMode = "auto"; } else it.fee = Math.round(Number(f) * 100) / 100; }
        } else it[k] = inp.value;
        if(has(row.repairs)) row.repairs = null;    // itemised detail now drives the total
        if(has(row.adminFee)) row.adminFee = null;
        draw();
      });
      const del = el.querySelector("[data-del]");
      if(del) del.onclick = () => {
        if(row.repairItems[i] && row.repairItems[i].mdLine){ ask = ask === i ? -1 : i; return draw(); }
        row.repairItems.splice(i, 1); if(has(row.repairs)) row.repairs = null; if(has(row.adminFee)) row.adminFee = null; draw(); };
      el.querySelectorAll("[data-why]").forEach(b => b.onclick = () => {
        ask = -1;
        if(b.dataset.why){ kept.push({it:row.repairItems[i], why:b.dataset.why}); row.repairItems.splice(i, 1); if(has(row.repairs)) row.repairs = null; if(has(row.adminFee)) row.adminFee = null; }
        draw(); });
    });
    const ai = $("#addItem"); if(ai) ai.onclick = () => { row.repairItems.push({id:uid(), date:new Date().toISOString().slice(0,10), vendor:"", memo:"", amount:null, feeMode:"auto", link:""}); draw();
      const last = sh.querySelectorAll('.pm-item [data-ik="vendor"]'); if(last.length) last[last.length - 1].focus(); };
    sh.querySelectorAll("[data-restore]").forEach(b => b.onclick = () => {
      const id = b.dataset.restore, x = (mdLinks().skip || {})[id]; if(!x) return;
      snapshot(); mdLinks().skip[id] = {keep:true, at:todayISO(), by:(typeof Cloud !== "undefined" && (Cloud.email || Cloud.name)) || "", pid, month:m}; commit();   // stays on the statement, even if it looks like a project cost
      const f = typeof mdLineById === "function" && mdReady() ? mdLineById(id) : null;
      if(f && !row.repairItems.some(it => it.mdLine === id)){
        const memo = PMCore.mdLineMemo(f.li, f.b) || "MagicDoor bill";
        row.repairItems.push({id:uid(), date:f.b.date, vendor:f.b.vendor || "", memo, mdMemo:memo, amount:f.li.amount, feeMode:"auto", mdLine:id, mdBill:f.b.id, source:"MagicDoor"});
      }
      toast("Put back — save to keep it on this statement"); draw(); });
    const aa = $("#addAdj"); if(aa) aa.onclick = () => { row.adjustments.push({amount:null, note:""}); draw(); };
    sh.querySelectorAll("[data-aj]").forEach(inp => inp.onchange = () => { const a = row.adjustments[+inp.dataset.aj];
      a[inp.dataset.ak] = inp.dataset.ak === "amount" ? (inp.value === "" ? null : Math.round(Number(inp.value) * 100) / 100) : inp.value; draw(); });
    sh.querySelectorAll("[data-ajdel]").forEach(b => b.onclick = () => { row.adjustments.splice(+b.dataset.ajdel, 1); draw(); });
    $("#pmSave").onclick = () => {
      if(row.adjustments.some(a => has(a.amount) && !String(a.note || "").trim())) return toast("Every adjustment needs a reason");
      row.adjustments = row.adjustments.filter(a => has(a.amount));
      row.repairItems = row.repairItems.filter(it => has(it.amount) || it.vendor || it.memo);
      if(kept.length){ const L = mdLinks(), by = (typeof Cloud !== "undefined" && (Cloud.email || Cloud.name)) || "";
        kept.forEach(({it, why}) => { L.skip[it.mdLine] = {why, at:todayISO(), by, pid, month:m, vendor:it.vendor || "", amount:it.amount, memo:it.memo || "", billId:it.mdBill || ""}; }); }
      pmCommitRow(m, pid, row, false); if(kept.length) commit(); closeSheet(); toast(`${prop.name} saved${kept.length ? ` · ${kept.length} kept off the statement` : ""}`, true);
    };
  };
  draw();
  openPanel();
  if(focus === "repairs") setTimeout(() => { const s = sh.querySelector(".pm-items"); if(s) s.scrollIntoView({block:"center"}); }, 300);
}
function pmCommitRow(m, pid, row, ro){
  if(ro) return;
  const P2 = pmState(), k = pmKey(m, pid), cur = P2.rows[k];
  if(JSON.stringify(cur) === JSON.stringify(row)) return;
  snapshot(); pmTouch(row); P2.rows[k] = row; commit();
}

/* ====================================================================
   PROPERTIES
   ==================================================================== */
function pgPmProps(){
  const P2 = pmState();
  if(!P2.properties.length) return pmEmpty();
  actions([["Add property", () => pmPropSheet(null), "primary"]]);
  const v = $("#view");
  const f = S.ui.pmPropF || "active";
  const all = P2.properties.filter(p => !p.deleted);
  const cnt = k => all.filter(p => k === "all" ? true : p.status === k).length;
  const bar = elm("div","sc-bar");
  bar.innerHTML = `<div class="sc-seg">${[["active","Leased"],["marketing","Marketing"],["vacant","Vacant"],["inactive","No longer managed"],["all","All"]]
      .filter(([k]) => k === "all" || cnt(k)).map(([k, l]) => `<button data-f="${k}" class="${f === k ? "on" : ""}">${l} <span>${cnt(k)}</span></button>`).join("")}</div>
    <div class="sc-q"><input type="text" id="ppQ" placeholder="Find a property or owner…" value="${esc(S.ui.ppQ || "")}"></div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ui.pmPropF = b.dataset.f; render(); });
  const qi = bar.querySelector("#ppQ");
  qi.oninput = () => { S.ui.ppQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#ppQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 160); };
  const q = (S.ui.ppQ || "").toLowerCase();
  const lastM = pmLastPaidMonth();
  const list = all.filter(p => (f === "all" || p.status === f) && (!q || `${p.name} ${p.address} ${ownerLabel(ownerById(p.ownerId))}`.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  const card = elm("div","card");
  const t = elm("table","tbl");
  const showStatus = f === "all", curM = thisMonth();
  t.className = "tbl pm-plist";
  t.innerHTML = `<thead><tr><th>Property</th><th>Owner</th>${showStatus ? "<th>Status</th>" : ""}<th>${esc(monthLabel(curM).split(" ")[0])} rent</th><th class="r">Rent</th><th class="r">${lastM ? "Payout · " + monthShort(lastM) : "Last payout"}</th><th class="r">Deposit</th><th></th></tr></thead>`;
  // this month's rent: MagicDoor's live balance when linked, otherwise what's recorded here
  const rentNow = p => {
    if(p.status === "inactive") return "";
    const m = typeof mdReady === "function" && mdReady() ? mdFor(p.id) : null, L = m && m.lease;
    if(L && L.balance > 0) return `<span class="tag red" title="From MagicDoor">Owes ${usd0(cents(L.balance))}${L.pastDueDays > 0 ? ` · ${L.pastDueDays}d` : ""}</span>`;
    if(L && PMCore.mdPaidThisMonth(L, curM)) return `<span class="tag green" title="From MagicDoor">Paid${L.lastPayment ? " " + esc(fdateS(L.lastPayment)) : ""}</span>`;
    const st = pmLiveStatus(curM, p), x = PM_STAT[st] || PM_STAT.none;
    return st === "vacant" || st === "nodue" ? `<span class="muted">${x.label}</span>` : `<span class="tag ${x.cls}">${x.label}</span>`;
  };
  const tb = elm("tbody");
  // grouped by MagicDoor portfolio when properties have one
  const grouped = list.some(p => p.portfolio);
  if(grouped){
    const order = [...new Set(list.map(p => p.portfolio || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b));
    list.sort((a, b) => order.indexOf(a.portfolio || "") - order.indexOf(b.portfolio || "") || a.name.localeCompare(b.name, undefined, {numeric:true}));
  }
  let lastGroup = null;
  list.forEach(p => {
    if(grouped && (p.portfolio || "") !== lastGroup){
      lastGroup = p.portfolio || "";
      const n = list.filter(x => (x.portfolio || "") === lastGroup).length;
      const g = elm("tr","pm-grp"); g.innerHTML = `<td colspan="${showStatus ? 8 : 7}">${esc(lastGroup || "Not in MagicDoor")} <span class="muted">· ${n}</span></td>`; tb.appendChild(g);
    }
    const r = lastM && pmRow(lastM, p.id), c = r && !r.detailOnly ? pmCalc(r, p) : null;
    const d = P2.deposits[p.id], held = d && d.current && d.current.amount ? cents(d.current.amount) : 0;
    const own = ownerLabel(ownerById(p.ownerId));
    const tr = elm("tr");
    const sub = p.status === "active" && p.tenants ? p.tenants : p.status !== "active" && p.statusSince ? `${PM_STATUS[p.status]} since ${fdateS(p.statusSince)}` : "";
    tr.innerHTML = `<td><div class="item-t">${esc(p.name)}${p.feeRule && p.feeRule.check ? `<span class="mark gold" title="Fee rule came from the workbook and looks unusual">Check fee</span>` : ""}</div>${sub ? `<div class="item-s">${esc(sub)}</div>` : ""}</td>
      <td class="pm-own">${own ? esc(own) : `<span class="muted">—</span>`}</td>
      ${showStatus ? `<td><span class="tag ${{active:"green", marketing:"gold", vacant:"grey", inactive:"grey"}[p.status] || "grey"}">${PM_STATUS[p.status] || p.status}</span></td>` : ""}
      <td>${rentNow(p)}</td>
      <td class="r num">${p.rent ? usd(cents(p.rent)) : "—"}</td>
      <td class="r num">${c ? usd(c.payoutC) : `<span class="muted">—</span>`}</td><td class="r num">${held ? usd(held) : `<span class="muted">—</span>`}</td><td class="act"><span class="sc-go">›</span></td>`;
    tr.dataset.pmid = p.id; tr.onclick = () => pmOpenProperty(p.id);
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  const w = elm("div","tbl-wrap"); w.appendChild(t); card.appendChild(w);
  if(!list.length) card.appendChild(elm("div","empty",`<b>No properties here</b>`));
  v.appendChild(card);
}

function pmPropSheet(id){
  const isNew = !id;
  const p = isNew ? {id:"pm_" + uid(), name:"", address:"", aliases:[], rent:null, feeRule:{type:"pct", rate:10}, adminRate:10, status:"active", ownerId:null, tenants:"", notes:"", recurring:[]}
                  : JSON.parse(JSON.stringify(pmProp(id)));
  p.recurring = p.recurring || [];
  const sh = $("#sheet");
  const owners = (S.owners || []).filter(ownerLabel).sort((a, b) => ownerLabel(a).localeCompare(ownerLabel(b)));
  // the filter fee most often charged over the last three months, offered as a default
  const hist = pmMonths().slice(-3).map(m => pmRow(m, p.id)).filter(r => r && Number(r.filters) > 0).map(r => Number(r.filters));
  const usual = hist.length >= 2 && hist.every(x => x === hist[0]) ? hist[0] : null;
  const recRow = (x, i) => `<div class="pm-rec" data-ri="${i}"><input type="text" data-rk="vendor" value="${esc(x.vendor || "")}" placeholder="Vendor (e.g. Stark Exterminators)">
      <input type="text" data-rk="memo" value="${esc(x.memo || "")}" placeholder="What (e.g. Monthly pest control)"><input type="number" step="0.01" data-rk="amount" value="${x.amount ?? ""}" placeholder="0.00">
      <select data-rk="feeMode"><option value="auto" ${x.feeMode !== "none" ? "selected" : ""}>+ admin fee</option><option value="none" ${x.feeMode === "none" ? "selected" : ""}>No fee</option></select>
      <button class="btn sm ghost" data-rdel="${i}">✕</button></div>`;
  const draw = () => {
    sh.innerHTML = `
    <div class="sheet-h"><h3>${isNew ? "New property" : esc(p.name)}</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <label class="fld"><span>Short name</span><input type="text" id="pp_name" value="${esc(p.name)}" placeholder="342 King St #A"></label>
      <label class="fld"><span>Full address</span><input type="text" id="pp_addr" value="${esc(p.address)}" placeholder="342 King St, A, Charleston, SC 29401"><span class="help">Used to match Magicdoor payments and receipts.</span></label>
      <div class="f2">
        <label class="fld"><span>Owner</span><select id="pp_owner"><option value="">— None yet —</option>${owners.map(o => `<option value="${o.id}" ${o.id === p.ownerId ? "selected" : ""}>${esc(ownerLabel(o))}</option>`).join("")}<option value="__new">+ New owner…</option></select></label>
        <label class="fld"><span>Status</span><select id="pp_status">${Object.entries(PM_STATUS).map(([k, l]) => `<option value="${k}" ${(p._statusDraft || p.status) === k ? "selected" : ""}>${l}</option>`).join("")}</select>${p.statusSince ? `<span class="help">Since ${esc(fdateS(p.statusSince))}</span>` : ""}</label>
      </div>
      <div class="sectl">Lease</div>
      <div class="f2">
        <label class="fld"><span>Monthly rent</span><input type="number" step="0.01" id="pp_rent" value="${p.rent ?? ""}"></label>
        <label class="fld"><span>Tenants</span><input type="text" id="pp_ten" value="${esc(p.tenants || "")}" placeholder="Names on the lease"></label>
      </div>
      <div class="f2">
        <label class="fld"><span>Lease start</span><input type="date" id="pp_ls" value="${esc(p.leaseStart || "")}"></label>
        <label class="fld"><span>Lease end</span><input type="date" id="pp_le" value="${esc(p.leaseEnd || "")}"><span class="help">You'll get a renewal alert ${pmSettings().renewalDays} days ahead.</span></label>
      </div>
      <div class="f2">
        <label class="fld"><span>Tenant email</span><input type="email" id="pp_te" value="${esc(p.tenantEmail || "")}"></label>
        <label class="fld"><span>Tenant phone</span><input type="tel" id="pp_tp" value="${esc(p.tenantPhone || "")}"></label>
      </div>
      <div class="sectl">Fees</div>
      <div class="f2">
        <label class="fld"><span>PM fee</span><select id="pp_ft"><option value="pct" ${p.feeRule.type !== "flat" ? "selected" : ""}>Percent of rent received</option><option value="flat" ${p.feeRule.type === "flat" ? "selected" : ""}>Flat amount</option></select></label>
        <label class="fld"><span id="pp_fvL">${p.feeRule.type === "flat" ? "Amount ($)" : "Rate (%)"}</span><input type="number" step="0.01" id="pp_fv" value="${p.feeRule.type === "flat" ? p.feeRule.amount : p.feeRule.rate}"></label>
      </div>
      <div class="f2">
        <label class="fld"><span>Admin fee on repairs (%)</span><input type="number" step="0.01" id="pp_ar" value="${p.adminRate ?? 10}"></label>
        <label class="fld"><span>Monthly filter fee (tenant)</span><input type="number" step="0.01" id="pp_mf" value="${p.monthlyFilters ?? ""}" placeholder="${usual ? usual.toFixed(2) : "0.00"}"><span class="help">${usual ? `Charged ${usd(cents(usual))} each of the last months — leave blank to skip.` : "Added to PHD income every month."}</span></label>
      </div>
      ${p.feeRule.check ? `<p class="pm-banner">This fee rule was worked out from the workbook (${feeRuleText(p.feeRule)} of rent received). Confirm the rate and save to clear the alert.</p>` : ""}
      <div class="sectl">Recurring charges</div>
      <p class="help" style="margin-top:0">Added to this property automatically when each month starts — pest control, lawn care, utilities you pay for the owner.</p>
      <div class="pm-recs">${p.recurring.map(recRow).join("")}</div>
      <button class="btn sm" id="pp_addRec">${icon("plus")} Add a recurring charge</button>
      <label class="fld" style="margin-top:14px"><span>Notes</span><textarea id="pp_notes" rows="3">${esc(p.notes || "")}</textarea></label>
    </div>
    <div class="sheet-f">${isNew ? "" : `<button class="btn" id="pp_page">Open property page</button>`}<span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="ppSave">${isNew ? "Add property" : "Save"}</button></div>`;
    wire();
  };
  const grab = () => {
    p.recurring = [...sh.querySelectorAll(".pm-rec")].map(el => ({vendor:el.querySelector('[data-rk="vendor"]').value.trim(), memo:el.querySelector('[data-rk="memo"]').value.trim(),
      amount:el.querySelector('[data-rk="amount"]').value === "" ? null : Number(el.querySelector('[data-rk="amount"]').value), feeMode:el.querySelector('[data-rk="feeMode"]').value}));
  };
  const wire = () => {
    $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
    const pg = $("#pp_page"); if(pg) pg.onclick = () => { closeSheet(); pmOpenProperty(p.id); };
    $("#pp_ft").onchange = e => { $("#pp_fvL").textContent = e.target.value === "flat" ? "Amount ($)" : "Rate (%)"; };
    $("#pp_addRec").onclick = () => { snap(); grab(); p.recurring.push({vendor:"", memo:"", amount:null, feeMode:"auto"}); draw(); };
    sh.querySelectorAll("[data-rdel]").forEach(b => b.onclick = () => { snap(); grab(); p.recurring.splice(+b.dataset.rdel, 1); draw(); });
    $("#pp_owner").onchange = e => {
      if(e.target.value !== "__new") return;
      const nm = prompt("Owner name"); if(!nm){ e.target.value = p.ownerId || ""; return; }
      const o = cleanOwner(Object.assign(blankOwner(), {id:uid(), name:nm.trim()})); S.owners = S.owners || []; S.owners.push(o);
      const opt = document.createElement("option"); opt.value = o.id; opt.textContent = nm.trim(); e.target.insertBefore(opt, e.target.lastChild); e.target.value = o.id;
    };
    $("#ppSave").onclick = () => {
      const name = $("#pp_name").value.trim(); if(!name) return toast("Give the property a name");
      grab();
      const fv = Number($("#pp_fv").value), status = $("#pp_status").value;
      const newRule = $("#pp_ft").value === "flat" ? {type:"flat", amount:fv || 0} : {type:"pct", rate:fv || 0};
      snapshot();
      if(status !== p.status) p.statusSince = todayISO();
      if(status !== p.status && typeof mdFor === "function" && mdReady()){
        const mm = mdFor(p.id), key = mm ? (mm.unit ? mm.unit.id : "p:" + mm.property.id) : null, L = mdLinks();
        if(status === "inactive" && key){ L.ignore[key] = true; p.mdIgnored = key; toast("Marked no longer managed — the MagicDoor sync will leave this unit out"); }
        if(p.status === "inactive" && status !== "inactive" && p.mdIgnored){ delete L.ignore[p.mdIgnored]; delete p.mdIgnored; }
      }
      Object.assign(p, {name, address:$("#pp_addr").value.trim() || name, ownerId:$("#pp_owner").value || null, status,
        rent:$("#pp_rent").value === "" ? null : Number($("#pp_rent").value), tenants:$("#pp_ten").value.trim(), notes:$("#pp_notes").value.trim(),
        leaseStart:$("#pp_ls").value || null, leaseEnd:$("#pp_le").value || null, tenantEmail:$("#pp_te").value.trim(), tenantPhone:$("#pp_tp").value.trim(),
        monthlyFilters:$("#pp_mf").value === "" ? null : Number($("#pp_mf").value),
        adminRate:Number($("#pp_ar").value) || 0, recurring:p.recurring.filter(x => x.amount > 0 && (x.vendor || x.memo)),
        feeRule:newRule});
      delete p.feeRule.check; delete p._statusDraft;          // saving confirms the rule
      const L = pmState().properties;
      if(isNew) L.push(p); else L[L.findIndex(x => x.id === p.id)] = p;
      closeSheet(); commit(); toast(isNew ? `${name} added` : "Saved", true);
    };
  };
  // keep the visible field values when the recurring list redraws
  const snap = () => { ["name","addr","rent","ten","ls","le","te","tp","fv","ar","mf","notes"].forEach(k => { const el = $("#pp_" + k); if(el) p["_f_" + k] = el.value; });
    p.name = p._f_name; p.address = p._f_addr; p.rent = p._f_rent === "" ? null : Number(p._f_rent); p.tenants = p._f_ten; p.leaseStart = p._f_ls; p.leaseEnd = p._f_le;
    p.tenantEmail = p._f_te; p.tenantPhone = p._f_tp; p.adminRate = Number(p._f_ar); p.monthlyFilters = p._f_mf === "" ? null : Number(p._f_mf); p.notes = p._f_notes;
    p.ownerId = $("#pp_owner").value === "__new" ? p.ownerId : ($("#pp_owner").value || null);
    p._statusDraft = $("#pp_status").value;
    const ck = p.feeRule.check; p.feeRule = $("#pp_ft").value === "flat" ? {type:"flat", amount:Number(p._f_fv) || 0} : {type:"pct", rate:Number(p._f_fv) || 0}; if(ck) p.feeRule.check = ck;
    Object.keys(p).filter(k => k.startsWith("_f_")).forEach(k => delete p[k]); };
  draw();
  openPanel();
}

/* ====================================================================
   SECURITY DEPOSITS
   ==================================================================== */
function pgPmDeposits(){
  const P2 = pmState();
  if(!P2.properties.length) return pmEmpty();
  actions([]);
  const v = $("#view");
  const props = P2.properties.filter(p => !p.deleted && (p.status !== "inactive" || P2.deposits[p.id])).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  let heldC = 0, futureC = 0, unreturned = 0;
  props.forEach(p => { const d = P2.deposits[p.id] || {};
    if(d.current && d.current.amount) heldC += cents(d.current.amount);
    if(d.future && d.future.amount) futureC += cents(d.future.amount);
    if(d.former && d.former.names && !/^(yes|returned|done)/i.test(d.former.returned || "")) unreturned++; });
  const tiles = elm("div","card pf-hero");
  tiles.innerHTML = `<div class="pf-cell"><div class="label">Held for current tenants</div><div class="pf-v">${usd(heldC)}</div></div>
    <div class="pf-cell"><div class="label">Collected from future tenants</div><div class="pf-v">${usd(futureC)}</div></div>
    <div class="pf-cell"><div class="label">Former tenants to settle</div><div class="pf-v"${unreturned ? ' style="color:var(--gold)"' : ""}>${unreturned}</div><div class="pf-note">No record of the deposit being returned</div></div>`;
  v.appendChild(tiles);
  const card = elm("div","card"); card.style.marginTop = "16px";
  const t = elm("table","tbl");
  const cellP = (x, withRet) => x && (x.names || x.amount || x.amountText) ? `<div class="item-t" style="font-weight:500">${esc(x.names || "—")}</div><div class="item-s">${x.amount ? usd(cents(x.amount)) : esc(x.amountText || "")}${withRet && x.returned ? " · " + esc(x.returned) : ""}</div>` : `<span class="muted">—</span>`;
  t.innerHTML = `<thead><tr><th>Property</th><th>Current tenants</th><th>Future tenants</th><th>Former tenants</th><th></th></tr></thead>`;
  const tb = elm("tbody");
  props.forEach(p => { const d = P2.deposits[p.id] || {};
    const tr = elm("tr");
    tr.innerHTML = `<td><div class="item-t">${esc(p.name)}</div></td><td>${cellP(d.current)}</td><td>${cellP(d.future)}</td><td>${cellP(d.former, true)}</td><td class="act"><span class="sc-go">›</span></td>`;
    tr.onclick = () => pmDepositSheet(p.id); tb.appendChild(tr); });
  t.appendChild(tb); const w = elm("div","tbl-wrap"); w.appendChild(t); card.appendChild(w); v.appendChild(card);
}
function pmDepositSheet(pid){
  const p = pmProp(pid); const d = JSON.parse(JSON.stringify(pmState().deposits[pid] || {propertyId:pid}));
  const sec = (k, label, withRet) => { const x = d[k] || {};
    return `<div class="sectl">${label}</div>
      <div class="f2"><label class="fld"><span>Names</span><input type="text" data-s="${k}" data-f="names" value="${esc(x.names || "")}"></label>
      <label class="fld"><span>Amount</span><input type="number" step="0.01" data-s="${k}" data-f="amount" value="${x.amount ?? ""}" placeholder="${esc(x.amountText || "")}"></label></div>
      ${withRet ? `<label class="fld"><span>Moved out</span><input type="date" data-s="${k}" data-f="moveOut" value="${esc(x.moveOut || "")}"><span class="help">South Carolina requires the deposit (with an itemized list of deductions) back within ${pmSettings().depositDays} days — you'll be alerted before it's due.</span></label>
      <label class="fld"><span>Returned</span><input type="text" data-s="${k}" data-f="returned" value="${esc(x.returned || "")}" placeholder="e.g. Returned 9/12 — $2,450 less $150 cleaning"></label>` : ""}
      <label class="fld"><span>Notes</span><textarea rows="2" data-s="${k}" data-f="notes">${esc(x.notes || "")}</textarea></label>`; };
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>Deposits · ${esc(p.name)}</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">${sec("current", "Current tenants")}${sec("future", "Future tenants")}${sec("former", "Former tenants", true)}</div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="dpSave">Save</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  $("#dpSave").onclick = () => {
    sh.querySelectorAll("[data-s]").forEach(inp => { const s = d[inp.dataset.s] = d[inp.dataset.s] || {}; const f = inp.dataset.f;
      s[f] = f === "amount" ? (inp.value === "" ? null : Number(inp.value)) : inp.value.trim(); });
    snapshot(); pmState().deposits[pid] = d; closeSheet(); commit(); toast("Deposits saved", true);
  };
  openPanel();
}

/* ====================================================================
   INCOME TREND
   ==================================================================== */
function pgPmIncome(){
  const P2 = pmState();
  if(!P2.properties.length) return pmEmpty();
  actions([["Export CSV", () => {
    const rows = [["Month","Rent collected","Repairs","Admin fees","PM fees","Leasing fees","Applications","Late fees","Reimbursements","Filters","Deductions","Net PHD income","Owner payouts"]];
    pmMonths().forEach(m => { const R = pmMonthRoll(m); rows.push([monthLabel(m), R.recv, R.repairsC, R.adminC, R.pmFeeC, R.leasingC, ...PM_EXTRA.map(([k]) => cents(R.extras[k] / 100)), R.deductC, R.netC, R.payoutC].map((x, i) => i ? (x / 100).toFixed(2) : x)); });
    download(`PHD PM income ${new Date().toISOString().slice(0,10)}.csv`, rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\n"));
  }]]);
  const v = $("#view"), ms = pmMonths();
  const data = ms.map(m => ({m, R:pmMonthRoll(m)}));
  const max = Math.max(1, ...data.map(d => d.R.netC));
  const last12 = data.slice(-12), sum12 = last12.reduce((a, d) => a + d.R.netC, 0), avg = last12.length ? sum12 / last12.length : 0;
  const tiles = elm("div","card pf-hero");
  tiles.innerHTML = `<div class="pf-cell"><div class="label">PHD income · last ${last12.length} months</div><div class="pf-v a">${usd(sum12)}</div></div>
    <div class="pf-cell"><div class="label">Monthly average</div><div class="pf-v">${usd(Math.round(avg))}</div></div>
    <div class="pf-cell"><div class="label">Rent collected · last ${last12.length} months</div><div class="pf-v">${usd(last12.reduce((a, d) => a + d.R.recv, 0))}</div></div>
    <div class="pf-cell"><div class="label">Paid to owners</div><div class="pf-v g">${usd(last12.reduce((a, d) => a + d.R.payoutC, 0))}</div></div>`;
  v.appendChild(tiles);
  const chart = elm("div","card pm-chart");
  chart.innerHTML = `<div class="card-h"><h3>Net PHD income by month</h3><span class="muted" style="margin-left:auto;font-size:12px">Click a month to open it</span></div>
    <div class="pm-bars">${data.map(d => `<button class="pm-bar" data-m="${d.m}" title="${monthLabel(d.m)}: ${usd(d.R.netC)}"><span class="v num">${usd0(d.R.netC)}</span><i style="height:${Math.max(2, d.R.netC / max * 100)}%"></i><span class="l">${monthShort(d.m)}</span></button>`).join("")}</div>`;
  v.appendChild(chart);
  chart.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { S.ui.pmMonth = b.dataset.m; go("pmMonth"); });
  const card = elm("div","card");
  const t = elm("table","tbl");
  t.innerHTML = `<thead><tr><th>Month</th><th class="r">Rent collected</th><th class="r">PM fees</th><th class="r">Admin fees</th><th class="r">Leasing</th><th class="r">Other PHD</th><th class="r">Deductions</th><th class="r">Net PHD income</th><th class="r">Owner payouts</th><th>Status</th></tr></thead>
    <tbody>${[...data].reverse().map(({m, R}) => { const meta = P2.meta[m] || {};
      return `<tr data-m="${m}" style="cursor:pointer"><td><b>${monthLabel(m)}</b></td><td class="r num">${usd(R.recv)}</td><td class="r num">${usd(R.pmFeeC)}</td><td class="r num">${usd(R.adminC)}</td>
        <td class="r num">${usd(R.leasingC)}</td><td class="r num">${usd(R.extrasC)}</td><td class="r num">${R.deductC ? usd(R.deductC) : "—"}</td><td class="r num"><b>${usd(R.netC)}</b></td><td class="r num">${usd(R.payoutC)}</td>
        <td>${meta.closed ? `<span class="tag green">Closed</span>` : Object.values(P2.rows).some(r => r.month === m && r.source === "workbook") ? `<span class="tag grey">Imported</span>` : `<span class="tag acc">Open</span>`}</td></tr>`; }).join("")}</tbody>`;
  t.querySelectorAll("[data-m]").forEach(tr => tr.onclick = () => { S.ui.pmMonth = tr.dataset.m; go("pmMonth"); });
  const w = elm("div","tbl-wrap"); w.appendChild(t); card.appendChild(w); v.appendChild(card);
}

/* ====================================================================
   EMPTY STATE + WORKBOOK HISTORY IMPORT
   ==================================================================== */
function pmEmpty(){
  actions([]);
  const v = $("#view");
  const c = elm("div","card");
  c.innerHTML = `<div class="empty"><b>Set up property management</b>
    <p style="max-width:56ch;margin:0 auto 16px">Load the history file built from your monthly PM workbook — every property, 16 months of rent, repairs, fees and payouts, and the deposit ledger — or start fresh by adding properties one at a time.</p>
    <button class="btn primary" id="pmSeedBtn">Load workbook history (pm-seed.json)</button>
    <button class="btn" id="pmAddBtn">Add a property</button>
    <input type="file" id="pmSeedPick" accept="application/json" style="display:none"></div>`;
  v.appendChild(c);
  c.querySelector("#pmAddBtn").onclick = () => pmPropSheet(null);
  c.querySelector("#pmSeedBtn").onclick = () => c.querySelector("#pmSeedPick").click();
  c.querySelector("#pmSeedPick").onchange = e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => { try{ pmLoadSeed(JSON.parse(r.result)); }catch(err){ alert("That file isn't the PM history file. Choose pm-seed.json."); } };
    r.readAsText(f);
  };
}
function pmLoadSeed(seed){
  if(!seed || seed.kind !== "phd-pm-seed") throw new Error("not a seed");
  snapshot();
  const P2 = pmState();
  const have = new Set(P2.properties.map(p => p.id));
  seed.properties.forEach(p => { if(!have.has(p.id)) P2.properties.push(Object.assign({tenants:"", notes:""}, p)); });
  seed.months.forEach(r => {
    const k = pmKey(r.month, r.propertyId); if(P2.rows[k]) return;
    const row = Object.assign({repairItems:[], adjustments:[]}, r);
    // the workbook's numbers are the record: a blank cell there means zero, not "work it out"
    if(!row.detailOnly){ ["repairs","adminFee","pmFee"].forEach(f => { if(!has(row[f])) row[f] = 0; });
      if(!has(row.ownerPayout) && (has(row.rentReceived) || row.repairs || row.pmFee)) row.ownerPayout = 0; }
    P2.rows[k] = row;
  });
  seed.monthMeta.forEach(mm => { if(!P2.meta[mm.month]) P2.meta[mm.month] = {month:mm.month, deductions:mm.deductions || [], withdrawals:mm.withdrawals || [], closed:true, closedBy:"Imported from workbook", sheetTotals:mm.sheetTotals}; });
  seed.deposits.forEach(d => { if(!P2.deposits[d.propertyId]) P2.deposits[d.propertyId] = d; });
  S.ui.pmMonth = null;
  commit();
  toast(`Loaded ${seed.properties.length} properties and ${seed.monthMeta.length} months of history`, true);
}

/* ====================================================================
   MAGICDOOR PAYMENT IMPORT
   ==================================================================== */
const PM_IMPORT_FIELDS = [["skip","Skip"],["date","Date"],["amount","Amount"],["property","Property / address"],["tenant","Tenant"],["type","Type / description"]];
function pmGuessField(h){
  const x = String(h || "").toLowerCase();
  if(/date|paid on|posted/.test(x)) return "date";
  if(/amount|total|paid|payment/.test(x) && !/method|type|status/.test(x)) return "amount";
  if(/property|address|unit|building/.test(x)) return "property";
  if(/tenant|resident|payer|name|renter/.test(x)) return "tenant";
  if(/type|category|description|memo|charge|item|for/.test(x)) return "type";
  return "skip";
}
function pmClassify(t){
  const x = String(t || "").toLowerCase();
  if(/late/.test(x)) return "lateFee";
  if(/filter/.test(x)) return "filters";
  if(/applic/.test(x)) return "applications";
  if(/deposit/.test(x)) return "deposit";
  if(/reimb|utility|water|sewer|trash|pest/.test(x)) return "reimbursement";
  return "rent";
}
function pmImportSheet(m){
  const sh = $("#sheet");
  let rows = [], map = [], hasHeader = true, parsed = [];
  sh.innerHTML = `<div class="sheet-h"><h3>Import Magicdoor payments</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <p class="muted" style="font-size:13.3px;margin-top:0">Export the payments report from Magicdoor for ${monthLabel(m)} as CSV, then choose it or paste its rows. Each payment is matched to a property by address. Importing again replaces the earlier Magicdoor import for ${monthLabel(m)}, so nothing is counted twice.</p>
      <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn" id="mdFile">Choose CSV file</button><input type="file" id="mdPick" accept=".csv,text/csv" style="display:none"></div>
      <label class="fld"><span>…or paste rows</span><textarea id="mdText" rows="5" placeholder="Date, Property, Tenant, Amount, Type"></textarea></label>
      <button class="btn" id="mdRead">Read the columns</button>
      <div id="mdMap"></div>
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="mdGo" disabled>Import</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  $("#mdFile").onclick = () => $("#mdPick").click();
  $("#mdPick").onchange = e => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = () => { $("#mdText").value = r.result; read(); }; r.readAsText(f); };
  const read = () => {
    rows = parseTable($("#mdText").value);
    if(!rows.length) return toast("Nothing to read");
    const cols = Math.max(...rows.map(r => r.length));
    rows = rows.map(r => { const c = r.slice(); while(c.length < cols) c.push(""); return c; });
    map = rows[0].map(pmGuessField);
    hasHeader = map.filter(x => x !== "skip").length >= 2;
    if(!hasHeader) map = rows[0].map((_, i) => ["date","property","tenant","amount","type"][i] || "skip");
    draw();
  };
  $("#mdRead").onclick = read;
  const build = () => {
    const body = hasHeader ? rows.slice(1) : rows, col = f => map.indexOf(f), get = (r, f) => col(f) >= 0 ? String(r[col(f)] ?? "").trim() : "";
    return body.map((r, i) => {
      const amt = Number(get(r, "amount").replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
      if(!amt) return null;
      const propText = get(r, "property"), prop = pmMatchProperty(propText) || pmMatchProperty(get(r, "tenant"));
      const d = get(r, "date"), dt = d ? new Date(d) : null;
      return {i, date:dt && !isNaN(dt) ? dt.toISOString().slice(0,10) : "", amount:Math.round(amt * 100) / 100, propText, propId:prop ? prop.id : "",
              tenant:get(r, "tenant"), type:pmClassify(get(r, "type")), typeText:get(r, "type")};
    }).filter(Boolean);
  };
  const draw = () => {
    parsed = build();
    const props = pmState().properties.filter(p => !p.deleted).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
    const unmatched = parsed.filter(x => !x.propId).length;
    $("#mdMap").innerHTML = `<hr class="sep">
      <label class="switchbox" style="margin-bottom:10px"><input type="checkbox" id="mdHead" ${hasHeader ? "checked" : ""}> First row is a header</label>
      <div class="label" style="margin-bottom:8px">Match your columns</div>
      ${rows[0].map((h, i) => `<div class="map-r"><span class="muted">${esc(hasHeader ? (h || "Column " + (i + 1)) : "Column " + (i + 1))}</span><select data-mc="${i}">${PM_IMPORT_FIELDS.map(([v, l]) => `<option value="${v}" ${map[i] === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>`).join("")}
      <div class="label" style="margin:14px 0 8px">${parsed.length} payment${parsed.length === 1 ? "" : "s"}${unmatched ? ` · <span style="color:var(--gold)">${unmatched} need a property</span>` : " · all matched"}</div>
      <div class="md-list">${parsed.map((x, j) => `<div class="md-r${x.propId ? "" : " miss"}">
        <div><b class="num">${usd(cents(x.amount))}</b><span class="muted"> ${esc([x.date ? fdateS(x.date) : "", x.tenant, x.propText].filter(Boolean).join(" · "))}</span></div>
        <select data-mp="${j}"><option value="">Choose property…</option>${props.map(p => `<option value="${p.id}" ${p.id === x.propId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}<option value="__skip" ${x.propId === "__skip" ? "selected" : ""}>Skip this payment</option></select>
        <select data-mt="${j}">${[["rent","Rent"],["lateFee","Late fee"],["filters","Filter fee"],["applications","Application"],["reimbursement","Reimbursement"],["deposit","Deposit (not income)"]].map(([k, l]) => `<option value="${k}" ${x.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>`).join("")}</div>`;
    $("#mdHead").onchange = e => { hasHeader = e.target.checked; draw(); };
    $("#mdMap").querySelectorAll("[data-mc]").forEach(s => s.onchange = () => { map[+s.dataset.mc] = s.value; draw(); });
    $("#mdMap").querySelectorAll("[data-mp]").forEach(s => s.onchange = () => { parsed[+s.dataset.mp].propId = s.value; s.closest(".md-r").classList.toggle("miss", !s.value); upd(); });
    $("#mdMap").querySelectorAll("[data-mt]").forEach(s => s.onchange = () => { parsed[+s.dataset.mt].type = s.value; });
    upd();
  };
  const upd = () => { const ok = parsed.filter(x => x.propId && x.propId !== "__skip"); const go = $("#mdGo");
    go.disabled = !ok.length || parsed.some(x => !x.propId); go.textContent = parsed.some(x => !x.propId) ? "Match every payment first" : `Import ${ok.length} payment${ok.length === 1 ? "" : "s"}`; };
  $("#mdGo").onclick = () => {
    const ok = parsed.filter(x => x.propId && x.propId !== "__skip");
    snapshot();
    const byProp = {};
    ok.forEach(x => (byProp[x.propId] = byProp[x.propId] || []).push(x));
    // clear the previous Magicdoor import for this month first, so re-importing never double counts
    Object.values(pmState().rows).filter(r => r.month === m && (r.payments || []).some(p => p.via === "Magicdoor")).forEach(r => {
      const old = r.payments.filter(p => p.via === "Magicdoor");
      old.forEach(p => { const k = p.type || "rent"; if(k === "rent") r.rentReceived = Math.round(((r.rentReceived || 0) - p.amount) * 100) / 100;
        else if(k !== "deposit") r[k] = Math.round(((r[k] || 0) - p.amount) * 100) / 100; });
      r.payments = r.payments.filter(p => p.via !== "Magicdoor");
    });
    Object.entries(byProp).forEach(([pid, list]) => {
      const r = pmEnsureRow(m, pid);
      r.payments = (r.payments || []).concat(list.map(x => ({date:x.date, name:x.tenant, via:"Magicdoor", amount:x.amount, type:x.type})));
      list.forEach(x => { if(x.type === "rent") r.rentReceived = Math.round(((r.rentReceived || 0) + x.amount) * 100) / 100;
        else if(x.type !== "deposit") r[x.type] = Math.round(((r[x.type] || 0) + x.amount) * 100) / 100; });
      pmTouch(r);
    });
    closeSheet(); commit(); toast(`Imported ${ok.length} payments into ${Object.keys(byProp).length} properties`, true);
  };
  openPanel();
}

/* ====================================================================
   EXPORTS — month CSV and owner statements
   ==================================================================== */
function pmExportCsv(m){
  const head = ["Property","Owner","Rent due","Rent received","Repairs","Admin fee","PM fee","Leasing fee","Other owner income","Adjustments","Owner payout","Applications","Late fees","Reimbursements","Filters","Notes"];
  const out = [head];
  pmMonthRows(m).forEach(({row, prop}) => { if(row.detailOnly) return; const c = pmCalc(row, prop);
    out.push([prop.address || prop.name, ownerLabel(ownerById(prop.ownerId)), c.dueC, c.recv, c.repairsC, c.adminC, c.pmFeeC, c.leasingC, c.otherC, c.adjC, c.payoutC, ...PM_EXTRA.map(([k]) => nz(row[k])), row.notes || ""]
      .map((x, i) => i >= 2 && i <= 14 ? (x / 100).toFixed(2) : x)); });
  download(`PHD PM ${monthLabel(m)}.csv`, out.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(",")).join("\n"));
}
function pmStatementSheet(m){
  const rows = pmMonthRows(m).filter(x => !x.row.detailOnly);
  const groups = {};
  rows.forEach(({prop}) => { const k = prop.ownerId || "p:" + prop.id; (groups[k] = groups[k] || []).push(prop.id); });
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>Owner statements · ${monthLabel(m)}</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="muted" style="font-size:13.3px;margin-top:0">One statement per owner — owners with several properties get them together. “All statements” makes one PDF with each owner starting on a new page.</p>
      <div class="md-list">${Object.entries(groups).map(([k, ids]) => { const o = k.startsWith("p:") ? null : ownerById(k);
        const total = ids.reduce((a, id) => a + pmCalc(pmRow(m, id), pmProp(id)).payoutC, 0);
        return `<div class="md-r"><div><b>${esc(o ? ownerLabel(o) : pmProp(ids[0]).name)}</b><span class="muted"> ${o ? ids.map(id => esc(pmProp(id).name)).join(", ") : "no owner on file"}</span></div><span class="num">${usd(total)}</span><button class="btn sm" data-g="${esc(k)}">PDF</button></div>`; }).join("")}</div></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Close</button><button class="btn" id="stMail">Email as Gmail drafts</button><button class="btn primary" id="stAll">All statements</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  sh.querySelectorAll("[data-g]").forEach(b => b.onclick = () => printDoc(pmStatementHTML(m, groups[b.dataset.g])));
  $("#stAll").onclick = () => printDoc(pmStatementHTML(m, null, Object.values(groups)));
  $("#stMail").onclick = () => pmStatementMailSheet(m);
  openPanel();
}
function pmStatementHTML(m, ids, groupsList){
  const groups = groupsList || [ids];
  const from = "PHD Properties";
  const page = (gids, first) => {
    const props = gids.map(pmProp).filter(Boolean);
    const o = props[0] && props[0].ownerId ? ownerById(props[0].ownerId) : null;
    const addr = o ? ownerAddressLines(o) : [];
    let totalC = 0;
    const blocks = props.map(p => {
      const row = pmRow(m, p.id); if(!row) return "";
      const c = pmCalc(row, p); totalC += c.payoutC;
      const items = (row.repairItems || []);
      return `<h3 class="unit">${esc(p.name)}</h3>
        <table class="zebra"><thead><tr><th style="width:92px">Date</th><th>Description</th><th style="width:150px">Vendor</th><th class="r" style="width:110px">Amount</th></tr></thead>
        <tbody>
          <tr><td class="dt"></td><td>Rent received${row.rentDue && cents(row.rentDue) !== c.recv ? ` <span class="sub">of ${usd(cents(row.rentDue))} due</span>` : ""}</td><td class="vn"></td><td class="r">${usd(c.recv)}</td></tr>
          ${items.map(it => { const L = stmtLine(it); return `<tr><td class="dt">${it.date ? docShort(it.date) : ""}</td><td>${esc(L.title)}${L.detail ? `<br><span class="sub">${esc(L.detail)}</span>` : ""}${L.link ? ` <a href="${esc(L.link)}">invoice</a>` : ""}</td><td class="vn">${esc(it.vendor || "")}</td><td class="r">−${usd(cents(it.amount))}</td></tr>`; }).join("")}
          ${!items.length && c.repairsC ? `<tr><td class="dt"></td><td>Repairs</td><td class="vn"></td><td class="r">−${usd(c.repairsC)}</td></tr>` : ""}
          ${c.otherC ? `<tr><td class="dt"></td><td>Other income</td><td class="vn"></td><td class="r">${usd(c.otherC)}</td></tr>` : ""}
          ${(row.adjustments || []).map(a => `<tr><td class="dt"></td><td>${esc(a.note || "Adjustment")}</td><td class="vn"></td><td class="r">${cents(a.amount) < 0 ? "−" : ""}${usd(Math.abs(cents(a.amount)))}</td></tr>`).join("")}
        </tbody>
        <tbody class="totals">
          ${c.adminC ? `<tr><td></td><td colspan="2">Admin fee on repairs</td><td class="r">−${usd(c.adminC)}</td></tr>` : ""}
          <tr><td></td><td colspan="2">Property management fee · ${esc(feeRuleText(p.feeRule))}</td><td class="r">−${usd(c.pmFeeC)}</td></tr>
          ${c.leasingC ? `<tr><td></td><td colspan="2">Leasing fee</td><td class="r">−${usd(c.leasingC)}</td></tr>` : ""}
          <tr class="tot"><td></td><td colspan="2">Owner payout · ${esc(p.name)}</td><td class="r">${usd(c.payoutC)}</td></tr>
        </tbody></table>`;
    }).join("");
    return `<section class="${first ? "" : "pgb"}">
      <div class="head"><div>${docMark(from)}<h1>Owner Statement</h1><div class="prop">${monthLabel(m)}</div></div>
        <div class="right"><b>${docLong(new Date().toISOString().slice(0,10))}</b>${o ? `Prepared for ${esc(ownerLabel(o))}` : ""}</div></div>
      <div class="parties">
        <div><div class="pk">Owner</div><div class="pv">${o ? `<b>${esc(o.name || o.company)}</b>${o.name && o.company ? `<br>${esc(o.company)}` : ""}${addr.map(l => `<br>${esc(l)}`).join("")}${o.email ? `<br><span class="m">${esc(o.email)}</span>` : ""}` : `<span class="m">No owner on file</span>`}</div></div>
        <div><div class="pk">Propert${props.length === 1 ? "y" : "ies"}</div><div class="pv">${props.map(p => `<b>${esc(p.name)}</b>`).join("<br>")}</div></div>
        <div><div class="pk">Paid to you</div><div class="pv"><b class="mono" style="font-size:18px">${usd(totalC)}</b><br><span class="m">for ${monthLabel(m)}</span></div></div>
      </div>
      <h2>Activity</h2>${blocks}
      <div class="terms">Questions about any line are welcome — receipts are on file for every repair.</div></section>`;
  };
  const title = groups.length === 1 ? "Owner Statement" : "Owner Statements";
  return tidyBreaks(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)} — ${monthLabel(m)}</title>
    <style>${docCSS(`${from} · ${title} · ${monthLabel(m)}`, false, 1)} section.pgb{break-before:page;page-break-before:always}</style></head><body>
    ${groups.map((g, i) => page(g, i === 0)).join("")}</body></html>`);
}

/* =====================================================================
   PROPERTY MANAGEMENT — overview board, action center, property page,
   and settings. Everything here reads from pmState() and PMCore.
   ===================================================================== */
const PM_STAT = {
  paid:{label:"Paid", cls:"green"}, partial:{label:"Partial", cls:"gold"}, late:{label:"Late", cls:"red"},
  due:{label:"Due", cls:"acc"}, upcoming:{label:"Upcoming", cls:"grey"}, none:{label:"Not started", cls:"grey"},
  nodue:{label:"No rent due", cls:"grey"}, vacant:{label:"Vacant", cls:"grey"}, inactive:{label:"—", cls:"grey"}
};
const PM_LEVEL = {urgent:{label:"Urgent", cls:"red"}, warn:{label:"Needs action", cls:"gold"}, info:{label:"Heads-up", cls:"acc"}};

function pmOpenProperty(id){ S.ui.pmPropId = id; go("pmProperty"); }

/* ---------- alert actions, snooze, dismiss ---------- */
function pmAlertAct(a){
  if(a.action === "startMonth") return pmStartMonth(a.month);
  if(a.action === "openMonth"){ S.ui.pmMonth = a.month; return go("pmMonth"); }
  if(a.action === "openRow"){ S.ui.pmMonth = a.month; go("pmMonth"); return setTimeout(() => pmRowSheet(a.month, a.propId), 30); }
  if(a.action === "markPaid") return pmMarkPaidSheet(a.month, [a.propId]);
  if(a.action === "openProp") return pmOpenProperty(a.propId);
  if(a.action === "openDeposit"){ go("pmDeposits"); return setTimeout(() => pmDepositSheet(a.propId), 30); }
  if(a.action === "openInbox"){ go("inbox"); return inboxRefresh(); }
  if(a.action === "openMd") return go("pmMd");
  if(a.action === "openProps"){ S.ui.pmPropF = "active"; return go("pmProps"); }
}
const PM_ACT_LABEL = {openProps:"Assign owners", startMonth:"Start month", openMonth:"Open month", openRow:"Open", markPaid:"Mark sent", openProp:"Open property", openDeposit:"Open deposit", openInbox:"Review"};
function pmAlertSet(key, st){
  snapshot();
  const A = pmAlertState(), today = todayISO();
  // tidy: forget decisions older than 4 months
  Object.keys(A).forEach(k => { if(A[k].at && PMCore.dayNum(today) - PMCore.dayNum(A[k].at.slice(0, 10)) > 120) delete A[k]; });
  if(st) A[key] = Object.assign({at:new Date().toISOString(), by:(typeof Cloud !== "undefined" && Cloud.email) || ""}, st); else delete A[key];
  commit();
}
function pmAlertRowHTML(a){
  const lv = PM_LEVEL[a.level];
  return `<div class="al-r al-${a.level}" data-ak="${esc(a.key)}">
    <span class="al-dot"></span>
    <div class="al-txt"><b>${esc(a.title)}</b><span>${esc(a.detail || "")}</span></div>
    <div class="al-btns">
      <button class="btn sm ${a.action === "markPaid" || a.action === "startMonth" ? "primary" : ""}" data-aact="${esc(a.key)}">${PM_ACT_LABEL[a.action] || "Open"}</button>
      <div class="al-more"><button class="btn sm ghost" data-amenu="${esc(a.key)}" title="Snooze or dismiss">⋯</button>
        <div class="al-menu"><button data-asnz="1">Snooze until tomorrow</button><button data-asnz="3">Snooze 3 days</button><button data-asnz="7">Snooze a week</button><button data-adis>Dismiss</button></div></div>
    </div></div>`;
}
function pmWireAlerts(root, list){
  const find = k => list.find(a => a.key === k);
  root.querySelectorAll("[data-aact]").forEach(b => b.onclick = e => { e.stopPropagation(); const a = find(b.dataset.aact); if(a) pmAlertAct(a); });
  root.querySelectorAll("[data-amenu]").forEach(b => b.onclick = e => { e.stopPropagation(); const m = b.nextElementSibling;
    root.querySelectorAll(".al-menu.on").forEach(x => { if(x !== m) x.classList.remove("on"); }); m.classList.toggle("on"); });
  root.querySelectorAll(".al-menu [data-asnz]").forEach(b => b.onclick = e => { e.stopPropagation(); const key = b.closest(".al-r").dataset.ak;
    const until = PMCore.isoOf(PMCore.dayNum(todayISO()) + Number(b.dataset.asnz)); pmAlertSet(key, {state:"snoozed", until}); toast(`Snoozed until ${fdateS(until)}`, true); });
  root.querySelectorAll(".al-menu [data-adis]").forEach(b => b.onclick = e => { e.stopPropagation(); const key = b.closest(".al-r").dataset.ak;
    const note = prompt("Dismiss this alert — add a short reason (optional)") ; if(note === null) return; pmAlertSet(key, {state:"dismissed", note:note.trim()}); toast("Dismissed", true); });
}
document.addEventListener("click", () => document.querySelectorAll(".al-menu.on").forEach(x => x.classList.remove("on")));

/* ====================================================================
   OVERVIEW — every property at a glance, and what needs doing
   ==================================================================== */
function pgPmHome(){
  const P2 = pmState();
  if(!P2.properties.length) return pmEmpty();
  if(pmAutoStart()) return;                       // started the new month; commit() re-renders
  const today = todayISO(), m = thisMonth(), set = pmSettings();
  const rowsM = pmMonthRows(m).filter(x => !x.row.detailOnly);
  const monthOn = rowsM.length ? m : (pmMonths().slice(-1)[0] || m);
  const props = pmLiveProps().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  const alerts = pmAlerts();
  $("#pgCrumb").textContent = "Property management";
  $("#pgTitle").textContent = "Overview";
  $("#pgSub").textContent = new Date().toLocaleDateString("en-US", {weekday:"long", month:"long", day:"numeric"}) + (alerts.length ? ` · ${alerts.filter(a => a.level !== "info").length} things need action` : " · nothing needs action");
  actions([["Add property", () => pmPropSheet(null), "ghost"], ["Open " + monthLabel(monthOn), () => { S.ui.pmMonth = monthOn; go("pmMonth"); }, "primary"]]);
  const v = $("#view");

  /* ---- numbers that matter today ---- */
  const leased = props.filter(p => p.status === "active");
  const st = {}; props.forEach(p => st[p.id] = pmLiveStatus(monthOn, p));
  let dueC = 0, recvC = 0, lateC = 0, lateN = 0, payN = 0, payC = 0, sentN = 0, payTot = 0;
  props.forEach(p => { const r = pmRow(monthOn, p.id); if(!r || r.detailOnly) return; const c = pmCalc(r, p);
    dueC += c.dueC; recvC += Math.min(c.recv, c.dueC || c.recv);
    if(st[p.id] === "late"){ const L = monthOn === thisMonth() && !c.recv ? pmMdLease(p) : null; lateN++; lateC += L && L.balance > 0 ? cents(L.balance) : c.dueC - c.recv; }
    if(c.recv > 0 && c.payoutC > 0){ payTot++; if(r.paidOut || r.locked) sentN++; else { payN++; payC += c.payoutC; } } });
  const ending = leased.filter(p => p.leaseEnd && PMCore.dayNum(p.leaseEnd) - PMCore.dayNum(today) <= set.renewalDays && PMCore.dayNum(p.leaseEnd) >= PMCore.dayNum(today) - 31).length;
  const vac = props.filter(p => p.status === "marketing" || p.status === "vacant").length;
  const pct = dueC ? Math.round(recvC / dueC * 100) : 0;
  const tiles = elm("div","card pf-hero pm-kpi");
  tiles.innerHTML = `
    <div class="pf-cell"><div class="label">Doors</div><div class="pf-v">${leased.length}<span class="pm-of"> leased</span></div><div class="pf-note">${vac ? `${vac} vacant or marketing` : "Fully leased"}</div></div>
    <div class="pf-cell"><div class="label">Rent · ${monthLabel(monthOn).split(" ")[0]}</div><div class="pf-v">${pct}%</div><div class="pm-meter"><i style="width:${pct}%"></i></div><div class="pf-note">${usd(recvC)} of ${usd(dueC)}</div></div>
    <div class="pf-cell" data-goto="late"><div class="label">Late</div><div class="pf-v"${lateN ? ' style="color:var(--red)"' : ""}>${lateN}</div><div class="pf-note">${lateN ? usd(lateC) + " outstanding" : "Nobody late"}</div></div>
    <div class="pf-cell" data-goto="payout"><div class="label">Payouts to send</div><div class="pf-v"${payN ? ' style="color:var(--gold)"' : ""}>${payN}</div><div class="pf-note">${payN ? usd(payC) : payTot ? `All ${sentN} sent` : "None yet"}</div></div>
    <div class="pf-cell" data-goto="lease"><div class="label">Leases ending</div><div class="pf-v">${ending}</div><div class="pf-note">next ${set.renewalDays} days</div></div>`;
  v.appendChild(tiles);
  tiles.querySelectorAll("[data-goto]").forEach(c => { c.style.cursor = "pointer"; c.onclick = () => { S.ui.pmBoardF = c.dataset.goto; render(); setTimeout(() => { const b = $("#pmBoard"); if(b) b.scrollIntoView({behavior:"smooth", block:"start"}); }, 30); }; });

  /* ---- needs action + month progress ---- */
  const two = elm("div","pm-home2");
  const ac = elm("div","card");
  const top = alerts.slice(0, 7);
  ac.innerHTML = `<div class="card-h"><h3>Needs action</h3>${alerts.length ? `<span class="tag ${alerts.some(a => a.level === "urgent") ? "red" : "gold"}" style="margin-left:6px">${alerts.length}</span>` : ""}
      <button class="btn sm ghost" id="seeAll" style="margin-left:auto">Action center ${icon("arrow")}</button></div>
    <div class="al-list">${top.length ? top.map(pmAlertRowHTML).join("") : `<div class="al-zero">${icon("check")}<b>You're all caught up</b><span>New alerts appear here as soon as something needs a person.</span></div>`}
    ${alerts.length > top.length ? `<button class="al-moreall" id="seeAll2">See all ${alerts.length} →</button>` : ""}</div>`;
  two.appendChild(ac);
  const meta = P2.meta[monthOn] || {};
  const steps = [
    ["Month started", rowsM.length > 0 || pmMonthRows(monthOn).length > 0, meta.startedAt ? fdateS(meta.startedAt.slice(0, 10)) : ""],
    ["Rent collected", dueC > 0 && recvC >= dueC, `${pct}%`],
    ["Payouts sent", payTot > 0 && payN === 0, payTot ? `${sentN} of ${payTot}` : "—"],
    ["Month closed", !!meta.closed, meta.closed && meta.closedAt ? fdateS(meta.closedAt.slice(0, 10)) : ""]];
  const mp = elm("div","card");
  mp.innerHTML = `<div class="card-h"><h3>${monthLabel(monthOn)}</h3><button class="btn sm ghost" id="openM" style="margin-left:auto">Month close ${icon("arrow")}</button></div>
    <div class="card-b"><div class="pm-steps">${steps.map(([l, done, sub], i) => `<div class="pm-step${done ? " done" : ""}"><span class="n">${done ? "✓" : i + 1}</span><div><b>${l}</b><span>${esc(sub || "")}</span></div></div>`).join("")}</div>
      <table class="pm-sum" style="margin-top:14px">
        <tr><td>PHD income so far</td><td class="r num">${usd(pmMonthRoll(monthOn).netC)}</td></tr>
        <tr><td>Repairs billed to owners</td><td class="r num">${usd(pmMonthRoll(monthOn).repairsC)}</td></tr>
        <tr><td>Paid / to pay owners</td><td class="r num">${usd(pmMonthRoll(monthOn).payoutC)}</td></tr></table></div>`;
  two.appendChild(mp);
  v.appendChild(two);
  pmWireAlerts(ac, alerts);
  [ac.querySelector("#seeAll"), ac.querySelector("#seeAll2")].forEach(b => b && (b.onclick = () => go("pmAlerts")));
  mp.querySelector("#openM").onclick = () => { S.ui.pmMonth = monthOn; go("pmMonth"); };

  /* ---- the board ---- */
  const alertBy = {}; alerts.forEach(a => { if(a.propId) (alertBy[a.propId] = alertBy[a.propId] || []).push(a); });
  const f = S.ui.pmBoardF || "all", q = (S.ui.pmBoardQ || "").toLowerCase(), view = S.ui.pmBoardV || "cards";
  const leaseSoon = p => p.leaseEnd && PMCore.dayNum(p.leaseEnd) - PMCore.dayNum(today) <= set.renewalDays && PMCore.dayNum(p.leaseEnd) - PMCore.dayNum(today) >= -31;
  const payDue = p => { const r = pmRow(monthOn, p.id); if(!r || r.locked || r.paidOut) return false; const c = pmCalc(r, p); return c.recv > 0 && c.payoutC > 0; };
  const FILT = [["all","All", () => true], ["late","Late", p => st[p.id] === "late"], ["partial","Partial", p => st[p.id] === "partial"],
    ["payout","Payout to send", payDue], ["lease","Lease ending", leaseSoon], ["vacant","Vacant / marketing", p => p.status !== "active"], ["alerts","With alerts", p => (alertBy[p.id] || []).length]];
  const shown = props.filter(p => (FILT.find(x => x[0] === f) || FILT[0])[2](p) && (!q || `${p.name} ${p.address} ${p.tenants || ""} ${ownerLabel(ownerById(p.ownerId))}`.toLowerCase().includes(q)));
  const board = elm("div"); board.id = "pmBoard"; board.style.marginTop = "18px";
  board.innerHTML = `<div class="sc-bar">
      <div class="sc-seg">${FILT.map(([k, l, fn]) => { const n = props.filter(fn).length; return k === "all" || n ? `<button data-bf="${k}" class="${f === k ? "on" : ""}">${l} <span>${n}</span></button>` : ""; }).join("")}</div>
      <div class="sc-q" style="display:flex;gap:8px"><input type="text" id="pbQ" placeholder="Find a property, tenant or owner…" value="${esc(S.ui.pmBoardQ || "")}">
        <div class="seg-ctl">${[["cards","Cards"],["table","Table"],["history","Rent history"]].map(([k, l]) => `<button data-bv="${k}" aria-pressed="${view === k}">${l}</button>`).join("")}</div></div></div>`;
  v.appendChild(board);
  board.querySelectorAll("[data-bf]").forEach(b => b.onclick = () => { S.ui.pmBoardF = b.dataset.bf; render(); setTimeout(() => $("#pmBoard") && $("#pmBoard").scrollIntoView({block:"start"}), 0); });
  board.querySelectorAll("[data-bv]").forEach(b => b.onclick = () => { S.ui.pmBoardV = b.dataset.bv; persistUi(); render(); setTimeout(() => $("#pmBoard") && $("#pmBoard").scrollIntoView({block:"start"}), 0); });
  const qi = board.querySelector("#pbQ");
  qi.oninput = () => { S.ui.pmBoardQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#pbQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); n.scrollIntoView({block:"center"}); } }, 160); };

  if(!shown.length){ board.appendChild(elm("div","card",`<div class="empty"><b>Nothing here</b><p>No properties match.</p></div>`)); return; }

  if(view === "cards"){
    const grid = elm("div","pm-cards");
    shown.forEach(p => {
      const r = pmRow(monthOn, p.id), c = r && !r.detailOnly ? pmCalc(r, p) : null, s1 = PM_STAT[st[p.id]] || PM_STAT.none;
      const al = alertBy[p.id] || [], own = ownerLabel(ownerById(p.ownerId));
      const left = p.leaseEnd ? PMCore.dayNum(p.leaseEnd) - PMCore.dayNum(today) : null;
      const po = r && (r.paidOut || r.locked) ? `<span class="tag green">Paid out</span>` : c && c.recv > 0 && c.payoutC > 0 ? `<span class="tag gold">Payout ${usd0(c.payoutC)}</span>` : "";
      const card = elm("button","card pm-card st-" + st[p.id]);
      card.innerHTML = `<div class="pmc-h"><b>${esc(p.name)}</b>${al.length ? `<span class="pmc-al ${al.some(a => a.level === "urgent") ? "u" : al.some(a => a.level === "warn") ? "w" : ""}" title="${esc(al.map(a => a.title).join("\n"))}">${al.length}</span>` : ""}</div>
        <div class="pmc-s">${esc(own || "No owner on file")}${p.tenants ? " · " + esc(p.tenants) : ""}</div>
        <div class="pmc-m"><span class="num">${p.rent ? usd0(cents(p.rent)) : "—"}<small>/mo</small></span><span class="tag ${s1.cls}">${s1.label}${st[p.id] === "partial" && c ? " " + usd0(c.recv) : ""}</span>${po}</div>
        <div class="pmc-f">${p.status !== "active" ? esc(PM_STATUS[p.status]) + (p.statusSince ? ` since ${esc(fdateS(p.statusSince))}` : "") : left == null ? `<span class="muted">No lease end on file</span>` : left < 0 ? `<span style="color:var(--gold)">Lease ended ${esc(fdateS(p.leaseEnd))}</span>` : `Lease ends ${esc(fdateS(p.leaseEnd))}${left <= set.renewalDays ? ` <span style="color:var(--gold)">· ${left}d</span>` : ""}`}</div>`;
      card.dataset.pmid = p.id; card.onclick = () => pmOpenProperty(p.id);
      grid.appendChild(card);
    });
    board.appendChild(grid);
  } else if(view === "table"){
    const card = elm("div","card"), t = elm("table","tbl");
    t.innerHTML = `<thead><tr><th>Property</th><th>Owner</th><th>Tenants</th><th class="r">Rent</th><th>${monthShort(monthOn)}</th><th class="r">Received</th><th class="r">Payout</th><th>Paid out</th><th>Lease ends</th><th>Alerts</th></tr></thead>
      <tbody>${shown.map(p => { const r = pmRow(monthOn, p.id), c = r && !r.detailOnly ? pmCalc(r, p) : null, s1 = PM_STAT[st[p.id]] || PM_STAT.none, al = alertBy[p.id] || [];
        return `<tr data-pp="${p.id}" style="cursor:pointer"><td><div class="item-t">${esc(p.name)}</div></td><td>${esc(ownerLabel(ownerById(p.ownerId)) || "—")}</td><td class="muted" style="font-size:12.5px">${esc(p.tenants || "—")}</td>
          <td class="r num">${p.rent ? usd(cents(p.rent)) : "—"}</td><td><span class="tag ${s1.cls}">${s1.label}</span></td><td class="r num">${c && c.recv ? usd(c.recv) : "—"}</td><td class="r num">${c && c.recv ? usd(c.payoutC) : "—"}</td>
          <td>${r && r.paidOut ? `<span class="tag green">${esc(fdateS(r.paidOut.date))}</span>` : r && r.locked ? `<span class="muted">—</span>` : c && c.recv > 0 && c.payoutC > 0 ? `<span class="tag gold">To send</span>` : "—"}</td>
          <td>${p.leaseEnd ? esc(fdateS(p.leaseEnd)) + " '" + p.leaseEnd.slice(2, 4) : "—"}</td><td>${al.length ? `<span class="tag ${al.some(a => a.level === "urgent") ? "red" : "gold"}">${al.length}</span>` : ""}</td></tr>`; }).join("")}</tbody>`;
    t.querySelectorAll("[data-pp]").forEach(tr => tr.onclick = () => pmOpenProperty(tr.dataset.pp));
    const w = elm("div","tbl-wrap"); w.appendChild(t); card.appendChild(w); board.appendChild(card);
  } else {
    const months = []; for(let i = 11; i >= 0; i--) months.push(monthAdd(thisMonth(), -i));
    const card = elm("div","card pm-heat"), t = elm("table","tbl");
    t.innerHTML = `<thead><tr><th>Property</th>${months.map(mm => `<th class="hm-h">${monthShort(mm)}</th>`).join("")}</tr></thead>
      <tbody>${shown.map(p => `<tr><td><button class="linkish" data-pp="${p.id}">${esc(p.name)}</button></td>${months.map(mm => {
          const s2 = pmLiveStatus(mm, p), r = pmRow(mm, p.id), c = r && !r.detailOnly ? pmCalc(r, p) : null;
          return `<td class="hm hm-${s2}" data-hm="${mm}|${p.id}" title="${esc(monthLabel(mm))}: ${esc((PM_STAT[s2] || PM_STAT.none).label)}${c && c.recv ? " · " + usd(c.recv) + " received · payout " + usd(c.payoutC) : ""}"><i></i></td>`; }).join("")}</tr>`).join("")}</tbody>`;
    t.querySelectorAll("[data-pp]").forEach(b => b.onclick = () => pmOpenProperty(b.dataset.pp));
    t.querySelectorAll("[data-hm]").forEach(td => td.onclick = () => { const [mm, pid] = td.dataset.hm.split("|"); if(pmRow(mm, pid)) pmRowSheet(mm, pid); });
    const w = elm("div","tbl-wrap"); w.appendChild(t); card.appendChild(w);
    card.appendChild(elm("div","hm-legend", ["paid","partial","late","due","vacant","none"].map(k => `<span><i class="hm-${k}"></i>${PM_STAT[k].label}</span>`).join("")));
    board.appendChild(card);
  }
}

/* ====================================================================
   ACTION CENTER
   ==================================================================== */
function pgPmAlerts(){
  const P2 = pmState(); if(!P2.properties.length) return pmEmpty();
  const all = pmAlerts();
  const f = S.ui.pmAlF || "all";
  const types = [["all","All"],["late","Rent late"],["short","Rent short"],["payout","Payouts"],["owes","Owner owes"],["lease","Leases"],["deposit","Deposits"],["vacant","Vacancy"],["start","Month-end"],["mismatch","Payout check"],["setup","Setup"],["inbox","Receipts"]];
  const typeOf = a => (a.type === "start" || a.type === "close") ? "start" : a.type;
  actions([["Settings", () => go("pmSettings"), "ghost"]]);
  $("#pgSub").textContent = all.length ? `${all.filter(a => a.level === "urgent").length} urgent · ${all.filter(a => a.level === "warn").length} need action · ${all.filter(a => a.level === "info").length} heads-up — also emailed to the team each morning` : "Nothing needs attention right now";
  const v = $("#view");
  const bar = elm("div","sc-bar");
  bar.innerHTML = `<div class="sc-seg">${types.map(([k, l]) => { const n = k === "all" ? all.length : all.filter(a => typeOf(a) === k).length; return k === "all" || n ? `<button data-af="${k}" class="${f === k ? "on" : ""}">${l} <span>${n}</span></button>` : ""; }).join("")}</div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-af]").forEach(b => b.onclick = () => { S.ui.pmAlF = b.dataset.af; render(); });
  const list = all.filter(a => f === "all" || typeOf(a) === f);
  ["urgent","warn","info"].forEach(lv => {
    const L = list.filter(a => a.level === lv); if(!L.length) return;
    const c = elm("div","card"); c.style.marginBottom = "14px";
    c.innerHTML = `<div class="card-h"><span class="al-dot al-${lv}" style="position:static"></span><h3>${PM_LEVEL[lv].label}</h3><span class="muted" style="margin-left:auto;font-size:12px">${L.length}</span></div><div class="al-list">${L.map(pmAlertRowHTML).join("")}</div>`;
    pmWireAlerts(c, L); v.appendChild(c);
  });
  if(!list.length) v.appendChild(elm("div","card",`<div class="empty"><b>All caught up</b><p>Rent, payouts, leases, deposits and month-end are all on track.</p></div>`));
  // snoozed & dismissed
  const A = pmAlertState(), held = Object.entries(A).filter(([, s]) => s.state === "dismissed" || (s.state === "snoozed" && s.until > todayISO()));
  if(held.length){
    const c = elm("details","card pm-held");
    c.innerHTML = `<summary class="card-h"><h3>Snoozed &amp; dismissed</h3><span class="muted" style="margin-left:auto;font-size:12px">${held.length}</span></summary>
      <div class="al-list">${held.map(([k, s]) => `<div class="al-r"><div class="al-txt"><b>${esc(pmAlertLabel(k))}</b><span>${s.state === "snoozed" ? "Snoozed until " + esc(fdateS(s.until)) : "Dismissed"}${s.by ? " by " + esc(cloudWhoSafe(s.by)) : ""}${s.note ? " — " + esc(s.note) : ""}</span></div>
        <div class="al-btns"><button class="btn sm ghost" data-unhold="${esc(k)}">Restore</button></div></div>`).join("")}</div>`;
    c.querySelectorAll("[data-unhold]").forEach(b => b.onclick = () => pmAlertSet(b.dataset.unhold, null));
    v.appendChild(c);
  }
}
const cloudWhoSafe = e => (typeof cloudWho === "function" && typeof Cloud !== "undefined" && Cloud.ready) ? cloudWho(e) : e;
function pmAlertLabel(k){
  const [t, pid, m] = k.split("|"), p = pmProp(pid);
  const what = {late:"Rent late", short:"Rent short", payout:"Owner payout", owes:"Owner owes", renew:"Lease renewal", expired:"Lease ended", vacant:"Vacancy", owner:"No owner", fee:"Fee rule", deposit:"Deposit return", start:"Start month", close:"Close month", mismatch:"Payout check", inbox:"Receipts waiting"}[t] || t;
  return `${what}${p ? " · " + p.name : ""}${m && /^\d{4}-\d{2}$/.test(m) ? " · " + monthLabel(m) : (t === "start" || t === "close") && pid ? " · " + monthLabel(pid) : ""}`;
}

/* ====================================================================
   ONE PROPERTY — opens on this month; facts once; history in tabs
   ==================================================================== */
const pmDY = iso => iso ? fdateS(iso) + " '" + iso.slice(2, 4) : "?";
const pmTel = ph => `<a href="tel:${esc(String(ph).replace(/[^\d+]/g, ""))}">${esc(ph)}</a>`;
const pmMail = em => `<a href="mailto:${esc(em)}">${esc(em)}</a>`;
function pgPmProperty(){
  const p = pmProp(S.ui.pmPropId);
  if(!p) return go("pmProps");
  const today = todayISO(), curM = thisMonth(), set = pmSettings(), o = ownerById(p.ownerId);
  const months = pmMonths().filter(m => pmRow(m, p.id) && !pmRow(m, p.id).detailOnly).reverse();
  if(S.ui.pmPropMFor !== p.id){ S.ui.pmPropMFor = p.id; S.ui.pmPropM = pmRow(curM, p.id) || !months.length ? curM : months[0]; }
  const selM = S.ui.pmPropM;
  const md = typeof mdReady === "function" && mdReady() ? mdFor(p.id) : null, L = md && md.lease, bldg = !!(L && L.combined);
  $("#pgCrumb").textContent = "Properties"; $("#pgTitle").textContent = p.name; $("#pgSub").textContent = p.address && p.address !== p.name ? p.address : "";
  actions([["All properties", () => go("pmProps"), "ghost"], ["Statement", () => printDoc(pmStatementHTML(selM, [p.id]))], ["Email statement", () => pmRow(selM, p.id) ? stmtEmailSheet(selM, p.id) : toast(`No ${monthLabel(selM)} statement for this property`)], ["Edit property", () => pmPropSheet(p.id)]]);
  const v = $("#view");

  // what needs doing, first
  const al = pmAlerts().filter(a => a.propId === p.id);
  if(al.length){ const c = elm("div","card pp-alerts"); c.innerHTML = `<div class="al-list">${al.map(pmAlertRowHTML).join("")}</div>`; pmWireAlerts(c, al);
    al.forEach(a => { if(a.action === "openProp"){ const b = c.querySelector(`[data-aact="${CSS.escape(a.key)}"]`); if(b) b.remove(); } });   // already on this page
    v.appendChild(c); }

  const grid = elm("div","pp-grid"); v.appendChild(grid);

  /* ---------- the month (this month by default) ---------- */
  const mc = elm("div","card pp-month"); grid.appendChild(mc);
  const r = pmRow(selM, p.id), closed = !!(pmState().meta[selM] || {}).closed;
  const stOf = mm => pmLiveStatus(mm, p);
  const st = stOf(selM), stat = PM_STAT[st] === PM_STAT.paid && !(r && PMCore.has(r.rentReceived)) ? {label:"Paid in MagicDoor", cls:"green"} : PM_STAT[st] || PM_STAT.none;
  const prevM = PMCore.monthAdd(selM, -1), nextM = PMCore.monthAdd(selM, 1);
  const canPrev = months.some(m => m < selM), canNext = nextM <= curM || months.some(m => m > selM);
  let body = "";
  if(!r || r.detailOnly){
    body = `<div class="pp-empty">${selM === curM ? `${monthLabel(selM)} hasn't been started for this property.` : `Nothing recorded for ${monthLabel(selM)}.`}
      <button class="btn sm" id="ppStart">Open ${esc(monthLabel(selM).split(" ")[0])}</button></div>`;
  } else {
    const c = pmCalc(r, p), pending = c.dueC > 0 && !c.recv && selM >= curM && !r.locked;
    const e = pending ? pmCalc(Object.assign({}, r, {rentReceived:r.rentDue}), p) : c;     // rent not in yet: show what it will be
    const items = r.repairItems || [];
    if(!c.dueC && !c.recv && !items.length && !c.otherC && !c.adjC && !c.extrasC && !r.paidOut){
      body = `<div class="pp-empty">${p.status === "active" ? "No rent due recorded" : "Vacant"} — nothing to collect or pay out for ${esc(monthLabel(selM))}.<button class="btn sm" id="ppEdit" style="margin-left:auto">${r.locked || closed ? "View" : "Add a bill or rent"}</button></div>`;
    } else {
    const line = (label, val, cls, note) => `<div class="pp-l ${cls || ""}"><span>${label}${note ? ` <i>${note}</i>` : ""}</span><b class="num">${val}</b></div>`;
    const neg = x => x ? "−" + usd(Math.abs(x)) : "—";
    body = `
      ${md && L && selM === curM ? `<div class="pp-live ${L.balance > 0 ? "owe" : "ok"}"><span class="d"></span>${L.balance > 0
          ? `<b>${usd(cents(L.balance))} owed in MagicDoor</b><span>${L.pastDueDays > 0 ? `${L.pastDueDays} day${L.pastDueDays === 1 ? "" : "s"} past due` : "due"}${L.lastPayment ? " · last payment " + esc(fdateS(L.lastPayment)) : ""}${bldg ? ` · ${L.owingCount} of ${L.count} units` : ""}</span>`
          : `<b>Paid up in MagicDoor</b><span>${L.lastPayment ? "last payment " + esc(pmDY(L.lastPayment)) : ""}</span>`}</div>` : ""}
      <div class="pp-lines">
        ${line(pending ? "Rent due" : "Rent received", usd(pending ? c.dueC : c.recv), "", pending ? "not received yet" : c.dueC && c.recv !== c.dueC ? `of ${usd(c.dueC)} due` : "")}
        ${e.extrasC ? line(["filters", "lateFee", "applications", "reimbursement"].filter(k => Number(r[k])).map(k => ({filters:"Filter fee", lateFee:"Late fee", applications:"Application fees", reimbursement:"Reimbursement"})[k]).join(" + ") || "PHD charges", usd(e.extrasC), "phd", "kept by PHD, not paid to the owner") : ""}
        ${line("Repairs", neg(e.repairsC), "ded", items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "")}
        ${items.length ? `<div class="pp-items">${items.map(it => `<div><span>${esc(it.vendor || "—")}<i>${esc(it.memo || "")}</i></span><b class="num">${usd(cents(it.amount))}</b></div>`).join("")}</div>` : ""}
        ${e.adminC ? line("Admin fee", neg(e.adminC), "ded", `${p.adminRate ?? 10}% of repairs`) : ""}
        ${line("PM fee", neg(e.pmFeeC), "ded", feeRuleText(p.feeRule))}
        ${e.leasingC ? line("Leasing fee", neg(e.leasingC), "ded") : ""}
        ${e.otherC ? line("Other income", usd(e.otherC)) : ""}
        ${e.adjC ? line("Adjustments", usd(e.adjC)) : ""}
        ${line(pending ? "Owner payout, once rent is in" : e.payoutC < 0 ? "Owner owes" : "Owner payout", usd(Math.abs(e.payoutC)), "tot" + (e.payoutC < 0 ? " neg" : ""))}
      </div>
      <div class="pp-foot">${r.paidOut ? `<span class="tag green">Paid out ${esc(fdateS(r.paidOut.date))}${r.paidOut.method ? " · " + esc(r.paidOut.method) : ""}</span>`
          : r.locked ? `<span class="muted">Imported from the workbook</span>` : c.recv > 0 && c.payoutC > 0 ? `<span class="tag gold">Payout to send</span>` : ""}
        ${closed ? `<span class="muted">Month closed</span>` : ""}
        <button class="btn sm ${pending ? "primary" : ""}" id="ppEdit" style="margin-left:auto">${r.locked || closed ? "View details" : pending ? "Record rent & bills" : "Edit month"}</button></div>`;
    }
  }
  mc.innerHTML = `<div class="card-h pp-mh">
      <button class="btn sm ghost pp-arw" id="ppPrev" ${canPrev ? "" : "disabled"} title="Previous month">‹</button>
      <h3>${monthLabel(selM)}</h3>
      <button class="btn sm ghost pp-arw" id="ppNext" ${canNext ? "" : "disabled"} title="Next month">›</button>
      <span class="tag ${stat.cls}">${stat.label}</span>
      ${selM !== curM ? `<button class="btn sm ghost" id="ppNow" style="margin-left:auto">Back to ${esc(monthLabel(curM).split(" ")[0])}</button>` : ""}</div>
    <div class="card-b">${body}</div>`;
  const pick = m => { S.ui.pmPropM = m; render(); };
  mc.querySelector("#ppPrev").onclick = () => pick(months.filter(m => m < selM)[0] || prevM);
  mc.querySelector("#ppNext").onclick = () => pick([...months].reverse().find(m => m > selM) || nextM);
  const now = mc.querySelector("#ppNow"); if(now) now.onclick = () => pick(curM);
  const ed = mc.querySelector("#ppEdit"); if(ed) ed.onclick = () => pmRowSheet(selM, p.id);
  const sb = mc.querySelector("#ppStart"); if(sb) sb.onclick = () => { S.ui.pmMonth = selM; go("pmMonth"); };

  /* ---------- the property, each fact once ---------- */
  const dep = pmState().deposits[p.id] || {}, depC = dep.current && dep.current.amount ? cents(dep.current.amount) : 0;
  const mdDep = L && !bldg && L.depositPaid ? cents(L.depositPaid) : 0;
  const live = L && !bldg ? L.tenants.filter(t => !t.movedOut && t.name) : null;
  const ls = L && !bldg ? L.start : p.leaseStart, le = L && !bldg ? (L.monthToMonth ? null : L.end) : p.leaseEnd, m2m = L && !bldg ? L.monthToMonth : p.monthToMonth;
  const left = le ? PMCore.dayNum(le) - PMCore.dayNum(today) : null;
  const rent = p.rent ? cents(p.rent) : L && L.rent > 0 ? cents(L.rent) : 0;
  const ytd = months.filter(m => m.slice(0, 4) === today.slice(0, 4)).map(m => pmCalc(pmRow(m, p.id), p)), sum = k => ytd.reduce((a, c) => a + c[k], 0);
  const sc = elm("div","card pp-side"); grid.appendChild(sc);
  sc.innerHTML = `
    <div class="pp-sh"><span class="tag ${{active:"green", marketing:"gold", vacant:"grey", inactive:"grey"}[p.status]}">${PM_STATUS[p.status]}</span>${p.statusSince ? `<span class="muted">since ${esc(pmDY(p.statusSince))}</span>` : ""}${p.portfolio ? `<span class="muted pp-pf">${esc(p.portfolio)}</span>` : ""}</div>
    <dl class="pp-kv">
      <dt>Owner</dt><dd>${o ? `<a href="#" id="ppOwner">${esc(ownerLabel(o))}</a>${o.email ? `<small>${pmMail(o.email)}</small>` : ""}` : `<span class="muted">None on file</span>`}</dd>
      <dt>${bldg ? "Units" : "Tenants"}</dt><dd>${bldg ? `${L.count} leased` : live && live.length ? live.map(t => `<div class="pp-t">${esc(t.name)}${t.email || t.phone ? `<small>${[t.email && pmMail(t.email), t.phone && pmTel(t.phone)].filter(Boolean).join(" · ")}</small>` : ""}</div>`).join("")
          : p.tenants ? `${esc(p.tenants)}${p.tenantEmail || p.tenantPhone ? `<small>${[p.tenantEmail && pmMail(p.tenantEmail), p.tenantPhone && pmTel(p.tenantPhone)].filter(Boolean).join(" · ")}</small>` : ""}` : `<span class="muted">—</span>`}</dd>
      ${bldg ? "" : `<dt>Lease</dt><dd>${ls || le ? `${pmDY(ls)} → ${m2m ? "month-to-month" : pmDY(le)}${left != null ? `<small class="${left < 0 || left <= set.renewalDays ? "warn" : ""}">${left < 0 ? "ended " + (-left) + " days ago" : left + " days left"}</small>` : ""}` : `<span class="muted">No dates</span>`}${L && L.eviction ? ` <span class="tag red">eviction</span>` : ""}</dd>`}
      <dt>Rent</dt><dd><span class="num">${rent ? usd(rent) : "—"}</span><small>${esc(feeRuleText(p.feeRule))} PM fee · ${p.adminRate ?? 10}% admin on repairs${p.monthlyFilters ? ` · ${usd(cents(p.monthlyFilters))} filter fee/mo` : ""}</small></dd>
      <dt>Deposit</dt><dd><span class="num">${mdDep || depC ? usd(mdDep || depC) + " held" : "—"}</span>${mdDep && depC && mdDep !== depC ? `<small class="warn">Deposits page has ${usd(depC)} · <a href="#" id="ppDepFix">use ${usd(mdDep)}</a></small>` : ""}${dep.former && dep.former.names && !dep.former.returned ? `<small class="warn">Former tenant's deposit not settled</small>` : ""}</dd>
      ${(p.recurring || []).length ? `<dt>Recurring</dt><dd>${p.recurring.map(x => `${esc(x.vendor || x.memo)} ${usd(cents(x.amount))}`).join("<br>")}</dd>` : ""}
      ${p.notes && !/^Added from MagicDoor$/.test(p.notes) ? `<dt>Notes</dt><dd class="pp-note">${esc(p.notes)}</dd>` : ""}
    </dl>
    <div class="pp-ytd"><div class="label">${today.slice(0, 4)} so far</div>
      <div class="pp-ytd-g"><div><span>Collected</span><b class="num">${usd0(sum("recv"))}</b></div><div><span>Repairs</span><b class="num">${usd0(sum("repairsC"))}</b></div>
        <div><span>PHD fees</span><b class="num">${usd0(sum("phdC"))}</b></div><div><span>To owner</span><b class="num">${usd0(sum("payoutC"))}</b></div></div></div>
    ${typeof mdReady === "function" && mdReady() ? `<div class="pp-md">${md ? `MagicDoor · synced ${esc(mdAgo(S.md.syncedAt))} · ${md.how === "auto" ? "matched by address" : "linked by hand"}` : mdLinks().links[p.id] === "none" ? "Not in MagicDoor" : "Not linked to MagicDoor"} · <a href="#" id="ppMdLink">${md ? "change" : "link"}</a></div>` : ""}`;
  const ow = sc.querySelector("#ppOwner"); if(ow) ow.onclick = e => { e.preventDefault(); openOwner(o.id); };
  const dfx = sc.querySelector("#ppDepFix"); if(dfx) dfx.onclick = e => { e.preventDefault(); snapshot(); const d = pmState().deposits[p.id]; d.current.amount = mdDep / 100; commit(); toast("Deposit updated from MagicDoor", true); };
  const ml = sc.querySelector("#ppMdLink"); if(ml) ml.onclick = e => { e.preventDefault(); S.ui.mdQ = p.name; S.ui.mdF = "all"; go("pmMd"); };

  /* ---------- history, in tabs ---------- */
  const items = []; months.forEach(mm => (pmRow(mm, p.id).repairItems || []).forEach(it => items.push(Object.assign({month:mm}, it))));
  const mdh = md && md.property ? mdActivity(md.property.id) : null;
  const tabs = [["months", "Months", months.length]];
  if(bldg) tabs.push(["units", "Units", L.count]);
  if(items.length) tabs.push(["repairs", "Repairs", items.length]);
  if(mdh && (mdh.bills.length || mdh.dists.length)) tabs.push(["md", "MagicDoor activity", ""]);
  let tab = S.ui.pmPropTab; if(!tabs.some(t => t[0] === tab)) tab = "months";
  const hc = elm("div","card pp-hist"); v.appendChild(hc);
  let inner = "";
  if(tab === "months"){
    inner = `<table class="tbl pp-tbl"><thead><tr><th>Month</th><th class="r">Rent</th><th class="r">Repairs</th><th class="r">PHD fees</th><th class="r">Owner payout</th><th>Payout</th></tr></thead><tbody>
      ${months.map(mm => { const rr = pmRow(mm, p.id), c = pmCalc(rr, p), s2 = stOf(mm), pend = c.dueC > 0 && !c.recv && mm >= curM && !rr.locked;
        return `<tr data-lm="${mm}" class="${mm === selM ? "on" : ""}"><td><b>${monthLabel(mm)}</b></td>
          <td class="r num">${c.recv ? usd(c.recv) : `<span class="tag ${(PM_STAT[s2] || PM_STAT.none).cls}">${(PM_STAT[s2] || PM_STAT.none).label}</span>`}</td>
          <td class="r num">${c.repairsC ? usd(c.repairsC) : `<span class="muted">—</span>`}</td><td class="r num">${c.phdC ? usd(c.phdC) : `<span class="muted">—</span>`}</td>
          <td class="r num">${pend ? `<span class="muted">pending</span>` : `<b${c.payoutC < 0 ? ' style="color:var(--red)"' : ""}>${usd(c.payoutC)}</b>`}</td>
          <td>${rr.paidOut ? `<span class="muted">sent ${esc(fdateS(rr.paidOut.date))}</span>` : rr.locked ? `<span class="muted">imported</span>` : c.recv > 0 && c.payoutC > 0 ? `<span class="tag gold">To send</span>` : `<span class="muted">—</span>`}</td></tr>`; }).join("")}</tbody></table>`;
  } else if(tab === "units"){
    const unitName = id => ((md.units || []).find(u => u.id === id) || {}).name || "";
    inner = `<table class="tbl pp-tbl"><thead><tr><th>Unit</th><th>Tenants</th><th class="r">Rent</th><th class="r">Balance</th></tr></thead><tbody>
      ${[...md.leases].sort((a, b) => String(unitName(a.unitId)).localeCompare(unitName(b.unitId), undefined, {numeric:true})).map(x => `<tr><td><b>${esc(unitName(x.unitId) || x.unitName || "")}</b></td><td>${esc(mdTenants(x)) || "—"}</td><td class="r num">${x.rent ? usd(cents(x.rent)) : "—"}</td>
        <td class="r num">${x.balance > 0 ? `<span style="color:var(--red)">${usd(cents(x.balance))}</span>` : `<span class="muted">paid</span>`}</td></tr>`).join("")}</tbody></table>`;
  } else if(tab === "repairs"){
    const vend = {}; items.forEach(it => { const k = it.vendor || "Other"; vend[k] = (vend[k] || 0) + cents(it.amount); });
    inner = `<div class="pp-vend">${Object.entries(vend).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `<span>${esc(k)} <b class="num">${usd0(c)}</b></span>`).join("")}<span class="muted" style="margin-left:auto">Total <b class="num">${usd(items.reduce((a, it) => a + cents(it.amount), 0))}</b></span></div>
      <table class="tbl pp-tbl"><thead><tr><th>Date</th><th>Vendor</th><th>What</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${items.slice(0, 80).map(it => `<tr><td class="muted nw">${it.date ? esc(pmDY(it.date)) : esc(monthShort(it.month))}</td><td class="nw">${esc(it.vendor || "—")}</td><td class="pp-what">${esc(stmtLine(it).title)}${it.recurring ? ' <span class="mark grey">recurring</span>' : ""}</td><td class="r num">${usd(cents(it.amount))}</td>
        <td class="r">${stmtInvLink(stmtLine(it), "")}</td></tr>`).join("")}</tbody></table>`;
  } else {
    inner = `<div class="pp-two">
      <div><div class="label pp-sub">Vendor bills</div>${mdh.bills.length ? `<table class="tbl pp-tbl"><tbody>${mdh.bills.slice(0, 30).map(x => `<tr><td class="muted nw">${esc(pmDY(x.date))}</td><td><b>${esc(x.vendor || "—")}</b><div class="pp-what muted">${esc(x.memo || "")}</div></td>
          <td class="r num">${usd(cents(x.amount))}${x.fee ? `<div class="muted pp-fee">+ ${usd(cents(x.fee))} admin fee</div>` : ""}${x.owed > 0 ? `<div><span class="tag gold">unpaid</span></div>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="muted pp-pad">None in the last 15 months.</p>`}</div>
      <div><div class="label pp-sub">Owner payouts</div>${mdh.dists.length ? `<table class="tbl pp-tbl"><tbody>${mdh.dists.slice(0, 15).map(x => `<tr><td class="muted nw">${esc(pmDY(x.date))}</td><td>for ${esc(monthLabel(PMCore.mdPayoutMonth(x.date)))}</td><td class="r num">${usd(cents(x.amount))}</td></tr>`).join("")}</tbody></table>` : `<p class="muted pp-pad">None in the last 15 months.</p>`}</div></div>
      <div class="pp-md" style="border-top:1px solid var(--line-2)">MagicDoor's 10% admin-fee lines are shown next to the bill they belong to. The console adds that fee itself, so it is never counted twice.</div>`;
  }
  hc.innerHTML = `<div class="card-h pp-tabs">${tabs.map(([k, l, n]) => `<button data-pt="${k}" class="${k === tab ? "on" : ""}">${l}${n !== "" ? ` <span>${n}</span>` : ""}</button>`).join("")}</div>${inner}`;
  hc.querySelectorAll("[data-pt]").forEach(b => b.onclick = () => { S.ui.pmPropTab = b.dataset.pt; render(); });
  hc.querySelectorAll("[data-lm]").forEach(tr => tr.onclick = () => { S.ui.pmPropM = tr.dataset.lm; render(); window.scrollTo({top:0, behavior:"smooth"}); });
}
// MagicDoor bills for one MagicDoor property, with PHD's admin-fee lines folded into the bill they belong to
function mdActivity(mpId){
  const lines = [];
  (S.md.bills || []).forEach(bl => { if(bl.company) return; (bl.lines || []).forEach(li => { if(li.propertyId === mpId && li.amount) lines.push({date:bl.date, vendor:bl.vendor, memo:li.text || bl.memo || "", amount:li.amount, owed:bl.owed, isFee:!PMCore.mdIsRepairLine(li, bl)}); }); });
  const bills = lines.filter(x => !x.isFee), key = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  lines.filter(x => x.isFee).forEach(f => {
    const k = key(String(f.memo).replace(/^.*?admin(istrative)?\s*fee\s*[-–:]?\s*/i, "").replace(/\s*-?\s*10%\s*admin fee.*$/i, ""));
    const hit = bills.find(b => !b.fee && b.date === f.date && k && (key(b.memo).startsWith(k.slice(0, 12)) || k.startsWith(key(b.memo).slice(0, 12))))
             || bills.find(b => !b.fee && b.date === f.date && Math.abs(b.amount * 0.1 - f.amount) < 0.02);
    if(hit) hit.fee = f.amount;
  });
  bills.sort((a, b) => String(b.date).localeCompare(a.date));
  const dists = PMCore.mdDistributions(S.md, mpId).sort((a, b) => String(b.date).localeCompare(a.date));
  return {bills, dists};
}

/* ====================================================================
   SETTINGS — when things count as late, due, ending
   ==================================================================== */
function pgPmSettings(){
  actions([["Action center", () => go("pmAlerts"), "ghost"]]);
  const s = pmSettings(), v = $("#view");
  const F = [["lateAfterDay","Rent is late after day","of the month"], ["payoutDays","Owner payouts due","days after month end (0 = by the last day)"],
             ["startByDay","Remind to start the month after day",""], ["closeByDay","Last month should be closed by day","of the next month"],
             ["renewalDays","Lease renewal heads-up","days before the lease ends"], ["depositDays","Deposit return deadline","days after move-out (South Carolina: 30)"],
             ["vacancyDays","Flag a vacancy after","days"], ["inboxStaleDays","Flag receipts waiting longer than","days"]];
  const c = elm("div","card");
  c.innerHTML = `<div class="card-h"><h3>Alert rules</h3><span class="muted" style="margin-left:auto;font-size:12px">Shared by everyone, and used by the morning email</span></div>
    <div class="card-b" style="max-width:720px">${F.map(([k, l, h]) => `<div class="pm-set"><span>${l}</span><input type="number" min="0" max="120" data-sk="${k}" value="${s[k]}"><span class="muted">${h}</span></div>`).join("")}
      <p class="help" style="margin-top:14px">The morning email goes to everyone on the Team list on weekdays between 7 and 8 AM, only on days something needs action. It's sent by the receipt-inbox Google script — see <b>setupDigest</b> in its instructions.</p>
      <button class="btn primary" id="psSave" style="margin-top:6px">Save</button></div>`;
  v.appendChild(c);
  c.querySelector("#psSave").onclick = () => {
    const next = Object.assign({}, S.pmSettings || {});
    c.querySelectorAll("[data-sk]").forEach(i => { const n = Number(i.value); if(i.value !== "" && n >= 0) next[i.dataset.sk] = n; });
    snapshot(); S.pmSettings = next; commit(); toast("Alert rules saved", true);
  };
}

/* =====================================================================
   MAGICDOOR — live lease data from MagicDoor, kept in sync automatically
   ---------------------------------------------------------------------
   S.md      the latest snapshot (shared/magicdoor). Written only by the
             "magicdoor" Supabase function, hourly and on "Sync now".
   S.mdLinks {links:{pmPropId: unitId | "none"}, auto, appliedAt, log}
             (shared/mdlinks) — people's link choices and the update log.
   With automatic updates on, each new snapshot updates linked properties:
   tenants, contact details, lease dates, rent, leased/vacant, and a missing
   owner. Current-month rent MagicDoor shows as paid in full is recorded.
   Closed months, fee rules, notes and anything without a MagicDoor value
   are never touched.
   ===================================================================== */
ICON_PATHS.sync = '<path d="M13 5.6A5.3 5.3 0 0 0 3.4 4.6L2.4 5.8"/><path d="M2.4 2.6v3.2h3.2"/><path d="M3 10.4a5.3 5.3 0 0 0 9.6 1l1-1.2"/><path d="M13.6 13.4v-3.2h-3.2"/>';

function mdLinks(){ if(!S.mdLinks) S.mdLinks = {links:{}, ignore:{}, auto:true, appliedAt:"", log:[]}; S.mdLinks.links = S.mdLinks.links || {}; S.mdLinks.ignore = S.mdLinks.ignore || {}; S.mdLinks.log = S.mdLinks.log || []; S.mdLinks.skip = S.mdLinks.skip || {}; return S.mdLinks; }
function mdRowCount(pid){ let n = 0; for(const r of Object.values(pmState().rows)) if(r.propertyId === pid && !r.deleted) n++; return n; }
function mdReady(){ return !!(S.md && Array.isArray(S.md.units)); }
let _mdxCache = null;
function mdx(){
  if(!mdReady()) return null;
  const L = mdLinks();
  const sig = S.md.syncedAt + "|" + JSON.stringify(L.links) + "|" + JSON.stringify(L.ignore) + "|" + pmState().properties.length + "|" + Object.keys(pmState().rows).length + "|" + pmState().properties.map(p => p.address + p.name + p.status + (p.deleted ? "x" : "")).join("");
  if(_mdxCache && _mdxCache.sig === sig) return _mdxCache.v;
  const counts = {}; Object.values(pmState().rows).forEach(r => { if(!r.deleted) counts[r.propertyId] = (counts[r.propertyId] || 0) + 1; });
  const v = PMCore.mdIndex(S.md, pmState().properties, L.links, {ignore:L.ignore, score:pid => counts[pid] || 0});
  _mdxCache = {sig, v}; return v;
}
function mdFor(pid){ const x = mdx(); return x ? x.byProp[pid] || null : null; }
function mdAgo(iso){
  if(!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if(s < 90) return "just now"; if(s < 3600) return Math.round(s / 60) + " min ago"; if(s < 86400) return Math.round(s / 3600) + " h ago";
  return fdateS(iso.slice(0, 10));
}
function mdTenants(L){ return L ? L.tenants.filter(t => !t.movedOut && t.name).map(t => t.name).join(" / ") : ""; }
async function mdCall(mode){
  if(typeof Cloud === "undefined" || !Cloud.ready) throw new Error("MagicDoor works in the hosted console (sign in first).");
  const {data, error} = await Cloud.sb.functions.invoke("magicdoor", {body:{mode}});
  if(error){
    if(error.name === "FunctionsFetchError" || /Failed to send a request/i.test(error.message || ""))
      throw new Error("Couldn't reach the magicdoor function. In Supabase → Edge Functions, check it's deployed with the name magicdoor and that JWT verification is off.");
    let msg = error.message; try{ const b = await error.context.json(); if(b && b.error) msg = b.error; }catch(e){}
    throw new Error(msg);
  }
  if(data && data.error) throw new Error(data.error);
  return data;
}
async function mdSyncNow(btn){
  if(btn){ btn.disabled = true; btn.textContent = "Syncing…"; }
  try{
    const r = await mdCall("sync");
    toast(`MagicDoor synced — ${r.counts.leases} leases, ${r.counts.units} units`);
    if(!mdReady() || S.md.syncedAt < r.syncedAt) await mdFetchSnapshot();          // realtime normally delivers it first
  }catch(e){ toast("MagicDoor: " + e.message); }
  finally{ if(btn){ btn.disabled = false; btn.textContent = "Sync now"; } render(); }
}
async function mdFetchSnapshot(){
  const {data} = await Cloud.sb.from("docs").select("data,version").eq("kind", "shared").eq("id", "magicdoor").maybeSingle();
  if(data && data.data){ S.md = data.data; Cloud.synced.set("shared/magicdoor", {json:JSON.stringify(data.data), version:data.version, deleted:false}); mdAfterSnapshot(); }
}

let _mdLines = null;
function mdLineById(id){
  if(!_mdLines || _mdLines.at !== S.md.syncedAt){ const m = new Map(); (S.md.bills || []).forEach(b => (b.lines || []).forEach(li => m.set(li.id, {li, b}))); _mdLines = {at:S.md.syncedAt, m}; }
  return _mdLines.m.get(id) || null;
}
/* ---------- what an update would change (pure: nothing is saved here) ---------- */
// PHD's monthly filter fee for a property: the one set on it, or the same amount on at least two of the last four months
function mdFilterFee(p){
  if(Number(p.monthlyFilters) > 0) return Number(p.monthlyFilters);
  const cur = todayISO().slice(0, 7), seen = [];
  for(let k = 0; k < 4; k++){ const r = pmRow(PMCore.monthAdd(cur, -k), p.id); if(r && !r.deleted && Number(r.filters) > 0) seen.push(cents(r.filters)); }
  return seen.length >= 2 && seen.every(c => c === seen[0]) ? seen[0] / 100 : 0;
}
// was this item's description last set by MagicDoor (so a new MagicDoor description may replace it)?
function mdMemoSynced(it, mdTexts){
  const m = String(it.memo || "").trim();
  if(!m || m === "MagicDoor bill" || (it.mdMemo != null && m === String(it.mdMemo).trim())) return true;
  return (mdTexts || []).some(t => t && String(t).trim() === m);
}
function mdVendorKey(v){ return String(v || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
// MagicDoor numbers a bill's first line as the bill's id + 1; used only for items saved before the bill id was kept
function mdBillOfLine(lineId){ try{ return /^\d{6,}$/.test(String(lineId || "")) ? String(BigInt(lineId) - 1n) : ""; }catch(e){ return ""; } }
// who entered a MagicDoor bill, for showing next to it ("" until a sync has recorded it)
function mdBillWho(lineId){
  const f = lineId && mdReady() ? mdLineById(lineId) : null; if(!f || !f.b || !(f.b.by || f.b.created)) return "";
  const st = (S.md.staff || []).find(x => x.id === f.b.by);
  return `Entered in MagicDoor${f.b.by ? " by " + (st ? st.name : "staff #" + String(f.b.by).slice(-4)) : ""}${f.b.created ? " · " + fdateS(f.b.created) : ""}`;
}
// The project side's properties (the console keeps them in S.properties; the MagicDoor function passes them as S.pj)
function mdProjects(){ return (S && (S.pj || S.properties)) || []; }
// A MagicDoor bill on a property that is also a project, matching one of that project's expenses (same amount, close
// in date, same vendor or a large amount), is a project cost: it's billed to the owner on the project invoice, so it
// never goes on the owner statement as well. Returns {pj, t} or null.
function mdProjectMatch(p, li, b, used){
  const keys = new Set([p.name, p.address].concat(p.aliases || []).map(PMCore.normAddr).filter(Boolean));
  const days = iso => iso ? PMCore.dayNum(String(iso).slice(0, 10)) : null;
  const when = [b && b.due, b && b.date, li && li.date].map(days).filter(x => x != null);
  for(const pj of mdProjects()){
    if(pj.archived || pj.deleted || !(pj.transactions || []).length) continue;
    if(![pj.name, pj.address].map(PMCore.normAddr).some(k => k && keys.has(k))) continue;
    const vk = mdVendorKey((b && b.vendor) || (li && li.vendor)).slice(0, 4);
    const t = pj.transactions.find(t => !used.has(pj.id + "|" + t.id) && cents(t.amount) > 0 && cents(t.amount) === cents(li.amount)
      && (!when.length || !t.date || when.some(d => Math.abs(d - days(t.date)) <= 150))
      && ((vk && mdVendorKey(t.vendor).slice(0, 4) === vk) || cents(li.amount) >= 10000));
    if(t){ used.add(pj.id + "|" + t.id); return {pj, t}; }
  }
  return null;
}
function mdPlan(){
  const x = mdx(); if(!x) return {props:[], owners:[], rows:[], bills:[], payouts:[], unbills:[], filters:[], memos:[], relinks:[], dupes:[], gone:[], skips:[]};
  const today = todayISO(), curM = today.slice(0, 7), meta = pmState().meta[curM] || {};
  const out = {props:[], owners:[], rows:[], bills:[], payouts:[], unbills:[], filters:[], memos:[], relinks:[], dupes:[], gone:[], skips:[]}, newOwners = {};
  const SK = mdLinks().skip, usedTx = new Set(Object.values(SK).filter(x => x && x.pjTxn).map(x => x.pjId + "|" + x.pjTxn));
  const ownerFor = mo => {
    const em = String(mo.email || "").toLowerCase(), nm = String(mo.name || "").toLowerCase().replace(/\s+/g, " ").trim();
    return (S.owners || []).find(o => (o.mdId && o.mdId === mo.id) || (em && String(o.email || "").toLowerCase() === em) || (nm && String(o.name || o.company || "").toLowerCase().replace(/\s+/g, " ").trim() === nm)) || newOwners[mo.id] || null;
  };
  pmState().properties.forEach(p => {
    const m = x.byProp[p.id]; if(!m || p.status === "inactive") return;
    const L = m.lease, ch = {}, building = !!(L && L.combined);   // a whole building with several leases
    // MagicDoor's rent can include PHD's monthly HVAC filter fee (charged with the rent, kept by PHD, never paid to the owner)
    let rentNet = L ? L.rent : null, fee = 0;
    if(L && !building && L.rent > 0){
      fee = mdFilterFee(p);
      const lastDue = Number((pmRow(curM, p.id) || pmRow(PMCore.monthAdd(curM, -1), p.id) || {}).rentDue) || 0;
      if(fee && L.rent > fee && !(lastDue && cents(L.rent) === cents(lastDue))) rentNet = Math.round((L.rent - fee) * 100) / 100; else fee = 0;
    }
    const put = (k, v, label) => { if(v == null || v === "") return; if(String(p[k] ?? "") !== String(v)) ch[k] = {from:p[k] ?? "", to:v, label}; };
    if(L && building){
      if(p.status !== "active") ch.status = {from:p.status, to:"active", label:"status", since:today};
    } else if(L){
      const live = L.tenants.filter(t => !t.movedOut);
      put("tenants", mdTenants(L), "tenants");
      put("tenantEmail", (live.find(t => t.email) || {}).email, "tenant email");
      put("tenantPhone", (live.find(t => t.phone) || {}).phone, "tenant phone");
      put("leaseStart", L.start, "lease start");
      put("leaseEnd", L.end, "lease end");
      if(!!p.monthToMonth !== !!L.monthToMonth) ch.monthToMonth = {from:!!p.monthToMonth, to:!!L.monthToMonth, label:"month-to-month"};
      if(L.rent > 0) put("rent", rentNet, "rent");
      if(fee && !(Number(p.monthlyFilters) > 0)) ch.monthlyFilters = {from:"", to:fee, label:"monthly filter fee", mdRent:L.rent};
      if(p.status !== "active") ch.status = {from:p.status, to:"active", label:"status", since:L.start && L.start > (p.statusSince || "") ? L.start : today};
    } else if(p.status === "active"){
      ch.status = {from:"active", to:"vacant", label:"status", since:(m.endedLease && m.endedLease.end) || today};
    }
    // owner: only when none is set — never replaces one a person chose
    const mdOwners = m.property ? ((m.property.owners && m.property.owners.length) ? m.property.owners
      : (S.md.owners || []).map(o => ({id:o.id, pct:((o.properties || []).find(x => x.propertyId === m.property.id) || {}).pct, hit:(o.properties || []).some(x => x.propertyId === m.property.id)})).filter(o => o.hit)) : [];
    if(!p.ownerId && mdOwners.length){
      const top = [...mdOwners].sort((a, b) => (b.pct || 0) - (a.pct || 0))[0];
      const mo = (S.md.owners || []).find(o => o.id === top.id);
      if(mo && mo.name){
        let o = ownerFor(mo);
        if(!o){ o = {mdId:mo.id, name:mo.name, email:mo.email, phone:mo.phone, address:mo.addr.street, city:mo.addr.city, state:mo.addr.state, zip:mo.addr.zip, _new:true}; newOwners[mo.id] = o; out.owners.push(o); }
        ch.ownerId = {from:"", to:o, label:"owner"};
      }
    }
    if(Object.keys(ch).length) out.props.push({p, ch, md:m});
    // this month's rent, when MagicDoor shows it paid in full
    const r = pmRow(curM, p.id);
    if(!meta.closed && r && !r.locked && !r.detailOnly && L && !PMCore.has(r.rentReceived) && r.rentDue && PMCore.mdPaidThisMonth(L, curM))
      out.rows.push({p, row:r, amount:Number(r.rentDue), lastPayment:L.lastPayment});
    // the filter fee paid with that rent (PHD income)
    if(fee && !meta.closed && r && !r.locked && !r.detailOnly && !PMCore.has(r.filters) && PMCore.mdPaidThisMonth(L, curM))
      out.filters.push({p, row:r, amount:fee});
    // vendor bills and owner distributions for open months (this one and last), when this property is the only one on that MagicDoor property
    if(!m.property || (x.linkedPerMdProp[m.property.id] || 0) > 1) return;
    [PMCore.monthAdd(curM, -1), curM].forEach(mm => {
      const rr = pmRow(mm, p.id), mt = pmState().meta[mm] || {};
      if(!rr || rr.locked || rr.detailOnly || mt.closed) return;
      const items = rr.repairItems || [], orphans = [];
      items.forEach(it => { if(!it.mdLine) return; const f = mdLineById(it.mdLine);
        // kept off owner statements (a project expense, or not the owner's cost): take it back out
        if(SK[it.mdLine] && !SK[it.mdLine].keep){ out.skips.push({p, row:rr, it, why:SK[it.mdLine].why}); return; }
        if(f && it.source === "MagicDoor" && !SK[it.mdLine] && PMCore.mdIsRepairLine(f.li, f.b)){
          const pm = mdProjectMatch(p, Object.assign({date:f.b.date}, f.li), f.b, usedTx);
          if(pm){ out.skips.push({p, row:rr, it, why:"project", auto:true, pj:pm.pj, t:pm.t, li:f.li, b:f.b}); return; }
        }
        if(!f){ if(it.source === "MagicDoor" && (S.md.bills || []).length) orphans.push(it); return; }
        if(!PMCore.mdIsRepairLine(f.li, f.b)){ out.unbills.push({p, row:rr, it}); return; }
        // MagicDoor's description changed (and nobody retyped it here): follow it
        const want = PMCore.mdLineMemo(f.li, f.b);
        if(want && want !== String(it.memo || "").trim() && mdMemoSynced(it, [f.li.text, f.b.memo])) out.memos.push({p, row:rr, it, memo:want, billId:f.b.id});
      });
      // Editing a bill in MagicDoor can give its line a new id. The old id disappears, so match the item whose line
      // vanished to the new line (same bill; or, for items from before bills were recorded, same vendor and amount).
      const same = (i, li) => mdVendorKey(i.vendor) === mdVendorKey(li.vendor) && cents(i.amount) === cents(li.amount);
      const oldBill = it => it.mdBill || mdBillOfLine(it.mdLine);
      const claimed = new Set();
      const have = new Set(items.map(i => i.mdLine).filter(Boolean));
      PMCore.mdBillLines(S.md, m.property.id, mm).forEach(li => {
        if(have.has(li.id) || (SK[li.id] && !SK[li.id].keep)) return;
        const pm = SK[li.id] ? null : mdProjectMatch(p, li, (mdLineById(li.id) || {}).b, usedTx);
        if(pm){ out.skips.push({p, row:rr, it:null, why:"project", auto:true, pj:pm.pj, t:pm.t, li, b:(mdLineById(li.id) || {}).b}); return; }
        const o = orphans.find(i => !claimed.has(i) && oldBill(i) === li.billId) || orphans.find(i => !claimed.has(i) && !i.mdBill && same(i, li));
        if(o){ claimed.add(o); out.relinks.push({p, row:rr, it:o, li, memo:mdMemoSynced(o, [li.memo]) ? li.memo : null}); return; }
        // already typed in by hand (same amount)? link it instead of adding a second copy
        const twin = (rr.repairItems || []).find(i => !i.mdLine && cents(i.amount) === cents(li.amount));
        out.bills.push({p, row:rr, li, twin});
      });
      // already added a second time under the new line id (before this fix): fold the copy back into the original
      orphans.filter(o => !claimed.has(o)).forEach(o => {
        const cands = items.filter(d => d !== o && d.source === "MagicDoor" && d.mdLine && !claimed.has(d) && mdLineById(d.mdLine) && same(o, d) && !items.some(z => z !== o && z.mdLine === d.mdLine && z !== d));
        const d = cands.find(c => mdLineById(c.mdLine).b.id === oldBill(o)) || (!o.mdBill ? cands[0] : null);
        if(d){ claimed.add(o); claimed.add(d); const f = mdLineById(d.mdLine), want = PMCore.mdLineMemo(f.li, f.b);
          out.dupes.push({p, row:rr, keep:o, drop:d, li:f.li, billId:f.b.id, memo:mdMemoSynced(o, [d.memo, f.li.text, f.b.memo]) ? want : null}); return; }
        // the bill itself was deleted in MagicDoor
        if(!o.mdBill || !(S.md.bills || []).some(b => b.id === o.mdBill)){ claimed.add(o); out.gone.push({p, row:rr, it:o}); }
      });
      const dropped = new Set(out.dupes.filter(x => x.row === rr).map(x => x.drop));
      if(dropped.size) out.memos = out.memos.filter(x => !dropped.has(x.it));
      if(!rr.paidOut){
        const ds = PMCore.mdDistributions(S.md, m.property.id, mm);
        if(ds.length) out.payouts.push({p, row:rr, date:ds.map(d => d.date).sort().pop(), amount:Math.round(ds.reduce((a, d) => a + (d.amount || 0), 0) * 100) / 100});
      }
    });
  });
  return out;
}

/* ---------- keep the property list a mirror of MagicDoor ----------
   one property here for every active MagicDoor unit (a building counts once when it's tracked as one),
   no duplicates, clean names, the MagicDoor portfolio on each, test entries left out. */
function mdCleanName(u, mp){
  const segs = String(u.line || "").split(",").map(z => z.trim()).filter(Boolean);
  let base = (segs[0] || (mp && mp.addr && mp.addr.street) || u.name || "").replace(/[,\s]+$/, "");
  const nm = String(u.name || "").trim();
  let unit = "";
  if(nm && !/^home$/i.test(nm) && PMCore.normAddr(nm) !== PMCore.normAddr(base)){
    const m = nm.match(/^(?:unit|apt|apartment|#)\s*([a-z0-9-]+)/i) || nm.match(/^([a-z0-9]{1,4})\b(?:\s*-\s*.*)?$/i);
    unit = /^suite\b/i.test(nm) ? " " + nm : m ? " #" + m[1].toUpperCase() : " · " + nm;
  } else if(segs.length >= 3 && /^((unit|apt|suite|#)\s*[a-z0-9-]{1,6}|[a-z0-9]{1,4})$/i.test(segs[1])){
    unit = /^suite/i.test(segs[1]) ? " " + segs[1] : " #" + segs[1].replace(/^(unit|apt|#)\s*/i, "").toUpperCase();
  }
  const address = segs.length ? segs.join(", ").replace(/,\s*,/g, ",") : base;
  return {name:(base + unit).replace(/\s+/g, " ").trim(), address};
}
function mdFeeGuess(mpId, rent){
  const f = (S.md.fees || []).filter(x => x.propertyId === mpId).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3);
  if(!f.length || !rent) return null;
  const pct = Math.round(f.reduce((a, x) => a + x.amount, 0) / f.length / rent * 200) / 2;
  return pct >= 3 && pct <= 15 ? pct : null;
}
function mdOrganizePlan(){
  const x = mdx(), L = mdLinks(), out = {merge:[], create:[], rename:[], reactivate:[], retire:[], remove:[], portfolio:[], conflicts:[]};
  if(!x) return out;
  const P = pmState().properties.filter(p => !p.deleted), rowsOf = pid => Object.values(pmState().rows).filter(r => r.propertyId === pid && !r.deleted);
  // duplicates: merge the newer copy into the one with the history
  x.dupes.forEach(d => {
    const keep = P.find(p => p.id === d.keep), drop = P.find(p => p.id === d.drop);
    if(!keep || !drop) return;
    const km = new Set(rowsOf(keep.id).map(r => r.month)), clash = rowsOf(drop.id).filter(r => km.has(r.month));
    (clash.length ? out.conflicts : out.merge).push({keep, drop, months:clash.map(r => r.month)});
  });
  const dropped = new Set(out.merge.map(m => m.drop.id).concat(out.conflicts.map(m => m.drop.id)));
  // MagicDoor units with no property here (buildings tracked whole are already covered)
  x.unmatchedUnits.forEach(u => out.create.push({u, mp:x.props[u.propertyId]}));
  // tidy names on the ones this console created, set portfolios, bring back or retire
  P.forEach(p => {
    if(dropped.has(p.id)) return;
    const m = x.byProp[p.id];
    if(m){
      if(m.unit && (p.mdCreated || /Added from MagicDoor/.test(p.notes || "")) ){ const c = mdCleanName(m.unit, m.property); if(c.name && (c.name !== p.name || c.address !== p.address)) out.rename.push({p, ...c}); }
      const pf = m.property && m.property.portfolio; if(pf && p.portfolio !== pf) out.portfolio.push({p, portfolio:pf});
      if(p.status === "inactive") out.reactivate.push({p, m});
    } else if(p.mdCreated || /Added from MagicDoor/.test(p.notes || "")){
      // made from MagicDoor, but MagicDoor no longer has it (or it's a test entry): remove it if nothing was ever recorded, otherwise retire it
      if(L.links[p.id] === "none") return;
      if(!rowsOf(p.id).length) out.remove.push({p}); else if(p.status !== "inactive") out.retire.push({p});
    }
  });
  return out;
}
function mdOrganize(lines){
  const plan = mdOrganizePlan(), L = mdLinks(), P2 = pmState(), today = todayISO();
  plan.merge.forEach(({keep, drop}) => {
    Object.entries(P2.rows).forEach(([k, r]) => { if(r.propertyId === drop.id && !r.deleted){ const nk = r.month + "|" + keep.id; if(!P2.rows[nk]){ r.propertyId = keep.id; P2.rows[nk] = r; } delete P2.rows[k]; } });
    if(P2.deposits[drop.id] && !P2.deposits[keep.id]) P2.deposits[keep.id] = P2.deposits[drop.id];
    delete P2.deposits[drop.id];
    ["ownerId", "tenants", "tenantEmail", "tenantPhone", "leaseStart", "leaseEnd", "rent", "portfolio"].forEach(f => { if(!keep[f] && drop[f]) keep[f] = drop[f]; });
    if(L.links[drop.id] && !L.links[keep.id] && L.links[drop.id] !== "none") L.links[keep.id] = L.links[drop.id];
    delete L.links[drop.id];
    P2.properties.splice(P2.properties.indexOf(drop), 1);
    lines.push({prop:keep.name, pid:keep.id, what:`duplicate "${drop.name}" merged in — one row per MagicDoor unit`});
  });
  plan.remove.forEach(({p}) => { P2.properties.splice(P2.properties.indexOf(p), 1); delete L.links[p.id]; lines.push({prop:p.name, pid:"", what:"removed — not an active unit in MagicDoor (test or deleted)"}); });
  plan.retire.forEach(({p}) => { p.status = "inactive"; p.statusSince = today; lines.push({prop:p.name, pid:p.id, what:"marked no longer managed — no longer in MagicDoor"}); });
  plan.reactivate.forEach(({p, m}) => { p.status = m.lease ? "active" : "vacant"; p.statusSince = today; lines.push({prop:p.name, pid:p.id, what:`back from "No longer managed" — it's an active unit in MagicDoor (${m.lease ? "leased" : "vacant"})`}); });
  plan.rename.forEach(({p, name, address}) => { lines.push({prop:name, pid:p.id, what:`renamed from "${p.name}"`}); p.name = name; p.address = address; });
  plan.portfolio.forEach(({p, portfolio}) => { p.portfolio = portfolio; });
  plan.create.forEach(({u, mp}) => {
    const c = mdCleanName(u, mp), l = (S.md.leases || []).find(z => z.unitId === u.id && !z.ended);
    const rent = l && l.rent ? l.rent : u.marketRent || null, pct = mp ? mdFeeGuess(mp.id, rent) : null;
    const p = {id:"pm_" + uid(), name:c.name, address:c.address, aliases:[], rent, feeRule:{type:"pct", rate:pct || 10}, adminRate:10,
      status:l ? "active" : "vacant", statusSince:today, ownerId:null, tenants:"", notes:"Added from MagicDoor", recurring:[], mdCreated:true, portfolio:(mp && mp.portfolio) || ""};
    P2.properties.push(p);
    lines.push({prop:p.name, pid:p.id, what:`added — in MagicDoor${p.portfolio ? " (" + p.portfolio + ")" : ""}${pct ? `, ${pct}% fee from MagicDoor's management fees` : ""}`});
  });
  _mdxCache = null;
  return plan;
}

function mdOrganizeCount(){ if(mdLinks().organize === false) return 0; const o = mdOrganizePlan(); return o.merge.length + o.create.length + o.rename.length + o.reactivate.length + o.retire.length + o.remove.length + o.portfolio.length; }

/* ---------- apply it ---------- */
function mdApply(opts){
  opts = opts || {};
  const lines = [];
  if(!opts.rowsOnly && mdLinks().organize !== false) mdOrganize(lines);
  const plan = mdPlan(), L = mdLinks(), who = (typeof Cloud !== "undefined" && Cloud.name) || "You";
  const today = todayISO();
  if(!opts.rowsOnly){
    plan.owners.forEach(o => { delete o._new; const n = cleanOwner(Object.assign(blankOwner(), o, {id:uid(), notes:"Added from MagicDoor"})); n.mdId = o.mdId; Object.assign(o, n); S.owners.push(o); });
    plan.props.forEach(({p, ch}) => {
      const what = [];
      Object.entries(ch).forEach(([k, c]) => {
        if(k === "ownerId"){ p.ownerId = c.to.id; what.push("owner → " + (c.to.name || c.to.company)); return; }
        if(k === "status"){ p.status = c.to; p.statusSince = c.since || today; what.push(c.to === "active" ? "now leased" : "now vacant"); return; }
        p[k] = c.to;
        if(k === "monthlyFilters"){ what.push(`filter fee ${usd(cents(c.to))}/mo — part of MagicDoor's ${usd(cents(c.mdRent))} rent, kept by PHD`); return; }
        what.push(k === "rent" ? `rent ${usd(cents(c.from || 0))} → ${usd(cents(c.to))}` : k === "leaseEnd" || k === "leaseStart" ? `${c.label} ${c.from ? fdateS(c.from) + " → " : ""}${fdateS(c.to)}` : k === "monthToMonth" ? (c.to ? "month-to-month" : "fixed term") : c.label + " updated");
      });
      lines.push({prop:p.name, pid:p.id, what:what.join(" · ")});
    });
  }
  plan.rows.forEach(({p, row, amount, lastPayment}) => {
    row.rentReceived = amount; row.mdFilled = lastPayment || today;
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)} rent ${usd(cents(amount))} recorded (paid in MagicDoor${lastPayment ? " " + fdateS(lastPayment) : ""})`});
  });
  (plan.filters || []).forEach(({p, row, amount}) => {
    row.filters = amount;
    if(typeof pmTouch === "function") pmTouch(row);
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)} filter fee ${usd(cents(amount))} recorded (paid in MagicDoor with the rent)`});
  });
  plan.unbills.forEach(({p, row, it}) => {
    row.repairItems = row.repairItems.filter(i => i !== it);
    if(typeof pmTouch === "function") pmTouch(row);
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)}: removed MagicDoor's admin-fee line ${usd(cents(it.amount))} — the console adds the 10% admin fee itself`});
  });
  (plan.skips || []).forEach(({p, row, it, why, auto, pj, t, li, b}) => {
    const lineId = it ? it.mdLine : li.id;
    if(auto && !L.skip[lineId]) L.skip[lineId] = {why:"project", auto:true, at:today, pid:p.id, month:row.month, vendor:(b && b.vendor) || (it && it.vendor) || "", amount:li.amount, memo:(it && it.memo) || PMCore.mdLineMemo(li, b), billId:b && b.id, pjId:pj.id, pjTxn:t.id, pjName:pj.name, pjDesc:t.desc || "", pjDate:t.date || ""};
    if(!it) return;
    row.repairItems = row.repairItems.filter(i => i !== it);
    if(typeof pmTouch === "function") pmTouch(row);
    const s = L.skip[lineId] || {};
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)}: took ${it.vendor || "a bill"} ${usd(cents(it.amount))} off the owner statement — ${s.why === "project" ? `project expense${s.pjName ? ` (on the ${s.pjName} project${s.pjDesc ? ": " + s.pjDesc.slice(0, 40) : ""})` : ""}` : "not the owner's cost"}`});
  });
  const memoTxt = (a, b) => `“${String(a || "").slice(0, 50)}” → “${String(b || "").slice(0, 50)}”`;
  (plan.memos || []).forEach(({p, row, it, memo, billId}) => {
    const was = it.memo; it.memo = memo; it.mdMemo = memo; if(billId) it.mdBill = billId;
    if(typeof pmTouch === "function") pmTouch(row);
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)} ${it.vendor || "bill"}: description updated from MagicDoor ${memoTxt(was, memo)}`});
  });
  (plan.relinks || []).forEach(({p, row, it, li, memo}) => {
    const was = it.memo, amt = cents(it.amount) !== cents(li.amount);
    it.mdLine = li.id; it.mdBill = li.billId;
    if(amt) it.amount = li.amount;
    if(memo){ it.memo = memo; it.mdMemo = memo; }
    if(typeof pmTouch === "function") pmTouch(row);
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)} ${it.vendor || "bill"} edited in MagicDoor${memo && memo !== was ? ": " + memoTxt(was, memo) : ""}${amt ? ` · amount now ${usd(cents(li.amount))}` : ""}`});
  });
  (plan.dupes || []).forEach(({p, row, keep, drop, li, billId, memo}) => {
    const was = keep.memo;
    row.repairItems = row.repairItems.filter(i => i !== drop);
    keep.mdLine = li.id; keep.mdBill = billId;
    if(memo){ keep.memo = memo; keep.mdMemo = memo; }
    if(typeof pmTouch === "function") pmTouch(row);
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)} removed a duplicate ${keep.vendor || "bill"} ${usd(cents(keep.amount))} (edited in MagicDoor, not a new bill)${memo && memo !== was ? " · " + memoTxt(was, memo) : ""}`});
  });
  (plan.gone || []).forEach(({p, row, it}) => {
    row.repairItems = row.repairItems.filter(i => i !== it);
    if(typeof pmTouch === "function") pmTouch(row);
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)} removed ${it.vendor || "bill"} ${usd(cents(it.amount))} — deleted in MagicDoor`});
  });
  plan.bills.forEach(({p, row, li, twin}) => {
    if(twin){ twin.mdLine = li.id; twin.mdBill = li.billId; if(!twin.vendor) twin.vendor = li.vendor; return; }
    row.repairItems = row.repairItems || [];
    const memo = li.memo || li.account || "MagicDoor bill";
    row.repairItems.push({id:uid(), date:li.date, vendor:li.vendor || "", memo, mdMemo:memo, amount:li.amount, feeMode:"auto", mdLine:li.id, mdBill:li.billId, source:"MagicDoor"});
    if(typeof pmTouch === "function") pmTouch(row);
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)} bill added: ${li.vendor || "vendor"} ${usd(cents(li.amount))}${li.memo ? " — " + li.memo.slice(0, 60) : ""}`});
  });
  plan.payouts.forEach(({p, row, date, amount}) => {
    row.paidOut = {date, method:"MagicDoor", by:"MagicDoor", amount};
    if(typeof pmTouch === "function") pmTouch(row);
    const c = pmCalc(row, p), diff = Math.abs(c.payoutC - cents(amount)) > 100;
    lines.push({prop:p.name, pid:p.id, what:`${monthLabel(row.month)} payout marked sent ${fdateS(date)} (${usd(cents(amount))} in MagicDoor${diff ? `; the console shows ${usd(c.payoutC)}` : ""})`});
  });
  if(!opts.rowsOnly) L.appliedAt = (S.md && S.md.syncedAt) || L.appliedAt;
  if(lines.length){
    L.log.unshift({at:new Date().toISOString(), by:opts.auto ? "MagicDoor sync" : who, lines:lines.slice(0, 120), more:Math.max(0, lines.length - 120)});
    L.log = L.log.slice(0, 25);
  }
  commit();
  if(!opts.quiet) toast(lines.length ? `Updated from MagicDoor — ${lines.length} change${lines.length === 1 ? "" : "s"}` : "Already up to date with MagicDoor");
  return lines.length;
}
// a new snapshot arrived: apply it once (a short random wait lets one open console do it for everyone)
let _mdApplyTimer = null;
function mdAfterSnapshot(){
  // The MagicDoor function applies every update on the server right after each sync (hourly, and on Sync now),
  // so the console only redraws here. Apply now on the MagicDoor page is still there for an immediate run.
  _mdxCache = null;
}

/* ---------- MagicDoor page ---------- */
function pgPmMd(){
  const v = $("#view"), x = mdx(), L = mdLinks(), live = pmLiveProps();
  $("#pgCrumb").textContent = "Property management"; $("#pgTitle").textContent = "MagicDoor";
  $("#pgSub").textContent = mdReady() ? `Last synced ${mdAgo(S.md.syncedAt)} · syncs every hour${S.md.took ? ` · took ${S.md.took}s` : ""}` : "Not synced yet";
  actions([["Check more data", () => mdProbeSheet()], ["Sync now", e => mdSyncNow(e && e.currentTarget), "primary"]]);
  if(!mdReady()){
    v.appendChild(elm("div","card",`<div class="empty"><b>No MagicDoor data yet</b><p>Click <b>Sync now</b>. It reads your properties, units, leases, owners and management fees from MagicDoor (read-only) and links them to the properties here by address.</p></div>`));
    return;
  }
  const linked = live.filter(p => x.byProp[p.id]);
  const owed = linked.map(p => x.byProp[p.id].lease).filter(l => l && l.balance > 0);
  const ending = linked.filter(p => { const l = x.byProp[p.id].lease; if(!l || !l.end || l.monthToMonth) return false; const d = PMCore.dayNum(l.end) - PMCore.dayNum(todayISO()); return d >= 0 && d <= pmSettings().renewalDays; });
  const k = elm("div","card pf-hero pm-kpi");
  k.innerHTML = [
    ["Linked", `${linked.length}<span class="pm-of"> of ${live.length}</span>`, x.unmatchedProps.length ? `${x.unmatchedProps.length} not found in MagicDoor` : "every property found"],
    ["Owed now", usd0(cents(owed.reduce((a, l) => a + l.balance, 0))), `${owed.length} lease${owed.length === 1 ? "" : "s"} with a balance`],
    ["Past due", String(owed.filter(l => l.pastDueDays > 0).length), "by MagicDoor's count"],
    ["Leases ending", String(ending.length), `within ${pmSettings().renewalDays} days`],
    ["Not linked", String(x.unmatchedUnits.length), "MagicDoor units without a property here"]
  ].map(([a, b, c], i) => `<div class="pf-cell"><div class="label">${a}</div><div class="pf-v"${i === 2 && owed.some(l => l.pastDueDays > 0) ? ' style="color:var(--red)"' : ""}>${b}</div><div class="pf-note">${c}</div></div>`).join("");
  v.appendChild(k);

  // automatic updates + log
  const org = mdOrganizePlan(), orgN = mdOrganizeCount();
  const plan = mdPlan(), nEd = plan.memos.length + plan.relinks.length + plan.dupes.length + plan.gone.length + plan.skips.filter(x => x.it).length, pend = plan.props.length + plan.rows.length + plan.bills.length + plan.payouts.length + plan.unbills.length + plan.filters.length + nEd + orgN;
  const au = elm("div","card"); au.style.marginTop = "16px";
  au.innerHTML = `<div class="card-h"><h3>Keep property details up to date</h3>
      <label class="md-tog"><input type="checkbox" id="mdAuto" ${L.auto !== false ? "checked" : ""}> Automatic</label></div>
    <div class="card-b">
      <p class="muted" style="margin:0 0 10px;font-size:13px">Runs on the server after every sync — hourly, and when you click Sync now — even when nobody has the console open. Each sync updates linked properties from MagicDoor: tenants and their contact details, lease dates, rent, leased or vacant, and the owner when none is set. In Month close it records rent MagicDoor shows as paid in full, adds vendor bills as repairs (with your admin fee), and marks owner payouts sent when MagicDoor shows the distribution. Closed months, fee rules and notes are never changed.</p>
      ${pend ? `<div class="md-pend"><b>${pend} update${pend === 1 ? "" : "s"} waiting</b> <span class="muted">${[org.merge.length && `${org.merge.length} duplicate${org.merge.length === 1 ? "" : "s"} to merge`, org.create.length && `${org.create.length} to add`, org.rename.length && `${org.rename.length} to rename`, org.reactivate.length && `${org.reactivate.length} back from no longer managed`, (org.remove.length + org.retire.length) && `${org.remove.length + org.retire.length} no longer in MagicDoor`].filter(Boolean).map(t => t + ", ").join("")}${plan.props.length} propert${plan.props.length === 1 ? "y" : "ies"}${plan.owners.length ? `, ${plan.owners.length} new owner${plan.owners.length === 1 ? "" : "s"}` : ""}${plan.rows.length ? `, ${plan.rows.length} rent payment${plan.rows.length === 1 ? "" : "s"}` : ""}${plan.bills.length ? `, ${plan.bills.length} bill${plan.bills.length === 1 ? "" : "s"}` : ""}${nEd ? `, ${nEd} bill${nEd === 1 ? "" : "s"} edited in MagicDoor` : ""}${plan.payouts.length ? `, ${plan.payouts.length} payout${plan.payouts.length === 1 ? "" : "s"} sent` : ""}</span>
        <button class="btn sm" id="mdPreview">Preview</button><button class="btn primary sm" id="mdApplyNow">Apply now</button></div>` : `<div class="md-pend ok">Everything matches MagicDoor.</div>`}
      ${org.conflicts.length ? `<div class="md-pend" style="margin-top:10px;border-color:var(--red-line);background:var(--red-soft)"><b>Needs a look</b> <span class="muted">${org.conflicts.map(c => `"${esc(c.drop.name)}" and "${esc(c.keep.name)}" are the same MagicDoor unit and both have entries for ${c.months.map(monthShort).join(", ")}`).join("; ")}. Open one and move or delete its duplicate months, and the rest merges on its own.</span></div>` : ""}
      <label class="md-tog" style="margin:10px 0 0;justify-content:flex-start"><input type="checkbox" id="mdOrg" ${L.organize !== false ? "checked" : ""}> Keep the property list matched to MagicDoor — one row per unit, duplicates merged, new units added, names tidied</label>
      <details class="md-log" ${L.log.length ? "" : "hidden"}><summary>Recent updates</summary>
        ${L.log.map(e => `<div class="md-log-e"><div class="md-log-h">${esc(fdateS(e.at.slice(0, 10)))} ${esc(new Date(e.at).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}))} · ${esc(e.by)}</div>
          ${e.lines.map(l => `<div class="md-log-l"><a href="#" data-pmp="${esc(l.pid)}">${esc(l.prop)}</a> <span class="muted">${esc(l.what)}</span></div>`).join("")}${e.more ? `<div class="muted">…and ${e.more} more</div>` : ""}</div>`).join("")}
      </details></div>`;
  v.appendChild(au);
  au.querySelector("#mdOrg").onchange = e => { L.organize = e.target.checked; commit(); if(L.organize) mdAfterSnapshot(); render(); };
  au.querySelector("#mdAuto").onchange = e => { L.auto = e.target.checked; commit(); toast(L.auto ? "Automatic updates on" : "Automatic updates off — use Apply now to update"); if(L.auto) mdAfterSnapshot(); };
  const ap = au.querySelector("#mdApplyNow"); if(ap) ap.onclick = () => { mdApply(); render(); };
  const pv = au.querySelector("#mdPreview"); if(pv) pv.onclick = () => mdPreviewSheet(plan);
  au.querySelectorAll("[data-pmp]").forEach(a => a.onclick = e => { e.preventDefault(); pmOpenProperty(a.dataset.pmp); });

  // links
  const f = S.ui.mdF || "all", q = (S.ui.mdQ || "").toLowerCase();
  const rows = live.filter(p => {
    const m = x.byProp[p.id];
    if(f === "unlinked" && m) return false;
    if(f === "owed" && !(m && m.lease && m.lease.balance > 0)) return false;
    if(f === "manual" && !(m && m.how === "manual") && L.links[p.id] !== "none") return false;
    return !q || `${p.name} ${p.address} ${m && m.lease ? mdTenants(m.lease) : ""}`.toLowerCase().includes(q);
  });
  const units = (S.md.units || []).filter(u => u.active !== false);
  const props = {}; (S.md.properties || []).forEach(mp => props[mp.id] = mp);
  const uLabel = u => { const mp = props[u.propertyId]; const base = (mp && mp.addr.street) || u.line || ""; return u.name && PMCore.normAddr(u.name) !== PMCore.normAddr(base) ? `${base} · ${u.name}` : base || u.name; };
  const opts = units.map(u => [u.id, uLabel(u)])
    .concat((S.md.properties || []).filter(mp => mp.active !== false && units.filter(u => u.propertyId === mp.id).length !== 1).map(mp => ["p:" + mp.id, `${mp.addr.street || mp.name} · whole property (${units.filter(u => u.propertyId === mp.id).length} units)`]))
    .sort((a, b) => a[1].localeCompare(b[1], undefined, {numeric:true}));
  const linkLabel = m => m.whole ? `${(m.property.addr && m.property.addr.street) || m.property.name} · whole property, ${m.leases.length} lease${m.leases.length === 1 ? "" : "s"}` : uLabel(m.unit);
  const card = elm("div","card"); card.style.marginTop = "16px";
  const cnt = {all:live.length, unlinked:x.unmatchedProps.length, owed:owed.length, manual:live.filter(p => (x.byProp[p.id] && x.byProp[p.id].how === "manual") || L.links[p.id] === "none").length};
  card.innerHTML = `<div class="card-h"><h3>Properties and their MagicDoor units</h3><span class="muted" style="margin-left:auto;font-size:12px">Matched by address; pick a unit to override</span></div>
    <div class="sc-bar" style="padding:10px 16px 0"><div class="sc-seg">${[["all","All"],["unlinked","Not linked"],["owed","Owe money"],["manual","Set by hand"]].map(([k2, l]) => `<button data-mf="${k2}" class="${f === k2 ? "on" : ""}">${l} <span>${cnt[k2]}</span></button>`).join("")}</div>
      <div class="sc-q"><input type="text" id="mdQ" placeholder="Find a property or tenant…" value="${esc(S.ui.mdQ || "")}"></div></div>
    <div class="tbl-wrap"><table class="tbl md-tbl"><thead><tr><th>Property here</th><th>MagicDoor unit</th><th>Tenants</th><th class="r">Rent</th><th class="r">Balance</th><th>Lease</th></tr></thead><tbody>
    ${rows.map(p => {
      const m = x.byProp[p.id], l = m && m.lease, none = L.links[p.id] === "none";
      const sel = `<select class="md-sel" data-link="${esc(p.id)}"><option value="">${m && m.how === "auto" ? "Matched by address" : "— Not linked —"}</option>${opts.map(([id, lb]) => `<option value="${esc(id)}" ${L.links[p.id] === id ? "selected" : ""}>${esc(lb)}</option>`).join("")}<option value="none" ${none ? "selected" : ""}>Not in MagicDoor</option></select>`;
      return `<tr><td><a href="#" data-pmp="${esc(p.id)}">${esc(p.name)}</a>${m ? ` <span class="tag ${m.how === "auto" ? "grey" : "green"}" title="${m.how === "auto" ? "Matched by address" : "Linked by hand"}">${m.how === "auto" ? "auto" : "linked"}</span>` : none ? ` <span class="tag grey">not in MagicDoor</span>` : ` <span class="tag gold">not linked</span>`}
          ${m ? `<div class="item-s">${esc(linkLabel(m))}</div>` : ""}</td>
        <td>${sel}</td>
        <td>${l && l.combined ? `${l.count} leases${l.owingCount ? ` <span class="muted">· ${l.owingCount} owe</span>` : ""}` : l ? esc(mdTenants(l)) || "—" : m ? `<span class="muted">Vacant in MagicDoor</span>` : ""}</td>
        <td class="r num">${l && l.rent ? usd(cents(l.rent)) : "—"}</td>
        <td class="r num">${l ? (l.balance > 0 ? `<span style="color:var(--red)">${usd(cents(l.balance))}</span>${l.pastDueDays > 0 ? `<div class="item-s">${l.pastDueDays} days late</div>` : ""}` : l.balance < 0 ? `<span class="muted">${usd(cents(l.balance))} credit</span>` : `<span style="color:var(--green)">Paid</span>`) : "—"}</td>
        <td>${l && l.combined ? `<span class="muted">${l.count} separate leases</span>` : l ? `${l.start ? esc(fdateS(l.start)) : "?"} → ${l.monthToMonth ? "month-to-month" : l.end ? esc(fdateS(l.end)) : "?"}` : ""}</td></tr>`;
    }).join("") || `<tr><td colspan="6" class="muted" style="padding:18px">Nothing here.</td></tr>`}
    </tbody></table></div>`;
  v.appendChild(card);
  card.querySelectorAll("[data-mf]").forEach(b => b.onclick = () => { S.ui.mdF = b.dataset.mf; persistUi(); render(); });
  const qi = card.querySelector("#mdQ"); qi.oninput = () => { S.ui.mdQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#mdQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  card.querySelectorAll("[data-pmp]").forEach(a => a.onclick = e => { e.preventDefault(); pmOpenProperty(a.dataset.pmp); });
  card.querySelectorAll("[data-link]").forEach(s => s.onchange = () => {
    const id = s.dataset.link;
    if(s.value) L.links[id] = s.value; else delete L.links[id];
    // a unit can only belong to one property here
    if(s.value && s.value !== "none") Object.keys(L.links).forEach(k => { if(k !== id && L.links[k] === s.value) delete L.links[k]; });
    _mdxCache = null; commit(); mdAfterSnapshotForce(); render();
  });

  // MagicDoor units with no property here
  if(x.unmatchedUnits.length && L.organize === false){
    const un = elm("div","card"); un.style.marginTop = "16px";
    un.innerHTML = `<div class="card-h"><h3>In MagicDoor, not here</h3><span class="muted" style="margin-left:auto;font-size:12px">${x.unmatchedUnits.length} unit${x.unmatchedUnits.length === 1 ? "" : "s"}</span></div>
      <div class="card-b md-un">${x.unmatchedUnits.map(u => {
        const l = (S.md.leases || []).find(z => z.unitId === u.id && !z.ended);
        return `<div class="md-un-r"><div><b>${esc(uLabel(u))}</b><div class="item-s">${l ? esc(mdTenants(l)) + (l.rent ? " · " + usd(cents(l.rent)) + "/mo" : "") : "No active lease"}${props[u.propertyId] && props[u.propertyId].portfolio ? " · " + esc(props[u.propertyId].portfolio) : ""}</div></div>
          <button class="btn ghost sm" data-ignu="${esc(u.id)}">Not PHD's</button><button class="btn sm" data-addu="${esc(u.id)}">Add as property</button></div>`;
      }).join("")}
      <p class="help">If one of these is a property you already have, pick it in the list above instead. Units PHD doesn't manage can stay here.</p></div>`;
    v.appendChild(un);
    un.querySelectorAll("[data-addu]").forEach(b => b.onclick = () => mdAddProperty(b.dataset.addu, uLabel));
    un.querySelectorAll("[data-ignu]").forEach(b => b.onclick = () => { L.ignore[b.dataset.ignu] = true; _mdxCache = null; commit(); render(); });
  }
  if(S.md.notes && S.md.notes.length) v.appendChild(elm("p","help", esc(S.md.notes.join(" · "))));
}
// after a person changes a link, apply that property's details right away (if automatic)
// after a person changes a link or adds a unit, apply it right away rather than waiting for the next sync
function mdAfterSnapshotForce(){ const L = mdLinks(); if(L.auto !== false && mdReady()){ _mdxCache = null; const n = mdApply({quiet:true}); if(n) toast(`MagicDoor: ${n} update${n === 1 ? "" : "s"} applied`); render(); } }

function mdAddProperty(unitId, uLabel){
  const u = (S.md.units || []).find(z => z.id === unitId); if(!u) return;
  const l = (S.md.leases || []).find(z => z.unitId === u.id && !z.ended);
  const c = mdCleanName(u, (S.md.properties || []).find(z => z.id === u.propertyId));
  const p = {id:"pm_" + uid(), name:c.name, address:c.address, aliases:[], rent:l && l.rent ? l.rent : u.marketRent || null,
    feeRule:{type:"pct", rate:10}, adminRate:10, status:l ? "active" : "vacant", statusSince:todayISO(), ownerId:null, tenants:"", notes:"Added from MagicDoor", recurring:[], mdCreated:true};
  pmState().properties.push(p);
  mdLinks().links[p.id] = u.id; _mdxCache = null;
  commit(); mdAfterSnapshotForce();
  toast(`${p.name} added — check its PM fee rule`); render();
}

function mdSheet(title, body, buttons){
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>${esc(title)}</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">${body}</div><div class="sheet-f"><span style="flex:1"></span>${buttons.map((b, i) => `<button class="btn ${b[2] || ""}" data-shb="${i}">${esc(b[0])}</button>`).join("")}</div>`;
  $("#shClose").onclick = closeSheet;
  sh.querySelectorAll("[data-shb]").forEach(b => b.onclick = () => buttons[+b.dataset.shb][1]());
  openPanel();
}
function mdPreviewSheet(plan){
  const o = mdOrganizePlan();
  const orgRows = [].concat(o.merge.map(m => [m.keep.name, `merge in duplicate "${m.drop.name}"`]), o.create.map(c => [mdCleanName(c.u, c.mp).name, `add${c.mp && c.mp.portfolio ? " · " + c.mp.portfolio : ""}`]),
    o.rename.map(r => [r.p.name, `rename to "${r.name}"`]), o.reactivate.map(r => [r.p.name, "back from no longer managed"]), o.remove.map(r => [r.p.name, "remove (test or deleted in MagicDoor)"]), o.retire.map(r => [r.p.name, "mark no longer managed"]));
  mdSheet("Updates from MagicDoor", `<div class="md-prev">
    ${orgRows.length ? `<div class="label">Property list</div>${orgRows.map(([a, b]) => `<div class="md-pv-r" style="grid-template-columns:1fr 1.4fr"><span>${esc(a)}</span><span class="muted">${esc(b)}</span></div>`).join("")}` : ""}
    ${plan.owners.length ? `<div class="label">New owners</div>${plan.owners.map(o => `<div class="md-log-l">${esc(o.name)} <span class="muted">${esc(o.email || "")}</span></div>`).join("")}` : ""}
    ${plan.props.length ? `<div class="label" style="margin-top:12px">Properties</div>${plan.props.map(({p, ch}) => `<div class="md-pv"><b>${esc(p.name)}</b>${Object.entries(ch).map(([k, c]) =>
      `<div class="md-pv-r"><span>${esc(c.label)}</span><span class="muted">${esc(k === "ownerId" ? "none" : k === "rent" ? usd(cents(c.from || 0)) : String(c.from || "—"))}</span><span>→ ${esc(k === "ownerId" ? (c.to.name || "") : k === "rent" ? usd(cents(c.to)) : String(c.to))}</span></div>`).join("")}</div>`).join("")}` : ""}
    ${plan.rows.length ? `<div class="label" style="margin-top:12px">Rent to record</div>${plan.rows.map(r => `<div class="md-pv-r"><span>${esc(r.p.name)}</span><span class="muted">${r.lastPayment ? "paid " + esc(fdateS(r.lastPayment)) : "credit"}</span><span class="num">${usd(cents(r.amount))}</span></div>`).join("")}` : ""}
    ${(plan.memos.length + plan.relinks.length + plan.dupes.length + plan.gone.length + plan.skips.filter(x => x.it).length) ? `<div class="label" style="margin-top:12px">Bills edited in MagicDoor</div>${[
        ...plan.memos.map(x => [x.p.name, `${x.it.vendor || ""} · “${x.memo}”`, x.it.amount]),
        ...plan.relinks.map(x => [x.p.name, `${x.it.vendor || ""} · ${x.memo ? "“" + x.memo + "”" : "relinked"}`, x.li.amount]),
        ...plan.dupes.map(x => [x.p.name, `${x.keep.vendor || ""} · duplicate removed${x.memo ? " · “" + x.memo + "”" : ""}`, x.keep.amount]),
        ...plan.gone.map(x => [x.p.name, `${x.it.vendor || ""} · deleted in MagicDoor`, x.it.amount]),
        ...plan.skips.filter(x => x.it).map(x => [x.p.name, `${x.it.vendor || ""} · off the owner statement (${x.why === "project" ? "project expense" : "not the owner's"})`, x.it.amount])
      ].map(([a, b, c]) => `<div class="md-pv-r"><span>${esc(a)}</span><span class="muted">${esc(b)}</span><span class="num">${usd(cents(c))}</span></div>`).join("")}` : ""}
    ${plan.bills.length ? `<div class="label" style="margin-top:12px">Vendor bills to add as repairs</div>${plan.bills.map(b => `<div class="md-pv-r"><span>${esc(b.p.name)}</span><span class="muted">${esc(fdateS(b.li.date))} · ${esc(b.li.vendor || "")}${b.twin ? " · matches one already entered" : ""}</span><span class="num">${usd(cents(b.li.amount))}</span></div>`).join("")}` : ""}
    ${plan.payouts.length ? `<div class="label" style="margin-top:12px">Owner payouts sent in MagicDoor</div>${plan.payouts.map(x => `<div class="md-pv-r"><span>${esc(x.p.name)}</span><span class="muted">${esc(monthLabel(x.row.month))} · ${esc(fdateS(x.date))}</span><span class="num">${usd(cents(x.amount))}</span></div>`).join("")}` : ""}
  </div>`, [["Close", closeSheet, "ghost"], ["Apply now", () => { closeSheet(); mdApply(); render(); }, "primary"]]);
}

async function mdProbeSheet(){
  mdSheet("Check more MagicDoor data", `<p class="muted" style="margin-top:0">Rent payments, vendor bills, owner distributions and work orders aren't in the sync yet because MagicDoor doesn't document where they live. This checks the likely addresses and lists field names and types only — no names, addresses or amounts.</p>
    <div id="mdProbeOut"><p class="muted">Checking… this takes up to a minute.</p></div>`, [["Close", closeSheet, "ghost"]]);
  try{
    const d = await mdCall("probe");
    const rows = Object.entries(d.endpoints || {}), ok = rows.filter(([, r]) => r && r.status === 200).length, txt = JSON.stringify(d, null, 1);
    const out = $("#mdProbeOut"); if(!out) return;
    out.innerHTML = `<p><b>${ok} of ${rows.length}</b> readable.</p>${rows.map(([p, r]) => `<div class="md-pv-r"><span class="num" style="color:${r && r.status === 200 ? "var(--green)" : "var(--muted)"}">${esc(String(r && r.status))}</span><span>${esc(p.replace("/company-app/", ""))}</span><span class="muted">${r && r.status === 200 && r.count != null ? r.count + " rows" : ""}</span></div>`).join("")}
      <p class="help" style="margin-top:12px">Copy the report and paste it to Claude to add these to the sync.</p><button class="btn primary sm" id="mdProbeCopy">Copy report</button>`;
    out.querySelector("#mdProbeCopy").onclick = async () => { try{ await navigator.clipboard.writeText(txt); toast("Report copied"); }catch(e){ const ta = elm("textarea"); ta.value = txt; ta.style.cssText = "width:100%;height:200px;margin-top:8px"; out.appendChild(ta); ta.select(); } };
  }catch(e){ const out = $("#mdProbeOut"); if(out) out.innerHTML = `<p style="color:var(--red)">${esc(e.message)}</p>`; }
}

/* ---------- MagicDoor panel on a property's page ---------- */
function mdPropertyCard(p){
  if(!mdReady()) return null;
  const m = mdFor(p.id), c = elm("div","card md-card");
  if(!m){
    c.innerHTML = `<div class="card-h"><h3>MagicDoor</h3><span class="muted" style="margin-left:auto;font-size:12px">${mdLinks().links[p.id] === "none" ? "Marked as not in MagicDoor" : "Not linked"}</span></div>
      <div class="card-b"><a href="#" id="mdGoLink">Link it on the MagicDoor page</a></div>`;
    c.querySelector("#mdGoLink").onclick = e => { e.preventDefault(); S.ui.mdF = "unlinked"; go("pmMd"); };
    return c;
  }
  const l = m.lease, e = m.endedLease;
  if(l && l.combined){
    const unitName = id => ((m.units || []).find(u => u.id === id) || {}).name || "";
    c.innerHTML = `<div class="card-h"><h3>MagicDoor</h3><span class="muted" style="margin-left:auto;font-size:12px">whole property · ${l.count} leases · synced ${esc(mdAgo(S.md.syncedAt))}</span></div>
      <div class="card-b"><div class="md-bal ${l.balance > 0 ? "owe" : ""}"><div class="label">Balance, all units</div><div class="v num">${l.balance > 0 ? usd(cents(l.balance)) : "Paid up"}</div>
        <div class="s">${l.owingCount ? `${l.owingCount} of ${l.count} owe · up to ${l.pastDueDays} days past due` : l.lastPayment ? "Last payment " + esc(fdateS(l.lastPayment)) : ""}</div></div>
      <table class="tbl" style="font-size:13px"><thead><tr><th>Unit</th><th>Tenants</th><th class="r">Rent</th><th class="r">Balance</th></tr></thead><tbody>
      ${[...m.leases].sort((a, b) => String(unitName(a.unitId)).localeCompare(unitName(b.unitId), undefined, {numeric:true})).map(x => `<tr><td>${esc(unitName(x.unitId) || x.unitName || "")}</td><td>${esc(mdTenants(x)) || "—"}</td><td class="r num">${x.rent ? usd(cents(x.rent)) : "—"}</td>
        <td class="r num">${x.balance > 0 ? `<span style="color:var(--red)">${usd(cents(x.balance))}</span>` : `<span style="color:var(--green)">Paid</span>`}</td></tr>`).join("")}</tbody></table>
      ${mdHistoryHTML(m)}
      <div class="item-s" style="margin-top:8px">Rent in MagicDoor totals ${usd(cents(l.rent))}/mo · ${esc(m.how === "auto" ? "matched by address" : "linked by hand")} · <a href="#" id="mdChange">change</a></div></div>`;
    c.querySelector("#mdChange").onclick = ev => { ev.preventDefault(); S.ui.mdQ = p.name; S.ui.mdF = "all"; go("pmMd"); };
    return c;
  }
  c.innerHTML = `<div class="card-h"><h3>MagicDoor</h3><span class="muted" style="margin-left:auto;font-size:12px">synced ${esc(mdAgo(S.md.syncedAt))}</span></div>
    <div class="card-b">${l ? `<div class="md-bal ${l.balance > 0 ? "owe" : ""}"><div class="label">Balance</div><div class="v num">${l.balance > 0 ? usd(cents(l.balance)) : l.balance < 0 ? usd(cents(l.balance)) + " credit" : "Paid up"}</div>
        <div class="s">${l.balance > 0 && l.pastDueDays > 0 ? `${l.pastDueDays} days past due${l.unpaidSince ? " · since " + esc(fdateS(l.unpaidSince)) : ""}` : l.lastPayment ? "Last payment " + esc(fdateS(l.lastPayment)) : ""}</div></div>
      <dl class="kv"><dt>Tenants</dt><dd>${l.tenants.filter(t => !t.movedOut).map(t => `${esc(t.name)}${t.email ? ` · <a href="mailto:${esc(t.email)}">${esc(t.email)}</a>` : ""}${t.phone ? ` · <a href="tel:${esc(t.phone.replace(/[^\d+]/g, ""))}">${esc(t.phone)}</a>` : ""}`).join("<br>") || "—"}</dd>
        <dt>Lease</dt><dd>${l.start ? esc(fdateS(l.start)) : "?"} → ${l.monthToMonth ? "month-to-month" : l.end ? esc(fdateS(l.end)) : "?"}${l.eviction ? ` <span class="tag red">eviction</span>` : ""}</dd>
        <dt>Rent</dt><dd class="num">${l.rent ? usd(cents(l.rent)) : "—"}</dd>
        <dt>Deposit</dt><dd class="num">${l.depositPaid ? usd(cents(l.depositPaid)) + " held" : "—"}${l.depositDue > 0 ? ` <span class="muted" style="font-family:var(--sans)">· ${usd(cents(l.depositDue))} still due</span>` : ""}</dd>
        ${l.lastPayment ? `<dt>Last payment</dt><dd>${esc(fdateS(l.lastPayment))}</dd>` : ""}</dl>`
      : `<p class="muted" style="margin:0">No active lease in MagicDoor.${e && e.end ? ` Last lease ended ${esc(fdateS(e.end))}${e.depositPaid ? ` with ${usd(cents(e.depositPaid))} deposit held` : ""}.` : ""}</p>`}
      ${mdHistoryHTML(m)}
      <div class="item-s" style="margin-top:8px">${esc(m.how === "auto" ? "Matched by address" : "Linked by hand")} · <a href="#" id="mdChange">change</a></div></div>`;
  c.querySelector("#mdChange").onclick = ev => { ev.preventDefault(); S.ui.mdQ = p.name; S.ui.mdF = "all"; go("pmMd"); };
  return c;
}

function mdHistoryHTML(m){
  if(!m || !m.property) return "";
  const bills = [];
  (S.md.bills || []).forEach(bl => { if(bl.company) return; (bl.lines || []).forEach(li => { if(li.propertyId === m.property.id && li.amount) bills.push({date:bl.date, vendor:bl.vendor, memo:li.text || bl.memo, amount:li.amount, owed:bl.owed, fee:!PMCore.mdIsRepairLine(li, bl)}); }); });
  bills.sort((a, b) => String(b.date).localeCompare(a.date));
  const ds = PMCore.mdDistributions(S.md, m.property.id).sort((a, b) => String(b.date).localeCompare(a.date));
  if(!bills.length && !ds.length) return "";
  return `<div class="md-hist">
    ${bills.length ? `<div class="label" style="margin:14px 0 4px">Vendor bills in MagicDoor <span class="muted">· ${bills.length}</span></div>
      ${bills.slice(0, 8).map(x => `<div class="md-pv-r"><span>${esc(fdateS(x.date))} · ${esc(x.vendor || "—")}</span><span class="muted">${esc((x.memo || "").slice(0, 60))}</span><span class="num" style="text-align:right">${x.fee ? '<span class="tag grey" title="PHD\'s admin fee — the console adds it from the repairs, so it isn\'t counted again">admin fee</span> ' : ""}${usd(cents(x.amount))}${x.owed > 0 && !x.fee ? ' <span class="tag gold">unpaid</span>' : ""}</span></div>`).join("")}` : ""}
    ${ds.length ? `<div class="label" style="margin:14px 0 4px">Owner distributions <span class="muted">· ${ds.length}</span></div>
      ${ds.slice(0, 4).map(x => `<div class="md-pv-r"><span>${esc(fdateS(x.date))}</span><span class="muted">for ${esc(monthLabel(PMCore.mdPayoutMonth(x.date)))}</span><span class="num" style="text-align:right">${usd(cents(x.amount))}</span></div>`).join("")}` : ""}</div>`;
}

/* ---------- a short tag under each property in Month close ---------- */
function mdMonthTag(p){
  const m = mdFor(p.id); if(!m || !m.lease) return "";
  const l = m.lease;
  if(l.balance > 0) return ` · <span class="md-chip owe" title="From MagicDoor">MagicDoor: ${l.combined ? `${l.owingCount} of ${l.count} owe ` : "owes "}${usd(cents(l.balance))}${l.pastDueDays > 0 ? `, ${l.pastDueDays}d late` : ""}</span>`;
  if(l.lastPayment && l.lastPayment.slice(0, 7) >= todayISO().slice(0, 7)) return ` · <span class="md-chip" title="From MagicDoor">MagicDoor: paid ${esc(fdateS(l.lastPayment))}</span>`;
  return ` · <span class="md-chip" title="From MagicDoor">MagicDoor: paid up</span>`;
}

/* =====================================================================
   OWNER STATEMENT EMAILS — one Gmail draft per property, with its
   statement attached as a PDF. Made by a small Google script installed in
   the pm@ account (apps-script/Statements.gs), so the drafts live in pm@'s
   Gmail and nowhere else. Drafts only: nothing is ever sent.
   ===================================================================== */
const STMT_KEY = "phd-stmt-conn";
function stmtConn(){
  if(typeof Cloud !== "undefined" && Cloud.ready){ const v = S.stmtConn; return v && v.url && v.token ? v : null; }   // hosted: shared by the office
  try{ const v = JSON.parse(localStorage.getItem(STMT_KEY) || "null"); if(v && v.url && v.token) return v; }catch(e){}
  return null;
}
function setStmtConn(v){
  if(typeof Cloud !== "undefined" && Cloud.ready){ snapshot(); S.stmtConn = v || null; commit(); return; }
  try{ v ? localStorage.setItem(STMT_KEY, JSON.stringify(v)) : localStorage.removeItem(STMT_KEY); }catch(e){}
}
async function stmtCall(body, get){
  const c = stmtConn(); if(!c) throw new Error("Connect the statements mailbox first");
  const r = get ? await fetch(c.url + (c.url.includes("?") ? "&" : "?") + new URLSearchParams(Object.assign({token:c.token}, body)).toString(), {redirect:"follow"})
                : await fetch(c.url, {method:"POST", redirect:"follow", body:JSON.stringify(Object.assign({token:c.token}, body))});
  let j; try{ j = await r.json(); }catch(e){ throw new Error("The statements script didn't answer — check the web app URL and that it's deployed with access for Anyone"); }
  if(!j.ok) throw new Error(j.error === "unauthorized" ? "The statements key wasn't accepted — paste it again from the script's log" : (j.error || "Statements script error"));
  return j;
}
const STMT_TPL_DEFAULT = {subject:"Owner Statement – {address} – {month}", body:`Hello {first},

Attached is your owner statement for {address} for {month}. It includes the income, expenses, and activity for the property that month.

Please let us know if you have any questions. Thank you for your continued business. 

Sincerely,

PHD Property Management`};
const stmtTpl = () => Object.assign({}, STMT_TPL_DEFAULT, (pmSettings() || {}).stmtTpl || {});
const stmtFill = (t, first, addr, m) => String(t || "").replace(/Hello \{first\},/g, first ? `Hello ${first},` : "Hello,").replace(/\{first\}/g, first || "").replace(/\{address\}/g, addr).replace(/\{month\}/g, m ? monthLabel(m) : "");
// the subject always says which month (a saved wording without {month} gets it added)
const STMT_SUBJECT = (addr, m) => { const s = stmtFill(stmtTpl().subject, "", addr, m); return m && !s.includes(monthLabel(m)) ? `${s} – ${monthLabel(m)}` : s; };
const STMT_BODY = (first, addr, m) => stmtFill(stmtTpl().body, first, addr, m);
// this month's email for one property: the standard wording, or what was typed for it in the console
function stmtEdits(m){ const mm = pmState().meta[m] = pmState().meta[m] || {month:m, deductions:[], withdrawals:[]}; mm.emailEdits = mm.emailEdits || {}; return mm.emailEdits; }
function stmtCompose(m, x){
  const e = ((pmState().meta[m] || {}).emailEdits || {})[x.p.id] || {}, addr = stmtAddr(x.p);
  return {to:e.to || x.to, cc:e.cc != null ? e.cc : x.cc.join(", "), subject:e.subject || STMT_SUBJECT(addr, m), body:e.body || STMT_BODY(x.first, addr, m), edited:!!(e.subject || e.body)};
}
const STMT_CO = /\b(llc|l\.l\.c|inc|corp|corporation|trust|properties|property|holdings|company|co|lp|llp|ltd|group|investments?|buyers|homes|realty|partners|capital|estate|enterprises|ventures|management)\b/i;
// Owner name → the first name for "Hello ___". A name typed in the Email statements window is kept on the owner and wins.
//   "Ford Smith / Brad Home Buyers LLC" → Ford · "Chris Murphy -Gallagher Holdings LLC" → Chris
//   "WamplerCRE holdings LLC (Erik owner)" → Erik · "Hayden Albert dba Carolina Quality Buyers" → Hayden · "Brad Home Buyers LLC" → ""
const STMT_ROLE = /^(owner|owners|manager|member|contact|attn|attention|president|ceo|mgr|managing|partner|trustee|c\/o)$/i;
function stmtPersonFirst(seg){
  seg = String(seg || "").replace(/^(attn|attention|c\/o)[:\s]+/i, "").trim();
  if(!seg || STMT_CO.test(seg)) return "";
  const w = seg.split(/\s+/).filter(x => !/^(mr|mrs|ms|miss|dr)\.?$/i.test(x) && !STMT_ROLE.test(x))[0] || "";
  return /^[A-Za-z][A-Za-z'’-]+$/.test(w) && w.length > 1 ? w[0].toUpperCase() + w.slice(1) : "";
}
function stmtFirstName(o){
  if(!o) return "";
  if(o.greeting != null && String(o.greeting).trim() !== "") return String(o.greeting).trim();
  const raw = String(o.name || "").trim();
  const paren = (raw.match(/\(([^)]*)\)/g) || []).map(x => x.slice(1, -1));
  const main = raw.replace(/\([^)]*\)/g, " ");
  const segs = main.split(/\s+(?:dba|d\/b\/a|c\/o|and)\s+|\s*[\/&,;]\s*|\s+[-–—]\s*|\s*[–—]\s*/i).concat(paren);
  for(const seg of segs){ const f = stmtPersonFirst(seg); if(f) return f; }
  return "";
}
const stmtAddr = p => (p.address || p.name || "").replace(/\s+/g, " ").trim();
function stmtFileName(p, m){ return `Owner Statement - ${(p.name || "Property").replace(/\s*#\s*/g, " Unit ").replace(/[\\/:*?"<>|%]+/g, "-")} - ${monthLabel(m)}.pdf`; }
const stmtEmailOk = e => /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(String(e || "").trim());
function stmtCcList(o){ return String((o && o.cc) || "").split(/[,;\s]+/).filter(stmtEmailOk); }
function stmtDrafted(m){ const mm = pmState().meta[m] = pmState().meta[m] || {month:m, deductions:[], withdrawals:[]}; mm.drafts = mm.drafts || {}; return mm.drafts; }
// who gets one: every property with a statement line this month, and why one can't be made
function stmtCandidates(m){
  return pmMonthRows(m).filter(x => !x.row.detailOnly).map(({prop, row}) => {
    const o = prop.ownerId ? ownerById(prop.ownerId) : null;
    const to = o && String(o.email || "").trim();
    const why = !o ? "No owner on file" : !to ? "Owner has no email" : !stmtEmailOk(to) ? `Owner email “${to}” doesn't look right` : "";
    return {p:prop, row, o, to:to || "", cc:stmtCcList(o), first:stmtFirstName(o), why, done:(pmState().meta[m] || {}).drafts && pmState().meta[m].drafts[prop.id]};
  }).sort((a, b) => a.p.name.localeCompare(b.p.name, undefined, {numeric:true}));
}

/* The statement as a PDF-safe page: plain tables and system fonts, so Google's converter lays it out exactly. */
function pmStatementPdfHTML(m, pid, opts){
  opts = opts || {};
  const p = pmProp(pid), row = pmRow(m, pid), c = pmCalc(row, p), o = p.ownerId ? ownerById(p.ownerId) : null;
  const items = row.repairItems || [], addr = o ? ownerAddressLines(o) : [];
  const d = iso => iso ? docShort(String(iso).slice(0, 10)) : "";
  const neg = x => "−" + usd(Math.abs(x));
  const line = (date, what, vendor, amt, cls) => `<tr${cls ? ` class="${cls}"` : ""}><td class="dt">${date}</td><td>${what}</td><td class="vn">${vendor}</td><td class="r">${amt}</td></tr>`;
  const lines = [line("", `Rent received${row.rentDue && cents(row.rentDue) !== c.recv ? ` <span class="m">(${usd(cents(row.rentDue))} due)</span>` : ""}`, "", usd(c.recv))]
    .concat(items.map(it => { const L = stmtLine(it); return line(d(it.date), `${esc(L.title)}${L.detail ? `<br><span class="m">${esc(L.detail)}</span>` : ""}${L.link ? ` <a href="${esc(L.link)}" style="color:#1D5C57">invoice</a>` : L.mdFile && opts.attach ? ` <span class="m">· invoice attached</span>` : ""}`, esc(it.vendor || ""), neg(cents(it.amount))); }))
    .concat(!items.length && c.repairsC ? [line("", "Repairs", "", neg(c.repairsC))] : [])
    .concat(c.otherC ? [line("", "Other income", "", usd(c.otherC))] : [])
    .concat((row.adjustments || []).map(a => line("", esc(a.note || "Adjustment"), "", (cents(a.amount) < 0 ? "−" : "") + usd(Math.abs(cents(a.amount))))));
  const fees = [c.adminC ? line("", `Admin fee on repairs (${p.adminRate ?? 10}%)`, "", neg(c.adminC), "fee") : "",
    line("", `Property management fee (${esc(feeRuleText(p.feeRule))})`, "", c.pmFeeC ? neg(c.pmFeeC) : usd(0), "fee"),
    c.leasingC ? line("", "Leasing fee", "", neg(c.leasingC), "fee") : ""].join("");
  const owe = c.payoutC < 0;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Owner Statement</title><style>
  @page{size:letter;margin:0.6in}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#1A2322;margin:0}
  table{border-collapse:collapse;width:100%}
  .brand{font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;color:#1D5C57;font-weight:bold}
  h1{font-size:20pt;font-weight:normal;margin:4px 0 0}
  .hd td{vertical-align:top;padding:0}
  .hd .rt{text-align:right;font-size:10pt;color:#3A4745}
  .rule{border-top:2px solid #1D5C57;margin:14px 0 16px}
  .pt td{vertical-align:top;width:33%;padding:0 12px 0 0;font-size:10pt;line-height:1.45}
  .k{font-size:8pt;letter-spacing:1px;text-transform:uppercase;color:#6B7775;margin-bottom:3px}
  .big{font-size:16pt;font-weight:bold}
  h2{font-size:8.5pt;letter-spacing:1px;text-transform:uppercase;color:#6B7775;margin:22px 0 6px;font-weight:bold}
  .ac th{font-size:8pt;letter-spacing:.8px;text-transform:uppercase;color:#6B7775;text-align:left;border-bottom:1px solid #C9D1CE;padding:6px 6px;font-weight:bold}
  .ac td{padding:6px 6px;border-bottom:1px solid #ECEFED;font-size:10pt;vertical-align:top}
  .ac .r,.ac th.r{text-align:right;white-space:nowrap}
  .ac .dt{width:78px;color:#6B7775;white-space:nowrap} .ac .vn{width:150px;color:#3A4745}
  .ac tr.fee td{color:#3A4745}
  .ac tr.tot td{border-top:2px solid #1A2322;border-bottom:0;font-weight:bold;font-size:11pt;padding-top:9px}
  .m{color:#6B7775}
  .ft{margin-top:26px;font-size:9pt;color:#6B7775;line-height:1.5}
</style></head><body>
  <table class="hd"><tr><td><div class="brand">PHD Property Management</div><h1>Owner Statement</h1></td>
    <td class="rt"><b>${monthLabel(m)}</b><br>Prepared ${docLong(todayISO())}</td></tr></table>
  <div class="rule"></div>
  <table class="pt"><tr>
    <td><div class="k">Owner</div>${o ? `<b>${esc(o.name || o.company)}</b>${o.name && o.company ? `<br>${esc(o.company)}` : ""}${addr.map(l => `<br>${esc(l)}`).join("")}` : `<span class="m">—</span>`}</td>
    <td><div class="k">Property</div><b>${esc(p.name)}</b>${p.address && p.address !== p.name ? `<br>${esc(p.address)}` : ""}</td>
    <td><div class="k">${owe ? "Balance due from owner" : "Paid to you"}</div><div class="big">${usd(Math.abs(c.payoutC))}</div><span class="m">for ${monthLabel(m)}${row.paidOut && row.paidOut.date ? ` · sent ${d(row.paidOut.date)}` : ""}</span></td>
  </tr></table>
  <h2>Activity</h2>
  <table class="ac"><thead><tr><th>Date</th><th>Description</th><th>Vendor</th><th class="r">Amount</th></tr></thead>
    <tbody>${lines.join("")}${fees}
    <tr class="tot"><td></td><td colspan="2">${owe ? "Balance due from owner" : "Owner payout"}</td><td class="r">${owe ? usd(-c.payoutC) : usd(c.payoutC)}</td></tr></tbody></table>
  <div class="ft">Questions about any line are welcome — receipts are on file for every repair.<br>PHD Property Management</div>
</body></html>`;
}

/* Make the drafts, ten at a time (Apps Script has a 6-minute limit per call). */
async function stmtMakeDrafts(m, list, opts){
  opts = opts || {};
  if(!stmtConn()) throw new Error("Connect the statements mailbox first (Month close → Email statements).");
  const done = [], failed = [], attach = opts.attach != null ? opts.attach : stmtAttachOn(), step = attach ? 3 : 10;
  for(let i = 0; i < list.length; i += step){
    const batch = list.slice(i, i + step);
    if(opts.progress) opts.progress(i, list.length);
    const items = [];
    for(const x of batch){
      const c = stmtCompose(m, x), extra = attach ? await stmtInvoiceFiles(x.row) : [];
      items.push({id:x.p.id, to:c.to, cc:String(c.cc || "").split(/[,;\s]+/).filter(stmtEmailOk).join(","), subject:c.subject, body:c.body, html:pmStatementPdfHTML(m, x.p.id, {attach:extra.length > 0}), fileName:stmtFileName(x.p, m), extra});
    }
    let res;
    try{ res = await stmtCall({action:opts.send ? "send" : "drafts", items}); }
    catch(e){ batch.forEach(x => failed.push({x, error:e.message})); if(/Connect|key|answer/.test(e.message)) break; continue; }
    (res.results || []).forEach(r => { const x = batch.find(b => b.p.id === r.id); if(!x) return;
      const want = (items.find(it => it.id === r.id) || {}).extra || [];
      if(r.ok && want.length && r.attached == null) r.note = "the pm@ script needs updating to attach invoices";
      r.ok ? done.push({x, r}) : failed.push({x, error:r.error || "failed"}); });
  }
  if(done.length){
    snapshot();
    const D = stmtDrafted(m), by = (typeof Cloud !== "undefined" && Cloud.email) || "";
    done.forEach(({x, r}) => D[x.p.id] = r.sent ? {at:r.at || new Date().toISOString(), sentAt:r.at || new Date().toISOString(), to:stmtCompose(m, x).to, by, from:r.from || "", threadId:r.threadId || "", state:"sent", fromConsole:true}
      : {at:new Date().toISOString(), to:stmtCompose(m, x).to, by, from:r.from || "", draftId:r.draftId || "", threadId:r.threadId || "", state:"draft"});
    commit();
  }
  return {done, failed};
}

// ask pm@'s Gmail where each statement email stands; deleted drafts are forgotten so they can be made again
async function stmtRefresh(m){
  const D = ((pmState().meta[m] || {}).drafts) || {}, ids = Object.keys(D).filter(k => D[k] && D[k].state !== "sent");
  if(!ids.length || !stmtConn()) return false;
  const res = await stmtCall({action:"status", items:ids.map(id => ({id, draftId:D[id].draftId || "", threadId:D[id].threadId || ""}))});
  let changed = false;
  (res.results || []).forEach(x => {
    const rec = D[x.id]; if(!rec) return;
    if(x.state === "deleted" || x.state === "gone"){ if(!changed) snapshot(); delete D[x.id]; changed = true; }
    else if(x.state === "sent" && rec.state !== "sent"){ if(!changed) snapshot(); rec.state = "sent"; rec.sentAt = x.at || new Date().toISOString(); changed = true; }
  });
  if(changed) commit();
  return changed;
}
function pmStatementMailSheet(m){
  const sh = $("#sheet"), set = pmSettings();
  let cands = stmtCandidates(m), sel = {};
  cands.forEach(x => { if(!x.why && !x.done) sel[x.p.id] = true; });
  const draw = (busy, note) => {
    const ready = cands.filter(x => !x.why), n = ready.filter(x => sel[x.p.id]).length, blocked = cands.filter(x => x.why);
    const months = [...new Set(pmMonths().filter(mm => pmMonthRows(mm).some(x => !x.row.detailOnly)).concat([m]))].sort().reverse();
    sh.innerHTML = `<div class="sheet-h"><div><h3 class="sm-title">Email statements · <select id="smMonth" aria-label="Statement month">${months.map(mm => `<option value="${mm}" ${mm === m ? "selected" : ""}>${monthLabel(mm)}${(pmState().meta[mm] || {}).closed ? "" : " (open)"}</option>`).join("")}</select></h3><div class="muted" style="font-size:12.5px;margin-top:3px">One email per property from pm@, with its statement attached as a PDF. Check or edit any of them first, then send from here or save them as Gmail drafts.</div></div>
        <button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
      <div class="sheet-b">
        ${!stmtConn() ? `<div class="sm-setup"><b>Connect the statements mailbox</b>
            <p>The drafts are made in pm@phdproperties.realestate's Gmail by a small Google script installed in that account (<code>apps-script/Statements.gs</code> — setup steps are at the top of the file). Paste its web app URL and console key:</p>
            <label class="fld"><span>Web app URL</span><input type="url" id="smUrl" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
            <label class="fld"><span>Console key</span><input type="password" id="smTok" placeholder="64 characters" autocomplete="off"></label>
            <button class="btn primary sm" id="smConn" type="button">Connect</button> <span id="smMsg" class="muted" style="font-size:12.5px;margin-left:8px"></span></div>`
          : `<div class="sm-box">Drafts go to <b>${esc(stmtConn().mailbox || "the statements mailbox")}</b> → Drafts · <a href="#" id="smChange">change</a></div>`}
        ${note ? `<div class="pm-banner">${note}</div>` : ""}
        <div class="sm-list">${ready.map(x => `<label class="sm-r">
            <input type="checkbox" data-s="${x.p.id}" ${sel[x.p.id] ? "checked" : ""} ${busy ? "disabled" : ""}>
            <div class="sm-t"><b>${esc(x.p.name)}</b><span>To ${esc(x.to)}${x.cc.length ? " · cc " + esc(x.cc.join(", ")) : ""}</span></div>
            <div class="sm-hi"><span class="muted">Hello</span> <input type="text" data-fn="${x.p.id}" value="${esc(x.first)}" placeholder="(no name)" ${busy ? "disabled" : ""}></div>
            ${x.done ? (x.done.state === "sent" ? `<span class="tag green" title="Sent from Gmail">Sent ${esc(fdateS(String(x.done.sentAt || x.done.at).slice(0, 10)))}</span>`
                : `<span class="tag gold" title="${esc("Waiting in Gmail Drafts — made " + fdateS(x.done.at.slice(0, 10)) + (x.done.by ? " by " + x.done.by : ""))}">Draft in Gmail</span>`) : `<span></span>`}
            <span class="sm-acts">${x.done && x.done.state === "draft" && x.done.draftId ? `<button class="btn sm" data-sd="${x.p.id}" type="button" ${busy ? "disabled" : ""}>Send draft</button>` : ""}<button class="btn sm ghost" data-pv="${x.p.id}" type="button">${stmtCompose(m, x).edited ? "Edited · open" : "Preview & edit"}</button></span></label>`).join("") || `<p class="muted">No statements for ${monthLabel(m)} yet.</p>`}</div>
        ${blocked.length ? `<div class="label" style="margin:16px 0 6px">Can't draft yet · ${blocked.length}</div>
          <div class="sm-list">${blocked.map(x => `<div class="sm-r off"><span></span><div class="sm-t"><b>${esc(x.p.name)}</b><span>${esc(x.why)}</span></div><span></span><span></span>${x.o ? `<button class="btn sm ghost" data-ow="${x.o.id}" type="button">Open owner</button>` : `<button class="btn sm ghost" data-pp="${x.p.id}" type="button">Set owner</button>`}</div>`).join("")}</div>` : ""}
        <label class="sm-auto"><input type="checkbox" id="smAttach" ${stmtAttachOn() ? "checked" : ""}> Attach the vendors' invoices from MagicDoor to each statement</label>
        <label class="sm-auto"><input type="checkbox" id="smAuto" ${set.autoDrafts !== false ? "checked" : ""}> Make these drafts automatically when a month is closed</label>
      </div>
      <div class="sheet-f"><button class="btn ghost sm" id="smAll" ${busy ? "disabled" : ""}>${n === ready.length ? "Select none" : "Select all"}</button><span style="flex:1"></span>
        <button class="btn" id="shCancel">Close</button><button class="btn" id="smGo" ${!n || busy || !stmtConn() ? "disabled" : ""}>${busy ? esc(busy) : `Save ${n} as Gmail draft${n === 1 ? "" : "s"}`}</button><button class="btn primary" id="smSend" ${!n || busy || !stmtConn() ? "disabled" : ""}>Send ${n} now</button></div>`;
    $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
    $("#smMonth").onchange = e => pmStatementMailSheet(e.target.value);
    sh.querySelectorAll("[data-s]").forEach(i => i.onchange = () => { sel[i.dataset.s] = i.checked; draw(); });
    sh.querySelectorAll("[data-fn]").forEach(i => {
      i.oninput = () => { const x = cands.find(c => c.p.id === i.dataset.fn); if(x) x.first = i.value.trim(); };
      i.onchange = () => {   // keep it on the owner, so every statement to them uses it from now on
        const x = cands.find(c => c.p.id === i.dataset.fn); if(!x || !x.o) return;
        snapshot(); x.o.greeting = i.value.trim(); commit();
        cands.filter(c => c.o && c.o.id === x.o.id).forEach(c => c.first = i.value.trim());
        sh.querySelectorAll("[data-fn]").forEach(j => { const y = cands.find(c => c.p.id === j.dataset.fn); if(y && y.o && y.o.id === x.o.id && j !== i) j.value = y.first; });
      };
    });
    sh.querySelectorAll("[data-pv]").forEach(b => b.onclick = e => { e.preventDefault(); stmtEmailSheet(m, b.dataset.pv); });
    sh.querySelectorAll("[data-sd]").forEach(b => b.onclick = async e => { e.preventDefault();
      const x = cands.find(c => c.p.id === b.dataset.sd), rec = x && x.done; if(!rec) return;
      if(!confirm(`Send the Gmail draft to ${rec.to} from ${(stmtConn() || {}).mailbox || "pm@"} now?`)) return;
      b.disabled = true; b.textContent = "Sending…";
      try{ const r = ((await stmtCall({action:"sendDraft", items:[{id:x.p.id, draftId:rec.draftId}]})).results || [])[0] || {};
        if(!r.ok) throw new Error(r.error || "Couldn't send it");
        snapshot(); Object.assign(stmtDrafted(m)[x.p.id], {state:"sent", sentAt:r.at, threadId:r.threadId || rec.threadId, fromConsole:true}); commit();
        cands = stmtCandidates(m).map(y => Object.assign(y, {first:(cands.find(c => c.p.id === y.p.id) || y).first})); draw(null, `Sent to ${esc(rec.to)}.`); toast("Statement sent");
      }catch(er){ draw(null, esc(/unknown action/i.test(er.message) ? "Update the pm@ script to the new version (apps-script/Statements.gs) to send from the console." : er.message)); } });
    sh.querySelectorAll("[data-ow]").forEach(b => b.onclick = () => { closeSheet(); openOwner(b.dataset.ow); });
    sh.querySelectorAll("[data-pp]").forEach(b => b.onclick = () => pmPropSheet(b.dataset.pp));
    $("#smAll").onclick = () => { const all = n !== ready.length; ready.forEach(x => sel[x.p.id] = all); draw(); };
    const cn = $("#smConn"); if(cn) cn.onclick = async () => {
      const url = $("#smUrl").value.trim(), token = $("#smTok").value.trim(), msg = $("#smMsg");
      if(!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)){ msg.textContent = "That should be a script.google.com …/exec URL."; return; }
      if(token.length < 32){ msg.textContent = "The key looks too short."; return; }
      msg.textContent = "Checking…";
      const prev = stmtConn(); setStmtConn({url, token});
      try{ const j = await stmtCall({action:"ping"}, true); setStmtConn({url, token, mailbox:j.mailbox || "", signature:j.signature || "", fromName:j.fromName || "", canSend:!!j.canSend}); toast(`Connected — drafts will be saved in ${j.mailbox}`, true); draw(); }
      catch(e){ setStmtConn(prev); msg.textContent = e.message; }
    };
    const chg = $("#smChange"); if(chg) chg.onclick = e => { e.preventDefault(); if(confirm("Disconnect the statements mailbox? You can paste a new URL and key afterwards.")){ setStmtConn(null); draw(); } };
    $("#smAuto").onchange = e => { snapshot(); S.pmSettings = Object.assign({}, S.pmSettings || {}, {autoDrafts:e.target.checked}); commit(); };
    $("#smAttach").onchange = e => { snapshot(); S.pmSettings = Object.assign({}, S.pmSettings || {}, {stmtAttach:e.target.checked}); commit(); };
    const run = async send => {
      const list = cands.filter(x => !x.why && sel[x.p.id]);
      if(send && !confirm(`Send ${list.length} owner statement${list.length === 1 ? "" : "s"} now from ${(stmtConn() || {}).mailbox || "pm@"}?\n\nEach goes to its owner with the statement PDF attached. Open "Preview & edit" first if you want to check one.`)) return;
      draw(send ? "Sending…" : "Creating drafts…");
      try{
        const {done, failed} = await stmtMakeDrafts(m, list, {send, progress:(i, t) => { const b = $(send ? "#smSend" : "#smGo"); if(b) b.textContent = `${send ? "Sending" : "Creating"} ${i + 1}–${Math.min(i + 10, t)} of ${t}…`; }});
        cands = stmtCandidates(m).map(x => Object.assign(x, {first:(list.find(l => l.p.id === x.p.id) || x).first})); sel = {};
        failed.forEach(f => sel[f.x.p.id] = true);
        const fe = failed.length && /unknown action/i.test(failed[0].error) ? "Update the pm@ script to the new version (apps-script/Statements.gs) to send from the console." : failed.length ? failed[0].error : "";
        const upd = done.some(d => d.r.note) ? " Invoices weren't attached — update the pm@ script (apps-script/Statements.gs) and deploy a new version." : "";
        draw(null, `${done.length ? (send ? `${done.length} sent from ${esc((done[0].r.from) || "pm@")}.` : `${done.length} draft${done.length === 1 ? "" : "s"} waiting in Gmail${done[0] && done[0].r.from ? " — " + esc(done[0].r.from) + " → Drafts" : ""}.`) : ""}${failed.length ? ` ${failed.length} didn't go: ${esc(fe)}` : ""}${upd}`);
        toast(done.length ? (send ? `${done.length} statement${done.length === 1 ? "" : "s"} sent` : `${done.length} Gmail draft${done.length === 1 ? "" : "s"} created`) : "Nothing was sent", true);
      }catch(e){ draw(null, esc(e.message)); }
    };
    $("#smGo").onclick = () => run(false);
    $("#smSend").onclick = () => run(true);
  };
  draw(); openPanel();
  // check Gmail: drafts someone deleted are freed up, sent ones say "Sent"
  stmtRefresh(m).then(changed => { if(changed && $("#smGo")){ const keep = sel; cands = stmtCandidates(m).map(x => Object.assign(x, {first:(cands.find(c => c.p.id === x.p.id) || x).first})); sel = keep; draw(); } })
    .catch(e => { if(/unknown action/i.test(e.message) && $("#smGo")) draw(null, "To see which drafts were sent or deleted, update the pm@ script (apps-script/Statements.gs) and deploy a new version."); });
}

/* closing a month makes the drafts that aren't made yet (unless switched off) */
async function stmtAutoOnClose(m){
  if(pmSettings().autoDrafts === false || !stmtConn()) return;
  const list = stmtCandidates(m).filter(x => !x.why && !x.done);
  if(!list.length) return;
  toast(`Creating ${list.length} owner statement draft${list.length === 1 ? "" : "s"} in Gmail…`);
  try{
    const {done, failed} = await stmtMakeDrafts(m, list);
    toast(`${done.length} owner statement draft${done.length === 1 ? "" : "s"} ready in Gmail${failed.length ? ` · ${failed.length} couldn't be made (Owner statements → Email shows why)` : ""}`, true);
  }catch(e){ toast("Statement drafts: " + e.message); }
}

/* ---------- one statement email: see it, edit it, send it ---------- */
function stmtEmailSheet(m, pid){
  const sh = $("#sheet"), x = stmtCandidates(m).find(c => c.p.id === pid); if(!x) return;
  const c = stmtCompose(m, x), conn = stmtConn() || {}, rec = x.done;
  const sig = conn.signature || "";
  sh.innerHTML = `<div class="sheet-h"><div><h3>Owner statement · ${esc(x.p.name)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${monthLabel(m)} · from ${esc(conn.mailbox || "pm@phdproperties.realestate")}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      ${rec ? `<div class="pm-banner" style="background:var(--panel-2)">${rec.state === "sent" ? `Sent ${esc(fdateS(String(rec.sentAt || rec.at).slice(0, 10)))} to ${esc(rec.to)}.` : `A draft is waiting in Gmail (made ${esc(fdateS(String(rec.at).slice(0, 10)))}). Sending from here makes a fresh email with what's below.`}</div>` : ""}
      ${x.why ? `<div class="pm-banner">${esc(x.why)}</div>` : ""}
      <div class="f2"><label class="fld"><span>To</span><input type="text" id="seTo" value="${esc(c.to)}"></label><label class="fld"><span>Cc</span><input type="text" id="seCc" value="${esc(c.cc)}"></label></div>
      <label class="fld"><span>Subject</span><input type="text" id="seSub" value="${esc(c.subject)}"></label>
      <label class="fld"><span>Message</span><textarea id="seBody" rows="11">${esc(c.body)}</textarea></label>
      <div class="bm-prev-h"><b>Preview</b><span class="muted">what the owner will see</span></div>
      <div class="bm-prev" id="sePrev"></div>
      <div class="se-att">${icon("file")} <a href="#" id="sePdf">${esc(stmtFileName(x.p, m))}</a><span class="muted">attached</span></div>
      ${stmtMdFiles(x.row).length ? `<label class="se-att"><input type="checkbox" id="seAttach" ${stmtAttachOn() ? "checked" : ""}> Also attach ${stmtMdFiles(x.row).length} vendor invoice${stmtMdFiles(x.row).length === 1 ? "" : "s"} from MagicDoor</label>` : ""}
      ${stmtLinesBlock(x.row)}
      <label class="ps-chk"><input type="checkbox" id="seTpl"> Use this subject and message for every owner statement from now on</label>
      ${!stmtConn() ? `<div class="pm-banner">Connect pm@ first (back on the list).</div>` : !sig ? `<p class="help">No Gmail signature found for pm@ — add the Gmail API service in the script to include it.</p>` : ""}
    </div>
    <div class="sheet-f"><button class="btn ghost" id="seBack">← All statements</button><span style="flex:1"></span><button class="btn" id="seDraft" ${stmtConn() && !x.why ? "" : "disabled"}>Save as Gmail draft</button><button class="btn primary" id="seSend" ${stmtConn() && !x.why ? "" : "disabled"}>Send from pm@</button></div>`;
  openPanel();
  $("#shClose").onclick = closeSheet; $("#seBack").onclick = () => pmStatementMailSheet(m);
  const sub = $("#seSub"), body = $("#seBody"), prev = $("#sePrev");
  const html = t => t.split(/\n{2,}/).map(par => `<p style="margin:0 0 14px">${esc(par).replace(/\n/g, "<br>")}</p>`).join("");
  const draw = () => prev.innerHTML = `<div class="bm-sub">${esc(sub.value)}</div><div class="bm-from">${esc(conn.fromName || "PHD Property Management")} &lt;${esc(conn.mailbox || "pm@phdproperties.realestate")}&gt; · to ${esc($("#seTo").value)}</div><div class="bm-body">${html(body.value)}${sig ? `<div class="bm-sig">${sig}</div>` : ""}</div>`;
  [sub, body, $("#seTo")].forEach(i => i.oninput = draw); draw();
  $("#sePdf").onclick = e => { e.preventDefault(); printDoc(pmStatementPdfHTML(m, pid, {attach:!!($("#seAttach") && $("#seAttach").checked)})); };
  stmtWireLines(sh, x.row);
  const keep = () => {
    snapshot();
    const E = stmtEdits(m), addr = stmtAddr(x.p), std = {subject:STMT_SUBJECT(addr, m), body:STMT_BODY(x.first, addr, m)};
    const e = {to:$("#seTo").value.trim(), cc:$("#seCc").value.trim()};
    if(sub.value !== std.subject) e.subject = sub.value; if(body.value !== std.body) e.body = body.value;
    E[pid] = e;
    if($("#seTpl").checked){
      const un = t => String(t).split(addr).join("{address}").split(monthLabel(m)).join("{month}").replace(x.first ? new RegExp("Hello " + x.first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ",") : /^$/, "Hello {first},");
      S.pmSettings = Object.assign({}, S.pmSettings || {}, {stmtTpl:{subject:un(sub.value), body:un(body.value)}});
      delete e.subject; delete e.body;
    }
    commit();
  };
  const go = async send => {
    keep();
    const to = $("#seTo").value.split(/[,;\s]+/).filter(stmtEmailOk); if(!to.length) return toast("Add the owner's email");
    if(send && !confirm(`Send this statement to ${to.join(", ")} from ${conn.mailbox || "pm@"} now?`)) return;
    const b = $(send ? "#seSend" : "#seDraft"); b.disabled = true; b.textContent = send ? "Sending…" : "Saving…";
    try{
      const item = Object.assign({}, x, {to:to.join(",")});
      const {done, failed} = await stmtMakeDrafts(m, [item], {send, attach:!!($("#seAttach") && $("#seAttach").checked)});
      if(done.length && done[0].r.note) toast("Sent without the invoices — update the pm@ script to attach them");
      if(failed.length) throw new Error(/unknown action/i.test(failed[0].error) ? "Update the pm@ script to the new version (apps-script/Statements.gs) to send from the console." : failed[0].error);
      toast(send ? `Sent to ${to.join(", ")}` : "Draft saved in pm@'s Gmail"); pmStatementMailSheet(m);
    }catch(e){ toast(e.message); b.disabled = false; b.textContent = send ? "Send from pm@" : "Save as Gmail draft"; }
  };
  $("#seSend").onclick = () => go(true); $("#seDraft").onclick = () => go(false);
}

/* ---------- statement lines: say what the money was for ----------
   Each repair line on a statement gets a plain description: the kind of work (from the vendor and
   MagicDoor's account, before the line's own wording) and the detail. "August Bi-Weekly Turn Maintenance 1"
   from Salty Blades Lawn Care reads "Lawn care — August bi-weekly service, visit 1". Anything can be
   rewritten for the statement without touching the books (it's kept on the line as stmtDesc). */
const STMT_CATS = [
  [/lawn|landscap|\bmow|blades|yard|grass|tree|shrub|irrigat/i, "Lawn care"],
  [/pest|extermin|termite|\bbugs?\b|rodent|mosquito/i, "Pest control"],
  [/plumb|drain|sewer|septic|water heater|leak|faucet|toilet/i, "Plumbing"],
  [/hvac|heating|cooling|air cond|\ba\/c\b|furnace|heat pump|\bduct/i, "HVAC"],
  [/electric(?!ity bill)|outlet|breaker|wiring/i, "Electrical"],
  [/clean|maid|janitor|carpet/i, "Cleaning"],
  [/paint/i, "Painting"],
  [/roof|gutter/i, "Roofing & gutters"],
  [/appliance|fridge|refrigerator|washer|dryer|dishwasher|stove|oven|microwave/i, "Appliance repair"],
  [/locksmith|rekey|\block(s|out)?\b/i, "Locks & keys"],
  [/\bpool\b/i, "Pool service"],
  [/trash|junk|haul|dumpster|debris/i, "Trash & hauling"],
  [/inspect/i, "Inspection"],
  [/insurance/i, "Insurance"],
  [/\bhoa\b|homeowners? assoc|association dues/i, "HOA dues"],
  [/utilit|water bill|power bill|dominion energy|charleston water/i, "Utilities"],
  [/\bturn(over)?\b|make.?ready|move.?out/i, "Turnover"]
];
function stmtCat(s){ for(const [re, c] of STMT_CATS) if(re.test(s || "")) return c; return ""; }
const STMT_VAGUE = /^(turn(over)?\s*)?(repairs?|maintenance|misc\w*|work|labor|services?|materials?|bill|invoice|general)$/i;
function stmtLine(it){
  const f = it.mdLine && typeof mdReady === "function" && mdReady() ? mdLineById(it.mdLine) : null;
  const files = f && f.b && Array.isArray(f.b.files) ? f.b.files : [];
  const link = it.link || (files.find(x => x.url) || {}).url || "";
  const mdFile = !link && files.length && f.b.id ? {billId:f.b.id, fileId:files[0].id || "", name:files[0].name || ""} : null;
  if(it.stmtDesc) return {title:it.stmtDesc, detail:"", link, mdFile, vague:false, auto:false};
  const text = String(it.memo || (f && f.li && f.li.text) || "").replace(/\s+/g, " ").trim();
  const memo = f && f.b && f.b.memo && f.b.memo.trim() !== text ? f.b.memo.trim() : "";
  const cat = stmtCat(`${it.vendor || ""} ${f && f.li ? f.li.account : ""}`) || stmtCat(`${text} ${memo}`);
  let d = text;
  if(cat && cat !== "Turnover") d = d.replace(/\bturn\s+(maintenance|service)\b/ig, "service").replace(/\bturn\b\s*/ig, "");
  d = d.replace(/\bbi-?weekly\b/ig, "bi-weekly").replace(/\b(maintenance|service)\s+#?(\d{1,2})\b/i, "service, visit $2").replace(/\s{2,}/g, " ").trim();
  const core = d.replace(/^turn(over)?\s*/i, "");
  let title;
  if(!cat) title = d || "Repair";
  else if(!d || STMT_VAGUE.test(d) || STMT_VAGUE.test(core)) title = cat === "Turnover" ? `Turnover ${(core || "repairs").toLowerCase()}` : cat;
  else if(d.toLowerCase().includes(cat.toLowerCase().split(/[\s&]/)[0])) title = d;
  else title = `${cat} — ${d}`;
  const vague = (!text || STMT_VAGUE.test(text) || STMT_VAGUE.test(core)) && !memo;
  return {title, detail:memo, link, mdFile, vague, auto:true};
}
function stmtLinesBlock(row){
  const items = (row && row.repairItems) || [];
  if(!items.length) return "";
  const need = items.filter(it => stmtLine(it).vague).length;
  return `<div class="sl-h"><b>Lines on the statement</b><span class="muted">${need ? `${need} could say more — add what was done` : "how each charge reads to the owner"}</span></div>
    <div class="sl-list">${items.map((it, i) => { const L = stmtLine(it), auto = it.stmtDesc ? stmtLine(Object.assign({}, it, {stmtDesc:""})).title : L.title;
      return `<div class="sl-r${L.vague ? " vague" : ""}"><div class="sl-m"><span class="num">${usd(cents(it.amount))}</span><span class="muted">${esc(it.vendor || "")}${it.date ? " · " + esc(fdateS(it.date)) : ""}</span>${stmtInvLink(L, "sl-inv")}${L.mdFile && (L.vague || !it.stmtDesc) ? `<button type="button" class="btn sm ghost sl-read" data-rd="${i}">Describe from invoice</button>` : ""}</div>
        <input type="text" data-sl="${i}" data-auto="${esc(auto)}" value="${esc(it.stmtDesc || auto)}" aria-label="Description on the statement">
        ${L.detail ? `<div class="help">${esc(L.detail)}</div>` : ""}${L.vague ? `<div class="help" style="color:var(--gold)">MagicDoor only says “${esc(it.memo || "Repairs")}”. Say what was repaired, e.g. “Turnover — replaced kitchen faucet, patched and painted bedroom walls”.</div>` : ""}</div>`; }).join("")}</div>`;
}
function stmtWireLines(sh, row){
  sh.querySelectorAll("[data-sl]").forEach(inp => inp.onchange = () => {
    const it = row.repairItems[Number(inp.dataset.sl)]; if(!it) return;
    snapshot(); it.stmtDesc = inp.value.trim(); if(!it.stmtDesc || it.stmtDesc === inp.dataset.auto) delete it.stmtDesc;
    if(typeof pmTouch === "function") pmTouch(row);
    commit(); toast("Statement line updated");
    const r = inp.closest(".sl-r"); if(r) r.classList.toggle("vague", !it.stmtDesc && stmtLine(it).vague);
  });
  sh.querySelectorAll("[data-rd]").forEach(b => b.onclick = async () => {
    const i = Number(b.dataset.rd), it = row.repairItems[i], inp = sh.querySelector(`[data-sl="${i}"]`); if(!it || !inp) return;
    b.disabled = true; b.textContent = "Reading the invoice…";
    try{ inp.value = await stmtDescribe(it); inp.dispatchEvent(new Event("change")); b.textContent = "Done"; }
    catch(e){ toast(e.message); b.disabled = false; b.textContent = "Describe from invoice"; }
  });
}

/* ---------- the vendor's invoice from MagicDoor ---------- */
const MDF = {cache:new Map()};
const stmtAttachOn = () => pmSettings().stmtAttach !== false;
function stmtInvLink(L, cls){
  if(L.link) return `<a href="${esc(L.link)}" target="_blank" rel="noopener" class="${cls || ""}">Invoice</a>`;
  if(L.mdFile) return `<a href="#" data-mdf="${esc(L.mdFile.billId)}|${esc(L.mdFile.fileId)}" class="${cls || ""}" title="The vendor's invoice in MagicDoor">Invoice</a>`;
  return "";
}
// the MagicDoor files on a month's repair lines (one per bill)
function stmtMdFiles(row){
  const seen = new Set(), out = [];
  ((row && row.repairItems) || []).forEach(it => { const L = stmtLine(it); if(L.mdFile && !seen.has(L.mdFile.billId)){ seen.add(L.mdFile.billId); out.push(L.mdFile); } });
  return out;
}
async function mdBillFile(billId, fileId){
  const k = billId + "|" + fileId;
  if(MDF.cache.has(k)) return MDF.cache.get(k);
  if(typeof Cloud === "undefined" || !Cloud.ready) throw new Error("Opening MagicDoor files works in the hosted console");
  const p = Cloud.sb.functions.invoke("magicdoor", {body:{mode:"billFile", billId, fileId}}).then(({data, error}) => {
    if(error) throw new Error(error.message || "Couldn't reach MagicDoor");
    if(!data || !data.ok) throw new Error((data && data.error) || "MagicDoor didn't send the file");
    return data;
  });
  MDF.cache.set(k, p); p.catch(() => MDF.cache.delete(k));
  return p;
}
function mdBlobUrl(f){
  const bin = atob(f.data), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([u], {type:f.mime || "application/pdf"}));
}
async function stmtInvoiceFiles(row){
  const out = [];
  for(const f of stmtMdFiles(row).slice(0, 6)){
    try{ const x = await mdBillFile(f.billId, f.fileId); if(x.size <= 8 * 1024 * 1024) out.push({name:x.name || f.name || "Invoice", mime:x.mime, data:x.data}); }catch(e){ /* the statement still goes; the file is skipped */ }
  }
  return out;
}
document.addEventListener("click", async e => {
  const a = e.target.closest && e.target.closest("[data-mdf]"); if(!a) return;
  e.preventDefault(); e.stopPropagation();
  const [billId, fileId] = a.dataset.mdf.split("|"), w = window.open("", "_blank");
  if(w) w.document.write("<p style='font:14px system-ui;padding:24px;color:#555'>Getting the invoice from MagicDoor…</p>");
  try{ const f = await mdBillFile(billId, fileId); const url = mdBlobUrl(f); if(w) w.location.href = url; else window.open(url, "_blank"); }
  catch(er){ if(w) w.close(); toast(er.message); }
}, true);
// read the vendor's invoice and say what was done, for a line that only says "Repairs"
async function stmtDescribe(it){
  const L = stmtLine(it); if(!L.mdFile) throw new Error("No invoice in MagicDoor for this line");
  if(!inboxConn()) throw new Error("Connect the receipt inbox first — it reads the invoice");
  const f = await mdBillFile(L.mdFile.billId, L.mdFile.fileId);
  const r = await inboxPost({action:"describe", name:f.name, mime:f.mime, data:f.data, vendor:it.vendor || "", amount:it.amount, text:it.memo || ""});
  if(!r.description) throw new Error("The invoice didn't say");
  return r.description;
}

/* =====================================================================
   BILLS & OWNER INVOICES — the property-management money desk.
   A bill is a vendor's charge for a property. It gets paid (Nickel or
   recorded by hand) and recovered from the owner: deducted from that
   month's payout, put on an owner invoice, or kept as a PHD expense.
   Nickel calls happen server-side (Supabase function "payments"); every
   change in Nickel is confirmed by the person here, in Nickel's own words.
   QuickBooks is kept up to date by Nickel. No key or bank number here.
   ===================================================================== */
const BILL_CATS = ["Repairs", "Maintenance", "Plumbing", "HVAC", "Electrical", "Appliances", "Landscaping", "Pest control", "Cleaning", "Turnover", "Utilities", "Supplies", "Inspection", "Other"];
const BILL_REC = {deduct:"Deduct from owner payout", invoice:"Invoice the owner", phd:"PHD expense (not billed)"};
const BILL_PAYM = ["Nickel", "Check", "ACH / bank transfer", "Card", "MagicDoor", "Cash", "Other"];
const billList = () => Object.values(pmState().bills).filter(b => b && !b.deleted);
const invList = () => Object.values(pmState().invoices).filter(v => v && !v.deleted);
const billById = id => pmState().bills[id] || null;
const invById = id => pmState().invoices[id] || null;
const billWho = () => (typeof Cloud !== "undefined" && Cloud.email) || "";
const billFeeC = b => { if(!b || b.recover === "phd" || b.feeMode === "none") return 0; const p = pmProp(b.propertyId); return Math.round(cents(b.amount) * Number(p && p.adminRate != null ? p.adminRate : 10) / 100); };
const billPaid = b => b.status === "paid";
const billDays = iso => iso ? PMCore.dayNum(iso) - PMCore.dayNum(todayISO()) : null;
function billStatus(b){
  if(b.status === "void") return {k:"void", label:"Void", cls:"grey"};
  if(b.status === "paid") return {k:"paid", label:`Paid ${b.pay && b.pay.date ? fdateS(b.pay.date) : ""}`.trim(), cls:"green"};
  if(b.status === "paying") return {k:"paying", label:b.pay && b.pay.approval ? "Waiting for approval in Nickel" : b.pay && b.pay.scheduled ? `Arrives by ${fdateS(b.pay.scheduled)}` : "Payment processing", cls:"acc"};
  if(b.pay && b.pay.failed) return {k:"failed", label:"Payment failed", cls:"red"};
  const d = billDays(b.due);
  if(d != null && d < 0) return {k:"overdue", label:`Overdue ${-d}d`, cls:"red"};
  if(d != null && d <= 7) return {k:"due", label:d === 0 ? "Due today" : `Due in ${d}d`, cls:"gold"};
  return {k:"open", label:"To pay", cls:"grey"};
}
function billOwnerTag(b){
  if(b.status === "void") return "";
  if(b.recover === "phd") return `<span class="muted">PHD expense</span>`;
  if(b.recover === "deduct") return b.deduct && b.deduct.month ? `<span class="muted">From ${esc(monthShort(b.deduct.month))} payout</span>` : `<span class="tag gold">Not deducted yet</span>`;
  const v = b.invoiceId && invById(b.invoiceId);
  if(!v) return `<span class="tag gold">To invoice</span>`;
  return v.status === "paid" ? `<span class="muted">${esc(v.no)} · paid</span>` : `<span class="muted">On ${esc(v.no)}</span>`;
}

/* ---------- vendors (shared list, matched by name) ---------- */
// Nickel matches live in a server-written record (shared/nickel)
const nkVendor = id => ((S.nk || {}).vendors || {})[id] || {};
const nkOwner = id => ((S.nk || {}).customers || {})[id] || {};
function pmVendors(){ if(!S.pmVendors || !Array.isArray(S.pmVendors.list)) S.pmVendors = {list:[]}; return S.pmVendors.list; }
const vendorKey = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function vendorFind(name){ const k = vendorKey(name); return k ? pmVendors().find(v => vendorKey(v.name) === k) || null : null; }
function vendorEnsure(name){
  name = String(name || "").trim(); if(!name) return null;
  let v = vendorFind(name);
  if(!v){ v = {id:"vn_" + uid(), name, email:"", phone:"", address:"", city:"", state:"", zip:"", notes:"", createdAt:new Date().toISOString()}; pmVendors().push(v); }
  return v;
}
// names people have used before (vendors, past repairs, MagicDoor bills) for the vendor box
function vendorSuggestions(){
  const seen = new Map();
  const add = n => { n = String(n || "").trim(); const k = vendorKey(n); if(k && !seen.has(k)) seen.set(k, n); };
  pmVendors().forEach(v => add(v.name));
  Object.values(pmState().rows).forEach(r => (r.repairItems || []).forEach(it => add(it.vendor)));
  (S.md && S.md.bills || []).forEach(b => { if(!b.company && !/^PHD /i.test(b.vendor || "")) add(b.vendor); });
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/* ---------- the owner side of a bill: deduction lines in Month close ---------- */
// the month a deduction lands in: the bill's month, or this month when that one is closed
function billDeductMonth(b){
  const m = (b.deduct && b.deduct.month) || String(b.date || todayISO()).slice(0, 7);
  const closed = mm => (pmState().meta[mm] || {}).closed;
  if(!closed(m)) return m;
  let x = thisMonth(); while(closed(x)) x = monthAdd(x, 1);
  return x;
}
// keep the repair line in Month close in step with the bill (added, changed, moved or removed)
function billSyncDeduction(b){
  const P2 = pmState();
  const drop = () => { if(!b.deduct || !b.deduct.month) return; const r = P2.rows[b.deduct.month + "|" + (b.deduct.pid || b.propertyId)];
    if(r && !(P2.meta[b.deduct.month] || {}).closed){ r.repairItems = (r.repairItems || []).filter(i => i.billId !== b.id); pmTouch(r); } b.deduct = null; };
  if(b.status === "void" || b.recover !== "deduct" || !b.propertyId){ drop(); return; }
  const m = billDeductMonth(b);
  if(b.deduct && (b.deduct.month !== m || (b.deduct.pid && b.deduct.pid !== b.propertyId))){
    if((P2.meta[b.deduct.month] || {}).closed) return;           // already in a closed month: leave it where it is
    drop();
  }
  const row = pmEnsureRow(m, b.propertyId);
  row.repairItems = row.repairItems || [];
  let it = row.repairItems.find(i => i.billId === b.id);
  if(!it){ it = {id:uid(), billId:b.id, source:"Bill"}; row.repairItems.push(it); }
  Object.assign(it, {date:b.date || "", vendor:b.vendor || "", memo:b.memo || b.category || "Bill", amount:Number(b.amount) || 0, feeMode:b.feeMode === "none" ? "none" : "auto", link:(b.receipt && b.receipt.url) || it.link || ""});
  if(row.locked){ row.repairs = null; row.adminFee = null; }
  pmTouch(row);
  b.deduct = {month:m, pid:b.propertyId};
}
function billSave(b, isNew){
  snapshot();
  b.updatedAt = new Date().toISOString(); b.updatedBy = billWho();
  if(isNew){ b.createdAt = b.updatedAt; b.createdBy = billWho(); }
  if(b.vendor){ const v = vendorEnsure(b.vendor); b.vendorId = v.id; b.vendor = v.name; }
  pmState().bills[b.id] = b;
  billSyncDeduction(b);
  commit();
  return b;
}
function billNew(f){
  const p = pmProp(f.propertyId);
  return {id:"bl_" + uid(), propertyId:f.propertyId, vendor:(f.vendor || "").trim(), vendorId:null, billNo:f.billNo || "", date:f.date || todayISO(), due:f.due || "",
    amount:Math.round(Number(f.amount) * 100) / 100, memo:(f.memo || "").trim(), category:f.category || "Repairs", receipt:f.receipt || null,
    recover:f.recover || (p && p.ownerId ? "deduct" : "phd"), feeMode:f.feeMode || "auto", status:f.status || "open", pay:f.pay || null, deduct:f.deductMonth ? {month:f.deductMonth, pid:f.propertyId} : null,
    invoiceId:null, qbo:null, nickel:null, source:f.source || "", inbox:f.inbox || "", payNote:(f.payNote || "").trim()};
}

/* ---------- server calls (Supabase function "payments") ---------- */
const payOnline = () => typeof Cloud !== "undefined" && Cloud.ready;
async function payCall(mode, body, opts){
  opts = opts || {};
  if(!payOnline()) throw new Error("Nickel works in the hosted console (sign in first).");
  if(!opts.noSave){ clearTimeout(Cloud.timer); await Cloud.flush(); }    // the server reads what's saved, so save first
  const {data, error} = await Cloud.sb.functions.invoke("payments", {body:Object.assign({mode}, body || {})});
  if(error){
    if(error.name === "FunctionsFetchError" || /Failed to send a request/i.test(error.message || "")) throw new Error("Couldn't reach the payments function. Check your connection and try again.");
    let msg = error.message; try{ const b = await error.context.json(); if(b && b.error) msg = b.error; }catch(e){}
    throw new Error(msg);
  }
  if(data && Array.isArray(data.docs) && data.docs.length) await payPull(data.docs);   // even when it failed: the record shows why
  if(data && data.error && !opts.raw) throw new Error(data.error);
  return data || {};
}
// re-read the records the server changed, so the screen shows them right away
async function payPull(keys){
  for(const key of keys){
    const [kind, ...rest] = key.split("/"), id = rest.join("/");
    const {data} = await Cloud.sb.from("docs").select("data,version,deleted").eq("kind", kind).eq("id", id).maybeSingle();
    if(!data) continue;
    cloudApply(kind, id, data.data, data.deleted);
    Cloud.synced.set(key, {json:JSON.stringify(data.data), version:data.version, deleted:data.deleted});
  }
  recalc(); render();
}
let PAY = {status:null, loading:false, err:""};
async function payStatus(force){
  if(!payOnline()) return null;
  if(PAY.status && !force) return PAY.status;
  if(PAY.loading) return PAY.status;
  PAY.loading = true;
  try{ PAY.status = await payCall("status", {}, {noSave:true}); PAY.err = ""; }catch(e){ PAY.err = e.message; PAY.status = null; }
  PAY.loading = false; return PAY.status;
}
const NICKEL_APP = "https://app.nickel.com";
// Ask for connection status once; redraw the page once when it first arrives (never in a loop).
function payStatusThenRedraw(view){
  if(PAY.status || PAY.err || PAY.asked) return;
  PAY.asked = true;
  payStatus().then(() => { if(S.ui.view === view) render(); }).catch(() => {});
}
const nickelOn = () => !!(PAY.status && PAY.status.nickel && PAY.status.nickel.ok);
const nkQbOn = () => !!(nickelOn() && PAY.status.nickel.qbo && PAY.status.nickel.qbo.connected);
// pick up what happened in Nickel (payments cleared, owners paid, vendors' bank details) — reading only
let payRefreshAt = 0;
function payRefreshSoon(){
  if(!payOnline() || Date.now() - payRefreshAt < 10 * 60000) return;
  payRefreshAt = Date.now();
  payStatus().then(st => { if(st && st.nickel && st.nickel.ok) payCall("nickel.refresh", {}, {noSave:true}).then(r => { if(r.changed) toast(`${r.changed} update${r.changed === 1 ? "" : "s"} from Nickel`); }).catch(() => {}); });
}

/* ---------- Nickel confirmations ----------
   Anything that changes Nickel runs on the server, and Nickel asks for a confirmation.
   This window shows Nickel's own wording; only your click is sent back. Nothing runs
   without it, and if nobody answers in time nothing runs. */
const nkSleep = ms => new Promise(r => setTimeout(r, ms));
function nkBox(label){
  document.querySelectorAll(".nk-ov").forEach(x => x.remove());
  const ov = elm("div","nk-ov"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Nickel confirmation");
  ov.innerHTML = `<div class="nk-box"><div class="nk-h"><span class="nk-logo">N</span><div class="nk-ht"><b>Nickel</b><span>${esc(label || "")}</span></div></div><div class="nk-b"></div><div class="nk-f"></div></div>`;
  document.body.appendChild(ov);
  const B = ov.querySelector(".nk-b"), F = ov.querySelector(".nk-f");
  let left = 0, timer = null, onKey = null;
  const stopTimer = () => { clearInterval(timer); timer = null; if(onKey) document.removeEventListener("keydown", onKey); onKey = null; };
  const box = {
    wait(text){ stopTimer(); B.innerHTML = `<div class="nk-wait"><span class="nk-spin"></span>${esc(text || "Getting this ready in Nickel…")}</div>`; F.innerHTML = ""; },
    ask(p, answer){
      stopTimer();
      B.innerHTML = `<div class="nk-q">Nickel asks you to confirm</div>${nkPreview(p.message || "", p.title)}
        ${p.note ? `<p class="nk-note">${esc(p.note)}</p>` : ""}<div class="nk-left" aria-live="polite"></div>`;
      F.innerHTML = `<button class="btn" id="nkNo">Cancel</button><button class="btn primary" id="nkYes">Confirm</button>`;
      left = Number(p.secondsLeft) || 90;
      const L = B.querySelector(".nk-left"), show = () => { L.textContent = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left to answer` : "Time's up"; };
      show(); timer = setInterval(() => { left = Math.max(0, left - 1); show(); }, 1000);
      const done = yes => { stopTimer(); box.wait(yes ? "Confirmed. Nickel is doing it now…" : "Cancelling…"); answer(yes); };
      F.querySelector("#nkYes").onclick = () => done(true);
      F.querySelector("#nkNo").onclick = () => done(false);
      onKey = e => { if(e.key === "Escape") done(false); };
      document.addEventListener("keydown", onKey);
      setTimeout(() => { const y = F.querySelector("#nkYes"); if(y) y.focus(); }, 30);
    },
    tick(sec){ if(timer && Number.isFinite(sec)) left = sec; },
    info(html, buttons){ stopTimer(); B.innerHTML = html; F.innerHTML = ""; (buttons || [["Close", () => box.close(), "primary"]]).forEach(([t, fn, cls]) => { const b = elm("button", "btn " + (cls || "")); b.textContent = t; b.onclick = fn; F.appendChild(b); }); },
    close(){ stopTimer(); ov.remove(); }
  };
  box.wait();
  return box;
}
/* Nickel's confirmation, laid out to read: fields at the top, the memo as a paragraph, line
   items as a table with a running check against the total. Everything shown comes from
   Nickel's own text; ids are labelled with the names the console knows them by. */
function nkNames(){
  const m = {}, add = (id, name) => { if(id && name) m[id] = name; };
  const nk = S.nk || {};
  (nk.nickelCustomers || []).forEach(c => add(c.id, c.name));   // Nickel's own customer name: what the invoice shows
  Object.entries(nk.customers || {}).forEach(([oid, c]) => { if(!m[c.id]) add(c.id, c.name || (ownerById(oid) && ownerLabel(ownerById(oid)))); });
  Object.values(nk.vendors || {}).forEach(v => add(v.id, v.name)); (nk.nickelVendors || []).forEach(v => add(v.id, v.name));
  if(typeof NKL !== "undefined" && NKL) ["expense","revenue","revenueItems"].forEach(k => (NKL[k] || []).forEach(x => add(x.id, x.name)));
  ((PAY.status && PAY.status.nickel && PAY.status.nickel.payFrom) || []).forEach(x => add(x.id, x.label));
  return m;
}
const nkMoneyC = v => { const m = String(v).replace(/[$,\s]/g, ""); return /^-?\d+(\.\d+)?$/.test(m) ? Math.round(Number(m) * 100) : null; };
function nkPreview(text, title){
  const names = nkNames(), lines = String(text).split(/\r?\n/), head = (lines.shift() || title || "").trim();
  const top = [], groups = []; let cur = null, section = "";
  for(const raw of lines){
    const l = raw.trim(); if(!l) continue;
    const num = l.match(/^(\d+)\.\s*(.*)$/), kv = l.match(/^([^:]{1,40}):\s*(.*)$/);
    if(num){ cur = {section, f:{}}; groups.push(cur); if(num[2]){ const k2 = num[2].match(/^([^:]{1,40}):\s*(.*)$/); if(k2) cur.f[k2[1].trim()] = k2[2]; } continue; }
    if(kv && kv[2] === "" ){ section = kv[1].trim(); cur = null; continue; }
    if(!kv && !num && /^[A-Za-z ]{2,30}$/.test(l)){ section = l; cur = null; continue; }
    if(kv){ if(cur) cur.f[kv[1].trim()] = kv[2]; else top.push({k:kv[1].trim(), v:kv[2]}); continue; }
    const last = top[top.length - 1];
    if(!cur && last && /^(memo|note|message)$/i.test(last.k)){ last.v += "\n" + l; continue; }   // a message can run over several lines
    top.push({k:"", v:l});
  }
  const label = (k, v) => { const id = String(v).trim(); return /\b(id)$/i.test(k) && names[id] ? `<b>${esc(names[id])}</b> <span class="nk-id">${esc(id)}</span>` : names[id] ? `<b>${esc(names[id])}</b>` : esc(v); };
  const memo = top.filter(x => /^(memo|note|message)$/i.test(x.k)), fields = top.filter(x => !/^(memo|note|message)$/i.test(x.k));
  let html = `<div class="nk-msg"><div class="nk-act">${esc(head)}</div>`;
  html += fields.map(x => x.k ? `<div class="nk-kv"><span>${esc(x.k.replace(/\bID\b/, "").trim() || x.k)}</span><b>${label(x.k, x.v)}</b></div>` : `<div class="nk-line">${esc(x.v)}</div>`).join("");
  if(memo.length) html += memo.map(x => `<div class="nk-memo"><span>${esc(x.k)}</span><p>${esc(x.v)}</p></div>`).join("");
  if(groups.length){
    const amtKey = f => Object.keys(f).find(k => /amount|total/i.test(k)), descKey = f => Object.keys(f).find(k => /desc|memo|reason/i.test(k));
    const idKey = f => Object.keys(f).find(k => /^(id|bill ?id|item|account)$/i.test(k));
    let sum = 0, allMoney = true;
    const rows = groups.map((g, i) => {
      const a = amtKey(g.f), d = descKey(g.f), id = idKey(g.f), c = a ? nkMoneyC(g.f[a]) : null;
      if(c == null) allMoney = false; else sum += c;
      const what = id ? (names[String(g.f[id]).trim()] || g.f[id]) : "";
      const q1 = Object.entries(g.f).some(([k, v]) => /^quantity$/i.test(k) && Number(v) === 1);
      const rest = Object.entries(g.f).filter(([k]) => k !== a && k !== d && k !== id && !(q1 && /^(quantity|rate)$/i.test(k))).map(([k, v]) => `${k}: ${names[String(v).trim()] || v}`).join(" · ");
      return `<tr><td class="nk-n">${i + 1}</td><td>${d ? esc(g.f[d]) : ""}${what ? `<div class="nk-sub">${esc(what)}</div>` : ""}${rest ? `<div class="nk-sub">${esc(rest)}</div>` : ""}</td><td class="nk-a">${a ? esc(g.f[a]) : ""}</td></tr>`;
    }).join("");
    const totF = fields.find(x => /^amount|^total/i.test(x.k)), totC = totF ? nkMoneyC(totF.v) : null;
    const check = allMoney && totC != null ? (sum === totC ? `<span class="nk-ok">Lines add up to ${esc(totF.v)} ✓</span>` : `<span class="nk-bad">Lines add up to ${usd(sum)}, not ${esc(totF.v)}</span>`) : "";
    html += `<div class="nk-sect">${esc(groups[0].section || "Lines")} · ${groups.length}</div><div class="nk-tw"><table class="nk-tbl"><tbody>${rows}</tbody></table></div>${check ? `<div class="nk-check">${check}</div>` : ""}`;
  }
  html += `<details class="nk-raw"><summary>Nickel's exact text</summary><pre>${esc(text)}</pre></details></div>`;
  return html;
}
// run one Nickel action: shows the confirmation when Nickel asks, returns the server's answer
async function nkRun(op, args, label){
  const runId = "run_" + uid() + uid(), box = nkBox(label);
  let finished = false, result = null, failure = null, asked = false;
  const job = payCall("nk.do", Object.assign({op, runId}, args || {}), {raw:true}).then(r => { result = r; }, e => { failure = e; }).finally(() => { finished = true; });
  while(!finished){
    await Promise.race([job, nkSleep(1100)]);
    if(finished) break;
    let q = null; try{ q = await payCall("nk.pending", {runId}, {noSave:true}); }catch(e){}
    if(q && q.pending && !asked){ asked = true; box.ask(q.pending, yes => payCall("nk.answer", {runId, confirm:yes}, {noSave:true}).catch(() => {})); }
    else if(q && q.pending) box.tick(q.pending.secondsLeft);
  }
  if(failure){ box.close(); throw failure; }
  const r = result || {};
  if(r.ok || r.already){ box.close(); return r; }
  if(r.declined){ box.close(); toast("Cancelled. Nothing changed in Nickel."); return r; }
  if(r.approvalUrl){
    box.info(`<div class="nk-q">Nothing ran</div><p class="nk-p">${esc(r.error || "")}</p><p class="nk-p muted">You can review and approve this exact request in Nickel instead. Then do it again here and it runs once.</p>`,
      [["Close", () => box.close(), ""], ["Open approval in Nickel", () => { window.open(r.approvalUrl, "_blank", "noopener"); box.close(); }, "primary"]]);
    return r;
  }
  box.close(); if(r.error) toast(r.error); return r;
}

/* ====================================================================
   BILLS PAGE
   ==================================================================== */
function pgPmBills(){
  if(!pmState().properties.length) return pmEmpty();               // a new console starts with the import/setup screen
  if(typeof pmAutoStart === "function" && pmAutoStart()) return;    // first visit in a new month starts it (rent due, recurring charges)
  $("#pgCrumb").textContent = "Property management"; $("#pgTitle").textContent = "Bills";
  const all = billList(), today = todayISO(), curM = thisMonth();
  const open = all.filter(b => b.status === "open"), paying = all.filter(b => b.status === "paying");
  $("#pgSub").textContent = open.length ? `${open.length} to pay · ${usd(open.reduce((a, b) => a + cents(b.amount), 0))}` : "Nothing waiting to be paid";
  const sel = S.ui.billSel = S.ui.billSel || {};
  const selIds = Object.keys(sel).filter(id => sel[id] && billById(id) && billById(id).status === "open");
  const acts = [];
  if(selIds.length) acts.push(nickelOn() ? [`Pay ${selIds.length} selected`, () => billPaySheet(selIds), "primary"] : [`Mark ${selIds.length} paid`, () => billManualSheet(selIds), "primary"]);
  actions(acts);
  payStatusThenRedraw("pmBills");
  billDropZone($("#view"));
  payRefreshSoon(); if(nkImportVendors()){ setTimeout(render, 0); return; } nkMatchSoon("pmBills");
  const v = $("#view");

  /* ---- numbers ---- */
  const dueSoon = open.filter(b => { const d = billDays(b.due); return d != null && d <= 7; });
  const paidM = all.filter(b => b.status === "paid" && b.pay && String(b.pay.date || "").slice(0, 7) === curM);
  const toInv = all.filter(b => b.status !== "void" && b.recover === "invoice" && !b.invoiceId);
  const unpaidInv = invList().filter(x => x.status === "sent");
  const owedC = toInv.reduce((a, b) => a + cents(b.amount) + billFeeC(b), 0) + unpaidInv.reduce((a, x) => a + invTotals(x).dueC, 0);
  const tiles = elm("div","card pf-hero");
  tiles.innerHTML = `
    <div class="pf-cell" data-bf="open"><div class="label">To pay</div><div class="pf-v">${usd(open.reduce((a, b) => a + cents(b.amount), 0))}</div><div class="pf-note">${open.length} bill${open.length === 1 ? "" : "s"}${paying.length ? ` · ${paying.length} processing` : ""}</div></div>
    <div class="pf-cell" data-bf="due"><div class="label">Due in 7 days</div><div class="pf-v"${dueSoon.length ? ' style="color:var(--gold)"' : ""}>${dueSoon.length}</div><div class="pf-note">${dueSoon.length ? usd(dueSoon.reduce((a, b) => a + cents(b.amount), 0)) : "Nothing due this week"}</div></div>
    <div class="pf-cell" data-bf="paid"><div class="label">Paid · ${esc(monthLabel(curM).split(" ")[0])}</div><div class="pf-v g">${usd(paidM.reduce((a, b) => a + cents(b.amount), 0))}</div><div class="pf-note">${paidM.length} bill${paidM.length === 1 ? "" : "s"}</div></div>
    <div class="pf-cell" data-go="pmInvoices"><div class="label">Owed by owners</div><div class="pf-v a">${usd(owedC)}</div><div class="pf-note">${toInv.length ? `${toInv.length} to invoice` : "Nothing to invoice"}${unpaidInv.length ? ` · ${unpaidInv.length} invoice${unpaidInv.length === 1 ? "" : "s"} unpaid` : ""}</div></div>`;
  v.appendChild(tiles);
  tiles.querySelectorAll("[data-bf]").forEach(c => { c.style.cursor = "pointer"; c.onclick = () => { S.ui.billF = c.dataset.bf; render(); }; });
  tiles.querySelectorAll("[data-go]").forEach(c => { c.style.cursor = "pointer"; c.onclick = () => go(c.dataset.go); });

  /* ---- quick add ---- */
  const props = pmLiveProps().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  const qa = elm("div","card bl-quick");
  const last = S.ui.billLast || {};
  qa.innerHTML = `<div class="bl-q">
      <select id="bqP" aria-label="Property"><option value="">Property…</option>${props.map(p => `<option value="${p.id}" ${last.propertyId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <input type="text" id="bqV" list="bqVL" placeholder="Vendor" autocomplete="off" aria-label="Vendor"><datalist id="bqVL">${vendorSuggestions().map(n => `<option value="${esc(n)}">`).join("")}</datalist>
      <input id="bqA" type="number" step="0.01" min="0" placeholder="Amount" aria-label="Amount">
      <input id="bqD" type="date" value="${today}" aria-label="Bill date">
      <input type="text" id="bqM" placeholder="What for (e.g. replaced water heater)" aria-label="What for">
      <select id="bqR" aria-label="Owner"><option value="deduct">Deduct from payout</option><option value="invoice">Invoice owner</option><option value="phd">PHD expense</option></select>
      <button class="btn primary" id="bqGo">Add</button></div>
    <div class="bl-qh"><span id="bqHint" class="muted"></span><a href="#" id="bqUp">Upload an invoice instead</a><a href="#" id="bqMore">More details…</a></div>`;
  v.appendChild(qa);
  const qr = qa.querySelector("#bqR"); if(last.recover) qr.value = last.recover;
  const hint = () => { const p = pmProp(qa.querySelector("#bqP").value), o = p && ownerById(p.ownerId);
    qa.querySelector("#bqHint").textContent = p ? `${o ? ownerLabel(o) : "No owner on file"} · ${p.adminRate ?? 10}% admin fee when billed to the owner` : "Enter a bill in one line — it's paid from here and billed to the owner automatically."; };
  qa.querySelector("#bqP").onchange = () => { const p = pmProp(qa.querySelector("#bqP").value); if(p && !p.ownerId) qr.value = "phd"; hint(); };
  hint();
  const addQuick = () => {
    const f = {propertyId:qa.querySelector("#bqP").value, vendor:qa.querySelector("#bqV").value, amount:qa.querySelector("#bqA").value, date:qa.querySelector("#bqD").value, memo:qa.querySelector("#bqM").value, recover:qr.value};
    if(!f.propertyId) return toast("Pick the property");
    if(!f.vendor.trim()) return toast("Who is the bill from?");
    if(!(Number(f.amount) > 0)) return toast("Enter the amount");
    const b = billSave(billNew(f), true);
    S.ui.billLast = {propertyId:f.propertyId, recover:f.recover}; persistUi();
    toast(`Bill added — ${usd(cents(b.amount))} from ${b.vendor}${b.recover === "deduct" ? ` · deducted in ${monthLabel(b.deduct.month)}` : ""}`, true);
    render(); setTimeout(() => { const x = $("#bqV"); if(x) x.focus(); }, 30);
  };
  qa.querySelector("#bqGo").onclick = addQuick;
  qa.querySelectorAll("input").forEach(i => i.onkeydown = e => { if(e.key === "Enter") addQuick(); });
  qa.querySelector("#bqUp").onclick = e => { e.preventDefault(); billUploadSheet(); };
  qa.querySelector("#bqMore").onclick = e => { e.preventDefault(); billSheet(null, {propertyId:qa.querySelector("#bqP").value, vendor:qa.querySelector("#bqV").value, amount:qa.querySelector("#bqA").value, date:qa.querySelector("#bqD").value, memo:qa.querySelector("#bqM").value, recover:qr.value}); };

  /* ---- list ---- */
  const f = S.ui.billF || "open", q = (S.ui.billQ || "").toLowerCase();
  const FILT = [["open","To pay", b => b.status === "open"], ["due","Due soon", b => b.status === "open" && billDays(b.due) != null && billDays(b.due) <= 7],
    ["paying","Processing", b => b.status === "paying"], ["paid","Paid", b => b.status === "paid"], ["invoice","To invoice", b => b.status !== "void" && b.recover === "invoice" && !b.invoiceId],
    ["all","All", b => b.status !== "void"]];
  const bar = elm("div","sc-bar"); bar.style.marginTop = "16px";
  bar.innerHTML = `<div class="sc-seg">${FILT.map(([k, l, fn]) => { const n = all.filter(fn).length; return k === "open" || k === "all" || n ? `<button data-f="${k}" class="${f === k ? "on" : ""}">${l} <span>${n}</span></button>` : ""; }).join("")}</div>
    <div class="sc-q"><input type="text" id="blQ" placeholder="Find a vendor, property or note…" value="${esc(S.ui.billQ || "")}"></div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ui.billF = b.dataset.f; render(); });
  const qi = bar.querySelector("#blQ");
  qi.oninput = () => { S.ui.billQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#blQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 160); };
  const fn = (FILT.find(x => x[0] === f) || FILT[0])[2];
  const list = all.filter(fn).filter(b => !q || `${b.vendor} ${b.memo} ${b.billNo} ${(pmProp(b.propertyId) || {}).name || ""} ${b.category}`.toLowerCase().includes(q))
    .sort((a, b) => f === "paid" ? String((b.pay || {}).date || "").localeCompare((a.pay || {}).date || "") : String(a.due || a.date).localeCompare(b.due || b.date));
  const card = elm("div","card");
  if(!list.length){ card.innerHTML = `<div class="empty"><b>${f === "open" ? "No bills waiting" : "Nothing here"}</b><p>${f === "open" ? "Add one above, or drop the vendor's invoice anywhere on this page." : "Try another filter."}</p></div>`; v.appendChild(card); return; }
  const t = elm("table","tbl bl-tbl");
  const canSel = f === "open" || f === "due";
  t.innerHTML = `<thead><tr>${canSel ? `<th style="width:28px"><input type="checkbox" id="blAll"></th>` : ""}<th>Bill</th><th>Property</th><th class="r">Amount</th><th>${f === "paid" ? "Paid" : "Due"}</th><th>Status</th><th>Owner</th><th></th></tr></thead>
    <tbody>${list.map(b => { const p = pmProp(b.propertyId), st = billStatus(b);
      return `<tr data-b="${b.id}">${canSel ? `<td class="nw" data-nos><input type="checkbox" data-sel="${b.id}" ${sel[b.id] ? "checked" : ""}></td>` : ""}
        <td><div class="item-t">${esc(b.vendor || "—")}${b.receipt && b.receipt.url ? ` <a class="att" data-nos data-br="1" href="${esc(b.receipt.url)}" target="_blank" rel="noopener" title="Open the vendor's invoice">${typeof brandIc === "function" && /google\.com/.test(b.receipt.url) ? brandIc("drive") : icon("clip")}</a>` : ""}</div><div class="item-s">${esc(b.memo || b.category || "")}${b.billNo ? ` · #${esc(b.billNo)}` : ""}${b.payNote && b.status !== "paid" ? ` · <i>${esc(b.payNote)}</i>` : ""}</div></td>
        <td class="bl-p">${esc(p ? p.name : "—")}</td><td class="r num">${usd(cents(b.amount))}</td>
        <td class="nw muted">${f === "paid" ? esc(b.pay && b.pay.date ? fdateS(b.pay.date) : "") : b.due ? esc(fdateS(b.due)) : "—"}</td>
        <td><span class="tag ${st.cls}">${esc(st.label)}</span>${b.nickel && b.nickel.billId ? ` <span class="mark grey" title="In Nickel">N</span>` : ""}${b.pay && b.pay.receipt && b.pay.receipt.url ? ` <a class="mark grey" data-nos href="${esc(b.pay.receipt.url)}" target="_blank" rel="noopener" title="Nickel's payment receipt${b.pay.receipt.delivery === "DEPOSITED" ? " · deposited" : ""}">receipt</a>` : ""}</td>
        <td class="bl-o">${billOwnerTag(b)}</td><td class="act"><span class="sc-go">›</span></td></tr>`; }).join("")}</tbody>`;
  t.querySelectorAll("[data-b]").forEach(tr => tr.onclick = e => { if(e.target.closest("[data-nos]")) return; billSheet(tr.dataset.b); });
  t.querySelectorAll("[data-sel]").forEach(c => c.onchange = () => { sel[c.dataset.sel] = c.checked; render(); });
  const all2 = t.querySelector("#blAll"); if(all2){ all2.checked = list.every(b => sel[b.id]); all2.onchange = () => { list.forEach(b => sel[b.id] = all2.checked); render(); }; }
  const w = elm("div","tbl-wrap"); w.appendChild(t); card.appendChild(w); v.appendChild(card);
}

/* ---------- one bill ---------- */
function billSheet(id, preset){
  const isNew = !id, src = isNew ? billNew(Object.assign({propertyId:"", vendor:"", amount:"", date:todayISO()}, preset || {})) : JSON.parse(JSON.stringify(billById(id)));
  if(isNew && preset && !preset.amount) src.amount = "";
  const b = src, sh = $("#sheet"), props = pmLiveProps().concat(pmState().properties.filter(p => p.id === b.propertyId && p.status === "inactive")).sort((a, x) => a.name.localeCompare(x.name, undefined, {numeric:true}));
  const lockedOwner = !!(b.invoiceId && invById(b.invoiceId) && invById(b.invoiceId).status !== "draft");
  const draw = () => {
    const p = pmProp(b.propertyId), o = p && ownerById(p.ownerId), st = billStatus(b), feeC = billFeeC(b), inv = b.invoiceId && invById(b.invoiceId);
    sh.innerHTML = `<div class="sheet-h"><div><h3>${isNew ? "New bill" : esc(b.vendor || "Bill")}</h3>${isNew ? "" : `<div class="muted" style="font-size:12.5px;margin-top:3px">${esc(p ? p.name : "")} · <span class="tag ${st.cls}">${esc(st.label)}</span></div>`}</div>
        <button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
      <div class="sheet-b">
        <div class="f2"><label class="fld"><span>Property</span><select data-k="propertyId" ${lockedOwner ? "disabled" : ""}><option value="">Pick one…</option>${props.map(x => `<option value="${x.id}" ${x.id === b.propertyId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
          <label class="fld"><span>Vendor</span><input type="text" data-k="vendor" list="bsVL" value="${esc(b.vendor)}" autocomplete="off"><datalist id="bsVL">${vendorSuggestions().map(n => `<option value="${esc(n)}">`).join("")}</datalist></label></div>
        <div class="f3"><label class="fld"><span>Amount</span><input type="number" step="0.01" min="0" data-k="amount" value="${esc(b.amount)}" ${b.status === "paid" && b.pay && b.pay.method === "Nickel" ? "disabled" : ""}></label>
          <label class="fld"><span>Bill date</span><input type="date" data-k="date" value="${esc(b.date)}"></label>
          <label class="fld"><span>Due</span><input type="date" data-k="due" value="${esc(b.due)}"></label></div>
        <label class="fld"><span>What for</span><input type="text" data-k="memo" value="${esc(b.memo)}" placeholder="e.g. Replaced kitchen faucet"></label>
        <label class="fld"><span>Payment note</span><input type="text" data-k="payNote" value="${esc(b.payNote || "")}" placeholder="e.g. Pay from 4091 today"></label>
        <div class="f2"><label class="fld"><span>Category</span><select data-k="category">${BILL_CATS.map(c => `<option ${c === b.category ? "selected" : ""}>${c}</option>`).join("")}</select></label>
          <label class="fld"><span>Vendor's invoice #</span><input type="text" data-k="billNo" value="${esc(b.billNo)}"></label></div>
        <label class="fld"><span>Receipt or invoice link</span><div class="fld-row"><input type="text" data-rc value="${esc((b.receipt && b.receipt.url) || "")}" placeholder="Paste a Google Drive or Dropbox link">${b.receipt && b.receipt.url ? `<a class="btn" href="${esc(b.receipt.url)}" target="_blank" rel="noopener">Open</a>` : ""}</div><span class="help">Receipts emailed to the receipt inbox are linked automatically.</span></label>

        <div class="sectl">Owner</div>
        <div class="bl-rec">${Object.entries(BILL_REC).map(([k, l]) => `<label class="${b.recover === k ? "on" : ""} ${lockedOwner ? "dis" : ""}"><input type="radio" name="rec" value="${k}" ${b.recover === k ? "checked" : ""} ${lockedOwner || (k !== "phd" && !(o)) ? "disabled" : ""}> ${l}</label>`).join("")}</div>
        ${b.recover !== "phd" ? `<label class="fld" style="margin-top:8px"><span>Admin fee</span><select data-k="feeMode"><option value="auto" ${b.feeMode !== "none" ? "selected" : ""}>Add ${p ? p.adminRate ?? 10 : 10}% admin fee${feeC ? " (" + usd(feeC) + ")" : ""}</option><option value="none" ${b.feeMode === "none" ? "selected" : ""}>No admin fee</option></select></label>` : ""}
        <p class="help" style="margin-top:6px">${!p ? "" : !o ? "This property has no owner on file, so the bill is a PHD expense until one is added." :
          b.recover === "deduct" ? `Taken out of ${esc(ownerLabel(o))}'s payout${b.deduct && b.deduct.month ? ` for <b>${esc(monthLabel(b.deduct.month))}</b>` : ` for ${esc(monthLabel(billDeductMonth(b)))}`} — it shows in Month close as a repair line.` :
          b.recover === "invoice" ? (inv ? `On owner invoice <b>${esc(inv.no)}</b> (${esc(inv.status)}).` : `Goes on ${esc(ownerLabel(o))}'s next owner invoice.`) : "PHD pays this and doesn't bill the owner."}</p>

        ${isNew ? "" : billPayBlock(b)}
      </div>
      <div class="sheet-f">${!isNew && b.status !== "paid" && b.status !== "paying" ? `<button class="btn ghost danger" id="bsVoid">${b.status === "void" ? "Restore" : "Void bill"}</button>` : ""}<span style="flex:1"></span>
        <button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="bsSave">${isNew ? "Add bill" : "Save"}</button></div>`;
    $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
    sh.querySelectorAll("[data-k]").forEach(i => i.onchange = () => { b[i.dataset.k] = i.value; if(i.dataset.k === "propertyId"){ const pp = pmProp(b.propertyId); if(pp && !pp.ownerId) b.recover = "phd"; } if(["propertyId","feeMode"].includes(i.dataset.k)) draw(); });
    sh.querySelectorAll("[name=rec]").forEach(r => r.onchange = () => { b.recover = r.value; draw(); });
    const rc = sh.querySelector("[data-rc]"); rc.onchange = () => { const u = rc.value.trim(); b.receipt = u ? {url:u, name:(b.receipt && b.receipt.name) || ""} : null; };
    $("#bsSave").onclick = () => {
      sh.querySelectorAll("[data-k]").forEach(i => { if(!i.disabled) b[i.dataset.k] = i.value; });
      if(!b.propertyId) return toast("Pick the property");
      if(!String(b.vendor).trim()) return toast("Who is the bill from?");
      b.amount = Math.round(Number(b.amount) * 100) / 100;
      if(!(b.amount > 0)) return toast("Enter the amount");
      if(!pmProp(b.propertyId).ownerId && b.recover !== "phd") b.recover = "phd";
      const saved = billSave(b, isNew);
      const fromUpload = isNew && saved.inbox && typeof billUploadDone === "function";
      if(fromUpload){ commit(); billUploadDone(saved); }
      closeSheet(); toast(isNew ? `Bill added — ${usd(cents(saved.amount))} from ${saved.vendor}` : "Bill saved", true); render();
      if(fromUpload && BU.files.some(f => f.bill === saved.id)) setTimeout(() => billUploadSheet(null, true), 60);
    };
    const vd = $("#bsVoid"); if(vd) vd.onclick = () => {
      if(b.status !== "void" && b.invoiceId && invById(b.invoiceId) && invById(b.invoiceId).status !== "draft") return toast("It's on a sent invoice — void the invoice first");
      const inNk = b.status !== "void" && b.nickel && b.nickel.billId && nickelOn();
      if(b.status !== "void" && !confirm(`Void this bill? It's removed from the owner's payout and from any draft invoice.${inNk ? "\n\nIt's also in Nickel: next you'll confirm deleting it there, so it can't be paid by mistake." : ""}`)) return;
      b.status = b.status === "void" ? "open" : "void";
      if(b.status === "void" && b.invoiceId){ const v2 = invById(b.invoiceId); if(v2 && v2.status === "draft"){ v2.lines = v2.lines.filter(l => l.billId !== b.id); } b.invoiceId = null; }
      billSave(b, false); closeSheet(); render();
      if(inNk) nkRun("bill.delete", {billId:b.id}, `Delete the ${b.vendor} bill in Nickel`).then(r => { if(r.ok) toast("Voided here and deleted in Nickel"); }).catch(e => toast(e.message));
    };
    billWirePay(sh, b, draw);
  };
  draw(); openPanel();
}
// where a Nickel payment is: on the way, deposited, failed — with Nickel's receipt
function billReceiptLine(p){
  const rc = p.receipt; if(!rc) return "";
  const where = rc.delivery === "DEPOSITED" ? `Deposited${rc.deliveredAt ? " " + fdateS(rc.deliveredAt) : ""}` : /FAIL|RETURN/.test(rc.delivery || "") ? "Didn't go through" : rc.eta ? `On the way · arrives ${fdateS(rc.eta)}` : rc.delivery ? String(rc.delivery).charAt(0) + String(rc.delivery).slice(1).toLowerCase() : "";
  return `<div class="bl-rc">${where ? `<span class="tag ${rc.delivery === "DEPOSITED" ? "green" : /FAIL|RETURN/.test(rc.delivery || "") ? "red" : "acc"}">${esc(where)}</span>` : ""}${rc.method ? `<span class="muted">${esc(rc.method === "CHECK" ? "Check" : rc.method === "ACH" ? "Bank transfer (ACH)" : rc.method)}</span>` : ""}
    ${rc.url ? `<a class="btn sm" href="${esc(rc.url)}" target="_blank" rel="noopener">${icon("file")} Payment receipt</a>` : ""}${rc.link ? `<a class="btn sm ghost" href="${esc(rc.link)}" target="_blank" rel="noopener">Open in Nickel</a>` : ""}</div>`;
}
// the bill changed here after it went to Nickel (amount, due date, what for)
function billNkDrift(b){
  const nb = b.nickel || {}, s0 = nb.sent; if(!nb.billId || !s0 || b.status !== "open") return false;
  const dueNow = String(b.due || b.date || "").slice(0, 10);
  return s0.amountC !== cents(b.amount) || (!!s0.due && !!dueNow && s0.due !== dueNow);
}
function billPayBlock(b){
  const p = b.pay || {}, nb = b.nickel || {};
  const inNk = nb.billId ? `<div class="bl-nk"><span class="tag acc">In Nickel</span>${nb.linked ? `<span class="muted">matched to the bill already in Nickel</span>` : ""}${nb.qb ? `<span class="muted">QuickBooks is updated by Nickel</span>` : ""}${payOnline() ? `<a href="#" id="bpSync" class="muted" style="margin-left:auto">Check Nickel</a>` : ""}</div>` : "";
  if(b.status === "paid") return `<div class="sectl">Payment</div><div class="bl-paid"><b>Paid ${esc(p.date ? docShort(p.date) : "")}</b> · ${esc(p.method || "")}${p.ref ? ` · ${esc(p.ref)}` : ""}${p.by ? `<span class="muted"> · ${esc(cloudWhoSafe(p.by))}</span>` : ""}
      ${p.method !== "Nickel" ? `<button class="btn sm ghost" id="bpUndo" style="margin-left:auto">Undo</button>` : ""}</div>${billReceiptLine(p)}${inNk}
      ${nb.billId && p.method !== "Nickel" && !nb.recorded && String(nb.status || "") !== "PAID" && nickelOn() ? `<div class="bl-pay"><button class="btn sm" id="bpRecord">Record this payment in Nickel</button><span class="help">Marks the Nickel bill paid so QuickBooks matches. You'll confirm it.</span></div>` : ""}`;
  if(b.status === "paying") return `<div class="sectl">Payment</div><div class="bl-paid"><b>${esc(billStatus(b).label)}</b> · Nickel${p.delivery ? " · " + esc(p.delivery) : ""}<span class="muted"> · sent by ${esc(cloudWhoSafe(p.by || ""))}</span></div>${billReceiptLine(p)}
      <p class="help">${p.approval ? "Nickel's approval rules sent this payment for approval. Someone with approval rights releases it in Nickel." : "It's marked Paid here automatically once Nickel shows it paid (checked every hour)."}</p>
      ${nickelOn() ? `<div class="bl-pay"><button class="btn sm ghost danger" id="bpCancel">Cancel this payment</button><span class="help">Only works before the money leaves. You'll confirm it.</span></div>` : ""}${inNk}`;
  if(b.status === "void") return "";
  return `<div class="sectl">Payment</div>${p.failed ? `<div class="pm-banner">The last Nickel payment didn't go through${p.failReason ? ": " + esc(p.failReason) : ""}. Try again or record how it was paid.</div>` : ""}${p.canceled ? `<p class="help" style="margin-top:0">The last payment was cancelled${typeof p.canceled === "string" ? " " + esc(fdateS(p.canceled.slice(0, 10))) : ""}.</p>` : ""}
    ${nickelOn() ? `<div class="bl-pay"><button class="btn primary" id="bpNickel">Pay with Nickel</button><button class="btn" id="bpManual">Paid another way</button></div>`
      : `<div class="bl-pay"><a class="btn" href="${NICKEL_APP}" target="_blank" rel="noopener">Open Nickel to pay</a><button class="btn primary" id="bpManual">Mark paid</button></div>`}
    ${billNkDrift(b) && nickelOn() ? `<div class="pm-banner" style="margin-top:10px">Changed since it went to Nickel (Nickel has ${usd(nb.sent.amountC)}${nb.sent.due ? ", due " + esc(fdateS(nb.sent.due)) : ""}). <button class="btn sm" id="bpUpd" style="margin-left:6px">Update in Nickel</button></div>` : ""}${inNk}`;
}
function billWirePay(sh, b, redraw){
  const n = sh.querySelector("#bpNickel"); if(n) n.onclick = () => billPaySheet([b.id]);
  const m = sh.querySelector("#bpManual"); if(m) m.onclick = () => billManualSheet(b.id);
  const u = sh.querySelector("#bpUndo"); if(u) u.onclick = () => { if(!confirm("Mark this bill unpaid again?")) return; const x = billById(b.id); x.status = "open"; x.pay = null; billSave(x, false); billSheet(b.id); render(); };
  const rc = sh.querySelector("#bpRecord"); if(rc) rc.onclick = async () => {
    try{ const r = await nkRun("bill.record", {billId:b.id}, `Record the ${b.vendor} payment`); if(r.ok) toast("Recorded in Nickel"); billSheet(b.id); }catch(e){ toast(e.message); }
  };
  const cn = sh.querySelector("#bpCancel"); if(cn) cn.onclick = async () => {
    try{ const r = await nkRun("bill.cancel", {billId:b.id}, `Cancel the ${usd(cents(b.amount))} payment to ${b.vendor}`); if(r.ok) toast("Payment cancelled — the bill is back in To pay"); billSheet(b.id); render(); }catch(e){ toast(e.message); }
  };
  const up = sh.querySelector("#bpUpd"); if(up) up.onclick = async () => {
    try{ const r = await nkRun("bill.update", {billId:b.id}, `Update the ${b.vendor} bill in Nickel`); if(r.ok) toast("Updated in Nickel"); billSheet(b.id); }catch(e){ toast(e.message); }
  };
  const sy = sh.querySelector("#bpSync"); if(sy) sy.onclick = async e => {
    e.preventDefault(); sy.textContent = "Checking…";
    try{ const r = await payCall("nk.sync", {kind:"bill", id:b.id}); toast(r.changed ? "Updated from Nickel" : "Nothing new in Nickel"); billSheet(b.id); }catch(er){ toast(er.message); sy.textContent = "Check Nickel"; }
  };
}
function billManualSheet(idOrIds){
  const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(i => billById(i)), one = ids.length === 1, b = billById(ids[0]), sh = $("#sheet");
  if(!b) return;
  const tot = ids.reduce((a, i) => a + cents(billById(i).amount), 0);
  const inNk = ids.filter(i => (billById(i).nickel || {}).billId);
  const defM = nickelOn() ? "Check" : "Nickel";
  sh.innerHTML = `<div class="sheet-h"><div><h3>${one ? "Mark paid" : `Mark ${ids.length} bills paid`}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${one ? esc(b.vendor) + " · " : ""}${usd(tot)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="muted" style="margin-top:0;font-size:13px">${nickelOn() ? "For a bill paid outside the console: a check, a card, MagicDoor, or directly in Nickel." : `Pay in <a href="${NICKEL_APP}" target="_blank" rel="noopener">Nickel</a> first, then record it here.`} The owner's statement picks it up from here.</p>
      ${one ? "" : `<div class="bl-mlist">${ids.map(i => { const x = billById(i); return `<div><span>${esc(x.vendor)}</span><b>${usd(cents(x.amount))}</b></div>`; }).join("")}</div>`}
      <div class="f2"><label class="fld"><span>Paid on</span><input type="date" id="bmD" value="${todayISO()}"></label>
        <label class="fld"><span>How</span><select id="bmM">${BILL_PAYM.map(x => `<option ${x === defM ? "selected" : ""}>${x}</option>`).join("")}</select></label></div>
      <label class="fld"><span>Check # or reference</span><input type="text" id="bmR" placeholder="optional"></label>
      ${inNk.length && nickelOn() ? `<label class="ps-chk"><input type="checkbox" id="bmNk" checked> Also mark ${inNk.length === 1 ? "it" : `the ${inNk.length} bills`} paid in Nickel, so QuickBooks matches (you'll confirm ${inNk.length === 1 ? "once" : "each one"})</label>` : ""}</div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Back</button><button class="btn primary" id="bmGo">Mark paid</button></div>`;
  $("#shClose").onclick = closeSheet; $("#shCancel").onclick = () => one ? billSheet(ids[0]) : closeSheet(); openPanel();
  $("#bmGo").onclick = async () => {
    const pay = {method:$("#bmM").value, date:$("#bmD").value || todayISO(), ref:$("#bmR").value.trim(), by:billWho(), at:new Date().toISOString()};
    const alsoNk = !!($("#bmNk") && $("#bmNk").checked);
    ids.forEach(i => { const x = billById(i); if(!x || x.status !== "open") return; x.status = "paid"; x.pay = Object.assign({}, pay); billSave(x, false); });
    if(S.ui.billSel) ids.forEach(i => delete S.ui.billSel[i]);
    closeSheet(); render();
    toast(one ? `Marked paid · ${b.vendor}` : `${ids.length} bills marked paid`, true);
    if(alsoNk) for(const i of inNk){ const x = billById(i); try{ const r = await nkRun("bill.record", {billId:i}, `Record the ${x.vendor} payment`); if(!r.ok && !r.already) break; }catch(e){ toast(e.message); break; } }
  };
}

/* ---------- paying vendors through Nickel ---------- */
async function billPaySheet(ids){
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>Pay with Nickel</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div><div class="sheet-b"><p class="muted">Checking Nickel…</p></div>`;
  $("#shClose").onclick = closeSheet; openPanel();
  let st = null, plan;
  try{ st = await payStatus(true); }catch(e){}
  if(!st || !st.nickel || !st.nickel.ok){
    sh.querySelector(".sheet-b").innerHTML = `<div class="pm-banner">Nickel isn't connected${PAY.status && PAY.status.nickel && PAY.status.nickel.error ? ": " + esc(PAY.status.nickel.error) : ""}. See <a href="#" id="bpSetup">Payments setup</a>, or pay in Nickel and press Mark paid.</div>`;
    sh.querySelector("#bpSetup").onclick = e => { e.preventDefault(); closeSheet(); paySetup(); }; return;
  }
  try{ plan = await payCall("nk.plan", {billIds:ids}); }catch(e){ sh.querySelector(".sheet-b").innerHTML = `<div class="pm-banner">${esc(e.message)}</div>`; return; }
  const rows = plan.bills || [], ready = rows.filter(x => x.need === "" || x.need === "bill"), toAdd = ready.filter(x => x.need === "bill"), blocked = rows.filter(x => x.need === "vendor" || x.need === "details");
  const accts = plan.payFrom || [], a = S.acct || {}, acct = accts.find(x => x.id === a.nickelPayFrom) || accts.find(x => x.isDefault) || accts[0];
  const totC = ready.reduce((s, x) => s + cents((billById(x.id) || {}).amount), 0);
  const steps = toAdd.length + 1;
  sh.innerHTML = `<div class="sheet-h"><div><h3>Pay with Nickel</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${ready.length} bill${ready.length === 1 ? "" : "s"} ready · ${usd(totC)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      ${!plan.canPay ? `<div class="pm-banner">Only people on the payments list can send money (${esc((plan.payers || []).join(", ") || "nobody yet")}).</div>` : ""}
      <label class="fld"><span>Pay from</span><select id="npFrom">${accts.map(x => `<option value="${esc(x.id)}" ${acct && x.id === acct.id ? "selected" : ""}>${esc(x.label)}</option>`).join("") || "<option value=''>No account in Nickel</option>"}</select></label>
      <label class="ps-chk"><input type="checkbox" id="npDue"> Pay by each bill's due date (Nickel keeps the money until then)</label>
      ${ready.length ? `<div class="sm-list" style="margin-top:12px">${ready.map(x => { const b = billById(x.id); return `<div class="sm-r np-r"><span></span><div class="sm-t"><b>${esc(b.vendor)}</b><span>${esc((pmProp(b.propertyId) || {}).name || "")}${b.memo ? " · " + esc(b.memo) : ""}${b.due ? " · due " + esc(fdateS(b.due)) : ""}</span></div><span class="muted" style="font-size:12px">${esc(x.delivery || "")}${x.need === "bill" ? `<br><span class="tag grey">adds to Nickel</span>` : ""}</span><b class="num">${usd(cents(b.amount))}</b><span></span></div>`; }).join("")}</div>` : ""}
      ${blocked.length ? `<div class="label" style="margin:14px 0 6px">Not ready yet · ${blocked.length}</div><div class="sm-list">${blocked.map(x => { const b = billById(x.id), v = pmVendors().find(y => y.id === x.vendorId);
          const btn = x.need === "vendor" && x.vendorId ? `<button class="btn sm" data-vadd="${esc(x.vendorId)}">Add to Nickel</button>`
            : x.need === "details" && x.vendorId ? (v && v.email ? `<button class="btn sm ${/^Waiting/.test(x.why || "") ? "ghost" : ""}" data-vask="${esc(x.vendorId)}">${/^Waiting/.test(x.why || "") ? "Email the form again" : "Email bank-details form"}</button>` : `<button class="btn sm ghost" data-vedit="${esc(x.vendorId)}">Add vendor email</button>`) : "<span></span>";
          return `<div class="sm-r off np-r"><span></span><div class="sm-t"><b>${esc(b ? b.vendor : "")}</b><span>${esc(x.why || "")}</span></div><span></span><b class="num">${b ? usd(cents(b.amount)) : ""}</b>${btn}</div>`; }).join("")}</div>` : ""}
      ${ready.length ? `<div class="nk-how"><b>What happens when you press Pay</b><ol>${toAdd.length ? `<li>Nickel asks you to confirm adding ${toAdd.length === 1 ? "the bill" : `each of the ${toAdd.length} bills`} (${toAdd.length} confirmation${toAdd.length === 1 ? "" : "s"}).</li>` : ""}<li>Nickel shows the payment${ready.length === 1 ? "" : "s"}. One confirmation sends ${ready.length === 1 ? "it" : "them all"}.</li><li>The bill${ready.length === 1 ? " shows" : "s show"} “Payment processing” here, then “Paid” once Nickel shows ${ready.length === 1 ? "it" : "them"} paid.</li></ol></div>` : ""}
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="npGo" ${!ready.length || !plan.canPay || !accts.length ? "disabled" : ""}>Pay ${usd(totC)}${steps > 1 ? ` · ${steps} confirmations` : ""}</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  const again = () => billPaySheet(ids);
  sh.querySelectorAll("[data-vadd]").forEach(bt => bt.onclick = async () => { const v = pmVendors().find(y => y.id === bt.dataset.vadd); try{ const r = await nkRun("vendor.create", {vendorId:bt.dataset.vadd}, `Add ${v ? v.name : "vendor"} to Nickel`); if(r.ok) toast(`${v ? v.name : "Vendor"} added to Nickel`); }catch(e){ toast(e.message); } again(); });
  sh.querySelectorAll("[data-vask]").forEach(bt => bt.onclick = async () => { await vendorAskDetails(bt.dataset.vask); again(); });
  sh.querySelectorAll("[data-vedit]").forEach(bt => bt.onclick = () => vendorSheet(bt.dataset.vedit));
  $("#npGo").onclick = async () => {
    const from = $("#npFrom").value, byDue = $("#npDue").checked, go2 = $("#npGo");
    go2.disabled = true;
    if(from !== a.nickelPayFrom){ snapshot(); S.acct = Object.assign({}, S.acct || {}, {nickelPayFrom:from}); commit(); }
    try{
      for(const x of toAdd){
        const b = billById(x.id);
        const r = await nkRun("bill.create", {billId:x.id}, `Add the ${b.vendor} bill (${usd(cents(b.amount))}) to Nickel`);
        if(!r.ok && !r.already){ toast("Stopped. Nothing was paid."); again(); return; }
      }
      const r = await nkRun("bill.pay", {billIds:ready.map(x => x.id), payFrom:from, byDue}, `Pay ${ready.length} bill${ready.length === 1 ? "" : "s"} · ${usd(totC)}`);
      if(!r.ok){ again(); return; }
      ids.forEach(id => delete (S.ui.billSel || {})[id]);
      closeSheet(); render();
      toast(`${r.paying ? `${r.paying} payment${r.paying === 1 ? "" : "s"} on the way` : ""}${r.approval ? `${r.paying ? " · " : ""}${r.approval} waiting for approval in Nickel` : ""}${r.failed ? ` · ${r.failed} didn't go through (${r.errors[0]})` : ""}` || "Done");
    }catch(e){ toast(e.message); again(); }
  };
}

/* ====================================================================
   OWNER INVOICES — bills put on owner invoices, like the project side
   ==================================================================== */
function invTotals(v){
  const expC = v.lines.reduce((a, l) => a + cents(l.amount), 0), feeC = v.lines.reduce((a, l) => a + cents(l.fee || 0), 0);
  const paidC = (v.payments || []).reduce((a, x) => a + cents(x.amount), 0), totalC = expC + feeC;
  return {expC, feeC, totalC, paidC, dueC:Math.max(0, totalC - paidC)};
}
function invNextNo(){
  const n = invList().map(v => Number(String(v.no || "").replace(/\D/g, ""))).filter(Boolean);
  return "PM-" + (n.length ? Math.max(...n) + 1 : 1001);
}
function invLineFor(b){ const p = pmProp(b.propertyId); return {billId:b.id, propertyId:b.propertyId, property:p ? p.name : "", date:b.date, vendor:b.vendor, desc:b.memo || b.category || "Bill", amount:Number(b.amount), fee:billFeeC(b) / 100}; }
function invCreate(ownerId, billIds){
  snapshot();
  const v = {id:"inv_" + uid(), no:invNextNo(), ownerId, date:todayISO(), due:PMCore.isoOf(PMCore.dayNum(todayISO()) + 15), status:"draft",
    lines:billIds.map(id => invLineFor(billById(id))), payments:[], createdAt:new Date().toISOString(), createdBy:billWho(), note:""};
  pmState().invoices[v.id] = v;
  billIds.forEach(id => { const b = billById(id); b.invoiceId = v.id; b.updatedAt = new Date().toISOString(); });
  commit(); return v;
}
function invRefreshLines(v){   // drafts follow the bills (until the invoice exists in Nickel; then its amount is fixed)
  if(v.status !== "draft" || (v.nickel && v.nickel.invoiceId)) return;
  v.lines = v.lines.map(l => billById(l.billId)).filter(b => b && b.status !== "void" && b.invoiceId === v.id && b.recover === "invoice").map(invLineFor);
}
function invStatus(v){
  const t = invTotals(v);
  if(v.status === "void") return {label:"Void", cls:"grey"};
  if(v.status === "paid" || (v.status === "sent" && t.dueC === 0 && t.totalC > 0)) return {label:"Paid", cls:"green"};
  if(v.status === "sent") return t.paidC ? {label:`Partly paid · ${usd(t.dueC)} due`, cls:"gold"} : billDays(v.due) < 0 ? {label:`Overdue ${-billDays(v.due)}d`, cls:"red"} : {label:"Sent", cls:"acc"};
  return {label:"Draft", cls:"grey"};
}
function pgPmInvoices(){
  $("#pgCrumb").textContent = "Property management"; $("#pgTitle").textContent = "Owner invoices";
  const invs = invList();
  invs.filter(v => v.status === "draft").forEach(invRefreshLines);
  const open = invs.filter(v => v.status === "sent"), owedC = open.reduce((a, v) => a + invTotals(v).dueC, 0);
  $("#pgSub").textContent = open.length ? `${open.length} unpaid · ${usd(owedC)} owed` : "Bills you choose to invoice collect here, owner by owner";
  actions([["Bills", () => go("pmBills"), "ghost"]]);
  payStatus(); payRefreshSoon();
  const v = $("#view");

  // ready to invoice, per owner
  const ready = billList().filter(b => b.status !== "void" && b.recover === "invoice" && !b.invoiceId);
  const byOwner = {}; ready.forEach(b => { const p = pmProp(b.propertyId), k = (p && p.ownerId) || "none"; (byOwner[k] = byOwner[k] || []).push(b); });
  if(Object.keys(byOwner).length){
    const c = elm("div","card"); c.style.marginBottom = "16px";
    c.innerHTML = `<div class="card-h"><h3>Ready to invoice</h3><span class="muted" style="margin-left:auto;font-size:12px">${ready.length} bill${ready.length === 1 ? "" : "s"}</span></div>
      <div class="al-list">${Object.entries(byOwner).map(([oid, bs]) => { const o = ownerById(oid), tot = bs.reduce((a, b) => a + cents(b.amount) + billFeeC(b), 0);
        return `<div class="al-r"><div class="al-txt"><b>${esc(o ? ownerLabel(o) : "No owner on file")}</b><span>${bs.map(b => `${esc(b.vendor)} ${usd(cents(b.amount))} · ${esc((pmProp(b.propertyId) || {}).name || "")}`).join(" &nbsp;·&nbsp; ")}</span></div>
          <b class="num" style="margin-right:10px">${usd(tot)}</b>${o ? `<button class="btn sm primary" data-mk="${oid}">Create invoice</button>` : ""}</div>`; }).join("")}</div>`;
    v.appendChild(c);
    c.querySelectorAll("[data-mk]").forEach(bt => bt.onclick = () => { const inv = invCreate(bt.dataset.mk, byOwner[bt.dataset.mk].map(b => b.id)); S.ui.invOpen = inv.id; S.ui.invF = "draft"; toast(`Invoice ${inv.no} created as a draft`, true); render(); });
  }

  const f = S.ui.invF || (invs.some(x => x.status === "draft") && !invs.some(x => x.status === "sent" && invTotals(x).dueC > 0) ? "draft" : "open");
  const FILT = [["open","Unpaid", x => x.status === "sent" && invTotals(x).dueC > 0], ["draft","Drafts", x => x.status === "draft"], ["paid","Paid", x => x.status === "paid" || (x.status === "sent" && invTotals(x).dueC === 0)], ["all","All", x => x.status !== "void"]];
  const bar = elm("div","sc-bar");
  bar.innerHTML = `<div class="sc-seg">${FILT.map(([k, l, fn]) => `<button data-f="${k}" class="${f === k ? "on" : ""}">${l} <span>${invs.filter(fn).length}</span></button>`).join("")}</div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ui.invF = b.dataset.f; render(); });
  const list = invs.filter((FILT.find(x => x[0] === f) || FILT[0])[2]).sort((a, b) => String(b.no).localeCompare(a.no, undefined, {numeric:true}));
  const card = elm("div","card");
  if(!list.length){ card.innerHTML = `<div class="empty"><b>No invoices here</b><p>Choose “Invoice the owner” on a bill and it shows up in Ready to invoice.</p></div>`; v.appendChild(card); return; }
  list.forEach(inv => card.appendChild(invBlock(inv)));
  v.appendChild(card);
}
function invBlock(inv){
  const o = ownerById(inv.ownerId), t = invTotals(inv), st = invStatus(inv), open = S.ui.invOpen === inv.id;
  const w = elm("div","inv"); if(open) w.setAttribute("open", "");
  const head = elm("div","inv-head");
  head.innerHTML = `<span class="chev">›</span><span class="inv-n">${esc(inv.no)}</span><span class="tag ${st.cls}">${esc(st.label)}</span>
    <span class="iv-o">${esc(o ? ownerLabel(o) : "—")} <span class="muted">· ${inv.lines.length} bill${inv.lines.length === 1 ? "" : "s"} · ${esc(fdateS(inv.date))}</span>${inv.nickel && inv.nickel.invoiceId ? ` <span class="mark grey" title="In Nickel${inv.nickel.qb ? " and QuickBooks" : ""}">N</span>` : ""}</span>
    <span class="inv-amt">${usd(t.totalC)}<small>${t.paidC ? usd(t.paidC) + " paid" : inv.status === "sent" ? "due " + esc(fdateS(inv.due)) : ""}</small></span>`;
  head.onclick = () => { S.ui.invOpen = open ? null : inv.id; render(); };
  w.appendChild(head);
  if(!open) return w;
  const draft = inv.status === "draft" && !(inv.nickel && inv.nickel.invoiceId), body = elm("div","inv-body");
  const nkInv = inv.nickel && inv.nickel.invoiceId ? inv.nickel : null, canNk = !!(nkInv && !nkInv.deleted && !nkInv.canceled && nickelOn());
  const onFile = canNk && nkOwner(inv.ownerId).id ? (nkOwner(inv.ownerId).onFile || []) : [];
  body.innerHTML = `<table class="tbl pp-tbl"><thead><tr><th>Date</th><th>Property</th><th>Bill</th><th class="r">Amount</th><th class="r">Admin fee</th>${draft ? "<th></th>" : ""}</tr></thead><tbody>
      ${inv.lines.map(l => `<tr><td class="muted nw">${esc(fdateS(l.date))}</td><td>${esc(l.property)}</td><td>${esc(l.vendor)}<div class="item-s">${esc(l.desc)}</div></td><td class="r num">${usd(cents(l.amount))}</td><td class="r num">${l.fee ? usd(cents(l.fee)) : "—"}</td>
        ${draft ? `<td class="r"><button class="btn sm ghost" data-rm="${l.billId}" title="Take off this invoice">✕</button></td>` : ""}</tr>`).join("")}
      <tr class="iv-tot"><td colspan="3">Total</td><td class="r num">${usd(t.expC)}</td><td class="r num">${usd(t.feeC)}</td>${draft ? "<td></td>" : ""}</tr>
      <tr class="iv-tot"><td colspan="${draft ? 6 : 5}" class="r"><b>${usd(t.totalC)}</b>${t.paidC ? ` · paid ${usd(t.paidC)} · <b>${usd(t.dueC)} due</b>` : ""}</td></tr></tbody></table>
    ${(inv.payments || []).length ? `<div class="iv-pay">${inv.payments.map(x => `<span class="iv-p"><span class="tag ${x.pending ? "gold" : "green"}">${usd(cents(x.amount))} · ${esc(fdateS(x.date))} · ${esc(x.method || "")}${x.pending ? " · clearing" : ""}</span>${x.receipt ? `<a href="${esc(x.receipt)}" target="_blank" rel="noopener">receipt</a>` : ""}${!x.nkId && !x.nkExt && x.by !== "Nickel" && nkInv && !nkInv.deleted && nickelOn() && t.dueC >= 0 && (nkInv.outstandingC == null || nkInv.outstandingC > 0) ? `<a href="#" data-rec="${esc(x.id)}">also mark paid in Nickel</a>` : ""}</span>`).join(" ")}</div>` : ""}
    ${nkInv && nkInv.canceled ? `<div class="pm-banner">This invoice was deleted in Nickel, so its pay link no longer works.</div>` : ""}
    ${nkInv && nkInv.url && !nkInv.deleted ? `<div class="iv-pay muted">Pay link: <a href="${esc(nkInv.url)}" target="_blank" rel="noopener">${esc(nkInv.url)}</a>${inv.sentTo ? ` · emailed to ${esc(inv.sentTo)}` : ""}${payOnline() ? ` · <a href="#" id="ivSync">check Nickel</a>` : ""}</div>` : ""}
    <div class="iv-act">
      ${draft ? `<label class="fld" style="margin:0"><span>Due</span><input type="date" id="ivDue" value="${esc(inv.due)}"></label>` : ""}
      ${!draft && nkInv && nkInv.invoiceId && !nkInv.deleted && inv.status === "sent" && t.dueC > 0 && nickelOn() ? `<label class="fld" style="margin:0"><span>Due</span><input type="date" id="ivDue2" value="${esc(inv.due)}"></label>` : ""}
      <span style="flex:1"></span>
      <button class="btn sm" id="ivPdf">PDF</button>
      ${canNk && inv.status === "sent" && t.dueC > 0 ? `<button class="btn sm" id="ivRemind">Send reminder</button>` : ""}
      ${canNk && inv.status === "sent" && t.dueC > 0 && onFile.length ? `<button class="btn sm" id="ivCharge">Charge account on file</button>` : ""}
      ${inv.status !== "void" && t.dueC > 0 && inv.status !== "draft" ? `<button class="btn sm" id="ivPaid">Record payment</button>` : ""}
      ${draft ? `<button class="btn sm ghost danger" id="ivDel">Delete draft</button>` : ""}${inv.status === "draft" ? `<button class="btn sm primary" id="ivSend" ${!inv.lines.length ? "disabled" : ""}>${inv.nickel && inv.nickel.invoiceId ? "Finish sending" : "Send to " + esc(o && o.email ? o.email : "owner")}</button>` : ""}
      ${inv.status === "sent" && !t.paidC ? `<button class="btn sm ghost danger" id="ivVoid">Void</button>` : ""}
      ${inv.status === "void" && canNk ? `<button class="btn sm ghost danger" id="ivNkDel">Delete in Nickel too</button>` : ""}
    </div>`;
  w.appendChild(body);
  body.querySelectorAll("[data-rm]").forEach(bt => bt.onclick = () => { snapshot(); const b = billById(bt.dataset.rm); if(b) b.invoiceId = null; inv.lines = inv.lines.filter(l => l.billId !== bt.dataset.rm); commit(); render(); });
  const due = body.querySelector("#ivDue"); if(due) due.onchange = () => { snapshot(); inv.due = due.value; commit(); };
  body.querySelector("#ivPdf").onclick = () => printDoc(invHTML(inv));
  const pd = body.querySelector("#ivPaid"); if(pd) pd.onclick = () => invPaySheet(inv.id);
  const dl = body.querySelector("#ivDel"); if(dl) dl.onclick = () => { if(!confirm(`Delete draft ${inv.no}? Its bills go back to Ready to invoice.`)) return; snapshot(); inv.lines.forEach(l => { const b = billById(l.billId); if(b) b.invoiceId = null; }); delete pmState().invoices[inv.id]; commit(); render(); };
  const vd = body.querySelector("#ivVoid"); if(vd) vd.onclick = async () => {
    if(!confirm(`Void ${inv.no}? Its bills go back to Ready to invoice.${inv.nickel && inv.nickel.invoiceId ? "\n\nIt was sent through Nickel: also delete it in Nickel so the owner's pay link stops working." : ""}`)) return;
    snapshot(); const x = invById(inv.id); x.status = "void"; x.lines.forEach(l => { const b = billById(l.billId); if(b && b.invoiceId === x.id) b.invoiceId = null; }); commit(); render();
  };
  const sd = body.querySelector("#ivSend"); if(sd) sd.onclick = () => invSendSheet(inv.id);
  const q = sel => body.querySelector(sel);
  if(q("#ivSync")) q("#ivSync").onclick = async e => { e.preventDefault(); e.target.textContent = "checking…"; try{ const r = await payCall("nk.sync", {kind:"pmInvoice", id:inv.id}); toast(r.changed ? "Updated from Nickel" : "Nothing new in Nickel"); render(); }catch(er){ toast(er.message); } };
  if(q("#ivRemind")) q("#ivRemind").onclick = () => { const o = ownerById(inv.ownerId);
    nkEmailAgainSheet({title:`Remind ${ownerLabel(o) || "the owner"} about ${inv.no}`, sub:`${usd(t.dueC)} due ${fdateS(inv.due)}`, emails:ownerEmails(o),
      run:to => nkRun("invoice.send", {invoiceId:inv.id, emails:to}, `Email ${inv.no} again to ${to.join(", ")}`)}); };
  if(q("#ivCharge")) q("#ivCharge").onclick = () => nkChargeSheet({title:`Charge ${inv.no}`, dueC:t.dueC, onFile,
    run:m => nkRun("invoice.charge", {invoiceId:inv.id, methodId:m.id}, `Charge ${inv.no} (${usd(t.dueC)}) to ${m.label}`)});
  body.querySelectorAll("[data-rec]").forEach(a => a.onclick = async e => { e.preventDefault();
    try{ const r = await nkRun("invoice.record", {invoiceId:inv.id, paymentId:a.dataset.rec}, `Mark ${inv.no} paid in Nickel`); if(r.ok) toast("Recorded in Nickel — the pay link closes and QuickBooks matches"); render(); }catch(er){ toast(er.message); } });
  if(q("#ivDue2")) q("#ivDue2").onchange = async e => {
    const d = e.target.value; if(!d) return;
    try{ const r = await nkRun("invoice.update", {invoiceId:inv.id, dueDate:d}, `Change ${inv.no}'s due date to ${fdateS(d)}`); if(r.ok) toast("Due date changed in Nickel"); else e.target.value = inv.due; render(); }catch(er){ toast(er.message); e.target.value = inv.due; }
  };
  if(q("#ivNkDel")) q("#ivNkDel").onclick = async () => { try{ const r = await nkRun("invoice.delete", {invoiceId:inv.id}, `Delete ${inv.no} in Nickel`); if(r.ok) toast("Deleted in Nickel — the pay link no longer works"); render(); }catch(e){ toast(e.message); } };
  return w;
}
function invSendSheet(id){
  const inv = invById(id), o = ownerById(inv.ownerId), t = invTotals(inv), sh = $("#sheet");
  const emails = [o && o.email].concat(String((o && o.cc) || "").split(/[,;\s]+/)).filter(e => e && /@/.test(e));
  const viaNk = nickelOn(), inNkOwner = !!nkOwner(inv.ownerId).id, made = !!(inv.nickel && inv.nickel.invoiceId);
  const n = (inNkOwner ? 0 : 1) + (made ? 0 : 1) + 1;
  sh.innerHTML = `<div class="sheet-h"><div><h3>Send ${esc(inv.no)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(o ? ownerLabel(o) : "")} · ${usd(t.totalC)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="bl-rec">
        ${viaNk ? `<label class="on"><input type="radio" name="how" value="nickel" checked> <span><b>Email a Nickel pay link</b><br>The owner pays online, and it's marked paid here automatically.</span></label>` : ""}
        <label class="${viaNk ? "" : "on"}"><input type="radio" name="how" value="manual" ${viaNk ? "" : "checked"}> <span><b>Mark as sent</b><br>Download the PDF and email it yourself. Press Record payment when the owner pays.</span></label></div>
      ${viaNk ? `<div id="isNk"><label class="fld" style="margin-top:12px"><span>Email to</span><input type="text" id="isTo" value="${esc(emails.join(", "))}"></label>
        <div class="nk-how"><b>What happens when you press Send</b><ol>${inNkOwner ? "" : `<li>Nickel asks you to confirm adding ${esc(o ? ownerLabel(o) : "the owner")} as a customer (first time only).</li>`}${made ? "" : `<li>Nickel asks you to confirm creating invoice ${esc(inv.no)} for ${usd(t.totalC)}.</li>`}<li>Nickel asks you to confirm emailing it.</li></ol>
        ${nkQbOn() ? `<span class="help">Nickel adds the invoice to QuickBooks.</span>` : ""}</div></div>` : ""}
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="isGo">${viaNk ? `Send · ${n} confirmation${n === 1 ? "" : "s"}` : "Mark as sent"}</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  sh.querySelectorAll("[name=how]").forEach(r => r.onchange = () => {
    sh.querySelectorAll(".bl-rec label").forEach(l => l.classList.toggle("on", l.querySelector("input").checked));
    const nk = sh.querySelector("[name=how]:checked").value === "nickel", box = $("#isNk"); if(box) box.style.display = nk ? "" : "none";
    $("#isGo").textContent = nk ? `Send · ${n} confirmation${n === 1 ? "" : "s"}` : "Mark as sent";
  });
  openPanel();
  $("#isGo").onclick = async () => {
    const how = sh.querySelector("[name=how]:checked").value, go2 = $("#isGo");
    if(how === "manual"){ snapshot(); const x = invById(id); x.status = "sent"; x.sentAt = new Date().toISOString(); x.sentBy = billWho(); x.lines.forEach(l => { const b = billById(l.billId); if(b) b.invoiceId = x.id; }); commit(); closeSheet(); toast(`${inv.no} marked as sent`, true); render(); return; }
    const to = $("#isTo").value.split(/[,;\s]+/).filter(e => /@/.test(e));
    if(!to.length) return toast("Add the owner's email");
    go2.disabled = true;
    try{
      await payCall("nk.match", {}, {raw:true}).catch(() => {});                 // the owner may already be in Nickel
      if(!nkOwner(inv.ownerId).id){ const r = await nkRun("owner.create", {ownerId:inv.ownerId}, `Add ${o ? ownerLabel(o) : "the owner"} to Nickel`); if(!r.ok && !r.already){ go2.disabled = false; return; } }
      if(!(invById(id).nickel || {}).invoiceId){ const r = await nkRun("invoice.create", {invoiceId:id}, `Create ${inv.no} · ${usd(t.totalC)}`); if(!r.ok && !r.already){ go2.disabled = false; return; } }
      const r = await nkRun("invoice.send", {invoiceId:id, emails:to}, `Email ${inv.no} to ${to.join(", ")}`);
      if(!r.ok){ go2.disabled = false; return; }
      closeSheet(); toast(`${inv.no} emailed with a Nickel pay link`); render();
    }catch(e){ go2.disabled = false; toast(e.message); }
  };
}
function invPaySheet(id){
  const inv = invById(id), t = invTotals(inv), sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>Record a payment</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(inv.no)} · ${usd(t.dueC)} due</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="muted" style="margin-top:0;font-size:13px">For a payment that didn't come through the Nickel pay link: a check, or taken out of rent.${inv.nickel && inv.nickel.invoiceId ? " Also mark it paid in Nickel so the pay link closes and QuickBooks matches." : ""}</p>
      <div class="f3"><label class="fld"><span>Amount</span><input type="number" step="0.01" id="ipA" value="${(t.dueC / 100).toFixed(2)}"></label>
        <label class="fld"><span>Date</span><input type="date" id="ipD" value="${todayISO()}"></label>
        <label class="fld"><span>How</span><select id="ipM"><option>Check</option><option>ACH / bank transfer</option><option>Deducted from rent</option><option>Zelle</option><option>Other</option></select></label></div>
      <label class="fld"><span>Reference</span><input type="text" id="ipR" placeholder="optional"></label>
      ${inv.nickel && inv.nickel.invoiceId && !inv.nickel.deleted && nickelOn() ? `<label class="ps-chk"><input type="checkbox" id="ipNk" checked> Also mark it paid in Nickel (closes the pay link, QuickBooks matches; you'll confirm it)</label>` : ""}</div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="ipGo">Record</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  $("#ipGo").onclick = () => {
    const amt = Math.round(Number($("#ipA").value) * 100) / 100; if(!(amt > 0)) return toast("Enter the amount");
    const alsoNk = !!($("#ipNk") && $("#ipNk").checked), pid = "pay_" + uid(), ref = $("#ipR").value.trim();
    snapshot(); const x = invById(id);
    x.payments = (x.payments || []).concat([{id:pid, amount:amt, date:$("#ipD").value || todayISO(), method:$("#ipM").value + (ref ? " " + ref : ""), ref, by:billWho()}]);
    if(invTotals(x).dueC === 0) x.status = "paid";
    commit(); closeSheet(); toast("Payment recorded"); render();
    if(alsoNk) Promise.resolve().then(() => nkRun("invoice.record", {invoiceId:id, paymentId:pid}, `Mark ${inv.no} paid in Nickel: ${usd(Math.round(amt * 100))}`)).then(r => { if(r && r.ok) toast("Also marked paid in Nickel"); render(); }).catch(e => toast(e.message));
  };
}
function invHTML(inv){
  const o = ownerById(inv.ownerId), t = invTotals(inv), addr = o ? ownerAddressLines(o) : [];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(inv.no)}</title><style>
  @page{size:letter;margin:0.6in} body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#1A2322;margin:0}
  table{border-collapse:collapse;width:100%} .brand{font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;color:#1D5C57;font-weight:bold}
  h1{font-size:20pt;font-weight:normal;margin:4px 0 0} .rt{text-align:right;font-size:10pt;color:#3A4745;vertical-align:top}
  .rule{border-top:2px solid #1D5C57;margin:14px 0 16px} .k{font-size:8pt;letter-spacing:1px;text-transform:uppercase;color:#6B7775;margin-bottom:3px}
  .pt td{vertical-align:top;width:50%;font-size:10pt;line-height:1.45} .ac th{font-size:8pt;letter-spacing:.8px;text-transform:uppercase;color:#6B7775;text-align:left;border-bottom:1px solid #C9D1CE;padding:6px}
  .ac td{padding:6px;border-bottom:1px solid #ECEFED;vertical-align:top} .r{text-align:right;white-space:nowrap} .m{color:#6B7775;font-size:9pt}
  .tot td{border-top:2px solid #1A2322;border-bottom:0;font-weight:bold;font-size:11.5pt;padding-top:9px} .ft{margin-top:24px;font-size:9pt;color:#6B7775;line-height:1.5}
</style></head><body>
  <table><tr><td><div class="brand">PHD Property Management</div><h1>Invoice ${esc(inv.no)}</h1></td><td class="rt"><b>Date</b> ${docLong(inv.date)}<br><b>Due</b> ${docLong(inv.due)}</td></tr></table>
  <div class="rule"></div>
  <table class="pt"><tr><td><div class="k">Bill to</div>${o ? `<b>${esc(o.name || o.company)}</b>${addr.map(l => `<br>${esc(l)}`).join("")}` : ""}</td>
    <td><div class="k">Amount due</div><b style="font-size:16pt">${usd(t.dueC)}</b>${t.paidC ? `<br><span class="m">${usd(t.paidC)} received</span>` : ""}</td></tr></table>
  <table class="ac" style="margin-top:20px"><thead><tr><th>Date</th><th>Property</th><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
    ${inv.lines.map(l => `<tr><td class="m">${docShort(l.date)}</td><td>${esc(l.property)}</td><td>${esc(l.vendor)}<br><span class="m">${esc(l.desc)}</span></td><td class="r">${usd(cents(l.amount))}</td></tr>`).join("")}
    ${t.feeC ? `<tr><td></td><td></td><td>Admin fee</td><td class="r">${usd(t.feeC)}</td></tr>` : ""}
    <tr class="tot"><td></td><td></td><td>Total</td><td class="r">${usd(t.totalC)}</td></tr></tbody></table>
  ${inv.nickel && inv.nickel.url ? `<div class="ft">Pay online: ${esc(inv.nickel.url)}</div>` : ""}
  <div class="ft">Thank you for your continued business.<br>PHD Property Management</div></body></html>`;
}

/* ====================================================================
   VENDORS
   ==================================================================== */
const nkVendorTag = id => { const nk = nkVendor(id);
  if(!nk.id) return nk.requested ? `<span class="tag gold">Not in Nickel</span>` : `<span class="muted">Not in Nickel</span>`;
  if((nk.payout || []).length) return `<span class="tag green">Ready · ${nk.payout[0].type === "CHECK" ? "check" : "bank"}</span>`;
  return nk.requested ? `<span class="tag gold">Form sent ${esc(fdateS(String(nk.requested).slice(0, 10)))}</span>` : `<span class="tag gold">No bank details</span>`; };
// Nickel's vendors that aren't in the console yet are brought in (matched by email, then name)
function nkImportVendors(){
  const all = (S.nk && S.nk.nickelVendors) || [];
  if(!all.length) return 0;
  const L = pmVendors(), em = new Set(L.map(v => String(v.email || "").toLowerCase()).filter(Boolean)), nm = new Set(L.map(v => vendorKey(v.name)));
  const add = all.filter(x => x.name && !nm.has(vendorKey(x.name)) && !(x.emails || []).some(e => em.has(String(e).toLowerCase())));
  if(!add.length) return 0;
  snapshot();
  add.forEach(x => { L.push({id:"vn_" + uid(), name:x.name.trim(), email:(x.emails || [])[0] || "", phone:"", address:x.address || "", city:x.city || "", state:x.state || "", zip:x.zip || "", notes:"", createdAt:new Date().toISOString(), from:"Nickel"}); nm.add(vendorKey(x.name)); });
  commit();
  return add.length;
}
let nkMatchAt = 0;
function nkMatchSoon(view){
  if(!payOnline() || !nickelOn() || Date.now() - nkMatchAt < 15 * 60000) return;
  nkMatchAt = Date.now();
  payCall("nk.match", {}, {raw:true}).then(() => {
    const n = nkImportVendors();
    if(n){ toast(`Added ${n} vendor${n === 1 ? "" : "s"} from Nickel`); return payCall("nk.match", {}, {raw:true}); }   // link the new ones
  }).then(() => { if(S.ui.view === view) render(); }).catch(() => {});
}
function pgPmVendors(){
  $("#pgCrumb").textContent = "Property management"; $("#pgTitle").textContent = "Vendors";
  // anyone billed before becomes a vendor record
  const names = new Set(pmVendors().map(v => vendorKey(v.name)));
  const missing = [...new Set(billList().map(b => b.vendor).filter(n => n && !names.has(vendorKey(n))))];
  if(missing.length){ snapshot(); missing.forEach(vendorEnsure); commit(); }
  if(nkImportVendors()){ nkMatchAt = 0; setTimeout(render, 0); return; }   // new ones are drawn (and linked) on the next pass
  const allV = pmVendors().slice().sort((a, b) => a.name.localeCompare(b.name));
  const used = new Set(billList().map(b => b.vendorId)), vq = (S.ui.vnQ || "").toLowerCase(), vf = S.ui.vnF || "all";
  const VF = [["all","All", () => true], ["used","Billed here", x => used.has(x.id)], ["ready","Ready to pay", x => (nkVendor(x.id).payout || []).length], ["missing","Needs bank details", x => nkVendor(x.id).id && !(nkVendor(x.id).payout || []).length], ["out","Not in Nickel", x => !nkVendor(x.id).id]];
  const vs = allV.filter((VF.find(f => f[0] === vf) || VF[0])[2]).filter(x => !vq || `${x.name} ${x.email} ${x.phone}`.toLowerCase().includes(vq));
  $("#pgSub").textContent = `${allV.length} vendor${allV.length === 1 ? "" : "s"} · bank details stay in Nickel, never here`;
  actions([["Check Nickel", async () => { try{ await payCall("nk.match"); const n = nkImportVendors(); const r = n ? await payCall("nk.match") : (S.nk || {}).counts || {};
      toast(`${n ? `Added ${n} from Nickel · ` : ""}${r.vendorsMatched || 0} of ${pmVendors().length} vendors linked to Nickel`); render(); }catch(e){ toast(e.message); } }, "ghost"], ["Add vendor", () => vendorSheet(null), "primary"]]);
  payStatusThenRedraw("pmVendors"); nkMatchSoon("pmVendors");
  const v = $("#view"), yr = todayISO().slice(0, 4);
  if(allV.length){
    const bar = elm("div","sc-bar");
    bar.innerHTML = `<div class="sc-seg">${VF.map(([k, l, fn]) => `<button data-f="${k}" class="${vf === k ? "on" : ""}">${l} <span>${allV.filter(fn).length}</span></button>`).join("")}</div>
      <div class="sc-q"><input type="text" id="vnQ" placeholder="Find a vendor…" value="${esc(S.ui.vnQ || "")}"></div>`;
    v.appendChild(bar);
    bar.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ui.vnF = b.dataset.f; render(); });
    const qi = bar.querySelector("#vnQ");
    qi.oninput = () => { S.ui.vnQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#vnQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 160); };
  }
  const card = elm("div","card");
  if(allV.length && !vs.length){ card.innerHTML = `<div class="empty"><b>No vendors match</b><p>Try another filter or search.</p></div>`; v.appendChild(card); return; }
  if(!vs.length){ card.innerHTML = `<div class="empty"><b>No vendors yet</b><p>${nickelOn() ? "Bringing in your vendors from Nickel…" : "They're added automatically the first time you enter a bill from them, or from Nickel once it's connected."}</p></div>`; v.appendChild(card); return; }
  const t = elm("table","tbl pm-plist");
  t.innerHTML = `<thead><tr><th>Vendor</th><th>Contact</th><th class="r">Paid ${yr}</th><th>Nickel</th><th></th></tr></thead><tbody>
    ${vs.slice(0, 300).map(x => { const bs = billList().filter(b => b.vendorId === x.id || vendorKey(b.vendor) === vendorKey(x.name)), paid = bs.filter(b => b.status === "paid" && String((b.pay || {}).date || "").startsWith(yr)).reduce((a, b) => a + cents(b.amount), 0);
      return `<tr data-v="${x.id}"><td><div class="item-t">${esc(x.name)}</div><div class="item-s">${bs.length} bill${bs.length === 1 ? "" : "s"}</div></td><td class="muted" style="font-size:12.5px">${esc([x.email, x.phone].filter(Boolean).join(" · ") || "—")}</td>
        <td class="r num">${paid ? usd(paid) : "—"}</td><td>${nkVendorTag(x.id)}</td><td class="act"><span class="sc-go">›</span></td></tr>`; }).join("")}</tbody>`;
  t.querySelectorAll("[data-v]").forEach(tr => tr.onclick = () => vendorSheet(tr.dataset.v));
  const w = elm("div","tbl-wrap vn-ok"); w.appendChild(t); card.appendChild(w);
  if(vs.length > 300) card.appendChild(elm("div","muted", `<div style="padding:10px 16px;font-size:12.5px">Showing 300 of ${vs.length}. Search to find the rest.</div>`));
  v.appendChild(card);
}
function vendorSheet(id){
  const isNew = !id, v = isNew ? {id:"vn_" + uid(), name:"", email:"", phone:"", address:"", city:"", state:"SC", zip:"", notes:""} : JSON.parse(JSON.stringify(pmVendors().find(x => x.id === id)));
  const sh = $("#sheet"), F = [["name","Name"],["email","Billing email"],["phone","Phone"],["address","Street"],["city","City"],["state","State"],["zip","ZIP"]];
  const nk = nkVendor(v.id);
  sh.innerHTML = `<div class="sheet-h"><h3>${isNew ? "New vendor" : esc(v.name)}</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">${F.map(([k, l]) => `<label class="fld"><span>${l}</span><input type="text" data-k="${k}" value="${esc(v[k] || "")}"></label>`).join("")}
      <label class="fld"><span>Notes</span><textarea data-k="notes" rows="2">${esc(v.notes || "")}</textarea></label>
      ${isNew ? "" : `<div class="sectl">Nickel</div>
        ${!nickelOn() ? `<p class="help" style="margin-top:0">Nickel isn't connected (Payments setup).</p>`
        : !nk.id ? `<p class="help" style="margin-top:0">Not in Nickel yet${v.email ? "" : ". Add a billing email first so Nickel can send payment notices"}.</p><div class="bl-pay"><button class="btn sm" id="vnAdd">Add to Nickel</button></div>`
        : `<div class="bl-nk">${nkVendorTag(v.id)}${nk.name && vendorKey(nk.name) !== vendorKey(v.name) ? `<span class="muted">as “${esc(nk.name)}” in Nickel</span>` : ""}</div>
          ${(nk.payout || []).map(m => `<div class="ps-kv"><span>${m.type === "CHECK" ? "Check" : "Bank"}</span><b>${esc(m.label)}</b></div>`).join("")}
          <p class="help">${(nk.payout || []).length ? "Ready to pay from the console." : "Nickel needs the vendor's bank account (or a check address) before you can pay them."} Nickel's form lets the vendor type their own bank details. They never pass through this console.</p>
          <div class="bl-pay">${v.email ? `<button class="btn sm" id="vnAsk">${(nk.payout || []).length ? "Ask them to update bank details" : nk.requested ? "Email the form again" : "Email bank-details form"}</button>` : `<span class="muted">Add a billing email to send Nickel's form.</span>`}<button class="btn sm ghost" id="vnPush" title="Name, email and address">Send changes to Nickel</button>${nk.url ? `<a class="btn sm ghost" href="${esc(nk.url)}" target="_blank" rel="noopener">Open in Nickel</a>` : ""}</div>`}`}
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="vnSave">Save</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  const saveForm = () => {
    sh.querySelectorAll("[data-k]").forEach(i => v[i.dataset.k] = i.value.trim());
    if(!v.name){ toast("Enter the vendor's name"); return false; }
    const dup = vendorFind(v.name); if(dup && dup.id !== v.id){ toast("There's already a vendor with that name"); return false; }
    snapshot(); const L = pmVendors(), i = L.findIndex(x => x.id === v.id);
    if(i >= 0){ const old = L[i].name; L[i] = Object.assign(L[i], v); if(old !== v.name) billList().forEach(b => { if(b.vendorId === v.id) b.vendor = v.name; }); } else L.push(v);
    commit(); return true;
  };
  const add = $("#vnAdd"); if(add) add.onclick = async () => { if(!saveForm()) return; try{ const r = await nkRun("vendor.create", {vendorId:v.id}, `Add ${v.name} to Nickel`); if(r.ok) toast(`${v.name} added to Nickel`); }catch(e){ toast(e.message); } vendorSheet(v.id); };
  const ask = $("#vnAsk"); if(ask) ask.onclick = async () => { if(!saveForm()) return; await vendorAskDetails(v.id); vendorSheet(v.id); };
  const push = $("#vnPush"); if(push) push.onclick = async () => { if(!saveForm()) return;
    try{ const r = await nkRun("vendor.update", {vendorId:v.id}, `Update ${v.name} in Nickel`); if(r.nothing) toast("Nickel already has these details"); else if(r.ok) toast(`${v.name} updated in Nickel`); }catch(e){ toast(e.message); } vendorSheet(v.id); };
  $("#vnSave").onclick = () => { if(!saveForm()) return; closeSheet(); toast("Vendor saved", true); render(); };
}
async function vendorAskDetails(vendorId){
  const v = pmVendors().find(x => x.id === vendorId); if(!v) return;
  if(!v.email) return toast("Add the vendor's billing email first");
  try{ const r = await nkRun("vendor.ask", {vendorId}, `Email ${v.name} Nickel's bank-details form`); if(r.ok) toast(`Nickel emailed the form to ${v.email}`); }
  catch(e){ toast(e.message); }
}

/* ====================================================================
   PAYMENTS SETUP — Nickel connection, who can pay, QuickBooks coding (through Nickel)
   ==================================================================== */
let NKL = null;   // QuickBooks accounts and products, read through Nickel
const PJ_MEMO_DEFAULT = "Invoices will be issued once the accumulated project balance, including the project management fee, reaches {cap}. Any remaining balance will carry forward to the next invoice.\n\nIf you have any questions or concerns, please feel free to reach out via email at billing@phdproperties.realestate or call us at 843-212-6383. Thank you for your business!";
// old address for the setup: it now lives on the shared Payments page
function pgPmPaySetup(){ S.ui.view = "payments"; S.ui.payTab = "setup"; persistUi(); pgPayments(); }
function paySetupInto(v){
  actions([["Check again", async () => { NKL = null; await payStatus(true); render(); }, "ghost"]]);
  if(!payOnline()){ v.appendChild(elm("div","card",`<div class="empty"><b>Sign in to the hosted console</b><p>Payments run through the office's Supabase project.</p></div>`)); return; }
  if(!PAY.status && !PAY.err && !PAY.asked){ v.appendChild(elm("div","card",`<div class="empty"><p class="muted">Checking Nickel…</p></div>`)); payStatusThenRedraw("payments"); return; }
  const st = PAY.status || {}, nk = st.nickel || {}, a = S.acct || {}, qb = nk.qbo || {};
  if(PAY.err) v.appendChild(elm("div","pm-banner", `The payments function didn't answer: ${esc(PAY.err)}`));
  const grid = elm("div","ps-grid"); v.appendChild(grid);

  const nc = elm("div","card");
  const from = (nk.payFrom || []).find(x => x.id === a.nickelPayFrom) || (nk.payFrom || []).find(x => x.isDefault) || (nk.payFrom || [])[0];
  nc.innerHTML = `<div class="card-h"><h3>Nickel</h3>${nk.ok ? `<span class="tag green">Connected</span>` : `<span class="tag grey">Not connected</span>`}</div>
    <div class="card-b ps-b">${nk.ok ? `
      <label class="fld"><span>Pay vendors from</span><select id="psFrom">${(nk.payFrom || []).map(x => `<option value="${esc(x.id)}" ${from && x.id === from.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
      <div class="ps-kv"><span>Can send payments</span><b>${esc((nk.payers || []).join(", ") || "Nobody yet")}</b></div>
      <div class="ps-kv"><span>Payments and owner invoices checked</span><b>${nk.lastRefresh ? esc(mdAgo(nk.lastRefresh)) : "Every hour"}</b></div>
      ${(S.nk || {}).counts ? `<div class="ps-kv"><span>Vendors linked to Nickel</span><b>${S.nk.counts.vendorsMatched} of ${pmVendors().length} · Nickel has ${S.nk.counts.nickelVendors}</b></div>
      <div class="ps-kv"><span>Owners linked to Nickel customers</span><b>${S.nk.counts.ownersMatched} of ${S.nk.counts.owners} · Nickel has ${S.nk.counts.nickelCustomers}</b></div>` : ""}
      <p class="help">Every change in Nickel asks for your confirmation in the console, in Nickel's own words. Reading (statuses, vendor matches) happens on its own every hour.</p>
      <button class="btn sm" id="psNkRefresh">Check Nickel now</button>`
      : `<p style="margin-top:0">${esc(nk.error || "Not connected.")}</p>
      <ol class="ps-steps"><li>Nickel → Settings → MCP → API tokens → <b>Create token</b>. Copy it (it's shown once).</li>
        <li>Supabase → Edge Functions → Secrets → add <code>NICKEL_MCP_TOKEN</code> with the token.</li>
        <li>Press Check again.</li></ol>
      <p class="help">Until then: pay in <a href="${NICKEL_APP}" target="_blank" rel="noopener">Nickel</a> and press Mark paid on the bill here.</p>`}</div>`;
  grid.appendChild(nc);
  const pf = nc.querySelector("#psFrom"); if(pf) pf.onchange = () => { snapshot(); S.acct = Object.assign({}, S.acct || {}, {nickelPayFrom:pf.value}); commit(); toast("Saved", true); };
  const r1 = nc.querySelector("#psNkRefresh"); if(r1) r1.onclick = async () => { r1.disabled = true; try{ const r = await payCall("nickel.refresh"); await payStatus(true); toast(r.changed ? `${r.changed} update${r.changed === 1 ? "" : "s"} from Nickel` : "Everything is up to date"); render(); }catch(e){ toast(e.message); r1.disabled = false; } };

  const qc = elm("div","card");
  const opt = (list, cur) => `<option value="">Don't code it (Nickel only)</option>` + (list || []).map(x => `<option value="${esc(x.id)}" ${String(cur) === String(x.id) ? "selected" : ""}>${esc(x.name)}${x.type ? " · " + esc(x.type) : ""}</option>`).join("");
  const optI = (list, cur, guess) => { const g = !cur && (list || []).find(x => x.name.toLowerCase() === String(guess).toLowerCase());
    return `<option value="">Choose…</option>` + (list || []).map(x => `<option value="${esc(x.id)}" ${String(cur) === String(x.id) || (g && g.id === x.id) ? "selected" : ""}>${esc(x.name)}</option>`).join(""); };
  qc.innerHTML = `<div class="card-h"><h3>QuickBooks</h3>${!nk.ok ? `<span class="tag grey">—</span>` : qb.connected ? `<span class="tag green">Synced through Nickel</span>` : `<span class="tag grey">Not connected in Nickel</span>`}</div>
    <div class="card-b ps-b">${!nk.ok ? `<p class="help" style="margin-top:0">Connect Nickel first.</p>`
      : !qb.connected ? `<p style="margin-top:0">Nickel isn't connected to QuickBooks. Connect it in Nickel (Settings → Integrations) and bills and invoices made here will flow into QuickBooks.</p>`
      : !NKL ? `<p class="muted" style="margin-top:0">Loading your QuickBooks accounts…</p>`
      : `<p class="help" style="margin-top:0">Which QuickBooks account each kind of entry is coded to when Nickel adds it. Your bookkeeper should confirm these.</p>
        <label class="fld"><span>Vendor bills</span><select data-a="nkExpense">${opt(NKL.expense, a.nkExpense)}</select></label>
        <label class="fld"><span>Owner invoices: reimbursed bills</span><select data-a="nkReimb">${opt(NKL.revenue, a.nkReimb)}</select></label>
        <label class="fld"><span>Owner invoices: admin fee</span><select data-a="nkFee">${opt(NKL.revenue, a.nkFee)}</select></label>
        <div class="sectl">Projects</div>
        <label class="fld"><span>Project vendor bills (paid from a transaction)</span><select data-a="nkProjBillExp">${opt(NKL.expense, a.nkProjBillExp)}</select></label>
        <label class="fld"><span>Product for project expenses</span><select data-a="nkProjItem">${optI(NKL.revenueItems, a.nkProjItem, "Project Management")}</select></label>
        <label class="fld"><span>Product for the fee (if none matches the property's %)</span><select data-a="nkProjFeeItem">${optI(NKL.revenueItems, a.nkProjFeeItem, "Project Management Fee")}</select>
          <span class="help">A product named like “10% Project Management Fee” or “15% Project Management Fee” is picked automatically for properties with that fee.</span></label>
        <label class="fld"><span>Message on project invoices</span><textarea data-a="nkProjMemo" rows="5" placeholder="${esc(PJ_MEMO_DEFAULT)}">${esc(a.nkProjMemo || "")}</textarea>
          <span class="help">Blank uses the standard message. {cap} becomes the property's invoice cap.</span></label>
        <p class="help">Left blank, the bill or invoice is still created in Nickel, just without QuickBooks coding.</p>`}</div>`;
  grid.appendChild(qc);
  qc.querySelectorAll("[data-a]").forEach(s2 => s2.onchange = () => { snapshot(); S.acct = Object.assign({}, S.acct || {}, {[s2.dataset.a]:s2.value.trim()}); commit(); toast("Saved"); });
  // a guessed product (exact name match) counts as chosen
  qc.querySelectorAll("select[data-a]").forEach(s2 => { if(s2.value && !(S.acct || {})[s2.dataset.a]){ S.acct = Object.assign({}, S.acct || {}, {[s2.dataset.a]:s2.value}); commit(); } });
  if(nk.ok && qb.connected && !NKL && !NKL_LOADING){ NKL_LOADING = true; payCall("nk.lists", {}, {noSave:true}).then(r => { NKL = r; }).catch(e => { NKL = {expense:[], revenue:[]}; toast("QuickBooks accounts: " + e.message); }).finally(() => { NKL_LOADING = false; if(S.ui.view === "payments") render(); }); }
}
let NKL_LOADING = false;

/* =====================================================================
   PROJECT INVOICES → NICKEL + QUICKBOOKS
   A locked invoice can be created in Nickel with one button. Nickel adds it
   to QuickBooks (coded to the accounts picked on Payments setup) and gives
   back the owner's pay link. When the owner pays, the hourly check marks the
   invoice Paid in full. Every change is confirmed in the Nickel window.
   ===================================================================== */
const pjKey = (unit, inv) => unit.id + "|" + inv.no;
// 3282HARTWELL-006 · 120SMITH-B-001 (street words dropped; unit only when the property has several)
const PJ_STREET = /\b(st|street|dr|drive|rd|road|ave|avenue|ln|lane|blvd|boulevard|ct|court|way|pl|place|cir|circle|hwy|highway|pkwy|parkway|ter|terrace|trl|trail)\b\.?/gi;
function pjInvNumber(p, unit, inv){
  const base = (p.qbPrefix || String(p.name || "").replace(PJ_STREET, "")).toUpperCase().replace(/[^A-Z0-9]/g, "") || "INV";
  const u = p.units.length > 1 ? String(unit.name || "").replace(/^unit\s*/i, "").toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
  const tail = `${u ? "-" + u : ""}-${String(inv.no).padStart(3, "0")}`;
  return base.slice(0, 21 - tail.length) + tail;
}
const pjUnitLabel = (p, unit) => p.units.length > 1 ? ` · ${unit.name}` : "";
// how each line reads in QuickBooks, like the invoices made by hand:
// "Bathroom Renovation — Part 2 of 3 of $20,366.00 (Armando)"
function pjLineWords(p, unit, inv){
  const C = ALL[p.id];
  return inv.lines.filter(l => l.expC).map(l => {
    const t = l.txn || {}, parts = ((C && C.txn[l.txnId] && C.txn[l.txnId].parts) || []).filter(x => x.unitId === unit.id), pi = parts.findIndex(x => x.no === inv.no);
    let d = String(t.desc || "Project expense").trim();
    if(l.partial && !l.credit && parts.length > 1) d += ` — Part ${pi + 1} of ${parts.length} of ${usd(l.fullC)}`;
    if(t.vendor) d += ` (${String(t.vendor).trim()})`;
    if(!l.feeApplies && !l.credit) d += " — billed at cost";
    return {txnId:l.txnId, desc:d};
  });
}
// the fee product for this property's %: "10% Project Management Fee" if QuickBooks has one, else the default
function pjFeeItem(p){
  const list = (typeof NKL !== "undefined" && NKL && NKL.revenueItems) || [];
  const hit = list.find(x => new RegExp(`(^|\\D)${String(p.feePct).replace(".", "\\.")}\\s*%`).test(x.name) && /fee/i.test(x.name));
  return hit ? hit.id : ((S.acct || {}).nkProjFeeItem || "");
}
async function pjLoadLists(){ if(typeof NKL !== "undefined" && NKL && NKL.revenueItems) return; try{ NKL = await payCall("nk.lists", {}, {noSave:true}); }catch(e){} }
// can Nickel put this one in QuickBooks? (same rules the server applies)
function pjQbWhy(p, inv){
  const st = PAY.status && PAY.status.nickel, a = S.acct || {}, c = nkOwner(p.ownerId);
  if(!st || !st.ok) return "Nickel isn't connected";
  if(!(st.qbo && st.qbo.connected)) return "Nickel isn't connected to QuickBooks";
  if(!a.nkProjItem && !a.nkProjExp) return "pick the QuickBooks products for project invoices on Payments setup";
  if(a.nkProjItem && inv.feeC && !pjFeeItem(p)) return `pick the fee product on Payments setup (no “${p.feePct}% … Fee” product found)`;
  if(c.id && !c.synced) return "this owner isn't linked to QuickBooks in Nickel";
  return "";
}
// the billing@ email for this invoice: sent, or a draft waiting in Gmail
function pjMailLine(reg){
  const m = reg.email; if(!m) return "";
  return `<p class="help" style="margin:8px 0 0">${m.sent ? `${icon("mail")} Emailed ${esc(fdateS(String(m.at).slice(0, 10)))} to ${esc(m.to)} from billing@` : `${icon("mail")} Draft waiting in billing@'s Gmail (to ${esc(m.to)}) — send it there, or email it from here`}</p>`;
}
// a Nickel payment line: amount, how, when, clearing / deposited, receipt
function nkPayLine(x){
  const st = String(x.status || "").toUpperCase(), clearing = !x.external && st && st !== "SUCCEEDED";
  return `<span class="iv-p"><span class="tag ${clearing ? "gold" : "green"}">${usd(x.amountC)} · ${esc(x.date ? fdateS(x.date) : "")} · ${esc(x.method || "")}${clearing ? " · clearing" : ""}</span>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">receipt</a>` : ""}${!x.external && x.disbursement === "DEPOSITED" ? `<span class="muted" title="Nickel moved it to your bank">deposited</span>` : ""}</span>`;
}
function pjNickelPanel(p, unit, inv){
  const reg = inv.reg || {}, nk = reg.nickel || {}, box = elm("div", "pj-nk"), key = pjKey(unit, inv);
  if(nk.invoiceId){
    const pays = nk.payments || [], outC = nk.outstandingC != null ? nk.outstandingC : (reg.paid ? 0 : inv.totalC);
    const cust = nkOwner(p.ownerId), onFile = cust.id && (!nk.customerId || cust.id === nk.customerId) ? (cust.onFile || []) : [];
    const open = !nk.canceled && outC > 0, canAct = nickelOn() && open;
    const paidHere = reg.paid && outC > 0;      // marked paid in the console, still open in Nickel
    box.innerHTML = `<div class="pj-nk-h"><span class="tag acc">In Nickel</span>${nk.qb ? `<span class="tag green">In QuickBooks</span>` : `<span class="tag gold" title="${esc(nk.qbWhy || "")}">Not in QuickBooks</span>`}${nk.canceled ? `<span class="tag red">Deleted in Nickel</span>` : outC === 0 && pays.length ? `<span class="tag green">Paid in Nickel</span>` : nk.paidC ? `<span class="tag gold">${usd(nk.paidC)} paid · ${usd(outC)} open</span>` : ""}
        <span class="muted">${esc(nk.number || "")}${nk.customer ? ` · billed to ${esc(nk.customer)}` : ""}${nk.sentTo ? ` · emailed to ${esc(nk.sentTo)}` : ""}</span>
        ${payOnline() ? `<a href="#" class="muted" data-pj="sync" style="margin-left:auto">Check Nickel</a>` : ""}</div>
      ${pays.length ? `<div class="iv-pay">${pays.map(nkPayLine).join(" ")}</div>` : ""}
      ${nk.url && !nk.canceled ? `<div class="pj-nk-link"><input type="text" readonly value="${esc(nk.url)}" aria-label="Pay link"><button class="btn sm" data-pj="copy">Copy pay link</button><a class="btn sm ghost" href="${esc(nk.url)}" target="_blank" rel="noopener">Open</a></div>`
        : !nk.canceled ? `<p class="help">Nickel didn't return a pay link. Open the invoice in Nickel to copy it.</p>` : ""}
      ${pjMailLine(reg)}
      ${canAct ? `<div class="pj-nk-tools"><button class="btn sm ${reg.email && reg.email.sent ? "" : "primary"}" data-pj="mail">${reg.email && reg.email.sent ? "Email owner again" : "Email owner"}</button><button class="btn sm ghost" data-pj="send" title="Nickel's own invoice email instead of the billing@ email">${nk.sentTo ? "Nickel's email again" : "Send Nickel's email"}</button>
        ${onFile.length ? `<button class="btn sm" data-pj="charge">Charge account on file</button>` : ""}
        ${paidHere ? `<button class="btn sm primary" data-pj="record">Mark paid in Nickel too</button>` : ""}
        <button class="btn sm ghost danger" data-pj="del">Delete in Nickel</button></div>` : ""}
      ${paidHere ? `<p class="help">You marked this paid here${reg.ref ? " (" + esc(reg.ref) + ")" : ""}, but Nickel still shows ${usd(outC)} open. Marking it paid in Nickel closes the pay link and updates QuickBooks.</p>` : ""}
      ${!nk.qb && nk.qbWhy ? `<p class="help">Not added to QuickBooks: ${esc(nk.qbWhy)}.</p>` : ""}
      ${nk.canceled ? `<p class="help">Deleted in Nickel. <a href="#" data-pj="forget">Clear it here</a> to create it again.</p>` : ""}`;
  } else if(inv.locked){
    const why = pjQbWhy(p, inv);
    box.innerHTML = `<div class="pj-nk-h"><b>QuickBooks + Nickel pay link</b><span class="muted">${why ? esc(why[0].toUpperCase() + why.slice(1)) + "." : "Creates this invoice in QuickBooks (through Nickel) and gets the owner's pay link."}</span></div>
      <div class="pj-nk-link"><button class="btn sm primary" data-pj="create" ${why === "Nickel isn't connected" ? "disabled" : ""}>Create in QuickBooks + get pay link</button>${why && why !== "Nickel isn't connected" ? `<button class="btn sm ghost" data-pj="setup">Payments setup</button>` : ""}</div>
      ${reg.link ? `${pjMailLine(reg)}<div class="pj-nk-tools"><button class="btn sm" data-pj="mail">Email owner the invoice link</button></div>` : ""}
      ${reg.nickelOld && reg.nickelOld.deleted ? `<p class="help">${esc(reg.nickelOld.number || "The earlier one")} was deleted in Nickel ${esc(fdateS(String(reg.nickelOld.deleted).slice(0, 10)))}.</p>` : ""}`;
  } else {
    box.innerHTML = `<div class="pj-nk-h"><span class="muted">Lock this invoice to create it in QuickBooks and get a Nickel pay link.</span></div>`;
  }
  const q = sel => box.querySelector(`[data-pj="${sel}"]`);
  if(q("copy")) q("copy").onclick = () => { navigator.clipboard.writeText(nk.url).then(() => toast("Pay link copied")); };
  if(q("setup")) q("setup").onclick = () => paySetup();
  if(q("create")) q("create").onclick = () => pjCreateSheet(p, unit, inv);
  if(q("send")) q("send").onclick = () => pjSendSheet(p, unit, inv);
  if(q("mail")) q("mail").onclick = () => pjEmailSheet(p, unit, inv);
  if(reg.email && !reg.email.sent) setTimeout(() => bmCheckDraft(p, unit, inv), 0);
  if(q("sync")) q("sync").onclick = async e => { e.preventDefault(); e.target.textContent = "Checking…";
    try{ const r = await payCall("nk.sync", {kind:"project", id:p.id, key}); toast(r.changed ? "Updated from Nickel" : "Nothing new in Nickel"); render(); }catch(er){ toast(er.message); e.target.textContent = "Check Nickel"; } };
  if(q("charge")) q("charge").onclick = () => { const cust = nkOwner(p.ownerId);
    nkChargeSheet({title:`Charge ${nk.number || "invoice " + inv.no}`, dueC:nk.outstandingC != null ? nk.outstandingC : inv.totalC, onFile:cust.onFile || [],
      run:m => nkRun("project.charge", {propertyId:p.id, unitId:unit.id, no:inv.no, methodId:m.id}, `Charge ${nk.number || "invoice " + inv.no} to ${m.label}`)}); };
  if(q("record")) q("record").onclick = async () => {
    try{ const r = await nkRun("project.record", {propertyId:p.id, unitId:unit.id, no:inv.no}, `Mark ${nk.number || "invoice " + inv.no} paid in Nickel`); if(r.ok) toast("Marked paid in Nickel — QuickBooks follows"); render(); }catch(e){ toast(e.message); } };
  if(q("del")) q("del").onclick = async () => {
    if(!confirm(`Delete ${nk.number || "invoice " + inv.no} in Nickel?\n\nIts pay link stops working and Nickel removes it from QuickBooks. The invoice stays here, so you can create it again.`)) return;
    try{ const r = await nkRun("project.delete", {propertyId:p.id, unitId:unit.id, no:inv.no}, `Delete ${nk.number || "invoice " + inv.no} in Nickel`); if(r.ok) toast("Deleted in Nickel — you can create it again"); render(); }catch(e){ toast(e.message); } };
  if(q("forget")) q("forget").onclick = e => { e.preventDefault();
    snapshot(); const g = P().register[key]; if(g){ if(g.link === nk.url) delete g.link; g.nickelOld = Object.assign({}, g.nickel, {deleted:g.nickel.deleted || new Date().toISOString()}); delete g.nickel; } commit(); render(); };
  return box;
}
// invoices made by hand in Nickel before the console (e.g. 3282HARTWELL-001…005): link them by number,
// so their paid status, pay link and receipts show here. Read-only in Nickel; once a day per property.
const PJ_LINKED = {};
function pjAutoLink(p){
  if(!payOnline() || !nickelOn() || PJ_LINKED[p.id] === todayISO()) return;
  const C = ALL[p.id]; if(!C) return;
  const items = [];
  p.units.forEach(u => (C.units[u.id] || []).forEach(inv => { const g = (p.register || {})[pjKey(u, inv)] || {}; if(!(g.nickel && g.nickel.invoiceId) && (inv.locked || g.dateSent || g.paid)) items.push({unitId:u.id, no:inv.no, number:pjInvNumber(p, u, inv)}); }));
  PJ_LINKED[p.id] = todayISO();
  // and bring in the latest from Nickel for this property's open invoices
  if(Object.values(p.register || {}).some(g => g && g.nickel && g.nickel.invoiceId && !(g.paid && g.nickel.done)))
    payCall("nk.sync", {kind:"project", id:p.id}, {noSave:true}).catch(() => {});
  if(!items.length) return;
  payCall("nk.linkProject", {propertyId:p.id, items}, {noSave:true}).then(r => { if(r.linked){ toast(`${r.linked} invoice${r.linked === 1 ? "" : "s"} matched to Nickel`); render(); } }).catch(() => {});
}
// a project expense PHD paid through Nickel: the receipt, on the transaction row
function nkTxnChip(t){
  const n = t.nickelPay; if(!n || !n.id || n.dismissed) return "";
  return ` · <span class="nk-chip" title="Paid to ${esc(n.to || "the vendor")} through Nickel${n.bill ? " (bill " + esc(n.bill) + ")" : ""}">${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener" data-nos>Paid in Nickel ${esc(n.date ? fdateS(n.date) : "")}</a>` : `Paid in Nickel ${esc(n.date ? fdateS(n.date) : "")}`}<button type="button" data-nkun="${esc(t.id)}" title="Not this payment">×</button></span>`;
}
document.addEventListener("click", e => {
  if(e.target.closest && e.target.closest(".nk-chip a")){ e.stopPropagation(); return; }   // open the receipt, not the transaction
  const b = e.target.closest && e.target.closest("[data-nkun]"); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  const t = (P().transactions || []).find(x => x.id === b.dataset.nkun); if(!t || !t.nickelPay) return;
  snapshot(); t.nickelPay = {id:t.nickelPay.id, dismissed:true}; if(t.linkFromNickel){ t.link = ""; delete t.linkFromNickel; } commit(); toast("Unlinked from that Nickel payment", true); render();
}, true);
async function pjCreateSheet(p, unit, inv){
  await pjLoadLists();
  const o = ownerRec(p), sh = $("#sheet"), why = pjQbWhy(p, inv), linked = !!nkOwner(p.ownerId).id;
  const due = PMCore.isoOf(PMCore.dayNum(todayISO()) + 15);
  sh.innerHTML = `<div class="sheet-h"><div><h3>Invoice ${inv.no} → QuickBooks</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(p.name)}${esc(pjUnitLabel(p, unit))} · ${usd(inv.totalC)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      ${!o ? `<div class="pm-banner">This property has no owner. Set one on the Owner page first.</div>` : !o.email ? `<div class="pm-banner">${esc(ownerLabel(o))} has no email. Add it on the Owner page first.</div>` : ""}
      <div class="ps-kv"><span>Bill to</span><b id="pjCust">${esc(o ? ownerLabel(o) : "—")}${o && o.email ? ` · ${esc(o.email)}` : ""} <span class="muted">· checking Nickel…</span></b></div>
      <div class="ps-kv"><span>Amount</span><b>${usd(inv.totalC)} <span class="muted">(${usd(inv.expC)} expenses + ${usd(inv.feeC)} fee)</span></b></div>
      <div class="f2" style="margin-top:12px"><label class="fld"><span>Invoice number in QuickBooks</span><input type="text" id="pjNo" maxlength="21" value="${esc(pjInvNumber(p, unit, inv))}"></label>
        <label class="fld"><span>Due</span><input type="date" id="pjDue" value="${due}"></label></div>
      ${why ? `<div class="pm-banner">Can't add it to QuickBooks yet: ${esc(why)}.</div><label class="ps-chk"><input type="checkbox" id="pjNkOnly"> Create it in Nickel only (pay link, no QuickBooks)</label>` : ""}
      <div class="nk-how"><b>What happens when you press Create</b><ol>${linked ? "" : `<li>Nickel asks you to confirm adding ${esc(o ? ownerLabel(o) : "the owner")} as a customer (first time only).</li>`}
        <li>Nickel shows the invoice: ${usd(inv.totalC)}, ${inv.lines.length} line${inv.lines.length === 1 ? "" : "s"} + the fee. Confirm once and it's created${why ? "" : " in Nickel and QuickBooks"}.</li>
        <li>The pay link appears on this invoice, ready to copy. It's also printed on the invoice PDF.</li></ol></div>
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="pjGo" ${!o || !o.email ? "disabled" : ""}>Create</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  // the Nickel customer it will bill: the one this property's earlier invoices went to, else the owner's match
  let cust = null;
  const showCust = async () => {
    const box = $("#pjCust"); if(!box) return;
    try{
      const r = await payCall("nk.projCustomer", {propertyId:p.id, invoiceNumber:$("#pjNo").value}, {noSave:true}); cust = (r && r.customer) || {};
      if(!$("#pjCust")) return;
      box.innerHTML = cust.id ? `${esc(cust.name || "Customer in Nickel")} <span class="muted">· ${cust.from ? `same Nickel customer as ${esc(cust.from)}` : "matched by email"}</span>`
        : `${esc(o ? ownerLabel(o) : "—")} <span class="muted">· not in Nickel yet (you'll confirm adding them)</span>`;
    }catch(e){ cust = null; box.innerHTML = `${esc(o ? ownerLabel(o) : "—")} <span class="muted">· couldn't check Nickel</span>`; }
  };
  showCust(); $("#pjNo").onchange = showCust;
  $("#pjGo").onclick = async () => {
    const nkOnly = !!($("#pjNkOnly") && $("#pjNkOnly").checked);
    if(why && !nkOnly) return toast("Fix the QuickBooks setting first, or tick “Nickel only”");
    const go2 = $("#pjGo"); go2.disabled = true;
    try{
      await payCall("nk.match", {}, {raw:true}).catch(() => {});
      if(!(cust && cust.id) && !nkOwner(p.ownerId).id){ const r = await nkRun("owner.create", {ownerId:p.ownerId}, `Add ${ownerLabel(o)} to Nickel`); if(!r.ok && !r.already){ go2.disabled = false; return; } }
      const r = await nkRun("project.invoice", {propertyId:p.id, unitId:unit.id, no:inv.no, invoiceNumber:$("#pjNo").value, dueDate:$("#pjDue").value, requireQb:!nkOnly, lines:pjLineWords(p, unit, inv), feeItem:pjFeeItem(p)}, `${p.name}${pjUnitLabel(p, unit)} · Invoice ${inv.no} · ${usd(inv.totalC)}`);
      if(!r.ok && !r.already){ go2.disabled = false; if(r.error && !r.declined && !r.approvalUrl) toast(r.error); return; }
      closeSheet(); render();
      if(r.url){ try{ await navigator.clipboard.writeText(r.url); toast(`Invoice ${inv.no} created${r.qb ? " in QuickBooks" : ""} · pay link copied`); }catch(e){ toast(`Invoice ${inv.no} created${r.qb ? " in QuickBooks" : ""}`); } }
      else toast(`Invoice ${inv.no} created`);
    }catch(e){ go2.disabled = false; toast(e.message); }
  };
}
function pjSendSheet(p, unit, inv){
  const o = ownerRec(p), sh = $("#sheet");
  const emails = [o && o.email].concat(String((o && o.cc) || "").split(/[,;\s]+/)).filter(e => e && /@/.test(e));
  sh.innerHTML = `<div class="sheet-h"><div><h3>${inv.reg && inv.reg.nickel && inv.reg.nickel.sentTo ? "Email again" : "Email"} invoice ${inv.no}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(p.name)}${esc(pjUnitLabel(p, unit))} · ${usd(inv.totalC)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="muted" style="margin-top:0;font-size:13px">Nickel emails the owner its invoice with the pay link. The invoice is marked sent here. You'll confirm it in the Nickel window.</p>
      <label class="fld"><span>Email to</span><input type="text" id="pjTo" value="${esc(emails.join(", "))}"></label></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="pjSend">Email it</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  $("#pjSend").onclick = async () => {
    const to = $("#pjTo").value.split(/[,;\s]+/).filter(e => /@/.test(e)); if(!to.length) return toast("Add an email");
    try{ const r = await nkRun("project.send", {propertyId:p.id, unitId:unit.id, no:inv.no, emails:to}, `Email invoice ${inv.no} to ${to.join(", ")}`); if(r.ok){ closeSheet(); render(); toast(`Invoice ${inv.no} emailed from Nickel`); } }
    catch(e){ toast(e.message); }
  };
}
// add the panel to each open invoice on the project side
(function(){
  const base = invoiceBlock;
  invoiceBlock = function(inv, unit, p){
    const w = base(inv, unit, p), acts = w.querySelector(".inv-acts");
    if(acts && payOnline()){ acts.parentNode.insertBefore(pjNickelPanel(p, unit, inv), acts); payStatusThenRedraw(S.ui.view); setTimeout(() => pjAutoLink(p), 0); }
    // once it's in Nickel/QuickBooks, unlocking would let its lines change: say so first
    if(inv.reg && inv.reg.nickel && inv.reg.nickel.invoiceId){
      const warn = () => confirm(`Invoice ${inv.no} is already in Nickel${inv.reg.nickel.qb ? " and QuickBooks" : ""} for ${usd(inv.totalC)}.\n\nIf you unlock it and its lines change, update or void it there too. Continue?`);
      const lb = w.querySelector('[data-x="lock"]'); if(lb){ const orig = lb.onchange; lb.onchange = e => { if(!lb.checked && !warn()){ lb.checked = true; return; } if(orig) orig(e); }; }
      const ub = w.querySelector('[data-x="unlock"]'); if(ub){ const orig = ub.onclick; ub.onclick = e => { if(!warn()) return; if(orig) orig(e); }; }
    }
    return w;
  };
})();

/* ---------- a project expense → pay the vendor through Nickel ---------- */
const nkVendorList = () => ((S.nk || {}).nickelVendors || []);
function nkGuessVendor(name){
  const k = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if(k.length < 3) return null;
  const L = nkVendorList(), key = v => String(v.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return L.find(v => key(v) === k) || L.find(v => key(v).startsWith(k) || k.startsWith(key(v)) && key(v).length > 3) || null;
}
function pjTxnNickelBlock(p, t){
  const box = elm("div", "pj-txnk"), nb = t.nickelBill || {}, np = t.nickelPay && !t.nickelPay.dismissed ? t.nickelPay : null;
  if(np){
    box.innerHTML = `<div class="sectl">Nickel</div><div class="bl-rc"><span class="tag ${/DEPOSITED/.test(np.status || "") ? "green" : /FAIL|RETURN/.test(np.status || "") ? "red" : "acc"}">${/DEPOSITED/.test(np.status || "") ? "Deposited" : /FAIL|RETURN/.test(np.status || "") ? "Didn't go through" : "Paid · on the way"}</span>
      <span class="muted">${esc(np.to || "")}${np.date ? " · " + esc(fdateS(np.date)) : ""}</span>${np.url ? `<a class="btn sm" href="${esc(np.url)}" target="_blank" rel="noopener">${icon("file")} Payment receipt</a>` : ""}${np.link ? `<a class="btn sm ghost" href="${esc(np.link)}" target="_blank" rel="noopener">Open in Nickel</a>` : ""}</div>`;
    return box;
  }
  if(!(Number(t.amount) > 0)) return null;
  const st = PAY.status && PAY.status.nickel, canPay = !!(st && st.canPay);
  if(nb.billId){
    const nv = nkVendorList().find(v => v.id === nb.vendorId) || {}, ready = (nv.payout || []).length > 0;
    const from = (st && st.payFrom || []).find(x => x.id === (S.acct || {}).nickelPayFrom) || (st && st.payFrom || []).find(x => x.isDefault) || (st && st.payFrom || [])[0];
    box.innerHTML = `<div class="sectl">Nickel</div><p class="help" style="margin-top:0">Bill for ${usd(cents(t.amount))} to <b>${esc(nb.vendor || nv.name || "")}</b> is in Nickel${nb.qb ? " (and QuickBooks)" : ""}, not paid yet.${nb.failed ? ` The last try didn't go through: ${esc(nb.failed)}.` : ""}</p>
      ${!ready ? `<div class="pm-banner">${esc(nv.name || "The vendor")} has no bank account or check address in Nickel yet. Add it in Nickel, then pay here.</div>`
        : !canPay ? `<p class="help">Only people on the payments list can send money.</p>`
        : `<div class="f2"><label class="fld"><span>Pay from</span><select id="txFrom">${(st.payFrom || []).map(x => `<option value="${esc(x.id)}" ${from && x.id === from.id ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
            <label class="fld"><span>Arrive by (blank = now)</span><input type="date" id="txArr"></label></div>
          <div class="bl-pay"><button class="btn primary" id="txPay">Pay ${usd(cents(t.amount))} · ${esc(nv.payout[0].label)}</button></div>`}`;
    const b = box.querySelector("#txPay"); if(b) b.onclick = async () => {
      b.disabled = true;
      try{ const r = await nkRun("txn.pay", {propertyId:p.id, txnId:t.id, payFrom:box.querySelector("#txFrom").value, arrivalDate:box.querySelector("#txArr").value}, `Pay ${nv.name} ${usd(cents(t.amount))} · ${p.name}`);
        if(r.ok){ toast("Paid through Nickel — the receipt is on the transaction"); closeSheet(); render(); } else b.disabled = false; }catch(e){ toast(e.message); b.disabled = false; } };
    return box;
  }
  const g = nkGuessVendor(t.vendor);
  box.innerHTML = `<div class="sectl">Pay through Nickel</div>
    <p class="help" style="margin-top:0">Adds this expense to Nickel as a bill${(S.acct || {}).nkProjBillExp && nkQbOn() ? " (Nickel puts it in QuickBooks)" : ""}, then pays the vendor. Two confirmations in the Nickel window. Already paid another way? Skip this.</p>
    <div class="f2"><label class="fld"><span>Vendor in Nickel</span><input type="text" id="txV" list="txVl" value="${esc(g ? g.name : "")}" placeholder="Start typing…"><datalist id="txVl">${nkVendorList().slice(0, 900).map(v => `<option value="${esc(v.name)}">`).join("")}</datalist></label>
      <label class="fld"><span>Due</span><input type="date" id="txDue" value="${todayISO()}"></label></div>
    <div class="help" id="txVinfo"></div>
    <div class="bl-pay"><button class="btn" id="txBill">Add to Nickel</button></div>`;
  const vi = box.querySelector("#txV"), info = box.querySelector("#txVinfo");
  const pick = () => nkVendorList().find(v => v.name.toLowerCase() === vi.value.trim().toLowerCase());
  const show = () => { const v = pick(); info.innerHTML = v ? ((v.payout || []).length ? `Pays by ${esc(v.payout[0].label)}` : `No bank details in Nickel yet — you can add the bill now and pay once they're in.`) : vi.value ? "Not a vendor in Nickel — pick one from the list (add new vendors on the Vendors page)." : ""; };
  vi.oninput = show; show();
  box.querySelector("#txBill").onclick = async e => {
    const v = pick(); if(!v) return toast("Pick the vendor from Nickel's list");
    e.target.disabled = true;
    try{ const r = await nkRun("txn.bill", {propertyId:p.id, txnId:t.id, nickelVendorId:v.id, dueDate:box.querySelector("#txDue").value}, `Add the ${v.name} bill (${usd(cents(t.amount))}) to Nickel`);
      if(r.ok){ toast("Bill added in Nickel"); openSheet(t.id); } else e.target.disabled = false; }catch(er){ toast(er.message); e.target.disabled = false; } };
  return box;
}
/* ---------- has the vendor been paid? (project expenses) ----------
   A project expense can be marked "vendor not paid yet" (from the receipt inbox, or here). It stays on
   Today, the weekly unpaid-bills email and this banner until it's paid through Nickel or marked paid. */
const pjVendorOpen = t => !!(t && t.vendorDue && !t.vendorPaid && !(t.nickelPay && !t.nickelPay.dismissed));
function pjVendorDueBlock(p, t){
  const box = elm("div", "pj-vdue"), live = () => (P().transactions || []).find(x => x.id === t.id);
  const reopen = () => { closeSheet(); render(); setTimeout(() => openSheet(t.id), 30); };
  if(pjVendorOpen(t)){
    const v = t.vendorDue, late = v.due && v.due < todayISO();
    box.innerHTML = `<div class="pm-banner ${late ? "late" : ""}"><b>${esc(t.vendor || "The vendor")} hasn't been paid yet</b>${v.due ? ` · due ${esc(fdateS(v.due))}${late ? " (past due)" : ""}` : ""}${v.note ? ` · <i>${esc(v.note)}</i>` : ""}
      <span class="pj-vdue-a"><button type="button" class="btn sm primary" data-vp>Mark vendor paid</button><button type="button" class="btn sm ghost" data-vx>Not owed</button></span></div>`;
    box.querySelector("[data-vp]").onclick = () => { const x = live(); if(!x) return; snapshot(); x.vendorPaid = {date:todayISO(), by:billWho()}; commit(); toast(`${x.vendor || "Vendor"} marked paid`); reopen(); };
    box.querySelector("[data-vx]").onclick = () => { const x = live(); if(!x) return; snapshot(); delete x.vendorDue; commit(); toast("Taken off the unpaid list"); reopen(); };
  } else if(!t.vendorPaid && !(t.nickelPay && !t.nickelPay.dismissed)){
    box.innerHTML = `<a href="#" class="pj-vdue-add">Vendor not paid yet? Keep it on the unpaid list</a>`;
    box.querySelector("a").onclick = e => { e.preventDefault(); const x = live(); if(!x) return; snapshot(); x.vendorDue = {since:todayISO(), due:"", note:"", by:billWho()}; delete x.vendorPaid; commit(); reopen(); };
  } else if(t.vendorPaid){
    box.innerHTML = `<p class="help" style="margin:0 0 10px">Vendor paid ${esc(fdateS(t.vendorPaid.date))}${t.vendorPaid.by ? " · " + esc(cloudWhoSafe(t.vendorPaid.by)) : ""} · <a href="#" data-vu>undo</a></p>`;
    box.querySelector("[data-vu]").onclick = e => { e.preventDefault(); const x = live(); if(!x) return; snapshot(); delete x.vendorPaid; commit(); reopen(); };
  }
  return box;
}
(function(){
  const base = openSheet;
  openSheet = function(id, preset){
    base(id, preset);
    if(id){ const p0 = P(), t0 = (p0.transactions || []).find(x => x.id === id), b0 = document.querySelector("#sheet .sheet-b"); if(t0 && b0 && Number(t0.amount) > 0) b0.insertBefore(pjVendorDueBlock(p0, t0), b0.firstChild); }
    if(!id || !payOnline()) return;
    const p = P(), t = (p.transactions || []).find(x => x.id === id), b = document.querySelector("#sheet .sheet-b");
    if(!t || !b) return;
    if(!PAY.status){ payStatus().then(() => { if(document.querySelector("#sheet .sheet-b") === b && !b.querySelector(".pj-txnk") && nickelOn()){ const x = pjTxnNickelBlock(p, t); if(x) b.appendChild(x); } }).catch(() => {}); return; }
    if(!nickelOn()) return;
    const x = pjTxnNickelBlock(p, t); if(x) b.appendChild(x);
  };
})();

/* =====================================================================
   PROJECT INVOICE EMAILS — from billing@phdproperties.realestate.
   The console writes the email the way the office sends them ("Hi Ken, …
   Here is the project invoice link for 3108 Terry Dr: 3108TERRY-002"),
   you read and edit it here, then it's sent from billing@'s Gmail by a
   small Google script installed in that account (apps-script/
   ProjectInvoices.gs), or saved there as a draft. Nothing is sent until
   you press Send.
   ===================================================================== */
const BM_KEY = "phd-billmail-conn";
const BM_DEFAULT = {
  subject: "{address}{unit} - Invoice #{no}",
  body: `Hi {first},

I hope you're doing well!

Here is the project invoice link for {property}{unit}:
{link}

Please let me know if you have any questions regarding the invoices or payment.

Sincerely,`
};
function bmConn(){
  if(typeof Cloud !== "undefined" && Cloud.ready){ const v = S.billMail; return v && v.url && v.token ? v : null; }
  try{ const v = JSON.parse(localStorage.getItem(BM_KEY) || "null"); if(v && v.url && v.token) return v; }catch(e){}
  return null;
}
function bmSave(patch){
  const next = Object.assign({}, S.billMail || {}, patch);
  if(typeof Cloud !== "undefined" && Cloud.ready){ snapshot(); S.billMail = next; commit(); return; }
  S.billMail = next; try{ localStorage.setItem(BM_KEY, JSON.stringify(next)); }catch(e){}
}
async function bmCall(body, get){
  const c = bmConn(); if(!c) throw new Error("Connect billing@ first");
  const r = get ? await fetch(c.url + (c.url.includes("?") ? "&" : "?") + new URLSearchParams(Object.assign({token:c.token}, body)).toString(), {redirect:"follow"})
                : await fetch(c.url, {method:"POST", redirect:"follow", body:JSON.stringify(Object.assign({token:c.token}, body))});
  let j; try{ j = await r.json(); }catch(e){ throw new Error("The billing@ script didn't answer — check the web app URL and that it's deployed with access for Anyone"); }
  if(!j.ok) throw new Error(j.error === "unauthorized" ? "The billing@ key wasn't accepted — paste it again from the script's log" : (j.error || "billing@ script error"));
  return j;
}
const BM_ABBR = /\b(st|dr|rd|ave|ln|blvd|ct|pl|cir|hwy|pkwy|ter|trl)$/i;
// what the template's {words} become for one invoice
function bmFields(p, unit, inv){
  const o = ownerRec(p), reg = inv.reg || {}, nk = reg.nickel || {};
  const name = String(p.name || "").trim();
  return {
    first: (o && typeof stmtFirstName === "function" && stmtFirstName(o)) || "there",
    property: name,
    address: BM_ABBR.test(name) ? name + "." : name,
    unit: p.units.length > 1 ? ` - ${unit.name}` : "",
    no: String(inv.no),
    number: nk.number || (typeof pjInvNumber === "function" ? pjInvNumber(p, unit, inv) : `Invoice ${inv.no}`),
    url: (nk.url && !nk.canceled) ? nk.url : (reg.link || ""),
    amount: usd(inv.totalC)
  };
}
const bmFill = (tpl, f) => String(tpl || "").replace(/\{(first|property|address|unit|no|number|amount)\}/g, (_, k) => f[k] || "");
// the body as an email: paragraphs, and {link} as the invoice number linked to the pay link
function bmHTML(body, f){
  const linkHtml = f.url ? `<a href="${esc(f.url)}">${esc(f.number)}</a>` : esc(f.number);
  return bmFill(body, f).split(/\n{2,}/).map(par => `<p style="margin:0 0 14px">${par.split("{link}").map(x => esc(x).replace(/\n/g, "<br>")).join(linkHtml)}</p>`).join("");
}
const bmText = (body, f) => bmFill(body, f).replace(/\{link\}/g, f.url ? `${f.number} (${f.url})` : f.number);

function pjEmailSheet(p, unit, inv){
  const sh = $("#sheet"), o = ownerRec(p), f = bmFields(p, unit, inv), reg = inv.reg || {}, c = bmConn(), tpl = Object.assign({}, BM_DEFAULT, (S.billMail || {}).template || {});
  const to = o ? [o.email].filter(Boolean).join(", ") : "", cc = o ? String(o.cc || "").split(/[,;\s]+/).filter(e => /@/.test(e)).join(", ") : "";
  const sig = c && c.signature, prior = reg.email;
  sh.innerHTML = `<div class="sheet-h"><div><h3>Email invoice ${esc(f.no)} to the owner</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(p.name)}${esc(f.unit)} · ${usd(inv.totalC)} · from ${esc((c && c.mailbox) || "billing@phdproperties.realestate")}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      ${!c ? `<div class="sm-setup"><b>Connect billing@ (once for the office)</b>
          <p class="help" style="margin:6px 0 10px">In the billing@phdproperties.realestate Google account, install <code>apps-script/ProjectInvoices.gs</code> (steps at the top of the file), deploy it as a web app, then paste its URL and the key from its log.</p>
          <label class="fld"><span>Web app URL</span><input type="text" id="bmUrl" placeholder="https://script.google.com/macros/s/…/exec"></label>
          <label class="fld"><span>Console key</span><input type="password" id="bmTok" autocomplete="off"></label>
          <button class="btn primary sm" id="bmConn" type="button">Connect</button> <span id="bmMsg" class="muted" style="font-size:12.5px;margin-left:8px"></span></div>` : ""}
      ${prior ? `<div class="pm-banner" style="background:var(--panel-2)">${prior.sent ? "Emailed" : "Draft saved in Gmail"} ${esc(fdateS(String(prior.at).slice(0, 10)))} to ${esc(prior.to)}${prior.by ? " by " + esc(typeof cloudWhoSafe === "function" ? cloudWhoSafe(prior.by) : prior.by) : ""}.</div>` : ""}
      ${!f.url ? `<div class="pm-banner">This invoice has no pay link yet. Create it in QuickBooks + Nickel first, or paste the invoice link on the invoice.</div>` : ""}
      <div class="f2"><label class="fld"><span>To</span><input type="text" id="bmTo" value="${esc(to)}"></label><label class="fld"><span>Cc</span><input type="text" id="bmCc" value="${esc(cc)}"></label></div>
      <label class="fld"><span>Subject</span><input type="text" id="bmSub" value="${esc(bmFill(tpl.subject, f))}"></label>
      <label class="fld"><span>Message <span class="muted" style="font-weight:400">· <code>{link}</code> is the invoice number, linked to the pay link</span></span><textarea id="bmBody" rows="10">${esc(bmFill(tpl.body, f))}</textarea></label>
      <div class="bm-prev-h"><b>Preview</b><span class="muted">what ${esc(f.first === "there" ? "the owner" : f.first)} will see</span></div>
      <div class="bm-prev" id="bmPrev"></div>
      <label class="ps-chk"><input type="checkbox" id="bmPdf"> Attach the invoice PDF</label>
      <label class="ps-chk"><input type="checkbox" id="bmTpl"> Use this subject and message for future invoice emails</label>
      ${c ? `<p class="help">Sent from ${esc(c.mailbox || "billing@")} as “${esc(c.fromName || "PHD Billing")}”${sig ? ", with billing@'s Gmail signature" : ". No Gmail signature was found — add the Gmail API service in the script to include it"}. <a href="#" id="bmDisc">Change connection</a></p>` : ""}
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn" id="bmDraft" ${c ? "" : "disabled"}>Save as Gmail draft</button><button class="btn primary" id="bmSend" ${c ? "" : "disabled"}>Send from billing@</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  const body = $("#bmBody"), sub = $("#bmSub"), prev = $("#bmPrev");
  // the subject/body as typed keep their filled-in words; {link} stays a token so the link is always right
  const draw = () => { prev.innerHTML = `<div class="bm-sub">${esc(sub.value)}</div><div class="bm-from">${esc((c && c.fromName) || "PHD Billing")} &lt;${esc((c && c.mailbox) || "billing@phdproperties.realestate")}&gt; · to ${esc($("#bmTo").value)}</div><div class="bm-body">${bmHTML(body.value, f)}${sig ? `<div class="bm-sig">${sig}</div>` : ""}</div>`;
    prev.querySelectorAll("a").forEach(a => { a.target = "_blank"; a.rel = "noopener"; }); };
  [body, sub, $("#bmTo")].forEach(x => x.oninput = draw); draw();
  const cn = $("#bmConn"); if(cn) cn.onclick = async () => {
    const url = $("#bmUrl").value.trim(), token = $("#bmTok").value.trim(), msg = $("#bmMsg");
    if(!/^https:\/\/script\.google\.com\/macros\//.test(url)) return msg.textContent = "Paste the web app URL (it starts with https://script.google.com/macros/)";
    if(token.length < 20) return msg.textContent = "Paste the key from the script's log";
    msg.textContent = "Checking…";
    const prevConn = S.billMail; S.billMail = Object.assign({}, S.billMail || {}, {url, token});
    try{ const j = await bmCall({action:"ping"}, true); S.billMail = prevConn; bmSave({url, token, mailbox:j.mailbox || "", fromName:j.fromName || "", signature:j.signature || ""}); toast(`Connected — emails go out from ${j.mailbox}`); pjEmailSheet(p, unit, inv); }
    catch(e){ S.billMail = prevConn; msg.textContent = e.message; }
  };
  const dc = $("#bmDisc"); if(dc) dc.onclick = e => { e.preventDefault(); if(confirm("Disconnect billing@? You can paste a new URL and key afterwards.")){ bmSave({url:"", token:""}); pjEmailSheet(p, unit, inv); } };
  const go = async send => {
    const to = $("#bmTo").value.split(/[,;\s]+/).filter(e => /@/.test(e)), ccs = $("#bmCc").value.split(/[,;\s]+/).filter(e => /@/.test(e));
    if(!to.length) return toast("Add the owner's email");
    if(send && !f.url && !confirm("This invoice has no pay link. Send it anyway?")) return;
    if(send && !confirm(`Send this email to ${to.join(", ")} from ${(c && c.mailbox) || "billing@"} now?`)) return;
    const btn = send ? $("#bmSend") : $("#bmDraft"); btn.disabled = true; btn.textContent = send ? "Sending…" : "Saving…";
    try{
      if($("#bmTpl").checked) bmSave({template:{subject:bmUnfill(sub.value, f), body:bmUnfill(body.value, f)}});
      // a fresh signature each time (picks up changes made in Gmail)
      const req = {action:send ? "send" : "draft", to:to.join(","), cc:ccs.join(","), subject:sub.value, html:bmHTML(body.value, f), text:bmText(body.value, f)};
      if($("#bmPdf").checked){ req.pdfHtml = invoiceDocHTML(p, unit, inv); req.fileName = `${f.number} - ${p.name}${f.unit}`; }
      const r = await bmCall(req);
      snapshot(); const g = P().register[pjKey(unit, inv)] = P().register[pjKey(unit, inv)] || {};
      g.email = {sent:!!r.sent, drafted:!!r.drafted, to:to.join(", "), subject:sub.value, at:r.at || new Date().toISOString(), by:billWho(), threadId:r.threadId || "", from:r.from || ""};
      if(r.sent && !g.dateSent) g.dateSent = todayISO();
      commit(); closeSheet();
      toast(r.sent ? `Emailed to ${to.join(", ")} from ${r.from || "billing@"}` : `Draft saved in ${r.from || "billing@"}'s Gmail`); render();
    }catch(e){ toast(e.message); btn.disabled = false; btn.textContent = send ? "Send from billing@" : "Save as Gmail draft"; }
  };
  $("#bmSend").onclick = () => go(true);
  $("#bmDraft").onclick = () => go(false);
}
// turn a typed message back into a template (so the next invoice gets its own name, number and link)
function bmUnfill(text, f){
  let t = String(text);
  const rx = v => new RegExp("(^|[^A-Za-z0-9])" + v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9])", "g");
  [["number", f.number], ["address", f.address], ["property", f.property], ["first", f.first !== "there" ? f.first : ""]].forEach(([k, v]) => { if(v && v.length > 1) t = t.replace(rx(v), (m, pre) => pre + `{${k}}`); });
  if(f.unit) t = t.split(f.unit).join("{unit}");
  return t.replace(/Invoice #\d+/g, "Invoice #{no}");
}
// did a saved draft get sent from Gmail? (checked when the invoice is opened)
const BM_CHECKED = {};
function bmCheckDraft(p, unit, inv){
  const g = (inv.reg || {}).email; if(!g || g.sent || !g.threadId || !bmConn() || BM_CHECKED[g.threadId]) return;
  BM_CHECKED[g.threadId] = true;
  bmCall({action:"status", items:[{id:"x", threadId:g.threadId}]}).then(r => {
    const s = (r.results || [])[0] || {}; if(s.state !== "sent" && s.state !== "deleted") return;
    snapshot(); const x = P().register[pjKey(unit, inv)]; if(!x || !x.email) return;
    if(s.state === "sent"){ x.email.sent = true; x.email.drafted = false; x.email.at = s.at || x.email.at; if(!x.dateSent) x.dateSent = String(s.at || todayISO()).slice(0, 10); }
    else delete x.email;
    commit(); render();
  }).catch(() => {});
}

/* =====================================================================
   BACK-CHARGES — project expenses someone other than the owner pays.
   A transaction can be billed to a contractor or vendor instead of the
   owner (a countertop trip they caused, a damaged item, a redo). It stays
   off the owner's invoices (status "excluded") and carries t.charge:
     {party, email, how: "invoice" | "deduct", note,
      state: "open" | "invoiced" | "settled", invNo, invoicedAt,
      settled: {date, method, note, by}}
   The Back-charges page collects them by contractor across all
   properties: send them an invoice from billing@, or take it out of
   what PHD pays them, and mark each one settled.
   ===================================================================== */
const CH_HOW = {invoice:"Send them an invoice", deduct:"Take it out of what we pay them"};
const CH_SETTLE = ["Paid by check", "Paid by ACH / Zelle", "Deducted from their payment", "Written off"];
const chOpen = t => !!(t && t.charge && t.charge.state !== "settled");
function chAll(){
  const out = [];
  live().forEach(p => (p.transactions || []).forEach(t => { if(t.charge) out.push({p, t}); }));
  return out;
}
const chOpenCount = () => chAll().filter(x => chOpen(x.t)).length;
function chParties(){
  const m = new Map();
  chAll().forEach(({t}) => { const k = t.charge.party.trim().toLowerCase(); if(k && !m.has(k)) m.set(k, {name:t.charge.party, email:t.charge.email || ""}); else if(k && t.charge.email && !m.get(k).email) m.get(k).email = t.charge.email; });
  live().forEach(p => (p.transactions || []).forEach(t => { const k = String(t.vendor || "").trim().toLowerCase(); if(k && !m.has(k)) m.set(k, {name:t.vendor.trim(), email:""}); }));
  (typeof pmVendors === "function" ? pmVendors() : []).forEach(v => { const k = String(v.name || "").trim().toLowerCase(); if(!k) return; if(!m.has(k)) m.set(k, {name:v.name, email:v.email || ""}); else if(v.email && !m.get(k).email) m.get(k).email = v.email; });
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const chFind = name => chParties().find(x => x.name.toLowerCase() === String(name || "").trim().toLowerCase());
function chTagHTML(t){
  const c = t.charge, st = c.state === "settled" ? ["green", `Settled${c.settled && c.settled.date ? " " + fdateS(c.settled.date) : ""}`] : c.state === "invoiced" ? ["acc", `Invoiced${c.invNo ? " " + c.invNo : ""}`] : ["gold", "To charge"];
  return `<span class="tag ${st[0]}" title="${esc(CH_HOW[c.how] || "")}">${esc(st[1])}</span><div class="ch-who">→ ${esc(c.party || "contractor")}</div>`;
}

/* ---------- in the transaction sheet ---------- */
function chFields(c){
  c = c || {};
  const ps = chParties();
  return `<div class="ch-box" id="chBox">
      <div class="f2"><label class="fld"><span>Who pays it</span><input type="text" id="chParty" list="chPl" value="${esc(c.party || "")}" placeholder="Contractor or vendor" autocomplete="off"><datalist id="chPl">${ps.map(x => `<option value="${esc(x.name)}">`).join("")}</datalist></label>
        <label class="fld"><span>Their email</span><input type="email" id="chEmail" value="${esc(c.email || "")}" placeholder="for the invoice"></label></div>
      <div class="ch-how">${Object.entries(CH_HOW).map(([k, l]) => `<label class="${(c.how || "invoice") === k ? "on" : ""}"><input type="radio" name="chHow" value="${k}" ${(c.how || "invoice") === k ? "checked" : ""}> ${l}</label>`).join("")}</div>
      <label class="fld"><span>Note for them</span><input type="text" id="chNote" value="${esc(c.note || "")}" placeholder="e.g. Second countertop trip — template was measured wrong"></label>
      <p class="help" style="margin:2px 0 0">Kept off the owner's invoices. It shows on <b>Back-charges</b> until it's settled.</p></div>`;
}
function chWire(root){
  const pi = root.querySelector("#chParty"), em = root.querySelector("#chEmail");
  if(pi) pi.addEventListener("change", () => { const f = chFind(pi.value); if(f && f.email && !em.value) em.value = f.email; });
  root.querySelectorAll("[name=chHow]").forEach(r => r.onchange = () => root.querySelectorAll(".ch-how label").forEach(l => l.classList.toggle("on", l.querySelector("input").checked)));
}
// read by the transaction sheet's Save (patched in build.py)
function chargeFromSheet(t){
  if(!$("#e_status") || $("#e_status").value !== "charge") return undefined;
  const prior = (t && t.charge) || {};
  const party = ($("#chParty") || {}).value || "";
  return Object.assign({state:"open"}, prior, {party:party.trim() || prior.party || "Contractor", email:(($("#chEmail") || {}).value || "").trim(),
    how:(document.querySelector("[name=chHow]:checked") || {}).value || "invoice", note:(($("#chNote") || {}).value || "").trim()});
}
(function(){
  const base = openSheet;
  openSheet = function(id, preset){
    base(id, preset);
    const sel = $("#e_status"); if(!sel) return;
    const t = id ? ((P().transactions || []).find(x => x.id === id) || {}) : {};
    const lab = sel.closest("label");
    lab.insertAdjacentHTML("afterend", chFields(t.charge));
    const box = $("#chBox"); chWire(box);
    const sync = () => { box.style.display = sel.value === "charge" ? "" : "none"; };
    sel.addEventListener("change", sync); sync();
    if(t.charge && t.charge.state !== "open") box.insertAdjacentHTML("afterbegin", `<div class="pm-banner" style="margin-bottom:10px">${t.charge.state === "settled" ? `Settled ${esc(fdateS(t.charge.settled.date))} · ${esc(t.charge.settled.method || "")}` : `Invoiced to ${esc(t.charge.party)}${t.charge.invNo ? " as " + esc(t.charge.invNo) : ""}${t.charge.invoicedAt ? " on " + esc(fdateS(t.charge.invoicedAt)) : ""}`} · <a href="#" id="chGo">Back-charges</a></div>`);
    const g = $("#chGo"); if(g) g.onclick = e => { e.preventDefault(); closeSheet(); go("charges"); };
  };
})();

/* ---------- several at once (bulk action on Transactions) ---------- */
function chBulkSheet(ids){
  const sh = $("#sheet"), p = P(), list = (p.transactions || []).filter(t => ids.includes(t.id));
  const tot = list.reduce((a, t) => a + cents(t.amount), 0);
  sh.innerHTML = `<div class="sheet-h"><h3>Bill ${list.length} to a contractor</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="muted" style="margin-top:0;font-size:13px">${list.map(t => esc(t.desc || t.vendor || "Item")).join(" · ")} — ${usd(tot)}</p>${chFields({})}</div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="chOk">Bill to them</button></div>`;
  chWire(sh); openPanel();
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  $("#chOk").onclick = () => {
    const party = $("#chParty").value.trim(); if(!party) return toast("Who pays it?");
    const c = {state:"open", party, email:$("#chEmail").value.trim(), how:(document.querySelector("[name=chHow]:checked") || {}).value || "invoice", note:$("#chNote").value.trim()};
    snapshot(); P().transactions.forEach(t => { if(ids.includes(t.id)){ t.status = "excluded"; t.party = "Contractor"; t.charge = Object.assign({}, t.charge && t.charge.state !== "open" ? t.charge : {}, c); } });
    S.ui.sel = []; closeSheet(); commit(); toast(`${list.length} billed to ${party}`, true);
  };
}

/* ---------- the Back-charges page ---------- */
function pgCharges(){
  const v = $("#view"), all = chAll(), f = S.ui.chF || "open";
  $("#pgCrumb").textContent = "Projects"; $("#pgTitle").textContent = "Back-charges";
  $("#pgSub").textContent = "Project costs a contractor or vendor pays, not the owner";
  actions([]);
  const open = all.filter(x => chOpen(x.t)), settled = all.filter(x => !chOpen(x.t));
  const sum = l => l.reduce((a, x) => a + cents(x.t.amount), 0);
  const hero = elm("div", "card pf-hero td-hero");
  hero.innerHTML = `<div class="pf-cell"><div class="label">To collect</div><div class="pf-v a">${usd(sum(open))}</div><div class="pf-note">${open.length} charge${open.length === 1 ? "" : "s"} · ${new Set(open.map(x => x.t.charge.party.toLowerCase())).size} contractor${new Set(open.map(x => x.t.charge.party.toLowerCase())).size === 1 ? "" : "s"}</div></div>
    <div class="pf-cell"><div class="label">Invoiced, not settled</div><div class="pf-v">${usd(sum(open.filter(x => x.t.charge.state === "invoiced")))}</div><div class="pf-note">${open.filter(x => x.t.charge.state === "invoiced").length} sent</div></div>
    <div class="pf-cell"><div class="label">Settled</div><div class="pf-v g">${usd(sum(settled))}</div><div class="pf-note">${settled.length} done</div></div>`;
  v.appendChild(hero);
  const bar = elm("div", "sc-bar");
  bar.innerHTML = `<div class="sc-seg">${[["open", "To collect", open.length], ["settled", "Settled", settled.length], ["all", "All", all.length]].map(([k, l, n]) => `<button data-f="${k}" class="${f === k ? "on" : ""}">${l} <span>${n}</span></button>`).join("")}</div>
    <span class="muted" style="font-size:12.5px">To add one: open a transaction → Billing state → <b>Bill to a contractor or vendor</b>, or select several and use the bulk menu.</span>`;
  bar.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ui.chF = b.dataset.f; persistUi(); render(); });
  v.appendChild(bar);
  const list = f === "open" ? open : f === "settled" ? settled : all;
  if(!list.length){ v.appendChild(elm("div", "card", `<div class="empty"><b>${f === "open" ? "Nothing to collect" : "Nothing here yet"}</b><p>Charges billed to a contractor instead of the owner show up here, grouped by who pays.</p></div>`)); return; }
  const groups = new Map();
  list.forEach(x => { const k = x.t.charge.party.trim().toLowerCase(); if(!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
  [...groups.values()].sort((a, b) => sum(b) - sum(a)).forEach(rows => {
    const c0 = rows[0].t.charge, openRows = rows.filter(x => chOpen(x.t)), email = (rows.find(x => x.t.charge.email) || {t:{charge:{}}}).t.charge.email || (chFind(c0.party) || {}).email || "";
    const card = elm("div", "card ch-card");
    card.innerHTML = `<div class="card-h"><h3>${esc(c0.party)}</h3><span class="muted td-n">${email ? esc(email) : "no email on file"}</span>
        <span style="margin-left:auto" class="num"><b>${usd(sum(openRows))}</b>${openRows.length !== rows.length ? ` <span class="muted">open of ${usd(sum(rows))}</span>` : ""}</span></div>
      <table class="tbl"><thead><tr><th>Date</th><th>Property</th><th>Item</th><th>How</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map((x, i) => `<tr data-i="${i}"><td class="nw muted">${esc(fdateS(x.t.date))}</td><td>${esc(x.p.name)}</td><td><div class="item-t">${esc(x.t.desc || "—")}</div><div class="item-s">${esc(x.t.vendor || "")}${x.t.charge.note ? " · " + esc(x.t.charge.note) : ""}</div></td>
          <td class="muted" style="font-size:12.5px">${x.t.charge.how === "deduct" ? "Deduct" : "Invoice"}</td><td class="r num">${usd(cents(x.t.amount))}</td><td>${chTagHTML(x.t).split("<div")[0]}</td>
          <td class="r nw">${chOpen(x.t) ? `<button class="btn sm" data-settle="${i}">Settle</button>` : `<button class="btn sm ghost" data-undo="${i}">Undo</button>`}<button class="btn sm ghost" data-open="${i}">›</button></td></tr>`).join("")}
      </tbody></table>
      ${openRows.length ? `<div class="ch-acts"><button class="btn primary" data-inv>Invoice ${esc(c0.party)} · ${usd(sum(openRows))}</button><button class="btn" data-ded>Deducted from their payment</button><button class="btn ghost" data-pdf>PDF</button></div>` : ""}`;
    v.appendChild(card);
    card.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { const x = rows[+b.dataset.open]; go("txns", x.p.id); setTimeout(() => openSheet(x.t.id), 40); });
    card.querySelectorAll("[data-settle]").forEach(b => b.onclick = () => chSettleSheet([rows[+b.dataset.settle]]));
    card.querySelectorAll("[data-undo]").forEach(b => b.onclick = () => { const x = rows[+b.dataset.undo]; snapshot(); x.t.charge.state = x.t.charge.invNo ? "invoiced" : "open"; delete x.t.charge.settled; commit(); render(); });
    const ib = card.querySelector("[data-inv]"); if(ib) ib.onclick = () => chInvoiceSheet(openRows, email);
    const db = card.querySelector("[data-ded]"); if(db) db.onclick = () => chSettleSheet(openRows, "Deducted from their payment");
    const pb = card.querySelector("[data-pdf]"); if(pb) pb.onclick = () => printDoc(chInvoiceHTML(openRows, chNextNo(c0.party)));
  });
}
function chSettleSheet(rows, method){
  const sh = $("#sheet"), tot = rows.reduce((a, x) => a + cents(x.t.amount), 0);
  sh.innerHTML = `<div class="sheet-h"><h3>Settle ${rows.length === 1 ? "this charge" : rows.length + " charges"} · ${usd(tot)}</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="muted" style="margin-top:0;font-size:13px">${esc(rows[0].t.charge.party)} — ${rows.map(x => esc(x.t.desc || "item")).join(", ")}</p>
      <div class="f2"><label class="fld"><span>How</span><select id="stM">${CH_SETTLE.map(m => `<option ${m === (method || (rows[0].t.charge.how === "deduct" ? "Deducted from their payment" : "Paid by check")) ? "selected" : ""}>${m}</option>`).join("")}</select></label>
        <label class="fld"><span>Date</span><input type="date" id="stD" value="${todayISO()}"></label></div>
      <label class="fld"><span>Note</span><input type="text" id="stN" placeholder="e.g. check #1042, or taken off their Oct 10 payment"></label></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="stOk">Mark settled</button></div>`;
  openPanel(); $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  $("#stOk").onclick = () => {
    snapshot();
    rows.forEach(x => { x.t.charge.state = "settled"; x.t.charge.settled = {date:$("#stD").value || todayISO(), method:$("#stM").value, note:$("#stN").value.trim(), by:billWho()}; });
    closeSheet(); commit(); toast(`${rows.length} charge${rows.length === 1 ? "" : "s"} settled`, true);
  };
}
function chNextNo(party){
  const ini = String(party || "C").replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 3).toUpperCase() || "C";
  const d = todayISO().replace(/-/g, "").slice(2);
  const used = new Set(chAll().map(x => x.t.charge.invNo).filter(Boolean));
  let n = 1; while(used.has(`BC-${ini}-${d}${n > 1 ? "-" + n : ""}`)) n++;
  return `BC-${ini}-${d}${n > 1 ? "-" + n : ""}`;
}
function chInvoiceHTML(rows, no){
  const c0 = rows[0].t.charge, tot = rows.reduce((a, x) => a + cents(x.t.amount), 0), d = iso => iso ? docShort(String(iso).slice(0, 10)) : "";
  const ded = rows.every(x => x.t.charge.how === "deduct");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(no)}</title><style>
  @page{size:letter;margin:0.6in} body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#1A2322;margin:0}
  table{border-collapse:collapse;width:100%} .brand{font-size:9pt;letter-spacing:1.5px;text-transform:uppercase;color:#1D5C57;font-weight:bold}
  h1{font-size:20pt;font-weight:normal;margin:4px 0 0} .hd td{vertical-align:top;padding:0} .rt{text-align:right;font-size:10pt;color:#3A4745}
  .rule{border-top:2px solid #1D5C57;margin:14px 0 16px} .k{font-size:8pt;letter-spacing:1px;text-transform:uppercase;color:#6B7775;margin-bottom:3px}
  .ac th{font-size:8pt;letter-spacing:.8px;text-transform:uppercase;color:#6B7775;text-align:left;border-bottom:1px solid #C9D1CE;padding:6px}
  .ac td{padding:7px 6px;border-bottom:1px solid #ECEFED;vertical-align:top} .r{text-align:right;white-space:nowrap} .m{color:#6B7775;font-size:9.5pt}
  .tot td{border-top:2px solid #1A2322;border-bottom:0;font-weight:bold;font-size:11pt} .ft{margin-top:24px;font-size:9.5pt;color:#3A4745;line-height:1.5}
</style></head><body>
  <table class="hd"><tr><td><div class="brand">PHD Properties</div><h1>Back-charge invoice</h1></td><td class="rt"><b>${esc(no)}</b><br>${docLong(todayISO())}</td></tr></table>
  <div class="rule"></div>
  <table><tr><td style="width:50%;vertical-align:top"><div class="k">Bill to</div><b>${esc(c0.party)}</b>${c0.email ? `<br><span class="m">${esc(c0.email)}</span>` : ""}</td>
    <td style="vertical-align:top"><div class="k">Amount due</div><b style="font-size:16pt">${usd(tot)}</b></td></tr></table>
  <table class="ac" style="margin-top:18px"><thead><tr><th>Date</th><th>Property</th><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td class="m">${d(x.t.date)}</td><td>${esc(x.p.address || x.p.name)}</td><td>${esc(x.t.desc || "")}${x.t.charge.note ? `<br><span class="m">${esc(x.t.charge.note)}</span>` : ""}</td><td class="r">${usd(cents(x.t.amount))}</td></tr>`).join("")}
    <tr class="tot"><td></td><td colspan="2">Total due</td><td class="r">${usd(tot)}</td></tr></tbody></table>
  <div class="ft">${ded ? "This amount will be deducted from your next payment from PHD Properties." : "Please pay PHD Properties, or reply if you'd like it deducted from your next payment."} Questions: billing@phdproperties.realestate</div>
</body></html>`;
}
function chInvoiceSheet(rows, email){
  const c0 = rows[0].t.charge, no = rows.find(x => x.t.charge.invNo) ? rows.find(x => x.t.charge.invNo).t.charge.invNo : chNextNo(c0.party), tot = rows.reduce((a, x) => a + cents(x.t.amount), 0);
  const conn = typeof bmConn === "function" ? bmConn() : null, first = String(c0.party).split(/\s+/)[0];
  const body = `Hi ${first},\n\nAttached is back-charge invoice ${no} for ${usd(tot)}:\n${rows.map(x => `• ${x.t.desc || "Item"} — ${x.p.name} — ${usd(cents(x.t.amount))}`).join("\n")}\n\n${rows.every(x => x.t.charge.how === "deduct") ? "We'll deduct this from your next payment." : "Please send payment to PHD Properties, or let us know if you'd rather we deduct it from your next payment."}\n\nThank you,\nPHD Properties`;
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>Invoice ${esc(c0.party)} · ${usd(tot)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(no)} · from ${esc((conn && conn.mailbox) || "billing@phdproperties.realestate")}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      ${!conn ? `<div class="pm-banner">billing@ isn't connected yet — connect it from any project invoice (Email owner). You can still download the PDF and mark it invoiced.</div>` : ""}
      <label class="fld"><span>To</span><input type="email" id="ciTo" value="${esc(email || "")}" placeholder="their email"></label>
      <label class="fld"><span>Subject</span><input type="text" id="ciSub" value="${esc(`PHD Properties – Back-charge invoice ${no}`)}"></label>
      <label class="fld"><span>Message</span><textarea id="ciBody" rows="11">${esc(body)}</textarea></label>
      <div class="se-att">${icon("file")} <a href="#" id="ciPdf">${esc(no)}.pdf</a><span class="muted">attached</span></div>
    </div>
    <div class="sheet-f"><button class="btn ghost" id="ciMark">Mark invoiced only</button><span style="flex:1"></span><button class="btn" id="ciDraft" ${conn ? "" : "disabled"}>Save as Gmail draft</button><button class="btn primary" id="ciSend" ${conn ? "" : "disabled"}>Send from billing@</button></div>`;
  openPanel(); $("#shClose").onclick = closeSheet;
  $("#ciPdf").onclick = e => { e.preventDefault(); printDoc(chInvoiceHTML(rows, no)); };
  const mark = (to, how) => { snapshot(); rows.forEach(x => { if(x.t.charge.state === "open") x.t.charge.state = "invoiced"; x.t.charge.invNo = no; x.t.charge.invoicedAt = todayISO(); if(to){ x.t.charge.email = to; x.t.charge.sentTo = to; x.t.charge.sentHow = how; } }); commit(); };
  $("#ciMark").onclick = () => { mark($("#ciTo").value.trim(), "manual"); closeSheet(); toast(`${no} marked invoiced`, true); };
  const go2 = async send => {
    const to = $("#ciTo").value.trim(); if(!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) return toast("Add their email");
    if(send && !confirm(`Send ${no} (${usd(tot)}) to ${to} from billing@?`)) return;
    const b = $(send ? "#ciSend" : "#ciDraft"); b.disabled = true; b.textContent = send ? "Sending…" : "Saving…";
    try{
      const txt = $("#ciBody").value;
      await bmCall({action:send ? "send" : "draft", to, subject:$("#ciSub").value, text:txt, html:txt.split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, "<br>")}</p>`).join(""), pdfHtml:chInvoiceHTML(rows, no), fileName:no});
      mark(to, send ? "sent" : "draft"); closeSheet(); toast(send ? `${no} sent to ${to}` : "Draft saved in billing@'s Gmail", true);
    }catch(e){ toast(e.message); b.disabled = false; b.textContent = send ? "Send from billing@" : "Save as Gmail draft"; }
  };
  $("#ciSend").onclick = () => go2(true); $("#ciDraft").onclick = () => go2(false);
}

/* ====================================================================
   QUICKBOOKS — project expenses checked against the books
   --------------------------------------------------------------------
   S.qbo   snapshot from the "qbo" function (hourly): bank and card
           accounts with balances, accounts, customers, vendors, and every
           posted expense since the first project (Purchase / Bill /
           VendorCredit, with their lines).
   t.qb    on a project transaction: a link a person made or confirmed
           {type, id, line?, ids?: [...], how, at, by}
   t.qbSkip  "not a QuickBooks expense" (inventory, PHD's own fees…)
   S.acct.qb  settings: property → QuickBooks customer, default
           categories, QuickBooks lines that aren't project costs.

   The matching is worked out fresh from both sides every time:
     1. links people made                     (t.qb)
     2. same amount, close in date            (one receipt = one charge)
     3. several console expenses = one charge (a bulk receipt split here)
     4. one console expense = several charges (a contractor paid in parts)
     5. a line of a multi-line QuickBooks record (a bill with a line per job)
     6. part of a bigger charge               (needs a person to confirm)
   Anything left is "Not in QuickBooks". QuickBooks project costs that
   nothing here explains are "In QuickBooks, not in the console".
   ==================================================================== */
const QB_UNCAT = /^(ask client|ask my accountant|uncategori[sz]ed (expense|asset|income)|suspense)$/i;
const QB_INTERNAL = /^phd (inventory|properties|property management)$/i;
const QB_STORES = /^(lowes|homedepot|amazon|sherwin|costco|floordecor|floor|eastbay|truevalue|walmart|target|wayfair|ikea|acehardwa|ferguson|grainger|menards|benjamin)/;
const QB_OK_CLASS = new Set(["Expense", "Asset"]);         // where project costs can sit; liability, income and equity lines are someone else's money

function qbReady(){ return !!(S.qbo && Array.isArray(S.qbo.txns)); }
function qbSet(){ S.acct = S.acct || {}; S.acct.qb = S.acct.qb || {}; const q = S.acct.qb; q.cust = q.cust || {}; q.ignore = q.ignore || {}; return q; }
function qbCfg(){ return (S.acct && S.acct.qb) || {cust:{}, ignore:{}}; }
const qbDay = iso => iso ? PMCore.dayNum(String(iso).slice(0, 10)) : null;
const qbKey = (type, id, line) => type + "/" + id + (line ? "#" + line : "");
function qbNorm(s){
  return String(s || "").toLowerCase().replace(/^the\s+/, "").replace(/['’`]/g, "").replace(/\b(inc|llc|co|corp|company|the|of|charleston|store|#?\d+)\b\.?/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}
function qbVk(s){
  s = qbNorm(s);
  if(/^amazon|^amzn/.test(s)) return "amazon";
  if(/^lowe/.test(s)) return "lowes";
  if(/^home ?depot/.test(s)) return "homedepot";
  if(/^sherwin/.test(s)) return "sherwin";
  return s.replace(/ /g, "").slice(0, 10);
}
function qbVendorHit(consoleVendor, qt){
  const k = qbVk(consoleVendor); if(!k || k.length < 3) return false;
  const vk = qbVk(qt.vendor && qt.vendor.name);
  if(vk && (vk.startsWith(k.slice(0, 5)) || k.startsWith(vk.slice(0, 5)))) return true;
  // bills entered under a person with the company in the description (e.g. "Carolina Sky Renovations — 27 Smith St labor")
  const text = qbNorm([qt.memo].concat(qt.lines.map(l => l.desc)).join(" ")).replace(/ /g, "");
  return text.includes(k.slice(0, 8));
}
const qbLineClass = l => { if(!l || !l.account) return "Expense"; const a = qbAcct(l.account.id); return a ? a.cls : "Expense"; };
const qbUnitOk = u => (u.line ? [u.line] : u.qt.lines).every(l => QB_OK_CLASS.has(qbLineClass(l)));
// is a QuickBooks customer this project's (or its owner / a job under it)?
function qbCustRelated(a, b){
  if(!a || !b) return true; if(a === b) return true;
  const A = qbCust(a), B = qbCust(b); if(!A || !B) return false;
  const fa = String(A.full || A.name), fb = String(B.full || B.name);
  return fa.startsWith(fb + ":") || fb.startsWith(fa + ":");
}
// does this QuickBooks line belong to a different property than p?
function qbLineElsewhere(p, qt, l){
  if(!l) return false;
  const mine = qbCustFor(p);
  if(l.customer && mine && !qbCustRelated(l.customer.id, mine)) return true;
  const lp = qbPropOfLine(qt, l); return !!(lp && lp.id !== p.id);
}
const qbAcct = id => ((S.qbo && S.qbo.accounts) || []).find(a => a.id === id) || null;
const qbCust = id => ((S.qbo && S.qbo.customers) || []).find(c => c.id === id) || null;
const qbIsProjAcct = name => /^project management:/i.test(name || "") && !/income/i.test(name || "");
const qbIsMaint = name => /maintenance cost|repairs? ?(&|and) ?maintenance/i.test(name || "");
const qbUsd0 = c => usd(c).replace(/\.00$/, "");
const qbShort = name => String(name || "").split(":").pop();
const qbLabMin = () => { const v = +qbCfg().labMin; return (v > 0 ? v : 500) * 100; };   // cents: labor at or over this is a project subcontractor cost, never maintenance
const qbFmtDate = iso => iso ? fdateS(iso) + (iso.slice(0, 4) !== todayISO().slice(0, 4) ? " '" + iso.slice(2, 4) : "") : "";

/* ---------- property ↔ QuickBooks customer ---------- */
// chosen on the settings sheet, or worked out: a customer named like the property (also "Owner:property" jobs),
// preferring the one already used most on project costs
function qbCustFor(p){
  const set = qbCfg().cust[p.id]; if(set) return set === "none" ? "" : set;
  if(!qbReady()) return "";
  const key = PMCore.normAddr(p.name), keys = new Set([p.name, p.address].concat(p.aliases || []).map(PMCore.normAddr).filter(Boolean));
  const cands = (S.qbo.customers || []).filter(c => { const last = String(c.full || c.name).split(":").pop(); return keys.has(PMCore.normAddr(last)) || keys.has(PMCore.normAddr(c.name)); });
  if(!cands.length) return qbOwnerCust(p);
  const used = {}; S.qbo.txns.forEach(t => t.lines.forEach(l => { if(l.customer) used[l.customer.id] = (used[l.customer.id] || 0) + 1; }));
  cands.sort((a, b) => (used[b.id] || 0) - (used[a.id] || 0) || (a.job === b.job ? 0 : a.job ? 1 : -1));
  return cands[0].id;
}
// the owner as a QuickBooks customer, when there's no customer named for the property:
// "Bryan Watkins" → Bryan Watkins; "Ken Ansin" → Kenneth Ansin; "Chris Murphy -Gallagher Holdings LLC" → Chris Murphy or Gallagher Holdings
const qbNameToks = s => String(s || "").toLowerCase().replace(/\b(llc|inc|co|corp|ltd|lp|llp|pllc|trust|the)\b\.?/g, " ").replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
function qbNameLike(a, b){
  const A = qbNameToks(a), B = qbNameToks(b); if(!A.length || !B.length) return 0;
  if(A.join(" ") === B.join(" ")) return 3;
  if(A.length >= 2 && B.length >= 2 && A[A.length - 1] === B[B.length - 1] && A[A.length - 1].length > 2){
    const f = A[0], g = B[0]; if(f === g) return 2;
    if(f.length >= 3 && g.length >= 3 && (f.startsWith(g) || g.startsWith(f))) return 1;      // Ken / Kenneth, Chris / Christopher
  }
  return 0;
}
function qbOwnerNames(p){
  const oi = p.ownerInfo || {}, o = (typeof S !== "undefined" && S.owners && p.ownerId) ? (S.owners.find ? S.owners.find(x => x.id === p.ownerId) : null) : null;
  return [...new Set([p.owner, oi.name, oi.company, o && o.name, o && o.company].filter(Boolean).flatMap(n => String(n).split(/\s+-\s*|\s*-\s+|,|&|\/|\band\b/i)).map(x => x.trim()).filter(x => x.length > 2))];
}
function qbOwnerCust(p){
  if(!qbReady()) return "";
  const names = qbOwnerNames(p); if(!names.length) return "";
  let best = null;
  (S.qbo.customers || []).forEach(c => {
    if(c.parent) return;                                           // the owner is a top-level customer
    const sc = Math.max(...names.map(n => Math.max(qbNameLike(n, c.name), qbNameLike(n, c.full))));
    if(sc && (!best || sc > best.sc)) best = {id:c.id, sc};
  });
  return best ? best.id : "";
}
function qbPropForCust(custId){
  if(!custId) return null;
  const ps = live();
  const direct = ps.find(p => qbCustFor(p) === custId); if(direct) return direct;
  const c = qbCust(custId); if(!c) return null;
  const last = PMCore.normAddr(String(c.full || c.name).split(":").pop());
  return ps.find(p => [p.name, p.address].concat(p.aliases || []).map(PMCore.normAddr).includes(last)) || null;
}
// which project a QuickBooks line is about: its customer, else a property named in its description
function qbPropOfLine(qt, l){
  const byCust = l && l.customer ? qbPropForCust(l.customer.id) : null; if(byCust) return byCust;
  const text = PMCore.normAddr((l ? l.desc : "") + " " + qt.memo);
  return live().find(p => { const k = PMCore.normAddr(p.name); return k && text.includes(k); }) || null;
}

/* ---------- the matching ---------- */
let _qbCache = null;
function qbMatch(){
  if(!qbReady()) return null;
  const sig = S.qbo.syncedAt + "|" + (S.qbo.appliedAt || "") + "|" + JSON.stringify(qbCfg()) + "|" + live().map(p => p.id + ":" + qbOwnerNames(p).join("/") + ":" + p.transactions.map(t => t.id + t.amount + t.date + t.vendor + (t.qb ? JSON.stringify(t.qb) : "") + (t.qbSkip ? "s" : "") + (t.qbNot ? "n" + t.qbNot.join(",") : "")).join(",")).join("|");
  if(_qbCache && _qbCache.sig === sig) return _qbCache.v;
  const today = qbDay(todayISO());
  // units: each QuickBooks record, and each line of a record that has several
  const units = [], unitBy = new Map();
  S.qbo.txns.forEach(qt => {
    const sign = qt.credit ? -1 : 1;
    const whole = {k:qbKey(qt.type, qt.id), qt, line:null, c:sign * cents(qt.total), d:qbDay(qt.date)};
    units.push(whole); unitBy.set(whole.k, whole);
    if(qt.lines.length > 1) qt.lines.forEach(l => { const u = {k:qbKey(qt.type, qt.id, l.id), qt, line:l, c:sign * cents(l.amount), d:qbDay(qt.date), parent:whole.k}; units.push(u); unitBy.set(u.k, u); });
  });
  const taken = new Set();                        // record keys and line keys in use
  const takeU = u => { taken.add(u.k); if(u.parent) taken.add(u.parent); else u.qt.lines.forEach(l => taken.add(qbKey(u.qt.type, u.qt.id, l.id))); };
  const freeU = u => !taken.has(u.k) && (u.parent ? !taken.has(u.parent) : !u.qt.lines.some(l => taken.has(qbKey(u.qt.type, u.qt.id, l.id))));
  const res = new Map();                          // "pid|tid" -> result
  const C = [];
  live().forEach(p => p.transactions.forEach(t => {
    const k = p.id + "|" + t.id, c = cents(t.amount);
    if(!c) return;
    if(t.qbSkip || QB_INTERNAL.test(String(t.vendor || "").trim())){ res.set(k, {state:"skip", why:t.qbSkip ? (t.qbSkip.why || "Marked not a QuickBooks expense") : "PHD's own charge — not a QuickBooks expense"}); return; }
    if(t.qbNot && t.qbNot.length && !t.qb){ res.set(k, {state:"none", unmatched:true, why:`You unmatched it${t.qbNotAt ? " on " + fdateS(t.qbNotAt) : ""} — use Find in QuickBooks to pick the right record`}); return; }
    C.push({k, p, t, c, d:qbDay(t.date)});
  }));
  const freeC = new Set(C.map(x => x.k));
  // a person unmatched these: never pair this expense with them again on its own
  const nope = (x, u) => !!(x.t.qbNot && (x.t.qbNot.includes(u.k) || (u.parent && x.t.qbNot.includes(u.parent))));
  // 1. links people made
  C.forEach(x => {
    const L = x.t.qb; if(!L) return;
    const keys = (L.ids || [qbKey(L.type, L.id, L.line)]);
    const us = keys.map(k => unitBy.get(k)).filter(Boolean);
    if(us.length !== keys.length){ res.set(x.k, {state:"gone", how:"manual", why:"The QuickBooks record it was linked to was deleted or is older than the sync window"}); freeC.delete(x.k); return; }
    us.forEach(takeU); freeC.delete(x.k);
    res.set(x.k, {state:"matched", how:L.how === "suggested" ? "confirmed" : "manual", units:us});
  });
  // shared links: several console expenses a person linked to the same record
  // 2. one to one — same amount (sign included), close in date; vendor and property break ties
  const pairs = [];
  C.forEach(x => {
    if(!freeC.has(x.k)) return;
    units.forEach(u => {
      if(u.c !== x.c || !freeU(u) || nope(x, u) || x.d == null || u.d == null) return;
      const dd = Math.abs(u.d - x.d), vh = qbVendorHit(x.t.vendor, u.qt);
      if(dd > 45 || (dd > 10 && !vh)) return;
      const ok = qbUnitOk(u); if(!ok && !(vh && dd <= 10)) return;       // liability / income lines only with the vendor and a close date
      const l1 = u.line || (u.qt.lines.length === 1 ? u.qt.lines[0] : null), lp = qbPropOfLine(u.qt, l1);
      const away = l1 ? qbLineElsewhere(x.p, u.qt, l1) : u.qt.lines.every(l => qbLineElsewhere(x.p, u.qt, l));
      const score = 100 - dd * 1.5 + (vh ? 40 : 0) + (lp && lp.id === x.p.id ? 30 : 0) - (away ? 60 : 0) + (u.line ? 0 : 5) - (ok ? 0 : 30);
      if(score > 20) pairs.push({x, u, score, dd, vh});
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  pairs.forEach(({x, u, score}) => {
    if(!freeC.has(x.k) || !freeU(u)) return;
    takeU(u); freeC.delete(x.k);
    res.set(x.k, {state:"matched", how:"auto", units:[u], score});
  });
  // 3. several console expenses = one QuickBooks charge (a bulk receipt split across units or properties here)
  const subset = (items, target, maxN) => {           // exact subset sum in cents; items: [{c}] (n ≤ 18)
    const n = items.length; if(!n || n > 18) return null;
    let best = null;
    const rec = (i, sum, pick) => {
      if(best) return;
      if(sum === target && pick.length >= 2){ best = pick.slice(); return; }
      if(i >= n || pick.length >= maxN) return;
      if(Math.abs(sum) > Math.abs(target) + 1 && Math.sign(target) === Math.sign(sum)) { /* overshoot allowed only with credits */ if(items.slice(i).every(y => Math.sign(y.c) === Math.sign(target))) return; }
      pick.push(items[i]); rec(i + 1, sum + items[i].c, pick); pick.pop();
      rec(i + 1, sum, pick);
    };
    rec(0, 0, []); return best;
  };
  // 2b. one console expense = several lines of one QuickBooks record (a contractor bill with a line per job and trade)
  C.filter(x => freeC.has(x.k)).forEach(x => {
    units.filter(u => !u.line && u.qt.lines.length > 1 && !nope(x, u) && Math.abs(u.d - x.d) <= 21 && qbVendorHit(x.t.vendor, u.qt)).some(u => {
      const ls = units.filter(v => v.parent === u.k && freeU(v) && !nope(x, v) && qbUnitOk(v) && !qbLineElsewhere(x.p, v.qt, v.line) && Math.sign(v.c) === Math.sign(x.c));
      const pick = ls.length >= 2 && ls.length <= 14 ? subset(ls, x.c, 6) : null; if(!pick) return false;
      pick.forEach(takeU); freeC.delete(x.k);
      res.set(x.k, {state:"matched", how:"lines", units:pick}); return true;
    });
  });
  // 3. several console expenses = one QuickBooks charge (a bulk receipt split across units or properties here) — a person confirms
  units.filter(u => !u.line && freeU(u) && qbUnitOk(u) && Math.abs(u.c) >= 1000).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).forEach(u => {
    const near = C.filter(x => freeC.has(x.k) && !nope(x, u) && x.d != null && Math.abs(x.d - u.d) <= 7 && qbVendorHit(x.t.vendor, u.qt) && !u.qt.lines.every(l => qbLineElsewhere(x.p, u.qt, l))).sort((a, b) => Math.abs(a.d - u.d) - Math.abs(b.d - u.d)).slice(0, 16);
    const pick = subset(near, u.c, 8); if(!pick) return;
    takeU(u); pick.forEach(x => { freeC.delete(x.k); res.set(x.k, {state:"partial", kind:"group", units:[u], peers:pick.map(y => y.k), why:`Together with ${pick.length - 1} other expense${pick.length === 2 ? "" : "s"} here, this is one ${usd(Math.abs(u.c))} ${u.qt.vendor ? u.qt.vendor.name + " " : ""}charge on ${qbFmtDate(u.qt.date)} (${pick.filter(y => y !== x).map(y => y.p.name + " " + usd(Math.abs(y.c))).join(", ")})`}); });
  });
  // 4. one console expense = several QuickBooks charges (deposit + balance, paid in parts)
  C.filter(x => freeC.has(x.k) && Math.abs(x.c) >= 10000).forEach(x => {
    const near = units.filter(u => !u.line && freeU(u) && !nope(x, u) && qbUnitOk(u) && Math.sign(u.c) === Math.sign(x.c) && Math.abs(u.d - x.d) <= 30 && qbVendorHit(x.t.vendor, u.qt) && !u.qt.lines.every(l => qbLineElsewhere(x.p, u.qt, l))).slice(0, 14);
    const pick = subset(near, x.c, 4); if(!pick) return;
    pick.forEach(takeU); freeC.delete(x.k);
    res.set(x.k, {state:"partial", kind:"parts", units:pick, why:`Paid in ${pick.length} parts? ${pick.map(u => usd(Math.abs(u.c)) + " on " + qbFmtDate(u.qt.date)).join(" + ")}`});
  });
  // 6. part of a bigger charge: same vendor, within 3 days, the charge is larger — a person confirms
  C.filter(x => freeC.has(x.k)).forEach(x => {
    const u = units.filter(u => !u.line && freeU(u) && !nope(x, u) && qbUnitOk(u) && Math.sign(u.c) === Math.sign(x.c) && Math.abs(u.c) > Math.abs(x.c) && Math.abs(u.d - x.d) <= 3 && qbVendorHit(x.t.vendor, u.qt) && !u.qt.lines.every(l => qbLineElsewhere(x.p, u.qt, l)))
      .sort((a, b) => Math.abs(a.d - x.d) - Math.abs(b.d - x.d) || Math.abs(a.c) - Math.abs(b.c))[0];
    if(u) res.set(x.k, {state:"partial", kind:"part", units:[u], why:`Part of a ${usd(Math.abs(u.c))} ${u.qt.vendor ? u.qt.vendor.name + " " : ""}charge on ${qbFmtDate(u.qt.date)}`});
  });
  // what's left isn't in QuickBooks (yet)
  C.filter(x => freeC.has(x.k) && !res.has(x.k)).forEach(x => {
    const age = today - x.d;
    const near = units.filter(u => !u.line && freeU(u) && Math.abs(u.d - x.d) <= 10 && qbVendorHit(x.t.vendor, u.qt)).sort((a, b) => Math.abs(a.d - x.d) - Math.abs(b.d - x.d))[0];
    res.set(x.k, {state:"none", why:age <= 21 ? "Recent — it may still be in QuickBooks' Banking “For review” list" : x.d < qbDay(S.qbo.from) ? "Older than the QuickBooks sync window" : near ? `QuickBooks has ${usd(Math.abs(near.c))} from ${near.qt.vendor ? near.qt.vendor.name : "this vendor"} on ${qbFmtDate(near.qt.date)} — a different amount` : "No QuickBooks expense with this amount near this date", near:near ? near.k : null});
  });
  // QuickBooks side: project costs nothing here explains
  const ign = qbCfg().ignore || {};
  const missing = [];
  S.qbo.txns.forEach(qt => {
    const wk = qbKey(qt.type, qt.id);
    if(taken.has(wk) || ign[wk]) return;
    qt.lines.forEach(l => {
      const lk = qbKey(qt.type, qt.id, l.id);
      if(taken.has(lk) || ign[lk] || (qt.lines.length === 1 && taken.has(wk))) return;
      const acct = l.account ? l.account.name : "", p = qbPropOfLine(qt, l);
      const projAcct = qbIsProjAcct(acct);
      if(!QB_OK_CLASS.has(qbLineClass(l))) return;
      if(!(projAcct || p)) return;
      missing.push({k:qt.lines.length > 1 ? lk : wk, qt, l, p, c:(qt.credit ? -1 : 1) * cents(l.amount)});
    });
  });
  // the accountant: categories and customers for project costs that are in QuickBooks
  const fixes = [], cfg = qbCfg(), accts = S.qbo.accounts || [];
  const lab = cfg.lab || (accts.find(a => /^project management:labor/i.test(a.name)) || {}).id || "";
  const mat = cfg.mat || (accts.find(a => /^project management:materials/i.test(a.name)) || {}).id || "";
  const big = qbLabMin();
  // what a vendor's line should be: a category you picked for this vendor before, else store → materials, everyone else → labor.
  // Labor over the limit never goes to Maintenance Cost, whatever the rule says.
  const acctFor = (vendor, amt) => {
    const vk = qbVk(vendor), store = QB_STORES.test(vk), r = vk && (cfg.rules || {})[vk];
    if(r && qbAcct(r) && !(qbIsMaint((qbAcct(r) || {}).name) && !store && Math.abs(amt) >= big)) return {id:r, how:"rule"};
    return store ? {id:mat, how:"store"} : {id:lab, how:"labor"};
  };
  res.forEach((r, k) => {
    if(r.state !== "matched" || !r.units) return;
    const [pid, tid] = k.split("|"), p = live().find(x => x.id === pid), t = p && p.transactions.find(y => y.id === tid);
    if(!p || !t) return;
    r.units.forEach(u => {
      const lines = u.line ? [u.line] : u.qt.lines;
      if(lines.length !== 1) return;                       // several lines on one charge: left as they are (split it in QuickBooks if needed)
      const l = lines[0], want = {}, amt = cents(l.amount);
      const peers = r.peers ? r.peers.map(pk => pk.split("|")[0]) : [pid];
      const oneProp = new Set(peers).size === 1;
      const cust = oneProp ? qbCustFor(p) : "";
      if(cust && (!l.customer || l.customer.id !== cust)) want.customer = cust;
      const cur = l.account ? l.account.name : "", vend = t.vendor || (u.qt.vendor && u.qt.vendor.name) || "";
      const labor = !QB_STORES.test(qbVk(vend)), bigLab = labor && Math.abs(amt) >= big;
      let how = "";
      if(l.kind === "account" && !/^(cost of goods|cogs)/i.test(cur) && (!qbIsProjAcct(cur) || (bigLab && qbIsMaint(cur)))){
        const a = acctFor(vend, amt); if(a.id && (!l.account || l.account.id !== a.id)){ want.account = a.id; how = a.how; }
      }
      if(!Object.keys(want).length) return;
      const fk = qbKey(u.qt.type, u.qt.id, l.id);
      if(fixes.some(f => f.k === fk)) return;
      const odd = !QB_OK_CLASS.has(qbLineClass(l));
      const why = bigLab && qbIsMaint(cur) && want.account ? `Labor over ${qbUsd0(big)} — goes to ${qbShort((qbAcct(want.account) || {}).name)}, not ${qbShort(cur)}`
        : how === "rule" ? `What you chose for ${vend} before`
        : QB_UNCAT.test(cur) ? "Not categorized yet"
        : /leasehold/i.test(cur) ? "Project costs, not PHD's own improvements"
        : !l.customer && want.customer ? "No customer on it"
        : want.account ? (how === "store" ? "Store purchase for a project" : "Contractor work for a project") : "Wrong customer";
      fixes.push({k:fk, qt:u.qt, l, want, p:oneProp ? p : null, t, odd, labor, bigLab, why,
        sure:!odd && (bigLab || how === "rule" || QB_UNCAT.test(cur) || !l.customer || /leasehold/i.test(cur) || (want.customer && !want.account))});
    });
  });
  // uncategorized lines: suggest from your earlier choices for the vendor, else what the vendor is usually filed under
  const usual = {};
  S.qbo.txns.forEach(qt => qt.lines.forEach(l => { const vk = qbVk(qt.vendor && qt.vendor.name); if(!vk || !l.account || QB_UNCAT.test(l.account.name) || !QB_OK_CLASS.has(qbLineClass(l))) return; (usual[vk] = usual[vk] || {})[l.account.id] = ((usual[vk] || {})[l.account.id] || 0) + 1; }));
  const uncats = [];
  S.qbo.txns.forEach(qt => qt.lines.forEach(l => {
    if(!l.account || !QB_UNCAT.test(l.account.name)) return;
    const k = qbKey(qt.type, qt.id, l.id); if(fixes.some(f => f.k === k)) return;
    const vname = qt.vendor ? qt.vendor.name : "", vk = qbVk(vname), amt = cents(l.amount), labor = !QB_STORES.test(vk), bigLab = labor && Math.abs(amt) >= big;
    const rule = vk && (cfg.rules || {})[vk];
    let sug = "", why = "Not categorized yet";
    if(rule && qbAcct(rule) && !(bigLab && qbIsMaint(qbAcct(rule).name))){ sug = rule; why = `What you chose for ${vname} before`; }
    else if(vk && usual[vk]){ const top = Object.entries(usual[vk]).filter(([id]) => !(bigLab && qbIsMaint((qbAcct(id) || {}).name))).sort((a, b) => b[1] - a[1])[0]; if(top){ sug = top[0]; why = `${vname} is usually ${qbShort((qbAcct(top[0]) || {}).name)}`; } }
    const p = qbPropOfLine(qt, l);
    if(!sug && p){ sug = labor ? lab : mat; why = `Mentions ${p.name}`; }
    uncats.push({k, qt, l, p, labor, bigLab, why, want:sug ? {account:sug} : {}, sure:!!rule && !!sug && !!p, uncat:true});
  }));
  const v = {res, missing, fixes, uncats, unitBy};
  _qbCache = {sig, v};
  return v;
}
function qbResult(p, t){ const m = qbMatch(); return m ? m.res.get(p.id + "|" + t.id) || null : null; }
function qbCounts(){
  const m = qbMatch(); if(!m) return null;
  const n = {matched:0, none:0, partial:0, skip:0, gone:0, mC:0, noneC:0};
  live().forEach(p => p.transactions.forEach(t => { const r = m.res.get(p.id + "|" + t.id); if(!r) return; n[r.state]++; if(r.state === "matched") n.mC += Math.abs(cents(t.amount)); if(r.state === "none" || r.state === "gone") n.noneC += Math.abs(cents(t.amount)); }));
  n.missing = m.missing.length; n.fixes = m.fixes.length; n.uncats = m.uncats.length;
  return n;
}

/* ---------- server calls ---------- */
async function qbCall(mode, body){
  if(!(typeof Cloud !== "undefined" && Cloud.ready)) throw new Error("QuickBooks works in the hosted console (sign in first).");
  const {data, error} = await Cloud.sb.functions.invoke("qbo", {body:Object.assign({mode}, body || {})});
  if(error){
    if(error.name === "FunctionsFetchError" || /Failed to send a request/i.test(error.message || "")) throw new Error("Couldn't reach the QuickBooks function. Check your connection and try again.");
    let msg = error.message; try{ const b = await error.context.json(); if(b && b.error) msg = b.error; }catch(e){}
    throw new Error(msg);
  }
  if(data && data.error) throw new Error(data.error);
  return data || {};
}
async function qbFetchSnapshot(){
  if(!(typeof Cloud !== "undefined" && Cloud.ready)) return;
  const {data} = await Cloud.sb.from("docs").select("data,version,deleted").eq("kind", "shared").eq("id", "qbo").maybeSingle();
  if(data && data.data){ S.qbo = data.data; Cloud.synced.set("shared/qbo", {json:JSON.stringify(data.data), version:data.version, deleted:false}); _qbCache = null; }
}
async function qbSyncNow(btn){
  if(btn){ btn.disabled = true; btn.textContent = "Syncing…"; }
  try{ const r = await qbCall("sync"); await qbFetchSnapshot(); toast(`QuickBooks synced · ${r.counts ? r.counts.purchases + r.counts.bills + r.counts.credits : 0} expenses since ${qbFmtDate(r.from)}`); }
  catch(e){ toast(e.message); }
  render();
}

/* ---------- links people make ---------- */
const qbWho = () => (typeof Cloud !== "undefined" && (Cloud.email || Cloud.name)) || "";
function qbLink(p, t, keys, how){
  snapshot();
  const k0 = keys[0], [type, rest] = k0.split("/"), [id, line] = rest.split("#");
  if(t.qbNot){ t.qbNot = t.qbNot.filter(k => !keys.includes(k)); if(!t.qbNot.length){ delete t.qbNot; delete t.qbNotAt; } }
  t.qb = keys.length === 1 ? {type, id, line:line || undefined, how:how || "manual", at:todayISO(), by:qbWho()} : {ids:keys, how:how || "manual", at:todayISO(), by:qbWho()};
  delete t.qbSkip;
  commit(); render();
}
function qbUnlink(p, t){ snapshot(); delete t.qb; commit(); render(); }
// unmatch: drop the link (a person's or the automatic one) and keep this expense off those QuickBooks records from now on
function qbUnmatch(p, t){
  const r = qbResult(p, t), keys = r && r.units ? r.units.map(u => u.k) : [];
  snapshot(); delete t.qb;
  t.qbNot = [...new Set((t.qbNot || []).concat(keys))]; t.qbNotAt = todayISO();
  commit(); render();
}
function qbRematch(p, t){ snapshot(); delete t.qbNot; delete t.qbNotAt; commit(); render(); }
function qbSkipTxn(p, t, why){ snapshot(); t.qbSkip = {why:why || "Not a QuickBooks expense", at:todayISO(), by:qbWho()}; delete t.qb; commit(); render(); }
function qbUnskip(p, t){ snapshot(); delete t.qbSkip; commit(); render(); }

/* ---------- small pieces of screen ---------- */
function qbRecLabel(qt){
  const kind = qt.type === "Bill" ? "Bill" : qt.type === "VendorCredit" ? "Vendor credit" : qt.credit ? "Card credit" : qt.payType === "Check" ? "Check" : qt.payType === "CreditCard" ? "Card charge" : "Expense";
  return `${kind}${qt.doc ? " " + qt.doc : ""} · ${qt.vendor ? qt.vendor.name : "no vendor"} · ${qbFmtDate(qt.date)}${qt.from && qt.type !== "Bill" ? " · " + qt.from.name : ""}`;
}
function qbLineLabel(l){ return [l.account ? l.account.name : l.item ? l.item.name : "", l.customer ? "→ " + l.customer.name : ""].filter(Boolean).join(" "); }
function qbChip(p, t){
  const r = qbResult(p, t); if(!r) return "";
  if(r.state === "matched") return `<span class="mark qb ok" title="${esc(r.units.map(u => qbRecLabel(u.qt)).join("\n"))}">QB ✓</span>`;
  if(r.state === "partial") return `<span class="mark qb part" title="${esc(r.why)}">QB part</span>`;
  if(r.state === "none" || r.state === "gone") return `<span class="mark qb no" title="${esc(r.why)}">Not in QB</span>`;
  return "";
}
function qbPickSheet(p, t){
  const m = qbMatch(); if(!m) return;
  const c = cents(t.amount), d = qbDay(t.date);
  const all = [];
  m.unitBy.forEach(u => { if(u.line && u.qt.lines.length < 2) return; const dd = d != null && u.d != null ? Math.abs(u.d - d) : 999; const vh = qbVendorHit(t.vendor, u.qt);
    const s = (u.c === c ? 100 : Math.abs(u.c) > Math.abs(c) && Math.sign(u.c) === Math.sign(c) ? 30 : 0) + (vh ? 40 : 0) - Math.min(dd, 60); if((s > 0 || vh) && dd <= 60) all.push({u, s, dd, vh}); });
  all.sort((a, b) => b.s - a.s);
  const cur = new Set(t.qb ? (t.qb.ids || [qbKey(t.qb.type, t.qb.id, t.qb.line)]) : []);
  const list = all.slice(0, 40);
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>Find in QuickBooks</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(p.name)} · ${esc(t.vendor || "")} · ${usd(Math.abs(c))}${c < 0 ? " credit" : ""} · ${qbFmtDate(t.date)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="help" style="margin-top:0">Closest QuickBooks records first. Tick the one this expense is — or several, when the store charged the card in pieces or a refund is already taken out of it. Credits count as minus.</p>
      <input type="search" id="qbpQ" class="inv-q" style="margin:0 0 8px;width:100%;box-sizing:border-box" placeholder="Filter by amount, vendor or card">
      <div class="qb-pick">${list.map((x, i) => `<label class="qb-pick-r" data-q="${esc((usd(Math.abs(x.u.c)) + " " + Math.abs(x.u.c / 100).toFixed(2) + " " + qbRecLabel(x.u.qt)).toLowerCase())}"><input type="checkbox" name="qbp" value="${esc(x.u.k)}" data-c="${x.u.c}" ${cur.has(x.u.k) || (!cur.size && i === 0 && x.u.c === c) ? "checked" : ""}>
        <span><b class="${x.u.c < 0 ? "qb-cr" : ""}">${x.u.c < 0 ? "−" : ""}${usd(Math.abs(x.u.c))}</b> ${x.u.c < 0 ? `<span class="muted">credit</span>` : ""} ${x.u.line ? `<span class="muted">line of a ${usd(cents(x.u.qt.total))} record</span>` : ""}<div class="muted">${esc(qbRecLabel(x.u.qt))}</div><div class="muted">${esc(x.u.line ? (x.u.line.desc || qbLineLabel(x.u.line)) : x.u.qt.lines.map(l => l.desc || qbLineLabel(l)).filter(Boolean).join(" · ").slice(0, 140))}</div></span>
        <span class="tag ${x.u.c === c ? "green" : "grey"}">${x.u.c === c ? "same amount" : "different amount"}</span></label>`).join("") || `<p class="muted">Nothing in QuickBooks within two months of this date.</p>`}</div></div>
    <div class="sheet-f"><button class="btn ghost" id="qbSkip">Not a QuickBooks expense</button><span class="qbp-sum" id="qbpSum"></span><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="qbOk" ${list.length ? "" : "disabled"}>Link</button></div>`;
  openPanel(); $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  const picked = () => [...sh.querySelectorAll("[name=qbp]:checked")];
  const sum = () => { const ps = picked(), tot = ps.reduce((a, x) => a + (+x.dataset.c), 0), diff = tot - c;
    $("#qbpSum").innerHTML = ps.length ? `${ps.length} picked · ${tot < 0 ? "−" : ""}${usd(Math.abs(tot))} · ${diff === 0 ? `<span style="color:var(--green)">matches</span>` : `<span style="color:var(--gold)">${usd(Math.abs(diff))} ${diff > 0 ? "over" : "short"}</span>`}` : "";
    $("#qbOk").textContent = ps.length > 1 ? `Link ${ps.length}` : "Link"; };
  sh.querySelectorAll("[name=qbp]").forEach(x => x.onchange = sum); sum();
  $("#qbpQ").oninput = () => { const q = $("#qbpQ").value.trim().toLowerCase().replace(/[$,]/g, ""); sh.querySelectorAll(".qb-pick-r").forEach(r => r.style.display = !q || r.dataset.q.replace(/[$,]/g, "").includes(q) || r.querySelector("input").checked ? "" : "none"); };
  $("#qbSkip").onclick = () => { qbSkipTxn(p, t); closeSheet(); toast("Marked not a QuickBooks expense"); };
  $("#qbOk").onclick = () => {
    const ps = picked(); if(!ps.length) return toast("Tick at least one");
    const tot = ps.reduce((a, x) => a + (+x.dataset.c), 0);
    if(tot !== c && !confirm(`These add up to ${tot < 0 ? "−" : ""}${usd(Math.abs(tot))}, not ${usd(c)} (${usd(Math.abs(tot - c))} ${tot > c ? "over" : "short"}). Link them anyway?`)) return;
    qbLink(p, t, ps.map(x => x.value)); closeSheet(); toast(ps.length > 1 ? `Linked to ${ps.length} QuickBooks records` : "Linked to QuickBooks", true);
  };
}

/* ---------- add a QuickBooks cost to the console ---------- */
function qbAddSheet(item){
  const {qt, l} = item, ps = live();
  const guess = item.p || ps[0];
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>Add to the console</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(qbRecLabel(qt))} · ${usd(Math.abs(item.c))}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <label class="fld"><span>Property</span><select id="qaP">${ps.map(p => `<option value="${p.id}" ${p.id === (guess && guess.id) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <label class="fld"><span>Unit</span><select id="qaU"></select></label>
      <div class="f2"><label class="fld"><span>Vendor</span><input type="text" id="qaV" value="${esc(qt.vendor ? qt.vendor.name : "")}"></label><label class="fld"><span>Date</span><input type="date" id="qaD" value="${esc(qt.date)}"></label></div>
      <label class="fld"><span>What it was</span><input type="text" id="qaW" value="${esc((l.desc || qt.memo || "").split("\n").pop().slice(0, 120))}"></label>
      <p class="help">Adds it as a billable expense (${usd(Math.abs(item.c))}) linked to this QuickBooks record.</p></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="qaOk">Add</button></div>`;
  openPanel(); $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  const fillU = () => { const p = ps.find(x => x.id === $("#qaP").value); $("#qaU").innerHTML = p.units.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join("") + (p.units.length > 1 ? `<option value="split">Split across units</option>` : ""); };
  fillU(); $("#qaP").onchange = fillU;
  $("#qaOk").onclick = () => {
    const p = ps.find(x => x.id === $("#qaP").value), uv = $("#qaU").value;
    let scope;
    if(uv === "split"){ const sp = {}, even = +(100 / p.units.length).toFixed(2); p.units.forEach((u, i) => sp[u.id] = i === p.units.length - 1 ? +(100 - even * (p.units.length - 1)).toFixed(2) : even); scope = {type:"split", unit:null, splits:sp}; }
    else scope = {type:"single", unit:uv, splits:{}};
    snapshot();
    const [type, rest] = item.k.split("/"), [id, line] = rest.split("#");
    const rec = {id:uid(), receipt:"", link:"", pin:null, party:"Owner", notes:"From QuickBooks", tags:[], reconciled:false, reconciledAt:"",
      date:$("#qaD").value || qt.date, vendor:$("#qaV").value.trim(), desc:$("#qaW").value.trim(), amount:item.c / 100, scope, status:"billable", applyFee:true, allowPartial:true,
      qb:{type, id, line:line || undefined, how:"manual", at:todayISO(), by:qbWho()}};
    if(typeof applyHoldRule === "function") applyHoldRule(rec, p);
    p.transactions.push(rec); commit(); closeSheet(); toast(`Added to ${p.name}`, true); render();
  };
}

/* ---------- settings: customers per property, default categories, connection ---------- */
function qbSettingsSheet(){
  if(!qbReady()) return;
  const q = qbSet(), exp = (S.qbo.accounts || []).filter(a => /expense|cost of goods/i.test(a.type) || /^project management:/i.test(a.name)).sort((a, b) => a.name.localeCompare(b.name));
  const custs = (S.qbo.customers || []).slice().sort((a, b) => String(a.full).localeCompare(String(b.full)));
  const opt = (list, sel, blank) => `<option value="">${blank}</option>` + list.map(x => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.full || x.name)}</option>`).join("");
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>QuickBooks</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(S.qbo.company || "")} · synced ${esc(qbAgo(S.qbo.syncedAt))} · expenses since ${qbFmtDate(S.qbo.from)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="sectl" style="margin-top:0">Each project's customer in QuickBooks</div>
      <p class="help" style="margin-top:0">Project costs get this customer when you fix categories. Worked out from the names; change any that are wrong.</p>
      ${live().map(p => `<label class="fld qb-cust"><span>${esc(p.name)}</span><select data-qc="${p.id}"><option value="">${qbCustFor(p) && !q.cust[p.id] ? "Automatic: " + esc((qbCust(qbCustFor(p)) || {}).full || "") : "Automatic: none found"}</option><option value="none" ${q.cust[p.id] === "none" ? "selected" : ""}>No customer</option>${custs.map(c => `<option value="${c.id}" ${q.cust[p.id] === c.id ? "selected" : ""}>${esc(c.full || c.name)}</option>`).join("")}</select></label>`).join("")}
      <div class="sectl">Categories for project costs</div>
      <div class="f2"><label class="fld"><span>Materials</span><select id="qbMat">${opt(exp, q.mat || ((exp.find(a => /^project management:materials/i.test(a.name)) || {}).id), "Choose…")}</select></label>
        <label class="fld"><span>Labor and contractors</span><select id="qbLab">${opt(exp, q.lab || ((exp.find(a => /^project management:labor/i.test(a.name)) || {}).id), "Choose…")}</select></label></div>
      <p class="help">Store purchases (Lowe's, Home Depot, Amazon…) get Materials; everyone else did work and gets Labor.</p>
      <label class="fld" style="max-width:260px"><span>Labor this size or more never goes to Maintenance Cost</span><input id="qbLabMin" type="number" min="0" step="50" value="${esc(String(q.labMin || 500))}"></label>
      ${Object.keys(q.rules || {}).length ? `<div class="sectl">Categories remembered by vendor</div><p class="help" style="margin-top:0">Picked on “Fix in QuickBooks”; new lines from these vendors start on them.</p>
        <div class="qb-rules">${Object.entries(q.rules).map(([vk, id]) => `<div><span>${esc(vk)}</span><span class="muted">${esc(qbShort((qbAcct(id) || {}).name || "?"))}</span><button class="btn sm ghost" data-unrule="${esc(vk)}" aria-label="Forget">✕</button></div>`).join("")}</div>` : ""}
      ${Object.keys(q.ignore || {}).length ? `<div class="sectl">QuickBooks lines marked “not a project cost”</div><p class="help" style="margin-top:0">${Object.keys(q.ignore).length} hidden from “In QuickBooks, not in the console”. <a href="#" id="qbUnign">Show them again</a></p>` : ""}
      <div class="sectl">Connection</div>
      <p class="help" style="margin-top:0">Reads QuickBooks every hour. It changes QuickBooks only when you press “Update in QuickBooks”, and then only the category and customer on the lines you ticked — it never creates, deletes or pays anything.</p>
      <button class="btn sm" id="qbRe">Connect again</button> <button class="btn sm ghost" id="qbOff">Disconnect</button>
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="qbSave">Save</button></div>`;
  openPanel(); $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  const dropRules = new Set();
  sh.querySelectorAll("[data-unrule]").forEach(b => b.onclick = () => { dropRules.add(b.dataset.unrule); b.closest("div").remove(); });
  const un = $("#qbUnign"); if(un) un.onclick = e => { e.preventDefault(); snapshot(); q.ignore = {}; commit(); closeSheet(); render(); };
  $("#qbRe").onclick = async () => { try{ const r = await qbCall("connect"); window.open(r.url, "_blank", "noopener,width=720,height=800"); toast("Sign in to QuickBooks in the new window"); }catch(e){ toast(e.message); } };
  $("#qbOff").onclick = async () => { if(!confirm("Disconnect QuickBooks? The console stops checking project expenses against it until you connect again.")) return; try{ await qbCall("disconnect"); toast("QuickBooks disconnected"); }catch(e){ toast(e.message); } };
  $("#qbSave").onclick = () => {
    snapshot();
    sh.querySelectorAll("[data-qc]").forEach(s => { if(s.value) q.cust[s.dataset.qc] = s.value; else delete q.cust[s.dataset.qc]; });
    q.mat = $("#qbMat").value || undefined; q.lab = $("#qbLab").value || undefined;
    const lm = +$("#qbLabMin").value; q.labMin = lm > 0 && lm !== 500 ? lm : undefined;
    dropRules.forEach(k => { if(q.rules) delete q.rules[k]; });
    commit(); closeSheet(); render(); toast("QuickBooks settings saved", true);
  };
}
function qbAgo(iso){ if(!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 2 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : fdateS(iso.slice(0, 10)); }

/* ---------- the QuickBooks part of the Reconcile page ---------- */
function qbReconcileSection(v){
  const card = elm("div", "card qb-card");
  if(!qbReady()){
    card.innerHTML = `<div class="card-h"><h3>QuickBooks</h3></div><div class="card-b"><p class="muted" style="margin:0 0 10px">QuickBooks hasn't synced yet. Once it does, every project expense here is checked against it.</p>${typeof Cloud !== "undefined" && Cloud.ready ? `<button class="btn sm primary" id="qbFirst">Sync QuickBooks now</button>` : `<span class="muted">Sign in to the hosted console to use QuickBooks.</span>`}</div>`;
    v.appendChild(card); const b = card.querySelector("#qbFirst"); if(b) b.onclick = () => qbSyncNow(b);
    return;
  }
  const m = qbMatch(), n = qbCounts(), tab = S.ui.qbTab || "none";
  const banks = (S.qbo.accounts || []).filter(a => (a.type === "Bank" || a.type === "Credit Card") && a.balance != null && a.balance !== 0);
  const rows = []; live().forEach(p => p.transactions.forEach(t => { const r = m.res.get(p.id + "|" + t.id); if(r) rows.push({p, t, r}); }));
  rows.sort((a, b) => String(b.t.date || "").localeCompare(String(a.t.date || "")));
  const tabs = [["none", "Not in QuickBooks", n.none + n.gone], ["partial", "Needs a look", n.partial], ["fix", "Fix in QuickBooks", n.fixes + n.uncats], ["missing", "In QuickBooks, not here", n.missing], ["matched", "Matched", n.matched], ["skip", "Not QuickBooks expenses", n.skip]];
  card.innerHTML = `<div class="card-h"><h3>QuickBooks</h3><span class="muted td-n">${esc(S.qbo.company || "")} · synced ${esc(qbAgo(S.qbo.syncedAt))}</span>
      <span style="margin-left:auto;display:flex;gap:6px"><button class="btn sm ghost" id="qbSet">Settings</button><button class="btn sm" id="qbSync">Sync now</button></span></div>
    <div class="qb-hero">
      <div><div class="label">Matched</div><div class="pf-v sm g">${usd(n.mC)}</div><div class="pf-note">${n.matched} expense${n.matched === 1 ? "" : "s"}</div></div>
      <div><div class="label">Not in QuickBooks</div><div class="pf-v sm ${n.none + n.gone ? "a" : ""}">${usd(n.noneC)}</div><div class="pf-note">${n.none + n.gone} to look into</div></div>
      <div><div class="label">To fix in QuickBooks</div><div class="pf-v sm">${n.fixes + n.uncats}</div><div class="pf-note">${n.fixes} project cost${n.fixes === 1 ? "" : "s"} · ${n.uncats} uncategorized</div></div>
      <div><div class="label">Only in QuickBooks</div><div class="pf-v sm">${n.missing}</div><div class="pf-note">project costs not in the console</div></div>
    </div>
    ${banks.length ? `<details class="qb-banks"><summary>Bank and card balances in QuickBooks</summary><div class="qb-bank-grid">${banks.map(a => `<div><span>${esc(a.name)}</span><span class="num ${a.type === "Credit Card" ? "" : a.balance < 0 ? "neg" : ""}">${a.type === "Credit Card" ? usd(Math.abs(cents(a.balance))) + (a.balance > 0 ? " owed" : " credit") : usd(cents(a.balance))}</span></div>`).join("")}</div></details>` : ""}
    <div class="sc-bar qb-tabs"><div class="sc-seg">${tabs.map(([k, l, c]) => `<button data-qt="${k}" class="${tab === k ? "on" : ""}">${l} <span>${c}</span></button>`).join("")}</div></div>
    <div id="qbBody"></div>`;
  v.appendChild(card);
  card.querySelector("#qbSync").onclick = e => qbSyncNow(e.currentTarget);
  card.querySelector("#qbSet").onclick = qbSettingsSheet;
  card.querySelectorAll("[data-qt]").forEach(b => b.onclick = () => { S.ui.qbTab = b.dataset.qt; persistUi(); render(); });
  const body = card.querySelector("#qbBody");
  const txRow = ({p, t, r}, actionsHTML, extra) => `<tr data-k="${p.id}|${t.id}"><td class="nw muted">${esc(qbFmtDate(t.date))}</td><td>${esc(p.name)}</td>
      <td><div class="item-t">${esc(t.vendor || "—")}</div><div class="item-s">${esc(t.desc || "")}</div>${extra ? `<div class="qb-why">${extra}</div>` : ""}</td>
      <td class="r num">${usd(cents(t.amount))}</td><td class="r nw">${actionsHTML}</td></tr>`;
  const wire = () => {
    body.querySelectorAll("[data-find]").forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.find.split("|"), p = live().find(x => x.id === pid); qbPickSheet(p, p.transactions.find(t => t.id === tid)); });
    body.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.open.split("|"); go("txns", pid); setTimeout(() => openSheet(tid), 40); });
    body.querySelectorAll("[data-skip]").forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.skip.split("|"), p = live().find(x => x.id === pid); qbSkipTxn(p, p.transactions.find(t => t.id === tid)); toast("Marked not a QuickBooks expense"); });
    body.querySelectorAll("[data-unskip]").forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.unskip.split("|"), p = live().find(x => x.id === pid); qbUnskip(p, p.transactions.find(t => t.id === tid)); });
    body.querySelectorAll("[data-unmatch]").forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.unmatch.split("|"), p = live().find(x => x.id === pid); qbUnmatch(p, p.transactions.find(t => t.id === tid)); toast("Unmatched — it's under Not in QuickBooks now", true); });
    body.querySelectorAll("[data-rematch]").forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.rematch.split("|"), p = live().find(x => x.id === pid); qbRematch(p, p.transactions.find(t => t.id === tid)); });
    body.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => { (S.ui.qbPin = S.ui.qbPin || {})[b.dataset.edit] = Date.now(); S.ui.qbFocus = b.dataset.edit; S.ui.qbTab = "fix"; S.ui.qbFixF = "all"; persistUi(); render(); });
    body.querySelectorAll("[data-unlink]").forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.unlink.split("|"), p = live().find(x => x.id === pid); qbUnlink(p, p.transactions.find(t => t.id === tid)); toast("Unlinked"); });
    body.querySelectorAll("[data-yes]").forEach(b => b.onclick = () => { const [pid, tid] = b.dataset.yes.split("|"), p = live().find(x => x.id === pid), t = p.transactions.find(y => y.id === tid), r = m.res.get(b.dataset.yes); qbLink(p, t, r.units.map(u => u.k), "suggested"); toast("Linked", true); });
  };
  if(tab === "none" || tab === "partial" || tab === "matched" || tab === "skip"){
    const st = tab === "none" ? ["none", "gone"] : [tab];
    const list = rows.filter(x => st.includes(x.r.state));
    if(!list.length){ body.innerHTML = `<div class="empty"><b>${{none:"Every project expense is in QuickBooks", partial:"Nothing needs a look", matched:"Nothing matched yet", skip:"Nothing marked"}[tab]}</b></div>`; return; }
    body.innerHTML = `<table class="tbl qb-tbl"><thead><tr><th>Date</th><th>Property</th><th>Expense</th><th class="r">Amount</th><th></th></tr></thead><tbody>${list.slice(0, 300).map(x => {
      const k = x.p.id + "|" + x.t.id;
      if(tab === "matched") return txRow(x, `${x.r.units.some(u => u.line || u.qt.lines.length === 1) ? `<button class="btn sm" data-edit="${k}" title="Change the category or customer on the QuickBooks side">Change in QB</button>` : ""}<button class="btn sm ghost" data-unmatch="${k}" title="These aren't the same expense">Unmatch</button><button class="btn sm ghost" data-open="${k}">›</button>`,
        `<span class="tag green">${{auto:"Matched", lines:"Lines of one bill", manual:"Linked", confirmed:"Confirmed"}[x.r.how] || "Matched"}</span> ${esc(x.r.units.map(u => (u.line ? "line of " : "") + qbRecLabel(u.qt) + (x.r.units.length > 1 || x.r.how === "group" ? " · " + usd(Math.abs(u.c)) : "")).join(" + "))}${x.r.how === "group" ? ` <span class="muted">with ${x.r.peers.length - 1} other expense${x.r.peers.length === 2 ? "" : "s"} here</span>` : ""}`);
      if(tab === "skip") return txRow(x, x.t.qbSkip ? `<button class="btn sm ghost" data-unskip="${k}">Check it again</button>` : "", `<span class="muted">${esc(x.r.why)}</span>`);
      if(tab === "partial") return txRow(x, `<button class="btn sm primary" data-yes="${k}">That's it</button><button class="btn sm" data-find="${k}">Other…</button>`, esc(x.r.why));
      return txRow(x, `${x.r.unmatched ? `<button class="btn sm ghost" data-rematch="${k}" title="Let it match automatically again">Undo unmatch</button>` : ""}<button class="btn sm" data-find="${k}">Find in QuickBooks</button><button class="btn sm ghost" data-skip="${k}" title="Inventory, PHD's own charges and the like">Not a QB expense</button><button class="btn sm ghost" data-open="${k}">›</button>`, esc(x.r.why));
    }).join("")}</tbody></table>`;
    wire(); return;
  }
  if(tab === "missing"){
    const list = m.missing.slice().sort((a, b) => b.qt.date.localeCompare(a.qt.date));
    if(!list.length){ body.innerHTML = `<div class="empty"><b>Every project cost in QuickBooks is in the console</b></div>`; return; }
    body.innerHTML = `<p class="help" style="margin:0 0 8px">Lines in QuickBooks under a project category or a project's customer that no expense here accounts for. Add the ones that belong to a project; mark the rest.</p>
      <table class="tbl qb-tbl"><thead><tr><th>Date</th><th>QuickBooks</th><th>Project</th><th class="r">Amount</th><th></th></tr></thead><tbody>${list.slice(0, 300).map((x, i) => `<tr><td class="nw muted">${esc(qbFmtDate(x.qt.date))}</td>
      <td><div class="item-t">${esc(x.qt.vendor ? x.qt.vendor.name : "—")}</div><div class="item-s">${esc((x.l.desc || x.qt.memo || "").slice(0, 110))}</div><div class="qb-why">${esc(qbLineLabel(x.l))} · ${esc(x.qt.from ? x.qt.from.name : x.qt.type)}</div></td>
      <td>${x.p ? esc(x.p.name) : `<span class="muted">?</span>`}</td><td class="r num">${usd(x.c)}</td>
      <td class="r nw"><button class="btn sm primary" data-add="${i}">Add here</button><button class="btn sm ghost" data-ign="${i}">Not a project cost</button></td></tr>`).join("")}</tbody></table>`;
    body.querySelectorAll("[data-add]").forEach(b => b.onclick = () => qbAddSheet(list[+b.dataset.add]));
    body.querySelectorAll("[data-ign]").forEach(b => b.onclick = () => { snapshot(); qbSet().ignore[list[+b.dataset.ign].k] = 1; commit(); render(); });
    return;
  }
  qbFixTab(body, m);

}

/* ---------- Fix in QuickBooks: one list, every row editable ----------
   Rows are project costs with the wrong category or customer, and lines sitting in Ask Client / Uncategorized.
   Each row starts on the suggestion; change the category or customer right there. Ticked rows go out on Update.
   S.ui.qbSel[k]  ticked (true/false; unset = the suggestion's own tick)
   S.ui.qbEdit[k] {account?, customer?} what you picked instead of the suggestion */
function qbFixTab(body, m){
  const sel = S.ui.qbSel || (S.ui.qbSel = {}), ed = S.ui.qbEdit || (S.ui.qbEdit = {});
  // older saved picks for uncategorized lines
  if(S.ui.qbUncat){ Object.entries(S.ui.qbUncat).forEach(([k, a]) => { if(a){ ed[k] = Object.assign(ed[k] || {}, {account:a}); sel[k] = true; } }); delete S.ui.qbUncat; }
  const accts = S.qbo.accounts || [];
  const exp = accts.filter(a => /expense|cost of goods/i.test(a.type) && !QB_UNCAT.test(a.name)).sort((a, b) => a.name.localeCompare(b.name));
  const groupsOf = list => { const g = {}; list.forEach(a => { const top = a.name.includes(":") ? a.name.split(":")[0] : "Other"; (g[top] = g[top] || []).push(a); }); return g; };
  const projCusts = [...new Set(live().map(p => qbCustFor(p)).filter(Boolean))].map(id => qbCust(id)).filter(Boolean);
  // matched expenses opened from the Matched tab with "Change in QB": their QuickBooks lines, as they are, ready to edit
  const pins = S.ui.qbPin || {}, extra = [];
  Object.keys(pins).forEach(pk => {
    const r = m.res.get(pk); if(!r || r.state !== "matched" || !r.units){ delete pins[pk]; return; }
    // opened before the last update to QuickBooks and nothing picked for it since: done with it
    const applied = S.qbo.appliedAt ? Date.parse(S.qbo.appliedAt) : 0;
    if(applied && (+pins[pk] || 0) < applied && !r.units.some(u => ed[qbKey(u.qt.type, u.qt.id, (u.line || u.qt.lines[0] || {}).id)])){ delete pins[pk]; return; }
    const [pid, tid] = pk.split("|"), p = live().find(x => x.id === pid), t = p && p.transactions.find(y => y.id === tid); if(!t) return;
    r.units.forEach(u => {
      const l = u.line || (u.qt.lines.length === 1 ? u.qt.lines[0] : null); if(!l) return;
      const k = qbKey(u.qt.type, u.qt.id, l.id); if(m.fixes.some(f => f.k === k) || m.uncats.some(f => f.k === k) || extra.some(f => f.k === k)) return;
      const vend = t.vendor || (u.qt.vendor ? u.qt.vendor.name : ""), labor = !QB_STORES.test(qbVk(vend));
      extra.push({k, qt:u.qt, l, p, t, want:{}, pin:pk, labor, bigLab:labor && Math.abs(cents(l.amount)) >= qbLabMin(), sure:false, odd:!QB_OK_CLASS.has(qbLineClass(l)), why:"Opened from Matched — pick a different category or customer to tick it"});
    });
  });
  const rows = m.fixes.concat(m.uncats, extra).map(f => {
    const vend = (f.t && f.t.vendor) || (f.qt.vendor ? f.qt.vendor.name : "") || "";
    return Object.assign({}, f, {vend, vk:qbVk(vend), cur:{account:f.l.account ? f.l.account.id : "", customer:f.l.customer ? f.l.customer.id : ""}, amt:cents(f.l.amount),
      pk:f.pin || (f.p && f.t ? f.p.id + "|" + f.t.id : ""),
      grp:f.uncat ? (f.p ? f.p.name : "Uncategorized, no project") : f.p ? f.p.name : "Several properties"});
  });
  const pick = (r, f) => { const e = ed[r.k] || {}; return e[f] !== undefined ? e[f] : r.want[f] !== undefined ? r.want[f] : r.cur[f]; };
  const changed = r => pick(r, "account") !== r.cur.account || pick(r, "customer") !== r.cur.customer;
  const ticked = r => changed(r) && (sel[r.k] != null ? sel[r.k] : r.sure);
  const maintBad = r => r.bigLab && qbIsMaint((qbAcct(pick(r, "account")) || {}).name);
  const filters = [["all", "All", () => true], ["on", "Ticked", ticked], ["labor", "Labor", r => r.labor], ["mat", "Materials", r => !r.labor], ["uncat", "Uncategorized", r => r.uncat], ["check", "Check first", r => r.odd || maintBad(r)]];
  const acctOpts = (r, full) => {
    const now = pick(r, "account"), o = [];
    const opt = (id, label, title) => `<option value="${id}" ${id === now ? "selected" : ""} ${title ? `title="${esc(title)}"` : ""}>${esc(label)}</option>`;
    if(!full){                       // light until opened: just the choice, the suggestion and what it is now
      const ids = [...new Set([now, r.want.account, r.cur.account].filter(Boolean))];
      return ids.map(id => { const a = qbAcct(id); return opt(id, (id === r.cur.account ? "Now: " : id === r.want.account ? "Suggested: " : "") + qbShort(a ? a.name : id), a && a.name); }).join("");
    }
    if(r.want.account && qbAcct(r.want.account)) o.push(`<optgroup label="Suggested">${opt(r.want.account, qbShort(qbAcct(r.want.account).name), qbAcct(r.want.account).name)}</optgroup>`);
    if(r.cur.account && qbAcct(r.cur.account) && r.cur.account !== r.want.account){ const ca = qbAcct(r.cur.account), no = r.bigLab && qbIsMaint(ca.name);
      o.push(`<optgroup label="Leave as is">${no ? `<option value="${ca.id}" disabled title="${esc(ca.name)}">${esc(qbShort(ca.name))} (not for labor this size)</option>` : opt(ca.id, qbShort(ca.name), ca.name)}</optgroup>`); }
    const ia = typeof invAcctId === "function" ? invAcctId() : "";
    if(ia && qbAcct(ia) && ia !== r.want.account && ia !== r.cur.account && !r.bigLab) o.push(`<optgroup label="PHD inventory (bulk buys)">${opt(ia, qbShort(qbAcct(ia).name), qbAcct(ia).name)}</optgroup>`);
    const g = groupsOf(exp), order = Object.keys(g).sort((a, b) => (b === "Project Management") - (a === "Project Management") || a.localeCompare(b));
    order.forEach(top => o.push(`<optgroup label="${esc(top)}">${g[top].map(a => `<option value="${a.id}" title="${esc(a.name)}" ${r.bigLab && qbIsMaint(a.name) ? "disabled" : ""}>${esc(a.name.includes(":") ? a.name.split(":").slice(1).join(" › ") : a.name)}${r.bigLab && qbIsMaint(a.name) ? " (not for labor this size)" : ""}</option>`).join("")}</optgroup>`));
    return o.join("");
  };
  const ownerCusts = [...new Set(live().map(qbOwnerCust).filter(Boolean))].map(qbCust).filter(Boolean);
  const allCusts = (S.qbo.customers || []).slice().sort((a, b) => String(a.full || a.name).localeCompare(String(b.full || b.name)));
  const custOpts = (r, full) => {
    const now = pick(r, "customer"), mine = r.p ? [qbCustFor(r.p), qbOwnerCust(r.p)].filter(Boolean) : [];
    const ids = [...new Set([now, r.want.customer, r.cur.customer].concat(mine).filter(Boolean))];
    const o1 = c => `<option value="${c.id}" ${c.id === now ? "selected" : ""}>${esc(c.full || c.name)}${c.id === r.cur.customer && c.id !== r.want.customer ? " (now)" : ""}${r.p && c.id === qbOwnerCust(r.p) && c.id !== qbCustFor(r.p) ? " (owner)" : ""}</option>`;
    let h = `<option value="" ${!now ? "selected" : ""}>No customer</option>`;
    if(!full) return h + ids.map(qbCust).filter(Boolean).map(o1).join("");
    const seen = new Set(ids), grp = (label, list) => { const l = list.filter(c => !seen.has(c.id)); l.forEach(c => seen.add(c.id)); return l.length ? `<optgroup label="${label}">${l.map(o1).join("")}</optgroup>` : ""; };
    return h + `<optgroup label="${r.p ? esc(r.p.name) : "Suggested"}">${ids.map(qbCust).filter(Boolean).map(o1).join("")}</optgroup>` + grp("Projects", projCusts) + grp("Owners", ownerCusts) + grp("All customers", allCusts);
  };
  const similar = r => rows.filter(x => x !== r && x.vk && x.vk === r.vk && !(x.bigLab && qbIsMaint((qbAcct(pick(r, "account")) || {}).name)) && pick(x, "account") !== pick(r, "account"));
  const rowHTML = r => {
    const ch = changed(r), on = ticked(r), acc = pick(r, "account"), e = ed[r.k] || {};
    const sim = e.account !== undefined ? similar(r) : [];
    const curName = r.l.account ? r.l.account.name : r.l.item ? r.l.item.name : "—";
    return `<tr class="qbf ${on ? "on" : ""} ${ch ? "" : "same"} ${r.pin ? "pin" : ""} ${S.ui.qbFocus && S.ui.qbFocus === r.pk ? "focus" : ""}" data-k="${esc(r.k)}">
      <td class="qbf-ck"><input type="checkbox" data-ck ${on ? "checked" : ""} ${ch ? "" : "disabled"} aria-label="Change this line" ${ch ? "" : `title="Nothing to change yet — pick a different category or customer first"`}></td>
      <td class="qbf-what"><div class="item-t">${esc(r.vend || "—")} <span class="muted td-n">${esc(qbFmtDate(r.qt.date))}</span></div>
        <div class="item-s">${esc(((r.t && r.t.desc) || r.l.desc || r.qt.memo || "").slice(0, 90))}</div>
        ${(S.ui.qbErr || {})[r.qt.type + "/" + r.qt.id] ? `<div class="qbf-err">QuickBooks didn't take this: ${esc(S.ui.qbErr[r.qt.type + "/" + r.qt.id])}</div>` : ""}
        <div class="qbf-why">${r.odd ? `<span class="tag gold" title="This line sits in a liability, income or equity account in QuickBooks">check</span> ` : ""}${esc(r.why)}${r.pin ? ` · <a href="#" data-unpin>Take off this list</a>` : ""}${sim.length ? ` · <a href="#" data-sim>Same for ${sim.length} more from ${esc(r.vend)}</a>` : ""}</div></td>
      <td class="qbf-cat"><div class="qbf-now" title="${esc(curName)}">Now ${esc(qbShort(curName))}</div>
        <select data-acct class="${acc !== r.cur.account ? "chg" : ""} ${maintBad(r) ? "bad" : ""}" aria-label="Category">${acctOpts(r, false)}</select></td>
      <td class="qbf-cust"><div class="qbf-now">${r.l.customer ? "Now " + esc(qbShort(r.l.customer.name)) : "No customer now"}</div>
        <select data-cust class="${pick(r, "customer") !== r.cur.customer ? "chg" : ""}" aria-label="Customer">${custOpts(r)}</select></td>
      <td class="r num qbf-amt">${usd(r.amt)}</td></tr>`;
  };
  const draw = () => {
    const F = S.ui.qbFixF || "all";
    const f = (filters.find(x => x[0] === F) || filters[0])[2];
    const list = rows.filter(f).sort((a, b) => (a.uncat - b.uncat) || a.grp.localeCompare(b.grp) || b.qt.date.localeCompare(a.qt.date));
    const groups = []; list.forEach(r => { let g = groups.find(x => x.name === r.grp); if(!g) groups.push(g = {name:r.grp, rows:[]}); g.rows.push(r); });
    if(!rows.length){ body.innerHTML = `<div class="empty"><b>Nothing to fix in QuickBooks</b><p>Project costs there have the right category and customer.</p></div>`; return; }
    const L = S.ui.qbLast, errN = Object.keys(S.ui.qbErr || {}).length;
    const banner = L && (L.bad || L.error) ? `<div class="qbf-msg bad"><b>Last update ${esc(qbAgo(L.at))}: ${L.ok} record${L.ok === 1 ? "" : "s"} changed, ${L.bad} didn't.</b> ${L.error ? esc(L.error) : `The reason is on each red row${errN ? "" : ""}. Fix what it says, or press Update again.`} <a href="#" id="qbfClr">Dismiss</a></div>`
      : L && L.ok ? `<div class="qbf-msg"><b>Last update ${esc(qbAgo(L.at))}: ${L.ok} record${L.ok === 1 ? "" : "s"} changed in QuickBooks.</b> <a href="#" id="qbfClr">Dismiss</a></div>` : "";
    body.innerHTML = banner + `<div class="qbf-top"><div class="sc-seg qbf-f">${filters.map(([k, l, fn]) => `<button data-f="${k}" class="${F === k ? "on" : ""}">${l} <span>${rows.filter(fn).length}</span></button>`).join("")}</div>
        <span class="help" style="margin:0">Ticked rows change when you press Update. Pick a different category or customer on any row.</span></div>
      ${groups.length ? `<table class="tbl qb-tbl qbf-tbl"><thead><tr><th></th><th>QuickBooks</th><th>Category</th><th>Customer</th><th class="r">Amount</th></tr></thead>
      ${groups.map((g, gi) => { const live_ = g.rows.filter(changed), n = live_.filter(ticked).length;
        return `<tbody><tr class="qbf-g"><td><input type="checkbox" data-g="${gi}" ${n && n === live_.length ? "checked" : ""} aria-label="Tick all in ${esc(g.name)}"></td><td colspan="3"><b>${esc(g.name)}</b> <span class="muted">${g.rows.length} line${g.rows.length === 1 ? "" : "s"}${n ? ` · ${n} ticked` : ""}</span></td><td class="r num muted">${usd(g.rows.reduce((s, r) => s + r.amt, 0))}</td></tr>
        ${g.rows.map(rowHTML).join("")}</tbody>`; }).join("")}</table>` : `<div class="empty"><b>Nothing here</b><p>Try another filter.</p></div>`}
      <div class="qbf-bar"><span class="qbf-n" id="qbfN"></span>
        <label class="qbf-bulk">Set ticked to <select id="qbfBulk"><option value="">category…</option></select></label>
        <button class="btn sm ghost" id="qbfNone">Untick all</button>
        <button class="btn primary" id="qbApply">Update in QuickBooks</button></div>`;
    const rowOf = el => rows.find(r => r.k === el.closest("tr").dataset.k);
    const refreshRow = r => { const tr = body.querySelector(`tr[data-k="${CSS.escape(r.k)}"]`); if(!tr) return; tr.outerHTML = rowHTML(r); wireRow(body.querySelector(`tr[data-k="${CSS.escape(r.k)}"]`)); bar(); };
    const fill = s => { if(s.dataset.full) return; const r = rowOf(s); s.innerHTML = acctOpts(r, true); s.dataset.full = 1; };
    const wireRow = tr => {
      const ck = tr.querySelector("[data-ck]"); ck.onchange = () => { const r = rowOf(ck); sel[r.k] = ck.checked; tr.classList.toggle("on", ck.checked); bar(); };
      const sa = tr.querySelector("[data-acct]"); sa.onmousedown = sa.onfocus = sa.onkeydown = () => fill(sa);
      sa.onchange = () => { const r = rowOf(sa); ed[r.k] = Object.assign(ed[r.k] || {}, {account:sa.value}); sel[r.k] = true; refreshRow(r); };
      const sc = tr.querySelector("[data-cust]"); sc.onmousedown = sc.onfocus = sc.onkeydown = () => { if(sc.dataset.full) return; sc.innerHTML = custOpts(rowOf(sc), true); sc.dataset.full = 1; };
      sc.onchange = () => { const r = rowOf(sc); ed[r.k] = Object.assign(ed[r.k] || {}, {customer:sc.value}); sel[r.k] = true; refreshRow(r); };
      const up = tr.querySelector("[data-unpin]"); if(up) up.onclick = e => { e.preventDefault(); const r = rowOf(up); delete pins[r.pin]; delete sel[r.k]; delete ed[r.k]; persistUi(); draw(); };
      const sm = tr.querySelector("[data-sim]"); if(sm) sm.onclick = e => { e.preventDefault(); const r = rowOf(sm), a = pick(r, "account"); similar(r).forEach(x => { ed[x.k] = Object.assign(ed[x.k] || {}, {account:a}); sel[x.k] = true; }); draw(); toast(`Set ${qbShort((qbAcct(a) || {}).name)} for ${r.vend}`); };
    };
    body.querySelectorAll("tr.qbf").forEach(wireRow);
    body.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ui.qbFixF = b.dataset.f; draw(); });
    body.querySelectorAll("[data-g]").forEach(cb => cb.onchange = () => { groups[+cb.dataset.g].rows.filter(changed).forEach(r => sel[r.k] = cb.checked); draw(); });
    const bulk = body.querySelector("#qbfBulk");
    bulk.onmousedown = bulk.onfocus = () => { if(bulk.dataset.full) return; const g = groupsOf(exp); const ia = typeof invAcctId === "function" ? invAcctId() : ""; bulk.innerHTML = `<option value="">category…</option>` + (ia && qbAcct(ia) ? `<optgroup label="PHD inventory"><option value="${ia}">${esc(qbShort(qbAcct(ia).name))}</option></optgroup>` : "") + Object.keys(g).sort((a, b) => (b === "Project Management") - (a === "Project Management") || a.localeCompare(b)).map(top => `<optgroup label="${esc(top)}">${g[top].map(a => `<option value="${a.id}">${esc(qbShort(a.name))}</option>`).join("")}</optgroup>`).join(""); bulk.dataset.full = 1; };
    bulk.onchange = () => { const a = bulk.value; if(!a) return; let n = 0, skipped = 0;
      rows.filter(ticked).forEach(r => { if(r.bigLab && qbIsMaint((qbAcct(a) || {}).name)){ skipped++; return; } ed[r.k] = Object.assign(ed[r.k] || {}, {account:a}); n++; });
      draw(); toast(`${n} set to ${qbShort((qbAcct(a) || {}).name)}${skipped ? ` · ${skipped} labor over ${qbUsd0(qbLabMin())} left as is` : ""}`); };
    body.querySelector("#qbfNone").onclick = () => { rows.forEach(r => sel[r.k] = false); draw(); };
    body.querySelector("#qbApply").onclick = apply;
    const fo = body.querySelector("tr.qbf.focus"); if(fo){ S.ui.qbFocus = null; setTimeout(() => { fo.scrollIntoView({block:"center"}); const sc = fo.querySelector("[data-cust]"); if(sc) sc.focus(); }, 30); }
    const clr = body.querySelector("#qbfClr"); if(clr) clr.onclick = e => { e.preventDefault(); S.ui.qbLast = null; S.ui.qbErr = {}; persistUi(); draw(); };
    bar();
  };
  const bar = () => {
    const on = rows.filter(ticked), el = body.querySelector("#qbfN"), ap = body.querySelector("#qbApply");
    if(el) el.innerHTML = on.length ? `<b>${on.length}</b> line${on.length === 1 ? "" : "s"} · ${usd(on.reduce((s, r) => s + r.amt, 0))}${(g => g > 1 ? ` <span class="muted">in ${g} groups</span>` : "")(new Set(on.map(r => r.grp)).size)}` : `<span class="muted">Nothing ticked</span>`;
    if(ap) ap.disabled = !on.length;
    body.querySelectorAll("[data-g]").forEach(cb => { const tb = cb.closest("tbody"), cks = [...tb.querySelectorAll("[data-ck]:not(:disabled)")]; cb.checked = cks.length && cks.every(c => c.checked); cb.indeterminate = !cb.checked && cks.some(c => c.checked); });
  };
  const apply = async () => {
    const on = rows.filter(ticked);
    if(!on.length) return toast("Tick at least one");
    const bad = on.filter(maintBad); if(bad.length) return toast(`${bad.length} labor line${bad.length === 1 ? "" : "s"} over ${qbUsd0(qbLabMin())} still on Maintenance Cost — pick Labor / Subcontractors`);
    const changes = on.map(r => { const c = {type:r.qt.type, id:r.qt.id, line:r.l.id, expectAmount:r.l.amount}, a = pick(r, "account"), cu = pick(r, "customer");
      if(a !== r.cur.account) c.account = a; if(cu !== r.cur.customer) c.customer = cu; return c; });
    const byG = {}; on.forEach(r => byG[r.grp] = (byG[r.grp] || 0) + 1);
    if(!confirm(`Change ${changes.length} line${changes.length === 1 ? "" : "s"} (${usd(on.reduce((s, r) => s + r.amt, 0))}) in QuickBooks:\n${Object.entries(byG).map(([g, n]) => `  ${g}: ${n}`).join("\n")}\n\nCompany: ${S.qbo.company || "your company"}\n\nOnly the category and customer on those lines change. Nothing is created, deleted or paid.`)) return;
    const ap = body.querySelector("#qbApply"); ap.disabled = true; ap.textContent = "Updating…";
    try{
      const r = await qbCall("apply", {changes});
      const okKeys = new Set((r.results || []).filter(x => x.ok).map(x => x.type + "/" + x.id));
      // remember the categories you chose by vendor, so the next ones from them come pre-filled
      const learn = on.filter(x => okKeys.has(x.qt.type + "/" + x.qt.id) && x.vk && x.vk.length >= 3 && (ed[x.k] || {}).account);
      if(learn.length){ snapshot(); const q = qbSet(); q.rules = q.rules || {}; learn.forEach(x => q.rules[x.vk] = ed[x.k].account); commit(); }
      const fail = (r.results || []).filter(x => !x.ok), failKeys = new Set(fail.map(x => x.type + "/" + x.id));
      // lines that went through start fresh; the ones that didn't keep their ticks and picks, with the reason on the row
      on.forEach(x => { if(!failKeys.has(x.qt.type + "/" + x.qt.id)){ delete sel[x.k]; delete ed[x.k]; if(x.pin) delete pins[x.pin]; if(x.pk) delete pins[x.pk]; } });
      S.ui.qbErr = {}; fail.forEach(x => S.ui.qbErr[x.type + "/" + x.id] = x.error || "QuickBooks didn't take it");
      S.ui.qbLast = {at:new Date().toISOString(), ok:r.changed || 0, bad:fail.length};
      if(r.changed) await qbFetchSnapshot();
      toast(fail.length ? `${r.changed || 0} updated · ${fail.length} didn't go through — see the rows marked in red` : `Updated ${r.changed} in QuickBooks`);
    }catch(e){ S.ui.qbLast = {at:new Date().toISOString(), ok:0, bad:on.length, error:e.message}; toast(e.message); }
    persistUi(); render();
  };
  draw();
}

/* =====================================================================
   INVENTORY — what PHD buys in bulk (Costco, Lowe's…) and hands out to projects.
   S.acct.inv  (shared with the team, in the accounting doc)
     items: [{id, store, name, bought, paid, tax, retail, charge, adj, note, created, by, qb:[lineKey…]}]
        bought  how many were bought            paid    price paid each, before tax
        tax     sales tax % (9 = 9%)            retail  shelf price each, for reference
        charge  what an owner is billed each    adj     used or lost outside the console (counts against what's left)
        qb      QuickBooks lines the purchase came from ("Purchase/123#1")
     acct:  the QuickBooks account bulk purchases go to (default: the Inventory asset account)
   Using an item on a project adds a transaction there — vendor "PHD Inventory",
   "<item> × <qty>", qty × owner charge — carrying t.inv = {item, qty, each, cost}.
   How many are left is always bought − adj − what those transactions use, so
   deleting the transaction puts the items back.
   ===================================================================== */
ICON_PATHS.box = '<path d="M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11z"/><path d="M2.5 5 8 7.5 13.5 5M8 7.5v6"/>';
const INV_VENDOR = "PHD Inventory";
function invSet(){ S.acct = S.acct || {}; S.acct.inv = S.acct.inv || {}; const v = S.acct.inv; v.items = v.items || []; return v; }
function invItems(){ return (S.acct && S.acct.inv && S.acct.inv.items) || []; }
const invCostEach = it => Math.round(cents(it.paid || 0) * (1 + (+it.tax || 0) / 100));          // cents, tax in
function invUses(){
  const out = [];
  (S.properties || []).forEach(p => (p.transactions || []).forEach(t => { if(t.inv && t.inv.item) out.push({p, t, qty:+t.inv.qty || 0}); }));
  return out;
}
function invLeft(it, uses){
  const used = (uses || invUses()).filter(u => u.t.inv.item === it.id).reduce((a, u) => a + u.qty, 0);
  return (+it.bought || 0) - (+it.adj || 0) - used;
}
function invAcctId(){
  const set = S.acct && S.acct.inv && S.acct.inv.acct; if(set) return set;
  const a = ((S.qbo && S.qbo.accounts) || []).find(a => a.sub === "Inventory") || ((S.qbo && S.qbo.accounts) || []).find(a => /inventory/i.test(a.name) && a.cls === "Asset");
  return a ? a.id : "";
}
const invLowCount = () => invItems().filter(it => { const l = invLeft(it); return l > 0 && l <= Math.max(1, Math.round((+it.bought || 0) * 0.15)); }).length;

/* ---------- the page ---------- */
function pgInventory(){
  const v = $("#view"), items = invItems(), uses = invUses(), f = S.ui.invF || "stock", q = (S.ui.invQ || "").toLowerCase();
  $("#pgCrumb").textContent = "Projects"; $("#pgTitle").textContent = "Inventory";
  $("#pgSub").textContent = "Bulk buys PHD keeps on hand, and what each project has used";
  actions([["Paste from a sheet", invImportSheet, "ghost"], ["Add item", () => invItemSheet(null), "primary"]]);
  const rows = items.map(it => { const left = invLeft(it, uses), ce = invCostEach(it), ch = cents(it.charge || 0); return {it, left, ce, ch, val:Math.max(0, left) * ce, used:uses.filter(u => u.t.inv.item === it.id)}; });
  const onHand = rows.reduce((a, r) => a + r.val, 0);
  const billed = uses.reduce((a, u) => a + cents(u.t.amount), 0), costOut = uses.reduce((a, u) => a + (cents(u.t.inv.cost || 0)), 0);
  const hero = elm("div", "card pf-hero td-hero");
  hero.innerHTML = `<div class="pf-cell"><div class="label">On hand, at cost</div><div class="pf-v">${usd(onHand)}</div><div class="pf-note">${rows.filter(r => r.left > 0).length} item${rows.filter(r => r.left > 0).length === 1 ? "" : "s"} in stock</div></div>
    <div class="pf-cell"><div class="label">Billed to owners</div><div class="pf-v g">${usd(billed)}</div><div class="pf-note">${uses.length} use${uses.length === 1 ? "" : "s"} on projects</div></div>
    <div class="pf-cell"><div class="label">Margin on what's used</div><div class="pf-v">${usd(billed - costOut)}</div><div class="pf-note">owner charge less our cost</div></div>`;
  v.appendChild(hero);
  const bar = elm("div", "sc-bar");
  const fl = [["stock", "In stock", rows.filter(r => r.left > 0).length], ["out", "Used up", rows.filter(r => r.left <= 0).length], ["all", "All", rows.length], ["used", "Used on projects", uses.length]];
  bar.innerHTML = `<div class="sc-seg">${fl.map(([k, l, n]) => `<button data-f="${k}" class="${f === k ? "on" : ""}">${l} <span>${n}</span></button>`).join("")}</div>
    <input type="search" id="invQ" class="inv-q" placeholder="Find an item or store" value="${esc(S.ui.invQ || "")}">`;
  bar.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { S.ui.invF = b.dataset.f; persistUi(); render(); });
  const qi = bar.querySelector("#invQ"); qi.oninput = () => { S.ui.invQ = qi.value; clearTimeout(qi._t); qi._t = setTimeout(() => { render(); const n = $("#invQ"); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  v.appendChild(bar);
  if(f === "used"){ invUsedCard(v, uses, q); invQbCard(v); return; }
  const list = rows.filter(r => (f === "all" || (f === "stock" ? r.left > 0 : r.left <= 0)) && (!q || (r.it.name + " " + r.it.store).toLowerCase().includes(q)))
    .sort((a, b) => String(a.it.store).localeCompare(String(b.it.store)) || String(a.it.name).localeCompare(String(b.it.name)));
  const card = elm("div", "card inv-card");
  if(!items.length){
    card.innerHTML = `<div class="empty"><b>No inventory yet</b><p>Add what PHD keeps on hand, or paste it straight from your inventory sheet (Store, Item, Qty Bought, Qty Left, Paid Price Ea., Retail Price Ea., Tax %, Owner Charge Ea.).</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button class="btn primary" id="invE1">Paste from a sheet</button><button class="btn" id="invE2">Add item</button></div></div>`;
    v.appendChild(card); card.querySelector("#invE1").onclick = invImportSheet; card.querySelector("#invE2").onclick = () => invItemSheet(null);
    invQbCard(v); return;
  }
  card.innerHTML = list.length ? `<table class="tbl inv-tbl"><thead><tr><th>Item</th><th class="r">Left</th><th class="r">Our cost ea.</th><th class="r">Owner charge ea.</th><th class="r">Value left</th><th></th></tr></thead><tbody>
    ${list.map(r => { const b = +r.it.bought || 0, pct = b ? Math.max(0, Math.min(100, r.left / b * 100)) : 0, low = r.left > 0 && r.left <= Math.max(1, Math.round(b * 0.15));
      return `<tr data-id="${r.it.id}"><td><div class="item-t">${esc(r.it.name || "—")}</div><div class="item-s">${esc(r.it.store || "")}${r.it.paid ? ` · paid ${usd(cents(r.it.paid))}${r.it.tax ? ` + ${+r.it.tax}% tax` : ""}` : ""}${r.it.retail ? ` · retail ${usd(cents(r.it.retail))}` : ""}${r.used.length ? ` · on ${new Set(r.used.map(u => u.p.id)).size} project${new Set(r.used.map(u => u.p.id)).size === 1 ? "" : "s"}` : ""}</div></td>
        <td class="r nw"><span class="num ${r.left <= 0 ? "muted" : low ? "inv-low" : ""}"><b>${r.left}</b> of ${b}</span><div class="inv-bar"><i style="width:${pct}%" class="${low ? "low" : ""}"></i></div></td>
        <td class="r num">${usd(r.ce)}</td><td class="r num">${r.ch ? usd(r.ch) : `<span class="muted">set it</span>`}${r.ch && r.ce ? `<div class="item-s">${r.ch >= r.ce ? "+" : ""}${usd(r.ch - r.ce)}</div>` : ""}</td>
        <td class="r num">${usd(r.val)}</td>
        <td class="r nw">${r.left > 0 ? `<button class="btn sm primary" data-use="${r.it.id}">Use on a project</button>` : ""}<button class="btn sm ghost" data-edit="${r.it.id}">Edit</button></td></tr>`; }).join("")}
    </tbody></table>` : `<div class="empty"><b>Nothing here</b><p>${q ? "No item matches that search." : f === "out" ? "Nothing is used up." : "Everything is used up."}</p></div>`;
  v.appendChild(card);
  card.querySelectorAll("[data-use]").forEach(b => b.onclick = () => invUseSheet(items.find(x => x.id === b.dataset.use)));
  card.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => invItemSheet(items.find(x => x.id === b.dataset.edit)));
  invQbCard(v);
}
function invUsedCard(v, uses, q){
  const list = uses.filter(u => !q || (u.t.desc + " " + u.p.name).toLowerCase().includes(q)).sort((a, b) => String(b.t.date).localeCompare(String(a.t.date)));
  const card = elm("div", "card");
  card.innerHTML = list.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Property</th><th>Item</th><th class="r">Qty</th><th class="r">Billed</th><th class="r">Our cost</th><th></th></tr></thead><tbody>
    ${list.map((u, i) => `<tr><td class="nw muted">${esc(fdateS(u.t.date))}</td><td>${esc(u.p.name)}${u.p.archived ? ` <span class="muted">(archived)</span>` : ""}</td><td>${esc(u.t.desc || "")}</td><td class="r num">${u.qty}</td><td class="r num">${usd(cents(u.t.amount))}</td><td class="r num muted">${usd(cents(u.t.inv.cost || 0))}</td>
      <td class="r nw"><button class="btn sm ghost" data-open="${i}">›</button></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty"><b>Nothing used on a project yet</b><p>Press “Use on a project” on an item: it adds a PHD Inventory charge to that project's transactions.</p></div>`;
  v.appendChild(card);
  card.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { const u = list[+b.dataset.open]; go("txns", u.p.id); setTimeout(() => openSheet(u.t.id), 40); });
}
// QuickBooks: bulk buys sitting in the inventory account, and store charges not categorized yet
function invQbCard(v){
  if(typeof qbReady !== "function" || !qbReady()) return;
  const acct = invAcctId(), A = acct && qbAcct(acct);
  const inInv = [], waiting = [];
  S.qbo.txns.forEach(qt => qt.lines.forEach(l => {
    const k = qbKey(qt.type, qt.id, l.id), item = {k, qt, l, c:(qt.credit ? -1 : 1) * cents(l.amount)};
    if(acct && l.account && l.account.id === acct) inInv.push(item);
    else if(l.account && QB_UNCAT.test(l.account.name) && QB_STORES.test(qbVk(qt.vendor && qt.vendor.name)) && !l.customer) waiting.push(item);
  }));
  const linked = new Set(invItems().flatMap(it => it.qb || []));
  const card = elm("div", "card inv-qb");
  const row = (x, i, kind) => `<tr><td class="nw muted">${esc(qbFmtDate(x.qt.date))}</td><td><div class="item-t">${esc(x.qt.vendor ? x.qt.vendor.name : "—")}</div><div class="item-s">${esc((x.l.desc || x.qt.memo || "").slice(0, 80))}${x.qt.from ? " · " + esc(x.qt.from.name) : ""}</div></td>
      <td class="r num">${usd(x.c)}</td><td class="r nw">${kind === "in" ? (linked.has(x.k) ? `<span class="tag green">Items added</span>` : `<button class="btn sm" data-add="${i}">Add its items</button>`) : `<label class="inv-ck"><input type="checkbox" data-w="${i}"> Inventory</label>`}</td></tr>`;
  card.innerHTML = `<div class="card-h"><h3>QuickBooks</h3><span class="muted td-n">${A ? "Bulk buys go to " + esc(A.name) : "No inventory account found in QuickBooks"}</span><button class="btn sm ghost" id="invAcct" style="margin-left:auto">Change account</button></div>
    ${waiting.length ? `<div class="card-b"><div class="sectl" style="margin-top:0">Store charges not categorized yet</div><p class="help" style="margin:0 0 8px">Tick the bulk buys for inventory and press the button — they move to ${A ? esc(qbShort(A.name)) : "the inventory account"} in QuickBooks. Project purchases are on Reconcile → Fix in QuickBooks.</p>
      <table class="tbl qb-tbl"><tbody>${waiting.sort((a, b) => b.qt.date.localeCompare(a.qt.date)).map((x, i) => row(x, i, "w")).join("")}</tbody></table>
      <div class="ch-acts"><button class="btn primary" id="invMove" disabled>Move to inventory in QuickBooks</button><span class="muted" id="invMoveN" style="font-size:12.5px"></span></div></div>` : ""}
    <div class="card-b"><div class="sectl" style="margin-top:0">In ${A ? esc(qbShort(A.name)) : "inventory"} in QuickBooks <span class="muted">${usd(inInv.reduce((a, x) => a + x.c, 0))}</span></div>
      ${inInv.length ? `<table class="tbl qb-tbl"><tbody>${inInv.sort((a, b) => b.qt.date.localeCompare(a.qt.date)).map((x, i) => row(x, i, "in")).join("")}</tbody></table>` : `<p class="muted" style="margin:0">Nothing in it yet.</p>`}</div>`;
  v.appendChild(card);
  card.querySelector("#invAcct").onclick = invAcctSheet;
  card.querySelectorAll("[data-add]").forEach(b => b.onclick = () => { const x = inInv.sort((a, b) => b.qt.date.localeCompare(a.qt.date))[+b.dataset.add]; invItemSheet(null, x); });
  const mv = card.querySelector("#invMove");
  if(mv){
    const sorted = waiting; const picked = () => [...card.querySelectorAll("[data-w]:checked")].map(c => sorted[+c.dataset.w]);
    card.querySelectorAll("[data-w]").forEach(c => c.onchange = () => { const p = picked(); mv.disabled = !p.length || !acct; card.querySelector("#invMoveN").textContent = p.length ? `${p.length} · ${usd(p.reduce((a, x) => a + x.c, 0))}` : ""; });
    mv.onclick = async () => {
      const p = picked(); if(!p.length || !acct) return;
      if(!confirm(`Move ${p.length} charge${p.length === 1 ? "" : "s"} (${usd(p.reduce((a, x) => a + x.c, 0))}) to ${A.name} in QuickBooks?\n\nOnly the category on those lines changes.`)) return;
      mv.disabled = true; mv.textContent = "Moving…";
      try{
        const r = await qbCall("apply", {changes:p.map(x => ({type:x.qt.type, id:x.qt.id, line:x.l.id, expectAmount:x.l.amount, account:acct}))});
        const bad = (r.results || []).filter(x => !x.ok);
        if(r.changed) await qbFetchSnapshot();
        toast(bad.length ? `${r.changed || 0} moved · ${bad.length} didn't: ${bad[0].error}` : `Moved ${r.changed} to inventory`);
      }catch(e){ toast(e.message); }
      render();
    };
  }
}
function invAcctSheet(){
  const accts = ((S.qbo && S.qbo.accounts) || []).filter(a => a.cls === "Asset" && !/^(Bank|Accounts Receivable)$/.test(a.type) || /inventory/i.test(a.name)).sort((a, b) => a.name.localeCompare(b.name));
  const sh = $("#sheet"), cur = invAcctId();
  sh.innerHTML = `<div class="sheet-h"><h3>Inventory account in QuickBooks</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><label class="fld"><span>Bulk buys for PHD's inventory go to</span><select id="invA">${accts.map(a => `<option value="${a.id}" ${a.id === cur ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
      <p class="help">An asset account: the purchase is something PHD owns until it goes into a project.</p></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="invAOk">Save</button></div>`;
  openPanel(); $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  $("#invAOk").onclick = () => { snapshot(); invSet().acct = $("#invA").value; commit(); closeSheet(); render(); };
}

/* ---------- add / edit an item ---------- */
function invItemSheet(it, fromQb){
  const isNew = !it; it = it || {store:fromQb && fromQb.qt.vendor ? fromQb.qt.vendor.name : "", tax:9};
  const uses = invUses().filter(u => u.t.inv.item === it.id);
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>${isNew ? "Add an inventory item" : esc(it.name)}</h3>${fromQb ? `<div class="muted" style="font-size:12.5px;margin-top:3px">From ${esc(qbRecLabel(fromQb.qt))} · ${usd(fromQb.c)}</div>` : ""}</div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="f2"><label class="fld"><span>Item</span><input type="text" id="iN" value="${esc(it.name || "")}" placeholder="e.g. GFCI Sconce"></label>
        <label class="fld"><span>Store</span><input type="text" id="iS" list="iSl" value="${esc(it.store || "")}"><datalist id="iSl">${[...new Set(invItems().map(x => x.store).filter(Boolean).concat(["Costco", "Lowe's", "Home Depot", "Amazon"]))].map(s => `<option value="${esc(s)}">`).join("")}</datalist></label></div>
      <div class="f3"><label class="fld"><span>Qty bought</span><input type="number" id="iB" min="0" step="1" value="${it.bought != null ? +it.bought : ""}"></label>
        <label class="fld"><span>Paid each (before tax)</span><input type="number" id="iP" min="0" step="0.01" value="${it.paid != null ? +it.paid : ""}"></label>
        <label class="fld"><span>Tax %</span><input type="number" id="iT" min="0" step="0.01" value="${it.tax != null ? +it.tax : 9}"></label></div>
      <div class="f3"><label class="fld"><span>Retail each</span><input type="number" id="iR" min="0" step="0.01" value="${it.retail != null ? +it.retail : ""}"></label>
        <label class="fld"><span>Owner charge each</span><input type="number" id="iC" min="0" step="0.01" value="${it.charge != null ? +it.charge : ""}"></label>
        <label class="fld"><span>Used outside the console</span><input type="number" id="iA" step="1" value="${+it.adj || 0}" title="Used, lost or broken without a project charge here"></label></div>
      <p class="help" id="iCalc" style="margin-top:0"></p>
      <label class="fld"><span>Note</span><input type="text" id="iNo" value="${esc(it.note || "")}" placeholder="Where it's kept, model number…"></label>
      ${uses.length ? `<div class="sectl">Used on projects</div><div class="inv-uses">${uses.map(u => `<div><span>${esc(fdateS(u.t.date))}</span><span>${esc(u.p.name)}</span><span class="num">${u.qty} · ${usd(cents(u.t.amount))}</span></div>`).join("")}</div>` : ""}
    </div>
    <div class="sheet-f">${!isNew ? `<button class="btn ghost" id="iDel" style="color:var(--red)">Delete</button>` : ""}<span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="iOk">${isNew ? "Add" : "Save"}</button></div>`;
  openPanel(); $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  const calc = () => { const t = {paid:+$("#iP").value || 0, tax:+$("#iT").value || 0}, ce = invCostEach(t), ch = cents(+$("#iC").value || 0), b = +$("#iB").value || 0;
    const left = b - (+$("#iA").value || 0) - uses.reduce((a, u) => a + u.qty, 0);
    $("#iCalc").innerHTML = ce ? `Our cost ${usd(ce)} each with tax${ch ? ` · owner charge is ${ch >= ce ? usd(ch - ce) + " over" : usd(ce - ch) + " under"} cost` : ""}${b ? ` · ${left} left · ${usd(Math.max(0, left) * ce)} on hand` : ""}` : ""; };
  ["iP", "iT", "iC", "iB", "iA"].forEach(id => $("#" + id).oninput = calc); calc();
  $("#iR").addEventListener("change", () => { if(!$("#iC").value && $("#iR").value) $("#iC").value = Math.ceil(+$("#iR").value); calc(); });
  if(!isNew) $("#iDel").onclick = () => {
    if(uses.length) return toast(`It's used on ${uses.length} project charge${uses.length === 1 ? "" : "s"} — delete those first, or set what's left to 0`);
    if(!confirm(`Delete ${it.name}?`)) return; snapshot(); const s = invSet(); s.items = s.items.filter(x => x.id !== it.id); commit(); closeSheet(); render();
  };
  $("#iOk").onclick = () => {
    const name = $("#iN").value.trim(); if(!name) return toast("Name the item");
    snapshot();
    const s = invSet(), rec = isNew ? {id:uid(), created:todayISO(), by:typeof qbWho === "function" ? qbWho() : "", qb:[]} : s.items.find(x => x.id === it.id);
    Object.assign(rec, {name, store:$("#iS").value.trim(), bought:+$("#iB").value || 0, paid:+$("#iP").value || 0, tax:+$("#iT").value || 0, retail:+$("#iR").value || 0, charge:+$("#iC").value || 0, adj:+$("#iA").value || 0, note:$("#iNo").value.trim()});
    if(fromQb && !(rec.qb || []).includes(fromQb.k)) (rec.qb = rec.qb || []).push(fromQb.k);
    if(isNew) s.items.push(rec);
    commit(); closeSheet(); render(); toast(isNew ? `Added ${name}` : "Saved", true);
  };
}

/* ---------- use on a project ---------- */
function invUseSheet(it){
  const ps = live().filter(p => !p.archived), left = invLeft(it), sh = $("#sheet");
  const last = S.ui.invLastP && ps.find(p => p.id === S.ui.invLastP) ? S.ui.invLastP : (P() && ps.find(p => p.id === P().id) ? P().id : (ps[0] || {}).id);
  sh.innerHTML = `<div class="sheet-h"><div><h3>Use ${esc(it.name)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${left} left · owner charge ${usd(cents(it.charge || 0))} each</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="f2"><label class="fld"><span>Project</span><select id="uP">${ps.map(p => `<option value="${p.id}" ${p.id === last ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
        <label class="fld"><span>Unit</span><select id="uU"></select></label></div>
      <div class="f3"><label class="fld"><span>How many</span><input type="number" id="uQ" min="1" max="${left}" step="1" value="1"></label>
        <label class="fld"><span>Each</span><input type="number" id="uE" min="0" step="0.01" value="${+it.charge || ""}"></label>
        <label class="fld"><span>Date</span><input type="date" id="uD" value="${todayISO()}"></label></div>
      <label class="fld inv-fee"><input type="checkbox" id="uF"> Add the project management fee on top</label>
      <p class="help" id="uSum" style="margin-top:4px"></p>
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="uOk">Add to project</button></div>`;
  openPanel(); $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  const fillU = () => { const p = ps.find(x => x.id === $("#uP").value); $("#uU").innerHTML = (p.units || []).map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join("") + ((p.units || []).length > 1 ? `<option value="split">Split evenly</option>` : ""); };
  const sum = () => { const q = Math.max(0, Math.floor(+$("#uQ").value || 0)), e = cents(+$("#uE").value || 0);
    $("#uSum").innerHTML = q ? `Adds <b>${esc(it.name)} × ${q}</b> · ${usd(q * e)} to the project, from ${INV_VENDOR}.${q > left ? ` <span style="color:var(--red)">Only ${left} left.</span>` : ` ${left - q} left after.`}${e && e < invCostEach(it) ? ` <span style="color:var(--gold)">Under our cost.</span>` : ""}` : ""; };
  fillU(); sum(); $("#uP").onchange = fillU; $("#uQ").oninput = $("#uE").oninput = sum;
  $("#uOk").onclick = () => {
    const p = ps.find(x => x.id === $("#uP").value), q = Math.floor(+$("#uQ").value || 0), each = +$("#uE").value || 0, uv = $("#uU").value;
    if(q < 1) return toast("How many?"); if(q > invLeft(it)) return toast(`Only ${invLeft(it)} left`);
    if(!each) return toast("Set what the owner pays each");
    let scope;
    if(uv === "split"){ const sp = {}, even = +(100 / p.units.length).toFixed(2); p.units.forEach((u, i) => sp[u.id] = i === p.units.length - 1 ? +(100 - even * (p.units.length - 1)).toFixed(2) : even); scope = {type:"split", unit:null, splits:sp}; }
    else scope = {type:"single", unit:uv, splits:{}};
    snapshot();
    const rec = {id:uid(), receipt:"", link:"", pin:null, party:"Owner", notes:"From PHD inventory", tags:[], reconciled:false, reconciledAt:"",
      date:$("#uD").value || todayISO(), vendor:INV_VENDOR, desc:`${it.name} × ${q}`, amount:Math.round(q * each * 100) / 100, scope, status:"billable", applyFee:$("#uF").checked, allowPartial:true,
      inv:{item:it.id, qty:q, each, cost:Math.round(q * invCostEach(it)) / 100}};
    if(typeof applyHoldRule === "function") applyHoldRule(rec, p);
    p.transactions.push(rec); S.ui.invLastP = p.id;
    commit(); closeSheet(); render(); toast(`Added to ${p.name} · ${invLeft(it)} ${it.name} left`, true);
  };
}

/* ---------- paste from a spreadsheet ---------- */
function invImportSheet(){
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><h3>Paste from your inventory sheet</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="help" style="margin-top:0">Copy the rows from the sheet, header row included, and paste them here. Columns it reads: Store, Item, Qty Bought, Qty Left, Paid Price Ea., Retail Price Ea., Tax %, Owner Charge Ea. Items already here (same store and name) are updated, not doubled.</p>
      <textarea id="imT" rows="10" class="inv-paste" placeholder="Store&#9;Item&#9;Qty Bought&#9;Qty Left&#9;Paid Price Ea.&#9;…"></textarea><div id="imP"></div></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="imOk" disabled>Add</button></div>`;
  openPanel(); $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  let parsed = [];
  const num = s => { const n = parseFloat(String(s || "").replace(/[$,%\s]/g, "")); return isNaN(n) ? null : n; };
  $("#imT").oninput = () => {
    const lines = $("#imT").value.split(/\r?\n/).filter(l => l.trim()), rows = lines.map(l => l.split(/\t|\s{2,}/).map(c => c.trim()));
    let head = rows[0] || [], body = rows.slice(1);
    const find = re => head.findIndex(h => re.test(h));
    let ix = {store:find(/^store/i), name:find(/^item|^name|^desc/i), bought:find(/bought|^qty$|quantity/i), left:find(/left|on hand|remain/i), paid:find(/paid|cost ea|price paid/i), retail:find(/retail/i), tax:find(/tax/i), charge:find(/owner|charge/i)};
    if(ix.name < 0){ body = rows; ix = {store:0, name:1, bought:2, left:3, paid:4, retail:5, tax:6, charge:8}; }      // no header: the sheet's column order
    if(ix.paid >= 0 && /our cost/i.test(head[ix.paid] || "")) ix.paid = find(/paid/i);
    parsed = body.map(r => { const g = k => ix[k] >= 0 ? r[ix[k]] : ""; const tax = num(g("tax")); return {store:g("store"), name:g("name"), bought:num(g("bought")) || 0, left:num(g("left")), paid:num(g("paid")) || 0, retail:num(g("retail")) || 0, tax:tax == null ? 9 : (tax < 1 && tax > 0 ? tax * 100 : tax), charge:num(g("charge")) || 0}; }).filter(x => x.name);
    $("#imP").innerHTML = parsed.length ? `<table class="tbl" style="margin-top:10px"><thead><tr><th>Item</th><th class="r">Bought</th><th class="r">Left</th><th class="r">Paid</th><th class="r">Owner</th></tr></thead><tbody>${parsed.map(x => `<tr><td>${esc(x.name)} <span class="muted">${esc(x.store)}</span></td><td class="r num">${x.bought}</td><td class="r num">${x.left == null ? x.bought : x.left}</td><td class="r num">${usd(cents(x.paid))}</td><td class="r num">${usd(cents(x.charge))}</td></tr>`).join("")}</tbody></table>` : (lines.length ? `<p class="muted">Couldn't find an Item column.</p>` : "");
    $("#imOk").disabled = !parsed.length; $("#imOk").textContent = parsed.length ? `Add ${parsed.length} item${parsed.length === 1 ? "" : "s"}` : "Add";
  };
  $("#imOk").onclick = () => {
    snapshot(); const s = invSet(), uses = invUses(); let added = 0, updated = 0;
    parsed.forEach(x => {
      let rec = s.items.find(it => it.name.toLowerCase() === x.name.toLowerCase() && String(it.store || "").toLowerCase() === String(x.store || "").toLowerCase());
      if(!rec){ rec = {id:uid(), created:todayISO(), by:typeof qbWho === "function" ? qbWho() : "", qb:[]}; s.items.push(rec); added++; } else updated++;
      Object.assign(rec, {name:x.name, store:x.store, bought:x.bought, paid:x.paid, retail:x.retail, tax:x.tax, charge:x.charge});
      const used = uses.filter(u => u.t.inv.item === rec.id).reduce((a, u) => a + u.qty, 0);
      rec.adj = x.left == null ? (rec.adj || 0) : Math.max(0, x.bought - x.left - used);           // what the sheet says is gone beyond the console's own charges
    });
    commit(); closeSheet(); render(); toast(`${added} added${updated ? ` · ${updated} updated` : ""}`, true);
  };
}

/* =====================================================================
   ADD BILL BY UPLOAD — drop a vendor invoice or receipt (PDF or photo).
   It goes to the receipt inbox script, which reads it with Claude the
   same way it reads emailed receipts and files it in Drive. When the
   property and amount are clear, the bill is created right away;
   otherwise the bill form opens filled in for you to finish.
   ===================================================================== */
const BU = {files:[], kind:"topay", prop:"", busy:false};
const BU_TYPES = {"application/pdf":25, "image/jpeg":5, "image/png":5, "image/webp":5, "image/gif":5};   // MB limits

function billUploadSheet(files, keep){
  if(!keep) BU.files = BU.files.filter(f => f.state === "working" || f.state === "queued");
  const sh = $("#sheet"), conn = inboxConn();
  const props = pmLiveProps().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  const draw = () => {
    sh.innerHTML = `<div class="sheet-h"><div><h3>Add a bill</h3><div class="muted" style="font-size:12.5px;margin-top:3px">Upload the vendor's invoice — it's read and the bill is filled in for you</div></div>
        <button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
      <div class="sheet-b">
        ${conn ? "" : `<div class="pm-banner">Reading uploads uses the receipt inbox, which isn't connected yet. <button class="btn sm" id="buConn" style="margin-left:6px">Connect it</button></div>`}
        <div class="bu-seg sc-seg"><button data-k="topay" class="${BU.kind === "topay" ? "on" : ""}">Bills to pay</button><button data-k="paid" class="${BU.kind === "paid" ? "on" : ""}">Already paid (receipts)</button></div>
        <label class="bu-drop ${conn ? "" : "dis"}" id="buDrop">
          <input type="file" id="buFile" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" multiple ${conn ? "" : "disabled"}>
          ${icon("file")}<b>Drop invoices here or choose files</b><span>PDF, JPG or PNG · several at once is fine</span>
        </label>
        <label class="fld" style="margin-top:12px"><span>Property</span><select id="buProp"><option value="">Find it from the invoice</option>${props.map(p => `<option value="${p.id}" ${BU.prop === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
          <span class="help">Leave this to have the property read from the service address, job name or PO.</span></label>
        ${BU.files.length ? `<div class="sectl">Uploads</div><div class="bu-list">${BU.files.map((f, i) => buRow(f, i)).join("")}</div>` : ""}
      </div>
      <div class="sheet-f"><button class="btn ghost" id="buHand">Enter by hand</button><span style="flex:1"></span>
        ${BU.files.some(f => f.bill) ? `<button class="btn" id="buSee">See bills</button>` : ""}<button class="btn primary" id="shCancel">Done</button></div>`;
    $("#shClose").onclick = $("#shCancel").onclick = () => { closeSheet(); if(S.ui.view === "pmBills" || S.ui.view === "today") render(); };
    sh.querySelectorAll(".bu-seg [data-k]").forEach(b => b.onclick = () => { BU.kind = b.dataset.k; draw(); });
    const ps = sh.querySelector("#buProp"); ps.onchange = () => { BU.prop = ps.value; };
    const c = sh.querySelector("#buConn"); if(c) c.onclick = () => { closeSheet(); go("inbox"); };
    sh.querySelector("#buHand").onclick = () => billSheet(null, BU.prop ? {propertyId:BU.prop} : {});
    const see = sh.querySelector("#buSee"); if(see) see.onclick = () => { closeSheet(); S.ui.mode = "pm"; S.ui.billF = BU.kind === "paid" ? "paid" : "open"; go("pmBills"); };
    const inp = sh.querySelector("#buFile"); inp.onchange = () => { buAdd([...inp.files], draw); inp.value = ""; };
    const dz = sh.querySelector("#buDrop");
    dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = () => dz.classList.remove("over");
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); if(conn) buAdd([...e.dataTransfer.files], draw); };
    sh.querySelectorAll("[data-bu]").forEach(b => b.onclick = () => buAct(b.dataset.bu, Number(b.dataset.i), draw));
  };
  BU.redraw = draw;
  draw(); openPanel();
  if(files && files.length && conn) buAdd(files, draw);
}
function buRow(f, i){
  const it = f.item || {}, b = f.bill && billById(f.bill), p = b && pmProp(b.propertyId);
  const name = `<div class="bu-n">${esc(f.name)}</div>`;
  if(f.state === "working" || f.state === "queued") return `<div class="bu-r"><span class="bu-spin" aria-hidden="true"></span><div class="bu-t">${name}<span>${f.state === "queued" ? "Waiting…" : "Reading the invoice…"}</span></div></div>`;
  if(f.state === "done" && b) return `<div class="bu-r ok"><span class="bu-ic">✓</span><div class="bu-t"><b>${esc(b.vendor)} · ${usd(cents(b.amount))}</b><span>${esc(p ? p.name : "")}${b.due ? ` · due ${esc(fdateS(b.due))}` : ""}${b.status === "paid" ? " · paid" : " · to pay"}${b.billNo ? ` · #${esc(b.billNo)}` : ""}</span></div><button class="btn sm" data-bu="open" data-i="${i}">Open</button></div>`;
  if(f.state === "dupe") return `<div class="bu-r warn"><span class="bu-ic">!</span><div class="bu-t">${name}<span>${esc(f.msg)}</span></div>${f.dupeOf ? `<button class="btn sm ghost" data-bu="dupe" data-i="${i}">Open it</button>` : ""}${f.item ? `<button class="btn sm" data-bu="anyway" data-i="${i}">Add anyway</button>` : ""}</div>`;
  if(f.state === "finish") return `<div class="bu-r warn"><span class="bu-ic">…</span><div class="bu-t"><b>${esc(it.vendor || f.name)}${it.total ? " · " + usd(cents(it.total)) : ""}</b><span>${esc(f.msg)}</span></div><button class="btn sm primary" data-bu="finish" data-i="${i}">Finish</button></div>`;
  if(f.state === "inbox") return `<div class="bu-r warn"><span class="bu-ic">…</span><div class="bu-t"><b>${esc(it.vendor || f.name)}${it.total ? " · " + usd(cents(it.total)) : ""}</b><span>${esc(f.msg)}</span></div><button class="btn sm" data-bu="inbox" data-i="${i}">Receipt inbox</button></div>`;
  return `<div class="bu-r err"><span class="bu-ic">✕</span><div class="bu-t">${name}<span>${esc(f.msg || "Couldn't read it")}</span></div>${f.item && f.item.file_url ? `<button class="btn sm" data-bu="hand" data-i="${i}">Enter by hand</button>` : ""}</div>`;
}
function buAdd(files, draw){
  files.forEach(file => {
    const mime = (file.type || "").toLowerCase() === "image/jpg" ? "image/jpeg" : (file.type || "").toLowerCase();
    const f = {name:file.name, file, mime, kind:BU.kind, prop:BU.prop, state:"queued"};
    if(!BU_TYPES[mime]){ f.state = "error"; f.msg = "Upload a PDF, JPG or PNG"; }
    else if(file.size > BU_TYPES[mime] * 1024 * 1024){ f.state = "error"; f.msg = mime === "application/pdf" ? "PDF is over 25 MB" : "Photo is over 5 MB — use a smaller photo or a PDF"; }
    BU.files.push(f);
  });
  draw(); buPump();
}
async function buPump(){
  if(BU.busy) return; BU.busy = true;
  try{
    let f;
    while((f = BU.files.find(x => x.state === "queued"))){
      f.state = "working"; buRedraw();
      try{
        const data = await buBase64(f.file);
        const r = await inboxPost({action:"upload", name:f.name, mime:f.mime, data, kind:f.kind, by:billWho(), side:"pm"});
        f.item = r.item || null; delete f.file;
        buHandle(f, r.duplicate);
      }catch(e){ f.state = "error"; f.msg = /Failed to fetch|NetworkError/i.test(e.message) ? "Couldn't reach the receipt inbox. Check your connection and try again." : e.message; }
      buRedraw();
    }
  } finally { BU.busy = false; }
}
function buRedraw(){ if(BU.redraw && $("#sheet").classList.contains("on") && $("#buDrop")) BU.redraw(); }
function buBase64(file){
  return new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(",")[1] || ""); rd.onerror = () => rej(new Error("Couldn't read the file")); rd.readAsDataURL(file); });
}
// decide what to do with what was read
function buHandle(f, duplicate, force){
  const it = f.item;
  if(!it){ f.state = "dupe"; f.msg = "This exact file was uploaded or emailed before."; return; }
  const made = billList().find(b => b.inbox === it.id && b.status !== "void");
  if(made){ f.state = "dupe"; f.msg = "Already added as a bill."; f.dupeOf = made.id; f.item = null; return; }
  if(it.status === "error"){ f.state = "error"; f.msg = it.error || "Couldn't read it"; return; }
  if(it.status === "rejected" && !force){ f.state = "error"; f.msg = (it.error || "Didn't look like an invoice or receipt") + (it.file_url ? ". It's saved in Drive — enter it by hand if it's a bill." : ""); return; }
  if(it.is_credit){ f.state = "inbox"; f.msg = "This is a refund or credit — finish it in the receipt inbox."; return; }
  const pid = f.prop || (pmProp(it.property_id) ? it.property_id : "");
  const p = pid && pmProp(pid);
  if(!p){ f.state = "finish"; f.msg = it.property_name ? `Matched to ${it.property_name}, which isn't a managed rental — pick the property` : "Couldn't tell which property — pick it and save"; return; }
  if(!(Number(it.total) > 0)){ f.state = "finish"; f.msg = "Couldn't read the amount — check it and save"; return; }
  if(!force){
    const amtC = cents(it.total), dn = PMCore.dayNum(it.date || todayISO());
    const twin = billList().find(b => b.status !== "void" && b.propertyId === p.id && cents(b.amount) === amtC &&
      ((it.order_no && b.billNo && String(b.billNo).trim() === String(it.order_no).trim()) || (buVk(b.vendor) === buVk(it.vendor) && Math.abs(PMCore.dayNum(b.date || todayISO()) - dn) <= 20)));
    if(twin){ f.state = "dupe"; f.msg = `Looks like the ${twin.vendor} bill for ${usd(amtC)} you already have (${fdateS(twin.date)}).`; f.dupeOf = twin.id; return; }
  }
  f.bill = buCreate(f, p).id; f.state = "done";
}
const buVk = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^the/, "").slice(0, 8);
function buFileName(it, p, b){
  const ext = ((it.file_name || "").match(/\.[a-z0-9]{2,4}$/i) || [".pdf"])[0];
  return `${String(b.date || "").replace(/-/g, "")} - ${p.name} - ${b.memo || "Bill"} - ${b.vendor || ""}`.replace(/\s+-\s*$/, "") + ext;
}
function buPreset(it, f){
  const paid = f.kind === "paid";
  return {propertyId:f.prop || (pmProp(it.property_id) ? it.property_id : ""), vendor:it.vendor || "", amount:it.total || "", date:it.date || todayISO(), due:paid ? "" : (it.due_date || ""),
    memo:it.description || "", billNo:it.order_no || "", payNote:paid ? "" : (it.pay_note || ""), receipt:it.file_url ? {url:it.file_url, name:it.file_name || f.name} : null, source:"Upload", inbox:it.id,
    status:paid ? "paid" : "open", pay:paid ? {method:"Card / receipt", date:it.date || todayISO(), ref:"", by:billWho(), at:new Date().toISOString()} : null};
}
function buCreate(f, p){
  const it = f.item, pre = buPreset(it, f);
  pre.propertyId = p.id; pre.recover = p.ownerId ? ((S.ui.billLast || {}).recover && S.ui.billLast.recover !== "phd" ? S.ui.billLast.recover : "deduct") : "phd";
  if(pre.status === "paid") pre.deductMonth = typeof inboxPmMonth === "function" ? inboxPmMonth() : undefined;
  const b = billNew(pre);
  billSave(b, true);
  commit();
  billUploadDone(b);
  return b;
}
// tell the inbox sheet the receipt became a bill, and file it under the property in Drive
function billUploadDone(b){
  if(!b || !b.inbox) return;
  const p = pmProp(b.propertyId); if(!p) return;
  const fileName = b.receipt && b.receipt.url ? buFileName({file_name:b.receipt.name}, p, b) : "";
  if(fileName && b.receipt.name !== fileName){ const live = billById(b.id); if(live && live.receipt){ live.receipt.name = fileName; commit(); } }
  const msg = {decision:"approved", txnId:("bill:" + b.id).slice(0, 40), propertyName:p.name, fileName};
  inboxDone()[b.inbox] = {txn:msg.txnId, msg};
  if(typeof INBOX !== "undefined"){ INBOX.items = INBOX.items.filter(x => x.id !== b.inbox); delete INBOX.draft[b.inbox]; }
  BU.files.forEach(f => { if(f.item && f.item.id === b.inbox && f.state !== "done"){ f.state = "done"; f.bill = b.id; } });
  inboxPost(Object.assign({action:"decide", id:b.inbox}, msg)).then(() => { delete inboxDone()[b.inbox]; Store.save(S); }).catch(() => {});
}
function buAct(a, i, draw){
  const f = BU.files[i]; if(!f) return;
  if(a === "open" && f.bill) return billSheet(f.bill);
  if(a === "dupe" && f.dupeOf) return billSheet(f.dupeOf);
  if(a === "anyway"){ buHandle(f, false, true); return draw(); }
  if(a === "inbox"){ closeSheet(); go("inbox"); return; }
  if(a === "finish" || a === "hand"){
    const pre = f.item ? buPreset(f.item, f) : {};
    if(a === "hand" && f.item){ pre.vendor = pre.vendor || ""; }
    return billSheet(null, pre);
  }
}

// drag a file over a page: the upload sheet opens with it
function billDropZone(host){
  if(!host || host._buDrop) return; host._buDrop = true;
  const ok = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
  host.addEventListener("dragover", e => { if(!ok(e) || $("#sheet").classList.contains("on")) return; e.preventDefault(); host.classList.add("bu-over"); });
  host.addEventListener("dragleave", e => { if(e.target === host) host.classList.remove("bu-over"); });
  host.addEventListener("drop", e => { host.classList.remove("bu-over"); if(!ok(e) || $("#sheet").classList.contains("on")) return; e.preventDefault();
    if(S.ui.view !== "pmBills") return; billUploadSheet([...e.dataTransfer.files]); });
}

/* =====================================================================
   PAYMENTS (shared by both sides) — Nickel balances, money in and out with
   receipts, deposited checks, and the setup. Plus the Nickel bits on the
   Owner page. Reading needs no confirmation; anything that changes Nickel
   goes through the confirmation window (nkRun).
   ===================================================================== */
const paySetup = () => { S.ui.payTab = "setup"; go("payments"); };
const ownerEmails = o => [o && o.email].concat(String((o && o.cc) || "").split(/[,;\s]+/)).map(e => String(e || "").trim()).filter(e => /@/.test(e));
// nav badge: checks waiting to be applied, or a nudge when Nickel isn't set up
function payNavBadge(){
  const st = PAY.status && PAY.status.nickel;
  if(st && !st.ok) return `<i class="badge" style="color:var(--gold)">set up</i>`;
  const n = ((PAYV.deps && PAYV.deps.items) || []).length;
  return n ? `<i class="badge alert" style="background:var(--gold);color:#fff" title="Deposited checks to apply">${n}</i>` : null;
}
// "email it again" (works as a reminder: Nickel re-sends the invoice with its pay link)
function nkEmailAgainSheet(o){
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sheet-h"><div><h3>${esc(o.title)}</h3>${o.sub ? `<div class="muted" style="font-size:12.5px;margin-top:3px">${esc(o.sub)}</div>` : ""}</div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><p class="muted" style="margin-top:0;font-size:13px">Nickel emails the invoice again with its pay link. You'll confirm it in the Nickel window.</p>
      <label class="fld"><span>Email to</span><input type="text" id="eaTo" value="${esc((o.emails || []).join(", "))}"></label></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="eaGo">Email it</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  $("#eaGo").onclick = async () => {
    const to = $("#eaTo").value.split(/[,;\s]+/).filter(e => /@/.test(e)); if(!to.length) return toast("Add an email");
    $("#eaGo").disabled = true;
    try{ const r = await o.run(to); if(r && r.ok){ closeSheet(); toast(`Emailed to ${to.join(", ")}`); render(); } else $("#eaGo").disabled = false; }catch(e){ toast(e.message); $("#eaGo").disabled = false; }
  };
}
// charge an invoice to the owner's bank account / card on file in Nickel
function nkChargeSheet(o){
  const sh = $("#sheet"), list = o.onFile || [];
  sh.innerHTML = `<div class="sheet-h"><div><h3>${esc(o.title)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${usd(o.dueC)} outstanding</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b"><div class="bl-rec">${list.map((m, i) => `<label class="${i ? "" : "on"}"><input type="radio" name="pm" value="${i}" ${i ? "" : "checked"}> <span><b>${esc(m.label)}</b></span></label>`).join("")}</div>
      <p class="help">Nickel pulls the outstanding balance from this account. It shows as clearing until the bank confirms (a few business days for ACH), then the invoice turns paid with a receipt. You'll confirm it in the Nickel window.</p></div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="chGo">Charge ${usd(o.dueC)}</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  sh.querySelectorAll("[name=pm]").forEach(r => r.onchange = () => sh.querySelectorAll(".bl-rec label").forEach(l => l.classList.toggle("on", l.querySelector("input").checked)));
  $("#chGo").onclick = async () => {
    const m = list[Number((sh.querySelector("[name=pm]:checked") || {}).value || 0)]; if(!m) return;
    $("#chGo").disabled = true;
    try{ const r = await o.run(m); if(r && r.ok){ closeSheet(); toast("Charge sent — it shows as paid once it clears"); render(); } else $("#chGo").disabled = false; }catch(e){ toast(e.message); $("#chGo").disabled = false; }
  };
}
const PAYV = {data:null, loading:false, err:"", key:"", deps:null, depsLoading:false};
const nkMoneyIn = r => ["RECEIVABLE", "DEPOSIT", "INTEREST", "CHARGEBACK_WON"].includes(r.source);
const NK_SRC = {RECEIVABLE:"Owner payment", PAYABLE:"Vendor payment", REFUND:"Refund", RETURN:"ACH return", CHARGEBACK:"Chargeback", CHARGEBACK_WON:"Chargeback won", DEPOSIT:"Deposit", WITHDRAWAL:"Transfer out", FEE:"Nickel fee", INTEREST:"Interest"};
const nkStatusTag = s => { const u = String(s || "").toUpperCase();
  const cls = /COMPLETE|DELIVER|DEPOSIT|SUCCEED|SENT/.test(u) ? "green" : /FAIL|REJECT|RETURN|CANCEL/.test(u) ? "red" : /PEND|SCHED|PROCESS/.test(u) ? "gold" : "grey";
  return `<span class="tag ${cls}">${esc(u.charAt(0) + u.slice(1).toLowerCase().replace(/_/g, " "))}</span>`; };
// open Nickel's receipt PDF for a payment (asked for when clicked, so it's always current)
async function nkOpenReceipt(source, id, url){
  if(url){ window.open(url, "_blank", "noopener"); return; }
  const w = window.open("about:blank", "_blank");
  try{ const r = await payCall("nk.receipt", {source, id}, {noSave:true}); if(r.url){ if(w) w.location = r.url; else window.open(r.url, "_blank", "noopener"); } else { if(w) w.close(); toast("Nickel has no receipt for this one yet"); } }
  catch(e){ if(w) w.close(); toast(e.message); }
}
// which console record a Nickel payment belongs to
function nkWhereFrom(entityId){
  if(!entityId) return null;
  const b = billList().find(x => x.pay && (x.pay.paymentId === entityId || (x.pay.receipt && x.pay.receipt.id === entityId)));
  if(b) return {label:`Bill · ${b.vendor} · ${(pmProp(b.propertyId) || {}).name || ""}`, open:() => { setMode("pm"); go("pmBills"); setTimeout(() => billSheet(b.id), 60); }};
  const iv = invList().find(x => (x.payments || []).some(p => p.nkId === entityId));
  if(iv) return {label:`Owner invoice ${iv.no}`, open:() => { setMode("pm"); S.ui.invOpen = iv.id; S.ui.invF = "all"; go("pmInvoices"); }};
  for(const p of S.properties || []) for(const [key, g] of Object.entries(p.register || {})) if(g && g.nickel && (g.nickel.payments || []).some(x => x.id === entityId)){
    const no = key.split("|")[1];
    return {label:`${p.name} · invoice ${no}`, open:() => { S.ui.mode = "projects"; go("invoices", p.id); S.ui.open = S.ui.open || {}; S.ui.open[key] = true; persistUi(); render(); }};
  }
  return null;
}
function pgPayments(){
  $("#pgCrumb").textContent = "Shared"; $("#pgTitle").textContent = "Payments";
  const tab = S.ui.payTab === "setup" ? "setup" : "money";
  $("#pgSub").textContent = tab === "setup" ? "Nickel pays vendors and collects from owners · Nickel keeps QuickBooks up to date" : "Everything moving through Nickel, with a receipt for each payment";
  const v = $("#view");
  const seg = elm("div","sc-bar"); seg.style.marginTop = "0";
  seg.innerHTML = `<div class="sc-seg"><button data-t="money" class="${tab === "money" ? "on" : ""}">Money in &amp; out</button><button data-t="setup" class="${tab === "setup" ? "on" : ""}">Setup</button></div>`;
  seg.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { S.ui.payTab = b.dataset.t; persistUi(); render(); });
  v.appendChild(seg);
  if(tab === "setup") return paySetupInto(v);
  actions([["Check Nickel now", async () => { try{ const r = await payCall("nickel.refresh"); PAYV.data = null; toast(r.changed ? `${r.changed} update${r.changed === 1 ? "" : "s"} from Nickel` : "Everything is up to date"); render(); }catch(e){ toast(e.message); } }, "ghost"]]);
  if(!payOnline()){ v.appendChild(elm("div","card",`<div class="empty"><b>Sign in to the hosted console</b><p>Payments run through the office's Supabase project.</p></div>`)); return; }
  payStatusThenRedraw("payments");
  if(PAY.status && !nickelOn()){ v.appendChild(elm("div","card",`<div class="empty"><b>Nickel isn't connected</b><p>${esc((PAY.status.nickel || {}).error || "")}</p><button class="btn primary" id="pyGoSetup">Open setup</button></div>`)); $("#pyGoSetup").onclick = paySetup; return; }
  const src = S.ui.paySrc || "", q = S.ui.payQ || "", key = src + "|" + q;
  if(PAYV.key !== key){ PAYV.data = null; PAYV.key = key; }
  if(!PAYV.data && !PAYV.loading){
    PAYV.loading = true; PAYV.err = "";
    payCall("nk.activity", {source:src, q, page:1}, {noSave:true}).then(r => { PAYV.data = Object.assign({page:1}, r); }).catch(e => { PAYV.err = e.message; }).finally(() => { PAYV.loading = false; if(S.ui.view === "payments") render(); });
  }
  if(!PAYV.deps && !PAYV.depsLoading){ PAYV.depsLoading = true; payCall("nk.deposits", {}, {noSave:true}).then(r => { PAYV.deps = r; }).catch(() => { PAYV.deps = {items:[]}; }).finally(() => { PAYV.depsLoading = false; if(S.ui.view === "payments") render(); }); }
  const d = PAYV.data;
  // balances
  if(d && (d.balances || []).length){
    const bal = elm("div","card pf-hero");
    bal.innerHTML = d.balances.map(b => `<div class="pf-cell"><div class="label">${esc(b.name)}${b.last4 ? " ··" + esc(b.last4) : ""}</div><div class="pf-v">${usd(b.balanceC)}</div><div class="pf-note">${b.holdsC ? usd(b.holdsC) + " on hold · " : ""}<a href="${esc(b.link)}" target="_blank" rel="noopener">Open in Nickel</a></div></div>`).join("");
    v.appendChild(bal);
  }
  // checks deposited into Nickel that aren't on an invoice yet
  const deps = (PAYV.deps && PAYV.deps.items) || [];
  if(deps.length){
    const c = elm("div","card"); c.style.marginBottom = "16px";
    c.innerHTML = `<div class="card-h"><h3>Deposited checks to apply</h3><span class="muted" style="margin-left:auto;font-size:12px">Put a check you deposited in Nickel toward an owner's invoice</span></div>
      <div class="al-list">${deps.map((x, i) => `<div class="al-r"><div class="al-txt"><b>${esc(x.payer || "Check")}</b><span>${esc(x.at ? fdateS(x.at) : "")}${x.memo ? " · " + esc(x.memo) : ""} · ${esc(String(x.status || "").toLowerCase())}</span></div><b class="num" style="margin-right:10px">${usd(x.unappliedC || x.amountC)}</b><button class="btn sm primary" data-dep="${i}">Apply to invoice…</button></div>`).join("")}</div>`;
    c.querySelectorAll("[data-dep]").forEach(b => b.onclick = () => nkApplyDepositSheet(deps[Number(b.dataset.dep)]));
    v.appendChild(c);
  }
  // filters
  const bar = elm("div","sc-bar");
  const F = [["","All"], ["RECEIVABLE","Owner payments"], ["PAYABLE","Vendor payments"], ["DEPOSIT","Deposits"], ["WITHDRAWAL","Transfers out"], ["REFUND","Refunds"]];
  bar.innerHTML = `<div class="sc-seg">${F.map(([k, l]) => `<button data-s="${k}" class="${src === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="sc-q"><input type="text" id="pyQ" placeholder="Owner or vendor name…" value="${esc(q)}"></div>`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { S.ui.paySrc = b.dataset.s; render(); });
  const qi = bar.querySelector("#pyQ"); qi.onkeydown = e => { if(e.key === "Enter"){ S.ui.payQ = qi.value.trim(); render(); } };
  qi.onchange = () => { S.ui.payQ = qi.value.trim(); render(); };
  const card = elm("div","card");
  if(PAYV.err){ card.innerHTML = `<div class="empty"><b>Couldn't read Nickel</b><p>${esc(PAYV.err)}</p></div>`; v.appendChild(card); return; }
  if(!d){ card.innerHTML = `<div class="empty"><p class="muted">Reading Nickel…</p></div>`; v.appendChild(card); return; }
  if(!d.items.length){ card.innerHTML = `<div class="empty"><b>Nothing here</b><p>Try another filter.</p></div>`; v.appendChild(card); return; }
  const t = elm("table","tbl py-tbl");
  t.innerHTML = `<thead><tr><th>Date</th><th>What</th><th>Status</th><th class="r">Amount</th><th></th></tr></thead><tbody>
    ${d.items.map((r, i) => { const inn = nkMoneyIn(r), from = nkWhereFrom(r.entityId), hasRc = ["RECEIVABLE", "PAYABLE"].includes(r.source) && r.entityId;
      return `<tr><td class="nw muted">${esc(fdateS(String(r.at).slice(0, 10)))}</td>
        <td><div class="item-t">${esc(r.who || NK_SRC[r.source] || "")}${r.what ? ` <span class="muted">· ${esc(r.what)}</span>` : ""}</div><div class="item-s">${esc(NK_SRC[r.source] || r.source)}${r.account ? " · " + esc(r.account) : ""}${from ? ` · <a href="#" data-from="${i}">${esc(from.label)}</a>` : r.desc && r.desc !== r.what ? " · " + esc(r.desc.slice(0, 90)) : ""}</div></td>
        <td>${nkStatusTag(r.status)}</td><td class="r num" style="color:${inn ? "var(--green)" : "inherit"}">${inn ? "+" : "−"}${usd(Math.abs(r.amountC))}</td>
        <td class="r nw">${hasRc ? `<button class="btn sm ghost" data-rc="${i}">Receipt</button>` : ""}${r.link ? `<a class="btn sm ghost" href="${esc(r.link)}" target="_blank" rel="noopener">Nickel</a>` : ""}</td></tr>`; }).join("")}</tbody>`;
  t.querySelectorAll("[data-rc]").forEach(b => b.onclick = () => { const r = d.items[Number(b.dataset.rc)]; nkOpenReceipt(r.source, r.entityId); });
  t.querySelectorAll("[data-from]").forEach(a => a.onclick = e => { e.preventDefault(); const f = nkWhereFrom(d.items[Number(a.dataset.from)].entityId); if(f) f.open(); });
  const w = elm("div","tbl-wrap"); w.appendChild(t); card.appendChild(w);
  if(d.hasMore){
    const more = elm("div", null, `<div style="padding:12px 16px;display:flex;gap:10px;align-items:center"><button class="btn sm" id="pyMore">Show more</button><span class="muted" style="font-size:12.5px">${d.items.length} of ${d.total}</span></div>`);
    card.appendChild(more);
    more.querySelector("#pyMore").onclick = async e => { e.target.disabled = true; try{ const r = await payCall("nk.activity", {source:src, q, page:(d.page || 1) + 1}, {noSave:true}); d.items = d.items.concat(r.items || []); d.hasMore = r.hasMore; d.page = (d.page || 1) + 1; render(); }catch(er){ toast(er.message); e.target.disabled = false; } };
  }
  v.appendChild(card);
}
// a deposited check → an open invoice in Nickel (owner invoices and project invoices)
function nkOpenNickelInvoices(){
  const out = [];
  invList().forEach(x => { const nk = x.nickel || {}; if(nk.invoiceId && !nk.deleted && x.status === "sent" && invTotals(x).dueC > 0) out.push({kind:"pm", invoiceId:x.id, label:`${x.no} · ${(ownerById(x.ownerId) && ownerLabel(ownerById(x.ownerId))) || ""}`, dueC:invTotals(x).dueC}); });
  (S.properties || []).forEach(p => Object.entries(p.register || {}).forEach(([key, g]) => { const nk = g && g.nickel; if(nk && nk.invoiceId && !g.paid && !nk.canceled){ const [unitId, no] = key.split("|"); out.push({kind:"project", propertyId:p.id, unitId, no:Number(no), label:`${nk.number || p.name + " invoice " + no} · ${p.name}`, dueC:nk.outstandingC != null ? nk.outstandingC : nk.amountC || 0}); } }));
  return out;
}
function nkApplyDepositSheet(dep){
  const sh = $("#sheet"), list = nkOpenNickelInvoices(), avail = dep.unappliedC || dep.amountC;
  sh.innerHTML = `<div class="sheet-h"><div><h3>Apply a deposited check</h3><div class="muted" style="font-size:12.5px;margin-top:3px">${esc(dep.payer || "Check")} · ${usd(avail)} to apply</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">${list.length ? `<label class="fld"><span>Invoice</span><select id="dpI">${list.map((x, i) => `<option value="${i}">${esc(x.label)} · ${usd(x.dueC)} due</option>`).join("")}</select></label>
      <label class="fld"><span>Amount</span><input type="number" step="0.01" id="dpA"></label>
      <p class="help">No money moves: the check is already in your Nickel balance. Nickel marks the invoice paid, and QuickBooks follows. If the bank returns the check, Nickel reopens the invoice by itself.</p>`
      : `<div class="empty"><b>No open invoices in Nickel</b><p>Only invoices created through Nickel can take a deposited check.</p></div>`}</div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button>${list.length ? `<button class="btn primary" id="dpGo">Apply</button>` : ""}</div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet; openPanel();
  if(!list.length) return;
  const sel = $("#dpI"), amt = $("#dpA"), fill = () => { const x = list[Number(sel.value)]; amt.value = (Math.min(avail, x.dueC || avail) / 100).toFixed(2); };
  sel.onchange = fill; fill();
  $("#dpGo").onclick = async () => {
    const x = list[Number(sel.value)], c = Math.round(Number(amt.value) * 100); if(!(c > 0)) return toast("Enter the amount");
    try{ const r = await nkRun("deposit.apply", Object.assign({transferId:dep.transferId, amountC:c}, x), `Apply ${usd(c)} to ${x.label}`); if(r.ok){ closeSheet(); PAYV.deps = null; PAYV.data = null; toast("Applied — the invoice is updated"); render(); } }
    catch(e){ toast(e.message); }
  };
}

/* ---------- Owner page: Nickel customer, account on file ---------- */
const NKC = {};   // owner id → customer details from Nickel (read when the page opens)
function ownerNickelCard(o){
  const c = nkOwner(o.id), card = elm("div","card ow-nk"); card.style.marginBottom = "16px";
  if(!nickelOn()){ card.innerHTML = `<div class="card-h"><h3>Nickel</h3><span class="tag grey">Not connected</span></div>`; return card; }
  if(!c.id){ card.innerHTML = `<div class="card-h"><h3>Nickel</h3><span class="muted" style="margin-left:auto;font-size:12.5px">Not a Nickel customer yet — added the first time you send this owner an invoice through Nickel</span></div>`; return card; }
  const info = NKC[o.id];
  if(!info && payOnline()){ NKC[o.id] = {loading:true}; payCall("nk.customer", {ownerId:o.id}, {noSave:true}).then(r => { NKC[o.id] = r.customer || {}; }).catch(() => { NKC[o.id] = {}; }).finally(() => { if(S.ui.view === "owners") render(); }); }
  const onFile = (info && info.onFile) || c.onFile || [];
  card.innerHTML = `<div class="card-h"><h3>Nickel</h3><span class="tag green">Customer${c.synced ? " · in QuickBooks" : ""}</span>${c.url ? `<a class="btn sm ghost" style="margin-left:auto" href="${esc(c.url)}" target="_blank" rel="noopener">Open in Nickel</a>` : ""}</div>
    <div class="card-b ps-b">
      <div class="ps-kv"><span>Nickel customer</span><b>${esc(c.name || "")}${(c.emails || []).length ? " · " + esc(c.emails.join(", ")) : ""}</b></div>
      <div class="ps-kv"><span>Account on file</span><b>${onFile.length ? onFile.map(m => esc(m.label)).join(", ") : info && info.loading ? "Checking…" : "None"}</b></div>
      <p class="help">${onFile.length ? "Invoices for this owner can be charged to the account on file from the invoice (you confirm each charge)." : "With a bank account on file, you can charge this owner's invoices from the console instead of waiting for them to pay the link. Nickel's form lets the owner add it themselves."}</p>
      ${onFile.length ? "" : `<div class="bl-pay"><button class="btn sm" id="owAuto">${c.autopayAsked ? "Email the form again" : "Email the owner Nickel's form"}</button>${c.autopayAsked ? `<span class="muted" style="font-size:12.5px">Sent ${esc(fdateS(String(c.autopayAsked).slice(0, 10)))}</span>` : ""}</div>`}
    </div>`;
  const b = card.querySelector("#owAuto");
  if(b) b.onclick = async () => {
    const emails = [o.email].concat(String(o.cc || "").split(/[,;\s]+/)).filter(e => e && /@/.test(e));
    if(!emails.length) return toast("Add the owner's email first");
    try{ const r = await nkRun("owner.autopay", {ownerId:o.id, emails}, `Email ${ownerLabel(o)} Nickel's form to add a bank account`); if(r.ok){ toast(`Nickel emailed the form to ${emails.join(", ")}`); render(); } }catch(e){ toast(e.message); }
  };
  return card;
}
(function(){
  const base = pgOwnerDetail;
  pgOwnerDetail = function(o){
    base(o);
    if(!payOnline() || !ownerLabel(o)) return;
    payStatusThenRedraw("owners");
    const grid = document.querySelector("#view .owner-grid");
    if(grid) grid.parentNode.insertBefore(ownerNickelCard(o), grid);
  };
})();

/* ---------- background: keep everything current without anyone opening it ----------
   The server checks Nickel every hour. While the console is open, it also asks for a
   check when the last one is over 20 minutes old (one tab at a time, silently). */
let NK_BG = 0;
setInterval(() => {
  try{
    if(!payOnline() || !S.nk || Date.now() - NK_BG < 20 * 60e3) return;
    const last = Date.parse(S.nk.lastRefresh || 0) || 0; if(Date.now() - last < 20 * 60e3) return;
    if(document.hidden) return;
    NK_BG = Date.now();
    payCall("nickel.refresh", {}, {noSave:true}).then(() => { PAYV.data = null; }).catch(() => {});
  }catch(e){}
}, 60e3);

/* =====================================================================
   TODAY — one place to start, per side. On the Projects side: invoices
   to send and money owed on projects. On the PM side: rent, bills,
   payouts, owner invoices, statements and month close. Each line has
   the button that does it.
   ===================================================================== */
function pgToday(){
  const pm = S.ui.mode === "pm";
  $("#pgCrumb").textContent = pm ? "Property management" : "Projects"; $("#pgTitle").textContent = "Today";
  $("#pgSub").textContent = new Date().toLocaleDateString("en-US", {weekday:"long", month:"long", day:"numeric"});
  const acts = [];
  if(payOnline()) acts.push(["Check Nickel now", async e => { const b = e.target.closest("button"); b.disabled = true; b.textContent = "Checking…";
    try{ const r = await payCall("nickel.refresh"); PAYV.data = null; PAYV.deps = null; toast(r.changed ? `${r.changed} update${r.changed === 1 ? "" : "s"} from Nickel` : "Everything is up to date"); }catch(er){ toast(er.message); } render(); }, "ghost"]);
  actions(acts);
  if(payOnline()){
    payStatusThenRedraw("today");
    if(!PAYV.deps && !PAYV.depsLoading){ PAYV.depsLoading = true; payCall("nk.deposits", {}, {noSave:true}).then(r => { PAYV.deps = r; }).catch(() => { PAYV.deps = {items:[]}; }).finally(() => { PAYV.depsLoading = false; if(S.ui.view === "today") render(); }); }
  }
  if(typeof inboxConn === "function" && inboxConn() && !INBOX.tried && !INBOX.loading) inboxRefresh(true).then(() => { if(S.ui.view === "today") render(); });
  const v = $("#view");
  if(pm){ if(!pmState().properties.length) return pmEmpty(); billDropZone(v); todayPm(v); }
  else todayProjects(v);
}

/* ---------- shared pieces ---------- */
const TD_OPEN = {};   // sections showing every row
function tdCols(v){
  const cols = elm("div","td-cols"); v.appendChild(cols);
  const left = elm("div","td-col"), right = elm("div","td-col"); cols.appendChild(left); cols.appendChild(right);
  return [left, right];
}
// a card with rows: {t, s, amt, btn, primary, fn, cls}
function tdSection(host, title, rows, empty, head){
  const c = elm("div","card td-card");
  c.innerHTML = `<div class="card-h"><h3>${title}</h3>${rows.length ? `<span class="muted td-n">${rows.length}</span>` : ""}${head ? `<button class="btn sm ghost" style="margin-left:auto" data-hd>${head[0]}</button>` : ""}</div>` +
    (rows.length ? `<div class="td-list">${rows.slice(0, (TD_OPEN[title] ? 999 : 8)).map((r, i) => `<div class="td-r ${r.cls || ""}"><div class="td-t"><b>${r.t}</b><span>${r.s || ""}</span></div>${r.amt != null ? `<b class="num td-amt">${r.amt}</b>` : ""}${r.btn ? `<button class="btn sm ${r.primary ? "primary" : ""}" data-i="${i}">${r.btn}</button>` : ""}</div>`).join("")}${rows.length > 8 ? `<button type="button" class="td-more" data-more>${TD_OPEN[title] ? "Show fewer" : `Show ${rows.length - 8} more`}</button>` : ""}</div>`
      : `<div class="td-empty">${empty}</div>`);
  c.querySelectorAll("[data-i]").forEach(b => b.onclick = () => rows[Number(b.dataset.i)].fn());
  const mo = c.querySelector("[data-more]"); if(mo) mo.onclick = () => { TD_OPEN[title] = !TD_OPEN[title]; const y = window.scrollY; render(); window.scrollTo(0, y); };
  const h = c.querySelector("[data-hd]"); if(h) h.onclick = head[1];
  host.appendChild(c); return c;
}
function tdHero(v, cells){
  const hero = elm("div","card pf-hero td-hero");
  hero.innerHTML = cells.map((c, i) => `<div class="pf-cell" data-c="${i}"><div class="label">${c.label}</div><div class="pf-v ${c.cls || ""}"${c.style ? ` style="${c.style}"` : ""}>${c.v}</div>${c.meter != null ? `<div class="pm-meter"><i style="width:${c.meter}%"></i></div>` : ""}<div class="pf-note">${c.note}</div></div>`).join("");
  hero.querySelectorAll("[data-c]").forEach(el => { const c = cells[Number(el.dataset.c)]; if(c.fn){ el.style.cursor = "pointer"; el.onclick = c.fn; } });
  v.appendChild(hero);
}
const tdPlural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + "s")}`;
function tdDeposits(host){
  const deps = (PAYV.deps && PAYV.deps.items) || [];
  if(deps.length) tdSection(host, "Deposited checks to apply", deps.map(x => ({t:esc(x.payer || "Check"), s:`Deposited ${x.at ? fdateS(x.at) : ""} · not on an invoice yet`, amt:usd(x.unappliedC || x.amountC), btn:"Apply", primary:true, fn:() => nkApplyDepositSheet(x)})), "");
}
function tdInbox(host, pm){
  if(typeof inboxConn !== "function" || !inboxConn()) return;
  const pmIds = new Set(pmState().properties.map(p => p.id)), prjIds = new Set(live().map(p => p.id));
  const items = INBOX.items.filter(i => i.status === "pending").filter(i => pm ? (pmIds.has(i.property_id) || !prjIds.has(i.property_id)) : prjIds.has(i.property_id));
  if(!items.length) return;
  tdSection(host, "Receipts to review", items.map(i => ({t:`${esc(i.vendor || "Receipt")} · ${esc(i.property_name || "No property yet")}`, s:`${esc(i.description || "")}${i.date ? ` · ${fdateS(i.date)}` : ""}${i.source ? ` · ${esc(i.source === "Upload" ? "uploaded" : i.source)}` : ""}`,
    amt:i.total ? usd(cents(i.total)) : null, btn:"Review", fn:() => go("inbox")})), "", ["Receipt inbox", () => go("inbox")]);
}

/* ---------- Projects ---------- */
function todayProjects(v){
  const today = todayISO(), pr = portfolioRoll(), ready = [], sentOut = [], paidM = [];
  live().forEach(p => { const C = ALL[p.id]; if(!C) return;
    p.units.forEach(u => (C.units[u.id] || []).forEach(inv => {
      const st = String(inv.status || ""), reg = inv.reg || {};
      if(st.startsWith("Ready")) ready.push({p, u, inv});
      else if(st === "Sent") sentOut.push({p, u, inv});
      else if(st === "Paid" && String(reg.datePaid || (reg.nickel || {}).paidAt || "").slice(0, 7) === today.slice(0, 7)) paidM.push({p, u, inv});
    })); });
  const age = x => x.inv.reg && x.inv.reg.dateSent ? PMCore.dayNum(today) - PMCore.dayNum(String(x.inv.reg.dateSent).slice(0, 10)) : 0;
  sentOut.sort((a, b) => age(b) - age(a));
  const old = sentOut.filter(x => age(x) > 30);
  const owedC = x => { const nk = (x.inv.reg || {}).nickel || {}; return nk.outstandingC != null ? nk.outstandingC : x.inv.totalC; };
  tdHero(v, [
    {label:"Ready to send", v:usd(pr.readyC), cls:"a", note:ready.length ? tdPlural(ready.length, "invoice") : "None ready", fn:() => go("portfolio")},
    {label:"Awaiting payment", v:usd(sentOut.reduce((a, x) => a + owedC(x), 0)), note:sentOut.length ? `${sentOut.length} sent${old.length ? `, ${old.length} over 30 days` : ""}` : "Nothing outstanding", fn:() => go("portfolio")},
    {label:`Paid · ${monthLabel(today.slice(0, 7)).split(" ")[0]}`, v:usd(paidM.reduce((a, x) => a + (x.inv.totalC || 0), 0)), cls:"g", note:paidM.length ? tdPlural(paidM.length, "invoice") : "None yet this month", fn:() => go("portfolio")},
    {label:"Active projects", v:String(live().length), note:"Open the portfolio", fn:() => go("portfolio")}
  ]);
  const [left, right] = tdCols(v);
  const openInv = (p, u, inv) => () => { go("invoices", p.id); S.ui.unit = u.id; S.ui.open = S.ui.open || {}; S.ui.open[u.id + "|" + inv.no] = true; persistUi(); render(); };
  const label = ({p, u, inv}) => `${esc(p.name)}${p.units.length > 1 ? " · " + esc(u.name) : ""} · invoice ${inv.no}`;
  tdSection(left, "Invoices to send", ready.map(x => {
    const nk = x.inv.reg && x.inv.reg.nickel;
    return {t:label(x), s:nk && nk.invoiceId ? "In Nickel · pay link ready — email the owner" : x.inv.locked ? "Locked — create it in Nickel next" : "Lock it, then create it in Nickel", amt:usd(x.inv.totalC), btn:nk && nk.invoiceId ? "Email owner" : "Open", primary:true,
      fn:nk && nk.invoiceId && typeof pjEmailSheet === "function" ? () => pjEmailSheet(x.p, x.u, x.inv) : openInv(x.p, x.u, x.inv)};
  }), "Nothing ready to send. New invoices show up here as soon as they fill up.");
  tdSection(left, "Waiting on owners", sentOut.map(x => {
    const reg = x.inv.reg || {}, nk = reg.nickel || {}, d = age(x);
    return {t:label(x), s:`Sent${reg.dateSent ? " " + fdateS(reg.dateSent) : ""}${d > 30 ? ` · ${d} days ago` : ""}${nk.paidC ? ` · ${usd(nk.paidC)} paid so far` : ""}`, cls:d > 30 ? "late" : "", amt:usd(owedC(x)),
      btn:d > 14 && nk.invoiceId && typeof pjEmailSheet === "function" ? "Remind" : "Open", fn:d > 14 && nk.invoiceId && typeof pjEmailSheet === "function" ? () => pjEmailSheet(x.p, x.u, x.inv) : openInv(x.p, x.u, x.inv)};
  }), "No project invoices waiting on payment.");
  const vdue = [];
  live().forEach(p => (p.transactions || []).forEach(t => { if(typeof pjVendorOpen === "function" && pjVendorOpen(t)) vdue.push({p, t}); }));
  vdue.sort((a, b) => String(a.t.vendorDue.due || "9999").localeCompare(String(b.t.vendorDue.due || "9999")));
  if(vdue.length) tdSection(right, "Vendors to pay", vdue.map(({p, t}) => { const due = t.vendorDue.due, late = due && due < today;
    return {t:`${esc(t.vendor || "Vendor")} · ${esc(p.name)}`, s:`${esc(t.desc || "")}${due ? ` · due ${fdateS(due)}${late ? " (past due)" : ""}` : ""}${t.vendorDue.note ? ` · <i>${esc(t.vendorDue.note)}</i>` : ""}`, cls:late ? "late" : "",
      amt:usd(cents(t.amount)), btn:"Open", primary:!!late, fn:() => { go("txns", p.id); setTimeout(() => openSheet(t.id), 40); }}; }), "");
  if(typeof chAll === "function"){
    const by = new Map(); chAll().filter(x => chOpen(x.t)).forEach(x => { const k = x.t.charge.party.toLowerCase(); if(!by.has(k)) by.set(k, []); by.get(k).push(x); });
    if(by.size) tdSection(right, "Back-charges to collect", [...by.values()].map(rows => { const c = rows[0].t.charge, tot = rows.reduce((a2, x) => a2 + cents(x.t.amount), 0), inv = rows.filter(x => x.t.charge.state === "invoiced").length;
      return {t:esc(c.party), s:`${rows.length} charge${rows.length === 1 ? "" : "s"} · ${[...new Set(rows.map(x => x.p.name))].map(esc).join(", ")}${inv ? ` · ${inv} invoiced` : " · not invoiced yet"}`, amt:usd(tot), btn:inv === rows.length ? "Open" : "Invoice", primary:!inv, fn:() => go("charges")}; }), "", ["All back-charges", () => go("charges")]);
  }
  tdInbox(right, false);
  tdDeposits(right);
  if(paidM.length) tdSection(right, "Paid this month", paidM.map(x => ({t:label(x), s:`Paid${(x.inv.reg || {}).datePaid ? " " + fdateS(x.inv.reg.datePaid) : ""}`, amt:usd(x.inv.totalC), btn:"Open", fn:openInv(x.p, x.u, x.inv)})), "");
  if(!right.children.length) tdSection(right, "Receipts and checks", [], "No receipts waiting and no deposited checks to apply.");
}

/* ---------- Property management ---------- */
function todayPm(v){
  const today = todayISO(), soon = PMCore.isoOf(PMCore.dayNum(today) + 7), m = thisMonth(), set = pmSettings();
  const toPm = (view, extra) => () => { S.ui.mode = "pm"; if(extra) extra(); go(view); };
  // rent and payouts for this month
  const props = pmLiveProps().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  const rowsM = pmMonthRows(m).filter(x => !x.row.detailOnly), monthOn = rowsM.length ? m : (pmMonths().slice(-1)[0] || m);
  let dueC = 0, recvC = 0; const late = [], payouts = [];
  props.forEach(p => { const r = pmRow(monthOn, p.id); if(!r || r.detailOnly) return; const c = pmCalc(r, p);
    dueC += c.dueC; recvC += Math.min(c.recv, c.dueC || c.recv);
    if(pmLiveStatus(monthOn, p) === "late"){ const L = monthOn === thisMonth() && !c.recv ? pmMdLease(p) : null; late.push({p, c, owed:L && L.balance > 0 ? cents(L.balance) : c.dueC - c.recv}); }
    if(c.recv > 0 && c.payoutC > 0 && !r.paidOut && !r.locked) payouts.push({p, c}); });
  const pct = dueC ? Math.round(recvC / dueC * 100) : 0;
  // bills
  const bills = billList(), open = bills.filter(b => b.status === "open"), paying = bills.filter(b => b.status === "paying");
  const dueSoon = open.filter(b => (b.due || b.date || "") <= soon), lateB = open.filter(b => b.due && b.due < today);
  const paidWk = bills.filter(b => b.status === "paid" && b.pay && b.pay.date && PMCore.dayNum(today) - PMCore.dayNum(String(b.pay.date).slice(0, 10)) <= 7);
  // owner invoices
  const toInv = bills.filter(b => b.status !== "void" && b.recover === "invoice" && !b.invoiceId);
  const invs = invList(), unpaid = invs.filter(x => x.status === "sent" && invTotals(x).dueC > 0), overdue = unpaid.filter(x => x.due && x.due < today);
  const drafts = invs.filter(x => x.status === "draft");

  tdHero(v, [
    {label:`Rent · ${monthLabel(monthOn).split(" ")[0]}`, v:`${pct}%`, meter:pct, note:`${usd(recvC)} of ${usd(dueC)}${late.length ? ` · ${late.length} late` : ""}`, fn:toPm("pmMonth", () => S.ui.pmMonth = monthOn)},
    {label:"Bills to pay", v:usd(open.reduce((a, b) => a + cents(b.amount), 0)), style:lateB.length ? "color:var(--red)" : "", note:open.length ? `${tdPlural(open.length, "bill")}${dueSoon.length ? `, ${dueSoon.length} due this week` : ""}` : "Nothing waiting", fn:toPm("pmBills", () => S.ui.billF = "open")},
    {label:"Payouts to send", v:String(payouts.length), style:payouts.length ? "color:var(--gold)" : "", note:payouts.length ? usd(payouts.reduce((a, x) => a + x.c.payoutC, 0)) : "None waiting", fn:toPm("pmMonth", () => S.ui.pmMonth = monthOn)},
    {label:"Owed by owners", v:usd(unpaid.reduce((a, x) => a + invTotals(x).dueC, 0)), cls:"a", note:unpaid.length ? `${unpaid.length} unpaid${overdue.length ? `, ${overdue.length} overdue` : ""}` : toInv.length ? `${tdPlural(toInv.length, "bill")} to invoice` : "All paid", fn:toPm("pmInvoices")}
  ]);
  const [left, right] = tdCols(v);

  // MagicDoor bills at a rental that's also a project: a person says where each one belongs
  const srt = typeof mdSortList === "function" ? mdSortList() : [];
  if(srt.length) tdSection(left, "MagicDoor bills to sort", srt.map(r => ({t:`${esc(r.vendor || "Bill")} · ${esc(r.prop)}`, s:`${r.memo ? esc(r.memo) + " · " : ""}project or rental?`,
    amt:usd(cents(r.amount)), btn:"Sort", primary:true, fn:() => mdSortSheet(r.lineId)})), "");
  // bills to pay, soonest first; payments on the way after
  const billRows = open.slice().sort((a, b) => String(a.due || a.date).localeCompare(String(b.due || b.date))).map(b => {
    const st = billStatus(b), p = pmProp(b.propertyId);
    return {t:esc(b.vendor || "Vendor"), s:`${esc(p ? p.name : "")}${b.due ? ` · due ${fdateS(b.due)}` : ""}${b.memo ? ` · ${esc(b.memo)}` : ""}`, cls:st.k === "overdue" || st.k === "failed" ? "late" : "",
      amt:usd(cents(b.amount)), btn:typeof nickelOn === "function" && nickelOn() ? "Pay" : "Open", primary:b.due && b.due <= soon, fn:() => typeof nickelOn === "function" && nickelOn() ? billPaySheet([b.id]) : billSheet(b.id)};
  });
  tdSection(left, "Bills to pay", billRows, "No bills waiting. Drop a vendor's invoice here to add one.", ["Upload invoice", () => billUploadSheet()]);
  if(paying.length) tdSection(left, "Payments on the way", paying.map(b => { const p = pmProp(b.propertyId), rc = (b.pay || {}).receipt || {};
    return {t:esc(b.vendor || "Vendor"), s:`${esc(p ? p.name : "")} · ${esc(billStatus(b).label)}${rc.eta ? ` · arrives ${fdateS(rc.eta)}` : ""}`, amt:usd(cents(b.amount)), btn:"Open", fn:() => billSheet(b.id)}; }), "");

  // rent: who's late
  if(late.length) tdSection(left, "Rent late", late.sort((a, b) => b.owed - a.owed).map(x => ({t:esc(x.p.name), s:`${monthLabel(monthOn)}${x.p.tenants ? ` · ${esc(x.p.tenants)}` : ""}`, cls:"late", amt:usd(x.owed), btn:"Open", fn:() => { S.ui.mode = "pm"; S.ui.pmMonth = monthOn; go("pmMonth"); setTimeout(() => pmRowSheet(monthOn, x.p.id), 40); }})), "");

  // payouts
  if(payouts.length) tdSection(left, "Owner payouts to send", payouts.map(x => { const o = ownerById(x.p.ownerId);
    return {t:esc(x.p.name), s:`${esc(o ? ownerLabel(o) : "No owner on file")} · ${monthLabel(monthOn)}`, amt:usd(x.c.payoutC), btn:"Open", fn:() => { S.ui.mode = "pm"; S.ui.pmMonth = monthOn; go("pmMonth"); setTimeout(() => pmRowSheet(monthOn, x.p.id), 40); }}; }), "");

  tdInbox(left, true);

  // owner invoices
  const invRow = x => ({t:`${esc(x.no)} · ${esc((ownerById(x.ownerId) && ownerLabel(ownerById(x.ownerId))) || "")}`, s:x.status === "draft" ? "Draft — not sent yet" : x.due && x.due < today ? `Overdue since ${fdateS(x.due)}` : `Sent${x.sentAt ? " " + fdateS(String(x.sentAt).slice(0, 10)) : ""}${x.due ? ` · due ${fdateS(x.due)}` : ""}`,
    cls:x.due && x.due < today && x.status !== "draft" ? "late" : "", amt:usd(invTotals(x).dueC), btn:"Open", fn:toPm("pmInvoices", () => { S.ui.invOpen = x.id; S.ui.invF = "all"; })});
  const invRows = (toInv.length ? [{t:`${tdPlural(toInv.length, "bill")} to put on owner invoices`, s:usd(toInv.reduce((a, b) => a + cents(b.amount) + billFeeC(b), 0)) + " including admin fees", btn:"Invoice", primary:true, fn:toPm("pmInvoices")}] : [])
    .concat(drafts.map(invRow), overdue.map(invRow), unpaid.filter(x => !overdue.includes(x)).map(invRow));
  tdSection(right, "Owner invoices", invRows, "Nothing to invoice and no unpaid owner invoices.");

  // month close + statements
  const metaOn = pmState().meta[monthOn] || {}, recorded = rowsM.filter(x => { const c = pmCalc(x.row, x.prop); return c.recv > 0 || c.dueC <= 0; }).length;
  const prevM = monthAdd(m, -1), prevMeta = pmState().meta[prevM] || {}, prevRows = pmMonthRows(prevM).filter(x => !x.row.detailOnly);
  const closeRows = [];
  if(prevRows.length && !prevMeta.closed) closeRows.push({t:`${monthLabel(prevM)} is still open`, s:"Close it once payouts are sent — statements go out from pm@ when it closes", btn:"Close month", primary:true, cls:+today.slice(8, 10) > 10 ? "late" : "", fn:toPm("pmMonth", () => S.ui.pmMonth = prevM)});
  if(rowsM.length) closeRows.push({t:`${monthLabel(monthOn)} · ${metaOn.closed ? "closed" : "open"}`, s:`Rent recorded for ${recorded} of ${rowsM.length} · ${tdPlural(payouts.length, "payout")} to send`, btn:"Month close", fn:toPm("pmMonth", () => S.ui.pmMonth = monthOn)});
  else closeRows.push({t:`${monthLabel(m)} isn't started`, s:"Starting it sets rent due and recurring charges", btn:"Start month", primary:true, fn:toPm("pmMonth", () => S.ui.pmMonth = m)});
  const closedMs = Object.values(pmState().meta || {}).filter(x => x && x.closed && x.month && !String(x.closedBy || "").startsWith("Imported")).map(x => x.month).sort();
  const lastM = closedMs[closedMs.length - 1];
  if(lastM && typeof stmtCandidates === "function"){
    const c = stmtCandidates(lastM), ok = c.filter(x => !x.why), sent = ok.filter(x => x.done && x.done.state === "sent"), drafted = ok.filter(x => x.done && x.done.state === "draft");
    if(ok.length && sent.length < ok.length) closeRows.push({t:`Owner statements · ${monthLabel(lastM)}`, s:`${sent.length} of ${ok.length} sent from pm@${drafted.length ? ` · ${drafted.length} waiting as drafts` : ""}`, btn:"Email statements", primary:true, fn:() => pmStatementMailSheet(lastM)});
    else if(ok.length) closeRows.push({t:`Owner statements · ${monthLabel(lastM)}`, s:`All ${ok.length} sent from pm@`, btn:"See them", fn:() => pmStatementMailSheet(lastM)});
  }
  tdSection(right, "Month close", closeRows, "");

  // alerts other than the ones shown above
  const shown = new Set(["late", "payout", "inbox"]);
  const al = pmAlerts().filter(a => a.level !== "info" && !shown.has(a.type));
  if(al.length){
    const c = elm("div","card td-card");
    c.innerHTML = `<div class="card-h"><h3>Leases, deposits &amp; more</h3><span class="muted td-n">${al.length}</span><button class="btn sm ghost" style="margin-left:auto" id="tdAll">Action center</button></div><div class="al-list">${al.slice(0, 6).map(pmAlertRowHTML).join("")}</div>`;
    pmWireAlerts(c, al.slice(0, 6)); right.appendChild(c);
    c.querySelector("#tdAll").onclick = toPm("pmAlerts");
  }
  tdDeposits(right);
  if(paidWk.length) tdSection(right, "Paid in the last 7 days", paidWk.sort((a, b) => String(b.pay.date).localeCompare(String(a.pay.date))).map(b => ({t:esc(b.vendor || "Vendor"), s:`${esc((pmProp(b.propertyId) || {}).name || "")} · ${fdateS(String(b.pay.date).slice(0, 10))} · ${esc(b.pay.method || "")}`, amt:usd(cents(b.amount)),
    btn:b.pay.receipt && b.pay.receipt.url ? "Receipt" : "Open", fn:() => b.pay.receipt && b.pay.receipt.url ? window.open(b.pay.receipt.url, "_blank", "noopener") : billSheet(b.id)})), "");
}

/* =====================================================================
   SHELL — Projects | Property management switch, PM navigation,
   and the hooks that let owners, receipts and search span both sides.
   ===================================================================== */
const SHARED_VIEWS = new Set(["owners","inbox","team","payments","today"]);
const PM_VIEWS = new Set(["pmBills","pmInvoices","pmVendors","pmPaySetup","pmHome","pmAlerts","pmMonth","pmProps","pmProperty","pmDeposits","pmIncome","pmSettings","pmMd"]);
const PM_RR = new Set(["pmHome","pmAlerts","pmMonth","pmProps","pmProperty","pmDeposits","pmIncome","pmSettings","pmMd"]);   // Rent & reporting
function setMode(mode){
  S.ui.mode = mode;
  go(mode === "pm" ? (S.ui.pmLastView && PM_VIEWS.has(S.ui.pmLastView) ? S.ui.pmLastView : "pmBills") : (S.ui.pjLastView || "portfolio"));
}
function renderModeSwitch(){
  const box = $("#modeSw"); if(!box) return;
  const pm = S.ui.mode === "pm";
  box.innerHTML = `<button data-mode="projects" aria-pressed="${!pm}">Projects</button><button data-mode="pm" aria-pressed="${pm}">Property mgmt</button>`;
  box.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { if((b.dataset.mode === "pm") !== pm) setMode(b.dataset.mode); });
  document.body.classList.toggle("mode-pm", pm);
  const qa = $("#qAdd"); if(qa) qa.innerHTML = pm ? `Add bill <kbd>N</kbd>` : `New transaction <kbd>N</kbd>`;
  // remember where each side was left
  if(pm && PM_VIEWS.has(S.ui.view)) S.ui.pmLastView = S.ui.view;
  if(!pm && !PM_VIEWS.has(S.ui.view) && !SHARED_VIEWS.has(S.ui.view)) S.ui.pjLastView = S.ui.view;
}
function renderNavPM(){
  const n = $("#nav"); n.innerHTML = "";
  const mk = (k, lbl, ic, badge, fn) => {
    const b = elm("button", null, `${icon(ic)}<span>${lbl}</span>${badge != null ? badge : ""}`);
    b.setAttribute("aria-current", S.ui.view === k);
    b.onclick = fn || (() => go(k)); n.appendChild(b);
  };
  const P2 = pmState(), m = pmCurrentMonth(), al = P2.properties.length ? pmAlerts() : [];
  const urgent = al.filter(a => a.level === "urgent").length, act = al.filter(a => a.level !== "info").length;
  mk("today", "Today", "bolt");
  n.appendChild(elm("div","nav-head","Property management"));
  const nOpen = billList().filter(b => b.status === "open").length, nInv = billList().filter(b => b.status !== "void" && b.recover === "invoice" && !b.invoiceId).length + invList().filter(x => x.status === "sent" && invTotals(x).dueC > 0).length;
  mk("pmBills", "Bills", "receipt", nOpen ? `<i class="badge">${nOpen}</i>` : null);
  mk("pmInvoices", "Owner invoices", "file", nInv ? `<i class="badge">${nInv}</i>` : null);
  mk("pmVendors", "Vendors", "user");
  // rent, MagicDoor and reporting: one tap away, folded unless you're in it
  const rrOpen = S.ui.pmRR === true || PM_RR.has(S.ui.view);
  const rr = elm("button","nav-fold", `${icon("grid")}<span>Rent &amp; reporting</span><i class="badge${act ? " alert" : ""}"${act && !urgent ? ' style="background:var(--gold)"' : ""}>${act || ""}</i><b class="nav-chev">${rrOpen ? "▾" : "▸"}</b>`);
  rr.onclick = () => { S.ui.pmRR = !rrOpen; persistUi(); renderNavPM(); };
  n.appendChild(rr);
  if(rrOpen){
    const sub = elm("div","nav-sub"); n.appendChild(sub);
    const mk2 = (k, lbl, ic, badge) => { const b = elm("button", null, `${icon(ic)}<span>${lbl}</span>${badge != null ? badge : ""}`); b.setAttribute("aria-current", S.ui.view === k); b.onclick = () => go(k); sub.appendChild(b); };
    mk2("pmHome", "Overview", "home");
    mk2("pmAlerts", "Action center", "bolt", act ? `<i class="badge alert"${urgent ? "" : ' style="background:var(--gold)"'}>${act}</i>` : al.length ? `<i class="badge">${al.length}</i>` : null);
    mk2("pmMonth", "Month close", "check", `<i class="badge">${monthShort(m)}</i>`);
    mk2("pmProps", "Properties", "building", `<i class="badge">${pmLiveProps().length}</i>`);
    mk2("pmDeposits", "Deposits", "receipt");
    mk2("pmIncome", "Income", "grid");
    if(mdReady() || (typeof Cloud !== "undefined" && Cloud.ready)){
      const xm = mdx(), nUn = xm ? xm.unmatchedProps.length : 0;
      mk2("pmMd", "MagicDoor", "sync", mdReady() ? (nUn ? `<i class="badge" title="Not linked">${nUn}</i>` : `<i class="badge">${mdAgo(S.md.syncedAt).replace(" ago", "")}</i>`) : null);
    }
    mk2("pmSettings", "Alert rules", "gear");
  }
  n.appendChild(elm("div","nav-gap"));
  n.appendChild(elm("div","nav-head","Shared"));
  mk("owners", "Owners", "user", `<i class="badge">${(S.owners||[]).filter(ownerLabel).length}</i>`, () => { S.ui.ownerId = null; go("owners"); });
  const nIn = inboxCount();
  mk("inbox", "Receipt inbox", "receipt", nIn ? `<i class="badge alert" style="background:var(--accent);color:#fff">${nIn}</i>` : null, () => { go("inbox"); inboxRefresh(); });
  mk("payments", "Payments", "card", payNavBadge());
  if(Cloud.ready) mk("team", "Team", "user", `<i class="badge">${Cloud.online.length ? Cloud.online.length + 1 + " on" : ""}</i>`);
}
/* "N" in property management jumps to the next unpaid rent box */
function pmQuick(){ if(S.ui.view === "pmMonth") return pmQuickRent(); billUploadSheet(); }
function pmQuickRent(){
  if(S.ui.view !== "pmMonth") go("pmMonth");
  setTimeout(() => {
    const ins = [...document.querySelectorAll("[data-recv]")];
    const next = ins.find(i => !i.value) || ins[0];
    if(next){ next.focus(); next.select(); next.scrollIntoView({block:"center", behavior:"smooth"}); }
    else toast("Start the month first");
  }, 40);
}
/* sync chip: file autosave locally, database status when hosted */
function cloudChip(){
  const b = $("#saveChip"), l = $("#saveLbl"); if(!b) return;
  b.classList.remove("live","attn");
  if(Cloud.status === "error"){ b.classList.add("attn"); l.textContent = "Not saved — retrying"; b.title = Cloud.error; return; }
  b.classList.add("live");
  l.textContent = Cloud.status === "saving" ? "Saving…" : `Synced · ${Cloud.name.split(" ")[0]}`;
  b.title = `Signed in as ${Cloud.email}. Everything saves to the office database.`;
}
/* PM properties an owner has */
const ownerPmProps = o => o ? pmState().properties.filter(p => p.ownerId === o.id && !p.deleted && p.status !== "inactive") : [];
function ownerPmTableHTML(o){
  const props = ownerPmProps(o); if(!props.length) return "";
  const m = pmLastPaidMonth();
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Managed property</th><th>Status</th><th class="r">Rent</th><th class="r">PM fee</th><th class="r">${m ? "Payout · " + monthShort(m) : "Payout"}</th><th></th></tr></thead><tbody>
    ${props.map(p => { const r = m && pmRow(m, p.id), c = r && !r.detailOnly ? pmCalc(r, p) : null;
      return `<tr data-pmp="${p.id}" style="cursor:pointer"><td><div class="item-t">${esc(p.name)}</div><div class="item-s">${esc(p.address)}</div></td><td><span class="tag ${p.status === "active" ? "green" : "grey"}">${PM_STATUS[p.status] || p.status}</span></td>
        <td class="r num">${p.rent ? usd(cents(p.rent)) : "—"}</td><td class="r num">${feeRuleText(p.feeRule)}</td><td class="r num">${c ? usd(c.payoutC) : "—"}</td><td class="act"><span class="sc-go">›</span></td></tr>`; }).join("")}
    </tbody></table></div>`;
}
/* delegated: the new-property owner picker shows the name fields only for a new owner */
document.addEventListener("change", e => {
  if(e.target && e.target.id === "n_pick"){ const f = $("#n_newown"); if(f) f.style.display = e.target.value === "__new" ? "" : "none"; }
});
document.addEventListener("click", e => {
  const tr = e.target.closest && e.target.closest("[data-pmp]");
  if(tr){ pmOpenProperty(tr.dataset.pmp); }
});

(function(){ try{ const q = new URLSearchParams(location.search), v = q.get("view");
  if(v){ sessionStorage.setItem("phd-want", JSON.stringify({view:v, p:q.get("p"), m:q.get("m")})); history.replaceState(null, "", location.pathname); } }catch(e){} })();
/* =====================================================================
   CLOUD — Google sign-in, one shared database for the whole office,
   live updates between people, an activity log, and the team list.

   Runs only when config.js provides a Supabase URL + anon key. Without
   them the console keeps working as the single-file, in-browser app.

   Storage: every property / PM row / month is its own versioned document.
   A save only succeeds against the version you loaded, so two people can
   never silently overwrite each other — the later save is told and redone.
   ===================================================================== */
const Cloud = {
  sb:null, email:"", name:"", synced:new Map(), timer:null, saving:false, again:false,
  online:[], remoteDirty:false, lastRemote:null, status:"", error:"", ready:false,
  enabled(){ const c = window.PHD_CONFIG || {}; return !!(c.supabaseUrl && c.supabaseAnonKey && !/YOUR-/.test(c.supabaseUrl + c.supabaseAnonKey) && window.supabase && window.supabase.createClient); }
};

/* ---------- state <-> documents ---------- */
const SERVER_DOCS = new Set(["shared/magicdoor", "shared/nickel", "shared/qbomap", "shared/qbo"]);
function cloudDocs(){
  const out = new Map();
  S.properties.forEach(p => out.set("pj_property/" + p.id, p));
  out.set("shared/main", {owners:S.owners || [], order:S.properties.map(p => p.id), inboxDone:S.inboxDone || {}});
  if(S.inboxConn) out.set("shared/inbox", S.inboxConn);
  if(S.stmtConn) out.set("shared/stmtmail", S.stmtConn);
  if(S.billMail) out.set("shared/billmail", S.billMail);
  if(S.pmVendors) out.set("shared/vendors", S.pmVendors);
  if(S.acct) out.set("shared/accounting", S.acct);
  if(S.pmSettings) out.set("shared/pmsettings", S.pmSettings);
  if(S.pmAlerts) out.set("shared/alerts", S.pmAlerts);
  if(S.mdLinks) out.set("shared/mdlinks", S.mdLinks);
  if(S.pm){
    (S.pm.properties || []).forEach(p => out.set("pm_property/" + p.id, p));
    Object.entries(S.pm.rows || {}).forEach(([k, r]) => out.set("pm_row/" + k, r));
    Object.entries(S.pm.meta || {}).forEach(([k, m]) => out.set("pm_meta/" + k, m));
    Object.entries(S.pm.deposits || {}).forEach(([k, d]) => out.set("pm_deposit/" + k, d));
    Object.entries(S.pm.bills || {}).forEach(([k, b]) => out.set("pm_bill/" + k, b));
    Object.entries(S.pm.invoices || {}).forEach(([k, v]) => out.set("pm_invoice/" + k, v));
  }
  return out;
}
function cloudApply(kind, id, data, deleted){
  const pm = () => pmState();
  if(kind === "pj_property"){
    const i = S.properties.findIndex(p => p.id === id);
    if(deleted){ if(i >= 0) S.properties.splice(i, 1); }
    else if(i >= 0) S.properties[i] = data; else S.properties.push(data);
  } else if(kind === "shared" && id === "main"){
    S.owners = data.owners || []; S.inboxDone = data.inboxDone || {};
    if(Array.isArray(data.order)){ const pos = new Map(data.order.map((x, i) => [x, i])); S.properties.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9)); }
  } else if(kind === "shared" && id === "inbox"){ S.inboxConn = deleted ? null : data; }
  else if(kind === "shared" && id === "stmtmail"){ S.stmtConn = deleted ? null : data; }
  else if(kind === "shared" && id === "billmail"){ S.billMail = deleted ? null : data; }
  else if(kind === "shared" && id === "vendors"){ S.pmVendors = deleted ? null : data; }
  else if(kind === "shared" && id === "accounting"){ S.acct = deleted ? null : data; }
  else if(kind === "shared" && id === "nickel"){ S.nk = deleted ? null : data; }        // written only by the payments function
  else if(kind === "shared" && id === "qbo"){ S.qbo = deleted ? null : data; }           // written only by the qbo function
  else if(kind === "shared" && id === "qbomap"){ S.qbmap = deleted ? null : data; }     // written only by the payments function
  else if(kind === "shared" && id === "pmsettings"){ S.pmSettings = deleted ? null : data; }
  else if(kind === "shared" && id === "alerts"){ S.pmAlerts = deleted ? {} : data; }
  else if(kind === "shared" && id === "magicdoor"){ S.md = deleted ? null : data; if(typeof mdAfterSnapshot === "function" && Cloud.ready) mdAfterSnapshot(); }
  else if(kind === "shared" && id === "mdlinks"){ S.mdLinks = deleted ? null : data; }
  else if(kind === "pm_property"){
    const L = pm().properties, i = L.findIndex(p => p.id === id);
    if(deleted){ if(i >= 0) L.splice(i, 1); } else if(i >= 0) L[i] = data; else L.push(data);
  }
  else if(kind === "pm_row"){ if(deleted) delete pm().rows[id]; else pm().rows[id] = data; }
  else if(kind === "pm_meta"){ if(deleted) delete pm().meta[id]; else pm().meta[id] = data; }
  else if(kind === "pm_deposit"){ if(deleted) delete pm().deposits[id]; else pm().deposits[id] = data; }
  else if(kind === "pm_bill"){ if(deleted) delete pm().bills[id]; else pm().bills[id] = data; }
  else if(kind === "pm_invoice"){ if(deleted) delete pm().invoices[id]; else pm().invoices[id] = data; }
}
function cloudLabel(kind, id, data){
  if(kind === "pj_property" || kind === "pm_property") return (data && data.name) || "a property";
  if(kind === "pm_row"){ const [m, pid] = id.split("|"); const p = pmProp(pid); return `${p ? p.name : "a property"} · ${monthLabel(m)}`; }
  if(kind === "pm_meta") return monthLabel(id);
  if(kind === "pm_deposit"){ const p = pmProp(id); return `deposits for ${p ? p.name : "a property"}`; }
  if(kind === "pm_bill"){ const p = data && pmProp(data.propertyId); return `a bill${data && data.vendor ? " from " + data.vendor : ""}${p ? " · " + p.name : ""}`; }
  if(kind === "pm_invoice") return `owner invoice ${(data && data.no) || ""}`.trim();
  if(kind === "shared") return {main:"owners", inbox:"inbox settings", pmsettings:"alert rules", alerts:"alerts (snoozed/dismissed)", magicdoor:"MagicDoor data", mdlinks:"MagicDoor links and updates", vendors:"vendors", accounting:"QuickBooks settings", qbo:"QuickBooks data", stmtmail:"statement mailbox", billmail:"billing@ email settings", nickel:"Nickel updates"}[id] || id;
  return kind;
}

/* ---------- saving ---------- */
Cloud.queue = function(){
  clearTimeout(Cloud.timer);
  Cloud.timer = setTimeout(Cloud.flush, 450);
  Cloud.status = "saving"; chip();
};
Cloud.flush = async function(){
  if(!Cloud.ready) return;
  if(Cloud.saving){ Cloud.again = true; return; }
  Cloud.saving = true; Cloud.again = false;
  try{
    const docs = cloudDocs(), inserts = [], updates = [];
    for(const [key, data] of docs){
      const json = JSON.stringify(data), s = Cloud.synced.get(key);
      if(!s) inserts.push({key, data, json});
      else if(s.json !== json || s.deleted) updates.push({key, data, json, prev:s});
    }
    for(const [key, s] of Cloud.synced) if(!docs.has(key) && !s.deleted && !SERVER_DOCS.has(key)) updates.push({key, del:true, prev:s});   // documents only the server writes are never touched here
    for(let i = 0; i < inserts.length; i += 200){
      const chunk = inserts.slice(i, i + 200);
      const rows = chunk.map(op => { const [kind, ...rest] = op.key.split("/"); return {kind, id:rest.join("/"), data:op.data}; });
      const {data, error} = await Cloud.sb.from("docs").insert(rows).select("kind,id,version");
      if(error){
        // someone created the same document a moment ago: take theirs, one by one
        for(const op of chunk) await Cloud.writeOne(op, null);
      } else data.forEach((r, j) => Cloud.synced.set(r.kind + "/" + r.id, {json:chunk[j].json, version:r.version, deleted:false}));
    }
    for(const op of updates) await Cloud.writeOne(op, op.prev);
    Cloud.error = ""; Cloud.status = "saved"; Cloud.savedAt = Date.now();
  }catch(e){
    Cloud.error = String(e.message || e); Cloud.status = "error";
    toast("Couldn't save — check your connection. Changes are kept and will retry.");
    setTimeout(Cloud.queue, 5000);
  }
  Cloud.saving = false; chip();
  if(Cloud.again) Cloud.queue();
};
Cloud.writeOne = async function(op, prev){
  const [kind, ...rest] = op.key.split("/"), id = rest.join("/");
  if(!prev){
    const {data, error} = await Cloud.sb.from("docs").insert({kind, id, data:op.data}).select("version").single();
    if(!error){ Cloud.synced.set(op.key, {json:op.json, version:data.version, deleted:false}); return; }
    if(error.code === "23505") return Cloud.conflict(kind, id);
    throw error;
  }
  const patch = op.del ? {deleted:true} : {data:op.data, deleted:false};
  const {data, error} = await Cloud.sb.from("docs").update(patch).eq("kind", kind).eq("id", id).eq("version", prev.version).select("version");
  if(error) throw error;
  if(!data.length) return Cloud.conflict(kind, id);
  Cloud.synced.set(op.key, {json:op.del ? prev.json : op.json, version:data[0].version, deleted:!!op.del});
};
Cloud.conflict = async function(kind, id){
  const {data} = await Cloud.sb.from("docs").select("data,version,deleted,updated_by").eq("kind", kind).eq("id", id).maybeSingle();
  if(!data) return;
  cloudApply(kind, id, data.data, data.deleted);
  Cloud.synced.set(kind + "/" + id, {json:JSON.stringify(data.data), version:data.version, deleted:data.deleted});
  recalc(); Cloud.remoteDirty = true;
  toast(`${cloudWho(data.updated_by)} changed ${cloudLabel(kind, id, data.data)} at the same moment — their version was kept. Please redo your last change there.`);
};
const cloudWho = email => { if(email === "MagicDoor sync") return "MagicDoor sync"; if(!email) return "The hourly sync"; if(email === Cloud.email) return "You (another tab)"; const m = (Cloud.staff || []).find(s => s.email === email); return (m && m.name) || email.split("@")[0]; };

/* ---------- live updates from everyone else ---------- */
Cloud.onRemote = function(row){
  if(!row || !row.kind) return;
  if(row.kind === "shared" && row.id === "magicdoor"){                    // the hourly sync: no toast; refetch if the message was too big to carry it
    const s0 = Cloud.synced.get("shared/magicdoor"); if(s0 && row.version <= s0.version) return;
    if(!row.data){ mdFetchSnapshot().then(() => { Cloud.remoteDirty = true; render(); }); return; }
    Cloud.synced.set("shared/magicdoor", {json:JSON.stringify(row.data), version:row.version, deleted:row.deleted});
    S.md = row.deleted ? null : row.data; mdAfterSnapshot(); Cloud.remoteDirty = true; render(); return;
  }
  if(row.kind === "shared" && row.id === "qbo"){                          // the hourly QuickBooks sync: no toast; refetch if the message was too big to carry it
    const s0 = Cloud.synced.get("shared/qbo"); if(s0 && row.version <= s0.version) return;
    if(!row.data){ if(typeof qbFetchSnapshot === "function") qbFetchSnapshot().then(() => { Cloud.remoteDirty = true; render(); }); return; }
    Cloud.synced.set("shared/qbo", {json:JSON.stringify(row.data), version:row.version, deleted:row.deleted});
    S.qbo = row.deleted ? null : row.data; Cloud.remoteDirty = true; render(); return;
  }
  const key = row.kind + "/" + row.id, s = Cloud.synced.get(key);
  if(s && row.version <= s.version) return;                     // our own save coming back
  const localNow = cloudDocs().get(key);
  // our own save echoing back before its response arrived: nothing to show
  if(!row.deleted && localNow && JSON.stringify(localNow) === JSON.stringify(row.data)){ Cloud.synced.set(key, {json:JSON.stringify(row.data), version:row.version, deleted:row.deleted}); return; }
  const unsaved = s && localNow && JSON.stringify(localNow) !== s.json;
  cloudApply(row.kind, row.id, row.data, row.deleted);
  Cloud.synced.set(key, {json:JSON.stringify(row.data), version:row.version, deleted:row.deleted});
  recalc(); Cloud.remoteDirty = true;
  const msg = `${cloudWho(row.updated_by)} updated ${cloudLabel(row.kind, row.id, row.data)}`;
  if(unsaved) toast(msg + " while you were editing it — theirs is showing now. Please redo your change.");
  else if(!Cloud.lastRemote || Date.now() - Cloud.lastRemote > 4000) toast(msg);
  Cloud.lastRemote = Date.now();
};
/* re-draw after remote changes, but never while someone is typing or has a panel open */
setInterval(() => {
  if(!Cloud.remoteDirty) return;
  const a = document.activeElement, typing = a && /input|textarea|select/i.test(a.tagName);
  if(typing || $("#sheet").classList.contains("on") || $("#cmdk").classList.contains("on")) return;
  Cloud.remoteDirty = false; const y = window.scrollY; render(); window.scrollTo(0, y);
}, 800);

/* ---------- boot ---------- */
Cloud.boot = async function(){
  const cfg = window.PHD_CONFIG;
  /* Accept the URL however it was copied: "https://ref.supabase.co", with a trailing slash,
     or the REST address ("…/rest/v1/"). Anything after the domain would send sign-in to the
     wrong service, which answers "No API key found in request". */
  let base = String(cfg.supabaseUrl || "").trim();
  try{ base = new URL(base).origin; }catch(e){}
  Cloud.sb = window.supabase.createClient(base, String(cfg.supabaseAnonKey || "").trim(), {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:"pkce"}});
  const {data:{session}} = await Cloud.sb.auth.getSession();
  if(!session) return cloudLogin();
  Cloud.email = String(session.user.email || "").toLowerCase();
  Cloud.name = (session.user.user_metadata && (session.user.user_metadata.full_name || session.user.user_metadata.name)) || Cloud.email.split("@")[0];
  Cloud.sb.auth.onAuthStateChange((ev) => { if(ev === "SIGNED_OUT") location.reload(); });
  cloudSplash("Loading your workspace…");
  const {data:me, error:meErr} = await Cloud.sb.from("staff").select("email,name,active").eq("email", Cloud.email);
  if(meErr || !me || !me.length || !me[0].active) return cloudDenied();
  if(!me[0].name && Cloud.name) Cloud.sb.from("staff").update({name:Cloud.name}).eq("email", Cloud.email).then(() => {});
  // everything, a page at a time (the API returns at most 1,000 rows per call)
  let all = [], from = 0;
  for(;;){
    const {data, error} = await Cloud.sb.from("docs").select("kind,id,data,version,deleted").order("kind").order("id").range(from, from + 999);
    if(error){ cloudSplash("Couldn't load data: " + esc(error.message), true); return; }
    all = all.concat(data); if(data.length < 1000) break; from += 1000;
  }
  S = seedState(); S.properties = []; S.owners = []; S.inboxDone = {}; S.pm = {properties:[], rows:{}, meta:{}, deposits:{}};
  const main = all.find(r => r.kind === "shared" && r.id === "main");
  all.filter(r => !r.deleted).forEach(r => { if(!(r.kind === "shared" && r.id === "main")) cloudApply(r.kind, r.id, r.data, false); });
  if(main && !main.deleted) cloudApply("shared", "main", main.data, false);
  all.forEach(r => Cloud.synced.set(r.kind + "/" + r.id, {json:JSON.stringify(r.data), version:r.version, deleted:r.deleted}));
  if(!S.properties.length) S.properties = [];          // an empty office starts with no projects
  S.version = 3;
  S.ui = Object.assign({view:"portfolio", unit:null, query:"", showExcluded:true, open:{}}, cloudLoadUi());
  if(S.ui.activeId) S.activeId = S.ui.activeId;
  // links from the morning email: ?view=pmAlerts / ?view=pmProperty&p=<id> (kept across the Google sign-in hop)
  try{
    const want = JSON.parse(sessionStorage.getItem("phd-want") || "null"); sessionStorage.removeItem("phd-want");
    if(want && typeof PM_VIEWS !== "undefined" && PM_VIEWS.has(want.view)){
      S.ui.mode = "pm"; S.ui.view = want.view;
      if(want.view === "pmProperty" && want.p) S.ui.pmPropId = want.p;
      if(want.view === "pmMonth" && /^\d{4}-\d{2}$/.test(want.m || "")) S.ui.pmMonth = want.m;
    }
    else if(want && ["txns","invoices","overview"].includes(want.view) && want.p && (S.properties || []).some(x => x.id === want.p)){ S.ui.mode = "projects"; S.ui.view = want.view; S.activeId = want.p; }
    else if(want && ["inbox","today","payments","charges"].includes(want.view)){ S.ui.view = want.view; }
  }catch(e){}
  Cloud.staff = (await Cloud.sb.from("staff").select("email,name,active")).data || [];
  // Store.save now means "sync": documents go to the database, screen state stays in this browser
  Store.save = async () => { cloudSaveUi(); if(Cloud.ready) Cloud.queue(); };
  Store.load = async () => S;
  AutoFile.queue = () => {}; AutoFile.pull = async () => {};
  Cloud.sb.channel("docs-live").on("postgres_changes", {event:"*", schema:"public", table:"docs"}, p => Cloud.onRemote(p.new)).subscribe();
  const pres = Cloud.sb.channel("office", {config:{presence:{key:Cloud.email}}});
  pres.on("presence", {event:"sync"}, () => { const st = pres.presenceState(); Cloud.online = Object.values(st).map(x => x[0]).filter(x => x && x.email !== Cloud.email); cloudPresence(); })
      .subscribe(async s => { if(s === "SUBSCRIBED") await pres.track({email:Cloud.email, name:Cloud.name, at:Date.now()}); });
  $("#cloudSplash") && $("#cloudSplash").remove();
  document.body.classList.add("cloud");
  Cloud.ready = true;
  if(!S.properties.length && !S.pm.properties.length) S.ui.view = "team";
  startApp();
  if(mdReady()) mdAfterSnapshot();
  Cloud.queue();                                      // anything the first recalc changed (frozen invoices) is saved
};
function cloudLoadUi(){ try{ return JSON.parse(localStorage.getItem("phd-ui-" + Cloud.email) || "{}"); }catch(e){ return {}; } }
function cloudSaveUi(){ try{ const u = Object.assign({}, S.ui, {activeId:S.activeId}); delete u.sel; localStorage.setItem("phd-ui-" + Cloud.email, JSON.stringify(u)); }catch(e){} }

/* ---------- sign-in screens ---------- */
function cloudSplash(msg, isErr){
  let el = $("#cloudSplash");
  if(!el){ el = elm("div","auth"); el.id = "cloudSplash"; document.body.appendChild(el); }
  el.innerHTML = `<div class="auth-box"><div class="brand"><div class="mk">P</div><div class="wm"><b>PHD Billing</b><span>Owner billing console</span></div></div>
    <p class="${isErr ? "auth-err" : "muted"}">${msg}</p></div>`;
}
function cloudLogin(){
  const cfg = window.PHD_CONFIG;
  let el = $("#cloudSplash"); if(!el){ el = elm("div","auth"); el.id = "cloudSplash"; document.body.appendChild(el); }
  el.innerHTML = `<div class="auth-box">
      <div class="brand"><div class="mk">P</div><div class="wm"><b>PHD Billing</b><span>Owner billing console</span></div></div>
      <h1>Sign in</h1>
      <p class="muted">Use your ${cfg.googleDomain ? "@" + esc(cfg.googleDomain) + " " : ""}Google account. Access is by invitation — ask a teammate to add you if you're new.</p>
      <button class="btn primary auth-g" id="gSign"><svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#fff" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#fff" opacity=".85" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#fff" opacity=".7" d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1z"/><path fill="#fff" opacity=".55" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg> Continue with Google</button>
      <p class="auth-foot">Your session stays signed in on this device until you sign out.</p></div>`;
  $("#gSign").onclick = async () => {
    const opts = {redirectTo:location.origin + location.pathname, queryParams:{prompt:"select_account"}};
    if(cfg.googleDomain) opts.queryParams.hd = cfg.googleDomain;
    const {error} = await Cloud.sb.auth.signInWithOAuth({provider:"google", options:opts});
    if(error) toast(error.message);
  };
}
function cloudDenied(){
  let el = $("#cloudSplash"); if(!el){ el = elm("div","auth"); el.id = "cloudSplash"; document.body.appendChild(el); }
  el.innerHTML = `<div class="auth-box"><div class="brand"><div class="mk">P</div><div class="wm"><b>PHD Billing</b><span>Owner billing console</span></div></div>
    <h1>No access yet</h1><p class="muted"><b>${esc(Cloud.email)}</b> isn't on the team list. Ask anyone already using the console to add this address under <b>Team</b>, then sign in again.</p>
    <button class="btn" id="gOut">Use a different account</button></div>`;
  $("#gOut").onclick = async () => { await Cloud.sb.auth.signOut(); location.reload(); };
}

/* ---------- who's here ---------- */
function cloudPresence(){
  const box = $("#presence"); if(!box) return;
  const ppl = Cloud.online.slice(0, 5);
  box.innerHTML = ppl.map(p => `<span class="pres" title="${esc(p.name || p.email)} is online">${esc(initials(p.name || p.email))}</span>`).join("")
    + (Cloud.online.length > 5 ? `<span class="pres more">+${Cloud.online.length - 5}</span>` : "");
}

/* ---------- Team & activity ---------- */
async function pgTeam(){
  if(!Cloud.ready){ $("#view").appendChild(elm("div","card",`<div class="empty"><b>Team is part of the hosted console</b><p>Once the console is online with sign-in, this is where you add and remove people and see who changed what.</p></div>`)); return; }
  actions([["Sign out", async () => { await Cloud.sb.auth.signOut(); location.reload(); }, "ghost"]]);
  const v = $("#view");
  const first = !S.properties.length && !pmState().properties.length;
  if(first){
    const w = elm("div","card"); w.style.marginBottom = "16px";
    w.innerHTML = `<div class="card-h"><h3>Welcome — bring your data in</h3></div><div class="card-b">
      <p class="muted" style="margin-top:0;font-size:13.3px">The office database is empty. Load what you already have; everyone on the team sees it right away.</p>
      <button class="btn primary" id="wProj">Load project billing backup (.json)</button>
      <button class="btn" id="wPm">Load PM workbook history (pm-seed.json)</button>
      <input type="file" id="wPmPick" accept="application/json" style="display:none"></div>`;
    v.appendChild(w);
    w.querySelector("#wProj").onclick = () => $("#filePick").click();
    w.querySelector("#wPm").onclick = () => w.querySelector("#wPmPick").click();
    w.querySelector("#wPmPick").onchange = e => { const f = e.target.files[0]; if(!f) return; const r = new FileReader();
      r.onload = () => { try{ pmLoadSeed(JSON.parse(r.result)); S.ui.mode = "pm"; go("pmMonth"); }catch(err){ alert("That file isn't the PM history file. Choose pm-seed.json."); } }; r.readAsText(f); };
  }
  const bk = elm("div","card"); bk.style.marginBottom = "16px";
  bk.innerHTML = `<div class="card-h"><h3>Backups</h3><span class="muted" style="margin-left:auto;font-size:12px">Saved nightly to Google Drive → PHD Billing Backups</span></div>
    <div class="card-b" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="muted" style="font-size:13px;flex:1;min-width:260px">If something is ever deleted or overwritten, restore the whole office from any nightly file. Everyone sees the restored data right away.</span>
      <button class="btn" id="bkRestore">Restore from a backup…</button><input type="file" id="bkPick" accept="application/json" style="display:none"></div>`;
  v.appendChild(bk);
  bk.querySelector("#bkRestore").onclick = () => bk.querySelector("#bkPick").click();
  bk.querySelector("#bkPick").onchange = e => { const f = e.target.files[0]; if(!f) return; const r = new FileReader();
    r.onload = () => { let d; try{ d = JSON.parse(r.result); }catch(err){ return alert("That isn't a backup file."); } cloudRestore(d, f.name); }; r.readAsText(f); e.target.value = ""; };
  // MagicDoor connection: test the key and produce a field report (no tenant data) for building the sync
  const md = elm("div","card"); md.style.marginBottom = "16px";
  md.innerHTML = `<div class="card-h"><h3>MagicDoor connection</h3><span class="muted" style="margin-left:auto;font-size:12px" id="mdState">Not checked yet</span></div>
    <div class="card-b"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="muted" style="font-size:13px;flex:1;min-width:260px">Checks the MagicDoor key saved in Supabase and lists which MagicDoor data it can read: field names and types only, with no names, addresses or amounts.</span>
      <button class="btn" id="mdTest">Test connection</button><button class="btn primary" id="mdDisc">Build field report</button></div>
      <div id="mdOut"></div></div>`;
  v.appendChild(md);
  const mdCall = async (mode) => {
    const {data, error} = await Cloud.sb.functions.invoke("magicdoor", {body:{mode}});
    if(error){
      if(error.name === "FunctionsFetchError" || /Failed to send a request/i.test(error.message || ""))
        throw new Error("Couldn't reach the magicdoor function. In Supabase → Edge Functions, check it's deployed with the name magicdoor and that JWT verification is turned off for it.");
      let msg = error.message; try{ const b = await error.context.json(); if(b && b.error) msg = b.error; }catch(e){} throw new Error(msg);
    }
    if(data && data.error) throw new Error(data.error);
    return data;
  };
  md.querySelector("#mdTest").onclick = async () => {
    const st = md.querySelector("#mdState"); st.textContent = "Checking…";
    try{ await mdCall("ping"); st.innerHTML = `<span style="color:var(--green)">Connected</span>`; }
    catch(e){ st.innerHTML = `<span style="color:var(--red)">${esc(e.message)}</span>`; }
  };
  md.querySelector("#mdDisc").onclick = async () => {
    const out = md.querySelector("#mdOut"), st = md.querySelector("#mdState");
    out.innerHTML = `<p class="muted" style="font-size:13px">Reading MagicDoor… this takes up to a minute.</p>`; st.textContent = "Working…";
    try{
      const d = await mdCall("discover");
      const rows = Object.entries(d.endpoints || {});
      const okN = rows.filter(([, x]) => x && x.status === 200).length;
      st.innerHTML = `<span style="color:var(--green)">Connected</span> · ${okN} of ${rows.length} readable`;
      const txt = JSON.stringify(d, null, 1);
      out.innerHTML = `<div style="margin-top:12px;font-size:13px">${d.spec ? `<p><b>Full API list found</b> — ${d.spec.endpoints.length} endpoints.</p>` : ""}
        ${rows.map(([p, x]) => `<div style="display:flex;gap:10px;padding:3px 0;border-top:1px solid var(--line)"><span class="num" style="width:54px;color:${x && x.status === 200 ? "var(--green)" : "var(--muted)"}">${esc(String(x && x.status))}</span><span style="flex:1">${esc(p)}</span><span class="muted">${x && x.status === 200 ? (x.count != null ? x.count + " rows" : "") : ""}</span></div>`).join("")}
        <p class="help" style="margin-top:10px">Copy the report and paste it to Claude. It has field names and types only.</p>
        <button class="btn sm" id="mdCopy">Copy report</button></div>`;
      out.querySelector("#mdCopy").onclick = async () => { try{ await navigator.clipboard.writeText(txt); toast("Report copied"); }catch(e){ const ta = elm("textarea"); ta.value = txt; ta.style.cssText = "width:100%;height:200px;margin-top:8px"; out.appendChild(ta); ta.select(); } };
    }catch(e){ st.innerHTML = `<span style="color:var(--red)">Failed</span>`; out.innerHTML = `<p style="color:var(--red);font-size:13px;margin-top:10px">${esc(e.message)}</p>`; }
  };
  const grid = elm("div","pm-grid2");
  const team = elm("div","card");
  const {data:staff} = await Cloud.sb.from("staff").select("email,name,active,added_at,added_by").order("added_at");
  Cloud.staff = staff || [];
  const onlineSet = new Set(Cloud.online.map(x => x.email));
  team.innerHTML = `<div class="card-h"><h3>Team</h3><span class="muted" style="margin-left:auto;font-size:12px">${(staff || []).filter(s => s.active).length} with access</span></div>
    <div class="card-b">
      ${(staff || []).map(s => `<div class="tm-r${s.active ? "" : " off"}"><span class="avatar sm">${esc(initials(s.name || s.email))}</span>
        <div class="tm-who"><b>${esc(s.name || s.email.split("@")[0])}${s.email === Cloud.email ? " (you)" : ""}</b><span>${esc(s.email)}${onlineSet.has(s.email) ? ` · <span style="color:var(--green)">online</span>` : ""}${s.active ? "" : " · removed"}</span></div>
        ${s.email === Cloud.email ? "" : `<button class="btn sm ${s.active ? "ghost danger" : ""}" data-tog="${esc(s.email)}" data-act="${s.active ? 0 : 1}">${s.active ? "Remove" : "Restore"}</button>`}</div>`).join("")}
      <div class="pm-add" style="margin-top:14px"><input type="email" id="tmEmail" placeholder="name@phdproperties.realestate"><button class="btn primary sm" id="tmAdd">Add to team</button></div>
      <p class="help">They sign in with that Google account. Everyone on the team has the same access.</p></div>`;
  grid.appendChild(team);
  const act = elm("div","card");
  act.innerHTML = `<div class="card-h"><h3>Recent activity</h3></div><div class="card-b" id="actList"><p class="muted">Loading…</p></div>`;
  grid.appendChild(act);
  v.appendChild(grid);
  team.querySelectorAll("[data-tog]").forEach(b => b.onclick = async () => {
    const on = b.dataset.act === "1";
    if(!on && !confirm(`Remove ${b.dataset.tog}? They'll be signed out of the console the next time it checks.`)) return;
    const {error} = await Cloud.sb.from("staff").update({active:on}).eq("email", b.dataset.tog);
    if(error) return toast(error.message); render();
  });
  team.querySelector("#tmAdd").onclick = async () => {
    const e = team.querySelector("#tmEmail").value.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return toast("Enter an email address");
    const {error} = await Cloud.sb.from("staff").upsert({email:e, active:true, added_by:Cloud.email});
    if(error) return toast(error.message);
    toast(`${e} added — they can sign in now`); render();
  };
  const {data:log} = await Cloud.sb.from("audit_log").select("at,actor,kind,doc_id,action").order("at", {ascending:false}).limit(120);
  const box = act.querySelector("#actList");
  if(!log || !log.length){ box.innerHTML = `<p class="muted">Nothing yet.</p>`; return; }
  // fold bursts (starting a month writes a line per property) into one entry
  const groups = [];
  log.forEach(l => {
    const month = l.kind === "pm_row" ? String(l.doc_id).split("|")[0] : null;
    const g = groups[groups.length - 1];
    if(g && g.actor === l.actor && g.action === l.action && g.kind === l.kind && g.month === month && month && Math.abs(new Date(g.at) - new Date(l.at)) < 10 * 60000){ g.n++; return; }
    groups.push({actor:l.actor, action:l.action, kind:l.kind, doc_id:l.doc_id, month, at:l.at, n:1});
  });
  const who = e => e === Cloud.email ? "You" : cloudWho(e);
  const verb = a => a === "INSERT" ? "added" : a === "DELETE" ? "removed" : "updated";
  box.innerHTML = `<div class="act-list">${groups.slice(0, 60).map(g => `<div class="act-r"><span class="avatar sm">${esc(initials(who(g.actor) === "You" ? Cloud.name : who(g.actor)))}</span>
    <div><b>${esc(who(g.actor))}</b> ${verb(g.action)} ${g.n > 1 ? `${g.n} property lines in ${esc(monthLabel(g.month))}` : esc(cloudLabel(g.kind, g.doc_id, g.kind === "pj_property" ? S.properties.find(p => p.id === g.doc_id) : g.kind === "pm_property" ? pmProp(g.doc_id) : null))}
    <span class="muted"> · ${new Date(g.at).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})}</span></div></div>`).join("")}</div>`;
}

/* Replace everything with a nightly backup. The restore is itself a normal, logged save,
   so it can be undone by restoring a newer backup. */
function cloudRestore(d, name){
  if(!d || d.kind !== "phd-office-backup" || !Array.isArray(d.docs)) return alert("That isn't an office backup. Choose a file from Drive → PHD Billing Backups.");
  const when = new Date(d.exported_at).toLocaleString([], {month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit"});
  const typed = prompt(`Restore the whole office to ${when}?\n\nEvery change made after that is replaced for everyone. Type RESTORE to continue.`);
  if(typed !== "RESTORE") return;
  snapshot();
  const keepUi = S.ui, keepActive = S.activeId;
  S = seedState(); S.properties = []; S.owners = []; S.inboxDone = {}; S.inboxConn = null; S.stmtConn = null; S.billMail = null; S.pmVendors = null; S.acct = null; S.pmSettings = null; S.pmAlerts = {}; S.pm = {properties:[], rows:{}, meta:{}, deposits:{}};
  const main = d.docs.find(r => r.kind === "shared" && r.id === "main");
  d.docs.filter(r => !r.deleted && !(r.kind === "shared" && r.id === "main")).forEach(r => cloudApply(r.kind, r.id, r.data, false));
  if(main && !main.deleted) cloudApply("shared", "main", main.data, false);
  S.version = 3; S.ui = keepUi; S.activeId = keepActive;
  commit();
  toast(`Restored from ${name || "backup"} (${when}) — saving for everyone…`);
}

/* =====================================================================
   NAVIGATION & FINISHING TOUCHES
   - Back arrow in the header (and the browser's back/forward, Alt+←):
     returns to the page you came from, at the same scroll position,
     with the row you opened briefly highlighted.
   - Previous / next property on a property page ([ and ] keys too).
   - Small Google Drive, Gmail, Google Sheets and Nickel logos on the
     buttons that open those apps, and quick links in the header:
     the property's receipt folder in Drive, its emails in Gmail, the map.
   - Hover an email address to write in Gmail or copy it.
   - A back-to-top button on long pages.
   ===================================================================== */
const NAV = {stack:[], cur:null, restoring:false, quiet:false, lastEl:null};
const MAIL_PM = () => ((typeof stmtConn === "function" && stmtConn()) || {}).mailbox || "pm@phdproperties.realestate";
const MAIL_BILL = () => ((typeof bmConn === "function" && bmConn()) || {}).mailbox || "billing@phdproperties.realestate";

/* ---------- brand marks (tiny, inline) ---------- */
const BRAND_SVG = {
  drive:`<svg viewBox="0 0 87.3 78" aria-hidden="true"><path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/><path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/><path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/><path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/><path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/><path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/></svg>`,
  gmail:`<svg viewBox="52 42 88 66" aria-hidden="true"><path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6"/><path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15"/><path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"/><path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92"/><path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"/></svg>`,
  sheets:`<svg viewBox="0 0 20 24" aria-hidden="true"><path fill="#0F9D58" d="M2 0h11l7 7v15a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z"/><path fill="#87CEAC" d="M13 0v5a2 2 0 0 0 2 2h5z"/><path fill="#fff" d="M4.5 11h11v8h-11zm1.6 1.5v1.8h3.1v-1.8zm4.7 0v1.8h3.1v-1.8zm-4.7 3.2v1.8h3.1v-1.8zm4.7 0v1.8h3.1v-1.8z"/></svg>`,
  nickel:`<svg viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" rx="5" fill="#2A1F1F"/><rect x="4.4" y="4.4" width="11.2" height="11.2" rx="4" fill="#fff"/><circle cx="10" cy="10" r="2.4" fill="#2A1F1F"/></svg>`,
  maps:`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 14.5s-4.5-4.1-4.5-7.6a4.5 4.5 0 0 1 9 0c0 3.5-4.5 7.6-4.5 7.6z"/><circle cx="8" cy="6.9" r="1.6"/></svg>`,
  copy:`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V3.9c0-.9-.7-1.4-1.4-1.4H3.9c-.8 0-1.4.6-1.4 1.4v5.2c0 .8.6 1.4 1.4 1.4h1.6"/></svg>`
};
const brandIc = k => `<span class="brand-ic b-${k}">${BRAND_SVG[k]}</span>`;
// Google picks the account from ?authuser=<email>: it opens that mailbox or Drive when the account is signed in
// in this browser, and asks to sign in to it when it isn't (rather than opening whoever is signed in first)
const withAcct = (url, acct) => { if(!acct || !url) return url; const [base, hash] = String(url).split("#"); return base + (base.includes("?") ? "&" : "?") + "authuser=" + encodeURIComponent(acct) + (hash != null ? "#" + hash : ""); };
const gmailSearch = (acct, q) => withAcct("https://mail.google.com/mail/", acct) + "#search/" + encodeURIComponent(q);
const gmailCompose = (acct, to, su) => withAcct("https://mail.google.com/mail/", acct) + `&view=cm&fs=1&to=${encodeURIComponent(to || "")}${su ? "&su=" + encodeURIComponent(su) : ""}`;
const DRIVE_ACCT = () => (DRV.data && DRV.data.mailbox) || "billing@phdproperties.realestate";
const mapsUrl = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/* ---------- receipt folders in Drive (from the receipt inbox script) ---------- */
const DRV = {data:null, loading:false, failed:false};
function drvLoad(){
  if(DRV.data || DRV.loading || DRV.failed || typeof inboxConn !== "function" || !inboxConn()) return;
  DRV.loading = true;
  inboxGet({action:"folders"}).then(j => { DRV.data = {root:j.root || "", sheet:j.sheet || "", mailbox:j.mailbox || "", map:{}}; (j.folders || []).forEach(f => DRV.data.map[drvKey(f.name)] = f.url); })
    .catch(() => { DRV.failed = true; }).finally(() => { DRV.loading = false; navTools(); });
}
const drvKey = s => String(s || "").replace(/[\\/:*?"<>|#%]+/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
// the property's folder, or a Drive search for it until the script is updated
function drvFolder(name){
  const k = drvKey(name), m = DRV.data && DRV.data.map;
  if(m && k){ if(m[k]) return {url:m[k], exact:true}; const hit = Object.keys(m).find(x => x.startsWith(k) || k.startsWith(x) && x.length > 6); if(hit) return {url:m[hit], exact:true}; }
  return {url:`https://drive.google.com/drive/search?q=${encodeURIComponent('"' + String(name || "").split(",")[0] + '"')}`, exact:false};
}

/* ---------- back stack ---------- */
const navKey = s => s ? JSON.stringify([s.view, s.activeId, s.ui.mode, s.ui.pmPropId || "", s.ui.ownerId || ""]) : "";
function navSnap(){ let ui = {}; try{ ui = JSON.parse(JSON.stringify(S.ui)); }catch(e){} return {ui, activeId:S.activeId, view:S.ui.view, title:$("#pgTitle").textContent || "", crumb:$("#pgCrumb").textContent || ""}; }
function navPath(el){
  const v = $("#view"), p = [];
  while(el && el !== v){ const par = el.parentElement; if(!par) return null; p.unshift([...par.children].indexOf(el)); el = par; }
  return el === v ? p : null;
}
function navFind(p){ if(!p || !p.length) return null; let el = $("#view"); for(const i of p){ el = el && el.children[i]; } return el || null; }
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("#view tr, #view .td-r, #view .pmc, #view [data-pp], #view [data-pmid], #view [data-b], #view .al-r, #view li");
  NAV.lastEl = t || (e.target.closest && e.target.closest("#view .card")) || null;
}, true);

const navGo0 = go;
go = function(view, propId){
  const from = NAV.restoring || NAV.quiet ? null : NAV.cur, y = window.scrollY, loc = NAV.lastEl && document.contains(NAV.lastEl) ? navPath(NAV.lastEl) : null;
  NAV.lastEl = null;
  const r = navGo0(view, propId);
  if(from && navKey(NAV.cur) !== navKey(from)){
    from.y = y; from.loc = loc; from.h = false;
    try{ history.pushState({phd:1}, ""); from.h = true; }catch(e){}
    NAV.stack.push(from); if(NAV.stack.length > 40) NAV.stack.shift();
    navBackBtn();
  }
  return r;
};
function navRestore(s){
  NAV.restoring = true;
  try{
    Object.keys(s.ui).forEach(k => { if(!/Last$/.test(k)) S.ui[k] = s.ui[k]; });
    if(s.activeId && typeof ALL !== "undefined" && ALL[s.activeId]) S.activeId = s.activeId;
    navGo0(s.view, s.activeId && ALL[s.activeId] ? s.activeId : undefined);
  } finally { NAV.restoring = false; }
  requestAnimationFrame(() => {
    window.scrollTo(0, s.y || 0);
    const el = navFind(s.loc);
    if(el && el !== $("#view")){
      const r = el.getBoundingClientRect();
      if(r.bottom < 70 || r.top > window.innerHeight - 40) el.scrollIntoView({block:"center"});
      el.classList.remove("nav-flash"); void el.offsetWidth; el.classList.add("nav-flash");
      setTimeout(() => el.classList.remove("nav-flash"), 1700);
    }
  });
  navBackBtn();
}
function navBack(){
  const s = NAV.stack[NAV.stack.length - 1]; if(!s) return;
  if(s.h){ try{ history.back(); return; }catch(e){} }
  NAV.stack.pop(); navRestore(s);
}
window.addEventListener("popstate", () => {
  const s = NAV.stack.pop(); if(!s) return;
  if($("#sheet").classList.contains("on")) closeSheet();
  navRestore(s);
});
function navBackBtn(){
  let b = $("#navBack");
  if(!b){
    b = elm("button","nav-back"); b.id = "navBack"; b.type = "button";
    b.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.8 3.5 5.3 8l4.5 4.5"/></svg>`;
    b.onclick = navBack;
    const t = $("#topbar .hd-title"); t.parentNode.insertBefore(b, t);
  }
  const s = NAV.stack[NAV.stack.length - 1];
  b.hidden = !s;
  if(s){ const lbl = s.title || s.crumb || "previous page"; b.title = `Back to ${lbl}`; b.setAttribute("aria-label", `Back to ${lbl}`); }
}

/* ---------- property page: previous / next in the list you came from ---------- */
const navPmOpen0 = pmOpenProperty;
pmOpenProperty = function(id){
  const ids = [...new Set([...document.querySelectorAll("#view [data-pp], #view [data-pmid], #view [data-pmp]")].map(e => e.dataset.pp || e.dataset.pmid || e.dataset.pmp).filter(x => pmProp(x)))];
  if(ids.length > 1 && ids.includes(id) && S.ui.view !== "pmProperty") S.ui.pmPropOrder = ids;
  return navPmOpen0(id);
};
function navPmOrder(){
  const o = (S.ui.pmPropOrder || []).filter(id => pmProp(id));
  if(o.includes(S.ui.pmPropId)) return o;
  return pmLiveProps().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true})).map(p => p.id);
}
function navPmStep(d){
  const o = navPmOrder(), i = o.indexOf(S.ui.pmPropId); if(i < 0 || !o.length) return;
  const id = o[(i + d + o.length) % o.length];
  S.ui.pmPropId = id; NAV.quiet = true;
  try{ go("pmProperty"); } finally { NAV.quiet = false; }
}
document.addEventListener("keydown", e => {
  if(e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target.tagName || "")) || e.target.isContentEditable) return;
  if($("#sheet").classList.contains("on") || $("#cmdk").classList.contains("on")) return;
  if(S.ui.view === "pmProperty" && (e.key === "[" || e.key === "]")){ e.preventDefault(); navPmStep(e.key === "]" ? 1 : -1); }
});

/* ---------- header quick links ---------- */
function navTools(){
  const box = $("#pgActions"); if(!box) return;
  const old = box.querySelector(".hd-tools"); if(old) old.remove();
  const L = [], v = S.ui.view;
  const link = (k, href, title, label) => { if(k === "drive" || k === "sheets") href = withAcct(href, DRIVE_ACCT()); L.push(`<a class="tool ${label ? "wl" : ""}" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(title)}" aria-label="${esc(title)}">${brandIc(k)}${label ? `<span>${esc(label)}</span>` : ""}</a>`); };
  let pager = "";
  if(v === "pmProperty" && typeof pmProp === "function" && pmProp(S.ui.pmPropId)){
    drvLoad();
    const p = pmProp(S.ui.pmPropId), o = ownerById(p.ownerId), street = String(p.address || p.name).split(",")[0];
    const order = navPmOrder(), i = order.indexOf(p.id);
    if(order.length > 1 && i >= 0){
      const prev = pmProp(order[(i - 1 + order.length) % order.length]), next = pmProp(order[(i + 1) % order.length]);
      pager = `<div class="pager" role="group" aria-label="Other properties"><button type="button" data-step="-1" title="Previous: ${esc(prev.name)}  [" aria-label="Previous property">‹</button><span>${i + 1} of ${order.length}</span><button type="button" data-step="1" title="Next: ${esc(next.name)}  ]" aria-label="Next property">›</button></div>`;
    }
    const f = drvFolder(p.name);
    link("drive", f.url, f.exact ? `Receipts for ${p.name} in Drive` : `Search Drive for ${street}`);
    const q = [`"${street}"`].concat(o && o.email ? String(o.email).split(/[,;\s]+/).filter(Boolean) : []).join(" OR ");
    link("gmail", gmailSearch(MAIL_PM(), q), `Emails about ${street} in ${MAIL_PM()}`);
    if(p.address || p.name) link("maps", mapsUrl(p.address || p.name), "Open in Maps");
  } else if(["overview","txns","invoices","scope","settings"].includes(v) && typeof P === "function"){
    drvLoad();
    const p = P(), street = String(p.address || p.name).split(",")[0], o = typeof ownerById === "function" && p.ownerId ? ownerById(p.ownerId) : null;
    const f = drvFolder(p.name);
    link("drive", f.url, f.exact ? `Receipts for ${p.name} in Drive` : `Search Drive for ${street}`);
    const q = [`"${street}"`].concat(o && o.email ? String(o.email).split(/[,;\s]+/).filter(Boolean) : []).join(" OR ");
    link("gmail", gmailSearch(MAIL_BILL(), q), `Invoice emails for ${street} in ${MAIL_BILL()}`);
    link("maps", mapsUrl(p.address || p.name), "Open in Maps");
  } else if(v === "owners" && S.ui.ownerId && ownerById(S.ui.ownerId)){
    const o = ownerById(S.ui.ownerId), em = String(o.email || "").split(/[,;\s]+/).filter(Boolean);
    const pmSide = typeof pmState === "function" && pmState().properties.some(p => p.ownerId === o.id);
    const acct = pmSide ? MAIL_PM() : MAIL_BILL();
    if(em.length){ link("gmail", gmailCompose(acct, em.join(","), ""), `Write to ${ownerLabel(o)} from ${acct}`); L.push(`<a class="tool" href="${esc(gmailSearch(acct, em.join(" OR ")))}" target="_blank" rel="noopener" title="${esc(`Past emails with ${ownerLabel(o)}`)}" aria-label="Past emails"><svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5L14 14" stroke-linecap="round"/></svg></a>`); }
    link("nickel", typeof NICKEL_APP !== "undefined" ? NICKEL_APP : "https://app.nickel.com", "Open Nickel");
  } else if(v === "pmBills" || v === "pmVendors"){
    drvLoad();
    if(DRV.data && DRV.data.root) link("drive", DRV.data.root, "Receipts and invoices in Drive");
    link("nickel", NICKEL_APP, "Open Nickel");
  } else if(v === "pmInvoices" || v === "payments" || v === "pmPaySetup"){
    link("nickel", NICKEL_APP, "Open Nickel");
  } else if(v === "inbox"){
    drvLoad();
    if(DRV.data && DRV.data.root) link("drive", DRV.data.root, "Receipt folders in Drive");
    if(DRV.data && DRV.data.sheet) link("sheets", DRV.data.sheet, "Receipt log in Google Sheets");
  }
  if(!L.length && !pager) return;
  const g = elm("div","hd-tools"); g.innerHTML = pager + (L.length ? `<div class="tools">${L.join("")}</div>` : "");
  g.querySelectorAll("[data-step]").forEach(b => b.onclick = () => navPmStep(Number(b.dataset.step)));
  box.insertBefore(g, box.firstChild);
}

/* ---------- logos on buttons that open Drive, Gmail or Nickel ---------- */
function brandOf(el){
  const h = (el.getAttribute("href") || "").toLowerCase(), t = (el.textContent || "").replace(/\s+/g, " ").trim();
  if(/drive\.google|docs\.google\.com\/(document|file)/.test(h)) return "drive";
  if(/docs\.google\.com\/spreadsheets/.test(h)) return "sheets";
  if(/mail\.google|^mailto:/.test(h)) return "gmail";
  if(/nickel/.test(h)) return "nickel";
  if(/nickel/i.test(t) || /^create in quickbooks/i.test(t) || el.id === "vnAsk" || el.dataset.rc != null) return "nickel";
  if(/^(email|send|remind|save (as|\d+ as) gmail|save .*draft)/i.test(t)) return "gmail";
  if(/^pay(\b| \d)/i.test(t) && typeof nickelOn === "function" && nickelOn()) return "nickel";
  return null;
}
function navBrandify(root){
  if(!root) return;
  root.querySelectorAll(".btn:not([data-br]), a[href]:not(.btn):not([data-br])").forEach(el => {
    el.dataset.br = "1";
    if(el.closest(".hd-tools") || el.closest(".bu-drop")) return;
    if(!el.classList.contains("btn")){
      const h = el.getAttribute("href") || "";
      if(/^mailto:/i.test(h) && !el.closest(".no-mini")) return navMailMini(el);
      const k = /docs\.google\.com\/spreadsheets/.test(h) ? "sheets" : /drive\.google|docs\.google/.test(h) ? "drive" : /nickel/i.test(h) ? "nickel" : "";
      if(k && !el.querySelector("svg") && !el.closest(".mini-acts")) el.insertAdjacentHTML("afterbegin", brandIc(k));
      return;
    }
    const mh = el.getAttribute("href") || "";
    if(/^mailto:/i.test(mh)){   // email buttons open Gmail from the right mailbox
      const [to, qs] = mh.replace(/^mailto:/i, "").split("?"), su = new URLSearchParams(qs || "").get("subject") || "";
      el.setAttribute("href", gmailCompose(S.ui.mode === "pm" ? MAIL_PM() : MAIL_BILL(), decodeURIComponent(to), su)); el.target = "_blank"; el.rel = "noopener";
    }
    const k = brandOf(el); if(!k) return;
    const first = el.querySelector("svg.ic"); if(first) first.remove();
    el.insertAdjacentHTML("afterbegin", brandIc(k));
    el.classList.add("has-brand");
  });
}
// hover an email address: write in Gmail from the right mailbox, or copy it
function navMailMini(a){
  const addr = decodeURIComponent((a.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0]); if(!addr) return;
  const acct = S.ui.mode === "pm" ? MAIL_PM() : MAIL_BILL();
  const w = elm("span","mini-acts");
  w.innerHTML = `<a class="mini" href="${esc(gmailCompose(acct, addr, ""))}" target="_blank" rel="noopener" title="Write in Gmail from ${esc(acct)}" data-br="1">${BRAND_SVG.gmail}</a><button type="button" class="mini" title="Copy ${esc(addr)}" data-br="1">${BRAND_SVG.copy}</button>`;
  w.querySelector("button").onclick = e => { e.preventDefault(); e.stopPropagation(); navCopy(addr); };
  w.querySelector("a").onclick = e => e.stopPropagation();
  a.insertAdjacentElement("afterend", w);
}
function navCopy(text){
  const done = () => toast(`Copied ${text}`);
  try{ navigator.clipboard.writeText(text).then(done, () => { navCopyOld(text); done(); }); }catch(e){ navCopyOld(text); done(); }
}
function navCopyOld(text){ const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try{ document.execCommand("copy"); }catch(e){} t.remove(); }
let navBrandQ = 0;
const navBrandSoon = () => { if(navBrandQ) return; navBrandQ = requestAnimationFrame(() => { navBrandQ = 0; navBrandify($("#view")); navBrandify($("#sheet")); navBrandify($("#pgActions")); }); };
new MutationObserver(navBrandSoon).observe($("#view"), {childList:true, subtree:true});
new MutationObserver(navBrandSoon).observe($("#sheet"), {childList:true, subtree:true});
new MutationObserver(navBrandSoon).observe($("#pgActions"), {childList:true});

/* ---------- back to top ---------- */
(function(){
  const b = elm("button","to-top"); b.type = "button"; b.title = "Back to top"; b.setAttribute("aria-label", "Back to top");
  b.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 9.8 8 5.3l4.5 4.5"/></svg>`;
  b.onclick = () => window.scrollTo({top:0, behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  document.body.appendChild(b);
  let q = 0; window.addEventListener("scroll", () => { if(q) return; q = requestAnimationFrame(() => { q = 0; b.classList.toggle("on", window.scrollY > 900); }); }, {passive:true});
})();

/* ---------- after every render ---------- */
const navRender0 = render;
render = function(){
  const r = navRender0.apply(this, arguments);
  try{ NAV.cur = navSnap(); navTools(); navBackBtn(); navBrandSoon(); }catch(e){ console.warn(e); }
  return r;
};

/* ===================== BOOT ===================== */
function chip(){
  if(typeof Cloud !== "undefined" && Cloud.ready) return cloudChip();
  const b = $("#saveChip"), l = $("#saveLbl"); if(!b) return;
  b.classList.remove("live","attn");
  if(!AutoFile.supported()){ l.textContent = "Saved in browser"; b.title = "Autosaving to a file needs Chrome or Edge"; return; }
  if(AutoFile.state === "on"){
    b.classList.add("live");
    const s = AutoFile.lastSaved ? (Date.now()-AutoFile.lastSaved)/1000 : null;
    l.textContent = (s !== null && s < 6) ? "Saved just now" : AutoFile.name;
    b.title = "Autosaving to " + AutoFile.name;
  } else if(AutoFile.state === "needs"){ b.classList.add("attn"); l.textContent = "Reconnect autosave"; }
  else { l.textContent = "Turn on autosave"; b.title = "Choose a file to autosave into"; }
}
$("#saveChip").onclick = () => Cloud.ready ? go("team") : AutoFile.state === "needs" ? AutoFile.regrant() : AutoFile.connect();
$("#scrim").onclick = closeSheet;
$("#filePick").onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const d = migrate(JSON.parse(r.result));
      if(!d) throw 0;
      const keep = {pm:S.pm, inboxConn:S.inboxConn, owners:S.owners, ui:S.ui};
      snapshot(); S = d; S.ui = Object.assign({view:"portfolio", open:{}, showExcluded:true}, keep.ui || {}, {view:"portfolio", mode:"projects"});
      if(!d.pm && keep.pm) S.pm = keep.pm;
      if(!d.inboxConn && keep.inboxConn) S.inboxConn = keep.inboxConn;
      if((!d.owners || !d.owners.length) && keep.owners && keep.owners.length) S.owners = keep.owners;
      commit(); toast(`Restored ${d.properties.length} propert${d.properties.length===1?"y":"ies"}`);
    }catch(err){ alert("That isn't a billing backup. Choose the JSON file this app downloaded."); }
  };
  r.readAsText(f); e.target.value = "";
};
document.addEventListener("keydown", e => {
  const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
  const k = e.key.toLowerCase();
  if((e.metaKey || e.ctrlKey) && k === "k"){ e.preventDefault(); $("#cmdk").classList.contains("on") ? closeCmd() : openCmd(); return; }
  if(e.key === "Escape"){
    if($("#cmdk").classList.contains("on")){ closeCmd(); return; }
    closeSheet(); $("#propMenu").classList.remove("on"); closeTagPop(); return;
  }
  if((e.metaKey || e.ctrlKey) && k === "z" && !typing){ e.preventDefault(); undo(); return; }
  if(typing || e.metaKey || e.ctrlKey || e.altKey || $("#sheet").classList.contains("on") || $("#cmdk").classList.contains("on")) return;
  if(k === "n"){ e.preventDefault(); goQuick(); }
  else if(k === "/"){ e.preventDefault(); openCmd(); }
  else if(k === "g"){ S.ui._g = Date.now(); }
  else if(S.ui._g && Date.now() - S.ui._g < 900){
    const dest = {o:"overview", t:"txns", i:"invoices", r:"reconcile", p:"portfolio", w:"owner", s:"settings"}[k];
    S.ui._g = 0; if(dest){ e.preventDefault(); go(dest); }
  }
});
window.addEventListener("focus", () => { if(!AutoFile.pending) AutoFile.pull(); });
window.addEventListener("beforeunload", () => { if(AutoFile.pending){ clearTimeout(AutoFile.pending); AutoFile.write(); } });

function startApp(){
  recalc(); if(freezeIssued()) recalc();
  fixActive(); S.properties.forEach(ownerOf);
  render(); setInterval(chip, 5000);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $("#cmdKey").textContent = mac ? "⌘K" : "Ctrl K";
  $("#cmdTrigger").onclick = () => openCmd();
  $("#qAdd").onclick = () => goQuick();
  if(Cloud.ready) cloudPresence();
  $("#qReconcile").onclick = () => go("reconcile");
  const tb = $("#topbar");
  window.addEventListener("scroll", () => tb.classList.toggle("scrolled", window.scrollY > 4), {passive:true});
}
(async function init(){
  if(Cloud.enabled()) return Cloud.boot();
  const saved = migrate(await Store.load());
  if(saved) S = Object.assign(saved, {ui:Object.assign({view:"portfolio", unit:null, query:"", showExcluded:true, open:{}}, saved.ui||{})});
  try{ await AutoFile.init(); }catch(e){}
  startApp();
})();
