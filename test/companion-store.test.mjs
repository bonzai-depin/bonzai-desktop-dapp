import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { reactive, toRaw, isProxy } from 'vue';
import * as schema from '../src/main/db/schema/companions.js';
import { companionExtraMetadata } from '../src/shared/companionMetadata.js';

// Use SQLite's actual SQL execution without rebuilding Electron's native
// better-sqlite3 binding for the Node test runner.
function sqliteAdapter(sqlite) {
  return {
    exec: sql => sqlite.exec(sql),
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        raw(value = true) { statement.setReturnArrays(value); return this; },
        get: (...params) => statement.get(...params),
        all: (...params) => statement.all(...params),
        run: (...params) => statement.run(...params),
      };
    },
    transaction: operation => (...args) => {
      sqlite.exec('BEGIN');
      try { const result = operation(...args); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

async function loadModule(path, replacements) {
  const url = new URL(path, import.meta.url);
  let source = await readFile(url, 'utf8');
  for (const [pattern, replacement] of replacements) source = source.replace(pattern, replacement);
  source = source.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const repo = await loadModule('../src/main/db/repos/companions.js', [
  [/import \{ get \} from "\.\.\/connection.js";/, 'const get = () => globalThis.__companionTestConnection;'],
]);
const store = await loadModule('../src/services/roleplayStore.service.js', [
  [/import \{ memoryService \} from '.\/memory.service.js';/, 'const memoryService = {};'],
]);

async function fixture(run, { beforeMigration = null } = {}) {
  const previous = globalThis.window;
  const sqlite = new DatabaseSync(':memory:');
  const db = sqliteAdapter(sqlite);
  db.exec(await readFile(new URL('../src/main/db/migrations/0004_companions_roleplay.sql', import.meta.url), 'utf8'));
  beforeMigration?.(sqlite);
  db.exec(await readFile(new URL('../src/main/db/migrations/0015_companion_metadata.sql', import.meta.url), 'utf8'));
  globalThis.__companionTestConnection = { db, orm: drizzle(db, { schema }) };
  const legacy = new Map();
  globalThis.window = {
    electronAPI: {
      db: { companions: { list: async () => repo.list(), bulkInsert: async rows => repo.bulkInsert(rows), replaceRoster: async rows => repo.replaceRoster(rows) } },
      store: {
        get: async (key, fallback) => legacy.has(key) ? structuredClone(legacy.get(key)) : fallback,
        set: async (key, value) => legacy.set(key, structuredClone(value)),
      },
    },
  };
  try { await run({ sqlite, legacy }); }
  finally { sqlite.close(); globalThis.window = previous; delete globalThis.__companionTestConnection; }
}

test('saving an existing companion preserves its actual social-token identity and workflow selections after restart', async () => fixture(async ({ legacy }) => {
  const companion = {
    id: 'scarlett', name: 'Scarlett Rose', firstName: 'Scarlett', familyName: 'Rose', isCustom: true,
    image: 'bonzai-blob://portrait.png', personality: 'Thoughtful, precise', firstMessage: 'What are we making?',
    voiceSample: 'bonzai-blob://voice.wav', chainId: 4663,
    contractAddress: '0x1111111111111111111111111111111111111111', tokenId: '9007199254740993',
    agentWallet: '0x2222222222222222222222222222222222222222',
    tokenAddress: '0x3333333333333333333333333333333333333333', tokenSymbol: 'SCARLETT', tokenName: 'Scarlett Rose',
    poolId: `0x${'a'.repeat(64)}`, txHash: `0x${'b'.repeat(64)}`, network: 'robinhood', standard: 'ERC-8004',
    agentWalletProvider: 'local', x402Support: false,
    assignedWorkflowIds: ['story-studio-v1.0.0', 'chart-forecaster-v1.0.0'],
    grantedSkills: ['skill.notion_docs'], companyMemory: 'Client secret', privateKey: 'never-store-this',
  };
  await store.saveCompanions([companion]);
  legacy.clear(); // SQLite must be sufficient; no parallel agent roster.
  const [loaded] = await store.loadCompanions();
  for (const [key, value] of Object.entries(companion)) {
    if (['grantedSkills', 'companyMemory', 'privateKey'].includes(key)) assert.equal(loaded[key], undefined, key);
    else assert.deepEqual(loaded[key], value, key);
  }
  assert.equal(loaded.extraJson, undefined);
  assert.equal(loaded.isDefault, false);
  loaded.assignedWorkflowIds = [];
  await store.saveCompanions([loaded]);
  assert.deepEqual((await store.loadCompanions())[0].assignedWorkflowIds, [], 'Removing assigned workflows must survive reload');
}));

test('the additive migration recovers previously dropped metadata without replacing SQLite identity or reviving deleted companions', async () => fixture(async ({ legacy }) => {
  legacy.set('roleplayCompanions', [
    { id: 'existing', name: 'Stale name', tokenId: '999', agentWallet: 'wrong-wallet', tokenAddress: 'existing-token', assignedWorkflowIds: ['chart-forecaster-v1.0.0'] },
    { id: 'deleted', name: 'Deleted companion', tokenAddress: 'other-token' },
  ]);
  const loaded = await store.loadCompanions();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, 'existing');
  assert.equal(loaded[0].name, 'Canonical companion');
  assert.equal(loaded[0].tokenId, '42');
  assert.equal(loaded[0].agentWallet, 'canonical-wallet');
  assert.equal(loaded[0].tokenAddress, 'existing-token');
  assert.deepEqual(loaded[0].assignedWorkflowIds, ['chart-forecaster-v1.0.0']);
  await store.saveCompanions(loaded);
  legacy.clear();
  assert.equal((await store.loadCompanions())[0].tokenAddress, 'existing-token');
}, { beforeMigration: db => db.prepare('INSERT INTO companions (id, name, token_id, agent_wallet, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('existing', 'Canonical companion', '42', 'canonical-wallet', 1, 1) }));

test('repository upsert filters extra metadata and cannot override authoritative identity columns', async () => fixture(async () => {
  repo.upsert({
    id: 'companion', name: 'Original', tokenId: '7',
    extraJson: { id: 'imposter', tokenId: '8', tokenAddress: 'social-token', assignedWorkflowIds: ['chart-forecaster-v1.0.0', 'chart-forecaster-v1.0.0', null], credentials: { secret: 'private' }, grantedSkills: ['skill.notion_docs'] },
  });
  const [loaded] = await store.loadCompanions();
  assert.equal(loaded.id, 'companion');
  assert.equal(loaded.tokenId, '7');
  assert.equal(loaded.tokenAddress, 'social-token');
  assert.deepEqual(loaded.assignedWorkflowIds, ['chart-forecaster-v1.0.0']);
  assert.equal(loaded.credentials, undefined);
  assert.equal(loaded.grantedSkills, undefined);
}));

test('browser companion editing uses the same local roster when Electron is unavailable', async () => {
  const previous = globalThis.window;
  const saved = new Map();
  globalThis.window = { localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) } };
  try {
    const companion = { id: 'local-companion', name: 'Maya', assignedWorkflowIds: ['chart-forecaster-v1.0.0'] };
    await store.saveCompanions([companion]);
    assert.deepEqual(await store.loadCompanions(), [companion]);
    saved.set('roleplayCompanions', '{invalid');
    assert.deepEqual(await store.loadCompanions(), []);
  } finally { globalThis.window = previous; }
});

test('metadata keeps genuine token and voice fields without manufacturing connector grants', () => {
  assert.deepEqual(companionExtraMetadata({ tokenAddress: null, assignedWorkflowIds: [], grantedSkills: ['skill.notion_docs'], instructions: 'Private instructions' }), { tokenAddress: null, assignedWorkflowIds: [] });
  assert.deepEqual(companionExtraMetadata('{broken'), {});
});

test('saving the canonical roster deletes removed companions and their private memory without dropping retained onchain agents', async () => fixture(async ({ sqlite }) => {
  await store.saveCompanions([
    { id: 'removed', name: 'Remove me' },
    { id: 'retained', name: 'Keep me', isNFT: true, tokenId: '42', assignedWorkflowIds: ['story-studio-v1.0.0'] },
  ]);
  sqlite.prepare('INSERT INTO companion_memory (id, companion_id, scope, content, created_at) VALUES (?, ?, ?, ?, ?)').run('memory', 'removed', 'long_term_user', 'Private memory', 1);
  const retained = (await store.loadCompanions()).find(companion => companion.id === 'retained');
  await store.saveCompanions([retained]);
  assert.deepEqual((await store.loadCompanions()).map(companion => companion.id), ['retained']);
  assert.equal((await store.loadCompanions())[0].isNFT, true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM companion_memory').get().count, 0);
  await store.saveCompanions([]);
  assert.deepEqual(await store.loadCompanions(), []);
}));

test('a failed replacement rolls back deletions and does not report the mirror as a successful canonical save', async () => fixture(async ({ sqlite }) => {
  await store.saveCompanions([{ id: 'original', name: 'Original' }]);
  sqlite.exec("CREATE TRIGGER reject_bad_companion BEFORE INSERT ON companions WHEN NEW.name = 'Rejected' BEGIN SELECT RAISE(ABORT, 'write failed'); END");
  await assert.rejects(store.saveCompanions([{ id: 'replacement', name: 'Rejected' }]), /could not be saved.*write failed/);
  assert.deepEqual((await store.loadCompanions()).map(companion => companion.id), ['original']);
  await assert.rejects(store.saveCompanions(null), /must be an array/);
  await assert.rejects(store.saveCompanions([{ id: 'same', name: 'First' }, { id: 'same', name: 'Second' }]), /unique ID/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM companions').get().count, 1);
}));

test('saving reports complete storage failure, but a failed legacy mirror cannot invalidate committed SQLite data', async () => fixture(async () => {
  const companionsApi = window.electronAPI.db.companions;
  const replaceRoster = companionsApi.replaceRoster;
  window.electronAPI.store.set = async () => { throw new Error('disk full'); };
  const result = await store.saveCompanions([{ id: 'saved', name: 'Stored in SQLite' }]);
  assert.equal(result.storage, 'sqlite');
  assert.equal((await store.loadCompanions())[0].id, 'saved');
  companionsApi.replaceRoster = async () => { throw new Error('database unavailable'); };
  await assert.rejects(store.saveCompanions([{ id: 'lost', name: 'Not saved' }]), /could not be saved.*database unavailable/);
  companionsApi.replaceRoster = replaceRoster;
  assert.equal((await store.loadCompanions())[0].id, 'saved');
}));

test('browser quota errors are reported while a compact launch journal prevents forgetting a submitted transaction', async () => {
  const previous = globalThis.window;
  const saved = new Map();
  let rejectRoster = false;
  globalThis.window = { localStorage: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => {
      if (rejectRoster && key === 'roleplayCompanions') throw new Error('quota exceeded');
      saved.set(key, value);
    },
  } };
  try {
    const original = { id: 'existing', name: 'Existing companion', image: 'data:image/png;base64,portrait', assignedWorkflowIds: ['story-studio-v1.0.0'] };
    await store.saveCompanions([original]);
    const pending = { ...original, launchStatus: 'pending', txHash: `0x${'a'.repeat(64)}`, chainId: 4663, contractAddress: 'launch-contract', agentWallet: 'agent-wallet' };
    rejectRoster = true;
    await assert.rejects(store.saveCompanions([pending]), /could not be saved.*quota exceeded/);
    const [recovered] = await store.loadCompanions();
    assert.equal(recovered.txHash, pending.txHash);
    assert.equal(recovered.launchStatus, 'pending');
    assert.equal(recovered.agentWallet, 'agent-wallet');
    assert.deepEqual(recovered.assignedWorkflowIds, original.assignedWorkflowIds);
    assert.doesNotMatch(saved.get('roleplayCompanionLaunches'), /portrait|assignedWorkflowIds/);
    saved.set('roleplayCompanions', '[]');
    assert.deepEqual(await store.loadCompanions(), [], 'Launch journals cannot resurrect a deleted companion');
  } finally { globalThis.window = previous; }
});

test('missing browser storage rejects instead of claiming that a companion was saved', async () => {
  const previous = globalThis.window;
  globalThis.window = {};
  try { await assert.rejects(store.saveCompanions([{ id: 'lost', name: 'Not stored' }]), /storage is unavailable/); }
  finally { globalThis.window = previous; }
});

test('shuffling a reactive companion roster preserves workflow edits and exact token IDs through IPC serialization', async () => fixture(async () => {
  const companions = reactive([
    { id: 'maya', name: 'Maya', tokenId: 9007199254740993n, assignedWorkflowIds: ['story-studio-v1.0.0'], spendingHabits: { education: 7 } },
  ]);
  // Roleplay shuffles by spreading its reactive array. Unwrapping only the
  // new outer array still leaves a proxied companion and nested profile.
  const shuffled = reactive([...companions]);
  assert.equal(isProxy(toRaw(shuffled)[0]), true);
  assert.throws(() => structuredClone(toRaw(shuffled)), /could not be cloned/);
  shuffled[0].assignedWorkflowIds.push('chart-forecaster-v1.0.0');
  const plain = store.serializeCompanionData(toRaw(shuffled));
  assert.equal(isProxy(plain[0]), false);
  assert.equal(plain[0].tokenId, '9007199254740993');
  assert.doesNotThrow(() => structuredClone(plain));
  await store.saveCompanions(shuffled);
  const [loaded] = await store.loadCompanions();
  assert.equal(loaded.tokenId, '9007199254740993');
  assert.deepEqual(loaded.assignedWorkflowIds, ['story-studio-v1.0.0', 'chart-forecaster-v1.0.0']);
  assert.deepEqual(loaded.spendingHabits, { education: 7 });
}));

test('an older preload without replaceRoster durably saves to the existing roster and reconciles after restart', async () => fixture(async ({ sqlite, legacy }) => {
  await store.saveCompanions([{ id: 'removed', name: 'Old companion' }]);
  sqlite.prepare('INSERT INTO companion_memory (id, companion_id, scope, content, created_at) VALUES (?, ?, ?, ?, ?)').run('old-memory', 'removed', 'long_term_user', 'Private', 1);
  const api = window.electronAPI.db.companions;
  const replaceRoster = api.replaceRoster;
  delete api.replaceRoster;
  const created = {
    id: 'created', name: 'New smart agent', isCustom: true, tokenId: '0', tokenAddress: 'social-token',
    assignedWorkflowIds: ['chart-forecaster-v1.0.0'], launchStatus: 'pending', txHash: `0x${'c'.repeat(64)}`,
  };
  assert.deepEqual(await store.saveCompanions([created]), { saved: true, storage: 'local' });
  assert.deepEqual(legacy.get('roleplayCompanions'), [created]);
  assert.deepEqual(repo.list().map(row => row.id), ['removed'], 'An old main cannot atomically replace SQL yet');
  const reloadedStore = await loadModule('../src/services/roleplayStore.service.js', [
    [/import \{ memoryService \} from '.\/memory.service.js';/, 'const memoryService = {};'],
    [/$/, '\n// Fresh renderer after a compatibility save.'],
  ]);
  assert.deepEqual(await reloadedStore.loadCompanions(), [created], 'Company and Roleplay both read this canonical loader');
  api.replaceRoster = replaceRoster;
  assert.deepEqual(await reloadedStore.loadCompanions(), [created]);
  assert.equal(legacy.get('roleplayCompanionsPendingSQLite'), null);
  assert.deepEqual(repo.list().map(row => row.id), ['created']);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM companion_memory').get().count, 0);
  legacy.clear();
  const [fromSql] = await store.loadCompanions();
  assert.equal(fromSql.tokenId, '0');
  assert.equal(fromSql.tokenAddress, 'social-token');
  assert.deepEqual(fromSql.assignedWorkflowIds, created.assignedWorkflowIds);
  assert.equal(fromSql.txHash, created.txHash);
}));

test('the exact missing-handler rejection accepts deletion of the entire roster and never revives it from stale SQLite', async () => fixture(async ({ legacy }) => {
  await store.saveCompanions([{ id: 'removed', name: 'Delete this companion' }]);
  const api = window.electronAPI.db.companions;
  const replaceRoster = api.replaceRoster;
  api.replaceRoster = async () => { throw new Error("Error invoking remote method 'db:companions:replaceRoster': Error: No handler registered for 'db:companions:replaceRoster'"); };
  assert.deepEqual(await store.saveCompanions([]), { saved: true, storage: 'local' });
  assert.deepEqual(await store.loadCompanions(), []);
  assert.equal(repo.list().length, 1);
  api.replaceRoster = replaceRoster;
  assert.deepEqual(await store.loadCompanions(), []);
  assert.equal(repo.list().length, 0);
  assert.equal(legacy.get('roleplayCompanionsPendingSQLite'), null);
}));

test('unrelated IPC errors never authorize compatibility writes', async () => fixture(async ({ legacy }) => {
  const original = { id: 'original', name: 'Canonical' };
  await store.saveCompanions([original]);
  window.electronAPI.db.companions.replaceRoster = async () => { throw new Error("No handler registered for 'db:other:operation'"); };
  await assert.rejects(store.saveCompanions([{ id: 'rejected', name: 'Rejected' }]), /could not be saved.*db:other:operation/);
  assert.deepEqual(legacy.get('roleplayCompanions'), [original]);
  assert.equal(legacy.has('roleplayCompanionsPendingSQLite'), false);
  assert.deepEqual((await store.loadCompanions()).map(row => row.id), ['original']);
}));

test('compatibility storage failures reject the edit and preserve the last accepted local roster', async () => fixture(async ({ legacy }) => {
  await store.saveCompanions([{ id: 'sql', name: 'Old SQL companion' }]);
  delete window.electronAPI.db.companions.replaceRoster;
  const write = window.electronAPI.store.set;
  window.electronAPI.store.set = async (key, value) => {
    if (key === 'roleplayCompanionsPendingSQLite') throw new Error('marker disk full');
    return write(key, value);
  };
  await assert.rejects(store.saveCompanions([{ id: 'not-accepted', name: 'Not accepted' }]), /could not be saved.*marker disk full/);
  assert.deepEqual((await store.loadCompanions()).map(row => row.id), ['sql']);
  window.electronAPI.store.set = write;
  const accepted = { id: 'accepted', name: 'Accepted local companion' };
  await store.saveCompanions([accepted]);
  window.electronAPI.store.set = async (key, value) => {
    if (key === 'roleplayCompanions') throw new Error('roster disk full');
    return write(key, value);
  };
  await assert.rejects(store.saveCompanions([]), /could not be saved.*roster disk full/);
  assert.deepEqual(await store.loadCompanions(), [accepted]);
  assert.deepEqual(legacy.get('roleplayCompanions'), [accepted]);
}));

test('failed reconciliation retains accepted local data but does not hide a new SQLite write failure', async () => fixture(async ({ legacy }) => {
  const api = window.electronAPI.db.companions;
  const replaceRoster = api.replaceRoster;
  delete api.replaceRoster;
  const accepted = { id: 'accepted', name: 'Accepted before restart', assignedWorkflowIds: [] };
  await store.saveCompanions([accepted]);
  api.replaceRoster = async () => { throw new Error('SQLite disk full'); };
  assert.deepEqual(await store.loadCompanions(), [accepted]);
  await assert.rejects(store.saveCompanions([]), /could not be saved.*SQLite disk full/);
  assert.deepEqual(await store.loadCompanions(), [accepted]);
  assert.deepEqual(legacy.get('roleplayCompanions'), [accepted]);
  api.replaceRoster = replaceRoster;
  await store.loadCompanions();
  assert.deepEqual(repo.list().map(row => row.id), ['accepted']);
  assert.equal(legacy.get('roleplayCompanionsPendingSQLite'), null);
}));

test('a marker-clear failure cannot roll back a later successful SQLite save', async () => fixture(async () => {
  const api = window.electronAPI.db.companions;
  const replaceRoster = api.replaceRoster;
  delete api.replaceRoster;
  const accepted = { id: 'accepted', name: 'Local accepted' };
  await store.saveCompanions([accepted]);
  api.replaceRoster = replaceRoster;
  const write = window.electronAPI.store.set;
  window.electronAPI.store.set = async (key, value) => {
    if (key === 'roleplayCompanionsPendingSQLite' && value === null) throw new Error('cannot clear marker');
    return write(key, value);
  };
  await assert.rejects(store.saveCompanions([{ id: 'newer', name: 'Newer edit' }]), /could not be saved.*cannot clear marker/);
  assert.deepEqual(repo.list().map(row => row.id), ['accepted']);
  assert.deepEqual(await store.loadCompanions(), [accepted]);
  window.electronAPI.store.set = write;
  await store.saveCompanions([{ id: 'newer', name: 'Newer edit' }]);
  assert.deepEqual((await store.loadCompanions()).map(row => row.id), ['newer']);
}));

test('separate token issuance journal survives quota failure without replacing the NFT mint receipt', async () => {
  const previous = globalThis.window, saved = new Map();
  let rejectRoster = false;
  globalThis.window = { localStorage: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { if (rejectRoster && key === 'roleplayCompanions') throw Error('quota exceeded'); saved.set(key, value); },
  } };
  try {
    const minted = { id: 'separate-token', name: 'Rose', txHash: 'mint-receipt', launchStatus: 'confirmed', tokenId: '1', chainId: 4663 };
    await store.saveCompanions([minted]);
    rejectRoster = true;
    await assert.rejects(store.saveCompanions([{...minted, tokenLaunchTx:'issue-receipt',tokenLaunchStatus:'pending'}]), /quota exceeded/);
    const [recovered] = await store.loadCompanions();
    assert.equal(recovered.txHash,'mint-receipt');
    assert.equal(recovered.launchStatus,'confirmed');
    assert.equal(recovered.tokenLaunchTx,'issue-receipt');
    assert.equal(recovered.tokenLaunchStatus,'pending');
  } finally { globalThis.window = previous; }
});
