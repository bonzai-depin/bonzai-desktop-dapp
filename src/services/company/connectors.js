/**
 * BonzAI Company — Connectors
 *
 * A Connector is a credential + transport binding to a third-party
 * service (Twilio, QuickBooks, Stripe, Google Calendar, Shopify, …).
 *
 * Architecture:
 *  - One connector per (company × service-kind) is the common case, but
 *    a company can hold multiple connectors of the same kind (e.g. two
 *    Twilio numbers).
 *  - One connector is consumed by many SKILLS. The Twilio connector
 *    powers `twilio-voice-triage`, `twilio-sms-broadcast`, `twilio-whatsapp`.
 *  - Credentials live in OS keychain in production. For v0 they live in
 *    Electron Store under a `secret:` prefix that the main process is
 *    expected to gate behind biometrics in a later iteration.
 *
 * Lifecycle:
 *   acquire (oauth or apiKey) → validate → use → refresh → revoke
 *
 * Public CRUD is typed; secret blobs never cross IPC after install.
 */

import { v4 as uuid } from "uuid";
import { append, _notify } from "./auditLog.js";

const KEY = (id) => `companies/${id}/connectors`;
const SECRET_KEY = (id, connId) => `companies/${id}/connectors/${connId}/secret`;

/** Statuses a connector can be in. */
export const CONNECTOR_STATUSES = [
  "needs_auth",   // user has declared intent but not finished auth
  "active",       // credentials present + last validated OK
  "expired",      // OAuth token expired; refresh needed
  "revoked",      // user revoked or platform revoked
  "broken",       // last validation failed for non-auth reason
];

/** Auth flavors supported by the connector primitive. */
export const AUTH_TYPES = ["oauth2", "apiKey", "basic", "none"];

const _cache = new Map(); // companyId -> connector[]

async function _hydrate(companyId) {
  if (_cache.has(companyId)) return _cache.get(companyId);
  const raw = await window.electronAPI?.store?.get?.(KEY(companyId), []);
  const list = Array.isArray(raw) ? raw : [];
  _cache.set(companyId, list);
  return list;
}

async function _persist(companyId) {
  const list = _cache.get(companyId) || [];
  await window.electronAPI?.store?.set?.(KEY(companyId), list);
}

/**
 * Persist credential bundle separately from the public connector record.
 * In production this would write to OS keychain via keytar; for v0 we
 * write to Electron Store under a different key prefix so the public
 * connector list stays serializable and easy to inspect.
 */
async function _writeSecret(companyId, connId, secret) {
  if (!secret) return;
  await window.electronAPI?.store?.set?.(SECRET_KEY(companyId, connId), secret);
}
async function _readSecret(companyId, connId) {
  return window.electronAPI?.store?.get?.(SECRET_KEY(companyId, connId), null);
}
async function _deleteSecret(companyId, connId) {
  await window.electronAPI?.store?.delete?.(SECRET_KEY(companyId, connId));
}

// ─────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a new connector. The `secret` field (apiKey / OAuth tokens / basic
 * creds) is stripped from the returned record and stored separately.
 *
 * @param {string} companyId
 * @param {object} input
 *   { kind, label?, authType, scopes?, accountIdentifier?, secret? }
 */
export async function create(companyId, input) {
  if (!input?.kind) throw new Error("connector.kind required");
  if (!AUTH_TYPES.includes(input.authType || "none")) {
    throw new Error(`unknown authType: ${input.authType}`);
  }

  const now = Date.now();
  const conn = {
    id: uuid(),
    companyId,
    kind: input.kind,
    label: input.label || input.kind,
    authType: input.authType || "none",
    scopes: Array.isArray(input.scopes) ? input.scopes : [],
    accountIdentifier: input.accountIdentifier || null,
    status: input.secret || input.authType === "none" ? "active" : "needs_auth",
    createdAt: now,
    updatedAt: now,
    lastValidatedAt: input.secret ? now : null,
    lastUsedAt: null,
    error: null,
  };

  const list = await _hydrate(companyId);
  list.push(conn);
  await _persist(companyId);

  if (input.secret) await _writeSecret(companyId, conn.id, input.secret);

  await append(companyId, {
    kind: "system", action: "createConnector", status: "executed",
    note: `${conn.kind}${conn.accountIdentifier ? ` (${conn.accountIdentifier})` : ""}`,
    connectorId: conn.id,
  });
  _notify();
  return conn;
}

