import test from "node:test";
import assert from "node:assert/strict";
import {
  addClearCondition,
  addLevel,
  addInteraction,
  addObjectAsset,
  applyGameplayPatch,
  buildGameCollectibleManifest,
  compileGameProject,
  createGameProject,
  moveLevel,
  placeObject,
  removePlacement,
  removeLevel,
  setLevelMarker,
  updatePlacement,
  validateGameProject,
} from "../src/components/gen3d/gameProject.js";

test("a game collectible preserves ordered levels, reusable objects and placements", () => {
  const project = createGameProject({ title: "Temple Run" });
  const relic = addObjectAsset(project, { title: "Relic", code: "root.add(relic)" });
  const temple = addLevel(project, { title: "Temple", code: "root.add(temple)" });
  addClearCondition(project, temple.id, { type: "collect", label: "Collect the relic", target: 1, tag: "relic" });
  placeObject(project, temple.id, relic.id, {
    position: { x: 2, y: 1, z: -4 },
    role: "collectible",
    tags: ["relic"],
  });
  addInteraction(project, {
    sourcePlacementId: temple.placements[0].id,
    targetPlacementId: temple.placements[0].id,
    type: "activates",
  });

  const verdict = validateGameProject(project);
  assert.equal(verdict.ok, true);
  const manifest = buildGameCollectibleManifest(project);
  assert.deepEqual(manifest.levelOrder, [temple.id]);
  assert.equal(manifest.levels[0].placements[0].objectId, relic.id);
  assert.equal(manifest.kind, "game");
});

