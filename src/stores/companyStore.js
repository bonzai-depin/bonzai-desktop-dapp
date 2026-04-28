/**
 * BonzAI Company — reactive store for the Company tab UI
 *
 * Wraps `services/company.service.js` with Vue reactivity. The UI binds
 * to `state.companies`, `state.activeCompany`, `state.audit`, etc., and
 * actions trigger service calls + re-load.
 *
 * Style matches `inferenceStore.js` — shallowReactive + readonly export +
 * an `actions` object that performs mutations.
 */

import { shallowReactive, readonly, computed } from "vue";
import * as svc from "../services/company.service.js";
import * as streamBus from "../services/company/streamBus.js";

/**
 * Strip Vue reactivity proxies from an object before it crosses into
 * the engine layer (which then crosses Electron IPC). The structured-
 * clone algorithm IPC uses can't serialize Proxies — the symptom is
 * the renderer-side error "an object could not be cloned." Every store
 * action that takes UI-originated data routes through this helper.
 */
function plain(obj) {
  if (obj == null) return obj;
  try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; }
}

// Internal state — the store owns the source of truth in memory.
const _state = shallowReactive({
  ready: false,
  companies: [],         // list of charters
  activeId: null,        // selected company in the UI
  audit: [],             // recent audit entries for the active company
  approvals: [],         // pending approvals for the active company
  catalog: [],           // published items for the active company
  treasuryState: null,   // for the active company
  queueDepths: {},       // for the active company
  issues: [],            // every issue (CEO + user) for the active company
  issueCounts: { total: 0, open: 0, in_progress: 0, blocked: 0, done: 0, cancelled: 0 },
  goals: [],             // every goal (CEO + user) for the active company
  goalCounts: { total: 0, active: 0, completed: 0, cancelled: 0 },
  connectors: [],        // installed connectors for the active company
  connectorHealth: { total: 0, active: 0, needs_auth: 0, expired: 0, broken: 0, revoked: 0 },
  // In-flight LLM streams keyed by streamId. The dispatcher writes here
  // as tokens arrive; the live feed renders open streams as live cards.
  // Cleared on completion (the final response lands in the audit log).
  activeStreams: {},
  summary: {             // 24h KPI summary for the active company
    total: 0, executed: 0, vetoed: 0, queued: 0, proposed: 0, error: 0,
    spend: 0, revenue: 0,
  },
  // Re-exported library so the UI doesn't have to import the service directly
  roleLibrary: svc.ROLE_LIBRARY,
  vetoModes: svc.VETO_MODES,
  actionClasses: svc.ACTION_CLASSES,
  currencies: svc.CURRENCIES,
});

// ─────────────────────────────────────────────────────────────────────────
// Hydration + change subscription
// ─────────────────────────────────────────────────────────────────────────

let _auditUnsub = null;
let _streamUnsub = null;

export async function init() {
  if (_state.ready) return;
  _state.companies = await svc.bootAll();
  _state.ready = true;

  // Re-subscribe to audit changes — auto-refresh the active view
  _auditUnsub = svc.onAuditChange(async () => {
    if (_state.activeId) await refreshActive();
  });

  // Bridge the dispatcher's stream bus into the reactive activeStreams
  // map so the live feed renders in-flight LLM thoughts token-by-token.
  _streamUnsub = streamBus.subscribe((ev) => {
    if (ev.type === "begin") {
      _state.activeStreams = {
        ..._state.activeStreams,
        [ev.streamId]: {
          streamId: ev.streamId,
          role: ev.role,
          action: ev.action,
          response: "",
          startedAt: Date.now(),
        },
      };
    } else if (ev.type === "chunk") {
      const cur = _state.activeStreams[ev.streamId];
      if (!cur) return;
      _state.activeStreams = {
        ..._state.activeStreams,
        [ev.streamId]: { ...cur, response: cur.response + (ev.chunk || "") },
      };
    } else if (ev.type === "end" || ev.type === "error") {
      const next = { ..._state.activeStreams };
      delete next[ev.streamId];
      _state.activeStreams = next;
    }
  });
}

export function teardown() {
  if (_auditUnsub) _auditUnsub();
  _auditUnsub = null;
  if (_streamUnsub) _streamUnsub();
  _streamUnsub = null;
}

// ─────────────────────────────────────────────────────────────────────────
// Selection
// ─────────────────────────────────────────────────────────────────────────

export async function setActive(id) {
  _state.activeId = id;
  await refreshActive();
}

export const activeCompany = computed(() =>
  _state.companies.find((c) => c.id === _state.activeId) || null,
);

