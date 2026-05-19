import { loadState } from './v6-shared.js';

const root = document.getElementById('log-root');

const KIND_FILTERS = {
  all: () => true,
  combat: e => e.kind === 'evt-crit' || e.kind === 'evt-defeat' || /(hit|defeated|damage|attack|Counter|Poison)/i.test(e.message),
  loot: e => e.kind === 'evt-loot' || /Picked up|dropped|Used /i.test(e.message),
  floor: e => e.kind === 'evt-floor' || /Floor|Descended|Run/i.test(e.message),
  fever: e => e.kind === 'evt-fever' || /FEVER/i.test(e.message)
};

let currentFilter = 'all';
let currentMode = 'detailed';
let state = null;

function summarize(events) {
  let hits = 0;
  let damageDealt = 0;
  let damageTaken = 0;
  let defeats = 0;
  let crits = 0;
  let loot = 0;
  let floorsCleared = 0;
  events.forEach(e => {
    const m = e.message;
    let mm;
    if ((mm = m.match(/for (\d+) dmg/))) {
      hits += 1;
      damageDealt += Number(mm[1]);
    }
    if ((mm = m.match(/Enemies dealt (\d+) damage/))) {
      damageTaken += Number(mm[1]);
    }
    if (e.kind === 'evt-defeat') defeats += 1;
    if (e.kind === 'evt-crit') crits += 1;
    if (e.kind === 'evt-loot') loot += 1;
    if (/Descended to Floor/.test(m)) floorsCleared += 1;
  });
  return { hits, damageDealt, damageTaken, defeats, crits, loot, floorsCleared };
}

function render() {
  if (!state) {
    root.innerHTML = '<p>No active run. Visit the <a href="game.html">Game</a> page to start.</p>';
    return;
  }
  const filtered = state.log.filter(KIND_FILTERS[currentFilter] || KIND_FILTERS.all);
  const filtersHtml = Object.keys(KIND_FILTERS).map(key =>
    `<button class="filter-btn ${key === currentFilter ? 'selected' : ''}" data-filter="${key}">${key}</button>`
  ).join(' ');
  const modesHtml = `
    <button class="mode-btn ${currentMode === 'simple' ? 'selected' : ''}" data-mode="simple">Simple</button>
    <button class="mode-btn ${currentMode === 'detailed' ? 'selected' : ''}" data-mode="detailed">Detailed</button>
  `;

  let body = '';
  if (currentMode === 'simple') {
    const sum = summarize(state.log);
    body = `
      <ul class="summary-list">
        <li><strong>Hits landed:</strong> ${sum.hits}</li>
        <li><strong>Damage dealt:</strong> ${sum.damageDealt}</li>
        <li><strong>Damage taken:</strong> ${sum.damageTaken}</li>
        <li><strong>Defeats:</strong> ${sum.defeats}</li>
        <li><strong>Crits:</strong> ${sum.crits}</li>
        <li><strong>Loot events:</strong> ${sum.loot}</li>
        <li><strong>Floors descended:</strong> ${sum.floorsCleared}</li>
        <li><strong>Current floor:</strong> ${state.currentFloorIndex + 1} / ${state.totalFloors}</li>
        <li><strong>Turn:</strong> ${state.turn}</li>
      </ul>
    `;
  } else {
    body = `
      <ul class="event-log full">
        ${filtered.map(e => `<li class="${e.kind}">[T${e.turn}] ${e.message}</li>`).join('') || '<li class="muted">No matching entries.</li>'}
      </ul>
    `;
  }

  root.innerHTML = `
    <section class="card">
      <div class="log-controls">
        <div><strong>Mode:</strong> ${modesHtml}</div>
        <div><strong>Filter:</strong> ${filtersHtml}</div>
      </div>
      ${body}
    </section>
  `;

  root.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      render();
    });
  });
  root.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      render();
    });
  });
}

function boot() {
  state = loadState();
  render();
}

boot();
