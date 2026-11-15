// Business reason for every case: a team must never lose, strand or silently
// misreport work when an owner, a crash or another team changes its course.
import assert from 'node:assert/strict';
import { get } from './connection.js';
import * as companies from '../../../src/main/db/repos/companies.js';
import * as issues from '../../../src/main/db/repos/issues.js';
import * as goals from '../../../src/main/db/repos/goals.js';
import * as approvals from '../../../src/main/db/repos/approvals.js';
import * as audit from '../../../src/main/db/repos/audit.js';
import { createTaskExecution } from '../../../src/services/company/taskExecution.js';
import { createAgentExecution } from '../../../src/services/company/agentLoop.js';
import { makeCharter } from '../../../src/services/company/charter.js';
export {};

const { db } = get();
const id = 'reliability-team';
companies.save({ ...makeCharter({ name: 'Reliability', mission: 'Finish what was asked.' }), id, status: 'active', demoMode: false });
const trail = action => audit.all(id).filter(entry => entry.action === action);
const step = type => createTaskExecution([{ type }]);

// 1. A dependent task is told when its prerequisite can no longer finish.
{
  const parent = issues.create(id, { title: 'Collect signed order', assigneeRole: 'CSO' });
  const child = issues.create(id, { title: 'Invoice the signed order', assigneeRole: 'CFO', parentIssueId: parent.id });
  issues.update(id, parent.id, { status: 'cancelled' });
  let blocked = issues.getById(id, child.id);
  assert.equal(blocked.status, 'blocked', 'a child of a cancelled prerequisite must not stay open and unclaimable');
  assert.equal(blocked.lastError, issues.PREREQUISITE_BLOCKED);
  assert.throws(() => issues.reopen(id, child.id), /prerequisite/i, 'reopening cannot produce another silent wait');
  issues.reopen(id, parent.id);
  assert.equal(issues.getById(id, child.id).status, 'open', 'restoring the prerequisite restores its dependents');
  issues.remove(id, parent.id);
  blocked = issues.getById(id, child.id);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.parentIssueId, null, 'a deleted prerequisite leaves the owner free to run the task alone');
  assert.equal(issues.reopen(id, child.id).status, 'open');
  assert.equal(issues.claimNextForRole(id, 'CFO', 'agent').id, child.id);
  issues.update(id, child.id, { status: 'cancelled' });
  console.log('PASS: cancelled or deleted prerequisites surface on dependent tasks');
}

// 2. An owner change during a running step keeps the possible effect reviewable.
{
  const task = issues.create(id, { title: 'Send supplier payment notice', assigneeRole: 'CFO', execution: step('email.send') });
  const claimed = issues.claimNextForRole(id, 'CFO', 'agent');
  claimed.execution.steps[0].status = 'running';
  issues.saveExecution(id, task.id, claimed.execution, claimed.executionRevision);
  const paused = issues.update(id, task.id, { status: 'blocked' });
  assert.equal(paused.execution.steps[0].status, 'unknown', 'a step that may have been sent is never left "running" or replayable');
  assert.equal(issues.attempts(task.id).at(-1).status, 'interrupted');
  assert.throws(() => issues.saveExecution(id, task.id, paused.execution, paused.executionRevision), /no longer running/);
  issues.reconcileExecution(id, task.id, 'step1', { decision: 'not_performed', evidence: 'Mail provider shows no accepted message.' });
  assert.equal(issues.getById(id, task.id).status, 'open');
  assert.equal(trail('reconcileExecution').length, 1, 'the owner decision is in the audit trail');
  issues.update(id, task.id, { status: 'cancelled' });
  const busy = issues.create(id, { title: 'Running report', assigneeRole: 'CFO' });
  issues.claimNextForRole(id, 'CFO', 'agent');
  assert.throws(() => issues.remove(id, busy.id), /still running/, 'running work cannot be deleted from under its executor');
  issues.update(id, busy.id, { status: 'cancelled' });
  console.log('PASS: owner changes to running work stay reviewable and attributable');
}

