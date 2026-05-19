const cultureSelect = document.getElementById('culture-select');
const classSelect = document.getElementById('class-select');
const godSelect = document.getElementById('god-select');
const skillSelect = document.getElementById('skill-select');
const statsList = document.getElementById('stats-list');
const skillsList = document.getElementById('skills-list');
const buildForm = document.getElementById('build-form');

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
  if (skillSelect && savedBuild.skillId) {
    skillSelect.value = savedBuild.skillId;
  }
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

function resolveSelectedSkill() {
  if (!skillSelect) {
    return null;
  }
  return skillMap.get(skillSelect.value) || null;
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

function mergeStats(culture, cls, god) {
  return {
    hp: culture.baseStats.hp + cls.baseStats.hp + (god.bonus.hp || 0),
    atk: culture.baseStats.atk + cls.baseStats.atk + (god.bonus.atk || 0),
    def: culture.baseStats.def + cls.baseStats.def + (god.bonus.def || 0),
    spd: culture.baseStats.spd + cls.baseStats.spd + (god.bonus.spd || 0)
  };
}

function resolveSkills(cls) {
  return cls.skills.map(skillId => skillMap.get(skillId)).filter(Boolean);
}

function renderResult(stats, skillItems, selectedSkill = null) {
  statsList.innerHTML = '';
  Object.entries(stats).forEach(([key, value]) => {
    const li = document.createElement('li');
    li.textContent = `${key.toUpperCase()}: ${value}`;
    statsList.appendChild(li);
  });

  skillsList.innerHTML = '';
  if (skillItems.length === 0) {
    const noneItem = document.createElement('li');
    noneItem.textContent = 'None';
    skillsList.appendChild(noneItem);
    return;
  }
  if (selectedSkill && !skillItems.some(skill => skill.id === selectedSkill.id)) {
    skillItems.unshift(selectedSkill);
  }

  skillItems.forEach(skill => {
    const li = document.createElement('li');
    li.textContent = `${skill.name} — ${skill.type} (Power ${skill.power})`;
    skillsList.appendChild(li);
  });
}

function buildCharacter() {
  const culture = cultures.find(item => item.id === cultureSelect.value);
  const cls = classes.find(item => item.id === classSelect.value);
  const god = gods.find(item => item.id === godSelect.value);
  if (!culture || !cls || !god) {
    return;
  }
  const stats = mergeStats(culture, cls, god);
  const skillItems = resolveSkills(cls);
  const selectedSkill = resolveSelectedSkill();
  renderResult(stats, skillItems, selectedSkill);

  saveBuildData({
    cultureId: culture.id,
    classId: cls.id,
    godId: god.id,
    skillId: selectedSkill?.id || null,
    stats,
    skill: selectedSkill ? { ...selectedSkill } : null
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
  if (skillSelect) {
    populateSelect(skillSelect, skills);
  }

  const savedBuild = loadSavedBuild();
  applySavedBuild(savedBuild);
  buildCharacter();
}).catch(error => {
  console.error('Data load error', error);
});
