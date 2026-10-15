import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('roleplay suggestions remain readable and creation controls use compact menus',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:950}});page.setDefaultTimeout(12000);
 await page.goto(url+'/src/assets/tokens.css?demo=companion-chat');
 await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:16px;background:var(--bz-canvas);color:var(--bz-fg)}</style><div id="fixture"></div>');
 await page.route('**/pipelines/plan',r=>r.fulfill({json:{ok:false}}));
 await page.evaluate(async()=>{
 const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
 const source=await(await fetch('/src/stores/web3.store.js')).text();const {createPinia}=await import(source.match(/from ["']([^"']*pinia[^"']*)["']/)[1]);
 const {default:Roleplay}=await import('/src/components/skills/RoleplayChat.vue');const {roleplayCompanion}=await import('/src/skills/flagship.js');const {createI18nPlugin}=await import('/src/i18n/index.js');
 createApp({render:()=>h(Roleplay,{skill:roleplayCompanion})}).use(createPinia()).use(createI18nPlugin()).mount('#fixture');
 });
 await page.locator('.chat-input').waitFor();
 await page.evaluate(()=>{const state=document.querySelector('.roleplay-chat').__vueParentComponent.setupState;state.isTyping=false;state.suggestedResponses=['Tell me more about this place.','Let’s explore the garden together.'];});
 await page.locator('.roleplay-suggestion').first().waitFor();
 for(const theme of ['default','light','waveform']){
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(450);
 const readable=await page.locator('.roleplay-suggestion').first().evaluate(el=>{const s=getComputedStyle(el);const rgb=x=>x.match(/[\d.]+/g).slice(0,3).map(Number);const lum=x=>rgb(x).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const a=lum(s.color),b=lum(s.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert.ok(readable>=4.5,`${theme} contrast ${readable} ${await page.locator(".roleplay-suggestion").first().evaluate(el=>{const s=getComputedStyle(el);return JSON.stringify({fg:s.color,bg:s.backgroundColor,token:s.getPropertyValue("--bz-fg")})})}`);
 }
 await page.locator('.roleplay-create-menu summary').first().click();
 await page.locator('.chat-capability-workflows button').filter({hasText:'Image'}).first().click();
 assert.equal(await page.locator('.roleplay-create-menu').first().getAttribute('open'),null);
 assert.match(await page.locator('.chat-creation-selection').innerText(), /Image/);
 assert.match(await page.locator('.chat-creation-selection').innerText(), /Describe what you want/);
 await page.locator('.chat-creation-selection button').click();
 assert.equal(await page.locator('.chat-creation-selection').count(),0);
 await page.setViewportSize({width:390,height:900});
 assert.ok(await page.locator('.chat-input').evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
 await page.screenshot({path:'/tmp/bonzai-roleplay-composer.png'});
 }finally{await browser.close();}
});
