/**
 * BonzAI Company — Connectors (renderer-side adapter, SQLite-backed).
 *
 * Public CRUD is typed; secret blobs are stored separately in
 * Electron safeStorage-encrypted blobs. The connector row's `secretRef`
 * points at the encrypted store key; the row never holds credentials.
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
const SECRET_KEY = (companyId, connId) => `secret:${companyId}:${connId}`;

async function _writeSecret(companyId, connId, secret, metadata = {}) {
  if (!secret) return null;
  if (window.electronAPI?.companyConnector?.setSecret) {
    await window.electronAPI.companyConnector.setSecret(companyId, connId, secret, metadata);
  } else {
    throw new Error("Secure connector storage is unavailable. Restart BonzAI before connecting this service.");
  }
  return SECRET_KEY(companyId, connId);
}
async function _deleteSecret(companyId, connId) {
  if (window.electronAPI?.companyConnector?.deleteSecret) {
    await window.electronAPI.companyConnector.deleteSecret(companyId, connId);
  }
  await window.electronAPI?.store?.delete?.(SECRET_KEY(companyId, connId));
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export async function create(companyId, input) {
  const conn = await _safe((api) => api.create(companyId, input), null);
  if (!conn) return null;
  if (input.secret) {
    const ref = await _writeSecret(companyId, conn.id, input.secret, {
      kind: conn.kind,
      accountIdentifier: conn.accountIdentifier,
    });
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

export async function setSecret(companyId, connId, secret, patch = {}) {
  let conn = await get(companyId, connId);
  if (!conn) throw new Error("Connector not found");
  if (patch.label || patch.accountIdentifier !== undefined) {
    conn = await update(companyId, connId, {
      ...(patch.label ? { label: patch.label } : {}),
      ...(patch.accountIdentifier !== undefined ? { accountIdentifier: patch.accountIdentifier || null } : {}),
    });
  }
  const ref = await _writeSecret(companyId, connId, secret, {
    kind: conn.kind,
    accountIdentifier: conn.accountIdentifier,
  });
  if (!ref) return null;
  try {
    if (!window.electronAPI?.companyConnector?.validate) throw new Error("Connector validation is unavailable");
    await window.electronAPI.companyConnector.validate(companyId, connId);
    const active = await _safe((api) => api.setSecretRef(companyId, connId, ref), null);
    _notify();
    return active;
  } catch (error) {
    await update(companyId, connId, { status: "broken", error: error.message || "Credential validation failed" });
    throw error;
  }
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
  await update(companyId, connId, { lastUsedAt: Date.now() });
  return conn;
}

export async function request(companyId, connector, spec) {
  if (!connector?.id || connector.status !== "active") throw new Error("Connector is not active");
  if (!window.electronAPI?.companyConnector?.request) throw new Error("Secure connector proxy is unavailable");
  try {
    const result = await window.electronAPI.companyConnector.request({
      companyId,
      connectorId: connector.id,
      connectorKind: connector.kind,
      accountIdentifier: connector.accountIdentifier,
      ...spec,
    });
    await update(companyId, connector.id, { lastUsedAt: Date.now(), lastValidatedAt: Date.now(), error: null });
    return spec.includeResponseMetadata ? { data: result.data, status: result.status, headers: result.headers || {} } : result.data;
  } catch (error) {
    const message = error?.message || "Connector request failed";
    const authFailure = /\b(401|403)\b|unauthori[sz]ed|forbidden|expired|invalid token/i.test(message);
    await update(companyId, connector.id, {
      status: authFailure ? "expired" : connector.status,
      error: message.slice(0, 240),
    });
    throw error;
  }
}

export async function healthSummary(companyId) {
  return _safe(
    (api) => api.healthSummary(companyId),
    { total: 0, active: 0, needs_auth: 0, expired: 0, broken: 0, revoked: 0 },
  );
}
