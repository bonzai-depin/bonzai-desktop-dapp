import test from 'node:test';
import assert from 'node:assert/strict';
import { repairAssembly, assemblyInstructions } from '../src/components/gen3d/assemblyContract.js';

const error='pane: glazing contains opaque material';
test('a successful local material correction avoids a complete rebuild', async()=>{
 let code='opaque',builds=0;
 const result=await repairAssembly({code,inspect:()=>({errors:code==='glass'?[]:[error],warnings:[]}),patch:async()=> 'glass',rebuild:async()=>{builds++;return 'new';},render:async value=>{code=value;}});
 assert.equal(result.code,'glass');assert.equal(builds,0);
});
test('a worsening local correction restores the drawable scene before rebuilding',async()=>{
 let code='original';const rendered=[];
 const result=await repairAssembly({code,inspect:()=>({errors:code==='fixed'?[]:[error],warnings:[]}),patch:async()=> 'worse',rebuild:async()=>{assert.equal(code,'original');return 'fixed';},render:async value=>{rendered.push(value);code=value;}});
 assert.deepEqual(rendered,['worse','original','fixed']);assert.equal(result.code,'fixed');
});
test('invalid local edits never execute, and structural defects bypass cosmetic patching',async()=>{
 for(const issue of [error,'emitter: all ten sampled views are blocked']){
  const rendered=[];let patched=0;
  await repairAssembly({code:'original',inspect:()=>({errors:[issue],warnings:[]}),patch:async()=>{patched++;return 'invalid';},validate:()=>{throw Error('syntax');},rebuild:async()=> 'original',render:async value=>rendered.push(value)});
  assert.deepEqual(rendered,[]);assert.equal(patched,issue===error?1:0);
 }
});
test('code prompts can reference the existing plan without repeating its JSON',()=>{
 const plan={parts:[],relations:[],mechanism:'unique-mechanism'};
 assert.match(assemblyInstructions(plan),/unique-mechanism/);
 assert.doesNotMatch(assemblyInstructions(plan,{includePlan:false}),/unique-mechanism/);
 assert.match(assemblyInstructions(plan,{includePlan:false}),/Glass groups contain only glass/);
});

test('a disconnected intended joint can be fixed by a local coordinate edit',async()=>{
 let code='floating';let builds=0;
 const result=await repairAssembly({code,inspect:()=>({errors:code==='joined'?[]:['base / frame: measured joint gap 0.03'],warnings:[]}),
  patch:async()=> 'joined',rebuild:async()=>{builds++;return 'replacement';},render:async value=>{code=value;}});
 assert.equal(result.code,'joined');assert.equal(builds,0);
});

test('closing an envelope gap by sinking the chamber must restore the original drawable asset',async()=>{
 const THREE=await import('three');
 const {inspectAssembly}=await import('../src/components/gen3d/assemblyContract.js');
 const plan={version:1,mechanism:'Supported chamber',parts:[
  {id:'base',role:'Support',surface:'opaque',bounds:[[-.3,0,-.3],[.3,.25,.3]]},
  {id:'chamber',role:'Frame and cap',surface:'opaque',bounds:[[-.3,.25,-.3],[.3,1,.3]]}
 ],relations:[{type:'contact',a:'chamber',b:'base'}]};
 let root,source='original';const rendered=[];
 const render=async code=>{
  source=code;rendered.push(code);root=new THREE.Group();
  const base=new THREE.Mesh(new THREE.BoxGeometry(.6,code==='supported'?.25:.22,.6));base.name='base';base.position.y=code==='supported'?.125:.11;root.add(base);
  const chamber=new THREE.Group();chamber.name='chamber';root.add(chamber);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.02,.7,.6));wall.position.set(.29,code==='sunk'?.22:.6,0);chamber.add(wall);
  const cap=new THREE.Mesh(new THREE.BoxGeometry(.6,.05,.6));cap.position.y=.975;chamber.add(cap);
 };
 await render(source);
 const result=await repairAssembly({code:source,inspect:()=>inspectAssembly(root,plan),patch:async()=> 'sunk',
  rebuild:async()=>{assert.equal(source,'original');return 'supported';},render});
 assert.deepEqual(rendered,['original','sunk','original','supported']);
 assert.equal(result.code,'supported');assert.deepEqual(result.report.errors,[]);
});
