/**
 * BonzAI Company — Solo Mode governance adapter (owner veto)
 *
 * In Solo Mode, the user is the sole owner. "Governance" is just a queue
 * of pending approvals plus three veto modes per action class:
 *
 *   AUTO     — execute immediately, log it
 *   NOTIFY   — execute immediately, emit a desktop notification, log it
 *   APPROVE  — queue for owner click in the dapp; do NOT execute until
 *              owner explicitly approves (or rejects) via the UI
 *
 * The dispatcher consults `gateAction(charter, action)` BEFORE executing
 * any action. If the result is `{ pass: true }`, the dispatcher proceeds.
 * If `{ pass: false, queued: pendingId }`, the dispatcher logs that the
 * action is queued and returns; the action will be re-attempted when the
 * owner approves it via `approve(companyId, pendingId)`.
 *
 * Persistence: Electron Store at `companies/<id>/approvals`.
 */

import { v4 as uuid } from "uuid";
import { append, _notify } from "./auditLog.js";
import { vetoModeFor, VETO_MODES } from "./charter.js";

const KEY = (id) => `companies/${id}/approvals`;
const _cache = new Map();

async function _hydrate(companyId) {
  if (_cache.has(companyId)) return _cache.get(companyId);
  const raw = await window.electronAPI?.store?.get?.(KEY(companyId), []);
  const queue = Array.isArray(raw) ? raw : [];
  _cache.set(companyId, queue);
  return queue;
}

async function _persist(companyId) {
  const queue = _cache.get(companyId) || [];
  await window.electronAPI?.store?.set?.(KEY(companyId), queue);
}

/**
 * Classify an action so the veto-mode lookup hits the right key.
 * Returns one of the entries in ACTION_CLASSES.
 */
function _classify(action) {
  if (action.type === "produce" && action.pipeline) {
    return `produce.${action.pipeline}`;
  }
  if (action.type === "publishContent") return "publishContent";
  if (action.type === "broadcastChannel" || action.type === "scheduleBroadcast") return "broadcastChannel";
  if (action.type === "replyToInbox") return "replyToInbox";
  if (action.type === "paySupplier" || action.type === "transfer") {
    const amt = Number(action.amount) || 0;
    if (amt < 10) return "spend.under.10";
    if (amt < 50) return "spend.under.50";
    if (amt < 250) return "spend.under.250";
    return "spend.over.250";
  }
  if (action.type === "proposeHire" || action.type === "hire") return "hire";
  if (action.type === "proposeFire" || action.type === "fire") return "fire";
  if (action.type === "proposeCharterAmendment" || action.type === "amendCharter") return "amendCharter";
  return action.type; // fall through; veto map lookup will return AUTO default
}

/**
 * The dispatcher's pre-execution gate.
 * - AUTO   → returns { pass: true }; caller proceeds.
 * - NOTIFY → returns { pass: true, notify: true }; caller proceeds + posts a Notification.
 * - APPROVE → enqueues a pending approval, returns { pass: false, queued: pendingId }.
 */
export async function gateAction(companyId, charter, action, ctx = {}) {
  const cls = _classify(action);
  const mode = vetoModeFor(charter, cls);

  if (mode === VETO_MODES.AUTO) return { pass: true, mode, cls };
  if (mode === VETO_MODES.NOTIFY) return { pass: true, notify: true, mode, cls };

  // APPROVE → enqueue
  const queue = await _hydrate(companyId);
  const pending = {
    id: uuid(),
    companyId,
    cls,
    action,
    role: ctx.role || null,
    requestedBy: ctx.companion || null,
    requestedAt: Date.now(),
    status: "pending", // pending | approved | rejected | expired
  };
  queue.push(pending);
  _cache.set(companyId, queue);
  await _persist(companyId);

  await append(companyId, {
    kind: "approval",
    role: ctx.role || null,
    action: action.type,
    status: "queued",
    note: `awaiting owner approval (${cls})`,
    pendingId: pending.id,
  });
  _notify();
  return { pass: false, queued: pending.id, mode, cls };
}

/** Read the current approvals queue (newest first). */
export async function pending(companyId) {
  const queue = await _hydrate(companyId);
  return [...queue].filter((p) => p.status === "pending").reverse();
}

/** Owner approved — mark + return the action so the caller can dispatch it. */
export async function approve(companyId, pendingId) {
  const queue = await _hydrate(companyId);
  const idx = queue.findIndex((p) => p.id === pendingId);
  if (idx < 0) throw new Error("pending action not found");
  if (queue[idx].status !== "pending") throw new Error(`already ${queue[idx].status}`);
  queue[idx].status = "approved";
  queue[idx].decidedAt = Date.now();
  await _persist(companyId);
  await append(companyId, {
    kind: "approval",
    role: queue[idx].role,
    action: queue[idx].action.type,
    status: "approved",
    pendingId,
  });
  _notify();
  return queue[idx].action;
}

/** Owner rejected — discard, log. */
export async function reject(companyId, pendingId, reason) {
  const queue = await _hydrate(companyId);
  const idx = queue.findIndex((p) => p.id === pendingId);
  if (idx < 0) throw new Error("pending action not found");
  if (queue[idx].status !== "pending") throw new Error(`already ${queue[idx].status}`);
  queue[idx].status = "rejected";
  queue[idx].decidedAt = Date.now();
  queue[idx].rejectReason = reason || null;
  await _persist(companyId);
  await append(companyId, {
    kind: "approval",
    role: queue[idx].role,
    action: queue[idx].action.type,
    status: "rejected",
    note: reason || "",
    pendingId,
  });
  _notify();
  return queue[idx];
}

/** Wipe approvals (used on dissolve). */
export async function clear(companyId) {
  _cache.delete(companyId);
  await window.electronAPI?.store?.delete?.(KEY(companyId));
}
