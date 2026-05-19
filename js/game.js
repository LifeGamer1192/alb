import { Dungeon } from './dungeon.js';

const generateButton = document.getElementById('generate-button');
const mapRoot = document.getElementById('map-root');
const infoRoot = document.getElementById('map-info');

function renderDungeon(floor) {
  mapRoot.innerHTML = '';
  mapRoot.style.gridTemplateColumns = `repeat(${floor.width}, 32px)`;

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
      if (floor.player.x === x && floor.player.y === y) {
        tile.classList.add('tile-player');
        tile.textContent = 'P';
      }
      const enemy = floor.enemies.find(e => e.x === x && e.y === y);
      if (enemy) {
        tile.classList.add('tile-enemy');
        tile.textContent = 'E';
      }
      mapRoot.appendChild(tile);
    }
  }
}

function renderInfo(floor) {
  infoRoot.innerHTML = `
    <p>サイズ: ${floor.width} x ${floor.height}</p>
    <p>敵の数: ${floor.enemies.length}</p>
    <p>プレイヤー位置: (${floor.player.x + 1}, ${floor.player.y + 1})</p>
  `;
}

function update() {
  const floor = Dungeon.createFloor(12, 8);
  renderDungeon(floor);
  renderInfo(floor);
}

generateButton.addEventListener('click', update);
update();
