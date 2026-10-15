import test from 'node:test';
import assert from 'node:assert/strict';
import { financeAuthHeaders } from '../src/main/connectors/financeAuth.js';
import { FINANCE_ACTIONS, FINANCE_MANIFESTS } from '../src/services/company/finance/actions.js';
import { executeFinanceAction, collectFinancePages, formEncode } from '../src/services/company/finance/executor.js';
import { reconcilePayouts } from '../src/services/company/finance/reconcile.js';
import { requiresOwnerApproval } from '../src/services/company/governance.solo.js';
import { PAPERASSE_TEMPLATES, paperasseGuide } from '../src/services/company/paperasseTeams.js';
import { applyTemplate } from '../src/services/company/templates.js';
import { buildWorkspaceBlueprint } from '../src/services/company/workspaceBlueprints.js';

test('Qonto uses login:secret; OAuth and Stripe Connect use distinct authentication', () => {
  assert.equal(financeAuthHeaders('qonto', { apiKey: 'secret' }, 'org').Authorization, 'org:secret');
  assert.equal(financeAuthHeaders('qonto', { accessToken: 'access' }).Authorization, 'Bearer access');
  assert.equal(financeAuthHeaders('stripe', { apiKey: 'secret' }, 'acct_123')['Stripe-Account'], 'acct_123');
  assert.throws(() => financeAuthHeaders('qonto', { apiKey: 'secret' }), /login/);
  assert.throws(() => financeAuthHeaders('stripe', { apiKey: 'secret' }, 'other'), /account/);
});
test('financial actions expose reads without authority to mutate', () => {
  for (const [type, spec] of Object.entries(FINANCE_ACTIONS)) assert.equal(requiresOwnerApproval({ type }), spec.method !== 'GET', type);
  assert.ok(Object.values(FINANCE_MANIFESTS).every(m => m.actions.length));
});
test('Qonto filtering preserves settlement basis and resumable pagination', async () => {
  let request;
  const page = await executeFinanceAction('qonto.listTransactions', { bank_account_id: 'bank1', settled_at_from: '2026-01-01', cursor: '2' }, async spec => { request = spec; return { transactions: [{ id: 't1' }], meta: { next_page: 3 } }; });
  const url = new URL(request.url);
  assert.equal(url.searchParams.get('current_page'), '2');
  assert.equal(url.searchParams.get('status'), 'completed');
  assert.equal(url.searchParams.get('settled_at_from'), '2026-01-01');
  assert.equal(page.nextCursor, '3'); assert.equal(page.complete, false);
  await assert.rejects(executeFinanceAction('qonto.listTransactions', {}, () => assert.fail()), /bank account/);
});
test('Stripe paginated imports retain fees and disclose truncation', async () => {
  const requests = [];
  const execute = (type, params) => executeFinanceAction(type, params, async spec => {
    requests.push(spec); return { data: [{ id: requests.length === 1 ? 'bt_1' : 'bt_2', amount: 1000, fee: 30, net: 970, currency: 'eur' }], has_more: requests.length === 1 };
  });
  const all = await collectFinancePages('stripe.listBalanceTransactions', { from: '2026-01-01' }, execute);
  assert.equal(all.complete, true); assert.equal(all.records.length, 2); assert.equal(all.records[0].fee, 30);
  assert.equal(new URL(requests[1].url).searchParams.get('starting_after'), 'bt_1');
  const partial = await collectFinancePages('stripe.listCharges', {}, async () => ({ records: [{ id: 'x' }], nextCursor: 'x' }), 1);
  assert.equal(partial.complete, false); assert.equal(partial.nextCursor, 'x');
});
test('invoices stay drafts, require durable keys and encode arrays correctly', async () => {
  let request;
  await executeFinanceAction('stripe.createInvoice', { payload: { customer: 'cus_1', auto_advance: true } }, async spec => { request = spec; return { id: 'in_1', status: 'draft' }; }, 'reviewed-step-1');
  assert.equal(new URLSearchParams(request.body).get('auto_advance'), 'false');
  assert.equal(new URLSearchParams(request.body).get('collection_method'), 'send_invoice');
  await assert.rejects(executeFinanceAction('stripe.createInvoice', { payload: { customer: 'cus_1' } }, () => assert.fail()), /idempotency/);
  assert.equal(formEncode({ items: [{ price: 'p1', quantity: 2 }] }).get('items[0][price]'), 'p1');
  await assert.rejects(executeFinanceAction('stripe.getInvoice', { id: '../customers' }, () => assert.fail()), /record ID/);
});
test('reconciliation does not double-match payouts or conflate currencies', () => {
  const payout = { id: 'po_1', amount: 1000, currency: 'eur', status: 'paid', arrival_date: 1770000000 };
  const tx = { id: 'tx_1', amount_cents: 1000, currency: 'EUR', status: 'completed', side: 'credit', settled_at: new Date(1770000000 * 1000).toISOString() };
  assert.equal(reconcilePayouts({ payouts: [payout], transactions: [tx] }).rows[0].status, 'candidate');
  assert.ok(reconcilePayouts({ payouts: [payout, { ...payout, id: 'po_2' }], transactions: [tx] }).rows.every(row => row.status === 'ambiguous'));
  assert.equal(reconcilePayouts({ payouts: [payout], transactions: [{ ...tx, currency: 'USD' }] }).rows[0].status, 'unmatched');
  assert.throws(() => reconcilePayouts({ payouts: [payout, payout], transactions: [tx] }), /duplicate/);
});
test('six Paperasse teams retain their specialist roles, executable skills and evidence instructions', () => {
  assert.equal(Object.keys(PAPERASSE_TEMPLATES).length, 6);
  for (const template of Object.values(PAPERASSE_TEMPLATES)) {
    const applied = applyTemplate(template.id, { businessName: 'Example' }, { demoMode: false });
    const { draft } = applied;
    assert.deepEqual(Object.keys(draft.roles), Object.keys(template.defaultRoles));
    assert.ok(draft.roles.CFO.grantedSkills.includes('skill.qonto_finance'));
    assert.ok(draft.roles.CFO.grantedSkills.includes('skill.finance_reconciliation'));
    assert.deepEqual(buildWorkspaceBlueprint({ templateId: template.id }).recommendedRoles, Object.keys(template.defaultRoles));
    assert.match(paperasseGuide({ template: { id: template.id } }, 'CFO'), /source record IDs/);
    assert.ok(applied.requiredConnectors.includes('qonto'));
  }
});