test("generated modules compile as reusable level and object builders", () => {
  const project = createGameProject({ title: "Generated game" });
  const wrapper = (body) => `const setup = true;\n// ── USER CODE START ──\n${body}\n// ── USER CODE END ──\nreturn root;`;
  const player = addObjectAsset(project, {
    title: "Hero",
    code: wrapper("const hero = new THREE.Group(); root.add(hero);"),
  });
  const level = addLevel(project, {
    title: "Garden",
    code: wrapper("const floor = new THREE.Group(); root.add(floor);"),
  });
  const placement = placeObject(project, level.id, player.id, { role: "player" });
  setLevelMarker(project, level.id, "start", { x: 1, y: 2, z: 3 });
  setLevelMarker(project, level.id, "finish", { x: 9, y: 1, z: -2 });
  addClearCondition(project, level.id, { type: "reach", label: "Reach the gate" });
  updatePlacement(project, level.id, placement.id, { scale: { x: 2, y: 2, z: 2 } });

  const code = compileGameProject(project);
  assert.doesNotMatch(code, /const setup = true/);
  assert.match(code, /game\.player\(placement0_0/);
  assert.match(code, /entry: new THREE\.Vector3\(1, 2, 3\)/);
  assert.match(code, /clearMarker0_0\.position\.set\(9, 1, -2\)/);
});

test("level ordering and placement removal remain deterministic", () => {
  const project = createGameProject({ title: "Course" });
  const object = addObjectAsset(project, { code: "root.add(object)" });
  const first = addLevel(project, { title: "First", code: "root.add(first)" });
  const second = addLevel(project, { title: "Second", code: "root.add(second)" });
  addClearCondition(project, first.id, { type: "score", label: "Score 10", target: 10 });
  addClearCondition(project, second.id, { type: "survive", label: "Survive", target: 10 });
  const placement = placeObject(project, first.id, object.id);

  assert.equal(moveLevel(project, second.id, -1), true);
  assert.deepEqual(project.levelOrder, [second.id, first.id]);
  assert.equal(removePlacement(project, first.id, placement.id).id, placement.id);
  assert.equal(first.placements.length, 0);
  assert.equal(removeLevel(project, second.id).id, second.id);
  assert.deepEqual(project.levelOrder, [first.id]);
});

test("a project compiles reusable assets into an ordered playable game", () => {
  const project = createGameProject({ title: "Temple Run" });
  const relic = addObjectAsset(project, {
    title: "Relic",
    code: "const relic = new THREE.Mesh(); root.add(relic);",
  });
  const temple = addLevel(project, {
    title: "Temple",
    code: "const floor = new THREE.Group(); root.add(floor);",
  });
  addClearCondition(project, temple.id, { type: "collect", label: "Collect the relic", target: 1, tag: "relic" });
  placeObject(project, temple.id, relic.id, {
    position: { x: 2, y: 1, z: -4 },
    role: "collectible",
    tags: ["relic"],
  });

  const code = compileGameProject(project);
  assert.match(code, /GAME\.create/);
  assert.match(code, /await buildObject0/);
  assert.match(code, /game\.level/);
  assert.doesNotMatch(code, /clearMarker/);
  assert.match(code, /game\.player/);
  assert.match(code, /game\.interaction/);
  assert.match(code, /game\.start/);
});

test("a project cannot tokenize a placement with a missing object", () => {
  const project = createGameProject({ title: "Broken World" });
  const level = addLevel(project, { code: "root.add(level)" });
  addClearCondition(project, level.id, { type: "score", label: "Score", target: 1 });
  level.placements.push({ id: "bad", objectId: "missing" });
  assert.equal(validateGameProject(project).ok, false);
  assert.throws(() => buildGameCollectibleManifest(project), /missing object/);
});

test("history provenance survives materialization into project assets", () => {
  const project = createGameProject({ title: "History game" });
  const object = addObjectAsset(project, {
    code: "root.add(object)",
    sourceInferenceId: "inference-object",
  });
  const level = addLevel(project, {
    code: "root.add(level)",
    sourceInferenceId: "inference-level",
  });
  addClearCondition(project, level.id, { type: "survive", label: "Survive", target: 10 });

  assert.equal(object.sourceInferenceId, "inference-object");
  assert.equal(level.sourceInferenceId, "inference-level");
});

test("AI gameplay patches update clear conditions and placed object roles without arbitrary code", () => {
  const project = createGameProject({ title: "Director test" });
  const asset = addObjectAsset(project, { title: "Guardian", code: "root.add(guardian)" });
  const level = addLevel(project, { title: "Arena", code: "root.add(arena)" });
  const guardian = placeObject(project, level.id, asset.id);

  applyGameplayPatch(project, {
    premise: "Defeat the guardian to clear the arena.",
    levelUpdates: [{
      levelId: level.id,
      clearMode: "all",
      clearConditions: [{ type: "defeat", label: "Defeat the guardian", target: 1, tag: "guardian" }],
    }],
    placementUpdates: [{ placementId: guardian.id, role: "enemy", tags: ["guardian"], settings: { health: 250 } }],
  });

  assert.equal(level.clearConditions[0].type, "defeat");
  assert.equal(guardian.role, "enemy");
  assert.equal(guardian.settings.health, 250);
  assert.match(compileGameProject(project), /\"type\":\"defeat\"/);
  assert.throws(() => applyGameplayPatch(project, {
    placementUpdates: [{ placementId: guardian.id, role: "script:evil()" }],
  }), /Unsupported object role/);
});

test("all and any clear modes compile as explicit level groups", () => {
  const project = createGameProject({ title: "Choice" });
  const level = addLevel(project, { title: "Vault", code: "root.add(vault)" });
  applyGameplayPatch(project, {
    levelUpdates: [{
      levelId: level.id,
      clearMode: "any",
      clearConditions: [
        { type: "score", label: "Score 100", target: 100 },
        { type: "survive", label: "Survive 60 seconds", target: 60 },
      ],
    }],
  });

  const code = compileGameProject(project);
  assert.match(code, /\"mode\":\"any\"/);
  assert.match(code, /Score 100/);
  assert.match(code, /Survive 60 seconds/);
});

test("unfinished levels preview in build mode but remain blocked from publishing", () => {
  const project = createGameProject({ title: "Draft" });
  addLevel(project, { title: "Unscripted", code: "root.add(level)" });

  assert.equal(validateGameProject(project).ok, false);
  assert.match(compileGameProject(project), /Designing gameplay/);
});

test("placement roles compile to behaviour, not only to labels", () => {
  // A placed enemy used to be inert, a trap removed its damage every frame, a platform could
  // not be stood on, and nothing in a compiled game stopped the player at a wall.
  const project = createGameProject({ title: "Roles" });
  const level = addLevel(project, { title: "Yard", code: "root.add(new THREE.Mesh(new THREE.BoxGeometry(20,1,20)));" });
  const asset = addObjectAsset(project, { title: "Piece", code: "root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1)));" });
  const place = (role, settings) => placeObject(project, level.id, asset.id, { role, settings });
  const hero = place("player", { jump: 1.2, camera: [0, 8, 6] });
  const enemy = place("enemy", { damage: 15, speed: 3 }), guard = place("enemy", { behavior: "static" });
  const gem = place("collectible"), orb = place("buff", { heal: 40 }), trap = place("trap"), ledge = place("platform");
  const code = compileGameProject(project), line = (text) => code.split("\n").find((row) => row.includes(text)) || "";
  assert.match(line("game.player("), /jump: 1\.2, cameraOffset: \[0, 8, 6\]/);
  assert.match(code, new RegExp(`root\\.add\\(placement0_0\\)`), "the hero is parented beside the levels");
  assert.match(line(`game.actor("${enemy.id}"`), /"contactDamage":15,"behavior":\{"type":"chase","speed":3,"range":11\}/);
  assert.doesNotMatch(line(`game.actor("${guard.id}"`), /behavior/);
  assert.match(line(`game.actor("${gem.id}"`), /"pickup":true/);
  assert.match(line(`game.actor("${orb.id}"`), /"pickup":true,"heal":40/);
  assert.match(line(`contact_${trap.id}`), /once: false, cooldown: 1,/);
  assert.match(code, new RegExp(`game\\.solid\\("${ledge.id}", placement0_6, \\{ levelId: "${level.id}" \\}\\)`));
  assert.match(code, /H\.worldColliders\(levelRoot0\)\.forEach/);
  assert.ok(hero.id);
});
