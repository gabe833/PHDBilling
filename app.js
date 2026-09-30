
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
  const portfolioView = S.ui.view === "portfolio" || S.ui.view === "reconcile" || S.ui.view === "owners" || S.ui.view === "inbox" || S.ui.view === "team" || S.ui.mode === "pm";
  renderModeSwitch();
  $("#swName").textContent = S.ui.view === "portfolio" ? "All properties" : S.ui.view === "reconcile" ? "Reconcile" : S.ui.view === "owners" ? "Owners" : S.ui.view === "inbox" ? "Receipt inbox" : S.ui.view === "team" ? "Team" : p.name;
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
    pmProps:  ["Property management", "Properties", "Every rental PHD manages — rent, fee rule and owner"],
    pmDeposits:["Property management", "Security deposits", "What PHD is holding, for whom"],
    pmIncome: ["Property management", "Income", "PHD's management income, month by month"],
    settings: [p.name, "Property settings", "Units, fee, and cap for this property"]
  }[S.ui.view] || [p.name, "Overview", ""];
  $("#pgCrumb").textContent = T[0]; $("#pgTitle").textContent = T[1]; $("#pgSub").textContent = T[2];
  $("#pgActions").innerHTML = "";
  const v = $("#view"); v.innerHTML = "";
  (({portfolio:pgPortfolio, reconcile:pgReconcile, overview:pgOverview, txns:pgTxns, scope:pgScope, invoices:pgInvoices, owner:pgOwner, owners:pgOwners, inbox:pgInbox, team:pgTeam, pmMonth:pgPmMonth, pmProps:pgPmProps, pmDeposits:pgPmDeposits, pmIncome:pgPmIncome, settings:pgSettings})[S.ui.view] || pgOverview)();
  chip();
}
function actions(list){
  const box = $("#pgActions");
  list.forEach(([lbl,fn,cls]) => { const b = elm("button","btn "+(cls||""),lbl); b.onclick = fn; box.appendChild(b); });
}
function go(view, propId){
  if(PM_VIEWS.has(view)) S.ui.mode = "pm";
  else if(!["owners","inbox","team"].includes(view)) S.ui.mode = "projects";
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
  mk("portfolio", "All properties", "grid", pr.issues ? `<i class="badge alert">${pr.issues}</i>` : `<i class="badge">${pr.props}</i>`);
  { const nOwn = (S.owners||[]).filter(ownerLabel).length;
    mk("owners", "Owners", "user", `<i class="badge">${nOwn}</i>`);
    n.lastChild.onclick = () => { S.ui.ownerId = null; go("owners"); }; }
  { const nIn = inboxCount();
    mk("inbox", "Receipt inbox", "receipt", nIn ? `<i class="badge alert" style="background:var(--accent);color:#fff">${nIn}</i>` : (inboxConn() ? null : `<i class="badge" style="color:var(--gold)">set up</i>`));
    n.lastChild.onclick = () => { go("inbox"); inboxRefresh(); }; }
  if(typeof Cloud !== "undefined" && Cloud.ready) mk("team", "Team", "user", Cloud.online.length ? `<i class="badge" style="color:var(--green)">${Cloud.online.length + 1} on</i>` : null);
  const unrec = reconcileEntries().filter(e => !e.reconciled).length;
  mk("reconcile", "Reconcile", "check", unrec ? `<i class="badge">${unrec}</i>` : null);
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
    if(!S.ui.showExcluded && t.status !== "billable") return false;
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

  const states = ["Unbilled","Invoiced","Part invoiced","Paid","Part paid","On hold","Excluded","Unassigned"];
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
        <option value="billable">Bill to owner</option><option value="review">On hold</option><option value="excluded">Not billable</option></select>
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
      re(() => P().transactions.forEach(x => { if(ids.includes(x.id)) x.status = val; })); toast(`${ids.length} updated${note(sk)}`); };
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
  if(t.status !== "billable") tr.classList.add("off");
  if(COMP.notes.some(n => n.txnId === t.id && n.level === "err")) tr.classList.add("bad");
  const unit = t.scope.type === "single"
    ? (p.units.find(u => u.id === t.scope.unit)?.name || "—")
    : p.units.filter(u => Number(t.scope.splits[u.id]) > 0).map(u => `${u.name} ${t.scope.splits[u.id]}%`).join(" · ");
  let marks = "";
  if(t.reconciled) marks += `<button type="button" class="mark green" data-rchip title="Reconciled${t.reconciledAt?" "+t.reconciledAt:""} — click to unmark">✓ Reconciled</button>`;
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
        <div class="item-s">${esc(t.vendor||"—")}${t.receipt?" · "+esc(String(t.receipt).slice(0,54)):""}</div></td>
    <td style="font-size:13px">${esc(unit)}</td>
    <td class="r num"${isCredit?' style="color:var(--green)"':""}>${usd(cents(t.amount))}</td>
    <td>${lands}</td>
    <td><span class="tag ${tagCls}">${info.pay}</span>${doc?" "+doc:""}</td>
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
      <label class="fld"><span>Invoice link</span><input type="text" data-reg="link" value="${esc(inv.reg.link||"")}" placeholder="QuickBooks URL"></label>
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
          <option value="excluded" ${t.status==="excluded"?"selected":""}>Not billable</option>
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
      status:$("#e_status").value,
      party:t.party||"Owner", notes:$("#e_notes").value.trim(),
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
  const list = live().map(p => ({id:p.id, name:p.name, address:p.address || "", units:p.units.map(u => ({id:u.id, name:u.name}))}))
    .concat(pmLiveProps().map(p => ({id:p.id, name:p.name + " (managed rental)", address:p.address || "", units:[]})));
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
  const items = INBOX.items;
  const pend = items.filter(i => i.status === "pending"), errs = items.filter(i => i.status === "error");
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
    amount: it.total ? String(it.total) : "", credit: !!it.is_credit
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
        <span>${esc([it.source === "drive" ? "Dropped in Drive" : (it.from || "Email"), it.received_at ? fdateS(String(it.received_at).slice(0,10)) : "", it.order_no ? "Order " + it.order_no : ""].filter(Boolean).join(" · "))}</span></div></div>
      ${isErr ? `<span class="tag red">Couldn't read</span>` : `<span class="tag ${conf}" title="${esc(it.reason || "")}">${it.confidence === "high" ? "Confident match" : it.confidence === "medium" ? "Likely match" : "Check the details"}</span>`}
      ${it.file_url ? `<a class="btn sm" href="${esc(it.file_url)}" target="_blank" rel="noopener">${icon("file")} Open receipt</a>` : ""}
      ${preview ? `<button class="btn sm ghost" data-x="prev">${INBOX.open[it.id] ? "Hide preview" : "Preview"}</button>` : ""}
    </div>
    ${isErr ? `<div class="ib-errline">${esc(it.error || "Unknown error")}</div>` : ""}
    ${it.reason && !isErr ? `<div class="ib-why">${icon("bolt")} ${esc(it.reason)}</div>` : ""}
    <div class="ib-body">
      <div class="ib-form">
        <div class="f2">
          <label class="fld"><span>Property</span><select data-f="propId"><option value="">Choose…</option>
            <optgroup label="Project billing">${live().map(p => `<option value="${p.id}" ${p.id === d.propId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>
            ${pmLiveProps().length ? `<optgroup label="Property management — adds a repair">${pmLiveProps().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric:true})).map(p => `<option value="${p.id}" ${p.id === d.propId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</optgroup>` : ""}</select></label>
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
        <label class="switchbox"><input type="checkbox" data-f="credit" ${d.credit ? "checked" : ""}> Refund / return — reduces the next open invoice</label>
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
      ${isErr ? `<button class="btn sm" data-x="retry">Try reading again</button>` : ""}
      <button class="btn sm ghost danger" data-x="reject">Not billable — dismiss</button>
      <span style="flex:1"></span>
      <button class="btn sm" data-x="edit" ${inboxReady(d) ? "" : "disabled"}>Approve & open</button>
      <button class="btn sm primary" data-x="ok" ${inboxReady(d) ? "" : "disabled"}>Approve${prop ? " to " + esc(prop.name) : ""}</button>
    </div>`;

  card.querySelectorAll("[data-f]").forEach(inp => {
    const k = inp.dataset.f;
    const upd = () => { d[k] = inp.type === "checkbox" ? inp.checked : inp.value;
      if(k === "propId" || k === "unit" || k === "credit" || k === "amount") card.replaceWith(inboxCard(it));
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

/* a receipt for a managed rental becomes a repair line on that property's month */
async function inboxApprovePm(it, openAfter){
  const d = INBOX.draft[it.id], p = pmProp(d.propId), m = d.pmMonth || inboxPmMonth();
  if((pmState().meta[m] || {}).closed && !confirm(`${monthLabel(m)} is closed. Add this repair to it anyway?`)) return;
  const amt = Math.round(Number(d.amount) * 100) / 100;
  const ext = ((it.file_name || "").match(/\.[a-z0-9]{2,4}$/i) || [".pdf"])[0];
  const fileName = `${d.date.replace(/-/g, "")} - ${p.name} - ${d.desc || "Repair"} - ${d.vendor || ""}`.replace(/\s+-\s*$/, "") + ext;
  snapshot();
  const row = pmEnsureRow(m, p.id);
  row.repairItems = row.repairItems || [];
  if(d.credit) row.adjustments = (row.adjustments || []).concat([{amount:amt, note:`Refund — ${d.vendor || ""} ${d.desc || ""}`.trim()}]);
  else row.repairItems.push({id:uid(), date:d.date, vendor:d.vendor.trim(), memo:(d.desc || "").trim(), link:it.file_url || "", amount:amt, feeMode:"auto", inbox:it.id});
  if(row.locked){ row.repairs = null; row.adminFee = null; }
  pmTouch(row);
  const msg = {decision:"approved", txnId:"pm:" + m + "|" + p.id, propertyName:p.name, fileName};
  inboxDone()[it.id] = {txn:msg.txnId, msg};
  INBOX.items = INBOX.items.filter(x => x.id !== it.id); delete INBOX.draft[it.id];
  commit();
  toast(`${d.credit ? "Refund" : "Repair"} ${usd(cents(amt))} added to ${p.name} · ${monthLabel(m)}`);
  if(openAfter){ S.ui.mode = "pm"; S.ui.pmMonth = m; go("pmMonth"); pmRowSheet(m, p.id, "repairs"); }
  try{ await inboxPost(Object.assign({action:"decide", id:it.id}, msg)); delete inboxDone()[it.id]; Store.save(S); }catch(e){}
}

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

function feeRuleText(r){
  if(!r) return "10%";
  return r.type === "flat" ? `${usd(cents(r.amount))} flat` : `${Number(r.rate)}%`;
}
function itemFeeC(it, prop){
  if(it.feeMode === "none") return 0;
  if(it.feeMode === "custom" || (it.feeMode == null && it.fee != null)) return cents(it.fee);
  return Math.round(cents(it.amount) * (Number(prop && prop.adminRate != null ? prop.adminRate : 10)) / 100);
}

/* one row's numbers, all in cents */
function pmCalc(row, prop){
  const items = row.repairItems || [];
  const itemsC = items.reduce((a, it) => a + cents(it.amount), 0);
  const itemsFeeC = items.reduce((a, it) => a + itemFeeC(it, prop), 0);
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
  const extrasC = PM_EXTRA.reduce((a, [k]) => a + nz(row[k]), 0);
  const phdC = pmFeeC + adminC + leasingC + extrasC;
  const dueC = nz(row.rentDue);
  const flags = [];
  if(recordedC != null && Math.abs(recordedC - calcC) > 1)
    flags.push({level:"warn", text:`Recorded payout ${usd(recordedC)} is ${usd(Math.abs(recordedC - calcC))} ${recordedC > calcC ? "more" : "less"} than the formula (${usd(calcC)})`});
  if(dueC > 0 && recv > 0 && recv < dueC && !row.locked) flags.push({level:"warn", text:`${usd(dueC - recv)} short of rent due`});
  if(dueC > 0 && !recv && !row.locked && row.month <= thisMonth()) flags.push({level:"info", text:"Rent not recorded yet"});
  if(payoutC < 0) flags.push({level:"warn", text:`Owner owes ${usd(-payoutC)} this month — repairs exceed rent`});
  if(!has(row.pmFee) && rule.check) flags.push({level:"info", text:`Fee rule ${feeRuleText(rule)} came from the workbook — confirm it`});
  if(has(row.pmFee) && !row.locked && Math.abs(cents(row.pmFee) - ruleFeeC) > 1) flags.push({level:"info", text:`PM fee set by hand (${usd(cents(row.pmFee))}; rule gives ${usd(ruleFeeC)})`});
  const [y, m] = String(row.month).split("-").map(Number);
  items.forEach(it => { if(it.date){ const d = new Date(it.date + "T00:00:00"); const months = (y - d.getFullYear()) * 12 + (m - 1 - d.getMonth());
    if(months > 14 || months < -2) flags.push({level:"info", text:`Repair date ${it.date} (${it.vendor || it.memo || "item"}) looks like a typo`}); } });
  return {dueC, recv, repairsC, adminC, pmFeeC, ruleFeeC, leasingC, otherC, adjC, calcC, recordedC, payoutC, extrasC, phdC, itemsC, itemsFeeC, flags};
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
    if(!closed) acts.push(["Import Magicdoor", () => pmImportSheet(m)]);
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
  const counts = {all:rows.filter(x => !x.row.detailOnly).length, attn:0, short:0, repairs:0};
  rows.forEach(({row, prop}) => { if(row.detailOnly) return; const c = pmCalc(row, prop);
    if(c.flags.some(x => x.level === "warn")) counts.attn++; if(c.dueC > 0 && c.recv < c.dueC) counts.short++; if(c.repairsC) counts.repairs++; });
  bar.innerHTML = `<div class="sc-seg">${[["all","All"],["attn","Needs a look"],["short","Unpaid / short"],["repairs","Has repairs"]]
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
    <th class="r">PM fee</th><th class="r">Leasing</th><th class="r">Other</th><th class="r">Owner payout</th><th class="r">PHD extras</th><th></th></tr></thead>`;
  const tb = elm("tbody");
  const vis = rows.filter(({row, prop}) => {
    if(row.detailOnly) return false;
    if(q && !`${prop.name} ${prop.address} ${ownerLabel(ownerById(prop.ownerId))}`.toLowerCase().includes(q)) return false;
    if(f === "all") return true;
    const c = pmCalc(row, prop);
    return f === "attn" ? c.flags.some(x => x.level === "warn") : f === "short" ? (c.dueC > 0 && c.recv < c.dueC) : f === "repairs" ? c.repairsC > 0 : true;
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
        <div class="item-s">${own ? esc(own) + " · " : ""}${feeRuleText(prop.feeRule)} fee${(row.payments || []).length ? ` · ${row.payments.length} payment${row.payments.length === 1 ? "" : "s"}` : ""}</div></td>
      ${cell(c.dueC)}
      <td class="r">${locked ? `<span class="num">${c.recv ? usd(c.recv) : "—"}</span>` : `<input class="pm-in num" type="number" step="0.01" data-recv="${prop.id}" value="${has(row.rentReceived) ? row.rentReceived : ""}" placeholder="${c.dueC ? (c.dueC / 100).toFixed(2) : "0.00"}">`}</td>
      <td class="r num">${c.repairsC ? `<button class="linkish" data-rep="${prop.id}">${usd(c.repairsC)}</button>` : `<span class="muted">—</span>`}${(row.repairItems || []).length ? `<div class="sub-n">${row.repairItems.length} item${row.repairItems.length === 1 ? "" : "s"}</div>` : ""}</td>
      ${cell(c.adminC)}${cell(c.pmFeeC)}${cell(c.leasingC)}${cell(c.otherC + c.adjC)}
      <td class="r num"><b${c.payoutC < 0 ? ' style="color:var(--red)"' : ""}>${usd(c.payoutC)}</b>${warn.length ? `<div class="sub-n" style="color:var(--gold)" title="${esc(warn.map(x => x.text).join("\n"))}">● check</div>` : ""}</td>
      ${cell(c.extrasC)}
      <td class="act">${warn.length ? `<span class="pm-dot warn" title="${esc(warn.map(x => x.text).join("\n"))}"></span>` : info.length ? `<span class="pm-dot" title="${esc(info.map(x => x.text).join("\n"))}"></span>` : ""}<span class="sc-go">›</span></td>`;
    tr.onclick = e => { if(e.target.closest("input,button")) return; pmRowSheet(m, prop.id); };
    tb.appendChild(tr);
  });
  const foot = elm("tr","ow-tot");
  foot.innerHTML = `<td><b>${vis.length === counts.all ? "All properties" : vis.length + " shown"}</b></td><td class="r num"><b>${usd(R.dueC)}</b></td><td class="r num"><b>${usd(R.recv)}</b></td>
    <td class="r num"><b>${usd(R.repairsC)}</b></td><td class="r num"><b>${usd(R.adminC)}</b></td><td class="r num"><b>${usd(R.pmFeeC)}</b></td>
    <td class="r num"><b>${usd(R.leasingC)}</b></td><td class="r num"><b>${usd(R.otherC)}</b></td><td class="r num"><b>${usd(R.payoutC)}</b></td><td class="r num"><b>${usd(R.extrasC)}</b></td><td></td>`;
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

