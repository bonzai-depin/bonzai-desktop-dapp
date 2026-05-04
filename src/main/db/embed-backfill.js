/**
 * Embedding backfill — walks every embeddable row in every domain
 * table + enqueues into `embedding_queue`. The worker drains them in
 * batches once Phase 5b's adapter is registered.
 *
 * Idempotent — `embeddings.enqueue` upserts on (source_table, source_id),
 * so a repeat run is harmless. Useful manually after schema/dim changes.
 *
 * The text we enqueue is the most semantically-meaningful field per
 * source: goal title + rationale, issue title + description, audit
 * note, roleplay_message text, generation prompt + outputText, etc.
 */

import { get } from "./connection.js";
import * as embeddings from "./repos/embeddings.js";

/**
 * Walk every source table + enqueue. Returns per-source counts.
 */
export function backfillAll() {
  const { db } = get();
  const counts = {};

  // ─── goals — title + rationale ────────────────────────────────────
  counts.goals = _enqueueFromQuery(db, `
    SELECT id AS sourceId,
           COALESCE(title, '') || COALESCE(' — ' || rationale, '') AS sourceText
    FROM goals
  `, "goals");

  // ─── issues — title + description ─────────────────────────────────
  counts.issues = _enqueueFromQuery(db, `
    SELECT id AS sourceId,
           COALESCE(title, '') || COALESCE(' — ' || description, '') AS sourceText
    FROM issues
  `, "issues");

  // ─── audit — note + action (skip empty noise) ─────────────────────
  counts.audit_entries = _enqueueFromQuery(db, `
    SELECT id AS sourceId,
           COALESCE(action, '') || COALESCE(': ' || note, '') AS sourceText
    FROM audit_entries
    WHERE note IS NOT NULL AND length(note) >= 10
  `, "audit_entries");

  // ─── roleplay_messages — message text ─────────────────────────────
  counts.roleplay_messages = _enqueueFromQuery(db, `
    SELECT id AS sourceId, text AS sourceText
    FROM roleplay_messages
    WHERE text IS NOT NULL AND length(text) >= 5
  `, "roleplay_messages");

  // ─── companion_memory — content ───────────────────────────────────
  counts.companion_memory = _enqueueFromQuery(db, `
    SELECT id AS sourceId, content AS sourceText
    FROM companion_memory
    WHERE content IS NOT NULL AND length(content) >= 5
  `, "companion_memory");

  // ─── generations — prompt + output (truncated) ────────────────────
  counts.generations = _enqueueFromQuery(db, `
    SELECT id AS sourceId,
           COALESCE(prompt, '') || COALESCE(' — ' || substr(output_text, 1, 1000), '') AS sourceText
    FROM generations
    WHERE prompt IS NOT NULL OR output_text IS NOT NULL
  `, "generations");

  // ─── skill_runs — actionType + result-summary ─────────────────────
  counts.skill_runs = _enqueueFromQuery(db, `
    SELECT id AS sourceId,
           COALESCE(action_type, '') || COALESCE(': ' || substr(result, 1, 500), '') AS sourceText
    FROM skill_runs
    WHERE action_type IS NOT NULL
  `, "skill_runs");

  // ─── moltbook posts — title + body ────────────────────────────────
  counts.moltbook_posts = _enqueueFromQuery(db, `
    SELECT id AS sourceId,
           COALESCE(title, '') || COALESCE(' — ' || body, '') AS sourceText
    FROM moltbook_posts
    WHERE title IS NOT NULL OR body IS NOT NULL
  `, "moltbook_posts");

  return counts;
}

/**
 * Read rows from a SELECT and bulk-enqueue them. The query must return
 * `sourceId` + `sourceText` columns.
 */
function _enqueueFromQuery(db, sql, sourceTable) {
  const rows = db.prepare(sql).all();
  const items = rows
    .filter((r) => r.sourceText && String(r.sourceText).trim().length > 3)
    .map((r) => ({ sourceTable, sourceId: r.sourceId, sourceText: String(r.sourceText) }));
  if (items.length === 0) return 0;
  embeddings.enqueueMany(items);
  return items.length;
}
