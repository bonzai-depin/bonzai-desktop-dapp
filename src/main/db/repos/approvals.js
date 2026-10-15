/**
 * Approvals repo. Mirrors `services/company/governance.solo.js`.
 *
 * The dispatcher's `gateAction` enqueues a row when veto-mode is
 * `pause-for-approval`. The Approvals sub-tab reads `pending(...)`
 * to render the queue. `approve(...)` returns the action so the
 * caller can dispatch it.
 */

import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { pendingApprovals } from "../schema/companies.js";

export function enqueue(companyId, { cls, action, role, requestedBy, issueId = null, stepId = null }) {
  const { orm, db } = get();
  if (issueId && stepId) {
    const existing = orm.select().from(pendingApprovals).where(and(eq(pendingApprovals.companyId, companyId), eq(pendingApprovals.issueId, issueId), eq(pendingApprovals.stepId, stepId))).get();
    if (existing) {
      if (existing.status !== 'pending' || JSON.stringify(existing.action) !== JSON.stringify(action)) throw new Error('This task step already has a different or decided approval.');
      return existing;
    }
    if (!db.prepare('SELECT id FROM issues WHERE id = ? AND company_id = ?').get(issueId, companyId)) throw new Error('Task not found.');
  }
  const row = {
    id: uuid(),
    companyId,
    cls,
    issueId, stepId,
    action,
    role: role ?? null,
    requestedBy: requestedBy ?? null,
    requestedAt: Date.now(),
    decidedAt: null,
    status: "pending",
    rejectReason: null,
  };
  orm.insert(pendingApprovals).values(row).run();
  return row;
}

export function pending(companyId) {
  const { orm } = get();
  return orm.select().from(pendingApprovals)
    .where(and(eq(pendingApprovals.companyId, companyId), eq(pendingApprovals.status, "pending")))
    .orderBy(desc(pendingApprovals.requestedAt)).all();
}

export function approve(companyId, pendingId) {
  const { orm, db } = get();
  const row = db.prepare("SELECT * FROM pending_approvals WHERE id = ? AND company_id = ?")
    .get(pendingId, companyId);
  if (!row) throw new Error("pending action not found");
  if (row.status !== "pending") throw new Error(`already ${row.status}`);
  orm.update(pendingApprovals)
    .set({ status: "approved", decidedAt: Date.now() })
    .where(eq(pendingApprovals.id, pendingId)).run();
  return JSON.parse(row.action);
}

export function reject(companyId, pendingId, reason) {
  return get().db.transaction(() => rejectInTransaction(companyId, pendingId, reason))();
}

function rejectInTransaction(companyId, pendingId, reason) {
  const { orm, db } = get();
  const row = db.prepare("SELECT * FROM pending_approvals WHERE id = ? AND company_id = ?")
    .get(pendingId, companyId);
  if (!row) throw new Error("pending action not found");
  if (row.status !== "pending") throw new Error(`already ${row.status}`);
  orm.update(pendingApprovals)
    .set({ status: "rejected", decidedAt: Date.now(), rejectReason: reason ?? null })
    .where(eq(pendingApprovals.id, pendingId)).run();
  if (row.issue_id) {
    const issue = db.prepare('SELECT execution FROM issues WHERE company_id = ? AND id = ?').get(companyId, row.issue_id);
    const execution = issue?.execution ? JSON.parse(issue.execution) : null;
    const step = execution?.steps.find(step => step.id === row.step_id);
    if (step) {
      step.status = 'rejected'; step.error = reason || 'Owner rejected this action.';
      db.prepare("UPDATE issues SET status = 'blocked', execution = ?, execution_revision = execution_revision + 1, last_error = ?, updated_at = ? WHERE company_id = ? AND id = ?")
        .run(JSON.stringify(execution), step.error, Date.now(), companyId, row.issue_id);
    }
  }
  return { ...row, action: JSON.parse(row.action), status: "rejected", rejectReason: reason ?? null };
}

export function clear(companyId) {
  const { orm } = get();
  orm.delete(pendingApprovals).where(eq(pendingApprovals.companyId, companyId)).run();
}

export function bulkInsert(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO pending_approvals (
      id, company_id, cls, action, role, requested_by,
      requested_at, decided_at, status, reject_reason
    ) VALUES (
      @id, @companyId, @cls, @action, @role, @requestedBy,
      @requestedAt, @decidedAt, @status, @rejectReason
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      companyId: r.companyId,
      cls: r.cls,
      action: r.action ? JSON.stringify(r.action) : "{}",
      role: r.role ?? null,
      requestedBy: r.requestedBy ?? null,
      requestedAt: r.requestedAt || Date.now(),
      decidedAt: r.decidedAt ?? null,
      status: r.status || "pending",
      rejectReason: r.rejectReason ?? null,
    });
  });
  tx(rows);
  return rows.length;
}
