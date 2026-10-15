import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLevelNavigation} from '../src/components/gen3d/levelNavigation.js';
import {buildScenePrompt,buildSceneRevision,buildSceneRepair,validateSceneBody} from '../src/components/gen3d/generationContract.js';
function key(events,type,code){const e=new Event(type,{cancelable:true});Object.defineProperty(e,'code',{value:code});events.dispatchEvent(e);return e;}
test('world-scale contracts survive generation, repair and refinement',()=>{
 for(const prompt of [buildScenePrompt({mode:'level',brief:'A 100 metre forest trail'}),buildSceneRevision({mode:'level',code:'root.add(terrain);',instruction:'Add trees'}),buildSceneRepair({mode:'level',code:'bad()',error:'bad is not defined'})]) {
  assert.doesNotMatch(prompt,/longest dimension about 1.5/);assert.match(prompt,/world dimensions/);assert.match(prompt,/Do not create a GAME session/);
 }
 assert.match(buildScenePrompt({brief:'Small statue'}),/longest dimension about 1.5/);
 assert.equal(validateSceneBody('const sign = "{{ level entrance"; root.add(new THREE.Group());').ok,true);
 assert.equal(validateSceneBody('for(let i=0;i<20;i++){ root.add(').ok,false);
});
test('exploration input is frame-rate independent, focus-scoped and released on blur/disposal',()=>{
 const events=new EventTarget(),element=new EventTarget(),camera=new THREE.PerspectiveCamera();
 element.ownerDocument={activeElement:null};element.focus=()=>element.ownerDocument.activeElement=element;
 const orbit={enabled:true,autoRotate:true,target:new THREE.Vector3(),update(){}};
 const nav=createLevelNavigation({camera,element,orbit,events});nav.setSpeed(10);nav.setEnabled(true);
 assert.equal(key(events,'keydown','KeyW').defaultPrevented,false);nav.update(.05);assert.equal(camera.position.z,0);
 element.focus();assert.equal(key(events,'keydown','KeyW').defaultPrevented,true);nav.update(.05);assert.equal(camera.position.z,-.5);
 key(events,'keydown','KeyD');const start=camera.position.clone();nav.update(.05);assert.ok(Math.abs(camera.position.distanceTo(start)-.5)<1e-6);
 events.dispatchEvent(new Event('blur'));const stopped=camera.position.clone();nav.update(.05);assert.deepEqual(camera.position,stopped);
 nav.setEnabled(false);assert.equal(orbit.enabled,true);assert.equal(orbit.autoRotate,false);
 nav.dispose();assert.equal(key(events,'keydown','KeyW').defaultPrevented,false);
});
