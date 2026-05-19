import { Dungeon } from './dungeon.js';

const generateButton = document.getElementById('generate-button');
const simulateButton = document.getElementById('simulate-button');
const mapRoot = document.getElementById('map-root');
const infoRoot = document.getElementById('map-info');

const BUILD_STORAGE_KEY = 'alb-character-build';
const FEVER_CHAIN_THRESHOLD = 10;
const FEVER_PRIMED_THRESHOLD = 5;
const MAX_LOG_ENTRIES = 12;

let floor = null;
let turnCount = 1;
let battleState = null;
let eventLog = [];

function loadBuild() {
  try {
    const raw = localStorage.getItem(BUILD_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

const savedBuild = loadBuild();
const baseStats = savedBuild?.stats || { hp: 100, atk: 16, def: 10, spd: 5 };
const selectedSkill = savedBuild?.skill || null;

function posKey(pos) {
  return `${pos.x},${pos.y}`;
}

function formatPos(pos) {
  return `(${pos.x + 1}, ${pos.y + 1})`;
}

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function createBattleState(skill, stats) {
  const passiveBonus = { hp: 0, atk: 0, def: 0, spd: 0, chainBonus: 0, comboBonus: 0, comboThreshold: 0 };
  if (skill?.type === 'passive' && skill.passive) {
    const p = skill.passive;
    if (p.stat && typeof p.amount === 'number') {
      passiveBonus[p.stat] = (passiveBonus[p.stat] || 0) + p.amount;
    }
    if (typeof p.defPenalty === 'number') {
      passiveBonus.def -= p.defPenalty;
    }
    if (typeof p.chainBonus === 'number') {
      passiveBonus.chainBonus = p.chainBonus;
    }
    if (typeof p.comboBonus === 'number') {
      passiveBonus.comboBonus = p.comboBonus;
      passiveBonus.comboThreshold = p.comboThreshold ?? 0;
    }
  }

  const totalStats = {
    hp: stats.hp + (passiveBonus.hp || 0),
    atk: stats.atk + (passiveBonus.atk || 0),
    def: stats.def + (passiveBonus.def || 0),
    spd: stats.spd + (passiveBonus.spd || 0)
  };

  return {
    skill,
    stats: totalStats,
    maxHp: totalStats.hp,
    currentHp: totalStats.hp,
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
    debuffs: new Map(),
    enemyEffects: new Map(),
    regen: null,
    passive: passiveBonus,
    didOffenseThisTurn: false,
    defeatedThisTurn: 0
  };
}

function logEvent(message, kind = '') {
  eventLog.unshift({ message, kind, turn: turnCount });
  if (eventLog.length > MAX_LOG_ENTRIES) {
    eventLog.length = MAX_LOG_ENTRIES;
  }
}

function feverThreshold(state) {
  return state.feverPrimedTurns > 0 ? FEVER_PRIMED_THRESHOLD : FEVER_CHAIN_THRESHOLD;
}

function refreshFever(state) {
  const threshold = feverThreshold(state);
  const wasFever = state.fever;
  state.fever = state.chain >= threshold;
  if (state.fever && !wasFever) {
    logEvent(`FEVER! Chain ${state.chain} — damage surges!`, 'evt-fever');
  } else if (!state.fever && wasFever) {
    logEvent('FEVER ended.', '');
  }
}

function applyDamageToEnemy(state, enemy, rawDamage, label = 'hit') {
  const enemyEffect = state.enemyEffects.get(enemy.id);
  const debuffDef = enemyEffect?.defReduction || 0;
  const armorPierce = enemyEffect?.armorPierce || 0;
  const effectiveDef = Math.max(0, (enemy.def || 0) - debuffDef);
  const pierced = armorPierce > 0 ? effectiveDef * (1 - armorPierce) : effectiveDef;
  let damage = Math.max(1, Math.round(rawDamage - pierced));

  let multiplier = 1;
  if (state.passive.chainBonus && state.chain > 0) {
    multiplier += state.passive.chainBonus * state.chain;
  }
  if (state.passive.comboBonus && state.combo >= state.passive.comboThreshold) {
    multiplier += state.passive.comboBonus;
  }
  if (state.fever) {
    multiplier += 0.5;
  }
  damage = Math.round(damage * multiplier);

  enemy.hp -= damage;
  state.combo += 1;
  state.didOffenseThisTurn = true;

  const isCrit = multiplier >= 1.5;
  const kind = isCrit ? 'evt-crit' : '';
  if (enemy.hp <= 0) {
    state.chain += 1;
    state.defeatedThisTurn += 1;
    logEvent(`${label} defeated ${enemy.type} for ${damage} dmg (combo ${state.combo}, chain ${state.chain})`, 'evt-defeat');
    return { defeated: true, damage };
  }
  logEvent(`${label} hit ${enemy.type} for ${damage} dmg (combo ${state.combo}${isCrit ? ' CRIT' : ''})`, kind);
  return { defeated: false, damage };
}

function basicAttack(state, enemy) {
  const rawDamage = state.stats.atk;
  return applyDamageToEnemy(state, enemy, rawDamage, 'Basic');
}

function useOffensiveSkill(state, primaryEnemy, allEnemies) {
  const skill = state.skill;
  const scaling = skill.scaling || {};
  const statBonus = (scaling.atk || 0) * state.stats.atk + (scaling.spd || 0) * state.stats.spd;
  const baseDamage = (skill.power || 0) + statBonus;
  const hits = Math.max(1, skill.hits || 1);

  const targets = [primaryEnemy];
  if (skill.chainTargets) {
    const extras = allEnemies
      .filter(e => e !== primaryEnemy && e.hp > 0)
      .sort((a, b) => manhattan(primaryEnemy, a) - manhattan(primaryEnemy, b))
      .slice(0, skill.chainTargets);
    extras.forEach(e => targets.push({ enemy: e, multiplier: 0.5 }));
  }

  const results = [];
  for (let hitIndex = 0; hitIndex < hits; hitIndex++) {
    if (primaryEnemy.hp <= 0) {
      break;
    }
    if (skill.armorPierce) {
      let bucket = state.enemyEffects.get(primaryEnemy.id);
      if (!bucket) {
        bucket = {};
        state.enemyEffects.set(primaryEnemy.id, bucket);
      }
      bucket.armorPierce = skill.armorPierce;
    }
    const result = applyDamageToEnemy(state, primaryEnemy, baseDamage, skill.name);
    results.push(result);
  }

  if (skill.armorPierce) {
    const bucket = state.enemyEffects.get(primaryEnemy.id);
    if (bucket) {
      delete bucket.armorPierce;
    }
  }

  if (skill.chainTargets) {
    targets.slice(1).forEach(t => {
      if (t.enemy.hp <= 0) return;
      applyDamageToEnemy(state, t.enemy, baseDamage * (t.multiplier || 0.5), `${skill.name} arc`);
    });
  }

  if (skill.splash) {
    allEnemies
      .filter(e => e !== primaryEnemy && e.hp > 0 && manhattan(e, primaryEnemy) <= 1)
      .forEach(e => applyDamageToEnemy(state, e, baseDamage * skill.splash, `${skill.name} splash`));
  }

  if (skill.effect?.kind === 'slow' || skill.effect?.kind === 'dot') {
    const eff = skill.effect;
    let bucket = state.enemyEffects.get(primaryEnemy.id);
    if (!bucket) {
      bucket = {};
      state.enemyEffects.set(primaryEnemy.id, bucket);
    }
    if (eff.kind === 'dot') {
      bucket.dot = { amount: eff.amount, duration: eff.duration };
    } else {
      bucket.slow = { amount: eff.amount, duration: eff.duration };
    }
  }

  state.cooldown = skill.cooldown || 0;
  return results;
}

function useDefensiveSkill(state) {
  const skill = state.skill;
  const eff = skill.effect || {};
  switch (eff.kind) {
    case 'shield':
      state.shieldAmount = eff.amount;
      state.shieldTurns = eff.duration;
      logEvent(`${skill.name}: shield ${eff.amount} for ${eff.duration} turn(s).`, '');
      break;
    case 'counter':
      state.counterPercent = eff.amount;
      state.counterTurns = eff.duration;
      logEvent(`${skill.name}: counter primed (${Math.round(eff.amount * 100)}%).`, '');
      break;
    case 'buff':
      state.buffs.push({ stat: eff.stat, amount: eff.amount, duration: eff.duration });
      logEvent(`${skill.name}: +${eff.amount} ${eff.stat.toUpperCase()} for ${eff.duration} turn(s).`, '');
      break;
    default:
      logEvent(`${skill.name} activated.`, '');
  }
  state.cooldown = skill.cooldown || 0;
}

function useSupportSkill(state, primaryEnemy) {
  const skill = state.skill;
  const eff = skill.effect || {};
  switch (eff.kind) {
    case 'heal':
      state.currentHp = Math.min(state.maxHp, state.currentHp + eff.amount);
      logEvent(`${skill.name}: restored ${eff.amount} HP.`, '');
      break;
    case 'regen':
      state.regen = { amount: eff.amount, duration: eff.duration };
      logEvent(`${skill.name}: regen ${eff.amount}/turn for ${eff.duration} turn(s).`, '');
      break;
    case 'buff':
      state.buffs.push({ stat: eff.stat, amount: eff.amount, duration: eff.duration });
      logEvent(`${skill.name}: +${eff.amount} ${eff.stat.toUpperCase()} for ${eff.duration} turn(s).`, '');
      break;
    case 'debuff':
      if (primaryEnemy) {
        let bucket = state.enemyEffects.get(primaryEnemy.id);
        if (!bucket) {
          bucket = {};
          state.enemyEffects.set(primaryEnemy.id, bucket);
        }
        if (eff.stat === 'def') {
          bucket.defReduction = (bucket.defReduction || 0) + eff.amount;
        }
        bucket.debuffTurns = Math.max(bucket.debuffTurns || 0, eff.duration);
        logEvent(`${skill.name}: -${eff.amount} ${eff.stat?.toUpperCase()} on ${primaryEnemy.type}.`, '');
      }
      break;
    case 'feverPrime':
      state.feverPrimedTurns = eff.duration;
      logEvent(`${skill.name}: FEVER threshold lowered for ${eff.duration} turn(s).`, 'evt-fever');
      break;
    default:
      logEvent(`${skill.name} activated.`, '');
  }
  state.cooldown = skill.cooldown || 0;
}

function effectiveAtk(state) {
  let atk = state.stats.atk;
  state.buffs.forEach(b => {
    if (b.stat === 'atk') atk += b.amount;
  });
  return atk;
}

function effectiveDef(state) {
  let def = state.stats.def;
  state.buffs.forEach(b => {
    if (b.stat === 'def') def += b.amount;
  });
  return def;
}

function pickAction(state, floor, pathResult) {
  const enemies = floor.enemies;
  if (enemies.length === 0) {
    return { kind: 'idle' };
  }

  const nearest = pathResult?.enemy;
  const nextStep = pathResult?.path?.[1];
  const adjacentEnemy = nearest && manhattan(floor.player, nearest) <= 1 ? nearest : null;
  const stepIsEnemy = nextStep && enemies.find(e => e.x === nextStep.x && e.y === nextStep.y);

  const skill = state.skill;
  const cooldownReady = state.cooldown <= 0;
  const hpRatio = state.currentHp / state.maxHp;

  if (skill && cooldownReady) {
    if (skill.type === 'support' && (skill.effect?.kind === 'heal' || skill.effect?.kind === 'regen') && hpRatio < 0.6) {
      return { kind: 'support', target: nearest };
    }
    if (skill.type === 'defense' && adjacentEnemy) {
      return { kind: 'defense' };
    }
    if (skill.type === 'support' && skill.effect?.kind === 'debuff' && nearest) {
      return { kind: 'support', target: nearest };
    }
    if (skill.type === 'support' && skill.effect?.kind === 'buff' && (state.combo > 0 || adjacentEnemy)) {
      return { kind: 'support', target: nearest };
    }
    if (skill.type === 'support' && skill.effect?.kind === 'feverPrime' && state.chain >= 3) {
      return { kind: 'support', target: nearest };
    }
    if (skill.type === 'utility' && skill.effect?.kind === 'teleport' && nearest && manhattan(floor.player, nearest) > 2) {
      return { kind: 'utility-teleport', target: nearest };
    }
    if (skill.type === 'attack') {
      const isRanged = skill.category === 'ranged' || skill.category === 'magic';
      if (isRanged && nearest) {
        return { kind: 'skill-attack', target: nearest };
      }
      if (adjacentEnemy) {
        return { kind: 'skill-attack', target: adjacentEnemy };
      }
    }
  }

  if (stepIsEnemy) {
    return { kind: 'basic-attack', target: stepIsEnemy };
  }
  if (nextStep) {
    return { kind: 'move', target: nextStep };
  }
  return { kind: 'idle' };
}

function tickStatuses(state) {
  state.buffs = state.buffs
    .map(b => ({ ...b, duration: b.duration - 1 }))
    .filter(b => b.duration > 0);
  if (state.shieldTurns > 0) {
    state.shieldTurns -= 1;
    if (state.shieldTurns <= 0) state.shieldAmount = 0;
  }
  if (state.counterTurns > 0) {
    state.counterTurns -= 1;
    if (state.counterTurns <= 0) state.counterPercent = 0;
  }
  if (state.feverPrimedTurns > 0) {
    state.feverPrimedTurns -= 1;
  }
  if (state.regen) {
    state.currentHp = Math.min(state.maxHp, state.currentHp + state.regen.amount);
    logEvent(`Regen restored ${state.regen.amount} HP.`, '');
    state.regen.duration -= 1;
    if (state.regen.duration <= 0) {
      state.regen = null;
    }
  }
  state.enemyEffects.forEach((bucket, id) => {
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
      state.enemyEffects.delete(id);
    }
  });
}

function tickDotsOnEnemies(state, enemies) {
  enemies.forEach(enemy => {
    const bucket = state.enemyEffects.get(enemy.id);
    if (bucket?.dot && enemy.hp > 0) {
      enemy.hp -= bucket.dot.amount;
      logEvent(`Poison ticked ${bucket.dot.amount} on ${enemy.type}.`, '');
      if (enemy.hp <= 0) {
        state.chain += 1;
        state.defeatedThisTurn += 1;
        logEvent(`${enemy.type} succumbed to poison.`, 'evt-defeat');
      }
    }
  });
}

function enemyRetaliation(state, floor) {
  const player = floor.player;
  const adjacent = floor.enemies.filter(e => e.hp > 0 && manhattan(e, player) <= 1);
  let totalDamage = 0;
  let counterTotal = 0;
  adjacent.forEach(enemy => {
    const enemyAtk = enemy.atk ?? 6;
    let damage = Math.max(1, enemyAtk - effectiveDef(state));
    if (state.shieldAmount > 0) {
      const absorbed = Math.min(damage, state.shieldAmount);
      damage -= absorbed;
      state.shieldAmount -= absorbed;
      if (absorbed > 0) {
        logEvent(`Shield absorbed ${absorbed} from ${enemy.type}.`, '');
      }
    }
    if (state.counterPercent > 0 && damage > 0) {
      const reflected = Math.round(damage * state.counterPercent);
      enemy.hp -= reflected;
      counterTotal += reflected;
      if (enemy.hp <= 0) {
        state.chain += 1;
        state.defeatedThisTurn += 1;
        logEvent(`Counter killed ${enemy.type} for ${reflected}.`, 'evt-defeat');
      }
    }
    if (damage > 0) {
      state.currentHp -= damage;
      totalDamage += damage;
    }
  });
  if (totalDamage > 0) {
    logEvent(`Enemies dealt ${totalDamage} damage.`, '');
  }
  if (counterTotal > 0) {
    logEvent(`Counter reflected ${counterTotal} total damage.`, '');
  }
}

function renderDungeon(floor) {
  mapRoot.innerHTML = '';
  mapRoot.style.gridTemplateColumns = `repeat(${floor.width}, 32px)`;
  const pathSet = new Set((floor.path || []).map(posKey));

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      const tileType = floor.tiles[y][x];
      tile.classList.add(tileType === 'floor' ? 'tile-floor' : 'tile-wall');
      if (pathSet.has(posKey({ x, y })) && tileType === 'floor') {
        tile.classList.add('tile-path');
      }
      if (floor.player.x === x && floor.player.y === y) {
        tile.classList.add('tile-player');
        tile.textContent = 'P';
      } else {
        const enemy = floor.enemies.find(e => e.x === x && e.y === y);
        if (enemy) {
          tile.classList.add('tile-enemy');
          tile.textContent = enemy.hp > 0 ? 'E' : 'X';
        }
      }
      mapRoot.appendChild(tile);
    }
  }
}

