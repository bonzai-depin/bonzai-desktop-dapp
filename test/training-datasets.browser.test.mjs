import {chromium} from 'playwright';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url=process.env.BONZAI_UI_URL;
test('personal content becomes a persistent local dataset and enters training without starting a job',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const posts=[];page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/training/'))posts.push(r.url())});
 await page.route('**/training/info',r=>r.fulfill({json:{supported_llm_models:[{key:'sample',name:'Sample model',repo:'sample/model'}],capabilities:{},abliteration_models:[]}}));
 await page.route('**/training/models',r=>r.fulfill({json:{models:[]}}));
 await page.goto(url+'/src/assets/tokens.css');
 await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/page-layout.css"><style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg)}#app{height:100vh}</style><div id="app"></div>');
 const hash=JSON.parse(fs.readFileSync('node_modules/.vite/deps/_metadata.json','utf8')).browserHash;
 await page.evaluate(async hash=>{
 window.saved={};window.electronAPI={store:{get:async(k,d)=>window.saved[k]??d,set:async(k,v)=>{window.saved[k]=v}},getSettings:async()=>({})};
 const {createApp}=await import('/node_modules/.vite/deps/vue.js?v='+hash);
 const {createPinia}=await import('/node_modules/.vite/deps/pinia.js?v='+hash);
 const {createI18nPlugin}=await import('/src/i18n/index.js');
 const {default:Training}=await import('/src/components/GenerativeTraining.vue');
 window.mountTraining=()=>{window.trainingApp=createApp(Training,{mode:'tune',initialTab:'datasets'}).use(createPinia()).use(createI18nPlugin());window.trainingApp.mount('#app')};window.mountTraining();
 },hash);
 await page.getByLabel('Dataset name').fill('My voice');
 await page.getByLabel('Your content',{exact:true}).fill('A complete example in my personal voice.');
 await page.getByRole('button',{name:'Add example',exact:true}).click();
 await page.getByLabel('Example type').selectOption('response');
 await page.getByLabel('Request or situation').fill('Reply to a customer asking about delivery.');
 await page.getByLabel('Ideal response',{exact:true}).fill('Thank you for asking. Here is how we confirm the delivery date.');
 await page.getByRole('button',{name:'Add example',exact:true}).click();
 await page.getByRole('button',{name:'Save dataset locally',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Dataset saved'}).waitFor();
 await page.evaluate(()=>{window.trainingApp.unmount();window.mountTraining()});
 await page.locator('.dataset-library article').filter({hasText:'My voice'}).waitFor();
 for(const theme of ['midnight','light']){
 await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 for(const width of [1440,600,375]){await page.setViewportSize({width,height:1000});assert.equal(await page.locator('.bz-train').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>document.documentElement.dataset.theme='midnight');
 await page.locator('.bz-train').evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'/tmp/bonzai-training-datasets.png'});
 await page.getByRole('button',{name:'Use for training',exact:true}).click();
 await page.locator('.bz-train__model-catalog button').click();
 assert.match(await page.locator('.bz-train__review').innerText(),/2 examples/);
 assert.equal(await page.getByRole('button',{name:'Start training',exact:true}).isEnabled(),true);
 assert.deepEqual(posts,[]);
 }finally{await browser.close()}
});
