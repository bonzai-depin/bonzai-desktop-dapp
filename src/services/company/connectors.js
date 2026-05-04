/**
 * BonzAI Company — Connectors (renderer-side adapter, SQLite-backed).
 *
 * Public CRUD is typed; secret blobs are stored separately in
 * electron-store under a `secret:` prefix (Phase 6 swaps to OS
 * keychain via keytar). The connector row's `secretRef` points at
 * the keychain / store key — the row itself never holds raw bytes.
 */

import { append, _notify } from "./auditLog.js";

export const CONNECTOR_STATUSES = [
  "needs_auth",   // user has declared intent but not finished auth
  "active",       // credentials present + last validated OK
  "expired",      // OAuth token expired; refresh needed
  "revoked",      // user revoked or platform revoked
  "broken",       // last validation failed for non-auth reason
];

export const AUTH_TYPES = ["oauth2", "apiKey", "basic", "none"];

const _api = () => window.electronAPI?.db?.connectors || null;
let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[connectors] data layer not reachable. Run `npm install` and restart. " +
    "Error: " + (err?.message || err || "no IPC handler"),
  );
}
async function _safe(fn, fallback) {
  const api = _api();
  if (!api) { _warnOnce(); return fallback; }
  try { return await fn(api); }
  catch (err) { _warnOnce(err); return fallback; }
}

// ─── Secret store ─────────────────────────────────────────────────────
// v0: Electron Store under a `secret:` prefix. Phase 6 swaps to OS
// keychain via keytar. The renderer-side store IPC is preserved so the
// secret round-trip works even when the new SQLite layer isn't up.
const SECRET_KEY = (companyId, connId) => `secret:${companyId}:${connId}`;

async function _writeSecret(companyId, connId, secret) {
  if (!secret) return null;
  await window.electronAPI?.store?.set?.(SECRET_KEY(companyId, connId), secret);
  return SECRET_KEY(companyId, connId);
}
async function _deleteSecret(companyId, connId) {
  await window.electronAPI?.store?.delete?.(SECRET_KEY(companyId, connId));
}
async function _readSecret(companyId, connId) {
  return window.electronAPI?.store?.get?.(SECRET_KEY(companyId, connId), null);
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export async function create(companyId, input) {
  const conn = await _safe((api) => api.create(companyId, input), null);
  if (!conn) return null;
  if (input.secret) {
    const ref = await _writeSecret(companyId, conn.id, input.secret);
    if (ref) await _safe((api) => api.setSecretRef(companyId, conn.id, ref), null);
  }
  await append(companyId, {
    kind: "system", action: "createConnector", status: "executed",
    note: `${conn.kind}${conn.accountIdentifier ? ` (${conn.accountIdentifier})` : ""}`,
    connectorId: conn.id,
  });
  _notify();
  return conn;
}

export async function list(companyId, filter) {
  return _safe((api) => api.list(companyId, filter), []);
}

export async function get(companyId, connId) {
  return _safe((api) => api.get(companyId, connId), null);
}

export async function getByKind(companyId, kind) {
  return _safe((api) => api.getByKind(companyId, kind), null);
}

export async function update(companyId, connId, patch) {
  const c = await _safe((api) => api.update(companyId, connId, patch), null);
  if (c) _notify();
  return c;
}

export async function setSecret(companyId, connId, secret) {
  const ref = await _writeSecret(companyId, connId, secret);
  if (!ref) return null;
  const c = await _safe((api) => api.setSecretRef(companyId, connId, ref), null);
  _notify();
  return c;
}

export async function revoke(companyId, connId, reason) {
  await _deleteSecret(companyId, connId);
  const c = await _safe((api) => api.revoke(companyId, connId, reason), null);
  if (c) {
    await append(companyId, {
      kind: "system", action: "revokeConnector", status: "executed",
      note: `${c.kind}: ${reason || "user-revoked"}`, connectorId: connId,
    });
    _notify();
  }
  return c;
}

export async function remove(companyId, connId) {
  await _deleteSecret(companyId, connId);
  const ok = await _safe((api) => api.remove(companyId, connId), { ok: false });
  _notify();
  return !!ok;
}

export async function clear(companyId) {
  // v0: secrets aren't tracked individually outside the SQL row; the
  // company-level dissolve flow walks each connector and revokes.
  const list = await _safe((api) => api.list(companyId), []);
  for (const c of list) await _deleteSecret(companyId, c.id);
  await _safe((api) => api.clear(companyId), null);
}

export async function resolveForCall(companyId, connId) {
  const conn = await get(companyId, connId);
  if (!conn || conn.status !== "active") return null;
  const secret = await _readSecret(companyId, connId);
  await update(companyId, connId, { lastUsedAt: Date.now() });
  return { ...conn, secret };
}

export async function healthSummary(companyId) {
  return _safe(
    (api) => api.healthSummary(companyId),
    { total: 0, active: 0, needs_auth: 0, expired: 0, broken: 0, revoked: 0 },
  );
}
