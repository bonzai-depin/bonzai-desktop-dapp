// Deterministic world planning. A local code model needs minutes to write a
// level as JavaScript and still places walls, props and exits by guesswork.
// A blueprint is a few bytes of data; the layout below is derived from it
// without inference, so the same blueprint always gives the same playable map.
// Pure data: no Three.js, so placements, colliders and tests share one source.

export const WORLD_VERSION = 1;

/** Material IDs refer to the bundled scanned catalogue (MAT.scanned). */
export const WORLD_THEMES = Object.freeze({
  dungeon: { label: 'Stone dungeon', layout: 'rooms', floor: 'cobblestone_floor_01', wall: 'castle_brick_01', trim: 'dark_rock', prop: 'dark_planks',
    light: 0xffb066, lightIntensity: 22, wallHeight: 3.4, props: ['crate', 'barrel', 'rubble'],
    words: 'dungeon crypt castle keep medieval catacomb cellar prison donjon chateau cachot tomb' },
  station: { label: 'Space station', layout: 'rooms', floor: 'anti_slip_concrete', wall: 'blue_metal_plate', trim: 'metal_plate', prop: 'container_side',
    light: 0x7fd8ff, lightIntensity: 20, wallHeight: 3.2, props: ['crate', 'canister'], strips: 0x39c8ff,
    words: 'station space ship spaceship scifi sci-fi lab laboratory bunker reactor facility cyber futuristic vaisseau spatial base corridor' },
  temple: { label: 'Marble temple', layout: 'rooms', floor: 'marble_tiles', wall: 'granite_wall', trim: 'marble_01', prop: 'terracotta_floor_tiles',
    light: 0xffd9a0, lightIntensity: 24, wallHeight: 4.2, props: ['urn', 'rubble'], pillars: true,
    words: 'temple palace shrine museum hall sanctuary cathedral marble palais sanctuaire tomb pyramid' },
  forest: { label: 'Forest clearing', layout: 'terrain', ground: 'forest_floor', rock: 'mossy_rock', bark: 'bark_brown_01', stone: 'stacked_stone_wall',
    foliage: [0x3f6b2f, 0x55803a, 0x2f5a2b], tree: 'broadleaf', density: 1, relief: 1.3, light: 0xffc27a,
    words: 'forest wood woods jungle grove garden park meadow clearing nature foret bois jardin prairie swamp' },
  desert: { label: 'Desert ruins', layout: 'terrain', ground: 'sand_01', rock: 'sandstone_cracks', bark: 'bark_willow', stone: 'sandstone_cracks',
    foliage: [0x8a8f4a, 0x9a8f52], tree: 'palm', density: 0.3, relief: 1.8, light: 0xffb060, ruins: 2,
    words: 'desert dune sand oasis canyon ruin ruins egypt arid wasteland sable dunes mesa' },
  snow: { label: 'Snowfield', layout: 'terrain', ground: 'snow_02', rock: 'rock_boulder_cracked', bark: 'bark_brown_01', stone: 'castle_wall_slates',
    foliage: [0x2f5240, 0x3d6350, 0xdfe9ee], tree: 'pine', density: 0.8, relief: 1.6, light: 0xbfe0ff,
    words: 'snow snowy ice icy winter arctic tundra glacier frozen mountain neige enneige enneigee hiver glace montagne alpine' },
  moon: { label: 'Alien surface', layout: 'terrain', ground: 'moon_01', rock: 'moon_meteor_01', bark: 'dark_rock', stone: 'moon_meteor_01',
    foliage: [0x53e0c8, 0x8a6bff], tree: 'crystal', density: 0.35, relief: 2.2, light: 0x66e8ff,
    words: 'moon lunar alien planet mars crater asteroid lune planete extraterrestrial' },
});

export const WORLD_SIZES = Object.freeze({ small: { grid: 9, rooms: 4, half: 20 }, medium: { grid: 13, rooms: 6, half: 30 }, large: { grid: 17, rooms: 9, half: 42 } });
const CELL = 4, WALL = 0.5;

