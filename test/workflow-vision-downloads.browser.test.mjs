import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('embedded card analysis has one download owner and unlocks when shared requirements become ready', {skip: !url, timeout: 60000}, async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const page = await browser.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<div id="app"></div>');
  await page.evaluate(async () => {
   const source = await fetch('/src/components/skills/TCGScannerSkill.vue').then(r=>r.text());
   const runtime = source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp,h,reactive} = await import(runtime);
   const {default:View} = await import('/src/components/skills/TCGScannerSkill.vue');
   const state = window.fixture = reactive({managed:true,ready:false});
   createApp({render:()=>h(View,{downloadsManaged:state.managed,modelAvailable:state.ready})}).mount('#app');
  });
  assert.equal(await page.getByRole('button',{name:/Download Models/}).count(),0);
  assert.equal(await page.getByRole('button',{name:/Select Card Image/}).count(),0);
  await page.evaluate(()=>window.fixture.ready=true);
  await page.getByRole('button',{name:/Select Card Image/}).waitFor();
  await page.evaluate(()=>{window.fixture.ready=false;window.fixture.managed=false;});
  await page.getByRole('button',{name:/Download Models/}).waitFor();
 } finally { await browser.close(); }
});
