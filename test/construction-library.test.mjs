import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {constructionHelpers as H} from '../src/components/gen3d/constructionHelpers.js';
import {assemble,ASSEMBLY_HELPERS} from '../src/components/gen3d/parametricAssembly.js';
import {CONSTRUCTION_CATALOGUE,auditExampleConstruction,constructionHelperContext} from '../src/components/gen3d/constructionCatalogue.js';
import {EXAMPLE_LIBRARY} from '../src/components/gen3d/exampleLibrary.js';
import {inspectScene} from '../src/components/gen3d/sceneInspection.js';
const material=new THREE.MeshStandardMaterial({side:THREE.DoubleSide});
const options=id=>({material,frameMaterial:material,glassMaterial:material,...({
 pipeRun:{points:[[0,0,0],[0,1,0],[1,2,0]]},taperedBranch:{points:[[0,0,0],[0,1,0],[.5,2,0]],radii:[.2,.12,.05]},
 loftBody:{rings:[[0,.2,.3],[.5,.4,.3],[1,.2,.2]]},seatedProp:{object:new THREE.Mesh(new THREE.BoxGeometry(),material)},
}[id]||{})});
const bounds=o=>{o.updateMatrixWorld(true);return new THREE.Box3().setFromObject(o);};
const hits=(o,origin,direction)=>{o.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObject(o,true);};
for(const id of Object.keys(H))test(`${id}: finite exportable geometry across size variations`,()=>{
 for(const scale of [.05,1,30]){
  const o=H[id](options(id));o.scale.setScalar(scale);o.updateMatrixWorld(true);
  const report=inspectScene(o);assert.deepEqual(report.errors,[],JSON.stringify(report));assert.ok(report.meshes>0);assert.ok(!bounds(o).isEmpty());
  o.traverse(n=>{if(n.geometry){for(const a of Object.values(n.geometry.attributes))assert.ok(Array.from(a.array).every(Number.isFinite),`${id} ${a.name}`);n.geometry.dispose();}});
 }
});
test('openings are real holes, with closed vessel floors and clear gear bores',()=>{
 assert.equal(hits(H.hollowTube({material}),[0,2,0],[0,-1,0]).length,0);
 const vessel=H.openVessel({material});const hit=hits(vessel,[0,2,0],[0,-1,0])[0];assert.ok(Math.abs(hit.point.y-.035)<1e-5);
 const wall=H.wallOpening({material});assert.equal(hits(wall,[0,1,2],[0,0,-1]).length,0);assert.ok(hits(wall,[.8,1,2],[0,0,-1]).length);
 const arch=H.archedSpan({material});assert.equal(hits(arch,[0,.4,2],[0,0,-1]).length,0);assert.ok(hits(arch,[0,.95,2],[0,0,-1]).length);
 const gear=H.gear({material});assert.equal(hits(gear,[0,0,2],[0,0,-1]).length,0);
});
test('window panes have actual frame clearance and do not shadow the light chamber',()=>{
 const w=H.fittedWindow({frameMaterial:material,glassMaterial:material});const glass=w.getObjectByName('glass');const b=bounds(glass);
 assert.ok(Math.abs(b.min.x+.437)<1e-6);assert.ok(Math.abs(b.min.y-.063)<1e-6);assert.equal(glass.castShadow,false);
 for(const frame of w.children.filter(n=>n!==glass))assert.equal(bounds(frame).intersectsBox(b),false);
});
test('stairs, ramps and wheel axles share consistent contact coordinates',()=>{
 const s=H.stairFlight({material});assert.equal(s.children.length,8);assert.ok(Math.abs(bounds(s).max.y-1.5)<1e-6);assert.ok(Math.abs(bounds(s).max.z-2.4)<1e-6);
 const r=H.ramp({material});const b=bounds(r);assert.ok(Math.abs(b.min.x+.6)<1e-6);assert.ok(Math.abs(b.max.z-3)<1e-6);
 const hit=hits(r,[0,3,1.5],[0,-1,0])[0];assert.ok(Math.abs(hit.point.y-.3)<1e-5);
 assert.ok(Math.abs(bounds(H.wheelAxle({material})).min.y)<1e-6);
});
test('terrain placement uses the same elevation function and refuses transformed parents',()=>{
 const heightAt=(x,z)=>x*.2+z*.1;const object=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),material);
 H.seatedProp({object,x:2,z:1,heightAt});assert.ok(Math.abs(bounds(object).min.y-.5)<1e-6);
 new THREE.Group().add(object);assert.throws(()=>H.seatedProp({object,heightAt}),/Invalid/);
});
test('loft side faces point outward and light sources illuminate rather than merely glow',()=>{
 const o=H.loftBody({rings:[[0,1,1],[1,1,1]],material});const p=o.geometry.attributes.position,index=o.geometry.index;
 const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(0)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(2));
 const normal=b.clone().sub(a).cross(c.clone().sub(a));assert.ok(normal.dot(new THREE.Vector3(a.x,0,a.z))>0);
 const lamp=H.lightSource();assert.ok(lamp.getObjectByName('local_light').isPointLight);assert.ok(lamp.getObjectByName('emitter').material.emissiveIntensity>0);
});
test('invalid dimensions and unbounded work are rejected',()=>{
 for(const [id,args] of [['hollowTube',{wall:1}],['hollowTube',{segments:1}],['archedSpan',{segments:1}],['fittedWindow',{rail:1}],['stairFlight',{steps:1e8}],['gear',{teeth:2}],['spring',{wire:1}],['boltCircle',{count:100,boltRadius:.1}],['terrainPatch',{heightAt:()=>NaN}],['clothPanel',{drape:()=>Infinity}],['pipeRun',{points:[[0,0,0],[0,0,0]]}],['loftBody',{rings:[[1,1,1],[0,1,1]]}]])assert.throws(()=>H[id]({...options(id),...args}),id);
});
test('declarative assemblies validate hierarchy and preserve named editable parts',()=>{
 const parts=[{id:'pane',parent:'frame',helper:'hingedPanel',options:{material:'metal'},position:[1,0,0]},{id:'frame',helper:'supportFrame',options:{material:'metal'}}];
 const root=assemble({parts,materials:{metal:material}});assert.equal(root.getObjectByName('pane').parent.name,'frame');assert.deepEqual(root.userData.constructionRecipe.parts,parts);assert.deepEqual(inspectScene(root).errors,[]);
 const bad=[ [{id:'a',helper:'eval'}], [{id:'a',helper:'supportFrame',options:{material:'missing'}}], [{id:'a',helper:'supportFrame',options:{code:'alert(1)'}}], [{id:'a',helper:'supportFrame',parent:'b'},{id:'b',helper:'supportFrame',parent:'a'}], [{id:'a',helper:'terrainPatch',options:{heightAt:()=>0}}], [{id:'a',helper:'supportFrame',position:[NaN,0,0]}], [{id:'a',helper:'supportFrame',position:null}], [{id:'a',helper:'supportFrame',scale:[1,1,1]}] ];
 for(const parts of bad)assert.throws(()=>assemble({parts}));
 assert.ok(ASSEMBLY_HELPERS.length>=28);
});
test('every example routes to real helpers without pretending its generated output is validated',()=>{
 assert.deepEqual(CONSTRUCTION_CATALOGUE.map(e=>e.id).sort(),Object.keys(H).sort());
 const rows=auditExampleConstruction(EXAMPLE_LIBRARY);assert.ok(rows.length>=296);
 for(const row of rows){assert.ok(row.helpers.length,row.id);for(const id of row.helpers)assert.equal(typeof H[id],'function');assert.equal(row.validation,'requires-generated-output-review');}
 const context=constructionHelperContext('Emergency lantern with glass panels and an LED');assert.match(context,/H.lightSource/);assert.match(context,/H.assemble/);assert.ok(context.length<6500);
});
test('varying shared construction dimensions preserves clearances across hundreds of parameter sets',()=>{
 for(let i=1;i<=40;i++){
  const s=.1+i*.17,materialOptions={material};
  const objects=[H.fittedWindow({width:s,height:s*1.5,depth:s*.08,rail:s*.05,clearance:s*.003,glassThickness:s*.01,frameMaterial:material,glassMaterial:material}),
   H.openVessel({radius:s,height:s*2,wall:s*.08,base:s*.1,...materialOptions}),H.wheelAxle({track:s*4,radius:s,width:s*.3,...materialOptions}),
   H.stairFlight({width:s,rise:s*1.5,run:s*2,steps:2+i%20,...materialOptions}),H.archedSpan({width:s*2,rise:s,depth:s*.3,thickness:s*.1,segments:4+i%20,...materialOptions})];
  for(const object of objects){assert.deepEqual(inspectScene(object).errors,[]);object.traverse(n=>n.geometry?.dispose());}
 }
});
test('assembly placement preserves intrinsic helper axes instead of overwriting wheel orientation',()=>{
 const root=assemble({materials:{m:material},parts:[{id:'wheel_part',helper:'wheel',options:{material:'m'},rotation:[0,0,0]}]});
 const b=bounds(root),size=b.getSize(new THREE.Vector3());assert.ok(size.x<size.y/2,'wheel axle must remain along X');
});
test('recipe part IDs cannot collide with helper internals during construction inspection',()=>{
 const root=assemble({materials:{m:material},parts:[{id:'wheel',helper:'wheel',options:{material:'m'}},{id:'glass',helper:'fittedWindow',options:{frameMaterial:'m',glassMaterial:'m'}}]});
 const names=[];root.traverse(n=>names.push(n.name));assert.equal(names.filter(n=>n==='wheel').length,1);assert.equal(names.filter(n=>n==='glass').length,1);assert.equal(new Set(names).size,names.length);
});
test('failed recipes release internally created materials without disposing caller materials',()=>{
 const original=THREE.Material.prototype.dispose;let owned=0,caller=0;
 THREE.Material.prototype.dispose=function(){if(this===material)caller++;else owned++;return original.call(this);};
 try{assert.throws(()=>assemble({materials:{m:material},parts:[{id:'lamp',helper:'lightSource'},{id:'frame',helper:'supportFrame',options:{material:'m',beam:10}}]}));assert.equal(owned,1);assert.equal(caller,0);}
 finally{THREE.Material.prototype.dispose=original;}
});