const words = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9-]+/g) || [];

export function seedFrom(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function randomSource(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(next.range(min, max + 1));
  next.pick = list => list[Math.floor(next() * list.length)];
  next.shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
  return next;
}

/** Explicit words in the brief decide the theme and size; the seed only varies what the brief leaves open. */
export function planWorld(prompt = '', { seed, theme, size, variation = 0 } = {}) {
  const terms = new Set(words(prompt));
  const base = seedFrom(String(prompt).trim().toLowerCase());
  const scores = Object.entries(WORLD_THEMES).map(([id, entry]) => [id, words(entry.words).filter(word => terms.has(word)).length]);
  const best = scores.reduce((a, b) => b[1] > a[1] ? b : a);
  const ids = Object.keys(WORLD_THEMES);
  const chosenTheme = theme || (best[1] > 0 ? best[0] : ids[base % ids.length]);
  const chosenSize = size || (['small', 'tiny', 'compact', 'mini', 'petit', 'petite'].some(word => terms.has(word)) ? 'small'
    : ['large', 'huge', 'vast', 'big', 'grand', 'grande', 'vaste', 'immense', 'sprawling'].some(word => terms.has(word)) ? 'large' : 'medium');
  const title = String(prompt).trim().slice(0, 80) || WORLD_THEMES[chosenTheme].label;
  return validateBlueprint({ v: WORLD_VERSION, theme: chosenTheme, size: chosenSize, seed: seed ?? ((base + Math.imul(variation, 0x9E3779B1)) >>> 0), title });
}

export function validateBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== 'object' || Array.isArray(blueprint)) throw new Error('World blueprint must be an object');
  if (blueprint.v !== WORLD_VERSION) throw new Error('Unsupported world blueprint version');
  if (!WORLD_THEMES[blueprint.theme]) throw new Error(`Unknown world theme ${blueprint.theme}. Use one of: ${Object.keys(WORLD_THEMES).join(', ')}`);
  if (!WORLD_SIZES[blueprint.size]) throw new Error(`Unknown world size ${blueprint.size}. Use small, medium or large`);
  if (!Number.isInteger(blueprint.seed) || blueprint.seed < 0 || blueprint.seed > 0xffffffff) throw new Error('World seed must be an unsigned 32-bit integer');
  return { v: WORLD_VERSION, theme: blueprint.theme, size: blueprint.size, seed: blueprint.seed, title: String(blueprint.title || WORLD_THEMES[blueprint.theme].label).slice(0, 80) };
}

