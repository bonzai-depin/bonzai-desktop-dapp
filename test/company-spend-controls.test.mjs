import test from 'node:test';
import assert from 'node:assert/strict';
import { outflowExposure, checkOutflow } from '../src/services/company/spendControls.js';

const payout = (amount, extra = {}) => ({ action: 'stripe.refund', status: 'requires_input', role: 'CFO', amount, ts: 1000, txOrLink: `re_${amount}`, ...extra });

test('a role cannot exceed its budget by splitting one payout into several', () => {
  // Business reason: the budget is per period, not per click. Three 40 refunds
  // against a 100 budget must stop at the third.
  const exposure = outflowExposure([payout(40), payout(40.5)], [], { role: 'CFO', windowStart: 500 });
  assert.equal(exposure.spentThisWindow, 80.5);
  const third = checkOutflow({ amount: 40, currency: 'eur', cap: 100, balance: 5000, ledgerCurrency: 'EUR', ...exposure });
  assert.equal(third.ok, false);
  assert.match(third.error, /remaining budget.*19\.5 of 100 EUR left/);
  assert.equal(checkOutflow({ amount: 19.5, currency: 'EUR', cap: 100, balance: 5000, ledgerCurrency: 'EUR', ...exposure }).ok, true);
  // Another role's payouts and an earlier period do not consume this budget.
  assert.equal(outflowExposure([payout(40, { role: 'CSO' }), payout(40, { ts: 100 })], [], { role: 'CFO', windowStart: 500 }).spentThisWindow, 0);
});

test('payouts awaiting reconciliation still protect the reserve floor', () => {
  // Business reason: the ledger is only debited when the owner reconciles, so
  // successive refunds must not all be measured against the same untouched balance.
  const entries = [payout(300, { ts: 1 }), payout(200, { ts: 2 })];
  const open = outflowExposure(entries, [], { role: 'CFO', windowStart: 500 });
  assert.equal(open.committed, 500);
  const blocked = checkOutflow({ amount: 100, currency: 'EUR', cap: 1000, reserveFloor: 450, balance: 1000, ledgerCurrency: 'EUR', ...open });
  assert.match(blocked.error, /reserve floor.*500 is available after 500/);
  // Once the 300 payout is on the ledger it is counted there, not twice.
  const reconciled = outflowExposure(entries, [{ direction: 'out', externalId: 're_300' }], { role: 'CFO', windowStart: 500 });
  assert.equal(reconciled.committed, 200);
  assert.equal(checkOutflow({ amount: 100, currency: 'EUR', cap: 1000, reserveFloor: 450, balance: 700, ledgerCurrency: 'EUR', ...reconciled }).ok, false);
  assert.equal(checkOutflow({ amount: 50, currency: 'EUR', cap: 1000, reserveFloor: 450, balance: 700, ledgerCurrency: 'EUR', ...reconciled }).ok, true);
  // Failed, simulated and non-payout actions never count.
  assert.deepEqual(outflowExposure([payout(9, { status: 'error' }), payout(9, { status: 'simulated' }), payout(9, { action: 'email.send' })], [], { role: 'CFO', windowStart: 0 }), { spentThisWindow: 0, committed: 0 });
});

test('each refusal names what to change', () => {
  const base = { currency: 'EUR', cap: 100, balance: 1000, ledgerCurrency: 'EUR' };
  assert.match(checkOutflow({ ...base, amount: 0 }).error, /explicit positive amount/);
  assert.match(checkOutflow({ ...base, amount: 10, currency: 'USD' }).error, /must match the company ledger \(EUR\)/);
  assert.match(checkOutflow({ ...base, amount: 10, cap: 0 }).error, /no spending budget/);
});
