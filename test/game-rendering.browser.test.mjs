import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
// Real renderer, keyboard and update loop; authored fixture isolates gameplay
// regressions from model quality. It is not a generated-game quality score.
test('rendered games support collision, gated collection, defeat and a second playthrough',{skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  await page.goto(url+'/src/assets/tokens.css');
  await page.setContent('<html><body><div id="app" style="height:760px"></div></body></html>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());
   const path=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(path),{default:Viewer}=await import('/src/components/ThreeViewer.vue');
   window.normalize=(await import('/src/components/Generative3D.vue')).normalizeLLMCode;
   window.viewer=createApp(Viewer,{enablePhysics:false,inferencePending:true}).mount('#app');
  });
  await page.waitForFunction(()=>window.viewer.isReady);
  await page.evaluate(async()=>{
   const code=`setObjectInfo({title:'Keyboard garden'});
   const stone=new THREE.MeshStandardMaterial({color:0x778877});
   const floor=new THREE.Mesh(new THREE.BoxGeometry(12,.2,12),stone);floor.position.y=-.1;root.add(floor);
   const player=new THREE.Mesh(new THREE.BoxGeometry(.4,.8,.4),MAT.copper.clone());player.position.set(0,.4,2);root.add(player);
   const wall=new THREE.Mesh(new THREE.BoxGeometry(3,2,.2),stone);wall.position.y=1;root.add(wall);
   const game=GAME.create({title:'Keyboard garden',objectives:[{id:'bells',type:'collect',tag:'bell',target:3,label:'Collect three bells'},{id:'exit',type:'custom',event:'unlocked-exit',label:'Return to the gate'}]});
   game.player(player,{speed:4,camera:false});game.solid('wall',wall);
   for(const [i,x] of [0,1,2].entries()){
    const bell=new THREE.Mesh(new THREE.SphereGeometry(.15,12,8),MAT.copper.clone());bell.position.set(x,.4,-2);root.add(bell);
    game.actor('bell'+i,bell,{tags:['bell']});game.trigger('pickup'+i,bell,{radius:.3,onEnter:g=>g.collect('bell'+i,1,'bell')});
   }
   const gate=new THREE.Mesh(new THREE.BoxGeometry(.3,1,.3),MAT.wood||stone);gate.position.set(2,.5,2);root.add(gate);
   game.trigger('gate',gate,{radius:.4,once:false,onEnter:g=>{if(g.objectives.find(o=>o.id==='bells').complete)g.emit('unlocked-exit');}});
   game.actor('hazard',floor,{update:()=>{if(player.position.x<-3)game.damage('player',100);}});
   game.start();`;
   await window.viewer.applyModuleCode(window.normalize(code),'replace',{kind:'game'});
   window.game=window.viewer._activeEngine.GAME.active;
  });
  const move=async(key,predicate)=>{
   await page.keyboard.down(key);
   try{await page.waitForFunction(predicate,undefined,{timeout:10000});}finally{await page.keyboard.up(key);}
  };
  await page.keyboard.down('w');await page.waitForTimeout(900);await page.keyboard.up('w');
  assert.ok(await page.evaluate(()=>game.actors.get('player').object.position.z>=.29),'a wall must stop forward movement');
  await move('d',()=>game.actors.get('player').object.position.x>2);
  await move('s',()=>game.actors.get('player').object.position.z>2);
  assert.equal(await page.evaluate(()=>game.phase),'running','visiting the gate early must not win or consume it');
  await move('w',()=>game.actors.get('player').object.position.z<-2);
  await move('a',()=>game.objectives.find(o=>o.id==='bells').complete);
  assert.equal(await page.evaluate(()=>game.phase),'running','collecting the bells still requires returning to the gate');
  await move('d',()=>game.actors.get('player').object.position.x>2);
  await move('s',()=>game.phase==='won');
  await page.evaluate(()=>game.restart());
  assert.deepEqual(await page.evaluate(()=>[game.phase,...[0,1,2].map(i=>game.actors.get('bell'+i).object.visible)]),['running',true,true,true]);
  await move('a',()=>game.phase==='lost');
  await page.evaluate(()=>game.restart());
  assert.equal(await page.evaluate(()=>game.phase),'running');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
