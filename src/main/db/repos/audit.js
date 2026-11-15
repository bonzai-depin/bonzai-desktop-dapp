/**
 * Audit-log repo. API mirrors the legacy `auditLog.js` so the renderer-
 * side adapter is a 1:1 IPC pass-through. Drizzle queries use prepared
 * statements under the hood; better-sqlite3 caches them per session.
 *
 * The trail is append-only and tamper-evident. append() is the only
 * writer for live entries: it assigns id, ts and the per-company seq in
 * the main process and chains each entry to the previous one with
 *   hash = sha256(prev_hash + canonical JSON of the persisted fields).
 * verify() recomputes the chain, so a row edited, removed or inserted
 * behind the app's back is reported. Nothing here deletes entries; they
 * leave only with their team (companies.dissolve).
 *
 * recent(n) returns newest first.
 * summarize(windowMs) is a single indexed GROUP BY, replacing the legacy
 *   O(n) array scan.
 *
 * The pub/sub from the legacy module (onChange / _notify) lives at the
 * IPC layer instead — main.js fires a "db:audit:changed" event that
 * the renderer subscribes to. The repo itself is sync + side-effect-free.
 */

import { createHash } from "node:crypto";
import { v4 as uuid } from "uuid";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { get } from "../connection.js";
import { auditEntries } from "../schema/audit.js";

/** Persisted columns covered by an entry's hash, in canonical order. */
export const CHAIN_FIELDS = Object.freeze([
  "id", "company_id", "seq", "ts", "kind", "role", "action", "status", "note",
  "tx_or_link", "llm", "direction", "amount", "currency", "pending_id",
  "goal_id", "issue_id", "connector_id", "content_id", "extra",
]);

/** Hash of one stored row (raw column values) chained to its predecessor. */
function _digest(prevHash, raw) {
  const canonical = JSON.stringify(CHAIN_FIELDS.map((field) => [field, raw[field] ?? null]));
  return createHash("sha256").update((prevHash || "") + canonical).digest("hex");
}

function _head(db, companyId) {
  return db
    .prepare("SELECT seq, hash FROM audit_entries WHERE company_id = ? AND seq IS NOT NULL ORDER BY seq DESC LIMIT 1")
    .get(companyId) || null;
}

/**
 * Chain every entry of the company that has no hash yet, in (ts, rowid)
 * order, continuing from the current head. Trusted main-process callers
 * only: history written before the chain existed, the first-boot store
 * migration, and a restored backup. Returns the number of rows sealed.
 */
export function seal(companyId) {
  const { db } = get();
  return db.transaction(() => {
    const rows = db
      .prepare("SELECT rowid AS _rowid, * FROM audit_entries WHERE company_id = ? AND hash IS NULL ORDER BY ts, rowid")
      .all(companyId);
    if (!rows.length) return 0;
    const head = _head(db, companyId);
    let seq = head?.seq || 0;
    let prev = head?.hash || null;
    const update = db.prepare("UPDATE audit_entries SET seq = ?, prev_hash = ?, hash = ? WHERE rowid = ?");
    for (const row of rows) {
      seq += 1;
      const hash = _digest(prev, { ...row, seq });
      update.run(seq, prev, hash, row._rowid);
      prev = hash;
    }
    return rows.length;
  })();
}

/**
 * History that predates the chain is sealed the first time it is touched.
 * Once a chain exists, an unchained row can only have been written outside
 * append(), so it is left for verify() to report instead of being adopted.
 */
function _sealLegacy(db, companyId) {
  if (_head(db, companyId)) return;
  if (db.prepare("SELECT 1 FROM audit_entries WHERE company_id = ? AND hash IS NULL LIMIT 1").get(companyId)) seal(companyId);
}

/**
 * Append an audit entry. id, ts, seq and the hash chain are always
 * assigned here; values supplied by the caller for them are ignored so
 * an entry cannot be backdated or made to replace another.
 *
 * Returns the persisted row.
 */
