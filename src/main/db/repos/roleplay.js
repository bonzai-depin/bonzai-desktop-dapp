/**
 * Roleplay repo — sessions + messages.
 *
 * Hot path: load the last N messages for a session. Single indexed
 * range scan on (session_id, created_at). Replaces the legacy 50MB
 * JSON parse that today blocks RoleplayChat for multiple seconds.
 *
 * Multi-modal media (audio/image/video) lives in the blob store with
 * blob_id + ext columns on the message row. The renderer's `<img>`
 * binding can fetch via `electronAPI.db.blobs.url(id, ext, mime)`.
 */

import { eq, desc, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { roleplaySessions, roleplayMessages } from "../schema/companions.js";

// ─── Sessions ────────────────────────────────────────────────────────

export function upsertSession(record) {
  const { db, orm } = get();
  const id = record.id || uuid();
  const existing = db.prepare("SELECT id FROM roleplay_sessions WHERE id = ?").get(id);
  const row = {
    id,
    companionId: record.companionId,
    scenarioKey: record.scenarioKey ?? null,
    contentLevel: record.contentLevel ?? null,
    modes: record.modes ?? null,
    summary: record.summary ?? null,
    startedAt: record.startedAt || Date.now(),
    lastActiveAt: record.lastActiveAt || Date.now(),
    archived: record.archived ? 1 : 0,
  };
  if (existing) {
    orm.update(roleplaySessions).set(row).where(eq(roleplaySessions.id, id)).run();
  } else {
    orm.insert(roleplaySessions).values(row).run();
  }
  return row;
}

export function getSession(id) {
  const { orm } = get();
  return orm.select().from(roleplaySessions).where(eq(roleplaySessions.id, id)).get() ?? null;
}

export function listSessions(filter = {}) {
  const { orm, db } = get();
  if (filter.companionId) {
    return orm.select().from(roleplaySessions)
      .where(eq(roleplaySessions.companionId, filter.companionId))
      .orderBy(desc(roleplaySessions.lastActiveAt))
      .all();
  }
  // Raw SQL returns columns as-stored (snake_case). Alias to camelCase
  // so callers (roleplayStore.service.js) read the same shape Drizzle
  // returns in the filtered branch above.
  return db.prepare(
    `SELECT
       id,
       companion_id   AS companionId,
       scenario_key   AS scenarioKey,
       content_level  AS contentLevel,
       modes,
       summary,
       started_at     AS startedAt,
       last_active_at AS lastActiveAt,
       archived
     FROM roleplay_sessions
     WHERE archived = 0
     ORDER BY last_active_at DESC
     LIMIT ?`,
  ).all(filter.limit ?? 50);
}

export function archiveSession(id) {
  const { orm } = get();
  orm.update(roleplaySessions).set({ archived: 1 }).where(eq(roleplaySessions.id, id)).run();
  return true;
}

export function clearSession(id) {
  const { db } = get();
  db.prepare("DELETE FROM roleplay_messages WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM roleplay_sessions WHERE id = ?").run(id);
  return true;
}

/**
 * Repair `content_level` + `modes` from each row's session id. The id
 * is `${companionId}__${scenarioId}__${contentLevel}__${responseMode}`
 * and is immutable; saved values can drift if a load path defaulted
 * "adult" → "pg13" and persisted that back.
 *
 * Returns counts so the caller can confirm the fix landed.
 */
export function repairContentLevelsFromKey() {
  const { db } = get();
  const rows = db.prepare("SELECT id, content_level FROM roleplay_sessions").all();
  let updated = 0;
  let nullFilled = 0;
  let mismatched = 0;
  const tx = db.transaction(() => {
    const updateStmt = db.prepare(
      "UPDATE roleplay_sessions SET content_level = ?, modes = ? WHERE id = ?",
    );
    for (const r of rows) {
      const parts = String(r.id).split("__");
      const keyContentLevel = parts[2] || null;
      if (!keyContentLevel) continue;                        // unparseable id
      const before = r.content_level;
      const drifted = before && before !== keyContentLevel;
      const missing = !before;
      if (!drifted && !missing) continue;
      const modesStr = parts[3] ? JSON.stringify(parts[3].split("+").filter(Boolean)) : null;
      updateStmt.run(keyContentLevel, modesStr, r.id);
      updated++;
      if (drifted) mismatched++;
      if (missing) nullFilled++;
    }
  });
  tx();
  return { scanned: rows.length, updated, mismatched, nullFilled };
}

/**
 * Wipe every roleplay session + message. Used by the recovery flow
 * before re-importing from a known-good electron-store backup. Blob
 * orphans from the deleted message rows can be swept later via
 * `blobs.sweepOrphans()`.
 */
export function wipeAll() {
  const { db } = get();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM roleplay_messages").run();
    db.prepare("DELETE FROM roleplay_sessions").run();
  });
  tx();
  return { ok: true };
}