// ─────────────────────────────────────────────────────────────────────────
// Refresh — pulls fresh data for the currently active company
// ─────────────────────────────────────────────────────────────────────────

export async function refreshActive() {
  const id = _state.activeId;
  if (!id) {
    _state.audit = []; _state.approvals = []; _state.catalog = [];
    _state.treasuryState = null; _state.queueDepths = {};
    return;
  }
  const [audit, approvals, catalog, treasuryState, depths, summary, charter, issues, issueCounts, goals, goalCounts, conns, connHealth] =
    await Promise.all([
      svc.recentAudit(id, 200),
      svc.pendingApprovals(id),
      svc.listCatalog(id),
      svc.getTreasuryState(id),
      svc.getQueueDepths(id),
      svc.summarizeAudit(id),
      svc.getCompany(id),
      svc.listIssues(id),
      svc.issueCounts(id),
      svc.listGoals(id),
      svc.goalCounts(id),
      svc.listConnectors(id),
      svc.connectorHealth(id),
    ]);
  _state.audit = audit;
  _state.approvals = approvals;
  _state.catalog = catalog;
  _state.treasuryState = treasuryState;
  _state.queueDepths = depths;
  _state.summary = summary;
  _state.issues = issues;
  _state.issueCounts = issueCounts;
  _state.goals = goals;
  _state.goalCounts = goalCounts;
  _state.connectors = conns;
  _state.connectorHealth = connHealth;
  // Replace the in-list charter with the freshest copy.
  if (charter) {
    const idx = _state.companies.findIndex((c) => c.id === id);
    if (idx >= 0) _state.companies[idx] = charter;
  }
}

export async function refreshList() {
  _state.companies = await svc.listCompanies();
}

// ─────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────

export async function form(cfg) {
  const c = await svc.formCompany(plain(cfg));
  await refreshList();
  await setActive(c.id);
  return c;
}

/**
 * Form a company from a vertical template. Used by the intake wizard.
 */
export async function formFromTemplate(templateId, answers, ownerOverrides = {}) {
  const c = await svc.formFromTemplate(templateId, plain(answers), plain(ownerOverrides));
  await refreshList();
  await setActive(c.id);
  return c;
}

export const listTemplates = () => svc.listTemplates();
export const getTemplate = (id) => svc.getTemplate(id);
export const previewTemplate = (templateId, answers, owner) =>
  svc.previewTemplate(templateId, plain(answers), plain(owner));

// ─────────────────────────────────────────────────────────────────────────
// Streaming LLM thoughts — live-feed integration
// ─────────────────────────────────────────────────────────────────────────

/**
 * Begin a stream. Stores a record under activeStreams[streamId] that
 * the live feed picks up reactively.
 */
export function beginStream(streamId, meta) {
  _state.activeStreams = {
    ..._state.activeStreams,
    [streamId]: { ...meta, response: "", startedAt: Date.now(), streamId },
  };
}
/** Append a chunk to an active stream. Reactive — live feed re-renders. */
export function appendStream(streamId, chunk) {
  const cur = _state.activeStreams[streamId];
  if (!cur) return;
  _state.activeStreams = {
    ..._state.activeStreams,
    [streamId]: { ...cur, response: cur.response + chunk },
  };
}
/** Remove a stream after the final audit entry has been written. */
export function endStream(streamId) {
  if (!_state.activeStreams[streamId]) return;
  const next = { ..._state.activeStreams };
  delete next[streamId];
  _state.activeStreams = next;
}

// ─────────────────────────────────────────────────────────────────────────
// Audit (live feed) — clear without dissolving
// ─────────────────────────────────────────────────────────────────────────

export async function clearAudit() {
  if (!_state.activeId) return;
  await svc.clearAudit(_state.activeId);
  await refreshActive();
}

// ─────────────────────────────────────────────────────────────────────────
// Connectors
// ─────────────────────────────────────────────────────────────────────────

export async function createConnector(input) {
  if (!_state.activeId) return null;
  const c = await svc.createConnector(_state.activeId, plain(input));
  await refreshActive();
  return c;
}
export async function setConnectorSecret(connId, secret) {
  if (!_state.activeId) return null;
  const c = await svc.setConnectorSecret(_state.activeId, connId, plain(secret));
  await refreshActive();
  return c;
}
export async function revokeConnector(connId, reason) {
  if (!_state.activeId) return null;
  const c = await svc.revokeConnector(_state.activeId, connId, reason);
  await refreshActive();
  return c;
}
export async function removeConnector(connId) {
  if (!_state.activeId) return false;
  const ok = await svc.removeConnector(_state.activeId, connId);
  await refreshActive();
  return ok;
}

