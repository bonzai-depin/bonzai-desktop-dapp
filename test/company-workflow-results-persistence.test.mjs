import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
test('interactive results remain local, durable and pending explicit review in production SQLite', async () => {
  const folder = fs.mkdtempSync(path.join(process.cwd(), '.company-tests-'));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bonzai-workflow-results-'));
  try {
    const outfile = path.join(folder, 'workflow-results.mjs');
    await build({ entryPoints: ['test/fixtures/company/workflow-results.js'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent', plugins: [{ name: 'isolated-workflow-results', setup(builder) {
      builder.onResolve({ filter: /connection\.js$/ }, args => args.importer.includes('/src/main/db/') ? { path: path.resolve('test/fixtures/company/connection.js') } : null);
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const app = { getPath: () => ${JSON.stringify(data)} };`, loader: 'js' }));
    } }] });
    const result = spawnSync(require('electron'), [outfile], { cwd: process.cwd(), encoding: 'utf8', timeout: 120000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WORKFLOW_FIXTURE_DIRECTORY: data } });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /workflow results verified/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});