test('bank import → payout import → reconciliation passes actual results through durable company steps', async () => {
  const { createTaskExecution, runTaskExecution, executionOutcome } = await import('../src/services/company/taskExecution.js');
  const tx = { id: 'tx_1', amount_cents: 5000, currency: 'EUR', status: 'completed', side: 'credit', settled_at: new Date(1770000000 * 1000).toISOString() };
  const payout = { id: 'po_1', amount: 5000, currency: 'eur', status: 'paid', arrival_date: 1770000000 };
  const execution = createTaskExecution([
    { stepId: 'bank', type: 'qonto.listTransactions', bank_account_id: 'bank_1' },
    { stepId: 'payouts', type: 'stripe.listPayouts' },
    { type: 'finance.reconcilePayouts', transactions: { $ref: 'bank.records' }, payouts: { $ref: 'payouts.records' } },
  ]);
  let saved;
  const result = await runTaskExecution({ execution, save: async value => { saved = structuredClone(value); }, gate: async () => ({ pass: true }), dispatch: async action => action.type === 'finance.reconcilePayouts' ? reconcilePayouts(action) : executeFinanceAction(action.type, action, async () => action.type.startsWith('qonto') ? { transactions: [tx], meta: { next_page: null } } : { data: [payout], has_more: false }) });
  assert.equal(executionOutcome(result), 'done');
  assert.equal(saved.steps[2].output.rows[0].candidateTransactionIds[0], 'tx_1');
  assert.equal(saved.steps[2].output.scope, 'local_draft');
});

test('rate-limited reads retry, financial writes never retry implicitly, redirects cannot leak keys', async () => {
  const { connectorFetch } = await import('../src/main/connectors/http.js');
  let requests = 0; const waits = [];
  const fetcher = async (url, options) => { requests++; assert.equal(options.redirect, 'error'); assert.ok(options.signal); return new Response('{}', { status: requests === 1 ? 429 : 200, headers: { 'retry-after': '1' } }); };
  assert.equal((await connectorFetch('https://api.stripe.com/v1/balance', { method: 'GET' }, fetcher, async ms => waits.push(ms))).status, 200);
  assert.deepEqual(waits, [1000]);
  requests = 0;
  assert.equal((await connectorFetch('https://api.stripe.com/v1/refunds', { method: 'POST' }, fetcher, () => assert.fail())).status, 429);
  assert.equal(requests, 1);
});

test('Qonto invoice email accepts only the documented 204 receipt', async () => {
  const params = { id: 'invoice_1', payload: { send_to: ['owner@example.com'], email_title: 'Invoice' } };
  const result = await executeFinanceAction('qonto.sendInvoice', params, async spec => { assert.equal(spec.includeResponseMetadata, true); return { status: 204, data: {} }; }, 'approved-email-1');
  assert.equal(result.providerStatus, 'sent');
  await assert.rejects(executeFinanceAction('qonto.sendInvoice', params, async () => ({ status: 200, data: {} }), 'approved-email-1'), /not acknowledged/);
});
test('agents can retrieve company-local evidence and save reconciliation artifacts', async () => {
  const { executeFinanceLocal } = await import('../src/services/company/finance/evidence.js');
  const record = { id: 'e1', meta: { source: 'stripe.listPayouts', complete: true }, payload: '{"records":[]}' };
  const store = { listCatalog: async company => { assert.equal(company, 'company1'); return [record, { id: 'unrelated' }]; }, getRecord: async () => record, publishContent: async () => ({ id: 'reconciliation1' }) };
  const list = await executeFinanceLocal('company1', 'finance.listEvidence', {}, {}, store);
  assert.deepEqual(list.records.map(row => row.id), ['e1']);
  const read = await executeFinanceLocal('company1', 'finance.readEvidence', { contentId: 'e1' }, {}, store);
  assert.deepEqual(read.record, { records: [] });
  const result = await executeFinanceLocal('company1', 'finance.reconcilePayouts', { payouts: [], transactions: [] }, {}, store);
  assert.equal(result.contentId, 'reconciliation1');
});

test('charges and refunds cannot turn zero into a full refund or multiply yen by 100', async () => {
  const { stripeMinorUnits } = await import('../src/services/company/finance/money.js');
  assert.equal(stripeMinorUnits('10.99', 'EUR'), 1099);
  assert.equal(stripeMinorUnits(500, 'JPY'), 500);
  assert.equal(stripeMinorUnits(5, 'ISK'), 500);
  assert.throws(() => stripeMinorUnits(0, 'EUR'), /positive/);
  assert.throws(() => stripeMinorUnits(1.005, 'EUR'), /precision/);
  assert.throws(() => stripeMinorUnits(1.5, 'JPY'), /precision/);
  assert.throws(() => stripeMinorUnits(5), /currency/);
});
