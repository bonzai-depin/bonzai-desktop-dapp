import { hasCompletedExecution } from "./taskExecution.js";

/** Display facts from durable execution. Never estimate elapsed-time progress. */
export function taskProgress(issue = {}) {
  const execution = issue.execution;
  const steps = execution?.steps || [];
  const agent = execution?.agent;
  const complete = issue.status === "done" && hasCompletedExecution(execution);
  const settled =
    steps.length > 0 &&
    steps.every(
      (s) =>
        s.status === "completed" ||
        (s.status === "superseded" && s.safeToRevise),
    );
  const running = issue.status === "in_progress";
  const stages = [
    { id: "received", label: "Request received", status: "done" },
    {
      id: "prepare",
      label: "Prepare",
      status: execution ? "done" : running ? "active" : "pending",
    },
    {
      id: "execute",
      label: "Carry out work",
      status: complete || settled ? "done" : running ? "active" : "pending",
    },
    {
      id: "review",
      label: "Check results",
      status: complete ? "done" : settled && running ? "active" : "pending",
    },
    {
      id: "result",
      label: "Result saved",
      status: complete ? "done" : "pending",
    },
  ];
  const waitingStep = steps.find((s) =>
    ["waiting_approval", "pending_approval", "awaiting_approval"].includes(
      s.status,
    ),
  );
  if (waitingStep || steps.some((s) => s.approvalId))
    stages.splice(2, 0, {
      id: "approval",
      label: "Approval",
      status: waitingStep
        ? "waiting"
        : steps.some((s) => s.status === "rejected")
          ? "blocked"
          : "done",
      detail: waitingStep ? "Waiting for your approval" : "",
    });
  if (waitingStep) stages.find((s) => s.id === "execute").status = "pending";
  let detail = "";
  const failed = steps.find((s) =>
    ["failed", "unknown", "rejected", "unsupported", "requires_input"].includes(
      s.status,
    ),
  );
  if (agent?.status === "waiting_owner")
    detail = agent.wait?.question || "Waiting for your answer";
  else if (agent?.status === "waiting_team")
    detail = agent.wait?.reason || "Waiting for another team";
  else if (failed && !waitingStep) detail = failed.error || "Needs review";
  else if (issue.status === "blocked" && !waitingStep)
    detail = issue.lastError || "Needs review";
  if (detail) {
    const stage = stages.find(
      (s) => s.id === (execution ? "execute" : "prepare"),
    );
    stage.status =
      (issue.status === "blocked" || failed) &&
      !agent?.status?.startsWith("waiting_")
        ? "blocked"
        : "waiting";
    stage.detail = detail;
  }
  if (issue.status === "cancelled") {
    const next = stages.find((s) => s.status !== "done");
    if (next) {
      next.status = "cancelled";
      next.detail = "Cancelled";
    }
  }
  // Legacy "done" without receipts remains visibly unverified.
  if (issue.status === "done" && !complete) {
    stages.at(-1).status = "blocked";
    stages.at(-1).detail = "Completion evidence unavailable";
  }
  return stages;
}

export function executionStepLabel(step) {
  const action = step.resolvedAction || step.action || {};
  return (
    action.title ||
    action.description ||
    action.skillId ||
    action.workflowId ||
    action.type ||
    step.id
  );
}

export const progressStatusLabel = (status) =>
  ({
    done: "Completed",
    active: "In progress",
    waiting: "Waiting",
    blocked: "Needs review",
    pending: "Not started",
    cancelled: "Cancelled",
  })[status] || status;
