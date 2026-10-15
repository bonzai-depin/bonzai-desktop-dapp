/**
 * Content-addressed blob store.
 *
 * Files live at <userData>/blobs/<sha256[0:2]>/<sha256>.<ext>. The
 * 2-char shard prefix keeps directory entries under ~256 per dir,
 * which keeps fs operations fast on every platform.
 *
 * Writes are atomic: write-to-tmp + fsync + rename. Identical content
 * dedups via content addressing — if the same image lands twice (one
 * roleplay turn + one mint, say), only one file exists on disk and
 * both rows in the higher-level tables reference the same blob id.
 *
 * Public API:
 *   write(buffer, ext, meta?) → { id, path, dedup }
 *   writeBase64(b64, ext, meta?) → same shape (decodes first)
 *   read(id, ext)            → Buffer
 *   path(id, ext)            → absolute file path
 *   exists(id, ext)          → boolean
 *   sweepOrphans()           → { scanned, dropped }   ref_count = 0 cleanup
 */

import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { app } from "electron";
import { get } from "./connection.js";
import { blobs } from "./schema/blobs.js";
import { eq } from "drizzle-orm";

let _root = null;
function _rootDir() {
  if (_root) return _root;
  _root = path.join(app.getPath("userData"), "blobs");
  fs.mkdirSync(_root, { recursive: true });
  return _root;
}

/** Resolve the on-disk path for a blob id. Doesn't check existence. */
export function blobPath(id, ext) {
  const shard = id.slice(0, 2);
  const dir = path.join(_rootDir(), shard);
  return path.join(dir, `${id}.${ext}`);
}

export function exists(id, ext) {
  return fs.existsSync(blobPath(id, ext));
}

/**
 * Write a buffer to the blob store. Returns { id (sha256), path, dedup }.
 * If the same content has been written before, no file write happens
 * and `dedup: true` is returned. The blobs row's ref_count is bumped.
 *
 * @param {Buffer} buffer
 * @param {string} ext              file extension WITHOUT leading dot
 * @param {object} meta             { mimeType, width, height, durationMs, source, sourceId }
 */
