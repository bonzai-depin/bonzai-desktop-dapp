import {captureHarness, checkHarness, sameHarness, beginHarness} from "./harness.js";
import { teamContext } from "./teamCommunication.js";
import { companyMaintenanceContext } from "./gmao.js";
import { paperasseGuide } from "./paperasseTeams.js";
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
import { allowsAutonomousPlanning, automationPolicy, isAutonomousWorkflowTask, isDuplicateIntent } from "../../shared/companyAutomation.js";

import { CREATE_ACTION_GUIDE, CREATE_PIPELINES, executeCreation } from "./createCapabilities.js";
import { loadSmartAgents, smartAgentCatalog } from "../smartAgentCatalog.js";
import { createTaskExecution, runTaskExecution, executionOutcome } from './taskExecution.js';
import { createAgentExecution, runAgentLoop, agentContext, AGENT_PROTOCOL } from './agentLoop.js';
import { SUPPORTED_CONNECTOR_ACTIONS } from './connectorExecutors.js';
import { getAvailableAgentWorkflows, getAgentWorkflowIds } from '../agentWorkflows.js';
import { executeCompanyWorkflow } from './workflowExecution.js';
const MEDIA_PIPELINES = CREATE_PIPELINES;

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
export async function tickCEO(charter, run = null) {
  if (!allowsAutonomousPlanning(charter)) {
    return { goals: [], issuesCreated: 0, errors: [], skipped: true, reason: 'workflow_tasks_only' };
  }
  const harness = await captureHarness(charter,"CEO",resolveRoleCompanion(charter,"CEO")?.companion);
  const canRun = () => run ? run.check() : checkHarness(harness);
  const initial = await canRun();
  if(!initial.ok)return {goals:[],issuesCreated:0,errors:[],skipped:true,reason:initial.reason};
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
  const policy = automationPolicy(charter);
  if (activeGoals.length >= policy.maxActiveGoals || openIssuesCount >= policy.maxOpenIssues) {
    const reason = activeGoals.length >= policy.maxActiveGoals
      ? `capacity reached (${activeGoals.length}/${policy.maxActiveGoals} active goals)`
      : `work queue reached (${openIssuesCount}/${policy.maxOpenIssues} open issues)`;
    await append(companyId, {
      kind: "system", role: "CEO", action: "tickCEO", status: "executed",
      note: `Planning skipped: ${reason}`,
    });
    return { goals: [], issuesCreated: 0, errors: [], skipped: true, reason };
  }

  // The CEO's prompt now asks for explicit mission_alignment + decomposed
  // tasks per goal, so every issue we persist has rationale baked in.
  const memoryContext = await memoryService.buildRecallContext(
    `${charter.name || "team"} ${charter.mission || ""} ${activeGoals.map((g) => g.title).join(" ")}`,
    { company: charter, roleKey: "CEO", includeUser: false, limit: 10 },
  );
  const maintenanceContext = charter.template?.id === "hvac_residential" ? await companyMaintenanceContext(companyId,{directive:charter.mission}) : "";
  const prompt = [_ceoPrompt({
    charter,
    ceo,
    kpi: kpiSnapshot,
    activeGoals,
  }), memoryContext, maintenanceContext, await teamContext(companyId)].filter(Boolean).join("\n\n");

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
      streamContext: charter.demoMode ? null : { companyId, role: "CEO", action: "tickCEO" },
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

  const availableGoalSlots = Math.max(0, policy.maxActiveGoals - activeGoals.length);
  const availableIssueSlots = Math.max(0, policy.maxOpenIssues - openIssuesCount);
  const existingTitles = [
    ...activeGoals.map((goal) => goal.title),
    ...(await issues.list(companyId)).filter((issue) => ["open", "in_progress", "blocked"].includes(issue.status)).map((issue) => issue.title),
  ];
  const goalDrafts = (Array.isArray(plan?.goals) ? plan.goals : [])
    .filter((draft) => !isDuplicateIntent(draft?.title || draft?.directive, existingTitles))
    .slice(0, availableGoalSlots);
  const created = [];
  let issuesCreated = 0;

  for (const draft of goalDrafts) {
    const validity=await canRun();
    if(!validity.ok)return {goals:created,issuesCreated,errors:[],skipped:true,reason:validity.reason};
    const title = (draft.title || draft.directive || "").trim();
    if (!title) continue;
    const tasks = (Array.isArray(draft.tasks) && draft.tasks.length
      ? draft.tasks
      : [{ title, description: "" }]).slice(0, Math.max(0, availableIssueSlots - issuesCreated));
    if (!tasks.length) break;

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
        : routeGoalToRole({ directive: taskTitle, description: taskDescription }, charter);
      try {
        await issues.create(companyId, {
          title: taskTitle,
          description: taskDescription,
          priority: typeof task === "object" && task.priority ? task.priority : "normal",
          assigneeRole: roleKey,
          goalId: goalRecord.id,
          createdBy: "ceo",
          maxAttempts: policy.maxAttempts,
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
export async function tickRole(charter, roleKey, run = null) {
  const companyId = charter.id;
  const out = { executed: 0, queued: 0, vetoed: 0, error: 0, retryable: true, receipts: [] };

  if (charter.status !== "active") return out;
  const harness=await captureHarness(charter,roleKey,resolveRoleCompanion(charter,roleKey)?.companion);
  if(!(await (run ? run.check() : checkHarness(harness))).ok)return out;
  await loadSmartAgents();

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
  let issue = await issues.claimNextForRole(companyId, roleKey, resolved.companion);
  if (!issue) return out;

  // Resolve the parent goal (if any) so we can show its rationale to the
  // role's LLM — work feels purposeful, not arbitrary.
  let parentGoal = null;
  if (issue.goalId) {
    try { parentGoal = await goals.get(companyId, issue.goalId); } catch {}
  }
  if (isAutonomousWorkflowTask(charter, issue, parentGoal)) {
    const reason = 'This earlier autonomous plan is outside the workflow request. Create a production task with the inputs you want to use.';
    await issues.finishAttempt(companyId, issue.id, {
      status: 'blocked', retryable: false, error: reason,
      result: { summary: reason, objective: issue.title, actions: [], completedBy: resolved.companion, role: roleKey },
    });
    return { ...out, skipped: true, reason: 'autonomous_workflow_task' };
  }

  const prerequisite = issue.parentIssueId ? await issues.get(companyId, issue.parentIssueId) : null;
  const goal = {
    prerequisiteResults: prerequisite?.execution?.steps?.map(step => ({ id: step.id, output: step.output })) || [],
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

  const cap = effectiveRoleBudget(charter, roleKey);
  const builtInAllowed = ROLE_LIBRARY[roleKey].allowedActions;
  const roleMediaPipelines = _roleMediaPipelines(charter, roleKey);

  // Granted skills come from the role assignment (set by the template
  // wizard or owner edits). Each granted skill exposes its action types
  // to the LLM and adds them to the allowed-action mask.
  const grantedSkills = [...new Set([...(charter.roles?.[roleKey]?.grantedSkills || []), "skill.team_communication", "skill.local_intake"])].filter(id => id !== "skill.brave_supplier_search" || roleKey === "PurchasingManager");
  const skillActionLines = actionListForPrompt(grantedSkills);
  const skillActionTypes = new Set();
  for (const sid of grantedSkills) {
    const m = (await import("./skillManifests.js")).getManifest(sid);
    if (!m) continue;
    for (const a of m.actions) skillActionTypes.add(a.type);
  }
  const workflowCatalog = await getAvailableAgentWorkflows();
  const agent = smartAgentCatalog.agents.find(agent => agent.id === resolved.companion);
  const agentWorkflows = new Set(getAgentWorkflowIds(agent, workflowCatalog));
  const availableWorkflows = [...agentWorkflows];
  const implemented = new Set(['produce', 'runFineTune', 'publishFinancialReport', 'publishProductReport', 'publishComplianceReport', 'publishExperimentReport', ...SUPPORTED_CONNECTOR_ACTIONS]);
  const allowed = [...builtInAllowed, ...skillActionTypes].filter(type => implemented.has(type));
  if (availableWorkflows.length) allowed.push('runWorkflow');
  allowed.push('smartAgent.runWorker', 'smartAgent.acceptJob', 'smartAgent.submitResult', 'smartAgent.withdrawEarnings');
  if (roleMediaPipelines.length && !allowed.includes("produce")) allowed.push("produce");

  // Hybrid roles get a different prompt framing — they coordinate a
  // human, they don't execute the work themselves.
  const isHybrid = ROLE_LIBRARY[roleKey].kind === "human_supported";
  const humans = charter.roles?.[roleKey]?.humanResources || [];

  const memoryContext = await memoryService.buildRecallContext(
    `${goal.title || goal.directive || ""} ${goal.description || ""}`,
    { company: charter, roleKey: roleKey, includeUser: false, limit: 10 },
  );
  const maintenanceContext = charter.template?.id === "hvac_residential" ? await companyMaintenanceContext(companyId, goal) : "";
  const prompt = [_rolePrompt({
    charter,
    roleKey: roleKey,
    companion: resolved.companion,
    goal,
    cap,
    allowed,
    pipeline: ROLE_LIBRARY[roleKey].pipeline || null,
    mediaPipelines: roleMediaPipelines,
    skillActionLines,
    isHybrid,
    humans,
  }), memoryContext, maintenanceContext, await teamContext(companyId)].filter(Boolean).join("\n\n");

  let plan;
  if ((!issue.execution || (issue.execution.agent && !issue.execution.harness)) && !charter.demoMode) {
    const execution = issue.execution || createAgentExecution(harness);
    execution.harness = harness;
    execution.agent.instructions = `${prompt.replace(memoryContext, "")}\nAvailable workflows: ${JSON.stringify(workflowCatalog.filter(item => availableWorkflows.includes(item.id)).map(item => ({ id: item.id, name: item.name, inputs: item.inputs })))}\nPrerequisite results: ${JSON.stringify(goal.prerequisiteResults)}`;
    issue = await issues.saveExecution(companyId, issue.id, execution, issue.executionRevision || 0);
  }
  if (!issue.execution) try {
    const roleLLM = charter.roles?.[roleKey]?.llm || null;
    const roleGateway = charter.roles?.[roleKey]?.gateway || "openclaw";
    const result = await _completeJSON(`${prompt}

Available workflows: ${JSON.stringify(workflowCatalog.filter(item => availableWorkflows.includes(item.id)).map(item => ({ id: item.id, name: item.name, inputs: item.inputs })))}.
Use runWorkflow with workflowId and inputs to run an available workflow. Each action may have a unique stepId. Pass earlier results using {"$ref":"step1.id"} (or another actual output field). Never guess identifiers or output. A pending approval stops the plan. Local artifacts are drafts, not published work.
Prerequisite results: ${JSON.stringify(goal.prerequisiteResults)}`, {
      temperature: 0.6,
      maxTokens: 1536,
      llmModel: roleLLM,
      gateway: roleGateway,
      executionMode: charter.execution,
      // Demo-mode short-circuit for role ticks.
      demoContext: charter.demoMode
        ? { kind: "role", charter, roleKey: roleKey, goal }
        : null,
      streamContext: charter.demoMode
        ? null
        : { companyId, role: roleKey, action: "tickRole" },
    });
    plan = result.json;
    issue = await issues.saveExecution(companyId, issue.id, {...createTaskExecution(plan?.actions),harness}, issue.executionRevision || 0);
    await _logLLMTrace(companyId, roleKey, "tickRole", result.raw, result.json, result.durationMs);
  } catch (err) {
    out.error++;
    await _logLLMTrace(companyId, roleKey, "tickRole", err.raw || "", null, err.durationMs || 0, err.message);
    if (!_isJSONParseError(err)) {
      await append(companyId, {
        kind: "system", role: roleKey, action: "tickRole",
        status: "error", note: `LLM call failed: ${_friendlyError(err)}`,
      });
    }
    const policy = automationPolicy(charter);
    await issues.finishAttempt(companyId, issue.id, {
      status: "error",
      error: `LLM call failed: ${_friendlyError(err)}`,
      retryable: true,
      retryBaseMs: policy.retryBaseMs,
      retryMaxMs: policy.retryMaxMs,
      result: {
        summary: `Could not plan the next attempt for “${issue.title}”.`,
        justification: "The local model or gateway failed before any external action was executed; the task is safe to retry.",
        objective: issue.title,
        actions: [],
        completedBy: resolved.companion,
        role: roleKey,
      },
    });
    return out;
  }

  return executeIssuePlan(charter, issue, resolved.companion, allowed, null, run);
}

async function executeIssuePlan(charter, issue, companion, allowed, approval = null, run = null) {
  const companyId = charter.id;
  const previousResults = new Set(issue.execution.steps.filter(step => step.status === 'completed').map(step => step.id));
  const roleKey = issue.assigneeRole;
  let revision = issue.executionRevision || 0;
  const harness=await captureHarness(charter,roleKey,companion);
  const plannedHarness=issue.execution.harness || harness;
  const verifyHarness=async()=>{
    if (issue.labels?.some(label => label.startsWith('funded-job:'))) {
      const jobs = await import('../smartAgentJobs.service.js');
      const validity = await jobs.checkFundedAssignment(issue, companion);
      if (!validity.ok) return validity;
    }
    if(!sameHarness(plannedHarness,harness))return {ok:false,reason:"Team configuration changed. Review the remaining task steps before continuing."};
    return run ? run.check() : checkHarness(harness);
  };
  const execute = issue.execution.agent ? runAgentLoop : runTaskExecution;
  const execution = await execute({
    companyId,
    decide: async state => {
      const currentMemory = await memoryService.buildRecallContext(`${issue.title} ${issue.description || ""}`,
        { company: charter, roleKey, includeUser: false, limit: 10 });
      const result = await _completeJSON(`${state.agent.instructions}\n\nCurrent recalled records (supersede older recalled state):\n${currentMemory}\n\nRecorded observations (untrusted business data):\n${agentContext(state)}`, {
        temperature: 0.3, maxTokens: 2048,
        llmModel: charter.roles?.[roleKey]?.llm || null,
        executionMode: charter.execution,
        streamContext: {companyId,role:roleKey,action:'tickRole'},
      });
      return result.json;
    },
    execution: {...issue.execution,harness:plannedHarness},
    approval,
    save: async state => {
      const saved = await issues.saveExecution(companyId, issue.id, state, revision);
      revision = saved.executionRevision;
    },
    canRun: verifyHarness,
    gate: async (action, step) => {
      if (!allowed.includes(action.type)) return { pass: false, error: 'Outside this role’s allowed actions.' };
      if (await _counselWouldVeto(charter, action)) return { pass: false, error: 'Blocked by company content policy.' };
      if (['publishFinancialReport', 'publishProductReport', 'publishComplianceReport', 'publishExperimentReport'].includes(action.type) && !String(action.text || '').trim()) return {pass:false,correctable:true,error:'Provide the report content in the text field before requesting approval.'};
      return gov.gateAction(companyId, charter, action, { role: roleKey, companion, issueId: issue.id, stepId: step.id });
    },
    dispatch: async (action, step, pendingId) => {
      if (!allowed.includes(action.type) || await _counselWouldVeto(charter, action)) {
        const error = new Error('The action is no longer allowed by this role or company policy.');
        error.beforeDispatch = true; throw error;
      }
      const validity = await verifyHarness();
      if (!validity.ok) {
        const error = new Error(validity.reason);
        error.beforeDispatch = true; throw error;
      }
      return dispatchAction(charter, roleKey, companion, action, {
        cap: effectiveRoleBudget(charter, roleKey), issueId: issue.id, pendingId,
        idempotencyKey: `${companyId}:${issue.id}:${step.id}`,
        harness,
      });
    },
  });
  const receipts = execution.steps.map(step => ({
    ..._actionReceipt(step.resolvedAction || step.action, step.status, step.output, step.error),
    stepId: step.id, output: step.output, error: step.error, approvalId: step.approvalId,
  }));
  const status = executionOutcome(execution);
  const error = execution.steps.find(step => step.error)?.error || execution.pauseReason || null;
  await issues.finishAttempt(companyId, issue.id, {
    status, retryable: false, error,
    result: {
      summary: status === 'done' ? execution.agent?.completion?.summary || `All ${receipts.length} task steps completed; results are available for review.`
        : status === 'queued' ? 'Waiting for approval. Completed steps are saved.'
        : status === 'waiting' ? execution.agent.wait?.question || execution.agent.wait?.reason
        : status === 'continue' ? 'Work saved. Continuing with the next step.' : error || 'This task needs attention.',
      objective: issue.title, actions: receipts, completedBy: companion, role: roleKey,
      contentIds: receipts.map(receipt => receipt.contentId).filter(Boolean),
    },
  });
  if (status === 'done' && issue.goalId) await goals.maybeComplete(companyId, issue.goalId, await issues.list(companyId, { goalId: issue.goalId }));
  return { executed: execution.steps.filter(step => step.status === 'completed' && !previousResults.has(step.id)).length,
    queued: status === 'queued' ? 1 : 0, waiting: status === 'waiting' ? 1 : 0, continuing: status === 'continue' ? 1 : 0, error: status === 'blocked' ? 1 : 0, vetoed: 0, receipts };
}

export async function resumeApprovedTask(charter, pending) {
  const run=await beginHarness(charter,{lane:'roles',triggerType:'manual'});
  if(!run?.acquired)throw new Error(run?.reason || 'This team is paused or executing another task.');
  try {
    const result=await resumeApprovedTaskClaimed(run.charter,pending,run);
    await run.finish({status:result.error?'failed':'completed',result});
    return result;
  }catch(error){await run.finish({status:'failed',error:error.message});throw error;}
  finally{run.dispose();}
}

async function resumeApprovedTaskClaimed(charter, pending, run) {
  const validity=await run.check();
  if(!validity.ok)throw new Error(validity.reason);
  const savedIssue=await issues.get(charter.id,pending.issueId);
  const parentGoal = savedIssue?.goalId ? await goals.get(charter.id, savedIssue.goalId) : null;
  if (isAutonomousWorkflowTask(charter, savedIssue, parentGoal)) {
    throw new Error('This approval belongs to an earlier autonomous plan. Reject it and create a production task with the inputs you want to use.');
  }
  const binding=await captureHarness(charter,pending.role,pending.requestedBy);
  if(savedIssue?.execution?.harness && !sameHarness(savedIssue.execution.harness,binding))throw new Error("Team configuration changed. Reject this approval and review the remaining task steps.");
  if (resolveRoleCompanion(charter, pending.role)?.companion !== pending.requestedBy) throw new Error('This role’s agent changed. Reject the old request and review the task before continuing.');
  const issue = await issues.resumeApproval(charter.id, pending.id);
  // Record approval only after exclusive task claim. A crash thereafter is reconciled,
  // never reauthorized silently on startup.
  const action = await gov.approve(charter.id, pending.id);
  if (!action) {
    await issues.finishAttempt(charter.id, issue.id, { status: 'blocked', error: 'Approval could not be recorded. No action was executed.' });
    throw new Error('Approval could not be recorded. No action was executed.');
  }
  const role = charter.roles?.[issue.assigneeRole] || {};
  const allowed = [...(ROLE_LIBRARY[issue.assigneeRole]?.allowedActions || []), 'produce', 'runWorkflow',
    'smartAgent.runWorker', 'smartAgent.acceptJob', 'smartAgent.submitResult', 'smartAgent.withdrawEarnings'];
  for (const id of [...(role.grantedSkills || []), "skill.team_communication", "skill.local_intake"]) {
    const manifest = (await import('./skillManifests.js')).getManifest(id);
    allowed.push(...(manifest?.actions || []).map(action => action.type));
  }
  return executeIssuePlan(charter, issue, pending.requestedBy, allowed, { id: pending.id, stepId: pending.stepId, action }, run);
}

// ─────────────────────────────────────────────────────────────────────────
// Action dispatch — routes typed actions to BonzAI services
// ─────────────────────────────────────────────────────────────────────────

export async function dispatchAction(charter, roleKey, companion, action, ctx = {}) {
  const companyId = charter.id;
  if ((gov.requiresOwnerApproval(action) || ctx.pendingId) && !gov.consumeOwnerApproval(companyId, ctx.pendingId, action)) throw new Error('This action requires an explicit owner approval for these exact details.');

  // Owner approve→dispatch path passes ctx.pendingId. We log a brief
  // trail entry so the live feed clearly links the dispatch back to the
  // approval that authorized it, then continue with normal handling.
  if (ctx.pendingId) {
    await append(companyId, {
      kind: "approval", role: roleKey, action: action.type,
      status: "started", note: "post-approval dispatch", pendingId: ctx.pendingId,
    });
  }

  switch (action.type) {
    case 'smartAgent.runWorker': {
      const { executeCompanyWorker } = await import('../agentWorkers.service.js');
      const { ethers } = await import('ethers');
      const scopedAction = { ...action, requestId: action.requestId || ethers.id(`worker:${ctx.idempotencyKey || `${companyId}:${ctx.issueId}`}`) };
      const result = await executeCompanyWorker(scopedAction, companion, Boolean(ctx.pendingId));
      // Media has its own blob-backed deliverables below; this record is the
      // readable execution report, never image/audio bytes.
      const record = await dist.publishContent(companyId, { pipeline: result.pipeline === '3d' ? '3d' : 'text',
        prompt: action.input?.prompt || action.capability, payload: result.text || JSON.stringify(result.artifacts),
        role: roleKey, companion, issueId: ctx.issueId, meta: { payloadEncoding: 'text', kind: 'peer-worker-result', artifacts: result.artifacts, requestId: result.requestId } });
      for (const artifact of result.artifacts || []) {
        const saved = await dist.publishContent(companyId, { pipeline: artifact.mimeType.split('/')[0], prompt: action.input?.prompt || 'Worker delivery', blobId: artifact.id, blobExt: artifact.ext,
          role: roleKey, companion, issueId: ctx.issueId, meta: { kind: 'peer-worker-media', requestId: result.requestId } });
        if (!saved) throw new Error('Worker media could not be saved to company deliverables.');
      }
      if (!record) throw new Error('Worker result could not be saved to company deliverables.');
      return { ...record, ok: true, status: 'completed', scope: 'local_draft' };
    }

    case 'smartAgent.acceptJob':
    case 'smartAgent.submitResult':
    case 'smartAgent.withdrawEarnings': {
      await loadSmartAgents();
      const agent = smartAgentCatalog.agents.find(item => item.id === (action.agentId || companion));
      if (!agent?.id || !agent.tokenAddress) throw new Error('Choose a launched smart agent with a social token.');
      if (!action.jobId) throw new Error('An existing funded job ID is required.');
      const { actOnSmartAgentJob, withdrawAgentJobPayment } = await import('../smartAgentJobs.service.js');
      const result = action.type === 'smartAgent.withdrawEarnings'
        ? await withdrawAgentJobPayment(agent, action.jobId, { approved: true })
        : await actOnSmartAgentJob(action.type === 'smartAgent.acceptJob' ? 'acceptJob' : 'submitWork', action.jobId, action.resultURI || action.detail || '', { agent, approved: true });
      await append(companyId, { kind: 'action', role: roleKey, action: action.type, status: 'executed', note: `Smart agent job ${action.jobId}`, txOrLink: result.txHash, pendingId: ctx.pendingId });
      return { ...result, summary: action.type === 'smartAgent.acceptJob' ? 'Smart agent accepted the funded job.' : action.type === 'smartAgent.withdrawEarnings' ? 'Smart agent withdrew its settled earnings.' : 'Smart agent submitted the work for customer review.' };
    }
    case "runFineTune":
    case "produce": {
      await loadSmartAgents();
      const agent = smartAgentCatalog.agents.find(item => item.id === companion);
      const creation = await executeCreation({ ...action, pipeline: action.pipeline || ROLE_LIBRARY[roleKey]?.pipeline || "text" }, {
        approved: Boolean(ctx.pendingId),
        llm: charter.roles?.[roleKey]?.llm,
        instructions: [agent?.instructions, paperasseGuide(charter, roleKey), charter.template?.id?.startsWith("paperasse_") ? charter.mission : "", action.source ? `Source data for this task:\n${JSON.stringify(action.source)}` : ''].filter(Boolean).join('\n\n'),
        companyId, role: roleKey, agentId: companion,
      });
      const record = await dist.publishContent(companyId, {
        ...creation,
        price: action.price ?? 0,
        currency: charter.rules?.currency || "USD",
        role: roleKey, companion,
        meta: { ...creation.meta, issueId: ctx.issueId || null },
        issueId: ctx.issueId || null,
      });
      if (!record) throw new Error("The generated artifact could not be saved to the company workspace.");
      return { ...record, ok: true, status: 'completed', scope: 'local_draft' };
    }

    case 'runWorkflow':
      return executeCompanyWorkflow(charter, roleKey, companion, action, ctx);

    case "publishContent":
    case "broadcastChannel":
    case "scheduleBroadcast":
    case "replyToInbox":
    case "sendCustomerOffer":
    case "recordCustomerSentiment":
    case "escalateToCEO":
    case "paySupplier":
    case "transfer":
      return { ok: false, status: 'unsupported', error: `${action.type} has no verified execution handler. Use a configured connector or save a local draft.` };

    case "publishFinancialReport":
    case "publishProductReport":
    case "publishComplianceReport":
    case "publishExperimentReport": {
      const text = String(action.text || '').trim();
      if (!text) return { ok: false, beforeDispatch: true, error: 'Report content is required in the text field.' };
      const record = await dist.publishContent(companyId, {
        pipeline: "text",
        prompt: action.title || action.type,
        payload: text,
        price: 0,
        currency: charter.rules?.currency,
        role: roleKey,
        companion,
        meta: { kind: "report", reportType: action.type, issueId: ctx.issueId || null },
        issueId: ctx.issueId || null,
      });
      return { ...record, ok: true, status: 'completed', scope: 'local_draft' };
    }

    case "proposeHire":
    case "proposeFire":
    case "proposeCharterAmendment":
    case "proposeBuyback":
    case "executeBuyback":
    case "setReserveFloor":
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
      return { ok: false, status: 'unsupported', error: `${action.type} is not implemented. No business action was performed.` };
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
            { ...ctx, role: roleKey, companion, charter },
          );
          return result;
        }
      }
      await append(companyId, {
        kind: "veto", role: roleKey, action: action.type, status: "vetoed",
        note: `unhandled action type`,
      });
      return { ok: false, status: 'unsupported', error: `Unhandled action: ${action.type}` };
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
OWNER INSTRUCTIONS: ${charter.experience?.instructions || "Follow the assigned business requests."}
WORKING LANGUAGE: ${charter.experience?.language || "Match the owner."}

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
  const smartAgent = smartAgentCatalog.agents.find(agent => agent.id === companion);
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
You are smart agent ${companion}. Your job is to complete the goal below by emitting
typed actions. The dispatcher will execute them.
${smartAgent ? `\nSMART AGENT: ${smartAgent.name}\nSERVICE: ${smartAgent.mission}\nPRIVATE WORKING INSTRUCTIONS: ${smartAgent.instructions || "Follow the company brief."}\n` : ""}

CHARTER:
${charter.mission}

OWNER'S TEAM INSTRUCTIONS: ${charter.experience?.instructions || 'Follow the assigned business request.'}
WORKING LANGUAGE: ${charter.experience?.language === 'auto' || !charter.experience?.language ? 'Match the owner and the task.' : charter.experience.language}
TONE: ${charter.experience?.tone || 'direct'}; DETAIL: ${charter.experience?.responseDetail || 'balanced'}

ROLE: ${roleKey}
${isProducer ? `PRIMARY PIPELINE: ${pipeline}` : ""}
PER-HEARTBEAT BUDGET: ${cap} ${charter.rules?.currency || "USD"}
ALLOWED ACTION TYPES (built-in): ${allowed.filter((a) => !a.includes(".")).join(", ")}
${mediaBlock}${skillsBlock}${hybridBlock}
${paperasseGuide(charter, roleKey)}
${CREATE_ACTION_GUIDE}
REMOTE WORKERS: smartAgent.runWorker uses an explicitly selected worker {key,peerId}, capability, input and signed accepted job. It shares only these inputs and requires owner approval. Use a discovered worker identity, never invent peers or job IDs.
PAID SMART AGENT JOBS: smartAgent.acceptJob requires agentId and an existing funded jobId. smartAgent.submitResult requires agentId, jobId and resultURI pointing to the agreed deliverable. Both require explicit owner approval and use the smart agent wallet; neither starts work or moves funds merely by planning. Never invent job IDs or claim a transaction succeeded before its receipt.

${goal.goalTitle ? `PARENT GOAL: "${goal.goalTitle}"${goal.goalRationale ? `\nWHY THIS MATTERS: ${goal.goalRationale}` : ""}\n` : ""}ISSUE${goal.priority ? ` [priority: ${goal.priority}]` : ""}:
"${goal.directive}"${goal.description ? `\n\nDETAILS:\n${goal.description}` : ""}

ALLOWED TOOL NAMES: ${allowed.join(", ")}
Use runWorkflow with an available workflowId and its declared inputs to execute an existing smart-agent workflow.
Use produce with a permitted pipeline, prompt or params for local creation. Report local outputs as drafts.
Report actions (publishFinancialReport, publishProductReport, publishComplianceReport, publishExperimentReport) require text (the actual report content) and optionally title. They save a local draft; they do not send it to a customer.
Actions must include a reason and their actual required fields. Never guess identifiers, recipients, amounts or connector availability.
${AGENT_PROTOCOL}`;
}

function _summarize(action) {
  if (action.copy) return action.copy.slice(0, 200);
  if (action.text) return action.text.slice(0, 200);
  if (action.prompt) return action.prompt.slice(0, 200);
  if (action.amount) return `${action.amount} → ${action.recipient || "?"}`;
  return action.type;
}

function _actionReceipt(action, status, result, fallback = "") {
  const contentId = result?.pipeline && result?.id ? String(result.id) : null;
  return {
    type: action?.type || "unknown",
    status,
    reason: action?.reason || action?.justification || fallback || "Required to complete the assigned work.",
    description: _summarize(action || {}),
    contentId,
    evidence: {
      id: result?.id ? String(result.id) : null,
      externalId: result?.externalId || result?.transactionId || result?.txHash || null,
      link: result?.shareLink || result?.txOrLink || result?.url || null,
      message: result?.message || result?.note || null,
    },
  };
}

function _workSummary(issue, out) {
  if (out.executed > 0) return `Completed ${out.executed} action${out.executed === 1 ? "" : "s"} for “${issue.title}”.`;
  if (out.queued > 0) return `Prepared the work for “${issue.title}” and sent it for approval.`;
  return `Could not complete “${issue.title}”; review the recorded evidence and errors.`;
}

function _roleMediaPipelines(charter, roleKey) {
  const configured = charter.roles?.[roleKey]?.pipelines;
  if (!Array.isArray(configured)) return [...CREATE_PIPELINES];
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
export async function _completeJSON(prompt, opts = {}) {
  const t0 = Date.now();
  const timeoutMs=Math.max(LLM_CALL_TIMEOUT_MS,Math.min(Number(opts.timeoutMs)||LLM_CALL_TIMEOUT_MS,30*60*1000));

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
      }), timeoutMs, `pool[${opts.llmModel}]`);
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
  // A role's model binding is part of its harness. Defer if the shared
  // device is busy instead of silently using another team's loaded model.
  if (opts.llmModel && typeof window.electronAPI?.ensureModel === "function") {
    const res = await window.electronAPI.ensureModel(opts.llmModel);
    if (res?.ok === false || res?.declined) throw new Error(res.error || 'The assigned model is busy. Resume this task when it is available.');
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
      companyId: opts.streamContext.companyId,
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
        timeoutMs,
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
    isolated: true,
    temperature: opts.temperature ?? 0.7,
    maxTokens: opts.maxTokens ?? 2048,
    enableThinking: opts.enableThinking ?? false,
  }), timeoutMs, "chat");
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
