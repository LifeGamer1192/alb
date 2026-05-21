const TILE_WALL = 'wall';
const TILE_FLOOR = 'floor';
const TILE_STAIRS = 'stairs';
const TILE_TREASURE = 'treasure';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

function roomsOverlap(a, b, margin = 1) {
  return !(
    a.x + a.w + margin <= b.x ||
    b.x + b.w + margin <= a.x ||
    a.y + a.h + margin <= b.y ||
    b.y + b.h + margin <= a.y
  );
}

function generateRooms(width, height, count) {
  const rooms = [];
  let attempts = 0;
  while (rooms.length < count && attempts < count * 30) {
    attempts += 1;
    const w = randInt(3, 6);
    const h = randInt(3, 5);
    const x = randInt(1, width - w - 2);
    const y = randInt(1, height - h - 2);
    const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    if (rooms.every(other => !roomsOverlap(room, other))) {
      rooms.push(room);
    }
  }
  return rooms;
}

function carveRoom(tiles, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      tiles[y][x] = TILE_FLOOR;
    }
  }
}

function carveCorridor(tiles, a, b) {
  let x = a.cx;
  let y = a.cy;
  const horizontalFirst = Math.random() < 0.5;
  if (horizontalFirst) {
    while (x !== b.cx) {
      tiles[y][x] = TILE_FLOOR;
      x += x < b.cx ? 1 : -1;
    }
    while (y !== b.cy) {
      tiles[y][x] = TILE_FLOOR;
      y += y < b.cy ? 1 : -1;
    }
  } else {
    while (y !== b.cy) {
      tiles[y][x] = TILE_FLOOR;
      y += y < b.cy ? 1 : -1;
    }
    while (x !== b.cx) {
      tiles[y][x] = TILE_FLOOR;
      x += x < b.cx ? 1 : -1;
    }
  }
  tiles[y][x] = TILE_FLOOR;
}

function floorCellsInRoom(room, excludeCenter = false) {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (!excludeCenter || !(x === room.cx && y === room.cy)) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function pickPositionInRoom(room, exclusions = []) {
  const cells = floorCellsInRoom(room).filter(c => !exclusions.some(e => e.x === c.x && e.y === c.y));
  if (cells.length === 0) {
    return { x: room.cx, y: room.cy };
  }
  return cells[Math.floor(Math.random() * cells.length)];
}

// --- v12: three floor layout patterns. Each returns { tiles, rooms } where
// `rooms` is a list of rectangular regions used to place the player,
// enemies, treasure and stairs. ---

// Pattern 1: open rooms joined by corridors (the classic layout).
function layoutRooms(width, height, roomTarget) {
  const tiles = createEmptyTiles(width, height);
  const rooms = generateRooms(width, height, roomTarget);
  rooms.forEach(r => carveRoom(tiles, r));
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(tiles, rooms[i - 1], rooms[i]);
  }
  return { tiles, rooms };
}

// Pattern 2: a thin perfect maze (recursive backtracker) with a few small
// chambers carved in as spots to place the player, enemies and stairs.
function layoutMaze(width, height) {
  const tiles = createEmptyTiles(width, height);
  const inBounds = (x, y) => x > 0 && y > 0 && x < width - 1 && y < height - 1;
  tiles[1][1] = TILE_FLOOR;
  const stack = [{ x: 1, y: 1 }];
  const steps = [{ dx: 0, dy: -2 }, { dx: 0, dy: 2 }, { dx: -2, dy: 0 }, { dx: 2, dy: 0 }];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const opts = steps.filter(d => {
      const nx = cur.x + d.dx, ny = cur.y + d.dy;
      return inBounds(nx, ny) && tiles[ny][nx] === TILE_WALL;
    });
    if (opts.length === 0) { stack.pop(); continue; }
    const d = opts[randInt(0, opts.length - 1)];
    tiles[cur.y + d.dy / 2][cur.x + d.dx / 2] = TILE_FLOOR;
    tiles[cur.y + d.dy][cur.x + d.dx] = TILE_FLOOR;
    stack.push({ x: cur.x + d.dx, y: cur.y + d.dy });
  }
  // Small chambers double as placement rooms; each 3x3 block overlaps the
  // maze it is carved into, so the floor stays fully connected.
  const rooms = [];
  let attempts = 0;
  while (rooms.length < 7 && attempts < 200) {
    attempts += 1;
    const w = 3, h = 3;
    const x = randInt(1, width - w - 2);
    const y = randInt(1, height - h - 2);
    const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    if (rooms.some(r => roomsOverlap(room, r, 1))) continue;
    carveRoom(tiles, room);
    rooms.push(room);
  }
  return { tiles, rooms };
}

