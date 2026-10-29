const openWorkspaceItem=openDetail;
const switchWorkspaceView=switchView;
switchView=function(name){document.body.classList.remove('item-inspector-open');switchWorkspaceView(name);};
openDetail=function(id){
 openWorkspaceItem(id);
 if(currentView!=='detail')return;
 renderList();
 $('view-list').classList.remove('hidden-view');
 document.body.classList.add('item-inspector-open');
 $('top-header-title').textContent='Inventory Vault';
 $('nav-list').classList.add('bg-emerald-50','text-emerald-700');
 // Keep listing preparation within the item pane so economics stays at the far right.
 const listing=document.querySelector('#view-detail .listing-prep');
 const details=document.querySelector('#view-detail .max-w-5xl > .bg-white > .flex-1');
 if(listing&&details)details.appendChild(listing);
};
