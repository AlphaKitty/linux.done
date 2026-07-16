/**
 * i18n — 轻量中英双语模块
 *
 * 用法：
 *   import { t, initI18n } from './i18n.js';
 *   await initI18n();            // 读取语言设置（默认中文）
 *   t('popup.scan');             // → "Scan" / "扫描"
 *   t('rule.name', { n: 2 });    // → "Rule 2" / "规则 2"
 */

const ZH = {
  // Popup
  'popup.scan': '扫描',
  'popup.notify': '通知',
  'popup.scanning': '扫描中…',
  'popup.done': '完成',
  'popup.failed': '失败',
  'popup.recent': '最近消息',
  'popup.new_topics': '最新帖子',
  'popup.new_activity': '最新互动',
  'popup.no_matches': '暂无匹配',
  'popup.load_failed': '加载失败',
  'popup.just_now': '刚刚',
  'popup.min_ago': '{n} 分钟前',
  'popup.hour_ago': '{n} 小时前',
  'popup.rules': '{n} 条规则',
  'popup.expand': '展开',
  'popup.collapse': '收起',
  'popup.notif_on': '通知已开启',
  'popup.notif_off': '通知已关闭',
  'popup.test_ok': '通知测试成功',
  'popup.test_fail': '通知测试失败',
  'popup.notif_guide': '没收到通知？请检查',
  'popup.notif_settings_link': '扩展通知权限',
  'popup.notif_chrome_blocked': 'Chrome 已阻止通知显示，请在',
  'popup.notif_chrome_link': 'Chrome 通知设置 → 允许',
  'popup.auto_remove_on': '阅后即焚：开（点击后从列表移除）',
  'popup.auto_remove_off': '阅后即焚：关',

  // Options — pages
  'options.title': 'linux.done – 设置',
  'options.save': '保存',
  'options.saved': '已保存',
  'options.no_rules': '暂无规则',
  'options.add_rule': '添加规则',
  'options.rule_name': '规则名称',
  'options.rule_placeholder': 'Rule {n}',

  // Options — rules
  'rule.category': '类别',
  'rule.tags': '标签',
  'rule.keywords': '关键词',
  'rule.blocked_words': '屏蔽词',
  'rule.add_blocked_word': '添加屏蔽词',
  'rule.search_tags': '搜索标签…',
  'rule.add_keyword': '添加关键词',
  'rule.loading': '每日的首次加载会获取最新分类及标签,请稍后…',

  // Options — settings sections
  'setting.notifications': '通知',
  'setting.notif_enabled': '启用通知',
  'setting.cooldown': '冷却期',
  'setting.cooldown_hint': '同一规则触发后的最小通知间隔',
  'setting.aggregate': '聚合通知',
  'setting.aggregate_hint': '同次扫描的多条匹配聚合成一条通知',
  'setting.dnd': '免打扰',
  'setting.cooldown_off': '关闭',
  'setting.cooldown_5': '5 分钟',
  'setting.cooldown_10': '10 分钟',
  'setting.cooldown_30': '30 分钟',
  'setting.cooldown_1h': '1 小时',
  'setting.cooldown_day': '每日汇总',

  // Options — retention
  'setting.retention': '存储',
  'setting.retention_hours': '保留时长',
  'setting.retention_hours_hint': '超过此时间的帖子和消息自动清理',
  'setting.retention_max': '条数上限',
  'setting.retention_max_hint': '最多保留多少条',
  'setting.retention_note': '默认保留 48 小时 / 200 条。每天查看 2 次的话足够看到近 2 天的内容，存储占用控制在 200KB 以内。长时间不关浏览器也无压力。',

  // Options — DND
  'dnd.off': '关闭',
  'dnd.to': '至',

  // Options — card description
  'card.rules_desc': '所有维度均为可选。都不选时将匹配所有新帖。维度内：OR。维度间：AND。',

  // Content script
  'content.copy_link': '复制链接',
  'content.copied': '已复制',
  'content.copy_failed': '复制失败',
  'content.copy_code': '复制',
  'content.expired': '已过期',

  // Background
  'notif.view_post': '查看帖子',
  'notif.mark_read': '标记已读',
  'notif.test_title': 'linux.done 通知测试',
  'notif.test_message': '如果你看到这条通知，说明通知功能一切正常',
  'notif.test_context': '测试通知 · 点击关闭',
  'notif.match': '发现 {n} 条新福利',
  'notif.aggregate_context': '共 {n} 条匹配 · {m} 个类别',
};

