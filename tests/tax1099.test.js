/* Offline checks for the 1099 Tax Center. Made-up data only.
   Run from the repo folder:  python3 -m http.server 8765 &  then  node tests/tax1099.test.js
   Needs Playwright. Exits non-zero on any failure or page error. */
const { chromium } = require("playwright");
const URL = process.env.CONSOLE_URL || "http://localhost:8765/index.html";
let fails = 0;
const ok = (c, msg) => { if(c) console.log("  ✓ " + msg); else { fails++; console.log("  ✗ " + msg); } };

(async () => {
  const b = await chromium.launch(), p = await b.newPage({viewport:{width:1280, height:900}});
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  p.on("dialog", d => d.accept("checked in test"));
  await p.goto(URL); await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const out = {}, wait = ms => new Promise(r => setTimeout(r, ms));
    setMode("pm"); const z = document.getElementById("cloudSplash"); if(z) z.remove();
    Cloud.email = "a@example.com";
    // owners: one person with two owner records (same email), a corporation, one under the threshold
    S.owners.push({id:"oA1", name:"Pat Example", email:"pat@example.com", address:"1 A St", city:"Town", state:"SC", zip:"29400"},
                  {id:"oA2", name:"Pat Example", email:"pat@example.com", address:"1 A St", city:"Town", state:"SC", zip:"29400"},
                  {id:"oC", name:"Big Holdings Inc", email:"c@example.com", address:"2 B St", city:"Town", state:"SC", zip:"29400"},
                  {id:"oS", name:"Small Owner", email:"s@example.com"});
    const prop = (id, ownerId) => cloudApply("pm_property", id, {id, name:id + " Test Rd", ownerId, rent:1500, status:"active", feePct:10});
    prop("pA1", "oA1"); prop("pA2", "oA2"); prop("pC", "oC"); prop("pS", "oS");
    const row = (pid, m, recv) => cloudApply("pm_row", `${m}|${pid}`, {id:`${m}|${pid}`, month:m, propertyId:pid, rentDue:1500, rentReceived:recv, locked:true});
    for(const m of ["2026-01", "2026-02"]){ row("pA1", m, 1500); row("pA2", m, 1500); row("pC", m, 1500); }
    row("pS", "2026-01", 1500);                                             // $1,500 < $2,000
    // vendors
    S.pmVendors = {list:[{id:"v1", name:"Handy Hank", email:"h@example.com", address:"3 C St", city:"Town", state:"SC", zip:"29400", tax:{entity:"individual"}},
      {id:"v2", name:"Lowes", tax:{}}, {id:"v3", name:"Fix-It LLC", tax:{entity:"llc"}}, {id:"v4", name:"Law Group PC", tax:{entity:"ccorp", attorney:true}, address:"4 D St", city:"Town", state:"SC", zip:"29400"},
      {id:"v5", name:"Corp Supply Inc", tax:{entity:"ccorp"}}, {id:"v6", name:"Edge Case", tax:{entity:"individual"}}]};
    const bill = (id, vendorId, vendor, amount, date, method) => cloudApply("pm_bill", id, {id, vendorId, vendor, amount, propertyId:"pA1", status:"paid", date, pay:{method:method || "Check", date}});
    bill("b1", "v1", "Handy Hank", 1500, "2026-03-01"); bill("b2", "v1", "Handy Hank", 600, "2026-04-01"); bill("b3", "v1", "Handy Hank", 900, "2026-05-01", "Card");
    bill("b4", "v2", "Lowes", 2500, "2026-03-03"); bill("b5", "v3", "Fix-It LLC", 3000, "2026-06-01"); bill("b6", "v4", "Law Group PC", 2500, "2026-06-02");
    bill("b7", "v5", "Corp Supply Inc", 5000, "2026-06-03"); bill("b8", "v6", "Edge Case", 1999.99, "2026-07-01");
    // MagicDoor: one bill linked by ID to console bill b5, one matched only by amount/date, one dated Dec 20 (year-end), one dated Dec 2025
    S.md = Object.assign(S.md || {}, {bills:[{id:"md1", vendor:"Fix-It LLC", total:3000, owed:0, date:"2026-05-30", lines:[]}, {id:"md2", vendor:"Handy Hank", total:600, owed:0, date:"2026-04-05", lines:[]},
      {id:"md3", vendor:"Handy Hank", total:400, owed:0, date:"2026-12-20", lines:[]}, {id:"md4", vendor:"Handy Hank", total:250, owed:0, date:"2025-12-28", lines:[]}], properties:[]});
    const rr = pmState().rows["2026-06|pA1"] || {id:"2026-06|pA1", month:"2026-06", propertyId:"pA1", rentDue:1500, rentReceived:1500, locked:true};
    rr.repairItems = [{billId:"b5", mdBill:"md1", amount:3000}]; cloudApply("pm_row", rr.id, rr);

    S.tax1099 = {owners:{oC:{entity:"ccorp"}}};   // the corporation's W-9 says C corporation (nothing is decided by name)
    const R = () => t9Build("2026").list, find = id => R().find(x => x.id === id);
    out.thr = {y26:t9YearCfg("2026").threshold, y25:t9YearCfg("2025").threshold, misc26:t9YearCfg("2026").thresholdMisc};
    const hank = R().find(x => x.display === "Handy Hank"), lowes = R().find(x => x.display === "Lowes"), llc = R().find(x => x.display === "Fix-It LLC"),
      law = R().find(x => x.display === "Law Group PC"), corp = R().find(x => x.display === "Corp Supply Inc"), edge = R().find(x => x.display === "Edge Case");
    out.v = {hankRep:hank.repC, hankCard:hank.cardC, hankDupMatch:hank.pays.some(x => x.pk === "md:md2" && x.c.ex === "dup" && x.dupBy === "match"),
      hankDates:hank.blocking.some(i => i.k === "dates"), hankPrev:hank.pays.some(x => x.pk === "md:md4" && !x.inYear),
      llcDupById:llc.pays.some(x => x.pk === "md:md1" && x.dupBy === "id"), llcRep:llc.repC, llcK:llc.k, llcCls:llc.blocking.some(i => i.k === "cls"),
      lowesK:lowes.k, lowesUncat:lowes.blocking.some(i => i.k === "uncat"), lawK:law.k, corpK:corp.k, edgeK:edge.k};
    // owners: the same person on two records is flagged, then linked into one recipient
    const a1 = find("o-oA1"), a2 = find("o-oA2");
    out.o = {a1:a1.repC, dup:a1.blocking.some(i => i.k === "dup:o-oA2"), corp:find("o-oC").k, small:find("o-oS").k};
    a1.doc = a1.doc; // virtual
    // link oA2 into oA1 (what "Link them" does)
    snapshot(); const d = {id:"o-oA1", type:"owner", links:{owners:["oA1", "oA2"], vendors:[]}}; S.t9r = S.t9r || {}; S.t9r[d.id] = d; commit();
    const a = find("o-oA1"); out.o.linked = a.repC; out.o.gone = !find("o-oA2"); out.o.dupAfter = a.blocking.some(i => i.k.startsWith("dup:"));
    // approval: blocked while errors exist; W-9 + classification fix it
    out.ap = {blocked:!t9CAN.approve(Object.assign(a, {fs:"ready"}))};
    d.cls = "individual"; d.w9 = {status:"received", received:"2026-11-01"}; d.filing = {"2026":{reviewed:{by:"bo@example.com", at:"x"}}}; commit();
    let a3 = find("o-oA1"); out.ap.state = a3.fs; out.ap.blocking = a3.blocking.map(i => i.k).join(",");
    t9Step("2026", a3, "approve", () => {}); a3 = find("o-oA1"); out.ap.after = a3.fs;
    out.ex = {list:t9Exportable("2026").map(x => x.id).join(",")};
    // export never marks submitted
    window.__dl = []; const d0 = window.download; window.download = (n, t) => window.__dl.push([n, t]);
    t9Export("2026", "generic_misc"); window.download = d0;
    a3 = find("o-oA1"); out.ex.status = a3.fs; out.ex.files = window.__dl.map(x => x[0]).join("|"); out.ex.rows = window.__dl[0] ? window.__dl[0][1].trim().split("\n").length : 0;
    out.ex.noTin = window.__dl[0] ? /Recipient TIN/.test(window.__dl[0][1]) && !/\d{3}-\d{2}-\d{4}/.test(window.__dl[0][1]) : false;
    out.ex.canSubmit = t9CAN.submitted(a3); out.ex.canAccept = t9CAN.accepted(a3);
    // amount change makes the approval stale and drops it from exports
    cloudApply("pm_row", "2026-03|pA1", {id:"2026-03|pA1", month:"2026-03", propertyId:"pA1", rentDue:1500, rentReceived:1500, locked:true});
    a3 = find("o-oA1"); out.ex.stale = a3.stale; out.ex.afterStale = t9Exportable("2026").length;
    // QuickBooks CSV parsing keeps payments, skips other rows
    const q = t9QboParse("Transaction List by Vendor\nDate,Transaction type,Num,Name,Amount\n01/15/2026,Bill Payment (Check),1001,Handy Hank,-250.00\n01/16/2026,Bill,,Handy Hank,250.00\n");
    out.qbo = q.length === 1 && q[0].date === "2026-01-15" && q[0].amount === 250 && q[0].ref === "1001";
    out.dl = t9Deadlines("2026");
    // pages render
    out.pages = {};
    for(const tb of ["overview", "rcp", "queue", "export", "setup", "guide"]){ S.ui.t9Tab = tb; S.ui.t9Y = "2026"; try{ go("tax1099"); await wait(100); out.pages[tb] = document.getElementById("view").children.length > 2; }catch(e){ out.pages[tb] = "error: " + e.message; } }
    try{ t9RecipientSheet; }catch(e){}
    return out;
  });
  console.log("Thresholds");
  ok(r.thr.y26 === 2000 && r.thr.y25 === 600 && r.thr.misc26 === 2000, "$2,000 for 2026, $600 for 2025");
  ok(r.v.edgeK === "under", "$1,999.99 is under the 2026 threshold");
  console.log("Vendors");
  ok(r.v.hankCard === 90000, "card payment left out (1099-K)");
  ok(r.v.hankDupMatch, "MagicDoor bill matching a console bill on vendor/amount/date counts once, flagged to confirm");
  ok(r.v.llcDupById, "MagicDoor bill linked by ID to a console bill counts once");
  ok(r.v.hankRep === 150000 + 60000 + 40000, "reportable = check payments + year-end MagicDoor bill (pending date check)");
  ok(r.v.hankDates, "December MagicDoor bill date blocks until the payment date is confirmed");
  ok(r.v.hankPrev, "late-2025 bill shown as possibly paid in 2026, not counted");
  ok(r.v.lowesK === "potential" && r.v.lowesUncat, "no exclusion by name — Lowes needs a category");
  ok(r.v.llcK === "potential" && r.v.llcCls, "an LLC isn't assumed exempt — needs its tax classification");
  ok(r.v.lawK === "potential", "attorney corporation still gets a 1099-NEC");
  ok(r.v.corpK === "no", "C corporation gets no 1099-NEC");
  console.log("Owners");
  ok(r.o.a1 === 450000 && r.o.dup, "same person on two owner records flagged as a possible duplicate");
  ok(r.o.linked === 750000 && r.o.gone && !r.o.dupAfter, "linked records add up on one recipient");
  ok(r.o.corp === "no" && r.o.small === "under", "corporation owner exempt; small owner under threshold " + JSON.stringify(r.o));
  console.log("Approval and export");
  ok(r.ap.blocked, "can't approve with blocking errors");
  ok(r.ap.state === "ready" && r.ap.after === "approved", "fixed and reviewed → Ready for review → Approved (" + r.ap.blocking + ")");
  ok(r.ex.list === "o-oA1", "only approved recipients are exportable");
  ok(r.ex.status === "exported" && !r.ex.canAccept, "export marks Exported, never Submitted or Accepted");
  ok(r.ex.rows === 2 && r.ex.noTin, "export has one row per approved form and no TINs");
  ok(r.ex.stale && r.ex.afterStale === 0, "an amount change after approval blocks export until re-approved");
  ok(r.qbo, "QuickBooks CSV: payments kept, bills skipped, dates and refs read");
  ok(r.dl.nec === "2027-02-01" && r.dl.recip === "2027-02-01" && r.dl.miscE === "2027-03-31" && r.dl.miscP === "2027-03-01", "2026 deadlines: Feb 1 / Feb 1 / Mar 31 (Mar 1 paper)");
  console.log("Pages");
  Object.entries(r.pages).forEach(([k, v]) => ok(v === true, `${k} tab renders`));
  ok(!errs.length, "no page errors" + (errs.length ? ": " + errs.join("; ") : ""));
  await b.close();
  console.log(fails ? `\n${fails} failed` : "\nAll passed");
  process.exit(fails ? 1 : 0);
})();
