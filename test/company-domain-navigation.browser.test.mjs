import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;

test('business sections keep distinct queues and fields use a single themed frame',{skip:!url,timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fields.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{margin:0;padding:20px;background:var(--bz-canvas);color:var(--bz-fg);font-family:"Fira Sans",sans-serif}*{box-sizing:border-box}</style></head><body><main id="app"></main></body></html>');
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
   charter.id='hvac';charter.status='paused';charter.workspace=buildWorkspaceBlueprint({templateId:'pod_shop'});
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
   Object.assign(dashboard.value.store,{refreshActive:store.refreshActive,approve:store.approve,reject:store.reject,updateIssue:async(id,patch)=>{if('execution' in patch)throw new Error('Cannot change execution');Object.assign(state.issues.find(issue=>issue.id===id),patch);}});
  });

  const nav=page.getByRole('navigation',{name:'Team workspace'});
  await nav.waitFor();
  const dock=page.locator('.company-view-nav__team');
  assert.equal(await dock.evaluate(el=>getComputedStyle(el).position),'fixed');
  await dock.getByRole('button',{name:'Mission',exact:true}).hover();
  await page.locator('.team-command-veil.is-visible').waitFor();
  assert.equal(await page.locator('.team-command-veil__label').innerText(),'Mission');
  assert.equal(await page.locator('.team-command-veil').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  await page.waitForTimeout(300);
  const veilBox=await page.locator('.team-command-veil').boundingBox();
  const labelBox=await page.locator('.team-command-veil__label').boundingBox();
  assert.ok(Math.abs(labelBox.x+labelBox.width/2-(veilBox.x+veilBox.width/2))<2);
  assert.ok(Math.abs(labelBox.y+labelBox.height/2-(veilBox.y+veilBox.height/2))<2);
  await page.screenshot({path:'/tmp/team-command-hover.png'});
  await page.mouse.move(1,1);
  await page.waitForFunction(()=>!document.querySelector('.team-command-veil').classList.contains('is-visible'));
  const dockBounds=await dock.boundingBox();
  assert.ok(dockBounds.x>=16);
  assert.ok(dockBounds.y+dockBounds.height<=await page.evaluate(()=>innerHeight-15));
  assert.equal(await nav.getByRole('button',{name:'Billing',exact:true}).count(),0);
  for(const label of ['Catalog','Fulfillment']) {
   await nav.getByRole('button',{name:label,exact:true}).click();
   assert.equal(await page.getByRole('heading',{name:label,exact:true}).count(),1);
   assert.equal(await nav.getByRole('button',{name:label,exact:true}).getAttribute('aria-current'),'page');
  }
  await page.evaluate(()=>{
   window.fixture.state.issues=[{id:'catalog-task',title:'Prepare product photos',status:'open',assigneeRole:'CEO',labels:['workspace:catalog']},{id:'shipping-task',title:'Review shipping delays',status:'open',assigneeRole:'CEO',labels:['workspace:fulfillment']}];
  });
  await nav.getByRole('button',{name:/^Catalog(?: \d+)?$/}).click();
  assert.equal(await page.getByText('Prepare product photos',{exact:true}).count(),1);
  assert.equal(await page.getByText('Review shipping delays',{exact:true}).count(),0);
  await nav.getByRole('button',{name:/^Fulfillment(?: \d+)?$/}).click();
  assert.equal(await page.getByText('Review shipping delays',{exact:true}).count(),1);
  assert.equal(await page.getByText('Prepare product photos',{exact:true}).count(),0);
  await nav.getByRole('button',{name:'Backlog',exact:true}).click();
  assert.equal(await page.getByText('Prepare product photos',{exact:true}).count(),1);
  await page.locator('.work-todo__actions select').first().selectOption('fulfillment');
  await nav.getByRole('button',{name:/^Catalog(?: \d+)?$/}).click();
  assert.equal(await page.getByText('Prepare product photos',{exact:true}).count(),0);
  await nav.getByRole('button',{name:/^Fulfillment(?: \d+)?$/}).click();
  assert.equal(await page.getByText('Prepare product photos',{exact:true}).count(),1);
  for(const width of [1440,800,390]) {
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.evaluate(()=>{
   const container=document.createElement('div');container.className='company-workspace';container.style.paddingBottom='120px'; // Reserve the dock clearance used by the real workspace.
   container.innerHTML='<input id="focus-probe" class="bz-field-input" required style="outline:2px solid gold;outline-offset:3px;box-shadow:0 0 0 2px gold" aria-label="Focus test">';
   document.body.append(container);
  });
  for(const theme of ['midnight','light','waveform']) {
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const field=page.locator('#focus-probe');await field.scrollIntoViewIfNeeded();await field.focus();
   const style=await field.evaluate(el=>{const s=getComputedStyle(el);return {outline:s.outlineStyle,shadow:s.boxShadow,border:s.borderTopWidth}});
   assert.equal(style.outline,'none');assert.equal(style.shadow,'none');assert.equal(style.border,'1px');
   await field.hover();assert.equal(await field.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  }
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
});
