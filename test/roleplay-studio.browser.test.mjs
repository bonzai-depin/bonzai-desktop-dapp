import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('heartbeat and social studio expose bounded controls, review and errors without publishing', {skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/src/assets/tokens.css');
 await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><div id="fixture"></div>');
 await page.route('**/src/services/social/content-pipeline.js*',r=>r.fulfill({contentType:'application/javascript',body:'export class ContentPipeline {async generateBaseContent(c,t,x){return {text:x.topic.title}} async _adaptAndPost(){window.publishCount=(window.publishCount||0)+1;throw new Error(\"Connection lost\")}}'}));
 await page.route('**/src/services/social/scheduler.js*',r=>r.fulfill({contentType:'application/javascript',body:'export const socialScheduler={getAdapter:()=>({isAuthenticated:async()=>true,adaptContent:x=>x})}'}));
 await page.evaluate(async()=>{
 const {createApp,h,reactive}=await import('/node_modules/.vite/deps/vue.js');
 const {default:Studio}=await import('/src/components/roleplay/HeartbeatStudio.vue');
 window.electronAPI={social:{getConnected:async()=>({}),oauthStart:async()=>({success:!!window.allowOAuth,error:'OAuth is not configured for this provider.'})}};
 window.state=reactive({config:{idleTimeout:5,messageInterval:15,maxMessages:12},active:false});
 createApp({render:()=>h(Studio,{companion:{id:'studio-test',name:'Jin'},config:window.state.config,active:window.state.active,inSession:true,'onUpdate:config':v=>window.state.config=v,onToggle:v=>window.state.active=v})}).mount('#fixture');
 });
 await page.getByRole('button',{name:'Enable heartbeat'}).click();assert.equal(await page.getByLabel('Stop after').isDisabled(),true);
 await page.getByRole('button',{name:'Pause heartbeat'}).click();await page.getByLabel('Stop after').selectOption('3');assert.equal(await page.evaluate(()=>window.state.config.maxMessages),3);
 await page.getByRole('button',{name:'Social studio',exact:true}).click();await page.getByRole('button',{name:'Connect account'}).first().click();await page.getByRole('alert').filter({hasText:'OAuth is not configured'}).waitFor();
 await page.getByLabel('What should this post be about?').fill('A new recipe');await page.getByRole('button',{name:'Prepare draft'}).click();await page.getByLabel('Review caption').waitFor();assert.equal(await page.getByLabel('Review caption').inputValue(),'A new recipe');assert.equal(await page.getByRole('button',{name:'Approve & publish to x'}).isDisabled(),true);
 for(const theme of ['default','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);for(const width of [1280,600,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme} overflow at ${width}`);}}
 await page.getByRole('button',{name:'Save draft locally'}).click();
 assert.equal(await page.evaluate(async()=>{const {readSocialDraft}=await import('/src/services/social/draftStore.js');return (await readSocialDraft('studio-test')).draft.text;}),'A new recipe');
 await page.evaluate(()=>window.allowOAuth=true);await page.getByRole('button',{name:'Connect account'}).first().click();
 await page.getByRole('button',{name:'Approve & publish to x'}).click();await page.getByRole('alert').filter({hasText:'Connection lost'}).waitFor();assert.equal(await page.getByRole('button',{name:'Approve & publish to x'}).isDisabled(),true);assert.equal(await page.evaluate(()=>window.publishCount),1);
 assert.equal(await page.evaluate(async()=>{const {readSocialDraft}=await import('/src/services/social/draftStore.js');return (await readSocialDraft('studio-test')).draft.status;}),'uncertain');
 await page.screenshot({path:'/tmp/bonzai-heartbeat-studio.png',fullPage:true});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
