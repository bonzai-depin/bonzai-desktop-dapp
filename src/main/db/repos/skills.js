/**
 * Skills repo — installations, execution history, co-ownership cache.
 *
 * The legacy in-memory `skillExecutionHistory` array persists nothing
 * past renderer reload; this lifts it into an indexed table so the
 * BrowseAgents leaderboard, per-skill analytics page, and revenue
 * dashboards can join across companions × skills × runs without
 * re-walking JSON blobs.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { skills, skillRuns, skillOwnership } from "../schema/skills.js";

// ─── Skills ──────────────────────────────────────────────────────────

export function upsertSkill(record) {
  const { db, orm } = get();
  const id = record.id;
  const existing = db.prepare("SELECT id FROM skills WHERE id = ?").get(id);
  const row = {
    id,
    name: record.name,
    category: record.category ?? null,
    version: record.version ?? null,
    manifest: record.manifest ?? null,
    installedAt: record.installedAt || Date.now(),
    source: record.source ?? "builtin",
    purchasedAt: record.purchasedAt ?? null,
    purchasePrice: record.purchasePrice ?? null,
    purchaseCurrency: record.purchaseCurrency ?? null,
  };
  if (existing) orm.update(skills).set(row).where(eq(skills.id, id)).run();
  else orm.insert(skills).values(row).run();
  return row;
}

export function listSkills(filter = {}) {
  const { orm } = get();
  let q = orm.select().from(skills);
  if (filter.category) q = q.where(eq(skills.category, filter.category));
  if (filter.source) q = q.where(eq(skills.source, filter.source));
  return q.orderBy(desc(skills.installedAt)).all();
}

export function getSkill(id) {
  const { orm } = get();
  return orm.select().from(skills).where(eq(skills.id, id)).get() ?? null;
}

export function bulkInsertSkills(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO skills (
      id, name, category, version, manifest, installed_at, source,
      purchased_at, purchase_price, purchase_currency
    ) VALUES (
      @id, @name, @category, @version, @manifest, @installedAt, @source,
      @purchasedAt, @purchasePrice, @purchaseCurrency
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id, name: r.name || r.id,
      category: r.category ?? null, version: r.version ?? null,
      manifest: r.manifest ? JSON.stringify(r.manifest) : null,
      installedAt: r.installedAt || Date.now(),
      source: r.source ?? "builtin",
      purchasedAt: r.purchasedAt ?? null,
      purchasePrice: r.purchasePrice ?? null,
      purchaseCurrency: r.purchaseCurrency ?? null,
    });
  });
  tx(rows);
  return rows.length;
}

// ─── Skill runs (execution history + analytics) ─────────────────────

export function recordRun(run) {
  const { orm } = get();
  const row = {
    id: run.id || uuid(),
    skillId: run.skillId,
    actionType: run.actionType,
    triggeredBy: run.triggeredBy ?? null,
    companyId: run.companyId ?? null,
    companionId: run.companionId ?? null,
    params: run.params ?? null,
    result: run.result ?? null,
    status: run.status || "executed",
    durationMs: run.durationMs ?? null,
    costEstimateCents: run.costEstimateCents ?? null,
    txHash: run.txHash ?? null,
    shareLink: run.shareLink ?? null,
    createdAt: run.createdAt || Date.now(),
  };
  orm.insert(skillRuns).values(row).run();
  return row;
}

export function listRuns(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.skillId) where.push(eq(skillRuns.skillId, filter.skillId));
  if (filter.companyId) where.push(eq(skillRuns.companyId, filter.companyId));
  if (filter.companionId) where.push(eq(skillRuns.companionId, filter.companionId));
  if (filter.status) where.push(eq(skillRuns.status, filter.status));
  let q = orm.select().from(skillRuns);
  if (where.length) q = q.where(and(...where));
  return q.orderBy(desc(skillRuns.createdAt)).limit(filter.limit ?? 100).all();
}

export function runStats(skillId) {
  const { db } = get();
  const r = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) AS success,
           SUM(CASE WHEN status = 'error'    THEN 1 ELSE 0 END) AS error,
           AVG(duration_ms) AS avg_duration_ms,
           SUM(cost_estimate_cents) AS total_cost_cents
    FROM skill_runs WHERE skill_id = ?
  `).get(skillId);
  return r || { total: 0, success: 0, error: 0, avg_duration_ms: 0, total_cost_cents: 0 };
}

export function bulkInsertRuns(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO skill_runs (
      id, skill_id, action_type, triggered_by, company_id, companion_id,
      params, result, status, duration_ms, cost_estimate_cents,
      tx_hash, share_link, created_at
    ) VALUES (
      @id, @skillId, @actionType, @triggeredBy, @companyId, @companionId,
      @params, @result, @status, @durationMs, @costEstimateCents,
      @txHash, @shareLink, @createdAt
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      skillId: r.skillId,
      actionType: r.actionType,
      triggeredBy: r.triggeredBy ?? null,
      companyId: r.companyId ?? null,
      companionId: r.companionId ?? null,
      params: r.params ? JSON.stringify(r.params) : null,
      result: r.result ? JSON.stringify(r.result) : null,
      status: r.status || "executed",
      durationMs: r.durationMs ?? null,
      costEstimateCents: r.costEstimateCents ?? null,
      txHash: r.txHash ?? null,
      shareLink: r.shareLink ?? null,
      createdAt: r.createdAt || Date.now(),
    });
  });
  tx(rows);
  return rows.length;
}

// ─── Co-ownership cache ─────────────────────────────────────────────

export function registerOwnership(reg) {
  const { orm } = get();
  const row = {
    id: reg.id || uuid(),
    skillId: reg.skillId,
    companionId: reg.companionId,
    weightSnapshot: reg.weightSnapshot ?? null,
    profileScore: reg.profileScore ?? null,
    registeredAt: reg.registeredAt || Date.now(),
    lastClaimAt: null,
    totalEarnedCents: 0,
    chainAttestation: reg.chainAttestation ?? null,
  };
  orm.insert(skillOwnership).values(row).run();
  return row;
}

export function listOwnership(filter = {}) {
  const { orm } = get();
  const where = [];
  if (filter.skillId) where.push(eq(skillOwnership.skillId, filter.skillId));
  if (filter.companionId) where.push(eq(skillOwnership.companionId, filter.companionId));
  let q = orm.select().from(skillOwnership);
  if (where.length) q = q.where(and(...where));
  return q.all();
}

export function recordClaim(skillId, companionId, payoutCents) {
  const { db } = get();
  db.prepare(`
    UPDATE skill_ownership
    SET last_claim_at = ?, total_earned_cents = COALESCE(total_earned_cents, 0) + ?
    WHERE skill_id = ? AND companion_id = ?
  `).run(Date.now(), payoutCents, skillId, companionId);
}
