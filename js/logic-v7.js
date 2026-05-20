import {
  COMPARATORS, CONDITIONS, ACTIONS,
  conditionLabel, actionLabel, ruleLabel, evaluate, makeRule, defaultRules
} from './logic-engine-v7.js';

const RULE_KEY = 'alb-v7-rules';
const STATE_KEY = 'alb-v6-state';

const conditionSelect = document.getElementById('condition-select');
const comparatorSelect = document.getElementById('comparator-select');
const valueInput = document.getElementById('value-input');
const actionSelect = document.getElementById('action-select');
const comparatorField = document.getElementById('comparator-field');
const valueField = document.getElementById('value-field');
const addButton = document.getElementById('add-rule-button');
const resetButton = document.getElementById('reset-rules-button');
const rulesList = document.getElementById('rules-list');
const editorStatus = document.getElementById('editor-status');
const previewList = document.getElementById('preview-list');

let rules = [];
let dragId = null;

const PREVIEW_SCENARIOS = [
  { name: 'Low HP, enemy near', snap: { hpPct: 25, enemyDist: 3, enemyCount: 2, combo: 0, chain: 0, fever: false, skillReady: true, enemyAdjacent: false } },
  { name: 'Enemy adjacent', snap: { hpPct: 80, enemyDist: 1, enemyCount: 3, combo: 2, chain: 1, fever: false, skillReady: false, enemyAdjacent: true } },
  { name: 'High chain, skill up', snap: { hpPct: 70, enemyDist: 1, enemyCount: 1, combo: 9, chain: 9, fever: false, skillReady: true, enemyAdjacent: true } },
  { name: 'FEVER active', snap: { hpPct: 60, enemyDist: 2, enemyCount: 2, combo: 12, chain: 12, fever: true, skillReady: true, enemyAdjacent: false } }
];

function loadRules() {
  const raw = localStorage.getItem(RULE_KEY);
  if (raw === null) return defaultRules();
  try {
    const parsed = JSON.parse(raw);
    // Respect a saved array as-is, even when empty.
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // corrupt data — fall through to defaults
  }
  return defaultRules();
}

function persist() {
  localStorage.setItem(RULE_KEY, JSON.stringify(rules));
}

function loadRuleStats() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).ruleStats || null;
  } catch (e) {
    return null;
  }
}

function fillSelect(select, entries) {
  select.innerHTML = '';
  entries.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
}

function syncFormFields() {
  const cond = CONDITIONS[conditionSelect.value];
  const numeric = !!cond?.numeric;
  comparatorField.hidden = !numeric;
  valueField.hidden = !numeric;
}

function setStatus(message) {
  editorStatus.textContent = message;
}

function renderRules() {
  rulesList.innerHTML = '';
  const stats = loadRuleStats();
  if (rules.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'logic-rule-item empty';
    empty.textContent = 'No rules — the build will just advance.';
    rulesList.append(empty);
    return;
  }
  rules.forEach((rule, index) => {
    const li = document.createElement('li');
    li.className = 'logic-rule-item';
    li.draggable = true;
    li.dataset.id = rule.id;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '::';

    const order = document.createElement('span');
    order.className = 'rule-order';
    order.textContent = `${index + 1}`;

    const text = document.createElement('span');
    text.className = 'rule-text';
    text.innerHTML = `<strong>${conditionLabel(rule)}</strong> &rarr; ${actionLabel(rule)}`;

    li.append(handle, order, text);

    if (stats && stats[rule.id]) {
      const badge = document.createElement('span');
      badge.className = 'fire-count';
      badge.textContent = `${stats[rule.id]}x`;
      li.append(badge);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'rule-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      rules = rules.filter(r => r.id !== rule.id);
      persist();
      renderRules();
      renderPreview();
      setStatus('Rule removed.');
    });
    li.append(remove);

    li.addEventListener('dragstart', () => {
      dragId = rule.id;
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => {
      dragId = null;
      li.classList.remove('dragging');
      rulesList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', event => event.preventDefault());
    li.addEventListener('dragenter', () => {
      if (dragId && dragId !== rule.id) li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', event => {
      event.preventDefault();
      li.classList.remove('drag-over');
      if (!dragId || dragId === rule.id) return;
      const from = rules.findIndex(r => r.id === dragId);
      const to = rules.findIndex(r => r.id === rule.id);
      if (from === -1 || to === -1) return;
      const [moved] = rules.splice(from, 1);
      rules.splice(to, 0, moved);
      persist();
      renderRules();
      renderPreview();
      setStatus('Priority reordered.');
    });

    rulesList.append(li);
  });
}

function renderPreview() {
  previewList.innerHTML = '';
  PREVIEW_SCENARIOS.forEach(scenario => {
    const matched = evaluate(rules, scenario.snap);
    const li = document.createElement('li');
    li.innerHTML = matched
      ? `<strong>${scenario.name}:</strong> ${ruleLabel(matched)}`
      : `<strong>${scenario.name}:</strong> <em>no rule matches — advance</em>`;
    previewList.append(li);
  });
}

function addRule() {
  const condition = conditionSelect.value;
  const cond = CONDITIONS[condition];
  const action = actionSelect.value;
  let comparator = 'gte';
  let value = 0;
  if (cond?.numeric) {
    comparator = comparatorSelect.value;
    value = Number(valueInput.value);
    if (!Number.isFinite(value)) {
      setStatus('Enter a numeric value for this condition.');
      return;
    }
  }
  rules.push(makeRule(condition, comparator, value, action));
  persist();
  renderRules();
  renderPreview();
  setStatus('Rule added.');
}

function init() {
  fillSelect(conditionSelect, Object.entries(CONDITIONS).map(([k, v]) => [k, v.label]));
  fillSelect(comparatorSelect, Object.entries(COMPARATORS).map(([k, v]) => [k, v.label]));
  fillSelect(actionSelect, Object.entries(ACTIONS).map(([k, v]) => [k, v.label]));
  conditionSelect.value = 'hp_pct';
  comparatorSelect.value = 'lt';
  valueInput.value = '40';
  actionSelect.value = 'use_skill';
  syncFormFields();

  conditionSelect.addEventListener('change', syncFormFields);
  addButton.addEventListener('click', addRule);
  resetButton.addEventListener('click', () => {
    rules = defaultRules();
    persist();
    renderRules();
    renderPreview();
    setStatus('Rules reset to defaults.');
  });

  rules = loadRules();
  renderRules();
  renderPreview();
  setStatus('Changes are saved automatically.');
}

init();
