(function(){
"use strict";
if(window.top!==window.self){try{window.top.location=window.location.href}catch(e){document.documentElement.textContent="";return}}
var $=function(id){return document.getElementById(id)},WORKER="https://api.zhixing.us.ci",TOKEN_KEY="zx-ai-admin-token-";
var APPS=[{id:"zhixing-ai",name:"知行AI"},{id:"learning",name:"学习产品"}],cache={"zhixing-ai":null,"learning":null},tokens={"zhixing-ai":"","learning":"","cloud":"","user":""},activeApp="zhixing-ai",activeView="overview",page=1,pageSize=25,expanded={},toastTimer=0;
var userRefreshToken="",userExpiry=0,userProfile=null;
try{tokens.user=sessionStorage.getItem(TOKEN_KEY+"user")||"";userRefreshToken=sessionStorage.getItem("zx-ai-user-refresh-token")||"";userExpiry=Number(sessionStorage.getItem("zx-ai-user-expiry")||0)}catch(e){}
var cloudState={overview:null,tab:"overview",page:1,pageSize:20,total:null,app:"zhixing-ai",rows:[],selected:new Set(),users:[],accounts:[],accountPage:1,accountHasMore:false,audit:[],activeRow:null,messageOffset:0,messageTotal:null};
APPS.forEach(function(app){try{tokens[app.id]=sessionStorage.getItem(TOKEN_KEY+app.id)||""}catch(e){}});
try{tokens.cloud=sessionStorage.getItem(TOKEN_KEY+"cloud")||""}catch(e){}
function setToken(app,token){tokens[app]=token;try{if(token)sessionStorage.setItem(TOKEN_KEY+app,token);else sessionStorage.removeItem(TOKEN_KEY+app)}catch(e){}}
function note(id,msg,type){var e=$(id);if(!e)return;e.textContent=msg||"";e.className="notice"+(msg?" show "+(type||"info"):"")}
function toast(msg){var e=$("toast");e.textContent=msg;e.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){e.classList.remove("show")},2300)}
function busy(e,on,label){if(!e)return;if(on){e.dataset.oldText=e.textContent;e.disabled=true;if(label)e.textContent=label}else{e.disabled=false;if(e.dataset.oldText){e.textContent=e.dataset.oldText;delete e.dataset.oldText}}}
function appName(id){var app=APPS.find(function(a){return a.id===id});return app?app.name:id}
function endpoint(path,app){if((app==="cloud"&&path.indexOf("/admin/cloud/")===0)||(app==="user"&&path.indexOf("/api/account/")===0))return WORKER+path;return WORKER+path+(path.indexOf("?")>=0?"&":"?")+"app="+encodeURIComponent(app)}
async function api(app,path,opt){opt=opt||{};var headers=new Headers(opt.headers||{}),init={method:opt.method||"GET",headers:headers,cache:"no-store"};if(opt.body!==undefined){headers.set("Content-Type","application/json");init.body=JSON.stringify(opt.body)}if(!opt.noAuth&&tokens[app])headers.set("Authorization","Bearer "+tokens[app]);var ctrl=new AbortController(),tm=setTimeout(function(){ctrl.abort()},opt.timeout||18000);init.signal=ctrl.signal;var res,data={};try{res=await fetch(endpoint(path,app),init);var txt=await res.text();try{data=txt?JSON.parse(txt):{}}catch(e){data={error:"Worker 返回无法解析的响应"}}}catch(e){throw new Error(e.name==="AbortError"?"请求超时，请检查 Worker、网络或服务商状态。":"无法连接 Worker："+(e.message||"网络错误"))}finally{clearTimeout(tm)}if(res.status===401&&!opt.noAuth&&!(app==="user"&&path==="/api/account/password")){setToken(app,"");headerState();throw new Error("「"+appName(app)+"」会话已失效，请重新登录。")}if(!res.ok)throw new Error(data.error||("请求失败（HTTP "+res.status+"）"));return data}
async function health(app){try{return {ok:true,data:await api(app,"/health",{noAuth:true,timeout:10000})}}catch(e){return {ok:false,error:e.message}}}
function headerState(){var n=APPS.filter(function(a){return !!tokens[a.id]}).length,e=$("headerState");e.textContent=n===2&&tokens.cloud?"全部模块已登录":n===2?"请重新登录":"未登录";e.className="status-chip "+(n===2&&tokens.cloud?"good":n?"warn":"");$("logoutTop").hidden=!n&&!tokens.cloud}
function clearUserSession(){setToken("user","");userRefreshToken="";userExpiry=0;userProfile=null;try{sessionStorage.removeItem("zx-ai-user-refresh-token");sessionStorage.removeItem("zx-ai-user-expiry")}catch(e){}}
function clearAdminSession(){APPS.forEach(function(a){setToken(a.id,"")});setToken("cloud","");cache={"zhixing-ai":null,"learning":null};cloudState={overview:null,tab:"overview",page:1,pageSize:20,total:null,app:"zhixing-ai",rows:[],selected:new Set(),users:[],accounts:[],accountPage:1,accountHasMore:false,audit:[],activeRow:null,messageOffset:0,messageTotal:null}}
function logoutAll(){clearAdminSession();clearUserSession();cache={"zhixing-ai":null,"learning":null};$("password").value="";$("app").hidden=true;$("userPortal").hidden=true;$("login").hidden=false;note("loginNotice","已退出全部管理模块。","ok");headerState()}
async function login(ev){
 ev.preventDefault();var password=$("password").value,btn=$("loginBtn");busy(btn,true,"正在验证…");note("loginNotice","");
 try{
  var result=await api("learning","/admin/login/all",{method:"POST",noAuth:true,timeout:12000,body:{password:password}});
  if(!result.tokens||!result.tokens["zhixing-ai"]||!result.tokens.learning||!result.tokens.cloud)throw new Error("后端没有返回完整的统一管理会话，请确认 Worker 已部署最新版本。");
  clearUserSession();
  APPS.forEach(function(app){setToken(app.id,result.tokens[app.id])});setToken("cloud",result.tokens.cloud);
  $("userPortal").hidden=true;$("password").value="";headerState();$("login").hidden=true;$("app").hidden=false;
  await Promise.all(APPS.map(function(app){return loadScope(app.id)}));
  activateApp("zhixing-ai");var initialView=new URLSearchParams(location.search).get("view")==="cloud"?"cloud":"overview";activateView(initialView);toast("统一管理登录成功");
 }catch(error){
  APPS.forEach(function(app){setToken(app.id,"")});setToken("cloud","");
  $("password").value="";headerState();
  note("loginNotice",error.message||"登录失败，请检查 Worker 配置。","bad");
 }finally{busy(btn,false)}
}
function normalizePrompts(s,d){var p=s&&s.prompts||{};d=d||{};return {chat:Object.assign({},d.chat||{},p.chat||{}),analysisBase:typeof p.analysisBase==="string"?p.analysisBase:d.analysisBase||"",analysisModes:Object.assign({},d.analysisModes||{},p.analysisModes||{}),analysisActions:Object.assign({},d.analysisActions||{},p.analysisActions||{})}}
async function loadScope(id){var st=cache[id]||{settings:null,defaults:null,health:null,models:[]};cache[id]=st;st.health=await health(id);if(!tokens[id]){renderAll();return}var pair=await Promise.allSettled([api(id,"/admin/settings"),api(id,"/admin/defaults")]);st.settingsError="";if(pair[0].status==="fulfilled")st.settings=pair[0].value;else st.settingsError=pair[0].reason.message;if(pair[1].status==="fulfilled")st.defaults=pair[1].value;else st.defaultsError=pair[1].reason.message;if(st.settings)st.settings.prompts=normalizePrompts(st.settings,st.defaults);renderAll()}
function current(){return cache[activeApp]||{}}
function settings(){return current().settings||{apiBaseUrl:"https://api.a6api.com/v1",model:"",temperature:.2,maxTokens:0,hasApiKey:false,apiKeySource:"missing",prompts:normalizePrompts({},current().defaults),stats:{recent:[]}}}
function activateApp(id){activeApp=id;page=1;expanded={};document.querySelectorAll("[data-app]").forEach(function(b){b.classList.toggle("active",b.dataset.app===id)});fillConfig(true);fillChoices();renderAll()}
function activateView(view){activeView=view;document.querySelectorAll("[data-view]").forEach(function(b){b.classList.toggle("active",b.dataset.view===view)});document.querySelectorAll("[data-panel]").forEach(function(p){p.classList.toggle("active",p.dataset.panel===view)});if(view==="records")renderLogs();if(view==="prompts")fillChoices();if(view==="cloud"&&tokens.cloud){cloudTab(cloudState.tab||"overview")}window.scrollTo({top:0,behavior:"smooth"})}
function setLoginMode(mode){
 document.querySelectorAll("[data-login-mode]").forEach(function(b){b.classList.toggle("active",b.dataset.loginMode===mode)});
 $("adminLoginPanel").hidden=mode!=="admin";$("userLoginPanel").hidden=mode!=="user";
 if(mode==="admin")$("password").focus();else $("userLoginEmail").focus();
}
function userSaveSession(data){
 setToken("user",data.accessToken||"");userRefreshToken=String(data.refreshToken||"");
 userExpiry=Date.now()+Math.max(60,Number(data.expiresIn)||3600)*1000;
 try{if(userRefreshToken)sessionStorage.setItem("zx-ai-user-refresh-token",userRefreshToken);sessionStorage.setItem("zx-ai-user-expiry",String(userExpiry))}catch(e){}
}
function userLocation(reg){
 reg=reg||{};var country=cloudCountry(reg.countryCode||reg.country),parts=[reg.city,reg.region,country].filter(function(v){return typeof v==="string"&&v.trim()});
 return parts.join(" · ")||"未能定位";
}
function renderUserProfile(user){
 userProfile=user||{};var reg=userProfile.registration||{};
 $("userProfileEmail").textContent=userProfile.email||"—";
 $("userProfileCreated").textContent=time(userProfile.createdAt);
 $("userProfileIp").textContent=reg.ip||"未记录";
 $("userProfileLocation").textContent=userLocation(reg);$("userProfileSource").textContent=reg.source==="admin-created"?"管理员创建":reg.source||"未记录";
 $("userProfileId").textContent=userProfile.id||"—";
 $("userVerified").textContent=userProfile.emailConfirmedAt?"邮箱已确认":"邮箱未确认";
 $("userVerified").className="status-chip "+(userProfile.emailConfirmedAt?"good":"warn");
}
function enterUserPortal(user){
 $("login").hidden=true;$("app").hidden=true;$("userPortal").hidden=false;
 renderUserProfile(user);note("userProfileNotice","");headerState();
}
function userRequest(path,opt){
 opt=opt||{};
 return api("user",path,opt).catch(async function(error){
  if(path==="/api/account/refresh"||!userRefreshToken||!/(会话已失效|登录已失效)/.test(error.message||""))throw error;
  try{
   var rotated=await api("user","/api/account/refresh",{method:"POST",noAuth:true,timeout:12000,body:{refreshToken:userRefreshToken}});
   userSaveSession(rotated);if(rotated.user)renderUserProfile(rotated.user);
   return await api("user",path,opt);
  }catch(refreshError){
   clearUserSession();$("userPortal").hidden=true;$("app").hidden=true;$("login").hidden=false;setLoginMode("user");
   note("userLoginNotice","登录已过期，请重新登录。","warn");throw refreshError;
  }
 });
}
async function userLogin(ev){
 ev.preventDefault();var btn=$("userLoginButton");busy(btn,true,"正在登录…");note("userLoginNotice","");
 try{
  var data=await api("user","/api/account/login",{method:"POST",noAuth:true,timeout:15000,body:{email:$("userLoginEmail").value.trim(),password:$("userLoginPassword").value}});
  if(!data.accessToken||!data.refreshToken||!data.user||!data.user.id)throw new Error("登录服务未返回完整会话。");
  clearAdminSession();userSaveSession(data);$("userLoginPassword").value="";
  enterUserPortal(data.user);
  var profile=await userRequest("/api/account/me");
  renderUserProfile(profile.user);
 }catch(error){clearUserSession();$("userPortal").hidden=true;$("app").hidden=true;$("login").hidden=false;setLoginMode("user");note("userLoginNotice",error.message||"登录失败，请检查邮箱和密码。","bad");}
 finally{busy(btn,false)}
}
async function userLogout(){
 try{if(tokens.user)await userRequest("/api/account/logout",{method:"POST",body:{}})}catch(e){}
 clearUserSession();$("userPortal").hidden=true;$("login").hidden=false;$("app").hidden=true;setLoginMode("user");
 note("userLoginNotice","已退出登录。","ok");headerState();
}
async function changeOwnPassword(ev){
 ev.preventDefault();
 var current=$("userCurrentPassword").value,next=$("userNewPassword").value,confirmNext=$("userConfirmPassword").value,btn=$("userPasswordButton");
 if(next.length<8||next.length>128){note("userPasswordNotice","新密码需要 8–128 个字符。","bad");return}
 if(next!==confirmNext){note("userPasswordNotice","两次输入的新密码不一致。","bad");return}
 if(current===next){note("userPasswordNotice","新密码不能与当前密码相同。","bad");return}
 if(!confirm("确认修改当前账号密码？修改后请使用新密码登录。"))return;
 busy(btn,true,"正在更新…");note("userPasswordNotice","");
 try{
  await userRequest("/api/account/password",{method:"POST",body:{currentPassword:current,newPassword:next}});
  $("userCurrentPassword").value="";$("userNewPassword").value="";$("userConfirmPassword").value="";
  note("userPasswordNotice","密码已更新。","ok");toast("密码修改成功");
 }catch(error){note("userPasswordNotice",error.message||"密码更新失败。","bad")}
 finally{busy(btn,false)}
}
var cloudActionLabels={delete_conversation:"删除单条会话",delete_selected:"批量删除会话",delete_user_data:"清除用户聊天数据",cleanup_90d:"清理 90 天过期数据",create_account:"创建用户账号"};
function cloudEsc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function cloudNum(value){return value===null||value===undefined?"—":Number(value).toLocaleString("zh-CN")}
function cloudCountry(code){
 code=String(code||"").trim();if(!/^[A-Za-z]{2}$/.test(code))return code||"";
 try{return new Intl.DisplayNames(["zh-CN"],{type:"region"}).of(code.toUpperCase())||code.toUpperCase()}catch(e){return code.toUpperCase()}
}
function cloudLocationText(value){
 var parts=String(value||"").split(",").map(function(x){return x.trim()}).filter(Boolean);
 if(parts.length&&/^[A-Za-z]{2}$/.test(parts[parts.length-1]))parts[parts.length-1]=cloudCountry(parts[parts.length-1]);
 return parts.join(" · ")||"未知归属地";
}
function cloudTime(value){if(!value)return"—";var d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}
async function cloudApi(path,opt){return api("cloud",path,opt)}
function cloudTab(tab){
 cloudState.tab=tab;
 document.querySelectorAll("[data-cloud-tab]").forEach(function(b){b.classList.toggle("active",b.dataset.cloudTab===tab)});
 document.querySelectorAll(".cloud-pane").forEach(function(p){p.classList.toggle("active",p.id==="cloudPane-"+tab)});
 if(!tokens.cloud){note("cloudOverviewNotice","请退出并重新登录，以获取云端管理权限。","bad");return}
 if(tab==="overview"&&!cloudState.overview)loadCloudOverview();
 if(tab==="conversations"&&!cloudState.rows.length)loadCloudConversations();
 if(tab==="accounts"&&!cloudState.accounts.length)loadCloudAccounts();
 if(tab==="users"&&!cloudState.users.length)loadCloudUsers();
 if(tab==="audit"&&!cloudState.audit.length)loadCloudAudit();
}
async function loadCloudOverview(){
 note("cloudOverviewNotice","正在加载云端统计…");
 try{var data=await cloudApi("/admin/cloud/overview");cloudState.overview=data;
 $("cloudStatConversations").textContent=cloudNum(data.totals&&data.totals.conversations);
 $("cloudStatMessages").textContent=cloudNum(data.totals&&data.totals.messages);
 $("cloudStatUsers").textContent=cloudNum(data.usersInRecentSample);
 $("cloudStatExpired").textContent=cloudNum(data.totals&&data.totals.expired);
 $("cloudAppStats").innerHTML=(data.apps||[]).map(function(app){return '<article class="cloud-appstat"><div class="cloud-appname"><span>'+cloudEsc(app.app==="learning"?"学习版":"知行AI")+'</span><span class="badge">'+(app.app==="learning"?"学习产品":"主产品")+'</span></div><div class="cloud-appnums"><div><strong>'+cloudNum(app.conversations)+'</strong><span>会话</span></div><div><strong>'+cloudNum(app.messages)+'</strong><span>消息</span></div><div><strong>'+cloudNum(app.expired)+'</strong><span>待清理</span></div></div><div class="actions" style="margin-top:12px"><button type="button" class="btn small" data-cloud-open-app="'+cloudEsc(app.app)+'">管理此产品</button></div></article>'}).join("");
 var expired=Number(data.totals&&data.totals.expired||0);$("cloudCleanupWarning").classList.toggle("hidden",!expired);$("cloudCleanupText").textContent="当前有 "+cloudNum(expired)+" 条会话超过 90 天未活跃；清理会同时删除关联消息。";
 note("cloudOverviewNotice","云端统计已更新。","ok");
 }catch(e){note("cloudOverviewNotice",e.message,"bad")}
}
async function loadCloudConversations(){
 var app=$("cloudConversationApp").value;cloudState.app=app;cloudState.selected.clear();cloudUpdateSelected();
 $("cloudConversationList").innerHTML='<div class="empty-state">正在加载会话…</div>';note("cloudConversationNotice","");
 try{var params=new URLSearchParams({app:app,page:String(cloudState.page),page_size:String(cloudState.pageSize)}),q=$("cloudConversationSearch").value.trim(),userFilter=$("cloudConversationSearch").dataset.userId||"";if(q)params.set("q",q);if(userFilter)params.set("user_id",userFilter);
 var data=await cloudApi("/admin/cloud/conversations?"+params.toString());cloudState.rows=data.conversations||[];cloudState.total=data.total;cloudRenderConversations();$("cloudConversationStatus").textContent=data.total===null?"已加载 "+cloudState.rows.length+" 条":"共 "+cloudNum(data.total)+" 条会话";note("cloudConversationNotice","");
 }catch(e){$("cloudConversationList").innerHTML='<div class="empty-state">'+cloudEsc(e.message)+'</div>';note("cloudConversationNotice",e.message,"bad")}
}
function cloudRenderConversations(){
 var rows=cloudState.rows;$("cloudPageInfo").textContent="第 "+cloudState.page+" 页"+(cloudState.total===null?"":" · 共 "+cloudNum(cloudState.total)+" 条");
 $("cloudPrevPage").disabled=cloudState.page<=1;$("cloudNextPage").disabled=cloudState.total!==null?cloudState.page*cloudState.pageSize>=cloudState.total:rows.length<cloudState.pageSize;
 $("cloudSelectAll").checked=rows.length>0&&rows.every(function(r){return cloudState.selected.has(r.id)});
 if(!rows.length){$("cloudConversationList").innerHTML='<div class="empty-state">没有匹配的会话。可以切换产品或修改搜索条件。</div>';return}
 $("cloudConversationList").innerHTML=rows.map(function(row){return '<article class="cloud-record"><input type="checkbox" data-cloud-select="'+cloudEsc(row.id)+'" aria-label="选择会话" '+(cloudState.selected.has(row.id)?"checked":"")+'><div class="cloud-record-main"><div class="cloud-record-title">'+cloudEsc(row.title||"未命名对话")+'</div><div class="cloud-record-meta"><span>'+cloudEsc(row.app_id==="learning"?"学习版":"知行AI")+'</span><span>'+cloudNum(row.message_count)+' 条消息</span><span>'+cloudEsc(cloudTime(row.last_activity_at))+'</span><span class="cloud-userid" title="'+cloudEsc(row.user_id)+'">用户 '+cloudEsc(row.user_id?row.user_id.slice(0,8)+"…"+row.user_id.slice(-5):"—")+'</span></div><div class="cloud-record-meta"><span class="cloud-userid" title="'+cloudEsc(row.id)+'">会话 '+cloudEsc(row.id?row.id.slice(0,8)+"…"+row.id.slice(-5):"—")+'</span></div></div><div class="cloud-record-actions"><button class="btn small" type="button" data-cloud-open="'+cloudEsc(row.id)+'">查看</button><button class="btn small danger" type="button" data-cloud-delete="'+cloudEsc(row.id)+'">删除</button></div></article>'}).join("");
}
function cloudUpdateSelected(){$("cloudSelectedCount").textContent=cloudState.selected.size;$("cloudBulkDelete").disabled=!cloudState.selected.size}
async function cloudDelete(ids,app){
 if(!ids.length)return;if(!confirm("即将永久删除 "+ids.length+" 条"+(app==="learning"?"学习版":"知行AI")+"会话及其所有文字消息。此操作不可撤销，继续吗？"))return;
 try{var data=await cloudApi("/admin/cloud/conversations/delete",{method:"POST",body:{app:app,ids:ids,confirm:"DELETE_SELECTED"}});cloudState.selected.clear();cloudUpdateSelected();if(cloudState.activeRow&&ids.indexOf(cloudState.activeRow.id)>=0)cloudCloseDetail();toast("已删除 "+cloudNum(data.deleted)+" 条会话");await Promise.all([loadCloudOverview(),loadCloudConversations(),loadCloudAudit()])}
 catch(e){note("cloudConversationNotice",e.message,"bad")}
}
async function cloudOpenConversation(id){
 var row=cloudState.rows.find(function(x){return x.id===id});if(!row)return;cloudState.activeRow=row;cloudState.messageOffset=0;cloudState.messageTotal=null;
 $("cloudDetailTitle").textContent=row.title||"未命名对话";$("cloudDetailMeta").textContent=(row.app_id==="learning"?"学习版":"知行AI")+" · 用户 "+row.user_id+" · "+cloudTime(row.last_activity_at);$("cloudMessageList").replaceChildren();$("cloudDetail").classList.remove("hidden");await cloudLoadMessages(true)
}
async function cloudLoadMessages(reset){
 var row=cloudState.activeRow;if(!row)return;var offset=reset?0:cloudState.messageOffset;note("cloudDetailStatus","正在读取消息…");
 try{var params=new URLSearchParams({app:row.app_id,conversation_id:row.id,offset:String(offset)}),data=await cloudApi("/admin/cloud/messages?"+params.toString());cloudState.messageTotal=data.total;if(reset)$("cloudMessageList").replaceChildren();
 (data.messages||[]).forEach(function(m){var card=document.createElement("article");card.className="cloud-message "+(m.role==="user"?"user":"");var top=document.createElement("div");top.className="cloud-message-top";var role=document.createElement("strong");role.textContent=m.role==="user"?"用户":m.role==="assistant"?"助手":"系统";var stamp=document.createElement("span");stamp.textContent=cloudTime(m.created_at);var body=document.createElement("div");body.className="cloud-message-body";body.textContent=m.content||"";top.append(role,stamp);card.append(top,body);$("cloudMessageList").append(card)});
 cloudState.messageOffset=offset+(data.messages||[]).length;note("cloudDetailStatus","已显示 "+cloudNum(cloudState.messageOffset)+(cloudState.messageTotal===null?"":" / "+cloudNum(cloudState.messageTotal))+" 条消息。","ok");$("cloudMoreMessages").disabled=!(data.messages||[]).length||(cloudState.messageTotal!==null&&cloudState.messageOffset>=cloudState.messageTotal)
 }catch(e){note("cloudDetailStatus",e.message,"bad");$("cloudMoreMessages").disabled=true}
}
function cloudCloseDetail(){$("cloudDetail").classList.add("hidden");cloudState.activeRow=null}
async function loadCloudUsers(){
 $("cloudUserList").innerHTML='<div class="empty-state">正在加载聊天用户…</div>';note("cloudUserNotice","");
 try{var params=new URLSearchParams({app:$("cloudUserApp").value}),q=$("cloudUserSearch").value.trim();if(q)params.set("q",q);
 var data=await cloudApi("/admin/cloud/users?"+params.toString());cloudState.users=data.users||[];$("cloudUserStatus").textContent=(data.note||"已加载用户")+" · 扫描 "+cloudNum(data.scannedSessions)+" 条会话。";cloudRenderUsers();if(data.truncated)$("cloudUserStatus").textContent+=" 已达扫描上限，可输入完整 UUID 精确定位。"
 }catch(e){$("cloudUserList").innerHTML='<div class="empty-state">'+cloudEsc(e.message)+'</div>';note("cloudUserNotice",e.message,"bad")}
}
function cloudRenderUsers(){
 if(!cloudState.users.length){$("cloudUserList").innerHTML='<div class="empty-state">没有匹配的聊天用户。</div>';return}
 $("cloudUserList").innerHTML=cloudState.users.map(function(user){return '<article class="cloud-account-card"><div class="cloud-account-top"><div class="cloud-account-email cloud-userid">'+cloudEsc(user.user_id)+'</div><span class="cloud-account-state">'+cloudNum(user.conversation_count)+' 条会话</span></div><div class="cloud-account-meta">产品：'+cloudEsc((user.apps||[]).map(function(a){return a==="learning"?"学习版":"知行AI"}).join("、"))+'<br>最近活动：'+cloudEsc(cloudTime(user.last_activity_at))+'</div><div class="actions" style="margin-top:10px"><button class="btn small" data-cloud-user-open="'+cloudEsc(user.user_id)+'" data-cloud-user-app="'+cloudEsc((user.apps||[])[0]||"zhixing-ai")+'" type="button">查看会话</button><button class="btn small danger" data-cloud-user-delete="'+cloudEsc(user.user_id)+'" type="button">清除聊天数据</button></div></article>'}).join("")
}
async function cloudDeleteUser(userId){
 if(!confirm("确定清除用户 "+userId+" 在两个产品中的全部云端会话及消息？不会删除 Supabase 登录账号，操作不可撤销。"))return;
 try{var data=await cloudApi("/admin/cloud/users/delete",{method:"POST",body:{user_id:userId,confirm:"DELETE_USER_DATA"}});toast("已清除 "+cloudNum(data.deleted)+" 条会话");await Promise.all([loadCloudOverview(),loadCloudUsers(),loadCloudAudit()])}
 catch(e){note("cloudUserNotice",e.message,"bad")}
}
async function loadCloudAccounts(){
 $("cloudAccountList").innerHTML='<div class="empty-state">正在加载账号目录…</div>';
 try{var params=new URLSearchParams({page:String(cloudState.accountPage),per_page:"20"}),data=await cloudApi("/admin/cloud/accounts?"+params.toString());cloudState.accounts=data.users||[];cloudState.accountHasMore=!!data.hasMore;cloudRenderAccounts();$("cloudAccountPageInfo").textContent="第 "+cloudState.accountPage+" 页";$("cloudAccountPageLabel").textContent="第 "+cloudState.accountPage+" 页";$("cloudAccountPrev").disabled=cloudState.accountPage<=1;$("cloudAccountNext").disabled=!cloudState.accountHasMore}
 catch(e){$("cloudAccountList").innerHTML='<div class="empty-state">'+cloudEsc(e.message)+'</div>';note("cloudCreateAccountNotice",e.message,"bad")}
}
function cloudRenderAccounts(){
 var q=$("cloudAccountSearch").value.trim().toLowerCase(),rows=cloudState.accounts.filter(function(user){return !q||String(user.email||"").toLowerCase().includes(q)});
 if(!rows.length){$("cloudAccountList").innerHTML='<div class="empty-state">'+(q?"当前页没有匹配邮箱。":"暂无账号，或该页没有记录。")+'</div>';return}
 $("cloudAccountList").innerHTML=rows.map(function(user){var confirmed=!!user.email_confirmed_at,reg=user.registration||{},loc=[reg.city,reg.region,cloudCountry(reg.countryCode||reg.country)].filter(Boolean).join(" · ")||"未知归属地";return '<article class="cloud-account-card"><div class="cloud-account-top"><div class="cloud-account-email">'+cloudEsc(user.email||"无邮箱")+'</div><span class="cloud-account-state '+(confirmed?"":"pending")+'">'+(confirmed?"邮箱已确认":"未确认")+'</span></div><div class="cloud-account-meta">用户 ID：<span class="cloud-userid">'+cloudEsc(user.id)+'</span><br>创建时间：'+cloudEsc(cloudTime(user.created_at))+'<br>最近登录：'+cloudEsc(cloudTime(user.last_sign_in_at))+'<br>注册 IP：'+cloudEsc(reg.ip||"未记录")+'<br>IP 归属地：'+cloudEsc(loc)+'<br>记录来源：'+cloudEsc(reg.source==="admin-created"?"管理员创建":reg.source||"未记录")+'</div></article>'}).join("")
}
async function cloudCreateAccount(ev){
 ev.preventDefault();var email=$("cloudAccountEmail").value.trim().toLowerCase(),password=$("cloudAccountPassword").value,confirmed=$("cloudEmailOwnershipConfirmed").checked,btn=$("cloudCreateAccountButton");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){note("cloudCreateAccountNotice","请填写有效邮箱。","bad");return}
 if(password.length<8||password.length>128){note("cloudCreateAccountNotice","初始密码需要 8–128 个字符。","bad");return}
 if(!confirmed){note("cloudCreateAccountNotice","请先核验邮箱归属并勾选确认。","bad");return}
 if(!confirm("将为 "+email+" 创建 Supabase 登录账号，并把邮箱标记为已确认。请确保你已核验该邮箱归属。继续吗？"))return;
 busy(btn,true,"创建中…");note("cloudCreateAccountNotice","正在安全创建账号…");
 try{var data=await cloudApi("/admin/cloud/accounts",{method:"POST",body:{email:email,password:password,emailOwnershipConfirmed:confirmed}});
 $("cloudAccountPassword").value="";$("cloudEmailOwnershipConfirmed").checked=false;$("cloudAccountSearch").value="";cloudState.accountPage=1;note("cloudCreateAccountNotice",data.registrationSaved===false?"账号已创建，但注册 IP 记录未保存；请检查 Worker 存储后再核对。":"账号创建成功："+(data.user&&data.user.email||email)+"。初始密码不会保存到后台。","ok");toast("账号创建成功");await Promise.all([loadCloudAccounts(),loadCloudAudit(),loadCloudOverview()])
 }catch(e){note("cloudCreateAccountNotice",e.message,"bad")}
 finally{busy(btn,false)}
}
async function loadCloudAudit(){
 $("cloudAuditList").innerHTML='<div class="empty-state">正在加载操作日志…</div>';
 try{var data=await cloudApi("/admin/cloud/audit");cloudState.audit=data.entries||[];cloudRenderAudit();$("cloudAuditStatus").textContent="最近 "+cloudState.audit.length+" 条操作记录；不保存聊天正文、账号密码。"}
 catch(e){$("cloudAuditList").innerHTML='<div class="empty-state">'+cloudEsc(e.message)+'</div>';$("cloudAuditStatus").textContent=e.message}
}
function cloudRenderAudit(){
 if(!cloudState.audit.length){$("cloudAuditList").innerHTML='<div class="empty-state">还没有管理操作记录。</div>';return}
 $("cloudAuditList").innerHTML=cloudState.audit.map(function(row){var title=cloudActionLabels[row.action]||"管理操作",app=row.app==="all"?"全部产品":row.app==="learning"?"学习版":"知行AI";return '<article class="cloud-audit-row"><div class="cloud-audit-icon">◷</div><div><div class="cloud-audit-title">'+cloudEsc(title)+'</div><div class="cloud-audit-meta">'+cloudEsc(app)+' · '+cloudEsc(cloudTime(row.at))+'<br>记录 '+cloudEsc(row.id?row.id.slice(0,8)+"…":"—")+'</div></div><div class="cloud-audit-count">'+cloudNum(row.affectedCount)+'<span style="display:block;font-size:9px;color:#8994a6;font-weight:500;text-align:right">条记录</span></div></article>'}).join("")
}
async function cloudCleanupExpired(){
 var count=Number(cloudState.overview&&cloudState.overview.totals&&cloudState.overview.totals.expired||0);if(!count)return;
 if(!confirm("将清理超过 90 天未活跃的会话及关联消息，当前约 "+count+" 条。此操作不可撤销，继续吗？"))return;
 var btn=$("cloudCleanupButton");busy(btn,true,"清理中…");
 try{var result=await cloudApi("/admin/cloud/cleanup",{method:"POST",body:{confirm:"CLEANUP_90D"}});toast("清理完成，删除 "+cloudNum(result.deletedConversations)+" 条会话");await Promise.all([loadCloudOverview(),loadCloudAudit(),loadCloudConversations()])}
 catch(e){note("cloudOverviewNotice",e.message,"bad")}finally{busy(btn,false)}
}
function cloudRefresh(){if(cloudState.tab==="overview")return loadCloudOverview();if(cloudState.tab==="conversations")return loadCloudConversations();if(cloudState.tab==="accounts")return loadCloudAccounts();if(cloudState.tab==="users")return loadCloudUsers();return loadCloudAudit()}
function cloudFilterUser(userId,app){$("cloudConversationSearch").value="";$("cloudConversationApp").value=app;cloudState.page=1;$("cloudConversationSearch").dataset.userId=userId;cloudTab("conversations");loadCloudConversations()}
function fmt(v){return (Number(v)||0).toLocaleString("zh-CN")}
function time(v){if(!v)return"—";var d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString()}
function maskIP(ip){ip=String(ip||"unknown");if(ip==="unknown")return"未知";if(ip.indexOf(":")>=0)return ip.split(":").slice(0,2).join(":")+":…";var p=ip.split(".");return p.length===4?p[0]+"."+p[1]+".***.***":ip.slice(0,9)+"…"}
function dot(id,text,kind){var e=$(id);e.textContent=text;e.className="dotstatus"+(kind?" "+kind:"")}
function renderAll(){overview();profiles();fillConfig(false);if(activeView==="records")renderLogs();if(activeView==="prompts")fillChoices();}
function overview(){var s=settings(),st=s.stats||{},rows=Array.isArray(st.recent)?st.recent:[],c=current();$("mTotal").textContent=fmt(st.totalRequests);$("mFailed").textContent=fmt(st.failedRequests);$("mTokens").textContent=fmt(st.totalTokens);$("mRecords").textContent=fmt(rows.length);var n=Number(st.totalRequests)||0,f=Number(st.failedRequests)||0;$("mFailRate").textContent=n?(f/n*100).toFixed(1)+"% 失败率":"暂无请求";var h=c.health;if(h&&h.ok){dot("healthConfigured",h.data.configured?"已配置":"未配置",h.data.configured?"good":"bad");$("healthConfiguredText").textContent=h.data.configured?"读取到地址、密钥与模型":"缺少 API 地址、密钥或模型"}else{dot("healthConfigured","不可达","bad");$("healthConfiguredText").textContent=h?h.error:"尚未检查"}dot("healthModels",c.models&&c.models.length?"可用 "+c.models.length+" 个":c.modelError?"检测失败":"待检测",c.models&&c.models.length?"good":c.modelError?"bad":"warn");$("healthModelsText").textContent=c.modelError||((c.models&&c.models.length)?"上游模型列表接口有响应":"检测连接可验证 /models 接口");dot("healthChat",c.chatTest?"成功":c.chatError?"失败":"待测试",c.chatTest?"good":c.chatError?"bad":"warn");$("healthChatText").textContent=c.chatTest?"真实对话请求已成功":c.chatError||"请发送一次真实测试请求";dot("healthKey",s.hasApiKey?"已配置":"未配置",s.hasApiKey?"good":"bad");$("healthKeyText").textContent=s.apiKeySource==="custom"?"本产品独立密钥":s.apiKeySource==="worker"?"Worker 环境密钥":"请配置 API Token";$("lastCheck").textContent=h&&h.ok?"最近检查 "+new Date().toLocaleTimeString():"等待检测";var good=rows.filter(function(r){return r.ok}).length;$("rSuccess").textContent=fmt(good);$("rErrors").textContent=fmt(rows.length-good);$("rUsage").textContent=fmt(rows.filter(function(r){return r.usageAvailable}).length);$("rLatest").textContent=rows.length?time(rows[0].at):"暂无"}
function profiles(){var host=$("profileStates");host.replaceChildren();APPS.forEach(function(a){var row=document.createElement("div");row.className="keyline";var left=document.createElement("div"),strong=document.createElement("strong"),small=document.createElement("small"),badge=document.createElement("span"),s=cache[a.id]&&cache[a.id].settings;strong.textContent=a.name;small.textContent=tokens[a.id]?(s?"配置已读取":"已登录，配置未读取"):"未登录";left.append(strong,small);badge.className="dotstatus "+(tokens[a.id]&&s?"good":"warn");badge.textContent=tokens[a.id]&&s?"独立管理":"未就绪";row.append(left,badge);host.append(row)})}
function fillConfig(force){var s=settings();if(!force&&["apiBase","apiKey","modelName","temperature","maxTokens"].includes(document.activeElement.id))return;$("apiBase").value=s.apiBaseUrl||"https://api.a6api.com/v1";$("apiKey").value="";$("apiKey").type="password";$("modelName").value=s.model||"";$("temperature").value=s.temperature===undefined?.2:s.temperature;$("maxTokens").value=s.maxTokens||0;$("keyHint").textContent=s.hasApiKey?"密钥已保存（"+(s.apiKeySource==="custom"?"产品独立密钥":"Worker 环境密钥")+"）。留空会保留。":"尚未配置密钥。";$("modelHint").textContent=s.model?"当前模型："+s.model:"还未设置模型"}
function gather(){var s=settings();return {apiBaseUrl:$("apiBase").value.trim(),model:$("modelName").value.trim(),temperature:Number($("temperature").value),maxTokens:Number($("maxTokens").value),prompts:s.prompts||normalizePrompts({},current().defaults),apiKey:$("apiKey").value.trim()}}
async function saveConfig(btn){var b=gather();if(!tokens[activeApp]){note("configNotice","当前产品尚未登录。","bad");return}if(!b.apiBaseUrl||!b.model){note("configNotice","请填写 API 根地址和模型 ID。","warn");return}if(!Number.isFinite(b.temperature)||b.temperature<0||b.temperature>2||!Number.isInteger(b.maxTokens)||b.maxTokens<0||b.maxTokens>32768){note("configNotice","请检查 Temperature（0–2）与输出 Token（0–32768）。","warn");return}busy(btn,true,"保存中…");try{var d=await api(activeApp,"/admin/settings",{method:"PUT",body:b});current().settings=d.settings;current().settings.prompts=normalizePrompts(d.settings,current().defaults);$("apiKey").value="";note("configNotice","已保存。密钥不回显，留空会保留现有密钥。","ok");toast(appName(activeApp)+"配置已保存");renderAll()}catch(e){note("configNotice",e.message,"bad")}finally{busy(btn,false)}}
async function getModels(btn){var b=gather();if(!b.apiBaseUrl){note("configNotice","请先填写 API 根地址。","warn");return}busy(btn,true,"获取中…");try{var d=await api(activeApp,"/admin/models",{method:"POST",body:{apiBaseUrl:b.apiBaseUrl,apiKey:b.apiKey}}),arr=Array.isArray(d.models)?d.models:[],list=$("modelOptions");list.replaceChildren();arr.forEach(function(id){var o=document.createElement("option");o.value=id;list.append(o)});current().models=arr;current().modelError="";if(arr.length&&!$("modelName").value)$("modelName").value=d.defaultModel||arr[0];$("modelHint").textContent="已获取 "+arr.length+" 个模型，点击输入框可搜索。";note("configNotice","上游模型列表响应正常，共 "+arr.length+" 个模型。","ok");renderAll()}catch(e){current().modelError=e.message;note("configNotice",e.message,"bad");renderAll()}finally{busy(btn,false)}}
async function checkAll(btn){busy(btn,true,"检测中…");note("overviewNotice","正在检查 Worker 配置并连接上游模型列表…","info");try{var h=await health(activeApp);current().health=h;if(!h.ok)throw new Error(h.error);if(!h.data.configured)throw new Error("Worker 可达，但当前产品尚未配置完整。");await getModels(null);if(current().modelError)throw new Error(current().modelError);note("overviewNotice","Worker 与上游 /models 接口均有响应。还需实际发送测试请求来确认对话权限。","ok")}catch(e){note("overviewNotice",e.message,"bad")}finally{busy(btn,false);renderAll()}}
async function testChat(btn){var model=$("modelName").value.trim()||settings().model,prompt=$("testPrompt").value.trim()||"请只回复：连接正常";if(!model){note("testNotice","请先设置模型 ID。","warn");return}busy(btn,true,"请求中…");$("testResult").textContent="正在等待模型响应…";note("testNotice","请求已发出，可能产生少量模型费用。","info");current().chatTest=false;current().chatError="";try{var d=await api(activeApp,"/api/chat",{method:"POST",noAuth:true,timeout:90000,body:{app:activeApp,mode:"general",model:model,messages:[{role:"user",content:prompt}]}});$("testResult").textContent=typeof d.answer==="string"?d.answer:JSON.stringify(d,null,2);current().chatTest=true;current().chatError="";note("testNotice","真实模型请求成功。","ok");await loadScope(activeApp);toast("模型请求成功")}catch(e){current().chatError=e.message;$("testResult").textContent=e.message;note("testNotice",e.message,"bad")}finally{busy(btn,false);renderAll()}}
async function revealKey(btn){if(!confirm("密钥会在当前页面显示。请确认周围无人查看。"))return;busy(btn,true,"读取中…");try{var d=await api(activeApp,"/admin/key/reveal",{method:"POST",body:{confirm:"REVEAL_KEY"}});$("apiKey").value=d.apiKey||"";$("apiKey").type="text";note("configNotice","密钥已显示。使用后请清空输入框。","warn");setTimeout(function(){if(document.activeElement!==$("apiKey")){$("apiKey").type="password";$("apiKey").value=""}},15000)}catch(e){note("configNotice",e.message,"bad")}finally{busy(btn,false)}}
function promptEntries(){var p=settings().prompts||{},out=[];Object.keys(p.chat||{}).forEach(function(k){out.push({value:"chat:"+k,label:"聊天 · "+k})});out.push({value:"analysisBase",label:"分析 · 总提示词"});Object.keys(p.analysisModes||{}).forEach(function(k){out.push({value:"analysisModes:"+k,label:"分析题型 · "+k})});Object.keys(p.analysisActions||{}).forEach(function(k){out.push({value:"analysisActions:"+k,label:"分析动作 · "+k})});return out}
function promptValue(key){var p=settings().prompts||{},a=key.split(":");return a.length===1?(typeof p[key]==="string"?p[key]:""):(p[a[0]]&&p[a[0]][a[1]]||"")}
function setPrompt(key,value){var st=current();if(!st.settings)st.settings=settings();var p=st.settings.prompts||normalizePrompts({},st.defaults),a=key.split(":");if(a.length===1)p[key]=value;else{p[a[0]]=p[a[0]]||{};p[a[0]][a[1]]=value}st.settings.prompts=p}
function fillChoices(){var sel=$("promptChoice"),old=sel.value;sel.replaceChildren();var arr=promptEntries();arr.forEach(function(x){var o=document.createElement("option");o.value=x.value;o.textContent=x.label;sel.append(o)});if(arr.some(function(x){return x.value===old}))sel.value=old;else if(arr.length)sel.value=arr[0].value;if(document.activeElement!==$("promptText"))$("promptText").value=promptValue(sel.value);$("promptCounter").textContent=Array.from($("promptText").value).length+" 字"}
async function savePrompt(btn){setPrompt($("promptChoice").value,$("promptText").value);var b=gather();b.model=b.model||settings().model;b.apiBaseUrl=b.apiBaseUrl||settings().apiBaseUrl;busy(btn,true,"保存中…");try{var d=await api(activeApp,"/admin/settings",{method:"PUT",body:b});current().settings=d.settings;current().settings.prompts=normalizePrompts(d.settings,current().defaults);note("promptNotice","提示词已保存到"+appName(activeApp)+"，另一产品不受影响。","ok");toast("提示词已保存");renderAll();fillChoices()}catch(e){note("promptNotice",e.message,"bad")}finally{busy(btn,false)}}
function revertPrompt(){if(!confirm("将编辑框恢复为 Worker 默认提示词？保存后才会覆盖配置。"))return;var k=$("promptChoice").value,d=current().defaults||{},a=k.split(":"),v=a.length===1?(d[k]||""):(d[a[0]]&&d[a[0]][a[1]]||"");$("promptText").value=v;$("promptCounter").textContent=Array.from(v).length+" 字"}
function renderLogs(){var host=$("recordList");if(!host)return;host.replaceChildren();var rows=(settings().stats||{}).recent||[],q=$("recordSearch").value.trim().toLowerCase(),f=$("recordFilter").value;rows=rows.filter(function(r){if(f==="ok"&&!r.ok)return false;if(f==="fail"&&r.ok)return false;return !q||[r.model,r.mode,r.status,r.ip,r.location,r.timezone,r.origin,r.userAgent].join(" ").toLowerCase().indexOf(q)>=0});var pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages);rows.slice((page-1)*pageSize,page*pageSize).forEach(function(r,i){var id=String(r.at||"")+"-"+((page-1)*pageSize+i),card=document.createElement("article");card.className="logcard";var top=document.createElement("div");top.className="logtop";var left=document.createElement("div"),title=document.createElement("div"),date=document.createElement("div"),badge=document.createElement("span");title.className="logtitle";title.textContent=(r.model||"未知模型")+" · "+(r.mode||"未知任务");date.className="logdate";date.textContent=time(r.at);left.append(title,date);badge.className="badge"+(r.ok?"":" fail");badge.textContent=(r.ok?"成功":"失败")+" · "+(r.status||"—");top.append(left,badge);card.append(top);var meta=document.createElement("div");meta.className="logmeta";var ip=document.createElement("span");ip.textContent="IP "+maskIP(r.ip)+" · "+cloudLocationText(r.location);var tk=document.createElement("span");tk.textContent="Token "+fmt(r.totalTokens)+(r.usageAvailable?"":"（无 usage）");var ms=document.createElement("span");ms.textContent=(Number(r.durationMs)||0)+" ms";var bt=document.createElement("button");bt.type="button";bt.textContent=expanded[id]?"收起详情":"查看 IP 与详情";bt.addEventListener("click",function(){expanded[id]=!expanded[id];renderLogs()});meta.append(ip,tk,ms,bt);card.append(meta);if(expanded[id]){var details=document.createElement("div");details.className="logdetails";[["完整 IP",r.ip||"unknown"],["IP 归属地",cloudLocationText(r.location)],["时区",r.timezone||"未知"],["来源",r.origin||"未知"],["浏览器标识",r.userAgent||"未知"],["输入 Token",fmt(r.promptTokens)],["输出 Token",fmt(r.completionTokens)],["总 Token",fmt(r.totalTokens)],["耗时",(Number(r.durationMs)||0)+" ms"]].forEach(function(p){var line=document.createElement("div");line.textContent=p[0]+"："+p[1];details.append(line)});card.append(details)}host.append(card)});if(!host.children.length){var empty=document.createElement("div");empty.className="inner";empty.textContent="没有匹配的请求记录。";host.append(empty)}$("pageLabel").textContent="第 "+page+" / "+pages+" 页 · "+rows.length+" 条";$("prevPage").disabled=page<=1;$("nextPage").disabled=page>=pages}
function csvEscape(v){return '"'+String(v===undefined||v===null?"":v).replace(/"/g,'""')+'"'}
function download(name,text,type){var u=URL.createObjectURL(new Blob([text],{type:type||"application/json;charset=utf-8"})),a=document.createElement("a");a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},1000)}
function exportRecords(){var rows=(settings().stats||{}).recent||[],head=["时间","产品","成功","HTTP状态","模型","任务","IP","归属地","时区","来源","User-Agent","输入Token","输出Token","总Token","耗时ms"],csv=[head].concat(rows.map(function(r){return [r.at,appName(activeApp),r.ok?"是":"否",r.status,r.model,r.mode,r.ip,r.location,r.timezone,r.origin,r.userAgent,r.promptTokens,r.completionTokens,r.totalTokens,r.durationMs]})).map(function(a){return a.map(csvEscape).join(",")}).join("\r\n");download(activeApp+"-requests.csv","\ufeff"+csv,"text/csv;charset=utf-8");toast("请求记录已导出")}
function exportConfig(id){var s=cache[id]&&cache[id].settings;if(!s)throw new Error("未读取"+appName(id)+"配置");download(id+"-config-backup.json",JSON.stringify({app:id,apiBaseUrl:s.apiBaseUrl,model:s.model,temperature:s.temperature,maxTokens:s.maxTokens,prompts:s.prompts,exportedAt:new Date().toISOString(),note:"不含 API Key 与管理令牌"},null,2))}
function exportAll(){var profiles={};APPS.forEach(function(a){var s=cache[a.id]&&cache[a.id].settings;if(s)profiles[a.id]={apiBaseUrl:s.apiBaseUrl,model:s.model,temperature:s.temperature,maxTokens:s.maxTokens,prompts:s.prompts,hasApiKey:s.hasApiKey}});download("zhixing-ai-config-summary.json",JSON.stringify({exportedAt:new Date().toISOString(),profiles:profiles},null,2));note("securityNotice","已导出配置摘要，不包含 API Key、管理令牌或完整 IP。","ok")}
async function importConfig(ev){var f=ev.target.files&&ev.target.files[0];ev.target.value="";if(!f)return;try{var d=JSON.parse(await f.text());if(d.app&&d.app!==activeApp)throw new Error("备份属于"+appName(d.app)+"，请先切换产品");if(d.apiBaseUrl)$("apiBase").value=d.apiBaseUrl;if(d.model)$("modelName").value=d.model;if(d.temperature!==undefined)$("temperature").value=d.temperature;if(d.maxTokens!==undefined)$("maxTokens").value=d.maxTokens;if(d.prompts&&current().settings)current().settings.prompts=d.prompts;note("configNotice","备份已导入编辑表单。确认后点击保存；密钥不会从备份导入。","ok");fillChoices()}catch(e){note("configNotice","导入失败："+e.message,"bad")}}
function money(v){var n=Number(v);return Number.isFinite(n)?"$"+n.toFixed(4):"—"}
async function balanceCheck(btn){busy(btn,true,"查询中…");note("balanceNotice","正在查询 A6API 额度接口…","info");try{var s=settings(),d=await api(activeApp,"/admin/balance",{method:"POST",body:{apiBaseUrl:$("apiBase").value.trim()||s.apiBaseUrl,apiKey:$("apiKey").value.trim()}}),items=$("balanceView").children;if(d.unlimited){items[0].querySelector("strong").textContent="不限额";items[1].querySelector("strong").textContent="—";items[2].querySelector("strong").textContent="不限额";items[2].querySelector("small").textContent=d.name||"无限额度"}else{items[0].querySelector("strong").textContent=money(d.availableUsd);items[1].querySelector("strong").textContent=money(d.usedUsd);items[2].querySelector("strong").textContent=fmt(d.totalAvailable);items[0].querySelector("small").textContent="可用金额";items[1].querySelector("small").textContent="已用金额";items[2].querySelector("small").textContent="剩余计费单位"}note("balanceNotice","额度查询成功。"+(d.expiresAt?" 到期："+new Date(d.expiresAt*1000).toLocaleString():""),"ok")}catch(e){note("balanceNotice",e.message,"bad")}finally{busy(btn,false)}}
async function resetStats(btn){if(!confirm("确定清空"+appName(activeApp)+"的统计与最近请求记录？不可撤销。"))return;busy(btn,true,"清空中…");try{await api(activeApp,"/admin/stats/reset",{method:"POST",body:{confirm:"RESET_STATS"}});await loadScope(activeApp);note("recordsNotice","当前产品记录已清空。","ok")}catch(e){note("recordsNotice",e.message,"bad")}finally{busy(btn,false)}}
async function refreshScope(btn){busy(btn,true,"刷新中…");try{await loadScope(activeApp);toast("当前产品已刷新")}catch(e){note("securityNotice",e.message,"bad")}finally{busy(btn,false)}}
document.addEventListener("DOMContentLoaded",function(){
 $("loginForm").addEventListener("submit",login);$("logoutTop").addEventListener("click",logoutAll);$("logoutAll").addEventListener("click",logoutAll);
 document.querySelectorAll("[data-login-mode]").forEach(function(b){b.addEventListener("click",function(){setLoginMode(b.dataset.loginMode)})});
 $("userLoginForm").addEventListener("submit",userLogin);$("userLogout").addEventListener("click",userLogout);
 $("userPasswordForm").addEventListener("submit",changeOwnPassword);
 $("userPasswordClear").addEventListener("click",function(){$("userCurrentPassword").value="";$("userNewPassword").value="";$("userConfirmPassword").value="";note("userPasswordNotice","")});
 document.querySelectorAll("[data-app]").forEach(function(b){b.addEventListener("click",function(){activateApp(b.dataset.app)})});document.querySelectorAll("[data-view]").forEach(function(b){b.addEventListener("click",function(){activateView(b.dataset.view)})});document.querySelectorAll("[data-go]").forEach(function(b){b.addEventListener("click",function(){activateView(b.dataset.go)})});
 $("checkAll").addEventListener("click",function(){checkAll($("checkAll"))});$("fetchModels").addEventListener("click",function(){getModels($("fetchModels"))});$("saveSettings").addEventListener("click",function(){saveConfig($("saveSettings"))});$("testChat").addEventListener("click",function(){testChat($("testChat"))});$("revealKey").addEventListener("click",function(){revealKey($("revealKey"))});$("balanceBtn").addEventListener("click",function(){balanceCheck($("balanceBtn"))});
 $("promptChoice").addEventListener("change",function(){$("promptText").value=promptValue($("promptChoice").value);$("promptCounter").textContent=Array.from($("promptText").value).length+" 字"});$("promptText").addEventListener("input",function(){$("promptCounter").textContent=Array.from(this.value).length+" 字"});$("savePrompt").addEventListener("click",function(){savePrompt($("savePrompt"))});$("revertPrompt").addEventListener("click",revertPrompt);
 $("recordSearch").addEventListener("input",function(){page=1;renderLogs()});$("recordFilter").addEventListener("change",function(){page=1;renderLogs()});$("prevPage").addEventListener("click",function(){page=Math.max(1,page-1);renderLogs()});$("nextPage").addEventListener("click",function(){page++;renderLogs()});$("exportRecords").addEventListener("click",exportRecords);$("reloadRecords").addEventListener("click",function(){refreshScope($("reloadRecords"))});$("resetRecords").addEventListener("click",function(){resetStats($("resetRecords"))});
 $("exportOne").addEventListener("click",function(){try{exportConfig(activeApp)}catch(e){note("configNotice",e.message,"bad")}});$("exportAll").addEventListener("click",exportAll);$("importFile").addEventListener("change",importConfig);$("refreshCurrent").addEventListener("click",function(){refreshScope($("refreshCurrent"))});
 $("apiBase").value="https://api.a6api.com/v1";
 document.querySelectorAll("[data-cloud-tab]").forEach(function(b){b.addEventListener("click",function(){cloudTab(b.dataset.cloudTab)})});
 $("cloudRefreshAll").addEventListener("click",cloudRefresh);
 $("cloudConversationSearchBtn").addEventListener("click",function(){cloudState.page=1;cloudState.selected.clear();delete $("cloudConversationSearch").dataset.userId;loadCloudConversations()});
 $("cloudConversationSearch").addEventListener("keydown",function(e){if(e.key==="Enter")$("cloudConversationSearchBtn").click()});
 $("cloudConversationApp").addEventListener("change",function(){cloudState.page=1;delete $("cloudConversationSearch").dataset.userId;loadCloudConversations()});
 $("cloudPrevPage").addEventListener("click",function(){if(cloudState.page>1){cloudState.page--;loadCloudConversations()}});
 $("cloudNextPage").addEventListener("click",function(){cloudState.page++;loadCloudConversations()});
 $("cloudSelectAll").addEventListener("change",function(e){cloudState.rows.forEach(function(row){if(e.target.checked)cloudState.selected.add(row.id);else cloudState.selected.delete(row.id)});cloudUpdateSelected();cloudRenderConversations()});
 $("cloudBulkDelete").addEventListener("click",function(){cloudDelete(Array.from(cloudState.selected),cloudState.app)});
 $("cloudCleanupButton").addEventListener("click",cloudCleanupExpired);
 $("cloudCreateAccountForm").addEventListener("submit",cloudCreateAccount);
 $("cloudResetAccountForm").addEventListener("click",function(){$("cloudAccountEmail").value="";$("cloudAccountPassword").value="";$("cloudEmailOwnershipConfirmed").checked=false;note("cloudCreateAccountNotice","")});
 $("cloudLoadAccounts").addEventListener("click",loadCloudAccounts);
 $("cloudAccountSearch").addEventListener("input",cloudRenderAccounts);
 $("cloudAccountPrev").addEventListener("click",function(){if(cloudState.accountPage>1){cloudState.accountPage--;loadCloudAccounts()}});
 $("cloudAccountNext").addEventListener("click",function(){if(cloudState.accountHasMore){cloudState.accountPage++;loadCloudAccounts()}});
 $("cloudUserSearchBtn").addEventListener("click",loadCloudUsers);
 $("cloudUserSearch").addEventListener("keydown",function(e){if(e.key==="Enter")loadCloudUsers()});
 $("cloudUserApp").addEventListener("change",loadCloudUsers);
 $("cloudLoadAudit").addEventListener("click",loadCloudAudit);
 $("cloudCloseDetail").addEventListener("click",cloudCloseDetail);
 $("cloudDetail").addEventListener("click",function(e){if(e.target===$("cloudDetail"))cloudCloseDetail()});
 $("cloudMoreMessages").addEventListener("click",function(){cloudLoadMessages(false)});
 $("cloudDeleteCurrent").addEventListener("click",function(){if(cloudState.activeRow)cloudDelete([cloudState.activeRow.id],cloudState.activeRow.app_id)});
 document.addEventListener("click",function(e){
  var t=e.target.closest("[data-cloud-open-app],[data-cloud-open],[data-cloud-delete],[data-cloud-open-user],[data-cloud-delete-user]");
  if(!t)return;
  if(t.dataset.cloudOpenApp){$("cloudConversationApp").value=t.dataset.cloudOpenApp;cloudState.page=1;delete $("cloudConversationSearch").dataset.userId;cloudTab("conversations");loadCloudConversations();return}
  if(t.dataset.cloudOpen){cloudOpenConversation(t.dataset.cloudOpen);return}
  if(t.dataset.cloudDelete){var row=cloudState.rows.find(function(x){return x.id===t.dataset.cloudDelete});if(row)cloudDelete([row.id],row.app_id);return}
  if(t.dataset.cloudOpenUser){cloudFilterUser(t.dataset.cloudOpenUser,t.dataset.cloudUserApp||"zhixing-ai");return}
  if(t.dataset.cloudDeleteUser){cloudDeleteUser(t.dataset.cloudDeleteUser);return}
 });
 document.addEventListener("change",function(e){var t=e.target.closest("[data-cloud-select]");if(!t)return;if(t.checked)cloudState.selected.add(t.dataset.cloudSelect);else cloudState.selected.delete(t.dataset.cloudSelect);cloudUpdateSelected();$("cloudSelectAll").checked=cloudState.rows.length>0&&cloudState.rows.every(function(row){return cloudState.selected.has(row.id)})});
 var logged=APPS.filter(function(a){return !!tokens[a.id]});
 if(tokens.user){
  clearAdminSession();$("login").hidden=true;$("app").hidden=true;$("userPortal").hidden=false;
  userRequest("/api/account/me").then(function(data){renderUserProfile(data.user);enterUserPortal(data.user)}).catch(function(error){clearUserSession();$("userPortal").hidden=true;$("login").hidden=false;setLoginMode("user");note("userLoginNotice",error.message||"登录已过期，请重新登录。","warn")});
 }else if(logged.length===2&&tokens.cloud){$("login").hidden=true;$("userPortal").hidden=true;$("app").hidden=false;headerState();Promise.all(APPS.map(function(a){return loadScope(a.id)})).then(function(){activateApp(logged[0].id);var initialView=new URLSearchParams(location.search).get("view")==="cloud"?"cloud":"overview";activateView(initialView)})}
 else{if(logged.length||tokens.cloud){clearAdminSession();note("loginNotice","管理权限已更新，请重新登录。","info")}setLoginMode("admin");headerState()}
});
})();