export function bulkInsertSessions(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO roleplay_sessions (
      id, companion_id, scenario_key, content_level, modes, summary,
      started_at, last_active_at, archived
    ) VALUES (
      @id, @companionId, @scenarioKey, @contentLevel, @modes, @summary,
      @startedAt, @lastActiveAt, @archived
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      companionId: r.companionId,
      scenarioKey: r.scenarioKey ?? null,
      contentLevel: r.contentLevel ?? null,
      modes: r.modes ? JSON.stringify(r.modes) : null,
      summary: r.summary ?? null,
      startedAt: r.startedAt || Date.now(),
      lastActiveAt: r.lastActiveAt || Date.now(),
      archived: r.archived ? 1 : 0,
    });
  });
  tx(rows);
  return rows.length;
}

// ─── Messages ────────────────────────────────────────────────────────

export function appendMessage(sessionId, msg) {
  const { db, orm } = get();
  const id = msg.id || uuid();
  const row = {
    id,
    sessionId,
    role: msg.role,
    text: msg.text ?? null,
    audioBlobId: msg.audioBlobId ?? null,
    audioExt: msg.audioExt ?? null,
    imageBlobId: msg.imageBlobId ?? null,
    imageExt: msg.imageExt ?? null,
    videoBlobId: msg.videoBlobId ?? null,
    videoExt: msg.videoExt ?? null,
    generationId: msg.generationId ?? null,
    meta: msg.meta ?? null,
    createdAt: msg.createdAt || Date.now(),
  };
  const tx = db.transaction(() => {
    orm.insert(roleplayMessages).values(row).run();
    orm.update(roleplaySessions)
      .set({ lastActiveAt: row.createdAt })
      .where(eq(roleplaySessions.id, sessionId)).run();
  });
  tx();
  return row;
}

/**
 * Hot path. Indexed by (session_id, created_at).
 *
 * Always pulls the NEWEST `limit` rows. With LIMIT we must select the
 * tail of the conversation, not the head — chat needs recent context,
 * not the first messages from years ago. For sessions ≤ limit this is
 * the entire conversation; for sessions > limit we trim from the
 * oldest end (acceptable: scrollback loss is preferable to losing
 * what just happened).
 *
 * Secondary sort by id keeps ordering deterministic when two messages
 * share a created_at (common in imports — `startedAt + i` resolution
 * is millisecond-coarse and i is the only differentiator).
 *
 * Aliases snake_case storage columns to camelCase so callers don't
 * have to know the SQL layout (otherwise `m.image_blob_id` /
 * `m.created_at` come back undefined-shaped to the renderer).
 */
export function listMessages(sessionId, opts = {}) {
  const { db } = get();
  const limit = opts.limit ?? 100;
  const sql = `SELECT
       id,
       session_id     AS sessionId,
       role,
       text,
       audio_blob_id  AS audioBlobId,
       audio_ext      AS audioExt,
       image_blob_id  AS imageBlobId,
       image_ext      AS imageExt,
       video_blob_id  AS videoBlobId,
       video_ext      AS videoExt,
       generation_id  AS generationId,
       meta,
       created_at     AS createdAt
     FROM roleplay_messages
     WHERE session_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`;
  const rows = db.prepare(sql).all(sessionId, limit);
  return opts.oldestFirst ? rows.reverse() : rows;
}

export function deleteMessage(messageId) {
  const { orm } = get();
  orm.delete(roleplayMessages).where(eq(roleplayMessages.id, messageId)).run();
}

