import { loadState, loadCatalogs, effectiveStats, equipmentBonus, statsLine, rarityClass } from './v6-shared.js';

const root = document.getElementById('status-root');

function render(state, catalogs) {
  if (!state) {
    root.innerHTML = '<p>No active run. Visit the <a href="game.html">Game</a> page to start.</p>';
    return;
  }
  const { itemMap, skillMap } = catalogs;
  const base = state.battle.baseStats;
  const eff = effectiveStats(state, itemMap);
  const eq = equipmentBonus(state.equipment, itemMap);
  // v11: a run carries a skill loadout; tolerate legacy single-skill saves.
  const loadout = Array.isArray(state.battle.loadout)
    ? state.battle.loadout
    : (state.battle.skill ? [{ skill: state.battle.skill, cooldown: state.battle.cooldown || 0 }] : []);
  const buffs = state.battle.buffs.length
    ? state.battle.buffs.map(b => `+${b.amount} ${b.stat.toUpperCase()} (${b.duration}t)`).join(', ')
    : 'None';
  const passive = state.battle.passive;
  const passiveParts = [];
  ['hp', 'atk', 'def', 'spd'].forEach(s => { if (passive?.[s]) passiveParts.push(`${passive[s] > 0 ? '+' : ''}${passive[s]} ${s.toUpperCase()}`); });
  if (passive?.chainBonus) passiveParts.push(`+${Math.round(passive.chainBonus * 100)}%/chain`);
  if (passive?.comboBonus) passiveParts.push(`combo>=${passive.comboThreshold} +${Math.round(passive.comboBonus * 100)}%`);
  const passiveSummary = passiveParts.length ? passiveParts.join(', ') : 'None';

  const equipRow = (slot) => {
    const id = state.equipment?.[slot];
    if (!id) return `<tr><td class="slot-name">${slot}</td><td colspan="3"><em>(empty)</em></td></tr>`;
    const item = itemMap.get(id);
    if (!item) return `<tr><td class="slot-name">${slot}</td><td colspan="3"><em>(unknown: ${id})</em></td></tr>`;
    return `<tr>
      <td class="slot-name">${slot}</td>
      <td><span class="item-name ${rarityClass(item.rarity)}">${item.name}</span></td>
      <td>${statsLine(item.stats) || '—'}</td>
      <td class="muted">${item.description || ''}</td>
    </tr>`;
  };

  root.innerHTML = `
    <section class="card">
      <h2>Run</h2>
      <ul>
        <li><strong>Floor:</strong> ${state.currentFloorIndex + 1} / ${state.totalFloors}</li>
        <li><strong>Turn:</strong> ${state.turn}</li>
        <li><strong>HP:</strong> ${Math.max(0, state.battle.currentHp)} / ${state.battle.maxHp}</li>
      </ul>
    </section>
    <section class="card">
      <h2>Stats</h2>
      <table class="status-table">
        <thead><tr><th></th><th>Base</th><th>Passive</th><th>Equipment</th><th>Effective</th></tr></thead>
        <tbody>
          <tr><td>HP</td><td>${base.hp}</td><td>${passive.hp || 0}</td><td>${eq.hp}</td><td><strong>${eff.hp}</strong></td></tr>
          <tr><td>ATK</td><td>${base.atk}</td><td>${passive.atk || 0}</td><td>${eq.atk}</td><td><strong>${eff.atk}</strong></td></tr>
          <tr><td>DEF</td><td>${base.def}</td><td>${passive.def || 0}</td><td>${eq.def}</td><td><strong>${eff.def}</strong></td></tr>
          <tr><td>SPD</td><td>${base.spd}</td><td>${passive.spd || 0}</td><td>${eq.spd}</td><td><strong>${eff.spd}</strong></td></tr>
        </tbody>
      </table>
    </section>
    <section class="card">
      <h2>Skill Loadout &amp; Passive</h2>
      ${loadout.length ? `<table class="status-table">
        <thead><tr><th>Slot</th><th>Skill</th><th>Cooldown</th><th>Description</th></tr></thead>
        <tbody>
          ${loadout.map((e, i) => {
            const s = e.skill;
            const cd = s.cooldown ? `${e.cooldown}/${s.cooldown}` : '—';
            return `<tr>
              <td>${i + 1}</td>
              <td><strong>${s.name}</strong> <span class="muted">(${s.category || s.type})</span></td>
              <td>${cd}</td>
              <td class="muted">${s.description || ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : '<p class="muted">No skills equipped — basic attacks only.</p>'}
      <ul><li><strong>Passive bonuses:</strong> ${passiveSummary}</li></ul>
    </section>
    <section class="card">
      <h2>Equipment</h2>
      <table class="status-table">
        <thead><tr><th>Slot</th><th>Item</th><th>Stats</th><th>Description</th></tr></thead>
        <tbody>
          ${equipRow('weapon')}
          ${equipRow('armor')}
          ${equipRow('accessory')}
        </tbody>
      </table>
      <p><a href="inventory.html">Open inventory →</a></p>
    </section>
    <section class="card">
      <h2>Active Effects</h2>
      <ul>
        <li><strong>Buffs:</strong> ${buffs}</li>
        <li><strong>Shield:</strong> ${state.battle.shieldAmount > 0 ? state.battle.shieldAmount + ' (' + state.battle.shieldTurns + 't)' : 'None'}</li>
        <li><strong>Counter:</strong> ${state.battle.counterPercent > 0 ? Math.round(state.battle.counterPercent * 100) + '% (' + state.battle.counterTurns + 't)' : 'None'}</li>
        <li><strong>Regen:</strong> ${state.battle.regen ? state.battle.regen.amount + '/turn x' + state.battle.regen.duration : 'None'}</li>
        <li class="combo-line ${state.battle.combo > 0 ? 'active' : ''}"><strong>Combo:</strong> ${state.battle.combo}</li>
        <li class="chain-line ${state.battle.chain > 0 ? 'active' : ''}"><strong>Chain:</strong> ${state.battle.chain}</li>
        ${state.battle.fever ? '<li class="fever-line">★ FEVER ACTIVE</li>' : ''}
      </ul>
    </section>
  `;
}

async function boot() {
  const catalogs = await loadCatalogs();
  const state = loadState();
  render(state, catalogs);
}

boot();
