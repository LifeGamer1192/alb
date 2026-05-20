import { loadState } from './v6-shared.js';
import { conditionLabel, actionLabel, defaultRules } from './logic-engine-v7.js';

const RULE_KEY = 'alb-v7-rules';
const root = document.getElementById('result-root');

// The logic editor and the game share this key; an empty saved array is
// respected as-is, only missing or corrupt data falls back to defaults.
function loadRules() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RULE_KEY));
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // corrupt data — fall through to defaults
  }
  return defaultRules();
}

function outcomeView(state) {
  if (state.runCompleted) return { text: 'Dungeon cleared', color: '#86efac' };
  if (state.runFailed) return { text: 'Run failed', color: '#fb7185' };
  return { text: 'In progress', color: '#9ca3af' };
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

  const totalFloors = state.totalFloors || 5;
  const runStats = state.runStats || { totalDamage: 0, maxCombo: 0, maxChain: 0 };
  const floorsCleared = state.runCompleted ? totalFloors : (state.currentFloorIndex || 0);
  const outcome = outcomeView(state);

  root.innerHTML = `
    <section class="card">
      <h2>Run Summary</h2>
      <ul>
        <li>Outcome: <strong style="color:${outcome.color}">${outcome.text}</strong></li>
        <li>Floors cleared: <strong>${floorsCleared} / ${totalFloors}</strong></li>
        <li>Turns taken: <strong>${state.turn || 0}</strong></li>
        <li>Total damage: <strong>${runStats.totalDamage}</strong></li>
        <li>Max combo: <strong>${runStats.maxCombo}</strong></li>
        <li>Max chain: <strong>${runStats.maxChain}</strong></li>
      </ul>
    </section>
    <section class="card">
      <h2>Rules Used</h2>
      <ul>${rulesSummary(state)}</ul>
    </section>`;
}

render();
