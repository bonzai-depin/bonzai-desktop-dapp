/**
 * BonzAI Company — Solo Mode distribution adapter
 *
 * Takes a piece of produced content + a price + a channel list and:
 *   1. Persists the artifact locally (text → string; image/audio/video →
 *      base64 → file path; 3D → JS code).
 *   2. Generates a "share link" (v1: an internal `bonzai://` link or a
 *      simple data URL; v0.1 will swap for Stripe Checkout / Cloudflare R2).
 *   3. Optionally broadcasts to wired channels via OpenClaw.
 *
 * The point is to give the user something they can hand off to a customer
 * today, without any cloud setup. v0.1 will bolt real payment + hosting
 * adapters on top of this same interface.
 */

import { append, _notify } from "./auditLog.js";

/**
 * Persist a content artifact + return a publishable record.
 *
 * @param {string} companyId
 * @param {object} opts
 *   pipeline:    "text" | "image" | "audio" | "video" | "3d" | "music"
 *   prompt:      original prompt (for the listing description)
 *   payload:     pipeline-specific output (string for text, base64 for media,
 *                  JS source for 3d). Optional `meta` carries pipeline
 *                  hyperparams (steps, model, duration, etc.).
 *   price:       price in the company's currency (number)
 *   currency:    currency code (string)
 *   role:        role key that produced this (for audit)
 *   companion:   companion id that produced this (for audit)
 */
export async function publishContent(companyId, opts) {
  const id = await _generateId();
  const record = {
    id,
    companyId,
    pipeline: opts.pipeline,
    prompt: opts.prompt || "",
    price: Number(opts.price) || 0,
    currency: opts.currency || "USD",
    payload: opts.payload, // raw artifact (string or base64)
    meta: opts.meta || {},
    createdAt: Date.now(),
    shareLink: _shareLink(companyId, id),
    sales: 0,
    revenue: 0,
  };

  // Persist in a per-company catalog
  const catalog = await _readCatalog(companyId);
  catalog.push(_toIndexEntry(record));
  await _writeCatalog(companyId, catalog);

  // Store the full record (with payload) under its own key — keeps
  // catalog small for fast list rendering.
  await window.electronAPI?.store?.set?.(_recordKey(companyId, id), record);

  await append(companyId, {
    kind: "production",
    role: opts.role || null,
    action: "publishContent",
    status: "executed",
    pipeline: opts.pipeline,
    contentId: id,
    note: opts.prompt?.slice(0, 80) || "",
    txOrLink: record.shareLink,
    amount: record.price,
    currency: record.currency,
  });
  _notify();
  return record;
}

/**
 * Read the published catalog (lightweight — no payloads).
 */
export async function listCatalog(companyId) {
  return _readCatalog(companyId);
}

/**
 * Read a single content record (with payload). Use only when displaying
 * or downloading the artifact.
 */
export async function getRecord(companyId, contentId) {
  return window.electronAPI?.store?.get?.(_recordKey(companyId, contentId), null);
}

/**
 * Record a sale of a previously-published item. The treasury adapter
 * actually moves the money; this just bumps the catalog stats and logs.
 */
export async function recordSale(companyId, contentId, opts) {
  const record = await getRecord(companyId, contentId);
  if (!record) throw new Error(`content ${contentId} not found`);
  record.sales += 1;
  record.revenue += Number(opts.amount) || record.price;
  await window.electronAPI?.store?.set?.(_recordKey(companyId, contentId), record);

  // Mirror sale into catalog summary
  const catalog = await _readCatalog(companyId);
  const idx = catalog.findIndex((e) => e.id === contentId);
  if (idx >= 0) {
    catalog[idx].sales = record.sales;
    catalog[idx].revenue = record.revenue;
    await _writeCatalog(companyId, catalog);
  }
  await append(companyId, {
    kind: "production",
    role: "CSO",
    action: "recordSale",
    status: "executed",
    contentId,
    amount: record.price,
    currency: record.currency,
    note: opts.buyer || "anonymous buyer",
  });
  _notify();
  return record;
}

/**
 * Wipe distribution data on dissolve. Catalog index + every record key.
 */
export async function clear(companyId) {
  const catalog = await _readCatalog(companyId);
  for (const e of catalog) {
    await window.electronAPI?.store?.delete?.(_recordKey(companyId, e.id));
  }
  await window.electronAPI?.store?.delete?.(_catalogKey(companyId));
}

// ─────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────

const _catalogKey = (id) => `companies/${id}/catalog`;
const _recordKey = (cid, rid) => `companies/${cid}/content/${rid}`;

async function _readCatalog(companyId) {
  return (await window.electronAPI?.store?.get?.(_catalogKey(companyId), [])) || [];
}
async function _writeCatalog(companyId, catalog) {
  await window.electronAPI?.store?.set?.(_catalogKey(companyId), catalog);
}

function _toIndexEntry(record) {
  return {
    id: record.id,
    pipeline: record.pipeline,
    prompt: record.prompt?.slice(0, 200) || "",
    price: record.price,
    currency: record.currency,
    createdAt: record.createdAt,
    shareLink: record.shareLink,
    sales: record.sales,
    revenue: record.revenue,
  };
}

function _shareLink(companyId, contentId) {
  // Internal scheme — the dapp can resolve `bonzai://company/<cid>/content/<rid>`
  // to the local catalog viewer. v0.1 will swap for a Stripe Checkout URL.
  return `bonzai://company/${companyId}/content/${contentId}`;
}

async function _generateId() {
  const { v4: uuid } = await import("uuid");
  return uuid();
}
