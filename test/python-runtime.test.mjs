import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveDevelopmentPython } from '../src/main/pythonRuntime.js';

const resolve = (available, options = {}) => resolveDevelopmentPython({
  projectRoot: '/project',
  platform: 'darwin',
  env: { PATH: '/usr/local/bin:/usr/bin' },
  isExecutable: candidate => available.includes(candidate),
  ...options,
});

test('an explicit interpreter overrides activated and project environments', () => {
  assert.deepEqual(resolve([
    '/custom/python', '/active/bin/python3', '/project/.venv/bin/python3',
  ], { env: { BONZAI_PYTHON_PATH: '/custom/python', VIRTUAL_ENV: '/active' } }), {
    cmd: '/custom/python', source: 'configured',
  });
});

test('an invalid explicit interpreter fails instead of silently running another environment', () => {
  assert.throws(() => resolve(['/project/.venv/bin/python3'], {
    env: { BONZAI_PYTHON_PATH: '/missing/python' },
  }), /BONZAI_PYTHON_PATH.*\/missing\/python.*unset/);
});

test('a relative explicit interpreter is resolved against the project directory', () => {
  assert.deepEqual(resolve(['/project/custom env/bin/python'], {
    env: { BONZAI_PYTHON_PATH: './custom env/bin/python' },
  }), { cmd: '/project/custom env/bin/python', source: 'configured' });
});

test('an activated environment takes precedence over project environments', () => {
  assert.deepEqual(resolve([
    '/active/bin/python', '/project/.venv/bin/python3', '/project/bonzai/bin/python3',
  ], { env: { VIRTUAL_ENV: '/active' } }), {
    cmd: '/active/bin/python', source: 'virtual-env',
  });
});

test('a stale activated environment falls through to the project .venv', () => {
  assert.deepEqual(resolve([
    '/project/.venv/bin/python3', '/project/bonzai/bin/python3', '/usr/bin/python3',
  ], { env: { VIRTUAL_ENV: '/removed', PATH: '/usr/bin' } }), {
    cmd: '/project/.venv/bin/python3', source: 'project-venv',
  });
});

test('the existing legacy BonzAI environment wins over unrelated system Python', () => {
  assert.deepEqual(resolve(['/project/bonzai/bin/python3', '/usr/bin/python3']), {
    cmd: '/project/bonzai/bin/python3', source: 'legacy-venv',
  });
});

test('Linux PATH fallback preserves command preference and PATH directory order', () => {
  assert.deepEqual(resolve(['/first/python', '/second/python3', '/third/python3'], {
    platform: 'linux', env: { PATH: '/first:/second:/third' },
  }), { cmd: '/second/python3', source: 'path' });
});

test('Windows virtual environments use Scripts/python.exe', () => {
  assert.deepEqual(resolveDevelopmentPython({
    projectRoot: 'C:\\BonzAI', platform: 'win32', env: {},
    isExecutable: candidate => candidate === 'C:\\BonzAI\\.venv\\Scripts\\python.exe',
  }), { cmd: 'C:\\BonzAI\\.venv\\Scripts\\python.exe', source: 'project-venv' });
});

test('Windows PATH fallback accepts mixed-case Path and directories with spaces', () => {
  assert.deepEqual(resolveDevelopmentPython({
    projectRoot: 'C:\\BonzAI', platform: 'win32',
    env: { Path: 'C:\\Missing;"C:\\Program Files\\Python"' },
    isExecutable: candidate => candidate === 'C:\\Program Files\\Python\\python.exe',
  }), { cmd: 'C:\\Program Files\\Python\\python.exe', source: 'path' });
});

test('missing Python reports setup instructions without attempting an install', () => {
  assert.throws(() => resolve([]), /No Python executable.*install-python-deps.py.*BONZAI_PYTHON_PATH/);
});

test('filesystem detection preserves a venv symlink rather than selecting its base interpreter', {
  skip: process.platform === 'win32' && 'Creating test symlinks requires Windows developer privileges',
}, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bonzai-python-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, '.venv', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const base = path.join(root, 'base-python');
  fs.writeFileSync(base, '#!/bin/sh\n', { mode: 0o755 });
  const link = path.join(bin, 'python3');
  fs.symlinkSync(base, link);
  assert.deepEqual(resolveDevelopmentPython({ projectRoot: root, env: {} }), {
    cmd: link, source: 'project-venv',
  });
});

test('filesystem detection rejects directories and non-executable files as explicit Python', {
  skip: process.platform === 'win32' && 'Unix executable permission bits are not used on Windows',
}, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bonzai-python-invalid-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const notExecutable = path.join(root, 'python');
  fs.writeFileSync(notExecutable, '', { mode: 0o644 });
  for (const candidate of [root, notExecutable]) {
    assert.throws(() => resolveDevelopmentPython({
      projectRoot: root, env: { BONZAI_PYTHON_PATH: candidate },
    }), /not an executable Python file/);
  }
});
