// Verify the staged runtime, including CPU startup without the GPU plugin.
// Hosted runners cannot establish real GPU performance; test that on hardware.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertWindowsGpuFiles } from './llama-build-targets.mjs';

if (process.platform !== 'win32') throw new Error('Run this check on Windows');
const source = path.resolve(process.argv[2] || 'bin/windows-x64');
const python = path.join(process.env.pythonLocation || '', 'python.exe');
if (!path.isAbsolute(python) || !fs.existsSync(python)) throw new Error('Set up Python before verifying the native runtime');
const probe = fileURLToPath(new URL('./verify-gguf-cpu.py', import.meta.url));
const files = fs.readdirSync(source).filter(name => /\.(exe|dll)$/i.test(name));
assertWindowsGpuFiles(files);
for (const name of files) {
  if (!fs.statSync(path.join(source, name)).size) throw new Error(`Empty native file: ${name}`);
}
const marker = JSON.parse(fs.readFileSync(path.join(source, '.llama-source.json'), 'utf8'));
for (const flag of ['-DGGML_VULKAN=ON', '-DGGML_BACKEND_DL=ON', '-DBUILD_SHARED_LIBS=ON']) {
  if (!marker.cmakeFlags?.includes(flag)) throw new Error(`Missing build capability: ${flag}`);
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'bonzai-native-check-'));
try {
  for (const name of files) fs.copyFileSync(path.join(source, name), path.join(staging, name));
  const env = { ...process.env };
  // Do not let the build SDK, checkout or cached DLLs hide a packaging defect.
  for (const key of Object.keys(env)) {
    if (/^(path|vulkan_sdk|vk_sdk_path|ggml_backend_path|ggml_backend_dl_path)$/i.test(key)) delete env[key];
  }
  env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
  for (const withoutGpu of [false, true]) {
    if (withoutGpu) fs.renameSync(path.join(staging, 'ggml-vulkan.dll'), path.join(staging, 'ggml-vulkan.disabled'));
    const result = spawnSync(path.join(staging, 'llama-server.exe'), ['--list-devices'], {
      cwd: staging, env, encoding: 'utf8', timeout: 30000,
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    process.stdout.write(output);
    if (result.error || result.status !== 0) throw new Error(`Native startup failed (GPU plugin ${withoutGpu ? 'absent' : 'present'}): ${result.error || result.status}`);
    // --list-devices omits CPUs, and its early exit can lose async backend logs.
    // Inspect the native registry instead of treating missing log text as failure.
    const registry = spawnSync(python, [probe, staging], {
      cwd: staging, env, encoding: 'utf8', timeout: 30000,
    });
    process.stdout.write(`${registry.stdout || ''}\n${registry.stderr || ''}`);
    if (registry.error || registry.status !== 0) throw new Error(`Packaged CPU backend verification failed: ${registry.error || registry.status}`);
    console.log(`Verified standalone runtime with GPU plugin ${withoutGpu ? 'absent (CPU fallback)' : 'present'}`);
  }
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
