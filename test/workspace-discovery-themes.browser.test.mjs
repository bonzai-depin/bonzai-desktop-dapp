import {chromium} from 'playwright';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url=process.env.BONZAI_UI_URL;
test('theme gallery and workflow discovery work at desktop and narrow widths',{skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(url+'/src/assets/tokens.css');
 await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/page-layout.css"><style>*{box-sizing:border-box}body{margin:0;background:var(--bz-canvas);color:var(--bz-fg)}</style><div id="app"></div>');
 const hash=JSON.parse(fs.readFileSync('node_modules/.vite/deps/_metadata.json')).browserHash;
 await page.evaluate(async hash=>{
 window.electronAPI={workspace:{status:async()=>({unlocked:true,bypassed:true})},store:{get:async(k,d)=>d},getSettings:async()=>({})};
 const {createApp}=await import('/node_modules/.vite/deps/vue.js?v='+hash);
 const {createPinia}=await import('/node_modules/.vite/deps/pinia.js?v='+hash);
 const {createI18nPlugin}=await import('/src/i18n/index.js');
 window.mount=async name=>{window.preview?.unmount();const {default:C}=await import('/src/components/'+name+'.vue');window.preview=createApp(C).use(createPinia()).use(createI18nPlugin());window.preview.mount('#app');};
 await window.mount('ThemeGallery');
 },hash);
 await page.waitForSelector('.theme-preview');
 assert.equal(await page.locator('.theme-preview').count(),31);
 const contrastFailures=await page.evaluate(async()=>{
 const {themeService}=await import('/src/services/theme.service.js');
 const probe=document.createElement('button');probe.className='bz-btn bz-btn--primary';probe.textContent='Generate';document.body.append(probe);
 const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 const failures=[];
 for(const theme of themeService.list().filter(t=>t.appearance)){
 themeService.set(theme.id);const style=getComputedStyle(probe);const a=luminance(style.color),b=luminance(style.backgroundColor);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(ratio<4.5)failures.push({theme:theme.id,ratio});
 }
 probe.remove();return failures;
 });
 assert.deepEqual(contrastFailures,[],'new theme primary labels must meet normal-text contrast');
 await page.getByRole('button',{name:/Tokyo Night/}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'tokyo');
 await page.getByRole('searchbox').fill('Petal Silk');
 assert.equal(await page.locator('.theme-preview').count(),1);
 await page.locator('.theme-preview').click();
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'sakura');
 await page.getByRole('searchbox').fill('');
 for(const width of [1440,600,375]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:'/tmp/bonzai-theme-gallery.png'});
 await page.evaluate(async()=>{document.documentElement.dataset.theme='default';await window.mount('company/CompanyWorkspaceAccess');});
 await page.waitForSelector('.workflow-showcase');
 await page.waitForFunction(()=>document.querySelector('.featured-workflows strong')?.textContent.includes('Computerized Maintenance Management System'));
 assert.match(await page.locator('.catalog-list .discovery-item').first().innerText(), /Computerized Maintenance Management System/);
 assert.equal(await page.locator('.access-heading .bz-eyebrow').innerText(), 'AUTOMATE');
 const typography=await page.evaluate(()=>({font:getComputedStyle(document.querySelector('#purchase-title')).fontFamily, weight:getComputedStyle(document.querySelector('#purchase-title')).fontWeight, icon:getComputedStyle(document.querySelector('.bz-title-icon')).fontVariationSettings, wrap:getComputedStyle(document.querySelector('.purchase-price > span')).whiteSpace}));
 assert.match(typography.font,/Fira Sans Condensed/);assert.equal(typography.weight,'900');assert.match(typography.icon,/"wght" 200/);assert.equal(typography.wrap,'nowrap');
 assert.equal(await page.getByText('From a personal meditation to a maintenance operation:',{exact:false}).count(),0);
 for(const width of [1440,600,375]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`workflow overflow at ${width}`);}
 await page.setViewportSize({width:1440,height:1000});
 await page.waitForTimeout(400);
 await page.screenshot({path:'/tmp/bonzai-workflow-discovery.png'});
 await page.evaluate(async()=>{await window.mount('ApplicationActivityBar');const {reportOperation}=await import('/src/stores/activityStore.js');reportOperation({id:'server',title:'Local AI',status:'running',stage:'Starting',source:'server'});reportOperation({id:'queued-test',title:'Video',mode:'video',status:'queued'});reportOperation({id:'done-test',title:'Image',status:'completed'});});
 await page.waitForSelector('.app-activity__startup');
 for(const width of [1440,375]){await page.setViewportSize({width,height:1000});const bounds=await page.evaluate(()=>({chip:document.querySelector('.app-activity__chip').getBoundingClientRect().bottom,bar:document.querySelector('.app-activity__startup').getBoundingClientRect().top,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.ok(bounds.bar>bounds.chip);assert.equal(bounds.overflow,false);}
 await page.locator('.app-activity__overview').click();
 await page.locator('.activity-filters button').filter({hasText:'Queued'}).click();
 assert.equal(await page.locator('.app-activity__item').count(),1);
 assert.equal(await page.locator('.app-activity__item').getAttribute('data-operation-id'),'queued-test');
 await page.getByRole('button',{name:'Clear finished',exact:true}).click();
 await page.locator('.activity-filters button').filter({hasText:'All'}).click();
 assert.equal(await page.locator('[data-operation-id="done-test"]').count(),0);
 assert.equal(await page.locator('[data-operation-id="server"]').count(),1);
 await page.screenshot({path:'/tmp/bonzai-activity-review.png'});
 }finally{await browser.close();}
});
