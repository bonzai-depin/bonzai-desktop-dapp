import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;

test('GMAO daily navigation opens Today, Schedule and Clients directly and keeps one Inbox',{skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:20px;background:var(--bz-canvas);color:var(--bz-fg);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style></head><body><main id="app"></main></body></html>');
  await page.evaluate(async()=>{
   window.feed={threads:[],replies:[],fail:true,changed:()=>{}};
   window.electronAPI={localExecutionStatus:async()=>({observedAt:Date.now(),loaded:1,loading:0,activeRequests:1,activityComplete:true}),store:{get:async()=>[]},db:{companions:{list:async()=>[]},teams:{list:async()=>structuredClone(window.feed.threads),directory:async()=>[],onChanged:fn=>{window.feed.changed=fn;return()=>{window.feed.changed=()=>{}}},reply:async(id,input)=>{if(window.feed.fail)throw new Error('Reply not saved');window.feed.replies.push({id,input});window.feed.threads[0].messages.push({id:'reply',company_id:id,team_name:'Martin HVAC',author_role:'owner',body:input.body,created_at:Date.now()});}}}};
   const viewSource=await fetch('/src/components/company/CompanyDashboard.vue').then(response=>response.text());
   const vueModule=viewSource.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)?.[1];
   if(!vueModule)throw new Error('Cannot resolve the preview Vue runtime');
   const {createApp,h,reactive,ref}=await import(vueModule);
   const {default:View}=await import('/src/components/company/CompanyDashboard.vue');
   const {default:store}=await import('/src/stores/companyStore.js');
   const {makeCharter}=await import('/src/services/company/charter.js');
   const {buildWorkspaceBlueprint}=await import('/src/services/company/workspaceBlueprints.js');
   const localeModule=viewSource.match(/from ["']([^"']*\/i18n\/index\.js(?:\?[^"']*)?)["']/)?.[1] || '/src/i18n/index.js';
   const {i18n,createI18nPlugin}=await import(localeModule);i18n.setLocale('en');
   const charter=makeCharter({name:'Martin HVAC',mission:'Schedule maintenance and prepare quotes.',roles:{CEO:{companion:'alex'}}});
   charter.id='hvac';charter.status='paused';charter.workspace=buildWorkspaceBlueprint({templateId:'hvac_residential'});
   const state=reactive({...store.state,audit:[],goals:[],issues:[],catalog:[],approvals:[{id:'approve1',role:'CEO',requestedBy:'Alex · Martin HVAC',action:{type:'email.send',to:'customer@example.invalid',subject:'Site visit confirmation',body:'Visit proposed on Thursday.'}}],gmao:{
    clients:[{id:'client-a',name:'Ateliers Martin'},{id:'client-b',name:'Maison des Orangers'}],sites:[],workOrders:[],serviceContracts:[],plans:[],procurements:[],quotes:[],invoices:[],documents:[],events:[],notifications:[],handoffs:[],assets:[],attachmentSheets:[],suppliers:[],
    documentIntake:[{id:'doc1',originalName:'Customer quote.pdf',documentType:'quote',status:'to_review',suggestedFields:{},extractedText:'Quote awaiting validation.'}],
    outbox:[{id:'draft1',subject:'Review this message',recipient:'customer@example.invalid',body:'Proposed visit.',channel:'email',status:'draft'}, {id:'sent1',subject:'Previously sent message',recipient:'customer@example.invalid',channel:'email',status:'delivered'}],
   }});
   const visitAt=new Date();visitAt.setHours(14,0,0,0);
   Object.assign(state.gmao,{
    sites:[{id:'site-a',clientId:'client-a',name:'Lyon workshop',active:true},{id:'site-b',clientId:'client-b',name:'Reception building',active:true}],
    assets:[{id:'asset-a',siteId:'site-a',assetCode:'CTA-001',equipmentType:'Air handling unit',brand:'Daikin',modelReference:'AHU-600',technicalSection:'ST1',condition:'2',criticality:'P2'}, {id:'asset-b',siteId:'site-b',assetCode:'PAC-002',equipmentType:'Heat pump · customer reception and meeting rooms',brand:'Mitsubishi',modelReference:'City Multi',technicalSection:'ST1',condition:'1',criticality:'P2'}],
    workOrders:[{id:'wo-a',siteId:'site-b',workOrderNumber:'OT-2026-041',title:'Reception ventilation inspection',status:'assigned',priority:'P2',type:'preventive',assigneeHuman:'Lucas Bernard',scheduledAt:visitAt.getTime(),durationMinutes:90,reportedAt:Date.now()}],
    plans:[{id:'plan-a',name:'Air handling unit inspection',technicalSection:'ST1',periodicityMonths:6,nextDueAt:visitAt.getTime(),active:true}],
    rates:[{id:'rate-a',label:'Standard labour',rateType:'labor',technicalSection:'ST1',valueCents:6500,vatRate:20}],
    suppliers:[{id:'supplier-a',name:'Froid Service',email:'orders@example.invalid',phone:'+33 6 00 00 00 00'}],
   });
   store.refreshActive=async()=>{};store.approve=async id=>{if(window.fixture.approvalFailure)throw new Error('Approval could not be saved');window.fixture.approved.push(id);state.approvals=state.approvals.filter(item=>item.id!==id);};
   const target=ref('');
   window.fixture={state,i18n,approved:[],rejected:[],target};
   store.reject=async(id,reason)=>{if(window.fixture.rejectFailure)throw new Error('Rejection could not be saved');window.fixture.rejected.push({id,reason});state.approvals=state.approvals.filter(item=>item.id!==id);};
   const dashboard=ref(null);
   createApp({render:()=>h(View,{ref:dashboard,charter,state,initialView:target.value})}).use(createI18nPlugin()).mount('#app');
   // Vite can timestamp the component's store import after HMR. Stub the
   // instance actually used by the fixture, never the live application's IPC.
   Object.assign(dashboard.value.store,{refreshActive:store.refreshActive,approve:store.approve,reject:store.reject});
  });
  const nav=page.getByRole('navigation',{name:'Team workspace'});
  await nav.waitFor();assert.equal(await nav.getByRole('button').count(),17);
  await nav.getByRole('button',{name:'Getting started',exact:true}).waitFor();
  await nav.getByRole('button',{name:'Today',exact:true}).click();
  assert.equal(await page.getByRole('heading',{name:'Today',exact:true}).count(),1,'Today opens the operational cockpit');
  assert.equal(await nav.getByRole('button',{name:'Today',exact:true}).getAttribute('aria-current'),'page');
  for (const label of ['Operations settings','Team settings']) {
    const button = nav.getByRole('button', { name: label, exact: true });
    assert.equal((await button.innerText()).trim(), 'settings', 'settings uses a cogwheel with an accessible label');
    assert.equal(await button.getAttribute('aria-label'), label);
  }
  const teamCommands = page.locator('.company-view-nav__team');
  assert.equal(await teamCommands.locator('button > span:not(.material-symbols-outlined)').count(), 1);
  assert.equal((await teamCommands.locator('button > span:not(.material-symbols-outlined)').innerText()).trim(), 'Team');
  for (const label of ['Mission','Backlog','Chat','Activity','Tools','Team settings']) {
    assert.equal(await teamCommands.getByRole('button', { name: label, exact: true }).getAttribute('aria-label'), label);
  }
  for (const locale of ['en','fr']) for (const width of [1793,1280,800,390]) {
    await page.evaluate(locale => window.fixture.i18n.setLocale(locale), locale);
    await page.setViewportSize({ width, height: 1000 });
    for (const group of ['.company-view-nav__operations','.company-view-nav__team']) {
      const bounds = await page.locator(group + ' > button').evaluateAll(buttons => buttons.map(button => { const rect = button.getBoundingClientRect(); return { label: button.getAttribute('aria-label') || button.textContent, top: rect.top, height: rect.height }; }));
      const tops = bounds.map(rect => Math.round(rect.top));
      assert.equal(new Set(tops).size, 1, `${locale}/${width}: each navigation group occupies one stable row: ${JSON.stringify(bounds)}`);
    }
    assert.equal(await page.locator('.company-view-nav__team').evaluate(el=>getComputedStyle(el).position),'fixed','team command dock stays available at the bottom');
    const padding = await page.locator('.ops-metrics > button').evaluateAll(buttons => buttons.map(button => { const css = getComputedStyle(button); return [css.paddingTop,css.paddingRight,css.paddingBottom,css.paddingLeft].map(parseFloat); }));
    assert.ok(padding.flat().every(value => value >= 16), `${locale}/${width}: metric navigation has padding on every edge`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'translations never widen the page');
  }
  await page.evaluate(() => window.fixture.i18n.setLocale('en'));
  await page.setViewportSize({ width: 1440, height: 1000 });

  assert.equal(await page.getByRole('navigation',{name:'Maintenance navigation'}).count(),0,'no nested daily navigation');
  assert.equal(await page.getByRole('button',{name:'Maintenance',exact:true}).count(),0);
  await page.getByLabel('Filter by client',{exact:true}).selectOption('client-a');
  await nav.getByRole('button',{name:'Schedule',exact:true}).click();
  await page.locator('.ops-month').waitFor();
  assert.equal(await page.getByLabel('Filter by client',{exact:true}).inputValue(),'client-a');
  await nav.getByRole('button',{name:'Clients',exact:true}).click();
  await page.getByRole('heading',{name:'Clients',exact:true}).waitFor();
  assert.equal(await page.locator('.ops-client').count(),2,'client directory stays complete while a cockpit is scoped');
  await page.locator('.ops-client').filter({hasText:'Maison des Orangers'}).getByRole('button',{name:'Open dashboard',exact:true}).click();
  await page.getByRole('heading',{name:'Today',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Filter by client',{exact:true}).inputValue(),'client-b');
  await nav.getByRole('button',{name:'Work orders',exact:true}).click();
  await page.getByRole('heading',{name:'Work orders',exact:true}).waitFor();
  await nav.getByRole('button',{name:'Parts requests',exact:true}).click();
  assert.equal(await nav.getByRole('button',{name:'Parts requests',exact:true}).getAttribute('aria-current'),'page');
  await nav.getByRole('button',{name:'Today',exact:true}).click();
  // The cockpit's old messages link now opens the same Inbox, not a hidden tab.
  await page.locator('.ops-summary').filter({hasText:'Message drafts'}).click();
  await page.getByRole('heading',{name:'Inbox',exact:true}).waitFor();
  await page.getByRole('complementary',{name:'Review queue'}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Maintenance navigation'}).count(),0);
  await page.getByLabel('Filter inbox',{exact:true}).waitFor();
  assert.ok(await page.locator('.inbox-item').getByText('Customer quote.pdf',{exact:true}).isVisible());
  assert.equal(await page.getByText('Previously sent message',{exact:true}).count(),0);
  assert.equal(await nav.locator('.bz-metric').innerText(),'3');
  const historyToggle = page.getByRole('switch',{name:'Show sent messages',exact:true});
  await historyToggle.focus();
  await page.keyboard.press('Space');
  assert.ok(await historyToggle.isChecked(), 'history toggle works from the keyboard');
  await page.getByText('Previously sent message',{exact:true}).waitFor();
  await page.evaluate(()=>window.fixture.approvalFailure=true);
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Approval could not be saved'}).waitFor();
  assert.equal(await nav.locator('.bz-metric').innerText(),'3','failed approval stays in the queue');
  await page.evaluate(()=>window.fixture.approvalFailure=false);
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.fixture.approved),['approve1']);
  assert.equal(await nav.locator('.bz-metric').innerText(),'2');
  assert.ok(await page.locator('.inbox-item').getByText('Customer quote.pdf',{exact:true}).isVisible(),'approving an action does not clear document review');
  await page.locator('.inbox-item').filter({hasText:'Customer quote.pdf'}).click();
  await page.getByRole('button',{name:'Review document',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByLabel('Close',{exact:true}).click();
  await page.locator('.inbox-item').filter({hasText:'Review this message'}).click();
  await page.getByRole('button',{name:'Open message',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByLabel('Close',{exact:true}).click();
  await page.evaluate(()=>{window.fixture.state.approvals.push({id:'reject2',role:'CEO',action:{type:'email.send',subject:'Incorrect quote'}});window.fixture.rejectFailure=true;});
  await page.locator('.inbox-item').filter({hasText:'Incorrect quote'}).click();
  await page.getByRole('button',{name:'Reject',exact:true}).click();
  await page.getByLabel('Reason for rejection (optional)',{exact:true}).fill('The client address must be corrected.');
  await page.getByRole('button',{name:'Confirm rejection',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Rejection could not be saved'}).waitFor();
  assert.equal(await page.getByLabel('Reason for rejection (optional)',{exact:true}).inputValue(),'The client address must be corrected.');
  await page.evaluate(()=>window.fixture.rejectFailure=false);
  await page.getByRole('button',{name:'Confirm rejection',exact:true}).click();
  await page.waitForFunction(()=>window.fixture.rejected.length===1);
  assert.deepEqual(await page.evaluate(()=>window.fixture.rejected[0]),{id:'reject2',reason:'The client address must be corrected.'});
  await page.getByLabel('Search inbox',{exact:true}).fill('missing-record');
  assert.equal(await page.locator('.inbox-item').count(),0);
  assert.equal(await page.getByText('No matching items.',{exact:true}).count(),1,'filtered empty state is shown once');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByLabel('Filter inbox',{exact:true}).selectOption('document');
  assert.equal(await page.locator('.inbox-item').count(),1);
  await page.getByLabel('Filter inbox',{exact:true}).selectOption('all');
  await page.locator('.inbox-item').filter({hasText:'Review this message'}).click();
  for(const theme of ['default','light'])for(const width of [1440,800,390]) {
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${width}: no horizontal overflow`);
   await page.locator('.inbox-item').filter({hasText:'Customer quote.pdf'}).scrollIntoViewIfNeeded();
   assert.ok(await page.locator('.inbox-item').getByText('Customer quote.pdf',{exact:true}).isVisible());
   await page.evaluate(()=>{for(const node of document.querySelectorAll('*'))if(node.scrollTop)node.scrollTop=0;window.scrollTo(0,0);});
   await page.screenshot({path:`/tmp/bonzai-inbox-${theme}-${width}.png`,fullPage:false,animations:'disabled'});
   for (const destination of ['Today','Schedule','Work orders','Clients']) {
    await nav.getByRole('button',{name:destination,exact:true}).click();
    await page.getByRole('heading',{name:destination,exact:true}).waitFor();
    assert.equal(await page.locator('.ops-nav').count(),0);
    if(destination==='Schedule' && width===390)for(const filter of await page.locator('.ops-toolbar > select').all())assert.ok((await filter.boundingBox()).width>=160,'schedule filters remain readable');
    if(destination==='Schedule' && width===1440){
     assert.ok(await page.getByText('Intervention in progress',{exact:true}).isVisible());
     const contrast=await page.locator('.ops-calendar-event').first().evaluate(button=>{
      const luminance=color=>{const [r,g,b]=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
      const background=luminance(getComputedStyle(button).backgroundColor);
      return Math.min(...[...button.children].map(child=>{const foreground=luminance(getComputedStyle(child).color);return(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);}));
     });
     assert.ok(contrast>=4.5,`Calendar event text ${theme}: contrast ${contrast}`);
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${destination}/${theme}/${width}: no horizontal overflow`);
    await page.screenshot({path:`/tmp/bonzai-daily-${destination.replaceAll(' ','-')}-${theme}-${width}.png`,fullPage:false,animations:'disabled'});
   }
   await nav.getByRole('button',{name:/Inbox/}).click();
   await page.getByRole('switch',{name:'Show sent messages',exact:true}).check();
  }
  await page.evaluate(() => {
   const {state} = window.fixture;
   window.fixture.reviewSnapshot = { approvals: state.approvals, documentIntake: state.gmao.documentIntake, outbox: state.gmao.outbox, notifications: state.gmao.notifications };
   state.approvals = []; state.gmao.documentIntake = []; state.gmao.outbox = []; state.gmao.notifications = [];
  });
  await page.getByRole('heading',{name:'Nothing awaiting review.',exact:true}).waitFor();
  assert.equal(await page.getByText('Nothing awaiting review.',{exact:true}).count(),1,'empty Inbox has a single message');
  assert.equal(await page.getByRole('switch',{name:'Show sent messages',exact:true}).count(),0,'no history filter when the Inbox has no records');
  await page.evaluate(() => {
   const {state,reviewSnapshot} = window.fixture;
   state.approvals = reviewSnapshot.approvals;
   Object.assign(state.gmao, { documentIntake: reviewSnapshot.documentIntake, outbox: reviewSnapshot.outbox, notifications: reviewSnapshot.notifications });
  });
  await page.getByRole('switch',{name:'Show sent messages',exact:true}).uncheck();
  await page.evaluate(()=>window.fixture.i18n.setLocale('fr'));
  await page.getByRole('heading',{name:'À traiter',exact:true}).waitFor();
  await page.getByLabel('Filtrer la boîte de réception',{exact:true}).waitFor();
  await page.getByRole('navigation',{name:'Espace de l’équipe'}).getByRole('button',{name:'Aujourd’hui',exact:true}).click();
  await page.getByRole('heading',{name:'Aujourd’hui',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Filtrer par client',{exact:true}).inputValue(),'client-b','client context survives Inbox and back');
  assert.equal(await page.getByRole('navigation',{name:'Navigation maintenance'}).count(),0);
  await page.screenshot({path:'/tmp/bonzai-maintenance-fr-mobile.png',fullPage:false,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'/tmp/bonzai-maintenance-fr-desktop.png',fullPage:false,animations:'disabled'});
  await page.evaluate(()=>{window.fixture.i18n.setLocale('en');window.fixture.target.value='preventive';});
  await page.getByRole('heading',{name:'Schedule',exact:true}).waitFor();
  await page.evaluate(()=>{window.fixture.target.value='deliverables';});
  await page.getByRole('heading',{name:'Results',exact:true}).first().waitFor();
  await nav.getByRole('button',{name:'Today',exact:true}).click();
  await nav.getByRole('button',{name:'Chat',exact:true}).click();
  await page.getByRole('heading',{name:'Chat',exact:true}).waitFor();
  await page.evaluate(()=>{
   window.feed.threads=[{id:'shared',subject:'Drive belt sourcing',source_team_name:'Martin HVAC',target_team_name:'Martin Purchasing',messages:[
    ...Array.from({length:55},(_,i)=>({id:'old-'+i,company_id:'purchasing',team_name:'Martin Purchasing',author_name:'Alex',author_role:'CEO',body:'Earlier supplier message '+i,created_at:100+i})),
    {id:'supplier',company_id:'purchasing',team_name:'Martin Purchasing',author_name:'Alex',author_role:'CEO',body:'<think>secret planning</think>Belt delivery proposed for Thursday.',created_at:Date.now()}
   ]}];
   window.fixture.state.audit=[{id:'duplicate',action:'team.message',note:'Duplicate should not appear',extra:{teamMessage:window.feed.threads[0].messages.at(-1)}}];
   window.feed.changed();
  });
  const supplier=page.locator('.goal-message').filter({hasText:'Belt delivery proposed for Thursday.'});
  await supplier.waitFor();assert.match(await supplier.innerText(),/Alex.*Martin Purchasing/s);
  assert.doesNotMatch(await page.locator('body').innerText(),/secret planning|<think>|Duplicate should not appear/);
  await page.getByRole('button',{name:'Earlier messages',exact:true}).click();
  await page.getByText('Earlier supplier message 0',{exact:true}).waitFor();
  await supplier.getByRole('button',{name:'Reply',exact:true}).click();
  const composer=page.getByLabel('Describe a business goal');
  await composer.fill('Use the Thursday delivery.');
  await page.getByRole('button',{name:'Send reply',exact:true}).click();
  await page.getByText('Reply not saved',{exact:true}).waitFor();
  assert.equal(await composer.inputValue(),'Use the Thursday delivery.','failed reply retains the draft and target');
  await page.evaluate(()=>window.feed.fail=false);
  await page.getByRole('button',{name:'Send reply',exact:true}).click();
  await page.getByText('Use the Thursday delivery.',{exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.feed.replies)).length,1);
  for(const theme of ['default','light'])for(const width of [1440,800,390]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Requests ${theme}/${width}`);
   await page.screenshot({path:`/tmp/bonzai-requests-${theme}-${width}.png`,fullPage:false,animations:'disabled'});
  }
  await page.setViewportSize({width:1440,height:1000});
  await nav.getByRole('button',{name:'Operations settings',exact:true}).click();
  await page.getByRole('heading',{name:'Operations settings',exact:true}).waitFor();
  assert.equal(await nav.getByRole('button',{name:'Operations settings',exact:true}).getAttribute('aria-current'),'page');
  assert.equal(await page.locator('.company-context-nav').count(),0);
  assert.equal(await page.locator('.settings-heading').count(),0);
  const settingsNav=page.locator('.maintenance-settings .company-settings-nav');
  for(const theme of ['default','light'])for(const width of [1440,800,390]){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});
   await settingsNav.getByRole('button',{name:/Equipment/}).click();
   assert.equal(await page.locator('.settings-row').count(),2);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Operations settings ${theme}/${width}`);
   await page.screenshot({path:`/tmp/bonzai-operations-settings-${theme}-${width}.png`,fullPage:false,animations:'disabled'});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel('Search settings',{exact:true}).fill('CTA-001');
  assert.equal(await page.locator('.settings-row').count(),1);
  await page.locator('.settings-row').click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByLabel('Close',{exact:true}).click();
  await page.getByLabel('Search settings',{exact:true}).fill('');
  for(const category of ['Preventive','Access and compliance','On-call shifts','Rates','Suppliers','Subcontractors']){
   await settingsNav.getByRole('button',{name:new RegExp(category)}).click();
   await page.getByRole('heading',{name:category,exact:true}).waitFor();
  }
  await page.evaluate(()=>window.fixture.i18n.setLocale('fr'));
  await page.getByRole('heading',{name:'Sous-traitants',exact:true}).waitFor();
  await page.evaluate(()=>window.fixture.i18n.setLocale('en'));
  await nav.getByRole('button',{name:'Tools',exact:true}).click();
  assert.equal(await nav.getByRole('button',{name:'Tools',exact:true}).getAttribute('aria-current'),'page');
  assert.equal(await nav.getByRole('button',{name:'Operations settings',exact:true}).getAttribute('aria-current'),null);
  await nav.getByRole('button',{name:'Team',exact:true}).click();
  assert.ok(await nav.getByRole('button',{name:'Team',exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).borderRadius)>0));
  assert.ok(await page.locator('.org-card').first().evaluate(el=>parseFloat(getComputedStyle(el).borderRadius)>4));
  assert.equal(await page.getByRole('button',{name:'Other teams',exact:true}).count(),0);
  await page.evaluate(()=>{window.fixture.target.value='team-exchanges';});
  await page.getByRole('heading',{name:'Chat',exact:true}).waitFor();
  await page.evaluate(()=>{window.fixture.state.activeStreams={stream:{companyId:'hvac',streamId:'stream',role:'CEO',startedAt:Date.now(),response:'<think>secret planning'}};});
  await nav.getByRole('button',{name:'Activity',exact:true}).click();
  await page.locator('.live-entry__response--streaming').waitFor();
  assert.doesNotMatch(await page.locator('body').innerText(),/secret planning|<think>/);
  await page.evaluate(()=>{window.fixture.state.activeStreams.stream.response='<think>secret planning</think>Visible result';});
  await page.getByText('Visible result',{exact:false}).waitFor();
  assert.deepEqual(errors,[]);
 } finally { await browser.close(); }
});
