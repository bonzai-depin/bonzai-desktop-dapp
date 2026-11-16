import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
async function stubWorkflowCatalog(page) {
  // Route the module, including Vite's HMR query, rather than mutating a second
  // untimestamped singleton that the mounted component may never import.
  await page.route('**/src/services/agentWorkflows.js*', route => route.fulfill({contentType:'application/javascript',body:`
    import { mangaToAnime } from '/src/skills/mediaProduction.js'; const catalog=[mangaToAnime];
    export async function getAvailableAgentWorkflows(){return catalog;}
    export function getAgentWorkflowIds(){return catalog.map(s=>s.id);}
    export function normalizeAssignedWorkflowIds(ids){return ids;}
  `}));
}
test('Anime Studio opens its actual production brief at desktop and narrow widths', {skip: !url,timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await stubWorkflowCatalog(page);
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg)}</style></head><body><div id="app" class="company-screen"></div></body></html>');
  await page.evaluate(async()=>{
   window.electronAPI={store:{get:async()=>[]},db:{companions:{list:async()=>[]}}};
   const {createApp,h,reactive}=await import('/node_modules/.vite/deps/vue.js');
   const {skillService}=await import('/src/services/skill.service.js');
   skillService.initializeSkills=async()=>{};skillService.getAllSkills=()=>[{id:'test-brief',name:'Anime Studio',description:'Prepare a source-backed research brief.',inputs:{topic:{type:'string',label:'Topic',required:true}}}];
   const {default:View}=await import('/src/components/company/CompanyWorkflowStudio.vue');
   const {createI18nPlugin}=await import('/src/i18n/index.js');
   const charter=reactive({id:'test',name:'Research team',workspace:{executionWorkflowId:'manga-to-anime-v1.0.0'},roles:{CEO:{companion:'saved-agent'}}});
   window.fixture={charter,navigation:[]};
   createApp({render:()=>h(View,{charter,state:{issues:[]},onOpenView:view=>window.fixture.navigation.push(view)})}).use(createI18nPlugin()).mount('#app');
  });
  await page.getByRole('heading',{name:'Anime Studio'}).waitFor({timeout:5000}).catch(async error => { throw new Error(`${error.message}\n${await page.locator('body').innerText()}\n${errors.join('\n')}`); });
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('button',{name:'New task',exact:true}).click();
   await page.getByRole('dialog').waitFor({timeout:5000}).catch(async error => { throw new Error(`${error.message}\n${errors.join('\n')}\n${await page.locator('body').innerText()}`); });
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.match(await page.getByRole('dialog').innerText(), /Manga Panels/);
   await page.evaluate(() => document.fonts.ready);
   await page.screenshot({animations:"disabled",path:`/tmp/bonzai-anime-task-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:'Close',exact:true}).click();
  }
  await page.getByRole('button',{name:'Results',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.fixture.navigation),['deliverables']);
  await page.evaluate(()=>{window.fixture.charter.roles={};});
  assert.equal(await page.getByRole('button',{name:'New task',exact:true}).isDisabled(),true);
  await page.screenshot({path:'/tmp/bonzai-workflow-team.png',fullPage:true});
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});

