(()=>{
'use strict';
const $=id=>document.getElementById(id), $$=(sel)=>[...document.querySelectorAll(sel)];
const cfg=window.DAYOFF_CONFIG||{}, cloud=Boolean(cfg.supabaseUrl&&cfg.supabaseAnonKey), allowances={Vacation:24,Unpaid:15,Casual:5};
let db=null,me=null,people=[],requests=[],view='overview',month=new Date(),filter='all';
const today=new Date();today.setHours(12,0,0,0);month=new Date(today.getFullYear(),today.getMonth(),1);
const dateISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const localDate=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)};
const fmt=s=>localDate(s).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const days=(a,b)=>window.DayoffHolidays.workdays(a,b);
const calendarDays=(a,b)=>a&&b&&b>=a?Math.round((Date.parse(b+'T12:00:00')-Date.parse(a+'T12:00:00'))/86400000)+1:0;
const units=(r,year)=>{
  if(!allowances.hasOwnProperty(r.leave_type))return 0;
  const from=r.start_date>`${year}-01-01`?r.start_date:`${year}-01-01`;
  const to=r.end_date<`${year}-12-31`?r.end_date:`${year}-12-31`;
  if(from>to)return 0;
  return r.leave_type==='Unpaid'?calendarDays(from,to):r.leave_type==='Casual'&&r.day_portion==='half'?0.5:days(from,to);
};
const committed=(user,type,year,excludeId)=>requests.filter(r=>r.user_id===user&&r.leave_type===type&&['approved','pending'].includes(r.status)&&r.id!==excludeId).reduce((s,r)=>s+units(r,year),0);
const remaining=(user,type,year)=>Math.max(0,allowances[type]-committed(user,type,year));
const yearsCovered=(a,b)=>Array.from({length:Number(b.slice(0,4))-Number(a.slice(0,4))+1},(_,i)=>Number(a.slice(0,4))+i);
const quantityText=r=>r.leave_type==='Unpaid'?`${calendarDays(r.start_date,r.end_date)} calendar day(s)`:r.leave_type==='Casual'&&r.day_portion==='half'?'0.5 paid casual day (half day)':`${days(r.start_date,r.end_date)} working day(s)`;

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameOf=id=>(people.find(p=>p.id===id)||{}).full_name||'Team member';
const initials=s=>String(s||'D').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('');
const personAvatar=(name)=>`<div class="avatar">${escape(initials(name))}</div>`;
const toast=msg=>{const e=$('toast');e.textContent=msg;e.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('show'),3500)};
const storageKey='dayoff-demo-v1';
function demoInit(){const data=JSON.parse(localStorage.getItem(storageKey)||'null');if(data){people=data.people;requests=data.requests.map(r=>r.leave_type==='Half-day'?{...r,leave_type:'Casual',day_portion:'half'}:{...r,day_portion:r.day_portion||'full'});demoSave();return;}
people=[{id:'manager',full_name:'Alex Morgan',role:'manager',email:'alex@example.com'},{id:'sam',full_name:'Sam Taylor',role:'employee',email:'sam@example.com'},{id:'jordan',full_name:'Jordan Lee',role:'employee',email:'jordan@example.com'},{id:'casey',full_name:'Casey Kim',role:'employee',email:'casey@example.com'}];
const shift=n=>{const d=new Date(today);d.setDate(d.getDate()+n);return dateISO(d)};
requests=[{id:'sample1',user_id:'sam',leave_type:'Vacation',start_date:shift(3),end_date:shift(5),status:'approved',note:''},{id:'sample2',user_id:'jordan',leave_type:'Casual',start_date:shift(10),end_date:shift(10),status:'approved',note:''},{id:'sample3',user_id:'casey',leave_type:'Vacation',start_date:shift(15),end_date:shift(17),status:'pending',note:'Family trip'},{id:'sample4',user_id:'manager',leave_type:'Casual',start_date:shift(-8),end_date:shift(-8),status:'approved',note:''}];demoSave();}
function demoSave(){if(!cloud)localStorage.setItem(storageKey,JSON.stringify({people,requests}))}
function setDemoRole(){me=people.find(p=>p.role===$('demoRole').value)||people[0];render()}
async function boot(){if(cloud){$('demoBar').classList.add('hidden');$('modeTag').textContent='Team workspace';$('modeTag').classList.add('connected');if(!window.supabase){toast('Cannot load Supabase. Check your internet connection.');return;}db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);db.auth.onAuthStateChange((_event,session)=>{if(session){loadCloud(session.user).catch(err=>toast(err.message))}else{me=null;showAuth()}});const {data,error}=await db.auth.getSession();if(error)toast(error.message);if(data.session)await loadCloud(data.session.user);else showAuth();}else{demoInit();setDemoRole()}}
function showAuth(){ $('authPanel').classList.remove('hidden');$('appPanel').classList.add('hidden');$('signOutBtn').classList.add('hidden');$('sidebarName').textContent='Not signed in';$('sidebarRole').textContent='Team member';$('approvalNav').classList.add('hidden')}
async function loadCloud(user){const prof=await db.from('profiles').select('*').eq('id',user.id).single();if(prof.error)throw prof.error;me=prof.data;await fetchCloud();$('authPanel').classList.add('hidden');$('appPanel').classList.remove('hidden');$('signOutBtn').classList.remove('hidden');render()}
async function fetchCloud(){const [p,r]=await Promise.all([db.from('profiles').select('id,full_name,email,role').order('full_name'),db.from('leave_requests').select('*').order('created_at',{ascending:false})]);if(p.error)throw p.error;if(r.error)throw r.error;people=p.data;requests=r.data}
function switchView(v){if(v==='approvals'&&me?.role!=='manager')v='overview';view=v;$$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$$('.view').forEach(el=>el.classList.toggle('hidden',el.id!=='view-'+v));$('crumb').textContent=({overview:'Overview',requests:'My requests',calendar:'Team calendar',approvals:'Approvals'})[v];renderPanels();window.scrollTo({top:0,behavior:'smooth'});}
function render(){if(!me)return;const fname=me.full_name.split(' ')[0];$('helloName').textContent=fname;$('sidebarName').textContent=me.full_name;$('sidebarRole').textContent=me.role==='manager'?'Manager':'Employee';$('sidebarAvatar').textContent=initials(me.full_name);$('topAvatar').textContent=initials(me.full_name);$('approvalNav').classList.toggle('hidden',me.role!=='manager');const pending=requests.filter(r=>r.status==='pending'&&r.user_id!==me.id).length;$('pendingCount').textContent=pending;switchView(view)}
const sorted=a=>[...a].sort((x,y)=>(y.created_at||y.start_date).localeCompare(x.created_at||x.start_date));
const myRequests=()=>requests.filter(r=>r.user_id===me.id);
const visibleTeam=()=>requests.filter(r=>r.status==='approved');
function renderPanels(){const mine=myRequests();const year=today.getFullYear();
$('metricApproved').textContent=remaining(me.id,'Vacation',year);
$('metricUnpaid').textContent=remaining(me.id,'Unpaid',year);
$('metricCasual').textContent=remaining(me.id,'Casual',year);
$('metricPending').textContent=mine.filter(r=>r.status==='pending').length;
const now=dateISO(today);$('metricAway').textContent=new Set(visibleTeam().filter(r=>r.start_date<=now&&r.end_date>=now).map(r=>r.user_id)).size;
$('monthIntro').textContent=month.toLocaleDateString(undefined,{month:'long',year:'numeric'})+' · Leave and Georgian holidays';$('miniCalendar').innerHTML=calendarHTML(new Date(today.getFullYear(),today.getMonth(),1),true);$('upcomingList').innerHTML=upcomingHTML();$('recentRequests').innerHTML=requestsHTML(sorted(mine).slice(0,4),false);$('allRequests').innerHTML=requestsHTML(sorted(mine).filter(r=>filter==='all'||r.status===filter),true);$('calendarMonthTitle').textContent=month.toLocaleDateString(undefined,{month:'long',year:'numeric'});$('fullCalendar').innerHTML=calendarHTML(month,false);const hd=[...window.DayoffHolidays.holidayMap(month.getFullYear()).entries()].filter(([date])=>Number(date.slice(5,7))===month.getMonth()+1).sort(([a],[b])=>a.localeCompare(b));$('holidayList').innerHTML=hd.length?'<div class="holiday-list-title">Holidays this month</div>'+hd.map(([date,h])=>`<div class="holiday-entry"><span class="holiday-key ${h.kind}"></span><strong>${fmt(date)}</strong> ${escape(h.name)}${h.kind==='company'?' <small>(company)</small>':''}</div>`).join(''):'';const start=dateISO(new Date(month.getFullYear(),month.getMonth(),1)),end=dateISO(new Date(month.getFullYear(),month.getMonth()+1,0));$('monthList').innerHTML=upcomingHTML(visibleTeam().filter(r=>r.start_date<=end&&r.end_date>=start));$('approvalsList').innerHTML=requestsHTML(sorted(requests.filter(r=>r.status==='pending'&&r.user_id!==me.id)),true,true);}
function calendarHTML(base,mini){const y=base.getFullYear(),m=base.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0).getDate(),offset=(first.getDay()+6)%7;let html='<div class="calendar-grid">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="day-head">${d}</div>`).join('');let count=Math.ceil((offset+last)/7)*7;for(let i=0;i<count;i++){let n=i-offset+1,valid=n>0&&n<=last,d=new Date(y,m,n),s=dateISO(d),holiday=valid?window.DayoffHolidays.on(s):null,away=valid?new Set(visibleTeam().filter(r=>r.start_date<=s&&r.end_date>=s).map(r=>r.user_id)).size:0;html+=`<div class="cal-cell ${!valid?'muted':''} ${s===dateISO(today)&&valid?'today':''} ${away?'has-leave':''} ${holiday?'is-holiday '+(holiday.kind==='company'?'company-holiday':'public-holiday'):''}" title="${escape(holiday?holiday.name+' · '+(holiday.kind==='company'?'Company holiday':'Georgia public holiday'):away+' team member(s) away')}">${valid?n:''}${holiday?`<span class="holiday-dot" aria-label="Holiday"></span>`:''}${away?(mini?'<div class="cal-dots">'+Array.from({length:Math.min(away,3)},()=>'<i class="cal-dot"></i>').join('')+'</div>':`<span class="cal-count">${away} away</span>`):''}</div>`;}return html+'</div>'}
function upcomingHTML(source){const now=dateISO(today);let rows=(source||visibleTeam().filter(r=>r.end_date>=now)).sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,6);return rows.length?rows.map(r=>`<div class="upcoming-item">${personAvatar(nameOf(r.user_id))}<div><div class="person">${escape(nameOf(r.user_id))}</div><div class="date">${fmt(r.start_date)}${r.start_date!==r.end_date?' – '+fmt(r.end_date):''}</div></div><span class="type-pill type">${escape(r.leave_type)}</span></div>`).join(''):'<div class="empty"><strong>No upcoming days off</strong>Approved team leave will appear here.</div>'}
function requestsHTML(arr,actions,approval=false){if(!arr.length)return `<div class="empty"><strong>${approval?'All caught up!':'Nothing here yet'}</strong>${approval?'There are no requests awaiting your review.':'Your time-off requests will appear here.'}</div>`;return arr.map(r=>`<div class="request-row"><div><div class="request-title">${approval?escape(nameOf(r.user_id))+' · ':''}${escape(r.leave_type)} leave</div><div class="request-sub">${fmt(r.start_date)}${r.start_date!==r.end_date?' – '+fmt(r.end_date):''} · ${quantityText(r)}${approval&&r.note?' · '+escape(r.note):''}</div></div><span class="pill ${escape(r.status)}">${escape(r.status)}</span>${actions?(approval?`<div class="request-actions"><button class="accept" data-change="approved" data-id="${escape(r.id)}">Approve</button><button data-change="rejected" data-id="${escape(r.id)}">Reject</button></div>`:(r.status==='pending'||r.status==='approved')?`<div class="request-actions"><button data-change="cancelled" data-id="${escape(r.id)}">Cancel request</button></div>`:'<div></div>'):'<div></div>'}</div>`).join('')}
async function changeStatus(id,status){if(!confirm(`Are you sure you want to ${status==='cancelled'?'cancel':status} this request?`))return;try{if(cloud){const res=await db.rpc('change_leave_status',{request_id:id,new_status:status});if(res.error)throw res.error;await fetchCloud()}else{const r=requests.find(r=>r.id===id);if(!r)throw Error('Request not found');if(status==='cancelled'){if(r.user_id!==me.id||!['pending','approved'].includes(r.status))throw Error('You cannot cancel that request')}else{if(me.role!=='manager'||r.user_id===me.id||r.status!=='pending')throw Error('Not allowed')}r.status=status;demoSave()}render();toast('Request '+status+'.')}catch(e){toast('Could not update request: '+e.message)}}
async function submitRequest(e){e.preventDefault();const start=$('startDate').value,end=$('endDate').value,type=$('leaveType').value,portion=type==='Casual'?$('casualPortion').value:'full',note=$('leaveNote').value.trim();if(!start||!end||end<start){toast('Choose a valid date range.');return}const span=(localDate(end)-localDate(start))/86400000;if(span>366){toast('Maximum request length is 366 days.');return}if(portion==='half'&&start!==end){toast('Half-day casual leave must be requested for a single working date.');return}
if(type!=='Unpaid'&&!days(start,end)){toast('Choose a working day (weekends and Georgian holidays are excluded).');return}
if(!allowances.hasOwnProperty(type)){toast('Choose a valid leave type.');return}
if(requests.some(r=>r.user_id===me.id&&['pending','approved'].includes(r.status)&&r.start_date<=end&&r.end_date>=start)){
  toast('You already have an active request overlapping these dates.');return;
}
const candidate={user_id:me.id,leave_type:type,day_portion:portion,start_date:start,end_date:end};
for(const year of yearsCovered(start,end)){
  if(committed(me.id,type,year)+units(candidate,year)>allowances[type]){
    toast(`Not enough ${type.toLowerCase()} allowance for ${year}. Remaining: ${remaining(me.id,type,year)}.`);return;
  }
}let btn=$('submitRequest');btn.disabled=true;try{const row={user_id:me.id,leave_type:type,day_portion:portion,start_date:start,end_date:end,note,status:'pending'};if(cloud){const res=await db.from('leave_requests').insert(row);if(res.error)throw res.error;await fetchCloud()}else{requests.unshift({...row,id:'demo'+Date.now(),created_at:new Date().toISOString()});demoSave()}$('requestDialog').close();$('requestForm').reset();$('endDate').disabled=false;render();switchView('requests');toast('Your request has been submitted.')}catch(ex){toast('Could not submit: '+ex.message)}finally{btn.disabled=false}}
function openDialog(){if(!me){toast('Please sign in first.');return}$('startDate').value=dateISO(today);$('endDate').value=dateISO(today);updateDays();$('requestDialog').showModal()}
function updateDays(){const start=$('startDate').value,end=$('endDate').value,type=$('leaveType').value;
const casual=type==='Casual', half=casual&&$('casualPortion').value==='half';
$('casualPortionWrap').classList.toggle('hidden',!casual);
if(half&&start)$('endDate').value=start;
$('endDate').disabled=half;
const actualEnd=half?start:end;
const count=type==='Unpaid'?calendarDays(start,actualEnd):half?(days(start,actualEnd)?0.5:0):days(start,actualEnd);
$('dayCount').textContent=`${count} ${type==='Unpaid'?'calendar':'working'} day(s) selected${half?' · deducted from the same 5 paid casual days':''}${type==='Unpaid'?' · weekends and holidays included':' · weekends and Georgian holidays excluded'}`;
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$$('.new-request').forEach(b=>b.addEventListener('click',openDialog));
$('closeDialog').onclick=()=> $('requestDialog').close();$('cancelDialog').onclick=()=> $('requestDialog').close();$('requestForm').addEventListener('submit',submitRequest);
$('startDate').addEventListener('change',updateDays);$('endDate').addEventListener('change',updateDays);$('leaveType').addEventListener('change',updateDays);$('casualPortion').addEventListener('change',updateDays);
$('statusFilter').addEventListener('change',e=>{filter=e.target.value;renderPanels()});
$('prevMonth').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderPanels()};$('nextMonth').onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderPanels()};$('todayBtn').onclick=()=>{month=new Date(today.getFullYear(),today.getMonth(),1);switchView('calendar')};
$('demoRole').onchange=setDemoRole;
document.addEventListener('click',e=>{const b=e.target.closest('[data-change]');if(b)changeStatus(b.dataset.id,b.dataset.change)});
$('signOutBtn').onclick=async()=>{if(cloud&&db){await db.auth.signOut();toast('Signed out.')}else toast('In preview mode, use the role switcher below.')};
$('loginForm').onsubmit=async e=>{e.preventDefault();if(!db)return;const email=$('loginEmail').value.trim(),name=$('loginName').value.trim();const btn=$('loginForm').querySelector('button');btn.disabled=true;try{const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,data:name?{full_name:name}:{}}});if(error)throw error;$('loginHint').textContent='Check your inbox for a sign-in link. Open it in this browser.';toast('Sign-in email sent.')}catch(err){toast(err.message)}finally{btn.disabled=false}};
boot().catch(err=>toast(err.message));
})();