function pmStartMonth(m){
  const props = pmLiveProps();
  if(!props.length) return toast("Add properties first");
  snapshot();
  const P2 = pmState();
  props.forEach(p => {
    const k = pmKey(m, p.id); if(P2.rows[k]) return;
    P2.rows[k] = {propertyId:p.id, month:m, rentDue:p.status === "active" ? p.rent : null,
                  status:p.status === "active" ? "" : PM_STATUS[p.status] || "", repairItems:[], adjustments:[]};
  });
  P2.meta[m] = Object.assign({month:m, deductions:[], withdrawals:[]}, P2.meta[m] || {});
  S.ui.pmMonth = m; commit(); toast(`${monthLabel(m)} started — ${props.length} properties`, true);
}
function pmCloseMonth(m, close){
  const R = pmMonthRoll(m);
  if(close && R.flags && !confirm(`${R.flags} propert${R.flags === 1 ? "y has" : "ies have"} a warning. Close ${monthLabel(m)} anyway? You can reopen it later.`)) return;
  snapshot();
  const mm = pmState().meta[m] = Object.assign({month:m, deductions:[], withdrawals:[]}, pmState().meta[m] || {});
  mm.closed = !!close; mm.closedAt = close ? new Date().toISOString() : null; mm.closedBy = close ? ((typeof Cloud !== "undefined" && Cloud.email) || "") : null;
  if(!close) pmMonthRows(m).forEach(({row}) => { if(row.locked) row.locked = false; });   // reopening an imported month makes it editable
  commit(); toast(close ? `${monthLabel(m)} closed` : `${monthLabel(m)} reopened`, true);
}

