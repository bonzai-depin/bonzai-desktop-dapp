import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { worldUV } from './productionGeometry.js';
import { layoutWorld, heightField, randomSource } from './worldLayout.js';

// Builds a planned world from bundled scanned materials. Static construction is
// merged per material and repeated detail is instanced, so a large level stays
// within a few dozen draw calls on integrated GPUs.

const at = (geometry, x, y, z) => geometry.translate(x, y, z);
const box = (w, h, d, x, y, z) => at(new THREE.BoxGeometry(w, h, d), x, y, z);
// Metre-scaled UVs must be baked after placement or neighbouring pieces restart the texture.
const merged = (geometries, tile) => {
  const geometry = worldUV(mergeGeometries(geometries.map(g => g.index ? g.toNonIndexed() : g)), tile);
  geometries.forEach(g => g.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
};
function mesh(geometry, material, name, { cast = true } = {}) {
  const node = new THREE.Mesh(geometry, material);
  node.name = name; node.castShadow = cast; node.receiveShadow = true;
  return node;
}
function instanced(geometry, material, name, items, place) {
  const node = new THREE.InstancedMesh(geometry, material, items.length), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color();
  node.name = name; node.castShadow = true; node.receiveShadow = true;
  items.forEach((item, index) => {
    const t = place(item, index);
    matrix.compose(new THREE.Vector3(...t.position), q.setFromEuler(new THREE.Euler(...(t.rotation || [0, 0, 0]))), new THREE.Vector3(...(t.scale || [1, 1, 1])));
    node.setMatrixAt(index, matrix);
    if (t.color != null) node.setColorAt(index, color.set(t.color));
  });
  node.instanceMatrix.needsUpdate = true; if (node.instanceColor) node.instanceColor.needsUpdate = true;
  node.computeBoundingBox(); node.computeBoundingSphere();
  return node;
}
// Coincident vertices get the same offset and the same normal, so a displaced
// solid stays closed and shades smoothly while keeping its original UVs.
function displaced(source, seed, amount) {
  const geometry = source.index ? source.toNonIndexed() : source, p = geometry.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed * 1.7) + Math.sin(v.z * 3.7 + seed * .6) * .6 + Math.sin((v.x + v.y + v.z) * 7.3 + seed) * .25;
    v.multiplyScalar(1 + n * amount); p.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal, sums = new Map(), id = i => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) { const sum = sums.get(id(i)) || sums.set(id(i), new THREE.Vector3()).get(id(i)); sum.x += normal.getX(i); sum.y += normal.getY(i); sum.z += normal.getZ(i); }
  for (let i = 0; i < p.count; i++) { const sum = v.copy(sums.get(id(i))).normalize(); normal.setXYZ(i, sum.x, sum.y, sum.z); }
  return geometry;
}
const lathe = (points, segments = 20) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
const glow = (color, intensity = 2.5) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: .4 });

function lamp(light, parent) {
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.14, 16, 10), glow(light.color, 4));
  bulb.name = 'lamp_emitter'; bulb.castShadow = false; bulb.position.set(light.x, light.y, light.z);
  const point = new THREE.PointLight(light.color, light.intensity, light.range, 2);
  point.name = 'lamp_light'; point.position.copy(bulb.position);
  parent.add(bulb, point);
}

const PROPS = {
  crate: () => new RoundedBoxGeometry(1, 1, 1, 2, .05).translate(0, .5, 0),
  barrel: () => lathe([[0, 0], [.36, 0], [.42, .12], [.46, .5], [.42, .88], [.36, 1], [0, 1]]),
  canister: () => lathe([[0, 0], [.34, 0], [.38, .06], [.38, .84], [.3, .94], [.14, 1], [0, 1]], 24),
  urn: () => lathe([[0, 0], [.22, 0], [.26, .06], [.44, .42], [.38, .72], [.2, .86], [.27, 1], [.2, 1], [0, .9]], 24),
  rubble: () => mergeGeometries([[0, .22, 0, .42], [.42, .14, .2, .26], [-.3, .12, .34, .22]].map(([x, y, z, r], i) => at(displaced(new THREE.IcosahedronGeometry(r, 1), i * 2.3, .16), x, y, z))),
};

