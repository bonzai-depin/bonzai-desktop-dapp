import assert from 'node:assert/strict';
import { get } from './connection.js';
import { tickCEO, tickRole, resumeApprovedTask } from '../../../src/services/company/dispatcher.js';
import { captureHarness, beginHarness } from '../../../src/services/company/harness.js';
import * as companies from '../../../src/main/db/repos/companies.js';
import * as teamCommunication from '../../../src/main/db/repos/teamCommunication.js';
import { createAgentExecution } from '../../../src/services/company/agentLoop.js';
import * as issues from '../../../src/main/db/repos/issues.js';
import * as goals from '../../../src/main/db/repos/goals.js';
import * as approvals from '../../../src/main/db/repos/approvals.js';
import * as gmao from '../../../src/main/db/repos/gmao.js';
import * as automation from '../../../src/main/db/repos/automation.js';
import * as portability from '../../../src/main/db/repos/companyPortability.js';
import * as distribution from '../../../src/main/db/repos/distribution.js';
import * as treasury from '../../../src/main/db/repos/treasury.js';
import * as audit from '../../../src/main/db/repos/audit.js';
import * as blobs from '../../../src/main/db/blobs.js';
import { createTaskExecution, runTaskExecution, executionOutcome } from '../../../src/services/company/taskExecution.js';
import { executeLocalAction } from '../../../src/services/company/gmao.js';
import * as governance from '../../../src/services/company/governance.solo.js';
import { makeCharter } from '../../../src/services/company/charter.js';
const { db } = get();
globalThis.window = { dispatchEvent() {}, electronAPI: { db: { approvals, gmao, audit } } };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
const charter = { ...makeCharter({ name: 'Fixture Services', mission: 'Complete approved maintenance and prepare accurate billing.' }), id: 'fixture-company', status: 'active', demoMode: false };
charter.rules.vetoMode['gmao.completeWorkOrder'] = 'pause-for-approval';
charter.rules.vetoMode['invoice.create'] = 'auto-execute';
companies.save(charter);
companies.save({ ...charter, id: 'unrelated-company', name: 'Private unrelated company' });
const site = gmao.saveSite(charter.id, { name: 'Fixture shop', trigram: 'FIX', address: 'Test fixture only' });
const workOrder = gmao.createWorkOrder(charter.id, { siteId: site.id, title: 'Repair fixture ventilation', priority: 'P3' });
for (const status of ['assigned','acknowledged','on_site']) gmao.transitionWorkOrder(charter.id,workOrder.id,status,{assigneeHuman:'Fixture technician'});
const photoBlob=blobs.write(Buffer.from('Fixture photo evidence'),'png',{source:'gmao',sourceId:charter.id,mimeType:'image/png'});
const photoFor=workOrderId=>gmao.addDocument(charter.id,{workOrderId,category:'field_photo',filename:'evidence.png',blobId:photoBlob.id,blobExt:'png',mimeType:'image/png'}).id;
gmao.recordAttachmentSheet(charter.id, workOrder.id, { technicianName: 'Fixture technician', workPerformed: 'Replaced failed fan and verified stable airflow.', resolved: true, photoRefs: [photoFor(workOrder.id)], measurements: [{ name: 'airflow', value: 'verified' }] });
assert.equal(gmao.getWorkOrder(charter.id, workOrder.id).status, 'restored');
const quote = gmao.createQuote(charter.id, workOrder.id, { quoteType: 'improvement', laborCents: 12500, partsCents: 5000, vatRate: 20 });
const goal = goals.create(charter.id, { title: 'Prepare a reviewed invoice draft for completed maintenance' });
let task = issues.create(charter.id, { title: 'Receive signed service acceptance and prepare invoice draft', assigneeRole: 'BillingController', goalId: goal.id,
  execution: createTaskExecution([
    { stepId: 'acceptance', type: 'gmao.recordServiceAcceptance', workOrderId: workOrder.id, reference: 'FIXTURE-SIGNED-ACCEPTANCE', customerSignatory:'Fixture customer' },
    { stepId: 'billing', type: 'gmao.validateProcessStep', workOrderId: workOrder.id, step:'billing_requested', confirmed:true },
    { stepId: 'invoice', type: 'gmao.saveInvoice', workOrderId: { $ref: 'acceptance.id' }, quoteId: quote.id, status: 'draft' },
  ]) });
