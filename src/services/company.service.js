import { clearCompanyDrafts } from './company/viewDrafts.js';
/**
 * BonzAI Company — top-level service facade
 *
 * The Vue store talks ONLY to this file. It hides the internal split
 * across charter / dispatcher / heartbeat / treasury / governance /
 * distribution / portability so we can refactor any of those without
 * touching the UI.
 */

import {
  makeCharter,
  validateCharter,
  ROLE_LIBRARY,
  resolveRoleCompanion,
  effectiveRoleBudget,
  vetoModeFor,
  VETO_MODES,
  ACTION_CLASSES,
  CURRENCIES,
} from "./company/charter.js";
import * as audit from "./company/auditLog.js";
import * as treasury from "./company/treasury.solo.js";
import * as gov from "./company/governance.solo.js";
import * as dist from "./company/distribution.solo.js";
import * as issues from "./company/issues.js";
import * as goalsSvc from "./company/goals.js";
import * as gmao from "./company/gmao.js";
import * as scheduler from "./company/heartbeat.js";
import { operationalCharter } from './company/operationalCharter.js';
import * as automationRuntime from "./company/automationRuntime.js";
import * as port from "./company/portability.js";
import * as connectors from "./company/connectors.js";
import * as packs from "./company/skillPacks.js";
import * as templates from "./company/templates.js";
import { SKILL_MANIFESTS, listManifests } from "./company/skillManifests.js";
import { dispatchAction, queueDepths, clearQueues } from "./company/dispatcher.js";
import { memoryService } from "./memory.service.js";

const nativeRuntime = () => !window.__BONZAI_COMPANY_RUNTIME__ && window.electronAPI?.companyRuntime;
async function schedule(method, charterOrId) {
  const remote = nativeRuntime();
  if (remote) return remote.invoke(method === 'stop' ? 'stop' : 'start', [typeof charterOrId === 'string' ? charterOrId : charterOrId.id]);
  return scheduler[method](charterOrId);
}

// ─────────────────────────────────────────────────────────────────────────
// Persistence — SQLite-backed via electronAPI.db.companies.* with a
// safe legacy-store fallback when the data layer isn't up.
// ─────────────────────────────────────────────────────────────────────────

const INDEX_KEY = "companies/index";              // legacy fallback
const CHARTER_KEY = (id) => `companies/${id}/charter`;
const _api = () => window.electronAPI?.db?.companies || null;
let _warnedDb = false;
function _warnDbOnce(err) {
  if (_warnedDb) return;
  _warnedDb = true;
  console.warn(
    "[companies] data layer not reachable — charter persistence falling " +
    "back to legacy electron-store path. Run `npm install` and restart. " +
    "Error: " + (err?.message || err || "no IPC handler"),
  );
}

async function _readIndex() {
  const api = _api();
  if (api) {
    try { return await api.listIds(); }
    catch (err) { _warnDbOnce(err); }
  }
  return (await window.electronAPI?.store?.get?.(INDEX_KEY, [])) || [];
}
async function _writeIndex(_ids) {
  // SQLite path doesn't need an explicit index — listIds derives from the
  // companies table. Legacy fallback still writes the index key so users
  // who haven't migrated yet retain the previous behavior.
  if (!_api()) {
    await window.electronAPI?.store?.set?.(INDEX_KEY, _plain(_ids));
  }
}
async function _saveCharter(charter) {
  const api = _api();
  if (!api) throw new Error('Company storage is unavailable. Restart the app before changing this company.');
  await api.save(_plain(charter));
}
async function _loadCharter(id) {
  const api = _api();
  if (api) {
    try { return await api.get(id); }
    catch (err) { _warnDbOnce(err); }
  }
  return window.electronAPI?.store?.get?.(CHARTER_KEY(id), null);
}
async function _deleteCharter(id) {
  const api = _api();
  if (!api) throw new Error('Company storage is unavailable. No company was deleted.');
  await api.remove(id);
  clearCompanyDrafts(id);
  await window.electronAPI?.store?.delete?.(CHARTER_KEY(id));
}

/**
 * Strip Vue reactivity proxies + class instances. Electron IPC uses the
 * structured-clone algorithm, which throws "could not be cloned" on
 * Proxy objects. JSON round-trip gives us pure plain data — fine for
 * our charters since they're plain JSON anyway (no Dates, no functions,
 * no symbols). Without this, calling formCompany() with a `reactive()`
 * cfg object fails at the first store.set IPC call.
 */
