import { validateCharter } from './charter.js';
const api = () => {
  const value = window.electronAPI?.db?.companyPortability;
  if (!value) throw new Error('Restart BonzAI to enable complete company backup and restore.');
  return value;
};
export async function exportCompany(charter, opts = {}) { return api().export(charter.id, opts); }
export async function importCompany(bundle, opts = {}) {
  if (bundle?.schemaVersion !== 2) throw new Error('This legacy backup does not contain the current task database. Open the original company and export a new backup.');
  const validation = validateCharter(bundle.charter);
  if (!validation.ok) throw new Error(`Invalid company charter: ${validation.errors.join('; ')}`);
  return api().import(bundle, opts);
}
export function bundleToBlob(bundle) { return new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }); }
