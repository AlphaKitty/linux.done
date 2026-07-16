/**
 * linux.done - Background Service Worker
 *
 * 职责：
 * - 左键点击图标 → 打开 LINUX DO 首页
 * - 右键菜单 → 插件设置 / 立即扫描
 * - 定时轮询 + 三维度规则匹配
 * - 浏览器通知推送（含防爆炸：去重 + 冷却 + 聚合）
 */

import { getSettings, getRules, isRuleInCooldown, markRuleFired,
         addMatchedPost, setLastScanTime, getLastScanTime, isInDoNotDisturb,
         markPostsAsSeen, getSeenPosts, markPostAsSeen,
         getNotifiedPosts, markPostAsNotified, getMatchedPostCount } from './lib/storage.js';
import { getAllLatestPosts, getLatestPosts, getPostUrl, isPostExpired, clearCache, setFetchOverride, getCategoryTree, getTags } from './lib/discourse.js';
import { batchMatchByRules, isRuleValid } from './lib/matcher.js';
import { initI18n, t } from './lib/i18n.js';
import { sendEvent } from './lib/analytics.js';

const PREFIX = '[linux.done]';

console.log(PREFIX, '🟢 Service Worker 已启动');

// ============================================================
// 右键菜单
// ============================================================

const MENU = { LINUXDO: 'open-linuxdo', SETTINGS: 'open-settings', SCAN: 'scan-now' };

chrome.runtime.onInstalled.addListener(async (details) => {
  await initI18n();
  console.log(PREFIX, '已安装/更新', details.reason);

  sendEvent(details.reason === 'install' ? 'extension_installed' : 'extension_updated');

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.LINUXDO, title: 'linux.do', contexts: ['action'] });
    // chrome.contextMenus.create({ id: MENU.SETTINGS, title: '插件设置', contexts: ['action'] });
    // chrome.contextMenus.create({ id: MENU.SCAN, title: '立即扫描', contexts: ['action'] });
  });

  if (details.reason === 'install') {
    await createScanAlarm();
  } else {
    await recreateScanAlarm();
  }
  await performScan();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU.LINUXDO) chrome.tabs.create({ url: 'https://linux.do' });
  if (info.menuItemId === MENU.SETTINGS) chrome.runtime.openOptionsPage();
  if (info.menuItemId === MENU.SCAN) performScan().catch(() => {});
});

// ============================================================
// Alarms
// ============================================================

async function createScanAlarm(name = 'scanPosts') {
  const periodInMinutes = 10;
  await chrome.alarms.create(name, { periodInMinutes });
  console.log(PREFIX, `后台轮询已创建，间隔 ${periodInMinutes} 分钟`);
}

async function recreateScanAlarm() {
  await chrome.alarms.clear('scanPosts');
  return createScanAlarm();
}

// ============================================================
// Content Script 代理 — 绕过 Cloudflare
// ============================================================

/**
 * 找已打开的 LINUX DO tab，注入 fetch 代理
 * 使得 discourse.js 中的 API 调用走 Content Script 的 fetch
 */
async function setupContentScriptProxy() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: 'https://linux.do/*' }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        console.log(PREFIX, '没有打开的 LINUX DO 页面，使用直接 fetch');
        resolve(false);
        return;
      }

      const tab = tabs[0];
      console.log(PREFIX, `找到 LINUX DO tab #${tab.id}`);

      // 尝试 ping content script
      chrome.tabs.sendMessage(tab.id, { type: 'PROXY_PING' }, (pingResp) => {
        const needsInject = chrome.runtime.lastError !== undefined;

        if (needsInject) {
          console.log(PREFIX, 'content script 未注入，正在注入…');
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          }, () => {
            if (chrome.runtime.lastError) {
              console.error(PREFIX, '注入失败:', chrome.runtime.lastError.message);
              resolve(false);
              return;
            }
            console.log(PREFIX, 'content script 注入成功');
            // 等待脚本初始化完成
            setTimeout(() => {
              applyProxy(tab.id);
              resolve(true);
            }, 300);
          });
        } else {
          console.log(PREFIX, 'content script 已就绪');
          applyProxy(tab.id);
          resolve(true);
        }
      });
    });
  });
}

/**
 * 为指定 tab 设置 fetch 代理
 */
