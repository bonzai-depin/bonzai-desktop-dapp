import { get } from "../connection.js";
import { v4 as uuid } from "uuid";
import crypto from "node:crypto";

const parse = (value, fallback = []) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const jobRow = (row) => row ? ({
  id: row.id, employerWallet: row.employer_wallet, companyId: row.company_id, title: row.title,
  description: row.description, requirements: parse(row.requirements_json), budgetCents: row.budget_cents,
  currency: row.currency, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
}) : null;
const applicationRow = (row) => row ? ({
  id: row.id, jobId: row.job_id, companionId: row.companion_id, ownerWallet: row.owner_wallet,
  pitch: row.pitch, proposedCents: row.proposed_cents, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
}) : null;
const contractRow = (row) => row ? ({
  id: row.id, jobId: row.job_id, applicationId: row.application_id, employerWallet: row.employer_wallet,
  workerWallet: row.worker_wallet, companionId: row.companion_id, termsHash: row.terms_hash,
  escrowTxHash: row.escrow_tx_hash, status: row.status, createdAt: row.created_at, completedAt: row.completed_at,
}) : null;
const milestoneRow = (row) => row ? ({
  id: row.id, contractId: row.contract_id, title: row.title, description: row.description,
  amountCents: row.amount_cents, status: row.status, evidence: parse(row.evidence_json),
  dueAt: row.due_at, createdAt: row.created_at, completedAt: row.completed_at,
}) : null;