export function append(companyId, entry) {
  const { db, orm } = get();
  return db.transaction(() => {
    _sealLegacy(db, companyId);
    const head = _head(db, companyId);
    const amount = entry.amount != null ? Number(entry.amount) : null;
    const row = {
      id: uuid(),
      companyId,
      ts: Date.now(),
      kind: entry.kind,
      role: entry.role ?? null,
      action: entry.action ?? null,
      status: entry.status ?? null,
      note: entry.note ?? null,
      txOrLink: entry.txOrLink ?? null,
      llm: entry.llm ?? null,
      direction: entry.direction ?? null,
      amount: Number.isFinite(amount) ? amount : null,
      currency: entry.currency ?? null,
      pendingId: entry.pendingId ?? null,
      goalId: entry.goalId ?? null,
      issueId: entry.issueId ?? null,
      connectorId: entry.connectorId ?? null,
      contentId: entry.contentId ?? null,
      extra: _captureExtras(entry),
      seq: (head?.seq || 0) + 1,
      prevHash: head?.hash || null,
    };
    orm.insert(auditEntries).values(row).run();
    // Hash what SQLite actually stored, the same bytes verify() will read.
    const stored = db.prepare("SELECT * FROM audit_entries WHERE id = ?").get(row.id);
    row.hash = _digest(row.prevHash, stored);
    db.prepare("UPDATE audit_entries SET hash = ? WHERE id = ?").run(row.hash, row.id);
    return row;
  })();
}

/**
 * Recompute the company's chain. `firstBrokenSeq` is the first position
 * whose entry is missing or no longer matches its hash; `unsealed` counts
 * rows that were written outside append() after the chain started.
 */
export function verify(companyId) {
  const { db } = get();
  return db.transaction(() => {
    _sealLegacy(db, companyId);
    const rows = db.prepare("SELECT * FROM audit_entries WHERE company_id = ? AND seq IS NOT NULL ORDER BY seq").all(companyId);
    const unsealed = db.prepare("SELECT COUNT(*) AS n FROM audit_entries WHERE company_id = ? AND seq IS NULL").get(companyId).n;
    let firstBrokenSeq = null;
    let prev = null;
    let expected = 1;
    for (const row of rows) {
      if (row.seq !== expected) { firstBrokenSeq = expected; break; }
      if ((row.prev_hash || null) !== prev || row.hash !== _digest(prev, row)) { firstBrokenSeq = row.seq; break; }
      prev = row.hash;
      expected += 1;
    }
    const last = rows[rows.length - 1];
    return {
      ok: firstBrokenSeq === null && unsealed === 0,
      entries: rows.length + unsealed,
      firstBrokenSeq,
      unsealed,
      head: last ? { seq: last.seq, hash: last.hash } : null,
    };
  })();
}

/**
 * Full trail for an auditor, oldest first, with the verification result
 * computed from the same snapshot. Entries are the stored column values
 * so the chain can be recomputed outside BonzAI from `chain`.
 */
export function exportTrail(companyId) {
  const { db } = get();
  return db.transaction(() => {
    const verification = verify(companyId);
    const entries = db
      .prepare("SELECT * FROM audit_entries WHERE company_id = ? ORDER BY seq IS NULL, seq, ts, rowid")
      .all(companyId);
    return {
      companyId,
      exportedAt: Date.now(),
      verification,
      chain: {
        algorithm: "sha256",
        fields: CHAIN_FIELDS,
        rule: "hash = sha256(prev_hash + JSON.stringify(fields.map(f => [f, entry[f]]))); prev_hash is empty for seq 1",
      },
      entries,
    };
  })();
}

/**
 * Read the last N entries (newest first). Default 200 — matches the
 * legacy auditLog API.
 */
export function recent(companyId, n = 200) {
  const { orm } = get();
  return orm
    .select()
    .from(auditEntries)
    .where(eq(auditEntries.companyId, companyId))
    .orderBy(desc(auditEntries.ts), desc(auditEntries.seq))
    .limit(n)
    .all();
}

/** Read all entries (newest first). Pagination is the caller's job. */
export function all(companyId) {
  const { orm } = get();
  return orm
    .select()
    .from(auditEntries)
    .where(eq(auditEntries.companyId, companyId))
    .orderBy(desc(auditEntries.ts), desc(auditEntries.seq))
    .all();
}

/**
 * Filter via SQL predicate. Replaces the legacy callback-predicate API
 * with a SQL-level filter for hot paths. Keeps a callback fallback for
 * compatibility — but at IPC boundary callbacks aren't passable, so the
 * adapter limits itself to typed filters.
 */
