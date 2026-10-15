import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from '../src/utils/withTimeout.js';

test('an unavailable IPC read releases its loading state with a retryable error', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 10, 'Retry the local service'), /Retry the local service/);
});

test('a retry succeeds after an earlier timed-out read', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 5), /timed out/);
  assert.deepEqual(await withTimeout(Promise.resolve({ installed: true }), 50), { installed: true });
});

test('service failures retain the useful upstream reason', async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error('Local gateway is offline')), 50), /Local gateway is offline/);
});
