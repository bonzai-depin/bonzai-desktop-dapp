import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {parseAssemblyPlan,inspectAssembly,requestAssemblyPlan,repairAssembly,assemblyInstructions,assemblyPlanObservations} from '../src/components/gen3d/assemblyContract.js';
import {radialPanels,strutBetween,framedPanels} from '../src/components/gen3d/productionGeometry.js';
import {renderWithRecovery} from '../src/components/gen3d/runtimeRecovery.js';
const plan={version:1,mechanism:'Battery base supports a transparent light chamber.',parts:[
 {id:'base',role:'battery housing',surface:'opaque',bounds:[[-.3,0,-.3],[.3,.2,.3]]},
 {id:'chamber',role:'transparent enclosure',surface:'glass',bounds:[[-.2,.2,-.2],[.2,1,.2]]}],relations:[{type:'contact',a:'base',b:'chamber'}]};
function scene(opaque=false){const root=new THREE.Group();for(const p of plan.parts){const size=p.bounds[1].map((n,i)=>n-p.bounds[0][i]);const m=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshPhysicalMaterial({transmission:p.surface==='glass'&&!opaque?.9:0}));m.name=p.id;m.position.fromArray(p.bounds[1].map((n,i)=>(n+p.bounds[0][i])/2));root.add(m);}return root;}
test('coarse planned relationships are guidance, not a generation blocker',()=>{
 const bad=structuredClone(plan);bad.parts[1].bounds[0][1]=.4;
 assert.deepEqual(parseAssemblyPlan(JSON.stringify(bad)),bad);
 assert.ok(inspectAssembly(scene(),bad).warnings.length);
 assert.deepEqual(parseAssemblyPlan(JSON.stringify(plan)),plan);
});
test('assembly measurement ignores whole-scene transforms but detects displaced and opaque glazing',()=>{
 const root=scene();root.position.set(20,4,-10);root.scale.setScalar(3);root.rotation.y=.6;
 assert.equal(inspectAssembly(root,plan).status,'checked');
 root.getObjectByName('chamber').position.x+=1;
 assert.match(inspectAssembly(root,plan).warnings.join(' '),/bounds|gap/);
 assert.match(inspectAssembly(scene(true),plan).errors.join(' '),/opaque/);
 assert.equal(inspectAssembly(null,plan).status,'invalid');
});
test('missing and duplicate assemblies cannot silently pass',()=>{
 const root=scene();root.children[1].visible=false;
 assert.match(inspectAssembly(root,plan).errors.join(' '),/visible/);
 root.add(root.children[0].clone());assert.match(inspectAssembly(root,plan).errors.join(' '),/found 2/);
});
test('radial panes face outward and surround an empty chamber',()=>{
 const root=radialPanels({radius:.2,height:.8,material:new THREE.MeshPhysicalMaterial({transmission:.9})});
 for(const pane of root.children){const normal=new THREE.Vector3(0,0,1).applyQuaternion(pane.quaternion);const radial=pane.position.clone().setY(0).normalize();assert.ok(normal.dot(radial)>.99999);assert.ok(pane.geometry.parameters.width<.24);}
 assert.equal(root.children.length,6);
});
test('supports terminate at intended endpoints in arbitrary directions',()=>{
 const a=new THREE.Vector3(-1,2,3),b=new THREE.Vector3(2,4,-1);const mesh=strutBetween(a.toArray(),b.toArray(),.02,new THREE.MeshStandardMaterial());mesh.updateMatrixWorld();
 const end=new THREE.Vector3(0,a.distanceTo(b)/2,0).applyMatrix4(mesh.matrixWorld);assert.ok(end.distanceTo(b)<1e-6);
 assert.throws(()=>strutBetween([0,0,0],[0,0,0],1,mesh.material),/coincide/);
});
test('construction failure triggers a bounded rebuild and validates the repaired geometry',async()=>{
 let repairs=0;const result=await renderWithRecovery({code:'opaque',render:async code=>{const report=inspectAssembly(scene(code==='opaque'),plan);if(report.errors.length)throw Object.assign(new Error(report.errors.join(';')),{name:'AssemblyValidationError'});return report;},repair:async({error})=>{assert.equal(error.name,'AssemblyValidationError');repairs++;return 'glass';}});
 assert.equal(repairs,1);assert.equal(result.result.status,'checked');
});

