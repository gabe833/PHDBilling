/* Offline checks for the feature modules (bankrec, distrib, tasks, ownerhub, insp, analytics).
   Uses made-up data only — never real owners, tenants or bank lines.
   Run from the repo folder:  python3 -m http.server 8765 &  then  node tests/features.test.js
   Needs Playwright (npm i playwright). Exits non-zero on any failure or page error. */
const { chromium } = require("playwright");
const URL = process.env.CONSOLE_URL || "http://localhost:8765/index.html";
let fails = 0;
const ok = (c, msg) => { if(c) console.log("  ✓ " + msg); else { fails++; console.log("  ✗ " + msg); } };

(async () => {
  const b = await chromium.launch(), p = await b.newPage({viewport:{width:1280, height:900}});
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const out = {}, wait = ms => new Promise(r => setTimeout(r, ms));
    setMode("pm"); const z = document.getElementById("cloudSplash"); if(z) z.remove();
    Cloud.email = "a@example.com"; Cloud.staff = [{email:"a@example.com", name:"Ann Admin", active:true}, {email:"bo@example.com", name:"Bo Staff", active:true}];
    S.owners.push({id:"o1", name:"Test Owner", email:"owner@example.com"});
    cloudApply("pm_property", "p1", {id:"p1", name:"1 Test St", ownerId:"o1", rent:1000, status:"active", feePct:10});
    cloudApply("pm_row", "2026-11|p1", {id:"2026-11|p1", month:"2026-11", propertyId:"p1", rentDue:1000, rentReceived:1000});

    // bank reconciliation: idempotent import, opening + lines = closing, payout settlement lookup
    const csv = "Date,Description,Reference,Amount,Balance\n2026-11-02,Payabli deposit,,1000.00,1000.00\n2026-11-15,Bill payment,OWN-2026-11-1TEST,-900.00,100.00\n";
    const i1 = brImport("nk-6588", csv, "t.csv"), i2 = brImport("nk-6588", csv, "t.csv"), M = brMonth("nk-6588", "2026-11");
    out.bank = {added:i1.added, again:i2.added, gap:M.gapC, open:M.openC, close:M.closeC, settle:!!brFindRef(["OWN-2026-11-1TEST"])};

    // distribution control: approval goes out of date when the amount changes
    DC.data = {approvals:{"2026-11":{p1:{status:"approved", amountC:90000, payees:[], by:"bo@example.com", at:"2026-11-10T00:00:00Z"}}}, policy:{require:true, twoPerson:true}, me:"a@example.com"};
    const x = {m:"2026-11", p:pmProp("p1"), row:pmRow("2026-11", "p1"), o:ownerById("o1"), amountC:90000, s:{}};
    window.poPayeeFor = () => ({id:""});
    out.dc = {ok:dcStatus(x).k, changed:dcStatus(Object.assign({}, x, {amountC:95000})).k, overCap:dcChecks(Object.assign({}, x, {amountC:500000})).some(c => c.lv === "block")};

    // tasks: recurring task made once; mentions; one record per task
    S.tasks = {}; const t = tkNew({title:"Monthly filter", due:"2026-11-05", recur:"monthly"}); S.tasks[t.id] = t;
    const copy = JSON.parse(JSON.stringify(t)); t.status = "done"; copy.status = "done";
    const n1 = tkRecur(t), n2 = tkRecur(copy);
    out.tasks = {next:n1 && n1.due, once:!n2, count:Object.keys(S.tasks).length, mention:tkMentions("@Bo please check").join(","), docs:[...cloudDocs().keys()].filter(k => k.startsWith("shared/task:")).length};

    // owner hub: health and timeline read from the records
    cloudApply("shared", "oh:o1", {id:"o1", log:[{id:"l1", kind:"call", date:"2026-01-01", subject:"Check-in", by:"a@example.com"}], docs:[]});
    out.oh = {health:ohHealth(ownerById("o1")).map(h => h[1]).join(" | "), tl:ohTimeline(ownerById("o1")).length};

    // inspections: move-out compared with move-in
    const a = inNew("p1", "move_in", "standard"); a.date = "2026-01-01"; a.rooms[0].items[0].cond = "good";
    const o = inNew("p1", "move_out", "standard"); o.date = "2026-11-01"; o.rooms[0].items[0].cond = "damaged";
    S.insp = {[a.id]:a, [o.id]:o};
    out.insp = {base:inBaseline(o) && inBaseline(o).id === a.id, worse:inCompare(o, a).length, findings:inFindings(o).length};

    // analytics: PHD revenue kept apart from owner money
    const D = anData(["2026-11"]);
    out.an = {recv:D.months[0].owner.recvC, rev:D.months[0].phd.revC, payout:D.months[0].owner.payoutC};

    // every new page renders
    out.pages = {};
    for(const v of ["bankrec", "payouts", "tasks", "inspections", "analytics", "owners", "pmProperty"]){
      if(v === "owners") S.ui.ownerId = "o1"; if(v === "pmProperty") S.ui.pmPropId = "p1"; if(v === "inspections") S.ui.inspId = o.id;
      try{ go(v); await wait(120); out.pages[v] = document.getElementById("view").children.length > 0; }catch(e){ out.pages[v] = "error: " + e.message; }
    }
    return out;
  });
  console.log("Bank reconciliation");
  ok(r.bank.added === 2 && r.bank.again === 0, "a second import of the same file adds nothing");
  ok(r.bank.gap === 0 && r.bank.open === 0 && r.bank.close === 10000, "opening + lines = closing");
  ok(r.bank.settle, "a payout's bank line is found by its reference");
  console.log("Distribution control");
  ok(r.dc.ok === "approved" && r.dc.changed === "stale", "an approval goes out of date when the amount changes");
  ok(r.dc.overCap, "more than the month took in is blocked");
  console.log("Tasks");
  ok(r.tasks.next === "2026-12-05" && r.tasks.once && r.tasks.count === 2, "a recurring task is made once, for the next date");
  ok(r.tasks.mention === "bo@example.com", "@mentions match the team list");
  ok(r.tasks.docs === 2, "one record per task");
  console.log("Owner hub");
  ok(/Last contact logged/.test(r.oh.health) && r.oh.tl >= 1, "health and timeline read the owner's records");
  console.log("Inspections");
  ok(r.insp.base && r.insp.worse === 1 && r.insp.findings === 1, "move-out compared with the latest move-in");
  console.log("Analytics");
  ok(r.an.recv === 100000 && r.an.rev === 10000 && r.an.payout === 90000, "owner money and PHD revenue kept apart");
  console.log("Pages");
  Object.entries(r.pages).forEach(([k, v]) => ok(v === true, `${k} renders`));
  ok(!errs.length, "no page errors" + (errs.length ? ": " + errs.join("; ") : ""));
  await b.close();
  console.log(fails ? `\n${fails} failed` : "\nAll passed");
  process.exit(fails ? 1 : 0);
})();