/* ---------------- one property, one month ---------------- */
function pmRowSheet(m, pid, focus){
  const prop = pmProp(pid); if(!prop) return;
  const row = JSON.parse(JSON.stringify(pmEnsureRow(m, pid)));
  row.repairItems = row.repairItems || []; row.adjustments = row.adjustments || [];
  const closed = !!(pmState().meta[m] || {}).closed, ro = closed || row.locked;
  const sh = $("#sheet");
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
            <div class="pm-item-x">${it.link ? `<a href="${esc(it.link)}" target="_blank" rel="noopener" class="btn sm ghost">Receipt</a>` : ""}${ro ? "" : `<button class="btn sm ghost" data-del="${i}">✕</button>`}</div>
            ${ro ? "" : `<input type="url" class="pm-link" data-ik="link" value="${esc(it.link || "")}" placeholder="Receipt link (optional)">`}
          </div>`).join("") || `<p class="muted" style="font-size:12.5px;margin:0">No repairs this month.</p>`}</div>
        ${ro ? "" : `<button class="btn sm" id="addItem">${icon("plus")} Add repair</button>`}
        ${has(row.repairs) && Math.abs(cents(row.repairs) - c.itemsC) > 1 ? `<p class="help">Workbook total ${usd(cents(row.repairs))}; the itemised detail adds to ${usd(c.itemsC)}.</p>` : ""}
        <div class="sectl" style="margin-top:14px">Adjustments to the owner</div>
        ${row.adjustments.map((a, i) => `<div class="pm-add"><input type="number" step="0.01" data-aj="${i}" data-ak="amount" value="${a.amount ?? ""}" ${ro ? "disabled" : ""}><input type="text" data-aj="${i}" data-ak="note" value="${esc(a.note || "")}" placeholder="Why (required)" ${ro ? "disabled" : ""}>${ro ? "" : `<button class="btn sm ghost" data-ajdel="${i}">✕</button>`}</div>`).join("")}
        ${ro ? "" : `<button class="btn sm ghost" id="addAdj">${icon("plus")} Add an adjustment</button><p class="help">Credits (+) or charges (−) that aren't repairs — e.g. a balance carried from last month. Each needs a reason, so a payout never changes without one.</p>`}
        <div class="sectl" style="margin-top:14px">PM fee</div>
        <div class="f2"><label class="fld"><span>PM fee</span><input type="number" step="0.01" data-k="pmFee" value="${has(row.pmFee) ? row.pmFee : ""}" placeholder="${(c.ruleFeeC / 100).toFixed(2)}" ${ro ? "disabled" : ""}>
          <span class="help">Blank uses the rule: ${feeRuleText(prop.feeRule)} of rent received = ${usd(c.ruleFeeC)}</span></label>
          <label class="fld"><span>Notes</span><input type="text" data-k="notes" value="${esc(row.notes || "")}" ${ro ? "disabled" : ""}></label></div>
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
      if(del) del.onclick = () => { row.repairItems.splice(i, 1); if(has(row.repairs)) row.repairs = null; if(has(row.adminFee)) row.adminFee = null; draw(); };
    });
    const ai = $("#addItem"); if(ai) ai.onclick = () => { row.repairItems.push({id:uid(), date:new Date().toISOString().slice(0,10), vendor:"", memo:"", amount:null, feeMode:"auto", link:""}); draw();
      const last = sh.querySelectorAll('.pm-item [data-ik="vendor"]'); if(last.length) last[last.length - 1].focus(); };
    const aa = $("#addAdj"); if(aa) aa.onclick = () => { row.adjustments.push({amount:null, note:""}); draw(); };
    sh.querySelectorAll("[data-aj]").forEach(inp => inp.onchange = () => { const a = row.adjustments[+inp.dataset.aj];
      a[inp.dataset.ak] = inp.dataset.ak === "amount" ? (inp.value === "" ? null : Math.round(Number(inp.value) * 100) / 100) : inp.value; draw(); });
    sh.querySelectorAll("[data-ajdel]").forEach(b => b.onclick = () => { row.adjustments.splice(+b.dataset.ajdel, 1); draw(); });
    $("#pmSave").onclick = () => {
      if(row.adjustments.some(a => has(a.amount) && !String(a.note || "").trim())) return toast("Every adjustment needs a reason");
      row.adjustments = row.adjustments.filter(a => has(a.amount));
      row.repairItems = row.repairItems.filter(it => has(it.amount) || it.vendor || it.memo);
      pmCommitRow(m, pid, row, false); closeSheet(); toast(`${prop.name} saved`, true);
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
  t.innerHTML = `<thead><tr><th>Property</th><th>Owner</th><th>Status</th><th class="r">Rent</th><th class="r">PM fee</th><th class="r">${lastM ? "Payout · " + monthShort(lastM) : "Last payout"}</th><th class="r">Deposit held</th><th></th></tr></thead>`;
  const tb = elm("tbody");
  list.forEach(p => {
    const r = lastM && pmRow(lastM, p.id), c = r && !r.detailOnly ? pmCalc(r, p) : null;
    const d = P2.deposits[p.id], held = d && d.current && d.current.amount ? cents(d.current.amount) : 0;
    const own = ownerLabel(ownerById(p.ownerId));
    const tr = elm("tr");
    tr.innerHTML = `<td><div class="item-t">${esc(p.name)}${p.feeRule && p.feeRule.check ? `<span class="mark gold" title="Fee rule came from the workbook and looks unusual">Check fee</span>` : ""}</div><div class="item-s">${esc(p.address)}</div></td>
      <td>${own ? esc(own) : `<span class="muted">—</span>`}</td>
      <td><span class="tag ${{active:"green", marketing:"gold", vacant:"grey", inactive:"grey"}[p.status] || "grey"}">${PM_STATUS[p.status] || p.status}</span></td>
      <td class="r num">${p.rent ? usd(cents(p.rent)) : "—"}</td><td class="r num">${feeRuleText(p.feeRule)}</td>
      <td class="r num">${c ? usd(c.payoutC) : "—"}</td><td class="r num">${held ? usd(held) : "—"}</td><td class="act"><span class="sc-go">›</span></td>`;
    tr.onclick = () => pmPropSheet(p.id);
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  const w = elm("div","tbl-wrap"); w.appendChild(t); card.appendChild(w);
  if(!list.length) card.appendChild(elm("div","empty",`<b>No properties here</b>`));
  v.appendChild(card);
}

function pmPropSheet(id){
  const isNew = !id;
  const p = isNew ? {id:"pm_" + uid(), name:"", address:"", aliases:[], rent:null, feeRule:{type:"pct", rate:10}, adminRate:10, status:"active", ownerId:null, tenants:"", notes:""}
                  : JSON.parse(JSON.stringify(pmProp(id)));
  const sh = $("#sheet");
  const owners = (S.owners || []).filter(ownerLabel).sort((a, b) => ownerLabel(a).localeCompare(ownerLabel(b)));
  sh.innerHTML = `
    <div class="sheet-h"><h3>${isNew ? "New property" : esc(p.name)}</h3><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <label class="fld"><span>Short name</span><input type="text" id="pp_name" value="${esc(p.name)}" placeholder="342 King St #A"></label>
      <label class="fld"><span>Full address</span><input type="text" id="pp_addr" value="${esc(p.address)}" placeholder="342 King St, A, Charleston, SC 29401"><span class="help">Used to match Magicdoor payments and receipts.</span></label>
      <div class="f2">
        <label class="fld"><span>Owner</span><select id="pp_owner"><option value="">— None yet —</option>${owners.map(o => `<option value="${o.id}" ${o.id === p.ownerId ? "selected" : ""}>${esc(ownerLabel(o))}</option>`).join("")}<option value="__new">+ New owner…</option></select></label>
        <label class="fld"><span>Status</span><select id="pp_status">${Object.entries(PM_STATUS).map(([k, l]) => `<option value="${k}" ${p.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="f2">
        <label class="fld"><span>Monthly rent</span><input type="number" step="0.01" id="pp_rent" value="${p.rent ?? ""}"></label>
        <label class="fld"><span>Tenants</span><input type="text" id="pp_ten" value="${esc(p.tenants || "")}" placeholder="Names on the lease"></label>
      </div>
      <div class="sectl">Fees</div>
      <div class="f2">
        <label class="fld"><span>PM fee</span><select id="pp_ft"><option value="pct" ${p.feeRule.type !== "flat" ? "selected" : ""}>Percent of rent received</option><option value="flat" ${p.feeRule.type === "flat" ? "selected" : ""}>Flat amount</option></select></label>
        <label class="fld"><span id="pp_fvL">${p.feeRule.type === "flat" ? "Amount ($)" : "Rate (%)"}</span><input type="number" step="0.01" id="pp_fv" value="${p.feeRule.type === "flat" ? p.feeRule.amount : p.feeRule.rate}"></label>
      </div>
      <label class="fld"><span>Admin fee on repairs (%)</span><input type="number" step="0.01" id="pp_ar" value="${p.adminRate ?? 10}"></label>
      ${p.feeRule.check ? `<p class="pm-banner">This fee rule was worked out from the workbook (${feeRuleText(p.feeRule)} of rent received). Confirm the rate and save to clear the warning.</p>` : ""}
      <label class="fld"><span>Notes</span><textarea id="pp_notes" rows="3">${esc(p.notes || "")}</textarea></label>
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Cancel</button><button class="btn primary" id="ppSave">${isNew ? "Add property" : "Save"}</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  $("#pp_ft").onchange = e => { $("#pp_fvL").textContent = e.target.value === "flat" ? "Amount ($)" : "Rate (%)"; };
  $("#pp_owner").onchange = e => {
    if(e.target.value !== "__new") return;
    const nm = prompt("Owner name"); if(!nm){ e.target.value = p.ownerId || ""; return; }
    const o = cleanOwner(Object.assign(blankOwner(), {id:uid(), name:nm.trim()})); S.owners = S.owners || []; S.owners.push(o);
    const opt = document.createElement("option"); opt.value = o.id; opt.textContent = nm.trim(); e.target.insertBefore(opt, e.target.lastChild); e.target.value = o.id;
  };
  $("#ppSave").onclick = () => {
    const name = $("#pp_name").value.trim(); if(!name) return toast("Give the property a name");
    const fv = Number($("#pp_fv").value);
    snapshot();
    Object.assign(p, {name, address:$("#pp_addr").value.trim() || name, ownerId:$("#pp_owner").value || null, status:$("#pp_status").value,
      rent:$("#pp_rent").value === "" ? null : Number($("#pp_rent").value), tenants:$("#pp_ten").value.trim(), notes:$("#pp_notes").value.trim(),
      adminRate:Number($("#pp_ar").value) || 0,
      feeRule:$("#pp_ft").value === "flat" ? {type:"flat", amount:fv || 0} : {type:"pct", rate:fv || 0}});
    const L = pmState().properties;
    if(isNew) L.push(p); else L[L.findIndex(x => x.id === p.id)] = p;
    closeSheet(); commit(); toast(isNew ? `${name} added` : "Saved", true);
  };
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
      ${withRet ? `<label class="fld"><span>Returned</span><input type="text" data-s="${k}" data-f="returned" value="${esc(x.returned || "")}" placeholder="e.g. Returned 9/12 — $2,450 less $150 cleaning"></label>` : ""}
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
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="shCancel">Close</button><button class="btn primary" id="stAll">All statements</button></div>`;
  $("#shClose").onclick = $("#shCancel").onclick = closeSheet;
  sh.querySelectorAll("[data-g]").forEach(b => b.onclick = () => printDoc(pmStatementHTML(m, groups[b.dataset.g])));
  $("#stAll").onclick = () => printDoc(pmStatementHTML(m, null, Object.values(groups)));
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
          ${items.map(it => `<tr><td class="dt">${it.date ? docShort(it.date) : ""}</td><td>${esc(it.memo || "Repair")}${it.link ? ` <a href="${esc(it.link)}">receipt</a>` : ""}</td><td class="vn">${esc(it.vendor || "")}</td><td class="r">−${usd(cents(it.amount))}</td></tr>`).join("")}
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
   SHELL — Projects | Property management switch, PM navigation,
   and the hooks that let owners, receipts and search span both sides.
   ===================================================================== */
const PM_VIEWS = new Set(["pmMonth","pmProps","pmDeposits","pmIncome"]);
function setMode(mode){
  S.ui.mode = mode;
  go(mode === "pm" ? (S.ui.pmLastView && PM_VIEWS.has(S.ui.pmLastView) ? S.ui.pmLastView : "pmMonth") : (S.ui.pjLastView || "portfolio"));
}
function renderModeSwitch(){
  const box = $("#modeSw"); if(!box) return;
  const pm = S.ui.mode === "pm";
  box.innerHTML = `<button data-mode="projects" aria-pressed="${!pm}">Projects</button><button data-mode="pm" aria-pressed="${pm}">Property mgmt</button>`;
  box.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { if((b.dataset.mode === "pm") !== pm) setMode(b.dataset.mode); });
  document.body.classList.toggle("mode-pm", pm);
  const qa = $("#qAdd"); if(qa) qa.innerHTML = pm ? `Record rent <kbd>N</kbd>` : `New transaction <kbd>N</kbd>`;
  // remember where each side was left
  if(pm && PM_VIEWS.has(S.ui.view)) S.ui.pmLastView = S.ui.view;
  if(!pm && !PM_VIEWS.has(S.ui.view) && !["owners","inbox","team"].includes(S.ui.view)) S.ui.pjLastView = S.ui.view;
}
function renderNavPM(){
  const n = $("#nav"); n.innerHTML = "";
  const mk = (k, lbl, ic, badge, fn) => {
    const b = elm("button", null, `${icon(ic)}<span>${lbl}</span>${badge != null ? badge : ""}`);
    b.setAttribute("aria-current", S.ui.view === k);
    b.onclick = fn || (() => go(k)); n.appendChild(b);
  };
  const P2 = pmState(), m = pmCurrentMonth(), R = P2.properties.length ? pmMonthRoll(m) : null;
  n.appendChild(elm("div","nav-head","Property management"));
  mk("pmMonth", "Month close", "check", R && R.flags ? `<i class="badge alert">${R.flags}</i>` : `<i class="badge">${monthShort(m)}</i>`);
  mk("pmProps", "Properties", "building", `<i class="badge">${pmLiveProps().length}</i>`);
  mk("pmDeposits", "Deposits", "receipt");
  mk("pmIncome", "Income", "grid");
  n.appendChild(elm("div","nav-gap"));
  n.appendChild(elm("div","nav-head","Shared"));
  mk("owners", "Owners", "user", `<i class="badge">${(S.owners||[]).filter(ownerLabel).length}</i>`, () => { S.ui.ownerId = null; go("owners"); });
  const nIn = inboxCount();
  mk("inbox", "Receipt inbox", "receipt", nIn ? `<i class="badge alert" style="background:var(--accent);color:#fff">${nIn}</i>` : null, () => { go("inbox"); inboxRefresh(); });
  if(Cloud.ready) mk("team", "Team", "user", `<i class="badge">${Cloud.online.length ? Cloud.online.length + 1 + " on" : ""}</i>`);
}
/* "N" in property management jumps to the next unpaid rent box */
function pmQuick(){
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
  if(tr){ S.ui.mode = "pm"; S.ui.pmPropF = "all"; go("pmProps"); setTimeout(() => pmPropSheet(tr.dataset.pmp), 30); }
});

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
function cloudDocs(){
  const out = new Map();
  S.properties.forEach(p => out.set("pj_property/" + p.id, p));
  out.set("shared/main", {owners:S.owners || [], order:S.properties.map(p => p.id), inboxDone:S.inboxDone || {}});
  if(S.inboxConn) out.set("shared/inbox", S.inboxConn);
  if(S.pm){
    (S.pm.properties || []).forEach(p => out.set("pm_property/" + p.id, p));
    Object.entries(S.pm.rows || {}).forEach(([k, r]) => out.set("pm_row/" + k, r));
    Object.entries(S.pm.meta || {}).forEach(([k, m]) => out.set("pm_meta/" + k, m));
    Object.entries(S.pm.deposits || {}).forEach(([k, d]) => out.set("pm_deposit/" + k, d));
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
  else if(kind === "pm_property"){
    const L = pm().properties, i = L.findIndex(p => p.id === id);
    if(deleted){ if(i >= 0) L.splice(i, 1); } else if(i >= 0) L[i] = data; else L.push(data);
  }
  else if(kind === "pm_row"){ if(deleted) delete pm().rows[id]; else pm().rows[id] = data; }
  else if(kind === "pm_meta"){ if(deleted) delete pm().meta[id]; else pm().meta[id] = data; }
  else if(kind === "pm_deposit"){ if(deleted) delete pm().deposits[id]; else pm().deposits[id] = data; }
}
function cloudLabel(kind, id, data){
  if(kind === "pj_property" || kind === "pm_property") return (data && data.name) || "a property";
  if(kind === "pm_row"){ const [m, pid] = id.split("|"); const p = pmProp(pid); return `${p ? p.name : "a property"} · ${monthLabel(m)}`; }
  if(kind === "pm_meta") return monthLabel(id);
  if(kind === "pm_deposit"){ const p = pmProp(id); return `deposits for ${p ? p.name : "a property"}`; }
  if(kind === "shared") return id === "main" ? "owners" : "inbox settings";
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
    for(const [key, s] of Cloud.synced) if(!docs.has(key) && !s.deleted) updates.push({key, del:true, prev:s});
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
const cloudWho = email => { if(!email) return "Someone"; if(email === Cloud.email) return "You (another tab)"; const m = (Cloud.staff || []).find(s => s.email === email); return (m && m.name) || email.split("@")[0]; };

/* ---------- live updates from everyone else ---------- */
Cloud.onRemote = function(row){
  if(!row || !row.kind) return;
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
  Cloud.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:"pkce"}});
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
  S = seedState(); S.properties = []; S.owners = []; S.inboxDone = {}; S.inboxConn = null; S.pm = {properties:[], rows:{}, meta:{}, deposits:{}};
  const main = d.docs.find(r => r.kind === "shared" && r.id === "main");
  d.docs.filter(r => !r.deleted && !(r.kind === "shared" && r.id === "main")).forEach(r => cloudApply(r.kind, r.id, r.data, false));
  if(main && !main.deleted) cloudApply("shared", "main", main.data, false);
  S.version = 3; S.ui = keepUi; S.activeId = keepActive;
  commit();
  toast(`Restored from ${name || "backup"} (${when}) — saving for everyone…`);
}

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
