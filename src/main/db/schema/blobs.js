/**
 * Drizzle schema — blobs.
 *
 * Content-addressed off-DB storage. Every image/audio/video/3D scene
 * file lives at <userData>/blobs/<sha256[0:2]>/<sha256>.<ext>; this
 * table holds the metadata + back-pointers (source attribution) used
 * by the dashboard, history views, and orphan-cleanup.
 *
 * The id IS the sha256 — content addressing means identical outputs
 * dedup automatically. Multiple `generations` or `roleplay_messages`
 * rows can reference the same blob without duplicating the file.
 *
 * Why off-DB: SQLite blobs over a few MB hurt VACUUM perf and inflate
 * backups. Files-on-disk + path metadata is the standard pattern for
 * media-heavy local apps.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const blobs = sqliteTable(
  "blobs",
  {
    id: text("id").primaryKey(),                      // sha256 hex
    ext: text("ext").notNull(),                        // png | jpg | webp | mp3 | wav | mp4 | webm | gltf | …
    byteLength: integer("byte_length").notNull(),
    mimeType: text("mime_type"),

    // For images / video — captured opportunistically during write.
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),

    // Source attribution — keeps the audit trail intact when a user
    // asks "where did this image come from?"
    source: text("source"),                            // generation | mint | upload | screenshot | scene_capture
    sourceId: text("source_id"),                       // FK to generations.id, mints.id, etc.

    createdAt: integer("created_at").notNull(),

    // Number of rows referencing this blob. Maintained by repo helpers
    // so the orphan-cleanup pass can drop blobs with refCount = 0
    // without re-scanning every fk source.
    refCount: integer("ref_count").default(0).notNull(),
  },
  (t) => ({
    bySource: index("idx_blobs_source").on(t.source, t.sourceId),
    byExt: index("idx_blobs_ext").on(t.ext),
    byCreated: index("idx_blobs_created").on(t.createdAt),
  }),
);