task = issues.claimNextForRole(charter.id, 'BillingController', 'fixture-agent');
let revision = task.executionRevision;
let dispatched = 0;
const run = async (execution, approval = null) => runTaskExecution({ execution, approval,
  save: state => { task = issues.saveExecution(charter.id, task.id, state, revision); revision = task.executionRevision; },
  gate: (action, step) => governance.gateAction(charter.id, charter, action, { role: 'BillingController', companion: 'fixture-agent', issueId: task.id, stepId: step.id }),
  dispatch: async (action, step, pendingId) => {
    if (governance.requiresOwnerApproval(action) || pendingId) assert.ok(governance.consumeOwnerApproval(charter.id, pendingId, action));
    dispatched++;
    return executeLocalAction(charter.id, action.type, action, { role: 'BillingController' });
  },
});
let execution = await run(task.execution);
assert.equal(dispatched, 0, 'nothing runs before owner approval');
assert.equal(executionOutcome(execution), 'queued');
issues.finishAttempt(charter.id, task.id, { status: 'queued', result: { actions: execution.steps } });
assert.equal(issues.getById(charter.id, task.id).status, 'blocked');
assert.equal(issues.claimNextForRole(charter.id, 'BillingController', 'fixture-agent'), null);
assert.equal(approvals.pending(charter.id).length, 1);
const pending = approvals.pending(charter.id)[0];
assert.equal(pending.issueId, task.id);
assert.equal(pending.action.workOrderId, workOrder.id);
task = issues.resumeApproval(charter.id, pending.id); revision = task.executionRevision;
const approvedAction = await governance.approve(charter.id, pending.id);
execution = await run(task.execution, { id: pending.id, stepId: pending.stepId, action: approvedAction });
assert.equal(executionOutcome(execution), 'queued', 'billing handoff needs its own review');
issues.finishAttempt(charter.id, task.id, {status:'queued',result:{actions:execution.steps}});
const billingApproval=approvals.pending(charter.id)[0];
task=issues.resumeApproval(charter.id,billingApproval.id);revision=task.executionRevision;
const billingAction=await governance.approve(charter.id,billingApproval.id);
execution=await run(task.execution,{id:billingApproval.id,stepId:billingApproval.stepId,action:billingAction});
assert.equal(executionOutcome(execution), 'done');
assert.equal(dispatched, 3);
assert.equal(gmao.getWorkOrder(charter.id,workOrder.id).status,'restored','billing does not close the field order');
const invoice = execution.steps[2].output;
assert.equal(invoice.workOrderId, workOrder.id);
assert.equal(invoice.totalCents, quote.totalCents);
assert.equal(invoice.status, 'draft');
assert.equal(invoice.sentAt, null, 'drafting is not delivery');
issues.finishAttempt(charter.id, task.id, { status: 'done', result: { summary: 'Invoice draft prepared', actions: execution.steps } });
goals.maybeComplete(charter.id, goal.id);
assert.equal(goals.getById(charter.id, goal.id).status, 'completed');
assert.equal(db.prepare('SELECT COUNT(*) n FROM gmao_invoices WHERE company_id = ?').get(charter.id).n, 1);
assert.throws(() => approvals.approve(charter.id, pending.id), /already approved/);
assert.throws(() => issues.saveExecution(charter.id, task.id, execution, 0), /no longer running/);
console.log('PASS: real SQLite maintenance evidence → approval → service acceptance → correctly priced invoice draft, no delivery/payment claim');

// Exercise the actual dispatcher, with only model/catalog/network boundaries
// replaced. Inherited staffing must still claim the BillingController queue.
Object.assign(window.electronAPI.db, { companies: { get: companies.getById }, issues: { ...issues, get: issues.getById }, goals: { ...goals, get: goals.getById }, automation: { ...automation, state: automation.getState } });
charter.roles = { CEO: { companion: 'fixture-agent' }, BillingController: { grantedSkills: ['skill.gmao_finance'] } };
companies.save(charter);
const routedWork = gmao.createWorkOrder(charter.id, { siteId: site.id, title: 'Second ventilation repair', priority: 'P3' });
for (const status of ['assigned','acknowledged','on_site']) gmao.transitionWorkOrder(charter.id,routedWork.id,status,{assigneeHuman:'Fixture technician'});
gmao.recordAttachmentSheet(charter.id, routedWork.id, { technicianName: 'Fixture technician', workPerformed: 'Verified a second completed repair.', resolved: true, photoRefs: [photoFor(routedWork.id)] });
const routedQuote = gmao.createQuote(charter.id, routedWork.id, { quoteType: 'improvement', laborCents: 10000, vatRate: 20 });
const routed = issues.create(charter.id, { title: 'Review service acceptance', assigneeRole: 'BillingController', execution: createTaskExecution([
  { stepId: 'accept', type: 'gmao.recordServiceAcceptance', workOrderId: routedWork.id, reference: 'DISPATCHER-OWNER-REVIEW', customerSignatory:'Fixture customer' },
  { stepId: 'billing', type: 'gmao.validateProcessStep', workOrderId:routedWork.id, step:'billing_requested', confirmed:true },
  { stepId: 'invoice', type: 'gmao.saveInvoice', workOrderId: { $ref: 'accept.id' }, quoteId: routedQuote.id, status: 'draft' },
]) });
assert.equal((await tickRole(charter, 'BillingController')).queued, 1);
assert.equal(issues.getById(charter.id, routed.id).status, 'blocked');
const routedApproval = approvals.pending(charter.id).find(row => row.issueId === routed.id);
assert.ok(routedApproval);
const routedResult = await resumeApprovedTask(charter, routedApproval);
assert.equal(routedResult.error, 0, JSON.stringify(routedResult));
assert.equal(issues.getById(charter.id,routed.id).status,'blocked');
await resumeApprovedTask(charter, approvals.pending(charter.id).find(row=>row.issueId===routed.id));
assert.equal(issues.getById(charter.id, routed.id).status, 'done');
assert.equal(issues.getById(charter.id, routed.id).execution.steps[2].resolvedAction.workOrderId, routedWork.id);
assert.equal(issues.getById(charter.id, routed.id).attempts?.length || issues.attempts(routed.id).length, 3);
assert.equal(automation.getState(charter.id).leaseOwner, null);
console.log('PASS: actual dispatcher claims inherited role, pauses for approval and resumes saved results under an exclusive lease');

