/**
 * BonzAI Company — Issues (renderer-side adapter, SQLite-backed).
 *
 * Hot path: dispatcher calls `nextForRole` every role tick, then
 * `startAttempt` to mark in_progress, then `finishAttempt` to record
 * the outcome. All three round-trip through IPC in <1ms because the
 * repo is doing single indexed queries.
 *
 * Audit-trail behavior preserved — every create / update / reopen /
 * remove emits a `kind: "issue"` audit entry the live feed renders.
 */

import { append, _notify } from "./auditLog.js";

export const STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"];
export const PRIORITIES = ["low", "normal", "high", "urgent"];
export const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

const _api = () => window.electronAPI?.db?.issues || null;
let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[issues] data layer not reachable — issue writes will be dropped " +
    "until the DB is open. Run `npm install` and restart. Error: " +
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
  const issue = await _safe((api) => api.create(companyId, input), null);
  if (issue) {
    await append(companyId, {
      kind: "issue", role: issue.assigneeRole, action: "createIssue",
      status: "executed",
      note: `[${issue.priority}] ${(issue.title || "").slice(0, 120)}`,
      issueId: issue.id,
    });
    _notify();
  }
  return issue;
}

export async function list(companyId, filter = {}) {
  return _safe((api) => api.list(companyId, filter), []);
}

export async function get(companyId, issueId) {
  return _safe((api) => api.get(companyId, issueId), null);
}

export async function update(companyId, issueId, patch) {
  const issue = await _safe((api) => api.update(companyId, issueId, patch), null);
  if (issue && patch?.status) {
    await append(companyId, {
      kind: "issue", role: issue.assigneeRole, action: `issue.${patch.status}`,
      status: "executed", issueId, note: (issue.title || "").slice(0, 120),
    });
  }
  if (issue) _notify();
  return issue;
}

export async function reopen(companyId, issueId) {
  const issue = await _safe((api) => api.reopen(companyId, issueId), null);
  if (issue) {
    await append(companyId, {
      kind: "issue", role: issue.assigneeRole, action: "issue.reopen",
      status: "executed", issueId, note: (issue.title || "").slice(0, 120),
    });
    _notify();
  }
  return issue;
}

export async function remove(companyId, issueId) {
  const issue = await _safe((api) => api.get(companyId, issueId), null);
  const ok = await _safe((api) => api.remove(companyId, issueId), { ok: false });
  if (issue) {
    await append(companyId, {
      kind: "issue", role: issue.assigneeRole, action: "issue.delete",
      status: "executed", issueId, note: (issue.title || "").slice(0, 120),
    });
  }
  _notify();
  return !!ok;
}

// ─────────────────────────────────────────────────────────────────────
// Dispatcher integration
// ─────────────────────────────────────────────────────────────────────

export async function nextForRole(companyId, roleKey, currentCompanion) {
  return _safe((api) => api.nextForRole(companyId, roleKey, currentCompanion), null);
}

export async function startAttempt(companyId, issueId, role, companion) {
  return _safe((api) => api.startAttempt(companyId, issueId, role, companion), null);
}

export async function finishAttempt(companyId, issueId, outcome) {
  const issue = await _safe((api) => api.finishAttempt(companyId, issueId, outcome), null);
  if (issue) {
    await append(companyId, {
      kind: "issue", role: issue.assigneeRole, action: `issue.${issue.status}`,
      status: "executed", issueId, note: (issue.title || "").slice(0, 120),
      txOrLink: outcome?.txOrLink || null,
    });
    _notify();
  }
  return issue;
}

// ─────────────────────────────────────────────────────────────────────
// Aggregates
// ─────────────────────────────────────────────────────────────────────

export async function counts(companyId) {
  return _safe(
    (api) => api.counts(companyId),
    { total: 0, open: 0, in_progress: 0, blocked: 0, done: 0, cancelled: 0 },
  );
}

export async function clear(companyId) {
  await _safe((api) => api.clear(companyId), null);
}
