import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('world-scale levels render, frame and explore without capturing form input',{skip:!url,timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0"><input id="prompt" aria-label="Prompt"><div id="app" style="height:720px"></div></body></html>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime);const {default:Viewer}=await import('/src/components/ThreeViewer.vue');
   window.normalize=(await import('/src/components/Generative3D.vue')).normalizeLLMCode;
   window.viewer=createApp(Viewer,{enablePhysics:false}).mount('#app');
  });
  await page.waitForFunction(()=>window.viewer.isReady,{timeout:60000});
  const rendered=await page.evaluate(async()=>{
   const code=`setObjectInfo({title:'Courtyard',description:'A sign reads {{ entrance'});
    const floor=new THREE.Mesh(new THREE.BoxGeometry(80,1,60),new THREE.MeshStandardMaterial({color:0x716f59}));floor.position.y=-.5;root.add(floor);
    const wallGeo=new THREE.BoxGeometry(2,8,2);const stone=new THREE.MeshStandardMaterial({color:0xc8ba9c});
    for(let i=0;i<12;i++){const column=new THREE.Mesh(wallGeo,stone);column.position.set(-30+i*5,4,-20);root.add(column);}
    // unmatched braces in a sign or comment are valid scene data: {{{
   `;
   const root=await window.viewer.applyModuleCode(window.normalize(code),'replace',{kind:'level'});
   window.levelFixture=code;
   return {scale:root.scale.x,level:window.viewer.isLevelScene,near:window.viewer.camera.near,orbit:window.viewer.controls.enabled,world:root.userData.worldScale,ground:window.viewer._sceneObjects.get('ground').visible};
  });
  assert.deepEqual(rendered,{scale:1,level:true,near:.05,orbit:true,world:true,ground:false});
  await page.getByRole('button',{name:'Overview',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.viewer.controls.target.distanceTo(window.viewer._levelBounds.getCenter(window.viewer.controls.target.clone())) < .001),true,'orbital preview must stay centred on the level');
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await page.locator('canvas').first().click({position:{x:400,y:400}});
  const start=await page.evaluate(()=>window.viewer.camera.position.toArray());
  await page.keyboard.down('w');await page.waitForFunction(([x,y,z])=>window.viewer.camera.position.distanceTo({x,y,z})>.2,start);await page.keyboard.up('w');
  const savedView=await page.evaluate(()=>{const v=window.viewer,before=v.camera.position.clone();v.captureSnapshot('Level overview',{quality:'history'});return before.equals(v.camera.position);});assert.equal(savedView,true,'snapshot must not move the exploration camera');
  const end=await page.evaluate(()=>window.viewer.camera.position.toArray());assert.notDeepEqual(end,start);
  await page.getByLabel('Prompt',{exact:true}).fill('wasd');
  const formCheck=await page.evaluate(()=>{const v=window.viewer,before=v.camera.position.clone();window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true}));v._levelNavigation.update(.05);window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));return before.equals(v.camera.position);});assert.equal(formCheck,true);
  await page.getByRole('button',{name:'Orbit',exact:true}).click();assert.equal(await page.evaluate(()=>window.viewer.controls.enabled),true);
  await page.getByRole('button',{name:'Explore',exact:true}).click();assert.equal(await page.evaluate(()=>window.viewer.controls.enabled),false);
  for(const width of [1280,480]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.screenshot({path:'/tmp/bonzai-level-controls.png'});
  const object=await page.evaluate(async()=>{await window.viewer.applyModuleCode(window.normalize('root.add(new THREE.Mesh(new THREE.BoxGeometry(),MAT.clay));'));return {level:window.viewer.isLevelScene,orbit:window.viewer.controls.enabled};});assert.deepEqual(object,{level:false,orbit:true});
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
