import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('Sales records and route previews work at desktop and narrow widths',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1360,height:950}}), errors=[];
 page.setDefaultTimeout(8000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/src/assets/tokens.css');
 await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg)}*{box-sizing:border-box}</style><div id="fixture"></div>');
 await page.evaluate(async()=>{
 const moduleSource=await fetch('/src/components/company/CompanySales.vue').then(r=>r.text());
 const vueRuntime=moduleSource.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
 const {createApp,h}=await import(vueRuntime);
 const {default:Sales}=await import('/src/components/company/CompanySales.vue');
 const {default:Route}=await import('/src/components/company/CompanyRoutePlanner.vue');
 const {i18n}=await import('/src/i18n/index.js');window.testI18n=i18n;i18n.setLocale('en');
 const records=[];
 window.electronAPI={db:{companySales:{snapshot:async()=>({records,incoming:[],teams:[]}),saveRecord:async(id,input)=>{const saved={...input,id:'sale',revision:1};records.push(saved);window.savedSale=saved;return saved;},onChanged:()=>()=>{}},gmaoMaintenance:{planRoute:async(id,input)=>{window.routeInput=input;return {...input,stops:input.stops.map(s=>({...s,title:'Visit',scheduledAt:input.startAt+20*60000,durationMinutes:60,version:1}))};},applyRoute:async(id,input)=>{window.savedRoute=input;}}}};
 createApp({render:()=>h('div',[h(Sales,{companyId:'sales'}),h(Route,{companyId:'gmao',orders:[{id:'visit',title:'Visit',status:'reported'}]})])}).mount('#fixture');
 });
 await page.getByRole('button',{name:'New customer case'}).click();
 await page.getByLabel('Subject',{exact:true}).fill('Replace HVAC');
 await page.getByLabel('Prospect name',{exact:true}).fill('CFE');
 await page.getByLabel('Request / agreed scope').fill('Replace failed unit after customer acceptance');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 await page.waitForFunction(()=>window.savedSale?.title==='Replace HVAC');
 await page.locator('.sales-select').click(); // Regression: editing Vue proxies must not call structuredClone.
 await page.locator('.route summary').click();
 await page.getByLabel('Technician',{exact:true}).fill('Alex');
 await page.getByLabel('Departure',{exact:true}).fill('2026-10-20T08:00');
 await page.getByLabel('Add a visit',{exact:true}).selectOption('visit');
 await page.getByRole('button',{name:'Add',exact:true}).click();
 await page.getByLabel('Travel from previous stop (min)').fill('20');
 await page.getByLabel('Travel-time source',{exact:true}).fill('Reviewed route');
 await page.getByRole('button',{name:'Preview route'}).click();
 await page.getByRole('button',{name:'Confirm schedule'}).click();
 await page.waitForFunction(()=>window.savedRoute?.stops.length===1);
 assert.equal(await page.evaluate(()=>window.savedRoute.confirmed),true);
 for(const theme of ['default','light','waveform']){
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const width of [1360,390]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 }
 await page.evaluate(()=>window.testI18n.setLocale('fr'));
 await page.getByRole('heading',{name:'Clients et ventes'}).waitFor();
 await page.screenshot({path:'/tmp/bonzai-sales-route-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
