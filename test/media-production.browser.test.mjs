import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
const styles = ['fonts/fonts', 'tokens', 'themes', 'buttons', 'fields', 'notices'].map(file => `<link rel="stylesheet" href="/src/assets/${file}.css">`).join('');

test('each production wizard creates its dedicated specialist team without business connectors', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
    await page.route('**/src/stores/companyStore.js*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text())+'\ncompanyStore.formFromTemplate=async(...args)=>{window.savedTeams.push(args);return{id:"new-team"};};'});
    });
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent(`${styles}<div id="test"></div>`);
    await page.evaluate(async()=>{
      window.savedTeams=[];
      window.electronAPI={store:{get:async(_key,fallback)=>fallback}};
      const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
      const {createI18nPlugin}=await import('/src/i18n/index.js');
      const {default:Wizard}=await import('/src/components/company/CompanyIntakeWizard.vue');
      window.selectedWorkflow=ref('podcast-studio-v1.0.0');
      createApp({render:()=>h(Wizard,{key:selectedWorkflow.value,initialWorkflowId:selectedWorkflow.value})}).use(createI18nPlugin()).mount('#test');
    });
    const ids=['podcast-studio-v1.0.0','music-video-forge-v1.0.0','manga-to-anime-v1.0.0'];
    for (const [index,id] of ids.entries()) {
      await page.evaluate(id=>{selectedWorkflow.value=id;},id);
      await page.getByLabel('Workspace name (optional)',{exact:true}).fill(`Studio ${index+1}`);
      assert.equal(await page.locator('.connector-section').count(),0);
      await page.getByRole('button',{name:'Next',exact:true}).click();
      assert.ok(await page.locator('.role-preview').innerText().then(text=>text.includes('Video') || text.includes('Audio')));
      await page.locator('.wiz__actions-right button').click();
      await page.waitForFunction(count=>savedTeams.length===count,index+1);
    }
    const teams=await page.evaluate(()=>savedTeams);
    assert.deepEqual(teams.map(args=>args[0]),ids);
    assert.deepEqual(teams.map(args=>args[1].executionWorkflowId),ids);
    assert.ok(teams.every(args=>args[2].demoMode===false&&args[2].initialGoals.length===0));
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});

