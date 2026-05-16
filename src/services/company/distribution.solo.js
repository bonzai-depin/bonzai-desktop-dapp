/**
 * BonzAI Company — Solo Mode distribution (renderer-side adapter,
 * SQLite-backed).
 *
 * The "production catalog" view source. publishContent is called by
 * the dispatcher's `produce` handler whenever a generation completes.
 * Image/audio/video payloads now route through the blob store so the
 * catalog stays small and shareable.
 */

import { append, _notify } from "./auditLog.js";

const _api = () => window.electronAPI?.db?.distribution || null;
let _warned = false;
function _warnOnce(err) {
  if (_warned) return;
  _warned = true;
  console.warn(
    "[distribution] data layer not reachable — production writes will be " +
    "dropped. Run `npm install` and restart. Error: " + (err?.message || err || "no IPC handler"),
  );
}
async function _safe(fn, fallback) {
  const api = _api();
  if (!api) { _warnOnce(); return fallback; }
  try { return await fn(api); }
  catch (err) { _warnOnce(err); return fallback; }
}

export async function publishContent(companyId, opts) {
  const row = await _safe((api) => api.publish(companyId, opts), null);
  if (row) {
    await append(companyId, {
      kind: "production", role: opts?.role || null, action: "publishContent",
      status: "executed", contentId: row.id,
      note: (opts?.prompt || "").slice(0, 160),
      txOrLink: row.shareLink || null,
    });
    _notify();
  }
  return row;
}

export async function listCatalog(companyId) {
  return _safe((api) => api.listCatalog(companyId), []);
}

export async function getRecord(companyId, contentId) {
  return _safe((api) => api.getRecord(companyId, contentId), null);
}

export async function clear(companyId) {
  await _safe((api) => api.clear(companyId), null);
}

export async function remove(companyId, contentId) {
  const out = await _safe((api) => api.remove(companyId, contentId), { ok: false });
  return out?.ok ?? false;
}
