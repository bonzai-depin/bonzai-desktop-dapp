import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
async function stubWorkflowCatalog(page) {
  // Route the module, including Vite's HMR query, rather than mutating a second
  // untimestamped singleton that the mounted component may never import.
  await page.route('**/src/services/agentWorkflows.js*', route => route.fulfill({contentType:'application/javascript',body:`
    const catalog=[{id:'test-brief',name:'Research studio',description:'Prepare a source-backed research brief.',inputs:{topic:{type:'string',label:'Topic',required:true}}}];
    export async function getAvailableAgentWorkflows(){return catalog;}
    export function getAgentWorkflowIds(){return catalog.map(s=>s.id);}
    export function normalizeAssignedWorkflowIds(ids){return ids;}
  `}));
}
test('production view keeps worker, task and results usable at desktop and narrow widths', {skip: !url,timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await stubWorkflowCatalog(page);
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bz-canvas);color:var(--bz-fg)}</style></head><body><div id="app" class="company-screen"></div></body></html>');
  await page.evaluate(async()=>{
   window.electronAPI={store:{get:async()=>[]},db:{companions:{list:async()=>[]}}};
   const {createApp,h,reactive}=await import('/node_modules/.vite/deps/vue.js');
   const {skillService}=await import('/src/services/skill.service.js');
   skillService.initializeSkills=async()=>{};skillService.getAllSkills=()=>[{id:'test-brief',name:'Research studio',description:'Prepare a source-backed research brief.',inputs:{topic:{type:'string',label:'Topic',required:true}}}];
   const {default:View}=await import('/src/components/company/CompanyWorkflowStudio.vue');
   const {createI18nPlugin}=await import('/src/i18n/index.js');
   const charter=reactive({id:'test',name:'Research team',workspace:{executionWorkflowId:'test-brief'},roles:{CEO:{companion:'saved-agent'}}});
   window.fixture={charter,navigation:[]};
   createApp({render:()=>h(View,{charter,state:{issues:[]},onOpenView:view=>window.fixture.navigation.push(view)})}).use(createI18nPlugin()).mount('#app');
  });
  await page.getByRole('heading',{name:'Research studio'}).waitFor({timeout:5000}).catch(async error => { throw new Error(`${error.message}\n${await page.locator('body').innerText()}\n${errors.join('\n')}`); });
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.getByRole('button',{name:'New task',exact:true}).click();
   await page.getByRole('dialog').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
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

test('workflow setup forms a production team without sample tasks or unrelated connector requirements', {skip: !url,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await stubWorkflowCatalog(page);
  await page.route('**/src/stores/companyStore.js*', async route => {
   const response=await route.fetch();
   await route.fulfill({response,body:(await response.text())+'\ncompanyStore.formFromTemplate=async(...args)=>{window.savedTeam=args;return {id:"new-team"};};'});
  });
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<div id="app"></div>');
  await page.evaluate(async()=>{
   window.electronAPI={store:{get:async()=>[]}};
   const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');
   const {skillService}=await import('/src/services/skill.service.js');
   skillService.initializeSkills=async()=>{};skillService.getAllSkills=()=>[{id:'test-brief',name:'Research studio',description:'Research and source review.'},{id:'roleplay-companion-v1.0.0',name:'Roleplay'}];
   const {default:store}=await import('/src/stores/companyStore.js');
   store.formFromTemplate=async(...args)=>{window.savedTeam=args;return {id:'new-team'};};
   const {default:View}=await import('/src/components/company/CompanyIntakeWizard.vue');
   const {createI18nPlugin}=await import('/src/i18n/index.js');
   createApp({render:()=>h(View,{initialWorkflowId:'test-brief',onDone:id=>window.createdId=id})}).use(createI18nPlugin()).mount('#app');
  });
  await page.getByLabel('Workspace name (optional)',{exact:true}).fill('Research');
  assert.equal(await page.locator('.connector-section').count(),0);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  assert.equal(await page.locator('.demo-row').count(),0);
  await page.locator('.wiz__actions-right button').click();
  await page.waitForFunction(()=>window.createdId==='new-team', null, {timeout:5000}).catch(async error => { throw new Error(`${error.message}\n${await page.locator('body').innerText()}`); });
  const [template,answers,overrides]=await page.evaluate(()=>window.savedTeam);
  assert.equal(template,'business_ops_team');
  assert.equal(answers.executionWorkflowId,'test-brief');
  assert.equal(answers.businessType,'Research studio');
  assert.equal(overrides.demoMode,false);
  assert.deepEqual(overrides.initialGoals,[]);
 }finally{await browser.close();}
});
