/* =====================================================================
   PHD Billing — "New look" layer (ux.js + ux.css)

   Loaded after app.js. It never changes what a page calculates or does:
   every page still draws itself exactly as before, and this layer then
   arranges what was drawn into a layout made for that page's job —
   a command center, a close workflow, an investigation queue, a batch
   console, a treasury board, an outbox, a directory, a report.
   Moving nodes keeps their click handlers, so every button still works.

   Everything here sits behind <html class="ux2">. The switch at the foot of
   the menu turns it off (stored per browser), and any page whose layout
   step fails is simply left the way it was drawn.
   ===================================================================== */
(function(){
  "use strict";
  const KEY = "phd.ux";
  const LS = {get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }};
  const DEFAULT_ON = true;    // the switch at the foot of the menu goes back to the classic layout
  const on = () => { const v = LS.get(KEY); return v ? v === "new" : DEFAULT_ON; };
  const root = document.documentElement;
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.toggle("ux2", on());

  /* ------------------------------------------------------------------
     small helpers
     ------------------------------------------------------------------ */
  const h = (tag, cls, html) => { const e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; };
  const qs = (el, s) => el.querySelector(s), qsa = (el, s) => [...el.querySelectorAll(s)];
  const E = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = c => (typeof usd === "function" ? usd(c) : "$" + (c / 100).toFixed(2));
  const money0 = c => (typeof usd0 === "function" ? usd0(c) : "$" + Math.round(c / 100));
  const mLabel = m => (typeof monthLabel === "function" ? monthLabel(m) : m);
  const segBtn = (V, label) => qsa(V, ".sc-seg button").find(b => b.textContent.trim().toLowerCase().startsWith(label.toLowerCase()));
  const segCount = (V, label) => { const b = segBtn(V, label); const n = b && b.querySelector("span"); return n ? Number(n.textContent.replace(/[^\d]/g, "")) || 0 : 0; };
  const collapsed = k => LS.get("phd.ux.c." + k) === "1";
  const setCollapsed = (k, v) => LS.set("phd.ux.c." + k, v ? "1" : "0");

  const IC = {
    check:'<path d="M3.5 8.4l2.8 2.8 6.2-6.4"/>',
    alert:'<path d="M8 2.6l6 10.4H2z"/><path d="M8 6.6v3M8 11.4v.1"/>',
    clock:'<circle cx="8" cy="8" r="5.6"/><path d="M8 5v3.2l2 1.4"/>',
    send:'<path d="M14 2L7 9"/><path d="M14 2l-4.4 12-2.6-5-5-2.6z"/>',
    mail:'<rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2.5 4.5L8 8.8l5.5-4.3"/>',
    lock:'<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/>',
    home:'<path d="M2.5 7.2L8 2.8l5.5 4.4V13a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8z"/><path d="M6.3 13.8V10h3.4v3.8"/>',
    coin:'<circle cx="8" cy="8" r="5.6"/><path d="M9.8 6.2c-.3-.6-1-1-1.8-1-1 0-1.8.6-1.8 1.4 0 1.9 3.7.9 3.7 2.8 0 .8-.8 1.4-1.9 1.4-.9 0-1.6-.4-1.9-1M8 4.2v1M8 10.8v1"/>',
    chev:'<path d="M5.5 6.5L8 9l2.5-2.5"/>',
    arrow:'<path d="M3 8h9.5M9 4.5L12.5 8 9 11.5"/>',
    pause:'<path d="M6 4v8M10 4v8"/>',
    list:'<path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8"/><path d="M2.6 4.5h.1M2.6 8h.1M2.6 11.5h.1"/>',
    grid:'<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
    search:'<circle cx="7" cy="7" r="4.6"/><path d="M10.5 10.5L14 14"/>',
    bank:'<path d="M2.5 6.2L8 3l5.5 3.2"/><path d="M3.5 7v5M6.5 7v5M9.5 7v5M12.5 7v5M2.5 13h11"/>',
    split:'<path d="M8 13V8.5M8 8.5L4 4.5M8 8.5l4-4"/><path d="M2.8 4.5H5V2.3M13.2 4.5H11V2.3"/>',
    door:'<path d="M4 13.5V2.5h8v11"/><path d="M2.5 13.5h11M9.5 8.2v.1"/>'
  };
  const ic = (k, cls) => `<svg class="ic ${cls || ""}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${IC[k] || ""}</svg>`;

  /* a section with a header that can fold away; the folded state is remembered per section */
  function section(o){
    const s = h("section", "ux-sec" + (o.tone ? " t-" + o.tone : "") + (o.cls ? " " + o.cls : ""));
    const k = o.key, c = k && (o.collapsed === true ? LS.get("phd.ux.c." + k) !== "0" : collapsed(k));
    s.innerHTML = `<header class="ux-sh">${o.fold === false ? "" : `<button class="ux-fold" type="button" aria-expanded="${!c}" aria-label="Show or hide">${ic("chev")}</button>`}
      <h2>${o.icon ? ic(o.icon, "ux-sh-ic") : ""}${E(o.title)}</h2>${o.count != null ? `<span class="ux-count">${E(o.count)}</span>` : ""}
      ${o.note ? `<span class="ux-sh-note">${o.note}</span>` : ""}<span class="ux-sh-r"></span></header><div class="ux-sec-b"><div class="ux-sec-in"></div></div>`;
    if(c) s.classList.add("is-shut");
    const fold = qs(s, ".ux-fold"), hd = qs(s, ".ux-sh");
    if(fold){ const flip = e => { if(e.target.closest(".ux-sh-r a,.ux-sh-r button:not(.ux-fold)")) return; const shut = !s.classList.contains("is-shut"); s.classList.toggle("is-shut", shut); fold.setAttribute("aria-expanded", !shut); if(k) setCollapsed(k, shut); };
      hd.addEventListener("click", flip); hd.style.cursor = "pointer"; }
    const body = qs(s, ".ux-sec-in");
    (o.nodes || []).forEach(n => n && body.appendChild(n));
    if(o.right) qs(s, ".ux-sh-r").append(...[].concat(o.right));
    return s;
  }
  function moveAll(from, to){ while(from.firstChild) to.appendChild(from.firstChild); }

  /* numbers count up when a page first opens (not on every redraw) */
  function countUp(el){
    if(reduce() || el.dataset.uxCounted) return;
    const txt = el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.textContent : null;
    if(!txt) return;
    const m = txt.match(/^(\D*?)(-?[\d,]+(?:\.\d+)?)(.*)$/); if(!m) return;
    const target = Number(m[2].replace(/,/g, "")); if(!isFinite(target) || Math.abs(target) < 2) return;
    const dec = (m[2].split(".")[1] || "").length, t0 = performance.now(), dur = 620;
    el.dataset.uxCounted = "1";
    const fmt = n => m[1] + n.toLocaleString("en-US", {minimumFractionDigits:dec, maximumFractionDigits:dec}) + m[3];
    const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(target * e); if(p < 1) requestAnimationFrame(step); else el.textContent = txt; };
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------
     the switch in the menu
     ------------------------------------------------------------------ */
  function mountSwitch(){
    const foot = document.querySelector(".rail-foot"); if(!foot || foot.querySelector(".ux-switch")) return;
    const b = h("button", "ux-switch", `<span class="ux-tg"><i></i></span><span>New look</span>`);
    b.type = "button"; b.setAttribute("role", "switch");
    const sync = () => { b.setAttribute("aria-checked", on()); b.title = on() ? "Turn off to go back to the classic layout" : "Turn on the new layout"; };
    b.onclick = () => { LS.set(KEY, on() ? "classic" : "new"); root.classList.toggle("ux2", on()); sync(); try{ render(); }catch(e){} };
    sync(); foot.appendChild(b);
  }

  /* ------------------------------------------------------------------
     page layouts
     ------------------------------------------------------------------ */
  const PAGES = {};

  /* ---------- Month close: a guided close ---------- */
  PAGES.pmMonth = V => {
    const m = S.ui.pmMonth || (typeof pmCurrentMonth === "function" ? pmCurrentMonth() : "");
    const meta = (pmState().meta || {})[m] || {}, R = pmMonthRoll(m);
    const rows = pmMonthRows(m).filter(x => !x.row.detailOnly).map(x => ({p:x.prop, row:x.row}));
    if(!rows.length) return;
    const hero = qs(V, ":scope > .pf-hero"), bar = qs(V, ":scope > .sc-bar"), tbl = qs(V, ":scope > .card .pm-tbl");
    const tcard = tbl && tbl.closest(".card"), grid2 = qs(V, ":scope > .pm-grid2");
    if(!hero || !tcard) return;

    // where each rental stands this month
    let st = {paid:0, sched:0, owed:0, held:0, none:0}, warn = [];
    rows.forEach(({p, row}) => {
      const s = pmPayoutState(p, m, row); st[s.k] = (st[s.k] || 0) + 1;
      const c = s.c || pmCalc(row, p), w = (c.flags || []).filter(f => f.level === "warn");
      const short = c.dueC > 0 && c.recv < c.dueC && !row.locked;
      if(w.length || short) warn.push({p, row, c, s, why:w.length ? w[0].text : `Rent short — ${money(c.dueC - c.recv)} of ${money(c.dueC)} not in yet`, hard:!!w.length});
    });
    let stm = {n:0, sent:0}; try{ const cands = stmtCandidates(m); stm.n = cands.length; stm.sent = cands.filter(x => stState(x) === "sent").length; }catch(e){}
    const payTot = st.paid + st.sched + st.owed + st.held, paidN = st.paid + st.sched;
    const pct = R.dueC ? Math.min(100, Math.round(R.recv / R.dueC * 100)) : 0;
    const steps = [
      {k:"rent", t:"Collect rent", s:`${pct}% · ${money(R.recv)} of ${money(R.dueC)}`, done:R.dueC > 0 && R.recv >= R.dueC, p:pct},
      {k:"review", t:"Review exceptions", s:warn.length ? [warn.filter(x => x.hard).length ? `${warn.filter(x => x.hard).length} to fix` : "", warn.filter(x => !x.hard).length ? `${warn.filter(x => !x.hard).length} rent not in` : ""].filter(Boolean).join(" · ") : "Nothing flagged", done:!warn.filter(x => x.hard).length, p:rows.length ? Math.round((rows.length - warn.length) / rows.length * 100) : 100},
      {k:"pay", t:"Send owner payouts", s:payTot ? `${paidN} of ${payTot} sent${st.held ? ` · ${st.held} held` : ""}` : "None due", done:payTot > 0 && !st.owed, p:payTot ? Math.round(paidN / payTot * 100) : 0},
      {k:"stmt", t:"Email statements", s:stm.n ? `${stm.sent} of ${stm.n} sent` : "None yet", done:stm.n > 0 && stm.sent >= stm.n, p:stm.n ? Math.round(stm.sent / stm.n * 100) : 0},
      {k:"close", t:"Close the month", s:meta.closed ? "Closed" : "Open", done:!!meta.closed, p:meta.closed ? 100 : 0}];
    const cur = steps.findIndex(x => !x.done);
    const flow = h("div", "ux-flow", `<ol class="ux-steps">${steps.map((x, i) => `<li class="ux-step${x.done ? " done" : ""}${i === cur ? " now" : ""}" data-step="${x.k}" tabindex="0" role="button">
        <span class="ux-step-n">${x.done ? ic("check") : i + 1}</span><span class="ux-step-t"><b>${x.t}</b><span>${E(x.s)}</span></span>
        <span class="ux-step-bar"><i style="--w:${x.p}%"></i></span></li>`).join("")}</ol>`);
    qsa(flow, "[data-step]").forEach(li => { const go2 = () => {
      const k = li.dataset.step;
      if(k === "rent"){ const b = segBtn(V, "Unpaid"); if(b) b.click(); else tcard.scrollIntoView({behavior:"smooth"}); }
      else if(k === "review"){ const q = qs(document, ".ux-queue"); if(q) q.scrollIntoView({behavior:"smooth", block:"start"}); }
      else if(k === "pay"){ S.ui.poMonth = m; go("payouts"); }
      else if(k === "stmt"){ S.ui.stMonth = m; go("pmStatements"); }
      else if(k === "close"){ const b = qsa(document, "#pgActions button").find(x => /close month|reopen/i.test(x.textContent)); if(b) b.click(); } };
      li.onclick = go2; li.onkeydown = e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); go2(); } }; });

    // summary: one ledger strip, read left to right like the statement itself
    hero.classList.add("ux-ledger");
    const sumSec = h("div", "ux-month-top"); sumSec.append(flow, hero);

    // exceptions queue: what needs fixing, and rent that simply hasn't come in yet
    let queue = null;
    if(warn.length){
      const fix = warn.filter(x => x.hard), late = warn.filter(x => !x.hard);
      const col = (list, t, tone, max) => !list.length ? "" : `<div class="ux-q-col t-${tone}"><h4><i></i>${t} · ${list.length}</h4><div class="ux-q-list">${list.slice(0, max).map(x => `<button class="ux-q-i t-${tone}" data-pid="${E(x.p.id)}" type="button">
          <span class="ux-q-dot"></span><span class="ux-q-t"><b>${E(x.p.name)}</b><span>${E(x.why)}</span></span>
          <span class="ux-q-v num">${money(x.c.payoutC)}</span>${ic("arrow", "ux-q-go")}</button>`).join("")}${list.length > max ? `<div class="ux-q-more">+${list.length - max} more in the table below</div>` : ""}</div></div>`;
      const cols = h("div", "ux-q-cols", col(fix, "Needs a fix", "warn", 8) + col(late, "Rent not in yet", "wait", 8));
      qsa(cols, "[data-pid]").forEach(b => b.onclick = () => pmRowSheet(m, b.dataset.pid));
      queue = section({key:"mc.queue." + m, title:"Before payouts go out", count:warn.length, tone:fix.length ? "warn" : "wait", icon:"alert", cls:"ux-queue", nodes:[cols],
        note:"Open a rental to fix it — it drops off this list once it adds up"});
    }

    // rows: colour each by where it stands
    qsa(tbl, "tbody tr[data-pm]").forEach(tr => {
      const p = pmProp(tr.dataset.pm), row = p && pmRow(m, p.id); if(!row) return;
      const s = pmPayoutState(p, m, row), c = s.c || pmCalc(row, p);
      const hard = (c.flags || []).some(f => f.level === "warn");
      tr.classList.add("ux-row", hard ? "r-warn" : s.k === "held" ? "r-held" : (s.k === "paid" || s.k === "sched") ? "r-done" : c.dueC > 0 && c.recv < c.dueC ? "r-short" : s.k === "owed" ? "r-ready" : "r-idle");
    });
    const rowsSec = section({key:"mc.rows", title:"Every rental", count:rows.length, icon:"home", fold:false, cls:"ux-rows", nodes:[bar, tcard],
      note:"Type rent as it arrives — fees and payouts work themselves out"});
    const legend = h("div", "ux-legend", [["r-warn","Needs a look"],["r-short","Rent short"],["r-ready","Payout to send"],["r-held","Held"],["r-done","Paid out"]].map(([k, l]) => `<span class="${k}"><i></i>${l}</span>`).join(""));
    qs(rowsSec, ".ux-sh-r").appendChild(legend);
    const totals = grid2 ? section({key:"mc.totals", title:"PHD income and money movement", icon:"coin", nodes:[grid2]}) : null;
    V.prepend(...[sumSec, queue, rowsSec, totals].filter(Boolean));
    V.classList.add("ux-arch-flow");
  };

  /* ---------- Owner payouts: a batch console ---------- */
  PAGES.payouts = V => {
    const top = qs(V, ":scope > .po-top"), bar = qs(V, ":scope > .po-bar");
    if(!top || !bar) return;
    const cards = qsa(V, ":scope > .card").filter(c => c !== top);
    const ready = cards.find(c => /^Ready to send/.test((qs(c, "h3") || {}).textContent || ""));
    const nReady = ready ? qsa(ready, "tbody tr").length : 0, nOff = ready ? qsa(ready, "tbody tr.off").length : 0;
    const nSplit = ready ? qsa(ready, "tbody tr").filter(tr => /\bsplit\b/.test((qs(tr, ".tag") || {}).textContent || "")).length : 0;
    const nMd = ready ? qsa(ready, "tbody .tag").filter(t => /MagicDoor pays/.test(t.textContent)).length : 0;
    const held = cards.find(c => /^Held/.test((qs(c, "h3") || {}).textContent || "")), done = cards.find(c => /^Paid or scheduled/.test((qs(c, "h3") || {}).textContent || ""));
    const nHeld = held ? qsa(held, "tbody tr").length : 0, nDone = done ? qsa(done, "tbody tr").length : 0;

    const pf = qs(top, "#poF"); if(pf && /Loading/i.test(pf.textContent)) pf.classList.add("ux-skel");
    const side = h("aside", "ux-batch-side");
    const s1 = h("div", "ux-panel ux-settings", `<div class="ux-panel-h">${ic("send")}<b>Batch settings</b></div>`);
    top.classList.add("ux-flat"); s1.appendChild(top);
    const s2 = h("div", "ux-panel ux-tray", `<div class="ux-panel-h">${ic("list")}<b>This batch</b></div>
      <div class="ux-tray-mix">
        <span class="t-ready"><b>${nReady - nOff}</b>ready</span>
        ${nOff ? `<span class="t-warn"><b>${nOff}</b>can't send yet</span>` : ""}
        ${nSplit ? `<span class="t-split"><b>${nSplit}</b>split</span>` : ""}
        ${nHeld ? `<span class="t-held"><b>${nHeld}</b>held</span>` : ""}
        ${nMd ? `<span class="t-md"><b>${nMd}</b>MagicDoor</span>` : ""}
        ${nDone ? `<span class="t-done"><b>${nDone}</b>already sent</span>` : ""}</div>`);
    bar.classList.add("ux-tray-bar"); s2.appendChild(bar);
    const sp = bar.firstElementChild, nb = sp && qsa(sp, "b");
    if(nb && nb.length >= 2){ const when = (sp.textContent.split("·").pop() || "").trim();
      sp.innerHTML = `<small>${E(nb[0].textContent)} payout${nb[0].textContent === "1" ? "" : "s"} selected</small><b class="num">${E(nb[1].textContent)}</b><small>Lands ${E(when.replace(/^arrives /, "on "))}</small>`; sp.classList.add("ux-tray-sum"); }
    s2.appendChild(h("p", "ux-tray-note", `${ic("lock")} Nickel asks you to confirm each batch of up to 25 before any money moves.`));
    side.append(s2, s1);

    const main = h("div", "ux-batch-main");
    if(ready){ ready.classList.add("ux-tone", "t-ready"); qsa(ready, "tbody tr").forEach(tr => {
      const isSplit = /\bsplit\b/.test((qs(tr, ".tag") || {}).textContent || ""), isMd = /MagicDoor pays/.test(tr.textContent);
      tr.classList.add(tr.classList.contains("off") ? "r-warn" : isSplit ? "r-split" : isMd ? "r-md" : "r-ready"); }); main.appendChild(ready); }
    if(held){ held.classList.add("ux-tone", "t-held"); main.appendChild(section({key:"po.held", title:"Held", count:nHeld, tone:"held", icon:"pause", nodes:[held], note:"Not sent while a hold is open"})); qs(held, ".card-h") && (qs(held, ".card-h").hidden = true); }
    if(done){ done.classList.add("ux-tone", "t-done"); main.appendChild(section({key:"po.done", title:"Paid or scheduled", count:nDone, tone:"done", icon:"check", collapsed:true, nodes:[done]})); qs(done, ".card-h") && (qs(done, ".card-h").hidden = true); }
    cards.filter(c => c !== ready && c !== held && c !== done).forEach(c => main.appendChild(c));
    const wrap = h("div", "ux-batch"); wrap.append(main, side);
    V.appendChild(wrap);
    V.classList.add("ux-arch-batch");
  };

  /* ---------- Reconcile: discrepancies first ---------- */
  PAGES.pmRecon = V => {
    const grid = qs(V, ":scope > .rc-grid"); if(!grid) return;
    const topb = qs(V, ":scope > .rc-top"), hero = qs(V, ":scope > .rc-hero"), bar = qs(V, ":scope > .sc-bar");
    const band = h("div", "ux-inv-band"); if(topb) band.appendChild(topb); if(hero){ hero.classList.add("ux-compact"); band.appendChild(hero); }
    const groups = [["is-issue", "Doesn't match", "warn", "alert", false, "Open one to see each check and what to fix"],
                    ["is-waiting", "Waiting", "wait", "clock", true, "Rent or a payout still on its way — nothing wrong yet"],
                    ["is-reviewed", "Explained", "info", "list", true, "Different, and someone recorded why"],
                    ["is-matched", "Matches", "done", "check", true, "All four checks agree"]];
    const cards = qsa(grid, ":scope > .rc-card");
    const secs = [];
    groups.forEach(([cls, t, tone, icn, shut, note]) => {
      const mine = cards.filter(c => c.classList.contains(cls)); if(!mine.length) return;
      const g = h("div", "rc-grid ux-rc-grid"); mine.forEach(c => g.appendChild(c));
      secs.push(section({key:"rc." + cls, title:t, count:mine.length, tone, icon:icn, collapsed:shut, nodes:[g], note}));
    });
    const rest = cards.filter(c => !groups.some(([cls]) => c.classList.contains(cls)));
    if(rest.length){ const g = h("div", "rc-grid ux-rc-grid"); rest.forEach(c => g.appendChild(c)); secs.push(section({key:"rc.other", title:"Other", count:rest.length, nodes:[g]})); }
    if(!secs.length) return;
    const work = h("div", "ux-inv-work"); if(bar){ bar.classList.add("ux-sticky-bar"); work.appendChild(bar); } work.append(...secs);
    grid.remove();
    V.prepend(band, work);
    V.classList.add("ux-arch-inv");
  };

  /* ---------- Rent overview: a command center ---------- */
  PAGES.pmHome = V => {
    const hero = qs(V, ":scope > .pf-hero"), two = qs(V, ":scope > .pm-home2"), board = qs(V, "#pmBoard");
    if(!hero || !two) return;
    const [ac, mp] = qsa(two, ":scope > .card");
    const cmd = h("div", "ux-cmd");
    const left = h("div", "ux-cmd-l"), right = h("div", "ux-cmd-r");
    if(ac){ ac.classList.add("ux-urgent"); left.appendChild(ac); }
    if(mp){ mp.classList.add("ux-progress"); right.appendChild(mp); }
    // portfolio health from the board's own counts
    if(board){
      const n = l => segCount(board, l), all = n("All") || 1;
      const parts = [["late", "Late", n("Late")], ["partial", "Partial", n("Partial")], ["vacant", "Vacant or marketing", n("Vacant")]];
      const ok = Math.max(0, all - parts.reduce((a, x) => a + x[2], 0));
      const ph = h("div", "card ux-health", `<div class="card-h"><h3>Portfolio</h3><span class="ux-sh-note">${all} doors</span></div><div class="card-b">
        <div class="ux-stack">${[["ok", "On track", ok]].concat(parts).filter(x => x[2]).map(([k, l, v]) => `<i class="s-${k}" style="--w:${(v / all * 100).toFixed(2)}%" title="${E(l)}: ${v}"></i>`).join("")}</div>
        <div class="ux-stack-l">${[["ok", "On track", ok]].concat(parts).map(([k, l, v]) => `<button class="s-${k}" data-bf="${k}" type="button"><i></i>${E(l)}<b class="num">${v}</b></button>`).join("")}</div></div>`);
      qsa(ph, "[data-bf]").forEach(b => b.onclick = () => { const map = {ok:"All", late:"Late", partial:"Partial", vacant:"Vacant"}; const t = segBtn(board, map[b.dataset.bf]); if(t){ t.click(); } });
      right.appendChild(ph);
    }
    cmd.append(left, right);
    hero.classList.add("ux-ribbon");
    V.prepend(hero, cmd);
    // properties grouped into lanes (cards view only)
    const gridEl = board && qs(board, ".pm-cards");
    if(gridEl){
      const lanes = [["late", "Late", "warn", false], ["partial", "Partial rent", "wait", false], ["due", "Rent due", "wait", false], ["paid", "Paid", "done", false], ["vacant", "Vacant or marketing", "info", true], ["none", "No rent this month", "info", true]];
      const cards = qsa(gridEl, ":scope > .pm-card");
      const secs = [];
      lanes.forEach(([k, t, tone, shut]) => {
        const mine = cards.filter(c => c.classList.contains("st-" + k)); if(!mine.length) return;
        const g = h("div", "pm-cards ux-lane"); mine.forEach(c => g.appendChild(c));
        secs.push(section({key:"home.lane." + k, title:t, count:mine.length, tone, collapsed:shut, nodes:[g]}));
      });
      const rest = cards.filter(c => c.parentNode === gridEl);
      if(rest.length){ const g = h("div", "pm-cards ux-lane"); rest.forEach(c => g.appendChild(c)); secs.push(section({key:"home.lane.other", title:"Other", count:rest.length, nodes:[g]})); }
      if(secs.length){ gridEl.replaceWith(...secs); }
    }
    if(board){ board.classList.add("ux-board"); board.before(h("div", "ux-divider", `${ic("home")}<b>Properties</b><span>Grouped by where this month's rent stands</span>`)); }
    V.classList.add("ux-arch-cmd");
  };

  /* ---------- Cash & payouts: a treasury hub ---------- */
  PAGES.money = V => {
    const k = qs(V, ":scope > .mn-kpis"); if(!k) return;
    k.classList.add("ux-treasury");
    const first = qs(k, ".mn-kpi"); if(first) first.classList.add("ux-cash");
    const boardEl = qs(V, ":scope > .mn-board"), owed = qs(V, ":scope > .mn-owed");
    const tabs = qs(V, ":scope > .mn-tabs");
    const heads = [];
    if(boardEl) heads.push([boardEl, "Work in motion", "Problems first, then what's on its way and what's done", "clock"]);
    if(owed) heads.push([owed, "Who owes whom", "PHD's own receivables and payables", "bank"]);
    heads.forEach(([el, t, note, icn]) => { const hd = h("div", "ux-divider", `${ic(icn)}<b>${E(t)}</b><span>${E(note)}</span>`); el.before(hd); });
    if(tabs){ const hd = h("div", "ux-divider", `${ic("list")}<b>Ledger</b><span>Every owner distribution, transfer and payment, by month</span>`); tabs.before(hd); tabs.classList.add("ux-tabs-big"); }
    V.classList.add("ux-arch-treasury");
  };

  /* ---------- Bills: a payables queue ---------- */
  PAGES.pmBills = V => {
    const hero = qs(V, ":scope > .pf-hero"), quick = qs(V, ":scope > .bl-quick"), bar = qs(V, ":scope > .sc-bar");
    if(!hero || !bar) return;
    const map = {"To pay":"To pay", "Due in 7 days":"Due soon", "Paid · November":"Paid", "Owed by owners":null};
    hero.classList.add("ux-lanes");
    qsa(hero, ".pf-cell").forEach((c, i) => {
      const lbl = (qs(c, ".label") || {}).textContent || "", seg = Object.keys(map).find(x => lbl.startsWith(x.split(" ·")[0]));
      const target = seg != null ? map[seg] : null, b = target && segBtn(bar, target);
      c.classList.add("ux-lane-c", ["t-ready", "t-wait", "t-done", "t-owner"][i] || "");
      if(b){ c.tabIndex = 0; c.setAttribute("role", "button"); if(b.classList.contains("on")) c.classList.add("is-on"); c.onclick = () => b.click(); c.onkeydown = e => { if(e.key === "Enter") b.click(); }; }
    });
    if(quick){ quick.classList.add("ux-quick"); const lab = h("div", "ux-quick-l", `${ic("coin")}<b>Add a bill</b>`); quick.prepend(lab); }
    qsa(V, ".bl-tbl tbody tr").forEach(tr => {
      const t = qs(tr, ".tag"), cls = t ? t.className : "";
      tr.classList.add("ux-row", /red/.test(cls) ? "r-warn" : /gold/.test(cls) ? "r-short" : /green/.test(cls) ? "r-done" : "r-ready");
    });
    V.classList.add("ux-arch-ap");
  };

  /* ---------- Owner statements: an outbox ---------- */
  PAGES.pmStatements = V => {
    const hero = qs(V, ":scope > .pf-hero"), bar = qs(V, ":scope > .sc-bar"); if(!hero || !bar) return;
    const num = i => Number(((qsa(hero, ".pf-v")[i] || {}).textContent || "0").replace(/[^\d]/g, "")) || 0;
    const total = num(0), sent = num(1), drafts = num(2), todo = num(3), blocked = num(4);
    const pct = total ? Math.round(sent / total * 100) : 0, R = 30, C = 2 * Math.PI * R;
    const out = h("div", "ux-outbox", `<div class="ux-ring" style="--p:${pct}">
        <svg viewBox="0 0 72 72"><circle cx="36" cy="36" r="${R}" class="bg"/><circle cx="36" cy="36" r="${R}" class="fg" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - pct / 100)}"/></svg>
        <div><b class="num">${sent}</b><span>of ${total} sent</span></div></div>
      <div class="ux-out-lanes">${[["todo", "Not sent", todo, "Ready to email", "t-ready"], ["draft", "Drafts in Gmail", drafts, "Waiting in pm@", "t-wait"], ["sent", "Sent", sent, "Delivered to owners", "t-done"], ["blocked", "Need an email", blocked, "Owner or address missing", "t-warn"]]
        .map(([k, l, n, s, t]) => `<button type="button" class="ux-out-l ${t}${n ? "" : " is-zero"}" data-sf="${k}"><span class="ux-out-n num">${n}</span><span><b>${l}</b><small>${s}</small></span></button>`).join("")}</div>`);
    qsa(out, "[data-sf]").forEach(b => { const map = {todo:"Not sent", draft:"Drafts", sent:"Sent", blocked:"Need an email"}, sb = segBtn(bar, map[b.dataset.sf]);
      if(sb && sb.classList.contains("on")) b.classList.add("is-on"); b.onclick = () => sb && sb.click(); });
    hero.replaceWith(out);
    const tb = qs(V, ".st-tbl tbody"), trs = tb ? qsa(tb, ":scope > tr") : [];
    trs.forEach(tr => { const t = qs(tr, ".tag"), cls = t ? t.className : "";
      tr.dataset.uxg = /green/.test(cls) ? "sent" : /gold/.test(cls) ? "draft" : /red/.test(cls) ? "blocked" : "todo";
      tr.classList.add("ux-row", {sent:"r-done", draft:"r-short", blocked:"r-warn", todo:"r-ready"}[tr.dataset.uxg]); });
    // with every status showing, group the rows: what needs fixing, what to send, drafts, then what's done
    const allOn = (segBtn(bar, "All") || {}).classList && segBtn(bar, "All").classList.contains("on");
    if(tb && allOn && trs.length > 1){
      const cols = (qs(V, ".st-tbl thead tr") || {children:[]}).children.length || 5;
      [["blocked", "Need an email — fix these before sending", "t-warn"], ["todo", "Ready to send", "t-ready"], ["draft", "Drafts waiting in Gmail", "t-wait"], ["sent", "Sent", "t-done"]].forEach(([k, l, t]) => {
        const mine = trs.filter(tr => tr.dataset.uxg === k); if(!mine.length) return;
        const g = h("tr", "ux-grp " + t, `<td colspan="${cols}"><i></i>${E(l)} <span>${mine.length}</span></td>`);
        tb.appendChild(g); mine.forEach(tr => tb.appendChild(tr));
      });
    }
    V.classList.add("ux-arch-out");
  };

  /* ---------- Owners: a directory ---------- */
  PAGES.owners = V => {
    const grid = qs(V, ":scope > .ow-cards"); if(!grid) return;
    const cards = qsa(grid, ":scope > .ow-card"); if(!cards.length) return;
    const info = cards.map(c => { const name = ((qs(c, ".ow-card-h b") || {}).textContent || "").trim(), mail = ((qs(c, ".ow-card-h span:not(.tag)") || {}).textContent || "").trim();
      const n = qsa(c, ".ow-props > span").length; return {c, name, mail, n, text:c.textContent.toLowerCase()}; });
    const mode = LS.get("phd.ux.owView") || "cards", sort = LS.get("phd.ux.owSort") || "name";
    const tools = h("div", "ux-dir-tools", `<label class="ux-search">${ic("search")}<input type="search" placeholder="Search owners, emails, properties…" aria-label="Search owners"></label>
      <label class="ux-sel"><span>Sort</span><select aria-label="Sort owners"><option value="name"${sort === "name" ? " selected" : ""}>Name</option><option value="props"${sort === "props" ? " selected" : ""}>Most properties</option></select></label>
      <div class="ux-vt" role="group" aria-label="View"><button type="button" data-v="cards" aria-pressed="${mode === "cards"}" title="Cards">${ic("grid")}</button><button type="button" data-v="list" aria-pressed="${mode === "list"}" title="List">${ic("list")}</button></div>
      <span class="ux-dir-n">${cards.length} owners</span>`);
    const body = h("div", "ux-dir-body");
    const draw = () => {
      const q = (qs(tools, "input").value || "").toLowerCase().trim(), srt = qs(tools, "select").value;
      const list = info.filter(x => !q || x.text.includes(q)).sort((a, b) => srt === "props" ? b.n - a.n || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
      body.innerHTML = ""; body.className = "ux-dir-body v-" + (LS.get("phd.ux.owView") || "cards");
      if(!list.length){ body.appendChild(h("div", "ux-empty", `${ic("search")}<b>No owner matches “${E(q)}”</b><span>Try a last name, an email or a street.</span>`)); return; }
      if(srt === "name"){
        const by = {}; list.forEach(x => { const L = (x.name[0] || "#").toUpperCase(); (by[/[A-Z]/.test(L) ? L : "#"] = by[/[A-Z]/.test(L) ? L : "#"] || []).push(x); });
        Object.keys(by).sort().forEach(L => { const g = h("div", "ux-dir-g"); g.appendChild(h("div", "ux-dir-letter", E(L))); const gg = h("div", "ow-cards ux-dir-grid"); by[L].forEach(x => gg.appendChild(x.c)); g.appendChild(gg); body.appendChild(g); });
      } else { const gg = h("div", "ow-cards ux-dir-grid"); list.forEach(x => gg.appendChild(x.c)); body.appendChild(gg); }
      qs(tools, ".ux-dir-n").textContent = list.length === cards.length ? `${cards.length} owners` : `${list.length} of ${cards.length}`;
    };
    qs(tools, "input").addEventListener("input", draw);
    qs(tools, "select").onchange = e => { LS.set("phd.ux.owSort", e.target.value); draw(); };
    qsa(tools, "[data-v]").forEach(b => b.onclick = () => { LS.set("phd.ux.owView", b.dataset.v); qsa(tools, "[data-v]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    grid.replaceWith(tools, body); draw();
    V.classList.add("ux-arch-dir");
  };

  /* ---------- PHD income: a report ---------- */
  PAGES.pmIncome = V => {
    const now = qs(V, ":scope > .inc-now"), hero = qs(V, ":scope > .pf-hero"), chart = qs(V, ":scope > .pm-chart");
    if(!chart) return;
    chart.classList.add("ux-chart-hero");
    if(hero){ hero.classList.add("ux-ribbon", "ux-ribbon-sm"); chart.after(hero); }
    if(now){ now.classList.add("ux-compare");
      const ms = qsa(now, ".inc-m"), val = el => { const t = el && qs(el, ".inc-v, .pf-v, b.num, .num"); const x = t ? Number(t.textContent.replace(/[^\d.-]/g, "")) : NaN; return x; };
      if(ms.length === 2){ const a = val(ms[0]), b = val(ms[1]);
        if(isFinite(a) && isFinite(b) && b){ const d = (a - b) / Math.abs(b) * 100, up = d >= 0;
          const chip = h("span", "ux-delta " + (up ? "up" : "down"), `${up ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}% vs last month`);
          const hd = qs(ms[0], ".inc-h") || ms[0], a2 = qs(hd, "a"); a2 ? hd.insertBefore(chip, a2) : hd.appendChild(chip); } } }
    const bars = qsa(chart, ".pm-bar"); if(bars.length) bars[bars.length - 1].classList.add("ux-bar-now");
    // the current month's row stands out in the table
    const t = qs(V, ":scope > .card .tbl"); if(t){ const r = qs(t, "tbody tr"); if(r) r.classList.add("ux-current"); t.closest(".card").classList.add("ux-report-tbl");
      const hd = h("div", "ux-divider", `${ic("list")}<b>Every month</b><span>Click a month to open its close</span>`); t.closest(".card").before(hd); }
    V.prepend(...[chart, hero, now].filter(Boolean));
    V.classList.add("ux-arch-rep");
  };

  /* ------------------------------------------------------------------
     side panels: group a long form into clear sections
     ------------------------------------------------------------------ */
  function enhanceSheet(sh){
    if(!on() || !sh.classList.contains("on")) return;
    const b = qs(sh, ".sheet-b"); if(!b || b.dataset.ux) return;
    b.dataset.ux = "1";
    const heads = qsa(b, ":scope > .sectl");
    if(heads.length < 2) return;
    // the fields before the first header get a group of their own
    const lead = []; for(let n = b.firstChild; n && n !== heads[0]; n = n.nextSibling) lead.push(n);
    const leadFields = lead.filter(n => n.nodeType === 1 && (n.matches("input,select,textarea,.fld,.f2,.f3,label") || n.querySelector("input,select,textarea")));
    if(leadFields.length){ const g = h("div", "ux-sheet-g"), t = h("div", "sectl", /rent due/i.test(b.textContent.slice(0, 600)) ? "Rent and income" : "Details");
      leadFields[0].before(g); g.appendChild(t); let n = leadFields[0]; const end = heads[0]; while(n && n !== end){ const nx = n.nextSibling; g.appendChild(n); n = nx; } }
    // everything before the first header stays as the lead; each header and what follows it becomes one group
    heads.forEach(hd => {
      const g = h("div", "ux-sheet-g"); hd.before(g);
      let n = hd; const take = [];
      while(n && (n === hd || !n.classList || !n.classList.contains("sectl"))){ take.push(n); n = n.nextSibling; }
      take.forEach(x => g.appendChild(x));
    });
  }

  /* ------------------------------------------------------------------
     wiring: after every render, arrange the page; animate only when the
     page itself changes, so typing into a page never makes it jump
     ------------------------------------------------------------------ */
  let lastView = null;
  function after(){
    mountSwitch();
    const V = document.getElementById("view"); if(!V) return;
    const view = S && S.ui ? S.ui.view : "";
    V.dataset.view = view;
    if(!on()) return;
    const tb = document.getElementById("topbar"); if(tb) root.style.setProperty("--ux-top", Math.round(tb.getBoundingClientRect().height) + "px");
    const fn = PAGES[view];
    if(fn && !V.dataset.uxDone){ try{ fn(V); V.dataset.uxDone = view; }catch(e){ console.warn("[new look] layout skipped for", view, e); } }
    const fresh = view !== lastView; lastView = view;
    if(fresh && !reduce()){
      V.classList.remove("ux-enter"); void V.offsetWidth; V.classList.add("ux-enter");
      qsa(V, ":scope > *").slice(0, 10).forEach((el, i) => el.style.setProperty("--ux-i", i));
      qsa(V, ".pf-v, .mn-kpi b.num, .ux-out-n, .ux-ring b, .ux-stack-l b").forEach(countUp);
    }
  }
  function wrapRender(){
    if(typeof render !== "function" || render.__ux) return;
    const base = render;
    render = function(){ const V = document.getElementById("view"); if(V){ delete V.dataset.uxDone; V.className = "content"; } const r = base.apply(this, arguments); try{ after(); }catch(e){ console.warn("[new look]", e); } return r; };
    render.__ux = true;
  }
  wrapRender();
  // some wrappers are installed later (after sign-in); make sure ours stays outermost
  let tries = 0; const keep = setInterval(() => { if(typeof render === "function" && !render.__ux){ wrapRender(); try{ render(); }catch(e){} } if(++tries > 40) clearInterval(keep); }, 500);

  const sheet = document.getElementById("sheet");
  if(sheet && "MutationObserver" in window){
    let wasOn = false;
    new MutationObserver(() => { const isOn = sheet.classList.contains("on");
      // the panel's contents ease in when it opens — not again every time it redraws while you type
      if(isOn && !wasOn){ sheet.classList.add("ux-fresh"); setTimeout(() => sheet.classList.remove("ux-fresh"), 600); }
      wasOn = isOn; if(isOn) enhanceSheet(sheet); }).observe(sheet, {attributes:true, attributeFilter:["class"], childList:true});
  }
  document.addEventListener("DOMContentLoaded", () => { mountSwitch(); });
  mountSwitch();
  window.UX = {PAGES, section, enhanceSheet, on};
  try{ after(); }catch(e){}
})();
