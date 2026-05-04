/**
 * Embedding worker — drains the `embedding_queue` in batches.
 *
 * Pluggable adapter contract: Phase 5b registers a real adapter that
 * does `embed(texts: string[]) → Promise<Float32Array[]>`. Until then,
 * `_adapter` stays null and the worker reports "no adapter available"
 * once and goes idle. The queue accumulates harmlessly so when an
 * adapter wires in later it catches up.
 *
 * Adapter candidates:
 *   1. nomic-embed-text-v1.5 via llama-server's /v1/embeddings
 *      (load it as a separate model in the multi-instance pool)
 *   2. Flask `/embed` endpoint backed by sentence-transformers
 *   3. Anthropic / OpenAI embedding APIs (network — defeats the
 *      local-first principle, but offered as an opt-in)
 *
 * The worker is intentionally lightweight: a fixed-interval drain loop
 * with backoff on failure. Per-row attempt tracking lets us surface
 * chronic failures in the Settings UI rather than retry forever.
 */

import * as embeddings from "./repos/embeddings.js";

const BATCH_SIZE = 50;
const TICK_MS = 5_000;
const MAX_ATTEMPTS = 3;

let _adapter = null;
let _timer = null;
let _running = false;
let _stats = { embedded: 0, failed: 0, lastTickAt: 0, lastError: null };

/**
 * Register the embedding adapter. Phase 5b calls this with a concrete
 * implementation. Adapter shape:
 *   {
 *     name: string,
 *     dim: number,
 *     embed: async (texts: string[]) => Float32Array[]
 *   }
 */
export function setAdapter(adapter) {
  _adapter = adapter;
  console.log(`[embed-worker] adapter set: ${adapter?.name || "(null)"} dim=${adapter?.dim || "?"}`);
}

/**
 * Start the drain loop. Idempotent — calling twice is a no-op.
 */
export function start() {
  if (_timer) return;
  _timer = setInterval(() => { tick().catch((err) => console.warn("[embed-worker] tick error:", err?.message)); }, TICK_MS);
  // Kick once on start so the first batch fires immediately
  setTimeout(() => tick().catch(() => {}), 100);
}

/** Stop the drain loop. */
export function stop() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

/** Force a single drain tick (used by tests + manual UI button). */
export async function tick() {
  if (_running) return _stats;          // re-entrancy guard
  _running = true;
  try {
    if (!_adapter) {
      // No adapter yet — silently skip. Phase 5b will wire one.
      _stats.lastTickAt = Date.now();
      return _stats;
    }
    const batch = embeddings.nextBatch(BATCH_SIZE);
    if (batch.length === 0) {
      _stats.lastTickAt = Date.now();
      return _stats;
    }

    let vectors;
    try {
      vectors = await _adapter.embed(batch.map((b) => b.sourceText));
    } catch (err) {
      _stats.failed += batch.length;
      _stats.lastError = err?.message || String(err);
      embeddings.bumpAttempts(batch);
      // Drop chronic failures so the queue doesn't grow forever.
      const giveUp = batch.filter((b) => b.attempts + 1 >= MAX_ATTEMPTS);
      if (giveUp.length) {
        embeddings.completeBatch(giveUp);
        console.warn(`[embed-worker] dropped ${giveUp.length} chronically-failing items`);
      }
      console.warn(`[embed-worker] batch failed: ${_stats.lastError}`);
      return _stats;
    }

    // Write each vector back. Trust the adapter to return one vector
    // per input in the same order; bail loudly on length mismatch.
    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      _stats.failed += batch.length;
      _stats.lastError = `adapter returned ${vectors?.length ?? "?"} vectors for ${batch.length} inputs`;
      embeddings.bumpAttempts(batch);
      return _stats;
    }

    for (let i = 0; i < batch.length; i++) {
      try {
        embeddings.upsert({
          sourceTable: batch[i].sourceTable,
          sourceId: batch[i].sourceId,
          embedding: vectors[i],
          model: _adapter.name,
        });
        _stats.embedded++;
      } catch (err) {
        _stats.failed++;
        _stats.lastError = err?.message || String(err);
      }
    }
    embeddings.completeBatch(batch);
    _stats.lastTickAt = Date.now();
    console.log(`[embed-worker] embedded ${batch.length} items (queue depth ${embeddings.pendingCount()})`);
  } finally {
    _running = false;
  }
  return _stats;
}

export function stats() {
  return { ..._stats, hasAdapter: !!_adapter, queueDepth: embeddings.pendingCount() };
}
