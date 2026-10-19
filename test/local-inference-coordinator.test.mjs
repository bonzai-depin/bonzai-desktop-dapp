import test from 'node:test';
import assert from 'node:assert/strict';
import { InferenceCoordinator, localInference, startInferenceBroker } from '../src/services/localInferenceCoordinator.js';
import { spawn } from 'node:child_process';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('roleplay media waits for active work, then precedes queued workflow work', async () => {
  const queue = new InferenceCoordinator();
  const order = [];
  const release = await queue.acquire('llm');
  const background = queue.run('workflow', () => order.push('workflow'));
  const interactive = queue.run('media', () => order.push('media'));
  assert.deepEqual(order, []);
  release();
  await Promise.all([background, interactive]);
  assert.deepEqual(order, ['media', 'workflow']);
});
test('cancelled queued requests never load models and failed handoffs release the device', async () => {
  const queue = new InferenceCoordinator();
  const release = await queue.acquire('media');
  const abort = new AbortController();
  const waiting = queue.run('llm', () => assert.fail('cancelled work ran'), { signal: abort.signal });
  abort.abort();
  await assert.rejects(waiting);
  release();
  queue.prepare = async () => { throw new Error('unload failed'); };
  await assert.rejects(queue.run('llm', () => assert.fail('unsafe load')), /unload failed/);
  queue.prepare = async () => {};
  assert.equal(await queue.run('media', () => 42), 42);
});
test('nested model acquisition stays in its parent lease', async () => {
  const queue = new InferenceCoordinator();
  let preparations = 0;
  queue.prepare = async () => preparations++;
  await queue.run('workflow', () => queue.run('workflow', () => assert.equal(queue.active.kind, 'workflow')));
  assert.equal(preparations, 1);
});
test('Python media holds the shared lease until completion; process exit releases it', async () => {
  const env = await startInferenceBroker();
  const child = spawn('python3', ['-u', '-c', 'import sys; sys.path.insert(0,"src/server"); from inference_coordinator import device_lease\nwith device_lease():\n print("acquired",flush=True)\n sys.stdin.read()'], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`Python exited ${code}`))); });
    let ran = false;
    const pending = localInference.run('workflow', () => { ran = true; });
    await tick();
    assert.equal(ran, false);
    const refused = await fetch(env.BONZAI_INFERENCE_COORDINATOR_URL + '/lease', { headers: { Authorization: 'Bearer ' + env.BONZAI_INFERENCE_COORDINATOR_TOKEN, 'X-Bonzai-Benchmark': '1' } });
    assert.equal(refused.status, 409);
    child.stdin.end();
    await pending;
    assert.equal(ran, true);
  } finally { child.kill(); }
});
