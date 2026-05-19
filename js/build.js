const cultureSelect = document.getElementById('culture-select');
const classSelect = document.getElementById('class-select');
const godSelect = document.getElementById('god-select');
const skillSelect = document.getElementById('skill-select');
const statsList = document.getElementById('stats-list');
const skillsList = document.getElementById('skills-list');
const buildForm = document.getElementById('build-form');

let cultures = [];
let classes = [];
let gods = [];
let skills = [];
const skillMap = new Map();

async function loadData() {
  const [cultureData, classData, godData, skillData] = await Promise.all([
    fetch('../data/cultures.json').then(r => r.json()),
    fetch('../data/classes.json').then(r => r.json()),
    fetch('../data/gods.json').then(r => r.json()),
    fetch('../data/skills.json').then(r => r.json())
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
    noneItem.textContent = 'なし';
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
  buildCharacter();
}).catch(error => {
  console.error('データ読み込みエラー', error);
});
