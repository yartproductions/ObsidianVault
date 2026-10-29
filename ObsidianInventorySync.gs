const inventoryColumns=[['Item ID','id'],['Purchase ID','transactionId'],['Date acquired','date'],['Item','model'],['Category','category'],['Specifications','specs'],['Condition','condition'],['Notes','notes'],['Serial / IMEI','serial'],['Status','status'],['Storage','location'],['Purchased by','purchasedBy'],['Cost USD','cost'],['Expected resale USD','target'],['Listed price USD','listed'],['Fees USD','fees'],['Shipping USD','shipping'],['Risk allowance USD','risk'],['Seller','customer'],['Seller email','customerContact'],['Seller phone','customerPhone'],['Source','source'],['Purchase payment method','paymentMethod'],['Payment reference','paymentReference'],['Purchase notes','purchaseNotes'],['Buyer','buyer'],['Buyer email','buyerEmail'],['Buyer phone','buyerPhone'],['Sale date','soldDate'],['Sale price USD','sale'],['Platform','platform'],['Listing ID','listingId'],['Assessment score','score'],['Battery health','battery'],['Functional','functional'],['Charger','charger'],['Shopify draft ID','shopifyDraft.id'],['Shopify draft URL','shopifyDraft.url'],['Draft title','listingPrep.title'],['Draft description','listingPrep.description'],['Draft price USD','listingPrep.price'],['Photo count','_photoCount'],['Photo filenames','_photoNames'],['Created by','createdBy'],['Updated by','updatedBy'],['Additional fields JSON','_extra']];
const headers={Inventory:inventoryColumns.map(c=>c[0]),Customers:['Contact ID','Name','Email','Phone','Roles','Linked item IDs'],Bookkeeping:['Transaction ID','Date','Description','Type','Amount USD','Category','Tags','Who made it','Method','Counterparty','Reference','Notes','Source'],Sync:['Record','Last sync UTC','Owner','Inventory records sent','Customer records sent','Financial records sent','Photos']};
const get=(x,path)=>path.split('.').reduce((v,k)=>v?.[k],x);
const cell=value=>value==null?'':typeof value==='object'?JSON.stringify(value):typeof value==='number'||typeof value==='boolean'?value:String(value);
function makeSheetsRows(packet){
 if(!Array.isArray(packet?.items)||packet.items.length>10000||packet.items.some(x=>!x||typeof x.id!=='string'||!x.id||typeof x.model!=='string'))throw Error('Invalid inventory sync packet.');
 if(new Set(packet.items.map(x=>x.id)).size!==packet.items.length)throw Error('Inventory has duplicate item IDs.');
 if(!Array.isArray(packet.bookkeeping||[])||(packet.bookkeeping||[]).length>10000)throw Error('Invalid financial packet.');
 const known=new Set(inventoryColumns.map(c=>c[1].split('.')[0]));
 const contacts=new Map(),photoMap=new Map((packet.photos||[]).map(p=>[p.id,p]));
 const inventory=packet.items.map(item=>{const p=photoMap.get(item.id),extra=Object.fromEntries(Object.entries(item).filter(([key])=>!known.has(key)));return inventoryColumns.map(([label,key])=>{if(key==='_photoCount')return p?.count??'';if(key==='_photoNames')return (p?.names||[]).join('\n');if(key==='_extra')return JSON.stringify(extra);const v=get(item,key);return / USD$/.test(label)&&v!==''&&v!=null&&Number.isFinite(Number(v))?Number(v):cell(v);});});
 for(const item of packet.items)for(const p of [{name:item.customer,email:item.customerContact,phone:item.customerPhone,role:'Seller'},{name:item.buyer,email:item.buyerEmail,phone:item.buyerPhone,role:'Buyer'}]){const key=String(p.email||p.phone||p.name||'').trim().toLowerCase();if(!key)continue;if(!contacts.has(key))contacts.set(key,{...p,roles:new Set(),ids:new Set()});const c=contacts.get(key);c.roles.add(p.role);c.ids.add(item.id);}
 const customerRows=[...contacts].map(([key,c])=>[key,c.name||'',c.email||'',c.phone||'',[...c.roles].join(', '),[...c.ids].join(', ')]);
 const manual=(packet.bookkeeping||[]).map(x=>{if(!x||typeof x.id!=='string'||!['expense','income','transfer'].includes(x.type)||!Number.isSafeInteger(x.cents)||x.cents<=0)throw Error('Invalid bookkeeping entry.');return [x.id,x.date||'',x.title||'',x.type,x.cents/100,x.category||'',(x.tags||[]).join(', '),x.owner||'',x.method||'',x.payee||'',x.reference||'',x.notes||'','Manual'];});
 const purchases=packet.items.filter(x=>x.cost!==''&&x.cost!=null&&Number.isFinite(Number(x.cost))).map(x=>['inventory:'+x.id,x.date||'',x.model,'expense',Number(x.cost),'Inventory acquisition','Inventory',x.purchasedBy||'',x.paymentMethod||'',x.customer||'',x.paymentReference||'',x.transactionId||'','Inventory']);
 if(new Set(manual.map(x=>x[0])).size!==manual.length)throw Error('Duplicate financial IDs.');
 const result={Inventory:inventory,Customers:customerRows,Bookkeeping:[...manual,...purchases]};
 result.Sync=[['latest',packet.syncedAt||new Date().toISOString(),packet.owner||'',inventory.length,customerRows.length,result.Bookkeeping.length,'Photo metadata only; images stay in the Vault / Shopify']];
 return result;
}
function columnName(n){let name='';for(;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;}
function planSheetUpserts(name,existing,incoming){
 const columns=headers[name],first=existing[0]||[];
 if(first.length&&columns.some((h,i)=>first[i]!==h))throw Error(name+' headers do not match the managed log. Restore the expected headers before syncing.');
 const data=first.length?[]:[{range:`'${name}'!A1:${columnName(columns.length)}1`,values:[columns]}];
 const indexes=new Map();for(let i=1;i<existing.length;i++){const id=existing[i]?.[0];if(!id)continue;if(indexes.has(id))throw Error('Duplicate IDs in '+name+'. Resolve them before syncing.');indexes.set(id,i+1);}
 let next=Math.max(2,existing.length+1);
 for(const row of incoming){const index=indexes.get(row[0])||next++;data.push({range:`'${name}'!A${index}:${columnName(columns.length)}${index}`,values:[row.map(cell)]});}
 return {data,rows:Math.max(1,next-1,...indexes.values())};
}


/** Paste the generated ObsidianInventorySync.gs into Extensions > Apps Script. */
function doGet() {
  return ContentService.createTextOutput('Obsidian Gadget inventory sync. Use the app to send records.');
}
function doPost(e) {
  var requestId=String(e && e.parameter && e.parameter.requestId || '');
  var result;
  var lock;
  try {
    var props=PropertiesService.getScriptProperties();
    var expected=props.getProperty('OBSIDIAN_SYNC_KEY');
    if(!expected || expected.length<24) throw new Error('Set OBSIDIAN_SYNC_KEY in Script Properties (at least 24 characters).');
    if(!e || !e.parameter || e.parameter.key!==expected) throw new Error('Invalid sync key.');
    var raw=e.parameter.payload;
    if(typeof raw!=='string' || raw.length>12000000) throw new Error('Invalid or oversized sync packet.');
    var packet=JSON.parse(raw);
    var tables=makeSheetsRows(packet);
    lock=LockService.getScriptLock();
    if(!lock.tryLock(20000)) throw new Error('Another sync is running. Try again shortly.');
    var book=SpreadsheetApp.openById(props.getProperty('OBSIDIAN_SHEET_ID') || '1pzm-6EZ4UPGMOst0ije19PyfXzbXXpicuqnGR4ONXcA');
    // Validate every header and ID before changing any tab.
    var plans=[];
    Object.keys(headers).forEach(function(name){
      var sheet=book.getSheetByName(name);
      if(!sheet) throw new Error('Missing '+name+' tab.');
      var last=Math.max(1,sheet.getLastRow());
      if(last>50000) throw new Error(name+' log exceeds 50,000 rows. Archive older rows first.');
      var existing=sheet.getRange(1,1,last,headers[name].length).getValues();
      plans.push({name:name,sheet:sheet,plan:planSheetUpserts(name,existing,tables[name])});
    });
    plans.forEach(function(p){
      if(p.plan.rows>p.sheet.getMaxRows()) p.sheet.insertRowsAfter(p.sheet.getMaxRows(),p.plan.rows-p.sheet.getMaxRows()+100);
      var groups=[];
      p.plan.data.slice().sort(function(a,b){return Number(a.range.match(/!A(\d+)/)[1])-Number(b.range.match(/!A(\d+)/)[1]);}).forEach(function(write){
        var row=Number(write.range.match(/!A(\d+)/)[1]);
        var safe=write.values.map(function(values){return values.map(function(v){return typeof v==='string' && /^[=+@\-]/.test(v) ? "'"+v : v;});});
        var last=groups[groups.length-1];
        if(last && last.start+last.values.length===row) last.values=last.values.concat(safe);
        else groups.push({start:row,values:safe});
      });
      groups.forEach(function(group){p.sheet.getRange(group.start,1,group.values.length,headers[p.name].length).setValues(group.values);});
      p.sheet.setFrozenRows(1);
      p.sheet.setFrozenColumns(1);
    });
    SpreadsheetApp.flush();
    result={ok:true,syncedAt:new Date().toISOString(),url:book.getUrl(),counts:{}};
    Object.keys(tables).forEach(function(name){result.counts[name]=tables[name].length;});
  } catch(error) {
    result={ok:false,error:error.message || 'Sync failed.'};
  } finally {
    if(lock && lock.hasLock()) lock.releaseLock();
  }
  var message=JSON.stringify({type:'obsidian-sheets-result',requestId:requestId,result:result}).replace(/</g,'\\u003c');
  // Form POST + an authenticated request nonce avoids fetch/CORS and opaque responses.
  return HtmlService.createHtmlOutput('<!doctype html><html><body><script>window.top.postMessage('+message+',"*");<\/script>Sync complete. You can close this window.</body></html>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
