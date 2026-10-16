import assert from 'node:assert/strict';
import test from 'node:test';
import { rpcBuildTarget, selectGpuBackend, buildConfigurationMatches, assertWindowsGpuFiles } from '../scripts/llama-build-targets.mjs';

test('recognizes legacy and renamed upstream RPC build targets', () => {
  assert.equal(rpcBuildTarget('set(TARGET rpc-server)\nadd_executable(${TARGET} rpc-server.cpp)'), 'rpc-server');
  assert.equal(rpcBuildTarget('set(TARGET ggml-rpc-server)\nadd_executable(${TARGET} rpc-server.cpp)'), 'ggml-rpc-server');
  assert.equal(rpcBuildTarget('set( TARGET "ggml-rpc-server" )'), 'ggml-rpc-server');
  assert.throws(() => rpcBuildTarget('set(TARGET unexpected-server)'), /Unrecognized/);
});

test('release builds honor their GPU backend and never silently fall back to CPU', () => {
  assert.equal(selectGpuBackend('vulkan', () => true), 'vulkan');
  assert.equal(selectGpuBackend(undefined, name => name === 'hip'), 'hip');
  assert.equal(selectGpuBackend(undefined, () => false), 'cpu');
  assert.throws(() => selectGpuBackend('vulkan', () => false), /unavailable/);
  assert.throws(() => selectGpuBackend('unknown', () => true), /Unsupported/);
});

test('a cached CPU or legacy build cannot satisfy a GPU build request', () => {
  const flags = ['-DGGML_VULKAN=ON', '-DGGML_BACKEND_DL=ON'];
  assert.equal(buildConfigurationMatches({ cmakeFlags: flags }, flags), true);
  assert.equal(buildConfigurationMatches({ cmakeFlags: ['-DGGML_VULKAN=OFF'] }, flags), false);
  assert.equal(buildConfigurationMatches({ sha: 'same-source' }, flags), false);
});

test('Windows packages include GPU acceleration and every native fallback dependency', () => {
  const files = ['llama-server.exe', 'rpc-server.exe', 'llama-quantize.exe', 'llama.dll',
    'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml-rpc.dll', 'ggml-vulkan.dll'];
  assert.doesNotThrow(() => assertWindowsGpuFiles(files));
  for (const missing of files) {
    assert.throws(() => assertWindowsGpuFiles(files.filter(name => name !== missing)), /missing/);
  }
});
