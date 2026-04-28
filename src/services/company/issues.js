/**
 * BonzAI Company — Issues (the unit of work)
 *
 * Paperclip-style task primitive: every concrete piece of work has a
 * title, description, status, priority, and an assignee (role key, with
 * an optional specific-companion override). Issues feed into the same
 * per-role queues the autonomous CEO loop uses, but with priority sort
 * + lifecycle metadata.
 *
 * Status lifecycle:  open → in_progress → done / blocked / cancelled
 * Priority sort:     urgent > high > normal > low (then FIFO within bucket)
 *
 * Storage: `companies/<id>/issues` (full list) + `companies/<id>/issues-index`
 * (sparse summary for fast queries). The dispatcher reads issues directly
 * via list().
 */

import { v4 as uuid } from "uuid";
import { append, _notify } from "./auditLog.js";

const KEY = (id) => `companies/${id}/issues`;

/** Allowed status transitions. */
export const STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"];
export const PRIORITIES = ["low", "normal", "high", "urgent"];
export const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

const _cache = new Map(); // companyId -> issues[]

async function _hydrate(companyId) {
  if (_cache.has(companyId)) return _cache.get(companyId);
  const raw = await window.electronAPI?.store?.get?.(KEY(companyId), []);
  const issues = Array.isArray(raw) ? raw : [];
  _cache.set(companyId, issues);
  return issues;
}

