import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskExecution, resolveTaskInputs, runTaskExecution, executionOutcome } from '../src/services/company/taskExecution.js';
import { routeGoalToRole, resolveRoleCompanion, makeCharter } from '../src/services/company/charter.js';
import { executeCompanyWorkflow, companyWorkflowMode } from '../src/services/company/workflowExecution.js';
import { executeCreation } from '../src/services/company/createCapabilities.js';
import { DEFAULT_3D_LLM_ID, DEFAULT_3D_LLM_TIER } from '../src/config/modelDefaults.js';
function runtime(actions, overrides = {}) {
  let saved = createTaskExecution(actions); const calls = [];
  return { get saved() { return saved; }, calls, options: { execution: saved, save: async state => { saved = structuredClone(state); }, gate: async () => ({ pass: true }), dispatch: async action => { calls.push(action); return { id: 'receipt', status: 'completed' }; }, ...overrides } };
}
test('ordinary business briefs route by subject, not an arbitrary first word', () => {
  for (const title of ['Follow up on overdue invoices', 'Please review receivables', 'Relancer les factures impayées']) assert.equal(routeGoalToRole({ directive: title }), 'CFO');
  assert.equal(routeGoalToRole({ directive: 'Prepare a marketing campaign' }), 'CMO');
  assert.equal(routeGoalToRole({ directive: 'Review software bugs' }), 'RnDLead');
  const charter = makeCharter({ name: 'Test', mission: 'Test' }); charter.roles.CEO = { companion: 'ceo-agent' };
  assert.equal(resolveRoleCompanion(charter, 'CFO').companion, 'ceo-agent');
});
test('saved outputs flow into later actions without inventing IDs or losing structured data', async () => {
  const fixture = runtime([{ stepId: 'lookup', type: 'qbo.reportAR' }, { type: 'produce', source: { $ref: 'lookup.report' } }], { dispatch: async action => action.type === 'qbo.reportAR' ? { id: 'real-report', report: { rows: [{ invoice: 'invoice-17', overdue: 350 }] } } : { id: 'draft', source: action.source } });
  const state = await runTaskExecution(fixture.options);
  assert.deepEqual(state.steps[1].resolvedAction.source, { rows: [{ invoice: 'invoice-17', overdue: 350 }] });
  assert.equal(executionOutcome(state), 'done');
  assert.throws(() => resolveTaskInputs({ $ref: 'lookup.missing' }, state.steps), /Missing result/);
  assert.throws(() => resolveTaskInputs({ $ref: 'lookup.__proto__' }, state.steps), /Missing result/);
});
test('approval pauses ordered execution and resumption cannot repeat a completed step', async () => {
  const fixture = runtime([{ stepId: 'draft', type: 'produce' }, { stepId: 'send', type: 'email.send', contentId: { $ref: 'draft.id' } }, { type: 'notion.createPage' }], { gate: async action => action.type === 'email.send' ? { pass: false, queued: 'approval-1' } : { pass: true } });
  let state = await runTaskExecution(fixture.options);
  assert.equal(fixture.calls.length, 1);
  assert.equal(state.steps[2].status, 'planned');
  state = await runTaskExecution({ ...fixture.options, execution: fixture.saved, approval: { id: 'approval-1', stepId: 'send', action: state.steps[1].resolvedAction } });
  assert.deepEqual(fixture.calls.map(action => action.type), ['produce', 'email.send', 'notion.createPage']);
  assert.equal(executionOutcome(state), 'done');
});
test('changed approval details, absent storage and invalid actions fail closed', async () => {
  const fixture = runtime([{ type: 'email.send', to: 'approved@example.invalid' }], { gate: async () => ({ pass: false, queued: 'approval' }) });
  const pending = await runTaskExecution(fixture.options);
  const state = await runTaskExecution({ ...fixture.options, execution: pending, approval: { id: 'approval', stepId: 'step1', action: { type: 'email.send', to: 'changed@example.invalid' } } });
  assert.equal(fixture.calls.length, 0);
  assert.equal(executionOutcome(state), 'blocked');
  const noStore = runtime([{ type: 'produce' }], { save: async () => { throw new Error('Disk full'); } });
  await assert.rejects(runTaskExecution(noStore.options), /Disk full/);
  assert.equal(noStore.calls.length, 0);
  assert.throws(() => createTaskExecution([]), /concrete actions/);
});
test('null, acknowledgements, simulations, pending payments and unsupported handlers never complete a task', async () => {
  for (const result of [null, { ok: true }, { ok: false, error: 'not implemented', status: 'unsupported' }, { id: 'fake', simulated: true }, { id: 'payment', status: 'pending' }]) {
    const fixture = runtime([{ type: 'action' }, { type: 'later' }], { dispatch: async () => result });
    const state = await runTaskExecution(fixture.options);
    assert.equal(executionOutcome(state), 'blocked');
    assert.equal(state.steps[1].status, 'planned');
  }
});
test('interactive workflow input remains a workspace handoff, never a failed task to repair or replay', async () => {
  const fixture = runtime([{ type: 'runWorkflow', workflowId: 'meditation-forge-v1.0.0' }, { type: 'later' }], {
    dispatch: async () => ({ ok: false, status: 'requires_input', workflowId: 'meditation-forge-v1.0.0', error: 'Choose the meditation inputs in Production.', beforeDispatch: true }),
  });
  const state = await runTaskExecution(fixture.options);
  assert.equal(state.steps[0].status, 'requires_input');
  assert.equal(state.steps[0].safeToRevise, false);
  assert.match(state.steps[0].error, /meditation inputs/);
  assert.equal(state.steps[1].status, 'planned');
  assert.equal(executionOutcome(state), 'blocked');
  await runTaskExecution({ ...fixture.options, execution: state, dispatch: async () => assert.fail('Only the interactive workspace can continue this request') });
});
test('an uncertain external effect cannot be automatically replayed; pauses stop subsequent steps', async () => {
  let effects = 0;
  const fixture = runtime([{ type: 'email.send' }], { dispatch: async () => { effects++; throw new Error('Connection lost after sending request'); } });
  const state = await runTaskExecution(fixture.options);
  assert.equal(state.steps[0].status, 'unknown');
  await runTaskExecution({ ...fixture.options, execution: fixture.saved });
  assert.equal(effects, 1);
  let active = true;
  const paused = runtime([{ type: 'produce' }, { type: 'email.send' }], { canRun: async () => active, dispatch: async () => { active = false; return { id: 'draft' }; } });
  const stopped = await runTaskExecution(paused.options);
  assert.equal(stopped.steps[0].status, 'completed'); assert.equal(stopped.steps[1].status, 'planned'); assert.equal(executionOutcome(stopped), 'blocked');
});
test('a result checkpoint failure leaves the last durable step running for reconciliation', async () => {
  let saved, count = 0;
  const fixture = runtime([{ type: 'email.send' }], { save: async state => { if (++count > 1) throw new Error('Disk full'); saved = structuredClone(state); } });
  await assert.rejects(runTaskExecution(fixture.options), /Disk full/);
  assert.equal(saved.steps[0].status, 'running'); assert.equal(fixture.calls.length, 1);
});
test('an available workflow executes without legacy agent or role assignments', async () => {
  const skill = { id: 'fixture-workflow', name: 'Fixture workflow', execution: { type: 'javascript', execute() {} } };
  let saved, executed = 0, released = 0;
  const deps = { catalog: async () => [skill], agents: async () => [{ id: 'agent', assignedWorkflowIds: [] }], service: async () => ({ validateSkillInputs: () => ({ valid: true, normalizedInputs: { brief: 'Review service scope' } }), executeSkill: async (id, inputs, context) => { executed++; assert.equal(context.companyId, 'company'); assert.equal(context.issueId, 'task'); return { success: true, result: { text: 'Actual completed draft' } }; } }), checkModels: async () => {}, lock: async () => () => released++, save: async (id, value) => { saved = value; return { id: 'artifact', ...value }; } };
  const charter = { id: 'company', roles: { CFO: { assignedWorkflowIds: [] } } };
  const result = await executeCompanyWorkflow(charter, 'CFO', 'agent', { workflowId: skill.id }, { issueId: 'task', pendingId: 'approved' }, deps);
  assert.equal(result.id, 'artifact'); assert.equal(saved.meta.issueId, 'task'); assert.match(saved.payload, /Actual completed draft/); assert.equal(released, 1);
  assert.equal((await executeCompanyWorkflow(charter, 'CFO', 'other-agent', { workflowId: skill.id }, {}, deps)).ok, false);
  assert.equal(executed, 1);
  assert.equal(companyWorkflowMode({ execution: { type: 'custom', execute: () => ({ success: true }) } }), 'interactive');
  assert.equal(companyWorkflowMode({ id: 'chart-forecaster-v1.0.0', execution: { type: 'javascript', execute() {} } }), 'network');
  deps.service = async () => ({ validateSkillInputs: () => ({ valid: true, normalizedInputs: {} }), executeSkill: async () => ({ success: true, result: { results: [{ success: false, error: 'Model unavailable' }] } }) });
  const partial = await executeCompanyWorkflow(charter, 'CFO', 'agent', { workflowId: skill.id }, { issueId: 'task', pendingId: 'approved' }, deps);
  assert.equal(partial.ok, false); assert.equal(partial.status, 'requires_input'); assert.match(JSON.stringify(partial.partialResult), /Model unavailable/);
});
test('company 3D assets use Qwen3.8 Q4 K XL by default while preserving original source code', async () => {
  let options;
  const artifact = await executeCreation({ type: 'produce', pipeline: '3d', prompt: 'Create an asset' }, {}, { acquire: () => true, release() {}, chat: async (_prompt, opts) => { options = opts; return 'export default async function generate(params) { return new params.THREE.Group(); }'; } });
  assert.equal(options.llmModel, `llm_${DEFAULT_3D_LLM_ID}_${DEFAULT_3D_LLM_TIER}`);
  assert.equal(options.llmModel, 'llm_qwen3_8_27b_low_q4'); assert.equal(artifact.meta.format, 'javascript');
});


test('failure and in-flight receipts cannot unlock downstream subtasks just because they have an ID', async () => {
  for (const status of ['failed', 'error', 'cancelled', 'canceled', 'rejected', 'unsupported', 'pending', 'queued', 'running', 'processing', 'unknown']) {
    let dispatched = 0;
    const fixture = runtime([{ type: 'external.task' }, { type: 'publishContent' }], { dispatch: async () => { dispatched++; return { id: 'provider-job', status }; } });
    const state = await runTaskExecution(fixture.options);
    assert.equal(executionOutcome(state), 'blocked', status);
    assert.equal(state.steps[1].status, 'planned', status);
    await runTaskExecution({ ...fixture.options, execution: state });
    assert.equal(dispatched, 1, `${status}: no blind retry of a possible external effect`);
  }
  for (const result of [{ id: 'receipt', isError: true }, { id: 'receipt', error: 'Provider rejected input' }]) {
    const fixture = runtime([{ type: 'tool' }], { dispatch: async () => result });
    assert.equal(executionOutcome(await runTaskExecution(fixture.options)), 'blocked');
  }
});
