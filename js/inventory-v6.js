import { loadState, saveState, loadCatalogs, statsLine, rarityClass } from './v6-shared.js';

const root = document.getElementById('inventory-root');
let catalogs = null;
let state = null;

function groupInventory(inv, itemMap) {
  const map = new Map();
  inv.forEach(id => {
    if (!map.has(id)) map.set(id, 0);
    map.set(id, map.get(id) + 1);
  });
  return Array.from(map.entries())
    .map(([id, qty]) => ({ id, qty, item: itemMap.get(id) }))
    .filter(entry => entry.item)
    .sort((a, b) => {
      const slotOrder = ['weapon', 'armor', 'accessory', 'consumable'];
      const sa = slotOrder.indexOf(a.item.slot);
      const sb = slotOrder.indexOf(b.item.slot);
      if (sa !== sb) return sa - sb;
      return a.item.name.localeCompare(b.item.name);
    });
}

function equipItem(itemId) {
  const item = catalogs.itemMap.get(itemId);
  if (!item || item.slot === 'consumable') return;
  const slot = item.slot;
  const currentlyEquipped = state.equipment[slot];
  // Remove one instance of item from inventory
  const idx = state.inventory.indexOf(itemId);
  if (idx >= 0) state.inventory.splice(idx, 1);
  // Put currently equipped (if any) back into inventory
  if (currentlyEquipped) state.inventory.push(currentlyEquipped);
  state.equipment[slot] = itemId;
  // Re-evaluate maxHp (since equipment adds HP)
  recomputeMaxHp();
  saveState(state);
  render();
}

function unequipSlot(slot) {
  const id = state.equipment[slot];
  if (!id) return;
  state.equipment[slot] = null;
  state.inventory.push(id);
  recomputeMaxHp();
  saveState(state);
  render();
}

function recomputeMaxHp() {
  const base = state.battle.baseStats;
  const passive = state.battle.passive || { hp: 0 };
  let bonus = 0;
  for (const slot of ['weapon', 'armor', 'accessory']) {
    const id = state.equipment[slot];
    if (!id) continue;
    const item = catalogs.itemMap.get(id);
    bonus += item?.stats?.hp || 0;
  }
  const newMax = base.hp + (passive.hp || 0) + bonus;
  // Heal proportionally so equipping armor doesn't feel punishing
  const ratio = state.battle.maxHp > 0 ? state.battle.currentHp / state.battle.maxHp : 1;
  state.battle.maxHp = newMax;
  state.battle.currentHp = Math.min(newMax, Math.max(1, Math.round(newMax * ratio)));
}

function useConsumable(itemId) {
  const item = catalogs.itemMap.get(itemId);
  if (!item || item.slot !== 'consumable') return;
  const use = item.use || {};
  switch (use.kind) {
    case 'heal':
      state.battle.currentHp = Math.min(state.battle.maxHp, state.battle.currentHp + (use.amount || 0));
      break;
    case 'fullRestore':
      state.battle.currentHp = state.battle.maxHp;
      state.battle.buffs = [];
      break;
    case 'cooldownReset':
      state.battle.cooldown = 0;
      break;
    case 'shield':
      state.battle.shieldAmount = use.amount || 0;
      state.battle.shieldTurns = use.duration || 1;
      break;
    default:
      break;
  }
  // Remove one instance
  const idx = state.inventory.indexOf(itemId);
  if (idx >= 0) state.inventory.splice(idx, 1);
  // Log the use into state.log
  state.log.unshift({ turn: state.turn, message: `Used ${item.name}.`, kind: 'evt-loot' });
  if (state.log.length > 60) state.log.length = 60;
  saveState(state);
  render();
}

function render() {
  if (!state) {
    root.innerHTML = '<p>No active run. Visit the <a href="game.html">Game</a> page to start.</p>';
    return;
  }
  const { itemMap } = catalogs;
  const grouped = groupInventory(state.inventory, itemMap);

  const equipSummary = ['weapon', 'armor', 'accessory'].map(slot => {
    const id = state.equipment[slot];
    if (!id) return `<tr><td class="slot-name">${slot}</td><td colspan="3"><em>(empty)</em></td></tr>`;
    const it = itemMap.get(id);
    return `<tr>
      <td class="slot-name">${slot}</td>
      <td><span class="item-name ${rarityClass(it.rarity)}">${it.name}</span></td>
      <td>${statsLine(it.stats) || '—'}</td>
      <td><button class="unequip" data-slot="${slot}">Unequip</button></td>
    </tr>`;
  }).join('');

  const slotsForList = ['weapon', 'armor', 'accessory', 'consumable'];
  const rowsBySlot = {};
  slotsForList.forEach(slot => { rowsBySlot[slot] = []; });
  grouped.forEach(({ id, qty, item }) => {
    const isEquipped = state.equipment?.[item.slot] === id;
    const button = item.slot === 'consumable'
      ? `<button class="use-item" data-id="${id}">Use</button>`
      : `<button class="equip-item" data-id="${id}">${isEquipped ? 'Re-equip' : 'Equip'}</button>`;
    rowsBySlot[item.slot]?.push(`<tr>
      <td><span class="item-name ${rarityClass(item.rarity)}">${item.name}</span> <span class="badge ${rarityClass(item.rarity)}">${item.rarity}</span></td>
      <td>${qty > 1 ? 'x' + qty : ''}</td>
      <td>${item.slot === 'consumable' ? describeUse(item.use) : (statsLine(item.stats) || '—')}</td>
      <td class="muted">${item.description || ''}</td>
      <td>${button}</td>
    </tr>`);
  });

  const slotSection = (slot, label) => rowsBySlot[slot].length === 0
    ? `<section class="card"><h3>${label}</h3><p class="muted">None.</p></section>`
    : `<section class="card">
        <h3>${label}</h3>
        <table class="status-table inventory-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Effect</th><th>Description</th><th></th></tr></thead>
          <tbody>${rowsBySlot[slot].join('')}</tbody>
        </table>
      </section>`;

  root.innerHTML = `
    <section class="card">
      <h2>Equipped</h2>
      <table class="status-table">
        <thead><tr><th>Slot</th><th>Item</th><th>Stats</th><th></th></tr></thead>
        <tbody>${equipSummary}</tbody>
      </table>
      <p class="muted">HP: ${state.battle.currentHp} / ${state.battle.maxHp}</p>
    </section>
    ${slotSection('weapon', 'Weapons')}
    ${slotSection('armor', 'Armor')}
    ${slotSection('accessory', 'Accessories')}
    ${slotSection('consumable', 'Consumables')}
  `;

  root.querySelectorAll('.equip-item').forEach(btn => {
    btn.addEventListener('click', () => equipItem(btn.dataset.id));
  });
  root.querySelectorAll('.use-item').forEach(btn => {
    btn.addEventListener('click', () => useConsumable(btn.dataset.id));
  });
  root.querySelectorAll('.unequip').forEach(btn => {
    btn.addEventListener('click', () => unequipSlot(btn.dataset.slot));
  });
}

function describeUse(use) {
  if (!use) return '—';
  switch (use.kind) {
    case 'heal': return `Heal ${use.amount} HP`;
    case 'fullRestore': return 'Full HP + clear debuffs';
    case 'cooldownReset': return 'Reset cooldown';
    case 'shield': return `Shield ${use.amount} (${use.duration}t)`;
    default: return use.kind;
  }
}

async function boot() {
  catalogs = await loadCatalogs();
  state = loadState();
  render();
}

boot();
