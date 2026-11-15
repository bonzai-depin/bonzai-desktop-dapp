// Business reason for every case: recurring work must happen once per occurrence,
// a deadline must be noticed when it is missed, and a goal must not be reported
// as achieved until the owner has confirmed the business result.
import assert from 'node:assert/strict';
import { get } from './connection.js';
import * as companies from '../../../src/main/db/repos/companies.js';
import * as issues from '../../../src/main/db/repos/issues.js';
import * as goals from '../../../src/main/db/repos/goals.js';
import * as schedules from '../../../src/main/db/repos/schedules.js';
import * as audit from '../../../src/main/db/repos/audit.js';
import * as portability from '../../../src/main/db/repos/companyPortability.js';
import { createTaskExecution } from '../../../src/services/company/taskExecution.js';
import { makeCharter } from '../../../src/services/company/charter.js';
export {};

const { db } = get();
const roles = { CEO: { companion: 'lead' }, CFO: { companion: 'finance' } };
const team = (id, extra = {}) => { companies.save({ ...makeCharter({ name: id, mission: 'Run the back office.', roles }), id, status: 'active', demoMode: false, ...extra }); return id; };
const id = team('schedule-team');
const trail = (companyId, action) => audit.all(companyId).filter(entry => entry.action === action);
const scheduled = companyId => issues.list(companyId).filter(issue => issue.createdBy === 'schedule');
const HOUR = 3_600_000, DAY = 24 * HOUR;
const finish = (companyId, task) => {
  // Start this task directly: earlier scheduled work is still waiting in the same role's queue.
  issues.startAttempt(companyId, task.id, task.assigneeRole, 'finance');
  const claimed = issues.getById(companyId, task.id);
  Object.assign(claimed.execution.steps[0], { status: 'completed', output: { id: 'result', status: 'completed' } });
  issues.saveExecution(companyId, task.id, claimed.execution, claimed.executionRevision);
  return issues.finishAttempt(companyId, task.id, { status: 'done' });
};
const due = (scheduleId, at) => db.prepare('UPDATE company_schedules SET next_run_at = ? WHERE id = ?').run(at, scheduleId);

// 1. A due schedule creates exactly one task and moves to its next occurrence.
const weekly = schedules.create(id, { title: 'Send the weekly cash report', description: 'Balances and overdue invoices.', assigneeRole: 'CFO', priority: 'high', cadence: { every: 'week', weekday: 1, at: '09:00' } });
{
  assert.ok(weekly.nextRunAt > Date.now(), 'a new schedule waits for its first occurrence instead of firing on creation');
  assert.deepEqual(schedules.runDue(id), { created: [], skipped: [] }, 'nothing is created before the occurrence is due');
  const now = weekly.nextRunAt + 1000;
  const run = schedules.runDue(id, now);
  assert.equal(run.created.length, 1);
  const [task] = scheduled(id);
  assert.equal(task.title, 'Send the weekly cash report');
  assert.equal(task.assigneeRole, 'CFO');
  assert.equal(task.priority, 'high');
  assert.ok(task.labels.includes(`schedule:${weekly.id}`), 'the task stays traceable to the schedule that produced it');
  const after = schedules.getById(id, weekly.id);
  assert.ok(after.nextRunAt > now, 'the schedule advanced past this occurrence');
  assert.equal(task.dueAt, after.nextRunAt, 'the task is due before the next occurrence starts');
  assert.equal(after.lastIssueId, task.id);
  assert.equal(schedules.runDue(id, now + 60_000).created.length, 0, 'the same occurrence never produces a second task');
  assert.equal(trail(id, 'schedule.run').length, 1);
  console.log('PASS: a due schedule creates one task and advances');
}

// 2. Unfinished previous work is not duplicated, and the owner can see why nothing ran.
{
  const before = schedules.getById(id, weekly.id);
  const run = schedules.runDue(id, before.nextRunAt + 1000);
  assert.deepEqual(run.created, []);
  assert.deepEqual(run.skipped, [weekly.id]);
  assert.equal(scheduled(id).length, 1, 'a late report must not become two reports in the backlog');
  assert.match(trail(id, 'schedule.skipped')[0].note, /previous run is unfinished/);
  const after = schedules.getById(id, weekly.id);
  assert.ok(after.nextRunAt > before.nextRunAt, 'the skipped occurrence is not retried every minute');
  // Once the previous run is closed, the next occurrence runs again.
  issues.update(id, before.lastIssueId, { status: 'cancelled' });
  assert.equal(schedules.runDue(id, after.nextRunAt + 1000).created.length, 1);
  assert.equal(scheduled(id).length, 2);
  console.log('PASS: an unfinished occurrence blocks a duplicate and is audited');
}

