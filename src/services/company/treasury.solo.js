/**
 * BonzAI Company — Solo Mode treasury adapter (local books)
 *
 * v1: pure local accounting. The user records:
 *   - revenue (a customer paid us, source + amount)
 *   - spending (the company paid for something, recipient + amount + memo)
 *   - balance (just the running sum; no real bank account)
 *
 * No Stripe Connect / no bank API integration in this cut. v0.1 will add:
 *   - Stripe Connect OAuth + balance/payout polling
 *   - Plaid / bank webhook ingestion
 *   - Crypto-to-fiat off-ramp via Coinbase Commerce
 *
 * The CFO role calls these methods through the dispatcher. Owner can also
 * record manual entries via the UI for revenue that landed off-platform.
 *
 * Persistence: `companies/<id>/treasury` in Electron Store +
 * mirror to the audit log so the Treasury view derives from the log.
 */

import { append, _notify } from "./auditLog.js";

const ENTRY_KEY = (id) => `companies/${id}/treasury`;
const STATE_KEY = (id) => `companies/${id}/treasury-state`;

/** Hydrate (or seed) the treasury state for a company. */
async function _state(companyId) {
  const raw = await window.electronAPI?.store?.get?.(STATE_KEY(companyId), null);
  return raw || { balance: 0, totalIn: 0, totalOut: 0, currency: "USD" };
}

async function _saveState(companyId, s) {
  await window.electronAPI?.store?.set?.(STATE_KEY(companyId), s);
}

/**
 * Record a payment received. Amount is positive in the company's currency.
 *
 * @param {string} companyId
 * @param {object} opts  { amount, currency, source, memo, externalId? }
 * @returns {Promise<{entry, state}>}
 */
export async function recordRevenue(companyId, opts) {
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be > 0");
  const state = await _state(companyId);
  if (opts.currency && opts.currency !== state.currency) {
    // v1: no FX. The user picked the company currency at formation; we
    // refuse mixed currencies rather than silently mis-book.
    throw new Error(
      `currency mismatch: company books are ${state.currency}, entry was ${opts.currency}`,
    );
  }
  state.balance += amount;
  state.totalIn += amount;
  await _saveState(companyId, state);

  const entry = await append(companyId, {
    kind: "treasury",
    direction: "in",
    role: opts.role || "CFO",
    action: "recordRevenue",
    status: "executed",
    amount,
    currency: state.currency,
    source: opts.source || "unknown",
    note: opts.memo || "",
    externalId: opts.externalId || null,
    balanceAfter: state.balance,
  });
  _notify();
  return { entry, state };
}

/**
 * Record an outgoing payment / expense. Honors the per-heartbeat spend cap
 * if present in opts.cap (the dispatcher passes the resolved role budget).
 */
export async function paySupplier(companyId, opts) {
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be > 0");
  const state = await _state(companyId);
  if (opts.currency && opts.currency !== state.currency) {
    throw new Error(`currency mismatch: ${opts.currency} vs ${state.currency}`);
  }
  if (Number.isFinite(opts.cap) && amount > opts.cap) {
    throw new Error(`amount ${amount} exceeds role budget cap ${opts.cap}`);
  }
  if (Number.isFinite(opts.reserveFloor) && state.balance - amount < opts.reserveFloor) {
    throw new Error(
      `payment would breach reserve floor (${state.balance} - ${amount} < ${opts.reserveFloor})`,
    );
  }
  state.balance -= amount;
  state.totalOut += amount;
  await _saveState(companyId, state);

  const entry = await append(companyId, {
    kind: "treasury",
    direction: "out",
    role: opts.role || "CFO",
    action: "paySupplier",
    status: "executed",
    amount,
    currency: state.currency,
    recipient: opts.recipient || "unknown",
    note: opts.memo || "",
    balanceAfter: state.balance,
  });
  _notify();
  return { entry, state };
}

/** Read current state for the Treasury view. */
export async function getState(companyId) {
  return _state(companyId);
}

/**
 * Reset treasury (used on dissolve). Doesn't touch the audit log; the
 * caller is responsible for wiping that separately if desired.
 */
export async function reset(companyId) {
  await window.electronAPI?.store?.delete?.(STATE_KEY(companyId));
}

/**
 * Recompute state from the audit log. Useful after a manual ledger
 * edit or to verify integrity.
 */
export async function recomputeFromLog(companyId, currency) {
  const all = (await import("./auditLog.js")).all;
  const entries = await all(companyId);
  let balance = 0, totalIn = 0, totalOut = 0;
  for (const e of entries.reverse()) {
    if (e.kind !== "treasury") continue;
    if (e.direction === "in") { balance += +e.amount || 0; totalIn += +e.amount || 0; }
    if (e.direction === "out") { balance -= +e.amount || 0; totalOut += +e.amount || 0; }
  }
  const state = { balance, totalIn, totalOut, currency: currency || "USD" };
  await _saveState(companyId, state);
  return state;
}