function applyProxy(tabId) {
  setFetchOverride((url) => {
    return new Promise((resolveFetch, rejectFetch) => {
      chrome.tabs.sendMessage(tabId, { type: 'PROXY_FETCH', url }, (response) => {
        if (chrome.runtime.lastError) {
          rejectFetch(new Error(chrome.runtime.lastError.message));
        } else if (!response?.success) {
          rejectFetch(new Error(response?.error || '代理请求失败'));
        } else {
          resolveFetch(response.data);
        }
      });
    });
  });
}

/**
 * 快速检测是否有活动的 linux.do tab 且 content script 在线
 * 用于判断是否可以跳过后台扫描（content script 推送已经覆盖）
 */
async function hasActiveContentScript() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://linux.do/*' });
    if (!tabs || tabs.length === 0) return false;
    // 对第一个 tab 发 ping，超时 2 秒
    const result = await withTimeout(
      chrome.tabs.sendMessage(tabs[0].id, { type: 'PROXY_PING' }),
      2000
    );
    return result?.alive === true;
  } catch {
    return false;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** 带超时的 Promise runner，超时或报错时返回 null */
async function runWithTimeout(promise, ms) {
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  } catch {
    return null;
  }
}

// ============================================================
// 核心扫描（三维度规则匹配）
// ============================================================

