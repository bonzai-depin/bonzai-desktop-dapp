import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.BONZAI_UI_URL;
test('personal review queue opens exact saved task without business intake or implicit approval',{skip:!url},async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
  await page.goto(`${url}/src/assets/tokens.css`);
  await page.setContent('<html data-theme="waveform"><head><link rel="stylesheet" href="/src/assets/tokens.css"><link rel="stylesheet" href="/src/assets/themes.css"><link rel="stylesheet" href="/src/assets/buttons.css"><link rel="stylesheet" href="/src/assets/fonts/fonts.css"><style>body{padding:20px;margin:0;background:var(--bz-canvas);color:var(--bz-fg);font-family:var(--bz-font-body)}*{box-sizing:border-box}</style></head><body><div id="app"></div></body></html>');
  await page.evaluate(async()=>{
   window.fixture={opened:[],decisions:[],intakeCalls:0};
   window.electronAPI={db:{companyIntake:{snapshot:async()=>{fixture.intakeCalls++;return{};}}}};
   const source=await fetch('/src/components/company/CompanyInbox.vue').then(r=>r.text());
   const vue=source.match(/from ["']([^"']*\/vue\.js(?:\?[^"']*)?)["']/)[1];
   const {createApp,reactive}=await import(vue);const {default:View}=await import('/src/components/company/CompanyInbox.vue');
   const {operationText}=await import('/src/i18n/operations.js');
   const charter={id:'calm',name:'Evening meditation',workspace:{executionWorkflowId:'meditation-forge-v1.0.0'}};
   const issue={id:'evening',companyId:'calm',title:'Evening calm · a complete meditation with audio and artwork',status:'blocked',execution:{steps:[{action:{type:'runWorkflow',workflowId:'meditation-forge-v1.0.0'},status:'requires_input',output:{status:'ready_for_review',contentIds:['audio','script']}}]}};
   window.state=reactive({issues:[issue,{id:'obsolete',companyId:'calm',createdBy:'ceo',title:'Amend system configuration',status:'blocked'}],approvals:[{id:'old-permission',companyId:'calm',issueId:'obsolete',action:{type:'publishComplianceReport',subject:'Obsolete planner permission'}},{id:'other-permission',companyId:'another',action:{type:'sendEmail',subject:'Foreign team permission'}}],catalog:[{id:'audio',companyId:'calm',pipeline:'audio',prompt:'Guided narration'},{id:'script',companyId:'calm',pipeline:'text',prompt:'Meditation script'}]});
   const app=createApp(View,{state,charter,store:{approve:id=>fixture.decisions.push(id),reject:id=>fixture.decisions.push(id)},onOpenWorkflowResult:issue=>fixture.opened.push(issue.id),onOpenView:view=>fixture.opened.push(view)});
   app.config.globalProperties.$ui=operationText;app.mount('#app');
  });
  await page.getByRole('heading',{name:/Evening calm/}).waitFor();
  assert.equal(await page.getByText('Files & email',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Import document'}).count(),0);
  assert.equal(await page.evaluate(()=>fixture.intakeCalls),0);
  assert.equal(await page.getByText('Obsolete planner permission',{exact:true}).count(),0);
  assert.equal(await page.getByText('Foreign team permission',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0);
  await page.getByText('Guided narration',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Review results',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>fixture.opened),['evening']);
  assert.deepEqual(await page.evaluate(()=>fixture.decisions),[]);
  for(const theme of ['waveform','light']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await page.setViewportSize({width:390,height:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
  }
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.inbox-search')).backgroundColor==='rgb(249, 250, 251)');
  await page.screenshot({path:'/tmp/bonzai-workflow-review-light.png',fullPage:true});
  await page.evaluate(()=>{state.issues[0].status='done';});
  await page.getByRole('heading',{name:'Nothing awaiting review.'}).waitFor();
  await page.getByRole('button',{name:'Open workflow',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>fixture.opened),['evening','studio']);
  await page.evaluate(()=>{state.approvals.push({id:'explicit',companyId:'calm',status:'pending',action:{type:'sendEmail',subject:'Share the approved meditation'}});});
  await page.getByRole('button',{name:'Approve',exact:true}).waitFor();
  await page.getByRole('button',{name:'Reject',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>fixture.decisions),[]);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
