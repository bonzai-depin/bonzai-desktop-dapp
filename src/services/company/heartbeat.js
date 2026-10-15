/**
 * BonzAI Company — heartbeat scheduler
 *
 * Drives CEO + per-role ticks for one or more companies. Execution is
 * hosted by a main-supervised local runtime while the app is running; SQLite leases,
 * run records and boot recovery prevent overlap and resume interrupted work.
 *
 * Schedule:
 *   - CEO tick:  every charter.heartbeat.ceoMin minutes
 *   - Role tick: every charter.heartbeat.roleMin minutes (per role with
 *                a non-empty queue)
 *
 * Each company has its own scheduler instance. Stopping a scheduler
 * cancels both timers. A paused company stops its timers and prevents further effects from an active run.
 */

import { tickCEO, tickRole, queueDepths, _completeJSON } from "./dispatcher.js";
import { ROLE_LIBRARY } from "./charter.js";
import { append } from "./auditLog.js";
import * as runtime from "./automationRuntime.js";
import {beginHarness, interruptHarness, interruptAllHarnesses, harnessConfiguration, modelIndependentConfiguration} from "./harness.js";
import * as issues from "./issues.js";
import { allowsAutonomousPlanning, automationPolicy, retryDelayMs } from "../../shared/companyAutomation.js";

import { processIntake } from "./intakeRunner.js";

const _schedulers = new Map(); // companyId -> { ceoTimer, roleTimer, charter }
const _initialized = new Set();

/** Start (or restart) the heartbeat for a company. */
export function start(charter) {
  if (charter.status !== 'active') return stop(charter.id);
  const revision = JSON.stringify(harnessConfiguration(charter));
  const existing = _schedulers.get(charter.id);
  if (existing?.revision === revision) return;
  if (existing && JSON.stringify(modelIndependentConfiguration(existing.charter)) === JSON.stringify(modelIndependentConfiguration(charter))) {
    existing.charter = charter;
    existing.boundCharter = charter;
    existing.revision = revision;
    return;
  }
  stop(charter.id);

  // Demo mode is still faster than real cadence, but it should feel like
  // a supervised business simulation, not a firehose.
  const demo = charter.demoMode === true;
  const ceoMs = demo
    ? 75_000
    : (charter.heartbeat?.ceoMin ?? 60) * 60 * 1000;
  const roleMs = demo
    ? 30_000
    : (charter.heartbeat?.roleMin ?? 30) * 60 * 1000;

  const inst = {
    revision,
    charter,
    ceoTimer: allowsAutonomousPlanning(charter) ? setInterval(() => _runLane(inst.charter, "ceo", "scheduled", ceoMs), ceoMs) : null,
    roleTimer: setInterval(() => _runLane(inst.charter, "roles", "scheduled", roleMs), roleMs),
    boundCharter: charter,
    demoMode: demo,
    ceoKickoff: null,
    rolesKickoff: null,
    retryTimers: {},
    recoveryTimer: setInterval(async () => { await _recoverInterrupted(inst.charter); wake(charter.id); }, 30000),
  };
  _schedulers.set(charter.id, inst);

  // Workflow teams only execute requested work. Other teams receive an initial
  // planning tick after the UI settles; role execution follows its own cadence.
  if (!_initialized.has(charter.id)) {
    _initialized.add(charter.id);
    void _recoverInterrupted(charter);
  }
  if (allowsAutonomousPlanning(charter)) inst.ceoKickoff = setTimeout(() => _runLane(inst.charter, "ceo", "scheduled", ceoMs), demo ? 3500 : 1500);
  inst.rolesKickoff = setTimeout(() => _runLane(inst.charter, "roles", "scheduled", roleMs), demo ? 6500 : 4500);
}

/** Stop the heartbeat for a company. Idempotent. */
export function stop(companyId) {
  interruptHarness(companyId);
  const inst = _schedulers.get(companyId);
  if (!inst) return;
  if (inst.ceoTimer) clearInterval(inst.ceoTimer);
  if (inst.roleTimer) clearInterval(inst.roleTimer);
  if (inst.ceoKickoff) clearTimeout(inst.ceoKickoff);
  if (inst.rolesKickoff) clearTimeout(inst.rolesKickoff);
  if (inst.wakeTimer) clearTimeout(inst.wakeTimer);
  if (inst.recoveryTimer) clearInterval(inst.recoveryTimer);
  for (const timer of Object.values(inst.retryTimers || {})) clearTimeout(timer);
  _schedulers.delete(companyId);
}

/** Stop every scheduler. Used on app teardown. */
export function stopAll() {
  interruptAllHarnesses();
  for (const id of [..._schedulers.keys()]) stop(id);
}

/** Refresh the bound charter — call after the user edits it. */
export function updateCharter(charter) {
  start(charter); // restart with new params
}

/** Is a scheduler currently running for this company? */
export function isRunning(companyId) {
  return _schedulers.has(companyId);
}

