(() => {
'use strict';
const SUPABASE_URL = 'https://gzuaqjtvnkiblhqsgzpd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jJDVBqrGIjg87Iwn5bXwxQ_Z4JfI3aj';
const WORKER = 'https://api.zhixing.us.ci';
const APP = 'zhixing-ai';
const $ = id => document.getElementById(id);
const client = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const uuid = () => crypto.randomUUID();
const cloudItems = new Map();
function status(message) { const el = $('cloudAccountStatus'); if (el) el.textContent = message; }
function mergeIntoRecent(items) {
  const app = window.zxAIApp;
  if (!app) return;
  const seen = new Set();
  (items || []).forEach(item => {
    const id = String(item.id);
    seen.add(id);
    cloudItems.set(id, item);
    let conversation = app.state.conversations.find(c => c.cloudId === id);
    const createdAt = Date.parse(item.created_at || item.last_activity_at || item.updated_at) || Date.now();
    if (!conversation) {
      conversation = {
        id: 'cloud-' + id, cloudId: id, isCloud: true, cloudOnly: true,
        title: item.title || '云端对话', createdAt, messages: []
      };
      app.state.conversations.push(conversation);
    } else {
      conversation.isCloud = true;
      conversation.title = item.title || conversation.title || '云端对话';
      if (conversation.cloudOnly) conversation.createdAt = createdAt;
    }
  });
  app.state.conversations = app.state.conversations.filter(c => !c.cloudOnly || seen.has(String(c.cloudId)));
  app.state.conversations.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  app.populateHistory();
}
function removeCloudConversation(id) {
  const app = window.zxAIApp;
  if (!app) return;
  const i = app.state.conversations.findIndex(c => c.cloudId === String(id));
  if (i >= 0) {
    const removed = app.state.conversations.splice(i, 1)[0];
    if (app.state.currentId === removed.id) {
      app.state.currentId = null;
      app.showConversation();
    }
  }
  cloudItems.delete(String(id));
  app.populateHistory();
}
async function openById(id) {
  const key = String(id);
  let item = cloudItems.get(key);
  if (!item) {
    const result = await api('/api/history/conversations');
    mergeIntoRecent(result.conversations || []);
    item = cloudItems.get(key);
  }
  if (!item) throw new Error('找不到这条云端对话，请刷新历史后重试。');
  return openConversation(item);
}
async function deleteCloud(id) {
  const item = cloudItems.get(String(id));
  if (!confirm('删除这条云端对话？此操作不可撤销。')) return;
  try {
    await api('/api/history/conversations?id=' + encodeURIComponent(id), { method: 'DELETE' });
    removeCloudConversation(id);
    status('云端对话已删除。');
    await refreshHistory(false);
  } catch (e) { status('删除失败：' + e.message); }
}
async function api(path, options = {}) {
  const session = await client.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error('请先登录。');
  const sep = path.includes('?') ? '&' : '?';
  const response = await fetch(WORKER + path + sep + 'app=' + APP, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '云历史请求失败。');
  return data;
}
function currentConversation() {
  const app = window.zxAIApp;
  return app ? app.state.conversations.find(c => c.id === app.state.currentId) || null : null;
}
async function refreshHistory(showStatus = true) {
  const session = await client.auth.getSession();
  if (!session.data.session) return;
  const result = await api('/api/history/conversations');
  mergeIntoRecent(result.conversations || []);
  if (showStatus) status('已登录 · 知行AI云历史 ' + (result.conversations || []).length + ' 条，保留 90 天。');
}
async function openConversation(item) {
  try {
    const result = await api('/api/history/messages?conversation_id=' + encodeURIComponent(item.id));
    const app = window.zxAIApp; if (!app) return;
    let conversation = app.state.conversations.find(c => c.cloudId === item.id);
    const messages = (result.messages || []).filter(m => m.status === 'complete' && ['user', 'assistant'].includes(m.role)).map(m => ({ role: m.role, content: m.content, ts: Date.parse(m.created_at) || Date.now() }));
    if (!conversation) {
      conversation = { id: 'cloud-' + item.id, cloudId: item.id, isCloud: true, cloudOnly: true, title: item.title || '云端对话', createdAt: Date.parse(item.created_at || item.last_activity_at || item.updated_at) || Date.now(), messages };
      app.state.conversations.push(conversation);
    } else { conversation.title = item.title || conversation.title; conversation.messages = messages; conversation.isCloud = true; conversation.messages = messages; }
    app.state.currentId = conversation.id; app.showConversation(); app.populateHistory();
    status('已恢复云端对话。'); await refreshHistory(false);
  } catch (e) { status('读取历史失败：' + e.message); }
}
async function ensureConversation(conversation) {
  if (conversation.cloudId) return conversation.cloudId;
  const result = await api('/api/history/conversations', { method: 'POST', body: JSON.stringify({ title: (conversation.title || '新对话').replace(/\s+/g, ' ').slice(0, 70) || '新对话' }) });
  conversation.cloudId = result.conversation?.id || null;
  await refreshHistory(false);
  return conversation.cloudId;
}
async function saveMessage(conversation, role, content, id) {
  const session = await client.auth.getSession();
  if (!session.data.session || !content) return;
  try {
    await ensureConversation(conversation);
    if (!conversation.cloudId) return;
    await api('/api/history/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conversation.cloudId, role, content, client_message_id: id || uuid(), status: 'complete' }) });
  } catch (e) { status('云历史保存失败：' + e.message); }
}
async function refreshAuth() {
  if (!client) { status('登录组件加载失败，请检查网络。'); return; }
  const result = await client.auth.getSession();
  const user = result.data.session?.user || null;
  if (user) {
    try { await refreshHistory(false); status('已登录 · 云对话会在回答后自动保存。'); }
    catch (error) { status('已登录，但云历史暂不可用：' + (error.message || '请稍后重试。')); }
  } else {
    cloudItems.clear();
    const app = window.zxAIApp;
    if (app) {
      app.state.conversations = app.state.conversations.filter(c => !c.cloudOnly);
      app.state.conversations.forEach(c => { delete c.cloudId; delete c.isCloud; });
      if (!app.state.conversations.some(c => c.id === app.state.currentId)) { app.state.currentId = null; app.showConversation(); }
      app.populateHistory();
    }
    status('登录后可同步知行AI文字对话；请使用页面统一账号窗口登录。');
  }
}
async function syncAuth(session) {
  if (!client) throw new Error('登录组件加载失败，请检查网络。');
  if (session?.access_token && session?.refresh_token) {
    const result = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (result.error) throw result.error;
  } else {
    const result = await client.auth.signOut();
    if (result.error) throw result.error;
  }
  await refreshAuth();
}
if (client) client.auth.onAuthStateChange(() => setTimeout(refreshAuth, 0));
window.zxCloudHistory = { messageId: uuid, saveMessage, refresh: refreshHistory, open: openById, delete: deleteCloud, syncAuth };
refreshAuth();
})();