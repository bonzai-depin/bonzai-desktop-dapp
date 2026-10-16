import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { closeHttpServer, installShutdown } from '../src/main/shutdown.js';

test('shutdown releases the listener even while a request is still running', async () => {
  const server = http.createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const request = http.get(`http://127.0.0.1:${port}`);
  request.on('error', () => {});
  await new Promise(resolve => server.once('request', resolve));
  await closeHttpServer(server);
  const replacement = http.createServer();
  await new Promise((resolve, reject) => replacement.once('error', reject).listen(port, '127.0.0.1', resolve));
  await closeHttpServer(replacement);
});

test('repeated quit requests await cleanup once before allowing exit', async () => {
  const app = new EventEmitter(); let calls = 0, allowed = 0, finish;
  app.quit = () => { const event = { prevented: false, preventDefault() { this.prevented = true; } }; app.emit('before-quit', event); if (!event.prevented) allowed++; };
  installShutdown(app, () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  app.quit(); app.quit(); await Promise.resolve();
  assert.equal(calls, 1); assert.equal(allowed, 0);
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(allowed, 1);
});
