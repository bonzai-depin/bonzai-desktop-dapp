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

export function list() {
  const { orm } = get();
  return orm.select().from(companies).orderBy(desc(companies.updatedAt)).all().map((r) => r.charter);
}

export function listIds() {
  const { db } = get();
  return db.prepare("SELECT id FROM companies ORDER BY updated_at DESC").all().map((r) => r.id);
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
