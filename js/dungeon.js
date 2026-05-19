// dungeon.js
// ダンジョン生成ロジックと配置の雛形を定義します.
const TILE_WALL = 'wall';
const TILE_FLOOR = 'floor';

function createEmptyTiles(width, height) {
  const tiles = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = TILE_WALL;
    }
  }
  return tiles;
}

function carveFloor(tiles, width, height) {
  const maxSteps = Math.floor(width * height * 0.48);
  let x = 1;
  let y = 1;
  tiles[y][x] = TILE_FLOOR;

  for (let step = 0; step < maxSteps; step++) {
    const direction = Math.floor(Math.random() * 4);
    if (direction === 0 && x + 1 < width - 1) x++;
    if (direction === 1 && x - 1 > 0) x--;
    if (direction === 2 && y + 1 < height - 1) y++;
    if (direction === 3 && y - 1 > 0) y--;
    tiles[y][x] = TILE_FLOOR;
    if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
      tiles[y][x] = TILE_FLOOR;
      tiles[y - 1][x] = TILE_FLOOR;
      tiles[y + 1][x] = TILE_FLOOR;
      tiles[y][x - 1] = TILE_FLOOR;
      tiles[y][x + 1] = TILE_FLOOR;
    }
  }
}

function chooseEnemyPositions(tiles, width, height, count) {
  const candidates = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y][x] === TILE_FLOOR) {
        candidates.push({ x, y });
      }
    }
  }
  const enemies = [];
  while (enemies.length < count && candidates.length > 0) {
    const index = Math.floor(Math.random() * candidates.length);
    const pos = candidates.splice(index, 1)[0];
    enemies.push({ x: pos.x, y: pos.y, type: 'goblin' });
  }
  return enemies;
}

export const Dungeon = {
  createFloor(width = 12, height = 8) {
    const tiles = createEmptyTiles(width, height);
    carveFloor(tiles, width, height);

    const player = { x: 1, y: 1 };
    if (tiles[player.y][player.x] === TILE_WALL) {
      tiles[player.y][player.x] = TILE_FLOOR;
    }

    const enemies = chooseEnemyPositions(tiles, width, height, 4);

    return {
      width,
      height,
      tiles,
      player,
      enemies
    };
  }
};