async function performScan() {
  try {
    const scanId = Date.now().toString(36).slice(-4);
    console.log(PREFIX, `[${scanId}] ===== 扫描开始 =====`);

    // 前置检查：如果存在活动的 linux.do tab 且有 content script 推送，
    // 扫描完全多余，直接跳过
    const hasActiveTab = await hasActiveContentScript();
    if (hasActiveTab) {
      console.log(PREFIX, `[${scanId}] → linux.do tab 在线，content script 已在推送数据，跳过本次扫描`);
      return;
    }

    console.log(PREFIX, `[${scanId}] 步骤 1/6: 读取设置`);
    const settings = await getSettings();
    console.log(PREFIX, `[${scanId}] 通知: ${settings.notificationsEnabled}, 冷却: ${settings.ruleCooldownMinutes}min, 聚合: ${settings.aggregateNotifications}`);
    if (!settings.notificationsEnabled) {
      console.log(PREFIX, '通知已禁用');
      return;
    }

    const rules = await getRules();
    const enabledRules = rules.filter(r => r.enabled);
    console.log(PREFIX, `[${scanId}] 步骤 2/6: 规则检查, 共 ${rules.length} 条, 启用 ${enabledRules.length} 条`);
    enabledRules.forEach((r, i) => {
      console.log(PREFIX, `[${scanId}]   规则[${i}]: "${r.name}" cats=[${r.categories}] tags=[${r.tags}] keywords=[${r.keywords}]`);
    });
    if (enabledRules.length === 0) {
      console.log(PREFIX, '无启用规则');
      return;
    }

    // 1. 先设置内容脚本代理（后续所有 API 调用都走代理）
    console.log(PREFIX, `[${scanId}] 步骤 3/6: 设置内容脚本代理`);
    const proxyOk = await setupContentScriptProxy();
    console.log(PREFIX, `[${scanId}] 代理状态: ${proxyOk ? '✅ 已启用' : '⚠️ 未启用(直连)'}`);

    // 2. 从启用规则中收集要扫描的类别
    console.log(PREFIX, `[${scanId}] 步骤 4/6: 确定扫描类别`);
    const allCatsWithRules = enabledRules.flatMap(r => r.categories || []);
    const deduped = [...new Set(allCatsWithRules)];
    let enabledCats;

    if (deduped.length > 0) {
      enabledCats = deduped;
      console.log(PREFIX, `[${scanId}] 从规则获取类别: ${enabledCats.join(', ')}`);
    } else {
      try {
        const tree = await getCategoryTree();
        enabledCats = tree.tree.map(c => c.name);
        console.log(PREFIX, `[${scanId}] 从 API 发现顶层类别 (共 ${tree.tree.length} 个): ${enabledCats.join(', ')}`);
      } catch (e) {
        console.error(PREFIX, `[${scanId}] ❌ 获取类别树失败:`, e.message);
        return;
      }
    }
    if (enabledCats.length === 0) {
      console.error(PREFIX, `[${scanId}] ❌ 扫描类别为空，跳过`);
      return;
    }

    // 3. 扫描每个类别
    console.log(PREFIX, `[${scanId}] 步骤 5/6: 开始抓取帖子 (${enabledCats.length} 个类别, 每类上限 150 条, 自动分页)`);
    const t0 = Date.now();
    const categoryPosts = await getAllLatestPosts(enabledCats, 150);
    const t1 = Date.now();

    let totalPosts = 0;
    for (const [cat, posts] of Object.entries(categoryPosts)) {
      console.log(PREFIX, `[${scanId}]   📥 ${cat}: 收到 ${posts.length} 条 (耗时 ${t1 - t0}ms)`);
      totalPosts += posts.length;
      if (posts.length > 0) {
        // 展示前 3 条标题
        posts.slice(0, 3).forEach((p, i) => {
          console.log(PREFIX, `[${scanId}]     [${i}] id=${p.id} "${p.title}" tags=[${p.tags}] subcat="${p.subcategoryName}" bumps=${p.bumped_at}`);
        });
        if (posts.length > 3) console.log(PREFIX, `[${scanId}]     … 还有 ${posts.length - 3} 条`);
      }
    }
    console.log(PREFIX, `[${scanId}]   总计收到 ${totalPosts} 条帖子`);

    const notifiedPosts = await getNotifiedPosts();
    console.log(PREFIX, `[${scanId}]   已通知帖子数: ${notifiedPosts.size}`);

    // 收集所有匹配（用于 matchedList 更新 — 不按已通知过滤，确保 bumpedAt 始终刷新）
    const allMatchedPosts = [];
    // 收集通知候选（用于通知 — 受已通知 + 冷却双重约束）
    const notifyCandidates = [];
    console.log(PREFIX, `[${scanId}] 步骤 5.5/6: 执行规则匹配`);

    const cooldownMs = (settings.ruleCooldownMinutes || 10) * 60 * 1000;

    for (const [category, posts] of Object.entries(categoryPosts)) {
      const freshPosts = posts.filter(p => !isPostExpired(p));
      const expiredCount = posts.length - freshPosts.length;
      if (expiredCount > 0) console.log(PREFIX, `[${scanId}]   ${category}: 过滤掉 ${expiredCount} 条过期帖, 剩余 ${freshPosts.length} 条`);

      // matchedList: 不按已通知过滤
      const forList = batchMatchByRules(freshPosts, enabledRules, new Set());
      if (forList.length > 0) {
        for (const { post, matchResults } of forList) {
          allMatchedPosts.push({ post, match: matchResults[0], category });
        }
      }

      // 通知: 按已通知过滤
      const forNotify = batchMatchByRules(freshPosts, enabledRules, notifiedPosts);
      if (forNotify.length > 0) {
        for (const { post, matchResults } of forNotify) {
          for (const m of matchResults) {
            if (cooldownMs > 0 && await isRuleInCooldown(m.ruleId, cooldownMs)) {
              console.log(PREFIX, `[${scanId}]   ⏰ 规则 "${m.ruleName}" 冷却中，跳过 "${post.title}"`);
              continue;
            }
            notifyCandidates.push({ post, match: m, category });
          }
        }
      }
    }

    // ===== 1/2: 更新 matchedList（所有匹配帖子，刷新 bumpedAt）=====
    console.log(PREFIX, `[${scanId}] matchedList 更新: ${allMatchedPosts.length} 条`);
    const listPostMap = new Map();
    for (const item of allMatchedPosts) {
      if (!listPostMap.has(item.post.id)) {
        listPostMap.set(item.post.id, { ...item, rules: [] });
      }
      listPostMap.get(item.post.id).rules.push(item.match.ruleName);
    }
    for (const item of Array.from(listPostMap.values())) {
      await addMatchedPost({
        id: item.post.id, title: item.post.title, category: item.category,
        url: getPostUrl(item.post.id), matchedKeyword: item.match?.ruleName || '规则匹配',
        matchedRules: item.rules, createdAt: item.post.created_at,
        bumpedAt: item.post.bumped_at || item.post.created_at,
        replyCount: item.post.reply_count || 0, likeCount: item.post.like_count || 0,
      });
    }

    // ===== 2/2: 通知（仅全新匹配）=====
    if (notifyCandidates.length > 0) {
      console.log(PREFIX, `[${scanId}] 通知: ${notifyCandidates.length} 条新匹配`);
      const notifPostMap = new Map();
      for (const item of notifyCandidates) {
        if (!notifPostMap.has(item.post.id)) {
          notifPostMap.set(item.post.id, { ...item, rules: [] });
        }
        notifPostMap.get(item.post.id).rules.push(item.match.ruleName);
      }
      const uniqueNotify = Array.from(notifPostMap.values());

      for (const item of uniqueNotify) {
        if (item.match?.ruleId) await markRuleFired(item.match.ruleId).catch(() => {});
        await markPostAsNotified(item.post.id).catch(() => {});
      }

      if (settings.aggregateNotifications && uniqueNotify.length > 1) {
        await sendAggregatedNotification(uniqueNotify);
      } else {
        for (const item of uniqueNotify) {
          await sendNotification(item.post, item.category, item.rules);
        }
      }
    } else {
      console.log(PREFIX, `[${scanId}] ❌ 无新匹配需通知`);
    }

    // 统一刷新角标 = storage 中匹配帖总数
    await refreshBadge();

    await setLastScanTime();
    console.log(PREFIX, `[${scanId}] ===== 扫描完成 =====`);
    sendEvent('scan_completed', {
      total_matched: allMatchedPosts.length,
      new_matches: notifyCandidates.length,
      total_categories: enabledCats?.length || 0,
    });

  } catch (error) {
    console.error(PREFIX, '❌ 扫描出错:', error);
    console.error(PREFIX, '❌ 错误栈:', error.stack);
    sendEvent('scan_error', { message: error.message?.slice(0, 200) });
  }
}

