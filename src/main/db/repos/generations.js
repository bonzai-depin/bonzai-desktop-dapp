/**
 * Generations repo. Backs the inference history that today lives in
 * `inferenceStore` (volatile Pinia). Once the renderer adapter routes
 * through this, every text/image/audio/video/3D run survives across
 * app restarts.
 *
 * Output blobs (PNG, MP4, MP3, GLTF) are written via the blob store
 * BEFORE inserting the generations row, so a row never references a
 * non-existent blob. Bulk imports use the same contract.
 */

import { v4 as uuid } from "uuid";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { get, tx } from "../connection.js";
import { generations } from "../schema/generations.js";
import { blobs } from "../schema/blobs.js";
import * as blobStore from "../blobs.js";

/**
 * Create a generation row. The caller MUST have already written any
 * output blobs via blobStore.write() and pass the resulting refs in
 * `outputBlobs: [{ blobId, ext, role }]`.
 *
 * Returns the inserted row.
 */
export function create(input) {
  const { orm } = get();
  const row = {
    id: input.id || uuid(),
    pipeline: input.pipeline,
    mode: input.mode ?? null,
    prompt: input.prompt ?? null,
    negativePrompt: input.negativePrompt ?? null,
    systemPrompt: input.systemPrompt ?? null,
    modelKey: input.modelKey ?? null,
    modelFilename: input.modelFilename ?? null,
    params: input.params ?? null,
    outputText: input.outputText ?? null,
    outputBlobs: input.outputBlobs ?? null,
    durationMs: input.durationMs ?? null,
    tokensIn: input.tokensIn ?? null,
    tokensOut: input.tokensOut ?? null,
    triggeredBy: input.triggeredBy ?? null,
    companyId: input.companyId ?? null,
    skillId: input.skillId ?? null,
    companionId: input.companionId ?? null,
    sessionId: input.sessionId ?? null,
    status: input.status || "done",
    error: input.error ?? null,
    createdAt: input.createdAt || Date.now(),
    finishedAt: input.finishedAt ?? null,
  };
  orm.insert(generations).values(row).run();
  return row;
}

/**
 * Convenience: create a generation AND write blobs in one transaction.
 * Each blob input is `{ buffer | base64, ext, role, mime?, width?, height?, durationMs? }`.
 */
export function createWithBlobs(input, blobInputs = []) {
  return tx(() => {
    const blobRefs = [];
    for (const b of blobInputs) {
      const meta = {
        mimeType: b.mime,
        width: b.width,
        height: b.height,
        durationMs: b.durationMs,
        source: "generation",
        sourceId: input.id,
      };
      const ref = b.buffer
        ? blobStore.write(b.buffer, b.ext, meta)
        : blobStore.writeBase64(b.base64, b.ext, meta);
      blobRefs.push({ blobId: ref.id, ext: b.ext, role: b.role });
    }
    return create({ ...input, outputBlobs: blobRefs.length ? blobRefs : null });
  });
}

/** Single generation by id. */
export function getById(id) {
  const { orm } = get();
  return orm.select().from(generations).where(eq(generations.id, id)).get() ?? null;
}

/**
 * List generations with filters + pagination. Newest first.
 *
 * @param {object} filter
 *   pipeline, status, triggeredBy, companyId, skillId, companionId,
 *   sessionId, modelKey, mode, sinceMs, limit (default 100), offset
 */
export function list(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.pipeline) where.push(eq(generations.pipeline, filter.pipeline));
  if (filter.status) where.push(eq(generations.status, filter.status));
  if (filter.triggeredBy) where.push(eq(generations.triggeredBy, filter.triggeredBy));
  if (filter.companyId) where.push(eq(generations.companyId, filter.companyId));
  if (filter.skillId) where.push(eq(generations.skillId, filter.skillId));
  if (filter.companionId) where.push(eq(generations.companionId, filter.companionId));
  if (filter.sessionId) where.push(eq(generations.sessionId, filter.sessionId));
  if (filter.modelKey) where.push(eq(generations.modelKey, filter.modelKey));
  if (filter.mode) where.push(eq(generations.mode, filter.mode));
  if (filter.sinceMs) where.push(sql`${generations.createdAt} >= ${filter.sinceMs}`);

  let q = orm.select().from(generations);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(generations.createdAt)).limit(filter.limit ?? 100).offset(filter.offset ?? 0).all();
}

