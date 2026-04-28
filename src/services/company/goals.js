/**
 * BonzAI Company — Goals (the unit of intent)
 *
 * A goal is the rationale that ties one or more issues to the company's
 * mission. The CEO heartbeat emits goals from the charter; the user can
 * also create goals manually. Every issue belongs to exactly one goal —
 * issues without a goal are not allowed in the unified model.
 *
 * Lifecycle:  active → completed (all child issues done)
 *           or active → cancelled (owner action — cancels open children)
 *
 * Storage: `companies/<id>/goals` (full list).
 */

import { v4 as uuid } from "uuid";
import { append, _notify } from "./auditLog.js";

const KEY = (id) => `companies/${id}/goals`;

export const STATUSES = ["active", "completed", "cancelled"];

const _cache = new Map(); // companyId -> goals[]

async function _hydrate(companyId) {
  if (_cache.has(companyId)) return _cache.get(companyId);
  const raw = await window.electronAPI?.store?.get?.(KEY(companyId), []);
  const goals = Array.isArray(raw) ? raw : [];
  _cache.set(companyId, goals);
  return goals;
}

async function _persist(companyId) {
  const goals = _cache.get(companyId) || [];
  await window.electronAPI?.store?.set?.(KEY(companyId), goals);
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a goal. Caller is responsible for then creating the child
 * issues with `goalId: goal.id`.
 *
 * @param {string} companyId
 * @param {object} input  { title, rationale?, missionAlignment?, deadline?,
 *                          createdBy?, createdByRole? }
 */
export async function create(companyId, input) {
  if (!input?.title?.trim()) throw new Error("title required");

  const now = Date.now();
  const goal = {
    id: uuid(),
    companyId,
    title: input.title.trim(),
    rationale: (input.rationale || "").trim(),
    missionAlignment: (input.missionAlignment || input.rationale || "").trim(),
    deadline: input.deadline || null,
    status: "active",
    createdBy: input.createdBy || "user",        // "ceo" | "user"
    createdByRole: input.createdByRole || null,  // role key when createdBy=ceo
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  const goals = await _hydrate(companyId);
  goals.push(goal);
  await _persist(companyId);

  await append(companyId, {
    kind: "system",
    role: input.createdByRole || (input.createdBy === "ceo" ? "CEO" : null),
    action: "createGoal",
    status: "executed",
    note: goal.title.slice(0, 160),
    goalId: goal.id,
  });
  _notify();
  return goal;
}

/** List all goals (newest first by default). */
export async function list(companyId, filter = {}) {
  const goals = await _hydrate(companyId);
  let out = [...goals];
  if (filter.status) out = out.filter((g) => g.status === filter.status);
  if (filter.createdBy) out = out.filter((g) => g.createdBy === filter.createdBy);
  return out.reverse();
}

export async function get(companyId, goalId) {
  const goals = await _hydrate(companyId);
  return goals.find((g) => g.id === goalId) || null;
}

/** Update editable fields. */
export async function update(companyId, goalId, patch) {
  const goals = await _hydrate(companyId);
  const idx = goals.findIndex((g) => g.id === goalId);
  if (idx < 0) throw new Error(`goal ${goalId} not found`);
  goals[idx] = { ...goals[idx], ...patch, id: goals[idx].id, companyId, updatedAt: Date.now() };
  await _persist(companyId);
  _notify();
  return goals[idx];
}

/**
 * Cancel a goal. Caller is responsible for cancelling child issues
 * (the dashboard bulk-cancels via issues.update).
 */
export async function cancel(companyId, goalId, reason) {
  const goals = await _hydrate(companyId);
  const idx = goals.findIndex((g) => g.id === goalId);
  if (idx < 0) throw new Error(`goal ${goalId} not found`);
  goals[idx] = {
    ...goals[idx],
    status: "cancelled",
    cancelReason: reason || null,
    updatedAt: Date.now(),
    completedAt: Date.now(),
  };
  await _persist(companyId);
  await append(companyId, {
    kind: "system", action: "cancelGoal", status: "executed",
    note: reason || goals[idx].title.slice(0, 160), goalId,
  });
  _notify();
  return goals[idx];
}

/**
 * Mark a goal complete. Called automatically by the issue-rollup helper
 * below when every child issue reaches a terminal state.
 */
export async function complete(companyId, goalId) {
  const goals = await _hydrate(companyId);
  const idx = goals.findIndex((g) => g.id === goalId);
  if (idx < 0) return null;
  if (goals[idx].status !== "active") return goals[idx];
  goals[idx] = {
    ...goals[idx], status: "completed",
    updatedAt: Date.now(), completedAt: Date.now(),
  };
  await _persist(companyId);
  await append(companyId, {
    kind: "system", action: "completeGoal", status: "executed",
    note: goals[idx].title.slice(0, 160), goalId,
  });
  _notify();
  return goals[idx];
}

/**
 * Roll up child-issue state into the parent goal status. Called by
 * issues.finishAttempt + issues.update whenever an issue terminates.
 *
 * Rules:
 * - All children done                       → goal.completed
 * - All children done/cancelled (no open)   → goal.completed
 * - Otherwise no change
 */
export async function maybeComplete(companyId, goalId, allIssuesForGoal) {
  if (!goalId || !allIssuesForGoal?.length) return null;
  const open = allIssuesForGoal.filter((i) =>
    i.status !== "done" && i.status !== "cancelled",
  );
  if (open.length > 0) return null;
  return complete(companyId, goalId);
}

/** Aggregates for the UI. */
export async function counts(companyId) {
  const goals = await _hydrate(companyId);
  const out = { total: goals.length, active: 0, completed: 0, cancelled: 0 };
  for (const g of goals) if (out[g.status] !== undefined) out[g.status]++;
  return out;
}

export async function clear(companyId) {
  _cache.delete(companyId);
  await window.electronAPI?.store?.delete?.(KEY(companyId));
}
