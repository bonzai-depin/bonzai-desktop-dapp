/**
 * BonzAI Company — CEO heartbeat + role dispatcher
 *
 * Two heartbeats:
 *   1. CEO tick — reads charter + KPI snapshot, asks the local LLM to
 *      emit a goals[] plan (NOT actions). Each goal is routed to the
 *      owning role's queue.
 *   2. Role tick — for each non-empty role queue, reads pending goals,
 *      asks the local LLM (with a role-scoped prompt) to emit typed
 *      actions, then dispatches them through the gate (Counsel veto +
 *      governance veto + budget cap + classifier).
 *
 * Production actions route to BonzAI's existing pipelines through
 * window.electronAPI (chat / chatStream for text; inferenceRequest for
 * image/audio/video/3D/etc.).
 *
 * Architectural note: the dispatcher is the ONLY place that talks to
 * the LLM. The CEO companion's prompt template lives here too, so we
 * can iterate on it without touching every adapter.
 */

import { append, _notify } from "./auditLog.js";
import * as gov from "./governance.solo.js";
import * as treasury from "./treasury.solo.js";
import * as dist from "./distribution.solo.js";
import * as issues from "./issues.js";
import * as goals from "./goals.js";
import * as skillsRegistry from "./skillsRegistry.js";
import { scriptedCEOPlan, scriptedRolePlan } from "./demoMode.js";
import { actionListForPrompt } from "./skillManifests.js";
import * as streamBus from "./streamBus.js";
import { memoryService } from "../memory.service.js";
import { v4 as uuid } from "uuid";
import {
  ROLE_LIBRARY,
  resolveRoleCompanion,
  routeGoalToRole,
  effectiveRoleBudget,
} from "./charter.js";

const MEDIA_PIPELINES = ["image", "audio", "video", "3d", "music", "vision"];

// Legacy queue storage key — kept only for migration cleanup on dissolve.
// The unified model keeps work in goals + issues only.
const QUEUE_KEY = (id) => `companies/${id}/queues`;

// ─────────────────────────────────────────────────────────────────────────
// CEO tick
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run one CEO heartbeat. Reads state, asks the LLM for a small set of
 * goals (each with a rationale that ties it to the mission and 1+
 * concrete tasks). Persists each as a goals.create() + a child
 * issues.create() per task, with the role auto-routed by first verb.
 *
 * @param {object} charter
 * @returns {Promise<{ goals: object[], issuesCreated: number, errors: string[] }>}
 */
export async function tickCEO(charter) {
  const companyId = charter.id;
  const errors = [];

  if (charter.status !== "active") {
    return { goals: [], issuesCreated: 0, errors: ["company is not active"] };
  }

  const ceo = resolveRoleCompanion(charter, "CEO");
  if (!ceo) {
    errors.push("no CEO companion assigned");
    await append(companyId, {
      kind: "system", role: "CEO", action: "tickCEO", status: "error", note: errors[0],
    });
    return { goals: [], issuesCreated: 0, errors };
  }

  const treasuryState = await treasury.getState(companyId);
  const catalog = await dist.listCatalog(companyId);
  const summary = await (await import("./auditLog.js")).summarize(companyId);
  const pendingApprovals = await gov.pending(companyId);
  const activeGoals = await goals.list(companyId, { status: "active" });
  const openIssuesCount = (await issues.list(companyId, { status: "open" })).length;
  const kpiSnapshot = {
    treasury: treasuryState,
    catalogSize: catalog.length,
    summary,
    pendingApprovals: pendingApprovals.length,
    activeGoals: activeGoals.length,
    openIssues: openIssuesCount,
  };

  // The CEO's prompt now asks for explicit mission_alignment + decomposed
  // tasks per goal, so every issue we persist has rationale baked in.
  const memoryContext = await memoryService.buildRecallContext(
    `${charter.name || "team"} ${charter.mission || ""} ${activeGoals.map((g) => g.title).join(" ")}`,
    { company: charter, roleKey: "CEO", includeUser: false, limit: 10 },
  );
  const prompt = [_ceoPrompt({
    charter,
    ceo,
    kpi: kpiSnapshot,
    activeGoals,
  }), memoryContext].filter(Boolean).join("\n\n");

  let plan;
  try {
    const ceoLLM = charter.roles?.CEO?.llm || null;
    const ceoGateway = charter.roles?.CEO?.gateway || "openclaw";
    const result = await _completeJSON(prompt, {
      temperature: 0.7,
      maxTokens: 1536,
      llmModel: ceoLLM,
      gateway: ceoGateway,
      executionMode: charter.execution,
      // Demo-mode short-circuit: scripted planner runs without an LLM.
      demoContext: charter.demoMode
        ? {
            kind: "ceo",
            charter,
            activeGoalTitles: activeGoals.map((g) => g.title),
            tickCount: kpiSnapshot.summary?.total || 0,
          }
        : null,
      // Streaming context: enables zhcChatStream so the live feed shows
      // the CEO's plan materializing token-by-token. Skipped in demo
      // mode (the scripted planner has no streaming surface to plumb).
      streamContext: charter.demoMode ? null : { role: "CEO", action: "tickCEO" },
    });
    plan = result.json;
    // Log the actual LLM response so the Live feed can surface what the
    // CEO is "thinking" — replaces the silent void users were complaining
    // about in real-mode debugging.
    await _logLLMTrace(companyId, "CEO", "tickCEO", result.raw, result.json, result.durationMs);
  } catch (err) {
    errors.push(`LLM call failed: ${_friendlyError(err)}`);
    // Even on parse failure: capture what the model said so the user
    // can see exactly why goals didn't materialize.
    await _logLLMTrace(companyId, "CEO", "tickCEO", err.raw || "", null, err.durationMs || 0, err.message);
    if (!_isJSONParseError(err)) {
      await append(companyId, {
        kind: "system", role: "CEO", action: "tickCEO", status: "error", note: errors[0],
      });
    }
    return { goals: [], issuesCreated: 0, errors };
  }

  const goalDrafts = Array.isArray(plan?.goals) ? plan.goals : [];
  const created = [];
  let issuesCreated = 0;

  for (const draft of goalDrafts) {
    const title = (draft.title || draft.directive || "").trim();
    if (!title) continue;
    const tasks = Array.isArray(draft.tasks) && draft.tasks.length
      ? draft.tasks
      : [{ title, description: "" }];

    const goalRecord = await goals.create(companyId, {
      title,
      rationale: draft.rationale || draft.mission_alignment || "",
      missionAlignment: draft.mission_alignment || draft.rationale || "",
      deadline: draft.deadline || null,
      createdBy: "ceo",
      createdByRole: "CEO",
    });
    created.push(goalRecord);

    for (const task of tasks) {
      const taskTitle = (typeof task === "string" ? task : task.title || "").trim();
      if (!taskTitle) continue;
      const taskDescription = typeof task === "string" ? "" : (task.description || "").trim();
      const explicitRole = typeof task === "object" ? task.assigneeRole : null;
      const roleKey = explicitRole && ROLE_LIBRARY[explicitRole]
        ? explicitRole
        : routeGoalToRole({ directive: taskTitle });
      try {
        await issues.create(companyId, {
          title: taskTitle,
          description: taskDescription,
          priority: typeof task === "object" && task.priority ? task.priority : "normal",
          assigneeRole: roleKey,
          goalId: goalRecord.id,
          createdBy: "ceo",
        });
        issuesCreated++;
      } catch (err) {
        errors.push(`failed to create issue "${taskTitle.slice(0, 40)}": ${err.message}`);
      }
    }
  }

  _notify();
  return { goals: created, issuesCreated, errors };
}