export async function update(charter) {
  const c = await svc.updateCompany(plain(charter));
  await refreshList();
  await refreshActive();
  return c;
}

export async function pause(id) {
  await svc.pauseCompany(id);
  await refreshList();
}

export async function resume(id) {
  await svc.resumeCompany(id);
  await refreshList();
}

export async function dissolve(id) {
  await svc.dissolveCompany(id);
  if (_state.activeId === id) _state.activeId = null;
  await refreshList();
}

export async function tickNow() {
  if (!_state.activeId) return;
  await svc.tickNow(_state.activeId);
  await refreshActive();
}

export async function tickRoleNow(roleKey) {
  if (!_state.activeId) return;
  await svc.tickRoleNow(_state.activeId, roleKey);
  await refreshActive();
}

export async function approve(pendingId) {
  if (!_state.activeId) return;
  await svc.approveAction(_state.activeId, pendingId);
  await refreshActive();
}

export async function reject(pendingId, reason) {
  if (!_state.activeId) return;
  await svc.rejectAction(_state.activeId, pendingId, reason);
  await refreshActive();
}

export async function recordRevenue(opts) {
  if (!_state.activeId) return;
  await svc.recordRevenue(_state.activeId, plain(opts));
  await refreshActive();
}

export async function paySupplier(opts) {
  if (!_state.activeId) return;
  await svc.paySupplier(_state.activeId, plain(opts));
  await refreshActive();
}

// ─────────────────────────────────────────────────────────────────────────
// Goals — owner-created intent (parent of issues)
// ─────────────────────────────────────────────────────────────────────────

export async function createGoal(input) {
  if (!_state.activeId) return null;
  const goal = await svc.createGoal(_state.activeId, plain(input));
  await refreshActive();
  return goal;
}
export async function updateGoal(goalId, patch) {
  if (!_state.activeId) return null;
  const goal = await svc.updateGoal(_state.activeId, goalId, plain(patch));
  await refreshActive();
  return goal;
}
export async function cancelGoal(goalId, reason) {
  if (!_state.activeId) return null;
  const goal = await svc.cancelGoal(_state.activeId, goalId, reason);
  await refreshActive();
  return goal;
}

// ─────────────────────────────────────────────────────────────────────────
// Issues — user-direct work items
// ─────────────────────────────────────────────────────────────────────────

export async function createIssue(input) {
  if (!_state.activeId) return null;
  const issue = await svc.createIssue(_state.activeId, plain(input));
  await refreshActive();
  return issue;
}
export async function updateIssue(issueId, patch) {
  if (!_state.activeId) return null;
  const issue = await svc.updateIssue(_state.activeId, issueId, plain(patch));
  await refreshActive();
  return issue;
}
export async function reopenIssue(issueId) {
  if (!_state.activeId) return null;
  const issue = await svc.reopenIssue(_state.activeId, issueId);
  await refreshActive();
  return issue;
}
export async function removeIssue(issueId) {
  if (!_state.activeId) return false;
  const ok = await svc.removeIssue(_state.activeId, issueId);
  await refreshActive();
  return ok;
}

export async function exportActive(opts) {
  if (!_state.activeId) return null;
  return svc.exportCompany(_state.activeId, opts);
}

export async function importBundle(bundle) {
  const c = await svc.importCompany(plain(bundle));
  await refreshList();
  await setActive(c.id);
  return c;
}

// ─────────────────────────────────────────────────────────────────────────
// Read-only export of state
// ─────────────────────────────────────────────────────────────────────────

export const state = readonly(_state);

// Convenience: a tightly-bound store object for components that prefer
// `companyStore.state` / `companyStore.actions` style.
export const companyStore = {
  state,
  init,
  teardown,
  refreshActive,
  refreshList,
  setActive,
  form,
  update,
  pause,
  resume,
  dissolve,
  tickNow,
  tickRoleNow,
  approve,
  reject,
  recordRevenue,
  paySupplier,
  exportActive,
  importBundle,
  activeCompany,
  // goals
  createGoal,
  updateGoal,
  cancelGoal,
  // issues
  createIssue,
  updateIssue,
  reopenIssue,
  removeIssue,
  // templates
  formFromTemplate,
  listTemplates,
  getTemplate,
  previewTemplate,
  // audit
  clearAudit,
  // streaming
  beginStream, appendStream, endStream,
  // connectors
  createConnector,
  setConnectorSecret,
  revokeConnector,
  removeConnector,
};

export default companyStore;
