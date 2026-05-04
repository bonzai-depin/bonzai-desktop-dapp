/**
 * BonzAI Company — Solo Mode governance (renderer-side adapter,
 * SQLite-backed).
 *
 * Owner-veto with three modes per action class. The dispatcher calls
 * `gateAction(...)` BEFORE executing any action. Result:
 *   AUTO     → { pass: true, mode, cls }
 *   NOTIFY   → { pass: true, notify: true, mode, cls }
 *   APPROVE  → enqueue + { pass: false, queued: pendingId, mode, cls }
 *
 * Same shape as the legacy module so the dispatcher's gate / approve /
 * reject paths don't change. Only the storage layer moves.
 */

import { append, _notify } from "./auditLog.js";
import { vetoModeFor, VETO_MODES } from "./charter.js";

const _api = () => window.electronAPI?.db?.approvals || null;
let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[governance] data layer not reachable. Approvals will fall back to " +
    "auto-execute until the DB is open. Run `npm install` and restart. " +
    "Error: " + (err?.message || err || "no IPC handler"),
  );
}
async function _safe(fn, fallback) {
  const api = _api();
  if (!api) { _warnOnce(); return fallback; }
  try { return await fn(api); }
  catch (err) { _warnOnce(err); return fallback; }
}

/** Classify an action so the veto-mode lookup hits the right key. */
function _classify(action) {
  if (action.type === "produce" && action.pipeline) return `produce.${action.pipeline}`;
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
  return action.type;
}

export async function gateAction(companyId, charter, action, ctx = {}) {
  const cls = _classify(action);
  const mode = vetoModeFor(charter, cls);

  if (mode === VETO_MODES.AUTO) return { pass: true, mode, cls };
  if (mode === VETO_MODES.NOTIFY) return { pass: true, notify: true, mode, cls };

  // APPROVE → enqueue
  const row = await _safe(
    (api) => api.enqueue(companyId, {
      cls,
      action,
      role: ctx.role || null,
      requestedBy: ctx.companion || null,
    }),
    null,
  );
  if (!row) {
    // Data layer is down → degrade safely to AUTO so the company keeps
    // ticking. The user will see no Approvals queue; this is fine
    // because the DB-down warning makes the situation obvious.
    return { pass: true, mode: VETO_MODES.AUTO, cls, degraded: true };
  }
  await append(companyId, {
    kind: "approval", role: ctx.role || null, action: action.type,
    status: "queued", note: `awaiting owner approval (${cls})`, pendingId: row.id,
  });
  _notify();
  return { pass: false, queued: row.id, mode, cls };
}

export async function pending(companyId) {
  const rows = await _safe((api) => api.pending(companyId), []);
  // Re-hydrate `action` JSON blobs (stored as string in SQLite)
  return rows.map((r) => ({
    ...r,
    action: typeof r.action === "string" ? JSON.parse(r.action) : r.action,
  }));
}

export async function approve(companyId, pendingId) {
  const action = await _safe((api) => api.approve(companyId, pendingId), null);
  if (action) {
    await append(companyId, {
      kind: "approval", role: null, action: action.type,
      status: "approved", pendingId,
    });
    _notify();
  }
  return action;
}

export async function reject(companyId, pendingId, reason) {
  const row = await _safe((api) => api.reject(companyId, pendingId, reason), null);
  if (row) {
    await append(companyId, {
      kind: "approval", role: null, action: row.action?.type || "unknown",
      status: "rejected", note: reason || "", pendingId,
    });
    _notify();
  }
  return row;
}

export async function clear(companyId) {
  await _safe((api) => api.clear(companyId), null);
}
