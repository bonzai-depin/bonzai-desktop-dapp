/**
 * BonzAI Company — Audit log (renderer-side adapter)
 *
 * Thin pass-through to `window.electronAPI.db.audit.*`. The actual
 * storage lives in SQLite in the main process; this module exists
 * solely to keep the existing service consumers (dispatcher, treasury,
 * goals, issues, etc.) on a stable import path.
 *
 * Read-only views may degrade when the database is unavailable. Writes must
 * fail visibly: an agent must not continue believing unrecorded work is durable.
 */

const _api = () => window.electronAPI?.db?.audit || null;

let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[audit] data layer not reachable — activity history is unavailable " +
    "until the DB is open. Run `npm install` to install better-sqlite3 + " +
    "drizzle-orm + sqlite-vec, then restart the app. Underlying error: " +
    (err?.message || err || "no IPC handler"),
  );
}

/**
 * Wrap an IPC call so a missing handler / rejection becomes a safe
 * default for read-only views. append() deliberately does not use this.
 */
async function _safe(fn, fallback) {
  const api = _api();
  if (!api) { _warnOnce(); return fallback; }
  try {
    return await fn(api);
  } catch (err) {
    _warnOnce(err);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public API — same shape as the legacy module so callers don't change
// ─────────────────────────────────────────────────────────────────────

export async function append(companyId, entry) {
  const api = _api();
  if (!api?.append) throw new Error('Team activity could not be saved. Restart BonzAI to reconnect local storage.');
  const row = await api.append(companyId, entry);
  if (!row) throw new Error('Team activity could not be saved.');
  if (row) _notify();
  return row;
}

export async function recent(companyId, n = 200) {
  return _safe((api) => api.recent(companyId, n), []);
}

export async function all(companyId) {
  return _safe((api) => api.all(companyId), []);
}

/**
 * The legacy filter() took a JS predicate; SQL-side filtering needs a
 * shape. Callers passing predicates fall back to a client-side filter
 * on the full set. New callers should pass typed opts:
 *   { kind, role, status, action, goalId, issueId, sinceMs }
 */
export async function filter(companyId, predicateOrOpts) {
  if (typeof predicateOrOpts === "function") {
    const list = await all(companyId);
    return list.filter(predicateOrOpts);
  }
  return _safe((api) => api.filter(companyId, predicateOrOpts || {}), []);
}

export async function summarize(companyId, windowMs = 24 * 60 * 60 * 1000) {
  return _safe(
    (api) => api.summarize(companyId, windowMs),
    { total: 0, executed: 0, vetoed: 0, queued: 0, proposed: 0, error: 0, spend: 0, revenue: 0 },
  );
}

export async function clear(companyId) {
  await _safe((api) => api.clear(companyId), { ok: false });
  _notify();
}

export async function remove(companyId, entryId) {
  const out = await _safe((api) => api.remove(companyId, entryId), { ok: false });
  _notify();
  return out?.ok ?? false;
}

// ─────────────────────────────────────────────────────────────────────
// Pub/sub — bridges the main-process broadcast event into the legacy
// onChange listener API. Existing companyStore.init() subscribes via
// this, so no consumer change needed.
// ─────────────────────────────────────────────────────────────────────

const _listeners = new Set();
let _ipcUnsub = null;

function _ensureSubscribed() {
  if (_ipcUnsub || !window.electronAPI?.db?.audit?.onChanged) return;
  _ipcUnsub = window.electronAPI.db.audit.onChanged(() => _notify());
}

export function onChange(listener) {
  _listeners.add(listener);
  _ensureSubscribed();
  return () => _listeners.delete(listener);
}

export function _notify() {
  for (const l of _listeners) try { l(); } catch {}
}
