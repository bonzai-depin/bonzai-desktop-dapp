import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('media action labels fit across all locales at narrow and desktop widths',{skip:!url},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();
  await page.goto(url+'/src/assets/tokens.css');
  await page.setContent('<link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:16px;background:var(--bz-canvas)}#app{width:100%}*{box-sizing:border-box}</style><div id="app"></div>');
  await page.evaluate(async()=>{
   const source=await fetch('/src/components/generative/GenerativeActions.vue').then(r=>r.text());
   const runtime=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp,ref}=await import(runtime);
   const {default:View}=await import('/src/components/generative/GenerativeActions.vue');
   const {operationText}=await import('/src/i18n/operations.js');
   const locale=ref('fr');window.changeLocale=l=>locale.value=l;
   const app=createApp(View,{actions:[{id:'download',label:'Download',icon:'save'},{id:'mint',label:'Mint token',icon:'token'},{id:'edit',label:'Edit',icon:'edit'},{id:'animate',label:'Animate',icon:'animation'}]});
   app.config.globalProperties.$ui=s=>operationText(s,locale.value);app.mount('#app');
  });
  for(const width of [360,760,1440]) {
   await page.setViewportSize({width,height:800});
   for(const locale of ['en','fr','es','ru','zh','ja','ko']) {
    await page.evaluate(l=>window.changeLocale(l),locale);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r())));
    const fits=await page.locator('.bz-gen-action').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+2));
    assert.ok(fits,`${locale} labels fit at ${width}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  await page.screenshot({path:'/tmp/bonzai-translated-actions.png'});
 } finally {await browser.close();}
});