async function buildRooms(layout, MAT, root) {
  const { theme, walls, wallHeight: h } = layout;
  const [floor, wall, trim, prop] = await Promise.all([
    MAT.scanned(theme.floor), MAT.scanned(theme.wall, { normalStrength: 1 }), MAT.scanned(theme.trim), MAT.scanned(theme.prop)]);
  root.add(mesh(merged(layout.cells.map(c => at(new THREE.PlaneGeometry(layout.cell, layout.cell).rotateX(-Math.PI / 2), c.x, 0, c.z)), 2), floor, 'floor', { cast: false }));
  root.add(mesh(merged(walls.map(w => box(w.w, h, w.d, w.x, h / 2, w.z)), 2.5), wall, 'walls'));
  // A plinth and a coping give each wall a readable base and top edge instead of a bare extrusion.
  root.add(mesh(merged(walls.flatMap(w => [box(w.w + .14, .36, w.d + .14, w.x, .18, w.z), box(w.w + .2, .2, w.d + .2, w.x, h + .1, w.z)]), 1.5), trim, 'wall_trim'));
  if (theme.strips) root.add(mesh(mergeGeometries(walls.map(w => box(w.w + .03, .07, w.d + .03, w.x, 1.25, w.z))), glow(theme.strips, 1.6), 'light_strips', { cast: false }));

  const rooms = new Map();
  for (const cell of layout.cells) if (cell.room >= 0) {
    const r = rooms.get(cell.room) || rooms.set(cell.room, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }).get(cell.room);
    r.minX = Math.min(r.minX, cell.x); r.maxX = Math.max(r.maxX, cell.x); r.minZ = Math.min(r.minZ, cell.z); r.maxZ = Math.max(r.maxZ, cell.z);
  }
  // Each room's lamp hangs from a beam, so the light has a visible, supported source.
  const beams = [...rooms.values()].slice(0, layout.lights.length).map((r, i) => {
    const light = layout.lights[i], alongX = r.maxX - r.minX <= r.maxZ - r.minZ, span = (alongX ? r.maxX - r.minX : r.maxZ - r.minZ) + layout.cell + .2;
    return [box(alongX ? span : .28, .3, alongX ? .28 : span, light.x, h - .15, light.z), box(.05, .42, .05, light.x, h - .5, light.z)];
  });
  root.add(mesh(merged(beams.flat(), 1.5), prop, 'ceiling_beams'));
  layout.lights.forEach(light => lamp(light, root));

  for (const type of new Set(layout.props.map(p => p.type))) {
    const items = layout.props.filter(p => p.type === type);
    root.add(instanced(PROPS[type](), type === 'rubble' || type === 'urn' ? trim : prop, `props_${type}`, items, p => ({ position: [p.x, 0, p.z], rotation: [0, p.r, 0], scale: [p.s, p.s, p.s] })));
  }
  if (layout.pillars.length) {
    const column = lathe([[0, 0], [.44, 0], [.44, .16], [.36, .24], [.32, .4], [.3, h - .5], [.36, h - .34], [.46, h - .2], [.46, h], [0, h]], 24);
    root.add(instanced(column, trim, 'columns', layout.pillars, p => ({ position: [p.x, 0, p.z] })));
  }
  for (const [name, p] of [['start_inlay', layout.spawn], ['exit_dais', layout.exit]])
    root.add(mesh(at(new THREE.CylinderGeometry(1.5, 1.6, .08, 40), p.x, .04, p.z), trim, name, { cast: false }));
}

