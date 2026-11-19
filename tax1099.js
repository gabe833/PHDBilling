/* =====================================================================
   1099s — vendors (1099-NEC) and owners (1099-MISC box 1, rents)
   ---------------------------------------------------------------------
   Year-round tracking, then the January filing list.

   Vendors: everything PHD paid them in the year, from
     · rental bills paid from the console (not by card — card payments
       are reported by the card company on a 1099-K),
     · project expenses paid to them,
     · MagicDoor bills paid in full (before and alongside the console;
       a MagicDoor bill that matches a console bill counts once).
   PHD's own fees (PHD Property Management, PHD Properties…) are left out.
   A vendor needs a 1099-NEC when what's reportable reaches the year's
   threshold, unless it's a corporation (attorneys always get one), or
   it's marked as goods / utilities / not reportable.

   Owners: rent collected for them in the year (gross, or net paid out,
   per the setting) on 1099-MISC box 1, unless the owner is a corporation.

   Thresholds: $600 for payments through 2025; $2,000 from 2026 (One Big
   Beautiful Bill Act, indexed for inflation after 2026 — editable).

   Tax ID numbers are never typed in or stored here — they stay in the
   W-9 files. The export leaves the TIN column empty for the filing
   service or IRIS.
   Everything set here lives in the shared doc "tax1099".
   ===================================================================== */
