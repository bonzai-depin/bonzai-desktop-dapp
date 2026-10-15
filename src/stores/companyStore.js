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
  runtimeError: '',
  companies: [],         // list of charters
  inspectedDemo: null,
  activeId: null,        // selected company in the UI
  audit: [],             // recent audit entries for the active company
  approvals: [],         // pending approvals for the active company
  intakeReviewCount: 0,
  intakeError: '',
  catalog: [],           // saved outputs for the active workspace
  catalogError: "",
  treasuryState: null,   // for the active company
  queueDepths: {},       // for the active company
  issues: [],            // every issue (CEO + user) for the active company
  issueCounts: { total: 0, open: 0, in_progress: 0, blocked: 0, done: 0, cancelled: 0 },
  goals: [],             // every goal (CEO + user) for the active company
  goalCounts: { total: 0, active: 0, completed: 0, cancelled: 0 },
  connectors: [],        // installed connectors for the active company
  connectorHealth: { total: 0, active: 0, needs_auth: 0, expired: 0, broken: 0, revoked: 0 },
  automation: { state: null, health: { level: "idle", label: "Ready", detail: "No run recorded yet" } },
  gmao: null,            // HVAC contract, sites, assets, OT, SLA, compliance and finance
  gmaoRefreshError: '',  // a read failure never turns a committed write into a failed save
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
let _gmaoUnsub = null;
let _issuesUnsub = null;
let _catalogUnsub = null;
let _intakeUnsub = null;
async function refreshIntakeCount() {
  const id = _state.activeId;
  if (!id) { _state.intakeReviewCount = 0; return; }
  try {
    const value = await window.electronAPI?.db?.companyIntake?.snapshot?.(id, {limit:1});
    if (_state.activeId === id) { _state.intakeReviewCount = value?.counts?.find(c=>c.status==='review')?.count || 0; _state.intakeError = ''; }
  } catch (error) { if (_state.activeId === id) _state.intakeError = error.message; }
}
let _runtimeUnsub = null;
let _auditRefreshTimer = null;
let _refreshPromise = null;
let _refreshRequested = false;
let _streamFlushTimer = null;
let _auditGeneration = 0;
let _refreshCoveredGeneration = 0;
let _selectionRevision = 0;
let _gmaoRevision = 0;
const _gmaoRefreshes = new Map();
const _streamRecords = new Map();

function scheduleStreamPublish(immediate = false) {
  if (_streamFlushTimer) return;
  const publish = () => {
    _streamFlushTimer = null;
    _state.activeStreams = Object.fromEntries(_streamRecords);
  };
  if (immediate) publish();
  else _streamFlushTimer = setTimeout(publish, 80);
}

// App startup and a Company view may mount concurrently. Share one boot and
// one set of subscriptions; view teardown never owns the background executor.
let _initPromise = null;
export function init() {
  if (_state.ready) return Promise.resolve();
  if (!_initPromise) _initPromise = initialize().finally(() => { _initPromise = null; });
  return _initPromise;
}
async function initialize() {
  _runtimeUnsub = window.electronAPI?.companyRuntime?.onStatus?.(value => {
    _state.runtimeError = value.status === 'error' ? value.message : '';
    if (value.status === 'error') { _streamRecords.clear(); _state.activeStreams = {}; }
    if (_state.activeId) void refreshActive();
  });
  try {
    if (window.electronAPI?.companyRuntime) {
      _state.companies = await svc.listCompanies();
      // Saved work stays available while the executor starts or recovers.
      void svc.bootAll().then(companies => { _state.companies = companies; }).catch(error => { _state.runtimeError = error.message; });
    } else _state.companies = await svc.bootAll();
  }
  catch (error) {
    _state.runtimeError = error.message;
    _state.companies = await svc.listCompanies();
  }
  _state.ready = true;

  // Re-subscribe to audit changes — auto-refresh the active view
  _auditUnsub = svc.onAuditChange(() => {
    const generation = ++_auditGeneration;
    clearTimeout(_auditRefreshTimer);
    _auditRefreshTimer = setTimeout(() => {
      _auditRefreshTimer = null;
      if (_state.activeId && _refreshCoveredGeneration < generation) void refreshActive();
    }, 120);
  });

  _gmaoUnsub = svc.onGmaoChange?.(({ companyId }) => {
    if (_state.activeId && (!companyId || _state.activeId === companyId)) refreshGmao(_state.activeId);
  });
  _issuesUnsub = window.electronAPI?.db?.issues?.onChanged?.(({ companyId }) => {
    if (_state.activeId && (!companyId || _state.activeId === companyId)) void refreshActive();
  });
  _catalogUnsub = window.electronAPI?.db?.distribution?.onChanged?.(({ companyId }) => {
    if (_state.activeId && (!companyId || _state.activeId === companyId)) void refreshActive().catch(() => {});
  });
  _intakeUnsub = window.electronAPI?.db?.companyIntake?.onChanged?.(({companyId}) => {
    if (_state.activeId === companyId) void refreshIntakeCount();
  });

  // Bridge the dispatcher's stream bus into the reactive activeStreams
  // map so the live feed renders in-flight LLM thoughts token-by-token.
  _streamUnsub = streamBus.subscribe((ev) => {
    if (ev.type === "begin") {
      _streamRecords.set(ev.streamId, {
        streamId: ev.streamId,
        companyId: ev.companyId,
        role: ev.role,
        action: ev.action,
        response: "",
        startedAt: Date.now(),
      });
      scheduleStreamPublish(true);
    } else if (ev.type === "chunk") {
      const cur = _streamRecords.get(ev.streamId);
      if (!cur) return;
      _streamRecords.set(ev.streamId, { ...cur, response: cur.response + (ev.chunk || "") });
      scheduleStreamPublish();
    } else if (ev.type === "end" || ev.type === "error") {
      _streamRecords.delete(ev.streamId);
      scheduleStreamPublish(true);
    }
  });
}

