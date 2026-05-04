/**
 * BonzAI Company — Solo Mode treasury (renderer-side adapter, SQLite-backed).
 *
 * Same API as the legacy module: recordRevenue / paySupplier / getState
 * / recomputeFromLog. Heavy logic (cap + reserve-floor checks, ledger
 * entry insertion, balance update) lives in the main-process repo
 * inside a single transaction. Audit-log entries are mirrored from
 * the renderer side so the live feed picks them up.
 */

import { append, _notify } from "./auditLog.js";

const _api = () => window.electronAPI?.db?.treasury || null;
let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[treasury] data layer not reachable — ledger writes will be dropped. " +
    "Run `npm install` and restart. Error: " + (err?.message || err || "no IPC handler"),
  );
}
async function _safe(fn, fallback) {
  const api = _api();
  if (!api) { _warnOnce(); return fallback; }
  try { return await fn(api); }
  catch (err) {
    // recordRevenue / paySupplier throw on currency / cap / reserve
    // floor violations — those are EXPECTED business-rule errors that
    // should propagate to the caller (the dispatcher logs them as
    // action errors). Only swallow IPC-level failures.
    if (err?.message && /no handler|disconnected|destroyed/i.test(err.message)) {
      _warnOnce(err);
      return fallback;
    }
    throw err;
  }
}

export async function recordRevenue(companyId, opts) {
  const out = await _safe((api) => api.recordRevenue(companyId, opts), null);
  if (out?.entry) {
    await append(companyId, {
      kind: "treasury", direction: "in", role: out.entry.role,
      action: "recordRevenue", status: "executed",
      amount: out.entry.amount / 100, currency: out.entry.currency,
      source: out.entry.source, note: out.entry.note || "",
      externalId: out.entry.externalId, balanceAfter: (out.entry.balanceAfter ?? 0) / 100,
    });
    _notify();
  }
  return out;
}

export async function paySupplier(companyId, opts) {
  const out = await _safe((api) => api.paySupplier(companyId, opts), null);
  if (out?.entry) {
    await append(companyId, {
      kind: "treasury", direction: "out", role: out.entry.role,
      action: "paySupplier", status: "executed",
      amount: out.entry.amount / 100, currency: out.entry.currency,
      recipient: out.entry.recipient, note: out.entry.note || "",
      balanceAfter: (out.entry.balanceAfter ?? 0) / 100,
    });
    _notify();
  }
  return out;
}

export async function getState(companyId) {
  return _safe(
    (api) => api.getState(companyId),
    { balance: 0, totalIn: 0, totalOut: 0, currency: "USD" },
  );
}

export async function listEntries(companyId, opts) {
  return _safe((api) => api.listEntries(companyId, opts), []);
}

export async function reset(companyId) {
  await _safe((api) => api.reset(companyId), null);
}

/**
 * Legacy `recomputeFromLog` — derived from audit. Now derived from
 * SQL state; kept for API compatibility. Returns the current state.
 */
export async function recomputeFromLog(companyId) {
  return getState(companyId);
}
