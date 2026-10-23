import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('every generation view exposes a working draft controller', {skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const name of ['GenerativeImage','GenerativeAudio','GenerativeVideo','GenerativeText','Generative3D','GenerativeTraining']){
   const page=await browser.newPage({viewport:{width:1280,height:900}});
   await page.route('**/*',route=>{
    if(new URL(route.request().url()).pathname==='/src/composables/useBonzaiWeb3.js')return route.fulfill({contentType:'application/javascript',body:'export const useBonzaiWeb3=()=>({walletAddress:{value:null}});'});
    return new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.fulfill({json:{ok:true,pipelines:[]}});
   });
   await page.goto(new URL('/src/assets/tokens.css',url).href);
   await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/buttons.css"><div id="fixture"></div>');
   const result=await page.evaluate(async name=>{
    window.electronAPI={store:{get:async(_k,fallback)=>fallback,set:async()=>true},checkModel:async()=>false};
    const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
    const {createPinia}=await import('/node_modules/.vite/deps/pinia.js');
    const {createI18nPlugin}=await import('/src/i18n/index.js');
    const {default:View}=await import(`/src/components/${name}.vue`);
    View.components={...View.components,AccessRequirements:{render:()=>null}};
    let failure=null;
    const app=createApp({render:()=>h(View,{mode:'tune',ref:view=>window.view=view})});
    app.config.errorHandler=error=>{failure ||= error.stack;};
    app.use(createPinia()).use(createI18nPlugin()).mount('#fixture');
    await new Promise(resolve=>setTimeout(resolve,100));
    return {failure,buttons:[...document.querySelectorAll('button')].map(b=>b.textContent.trim())};
   },name);
   assert.equal(result.failure,null,`${name}: ${result.failure}`);
   assert.ok(result.buttons.some(x=>x.includes('Save Draft')),name);
   await page.getByRole('button',{name:'Save Draft',exact:true}).first().click();
   await page.getByRole('status').filter({hasText:'Draft saved'}).first().waitFor();
   await page.screenshot({path:`/tmp/bonzai-draft-${name}.png`});
   await page.close();
  }
 }finally{await browser.close();}
});