export function filter(companyId, opts = {}) {
  const { orm } = get();
  const where = [eq(auditEntries.companyId, companyId)];
  if (opts.kind) where.push(eq(auditEntries.kind, opts.kind));
  if (opts.role) where.push(eq(auditEntries.role, opts.role));
  if (opts.status) where.push(eq(auditEntries.status, opts.status));
  if (opts.action) where.push(eq(auditEntries.action, opts.action));
  if (opts.goalId) where.push(eq(auditEntries.goalId, opts.goalId));
  if (opts.issueId) where.push(eq(auditEntries.issueId, opts.issueId));
  if (opts.sinceMs) where.push(gte(auditEntries.ts, opts.sinceMs));
  return orm
    .select()
    .from(auditEntries)
    .where(and(...where))
    .orderBy(desc(auditEntries.ts), desc(auditEntries.seq))
    .all();
}

/**
 * 24h KPI aggregation. Single indexed GROUP BY; was an O(n) array scan
 * in the legacy module.
 */
export function summarize(companyId, windowMs = 24 * 60 * 60 * 1000) {
  const { db } = get();
  const since = Date.now() - windowMs;
  const stmt = db.prepare(`
    SELECT
      status,
      kind,
      direction,
      COUNT(*)        AS count,
      SUM(amount)     AS amount_sum
    FROM audit_entries
    WHERE company_id = ? AND ts >= ?
    GROUP BY status, kind, direction
  `);
  const rows = stmt.all(companyId, since);
  const out = {
    total: 0,
    executed: 0,
    vetoed: 0,
    queued: 0,
    proposed: 0,
    error: 0,
    spend: 0,
    revenue: 0,
  };
  for (const r of rows) {
    out.total += r.count;
    if (r.status && Object.prototype.hasOwnProperty.call(out, r.status)) {
      out[r.status] += r.count;
    }
    if (r.kind === "treasury" && r.direction === "out") out.spend += (Number(r.amount_sum) || 0);
    if (r.kind === "treasury" && r.direction === "in") out.revenue += (Number(r.amount_sum) || 0);
  }
  return out;
}

/** First-boot store migration only (import-from-store.js); never exposed
 *  over IPC. Keeps the legacy id + ts, then chains the imported history. */
export function bulkInsert(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT INTO audit_entries (
      id, company_id, ts, kind, role, action, status, note, tx_or_link,
      llm, direction, amount, currency, pending_id, goal_id, issue_id,
      connector_id, content_id, extra
    ) VALUES (
      @id, @companyId, @ts, @kind, @role, @action, @status, @note, @txOrLink,
      @llm, @direction, @amount, @currency, @pendingId, @goalId, @issueId,
      @connectorId, @contentId, @extra
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) {
      stmt.run({
        id: r.id || uuid(),
        companyId: r.companyId,
        ts: r.ts || Date.now(),
        kind: r.kind,
        role: r.role ?? null,
        action: r.action ?? null,
        status: r.status ?? null,
        note: r.note ?? null,
        txOrLink: r.txOrLink ?? null,
        llm: r.llm ? JSON.stringify(r.llm) : null,
        direction: r.direction ?? null,
        amount: r.amount != null ? Number(r.amount) : null,
        currency: r.currency ?? null,
        pendingId: r.pendingId ?? null,
        goalId: r.goalId ?? null,
        issueId: r.issueId ?? null,
        connectorId: r.connectorId ?? null,
        contentId: r.contentId ?? null,
        extra: r.extra ? JSON.stringify(r.extra) : null,
      });
    }
  });
  tx(rows);
  for (const companyId of new Set(rows.map((r) => r.companyId))) seal(companyId);
  return rows.length;
}

/**
 * Stash any unrecognized/legacy fields into the `extra` column instead
 * of dropping them. Future-compat: if a renderer adds a new field we
 * haven't yet promoted to a typed column, it survives the round-trip.
 */
function _captureExtras(entry) {
  const known = new Set([
    "id", "ts", "kind", "role", "action", "status", "note", "txOrLink",
    "llm", "direction", "amount", "currency", "pendingId", "goalId",
    "issueId", "connectorId", "contentId",
    // Chain fields belong to the main process, never to the caller.
    "companyId", "seq", "prevHash", "hash",
  ]);
  let extra = null;
  for (const k of Object.keys(entry || {})) {
    if (known.has(k)) continue;
    if (!extra) extra = {};
    extra[k] = entry[k];
  }
  return extra;
}
