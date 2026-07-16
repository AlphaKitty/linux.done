/**
 * linux.done - Popup
 */

import { getMatchedPosts, clearMatchedPosts, removeMatchedPost, getSettings, updateSettings } from '../lib/storage.js';
import { initI18n, t } from '../lib/i18n.js';
import { sendPageView } from '../lib/analytics.js';

/** 阅后即焚：点击后从弹窗列表移除，默认开启 */
let autoRemoveOnOpen = true;

document.addEventListener('DOMContentLoaded', () => {
  // 同步执行骨架屏，避免空状态闪烁（浏览器尚未 paint）
  showSkeleton();
  // 异步加载数据
  (async () => {
    await initI18n();
    applyI18n();
    checkNotificationPermission();
    bindButtons();
    sendPageView('popup');
    await initAsync().catch(() => {});
  })();
});

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

function bindButtons() {
  byId('testNotifBtn')?.addEventListener('click', handleTestNotification);
  byId('toggleNotif')?.addEventListener('click', handleToggleNotification);
  byId('toggleAutoRemove')?.addEventListener('click', handleToggleAutoRemove);
  byId('openSettingsBtn')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  byId('clearBtn')?.addEventListener('click', handleClear);
}

async function initAsync() {
  await Promise.allSettled([loadStatus(), loadMatchedPosts(), loadAutoRemoveSetting()]);
}

function byId(id) { return document.getElementById(id); }

// ============================================================
// 通知权限检查
// Chrome 扩展的 chrome.notifications API 和 Web Notification API
// 是两套独立系统。扩展通知权限由以下两个因素决定：
//   1. manifest.json 中声明 "notifications" 权限（已声明）
//   2. chrome://extensions 详情页中 "Notifications" 权限开关
// 系统通知还需 macOS 系统设置 → 通知 → Chrome → 允许
// ============================================================

async function checkNotificationPermission() {
  const tipEl = byId('notifTip');
  const tipText = byId('notifTipText');
  if (!tipEl || !tipText) return;

  // 检查是否已确认过通知正常
  try {
    const r = await chrome.storage.local.get('notifConfirmed');
    if (r.notifConfirmed) {
      tipEl.style.display = 'none';
      return;
    }
  } catch {}

  // 有匹配帖时才提示（否则用户还没用到通知功能，不打扰）
  const posts = await getMatchedPosts(1);
  if (posts.length === 0) return;

  // 显示引导，可关闭
  tipEl.style.display = 'flex';
  tipText.innerHTML = `${t('popup.notif_guide')} <a id="openExtSettings">${t('popup.notif_settings_link')}</a> <span id="closeNotifTip" style="cursor:pointer;margin-left:4px;opacity:0.6">✕</span>`;
  byId('openExtSettings')?.addEventListener('click', openNotifSettings);
  byId('closeNotifTip')?.addEventListener('click', () => { tipEl.style.display = 'none'; });
}

// ============================================================
// Loading skeleton
// ============================================================

/** 显示加载骨架屏（同步执行，在 paint 前替换空状态） */
function showSkeleton() {
  const topicsList = byId('newTopicsList');
  const activityList = byId('activityList');
  if (topicsList) topicsList.innerHTML = renderSkeletonItems(3);
  if (activityList) activityList.innerHTML = renderSkeletonItems(2);
  // 状态区域显示加载指示
  const scanEl = byId('lastScanTime');
  if (scanEl) scanEl.textContent = '…';
}

