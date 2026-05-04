/**
 * Connectors repo. Mirrors `services/company/connectors.js`.
 *
 * Secrets stay OUT of this row by design — `secret_ref` is the
 * stable id used to look up the credential in the OS keychain
 * (Phase 6 wires keytar). For v0 the renderer-side adapter still
 * writes secrets to electron-store under the same key prefix the
 * legacy module used; the row's `secret_ref` matches that key.
 */

import { eq, and, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { connectors } from "../schema/companies.js";

export function create(companyId, input) {
  if (!input?.kind) throw new Error("connector.kind required");
  const { orm } = get();
  const now = Date.now();
  const row = {
    id: uuid(),
    companyId,
    kind: input.kind,
    label: input.label || input.kind,
    authType: input.authType || "none",
    scopes: Array.isArray(input.scopes) ? input.scopes : [],
    accountIdentifier: input.accountIdentifier ?? null,
    status: input.authType === "none" ? "active" : "needs_auth",
    error: null,
    secretRef: null,
    createdAt: now,
    updatedAt: now,
    lastValidatedAt: null,
    lastUsedAt: null,
  };
  orm.insert(connectors).values(row).run();
  return row;
}

export function list(companyId, filter = {}) {
  const { orm } = get();
  const where = [eq(connectors.companyId, companyId)];
  if (filter.kind) where.push(eq(connectors.kind, filter.kind));
  if (filter.status) where.push(eq(connectors.status, filter.status));
  return orm.select().from(connectors).where(and(...where))
    .orderBy(desc(connectors.updatedAt)).all();
}

export function getById(companyId, connId) {
  const { orm } = get();
  return orm.select().from(connectors)
    .where(and(eq(connectors.companyId, companyId), eq(connectors.id, connId))).get() ?? null;
}

export function getByKind(companyId, kind) {
  const { orm } = get();
  return orm.select().from(connectors)
    .where(and(
      eq(connectors.companyId, companyId),
      eq(connectors.kind, kind),
      eq(connectors.status, "active"),
    )).get() ?? null;
}

export function update(companyId, connId, patch) {
  const { orm } = get();
  const data = { ...patch, updatedAt: Date.now() };
  delete data.id; delete data.companyId; delete data.createdAt;
  orm.update(connectors).set(data)
    .where(and(eq(connectors.companyId, companyId), eq(connectors.id, connId))).run();
  return getById(companyId, connId);
}

/**
 * Mark active + remember the secret-vault key. The actual secret blob
 * is written by the renderer adapter against the OS keychain (or
 * electron-store in v0).
 */
export function setSecretRef(companyId, connId, secretRef) {
  return update(companyId, connId, {
    status: "active",
    secretRef,
    lastValidatedAt: Date.now(),
    error: null,
  });
}

export function revoke(companyId, connId, reason) {
  return update(companyId, connId, {
    status: "revoked",
    error: reason ?? null,
  });
}

export function remove(companyId, connId) {
  const { orm } = get();
  orm.delete(connectors)
    .where(and(eq(connectors.companyId, companyId), eq(connectors.id, connId))).run();
  return true;
}

export function clear(companyId) {
  const { orm } = get();
  orm.delete(connectors).where(eq(connectors.companyId, companyId)).run();
}

export function healthSummary(companyId) {
  const { db } = get();
  const rows = db.prepare(
    "SELECT status, COUNT(*) AS n FROM connectors WHERE company_id = ? GROUP BY status",
  ).all(companyId);
  const out = { total: 0, active: 0, needs_auth: 0, expired: 0, broken: 0, revoked: 0 };
  for (const r of rows) { out.total += r.n; if (out[r.status] !== undefined) out[r.status] = r.n; }
  return out;
}

export function bulkInsert(rows) {
  const { db } = get();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO connectors (
      id, company_id, kind, label, auth_type, scopes, account_identifier,
      status, error, secret_ref, created_at, updated_at, last_validated_at, last_used_at
    ) VALUES (
      @id, @companyId, @kind, @label, @authType, @scopes, @accountIdentifier,
      @status, @error, @secretRef, @createdAt, @updatedAt, @lastValidatedAt, @lastUsedAt
    )
  `);
  const tx = db.transaction((items) => {
    for (const r of items) stmt.run({
      id: r.id || uuid(),
      companyId: r.companyId,
      kind: r.kind,
      label: r.label ?? null,
      authType: r.authType || "none",
      scopes: r.scopes ? JSON.stringify(r.scopes) : null,
      accountIdentifier: r.accountIdentifier ?? null,
      status: r.status || "needs_auth",
      error: r.error ?? null,
      secretRef: r.secretRef ?? null,
      createdAt: r.createdAt || Date.now(),
      updatedAt: r.updatedAt || Date.now(),
      lastValidatedAt: r.lastValidatedAt ?? null,
      lastUsedAt: r.lastUsedAt ?? null,
    });
  });
  tx(rows);
  return rows.length;
}
