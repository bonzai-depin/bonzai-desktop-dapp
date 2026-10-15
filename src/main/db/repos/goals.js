/**
 * Goals repo. Mirrors the renderer-side `services/company/goals.js`
 * API so the adapter is a 1:1 IPC swap.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import * as issuesRepo from "./issues.js";
import { goals } from "../schema/companies.js";

export function create(companyId, input) {
  const { orm } = get();
  if (!input?.title?.trim()) throw new Error("title required");
  const now = Date.now();
  const row = {
    id: uuid(),
    companyId,
    title: input.title.trim(),
    rationale: input.rationale ?? null,
    missionAlignment: input.missionAlignment ?? input.rationale ?? null,
    deadline: input.deadline ?? null,
    status: "active",
    createdBy: input.createdBy || "user",
    createdByRole: input.createdByRole ?? null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  orm.insert(goals).values(row).run();
  return row;
}

export function createWithTasks(companyId, input, tasks) {
  if (!Array.isArray(tasks) || !tasks.length) throw new Error('A goal needs at least one task.');
  return get().db.transaction(() => {
    const goal = create(companyId, input);
    const createdIssues = tasks.map(task => issuesRepo.create(companyId, { ...task, goalId: goal.id }));
    return { ...goal, createdIssues };
  })();
}

export function list(companyId, filter = {}) {
  const { orm } = get();
  const where = [eq(goals.companyId, companyId)];
  if (filter.status) where.push(eq(goals.status, filter.status));
  if (filter.createdBy) where.push(eq(goals.createdBy, filter.createdBy));
  return orm.select().from(goals).where(and(...where)).orderBy(desc(goals.createdAt)).all();
}

export function getById(companyId, goalId) {
  const { orm } = get();
  return orm.select().from(goals)
    .where(and(eq(goals.companyId, companyId), eq(goals.id, goalId)))
    .get() ?? null;
}

export function update(companyId, goalId, patch) {
  const { orm } = get();
  const data = { ...patch, updatedAt: Date.now() };
  delete data.id; delete data.companyId; delete data.createdAt;
  orm.update(goals).set(data)
    .where(and(eq(goals.companyId, companyId), eq(goals.id, goalId))).run();
  return getById(companyId, goalId);
}

export function cancel(companyId, goalId, reason) {
  return update(companyId, goalId, {
    status: "cancelled",
    cancelReason: reason ?? null,
    completedAt: Date.now(),
  });
}

export function complete(companyId, goalId) {
  return update(companyId, goalId, { status: "completed", completedAt: Date.now() });
}

/** Auto-complete a goal when all child issues are terminal. */
export function maybeComplete(companyId, goalId, allIssuesForGoal) {
  if (!goalId || getById(companyId, goalId)?.status !== 'active') return null;
  const { db } = get();
  const children = db.prepare('SELECT status FROM issues WHERE company_id = ? AND goal_id = ?').all(companyId, goalId);
  if (!children.length || children.some(issue => issue.status !== 'done')) return null;
  return complete(companyId, goalId);
}

export function counts(companyId) {
  const { db } = get();
  const rows = db.prepare(
    "SELECT status, COUNT(*) AS n FROM goals WHERE company_id = ? GROUP BY status",
  ).all(companyId);
  const out = { total: 0, active: 0, completed: 0, cancelled: 0 };
  for (const r of rows) { out.total += r.n; if (out[r.status] !== undefined) out[r.status] = r.n; }
  return out;
}

export function clear(companyId) {
  const { orm } = get();
  orm.delete(goals).where(eq(goals.companyId, companyId)).run();
}

export function bulkInsert(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO goals (
      id, company_id, title, rationale, mission_alignment, deadline,
      status, created_by, created_by_role, cancel_reason,
      created_at, updated_at, completed_at
    ) VALUES (
      @id, @companyId, @title, @rationale, @missionAlignment, @deadline,
      @status, @createdBy, @createdByRole, @cancelReason,
      @createdAt, @updatedAt, @completedAt
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      companyId: r.companyId,
      title: r.title,
      rationale: r.rationale ?? null,
      missionAlignment: r.missionAlignment ?? null,
      deadline: r.deadline ?? null,
      status: r.status || "active",
      createdBy: r.createdBy || "user",
      createdByRole: r.createdByRole ?? null,
      cancelReason: r.cancelReason ?? null,
      createdAt: r.createdAt || Date.now(),
      updatedAt: r.updatedAt || Date.now(),
      completedAt: r.completedAt ?? null,
    });
  });
  tx(rows);
  return rows.length;
}
