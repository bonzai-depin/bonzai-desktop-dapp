import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const url = process.env.BONZAI_UI_URL;
test('one labelled navigation, inline owner answers, and preserved team identity across sizes and languages', {skip:!url,timeout:90000}, async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
    await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
    await page.goto(`${url}/src/assets/tokens.css`);
    await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:20px;background:var(--bz-canvas);color:var(--bz-fg);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style></head><body><main id="app"></main></body></html>');
    await page.evaluate(async()=>{
      window.runtimeSnapshot={loaded:1,loading:0,activeRequests:1,activityComplete:true};
      window.electronAPI={localExecutionStatus:async()=>{if(window.runtimeFailure)throw new Error('unavailable');return {...window.runtimeSnapshot,observedAt:Date.now()};},onModelChanged:cb=>{window.runtimeChanged=cb;return ()=>{window.runtimeChanged=null;};},store:{get:async()=>[]},db:{companions:{list:async()=>[]},teams:{list:async()=>[],directory:async()=>[],onChanged:()=>()=>{}},issues:{answerQuestion:async(...args)=>{
        window.fixture.answers.push(args);if(window.fixture.fail)throw new Error('Storage unavailable');window.fixture.state.issues[0].execution.agent.status='running';window.fixture.state.issues[0].status='open';
      }}}};
      const {createApp,h,reactive}=await import('/node_modules/.vite/deps/vue.js');
      const {default:View}=await import('/src/components/company/CompanyDashboard.vue');
      const {default:store}=await import('/src/stores/companyStore.js');
      const {makeCharter}=await import('/src/services/company/charter.js');
      const {i18n,createI18nPlugin}=await import('/src/i18n/index.js');i18n.setLocale('en');
      const charter=reactive(makeCharter({name:'Martin Services',mission:'Prepare quotes and schedule customer visits.',roles:{CEO:{companion:'alex'}}}));
      charter.id='martin';charter.status='paused';
      const state=reactive({...store.state,audit:[{id:'saved-quote',issueId:'quote',ts:Date.now(),kind:'issue',role:'CEO',status:'executed',note:'Saved quote draft for the Lyon workshop.'},{id:'supplier-check',ts:Date.now()-12000,kind:'action',role:'COO',status:'queued',note:'Waiting for supplier confirmation.'}],goals:[],approvals:[],catalog:[],issues:[{id:'quote',title:'Prepare the ventilation quote',assigneeRole:'CEO',status:'blocked',priority:'normal',description:'Confirm the customer site.',execution:{version:1,steps:[],agent:{status:'waiting_owner',wait:{question:'Which site should receive this quote?'}}}}]});
      window.fixture={state,charter,answers:[],fail:true,i18n,saves:[]};store.refreshActive=async()=>{};
      store.update=async next=>{if(window.fixture.saveFailure)throw new Error('Mission storage unavailable');window.fixture.saves.push(next);Object.assign(charter,next);};
      createApp({render:()=>h(View,{charter,state,initialView:'overview'})}).use(createI18nPlugin()).mount('#app');
    });
    const nav=page.getByRole('navigation',{name:'Team workspace'});
    await nav.waitFor();assert.equal(await page.locator('.company-workspace-nav').count(),0);
    const views=await nav.getByRole('button').allTextContents();assert.equal(views.length,11);
    assert.equal(new Set(views.map(t=>t.trim())).size,11);
    assert.equal(await nav.getByRole('combobox').count(),0);
    assert.equal(await page.getByRole('region',{name:'Local execution'}).count(),0,'device details do not clutter the daily cockpit');
    // A daily priority must open its actual task, not an empty completed-results view.
    await page.locator('.company-metric').filter({hasText:'Blocked'}).click();
    assert.equal((await page.locator('.work-status-tabs button[aria-pressed=true]').innerText()).replace(/\s+/g,' '),'Needs attention 1');
    await nav.getByRole('button',{name:'Today',exact:true}).click();
    await page.locator('.today-row').filter({hasText:'Prepare the ventilation quote'}).click();
    await page.locator('[data-issue-id="quote"]').waitFor();
    assert.ok(await page.locator('.team-backlog').isVisible());
    await page.getByLabel('Search work',{exact:true}).fill('missing item');
    assert.equal(await page.locator('.work-todo').count(),0);
    await page.getByRole('button',{name:'Show all work',exact:true}).click();
    assert.equal(await page.getByLabel('Search work',{exact:true}).inputValue(),'');
    await nav.getByRole('button',{name:'Activity',exact:true}).click();
    assert.ok(await page.getByRole('region',{name:'Local execution'}).isVisible());
    const execution=page.getByRole('region',{name:'Local execution'});
    await execution.getByText('1 active request',{exact:true}).waitFor();
    await page.evaluate(()=>{window.runtimeSnapshot.activeRequests=0;});
    await execution.getByText('0 active requests',{exact:true}).waitFor();
    await page.evaluate(()=>{window.runtimeFailure=true;window.runtimeChanged();});
    await execution.getByText('Local execution status unavailable',{exact:true}).waitFor();
    assert.equal(await execution.locator('.bz-metric').count(),0,'failed reads cannot look idle');
    await page.evaluate(()=>{window.runtimeFailure=false;window.runtimeSnapshot={loaded:0,loading:1,activeRequests:0,activityComplete:true};window.runtimeChanged();});
    await execution.getByText('1 loading',{exact:true}).waitFor();
    await page.evaluate(()=>{window.runtimeSnapshot={loaded:1,loading:0,activeRequests:1,activityComplete:false};window.runtimeChanged();});
    await execution.getByText('≥ 1 active request',{exact:true}).waitFor();
    await execution.getByText('Activity partially available',{exact:true}).waitFor();
    await nav.getByRole('button',{name:'Activity',exact:true}).click();
    await page.locator('.live').waitFor();
    const eventButton = page.locator('.live-entry').filter({ hasText: 'Saved quote draft for the Lyon workshop.' }).getByRole('button', { name: /View details/ });
    await eventButton.press('Enter');
    const detail = page.getByRole('dialog');
    await detail.waitFor();
    assert.ok(await detail.getByText('Prepare the ventilation quote', { exact: true }).count());
    assert.ok(await page.locator('.feed-detail-overlay').evaluate(el => el.parentElement === document.body), 'details escape transformed activity containers');
    assert.ok(await detail.evaluate(el => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1; }), 'activity detail stays inside the viewport');
    await page.keyboard.press('Escape');
    await detail.waitFor({ state: 'detached' });
    assert.ok(await eventButton.evaluate(el => el === document.activeElement), 'closing returns keyboard focus to the event');

    // Mission updates only the mandate/instructions; a failed save preserves the draft.
    await nav.getByRole('button',{name:'Mission',exact:true}).click();
    await page.getByLabel('Master mission',{exact:true}).fill('Prepare verified quotes and schedule customer visits within two business days.');
    await page.getByLabel('Standing instructions',{exact:true}).fill('Ask before sending any quote to a customer.');
    await nav.getByRole('button',{name:'Team',exact:true}).click();
    await nav.getByRole('button',{name:'Mission',exact:true}).click();
    assert.match(await page.getByLabel('Master mission',{exact:true}).inputValue(),/verified quotes/);
    await page.evaluate(()=>window.fixture.saveFailure=true);
    await page.getByRole('button',{name:'Save mission',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Mission storage unavailable'}).waitFor();
    assert.match(await page.getByLabel('Master mission',{exact:true}).inputValue(),/verified quotes/);
    await page.evaluate(()=>window.fixture.saveFailure=false);
    await page.getByRole('button',{name:'Save mission',exact:true}).click();
    await page.getByText('Mission saved',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>({role:window.fixture.saves[0].roles.CEO.companion,status:window.fixture.saves[0].status,instructions:window.fixture.saves[0].experience.instructions})),{role:'alex',status:'paused',instructions:'Ask before sending any quote to a customer.'});
    // Categories preserve edits; saving operational policy cannot overwrite the mission or staffing.
    await nav.getByRole('button',{name:'Team settings',exact:true}).click();
    const categories=page.getByRole('navigation',{name:'Team settings categories'});
    await categories.getByRole('button',{name:'Working style',exact:true}).click();
    await page.getByLabel('Team voice',{exact:true}).selectOption('formal');
    await categories.getByRole('button',{name:'Cadence',exact:true}).click();
    await categories.getByRole('button',{name:'Working style',exact:true}).click();
    assert.equal(await page.getByLabel('Team voice',{exact:true}).inputValue(),'formal');
    await page.evaluate(()=>window.fixture.saveFailure=true);
    await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Mission storage unavailable'}).waitFor();
    assert.equal(await page.getByLabel('Team voice',{exact:true}).inputValue(),'formal');
    await page.evaluate(()=>window.fixture.saveFailure=false);
    await page.getByRole('button',{name:'Save settings',exact:true}).click();
    await page.getByText('Settings saved',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>{const c=window.fixture.saves.at(-1);return{role:c.roles.CEO.companion,mission:c.mission,instructions:c.experience.instructions,tone:c.experience.tone};}),{role:'alex',mission:'Prepare verified quotes and schedule customer visits within two business days.',instructions:'Ask before sending any quote to a customer.',tone:'formal'});
    await categories.getByRole('button',{name:'Team identity',exact:true}).click();
    await nav.getByRole('button',{name:'Tools',exact:true}).click();
    await page.getByLabel('Search tools',{exact:true}).fill('Stripe');
    assert.equal(await page.locator('.conn-catalog__tile').count(),1);
    await page.getByLabel('Search tools',{exact:true}).fill('not-a-real-tool');
    await page.getByText('No tools match your search.',{exact:true}).waitFor();
    await page.getByLabel('Search tools',{exact:true}).fill('');
    assert.equal(await page.locator('.finance-records').count(),0,'finance records require a connected provider');
    await page.evaluate(()=>window.fixture.state.catalog.push({id:'quote-report',pipeline:'text',role:'CEO',createdAt:Date.now(),price:0,sales:0,revenue:0,payload:'# Lyon workshop — site assessment\n\nThe ventilation inspection is scheduled for Thursday at 14:00.\n\n- Inspect the intake filters.\n- Record air flow at each outlet.\n- Attach measurements before preparing the quote.',prompt:'Prepare the inspection brief for the Lyon workshop.'}));
    for(const theme of ['default','light'])for(const width of [1440,800,390]){
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});
      for(const view of ['Team','Mission','Backlog','Activity','Tools','Team settings','Results']) {
        await nav.getByRole('button',{name:view,exact:true}).click();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view} ${theme}/${width} has no page overflow`);
        if(view==='Activity')assert.ok(await page.locator('.live-entry__body').first().evaluate(el=>el.getBoundingClientRect().width>180), 'Activity remains a readable timeline, not a narrow auto-placed grid column');
        await page.screenshot({path:`/tmp/bonzai-team-${view}-${theme}-${width}.png`,fullPage:false,animations:'disabled'});
      }
    }
    await page.locator('.company-modes').getByRole('button',{name:/Creations & files/}).click();
    await page.locator('.deliverable-preview').waitFor();
    assert.equal(await page.locator('.operational-files').count(),0);
    assert.equal(await page.locator('.deliverable-preview__metrics').count(),0,'local business reports do not display empty sales metrics');
    await page.setViewportSize({width:1440,height:1000});
    await nav.getByRole('button',{name:'Activity',exact:true}).click();
    await page.getByLabel('Filter by member',{exact:true}).selectOption('COO');
    await page.waitForFunction(()=>document.querySelectorAll('.live-entry').length===1);
    await page.getByLabel('Filter by member',{exact:true}).selectOption('');
    await page.waitForFunction(()=>document.querySelectorAll('.live-entry').length===2);
    await nav.getByRole('button',{name:'Chat',exact:true}).click();
    await page.getByLabel('Which site should receive this quote?').fill('The Lyon workshop, building B.');
    await page.getByRole('button',{name:'Send answer',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Storage unavailable'}).waitFor();
    assert.equal(await page.getByLabel('Which site should receive this quote?').inputValue(),'The Lyon workshop, building B.');
    for(const theme of ['default','light'])for(const width of [1440,800,390]){
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});
      assert.ok(await nav.isVisible());
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${width} has no page overflow`);
      assert.ok(await page.getByRole('button',{name:'Send answer',exact:true}).isVisible());
      await page.screenshot({path:`/tmp/bonzai-native-${theme}-${width}.png`,fullPage:false,animations:'disabled'});
    }
    await page.evaluate(()=>window.fixture.i18n.setLocale('fr'));
    await page.getByRole('button',{name:'Envoyer la réponse',exact:true}).waitFor().catch(async e=>{throw new Error(e.message+' '+JSON.stringify({errors,buttons:await page.locator('.company-question button').allTextContents(),locale:await page.evaluate(()=>window.fixture.i18n.state.locale)}));});
    assert.ok(await page.getByRole('navigation',{name:'Espace de l’équipe'}).isVisible());
    await page.evaluate(()=>{window.fixture.fail=false;});
    await page.getByRole('button',{name:'Envoyer la réponse',exact:true}).click();
    await page.locator('.company-question').waitFor({state:'detached'});
    assert.deepEqual(await page.evaluate(()=>window.fixture.answers.at(-1)),['martin','quote','The Lyon workshop, building B.']);
    await page.getByRole('navigation').getByRole('button',{name:'À faire',exact:true}).click();
    await page.locator('.work-todo').first().waitFor();
    await page.locator('.work-todo .workflow-progress').first().waitFor();
    await page.getByRole('navigation',{name:'Espace de l’équipe'}).getByRole('button',{name:'Équipe',exact:true}).click();await page.locator('.org-card').first().waitFor();
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('the actual background entry boots without a visible view and handles supervised commands',{skip:!url,timeout:90000},async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
    await page.addInitScript(()=>{
      window.results=[];window.streams=[];
      window.electronAPI={workspace:{status:async()=>({unlocked:true})},companyRuntime:{ready:error=>window.runtimeReady={error},onCommand:cb=>window.command=cb,result:value=>window.results.push(value),stream:value=>window.streams.push(value)},db:{companies:{list:async()=>[],listIds:async()=>[],onChanged:()=>{}},issues:{onChanged:()=>{}}},store:{get:async()=>[]}};
    });
    await page.goto(`${url}/company-runtime.html`);
    await page.waitForFunction(()=>window.runtimeReady,{timeout:60000});
    assert.deepEqual(await page.evaluate(()=>window.runtimeReady),{error:undefined});
    assert.equal(await page.locator('body').innerText(),'');
    await page.evaluate(()=>window.command({requestId:'boot-check',name:'boot',args:[]}));
    assert.deepEqual(await page.evaluate(()=>window.results[0]),{requestId:'boot-check',value:[]});
    await page.evaluate(()=>window.command({requestId:'invalid',name:'arbitrary',args:[]}));
    assert.match((await page.evaluate(()=>window.results[1])).error,/Unknown/);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
