const SHEETS_URL='https://docs.google.com/spreadsheets/d/1pzm-6EZ4UPGMOst0ije19PyfXzbXXpicuqnGR4ONXcA/edit';
let sheetsSyncBusy=false,sheetsSyncTimer=null;
const DEFAULT_SCRIPT_URL='https://script.google.com/macros/s/AKfycbyvRHv4y4f-v7C3CBWjEplZerC-5_lLleG8dckzSzagUHMF9YY11FV1FxbRJ4DTGqJz/exec';
function sheetsConfig(){try{return {url:DEFAULT_SCRIPT_URL,...JSON.parse(localStorage.getItem('obsidian.appsScript.config')||'{}')};}catch{return {url:DEFAULT_SCRIPT_URL};}}
function validScriptUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)||url.search||url.hash)throw Error('Paste the deployed Apps Script web-app URL ending in /exec.');return url.href;}
function sheetsStatus(text){const node=$('sheets-sync-status');if(node)node.textContent=text;}
function openSheetsSync(){
 const config=sheetsConfig(),last=localStorage.getItem('obsidian.sheets.lastSync');
 $('sheets-sync-fields').innerHTML=`<p class="text-sm text-gray-500 mb-4">Automatic inventory logging through Google Apps Script. No local bridge is required.</p><a class="text-sm text-emerald-600" href="${SHEETS_URL}" target="_blank" rel="noopener">Open Company Log ↗</a><div class="mt-5 space-y-4">${inputField('sheets-script-url','Apps Script web-app URL','url',config.url||'')}${inputField('sheets-script-key','Sync key','password',config.key||'')}<label class="text-sm flex gap-2"><input type="checkbox" id="sheets-auto" ${config.auto!==false?'checked':''}> Automatically sync saved inventory and bookkeeping</label><p class="text-xs text-gray-500">${last?'Last confirmed sync: '+escapeHtml(last):'No confirmed sync yet.'} Photos are logged by filename/count; the image files remain in the Vault.</p><details class="text-xs text-gray-500"><summary class="cursor-pointer font-semibold">One-time Google setup</summary><ol class="mt-3 space-y-2"><li>1. In the Company Log, open Extensions → Apps Script.</li><li>2. Paste <a href="ObsidianInventorySync.gs" download class="text-emerald-600 underline">ObsidianInventorySync.gs</a> and save.</li><li>3. In Project Settings → Script Properties, add OBSIDIAN_SYNC_KEY with a random secret of 24+ characters.</li><li>4. Deploy → New deployment → Web app. Execute as you; access: Anyone. Authorize it.</li><li>5. Paste the /exec deployment URL and the same sync key above, then connect.</li></ol></details></div>`;
 $('sheets-sync-message').textContent='';$('sheets-sync-dialog').showModal();
}
async function photoMetadata(){if(!('indexedDB' in window))return [];return new Promise(resolve=>{const r=indexedDB.open('gadgetflippers-listing-photos',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('items'))r.result.createObjectStore('items',{keyPath:'id'});};r.onerror=()=>resolve([]);r.onsuccess=()=>{const db=r.result,t=db.transaction('items'),q=t.objectStore('items').getAll();q.onerror=()=>{db.close();resolve([]);};q.onsuccess=()=>{const data=q.result.map(x=>({id:x.id,count:x.photos?.length||0,names:(x.photos||[]).map(p=>p.name)}));db.close();resolve(data);};};});}
function appsScriptPost(config,packet){return new Promise((resolve,reject)=>{
 const requestId=crypto.randomUUID(),frame=document.createElement('iframe'),form=document.createElement('form');
 frame.name='obsidian-sync-'+requestId;frame.hidden=true;frame.setAttribute('aria-hidden','true');
 form.method='POST';form.action=config.url;form.target=frame.name;form.hidden=true;
 for(const [name,value]of Object.entries({key:config.key,payload:JSON.stringify(packet),requestId})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input);}
 function cleanup(){clearTimeout(timer);window.removeEventListener('message',receive);form.remove();frame.remove();}
 function receive(event){let host;try{host=new URL(event.origin).hostname;}catch{return;}if(!(host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('-script.googleusercontent.com')))return;if(event.data?.type!=='obsidian-sheets-result'||event.data.requestId!==requestId)return;cleanup();if(event.data.result?.ok)resolve(event.data.result);else reject(Error(event.data.result?.error||'Apps Script rejected the sync.'));}
 window.addEventListener('message',receive);const timer=setTimeout(()=>{cleanup();reject(Error('Google did not confirm the sync. Check the deployment and Apps Script executions. The app will retry; matching IDs prevent duplicate inventory rows.'));},120000);
 document.body.appendChild(frame);document.body.appendChild(form);form.submit();
 });}