// performIncrementalScan 已移除 — 所有数据由 content.js 推送 + handlePageTopicData 处理

// ============================================================
// 通知
// ============================================================

async function sendNotification(post, category, rules) {
  const settings = await getSettings();
  if (isInDoNotDisturb(settings)) return;

  const ruleLabel = rules?.join(', ') || '规则匹配';
  const notificationId = `hunter-${post.id}`;
  const url = getPostUrl(post.id);

  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: '/icons/icon128.png',
    title: `[${category}] ${ruleLabel}`,
    message: post.title,
    contextMessage: `💬 ${post.reply_count || 0} · 👍 ${post.like_count || 0}`,
    buttons: [{ title: t('notif.view_post') }, { title: t('notif.mark_read') }],
    priority: 2,
    requireInteraction: true,
  });

  await chrome.storage.local.set({
    notificationMap: { [notificationId]: { postId: post.id, url } }
  });
  sendEvent('notification_sent', { type: 'single', category, rule_count: rules?.length || 1 });
}

async function sendAggregatedNotification(matches) {
  const settings = await getSettings();
  if (isInDoNotDisturb(settings)) return;

  // 按类别分组
  const byCat = {};
  for (const m of matches) {
    if (!byCat[m.category]) byCat[m.category] = [];
    byCat[m.category].push(m);
  }

  const lines = Object.entries(byCat).map(([cat, items]) =>
    `[${cat}] ${items.length} 条匹配`
  ).join('\n');

  const titles = matches.slice(0, 3).map(m => m.post.title).join('\n• ');
  const more = matches.length > 3 ? `\n… 还有 ${matches.length - 3} 条` : '';

  await chrome.notifications.create('hunter-aggregated', {
    type: 'list',
    iconUrl: '/icons/icon128.png',
    title: `🏹 发现 ${matches.length} 条新福利`,
    message: lines,
    items: matches.slice(0, 5).map(m => ({
      title: m.post.title.substring(0, 40),
      message: `${m.category} · ${m.rules?.join(',') || ''}`
    })),
    contextMessage: `共 ${matches.length} 条匹配 · ${Object.keys(byCat).length} 个类别`,
    buttons: [{ title: t('notif.view_post') }],
    priority: 2,
    requireInteraction: true,
  });

  // 聚合通知点击跳首页
  await chrome.storage.local.set({
    notificationMap: { 'hunter-aggregated': { url: 'https://linux.do' } }
  });
  sendEvent('notification_sent', { type: 'aggregated', count: matches.length, categories: Object.keys(byCat).length });
}

// 通知点击
chrome.notifications.onClicked.addListener((id) => {
  if (!id.startsWith('hunter-')) return;
  chrome.storage.local.get('notificationMap', (r) => {
    const data = (r.notificationMap || {})[id];
    if (data?.url) chrome.tabs.create({ url: data.url });
    chrome.notifications.clear(id);
  });
});

