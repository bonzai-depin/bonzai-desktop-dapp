import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('global activity survives navigation, reconnects truthfully and controls away mode', {skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/src/stores/generationStore.js')return route.fulfill({contentType:'application/javascript',body:`const listeners={};const socket={connected:true,on:(key,fn)=>{(listeners[key]||=[]).push(fn)},off:()=>{},emit:()=>{}};window.fireGeneration=(key,event)=>(listeners[key]||[]).forEach(fn=>fn(event));export const ensureGenerationSocket=()=>socket;`});
  if(path==='/src/stores/skillStore.js')return route.fulfill({contentType:'application/javascript',body:`export const useSkillStore=()=>window.fixtureSkills;`});
  if(path==='/src/stores/companyStore.js')return route.fulfill({contentType:'application/javascript',body:`export default {state:{activeStreams:{},runtimeError:null}};`});
  if(path==='/src/services/company.service.js')return route.fulfill({contentType:'application/javascript',body:`export const listCompanies=async()=>[{id:'team1',name:'Maintenance',status:'active'}];export const getAutomationStatus=async()=>({health:{level:'idle'}});export const pendingApprovals=async()=>[];`});
  if(path==='/downloads/list')return route.fulfill({json:{pipelines:[]}});
  if(new URL(route.request().url()).origin!==new URL(url).origin)return route.abort();
  return route.continue();
 });
 await page.goto(new URL('/src/assets/tokens.css',url).href);
 await page.setContent('<html data-theme="waveform"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;background:#07111f"><div id="fixture"></div></body></html>');
 await page.evaluate(async()=>{
  const {createApp,h,reactive}=await import('/node_modules/.vite/deps/vue.js');
  window.fixtureSkills=reactive({autonomousMode:true,isGeneratingAutonomous:false,autonomousSession:{companion:{name:'Sakura'}},toggleAutonomousMode(value){this.autonomousMode=value}});
  window.electronAPI={getActiveDownloads:async()=>[],onDownloadProgress:callback=>{window.emitDownload=data=>callback(null,data);return()=>{}}};
  const {default:Bar}=await import('/src/components/ApplicationActivityBar.vue');
  window.fixtureServer=reactive({type:'starting'});window.openedMode=null;
  const app=createApp({render:()=>h('div',{},[h(Bar,{server:window.fixtureServer,onOpenMode:mode=>window.openedMode=mode}),h('div',{style:'padding:32px;color:white'},'Current workspace')])});
  app.config.globalProperties.$ui=text=>text;app.mount('#fixture');
 });
 await page.getByRole('button',{name:/Local AI/}).click();
 assert.match(await page.locator('#application-activity-panel').innerText(),/Starting BonzAI/);
 await page.evaluate(()=>{window.fixtureServer.type='ready';window.fireGeneration('gen_started',{generation_id:'video1',kind:'wan_video'});window.fireGeneration('gen_progress',{generation_id:'video1',stage:'denoising',step:3,total:4,pct:75});});
 assert.match(await page.locator('.app-activity__strip').innerText(),/75%/);
 await page.screenshot({path:'/tmp/bonzai-activity-running.png'});
 await page.getByRole('button',{name:'Pause away mode',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.fixtureSkills.autonomousMode),false);
 assert.equal(await page.evaluate(()=>window.fixtureSkills.autonomousSession.companion.name),'Sakura');
 await page.locator('.app-activity__item').filter({hasText:'Generating video'}).getByRole('button',{name:'Open',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.openedMode),'video');
 assert.match(await page.locator('.app-activity__strip').innerText(),/75%/);
 await page.evaluate(()=>window.fireGeneration('disconnect'));
 await page.getByRole('button',{name:'Activity',exact:true}).click();
 assert.match(await page.locator('#application-activity-panel').innerText(),/Reconnecting/);
 await page.evaluate(()=>window.fireGeneration('gen_snapshot',{operations:[{generation_id:'video1',kind:'wan_video',stage:'encoding',status:'running',pct:0}]}));
 assert.match(await page.locator('#application-activity-panel').innerText(),/Encoding/);
 await page.evaluate(()=>window.fireGeneration('gen_finished',{generation_id:'video1'}));
 assert.match(await page.locator('#application-activity-panel').innerText(),/Recent activity/);
 await page.evaluate(()=>window.emitDownload({filename:'test.gguf',percent:1}));
 assert.match(await page.locator('.app-activity__strip').innerText(),/100%/);
 assert.match(await page.locator('.app-activity__strip').innerText(),/Downloading model/);
 await page.evaluate(()=>window.emitDownload({filename:'test.gguf',percent:1,status:'failed',error:'Checksum mismatch'}));
 assert.match(await page.locator('#application-activity-panel').innerText(),/Checksum mismatch/);
 await page.locator('.app-activity__item').filter({hasText:'Checksum mismatch'}).getByRole('button',{name:'Dismiss'}).click();
 assert.equal(await page.locator('#application-activity-panel').getByText('Checksum mismatch').count(),0);
 await page.screenshot({path:'/tmp/bonzai-activity-desktop.png'});
 for(const width of [720,390]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('.app-activity__strip').evaluate(el=>Math.round(el.getBoundingClientRect().height)),53);
 }
 await page.screenshot({path:'/tmp/bonzai-activity-mobile.png'});
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