async function sendSheetsSync(manual=true){
 if(sheetsSyncBusy)return;let config=sheetsConfig();
 try{
  if(manual){config={url:validScriptUrl($('sheets-script-url').value.trim()),key:$('sheets-script-key').value.trim(),auto:$('sheets-auto').checked};if(config.key.length<24)throw Error('Enter the same sync key set in Apps Script (24+ characters).');localStorage.setItem('obsidian.appsScript.config',JSON.stringify(config));}
  if(!config.url||!config.key){sheetsStatus('Sheets: setup needed');return;}
  validScriptUrl(config.url);sheetsSyncBusy=true;clearTimeout(sheetsSyncTimer);sheetsSyncTimer=null;sheetsStatus('Sheets: syncing…');if(manual){$('sheets-sync-submit').disabled=true;$('sheets-sync-message').textContent='Sending all current records…';}
  const revision=localStorage.getItem('obsidian.sheets.revision');
  const packet={version:1,items:inventoryItems,bookkeeping:bookEntries,photos:await photoMetadata(),owner:activeUser,syncedAt:new Date().toISOString()};
  const result=await appsScriptPost(config,packet);
  localStorage.setItem('obsidian.sheets.lastSync',result.syncedAt);
  if(localStorage.getItem('obsidian.sheets.revision')===revision)localStorage.removeItem('obsidian.sheets.pending');
  sheetsStatus('Sheets: synced');const text=`Confirmed: ${result.counts.Inventory} inventory, ${result.counts.Customers} customer and ${result.counts.Bookkeeping} financial records logged.`;
  if(manual){$('sheets-sync-message').textContent=text;showToast(text);}
 }catch(err){sheetsStatus('Sheets: pending / retry');localStorage.setItem('obsidian.sheets.pending','yes');if(manual)$('sheets-sync-message').textContent=err.message||'Sync failed.';if(config.auto&&config.url)sheetsSyncTimer=setTimeout(()=>sendSheetsSync(false),60000);}
 finally{sheetsSyncBusy=false;if($('sheets-sync-submit'))$('sheets-sync-submit').disabled=false;if(localStorage.getItem('obsidian.sheets.pending')==='yes'&&config.auto&&!sheetsSyncTimer)sheetsSyncTimer=setTimeout(()=>sendSheetsSync(false),2500);}
}
function scheduleSheetsSync(){localStorage.setItem('obsidian.sheets.pending','yes');localStorage.setItem('obsidian.sheets.revision',crypto.randomUUID());const config=sheetsConfig();if(!config.url||!config.key){sheetsStatus('Sheets: setup needed');return;}if(config.auto===false)return;clearTimeout(sheetsSyncTimer);sheetsSyncTimer=setTimeout(()=>{sheetsSyncTimer=null;if(sheetsSyncBusy){scheduleSheetsSync();return;}if(document.body.classList.contains('workspace-locked'))return;sendSheetsSync(false);},1500);}
const commitBeforeSheets=commit;
commit=function(next,message){const saved=commitBeforeSheets(next,message);if(saved)scheduleSheetsSync();return saved;};
const financeBeforeSheets=saveBookEntry;
saveBookEntry=function(event){const previous=bookEntries;financeBeforeSheets(event);if(bookEntries!==previous)scheduleSheetsSync();};$('book-form').onsubmit=saveBookEntry;
const deleteBeforeSheets=$('book-delete').onclick;$('book-delete').onclick=()=>{const previous=bookEntries;deleteBeforeSheets();if(previous!==bookEntries)scheduleSheetsSync();};
const restoreBeforeSheets=$('restore-file').onchange;$('restore-file').onchange=async event=>{const previous=inventoryItems,previousBook=bookEntries;await restoreBeforeSheets(event);if(previous!==inventoryItems||previousBook!==bookEntries)scheduleSheetsSync();};
const syncDialog=document.createElement('dialog');syncDialog.id='sheets-sync-dialog';syncDialog.innerHTML='<h2 class="text-xl font-bold mb-4">Connect Google Sheets</h2><div id="sheets-sync-fields"></div><p id="sheets-sync-message" role="status" class="text-sm my-4"></p><div class="flex justify-end gap-3"><button type="button" onclick="document.getElementById(\'sheets-sync-dialog\').close()" class="px-4 py-2 border rounded-lg">Close</button><button type="button" id="sheets-sync-submit" class="px-4 py-2 bg-emerald-600 text-white rounded-lg">Connect & sync all</button></div>';document.body.appendChild(syncDialog);$('sheets-sync-submit').onclick=()=>sendSheetsSync(true);
const syncBadge=document.createElement('span');syncBadge.id='sheets-sync-status';syncBadge.className='text-xs text-gray-500';$('nav-bookkeeping').parentElement.appendChild(syncBadge);sheetsStatus(sheetsConfig().url?'Sheets: ready':'Sheets: setup needed');window.addEventListener('online',scheduleSheetsSync);
