import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createGameRuntime,
  validateGeneratedGameCode,
  validateGameSpec,
} from "../src/components/gen3d/gameRuntime.js";

function keyEvent(type, code) {
  const event = new Event(type);
  Object.defineProperty(event, "code", { value: code });
  return event;
}

test("game specifications fail before runtime creation when objectives are malformed", () => {
  const result = validateGameSpec({
    title: "Test",
    objectives: [{ id: "goal", type: "unknown" }],
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /unsupported/);
});

test("generated game gate rejects scenes that only look playable", () => {
  const result = validateGeneratedGameCode(`
    const game = GAME.create({ title: "Arena", objectives: [] });
    game.start();
  `);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, [
    "a registered player",
    "at least one objective",
    "an interaction or trigger",
    "a fail path",
  ]);
});

test("player input, collection and required objectives form a complete game loop", () => {
  let update;
  const events = new EventTarget();
  const runtime = createGameRuntime({
    THREE,
    eventTarget: events,
    addUpdateCallback(callback) {
      update = callback;
    },
  });
  const game = runtime.create({
    title: "Relic Run",
    objectives: [
      { id: "relics", type: "collect", label: "Collect two relics", target: 2, tag: "relic" },
    ],
  });
  const player = new THREE.Group();
  game.player(player, { speed: 4, camera: false });
  game.actor("relic-a", new THREE.Group(), { score: 10 });
  game.actor("relic-b", new THREE.Group(), { score: 10 });
  game.start();

  events.dispatchEvent(keyEvent("keydown", "KeyW"));
  update({ deltaTime: 0.25, time: 1 });
  events.dispatchEvent(keyEvent("keyup", "KeyW"));
  assert.equal(player.position.z, -0.2);

  assert.equal(game.collect("relic-a", 1, "relic"), true);
  assert.equal(game.phase, "running");
  assert.equal(game.collect("relic-b", 1, "relic"), true);
  assert.equal(game.phase, "won");
  assert.equal(game.state.score, 20);
});

test("creating a new session disposes the previous session and its input", () => {
  const events = new EventTarget();
  const runtime = createGameRuntime({ THREE, eventTarget: events });
  const first = runtime.create({ title: "First" });
  const second = runtime.create({ title: "Second" });
  assert.equal(first.phase, "disposed");
  assert.equal(runtime.active, second);
  runtime.dispose();
  assert.equal(second.phase, "disposed");
  assert.equal(runtime.active, null);
});

test("ordered levels switch visibility and move the player to the level entry", () => {
  const runtime = createGameRuntime({ THREE, eventTarget: new EventTarget() });
  const game = runtime.create({ title: "World" });
  const player = new THREE.Group();
  game.player(player);
  const first = new THREE.Group();
  const second = new THREE.Group();
  game.level("one", first, { entry: new THREE.Vector3(0, 0, 0) });
  game.level("two", second, { entry: new THREE.Vector3(4, 0, -2) });
  game.goToLevel("two");
  assert.equal(first.visible, false);
  assert.equal(second.visible, true);
  assert.deepEqual(player.position.toArray(), [4, 0, -2]);
});

test("a companion autonomously reaches and collects objective actors", () => {
  let update;
  const runtime = createGameRuntime({
    THREE,
    eventTarget: new EventTarget(),
    addUpdateCallback(callback) { update = callback; },
  });
  const game = runtime.create({
    title: "Agent run",
    objectives: [{ id: "relic", type: "collect", label: "Relic", target: 1, tag: "relic" }],
  });
  const player = new THREE.Group();
  const relic = new THREE.Group();
  relic.position.set(0.4, 0, 0);
  game.player(player, { speed: 4, camera: false });
  game.actor("relic", relic, { tags: ["relic"], radius: 0.1 });
  game.agent({ companionId: "aurore" }).start();
  for (let index = 0; index < 10 && game.phase === "running"; index += 1) {
    update({ deltaTime: 0.05, time: index * 0.05 });
  }
  assert.equal(game.phase, "won");
  assert.equal(game.agentic.companionId, "aurore");
});

