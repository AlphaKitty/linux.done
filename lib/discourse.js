/**
 * Discourse API 对接模块
 *
 * 解决 Cloudflare 阻挡：支持通过 Content Script 代理 fetch，
 * Content Script 运行在论坛页面上下文中，拥有 CF 会话。
 */

const BASE_URL = 'https://linux.do';

// 内存缓存 TTL（仅同页面内复用）
const MEM_CACHE_TTL = 60_000;
// 持久缓存 TTL — 24 小时（跨页面刷新）
const PERSIST_CACHE_TTL = 86_400_000;

const CACHE_KEYS = {
  CATEGORIES: 'cache_categories',
  TAGS: 'cache_tags',
};

let catCache = null;
let catCacheTime = 0;
let tagCache = null;
let tagCacheTime = 0;

// 可替换的 fetch 函数 — 由 background.js 注入代理
let fetchOverride = null;

/**
 * 设置 fetch 代理（用于绕过 Cloudflare）
 * @param {function} fn - (url: string) => Promise<any>
 */
export function setFetchOverride(fn) {
  fetchOverride = fn;
}

/**
 * 带重试的 fetch — 优先使用代理
 */
async function fetchWithRetry(url, retries = 2, delay = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      if (fetchOverride) {
        return await fetchOverride(url);
      }
      // 直接 fetch（可能被 Cloudflare 拦截）
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

/**
 * 仅在 content script 代理模式下检查是否应尝试代理
 */
function urlIsDiscourseApi(url) {
  return url.startsWith(BASE_URL) && (
    url.includes('/categories.json') ||
    url.includes('/tags.json') ||
    url.includes('/c/') && url.endsWith('.json') ||
    url.includes('/t/') && url.endsWith('.json')
  );
}

/**
 * 构建代理 URL（content script 处理时只转发该请求）
 * @param {string} path - API 路径，如 /categories.json
 */
export function getProxyUrl(path) {
  return `${BASE_URL}${path}`;
}

/**
 * 读取持久缓存（chrome.storage.local）
 */
async function readPersistCache(key, ttl = PERSIST_CACHE_TTL) {
  try {
    const result = await chrome.storage.local.get(key);
    const entry = result[key];
    if (entry && entry.data && entry.timestamp) {
      if (Date.now() - entry.timestamp < ttl) {
        return entry.data;
      }
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * 写入持久缓存
 */
async function writePersistCache(key, data) {
  try {
    await chrome.storage.local.set({
      [key]: { data, timestamp: Date.now() },
    });
  } catch { /* ignore */ }
}

// ============================================================
// 类别树
// ============================================================

export async function getCategoryTree() {
  const now = Date.now();
  // 1) 内存缓存
  if (catCache && (now - catCacheTime) < MEM_CACHE_TTL) return catCache;

  // 2) 持久缓存（24h 有效）
  const cached = await readPersistCache(CACHE_KEYS.CATEGORIES);
  if (cached) {
    catCache = cached;
    catCacheTime = now;
    return cached;
  }

  // 3) 网络请求
  let data;
  try {
    data = await fetchWithRetry(`${BASE_URL}/categories.json`);
  } catch {
    // 网络失败时回退到持久缓存
    const fallback = await readPersistCache(CACHE_KEYS.CATEGORIES);
    if (fallback) {
      catCache = fallback;
      catCacheTime = now;
      return fallback;
    }
    throw new Error('无法加载分类数据，请确保已打开 linux.do');
  }
  const all = data?.category_list?.categories || [];

  const byId = {};
  const byName = {};
  const childrenOf = {};

  for (const cat of all) {
    const info = {
      id: cat.id,
      name: cat.name?.trim() || '',
      parentId: cat.parent_category_id,
      isTopLevel: !cat.parent_category_id,
      color: cat.color || '999999',
      topicCount: cat.topic_count || 0,
    };
    byId[cat.id] = info;
    if (!cat.parent_category_id) {
      byName[info.name] = cat.id;
      childrenOf[cat.id] = [];
    }
  }

  for (const cat of all) {
    const pid = cat.parent_category_id;
    if (pid && byId[pid]) {
      if (!childrenOf[pid]) childrenOf[pid] = [];
      childrenOf[pid].push(byId[cat.id]);
    }
  }

  const tree = Object.values(byId)
    .filter(c => c.isTopLevel)
    .map(c => ({
      id: c.id,
      name: c.name,
      color: c.color,
      subcategories: (childrenOf[c.id] || []).map(child => ({
        id: child.id, name: child.name, topicCount: child.topicCount,
      })),
    }));

  const result = { byName, tree, byId, childrenOf };
  catCache = result;
  catCacheTime = now;
  // 持久化
  writePersistCache(CACHE_KEYS.CATEGORIES, result);
  return result;
}

// ============================================================
// 标签
// ============================================================

export async function getTags() {
  const now = Date.now();
  // 1) 内存缓存
  if (tagCache && (now - tagCacheTime) < MEM_CACHE_TTL) return tagCache;

  // 2) 持久缓存（24h 有效）
  const cached = await readPersistCache(CACHE_KEYS.TAGS);
  if (cached) {
    tagCache = cached;
    tagCacheTime = now;
    return cached;
  }

  // 3) 网络请求
  let data;
  try {
    data = await fetchWithRetry(`${BASE_URL}/tags.json`);
  } catch {
    // 网络失败时回退到持久缓存
    const fallback = await readPersistCache(CACHE_KEYS.TAGS);
    if (fallback) {
      tagCache = fallback;
      tagCacheTime = now;
      return fallback;
    }
    throw new Error('无法加载标签数据，请确保已打开 linux.do');
  }
  const tags = (data?.tags || []).map(t => ({
    name: t.name,
    topicCount: t.topic_count || 0,
  }));
  tagCache = tags;
  tagCacheTime = now;
  // 持久化
  writePersistCache(CACHE_KEYS.TAGS, tags);
  return tags;
}

// ============================================================
// 帖子
// ============================================================

export async function getLatestPosts(categoryName, limit = 50) {
  const tree = await getCategoryTree();
  const categoryId = tree.byName[categoryName];
  if (!categoryId) {
    console.warn(`[linux.done] 未知类别: ${categoryName}`);
    return [];
  }

  // 分页抓取：先取第一页，然后继续取后续页面直到够数
  const allTopics = [];
  let page = 0;
  const perPage = 50; // Discourse 每页上限通常 50

  while (allTopics.length < limit && page < 3) { // 最多爬 3 页 (= 150 条)
    const url = `${BASE_URL}/c/${encodeURIComponent(categoryName)}/${categoryId}/l/latest.json?page=${page}`;
    try {
      const data = await fetchWithRetry(url);
      const topics = data?.topic_list?.topics || [];
      allTopics.push(...topics);
      if (topics.length < perPage) break; // 无更多页
      page++;
    } catch {
      break;
    }
  }

  return allTopics.slice(0, limit).map(topic => {
    const subName = catCache?.byId?.[topic.category_id]?.name || null;
    const subParent = topic.category_id
      ? (catCache?.byId?.[topic.category_id]?.parentId
        ? catCache?.byId?.[catCache.byId[topic.category_id].parentId]?.name
        : catCache?.byId?.[topic.category_id]?.name)
      : categoryName;

    return {
      id: topic.id,
      title: topic.title,
      category: subParent || categoryName,
      categoryId: topic.category_id,
      subcategoryName: subName,
      tags: topic.tags || [],
      tagSet: new Set(topic.tags || []),
      excerpt: topic.excerpt || topic.fancy_title || topic.title,
      created_at: topic.created_at,
      bumped_at: topic.bumped_at,
      reply_count: topic.reply_count || 0,
      like_count: topic.like_count || 0,
      views: topic.views || 0,
      posters: topic.posters?.length || 0,
      closed: !!topic.closed,
      archived: !!topic.archived,
    };
  });
}

export async function getAllLatestPosts(categoryNames = ['福利羊毛', '跳蚤市场'], limit = 50) {
  const results = {};
  for (const name of categoryNames) {
    results[name] = await getLatestPosts(name, limit);
  }
  return results;
}

export async function getPostDetail(topicId) {
  return fetchWithRetry(`${BASE_URL}/t/${topicId}.json`);
}

export function getPostUrl(topicId) {
  return `${BASE_URL}/t/${topicId}`;
}

export function isPostExpired(topic, maxAgeDays = 30) {
  if (!topic) return true;
  const expired = ['已过期', '已结束', '已截止', '已失效', 'closed', 'expired'];
  const title = (topic.title || '').toLowerCase();
  for (const kw of expired) {
    if (title.includes(kw)) return true;
  }
  if (topic.closed || topic.archived) return true;
  const diff = (Date.now() - new Date(topic.created_at).getTime()) / 864e5;
  return diff > maxAgeDays;
}

/**
 * 清除所有缓存（切换代理模式时使用）
 */
export async function clearCache() {
  catCache = null;
  catCacheTime = 0;
  tagCache = null;
  tagCacheTime = 0;
  try {
    await chrome.storage.local.remove([CACHE_KEYS.CATEGORIES, CACHE_KEYS.TAGS]);
  } catch { /* ignore */ }
}