const cancelledGoal = goals.create(charter.id, { title: 'Cancelled work is not an achieved outcome' });
const cancelled = issues.create(charter.id, { title: 'Not performed', assigneeRole: 'CFO', goalId: cancelledGoal.id });
issues.update(charter.id, cancelled.id, { status: 'cancelled' });
assert.equal(goals.maybeComplete(charter.id, cancelledGoal.id, [{ status: 'done' }]), null);
assert.equal(goals.getById(charter.id, cancelledGoal.id).status, 'active');
assert.equal(issues.reopen(charter.id, cancelled.id).status, 'open');
issues.update(charter.id, cancelled.id, { status: 'cancelled' });
const parent = issues.create(charter.id, { title: 'Prerequisite', assigneeRole: 'RnDLead' });
const child = issues.create(charter.id, { title: 'Dependent', assigneeRole: 'CFO', parentIssueId: parent.id });
assert.equal(issues.claimNextForRole(charter.id, 'CFO', 'fixture-agent'), null);

let uncertain = issues.create(charter.id, { title: 'Interrupted email', assigneeRole: 'CMO', execution: createTaskExecution([{ type: 'email.send', to: 'fixture@example.invalid' }]) });
uncertain = issues.claimNextForRole(charter.id, 'CMO', 'fixture-agent');
uncertain.execution.steps[0].status = 'running';
issues.saveExecution(charter.id, uncertain.id, uncertain.execution, 0);
const lease = automation.begin(charter.id, { lane: 'roles', leaseMs: 60000 });
assert.ok(lease.acquired);
assert.ok(automation.renew(charter.id, lease.runId, 60000));
assert.equal(automation.begin(charter.id, { lane: 'roles' }).acquired, false);
assert.equal(issues.recoverStale(charter.id, Date.now() + 1).recovered, 0, 'a live lease protects long-running work');
assert.equal(automation.recover(charter.id, Date.now() + 1).recovered, 0);
db.prepare('UPDATE company_automation_state SET lease_expires_at = 1 WHERE company_id = ?').run(charter.id);
automation.recover(charter.id, Date.now() + 1000);
issues.recoverStale(charter.id, Date.now() + 1000);
uncertain = issues.getById(charter.id, uncertain.id);
assert.equal(uncertain.status, 'blocked');
assert.equal(uncertain.execution.steps[0].status, 'unknown');
assert.throws(() => issues.reopen(charter.id, uncertain.id), /uncertain outcome/);
issues.reconcileExecution(charter.id, uncertain.id, 'step1', { decision: 'not_performed', evidence: 'Fixture provider confirms no message was accepted.' });
assert.equal(issues.getById(charter.id, uncertain.id).status, 'open');
const approvalCrash = issues.create(charter.id, { title: 'Interrupted approval', assigneeRole: 'CEO', execution: createTaskExecution([{ type: 'email.send', to: 'fixture@example.invalid' }]) });
const claimedCrash = issues.claimNextForRole(charter.id, 'CEO', 'fixture-agent');
const crashApproval = approvals.enqueue(charter.id, { cls: 'email.send', action: claimedCrash.execution.steps[0].action, role: 'CEO', requestedBy: 'fixture-agent', issueId: approvalCrash.id, stepId: 'step1' });
Object.assign(claimedCrash.execution.steps[0], { status: 'waiting_approval', approvalId: crashApproval.id, resolvedAction: claimedCrash.execution.steps[0].action });
issues.saveExecution(charter.id, approvalCrash.id, claimedCrash.execution, 0);
issues.finishAttempt(charter.id, approvalCrash.id, { status: 'queued' });
issues.resumeApproval(charter.id, crashApproval.id); approvals.approve(charter.id, crashApproval.id);
issues.recoverStale(charter.id, Date.now() + 1000);
assert.equal(issues.getById(charter.id, approvalCrash.id).execution.steps[0].status, 'unknown', 'interrupted approval must remain reviewable');
console.log('PASS: dependencies, cancellation, exclusive leases, interruption review and safe resumption');

