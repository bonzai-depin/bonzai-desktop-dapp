import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { waitForServer } from '../src/main/serverReadiness.js';

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}/`;
}

test('a warming server is ready only after its first successful response', async (t) => {
  let requests = 0;
  const progress = [];
  const url = await serve(t, (_request, response) => {
    response.writeHead(++requests < 3 ? 503 : 200);
    response.end();
  });
  assert.equal(await waitForServer(url, {
    timeoutMs: 2000,
    pollIntervalMs: 20,
    progressIntervalMs: 10,
    onProgress: (elapsed) => progress.push(elapsed),
  }), true);
  assert.equal(requests, 3);
  assert.ok(progress.length > 0);
  assert.ok(progress.every((elapsed) => Number.isInteger(elapsed) && elapsed >= 0));
});

test('a hung health request times out without blocking a later successful retry', async (t) => {
  let requests = 0;
  const url = await serve(t, (_request, response) => {
    if (++requests === 1) return;
    response.end('ready');
  });
  assert.equal(await waitForServer(url, {
    timeoutMs: 2000,
    requestTimeoutMs: 50,
    pollIntervalMs: 5,
  }), true);
  assert.equal(requests, 2);
});

test('process exit cancels an in-flight request promptly without stale progress', async (t) => {
  const controller = new AbortController();
  let markRequested;
  const requested = new Promise((resolve) => { markRequested = resolve; });
  let requests = 0;
  const progress = [];
  const url = await serve(t, () => {
    requests += 1;
    markRequested();
  });
  const result = assert.rejects(waitForServer(url, {
    signal: controller.signal,
    timeoutMs: 5000,
    requestTimeoutMs: 5000,
    pollIntervalMs: 5,
    progressIntervalMs: 5,
    onProgress: (elapsed) => progress.push(elapsed),
  }), { name: 'AbortError' });
  await requested;
  const cancelledAt = performance.now();
  controller.abort(new Error('Python exited'));
  await result;
  assert.ok(performance.now() - cancelledAt < 1000);
  await delay(30);
  assert.equal(requests, 1);
  assert.deepEqual(progress, []);
});

test('cancelling during retry progress prevents another request or ready result', async (t) => {
  const controller = new AbortController();
  let requests = 0;
  let progress = 0;
  const url = await serve(t, (_request, response) => {
    response.writeHead(++requests < 3 ? 503 : 200);
    response.end();
  });
  await assert.rejects(waitForServer(url, {
    signal: controller.signal,
    timeoutMs: 2000,
    pollIntervalMs: 20,
    progressIntervalMs: 10,
    onProgress: () => { progress += 1; controller.abort(); },
  }), { name: 'AbortError' });
  const requestsAtCancellation = requests;
  await delay(40);
  assert.ok(requestsAtCancellation < 3);
  assert.equal(requests, requestsAtCancellation);
  assert.equal(progress, 1);
});

test('an already cancelled startup does not contact the server', async (t) => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  const url = await serve(t, (_request, response) => {
    requests += 1;
    response.end();
  });
  await assert.rejects(waitForServer(url, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(requests, 0);
});

test('cancelling between polls does not wait for the long retry interval', async (t) => {
  const controller = new AbortController();
  let requests = 0;
  let markRequested;
  const requested = new Promise((resolve) => { markRequested = resolve; });
  const url = await serve(t, (_request, response) => {
    requests += 1;
    response.writeHead(503);
    response.end();
    markRequested();
  });
  const result = assert.rejects(waitForServer(url, {
    signal: controller.signal,
    timeoutMs: 10000,
    pollIntervalMs: 5000,
  }), { name: 'AbortError' });
  await requested;
  await delay(30);
  const cancelledAt = performance.now();
  controller.abort();
  await result;
  assert.ok(performance.now() - cancelledAt < 1000);
  assert.equal(requests, 1);
});

test('the startup deadline interrupts a request with a longer individual timeout', async (t) => {
  const url = await serve(t, () => {});
  let progress = 0;
  const startedAt = performance.now();
  await assert.rejects(waitForServer(url, {
    timeoutMs: 100,
    requestTimeoutMs: 5000,
    pollIntervalMs: 5,
    onProgress: () => { progress += 1; },
  }), { name: 'TimeoutError', message: 'The server did not start within 1s.' });
  assert.ok(performance.now() - startedAt < 1000);
  await delay(30);
  assert.equal(progress, 0);
});

test('readiness does not wait for the successful response body to finish', async (t) => {
  const url = await serve(t, (_request, response) => {
    response.writeHead(200);
    response.flushHeaders();
  });
  assert.equal(await waitForServer(url, { timeoutMs: 1000 }), true);
});
