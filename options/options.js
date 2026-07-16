/**
 * linux.done - Options
 */

import { getSettings, updateSettings, getRules, addRule, updateRule, removeRule, toggleRule } from '../lib/storage.js';
import { initI18n, t, getLang, setLang } from '../lib/i18n.js';
import { sendPageView } from '../lib/analytics.js';

let catTree = null;
let catTreeLoading = false;
let allTags = [];
let tagsLoaded = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initI18n();
    // 并行加载类别树和标签
    await Promise.allSettled([loadCategoryTree(), loadAllTags()]);
    await loadSettings();
    await loadRules();
    applyStaticI18n();
    sendPageView('options');

    byId('addRuleBtn').addEventListener('click', handleAddRule);
    byId('saveBtn').addEventListener('click', handleSave);
    byId('languageSelect').addEventListener('change', handleLanguageChange);
    // 打赏图片加载失败时隐藏，内联 onerror 被 CSP 拦截
    document.querySelectorAll('[data-donate-img]').forEach(el => { el.addEventListener('error', function() { this.style.display = 'none'; }); });
    // 打赏卡片切换：笑脸按钮点击展开/收起
    bindDonateToggle();

    byId('dndStart').addEventListener('change', (e) => {
      const end = byId('dndEnd');
      if (e.target.value && !end.value) {
        end.value = parseInt(e.target.value) < 12 ? '8' : '7';
      }
    });
  } finally {
    // 结束时隐藏加载遮罩
    hideLoadingOverlay();
  }
});

/** 隐藏全页面加载遮罩 */
function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 400);
  }
}

function byId(id) { return document.getElementById(id); }

/** 给静态 HTML 元素注入翻译 */
function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    if (el.tagName === 'OPTION') {
      el.textContent = t(el.dataset.i18n);
    } else {
      el.textContent = t(el.dataset.i18n);
    }
  });
  document.title = t('options.title');
}

// ============================================================
// Category tree + tags
// ============================================================

async function loadCategoryTree() {
  if (catTree) return catTree;
  if (catTreeLoading) return;
  catTreeLoading = true;
  try {
    const resp = await withTimeout(
      chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' }),
      8000
    );
    if (resp?.success) catTree = resp.tree;
  } catch { catTree = null; }
  return catTree;
}

