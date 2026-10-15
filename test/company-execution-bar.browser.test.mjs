import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('global team monitor keeps work visible across foreground views and opens the selected team', {skip:!url,timeout:60000}, async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/src/assets/tokens.css');
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><div id="app"></div>');
  await page.evaluate(async()=>{
   const teams=[{id:'a',name:'Maintenance et interventions pour tous les clients',status:'active'},{id:'b',name:'Grants',status:'paused'}];
   window.running=true;
   window.electronAPI={db:{companies:{listIds:async()=>teams.map(t=>t.id),get:async id=>teams.find(t=>t.id===id)},automation:{state:async id=>id==='a' && window.running?{leaseExpiresAt:Date.now()+60000,activeLane:'roles'}:null}}};
   const source=await fetch('/src/components/company/CompanyExecutionBar.vue').then(r=>r.text());
   const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp,h,reactive}=await import(runtime);
   const {default:Bar}=await import('/src/components/company/CompanyExecutionBar.vue');
   const state=reactive({view:'Image'});window.fixture=state;
   const app=createApp({render:()=>h('main',[h(Bar,{onOpen:id=>window.openedTeam=id}),h('section',{key:state.view},state.view)])});
   app.config.globalProperties.$ui=s=>s;app.mount('#app');
  });
  await page.getByText('Working',{exact:true}).waitFor();
  await page.getByText('Paused',{exact:true}).waitFor();
  await page.evaluate(()=>window.fixture.view='3D');
  await page.getByText('Working',{exact:true}).waitFor();
  await page.locator('.execution-bar__team').first().click();
  assert.equal(await page.evaluate(()=>window.openedTeam),'a');
  await page.evaluate(()=>window.running=false);
  await page.getByText('Play mode · waiting for work',{exact:true}).waitFor();
  for(const width of [390,1440])for(const theme of ['dark','light']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.ok(await page.getByText('Play mode · waiting for work',{exact:true}).evaluate(el=>el.getBoundingClientRect().height<24));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`/tmp/team-monitor-${theme}-${width}.png`});
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
