import {
  COMPARATORS, CONDITIONS, ACTIONS,
  conditionLabel, actionLabel, ruleLabel, evaluate, makeRule, defaultRules,
  loadRuleSets, saveRuleSets
} from './logic-engine-v12.js';

const STATE_KEY = 'alb-v6-state';

const rulesetSelect = document.getElementById('ruleset-select');
const setNameInput = document.getElementById('set-name');
const newSetBtn = document.getElementById('new-set-btn');
const deleteSetBtn = document.getElementById('delete-set-btn');
const conditionsArea = document.getElementById('conditions-area');
const addConditionBtn = document.getElementById('add-condition-btn');
const combinatorSelect = document.getElementById('combinator-select');
const actionSelect = document.getElementById('action-select');
const addButton = document.getElementById('add-rule-button');
const resetButton = document.getElementById('reset-rules-button');
const rulesList = document.getElementById('rules-list');
const editorStatus = document.getElementById('editor-status');
const previewList = document.getElementById('preview-list');

// { active: <name>, sets: { <name>: [rules] } }
let ruleData = { active: 'Default', sets: { Default: defaultRules() } };
let enemyTypes = [];
let dragId = null;

// Preview snapshots include the v12 condition fields so compound rules
// using floor / enemy HP / enemy type still resolve here.
const PREVIEW_SCENARIOS = [
  { name: 'Low HP, enemy near', snap: { hpPct: 25, enemyDist: 3, enemyCount: 2, enemyHpPct: 80, enemyType: 'goblin', floor: 2, combo: 0, chain: 0, fever: false, skillReady: true, enemyAdjacent: false } },
  { name: 'Enemy adjacent', snap: { hpPct: 80, enemyDist: 1, enemyCount: 3, enemyHpPct: 55, enemyType: 'orc', floor: 3, combo: 2, chain: 1, fever: false, skillReady: false, enemyAdjacent: true } },
  { name: 'Weak enemy, skill up', snap: { hpPct: 70, enemyDist: 1, enemyCount: 1, enemyHpPct: 18, enemyType: 'slime', floor: 4, combo: 9, chain: 9, fever: false, skillReady: true, enemyAdjacent: true } },
  { name: 'FEVER active', snap: { hpPct: 60, enemyDist: 2, enemyCount: 2, enemyHpPct: 90, enemyType: 'mimic', floor: 5, combo: 12, chain: 12, fever: true, skillReady: true, enemyAdjacent: false } }
];

function activeRuleList() {
  return ruleData.sets[ruleData.active] || [];
}

function persist() {
  saveRuleSets(ruleData);
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

function setStatus(message) {
  editorStatus.textContent = message;
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

// --- Rule sets ---------------------------------------------------------

function renderRulesetControls() {
  rulesetSelect.innerHTML = '';
  Object.keys(ruleData.sets).forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === ruleData.active) option.selected = true;
    rulesetSelect.append(option);
  });
  setNameInput.value = ruleData.active;
}

function switchSet(name) {
  if (!ruleData.sets[name]) return;
  ruleData.active = name;
  persist();
  renderAll();
  setStatus(`Switched to "${name}".`);
}

function newSet() {
  let n = 2;
  while (ruleData.sets['Set ' + n]) n += 1;
  const name = 'Set ' + n;
  ruleData.sets[name] = defaultRules();
  ruleData.active = name;
  persist();
  renderAll();
  setStatus(`Created "${name}".`);
}

function deleteSet() {
  if (Object.keys(ruleData.sets).length <= 1) {
    setStatus('Cannot delete the only rule set.');
    return;
  }
  delete ruleData.sets[ruleData.active];
  ruleData.active = Object.keys(ruleData.sets)[0];
  persist();
  renderAll();
  setStatus('Rule set deleted.');
}

function renameSet(raw) {
  const newName = (raw || '').trim();
  if (!newName || newName === ruleData.active) {
    setNameInput.value = ruleData.active;
    return;
  }
  if (ruleData.sets[newName]) {
    setStatus('A rule set with that name already exists.');
    setNameInput.value = ruleData.active;
    return;
  }
  const rules = ruleData.sets[ruleData.active];
  delete ruleData.sets[ruleData.active];
  ruleData.sets[newName] = rules;
  ruleData.active = newName;
  persist();
  renderAll();
  setStatus(`Renamed to "${newName}".`);
}

// --- Add Rule form: compound conditions --------------------------------

function syncRow(row) {
  const cond = CONDITIONS[row.querySelector('.cond-field').value] || {};
  row.querySelector('.cond-cmp').hidden = !cond.numeric;
  row.querySelector('.cond-val').hidden = !cond.numeric;
  row.querySelector('.cond-enemy').hidden = !cond.select;
}

