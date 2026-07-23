/**
 * Embeddings — sqlite-vec virtual table.
 *
 * vec0 isn't modeled by Drizzle (it's a SQLite extension's virtual
 * table). The table is created in the migration; this file is a thin
 * descriptor used by the repo + IPC layer to know what columns exist
 * and what dimension the model produces.
 *
 * Source attribution: every embeddable row in another table (goals,
 * issues, audit_entries, roleplay_messages, companion_memory,
 * generations, moltbook_posts, skill_runs) gets a row here keyed by
 * (source_table, source_id). The embedding is regenerated when the
 * underlying row changes; orphaned embeddings are swept on table
 * deletes.
 *
 * EMBED_DIM = 768 matches nomic-embed-text-v1.5 (the recommended
 * local embedder). Changing this requires a full re-embed cycle.
 */

export const EMBED_DIM = 768;

/**
 * Source tables that can be embedded. Indexed by (source_table,
 * source_id) so re-embedding a single row is a fast unique lookup.
 */
export const EMBEDDABLE_SOURCES = [
  "goals",
  "issues",
  "audit_entries",
  "roleplay_messages",
  "companion_memory",
  "memory_notes",
  "generations",
  "moltbook_posts",         // Phase 7
  "skill_runs",             // Phase 6
];
