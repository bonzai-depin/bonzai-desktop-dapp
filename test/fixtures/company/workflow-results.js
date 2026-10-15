import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { get } from './connection.js';
import * as companies from '../../../src/main/db/repos/companies.js';
import * as issues from '../../../src/main/db/repos/issues.js';
import * as distribution from '../../../src/main/db/repos/distribution.js';
import * as approvals from '../../../src/main/db/repos/approvals.js';
import * as audit from '../../../src/main/db/repos/audit.js';
import * as blobs from '../../../src/main/db/blobs.js';
import { createTaskExecution } from '../../../src/services/company/taskExecution.js';
import { workflowResultInput } from '../../../src/services/company/workflowResults.js';

const { db } = get();
globalThis.fetch = () => { throw new Error('Workflow result storage must not fetch external media.'); };
companies.save({ id: 'production', name: 'Production', mode: 'solo', status: 'active' });
companies.save({ id: 'other-team', name: 'Other team', mode: 'solo', status: 'active' });
const workflowId = 'meditation-forge-v1.0.0';
const makeTask = (stepStatus = 'requires_input', extra = {}) => {
  const execution = createTaskExecution([{ type: 'runWorkflow', workflowId }]);
  execution.steps[0].status = stepStatus;
  Object.assign(execution, extra);
  const task = issues.create('production', { title: 'Create a meditation', assigneeRole: 'CEO', assigneeCompanion: 'agent', execution });
  if (task.status !== 'blocked') issues.update('production', task.id, { status: 'blocked' });
  return issues.getById('production', task.id);
};
const text = payload => ({ pipeline: 'text', prompt: 'Meditation script', payload, meta: { payloadEncoding: 'text' } });
const input = (sourceId = 'session-one', artifacts = [text('A complete meditation script.')]) => ({ workflowId, sourceId, artifacts });
const task = makeTask();
const saved = issues.saveWorkflowResult('production', task.id, input());
assert.equal(saved.issue.status, 'blocked', 'generation does not assert owner acceptance');
assert.equal(saved.issue.execution.steps[0].status, 'requires_input');
assert.equal(saved.issue.execution.steps[0].output.status, 'ready_for_review');
assert.equal(saved.records[0].meta.issueId, task.id);
assert.equal(saved.records[0].meta.workflowId, workflowId);
assert.equal(saved.records[0].payload, 'A complete meditation script.');
assert.throws(() => issues.update('production', task.id, { status: 'done' }), /recorded results/);
assert.throws(() => issues.saveWorkflowResult('other-team', task.id, input()), /blocked workflow task/);
assert.throws(() => issues.saveWorkflowResult('missing-team', task.id, input()), /Team is no longer/);
assert.throws(() => issues.saveWorkflowResult('production', task.id, { ...input(), workflowId: 'other-workflow' }), /interactive step/);
assert.throws(() => issues.saveWorkflowResult('production', task.id, input('empty', [])), /artifacts/);
assert.throws(() => issues.saveWorkflowResult('production', task.id, input('empty-text', [text(' ')])), /empty/);
assert.throws(() => issues.saveWorkflowResult('production', task.id, input('url', [{ pipeline: 'audio', payload: 'https://example.invalid/audio.wav' }])), /data URI or a local file/);
assert.throws(() => issues.saveWorkflowResult('production', task.id, input('bad-data', [{ pipeline: 'audio', payload: 'data:audio/wav;base64,@@@' }])), /valid base64/);