export function write(buffer, ext, meta = {}) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const id = crypto.createHash("sha256").update(buffer).digest("hex");
  const target = blobPath(id, ext);
  const dir = path.dirname(target);

  const { orm, db } = get();
  const existingRow = orm.select().from(blobs).where(eq(blobs.id, id)).get();

  if (existingRow && fs.existsSync(target)) {
    // Bump ref count + return dedup signal.
    db.prepare("UPDATE blobs SET ref_count = ref_count + 1 WHERE id = ?").run(id);
    return { id, path: target, dedup: true };
  }

  // Atomic write: tmp + rename.
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp.${process.pid}`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, buffer);
    try { fs.fsyncSync(fd); } catch {}
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);

  // Insert (or upsert if the row existed but the file vanished — rare
  // but possible after manual disk ops).
  if (!existingRow) {
    orm.insert(blobs).values({
      id,
      ext,
      byteLength: buffer.byteLength,
      mimeType: meta.mimeType ?? null,
      width: meta.width ?? null,
      height: meta.height ?? null,
      durationMs: meta.durationMs ?? null,
      source: meta.source ?? null,
      sourceId: meta.sourceId ?? null,
      createdAt: Date.now(),
      refCount: 1,
    }).run();
  } else {
    db.prepare("UPDATE blobs SET ref_count = ref_count + 1 WHERE id = ?").run(id);
  }

  return { id, path: target, dedup: false };
}

/**
 * Write a file from disk to the blob store. Required for the roleplay
 * pipeline: TTS / video generation returns local file paths (Flask
 * `audio_path`, `video_path`) that get stuffed into `msg.audio`/`msg.video`.
 * Without pulling those into the content-addressed store on save, the
 * temp files vanish and the media is lost.
 *
 * Returns the same { id, path, dedup } shape as `write()`. Throws if
 * the source path doesn't exist.
 */
export function writeFromPath(srcPath, ext, meta = {}) {
  if (!fs.existsSync(srcPath)) {
    throw new Error(`writeFromPath: source not found: ${srcPath}`);
  }
  const buffer = fs.readFileSync(srcPath);
  return write(buffer, ext, meta);
}

/**
 * Write a base64-encoded payload (with or without `data:<mime>;base64,`
 * prefix). Convenience over write() for legacy inferenceStore data.
 */
export function writeBase64(b64, ext, meta = {}) {
  let mime = meta.mimeType ?? null;
  let raw = b64;
  if (b64.startsWith("data:")) {
    const m = b64.match(/^data:([^;]+);base64,(.+)$/);
    if (m) {
      mime = mime || m[1];
      raw = m[2];
    }
  }
  const buffer = Buffer.from(raw, "base64");
  return write(buffer, ext, { ...meta, mimeType: mime });
}

/** Read a blob's bytes. Throws if missing. */
export function read(id, ext) {
  const p = blobPath(id, ext);
  if (!fs.existsSync(p)) throw new Error(`blob not found: ${id}.${ext}`);
  return fs.readFileSync(p);
}

/** Decrement ref_count for a blob. Returns the new count. */
export function unref(id) {
  const { db } = get();
  const row = db.prepare("UPDATE blobs SET ref_count = MAX(0, ref_count - 1) WHERE id = ? RETURNING ref_count").get(id);
  return row?.ref_count ?? 0;
}

/**
 * Drop blobs with ref_count = 0 (and the underlying file). Returns
 * counts. Safe to run periodically; doesn't touch files referenced
 * by any current row.
 */
export function sweepOrphans() {
  const { orm, db } = get();
  const rows = db.prepare("SELECT id, ext FROM blobs WHERE ref_count <= 0").all();
  let dropped = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const p = blobPath(r.id, r.ext);
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
      orm.delete(blobs).where(eq(blobs.id, r.id)).run();
      dropped++;
    }
  });
  tx();
  return { scanned: rows.length, dropped };
}

/**
 * Total bytes occupied by the blob store. Used by the future "Storage
 * usage" Settings panel.
 */
export function diskUsage() {
  const { db } = get();
  const r = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(byte_length), 0) AS bytes FROM blobs").get();
  return { count: r?.n ?? 0, bytes: r?.bytes ?? 0 };
}

/** Stream large trained weights into the same content-addressed store. */
export async function writeFromPathStream(source, ext, meta = {}) {
  if (!/^[a-z0-9]{1,12}$/.test(ext)) throw new Error('Invalid blob extension.');
  const root = _rootDir(), temporary = path.join(root, `.incoming-${crypto.randomUUID()}`);
  const hash = crypto.createHash('sha256');
  let size = 0;
  try {
    const output = await fs.promises.open(temporary, 'wx', 0o600);
    try {
      for await (const chunk of fs.createReadStream(source, { flags: fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) })) {
        size += chunk.length;
        if (size > 32 * 1024 ** 3) throw new Error('Delivery exceeds 32 GiB.');
        hash.update(chunk); await output.writeFile(chunk);
      }
      await output.sync();
    } finally { await output.close(); }
    const id = hash.digest('hex');
    if (!size || (meta.sha256 && id !== meta.sha256) || (meta.size && size !== meta.size)) throw new Error('Artifact integrity check failed.');
    const target = blobPath(id, ext); await fs.promises.mkdir(path.dirname(target), {recursive:true});
    await fs.promises.rename(temporary, target);
    const { db } = get();
    db.prepare(`INSERT INTO blobs (id,ext,byte_length,mime_type,source,source_id,created_at,ref_count)
      VALUES (?,?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET ref_count=ref_count+1`).run(id, ext, size, meta.mimeType || null, meta.source || 'peer-worker', meta.sourceId || null, Date.now());
    return {id, path:target, size};
  } finally { await fs.promises.rm(temporary, {force:true}); }
}
