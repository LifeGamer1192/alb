// logic-engine-v12.js
// v12 logic: a priority list of rules. Each turn the engine checks rules
// top to bottom and the first rule whose condition is true decides the action.
// v12 additions:
//  - compound conditions: a rule holds conditions[] joined by AND / OR
//  - new conditions: floor number, nearest-enemy HP %, nearest-enemy type
//  - new actions: retreat, attack weakest / strongest
//  - named rule sets the player can save and switch between
// Legacy flat rules ({condition,comparator,value,action}) still evaluate.

export const COMPARATORS = {
  lt: { label: '<', test: (a, b) => a < b },
  lte: { label: '<=', test: (a, b) => a <= b },
  gt: { label: '>', test: (a, b) => a > b },
  gte: { label: '>=', test: (a, b) => a >= b },
  eq: { label: '=', test: (a, b) => a === b }
};

// numeric conditions compare a snapshot field against the rule value;
// boolean conditions are true when the snapshot field is true;
// select conditions match the snapshot field against a chosen value.
export const CONDITIONS = {
  hp_pct: { label: 'HP %', numeric: true, unit: '%', field: 'hpPct' },
  enemy_dist: { label: 'Nearest enemy distance', numeric: true, unit: ' tiles', field: 'enemyDist' },
  enemy_count: { label: 'Enemies on floor', numeric: true, unit: '', field: 'enemyCount' },
  enemy_hp_pct: { label: 'Nearest enemy HP %', numeric: true, unit: '%', field: 'enemyHpPct' },
  floor: { label: 'Floor number', numeric: true, unit: '', field: 'floor' },
  combo: { label: 'Combo', numeric: true, unit: '', field: 'combo' },
  chain: { label: 'Chain', numeric: true, unit: '', field: 'chain' },
  enemy_type: { label: 'Nearest enemy type', select: true, field: 'enemyType' },
  enemy_adjacent: { label: 'Enemy adjacent', numeric: false, field: 'enemyAdjacent' },
  skill_ready: { label: 'Skill ready', numeric: false, field: 'skillReady' },
  fever: { label: 'FEVER active', numeric: false, field: 'fever' },
  always: { label: 'Always', numeric: false, field: null }
};

export const ACTIONS = {
  use_skill: { label: 'Use any ready skill' },
  use_skill_1: { label: 'Use skill 1' },
  use_skill_2: { label: 'Use skill 2' },
  use_skill_3: { label: 'Use skill 3' },
  basic_attack: { label: 'Basic attack' },
  attack_weakest: { label: 'Attack weakest enemy' },
  attack_strongest: { label: 'Attack strongest enemy' },
  retreat: { label: 'Retreat' },
  advance: { label: 'Advance' },
  hold: { label: 'Hold position' }
};

// A rule's conditions, normalised: v12 rules carry conditions[]; a legacy
// flat rule is wrapped into a single-element list.
function ruleConditions(rule) {
  if (Array.isArray(rule.conditions) && rule.conditions.length) return rule.conditions;
  return [{ condition: rule.condition, comparator: rule.comparator, value: rule.value }];
}

function conditionText(cond) {
  const c = CONDITIONS[cond.condition];
  if (!c) return 'Unknown';
  if (cond.condition === 'always') return 'Always';
  if (c.select) return `${c.label} = ${cond.value}`;
  if (!c.numeric) return c.label;
  const cmp = COMPARATORS[cond.comparator]?.label || '?';
  return `${c.label} ${cmp} ${cond.value}${c.unit || ''}`;
}

export function conditionLabel(rule) {
  const conds = ruleConditions(rule);
  const joiner = rule.combinator === 'or' ? ' OR ' : ' AND ';
  return conds.map(conditionText).join(joiner);
}

export function actionLabel(rule) {
  return ACTIONS[rule.action]?.label || rule.action;
}

export function ruleLabel(rule) {
  return `${conditionLabel(rule)} -> ${actionLabel(rule)}`;
}

function conditionMatches(cond, snapshot) {
  const c = CONDITIONS[cond.condition];
  if (!c) return false;
  if (cond.condition === 'always') return true;
  const actual = snapshot[c.field];
  if (c.select) return actual != null && actual === cond.value;
  if (!c.numeric) return actual === true;
  const cmp = COMPARATORS[cond.comparator];
  if (!cmp || !Number.isFinite(actual) || !Number.isFinite(cond.value)) return false;
  return cmp.test(actual, cond.value);
}

export function ruleMatches(rule, snapshot) {
  const conds = ruleConditions(rule);
  if (conds.length === 0) return false;
  if (rule.combinator === 'or') return conds.some(c => conditionMatches(c, snapshot));
  return conds.every(c => conditionMatches(c, snapshot));
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

// v12 rules are compound: conditions[] joined by `combinator`.
export function makeRule(conditions, combinator, action) {
  return { id: newId(), combinator: combinator === 'or' ? 'or' : 'and', conditions, action };
}

// Attack-oriented baseline: use a skill whenever one is off cooldown,
// otherwise trade blows with adjacent enemies, otherwise close the gap.
export function defaultRules() {
  return [
    { id: 'default-skill-ready', combinator: 'and', conditions: [{ condition: 'skill_ready', comparator: 'gte', value: 0 }], action: 'use_skill' },
    { id: 'default-enemy-adjacent', combinator: 'and', conditions: [{ condition: 'enemy_adjacent', comparator: 'gte', value: 0 }], action: 'basic_attack' },
    { id: 'default-advance', combinator: 'and', conditions: [{ condition: 'always', comparator: 'gte', value: 0 }], action: 'advance' }
  ];
}

// --- Named rule sets ---------------------------------------------------
// Stored under one key as { active: <name>, sets: { <name>: [rules] } }.
// On first run a legacy flat ruleset (alb-v7-rules) is migrated in.
const RULESET_KEY = 'alb-v12-rulesets';
const LEGACY_RULE_KEY = 'alb-v7-rules';

export function loadRuleSets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RULESET_KEY));
    if (parsed && parsed.sets && typeof parsed.sets === 'object') {
      const names = Object.keys(parsed.sets);
      if (names.length) {
        const active = parsed.sets[parsed.active] ? parsed.active : names[0];
        return { active, sets: parsed.sets };
      }
    }
  } catch (e) {
    // corrupt — fall through to migration / defaults
  }
  let base = defaultRules();
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_RULE_KEY));
    if (Array.isArray(legacy)) base = legacy;
  } catch (e) {
    // no legacy rules — keep defaults
  }
  return { active: 'Default', sets: { Default: base } };
}

export function saveRuleSets(data) {
  try {
    localStorage.setItem(RULESET_KEY, JSON.stringify(data));
  } catch (e) {
    // storage unavailable — skip
  }
}

// The rules of the currently active set — what the game runs each turn.
export function activeRules() {
  const data = loadRuleSets();
  return data.sets[data.active] || [];
}
