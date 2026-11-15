/**
 * BonzAI Company — Scheduled work (renderer-side adapter, SQLite-backed).
 *
 * Thin pass-through to `window.electronAPI.db.schedules.*`. Due schedules are
 * turned into tasks by the main process, so nothing here runs a timer.
 */

const _api = () => window.electronAPI?.db?.schedules || null;

async function _write(fn) {
  const api = _api();
  if (!api) throw new Error('Restart BonzAI to enable scheduled work.');
  return fn(api);
}

export async function list(companyId) {
  const api = _api();
  if (!api) return [];
  return api.list(companyId);
}
export const create = (companyId, input) => _write(api => api.create(companyId, input));
export const update = (companyId, id, patch) => _write(api => api.update(companyId, id, patch));
export const remove = (companyId, id) => _write(api => api.remove(companyId, id));
export const runDue = (companyId) => _write(api => api.runDue(companyId));
export function onChanged(callback) {
  return _api()?.onChanged?.(callback) || (() => {});
}