function renderInfo(floor, statusText = '') {
  const state = battleState;
  const pathResult = Dungeon.getNearestEnemyPath(floor.player, floor.enemies, floor.tiles, floor.width, floor.height);
  const status = statusText || (floor.enemies.length === 0 ? 'All enemies defeated!' : 'Ready for next turn.');
  const nearest = pathResult ? `${formatPos(pathResult.enemy)} (${pathResult.path.length - 1} steps)` : 'No reachable enemy';
  const skillLabel = state.skill ? `${state.skill.name} (${state.skill.category || state.skill.type})` : 'None';
  const cooldownLabel = state.skill && state.skill.cooldown
    ? `${state.cooldown}/${state.skill.cooldown}`
    : '—';
  const passiveSummary = describePassiveSummary(state);
  const comboClass = state.combo > 0 ? 'active' : '';
  const chainClass = state.chain > 0 ? 'active' : '';
  const feverHtml = state.fever ? `<p class="fever-line">★ FEVER (threshold ${feverThreshold(state)})</p>` : '';
  const buffSummary = state.buffs.length
    ? state.buffs.map(b => `+${b.amount} ${b.stat.toUpperCase()}(${b.duration})`).join(', ')
    : '—';
  const shieldSummary = state.shieldAmount > 0
    ? `${state.shieldAmount} (${state.shieldTurns}t)`
    : '—';

  infoRoot.innerHTML = `
    <p><strong>Status:</strong> ${status}</p>
    <p><strong>Selected skill:</strong> ${skillLabel}</p>
    <p class="cooldown-line"><strong>Cooldown:</strong> ${cooldownLabel}</p>
    ${passiveSummary ? `<p class="passive-line"><strong>Passive:</strong> ${passiveSummary}</p>` : ''}
    <p><strong>Floor size:</strong> ${floor.width} x ${floor.height}</p>
    <p><strong>Turn:</strong> ${turnCount}</p>
    <p><strong>Enemies left:</strong> ${floor.enemies.length}</p>
    <p><strong>HP:</strong> ${Math.max(0, state.currentHp)} / ${state.maxHp}</p>
    <p><strong>Shield:</strong> ${shieldSummary}</p>
    <p><strong>Buffs:</strong> ${buffSummary}</p>
    <p class="combo-line ${comboClass}"><strong>Combo:</strong> ${state.combo}</p>
    <p class="chain-line ${chainClass}"><strong>Chain:</strong> ${state.chain} (FEVER at ${feverThreshold(state)})</p>
    ${feverHtml}
    <p><strong>Nearest enemy:</strong> ${floor.enemies.length ? nearest : 'None'}</p>
    <h3>Log</h3>
    <ul class="event-log">
      ${eventLog.map(e => `<li class="${e.kind}">[T${e.turn}] ${e.message}</li>`).join('')}
    </ul>
  `;
}

