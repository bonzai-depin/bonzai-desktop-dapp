import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('detached async construction waits for scanned textures, and failures reach recovery without disposed-library rejections',{skip:!url,timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${url}/src/assets/tokens.css`);await page.setContent('<div id="app" style="height:700px"></div>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime),{default:Viewer}=await import('/src/components/ThreeViewer.vue');
   window.viewer=createApp(Viewer,{enablePhysics:false,presentation:'studio'}).mount('#app');
   window.normalize=(await import('/src/components/Generative3D.vue')).normalizeLLMCode;
  });
  await page.waitForFunction(()=>window.viewer.isReady);
  // Delay actual bundled texture delivery, reproducing the empty-root race.
  await page.route('**/materials/**/*.jpg*',async route=>{await new Promise(r=>setTimeout(r,150));await route.continue();});
  const result=await page.evaluate(async()=>{
   const raw=`setObjectInfo({title:'Async construction regression'});(async()=>{const [m,n]=await Promise.all([MAT.scanned('metal'),MAT.scanned('stone')]);const mesh=new THREE.Mesh(new THREE.BoxGeometry(),m);root.add(mesh);})();`;
   const normalized=window.normalize(raw);const root=await window.viewer.applyModuleCode(normalized);
   let meshes=0;root.traverse(n=>{if(n.isMesh)meshes++;});
   // Legacy saved modules bypass normalization; the viewer must also repair them.
   const legacy=normalized.replace('await (async','(async');
   const loaded=await window.viewer.applyModuleCode(legacy);let legacyMeshes=0;loaded.traverse(n=>{if(n.isMesh)legacyMeshes++;});
   let failure='';try{await window.viewer.applyModuleCode(legacy.replace('root.add(mesh);','throw new Error("construction marker");'));}catch(e){failure=e.message;}
   const recovered=await window.viewer.applyModuleCode(normalized);let recoveredMeshes=0;recovered.traverse(n=>{if(n.isMesh)recoveredMeshes++;});
   return {meshes,legacyMeshes,recoveredMeshes,failure,awaited:normalized.includes('await (async')};
  });
  assert.equal(result.awaited,true);assert.equal(result.meshes,1);assert.equal(result.legacyMeshes,1);assert.equal(result.recoveredMeshes,1);assert.equal(result.failure,'construction marker');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
