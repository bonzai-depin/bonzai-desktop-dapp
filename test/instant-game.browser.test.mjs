import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;

// The real Generative3D view and WebGL viewer with only the Electron bridge replaced.
// No model is installed in this bridge: every step must work without inference.
async function mount(browser,viewport){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
 await page.goto(`${url}/src/assets/tokens.css`);
 await page.setContent('<html data-theme="default"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/page-layout.css"></head><body><div id="app"></div></body></html>');
 await page.evaluate(async()=>{
  const source=await fetch('/src/components/Generative3D.vue').then(r=>r.text());const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
  const {createApp}=await import(runtime);const {default:Component}=await import('/src/components/Generative3D.vue');const {createI18nPlugin}=await import('/src/i18n/index.js');
  window.saved={};window.chatCalls=0;
  window.electronAPI={store:{get:async(k,f)=>window.saved[k]??f,set:async(k,v)=>{window.saved[k]=JSON.parse(JSON.stringify(v));}},checkModel:async()=>false,loadModel:async()=>({success:false}),resetChat:async()=>{},chat:async()=>{window.chatCalls++;return '';}};
  window.app=createApp(Component).use(createI18nPlugin());window.vm=window.app.mount('#app');
 });
 await page.waitForFunction(()=>window.vm.threeViewer?.isReady&&window.vm.threeViewer.scene.getObjectByName('GeneratedObject'),{timeout:60000});
 return {page,errors};
}
const game=page=>page.evaluate(()=>{const g=window.vm.threeViewer._activeEngine?.GAME?.active;if(!g)return null;const p=g.actors.get('player').object.position;return{phase:g.phase,score:g.state.score,health:g.state.health,solids:g.solids.size,x:p.x,y:p.y,z:p.z,level:g.activeLevelId};});

