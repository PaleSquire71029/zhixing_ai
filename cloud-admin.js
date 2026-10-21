(() => {
'use strict';
const API='https://api.zhixing.us.ci';
const TOKEN_KEY='zx-cloud-admin-token-v1', EXP_KEY='zx-cloud-admin-expiry-v1';
const $=id=>document.getElementById(id);
const state={token:'',view:'overview',overview:null,app:'zhixing-ai',page:1,pageSize:20,total:null,selected:new Set(),rows:[],users:[],activeConversation:null,messageOffset:0,messageTotal:null,userFilterId:'',audit:[]};
const appName=app=>app==='learning'?'学习版':'知行AI';
const fmtDate=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});};
const fmtNum=value=>value===null||value===undefined?'—':Number(value).toLocaleString('zh-CN');
const shortId=value=>value?value.slice(0,8)+'…'+value.slice(-5):'—';
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setStatus(id,message,type=''){const node=$(id);if(!node)return;node.textContent=message;node.className='status'+(type?' '+type:'');}
function toast(message){const node=$('toast');node.textContent=message;node.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.add('hidden'),2600);}
function setBusy(button,busy,label){if(!button)return;if(busy){button.dataset.label=button.textContent;button.disabled=true;if(label)button.textContent=label;}else{button.disabled=false;if(button.dataset.label){button.textContent=button.dataset.label;delete button.dataset.label;}}}
function setLoggedIn(on){$('loginView').classList.toggle('hidden',on);$('appView').classList.toggle('hidden',!on);}
function getToken(){const expiry=Number(sessionStorage.getItem(EXP_KEY)||0);if(expiry&&expiry<Date.now()){sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(EXP_KEY);}return sessionStorage.getItem(TOKEN_KEY)||'';}
async function api(path,options={}){const headers={'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(state.token?{'Authorization':'Bearer '+state.token}:{})};let response;try{response=await fetch(API+path,{...options,headers,cache:'no-store',credentials:'omit',redirect:'error'});}catch{throw new Error('无法连接管理 Worker，请检查网络后重试。');}const data=await response.json().catch(()=>({}));if(response.status===401&&path!=='/admin/cloud/login'){logout(false);throw new Error('管理会话已失效，请重新登录。');}if(!response.ok)throw new Error(data.error||'请求失败（HTTP '+response.status+'）');return data;}
function logout(show=true){state.token='';sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(EXP_KEY);setLoggedIn(false);if(show)setStatus('loginStatus','已退出管理会话。');}
async function login(event){event.preventDefault();const button=$('loginButton');setBusy(button,true,'验证中…');setStatus('loginStatus','正在验证管理员身份…');try{const data=await api('/admin/cloud/login',{method:'POST',body:JSON.stringify({password:$('password').value})});if(!data.token)throw new Error('Worker 未返回有效管理会话。');state.token=data.token;sessionStorage.setItem(TOKEN_KEY,data.token);sessionStorage.setItem(EXP_KEY,String(Date.now()+Math.min(Number(data.expiresIn)||7200000,7200000)));$('password').value='';setLoggedIn(true);setStatus('loginStatus','');await loadOverview();switchView('overview');}catch(error){setStatus('loginStatus',error.message,'error');}finally{setBusy(button,false);}}
function switchView(view){state.view=view;document.querySelectorAll('.navbtn').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));document.querySelectorAll('.section').forEach(section=>section.classList.toggle('active',section.id==='view-'+view));const titles={overview:['数据概览','了解云端会话、消息与清理状态。'],conversations:['会话记录','按产品检索、查看和管理云端文字对话。'],users:['用户列表','查看拥有云端会话的匿名用户标识。'],audit:['操作日志','查看最近的管理操作；日志不含聊天正文。']};$('pageTitle').textContent=titles[view][0];$('pageSubtitle').textContent=titles[view][1];if(view==='conversations'&&!state.rows.length)loadConversations();if(view==='users'&&!state.users.length)loadUsers();if(view==='audit'&&!state.audit.length)loadAudit();}
async function loadOverview(){const loading=$('overviewLoading');loading.classList.remove('hidden');try{const data=await api('/admin/cloud/overview');state.overview=data;renderOverview(data);}catch(error){toast(error.message);}finally{loading.classList.add('hidden');}}
function renderOverview(data){const stats=[
['云端会话',fmtNum(data.totals?.conversations),'两款产品合计','▤'],
['文字消息',fmtNum(data.totals?.messages),'仅统计已存文字消息','≋'],
['近期涉及用户',fmtNum(data.usersInRecentSample),'按最近会话样本统计','♙'],
['待清理会话',fmtNum(data.totals?.expired),'超过 90 天未活跃','⌁']];
$('overviewStats').innerHTML=stats.map(s=>'<article class="stat"><div class="stat-top"><span>'+s[0]+'</span><span class="staticon">'+s[3]+'</span></div><div class="statnum">'+s[1]+'</div><div class="statfoot">'+s[2]+'</div></article>').join('');
$('appStats').innerHTML=(data.apps||[]).map(app=>'<article class="appstat"><div class="appname"><span>'+esc(appName(app.app))+'</span><span class="tag '+(app.app==='learning'?'learning':'')+'">'+(app.app==='learning'?'学习产品':'主产品')+'</span></div><div class="appnums"><div><b>'+fmtNum(app.conversations)+'</b><span>会话</span></div><div><b>'+fmtNum(app.messages)+'</b><span>文字消息</span></div><div><b>'+fmtNum(app.expired)+'</b><span>待清理</span></div></div><div style="margin-top:13px"><button class="btn soft" data-open-app="'+esc(app.app)+'" type="button">管理此产品 ↗</button></div></article>').join('');
const expired=Number(data.totals?.expired||0);$('cleanupWarning').classList.toggle('hidden',!expired);$('cleanupText').textContent='当前检测到 '+fmtNum(expired)+' 条会话超过 90 天未活跃；删除后相关消息将级联删除。';
if(data.userSampleTruncated){$('overviewStats').children[2].querySelector('.statfoot').textContent='最近 1000 条会话中的去重用户数';}}
async function loadConversations(){const app=$('appFilter').value;state.app=app;state.userFilterId=state.userFilterId||'';state.selected.clear();updateBulkControls();$('conversationLoading').classList.remove('hidden');$('conversationList').innerHTML='';setStatus('listStatus','正在加载…');try{const params=new URLSearchParams({app,page:String(state.page),page_size:String(state.pageSize)});const q=$('searchInput').value.trim();if(q)params.set('q',q);if(state.userFilterId)params.set('user_id',state.userFilterId);const data=await api('/admin/cloud/conversations?'+params.toString());state.rows=data.conversations||[];state.total=data.total;renderConversations();setStatus('listStatus',state.total===null?'已加载 '+state.rows.length+' 条':'共 '+fmtNum(state.total)+' 条','ok');}catch(error){$('conversationList').innerHTML='<div class="empty">'+esc(error.message)+'</div>';setStatus('listStatus',error.message,'error');}finally{$('conversationLoading').classList.add('hidden');}}
function renderConversations(){const rows=state.rows;$('selectAll').checked=rows.length>0&&rows.every(r=>state.selected.has(r.id));$('conversationSub').textContent=appName(state.app)+' · 每页 '+state.pageSize+' 条；打开详情可查看完整文本。';$('pageInfo').textContent='第 '+state.page+' 页'+(state.total===null?'':' · 共 '+fmtNum(state.total)+' 条');$('prevPage').disabled=state.page<=1;$('nextPage').disabled=state.total!==null?state.page*state.pageSize>=state.total:rows.length<state.pageSize;
if(!rows.length){$('conversationList').innerHTML='<div class="empty"><span class="emptyicon">▤</span>没有找到会话<br>可以更换产品或搜索条件。</div>';return;}
$('conversationList').innerHTML=rows.map(row=>'<article class="record"><input class="check row-check" type="checkbox" data-select="'+esc(row.id)+'" aria-label="选择 '+esc(row.title)+'" '+(state.selected.has(row.id)?'checked':'')+'><div class="record-main"><div class="record-title">'+esc(row.title||'未命名对话')+'</div><div class="record-meta"><span class="tag '+(row.app_id==='learning'?'learning':'')+'">'+esc(appName(row.app_id))+'</span><span>'+fmtNum(row.message_count)+' 条消息</span><span>'+esc(fmtDate(row.last_activity_at))+'</span><span class="uid" title="'+esc(row.user_id)+'">用户 '+esc(shortId(row.user_id))+'</span></div><div class="record-meta"><span class="uid" title="'+esc(row.id)+'">会话 '+esc(shortId(row.id))+'</span></div></div><div class="record-actions"><button class="btn soft" data-open="'+esc(row.id)+'" type="button">查看</button><button class="btn danger" data-delete="'+esc(row.id)+'" type="button">删除</button></div></article>').join('');}
function updateBulkControls(){const count=state.selected.size;$('selectedCount').textContent=count;$('bulkDeleteButton').disabled=!count;}
async function loadUsers(){setStatus('userListStatus','正在查询会话索引…');$('userList').innerHTML='<div class="empty"><div class="loadingline"></div></div>';try{const params=new URLSearchParams({app:$('userAppFilter').value});const q=$('userSearch').value.trim();if(q)params.set('q',q);const data=await api('/admin/cloud/users?'+params.toString());state.users=data.users||[];$('userListStatus').textContent=data.note+' · 本次扫描 '+fmtNum(data.scannedSessions)+' 条会话。';renderUsers();if(data.truncated)$('userListStatus').textContent+=' 列表已达到扫描上限，可输入完整 UUID 精确定位。';}catch(error){$('userList').innerHTML='<div class="empty">'+esc(error.message)+'</div>';setStatus('userListStatus',error.message,'error');}}
function renderUsers(){if(!state.users.length){$('userList').innerHTML='<div class="empty"><span class="emptyicon">♙</span>没有匹配的用户</div>';return;}$('userList').innerHTML=state.users.map(user=>'<article class="userrow"><div><div class="user-id">'+esc(user.user_id)+'</div><div class="user-detail">会话 '+fmtNum(user.conversation_count)+' 条 · 产品 '+user.apps.map(appName).map(esc).join('、')+'<br>最近活动 '+esc(fmtDate(user.last_activity_at))+'</div></div><div class="user-actions"><button class="btn soft" data-user-conversations="'+esc(user.user_id)+'" data-user-app="'+esc(user.apps[0]||'zhixing-ai')+'" type="button">查看会话</button><button class="btn danger" data-delete-user="'+esc(user.user_id)+'" type="button">清除聊天数据</button></div></article>').join('');}
const auditActionLabel={
  delete_conversation:"删除单条会话",
  delete_selected:"批量删除会话",
  delete_user_data:"清除用户聊天数据",
  cleanup_90d:"清理 90 天过期数据"
};
async function loadAudit(){
  $('auditStatus').textContent='正在读取操作日志…';
  $('auditList').innerHTML='<div class="empty"><div class="loadingline"></div></div>';
  try{
    const data=await api('/admin/cloud/audit');
    state.audit=data.entries||[];
    renderAudit();
    $('auditStatus').textContent='最近 '+state.audit.length+' 条记录 · 日志仅保存操作元数据，不包含聊天正文。';
  }catch(error){
    $('auditList').innerHTML='<div class="empty">'+esc(error.message)+'</div>';
    $('auditStatus').textContent=error.message;
  }
}
function renderAudit(){
  if(!state.audit.length){
    $('auditList').innerHTML='<div class="empty"><span class="emptyicon">◷</span>还没有管理操作记录<br>删除会话或执行清理后，日志会显示在这里。</div>';
    return;
  }
  $('auditList').innerHTML=state.audit.map(entry=>{
    const appLabel=entry.app==='all'?'全部产品':appName(entry.app);
    return '<article class="audit-row"><div class="audit-icon">◷</div><div><div class="audit-title">'+esc(auditActionLabel[entry.action]||'管理操作')+'</div><div class="audit-meta">'+esc(appLabel)+' · '+esc(fmtDate(entry.at))+'<br>记录编号 '+esc(shortId(entry.id))+'</div></div><div class="audit-count">'+fmtNum(entry.affectedCount)+'<span style="display:block;font-size:9px;font-weight:500;color:var(--muted);text-align:right;margin-top:3px">条会话</span></div></article>';
  }).join('');
}
async function openConversation(id){const row=state.rows.find(item=>item.id===id);if(!row)return;state.activeConversation=row;state.messageOffset=0;state.messageTotal=null;$('detailBackdrop').classList.remove('hidden');$('detailTitle').textContent=row.title||'未命名对话';$('detailMeta').textContent=appName(row.app_id)+' · 用户 '+row.user_id+' · '+fmtDate(row.last_activity_at);$('messageList').innerHTML='';$('detailStatus').textContent='正在加载消息…';$('olderMessages').disabled=true;await loadMessages(true);}
async function loadMessages(reset=false){const row=state.activeConversation;if(!row)return;const offset=reset?0:state.messageOffset;try{const params=new URLSearchParams({app:row.app_id,conversation_id:row.id,offset:String(offset)});const data=await api('/admin/cloud/messages?'+params.toString());state.messageTotal=data.total;if(reset)$('messageList').innerHTML='';const msgs=data.messages||[];for(const message of msgs){const role=message.role==='user'?'用户':message.role==='assistant'?'助手':'系统';const article=document.createElement('article');article.className='message '+(message.role==='user'?'user':message.role==='assistant'?'assistant':'system');const top=document.createElement('div');top.className='message-top';const who=document.createElement('span');who.className='message-role';who.textContent=role;const when=document.createElement('span');when.textContent=fmtDate(message.created_at);const body=document.createElement('div');body.className='message-content';body.textContent=message.content||'';top.append(who,when);article.append(top,body);$('messageList').append(article);}state.messageOffset=offset+msgs.length;$('detailStatus').textContent='已显示 '+fmtNum(state.messageOffset)+(state.messageTotal===null?'':' / '+fmtNum(state.messageTotal))+' 条消息。';$('olderMessages').disabled=!msgs.length||(state.messageTotal!==null&&state.messageOffset>=state.messageTotal);$('olderMessages').textContent=state.messageTotal!==null&&state.messageOffset>=state.messageTotal?'已加载全部消息':'加载更多消息';}catch(error){$('detailStatus').textContent=error.message;$('olderMessages').disabled=true;}}
function closeDetail(){$('detailBackdrop').classList.add('hidden');state.activeConversation=null;}
async function deleteConversation(id){const row=state.rows.find(item=>item.id===id);if(!row)return;if(!confirm('确定永久删除这条云端会话及其全部文字消息吗？此操作不可撤销。'))return;try{const data=await api('/admin/cloud/conversations/delete',{method:'POST',body:JSON.stringify({app:row.app_id,ids:[id],confirm:'DELETE_SELECTED'})});state.selected.delete(id);closeDetail();toast('已删除 '+data.deleted+' 条会话');await Promise.all([loadOverview(),loadConversations()]);}catch(error){toast(error.message);}}
async function bulkDelete(){const ids=[...state.selected];if(!ids.length)return;if(!confirm('即将永久删除当前产品中选中的 '+ids.length+' 条会话及全部消息。继续吗？'))return;try{const data=await api('/admin/cloud/conversations/delete',{method:'POST',body:JSON.stringify({app:state.app,ids,confirm:'DELETE_SELECTED'})});state.selected.clear();updateBulkControls();toast('已删除 '+data.deleted+' 条会话');await Promise.all([loadOverview(),loadConversations()]);}catch(error){toast(error.message);}}
async function deleteUser(userId){if(!confirm('清除用户 '+userId+' 在两个产品中的全部云端聊天记录？这不会删除 Supabase 登录账号，但会永久删除该用户的全部会话与消息。'))return;try{const data=await api('/admin/cloud/users/delete',{method:'POST',body:JSON.stringify({user_id:userId,confirm:'DELETE_USER_DATA'})});toast('已清除 '+data.deleted+' 条会话');await Promise.all([loadOverview(),loadUsers()]);}catch(error){toast(error.message);}}
async function cleanupExpired(){const count=Number(state.overview?.totals?.expired||0);if(!count)return;if(!confirm('将清理超过 90 天未活跃的会话及其消息。检测到约 '+count+' 条会话，确定执行？'))return;const button=$('cleanupButton');setBusy(button,true,'清理中…');try{const data=await api('/admin/cloud/cleanup',{method:'POST',body:JSON.stringify({confirm:'CLEANUP_90D'})});toast('清理完成：删除 '+data.deletedConversations+' 条过期会话');await loadOverview();}catch(error){toast(error.message);}finally{setBusy(button,false);}}
function applyUserFilter(id,app){state.userFilterId=id;$('searchInput').value='';$('appFilter').value=app;state.page=1;state.selected.clear();switchView('conversations');loadConversations();}
function refreshCurrent(){if(state.view==='overview')return loadOverview();if(state.view==='conversations')return loadConversations();if(state.view==='users')return loadUsers();return loadAudit();}
document.querySelectorAll('.navbtn').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.go)));
$('loginForm').addEventListener('submit',login);$('logoutButton').addEventListener('click',()=>logout());$('refreshButton').addEventListener('click',refreshCurrent);
$('searchButton').addEventListener('click',()=>{state.page=1;state.userFilterId='';state.selected.clear();loadConversations();});
$('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){$('searchButton').click();}});
$('appFilter').addEventListener('change',()=>{state.page=1;state.userFilterId='';state.selected.clear();loadConversations();});
$('prevPage').addEventListener('click',()=>{if(state.page>1){state.page--;loadConversations();}});
$('nextPage').addEventListener('click',()=>{state.page++;loadConversations();});
$('selectAll').addEventListener('change',e=>{state.rows.forEach(row=>e.target.checked?state.selected.add(row.id):state.selected.delete(row.id));updateBulkControls();document.querySelectorAll('[data-select]').forEach(c=>c.checked=e.target.checked);});
$('bulkDeleteButton').addEventListener('click',bulkDelete);$('clearSelectionButton').addEventListener('click',()=>{state.selected.clear();updateBulkControls();renderConversations();});
$('loadUsersButton').addEventListener('click',loadUsers);$('loadAuditButton').addEventListener('click',loadAudit);$('userSearchButton').addEventListener('click',loadUsers);$('userSearch').addEventListener('keydown',e=>{if(e.key==='Enter')loadUsers();});$('userAppFilter').addEventListener('change',loadUsers);
$('cleanupButton').addEventListener('click',cleanupExpired);$('closeDetail').addEventListener('click',closeDetail);$('detailBackdrop').addEventListener('click',e=>{if(e.target===$('detailBackdrop'))closeDetail();});$('olderMessages').addEventListener('click',()=>loadMessages(false));$('deleteCurrent').addEventListener('click',()=>state.activeConversation&&deleteConversation(state.activeConversation.id));
document.addEventListener('click',e=>{const target=e.target.closest('[data-open-app],[data-open],[data-delete],[data-select],[data-user-conversations],[data-delete-user]');if(!target)return;
if(target.dataset.openApp){$('appFilter').value=target.dataset.openApp;state.page=1;state.userFilterId='';switchView('conversations');loadConversations();return;}
if(target.dataset.open){openConversation(target.dataset.open);return;}
if(target.dataset.delete){deleteConversation(target.dataset.delete);return;}
if(target.dataset.select){const id=target.dataset.select;if(target.checked)state.selected.add(id);else state.selected.delete(id);updateBulkControls();$('selectAll').checked=state.rows.length>0&&state.rows.every(r=>state.selected.has(r.id));return;}
if(target.dataset.userConversations){applyUserFilter(target.dataset.userConversations,target.dataset.userApp);return;}
if(target.dataset.deleteUser){deleteUser(target.dataset.deleteUser);return;}
});
function boot(){state.token=getToken();if(state.token){setLoggedIn(true);loadOverview();}else setLoggedIn(false);}
boot();
})();