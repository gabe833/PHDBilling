/* =====================================================================
   PHD Billing — project invoice emails (Google Apps Script)
   ---------------------------------------------------------------------
   Install this in the billing@phdproperties.realestate Google account.
   The console writes the email (you see and edit it there first), then
   this script sends it from billing@'s Gmail, or saves it as a draft
   there if you'd rather send it from Gmail yourself. Sent emails stay in
   billing@'s Sent folder with the label below, like any other email.

   One-time setup (signed in as billing@phdproperties.realestate):
     1. script.google.com → New project → paste this file → Save.
     2. Optional, to add billing@'s Gmail signature to every email:
        left sidebar → Services (+) → Gmail API → Add.
     3. Run setup() once and allow access. The log prints the console key.
     4. Deploy → New deployment → Web app.
          Execute as: Me (billing@phdproperties.realestate)
          Who has access: Anyone
        Copy the web app URL.
     5. In the console: open a project invoice → Email owner → paste the URL and key.
   If the key is ever exposed, run rotateConsoleKey() and paste the new key.
   ===================================================================== */
const CFG = {
  FROM_NAME: 'PHD Billing',                   // the name owners see next to billing@'s address
  LABEL: 'Console/Project Invoices',         // every email sent or drafted from the console gets this label
  MAX_PER_DAY: 60                            // a safety cap on emails per day from the console
};

/* ---------- one-time setup ---------- */
function setup(){
  const props = PropertiesService.getScriptProperties();
  if(!props.getProperty('KEY')) props.setProperty('KEY', newKey_());
  GmailApp.getDrafts();                      // asks for Gmail access now, not on the first email
  label_();
  Logger.log('Emails will be sent from: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Gmail signature found: ' + (signature_() ? 'yes' : 'no (add the Gmail API service to include it)'));
  Logger.log('Console key (paste into the console): ' + props.getProperty('KEY'));
}
function showConsoleKey(){ Logger.log(PropertiesService.getScriptProperties().getProperty('KEY')); }
function rotateConsoleKey(){ PropertiesService.getScriptProperties().setProperty('KEY', newKey_()); showConsoleKey(); }
function newKey_(){ return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

/* ---------- web app (the console talks to this) ---------- */
function doGet(e){
  const p = (e && e.parameter) || {};
  if(!keyOk_(p.token)) return json_({ok:false, error:'unauthorized'});
  if(p.action === 'ping') return json_({ok:true, mailbox:Session.getEffectiveUser().getEmail(), fromName:CFG.FROM_NAME, signature:signature_()});
  return json_({ok:false, error:'unknown action'});
}
function doPost(e){
  let b = {};
  try{ b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }catch(err){ return json_({ok:false, error:'bad json'}); }
  if(!keyOk_(b.token)) return json_({ok:false, error:'unauthorized'});
  try{
    if(b.action === 'send' || b.action === 'draft') return json_(mail_(b, b.action === 'send'));
    if(b.action === 'status') return json_({ok:true, results:status_(b.items)});
  }catch(err){ return json_({ok:false, error:String(err.message || err).slice(0, 300)}); }
  return json_({ok:false, error:'unknown action'});
}

/* ---------- one email ---------- */
// {to, cc, subject, html, text, pdfHtml, fileName}: html is the body as the console showed it
function mail_(b, send){
  const to = list_(b.to), cc = list_(b.cc);
  if(!to.length) throw new Error('Add the owner\'s email');
  if(send) count_();
  const subject = String(b.subject || 'Invoice').replace(/[\r\n]+/g, ' ').slice(0, 200);
  const sig = b.noSignature ? '' : signature_();
  const html = wrap_(clean_(String(b.html || '')) + (sig ? '<br>' + sig : ''));
  const text = String(b.text || '').slice(0, 10000);
  const opts = {htmlBody:html, name:CFG.FROM_NAME};
  if(cc.length) opts.cc = cc.join(',');
  if(b.pdfHtml){
    const name = safeName_(String(b.fileName || subject).replace(/\.pdf$/i, '')) + '.pdf';
    opts.attachments = [Utilities.newBlob(String(b.pdfHtml), MimeType.HTML, 'invoice.html').getAs(MimeType.PDF).setName(name)];
  }
  const me = Session.getEffectiveUser().getEmail(), label = label_();
  if(!send){
    const d = GmailApp.createDraft(to.join(','), subject, text, opts);
    let threadId = ''; try{ const th = d.getMessage().getThread(); threadId = th.getId(); th.addLabel(label); }catch(e){}
    return {ok:true, drafted:true, draftId:d.getId(), threadId:threadId, from:me};
  }
  // send through a draft so the sent message's thread id can be returned
  const d = GmailApp.createDraft(to.join(','), subject, text, opts);
  const m = d.send();
  let threadId = ''; try{ const th = m.getThread(); threadId = th.getId(); th.addLabel(label); }catch(e){}
  return {ok:true, sent:true, threadId:threadId, messageId:m.getId(), at:new Date().toISOString(), from:me};
}
// where an email stands: still a draft, sent, or deleted
function status_(items){
  return (Array.isArray(items) ? items.slice(0, 100) : []).map(it => {
    try{
      let th = null; try{ th = GmailApp.getThreadById(String(it.threadId || '')); }catch(e){}
      if(!th || th.isInTrash()) return {id:it.id, state:'deleted'};
      const ms = th.getMessages().filter(m => !m.isInTrash());
      const sent = ms.filter(m => !m.isDraft());
      if(sent.length) return {id:it.id, state:'sent', at:sent[sent.length - 1].getDate().toISOString()};
      return {id:it.id, state:ms.length ? 'draft' : 'deleted'};
    }catch(err){ return {id:it.id, state:'unknown'}; }
  });
}

/* ---------- helpers ---------- */
// billing@'s Gmail signature (needs the Gmail API service; without it, no signature is added)
function signature_(){
  try{
    if(typeof Gmail === 'undefined') return '';
    const me = Session.getEffectiveUser().getEmail();
    const list = Gmail.Users.Settings.SendAs.list('me').sendAs || [];
    const s = list.find(x => String(x.sendAsEmail).toLowerCase() === me.toLowerCase()) || list.find(x => x.isDefault) || {};
    return String(s.signature || '');
  }catch(e){ return ''; }
}
// only simple formatting from the console: paragraphs, line breaks, links, bold
function clean_(h){
  return h.replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*("|')\s*javascript:[^"']*\1/gi, 'href="#"')
    .slice(0, 20000);
}
function wrap_(inner){ return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">' + inner + '</div>'; }
function count_(){
  const props = PropertiesService.getScriptProperties(), day = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  const cur = JSON.parse(props.getProperty('COUNT') || '{}'), n = cur.day === day ? cur.n : 0;
  if(n >= CFG.MAX_PER_DAY) throw new Error('Daily limit reached (' + CFG.MAX_PER_DAY + ' emails). Raise MAX_PER_DAY in the script if this is expected.');
  props.setProperty('COUNT', JSON.stringify({day:day, n:n + 1}));
}
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
function list_(v){ return String(v || '').split(/[,;\s]+/).map(x => x.trim()).filter(x => /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(x)).slice(0, 8); }
function safeName_(s){ return String(s || '').replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Invoice'; }
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
