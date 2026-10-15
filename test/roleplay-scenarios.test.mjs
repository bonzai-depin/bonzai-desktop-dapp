import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRoleplayScenarios } from '../src/services/roleplayScenarios.js';
test('new bundled artwork replaces cached bundle paths while explicitly regenerated scenes survive reload', () => {
 const defaults=[{id:'a',defaultImage:'scenarios/a.webp'},{id:'b',defaultImage:'scenarios/b.webp'}];
 const stored=[{id:'a',image:'/old/bundle.webp'},{id:'b',image:'data:image/webp;base64,custom',imageRegenerated:true},{id:'custom',image:'custom.webp'}];
 const result=mergeRoleplayScenarios(defaults,stored,path=>'/new/'+path);
 assert.equal(result[0].image,'/new/scenarios/a.webp');
 assert.equal(result[1].image,stored[1].image);
 assert.equal(result[2].id,'custom');
 assert.deepEqual(mergeRoleplayScenarios(defaults,result,path=>'/new/'+path),result);
});
