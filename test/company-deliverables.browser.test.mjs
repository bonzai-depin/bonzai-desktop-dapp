import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;

test('deliverables keep Markdown structure, highlighted code and exact clipboard contents across themes',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style></head><body><main id="app"></main></body></html>');
  await page.evaluate(async()=>{
   const source = await fetch('/src/components/company/CompanyDeliverableLibrary.vue').then(r => r.text());
   const runtime = source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const localeModule = source.match(/from ["']([^"']*\/i18n\/index\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp,h}=await import(runtime);
   const {default:View}=await import('/src/components/company/CompanyDeliverableLibrary.vue');
   const {i18n,createI18nPlugin}=await import(localeModule);i18n.setLocale('en');
   window.fixture={clipboard:[],i18n};Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.fixture.clipboard.push(text);}}});
   const rows=[

    {id:'report',pipeline:'text',role:'Coordinator',createdAt:Date.now(),payload:'# Workshop inspection\n\n**Client:** Ateliers Martin\n\n## Before the visit\n\n1. Confirm access with the site manager.\n2. Measure the air flow.\n\n| Equipment | Check |\n| --- | --- |\n| AHU-01 | Intake filters |\n\n> Keep the measurements with the work order.\n\nUse `visitId` in the report.\n\n```js\nconst visit = { id: "OI-041", approved: false };\nconsole.log(visit.id);\n```\n\n<img src=x onerror="window.bad=true">\n\n![remote diagram](https://example.invalid/pixel.png)\n\n<think>private planning</think>',prompt:'Prepare an inspection report.'},
    {id:'scene',pipeline:'3d',role:'Designer',createdAt:Date.now(),price:12,sales:3,revenue:36,currency:'USDC',meta:{format:'javascript',title:'Equipment layout'},payload:'// Equipment layout\nconst unit = new THREE.Mesh(geometry, material);\nunit.position.set(0, 2, 0);'},
    {id:'json',pipeline:'skill',role:'Accounting',createdAt:Date.now(),meta:{title:'Supplier reconciliation'},payload:'{"supplier":"Froid Service","matched":true,"amount":285}'},
   ];
   rows.push({id:'demo',pipeline:'text',meta:{demoRun:true,title:'Verify saved outcome'},payload:'# Verify saved outcome\n\nDemonstration — fictional records and simulated external actions.\n\nStatus: passed',createdAt:Date.now()});
   createApp({render:()=>h(View,{rows,copy:async row=>navigator.clipboard.writeText(row.payload),download:()=>{},roleName:role=>role})}).use(createI18nPlugin()).mount('#app');
  });
  await page.getByRole('heading',{name:'Workshop inspection',exact:true}).waitFor();
  assert.equal(await page.locator('.deliverable-preview__metrics').count(),0,'ordinary reports have no empty commerce metrics');
  assert.equal(await page.locator('.company-markdown ol > li').count(),2);
  assert.equal(await page.locator('table th').count(),2);
  assert.equal(await page.locator('.company-markdown blockquote').count(),1);
  assert.ok(await page.locator('.bz-code-token--keyword').count());
  assert.equal(await page.locator('.company-markdown img').count(),0);
  assert.equal(await page.evaluate(()=>window.bad),undefined);
  assert.doesNotMatch(await page.locator('body').innerText(),/private planning|<think>/);
  await page.getByRole('button',{name:'Copy code',exact:true}).click();
  await page.getByText('Code copied',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.fixture.clipboard[0]),'const visit = { id: "OI-041", approved: false };\nconsole.log(visit.id);\n');
  for(const theme of ['default','waveform','light'])for(const width of [1440,800,390]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});
   assert.ok(await page.locator('.company-markdown th').first().evaluate(el => getComputedStyle(el).color === getComputedStyle(el.closest('.company-markdown')).color), `${theme}: table headings use the readable document foreground`);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${width}: no page overflow`);
   await page.screenshot({path:`/tmp/bonzai-deliverable-reader-${theme}-${width}.png`,fullPage:false,animations:'disabled'});
  }
  await page.getByRole('button',{name:/Equipment layout/}).click();
  assert.deepEqual(await page.locator('.deliverable-preview__metrics dd').allTextContents(),['12 USDC','3','36 USDC'],'published assets retain their actual commercial data');
  assert.equal(await page.locator('.bz-code__lang').innerText(),'javascript');
  await page.getByRole('button',{name:'Copy code',exact:true}).click();
  assert.match(await page.evaluate(()=>window.fixture.clipboard.at(-1)),/^\/\/ Equipment layout\nconst unit/);
  await page.getByRole('button',{name:/Supplier reconciliation/}).click();
  assert.equal(await page.locator('.bz-code__lang').innerText(),'json');
  assert.match(await page.locator('.bz-code__body').innerText(),/\n  "matched": true/);
  await page.getByLabel('Search results',{exact:true}).fill('no-such-file');
  await page.getByText('No matching results.',{exact:true}).waitFor();
  assert.equal(await page.locator('.deliverable-preview').count(),0);
  await page.getByLabel('Search results',{exact:true}).fill('');
  await page.evaluate(()=>window.fixture.i18n.setLocale('fr'));
  assert.notEqual(await page.locator('.deliverable-search input').getAttribute('aria-label'), 'Search results');
  await page.getByRole('button',{name:'Copier le code',exact:true}).waitFor();
  await page.getByRole('button',{name:/Vérifier le résultat enregistré/}).click();
  await page.getByRole('heading',{name:'Vérifier le résultat enregistré',exact:true}).waitFor();
  assert.doesNotMatch(await page.locator('.deliverable-preview').innerText(),/Verify saved outcome|fictional records/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