function addConditionRow(preset) {
  const row = document.createElement('div');
  row.className = 'cond-row';

  const condSel = document.createElement('select');
  condSel.className = 'cond-field';
  Object.entries(CONDITIONS).forEach(([k, v]) => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = v.label;
    condSel.append(o);
  });

  const cmpSel = document.createElement('select');
  cmpSel.className = 'cond-cmp';
  Object.entries(COMPARATORS).forEach(([k, v]) => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = v.label;
    cmpSel.append(o);
  });

  const valInput = document.createElement('input');
  valInput.className = 'cond-val';
  valInput.type = 'number';
  valInput.value = '40';

  const enemySel = document.createElement('select');
  enemySel.className = 'cond-enemy';
  enemyTypes.forEach(e => {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.name;
    enemySel.append(o);
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'cond-remove';
  remove.textContent = '×';
  remove.title = 'Remove condition';
  remove.addEventListener('click', () => {
    if (conditionsArea.querySelectorAll('.cond-row').length > 1) row.remove();
  });

  row.append(condSel, cmpSel, valInput, enemySel, remove);
  condSel.addEventListener('change', () => syncRow(row));

  if (preset) {
    condSel.value = preset.condition || 'hp_pct';
    if (preset.comparator) cmpSel.value = preset.comparator;
    if (CONDITIONS[condSel.value]?.select) {
      if (preset.value) enemySel.value = preset.value;
    } else if (typeof preset.value === 'number') {
      valInput.value = String(preset.value);
    }
  } else {
    condSel.value = 'hp_pct';
    cmpSel.value = 'lt';
  }

  conditionsArea.append(row);
  syncRow(row);
  return row;
}

// Read the form's condition rows. Returns null on an invalid numeric value.
function readConditions() {
  const rows = Array.from(conditionsArea.querySelectorAll('.cond-row'));
  const conds = [];
  for (const row of rows) {
    const condition = row.querySelector('.cond-field').value;
    const c = CONDITIONS[condition];
    if (!c) continue;
    if (c.select) {
      conds.push({ condition, comparator: 'eq', value: row.querySelector('.cond-enemy').value });
    } else if (c.numeric) {
      const value = Number(row.querySelector('.cond-val').value);
      if (!Number.isFinite(value)) return null;
      conds.push({ condition, comparator: row.querySelector('.cond-cmp').value, value });
    } else {
      conds.push({ condition, comparator: 'gte', value: 0 });
    }
  }
  return conds;
}

function addRule() {
  const conds = readConditions();
  if (conds === null) {
    setStatus('Enter a numeric value for each numeric condition.');
    return;
  }
  if (conds.length === 0) {
    setStatus('Add at least one condition.');
    return;
  }
  activeRuleList().push(makeRule(conds, combinatorSelect.value, actionSelect.value));
  persist();
  renderRules();
  renderPreview();
  setStatus('Rule added.');
}

// --- Rule list ---------------------------------------------------------

function renderRules() {
  rulesList.innerHTML = '';
  const rules = activeRuleList();
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
      const list = activeRuleList();
      const idx = list.findIndex(r => r.id === rule.id);
      if (idx >= 0) list.splice(idx, 1);
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
      const list = activeRuleList();
      const from = list.findIndex(r => r.id === dragId);
      const to = list.findIndex(r => r.id === rule.id);
      if (from === -1 || to === -1) return;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
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
    const matched = evaluate(activeRuleList(), scenario.snap);
    const li = document.createElement('li');
    li.innerHTML = matched
      ? `<strong>${scenario.name}:</strong> ${ruleLabel(matched)}`
      : `<strong>${scenario.name}:</strong> <em>no rule matches — advance</em>`;
    previewList.append(li);
  });
}

function renderAll() {
  renderRulesetControls();
  renderRules();
  renderPreview();
}

async function loadEnemyTypes() {
  try {
    const dataBase = new URL('../data/', import.meta.url);
    const enemies = await fetch(new URL('enemies.json', dataBase)).then(r => r.json());
    enemyTypes = enemies.map(e => ({ id: e.id, name: e.name }));
  } catch (e) {
    enemyTypes = [];
  }
}

async function init() {
  await loadEnemyTypes();
  fillSelect(actionSelect, Object.entries(ACTIONS).map(([k, v]) => [k, v.label]));
  actionSelect.value = 'use_skill';

  ruleData = loadRuleSets();

  addConditionRow();

  rulesetSelect.addEventListener('change', () => switchSet(rulesetSelect.value));
  setNameInput.addEventListener('change', () => renameSet(setNameInput.value));
  newSetBtn.addEventListener('click', newSet);
  deleteSetBtn.addEventListener('click', deleteSet);
  addConditionBtn.addEventListener('click', () => addConditionRow());
  addButton.addEventListener('click', addRule);
  resetButton.addEventListener('click', () => {
    ruleData.sets[ruleData.active] = defaultRules();
    persist();
    renderRules();
    renderPreview();
    setStatus('Rules reset to defaults.');
  });

  renderAll();
  setStatus('Changes are saved automatically.');
}

init();