// ─────────────────────────────────────────────────────────────────────────
// Role tick
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run one tick for a single role. Pops the next goal from its queue,
 * asks the LLM (with a role-scoped prompt) for typed actions, runs
 * each through the gate + dispatch.
 *
 * Returns the count of executed / queued / vetoed actions.
 */
export async function tickRole(charter, roleKey) {
  const companyId = charter.id;
  const out = { executed: 0, queued: 0, vetoed: 0, error: 0 };

  if (charter.status !== "active") return out;

  const def = ROLE_LIBRARY[roleKey];
  if (!def) return out;

  const resolved = resolveRoleCompanion(charter, roleKey);
  if (!resolved) {
    // role unfilled and not inheritable → drop the goal
    return out;
  }

  /* Single work source: issues. CEO ticks now write issues directly
     (with goalId set), so the role only ever pulls from one place.
     Priority sort + FIFO within bucket means high-priority owner-created
     issues naturally preempt routine CEO-emitted ones. */
  let issue = await issues.nextForRole(companyId, resolved.roleKey, resolved.companion);
  if (!issue) return out;
  issue = await issues.startAttempt(companyId, issue.id, resolved.roleKey, resolved.companion);

  // Resolve the parent goal (if any) so we can show its rationale to the
  // role's LLM — work feels purposeful, not arbitrary.
  let parentGoal = null;
  if (issue.goalId) {
    try { parentGoal = await goals.get(companyId, issue.goalId); } catch {}
  }

  const goal = {
    directive: issue.title,
    description: issue.description,
    priority: issue.priority,
    issueId: issue.id,
    goalId: issue.goalId,
    goalTitle: parentGoal?.title || null,
    goalRationale: parentGoal?.rationale || parentGoal?.missionAlignment || null,
    delegatedAt: issue.createdAt,
    delegatedBy: issue.createdBy,
  };

  const cap = effectiveRoleBudget(charter, resolved.roleKey);
  const builtInAllowed = ROLE_LIBRARY[resolved.roleKey].allowedActions;
  const roleMediaPipelines = _roleMediaPipelines(charter, resolved.roleKey);

  // Granted skills come from the role assignment (set by the template
  // wizard or owner edits). Each granted skill exposes its action types
  // to the LLM and adds them to the allowed-action mask.
  const grantedSkills = charter.roles?.[resolved.roleKey]?.grantedSkills || [];
  const skillActionLines = actionListForPrompt(grantedSkills);
  const skillActionTypes = new Set();
  for (const sid of grantedSkills) {
    const m = (await import("./skillManifests.js")).getManifest(sid);
    if (!m) continue;
    for (const a of m.actions) skillActionTypes.add(a.type);
  }
  const allowed = [...builtInAllowed, ...skillActionTypes];
  if (roleMediaPipelines.length && !allowed.includes("produce")) allowed.push("produce");

  // Hybrid roles get a different prompt framing — they coordinate a
  // human, they don't execute the work themselves.
  const isHybrid = ROLE_LIBRARY[resolved.roleKey].kind === "human_supported";
  const humans = charter.roles?.[resolved.roleKey]?.humanResources || [];

  const memoryContext = await memoryService.buildRecallContext(
    `${goal.title || goal.directive || ""} ${goal.description || ""}`,
    { company: charter, roleKey: resolved.roleKey, includeUser: false, limit: 10 },
  );
  const prompt = [_rolePrompt({
    charter,
    roleKey: resolved.roleKey,
    companion: resolved.companion,
    goal,
    cap,
    allowed,
    pipeline: ROLE_LIBRARY[resolved.roleKey].pipeline || null,
    mediaPipelines: roleMediaPipelines,
    skillActionLines,
    isHybrid,
    humans,
  }), memoryContext].filter(Boolean).join("\n\n");

  let plan;
  try {
    const roleLLM = charter.roles?.[resolved.roleKey]?.llm || null;
    const roleGateway = charter.roles?.[resolved.roleKey]?.gateway || "openclaw";
    const result = await _completeJSON(prompt, {
      temperature: 0.6,
      maxTokens: 1536,
      llmModel: roleLLM,
      gateway: roleGateway,
      executionMode: charter.execution,
      // Demo-mode short-circuit for role ticks.
      demoContext: charter.demoMode
        ? { kind: "role", charter, roleKey: resolved.roleKey, goal }
        : null,
      streamContext: charter.demoMode
        ? null
        : { role: resolved.roleKey, action: "tickRole" },
    });
    plan = result.json;
    await _logLLMTrace(companyId, resolved.roleKey, "tickRole", result.raw, result.json, result.durationMs);
  } catch (err) {
    out.error++;
    await _logLLMTrace(companyId, resolved.roleKey, "tickRole", err.raw || "", null, err.durationMs || 0, err.message);
    if (!_isJSONParseError(err)) {
      await append(companyId, {
        kind: "system", role: resolved.roleKey, action: "tickRole",
        status: "error", note: `LLM call failed: ${_friendlyError(err)}`,
      });
    }
    return out;
  }

  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  for (const action of actions) {
    if (!action || !action.type) { out.vetoed++; continue; }
    if (!allowed.includes(action.type)) {
      await append(companyId, {
        kind: "veto", role: resolved.roleKey, action: action.type,
        status: "vetoed", note: "outside role's allowed-action mask",
      });
      out.vetoed++;
      continue;
    }
    // Counsel veto pass (content classifier)
    if (await _counselWouldVeto(charter, action)) {
      await append(companyId, {
        kind: "veto", role: resolved.roleKey, action: action.type,
        status: "vetoed", note: "general counsel veto (content/classifier)",
      });
      out.vetoed++;
      continue;
    }
    // Governance gate
    const gate = await gov.gateAction(companyId, charter, action, {
      role: resolved.roleKey, companion: resolved.companion,
    });
    if (gate.notify) {
      try {
        new Notification(`${charter.name}: ${action.type}`, {
          body: _summarize(action),
          silent: true,
        });
      } catch {}
    }
    if (!gate.pass) { out.queued++; continue; }
    try {
      const result = await dispatchAction(charter, resolved.roleKey, resolved.companion, action, { cap });
      // A skill executor (or any handler) signaling failure via `{ ok: false, error }`
      // must NOT count as executed — issues whose only action failed should
      // land in `blocked`, not `done`. Treat the falsy-ok return identically
      // to a thrown error.
      if (result && result.ok === false) {
        out.error++;
        await append(companyId, {
          kind: "action", role: resolved.roleKey, action: action.type,
          status: "error", note: (result.error || "skill returned ok=false").slice(0, 200),
        });
      } else {
        out.executed++;
        // Capture link / receipt for issue attempt log
        if (issue && result?.shareLink) out.lastTxOrLink = result.shareLink;
        else if (issue && result?.id) out.lastTxOrLink = String(result.id);
      }
    } catch (err) {
      out.error++;
      await append(companyId, {
        kind: "action", role: resolved.roleKey, action: action.type,
        status: "error", note: err.message?.slice(0, 200) || "execution failed",
      });
    }
  }

  // Issue lifecycle: roll up the role tick's outcome into the issue's
  // attempt record. Any action that executed = done; vetoed-only = blocked;
  // governance-queued = put back to open (will retry next tick).
  let outcomeStatus;
  if (out.executed > 0) outcomeStatus = "done";
  else if (out.queued > 0) outcomeStatus = "queued";
  else if (out.vetoed > 0 && out.error === 0) outcomeStatus = "vetoed";
  else outcomeStatus = "error";
  await issues.finishAttempt(companyId, issue.id, {
    status: outcomeStatus,
    txOrLink: out.lastTxOrLink || null,
    error: out.error > 0 ? `${out.error} error(s) during dispatch` : null,
  });

  // Goal rollup — if every sibling issue has reached a terminal state,
  // mark the parent goal completed.
  if (issue.goalId) {
    try {
      const siblings = (await issues.list(companyId)).filter((i) => i.goalId === issue.goalId);
      await goals.maybeComplete(companyId, issue.goalId, siblings);
    } catch {}
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Action dispatch — routes typed actions to BonzAI services
// ─────────────────────────────────────────────────────────────────────────

export async function dispatchAction(charter, roleKey, companion, action, ctx = {}) {
  const companyId = charter.id;

  // Owner approve→dispatch path passes ctx.pendingId. We log a brief
  // trail entry so the live feed clearly links the dispatch back to the
  // approval that authorized it, then continue with normal handling.
  if (ctx.pendingId) {
    await append(companyId, {
      kind: "approval", role: roleKey, action: action.type,
      status: "executed", note: "post-approval dispatch", pendingId: ctx.pendingId,
    });
  }

  switch (action.type) {
    case "produce": {
      const pipeline = action.pipeline || ROLE_LIBRARY[roleKey].pipeline || "text";
      const prompt = action.prompt || "";
      let payload;
      let meta = { pipeline, prompt };

      if (pipeline === "text") {
        // Use the existing local LLM (Qwen3.6 28B REAP) via electronAPI.
        const text = await window.electronAPI.chat(prompt, { maxTokens: 600, temperature: 0.8 });
        payload = typeof text === "string" ? text : (text?.text ?? String(text || ""));
      } else if (typeof window.electronAPI?.inferenceRequest === "function") {
        // image/audio/video/3D/music/vision route through the unified P2P-aware
        // inference router; it falls back to local Flask if no peer selected.
        const result = await window.electronAPI.inferenceRequest(pipeline, action.params || { prompt });
        payload = result?.result?.image_base64 || result?.result?.audio_base64
              || result?.result?.video_base64 || result?.result?.text || JSON.stringify(result?.result || {});
        meta.raw = result?.result?.metadata || null;
      } else {
        throw new Error(`pipeline ${pipeline} not available in this build`);
      }

      const record = await dist.publishContent(companyId, {
        pipeline,
        prompt,
        payload,
        price: action.price ?? _defaultPrice(pipeline, charter),
        currency: charter.rules?.currency || "USD",
        role: roleKey,
        companion,
        meta,
      });
      return record;
    }

    case "publishContent": {
      // Re-publish an existing item or wrap a payload provided inline.
      if (action.contentId) {
        // No-op for v1; in v0.1 this triggers a re-share to a new channel.
        await append(companyId, {
          kind: "production", role: roleKey, action: "publishContent",
          status: "executed", contentId: action.contentId, note: "re-share noted",
        });
        return { id: action.contentId };
      }
      return dist.publishContent(companyId, {
        pipeline: action.pipeline || "text",
        prompt: action.prompt || "",
        payload: action.payload || "",
        price: action.price ?? 0,
        currency: charter.rules?.currency || "USD",
        role: roleKey,
        companion,
      });
    }

    case "broadcastChannel":
    case "scheduleBroadcast": {
      // v1: log the broadcast intent; v0.1 wires OpenClaw/Telegram for real.
      await append(companyId, {
        kind: "action", role: roleKey, action: action.type,
        status: "executed",
        note: `→ ${action.channel || "default"}: ${(action.copy || "").slice(0, 200)}`,
        txOrLink: action.contentLink || null,
      });
      return { ok: true };
    }

    case "replyToInbox":
    case "sendCustomerOffer":
    case "recordCustomerSentiment":
    case "escalateToCEO": {
      await append(companyId, {
        kind: "action", role: roleKey, action: action.type,
        status: "executed",
        note: (action.text || action.note || "").slice(0, 240),
      });
      return { ok: true };
    }

    case "paySupplier":
    case "transfer": {
      const result = await treasury.paySupplier(companyId, {
        amount: action.amount,
        currency: action.currency || charter.rules?.currency,
        recipient: action.recipient || action.to,
        memo: action.memo || action.note,
        role: roleKey,
        cap: ctx.cap,
        reserveFloor: charter.rules?.reserveFloor,
      });
      return result;
    }

    case "publishFinancialReport":
    case "publishProductReport":
    case "publishComplianceReport":
    case "publishExperimentReport": {
      const text = action.text || `Report: no body provided.`;
      const record = await dist.publishContent(companyId, {
        pipeline: "text",
        prompt: action.title || action.type,
        payload: text,
        price: 0,
        currency: charter.rules?.currency,
        role: roleKey,
        companion,
        meta: { kind: "report", reportType: action.type },
      });
      return record;
    }

    case "proposeHire":
    case "proposeFire":
    case "proposeCharterAmendment":
    case "proposeBuyback":
    case "executeBuyback":
    case "setReserveFloor":
    case "runFineTune":
    case "runPromptExperiment":
    case "enqueueExperimentalProduction":
    case "updateClassifierRules":
    case "vetoAction":
    case "recordPerformance":
    case "assignWorkload":
    case "rebalanceTeam":
    case "reviewOutput":
    case "retireOutput":
    case "enqueueProduction":
    case "runCampaign":
    case "setBrandVoice": {
      // v1: log + acknowledge. v0.1 wires real handlers per action.
      await append(companyId, {
        kind: "action", role: roleKey, action: action.type, status: "executed",
        note: _summarize(action),
      });
      return { ok: true };
    }

    default: {
      // Skill actions are namespaced (e.g. "twilio.sendSMS", "qbo.createInvoice").
      // Route them through the skills registry which validates connector
      // health, runs the (mock for v0) executor, and appends an audit
      // entry. Unknown / un-namespaced actions still fall through to a
      // veto so the LLM can't smuggle through arbitrary types.
      if (typeof action.type === "string" && action.type.includes(".")) {
        const skill = skillsRegistry.findSkillForAction(action.type);
        if (skill) {
          const result = await skillsRegistry.execute(
            companyId,
            action.type,
            { ...action },
            { role: roleKey, companion, charter },
          );
          return result;
        }
      }
      await append(companyId, {
        kind: "veto", role: roleKey, action: action.type, status: "vetoed",
        note: `unhandled action type`,
      });
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Counsel veto (content classifier)
// ─────────────────────────────────────────────────────────────────────────

const _BANNED_RX = /\b(nsfw|porn|nude|naked|sex|erotic|gore|kill|murder|terror|csam|child)\b/i;

async function _counselWouldVeto(charter, action) {
  // v1: simple keyword classifier on prompt/text/copy fields.
  const forbidden = charter.rules?.forbiddenContent || [];
  if (forbidden.length === 0) return false;
  const fields = [action.prompt, action.text, action.copy, action.note].filter(Boolean).join(" ");
  if (!fields) return false;
  if (_BANNED_RX.test(fields)) return true;
  // Charter-specific terms
  for (const term of forbidden) {
    if (typeof term === "string" && new RegExp(`\\b${term}\\b`, "i").test(fields)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────────

function _ceoPrompt({ charter, ceo, kpi, activeGoals = [] }) {
  const activeBlock = activeGoals.length
    ? `\nACTIVE GOALS (already in flight — do NOT duplicate; only add what's missing):\n${
        activeGoals.slice(0, 8).map((g) => `- "${g.title}"`).join("\n")
      }\n`
    : "";

  return `You are the CEO of ${charter.name}, an autonomous AI company.

CHARTER / MISSION:
${charter.mission}

CURRENT STATE:
- Treasury: ${kpi.treasury.balance} ${kpi.treasury.currency}
- Reserve floor: ${charter.rules?.reserveFloor || 0} ${kpi.treasury.currency}
- Per-heartbeat spend cap: ${charter.rules?.perHeartbeatSpendCap || 0} ${kpi.treasury.currency}
- Catalog size (published items): ${kpi.catalogSize}
- Last 24h actions: ${kpi.summary.executed} executed, ${kpi.summary.vetoed} vetoed, ${kpi.summary.error} errors
- Pending owner approvals: ${kpi.pendingApprovals}
- Active goals: ${kpi.activeGoals}, open issues: ${kpi.openIssues}
${activeBlock}
YOUR JOB: emit a small set of GOALS that advance the mission this heartbeat.
Each goal MUST include a rationale that explains how it serves the mission,
plus 1 to 3 concrete tasks the org will execute to fulfill it. Tasks are
one-sentence directives that start with a verb — the dispatcher routes
each task to the owning role by first verb.

VERB → ROLE ROUTING (the first word of each task picks the assignee):
- "ship" / "produce" / "publish" → Product team (CPO)
- "write" / "draw" / "compose" / "speak" / "film" → specific Producer
- "broadcast" / "post" / "announce" / "promote" → CMO
- "reply" / "engage" / "support" / "retain" → CSO
- "pay" / "transfer" / "buyback" / "reserve" → CFO
- "hire" / "fire" / "reassign" → COO
- "improve" / "experiment" / "finetune" / "analyze" → R&D Lead
- "audit" / "comply" → General Counsel
- "propose" / "amend" → yourself (CEO)

OUTPUT (strict JSON, no commentary):
{
  "goals": [
    {
      "title": "Publish today's AI haiku",
      "rationale": "Daily creative output keeps the audience engaged with the brand voice and grows reach.",
      "mission_alignment": "Daily creative output keeps the audience engaged with the brand voice and grows reach.",
      "deadline": "+24h",
      "tasks": [
        { "title": "write a haiku about morning fog", "description": "5-7-5 syllables, calm tone" },
        { "title": "broadcast the haiku on Telegram", "description": "include link to the published item" }
      ]
    }
  ]
}

KEEP IT FOCUSED — 1 to 3 goals per heartbeat, each with 1 to 3 tasks. If
ACTIVE GOALS already cover the obvious next moves, return fewer (or even
zero) new goals. Do not include any text outside the JSON object.`;
}

function _rolePrompt({ charter, roleKey, companion, goal, cap, allowed, pipeline, mediaPipelines = [], skillActionLines = [], isHybrid = false, humans = [] }) {
  const isProducer = roleKey.startsWith("Producer:");
  const productionPipelines = [...new Set([pipeline, ...mediaPipelines].filter(Boolean))];
  const skillsBlock = skillActionLines.length
    ? `\nGRANTED SKILL ACTIONS (in addition to built-ins above — emit any of these):\n${skillActionLines.join("\n")}\n`
    : "";
  const mediaBlock = productionPipelines.length
    ? `\nPRODUCTION PIPELINES THIS ROLE MAY USE: ${productionPipelines.join(", ")}\nWhen a task needs media or generated content, emit a produce action with one of those pipeline values.\n`
    : "";
  const hybridBlock = isHybrid
    ? `\nROLE TYPE: HUMAN-SUPPORTED. You coordinate real human workers — you do NOT do the physical work yourself. You brief, dispatch, follow up, invoice. The actual hands-on labor is done by:\n${
        humans.length
          ? humans.map((h, i) => `  ${i + 1}. ${h.name}${h.contractorStatus ? ` (${h.contractorStatus})` : ""}${h.skills?.length ? ` — ${h.skills.join(", ")}` : ""}`).join("\n")
          : "  (no human roster yet — this role can't dispatch real work until the owner adds people)"
      }\nWhen acting, refer to humans by name. Never claim to do physical work yourself.\n`
    : "";
  return `You are filling the ${roleKey} role at ${charter.name}, an autonomous AI company.
You are companion ${companion}. Your job is to complete the goal below by emitting
typed actions. The dispatcher will execute them.

CHARTER:
${charter.mission}

ROLE: ${roleKey}
${isProducer ? `PRIMARY PIPELINE: ${pipeline}` : ""}
PER-HEARTBEAT BUDGET: ${cap} ${charter.rules?.currency || "USD"}
ALLOWED ACTION TYPES (built-in): ${allowed.filter((a) => !a.includes(".")).join(", ")}
${mediaBlock}${skillsBlock}${hybridBlock}

${goal.goalTitle ? `PARENT GOAL: "${goal.goalTitle}"${goal.goalRationale ? `\nWHY THIS MATTERS: ${goal.goalRationale}` : ""}\n` : ""}ISSUE${goal.priority ? ` [priority: ${goal.priority}]` : ""}:
"${goal.directive}"${goal.description ? `\n\nDETAILS:\n${goal.description}` : ""}

OUTPUT (strict JSON, no commentary):
{
  "actions": [
    ${isProducer
      ? `{ "type": "produce", "pipeline": "${pipeline}", "prompt": "<the actual prompt for the inference engine>", "price": 0 }`
      : productionPipelines.length
        ? `{ "type": "produce", "pipeline": "${productionPipelines[0]}", "params": { "prompt": "<the actual prompt for the inference engine>" }, "price": 0 }`
      : `{ "type": "replyToInbox", "to": "<user-or-thread-id>", "text": "<short reply text>" }`
    }
  ]
}

EXAMPLES per action type:
- produce(text):       { "type": "produce", "pipeline": "text", "prompt": "Write a haiku about coffee.", "price": 1 }
- produce(image):      { "type": "produce", "pipeline": "image", "params": { "prompt": "a misty harbor at dawn", "steps": 6 }, "price": 2 }
- publishContent:      { "type": "publishContent", "contentId": "<id>" }
- broadcastChannel:    { "type": "broadcastChannel", "channel": "telegram", "copy": "Today's haiku is live: <link>" }
- replyToInbox:        { "type": "replyToInbox", "to": "<userId>", "text": "Hi! Yes, the bundle is $9." }
- paySupplier:         { "type": "paySupplier", "amount": 5, "recipient": "API vendor", "memo": "Twitter API key" }

CRITICAL:
- emit between 1 and 3 actions
- every action must be one complete JSON object with a "type" field
- spend actions must respect the budget cap above
- never use incomplete placeholder objects
- do not include any text outside the JSON object`;
}

function _summarize(action) {
  if (action.copy) return action.copy.slice(0, 200);
  if (action.text) return action.text.slice(0, 200);
  if (action.prompt) return action.prompt.slice(0, 200);
  if (action.amount) return `${action.amount} → ${action.recipient || "?"}`;
  return action.type;
}

function _roleMediaPipelines(charter, roleKey) {
  const configured = charter.roles?.[roleKey]?.pipelines;
  if (!Array.isArray(configured)) return [];
  return configured.filter((pipeline) => MEDIA_PIPELINES.includes(pipeline));
}

function _defaultPrice(pipeline, charter) {
  // Sensible per-pipeline defaults the CEO can override.
  const defaults = { text: 1, image: 3, audio: 2, video: 9, "3d": 5, music: 4, vision: 0, fineTune: 25, skill: 19 };
  return defaults[pipeline] ?? 1;
}

// ─────────────────────────────────────────────────────────────────────────
// LLM helper — completes JSON via existing electronAPI.chat
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run an LLM completion, returning parsed JSON.
 *
 * @param {string} prompt
 * @param {object} opts
 *   - temperature, maxTokens, enableThinking — passed through to the engine
 *   - llmModel        : preferred model key (e.g. "llm_qwen3_5_4b"). Used by
 *                       the multi-instance pool when executionMode.llm is
 *                       "parallel"; ignored in "sequential" / "swap" modes
 *                       beyond a best-effort swap before the call.
 *   - executionMode   : { llm: { mode, maxConcurrent }, diffusion: ... }
 */
/**
 * Wrap a Promise with a hard timeout. The underlying inference job
 * keeps running in the main process — we can't cancel it from the
 * renderer — but the dispatcher unblocks so the heartbeat can advance.
 * The next role tick will pick up new work.
 */
const LLM_CALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
function _withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Internal completion helper. Returns `{ json, raw, durationMs }` so
 * callers can both act on the parsed plan AND log the raw response to
 * the audit log. Throws on parse failure — and attaches `err.raw` +
 * `err.durationMs` so the caller can still log what was actually said.
 */
async function _completeJSON(prompt, opts = {}) {
  const t0 = Date.now();

  // ─── Demo mode short-circuit ──────────────────────────────────────
  // Bypass every LLM gateway and run the scripted planner. This is the
  // only place demoMode touches dispatch — the rest of the dispatcher
  // (gating, governance, audit) runs identically.
  if (opts.demoContext) {
    let json;
    if (opts.demoContext.kind === "ceo") {
      json = scriptedCEOPlan(opts.demoContext.charter, {
        activeGoalTitles: opts.demoContext.activeGoalTitles,
        tickCount: opts.demoContext.tickCount,
      });
    } else if (opts.demoContext.kind === "role") {
      json = scriptedRolePlan(
        opts.demoContext.charter,
        opts.demoContext.roleKey,
        opts.demoContext.goal,
      );
    }
    // Synthesize a "raw response" string so the live feed renders demo
    // ticks identically to real LLM ticks — pretty-printed JSON.
    return {
      json,
      raw: JSON.stringify(json, null, 2),
      durationMs: Date.now() - t0,
      demo: true,
    };
  }

  if (!window.electronAPI?.chat) throw new Error("Local LLM not available");

  // PARALLEL mode: try the multi-instance pool. If unavailable (older
  // builds without the pool IPC, or insufficient memory budget), the
  // pool throws and we fall through to single-instance.
  if (opts.executionMode?.llm?.mode === "parallel" && opts.llmModel
      && typeof window.electronAPI?.poolChat === "function") {
    try {
      const res = await _withTimeout(window.electronAPI.poolChat({
        modelKey: opts.llmModel,
        prompt,
        temperature: opts.temperature ?? 0.7,
        maxTokens: opts.maxTokens ?? 2048,
        enableThinking: opts.enableThinking ?? false,
      }), LLM_CALL_TIMEOUT_MS, `pool[${opts.llmModel}]`);
      const raw = typeof res === "string" ? res : res?.text || "";
      try {
        return { json: _extractJSON(raw), raw, durationMs: Date.now() - t0 };
      } catch (err) {
        err.raw = raw;
        err.durationMs = Date.now() - t0;
        throw err;
      }
    } catch (err) {
      console.warn(`[zhc] pool LLM call failed for ${opts.llmModel}, falling back to single-instance:`, err?.message);
      // fall through to ensure + single-instance chat
    }
  }

  // Auto-ensure: if the role declared a preferred LLM, make sure it's
  // loaded BEFORE we hit electronAPI.chat. Works for every execution
  // mode — sequential / swap / fallthrough-from-parallel — so ZHC never
  // requires the user to pre-load a model in Generative Text. The IPC
  // is idempotent, so paying the cost once per role-tick is cheap.
  //
  // ensureModel may DECLINE the swap when another request is mid-flight
  // (e.g. a RoleplayChat conversation). In that case it returns
  // { ok: true, declined: true, filename: <current> } and we proceed
  // against whatever model is already loaded — protecting the user's
  // active session at the cost of (sometimes) using a non-preferred
  // model for this tick. The next tick retries.
  if (opts.llmModel && typeof window.electronAPI?.ensureModel === "function") {
    try {
      const res = await window.electronAPI.ensureModel(opts.llmModel);
      if (res && res.ok === false) {
        console.warn(`[zhc] ensureModel failed for ${opts.llmModel}: ${res.error}`);
      } else if (res?.declined) {
        console.info(
          `[zhc] ensureModel declined for ${opts.llmModel} (reason=${res.reason}, ` +
          `using ${res.filename}) — protected an in-flight request.`,
        );
      }
    } catch (err) {
      console.warn(`[zhc] ensureModel threw for ${opts.llmModel}:`, err?.message);
    }
  }

  // Singleton chat path. When the streaming bridge is available AND the
  // caller opted in via opts.streamContext, pipe tokens to the stream
  // bus so the live feed shows the response materializing in real time.
  // Otherwise fall back to the non-streaming `chat` IPC.
  const wantStream =
    opts.streamContext &&
    typeof window.electronAPI?.zhcChatStream === "function" &&
    typeof window.electronAPI?.onZhcChatToken === "function";

  let raw = "";
  if (wantStream) {
    const streamId = uuid();
    streamBus.emit({
      type: "begin",
      streamId,
      role: opts.streamContext.role,
      action: opts.streamContext.action,
    });
    let unsubscribe = () => {};
    try {
      // Subscribe BEFORE the IPC call so we don't miss early tokens.
      unsubscribe = window.electronAPI.onZhcChatToken(({ streamId: id, chunk }) => {
        if (id !== streamId) return;
        raw += chunk;
        streamBus.emit({ type: "chunk", streamId, chunk });
      });
      const final = await _withTimeout(
        window.electronAPI.zhcChatStream({
          streamId,
          prompt,
          temperature: opts.temperature ?? 0.7,
          maxTokens: opts.maxTokens ?? 2048,
          enableThinking: opts.enableThinking ?? false,
        }),
        LLM_CALL_TIMEOUT_MS,
        "zhcChatStream",
      );
      // The IPC returns the full assembled message; prefer it over the
      // accumulated chunks in case any were dropped during dispatch.
      if (typeof final === "string" && final.length > raw.length) raw = final;
      streamBus.emit({ type: "end", streamId });
    } catch (err) {
      streamBus.emit({ type: "error", streamId, error: err?.message });
      err.raw = raw;
      err.durationMs = Date.now() - t0;
      throw err;
    } finally {
      try { unsubscribe(); } catch {}
    }
    try {
      return { json: _extractJSON(raw), raw, durationMs: Date.now() - t0 };
    } catch (err) {
      err.raw = raw;
      err.durationMs = Date.now() - t0;
      throw err;
    }
  }

  // Non-streaming fallback (no stream context, or IPC unavailable).
  const text = await _withTimeout(window.electronAPI.chat(prompt, {
    temperature: opts.temperature ?? 0.7,
    maxTokens: opts.maxTokens ?? 2048,
    enableThinking: opts.enableThinking ?? false,
  }), LLM_CALL_TIMEOUT_MS, "chat");
  raw = typeof text === "string" ? text : text?.text ?? "";
  try {
    return { json: _extractJSON(raw), raw, durationMs: Date.now() - t0 };
  } catch (err) {
    err.raw = raw;
    err.durationMs = Date.now() - t0;
    throw err;
  }
}

/**
 * Extract a JSON object from an LLM response.
 *
 * Strategy:
 *  1. Walk the string with a brace counter (string-aware), find the
 *     FIRST balanced `{...}` span. This is the right answer when the
 *     model wraps its JSON in markdown code fences with explanatory
 *     prose either before/after.
 *  2. Fall back to the legacy greedy regex (`\{[\s\S]*\}`) only if the
 *     counter doesn't find a balanced object — preserves behavior on
 *     responses where the brace counter would mistakenly stop early.
 *  3. If both fail, throw with a snippet of the raw response so the
 *     parse_error LLM card surfaces the actual model output.
 *
 * Smaller models (Phi-4 Mini, Qwen 2.5 3B) regularly emit
 *   ```json
 *   { ... }
 *   ```
 *   Some explanatory text after.
 * which the old greedy regex would happily over-capture.
 */
function _extractJSON(raw) {
  if (!raw || typeof raw !== "string") {
    throw new Error("LLM returned empty response");
  }

  // (1) Balanced-brace scan
  const balanced = _firstBalancedJSON(raw);
  if (balanced) {
    try { return JSON.parse(balanced); }
    catch { /* fall through to greedy */ }
  }

  // (2) Greedy fallback — last resort
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); }
    catch (err) {
      throw new Error(`JSON parse failed: ${err.message}; raw: ${match[0].slice(0, 200)}`);
    }
  }

  throw new Error(`LLM did not return JSON; raw: ${raw.slice(0, 200)}`);
}

/**
 * Walk the string and return the first balanced top-level `{...}` span.
 * Properly handles nested braces and string literals (so a `}` inside a
 * JSON string doesn't end the scan early). Returns null if no balanced
 * object is found.
 */
function _firstBalancedJSON(s) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return s.slice(start, i + 1);
      }
      if (depth < 0) { depth = 0; start = -1; }
    }
  }
  return null;
}

/**
 * Append a structured "thought" entry to the audit log so the Live feed
 * can show the model's actual response. Truncates to 2000 chars to keep
 * audit storage from ballooning. Survives parse failures — that's
 * exactly when the user most wants to see what the model said.
 */
async function _logLLMTrace(companyId, role, action, raw, parsed, durationMs, errorMsg = null) {
  const truncated = (raw || "").slice(0, 2000);
  const summary = errorMsg
    ? `JSON parse failed`
    : (parsed?.goals?.length
        ? `Emitted ${parsed.goals.length} goal(s)`
        : parsed?.actions?.length
          ? `Emitted ${parsed.actions.length} action(s)`
          : "Empty plan");
  await append(companyId, {
    kind: "llm",
    role,
    action,
    status: errorMsg ? "parse_error" : "executed",
    note: summary,
    llm: {
      response: truncated,
      durationMs: durationMs || 0,
      parseOk: !errorMsg,
      parseError: errorMsg ? errorMsg.slice(0, 200) : null,
      truncated: (raw || "").length > 2000,
    },
  });
}

/**
 * Translate raw inference errors into actionable copy. The "Model not
 * loaded" failure is the #1 cause of "my company isn't doing anything"
 * — surface it with a clear next step instead of a stack trace.
 */
function _friendlyError(err) {
  const msg = err?.message || String(err);
  if (/model not loaded/i.test(msg) || /no session/i.test(msg)) {
    return "no model loaded — open Generative Text and select a model, or turn on Demo mode in the company header to run sample activity.";
  }
  if (/connector .* not configured/i.test(msg)) return msg;
  return msg.slice(0, 240);
}

function _isJSONParseError(err) {
  const msg = err?.message || String(err);
  return /JSON parse failed|LLM did not return JSON|LLM returned empty response/i.test(msg);
}

// ─────────────────────────────────────────────────────────────────────────
// Diagnostics
// ─────────────────────────────────────────────────────────────────────────

/**
 * Read current open-issue counts per role (the UI calls this "queue
 * depth" — kept for naming compatibility with the legacy in-memory model).
 */
export async function queueDepths(companyId) {
  const open = await issues.list(companyId, { status: "open" });
  const inProgress = await issues.list(companyId, { status: "in_progress" });
  const out = {};
  for (const i of [...open, ...inProgress]) {
    if (!i.assigneeRole) continue;
    out[i.assigneeRole] = (out[i.assigneeRole] || 0) + 1;
  }
  return out;
}

/** Wipe legacy queue storage on dissolve. Goals + issues clear separately. */
export async function clearQueues(companyId) {
  await window.electronAPI?.store?.delete?.(QUEUE_KEY(companyId));
}
