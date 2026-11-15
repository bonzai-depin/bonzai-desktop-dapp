import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GAME_TEMPLATES, GAME_DIFFICULTIES, createInstantGame, createInstantLevel } from '../src/components/gen3d/gameTemplates.js';
import { validateGameProject, compileGameProject, importLevelSnapshot } from '../src/components/gen3d/gameProject.js';
import { createGameRuntime, validateGeneratedGameCode, inspectGameSession } from '../src/components/gen3d/gameRuntime.js';
import { WORLD_THEMES, WORLD_SIZES } from '../src/components/gen3d/worldLayout.js';
import { worldHelpers } from '../src/components/gen3d/worldKit.js';
import { buildActor } from '../src/components/gen3d/actorKit.js';
import { levelEditingHelpers } from '../src/components/gen3d/levelEditing.js';

const MAT = { scanned: async (id, { repeat, normalStrength, aoIntensity, variant, ...rest } = {}) => new THREE.MeshStandardMaterial(rest) };
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

// Runs compiled project source against the real runtime, as the viewer's host module does.
async function play(project) {
  const callbacks = [], events = new EventTarget(), root = new THREE.Group();
  const addUpdateCallback = callback => callbacks.push(callback);
  const GAME = createGameRuntime({ THREE, eventTarget: events, addUpdateCallback });
  const H = { ...levelEditingHelpers, ...worldHelpers, actor: (kind, options) => buildActor(kind, options, addUpdateCallback) };
  await new AsyncFunction('THREE', 'root', 'H', 'MAT', 'GAME', 'addUpdateCallback', 'setObjectInfo', compileGameProject(project))(THREE, root, H, MAT, GAME, addUpdateCallback, () => {});
  root.updateMatrixWorld(true);
  const key = (type, code) => { const event = new Event(type); Object.defineProperty(event, 'code', { value: code }); events.dispatchEvent(event); };
  const run = seconds => { for (let t = 0; t < seconds; t += 1 / 60) for (const callback of callbacks) callback({ deltaTime: 1 / 60, time: t }); };
  return { game: GAME.active, root, key, run };
}

test('every template yields a publishable project whose objective can be completed', () => {
  for (const theme of Object.keys(WORLD_THEMES)) for (const size of Object.keys(WORLD_SIZES)) for (const { id } of GAME_TEMPLATES) for (const difficulty of GAME_DIFFICULTIES) for (let seed = 1; seed < 400; seed += 57) {
    const project = createInstantGame({ template: id, theme, size, difficulty, seed }), level = project.levels[0], label = `${id}/${theme}/${size}/${difficulty}/${seed}`;
    assert.deepEqual(validateGameProject(project), { ok: true, errors: [] }, label);
    assert.equal(validateGeneratedGameCode(compileGameProject(project)).ok, true, label);
    const count = role => level.placements.filter(placement => placement.role === role).length;
    assert.equal(count('player'), 1, label);
    assert.equal(count('goal'), 1, label);
    for (const condition of level.clearConditions) {
      if (condition.type === 'collect') assert.equal(count('collectible'), condition.target, `${label}: as many crystals as the objective asks for`);
      if (condition.type === 'defeat') assert.equal(count('enemy'), condition.target, label);
      if (condition.type === 'reach') assert.ok(level.placements.some(placement => placement.id === condition.targetPlacementId), label);
    }
    assert.ok(count('enemy') >= 1, `${label}: a game needs a threat`);
  }
});

test('harder difficulties add threats without changing the objective', () => {
  const [easy, hard] = ['easy', 'hard'].map(difficulty => createInstantGame({ template: 'collect', theme: 'forest', size: 'large', difficulty, seed: 3 }).levels[0]);
  const enemies = level => level.placements.filter(placement => placement.role === 'enemy');
  assert.ok(enemies(hard).length > enemies(easy).length);
  assert.ok(enemies(hard)[0].settings.speed > enemies(easy)[0].settings.speed);
  assert.deepEqual(hard.clearConditions.map(condition => condition.target), easy.clearConditions.map(condition => condition.target));
  assert.throws(() => createInstantGame({ template: 'racing' }), /collect, hunt, survive, escape/);
  assert.throws(() => createInstantGame({ difficulty: 'brutal' }), /easy, normal or hard/);
});

