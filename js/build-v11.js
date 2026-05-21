const cultureSelect = document.getElementById('culture-select');
const classSelect = document.getElementById('class-select');
const godSelect = document.getElementById('god-select');
// v11: a loadout of up to three skill slots instead of a single skill.
const skillSelects = ['skill-1-select', 'skill-2-select', 'skill-3-select']
  .map(id => document.getElementById(id))
  .filter(Boolean);
const statsList = document.getElementById('stats-list');
const skillsList = document.getElementById('skills-list');
const buildForm = document.getElementById('build-form');
const originInfo = document.getElementById('origin-info');

const BUILD_STORAGE_KEY = 'alb-character-build';

let cultures = [];
let classes = [];
let gods = [];
let skills = [];
const skillMap = new Map();

function loadSavedBuild() {
  try {
    const raw = localStorage.getItem(BUILD_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveBuildData(buildData) {
  localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(buildData));
}

function applySavedBuild(savedBuild) {
  if (!savedBuild) {
    return;
  }
  if (cultureSelect && savedBuild.cultureId) {
    cultureSelect.value = savedBuild.cultureId;
  }
  if (classSelect && savedBuild.classId) {
    classSelect.value = savedBuild.classId;
  }
  if (godSelect && savedBuild.godId) {
    godSelect.value = savedBuild.godId;
  }
  // Accept a v11 loadout, or fall back to a legacy single skill id.
  const ids = Array.isArray(savedBuild.skillLoadoutIds)
    ? savedBuild.skillLoadoutIds
    : (savedBuild.skillId ? [savedBuild.skillId] : []);
  skillSelects.forEach((sel, i) => {
    const id = ids[i];
    sel.value = id && skillMap.has(id) ? id : '';
  });
}

async function loadData() {
  const dataBase = new URL('../data/', import.meta.url);
  const [cultureData, classData, godData, skillData] = await Promise.all([
    fetch(new URL('cultures.json', dataBase)).then(r => r.json()),
    fetch(new URL('classes.json', dataBase)).then(r => r.json()),
    fetch(new URL('gods.json', dataBase)).then(r => r.json()),
    fetch(new URL('skills.json', dataBase)).then(r => r.json())
  ]);
  cultures = cultureData;
  classes = classData;
  gods = godData;
  skills = skillData;
  skills.forEach(skill => skillMap.set(skill.id, skill));
}

// The chosen loadout: each filled slot resolved to its skill object.
function resolveLoadout() {
  return skillSelects
    .map(sel => skillMap.get(sel.value))
    .filter(Boolean);
}

function populateSelect(selectElement, items) {
  selectElement.innerHTML = '';
  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    selectElement.append(option);
  });
}

function populateSkillSelect(selectElement, skillItems) {
  selectElement.innerHTML = '';
  // Every slot is optional — an empty loadout just means basic attacks.
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '(none)';
  selectElement.append(none);

  const groups = new Map();
  skillItems.forEach(skill => {
    const type = skill.type || 'other';
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type).push(skill);
  });
  const typeOrder = ['attack', 'defense', 'support', 'utility', 'passive', 'other'];
  typeOrder.forEach(type => {
    const items = groups.get(type);
    if (!items || items.length === 0) {
      return;
    }
    const optgroup = document.createElement('optgroup');
    optgroup.label = type.charAt(0).toUpperCase() + type.slice(1);
    items.forEach(skill => {
      const option = document.createElement('option');
      option.value = skill.id;
      const cdLabel = skill.cooldown ? ` · CD ${skill.cooldown}` : '';
      option.textContent = `${skill.name} (${skill.category || skill.type}${cdLabel})`;
      optgroup.append(option);
    });
    selectElement.append(optgroup);
  });
}

function describeEffect(effect) {
  if (!effect) {
    return '';
  }
  switch (effect.kind) {
    case 'heal':
      return `Heal ${effect.amount} HP`;
    case 'regen':
      return `Regen ${effect.amount}/turn x${effect.duration}`;
    case 'shield':
      return `Shield ${effect.amount} for ${effect.duration} turn(s)`;
    case 'buff':
      return `+${effect.amount} ${effect.stat?.toUpperCase()} for ${effect.duration} turn(s)`;
    case 'debuff':
      return `-${effect.amount} target ${effect.stat?.toUpperCase()} for ${effect.duration} turn(s)`;
    case 'dot':
      return `DoT ${effect.amount}/turn x${effect.duration}`;
    case 'slow':
      return `Slow -${effect.amount} SPD x${effect.duration}`;
    case 'counter':
      return `Counter ${Math.round(effect.amount * 100)}% x${effect.duration}`;
    case 'move':
      return `+${effect.amount} move`;
    case 'teleport':
      return `Teleport up to ${effect.amount}`;
    case 'feverPrime':
      return `Lowers FEVER threshold x${effect.duration}`;
    default:
      return effect.kind;
  }
}

function describePassive(passive) {
  if (!passive) {
    return '';
  }
  const parts = [];
  if (passive.stat && typeof passive.amount === 'number') {
    parts.push(`+${passive.amount} ${passive.stat.toUpperCase()}`);
  }
  if (typeof passive.defPenalty === 'number') {
    parts.push(`-${passive.defPenalty} DEF`);
  }
  if (typeof passive.chainBonus === 'number') {
    parts.push(`+${Math.round(passive.chainBonus * 100)}% per chain`);
  }
  if (typeof passive.comboBonus === 'number') {
    parts.push(`combo>=${passive.comboThreshold ?? 0} -> +${Math.round(passive.comboBonus * 100)}%`);
  }
  return parts.join(', ');
}

