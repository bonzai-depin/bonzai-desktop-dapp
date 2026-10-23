/** One device owner across the desktop LLM, workflow pool and Python media server. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

export class InferenceCoordinator {
  context = new AsyncLocalStorage();
  pending = [];
  active = null;
  prepare = async () => {};
  listeners = new Set();
  records = new Map();
  revision = 0;
  ownsDevice() { return !!this.active && this.context.getStore() === this.active; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  snapshot() { return [...this.records.values()].map(record => ({ ...record })); }
  publish(item, status) {
    const record = { id: item.id, kind: item.kind, title: item.title,
      status, revision: ++this.revision, activityId: item.activityId, startedAt: item.queuedAt, updatedAt: Date.now() };
    this.records.set(item.id, record);
    const ended = [...this.records.values()].filter(row => ['completed','failed','cancelled'].includes(row.status));
    for (const row of ended.slice(0, Math.max(0, ended.length - 30))) this.records.delete(row.id);
    for (const listener of this.listeners) { try { this.context.exit(() => listener({ ...record })); } catch { /* UI cannot interrupt inference. */ } }
  }
  async acquire(kind, { signal, priority = kind === 'workflow' ? 0 : 10, title, activityId } = {}) {
    if (signal?.aborted) throw signal.reason || new Error('Inference cancelled');
    if (this.pending.length >= 32) throw new Error('The inference queue is full. Please wait for a task to finish.');
    return new Promise((resolve, reject) => {
      const item = { id: randomBytes(12).toString('hex'), kind, title, activityId, priority, resolve, reject, signal, queuedAt: Date.now() };
      item.abort = () => {
        const i = this.pending.indexOf(item);
        if (i >= 0) { this.pending.splice(i, 1); this.publish(item, 'cancelled'); reject(signal.reason || new Error('Inference cancelled')); }
      };
      signal?.addEventListener('abort', item.abort, { once: true });
      this.pending.push(item);
      this.publish(item, 'queued');
      this.drain();
    });
  }
  drain() {
    if (this.active || !this.pending.length) return;
    // Age background work into the interactive priority after one minute.
    this.pending.sort((a,b) => (b.priority + Math.floor((Date.now()-b.queuedAt)/6000)) - (a.priority + Math.floor((Date.now()-a.queuedAt)/6000)));
    const item = this.pending.shift();
    this.active = item;
    item.signal?.removeEventListener('abort', item.abort);
    this.publish(item, 'running');
    let released = false;
    item.resolve((status = 'completed') => {
      if (released) return;
      released = true;
      this.publish(item, status);
      this.active = null;
      this.drain();
    });
  }
  async run(kind, operation, options = {}) {
    if (this.ownsDevice()) return operation();
    const release = await this.acquire(kind, options);
    const owner = this.active;
    let status = 'completed';
    try {
      return await this.context.run(owner, async () => {
        if (options.signal?.aborted) throw options.signal.reason || new Error('Inference cancelled');
        await this.prepare(kind);
        return operation();
      });
    } catch (error) {
      status = options.signal?.aborted || error?.name === 'AbortError' ? 'cancelled' : 'failed';
      throw error;
    } finally { release(options.signal?.aborted ? 'cancelled' : status); }
  }
}
export const localInference = new InferenceCoordinator();
let broker;
export function startInferenceBroker() {
  if (broker) return broker;
  broker = new Promise((resolve, reject) => {
    const token = randomBytes(32).toString('hex');
    const server = createServer(async (req, res) => {
      if (req.method !== 'GET' || req.url !== '/lease' || req.headers.authorization !== `Bearer ${token}`) {
        res.writeHead(403); res.end(); return;
      }
      if (req.headers['x-bonzai-benchmark'] === '1' && (localInference.active || localInference.pending.length)) {
        res.writeHead(409); res.end(); return;
      }
      const controller = new AbortController();
      res.on('close', () => controller.abort());
      try {
        await localInference.run('media', async () => {
          if (controller.signal.aborted) return;
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
          res.write('1');
          // The live socket owns the lease. Completion, cancellation, and a
          // crashed Python process all close it; no unsafe expiry timer.
          await new Promise(done => {
            if (controller.signal.aborted) done();
            else controller.signal.addEventListener('abort', done, { once: true });
          });
        }, { signal: controller.signal, priority: req.headers['x-bonzai-background'] === '1' ? 0 : 10 });
      } catch {
        if (!res.destroyed) { res.writeHead(503); res.end(); }
      }
    });
    server.requestTimeout = 0;
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.unref();
      resolve({ BONZAI_INFERENCE_COORDINATOR_URL: `http://127.0.0.1:${server.address().port}`, BONZAI_INFERENCE_COORDINATOR_TOKEN: token });
    });
  });
  return broker;
}
