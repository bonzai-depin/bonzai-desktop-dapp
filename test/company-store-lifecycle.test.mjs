import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('concurrent app/view mounts share one boot and receive work while no team screen is mounted', async () => {
  const folder = await mkdtemp(join(process.cwd(), '.company-store-test-'));
  const previousWindow = globalThis.window;
  const counts = { boot: 0, status: 0, audit: 0, gmao: 0, issues: 0, stream: 0 };
  let release, receive;
  const gate = new Promise(resolve => { release = resolve; });
  const subscribe = name => () => { counts[name]++; return () => { counts[name]--; }; };
  globalThis.__companyStoreFixture = {
    bootAll: async () => { counts.boot++; await gate; return [{ id: 'team-a' }, { id: 'team-b' }]; },
    getCompany: async id => id==='demo' ? {id, demoRun:true,workspace:{channels:[{view:'gmao'}]}} : {id},
    getGmaoSnapshot: async id => ({companyId:id,workOrders:[{id:'demo-order'}]}),
    listCompanies: async () => [{ id: 'team-a' }, { id: 'team-b' }],
    onAuditChange: subscribe('audit'), onGmaoChange: subscribe('gmao'),
  };
  globalThis.window = { electronAPI: {
    companyRuntime: { onStatus: subscribe('status'), onStream: callback => { counts.stream++; receive = callback; return () => counts.stream--; } },
    db: { issues: { onChanged: subscribe('issues') } },
  } };
  try {
    const source = await readFile('src/stores/companyStore.js', 'utf8');
    const names = [...new Set([...source.matchAll(/svc\.(\w+)/g)].map(match => match[1]))];
    await build({ entryPoints: ['src/stores/companyStore.js'], outfile: join(folder, 'store.mjs'), bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent', plugins: [{ name: 'isolated-company-service', setup(builder) {
      builder.onResolve({ filter: /company\.service\.js$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: names.map(name => `export const ${name} = globalThis.__companyStoreFixture.${name} || (() => {});`).join('\n') }));
    } }] });
    const { default: store } = await import(pathToFileURL(join(folder, 'store.mjs')));
    const appMount = store.init(), companyMount = store.init();
    assert.equal(appMount, companyMount, 'simultaneous mounts share initialization');
    await Promise.all([appMount, companyMount]);
    release(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(counts, { boot: 1, status: 1, audit: 1, gmao: 1, issues: 1, stream: 1 });
    // No Company component is needed for either team's stream. Switching views
    // must not drop updates or create new subscriptions when the screen returns.
    receive({ type: 'begin', streamId: 'a', companyId: 'team-a', role: 'CEO' });
    receive({ type: 'begin', streamId: 'b', companyId: 'team-b', role: 'COO' });
    receive({ type: 'chunk', streamId: 'b', chunk: 'Saved supplier comparison' });
    await new Promise(resolve => setTimeout(resolve, 100));
    await store.init();
    assert.equal(store.state.activeStreams.b.response, 'Saved supplier comparison');
    assert.equal(Object.keys(store.state.activeStreams).length, 2);
    assert.equal(counts.boot, 1);
    receive({ type: 'end', streamId: 'b' });
    assert.equal(store.state.activeStreams.b, undefined);
    assert.ok(store.state.activeStreams.a);
    await store.setActive('demo');
    assert.equal(store.activeCompany.value.id,'demo');
    assert.equal(store.state.gmao.companyId,'demo');
    assert.equal(store.state.companies.some(c=>c.id==='demo'),false);
    await store.refreshList();
    assert.equal(store.activeCompany.value.id,'demo','Refreshing operating teams preserves demo inspection');
    await store.setActive('team-a');
    assert.equal(store.state.inspectedDemo,null);
    store.teardown();
    assert.equal(counts.status, 0); assert.equal(counts.audit, 0); assert.equal(counts.issues, 0);
  } finally {
    globalThis.window = previousWindow;
    delete globalThis.__companyStoreFixture;
    await rm(folder, { recursive: true, force: true });
  }
});
