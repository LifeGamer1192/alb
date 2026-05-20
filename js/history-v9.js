// v9 run history — reads run records saved by game-v9.js and shows a
// best-records panel plus a chronological list of past runs.
const HISTORY_KEY = 'alb-v9-history';
const root = document.getElementById('history-root');

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // corrupt history — treat as empty
  }
  return [];
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtWhen(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function outcomeCell(outcome) {
  return outcome === 'cleared'
    ? '<span class="outcome-cleared">Cleared</span>'
    : '<span class="outcome-failed">Failed</span>';
}

function bestCard(label, value) {
  return `<div class="best-card">
    <div class="best-label">${esc(label)}</div>
    <div class="best-value">${esc(value)}</div>
  </div>`;
}

function maxBy(list, key) {
  return list.reduce((best, r) => (typeof r[key] === 'number' && r[key] > best ? r[key] : best), 0);
}

function renderBestRecords(history) {
  const cleared = history.filter(r => r.outcome === 'cleared');
  const fastest = cleared
    .map(r => r.durationMs)
    .filter(n => typeof n === 'number' && n > 0)
    .sort((a, b) => a - b)[0];

  const cards = [
    bestCard('Total runs', history.length),
    bestCard('Dungeons cleared', cleared.length),
    bestCard('Best floor reached', `${maxBy(history, 'floorsCleared')} / ${history[0]?.totalFloors || 5}`),
    bestCard('Fastest clear', fastest ? fmtDuration(fastest) : '—'),
    bestCard('Most damage', maxBy(history, 'totalDamage')),
    bestCard('Best combo', maxBy(history, 'maxCombo')),
    bestCard('Best chain', maxBy(history, 'maxChain'))
  ].join('');

  return `<section class="card">
    <h2>Best Records</h2>
    <div class="best-grid">${cards}</div>
  </section>`;
}

function renderRunRow(rec) {
  const skill = rec.skillName ? esc(rec.skillName) : '—';
  return `<tr>
    <td>${esc(fmtWhen(rec.endedAt))}</td>
    <td>${outcomeCell(rec.outcome)}</td>
    <td class="num">${esc(rec.floorsCleared)} / ${esc(rec.totalFloors || 5)}</td>
    <td class="num">${esc(rec.turns)}</td>
    <td class="num">${esc(fmtDuration(rec.durationMs))}</td>
    <td class="num">${esc(rec.totalDamage)}</td>
    <td class="num">${esc(rec.maxCombo)}</td>
    <td class="num">${esc(rec.maxChain)}</td>
    <td>${skill}</td>
  </tr>`;
}

function renderRunList(history) {
  const rows = history.map(renderRunRow).join('');
  return `<section class="card">
    <h2>Run History</h2>
    <p class="muted">Most recent first. Up to 30 runs are kept.</p>
    <table class="status-table history-table">
      <thead>
        <tr>
          <th>When</th><th>Outcome</th><th>Floor</th><th>Turns</th>
          <th>Time</th><th>Damage</th><th>Combo</th><th>Chain</th><th>Skill</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="history-actions">
      <button id="clear-history" type="button" class="danger-btn">Clear history</button>
    </div>
  </section>`;
}

// Two-step clear: the first click arms the button, a second click within a
// few seconds actually clears. Avoids a blocking confirm() dialog.
function wireClearButton() {
  const btn = document.getElementById('clear-history');
  if (!btn) return;
  let armed = false;
  let disarmTimer = null;
  btn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      btn.textContent = 'Click again to confirm';
      btn.classList.add('armed');
      disarmTimer = setTimeout(() => {
        armed = false;
        btn.textContent = 'Clear history';
        btn.classList.remove('armed');
      }, 4000);
      return;
    }
    if (disarmTimer) clearTimeout(disarmTimer);
    localStorage.removeItem(HISTORY_KEY);
    render();
  });
}

function render() {
  const history = loadHistory();
  if (!history.length) {
    root.innerHTML = `<section class="card">
      <h2>Run History</h2>
      <p class="muted">No runs recorded yet. Finish a run on the
        <a href="game.html">Game</a> page and it will appear here.</p>
    </section>`;
    return;
  }
  root.innerHTML = renderBestRecords(history) + renderRunList(history);
  wireClearButton();
}

render();