// Pattern 3: a rogue-style grid of separate rooms, each joined to its
// right and lower neighbour.
function layoutCells(width, height) {
  const tiles = createEmptyTiles(width, height);
  const cols = 3, rows = 2;
  const cellW = Math.floor(width / cols);
  const cellH = Math.floor(height / rows);
  const grid = [];
  const rooms = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const w = randInt(3, 4);
      const h = randInt(3, 4);
      const x = c * cellW + randInt(1, Math.max(1, cellW - w - 1));
      const y = r * cellH + randInt(1, Math.max(1, cellH - h - 1));
      const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
      carveRoom(tiles, room);
      grid[r][c] = room;
      rooms.push(room);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1) carveCorridor(tiles, grid[r][c], grid[r][c + 1]);
      if (r < rows - 1) carveCorridor(tiles, grid[r][c], grid[r + 1][c]);
    }
  }
  return { tiles, rooms };
}

const FLOOR_PATTERNS = ['rooms', 'maze', 'cells'];

function buildLayout(pattern, width, height, roomTarget) {
  if (pattern === 'maze') return layoutMaze(width, height);
  if (pattern === 'cells') return layoutCells(width, height);
  return layoutRooms(width, height, roomTarget);
}

function selectEnemyForFloor(types, floorIndex) {
  if (!types || types.length === 0) {
    return { id: 'goblin', name: 'Goblin', baseStats: { hp: 18, atk: 6, def: 2, spd: 4 }, drop: [] };
  }
  const eligible = types.filter(t => (t.minFloor || 1) <= floorIndex + 1);
  const pool = eligible.length > 0 ? eligible : types;
  return pool[Math.floor(Math.random() * pool.length)];
}

function scaleEnemyStats(base, floorIndex) {
  const factor = 1 + 0.2 * floorIndex;
  return {
    hp: Math.round(base.hp * factor),
    atk: Math.round(base.atk * factor),
    def: Math.round(base.def * factor),
    spd: base.spd
  };
}

function instantiateEnemy(template, floorIndex, position, indexInFloor) {
  const stats = scaleEnemyStats(template.baseStats, floorIndex);
  return {
    id: `${template.id}-f${floorIndex}-${indexInFloor}-${Math.random().toString(36).slice(2, 5)}`,
    type: template.id,
    name: template.name || template.id,
    glyph: template.glyph || 'E',
    x: position.x,
    y: position.y,
    hp: stats.hp,
    maxHp: stats.hp,
    atk: stats.atk,
    def: stats.def,
    spd: stats.spd,
    aiHint: template.aiHint || 'chase',
    dropTable: template.drop || []
  };
}

function selectTreasureItem(itemPool, floorIndex) {
  if (!itemPool || itemPool.length === 0) return null;
  const eligible = itemPool.filter(it => (it.minFloor || 1) <= floorIndex + 1 && it.treasure !== false);
  const pool = eligible.length > 0 ? eligible : itemPool;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return picked.id;
}

