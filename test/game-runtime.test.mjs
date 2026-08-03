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
