import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildWorld, worldColliders, worldGround } from '../src/components/gen3d/worldKit.js';
import { buildActor, actorSource, ACTOR_KINDS } from '../src/components/gen3d/actorKit.js';
import { WORLD_THEMES, layoutWorld, heightField } from '../src/components/gen3d/worldLayout.js';
import { inspectScene } from '../src/components/gen3d/sceneInspection.js';

// Stands in for the bundled texture library, which needs a browser to decode images.
const requested = [];
const MAT = { scanned: async (id, options = {}) => { requested.push(id); const { repeat, normalStrength, aoIntensity, variant, ...rest } = options; return new THREE.MeshStandardMaterial(rest); } };

test('every theme builds a clean level within an integrated-GPU budget', async () => {
  for (const theme of Object.keys(WORLD_THEMES)) {
    const blueprint = { v: 1, theme, size: 'large', seed: 11 }, root = await buildWorld(blueprint, MAT);
    root.userData.worldScale = true;
    const report = inspectScene(root);
    assert.deepEqual(report.errors, [], theme);
    assert.deepEqual(report.warnings, [], theme);
    // Merged construction and instanced detail: a large map must not cost hundreds of draw calls.
    assert.ok(report.drawCalls <= 24, `${theme}: ${report.drawCalls} draw calls`);
    assert.ok(report.triangles <= 300000, `${theme}: ${report.triangles} triangles`);
    const lights = [];
    root.traverse(node => { if (node.isPointLight) lights.push(node); });
    assert.ok(lights.length >= 1 && lights.length <= 8, `${theme}: ${lights.length} local lights`);
    assert.ok(lights.every(light => !light.castShadow), 'local lights must not add shadow passes');
  }
  for (const id of new Set(requested)) assert.match(id, /^[a-z0-9_]+$/);
});

test('a built level carries its own collision and ground as plain data', async () => {
  const blueprint = { v: 1, theme: 'forest', size: 'small', seed: 5 }, root = await buildWorld(blueprint, MAT), layout = layoutWorld(blueprint);
  assert.deepEqual(JSON.parse(JSON.stringify(root.userData)), root.userData, 'survives saving, cloning and GLB export');
  const parent = new THREE.Group();
  parent.add(root);
  assert.equal(worldColliders(parent).length, layout.colliders.length);
  assert.ok(worldColliders(parent).every(solid => solid.object === root));
  assert.equal(worldGround(parent)(3, -4), heightField(blueprint)(3, -4));
  const interior = await buildWorld({ v: 1, theme: 'dungeon', size: 'small', seed: 5 }, MAT);
  assert.equal(worldGround(interior), null, 'interiors are flat');
  const floor = new THREE.Box3().setFromObject(interior.getObjectByName('floor'));
  assert.ok(Math.abs(floor.max.y) < 1e-6, 'the floor is the y = 0 the game stands on');
});

test('terrain geometry matches the ground the player stands on', async () => {
  const blueprint = { v: 1, theme: 'snow', size: 'small', seed: 9 }, root = await buildWorld(blueprint, MAT), heightAt = heightField(blueprint);
  const position = root.getObjectByName('terrain').geometry.attributes.position;
  for (let i = 0; i < position.count; i += 97) assert.ok(Math.abs(position.getY(i) - heightAt(position.getX(i), position.getZ(i))) < 1e-4);
});

test('H.world explains a missing material library instead of failing inside construction', async () => {
  await assert.rejects(buildWorld({ v: 1, theme: 'forest', size: 'small', seed: 1 }), /H\.world\(blueprint, MAT\)/);
});

test('built-in actors stand on their origin, stay light and animate only their own parts', () => {
  for (const kind of ACTOR_KINDS) {
    const callbacks = [], actor = buildActor(kind, {}, callback => callbacks.push(callback));
    const box = new THREE.Box3().setFromObject(actor), report = inspectScene(actor);
    assert.deepEqual(report.errors, [], kind);
    assert.ok(box.min.y > -0.05, `${kind} sinks below its origin: ${box.min.y}`);
    assert.ok(report.drawCalls <= 5 && report.triangles <= 12000, `${kind}: ${report.drawCalls} draws, ${report.triangles} triangles`);
    for (const callback of callbacks) callback({ time: 1.3, deltaTime: 0.016 });
    assert.deepEqual(actor.position.toArray(), [0, 0, 0], `${kind}: gameplay owns the actor transform`);
    assert.deepEqual(actor.rotation.toArray().slice(0, 3), [0, 0, 0]);
  }
  assert.throws(() => buildActor('dragon'), /hero, sentinel/);
  assert.equal(actorSource('crystal', { color: 255 }), 'root.add(H.actor("crystal", {"color":255}));');
});
