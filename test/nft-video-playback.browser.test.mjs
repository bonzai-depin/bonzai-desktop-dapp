import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {buildVideoPlayer} from '../src/services/nftMediaPlayer.js';
const url=process.env.BONZAI_UI_URL;
test('video advances and stops in the NFT preview and exported player, with cover cropping',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage();await page.goto(`${url}/src/assets/tokens.css`);
  const clip=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
   const stream=canvas.captureStream(15),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
   const completed=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));});
   recorder.start();let frame=0;const timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#e05070':'#307ad0';ctx.fillRect(0,0,320,180);},60);
   await new Promise(resolve=>setTimeout(resolve,2400));recorder.stop();clearInterval(timer);stream.getTracks().forEach(t=>t.stop());return completed;
  });
  await page.route('**/fixture.webm',route=>route.fulfill({status:200,contentType:'video/webm',body:Buffer.from(clip)}));
  await page.setContent('<div id="test"></div>');
  await page.evaluate(async()=>{
   const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');const source=await(await fetch('/src/stores/web3.store.js')).text();const {createPinia}=await import(source.match(/from ["']([^"']*pinia[^"']*)["']/)[1]);
   const {default:Modal}=await import('/src/components/MintModal.vue');
   window.fixtureApp=createApp({render:()=>h(Modal,{visible:true,inferenceType:'video',inferenceId:'video-test',content:location.origin+'/fixture.webm',contentType:'video/webm',generation:{license:'mit'},prompt:'Video playback'})}).use(createPinia());window.fixtureApp.mount('#test');
  });
  await page.waitForFunction(()=>document.querySelector('video.inline-video')?.readyState>=2);
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video.inline-video')?.currentTime>.15);
  assert.equal(await page.locator('video.inline-video').evaluate(el=>getComputedStyle(el).objectFit),'cover');
  assert.equal(await page.locator('video.inline-video').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.getByRole('button',{name:'Stop preview',exact:true}).click();
  assert.equal(await page.locator('video.inline-video').evaluate(el=>el.paused&&el.currentTime===0),true);
  await page.evaluate(()=>window.fixtureApp.unmount());
  await page.setContent(buildVideoPlayer(`${url}/fixture.webm`,null,'Exported NFT test'));
  await page.getByRole('button',{name:'Play preview',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.15);
  assert.equal(await page.locator('video').evaluate(el=>getComputedStyle(el).objectFit),'cover');
  await page.getByRole('button',{name:'Stop preview',exact:true}).click();
  assert.equal(await page.locator('video').evaluate(el=>el.paused&&el.currentTime===0),true);
 }finally{await browser.close();}
});