chrome.notifications.onButtonClicked.addListener((id, idx) => {
  if (!id.startsWith('hunter-')) return;
  chrome.storage.local.get('notificationMap', (r) => {
    const data = (r.notificationMap || {})[id];
    if (!data) return;
    if (idx === 0 && data.url) chrome.tabs.create({ url: data.url });
    if (idx === 1 && data.postId) markPostsAsSeen([data.postId]);
    chrome.notifications.clear(id);
  });
});

// ============================================================
// Alarm
// ============================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'scanPosts') await performScan();
});

// ============================================================
// Badge — 反映 storage 中未读匹配数
// ============================================================

/**
 * 统一刷新角标：从 storage 读取匹配帖总数
 */
async function refreshBadge() {
  try {
    const count = await getMatchedPostCount();
    await updateBadge(count);
  } catch {}
}

async function updateBadge(count) {
  if (count > 0) {
    await chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff4500' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

/** 弹出窗打开时调用：刷新角标（匹配帖总数），后台安静刷新 */
async function onPopupOpened() {
  await refreshBadge();
  // 安静刷新 storage，供下次弹出窗使用（不等待，不阻塞）
  fetchFromPageTab().catch(() => {});
}

// ============================================================
// 消息通信
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SCAN_NOW':
      console.log(PREFIX, '收到 SCAN_NOW 消息，开始扫描');
      performScan().then(() => {
        console.log(PREFIX, 'SCAN_NOW 完成');
        sendResponse({ success: true });
      }).catch(e => {
        console.error(PREFIX, 'SCAN_NOW 出错:', e);
        sendResponse({ success: false, error: e.message });
      });
      return true;

    case 'GET_STATUS':
      getStatus().then(sendResponse);
      return true;

    case 'UPDATE_SETTINGS':
      recreateScanAlarm().then(() => sendResponse({ success: true }));
      return true;

    case 'GET_SEEN_POSTS':
      getSeenPosts().then(set => sendResponse(Array.from(set)));
      return true;

    case 'MARK_POST_SEEN':
      if (message.postId) markPostAsSeen(message.postId).catch(() => {});
      sendResponse({ success: true });
      return false;

    case 'TEST_NOTIFICATION':
      handleTestNotification().then(sendResponse);
      return true;

    case 'PAGE_TOPIC_DATA':
      // Content Script 从页面提取的话题数据，做规则匹配并缓存
      handlePageTopicData(message.topics).then(() => sendResponse({ success: true }));
      return true;

    case 'GET_LATEST_MATCHES':
      // 弹出窗打开时触发：返回缓存中最新匹配，同时在后台刷新
      getMatchedPosts(30).then(posts => sendResponse({ success: true, posts }));
      return true;

    case 'POPUP_OPENED':
      // 弹出窗打开：清空徽章 + 安静刷新
      onPopupOpened().then(() => sendResponse({ success: true }));
      return true;

    case 'GET_ACTIVITY_CONTENT':
      (async () => {
        const ids = message.postIds || [];
        const results = {};

        // 找打开的 linux.do tab
        const tabs = await chrome.tabs.query({ url: 'https://linux.do/*' }).catch(() => []);
        if (tabs.length > 0) {
          const tabId = tabs[0].id;
          // 尝试 ping content script，失败则注入
          let csReady = false;
          try {
            await chrome.tabs.sendMessage(tabId, { type: 'PROXY_PING' });
            csReady = true;
          } catch {
            // content script 被杀死（扩展重载等），重新注入
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
              });
              // 等脚本初始化
              await new Promise(r => setTimeout(r, 600));
              csReady = true;
            } catch {}
          }

          if (csReady) {
            try {
              const resp = await chrome.tabs.sendMessage(tabId, { type: 'FETCH_TOPIC_DETAILS', postIds: ids });
              if (resp?.success && resp.results) {
                Object.assign(results, resp.results);
              }
            } catch {}
          }
        }

        // 回退：对还没获取到的帖子，直接通过 background fetch（可能被 CF 拦截，但值得一试）
        const missingIds = ids.filter(id => !results[id]);
        if (missingIds.length > 0) {
          await fetchActivityContentDirect(missingIds, results);
        }

        sendResponse({ success: true, results });
      })();
      return true;

    case 'GET_I18N_STRINGS':
      sendResponse({
        copy_link: t('content.copy_link'),
        copied: t('content.copied'),
        copy_failed: t('content.copy_failed'),
        copy_code: t('content.copy_code'),
        expired: t('content.expired'),
      });
      return true;

    case 'GET_CATEGORIES':
      (async () => {
        const result = await runWithTimeout(getCategoryTree(), 10000);
        sendResponse(result ? { success: true, tree: result } : { success: false });
      })();
      return true;

    case 'GET_TAGS':
      (async () => {
        const result = await runWithTimeout(getTags(), 10000);
        sendResponse(result ? { success: true, tags: result } : { success: false });
      })();
      return true;

    default:
      sendResponse({ error: '未知消息类型' });
  }
});

