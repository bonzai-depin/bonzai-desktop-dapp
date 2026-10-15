import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('logistics assessment can be edited, saved and read in French at narrow widths',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1360,height:950}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+'/src/assets/tokens.css');
 await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg)}*{box-sizing:border-box}</style><div id="fixture"></div>');
 await page.evaluate(async()=>{
 const moduleSource=await fetch('/src/components/company/CompanyLogistics.vue').then(r=>r.text());
 const vueRuntime=moduleSource.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
 const {createApp,h}=await import(vueRuntime);const {default:View}=await import('/src/components/company/CompanyLogistics.vue');
 const {i18n}=await import('/src/i18n/index.js');window.logisticsI18n=i18n;i18n.setLocale('en');
 window.electronAPI={db:{purchasing:{saveLogistics:async(id,input)=>{window.savedLogistics={id,input};return {...input,revision:1};}}}};
 createApp({render:()=>h(View,{companyId:'buyer',data:{requests:[{id:'request',title:'Replacement pump',sourceCompanyId:'gmao',workOrderId:'OI-12',selectedQuoteId:'quote'}],quotes:[{id:'quote',subtotalCents:650000,shippingCents:50000}],logistics:[]}})}).mount('#fixture');
 });
 assert.deepEqual(errors,[]);await page.locator('.logistics > label select').selectOption('request');
 await page.getByLabel('Delivery location',{exact:true}).fill('Site CFE');
 await page.getByLabel('Reviewed selling price, excluding tax (optional)').fill('10000');
 await page.getByLabel('Certainty',{exact:true}).first().selectOption('confirmed');
 await page.getByLabel('EUR',{exact:true}).first().fill('1700');
 await page.getByLabel('Source / inclusion reference',{exact:true}).first().fill('Carrier offer 123');
 await page.getByRole('button',{name:'Save logistics assessment'}).click();
 await page.getByRole('status').waitFor();
 assert.equal(await page.evaluate(()=>window.savedLogistics.input.costs[0].amountCents),170000);
 assert.equal(await page.evaluate(()=>window.savedLogistics.input.costs[1].status),'missing');
 for(const theme of ['default','light','waveform']){
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const width of [1360,390]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 }
 await page.evaluate(()=>window.logisticsI18n.setLocale('fr'));
 await page.getByRole('heading',{name:'Coûts rendus sur site'}).waitFor();
 await page.screenshot({path:'/tmp/bonzai-logistics-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
