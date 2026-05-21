// logic-engine-v11.js
// v11 logic: a priority list of rules. Each turn the engine checks rules
// top to bottom and the first rule whose condition is true decides the action.
// v11 adds per-slot skill actions so a rule can target a specific loadout slot.

export const COMPARATORS = {
  lt: { label: '<', test: (a, b) => a < b },
  lte: { label: '<=', test: (a, b) => a <= b },
  gt: { label: '>', test: (a, b) => a > b },
  gte: { label: '>=', test: (a, b) => a >= b },
  eq: { label: '=', test: (a, b) => a === b }
};

// numeric conditions compare a snapshot field against the rule value;
// boolean conditions are true when the snapshot field is true.
export const CONDITIONS = {
  hp_pct: { label: 'HP %', numeric: true, unit: '%', field: 'hpPct' },
  enemy_dist: { label: 'Nearest enemy distance', numeric: true, unit: ' tiles', field: 'enemyDist' },
  enemy_count: { label: 'Enemies on floor', numeric: true, unit: '', field: 'enemyCount' },
  combo: { label: 'Combo', numeric: true, unit: '', field: 'combo' },
  chain: { label: 'Chain', numeric: true, unit: '', field: 'chain' },
  enemy_adjacent: { label: 'Enemy adjacent', numeric: false, field: 'enemyAdjacent' },
  skill_ready: { label: 'Skill ready', numeric: false, field: 'skillReady' },
  fever: { label: 'FEVER active', numeric: false, field: 'fever' },
  always: { label: 'Always', numeric: false, field: null }
};

// use_skill fires the first ready skill in the loadout; use_skill_1/2/3
// target a specific loadout slot. All fall back gracefully when the chosen
// skill is on cooldown or has no valid target.
export const ACTIONS = {
  use_skill: { label: 'Use any ready skill' },
  use_skill_1: { label: 'Use skill 1' },
  use_skill_2: { label: 'Use skill 2' },
  use_skill_3: { label: 'Use skill 3' },
  basic_attack: { label: 'Basic attack' },
  advance: { label: 'Advance' },
  hold: { label: 'Hold position' }
};

export function conditionLabel(rule) {
  const c = CONDITIONS[rule.condition];
  if (!c) return 'Unknown';
  if (rule.condition === 'always') return 'Always';
  if (!c.numeric) return c.label;
  const cmp = COMPARATORS[rule.comparator]?.label || '?';
  return `${c.label} ${cmp} ${rule.value}${c.unit || ''}`;
}

export function actionLabel(rule) {
  return ACTIONS[rule.action]?.label || rule.action;
}

export function ruleLabel(rule) {
  return `${conditionLabel(rule)} -> ${actionLabel(rule)}`;
}

export function ruleMatches(rule, snapshot) {
  const c = CONDITIONS[rule.condition];
  if (!c) return false;
  if (rule.condition === 'always') return true;
  const actual = snapshot[c.field];
  if (!c.numeric) return actual === true;
  const cmp = COMPARATORS[rule.comparator];
  if (!cmp || !Number.isFinite(actual) || !Number.isFinite(rule.value)) return false;
  return cmp.test(actual, rule.value);
}

// First matching rule wins; returns the rule object or null.
export function evaluate(rules, snapshot) {
  for (const rule of rules) {
    if (ruleMatches(rule, snapshot)) return rule;
  }
  return null;
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : 'r' + Math.random().toString(36).slice(2);
}

export function makeRule(condition, comparator, value, action) {
  return { id: newId(), condition, comparator, value, action };
}

// Attack-oriented baseline: use the skill whenever it is off cooldown,
// otherwise trade blows with adjacent enemies, otherwise close the gap.
// Ids are fixed so the default set is identical across calls — the game
// rebuilds it every turn and rule-fire stats are keyed by id.
export function defaultRules() {
  return [
    { id: 'default-skill-ready', condition: 'skill_ready', comparator: 'gte', value: 0, action: 'use_skill' },
    { id: 'default-enemy-adjacent', condition: 'enemy_adjacent', comparator: 'gte', value: 0, action: 'basic_attack' },
    { id: 'default-advance', condition: 'always', comparator: 'gte', value: 0, action: 'advance' }
  ];
}
