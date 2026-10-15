import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('French guide links, searchable answers and narrow layouts',{skip:!url},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/src/assets/tokens.css');
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:20px;background:var(--bz-canvas);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style><div id="app"></div>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/company/CompanyGettingStarted.vue').then(r=>r.text());
   const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp}=await import(runtime);
   const {default:View}=await import('/src/components/company/CompanyGettingStarted.vue');
   const {operationText}=await import('/src/i18n/operations.js');
   const app=createApp(View,{charter:{workspace:{profile:'grants'}},views:[{key:'grants',label:'Grant dossiers',icon:'account_balance'}],onOpenView:key=>window.destination=key});
   app.config.globalProperties.$ui=s=>operationText(s,'fr');app.mount('#app');
  });
  assert.equal(await page.locator('.business-demo .demo-actions button').count(),1);
  await page.getByRole('button',{name:'Du dossier de prime au versement',exact:true}).waitFor();
  await page.locator('.guide-steps button').first().click();
  assert.equal(await page.evaluate(()=>window.destination),'intake');
  await page.getByRole('textbox').fill('réutiliser');
  assert.equal(await page.locator('details').count(),1);
  await page.locator('summary').click();
  assert.ok(await page.locator('details').getAttribute('open')!==null);
  await page.getByRole('textbox').fill('zzzzzz');assert.equal(await page.locator('details').count(),0);
  await page.getByRole('textbox').fill('');
  for(const width of [360,760,1440]) {
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow at ${width}`);
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.waitForTimeout(150);
   await page.screenshot({path:`/tmp/bonzai-team-guide-${width}.png`});
  }
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
