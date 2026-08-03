/**
 * Issues repo + their attempts. Mirrors `services/company/issues.js`.
 *
 * The dispatcher's hot path is `nextForRole` (priority-sorted, FIFO
 * within bucket) — implemented as an indexed query on
 * (company_id, status, priority, created_at).
 */

import { eq, and, desc, asc, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { issues, issueAttempts } from "../schema/companies.js";

const PRIORITY_ORDER = `CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;
const PRIORITIES = ["low", "normal", "high", "urgent"];
const STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"];

export function create(companyId, input) {
  const { orm } = get();
  if (!input?.title?.trim()) throw new Error("title required");
  if (!input?.assigneeRole?.trim()) throw new Error("assigneeRole required");
  const now = Date.now();
  const row = {
    id: uuid(),
    companyId,
    goalId: input.goalId ?? null,
    parentIssueId: input.parentIssueId ?? null,
    title: input.title.trim(),
    description: (input.description || "").trim(),
    status: "open",
    priority: PRIORITIES.includes(input.priority) ? input.priority : "normal",
    assigneeRole: input.assigneeRole,
    assigneeCompanion: input.assigneeCompanion ?? null,
    labels: Array.isArray(input.labels) ? input.labels : [],
    createdBy: input.createdBy || "user",
    createdAt: now,
    updatedAt: now,
  };
  orm.insert(issues).values(row).run();
  return row;
}

export function list(companyId, filter = {}) {
  const { db, orm } = get();
  const where = [eq(issues.companyId, companyId)];
  if (filter.status) where.push(eq(issues.status, filter.status));
  if (filter.assigneeRole) where.push(eq(issues.assigneeRole, filter.assigneeRole));
  if (filter.priority) where.push(eq(issues.priority, filter.priority));
  if (filter.goalId !== undefined) where.push(filter.goalId === null
    ? sql`${issues.goalId} IS NULL` : eq(issues.goalId, filter.goalId));
  const rows = orm.select().from(issues).where(and(...where)).orderBy(desc(issues.createdAt)).all();
  if (!rows.length) return rows;
  const attempts = db.prepare(`
    SELECT a.id, a.issue_id AS issueId, a.role, a.companion, a.status,
           a.started_at AS startedAt, a.finished_at AS finishedAt,
           a.tx_or_link AS txOrLink, a.error, a.result
    FROM issue_attempts a
    JOIN issues i ON i.id = a.issue_id
    WHERE i.company_id = ?
    ORDER BY a.started_at ASC
  `).all(companyId).map((attempt) => ({
    ...attempt,
    result: _parseJSON(attempt.result),
  }));
  const byIssue = new Map();
  for (const attempt of attempts) {
    if (!byIssue.has(attempt.issueId)) byIssue.set(attempt.issueId, []);
    byIssue.get(attempt.issueId).push(attempt);
  }
  return rows.map((row) => ({ ...row, attempts: byIssue.get(row.id) || [] }));
}

export function getById(companyId, issueId) {
  const { orm } = get();
  return orm.select().from(issues)
    .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).get() ?? null;
}

export function update(companyId, issueId, patch) {
  const cur = getById(companyId, issueId);
  if (!cur) throw new Error(`issue ${issueId} not found`);
  if (patch.status && patch.status !== cur.status) {
    if (!STATUSES.includes(patch.status)) throw new Error(`invalid status: ${patch.status}`);
    if (cur.status === "done" || cur.status === "cancelled") {
      throw new Error(`cannot transition from terminal status ${cur.status}; reopen first`);
    }
  }
  if (patch.priority && !PRIORITIES.includes(patch.priority)) {
    throw new Error(`invalid priority: ${patch.priority}`);
  }
  const { orm } = get();
  const data = { ...patch, updatedAt: Date.now() };
  delete data.id; delete data.companyId; delete data.createdAt;
  orm.update(issues).set(data)
    .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  return getById(companyId, issueId);
}

export function reopen(companyId, issueId) {
  return update(companyId, issueId, { status: "open" });
}

export function remove(companyId, issueId) {
  const { orm } = get();
  orm.delete(issues).where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  return true;
}

/**
 * Hot path — returns the highest-priority "open" issue for the given
 * role, or null. Single indexed query.
 */
export function nextForRole(companyId, roleKey, currentCompanion) {
  const { db } = get();
  const sql = `
    SELECT * FROM issues
    WHERE company_id = ? AND status = 'open' AND assignee_role = ?
      AND (assignee_companion IS NULL OR assignee_companion = ?)
    ORDER BY ${PRIORITY_ORDER}, created_at ASC
    LIMIT 1
  `;
  return db.prepare(sql).get(companyId, roleKey, currentCompanion) || null;
}

/**
 * Mark the issue in_progress + append a fresh attempt record.
 * Returns the updated issue.
 */
export function startAttempt(companyId, issueId, role, companion) {
  const { db, orm } = get();
  const cur = getById(companyId, issueId);
  if (!cur) throw new Error(`issue ${issueId} not found`);
  if (cur.status === "done" || cur.status === "cancelled") return cur;
  const now = Date.now();
  const attempt = {
    id: uuid(),
    issueId,
    role: role ?? null,
    companion: companion ?? null,
    status: "running",
    startedAt: now,
    finishedAt: null,
    txOrLink: null,
    error: null,
    result: null,
  };
  const tx = db.transaction(() => {
    orm.insert(issueAttempts).values(attempt).run();
    orm.update(issues).set({ status: "in_progress", updatedAt: now })
      .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  });
  tx();
  return { ...cur, status: "in_progress", updatedAt: now };
}

export function finishAttempt(companyId, issueId, outcome) {
  const { db, orm } = get();
  const cur = getById(companyId, issueId);
  if (!cur) return null;
  if (cur.status !== "in_progress") return cur;

  // Find the most recent running attempt
  const att = db.prepare(
    "SELECT * FROM issue_attempts WHERE issue_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1",
  ).get(issueId);

  let nextStatus = "done";
  if (outcome.status === "error") nextStatus = "blocked";
  if (outcome.status === "vetoed") nextStatus = "blocked";
  if (outcome.status === "queued") nextStatus = "open";

  const now = Date.now();
  const tx = db.transaction(() => {
    if (att) {
      orm.update(issueAttempts).set({
        status: outcome.status || "done",
        finishedAt: now,
        txOrLink: outcome.txOrLink ?? null,
        error: outcome.error ?? null,
        result: outcome.result ?? null,
      }).where(eq(issueAttempts.id, att.id)).run();
    }
    orm.update(issues).set({ status: nextStatus, updatedAt: now })
      .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  });
  tx();
  return { ...cur, status: nextStatus, updatedAt: now };
}

export function attempts(issueId) {
  const { orm } = get();
  return orm.select().from(issueAttempts)
    .where(eq(issueAttempts.issueId, issueId))
    .orderBy(asc(issueAttempts.startedAt)).all();
}

export function counts(companyId) {
  const { db } = get();
  const rows = db.prepare(
    "SELECT status, COUNT(*) AS n FROM issues WHERE company_id = ? GROUP BY status",
  ).all(companyId);
  const out = { total: 0, open: 0, in_progress: 0, blocked: 0, done: 0, cancelled: 0 };
  for (const r of rows) { out.total += r.n; if (out[r.status] !== undefined) out[r.status] = r.n; }
  return out;
}

export function clear(companyId) {
  const { db } = get();
  // Cascade: drop attempts for the company's issues first
  db.prepare(`
    DELETE FROM issue_attempts WHERE issue_id IN (
      SELECT id FROM issues WHERE company_id = ?
    )
  `).run(companyId);
  db.prepare("DELETE FROM issues WHERE company_id = ?").run(companyId);
}

export function bulkInsert(items) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO issues (
      id, company_id, goal_id, parent_issue_id, title, description,
      status, priority, assignee_role, assignee_companion, labels,
      created_by, created_at, updated_at
    ) VALUES (
      @id, @companyId, @goalId, @parentIssueId, @title, @description,
      @status, @priority, @assigneeRole, @assigneeCompanion, @labels,
      @createdBy, @createdAt, @updatedAt
    )
  `);
  const attemptStmt = db.prepare(`
    INSERT OR IGNORE INTO issue_attempts (
      id, issue_id, role, companion, status, started_at, finished_at, tx_or_link, error, result
    ) VALUES (
      @id, @issueId, @role, @companion, @status, @startedAt, @finishedAt, @txOrLink, @error, @result
    )
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      stmt.run({
        id: r.id || uuid(),
        companyId: r.companyId,
        goalId: r.goalId ?? null,
        parentIssueId: r.parentIssueId ?? null,
        title: r.title,
        description: r.description ?? null,
        status: r.status || "open",
        priority: r.priority || "normal",
        assigneeRole: r.assigneeRole ?? null,
        assigneeCompanion: r.assigneeCompanion ?? null,
        labels: r.labels ? JSON.stringify(r.labels) : null,
        createdBy: r.createdBy ?? null,
        createdAt: r.createdAt || Date.now(),
        updatedAt: r.updatedAt || Date.now(),
      });
      if (Array.isArray(r.attempts)) {
        for (const a of r.attempts) {
          attemptStmt.run({
            id: a.id || uuid(),
            issueId: r.id,
            role: a.role ?? null,
            companion: a.companion ?? null,
            status: a.status ?? null,
            startedAt: a.startedAt || Date.now(),
            finishedAt: a.finishedAt ?? null,
            txOrLink: a.txOrLink ?? null,
            error: a.error ?? null,
            result: a.result ? JSON.stringify(a.result) : null,
          });
        }
      }
    }
  });
  tx(items);
  return items.length;
}

function _parseJSON(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}