const image = blobs.write(Buffer.from('test attachment bytes'), 'bin', { source: 'fixture' });
distribution.publish(charter.id, { pipeline: 'image', prompt: 'Fixture attachment', blobId: image.id, blobExt: 'bin' });
db.prepare("INSERT INTO connectors (id, company_id, kind, auth_type, status, secret_ref, created_at, updated_at) VALUES (?, ?, 'sendgrid', 'apiKey', 'active', 'fixture-secret-reference', 1, 1)").run('fixture-connector', charter.id);
db.prepare("INSERT INTO memory_instances (instance_key, scope, identity_id, label, created_at, updated_at) VALUES (?, 'company', ?, 'Fixture memory', 1, 1)").run(`company:${charter.id}`, charter.id);
db.prepare("INSERT INTO memory_notes (id, instance_key, note_kind, text_content, created_at) VALUES ('fixture-note', ?, 'fact', 'Customer requested invoice drafts', 1)").run(`company:${charter.id}`);
const bundle = portability.exportBundle(charter.id);
assert.equal(bundle.schemaVersion, 2);
assert.ok(bundle.tables.issue_attempts.length);
assert.ok(bundle.tables.gmao_invoices.length);
assert.equal(bundle.blobs[image.id].data, Buffer.from('test attachment bytes').toString('base64'));
assert.ok(!JSON.stringify(bundle).includes('fixture-secret-reference'));
assert.ok(!JSON.stringify(bundle).includes('Private unrelated company'));
const restored = portability.importBundle(bundle);
assert.notEqual(restored.id, charter.id);
assert.equal(restored.status, 'paused');
const restoredInvoice = db.prepare('SELECT * FROM gmao_invoices WHERE company_id = ?').get(restored.id);
const restoredWork = db.prepare('SELECT * FROM gmao_work_orders WHERE company_id = ? AND id = ?').get(restored.id, restoredInvoice.work_order_id);
assert.ok(restoredWork);
assert.notEqual(restoredWork.id, workOrder.id);
assert.equal(restoredInvoice.total_cents, invoice.totalCents);
assert.equal(db.prepare('SELECT status FROM connectors WHERE company_id = ?').get(restored.id).status, 'needs_auth');
assert.equal(db.prepare('SELECT text_content FROM memory_notes WHERE instance_key = ?').get(`company:${restored.id}`).text_content, 'Customer requested invoice drafts');
assert.equal(portability.exportBundle(restored.id).tables.issue_attempts.length, bundle.tables.issue_attempts.length);
assert.throws(() => portability.importBundle(bundle, { keepId: true }), /already exists/);
const before = companies.list().length;
const corrupt = structuredClone(bundle); corrupt.blobs[image.id].data = 'YmFk';
assert.throws(() => portability.importBundle(corrupt), /checksum/);
assert.equal(companies.list().length, before);
const foreign = structuredClone(bundle); foreign.tables.issues[0].company_id = 'unrelated-company';
assert.throws(() => portability.importBundle(foreign), /another company/);
assert.equal(companies.list().length, before);
console.log('PASS: scoped complete backup, remapped foreign keys, attachments, memory, paused restore, no credentials, checksum and rollback');
const brokenLink = structuredClone(bundle);
brokenLink.tables.gmao_invoices[0].work_order_id = 'foreign-work-order';
assert.throws(() => portability.importBundle(brokenLink), /reference/);
assert.equal(companies.list().length, before);
assert.throws(() => issues.update(charter.id, child.id, { status: 'done' }), /recorded results/);
const countBeforeGoal = goals.list(charter.id).length;
assert.throws(() => goals.createWithTasks(charter.id, { title: 'Atomic goal' }, [{ title: 'Valid task', assigneeRole: 'CFO' }, { title: '', assigneeRole: 'CEO' }]), /title required/);
assert.equal(goals.list(charter.id).length, countBeforeGoal, 'failed task creation rolls back its goal');
assert.equal(issues.list(charter.id).some(issue => issue.title === 'Valid task'), false);

// The team's coordinator must plan through the actual dispatcher, including its
// local context assembly. Only inference is scripted; goals and tasks are real.
Object.assign(window.electronAPI.db, { treasury, distribution, audit });
const planningTeam = { ...structuredClone(charter), id: 'planning-team', name: 'Planning team', demoMode: true };
companies.save(planningTeam);
const planningRun = await beginHarness(planningTeam, { lane: 'ceo', triggerType: 'manual' });
try {
  const planned = await tickCEO(planningRun.charter, planningRun);
  assert.deepEqual(planned.errors, []);
  assert.ok(planned.goals.length > 0);
  assert.equal(issues.list(planningTeam.id).length, planned.issuesCreated);
  assert.ok(planned.issuesCreated > 0);
  await planningRun.finish({ status: 'completed', result: planned });
} finally { planningRun.dispose(); }
assert.equal(automation.recent(planningTeam.id)[0].result.harness.teamId, planningTeam.id);
console.log('PASS: team harness coordinator plans and persists real goals and tasks without network calls');

