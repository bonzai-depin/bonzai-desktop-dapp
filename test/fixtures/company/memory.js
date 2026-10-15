import assert from 'node:assert/strict';
import { get } from './connection.js';
import * as companies from '../../../src/main/db/repos/companies.js';
import * as goals from '../../../src/main/db/repos/goals.js';
import * as issues from '../../../src/main/db/repos/issues.js';
import * as teams from '../../../src/main/db/repos/teamCommunication.js';
import * as audit from '../../../src/main/db/repos/audit.js';
import * as memory from '../../../src/main/db/repos/memory.js';
import * as portability from '../../../src/main/db/repos/companyPortability.js';
import { syncCompanyMemory } from '../../../src/main/db/repos/companyMemory.js';
import { teamMemoryId } from '../../../src/shared/teamMemory.js';

const { db } = get();
for (const id of ['maintenance', 'purchasing', 'unrelated']) companies.save({ id, name: id, roles: { CEO: { companion: 'alex', companionName: 'Alex' } }, createdAt: 1 });
const recall = (id, query) => memory.recall('team', teamMemoryId(id), query, 20);
const goal = goals.create('maintenance', { title: 'Dahlia boiler service', rationale: 'Customer requires appointments after 10am.' });
const task = issues.create('maintenance', { title: goal.title, goalId: goal.id, assigneeRole: 'CEO' });
const execution = { version: 1, steps: [], agent: { status: 'waiting_owner', events: [], wait: { kind: 'owner', question: 'Which access route for Dahlia?' } } };
issues.startAttempt('maintenance', task.id, 'CEO', 'alex');
const checkpoint = issues.saveExecution('maintenance', task.id, execution, 0);
issues.finishAttempt('maintenance', task.id, { status: 'blocked' });
issues.answerQuestion('maintenance', task.id, 'Dahlia side entrance, not the main entrance.');
db.prepare('INSERT INTO gmao_clients(id,company_id,name,address,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('private-client','maintenance','PrivateCustomerSaffron','Private address',1,1);
audit.append('maintenance', { kind: 'action', action: 'email.send', status: 'rejected', note: 'Dahlia quote email rejected by owner. <think>private deliberation</think>Do not send.', extra: { apiKey: 'secret-credential', accessToken: 'secret-token' } });
const thread = teams.request('maintenance', { targetTeamId: 'purchasing', targetRole: 'CEO', subject: 'Dahlia belt', body: 'Find a supplier for the Dahlia belt.', requestKey: 'one' });
teams.reply('purchasing', { conversationId: thread.id, body: 'SupplierOrchid has the belt. Confirmation pending.', requestKey: 'two' }, { role: 'CEO' });
// Old evidence must not disappear once a busy team has more than 500 records.
for (let i = 0; i < 520; i++) audit.append('maintenance', { kind: 'system', action: 'fixture', status: 'recorded', note: `Routine record ${i}` });
const recalled = recall('maintenance', 'Dahlia');
assert.ok(recalled.some(note => note.text.includes('after 10am')));
assert.ok(recalled.some(note => note.text.includes('side entrance')));
assert.ok(recalled.some(note => note.text.includes('rejected')));
assert.ok(recalled.some(note => note.text.includes('SupplierOrchid')));
const snapshot = memory.load('team', teamMemoryId('maintenance'));
assert.ok(snapshot.rawSources.length > 500);
assert.doesNotMatch(JSON.stringify(snapshot), /private deliberation|<think>|secret-credential|secret-token/);
assert.equal(syncCompanyMemory('maintenance').changed, 0, 'projection is idempotent');
assert.equal(recall('unrelated', 'Dahlia').length, 0);
assert.equal(recall('purchasing', 'PrivateCustomerSaffron').length, 0, 'shared message does not share private clients');
assert.ok(recall('purchasing', 'SupplierOrchid').length);
// A stale/trimmed renderer save cannot erase the main-process evidence index.
memory.save({ ...snapshot, rawSources: [], atomicNotes: [], pages: {}, backlinks: {} });
assert.ok(recall('maintenance', 'side entrance').length);
// Updates replace the searchable current record, with past decisions in audit.
goals.update('maintenance', goal.id, { rationale: 'Dahlia appointment confirmed at noon.', missionAlignment: 'Dahlia appointment confirmed at noon.' });
assert.ok(recall('maintenance', 'Dahlia').some(note => note.text.includes('confirmed at noon')));
assert.ok(!recall('maintenance', 'Dahlia').some(note => note.text.includes('after 10am')));
// Team and per-role memories use the actual 'team' identity on backup/restore.
const roleIdentity = teamMemoryId('maintenance', 'CEO');
memory.save({ schema: 'bonzai-memory-instance', scope: 'team', id: roleIdentity, label: 'Coordinator memory', metadata: { companyId: 'maintenance', roleKey: 'CEO' },
 rawSources: [], atomicNotes: [{ id: 'role-note', text: 'Prefer verified appointments.', kind: 'fact' }] });
const bundle = portability.exportBundle('maintenance');
assert.equal(bundle.tables.memory_instances.filter(row => row.scope === 'team').length, 2);
const restored = portability.importBundle(bundle);
assert.ok(recall(restored.id, 'Dahlia').some(note => note.text.includes('side entrance')));
assert.ok(memory.recall('team', teamMemoryId(restored.id, 'CEO'), 'verified').length);
assert.equal(restored.status, 'paused');
const corrupt = structuredClone(bundle);
corrupt.tables.memory_instances[0].metadata_json = JSON.stringify({ companyId: 'unrelated' });
assert.throws(() => portability.importBundle(corrupt), /memory outside/);
const before = db.prepare('SELECT count(*) AS n FROM memory_sources').get().n;
assert.throws(() => db.transaction(() => { goals.create('maintenance', { title: 'RollbackTest' }); syncCompanyMemory('maintenance'); throw new Error('abort'); })(), /abort/);
assert.equal(db.prepare('SELECT count(*) AS n FROM memory_sources').get().n, before);
assert.equal(recall('maintenance', 'RollbackTest').length, 0);
console.log('PASS: memory evidence, recall, isolation, rollback, idempotency and scoped restore');
