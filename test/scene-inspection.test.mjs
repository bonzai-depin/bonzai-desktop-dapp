import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { inspectScene, qualityViews } from '../src/components/gen3d/sceneInspection.js';
import { latheProfile, bevelPanel, worldUV } from '../src/components/gen3d/productionGeometry.js';

test('production profiles and open panels create real geometry, and reject invalid measurements',()=>{
  const profile=latheProfile([[.2,0],[.3,.4],[.25,.4],[.15,.05],[.2,0]]);
  assert.ok(profile.attributes.position.count>100);
  const panel=bevelPanel([[-1,-1],[1,-1],[1,1],[-1,1]],{depth:.2,holes:[[[-.5,-.5],[-.5,.5],[.5,.5],[.5,-.5]]]});
  const mesh=new THREE.Mesh(panel,new THREE.MeshStandardMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
  const ray=new THREE.Raycaster(new THREE.Vector3(0,0,2),new THREE.Vector3(0,0,-1));
  assert.equal(ray.intersectObject(mesh).length,0,'window must be a hole through the entire panel');
  ray.ray.origin.x=.8;assert.ok(ray.intersectObject(mesh).length>0);
  assert.throws(()=>latheProfile([[NaN,0],[1,0],[1,1]]));
  assert.throws(()=>bevelPanel([[0,0],[1,0],[1,1]],{depth:-1}));
});
test('baked UVs preserve physical texture size instead of stretching across large geometry',()=>{
  const input=new THREE.BoxGeometry(8,2,4),geometry=worldUV(input,2);
  assert.notEqual(input,geometry);
  const uv=geometry.attributes.uv;
  let max=0;for(let i=0;i<uv.count;i++)max=Math.max(max,Math.abs(uv.getX(i)),Math.abs(uv.getY(i)));
  assert.equal(max,2);assert.equal(input.index.count,36);
});
test('native Three.js profile points work without hiding invalid radial construction',()=>{
  const pairs=[[0,0],[.28,0],[.28,.25],[0,.25]];
  const vectors=pairs.map(p=>new THREE.Vector2(...p));
  assert.deepEqual(latheProfile(vectors).attributes.position.array,latheProfile(pairs).attributes.position.array);
  assert.deepEqual(vectors.map(p=>p.toArray()),pairs,'helpers must not mutate caller-owned points');
  assert.deepEqual(bevelPanel(vectors).attributes.position.array,bevelPanel(pairs).attributes.position.array);
  assert.throws(()=>latheProfile([new THREE.Vector2(-.2,0),...vectors]),/radial|cross-sections/);
  assert.throws(()=>latheProfile([new THREE.Vector2(Infinity,0),...vectors]),/finite/);
  assert.throws(()=>latheProfile([{x:0,y:0},...vectors]),/Vector2/);
  assert.throws(()=>latheProfile(pairs,NaN),/segments must be finite/);
  assert.equal(latheProfile(pairs,6).parameters.segments,6,'a hexagonal fitting must retain six faces');
  assert.equal(latheProfile(pairs,10000).parameters.segments,128,'subdivisions remain bounded');
});
test('a successfully compiled but corrupt mesh cannot masquerade as valid construction',()=>{
  const root=new THREE.Group();
  const geometry=new THREE.BoxGeometry();geometry.attributes.position.setX(0,NaN);
  root.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));
  assert.match(inspectScene(root).errors.join(' '),/non-finite position/);
  geometry.attributes.position.setX(0,.5);
  geometry.setIndex([0,1,10000]);
  assert.match(inspectScene(root).errors.join(' '),/outside vertex/);
});
test('minimal styling remains valid and hidden atmospheric geometry does not inflate inspection',()=>{
  const root=new THREE.Group(),hidden=new THREE.Group();hidden.visible=false;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));
  hidden.add(new THREE.Mesh(new THREE.SphereGeometry(),new THREE.MeshStandardMaterial()));root.add(hidden);
  const report=inspectScene(root);
  assert.equal(report.meshes,1);assert.deepEqual(report.errors,[]);assert.deepEqual(report.warnings,[]);
});
test('inspection cameras expose reverse construction and a close-up, including individual instances',()=>{
  const root=new THREE.Group();root.userData.worldScale=true;
  const floor=new THREE.Mesh(new THREE.BoxGeometry(30,.3,30),new THREE.MeshStandardMaterial());root.add(floor);
  const columns=new THREE.InstancedMesh(new THREE.CylinderGeometry(.5,.5,4),new THREE.MeshStandardMaterial(),3);
  for(let i=0;i<3;i++)columns.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i*6-6,2,0));root.add(columns);
  for(const aspect of [1.6,.55]) {
    const views=qualityViews(root,45,aspect);assert.equal(views.length,3);
    assert.ok(views[0].position.x*views[1].position.x<0);
    assert.ok(views[2].distance<views[0].distance/2,'detail must inspect one module rather than the whole level');
    for(const view of views)assert.ok(view.position.toArray().every(Number.isFinite));
  }
  assert.equal(inspectScene(root).instances,3);
});
