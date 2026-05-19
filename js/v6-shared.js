const STATE_KEY = 'alb-v6-state';

export function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export async function loadCatalogs() {
  const dataBase = new URL('../data/', import.meta.url);
  const [items, enemies, skills] = await Promise.all([
    fetch(new URL('items.json', dataBase)).then(r => r.json()),
    fetch(new URL('enemies.json', dataBase)).then(r => r.json()),
    fetch(new URL('skills.json', dataBase)).then(r => r.json())
  ]);
  return {
    items,
    enemies,
    skills,
    itemMap: new Map(items.map(it => [it.id, it])),
    enemyMap: new Map(enemies.map(e => [e.id, e])),
    skillMap: new Map(skills.map(s => [s.id, s]))
  };
}

export function effectiveStats(state, itemMap) {
  const base = state.battle.baseStats;
  const passive = state.battle.passive || { hp: 0, atk: 0, def: 0, spd: 0 };
  const eq = equipmentBonus(state.equipment, itemMap);
  return {
    hp: base.hp + (passive.hp || 0) + eq.hp,
    atk: base.atk + (passive.atk || 0) + eq.atk,
    def: base.def + (passive.def || 0) + eq.def,
    spd: base.spd + (passive.spd || 0) + eq.spd
  };
}

export function equipmentBonus(equipment, itemMap) {
  const bonus = { hp: 0, atk: 0, def: 0, spd: 0 };
  if (!equipment) return bonus;
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

export function rarityClass(rarity) {
  switch (rarity) {
    case 'rare': return 'rarity-rare';
    case 'epic': return 'rarity-epic';
    default: return 'rarity-common';
  }
}

export function statsLine(stats) {
  if (!stats) return '';
  const parts = [];
  if (stats.hp) parts.push(`+${stats.hp} HP`);
  if (stats.atk) parts.push(`+${stats.atk} ATK`);
  if (stats.def) parts.push(`+${stats.def} DEF`);
  if (stats.spd) parts.push(`+${stats.spd} SPD`);
  return parts.join(', ');
}
