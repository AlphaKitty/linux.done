/**
 * linux.done - Content Script
 *
 * 仅负责数据代理和提取，不做任何页面视觉修改或 DOM 注入。
 * 功能：
 * - API 代理（绕过 Cloudflare）
 * - 页面数据提取与推送
 * - Discourse MessageBus 实时监听
 */

(function() {

// ============================================================
// 安全工具 — 扩展重载后静默断开所有 observer
// ============================================================

let allObservers = [];

function wrapObserver(fn) {
  return function() {
    try {
      if (typeof chrome !== 'object' || !chrome.runtime?.id) {
        allObservers.forEach(o => { try { o.disconnect(); } catch {} });
        return;
      }
      fn.apply(this, arguments);
    } catch (e) {
      if (String(e).includes('Extension context invalidated')) {
        allObservers.forEach(o => { try { o.disconnect(); } catch {} });
      }
    }
  };
}

function createSafeObserver(fn, target, config) {
  const obs = new MutationObserver(wrapObserver(fn));
  allObservers.push(obs);
  try { obs.observe(target, config); } catch {}
  return obs;
}

// ============================================================
// 初始化
// ============================================================

let mbSubscribed = false;

(async () => {
  // 立即提取一次当前数据（首次加载后 1 秒）
  setTimeout(async () => {
    const topics = await fetchLatestTopics();
    if (topics.length > 0) {
      safeSendMessage({ type: 'PAGE_TOPIC_DATA', topics });
    }
  }, 1000);

  startMessageBusPolling();

  // 安全网：每 30 秒自动提取一次
  setInterval(async () => {
    if (!isTargetSite()) return;
    const topics = await fetchLatestTopics();
    if (topics.length > 0) {
      safeSendMessage({ type: 'PAGE_TOPIC_DATA', topics });
    }
  }, 30000);
})();

// ============================================================
// 消息通信
// ============================================================

function safeSendMessage(msg) {
  try {
    if (typeof chrome !== 'object' || !chrome.runtime?.id) return;
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {}
}

// ============================================================
// API 代理 — 绕过 Cloudflare
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROXY_PING') {
    sendResponse({ alive: true });
    return false;
  }

  if (message.type === 'EXTRACT_TOPICS') {
    (async () => {
      const topics = await fetchLatestTopics();
      if (topics.length > 0) {
        safeSendMessage({ type: 'PAGE_TOPIC_DATA', topics });
      }
      sendResponse({ success: true, topics });
    })();
    return true;
  }

  if (message.type === 'PROXY_FETCH') {
    const url = message.url;
    const pathOnly = url.split('?')[0];
    if (!url.startsWith('https://linux.do') || !pathOnly.endsWith('.json')) {
      sendResponse({ success: false, error: 'invalid url' });
      return false;
    }

    fetch(url)
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));

    return true;
  }

  // 直接从页面上下文获取帖子最新回复内容（绕过 CF）
  if (message.type === 'FETCH_TOPIC_DETAILS') {
    (async () => {
      const ids = message.postIds || [];
      const results = {};
      // 单条失败不影响其他，每 3 条并行
      const batchSize = 3;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize).map(async (id) => {
          try {
            const postContent = await fetchLatestReplyContent(id);
            if (postContent) results[id] = postContent;
          } catch { /* 单条失败不影响其他 */ }
        });
        await Promise.allSettled(batch);
      }
      sendResponse({ success: true, results });
    })();
    return true;
  }
});

// ============================================================
// Discourse 实时监听 + 话题提取
// ============================================================

async function startMessageBusPolling() {
  if (!isTargetSite()) return;
  if (mbSubscribed) return;
  trySetupMessageBusHook();
  observeNewTopicBanner();
}

let pageTopicDebounce = null;

function triggerPageTopicExtract() {
  if (pageTopicDebounce) clearTimeout(pageTopicDebounce);
  pageTopicDebounce = setTimeout(async () => {
    const topics = await fetchLatestTopics();
    if (topics.length > 0) {
      safeSendMessage({ type: 'PAGE_TOPIC_DATA', topics });
    }
  }, 800);
}

/**
 * 话题数据获取函数 — 只用 /latest.json API，不用 DOM 提取
 * 在页面上下文中 fetch，带 CF cookie，不会被 429
 */
