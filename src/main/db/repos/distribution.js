/**
 * Distribution repo. The "production catalog" — every published
 * piece of content the company has shipped. Mirrors
 * `services/company/distribution.solo.js`.
 *
 * Big payloads (image / audio / video bytes) write through the blob
 * store; the `payload` text column is reserved for inline text content
 * + small JSON. New rows produced post-migration prefer blob refs; the
 * legacy importer copies the legacy base64 payload into a blob.
 */

import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { publishedContent } from "../schema/companies.js";
import * as blobStore from "../blobs.js";

export function publish(companyId, opts) {
  const { orm } = get();
  let blobId = null, blobExt = null, payload = null;

  if (opts.blobId && opts.blobExt) {
    blobId = opts.blobId; blobExt = opts.blobExt;
  } else if (opts.payload && ["image", "audio", "video", "music", "3d"].includes(opts.pipeline) && !["path", "text"].includes(opts.meta?.payloadEncoding)) {
    // Image/audio/video payload arrives as base64. Push to blob store.
    try {
      const ref = blobStore.writeBase64(opts.payload, _extOf(opts.pipeline), {
        source: "publish",
        sourceId: opts.id,
      });
      blobId = ref.id; blobExt = _extOf(opts.pipeline);
    } catch (err) {
      // Fall back to inline payload — keeps the row even if the blob
      // store is misconfigured. Phase 9 cleanup catches drift.
      payload = opts.payload;
    }
  } else if (opts.payload) {
    payload = String(opts.payload);
  }

  const row = {
    id: opts.id || uuid(),
    companyId,
    pipeline: opts.pipeline,
    prompt: opts.prompt ?? null,
    payload,
    blobId,
    blobExt,
    role: opts.role ?? null,
    companion: opts.companion ?? null,
    price: Math.round((opts.price || 0) * 100),
    currency: opts.currency || "USD",
    sales: opts.sales || 0,
    revenue: Math.round((opts.revenue || 0) * 100),
    shareLink: opts.shareLink ?? null,
    meta: opts.meta ?? null,
    createdAt: Date.now(),
  };
  orm.insert(publishedContent).values(row).run();
  return row;
}

export function listCatalog(companyId) {
  const { orm } = get();
  return orm.select().from(publishedContent)
    .where(eq(publishedContent.companyId, companyId))
    .orderBy(desc(publishedContent.createdAt)).all();
}

export function getRecord(companyId, contentId) {
  const { orm } = get();
  return orm.select().from(publishedContent)
    .where(and(eq(publishedContent.companyId, companyId), eq(publishedContent.id, contentId)))
    .get() ?? null;
}

export function clear(companyId) {
  const { orm } = get();
  orm.delete(publishedContent).where(eq(publishedContent.companyId, companyId)).run();
}

export function remove(companyId, contentId) {
  const { orm } = get();
  orm.delete(publishedContent)
    .where(and(eq(publishedContent.companyId, companyId), eq(publishedContent.id, contentId)))
    .run();
  return true;
}

function _extOf(pipeline) {
  return ({
    image: "png",
    audio: "mp3",
    music: "mp3",
    video: "mp4",
    "3d": "gltf",
    fineTune: "bin",
  })[pipeline] || "bin";
}

export function bulkInsert(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO published_content (
      id, company_id, pipeline, prompt, payload, blob_id, blob_ext,
      role, companion, price, currency, sales, revenue, share_link, meta, created_at
    ) VALUES (
      @id, @companyId, @pipeline, @prompt, @payload, @blobId, @blobExt,
      @role, @companion, @price, @currency, @sales, @revenue, @shareLink, @meta, @createdAt
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      companyId: r.companyId,
      pipeline: r.pipeline,
      prompt: r.prompt ?? null,
      payload: r.payload ?? null,
      blobId: r.blobId ?? null,
      blobExt: r.blobExt ?? null,
      role: r.role ?? null,
      companion: r.companion ?? null,
      price: Math.round((r.price || 0) * 100),
      currency: r.currency || "USD",
      sales: r.sales || 0,
      revenue: Math.round((r.revenue || 0) * 100),
      shareLink: r.shareLink ?? null,
      meta: r.meta ? JSON.stringify(r.meta) : null,
      createdAt: r.createdAt || Date.now(),
    });
  });
  tx(rows);
  return rows.length;
}
