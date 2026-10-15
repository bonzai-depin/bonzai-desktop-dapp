import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('mint preview uses selected bytes, blocks invalid content and fits dark/light narrow layouts',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/src/assets/tokens.css');
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><div id="app"></div>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/MintModal.vue').then(r=>r.text());
   const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const store=await fetch('/src/stores/web3.store.js').then(r=>r.text());
   const piniaPath=store.match(/from ["']([^"']*\/pinia\.js(?:\?[^"']*)?)["']/)[1];
   const {createPinia}=await import(piniaPath);
   const {createApp,reactive,h}=await import(runtime);
   const {default:View}=await import('/src/components/MintModal.vue');
   const canvas=document.createElement('canvas');canvas.width=24;canvas.height=16;canvas.getContext('2d').fillRect(0,0,24,16);
   const state=reactive({visible:true,inferenceType:'image',inferenceId:'selected',content:canvas.toDataURL(),contentType:'image/png',prompt:'Selected artwork',generation:{model:'saved model',license:'MIT',parameters:{seed:0}}});
   window.fixture=state;
   const app=createApp({render:()=>h(View,state)});app.use(createPinia());app.mount('#app');
  });
  await page.waitForFunction(()=>document.querySelector('.preview-image img')?.naturalWidth===24);
  assert.equal(await page.locator('#mint-title').inputValue(),'Selected artwork');
  for(const width of [390,1440])for(const theme of ['dark','light']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.ok(await page.locator('.mint-modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.screenshot({path:`/tmp/bonzai-mint-${theme}-${width}.png`});
  }
  await page.evaluate(()=>window.fixture.generation={model:'flux-klein'});
  await page.getByText('This generation uses a non-commercial license and cannot be minted.').waitFor();
  await page.evaluate(()=>window.fixture.content='not a valid image!');
  await page.getByText('The selected media could not be decoded. Restore the original file.').waitFor();
  await page.evaluate(()=>{
   const buffer=new ArrayBuffer(44+1600),v=new DataView(buffer);const text=(offset,value)=>[...value].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
   text(0,'RIFF');v.setUint32(4,1636,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,1600,true);
   Object.assign(window.fixture,{inferenceId:'audio',inferenceType:'audio',contentType:'audio/wav',content:new Uint8Array(buffer),generation:{license:'MIT'}});
  });
  await page.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);
  await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const stream=canvas.captureStream(10);const chunks=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
   const completed=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve;});recorder.start();canvas.getContext('2d').fillRect(0,0,32,32);await new Promise(resolve=>setTimeout(resolve,250));recorder.stop();await completed;stream.getTracks().forEach(t=>t.stop());
   Object.assign(window.fixture,{inferenceId:'video',inferenceType:'video',contentType:'video/webm',content:new Uint8Array(await new Blob(chunks).arrayBuffer()),generation:{license:'MIT'}});
  });
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
  await page.evaluate(()=>Object.assign(window.fixture,{inferenceId:'text',inferenceType:'text',contentType:'text/plain',content:'Selected text',generation:{license:'MIT'}}));
  await page.locator('.text-snippet').getByText('Selected text',{exact:true}).waitFor();
  await page.evaluate(()=>Object.assign(window.fixture,{inferenceId:'object',inferenceType:'object',contentType:'application/javascript',content:'export default function({THREE}) { const root=new THREE.Group(); root.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xff0000}))); return root; }',generation:{license:'MIT'}}));
  await page.waitForFunction(()=>document.querySelector('.preview-3d canvas') && document.querySelector('.content-preview').getAttribute('aria-busy')==='false',null,{timeout:45000});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
