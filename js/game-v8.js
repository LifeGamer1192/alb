import { DungeonV6 } from './dungeon-v6.js';
import { formatLogEntry } from './v6-shared.js';
import * as LogicV7 from './logic-engine-v7.js';
import * as EffectsV8 from './effects-v8.js';

const STATE_KEY = 'alb-v6-state';
const RULE_KEY = 'alb-v7-rules';
const BUILD_STORAGE_KEY = 'alb-character-build';
const FEVER_CHAIN_THRESHOLD = 10;
const FEVER_PRIMED_THRESHOLD = 5;
const MAX_LOG_ENTRIES = 60;
const TOTAL_FLOORS = 5;
const FLOOR_WIDTH = 18;
const FLOOR_HEIGHT = 12;

const AUTO_SPEED_MS = { 1: 800, 2: 400, 4: 200, 10: 80 };

const mapRoot = document.getElementById('map-root');
const mapWrap = document.querySelector('.map-wrap');
const fxLayer = document.getElementById('fx-layer');
const infoRoot = document.getElementById('map-info');
const logicInfoRoot = document.getElementById('logic-info');
const generateButton = document.getElementById('generate-button');
const simulateButton = document.getElementById('simulate-button');
const autoRunPanel = document.getElementById('auto-run-controls');

let state = null;
let enemyTemplates = [];
let itemMap = new Map();
let enemyMap = new Map();
let autoRunHandle = null;

// Transient visual events for the current turn (not persisted).
let pendingEffects = [];
// Last rendered combo/chain — used to pulse the counter when it rises.
let shownCombo = 0;
let shownChain = 0;

