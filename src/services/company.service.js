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
import * as scheduler from "./company/heartbeat.js";
import * as port from "./company/portability.js";
import * as connectors from "./company/connectors.js";
import * as packs from "./company/skillPacks.js";
import * as templates from "./company/templates.js";
import { SKILL_MANIFESTS, listManifests } from "./company/skillManifests.js";
import { dispatchAction, queueDepths, clearQueues } from "./company/dispatcher.js";

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
  const clean = _plain(charter);
  const api = _api();
  if (api) {
    try { await api.save(clean); return; }
    catch (err) { _warnDbOnce(err); }
  }
  // Legacy fallback
  await window.electronAPI?.store?.set?.(CHARTER_KEY(clean.id), clean);
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
  if (api) {
    try { await api.remove(id); }
    catch (err) { _warnDbOnce(err); }
  }
  // Always also clean the legacy key (no-op if missing)
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
    if (c) out.push(c);
  }
  return out;
}

/** Load a single charter. */
export async function getCompany(id) {
  return _loadCharter(id);
}

/** Form a new company from a partial config. Persists + starts the heartbeat. */
export async function formCompany(cfg) {
  // Strip Vue reactivity proxies BEFORE the data enters the engine — the
  // form passes a `reactive()` object and downstream IPC calls would
  // otherwise blow up with "could not be cloned."
  const charter = makeCharter(_plain(cfg));
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
  await _registerPoolModels(charter);
  scheduler.start(charter);
  return charter;
}

/**
 * Walk the role table and register every distinct LLM the charter
 * declares with the multi-instance pool. Also configures the pool's
 * memory budget from the charter's execution.llm.memoryBudgetGB.
 *
 * No-op if the renderer doesn't expose pool IPC (older build) or if
 * the charter doesn't declare any per-role llm assignments.
 */
async function _registerPoolModels(charter) {
  if (!window.electronAPI?.poolRegisterModel) return;
  // Only relevant for parallel mode — sequential / swap go through legacy
  if (charter.execution?.llm?.mode !== "parallel") return;

  // Configure budget
  try {
    await window.electronAPI.poolConfigure({
      memoryBudgetGB: charter.execution?.llm?.memoryBudgetGB || 22,
    });
  } catch {}

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
  await _registerPoolModels(charter);
  scheduler.updateCharter(charter);
  return charter;
}

/** Pause a company (heartbeat keeps running but no-ops). */
export async function pauseCompany(id) {
  const c = await _loadCharter(id);
  if (!c) throw new Error("not found");
  c.status = "paused";
  c.updatedAt = Date.now();
  await _saveCharter(c);
  await audit.append(id, { kind: "system", action: "pause", status: "executed" });
  return c;
}

/** Resume a paused company. */
export async function resumeCompany(id) {
  const c = await _loadCharter(id);
  if (!c) throw new Error("not found");
  c.status = "active";
  c.updatedAt = Date.now();
  await _saveCharter(c);
  await audit.append(id, { kind: "system", action: "resume", status: "executed" });
  scheduler.start(c);
  return c;
}

/** Permanently dissolve. Wipes all per-company state. */
export async function dissolveCompany(id) {
  scheduler.stop(id);
  await _deleteCharter(id);
  await audit.clear(id);
  await treasury.reset(id);
  await gov.clear(id);
  await dist.clear(id);
  await issues.clear(id);
  await goalsSvc.clear(id);
  await connectors.clear(id);
  await clearQueues(id);
  const ids = (await _readIndex()).filter((x) => x !== id);
  await _writeIndex(ids);
  return true;
}

/** Boot every saved company. Call once on app start. */
export async function bootAll() {
  const list = await listCompanies();
  for (const c of list) {
    if (c.status === "active") {
      await _registerPoolModels(c);
      scheduler.start(c);
    }
  }
  return list;
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
  const charter = await _loadCharter(id);
  const action = await gov.approve(id, pendingId);
  const { resolveRoleCompanion: r } = await import("./company/charter.js");
  const ceo = r(charter, "CEO");
  return dispatchAction(charter, "CEO", ceo?.companion, action, { pendingId });
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
  const goal = await goalsSvc.create(companyId, {
    title: clean.title,
    rationale: clean.rationale,
    missionAlignment: clean.missionAlignment || clean.rationale,
    deadline: clean.deadline,
    createdBy: "user",
  });
  const tasks = Array.isArray(clean.tasks) && clean.tasks.length ? clean.tasks : [];
  // Lazy import — avoid circular reference, route via charter helper for routing.
  const { routeGoalToRole, ROLE_LIBRARY } = await import("./company/charter.js");
  for (const task of tasks) {
    const taskTitle = (task.title || "").trim();
    if (!taskTitle) continue;
    const explicit = task.assigneeRole && ROLE_LIBRARY[task.assigneeRole] ? task.assigneeRole : null;
    const roleKey = explicit || routeGoalToRole({ directive: taskTitle });
    await issues.create(companyId, {
      title: taskTitle,
      description: task.description || "",
      priority: task.priority || "normal",
      assigneeRole: roleKey,
      goalId: goal.id,
      createdBy: "user",
    });
  }
  return goal;
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
  const c = await _loadCharter(id);
  if (!c) throw new Error("not found");
  return scheduler.manualCEOTick(c);
}

export async function tickRoleNow(id, roleKey) {
  const c = await _loadCharter(id);
  if (!c) throw new Error("not found");
  return scheduler.manualRoleTick(c, roleKey);
}

export const getQueueDepths = (id) => queueDepths(id);

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
  scheduler.start(charter);
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
    grantedSkills: draft.grantedSkills,
    pendingConnectors: draft.pendingConnectors,
    skillPacks: draft.skillPacks,
    humanRoster: draft.humanRoster,
    roles: draft.roles,
    currency: draft.rules?.currency,
    reserveFloor: draft.rules?.reserveFloor,
    perHeartbeatSpendCap: draft.rules?.perHeartbeatSpendCap,
    vetoMode: { ..._defaultVetoMap(), ...(draft.rules?.vetoOverrides || {}) },
    demoMode: cleanOverrides.demoMode === true,
  };
  return formCompany(cfg);
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
export const setConnectorSecret = (id, connId, secret) => connectors.setSecret(id, connId, _plain(secret));
export const revokeConnector = (id, connId, reason) => connectors.revoke(id, connId, reason);
export const removeConnector = (id, connId) => connectors.remove(id, connId);
export const connectorHealth = (id) => connectors.healthSummary(id);

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
