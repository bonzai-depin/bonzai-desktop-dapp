/**
 * Goals repo. Mirrors the renderer-side `services/company/goals.js`
 * API so the adapter is a 1:1 IPC swap.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import * as issuesRepo from "./issues.js";
import * as audit from "./audit.js";
import { goals } from "../schema/companies.js";
import { parseDeadline } from "../../../shared/companySchedule.js";

const MIN_EVIDENCE = 10;
const criteriaOf = (value) => String(value ?? "").trim().slice(0, 2000) || null;
/** A goal is overdue only while it can still be acted on. */
const withOverdue = (row, now = Date.now()) => row && ({ ...row, overdue: row.status === "active" && Number(row.deadlineAt) > 0 && row.deadlineAt < now });

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
    deadline: input.deadline != null ? String(input.deadline) : null,
    // The CEO model writes free text such as "+24h"; only a parsed instant is enforceable.
    deadlineAt: parseDeadline(input.deadlineAt ?? input.deadline, now),
    successCriteria: criteriaOf(input.successCriteria),
    outcome: null,
    overdueNotifiedAt: null,
    status: "active",
    createdBy: input.createdBy || "user",
    createdByRole: input.createdByRole ?? null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  orm.insert(goals).values(row).run();
  return withOverdue(row, now);
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
  const now = Date.now();
  return orm.select().from(goals).where(and(...where)).orderBy(desc(goals.createdAt)).all().map(row => withOverdue(row, now));
}

export function getById(companyId, goalId) {
  const { orm } = get();
  return withOverdue(orm.select().from(goals)
    .where(and(eq(goals.companyId, companyId), eq(goals.id, goalId)))
    .get()) ?? null;
}

function write(companyId, goalId, data) {
  const { orm } = get();
  orm.update(goals).set({ ...data, updatedAt: Date.now() })
    .where(and(eq(goals.companyId, companyId), eq(goals.id, goalId))).run();
  return getById(companyId, goalId);
}

export function update(companyId, goalId, patch) {
  const data = { ...patch };
  delete data.id; delete data.companyId; delete data.createdAt; delete data.overdue;
  // Outcome and overdue state change only through recordOutcome / markOverdue.
  delete data.outcome; delete data.overdueNotifiedAt;
  if ("deadline" in data || "deadlineAt" in data) {
    data.deadlineAt = parseDeadline(data.deadlineAt ?? data.deadline);
    if ("deadline" in data) data.deadline = data.deadline != null ? String(data.deadline) : null;
    data.overdueNotifiedAt = null; // a moved deadline is flagged again if it is missed
  }
  if ("successCriteria" in data) data.successCriteria = criteriaOf(data.successCriteria);
  if (data.status === "completed") assertOutcomeMet(getById(companyId, goalId));
  return write(companyId, goalId, data);
}

function assertOutcomeMet(goal) {
  if (goal?.successCriteria && goal.outcome?.status !== "met") throw new Error("Confirm the outcome with evidence before completing this goal.");
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

/**
 * Roll a goal up when all child issues are done. Finished tasks prove the work
 * ran, not that the business result was reached: a goal with success criteria
 * waits for the owner to confirm the outcome with evidence.
 */
export function maybeComplete(companyId, goalId, allIssuesForGoal) {
  const goal = goalId ? getById(companyId, goalId) : null;
  if (goal?.status !== 'active') return null;
  const { db } = get();
  const children = db.prepare('SELECT status FROM issues WHERE company_id = ? AND goal_id = ?').all(companyId, goalId);
  const done = children.filter(issue => issue.status === 'done').length;
  const cancelled = children.filter(issue => issue.status === 'cancelled').length;
  // Work still in flight, or nothing achieved at all, decides nothing.
  if (!done || done + cancelled !== children.length) return null;
  // Cancelled work is not an achieved outcome, but it must not hold the goal
  // open forever either: the owner states whether the result was still reached.
  if (!goal.successCriteria && !cancelled) return complete(companyId, goalId);
  if (goal.outcome?.status === 'pending_review') return goal;
  return db.transaction(() => {
    audit.append(companyId, { kind: 'goal', action: 'goal.outcomeReview', status: 'pending', goalId,
      note: `${cancelled ? `${done} task(s) done, ${cancelled} cancelled` : 'All tasks are done'}. Confirm the outcome${goal.successCriteria ? `: ${goal.successCriteria}` : '.'}`.slice(0, 500) });
    return write(companyId, goalId, { outcome: { status: 'pending_review', requestedAt: Date.now(), ...(cancelled ? { cancelledTasks: cancelled } : {}) } });
  })();
}

/** The owner's decision, with evidence, on whether the success criteria were reached. */
export function recordOutcome(companyId, goalId, input = {}) {
  const evidence = String(input.evidence ?? '').trim();
  if (typeof input.met !== 'boolean') throw new Error('State whether the outcome was met.');
  if (evidence.length < MIN_EVIDENCE) throw new Error(`Describe the evidence in at least ${MIN_EVIDENCE} characters.`);
  return get().db.transaction(() => {
    const goal = getById(companyId, goalId);
    if (!goal) throw new Error('Goal not found.');
    if (goal.status !== 'active' || goal.outcome?.status !== 'pending_review') throw new Error('This goal is not awaiting an outcome review.');
    const now = Date.now();
    const outcome = { status: input.met ? 'met' : 'not_met', evidence: evidence.slice(0, 2000), decidedAt: now };
    audit.append(companyId, { kind: 'goal', action: input.met ? 'goal.outcomeMet' : 'goal.outcomeNotMet', status: 'executed', goalId,
      note: `${goal.title}: ${evidence}`.slice(0, 500) });
    // Not met keeps the goal active so further tasks can be added toward the same result.
    return write(companyId, goalId, input.met ? { outcome, status: 'completed', completedAt: now } : { outcome });
  })();
}

/** Flag each missed deadline once, so the owner is told without repeated noise. */
export function markOverdue(companyId, now = Date.now()) {
  const { db } = get();
  return db.transaction(() => {
    const rows = db.prepare("SELECT id, title, deadline_at FROM goals WHERE company_id = ? AND status = 'active' AND deadline_at IS NOT NULL AND deadline_at < ? AND overdue_notified_at IS NULL").all(companyId, now);
    return rows.map(row => {
      audit.append(companyId, { kind: 'goal', action: 'goal.overdue', status: 'overdue', goalId: row.id,
        note: `Deadline passed on ${new Date(row.deadline_at).toISOString()}: ${row.title}`.slice(0, 500) });
      db.prepare('UPDATE goals SET overdue_notified_at = ? WHERE id = ? AND company_id = ?').run(now, row.id, companyId);
      return getById(companyId, row.id);
    });
  })();
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