async function loadAllTags() {
  if (tagsLoaded) return;
  try {
    const resp = await withTimeout(
      chrome.runtime.sendMessage({ type: 'GET_TAGS' }),
      8000
    );
    if (resp?.success) { allTags = resp.tags; tagsLoaded = true; }
  } catch {}
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function getTagChipsHtml(selectedTags, filter = '') {
  const filtered = filter
    ? allTags.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
    : allTags;

  return filtered.map(t => {
    const active = selectedTags.includes(t.name);
    return `<span class="tag-chip ${active ? 'active' : ''}" data-tag="${esc(t.name)}">${esc(t.name)}${t.topicCount ? ` <span class="tag-count">${t.topicCount}</span>` : ''}</span>`;
  }).join('');
}

// ============================================================
// Rules render
// ============================================================

async function loadRules() {
  const rules = await getRules();
  const list = byId('ruleList');
  if (!rules || rules.length === 0) {
    list.innerHTML = `<div class="empty-state">${t('options.no_rules')}</div>`;
    return;
  }
  list.innerHTML = rules.map(r => renderRuleCard(r)).join('');
  rules.forEach(r => bindRuleEvents(r));
}

function renderRuleCard(rule) {
  const id = rule.id;
  const name = esc(rule.name || t('options.rule_name'));
  const selectedCats = rule.categories || [];
  const selectedTags = rule.tags || [];

  const catChips = (catTree?.tree || [])
    .map(c => {
      const active = selectedCats.includes(c.name);
      return `<span class="cat-chip ${active ? 'active' : ''}" data-cat="${esc(c.name)}">${esc(c.name)}</span>`;
    }).join('') || '<span class="skeleton-chip"></span><span class="skeleton-chip skeleton-chip-wide"></span><span class="skeleton-chip"></span>';

  const kwChips = (rule.keywords || []).map(kw =>
    `<span class="keyword-chip">${esc(kw)}<span class="kw-remove" data-kw="${esc(kw)}">✕</span></span>`
  ).join('');

  const bwChips = (rule.blockedWords || []).map(bw =>
    `<span class="keyword-chip">${esc(bw)}<span class="bw-remove" data-bw="${esc(bw)}">✕</span></span>`
  ).join('');

  return `
    <div class="rule-card" data-rule-id="${id}">
      <div class="rule-card-header">
        <input class="rule-name-input" value="${name}" placeholder="${t('options.rule_name')}">
        <div class="rule-card-actions">
          <label class="switch">
            <input type="checkbox" class="rule-toggle" ${rule.enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <button class="btn btn-danger rule-delete-btn">✕</button>
        </div>
      </div>

      <div class="rule-section">
        <span class="rule-section-label">${t('rule.category')}</span>
        <div class="chip-group">${catChips}</div>
      </div>

      <div class="rule-section">
        <span class="rule-section-label">${t('rule.tags')}</span>
        <div class="tag-panel" data-rule-id="${id}">
          <div class="tag-search-row">
            <input class="tag-filter-input" type="text" placeholder="${t('rule.search_tags')}" autocomplete="off">
          </div>
          <div class="tag-chips-container">
            ${allTags.length > 0 ? getTagChipsHtml(selectedTags) : '<span class="skeleton-chip"></span><span class="skeleton-chip skeleton-chip-wide"></span><span class="skeleton-chip"></span>'}
          </div>
        </div>
      </div>

      <div class="rule-section">
        <span class="rule-section-label">${t('rule.keywords')}</span>
        <div class="keyword-row">
          ${kwChips}
          <input class="keyword-input-inline" placeholder="${t('rule.add_keyword')}" maxlength="30">
          <button class="add-kw-btn">+</button>
        </div>
      </div>

      <div class="rule-section">
        <span class="rule-section-label">${t('rule.blocked_words')}</span>
        <div class="keyword-row">
          ${bwChips}
          <input class="keyword-input-inline" placeholder="${t('rule.add_blocked_word')}" maxlength="30">
          <button class="add-kw-btn">+</button>
        </div>
      </div>
    </div>
  `;
}

function bindRuleEvents(rule) {
  const el = document.querySelector(`.rule-card[data-rule-id="${rule.id}"]`);
  if (!el) return;

  el.querySelector('.rule-name-input')?.addEventListener('change', () => {
    updateRule(rule.id, { name: el.querySelector('.rule-name-input').value || t('options.rule_name') }).catch(() => {});
  });

  el.querySelectorAll('.cat-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      chip.classList.toggle('active');
      const cats = [];
      el.querySelectorAll('.cat-chip.active').forEach(c => cats.push(c.dataset.cat));
      await updateRule(rule.id, { categories: cats });
    });
  });

  const panel = el.querySelector('.tag-panel');
  const filterInput = panel?.querySelector('.tag-filter-input');
  const tagsContainer = panel?.querySelector('.tag-chips-container');

  async function refreshTagPanel() {
    const r = (await getRules()).find(x => x.id === rule.id);
    const selected = r?.tags || [];
    const filter = filterInput?.value || '';
    if (tagsContainer) tagsContainer.innerHTML = getTagChipsHtml(selected, filter);
  }

  if (panel) {
    panel.addEventListener('click', async (e) => {
      const chip = e.target.closest('.tag-chip:not(.tag-chip-remove)');
      if (!chip || e.target.closest('.tag-chip-remove')) return;
      const tagName = chip.dataset.tag;
      const r = (await getRules()).find(x => x.id === rule.id);
      if (!r) return;
      const cur = r.tags || [];
      const idx = cur.indexOf(tagName);
      await updateRule(rule.id, { tags: idx >= 0 ? cur.filter(t => t !== tagName) : [...cur, tagName] });
      await refreshTagPanel();
    });

    if (filterInput) {
      filterInput.addEventListener('input', async () => {
        const r = (await getRules()).find(x => x.id === rule.id);
        if (tagsContainer) tagsContainer.innerHTML = getTagChipsHtml(r?.tags || [], filterInput.value);
      });
    }

    panel.addEventListener('click', async (e) => {
      const removeBtn = e.target.closest('.tag-chip-remove');
      if (!removeBtn) return;
      const tag = removeBtn.dataset.tag;
      const r = (await getRules()).find(x => x.id === rule.id);
      if (!r) return;
      await updateRule(rule.id, { tags: (r.tags || []).filter(t => t !== tag) });
      await refreshTagPanel();
    });
  }

  el.querySelector('.rule-delete-btn')?.addEventListener('click', async () => {
    await removeRule(rule.id);
    await loadRules();
  });

  el.querySelector('.rule-toggle')?.addEventListener('change', async () => {
    await toggleRule(rule.id);
  });

  const kwInput = el.querySelector('.keyword-input-inline');
  const addBtn = el.querySelector('.add-kw-btn');

  async function addKw() {
    const kw = kwInput.value.trim();
    if (!kw) return;
    const r = await getRules();
    const ru = r.find(x => x.id === rule.id);
    if (!ru) return;
    await updateRule(rule.id, { keywords: [...(ru.keywords || []), kw] });
    kwInput.value = '';
    await loadRules();
  }

  kwInput?.addEventListener('keydown', e => { if (e.key === 'Enter') addKw(); });
  addBtn?.addEventListener('click', addKw);

  el.querySelectorAll('.kw-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const kw = btn.dataset.kw;
      const r = await getRules();
      const ru = r.find(x => x.id === rule.id);
      if (!ru) return;
      await updateRule(rule.id, { keywords: (ru.keywords || []).filter(k => k !== kw) });
      await loadRules();
    });
  });

  // — 屏蔽词 — (复用关键词的 class，用索引区分)
  const bwInput = el.querySelectorAll('.keyword-input-inline')[1];
  const addBwBtn = el.querySelectorAll('.add-kw-btn')[1];

  async function addBw() {
    const bw = bwInput.value.trim();
    if (!bw) return;
    const r = await getRules();
    const ru = r.find(x => x.id === rule.id);
    if (!ru) return;
    await updateRule(rule.id, { blockedWords: [...(ru.blockedWords || []), bw] });
    bwInput.value = '';
    await loadRules();
  }

  bwInput?.addEventListener('keydown', e => { if (e.key === 'Enter') addBw(); });
  addBwBtn?.addEventListener('click', addBw);

  el.querySelectorAll('.bw-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bw = btn.dataset.bw;
      const r = await getRules();
      const ru = r.find(x => x.id === rule.id);
      if (!ru) return;
      await updateRule(rule.id, { blockedWords: (ru.blockedWords || []).filter(w => w !== bw) });
      await loadRules();
    });
  });
}

