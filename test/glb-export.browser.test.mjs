import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('history GLB export round-trips materials and instances without replacing the visible scene', {skip:!url,timeout:120000}, async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><body><div id="app" style="height:800px"></div></body></html>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());
   const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime);
   const {default:Viewer}=await import('/src/components/ThreeViewer.vue');
   window.viewer=createApp(Viewer,{enablePhysics:false,presentation:'studio'}).mount('#app');
  });
  await page.waitForFunction(()=>window.viewer.isReady);
  const result=await page.evaluate(async()=>{
   const {exportCodeGLB}=await import('/src/components/gen3d/glbExport.js');
   const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
   const {normalizeLLMCode}=await import('/src/components/Generative3D.vue');
   const visible=await window.viewer.applyModuleCode(normalizeLLMCode('root.add(new THREE.Mesh(new THREE.SphereGeometry(.4),MAT.clay));'));
   const code=normalizeLLMCode(`const m=new THREE.MeshPhysicalMaterial({color:0xcc2233,metalness:.8,roughness:.3});
     const i=new THREE.InstancedMesh(new THREE.BoxGeometry(.2,.3,.4),m,3);
     for(let n=0;n<3;n++) i.setMatrixAt(n,new THREE.Matrix4().makeTranslation(n*.3,.2,0)); root.add(i);`);
   const bytes=await exportCodeGLB(code);
   const reopened=await new GLTFLoader().parseAsync(bytes.buffer,'');
   let instances=0, metalness=0;
   reopened.scene.traverse(n=>{if(n.isMesh){instances+=n.isInstancedMesh?n.count:1;metalness=n.material.metalness;}});
   let rejected=false;try{await exportCodeGLB('export default function(){throw new Error("Broken history")}');}catch{rejected=true;}
   return {instances,metalness,rejected,unchanged:visible.parent===window.viewer.scene,
     hiddenHosts:document.querySelectorAll('[aria-hidden="true"][style*="-10000px"]').length,bytes:bytes.length};
  });
  assert.equal(result.instances,3); assert.equal(result.metalness,.8);
  assert.equal(result.unchanged,true);assert.equal(result.rejected,true);assert.equal(result.hiddenHosts,0);assert.ok(result.bytes>100);
 }finally{await browser.close();}
});

test('reported gimbal errors recover through the production renderer', {skip:!url,timeout:120000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:800}});
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><body><div id="app" style="height:800px"></div></body></html>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());
   const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime);
   const {default:Viewer}=await import('/src/components/ThreeViewer.vue');
   window.viewer=createApp(Viewer,{enablePhysics:false,presentation:'studio'}).mount('#app');
  });
  await page.waitForFunction(()=>window.viewer.isReady);
  const result=await page.evaluate(async()=>{
   const {renderWithRecovery}=await import('/src/components/gen3d/runtimeRecovery.js');
   const {normalizeLLMCode}=await import('/src/components/Generative3D.vue');
   const code=`const glassMat = new THREE.MeshPhysicalMaterial({color:0xdddddd});
    glassMap = glassMat;
    function rr(){const p=new THREE.Path();p.moveTo(0,0);p.lineTo(.4,0);p.lineTo(.4,.4);p.lineTo(0,.4);p.closePath();return p;}
    root.add(new THREE.Mesh(new THREE.ShapeGeometry(rr()),glassMat));
    root.add(new THREE.Mesh(new THREE.ExtrudeGeometry(rr(),{depth:.1,bevelEnabled:false}),MAT.brass));`;
   const recovered=await renderWithRecovery({code,render:c=>window.viewer.applyModuleCode(normalizeLLMCode(c)),repair:()=>{throw new Error('No model repair expected');}});
   let meshes=0;recovered.result.traverse(n=>{if(n.isMesh)meshes++;});
   return {meshes,failures:recovered.failures};
  });
  assert.equal(result.meshes,2);assert.deepEqual(result.failures,['glassMap is not defined']);
 }finally{await browser.close();}
});
