import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGameCollisions } from '../src/components/gen3d/gameCollision.js';
const box=(x,y,z,w=1,h=1,d=1)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d));mesh.position.set(x,y,z);return mesh;};
test('fast movement cannot tunnel through a thin wall and can slide along it',()=>{
  const collision=createGameCollisions(THREE), player=box(0,.5,0);
  collision.add('wall',box(2,1,0,.1,2,10));
  collision.move(player,new THREE.Vector3(20,0,2));
  assert.ok(player.position.x<1.451);assert.ok(player.position.x>1.44);assert.equal(player.position.z,2);
});
test('registered door jambs preserve their opening and floors do not block walking',()=>{
  const collision=createGameCollisions(THREE),player=box(0,.5,0);
  collision.add('left',box(-2,1,-2,2,2,.2));collision.add('right',box(2,1,-2,2,2,.2));
  collision.add('floor',box(0,-.1,0,20,.2,20));
  collision.move(player,new THREE.Vector3(0,0,-5));assert.equal(player.position.z,-5);
});
test('world-space movement respects transformed parents and inactive levels',()=>{
  const collision=createGameCollisions(THREE),parent=new THREE.Group(),player=box(0,.5,0);
  parent.position.set(10,0,0);parent.add(player);
  collision.add('wall',box(12,1,0,.1,2,10),{levelId:'room-two'});
  collision.move(player,new THREE.Vector3(3,0,0),{levelId:'room-one'});assert.equal(player.position.x,3);
  player.position.x=0;
  collision.move(player,new THREE.Vector3(3,0,0),{levelId:'room-two'});assert.ok(player.position.x<1.451);
});
test('hidden solids do not block and invalid geometry is rejected',()=>{
  const collision=createGameCollisions(THREE),wall=box(2,1,0,.1,2,10),player=box(0,.5,0);
  collision.add('wall',wall);wall.visible=false;
  collision.move(player,new THREE.Vector3(4,0,0));assert.equal(player.position.x,4);
  assert.throws(()=>collision.add('empty',new THREE.Group()),/geometry/);
});