function _plain(obj) {
  if (obj == null) return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Public API — used by the store + the Vue components
// ─────────────────────────────────────────────────────────────────────────

/** List every saved company (charters loaded). */
export async function listCompanies() {
  const ids = await _readIndex();
  const out = [];
  for (const id of ids) {
    const c = await _loadCharter(id);
    if (c && !c.demoRun) out.push(c);
  }
  return out;
}

/** Load a single charter. */
export async function getCompany(id) {
  return _loadCharter(id);
}

/** Form a new company from a partial config. Persists + starts the heartbeat. */
export async function formCompany(cfg) {
  // Local teams are free: no wallet, NFT, subscription or stake check belongs here.
  // Strip Vue reactivity proxies BEFORE the data enters the engine — the
  // form passes a `reactive()` object and downstream IPC calls would
  // otherwise blow up with "could not be cloned."
  const charter = operationalCharter(makeCharter(_plain(cfg)));
  const v = validateCharter(charter);
  if (!v.ok) throw new Error("invalid charter: " + v.errors.join("; "));
  await _saveCharter(charter);
  const ids = await _readIndex();
  if (!ids.includes(charter.id)) {
    ids.push(charter.id);
    await _writeIndex(ids);
  }
  await audit.append(charter.id, {
    kind: "system", role: null, action: "formCompany", status: "executed",
    note: `formed "${charter.name}" in ${charter.mode} mode`,
  });
  await _seedTeamMemory(charter, "formed");
  await _registerPoolModels(charter);
  await schedule('start', charter);
  return charter;
}

/**
 * Walk the role table and register every distinct LLM the charter
 * declares with the multi-instance pool. The device owns its memory budget.
 *
 * No-op if the renderer doesn't expose pool IPC (older build) or if
 * the charter doesn't declare any per-role llm assignments.
 */
async function _registerPoolModels(charter) {
  if ((await window.electronAPI?.openRouter?.status?.())?.active) return;
  if (!window.electronAPI?.poolRegisterModel) return;
  // Only relevant for parallel mode — sequential / swap go through legacy
  if (charter.execution?.llm?.mode !== "parallel") return;

  // The inference pool belongs to the device. Starting a team must not
  // overwrite the memory budget for every other team and regular chat.

  // Lazy import — avoid pulling flagship.js into every code path
  const { LLM_BASE_MODELS, resolveLLM } = await import("../skills/flagship.js");
  const seen = new Set();
  for (const assignment of Object.values(charter.roles || {})) {
    const llmKey = assignment?.llm;
    if (!llmKey || seen.has(llmKey)) continue;
    seen.add(llmKey);
    // llm key format: "llm_<baseKey>" or "llm_<baseKey>_<tier>"
    const m = llmKey.match(/^llm_(.+?)(?:_q(\d+))?$/);
    if (!m) continue;
    const baseKey = m[1];
    const tier = m[2] ? `q${m[2]}` : "q4";
    const resolved = resolveLLM(baseKey, tier);
    if (!resolved?.filename) continue;
    try {
      // Pass the full resolved spec — main.js's IPC runs the same
      // memory-aware context heuristic the singleton uses, picking a
      // safe ctxSize per (model × system).
      await window.electronAPI.poolRegisterModel({
        modelKey: llmKey,
        filename: resolved.filename,
        sizeBytes: resolved.filesizeBytes || (resolved.size?.includes?.("GB")
          ? Math.round(parseFloat(resolved.size) * 1024 ** 3)
          : null),
        parameters: resolved.parameters || null,
        activeParameters: resolved.activeParameters || null,
        isMoE: resolved.isMoE || false,
        context: resolved.context || null,
        parallelSlots: resolved.parallelSlots || 1,
        chatTemplate: resolved.chatTemplate || null,
      });
    } catch (err) {
      console.warn(`[company] pool register failed for ${llmKey}:`, err.message);
    }
  }
}

function _charterMemoryText(charter) {
  const roles = Object.entries(charter.roles || {})
    .map(([roleKey, assignment]) => `${roleKey}: ${assignment.companion || "unassigned"}`)
    .join("; ");
  const systems = (charter.businessContext?.systemsOfRecord || charter.pendingConnectors || [])
    .filter(Boolean)
    .join(", ");
  const goals = (charter.initialGoals || []).filter(Boolean).join(" | ");
  return [
    `Mission: ${charter.mission}`,
    `Operating mode: ${charter.operatingMode || "assist_existing_business"}`,
    `Non-replacement policy: ${charter.businessContext?.nonReplacementPolicy || ""}`,
    `Approval policy: ${charter.businessContext?.approvalPolicy || ""}`,
    systems ? `Systems of record: ${systems}` : "",
    roles ? `Staffed roles: ${roles}` : "",
    goals ? `Initial goals: ${goals}` : "",
  ].filter(Boolean).join("\n");
}

async function _seedTeamMemory(charter, reason = "charter") {
  if (charter.teamMemory?.enabled === false) return;
  const stamp = charter.updatedAt || charter.createdAt || Date.now();
  try {
    await memoryService.ingestTeamMemory(charter, {
      sourceId: `company:${charter.id}:${reason}:${stamp}`,
      type: "company_charter",
      recordId: charter.id,
      company: charter.name,
      project: charter.name,
      text: _charterMemoryText(charter),
      summary: `Agentic team charter for ${charter.name}`,
      noteKind: reason === "formed" ? "team_setup" : "team_update",
      createdAt: new Date(stamp).toISOString(),
    });
    for (const [roleKey, assignment] of Object.entries(charter.roles || {})) {
      const def = ROLE_LIBRARY[roleKey];
      await memoryService.ingestTeamRoleMemory(charter, roleKey, {
        sourceId: `company:${charter.id}:role:${roleKey}:${stamp}`,
        type: "team_role_assignment",
        recordId: `${charter.id}:${roleKey}`,
        company: charter.name,
        project: charter.name,
        companionName: assignment.companion || roleKey,
        skill: roleKey,
        text: `${roleKey} is staffed by ${assignment.companion || "an unassigned companion"}. ${def?.description || ""} Connectors: ${(assignment.connectors || []).join(", ") || "none yet"}. All available agent workflows can be used as needed. Existing integration permissions: ${(assignment.grantedSkills || []).join(", ") || "none"}.`,
        summary: `${roleKey} role memory seed for ${charter.name}`,
        noteKind: "role_setup",
        createdAt: new Date(stamp).toISOString(),
      });
    }
  } catch (err) {
    console.warn("[company] team memory seed failed:", err?.message || err);
  }
}

/** Save edits to an existing charter; restart the scheduler. */
export async function updateCompany(charter) {
  // Same defensive clone as formCompany — Vue may hand us a reactive
  // proxy, which IPC can't clone.
  charter = _plain(charter);
  const v = validateCharter(charter);
  if (!v.ok) throw new Error("invalid charter: " + v.errors.join("; "));
  charter.updatedAt = Date.now();
  await _saveCharter(charter);
  await audit.append(charter.id, {
    kind: "system", role: null, action: "amendCharter", status: "executed",
    note: "owner edited the charter",
  });
  await _seedTeamMemory(charter, "updated");
  await _registerPoolModels(charter);
  await schedule('updateCharter', charter);
  return charter;
}

/** Pause a company (heartbeat keeps running but no-ops). */
export async function pauseCompany(id) {
  const c = await _loadCharter(id);
  if (!c) throw new Error("not found");
  c.status = "paused";
  c.updatedAt = Date.now();
  await _saveCharter(c);
  await schedule('stop', id);
  await audit.append(id, { kind: "system", action: "pause", status: "executed" });
  return c;
}

/** Resume a paused company. */
export async function resumeCompany(id) {
  const previous = await _loadCharter(id);
  if (!previous) throw new Error("not found");
  const c = operationalCharter(previous);
  c.status = "active";
  c.updatedAt = Date.now();
  await _saveCharter(c);
  await audit.append(id, { kind: "system", action: "resume", status: "executed" });
  await schedule('start', c);
  return c;
}

/** Permanently dissolve. Wipes all per-company state. */
export async function dissolveCompany(id) {
  await schedule('stop', id);
  await _deleteCharter(id);
  await audit.clear(id);
  await treasury.reset(id);
  await gov.clear(id);
  await dist.clear(id);
  await issues.clear(id);
  await goalsSvc.clear(id);
  await automationRuntime.clear(id);
  await connectors.clear(id);
  await clearQueues(id);
  const ids = (await _readIndex()).filter((x) => x !== id);
  await _writeIndex(ids);
  return true;
}

/** Boot every saved company. Call once on app start. */
export async function bootAll() {
  if (nativeRuntime()) return nativeRuntime().invoke('boot', []);
  const list = await listCompanies();
  for (let index = 0; index < list.length; index++) {
    let c = list[index];
    if (c.template?.id === "hvac_residential" && c.template?.version !== "3.0-operations") {
      c = await _upgradeHvacCharter(c);
      list[index] = c;
    }
    if (c.status === "active") {
      const upgraded = operationalCharter(c);
      if (upgraded !== c) { c = upgraded; await _saveCharter(c); list[index] = c; }
      await _registerPoolModels(c);
      scheduler.start(c);
    }
  }
  return list;
}

async function _upgradeHvacCharter(charter) {
  const { draft } = templates.applyTemplate("hvac_residential", {
    businessName: charter.name,
    metro: charter.businessContext?.territory || "ses clients",
  }, { name: charter.name, demoMode: charter.demoMode === true });
  const roles = { ...(charter.roles || {}) };
  for (const [roleKey, defaults] of Object.entries(draft.roles || {})) {
    const current = roles[roleKey];
    roles[roleKey] = current
      ? { ...defaults, ...current, grantedSkills: [...new Set([...(current.grantedSkills || []), ...(defaults.grantedSkills || [])])] }
      : defaults;
  }
  const upgraded = {
    ...charter,
    roles,
    grantedSkills: [...new Set([...(charter.grantedSkills || []), ...(draft.grantedSkills || [])])],
    skillPacks: [...new Set([...(charter.skillPacks || []), ...(draft.skillPacks || [])])],
    initialGoals: [...new Set([...(charter.initialGoals || []), ...(draft.initialGoals || [])])],
    rules: {
      ...(charter.rules || {}),
      vetoMode: { ...(charter.rules?.vetoMode || {}), ...(draft.rules?.vetoOverrides || {}) },
    },
    template: { ...(charter.template || {}), id: "hvac_residential", version: "3.0-operations", upgradedAt: Date.now() },
    updatedAt: Date.now(),
  };
  await _saveCharter(upgraded);
  await gmao.ensure(upgraded.id, { name: "Maintenance clients", holderName: upgraded.name });
  await audit.append(upgraded.id, {
    kind: "system", role: null, action: "upgradeHvacGmao", status: "executed",
    note: "équipe HVAC mise à niveau vers les opérations maintenance et achats v3",
  });
  return upgraded;
}

// ─────────────────────────────────────────────────────────────────────────
// Treasury bookkeeping (manual entries the owner can record from the UI)
// ─────────────────────────────────────────────────────────────────────────

export const recordRevenue = (id, opts) => treasury.recordRevenue(id, opts);
export const paySupplier = (id, opts) => treasury.paySupplier(id, opts);
export const getTreasuryState = (id) => treasury.getState(id);

// ─────────────────────────────────────────────────────────────────────────
// Approvals queue
// ─────────────────────────────────────────────────────────────────────────

export const pendingApprovals = (id) => gov.pending(id);

export async function requestSmartAgentJobAction(id, action) {
  if (!['smartAgent.acceptJob', 'smartAgent.submitResult', 'smartAgent.withdrawEarnings'].includes(action?.type) || !action.agentId || !action.jobId) throw new Error('Choose a smart agent and an existing job.');
  const charter = await _loadCharter(id);
  const result = await gov.gateAction(id, charter, _plain(action), { role: 'CEO', companion: action.agentId });
  if (!result.queued) throw new Error(result.error || 'The approval could not be saved. No transaction was sent.');
  return result;
}

/**
 * Approve a queued action and immediately dispatch it.
 *
 * The dispatcher's tickRole runs the governance gate; this path bypasses
 * tickRole entirely (we already have the approved action), so no re-gate
 * is needed. We pass `pendingId` through so the action's audit entry
 * cross-references the original approval — the live feed shows the trail
 * without the user having to scroll.
 */
export async function approveAction(id, pendingId) {
  if (nativeRuntime()) return nativeRuntime().invoke('approve', [id, pendingId]);
  const charter = await _loadCharter(id);
  const pending = (await gov.pending(id)).find(item => item.id === pendingId);
  if (!pending) throw new Error('This action is no longer waiting for approval.');
  if (pending.issueId) {
    const { resumeApprovedTask } = await import('./company/dispatcher.js');
    return resumeApprovedTask(charter, pending);
  }
  if (charter.status !== 'active') throw new Error('Resume the company before approving execution.');
  const action = await gov.approve(id, pendingId);
  if (!action) throw new Error('The approval could not be recorded. No action was executed.');
  const { resolveRoleCompanion: r } = await import("./company/charter.js");
  const roleKey = pending.role || 'CEO';
  const assigned = r(charter, roleKey);
  return dispatchAction(charter, roleKey, pending.requestedBy || assigned?.companion, action, { pendingId });
}

export const rejectAction = (id, pendingId, reason) => gov.reject(id, pendingId, reason);

// ─────────────────────────────────────────────────────────────────────────
// Audit + production catalog
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Goals — the unit of intent (parent of issues)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a goal AND its child issues atomically. Owner-side equivalent
 * of what the CEO heartbeat does autonomously.
 *
 * @param {string} companyId
 * @param {object} input  { title, rationale?, missionAlignment?, deadline?,
 *                          tasks?: Array<{ title, description?, assigneeRole?,
 *                          priority? }> }
 */
export async function createGoal(companyId, input) {
  const clean = _plain(input);
  const charter = await _loadCharter(companyId);
  const maxAttempts = charter?.automation?.maxAttempts || 3;
  const goalInput = {
    title: clean.title,
    rationale: clean.rationale,
    missionAlignment: clean.missionAlignment || clean.rationale,
    deadline: clean.deadline,
    createdBy: "user",
  };
  const tasks = Array.isArray(clean.tasks) && clean.tasks.length
    ? clean.tasks
    : [{
        title: clean.title,
        description: clean.rationale || clean.missionAlignment || "",
        priority: "normal",
      }];
  const { routeGoalToRole, ROLE_LIBRARY } = await import('./company/charter.js');
  const taskInputs = tasks.map(task => {
    const title = String(task.title || '').trim();
    if (!title) throw new Error('Every task needs a title.');
    return { title, description: task.description || '', priority: task.priority || 'normal',
      assigneeRole: task.assigneeRole && ROLE_LIBRARY[task.assigneeRole] ? task.assigneeRole : routeGoalToRole({ directive: title, description: task.description }, charter),
      createdBy: 'user', maxAttempts };
  });
  return goalsSvc.createWithTasks(companyId, goalInput, taskInputs);
}

export const listGoals = (id, filter) => goalsSvc.list(id, _plain(filter));
export const getGoal = (id, goalId) => goalsSvc.get(id, goalId);
export const updateGoal = (id, goalId, patch) => goalsSvc.update(id, goalId, _plain(patch));
export const goalCounts = (id) => goalsSvc.counts(id);

/**
 * Cancel a goal AND every open child issue. Used by the dashboard's
 * "Cancel goal" action.
 */
export async function cancelGoal(companyId, goalId, reason) {
  const goal = await goalsSvc.cancel(companyId, goalId, reason);
  const children = (await issues.list(companyId)).filter((i) => i.goalId === goalId);
  for (const i of children) {
    if (i.status === "done" || i.status === "cancelled") continue;
    try { await issues.update(companyId, i.id, { status: "cancelled" }); } catch {}
  }
  return goal;
}

// ─────────────────────────────────────────────────────────────────────────
// Issues — Paperclip-style task primitive (children of a goal)
// ─────────────────────────────────────────────────────────────────────────

export const createIssue = (id, input) => issues.create(id, _plain(input));
export const listIssues = (id, filter) => issues.list(id, _plain(filter));
export const getIssue = (id, issueId) => issues.get(id, issueId);
export const updateIssue = (id, issueId, patch) => issues.update(id, issueId, _plain(patch));
export const reopenIssue = (id, issueId) => issues.reopen(id, issueId);
export const removeIssue = (id, issueId) => issues.remove(id, issueId);
export const issueCounts = (id) => issues.counts(id);

export const recentAudit = (id, n) => audit.recent(id, n);
export const summarizeAudit = (id, ms) => audit.summarize(id, ms);
export const onAuditChange = audit.onChange;
/**
 * Wipe the company's audit log. Goals, issues, treasury, and catalog are
 * preserved — only the audit history (the live-feed source) is cleared.
 * Used by the "Clear feed" button to start a fresh demo run.
 */
export const clearAudit = (id) => audit.clear(id);
export const removeAuditEntry = (id, entryId) => audit.remove(id, entryId);
export const listCatalog = (id) => dist.listCatalog(id);
export const getContent = (id, contentId) => dist.getRecord(id, contentId);
export const clearCatalog = (id) => dist.clear(id);
export const removeContent = (id, contentId) => dist.remove(id, contentId);

// ─────────────────────────────────────────────────────────────────────────
// Manual heartbeat triggers (UI buttons)
// ─────────────────────────────────────────────────────────────────────────

export async function tickNow(id) {
  if (nativeRuntime()) return nativeRuntime().invoke('tickCEO', [id]);
  const c = await _loadCharter(id);
  if (!c) throw new Error("not found");
  return scheduler.manualCEOTick(c);
}

export async function tickRoleNow(id, roleKey) {
  if (nativeRuntime()) return nativeRuntime().invoke('tickRole', [id, roleKey]);
  const c = await _loadCharter(id);
  if (!c) throw new Error("not found");
  return scheduler.manualRoleTick(c, roleKey);
}

export const getQueueDepths = (id) => queueDepths(id);
export const getAutomationStatus = (id) => automationRuntime.status(id);
export const getAutomationRuns = (id, limit) => automationRuntime.recent(id, limit);

// ─────────────────────────────────────────────────────────────────────────
// Portability
// ─────────────────────────────────────────────────────────────────────────

export async function exportCompany(id, opts) {
  const c = await _loadCharter(id);
  if (!c) throw new Error("not found");
  return port.exportCompany(c, opts);
}

export async function importCompany(bundle, opts) {
  const charter = await port.importCompany(bundle, opts);
  await _saveCharter(charter);
  const ids = await _readIndex();
  if (!ids.includes(charter.id)) {
    ids.push(charter.id);
    await _writeIndex(ids);
  }
  // Restored companies remain paused until the owner reviews them.
  return charter;
}

// ─────────────────────────────────────────────────────────────────────────
// Templates — the "form a company in 90 seconds" path
// ─────────────────────────────────────────────────────────────────────────

export const listTemplates = () => templates.listTemplates();
export const getTemplate = (id) => templates.getTemplate(id);

/**
 * Apply a template + intake answers, build a charter draft, and form a
 * real company from it. Owner overrides (companion picks, name, mode,
 * humanRoster) merge into the draft before validation.
 */
export async function formFromTemplate(templateId, answers, ownerOverrides = {}) {
  const cleanOverrides = _plain(ownerOverrides);
  const { draft } = templates.applyTemplate(templateId, _plain(answers), cleanOverrides);
  // Merge into a charter cfg the existing factory understands.
  const cfg = {
    name: draft.name,
    mission: draft.mission,
    mode: draft.mode,
    template: draft.template,
    operatingMode: draft.operatingMode,
    businessContext: draft.businessContext,
    teamMemory: draft.teamMemory,
    provisioning: draft.provisioning,
    workspace: draft.workspace,
    grantedSkills: draft.grantedSkills,
    pendingConnectors: draft.pendingConnectors,
    skillPacks: draft.skillPacks,
    initialGoals: draft.initialGoals,
    humanRoster: draft.humanRoster,
    roles: draft.roles,
    currency: draft.rules?.currency,
    reserveFloor: draft.rules?.reserveFloor,
    perHeartbeatSpendCap: draft.rules?.perHeartbeatSpendCap,
    vetoMode: { ..._defaultVetoMap(), ...(draft.rules?.vetoOverrides || {}) },
    demoMode: cleanOverrides.demoMode === true,
  };
  const company = await formCompany(cfg);
  if (templateId === "hvac_residential") {
    await gmao.ensure(company.id, {
      name: cleanOverrides.contractName || "Maintenance clients",
      marketNumber: answers?.marketNumber || null,
      holderName: company.name,
      emergencyPhone: answers?.emergencyPhone || null,
      currency: "EUR",
      vatRate: answers?.vatRate ?? 0,
      demoData: cleanOverrides.demoMode === true,
    });
  }
  return company;
}

function _defaultVetoMap() {
  // Rebuild defaults so a template's vetoOverrides can merge over them
  // without depending on charter.js's private factory.
  return {
    "produce.text": VETO_MODES.AUTO,
    "produce.image": VETO_MODES.NOTIFY,
    "produce.audio": VETO_MODES.NOTIFY,
    "produce.video": VETO_MODES.NOTIFY,
    "produce.3d": VETO_MODES.NOTIFY,
    "produce.music": VETO_MODES.NOTIFY,
    "produce.vision": VETO_MODES.AUTO,
    "produce.fineTune": VETO_MODES.APPROVE,
    "produce.skill": VETO_MODES.NOTIFY,
    publishContent: VETO_MODES.NOTIFY,
    broadcastChannel: VETO_MODES.NOTIFY,
    replyToInbox: VETO_MODES.AUTO,
    "business.development": VETO_MODES.NOTIFY,
    "invoice.create": VETO_MODES.APPROVE,
    "invoice.send": VETO_MODES.APPROVE,
    "payment.collect": VETO_MODES.APPROVE,
    "payment.reconcile": VETO_MODES.NOTIFY,
    "accounting.sync": VETO_MODES.NOTIFY,
    "accounting.closeBooks": VETO_MODES.APPROVE,
    "process.map": VETO_MODES.AUTO,
    "process.improve": VETO_MODES.NOTIFY,
    "gmao.createWorkOrder": VETO_MODES.AUTO,
    "gmao.updateStatus": VETO_MODES.NOTIFY,
    "gmao.completeWorkOrder": VETO_MODES.APPROVE,
    "gmao.createQuote": VETO_MODES.AUTO,
    "gmao.updateQuote": VETO_MODES.NOTIFY,
    "gmao.recordServiceAcceptance": VETO_MODES.APPROVE,
    "gmao.saveInvoice": VETO_MODES.APPROVE,
    "gmao.procurement": VETO_MODES.NOTIFY,
    "gmao.notifyClient": VETO_MODES.NOTIFY,
    "gmao.compliance": VETO_MODES.NOTIFY,
    "gmao.export": VETO_MODES.AUTO,
    "spend.under.10": VETO_MODES.AUTO,
    "spend.under.50": VETO_MODES.NOTIFY,
    "spend.under.250": VETO_MODES.APPROVE,
    "spend.over.250": VETO_MODES.APPROVE,
    hire: VETO_MODES.APPROVE,
    fire: VETO_MODES.APPROVE,
    amendCharter: VETO_MODES.APPROVE,
  };
}

/** Preview-only — applies the template without forming a real company. */
export function previewTemplate(templateId, answers, ownerOverrides = {}) {
  return templates.applyTemplate(templateId, _plain(answers), _plain(ownerOverrides));
}

// ─────────────────────────────────────────────────────────────────────────
// Connectors
// ─────────────────────────────────────────────────────────────────────────

export const listConnectors = (id, filter) => connectors.list(id, filter);
export const getConnector = (id, connId) => connectors.get(id, connId);
export const createConnector = (id, input) => connectors.create(id, _plain(input));
export const updateConnector = (id, connId, patch) => connectors.update(id, connId, _plain(patch));
export const setConnectorSecret = (id, connId, secret, patch = {}) => connectors.setSecret(id, connId, _plain(secret), _plain(patch));
export const revokeConnector = (id, connId, reason) => connectors.revoke(id, connId, reason);
export const removeConnector = (id, connId) => connectors.remove(id, connId);
export const connectorHealth = (id) => connectors.healthSummary(id);

// ─────────────────────────────────────────────────────────────────────────
// HVAC GMAO — local contract, assets, maintenance, SLA and evidence
// ─────────────────────────────────────────────────────────────────────────

export const ensureGmao = (id, input) => gmao.ensure(id, _plain(input));
export const getGmaoSnapshot = (id) => gmao.snapshot(id);
export const saveGmaoContract = (id, input) => gmao.saveContract(id, _plain(input));
export const saveGmaoSite = (id, input) => gmao.saveSite(id, _plain(input));
export const saveGmaoAsset = (id, input) => gmao.saveAsset(id, _plain(input));
export const importGmaoAssets = (id, rows) => gmao.importAssets(id, _plain(rows));
export const saveGmaoPlan = (id, input) => gmao.savePlan(id, _plain(input));
export const createGmaoWorkOrder = (id, input) => gmao.createWorkOrder(id, _plain(input));
export const updateGmaoWorkOrder = (id, workOrderId, input) => gmao.updateWorkOrder(id, workOrderId, _plain(input));
export const transitionGmaoWorkOrder = (id, workOrderId, status, input) => gmao.transitionWorkOrder(id, workOrderId, status, _plain(input));
export const addGmaoEvent = (id, workOrderId, input) => gmao.addEvent(id, workOrderId, _plain(input));
export const recordGmaoAttachmentSheet = (id, workOrderId, input) => gmao.recordAttachmentSheet(id, workOrderId, _plain(input));
export const saveGmaoProcurement = (id, input) => gmao.saveProcurement(id, _plain(input));
export const saveGmaoNotification = (id, input) => gmao.saveNotification(id, _plain(input));
export const addGmaoDocument = (id, input) => gmao.addDocument(id, _plain(input));
export const saveGmaoDocumentFile = (id, file, input) => gmao.saveDocumentFile(id, file, _plain(input));
export const saveGmaoCompliance = (id, input) => gmao.saveCompliance(id, _plain(input));
export const saveGmaoSubcontractor = (id, input) => gmao.saveSubcontractor(id, _plain(input));
export const saveGmaoRate = (id, input) => gmao.saveRate(id, _plain(input));
export const createGmaoQuote = (id, workOrderId, input) => gmao.createQuote(id, workOrderId, _plain(input));
export const updateGmaoQuote = (id, quoteId, input) => gmao.updateQuote(id, quoteId, _plain(input));
export const validateGmaoProcessStep = (id, workOrderId, input) => gmao.validateProcessStep(id, workOrderId, _plain(input));
export const recordGmaoServiceAcceptance = (id, workOrderId, input) => gmao.recordServiceAcceptance(id, workOrderId, _plain(input));
export const saveGmaoInvoice = (id, input) => gmao.saveInvoice(id, _plain(input));
export const saveGmaoOnCallShift = (id, input) => gmao.saveOnCallShift(id, _plain(input));
export const generateGmaoPreventive = (id, now) => gmao.generatePreventive(id, now);
export const evaluateGmaoSla = (id, now) => gmao.evaluateSla(id, now);
export const ingestGmaoDocumentFile = (id, file, input) => gmao.ingestDocumentFile(id, file, _plain(input));
export const applyGmaoDocumentIntake = (id, intakeId, input) => gmao.applyDocumentIntake(id, intakeId, _plain(input));
export const resolveGmaoRecommendation = (id, recommendationId, status, input) => gmao.resolveRecommendation(id, recommendationId, status, _plain(input));
export const recommendGmaoSchedule = (id, workOrderId, candidates) => gmao.recommendSchedule(id, workOrderId, _plain(candidates));
export const recordGmaoAssetSignal = (id, assetId, input) => gmao.recordAssetSignal(id, assetId, _plain(input));
export const saveGmaoBillingLine = (id, input) => gmao.saveBillingLine(id, _plain(input));
export const reconcileGmaoBilling = (id, workOrderId) => gmao.reconcileBilling(id, workOrderId);
export const runGmaoAutomation = (id, now) => gmao.runAutomation(id, now);
export const exportGmaoWeeklyRegister = (id, options) => gmao.exportWeeklyRegister(id, _plain(options));
export const exportGmaoInventory = (id) => gmao.exportInventory(id);
export const downloadGmaoCsv = gmao.downloadCsv;
export const onGmaoChange = gmao.onChanged;

// ─────────────────────────────────────────────────────────────────────────
// Skill packs + manifests
// ─────────────────────────────────────────────────────────────────────────

export const listSkillPacks = () => packs.listPacks();
export const getSkillPack = (pid) => packs.getPack(pid);
export const listSkillManifests = (filter) => listManifests(filter);
export const SKILL_LIBRARY = SKILL_MANIFESTS;

// ─────────────────────────────────────────────────────────────────────────
// Re-exports for the UI
// ─────────────────────────────────────────────────────────────────────────

export {
  ROLE_LIBRARY,
  ACTION_CLASSES,
  VETO_MODES,
  CURRENCIES,
  resolveRoleCompanion,
  effectiveRoleBudget,
  vetoModeFor,
  validateCharter,
  makeCharter,
};

export const saveGmaoClient = (id,...args) => gmao.saveClient(id,...args.map(_plain));
export const saveGmaoServiceContract = (id,...args) => gmao.saveServiceContract(id,...args.map(_plain));
export const saveGmaoSupplier = (id,...args) => gmao.saveSupplier(id,...args.map(_plain));
export const acknowledgeGmaoHandoff = (id,...args) => gmao.acknowledgeHandoff(id,...args.map(_plain));
export const saveGmaoOutbox = (id,...args) => gmao.saveOutbox(id,...args.map(_plain));
export const resolveGmaoOutbox = (id,...args) => gmao.resolveOutbox(id,...args.map(_plain));
export const getGmaoDossier = (id,...args) => gmao.getDossier(id,...args.map(_plain));
export const searchGmaoWorkOrders = (id,...args) => gmao.searchWorkOrders(id,...args.map(_plain));
export const generateGmaoDocument = (id,...args) => gmao.generateDocument(id,...args.map(_plain));
export const sendGmaoOutbox = (id,...args) => gmao.sendOutbox(id,...args.map(_plain));
export const checkGmaoDelivery = (id,...args) => gmao.checkDelivery(id,...args.map(_plain));
