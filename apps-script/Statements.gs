/* =====================================================================
   PHD Billing — owner statement emails (Google Apps Script)
   ---------------------------------------------------------------------
   Install this in the pm@phdproperties.realestate Google account — the
   mailbox for all property-management email. The console sends each
   owner statement here and this script sends it from pm@'s Gmail, or saves
   it as a Gmail DRAFT there, with the statement attached as a PDF. You read
   and edit each email in the console first; nothing is sent until you
   press Send there (or send the draft from Gmail).

   One-time setup (signed in as pm@phdproperties.realestate):
     1. script.google.com → New project → paste this file → Save.
     2. Optional, to add pm@'s Gmail signature: Services (+) → Gmail API → Add.
     3. Run setup() once and allow access. The log prints the console key.
     4. Deploy → New deployment → Web app.
          Execute as: Me (pm@phdproperties.realestate)
          Who has access: Anyone
        Copy the web app URL.
     5. In the console: Month close → Email statements → paste the URL and key.
   Updating an existing install: paste the new version, then Deploy → Manage
   deployments → edit (pencil) → Version: New version → Deploy. The URL stays.
   ===================================================================== */
const CFG = {
  FROM_NAME: 'PHD Property Management',   // the name owners see next to pm@'s address
  LABEL: 'AutoDraft/Owner Statements',     // every statement draft gets this Gmail label (it stays on after sending)
  MAX_PER_CALL: 10,
  MAX_SENT_PER_DAY: 150                     // a safety cap on emails sent from the console per day
};

