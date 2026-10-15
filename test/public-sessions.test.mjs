import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
test('X mentions produce persisted, reviewable replies with real media conversion and no private context', { timeout: 120000 }, async () => {
  const folder = fs.mkdtempSync(path.join(process.cwd(), '.public-tests-'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bonzai-public-fixture-'));
  try {
    const outfile = path.join(folder, 'integration.mjs');
    await build({ entryPoints: ['test/fixtures/company/publicSessions.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', plugins: [{ name: 'isolated-public-database', setup(builder) {
      builder.onResolve({ filter: /connection\.js$/ }, args => args.importer.includes('/src/main/db/') ? { path: path.resolve('test/fixtures/company/connection.js') } : null);
      builder.onResolve({ filter: /smartAgentCatalog\.js$/ }, () => ({ path: 'agents', namespace: 'test-runtime' }));
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test-runtime' }));
      builder.onResolve({ filter: /skill\.service\.js$/ }, () => ({ path: 'skills', namespace: 'test-runtime' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-runtime' }, args => ({ contents: args.path === 'electron' ? `export const app = { getPath: () => ${JSON.stringify(data)} };` : args.path === 'skills' ? 'export const skillService = {};' : 'export const smartAgentCatalog = { agents: [] }; export async function loadSmartAgents() {}', loader: 'js' }));
    } }] });
    const result = spawnSync(require('electron'), [outfile], { cwd: process.cwd(), encoding: 'utf8', timeout: 110000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    console.log(result.stdout.trim());
  } finally { fs.rmSync(folder, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true }); }
});