test('production forms preserve handoff inputs, order manga panels, and queue the exact workflow', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route(/http:\/\/(?:127\.0\.0\.1|localhost):65000\//, route => route.fulfill({ json: { ok: true } }));
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent(`${styles}<style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}</style><div id="test"></div>`);
    await page.evaluate(async () => {
      window.savedTasks = [];
      window.electronAPI = {
        checkModel: async () => true,
        store: { get: async (_key, fallback) => fallback, set: async () => {} },
        mediaProduction: { prepare: async ({ source }) => ({ path: source.startsWith('/') ? source : `/tmp/panel-${source.length}.png` }) },
        companyRuntime: { invoke: async () => {} },
        db: { issues: { create: async (companyId, value) => { savedTasks.push({companyId, ...value}); return { id:'new-task', ...value }; } }, audit: { append: async () => ({ id: 'audit' }) } },
      };
      const { createApp, h, shallowRef } = await import('/node_modules/.vite/deps/vue.js');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      const skills = await import('/src/skills/mediaProduction.js');
      const { default: Modal } = await import('/src/components/company/CompanyWorkflowTask.vue');
      window.skills = skills; window.selectedSkill = shallowRef(skills.podcastStudio);
      window.mounted = createApp({ render: () => h(Modal, {
        key: selectedSkill.value.id, skill: selectedSkill.value, roleKey:'CEO',
        charter:{id:'studio',name:'Creative Studio',roles:{CEO:{companion:'james'}}},
        initialInputs:{brief:'An entire answer worth turning into a finished episode.', soundtrack:selectedSkill.value.id === skills.musicVideoForge.id ? '/tmp/original-song.wav' : undefined},
      }) }).use(createI18nPlugin()).mount('#test');
    });
    for (const skillName of ['podcastStudio','musicVideoForge','mangaToAnime']) {
      await page.evaluate(name => { selectedSkill.value = skills[name]; }, skillName);
      await page.getByRole('heading',{ name: skillName === 'podcastStudio' ? 'Podcast Studio' : skillName === 'musicVideoForge' ? 'Music Video Studio' : 'Anime Studio', exact:true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('.skill-run-actions button')?.disabled);
      assert.equal(await page.locator('.skill-textarea').first().inputValue(), 'An entire answer worth turning into a finished episode.');
      if (skillName !== 'podcastStudio') await page.locator('input[type=checkbox]').last().check();
      if (skillName === 'mangaToAnime') {
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSAAAAAASUVORK5CYII=', 'base64');
        await page.locator('input[type=file]').setInputFiles([{name:'first.png',mimeType:'image/png',buffer:png},{name:'second.png',mimeType:'image/png',buffer:png}]);
        await page.locator('.production-panels img').nth(1).waitFor();
        await page.getByRole('button',{name:'Move panel earlier'}).nth(1).click();
        assert.equal(await page.locator('.production-panels img').count(),2);
      }
      for (const theme of ['default','mistral']) for (const width of [1280,390]) {
        await page.setViewportSize({width,height:900});
        await page.evaluate(theme => { document.documentElement.dataset.theme=theme; }, theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
        const overflow = await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1);
        assert.equal(overflow,false,`${skillName} fits at ${width}`);
        if (width === 1280) {
          await page.getByRole('dialog').evaluate(el => { el.scrollTop = 0; });
          await page.screenshot({path:`/tmp/bonzai-${skillName}-${theme}.png`});
        }
      }
      await page.getByRole('button',{name:'Queue task',exact:true}).click();
      await page.waitForFunction(count => savedTasks.length === count, ['podcastStudio','musicVideoForge','mangaToAnime'].indexOf(skillName)+1);
    }
    const tasks = await page.evaluate(() => savedTasks);
    assert.deepEqual(tasks.map(task => task.execution.steps[0].action.workflowId), ['podcast-studio-v1.0.0','music-video-forge-v1.0.0','manga-to-anime-v1.0.0']);
    assert.equal(tasks[1].execution.steps[0].action.inputs.soundtrack,'/tmp/original-song.wav');
    assert.equal(tasks[2].execution.steps[0].action.inputs.panels.length,2);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});

test('failed production resumes via owner recovery while uncertain outcomes require review', { skip: !url, timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent(`${styles}<div id="test"></div>`);
    await page.evaluate(async () => {
      const { createApp, h, reactive } = await import('/node_modules/.vite/deps/vue.js');
      const { createI18nPlugin } = await import('/src/i18n/index.js');
      const { default: Progress } = await import('/src/components/company/MediaProductionProgress.vue');
      window.task = reactive({id:'production-1',status:'blocked',assigneeRole:'CEO',execution:{steps:[{id:'step',status:'failed',action:{workflowId:'music-video-forge-v1.0.0'}}]}});
      window.calls=[];
      window.electronAPI = {
        store:{get:async()=>({status:'failed',error:'Interrupted',stages:{image:{status:'completed',label:'Illustration'},video:{status:'failed',label:'Animation'}}})},
        db:{issues:{get:async()=>JSON.parse(JSON.stringify(task)),reopen:async(...args)=>{calls.push(['reopen',...args]);return {...task,status:'open'};}},audit:{append:async()=>({})}},
        companyRuntime:{invoke:async(...args)=>{calls.push(['runtime',...args]);}},
      };
      createApp({render:()=>h(Progress,{companyId:'team',workflowId:'music-video-forge-v1.0.0',tasks:[task]})}).use(createI18nPlugin()).mount('#test');
    });
    await page.getByRole('button',{name:'Resume Saved Production',exact:true}).click();
    assert.deepEqual((await page.evaluate(()=>calls))[0],['reopen','team','production-1']);
    await page.evaluate(()=>{task.execution.steps[0].status='unknown';});
    assert.equal(await page.getByRole('button',{name:'Resume Saved Production',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Review Interrupted Task',exact:true}).count(),1);
  } finally { await browser.close(); }
});

test('actual chat and music history expose working production handoffs', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route(/http:\/\/(?:127\.0\.0\.1|localhost):65000\//,r=>r.fulfill({json:{status:'ready',downloaded:false,models:[],pipelines:[],available:false}}));
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent(`${styles}<div id="test"></div>`);
    await page.evaluate(async()=>{
      const {createApp,h,shallowRef}=await import('/node_modules/.vite/deps/vue.js');
      const storeSource=await(await fetch('/src/stores/web3.store.js')).text();
      const {createPinia}=await import(storeSource.match(/from ["']([^"']*pinia[^"']*)["']/)[1]);
      const {createI18nPlugin}=await import('/src/i18n/index.js');
      window.handoffs=[];
      window.addEventListener('bonzai:run-agent-workflow',event=>handoffs.push(event.detail));
      window.view=shallowRef((await import('/src/components/GenerativeText.vue')).default);
      createApp({render:()=>h(view.value,{key:view.value.name,ref:vm=>window.currentView=vm})}).use(createPinia()).use(createI18nPlugin()).mount('#test');
    });
    await page.waitForFunction(()=>currentView?.currentModel);
    await page.evaluate(()=>{
      currentView.loadedModel={...currentView.currentModel};
      currentView.inferences=[{id:'answer-1',question:'A useful idea',answer:{id:'response-1',text:'<think>Private reasoning</think>The finished answer.'},timestamp:1}];
      currentView.selectFromRail(currentView.inferences[0]);
    });
    await page.getByRole('button',{name:'Podcast',exact:true}).click();
    assert.equal((await page.evaluate(()=>handoffs))[0].inputs.brief,'The finished answer.');
    assert.match(await page.getByRole('button',{name:'Tokenize answer',exact:true}).innerText(),/Tokenize/);
    assert.equal(await page.getByRole('button',{name:'Send To Agent',exact:true}).count(),1);
    await page.evaluate(async()=>{view.value=(await import('/src/components/GenerativeAudio.vue')).default;});
    await page.waitForFunction(()=>currentView?.actionsFor);
    await page.evaluate(()=>{
      currentView.includeRoleplay=true;
      currentView.inferences=[{id:'song-1',isMusic:true,songName:'Moonlit River',question:'Quiet piano',musicParams:{lyrics:'Under the stars',duration:40},answer:{data:{audio_path:'/tmp/song.wav'}},timestamp:1}];
    });
    await page.getByRole('button',{name:/Music Video/}).click();
    const music=(await page.evaluate(()=>handoffs)).at(-1);
    assert.equal(music.skillId,'music-video-forge-v1.0.0');
    assert.equal(music.inputs.soundtrack,'/tmp/song.wav');
    assert.equal(music.inputs.brief,'Moonlit River\n\nQuiet piano\n\nUnder the stars');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});

test('chat answers have labeled actions and agent handoff saves the full answer to the selected team', { skip: !url, timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    const page = await browser.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent(`${styles}<style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}#test{padding:24px}</style><div id="test"></div>`);
    await page.evaluate(async () => {
      window.fullAnswer = 'The complete answer. '.repeat(200);
      window.calls=[];
      const teams=[{id:'team-a',name:'Podcast Team',status:'active',roles:{CEO:{companion:'james'}}},{id:'team-b',name:'Research Team',status:'active',roles:{'Producer:text':{companion:'aurore'}}}];
      window.electronAPI={store:{get:async(_key,fallback)=>fallback},companyRuntime:{invoke:async(...args)=>{calls.push({tick:args});}},db:{
        companies:{listIds:async()=>teams.map(t=>t.id),get:async id=>teams.find(t=>t.id===id)},
        companions:{list:async()=>[{id:'james',firstName:'James',familyName:'Whitmore'},{id:'aurore',firstName:'Aurore',familyName:'Martin'}]},
        issues:{create:async(companyId,input)=>{calls.push({companyId,input});return{id:'handoff',...input};}},
        audit:{append:async()=>({id:'audit'})},
      }};
      const {createApp,h,ref}=await import('/node_modules/.vite/deps/vue.js');
      const {createI18nPlugin}=await import('/src/i18n/index.js');
      const {default:Message}=await import('/src/components/chat/ChatMessage.vue');
      const {default:Modal}=await import('/src/components/company/SendToAgentModal.vue');
      window.showHandoff=ref(false);
      createApp({render:()=>h('div',[
        h(Message,{role:'assistant',content:fullAnswer,mintable:true},{actions:()=>h('button',{class:'bz-btn',onClick:()=>showHandoff.value=true},'Send To Agent')}),
        showHandoff.value?h(Modal,{content:'&lt;think&gt;Hidden reasoning&lt;/think&gt;'+fullAnswer,sourceId:'answer-1',onClose:()=>showHandoff.value=false}):null,
      ])}).use(createI18nPlugin()).mount('#test');
    });
    assert.match(await page.getByRole('button',{name:'Tokenize answer',exact:true}).innerText(),/Tokenize/);
    await page.getByRole('button',{name:'Send To Agent',exact:true}).click();
    await page.getByRole('option',{name:/Aurore/}).waitFor({state:'attached'});
    await page.getByRole('combobox').selectOption('team-b:Producer:text');
    for (const width of [1280,390]) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    assert.doesNotMatch(await page.locator('.send-agent-source').innerText(), /think|Hidden reasoning/);
    await page.screenshot({path:'/tmp/bonzai-agent-handoff-mobile.png'});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:'/tmp/bonzai-agent-handoff-desktop.png'});
    await page.getByRole('button',{name:'Send And Start',exact:true}).click();
    const calls=await page.evaluate(()=>calls);
    const saved=calls.find(c=>c.input);
    assert.equal(saved.companyId,'team-b');assert.equal(saved.input.assigneeCompanion,'aurore');
    assert.equal(saved.input.assigneeRole,'Producer:text');
    assert.ok(saved.input.description.includes('The complete answer. '.repeat(200).trim()));
    assert.doesNotMatch(saved.input.description, /Hidden reasoning|think>/);
    assert.deepEqual(calls.find(c=>c.tick).tick,['tickRole',['team-b','Producer:text']]);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});

test('welcome offers every workflow demo and sends the selected template straight to configuration', {skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/services/agentWorkflows.js*',route=>route.fulfill({contentType:'application/javascript',body:'import { flagshipSkills } from "/src/skills/flagship.js"; export async function getAvailableAgentWorkflows(){return flagshipSkills;}'}));
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent(`${styles}<style>body{margin:0;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}</style><div id="test"></div>`);
  await page.evaluate(async()=>{
   window.electronAPI={store:{get:async(_key,fallback)=>fallback}};
   const {createApp,h}=await import('/node_modules/.vite/deps/vue.js');const {createI18nPlugin}=await import('/src/i18n/index.js');const {default:View}=await import('/src/components/company/CompanyWorkspaceAccess.vue');
   createApp({render:()=>h(View,{'onChoose-template':id=>window.chosenTemplate=id})}).use(createI18nPlugin()).mount('#test');
  });
  const demo=page.getByRole('combobox',{name:'Demo workflow',exact:true});await demo.waitFor();
  assert.ok(await demo.locator('option').count()>25);
  assert.equal(await page.getByRole('heading',{name:'Try A Workflow',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Run Demo',exact:true}).count(),1);
  assert.equal(await page.getByText('Run a local rehearsal',{exact:true}).count(),0);
  assert.equal(await page.locator('.business-demo--embedded').evaluate(el=>getComputedStyle(el).padding),'0px');
  await demo.selectOption('music-video-forge-v1.0.0');
  await page.locator('.demo-stage nav button').nth(2).click();
  assert.match(await page.locator('.sample-content').innerText(),/entire song/);
  for(const [width,theme] of [[1280,'default'],[390,'mistral']]){
   await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.locator('.workflow-demo').scrollIntoViewIfNeeded();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`/tmp/bonzai-workflow-demo-${theme}.png`});
  }
  await page.locator('.workflow-demo').getByRole('button',{name:'Use this template',exact:true}).click();
  assert.equal(await page.evaluate(()=>chosenTemplate),'music-video-forge-v1.0.0');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
