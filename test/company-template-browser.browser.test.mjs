import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('template browser has useful categories, scrolls independently and keeps setup actions reachable', {skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.setDefaultTimeout(10000); page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg)}*{box-sizing:border-box}</style></head><body><main id="app"></main></body></html>');
  await page.evaluate(async()=>{
   window.electronAPI={store:{get:async()=>[]}};
   const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
   const {skillService}=await import('/src/services/skill.service.js');
   skillService.initializeSkills=async()=>{};skillService.getAllSkills=()=>[
    {id:'meditation-forge-v1.0.0',name:'Meditation Forge',description:'Create a guided meditation with voice and artwork.'},
    {id:'video-captioning-v1.0.0',name:'Video Captioning',description:'Create readable captions for your video.'},
    {id:'mass-chat-v1.0.0',name:'Model comparison',description:'Compare responses from multiple models.'},
    {id:'tcg-analysis-v1.0.0',name:'Card appraisal',description:'Identify a trading card and review its condition.'},
    {id:'custom-sourcing',name:'Supplier research',description:'Compare preferred suppliers.',metadata:{workspaceCategory:'purchasing'}}];
   const {default:Wizard}=await import('/src/components/company/CompanyIntakeWizard.vue');
   // Reuse Vite's exact module URL, including its HMR timestamp, so the
   // fixture and component share the same injected locale instance.
   const componentSource=await (await fetch('/src/components/company/CompanyIntakeWizard.vue')).text();
   const localeUrl=componentSource.match(/from ["']([^"']*\/i18n\/index\.js[^"']*)["']/)?.[1] || '/src/i18n/index.js';
   const {i18n,createI18nPlugin}=await import(localeUrl); i18n.setLocale('en'); window.wizardLocale=i18n;
   createApp({render:()=>h(Wizard)}).use(createI18nPlugin()).mount('#app');
  });
  await page.locator('.workflow-card').first().waitFor();
  await page.waitForFunction(()=>!document.querySelector('.catalog-loading'));
  assert.equal(await page.locator('.template-categories button').count(),15);
  const count=await page.locator('.workflow-card').count();assert.ok(count>20);
  assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
  await page.screenshot({path:'/tmp/bonzai-template-browser-all.png'});
  const scroller=page.locator('.wiz__content'); await scroller.hover(); await page.mouse.wheel(0,2500);
  await page.waitForFunction(()=>document.querySelector('.wiz__content').scrollTop>500);
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0);
  await page.locator('.template-categories button').filter({hasText:'Wellness & audio'}).click();
  assert.equal(await page.locator('.workflow-card').count(),1);
  await page.locator('.workflow-card').click();
  assert.match(await page.locator('.template-selection').innerText(),/meditation/i);
  assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),false);
  await scroller.evaluate(e=>e.scrollTo(0,0));
  await page.screenshot({path:'/tmp/bonzai-template-browser-dark.png'});
  for(const [width,theme,language] of [[1440,'light','fr'],[1024,'dark','en'],[390,'dark','fr']]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(({theme,language})=>{document.documentElement.dataset.theme=theme;window.wizardLocale.setLocale(language);},{theme,language});
   await page.waitForFunction(language=>document.querySelector('.wiz__title')?.textContent===(language==='fr'?'Créer un workflow intelligent':'Create a smart workflow'),language);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   if(language==='fr') assert.match(await page.locator('.template-categories').innerText(),/Bien-être et audio/);
   if(theme==='light') await page.screenshot({path:'/tmp/bonzai-template-browser-light.png'});
   const dims=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,footer:document.querySelector('.wiz__actions').getBoundingClientRect().bottom}));
   assert.ok(dims.width<=dims.viewport,`no horizontal overflow at ${width}`); assert.ok(dims.footer<=900, 'footer stays onscreen');
  }
  await page.screenshot({path:'/tmp/bonzai-template-browser-mobile.png'});
  await page.evaluate(()=>window.wizardLocale.setLocale('en'));
  await page.getByRole('button',{name:'Next',exact:true}).click();
  assert.equal(await scroller.evaluate(e=>e.scrollTop),0,'each setup step starts at the top');
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel('Workspace name (optional)',{exact:true}).fill('Evening meditation');
  await page.getByLabel('Standing instructions (optional)',{exact:true}).fill('A calm ten-minute session for beginners.');
  await page.screenshot({path:'/tmp/bonzai-template-browser-context.png'});
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('heading',{name:'Evening meditation',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:/Open workspace/}).isEnabled(),true);
  await page.screenshot({path:'/tmp/bonzai-template-browser-review.png'});
  await page.getByRole('button',{name:/Back/}).click();
  assert.equal(await page.getByLabel('Workspace name (optional)',{exact:true}).inputValue(),'Evening meditation');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
