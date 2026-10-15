import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('level editor selects, moves, places, regenerates, undoes and saves without starting a game',{skip:!url,timeout:180000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html data-theme="default"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/buttons.css"></head><body style="margin:0;background:var(--bz-bg)"><div id="app"></div></body></html>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/Generative3D.vue').then(r=>r.text());const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime);const {default:Component}=await import('/src/components/Generative3D.vue');
   const {createI18nPlugin}=await import('/src/i18n/index.js');
   const {createGameProject,addLevel,addObjectAsset}=await import('/src/components/gen3d/gameProject.js');
   const project=createGameProject({title:'Courtyard'});
   addLevel(project,{title:'Courtyard',code:`
    const ground=new THREE.Mesh(new THREE.BoxGeometry(18,1,18),MAT.stone);ground.name='Ground';ground.position.y=-.5;root.add(ground);
    const platform=new THREE.Mesh(new THREE.BoxGeometry(5,2,5),MAT.stone);platform.name='Platform';platform.position.set(4,1,0);root.add(platform);
    const tower=new THREE.Group();tower.name='Tower';tower.position.set(-4,0,0);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1,1,3,24),MAT.copper);base.position.y=1.5;base.position.z=Math.random();base.name='Tower base';tower.add(base);
    const cap=new THREE.Mesh(new THREE.ConeGeometry(1.4,2,24),MAT.gold);cap.position.y=4;cap.name='Tower roof';tower.add(cap);root.add(tower);
    const trees=new THREE.InstancedMesh(new THREE.ConeGeometry(.6,2,12),MAT.clay,3);trees.name='Trees';for(let i=0;i<3;i++)trees.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i*2,1,-5));root.add(trees);
   `});
   addObjectAsset(project,{title:'Lantern',code:`const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),MAT.gold);mesh.position.y=1;root.add(mesh);`});
   localStorage.setItem('bonzai-game-project',JSON.stringify(project));
   window.saved={};window.chatCalls=[];window.reply='root.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),MAT.gold));';
   window.electronAPI={store:{get:async(k,f)=>window.saved[k]??f,set:async(k,v)=>{window.saved[k]=JSON.parse(JSON.stringify(v));}},checkModel:async()=>true,loadModel:async()=>({success:true}),resetChat:async()=>{},chat:async prompt=>{window.chatCalls.push(prompt);return {text:window.reply};},getSystemInfo:async()=>({})};
   window.app=createApp(Component).use(createI18nPlugin());window.vm=window.app.mount('#app');
  });
  await page.waitForFunction(()=>window.vm.threeViewer?.isReady&&window.vm.threeViewer.scene.getObjectByName('GeneratedObject'),{timeout:60000});
  const previewLayout=await page.evaluate(async()=>{const {normalizeLLMCode}=await import('/src/components/Generative3D.vue');await window.vm.threeViewer.applyModuleCode(normalizeLLMCode(window.vm.activeLevel.code),'replace',{kind:'level'});return window.vm.threeViewer.scene.getObjectByName('Tower base').position.z;});
  await page.getByRole('button',{name:'Build',exact:true}).click();
  await page.waitForFunction(()=>window.vm.editorRevision>0&&!window.vm.editorBusy);
  await page.locator('#level-object-select option').filter({hasText:'Tower base'}).waitFor({state:'attached'});
  assert.equal(await page.evaluate(()=>window.vm.threeViewer.scene.getObjectByName('Tower base').position.z),previewLayout,'opening the editor must preserve the generation preview layout');
  assert.equal(await page.getByRole('button',{name:'Explore',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>!!window.vm.threeViewer._activeEngine?.GAME?.active),false);
  // Click the actual tower in the viewport, then drag its X handle.
  await page.locator('.viewer-wrapper canvas').first().scrollIntoViewIfNeeded();
  const clickPoint=await page.evaluate(()=>{const v=window.vm.threeViewer,r=v.renderer.domElement.getBoundingClientRect(),p=v.scene.getObjectByName('Tower base').position.clone();v.scene.getObjectByName('Tower').localToWorld(p);p.project(v.camera);return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
  await page.mouse.click(clickPoint.x,clickPoint.y);
  await page.waitForFunction(()=>window.vm.levelEditor.getSelection()?.title==='Tower');
  const handle=await page.evaluate(()=>{const v=window.vm.threeViewer,r=v.renderer.domElement.getBoundingClientRect(),helper=v.scene.children.find(n=>n.isTransformControlsRoot),g=helper?.controls;window.testGizmo=g;
   const mesh=g._gizmo.picker.translate.children.find(n=>n.name==='X');mesh.geometry.computeBoundingBox();const p=mesh.geometry.boundingBox.getCenter(mesh.position.clone());mesh.localToWorld(p);p.project(v.camera);return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};});
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+50,handle.y,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.vm.activeLevel.partEdits?.['node:2']?.transform.position.x!==undefined);
  assert.notEqual(await page.evaluate(()=>window.vm.activeLevel.partEdits['node:2'].transform.position.x),-4,'drag handles must change geometry');

  const before=await page.evaluate(()=>({camera:window.vm.threeViewer.camera.position.toArray(),source:window.vm.activeLevel.code}));
  await page.getByRole('spinbutton',{name:'Position X',exact:true}).fill('-3');await page.getByRole('spinbutton',{name:'Position X',exact:true}).press('Tab');
  await page.waitForFunction(()=>!window.vm.editorBusy&&Object.values(window.vm.activeLevel.partEdits||{}).some(edit=>edit.transform.position.x===-3));
  assert.ok((await page.evaluate(()=>window.vm.threeViewer.camera.position.toArray())).every((value,index)=>Math.abs(value-before.camera[index])<.05),'recompilation retains the camera framing');
  assert.equal(await page.evaluate(()=>window.vm.activeLevel.code),before.source);
  // Place a reusable asset on an elevated surface using the actual canvas drop handler.
  const drop=await page.evaluate(()=>{const v=window.vm.threeViewer,r=v.renderer.domElement.getBoundingClientRect(),p=v.scene.getObjectByName('Platform').position.clone();p.y=2;p.project(v.camera);return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,id:window.vm.buildObjectLibrary[0].libraryId};});
  await page.locator('.viewer-wrapper canvas').first().dispatchEvent('drop',{clientX:drop.x,clientY:drop.y,dataTransfer:await page.evaluateHandle(id=>{const dt=new DataTransfer();dt.setData('application/x-bonzai-asset',id);return dt;},drop.id)});
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.vm.activeLevel.placements.length===1);
  assert.ok(Math.abs(await page.evaluate(()=>window.vm.activeLevel.placements[0].position.y)-2)<.001);
  await page.waitForFunction(()=>window.vm.levelEditor?.getSelection()?.target.placementId===window.vm.activeLevel.placements[0].id);
  // A second copy must retain its original asset when the first is regenerated.
  await page.evaluate(()=>window.vm.placeEditorAsset({asset:window.vm.buildObjectLibrary[0],position:{x:0,y:0,z:3}}));
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.vm.activeLevel.placements.length===2);
  await page.locator('#level-object-select').selectOption({label:'Tower'});
  const ids=await page.evaluate(()=>window.vm.activeLevel.placements.map(p=>({id:p.id,objectId:p.objectId})));
  await page.locator('#level-object-select').selectOption(`placement:${ids[0].id}`);
  await page.getByLabel('Regenerate selection',{exact:true}).fill('An ornate brass lantern');
  await page.getByRole('button',{name:'Regenerate selection',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.vm.activeLevel.placements[0].objectId!==window.vm.activeLevel.placements[1].objectId);
  assert.equal(await page.evaluate(()=>window.vm.activeLevel.placements[1].objectId),ids[1].objectId);
  assert.ok((await page.evaluate(()=>window.chatCalls[0])).includes('Replace only this selected level object'));
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.vm.activeLevel.placements[0].objectId===window.vm.activeLevel.placements[1].objectId);
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.vm.activeLevel.placements[0].objectId!==window.vm.activeLevel.placements[1].objectId);
  const validDraft=await page.evaluate(()=>JSON.stringify(window.vm.gameProject));
  await page.evaluate(()=>window.reply='throw new Error("Replacement fixture failed");');
  await page.getByLabel('Regenerate selection',{exact:true}).fill('Invalid replacement test');
  await page.getByRole('button',{name:'Regenerate selection',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.chatCalls.length>=3);
  assert.notEqual(await page.evaluate(()=>window.vm.projectStatus),'Changes saved on this device');
  assert.equal(await page.evaluate(()=>JSON.stringify(window.vm.gameProject)),validDraft,'failed generation keeps the prior draft');
  assert.equal(await page.evaluate(()=>!!window.vm.threeViewer.scene.getObjectByName('GeneratedObject')),true);
  // Cancelling a model response must retain the scene and its draft.
  await page.evaluate(()=>{window.electronAPI.chat=()=>new Promise(resolve=>window.resolveChat=resolve);window.electronAPI.abortChatStream=async()=>window.resolveChat({text:'root.add(new THREE.Mesh(new THREE.BoxGeometry(),MAT.gold));'});});
  await page.getByLabel('Regenerate selection',{exact:true}).fill('Cancellation test');
  await page.getByRole('button',{name:'Regenerate selection',exact:true}).click();
  await page.waitForFunction(()=>!!window.resolveChat);
  await page.getByRole('button',{name:'Cancel generation',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.editorBusy);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.vm.gameProject)),validDraft);
  await page.evaluate(()=>window.electronAPI.chat=async()=>({text:'root.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),MAT.gold));'}));
  await page.locator('#level-object-select').selectOption({label:'Tower'});
  await page.getByLabel('Regenerate selection',{exact:true}).fill('Brass watchtower');
  await page.getByRole('button',{name:'Regenerate selection',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.editorBusy&&!!window.vm.activeLevel.partEdits['node:2'].replacement);
  assert.equal(await page.evaluate(()=>window.vm.threeViewer.scene.getObjectByName('Platform').position.y),1);
  // Individual instances remain independently selectable after a transform.
  await page.locator('#level-object-select').selectOption({label:'Trees'});
  await page.locator('.level-editor__instance input').fill('2');await page.locator('.level-editor__instance input').press('Tab');
  await page.getByRole('spinbutton',{name:'Position Z',exact:true}).fill('-6');await page.getByRole('spinbutton',{name:'Position Z',exact:true}).press('Tab');
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.vm.activeLevel.partEdits['node:3@1']?.transform.position.z===-6);
  assert.equal(await page.locator('.level-editor__instance input').getAttribute('max'),'3');
  await page.getByRole('button',{name:'Save level',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.editorBusy&&window.vm.objectInferences.some(item=>item.levelProject));
  assert.equal(await page.evaluate(()=>window.vm.objectInferences.at(-1).levelProject.level.placements.length),2);
  assert.equal(await page.evaluate(()=>window.saved.unifiedObjectInferences.at(-1).levelProject.level.placements.length),2,'the snapshot must reach durable storage');
  const exportResult=await page.evaluate(async()=>{const {exportObjectGLB}=await import('/src/components/gen3d/glbExport.js');const bytes=await exportObjectGLB(window.vm.threeViewer.scene.getObjectByName('GeneratedObject'));return bytes.length;});assert.ok(exportResult>1000);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('bonzai-game-project')).levels[0].placements.length),2);
  for(const theme of ['default','light']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   for(const width of [1440,480]){
    await page.setViewportSize({width,height:1100});
    await page.locator('.level-editor').screenshot({path:`/tmp/bonzai-level-editor-${theme}-${width}.png`});
    if(width===1440)await page.locator('.viewer-container').screenshot({path:`/tmp/bonzai-level-editor-scene-${theme}.png`});
    assert.equal(await page.locator('.level-editor').evaluate(el=>el.scrollWidth>el.clientWidth+1),false, JSON.stringify(await page.locator('.level-editor').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,children:[...el.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>el.getBoundingClientRect().right).map(n=>({cls:n.className,width:n.clientWidth,text:n.textContent.slice(0,40)}))}))));
   }
  }
  // Reload the component from the stored project and history, without reseeding.
  await page.evaluate(async()=>{window.app.unmount();const source=await fetch('/src/components/Generative3D.vue').then(r=>r.text());const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];const {createApp}=await import(runtime);const {default:Component}=await import('/src/components/Generative3D.vue');const {createI18nPlugin}=await import('/src/i18n/index.js');window.app=createApp(Component).use(createI18nPlugin());window.vm=window.app.mount('#app');});
  await page.waitForFunction(()=>window.vm.threeViewer?.scene?.getObjectByName('GeneratedObject'));
  await page.getByRole('button',{name:'Build',exact:true}).click();
  await page.waitForFunction(()=>window.vm.editorRevision>0&&!window.vm.editorBusy);
  assert.equal(await page.evaluate(()=>window.vm.activeLevel.placements.length),2);
  assert.equal(await page.evaluate(()=>window.vm.activeLevel.partEdits['node:3@1'].transform.position.z),-6);
  assert.equal(await page.evaluate(()=>!!window.vm.threeViewer.scene.getObjectByName('Brass watchtower')),true);
  assert.equal(await page.evaluate(()=>window.vm.objectInferences.at(-1).levelProject.level.placements.length),2);
  await page.evaluate(async()=>{const {addClearCondition}=await import('/src/components/gen3d/gameProject.js');const level=window.vm.activeLevel;level.placements[0].role='player';addClearCondition(window.vm.gameProject,level.id,{type:'reach',label:'Reach lantern',targetPlacementId:level.placements[1].id});});
  await page.getByRole('button',{name:'Playtest',exact:true}).click();
  await page.waitForFunction(()=>window.vm.isPlaytesting);
  assert.equal(await page.evaluate(()=>!!window.vm.threeViewer._activeEngine.GAME.active),true);
  assert.equal(await page.evaluate(()=>!!window.vm.threeViewer.scene.getObjectByName('Brass watchtower')),true);
  await page.locator('.playtest-bar').getByRole('button',{name:'Edit',exact:true}).click();
  await page.waitForFunction(()=>!window.vm.editorBusy&&!window.vm.isPlaytesting);
  assert.equal(await page.evaluate(()=>!!window.vm.threeViewer._activeEngine.GAME.active),false);
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.app.unmount());
 }finally{await browser.close();}
});