test("authored object interactions execute through the runtime graph", () => {
  const runtime = createGameRuntime({ THREE, eventTarget: new EventTarget() });
  const game = runtime.create({
    title: "Interaction graph",
    objectives: [{ id: "relic", type: "collect", label: "Relic", target: 1 }],
  });
  game.player(new THREE.Group());
  game.actor("relic", new THREE.Group());
  game.interaction("player", "relic", { type: "collects", amount: 1 });
  game.start();
  assert.equal(game.interact("player", "relic"), true);
  assert.equal(game.actors.get("relic").object.visible, false);
  assert.equal(game.phase, "won");
});

test("level clear groups support alternate conditions and advance the campaign", () => {
  const runtime = createGameRuntime({ THREE, eventTarget: new EventTarget() });
  const game = runtime.create({
    title: "Campaign",
    objectives: [
      { id: "relic", type: "collect", label: "Find the relic", target: 1, tag: "relic" },
      { id: "score", type: "score", label: "Score 10", target: 10 },
      { id: "final", type: "score", label: "Score 20", target: 20 },
    ],
    clearGroups: [
      { id: "one", mode: "any", objectiveIds: ["relic", "score"], nextLevelId: "two" },
      { id: "two", mode: "all", objectiveIds: ["final"] },
    ],
  });
  game.player(new THREE.Group());
  game.level("one", new THREE.Group());
  game.level("two", new THREE.Group());
  game.actor("relic", new THREE.Group());
  game.goToLevel("one");
  game.start();

  game.collect("relic", 1, "relic");
  assert.equal(game.activeLevelId, "two");
  assert.equal(game.phase, "running");
  game.score(19);
  assert.equal(game.phase, "won");
});

// Shared harness for the behaviours below: a session whose update loop is driven by the test.
function session(spec = {}) {
  let update;
  const events = new EventTarget();
  const runtime = createGameRuntime({ THREE, eventTarget: events, addUpdateCallback(callback) { update = callback; } });
  const game = runtime.create({ title: "Arena", objectives: [{ id: "end", type: "custom", label: "End", event: "end" }], ...spec });
  const body = () => new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6).translate(0, 0.8, 0));
  const run = (seconds, step = 1 / 60) => { for (let t = 0; t < seconds - 1e-9; t += step) update({ deltaTime: step, time: t }); };
  const key = (type, code) => events.dispatchEvent(keyEvent(type, code));
  return { game, body, run, key };
}

test("an enemy with a chase behaviour pursues the player and hurts on contact once per cooldown", () => {
  // Enemies used to stand still and never hurt the player, so a placed enemy was scenery.
  const { game, body, run } = session();
  game.player(body(), { speed: 4, camera: false });
  const enemy = body();
  enemy.position.set(6, 0, 0);
  game.actor("guard", enemy, { tags: ["enemy"], behavior: { type: "chase", speed: 3, range: 10 }, contactDamage: 20, contactCooldown: 1 });
  game.start();
  run(1);
  assert.ok(enemy.position.x < 3.1 && enemy.position.x > 2.9, "the enemy closes the distance at its own speed");
  assert.equal(game.state.health, 100);
  run(2.5);
  assert.equal(game.state.health, 60, "two seconds in contact is two hits, not one hit per frame");
});

test("an enemy outside its range leaves the player alone", () => {
  const { game, body, run } = session();
  game.player(body(), { camera: false });
  const enemy = body();
  enemy.position.set(30, 0, 0);
  game.actor("guard", enemy, { behavior: { type: "chase", speed: 3, range: 10 }, contactDamage: 20 });
  game.start();
  run(2);
  assert.equal(enemy.position.x, 30);
});

test("a pickup is collected by walking over it and a healing pickup restores health", () => {
  // Collecting used to need the interact key within two metres; a pickup the player walks through was ignored.
  const { game, body, run, key } = session({ objectives: [{ id: "gems", type: "collect", label: "Gems", target: 1, tag: "collectible" }, { id: "end", type: "custom", label: "End", event: "end" }] });
  const player = body();
  game.player(player, { speed: 4, camera: false });
  const gem = body(), orb = body();
  gem.position.set(0, 0, -3); orb.position.set(0, 0, -6);
  game.actor("gem", gem, { tags: ["collectible"], pickup: true });
  game.actor("orb", orb, { tags: ["buff"], pickup: true, heal: 30 });
  game.start();
  game.damage("player", 50);
  key("keydown", "KeyW");
  run(1);
  assert.equal(gem.visible, false);
  assert.equal(game.objectives[0].complete, true);
  run(1);
  assert.equal(game.state.health, 80);
});