function treeParts(kind, snowy) {
  const blob = (r, x, y, z, seed) => at(displaced(new THREE.IcosahedronGeometry(r, 1), seed, .13), x, y, z);
  if (kind === 'pine') {
    const cones = [[1.5, 1.7, 1.5], [1.2, 1.6, 2.5], [.9, 1.5, 3.4], [.55, 1.3, 4.3]].map(([r, height, y]) => {
      const cone = at(new THREE.ConeGeometry(r, height, 10, 3), 0, y, 0).toNonIndexed(), p = cone.attributes.position, colors = new Float32Array(p.count * 3);
      // Branch tips carry the snow; the shaded core stays green.
      for (let i = 0; i < p.count; i++) { const tip = snowy ? Math.min(1, Math.max(0, Math.hypot(p.getX(i), p.getZ(i)) / r - .25) * 1.6) : 0; colors.set([.75 + tip * .6, .75 + tip * .6, .75 + tip * .6], i * 3); }
      cone.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return cone;
    });
    return { trunk: at(new THREE.CylinderGeometry(.11, .2, 1.6, 8), 0, .8, 0), crown: mergeGeometries(cones), vertexColors: true };
  }
  if (kind === 'palm') {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.18, 1.6, 0), new THREE.Vector3(.5, 3.2, 0), new THREE.Vector3(.62, 4.4, 0)]);
    const fronds = Array.from({ length: 8 }, (_, i) => {
      const frond = new THREE.PlaneGeometry(.55, 2.6, 2, 8).translate(0, 1.3, 0), p = frond.attributes.position;
      for (let j = 0; j < p.count; j++) { const t = p.getY(j) / 2.6; p.setXYZ(j, p.getX(j) * (1 - t * .85), p.getY(j) * .55 - t * t * 1.1, t * 2.1 + Math.abs(p.getX(j)) * -.35); }
      frond.computeVertexNormals();
      return frond.rotateY(i / 8 * Math.PI * 2 + (i % 2) * .2).translate(.62, 4.35, 0);
    });
    return { trunk: new THREE.TubeGeometry(curve, 10, .15, 8), crown: mergeGeometries(fronds), doubleSide: true };
  }
  if (kind === 'crystal') {
    const shard = (r, height, x, z, tilt) => at(new THREE.CylinderGeometry(0, r, height, 5).rotateZ(tilt), x, height / 2 - .1, z);
    return { trunk: displaced(new THREE.IcosahedronGeometry(.5, 1), 3, .2).scale(1, .45, 1), crown: mergeGeometries([shard(.3, 2.4, 0, 0, 0), shard(.2, 1.5, .34, .1, -.35), shard(.17, 1.2, -.28, -.16, .42)]), emissive: true };
  }
  return { trunk: at(new THREE.CylinderGeometry(.14, .26, 2.4, 8), 0, 1.2, 0), crown: mergeGeometries([blob(1.25, 0, 3.1, 0, 1), blob(.95, .85, 2.6, .25, 2), blob(.9, -.7, 2.7, -.4, 3), blob(.8, .1, 3.9, -.2, 4)]) };
}

