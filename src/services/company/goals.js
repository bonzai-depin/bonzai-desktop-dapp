/**
 * BonzAI Company — Goals (renderer-side adapter, SQLite-backed).
 *
 * Thin pass-through to `window.electronAPI.db.goals.*`. The actual
 * storage lives in SQLite in the main process via the goals repo.
 * Audit-trail entries are appended through the audit adapter, so the
 * Live feed still shows goal-create / goal-cancel / goal-complete
 * events even though the row write is now SQL.
 *
 * Same shape as the legacy module so consumers (dispatcher, store,
 * UI) don't change. Graceful degradation when the data layer isn't
 * up — every call resolves with a safe default + a one-time warning.
 */

import { append, _notify } from "./auditLog.js";

export const STATUSES = ["active", "completed", "cancelled"];

const _api = () => window.electronAPI?.db?.goals || null;
let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[goals] data layer not reachable — goal writes will be dropped " +
    "until the DB is open. Run `npm install` and restart. Underlying error: " +
    (err?.message || err || "no IPC handler"),
  );
}
async function _safe(fn, fallback) {
  const api = _api();
  if (!api) { _warnOnce(); return fallback; }
  try { return await fn(api); }
  catch (err) { _warnOnce(err); return fallback; }
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export async function create(companyId, input) {
  const goal = await _safe((api) => api.create(companyId, input), null);
  if (goal) {
    await append(companyId, {
      kind: "system",
      role: input?.createdByRole || (input?.createdBy === "ceo" ? "CEO" : null),
      action: "createGoal",
      status: "executed",
      note: (goal.title || "").slice(0, 160),
      goalId: goal.id,
    });
    _notify();
  }
  return goal;
}

export async function list(companyId, filter = {}) {
  return _safe((api) => api.list(companyId, filter), []);
}

export async function get(companyId, goalId) {
  return _safe((api) => api.get(companyId, goalId), null);
}

export async function update(companyId, goalId, patch) {
  const goal = await _safe((api) => api.update(companyId, goalId, patch), null);
  if (goal) _notify();
  return goal;
}

export async function cancel(companyId, goalId, reason) {
  const goal = await _safe((api) => api.cancel(companyId, goalId, reason), null);
  if (goal) {
    await append(companyId, {
      kind: "system", action: "cancelGoal", status: "executed",
      note: reason || (goal.title || "").slice(0, 160), goalId,
    });
    _notify();
  }
  return goal;
}

export async function complete(companyId, goalId) {
  const goal = await _safe((api) => api.complete(companyId, goalId), null);
  if (goal) {
    await append(companyId, {
      kind: "system", action: "completeGoal", status: "executed",
      note: (goal.title || "").slice(0, 160), goalId,
    });
    _notify();
  }
  return goal;
}

/**
 * Roll up sibling-issue state into the parent goal status. Called by
 * the dispatcher's tickRole after a child issue terminates.
 */
export async function maybeComplete(companyId, goalId, allIssuesForGoal) {
  if (!goalId) return null;
  const goal = await _safe(
    (api) => api.maybeComplete(companyId, goalId, allIssuesForGoal),
    null,
  );
  if (goal && goal.status === "completed") {
    await append(companyId, {
      kind: "system", action: "completeGoal", status: "executed",
      note: (goal.title || "").slice(0, 160), goalId,
    });
    _notify();
  }
  return goal;
}

export async function counts(companyId) {
  return _safe(
    (api) => api.counts(companyId),
    { total: 0, active: 0, completed: 0, cancelled: 0 },
  );
}

export async function clear(companyId) {
  await _safe((api) => api.clear(companyId), null);
}
