import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync,readFileSync } from 'node:fs';
import { focusedThreeReferences } from '../src/components/gen3d/threeReferences.js';
const files=Object.fromEntries(readdirSync('src/skills/threejs').filter(n=>n.startsWith('threejs-')).map(n=>[`${n}/CHEATSHEET.md`,readFileSync(`src/skills/threejs/${n}/CHEATSHEET.md`,'utf8')]));
test('subject-specific references preserve construction and omit competing render loops',()=>{
  for(const brief of ['Emergency LED lantern with glass','Une lanterne avec éclairage chaud','A carved stone fountain','A hinged wooden chest','A courtyard level']){
    const result=focusedThreeReferences(brief,files);
    for(const api of ['LatheGeometry','ExtrudeGeometry','InstancedMesh','MeshPhysicalMaterial'])assert.ok(result.includes(api),api);
    assert.ok(result.length<=8000);
    assert.doesNotMatch(result,/requestAnimationFrame|new THREE.Scene|new OrbitControls/);
  }
  assert.match(focusedThreeReferences('Une lanterne avec éclairage chaud',files),/PointLight/);
  assert.doesNotMatch(focusedThreeReferences('A wooden chair',files),/RawShaderMaterial|PointsMaterial|EffectComposer/);
});
test('section selection is deterministic, respects exact budgets and retains complete examples',()=>{
  const source={'threejs-geometry/CHEATSHEET.md':'## Basic Shapes\nBoxGeometry(w,h,d)\n## Giant\n'+ 'x'.repeat(9000),
    'threejs-lighting/CHEATSHEET.md':'## Light Types\nPointLight(color,intensity)'};
  const result=focusedThreeReferences('lamp',source,100);
  assert.ok(result.length<=100);assert.match(result,/PointLight\(color,intensity\)/);assert.doesNotMatch(result,/Giant/);
  assert.equal(result,focusedThreeReferences('lamp',Object.fromEntries(Object.entries(source).reverse()),100));
});
