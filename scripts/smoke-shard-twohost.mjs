#!/usr/bin/env node
/** Verify Python ↔ Node framing over a real local socket, without model weights or peers. */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const localPython = join(ROOT, 'bonzai', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python3');
const python = process.env.BONZAI_PYTHON || (existsSync(localPython) ? localPython : 'python');

function completion(child) {
  return new Promise(resolve => {
    child.once('error', error => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function main() {
  // Keep AF_UNIX paths below macOS's 104-byte limit.
  const temp = mkdtempSync(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'bz-shard-'));
  const env = { ...process.env, BONZAI_SHARD_SOCKET: join(temp, 'bridge.sock') };
  const bridge = spawn(process.execPath, [join(ROOT, 'scripts/smoke-shard-uds.mjs')], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const bridgeDone = completion(bridge);
  let client;
  let timeout;
  try {
    const ready = new Promise(resolve => {
      let output = '';
      bridge.stdout.on('data', chunk => {
        process.stdout.write(chunk);
        output += chunk.toString();
        if (output.includes('[smoke] ready')) resolve();
      });
    });
    const bridgeStopped = bridgeDone.then(result => {
      throw result.error || new Error(`Node bridge exited unexpectedly: ${result.code ?? result.signal}`);
    });
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Privacy bridge smoke timed out')), 45000);
    });
    await Promise.race([ready, bridgeStopped, deadline]);
    client = spawn(python, ['-c', `
import torch
from src.server.pipeline_transport import open_session

torch.manual_seed(7)
session = open_session(peer_id='smoke-peer', session_id='smoke-session',
                       model_id='z_image_turbo', block_range=(4, 28), hidden_dim=32)
try:
    session.sock.settimeout(10)
    original = torch.randn(1, 16, 32, dtype=torch.float16) * 0.1
    session.send_activation(original)
    returned = session.recv_activation()
    assert returned.shape == original.shape
    error = (returned.float() - original.float()).square().mean().sqrt().item()
    assert error < 0.005, error
    print(f'Python/Node socket round-trip passed (RMSE={error:.6f})')
finally:
    session.close()
`], { cwd: ROOT, env, stdio: 'inherit' });
    const result = await Promise.race([completion(client), bridgeStopped, deadline]);
    if (result.error) throw result.error;
    if (result.code !== 0) throw new Error(`Python bridge smoke failed: ${result.code ?? result.signal}`);
    console.log('[twohost] OK — Python/Node wire-format round-trip passed');
  } finally {
    clearTimeout(timeout);
    if (client && client.exitCode === null) client.kill();
    if (bridge.exitCode === null) bridge.kill();
    await bridgeDone;
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('[twohost]', error.message);
  process.exitCode = 1;
});
