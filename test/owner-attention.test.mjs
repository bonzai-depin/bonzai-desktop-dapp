// Business reason: an agent team that waits on its owner must say so once,
// remind daily, and never flood the desktop after a restart.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { planNotifications, groupByCompany, createOwnerAttention, OWNER_ATTENTION_STATE_KEY } from '../src/main/ownerAttention.js';

const require = createRequire(import.meta.url);
const HOUR = 60 * 60 * 1000;
const item = (key, companyId = 'fin', kind = key.split(':')[0], companyName = companyId === 'fin' ? 'Finance Martin' : 'Operations') =>
  ({ key, companyId, companyName, kind, title: key, since: 1 });

test('a new item notifies once, stays quiet for a day, then reminds', () => {
  const waiting = [item('approval:a1')];
  const first = planNotifications(waiting, {}, 1000);
  assert.deepEqual(first.notify.map(i => i.key), ['approval:a1']);
  const minuteLater = planNotifications(waiting, first.state, 1000 + 60_000);
  assert.deepEqual(minuteLater.notify, []);
  const almostADay = planNotifications(waiting, minuteLater.state, 1000 + 24 * HOUR - 1);
  assert.deepEqual(almostADay.notify, [], 'no repeat before the reminder interval');
  const nextDay = planNotifications(waiting, almostADay.state, 1000 + 24 * HOUR);
  assert.deepEqual(nextDay.notify.map(i => i.key), ['approval:a1']);
  assert.deepEqual(planNotifications(waiting, nextDay.state, 1000 + 25 * HOUR).notify, [], 'the reminder restarts the interval');
  assert.deepEqual(planNotifications(waiting, first.state, 1000 + 2 * HOUR, { remindAfterMs: HOUR }).notify.length, 1, 'the interval is configurable');
});

test('resolved items drop out and only new arrivals are announced', () => {
  const first = planNotifications([item('approval:a1'), item('question:q1')], {}, 1000);
  const next = planNotifications([item('question:q1'), item('review:r1')], first.state, 2000);
  assert.deepEqual(next.notify.map(i => i.key), ['review:r1']);
  assert.deepEqual(Object.keys(next.state).sort(), ['question:q1', 'review:r1']);
  // The same approval id never returns, but a task can block again later.
  const again = planNotifications([item('question:q1'), item('review:r1'), item('approval:a1')], next.state, 3000);
  assert.deepEqual(again.notify.map(i => i.key), ['approval:a1']);
});

test('a restart with saved state stays quiet; lost or damaged state notifies rather than hides', () => {
  const waiting = [item('approval:a1'), item('failed:t9', 'ops')];
  const saved = JSON.parse(JSON.stringify(planNotifications(waiting, {}, 1000).state));
  assert.deepEqual(planNotifications(waiting, saved, 5000).notify, []);
  assert.equal(planNotifications(waiting, undefined, 5000).notify.length, 2);
  assert.equal(planNotifications(waiting, { 'approval:a1': 'corrupt', 'failed:t9': 9e15 }, 5000).notify.length, 2, 'a bad timestamp or a clock set back must not silence reminders');
});

test('each team gets one summary per pass', () => {
  const groups = groupByCompany([item('approval:a1'), item('question:q1'), item('approval:a2'), item('review:r1', 'ops'), item('failed:t1', 'ops'), item('failed:t2', 'ops')]);
  assert.deepEqual(groups.map(group => group.summary), [
    'Finance Martin: 2 approvals, 1 question waiting',
    'Operations: 1 outcome to review, 2 stopped tasks waiting',
  ]);
});

function harness({ rows, enabled = true, focused = false, supported = true }) {
  const values = new Map(), shown = [], opened = [];
  const store = { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, JSON.parse(JSON.stringify(value))) };
  class Notification {
    static isSupported() { return supported; }
    constructor(options) { this.options = options; }
    on(name, handler) { this[name] = handler; }
    show() { shown.push(this); }
  }
  // The query only prepares two statements: approvals first, then blocked tasks.
  const db = { prepare: sql => ({ all: () => (/FROM pending_approvals/.test(sql) ? rows() : []) }) };
  let clock = 1000;
  const state = { enabled, focused };
  const service = createOwnerAttention({ store, Notification, enabled: () => state.enabled, focused: () => state.focused, open: id => opened.push(id), now: () => clock });
  return { service, db, shown, opened, values, state, tick: ms => { clock += ms; } };
}
const approvalRow = (id, companyId, companyName) => ({ id, cls: 'spend', issueId: null, since: 1, title: 'Private task title', companyId, companyName });

test('the desktop shows one notification per team, only counts, and reopens the workspace on click', () => {
  const rows = [approvalRow('a1', 'fin', 'Finance Martin'), approvalRow('a2', 'fin', 'Finance Martin'), approvalRow('a3', 'ops', 'Operations')];
  const h = harness({ rows: () => rows });
  h.service.evaluate(h.db);
  assert.deepEqual(h.shown.map(n => n.options.body), ['Finance Martin: 2 approvals waiting', 'Operations: 1 approval waiting']);
  assert.doesNotMatch(JSON.stringify(h.shown.map(n => n.options)), /Private task title/);
  h.shown[1].click();
  assert.deepEqual(h.opened, ['ops']);
  h.tick(60_000); h.service.evaluate(h.db);
  assert.equal(h.shown.length, 2, 'the next minute stays quiet');
  assert.deepEqual(Object.keys(h.values.get(OWNER_ATTENTION_STATE_KEY)).sort(), ['approval:a1', 'approval:a2', 'approval:a3']);
});

test('nothing is shown while the owner is in the workspace, has turned alerts off, or the OS cannot notify', () => {
  const rows = [approvalRow('a1', 'fin', 'Finance Martin')];
  const focused = harness({ rows: () => rows, focused: true });
  focused.service.evaluate(focused.db);
  assert.equal(focused.shown.length, 0);
  // Not marked as told: if it is still waiting once they look away, they hear about it.
  focused.state.focused = false; focused.service.evaluate(focused.db);
  assert.equal(focused.shown.length, 1);
  const off = harness({ rows: () => rows, enabled: false });
  off.service.evaluate(off.db);
  assert.equal(off.shown.length, 0);
  const unsupported = harness({ rows: () => rows, supported: false });
  unsupported.service.evaluate(unsupported.db);
  assert.equal(unsupported.shown.length, 0);
});

test('the waiting-on-owner query covers approvals, questions, uncertain outcomes and exhausted tasks of live teams only', async () => {
  const folder = fs.mkdtempSync(path.join(process.cwd(), '.company-tests-attention-'));
  try {
    const outfile = path.join(folder, 'owner-attention.mjs');
    await build({ entryPoints: ['test/fixtures/company/owner-attention.js'], outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent' });
    const result = spawnSync(require('electron'), [outfile], { encoding: 'utf8', timeout: 60000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
    assert.equal((result.stdout.match(/^PASS:/gm) || []).length, 2, result.stdout);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