function loadStored(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function loadRules() {
  const raw = localStorage.getItem(RULE_KEY);
  if (raw === null) return LogicV7.defaultRules();
  try {
    const parsed = JSON.parse(raw);
    // A saved array is respected as-is, even when empty (the player
    // explicitly cleared their logic). Only missing or corrupt data
    // falls back to the default ruleset.
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // corrupt data — fall through to defaults
  }
  return LogicV7.defaultRules();
}

function saveState() {
  if (!state) return;
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function clearState() {
  localStorage.removeItem(STATE_KEY);
}

function logEvent(message, kind = '') {
  if (!state) return;
  const last = state.log[0];
  if (last && last.message === message && last.kind === kind) {
    last.count = (last.count || 1) + 1;
    last.lastTurn = state.turn;
    return;
  }
  state.log.unshift({ message, kind, turn: state.turn });
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.length = MAX_LOG_ENTRIES;
  }
}

async function loadData() {
  const dataBase = new URL('../data/', import.meta.url);
  const [items, enemies] = await Promise.all([
    fetch(new URL('items.json', dataBase)).then(r => r.json()),
    fetch(new URL('enemies.json', dataBase)).then(r => r.json())
  ]);
  itemMap = new Map(items.map(it => [it.id, it]));
  enemyTemplates = enemies;
  enemyMap = new Map(enemies.map(e => [e.id, e]));
  return { items, enemies };
}

function basePassiveFromSkill(skill) {
  const passive = { hp: 0, atk: 0, def: 0, spd: 0, chainBonus: 0, comboBonus: 0, comboThreshold: 0 };
  if (skill?.type === 'passive' && skill.passive) {
    const p = skill.passive;
    if (p.stat && typeof p.amount === 'number') {
      passive[p.stat] = (passive[p.stat] || 0) + p.amount;
    }
    if (typeof p.defPenalty === 'number') passive.def -= p.defPenalty;
    if (typeof p.chainBonus === 'number') passive.chainBonus = p.chainBonus;
    if (typeof p.comboBonus === 'number') {
      passive.comboBonus = p.comboBonus;
      passive.comboThreshold = p.comboThreshold ?? 0;
    }
  }
  return passive;
}

function equipmentBonus(equipment) {
  const bonus = { hp: 0, atk: 0, def: 0, spd: 0 };
  for (const slot of ['weapon', 'armor', 'accessory']) {
    const itemId = equipment[slot];
    if (!itemId) continue;
    const item = itemMap.get(itemId);
    if (!item || !item.stats) continue;
    bonus.hp += item.stats.hp || 0;
    bonus.atk += item.stats.atk || 0;
    bonus.def += item.stats.def || 0;
    bonus.spd += item.stats.spd || 0;
  }
  return bonus;
}

function effectiveStats(stateRef = state) {
  const base = stateRef.battle.baseStats;
  const passive = stateRef.battle.passive || { hp: 0, atk: 0, def: 0, spd: 0 };
  const eq = equipmentBonus(stateRef.equipment);
  return {
    hp: base.hp + (passive.hp || 0) + eq.hp,
    atk: base.atk + (passive.atk || 0) + eq.atk,
    def: base.def + (passive.def || 0) + eq.def,
    spd: base.spd + (passive.spd || 0) + eq.spd
  };
}

function effectiveAtkWithBuffs() {
  let atk = effectiveStats().atk;
  state.battle.buffs.forEach(b => {
    if (b.stat === 'atk') atk += b.amount;
  });
  return atk;
}

function effectiveDefWithBuffs() {
  let def = effectiveStats().def;
  state.battle.buffs.forEach(b => {
    if (b.stat === 'def') def += b.amount;
  });
  return def;
}

function createInitialBattle(skill, stats) {
  const passive = basePassiveFromSkill(skill);
  const baseStats = { ...stats };
  const max = baseStats.hp + (passive.hp || 0);
  return {
    skill: skill || null,
    baseStats,
    maxHp: max,
    currentHp: max,
    cooldown: 0,
    combo: 0,
    chain: 0,
    fever: false,
    feverPrimedTurns: 0,
    shieldAmount: 0,
    shieldTurns: 0,
    counterPercent: 0,
    counterTurns: 0,
    buffs: [],
    enemyEffects: {},
    regen: null,
    passive,
    lastRule: null
  };
}

function generateFloor(floorIndex) {
  const enemyCount = 3 + floorIndex;
  const treasureCount = 1 + (floorIndex >= 2 ? 1 : 0);
  return DungeonV6.createFloor({
    width: FLOOR_WIDTH,
    height: FLOOR_HEIGHT,
    roomTarget: 5,
    enemyCount,
    treasureCount,
    floorIndex,
    enemyTypes: enemyTemplates,
    itemPool: Array.from(itemMap.values()),
    placeStairs: floorIndex < TOTAL_FLOORS - 1
  });
}

function startNewRun() {
  const savedBuild = loadStored(BUILD_STORAGE_KEY);
  const baseStats = savedBuild?.stats || { hp: 100, atk: 16, def: 10, spd: 5 };
  const skill = savedBuild?.skill || null;
  const battle = createInitialBattle(skill, baseStats);
  const floor = generateFloor(0);
  state = {
    build: savedBuild || null,
    currentFloorIndex: 0,
    totalFloors: TOTAL_FLOORS,
    floor,
    battle,
    inventory: [],
    equipment: { weapon: null, armor: null, accessory: null },
    log: [],
    turn: 1,
    autoRun: { active: false, speed: 1 },
    ruleStats: {},
    runStats: { totalDamage: 0, maxCombo: 0, maxChain: 0 },
    runCompleted: false,
    runFailed: false
  };
  // sync maxHp / currentHp with equipment baseline (no equipment yet so identical)
  const eff = effectiveStats();
  state.battle.maxHp = eff.hp;
  state.battle.currentHp = eff.hp;
  pendingEffects = [];
  shownCombo = 0;
  shownChain = 0;
  logEvent(`Run started — Floor ${floor.floorIndex + 1}/${TOTAL_FLOORS}.`, 'evt-floor');
  saveState();
}

function loadOrInitState() {
  const stored = loadStored(STATE_KEY);
  if (stored && stored.floor && stored.battle) {
    state = stored;
    if (!state.equipment) state.equipment = { weapon: null, armor: null, accessory: null };
    if (!state.inventory) state.inventory = [];
    if (!state.autoRun) state.autoRun = { active: false, speed: 1 };
    if (!state.ruleStats) state.ruleStats = {};
    if (!state.runStats) state.runStats = { totalDamage: 0, maxCombo: 0, maxChain: 0 };
    return;
  }
  startNewRun();
}

function posKey(p) {
  return `${p.x},${p.y}`;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function ensureEnemyBucket(enemyId) {
  if (!state.battle.enemyEffects[enemyId]) {
    state.battle.enemyEffects[enemyId] = {};
  }
  return state.battle.enemyEffects[enemyId];
}

function applyDamageToEnemy(enemy, rawDamage, label = 'hit') {
  const bucket = state.battle.enemyEffects[enemy.id] || {};
  const debuffDef = bucket.defReduction || 0;
  const pierce = bucket.armorPierce || 0;
  const effDef = Math.max(0, (enemy.def || 0) - debuffDef);
  const pierced = pierce > 0 ? effDef * (1 - pierce) : effDef;
  let damage = Math.max(1, Math.round(rawDamage - pierced));
  let multiplier = 1;
  const passive = state.battle.passive;
  if (passive.chainBonus && state.battle.chain > 0) {
    multiplier += passive.chainBonus * state.battle.chain;
  }
  if (passive.comboBonus && state.battle.combo >= passive.comboThreshold) {
    multiplier += passive.comboBonus;
  }
  if (state.battle.fever) multiplier += 0.5;
  damage = Math.round(damage * multiplier);

  enemy.hp -= damage;
  state.battle.combo += 1;
  state.battle.didOffenseThisTurn = true;
  state.runStats.totalDamage += damage;
  if (state.battle.combo > state.runStats.maxCombo) {
    state.runStats.maxCombo = state.battle.combo;
  }
  const isCrit = multiplier >= 1.5;
  pendingEffects.push({
    kind: 'damage',
    x: enemy.x,
    y: enemy.y,
    amount: damage,
    crit: isCrit,
    fever: state.battle.fever,
    defeated: enemy.hp <= 0
  });
  if (enemy.hp <= 0) {
    state.battle.chain += 1;
    state.battle.defeatedThisTurn += 1;
    if (state.battle.chain > state.runStats.maxChain) {
      state.runStats.maxChain = state.battle.chain;
    }
    logEvent(`${label} defeated ${enemy.name} for ${damage} dmg (combo ${state.battle.combo}, chain ${state.battle.chain})`, 'evt-defeat');
    rollDrops(enemy);
    return { defeated: true, damage };
  }
  logEvent(`${label} hit ${enemy.name} for ${damage} dmg${isCrit ? ' [CRIT]' : ''} (combo ${state.battle.combo})`, isCrit ? 'evt-crit' : '');
  return { defeated: false, damage };
}

function rollDrops(enemy) {
  const table = enemy.dropTable || [];
  table.forEach(entry => {
    if (Math.random() < (entry.chance || 0)) {
      const item = itemMap.get(entry.itemId);
      if (item) {
        state.inventory.push(item.id);
        logEvent(`${enemy.name} dropped ${item.name}.`, 'evt-loot');
      }
    }
  });
}

function basicAttack(enemy) {
  return applyDamageToEnemy(enemy, effectiveAtkWithBuffs(), 'Basic');
}

function useOffensiveSkill(primaryEnemy) {
  const skill = state.battle.skill;
  const scaling = skill.scaling || {};
  const eff = effectiveStats();
  const statBonus = (scaling.atk || 0) * eff.atk + (scaling.spd || 0) * eff.spd;
  const base = (skill.power || 0) + statBonus;
  const hits = Math.max(1, skill.hits || 1);

  if (skill.armorPierce) {
    ensureEnemyBucket(primaryEnemy.id).armorPierce = skill.armorPierce;
  }
  for (let h = 0; h < hits; h++) {
    if (primaryEnemy.hp <= 0) break;
    applyDamageToEnemy(primaryEnemy, base, skill.name);
  }
  if (skill.armorPierce) {
    delete state.battle.enemyEffects[primaryEnemy.id]?.armorPierce;
  }
  if (skill.chainTargets) {
    const extras = state.floor.enemies
      .filter(e => e !== primaryEnemy && e.hp > 0)
      .sort((a, b) => manhattan(primaryEnemy, a) - manhattan(primaryEnemy, b))
      .slice(0, skill.chainTargets);
    extras.forEach(e => applyDamageToEnemy(e, base * 0.5, `${skill.name} arc`));
  }
  if (skill.splash) {
    state.floor.enemies
      .filter(e => e !== primaryEnemy && e.hp > 0 && manhattan(e, primaryEnemy) <= 1)
      .forEach(e => applyDamageToEnemy(e, base * skill.splash, `${skill.name} splash`));
  }
  if (skill.effect?.kind === 'dot' || skill.effect?.kind === 'slow') {
    const ef = skill.effect;
    const bucket = ensureEnemyBucket(primaryEnemy.id);
    if (ef.kind === 'dot') bucket.dot = { amount: ef.amount, duration: ef.duration };
    else bucket.slow = { amount: ef.amount, duration: ef.duration };
  }
  state.battle.cooldown = skill.cooldown || 0;
}

function useDefensiveSkill() {
  const skill = state.battle.skill;
  const ef = skill.effect || {};
  switch (ef.kind) {
    case 'shield':
      state.battle.shieldAmount = ef.amount;
      state.battle.shieldTurns = ef.duration;
      logEvent(`${skill.name}: shield ${ef.amount} for ${ef.duration}t.`, '');
      break;
    case 'counter':
      state.battle.counterPercent = ef.amount;
      state.battle.counterTurns = ef.duration;
      logEvent(`${skill.name}: counter primed (${Math.round(ef.amount * 100)}%).`, '');
      break;
    case 'buff':
      state.battle.buffs.push({ stat: ef.stat, amount: ef.amount, duration: ef.duration });
      logEvent(`${skill.name}: +${ef.amount} ${ef.stat.toUpperCase()} for ${ef.duration}t.`, '');
      break;
    default:
      logEvent(`${skill.name} activated.`, '');
  }
  state.battle.cooldown = skill.cooldown || 0;
}

function useSupportSkill(primaryEnemy) {
  const skill = state.battle.skill;
  const ef = skill.effect || {};
  switch (ef.kind) {
    case 'heal':
      state.battle.currentHp = Math.min(state.battle.maxHp, state.battle.currentHp + ef.amount);
      pendingEffects.push({ kind: 'heal', amount: ef.amount });
      logEvent(`${skill.name}: restored ${ef.amount} HP.`, '');
      break;
    case 'regen':
      state.battle.regen = { amount: ef.amount, duration: ef.duration };
      logEvent(`${skill.name}: regen ${ef.amount}/turn for ${ef.duration}t.`, '');
      break;
    case 'buff':
      state.battle.buffs.push({ stat: ef.stat, amount: ef.amount, duration: ef.duration });
      logEvent(`${skill.name}: +${ef.amount} ${ef.stat.toUpperCase()} for ${ef.duration}t.`, '');
      break;
    case 'debuff':
      if (primaryEnemy) {
        const bucket = ensureEnemyBucket(primaryEnemy.id);
        if (ef.stat === 'def') bucket.defReduction = (bucket.defReduction || 0) + ef.amount;
        bucket.debuffTurns = Math.max(bucket.debuffTurns || 0, ef.duration);
        logEvent(`${skill.name}: -${ef.amount} ${ef.stat?.toUpperCase()} on ${primaryEnemy.name}.`, '');
      }
      break;
    case 'feverPrime':
      state.battle.feverPrimedTurns = ef.duration;
      logEvent(`${skill.name}: FEVER threshold lowered for ${ef.duration}t.`, 'evt-fever');
      break;
    default:
      logEvent(`${skill.name} activated.`, '');
  }
  state.battle.cooldown = skill.cooldown || 0;
}

function feverThreshold() {
  return state.battle.feverPrimedTurns > 0 ? FEVER_PRIMED_THRESHOLD : FEVER_CHAIN_THRESHOLD;
}

function maybeAutoDefend() {
  const skill = state.battle.skill;
  if (!skill || skill.type !== 'defense') return;
  if (state.battle.cooldown > 0) return;
  if (state.battle.shieldAmount > 0 || state.battle.counterTurns > 0) return;
  if (state.battle.buffs.some(b => b.stat === 'def')) return;
  const player = state.floor.player;
  const adjacent = state.floor.enemies.some(e => e.hp > 0 && manhattan(e, player) <= 1);
  if (!adjacent) return;
  useDefensiveSkill();
}

function refreshFever() {
  const t = feverThreshold();
  const was = state.battle.fever;
  state.battle.fever = state.battle.chain >= t;
  if (state.battle.fever && !was) {
    pendingEffects.push({ kind: 'fever' });
    logEvent(`FEVER! Chain ${state.battle.chain} — damage surges!`, 'evt-fever');
  } else if (!state.battle.fever && was) {
    logEvent('FEVER ended.', '');
  }
}

function tickStatuses() {
  state.battle.buffs = state.battle.buffs
    .map(b => ({ ...b, duration: b.duration - 1 }))
    .filter(b => b.duration > 0);
  if (state.battle.shieldTurns > 0) {
    state.battle.shieldTurns -= 1;
    if (state.battle.shieldTurns <= 0) state.battle.shieldAmount = 0;
  }
  if (state.battle.counterTurns > 0) {
    state.battle.counterTurns -= 1;
    if (state.battle.counterTurns <= 0) state.battle.counterPercent = 0;
  }
  if (state.battle.feverPrimedTurns > 0) state.battle.feverPrimedTurns -= 1;
  if (state.battle.regen) {
    state.battle.currentHp = Math.min(state.battle.maxHp, state.battle.currentHp + state.battle.regen.amount);
    pendingEffects.push({ kind: 'heal', amount: state.battle.regen.amount });
    logEvent(`Regen restored ${state.battle.regen.amount} HP.`, '');
    state.battle.regen.duration -= 1;
    if (state.battle.regen.duration <= 0) state.battle.regen = null;
  }
  Object.entries(state.battle.enemyEffects).forEach(([id, bucket]) => {
    if (bucket.slow) {
      bucket.slow.duration -= 1;
      if (bucket.slow.duration <= 0) delete bucket.slow;
    }
    if (bucket.dot) {
      bucket.dot.duration -= 1;
      if (bucket.dot.duration <= 0) delete bucket.dot;
    }
    if (bucket.debuffTurns) {
      bucket.debuffTurns -= 1;
      if (bucket.debuffTurns <= 0) {
        delete bucket.defReduction;
        delete bucket.debuffTurns;
      }
    }
    if (Object.keys(bucket).length === 0) {
      delete state.battle.enemyEffects[id];
    }
  });
}

function tickEnemyDots() {
  state.floor.enemies.forEach(enemy => {
    if (enemy.hp <= 0) return;
    const bucket = state.battle.enemyEffects[enemy.id];
    if (bucket?.dot) {
      enemy.hp -= bucket.dot.amount;
      pendingEffects.push({
        kind: 'damage',
        x: enemy.x,
        y: enemy.y,
        amount: bucket.dot.amount,
        crit: false,
        fever: false,
        defeated: enemy.hp <= 0
      });
      logEvent(`Poison ticked ${bucket.dot.amount} on ${enemy.name}.`, '');
      if (enemy.hp <= 0) {
        state.battle.chain += 1;
        state.battle.defeatedThisTurn += 1;
        logEvent(`${enemy.name} succumbed to poison.`, 'evt-defeat');
        rollDrops(enemy);
      }
    }
  });
}

function enemyRetaliation() {
  const player = state.floor.player;
  const def = effectiveDefWithBuffs();
  let totalDamage = 0;
  let counterTotal = 0;
  state.floor.enemies.forEach(enemy => {
    if (enemy.hp <= 0) return;
    if (manhattan(enemy, player) > 1) return;
    const bucket = state.battle.enemyEffects[enemy.id] || {};
    const slow = bucket.slow ? bucket.slow.amount : 0;
    const effectiveSpd = (enemy.spd ?? 4) - slow;
    if (effectiveSpd <= 0) return; // slowed enough to skip turn

    let damage = Math.max(1, (enemy.atk ?? 6) - def);
    if (state.battle.shieldAmount > 0) {
      const absorbed = Math.min(damage, state.battle.shieldAmount);
      damage -= absorbed;
      state.battle.shieldAmount -= absorbed;
      if (absorbed > 0) logEvent(`Shield absorbed ${absorbed} from ${enemy.name}.`, '');
    }
    if (state.battle.counterPercent > 0 && damage > 0) {
      const reflected = Math.round(damage * state.battle.counterPercent);
      enemy.hp -= reflected;
      counterTotal += reflected;
      pendingEffects.push({
        kind: 'damage',
        x: enemy.x,
        y: enemy.y,
        amount: reflected,
        crit: false,
        fever: false,
        defeated: enemy.hp <= 0
      });
      if (enemy.hp <= 0) {
        state.battle.chain += 1;
        state.battle.defeatedThisTurn += 1;
        logEvent(`Counter killed ${enemy.name} for ${reflected}.`, 'evt-defeat');
        rollDrops(enemy);
      }
    }
    if (damage > 0) {
      state.battle.currentHp -= damage;
      totalDamage += damage;
    }
  });
  if (totalDamage > 0) logEvent(`Enemies dealt ${totalDamage} damage.`, '');
  if (counterTotal > 0) logEvent(`Counter reflected ${counterTotal} total.`, '');
}

function pickupTreasure() {
  const player = state.floor.player;
  const idx = state.floor.items.findIndex(it => it.x === player.x && it.y === player.y);
  if (idx === -1) return;
  const drop = state.floor.items[idx];
  const item = itemMap.get(drop.itemId);
  if (item) {
    state.inventory.push(item.id);
    logEvent(`Picked up ${item.name}.`, 'evt-loot');
  }
  state.floor.items.splice(idx, 1);
  state.floor.tiles[player.y][player.x] = DungeonV6.TILE_FLOOR;
}

function checkStairs() {
  // Final floor has no stairs by design; completing it = clearing all enemies there.
  if (state.currentFloorIndex >= TOTAL_FLOORS - 1 && state.floor.enemies.length === 0) {
    state.runCompleted = true;
    logEvent('You cleared the dungeon!', 'evt-fever');
    saveState();
    stopAutoRun();
    return;
  }
  const stairs = state.floor.stairs;
  if (!stairs) return;
  if (state.floor.player.x !== stairs.x || state.floor.player.y !== stairs.y) return;
  if (state.currentFloorIndex >= TOTAL_FLOORS - 1) {
    state.runCompleted = true;
    logEvent('You cleared the dungeon!', 'evt-fever');
    saveState();
    stopAutoRun();
    return;
  }
  state.currentFloorIndex += 1;
  state.floor = generateFloor(state.currentFloorIndex);
  state.battle.combo = 0;
  state.battle.chain = 0;
  state.battle.fever = false;
  state.battle.enemyEffects = {};
  logEvent(`Descended to Floor ${state.currentFloorIndex + 1}/${TOTAL_FLOORS}.`, 'evt-floor');
}

// Snapshot of the things a logic rule can ask about this turn.
function buildSnapshot(pathResult) {
  const player = state.floor.player;
  const nearest = pathResult?.enemy || null;
  const dist = nearest ? manhattan(player, nearest) : Infinity;
  return {
    hpPct: state.battle.maxHp > 0
      ? Math.round((state.battle.currentHp / state.battle.maxHp) * 100)
      : 0,
    enemyDist: dist,
    enemyCount: state.floor.enemies.length,
    combo: state.battle.combo,
    chain: state.battle.chain,
    fever: !!state.battle.fever,
    skillReady: !!state.battle.skill && state.battle.cooldown <= 0,
    enemyAdjacent: dist <= 1
  };
}

// Translate a player-authored action into a concrete engine action.
// Falls back gracefully when the chosen action is not possible right now
// (e.g. "use skill" while on cooldown) so the build never stalls.
function resolveAction(action, pathResult) {
  const player = state.floor.player;
  const nearest = pathResult?.enemy || null;
  const nextStep = pathResult?.path?.[1];
  const adjacentEnemy = nearest && manhattan(player, nearest) <= 1 ? nearest : null;
  const stepIsEnemy = nextStep && state.floor.enemies.find(e => e.x === nextStep.x && e.y === nextStep.y);
  const skill = state.battle.skill;
  const cdReady = state.battle.cooldown <= 0;

  if (action === 'hold') return { kind: 'idle' };

  if (action === 'use_skill' && skill && cdReady) {
    if (skill.type === 'attack') {
      const ranged = skill.category === 'ranged' || skill.category === 'magic';
      if (ranged && nearest) return { kind: 'skill-attack', target: nearest };
      if (adjacentEnemy) return { kind: 'skill-attack', target: adjacentEnemy };
    } else if (skill.type === 'defense') {
      return { kind: 'defense' };
    } else if (skill.type === 'support') {
      return { kind: 'support', target: nearest };
    }
    // utility / passive skills, or no valid target — fall through to a hit.
  }

  if (action === 'use_skill' || action === 'basic_attack') {
    if (adjacentEnemy) return { kind: 'basic-attack', target: adjacentEnemy };
    if (stepIsEnemy) return { kind: 'basic-attack', target: stepIsEnemy };
    if (nextStep) return { kind: 'move', target: nextStep };
    return { kind: 'idle' };
  }

  // advance / default
  if (stepIsEnemy) return { kind: 'basic-attack', target: stepIsEnemy };
  if (nextStep) return { kind: 'move', target: nextStep };
  return { kind: 'idle' };
}

function pickAction(pathResult) {
  if (!state.floor.enemies.length) {
    return { kind: 'goto-stairs', ruleId: null, ruleLabel: 'No enemies — head for stairs' };
  }
  const snapshot = buildSnapshot(pathResult);
  const rules = loadRules();
  const matched = LogicV7.evaluate(rules, snapshot);
  const playerAction = matched ? matched.action : 'advance';
  const engineAction = resolveAction(playerAction, pathResult);
  engineAction.ruleId = matched ? matched.id : null;
  engineAction.ruleLabel = matched ? LogicV7.ruleLabel(matched) : 'Default — advance';
  return engineAction;
}

function executeAction(action, pathResult) {
  switch (action.kind) {
    case 'skill-attack': {
      useOffensiveSkill(action.target);
      return `Used ${state.battle.skill.name} on ${action.target.name}.`;
    }
    case 'basic-attack': {
      basicAttack(action.target);
      return `Basic attack on ${action.target.name}.`;
    }
    case 'defense':
      useDefensiveSkill();
      return `Defensive stance: ${state.battle.skill.name}.`;
    case 'support':
      useSupportSkill(action.target);
      return `Activated ${state.battle.skill.name}.`;
    case 'move': {
      state.floor.player = { x: action.target.x, y: action.target.y };
      return `Moved toward ${pathResult ? pathResult.enemy?.name || 'objective' : 'objective'}.`;
    }
    case 'goto-stairs': {
      // All enemies cleared — walk toward stairs
      if (!state.floor.stairs) return 'No stairs — clear ahead!';
      const path = DungeonV6.getPathTo(state.floor.player, state.floor.stairs, state.floor.tiles, state.floor.width, state.floor.height);
      if (path && path.length > 1) {
        state.floor.player = { x: path[1].x, y: path[1].y };
        return 'Moving toward stairs.';
      }
      return 'Awaiting stairs.';
    }
    default:
      return 'Idle.';
  }
}

function advanceTurn() {
  if (!state) return;
  if (state.runCompleted || state.runFailed) {
    stopAutoRun();
    return;
  }
  if (state.battle.currentHp <= 0) {
    state.runFailed = true;
    logEvent('You have fallen.', 'evt-defeat');
    stopAutoRun();
    return;
  }

  pendingEffects = [];
  state.battle.didOffenseThisTurn = false;
  state.battle.defeatedThisTurn = 0;

  if (state.battle.cooldown > 0) state.battle.cooldown -= 1;

  // Pre-action: defense skills auto-cast as a free side-action so they
  // don't block the main attack/move.
  maybeAutoDefend();

  const pathResult = state.floor.enemies.length
    ? DungeonV6.getNearestEnemyPath(state.floor.player, state.floor.enemies, state.floor.tiles, state.floor.width, state.floor.height)
    : null;

  const action = pickAction(pathResult);
  if (action.ruleId) {
    if (!state.ruleStats) state.ruleStats = {};
    state.ruleStats[action.ruleId] = (state.ruleStats[action.ruleId] || 0) + 1;
  }
  state.battle.lastRule = action.ruleLabel || null;
  const statusText = executeAction(action, pathResult);
  state.battle.lastStatus = statusText;

  state.floor.enemies = state.floor.enemies.filter(e => e.hp > 0);
  tickEnemyDots();
  state.floor.enemies = state.floor.enemies.filter(e => e.hp > 0);

  // Enemy AI passive (regen)
  if (state.floor.enemies.length) {
    state.floor.enemies.forEach(enemy => {
      if (enemy.aiHint === 'regen') {
        const template = enemyMap.get(enemy.type);
        if (template?.regen) {
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + template.regen);
        }
      }
    });
  }

  // Enemy retaliation
  if (state.floor.enemies.length) enemyRetaliation();

  // Pickup treasure if standing on one
  pickupTreasure();

  // Reset combo/chain if no offense / no defeat
  if (!state.battle.didOffenseThisTurn && state.battle.defeatedThisTurn === 0) {
    if (state.battle.combo !== 0) logEvent(`Combo reset (was ${state.battle.combo}).`, '');
    state.battle.combo = 0;
  }
  if (state.battle.defeatedThisTurn === 0) {
    if (state.battle.chain !== 0) logEvent(`Chain reset (was ${state.battle.chain}).`, '');
    state.battle.chain = 0;
  }

  tickStatuses();
  refreshFever();

  // Stairs check after movement
  checkStairs();

  if (state.battle.currentHp <= 0) {
    state.runFailed = true;
    logEvent('You were defeated.', 'evt-defeat');
    stopAutoRun();
  }

  state.turn += 1;
  saveState();
  renderAll();
}

function renderDungeon() {
  if (!mapRoot) return;
  mapRoot.innerHTML = '';
  mapRoot.style.gridTemplateColumns = `repeat(${state.floor.width}, 28px)`;
  const path = state.floor.enemies.length
    ? (DungeonV6.getNearestEnemyPath(state.floor.player, state.floor.enemies, state.floor.tiles, state.floor.width, state.floor.height)?.path || [])
    : (state.floor.stairs ? (DungeonV6.getPathTo(state.floor.player, state.floor.stairs, state.floor.tiles, state.floor.width, state.floor.height) || []) : []);
  const pathSet = new Set(path.map(posKey));

  for (let y = 0; y < state.floor.height; y++) {
    for (let x = 0; x < state.floor.width; x++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      const t = state.floor.tiles[y][x];
      const isPlayer = state.floor.player.x === x && state.floor.player.y === y;
      const enemy = !isPlayer ? state.floor.enemies.find(e => e.x === x && e.y === y) : null;
      const stairs = state.floor.stairs && state.floor.stairs.x === x && state.floor.stairs.y === y;
      const treasure = !stairs && state.floor.items.find(it => it.x === x && it.y === y);

      tile.classList.add(t === DungeonV6.TILE_WALL ? 'tile-wall' : 'tile-floor');
      if (pathSet.has(posKey({ x, y })) && t !== DungeonV6.TILE_WALL && !isPlayer && !enemy) {
        tile.classList.add('tile-path');
      }
      if (stairs && !isPlayer) {
        tile.classList.add('tile-stairs');
        tile.textContent = '>';
      } else if (treasure && !isPlayer && !enemy) {
        tile.classList.add('tile-treasure');
        tile.textContent = '?';
      }
      if (isPlayer) {
        tile.classList.add('tile-player');
        tile.textContent = 'P';
      } else if (enemy) {
        tile.classList.add('tile-enemy');
        tile.textContent = enemy.glyph || 'E';
      }
      mapRoot.appendChild(tile);
    }
  }
}

function renderInfo() {
  if (!infoRoot) return;
  const skill = state.battle.skill;
  const eff = effectiveStats();
  const skillLabel = skill ? `${skill.name} (${skill.category || skill.type})` : 'None';
  const cooldownLabel = skill?.cooldown ? `${state.battle.cooldown}/${skill.cooldown}` : '—';
  const buffs = state.battle.buffs.length
    ? state.battle.buffs.map(b => `+${b.amount} ${b.stat.toUpperCase()}(${b.duration})`).join(', ')
    : '—';
  const shieldText = state.battle.shieldAmount > 0 ? `${state.battle.shieldAmount} (${state.battle.shieldTurns}t)` : '—';
  const comboClass = state.battle.combo > 0 ? 'active' : '';
  const chainClass = state.battle.chain > 0 ? 'active' : '';
  const comboBump = state.battle.combo > shownCombo ? 'bump' : '';
  const chainBump = state.battle.chain > shownChain ? 'bump' : '';
  shownCombo = state.battle.combo;
  shownChain = state.battle.chain;
  const feverLine = state.battle.fever ? `<p class="fever-line">★ FEVER (threshold ${feverThreshold()})</p>` : '';
  const equipmentSummary = [
    state.equipment.weapon ? itemMap.get(state.equipment.weapon)?.name : null,
    state.equipment.armor ? itemMap.get(state.equipment.armor)?.name : null,
    state.equipment.accessory ? itemMap.get(state.equipment.accessory)?.name : null
  ].filter(Boolean).join(' / ') || 'None';

  const status = state.runCompleted
    ? 'Dungeon cleared!'
    : state.runFailed
    ? 'Run failed — restart.'
    : (state.battle.lastStatus || 'Ready.');

  infoRoot.innerHTML = `
    <p><strong>Status:</strong> ${status}</p>
    <p><strong>Floor:</strong> ${state.currentFloorIndex + 1} / ${TOTAL_FLOORS}</p>
    <p><strong>Turn:</strong> ${state.turn}</p>
    <p><strong>HP:</strong> ${Math.max(0, state.battle.currentHp)} / ${state.battle.maxHp}</p>
    <p><strong>Effective Stats:</strong> ATK ${eff.atk} · DEF ${eff.def} · SPD ${eff.spd}</p>
    <p><strong>Skill:</strong> ${skillLabel}</p>
    <p class="cooldown-line"><strong>Cooldown:</strong> ${cooldownLabel}</p>
    <p><strong>Shield:</strong> ${shieldText}</p>
    <p><strong>Buffs:</strong> ${buffs}</p>
    <p class="combo-line ${comboClass} ${comboBump}"><strong>Combo:</strong> <span class="counter-value">${state.battle.combo}</span></p>
    <p class="chain-line ${chainClass} ${chainBump}"><strong>Chain:</strong> <span class="counter-value">${state.battle.chain}</span> (FEVER at ${feverThreshold()})</p>
    ${feverLine}
    <p><strong>Equipment:</strong> ${equipmentSummary}</p>
    <p><strong>Inventory:</strong> ${state.inventory.length} items · <a href="inventory.html">open</a></p>
    <p><strong>Enemies on this floor:</strong> ${state.floor.enemies.length}</p>
    <p class="recent-log-head"><strong>Recent log</strong> · <a href="log.html">full log</a></p>
    <ul class="event-log compact">
      ${state.log.slice(0, 6).map(e => {
        const f = formatLogEntry(e);
        return `<li class="${e.kind}">[${f.turnLabel}] ${e.message}${f.countLabel}</li>`;
      }).join('')}
    </ul>
  `;
}

function renderLogicInfo() {
  if (!logicInfoRoot) return;
  const rules = loadRules();
  const stats = state.ruleStats || {};
  const lastRule = state.battle.lastRule;
  const totalFires = Object.values(stats).reduce((sum, n) => sum + n, 0);
  logicInfoRoot.innerHTML = `
    <h2>Logic</h2>
    <p><strong>Last rule fired:</strong> ${lastRule || '—'}</p>
    <ol class="logic-fire-list">
      ${rules.map(r => {
        const fired = stats[r.id] || 0;
        const share = totalFires > 0 ? Math.round((fired / totalFires) * 100) : 0;
        const isLast = LogicV7.ruleLabel(r) === lastRule;
        return `<li class="${isLast ? 'just-fired' : ''}">
          <span class="rule-text">${LogicV7.conditionLabel(r)} &rarr; ${LogicV7.actionLabel(r)}</span>
          <span class="fire-count">${fired}x (${share}%)</span>
        </li>`;
      }).join('')}
    </ol>
    <p><a href="logic.html">Edit logic →</a></p>
  `;
}

function renderAll() {
  renderDungeon();
  renderInfo();
  renderLogicInfo();
  renderAutoRunPanel();
  EffectsV8.setFeverActive(mapWrap, state.battle.fever);
  EffectsV8.playEffects(mapRoot, fxLayer, pendingEffects, state.floor.width, state.floor.player);
  pendingEffects = [];
}

function renderAutoRunPanel() {
  if (!autoRunPanel) return;
  const active = state.autoRun.active;
  const speed = state.autoRun.speed;
  autoRunPanel.innerHTML = `
    <span class="auto-label">Auto-Run:</span>
    <button data-speed="1" class="auto-speed ${speed === 1 ? 'selected' : ''}">1x</button>
    <button data-speed="2" class="auto-speed ${speed === 2 ? 'selected' : ''}">2x</button>
    <button data-speed="4" class="auto-speed ${speed === 4 ? 'selected' : ''}">4x</button>
    <button data-speed="10" class="auto-speed ${speed === 10 ? 'selected' : ''}">10x</button>
    <button id="auto-toggle" class="auto-toggle ${active ? 'on' : ''}">${active ? 'Pause' : 'Start'}</button>
  `;
  autoRunPanel.querySelectorAll('.auto-speed').forEach(btn => {
    btn.addEventListener('click', () => {
      state.autoRun.speed = Number(btn.dataset.speed);
      if (state.autoRun.active) {
        stopAutoRun();
        startAutoRun();
      }
      saveState();
      renderAutoRunPanel();
    });
  });
  const toggle = document.getElementById('auto-toggle');
  toggle?.addEventListener('click', () => {
    if (state.autoRun.active) stopAutoRun();
    else startAutoRun();
    renderAutoRunPanel();
  });
}

function startAutoRun() {
  if (autoRunHandle) clearInterval(autoRunHandle);
  state.autoRun.active = true;
  const ms = AUTO_SPEED_MS[state.autoRun.speed] || 400;
  autoRunHandle = setInterval(() => {
    advanceTurn();
    if (state.runCompleted || state.runFailed) stopAutoRun();
  }, ms);
  saveState();
}

function stopAutoRun() {
  if (autoRunHandle) clearInterval(autoRunHandle);
  autoRunHandle = null;
  if (state) {
    state.autoRun.active = false;
    saveState();
  }
}

function bindButtons() {
  generateButton?.addEventListener('click', () => {
    stopAutoRun();
    clearState();
    startNewRun();
    renderAll();
  });
  simulateButton?.addEventListener('click', () => {
    advanceTurn();
  });
  window.addEventListener('beforeunload', () => {
    // Surgical update: only clear the autoRun.active flag in the persisted
    // state so a refresh does not auto-resume. Do not call saveState()
    // here — that would overwrite externally edited fields (the in-memory
    // `state` is a snapshot from boot/last turn and may be stale).
    if (autoRunHandle) clearInterval(autoRunHandle);
    autoRunHandle = null;
    try {
      const stored = JSON.parse(localStorage.getItem(STATE_KEY));
      if (stored && stored.autoRun?.active) {
        stored.autoRun.active = false;
        localStorage.setItem(STATE_KEY, JSON.stringify(stored));
      }
    } catch (e) {
      // ignore
    }
  });
}

async function boot() {
  await loadData();
  loadOrInitState();
  shownCombo = state.battle.combo;
  shownChain = state.battle.chain;
  bindButtons();
  renderAll();
  if (state.autoRun?.active) startAutoRun();
}

boot();
