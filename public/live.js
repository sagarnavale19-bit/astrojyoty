import { signup, login, logout, getUser, handleAuthCallback, requestPasswordRecovery, updateUser, acceptInvite } from 'https://esm.sh/@netlify/identity@2.0.0?bundle';
const $=id=>document.getElementById(id);
let user=null, baseline=new Map(), versions=new Map(), pending=0, chain=Promise.resolve(), ready=false;
const status=(message,error=false)=>{ $('syncStatus').textContent=message; $('syncStatus').style.background=error?'#ffe1e1':'#fff3d6'; };
const message=(id,text)=>{ $(id).textContent=text; };
const key=(kind,id)=>kind+':'+id;
function records(){
 const out=[];
 for(const c of customers) if(c.id) out.push({kind:'profile',id:c.id,data:{name:c.name,phone:c.phone,email:c.email,members:c.members||[]}});
 for(const b of bookings) out.push({kind:'booking',id:b.id,data:b});
 if(ownerSession) for(const [id,data] of Object.entries({site:siteSettings,services,availability,payment:astroPaymentSettings})) out.push({kind:'setting',id,data});
 return structuredClone(out);
}
function remember(){baseline=new Map(records().map(r=>[key(r.kind,r.id),JSON.stringify(r.data)]));}
async function request(options){
 const response=await fetch('/api/data',{credentials:'same-origin',cache:'no-store',...options});
 const result=await response.json();
 if(!response.ok) throw new Error(result.error || 'Connection failed. Please try again.');
 return result;
}
function redraw(){
 const selected=$('service').value,slot=$('slot').value;
 applySiteSettings();renderServices();$('service').value=selected;refreshSlots();$('slot').value=slot;
 updateAccountState();
 $('ownerLoginPanel').classList.toggle('hidden',ownerSession);
 $('ownerTools').classList.toggle('hidden',!ownerSession);
 if(ownerSession) {revealOwner(false);renderOwner();}
}
async function load(){
 const data=await request();
 ownerSession=data.owner;window.occupiedSlots=data.occupied;
 versions=new Map();
 customers=data.profiles.map(row=>{versions.set(key('profile',row.id),row.version);return {...row.data,id:row.id};});
 bookings=data.bookings.map(row=>{versions.set(key('booking',row.id),row.version);return row.data;});
 reports=bookings.flatMap(b=>b.reports||[]);
 const me=customers.find(c=>c.id===data.userId);currentCustomer=me?.phone||'';
 for(const row of data.settings){
  versions.set(key('setting',row.id),row.version);
  if(row.id==='site')siteSettings=row.data;
  if(row.id==='services')services=row.data;
  if(row.id==='availability')availability=row.data;
  if(row.id==='payment')astroPaymentSettings={...row.data,qr:row.data.qrKey?'/api/data?file=qr':'',razorpayKey:'',mode:'upi'};
 }
 remember();redraw();ready=true;
 status('Connected · Changes sync across devices every 15 seconds');
 if(user&&!me&&!ownerSession) status('Signed in · Complete your name and phone below to create your customer profile.');
 if(me){$('name').value ||= me.name;$('phone').value=me.phone;$('email').value=me.email;}
}
window.cloudSave=()=>{
 if(!ready || !user){status('Please sign in and wait for the database connection before saving.',true);return Promise.resolve(false);}
 pending++;status('Saving to shared database…');
 const operation=chain.then(async()=>{
  const changes=records().filter(r=>baseline.get(key(r.kind,r.id))!==JSON.stringify(r.data)).map(r=>({...r,version:versions.get(key(r.kind,r.id))||0}));
  if(!changes.length)return true;
  await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes})});
  for(const r of changes){baseline.set(key(r.kind,r.id),JSON.stringify(r.data));versions.set(key(r.kind,r.id),r.version+1);}
  status('Saved · All changes are in the shared database');
  return true;
 }).catch(async error=>{
  // Reload authoritative records after a rejected save; never display a false confirmation.
  try{await load();}catch{}
  status('Not saved: '+error.message+' Please re-enter the change and try again.',true);
  return false;
 }).finally(()=>{pending--;});
 chain=operation;return operation;
};
function bind(id,handler){$(id).addEventListener('submit',async event=>{
 event.preventDefault();const button=$(id).querySelector('button');button.disabled=true;
 try{await handler();}catch(error){status(error.message,true);message(id==='registerForm'?'registerMessage':id==='ownerLoginForm'?'ownerLoginMessage':id==='changePasswordForm'?'changeMessage':'loginMessage',error.message);}
 finally{button.disabled=false;}
});}
async function syncUser(){user=await getUser();await load();}
bind('registerForm',async()=>{
 if(!user){
  const result=await signup($('regEmail').value.trim(),$('regPassword').value,{full_name:$('regName').value.trim(),phone:$('regPhone').value.replace(/\D/g,'')});
  $('regPassword').value='';
  message('registerMessage','Check your email and confirm your account, then sign in.');
  user=await getUser();if(!user)return;
 }
 await load();
 if(!customers.some(c=>c.id===user.id)){
  customers.push({id:user.id,name:$('regName').value.trim()||user.name,phone:$('regPhone').value.replace(/\D/g,''),email:user.email,members:[]});
  if(!await window.cloudSave())return;
 }
 await load();message('registerMessage','Your profile is saved and available on all your devices.');
});
async function signIn(email,password){await login(email,password);await syncUser();}
bind('loginForm',async()=>{await signIn($('loginPhone').value.trim(),$('loginPassword').value);$('loginPassword').value='';message('loginMessage','Signed in. Your records are synchronized.');});
bind('ownerLoginForm',async()=>{
 await signIn($('ownerLoginName').value.trim(),$('ownerLoginPassword').value);$('ownerLoginPassword').value='';
 if(!ownerSession)throw new Error('This account does not have owner access.');
 fillSiteForm();fillPaymentSettings();message('ownerLoginMessage','Signed in as owner.');
});
bind('changePasswordForm',async()=>{
 await signIn($('changePhone').value.trim(),$('changeCurrent').value);
 await updateUser({password:$('changeNew').value});$('changeCurrent').value='';$('changeNew').value='';message('changeMessage','Password updated.');
});
window.liveLogout=async()=>{
 if(pending)await chain;
 await logout();user=null;bookings=[];reports=[];customers=[];currentCustomer='';ownerSession=false;
 redraw();await load();switchView('home');
};
window.logoutCustomer=window.liveLogout;
const recovery=document.createElement('button');recovery.type='button';recovery.className='secondary';recovery.textContent='Forgot password?';
recovery.onclick=async()=>{try{await requestPasswordRecovery($('loginPhone').value.trim());message('loginMessage','If the account exists, a password reset link is on its way.');}catch(error){message('loginMessage',error.message);}};
$('loginForm').after(recovery);
$('ownerLoginName').value='umesh_jotkar@rediffmail.com';
const ownerHelp=document.createElement('p');ownerHelp.className='muted';ownerHelp.textContent='First visit: create an account with the owner email in Customer account and confirm the email, then sign in here.';$('ownerLoginForm').before(ownerHelp);
// Remove legacy demo records, including plaintext passwords, from this browser.
for(const name of ['astroBookings','astroReports','astroCustomers','astroOwnerCreds','astroCurrentCustomer','astroServices','astroAvailability','astroSiteSettings','astroPaymentSettings','astroSocial'])localStorage.removeItem(name);
try{
 const callback=await handleAuthCallback();
 if(callback?.type==='invite' || callback?.type==='recovery'){
  const panel=document.createElement('form');panel.className='card';panel.innerHTML='<h3>Set your password</h3><label for="newAccountPassword">New password (at least 8 characters)</label><input id="newAccountPassword" type="password" minlength="8" required autocomplete="new-password"><button class="primary">Save password</button><p role="status"></p>';
  $('syncStatus').after(panel);
  panel.onsubmit=async event=>{event.preventDefault();try{const password=$('newAccountPassword').value;if(callback.type==='invite')await acceptInvite(callback.token,password);else await updateUser({password});panel.remove();await syncUser();status('Password saved.');}catch(error){panel.querySelector('p').textContent=error.message;}};
 }
 await syncUser();
 // Confirmation links carry signup metadata, so a profile can be created without re-entering personal details.
 if(user && !customers.some(c=>c.id===user.id) && user.userMetadata?.phone){
  customers.push({id:user.id,name:user.name||user.userMetadata.full_name,phone:user.userMetadata.phone,email:user.email,members:[]});
  await window.cloudSave();await load();
 }
}catch(error){status('Connection unavailable: '+error.message+' Refresh to reconnect.',true);}
setInterval(async()=>{if(!ready||pending||document.hidden)return;try{user=await getUser();await load();}catch{status('Connection lost · Changes need a connection to save.',true);}},15000);
window.addEventListener('online',()=>{if(!pending)load().catch(error=>status(error.message,true));});
window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue='';}});