function describeSkill(skill) {
  const segments = [];
  segments.push(`${skill.name} — ${skill.category || skill.type}`);
  if (skill.power) {
    const hitsLabel = skill.hits && skill.hits > 1 ? ` x${skill.hits}` : '';
    segments.push(`Power ${skill.power}${hitsLabel}`);
  }
  if (skill.cooldown) {
    segments.push(`CD ${skill.cooldown}`);
  }
  const effectText = describeEffect(skill.effect);
  if (effectText) {
    segments.push(effectText);
  }
  const passiveText = describePassive(skill.passive);
  if (passiveText) {
    segments.push(passiveText);
  }
  return segments.join(' · ');
}

function mergeStats(culture, cls, god) {
  return {
    hp: culture.baseStats.hp + cls.baseStats.hp + (god.bonus.hp || 0),
    atk: culture.baseStats.atk + cls.baseStats.atk + (god.bonus.atk || 0),
    def: culture.baseStats.def + cls.baseStats.def + (god.bonus.def || 0),
    spd: culture.baseStats.spd + cls.baseStats.spd + (god.bonus.spd || 0)
  };
}

function renderResult(stats, loadout) {
  statsList.innerHTML = '';
  Object.entries(stats).forEach(([key, value]) => {
    const li = document.createElement('li');
    li.textContent = `${key.toUpperCase()}: ${value}`;
    statsList.appendChild(li);
  });

  skillsList.innerHTML = '';
  if (loadout.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'None — basic attacks only.';
    skillsList.appendChild(li);
    return;
  }
  loadout.forEach((skill, index) => {
    const li = document.createElement('li');
    const summary = describeSkill(skill);
    const slot = `<span class="muted">Slot ${index + 1}</span> `;
    if (skill.description) {
      li.innerHTML = `${slot}<strong>${summary}</strong><br><span class="skill-desc">${skill.description}</span>`;
    } else {
      li.innerHTML = `${slot}<strong>${summary}</strong>`;
    }
    skillsList.appendChild(li);
  });
}

// v10: show the description and stat contribution of the selected
// culture and deity so the expanded roster is browsable from the form.
function statContribLine(stats) {
  const order = ['hp', 'atk', 'def', 'spd'];
  const parts = order
    .filter(key => stats && stats[key])
    .map(key => `${key.toUpperCase()} ${stats[key] > 0 ? '+' : ''}${stats[key]}`);
  return parts.length ? parts.join(' · ') : 'No stat change';
}

function originBlock(label, entry, statsKey) {
  if (!entry) {
    return `<div><h3>${label}</h3><p class="muted">—</p></div>`;
  }
  return `<div>
    <h3>${label} — ${entry.name}</h3>
    <p class="origin-desc">${entry.description || ''}</p>
    <p class="origin-stats">${statContribLine(entry[statsKey] || {})}</p>
  </div>`;
}

function renderOrigin() {
  if (!originInfo) return;
  const culture = cultures.find(item => item.id === cultureSelect.value);
  const god = gods.find(item => item.id === godSelect.value);
  originInfo.innerHTML =
    originBlock('Culture', culture, 'baseStats') +
    originBlock('Deity', god, 'bonus');
}

function buildCharacter() {
  const culture = cultures.find(item => item.id === cultureSelect.value);
  const cls = classes.find(item => item.id === classSelect.value);
  const god = gods.find(item => item.id === godSelect.value);
  if (!culture || !cls || !god) {
    return;
  }
  const stats = mergeStats(culture, cls, god);
  const loadout = resolveLoadout();
  renderResult(stats, loadout);

  saveBuildData({
    cultureId: culture.id,
    classId: cls.id,
    godId: god.id,
    stats,
    skillLoadoutIds: loadout.map(skill => skill.id),
    skillLoadout: loadout.map(skill => ({ ...skill })),
    // Legacy single-skill fields, kept so older version pages still read a build.
    skillId: loadout[0]?.id || null,
    skill: loadout[0] ? { ...loadout[0] } : null
  });
}

buildForm.addEventListener('submit', event => {
  event.preventDefault();
  buildCharacter();
});

loadData().then(() => {
  populateSelect(cultureSelect, cultures);
  populateSelect(classSelect, classes);
  populateSelect(godSelect, gods);
  skillSelects.forEach(sel => populateSkillSelect(sel, skills));

  const savedBuild = loadSavedBuild();
  if (savedBuild) {
    applySavedBuild(savedBuild);
  } else if (skillSelects[0] && skills[0]) {
    // Fresh build: start with one skill in slot 1.
    skillSelects[0].value = skills[0].id;
  }
  buildCharacter();
  renderOrigin();

  // Live update: changing any pick rebuilds the result and origin panel.
  [cultureSelect, classSelect, godSelect, ...skillSelects].forEach(select => {
    select?.addEventListener('change', () => {
      buildCharacter();
      renderOrigin();
    });
  });
}).catch(error => {
  console.error('Data load error', error);
});
