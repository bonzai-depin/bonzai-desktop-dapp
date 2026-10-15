import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('saved lantern obstruction is detected and open framed glazing transmits a visibly lit emitter',{skip:!url,timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1100,height:850}});
  await page.goto(`${url}/src/assets/tokens.css`);await page.setContent('<div id="app" style="height:800px"></div>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/ThreeViewer.vue').then(r=>r.text());const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime),{default:Viewer}=await import('/src/components/ThreeViewer.vue');
   window.inspectLightPaths=(await import('/src/components/gen3d/assemblyContract.js')).inspectLightPaths;
   window.viewer=createApp(Viewer,{enablePhysics:false,presentation:'studio'}).mount('#app');
  });
  await page.waitForFunction(()=>window.viewer.isReady);
  const old=readFileSync(new URL('./fixtures/gen3d/lantern-occluded.js',import.meta.url),'utf8');
  const fixed=readFileSync(new URL('./fixtures/gen3d/lantern-open-chamber.js',import.meta.url),'utf8');
  const check=async code=>page.evaluate(async code=>{const v=window.viewer;const root=await v.applyModuleCode(code);return window.inspectLightPaths(root,{parts:[{id:'emitter',surface:'emissive',role:'LED light source'}]});},code);
  assert.match((await check(old)).join(' '),/blocked by opaque/);
  assert.deepEqual(await check(fixed),[]);
  const light=await page.evaluate(()=>{
   const v=window.viewer,root=v.scene.getObjectByName('GeneratedObject'),lamp=root.getObjectByName('lantern_light');
   const canvas=document.createElement('canvas');canvas.width=v.renderer.domElement.width;canvas.height=v.renderer.domElement.height;const ctx=canvas.getContext('2d');
   const capture=()=>{v.renderer.render(v.scene,v.camera);ctx.drawImage(v.renderer.domElement,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
   lamp.intensity=0;const off=capture();lamp.intensity=3;const on=capture();let changed=0;
   for(let i=0;i<on.length;i+=4)if(on[i]+on[i+1]+on[i+2]>off[i]+off[i+1]+off[i+2]+8)changed++;
   return {changed};
  });
  assert.ok(light.changed>100,JSON.stringify(light));
  await page.locator('canvas').first().screenshot({path:'/tmp/bonzai-lantern-open-chamber.png'});
 }finally{await browser.close();}
});
