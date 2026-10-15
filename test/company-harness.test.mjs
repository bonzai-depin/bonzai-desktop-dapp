import test from "node:test";
import assert from "node:assert/strict";
import {
  captureHarness,
  checkHarness,
  sameHarness,
  beginHarness,
  interruptHarness,
  interruptAllHarnesses,
} from "../src/services/company/harness.js";
import {
  createTaskExecution,
  runTaskExecution,
} from "../src/services/company/taskExecution.js";

const team = (id = "a") => ({
  id,
  name: `Team ${id}`,
  status: "active",
  mission: "Review customer requests.",
  roles: {
    CEO: {
      companion: "alex",
      llm: "shared-local-model",
      grantedSkills: ["skill.team_communication"],
    },
  },
  rules: { external: "approval" },
  treasury: { budget: 0 },
});
function backend(...charters) {
  const saved = new Map(charters.map((c) => [c.id, structuredClone(c)])),
    states = new Map(),
    runs = [];
  globalThis.window = {
    electronAPI: {
      db: {
        companies: { get: async (id) => structuredClone(saved.get(id)) },
        automation: {
          begin: async (id, input) => {
            if (states.get(id)?.leaseOwner)
              return { acquired: false, reason: "leased" };
            const runId = `run-${id}-${runs.length}`;
            const value = {
              leaseOwner: runId,
              leaseExpiresAt: Date.now() + 60000,
            };
            states.set(id, value);
            runs.push({ id: runId, ...input });
            return { acquired: true, runId, state: value };
          },
          state: async (id) => states.get(id),
          renew: async () => true,
          finish: async (id, runId, value) => {
            assert.equal(states.get(id)?.leaseOwner, runId);
            states.delete(id);
            runs.find((r) => r.id === runId).finish = value;
            return value;
          },
        },
      },
    },
  };
  return { saved, states, runs };
}

test("Harness identity follows the team and effective configuration, not display edits or key order", async () => {
  const a = team(),
    b = team("b");
  const first = await captureHarness(a, "CEO", "alex");
  assert.equal(first.teamId, "a");
  assert.equal(first.agentId, "alex");
  assert.match(first.configurationRevision, /^[a-f0-9]{64}$/);
  assert.equal(
    sameHarness(
      first,
      await captureHarness(
        {
          ...a,
          name: "Renamed",
          updatedAt: 123,
          roles: {
            CEO: {
              grantedSkills: ["skill.team_communication"],
              llm: "shared-local-model",
              companion: "alex",
            },
          },
        },
        "CEO",
        "alex",
      ),
    ),
    true,
  );
  assert.equal(
    sameHarness(first, await captureHarness(b, "CEO", "alex")),
    false,
  );
  for (const patch of [
    { roles: { CEO: { companion: "other" } } },
    { rules: { external: "deny" } },
    { mission: "Different business outcome" },
    { execution: { llm: { mode: "parallel" } } },
    { treasury: { budget: 100 } },
    { teamMemory: { enabled: false } },
    { distribution: { publishOnSocial: { channels: ["x"] } } },
    { provisioning: { allowOnDemandCompanions: true } },
    { workspace: { executionWorkflowId: 'meditation-forge-v1.0.0' } },
  ])
    assert.equal(
      sameHarness(
        first,
        await captureHarness({ ...a, ...patch }, "CEO", "alex"),
      ),
      false,
    );
  assert.equal(
    sameHarness(first, await captureHarness(a, "CFO", "alex")),
    false,
  );
  assert.equal(
    sameHarness(first, await captureHarness(a, "CEO", "other")),
    false,
  );
  assert.equal(
    sameHarness(first, await captureHarness({ ...a, workspace: { channels: [{ label: 'Renamed navigation' }] } }, "CEO", "alex")),
    true,
    'navigation presentation does not change execution authority',
  );
});

