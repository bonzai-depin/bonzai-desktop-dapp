import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('peer worker view stays readable in light/dark themes and constrained widths', { skip: !url, timeout: 60000 }, async () => {
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await page.goto(new URL('/src/assets/tokens.css',url).href);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;padding:16px;background:var(--bz-canvas);color:var(--bz-fg)"><div id="fixture"></div></body></html>');
  await page.evaluate(async()=>{
   window.electronAPI={store:{get:async key=>key==='roleplayCompanions'?[{id:'worker-fixture',name:'Rose Kanagawa',chainId:4663,contractAddress:'0x1111111111111111111111111111111111111111',tokenId:'1'}]:null},agentWorkerPeers:async()=>[],agentWorkerRuns:async()=>[]};
   const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
   const {default:Panel}=await import('/src/components/AgentWorkersPanel.vue');
   const {createI18nPlugin,i18n}=await import('/src/i18n/index.js');
   createApp({render:()=>h(Panel,{companyId:'fixture'})}).use(createI18nPlugin(i18n)).mount('#fixture');
  });
  await page.getByText('Peer workers',{exact:true}).waitFor();
  await page.getByText('Manage my workers',{exact:true}).click();
  await page.locator('.worker-owner select').selectOption('worker-fixture');
  await page.getByRole('button',{name:'Authorize worker',exact:true}).waitFor();
  await page.getByText('Delegate to another device',{exact:true}).click();
  await page.getByText('Ownership and execution wallet',{exact:true}).click();
  assert.equal(await page.getByRole('switch').count(),10);
  for(const theme of ['default','light']) for(const width of [1280,360]) {
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(width===1280)await page.screenshot({path:`/tmp/bonzai-peer-workers-${theme}.png`});
  }
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