// 3. Occurrences missed while the app was closed collapse into a single run.
{
  const catchUp = team('catch-up-team');
  const daily = schedules.create(catchUp, { title: 'Reconcile bank feed', assigneeRole: 'CFO', cadence: { every: 'day', at: '07:00' } });
  const reopened = daily.nextRunAt + 10 * DAY;
  assert.equal(schedules.runDue(catchUp, reopened).created.length, 1);
  assert.equal(scheduled(catchUp).length, 1, 'ten missed days produce one task, not ten');
  const next = schedules.getById(catchUp, daily.id).nextRunAt;
  assert.ok(next > reopened && next <= reopened + DAY, 'the schedule resumes from now, not from the first missed day');
  console.log('PASS: missed occurrences collapse into one run');
}

// 4. Paused teams and rehearsals never create recurring work.
{
  const paused = team('paused-team');
  const job = schedules.create(paused, { title: 'Chase unpaid invoices', assigneeRole: 'CFO', cadence: { everyMinutes: 30 } });
  companies.setStatus(paused, 'paused');
  assert.deepEqual(schedules.runDue(paused, job.nextRunAt + DAY), { created: [], skipped: [] });
  assert.equal(schedules.getById(paused, job.id).nextRunAt, job.nextRunAt, 'a paused team keeps its schedule untouched for when it resumes');
  const demo = team('demo-team', { demoMode: true });
  const rehearsal = schedules.create(demo, { title: 'Demo report', assigneeRole: 'CFO', cadence: { everyMinutes: 30 } });
  assert.deepEqual(schedules.runDue(demo, rehearsal.nextRunAt + DAY), { created: [], skipped: [] });
  assert.equal(issues.list(paused).length + issues.list(demo).length, 0);
  // A disabled schedule on an active team is equally silent, and re-enabling does not replay the gap.
  const off = schedules.update(id, weekly.id, { enabled: false });
  assert.equal(schedules.runDue(id, off.nextRunAt + 30 * DAY).created.length, 0);
  assert.ok(schedules.update(id, weekly.id, { enabled: true }).nextRunAt > Date.now());
  console.log('PASS: paused, demo and disabled schedules create nothing');
}

// 5. Invalid schedules are refused before they can create unclaimable or flooding work.
{
  assert.throws(() => schedules.create(id, { title: 'Ghost work', assigneeRole: 'Nobody', cadence: { every: 'day', at: '09:00' } }), /role from this team/);
  assert.throws(() => schedules.create(id, { title: '', assigneeRole: 'CFO', cadence: { every: 'day', at: '09:00' } }), /title/);
  assert.throws(() => schedules.create(id, { title: 'Too often', assigneeRole: 'CFO', cadence: { everyMinutes: 1 } }), /at least 15 minutes/);
  assert.throws(() => schedules.update('catch-up-team', weekly.id, { title: 'Other team' }), /not found/, 'a schedule cannot be changed through another team');
  console.log('PASS: invalid schedules are rejected');
}

// 6. Finished tasks do not prove the business result: a goal with success criteria waits for the owner.
{
  const goal = goals.create(id, { title: 'Recover overdue receivables', successCriteria: 'At least 5,000 EUR collected', deadline: '+3d' });
  assert.ok(goal.deadlineAt > Date.now() + 2 * DAY, 'relative planner text becomes an enforceable deadline');
  const task = issues.create(id, { title: 'Send payment reminders', assigneeRole: 'CFO', goalId: goal.id, execution: createTaskExecution([{ type: 'produce' }]) });
  finish(id, task);
  let current = goals.getById(id, goal.id);
  assert.equal(current.status, 'active', 'the last task finishing must not report the goal as achieved');
  assert.equal(current.outcome.status, 'pending_review');
  goals.maybeComplete(id, goal.id);
  assert.equal(trail(id, 'goal.outcomeReview').filter(entry => entry.goalId === goal.id).length, 1, 'the owner is asked once, not on every rollup');
  assert.throws(() => goals.complete(id, goal.id), /Confirm the outcome/, 'completion cannot bypass the outcome review');
  assert.throws(() => goals.update(id, goal.id, { status: 'completed' }), /Confirm the outcome/);
  assert.equal(goals.update(id, goal.id, { outcome: { status: 'met' } }).outcome.status, 'pending_review', 'an outcome cannot be written without evidence');
  assert.throws(() => goals.recordOutcome(id, goal.id, { met: true, evidence: 'ok' }), /evidence/, 'a confirmation without evidence is not a confirmation');
  assert.throws(() => goals.recordOutcome(id, goal.id, { evidence: 'Bank statement shows 5,400 EUR.' }), /whether the outcome/);

  // Not met: the goal stays open so more work can be added toward the same result.
  current = goals.recordOutcome(id, goal.id, { met: false, evidence: 'Only 1,200 EUR received so far.' });
  assert.equal(current.status, 'active');
  assert.equal(current.outcome.status, 'not_met');
  assert.equal(trail(id, 'goal.outcomeNotMet').length, 1);
  assert.throws(() => goals.recordOutcome(id, goal.id, { met: true, evidence: 'Changed my mind without new work.' }), /not awaiting/);
  const followUp = issues.create(id, { title: 'Call the three largest debtors', assigneeRole: 'CFO', goalId: goal.id, execution: createTaskExecution([{ type: 'produce' }]) });
  finish(id, followUp);
  assert.equal(goals.getById(id, goal.id).outcome.status, 'pending_review', 'new finished work asks the owner again');

  // Met with evidence: only now is the goal completed.
  current = goals.recordOutcome(id, goal.id, { met: true, evidence: 'Bank statement shows 5,400 EUR received.' });
  assert.equal(current.status, 'completed');
  assert.equal(current.outcome.status, 'met');
  assert.match(current.outcome.evidence, /5,400 EUR/);
  assert.ok(current.completedAt);
  assert.equal(trail(id, 'goal.outcomeMet').length, 1);

  // A goal without criteria keeps completing with its last task.
  const routine = goals.create(id, { title: 'File this month receipts' });
  finish(id, issues.create(id, { title: 'File receipts', assigneeRole: 'CFO', goalId: routine.id, execution: createTaskExecution([{ type: 'produce' }]) }));
  assert.equal(goals.getById(id, routine.id).status, 'completed');
  console.log('PASS: success criteria require an evidenced owner decision');
}

