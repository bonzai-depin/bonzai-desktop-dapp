// Settlement evidence only. A matching amount is a candidate, never proof of revenue.
export function reconcilePayouts({ payouts, transactions }) {
  if (!Array.isArray(payouts) || !Array.isArray(transactions)) throw new Error('Payout and bank transaction arrays are required');
  const seenPayouts = new Set(); const seenTransactions = new Set();
  for (const [rows, seen, kind] of [[payouts, seenPayouts, 'payout'], [transactions, seenTransactions, 'transaction']]) {
    for (const row of rows) {
      const id = row.id || row.transaction_id;
      if (!id || seen.has(id)) throw new Error(`Missing or duplicate ${kind} ID`);
      seen.add(id);
    }
  }
  const candidates = payouts.map(payout => {
    if (!Number.isSafeInteger(payout.amount) || !payout.currency || !Number.isFinite(payout.arrival_date)) throw new Error('Payout must include integer minor-unit amount, currency and arrival_date');
    const matches = payout.status === 'paid' ? transactions.filter(tx => tx.status === 'completed' && tx.side === 'credit'
      && Number.isSafeInteger(tx.amount_cents) && tx.amount_cents === payout.amount
      && String(tx.currency).toLowerCase() === payout.currency.toLowerCase()
      && Number.isFinite(Date.parse(tx.settled_at)) && Math.abs(Date.parse(tx.settled_at) / 1000 - payout.arrival_date) <= 5 * 86400) : [];
    return { payoutId: payout.id, providerStatus: payout.status, amountMinor: payout.amount, currency: payout.currency, candidateTransactionIds: matches.map(tx => tx.id || tx.transaction_id) };
  });
  const uses = new Map();
  for (const row of candidates) for (const id of row.candidateTransactionIds) uses.set(id, (uses.get(id) || 0) + 1);
  const rows = candidates.map(row => ({ ...row, status: row.providerStatus !== 'paid' ? 'not_settled' : !row.candidateTransactionIds.length ? 'unmatched' : row.candidateTransactionIds.length > 1 || uses.get(row.candidateTransactionIds[0]) > 1 ? 'ambiguous' : 'candidate' }));
  return { rows, summary: `${rows.filter(row => row.status === 'candidate').length} candidate matches; ${rows.filter(row => row.status !== 'candidate').length} exceptions. Verify bank references before posting.`, scope: 'local_draft', status: 'completed', receipt: { rows }, record: { rows }, complete: true };
}