async function _persist(companyId) {
  const issues = _cache.get(companyId) || [];
  await window.electronAPI?.store?.set?.(KEY(companyId), issues);
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a new issue and route it to the assignee role's queue.
 *
 * @param {string} companyId
 * @param {object} input  { title, description?, priority?, assigneeRole,
 *                          assigneeCompanion?, parentIssueId?, goalId?,
 *                          labels?, createdBy? }
 * @returns {Promise<Issue>}
 */
export async function create(companyId, input) {
  if (!input?.title?.trim()) throw new Error("title required");
  if (!input?.assigneeRole?.trim()) throw new Error("assigneeRole required");

  const now = Date.now();
  const issue = {
    id: uuid(),
    companyId,
    title: input.title.trim(),
    description: (input.description || "").trim(),
    status: "open",
    priority: PRIORITIES.includes(input.priority) ? input.priority : "normal",
    assigneeRole: input.assigneeRole,
    assigneeCompanion: input.assigneeCompanion || null,
    parentIssueId: input.parentIssueId || null,
    goalId: input.goalId || null,
    labels: Array.isArray(input.labels) ? input.labels : [],
    createdBy: input.createdBy || "user",
    createdAt: now,
    updatedAt: now,
    attempts: [],
  };

  const issues = await _hydrate(companyId);
  issues.push(issue);
  await _persist(companyId);

  await append(companyId, {
    kind: "issue", role: issue.assigneeRole, action: "createIssue",
    status: "executed",
    note: `[${issue.priority}] ${issue.title}`,
    issueId: issue.id,
  });
  _notify();
  return issue;
}

/**
 * List all issues for a company (newest first by default).
 * Optional filter: { status, assigneeRole, priority, parentIssueId }.
 */
export async function list(companyId, filter = {}) {
  const issues = await _hydrate(companyId);
  let out = [...issues];
  if (filter.status) out = out.filter((i) => i.status === filter.status);
  if (filter.assigneeRole) out = out.filter((i) => i.assigneeRole === filter.assigneeRole);
  if (filter.priority) out = out.filter((i) => i.priority === filter.priority);
  if (filter.parentIssueId !== undefined) out = out.filter((i) => i.parentIssueId === filter.parentIssueId);
  return out.reverse();
}

/** Look up a single issue. */
export async function get(companyId, issueId) {
  const issues = await _hydrate(companyId);
  return issues.find((i) => i.id === issueId) || null;
}

/**
 * Update fields on an existing issue. Returns the updated record.
 *
 * Validates status transitions and refuses any from a terminal state
 * (done / cancelled) — caller must `reopen()` first.
 */
export async function update(companyId, issueId, patch) {
  const issues = await _hydrate(companyId);
  const idx = issues.findIndex((i) => i.id === issueId);
  if (idx < 0) throw new Error(`issue ${issueId} not found`);
  const cur = issues[idx];

  if (patch.status && patch.status !== cur.status) {
    if (!STATUSES.includes(patch.status)) throw new Error(`invalid status: ${patch.status}`);
    if (cur.status === "done" || cur.status === "cancelled") {
      throw new Error(`cannot transition from terminal status ${cur.status}; reopen first`);
    }
  }
  if (patch.priority && !PRIORITIES.includes(patch.priority)) {
    throw new Error(`invalid priority: ${patch.priority}`);
  }

  const next = { ...cur, ...patch, id: cur.id, companyId: cur.companyId, updatedAt: Date.now() };
  issues[idx] = next;
  await _persist(companyId);

  if (patch.status && patch.status !== cur.status) {
    await append(companyId, {
      kind: "issue", role: cur.assigneeRole, action: `issue.${patch.status}`,
      status: "executed", issueId: cur.id, note: cur.title,
    });
  }
  _notify();
  return next;
}

/** Reopen a done/cancelled issue (sets status back to "open"). */
export async function reopen(companyId, issueId) {
  const issues = await _hydrate(companyId);
  const idx = issues.findIndex((i) => i.id === issueId);
  if (idx < 0) throw new Error(`issue ${issueId} not found`);
  issues[idx] = { ...issues[idx], status: "open", updatedAt: Date.now() };
  await _persist(companyId);
  await append(companyId, {
    kind: "issue", role: issues[idx].assigneeRole, action: "issue.reopen",
    status: "executed", issueId, note: issues[idx].title,
  });
  _notify();
  return issues[idx];
}

/** Delete an issue permanently (use sparingly — prefer cancel). */
export async function remove(companyId, issueId) {
  const issues = await _hydrate(companyId);
  const idx = issues.findIndex((i) => i.id === issueId);
  if (idx < 0) return false;
  const [dropped] = issues.splice(idx, 1);
  await _persist(companyId);
  await append(companyId, {
    kind: "issue", role: dropped.assigneeRole, action: "issue.delete",
    status: "executed", issueId, note: dropped.title,
  });
  _notify();
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Dispatcher integration — pulled from `dispatcher.tickRole`
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pick the next issue a role should work on. Returns the highest-
 * priority "open" issue assigned to this role, breaking ties by FIFO
 * over creation time. Issues whose `assigneeCompanion` is set are
 * preferred when the resolved companion matches; otherwise unrestricted.
 *
 * Returns null if no work is available.
 */
export async function nextForRole(companyId, roleKey, currentCompanion) {
  const issues = await _hydrate(companyId);
  const candidates = issues
    .filter((i) => i.status === "open" && i.assigneeRole === roleKey)
    .filter((i) => !i.assigneeCompanion || i.assigneeCompanion === currentCompanion);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 2;
    const pb = PRIORITY_RANK[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return a.createdAt - b.createdAt;
  });
  return candidates[0];
}

/**
 * Mark an issue as in_progress and append a fresh attempt record.
 * Called by the dispatcher when a role pulls an issue.
 */
export async function startAttempt(companyId, issueId, role, companion) {
  const issues = await _hydrate(companyId);
  const idx = issues.findIndex((i) => i.id === issueId);
  if (idx < 0) throw new Error(`issue ${issueId} not found`);
  const cur = issues[idx];
  if (cur.status === "done" || cur.status === "cancelled") return cur;

  const attempt = {
    id: uuid(),
    role,
    companion,
    startedAt: Date.now(),
    finishedAt: null,
    status: "running",
    log: [],
  };
  issues[idx] = {
    ...cur,
    status: "in_progress",
    updatedAt: Date.now(),
    attempts: [...cur.attempts, attempt],
  };
  await _persist(companyId);
  _notify();
  return issues[idx];
}

/**
 * Close out an attempt — sets the issue's terminal status (or back to
 * open/blocked if the attempt failed and we want to retry).
 */
export async function finishAttempt(companyId, issueId, outcome) {
  const issues = await _hydrate(companyId);
  const idx = issues.findIndex((i) => i.id === issueId);
  if (idx < 0) return null;
  const cur = issues[idx];
  if (cur.status !== "in_progress") return cur;

  const attempts = [...cur.attempts];
  const last = attempts[attempts.length - 1];
  if (last) {
    attempts[attempts.length - 1] = {
      ...last,
      finishedAt: Date.now(),
      status: outcome.status || "done",
      txOrLink: outcome.txOrLink || null,
      error: outcome.error || null,
    };
  }

  let nextStatus = "done";
  if (outcome.status === "error") nextStatus = "blocked";
  if (outcome.status === "vetoed") nextStatus = "blocked";
  if (outcome.status === "queued") nextStatus = "open"; // governance gated, retry next tick

  issues[idx] = { ...cur, status: nextStatus, attempts, updatedAt: Date.now() };
  await _persist(companyId);
  await append(companyId, {
    kind: "issue", role: cur.assigneeRole, action: `issue.${nextStatus}`,
    status: "executed", issueId, note: cur.title, txOrLink: outcome.txOrLink || null,
  });
  _notify();
  return issues[idx];
}

// ─────────────────────────────────────────────────────────────────────────
// Aggregates / KPIs
// ─────────────────────────────────────────────────────────────────────────

export async function counts(companyId) {
  const issues = await _hydrate(companyId);
  const out = { total: issues.length, open: 0, in_progress: 0, blocked: 0, done: 0, cancelled: 0 };
  for (const i of issues) if (out[i.status] !== undefined) out[i.status]++;
  return out;
}

export async function clear(companyId) {
  _cache.delete(companyId);
  await window.electronAPI?.store?.delete?.(KEY(companyId));
}