/**
 * 处理 content.js 从页面 DOM 提取的话题数据 — 永不 429，因为数据来自页面而非 API
 */
async function handlePageTopicData(topics) {
  try {
    console.log(PREFIX, 'handlePageTopicData 收到', topics?.length, '条话题');
    if (!topics?.length) {
      console.log(PREFIX, 'handlePageTopicData: topics 为空，跳过');
      return;
    }

    console.log(PREFIX, 'handlePageTopicData 前 2 条:', topics.slice(0, 2).map(t => `id=${t.id} title=${t.title} cat=${t.category}`));

    const rules = await getRules();
    const enabledRules = rules.filter(r => r.enabled);
    console.log(PREFIX, 'handlePageTopicData: 启用规则', enabledRules.length, '条');
    if (enabledRules.length === 0) {
      console.log(PREFIX, 'handlePageTopicData: 无启用规则');
      return;
    }

    const matched = batchMatchByRules(topics, enabledRules, new Set());
    console.log(PREFIX, 'handlePageTopicData: batchMatchByRules 匹配了', matched.length, '条');
    sendEvent('page_data_matched', { topic_count: topics.length, match_count: matched.length, rules: enabledRules.length });
    if (matched.length === 0) {
      // 没匹配到，记录一条未匹配的帖子信息方便排查
      if (topics.length > 0) {
        console.log(PREFIX, 'handlePageTopicData 未匹配示例:', JSON.stringify({id: topics[0].id, title: topics[0].title}));
      }
      return;
    }

    // 更新缓存
    for (const { post, matchResults } of matched) {
      await addMatchedPost({
        id: post.id,
        title: post.title,
        category: post.category || '',
        url: getPostUrl(post.id),
        matchedKeyword: matchResults[0]?.ruleName || '规则匹配',
        matchedRules: matchResults.map(m => m.ruleName),
        createdAt: post.created_at || new Date().toISOString(),
        bumpedAt: post.bumped_at || post.created_at || new Date().toISOString(),
        replyCount: post.reply_count || 0,
        likeCount: post.like_count || 0,
      });
    }

    // 更新角标 = storage 中匹配帖总数
    await refreshBadge();

    // 通知仅全新帖子
    const settings = await getSettings();
    const notifiedPosts = await getNotifiedPosts();
    const cooldownMs = (settings.ruleCooldownMinutes || 10) * 60 * 1000;
    const toNotify = [];

    for (const { post, matchResults } of matched) {
      if (notifiedPosts.has(String(post.id))) continue;
      for (const m of matchResults) {
        if (cooldownMs > 0 && await isRuleInCooldown(m.ruleId, cooldownMs)) continue;
        toNotify.push({ post, match: m });
        await markRuleFired(m.ruleId).catch(() => {});
        await markPostAsNotified(post.id).catch(() => {});
        break;
      }
    }

    if (toNotify.length > 0) {
      if (settings.aggregateNotifications && toNotify.length > 1) {
        await sendAggregatedNotification(toNotify.map(n => ({ post: n.post, ...n.match, rules: [n.match.ruleName] })));
      } else {
        for (const n of toNotify) {
          await sendNotification(n.post, n.post.category || '', [n.match.ruleName]);
        }
      }
    }

    // 这里不再单独更新角标，已在缓存段统一刷新
  } catch (e) {
    console.error(PREFIX, 'handlePageTopicData 出错:', e);
  }
}

