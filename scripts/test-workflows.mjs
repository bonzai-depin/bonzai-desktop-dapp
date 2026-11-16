import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const browser = process.argv.includes('--browser');
if (browser && !process.env.BONZAI_UI_URL) {
  console.error('Browser acceptance requires BONZAI_UI_URL pointing to an isolated Vite server. Refusing a silently skipped run.');
  process.exit(1);
}
const files = readdirSync('test').filter(name => /^(company-|gmao-|workflow-|business-demo|media-production|team-communication|purchasing-logistics|finance-connectors|chorus-billing|smart-workflow-|smart-agent-creation)/.test(name)
  && name.endsWith('.test.mjs') && name.includes('.browser.') === browser).sort().map(name => `test/${name}`);
if (!files.length) throw new Error('No workflow tests were selected.');
console.log(`Running ${files.length} ${browser ? 'browser' : 'service and persistence'} workflow test files. External providers and inference are fixtures; this does not certify live services.`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...files], { stdio: 'inherit', env: process.env });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