test('fitted glass overlapping a hollow body envelope does not mean invalid contact',()=>{
 const fitted=structuredClone(plan);fitted.parts[0].bounds=[[-.3,0,-.3],[.3,1,.3]];
 const root=scene();root.children[0].geometry=new THREE.BoxGeometry(.6,1,.6);root.children[0].position.y=.5;
 assert.deepEqual(inspectAssembly(root,fitted).warnings,[]);
});
test('malformed plans retry with actual previous response, then continue without inventing a plan',async()=>{
 const prompts=[];const result=await requestAssemblyPlan({brief:'lantern',generate:async prompt=>{prompts.push(prompt);return 'broken JSON';}});
 assert.equal(result.plan,null);assert.equal(result.diagnostics.length,2);assert.equal(prompts.length,2);assert.match(prompts[1],/broken JSON/);
 const recovered=await requestAssemblyPlan({brief:'lantern',generate:async()=>JSON.stringify(plan)});assert.deepEqual(recovered.plan,plan);
 await assert.rejects(()=>requestAssemblyPlan({brief:'lantern',generate:async()=>{throw Error('Model unavailable');}}),/Model unavailable/);
});
test('single-part plans and malformed null structures are handled deliberately',()=>{
 assert.doesNotThrow(()=>parseAssemblyPlan(JSON.stringify({...plan,parts:[plan.parts[0]],relations:[]})));
 for(const bad of [null,{...plan,parts:[null]},{...plan,relations:[null]}])assert.throws(()=>parseAssemblyPlan(JSON.stringify(bad)));
});
test('unsuccessful construction rebuild restores drawable source with honest diagnostics',async()=>{
 let current='original';let builds=0;const report={errors:['missing part'],warnings:[]};
 const result=await repairAssembly({code:current,inspect:()=>structuredClone(report),rebuild:async()=>{builds++;return 'broken';},render:async code=>{current=code;if(code==='broken')throw Error('Shader failed');}});
 assert.equal(builds,1);assert.equal(current,'original');assert.equal(result.code,'original');assert.match(result.report.warnings.join(' '),/Shader failed/);
});
test('construction improvement accepts only fewer concrete errors and restores a worse candidate',async()=>{
 for(const improves of [true,false]){
 let current='original';const result=await repairAssembly({code:current,inspect:()=>({errors:current==='better'&&improves?[]:['missing part'],warnings:[]}),rebuild:async()=> 'better',render:async code=>{current=code;}});
 assert.equal(current,improves?'better':'original');assert.equal(result.code,current);
 }
});

test('actual local Qwen lantern plan keeps contradictory emitter containment advisory',()=>{
 const raw=readFileSync(new URL('./fixtures/gen3d/qwen-lantern-assembly.json',import.meta.url),'utf8');
 const captured=parseAssemblyPlan(raw);
 assert.equal(captured.parts.length,9);
 assert.match(assemblyPlanObservations(captured).join(' '),/emitter.*glass_panel_front/);
 assert.match(assemblyInstructions(captured),/not inside a thin glass pane/);
});

test('invalid rebuild syntax is repaired before the candidate reaches the renderer',async()=>{
 const rendered=[];let current='original';
 const result=await repairAssembly({code:current,inspect:()=>({errors:current==='fixed'?[]:['missing glazing'],warnings:[]}),rebuild:async()=> 'invalid',validate:code=>{if(code==='invalid')throw Error('Unexpected token');},repairSyntax:async()=> 'fixed',render:async code=>{rendered.push(code);current=code;}});
 assert.deepEqual(rendered,['fixed']);assert.equal(result.code,'fixed');
});

test('framed glazing maintains clearance from every rail',()=>{
 const radius=.14,height=.46,rail=.018,clearance=.003;
 const chamber=framedPanels({radius,height,rail,clearance,glassMaterial:new THREE.MeshPhysicalMaterial({transmission:.9}),frameMaterial:new THREE.MeshStandardMaterial()});
 for(const panel of chamber.getObjectByName('glazing').children){
  assert.ok(panel.geometry.parameters.width/2 < radius*Math.tan(Math.PI/6)-rail);
  assert.ok(panel.geometry.parameters.height/2 < height/2-rail);
  assert.equal(panel.castShadow,false);
 }
});
test('unrepairable syntax never replaces or replays the current scene',async()=>{
 let renders=0;const result=await repairAssembly({code:'old',inspect:()=>({errors:['blocked emitter'],warnings:[]}),rebuild:async()=> 'invalid',validate:()=>{throw Error('syntax');},repairSyntax:async()=> 'still invalid',render:async()=>{renders++;}});
 assert.equal(renders,0);assert.equal(result.code,'old');assert.match(result.report.warnings[0],/syntax/);
});
