import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
test('Team memory recalls business evidence and survives a scoped restore', async () => {
  const folder = fs.mkdtempSync(path.join(process.cwd(), '.company-tests-'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bonzai-memory-fixture-'));
  try {
    const outfile = path.join(folder, 'memory.mjs');
    await build({ entryPoints: ['test/fixtures/company/memory.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', plugins: [{ name: 'isolated-memory', setup(builder) {
      builder.onResolve({ filter: /connection\.js$/ }, args => args.importer.includes('/src/main/db/') ? { path: path.resolve('test/fixtures/company/connection.js') } : null);
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const app = {getPath: () => ${JSON.stringify(data)}};`, loader: 'js' }));
    } }] });
    const result = spawnSync(require('electron'), [outfile], { cwd: process.cwd(), encoding: 'utf8', timeout: 120000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    console.log(result.stdout.trim());
  } finally { fs.rmSync(folder, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true }); }
});
