import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;

test('generation views mount, filter saved history and navigate without corrupting Vue DOM',{skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.text().includes('[Vue warn]'))errors.push(m.text());});
  // No inference, downloads or user data are touched by this renderer test.
  await page.route(/http:\/\/(?:127\.0\.0\.1|localhost):65000\//,r=>r.fulfill({json:{status:'ready',downloaded:false,models:[],pipelines:[],available:false}}));
  await page.goto(`${url}/src/assets/tokens.css`);await page.setContent('<div id="test"></div>');
  await page.evaluate(async()=>{
   const{createApp,h,shallowRef}=await import('/node_modules/.vite/deps/vue.js');
   const storeSource=await(await fetch('/src/stores/web3.store.js')).text();
   const{createPinia}=await import(storeSource.match(/from ["']([^"']*pinia[^"']*)["']/)[1]);
   const{createI18nPlugin}=await import('/src/i18n/index.js');
   const{installLegacyI18nBridge}=await import('/src/i18n/legacy.js');
   window.view=shallowRef(null);
   window.testApp=createApp({render:()=>view.value?h(view.value,{key:view.value.name,ref:vm=>window.currentView=vm}):h('p','Loading')}).use(createPinia()).use(createI18nPlugin());
   testApp.mount('#test');window.stopTranslation=installLegacyI18nBridge(document.body);
  });
  for(const name of ['GenerativeImage','GenerativeAudio','GenerativeVideo','Generative3D','GenerativeImage']){
   await page.evaluate(async name=>{view.value=(await import(`/src/components/${name}.vue`)).default},name);
   await page.waitForFunction(()=>window.currentView);
   await page.waitForTimeout(250);
   assert.deepEqual(errors,[],`${name} must mount without Vue warnings or errors`);
   assert.ok((await page.locator('#test').innerText()).length>50,`${name} must display content`);
   if(name==='Generative3D')continue;
   await page.evaluate(name=>{
    const data=name==='GenerativeImage'?{image:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}:name==='GenerativeAudio'?{audio_path:'data:audio/wav;base64,'}:{video_url:'data:video/mp4;base64,'};
    currentView.includeRoleplay=true;
    currentView.inferences=[{id:'test-local',question:'Local test',timestamp:1,answer:{status:200,data}},{id:'test-roleplay',source:'roleplay',question:'Roleplay test',timestamp:2,answer:{status:200,data}}];
   },name);
   await page.waitForFunction(()=>currentView.reversedInferences.length===2);
   if(name==='GenerativeVideo') assert.ok(await page.locator('.bz-gen-action__label').filter({hasText:'Tokenize'}).first().isVisible(),'Video must show the Tokenize label');
   const toggle=page.getByRole('switch',{name:'Include roleplay'});
   await toggle.click();
   await page.waitForFunction(()=>currentView.reversedInferences.length===1);
   assert.equal(await page.evaluate(()=>currentView.reversedInferences[0].id),'test-local');
   await page.evaluate(()=>{currentView.inferences=currentView.inferences.filter(row=>row.source==='roleplay')});
   await page.waitForFunction(()=>currentView.reversedInferences.length===0);
   await toggle.click();
   await page.waitForFunction(()=>currentView.reversedInferences.length===1);
   assert.deepEqual(errors,[],`${name}: empty/populated history transitions must remain renderable`);
  }
  await page.evaluate(()=>{stopTranslation();testApp.unmount()});
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