// Smooth value noise: enough relief for terrain without a dependency.
function noise2(seed) {
  const hash = (x, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const fade = t => t * t * (3 - 2 * t);
  return (x, z) => {
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = fade(x - x0), fz = fade(z - z0);
    const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

/** Ground height in metres. Interiors are flat; terrain rises into a bowl at its edge. */
export function heightField(blueprint) {
  const theme = WORLD_THEMES[blueprint.theme];
  if (theme.layout !== 'terrain') return () => 0;
  const half = WORLD_SIZES[blueprint.size].half, noise = noise2(blueprint.seed), relief = theme.relief;
  const [spawn, exit] = terrainEnds(blueprint);
  const flat = (x, z, p) => Math.min(1, Math.hypot(x - p.x, z - p.z) / 9);
  return (x, z) => {
    const rolling = (noise(x / 17, z / 17) - .5) * 2 + (noise(x / 6.5 + 40, z / 6.5 - 12) - .5) * .5;
    const edge = Math.max(Math.abs(x), Math.abs(z)) / half;
    // Start and finish stay level so a player, a goal and their camera read clearly.
    return rolling * relief * flat(x, z, spawn) * flat(x, z, exit) + Math.pow(Math.max(0, Math.min(edge, 1.5) - .7) / .3, 2) * 1.6;
  };
}

function terrainEnds(blueprint) {
  const half = WORLD_SIZES[blueprint.size].half, random = randomSource(blueprint.seed ^ 0x51ED270B);
  const side = random() < .5 ? 1 : -1, reach = half * .62;
  return [{ x: -reach * side + random.range(-2, 2), z: reach + random.range(-2, 2) }, { x: reach * side + random.range(-2, 2), z: -reach + random.range(-2, 2) }];
}

const key = (x, z) => `${x},${z}`;

function roomsLayout(blueprint, theme) {
  const { grid, rooms: wanted } = WORLD_SIZES[blueprint.size], random = randomSource(blueprint.seed);
  const cells = new Map(), rooms = [];
  for (let attempt = 0; attempt < 400 && rooms.length < wanted; attempt++) {
    const w = random.int(2, 4), d = random.int(2, 4), x = random.int(1, grid - w - 1), z = random.int(1, grid - d - 1);
    if (rooms.some(room => x < room.x + room.w + 1 && x + w + 1 > room.x && z < room.z + room.d + 1 && z + d + 1 > room.z)) continue;
    rooms.push({ x, z, w, d, cx: x + Math.floor(w / 2), cz: z + Math.floor(d / 2) });
  }
  // A crowded draw can leave one room; two opposite corners always fit and keep a start and an exit.
  if (rooms.length < 2) { rooms.length = 0; rooms.push({ x: 1, z: 1, w: 2, d: 2, cx: 2, cz: 2 }, { x: grid - 3, z: grid - 3, w: 2, d: 2, cx: grid - 2, cz: grid - 2 }); }
  // Visit the nearest unvisited room each time: short corridors, no crossings through rooms.
  const order = [rooms[0]], rest = rooms.slice(1);
  while (rest.length) {
    const from = order[order.length - 1];
    rest.sort((a, b) => Math.hypot(a.cx - from.cx, a.cz - from.cz) - Math.hypot(b.cx - from.cx, b.cz - from.cz));
    order.push(rest.shift());
  }
  order.forEach((room, index) => { for (let x = room.x; x < room.x + room.w; x++) for (let z = room.z; z < room.z + room.d; z++) cells.set(key(x, z), index); });
  const carve = (a, b) => {
    let x = a.cx, z = a.cz;
    const step = () => { if (!cells.has(key(x, z))) cells.set(key(x, z), -1); };
    while (x !== b.cx) { x += Math.sign(b.cx - x); step(); }
    while (z !== b.cz) { z += Math.sign(b.cz - z); step(); }
  };
  for (let i = 1; i < order.length; i++) carve(order[i - 1], order[i]);
  if (order.length > 4) carve(order[order.length - 1], order[1]);

  const world = (x, z) => ({ x: (x - grid / 2 + .5) * CELL, z: (z - grid / 2 + .5) * CELL });
  // Breadth-first distance from the start decides the exit and enemy pressure.
  const distance = new Map([[key(order[0].cx, order[0].cz), 0]]), queue = [[order[0].cx, order[0].cz]];
  for (let head = 0; head < queue.length; head++) {
    const [x, z] = queue[head];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = key(x + dx, z + dz);
      if (cells.has(next) && !distance.has(next)) { distance.set(next, distance.get(key(x, z)) + 1); queue.push([x + dx, z + dz]); }
    }
  }
  const exitRoom = order.slice(1).reduce((far, room) => distance.get(key(room.cx, room.cz)) > distance.get(key(far.cx, far.cz)) ? room : far, order[1]);

  // One wall run per straight boundary instead of one box per cell edge.
  const edges = { x: new Map(), z: new Map() };
  for (const id of cells.keys()) {
    const [x, z] = id.split(',').map(Number);
    if (!cells.has(key(x, z - 1))) (edges.z.get(z) || edges.z.set(z, []).get(z)).push(x);
    if (!cells.has(key(x, z + 1))) (edges.z.get(z + 1) || edges.z.set(z + 1, []).get(z + 1)).push(x);
    if (!cells.has(key(x - 1, z))) (edges.x.get(x) || edges.x.set(x, []).get(x)).push(z);
    if (!cells.has(key(x + 1, z))) (edges.x.get(x + 1) || edges.x.set(x + 1, []).get(x + 1)).push(z);
  }
  const walls = [];
  for (const axis of ['x', 'z']) for (const [line, list] of edges[axis]) {
    const sorted = [...new Set(list)].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length;) {
      let j = i; while (sorted[j + 1] === sorted[j] + 1) j++;
      const start = (sorted[i] - grid / 2) * CELL - WALL / 2, end = (sorted[j] + 1 - grid / 2) * CELL + WALL / 2, at = (line - grid / 2) * CELL;
      walls.push(axis === 'z' ? { x: (start + end) / 2, z: at, w: end - start, d: WALL } : { x: at, z: (start + end) / 2, w: WALL, d: end - start });
      i = j + 1;
    }
  }
  const height = theme.wallHeight;
  const colliders = walls.map(wall => [wall.x - wall.w / 2, 0, wall.z - wall.d / 2, wall.x + wall.w / 2, height, wall.z + wall.d / 2]);

  const spawn = { ...world(order[0].cx, order[0].cz), y: 0 }, exit = { ...world(exitRoom.cx, exitRoom.cz), y: 0 };
  const props = [], pillars = [], lights = [], slots = [];
  for (const room of order) {
    const centre = world(room.cx, room.cz);
    if (lights.length < 8) lights.push({ x: (room.x + room.w / 2 - grid / 2) * CELL, y: height - .7, z: (room.z + room.d / 2 - grid / 2) * CELL, color: theme.light, intensity: theme.lightIntensity, range: Math.max(room.w, room.d) * CELL * 1.1 });
    const corners = [[room.x, room.z, -1, -1], [room.x + room.w - 1, room.z, 1, -1], [room.x, room.z + room.d - 1, -1, 1], [room.x + room.w - 1, room.z + room.d - 1, 1, 1]];
    for (const [x, z, sx, sz] of corners) {
      const p = world(x, z);
      if (theme.pillars) pillars.push({ x: p.x + sx * (CELL / 2 - .62), z: p.z + sz * (CELL / 2 - .62), r: .32 });
      // Props stay in true corners so they never close a doorway.
      else if (!cells.has(key(x + sx, z)) && !cells.has(key(x, z + sz)) && random() < .7 && !(p.x === spawn.x && p.z === spawn.z) && !(p.x === exit.x && p.z === exit.z)) {
        const type = random.pick(theme.props), s = random.range(.8, 1.25);
        props.push({ type, x: p.x + sx * (CELL / 2 - .2 - .5 * s), z: p.z + sz * (CELL / 2 - .2 - .5 * s), s, r: random.range(0, Math.PI) });
      }
    }
    for (let x = room.x; x < room.x + room.w; x++) for (let z = room.z; z < room.z + room.d; z++) {
      const p = world(x, z);
      if (Math.hypot(p.x - spawn.x, p.z - spawn.z) < CELL * 1.1 || (p.x === exit.x && p.z === exit.z)) continue;
      slots.push({ x: p.x + random.range(-.6, .6), y: 0, z: p.z + random.range(-.6, .6), far: distance.get(key(x, z)) || 0, room: centre });
    }
  }
  for (const item of [...props, ...pillars]) {
    const half = item.type ? .5 * item.s : item.r;
    colliders.push([item.x - half, 0, item.z - half, item.x + half, item.type ? item.s : height, item.z + half]);
  }
  const extent = grid * CELL / 2;
  return { kind: 'rooms', cell: CELL, wallHeight: height, wallThickness: WALL, cells: [...cells.entries()].map(([id, room]) => ({ ...world(...id.split(',').map(Number)), room })),
    walls, props, pillars, lights, colliders, spawn, exit, slots: random.shuffle(slots), bounds: { minX: -extent, maxX: extent, minZ: -extent, maxZ: extent } };
}

function terrainLayout(blueprint, theme) {
  const half = WORLD_SIZES[blueprint.size].half, random = randomSource(blueprint.seed), heightAt = heightField(blueprint);
  const [a, b] = terrainEnds(blueprint), place = p => ({ x: p.x, y: heightAt(p.x, p.z), z: p.z });
  const spawn = place(a), exit = place(b);
  const mid = { x: (a.x + b.x) / 2 + random.range(-half * .25, half * .25), z: (a.z + b.z) / 2 + random.range(-half * .25, half * .25) };
  const path = [a, mid, b];
  const segment = (p, u, v) => { const dx = v.x - u.x, dz = v.z - u.z, t = Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.z - u.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(p.x - u.x - dx * t, p.z - u.z - dz * t); };
  const pathDistance = p => Math.min(segment(p, a, mid), segment(p, mid, b));
  const open = (p, margin) => pathDistance(p) > margin && Math.hypot(p.x - a.x, p.z - a.z) > 7 && Math.hypot(p.x - b.x, p.z - b.z) > 7;
  const playable = half - 3, colliders = [], obstacles = [];
  const block = (x, z, r, top) => { colliders.push([x - r, -10, z - r, x + r, top, z + r]); obstacles.push({ x, z, r }); };

  const columns = [], ruins = [];
  for (let i = 0; i < 6; i++) {
    const angle = i / 6 * Math.PI * 2 + .3, x = b.x + Math.cos(angle) * 3.6, z = b.z + Math.sin(angle) * 3.6;
    // The far-side columns of the ring are broken, which also keeps the approach open.
    columns.push({ x, y: heightAt(x, z), z, h: i % 3 === 1 ? random.range(1, 1.8) : 3.4, r: .34 }); block(x, z, .36, 30);
  }
  for (let i = 0; i < (theme.ruins || 1) * 2; i++) {
    const p = { x: random.range(-playable, playable) * .8, z: random.range(-playable, playable) * .8 };
    if (!open(p, 5)) continue;
    const along = random() < .5, length = random.range(3, 6.5), h = random.range(1.2, 2.6);
    ruins.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, w: along ? length : .7, d: along ? .7 : length, h });
    colliders.push([p.x - (along ? length : .7) / 2, -10, p.z - (along ? .7 : length) / 2, p.x + (along ? length : .7) / 2, 30, p.z + (along ? .7 : length) / 2]);
    obstacles.push({ x: p.x, z: p.z, r: length / 2 });
  }
  const clear = (p, r) => obstacles.every(o => Math.hypot(p.x - o.x, p.z - o.z) > o.r + r);
  const trees = [], backdrop = [], rocks = [], density = noise2(blueprint.seed ^ 0x2545F491);
  const spacing = 4.6;
  for (let x = -half - 17; x <= half + 17; x += spacing) for (let z = -half - 17; z <= half + 17; z += spacing) {
    const p = { x: x + random.range(-1.7, 1.7), z: z + random.range(-1.7, 1.7) }, s = random.range(.75, 1.45), r = random.range(0, Math.PI * 2);
    const inside = Math.max(Math.abs(p.x), Math.abs(p.z)) < playable;
    if (!inside) { if (Math.max(Math.abs(p.x), Math.abs(p.z)) > half - 1 && random() < Math.min(1, theme.density + .25)) backdrop.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, s: s * 1.25, r }); continue; }
    if (density(p.x / 14, p.z / 14) > .25 + theme.density * .5 || !open(p, 3.6) || !clear(p, 1.2)) continue;
    trees.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, s, r }); block(p.x, p.z, .32 * s, 30);
  }
  for (let i = 0; i < Math.round(half * 1.1); i++) {
    const p = { x: random.range(-playable, playable), z: random.range(-playable, playable) }, s = random.range(.35, 1.9);
    if (!open(p, 2 + s) || !clear(p, s)) continue;
    rocks.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, s, r: random.range(0, Math.PI * 2), squash: random.range(.55, 1) });
    if (s > .8) block(p.x, p.z, s * .62, heightAt(p.x, p.z) + s * .7);
  }
  // The bowl edge is scenery; these four boxes are what actually keeps play inside it.
  const limit = playable + 1;
  colliders.push([-half * 2, -10, -half * 2, half * 2, 30, -limit], [-half * 2, -10, limit, half * 2, 30, half * 2], [-half * 2, -10, -limit, -limit, 30, limit], [limit, -10, -limit, half * 2, 30, limit]);

  const slots = [];
  for (let x = -playable + 3; x <= playable - 3; x += 6) for (let z = -playable + 3; z <= playable - 3; z += 6) {
    const p = { x: x + random.range(-1.8, 1.8), z: z + random.range(-1.8, 1.8) };
    if (Math.hypot(p.x - a.x, p.z - a.z) < 6 || Math.hypot(p.x - b.x, p.z - b.z) < 5.5 || !clear(p, 1.3)) continue;
    slots.push({ x: p.x, y: heightAt(p.x, p.z), z: p.z, far: Math.hypot(p.x - a.x, p.z - a.z) });
  }
  const lights = [0, 3].map(i => ({ x: columns[i].x, y: columns[i].y + 2.4, z: columns[i].z, color: theme.light, intensity: 26, range: 14 }));
  return { kind: 'terrain', half, path, trees, backdrop, rocks, columns, ruins, lights, colliders, spawn, exit, slots: random.shuffle(slots),
    bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half } };
}

