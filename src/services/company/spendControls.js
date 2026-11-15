// Money leaving the company through a connector. The provider receipt is not
// settled cash, so the local ledger is only debited when the owner reconciles
// it. Until then the payout still counts against the role's budget for the
// current heartbeat and against the reserve floor.
export const OUTFLOW_ACTIONS = Object.freeze(['stripe.refund', 'qbo.payBill', 'shopify.refundOrder']);

const money = value => Math.round(Number(value) * 100) / 100;

/** Payouts already accepted by a provider, from the audit trail and the ledger. */
export function outflowExposure(auditEntries = [], ledgerEntries = [], { role, windowStart }) {
  const reconciled = new Set(ledgerEntries.filter(entry => entry.direction === 'out' && entry.externalId).map(entry => String(entry.externalId)));
  let spentThisWindow = 0, committed = 0;
  for (const entry of auditEntries) {
    const amount = Number(entry.amount);
    if (!OUTFLOW_ACTIONS.includes(entry.action) || !(amount > 0) || ['error', 'simulated', 'vetoed'].includes(entry.status)) continue;
    if (entry.role === role && entry.ts >= windowStart) spentThisWindow += amount;
    if (!entry.txOrLink || !reconciled.has(String(entry.txOrLink))) committed += amount;
  }
  return { spentThisWindow: money(spentThisWindow), committed: money(committed) };
}

/** One specific reason, so the owner or agent knows what to change. */
export function checkOutflow({ amount, currency, cap, reserveFloor = 0, balance, ledgerCurrency, spentThisWindow = 0, committed = 0 }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'A payment needs an explicit positive amount.' };
  if (String(currency || '').toUpperCase() !== String(ledgerCurrency || '').toUpperCase()) return { ok: false, error: `The payment currency must match the company ledger (${ledgerCurrency}).` };
  if (!Number.isFinite(cap) || cap <= 0) return { ok: false, error: 'This role has no spending budget. The owner can set one in the team settings.' };
  const remaining = money(cap - spentThisWindow);
  if (value > remaining) return { ok: false, error: `This payment exceeds the role’s remaining budget for this period (${Math.max(0, remaining)} of ${cap} ${ledgerCurrency} left).` };
  const available = money(balance - committed);
  if (available - value < reserveFloor) return { ok: false, error: `This payment would breach the reserve floor (${reserveFloor} ${ledgerCurrency}): ${available} is available after ${committed} in payouts awaiting reconciliation.` };
  return { ok: true };
}
