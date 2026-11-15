// Business reason: the owner is told about exactly the work that waits on
// them — in live, running teams — and about nothing else.
import assert from 'node:assert/strict';
import { get } from './connection.js';
import { queryOwnerAttention, planNotifications, groupByCompany } from '../../../src/main/ownerAttention.js';
export {};

const { db } = get();
const team = (id, name, status = 'active', demoMode = 0, charter = {}) => db.prepare(
  'INSERT INTO companies (id,name,mode,status,demo_mode,charter,created_at,updated_at) VALUES (?,?,?,?,?,?,1,1)',
).run(id, name, 'solo', status, demoMode, JSON.stringify({ id, name, ...charter }));
const task = (companyId, id, title, status, { execution = null, attempts = 0, max = 3, updatedAt = 100 } = {}) => db.prepare(
  'INSERT INTO issues (id,company_id,title,status,priority,attempt_count,max_attempts,execution,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
).run(id, companyId, title, status, 'normal', attempts, max, execution && JSON.stringify(execution), updatedAt);
const approval = (companyId, id, issueId, status = 'pending', requestedAt = 50) => db.prepare(
  'INSERT INTO pending_approvals (id,company_id,issue_id,step_id,cls,action,requested_at,status) VALUES (?,?,?,?,?,?,?,?)',
).run(id, companyId, issueId, 's1', 'spend.over.250', '{}', requestedAt, status);

team('fin', 'Finance Martin');
team('ops', 'Operations');
team('paused', 'Paused team', 'paused');
team('demo', 'Demo team', 'active', 1);
team('rehearsal', 'Rehearsal', 'active', 0, { demoRun: true });

// Finance: two approvals, one question, plus work that does not wait on the owner.
task('fin', 'pay', 'Pay supplier', 'blocked', { execution: { steps: [{ status: 'waiting_approval' }] }, attempts: 3 });
approval('fin', 'a1', 'pay');
approval('fin', 'a2', null, 'pending', 60);
approval('fin', 'a3', null, 'approved');
task('fin', 'ask', 'Choose the bank account', 'blocked', { execution: { agent: { status: 'waiting_owner', wait: { kind: 'owner', question: 'Which account?', since: 70 } }, steps: [] } });
task('fin', 'team', 'Waiting on another team', 'blocked', { execution: { agent: { status: 'waiting_team' }, steps: [] } });
task('fin', 'open', 'Still retrying', 'open', { attempts: 2 });
task('fin', 'done', 'Finished', 'done', { attempts: 3 });
task('fin', 'prereq', 'Blocked by a prerequisite', 'blocked');
// Operations: an uncertain outcome and a task that ran out of retries.
task('ops', 'sent', 'Send the quote', 'blocked', { execution: { steps: [{ status: 'done' }, { status: 'unknown' }] }, attempts: 1 });
task('ops', 'dead', 'Sync the CRM', 'blocked', { attempts: 3, max: 3 });
// Nothing in paused or demo teams reaches the owner's desktop.
for (const id of ['paused', 'demo', 'rehearsal']) {
  approval(id, `${id}-approval`, null);
  task(id, `${id}-ask`, 'Question', 'blocked', { execution: { agent: { status: 'waiting_owner', wait: { since: 5 } } } });
}

const items = queryOwnerAttention(db);
assert.deepEqual(items.map(item => item.key).sort(), ['approval:a1', 'approval:a2', 'failed:dead', 'question:ask:70', 'review:sent']);
assert.deepEqual([...new Set(items.map(item => item.companyId))].sort(), ['fin', 'ops']);
const question = items.find(item => item.kind === 'question');
assert.deepEqual({ ...question }, { key: 'question:ask:70', companyId: 'fin', companyName: 'Finance Martin', kind: 'question', title: 'Choose the bank account', since: 70 });
assert.equal(items.find(item => item.key === 'approval:a1').title, 'Pay supplier');
assert.equal(items.find(item => item.key === 'approval:a1').since, 50);
console.log('PASS: only approvals, questions, uncertain outcomes and exhausted tasks of live teams wait on the owner');

const first = planNotifications(items, {}, 1000);
assert.deepEqual(groupByCompany(first.notify).map(group => group.summary).sort(),
  ['Finance Martin: 2 approvals, 1 question waiting', 'Operations: 1 outcome to review, 1 stopped task waiting']);

// The owner answers; the agent later asks something else on the same task.
db.prepare("UPDATE issues SET execution=? WHERE id='ask'").run(JSON.stringify({ agent: { status: 'waiting_owner', wait: { since: 900 } } }));
db.prepare("UPDATE pending_approvals SET status='approved' WHERE id='a1'").run();
db.prepare("UPDATE issues SET status='open' WHERE id='pay'").run(); // an approved step resumes its task
const second = planNotifications(queryOwnerAttention(db), first.state, 2000);
assert.deepEqual(second.notify.map(item => item.key), ['question:ask:900'], 'a new question is announced; reminders for the rest wait a day');
assert.equal('approval:a1' in second.state, false);
console.log('PASS: a decided approval drops out and a new question on the same task is announced');
