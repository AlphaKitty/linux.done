/**
 * 三维度匹配引擎（类别 + 标签 + 关键词）
 *
 * 匹配模型（规则订阅制）：
 * ┌─────────────┐     ┌───────────────┐     ┌──────────┐
 * │  类别(一级)  │  ×  │  标签(二级子分类)│  ×  │  关键词   │
 * │  OR 匹配     │     │  OR 匹配       │     │  OR 匹配  │
 * └─────────────┘     └───────────────┘     └──────────┘
 *         │                  │                    │
 *         └─────────── AND ──┴─────── AND ────────┘
 *
 * 防爆炸策略：
 * 1. 规则必须至少选择标签或关键词之一（仅选类别太宽泛）
 * 2. 同规则冷却期（默认 10 分钟不重复触发）
 * 3. 同帖只通知一次（去重）
 * 4. 同次扫描多条匹配可聚合
 */

// ============================================================
// 单维匹配
// ============================================================

/**
 * 关键词匹配（子串）
 */
function matchKeyword(text, keyword) {
  if (!text || !keyword) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

/**
 * 类别匹配（OR）
 */
function matchCategory(postCategory, ruleCategories) {
  if (!ruleCategories || ruleCategories.length === 0) return true; // 不限类别
  return ruleCategories.includes(postCategory);
}

/**
 * 标签匹配（OR）— 帖子的 tags[] 中有任一匹配即通过
 * Discourse 标签是论坛内置的标签系统，帖子可带多个 tag
 */
function matchTags(postTags, ruleTags) {
  if (!ruleTags || ruleTags.length === 0) return true; // 不限标签
  if (!postTags || postTags.length === 0) return false;
  return ruleTags.some(t => postTags.includes(t));
}

/**
 * 关键词匹配（OR）
 */
function matchKeywords(text, keywords) {
  if (!keywords || keywords.length === 0) return true; // 不限关键词
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

// ============================================================
// 规则匹配
// ============================================================

/**
 * 检查规则是否有效
 * 都为空时匹配所有帖子，由用户自行控制粒度
 */
export function isRuleValid(rule) {
  return true; // 所有规则都有效，空规则 = 全匹配
}

/**
 * 对单个帖子执行单条规则匹配
 * @param {object} post - 帖子对象（含 category, subcategoryName, title, excerpt）
 * @param {object} rule - 订阅规则
 * @returns {object|null} { matched: true, matchedRule: rule.name, matchedDimension: 'tag'|'keyword'|'both' } 或 null
 */
export function matchPostAgainstRule(post, rule) {
  if (!rule.enabled) return null;
  if (!post) return null;

  // 维度 1：类别匹配（顶层分类）
  if (!matchCategory(post.category, rule.categories)) return null;

  const textToSearch = `${post.title} ${post.excerpt || ''}`;

  // 维度 2：标签匹配（Discourse 帖子标签）
  const postTagArray = Array.isArray(post.tags) ? post.tags : (post.tagSet ? Array.from(post.tagSet) : []);
  const tagMatch = matchTags(postTagArray, rule.tags);

  // 维度 3：关键词匹配
  const keywordMatch = matchKeywords(textToSearch, rule.keywords);

  // AND 逻辑：三维都要满足（空维度自动跳过）
  const catOk = !rule.categories || rule.categories.length === 0 || matchCategory(post.category, rule.categories);
  const tagOk = !rule.tags || rule.tags.length === 0 || tagMatch;
  const kwOk = !rule.keywords || rule.keywords.length === 0 || keywordMatch;

  if (catOk && tagOk && kwOk) {
    // 确定匹配维度（用于展示）
    const matchedBy = [];
    if (tagMatch) matchedBy.push('tag');
    if (keywordMatch) matchedBy.push('keyword');

    return {
      matched: true,
      ruleId: rule.id,
      ruleName: rule.name,
      matchedDimension: matchedBy.join('+') || 'category',
    };
  }

  return null;
}

/**
 * 对帖子执行所有启用规则的匹配
 * @param {object} post
 * @param {Array} rules
 * @returns {Array} 匹配结果数组
 */
export function matchPostAgainstAllRules(post, rules) {
  const results = [];
  for (const rule of rules) {
    const result = matchPostAgainstRule(post, rule);
    if (result) results.push(result);
  }
  return results;
}

/**
 * 批量匹配：对一组帖子执行所有规则的匹配
 * @param {object[]} posts
 * @param {Array} rules
 * @param {Set} notifiedIds - 已通知 ID 去重
 * @returns {Array} [{ post, matchResults: [...] }]
 */
export function batchMatchByRules(posts, rules, notifiedIds = new Set()) {
  const matched = [];

  for (const post of posts) {
    // 跳过已通知
    if (notifiedIds.has(post.id)) continue;

    const results = matchPostAgainstAllRules(post, rules);
    if (results.length > 0) {
      matched.push({ post, matchResults: results });
    }
  }

  return matched;
}

// ============================================================
// 向后兼容：旧关键词匹配（不再使用，保留引用）
// ============================================================

export function matchKeywordsLegacy(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return null;
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

export function batchMatch(posts, keywords, notifiedIds = new Set()) {
  if (!posts || !keywords || keywords.length === 0) return [];
  const matched = [];
  for (const post of posts) {
    if (notifiedIds.has(post.id)) continue;
    const titleMatch = matchKeywordsLegacy(post.title, keywords);
    if (titleMatch) {
      matched.push({ ...post, matchedKeyword: titleMatch });
      continue;
    }
    if (post.excerpt) {
      const excerptMatch = matchKeywordsLegacy(post.excerpt, keywords);
      if (excerptMatch) {
        matched.push({ ...post, matchedKeyword: excerptMatch });
      }
    }
  }
  return matched;
}

/**
 * 提取链接
 */
export function extractLinks(topicDetail) {
  const links = [];
  if (!topicDetail?.post_stream?.posts) return links;
  for (const post of topicDetail.post_stream.posts) {
    const cooked = post.cooked || '';
    const markdownLinks = cooked.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    for (const link of markdownLinks) {
      const urlMatch = link.match(/\(([^)]+)\)/);
      if (urlMatch) links.push(urlMatch[1]);
    }
    const rawUrls = cooked.match(/https?:\/\/[^\s"'>)]+/g) || [];
    links.push(...rawUrls);
  }
  return [...new Set(links)];
}

/**
 * 热度分
 */
export function calculateHotScore(topic) {
  if (!topic) return 0;
  const rc = topic.reply_count || 0;
  const lc = topic.like_count || 0;
  const vw = topic.views || 0;
  return rc * 3 + lc * 2 + Math.min(vw / 10, 50);
}
