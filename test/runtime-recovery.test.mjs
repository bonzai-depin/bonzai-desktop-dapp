import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generatedThreeAPI, repairUndeclaredAssignment, renderWithRecovery } from '../src/components/gen3d/runtimeRecovery.js';
test('generated instance rotations preserve placement and do not modify the global Matrix4 API',()=>{
 const api=generatedThreeAPI(THREE);
 const matrix=new api.Matrix4().makeTranslation(7,2,-4);
 assert.equal(matrix.rotateY(Math.PI/2).rotateX(.3).rotateZ(-.2),matrix);
 const expected=new THREE.Matrix4().makeTranslation(7,2,-4)
  .multiply(new THREE.Matrix4().makeRotationY(Math.PI/2))
  .multiply(new THREE.Matrix4().makeRotationX(.3))
  .multiply(new THREE.Matrix4().makeRotationZ(-.2));
 assert.deepEqual(matrix.elements,expected.elements);
 assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),[7,2,-4]);
 assert.equal(THREE.Matrix4.prototype.rotateY,undefined);
});
test('gimbal rune Path contours become valid filled and extruded shapes without changing THREE globally',()=>{
 const api=generatedThreeAPI(THREE), path=new THREE.Path();
 path.moveTo(0,0);path.lineTo(1,0);path.lineTo(1,1);path.lineTo(0,1);path.closePath();
 const hole=new THREE.Path();hole.absarc(.5,.5,.15,0,Math.PI*2,true);path.holes=[hole];
 for(const geo of [new api.ShapeGeometry(path),new api.ExtrudeGeometry([path],{depth:.1,bevelEnabled:false})]){
  assert.ok(geo.attributes.position.count>0);
  assert.ok(Array.from(geo.attributes.position.array).every(Number.isFinite));geo.dispose();
 }
 assert.equal(path.isShape,undefined);assert.notEqual(api.ShapeGeometry,THREE.ShapeGeometry);
});
test('undeclared assignment repair targets syntax only and does not guess missing input values',()=>{
 const error=new ReferenceError('glassMap is not defined');
 const code='const glassMat = {}; /* glassMap = unknown; */ glassMap = glassMat;';
 assert.equal(repairUndeclaredAssignment(code,error),'const glassMat = {}; /* glassMap = unknown; */ let glassMap = glassMat;');
 assert.equal(repairUndeclaredAssignment('const m = glassMap;',error),null);
 assert.equal(repairUndeclaredAssignment('glassMap = a; glassMap = b;',error),null);
});
test('successive independent runtime errors are repaired and checked by rendering again',async()=>{
 const seen=[];let llmRepairs=0;
 const result=await renderWithRecovery({code:'glassMap = glassMat; failNext();',render:async code=>{
  seen.push(code);if(!code.startsWith('let '))throw new ReferenceError('glassMap is not defined');
  if(code.includes('failNext()'))throw new TypeError('Second error');return 'rendered';
 },repair:async({code,error})=>{llmRepairs++;assert.equal(error.message,'Second error');return code.replace('failNext();','');}});
 assert.equal(result.result,'rendered');assert.equal(seen.length,3);assert.equal(llmRepairs,1);
});
test('bounded recovery retains failed code and diagnostics; unchanged repair never reports success',async()=>{
 let attempts=0;
 await assert.rejects(renderWithRecovery({code:'original',render:async()=>{attempts++;throw new Error('bad geometry');},repair:async({code})=>code+' change'}),error=>{
  assert.equal(error.generatedCode,'original change change change');assert.equal(error.generationFailures.length,4);return true;
 });assert.equal(attempts,4);
 await assert.rejects(renderWithRecovery({code:'same',render:async()=>{throw new Error('broken');},repair:async({code})=>code}),/no progress/);
});

test('async construction wrappers finish before the returned group is inspected',async()=>{
 const {awaitSceneConstruction}=await import('../src/components/gen3d/runtimeRecovery.js');
 const code=`export default async function(ctx){const root=[];(async()=>{await ctx.load();root.push('mesh');})();return root;}`;
 const fixed=awaitSceneConstruction(code);assert.equal(awaitSceneConstruction(fixed),fixed);
 const mod=await import('data:text/javascript,'+encodeURIComponent(fixed));
 assert.deepEqual(await mod.default({load:()=>new Promise(resolve=>setTimeout(resolve,5))}),['mesh']);
 await assert.rejects(mod.default({load:async()=>{throw Error('Missing texture');}}),/Missing texture/);
 const animation=`export default async function(ctx){ctx.addUpdateCallback(()=>{(async()=>{await ctx.load();})();});}`;
 assert.equal(awaitSceneConstruction(animation),animation,'do not make a synchronous animation callback syntactically invalid');
 assert.equal(awaitSceneConstruction('export default async function(){bad(}'),'export default async function(){bad(}');
});

import { constructionHelpers as H } from '../src/components/gen3d/constructionHelpers.js';
test('Rally Buggy helper assemblies are cloned instead of crashing Mesh.updateMorphTargets',()=>{
 const frame = new THREE.MeshStandardMaterial({color:0x888888});
 const rubber = new THREE.MeshStandardMaterial({color:0x1a1a1a});
 const wheel=H.wheel({radius:.12,width:.08,hubRadius:.04,spokes:6,rim:.015,material:frame});
 // Exact constructor misuse from the failed Rally Buggy generation.
 assert.throws(()=>new THREE.Mesh(wheel,rubber),/Cannot convert undefined or null to object/);
 const API=generatedThreeAPI(THREE);
 const tires=Array.from({length:4},()=>new API.Mesh(wheel,rubber));
 assert.equal(new Set(tires).size,4);
 for(const tire of tires){assert.ok(tire.isObject3D);assert.notEqual(tire,wheel);tire.traverse(child=>{if(child.isMesh){assert.ok(child.geometry.isBufferGeometry);assert.equal(child.material,rubber);}});}
 wheel.traverse(child=>{if(child.isMesh)assert.equal(child.material,frame);});
 const spring=H.spring({radius:.035,height:.12,wire:.006,turns:6,material:frame});
 const copy=new API.Mesh(spring,null);
 copy.traverse(child=>{if(child.isMesh)assert.equal(child.material,frame);});
 const actual=new API.Mesh(new THREE.BoxGeometry(),frame);
 assert.ok(actual instanceof THREE.Mesh);
});