// Walk a half-metre grid from the start around every collider. Anything the
// player's body cannot reach is not offered as a place for a pickup or an enemy.
function reachable(layout, radius = .45, step = .5) {
  const { minX, maxX, minZ, maxZ } = layout.bounds, nx = Math.ceil((maxX - minX) / step), nz = Math.ceil((maxZ - minZ) / step);
  const state = new Uint8Array(nx * nz), cell = (x, z) => Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / step))) + Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / step))) * nx;
  if (layout.kind === 'rooms') {
    state.fill(1);
    for (const c of layout.cells) for (let x = c.x - layout.cell / 2 + step / 2; x < c.x + layout.cell / 2; x += step) for (let z = c.z - layout.cell / 2 + step / 2; z < c.z + layout.cell / 2; z += step) state[cell(x, z)] = 0;
  }
  for (const [x0, , z0, x1, , z1] of layout.colliders)
    for (let x = Math.max(minX, x0 - radius); x <= Math.min(maxX - 1e-6, x1 + radius); x += step / 2) for (let z = Math.max(minZ, z0 - radius); z <= Math.min(maxZ - 1e-6, z1 + radius); z += step / 2) state[cell(x, z)] = 1;
  const start = cell(layout.spawn.x, layout.spawn.z), queue = [start];
  state[start] = 2;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % nx;
    for (const next of [x > 0 ? index - 1 : -1, x < nx - 1 ? index + 1 : -1, index - nx, index + nx]) if (next >= 0 && next < state.length && state[next] === 0) { state[next] = 2; queue.push(next); }
  }
  return (x, z) => state[cell(x, z)] === 2;
}

/** Everything a renderer, a collision system and a game template need, derived from the blueprint alone. */
export function layoutWorld(input) {
  const blueprint = validateBlueprint(input), theme = WORLD_THEMES[blueprint.theme];
  const layout = { blueprint, theme, ...(theme.layout === 'rooms' ? roomsLayout(blueprint, theme) : terrainLayout(blueprint, theme)) };
  const reach = reachable(layout);
  if (!reach(layout.exit.x, layout.exit.z)) throw new Error('World layout has no route from start to exit');
  layout.slots = layout.slots.filter(slot => reach(slot.x, slot.z));
  return layout;
}

/** Level source stored in history and game projects: one helper call instead of thousands of generated tokens. */
export function worldSource(input) {
  const blueprint = validateBlueprint(input);
  return `setObjectInfo(${JSON.stringify({ title: blueprint.title, description: `${WORLD_THEMES[blueprint.theme].label}, ${blueprint.size}` })});\nroot.userData.worldScale = true;\nroot.add(await H.world(${JSON.stringify(blueprint)}, MAT));`;
}
