// Business reason: a buyer must be able to prove a team's activity history
// was not edited, trimmed or backdated, and dissolving a team must remove all
// of its records or none of them.
import assert from 'node:assert/strict';
import { get } from './connection.js';
import * as companies from '../../../src/main/db/repos/companies.js';
import * as audit from '../../../src/main/db/repos/audit.js';
import * as issues from '../../../src/main/db/repos/issues.js';
import * as goals from '../../../src/main/db/repos/goals.js';
import * as approvals from '../../../src/main/db/repos/approvals.js';
import * as treasury from '../../../src/main/db/repos/treasury.js';
import * as distribution from '../../../src/main/db/repos/distribution.js';
import * as connectors from '../../../src/main/db/repos/connectors.js';
import * as automation from '../../../src/main/db/repos/automation.js';
import * as portability from '../../../src/main/db/repos/companyPortability.js';
import { makeCharter } from '../../../src/services/company/charter.js';
export {};

const { db } = get();
const team = (id) => companies.save({ ...makeCharter({ name: id, mission: 'Keep an honest record.' }), id, status: 'active', demoMode: false });
const raw = (id) => db.prepare('SELECT * FROM audit_entries WHERE company_id = ? ORDER BY seq').all(id);

// 1. Entries are numbered and chained per team, and the chain verifies.
{
  team('ledger'); team('neighbour');
  const first = audit.append('ledger', { kind: 'system', action: 'create', status: 'executed' });
  audit.append('neighbour', { kind: 'system', action: 'create', status: 'executed' });
  const second = audit.append('ledger', { kind: 'treasury', direction: 'out', amount: 1250, currency: 'EUR', llm: { response: 'ok' }, custom: { a: 1 } });
  const third = audit.append('ledger', { kind: 'action', action: 'send', status: 'executed', note: 'Quote sent' });
  assert.deepEqual([first.seq, second.seq, third.seq], [1, 2, 3], 'each team has its own gap-free sequence');
  assert.equal(first.prevHash, null);
  assert.equal(second.prevHash, first.hash);
  assert.equal(third.prevHash, second.hash);
  assert.match(third.hash, /^[a-f0-9]{64}$/);
  const check = audit.verify('ledger');
  assert.deepEqual(check, { ok: true, entries: 3, firstBrokenSeq: null, unsealed: 0, head: { seq: 3, hash: third.hash } });
  assert.equal(audit.verify('neighbour').entries, 1);
  assert.deepEqual(audit.verify('nobody'), { ok: true, entries: 0, firstBrokenSeq: null, unsealed: 0, head: null });
  assert.deepEqual(audit.recent('ledger', 2).map(entry => entry.seq), [3, 2], 'the feed stays newest first even within one millisecond');
  console.log('PASS: appended entries form a verifiable per-team chain');
}

// 2. A caller cannot choose an entry's identity, time or place in the chain.
{
  team('clock');
  const before = Date.now();
  const kept = audit.append('clock', { kind: 'system', action: 'first' });
  const forged = audit.append('clock', { id: kept.id, ts: 1, seq: 1, hash: 'f'.repeat(64), prevHash: 'x', companyId: 'ledger', kind: 'system', action: 'backdated' });
  assert.notEqual(forged.id, kept.id, 'a supplied id cannot collide with or replace an entry');
  assert.ok(forged.ts >= before, 'a supplied timestamp cannot backdate an entry');
  assert.equal(forged.seq, 2);
  assert.equal(forged.companyId, 'clock');
  assert.equal(forged.extra, null, 'chain fields are not smuggled into the stored entry');
  assert.equal(audit.verify('clock').ok, true);
  assert.equal(audit.verify('ledger').entries, 3);
  console.log('PASS: caller-supplied id, time and chain fields are ignored');
}

