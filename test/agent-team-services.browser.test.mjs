import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('roleplay offers only member teams and opens their real workflow brief',{skip:!url,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${url}/src/assets/tokens.css`);
 await page.setContent('<html data-theme="amber"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"></head><body style="margin:0;padding:24px;background:var(--bz-canvas);font-family:var(--bz-font-body)"><div id="app"></div></body></html>');
 await page.evaluate(async()=>{
  const team={id:'team',name:'Anime Studio',status:'active',workspace:{executionWorkflowId:'manga-to-anime-v1.0.0'},roles:{CEO:{companion:'agent'}}};
  window.electronAPI={db:{companies:{listIds:async()=>['team','other'],get:async id=>id==='team'?team:{...team,id:'other',name:'Private team',roles:{CEO:{companion:'different-agent'}}}},companions:{list:async()=>[]}},store:{get:async()=>[]}};
  const {createApp}=await import('/node_modules/.vite/deps/vue.js');
  const {default:View}=await import('/src/components/chat/AgentTeamServices.vue');
  const {mangaToAnime}=await import('/src/skills/mediaProduction.js');
  const {createI18nPlugin}=await import('/src/i18n/index.js');
  createApp(View,{agent:{id:'agent',name:'Aurore'},catalog:[mangaToAnime]}).use(createI18nPlugin()).mount('#app');
 });
 await page.getByRole('button',{name:'New customer task'}).waitFor();
 assert.equal(await page.getByText('Private team',{exact:true}).count(),0);
 await page.locator('.agent-team-services').first().screenshot({path:'/tmp/bonzai-agent-workflows.png'});
 await page.setViewportSize({width:480,height:900});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth));
 await page.locator('.agent-team-services').first().screenshot({path:'/tmp/bonzai-agent-workflows-narrow.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='light');
 await page.locator('.agent-team-services').first().screenshot({path:'/tmp/bonzai-agent-workflows-light.png'});
 await page.getByRole('button',{name:'New customer task'}).click();
 await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/Manga Panels/);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
