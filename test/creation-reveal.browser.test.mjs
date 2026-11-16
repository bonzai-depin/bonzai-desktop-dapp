import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('completion reveal is full screen, dismissible, and respects reduced motion; roleplay scrolls',{skip:!url,timeout:45000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(`${url}/src/assets/tokens.css`);
 await page.setContent('<html data-theme="amber"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><div id="app"></div></body></html>');
 await page.evaluate(async()=>{
  const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
  const {default:View}=await import('/src/components/GenerationCelebration.vue');
  const show=ref(true);createApp({setup:()=>()=>h(View,{show:show.value,title:'Your creation is ready',description:'Saved to your generation history',onDismiss:()=>show.value=false})}).mount('#app');
 });
 await page.locator('.creation-reveal').waitFor();
 assert.deepEqual(await page.locator('.creation-reveal').evaluate(el=>[el.clientWidth,el.clientHeight]),[1280,900]);
 await page.waitForTimeout(800);
 await page.screenshot({path:'/tmp/bonzai-completion-reveal.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.creation-reveal__art').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.keyboard.press('Escape');await page.locator('.creation-reveal').waitFor({state:'detached'});
 await page.addInitScript(()=>localStorage.setItem('bonzai.onboarding.v4.completed','true'));
 await page.goto(url);
 await page.locator('#bonzai').waitFor();
 await page.evaluate(async()=>{const source=await fetch('/src/App.vue').then(r=>r.text());window.generationStorePath=source.match(/from ["']([^"']*stores\/generationStore\.js[^"']*)["']/)[1];const store=await import(window.generationStorePath);store.startGeneration('image','test-reveal');});
 await page.waitForTimeout(50);
 await page.evaluate(async()=>{const store=await import(window.generationStorePath);Object.assign(store.getGeneration('image'),{active:false,stage:'finished'});});
 await page.locator('.creation-reveal').waitFor();
 await page.locator('.creation-reveal').waitFor({state:'detached',timeout:6500});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('bonzai:set-mode',{detail:'roleplay'})));
 const roleplay=page.locator('.roleplay-view');await roleplay.waitFor();
 for(const width of [1280,540]){
  await page.setViewportSize({width,height:900});
  await page.waitForTimeout(300);
  const result=await roleplay.evaluate(el=>{el.scrollTop=200;return {scroll:el.scrollTop,height:el.clientHeight,bottom:el.getBoundingClientRect().bottom}});
  assert.ok(result.scroll>0,`Roleplay must scroll at ${width}px`);
  assert.ok(result.bottom<=901,'scroll area fits workspace');
 }
 }finally{await browser.close();}
});
