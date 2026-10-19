import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreativeDirection, creativeDirectionPrompt } from '../src/components/gen3d/creativeDirection.js';
import { buildScenePrompt } from '../src/components/gen3d/generationContract.js';

test('successive generations change substantive design direction even with identical entropy', () => {
  for (const brief of ['A fountain', 'A forest dragon', 'A racing vehicle', 'A velvet chair', 'A moon base']) {
    const first = createCreativeDirection({brief,seed:42});
    const second = createCreativeDirection({brief,seed:42,history:[{prompt:brief,assetKind:'object',creativeDirection:first,blueprint:'Existing curved form with layered trim'}]});
    assert.notEqual(first.form, second.form);
    assert.notEqual(first.detail, second.detail);
    assert.notEqual(buildScenePrompt({brief,variation:creativeDirectionPrompt(first)}),buildScenePrompt({brief,variation:creativeDirectionPrompt(second)}));
    assert.match(creativeDirectionPrompt(second),/Existing curved form/);
    assert.match(creativeDirectionPrompt(second),/Changing only a title, camera angle/);
    assert.match(creativeDirectionPrompt(second),/remain binding/);
  }
});
test('history is scoped to the same normalized brief and asset kind, without failed runs', () => {
  const direction = createCreativeDirection({brief:' A   CHAIR ',seed:5,history:[
    {prompt:'a chair',assetKind:'object',blueprint:'Relevant',creativeDirection:{form:0,detail:0}},
    {prompt:'a chair',assetKind:'level',blueprint:'Wrong mode'},
    {prompt:'a chair',success:false,blueprint:'Failed'},
    {prompt:'a dragon',blueprint:'Wrong subject'},
  ]});
  assert.deepEqual(direction.previousPlans,['Relevant']);
  assert.equal(direction.form,1);
});
test('reference reconstruction and repeated refinements do not redesign specified geometry', () => {
  const prompt = creativeDirectionPrompt(createCreativeDirection({brief:'Reconstruct this',reference:true,seed:1}));
  assert.match(prompt,/Preserve the supplied silhouette/);
  assert.doesNotMatch(prompt,/Vary at least two/);
  assert.equal(creativeDirectionPrompt(null),'');
});

test('first-generation style guidance cannot redesign previously planned structural joints',()=>{
 const first=creativeDirectionPrompt(createCreativeDirection({brief:'A lantern',seed:17}));
 assert.doesNotMatch(first,/Vary at least two|State the chosen design differences/);
 assert.match(first,/shared joint dimensions remain binding/);
 assert.match(first,/Do not redesign an existing assembly plan/);
 const repeat=creativeDirectionPrompt(createCreativeDirection({brief:'A lantern',seed:17,history:[{prompt:'A lantern',blueprint:'Old geometry'}]}));
 assert.match(repeat,/Previous interpretations/);
 assert.match(repeat,/shared joint dimensions remain binding/);
});
