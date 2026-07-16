/**
 * linux.done — Theme module
 *
 * 读取用户主题偏好，解析为实际主题（system → matchMedia），
 * 设置 document.documentElement.dataset.theme，并监听系统主题变化。
 *
 * 用法：
 *   import { initTheme } from '../lib/theme.js';
 *   await initTheme();
 */

const THEME_KEY = 'theme';
const ATTR = 'data-theme';

/**
 * 从 storage 读取主题设置，解析为实际主题值
 * @returns {Promise<'light'|'dark'>}
 */
export async function resolveTheme() {
  let setting = 'system';
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      const result = await chrome.storage.sync.get('settings');
      setting = result.settings?.theme || 'system';
    }
  } catch { /* fallback to system */ }

  if (setting === 'light') return 'light';
  if (setting === 'dark') return 'dark';

  // system: 跟随 OS
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 应用主题到 document.documentElement
 */
function applyTheme(theme) {
  document.documentElement.setAttribute(ATTR, theme);
}

/**
 * 初始化主题：应用当前主题 + 注册系统变化监听
 * 在 popup / options 页面的 DOMContentLoaded 早期调用
 */
export async function initTheme() {
  const theme = await resolveTheme();
  applyTheme(theme);

  // 监听系统主题切换（仅对后续变化生效）
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', async () => {
    // 仅在用户设置为 system 时响应
    let setting = 'system';
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const result = await chrome.storage.sync.get('settings');
        setting = result.settings?.theme || 'system';
      }
    } catch {}
    if (setting === 'system') {
      applyTheme(mq.matches ? 'dark' : 'light');
    }
  });
}
