const STATUS_HELP={New:'Acquired and recorded. Preparation has not started.',Processing:'Preparation has started: testing, cleaning, photos, condition checks or pricing.',Prepared:'The item packet is complete and ready to list.',Listed:'Available for sale. Order updates will come through Shopify once connected.','Sold/Returned':'Sale or return status is maintained by marketplace order updates.'};
const showItemDetail=openDetail;
openDetail=function(id){
 showItemDetail(id);
 const x=inventoryItems.find(x=>x.id===id);if(!x)return;
 const button=$('advance-button'),external=['Listed','Sold/Returned'].includes(x.status);
 button.disabled=external;
 button.lastChild.textContent=external?'Awaiting marketplace updates':'Move to '+STATUSES[Math.min(STATUSES.indexOf(x.status)+1,4)];
 document.querySelector('.status-explanation')?.remove();
 const help=document.createElement('div');help.className='status-explanation';help.innerHTML=`<strong>${escapeHtml(x.status)}</strong><p>${escapeHtml(STATUS_HELP[x.status]||'')}</p><small>Shopify / Marketplace Connect: not connected. No automatic order signals are being received yet.</small>`;
 $('detail-condition').parentElement.appendChild(help);
};
advanceActive=function(){const x=inventoryItems.find(x=>x.id===activeItemId);if(!x)return;if(['Listed','Sold/Returned'].includes(x.status)){showToast('Order status will be updated by Shopify once connected.');return;}const status=STATUSES[Math.min(STATUSES.indexOf(x.status)+1,3)];if(commit(inventoryItems.map(i=>i===x?{...i,status}:i),'Preparation status updated.'))openDetail(x.id);};
openSale=function(){showToast('Sales and returns will be updated through Shopify when order sync is connected.');};
$('sale-form').onsubmit=e=>{e.preventDefault();openSale();};
// Local profiles and preferences only; marketplace order integration will be server-side.
function applyTheme(theme){document.documentElement.dataset.theme=theme;$('theme-toggle').textContent=theme==='dark'?'☀ Light mode':'☾ Dark mode';$('theme-toggle').setAttribute('aria-pressed',String(theme==='dark'));}
function toggleTheme(){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(theme);try{localStorage.setItem('gadgetflippers.theme',theme);}catch{}}
let savedTheme='light';try{savedTheme=localStorage.getItem('gadgetflippers.theme')==='dark'?'dark':'light';}catch{}applyTheme(savedTheme);