test("actors of a hidden level neither collect nor attack", () => {
  const { game, body, run } = session();
  const first = new THREE.Group(), second = new THREE.Group();
  game.level("one", first); game.level("two", second);
  game.player(body(), { camera: false });
  const gem = body(), guard = body();
  second.add(gem, guard);
  game.actor("gem", gem, { pickup: true });
  game.actor("guard", guard, { contactDamage: 50 });
  game.start();
  run(1);
  assert.equal(gem.visible, true);
  assert.equal(game.state.health, 100);
});

test("a repeating trigger with a cooldown fires once per interval while the player stands in it", () => {
  // A trap compiled without a cooldown removed its damage every frame: 20 damage became instant defeat.
  const { game, body, run } = session();
  game.player(body(), { camera: false });
  let hits = 0;
  game.trigger("spikes", new THREE.Group(), { radius: 1, once: false, cooldown: 1, onEnter: () => { hits++; } });
  game.start();
  run(2.5);
  assert.equal(hits, 3);
  game.restart();
  run(0.1);
  assert.equal(hits, 4, "a restart clears the cooldown");
});

test("the player jumps with Space, lands again, and Space stops doubling as interact", () => {
  const { game, body, run, key } = session();
  const player = body();
  game.player(player, { camera: false, jump: 1.2 });
  let interactions = 0;
  const lever = body();
  lever.position.set(1, 0, 0);
  game.actor("lever", lever);
  game.interaction("player", "lever", { onInteract: () => { interactions++; } });
  game.start();
  run(0.1);
  key("keydown", "Space");
  let apex = 0;
  for (let i = 0; i < 90; i++) { run(1 / 60); apex = Math.max(apex, player.position.y); }
  key("keyup", "Space");
  assert.ok(Math.abs(apex - 1.2) < 0.08, `apex ${apex} should match the requested jump height`);
  assert.equal(player.position.y, 0);
  assert.equal(interactions, 0);
  key("keydown", "KeyE");
  run(0.05);
  assert.equal(interactions, 1);
});

test("the player follows registered ground and falling out of the world is reported once", () => {
  const { game, body, run, key } = session({ killY: -5 });
  const player = body();
  game.ground((x, z) => z < -4 ? -100 : -z * 0.5);
  game.player(player, { speed: 4, camera: false });
  let falls = 0;
  game.on("fall", () => { falls++; });
  game.start();
  key("keydown", "KeyW");
  run(0.5);
  assert.ok(Math.abs(player.position.y - 1) < 0.05, "two metres forward on a 1:2 slope is one metre up");
  run(3);
  assert.equal(falls, 1);
});

test("declared boxes let one object carry many colliders for the player and for enemies", () => {
  // A merged or instanced level mesh has one envelope; measuring it would seal every doorway.
  const { game, body, run, key } = session();
  const level = new THREE.Group(), player = body(), enemy = body();
  game.level("one", level);
  game.solid("west", level, { levelId: "one", box: [-5, 0, -10, -4, 3, 10] });
  game.solid("east", level, { levelId: "one", box: [4, 0, -10, 5, 3, 10] });
  enemy.position.set(8, 0, 0);
  game.player(player, { speed: 4, camera: false });
  game.actor("guard", enemy, { behavior: { type: "chase", speed: 3, range: 20 } });
  game.start();
  key("keydown", "KeyA");
  run(3);
  assert.ok(player.position.x > -4 && player.position.x < -3.6, `player stops at the west wall, got ${player.position.x}`);
  assert.ok(enemy.position.x >= 5, "the enemy cannot pass the east wall either");
  assert.throws(() => game.solid("bad", level, { box: [0, 0, 0, 1, 1] }), /six finite numbers/);
});

test("a finished run restarts from the keyboard", () => {
  // Nothing else in the interface restarts a game after a win or a defeat.
  const { game, body, run, key } = session();
  game.player(body(), { camera: false });
  game.start();
  game.damage("player", 100);
  assert.equal(game.phase, "lost");
  key("keydown", "KeyR");
  assert.equal(game.phase, "running");
  assert.equal(game.state.health, 100);
  key("keyup", "KeyR");
  run(0.1);
  key("keydown", "KeyR");
  assert.equal(game.phase, "running", "R does nothing during a run");
});
