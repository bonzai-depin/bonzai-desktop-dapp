/** A team's execution boundary. Inference engines are shared device resources. */
import * as runtime from "./automationRuntime.js";
import { automationPolicy } from "../../shared/companyAutomation.js";

const activeRuns = new Map();
const clone = (value) => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

/** Canonical operative configuration shared by scheduler and run bindings. */
export function harnessConfiguration(charter) {
  const fields = [
    "mission",
    "roles",
    "rules",
    "treasury",
    "execution",
    "automation",
    "heartbeat",
    "businessContext",
    "grantedSkills",
    "skillPacks",
    "mode",
    "demoMode",
    "teamMemory",
    "provisioning",
    "distribution",
    "identity",
    "template",
    "initialGoals",
    "experience",
  ];
  const configuration = Object.fromEntries(
    fields.map((key) => [key, charter[key] ?? null]),
  );
  if (charter.workspace?.executionWorkflowId) configuration.executionWorkflowId = charter.workspace.executionWorkflowId;
  return canonical(configuration);
}

/** Changing the engine does not change authority, personnel or task policy.
 * Active runs retain their snapshot; only subsequent runs use the new model. */
export function modelIndependentConfiguration(charter) {
  const config = harnessConfiguration(charter);
  if (config.roles) config.roles = Object.fromEntries(Object.entries(config.roles).map(([key, role]) => {
    const { llm, ...rest } = role || {};
    return [key, rest];
  }));
  return config;
}

/** Store a digest and identity, never credentials or a copy of private context. */
export async function captureHarness(charter, role = null, agentId = null) {
  if (!charter?.id) throw new Error("A team is required to build its harness.");
  const configuration = harnessConfiguration(charter);
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical(configuration))),
  );
  const policyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(modelIndependentConfiguration(charter))));
  return {
    version: 1,
    teamId: charter.id,
    teamName: charter.name,
    configurationRevision: Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
    modelIndependentRevision: Array.from(new Uint8Array(policyBytes), b => b.toString(16).padStart(2, '0')).join(''),
    role,
    agentId,
  };
}

export async function checkHarness(binding) {
  const get = globalThis.window?.electronAPI?.db?.companies?.get;
  if (!get)
    return {
      ok: false,
      reason: "Team persistence is unavailable. Restart BonzAI.",
    };
  const current = await get(binding.teamId);
  if (!current || current.id !== binding.teamId)
    return { ok: false, reason: "This team no longer exists." };
  if (current.status !== "active")
    return { ok: false, reason: "This team is paused." };
  const latest = await captureHarness(current, binding.role, binding.agentId);
  if (latest.configurationRevision !== binding.configurationRevision &&
      (!binding.modelIndependentRevision || latest.modelIndependentRevision !== binding.modelIndependentRevision))
    return {
      ok: false,
      reason:
        "Team configuration changed. Review the remaining task steps before continuing.",
    };
  return { ok: true };
}

export function sameHarness(left, right) {
  return (
    left?.version === right?.version &&
    left?.teamId === right?.teamId &&
    left?.configurationRevision === right?.configurationRevision &&
    left?.role === right?.role &&
    left?.agentId === right?.agentId
  );
}

/** Stop future effects; an already submitted external action still needs its receipt. */
export function interruptHarness(
  teamId,
  reason = "This team was stopped or reconfigured.",
) {
  for (const run of activeRuns.get(teamId) || []) run.interrupt(reason);
}

export function interruptAllHarnesses() {
  for (const teamId of activeRuns.keys())
    interruptHarness(teamId, "Team execution stopped.");
}

/** Scheduling and approval continuation enter the same durable team run. */
export async function beginHarness(charter, input = {}) {
  const snapshot = clone(charter),
    binding = await captureHarness(snapshot);
  const readiness = await checkHarness(binding);
  if (!readiness.ok) return { acquired: false, reason: readiness.reason };
  const policy = automationPolicy(snapshot);
  const lease = await runtime.begin(snapshot.id, {
    ...input,
    leaseMs: policy.leaseMs,
    harness: binding,
  });
  if (!lease?.acquired) return lease;
  let reason = "",
    disposed = false;
  const run = {
    ...lease,
    charter: snapshot,
    binding: { ...binding, runId: lease.runId },
    interrupt(value) {
      reason ||= value;
    },
    async check() {
      if (reason) return { ok: false, reason };
      const validity = await checkHarness(binding);
      if (!validity.ok) {
        reason = validity.reason;
        return validity;
      }
      const { state } = await runtime.status(snapshot.id);
      if (
        state?.leaseOwner !== lease.runId ||
        !(state.leaseExpiresAt > Date.now())
      )
        reason = "This execution no longer owns the team run.";
      return reason ? { ok: false, reason } : { ok: true };
    },
    async finish(input) {
      try {
        await run.check();
        return await runtime.finish(snapshot.id, lease.runId, {
          ...input,
          status: reason ? "interrupted" : input.status,
          error: reason || input.error,
          result: {
            ...(input.result || {}),
            harness: run.binding,
            ...(reason ? { stopReason: reason } : {}),
          },
        });
      } finally {
        run.dispose();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      const runs = activeRuns.get(snapshot.id);
      runs?.delete(run);
      if (!runs?.size) activeRuns.delete(snapshot.id);
    },
  };
  const timer = setInterval(
    async () => {
      try {
        if (!(await runtime.renew(snapshot.id, lease.runId, policy.leaseMs)))
          run.interrupt("This execution no longer owns the team run.");
      } catch {
        run.interrupt("The team execution lease could not be renewed.");
      }
    },
    Math.min(30000, policy.leaseMs / 3),
  );
  if (!activeRuns.has(snapshot.id)) activeRuns.set(snapshot.id, new Set());
  activeRuns.get(snapshot.id).add(run);
  try {
    await run.check();
    return run;
  } catch (error) {
    await run.finish({ status: "failed", error: error.message });
    throw error;
  }
}