export const DungeonV6 = {
  TILE_WALL,
  TILE_FLOOR,
  TILE_STAIRS,
  TILE_TREASURE,

  createFloor({
    width = 18,
    height = 12,
    roomTarget = 5,
    enemyCount = 4,
    treasureCount = 1,
    floorIndex = 0,
    enemyTypes = [],
    itemPool = [],
    placeStairs = true,
    pattern = null
  } = {}) {
    // v12: each floor randomly picks one of three layout patterns.
    const chosenPattern = pattern || FLOOR_PATTERNS[randInt(0, FLOOR_PATTERNS.length - 1)];
    const layout = buildLayout(chosenPattern, width, height, roomTarget);
    const tiles = layout.tiles;
    const rooms = layout.rooms;
    if (rooms.length === 0) {
      const fallback = { x: 1, y: 1, w: 4, h: 3, cx: 2, cy: 2 };
      carveRoom(tiles, fallback);
      rooms.push(fallback);
    }

    const player = { x: rooms[0].cx, y: rooms[0].cy };

    const occupied = [player];
    const enemies = [];
    const enemyRooms = rooms.slice(1);
    if (enemyRooms.length === 0) enemyRooms.push(rooms[0]);
    for (let i = 0; i < enemyCount; i++) {
      const room = enemyRooms[i % enemyRooms.length];
      const position = pickPositionInRoom(room, occupied);
      occupied.push(position);
      const template = selectEnemyForFloor(enemyTypes, floorIndex);
      enemies.push(instantiateEnemy(template, floorIndex, position, i));
    }

    const items = [];
    for (let i = 0; i < treasureCount; i++) {
      const candidateRooms = rooms.slice(1);
      const pickRoom = candidateRooms.length > 0
        ? candidateRooms[Math.floor(Math.random() * candidateRooms.length)]
        : rooms[0];
      const position = pickPositionInRoom(pickRoom, occupied);
      occupied.push(position);
      const itemId = selectTreasureItem(itemPool, floorIndex);
      if (itemId) {
        tiles[position.y][position.x] = TILE_TREASURE;
        items.push({ x: position.x, y: position.y, itemId });
      }
    }

    let stairs = null;
    if (placeStairs) {
      const stairRoom = rooms[rooms.length - 1];
      const position = pickPositionInRoom(stairRoom, occupied);
      tiles[position.y][position.x] = TILE_STAIRS;
      stairs = { x: position.x, y: position.y };
    }

    return {
      floorIndex,
      width,
      height,
      tiles,
      player,
      enemies,
      items,
      stairs,
      rooms,
      pattern: chosenPattern
    };
  },

  cloneFloor(floor) {
    return {
      ...floor,
      tiles: floor.tiles.map(row => row.slice()),
      enemies: floor.enemies.map(e => ({ ...e })),
      items: floor.items.map(it => ({ ...it })),
      player: { ...floor.player },
      stairs: floor.stairs ? { ...floor.stairs } : null,
      rooms: floor.rooms ? floor.rooms.map(r => ({ ...r })) : []
    };
  },

  findPath(start, goal, tiles, width, height) {
    const queue = [start];
    const visited = new Set([`${start.x},${start.y}`]);
    const parent = new Map();
    while (queue.length > 0) {
      const current = queue.shift();
      if (current.x === goal.x && current.y === goal.y) {
        const path = [];
        let key = `${current.x},${current.y}`;
        while (key) {
          const [x, y] = key.split(',').map(Number);
          path.unshift({ x, y });
          key = parent.get(key);
        }
        return path;
      }
      for (const dir of [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }]) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nk = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (visited.has(nk)) continue;
        const t = tiles[ny][nx];
        if (t === TILE_WALL) continue;
        visited.add(nk);
        parent.set(nk, `${current.x},${current.y}`);
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  },

  getNearestEnemyPath(player, enemies, tiles, width, height) {
    if (!enemies || enemies.length === 0) return null;
    let bestPath = null;
    let nearest = null;
    for (const enemy of enemies) {
      const path = this.findPath(player, { x: enemy.x, y: enemy.y }, tiles, width, height);
      if (path && (!bestPath || path.length < bestPath.length)) {
        bestPath = path;
        nearest = enemy;
      }
    }
    if (!bestPath) return null;
    return { enemy: nearest, path: bestPath };
  },

  getPathTo(start, goal, tiles, width, height) {
    return this.findPath(start, goal, tiles, width, height);
  }
};
