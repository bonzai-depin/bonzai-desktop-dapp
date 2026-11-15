/**
 * Recurring business work. A schedule creates one ordinary task per occurrence
 * through the issues repo, so scheduled work is claimed, retried, reviewed and
 * audited exactly like any other task.
 */

import { eq, and, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import * as audit from "./audit.js";
import * as issuesRepo from "./issues.js";
import { companySchedules } from "../schema/companies.js";
import { nextRun, validateCadence } from "../../../shared/companySchedule.js";

const PRIORITIES = ["low", "normal", "high", "urgent"];
const UNFINISHED = ["open", "in_progress", "blocked"];

function companyOf(companyId) {
  const row = get().db.prepare("SELECT status, demo_mode, charter FROM companies WHERE id = ?").get(companyId);
  if (!row) throw new Error("Team not found.");
  let charter = {};
  try { charter = JSON.parse(row.charter) || {}; } catch { /* unreadable charter has no roles */ }
  return { status: row.status, demo: Boolean(row.demo_mode), roles: Object.keys(charter.roles || {}) };
}

function fields(companyId, input, current = {}) {
  const title = String(input.title ?? current.title ?? "").trim();
  if (!title) throw new Error("Scheduled work needs a title.");
  const assigneeRole = String(input.assigneeRole ?? current.assigneeRole ?? "").trim();
  // Work addressed to a role nobody fills would be created and never picked up.
  if (!companyOf(companyId).roles.includes(assigneeRole)) throw new Error("Choose a role from this team.");
  const priority = input.priority ?? current.priority ?? "normal";
  if (!PRIORITIES.includes(priority)) throw new Error(`invalid priority: ${priority}`);
  return {
    title: title.slice(0, 200),
    description: String(input.description ?? current.description ?? "").trim().slice(0, 4000),
    assigneeRole,
    priority,
    cadence: validateCadence(input.cadence ?? current.cadence),
  };
}

export function list(companyId) {
  const { orm } = get();
  return orm.select().from(companySchedules).where(eq(companySchedules.companyId, companyId)).orderBy(asc(companySchedules.createdAt)).all();
}

export function getById(companyId, id) {
  const { orm } = get();
  return orm.select().from(companySchedules)
    .where(and(eq(companySchedules.companyId, companyId), eq(companySchedules.id, id))).get() ?? null;
}

export function create(companyId, input = {}) {
  const { orm } = get();
  const now = Date.now();
  const data = fields(companyId, input);
  const row = { id: uuid(), companyId, ...data, nextRunAt: nextRun(data.cadence, now), lastRunAt: null, lastIssueId: null,
    enabled: input.enabled !== false, createdAt: now, updatedAt: now };
  orm.insert(companySchedules).values(row).run();
  audit.append(companyId, { kind: "schedule", role: row.assigneeRole, action: "schedule.created", status: "executed", note: row.title });
  return row;
}

export function update(companyId, id, patch = {}) {
  const { orm } = get();
  const current = getById(companyId, id);
  if (!current) throw new Error("Scheduled work not found.");
  const now = Date.now();
  const data = fields(companyId, patch, current);
  const enabled = "enabled" in patch ? Boolean(patch.enabled) : current.enabled;
  // Re-enabling or changing the cadence starts from now: paused occurrences are not replayed.
  const restart = (enabled && !current.enabled) || JSON.stringify(data.cadence) !== JSON.stringify(current.cadence);
  orm.update(companySchedules).set({ ...data, enabled, nextRunAt: restart ? nextRun(data.cadence, now) : current.nextRunAt, updatedAt: now })
    .where(and(eq(companySchedules.companyId, companyId), eq(companySchedules.id, id))).run();
  if (enabled !== current.enabled) audit.append(companyId, { kind: "schedule", role: data.assigneeRole, action: enabled ? "schedule.enabled" : "schedule.disabled", status: "executed", note: data.title });
  return getById(companyId, id);
}

export function remove(companyId, id) {
  const { orm } = get();
  const current = getById(companyId, id);
  if (!current) return true;
  orm.delete(companySchedules).where(and(eq(companySchedules.companyId, companyId), eq(companySchedules.id, id))).run();
  audit.append(companyId, { kind: "schedule", role: current.assigneeRole, action: "schedule.removed", status: "executed", note: current.title });
  return true;
}

/**
 * Create the tasks that are due. Runs only for an active, non-demo team: a
 * paused team must not accumulate work, and a rehearsal must not create real
 * recurring tasks. Occurrences missed while the app was closed collapse into
 * one run, and an occurrence is skipped while the previous one is unfinished,
 * so the backlog never fills with duplicates of the same job.
 */
export function runDue(companyId, now = Date.now()) {
  const { db } = get();
  return db.transaction(() => {
    const result = { created: [], skipped: [] };
    const company = db.prepare("SELECT status, demo_mode FROM companies WHERE id = ?").get(companyId);
    if (!company || company.status !== "active" || company.demo_mode) return result;
    const due = db.prepare("SELECT id FROM company_schedules WHERE company_id = ? AND enabled = 1 AND next_run_at <= ? ORDER BY next_run_at, created_at").all(companyId, now);
    for (const { id } of due) {
      const schedule = getById(companyId, id);
      const next = nextRun(schedule.cadence, now);
      const previous = schedule.lastIssueId ? issuesRepo.getById(companyId, schedule.lastIssueId) : null;
      if (previous && UNFINISHED.includes(previous.status)) {
        db.prepare("UPDATE company_schedules SET next_run_at = ?, updated_at = ? WHERE id = ? AND company_id = ?").run(next, now, id, companyId);
        audit.append(companyId, { kind: "schedule", role: schedule.assigneeRole, action: "schedule.skipped", status: "skipped", issueId: previous.id,
          note: `Skipped "${schedule.title}": the previous run is unfinished.`.slice(0, 500) });
        result.skipped.push(id);
        continue;
      }
      const issue = issuesRepo.create(companyId, { title: schedule.title, description: schedule.description, assigneeRole: schedule.assigneeRole,
        priority: schedule.priority, createdBy: "schedule", dueAt: next, labels: [`schedule:${id}`] });
      db.prepare("UPDATE company_schedules SET next_run_at = ?, last_run_at = ?, last_issue_id = ?, updated_at = ? WHERE id = ? AND company_id = ?")
        .run(next, now, issue.id, now, id, companyId);
      audit.append(companyId, { kind: "schedule", role: schedule.assigneeRole, action: "schedule.run", status: "executed", issueId: issue.id,
        note: `Scheduled task created: ${schedule.title}`.slice(0, 500) });
      result.created.push(issue);
    }
    return result;
  })();
}
