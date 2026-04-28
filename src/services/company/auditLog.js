/**
 * BonzAI Company — Append-only audit log
 *
 * Every action a company takes (or vetoes, or proposes) lands here.
 * The log is the only honest source of truth for "what did this
 * company do?" The UI's Audit, Production, Treasury, and Approvals
 * views all derive from it.
 *
 * Storage: in-memory ring buffer (last 5000 entries) backed by
 * Electron Store on every mutation. Survives app restarts.
 */

import { v4 as uuid } from "uuid";

const MAX_ENTRIES = 5000;

function _key(companyId) {
  return `companies/${companyId}/audit`;
}

/** In-memory cache so the renderer doesn't re-read disk every render. */
const _cache = new Map(); // companyId -> entries[]

/**
 * Hydrate from disk on first access. Idempotent.
 */
async function _hydrate(companyId) {
  if (_cache.has(companyId)) return _cache.get(companyId);
  let entries = [];
  try {
    const raw = await window.electronAPI?.store?.get?.(_key(companyId), []);
    if (Array.isArray(raw)) entries = raw;
  } catch {}
  _cache.set(companyId, entries);
  return entries;
}

async function _persist(companyId) {
  const entries = _cache.get(companyId) || [];
  try {
    await window.electronAPI?.store?.set?.(_key(companyId), entries);
  } catch (err) {
    console.warn("[audit] persist failed:", err?.message);
  }
}

/**
 * Append an entry. Returns the persisted entry (with id + timestamp).
 *
 * @param {string} companyId
 * @param {object} entry  { kind, role, action, status, txOrLink, note, amount, currency }
 *   kind:    "action" | "veto" | "proposal" | "approval" | "system"
 *   role:    role key (e.g. "CEO", "Producer:text")
 *   action:  action type (e.g. "produce", "paySupplier", "broadcastChannel")
 *   status:  "executed" | "vetoed" | "queued" | "proposed" | "approved" | "rejected" | "error"
 *   txOrLink: optional URL / receipt / inference id
 *   note:    free-form short text
 *   amount, currency: optional, for spend actions
 */
export async function append(companyId, entry) {
  const entries = await _hydrate(companyId);
  const record = {
    id: uuid(),
    ts: Date.now(),
    ...entry,
  };
  entries.push(record);
  // Ring-buffer cap
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  _cache.set(companyId, entries);
  await _persist(companyId);
  return record;
}

/**
 * Read the last N entries (newest first). Default 200.
 */
export async function recent(companyId, n = 200) {
  const entries = await _hydrate(companyId);
  return entries.slice(-n).reverse();
}

/**
 * Read all entries (newest first). Caller's responsibility to paginate.
 */
export async function all(companyId) {
  const entries = await _hydrate(companyId);
  return [...entries].reverse();
}

/**
 * Filter entries by predicate. Useful for production queue, treasury
 * ledger, approvals queue.
 */
export async function filter(companyId, predicate) {
  const entries = await _hydrate(companyId);
  return entries.filter(predicate).reverse();
}

/**
 * Aggregate counts by status for the most recent `windowMs` ms.
 * Used by the dashboard KPI tiles.
 */
export async function summarize(companyId, windowMs = 24 * 60 * 60 * 1000) {
  const entries = await _hydrate(companyId);
  const since = Date.now() - windowMs;
  const recent = entries.filter((e) => e.ts >= since);
  const out = {
    total: recent.length,
    executed: 0,
    vetoed: 0,
    queued: 0,
    proposed: 0,
    error: 0,
    spend: 0,
    revenue: 0,
  };
  for (const e of recent) {
    if (e.status && Object.prototype.hasOwnProperty.call(out, e.status)) {
      out[e.status]++;
    }
    if (e.kind === "treasury" && e.direction === "out") out.spend += +e.amount || 0;
    if (e.kind === "treasury" && e.direction === "in") out.revenue += +e.amount || 0;
  }
  return out;
}

/**
 * Drop a company's entire audit log (used on dissolve / reset).
 */
export async function clear(companyId) {
  _cache.delete(companyId);
  try {
    await window.electronAPI?.store?.delete?.(_key(companyId));
  } catch {}
}

/**
 * Subscribe to live updates. Returns an unsubscribe function.
 *
 * Implementation note: this is a poll-based pub/sub using a tick. The
 * dispatcher and treasury also write to the log, so anything that
 * appends triggers a tick. Keeps the API simple and avoids EventTarget
 * boilerplate; if perf becomes an issue we can swap for an emitter.
 */
const _listeners = new Set();
export function onChange(listener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
export function _notify() {
  for (const l of _listeners) try { l(); } catch {}
}
