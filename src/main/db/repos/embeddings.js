/**
 * Embeddings repo — vec0 virtual table + sidecar metadata + pending queue.
 *
 * High-level flow:
 *   1. Domain repos (goals, issues, audit, roleplay_messages, generations,
 *      companion_memory) call enqueue() whenever a new/changed row needs
 *      (re-)embedding.
 *   2. The worker (src/main/db/embed-worker.js) drains the queue in
 *      batches, calls the configured embedding adapter (Phase 5b wires
 *      a concrete one — for now the adapter slot is a stub), then
 *      upserts the resulting vectors here.
 *   3. Search APIs use vec_distance_cosine(...) for top-k retrieval +
 *      JOIN against embedding_meta for source attribution.
 *
 * Dimension is fixed at 768 (matches nomic-embed-text). Changing it
 * requires re-embedding everything — write a migration that drops the
 * vec table + recreates it at the new dim, then re-enqueue every
 * embeddable row.
 */

import { get } from "../connection.js";
import { EMBED_DIM } from "../schema/embeddings.js";

/** Embed a Float32Array vector for a single source row. */
export function upsert({ sourceTable, sourceId, embedding, sourceHash, model = "nomic-embed-text-v1.5" }) {
  const { db } = get();
  if (!Array.isArray(embedding) && !ArrayBuffer.isView(embedding)) {
    throw new Error("embedding must be Float32Array or array");
  }
  const buf = embedding instanceof Float32Array
    ? Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)
    : Buffer.from(new Float32Array(embedding).buffer);

  const tx = db.transaction(() => {
    // Look up existing rowid by (source_table, source_id)
    const existing = db.prepare(
      "SELECT rowid FROM embedding_meta WHERE source_table = ? AND source_id = ?",
    ).get(sourceTable, sourceId);

    let rowid;
    if (existing) {
      rowid = existing.rowid;
      db.prepare("UPDATE embeddings SET embedding = ? WHERE rowid = ?").run(buf, rowid);
      db.prepare(
        "UPDATE embedding_meta SET embedded_at = ?, source_hash = ?, model = ? WHERE rowid = ?",
      ).run(Date.now(), sourceHash || null, model, rowid);
    } else {
      const insRow = db.prepare("INSERT INTO embeddings (embedding) VALUES (?)").run(buf);
      rowid = insRow.lastInsertRowid;
      db.prepare(`
        INSERT INTO embedding_meta (rowid, source_table, source_id, embedded_at, source_hash, model, dim)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(rowid, sourceTable, sourceId, Date.now(), sourceHash || null, model, EMBED_DIM);
    }
    return rowid;
  });
  return tx();
}

/**
 * Drop an embedding for a (source_table, source_id) pair. Called when
 * the source row is deleted.
 */
export function drop({ sourceTable, sourceId }) {
  const { db } = get();
  const tx = db.transaction(() => {
    const existing = db.prepare(
      "SELECT rowid FROM embedding_meta WHERE source_table = ? AND source_id = ?",
    ).get(sourceTable, sourceId);
    if (!existing) return false;
    db.prepare("DELETE FROM embeddings WHERE rowid = ?").run(existing.rowid);
    db.prepare("DELETE FROM embedding_meta WHERE rowid = ?").run(existing.rowid);
    return true;
  });
  return tx();
}

/**
 * Cosine-distance top-k search over a single source table (or all tables).
 *
 * @param {Float32Array | number[]} queryEmbedding
 * @param {object} opts
 *   sourceTable?: string — restrict to one source table
 *   k?: number — top results to return (default 10)
 *
 * Returns: [{ sourceTable, sourceId, distance, embeddedAt, model }]
 */
export function search(queryEmbedding, opts = {}) {
  const { db } = get();
  const buf = queryEmbedding instanceof Float32Array
    ? Buffer.from(queryEmbedding.buffer, queryEmbedding.byteOffset, queryEmbedding.byteLength)
    : Buffer.from(new Float32Array(queryEmbedding).buffer);
  const k = opts.k ?? 10;

  // sqlite-vec's recommended query shape: a sub-query against the vec
  // table with a `MATCH ?` clause + JOIN to attribution.
  const sql = `
    WITH neighbors AS (
      SELECT rowid, distance
      FROM embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    )
    SELECT
      m.source_table AS sourceTable,
      m.source_id    AS sourceId,
      m.embedded_at  AS embeddedAt,
      m.model        AS model,
      n.distance     AS distance
    FROM neighbors n
    INNER JOIN embedding_meta m ON m.rowid = n.rowid
    ${opts.sourceTable ? "WHERE m.source_table = ?" : ""}
    ORDER BY n.distance ASC
  `;
  const stmt = db.prepare(sql);
  return opts.sourceTable
    ? stmt.all(buf, k * 4, opts.sourceTable).slice(0, k)   // overfetch when filtered
    : stmt.all(buf, k);
}

// ─── Pending queue ───────────────────────────────────────────────────

/**
 * Mark a source row as needing (re-)embedding. The worker drains this
 * in batches.
 *
 * Idempotent: an enqueue with the same (source_table, source_id)
 * replaces the prior pending entry — useful when a row mutates twice
 * before the worker picks it up.
 */
export function enqueue({ sourceTable, sourceId, sourceText }) {
  if (!sourceText || typeof sourceText !== "string") return null;
  const { db } = get();
  db.prepare(`
    INSERT INTO embedding_queue (source_table, source_id, source_text, enqueued_at, attempts)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(source_table, source_id) DO UPDATE SET
      source_text = excluded.source_text,
      enqueued_at = excluded.enqueued_at,
      attempts = 0
  `).run(sourceTable, sourceId, sourceText, Date.now());
}

/** Bulk enqueue helper. */
export function enqueueMany(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const { db } = get();
  const stmt = db.prepare(`
    INSERT INTO embedding_queue (source_table, source_id, source_text, enqueued_at, attempts)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(source_table, source_id) DO UPDATE SET
      source_text = excluded.source_text,
      enqueued_at = excluded.enqueued_at,
      attempts = 0
  `);
  const tx = db.transaction(() => {
    for (const i of items) {
      if (!i?.sourceText) continue;
      stmt.run(i.sourceTable, i.sourceId, i.sourceText, Date.now());
    }
  });
  tx();
  return items.length;
}

/**
 * Pull the next batch of pending items. The worker calls this, runs
 * embeddings, then completeBatch() removes them.
 */
export function nextBatch(limit = 50) {
  const { db } = get();
  return db.prepare(`
    SELECT source_table AS sourceTable, source_id AS sourceId, source_text AS sourceText, attempts
    FROM embedding_queue
    ORDER BY enqueued_at ASC
    LIMIT ?
  `).all(limit);
}

/** Remove items from the queue after successful embedding. */
export function completeBatch(items) {
  const { db } = get();
  const stmt = db.prepare("DELETE FROM embedding_queue WHERE source_table = ? AND source_id = ?");
  const tx = db.transaction((rows) => {
    for (const r of rows) stmt.run(r.sourceTable, r.sourceId);
  });
  tx(items);
}

/** Bump attempt count on failure so backoff logic can drop chronic failures. */
export function bumpAttempts(items) {
  const { db } = get();
  const stmt = db.prepare(`
    UPDATE embedding_queue SET attempts = attempts + 1
    WHERE source_table = ? AND source_id = ?
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) stmt.run(r.sourceTable, r.sourceId);
  });
  tx(items);
}

/** Pending count for the diagnostic UI. */
export function pendingCount() {
  const { db } = get();
  const r = db.prepare("SELECT COUNT(*) AS n FROM embedding_queue").get();
  return r?.n ?? 0;
}

/** Total embeddings stored. */
export function totalCount() {
  const { db } = get();
  const r = db.prepare("SELECT COUNT(*) AS n FROM embedding_meta").get();
  return r?.n ?? 0;
}

/** Per-source-table counts for the Settings panel. */
export function countsBySource() {
  const { db } = get();
  return db.prepare(
    "SELECT source_table AS sourceTable, COUNT(*) AS count FROM embedding_meta GROUP BY source_table",
  ).all();
}

/** Wipe all embeddings — used by the dim-change rebuild flow. */
export function clearAll() {
  const { db } = get();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM embeddings").run();
    db.prepare("DELETE FROM embedding_meta").run();
    db.prepare("DELETE FROM embedding_queue").run();
  });
  tx();
}
