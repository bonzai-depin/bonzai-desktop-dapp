import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('chat follows streaming at the bottom and lets users scroll away, across widths', {skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage();
  await page.goto(new URL('/src/assets/tokens.css',url).href);
  await page.setContent('<link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/tokens.css"><div id="test" style="height:600px"></div>');
  await page.evaluate(async()=>{
   const {createApp,h,reactive}=await import('/node_modules/.vite/deps/vue.js');
   const {default:Chat}=await import('/src/components/chat/ChatLayout.vue');
   window.state=reactive({messages:[{id:'1',role:'assistant',content:'Start\n'.repeat(100)}]});
   createApp({render:()=>h(Chat,{messages:state.messages},{input:()=>h('input')})}).mount('#test');
  });
  for(const width of [1280,420]){
   await page.setViewportSize({width,height:800});
   const stream=page.locator('.bz-chat__stream');
   await stream.evaluate(el=>el.scrollTop=el.scrollHeight);
   await page.waitForTimeout(100);
   await page.evaluate(()=>state.messages[0].content+='A streamed paragraph.\n'.repeat(30));
   await page.waitForTimeout(150);
   assert.ok(await stream.evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight)<5);
   await stream.evaluate(el=>el.scrollTop=20);
   await page.waitForTimeout(100);
   await page.evaluate(()=>state.messages[0].content+='More streaming.\n'.repeat(30));
   await page.waitForTimeout(150);
   assert.ok(await stream.evaluate(el=>el.scrollTop)<40,'streaming must not pull readers away from earlier messages');
  }
 }finally{await browser.close();}
});
test('Markets icons use bundled ligatures rather than rendering raw names',{skip:!url,timeout:30000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();await page.goto(new URL('/src/assets/fonts/fonts.css',url).href);
  await page.setContent('<link rel="stylesheet" href="/src/assets/fonts/fonts.css"><div id="icons"></div>');
  const names=['candlestick_chart','hub','refresh','search','arrow_forward','automation','model_training','sports_esports','currency_exchange','star_outline','token','arrow_outward'];
  const widths=await page.evaluate(async names=>{await document.fonts.load('24px "Material Symbols Outlined"');return names.map(name=>{const el=document.createElement('span');el.textContent=name;el.style.cssText='display:inline-block;font:24px "Material Symbols Outlined";font-feature-settings:"liga"';document.getElementById('icons').append(el);return{name,width:el.getBoundingClientRect().width};});},names);
  assert.deepEqual(widths.filter(x=>x.width>30),[]);
 }finally{await browser.close();}
});
test('French guide translates every activity and translation never corrupts icon ligatures',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:420,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('/src/assets/tokens.css',url).href);
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><div id="guide"></div><span class="material-symbols-outlined" id="symbol">token</span>');
  await page.evaluate(async()=>{
   const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
   const {createI18nPlugin,i18n}=await import('/src/i18n/index.js');i18n.setLocale('fr');
   const {default:Guide}=await import('/src/components/ProtocolGuide.vue');
   createApp({render:()=>h(Guide)}).use(createI18nPlugin()).mount('#guide');
   const {installLegacyI18nBridge}=await import('/src/i18n/legacy.js');installLegacyI18nBridge(document.body);
  });
  await page.getByRole('heading',{name:'Guide Web3'}).waitFor();
  assert.equal(await page.locator('#symbol').textContent(),'token');
  await page.getByRole('button',{name:'Utiliser les Smart Workflows',exact:true}).click();
  await page.getByText('Les workflows locaux sont gratuits.',{exact:false}).waitFor();
  assert.equal(await page.locator('article').getByText('What it costs').count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
