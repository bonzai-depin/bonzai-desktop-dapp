import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { materialCatalogue, materialFamilies, resolveMaterial, findMaterials, materialContext } from '../src/components/gen3d/materialCatalogue.js';
import { buildScenePrompt } from '../src/components/gen3d/generationContract.js';

test('independent collection covers 22 families with complete verified 2K PBR maps',async()=>{
  assert.ok(materialCatalogue.length>=170);assert.equal(materialFamilies.length,22);
  assert.equal(new Set(materialCatalogue.map(m=>m.id)).size,materialCatalogue.length);
  for(const id of ['brick_wall_001','concrete_floor_worn_001','grass_ground'])assert.ok(!materialCatalogue.some(m=>m.id===id));
  for(const m of materialCatalogue){
    assert.equal(m.license,'CC0-1.0');assert.equal(m.resolution,2048);
    for(const name of ['diffuse','normal-gl','roughness'])assert.ok(m.maps[name],`${m.id}/${name}`);
    for(const map of Object.values(m.maps)){
      const data=await readFile(new URL(`../src/assets/materials/${map.file}`,import.meta.url));
      assert.equal(data.length,map.bytes);assert.equal(createHash('md5').update(data).digest('hex'),map.md5,map.file);
    }
  }
});
test('saved family aliases resolve to new scans and variants remain distinct',()=>{
  for(const family of materialFamilies){
    assert.equal(resolveMaterial(family).family,family);
    assert.notEqual(resolveMaterial(family).id,resolveMaterial(family,1).id);
  }
  assert.equal(resolveMaterial('ground').family,'earth');
  assert.equal(resolveMaterial('metal_plate').id,'metal_plate');
  assert.throws(()=>resolveMaterial('invented_texture'));assert.throws(()=>resolveMaterial('wood',-1));
});
test('brief-based retrieval keeps context bounded and matches material needs in English and French',()=>{
  for(const [query,family] of [['wooden chair','wood'],['snow arctic','snow'],['robe en cuir','leather'],['vaisseau en acier','metal']]){
    const matches=findMaterials(query);assert.ok(matches.some(m=>m.family===family),query);assert.ok(matches.length<=12);
  }
  assert.ok(materialContext('castle stone wood grass').length<2400);
  assert.equal(materialContext('unmatchablexyz'),'');
  const prompt=buildScenePrompt({brief:'wooden chair',mode:'object'});
  assert.ok(prompt.includes('LOCAL MATERIAL SHORTLIST'));assert.ok(prompt.includes('american_walnut_veneer')||prompt.includes('ash_veneer'));
});
