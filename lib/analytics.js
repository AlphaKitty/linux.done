/**
 * Google Analytics 4 — Measurement Protocol 封装
 *
 * MV3 不允许从 extension_pages 加载外部脚本（如 gtag.js），
 * 因此使用 GA4 Measurement Protocol 直接通过 fetch 发送事件。
 *
 * 使用方式：
 *   1. 在 Google Analytics 4 管理后台：
 *      管理 > 数据流 > 选择你的数据流 > Measurement Protocol API secrets
 *      → 创建一个新的 Secret，复制其值填入下方的 API_SECRET
 *   2. 如需关闭统计，将 API_SECRET 设为空字符串即可
 */

const MEASUREMENT_ID = 'G-XXH76PC1RV';
const API_SECRET = ''; // TODO: 请从 GA4 后台获取 API Secret 填入此处

const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`;

let _clientId = null;

/**
 * 获取或生成持久化 Client ID
 */
async function getClientId() {
  if (_clientId) return _clientId;
  try {
    const result = await chrome.storage.local.get('ga_client_id');
    if (result.ga_client_id) {
      _clientId = result.ga_client_id;
      return _clientId;
    }
  } catch {}
  _clientId = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await chrome.storage.local.set({ ga_client_id: _clientId });
  } catch {}
  return _clientId;
}

/**
 * 发送事件到 GA4
 * @param {string} name - 事件名称（如 page_view, scan_completed）
 * @param {object} params - 附加参数
 */
export async function sendEvent(name, params = {}) {
  if (!API_SECRET) return; // 未配置 API Secret 时不发送
  try {
    const clientId = await getClientId();
    await fetch(GA_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        events: [{ name, params }],
      }),
    });
  } catch {
    // 统计失败不应影响任何功能
  }
}

/**
 * 发送页面浏览事件（适用于 popup / options）
 * @param {string} page - 页面名称，如 'popup'、'options'
 * @param {object} extra - 额外参数
 */
export async function sendPageView(page, extra = {}) {
  await sendEvent('page_view', {
    page_title: `linux.done - ${page}`,
    page_location: `chrome-extension://${chrome.runtime.id}/${page}.html`,
    ...extra,
  });
}