export function createJob(input) {
  const { db } = get();
  const now = Date.now();
  const row = {
    id: input.id || uuid(), employerWallet: input.employerWallet || null, companyId: input.companyId || null,
    title: input.title, description: input.description, requirements: input.requirements || [],
    budgetCents: Number(input.budgetCents || 0), currency: input.currency || "USD", status: "open", createdAt: now, updatedAt: now,
  };
  db.prepare(`INSERT INTO agent_jobs (id, employer_wallet, company_id, title, description, requirements_json, budget_cents, currency, status, created_at, updated_at)
    VALUES (@id,@employerWallet,@companyId,@title,@description,@requirements,@budgetCents,@currency,@status,@createdAt,@updatedAt)`)
    .run({ ...row, requirements: JSON.stringify(row.requirements) });
  return row;
}
export function listJobs(filter = {}) {
  const { db } = get();
  const rows = filter.status && filter.status !== "all"
    ? db.prepare("SELECT * FROM agent_jobs WHERE status = ? ORDER BY updated_at DESC").all(filter.status)
    : db.prepare("SELECT * FROM agent_jobs ORDER BY updated_at DESC").all();
  return rows.map(jobRow);
}
export function getJob(id) { const { db } = get(); return jobRow(db.prepare("SELECT * FROM agent_jobs WHERE id = ?").get(id)); }
export function setJobStatus(id, status) { const { db } = get(); db.prepare("UPDATE agent_jobs SET status=?, updated_at=? WHERE id=?").run(status, Date.now(), id); return getJob(id); }
export function apply(jobId, input) {
  const { db } = get(); const now = Date.now();
  const row = { id: uuid(), jobId, companionId: input.companionId, ownerWallet: input.ownerWallet || null, pitch: input.pitch, proposedCents: Number(input.proposedCents || 0), status: "submitted", createdAt: now, updatedAt: now };
  db.prepare(`INSERT INTO agent_job_applications (id,job_id,companion_id,owner_wallet,pitch,proposed_cents,status,created_at,updated_at)
    VALUES (@id,@jobId,@companionId,@ownerWallet,@pitch,@proposedCents,@status,@createdAt,@updatedAt)
    ON CONFLICT(job_id,companion_id) DO UPDATE SET pitch=excluded.pitch, proposed_cents=excluded.proposed_cents, status='submitted', updated_at=excluded.updated_at`).run(row);
  return row;
}
export function listApplications(jobId) { const { db } = get(); return db.prepare("SELECT * FROM agent_job_applications WHERE job_id=? ORDER BY updated_at DESC").all(jobId).map(applicationRow); }
export function hire(jobId, applicationId) {
  const { db } = get(); const now = Date.now();
  return db.transaction(() => {
    const job = getJob(jobId); const app = db.prepare("SELECT * FROM agent_job_applications WHERE id=? AND job_id=?").get(applicationId, jobId);
    if (!job || !app) throw new Error("Job or application not found");
    if (job.status !== "open") throw new Error("Job is no longer open");
    const termsHash = `0x${crypto.createHash("sha256").update(JSON.stringify({ job, app })).digest("hex")}`;
    const contract = { id: uuid(), jobId, applicationId, employerWallet: job.employerWallet, workerWallet: app.owner_wallet, companionId: app.companion_id, termsHash, status: "active", createdAt: now };
    db.prepare(`INSERT INTO agent_job_contracts (id,job_id,application_id,employer_wallet,worker_wallet,companion_id,terms_hash,status,created_at)
      VALUES (@id,@jobId,@applicationId,@employerWallet,@workerWallet,@companionId,@termsHash,@status,@createdAt)`).run(contract);
    db.prepare("UPDATE agent_job_applications SET status=CASE WHEN id=? THEN 'accepted' ELSE 'declined' END, updated_at=? WHERE job_id=?").run(applicationId, now, jobId);
    db.prepare("UPDATE agent_jobs SET status='in_progress', updated_at=? WHERE id=?").run(now, jobId);
    return contract;
  })();
}
export function getContract(jobId) { const { db } = get(); return contractRow(db.prepare("SELECT * FROM agent_job_contracts WHERE job_id=?").get(jobId)); }
export function addMilestone(contractId, input) {
  const { db } = get(); const now = Date.now();
  const row = { id: uuid(), contractId, title: input.title, description: input.description || null, amountCents: Number(input.amountCents || 0), status: "open", evidence: [], dueAt: input.dueAt || null, createdAt: now };
  db.prepare(`INSERT INTO agent_job_milestones (id,contract_id,title,description,amount_cents,status,evidence_json,due_at,created_at)
    VALUES (@id,@contractId,@title,@description,@amountCents,@status,@evidence,@dueAt,@createdAt)`).run({ ...row, evidence: "[]" });
  return row;
}
export function listMilestones(contractId) { const { db } = get(); return db.prepare("SELECT * FROM agent_job_milestones WHERE contract_id=? ORDER BY created_at").all(contractId).map(milestoneRow); }
export function submitEvidence(id, evidence) { const { db } = get(); const row = db.prepare("SELECT * FROM agent_job_milestones WHERE id=?").get(id); if (!row) throw new Error("Milestone not found"); const items = [...parse(row.evidence_json), evidence]; db.prepare("UPDATE agent_job_milestones SET evidence_json=?, status='submitted' WHERE id=?").run(JSON.stringify(items), id); return milestoneRow(db.prepare("SELECT * FROM agent_job_milestones WHERE id=?").get(id)); }
export function approveMilestone(id) {
  const { db } = get(); const now = Date.now();
  return db.transaction(() => {
    const raw = db.prepare("SELECT * FROM agent_job_milestones WHERE id=?").get(id);
    if (!raw) throw new Error("Milestone not found");
    db.prepare("UPDATE agent_job_milestones SET status='approved', completed_at=? WHERE id=?").run(now, id);
    const remaining = db.prepare("SELECT COUNT(*) count FROM agent_job_milestones WHERE contract_id=? AND status!='approved'").get(raw.contract_id).count;
    const total = db.prepare("SELECT COUNT(*) count FROM agent_job_milestones WHERE contract_id=?").get(raw.contract_id).count;
    if (total > 0 && remaining === 0) {
      const contract = db.prepare("SELECT job_id FROM agent_job_contracts WHERE id=?").get(raw.contract_id);
      db.prepare("UPDATE agent_job_contracts SET status='completed', completed_at=? WHERE id=?").run(now, raw.contract_id);
      db.prepare("UPDATE agent_jobs SET status='completed', updated_at=? WHERE id=?").run(now, contract.job_id);
    }
    return milestoneRow(db.prepare("SELECT * FROM agent_job_milestones WHERE id=?").get(id));
  })();
}
export function review(contractId, input) { const { db } = get(); const row = { id: uuid(), contractId, reviewerWallet: input.reviewerWallet || null, companionId: input.companionId, rating: Math.max(1, Math.min(5, Number(input.rating))), review: input.review || null, evidenceHash: input.evidenceHash || null, createdAt: Date.now() }; db.prepare(`INSERT INTO agent_job_reviews (id,contract_id,reviewer_wallet,companion_id,rating,review,evidence_hash,created_at) VALUES (@id,@contractId,@reviewerWallet,@companionId,@rating,@review,@evidenceHash,@createdAt)`).run(row); return row; }
export function reputation(companionId) { const { db } = get(); return db.prepare("SELECT COUNT(*) count, COALESCE(AVG(rating),0) rating FROM agent_job_reviews WHERE companion_id=?").get(companionId); }