// 3. Cancelling or deleting a task retires its pending approval.
{
  const task = issues.create(id, { title: 'Publish price list', assigneeRole: 'CMO', execution: step('email.send') });
  const claimed = issues.claimNextForRole(id, 'CMO', 'agent');
  const approval = approvals.enqueue(id, { cls: 'email.send', action: claimed.execution.steps[0].action, role: 'CMO', requestedBy: 'agent', issueId: task.id, stepId: 'step1' });
  Object.assign(claimed.execution.steps[0], { status: 'waiting_approval', approvalId: approval.id, resolvedAction: claimed.execution.steps[0].action });
  issues.saveExecution(id, task.id, claimed.execution, claimed.executionRevision);
  issues.finishAttempt(id, task.id, { status: 'queued' });
  assert.equal(approvals.pending(id).length, 1);
  issues.update(id, task.id, { status: 'cancelled' });
  assert.equal(approvals.pending(id).length, 0, 'a cancelled task leaves nothing for the owner to approve by mistake');

  // An approval decided outside the task flow leaves a recoverable step.
  const lost = issues.create(id, { title: 'Send renewal offer', assigneeRole: 'CMO', execution: step('email.send') });
  const lostClaim = issues.claimNextForRole(id, 'CMO', 'agent');
  const lostApproval = approvals.enqueue(id, { cls: 'email.send', action: lostClaim.execution.steps[0].action, role: 'CMO', requestedBy: 'agent', issueId: lost.id, stepId: 'step1' });
  Object.assign(lostClaim.execution.steps[0], { status: 'waiting_approval', approvalId: lostApproval.id, resolvedAction: lostClaim.execution.steps[0].action });
  issues.saveExecution(id, lost.id, lostClaim.execution, lostClaim.executionRevision);
  issues.finishAttempt(id, lost.id, { status: 'queued' });
  assert.throws(() => issues.reconcileExecution(id, lost.id, 'step1', { decision: 'not_performed', evidence: 'Still pending, nothing to review.' }), /does not need outcome review/);
  approvals.approve(id, lostApproval.id); // decided outside the task flow: the task never ran it
  assert.equal(issues.reconcileExecution(id, lost.id, 'step1', { decision: 'not_performed', evidence: 'Approved outside the task; nothing was sent.' }).status, 'open');
  issues.update(id, lost.id, { status: 'cancelled' });
  console.log('PASS: approvals cannot outlive, or be lost from, their task');
}

// 4. The business outcome is recorded atomically with the last task.
{
  const goal = goals.create(id, { title: 'Customer receives the corrected quote' });
  const task = issues.create(id, { title: 'Prepare corrected quote', assigneeRole: 'CFO', goalId: goal.id, execution: step('produce') });
  const claimed = issues.claimNextForRole(id, 'CFO', 'agent');
  Object.assign(claimed.execution.steps[0], { status: 'completed', output: { id: 'quote-1', status: 'completed' } });
  issues.saveExecution(id, task.id, claimed.execution, claimed.executionRevision);
  issues.finishAttempt(id, task.id, { status: 'done' });
  assert.equal(goals.getById(id, goal.id).status, 'completed', 'no separate call is needed for the goal to reflect finished work');
  console.log('PASS: goal completion commits with the final task');
}

// 5. Retries are bounded and the owner is told when they run out.
{
  const task = issues.create(id, { title: 'Summarise receivables', assigneeRole: 'CFO', maxAttempts: 2 });
  issues.claimNextForRole(id, 'CFO', 'agent');
  let state = issues.finishAttempt(id, task.id, { status: 'error', error: 'model unavailable', retryable: true });
  assert.equal(state.status, 'open');
  assert.ok(state.nextAttemptAt > Date.now(), 'a retry waits for its backoff');
  assert.equal(issues.claimNextForRole(id, 'CFO', 'agent'), null);
  db.prepare('UPDATE issues SET next_attempt_at = 1 WHERE id = ?').run(task.id);
  issues.claimNextForRole(id, 'CFO', 'agent');
  state = issues.finishAttempt(id, task.id, { status: 'error', error: 'model unavailable', retryable: true });
  assert.equal(state.status, 'blocked');
  assert.equal(trail('issue.escalated').filter(entry => entry.issueId === task.id).length, 1, 'exhausted retries are escalated, not just stopped');
  assert.equal(issues.reopen(id, task.id).attemptCount, 0);
  issues.update(id, task.id, { status: 'cancelled' });

  // A task that stops the app before any effect cannot be reclaimed forever.
  const poison = issues.create(id, { title: 'Crashes the runtime', assigneeRole: 'CFO', maxAttempts: 2, execution: step('produce') });
  for (let round = 1; round <= 2; round++) {
    db.prepare('UPDATE issues SET next_attempt_at = NULL WHERE id = ?').run(poison.id);
    assert.equal(issues.claimNextForRole(id, 'CFO', 'agent').id, poison.id);
    issues.recoverStale(id, Date.now() + 1000);
    const row = issues.getById(id, poison.id);
    assert.equal(row.attemptCount, round);
    assert.equal(row.status, round < 2 ? 'open' : 'blocked');
    if (round < 2) assert.ok(row.nextAttemptAt > Date.now(), 'recovered work backs off before the next claim');
  }
  assert.match(issues.getById(id, poison.id).lastError, /Interrupted 2 times/);
  issues.update(id, poison.id, { status: 'cancelled' });
  console.log('PASS: retries and crash recovery are bounded and escalate to the owner');
}