/**
 * Popup 打开时调用：找 linux.do tab，让 content.js 从 DOM 提取话题数据并缓存
 * 返回缓存中最新的 20 条匹配
 */
async function fetchFromPageTab() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://linux.do/*' });
    console.log(PREFIX, 'fetchFromPageTab: 找到', tabs.length, '个 linux.do tab');
    if (tabs.length > 0) {
      console.log(PREFIX, 'fetchFromPageTab: 向 tab', tabs[0].id, '发送 EXTRACT_TOPICS');
      const resp = await chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_TOPICS' }).catch(e => {
        console.log(PREFIX, 'fetchFromPageTab: EXTRACT_TOPICS 失败:', e.message);
        return null;
      });
      console.log(PREFIX, 'fetchFromPageTab: EXTRACT_TOPICS 响应:', resp?.success, 'topics:', resp?.topics?.length);
      if (resp?.success && resp.topics?.length > 0) {
        await handlePageTopicData(resp.topics);
      }
    } else {
      console.log(PREFIX, 'fetchFromPageTab: 无打开的 linux.do tab，直接返回缓存');
    }
  } catch (e) {
    console.log(PREFIX, 'fetchFromPageTab 异常:', e.message);
  }
  const cached = await getMatchedPosts(20);
  console.log(PREFIX, 'fetchFromPageTab: 返回', cached.length, '条缓存');
  return cached;
}

async function getStatus() {
  const settings = await getSettings();
  const rules = await getRules();
  const alarms = await chrome.alarms.get('scanPosts');
  const enabledRules = rules.filter(r => r.enabled).length;

  return {
    running: !!alarms,
    ruleCount: rules.length,
    enabledRuleCount: enabledRules,
    notificationsEnabled: settings.notificationsEnabled,
    lastScanTime: (await getLastScanTime()) || 0,
    dnd: isInDoNotDisturb(settings),
  };
}

/**
 * 直接通过 background fetch 获取回复内容（作为 content script 代理的回退）
 * 可能被 Cloudflare 拦截，但大多数时候 /t/{id}.json 的 GET 请求是允许的
 */
async function fetchActivityContentDirect(postIds, results) {
  const batchSize = 3;
  for (let i = 0; i < postIds.length; i += batchSize) {
    const batch = postIds.slice(i, i + batchSize).map(async (id) => {
      try {
        const resp = await fetch(`https://linux.do/t/${id}.json`);
        if (!resp.ok) return;
        const data = await resp.json();
        const posts = data?.post_stream?.posts || [];
        const replies = posts.filter(p => p.post_number > 1);
        if (replies.length === 0) return;
        const latest = replies[replies.length - 1];
        const raw = latest.raw || latest.cooked || '';
        const content = raw.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
        if (content) results[id] = { content, author: latest.username || '' };
      } catch { /* 单条失败不影响其他 */ }
    });
    await Promise.allSettled(batch);
  }
}

/**
 * 发送测试通知
 * chrome.notifications API 只需要 manifest.json 中的 notifications 权限，
 * 不依赖 Web Notification API 的 permission 状态。
 */
async function handleTestNotification() {
  await initI18n();
  try {
    // 用时间戳生成唯一 ID，避免通知被同名旧通知覆盖
    const notifId = `hunter-test-${Date.now()}`;
    const notifOptions = {
      type: 'basic',
      iconUrl: '/icons/icon128.png',
      title: t('notif.test_title'),
      message: '如果你看到这条通知，说明通知功能一切正常！',
      contextMessage: t('notif.test_context'),
      priority: 2,
      requireInteraction: true,
    };

    const createdId = await chrome.notifications.create(notifId, notifOptions);
    console.log(PREFIX, '测试通知 create 返回:', createdId, '请求 ID:', notifId);

    // 验证通知是否真的被创建了
    const allNotifs = await chrome.notifications.getAll();
    const found = allNotifs[createdId || notifId] || allNotifs[notifId];

    return {
      success: true,
      notificationCreated: !!found,
      visibleCount: Object.keys(allNotifs).length,
      notifId: createdId || notifId,
    };
  } catch (e) {
    console.error(PREFIX, '测试通知出错:', e.message);
    return { success: false, error: e.message };
  }
}

chrome.runtime.onStartup.addListener(async () => {
  await initI18n();
  const alarm = await chrome.alarms.get('scanPosts');
  if (!alarm) await createScanAlarm();
});