const duplicate = issues.saveWorkflowResult('production', task.id, input());
assert.deepEqual(duplicate.contentIds, saved.contentIds, 'a repeated completion event creates no second deliverable');
assert.equal(duplicate.issue.executionRevision, saved.issue.executionRevision);
assert.equal(distribution.listCatalog('production').length, 1);
const newer = issues.saveWorkflowResult('production', task.id, input('session-two', [text('The revised meditation script.')]));
const oldRetry = issues.saveWorkflowResult('production', task.id, input());
assert.deepEqual(oldRetry.contentIds, saved.contentIds);
assert.deepEqual(oldRetry.issue.execution.steps[0].output.contentIds, newer.contentIds, 'late retries cannot replace the newest result');
assert.throws(() => issues.reviewWorkflowResult('production', task.id, 'step1', { contentIds: saved.contentIds }), /latest saved/);
assert.throws(() => issues.reviewWorkflowResult('other-team', task.id, 'step1', { contentIds: newer.contentIds }), /blocked workflow/);
assert.throws(() => issues.reviewWorkflowResult('production', task.id, 'step1', { contentIds: [...newer.contentIds, ...newer.contentIds] }), /latest saved/);
const reviewed = issues.reviewWorkflowResult('production', task.id, 'step1', { contentIds: newer.contentIds });
assert.equal(reviewed.status, 'done');
assert.equal(reviewed.execution.steps[0].output.id, newer.contentIds[0]);
assert.equal(reviewed.execution.steps[0].output.verifiedBy, 'owner');
assert.deepEqual(issues.attempts(task.id).at(-1).result.contentIds, newer.contentIds);
assert.equal(distribution.listCatalog('production').length, 2, 'review preserves actual artifacts instead of adding pasted owner evidence');
assert.deepEqual(audit.filter('production', { action: 'reviewWorkflowResult' })[0].extra.contentIds, newer.contentIds);
assert.deepEqual(issues.saveWorkflowResult('production', task.id, input()).contentIds, saved.contentIds, 'An acknowledged recovery replay after review is read-only');
assert.equal(issues.getById('production', task.id).status, 'done');
assert.equal(distribution.listCatalog('production').length, 2);
assert.throws(() => issues.saveWorkflowResult('production', task.id, input('late')), /blocked workflow/);
assert.throws(() => issues.reviewWorkflowResult('production', task.id, 'step1', { contentIds: newer.contentIds }), /blocked workflow/);

const mediaTask = makeTask();
const localPath = path.join(process.env.WORKFLOW_FIXTURE_DIRECTORY, 'render.WAV');
fs.writeFileSync(localPath, 'durable audio fixture');
const mediaInput = input('media-session', [
  { pipeline: 'audio', payload: localPath, meta: { payloadEncoding: 'path', localPath } },
  { pipeline: 'image', payload: `data:image/png;base64,${Buffer.from('durable image fixture').toString('base64')}` },
]);
const media = issues.saveWorkflowResult('production', mediaTask.id, mediaInput);
fs.unlinkSync(localPath);
assert.equal(blobs.read(media.records[0].blobId, media.records[0].blobExt).toString(), 'durable audio fixture');
assert.equal(blobs.read(media.records[1].blobId, media.records[1].blobExt).toString(), 'durable image fixture');
assert.equal(media.records[0].blobExt, 'wav');
assert.equal(media.records[0].payload, null);
assert.equal(media.records[0].meta.localPath, undefined, 'the durable result no longer depends on a generation temp file');
assert.deepEqual(issues.saveWorkflowResult('production', mediaTask.id, mediaInput).contentIds, media.contentIds, 'retry uses saved blobs after the temporary source is gone');
assert.equal(issues.reviewWorkflowResult('production', mediaTask.id, 'step1', { contentIds: media.contentIds }).status, 'done');

for (const status of ['planned', 'waiting_approval', 'rejected', 'unknown', 'running', 'completed']) {
  const guarded = makeTask(status);
  assert.throws(() => issues.saveWorkflowResult('production', guarded.id, input()), /interactive step|running action|pending approval/, status);
  assert.throws(() => issues.reviewWorkflowResult('production', guarded.id, 'step1', { contentIds: saved.contentIds }), /no saved result|running action|pending approval/, status);
}
for (const status of ['in_progress', 'cancelled']) {
  const guarded = makeTask();
  issues.update('production', guarded.id, { status });
  assert.throws(() => issues.saveWorkflowResult('production', guarded.id, input()), /blocked workflow/, status);
}
const approvalTask = makeTask();
approvals.enqueue('production', { cls: 'runWorkflow', issueId: approvalTask.id, stepId: 'step1', action: { type: 'runWorkflow', workflowId } });
assert.throws(() => issues.saveWorkflowResult('production', approvalTask.id, input()), /pending approval/);
const failedTask = makeTask('failed');
const failedExecution = failedTask.execution;
failedExecution.steps[0].output = { status: 'requires_input', workflowId, ok: false };
db.prepare('UPDATE issues SET execution = ? WHERE id = ?').run(JSON.stringify(failedExecution), failedTask.id);
assert.equal(issues.saveWorkflowResult('production', failedTask.id, input()).issue.execution.steps[0].output.status, 'ready_for_review');