// 3. Editing or deleting a row behind the app's back is detected and located.
{
  team('edited');
  for (const note of ['one', 'two', 'three', 'four']) audit.append('edited', { kind: 'action', action: 'pay', status: 'executed', note, amount: 100 });
  db.prepare("UPDATE audit_entries SET amount = 1 WHERE company_id = 'edited' AND seq = 3").run();
  let check = audit.verify('edited');
  assert.equal(check.ok, false);
  assert.equal(check.firstBrokenSeq, 3, 'the altered entry is named');
  db.prepare("UPDATE audit_entries SET amount = 100 WHERE company_id = 'edited' AND seq = 3").run();
  assert.equal(audit.verify('edited').ok, true, 'restoring the original value restores the chain');
  db.prepare("UPDATE audit_entries SET ts = ts - 86400000 WHERE company_id = 'edited' AND seq = 2").run();
  assert.equal(audit.verify('edited').firstBrokenSeq, 2, 'a backdated entry is named');

  team('trimmed');
  for (const note of ['one', 'two', 'three']) audit.append('trimmed', { kind: 'action', note });
  db.prepare("DELETE FROM audit_entries WHERE company_id = 'trimmed' AND seq = 2").run();
  check = audit.verify('trimmed');
  assert.equal(check.ok, false);
  assert.equal(check.firstBrokenSeq, 2, 'the missing entry is named');
  db.prepare("DELETE FROM audit_entries WHERE company_id = 'trimmed' AND seq = 1").run();
  assert.equal(audit.verify('trimmed').firstBrokenSeq, 1, 'removing the oldest entry is detected too');

  team('injected');
  audit.append('injected', { kind: 'system', action: 'create' });
  db.prepare("INSERT INTO audit_entries (id, company_id, ts, kind, note) VALUES ('forged', 'injected', 5, 'action', 'never happened')").run();
  audit.append('injected', { kind: 'system', action: 'later' });
  check = audit.verify('injected');
  assert.equal(check.ok, false, 'a row inserted outside the app is never adopted into the chain');
  assert.equal(check.unsealed, 1);
  assert.equal(check.firstBrokenSeq, null);
  console.log('PASS: edited, backdated, deleted and injected rows fail verification');
}

// 4. History written before the chain existed is sealed in its original order.
{
  team('legacy');
  const insert = db.prepare('INSERT INTO audit_entries (id, company_id, ts, kind, note) VALUES (?, ?, ?, ?, ?)');
  insert.run('old-b', 'legacy', 2000, 'system', 'second');
  insert.run('old-a', 'legacy', 1000, 'system', 'first');
  insert.run('old-c', 'legacy', 2000, 'system', 'third');
  const check = audit.verify('legacy');
  assert.equal(check.ok, true);
  assert.equal(check.entries, 3);
  assert.deepEqual(raw('legacy').map(row => row.id), ['old-a', 'old-b', 'old-c'], 'sealed by time, then by insertion order');
  assert.deepEqual(raw('legacy').map(row => row.ts), [1000, 2000, 2000], 'sealing never rewrites history');
  const next = audit.append('legacy', { kind: 'system', action: 'resume' });
  assert.equal(next.seq, 4);
  assert.equal(next.prevHash, check.head.hash, 'new activity continues the sealed chain');
  assert.equal(audit.verify('legacy').ok, true);

  team('legacy-append');
  insert.run('old-d', 'legacy-append', 1000, 'system', 'before the chain');
  assert.equal(audit.append('legacy-append', { kind: 'system' }).seq, 2, 'the first append seals earlier history first');
  assert.equal(audit.verify('legacy-append').ok, true);

  // First-boot store migration keeps legacy ids and times, then chains them.
  team('migrated');
  audit.bulkInsert([{ id: 'm1', companyId: 'migrated', ts: 10, kind: 'system' }, { id: 'm2', companyId: 'migrated', ts: 20, kind: 'system', llm: { response: 'x' } }]);
  assert.deepEqual(audit.verify('migrated'), { ok: true, entries: 2, firstBrokenSeq: null, unsealed: 0, head: { seq: 2, hash: raw('migrated')[1].hash } });
  console.log('PASS: pre-existing history is sealed and continued');
}

// 5. The export carries its own verification and can be checked independently.
{
  const trail = audit.exportTrail('ledger');
  assert.equal(trail.companyId, 'ledger');
  assert.ok(trail.exportedAt <= Date.now());
  assert.deepEqual(trail.verification, audit.verify('ledger'));
  assert.deepEqual(trail.entries.map(entry => entry.seq), [1, 2, 3], 'oldest first');
  const { createHash } = await import('node:crypto');
  let prev = '';
  for (const entry of trail.entries) {
    const hash = createHash('sha256').update(prev + JSON.stringify(trail.chain.fields.map(field => [field, entry[field]]))).digest('hex');
    assert.equal(hash, entry.hash, 'an auditor can recompute every hash from the export alone');
    prev = hash;
  }
  const broken = audit.exportTrail('edited');
  assert.equal(broken.verification.ok, false, 'an export of a tampered trail says so');
  assert.equal(broken.verification.firstBrokenSeq, 2);
  assert.equal(broken.entries.length, 4);
  console.log('PASS: export includes verification and a recomputable chain');
}