/** Naive prompt LIKE search — Phase 5 adds vec-based semantic search. */
export function searchByPrompt(query, opts = {}) {
  const { orm } = get();
  const wild = `%${query.toLowerCase()}%`;
  let q = orm.select().from(generations).where(like(sql`lower(${generations.prompt})`, wild));
  if (opts.pipeline) q = q.where(and(like(sql`lower(${generations.prompt})`, wild), eq(generations.pipeline, opts.pipeline)));
  return q.orderBy(desc(generations.createdAt)).limit(opts.limit ?? 50).all();
}

/**
 * Update mutable fields. Used for status transitions (running → done /
 * error) and post-hoc metadata like cost estimates.
 */
export function update(id, patch) {
  const { orm } = get();
  const data = { ...patch };
  delete data.id;
  delete data.createdAt;
  orm.update(generations).set(data).where(eq(generations.id, id)).run();
  return getById(id);
}

/**
 * Delete a generation + decrement ref counts on every output blob.
 * Orphan-sweep happens separately (sweepOrphans on Settings click).
 */
export function remove(id) {
  const row = getById(id);
  if (!row) return false;
  const refs = Array.isArray(row.outputBlobs) ? row.outputBlobs : [];
  const { orm } = get();
  return tx(() => {
    orm.delete(generations).where(eq(generations.id, id)).run();
    for (const r of refs) blobStore.unref(r.blobId);
    return true;
  });
}

/**
 * Bulk insert from the legacy store importer. Skips creating output
 * blobs — caller is expected to have already written them and to
 * supply pre-computed `outputBlobs` JSON.
 */
export function bulkInsert(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO generations (
      id, pipeline, mode, prompt, negative_prompt, system_prompt,
      model_key, model_filename, params, output_text, output_blobs,
      duration_ms, tokens_in, tokens_out, triggered_by, company_id,
      skill_id, companion_id, session_id, status, error, created_at,
      finished_at
    ) VALUES (
      @id, @pipeline, @mode, @prompt, @negativePrompt, @systemPrompt,
      @modelKey, @modelFilename, @params, @outputText, @outputBlobs,
      @durationMs, @tokensIn, @tokensOut, @triggeredBy, @companyId,
      @skillId, @companionId, @sessionId, @status, @error, @createdAt,
      @finishedAt
    )
  `);
  const txn = db.transaction((items) => {
    for (const r of items) {
      stmt.run({
        id: r.id || uuid(),
        pipeline: r.pipeline,
        mode: r.mode ?? null,
        prompt: r.prompt ?? null,
        negativePrompt: r.negativePrompt ?? null,
        systemPrompt: r.systemPrompt ?? null,
        modelKey: r.modelKey ?? null,
        modelFilename: r.modelFilename ?? null,
        params: r.params ? JSON.stringify(r.params) : null,
        outputText: r.outputText ?? null,
        outputBlobs: r.outputBlobs ? JSON.stringify(r.outputBlobs) : null,
        durationMs: r.durationMs ?? null,
        tokensIn: r.tokensIn ?? null,
        tokensOut: r.tokensOut ?? null,
        triggeredBy: r.triggeredBy ?? null,
        companyId: r.companyId ?? null,
        skillId: r.skillId ?? null,
        companionId: r.companionId ?? null,
        sessionId: r.sessionId ?? null,
        status: r.status || "done",
        error: r.error ?? null,
        createdAt: r.createdAt || Date.now(),
        finishedAt: r.finishedAt ?? null,
      });
    }
  });
  txn(rows);
  return rows.length;
}

/**
 * Counts by pipeline — powers a future "Storage usage" / "Generation
 * by type" Settings panel.
 */
export function countsByPipeline() {
  const { db } = get();
  return db.prepare(
    `SELECT pipeline, COUNT(*) AS count, SUM(duration_ms) AS total_ms
     FROM generations GROUP BY pipeline ORDER BY count DESC`,
  ).all();
}
