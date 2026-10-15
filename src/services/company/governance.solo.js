import { FINANCE_READ_ACTIONS } from "./finance/actions.js";
import { OPERATIONAL_ACTIONS } from './operationalActions.js';
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
import { SKILL_MANIFESTS } from './skillManifests.js';

const READ_ONLY_CONNECTOR_ACTIONS = new Set([...FINANCE_READ_ACTIONS, 'qbo.reportAR', 'gcal.findSlots', 'shopify.listOrders', 'notion.queryDB']);
const EXTERNAL_ACTIONS = new Set(['runWorkflow', 'paySupplier', 'transfer', 'executeBuyback', 'publishContent', 'broadcastChannel', 'scheduleBroadcast', 'replyToInbox', 'sendCustomerOffer', 'publishFinancialReport', 'publishProductReport', 'publishComplianceReport', 'publishExperimentReport', 'retireOutput', 'fire', 'amendCharter', 'smartAgent.runWorker', 'smartAgent.acceptJob', 'smartAgent.submitResult', 'smartAgent.withdrawEarnings']);
const approvedActions = new WeakMap();

export function consumeOwnerApproval(companyId, pendingId, action) {
  const approval = approvedActions.get(action);
  if (!approval || approval.companyId !== companyId || approval.pendingId !== pendingId || approval.action !== JSON.stringify(action)) return false;
  approvedActions.delete(action);
  return true;
}

/** Capability assignment is not authority to spend, publish or change external records. */
export function requiresOwnerApproval(action = {}) {
  const operational = OPERATIONAL_ACTIONS[action.type];
  if (operational) return !operational.read && !['grants.prepareBatch','grants.saveDossier','grants.draftDocument','purchasing.saveRequest','purchasing.saveRfq','purchasing.runReview','billing.saveInvoice','records.prepareMessage','records.runReminders'].includes(action.type);
  // Addressed team messages stay on this device; shared record mutations need review.
  if (action.type === 'team.updateProcurement') return true;
  if (EXTERNAL_ACTIONS.has(action.type)) return true;
  if(action.type === "gmao.updateProcurement" && ["ordered","received","partially_received","cancelled"].includes(action.status)) return true;
  if(action.type === "gmao.validateProcessStep") return true;
  if(action.type === "gmao.recordAttachment" || (action.type === "gmao.transitionWorkOrder" && ["acknowledged","en_route","on_site","restored","cancelled"].includes(action.status))) return true;
  if (action.type === 'gmao.recordServiceAcceptance' || action.type === 'field.completeJob' || (action.type === 'gmao.transitionWorkOrder' && action.status === 'completed')) return true;
  if (action.type === 'runFineTune' || (action.type === 'produce' && action.pipeline === 'fineTune')) return true;
  if (action.type === 'produce' && Object.keys(action.params || {}).some(key => /(?:_path|_url)$/.test(key))) return true;
  if (action.type === 'gmao.notifyClient') return false;
  if(action.type==='gmao.updateQuote' && ['accepted','rejected','purchase_order_received'].includes(action.status))return true;
  if(action.type==='gmao.registerCompliance' && action.status==='valid')return true;
  if (['sent', 'accepted', 'paid'].includes(action.status) && ['gmao.createQuote', 'gmao.updateQuote', 'gmao.saveInvoice'].includes(action.type)) return true;
  if (READ_ONLY_CONNECTOR_ACTIONS.has(action.type)) return false;
  return Object.values(SKILL_MANIFESTS).some(manifest => manifest.requiredConnectors?.length && manifest.actions.some(item => item.type === action.type));
}

const _api = () => window.electronAPI?.db?.approvals || null;
let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[governance] data layer not reachable. Approval-required actions are blocked " +
    "until the DB is open. Run `npm install` and restart. " +
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
  if (action.type === "gmao.createWorkOrder") return "gmao.createWorkOrder";
  if (action.type === "gmao.transitionWorkOrder") {
    return action.status === "completed" ? "gmao.completeWorkOrder" : "gmao.updateStatus";
  }
  if (action.type === "field.completeJob") return "gmao.updateStatus";
  if (action.type === "gmao.recordAttachment") return action.resolved === true ? "gmao.updateStatus" : "gmao.procurement";
  if (action.type === "gmao.updateProcurement") return "gmao.procurement";
  if (action.type === "gmao.notifyClient") return "gmao.notifyClient";
  if (action.type === "gmao.createQuote") return "gmao.createQuote";
  if (action.type === "gmao.updateQuote") return action.status === "sent" ? "gmao.notifyClient" : "gmao.createQuote";
  if (action.type === "gmao.validateProcessStep") return "gmao.completeWorkOrder";
  if (action.type === "gmao.recordServiceAcceptance") return "gmao.completeWorkOrder";
  if (action.type === "gmao.saveInvoice") return action.status === "sent" ? "invoice.send" : "invoice.create";
  if (action.type === "gmao.registerCompliance") return "gmao.compliance";
  if (action.type === "gmao.exportWeeklyRegister") return "gmao.export";
  if (action.type === "gmao.runAutomation") return "gmao.automation";
  if (action.type === "gmao.recommendSchedule") return "gmao.recommendSchedule";
  if (action.type === "gmao.reconcileBilling") return "gmao.reconcileBilling";
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
  const mode = requiresOwnerApproval(action) ? VETO_MODES.APPROVE : vetoModeFor(charter, cls);

  if (mode === VETO_MODES.AUTO) return { pass: true, mode, cls };
  if (mode === VETO_MODES.NOTIFY) return { pass: true, notify: true, mode, cls };

  // APPROVE → enqueue
  const row = await _safe(
    (api) => api.enqueue(companyId, {
      cls,
      issueId: ctx.issueId || null,
      stepId: ctx.stepId || null,
      action,
      role: ctx.role || null,
      requestedBy: ctx.companion || null,
    }),
    null,
  );
  if (!row) {
    // A missing approval queue cannot grant authority to execute.
    return { pass: false, mode: VETO_MODES.APPROVE, cls, degraded: true, error: "Approval storage is unavailable. Try again when the local database is ready." };
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
    approvedActions.set(action, { companyId, pendingId, action: JSON.stringify(action) });
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
