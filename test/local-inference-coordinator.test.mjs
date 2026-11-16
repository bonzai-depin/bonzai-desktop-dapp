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

test('a saturated queue refuses excess work without disturbing the active owner', async () => {
  const queue = new InferenceCoordinator();
  const release = await queue.acquire('llm');
  const controllers = Array.from({length:32}, () => new AbortController());
  const pending = controllers.map(controller => queue.acquire('media', {signal:controller.signal}).catch(() => {}));
  await assert.rejects(queue.acquire('media'), /queue is full/);
  assert.equal(queue.active.kind, 'llm');
  controllers.forEach(controller => controller.abort());
  await Promise.all(pending);
  release();
  assert.equal(queue.pending.length,0);
  const next = await queue.acquire('media'); next();
});

test('image → lyrics → image keeps loading and completion atomic and publishes all states', async () => {
  const queue = new InferenceCoordinator();
  const events = [];
  queue.subscribe(event => events.push(event));
  queue.subscribe(() => { throw new Error('broken observer'); });
  const releaseImage = await queue.acquire('media');
  let finishLyrics;
  const gate = new Promise(resolve => { finishLyrics = resolve; });
  const order = [];
  const lyrics = queue.run('llm', async () => {
    await queue.run('llm', async () => order.push('load lyrics model'));
    await gate;
    order.push('lyrics completed');
  }, { title: 'Generating lyrics' });
  const image = queue.run('media', () => order.push('new image'));
  assert.equal(queue.snapshot().find(row => row.title === 'Generating lyrics').status, 'queued');
  releaseImage();
  await tick();
  assert.deepEqual(order, ['load lyrics model']);
  finishLyrics();
  await Promise.all([lyrics, image]);
  assert.deepEqual(order, ['load lyrics model','lyrics completed','new image']);
  assert.deepEqual(events.filter(row => row.title === 'Generating lyrics').map(row => row.status), ['queued','running','completed']);
  assert.equal(queue.snapshot().length, 3, 'nested model loads must not produce duplicate tasks');
});

test('cancellation and failures are visible without cancelling another request', async () => {
  const queue = new InferenceCoordinator();
  const release = await queue.acquire('media');
  const abort = new AbortController();
  const cancelled = queue.run('llm', () => assert.fail('cancelled job executed'), {signal:abort.signal,title:'cancel me'});
  const failed = queue.run('llm', () => { throw new Error('bad model'); }, {title:'failure'});
  abort.abort();
  await assert.rejects(cancelled);
  release();
  await assert.rejects(failed, /bad model/);
  assert.equal(queue.snapshot().find(row => row.title === 'cancel me').status,'cancelled');
  assert.equal(queue.snapshot().find(row => row.title === 'failure').status,'failed');
  assert.equal(await queue.run('media', () => 'still works'),'still works');
});