(function(){
if(typeof render !== "function" || typeof pmState !== "function") return;

const T = () => { S.tax1099 = S.tax1099 && typeof S.tax1099 === "object" ? S.tax1099 : {}; const t = S.tax1099;
  t.years = t.years || {}; t.vendors = t.vendors || {}; t.owners = t.owners || {}; t.alias = t.alias || {}; return t; };
const me = () => (typeof Cloud !== "undefined" && Cloud.email) || "This browser";
const C = x => x == null || x === "" ? 0 : cents(x);
const key = s => (typeof mdVendorLoose === "function" ? mdVendorLoose(s) : String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
const PHD_SELF = /^phd(propert|propertymanagement|properties|handyman|realty)?/;     // PHD's own fees and entities
const GOODS = /^(lowes|homedepot|amazon|costco|walmart|target|sherwinwilliams|ferguson|grainger|acehardware|menards|samsclub|dominion|dominionenergy|charlestonwater|sceg|santeecooper|berkeleyelectric|comcast|xfinity|att|verizon|spectrum|honkmobile|scpw|waste|republicservices)/;
const yearCfg = y => { const c = T().years[y] || {}; return {threshold:c.threshold != null ? Number(c.threshold) : (Number(y) >= 2026 ? 2000 : 600), ownerBasis:c.ownerBasis || "gross"}; };
const fY = iso => { if(!iso) return ""; const d = new Date(String(iso).slice(0, 10) + "T12:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"}); };

/* ---------- vendors: every payment in the year, grouped by vendor ---------- */
function vendorPayments(y){
  const out = [], vlist = typeof pmVendors === "function" ? pmVendors() : [];
  const byKey = new Map(); vlist.forEach(v => { byKey.set(key(v.name), v); });
  Object.entries(T().alias).forEach(([k, vid]) => { const v = vlist.find(x => x.id === vid); if(v) byKey.set(k, v); });
  const who = name => byKey.get(key(name)) || null;
  // 1. rental bills paid from the console
  (typeof billList === "function" ? billList() : []).forEach(b => { if(b.status !== "paid") return; const d = String((b.pay && b.pay.date) || "").slice(0, 10); if(!d.startsWith(y)) return;
    const how = String((b.pay && b.pay.method) || ""), card = /card|amex|visa|mastercard/i.test(how);
    out.push({src:"Rental bill", id:b.id, date:d, name:b.vendor, v:b.vendorId ? vlist.find(x => x.id === b.vendorId) || who(b.vendor) : who(b.vendor), amountC:cents(b.amount), card, how:how || "—", where:(pmProp(b.propertyId) || {}).name || "", ref:b}); });
  // 2. project expenses paid to a vendor
  (S.properties || []).forEach(p => (p.transactions || []).forEach(t => { if(!t.vendor || !(Number(t.amount) > 0)) return;
    if(typeof pjVendorOpen === "function" && pjVendorOpen(t)) return;
    const d = String((t.nickelPay && !t.nickelPay.dismissed && t.nickelPay.date) || (t.vendorPaid && t.vendorPaid.date) || t.date || "").slice(0, 10); if(!d.startsWith(y)) return;
    out.push({src:"Project expense", id:t.id, date:d, name:t.vendor, v:who(t.vendor), amountC:cents(t.amount), card:false, how:t.nickelPay ? "Nickel" : t.vendorPaid ? (t.vendorPaid.method || "Paid") : "Project expense", where:p.name + " (project)", pid:p.id, unsure:!t.nickelPay && !t.vendorPaid}); }));
  // 3. MagicDoor bills paid in full — unless the same bill is already counted from the console
  const mdb = (S.md && S.md.bills) || [];
  mdb.forEach(b => { if(!b.date || !String(b.date).startsWith(y) || C(b.owed) !== 0 || !(Number(b.total) > 0)) return;
    const k = key(b.vendor); if(PHD_SELF.test(k)) return;
    const twin = out.find(x => x.src === "Rental bill" && key(x.name) === k && x.amountC === cents(b.total) && Math.abs(PMCore.dayNum(x.date) - PMCore.dayNum(b.date)) <= 21 && !x.mdTwin);
    if(twin){ twin.mdTwin = b.id; return; }
    const prop = (b.lines || [])[0] && (S.md.properties || []).find(pp => pp.id === b.lines[0].propertyId);
    out.push({src:"MagicDoor bill", id:b.id, date:String(b.date).slice(0, 10), name:b.vendor, v:who(b.vendor), amountC:cents(b.total), card:false, how:"MagicDoor", where:prop ? prop.name : "", memo:b.memo || "", mdDated:true}); });
  return out.filter(x => !PHD_SELF.test(key(x.name)));
}
function vendorRows(y){
  const cfg = yearCfg(y), thrC = Math.round(cfg.threshold * 100), pays = vendorPayments(y), groups = new Map();
  pays.forEach(x => { const gk = x.v ? "v:" + x.v.id : "n:" + key(x.name); const g = groups.get(gk) || {gk, v:x.v, name:x.v ? x.v.name : x.name, names:new Set(), pays:[]}; g.names.add(x.name); g.pays.push(x); groups.set(gk, g); });
  return [...groups.values()].map(g => {
    const ov = (T().vendors[g.gk] || {})[y] || {}, v = g.v, tax = (v && v.tax) || {}, w9 = v && typeof vdW9 === "function" ? vdW9(v) : null;
    const cardC = g.pays.filter(x => x.card).reduce((a, x) => a + x.amountC, 0), totC = g.pays.reduce((a, x) => a + x.amountC, 0);
    const adjC = C(ov.adjust), repC = Math.max(0, totC - cardC + adjC);
    const attorney = tax.attorney === true || /attorney|law ?(firm|office|group)|\besq\b|legal/i.test(g.name);
    const corp = /corp$/.test(tax.entity || "") && !attorney;
    const goods = ov.kind === "goods" || (ov.kind == null && tax.f1099 !== "yes" && GOODS.test(key(g.name)));
    const forced = tax.f1099 === "yes" || ov.kind === "include", excluded = ov.kind === "exclude" || tax.f1099 === "no";
    const addr = v ? [v.address, v.city, v.state, v.zip].every(Boolean) : false;
    let st;
    if(excluded) st = {k:"no", t:"Not reportable" + (ov.note ? ` — ${ov.note}` : tax.f1099 === "no" ? " (set on the vendor)" : "")};
    else if(goods) st = {k:"no", t:"Goods or utilities — not reportable"};
    else if(corp && !forced) st = {k:"no", t:"Corporation — no 1099"};
    else if(repC < thrC && !forced) st = {k:"under", t:`Under ${usd(thrC)}`};
    else if(!v) st = {k:"todo", t:"Not a vendor record yet"};
    else if(!w9 && !tax.entity) st = {k:"todo", t:"Need the W-9"};
    else if(!addr) st = {k:"todo", t:"Need the mailing address"};
    else st = {k:"ready", t:"Ready"};
    const unsure = g.pays.some(x => x.unsure) || g.pays.some(x => x.mdDated);
    return {g, v, ov, totC, cardC, adjC, repC, st, w9, tax, attorney, addr, unsure};
  }).sort((a, b) => b.repC - a.repC);
}

/* ---------- owners: rent collected for them ---------- */
function ownerRows(y){
  const cfg = yearCfg(y), thrC = Math.round(cfg.threshold * 100), P2 = pmState(), by = new Map();
  Object.values(P2.rows).forEach(r => { if(!r || r.deleted || !String(r.month || "").startsWith(y) || r.detailOnly) return; const p = pmProp(r.propertyId); if(!p) return;
    const o = ownerById(p.ownerId); const k = o ? o.id : "-";
    const c = pmCalc(r, p), x = by.get(k) || {o, grossC:0, netC:0, paidC:0, props:new Set(), months:0};
    x.grossC += c.recv; x.netC += Math.max(0, c.payoutC); x.paidC += r.paidOut ? cents(r.paidOut.amount || 0) : 0; x.props.add(p.name); x.months++; by.set(k, x); });
  return [...by.values()].map(x => {
    const info = T().owners[x.o ? x.o.id : "-"] || {}, amtC = cfg.ownerBasis === "net" ? x.netC : x.grossC;
    const ohW9 = x.o && S.ownerHub && S.ownerHub[x.o.id] && (S.ownerHub[x.o.id].docs || []).find(d => d.type === "w9");
    const w9 = info.w9 || (ohW9 ? {date:ohW9.signed || "", url:ohW9.url} : null);
    const corp = /corp$/.test(info.entity || ""), addr = x.o ? typeof ownerAddressLines === "function" && ownerAddressLines(x.o).length >= 2 : false;
    const joint = x.o && /joint|\band\b|&/i.test(ownerLabel(x.o));
    let st;
    if(!x.o) st = {k:"todo", t:"Rentals with no owner"};
    else if(info.exclude) st = {k:"no", t:"Not reportable" + (info.note ? ` — ${info.note}` : "")};
    else if(corp) st = {k:"no", t:"Corporation — no 1099"};
    else if(amtC < thrC) st = {k:"under", t:`Under ${usd(thrC)}`};
    else if(!w9 && !info.entity) st = {k:"todo", t:"Need the W-9"};
    else if(!addr) st = {k:"todo", t:"Need the mailing address"};
    else if(joint && !info.payee) st = {k:"todo", t:"Joint owners — say whose name and TIN it goes under"};
    else st = {k:"ready", t:"Ready"};
    return Object.assign(x, {info, amtC, w9, corp, addr, joint, st});
  }).sort((a, b) => b.amtC - a.amtC);
}

/* ---------- the page ---------- */
const deadlines = y => { const n = Number(y) + 1;
  // Jan 31 / Mar 31, moved to the next business day when they fall on a weekend
  const bd = iso => { const d = new Date(iso + "T12:00:00"); while(d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  return {recip:bd(`${n}-01-31`), nec:bd(`${n}-01-31`), miscE:bd(`${n}-03-31`), miscP:bd(`${n}-02-28`)}; };
function pg1099(){
  const ui = S.ui, now = todayISO(), y = ui.t9Y || String(Number(now.slice(0, 4)) - (now.slice(5, 7) <= "04" ? 1 : 0)), cfg = yearCfg(y), v = $("#view");
  const V = vendorRows(y), O = ownerRows(y), need = r => r.st.k === "ready" || r.st.k === "todo";
  const vN = V.filter(need), oN = O.filter(need), dl = deadlines(y);
  $("#pgSub").textContent = `Tax year ${y} · ${vN.length} vendor 1099-NEC · ${oN.length} owner 1099-MISC · threshold ${usd(Math.round(cfg.threshold * 100))}`;
  actions([["Download for filing (CSV)", () => t9Export(y, V, O), "primary"], ["Payment detail (CSV)", () => t9Detail(y, V)]]);
  const hero = elm("div", "card t9-hero");
  const k = (lab, n, sub, cls) => `<div class="t9-k ${cls || ""}"><span>${lab}</span><b>${n}</b><em>${sub}</em></div>`;
  const todo = vN.filter(r => r.st.k === "todo").length + oN.filter(r => r.st.k === "todo").length;
  hero.innerHTML = `<div class="t9-yr"><label>Tax year <select id="t9Y">${[0, 1, 2].map(i => String(Number(now.slice(0, 4)) - i)).map(x => `<option ${x === y ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label>Threshold $<input type="number" id="t9T" value="${cfg.threshold}" step="1" style="width:90px"></label>
      <label>Owner amount <select id="t9B"><option value="gross" ${cfg.ownerBasis === "gross" ? "selected" : ""}>Gross rent collected</option><option value="net" ${cfg.ownerBasis === "net" ? "selected" : ""}>Net paid to the owner</option></select></label></div>
    <div class="t9-ks">${k("Vendor 1099-NEC", vN.length, `${usd(vN.reduce((a, r) => a + r.repC, 0))} reportable`)}${k("Owner 1099-MISC (rents)", oN.length, `${usd(oN.reduce((a, r) => a + r.amtC, 0))} in box 1`)}
      ${k("Still missing something", todo, todo ? "W-9s, addresses or a decision" : "Everything's in", todo ? "warn" : "ok")}
      ${k("Due to recipients", fY(dl.recip), `1099-NEC to the IRS the same day · 1099-MISC by ${fY(dl.miscE)} (e-file)`)}</div>`;
  v.appendChild(hero);
  hero.querySelector("#t9Y").onchange = e => { ui.t9Y = e.target.value; persistUi(); render(); };
  const saveCfg = () => { snapshot(); T().years[y] = {threshold:Number(hero.querySelector("#t9T").value) || cfg.threshold, ownerBasis:hero.querySelector("#t9B").value, by:me(), at:new Date().toISOString()}; commit();
    actLog("tax", `1099 settings for ${y}: threshold ${usd(Math.round((T().years[y].threshold) * 100))}, owners on ${T().years[y].ownerBasis} rent`, {side:"pm"}); };
  hero.querySelector("#t9T").onchange = saveCfg; hero.querySelector("#t9B").onchange = saveCfg;

  const tab = ui.t9Tab || "vendors", F = ui.t9F || "need";
  const bar = elm("div", "card dp-bar");
  const filt = {need:["Need a form", r => need(r)], todo:["Missing something", r => r.st.k === "todo"], under:["Under the threshold", r => r.st.k === "under"], no:["Not reportable", r => r.st.k === "no"], all:["All", () => true]};
  const L = tab === "vendors" ? V : O;
  bar.innerHTML = `<div class="sc-seg">${[["vendors", `Vendors · ${V.length}`], ["owners", `Owners · ${O.length}`], ["guide", "How filing works"]].map(([kk, l]) => `<button data-t9t="${kk}" class="${tab === kk ? "on" : ""}">${l}</button>`).join("")}</div>
    ${tab !== "guide" ? `<div class="sc-seg">${Object.entries(filt).map(([kk, [l, fn]]) => `<button data-t9f="${kk}" class="${F === kk ? "on" : ""}">${l} · ${L.filter(fn).length}</button>`).join("")}</div>` : ""}`;
  v.appendChild(bar);
  bar.querySelectorAll("[data-t9t]").forEach(b => b.onclick = () => { ui.t9Tab = b.dataset.t9t; persistUi(); render(); });
  bar.querySelectorAll("[data-t9f]").forEach(b => b.onclick = () => { ui.t9F = b.dataset.t9f; persistUi(); render(); });
  if(tab === "guide") return t9Guide(v, y, dl, cfg);
  const list = L.filter(filt[F] ? filt[F][1] : () => true), c = elm("div", "card");
  const tag = st => `<span class="tag ${st.k === "ready" ? "green" : st.k === "todo" ? "gold" : "grey"}">${esc(st.t)}</span>`;
  if(tab === "vendors") c.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl t9-tbl"><thead><tr><th>Vendor</th><th class="r">Paid ${y}</th><th class="r">By card</th><th class="r">Reportable</th><th>Business type</th><th>W-9</th><th>Address</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((r, i) => `<tr class="tk-r" data-t9v="${i}"><td><div class="item-t">${esc(r.g.name)}</div><div class="item-s">${r.g.pays.length} payment${r.g.pays.length === 1 ? "" : "s"}${r.g.names.size > 1 ? ` · also as ${esc([...r.g.names].filter(n => n !== r.g.name).slice(0, 2).join(", "))}` : ""}${r.unsure ? ` · <span title="Some dates are MagicDoor bill dates or project expense dates, not payment dates">check dates</span>` : ""}</div></td>
        <td class="r num">${usd(r.totC)}</td><td class="r num">${r.cardC ? "−" + usd(r.cardC) : ""}</td><td class="r num"><b>${usd(r.repC)}</b>${r.adjC ? `<div class="item-s">${r.adjC > 0 ? "+" : "−"}${usd(Math.abs(r.adjC))} adjusted</div>` : ""}</td>
        <td>${esc((VD_ENTITY.find(e => e[0] === (r.tax.entity || "")) || [, "—"])[1])}${r.attorney ? ` <span class="tag">attorney</span>` : ""}</td><td>${r.w9 ? `<span class="tag green">On file</span>` : r.tax.w9Asked ? `<span class="tag gold">Asked ${esc(fdateS(r.tax.w9Asked))}</span>` : `<span class="muted">—</span>`}</td>
        <td>${r.addr ? "✓" : `<span class="muted">—</span>`}</td><td>${tag(r.st)}</td><td class="act"><span class="sc-go">›</span></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><b>Nothing here</b><p>Try another filter.</p></div>`;
  else c.innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl t9-tbl"><thead><tr><th>Owner</th><th class="r">Rent collected</th><th class="r">Net to owner</th><th class="r">Box 1</th><th>Business type</th><th>W-9</th><th>Address</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((r, i) => `<tr class="tk-r" data-t9o="${i}"><td><div class="item-t">${esc(r.o ? ownerLabel(r.o) : "No owner")}</div><div class="item-s">${esc([...r.props].slice(0, 3).join(", "))}${r.props.size > 3 ? ` +${r.props.size - 3}` : ""}${r.info.payee ? ` · goes to ${esc(r.info.payee)}` : ""}</div></td>
        <td class="r num">${usd(r.grossC)}</td><td class="r num">${usd(r.netC)}</td><td class="r num"><b>${usd(r.amtC)}</b></td>
        <td>${esc((VD_ENTITY.find(e => e[0] === (r.info.entity || "")) || [, "—"])[1])}</td><td>${r.w9 ? `<span class="tag green">On file</span>` : r.info.w9Asked ? `<span class="tag gold">Asked ${esc(fdateS(r.info.w9Asked))}</span>` : `<span class="muted">—</span>`}</td>
        <td>${r.addr ? "✓" : `<span class="muted">—</span>`}</td><td>${tag(r.st)}</td><td class="act"><span class="sc-go">›</span></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty"><b>Nothing here</b><p>Try another filter.</p></div>`;
  v.appendChild(c);
  c.querySelectorAll("[data-t9v]").forEach(tr => tr.onclick = () => t9VendorSheet(y, list[+tr.dataset.t9v]));
  c.querySelectorAll("[data-t9o]").forEach(tr => tr.onclick = () => t9OwnerSheet(y, list[+tr.dataset.t9o]));
}

const W9_URL = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";
function w9Ask(name, email){
  const sub = "W-9 request — PHD Properties", body = `Hi ${name},\n\nFor our year-end 1099s, please send us a completed and signed Form W-9 (blank form: ${W9_URL}).\n\nYou can reply to this email with it attached. Please don't send it by text.\n\nThank you,\nPHD Properties\nbilling@phdproperties.realestate · 843-212-6383`;
  return `mailto:${encodeURIComponent(email || "")}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;
}
function t9VendorSheet(y, r){
  const sh = $("#sheet"), v = r.v, ov = r.ov;
  sh.innerHTML = `<div class="sheet-h"><div><h3>${esc(r.g.name)}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">1099-NEC · tax year ${y} · ${esc(r.st.t)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="vb-sum"><div><span>Paid ${y}</span><b>${usd(r.totC)}</b><em>${r.g.pays.length} payments</em></div><div><span>By card (1099-K, not ours)</span><b>${usd(r.cardC)}</b><em>left out</em></div><div><span>Reportable</span><b>${usd(r.repC)}</b><em>box 1a</em></div></div>
      ${v ? `<div class="bl-pay" style="margin:8px 0"><button class="btn sm" id="t9Open" type="button">Open the vendor (W-9, business type, address)</button>${!r.w9 ? `<a class="btn sm" href="${esc(w9Ask(v.contact || v.name, v.email))}" id="t9Ask">Email a W-9 request</a>` : ""}</div>`
        : `<p class="dp-warn">There's no vendor record for "${esc(r.g.name)}" yet. <a href="#" id="t9Mk">Make one</a>, or <a href="#" id="t9Al">count it under an existing vendor</a>.</p>`}
      <div class="sectl">Decide</div>
      <div class="f2"><label class="fld"><span>For ${y}</span><select id="t9K"><option value="">Work it out (${esc(r.st.t)})</option><option value="include" ${ov.kind === "include" ? "selected" : ""}>Send a 1099</option><option value="goods" ${ov.kind === "goods" ? "selected" : ""}>Goods or utilities — not reportable</option><option value="exclude" ${ov.kind === "exclude" ? "selected" : ""}>Not reportable (other reason)</option></select></label>
        <label class="fld"><span>Adjust reportable by $ (+/−)</span><input type="number" step="0.01" id="t9A" value="${ov.adjust ?? ""}"></label></div>
      <label class="fld"><span>Why (kept with the history)</span><input type="text" id="t9N" value="${esc(ov.note || "")}" placeholder="e.g. materials only; paid twice, refunded"></label>
      <div class="sectl">Payments</div>
      <div class="vb-list">${r.g.pays.slice().sort((a, b) => a.date.localeCompare(b.date)).map(x => `<div class="vb-r" style="cursor:default"><div class="vb-m"><b>${esc(x.where || x.name)}</b><div class="sub">${esc(x.src)} · ${esc(fY(x.date))}${x.mdDated ? " (bill date)" : ""} · ${esc(x.how)}${x.memo ? " · " + esc(x.memo) : ""}${x.name !== r.g.name ? " · as " + esc(x.name) : ""}</div></div><div class="vb-a"><b class="num">${usd(x.amountC)}</b>${x.card ? `<span class="tag grey">card — left out</span>` : ""}</div></div>`).join("")}</div>
      ${(ov.history || []).length ? `<details class="tk-h"><summary>History · ${ov.history.length}</summary>${ov.history.slice().reverse().map(h => `<div>${esc(fdateS(String(h.at).slice(0, 10)))} · ${esc(String(h.by).split("@")[0])} — ${esc(h.what)}</div>`).join("")}</details>` : ""}
    </div>
    <div class="sheet-f"><span style="flex:1"></span><button class="btn" id="t9C">Cancel</button><button class="btn primary" id="t9S">Save</button></div>`;
  openPanel();
  $("#shClose").onclick = $("#t9C").onclick = () => closeSheet();
  const op = $("#t9Open"); if(op) op.onclick = () => vendorSheet(v.id);
  const mk = $("#t9Mk"); if(mk) mk.onclick = e => { e.preventDefault(); snapshot(); const nv = vendorEnsure(r.g.name); commit(); vendorSheet(nv.id); };
  const al = $("#t9Al"); if(al) al.onclick = e => { e.preventDefault(); const nm = prompt(`Count "${r.g.name}" under which vendor? Type its name as it is on the Vendors page.`, ""); if(!nm) return;
    const tv = vendorFind(nm); if(!tv) return toast("No vendor with that name"); snapshot(); [...r.g.names].forEach(n => { T().alias[key(n)] = tv.id; }); commit(); actLog("tax", `1099: "${r.g.name}" counted under ${tv.name}`, {side:"pm"}); closeSheet(); render(); };
  $("#t9S").onclick = () => {
    const kind = $("#t9K").value, adj = $("#t9A").value === "" ? null : Number($("#t9A").value), note = $("#t9N").value.trim();
    if((kind || adj) && !note) return toast("Say why — it's kept for the tax file");
    snapshot(); const all = T().vendors[r.g.gk] = T().vendors[r.g.gk] || {}, cur = all[y] || {};
    all[y] = {kind:kind || null, adjust:adj, note, history:(cur.history || []).concat([{at:new Date().toISOString(), by:me(), what:`${kind || "work it out"}${adj ? `, adjust ${adj}` : ""}${note ? " — " + note : ""}`}]).slice(-30)};
    commit(); actLog("tax", `1099 ${y} · ${r.g.name}: ${kind || "work it out"}${adj ? `, adjusted ${adj}` : ""} — ${note}`, {side:"pm"}); closeSheet(); toast("Saved", true);
  };
}
function t9OwnerSheet(y, r){
  if(!r.o) return toast("Give those rentals an owner first (Properties)");
  const sh = $("#sheet"), info = Object.assign({}, r.info), o = r.o;
  sh.innerHTML = `<div class="sheet-h"><div><h3>${esc(ownerLabel(o))}</h3><div class="muted" style="font-size:12.5px;margin-top:3px">1099-MISC box 1 (rents) · tax year ${y} · ${esc(r.st.t)}</div></div><button class="btn ghost sm" id="shClose" style="margin-left:auto">✕</button></div>
    <div class="sheet-b">
      <div class="vb-sum"><div><span>Rent collected</span><b>${usd(r.grossC)}</b><em>${r.months} rental-months</em></div><div><span>Net to the owner</span><b>${usd(r.netC)}</b><em>after fees and repairs</em></div><div><span>Box 1</span><b>${usd(r.amtC)}</b><em>${yearCfg(y).ownerBasis === "net" ? "net" : "gross"}</em></div></div>
      <p class="help">Rentals: ${esc([...r.props].join(", "))}</p>
      <div class="f2"><label class="fld"><span>Business type (from their W-9)</span><select id="toE">${VD_ENTITY.map(([kk, l]) => `<option value="${kk}" ${(info.entity || "") === kk ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="fld"><span>W-9 received on</span><input type="date" id="toW" value="${esc((info.w9 && info.w9.date) || "")}"></label></div>
      <label class="fld"><span>W-9 file (Drive link)</span><input type="url" id="toU" value="${esc((info.w9 && info.w9.url) || "")}" placeholder="https://drive.google.com/…"></label>
      ${!r.w9 ? `<div class="f2"><label class="fld"><span>W-9 asked for on</span><input type="date" id="toA" value="${esc(info.w9Asked || "")}"></label><div class="fld"><span>&nbsp;</span><a class="btn sm" href="${esc(w9Ask(o.name || ownerLabel(o), o.email))}">Email a W-9 request</a></div></div>` : ""}
      ${r.joint ? `<label class="fld"><span>Joint owners — the name the 1099 goes under (the TIN on the W-9)</span><input type="text" id="toP" value="${esc(info.payee || "")}" placeholder="e.g. Susan Reed"></label>` : ""}
      <label class="fld"><span>Mailing address</span><input type="text" value="${esc(ownerAddressLines(o).join(", ") || "Missing — add it on the owner's page")}" disabled></label>
      <label class="check" style="margin:8px 0"><input type="checkbox" id="toX" ${info.exclude ? "checked" : ""}> Not reportable for this owner</label>
      <label class="fld"><span>Why / notes</span><input type="text" id="toN" value="${esc(info.note || "")}"></label>
      <p class="help">The tax ID stays on the W-9 — it's never typed in or stored here.</p>
    </div>
    <div class="sheet-f"><button class="btn ghost sm" id="toOpen">Open the owner</button><span style="flex:1"></span><button class="btn" id="toC">Cancel</button><button class="btn primary" id="toS">Save</button></div>`;
  openPanel();
  $("#shClose").onclick = $("#toC").onclick = () => closeSheet();
  $("#toOpen").onclick = () => { closeSheet(); S.ui.ownerId = o.id; go("owners"); };
  $("#toS").onclick = () => {
    const url = $("#toU").value.trim(); if(url && !/^https:\/\//i.test(url)) return toast("The link has to start with https://");
    if($("#toX").checked && !$("#toN").value.trim()) return toast("Say why it isn't reportable");
    const nx = {entity:$("#toE").value, w9:($("#toW").value || url) ? {date:$("#toW").value, url} : null, w9Asked:($("#toA") || {}).value || info.w9Asked || "", payee:($("#toP") || {}).value || info.payee || "", exclude:$("#toX").checked, note:$("#toN").value.trim()};
    nx.history = (info.history || []).concat([{at:new Date().toISOString(), by:me(), what:`${nx.entity || "type not set"}${nx.w9 ? ", W-9 on file" : ""}${nx.exclude ? ", not reportable" : ""}${nx.note ? " — " + nx.note : ""}`}]).slice(-30);
    snapshot(); T().owners[o.id] = nx; commit(); actLog("tax", `1099 owner info · ${ownerLabel(o)}`, {side:"pm"}); closeSheet(); toast("Saved", true);
  };
}
function t9Guide(v, y, dl, cfg){
  const c = elm("div", "card t9-guide");
  c.innerHTML = `<div class="card-h"><h3>Filing the ${y} 1099s</h3></div><div style="padding:0 16px 14px;font-size:14px;line-height:1.55">
    <ol>
      <li><b>Now through December:</b> get a W-9 from every vendor and owner on the "Need a form" list (the "Email a W-9 request" button drafts it). Set each one's business type from the W-9 and make sure the mailing address is filled in.</li>
      <li><b>Early January:</b> check the Vendors list — mark store purchases, utilities and anything else that isn't for services as not reportable, and fix any vendor counted under two names ("count it under an existing vendor").</li>
      <li><b>Download for filing (CSV):</b> one row per form, with the amount, name and address. The tax ID column is empty on purpose — the filing service or IRIS fills it from the W-9s.</li>
      <li><b>File:</b> through a 1099 filing service, QuickBooks, or the IRS's free IRIS portal. The IRS's old FIRE system stops after the 2026 season, so e-filing goes through IRIS. E-filing is required once PHD files 10 or more information returns in total.</li>
    </ol>
    <table class="tbl" style="max-width:640px"><tbody>
      <tr><td>Copies to vendors and owners</td><td><b>${esc(fY(dl.recip))}</b></td></tr>
      <tr><td>1099-NEC to the IRS</td><td><b>${esc(fY(dl.nec))}</b></td></tr>
      <tr><td>1099-MISC to the IRS (e-filed)</td><td><b>${esc(fY(dl.miscE))}</b> (on paper: ${esc(fY(dl.miscP))})</td></tr>
      <tr><td>Threshold for ${y}</td><td><b>${usd(Math.round(cfg.threshold * 100))}</b> ${Number(y) >= 2026 ? "(was $600 through 2025)" : ""}</td></tr></tbody></table>
    <p class="help" style="margin-top:12px">What's counted: vendor payments by check, ACH, Nickel or MagicDoor (card payments are reported by the card company on a 1099-K and are left out); corporations don't get a 1099-NEC except attorneys. Owners get a 1099-MISC for rent collected for them (box 1), unless they're a corporation. Which amount goes in box 1 (gross rent collected, or net paid) and whether PHD files for vendors paid from owners' money are questions for PHD's CPA — the setting at the top switches the owner amount.</p>
  </div>`;
  v.appendChild(c);
}
function t9Export(y, V, O){
  const rows = [["Form", "Box", "Recipient name", "Business name", "Business type", "TIN (from the W-9)", "Address", "City", "State", "ZIP", "Email", "Amount", "Account number", "Status"]];
  V.filter(r => r.st.k === "ready" || r.st.k === "todo").forEach(r => { const v = r.v || {};
    rows.push(["1099-NEC", "1a", v.contact || r.g.name, v.contact ? r.g.name : "", (VD_ENTITY.find(e => e[0] === (r.tax.entity || "")) || [, ""])[1], "", v.address || "", v.city || "", v.state || "", v.zip || "", v.email || "", (r.repC / 100).toFixed(2), "V-" + String(v.id || r.g.gk).slice(-10), r.st.t]); });
  O.filter(r => r.st.k === "ready" || r.st.k === "todo").forEach(r => { const o = r.o || {};
    rows.push(["1099-MISC", "1 (rents)", r.info.payee || o.name || ownerLabel(o), o.company || "", (VD_ENTITY.find(e => e[0] === (r.info.entity || "")) || [, ""])[1], "", o.address || "", o.city || "", o.state || "", o.zip || "", o.email || "", (r.amtC / 100).toFixed(2), "O-" + String(o.id || "").slice(-10), r.st.t]); });
  download(`1099s ${y} - for filing.csv`, toCSV(rows));
  actLog("tax", `1099 filing list for ${y} downloaded (${rows.length - 1} forms)`, {side:"pm"});
}
function t9Detail(y, V){
  const rows = [["Vendor", "Date", "Source", "Rental / project", "How paid", "Amount", "Counted", "Paid under the name"]];
  V.forEach(r => r.g.pays.forEach(x => rows.push([r.g.name, x.date, x.src, x.where, x.how, (x.amountC / 100).toFixed(2), x.card ? "No — card" : r.st.k === "no" ? "No — " + r.st.t : "Yes", x.name])));
  download(`1099 payment detail ${y}.csv`, toCSV(rows));
}

/* ---------- wiring ---------- */
window.PAGE_EXT = Object.assign(window.PAGE_EXT || {}, {tax1099:() => { $("#pgCrumb").textContent = "Money"; $("#pgTitle").textContent = "1099s"; pg1099(); }});
if(typeof PM_VIEWS !== "undefined") PM_VIEWS.add("tax1099");
if(typeof cloudDocs === "function"){ const d0 = cloudDocs; cloudDocs = function(){ const out = d0.apply(this, arguments); if(S.tax1099) out.set("shared/tax1099", S.tax1099); return out; }; }
if(typeof cloudApply === "function"){ const a0 = cloudApply; cloudApply = function(kind, id, data, deleted){ if(kind === "shared" && id === "tax1099"){ S.tax1099 = deleted ? {} : data; return; } return a0.apply(this, arguments); }; }
if(typeof cloudLabel === "function"){ const l0 = cloudLabel; cloudLabel = function(kind, id){ if(kind === "shared" && id === "tax1099") return "1099 settings"; return l0.apply(this, arguments); }; }
window.t9NavBadge = () => { try{ const m = todayISO().slice(5, 7); if(m >= "05" && m <= "10") return null;
  const y = String(Number(todayISO().slice(0, 4)) - (m <= "04" ? 1 : 0)), n = vendorRows(y).filter(r => r.st.k === "todo").length + ownerRows(y).filter(r => r.st.k === "todo").length;
  return n ? navBadge(n, m <= "01" ? "alert" : "goldfill", "Missing W-9s or addresses") : null; }catch(e){ return null; } };
Object.assign(window, {pg1099, vendorRows, ownerRows, vendorPayments, t9YearCfg:yearCfg});
})();
