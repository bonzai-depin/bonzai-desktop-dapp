import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('welcome recommends a practical quality model and stays usable at narrow widths',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('/src/assets/tokens.css',url).href);
 await page.setContent('<html data-theme="warm"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body><div id="fixture"></div></body></html>');
 await page.evaluate(async()=>{
  window.electronAPI={systemInformation:async()=>({platform:'darwin',gpu:'Apple M1 Max',memBudget:32*.7e9})};
  localStorage.removeItem('bonzai.preferredLlm');
  const {createApp}=await import('/node_modules/.vite/deps/vue.js');
  const {default:Welcome}=await import('/src/components/FirstRunWelcome.vue');
  const app=createApp(Welcome,{onComplete:mode=>window.completed=mode});app.config.globalProperties.$ui=s=>s;app.mount('#fixture');
 });
 await page.getByText('Qwen3.5 27B MTP Q4_K_XL',{exact:true}).waitFor();
 await page.screenshot({path:'/tmp/bonzai-welcome-quality-desktop.png'});
 for(const theme of ['warm','light']) for(const width of [1440,390]){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await page.locator('.welcome-window').evaluate(el=>el.getBoundingClientRect().left>=0));
 }
 await page.screenshot({path:'/tmp/bonzai-welcome-quality-mobile.png'});
 await page.locator('.welcome-footer button').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('bonzai.preferredLlm')),'qwen3.5-27b-ud-q4_k_xl.gguf');
 assert.equal(await page.evaluate(()=>window.completed),'chat');
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
