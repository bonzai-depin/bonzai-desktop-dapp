import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('step 3 separates slot attachment, identity, atomic issuance and wallet-free roleplay',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:430,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/src/assets/tokens.css');
 await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"></head><body style="padding:20px"><div id="app"></div></body></html>');
 await page.evaluate(async()=>{
 const {createApp,h,reactive}=await import('/node_modules/.vite/deps/vue.js');
 const {default:Step}=await import('/src/components/AgentLaunchStep.vue');

 const state=reactive({agent:{id:'local',name:'Rose'},connected:false,attached:false,owned:false,ready:false,token:null});window.events=[];
 const app=createApp({render:()=>h(Step,{...state,loadSlots:async()=>[{tokenId:'7',name:''}],network:'Robinhood',configured:true,symbol:'ROSE',connect:()=>state.connected=true,attach:async id=>{state.agent.tokenId=id;state.attached=true;state.owned=true;window.events.push('attach');},publish:()=>{state.ready=true;window.events.push('identity');},launch:()=>{state.token='0x123';window.events.push('launch');},startRoleplay:()=>window.events.push('roleplay')})});app.config.globalProperties.$ui=s=>s;app.mount('#app');
 });
 await page.getByRole('button',{name:'Start roleplay',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.events),['roleplay']);
 assert.ok(await page.getByRole('button',{name:'Launch token + pool',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.getByRole('button',{name:'Find my slots',exact:true}).click();
 await page.getByRole('combobox').selectOption('7');await page.getByRole('button',{name:'Attach slot',exact:true}).click();
 assert.ok(await page.getByRole('button',{name:'Launch token + pool',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Update onchain identity',exact:true}).click();
 await page.getByRole('button',{name:'Launch token + pool',exact:true}).click();
 await page.getByText('Token and pool launched',{exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.events),['roleplay','attach','identity','launch']);
 assert.ok(await page.getByRole('button',{name:'Update onchain identity',exact:true}).isDisabled());
 for(const theme of ['default','light']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);for(const width of [360,1200]){await page.setViewportSize({width,height:1200});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}}
 await page.setViewportSize({width:430,height:1100});await page.screenshot({path:'/tmp/bonzai-agent-step3.png',fullPage:true});
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
