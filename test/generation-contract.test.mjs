import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildScenePrompt, buildSceneRevision, buildSceneRepair, selectThreeReferences, applySceneEdits } from '../src/components/gen3d/generationContract.js';
const files = Object.fromEntries(readdirSync('src/skills/threejs').filter(n => n.startsWith('threejs-')).map(n => [`${n}/CHEATSHEET.md`, readFileSync(`src/skills/threejs/${n}/CHEATSHEET.md`, 'utf8')]));
test('construction retains user intent when the planner omits a constraint', () => {
  const prompt = buildScenePrompt({ brief: 'A limestone fountain, no gold and exactly two tiers.', plan: 'Three tiers with gold.', references: selectThreeReferences('fountain water stone', files) });
  assert.match(prompt, /no gold and exactly two tiers/);
  assert.match(prompt, /Preserve the original brief/);
  assert.match(prompt, /FLUID.jet|jet\(/);
  assert.doesNotMatch(prompt, /Arcane Orrery|AT MINIMUM|EVERY subsystem/);
});
test('references expose geometry and relevant techniques without unbounded context', () => {
  const water = selectThreeReferences('fountain water stone', files);
  assert.match(water, /LatheGeometry/);
  assert.match(water, /InstancedMesh/);
  assert.ok(water.length < 14500);
  const furniture = selectThreeReferences('wooden chair', files);
  assert.doesNotMatch(furniture, /EffectComposer|requestAnimationFrame/);
});
test('refinement keeps animation and treats small changes as small changes', () => {
  const prompt = buildSceneRevision({ code: 'addUpdateCallback(tick);', instruction: 'Make the rim 5% thinner' });
  assert.match(prompt, /Preserve unaffected geometry, materials, animation and gameplay/);
  assert.match(prompt, /5% thinner/);
  assert.doesNotMatch(prompt, /NO ANIMATION|at least 50%|at least 2-3/);
});

test('bounded repairs preserve unaffected construction and reject ambiguous edits', () => {
  const code = 'const stone = makeStone();\nscene.addUpdateCallback(tick);';
  assert.equal(applySceneEdits(code, JSON.stringify({ edits: [{ old: 'scene.addUpdateCallback(tick);', new: 'addUpdateCallback(tick);' }] })), 'const stone = makeStone();\naddUpdateCallback(tick);');
  assert.throws(() => applySceneEdits('x(); x();', '{"edits":[{"old":"x();","new":"y();"}]}'), /ambiguous/);
  assert.throws(() => applySceneEdits(code, '{"edits":[{"old":"missing","new":"x"}]}'), /missing/);
});

test('subject-specific techniques do not steer unrelated assets toward fountains', () => {
  for (const brief of ['A wooden chair', 'A mechanical vehicle', 'An organic dragon', 'A stone castle interior', 'An abstract sculpture']) {
    const prompt = buildScenePrompt({brief});
    assert.doesNotMatch(prompt, /tieredFountain|fountainBasin/);
    assert.match(prompt, /appropriate to the request/);
  }
  assert.match(buildScenePrompt({brief:'An organic dragon'}), /coherent anatomy/);
  assert.match(buildScenePrompt({brief:'A mechanical vehicle'}), /aligned axles/);
  assert.match(buildScenePrompt({brief:'A stone castle interior'}), /navigable space/);
  assert.match(buildScenePrompt({brief:'An upholstered chair'}), /upholstery volume/);
});

test('production construction tools and surface scale survive level generation, revision and repair', () => {
  for (const prompt of [buildScenePrompt({mode:'level',brief:'A stone courtyard'}),
    buildSceneRevision({mode:'level',code:'root.add(terrain);',instruction:'Improve the walls'}),
    buildSceneRepair({mode:'level',code:'bad()',error:'Missing wall'})]) {
    assert.match(prompt,/MAT.surface/); assert.match(prompt,/H.bevelBox/);
    assert.match(prompt,/foreground, midground and background/);
    assert.match(prompt,/z-fighting/); assert.match(prompt,/matched color.*roughness/);
  }
});
test('construction patterns teach real openings and hollow profiles without substituting a scene',()=>{
 const architecture=buildScenePrompt({brief:'a station courtyard with arches',mode:'level'});
 const vessel=buildScenePrompt({brief:'a hollow ceramic vase'});
 const machine=buildScenePrompt({brief:'an industrial radio'});
 assert.match(architecture,/REAL OPENING \/ ARCH PATTERN/);assert.match(architecture,/holes:\[aperture\]/);
 assert.match(vessel,/HOLLOW PROFILE PATTERN/);assert.doesNotMatch(vessel,/REAL OPENING \/ ARCH PATTERN/);
 assert.match(machine,/MANUFACTURED PANEL/);assert.doesNotMatch(machine,/HOLLOW PROFILE PATTERN/);
});
test('generation, refinement and repair receive the same bounded construction API',()=>{
 for(const prompt of [buildScenePrompt({brief:'Emergency lantern with glass panes and LED'}),buildSceneRevision({instruction:'Repair the lantern glass',code:'const lamp = 1;'}),buildSceneRepair({brief:'Emergency lantern',code:'const lamp = 1;',error:'blocked light'})]){
  assert.match(prompt,/H\.assemble/);assert.match(prompt,/H\.lightSource/);assert.match(prompt,/H\.fittedWindow/);
 }
 const prompt=buildScenePrompt({brief:'A forest castle bridge',mode:'level'});assert.match(prompt,/H\.terrainPatch/);assert.match(prompt,/H\.seatedProp/);
});
