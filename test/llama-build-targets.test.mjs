import assert from 'node:assert/strict';
import test from 'node:test';
import { rpcBuildTarget, selectGpuBackend, buildConfigurationMatches, assertWindowsGpuFiles,
  portableLinuxFlags, portableLibraryNames, assertLinuxPortableFiles } from '../scripts/llama-build-targets.mjs';

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

test('portable Linux builds load backends as plugins and are not tuned to the build host', () => {
  const flags = portableLinuxFlags('linux', true);
  for (const flag of ['-DGGML_BACKEND_DL=ON', '-DGGML_NATIVE=OFF', '-DGGML_CPU_ALL_VARIANTS=ON', '-DCMAKE_INSTALL_RPATH=$ORIGIN']) {
    assert.ok(flags.includes(flag), flag);
  }
  // Local builds and other platforms keep their existing single-file layout.
  assert.deepEqual(portableLinuxFlags('linux', false), []);
  assert.deepEqual(portableLinuxFlags('darwin', true), []);
  assert.deepEqual(portableLinuxFlags('win32', true), []);
});

test('each Linux library ships once under the name its consumer opens', () => {
  const built = ['llama-server', 'libllama.so', 'libllama.so.0', 'libllama.so.0.0.1234',
    'libggml-base.so', 'libggml-base.so.0', 'libggml-base.so.0.9.4',
    'libggml-cuda.so', 'libggml-cuda.so.0', 'libggml-cuda.so.0.9.4',
    'libggml-cpu-armv8.2_1.so', 'libmtmd.so'];
  assert.deepEqual(portableLibraryNames(built), [
    { source: 'libggml-base.so', name: 'libggml-base.so.0' },      // linked by SONAME
    { source: 'libggml-cpu-armv8.2_1.so', name: 'libggml-cpu-armv8.2_1.so' },
    { source: 'libggml-cuda.so', name: 'libggml-cuda.so' },        // discovered by scan
    { source: 'libllama.so', name: 'libllama.so.0' },
    { source: 'libmtmd.so', name: 'libmtmd.so' },
  ]);
});

test('ARM64 CUDA packages keep GPU acceleration, RPC pooling and a CPU fallback', () => {
  const files = ['llama-server', 'rpc-server', 'llama-quantize', 'libllama.so.0', 'libggml.so.0',
    'libggml-base.so.0', 'libggml-rpc.so', 'libggml-cuda.so', 'libggml-cpu-armv8.0_1.so'];
  assert.doesNotThrow(() => assertLinuxPortableFiles(files, 'cuda'));
  for (const missing of files) {
    assert.throws(() => assertLinuxPortableFiles(files.filter(name => name !== missing), 'cuda'), /missing/);
  }
  assert.doesNotThrow(() => assertLinuxPortableFiles(files.filter(name => name !== 'libggml-cuda.so'), 'cpu'));
});
