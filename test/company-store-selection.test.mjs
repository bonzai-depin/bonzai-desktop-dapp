import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const turn = () => new Promise(resolve => setImmediate(resolve));

async function fixture(run) {
  const folder = await mkdtemp(join(process.cwd(), '.company-selection-test-'));
  const previousWindow = globalThis.window;
  const teams = ['grants', 'meditation', 'maintenance'].map(id => ({ id }));
  const pending = new Map();
  const gates = [];
  const read = (name, value) => async id => {
    const key = `${name}:${id}`;
    const gate = pending.get(key);
    pending.delete(key);
    if (gate) await gate.promise;
    return value(id);
  };
  const rows = id => [{ id: `${id}-record`, companyId: id }];
  globalThis.__selectionFixture = {
    bootAll: async () => teams, listCompanies: async () => teams,
    getCompany: read('getCompany', id => teams.find(team => team.id === id)),
    onAuditChange: () => () => {}, onGmaoChange: () => () => {},
    ...Object.fromEntries(['recentAudit', 'pendingApprovals', 'listCatalog', 'listIssues', 'listGoals', 'listConnectors']
      .map(name => [name, read(name, rows)])),
    issueCounts: read('issueCounts', () => ({ total: 1, open: 1 })),
    goalCounts: read('goalCounts', () => ({ total: 1, active: 1 })),
    connectorHealth: read('connectorHealth', () => ({ total: 1, active: 1 })),
    summarizeAudit: read('summarizeAudit', () => ({ total: 1, executed: 1 })),
    getAutomationStatus: read('getAutomationStatus', id => ({ state: { companyId: id } })),
    getTreasuryState: read('getTreasuryState', id => ({ companyId: id })),
    getQueueDepths: read('getQueueDepths', () => ({ CEO: 1 })),
  };
  const events = {};
  globalThis.window = { electronAPI: { db: { distribution: { onChanged: callback => { events.catalog = callback; return () => { delete events.catalog; }; } } } } };
  let store;
  try {
    const source = await readFile('src/stores/companyStore.js', 'utf8');
    const names = [...new Set([...source.matchAll(/svc\.(\w+)/g)].map(match => match[1]))];
    await build({ entryPoints: ['src/stores/companyStore.js'], outfile: join(folder, 'store.mjs'), bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent', plugins: [{ name: 'selection-fixture', setup(builder) {
      builder.onResolve({ filter: /company\.service\.js$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: names.map(name => `export const ${name} = globalThis.__selectionFixture.${name} || (() => {});`).join('\n') }));
    } }] });
    store = (await import(pathToFileURL(join(folder, 'store.mjs')))).default;
    await store.init();
    await store.setActive('grants');
    await run({ store, events, hold(name, id) {
      let resolve, reject;
      const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
      const gate = { promise, resolve, reject };
      gates.push(gate); pending.set(`${name}:${id}`, gate);
      return gate;
    } });
  } finally {
    gates.forEach(gate => gate.resolve());
    await turn(); store?.teardown();
    globalThis.window = previousWindow;
    delete globalThis.__selectionFixture;
    await rm(folder, { recursive: true, force: true });
  }
}

test('switching teams removes the previous team records before the new team finishes loading', async () => {
  await fixture(async ({ store, hold }) => {
    const loading = hold('getCompany', 'meditation');
    const selection = store.setActive('meditation');
    assert.equal(store.state.activeId, 'meditation');
    for (const field of ['issues', 'goals', 'audit', 'approvals', 'catalog', 'connectors']) {
      assert.deepEqual(store.state[field], [], `${field} must not retain Grants records under Meditation`);
    }
    assert.equal(store.state.issueCounts.total, 0);
    assert.equal(store.state.goalCounts.total, 0);
    assert.equal(store.state.connectorHealth.total, 0);
    assert.equal(store.state.summary.total, 0);
    assert.equal(store.state.treasuryState, null);
    assert.deepEqual(store.state.queueDepths, {});
    loading.resolve(); await selection;
    assert.equal(store.state.issues[0].companyId, 'meditation');
    assert.equal(store.state.goals[0].companyId, 'meditation');
  });
});

test('the latest team selection wins when an earlier charter lookup arrives last', async () => {
  await fixture(async ({ store, hold }) => {
    const loading = hold('getCompany', 'meditation');
    const earlier = store.setActive('meditation');
    await store.setActive('maintenance');
    loading.resolve(); await earlier;
    assert.equal(store.state.activeId, 'maintenance');
    assert.equal(store.state.issues[0].companyId, 'maintenance');
  });
});

test('a failing read for the previous team cannot block the newly selected team snapshot', async () => {
  await fixture(async ({ store, hold }) => {
    const loading = hold('recentAudit', 'grants');
    const refreshing = store.refreshActive();
    const selection = store.setActive('meditation');
    await turn();
    loading.reject(new Error('Grants read failed'));
    await Promise.all([refreshing, selection]);
    assert.equal(store.state.activeId, 'meditation');
    assert.equal(store.state.issues[0].companyId, 'meditation');
    assert.equal(store.state.gmaoRefreshError, '');
  });
});

test('clearing team selection removes all company work and counters', async () => {
  await fixture(async ({ store }) => {
    await store.setActive(null);
    assert.equal(store.activeCompany.value, null);
    for (const field of ['issues', 'goals', 'audit', 'approvals', 'catalog', 'connectors']) assert.deepEqual(store.state[field], []);
    assert.equal(store.state.issueCounts.total, 0);
    assert.equal(store.state.goalCounts.total, 0);
    assert.equal(store.state.connectorHealth.total, 0);
    assert.equal(store.state.summary.total, 0);
  });
});


test('a result write refreshes the library without an audit event and preserves files if a read fails', async () => {
  await fixture(async ({ store, events }) => {
    globalThis.window.electronAPI.db.distribution.listCatalog = async id => [{ id: 'new-audio', companyId: id, pipeline: 'audio' }];
    events.catalog({ companyId: 'grants' });
    await store.refreshActive();
    assert.equal(store.state.catalog[0].id, 'new-audio');
    assert.equal(store.state.catalogError, '');
    globalThis.window.electronAPI.db.distribution.listCatalog = async () => { throw Error('Database disconnected'); };
    events.catalog({ companyId: 'grants' });
    await store.refreshActive();
    assert.equal(store.state.catalog[0].id, 'new-audio', 'Temporary read errors do not erase saved results from view');
    assert.match(store.state.catalogError, /could not be loaded/);
    globalThis.window.electronAPI.db.distribution.listCatalog = async () => [];
    events.catalog({ companyId: 'grants' });
    await store.refreshActive();
    assert.equal(store.state.catalogError, '');
  });
});
