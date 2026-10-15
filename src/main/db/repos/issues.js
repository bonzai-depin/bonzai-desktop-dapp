import { hasCompletedExecution, settledStep } from '../../../services/company/taskExecution.js';
/**
 * Issues repo + their attempts. Mirrors `services/company/issues.js`.
 *
 * The dispatcher's hot path is `nextForRole` (priority-sorted, FIFO
 * within bucket) — implemented as an indexed query on
 * (company_id, status, priority, created_at).
 */

import { eq, and, desc, asc, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import fs from 'node:fs';
import path from 'node:path';
import { get } from "../connection.js";
import * as blobs from '../blobs.js';
import * as audit from './audit.js';
import * as distribution from "./distribution.js";
import * as goalsRepo from "./goals.js";
import { issues, issueAttempts } from "../schema/companies.js";
import { retryDelayMs, AUTOMATION_DEFAULTS } from "../../../shared/companyAutomation.js";
import { routeCompanyWork } from '../../../shared/companyWorkRouting.js';

function workspaceChannels(companyId) {
  const row = get().db.prepare('SELECT charter FROM companies WHERE id=?').get(companyId);
  const charter = _parseJSON(row?.charter) || {};
  return charter.workspace?.channels || [];
}

const PRIORITY_ORDER = `CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;
const PRIORITIES = ["low", "normal", "high", "urgent"];
const STATUSES = ["open", "in_progress", "blocked", "done", "cancelled"];

export function create(companyId, input) {
  const { orm } = get();
  if (!input?.title?.trim()) throw new Error("title required");
  if (!input?.assigneeRole?.trim()) throw new Error("assigneeRole required");
  const jobReference = input.externalJobReference;
  let jobLabel;
  if (jobReference != null) {
    if (!/^\d+:0x[0-9a-fA-F]{40}:0x[0-9a-fA-F]{64}$/.test(jobReference)) throw new Error('Invalid funded job reference');
    jobLabel = `funded-job:${jobReference.toLowerCase()}`;
    const existing = orm.select().from(issues).where(eq(issues.companyId, companyId)).all()
      .find(issue => issue.labels?.includes(jobLabel));
    if (existing) return existing;
  }
  const now = Date.now();
  const row = {
    id: uuid(),
    companyId,
    goalId: input.goalId ?? null,
    parentIssueId: input.parentIssueId ?? null,
    title: input.title.trim(),
    description: (input.description || "").trim(),
    status: input.execution?.steps?.some(step => step.status === 'requires_input') ? 'blocked' : 'open',
    priority: PRIORITIES.includes(input.priority) ? input.priority : "normal",
    assigneeRole: input.assigneeRole,
    assigneeCompanion: input.assigneeCompanion ?? null,
    labels: [...routeCompanyWork(input, workspaceChannels(companyId)), ...(jobLabel ? [jobLabel] : [])],
    createdBy: input.createdBy || "user",
    attemptCount: 0,
    maxAttempts: Math.max(1, Math.min(10, Number(input.maxAttempts) || AUTOMATION_DEFAULTS.maxAttempts)),
    nextAttemptAt: null,
    lastError: null,
    execution: input.execution ?? null,
    executionRevision: 0,
    createdAt: now,
    updatedAt: now,
  };
  orm.insert(issues).values(row).run();
  return row;
}

export function list(companyId, filter = {}) {
  const { db, orm } = get();
  const where = [eq(issues.companyId, companyId)];
  if (filter.status) where.push(eq(issues.status, filter.status));
  if (filter.assigneeRole) where.push(eq(issues.assigneeRole, filter.assigneeRole));
  if (filter.priority) where.push(eq(issues.priority, filter.priority));
  if (filter.goalId !== undefined) where.push(filter.goalId === null
    ? sql`${issues.goalId} IS NULL` : eq(issues.goalId, filter.goalId));
  const rows = orm.select().from(issues).where(and(...where)).orderBy(desc(issues.createdAt)).all();
  if (!rows.length) return rows;
  const attempts = db.prepare(`
    SELECT a.id, a.issue_id AS issueId, a.role, a.companion, a.status,
           a.started_at AS startedAt, a.finished_at AS finishedAt,
           a.tx_or_link AS txOrLink, a.error, a.result
    FROM issue_attempts a
    JOIN issues i ON i.id = a.issue_id
    WHERE i.company_id = ?
    ORDER BY a.started_at ASC
  `).all(companyId).map((attempt) => ({
    ...attempt,
    result: _parseJSON(attempt.result),
  }));
  const byIssue = new Map();
  for (const attempt of attempts) {
    if (!byIssue.has(attempt.issueId)) byIssue.set(attempt.issueId, []);
    byIssue.get(attempt.issueId).push(attempt);
  }
  const channels = workspaceChannels(companyId);
  return rows.map((row) => ({ ...row, labels: routeCompanyWork(row, channels), attempts: byIssue.get(row.id) || [] }));
}

export function getById(companyId, issueId) {
  const { orm } = get();
  return orm.select().from(issues)
    .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).get() ?? null;
}

export function update(companyId, issueId, patch) {
  const cur = getById(companyId, issueId);
  if (!cur) throw new Error(`issue ${issueId} not found`);
  if ('execution' in patch || 'executionRevision' in patch) throw new Error('Use the execution checkpoint or owner review to change task outcomes.');
  if (patch.status === 'done' && !hasCompletedExecution(cur.execution)) throw new Error('Task completion requires recorded results and a completed outcome review.');
  if (patch.status && patch.status !== cur.status) {
    if (!STATUSES.includes(patch.status)) throw new Error(`invalid status: ${patch.status}`);
    if (cur.status === "done" || cur.status === "cancelled") {
      throw new Error(`cannot transition from terminal status ${cur.status}; reopen first`);
    }
  }
  if (patch.priority && !PRIORITIES.includes(patch.priority)) {
    throw new Error(`invalid priority: ${patch.priority}`);
  }
  const { orm } = get();
  const data = { ...patch, updatedAt: Date.now() };
  delete data.id; delete data.companyId; delete data.createdAt;
  orm.update(issues).set(data)
    .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  return getById(companyId, issueId);
}

export function reopen(companyId, issueId) {
  const cur = getById(companyId, issueId);
  if (!cur) throw new Error('Task not found.');
  if (cur.status === 'in_progress') throw new Error('This task is still running. Pause the team before reviewing it.');
  if (['waiting_team', 'waiting_owner'].includes(cur.execution?.agent?.status)) throw new Error('Respond to the pending question or team request to continue this task.');
  if (cur.execution?.steps?.some(step => ['unknown', 'running', 'waiting_approval', 'rejected'].includes(step.status))) {
    throw new Error('Resolve the recorded approval or uncertain outcome before reopening this task.');
  }
  const execution = cur.execution ? { ...cur.execution, steps: cur.execution.steps.map(step =>
    ['completed','superseded'].includes(step.status) ? step : { id: step.id, action: step.action, status: 'planned' }) } : null;
  reviewHarness(execution);
  const { orm } = get();
  orm.update(issues).set({ status: 'open', attemptCount: 0, nextAttemptAt: null, lastError: null,
    execution, executionRevision: cur.executionRevision + 1, updatedAt: Date.now() }).where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  return getById(companyId, issueId);
}

// Owner resumption permits a fresh configuration check, never replay of completed
// effects. Retain the old binding so the original execution stays attributable.
function reviewHarness(execution) {
  if (!execution) return;
  if (execution.harness) execution.harnessHistory = [...(execution.harnessHistory || []), { ...execution.harness, reviewedAt: Date.now(), reviewedBy: 'owner' }];
  delete execution.harness;
  delete execution.pauseReason;
  if (execution.agent) { execution.agent.status = 'running'; execution.agent.turns = 0; delete execution.agent.wait; }
}

export function remove(companyId, issueId) {
  const { orm } = get();
  orm.delete(issues).where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  return true;
}

/**
 * Hot path — returns the highest-priority "open" issue for the given
 * role, or null. Single indexed query.
 */
export function nextForRole(companyId, roleKey, currentCompanion) {
  const { db } = get();
  const sql = `
    SELECT * FROM issues
    WHERE company_id = ? AND status = 'open' AND assignee_role = ?
      AND (assignee_companion IS NULL OR assignee_companion = ?)
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      AND EXISTS (SELECT 1 FROM companies c WHERE c.id = issues.company_id AND c.status = 'active')
      AND (parent_issue_id IS NULL OR EXISTS (SELECT 1 FROM issues parent
        WHERE parent.id = issues.parent_issue_id AND parent.company_id = issues.company_id AND parent.status = 'done'))
    ORDER BY ${PRIORITY_ORDER}, created_at ASC
    LIMIT 1
  `;
  return db.prepare(sql).get(companyId, roleKey, currentCompanion, Date.now()) || null;
}

/** Atomically claim the next ready issue and create its attempt record. */
export function claimNextForRole(companyId, roleKey, currentCompanion) {
  const { db } = get();
  const now = Date.now();
  return db.transaction(() => {
    const issue = db.prepare(`
      SELECT * FROM issues
      WHERE company_id = ? AND status = 'open' AND assignee_role = ?
        AND (assignee_companion IS NULL OR assignee_companion = ?)
        AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      AND EXISTS (SELECT 1 FROM companies c WHERE c.id = issues.company_id AND c.status = 'active')
      AND (parent_issue_id IS NULL OR EXISTS (SELECT 1 FROM issues parent
        WHERE parent.id = issues.parent_issue_id AND parent.company_id = issues.company_id AND parent.status = 'done'))
      ORDER BY ${PRIORITY_ORDER}, created_at ASC LIMIT 1
    `).get(companyId, roleKey, currentCompanion, now);
    if (!issue) return null;
    const claimed = db.prepare(`UPDATE issues SET status = 'in_progress', updated_at = ?
      WHERE id = ? AND company_id = ? AND status = 'open'`).run(now, issue.id, companyId);
    if (!claimed.changes) return null;
    db.prepare(`INSERT INTO issue_attempts
      (id, issue_id, role, companion, status, started_at, finished_at, tx_or_link, error, result)
      VALUES (?, ?, ?, ?, 'running', ?, NULL, NULL, NULL, NULL)`)
      .run(uuid(), issue.id, roleKey, currentCompanion ?? null, now);
    return getById(companyId, issue.id);
  })();
}

/**
 * Mark the issue in_progress + append a fresh attempt record.
 * Returns the updated issue.
 */
export function startAttempt(companyId, issueId, role, companion) {
  const { db, orm } = get();
  const cur = getById(companyId, issueId);
  if (!cur) throw new Error(`issue ${issueId} not found`);
  if (!["open", "blocked"].includes(cur.status)) throw new Error(`Task is already ${cur.status}.`);
  const now = Date.now();
  const attempt = {
    id: uuid(),
    issueId,
    role: role ?? null,
    companion: companion ?? null,
    status: "running",
    startedAt: now,
    finishedAt: null,
    txOrLink: null,
    error: null,
    result: null,
  };
  const tx = db.transaction(() => {
    orm.insert(issueAttempts).values(attempt).run();
    orm.update(issues).set({ status: "in_progress", updatedAt: now })
      .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  });
  tx();
  return { ...cur, status: "in_progress", updatedAt: now };
}

export function finishAttempt(companyId, issueId, outcome) {
  const { db, orm } = get();
  const cur = getById(companyId, issueId);
  if (!cur) return null;
  if (cur.status !== "in_progress") return cur;
  if (outcome.status === 'done' && !hasCompletedExecution(cur.execution)) throw new Error('Task completion requires recorded results and a completed outcome review.');

  // Find the most recent running attempt
  const att = db.prepare(
    "SELECT * FROM issue_attempts WHERE issue_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1",
  ).get(issueId);

  const now = Date.now();
  const nextAttemptCount = Number(cur.attemptCount || 0) + (outcome.status === "error" ? 1 : 0);
  const retryable = outcome.status === "error" && outcome.retryable !== false
    && nextAttemptCount < Number(cur.maxAttempts || AUTOMATION_DEFAULTS.maxAttempts);
  let nextStatus = outcome.status === "done" ? "done" : "blocked";
  if (outcome.status === "error") nextStatus = retryable ? "open" : "blocked";
  if (outcome.status === "vetoed") nextStatus = "blocked";
  if (outcome.status === "queued") nextStatus = "blocked";
  if (outcome.status === "continue") nextStatus = "open";
  const nextAttemptAt = retryable
    ? now + retryDelayMs(nextAttemptCount, {
        retryBaseMs: Number(outcome.retryBaseMs) || AUTOMATION_DEFAULTS.retryBaseMs,
        retryMaxMs: Number(outcome.retryMaxMs) || AUTOMATION_DEFAULTS.retryMaxMs,
      }, issueId)
    : null;

  const tx = db.transaction(() => {
    if (att) {
      orm.update(issueAttempts).set({
        status: outcome.status || "blocked",
        finishedAt: now,
        txOrLink: outcome.txOrLink ?? null,
        error: outcome.error ?? null,
        result: outcome.result ?? null,
      }).where(eq(issueAttempts.id, att.id)).run();
    }
    orm.update(issues).set({
      status: nextStatus,
      updatedAt: now,
      attemptCount: nextAttemptCount,
      nextAttemptAt,
      lastError: outcome.error ?? (outcome.status === "error" ? "execution failed" : null),
    })
      .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
  });
  tx();
  wakeTeamWaits();
  return getById(companyId, issueId);
}

/** Seen message IDs close the race between a read receipt and a wait checkpoint. */
export function wakeTeamWaits(companyId = null) {
  const { db } = get();
  return db.transaction(() => {
    const rows = db.prepare("SELECT * FROM issues WHERE status='blocked' AND json_extract(execution,'$.agent.status')='waiting_team' AND (? IS NULL OR company_id=?)").all(companyId, companyId);
    let count = 0;
    for (const row of rows) {
      const execution = _parseJSON(row.execution), wait = execution.agent.wait;
      const thread = db.prepare('SELECT t.id, i.status AS task_status FROM team_threads t LEFT JOIN issues i ON i.id=t.issue_id WHERE t.id=? AND (t.source_company_id=? OR t.target_company_id=?)').get(wait.conversationId, row.company_id, row.company_id);
      if (!thread) continue;
      const message = db.prepare('SELECT * FROM team_messages WHERE thread_id=? AND company_id<>? ORDER BY created_at DESC, rowid DESC').all(thread.id, row.company_id)
        .find(message => !(wait.seenMessageIds || []).includes(message.id));
      const outcomeChanged = ['done', 'cancelled'].includes(thread.task_status) && thread.task_status !== wait.seenTaskStatus;
      if (!message && !outcomeChanged) continue;
      execution.agent.status = 'running';
      execution.agent.events.push({ type: 'team_reply', conversationId: thread.id, messageId: message?.id, teamName: message?.team_name, memberName: message?.author_name, text: message?.body, taskStatus: thread.task_status, at: message?.created_at || Date.now() });
      delete execution.agent.wait; delete execution.pauseReason;
      db.prepare("UPDATE issues SET execution=?, execution_revision=execution_revision+1, status='open', last_error=NULL, updated_at=? WHERE id=? AND company_id=?").run(JSON.stringify(execution), Date.now(), row.id, row.company_id);
      count++;
    }
    return { resumed: count };
  })();
}

export function answerQuestion(companyId, issueId, answer) {
  const { db } = get();
  const text = String(answer || '').trim();
  if (!text || text.length > 10000) throw new Error('Enter an answer of 1–10,000 characters.');
  return db.transaction(() => {
    const task = getById(companyId, issueId);
    if (task?.status !== 'blocked' || task.execution?.agent?.status !== 'waiting_owner') throw new Error('This task is not waiting for an answer.');
    const execution = task.execution;
    execution.agent.events.push({ type:'owner_answer', question:execution.agent.wait.question, text, at:Date.now() });
    execution.agent.status = 'running'; delete execution.agent.wait; delete execution.pauseReason;
    db.prepare("UPDATE issues SET execution=?, execution_revision=execution_revision+1, status='open', last_error=NULL, updated_at=? WHERE id=? AND company_id=?").run(JSON.stringify(execution),Date.now(),issueId,companyId);
    return getById(companyId, issueId);
  })();
}

/** Interrupted effects require reconciliation; they are never blindly replayed. */
export function recoverStale(companyId, staleBefore = Date.now() - 600_000) {
  const { db } = get();
  return db.transaction(() => {
    const lease = db.prepare('SELECT lease_expires_at FROM company_automation_state WHERE company_id = ?').get(companyId);
    if (lease?.lease_expires_at > Date.now()) return { recovered: 0 };
    const rows = db.prepare("SELECT * FROM issues WHERE company_id = ? AND status = 'in_progress' AND updated_at < ?").all(companyId, staleBefore);
    for (const row of rows) {
      const execution = _parseJSON(row.execution);
      if (execution) for (const step of execution.steps) {
        const lostApproval = step.status === 'waiting_approval' && db.prepare('SELECT status FROM pending_approvals WHERE id = ? AND company_id = ?').get(step.approvalId, companyId)?.status !== 'pending';
        if (step.status === 'running' || lostApproval) {
          step.status = 'unknown'; step.error = 'Interrupted during execution or approval. Verify the outcome before continuing.';
        }
      }
      const waiting = ['waiting_owner','waiting_team'].includes(execution?.agent?.status);
      const blocked = !execution || waiting || execution.agent?.status === 'blocked' || execution.steps.some(step => step.status !== 'planned' && !settledStep(step) && !(execution.agent && step.status === 'failed' && step.safeToRevise));
      db.prepare("UPDATE issue_attempts SET status = 'interrupted', finished_at = ?, error = ? WHERE issue_id = ? AND status = 'running'")
        .run(Date.now(), 'App stopped before the attempt completed', row.id);
      db.prepare('UPDATE issues SET status = ?, execution = ?, execution_revision = execution_revision + 1, next_attempt_at = NULL, last_error = ?, updated_at = ? WHERE id = ? AND company_id = ?')
        .run(blocked ? 'blocked' : 'open', execution ? JSON.stringify(execution) : null, blocked && !waiting ? 'Review the interrupted outcome before resuming.' : null, Date.now(), row.id, companyId);
    }
    return { recovered: rows.length };
  })();
}

export function reconcileExecution(companyId, issueId, stepId, input) {
  const { db, orm } = get();
  if (!['completed', 'not_performed'].includes(input?.decision) || String(input.evidence || '').trim().length < 10) throw new Error('A review decision and supporting evidence are required.');
  return db.transaction(() => {
    const issue = getById(companyId, issueId);
    if (!issue || issue.status !== 'blocked') throw new Error('Only blocked tasks can be reviewed.');
    const execution = issue.execution;
    const step = execution?.steps?.find(step => step.id === stepId);
    if (!step || !['unknown', 'failed', 'unsupported', 'rejected', 'requires_input', 'simulated'].includes(step.status)) throw new Error('This step does not need outcome review.');
    const artifact = distribution.publish(companyId, { pipeline: 'text', prompt: `Owner review: ${issue.title}`, payload: input.evidence.trim(),
      role: issue.assigneeRole, companion: issue.assigneeCompanion, meta: { issueId, stepId, kind: 'owner-review', decision: input.decision, payloadEncoding: 'text' } });
    const previous = { status: step.status, output: step.output, error: step.error, approvalId: step.approvalId };
    step.reviews = [...(step.reviews || []), { at: Date.now(), decision: input.decision, contentId: artifact.id, previous }];
    delete step.error; delete step.approvalId;
    if (input.decision === 'completed') {
      step.status = 'completed'; step.output = { id: artifact.id, pipeline: 'text', payload: artifact.payload, verifiedBy: 'owner', status: 'completed' };
    } else { step.status = 'planned'; delete step.resolvedAction; delete step.output; }
    // Preserve historical approval rows, but retire their unique active step key.
    db.prepare("UPDATE pending_approvals SET step_id = NULL, status = CASE WHEN status = 'pending' THEN 'expired' ELSE status END WHERE company_id = ? AND issue_id = ? AND step_id = ?").run(companyId, issueId, stepId);
    const completed = !execution.agent && execution.steps.every(step => step.status === 'completed');
    const blocked = execution.steps.some(step => !settledStep(step) && step.status !== 'planned');
    if (!completed && !blocked) reviewHarness(execution);
    orm.update(issues).set({ execution, executionRevision: issue.executionRevision + 1, status: completed ? 'done' : blocked ? 'blocked' : 'open', lastError: null, nextAttemptAt: null, updatedAt: Date.now() })
      .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
    orm.insert(issueAttempts).values({ id: uuid(), issueId, role: 'owner', status: 'reviewed', startedAt: Date.now(), finishedAt: Date.now(), result: {
      summary: input.decision === 'completed' ? 'Owner verified the result.' : 'Owner verified no action occurred; a fresh attempt is allowed.', contentIds: [artifact.id], actions: [{ type: step.action.type, status: step.status, contentId: artifact.id, output: step.output }] } }).run();
    if (completed && issue.goalId) goalsRepo.maybeComplete(companyId, issue.goalId);
    return getById(companyId, issueId);
  })();
}

function workflowResultTask(companyId, issueId, { allowCompleted = false } = {}) {
  const { db } = get();
  if (!db.prepare('SELECT id FROM companies WHERE id = ?').get(companyId)) throw new Error('Team is no longer available.');
  const issue = getById(companyId, issueId);
  if (!issue || (issue.status !== 'blocked' && !(allowCompleted && issue.status === 'done'))) throw new Error('Only a blocked workflow task can save or review a result.');
  if (issue.execution?.steps?.some(step => ['running', 'waiting_approval'].includes(step.status))
    || db.prepare("SELECT id FROM pending_approvals WHERE company_id = ? AND issue_id = ? AND status = 'pending'").get(companyId, issueId)) {
    throw new Error('Resolve the running action or pending approval before saving a workflow result.');
  }
  return issue;
}

function acceptsWorkflowResult(step) {
  return step.action?.type === 'runWorkflow' && (step.status === 'requires_input'
    || (step.status === 'failed' && step.output?.status === 'requires_input'));
}

function workflowResultRecords(companyId, issueId, step, sourceId, contentIds) {
  if (!Array.isArray(contentIds) || !contentIds.length || new Set(contentIds).size !== contentIds.length) throw new Error('Saved workflow results are unavailable.');
  return contentIds.map(id => {
    const record = distribution.getRecord(companyId, id);
    if (!record || record.meta?.issueId !== issueId || record.meta?.stepId !== step.id
      || record.meta?.workflowId !== step.action.workflowId || record.meta?.sourceId !== sourceId
      || (record.blobId && !blobs.exists(record.blobId, record.blobExt))) throw new Error('A saved workflow result is missing or belongs to another task.');
    return record;
  });
}

const WORKFLOW_PIPELINES = new Set(['text', 'code', 'image', 'audio', 'music', 'video', '3d']);
const WORKFLOW_EXTENSIONS = { image: 'png', audio: 'wav', music: 'wav', video: 'mp4', '3d': 'gltf', text: 'txt', code: 'txt' };
const WORKFLOW_MIME_EXTENSIONS = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/webm': 'webm', 'application/json': 'json', 'text/plain': 'txt',
  'model/gltf+json': 'gltf', 'model/gltf-binary': 'glb',
};

function prepareWorkflowArtifact(artifact) {
  if (!artifact || !WORKFLOW_PIPELINES.has(artifact.pipeline)) throw new Error('Unsupported workflow result format.');
  const meta = artifact.meta && typeof artifact.meta === 'object' && !Array.isArray(artifact.meta) ? { ...artifact.meta } : {};
  const prepared = { pipeline: artifact.pipeline, prompt: typeof artifact.prompt === 'string' ? artifact.prompt : null, meta };
  if (meta.payloadEncoding === 'path') {
    const localPath = meta.localPath || artifact.payload;
    if (typeof localPath !== 'string' || !path.isAbsolute(localPath)) throw new Error('Workflow media must use an absolute local file path.');
    const stat = fs.statSync(localPath);
    if (!stat.isFile() || !stat.size) throw new Error('Workflow media must be a nonempty local file.');
    const extension = path.extname(localPath).slice(1).toLowerCase();
    const ext = /^[a-z0-9]{1,12}$/.test(extension) ? extension : WORKFLOW_EXTENSIONS[artifact.pipeline];
    return { ...prepared, localPath, ext };
  }
  if (typeof artifact.payload !== 'string' || !artifact.payload.trim()) throw new Error('A workflow result cannot be empty.');
  if (artifact.payload.startsWith('data:')) {
    const data = artifact.payload.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!data || data[2].length % 4 !== 0 || !Buffer.from(data[2], 'base64').length) throw new Error('Workflow media must contain valid base64 data.');
    return { ...prepared, payload: artifact.payload, ext: WORKFLOW_MIME_EXTENSIONS[data[1].toLowerCase()] || WORKFLOW_EXTENSIONS[artifact.pipeline], mimeType: data[1].toLowerCase() };
  }
  if (!['text', 'code'].includes(artifact.pipeline) || (meta.payloadEncoding && meta.payloadEncoding !== 'text')) throw new Error('Workflow media must use a data URI or a local file path.');
  return { ...prepared, payload: artifact.payload, meta: { ...meta, payloadEncoding: 'text' } };
}

/** Capture local outputs without treating successful generation as owner acceptance. */
export function saveWorkflowResult(companyId, issueId, input) {
  if (typeof input?.workflowId !== 'string' || !input.workflowId.trim()
    || typeof input.sourceId !== 'string' || !input.sourceId.trim() || input.sourceId.length > 256) throw new Error('Workflow and result source are required.');
  if (!Array.isArray(input.artifacts) || !input.artifacts.length || input.artifacts.length > 24) throw new Error('A workflow result needs between 1 and 24 artifacts.');
  const { db, orm } = get();
  return db.transaction(() => {
    const issue = workflowResultTask(companyId, issueId, { allowCompleted: true });
    const matching = (issue.execution?.steps || []).filter(step => step.action?.type === 'runWorkflow' && step.action.workflowId === input.workflowId);
    if (matching.length !== 1) throw new Error('This task does not have one interactive step for this workflow.');
    const step = matching[0];
    const previous = step.workflowResults?.find(result => result.sourceId === input.sourceId);
    if (previous) return { issue, contentIds: previous.contentIds, records: workflowResultRecords(companyId, issueId, step, input.sourceId, previous.contentIds) };
    // A recovery replay may acknowledge already-saved output after owner review,
    // but cannot replace or reopen an approved task.
    if (issue.status !== 'blocked') throw new Error('Only a blocked workflow task can save or review a result.');
    if (!acceptsWorkflowResult(step)) throw new Error('This task does not have one interactive step for this workflow.');
    // Validate every artifact before copying media or adding catalog records.
    const artifacts = input.artifacts.map(prepareWorkflowArtifact);
    const records = artifacts.map(artifact => {
      const meta = { ...artifact.meta, issueId, stepId: step.id, workflowId: input.workflowId, sourceId: input.sourceId, kind: 'workflow-result' };
      let blob;
      if (artifact.localPath) blob = blobs.writeFromPath(artifact.localPath, artifact.ext, { source: 'workflow', sourceId: input.sourceId, mimeType: meta.mimeType });
      else if (artifact.ext) blob = blobs.writeBase64(artifact.payload, artifact.ext, { source: 'workflow', sourceId: input.sourceId, mimeType: artifact.mimeType });
      if (blob) { delete meta.localPath; meta.payloadEncoding = 'blob'; }
      return distribution.publish(companyId, {
        pipeline: artifact.pipeline, prompt: artifact.prompt || issue.title, role: issue.assigneeRole, companion: issue.assigneeCompanion,
        ...(blob ? { blobId: blob.id, blobExt: artifact.ext } : { payload: artifact.payload }), meta,
      });
    });
    const contentIds = records.map(record => record.id);
    step.workflowResults = [...(step.workflowResults || []), { sourceId: input.sourceId, contentIds, savedAt: Date.now() }];
    step.output = { workflowId: input.workflowId, contentIds, sourceId: input.sourceId, status: 'ready_for_review' };
    step.status = 'requires_input';
    delete step.error;
    orm.update(issues).set({ execution: issue.execution, executionRevision: issue.executionRevision + 1, lastError: null, nextAttemptAt: null, updatedAt: Date.now() })
      .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
    audit.append(companyId, { kind: 'production', role: issue.assigneeRole, action: 'saveWorkflowResult', status: 'saved', issueId, contentId: contentIds[0], contentIds, workflowId: input.workflowId, note: 'Workflow results saved for owner review.' });
    return { issue: getById(companyId, issueId), records, contentIds };
  })();
}

/** The explicit review keeps the generated artifact IDs as the task's evidence. */
export function reviewWorkflowResult(companyId, issueId, stepId, input) {
  const { db, orm } = get();
  return db.transaction(() => {
    const issue = workflowResultTask(companyId, issueId);
    const execution = issue.execution;
    const step = execution?.steps?.find(item => item.id === stepId);
    if (!step || !acceptsWorkflowResult(step) || step.output?.status !== 'ready_for_review') throw new Error('This workflow has no saved result awaiting review.');
    const contentIds = step.output.contentIds;
    if (!Array.isArray(input?.contentIds) || JSON.stringify(input.contentIds) !== JSON.stringify(contentIds)) throw new Error('The workflow result changed. Review the latest saved results.');
    workflowResultRecords(companyId, issueId, step, step.output.sourceId, contentIds);
    const now = Date.now();
    step.reviews = [...(step.reviews || []), { at: now, decision: 'completed', contentIds: [...contentIds], sourceId: step.output.sourceId, verifiedBy: 'owner' }];
    step.status = 'completed'; step.finishedAt = now;
    step.output = { ...step.output, id: contentIds[0], status: 'completed', verifiedBy: 'owner' };
    delete step.error; delete step.approvalId;
    db.prepare("UPDATE pending_approvals SET step_id = NULL WHERE company_id = ? AND issue_id = ? AND step_id = ?").run(companyId, issueId, stepId);
    const completed = !execution.agent && execution.steps.every(item => item.status === 'completed');
    const blocked = execution.steps.some(item => !settledStep(item) && item.status !== 'planned');
    if (!completed && !blocked) reviewHarness(execution);
    orm.update(issues).set({ execution, executionRevision: issue.executionRevision + 1, status: completed ? 'done' : blocked ? 'blocked' : 'open', lastError: null, nextAttemptAt: null, updatedAt: now })
      .where(and(eq(issues.companyId, companyId), eq(issues.id, issueId))).run();
    orm.insert(issueAttempts).values({ id: uuid(), issueId, role: 'owner', status: 'reviewed', startedAt: now, finishedAt: now, result: {
      summary: 'Owner reviewed the saved workflow results.', contentIds, actions: [{ type: 'runWorkflow', status: 'completed', contentId: contentIds[0], output: step.output }],
    } }).run();
    audit.append(companyId, { kind: 'review', role: 'owner', action: 'reviewWorkflowResult', status: 'executed', issueId, contentId: contentIds[0], contentIds, note: 'Owner approved the saved workflow results.' });
    if (completed && issue.goalId) goalsRepo.maybeComplete(companyId, issue.goalId);
    return getById(companyId, issueId);
  })();
}

export function saveExecution(companyId, issueId, execution, expectedRevision) {
  const { db } = get();
  if (execution?.version !== 1 || !Array.isArray(execution.steps)) throw new Error('Invalid execution record.');
  const result = db.prepare(`UPDATE issues SET execution = ?, execution_revision = execution_revision + 1, updated_at = ?
    WHERE id = ? AND company_id = ? AND status = 'in_progress' AND execution_revision = ?`)
    .run(JSON.stringify(execution), Date.now(), issueId, companyId, expectedRevision);
  if (!result.changes) throw new Error('Task changed or is no longer running. Execution stopped.');
  return getById(companyId, issueId);
}

/** Claim precisely the task associated with a pending approval. */
export function resumeApproval(companyId, pendingId) {
  const { db } = get();
  return db.transaction(() => {
    const approval = db.prepare("SELECT * FROM pending_approvals WHERE company_id = ? AND id = ? AND status = 'pending'").get(companyId, pendingId);
    if (!approval?.issue_id) throw new Error('This approval is not linked to a task.');
    const company = db.prepare('SELECT status FROM companies WHERE id = ?').get(companyId);
    if (company?.status !== 'active') throw new Error('Resume the company before approving execution.');
    const issue = getById(companyId, approval.issue_id);
    const step = issue?.execution?.steps?.find(step => step.id === approval.step_id);
    if (issue?.status !== 'blocked' || step?.status !== 'waiting_approval' || step.approvalId !== pendingId) throw new Error('This approval no longer matches a waiting task.');
    return startAttempt(companyId, issue.id, issue.assigneeRole, approval.requested_by);
  })();
}

export function attempts(issueId) {
  const { orm } = get();
  return orm.select().from(issueAttempts)
    .where(eq(issueAttempts.issueId, issueId))
    .orderBy(asc(issueAttempts.startedAt)).all();
}

export function counts(companyId) {
  const { db } = get();
  const rows = db.prepare(
    "SELECT status, COUNT(*) AS n FROM issues WHERE company_id = ? GROUP BY status",
  ).all(companyId);
  const out = { total: 0, open: 0, in_progress: 0, blocked: 0, done: 0, cancelled: 0 };
  for (const r of rows) { out.total += r.n; if (out[r.status] !== undefined) out[r.status] = r.n; }
  return out;
}

export function clear(companyId) {
  const { db } = get();
  // Cascade: drop attempts for the company's issues first
  db.prepare(`
    DELETE FROM issue_attempts WHERE issue_id IN (
      SELECT id FROM issues WHERE company_id = ?
    )
  `).run(companyId);
  db.prepare("DELETE FROM issues WHERE company_id = ?").run(companyId);
}

export function bulkInsert(items) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO issues (
      id, company_id, goal_id, parent_issue_id, title, description,
      status, priority, assignee_role, assignee_companion, labels,
      created_by, created_at, updated_at
    ) VALUES (
      @id, @companyId, @goalId, @parentIssueId, @title, @description,
      @status, @priority, @assigneeRole, @assigneeCompanion, @labels,
      @createdBy, @createdAt, @updatedAt
    )
  `);
  const attemptStmt = db.prepare(`
    INSERT OR IGNORE INTO issue_attempts (
      id, issue_id, role, companion, status, started_at, finished_at, tx_or_link, error, result
    ) VALUES (
      @id, @issueId, @role, @companion, @status, @startedAt, @finishedAt, @txOrLink, @error, @result
    )
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      stmt.run({
        id: r.id || uuid(),
        companyId: r.companyId,
        goalId: r.goalId ?? null,
        parentIssueId: r.parentIssueId ?? null,
        title: r.title,
        description: r.description ?? null,
        status: r.status || "open",
        priority: r.priority || "normal",
        assigneeRole: r.assigneeRole ?? null,
        assigneeCompanion: r.assigneeCompanion ?? null,
        labels: r.labels ? JSON.stringify(r.labels) : null,
        createdBy: r.createdBy ?? null,
        createdAt: r.createdAt || Date.now(),
        updatedAt: r.updatedAt || Date.now(),
      });
      if (Array.isArray(r.attempts)) {
        for (const a of r.attempts) {
          attemptStmt.run({
            id: a.id || uuid(),
            issueId: r.id,
            role: a.role ?? null,
            companion: a.companion ?? null,
            status: a.status ?? null,
            startedAt: a.startedAt || Date.now(),
            finishedAt: a.finishedAt ?? null,
            txOrLink: a.txOrLink ?? null,
            error: a.error ?? null,
            result: a.result ? JSON.stringify(a.result) : null,
          });
        }
      }
    }
  });
  tx(items);
  return items.length;
}

function _parseJSON(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return null; }
}
