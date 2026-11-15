/**
 * Companies repo. Wraps the full charter as a JSON column so the
 * existing renderer-side `makeCharter` / `validateCharter` shape
 * round-trips without per-field flattening. Top-level fields used in
 * lookups (name, mode, status, demoMode, templateId) are mirrored to
 * dedicated columns for indexing.
 */

import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { companies } from "../schema/companies.js";

function _toRow(charter) {
  return {
    id: charter.id || uuid(),
    name: charter.name,
    mode: charter.mode || "solo",
    status: charter.status || "active",
    mission: charter.mission ?? null,
    templateId: charter.template?.id ?? null,
    demoMode: charter.demoMode === true ? 1 : 0,
    charter,
    createdAt: charter.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

export function save(charter) {
  const { db, orm } = get();
  const row = _toRow(charter);
  const existing = db.prepare("SELECT id FROM companies WHERE id = ?").get(row.id);
  if (existing) {
    orm.update(companies).set({
      name: row.name, mode: row.mode, status: row.status, mission: row.mission,
      templateId: row.templateId, demoMode: row.demoMode, charter: row.charter,
      updatedAt: row.updatedAt,
    }).where(eq(companies.id, row.id)).run();
  } else {
    orm.insert(companies).values(row).run();
  }
  return row.charter;
}

export function getById(id) {
  const { orm } = get();
  const r = orm.select().from(companies).where(eq(companies.id, id)).get();
  return r?.charter ?? null;
}

export function list({ includeDemos = false } = {}) {
  const { orm } = get();
  return orm.select().from(companies).orderBy(desc(companies.updatedAt)).all().map((r) => r.charter).filter(c => includeDemos || !c.demoRun);
}

export function listIds() {
  return list().map(c => c.id);
}

export function setStatus(id, status) {
  const { db, orm } = get();
  const charterRow = db.prepare("SELECT charter FROM companies WHERE id = ?").get(id);
  if (!charterRow) return null;
  let charter = JSON.parse(charterRow.charter);
  charter.status = status;
  charter.updatedAt = Date.now();
  orm.update(companies).set({ status, charter, updatedAt: Date.now() }).where(eq(companies.id, id)).run();
  return charter;
}

export function remove(id) {
  const { orm } = get();
  orm.delete(companies).where(eq(companies.id, id)).run();
  return true;
}

// Shared history tables where company_id is only an optional tag: the
// owner's media gallery, skill run history and the job board outlive a team.
const KEEP_ON_DISSOLVE = new Set(["generations", "skill_runs", "agent_jobs"]);
const COMPANY_MEMORY = "(scope = 'company' AND identity_id = ?) OR (scope = 'team' AND json_extract(metadata_json, '$.companyId') = ?)";

/**
 * Permanently delete a team and every row that belongs to it, in one
 * transaction: either the whole team is gone or nothing changed. Covers
 * every table carrying a company_id (discovered from the schema so new
 * workspaces are included), task attempts, team conversations and the
 * team's memory. The audit trail is only ever removed here, together
 * with its team.
 */
export function dissolve(id) {
  const { db } = get();
  if (!id || typeof id !== "string") throw new Error("Team not found.");
  return db.transaction(() => {
    db.pragma("defer_foreign_keys = ON");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
    const has = (table) => tables.includes(table);
    const columns = (table) => db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name);
    if (has("issue_attempts")) db.prepare("DELETE FROM issue_attempts WHERE issue_id IN (SELECT id FROM issues WHERE company_id = ?)").run(id);
    if (has("team_threads")) {
      db.prepare("DELETE FROM team_messages WHERE thread_id IN (SELECT id FROM team_threads WHERE source_company_id = ? OR target_company_id = ?)").run(id, id);
      db.prepare("DELETE FROM team_threads WHERE source_company_id = ? OR target_company_id = ?").run(id, id);
    }
    if (has("memory_instances")) {
      for (const table of tables) {
        if (table === "memory_instances" || !table.startsWith("memory_") || !columns(table).includes("instance_key")) continue;
        db.prepare(`DELETE FROM "${table}" WHERE instance_key IN (SELECT instance_key FROM memory_instances WHERE ${COMPANY_MEMORY})`).run(id, id);
      }
      db.prepare(`DELETE FROM memory_instances WHERE ${COMPANY_MEMORY}`).run(id, id);
    }
    for (const table of tables) {
      if (table === "companies" || KEEP_ON_DISSOLVE.has(table) || !columns(table).includes("company_id")) continue;
      db.prepare(`DELETE FROM "${table}" WHERE company_id = ?`).run(id);
    }
    const removed = db.prepare("DELETE FROM companies WHERE id = ?").run(id).changes > 0;
    // Memory change tracking records the deletions above; it has no team left to sync.
    if (has("memory_company_changes")) db.prepare("DELETE FROM memory_company_changes WHERE company_id = ?").run(id);
    return removed;
  })();
}

export function bulkInsert(charters) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO companies
      (id, name, mode, status, mission, template_id, demo_mode, charter, created_at, updated_at)
    VALUES
      (@id, @name, @mode, @status, @mission, @templateId, @demoMode, @charter, @createdAt, @updatedAt)
  `);
  const tx = db.transaction((rows) => {
    for (const c of rows) {
      const row = _toRow(c);
      stmt.run({ ...row, charter: JSON.stringify(row.charter) });
    }
  });
  tx(charters);
  return charters.length;
}
