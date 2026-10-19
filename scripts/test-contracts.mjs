import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Hardhat's default recursive discovery also loads unrelated ESM service
// fixtures under test/. Only contract suites belong in the Hardhat runner.
const suites = readdirSync('test').filter(name => /^[A-Z].*\.test\.js$/.test(name)).sort();
if (!suites.length) throw new Error('No contract test suites found');
const result = spawnSync(process.execPath, [
  'node_modules/hardhat/internal/cli/cli.js', '--config', 'hardhat.config.cjs',
  'test', ...suites.map(name => `test/${name}`), ...process.argv.slice(2),
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