/** List connectors for a company (no secrets returned). */
export async function list(companyId, filter = {}) {
  const all = await _hydrate(companyId);
  let out = [...all];
  if (filter.kind) out = out.filter((c) => c.kind === filter.kind);
  if (filter.status) out = out.filter((c) => c.status === filter.status);
  return out;
}

/** Single connector lookup. */
export async function get(companyId, connId) {
  const all = await _hydrate(companyId);
  return all.find((c) => c.id === connId) || null;
}

/** Look up by service kind — returns the FIRST active connector of that kind. */
export async function getByKind(companyId, kind) {
  const all = await _hydrate(companyId);
  return all.find((c) => c.kind === kind && c.status === "active") || null;
}

/** Update mutable metadata (label, scopes, status). Secrets go via setSecret. */
export async function update(companyId, connId, patch) {
  const all = await _hydrate(companyId);
  const idx = all.findIndex((c) => c.id === connId);
  if (idx < 0) throw new Error(`connector ${connId} not found`);
  all[idx] = { ...all[idx], ...patch, id: all[idx].id, companyId, updatedAt: Date.now() };
  await _persist(companyId);
  _notify();
  return all[idx];
}

/** Replace the credential blob for a connector. */
export async function setSecret(companyId, connId, secret) {
  const conn = await get(companyId, connId);
  if (!conn) throw new Error(`connector ${connId} not found`);
  await _writeSecret(companyId, connId, secret);
  return update(companyId, connId, {
    status: "active",
    lastValidatedAt: Date.now(),
    error: null,
  });
}

/** Revoke + wipe credentials. The record stays so audit history is preserved. */
export async function revoke(companyId, connId, reason) {
  await _deleteSecret(companyId, connId);
  const conn = await update(companyId, connId, { status: "revoked", error: reason || null });
  await append(companyId, {
    kind: "system", action: "revokeConnector", status: "executed",
    note: `${conn.kind}: ${reason || "user-revoked"}`,
    connectorId: connId,
  });
  return conn;
}

/** Delete the connector record entirely (after revocation). */
export async function remove(companyId, connId) {
  await _deleteSecret(companyId, connId);
  const all = await _hydrate(companyId);
  const idx = all.findIndex((c) => c.id === connId);
  if (idx < 0) return false;
  all.splice(idx, 1);
  await _persist(companyId);
  _notify();
  return true;
}

/** Wipe everything for the company (called on dissolve). */
export async function clear(companyId) {
  const all = await _hydrate(companyId);
  for (const c of all) await _deleteSecret(companyId, c.id);
  _cache.delete(companyId);
  await window.electronAPI?.store?.delete?.(KEY(companyId));
}

// ─────────────────────────────────────────────────────────────────────────
// Validation + audit hooks for skill calls
// ─────────────────────────────────────────────────────────────────────────

/**
 * Resolve the credential bundle for a skill call. Returns null if the
 * connector is missing/unhealthy — the caller must handle gracefully.
 * Updates lastUsedAt as a side-effect.
 */
export async function resolveForCall(companyId, connId) {
  const conn = await get(companyId, connId);
  if (!conn || conn.status !== "active") return null;
  const secret = await _readSecret(companyId, connId);
  await update(companyId, connId, { lastUsedAt: Date.now() });
  return { ...conn, secret };
}

/**
 * Quick health summary for UI badges. Returns `{ active, needsAuth, broken }`
 * counts so the dashboard can show "3 of 5 connectors healthy" at a glance.
 */
export async function healthSummary(companyId) {
  const all = await _hydrate(companyId);
  const out = { total: all.length, active: 0, needs_auth: 0, expired: 0, broken: 0, revoked: 0 };
  for (const c of all) if (out[c.status] !== undefined) out[c.status]++;
  return out;
}
