import { loadState } from './v6-shared.js';
import { conditionLabel, actionLabel, activeRules } from './logic-engine-v12.js';

const RULE_KEY = 'alb-v7-rules';
const HISTORY_KEY = 'alb-v9-history';
const root = document.getElementById('result-root');

// v12: the "Rules Used" summary reports against the active rule set.
function loadRules() {
  return activeRules();
}

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // corrupt history — treat as empty
  }
  return [];
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function outcomeView(outcome) {
  if (outcome === 'cleared') return { text: 'Dungeon cleared', color: '#86efac' };
  if (outcome === 'failed') return { text: 'Run failed', color: '#fb7185' };
  return { text: 'In progress', color: '#9ca3af' };
}

// Build a uniform run record either from the authoritative history entry
// (when the finished run was already recorded) or live from game state.
function currentRun(state, history) {
  const finished = !!(state.runCompleted || state.runFailed);
  if (finished && state.runRecorded && history.length) {
    return { rec: history[0], prior: history.slice(1), recorded: true };
  }
  const rs = state.runStats || {};
  const totalFloors = state.totalFloors || 5;
  const rec = {
    outcome: state.runCompleted ? 'cleared' : state.runFailed ? 'failed' : 'inprogress',
    floorsCleared: state.runCompleted ? totalFloors : (state.currentFloorIndex || 0),
    totalFloors,
    turns: state.turn || 0,
    durationMs: typeof rs.startedAt === 'number' ? Math.max(0, Date.now() - rs.startedAt) : 0,
    totalDamage: rs.totalDamage || 0,
    maxCombo: rs.maxCombo || 0,
    maxChain: rs.maxChain || 0,
    skillUses: rs.skillUses || 0,
    basicHits: rs.basicHits || 0,
    skillName: state.battle?.skill?.name || null
  };
  return { rec, prior: history, recorded: false };
}

// Returns a 🏆 badge when `value` ties or beats every prior run on this key.
// `mode` is 'max' (higher is better) or 'min' (lower is better, e.g. time).
function recordBadge(prior, key, value, mode, eligible = true) {
  if (!eligible || !(value > 0)) return '';
  const nums = prior
    .map(r => r[key])
    .filter(n => typeof n === 'number' && n > 0);
  if (!nums.length) return ' <span class="record-badge">★ First</span>';
  const beats = mode === 'min' ? value <= Math.min(...nums) : value >= Math.max(...nums);
  return beats ? ' <span class="record-badge">🏆 Best</span>' : '';
}

function rulesSummary(state) {
  const rules = loadRules();
  const ruleStats = state.ruleStats || {};
  const totalFires = rules.reduce((sum, r) => sum + (ruleStats[r.id] || 0), 0);
  if (totalFires === 0) return '<li>None</li>';
  // Only current rules are listed, so stats left over from rules the player
  // later removed are ignored — same behaviour as the in-game Logic panel.
  return rules
    .map(r => ({ rule: r, fired: ruleStats[r.id] || 0 }))
    .filter(entry => entry.fired > 0)
    .sort((a, b) => b.fired - a.fired)
    .map(entry => {
      const share = Math.round((entry.fired / totalFires) * 100);
      const label = `${conditionLabel(entry.rule)} &rarr; ${actionLabel(entry.rule)}`;
      return `<li>${label} — <strong>${entry.fired}x</strong> (${share}%)</li>`;
    })
    .join('');
}

function render() {
  const state = loadState();
  if (!state || !state.battle) {
    root.innerHTML = '<p>No run data yet. Start a run on the <a href="game.html">Game</a> page, then come back here.</p>';
    return;
  }

  const history = loadHistory();
  const { rec, prior, recorded } = currentRun(state, history);
  const outcome = outcomeView(rec.outcome);
  const cleared = rec.outcome === 'cleared';

  // "Most-used" action: the equipped skill vs basic attacks.
  const skillName = rec.skillName || 'None';
  const mostUsed = rec.skillUses >= rec.basicHits
    ? `${skillName} <span class="muted">(skill)</span> — ${rec.skillUses}x`
    : `Basic attack — ${rec.basicHits}x`;

  root.innerHTML = `
    <section class="card">
      <h2>Run Summary</h2>
      <ul>
        <li>Outcome: <strong style="color:${outcome.color}">${outcome.text}</strong></li>
        <li>Floors cleared: <strong>${rec.floorsCleared} / ${rec.totalFloors}</strong>${recordBadge(prior, 'floorsCleared', rec.floorsCleared, 'max', recorded)}</li>
        <li>Turns taken: <strong>${rec.turns}</strong></li>
        <li>Clear time: <strong>${formatDuration(rec.durationMs)}</strong>${recordBadge(prior, 'durationMs', rec.durationMs, 'min', recorded && cleared)}</li>
        <li>Total damage: <strong>${rec.totalDamage}</strong>${recordBadge(prior, 'totalDamage', rec.totalDamage, 'max', recorded)}</li>
        <li>Max combo: <strong>${rec.maxCombo}</strong>${recordBadge(prior, 'maxCombo', rec.maxCombo, 'max', recorded)}</li>
        <li>Max chain: <strong>${rec.maxChain}</strong>${recordBadge(prior, 'maxChain', rec.maxChain, 'max', recorded)}</li>
        <li>Most-used: <strong>${mostUsed}</strong></li>
      </ul>
    </section>
    <section class="card">
      <h2>Rules Used</h2>
      <ul>${rulesSummary(state)}</ul>
    </section>
    <section class="card">
      <h2>History</h2>
      <p class="muted">${history.length} run(s) recorded.</p>
      <p><a href="history.html">View run history &amp; records &rarr;</a></p>
    </section>`;
}

render();