export function bulkInsertMessages(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO roleplay_messages (
      id, session_id, role, text, audio_blob_id, audio_ext,
      image_blob_id, image_ext, video_blob_id, video_ext,
      generation_id, meta, created_at
    ) VALUES (
      @id, @sessionId, @role, @text, @audioBlobId, @audioExt,
      @imageBlobId, @imageExt, @videoBlobId, @videoExt,
      @generationId, @meta, @createdAt
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      sessionId: r.sessionId,
      role: r.role,
      text: r.text ?? null,
      audioBlobId: r.audioBlobId ?? null,
      audioExt: r.audioExt ?? null,
      imageBlobId: r.imageBlobId ?? null,
      imageExt: r.imageExt ?? null,
      videoBlobId: r.videoBlobId ?? null,
      videoExt: r.videoExt ?? null,
      generationId: r.generationId ?? null,
      meta: r.meta ? JSON.stringify(r.meta) : null,
      createdAt: r.createdAt || Date.now(),
    });
  });
  tx(rows);
  return rows.length;
}

/**
 * Runtime save path. UPSERT semantics — later writes for the same
 * message id overwrite earlier ones. Required because the renderer
 * saves a message multiple times per turn (once when the text lands,
 * again when image generation finishes, again when video lands, etc.).
 * `bulkInsertMessages` uses INSERT OR IGNORE for the importer's
 * idempotency story; this one is for live edits.
 *
 * createdAt is preserved on update (COALESCE with existing) so
 * re-saves can't change a message's chronological position. Only the
 * mutable fields (text + media + meta) get overwritten.
 */
export function upsertMessages(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT INTO roleplay_messages (
      id, session_id, role, text, audio_blob_id, audio_ext,
      image_blob_id, image_ext, video_blob_id, video_ext,
      generation_id, meta, created_at
    ) VALUES (
      @id, @sessionId, @role, @text, @audioBlobId, @audioExt,
      @imageBlobId, @imageExt, @videoBlobId, @videoExt,
      @generationId, @meta, @createdAt
    )
    ON CONFLICT(id) DO UPDATE SET
      role          = excluded.role,
      text          = excluded.text,
      audio_blob_id = excluded.audio_blob_id,
      audio_ext     = excluded.audio_ext,
      image_blob_id = excluded.image_blob_id,
      image_ext     = excluded.image_ext,
      video_blob_id = excluded.video_blob_id,
      video_ext     = excluded.video_ext,
      generation_id = excluded.generation_id,
      meta          = excluded.meta
  `);

  // Per-row try/catch inside the transaction. The previous all-or-
  // nothing version meant one bad row (bad meta, missing required
  // field, transient SQLite hiccup) tanked an entire save — invisible
  // to the user but resulted in lost messages. Now bad rows surface
  // with their id so we can debug, and the rest of the batch lands.
  let succeeded = 0;
  const failures = [];
  const tx = db.transaction((items) => {
    for (const r of items) {
      try {
        if (!r.id) {
          // Caller responsibility — the renderer assigns ids on push
          // (see _msgId in RoleplayChat.vue / skillStore.js). A missing
          // id here is a logic bug worth surfacing rather than papering
          // over with a fresh uuid that loses on the next save.
          failures.push({ id: null, sessionId: r.sessionId, error: "missing id" });
          continue;
        }
        if (!r.sessionId) {
          failures.push({ id: r.id, sessionId: null, error: "missing sessionId" });
          continue;
        }
        if (!r.role) {
          failures.push({ id: r.id, sessionId: r.sessionId, error: "missing role" });
          continue;
        }
        stmt.run({
          id: r.id,
          sessionId: r.sessionId,
          role: r.role,
          text: r.text ?? null,
          audioBlobId: r.audioBlobId ?? null,
          audioExt: r.audioExt ?? null,
          imageBlobId: r.imageBlobId ?? null,
          imageExt: r.imageExt ?? null,
          videoBlobId: r.videoBlobId ?? null,
          videoExt: r.videoExt ?? null,
          generationId: r.generationId ?? null,
          meta: r.meta ? JSON.stringify(r.meta) : null,
          createdAt: r.createdAt || Date.now(),
        });
        succeeded++;
      } catch (err) {
        failures.push({ id: r.id, sessionId: r.sessionId, error: err?.message || String(err) });
      }
    }
  });
  tx(rows);
  if (failures.length) {
    console.warn(
      `[roleplay.upsertMessages] ${failures.length}/${rows.length} rows failed:`,
      failures.slice(0, 5),
    );
  }
  return succeeded;
}

export function messageCount(sessionId) {
  const { db } = get();
  const r = db.prepare("SELECT COUNT(*) AS n FROM roleplay_messages WHERE session_id = ?").get(sessionId);
  return r?.n ?? 0;
}
