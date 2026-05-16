/**
 * BonzAI Company — heartbeat scheduler
 *
 * Drives CEO + per-role ticks for one or more companies. Runs in the
 * renderer process (lifetime = app open). v1.0 will move this to the
 * main process for true background operation.
 *
 * Schedule:
 *   - CEO tick:  every charter.heartbeat.ceoMin minutes
 *   - Role tick: every charter.heartbeat.roleMin minutes (per role with
 *                a non-empty queue)
 *
 * Each company has its own scheduler instance. Stopping a scheduler
 * cancels both timers. A paused company keeps its scheduler around but
 * no-ops on every tick (so resuming is instant).
 */

import { tickCEO, tickRole, queueDepths } from "./dispatcher.js";
import { ROLE_LIBRARY } from "./charter.js";
import { append } from "./auditLog.js";

const _schedulers = new Map(); // companyId -> { ceoTimer, roleTimer, charter }

/** Start (or restart) the heartbeat for a company. */
export function start(charter) {
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
    charter,
    ceoTimer: setInterval(() => _safeTickCEO(charter), ceoMs),
    roleTimer: setInterval(() => _safeTickAllRoles(charter), roleMs),
    boundCharter: charter,
    demoMode: demo,
  };
  _schedulers.set(charter.id, inst);

  // Kick off one initial CEO tick after the UI settles; role execution
  // then follows its own cadence so output is easier to understand.
  setTimeout(() => _safeTickCEO(charter), demo ? 3500 : 1500);
}

/** Stop the heartbeat for a company. Idempotent. */
export function stop(companyId) {
  const inst = _schedulers.get(companyId);
  if (!inst) return;
  if (inst.ceoTimer) clearInterval(inst.ceoTimer);
  if (inst.roleTimer) clearInterval(inst.roleTimer);
  _schedulers.delete(companyId);
}

/** Stop every scheduler. Used on app teardown. */
export function stopAll() {
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

/** Manually fire a CEO tick on demand (the UI's "Tick now" button). */
export async function manualCEOTick(charter) {
  return _safeTickCEO(charter);
}

/** Manually fire one role tick. */
export async function manualRoleTick(charter, roleKey) {
  return _safeTickRole(charter, roleKey);
}

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

async function _safeTickCEO(charter) {
  try {
    if (charter.status !== "active") return;
    await tickCEO(charter);
  } catch (err) {
    await append(charter.id, {
      kind: "system", role: "CEO", action: "tickCEO",
      status: "error", note: err.message?.slice(0, 200) || "tickCEO threw",
    });
  }
}

async function _safeTickAllRoles(charter) {
  try {
    if (charter.status !== "active") return;
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
    await _drainBucket(charter, llmRoles, llmMode, llmConcurrent);
    // Diffusion bucket
    await _drainBucket(charter, diffusionRoles, diffusionMode, diffusionConcurrent);
  } catch (err) {
    await append(charter.id, {
      kind: "system", role: "scheduler", action: "tickRoles",
      status: "error", note: err.message?.slice(0, 200) || "tickRoles threw",
    });
  }
}

/**
 * Drain a bucket of role queues honoring the execution mode.
 *
 *   sequential : one role at a time, all goals in order
 *   parallel   : up to maxConcurrent role ticks fire simultaneously
 *   swap       : sequential (LLM-only — manager swaps models per role)
 */
async function _drainBucket(charter, roles, mode, maxConcurrent) {
  if (roles.length === 0) return;

  // Flatten to (roleKey, count) tasks. We tick a role once per goal slot
  // (each tick drains one goal); this lets the scheduler interleave across
  // roles instead of finishing one role before starting the next.
  const tasks = [];
  for (const r of roles) for (let i = 0; i < r.depth; i++) tasks.push(r.roleKey);

  if (mode === "parallel") {
    // Window of `maxConcurrent` tasks fire as Promise.all; the next window
    // starts when ALL settle.
    for (let i = 0; i < tasks.length; i += maxConcurrent) {
      const batch = tasks.slice(i, i + maxConcurrent)
        .map((rk) => _safeTickRole(charter, rk));
      await Promise.all(batch);
    }
  } else {
    // sequential / swap — one at a time
    for (const rk of tasks) await _safeTickRole(charter, rk);
  }
}

async function _safeTickRole(charter, roleKey) {
  try {
    return await tickRole(charter, roleKey);
  } catch (err) {
    await append(charter.id, {
      kind: "system", role: roleKey, action: "tickRole",
      status: "error", note: err.message?.slice(0, 200) || "tickRole threw",
    });
    return null;
  }
}
