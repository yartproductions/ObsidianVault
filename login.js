(() => {
 const KEY='obsidian-gadget.pins.v1',LOCK_KEY='obsidian-gadget.pin-attempts.v1';
 let profile=activeUser,config=null,working=false,storageError=false;
 try{const raw=localStorage.getItem(KEY);if(raw){config=JSON.parse(raw);if(config?.version!==1||!['Juan','Paul'].every(name=>/^[0-9a-f]{32}$/.test(config.profiles?.[name]?.salt||'')&&/^[0-9a-f]{64}$/.test(config.profiles?.[name]?.hash||'')))throw Error();}}catch{storageError=true;}
 const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 async function pinHash(pin,salt){if(!crypto.subtle)throw Error('PIN setup requires browser cryptography. Open this file in a current Safari or Chrome browser.');const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);const bytes=new Uint8Array(salt.match(/../g).map(x=>parseInt(x,16)));return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes,iterations:150000},material,256)));}
 function pinValid(pin){return /^\d{4,8}$/.test(pin);}
 function equalHashes(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
 function gate(locked){document.body.classList.toggle('workspace-locked',locked);for(const node of document.querySelectorAll('body > main, body > aside'))node.inert=locked;}
 const screen=document.createElement('section');screen.id='login-screen';screen.setAttribute('aria-label','Obsidian Gadget login');document.body.appendChild(screen);
 function note(text){$('login-message').textContent=text;}
 function render(){
  gate(true);screen.hidden=false;
  const setup=!config;
  screen.innerHTML=`<div class="login-brand"><span>OG</span><div><strong>Obsidian Gadget</strong><small>Gadget Flippers workspace</small></div></div><form id="login-form" class="login-card"><div class="login-lock" aria-hidden="true">◇</div><p class="login-eyebrow">${setup?'FIRST-TIME SETUP':'WELCOME BACK'}</p><h1>${setup?'Set your owner PINs':'Unlock your workspace'}</h1><p class="login-subtitle">${setup?'Create a different 4–8 digit PIN for each owner.':'Choose your profile and enter your PIN.'}</p>${setup?`<div class="setup-pins">${['Juan','Paul'].map(name=>`<fieldset><legend><span>${name[0]}</span>${name}</legend><label>New PIN<input id="pin-${name}" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" required></label><label>Confirm PIN<input id="confirm-${name}" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" required></label></fieldset>`).join('')}</div>`:`<div class="login-profiles">${['Juan','Paul'].map(name=>`<button type="button" data-profile="${name}" class="${profile===name?'selected':''}" aria-pressed="${profile===name}"><span>${name[0]}</span><strong>${name}</strong><small>Owner</small></button>`).join('')}</div><label class="login-pin-label">PIN for <span id="pin-owner">${profile}</span><input id="login-pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="current-password" placeholder="••••" required></label>`}<p id="login-message" role="alert"></p><button type="submit" id="login-submit" class="login-submit">${setup?'Save PINs & open workspace':'Log in as '+profile}</button><p class="login-footnote">PINs lock this browser’s workspace. Inventory is shared between both owners.</p></form><button type="button" id="login-theme" class="login-theme">Switch appearance</button>`;
  screen.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>{if(working)return;profile=button.dataset.profile;render();$('login-pin').focus();});
  $('login-theme').onclick=toggleTheme;
  $('login-form').onsubmit=submit;
  if(storageError){note('The saved PIN configuration could not be read. Restore access on this device before continuing; existing inventory has not been changed.');$('login-submit').disabled=true;}
 }
 function attempts(){try{const value=JSON.parse(localStorage.getItem(LOCK_KEY)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
 function writeAttempts(value){try{localStorage.setItem(LOCK_KEY,JSON.stringify(value));}catch{}}
 function unlock(name){activeUser=name;$('active-user').value=name;try{localStorage.setItem('gadgetflippers.activeUser',name);}catch{}screen.hidden=true;screen.innerHTML='';gate(false);editingId=null;switchView('dashboard');showToast('Logged in as '+name);if(typeof scheduleSheetsSync==='function')scheduleSheetsSync();}
 async function submit(event){event.preventDefault();if(working||storageError)return;working=true;const submit=$('login-submit');submit.disabled=true;note('');try{
  if(!config){
   const pins={Juan:$('pin-Juan').value,Paul:$('pin-Paul').value};
   if(!pinValid(pins.Juan)||!pinValid(pins.Paul))throw Error('Use 4–8 digits for each PIN.');
   if(pins.Juan===pins.Paul)throw Error('Juan and Paul need different PINs.');
   for(const name of ['Juan','Paul'])if(pins[name]!==$('confirm-'+name).value)throw Error(name+'’s PIN confirmation does not match.');
   const next={version:1,profiles:{}};
   for(const name of ['Juan','Paul']){const salt=hex(crypto.getRandomValues(new Uint8Array(16)));next.profiles[name]={salt,hash:await pinHash(pins[name],salt)};}
   localStorage.setItem(KEY,JSON.stringify(next));config=next;unlock(profile);
  }else{
   const state=attempts(),blockedUntil=Number(state[profile]?.until||0);if(blockedUntil>Date.now())throw Error('Too many attempts. Try again in '+Math.ceil((blockedUntil-Date.now())/1000)+' seconds.');
   const pin=$('login-pin').value;if(!pinValid(pin))throw Error('Enter your 4–8 digit PIN.');
   const hash=await pinHash(pin,config.profiles[profile].salt);
   if(!equalHashes(hash,config.profiles[profile].hash)){const count=(blockedUntil&&blockedUntil<=Date.now()?0:Number(state[profile]?.count||0))+1;state[profile]={count,until:count>=5?Date.now()+60000:0};writeAttempts(state);$('login-pin').value='';throw Error(count>=5?'Too many attempts. Wait 60 seconds before trying again.':'Incorrect PIN for '+profile+'.');}
   delete state[profile];writeAttempts(state);unlock(profile);
  }
 }catch(error){if($('login-message'))note(error.message||'Could not unlock the workspace.');}finally{working=false;if(document.getElementById('login-submit'))$('login-submit').disabled=false;}}
 $('active-user').onchange=event=>{profile=event.target.value;$('active-user').value=activeUser;if(profile!==activeUser)render();};
 const logout=document.createElement('button');logout.type='button';logout.className='workspace-lock-button';logout.textContent='Lock / switch user';logout.onclick=()=>{profile=activeUser;render();};$('active-user').closest('div').appendChild(logout);
 // Require a PIN on each page load; never store a logged-in session or plaintext PIN.
 render();
})();