export function teardown() {
  _catalogUnsub?.(); _catalogUnsub = null;
  _intakeUnsub?.(); _intakeUnsub = null;
  _state.ready = false;
  clearTimeout(_auditRefreshTimer);
  _auditRefreshTimer = null;
  clearTimeout(_streamFlushTimer);
  _streamFlushTimer = null;
  _streamRecords.clear();
  _state.activeStreams = {};
  if (_auditUnsub) _auditUnsub();
  _auditUnsub = null;
  if (_streamUnsub) _streamUnsub();
  _streamUnsub = null;
  if (_gmaoUnsub) _gmaoUnsub();
  _gmaoUnsub = null;
  if (_issuesUnsub) _issuesUnsub();
  _issuesUnsub = null;
  if (_runtimeUnsub) _runtimeUnsub();
  _runtimeUnsub = null;
}

export async function retryRuntime() {
  try { _state.companies = await svc.bootAll(); _state.runtimeError = ''; }
  catch (error) { _state.runtimeError = error.message; }
}

// ─────────────────────────────────────────────────────────────────────────
// Selection
// ─────────────────────────────────────────────────────────────────────────

export async function setActive(id) {
  const selectionRevision = ++_selectionRevision;
  if (_state.activeId !== id) {
    _state.inspectedDemo = null;
    clearActiveSnapshot();
  }
  _state.activeId = id;
  _gmaoRevision++;
  _state.gmaoRefreshError = '';
  const charter = id ? await svc.getCompany(id) : null;
  if (selectionRevision !== _selectionRevision) return;
  _state.inspectedDemo = charter?.demoRun ? charter : null;
  _state.intakeReviewCount = 0; _state.intakeError = "";
  try { await refreshActive(); } catch (error) {
    if (selectionRevision === _selectionRevision) _state.gmaoRefreshError = error.message;
  }
}

export const activeCompany = computed(() =>
  _state.companies.find((c) => c.id === _state.activeId) || (_state.inspectedDemo?.id === _state.activeId ? _state.inspectedDemo : null),
);

// ─────────────────────────────────────────────────────────────────────────
// Refresh — pulls fresh data for the currently active company
// ─────────────────────────────────────────────────────────────────────────

function clearActiveSnapshot() {
  _state.audit = []; _state.approvals = []; _state.catalog = []; _state.catalogError = "";
  _state.intakeReviewCount = 0; _state.intakeError = '';
  _state.treasuryState = null; _state.queueDepths = {};
  _state.issues = [];
  _state.issueCounts = { total: 0, open: 0, in_progress: 0, blocked: 0, done: 0, cancelled: 0 };
  _state.goals = [];
  _state.goalCounts = { total: 0, active: 0, completed: 0, cancelled: 0 };
  _state.connectors = [];
  _state.connectorHealth = { total: 0, active: 0, needs_auth: 0, expired: 0, broken: 0, revoked: 0 };
  _state.automation = { state: null, health: { level: "idle", label: "Ready", detail: "No run recorded yet" } };
  _state.gmao = null;
  _state.summary = { total: 0, executed: 0, vetoed: 0, queued: 0, proposed: 0, error: 0, spend: 0, revenue: 0 };
}