const EN = {
  'popup.scan': 'Scan',
  'popup.notify': 'Notify',
  'popup.scanning': 'Scanning…',
  'popup.done': 'Done',
  'popup.failed': 'Failed',
  'popup.recent': 'Recent',
  'popup.new_topics': 'New Topics',
  'popup.new_activity': 'Latest Activity',
  'popup.no_matches': 'No matches yet',
  'popup.load_failed': 'Load failed',
  'popup.just_now': 'just now',
  'popup.min_ago': '{n}m ago',
  'popup.hour_ago': '{n}h ago',
  'popup.rules': '{n} rule(s)',
  'popup.expand': 'Expand',
  'popup.collapse': 'Collapse',
  'popup.notif_on': 'Notifications on',
  'popup.notif_off': 'Notifications off',
  'popup.test_ok': 'Test notification sent',
  'popup.test_fail': 'Test notification failed',
  'popup.notif_guide': 'Notifications not showing? Check',
  'popup.notif_settings_link': 'extension notification settings',
  'popup.notif_chrome_blocked': 'Chrome blocked notifications. Go to',
  'popup.notif_chrome_link': 'Chrome notification settings → allow',
  'popup.auto_remove_on': 'Burn after open: On (remove from list on click)',
  'popup.auto_remove_off': 'Burn after open: Off',

  'options.title': 'linux.done – Settings',
  'options.save': 'Save',
  'options.saved': 'Saved',
  'options.no_rules': 'No rules yet',
  'options.add_rule': 'Add Rule',
  'options.rule_name': 'Rule name',
  'options.rule_placeholder': 'Rule {n}',

  'rule.category': 'Category',
  'rule.tags': 'Tags',
  'rule.keywords': 'Keywords',
  'rule.blocked_words': 'Muted',
  'rule.add_blocked_word': 'Add muted word',
  'rule.search_tags': 'Search tags…',
  'rule.add_keyword': 'Add keyword',
  'rule.loading': 'Loading…',

  'setting.notifications': 'Notifications',
  'setting.notif_enabled': 'Enabled',
  'setting.cooldown': 'Cooldown',
  'setting.cooldown_hint': 'Minimum gap between notifications from the same rule',
  'setting.aggregate': 'Aggregate',
  'setting.aggregate_hint': 'Group multiple matches into one notification',
  'setting.dnd': 'Do Not Disturb',
  'setting.cooldown_off': 'Off',
  'setting.cooldown_5': '5 min',
  'setting.cooldown_10': '10 min',
  'setting.cooldown_30': '30 min',
  'setting.cooldown_1h': '1 hr',
  'setting.cooldown_day': 'Daily digest',

  'dnd.off': 'Off',
  'dnd.to': 'to',

  'card.rules_desc': 'All dimensions are optional. Leave empty to match every new post.<br>Within each dimension: OR. Between dimensions: AND.',

  // Options — retention
  'setting.retention': 'Storage',
  'setting.retention_hours': 'Keep period',
  'setting.retention_hours_hint': 'Auto-remove posts older than this',
  'setting.retention_max': 'Max items',
  'setting.retention_max_hint': 'Keep at most this many items',
  'setting.retention_note': 'Default: 48 hours / 200 items — enough for ~2 days of browsing at twice-daily checks, ~200KB storage.',

  'content.copy_link': 'Copy Link',
  'content.copied': 'Copied',
  'content.copy_failed': 'Failed',
  'content.copy_code': 'Copy',
  'content.expired': 'Expired',

  'notif.view_post': 'View Post',
  'notif.mark_read': 'Mark Read',
  'notif.test_title': 'linux.done Test Notification',
  'notif.test_message': 'If you see this notification, everything works!',
  'notif.test_context': 'Test · Click to close',
  'notif.match': '{n} new deals found',
  'notif.aggregate_context': '{n} matches · {m} categories',
};

const LANG_MAP = { zh: ZH, en: EN };

let currentLang = 'zh';
let strings = ZH;

/**
 * 初始化 i18n
 * @param {string} [lang] — 强制指定语言，不传则自动检测
 */
export async function initI18n(lang) {
  if (lang) {
    currentLang = lang;
  } else if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    try {
      const result = await chrome.storage.sync.get('settings');
      const s = result.settings || {};
      if (s.language) currentLang = s.language;
    } catch { /* fallback */ }
  }

  // 浏览器语言检测
  if (!lang && navigator?.language) {
    const browserLang = navigator.language.startsWith('zh') ? 'zh' : 'en';
    // 优先用设置，没有设置才用浏览器
    if (!currentLang) currentLang = browserLang;
  }

  if (!currentLang) currentLang = 'zh';
  strings = LANG_MAP[currentLang] || ZH;
}

/**
 * 翻译
 * @param {string} key — 点号路径键名
 * @param {object} [params] — 插值参数，如 { n: 5 }
 * @returns {string}
 */
export function t(key, params) {
  let s = strings[key];
  if (s === undefined) {
    // fallback 到英文
    s = EN[key];
    if (s === undefined) return key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, v);
    }
  }
  return s;
}

/**
 * 获取当前语言
 */
export function getLang() {
  return currentLang;
}

/**
 * 切换语言
 */
export async function setLang(lang) {
  currentLang = lang;
  strings = LANG_MAP[lang] || ZH;
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    try {
      const result = await chrome.storage.sync.get('settings');
      const s = result.settings || {};
      s.language = lang;
      await chrome.storage.sync.set({ settings: s });
    } catch { /* ignore */ }
  }
}
