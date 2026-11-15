import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_THEMES, WORLD_SIZES, planWorld, layoutWorld, heightField, worldSource, validateBlueprint } from '../src/components/gen3d/worldLayout.js';
import { resolveMaterial } from '../src/components/gen3d/materialCatalogue.js';

const blueprints = (seeds = 40) => Object.keys(WORLD_THEMES).flatMap(theme => Object.keys(WORLD_SIZES).flatMap(size =>
  Array.from({ length: seeds }, (_, i) => ({ v: 1, theme, size, seed: i * 104729 + 7 }))));

test('the words of a brief choose the theme and size; a variation only changes what the brief leaves open', () => {
  const castle = planWorld('A large haunted castle dungeon');
  assert.equal(castle.theme, 'dungeon');
  assert.equal(castle.size, 'large');
  assert.equal(planWorld('petite forêt enneigée, hiver').theme, 'snow');
  assert.equal(planWorld('petite forêt enneigée, hiver').size, 'small');
  const again = planWorld('A large haunted castle dungeon', { variation: 1 });
  assert.equal(again.theme, 'dungeon');
  assert.notEqual(again.seed, castle.seed, 'asking again gives a different map of the same place');
  assert.deepEqual(planWorld('A large haunted castle dungeon'), castle, 'the same brief plans the same world');
  assert.ok(WORLD_THEMES[planWorld('').theme], 'an empty brief still plans a valid world');
});

test('a blueprint is the whole level: the same blueprint always lays out the same world', () => {
  for (const blueprint of blueprints(3)) assert.deepEqual(layoutWorld(blueprint), layoutWorld(structuredClone(blueprint)));
});

test('level source is one helper call, not generated geometry code', () => {
  // The measured cost of a model-written level is thousands of output tokens at a few tokens per second.
  const source = worldSource(planWorld('desert ruins'));
  assert.ok(source.length < 400, `${source.length} characters`);
  assert.match(source, /root\.add\(await H\.world\(\{.*\}, MAT\)\);/);
  assert.match(source, /root\.userData\.worldScale = true;/);
});

test('every planned world has a walkable route from start to exit and only offers reachable places', () => {
  for (const blueprint of blueprints()) {
    const layout = layoutWorld(blueprint), label = `${blueprint.theme}/${blueprint.size}/${blueprint.seed}`;
    assert.ok(layout.slots.length >= 3, `${label}: ${layout.slots.length} places`);
    const inside = (p, margin) => layout.colliders.some(([x0, , z0, x1, , z1]) => p.x > x0 - margin && p.x < x1 + margin && p.z > z0 - margin && p.z < z1 + margin);
    for (const point of [layout.spawn, layout.exit, ...layout.slots]) {
      assert.equal(inside(point, 0.3), false, `${label}: a body at ${point.x.toFixed(1)},${point.z.toFixed(1)} overlaps a collider`);
      assert.ok(Math.abs(point.y - heightField(blueprint)(point.x, point.z)) < 1e-9, `${label}: placed on the ground`);
    }
    assert.ok(Math.hypot(layout.spawn.x - layout.exit.x, layout.spawn.z - layout.exit.z) > 7, `${label}: the exit is not at the start`);
  }
});

test('interiors are closed: every floor edge that faces the void has a wall', () => {
  for (const blueprint of blueprints(10).filter(b => WORLD_THEMES[b.theme].layout === 'rooms')) {
    const layout = layoutWorld(blueprint), half = layout.cell / 2, floor = new Set(layout.cells.map(c => `${c.x},${c.z}`));
    const walled = (x, z) => layout.walls.some(w => Math.abs(x - w.x) <= w.w / 2 + 1e-6 && Math.abs(z - w.z) <= w.d / 2 + 1e-6);
    for (const cell of layout.cells) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (!floor.has(`${cell.x + dx * layout.cell},${cell.z + dz * layout.cell}`)) assert.ok(walled(cell.x + dx * half, cell.z + dz * half), `${blueprint.theme}/${blueprint.seed}: open edge`);
  }
});

test('terrain stays level at the start and the exit and rises at its edge', () => {
  for (const blueprint of blueprints(5).filter(b => WORLD_THEMES[b.theme].layout === 'terrain')) {
    const layout = layoutWorld(blueprint), heightAt = heightField(blueprint);
    for (const point of [layout.spawn, layout.exit]) assert.ok(Math.abs(heightAt(point.x + 1.5, point.z) - heightAt(point.x - 1.5, point.z)) < 0.25);
    assert.ok(heightAt(layout.half * 1.3, 0) > heightAt(0, 0) + 2, 'the edge reads as a rim');
  }
});

test('every theme uses bundled scanned materials that provide colour, normal and roughness maps', () => {
  for (const [id, theme] of Object.entries(WORLD_THEMES)) for (const role of ['floor', 'wall', 'trim', 'prop', 'ground', 'rock', 'bark', 'stone']) {
    if (!theme[role]) continue;
    const entry = resolveMaterial(theme[role]);
    assert.equal(entry.id, theme[role], `${id}.${role} must name an exact material`);
    for (const map of ['diffuse', 'normal-gl', 'roughness']) assert.ok(entry.maps[map]?.file, `${id}.${role} lacks ${map}`);
  }
});

test('malformed blueprints are rejected with the valid choices', () => {
  assert.throws(() => validateBlueprint({ v: 1, theme: 'ocean', size: 'medium', seed: 1 }), /dungeon, station/);
  assert.throws(() => validateBlueprint({ v: 1, theme: 'forest', size: 'giant', seed: 1 }), /small, medium or large/);
  assert.throws(() => validateBlueprint({ v: 1, theme: 'forest', size: 'small', seed: -1 }), /seed/);
  assert.throws(() => validateBlueprint({ v: 2, theme: 'forest', size: 'small', seed: 1 }), /version/);
});
