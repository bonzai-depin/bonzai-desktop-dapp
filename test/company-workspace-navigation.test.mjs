import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceNavigation,workspaceSection,reviewCount,resolveWorkspaceDestination,maintenanceDestination} from '../src/services/company/workspaceNavigation.js';
import {buildWorkspaceBlueprint,hydrateWorkspaceChannels} from '../src/services/company/workspaceBlueprints.js';

test('GMAO starts with the daily cockpit, schedule, work orders and clients as direct destinations',()=>{
 const views=workspaceNavigation([{view:'gmao'},{view:'gmao'},{view:'issues'}]);
 assert.deepEqual(views.map(view=>view.label),['Today','Schedule','Work orders','Clients','Parts requests','Billing','Inbox','Results','Getting started','Operations settings','Team','Mission','Backlog','Chat','Activity','Tools','Team settings']);
 assert.equal(new Set(views.map(view=>view.key)).size,views.length);
 assert.ok(!views.some(view=>['Maintenance','Work','Other teams'].includes(view.label)));
 for(const view of views)assert.equal(workspaceSection(view.value,view.focus,true),view.section);
 assert.equal(workspaceSection('gmao','purchasing',true),'parts');
 assert.equal(workspaceSection('gmao','settings',true),'settings');
});
test('default landing follows business context while explicit task/result deep links remain intact',()=>{
 const channels=hydrateWorkspaceChannels(buildWorkspaceBlueprint({templateId:'hvac_residential'}),{});
 assert.equal(resolveWorkspaceDestination('',channels,true).key,'today');
 assert.equal(resolveWorkspaceDestination('gmao',channels,true).key,'today');
 assert.equal(resolveWorkspaceDestination('command',channels,true).value,'command');
 assert.equal(resolveWorkspaceDestination('deliverables',channels,true).value,'deliverables');
 assert.equal(resolveWorkspaceDestination('preventive',channels,true).key,'schedule');
 assert.equal(resolveWorkspaceDestination('dispatch',channels,true).key,'work-orders');
 assert.equal(resolveWorkspaceDestination('billing',channels,true).key,'billing');
 assert.equal(resolveWorkspaceDestination('finance',channels,true).key,'billing');
 assert.equal(resolveWorkspaceDestination('clients',channels,true).key,'clients');
 for(const review of ['ai','documents','outbox','review'])assert.equal(resolveWorkspaceDestination(review,channels,true).value,'approvals');
 assert.equal(maintenanceDestination('interventions').key,'work-orders');
 assert.equal(resolveWorkspaceDestination('unknown',channels,true).key,'today');
});

test('purchasing and finance teams open their own operational records directly', () => {
 const purchasing=hydrateWorkspaceChannels(buildWorkspaceBlueprint({templateId:'purchasing_team'}),{});
 assert.equal(resolveWorkspaceDestination('',purchasing).value,'overview');
 assert.ok(workspaceNavigation(purchasing).some(view=>view.value==='purchasing'));
 assert.ok(!workspaceNavigation(purchasing).some(view=>view.value==='billing'));
 assert.notEqual(resolveWorkspaceDestination('billing',purchasing).value,'billing');
 assert.equal(resolveWorkspaceDestination('billing',[{key:'receivables',view:'issues'}]).value,'billing');
});
test('other businesses retain their actual tools without fake maintenance pages',()=>{
 const views=workspaceNavigation([]);
 assert.deepEqual(views.map(view=>view.label),['Today','Inbox','Results','Getting started','Team','Mission','Backlog','Chat','Activity','Tools','Team settings']);
 assert.equal(resolveWorkspaceDestination('').value,'overview');
 assert.equal(resolveWorkspaceDestination('work').value,'issues');
 assert.equal(workspaceSection('connectors'),'connectors');
});
test('Inbox counts pending human decisions, not already reviewed documents or sent messages',()=>{
 const state={approvals:[{id:'approval'}],gmao:{documentIntake:[{status:'to_review'},{status:'accepted'}],outbox:[{status:'draft'},{status:'failed'},{status:'unknown'},{status:'submitted'},{status:'delivered'}],notifications:[{deliveryStatus:'ready'},{deliveryStatus:'prepared'}]}};
 assert.equal(reviewCount(state),6);
 assert.equal(workspaceNavigation([{view:'gmao'}],state).find(view=>view.value==='approvals').badge,6);
});

