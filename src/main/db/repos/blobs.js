/**
 * Blobs repo. Metadata-only views — actual file writes go through
 * `db/blobs.js` so the FS write happens transactionally with the row
 * insert. This module exposes lookup + sweep + stats for the UI.
 */

import { eq, desc } from "drizzle-orm";
import { get } from "../connection.js";
import { blobs } from "../schema/blobs.js";
import * as blobStore from "../blobs.js";

export function getById(id) {
  const { orm } = get();
  return orm.select().from(blobs).where(eq(blobs.id, id)).get() ?? null;
}

/** Path resolver — returns absolute on-disk path for a blob id. */
export function pathFor(id, ext) {
  return blobStore.blobPath(id, ext);
}

/** Read raw bytes — for the renderer's `electronAPI.db.blobs.read()`. */
export function readBytes(id, ext) {
  return blobStore.read(id, ext);
}

/** "Recent" view for a future History gallery. */
export function recent(opts = {}) {
  const { orm } = get();
  const limit = opts.limit ?? 50;
  let q = orm.select().from(blobs);
  if (opts.ext) q = q.where(eq(blobs.ext, opts.ext));
  return q.orderBy(desc(blobs.createdAt)).limit(limit).all();
}

/** Disk-usage stats for the Settings panel. */
export function diskUsage() {
  return blobStore.diskUsage();
}

/** Settings → "Clean unused" button hits this. */
export function sweepOrphans() {
  return blobStore.sweepOrphans();
}
