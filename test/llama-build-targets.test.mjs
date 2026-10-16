import assert from 'node:assert/strict';
import test from 'node:test';
import { rpcBuildTarget } from '../scripts/llama-build-targets.mjs';

test('recognizes legacy and renamed upstream RPC build targets', () => {
  assert.equal(rpcBuildTarget('set(TARGET rpc-server)\nadd_executable(${TARGET} rpc-server.cpp)'), 'rpc-server');
  assert.equal(rpcBuildTarget('set(TARGET ggml-rpc-server)\nadd_executable(${TARGET} rpc-server.cpp)'), 'ggml-rpc-server');
  assert.equal(rpcBuildTarget('set( TARGET "ggml-rpc-server" )'), 'ggml-rpc-server');
  assert.throws(() => rpcBuildTarget('set(TARGET unexpected-server)'), /Unrecognized/);
});