function renderSkeletonItems(count) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-item">
        <div class="skeleton-line skeleton-line-title"></div>
        <div class="skeleton-line skeleton-line-meta"></div>
      </div>`;
  }
  return html;
}

// ============================================================
// Status
// ============================================================

async function loadStatus() {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (!r) return;

    const count = r.enabledRuleCount ?? 0;
    byId('ruleCount').textContent = t('popup.rules', { n: count });

    const scanEl = byId('lastScanTime');
    if (scanEl && r.lastScanTime) {
      const m = Math.floor((Date.now() - r.lastScanTime) / 60000);
      if (m < 1) scanEl.textContent = t('popup.just_now');
      else if (m < 60) scanEl.textContent = t('popup.min_ago', { n: m });
      else scanEl.textContent = t('popup.hour_ago', { n: Math.floor(m / 60) });
    }

    if (r.dnd) byId('scanStatusDot')?.classList.add('inactive');
  } catch { /* silent */ }
}

// ============================================================
// Matched posts — 秒读 storage，零等待
// ============================================================

async function loadMatchedPosts() {
  // 1) 通知 background 清空徽章 + 安静刷新（不等待，不阻塞）
  chrome.runtime.sendMessage({ type: 'POPUP_OPENED' }).catch(() => {});

  // 2) 读 storage → 立即渲染
  //    content.js 推送 → handlePageTopicData → addMatchedPost 持续写入
  //    所以 storage 始终是最新的
  const posts = await getMatchedPosts(200);
  renderNewTopics(posts);
  renderActivity(posts);
}

/**
 * 最新帖子栏：按 createdAt（帖子发布时间）降序排列
 */
function renderNewTopics(posts) {
  const list = byId('newTopicsList');
  if (!list) return;

  const sorted = [...posts]
    .filter(p => p.createdAt)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (sorted.length === 0) {
    list.innerHTML = `<div class="empty-state">${t('popup.no_matches')}</div>`;
    return;
  }

  list.innerHTML = sorted.map(p => {
    const rules = p.matchedRules?.join(', ') || p.matchedKeyword || '';
    const timeStr = fmt(new Date(p.createdAt).getTime());
    return `
      <div class="matched-item" data-post-id="${esc(String(p.id ?? ''))}" data-url="${esc(p.url || '')}">
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-meta">
          <span class="post-keyword">${esc(rules)}</span>
          <span>${esc(p.category || '')}</span>
          <span class="post-time">${timeStr}</span>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.matched-item').forEach(el => {
    el.addEventListener('click', () => handleItemOpen(el));
  });
}

/**
 * 最新互动栏：按 bumpedAt（最后活动时间）降序排列
 * 只显示有回复的帖子，拉取不到回复内容则隐藏该项
 */
function renderActivity(posts) {
  const list = byId('activityList');
  if (!list) return;

  const sorted = [...posts]
    .filter(p => p.bumpedAt && (p.replyCount || 0) > 0)
    .sort((a, b) => new Date(b.bumpedAt || 0) - new Date(a.bumpedAt || 0));

  if (sorted.length === 0) {
    list.innerHTML = `<div class="empty-state">${t('popup.no_matches')}</div>`;
    return;
  }

  // 先渲染，所有带回复的帖子都显示加载中
  const needFetchIds = sorted.map(p => p.id);
  list.innerHTML = sorted.map((p) => {
    const rules = p.matchedRules?.join(', ') || p.matchedKeyword || '';
    const timeStr = fmt(new Date(p.bumpedAt).getTime());
    return `
      <div class="activity-item" data-post-id="${p.id}" data-url="${esc(p.url || '')}">
        <div class="post-title">${esc(p.title)}</div>
        <div class="post-meta">
          <span class="post-keyword">${esc(rules)}</span>
          <span>${esc(p.category || '')}</span>
          <span class="post-time">${timeStr}</span>
        </div>
        <div class="activity-content" data-post-id="${p.id}">
          <span class="activity-loading">…</span>
        </div>
      </div>`;
  }).join('');

  // 绑定点击跳转
  list.querySelectorAll('.activity-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.activity-toggle')) return;
      handleItemOpen(el);
    });
  });

  // 代理点击：展开/收起
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.activity-toggle');
    if (!btn) return;
    e.stopPropagation();
    const parent = btn.closest('.activity-content');
    if (!parent) return;
    const shortEl = parent.querySelector('.activity-text-short');
    const fullEl = parent.querySelector('.activity-text-full');
    if (!shortEl || !fullEl) return;
    const isExpanded = fullEl.style.display !== 'none';
    shortEl.style.display = isExpanded ? '' : 'none';
    fullEl.style.display = isExpanded ? 'none' : '';
    btn.textContent = isExpanded ? t('popup.expand') : t('popup.collapse');
  });

  // 异步拉取回复内容，带超时
  const TIMEOUT_MS = 25_000;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    // 超时仍未获取到的全部移除
    removeEmptyActivityItems(list);
  }, TIMEOUT_MS);

  chrome.runtime.sendMessage({ type: 'GET_ACTIVITY_CONTENT', postIds: needFetchIds }, (resp) => {
    if (timedOut) return;
    clearTimeout(timer);
    if (!resp?.success || !resp.results) {
      removeEmptyActivityItems(list);
      return;
    }
    for (const [postId, data] of Object.entries(resp.results)) {
      const el = list.querySelector(`.activity-content[data-post-id="${postId}"]`);
      if (!el) continue;
      el.innerHTML = renderActivityContent(data.content, data.author);
    }
    // 剩下没返回数据的帖子全部移除
    removeEmptyActivityItems(list);
  });
}

