import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {levelEditingHelpers as H,compileLevelPreview,indexLevelParts,describePart,setLevelPartEdit,readTransform} from '../src/components/gen3d/levelEditing.js';
import {createGameProject,addLevel,addObjectAsset,placeObject,importLevelSnapshot,compileGameProject} from '../src/components/gen3d/gameProject.js';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const fixture=()=>{
 const project=createGameProject();const level=addLevel(project,{title:'Courtyard',code:`
 const floor=new THREE.Mesh(new THREE.BoxGeometry(20,.4,20),new THREE.MeshStandardMaterial());floor.name='Floor';floor.position.y=-.2;root.add(floor);
 for(let i=0;i<3;i++){const tower=new THREE.Group();tower.name='Tower '+i;tower.position.set(i*4,0,Math.random());
 const shaft=new THREE.Mesh(new THREE.BoxGeometry(1,4,1),new THREE.MeshStandardMaterial());shaft.name='Shaft';shaft.position.y=2;tower.add(shaft);root.add(tower);}
 const trees=new THREE.InstancedMesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial(),3);trees.name='Trees';
 for(let i=0;i<3;i++)trees.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i*3,1,-5));root.add(trees);`});
 return {project,level};
};
async function render(project,level){const root=new THREE.Group();await new AsyncFunction('THREE','H','root','addUpdateCallback','setObjectInfo',compileLevelPreview(project,level.id))(THREE,H,root,()=>{},()=>{});root.updateMatrixWorld(true);return root.children[0];}

test('a level edits without a game, object library, player or win condition',async()=>{
 const {project,level}=fixture();assert.doesNotMatch(compileLevelPreview(project,level.id),/GAME.create/);
 const root=await render(project,level);assert.equal(root.children.length,5);
});
test('moving a nested part persists without changing siblings or procedural layout',async()=>{
 const {project,level}=fixture(),before=await render(project,level),selected=describePart(before.children[2].children[0]);
 const transform=selected.transform;transform.position.y=5;setLevelPartEdit(level,{target:selected.target,transform});
 const saved=JSON.parse(JSON.stringify(project)),after=await render(saved,saved.levels[0]);
 assert.equal(after.children[2].children[0].position.y,5);
 for(const index of [1,2,3])assert.deepEqual(after.children[index].position.toArray(),before.children[index].position.toArray());
 assert.equal(after.children[1].children[0].position.y,2);
});
test('regenerating one assembly retains its transform and does not rewrite the level or other copies',async()=>{
 const {project,level}=fixture(),before=await render(project,level),source=level.code,selected=describePart(before.children[2]);
 setLevelPartEdit(level,{target:selected.target,transform:selected.transform,replacement:{title:'New tower',code:'root.add(new THREE.Mesh(new THREE.CylinderGeometry(.5,.8,2),new THREE.MeshStandardMaterial()));'}});
 const root=await render(project,level),replacement=root.getObjectByName('New tower');
 assert.equal(level.code,source);assert.deepEqual(readTransform(replacement),selected.transform);
 assert.equal(root.getObjectByName('Tower 0').children[0].geometry.type,'BoxGeometry');
 assert.equal(replacement.children[0].children[0].geometry.type,'CylinderGeometry');
 assert.equal(new THREE.Box3().setFromObject(replacement).min.y,0);
});
test('two instance edits survive reload without changing the remaining instance or base mesh',async()=>{
 const {project,level}=fixture(),before=await render(project,level),trees=before.getObjectByName('Trees');
 const first=describePart(trees,{...trees.userData.bonzaiPart,instanceId:0});first.transform.position.x=9;
 setLevelPartEdit(level,{target:first.target,transform:first.transform,replacement:{title:'Replacement tree',code:'root.add(new THREE.Mesh(new THREE.ConeGeometry(.4,2),new THREE.MeshStandardMaterial()));'}});
 const second=describePart(trees,{...trees.userData.bonzaiPart,instanceId:1});second.transform.position.z=8;
 setLevelPartEdit(level,{target:second.target,transform:second.transform});
 const root=await render(project,level),result=root.getObjectByName('Trees'),matrix=new THREE.Matrix4();
 result.getMatrixAt(1,matrix);assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),[3,1,8]);
 result.getMatrixAt(2,matrix);assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),[6,1,-5]);
 assert.equal(root.getObjectByName('Replacement tree').position.x,9);
});
test('asset insertion is isolated from scene postprocessing and saved snapshot retains edits',async()=>{
 const {project,level}=fixture(),before=await render(project,level),selection=describePart(before.children[1]);
 selection.transform.position.x=7;setLevelPartEdit(level,{target:selection.target,transform:selection.transform});
 const asset=addObjectAsset(project,{title:'Crate',code:"setAO({radius:200});setObjectInfo({title:'Do not rename level'});const box=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());box.position.x=Math.random();root.add(box);"});
 placeObject(project,level.id,asset.id,{position:{x:4,y:2,z:6}});
 const root=await render(project,level);assert.equal(root.getObjectByName('Crate').position.y,2);
 const restored=createGameProject();const copy=importLevelSnapshot(restored,JSON.parse(JSON.stringify({level,objects:project.objects})));
 const result=await render(restored,copy);
 assert.notEqual(copy.id,level.id);assert.equal(result.getObjectByName('Tower 0').position.x,7);
 assert.equal(result.getObjectByName('Crate').children[0].position.x,root.getObjectByName('Crate').children[0].position.x);
 assert.match(compileGameProject(project),/H.applyLevelPartEdit/);
});
test('structural changes and invalid transforms fail rather than editing another object',async()=>{
 const {project,level}=fixture(),root=await render(project,level),selected=describePart(root.children[1]);
 setLevelPartEdit(level,{target:selected.target,transform:selected.transform});
 level.code=level.code.replace("tower.name='Tower '+i","tower.name='Other '+i");
 await assert.rejects(render(project,level),/structure changed/);
 assert.throws(()=>setLevelPartEdit(level,{target:selected.target,transform:{...selected.transform,scale:{x:NaN,y:1,z:1}}}),/Invalid/);
});
test('invalid saved levels do not partially import assets into the current project',()=>{
 const {project,level}=fixture(),snapshot={level:structuredClone(level),objects:[{id:'ok',code:'root.add(new THREE.Group())'},{id:'broken',code:''}]};
 const before=JSON.stringify(project);
 assert.throws(()=>importLevelSnapshot(project,snapshot),/code is required/);
 assert.equal(JSON.stringify(project),before);
});
test('mirrored objects remain editable without silently reversing their geometry',async()=>{
 const {project,level}=fixture(),root=await render(project,level),selection=describePart(root.children[1]);
 selection.transform.scale.x=-1;setLevelPartEdit(level,{target:selection.target,transform:selection.transform});
 const result=await render(project,level);assert.equal(result.getObjectByName('Tower 0').scale.x,-1);
});
