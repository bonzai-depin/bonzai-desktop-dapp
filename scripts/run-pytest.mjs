#!/usr/bin/env node
// Runs the Python security suite through whichever interpreter actually has
// pytest installed. Windows ships `python`, macOS/Linux dev toolchains ship
// `python3`, and CI (setup-python) provides both — so npm scripts can't pin one
// token and stay cross-platform.
// ponytail: simple first-match probe; if a real need for venv-aware resolution
// shows up, switch to `python -m pytest` behind a configured PYTHON env var.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/run-pytest.mjs <pytest args...>');
  process.exit(2);
}

const candidates =
  process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

let exe = null;
for (const c of candidates) {
  if (spawnSync(c, ['-c', 'import pytest'], { stdio: 'ignore' }).status === 0) {
    exe = c;
    break;
  }
}
if (!exe) {
  console.error(
    'No Python interpreter with pytest found.\n' +
      'Install dev deps: pip install -r requirements.txt',
  );
  process.exit(127);
}

const res = spawnSync(exe, ['-m', 'pytest', ...args], { stdio: 'inherit' });
process.exit(res.status ?? 1);