async function loadActiveSnapshot() {
  const id = _state.activeId;
  const selectionRevision = _selectionRevision;
  void refreshIntakeCount();
  const gmaoRevision = _gmaoRevision;
  _refreshCoveredGeneration = _auditGeneration;
  if (!id) {
    clearActiveSnapshot();
    return;
  }
  const selected = activeCompany.value;
  const isHvac = selected?.template?.id === "hvac_residential" || selected?.workspace?.channels?.some(channel => (channel.view || channel.value) === "gmao");
  const [audit, approvals, catalog, treasuryState, depths, summary, charter, issues, issueCounts, goals, goalCounts, conns, connHealth, automation, gmao] =
    await Promise.all([
      svc.recentAudit(id, 200),
      svc.pendingApprovals(id),
      (async () => {
        try {
          const read = window.electronAPI?.db?.distribution?.listCatalog;
          const rows = read ? await read(id) : await svc.listCatalog(id);
          if (!Array.isArray(rows)) throw new Error('Invalid result list');
          return { rows, error: '' };
        } catch { return { rows: null, error: 'Saved results could not be loaded. Retry to reconnect to your local library.' }; }
      })(),
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
      svc.getAutomationStatus(id),
      isHvac ? svc.getGmaoSnapshot(id) : Promise.resolve(null),
    ]);
  if (_state.activeId !== id || selectionRevision !== _selectionRevision) return;
  _state.audit = audit;
  _state.approvals = approvals;
  if (catalog.rows) _state.catalog = catalog.rows;
  _state.catalogError = catalog.error;
  _state.treasuryState = treasuryState;
  _state.queueDepths = depths;
  _state.summary = summary;
  _state.issues = issues;
  _state.issueCounts = issueCounts;
  _state.goals = goals;
  _state.goalCounts = goalCounts;
  _state.connectors = conns;
  _state.connectorHealth = connHealth;
  _state.automation = automation;
  if (gmaoRevision === _gmaoRevision) { _state.gmao = gmao; _state.gmaoRefreshError = ''; }
  // Replace the in-list charter with the freshest copy.
  if (charter) {
    const idx = _state.companies.findIndex((c) => c.id === id);
    if (idx >= 0) _state.companies[idx] = charter;
    else if (charter.demoRun) _state.inspectedDemo = charter;
  }
}

export function refreshActive() {
  _refreshRequested = true;
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    while (_refreshRequested) {
      _refreshRequested = false;
      const selectionRevision = _selectionRevision;
      try { await loadActiveSnapshot(); } catch (error) {
        if (selectionRevision !== _selectionRevision) continue;
        _state.gmaoRefreshError = error.message || 'Unable to load operational data.';
        throw error;
      }
    }
  })().finally(() => {
    _refreshPromise = null;
  });
  return _refreshPromise;
}

export async function refreshList() {
  _state.companies = await svc.listCompanies();
  if (_state.activeId && !_state.inspectedDemo && !_state.companies.some(c => c.id === _state.activeId)) await setActive(_state.companies[0]?.id || null);
}

export async function loadAllTeamWork() {
  const companies = await svc.listCompanies();
  return Promise.all(companies.map(async (company) => {
    const [issues, goals, approvals, catalog, summary, depths, audit] = await Promise.all([
      svc.listIssues(company.id),
      svc.listGoals(company.id),
      svc.pendingApprovals(company.id),
      svc.listCatalog(company.id),
      svc.summarizeAudit(company.id),
      svc.getQueueDepths(company.id),
      svc.recentAudit(company.id, 120),
    ]);
    return { company, issues, goals, approvals, catalog, summary, queueDepths: depths, audit };
  }));
}

export async function createGoalForCompany(companyId, input) {
  const goal = await svc.createGoal(companyId, plain(input));
  if (_state.activeId === companyId) await refreshActive();
  return goal;
}

export async function tickCompanyNow(companyId) {
  const result = await svc.tickNow(companyId);
  if (_state.activeId === companyId) await refreshActive();
  return result;
}

