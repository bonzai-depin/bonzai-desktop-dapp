/**
 * Audit-log repo. API mirrors the legacy `auditLog.js` so the renderer-
 * side adapter is a 1:1 IPC pass-through. Drizzle queries use prepared
 * statements under the hood; better-sqlite3 caches them per session.
 *
 * append() returns the persisted row (with id + ts assigned).
 * recent(n) returns newest first.
 * summarize(windowMs) is a single indexed GROUP BY, replacing the legacy
 *   O(n) array scan.
 *
 * The pub/sub from the legacy module (onChange / _notify) lives at the
 * IPC layer instead — main.js fires a "db:audit:changed" event that
 * the renderer subscribes to. The repo itself is sync + side-effect-free.
 */

import { v4 as uuid } from "uuid";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { get } from "../connection.js";
import { auditEntries } from "../schema/audit.js";

/**
 * Append an audit entry. If the caller pre-assigns id + ts (e.g. during
 * the legacy-store migration we want to preserve the original ts), we
 * honor those; otherwise generate fresh.
 *
 * Returns the persisted row.
 */
export function append(companyId, entry) {
  const { orm } = get();
  const row = {
    id: entry.id || uuid(),
    companyId,
    ts: entry.ts || Date.now(),
    kind: entry.kind,
    role: entry.role ?? null,
    action: entry.action ?? null,
    status: entry.status ?? null,
    note: entry.note ?? null,
    txOrLink: entry.txOrLink ?? null,
    llm: entry.llm ?? null,
    direction: entry.direction ?? null,
    amount: entry.amount != null ? Number(entry.amount) : null,
    currency: entry.currency ?? null,
    pendingId: entry.pendingId ?? null,
    goalId: entry.goalId ?? null,
    issueId: entry.issueId ?? null,
    connectorId: entry.connectorId ?? null,
    contentId: entry.contentId ?? null,
    extra: _captureExtras(entry),
  };
  orm.insert(auditEntries).values(row).run();
  return row;
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
    .orderBy(desc(auditEntries.ts))
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
    .orderBy(desc(auditEntries.ts))
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
    .orderBy(desc(auditEntries.ts))
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

/** Wipe a company's audit. */
export function clear(companyId) {
  const { orm } = get();
  orm.delete(auditEntries).where(eq(auditEntries.companyId, companyId)).run();
}

/** Bulk-insert helper used by the first-boot store migration. Wraps in a
 *  single transaction for ~100× throughput vs. per-row inserts. */
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
  ]);
  let extra = null;
  for (const k of Object.keys(entry || {})) {
    if (known.has(k)) continue;
    if (!extra) extra = {};
    extra[k] = entry[k];
  }
  return extra;
}