test('an instant game is running, collidable and winnable in the real runtime', async () => {
  const project = createInstantGame({ prompt: 'a haunted castle dungeon', template: 'collect', difficulty: 'easy' });
  const { game, root, key, run } = await play(project);
  assert.deepEqual(inspectGameSession(game, root).errors, []);
  assert.ok(game.solids.size >= 20, 'the level walls are registered as solids');
  const player = game.actors.get('player').object, level = project.levels[0];
  assert.deepEqual(player.position.toArray(), [level.entry.x, level.entry.y, level.entry.z]);
  // Hold one direction far longer than the map is wide: the walls must stop the player inside it.
  key('keydown', 'KeyA');
  run(20);
  key('keyup', 'KeyA');
  const half = 13 * 4 / 2;
  assert.ok(Math.abs(player.position.x) < half && Math.abs(player.position.z) < half, `player left the map at ${player.position.x}`);
  for (const solid of game.solids.values()) assert.ok(!(player.position.x > solid.bounds.min.x && player.position.x < solid.bounds.max.x && player.position.z > solid.bounds.min.z && player.position.z < solid.bounds.max.z), 'player is inside a wall');
  // Touching each crystal and then the portal completes the level.
  game.restart();
  const crystals = level.placements.filter(placement => placement.role === 'collectible');
  for (const crystal of crystals) { player.position.set(crystal.position.x, crystal.position.y, crystal.position.z); run(0.05); }
  assert.equal(game.state.score, crystals.length);
  assert.equal(game.phase, 'running', 'crystals alone do not finish a collect-and-escape game');
  const portal = level.placements.find(placement => placement.role === 'goal');
  player.position.set(portal.position.x, portal.position.y, portal.position.z);
  run(0.05);
  assert.equal(game.phase, 'won');
});

test('terrain games keep the player and enemies on the ground they are drawn on', async () => {
  const project = createInstantGame({ template: 'survive', theme: 'forest', size: 'small', seed: 21 });
  const { game, run } = await play(project);
  const heightAt = worldHelpers.worldGround(game.levels.get(project.levels[0].id).object), player = game.actors.get('player').object;
  run(6);
  assert.ok(Math.abs(player.position.y - heightAt(player.position.x, player.position.z)) < 0.02);
  const chasers = [...game.actors.values()].filter(actor => actor.behavior && actor.object.position.distanceTo(actor.spawn) > 0.5);
  assert.ok(chasers.length > 0, 'enemies pursue in a survival game');
  for (const actor of chasers) assert.ok(Math.abs(actor.object.position.y - heightAt(actor.object.position.x, actor.object.position.z)) < 0.02);
});

test('adding instant levels to a project keeps one hero that stays visible in every level', async () => {
  const project = createInstantGame({ template: 'escape', theme: 'dungeon', size: 'small', seed: 2 }), next = createInstantGame({ template: 'escape', theme: 'forest', size: 'small', seed: 4 });
  const second = importLevelSnapshot(project, { level: next.levels[0], objects: next.objects, interactions: [] });
  assert.equal(project.levels.length, 2);
  const { game, root, run } = await play(project);
  const player = game.actors.get('player').object, shown = node => { for (let n = node; n; n = n.parent) if (!n.visible) return false; return true; };
  assert.equal(player.parent, root, 'the hero is not a child of a level that gets hidden');
  const portal = project.levels[0].placements.find(placement => placement.role === 'goal');
  player.position.set(portal.position.x, portal.position.y, portal.position.z);
  run(0.1);
  assert.equal(game.activeLevelId, second.id);
  assert.equal(shown(player), true);
  assert.equal(game.phase, 'running');
  assert.deepEqual(player.position.toArray().map(v => +v.toFixed(3)), [second.entry.x, second.entry.y, second.entry.z].map(v => +v.toFixed(3)));
});

test('an instant level is ordinary level source with its plan', () => {
  const level = createInstantLevel({ prompt: 'snowy mountain pass' });
  assert.equal(level.blueprint.theme, 'snow');
  assert.equal(level.title, 'snowy mountain pass');
  assert.match(level.code, /H\.world\(/);
  assert.notDeepEqual(createInstantLevel({ prompt: 'snowy mountain pass', variation: 1 }).blueprint.seed, level.blueprint.seed);
});
