/**
 * 存储工具模块
 * 封装 chrome.storage 操作，统一管理配置和缓存数据
 *
 * 订阅规则模型：
 * - 维度：类别(一级分类) × 标签(二级子分类) × 关键词
 * - 规则内：类别 OR / 标签 OR / 关键词 OR
 * - 规则间：类别 AND 标签 AND 关键词（三维同时满足才匹配）
 * - 标签取的是论坛分类 API 中属于所选类别的二级子分类
 * - 防爆炸：冷却期 + 去重 + 至少一个缩小维度（标签或关键词）
 */

const STORAGE_KEYS = {
  SETTINGS: 'settings',
  RULES: 'subscriptionRules',
  SEEN_POSTS: 'seenPosts',
  MATCHED_POSTS: 'matchedPosts',
  NOTIFIED_POSTS: 'notifiedPosts',
  LAST_SCAN_TIME: 'lastScanTime',
  RULE_COOLDOWN: 'ruleCooldown',
  CLEARED_POSTS: 'clearedPosts',
};

const DEFAULT_SETTINGS = {
  notificationsEnabled: true,
  language: 'zh',
  doNotDisturbStart: null,
  doNotDisturbEnd: null,
  enabledCategories: {
    '福利羊毛': true,
    '跳蚤市场': true,
  },
  // 防爆炸全局配置
  ruleCooldownMinutes: 10,     // 同一规则冷却期（分钟）
  aggregateNotifications: true, // 同次扫描的多条匹配聚合成一条通知
  // 匹配帖保留策略
  matchedRetentionHours: 48,    // 保留最近 48 小时（约 = 每天查看 2 次，始终看到近 2 天内容）
  matchedRetentionMax: 200,     // 最多保留 200 条（~200KB，远低于 local storage 10MB 配额）
  // 弹窗点击后自动从列表移除（阅后即焚）
  autoRemoveOnOpen: true,
};

/**
 * 获取所有设置
 */
export async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...result[STORAGE_KEYS.SETTINGS] };
}

/**
 * 更新设置
 */
export async function updateSettings(partial) {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
  return merged;
}

// ============================================================
// 订阅规则管理
// ============================================================

/**
 * @typedef {Object} SubscriptionRule
 * @property {string} id - 唯一 ID
 * @property {string} name - 规则名称
 * @property {string[]} categories - 类别列表（空数组 = 不限）
 * @property {string[]} tags - 标签列表（空数组 = 不限）
 * @property {string[]} keywords - 关键词列表（空数组 = 不限）
 * @property {string[]} blockedWords - 屏蔽词列表（空数组 = 不限，命中任一即排除）
 * @property {boolean} enabled - 启用/禁用
 * @property {number} created - 创建时间戳
 */

/**
 * 获取所有订阅规则
 * @returns {Promise<SubscriptionRule[]>}
 */
export async function getRules() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.RULES);
  return result[STORAGE_KEYS.RULES] || [];
}

/**
 * 保存所有订阅规则
 */
export async function setRules(rules) {
  await chrome.storage.sync.set({ [STORAGE_KEYS.RULES]: rules });
}

/**
 * 添加订阅规则
 * @param {string} name
 * @param {string[]} categories
 * @param {string[]} tags
 * @param {string[]} keywords
 * @returns {Promise<SubscriptionRule[]>}
 */
