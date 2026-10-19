import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGameRuntime } from '../src/components/gen3d/gameRuntime.js';

function harness(spec) {
  let update;
  const events = new EventTarget();
  const runtime = createGameRuntime({ THREE, eventTarget: events, addUpdateCallback: fn => { update = fn; } });
  const game = runtime.create(spec);
  const key = (type, code, target) => {
    const event = new Event(type);
    Object.defineProperty(event, 'code', { value: code });
    if (target) Object.defineProperty(event, 'target', { value: target });
    events.dispatchEvent(event);
  };
  return { game, runtime, key, events, tick: () => update({ deltaTime: .05, time: 1 }) };
}

test('restarting a completed game restores collection, one-shot triggers, state and starting level', () => {
  const { game, tick } = harness({ title: 'Replay', state: { inventory: [] }, objectives: [{id:'exit',label:'Reach exit',type:'reach',trigger:'exit'}] });
  game.player(new THREE.Group(), {camera:false});
  const first = new THREE.Group(), second = new THREE.Group();
  game.level('first', first); game.level('second', second);
  const coin = new THREE.Group(), hidden = new THREE.Group();hidden.visible=false;
  game.actor('coin', coin);game.actor('hidden',hidden);
  game.trigger('exit', new THREE.Group(), {radius:1});game.start();
  assert.equal(game.activeLevelId,'first');
  game.collect('coin');game.state.inventory.push('coin');game.state.temporary=true;
  tick();assert.equal(game.phase,'won');
  game.goToLevel('second');game.restart();
  assert.equal(game.phase,'running');assert.equal(game.activeLevelId,'first');
  assert.equal(first.visible,true);assert.equal(second.visible,false);
  assert.deepEqual(game.state.inventory,[]);assert.equal(game.state.temporary,undefined);
  assert.equal(hidden.visible,false);assert.equal(game.collect('coin'),true);
  tick();assert.equal(game.phase,'won','one-shot exit must work on the second playthrough');
});

test('typing and focus loss do not leave the player walking through the scene', () => {
  const {game,key,events,tick,runtime}=harness({title:'Input'});
  const player=new THREE.Group();game.player(player,{camera:false,speed:4});game.start();
  key('keydown','KeyW',{closest:()=>({})});tick();assert.equal(player.position.z,0);
  key('keydown','KeyW');tick();assert.ok(player.position.z<0);
  events.dispatchEvent(new Event('blur'));const stopped=player.position.z;tick();assert.equal(player.position.z,stopped);
  runtime.dispose();key('keydown','KeyW');tick();assert.equal(player.position.z,stopped);
});

test('default controller respects registered solids and zero-speed players', () => {
  const {game,key,tick}=harness({title:'Wall'});
  const player=new THREE.Group();game.player(player,{camera:false,speed:100});
  const wall=new THREE.Mesh(new THREE.BoxGeometry(10,3,.02),new THREE.MeshStandardMaterial());wall.position.set(0,1,-1);
  game.solid('wall',wall);game.start();key('keydown','KeyW');tick();
  assert.ok(player.position.z>-.7,'swept movement must stop before the wall even on a large step');
  game.actors.get('player').speed=0;const stopped=player.position.z;tick();assert.equal(player.position.z,stopped);
});

test('rendered game acceptance checks actual player, objectives and startup, not source keywords', async()=>{
 const {inspectGameSession,validateGameSpec}=await import('../src/components/gen3d/gameRuntime.js');
 assert.equal(validateGameSpec({title:'Bad',objectives:'invalid'}).ok,false);
 const {game,tick}=harness({title:'Acceptance',objectives:[{id:'goal',type:'score',label:'Score',target:1}]});
 const root=new THREE.Group();game.start();assert.doesNotThrow(tick,'missing player must produce a useful inspection error, not a frame exception');
 assert.match(inspectGameSession(game,root).errors.join(';'),/player/);
 const player=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
 game.player(player);assert.match(inspectGameSession(game,root).errors.join(';'),/attached/);
 root.add(player);assert.deepEqual(inspectGameSession(game,root).errors,[]);
 const hiddenParent=new THREE.Group();root.add(hiddenParent);hiddenParent.add(player);hiddenParent.visible=false;
 assert.match(inspectGameSession(game,root).errors.join(';'),/visible/);
 root.add(player);
 game.pause();assert.match(inspectGameSession(game,root).errors.join(';'),/running/);
 assert.match(inspectGameSession(null,root).errors.join(';'),/session/);
});

test('restart restores an actor rotation and scale after animation changes',()=>{
 const {game}=harness({title:'Restorable pose'});
 const actor=new THREE.Group();actor.position.set(1,2,3);actor.rotation.set(.1,.2,.3);actor.scale.set(1,2,1);
 const rotation=actor.quaternion.toArray();game.actor('moving-part',actor);game.start();
 actor.position.set(8,8,8);actor.rotation.set(2,2,2);actor.scale.setScalar(.01);
 game.restart();assert.deepEqual(actor.position.toArray(),[1,2,3]);
 assert.deepEqual(actor.quaternion.toArray(),rotation);assert.deepEqual(actor.scale.toArray(),[1,2,1]);
});

test('generated vector arrays and health settings produce a finite camera and a consistent HUD',()=>{
 let update;const camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3()};
 const runtime=createGameRuntime({THREE,camera,controls,eventTarget:new EventTarget(),addUpdateCallback:fn=>{update=fn;}});
 const game=runtime.create({title:'Three hearts',state:{health:3}});
 const player=new THREE.Mesh(new THREE.BoxGeometry());game.player(player,{cameraOffset:[0,12,1]});
 game.start();update({deltaTime:.05,time:1});
 assert.ok(camera.position.toArray().every(Number.isFinite));
 assert.equal(game.actors.get('player').health,3);assert.equal(game.state.maxHealth,3);game.damage('player',1);assert.equal(game.state.health,2);
 game.damage('player',2);assert.equal(game.phase,'lost');game.restart();assert.equal(game.state.health,3);
 game.level('entry',new THREE.Group(),{entry:[1,0,2]});game.goToLevel('entry');
 assert.deepEqual(player.position.toArray(),[1,0,2]);
 assert.throws(()=>game.player(player,{cameraOffset:[0,NaN,1]}),/cameraOffset.*finite/);
});

test('an exit objective without a trigger binding fails before creating an unwinnable game',async()=>{
 const {validateGameSpec}=await import('../src/components/gen3d/gameRuntime.js');
 assert.match(validateGameSpec({title:'Exit',objectives:[{id:'exit',type:'reach'}]}).errors.join(' '),/trigger/);
 assert.match(validateGameSpec({title:'Event',objectives:[{id:'exit',type:'custom'}]}).errors.join(' '),/event/);
 assert.match(validateGameSpec({title:'Count',objectives:[{id:'bells',type:'collect',target:NaN}]}).errors.join(' '),/target/);
});

test('a fatal hit cannot turn into a win from another callback in the same frame',()=>{
 const {game,tick}=harness({title:'Terminal outcome',objectives:[{id:'survive',type:'survive',label:'Survive',target:.05}]});
 game.player(new THREE.Group());
 game.actor('hazard',new THREE.Group(),{update:()=>game.damage('player',100)});
 game.start();tick();assert.equal(game.phase,'lost');
 game.win();assert.equal(game.phase,'lost');
 game.restart();game.win();game.lose();assert.equal(game.phase,'won');
});