// An expired execution cannot clear a replacement lease or overwrite its retry
// schedule, even when its model call finally returns after recovery.
const planningBinding = await captureHarness(planningTeam);
const oldRun = automation.begin(planningTeam.id, { triggerType: 'manual', harness: planningBinding });
assert.ok(oldRun.acquired);
assert.equal(automation.recent(planningTeam.id).find(row => row.id === oldRun.runId).result.harness.configurationRevision, planningBinding.configurationRevision);
db.prepare('UPDATE company_automation_state SET lease_expires_at = 1 WHERE company_id = ?').run(planningTeam.id);
const newRun = automation.begin(planningTeam.id, { triggerType: 'manual', harness: planningBinding });
assert.ok(newRun.acquired);
const currentState = automation.getState(planningTeam.id);
automation.finish(planningTeam.id, oldRun.runId, { status: 'completed', nextAt: 1 });
assert.deepEqual(automation.getState(planningTeam.id), currentState);
const oldRecord = automation.recent(planningTeam.id).find(row => row.id === oldRun.runId);
assert.equal(oldRecord.status, 'interrupted');
assert.equal(oldRecord.result.harness.configurationRevision, planningBinding.configurationRevision);
automation.finish(planningTeam.id, newRun.runId, { status: 'completed', nextAt: Date.now() + 60000 });
const finishedState = automation.getState(planningTeam.id);
automation.finish(planningTeam.id, oldRun.runId, { status: 'failed', nextAt: 1 });
assert.deepEqual(automation.getState(planningTeam.id), finishedState);
const pausingRun = automation.begin(planningTeam.id, { triggerType: 'manual', harness: planningBinding });
companies.save({ ...planningTeam, status: 'paused' });
assert.equal(automation.renew(planningTeam.id, pausingRun.runId, 60000), false);
automation.finish(planningTeam.id, pausingRun.runId, { status: 'completed' });
assert.equal(automation.recent(planningTeam.id).find(row => row.id === pausingRun.runId).status, 'interrupted');
assert.equal(automation.getState(planningTeam.id).lastSuccessAt, finishedState.lastSuccessAt);
console.log('PASS: stale completions preserve the replacement run, paused teams cannot renew or report success');

// An existing approval does not authorize a different harness configuration.
// Owner review can move the remaining work onto current permissions while
// preserving the original configuration and completed-step receipts.
const reviewTeam = { ...structuredClone(charter), id: 'review-team', name: 'Review team' };
companies.save(reviewTeam);
const reviewTask = issues.create(reviewTeam.id, { title: 'Review a financial report', assigneeRole: 'CFO', execution: createTaskExecution([{ type: 'publishFinancialReport', text: 'Local fixture report for owner review.' }]) });
reviewTeam.rules.vetoMode['publishFinancialReport'] = 'pause-for-approval';
companies.save(reviewTeam);
assert.equal((await tickRole(reviewTeam, 'CFO')).queued, 1);
const oldBinding = issues.getById(reviewTeam.id, reviewTask.id).execution.harness;
const reviewApproval = approvals.pending(reviewTeam.id).find(row => row.issueId === reviewTask.id);
assert.ok(reviewApproval);
reviewTeam.rules.reserveFloor = 999;
companies.save(reviewTeam);
await assert.rejects(() => resumeApprovedTask(reviewTeam, reviewApproval), /configuration changed/);
assert.ok(approvals.pending(reviewTeam.id).some(row => row.id === reviewApproval.id));
assert.equal(issues.getById(reviewTeam.id, reviewTask.id).status, 'blocked');
await governance.reject(reviewTeam.id, reviewApproval.id, 'Review this task using the current team configuration.');
issues.reconcileExecution(reviewTeam.id, reviewTask.id, 'step1', { decision: 'not_performed', evidence: 'The approval was never consumed and no report was produced.' });
assert.equal(issues.getById(reviewTeam.id, reviewTask.id).execution.harnessHistory[0].configurationRevision, oldBinding.configurationRevision);
assert.equal((await tickRole(reviewTeam, 'CFO')).queued, 1, 'reviewed work receives a fresh approval');
const rebound = issues.getById(reviewTeam.id, reviewTask.id).execution;
assert.notEqual(rebound.harness.configurationRevision, oldBinding.configurationRevision);
assert.notEqual(rebound.steps[0].approvalId, reviewApproval.id);
console.log('PASS: changed team policies invalidate approval continuation; reviewed work receives a fresh binding and approval');
const pausedPlan = createTaskExecution([{ type: 'prepare' }, { type: 'send' }]);
pausedPlan.harness = oldBinding;
pausedPlan.steps[0].status = 'completed';
pausedPlan.steps[0].output = { id: 'retained-result', status: 'completed' };
const pausedTask = issues.create(reviewTeam.id, { title: 'Resume remaining work only', assigneeRole: 'CEO', execution: pausedPlan });
issues.update(reviewTeam.id, pausedTask.id, { status: 'blocked' });
const reopened = issues.reopen(reviewTeam.id, pausedTask.id);
assert.equal(reopened.execution.harness, undefined);
assert.equal(reopened.execution.harnessHistory[0].configurationRevision, oldBinding.configurationRevision);
assert.equal(reopened.execution.steps[0].output.id, 'retained-result');
assert.equal(reopened.execution.steps[0].status, 'completed');
assert.equal(reopened.execution.steps[1].status, 'planned');
assert.equal(reopened.executionRevision, pausedTask.executionRevision + 1);
// Native model decisions run through the production dispatcher and SQLite.
const nativeTeam = {...structuredClone(charter), id:'native-team', name:'Finance Martin', roles:{CEO:{companion:'fixture-agent'},CFO:{companion:'fixture-agent'}}};
companies.save(nativeTeam);
const nativeGoal = goals.create(nativeTeam.id,{title:'Prepare a local financial report after confirming the reporting period.'});
const nativeTask = issues.create(nativeTeam.id,{title:nativeGoal.title,goalId:nativeGoal.id,assigneeRole:'CFO'});
let decisions=0;
window.electronAPI.chat=async(prompt,options)=>{
  assert.equal(options.isolated,true,'company turns cannot inherit roleplay history');
  decisions++;
  if(decisions===1)return JSON.stringify({kind:'ask',question:'Quelle période souhaitez-vous examiner ?'});
  assert.match(prompt,/Septembre 2026/,'owner answer reaches the resumed model');
  if(decisions===2)return JSON.stringify({kind:'act',action:{type:'publishFinancialReport',text:'Période : septembre 2026. Aucune écriture enregistrée dans cette équipe de test. Rapport local uniquement.',reason:'Prepare the requested local report.'}});
  assert.match(prompt,/step1/);assert.match(prompt,/completed/);
  return JSON.stringify({kind:'complete',summary:'Rapport local préparé. Aucun envoi externe.',evidence:['step1']});
};
assert.equal((await tickRole(nativeTeam,'CFO')).waiting,1);
assert.equal(issues.getById(nativeTeam.id,nativeTask.id).status,'blocked');
assert.equal(distribution.listCatalog(nativeTeam.id).length,0);
assert.throws(()=>issues.answerQuestion('unrelated-company',nativeTask.id,'Wrong team'),/not waiting/);
issues.answerQuestion(nativeTeam.id,nativeTask.id,'Septembre 2026');
assert.throws(()=>issues.answerQuestion(nativeTeam.id,nativeTask.id,'Duplicate answer'),/not waiting/);
assert.equal((await tickRole(nativeTeam,'CFO')).queued,1);
const nativeApproval=approvals.pending(nativeTeam.id).find(item=>item.issueId===nativeTask.id);
assert.ok(nativeApproval);
await resumeApprovedTask(nativeTeam,nativeApproval);
assert.equal(issues.getById(nativeTeam.id,nativeTask.id).status,'done', JSON.stringify({...issues.getById(nativeTeam.id,nativeTask.id).execution,agent:{...issues.getById(nativeTeam.id,nativeTask.id).execution.agent,instructions:undefined}}));
assert.equal(distribution.listCatalog(nativeTeam.id).length,1);
assert.equal(goals.getById(nativeTeam.id,nativeGoal.id).status,'completed');
assert.equal(decisions,3);
console.log('PASS: native clarification → owner answer → real local report → evidence review → completed goal, isolated chat context');

