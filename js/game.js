import { Dungeon } from './dungeon.js';

const generateButton = document.getElementById('generate-button');
const simulateButton = document.getElementById('simulate-button');
const mapRoot = document.getElementById('map-root');
const infoRoot = document.getElementById('map-info');

let floor = null;
let turnCount = 1;

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
      if (tileType === 'floor') {
        tile.classList.add('tile-floor');
      } else {
        tile.classList.add('tile-wall');
      }

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
          tile.textContent = 'E';
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

  infoRoot.innerHTML = `
    <p><strong>Status:</strong> ${status}</p>
    <p><strong>Floor size:</strong> ${floor.width} x ${floor.height}</p>
    <p><strong>Turn:</strong> ${turnCount}</p>
    <p><strong>Enemies left:</strong> ${floor.enemies.length}</p>
    <p><strong>Player position:</strong> ${formatPos(floor.player)}</p>
    <p><strong>Nearest enemy:</strong> ${floor.enemies.length ? nearest : 'None'}</p>
  `;
}

function update(statusText = '') {
  if (!floor) {
    floor = Dungeon.createFloor(12, 8, 4);
    turnCount = 1;
  }

  const pathResult = Dungeon.getNearestEnemyPath(floor.player, floor.enemies, floor.tiles, floor.width, floor.height);
  floor.path = pathResult ? pathResult.path : [];
  renderDungeon(floor);
  renderInfo(floor, statusText);
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
  floor.player = { x: nextStep.x, y: nextStep.y };

  let statusText = `Moved toward ${pathResult.enemy.type} at ${formatPos(pathResult.enemy)}.`;
  if (enemyIndex !== -1) {
    floor.enemies.splice(enemyIndex, 1);
    statusText = `Defeated ${pathResult.enemy.type} at ${formatPos(nextStep)}!`;
  }

  turnCount += 1;
  update(statusText);
}

generateButton.addEventListener('click', () => {
  floor = Dungeon.createFloor(12, 8, 4);
  turnCount = 1;
  update('Generated a new dungeon floor.');
});

if (simulateButton) {
  simulateButton.addEventListener('click', advanceTurn);
}

floor = Dungeon.createFloor(12, 8, 4);
update('Dungeon loaded. Advance turns to move toward enemies.');