async function fetchLatestTopics() {
  // 获取最新话题列表
  let data;
  try {
    const resp = await fetch('https://linux.do/latest.json');
    if (!resp.ok) {
      console.log('[linux.done 调试] /latest.json 失败:', resp.status);
      return [];
    }
    data = await resp.json();
  } catch (e) {
    return [];
  }

  const rows = data?.topic_list?.topics || [];
  if (rows.length === 0) return [];

  // 尝试获取类别映射（失败则 category 为空）
  let catNameById = {};
  try {
    const catResp = await fetch('https://linux.do/categories.json');
    if (catResp.ok) {
      const catData = await catResp.json();
      for (const cat of (catData?.category_list?.categories || [])) {
        catNameById[cat.id] = cat.name || '';
      }
    }
  } catch {}

  return rows.map(topic => ({
    id: topic.id,
    title: topic.title,
    category: catNameById[topic.category_id] || '',
    tags: topic.tags || [],
    tagSet: new Set(topic.tags || []),
    bumped_at: topic.bumped_at || topic.created_at,
    excerpt: topic.title,
    created_at: topic.created_at,
    reply_count: topic.reply_count || 0,
    like_count: topic.like_count || 0,
  }));
}

/**
 * 获取帖子最新回复内容
 * 策略：1) 先试 /t/{id}.json（默认含前 20 个帖子）
 *       2) 如果帖子回复数很多，默认 20 个可能不够，再尝试 /t/{id}/posts.json?post_number=last
 *       3) raw 为空时回退到 cooked（HTML 转纯文本）
 */
async function fetchLatestReplyContent(topicId) {
  // 策略 1: 获取帖子详情（含 post_stream）
  const resp = await fetch(`https://linux.do/t/${topicId}.json`);
  if (!resp.ok) return null;
  const data = await resp.json();
  const replyCount = data.reply_count || 0;
  const posts = data?.post_stream?.posts || [];

  // 过滤出回复帖（post_number > 1，第一个帖子是楼主帖）
  const replies = posts.filter(p => p.post_number > 1);
  if (replies.length === 0) return null;

  // 获取最新回复
  const latest = replies[replies.length - 1];
  let raw = (latest.raw || '').trim();

  // 如果 raw 为空或有更多回复未加载，尝试获取完整列表
  if (!raw && replyCount > posts.length - 1) {
    try {
      const allResp = await fetch(`https://linux.do/t/${topicId}/posts.json`);
      if (allResp.ok) {
        const allData = await allResp.json();
        const allReplies = (allData?.post_stream?.posts || [])
          .filter(p => p.post_number > 1);
        if (allReplies.length > 0) {
          const last = allReplies[allReplies.length - 1];
          raw = (last.raw || '').trim();
          if (!raw) raw = stripHtml(last.cooked || '');
          if (raw) return { content: raw, author: last.username || '' };
        }
      }
    } catch {}
  }

  // raw 为空时从 cooked 回退
  if (!raw) {
    raw = stripHtml(latest.cooked || '');
  }
  if (!raw) return null;

  return { content: raw.replace(/\n{3,}/g, '\n\n').trim(), author: latest.username || '' };
}

/**
 * 将 HTML 转换为纯文本（Discourse cooked 字段回退用）
 */
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // 替换 <br> 和块级标签为换行
  tmp.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  tmp.querySelectorAll('p, div, li, blockquote, pre, h1, h2, h3, h4').forEach(el => {
    el.after('\n');
  });
  return (tmp.textContent || '').trim();
}

function trySetupMessageBusHook() {
  const trySubscribe = (retry) => {
    if (typeof window.MessageBus !== 'undefined' && window.MessageBus) {
      console.log('[linux.done] hook MessageBus 成功');
      try {
        window.MessageBus.subscribe('/latest', () => {
          triggerPageTopicExtract();
        });
        window.MessageBus.subscribe('/new-topic', () => {
          triggerPageTopicExtract();
        });
        mbSubscribed = true;
      } catch {}
      return;
    }
    if (retry > 0) setTimeout(() => trySubscribe(retry - 1), 1000);
  };
  trySubscribe(5);
}

function observeNewTopicBanner() {
  createSafeObserver(() => {
    const el = document.querySelector(
      '.topic-list .new-topic, .load-new-posts, [class*=load-new], .new-topic-title, ' +
      'button:has(svg *[d*="M12 2a10"]), .alert-new-topic, .new-topics'
    );
    if (el && el.offsetHeight > 0 && el.offsetWidth > 0) {
      triggerPageTopicExtract();
    }
  }, document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
}

function isTargetSite() {
  return window.location.hostname === 'linux.do';
}

// End IIFE
})();
