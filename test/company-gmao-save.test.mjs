import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as gmao from '../src/services/company/gmao.js';

const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

async function fixture(run) {
  const dir = await mkdtemp(join(process.cwd(), '.company-save-test-'));
  const previousWindow = globalThis.window;
  const teams = [{ id: 'hvac', template: { id: 'hvac_residential' } }, { id: 'other', template: { id: 'hvac_residential' } }];
  const records = { hvac: [], other: [] };
  let changed = () => {}, auditGate, snapshotGate, writeGate, failWrite = false, failSnapshot = false;
  const counts = { bootstrap: 0, snapshot: 0, writes: 0 };
  globalThis.window = { electronAPI: { db: { gmao: {
    bootstrap: async () => { counts.bootstrap++; changed({ companyId: 'hvac' }); },
    snapshot: async id => { counts.snapshot++; if (failSnapshot) throw new Error('Read unavailable'); const data = structuredClone({ clients: records[id] }); if (snapshotGate) await snapshotGate.promise; return data; },
    saveClient: async (id, input) => { counts.writes++; if (writeGate) await writeGate.promise; if (failWrite) throw new Error('Disk is full'); const row = { ...input, id: input.id || `client-${counts.writes}` }; records[id].push(row); changed({ companyId: id }); return row; },
    dossier: async () => ({ id: 'dossier' }), searchWorkOrders: async () => [],
  } } } };
  globalThis.__saveFixture = {
    bootAll: async () => teams, listCompanies: async () => teams,
    onAuditChange: () => () => {}, onGmaoChange: fn => { changed = fn; return () => { changed = () => {}; }; },
    recentAudit: async () => { if (auditGate) await auditGate.promise; return []; }, getCompany: async id => teams.find(team => team.id === id),
    getGmaoSnapshot: gmao.snapshot, saveGmaoClient: gmao.saveClient,
    getGmaoDossier: gmao.dossier, searchGmaoWorkOrders: gmao.searchWorkOrders,
  };
  let store;
  try {
    const source = await readFile('src/stores/companyStore.js', 'utf8');
    const names = [...new Set([...source.matchAll(/svc\.(\w+)/g)].map(match => match[1]))];
    await build({ entryPoints: ['src/stores/companyStore.js'], outfile: join(dir, 'store.mjs'), bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent', plugins: [{ name: 'fixture-service', setup(builder) {
      builder.onResolve({ filter: /company\.service\.js$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: names.map(name => `export const ${name} = globalThis.__saveFixture.${name} || (async () => []);`).join('\n') }));
    } }] });
    store = (await import(pathToFileURL(join(dir, 'store.mjs')))).default;
    await store.init(); await store.setActive('hvac');
    await run({ store, records, counts, changed: id => changed({ companyId: id }),
      holdAudit: () => auditGate = deferred(), holdSnapshot: () => snapshotGate = deferred(), holdWrite: () => writeGate = deferred(),
      rejectWrite: () => { failWrite = true; }, rejectSnapshot: () => { failSnapshot = true; },
    });
  } finally {
    auditGate?.resolve(); snapshotGate?.resolve(); writeGate?.resolve();
    await turn(); store?.teardown();
    globalThis.window = previousWindow; delete globalThis.__saveFixture;
    await rm(dir, { recursive: true, force: true });
  }
}

test('maintenance snapshots are reads and cannot recursively bootstrap another refresh', async () => {
  const previousWindow = globalThis.window;
  let reads = 0, writes = 0;
  globalThis.window = { electronAPI: { db: { gmao: { bootstrap: async () => { writes++; }, snapshot: async () => { reads++; return { clients: [] }; } } } } };
  try { await gmao.snapshot('team'); await gmao.snapshot('team'); assert.equal(reads, 2); assert.equal(writes, 0, 'reading a saved team must never emit a mutation event'); }
  finally { globalThis.window = previousWindow; }
});

test('persisted client saves resolve while unrelated telemetry and background reads are still pending', async () => {
  await fixture(async ({ store, counts, holdAudit, holdSnapshot }) => {
    const audit = holdAudit(); const refreshing = store.refreshActive();
    const snapshot = holdSnapshot();
    const result = await Promise.race([store.saveGmaoClient({ name: 'DEFENSE' }), new Promise((_, reject) => setTimeout(() => reject(new Error('Save waited for background reads')), 300))]);
    assert.equal(result.name, 'DEFENSE');
    assert.equal(store.state.gmao.clients[0].id, result.id, 'the persistence receipt updates the visible client directory');
    assert.equal(counts.writes, 1, 'one submission creates one durable record'); assert.equal(counts.bootstrap, 0);
    snapshot.resolve(); audit.resolve(); await refreshing; await turn(); await turn();
    assert.equal(store.state.gmao.clients.length, 1, 'an older dashboard snapshot cannot erase the saved client');
    assert.ok(counts.snapshot < 6, 'change events settle instead of creating an endless refresh loop');
  });
});

test('failed saves reject without publishing a record, and dossier reads do not refresh the dashboard', async () => {
  await fixture(async ({ store, counts, rejectWrite }) => {
    rejectWrite(); await assert.rejects(store.saveGmaoClient({ name: 'Draft client' }), /Disk is full/);
    assert.equal(store.state.gmao.clients.length, 0);
    const before = counts.snapshot;
    await store.getGmaoDossier('work-order'); await store.searchGmaoWorkOrders('boiler'); await turn();
    assert.equal(counts.snapshot, before, 'inspecting records must not act like an operational mutation');
  });
});

test('a saved client remains successful if the follow-up read fails, with the refresh error surfaced separately', async () => {
  await fixture(async ({ store, rejectSnapshot }) => {
    rejectSnapshot(); const row = await store.saveGmaoClient({ name: 'Saved locally' }); await turn();
    assert.equal(store.state.gmao.clients[0].id, row.id); assert.equal(store.state.gmaoRefreshError, 'Read unavailable');
  });
});

test('a late save for one team never appears in a different team', async () => {
  await fixture(async ({ store, records, holdWrite }) => {
    const write = holdWrite(); const saving = store.saveGmaoClient({ name: 'First team client' });
    await store.setActive('other'); write.resolve(); await saving; await turn();
    assert.equal(records.hvac.length, 1); assert.equal(store.state.activeId, 'other'); assert.equal(store.state.gmao.clients.length, 0);
  });
});