/** New tasks, owner answers and team replies do not wait for a heartbeat. */
export function wake(companyId) {
  const inst = _schedulers.get(companyId);
  if (!inst || inst.wakeTimer) return;
  inst.wakeTimer = setTimeout(async () => {
    inst.wakeTimer = null;
    if (_schedulers.get(companyId) !== inst) return;
    await globalThis.window?.electronAPI?.db?.issues?.wakeTeamWaits?.(companyId);
    const ready = await issues.list(companyId, { status: 'open' });
    const intake=await globalThis.window?.electronAPI?.db?.companyIntake?.snapshot?.(companyId);
    if (!ready.some(task => !task.nextAttemptAt || task.nextAttemptAt <= Date.now()) && !intake?.counts?.some(c=>['queued','processing'].includes(c.status)&&c.count>0) && !intake?.mailboxes?.some(m=>m.enabled)) return;
    const result = await _runLane(inst.charter, 'roles', 'event', _roleInterval(inst.charter));
    if (result?.skipped && ['busy', 'leased', 'local-busy'].includes(result.reason)) wake(companyId);
  }, 1500);
}

/** Manually fire a CEO tick on demand (the UI's "Tick now" button). */
export async function manualCEOTick(charter) {
  return _runLane(charter, "ceo", "manual", _ceoInterval(charter));
}

/** Manually fire one role tick. */
export async function manualRoleTick(charter, roleKey) {
  return _runLane(charter, "roles", "manual", _roleInterval(charter), roleKey);
}

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

async function _runLane(charter, lane, triggerType, intervalMs, roleKey = null) {
  if (charter.status !== "active") return { skipped: true, reason: "paused" };
  if (lane === 'ceo' && !allowsAutonomousPlanning(charter)) return { goals: [], issuesCreated: 0, errors: [], skipped: true, reason: 'workflow_tasks_only' };
  const policy = automationPolicy(charter);
  await _recoverInterrupted(charter);
  await globalThis.window?.electronAPI?.db?.issues?.wakeTeamWaits?.(charter.id);
  const run = await beginHarness(charter, {
    lane, triggerType, leaseMs: policy.leaseMs, now: Date.now(),
  });
  if (!run?.acquired) return { skipped: true, reason: run?.reason || "busy" };

  try {
    const result = lane === "ceo"
      ? await _safeTickCEO(run.charter,run)
      : roleKey ? await _safeTickRole(run.charter, roleKey, run) : await _safeTickAllRoles(run.charter,run);
    const failed = lane === "ceo"
      ? (result?.errors?.length || 0) > 0
      : (result?.error || 0) > 0;
    if (failed) throw new Error(lane === "ceo" ? result.errors.join("; ") : `${result.error} role action(s) failed`);
    await run.finish({
      status: "completed", result, nextAt: Date.now() + intervalMs,
    });
    if (result?.continuing) wake(charter.id);
    return result;
  } catch (err) {
    const failures = Number(run.state?.consecutiveFailures || 0) + 1;
    const retryMs = Math.min(intervalMs, retryDelayMs(failures, policy, `${charter.id}:${lane}:${failures}`));
    await run.finish({
      status: "failed",
      error: err.message?.slice(0, 500) || `${lane} run failed`,
      nextAt: Date.now() + retryMs,
    });
    await append(charter.id, {
      kind: "system", role: lane === "ceo" ? "CEO" : "scheduler",
      action: lane === "ceo" ? "tickCEO" : "tickRoles",
      status: "error", note: err.message?.slice(0, 200) || `${lane} run failed`,
    });
    _scheduleRetry(charter, lane, retryMs, intervalMs);
    return { error: 1, message: err.message };
  } finally { run.dispose(); }
}

function _scheduleRetry(charter, lane, retryMs, intervalMs) {
  const inst = _schedulers.get(charter.id);
  if (!inst || JSON.stringify(modelIndependentConfiguration(inst.charter)) !== JSON.stringify(modelIndependentConfiguration(charter))) return;
  if (inst.retryTimers[lane]) clearTimeout(inst.retryTimers[lane]);
  inst.retryTimers[lane] = setTimeout(() => {
    delete inst.retryTimers[lane];
    void _runLane(inst.charter, lane, "scheduled", intervalMs);
  }, retryMs);
}

async function _recoverInterrupted(charter) {
  // Recover expired work; the repository preserves any live execution lease.
  const staleBefore = Date.now();
  try {
    const runs = await runtime.recover(charter.id, staleBefore);
    const work = await issues.recoverStale(charter.id, staleBefore);
    if ((runs?.recovered || 0) + (work?.recovered || 0) > 0) {
      await append(charter.id, {
        kind: "system", role: "scheduler", action: "recoverAutomation",
        status: "executed",
        note: `Recovered ${runs?.recovered || 0} run(s) and ${work?.recovered || 0} work item(s) after interruption`,
      });
    }
  } catch (err) {
    console.warn("[company] automation recovery failed:", err?.message || err);
  }
}