function describePassiveSummary(state) {
  const p = state.passive;
  if (!p) return '';
  const parts = [];
  ['hp', 'atk', 'def', 'spd'].forEach(stat => {
    if (p[stat]) parts.push(`${p[stat] > 0 ? '+' : ''}${p[stat]} ${stat.toUpperCase()}`);
  });
  if (p.chainBonus) parts.push(`+${Math.round(p.chainBonus * 100)}% per chain`);
  if (p.comboBonus) parts.push(`combo>=${p.comboThreshold} -> +${Math.round(p.comboBonus * 100)}%`);
  return parts.join(', ');
}

function createFloor(width = 12, height = 8, enemyCount = 4) {
  const baseFloor = Dungeon.createFloor(width, height, enemyCount);
  const enemies = baseFloor.enemies.map((enemy, index) => ({
    ...enemy,
    id: `${enemy.type}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    hp: 18,
    maxHp: 18,
    atk: 6,
    def: 2
  }));
  return {
    ...baseFloor,
    enemies,
    path: []
  };
}

function update(statusText = '') {
  if (!floor) {
    floor = createFloor(12, 8, 4);
    turnCount = 1;
    battleState = createBattleState(selectedSkill, baseStats);
    eventLog = [];
    logEvent('Battle started.', '');
  }
  const pathResult = Dungeon.getNearestEnemyPath(floor.player, floor.enemies, floor.tiles, floor.width, floor.height);
  floor.path = pathResult ? pathResult.path : [];
  renderDungeon(floor);
  renderInfo(floor, statusText);
}

function executeAction(state, floor, action, pathResult) {
  switch (action.kind) {
    case 'skill-attack': {
      const targetEnemy = action.target;
      useOffensiveSkill(state, targetEnemy, floor.enemies);
      return `Used ${state.skill.name} on ${targetEnemy.type}.`;
    }
    case 'basic-attack': {
      basicAttack(state, action.target);
      return `Basic attack on ${action.target.type}.`;
    }
    case 'defense': {
      useDefensiveSkill(state);
      return `Defensive stance: ${state.skill.name}.`;
    }
    case 'support': {
      useSupportSkill(state, action.target);
      return `Activated ${state.skill.name}.`;
    }
    case 'utility-teleport': {
      const target = action.target;
      const dx = Math.sign(target.x - floor.player.x);
      const dy = Math.sign(target.y - floor.player.y);
      const range = state.skill.effect?.amount || 1;
      for (let step = 0; step < range; step++) {
        const nx = floor.player.x + dx;
        const ny = floor.player.y + dy;
        if (nx < 0 || ny < 0 || nx >= floor.width || ny >= floor.height) break;
        if (floor.tiles[ny][nx] !== 'floor') break;
        if (floor.enemies.find(e => e.x === nx && e.y === ny)) break;
        floor.player = { x: nx, y: ny };
        if (chebyshev(floor.player, target) <= 1) break;
      }
      state.cooldown = state.skill.cooldown || 0;
      return `Blinked toward ${target.type}.`;
    }
    case 'move': {
      floor.player = { x: action.target.x, y: action.target.y };
      if (state.skill?.type === 'utility' && state.skill.effect?.kind === 'move' && state.cooldown <= 0) {
        const extra = state.skill.effect.amount || 1;
        let pathIndex = 2;
        let stepsTaken = 0;
        while (stepsTaken < extra) {
          const step = pathResult?.path?.[pathIndex];
          if (!step) break;
          if (floor.enemies.find(e => e.x === step.x && e.y === step.y)) break;
          floor.player = { x: step.x, y: step.y };
          stepsTaken += 1;
          pathIndex += 1;
        }
        if (stepsTaken > 0) {
          state.cooldown = state.skill.cooldown || 0;
          logEvent(`${state.skill.name}: ${stepsTaken} extra step(s) taken.`, '');
        }
      }
      return `Moved toward ${pathResult ? pathResult.enemy.type : 'objective'}.`;
    }
    default:
      return 'Idle.';
  }
}

function advanceTurn() {
  if (!floor || !battleState) {
    return;
  }
  if (battleState.currentHp <= 0) {
    update('You have fallen. Generate a new dungeon.');
    return;
  }
  if (floor.enemies.length === 0) {
    update('All enemies are defeated.');
    return;
  }

  battleState.didOffenseThisTurn = false;
  battleState.defeatedThisTurn = 0;

  if (battleState.cooldown > 0) {
    battleState.cooldown -= 1;
  }

  const pathResult = Dungeon.getNearestEnemyPath(floor.player, floor.enemies, floor.tiles, floor.width, floor.height);
  if (!pathResult || pathResult.path.length < 1) {
    update('No reachable enemy. Please regenerate the dungeon.');
    return;
  }

  const action = pickAction(battleState, floor, pathResult);
  const statusText = executeAction(battleState, floor, action, pathResult);

  floor.enemies = floor.enemies.filter(e => e.hp > 0);
  tickDotsOnEnemies(battleState, floor.enemies);
  floor.enemies = floor.enemies.filter(e => e.hp > 0);

  if (floor.enemies.length > 0) {
    enemyRetaliation(battleState, floor);
  }

  if (!battleState.didOffenseThisTurn && battleState.defeatedThisTurn === 0) {
    if (battleState.combo !== 0) {
      logEvent(`Combo reset (was ${battleState.combo}).`, '');
    }
    battleState.combo = 0;
  }
  if (battleState.defeatedThisTurn === 0) {
    if (battleState.chain !== 0) {
      logEvent(`Chain reset (was ${battleState.chain}).`, '');
    }
    battleState.chain = 0;
  }

  tickStatuses(battleState);
  refreshFever(battleState);

  if (battleState.currentHp <= 0) {
    logEvent('You were defeated.', 'evt-defeat');
  }

  turnCount += 1;
  update(statusText);
}

generateButton.addEventListener('click', () => {
  floor = createFloor(12, 8, 4);
  turnCount = 1;
  battleState = createBattleState(selectedSkill, baseStats);
  eventLog = [];
  logEvent('New dungeon generated.', '');
  update('Generated a new dungeon floor.');
});

simulateButton.addEventListener('click', advanceTurn);

floor = createFloor(12, 8, 4);
battleState = createBattleState(selectedSkill, baseStats);
eventLog = [];
logEvent('Battle started.', '');
update('Dungeon loaded. Advance turns to fight enemies.');