test('all team views stay together and old links resolve to the same work',()=>{
 for(const channels of [[],[{view:'gmao'}]]) {
  const views=workspaceNavigation(channels);
  assert.deepEqual(views.filter(view=>view.utility).map(view=>view.label),['Team','Mission','Backlog','Chat','Activity','Tools','Team settings']);
  for(const view of views.filter(view=>view.utility)) assert.equal(workspaceSection(view.value),view.section);
 }
 for(const key of ['chat','requests','command','team-exchanges'])assert.equal(resolveWorkspaceDestination(key).value,'command');
 assert.equal(resolveWorkspaceDestination('backlog').value,'issues');
 assert.equal(resolveWorkspaceDestination('mission').value,'mission');
});

test('Tools and Team settings are direct team controls, independent from operation settings',()=>{
 const views=workspaceNavigation([{view:'gmao'}]);
 for(const value of ['connectors','charter']) {
  const view=views.find(item=>item.value===value);assert.equal(view.utility,true);
  assert.equal(workspaceSection(value,'settings',true),value);
 }
 assert.equal(resolveWorkspaceDestination('tools').value,'connectors');
 assert.equal(resolveWorkspaceDestination('team-settings').value,'charter');
 assert.equal(resolveWorkspaceDestination('settings',[],true).value,'gmao');
 assert.ok(!workspaceNavigation([]).some(item=>item.label==='Operations settings'));
});


test('both settings destinations keep distinct accessible labels while using compact cogwheel controls', () => {
 const views = workspaceNavigation([{ view: 'gmao' }]);
 const settings = views.filter(view => view.icon === 'settings');
 assert.deepEqual(settings.map(view => view.label), ['Operations settings', 'Team settings']);
 for (const item of settings) assert.equal(item.icon, 'settings');
 for (const item of settings) assert.equal(item.iconOnly, true);
 assert.notEqual(settings[0].value, settings[1].value);
});

test('team commands remain named for accessibility while only Team has a visible label', () => {
 for (const channels of [[], [{ view: 'gmao' }]]) {
  const commands = workspaceNavigation(channels).filter(view => view.utility);
  assert.deepEqual(commands.filter(view => !view.iconOnly).map(view => view.label), ['Team']);
  assert.ok(commands.every(view => view.label && view.icon));
 }
});

 test('business queues preserve their identity and do not expose unrelated customer billing', () => {
  for (const profile of ['revenue','support','hospitality','creative','commerce','legal','product','knowledge']) {
   const channels=hydrateWorkspaceChannels(buildWorkspaceBlueprint({profile}));
   const domains=channels.filter(view=>view.view==='issues' && view.key!=='work');
   for(const domain of domains) {
    assert.ok(workspaceNavigation(channels).some(view=>view.key===domain.key));
    assert.equal(resolveWorkspaceDestination(domain.key,channels).key,domain.key);
   }
   assert.ok(!workspaceNavigation(channels).some(view=>view.value==='billing'));
   assert.notEqual(resolveWorkspaceDestination('billing',channels).value,'billing');
  }
 });
 test('legacy Paperasse finance blueprints do not turn tax and legal dossiers into invoice teams', () => {
  const legacy=buildWorkspaceBlueprint({profile:'finance'});
  for(const templateId of ['paperasse_accounting','paperasse_personal_tax','paperasse_notarial']) {
   const channels=hydrateWorkspaceChannels(legacy,{},templateId);
   assert.deepEqual(workspaceNavigation(channels).filter(view=>view.domain).map(view=>view.key),['evidence','preparation']);
   assert.ok(!workspaceNavigation(channels).some(view=>view.value==='billing'));
  }
 });