test('one click builds a playable game without a model, and it can then be edited and extended by hand',{skip:!url,timeout:240000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const {page,errors}=await mount(browser,{width:1440,height:1000});
  await page.getByRole('button',{name:'Game',exact:true}).click();
  // The brief stays editable although the code model is missing.
  await page.locator('textarea').first().fill('a haunted castle dungeon');
  assert.equal(await page.getByRole('button',{name:'Generate game',exact:true}).isDisabled(),true);
  const started=Date.now();
  await page.getByRole('button',{name:'Build and play',exact:true}).click();
  await page.waitForFunction(()=>window.vm.isPlaytesting&&window.vm.threeViewer._activeEngine?.GAME?.active?.phase==='running',{timeout:60000});
  const elapsed=Date.now()-started;
  // Seconds, not the minutes a model-written game takes. Generous for a loaded CI machine.
  assert.ok(elapsed<15000,`click to playable took ${elapsed} ms`);
  assert.equal(await page.evaluate(()=>window.chatCalls),0,'no inference call is made');
  const start=await game(page);
  assert.ok(start.solids>=20);
  assert.equal(await page.evaluate(()=>window.vm.gameProject.instant.blueprint.theme),'dungeon');
  assert.equal(await page.evaluate(()=>['ground','grid'].some(key=>window.vm.threeViewer._sceneObjects.get(key)?.visible)),false,'the display floor must not show through the level');
  assert.ok((await page.locator('.bonzai-game-hud').boundingBox()).y>=(await page.locator('.playtest-bar').boundingBox()).y+(await page.locator('.playtest-bar').boundingBox()).height-1,'the HUD is not covered by the playtest bar');

  // Real keyboard input: walk until a wall stops the player, then jump.
  await page.locator('.viewer-wrapper canvas').first().click({position:{x:500,y:400}});
  await page.keyboard.down('KeyA');await page.waitForTimeout(9000);await page.keyboard.up('KeyA');
  const walked=await game(page);
  assert.ok(walked.x<start.x-1,'the player moved');
  assert.equal(await page.evaluate(()=>{const g=window.vm.threeViewer._activeEngine.GAME.active,p=g.actors.get('player').object.position;return [...g.solids.values()].some(s=>p.x>s.bounds.min.x&&p.x<s.bounds.max.x&&p.z>s.bounds.min.z&&p.z<s.bounds.max.z);}),false,'the player is not inside a wall');
  assert.ok(Math.abs(walked.x)<26,'the player is still inside the map');
  await page.keyboard.press('Space');await page.waitForTimeout(220);
  assert.ok((await game(page)).y>0.4,'Space jumps');

  // Touching every crystal and the portal wins; R replays.
  await page.evaluate(async()=>{const g=window.vm.threeViewer._activeEngine.GAME.active,p=g.actors.get('player').object,level=window.vm.activeLevel,wait=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   for(const item of level.placements.filter(x=>x.role==='collectible')){p.position.set(item.position.x,item.position.y,item.position.z);await wait();}
   const goal=level.placements.find(x=>x.role==='goal');p.position.set(goal.position.x,goal.position.y,goal.position.z);await wait();});
  await page.waitForFunction(()=>window.vm.threeViewer._activeEngine.GAME.active.phase==='won');
  assert.match(await page.locator('.bonzai-game-hud__message').innerText(),/Press R/);
  await page.keyboard.press('KeyR');
  assert.equal((await game(page)).phase,'running');
  assert.equal((await game(page)).score,0);

  // Edit: the same project opens in the level editor with its pieces in the palette.
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.isPlaytesting&&window.vm.editorRevision>0&&!window.vm.editorBusy);
  const before=await page.evaluate(()=>({crystals:window.vm.activeLevel.placements.filter(x=>x.role==='collectible').length,objects:window.vm.gameProject.objects.length}));
  await page.getByRole('button',{name:'Add game pieces',exact:true}).click();
  assert.ok(await page.evaluate(()=>window.vm.gameProject.objects.length)>before.objects);
  assert.equal(await page.getByRole('button',{name:'Add game pieces',exact:true}).count(),0,'pieces are offered once');
  await page.getByRole('button',{name:'Crystal',exact:true}).click();
  const box=await page.locator('.viewer-wrapper canvas').first().boundingBox();
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.waitForFunction(count=>!window.vm.editorBusy&&window.vm.activeLevel.placements.filter(x=>x.role==='collectible').length===count+1,before.crystals);
  // A hand-added rule, with no model call.
  await page.locator('details.build-gameplay summary').first().click();
  await page.getByRole('button',{name:'Survive for 60 seconds',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.vm.activeLevel.clearConditions.at(-1).type),'survive');
  assert.equal(await page.evaluate(()=>window.chatCalls),0);

  // Building again extends the project with a second level instead of replacing it.
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await page.getByRole('button',{name:'Game',exact:true}).click();
  await page.locator('textarea').first().fill('snowy forest');
  await page.getByLabel('Game rules').selectOption({label:'Reach the exit'});
  await page.getByRole('button',{name:'Build and play',exact:true}).click();
  await page.waitForFunction(()=>window.vm.isPlaytesting&&window.vm.gameProject.levels.length===2&&window.vm.threeViewer._activeEngine?.GAME?.active?.phase==='running',{timeout:60000});
  assert.equal(await page.evaluate(()=>window.vm.gameProject.title),'a haunted castle dungeon');
  assert.equal(await page.evaluate(()=>window.vm.gameProject.levels[1].clearConditions.map(c=>c.type).join()),'reach','the chosen rules are used');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('an instant level is built from the brief, saved to history and fits a narrow window',{skip:!url,timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const {page,errors}=await mount(browser,{width:720,height:1000});
  await page.getByRole('button',{name:'Level',exact:true}).click();
  await page.locator('textarea').first().fill('petite forêt enneigée');
  await page.getByRole('button',{name:'Build level',exact:true}).click();
  await page.waitForFunction(()=>window.vm.instantStatus,{timeout:60000});
  const state=await page.evaluate(async()=>{const {inspectScene}=await import('/src/components/gen3d/sceneInspection.js');const v=window.vm.threeViewer,root=v.scene.getObjectByName('GeneratedObject'),report=inspectScene(root);
   return{status:window.vm.instantStatus,isLevel:v.isLevelScene,world:root.children.find(c=>c.userData.world)?.userData.world.blueprint,history:window.vm.objectInferences.map(i=>({kind:i.assetKind,model:i.model,thumb:!!i.thumbnail})),levels:window.vm.gameProject.levels.length,errors:report.errors,warnings:report.warnings,drawCalls:report.drawCalls,textured:report.texturedMeshes,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.match(state.status,/^Level built in \d+\.\d s/);
  assert.equal(state.isLevel,true);
  assert.deepEqual([state.world.theme,state.world.size],['snow','small']);
  assert.deepEqual(state.history,[{kind:'level',model:'instant',thumb:true}]);
  assert.equal(state.levels,1,'the level is available to the Build tab');
  assert.deepEqual([state.errors,state.warnings],[[],[]]);
  assert.ok(state.drawCalls<=24&&state.textured>=4,`${state.drawCalls} draw calls, ${state.textured} textured meshes with the real scanned materials`);
  assert.equal(state.overflow,false);
  assert.equal(await page.getByRole('button',{name:'Edit level',exact:true}).isVisible(),true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