export async function tickRoleForCompany(companyId, roleKey) {
  const result = await svc.tickRoleNow(companyId, roleKey);
  if (_state.activeId === companyId) await refreshActive();
  return result;
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
  _streamRecords.set(streamId, { ...meta, response: "", startedAt: Date.now(), streamId });
  scheduleStreamPublish(true);
}
/** Append a chunk to an active stream, publishing at most once per frame window. */
export function appendStream(streamId, chunk) {
  const cur = _streamRecords.get(streamId);
  if (!cur) return;
  _streamRecords.set(streamId, { ...cur, response: cur.response + chunk });
  scheduleStreamPublish();
}
/** Remove a stream after the final audit entry has been written. */
export function endStream(streamId) {
  if (!_streamRecords.has(streamId)) return;
  _streamRecords.delete(streamId);
  scheduleStreamPublish(true);
}

// ─────────────────────────────────────────────────────────────────────────
// Audit (live feed) — clear without dissolving
// ─────────────────────────────────────────────────────────────────────────

export async function clearAudit() {
  if (!_state.activeId) return;
  await svc.clearAudit(_state.activeId);
  await refreshActive();
}
export async function removeAuditEntry(entryId) {
  if (!_state.activeId) return false;
  const ok = await svc.removeAuditEntry(_state.activeId, entryId);
  await refreshActive();
  return ok;
}
export async function clearCatalog() {
  if (!_state.activeId) return;
  await svc.clearCatalog(_state.activeId);
  await refreshActive();
}
export async function removeContent(contentId) {
  if (!_state.activeId) return false;
  const ok = await svc.removeContent(_state.activeId, contentId);
  await refreshActive();
  return ok;
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

export async function createConnectorForCompany(companyId, input) {
  const connector = await svc.createConnector(companyId, plain(input));
  if (_state.activeId === companyId) await refreshActive();
  return connector;
}
export async function setConnectorSecret(connId, secret, patch = {}) {
  if (!_state.activeId) return null;
  const c = await svc.setConnectorSecret(_state.activeId, connId, plain(secret), plain(patch));
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
export async function approveMany(pendingIds) {
  if (!_state.activeId) return;
  for (const pendingId of pendingIds || []) {
    await svc.approveAction(_state.activeId, pendingId);
  }
  await refreshActive();
}

export async function reject(pendingId, reason) {
  if (!_state.activeId) return;
  await svc.rejectAction(_state.activeId, pendingId, reason);
  await refreshActive();
}
export async function rejectMany(pendingIds, reason) {
  if (!_state.activeId) return;
  for (const pendingId of pendingIds || []) {
    await svc.rejectAction(_state.activeId, pendingId, reason);
  }
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

// ─────────────────────────────────────────────────────────────────────────
// HVAC GMAO
// ─────────────────────────────────────────────────────────────────────────

// Operational records can refresh independently of model/runtime telemetry and
// the other dashboard services. Coalesce events, without making a submitted
// form wait for an unrelated read or a continuously active team's event stream.
function refreshGmao(companyId) {
  const current = _gmaoRefreshes.get(companyId);
  if (current) { current.requested = true; return; }
  const request = { requested: false };
  const revision = _gmaoRevision;
  _gmaoRefreshes.set(companyId, request);
  Promise.resolve().then(() => svc.getGmaoSnapshot(companyId)).then(snapshot => {
    if (_state.activeId === companyId && revision === _gmaoRevision) {
      _state.gmao = snapshot;
      _state.gmaoRefreshError = '';
    }
  }).catch(error => {
    if (_state.activeId === companyId && revision === _gmaoRevision) {
      _state.gmaoRefreshError = error?.message || String(error);
    }
  }).finally(() => {
    _gmaoRefreshes.delete(companyId);
    if (request.requested && _state.activeId === companyId) refreshGmao(companyId);
  });
}

async function gmaoRead(action) {
  const companyId = _state.activeId;
  if (!companyId) throw new Error('Select a team before opening its operational records.');
  return action(companyId);
}

async function gmaoAction(action, collection) {
  const companyId = _state.activeId;
  if (!companyId) throw new Error('Select a team before saving its operational records.');
  // This result is the actual persistence receipt, never an optimistic save.
  const result = await action(companyId);
  if (_state.activeId === companyId) {
    _gmaoRevision++;
    if (collection && result?.id && _state.gmao) {
      const rows = _state.gmao[collection] || [];
      _state.gmao = { ..._state.gmao, [collection]: rows.some(row => row.id === result.id)
        ? rows.map(row => row.id === result.id ? result : row)
        : [result, ...rows] };
    }
    refreshGmao(companyId);
  }
  return result;
}

export const saveGmaoClient = (...args) => gmaoAction((id) => svc.saveGmaoClient(id,...args.map(plain)), 'clients');
export const saveGmaoServiceContract = (...args) => gmaoAction((id) => svc.saveGmaoServiceContract(id,...args.map(plain)), 'serviceContracts');
export const saveGmaoSupplier = (...args) => gmaoAction((id) => svc.saveGmaoSupplier(id,...args.map(plain)), 'suppliers');
export const acknowledgeGmaoHandoff = (...args) => gmaoAction((id) => svc.acknowledgeGmaoHandoff(id,...args.map(plain)));
export const saveGmaoOutbox = (...args) => gmaoAction((id) => svc.saveGmaoOutbox(id,...args.map(plain)), 'outbox');
export const resolveGmaoOutbox = (...args) => gmaoAction((id) => svc.resolveGmaoOutbox(id,...args.map(plain)));
export const getGmaoDossier = (...args) => gmaoRead((id) => svc.getGmaoDossier(id,...args.map(plain)));
export const searchGmaoWorkOrders = (...args) => gmaoRead((id) => svc.searchGmaoWorkOrders(id,...args.map(plain)));
export const generateGmaoDocument = (...args) => gmaoAction((id) => svc.generateGmaoDocument(id,...args.map(plain)));
export const sendGmaoOutbox = (...args) => gmaoAction((id) => svc.sendGmaoOutbox(id,...args.map(plain)));
export const checkGmaoDelivery = (...args) => gmaoAction((id) => svc.checkGmaoDelivery(id,...args.map(plain)));
export const saveGmaoContract = (input) => gmaoAction((id) => svc.saveGmaoContract(id, plain(input)));
export const saveGmaoSite = (input) => gmaoAction((id) => svc.saveGmaoSite(id, plain(input)), 'sites');
export const saveGmaoAsset = (input) => gmaoAction((id) => svc.saveGmaoAsset(id, plain(input)), 'assets');
export const importGmaoAssets = (rows) => gmaoAction((id) => svc.importGmaoAssets(id, plain(rows)));
export const saveGmaoPlan = (input) => gmaoAction((id) => svc.saveGmaoPlan(id, plain(input)), 'plans');
export const createGmaoWorkOrder = (input) => gmaoAction((id) => svc.createGmaoWorkOrder(id, plain(input)), 'workOrders');
export const updateGmaoWorkOrder = (workOrderId, input) => gmaoAction((id) => svc.updateGmaoWorkOrder(id, workOrderId, plain(input)), 'workOrders');
export const transitionGmaoWorkOrder = (workOrderId, status, input) => gmaoAction((id) => svc.transitionGmaoWorkOrder(id, workOrderId, status, plain(input)), 'workOrders');
export const addGmaoEvent = (workOrderId, input) => gmaoAction((id) => svc.addGmaoEvent(id, workOrderId, plain(input)));
export const recordGmaoAttachmentSheet = (workOrderId, input) => gmaoAction((id) => svc.recordGmaoAttachmentSheet(id, workOrderId, plain(input)));
export const saveGmaoProcurement = (input) => gmaoAction((id) => svc.saveGmaoProcurement(id, plain(input)), 'procurements');
export const saveGmaoNotification = (input) => gmaoAction((id) => svc.saveGmaoNotification(id, plain(input)), 'notifications');
export const saveGmaoDocumentFile = (file, input) => gmaoAction((id) => svc.saveGmaoDocumentFile(id, file, plain(input)));
export const saveGmaoCompliance = (input) => gmaoAction((id) => svc.saveGmaoCompliance(id, plain(input)), 'compliance');
export const saveGmaoSubcontractor = (input) => gmaoAction((id) => svc.saveGmaoSubcontractor(id, plain(input)), 'subcontractors');
export const saveGmaoRate = (input) => gmaoAction((id) => svc.saveGmaoRate(id, plain(input)), 'rates');
export const createGmaoQuote = (workOrderId, input) => gmaoAction((id) => svc.createGmaoQuote(id, workOrderId, plain(input)));
export const updateGmaoQuote = (quoteId, input) => gmaoAction((id) => svc.updateGmaoQuote(id, quoteId, plain(input)));
export const validateGmaoProcessStep = (workOrderId, input) => gmaoAction(id => svc.validateGmaoProcessStep(id, workOrderId, plain(input)));
export const recordGmaoServiceAcceptance = (workOrderId, input) => gmaoAction((id) => svc.recordGmaoServiceAcceptance(id, workOrderId, plain(input)));
export const saveGmaoInvoice = (input) => gmaoAction((id) => svc.saveGmaoInvoice(id, plain(input)), 'invoices');
export const saveGmaoOnCallShift = (input) => gmaoAction((id) => svc.saveGmaoOnCallShift(id, plain(input)), 'onCall');
export const generateGmaoPreventive = () => gmaoAction((id) => svc.generateGmaoPreventive(id, Date.now()));
export const evaluateGmaoSla = () => gmaoAction((id) => svc.evaluateGmaoSla(id, Date.now()));
export const ingestGmaoDocumentFile = (file, input = {}) => gmaoAction((id) => svc.ingestGmaoDocumentFile(id, file, plain(input)));
export const applyGmaoDocumentIntake = (intakeId, input = {}) => gmaoAction((id) => svc.applyGmaoDocumentIntake(id, intakeId, plain(input)));
export const resolveGmaoRecommendation = (recommendationId, status, input = {}) => gmaoAction((id) => svc.resolveGmaoRecommendation(id, recommendationId, status, plain(input)));
export const recommendGmaoSchedule = (workOrderId, candidates) => gmaoAction((id) => svc.recommendGmaoSchedule(id, workOrderId, plain(candidates)));
export const recordGmaoAssetSignal = (assetId, input) => gmaoAction((id) => svc.recordGmaoAssetSignal(id, assetId, plain(input)));
export const saveGmaoBillingLine = (input) => gmaoAction((id) => svc.saveGmaoBillingLine(id, plain(input)));
export const reconcileGmaoBilling = (workOrderId) => gmaoAction((id) => svc.reconcileGmaoBilling(id, workOrderId));
export const runGmaoAutomation = () => gmaoAction((id) => svc.runGmaoAutomation(id, Date.now()));
export async function exportGmaoWeeklyRegister(options = {}) {
  if (!_state.activeId) return null;
  const result = await svc.exportGmaoWeeklyRegister(_state.activeId, plain(options));
  svc.downloadGmaoCsv(result);
  return result;
}
export async function exportGmaoInventory() {
  if (!_state.activeId) return null;
  const result = await svc.exportGmaoInventory(_state.activeId);
  svc.downloadGmaoCsv(result);
  return result;
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
  init, retryRuntime,
  teardown,
  refreshActive,
  refreshList,
  loadAllTeamWork,
  createGoalForCompany,
  tickCompanyNow,
  tickRoleForCompany,
  setActive,
  form,
  update,
  pause,
  resume,
  dissolve,
  tickNow,
  tickRoleNow,
  approve,
  approveMany,
  reject,
  rejectMany,
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
  // HVAC GMAO
  saveGmaoClient,
  saveGmaoServiceContract,
  saveGmaoSupplier,
  acknowledgeGmaoHandoff,
  saveGmaoOutbox,
  resolveGmaoOutbox,
  getGmaoDossier,
  searchGmaoWorkOrders,
  generateGmaoDocument,
  sendGmaoOutbox,
  checkGmaoDelivery,
  saveGmaoContract,
  saveGmaoSite,
  saveGmaoAsset,
  importGmaoAssets,
  saveGmaoPlan,
  createGmaoWorkOrder,
  updateGmaoWorkOrder,
  transitionGmaoWorkOrder,
  addGmaoEvent,
  recordGmaoAttachmentSheet,
  saveGmaoProcurement,
  saveGmaoNotification,
  saveGmaoDocumentFile,
  saveGmaoCompliance,
  saveGmaoSubcontractor,
  saveGmaoRate,
  createGmaoQuote,
  updateGmaoQuote,
  validateGmaoProcessStep,
  recordGmaoServiceAcceptance,
  saveGmaoInvoice,
  saveGmaoOnCallShift,
  generateGmaoPreventive,
  evaluateGmaoSla,
  exportGmaoWeeklyRegister,
  exportGmaoInventory,
  // templates
  formFromTemplate,
  listTemplates,
  getTemplate,
  previewTemplate,
  // audit
  clearAudit,
  removeAuditEntry,
  // production catalog
  clearCatalog,
  removeContent,
  // streaming
  beginStream, appendStream, endStream,
  // connectors
  createConnector,
  createConnectorForCompany,
  setConnectorSecret,
  revokeConnector,
  removeConnector,
};

export default companyStore;
