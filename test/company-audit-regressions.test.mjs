import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, ref, nextTick } from 'vue';
import { useCompanyDraft, clearCompanyDrafts } from '../src/services/company/viewDrafts.js';
import { routeCompanyWork } from '../src/shared/companyWorkRouting.js';
import { reviewCount } from '../src/services/company/workspaceNavigation.js';
import { currentGrantDocument } from '../src/services/company/grantDocuments.js';
import { EventEmitter } from 'node:events';
import { createCompanyRuntime } from '../src/main/companyRuntime.js';

test('drafts survive leaving a screen, reset on a team switch, and clear after deletion', async () => {
  const team=ref('team-one:invoice'), form=ref({title:''});
  let scope=effectScope();
  scope.run(()=>useCompanyDraft(()=>team.value,{form}));
  form.value.title='Unfinished invoice'; scope.stop();
  const resumed=ref({title:''});scope=effectScope();
  scope.run(()=>useCompanyDraft(()=>team.value,{form:resumed}));
  assert.equal(resumed.value.title,'Unfinished invoice');
  team.value='team-two:invoice';
  assert.equal(resumed.value.title,'','a team switch clears the previous company form synchronously');
  await nextTick();
  assert.equal(resumed.value.title,'');
  resumed.value.title='Different customer';
  team.value='team-one:invoice'; await nextTick();
  assert.equal(resumed.value.title,'Unfinished invoice');scope.stop();
  clearCompanyDrafts('team-one');
  const fresh=ref({title:''});scope=effectScope();scope.run(()=>useCompanyDraft(()=>team.value,{form:fresh}));
  assert.equal(fresh.value.title,'');scope.stop();clearCompanyDrafts('team-two');
});

test('routing fills real domain queues without guessing ambiguous work', () => {
  const channels=[{key:'evidence',view:'issues'},{key:'preparation',view:'issues'}];
  assert.ok(routeCompanyWork({title:'Prepare tax report'},channels).includes('workspace:preparation'));
  assert.deepEqual(routeCompanyWork({title:'Check everything'},channels),[]);
  assert.ok(routeCompanyWork({title:'Check everything',workspaceKey:'evidence'},channels).includes('workspace:evidence'));
  assert.equal(reviewCount({approvals:[{}],intakeReviewCount:4}),5);
});

test('same beneficiary does not authorize another installation’s invoice or receipt', () => {
  const dossier={id:'installation-a',beneficiary:'Customer'};
  assert.equal(currentGrantDocument({documentType:'invoice',dossierId:'installation-b',beneficiary:'Customer'},dossier),false);
  assert.equal(currentGrantDocument({documentType:'invoice',beneficiary:'Customer'},dossier),false);
  assert.equal(currentGrantDocument({documentType:'company_identity'},dossier),true);
  assert.equal(currentGrantDocument({documentType:'company_identity',validUntil:'2026-10-09'},dossier,new Date('2026-10-09T12:00:00').getTime()),true);
  assert.equal(currentGrantDocument({documentType:'company_identity',validUntil:'2026-10-08'},dossier,new Date('2026-10-09T12:00:00').getTime()),false);
  assert.equal(currentGrantDocument({documentType:'invoice',dossierId:'installation-a',draft:true},dossier),false);
});

test('healthy execution resets crash retries; a rapid crash loop remains bounded', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const ipc=new EventEmitter(),app=new EventEmitter();ipc.handle=()=>{};
  const windows=[];
  class Window extends EventEmitter {
    constructor(){super();this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};windows.push(this);}
    loadURL(){queueMicrotask(()=>ipc.emit('company-runtime:ready',{sender:this.webContents}));return Promise.resolve();}
    isDestroyed(){return !!this.destroyed;}
    destroy(){this.destroyed=true;this.emit('closed');}
  }
  const host=createCompanyRuntime({BrowserWindow:Window,ipcMain:ipc,app,url:'http://localhost/runtime',getUI:()=>null});
  try {
    await host.start();
    for(let i=0;i<5;i++) {
      t.mock.timers.tick(60000);
      windows.at(-1).webContents.emit('render-process-gone');
      t.mock.timers.tick(5000);await Promise.resolve();await Promise.resolve();
      assert.equal(windows.length,i+2,'healthy recoveries are not limited to three lifetime failures');
    }
    for(let i=0;i<4;i++) {
      windows.at(-1).webContents.emit('render-process-gone');
      t.mock.timers.tick(15000);await Promise.resolve();await Promise.resolve();
    }
    const stopped=windows.length;t.mock.timers.tick(60000);await Promise.resolve();
    assert.equal(windows.length,stopped);
  } finally { app.emit('before-quit');t.mock.timers.reset(); }
});
