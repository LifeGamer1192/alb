import { LogicEngine } from './logic-engine.js';

const RULE_STORAGE_KEY = 'alb-v4-rules';
const conditionSelect = document.getElementById('condition-select');
const conditionValue = document.getElementById('condition-value');
const actionSelect = document.getElementById('action-select');
const addRuleButton = document.getElementById('add-rule-button');
const saveRulesButton = document.getElementById('save-rules-button');
const resetRulesButton = document.getElementById('reset-rules-button');
const rulesList = document.getElementById('rules-list');
const previewText = document.getElementById('preview-text');
const previewLowHp = document.getElementById('preview-low-hp');
const previewNearby = document.getElementById('preview-nearby');
const previewNormal = document.getElementById('preview-normal');

let rules = [];

function createDefaultRules() {
  return [
    { id: crypto.randomUUID(), condition: 'hp_below', value: 50, action: 'heal' },
    { id: crypto.randomUUID(), condition: 'enemy_nearby', value: 2, action: 'attack' },
    { id: crypto.randomUUID(), condition: 'always', value: 0, action: 'move' }
  ];
}

function loadRules() {
  const raw = localStorage.getItem(RULE_STORAGE_KEY);
  if (!raw) {
    rules = createDefaultRules();
    return;
  }
  try {
    rules = JSON.parse(raw);
  } catch (error) {
    rules = createDefaultRules();
  }
}

function saveRules() {
  localStorage.setItem(RULE_STORAGE_KEY, JSON.stringify(rules));
  renderRules();
}

function removeRule(ruleId) {
  rules = rules.filter(rule => rule.id !== ruleId);
  saveRules();
}

function renderRules() {
  rulesList.innerHTML = '';
  if (rules.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'No rules defined yet.';
    rulesList.appendChild(emptyItem);
    return;
  }

  rules.forEach(rule => {
    const li = document.createElement('li');
    const conditionLabel = {
      hp_below: `HP below ${rule.value}%`,
      enemy_nearby: `Enemy within ${rule.value} tiles`,
      always: 'Always'
    }[rule.condition] || 'Unknown condition';

    const actionLabel = {
      heal: 'Use Heal',
      attack: 'Attack Nearest',
      move: 'Move Forward'
    }[rule.action] || rule.action;

    li.textContent = `${conditionLabel} → ${actionLabel}`;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeRule(rule.id));
    li.appendChild(removeButton);
    rulesList.appendChild(li);
  });
}

function addRule() {
  const condition = conditionSelect.value;
  const value = Number(conditionValue.value);
  const action = actionSelect.value;

  if (condition !== 'always' && (Number.isNaN(value) || value <= 0)) {
    previewText.textContent = 'Enter a valid numeric value for the condition.';
    return;
  }

  rules.push({
    id: crypto.randomUUID(),
    condition,
    value: condition === 'always' ? 0 : value,
    action
  });
  saveRules();
  previewText.textContent = 'Rule added successfully.';
}

function preview(state) {
  const result = LogicEngine.evaluate(rules, state);
  previewText.textContent = result ? `Selected action: ${result}` : 'No matching action found.';
}

addRuleButton.addEventListener('click', addRule);
saveRulesButton.addEventListener('click', () => {
  saveRules();
  previewText.textContent = 'Rules saved.';
});
resetRulesButton.addEventListener('click', () => {
  rules = createDefaultRules();
  saveRules();
  previewText.textContent = 'Rules reset to defaults.';
});
previewLowHp.addEventListener('click', () => preview({ hp: 30, enemyDistance: 5 }));
previewNearby.addEventListener('click', () => preview({ hp: 80, enemyDistance: 1 }));
previewNormal.addEventListener('click', () => preview({ hp: 80, enemyDistance: 5 }));

loadRules();
renderRules();
preview({ hp: 80, enemyDistance: 5 });