// A reply that lands before the wait checkpoint must still resume the sender.
const purchasingTeam={...structuredClone(nativeTeam),id:'native-purchasing',name:'Achats Martin'};
companies.save(purchasingTeam);
const thread=teamCommunication.request(nativeTeam.id,{targetTeamId:purchasingTeam.id,targetRole:'CFO',subject:'Availability',body:'Find availability for part A.',requestKey:'native-handoff'},{role:'CFO'});
const waiting=createAgentExecution(await captureHarness(nativeTeam,'CFO','fixture-agent'));
waiting.agent.status='waiting_team';waiting.agent.wait={kind:'team',conversationId:thread.id,seenMessageIds:thread.messages.map(message=>message.id)};
let waiter=issues.create(nativeTeam.id,{title:'Wait for the purchasing reply',assigneeRole:'CFO',execution:waiting});
waiter=issues.claimNextForRole(nativeTeam.id,'CFO','fixture-agent');
teamCommunication.reply(purchasingTeam.id,{conversationId:thread.id,body:'Confirmed by the supplier: 2 units available.',requestKey:'native-reply'},{role:'CFO'});
issues.finishAttempt(nativeTeam.id,waiter.id,{status:'waiting'});
const awakened=issues.getById(nativeTeam.id,waiter.id);
assert.equal(awakened.status,'open');assert.equal(awakened.execution.agent.status,'running');
assert.equal(awakened.execution.agent.events[0].teamName,'Achats Martin');
assert.equal(issues.wakeTeamWaits(nativeTeam.id).resumed,0,'a reply is consumed once');
assert.equal(issues.list(purchasingTeam.id).filter(task=>task.labels.includes('team-request')).length,1);
console.log('PASS: durable team reply wakes the correct task even when it arrives before the wait checkpoint');
// A receiving task can finish after its last reply; that status change also wakes the sender.
const currentThread=teamCommunication.read(nativeTeam.id,thread.id);
let statusWait=issues.startAttempt(nativeTeam.id,waiter.id,'CFO','fixture-agent');
statusWait.execution.agent.status='waiting_team';statusWait.execution.agent.wait={kind:'team',conversationId:thread.id,seenMessageIds:currentThread.messages.map(message=>message.id),seenTaskStatus:'open'};
issues.saveExecution(nativeTeam.id,waiter.id,statusWait.execution,statusWait.executionRevision);
issues.finishAttempt(nativeTeam.id,waiter.id,{status:'waiting'});
assert.equal(issues.getById(nativeTeam.id,waiter.id).status,'blocked');
let receiving=issues.startAttempt(purchasingTeam.id,currentThread.issue_id,'CFO','fixture-agent');
const replyExecution=createTaskExecution([{type:'team.reply',conversationId:thread.id,body:currentThread.messages.at(-1).body}]);
replyExecution.steps[0].status='completed';replyExecution.steps[0].output={id:currentThread.messages.at(-1).id,status:'completed'};
issues.saveExecution(purchasingTeam.id,receiving.id,replyExecution,receiving.executionRevision);
issues.finishAttempt(purchasingTeam.id,receiving.id,{status:'done'});
assert.equal(issues.getById(nativeTeam.id,waiter.id).status,'open');
assert.equal(issues.getById(nativeTeam.id,waiter.id).execution.agent.events.at(-1).taskStatus,'done');

