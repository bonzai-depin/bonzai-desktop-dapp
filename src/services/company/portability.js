/**
 * BonzAI Company — portability (export / import)
 *
 * Exports an entire company's state as a single JSON document the user
 * can stash in iCloud / send to a friend / restore on another machine.
 *
 * Bundle structure:
 *   { schemaVersion, exportedAt, charter, treasuryState, audit, catalog,
 *     approvals, queues, contentPayloads }
 *
 * `contentPayloads` is the per-record full payload for every catalog
 * entry — included by default. Pass { includePayloads: false } to omit
 * (smaller bundle; only the catalog index ships).
 */

import * as treasury from "./treasury.solo.js";
import * as gov from "./governance.solo.js";
import * as dist from "./distribution.solo.js";
import { all } from "./auditLog.js";
import { validateCharter } from "./charter.js";

const SCHEMA = 1;

export async function exportCompany(charter, opts = {}) {
  const id = charter.id;
  const includePayloads = opts.includePayloads !== false;

  const treasuryState = await treasury.getState(id);
  const audit = await all(id);
  const catalog = await dist.listCatalog(id);
  const approvals = await window.electronAPI?.store?.get?.(`companies/${id}/approvals`, []);
  const queues = await window.electronAPI?.store?.get?.(`companies/${id}/queues`, {});

  const contentPayloads = {};
  if (includePayloads) {
    for (const entry of catalog) {
      const rec = await dist.getRecord(id, entry.id);
      if (rec) contentPayloads[entry.id] = rec;
    }
  }

  return {
    schemaVersion: SCHEMA,
    exportedAt: Date.now(),
    charter,
    treasuryState,
    audit,
    catalog,
    approvals,
    queues,
    contentPayloads: includePayloads ? contentPayloads : null,
  };
}

/**
 * Import a previously-exported bundle. Generates a fresh company id by
 * default to avoid collision with the existing one; pass
 * `{ keepId: true }` to overwrite. Returns the new charter (with possibly
 * remapped id).
 */
export async function importCompany(bundle, opts = {}) {
  if (!bundle || bundle.schemaVersion !== SCHEMA) {
    throw new Error(`unsupported bundle schema (${bundle?.schemaVersion})`);
  }
  const v = validateCharter(bundle.charter);
  if (!v.ok) throw new Error("imported charter invalid: " + v.errors.join("; "));

  let charter = bundle.charter;
  let oldId = charter.id;
  let newId = oldId;

  if (!opts.keepId) {
    const { v4: uuid } = await import("uuid");
    newId = uuid();
    charter = { ...charter, id: newId, name: `${charter.name} (imported)` };
  }

  // Treasury state
  await window.electronAPI?.store?.set?.(`companies/${newId}/treasury-state`, bundle.treasuryState);
  // Audit log
  await window.electronAPI?.store?.set?.(`companies/${newId}/audit`, bundle.audit || []);
  // Catalog
  await window.electronAPI?.store?.set?.(`companies/${newId}/catalog`, bundle.catalog || []);
  // Approvals
  await window.electronAPI?.store?.set?.(`companies/${newId}/approvals`, bundle.approvals || []);
  // Queues
  await window.electronAPI?.store?.set?.(`companies/${newId}/queues`, bundle.queues || {});
  // Content payloads
  if (bundle.contentPayloads) {
    for (const [contentId, rec] of Object.entries(bundle.contentPayloads)) {
      await window.electronAPI?.store?.set?.(`companies/${newId}/content/${contentId}`, rec);
    }
  }
  return charter;
}

/** Convert a bundle into a downloadable Blob (UI helper). */
export function bundleToBlob(bundle) {
  const json = JSON.stringify(bundle, null, 2);
  return new Blob([json], { type: "application/json" });
}