// 6. A wait on another team that cannot be answered becomes the owner's decision.
{
  const waitOn = wait => {
    const task = issues.create(id, { title: 'Await supplier team', assigneeRole: 'CFO' });
    issues.claimNextForRole(id, 'CFO', 'agent');
    const execution = createAgentExecution({ version: 1, teamId: id });
    execution.agent.status = 'waiting_team'; execution.agent.wait = wait;
    issues.saveExecution(id, task.id, execution, 0);
    issues.finishAttempt(id, task.id, { status: 'waiting' });
    return task.id;
  };
  const gone = waitOn({ kind: 'team', conversationId: 'deleted-thread', seenMessageIds: [], since: Date.now(), reason: 'supplier quote' });
  const malformed = waitOn(undefined);
  // Reporting the wait already ran the wake-up; a second pass has nothing left to strand.
  assert.deepEqual(issues.wakeTeamWaits(id), { resumed: 0, escalated: 0 });
  for (const taskId of [gone, malformed]) {
    const row = issues.getById(id, taskId);
    assert.equal(row.execution.agent.status, 'waiting_owner');
    assert.match(row.execution.agent.wait.question, /no longer available/);
    assert.equal(issues.answerQuestion(id, taskId, 'Proceed without the supplier team.').status, 'open', 'the owner can always move the task on');
    issues.update(id, taskId, { status: 'cancelled' });
  }
  assert.equal(trail('answerQuestion').length, 2, 'owner answers are part of the audit trail');
  // A reply that is merely late is escalated after the team's patience window.
  companies.save({ ...makeCharter({ name: 'Supplier desk', mission: 'Quote.' }), id: 'supplier-team', status: 'active', demoMode: false });
  db.prepare('INSERT INTO team_threads(id,source_company_id,target_company_id,source_team_name,target_team_name,target_role,subject,context,request_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('late-thread', id, 'supplier-team', 'Reliability', 'Supplier desk', 'CFO', 'Quote', '{}', 'late-key', Date.now());
  const fresh = waitOn({ kind: 'team', conversationId: 'late-thread', seenMessageIds: [], since: Date.now(), reason: 'supplier quote' });
  assert.equal(issues.getById(id, fresh).execution.agent.status, 'waiting_team', 'a recent request keeps waiting');
  const late = waitOn({ kind: 'team', conversationId: 'late-thread', seenMessageIds: [], since: Date.now() - 73 * 3600_000, reason: 'supplier quote' });
  assert.match(issues.getById(id, late).execution.agent.wait.question, /has not replied \(supplier quote\)/);
  for (const taskId of [fresh, late]) issues.update(id, taskId, { status: 'cancelled' });
  // A malformed wait in any team never blocks another task from reporting its result.
  waitOn(undefined);
  db.prepare("UPDATE issues SET execution = json_remove(execution, '$.agent.events') WHERE json_extract(execution,'$.agent.status')='waiting_team'").run();
  const other = issues.create(id, { title: 'Unrelated report', assigneeRole: 'CMO' });
  issues.claimNextForRole(id, 'CMO', 'agent');
  assert.equal(issues.finishAttempt(id, other.id, { status: 'error', error: 'x', retryable: false }).status, 'blocked');
  console.log('PASS: unanswerable team waits escalate to the owner');
}