function _ceoInterval(charter) {
  return charter.demoMode ? 75_000 : (charter.heartbeat?.ceoMin ?? 60) * 60 * 1000;
}

function _roleInterval(charter) {
  return charter.demoMode ? 30_000 : (charter.heartbeat?.roleMin ?? 30) * 60 * 1000;
}

async function _safeTickCEO(charter,run) {
  // Deterministic purchasing reminders create real backlog items even while
  // the user is elsewhere. They do not send messages or place orders.
  if (charter.roles?.PurchasingManager) {
    await globalThis.window?.electronAPI?.db?.purchasing?.runReview?.(charter.id, {});
  }
  if (charter.roles?.BusinessDevelopment) await globalThis.window?.electronAPI?.db?.companySales?.runReview?.(charter.id, {});
  return tickCEO(charter,run);
}

async function _safeTickAllRoles(charter,run) {
  try {
    if (charter.status !== "active") return { executed: 0, queued: 0, vetoed: 0, error: 0 };
    const intake=await processIntake(charter,run,_completeJSON);
    const depths = await queueDepths(charter.id);
    const drainLimit = 3;

    // Group active roles by execution-class. Currently both LLM and
    // diffusion roles share the dispatcher's _completeJSON entry, but
    // PRODUCTION roles bound to image/audio/video/3D pipelines hit
    // electronAPI.inferenceRequest (Flask, multipart concurrency-friendly)
    // — those go in the diffusion bucket.
    const llmRoles = [];
    const diffusionRoles = [];
    for (const roleKey of Object.keys(ROLE_LIBRARY)) {
      const depth = depths[roleKey] || 0;
      if (depth === 0) continue;
      const def = ROLE_LIBRARY[roleKey];
      const taskClass = def.pipeline && def.pipeline !== "text" ? "diffusion" : "llm";
      (taskClass === "diffusion" ? diffusionRoles : llmRoles)
        .push({ roleKey, depth: Math.min(depth, drainLimit) });
    }

    const llmMode = charter.execution?.llm?.mode || "sequential";
    const diffusionMode = charter.execution?.diffusion?.mode || "sequential";
    const llmConcurrent = Math.max(1, charter.execution?.llm?.maxConcurrent || 1);
    const diffusionConcurrent = Math.max(1, charter.execution?.diffusion?.maxConcurrent || 1);

    // LLM bucket
    const llmResult = await _drainBucket(charter, llmRoles, llmMode, llmConcurrent,run);
    // Diffusion bucket
    const diffusionResult = await _drainBucket(charter, diffusionRoles, diffusionMode, diffusionConcurrent,run);
    const result=_mergeResults(llmResult, diffusionResult);
    return {...result,intake,error:(result.error||0)+(intake.error?1:0)};
  } catch (err) {
    throw err;
  }
}

/**
 * Drain a bucket of role queues honoring the execution mode.
 *
 *   sequential : one role at a time, all goals in order
 *   parallel   : up to maxConcurrent role ticks fire simultaneously
 *   swap       : sequential (LLM-only — manager swaps models per role)
 */
async function _drainBucket(charter, roles, mode, maxConcurrent,run) {
  if (roles.length === 0) return { executed: 0, queued: 0, vetoed: 0, error: 0 };

  // Flatten to (roleKey, count) tasks. We tick a role once per goal slot
  // (each tick drains one goal); this lets the scheduler interleave across
  // roles instead of finishing one role before starting the next.
  const tasks = [];
  for (const r of roles) for (let i = 0; i < r.depth; i++) tasks.push(r.roleKey);

  const results = [];
  if (mode === "parallel") {
    // Window of `maxConcurrent` tasks fire as Promise.all; the next window
    // starts when ALL settle.
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent)
        .map((rk) => _safeTickRole(charter, rk,run));
      results.push(...await Promise.all(batch));
    }
  } else {
    // sequential / swap — one at a time
    for (const rk of tasks) results.push(await _safeTickRole(charter, rk,run));
  }
  return _mergeResults(...results);
}

async function _safeTickRole(charter, roleKey,run) {
  try {
    return await tickRole(charter, roleKey,run);
  } catch (err) {
    await append(charter.id, {
      kind: "system", role: roleKey, action: "tickRole",
      status: "error", note: err.message?.slice(0, 200) || "tickRole threw",
    });
    return { executed: 0, queued: 0, vetoed: 0, error: 1 };
  }
}

function _mergeResults(...items) {
  return items.filter(Boolean).reduce((sum, item) => ({
    executed: sum.executed + Number(item.executed || 0),
    queued: sum.queued + Number(item.queued || 0),
    vetoed: sum.vetoed + Number(item.vetoed || 0),
    error: sum.error + Number(item.error || 0),
    continuing: sum.continuing + Number(item.continuing || 0),
    waiting: sum.waiting + Number(item.waiting || 0),
  }), { executed: 0, queued: 0, vetoed: 0, error: 0, continuing: 0, waiting: 0 });
}