export async function addRule(name, categories = [], tags = [], keywords = [], blockedWords = []) {
  const rules = await getRules();
  const now = Date.now();
  const rule = {
    id: `rule_${now}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    categories,
    tags,
    keywords,
    blockedWords,
    enabled: true,
    created: now,
  };
  const updated = [...rules, rule];
  await setRules(updated);
  return updated;
}

/**
 * 更新订阅规则
 */
export async function updateRule(ruleId, partial) {
  const rules = await getRules();
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx === -1) return rules;
  rules[idx] = { ...rules[idx], ...partial };
  await setRules(rules);
  return rules;
}

/**
 * 删除订阅规则
 */
export async function removeRule(ruleId) {
  const rules = await getRules();
  const updated = rules.filter(r => r.id !== ruleId);
  await setRules(updated);
  return updated;
}

/**
 * 切换规则启用状态
 */
export async function toggleRule(ruleId) {
  const rules = await getRules();
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx === -1) return rules;
  rules[idx].enabled = !rules[idx].enabled;
  await setRules(rules);
  return rules;
}

// ============================================================
// 规则冷却（防爆炸）
// ============================================================

/**
 * 检查规则是否在冷却期
 * @param {string} ruleId
 * @param {number} cooldownMs - 冷却毫秒数
 * @returns {Promise<boolean>}
 */
export async function isRuleInCooldown(ruleId, cooldownMs = 600000) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.RULE_COOLDOWN);
  const map = result[STORAGE_KEYS.RULE_COOLDOWN] || {};
  const lastFired = map[ruleId];
  if (!lastFired) return false;
  return (Date.now() - lastFired) < cooldownMs;
}

/**
 * 标记规则触发时间（刷新冷却）
 */
export async function markRuleFired(ruleId) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.RULE_COOLDOWN);
  const map = result[STORAGE_KEYS.RULE_COOLDOWN] || {};
  map[ruleId] = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEYS.RULE_COOLDOWN]: map });
}

// ============================================================
// 旧关键词兼容（迁移用）
// ============================================================

/**
 * 获取关键词列表（遗留接口）
 * @deprecated 使用 getRules 替代
 */
export async function getKeywords() {
  const result = await chrome.storage.sync.get('keywords');
  return result.keywords || [];
}

// ============================================================
// 已读/通知/匹配记录
// ============================================================

export async function getSeenPosts() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SEEN_POSTS);
  return new Set(result[STORAGE_KEYS.SEEN_POSTS] || []);
}

export async function markPostAsSeen(postId) {
  const seen = await getSeenPosts();
  seen.add(postId);
  await chrome.storage.local.set({
    [STORAGE_KEYS.SEEN_POSTS]: Array.from(seen)
  });
}

export async function markPostsAsSeen(postIds) {
  const seen = await getSeenPosts();
  for (const id of postIds) seen.add(id);
  await chrome.storage.local.set({
    [STORAGE_KEYS.SEEN_POSTS]: Array.from(seen)
  });
}

export async function getNotifiedPosts() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.NOTIFIED_POSTS);
  return new Set(result[STORAGE_KEYS.NOTIFIED_POSTS] || []);
}

export async function markPostAsNotified(postId) {
  const notified = await getNotifiedPosts();
  notified.add(postId);
  await chrome.storage.local.set({
    [STORAGE_KEYS.NOTIFIED_POSTS]: Array.from(notified)
  });
}

/**
 * 获取匹配帖总数（给角标用的，避免全量读取）
 */
export async function getMatchedPostCount() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MATCHED_POSTS);
  const posts = result[STORAGE_KEYS.MATCHED_POSTS] || [];
  return posts.length;
}

export async function getMatchedPosts(limit = 100) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.MATCHED_POSTS);
  const posts = result[STORAGE_KEYS.MATCHED_POSTS] || [];
  // 按帖子最后活动时间排序（最新活动在前），与页面看到的顺序一致
  return posts
    .sort((a, b) => new Date(b.bumpedAt || b.createdAt || 0) - new Date(a.bumpedAt || a.createdAt || 0))
    .slice(0, limit);
}

export async function clearMatchedPosts() {
  // 1) 记录当前匹配帖的 ID → 后续推送不再入库，直到有新活动
  const result = await chrome.storage.local.get(STORAGE_KEYS.MATCHED_POSTS);
  const posts = result[STORAGE_KEYS.MATCHED_POSTS] || [];
  const now = Date.now();
  const cleared = {};
  for (const p of posts) {
    if (p.id) cleared[String(p.id)] = now;
  }

  // 2) 合并已有的清除记录（保留旧记录避免刚清掉又被推回来）
  const existing = await getClearedPosts();
  for (const [id, ts] of Object.entries(existing)) {
    if (!cleared[id]) cleared[id] = ts;
  }

  // 3) 清理 48h 前的旧记录（允许帖子 2 天后重新出现）
  const cutoff = now - 48 * 3_600_000;
  for (const [id, ts] of Object.entries(cleared)) {
    if (ts < cutoff) delete cleared[id];
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.MATCHED_POSTS]: [],
    [STORAGE_KEYS.CLEARED_POSTS]: cleared,
  });
}

/**
 * 从匹配列表移除单条帖子（阅后即焚），并记入 clearedPosts 防止无新活动时回弹
 */
export async function removeMatchedPost(postId) {
  if (postId == null || postId === '') return;
  const id = String(postId);
  const result = await chrome.storage.local.get(STORAGE_KEYS.MATCHED_POSTS);
  const posts = result[STORAGE_KEYS.MATCHED_POSTS] || [];
  const updated = posts.filter(p => String(p.id) !== id);

  const cleared = await getClearedPosts();
  const now = Date.now();
  cleared[id] = now;

  const cutoff = now - 48 * 3_600_000;
  for (const [cid, ts] of Object.entries(cleared)) {
    if (ts < cutoff) delete cleared[cid];
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.MATCHED_POSTS]: updated,
    [STORAGE_KEYS.CLEARED_POSTS]: cleared,
  });
}

/** 获取已清除帖子 Map: { postId → clearedAt } */
export async function getClearedPosts() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CLEARED_POSTS);
  return result[STORAGE_KEYS.CLEARED_POSTS] || {};
}

/**
 * 添加匹配帖子。返回 true 表示实际写入，false 表示被跳过（已清除且无新活动）
 */
export async function addMatchedPost(post) {
  // 0) 检查是否在已清除列表中
  const cleared = await getClearedPosts();
  const postIdS = String(post.id);
  if (cleared[postIdS]) {
    const clearedAt = cleared[postIdS];
    const lastActivity = new Date(post.bumped_at || post.created_at || 0).getTime();
    if (lastActivity <= clearedAt) {
      // 帖子没有新活动 → 跳过，不入库
      return false;
    }
    // 帖子有新的活动（有人回复）→ 从清除列表移除，允许重新入库
    delete cleared[postIdS];
    await chrome.storage.local.set({ [STORAGE_KEYS.CLEARED_POSTS]: cleared });
  }

  const result = await chrome.storage.local.get(STORAGE_KEYS.MATCHED_POSTS);
  const posts = result[STORAGE_KEYS.MATCHED_POSTS] || [];
  // 去重：如果同 id 已存在，先移除旧条目
  const deduped = posts.filter(p => p.id !== post.id);
  const updated = [{ ...post, matchedAt: Date.now() }, ...deduped];

  // 应用保留策略
  const settings = await getSettings();
  const hr = settings.matchedRetentionHours ?? 48;
  const max = settings.matchedRetentionMax ?? 200;
  const cutoff = Date.now() - hr * 3_600_000;
  const pruned = updated.filter(p => {
    const ts = new Date(p.bumpedAt || p.createdAt || p.matchedAt || 0).getTime();
    return ts >= cutoff;
  });
  if (pruned.length > max) pruned.length = max;

  await chrome.storage.local.set({ [STORAGE_KEYS.MATCHED_POSTS]: pruned });
  return true;
}

export async function getLastScanTime() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_SCAN_TIME);
  return result[STORAGE_KEYS.LAST_SCAN_TIME] || 0;
}

export async function setLastScanTime(time = Date.now()) {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SCAN_TIME]: time });
}

export function isInDoNotDisturb(settings) {
  if (!settings.doNotDisturbStart || !settings.doNotDisturbEnd) return false;
  const now = new Date();
  const hour = now.getHours();
  const start = settings.doNotDisturbStart;
  const end = settings.doNotDisturbEnd;
  if (start <= end) {
    return hour >= start && hour < end;
  } else {
    return hour >= start || hour < end;
  }
}
