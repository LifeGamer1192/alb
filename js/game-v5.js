import { Dungeon } from './dungeon.js';

const generateButton = document.getElementById('generate-button');
const simulateButton = document.getElementById('simulate-button');
const mapRoot = document.getElementById('map-root');
const infoRoot = document.getElementById('map-info');

const BUILD_STORAGE_KEY = 'alb-character-build';
let floor = null;
let turnCount = 1;

function loadBuild() {
  try {
    const raw = localStorage.getItem(BUILD_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

const savedBuild = loadBuild();
const playerStats = savedBuild?.stats || { hp: 100, atk: 16, def: 10, spd: 5 };
const selectedSkill = savedBuild?.skill || null;

function posKey(pos) {
  return `${pos.x},${pos.y}`;
}

function formatPos(pos) {
  return `(${pos.x + 1}, ${pos.y + 1})`;
}

function renderDungeon(floor) {
  mapRoot.innerHTML = '';
  mapRoot.style.gridTemplateColumns = `repeat(${floor.width}, 32px)`;

  const pathSet = new Set((floor.path || []).map(posKey));

  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const tile = document.createElement('div');
      tile.className = 'tile';

      const tileType = floor.tiles[y][x];
      tile.classList.add(tileType === 'floor' ? 'tile-floor' : 'tile-wall');

      if (pathSet.has(posKey({ x, y })) && tileType === 'floor') {
        tile.classList.add('tile-path');
      }

      if (floor.player.x === x && floor.player.y === y) {
        tile.classList.add('tile-player');
        tile.textContent = 'P';
      } else {
        const enemy = floor.enemies.find(e => e.x === x && e.y === y);
        if (enemy) {
          tile.classList.add('tile-enemy');
          tile.textContent = enemy.hp > 0 ? 'E' : 'X';
        }
      }

      mapRoot.appendChild(tile);
    }
  }
}

function renderInfo(floor, statusText = '') {
  const pathResult = Dungeon.getNearestEnemyPath(floor.player, floor.enemies, floor.tiles, floor.width, floor.height);
  const status = statusText || (floor.enemies.length === 0 ? 'All enemies defeated!' : 'Ready for next turn.');
  const nearest = pathResult ? `${formatPos(pathResult.enemy)} (${pathResult.path.length - 1} steps)` : 'No reachable enemy';
  const skillLabel = selectedSkill ? `${selectedSkill.name} (${selectedSkill.type})` : 'None';

  infoRoot.innerHTML = `
    <p><strong>Status:</strong> ${status}</p>
    <p><strong>Selected skill:</strong> ${skillLabel}</p>
    <p><strong>Floor size:</strong> ${floor.width} x ${floor.height}</p>
    <p><strong>Turn:</strong> ${turnCount}</p>
    <p><strong>Enemies left:</strong> ${floor.enemies.length}</p>
    <p><strong>Player HP:</strong> ${playerStats.hp}</p>
    <p><strong>Nearest enemy:</strong> ${floor.enemies.length ? nearest : 'None'}</p>
  `;
}

function attackEnemy(enemy) {
  const baseDamage = playerStats.atk;
  const skillBonus = selectedSkill?.type === 'attack' ? selectedSkill.power : 0;
  const damage = baseDamage + skillBonus;

  enemy.hp -= damage;
  if (enemy.hp <= 0) {
    return { defeated: true, damage };
  }
  return { defeated: false, damage };
}

function update(statusText = '') {
  if (!floor) {
    floor = createFloor(12, 8, 4);
    turnCount = 1;
  }

  const pathResult = Dungeon.getNearestEnemyPath(floor.player, floor.enemies, floor.tiles, floor.width, floor.height);
  floor.path = pathResult ? pathResult.path : [];
  renderDungeon(floor);
  renderInfo(floor, statusText);
}

function createFloor(width = 12, height = 8, enemyCount = 4) {
  const baseFloor = Dungeon.createFloor(width, height, enemyCount);
  const enemies = baseFloor.enemies.map(enemy => ({ ...enemy, hp: 18, maxHp: 18 }));
  return {
    ...baseFloor,
    enemies,
    path: []
  };
}

function advanceTurn() {
  if (!floor) {
    return;
  }

  if (floor.enemies.length === 0) {
    update('All enemies are defeated.');
    return;
  }

  const pathResult = Dungeon.getNearestEnemyPath(floor.player, floor.enemies, floor.tiles, floor.width, floor.height);
  if (!pathResult || pathResult.path.length < 2) {
    update('No reachable enemy. Please regenerate the dungeon.');
    return;
  }

  const nextStep = pathResult.path[1];
  const enemyIndex = floor.enemies.findIndex(e => e.x === nextStep.x && e.y === nextStep.y);
  let statusText = `Moved toward ${pathResult.enemy.type} at ${formatPos(pathResult.enemy)}.`;

  if (enemyIndex !== -1) {
    const enemy = floor.enemies[enemyIndex];
    const result = attackEnemy(enemy);
    if (result.defeated) {
      floor.enemies.splice(enemyIndex, 1);
      statusText = `Attacked and defeated ${enemy.type} with ${selectedSkill?.name || 'basic strike'}!`;
    } else {
      statusText = `Attacked ${enemy.type} for ${result.damage} damage. Enemy HP left: ${enemy.hp}.`;
    }
  } else {
    floor.player = { x: nextStep.x, y: nextStep.y };
  }

  turnCount += 1;
  update(statusText);
}

generateButton.addEventListener('click', () => {
  floor = createFloor(12, 8, 4);
  turnCount = 1;
  update('Generated a new dungeon floor.');
});

simulateButton.addEventListener('click', advanceTurn);

floor = createFloor(12, 8, 4);
update('Dungeon loaded. Advance turns to fight enemies.');