// Owner replies/new work bypass the heartbeat clock, while retaining the lease.
const periodicRun=automation.begin(nativeTeam.id,{lane:'roles',triggerType:'manual'});
automation.finish(nativeTeam.id,periodicRun.runId,{status:'completed',nextAt:Date.now()+3600000});
assert.equal(automation.begin(nativeTeam.id,{lane:'roles'}).reason,'not_due');
const eventRun=automation.begin(nativeTeam.id,{lane:'roles',triggerType:'event',executorId:'fixture-worker'});
assert.equal(eventRun.acquired,true);
const otherRun=automation.begin(purchasingTeam.id,{lane:'roles',triggerType:'event',executorId:'other-worker'});
assert.equal(otherRun.acquired,true);
assert.deepEqual(automation.interruptExecutor('fixture-worker'),[nativeTeam.id]);
assert.equal(automation.getState(nativeTeam.id).leaseOwner,null);
assert.equal(automation.getState(purchasingTeam.id).leaseOwner,otherRun.runId,'one executor cannot release another executor’s lease');
automation.finish(purchasingTeam.id,otherRun.runId,{status:'completed'});

const archivedWait=createAgentExecution(await captureHarness(nativeTeam,'CFO','fixture-agent'));
archivedWait.agent.status='waiting_team';archivedWait.agent.wait={kind:'team',conversationId:thread.id,seenMessageIds:[]};archivedWait.agent.instructions='Old private execution instructions';
const toRestore=issues.create(nativeTeam.id,{title:'Await a live reply',assigneeRole:'CFO',execution:archivedWait});issues.update(nativeTeam.id,toRestore.id,{status:'blocked'});
const nativeBackup=portability.exportBundle(nativeTeam.id), nativeRestore=portability.importBundle(nativeBackup);
const restoredWait=issues.list(nativeRestore.id).find(task=>task.title==='Await a live reply');
assert.equal(nativeRestore.status,'paused');assert.equal(restoredWait.status,'blocked');
assert.equal(restoredWait.execution.agent.status,'blocked');assert.equal(restoredWait.execution.agent.wait,undefined);
assert.equal(restoredWait.execution.harness,undefined);assert.equal(restoredWait.execution.agent.instructions,undefined);
const reviewedRestore=issues.reopen(nativeRestore.id,restoredWait.id);
assert.equal(reviewedRestore.execution.agent.status,'running');
assert.ok(reviewedRestore.execution.agent.events.some(event=>event.type==='restored'));
const exited=automation.begin(nativeTeam.id,{lane:'roles',triggerType:'event',executorId:'123456:71'});
assert.ok(exited.acquired);assert.deepEqual(automation.recoverStoppedExecutors(pid=>pid!==123456),[nativeTeam.id]);
console.log('PASS: event wake bypasses periodic cadence; crashed executors release only their leases; restored waits require review and new live destinations');
const scheduler=await import('../../../src/services/company/heartbeat.js');
const workflowTeam = { ...structuredClone(nativeTeam), id: 'workflow-team', name: 'Meditation', workspace: { executionWorkflowId: 'meditation-forge-v1.0.0' } };
companies.save(workflowTeam);
const decisionsBeforeWorkflow = decisions;
assert.equal((await tickCEO(workflowTeam)).reason, 'workflow_tasks_only');
assert.equal((await scheduler.manualCEOTick(workflowTeam)).reason, 'workflow_tasks_only');
assert.equal(decisions, decisionsBeforeWorkflow, 'workflow planning must not call inference');
assert.equal(goals.list(workflowTeam.id).length, 0);
assert.equal(issues.list(workflowTeam.id).length, 0);
assert.equal(automation.recent(workflowTeam.id).length, 0, 'idle workflow teams do not consume a planning lease');
console.log('PASS: workflow teams skip direct and scheduled CEO planning without inference, fabricated work or a lease');
const readinessGoal = goals.create(workflowTeam.id, { title: 'Verify team readiness', createdBy: 'ceo' });
const readinessExecution = createTaskExecution([{ type: 'runWorkflow', workflowId: workflowTeam.workspace.executionWorkflowId, inputs: { enableInputCollection: true } }]);
const readinessTask = issues.create(workflowTeam.id, { title: 'Amend system configuration', assigneeRole: 'CEO', createdBy: 'ceo', goalId: readinessGoal.id, execution: readinessExecution });
assert.equal((await tickRole(workflowTeam, 'CEO')).reason, 'autonomous_workflow_task');
assert.equal(decisions, decisionsBeforeWorkflow, 'legacy readiness work cannot restart an autonomous planner');
const retainedReadiness = issues.getById(workflowTeam.id, readinessTask.id);
assert.equal(retainedReadiness.status, 'blocked');
assert.deepEqual(retainedReadiness.execution, readinessExecution, 'retain the original plan for inspection');
assert.match(retainedReadiness.lastError, /earlier autonomous plan/);
assert.equal(goals.getById(workflowTeam.id, readinessGoal.id).status, 'active', 'do not erase or complete the retained goal');
const automaticReport = createTaskExecution([{ type: 'publishFinancialReport', text: 'Unrequested financial setup report', reason: 'Verify team readiness' }]);
const approvalTask = issues.create(workflowTeam.id, { title: 'Verify financial setup', assigneeRole: 'CFO', createdBy: 'ceo', goalId: readinessGoal.id, execution: automaticReport });
const staleWorkflowApproval = approvals.enqueue(workflowTeam.id, { cls: 'publishFinancialReport', action: automaticReport.steps[0].action, role: 'CFO', requestedBy: 'fixture-agent', issueId: approvalTask.id, stepId: 'step1' });
Object.assign(automaticReport.steps[0], { status: 'waiting_approval', approvalId: staleWorkflowApproval.id, resolvedAction: automaticReport.steps[0].action });
issues.startAttempt(workflowTeam.id, approvalTask.id, 'CFO', 'fixture-agent');
issues.saveExecution(workflowTeam.id, approvalTask.id, automaticReport, 0);
issues.finishAttempt(workflowTeam.id, approvalTask.id, { status: 'queued' });
const approvalTaskBefore = issues.getById(workflowTeam.id, approvalTask.id);
await assert.rejects(() => resumeApprovedTask(workflowTeam, staleWorkflowApproval), /earlier autonomous plan/);
assert.deepEqual(issues.getById(workflowTeam.id, approvalTask.id), approvalTaskBefore, 'an obsolete approval cannot claim or change the retained task');
assert.ok(approvals.pending(workflowTeam.id).some(item => item.id === staleWorkflowApproval.id), 'keep the approval available for explicit rejection');
assert.equal(distribution.listCatalog(workflowTeam.id).length, 0, 'approval continuation cannot bypass the workflow planning guard');
const requestedGoal = goals.create(workflowTeam.id, { title: 'Create an owner-requested meditation', createdBy: 'user' });
const requestedExecution = createTaskExecution([{ type: 'runWorkflow', workflowId: workflowTeam.workspace.executionWorkflowId, inputs: {} }]);
requestedExecution.steps[0].status = 'requires_input';
const requestedTask = issues.create(workflowTeam.id, { title: 'Create a meditation', assigneeRole: 'CEO', createdBy: 'ceo', goalId: requestedGoal.id, execution: requestedExecution });
issues.update(workflowTeam.id, requestedTask.id, { status: 'open' });
assert.notEqual((await tickRole(workflowTeam, 'CEO')).reason, 'autonomous_workflow_task');
assert.equal(issues.getById(workflowTeam.id, requestedTask.id).execution.steps[0].status, 'requires_input');
assert.equal(decisions, decisionsBeforeWorkflow, 'explicit interactive work remains in its workspace without planner repairs');
console.log('PASS: earlier autonomous readiness work is retained for review while owner-requested workflow tasks remain executable');
scheduler.start(nativeTeam);
const renameRun=await beginHarness(nativeTeam,{lane:'roles',triggerType:'manual'});
try {
  const renamed={...nativeTeam,name:'Finance Martin renamed',updatedAt:Date.now()};
  companies.save(renamed);scheduler.start(renamed);
  assert.equal((await renameRun.check()).ok,true,'a display rename must not interrupt active business work');
  await renameRun.finish({status:'completed'});
} finally {renameRun.dispose();scheduler.stopAll();}
console.log('PASS: display changes keep the active team harness running');


// A network retry or a journal-write failure must not schedule paid work twice.
const paidJobReference = `4663:0x${'4'.padStart(40, '0')}:0x${'7'.repeat(64)}`;
const paidInput = { title: 'Paid worker fixture', assigneeRole: 'CEO', assigneeCompanion: 'fixture-agent', externalJobReference: paidJobReference };
const firstPaidTask = issues.create(charter.id, paidInput);
const repeatedPaidTask = issues.create(charter.id, paidInput);
assert.equal(firstPaidTask.id, repeatedPaidTask.id);
assert.notEqual(issues.create('unrelated-company', paidInput).id, firstPaidTask.id);
assert.throws(() => issues.create(charter.id, { ...paidInput, externalJobReference: '../../private' }), /Invalid funded job/);
console.log('PASS: paid worker assignments are idempotent per company and isolated across teams');

db.close();