async function buildTerrain(layout, MAT, root) {
  const { theme, blueprint, half } = layout, heightAt = heightField(blueprint), random = randomSource(blueprint.seed ^ 0x7F4A7C15);
  const [ground, rock, bark, stone] = await Promise.all([MAT.scanned(theme.ground, { vertexColors: true }), MAT.scanned(theme.rock, { repeat: [2, 2], normalStrength: 1 }), MAT.scanned(theme.bark, { repeat: [1, 2] }), MAT.scanned(theme.stone)]);
  const size = (half + 24) * 2, segments = Math.min(150, Math.round(size / .9));
  const land = new THREE.PlaneGeometry(size, size, segments, segments).rotateX(-Math.PI / 2), p = land.attributes.position, uv = land.attributes.uv, colors = new Float32Array(p.count * 3);
  const [a, mid, b] = layout.path, seg = (x, z, u, v) => { const dx = v.x - u.x, dz = v.z - u.z, t = Math.max(0, Math.min(1, ((x - u.x) * dx + (z - u.z) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - u.x - dx * t, z - u.z - dz * t); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, heightAt(x, z)); uv.setXY(i, x / 3, z / 3);
    // A worn track between start and finish tells the player where to go without a marker.
    const worn = 1 - .34 * Math.max(0, 1 - Math.min(seg(x, z, a, mid), seg(x, z, mid, b)) / 2.2);
    colors.set([worn, worn * .97, worn * .92], i * 3);
  }
  land.setAttribute('color', new THREE.BufferAttribute(colors, 3)); land.computeVertexNormals();
  root.add(mesh(land, ground, 'terrain', { cast: false }));

  const parts = treeParts(theme.tree, blueprint.theme === 'snow'), all = [...layout.trees, ...layout.backdrop];
  const crownMaterial = parts.emissive ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: theme.foliage[0], emissiveIntensity: .7, roughness: .25, metalness: .1 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .82, vertexColors: !!parts.vertexColors, side: parts.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  if (all.length) {
    const transform = t => ({ position: [t.x, t.y - .15, t.z], rotation: [0, t.r, 0], scale: [t.s, t.s * (.9 + (t.r % 1) * .25), t.s] });
    root.add(instanced(parts.trunk, parts.emissive ? rock : bark, 'tree_trunks', all, transform));
    root.add(instanced(parts.crown, crownMaterial, 'tree_crowns', all, t => ({ ...transform(t), color: theme.foliage[Math.floor(t.r * 7) % theme.foliage.length] })));
    if (parts.emissive) root.getObjectByName('tree_crowns').userData.castShadow = false;
  }
  for (let variant = 0; variant < 3; variant++) {
    const items = layout.rocks.filter((_, index) => index % 3 === variant);
    if (items.length) root.add(instanced(displaced(new THREE.IcosahedronGeometry(1, 2), variant * 5.1 + 1, .2), rock, `rocks_${variant}`, items, r => ({ position: [r.x, r.y + r.s * r.squash * .25, r.z], rotation: [0, r.r, 0], scale: [r.s, r.s * r.squash, r.s * (.8 + r.squash * .3)] })));
  }
  const columns = layout.columns.map(c => {
    const whole = c.h > 3, top = whole ? [[.4, c.h - .34], [.5, c.h - .2], [.5, c.h], [0, c.h]] : [[.3, c.h], [0, c.h - .12]];
    return at(lathe([[0, -.6], [.5, -.6], [.5, .16], [.4, .24], [.34, .4], [.32, c.h - .5], ...top], 20), c.x, c.y, c.z);
  });
  root.add(mesh(mergeGeometries(columns), stone, 'shrine_columns'));
  root.add(mesh(at(new THREE.CylinderGeometry(2.7, 2.9, .9, 48), layout.exit.x, layout.exit.y - .37, layout.exit.z), stone, 'exit_dais'));
  if (layout.ruins.length) root.add(mesh(merged(layout.ruins.flatMap(r => {
    const broken = random.range(.35, .7), along = r.w > r.d;
    return [box(r.w, r.h + 1, r.d, r.x, r.y + r.h / 2 - .5, r.z), box(along ? r.w * broken : r.w, .7, along ? r.d : r.d * broken, r.x + (along ? -r.w * (1 - broken) / 2 : 0), r.y + r.h + .35, r.z + (along ? 0 : -r.d * (1 - broken) / 2))];
  }), 2), stone, 'ruins'));
  layout.lights.forEach(light => lamp(light, root));
}

/** H.world(blueprint, MAT): a finished, lit, collidable level from a blueprint. */
export async function buildWorld(blueprint, MAT) {
  if (typeof MAT?.scanned !== 'function') throw new Error('H.world needs the MAT library: H.world(blueprint, MAT)');
  const layout = layoutWorld(blueprint), root = new THREE.Group();
  root.name = `world_${layout.blueprint.theme}`;
  await (layout.kind === 'rooms' ? buildRooms : buildTerrain)(layout, MAT, root);
  // Plain data only: it survives cloning, GLB export and saved projects.
  root.userData.world = { blueprint: layout.blueprint, kind: layout.kind, spawn: layout.spawn, exit: layout.exit, bounds: layout.bounds };
  root.userData.colliders = layout.colliders;
  return root;
}

/** Colliders and ground declared anywhere under a level root, in that node's local space. */
export function worldColliders(root) {
  const found = [];
  root.traverse(node => { for (const box of node.userData?.colliders || []) if (Array.isArray(box) && box.length === 6 && box.every(Number.isFinite)) found.push({ object: node, box }); });
  return found;
}
export function worldGround(root) {
  let blueprint = null;
  root.traverse(node => { if (!blueprint && node.userData?.world?.kind === 'terrain') blueprint = node.userData.world.blueprint; });
  return blueprint ? heightField(blueprint) : null;
}

export const worldHelpers = { world: buildWorld, worldColliders, worldGround };