// ============================================================
// Add rule
// ============================================================

async function handleAddRule() {
  const count = (await getRules()).length + 1;
  const name = t('options.rule_placeholder', { n: count });
  const defaultCat = catTree?.tree?.[0]?.name || '福利羊毛';
  await addRule(name, [defaultCat], [], [], []);
  await loadRules();
}

// ============================================================
// Settings
// ============================================================

async function loadSettings() {
  const s = await getSettings();
  byId('languageSelect').value = s.language || 'zh';
  byId('notificationsEnabled').checked = s.notificationsEnabled !== false;
  byId('ruleCooldown').value = s.ruleCooldownMinutes ?? 10;
  byId('aggregateNotifications').checked = s.aggregateNotifications !== false;
  byId('dndStart').value = s.doNotDisturbStart ?? '';
  byId('dndEnd').value = s.doNotDisturbEnd ?? '';
  byId('matchedRetentionHours').value = s.matchedRetentionHours ?? 48;
  byId('matchedRetentionMax').value = s.matchedRetentionMax ?? 200;
}

async function handleSave() {
  const newSettings = {
    notificationsEnabled: byId('notificationsEnabled').checked,
    ruleCooldownMinutes: parseInt(byId('ruleCooldown').value),
    aggregateNotifications: byId('aggregateNotifications').checked,
    doNotDisturbStart: byId('dndStart').value ? parseInt(byId('dndStart').value) : null,
    doNotDisturbEnd: byId('dndEnd').value ? parseInt(byId('dndEnd').value) : null,
    matchedRetentionHours: parseInt(byId('matchedRetentionHours').value) || 48,
    matchedRetentionMax: parseInt(byId('matchedRetentionMax').value) || 200,
  };
  await updateSettings(newSettings);
  try { await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS' }); } catch {}
  showSaveStatus(t('options.saved'), 'success');
}

async function handleLanguageChange() {
  const lang = byId('languageSelect').value;
  await setLang(lang);
  // Re-translate the page
  applyStaticI18n();
  await loadRules();
  showSaveStatus(t('options.saved'), 'success');
}

function showSaveStatus(msg, type = 'success') {
  const el = byId('saveStatus');
  el.textContent = msg;
  el.className = `save-status show ${type}`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function esc(t) {
  if (!t) return '';
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

/** 打赏卡片切换：笑脸按钮点击展开，✕ / 点击外部 / 再次点击笑脸收起 */
function bindDonateToggle() {
  const toggleBtn = byId('donateToggle');
  const card = byId('donateCard');
  const closeBtn = byId('donateClose');
  if (!toggleBtn || !card) return;

  function showCard() {
    card.style.display = '';
    card.style.animation = 'none';
    card.offsetHeight; // force reflow
    card.style.animation = '';
  }

  function hideCard() {
    card.style.display = 'none';
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    card.style.display !== 'none' ? hideCard() : showCard();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideCard();
    });
  }

  // 点击卡片外部任意位置关闭
  document.addEventListener('click', (e) => {
    if (card.style.display === 'none') return;
    if (!card.contains(e.target) && e.target !== toggleBtn) {
      hideCard();
    }
  });
}