/**
 * 移除仍未加载到回复内容的帖子项，如果全空了显示空状态
 */
function removeEmptyActivityItems(list) {
  const items = list.querySelectorAll('.activity-item');
  let removedAny = false;
  items.forEach(el => {
    const loading = el.querySelector('.activity-loading');
    if (loading) {
      el.remove();
      removedAny = true;
    }
  });
  if (removedAny && list.children.length === 0) {
    list.innerHTML = `<div class="empty-state">${t('popup.no_matches')}</div>`;
  }
}

/**
 * 渲染回复内容（带展开/收起）
 */
function renderActivityContent(content, author) {
  const textClass = 'activity-text';
  // 截断条件：超过 80 字或包含换行
  const shouldTruncate = content.length > 80 || content.includes('\n');
  const shortContent = shouldTruncate ? content.slice(0, 80).replace(/\n.*$/s, '') + '…' : '';

  if (!shouldTruncate) {
    return `
      <span class="activity-author">${esc(author)}</span>
      <span class="${textClass}">${esc(content)}</span>`;
  }

  return `
    <span class="activity-author">${esc(author)}</span>
    <span class="${textClass} activity-text-short">${esc(shortContent)}</span>
    <span class="${textClass} activity-text-full" style="display:none">${esc(content)}</span>
    <button class="activity-toggle">${t('popup.expand')}</button>`;
}

// ============================================================
// Button handlers
// ============================================================

async function handleTestNotification() {
  const btn = byId('testNotifBtn');
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = '…';

  try {
    const r = await chrome.runtime.sendMessage({ type: 'TEST_NOTIFICATION' });
    if (r?.success) {
      if (r.notificationCreated) {
        btn.textContent = '✓';
        // 通知已在 Chrome 中创建 → 说明扩展权限 OK，问题可能在 OS 级
        chrome.storage.local.set({ notifConfirmed: true }).catch(() => {});
        const tipEl = byId('notifTip');
        const tipText = byId('notifTipText');
        if (tipEl && tipText && !r.notificationCreated) {
          tipEl.style.display = 'flex';
          tipText.innerHTML = `${t('popup.notif_guide')} <a id="openExtSettings">${t('popup.notif_settings_link')}</a> <span id="closeNotifTip" style="cursor:pointer;margin-left:4px;opacity:0.6">✕</span>`;
          byId('openExtSettings')?.addEventListener('click', openNotifSettings);
          byId('closeNotifTip')?.addEventListener('click', () => { tipEl.style.display = 'none'; });
        } else if (tipEl) {
          tipEl.style.display = 'none';
        }
      } else {
        // create 成功但 getAll 找不到 → Chrome 内部阻止了显示
        btn.textContent = '✗';
        showNotifSettingsTip(true);
      }
    } else {
      btn.textContent = '✗';
      showNotifSettingsTip(false);
    }
  } catch {
    btn.textContent = '✗';
    showNotifSettingsTip(false);
  }

  setTimeout(() => { btn.textContent = orig; }, 2500);
}

