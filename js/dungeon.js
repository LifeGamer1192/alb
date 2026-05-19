const TILE_WALL = 'wall';
const TILE_FLOOR = 'floor';
const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 }
];

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

function posKey(x, y) {
  return `${x},${y}`;
}

function parseKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function isWithin(x, y, width, height) {
  return x >= 0 && x < width && y >= 0 && y < height;
}

function carveFloor(tiles, width, height) {
  const maxSteps = Math.floor(width * height * 0.45);
  let x = 1;
  let y = 1;
  tiles[y][x] = TILE_FLOOR;

  for (let step = 0; step < maxSteps; step++) {
    const direction = Math.floor(Math.random() * 4);
    const nextX = x + DIRECTIONS[direction].dx;
    const nextY = y + DIRECTIONS[direction].dy;

    if (isWithin(nextX, nextY, width - 1, height - 1) && nextX > 0 && nextY > 0) {
      x = nextX;
      y = nextY;
      tiles[y][x] = TILE_FLOOR;
      tiles[Math.max(1, y - 1)][x] = TILE_FLOOR;
      tiles[Math.min(height - 2, y + 1)][x] = TILE_FLOOR;
      tiles[y][Math.max(1, x - 1)] = TILE_FLOOR;
      tiles[y][Math.min(width - 2, x + 1)] = TILE_FLOOR;
    }
  }
}

function getReachableKeys(start, tiles, width, height) {
  const queue = [start];
  const visited = new Set([posKey(start.x, start.y)]);

  while (queue.length > 0) {
    const current = queue.shift();

    for (const direction of DIRECTIONS) {
      const nextX = current.x + direction.dx;
      const nextY = current.y + direction.dy;
      const key = posKey(nextX, nextY);

      if (
        isWithin(nextX, nextY, width, height) &&
        !visited.has(key) &&
        tiles[nextY][nextX] === TILE_FLOOR
      ) {
        visited.add(key);
        queue.push({ x: nextX, y: nextY });
      }
    }
  }

  return visited;
}

function findPath(start, goal, tiles, width, height) {
  const queue = [start];
  const visited = new Set([posKey(start.x, start.y)]);
  const parent = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = posKey(current.x, current.y);

    if (current.x === goal.x && current.y === goal.y) {
      const path = [];
      let pointer = currentKey;
      while (pointer) {
        path.unshift(parseKey(pointer));
        pointer = parent.get(pointer);
      }
      return path;
    }

    for (const direction of DIRECTIONS) {
      const nextX = current.x + direction.dx;
      const nextY = current.y + direction.dy;
      const nextKey = posKey(nextX, nextY);

      if (
        isWithin(nextX, nextY, width, height) &&
        !visited.has(nextKey) &&
        tiles[nextY][nextX] === TILE_FLOOR
      ) {
        visited.add(nextKey);
        parent.set(nextKey, currentKey);
        queue.push({ x: nextX, y: nextY });
      }
    }
  }

  return null;
}

function carveCorridor(from, to, tiles) {
  let x = from.x;
  let y = from.y;

  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    tiles[y][x] = TILE_FLOOR;
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    tiles[y][x] = TILE_FLOOR;
  }
}

function connectFloorAreas(tiles, width, height, player) {
  const reachable = getReachableKeys(player, tiles, width, height);
  const floorCells = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y][x] === TILE_FLOOR) {
        const key = posKey(x, y);
        if (!reachable.has(key)) {
          floorCells.push({ x, y, key });
        }
      }
    }
  }

  if (floorCells.length === 0) {
    return;
  }

  const reachableTiles = Array.from(reachable).map(parseKey);
  const target = floorCells[0];
  let best = null;
  let bestDistance = Infinity;

  for (const cell of reachableTiles) {
    const distance = Math.abs(cell.x - target.x) + Math.abs(cell.y - target.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = cell;
    }
  }

  if (best) {
    carveCorridor(best, target, tiles);
  }

  connectFloorAreas(tiles, width, height, player);
}

function chooseEnemyPositions(tiles, width, height, count, player) {
  const candidates = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y][x] === TILE_FLOOR && !(player.x === x && player.y === y)) {
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
  createFloor(width = 12, height = 8, enemyCount = 4) {
    const tiles = createEmptyTiles(width, height);
    const player = { x: 1, y: 1 };

    tiles[player.y][player.x] = TILE_FLOOR;
    carveFloor(tiles, width, height);
    connectFloorAreas(tiles, width, height, player);

    const enemies = chooseEnemyPositions(tiles, width, height, enemyCount, player);

    return {
      width,
      height,
      tiles,
      player,
      enemies,
      path: []
    };
  },

  getNearestEnemyPath(player, enemies, tiles, width, height) {
    if (!enemies || enemies.length === 0) {
      return null;
    }

    let nearest = null;
    let bestPath = null;

    for (const enemy of enemies) {
      const path = findPath(player, enemy, tiles, width, height);
      if (path && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
        nearest = enemy;
      }
    }

    if (!bestPath) {
      return null;
    }

    return {
      enemy: nearest,
      path: bestPath
    };
  }
};