/* ---------- one-time setup ---------- */
function setup(){
  const props = PropertiesService.getScriptProperties();
  if(!props.getProperty('KEY')) props.setProperty('KEY', newKey_());
  GmailApp.getDrafts();                    // asks for Gmail access now, not on the first statement
  label_();                                // creates the label so it shows in Gmail's sidebar right away
  Logger.log('Drafts will be saved in: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Console key (paste into the console): ' + props.getProperty('KEY'));
}
function showConsoleKey(){ Logger.log(PropertiesService.getScriptProperties().getProperty('KEY')); }
// if the key is ever exposed: run this, then paste the new key into the console
function rotateConsoleKey(){ PropertiesService.getScriptProperties().setProperty('KEY', newKey_()); showConsoleKey(); }
function newKey_(){ return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

/* ---------- web app (the console talks to this) ---------- */
function doGet(e){
  const p = (e && e.parameter) || {};
  if(!keyOk_(p.token)) return json_({ok:false, error:'unauthorized'});
  if(p.action === 'ping') return json_({ok:true, mailbox:Session.getEffectiveUser().getEmail(), fromName:CFG.FROM_NAME, signature:signature_(), canSend:true});
  return json_({ok:false, error:'unknown action'});
}
function doPost(e){
  let b = {};
  try{ b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }catch(err){ return json_({ok:false, error:'bad json'}); }
  if(!keyOk_(b.token)) return json_({ok:false, error:'unauthorized'});
  if(b.action === 'drafts') return json_(makeDrafts_(b.items, false));
  if(b.action === 'send') return json_(makeDrafts_(b.items, true));
  if(b.action === 'sendDraft') return json_(sendDraft_(b.items));
  if(b.action === 'status') return json_({ok:true, results:status_(b.items)});
  return json_({ok:false, error:'unknown action'});
}

/* ---------- the drafts ---------- */
// items: [{id, to, cc, subject, body, html, fileName, extra:[{name, mime, data(base64)}]}] — the statement page becomes the PDF attachment
function makeDrafts_(items, send){
  const list = Array.isArray(items) ? items.slice(0, CFG.MAX_PER_CALL) : [];
  const me = Session.getEffectiveUser().getEmail(), label = label_();
  const results = list.map(it => {
    try{
      const to = String(it.to || '').trim();
      if(!emailOk_(to)) throw new Error('Not a valid email: ' + to);
      const cc = String(it.cc || '').split(',').map(x => x.trim()).filter(emailOk_).join(',');
      const subject = String(it.subject || 'Owner Statement').slice(0, 200);
      const body = String(it.body || '').slice(0, 5000);
      const name = safeName_(String(it.fileName || 'Owner Statement').replace(/\.pdf$/i, '')) + '.pdf';
      const pdf = Utilities.newBlob(String(it.html || ''), MimeType.HTML, 'statement.html').getAs(MimeType.PDF).setName(name);
      // the vendors' invoices from MagicDoor, when the console sends them along (PDF or image, 8 MB each, 6 at most)
      const extra = (Array.isArray(it.extra) ? it.extra : []).slice(0, 6).map(f => {
        const mime = String(f && f.mime || ''), ok = /^(application\/pdf|image\/(jpeg|png|gif|webp))$/.test(mime);
        if(!ok || !f.data) return null;
        const bytes = Utilities.base64Decode(String(f.data));
        if(bytes.length > 8 * 1024 * 1024) return null;
        const ext = mime === 'application/pdf' ? '.pdf' : '.' + mime.split('/')[1].replace('jpeg', 'jpg');
        return Utilities.newBlob(bytes, mime, safeName_(String(f.name || 'Invoice').replace(/\.[a-z0-9]{2,5}$/i, '')) + ext);
      }).filter(Boolean);
      const sig = signature_();
      const opts = {attachments:[pdf].concat(extra), name:CFG.FROM_NAME, htmlBody:bodyHtml_(body) + (sig ? '<br>' + sig : '')};
      if(cc) opts.cc = cc;
      if(send) count_();
      const d = GmailApp.createDraft(to, subject, body, opts);
      if(send){
        const msg = d.send();
        let threadId = ''; try{ const th = msg.getThread(); threadId = th.getId(); th.addLabel(label); }catch(e){}
        return {id:it.id, ok:true, sent:true, threadId:threadId, at:new Date().toISOString(), from:me, attached:extra.length};
      }
      let labeled = true, threadId = '';
      try{ const th = d.getMessage().getThread(); threadId = th.getId(); th.addLabel(label); }catch(e){ labeled = false; }   // the draft still counts if labelling hiccups
      return {id:it.id, ok:true, draftId:d.getId(), threadId:threadId, from:me, labeled:labeled, attached:extra.length};
    }catch(err){ return {id:it.id, ok:false, error:String(err.message || err).slice(0, 300)}; }
  });
  return {ok:true, mailbox:me, results:results};
}
// send drafts made earlier (items: [{id, draftId}])
function sendDraft_(items){
  const me = Session.getEffectiveUser().getEmail();
  return {ok:true, mailbox:me, results:(Array.isArray(items) ? items.slice(0, CFG.MAX_PER_CALL) : []).map(it => {
    try{ count_(); const msg = GmailApp.getDraft(String(it.draftId)).send(); return {id:it.id, ok:true, sent:true, threadId:msg.getThread().getId(), at:new Date().toISOString(), from:me}; }
    catch(err){ return {id:it.id, ok:false, error:'That draft is gone from Gmail (sent or deleted there). ' + String(err.message || err).slice(0, 200)}; }
  })};
}
// pm@'s Gmail signature (needs the Gmail API service; without it, no signature is added)
function signature_(){
  try{
    if(typeof Gmail === 'undefined') return '';
    const me = Session.getEffectiveUser().getEmail();
    const list = Gmail.Users.Settings.SendAs.list('me').sendAs || [];
    const s = list.find(x => String(x.sendAsEmail).toLowerCase() === me.toLowerCase()) || list.find(x => x.isDefault) || {};
    return String(s.signature || '');
  }catch(e){ return ''; }
}
function count_(){
  const props = PropertiesService.getScriptProperties(), day = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  const cur = JSON.parse(props.getProperty('COUNT') || '{}'), n = cur.day === day ? cur.n : 0;
  if(n >= CFG.MAX_SENT_PER_DAY) throw new Error('Daily limit reached (' + CFG.MAX_SENT_PER_DAY + ' emails). Raise MAX_SENT_PER_DAY in the script if this is expected.');
  props.setProperty('COUNT', JSON.stringify({day:day, n:n + 1}));
}
// where each statement email stands now: still a draft, sent, or deleted (so the console shows the truth)
// items: [{id, draftId, threadId}]
function status_(items){
  return (Array.isArray(items) ? items.slice(0, 200) : []).map(it => {
    try{
      if(it.threadId){
        let th = null; try{ th = GmailApp.getThreadById(String(it.threadId)); }catch(e){}
        if(!th || th.isInTrash()) return {id:it.id, state:'deleted'};
        const ms = th.getMessages().filter(m => !m.isInTrash());
        if(ms.some(m => m.isDraft())) return {id:it.id, state:'draft'};
        const sent = ms.filter(m => !m.isDraft());
        return sent.length ? {id:it.id, state:'sent', at:sent[0].getDate().toISOString()} : {id:it.id, state:'deleted'};
      }
      if(it.draftId){ try{ GmailApp.getDraft(String(it.draftId)).getMessage(); return {id:it.id, state:'draft'}; }catch(e){ return {id:it.id, state:'gone'}; } }
      return {id:it.id, state:'gone'};
    }catch(err){ return {id:it.id, state:'unknown', error:String(err.message || err).slice(0, 200)}; }
  });
}
// the same text as HTML, so Gmail shows the paragraphs the way they were written
function bodyHtml_(text){
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">' +
    text.split(/\n{2,}/).map(par => '<p style="margin:0 0 14px">' + esc(par).replace(/\n/g, '<br>') + '</p>').join('') + '</div>';
}

/* ---------- helpers ---------- */
// "AutoDraft/Owner Statements" — the parent is made first so Gmail nests it
function label_(){
  const parts = String(CFG.LABEL).split('/');
  let lab = null;
  parts.forEach((_, i) => { const name = parts.slice(0, i + 1).join('/'); lab = GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); });
  return lab;
}
function keyOk_(t){
  const k = PropertiesService.getScriptProperties().getProperty('KEY') || '';
  t = String(t || '');
  if(!k || t.length !== k.length) return false;
  let diff = 0; for(let i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ t.charCodeAt(i);
  return diff === 0;
}
function emailOk_(e){ return /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(String(e || '').trim()); }
function safeName_(s){ return String(s || '').replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Owner Statement'; }
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