/** 显示通知设置引导，explain 通知被 Chrome 静默拦截 */
function showNotifSettingsTip(chromeBlocked) {
  const tipEl = byId('notifTip');
  const tipText = byId('notifTipText');
  if (!tipEl || !tipText) return;
  tipEl.style.display = 'flex';
  if (chromeBlocked) {
    tipText.innerHTML = `${t('popup.notif_chrome_blocked')} <a id="openChromeNotifSettings">${t('popup.notif_chrome_link')}</a> <span id="closeNotifTip" style="cursor:pointer;margin-left:4px;opacity:0.6">✕</span>`;
    byId('openChromeNotifSettings')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'chrome://settings/content/notifications' });
    });
  } else {
    tipText.innerHTML = `${t('popup.notif_guide')} <a id="openExtSettings">${t('popup.notif_settings_link')}</a> <span id="closeNotifTip" style="cursor:pointer;margin-left:4px;opacity:0.6">✕</span>`;
    byId('openExtSettings')?.addEventListener('click', openNotifSettings);
  }
  byId('closeNotifTip')?.addEventListener('click', () => { tipEl.style.display = 'none'; });
}

/** 打开扩展详情页和 macOS 通知设置指引 */
function openNotifSettings() {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  chrome.tabs.create({ url: 'https://support.apple.com/guide/mac-help/change-notifications-settings-mchlp2843/mac' });
}

async function handleToggleNotification() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings || {};
    const enabled = !settings.notificationsEnabled;
    await chrome.storage.sync.set({ settings: { ...settings, notificationsEnabled: enabled } });
    const btn = byId('toggleNotif');
    if (btn) btn.style.opacity = enabled ? '1' : '0.4';
  } catch { /* silent */ }
}

async function loadAutoRemoveSetting() {
  try {
    const s = await getSettings();
    autoRemoveOnOpen = s.autoRemoveOnOpen !== false;
  } catch {
    autoRemoveOnOpen = true;
  }
  applyAutoRemoveUi();
}

function applyAutoRemoveUi() {
  const btn = byId('toggleAutoRemove');
  if (!btn) return;
  btn.style.opacity = autoRemoveOnOpen ? '1' : '0.4';
  btn.title = t(autoRemoveOnOpen ? 'popup.auto_remove_on' : 'popup.auto_remove_off');
  btn.classList.toggle('active', autoRemoveOnOpen);
}

async function handleToggleAutoRemove() {
  try {
    autoRemoveOnOpen = !autoRemoveOnOpen;
    await updateSettings({ autoRemoveOnOpen });
    applyAutoRemoveUi();
  } catch { /* silent */ }
}

/**
 * 点击帖子/互动：打开链接；若开启阅后即焚则从两侧列表与 storage 移除
 */
async function handleItemOpen(el) {
  const url = el?.dataset?.url;
  const postId = el?.dataset?.postId;
  if (url) chrome.tabs.create({ url });
  if (!autoRemoveOnOpen || !postId) return;

  document.querySelectorAll(
    `.matched-item[data-post-id="${cssEscape(postId)}"], .activity-item[data-post-id="${cssEscape(postId)}"]`
  ).forEach(node => node.remove());

  for (const listId of ['newTopicsList', 'activityList']) {
    const list = byId(listId);
    if (list && list.children.length === 0) {
      list.innerHTML = `<div class="empty-state">${t('popup.no_matches')}</div>`;
    }
  }

  try {
    await removeMatchedPost(postId);
  } catch { /* silent */ }
}

function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

// ============================================================
// Clear
// ============================================================

async function handleClear() {
  await clearMatchedPosts();
  // 从 background 同步清除徽章
  try { chrome.runtime.sendMessage({ type: 'POPUP_OPENED' }).catch(() => {}); } catch {}
  // 立即刷新显示
  const posts = await getMatchedPosts(200);
  renderNewTopics(posts);
  renderActivity(posts);
}

// ============================================================
// Utils
// ============================================================

function esc(t) {
  if (!t) return '';
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

function fmt(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return t('popup.just_now');
  if (m < 60) return t('popup.min_ago', { n: m });
  if (m < 1440) return t('popup.hour_ago', { n: Math.floor(m / 60) });
  return `${Math.floor(m / 1440)}d`;
}
