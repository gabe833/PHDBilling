
"use strict";
/* ============================================================
   BILLING CONSOLE v3 — multi-property
   All money is integer CENTS inside the engine.
   ============================================================ */
const KEY = "phd-billing-console-v3";
const usd  = c => (c/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
const usd0 = c => (c/100).toLocaleString("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
const cents = n => Math.round((Number(n)||0)*100);
const uid = () => Math.random().toString(36).slice(2,10);
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const fdateS = d => d ? new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—";

/* ---------- a property is the unit of everything ---------- */
/* ============================================================
   ORGANIZATION TAGS
   ------------------------------------------------------------
   Purely a viewing/organizing layer — never read by the engine,
   an invoice, or the client report. Tags live on the property
   (so they're shared across its transactions) and each
   transaction just holds an array of tag ids.
   ============================================================ */
const TAG_PALETTE = [
  {k:"red",    bg:"#F8E8E5", bd:"#EBCEC9", fg:"#A33528"},
  {k:"orange", bg:"#FBE9DD", bd:"#F0C9A9", fg:"#9C5420"},
  {k:"gold",   bg:"#F7F0DE", bd:"#E4D3A9", fg:"#8A6218"},
  {k:"green",  bg:"#E6F1EA", bd:"#C4DFCE", fg:"#2F7A4F"},
  {k:"teal",   bg:"#E3F1EC", bd:"#BFDFD2", fg:"#1F6E56"},
  {k:"blue",   bg:"#E8F0F4", bd:"#C6DBE6", fg:"#16536E"},
  {k:"purple", bg:"#EFE7F6", bd:"#D9C7EA", fg:"#6B3FA0"},
  {k:"slate",  bg:"#EEF1EE", bd:"#DDE3DD", fg:"#4B5A55"}
];
const tagColor = k => TAG_PALETTE.find(c => c.k === k) || TAG_PALETTE[7];
const RETURN_TAG_ID = "tag_return";
function defaultTags(){
  return [
    {id:RETURN_TAG_ID,     name:"Return",    color:"red"},
    {id:"tag_priority",    name:"Priority",  color:"orange"},
    {id:"tag_question",    name:"Question",  color:"blue"},
    {id:"tag_duplicate",   name:"Duplicate", color:"slate"},
    {id:"tag_followup",    name:"Follow up", color:"purple"}
  ];
}
function tagPillsHTML(t, p){
  return (t.tags||[]).map(id => (p.tags||[]).find(x => x.id === id)).filter(Boolean)
    .map(tg => { const c = tagColor(tg.color);
      return `<span class="utag" style="background:${c.bg};border-color:${c.bd};color:${c.fg}">${esc(tg.name)}</span>`; })
    .join("");
}

function newProperty(o){
  const u1 = uid();
  return Object.assign({
    id:uid(), name:"New property", owner:"", address:"",
    invoiceTarget:10000, feePct:15, feeLabel:"Project Management Fee",
    units:[{id:u1, name:"Unit 1"}], defaultSplit:{},
    transactions:[], register:{}, scope:[], holdRules:[], heldNote:"", report:{}, tags:defaultTags(), archived:false,
    ownerInfo:{name:"",company:"",email:"",phone:"",address:"",city:"",state:"",zip:"",method:"",terms:"",notes:"",cc:""},
    created:new Date().toISOString().slice(0,10)
  }, o||{});
}

function seedBeeSt(){
  const u1="u_j", u2="u_k";
  const T = o => Object.assign({
    id:uid(), date:"", vendor:"", desc:"", receipt:"", amount:0,
    scope:{type:"single", unit:u1, splits:{}},
    status:"billable", applyFee:true, allowPartial:true, pin:null, party:"Owner", notes:""
  }, o);
  return newProperty({
    id:"p_bee", name:"24 Bee St", owner:"", invoiceTarget:10000, feePct:15,
    units:[{id:u1,name:"Unit J"},{id:u2,name:"Unit K"}],
    defaultSplit:{[u1]:50,[u2]:50},
    transactions:[
      T({date:"2026-07-01",vendor:"Armando",desc:"Labor",receipt:"EST0063 (2) (2).pdf",amount:19735.00,scope:{type:"single",unit:u1,splits:{}},status:"excluded"}),
      T({date:"2026-07-01",vendor:"Armando",desc:"Labor",receipt:"EST0066 (1) (2).pdf",amount:29035.00,scope:{type:"single",unit:u2,splits:{}},status:"excluded"}),
      T({date:"2026-07-23",vendor:"PHD Properties",desc:"Consultation Fee",amount:4000.00,
         scope:{type:"split",unit:null,splits:{[u1]:50,[u2]:50}},applyFee:false,allowPartial:false,pin:1,
         notes:"Billed at cost — no project fee applied."}),
      T({date:"2026-07-28",vendor:"Lowes",desc:"Countertops — Sedona",receipt:"24 Bee St Unit K Counter Top Receipt Sedona.pdf",amount:3821.31,scope:{type:"single",unit:u2,splits:{}},pin:1}),
      T({date:"2026-07-28",vendor:"Lowes",desc:"Countertops — Valor Gold",receipt:"24 Bee St Unit J Counter Top Receipt Valor Gold.pdf",amount:4051.58,scope:{type:"single",unit:u1,splits:{}},pin:1}),
      T({date:"2026-08-05",vendor:"Lowes",desc:"Bathroom Vanity",receipt:"24 Bee St Unit K Bathroom vanities, tile, lighting, and door hardware $1,963.98.pdf",amount:1963.98,scope:{type:"single",unit:u2,splits:{}}}),
      T({date:"2026-07-01",vendor:"Lowes",desc:"Kitchen cabinets and accessories",receipt:"24 Bee St Unit J Diamond Express cabinetry $8,435.27.pdf",amount:8435.27,scope:{type:"single",unit:u1,splits:{}}}),
      T({date:"2026-07-01",vendor:"PHD Properties",desc:"Kitchen cabinets and accessories",receipt:"24 Bee St Unit K Diamond Express cabinetry $8,435.00.pdf",amount:8435.00,scope:{type:"single",unit:u2,splits:{}}}),
      T({date:"2026-08-11",vendor:"Lowes",desc:"Door Knobs",receipt:"20260805 - 24 Bee St - Matte Black & Doorknobs - Lowe's",amount:285.58,scope:{type:"single",unit:u2,splits:{}}}),
      T({date:"2026-08-11",vendor:"Lowes",desc:"Door Hardware",receipt:"20260805 - 24 Bee St - Black rigid - Lowe's",amount:16.00,scope:{type:"single",unit:u2,splits:{}}}),
      T({date:"2026-08-11",vendor:"Lowes",desc:"Bathroom Vanity & Wallpaper",receipt:"24 Bee St Units J & K Bathroom vanities and peel-and-stick wallpaper $1,180.46.pdf",amount:1180.46,scope:{type:"single",unit:u1,splits:{}},pin:1}),
    ]
  });
}

function seedState(){
  const p = seedBeeSt();
  return { version:3, properties:[p], activeId:p.id,
           ui:{view:"portfolio", unit:p.units[0].id, query:"", showExcluded:true, open:{}} };
}

/* migrate a v1/v2 single-property save into the portfolio shape */
function migrate(d){
  if(!d) return null;
  if(d.version >= 3 && d.properties) return d;
  if(d.transactions && d.units){
    const p = newProperty({
      id:uid(), name:d.property || "Property",
      invoiceTarget:d.invoiceTarget, feePct:d.feePct, feeLabel:d.feeLabel || "Project Management Fee",
      units:d.units, defaultSplit:d.defaultSplit || {},
      transactions:d.transactions, register:d.register || {}
    });
    return { version:3, properties:[p], activeId:p.id,
             ui:{view:"overview", unit:p.units[0]?.id, query:"", showExcluded:true, open:{}} };
  }
  return null;
}

/* ============================================================
   ENGINE — unchanged from v2, now scoped to one property.

   invoice total = expenses + round(fee-eligible expenses × rate)
   and it may NEVER exceed the cap. Every placement is sized by
   binary search against that equation.

   Pinning sets where a transaction STARTS. Anything past the
   cap continues onto the next invoice — that is what keeps the
   cap absolute.
   ============================================================ */
function unitShares(t, units){
  const total = cents(t.amount);
  const out = {}; units.forEach(u => out[u.id] = 0);
  if(t.scope.type === "single"){
    if(out.hasOwnProperty(t.scope.unit)) out[t.scope.unit] = total;
    return out;
  }
  const sp = t.scope.splits || {};
  const active = units.filter(u => Number(sp[u.id]) > 0);
  if(!active.length) return out;
  let assigned = 0, big = active[0];
  active.forEach(u => {
    const c = Math.round(total * (Number(sp[u.id])/100));
    out[u.id] = c; assigned += c;
    if(Number(sp[u.id]) > Number(sp[big.id])) big = u;
  });
  out[big.id] += (total - assigned);
  return out;
}

function packUnit(shares, targetC, rate, frozenMap){
  const frz = frozenMap || {};
  const locked = n => !!frz[n];
  const invs = [];
  const at = n => { while(invs.length < n) invs.push({no:invs.length+1, expC:0, feeBaseC:0, lines:[], closedShort:false}); return invs[n-1]; };
  const totalOf = i => i.expC + Math.round(i.feeBaseC * rate);
  const room    = i => targetC - totalOf(i);
  const maxFit  = (i, fee, cap) => {
    let lo = 0, hi = cap, best = 0;
    while(lo <= hi){
      const mid = (lo + hi) >> 1;
      const t = (i.expC + mid) + Math.round((i.feeBaseC + (fee ? mid : 0)) * rate);
      if(t <= targetC){ best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  };
  /* An invoice the owner has been sent or paid is a historical record. Its
     composition is restored from the snapshot taken when it was locked, and the
     packer treats those dollars as already spent. */
  Object.keys(frz).map(Number).sort((a,b) => a-b).forEach(no => {
    const f = frz[no], i = at(no);
    i.expC = f.expC; i.feeBaseC = f.feeBaseC; i.closedShort = !!f.closedShort; i.frozen = true;
    i.lines = (f.lines||[]).map(l => Object.assign({}, l));
  });
  const usedByTxn = {};
  Object.values(frz).forEach(f => (f.lines||[]).forEach(l => usedByTxn[l.txnId] = (usedByTxn[l.txnId]||0) + l.expC));
  shares.forEach(s => {
    const u = usedByTxn[s.txnId];
    if(u){ s.lockedC = u; s.amtC = s.amtC - u; }        // only the unbilled remainder still flows
  });
  shares = shares.filter(s => s.amtC !== 0);
  const firstOpen = () => { let n = 1; while(frz[n]) n++; return n; };

  const put = (i, s, amtC) => {
    i.expC += amtC;
    if(s.feeApplies) i.feeBaseC += amtC;
    i.lines.push({txnId:s.txnId, expC:amtC, feeApplies:s.feeApplies, fullC:s.amtC, pin:s.pin||null});
  };
  /* A credit is a returned or reduced charge. It reduces the invoice it lands
     in — never a fixed one — which frees capacity for whatever comes after it,
     so invoices still close at exactly the cap. */
  /* Work backwards from the invoice being filled: a credit offsets charges that
     have already been recorded. Invoices the owner has been sent are untouchable,
     so anything that can't land carries forward instead. */
  function refund(s, startNo){
    let rem = -s.amtC, guard = 0;
    for(let n = Math.min(startNo, invs.length); n >= 1 && rem > 0 && guard++ < 600; n--){
      const i = invs[n-1];
      if(!i || i.frozen || i.expC <= 0) continue;
      /* a fee-bearing credit can only reverse fee-bearing charges, so it can
         never pull the fee base below what the remaining line items support */
      const room = s.feeApplies ? Math.min(i.expC, i.feeBaseC) : i.expC;
      if(room <= 0) continue;
      const take = Math.min(rem, room);
      i.expC -= take;
      if(s.feeApplies) i.feeBaseC -= take;
      i.lines.push({txnId:s.txnId, expC:-take, feeApplies:s.feeApplies, fullC:s.amtC, pin:s.pin||null, credit:true});
      rem -= take;
    }
    if(rem > 0) s.unapplied = rem;
    /* the credit opened room — carry on filling from the earliest invoice that has it */
    for(let n = 1; n <= invs.length; n++)
      if(!invs[n-1].frozen && targetC - (invs[n-1].expC + Math.round(invs[n-1].feeBaseC * rate)) > 0) return n;
    return Math.max(1, invs.length);
  }

  function flow(s, startNo){
    if(s.amtC < 0) return refund(s, Math.min(startNo, Math.max(1, invs.length)));
    let rem = s.amtC, n = startNo, guard = 0;
    const wholeCharge = s.amtC + (s.feeApplies ? Math.round(s.amtC * rate) : 0);
    while(rem > 0 && guard++ < 600){
      const i = at(n);
      if(i.frozen || room(i) <= 0){ n++; continue; }
      if(!s.allowPartial && wholeCharge <= targetC){
        if(maxFit(i, s.feeApplies, rem) >= rem){ put(i, s, rem); rem = 0; }
        else { i.closedShort = true; n++; }
      } else {
        if(!s.allowPartial) s.oversize = true;
        const take = maxFit(i, s.feeApplies, rem);
        if(take <= 0){ n++; continue; }
        put(i, s, take); rem -= take;
        if(rem > 0){ s.spilled = true; n++; }
      }
    }
    return n;
  }
  shares.filter(s => s.pin).sort((a,b) => a.pin - b.pin || a.seq - b.seq)
        .forEach(s => flow(s, Math.max(s.pin, frz[s.pin] ? firstOpen() : s.pin)));
  let cur = firstOpen();
  shares.filter(s => !s.pin).forEach(s => { cur = flow(s, cur); });
  invs.forEach(i => {
    i.feeC   = i.frozen && frz[i.no] && frz[i.no].feeC != null ? frz[i.no].feeC : Math.round(i.feeBaseC * rate);
    i.totalC = i.expC + i.feeC;
    i.full   = i.totalC === targetC;
    i.over   = i.totalC > targetC;
  });
  return invs.filter(i => i.lines.length > 0);
}

/* ============================================================
   SCOPE OF WORK
   ------------------------------------------------------------
   A scope item carries a budget and a set of match words. A
   transaction belongs to it when EVERY match word appears in
   its item + vendor text (and the unit lines up). Actual spend
   is therefore never keyed in — it accrues from transactions
   that are already in the ledger. Pinning a transaction to an
   item by hand always wins over the match words.
   ============================================================ */
const STOP = new Set(["and","the","for","with","of","a","an","to","in","on","at","&","-","–","—","plus","per","from"]);
const workText = t => `${t.desc||""} ${t.vendor||""}`.toLowerCase();
const workWords = str => String(str||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ")
  .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

function workTouchesUnit(t, unitId, units){
  if(unitId === "all") return true;
  return t.scope.type === "single" ? t.scope.unit === unitId : Number(t.scope.splits[unitId]) > 0;
}
/* Deferred billing: anything matching a hold rule is parked until the end of
   the job. New and imported transactions pick this up on their own; existing
   ones move only when you apply the rule explicitly. */
const HELD_NOTE_DEFAULT = "Labor quotes — subject to change until final billing.";
const heldNote = prop => (prop && typeof prop.heldNote === "string" && prop.heldNote.trim())
  ? prop.heldNote.trim() : HELD_NOTE_DEFAULT;

function holdMatch(t, prop){
  const rules = (prop.holdRules||[]).map(x => String(x).toLowerCase().trim()).filter(Boolean);
  if(!rules.length) return false;
  const text = workText(t);
  return rules.some(r => text.includes(r));
}
function applyHoldRule(t, prop){
  if(t.status === "billable" && holdMatch(t, prop)) t.status = "review";
  return t;
}

function matchWork(t, prop){
  const items = prop.scope || [];
  if(t.work && items.some(i => i.id === t.work)) return t.work;   // pinned by hand
  if(t.work === "none") return null;                              // explicitly excluded
  const text = workText(t);
  const hit = items.find(i => (i.match||[]).length
    && (i.match||[]).every(w => text.includes(String(w).toLowerCase()))
    && workTouchesUnit(t, i.unit || "all", prop.units));
  return hit ? hit.id : null;
}

function compute(prop){
  const rate    = (Number(prop.feePct)||0)/100;
  const targetC = cents(prop.invoiceTarget);
  const out = { rate, targetC, units:{}, txn:{}, notes:[] };
  prop.transactions.forEach(t => out.txn[t.id] = {parts:[], allocC:0, unit:{}, spilled:false, oversize:false});

  prop.units.forEach(u => {
    const shares = [];
    prop.transactions.forEach((t, seq) => {
      if(t.status !== "billable") return;
      const c = unitShares(t, prop.units)[u.id] || 0;
      if(c === 0) return;
      shares.push({txnId:t.id, seq, amtC:c, feeApplies:t.applyFee !== false,
                   allowPartial:t.allowPartial !== false, pin:t.pin || null});
      out.txn[t.id].unit[u.id] = c;
      out.txn[t.id].allocC += c;
    });
    const frozenMap = {};
    Object.keys(prop.register).forEach(k => {
      const [uid_, no] = k.split("|");
      if(uid_ === u.id && prop.register[k] && prop.register[k].frozen) frozenMap[+no] = prop.register[k].frozen;
    });
    const invs = packUnit(shares, targetC, rate, frozenMap);
    shares.forEach(sh => { if(sh.lockedC) out.txn[sh.txnId].lockedC = (out.txn[sh.txnId].lockedC||0) + sh.lockedC; });
    invs.forEach(inv => {
      const reg = prop.register[u.id+"|"+inv.no] || {};
      inv.unitId = u.id; inv.unitName = u.name; inv.reg = reg;
      inv.locked = !!reg.frozen;
      inv.status = reg.paid ? "Paid" : reg.dateSent ? "Sent"
                 : inv.full ? "Ready to send"
                 : inv.closedShort ? "Ready — closed short" : "Draft";
      inv.lines.forEach(l => {
        l.txn = prop.transactions.find(x => x.id === l.txnId);
        l.partial = l.expC < l.fullC;
        if(!out.txn[l.txnId]){
          /* the transaction was removed after this invoice was issued — the
             invoice still stands, so keep the line and say so */
          out.txn[l.txnId] = {parts:[], allocC:0, unit:{}, spilled:false, oversize:false, orphan:true};
          l.orphan = true;
          out.orphanByUnit = out.orphanByUnit || {};
          out.orphanByUnit[u.id] = (out.orphanByUnit[u.id]||0) + l.expC;
          out.orphans = (out.orphans||0) + 1;
        }
        out.txn[l.txnId].parts.push({unitId:u.id, no:inv.no, expC:l.expC, status:inv.status});
      });
    });
    shares.forEach(s => {
      if(s.spilled)  out.txn[s.txnId].spilled = true;
      if(s.oversize) out.txn[s.txnId].oversize = true;
      if(s.unapplied){
        out.txn[s.txnId].unapplied = s.unapplied;
        out.unappliedC = (out.unappliedC||0) + s.unapplied;
        out.unappliedByUnit = out.unappliedByUnit || {};
        out.unappliedByUnit[u.id] = (out.unappliedByUnit[u.id]||0) + s.unapplied;
      }
    });
    out.units[u.id] = invs;
  });

  prop.transactions.forEach(t => {
    const i = out.txn[t.id];
    if(t.status === "excluded"){ i.pay = t.charge ? (t.charge.state === "settled" ? "Back-charge settled" : "Back-charge") : "Excluded"; return; }
    if(t.status === "review"){   i.pay = "On hold";  return; }
    if(!i.parts.length){         i.pay = "Unassigned"; return; }
    const paid = i.parts.filter(p => p.status === "Paid").length;
    const out_ = i.parts.filter(p => p.status === "Sent" || p.status === "Paid").length;
    i.pay = paid === i.parts.length ? "Paid" : paid > 0 ? "Part paid"
          : out_ === i.parts.length ? "Invoiced" : out_ > 0 ? "Part invoiced" : "Unbilled";
  });

  /* feeC is every fee BUILT so far, drafts included. feePaidC / feeSentC split
     out the part actually collected and the part invoiced but unpaid, so the
     screen never implies unsent fees are money in hand. */
  const ROLLK = ["chargesC","paidC","sentC","readyC","draftC","expenseC","feeC","feePaidC","feeSentC","invoices"];
  out.roll = {byUnit:{}}; ROLLK.forEach(k => out.roll[k] = 0);
  prop.units.forEach(u => {
    const b = {}; ROLLK.forEach(k => b[k] = 0);
    (out.units[u.id]||[]).forEach(inv => {
      b.invoices++; b.chargesC += inv.totalC; b.expenseC += inv.expC; b.feeC += inv.feeC;
      if(inv.status === "Paid"){ b.paidC += inv.totalC; b.feePaidC += inv.feeC; }
      else if(inv.status === "Sent"){ b.sentC += inv.totalC; b.feeSentC += inv.feeC; }
      else if(inv.status.startsWith("Ready")) b.readyC += inv.totalC;
      else b.draftC += inv.totalC;
    });
    out.roll.byUnit[u.id] = b;
    ROLLK.forEach(k => out.roll[k] += b[k]);
  });

  out.roll.heldC = prop.transactions.reduce((a,t) => t.status === "review" ? a + cents(t.amount) : a, 0);

  const notes = [];
  prop.transactions.forEach(t => {
    const who = `${t.vendor || "Untitled"} · ${t.desc || "—"}`;
    if(t.status === "billable" && Number(t.amount) < 0){
      const info = out.txn[t.id];
      if(info.unapplied) notes.push({level:"info", txnId:t.id,
        msg:`${who}: ${usd(info.unapplied)} of this credit is carried forward. Invoices already sent can't be changed, so it will come off the next invoice as new charges are added.`});
    }
    else if(t.status === "billable" && !(Number(t.amount) > 0))
      notes.push({level:"err", txnId:t.id, msg:`${who} has no amount entered.`});
    if(t.scope.type === "split"){
      const sum = prop.units.reduce((a,u) => a + (Number(t.scope.splits[u.id])||0), 0);
      if(Math.abs(sum-100) > 0.001) notes.push({level:"err", txnId:t.id, msg:`${who} splits to ${sum}%. It has to total 100%.`});
    } else if(!prop.units.some(u => u.id === t.scope.unit)){
      notes.push({level:"err", txnId:t.id, msg:`${who} isn't assigned to a unit.`});
    }
    if(t.status === "review" && !holdMatch(t, prop))
      notes.push({level:"warn", txnId:t.id, msg:`${who} is on hold and isn't being billed.`});
    const info = out.txn[t.id];
    if(info.oversize) notes.push({level:"warn", txnId:t.id, msg:`${who} is bigger than one full invoice, so it was split across several despite “keep whole”.`});
    else if(t.pin && info.spilled) notes.push({level:"info", txnId:t.id, msg:`${who} was pinned to invoice ${t.pin} but only part fits — the balance continues on the next one.`});
  });
  prop.units.forEach(u => (out.units[u.id]||[]).forEach(inv => {
    const orph = inv.lines.filter(l => l.orphan).length;
    if(orph) notes.push({level:"warn", msg:`${u.name} invoice ${inv.no} still bills ${orph} item${orph===1?"":"s"} whose transaction has since been deleted. The invoice was already issued, so the line has been kept.`});
    if(inv.over) notes.push({level:"err", msg:`${u.name} invoice ${inv.no} totals ${usd(inv.totalC)}, above the cap. This is a bug — please report it.`});
    if(inv.closedShort && !inv.reg.dateSent)
      notes.push({level:"info", msg:`${u.name} invoice ${inv.no} closed at ${usd(inv.totalC)} to keep a transaction whole.`});
  }));
  /* ---- scope of work rollup: actuals come from the ledger ---- */
  out.work = {}; out.workOf = {};
  (prop.scope||[]).forEach(i => out.work[i.id] = {actualC:0, holdC:0, billedC:0, paidC:0, count:0, ids:[]});
  out.work._none = {actualC:0, holdC:0, billedC:0, paidC:0, count:0, ids:[]};
  prop.transactions.forEach(t => {
    if(t.status === "excluded") return;
    const id = matchWork(t, prop) || "_none";
    out.workOf[t.id] = id === "_none" ? null : id;
    const w = out.work[id]; if(!w) return;
    const amt = cents(t.amount);
    w.count++; w.ids.push(t.id);
    if(t.status === "review") w.holdC += amt; else w.actualC += amt;
    (out.txn[t.id].parts||[]).forEach(x => {
      if(x.status === "Paid"){ w.paidC += x.expC; w.billedC += x.expC; }
      else if(x.status === "Sent") w.billedC += x.expC;
    });
  });
  out.workRoll = {budgetC:0, actualC:0, holdC:0, billedC:0, paidC:0, items:(prop.scope||[]).length, done:0, over:0};
  (prop.scope||[]).forEach(i => {
    const w = out.work[i.id];
    out.workRoll.budgetC += cents(i.budget);
    ["actualC","holdC","billedC","paidC"].forEach(k => out.workRoll[k] += w[k]);
    if(i.done) out.workRoll.done++;
    if(cents(i.budget) > 0 && w.actualC > cents(i.budget)) out.workRoll.over++;
  });

  out.notes = notes;
  return out;
}
function workStatus(item, w){
  if(item.done) return "Complete";
  const b = cents(item.budget);
  if(w.actualC === 0 && w.holdC === 0) return "Not started";
  if(b > 0 && w.actualC > b) return "Over budget";
  if(b > 0 && w.actualC >= b) return "At budget";
  return "In progress";
}

/* self-check, run on every recalculation */
function audit(prop, C){
  const fails = [];
  prop.units.forEach(u => {
    let allocated = 0;
    (C.units[u.id]||[]).forEach(inv => {
      if(inv.totalC > C.targetC) fails.push(`${u.name} invoice ${inv.no} exceeds the cap (${usd(inv.totalC)}).`);
      if(inv.expC < 0) fails.push(`${u.name} invoice ${inv.no} has a negative subtotal.`);
      const exp = inv.lines.reduce((a,l) => a + l.expC, 0);
      const base = inv.lines.reduce((a,l) => a + (l.feeApplies ? l.expC : 0), 0);
      if(exp !== inv.expC) fails.push(`${u.name} invoice ${inv.no}: line total doesn't match the subtotal.`);
      if(Math.round(base * C.rate) !== inv.feeC) fails.push(`${u.name} invoice ${inv.no}: fee doesn't match its base.`);
      if(inv.expC + inv.feeC !== inv.totalC) fails.push(`${u.name} invoice ${inv.no}: subtotal plus fee doesn't equal the total.`);
      allocated += exp;
    });
    let owed = prop.transactions.reduce((a,t) => t.status === "billable" ? a + (unitShares(t, prop.units)[u.id]||0) : a, 0);
    owed += (C.unappliedByUnit && C.unappliedByUnit[u.id]) || 0;   // credit with nothing left to offset
    owed += (C.orphanByUnit && C.orphanByUnit[u.id]) || 0;         // line kept from an issued invoice
    if(allocated !== owed) fails.push(`${u.name}: ${usd(Math.abs(owed-allocated))} of expenses ${allocated>owed?"double counted":"unallocated"}.`);
  });
  prop.transactions.forEach(t => {
    if(t.status !== "billable") return;
    const sh = unitShares(t, prop.units);
    const sum = Object.values(sh).reduce((a,b) => a+b, 0);
    const full = cents(t.amount);
    const covered = t.scope.type === "single"
      ? prop.units.some(u => u.id === t.scope.unit)
      : Math.abs(prop.units.reduce((a,u)=>a+(Number(t.scope.splits[u.id])||0),0) - 100) < .001;
    if(covered && sum !== full)
      fails.push(`${t.vendor} · ${t.desc}: unit shares total ${usd(sum)} but the transaction is ${usd(full)}.`);
  });
  return fails;
}

/* ============================================================
   STORAGE + AUTOSAVE
   ============================================================ */
const Store = {
  mem:null,
  async load(){
    try{ if(window.storage){ const r = await window.storage.get(KEY); if(r && r.value) return JSON.parse(r.value); } }catch(e){}
    try{ const v = window.localStorage && localStorage.getItem(KEY); if(v) return JSON.parse(v); }catch(e){}
    try{ const old = window.localStorage && (localStorage.getItem("phd-billing-console-v2") || localStorage.getItem("phd-billing-console-v1"));
         if(old) return JSON.parse(old); }catch(e){}
    return this.mem;
  },
  async save(d){
    const s = JSON.stringify(d); this.mem = d;
    try{ if(window.storage){ await window.storage.set(KEY, s); return; } }catch(e){}
    try{ if(window.localStorage) localStorage.setItem(KEY, s); }catch(e){}
  }
};
const IDB = {
  db(){ return new Promise((res,rej) => {
    const r = indexedDB.open("phd-billing-handle", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });},
  async get(k){ try{ const db = await this.db(); return await new Promise(res => {
    const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }catch(e){ return null; } },
  async set(k,v){ try{ const db = await this.db(); return await new Promise(res => {
    const q = db.transaction("kv","readwrite").objectStore("kv").put(v,k); q.onsuccess=()=>res(1); q.onerror=()=>res(0); }); }catch(e){ return 0; } },
  async del(k){ try{ const db = await this.db(); return await new Promise(res => {
    const q = db.transaction("kv","readwrite").objectStore("kv").delete(k); q.onsuccess=()=>res(1); q.onerror=()=>res(0); }); }catch(e){ return 0; } }
};
const AutoFile = {
  handle:null, state:"unsupported", name:"", pending:null, lastSaved:null, lastSeen:null,
  supported(){ return typeof window.showSaveFilePicker === "function"; },
  async init(){
    if(!this.supported()) return;
    this.state = "off";
    const h = await IDB.get("handle"); if(!h) return;
    this.handle = h; this.name = h.name || "billing.json";
    let p = "prompt"; try{ p = await h.queryPermission({mode:"readwrite"}); }catch(e){}
    if(p === "granted"){ this.state = "on"; await this.pull(); } else this.state = "needs";
  },
  async connect(){
    if(!this.supported()){ alert("Autosaving to a file needs Chrome or Edge. Your data still saves in this browser — use Download backup for a copy you control."); return; }
    try{
      const h = await window.showSaveFilePicker({
        suggestedName:"billing console.json",
        types:[{description:"Billing data", accept:{"application/json":[".json"]}}]
      });
      this.handle = h; this.name = h.name; this.state = "on";
      await IDB.set("handle", h);
      await this.pull(true); await this.write();
      chip(); toast("Autosaving to " + this.name);
    }catch(e){
      if(e && e.name === "AbortError") return;
      alert("The browser blocked the file picker. That normally means the page was opened from a file:// path — serve it over http (npx serve, or deploy it) and this works.");
    }
  },
  async regrant(){ if(!this.handle) return this.connect();
    try{ if(await this.handle.requestPermission({mode:"readwrite"}) === "granted"){ this.state="on"; await this.pull(); chip(); toast("Autosave reconnected"); } }catch(e){} },
  async disconnect(){ this.handle=null; this.state="off"; this.name=""; await IDB.del("handle"); chip(); toast("Autosave off"); },
  /* Read the file back in. Data comes from disk; which property and page
     you are looking at stays exactly where you left it. */
  async pull(adopt){
    if(!this.handle || this.state !== "on") return;
    try{
      const txt = await (await this.handle.getFile()).text();
      if(!txt.trim()) return;
      if(!adopt && txt === this.lastSeen) return;   // unchanged on disk — don't touch the screen
      const d = migrate(JSON.parse(txt));
      if(!d) return;
      if(adopt && !confirm(`${this.name} already holds ${d.properties.length} propert${d.properties.length===1?"y":"ies"}. Load it and replace what's on screen?`)) return;
      this.lastSeen = txt;
      const keepUi = S.ui, keepActive = S.activeId;
      S = d;
      S.ui = Object.assign({view:"portfolio", unit:null, query:"", showExcluded:true, open:{}}, keepUi || {});
      if(!adopt && d.properties.some(x => x.id === keepActive)) S.activeId = keepActive;
      fixActive();
      if(typeof COMP !== "undefined" && COMP){ recalc(); render(); }
    }catch(e){}
  },
  async write(){
    if(!this.handle || this.state !== "on") return;
    try{ const payload = JSON.stringify(S, null, 2);
      const w = await this.handle.createWritable();
      await w.write(payload); await w.close();
      this.lastSeen = payload;
      this.lastSaved = Date.now(); chip(); }
    catch(e){ this.state = "needs"; chip(); }
  },
  queue(){ if(this.state !== "on") return; clearTimeout(this.pending);
    this.pending = setTimeout(() => { this.pending = null; this.write(); }, 600); }
};

/* ---------- runtime ---------- */
let S = seedState();
let ALL = {};       // propertyId -> compute()
let AUDITS = {};    // propertyId -> string[]
let COMP = null, AUDIT = [];
const undoStack = [];

const P = () => S.properties.find(p => p.id === S.activeId) || S.properties[0];
const live = () => S.properties.filter(p => !p.archived);

function fixActive(){
  if(!S.properties.length) S.properties = [newProperty({name:"New property"})];
  S.properties.forEach(p => {
    if(!Array.isArray(p.scope)) p.scope = [];
    if(!Array.isArray(p.holdRules)) p.holdRules = [];
    if(!p.report || typeof p.report !== "object") p.report = {};
    if(!Array.isArray(p.tags)) p.tags = defaultTags();
    if(!p.ownerInfo || typeof p.ownerInfo !== "object") p.ownerInfo = {name:p.owner||""};
  });
  if(typeof syncOwners === "function") syncOwners();
  if(!S.properties.some(p => p.id === S.activeId)) S.activeId = S.properties[0].id;
  const p = P();
  if(!p.units.some(u => u.id === S.ui.unit)) S.ui.unit = p.units[0] && p.units[0].id;
}
function recalc(){
  fixActive();
  ALL = {}; AUDITS = {};
  S.properties.forEach(p => { ALL[p.id] = compute(p); AUDITS[p.id] = audit(p, ALL[p.id]); });
  COMP = ALL[S.activeId]; AUDIT = AUDITS[S.activeId] || [];
}
function portfolioRoll(){
  const r = {chargesC:0,paidC:0,sentC:0,readyC:0,draftC:0,expenseC:0,feeC:0,feePaidC:0,feeSentC:0,heldC:0,invoices:0,props:0,issues:0};
  live().forEach(p => {
    const c = ALL[p.id]; if(!c) return;
    r.props++;
    ["chargesC","paidC","sentC","readyC","draftC","expenseC","feeC","feePaidC","feeSentC","heldC","invoices"].forEach(k => r[k] += c.roll[k]);
    r.issues += c.notes.filter(n => n.level === "err").length + (AUDITS[p.id]||[]).length;
  });
  return r;
}
function snapshot(){ undoStack.push(JSON.stringify(S)); if(undoStack.length > 50) undoStack.shift(); }
function undo(){
  if(!undoStack.length) return toast("Nothing to undo");
  S = JSON.parse(undoStack.pop());
  Store.save(S); AutoFile.queue(); recalc(); render(); toast("Undone");
  // undo restores whatever snapshot state it captured; nothing to re-freeze
}
/* Snapshot an invoice as soon as it is sent or paid, and release the snapshot if
   that is undone. Everything downstream reads the snapshot, not a fresh repack. */
function freezeIssued(){
  let changed = false;
  S.properties.forEach(p => {
    const C = ALL[p.id]; if(!C) return;
    p.units.forEach(u => (C.units[u.id]||[]).forEach(inv => {
      const reg = p.register[u.id+"|"+inv.no];
      if(!reg) return;
      const should = !!(reg.paid || reg.dateSent || reg.lock);
      if(should && !reg.frozen){
        reg.frozen = {
          expC:inv.expC, feeBaseC:inv.feeBaseC, feeC:inv.feeC, totalC:inv.totalC,
          closedShort:!!inv.closedShort, at:new Date().toISOString().slice(0,10),
          lines:inv.lines.map(l => ({txnId:l.txnId, expC:l.expC, feeApplies:l.feeApplies,
                                     fullC:l.fullC, credit:!!l.credit, pin:l.pin||null}))
        };
        changed = true;
      } else if(!should && reg.frozen){ delete reg.frozen; changed = true; }
    }));
  });
  return changed;
}
function commit(){
  recalc();
  if(freezeIssued()) recalc();       // the snapshot becomes the source of truth
  Store.save(S); AutoFile.queue();
  render();
}
