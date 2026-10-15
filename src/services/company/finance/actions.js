// Explicit financial capabilities: the same registry drives agent tools and execution.
const read = (path, collection, summary, params = {}) => ({ method: 'GET', path, collection, summary, params });
const write = (path, summary, params, required = []) => ({ method: 'POST', path, summary, params, required });
export const FINANCE_ACTIONS = Object.freeze({
  'qonto.getOrganization': read('/organization', null, 'Read organization and bank accounts'),
  'qonto.listTransactions': read('/transactions', 'transactions', 'Read settled bank transactions with pagination', { bank_account_id: 'string', settled_at_from: 'string?', settled_at_to: 'string?', current_page: 'number?' }),
  'qonto.listClients': read('/clients', 'clients', 'Read billing clients'),
  'qonto.listInvoices': read('/client_invoices', 'client_invoices', 'Read client invoices'),
  'qonto.getInvoice': read('/client_invoices/:id', null, 'Read one client invoice', { id: 'string' }),
  'qonto.listSupplierInvoices': read('/supplier_invoices', 'supplier_invoices', 'Read supplier invoices'),
  'qonto.getAttachment': read('/attachments/:id', null, 'Read receipt metadata and download link', { id: 'string' }),
  'qonto.createClient': write('/clients', 'Create a billing client after approval', { payload: 'object' }, ['name', 'type']),
  'qonto.createInvoice': write('/client_invoices', 'Create a draft invoice after approval', { payload: 'object' }, ['client_id', 'issue_date', 'due_date', 'currency', 'payment_methods', 'items']),
  'qonto.finalizeInvoice': write('/client_invoices/:id/finalize', 'Finalize an approved Qonto draft invoice', { id: 'string' }),
  'qonto.sendInvoice': { ...write('/client_invoices/:id/send', 'Email an approved Qonto invoice to specified recipients', { id: 'string', payload: 'object' }, ['send_to', 'email_title']), emptyStatus: 204 },
  'stripe.getBalance': read('/balance', null, 'Read available and pending balances'),
  'stripe.listBalanceTransactions': read('/balance_transactions', 'data', 'Read gross, fees, net and settlement entries', { from: 'string?', to: 'string?', starting_after: 'string?', payout: 'string?' }),
  'stripe.listCharges': read('/charges', 'data', 'Read charges and refund information'),
  'stripe.listRefunds': read('/refunds', 'data', 'Read refund status'),
  'stripe.listPayouts': read('/payouts', 'data', 'Read bank payout status'),
  'stripe.listCustomers': read('/customers', 'data', 'Read customers'),
  'stripe.listInvoices': read('/invoices', 'data', 'Read invoices and collection status'),
  'stripe.getInvoice': read('/invoices/:id', null, 'Read invoice details', { id: 'string' }),
  'stripe.listSubscriptions': read('/subscriptions', 'data', 'Read subscriptions'),
  'stripe.listProducts': read('/products', 'data', 'Read product catalog'),
  'stripe.listPrices': read('/prices', 'data', 'Read prices and currencies'),
  'stripe.createCustomer': write('/customers', 'Create a customer after approval', { payload: 'object' }, ['name']),
  'stripe.createInvoice': write('/invoices', 'Create a draft invoice; no automatic collection', { payload: 'object' }, ['customer']),
  'stripe.addInvoiceItem': write('/invoiceitems', 'Add an item to a specific draft invoice', { payload: 'object' }, ['customer', 'invoice', 'amount', 'currency']),
  'stripe.finalizeInvoice': write('/invoices/:id/finalize', 'Finalize an approved invoice without auto collection', { id: 'string' }),
  'stripe.sendInvoice': write('/invoices/:id/send', 'Send an approved invoice to its customer', { id: 'string' }),
  'stripe.voidInvoice': write('/invoices/:id/void', 'Void an approved invoice', { id: 'string' }),
});
export const FINANCE_READ_ACTIONS = new Set(Object.entries(FINANCE_ACTIONS).filter(([, value]) => value.method === 'GET').map(([key]) => key));
export const FINANCE_MANIFESTS = Object.fromEntries(['qonto', 'stripe'].flatMap(kind => ['read', 'billing'].map(group => {
  const id = `skill.${kind}_${group === 'read' ? 'finance' : 'invoicing'}`;
  return [id, { id, name: `${kind === 'qonto' ? 'Qonto' : 'Stripe'} ${group === 'read' ? 'Financial records' : 'Invoicing'}`, category: 'billing', description: group === 'read' ? 'Read financial evidence with explicit pagination and source receipts.' : 'Prepare billing records; every external change needs owner approval.', requiredConnectors: [kind], suggestedRoles: ['CFO', 'AccountingSpecialist', 'InvoicingSpecialist', 'PaymentsSpecialist'], actions: Object.entries(FINANCE_ACTIONS).filter(([key, value]) => key.startsWith(`${kind}.`) && (value.method === 'GET') === (group === 'read')).map(([type, value]) => ({ type, summary: value.summary, params: { ...value.params, connectorId: 'string? (required when multiple accounts are active)', ...(value.required?.length ? { payload: `object requiring ${value.required.join(', ')}` } : {}), ...(value.collection ? { filters: 'object?', cursor: 'string?' } : {}) } })) }];
})));