// 7. A missed deadline is flagged once, and only while the work can still be acted on.
{
  const now = Date.now();
  const late = goals.create(id, { title: 'Submit the VAT return', deadline: now - HOUR });
  const unparsed = goals.create(id, { title: 'Tidy the archive', deadline: 'sometime soon' });
  assert.equal(unparsed.deadline, 'sometime soon');
  assert.equal(unparsed.deadlineAt, null, 'unreadable deadline text is kept but never enforced as a guess');
  assert.equal(goals.getById(id, late.id).overdue, true);
  assert.equal(goals.list(id).find(goal => goal.id === unparsed.id).overdue, false);
  assert.deepEqual(goals.markOverdue(id, now).map(goal => goal.id), [late.id]);
  assert.deepEqual(goals.markOverdue(id, now + HOUR), [], 'the owner is not notified again every minute');
  assert.equal(trail(id, 'goal.overdue').length, 1);
  // Moving the deadline re-arms the check; a cancelled goal is no longer late.
  goals.update(id, late.id, { deadline: now - 1000 });
  assert.equal(goals.markOverdue(id, now).length, 1);
  goals.cancel(id, late.id, 'Filed by the accountant');
  assert.equal(goals.getById(id, late.id).overdue, false);

  const lateTask = issues.create(id, { title: 'Pay the supplier', assigneeRole: 'CFO', dueAt: now - HOUR });
  const onTime = issues.create(id, { title: 'Prepare next quote', assigneeRole: 'CFO', dueAt: now + DAY });
  const listed = issues.list(id);
  assert.equal(listed.find(issue => issue.id === lateTask.id).overdue, true);
  assert.equal(listed.find(issue => issue.id === onTime.id).overdue, false);
  issues.update(id, lateTask.id, { status: 'cancelled' });
  assert.equal(issues.list(id).find(issue => issue.id === lateTask.id).overdue, false, 'closed work is not reported as late');
  console.log('PASS: overdue goals are flagged once and overdue tasks are visible');
}

// 8. A restored copy keeps its schedules but cannot start creating work on its own.
{
  const original = schedules.getById(id, weekly.id);
  const restored = portability.importBundle(portability.exportBundle(id));
  assert.equal(restored.status, 'paused');
  const copies = schedules.list(restored.id);
  assert.equal(copies.length, schedules.list(id).length);
  const copy = copies.find(schedule => schedule.title === original.title);
  assert.notEqual(copy.id, original.id);
  assert.deepEqual(copy.cadence, original.cadence);
  assert.ok(issues.getById(restored.id, copy.lastIssueId), 'the last run points at the restored task, not the original team');
  assert.equal(issues.getById(id, copy.lastIssueId), null);
  assert.ok(issues.list(restored.id).some(issue => issue.labels.includes(`schedule:${copy.id}`)));
  const before = issues.list(restored.id).length;
  assert.deepEqual(schedules.runDue(restored.id, Date.now() + 365 * DAY), { created: [], skipped: [] });
  assert.equal(issues.list(restored.id).length, before, 'a paused restored team creates no recurring work until the owner resumes it');
  const restoredGoal = goals.list(restored.id).find(goal => goal.title === 'Recover overdue receivables');
  assert.equal(restoredGoal.outcome.status, 'met', 'the evidenced outcome survives backup and restore');
  // Deleting a team removes its schedules with it.
  companies.remove(restored.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM company_schedules WHERE company_id = ?').get(restored.id).n, 0);
  console.log('PASS: restore keeps schedules without firing them');
}