const missingTask = makeTask();
const missing = issues.saveWorkflowResult('production', missingTask.id, input());
distribution.remove('production', missing.contentIds[0]);
assert.throws(() => issues.reviewWorkflowResult('production', missingTask.id, 'step1', { contentIds: missing.contentIds }), /missing or belongs/);
const foreignTask = makeTask();
const foreign = issues.saveWorkflowResult('production', foreignTask.id, input());
db.prepare('UPDATE published_content SET company_id = ? WHERE id = ?').run('other-team', foreign.contentIds[0]);
assert.throws(() => issues.reviewWorkflowResult('production', foreignTask.id, 'step1', { contentIds: foreign.contentIds }), /missing or belongs/);

const atomicTask = makeTask();
const countBefore = distribution.listCatalog('production').length;
db.exec("CREATE TRIGGER reject_workflow_fixture BEFORE INSERT ON published_content WHEN NEW.prompt = 'Reject artifact' BEGIN SELECT RAISE(ABORT, 'fixture write failed'); END;");
assert.throws(() => issues.saveWorkflowResult('production', atomicTask.id, input('atomic', [text('First valid artifact.'), { ...text('Second valid artifact.'), prompt: 'Reject artifact' }])), /fixture write failed/);
assert.equal(distribution.listCatalog('production').length, countBefore, 'catalog and execution change atomically');
assert.deepEqual(issues.getById('production', atomicTask.id), atomicTask);
db.exec('DROP TRIGGER reject_workflow_fixture');

const agentTask = makeTask('requires_input', { agent: { status: 'waiting_owner', turns: 4, wait: { kind: 'owner' } }, harness: { configurationRevision: 2 }, pauseReason: 'Owner input required.' });
const agentSaved = issues.saveWorkflowResult('production', agentTask.id, input());
const agentReviewed = issues.reviewWorkflowResult('production', agentTask.id, 'step1', { contentIds: agentSaved.contentIds });
assert.equal(agentReviewed.status, 'open', 'an agent must assess remaining work before task completion');
assert.equal(agentReviewed.execution.agent.status, 'running');
assert.equal(agentReviewed.execution.agent.turns, 0);
assert.equal(agentReviewed.execution.agent.wait, undefined);
assert.equal(agentReviewed.execution.harness, undefined);
assert.equal(agentReviewed.execution.harnessHistory[0].configurationRevision, 2);
assert.equal(agentReviewed.execution.steps[0].status, 'completed', 'continuation cannot replay the reviewed result');

const streamExecution = createTaskExecution([{ type: 'runWorkflow', workflowId: 'live-streaming-v1.0.0' }]);
streamExecution.steps[0].status = 'requires_input';
const streamTask = issues.create('production', { title: 'Generate the introduction audio', assigneeRole: 'CEO', execution: streamExecution });
const streamInput = workflowResultInput('live-streaming-v1.0.0', { id: 'stream-item', type: 'audio', data: Buffer.from('actual stream response').toString('base64'), prompt: 'Introduction' });
const streamSaved = issues.saveWorkflowResult('production', streamTask.id, streamInput);
const streamAudio = streamSaved.records.find(record => record.pipeline === 'audio');
assert.equal(blobs.read(streamAudio.blobId, streamAudio.blobExt).toString(), 'actual stream response', 'the actual renderer adapter and SQLite storage agree on streamed media');
assert.equal(streamSaved.issue.status, 'blocked');

console.log('Local durable workflow results verified, including owner review and rejected stale/cross-team writes.');