// 6. A restored team has a trail that verifies and keeps its order.
{
  const issue = issues.create('ledger', { title: 'Send the quote', assigneeRole: 'CSO' });
  audit.append('ledger', { kind: 'issue', action: 'createIssue', issueId: issue.id });
  const original = raw('ledger');
  const restored = portability.importBundle(JSON.parse(JSON.stringify(portability.exportBundle('ledger'))));
  const copy = raw(restored.id);
  const check = audit.verify(restored.id);
  assert.equal(check.ok, true, 'a restored team does not start life with a broken trail');
  assert.equal(check.entries, original.length);
  assert.deepEqual(copy.map(row => [row.seq, row.ts, row.kind, row.action, row.note]), original.map(row => [row.seq, row.ts, row.kind, row.action, row.note]));
  assert.ok(copy.every((row, index) => row.id !== original[index].id && row.hash !== original[index].hash), 'the copy has its own entries and chain');
  assert.equal(audit.verify('ledger').ok, true, 'the original trail is untouched');
  assert.equal(audit.append(restored.id, { kind: 'system', action: 'resume' }).seq, original.length + 1);
  assert.equal(audit.verify(restored.id).ok, true);
  console.log('PASS: an exported and restored team verifies');
}

// 7. Dissolving removes the whole team in one transaction and nothing else.
{
  const scoped = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name)
    .filter(name => db.prepare(`PRAGMA table_info("${name}")`).all().some(column => column.name === 'company_id'));
  const kept = ['generations', 'skill_runs', 'agent_jobs'];
  const count = (table, id) => db.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE company_id = ?`).get(id).n;
  const attempts = (id) => db.prepare('SELECT COUNT(*) AS n FROM issue_attempts WHERE issue_id IN (SELECT id FROM issues WHERE company_id = ?)').get(id).n;
  const snapshot = (id) => Object.fromEntries([...scoped.map(table => [table, count(table, id)]), ['issue_attempts', attempts(id)]]);
  const seed = (id) => {
    team(id);
    const goal = goals.create(id, { title: 'Win the account' });
    const issue = issues.create(id, { title: 'Prepare the offer', assigneeRole: 'CSO', goalId: goal.id });
    issues.startAttempt(id, issue.id, 'CSO', 'agent');
    approvals.enqueue(id, { cls: 'external', action: { type: 'email.send' }, role: 'CSO', requestedBy: 'CSO' });
    treasury.recordRevenue(id, { amount: 10, source: 'test' });
    distribution.publish(id, { pipeline: 'text', title: 'Offer', payload: 'text' });
    connectors.create(id, { kind: 'webhook', authType: 'none' });
    assert.equal(automation.begin(id, { triggerType: 'manual' }).acquired, true);
    audit.append(id, { kind: 'system', action: 'create', status: 'executed' });
    db.prepare("INSERT INTO human_roster (id, company_id, name, created_at) VALUES (?, ?, 'Ada', 1)").run(`human-${id}`, id);
    db.prepare("INSERT INTO generations (id, company_id, pipeline, status, created_at) VALUES (?, ?, 'image', 'done', 1)").run(`gen-${id}`, id);
  };
  seed('doomed'); seed('survivor');
  db.prepare("INSERT INTO team_threads (id, source_company_id, target_company_id, source_team_name, target_team_name, target_role, subject, request_key, created_at) VALUES ('thread', 'doomed', 'survivor', 'doomed', 'survivor', 'CEO', 'Shared request', 'k', 1)").run();
  for (const table of ['audit_entries', 'goals', 'issues', 'issue_attempts', 'pending_approvals', 'treasury_state', 'treasury_entries', 'published_content', 'connectors', 'company_automation_state', 'company_automation_runs', 'human_roster'])
    assert.ok(snapshot('doomed')[table] > 0, `${table} is seeded so its removal is really tested`);
  const survivor = snapshot('survivor');

  assert.equal(companies.dissolve('doomed'), true);
  assert.equal(companies.getById('doomed'), null);
  for (const [table, rows] of Object.entries(snapshot('doomed')))
    assert.equal(rows, kept.includes(table) ? count(table, 'doomed') : 0, `${table} keeps no rows of a dissolved team`);
  assert.equal(count('generations', 'doomed'), 1, "the owner's own gallery is not team history");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM team_threads WHERE source_company_id = 'doomed' OR target_company_id = 'doomed'").get().n, 0);
  assert.deepEqual(snapshot('survivor'), survivor, "another team's records are untouched");
  assert.equal(audit.verify('survivor').ok, true);
  assert.ok(companies.getById('survivor'));
  assert.equal(companies.dissolve('doomed'), false, 'dissolving an unknown team reports that nothing was deleted');

  // All or nothing: a failure part-way leaves the team exactly as it was.
  db.exec("CREATE TRIGGER block_dissolve BEFORE DELETE ON companies BEGIN SELECT RAISE(ABORT, 'disk full'); END");
  assert.throws(() => companies.dissolve('survivor'), /disk full/);
  db.exec('DROP TRIGGER block_dissolve');
  assert.deepEqual(snapshot('survivor'), survivor, 'a failed dissolve deletes nothing');
  assert.equal(audit.verify('survivor').ok, true);
  console.log('PASS: dissolve removes every team record atomically and only for that team');
}