test("Stopping one team interrupts its run without stopping another team on the same model", async () => {
  const a = team(),
    b = team("b");
  const db = backend(a, b);
  const runA = await beginHarness(a, { lane: "roles" }),
    runB = await beginHarness(b, { lane: "roles" });
  try {
    assert.equal((await beginHarness(a, { lane: "roles" })).acquired, false);
    interruptHarness(a.id);
    assert.equal((await runA.check()).ok, false);
    assert.equal((await runB.check()).ok, true);
    await runA.finish({ status: "completed" });
    await runB.finish({ status: "completed" });
    assert.equal(db.runs[0].finish.status, "interrupted");
    assert.equal(db.runs[1].finish.status, "completed");
    assert.equal(db.runs[1].finish.result.harness.teamId, "b");
  } finally {
    runA.dispose();
    runB.dispose();
  }
});

test("A configuration edit during a policy check prevents the effect and preserves completed outputs", async () => {
  const a = team();
  const db = backend(a);
  const run = await beginHarness(a, { lane: "roles" });
  let effects = 0;
  try {
    const execution = createTaskExecution([
      { type: "prepare" },
      { type: "send" },
    ]);
    execution.steps[0].status = "completed";
    execution.steps[0].output = { id: "draft" };
    const result = await runTaskExecution({
      execution,
      canRun: () => run.check(),
      save: async () => {},
      gate: async () => {
        db.saved.get("a").rules.external = "deny";
        return { pass: true };
      },
      dispatch: async () => {
        effects++;
        return { id: "sent" };
      },
    });
    assert.equal(effects, 0);
    assert.equal(result.steps[0].output.id, "draft");
    assert.equal(result.steps[1].status, "planned");
    assert.match(result.pauseReason, /configuration changed/);
    await run.finish({ status: "completed" });
    assert.equal(db.runs[0].finish.status, "interrupted");
  } finally {
    run.dispose();
  }
});

test("Lease loss during checkpoint stops dispatch; an unavailable team never runs", async () => {
  const a = team();
  const db = backend(a);
  const run = await beginHarness(a, { lane: "roles" });
  let effects = 0;
  try {
    const result = await runTaskExecution({
      execution: createTaskExecution([{ type: "send" }]),
      canRun: () => run.check(),
      save: async (state) => {
        if (state.steps[0].status === "running")
          db.states.get("a").leaseOwner = "replacement-run";
      },
      gate: async () => ({ pass: true }),
      dispatch: async () => {
        effects++;
        return { id: "sent" };
      },
    });
    assert.equal(effects, 0);
    assert.equal(result.steps[0].status, "planned");
    assert.match(result.pauseReason, /no longer owns/);
  } finally {
    run.dispose();
  }
  db.saved.get("a").status = "paused";
  assert.equal((await beginHarness(a, { lane: "roles" })).acquired, false);
  db.saved.delete("a");
  assert.equal((await checkHarness(await captureHarness(a))).ok, false);
});

test("App teardown interrupts manual runs too, and finishing rechecks current configuration", async () => {
  const a = team(),
    b = team("b");
  const db = backend(a, b);
  const runA = await beginHarness(a, { triggerType: "manual" }),
    runB = await beginHarness(b, { triggerType: "manual" });
  try {
    db.saved.get("a").teamMemory = { enabled: false };
    await runA.finish({
      status: "completed",
      result: { receipts: [{ id: "completed-draft" }] },
    });
    assert.equal(db.runs[0].finish.status, "interrupted");
    assert.equal(db.runs[0].finish.result.receipts[0].id, "completed-draft");
    interruptAllHarnesses();
    await runB.finish({ status: "completed" });
    assert.equal(db.runs[1].finish.status, "interrupted");
  } finally {
    runA.dispose();
    runB.dispose();
  }
});

test('model-only edits preserve an active run snapshot while policy and member changes still invalidate it', async () => {
  const original=team(),db=backend(original),run=await beginHarness(original);
  try {
    const next=structuredClone(original);next.roles.CEO.llm='new-local-model';db.saved.set(original.id,next);
    assert.deepEqual(await run.check(),{ok:true});
    assert.equal(run.charter.roles.CEO.llm,'shared-local-model','active work keeps the captured engine');
    assert.notEqual((await captureHarness(next)).configurationRevision,run.binding.configurationRevision,'new runs record the actual new model');
    next.roles.CEO.companion='different-worker';
    assert.equal((await run.check()).ok,false,'changing the responsible worker still requires review');
  } finally {run.dispose();}
});
