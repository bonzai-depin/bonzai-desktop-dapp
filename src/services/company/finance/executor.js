import { FINANCE_ACTIONS } from './actions.js';

export function formEncode(value, prefix = '', out = new URLSearchParams()) {
  for (const [key, item] of Object.entries(value || {})) {
    if (item == null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof item === 'object') formEncode(item, name, out);
    else out.append(name, String(item));
  }
  return out;
}
const requiredId = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('A valid provider record ID is required');
  return value;
};
const FILTERS = {
  qonto: new Set(['bank_account_id', 'iban', 'status', 'settled_at_from', 'settled_at_to', 'updated_at_from', 'updated_at_to', 'sort_by']),
  stripe: new Set(['customer', 'status', 'payout', 'type', 'active', 'product', 'charge', 'created']),
};

export async function executeFinanceAction(type, params = {}, call, idempotencyKey) {
  const spec = FINANCE_ACTIONS[type];
  if (!spec) throw new Error(`Unknown financial action: ${type}`);
  const kind = type.split('.')[0];
  const base = kind === 'qonto' ? 'https://thirdparty.qonto.com/v2' : 'https://api.stripe.com/v1';
  const path = spec.path.includes(':id') ? spec.path.replace(':id', requiredId(params.id)) : spec.path;
  let url = base + path;
  let body;
  if (spec.method === 'GET' && spec.collection) {
    const filters = Object.fromEntries(Object.entries({ ...params, ...(params.filters || {}) }).filter(([key]) => FILTERS[kind].has(key)));
    if (type === 'qonto.listTransactions') {
      if (!filters.bank_account_id && !filters.iban) throw new Error('Select a Qonto bank account before reading transactions');
      filters.status ||= 'completed';
    }
    const query = kind === 'stripe' ? formEncode(filters) : new URLSearchParams(filters);
    if (kind === 'stripe') {
      query.set('limit', '100');
      if (params.cursor || params.starting_after) query.set('starting_after', requiredId(params.cursor || params.starting_after));
      for (const [input, field] of [['from', 'gte'], ['to', 'lt']]) {
        if (params[input]) {
          const timestamp = Date.parse(params[input]);
          if (!Number.isFinite(timestamp)) throw new Error(`Invalid ${input} date`);
          query.set(`created[${field}]`, String(Math.floor(timestamp / 1000)));
        }
      }
    } else {
      const page = Number(params.cursor || params.current_page || 1);
      if (!Number.isSafeInteger(page) || page < 1) throw new Error('Invalid Qonto page');
      query.set('current_page', String(page)); query.set('per_page', '100');
    }
    url += `?${query}`;
  } else if (spec.method !== 'GET') {
    if (!idempotencyKey) throw new Error('A durable idempotency key is required for financial changes');
    const payload = { ...(params.payload || {}) };
    for (const key of spec.required || []) if (payload[key] == null || payload[key] === '') throw new Error(`Missing ${key}`);
    if (type === 'qonto.sendInvoice' && (!Array.isArray(payload.send_to) || !payload.send_to.length || payload.send_to.some(value => typeof value !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)))) throw new Error('Valid invoice recipient emails are required');
    if (type === 'qonto.createInvoice') {
      if (!Array.isArray(payload.items) || !payload.items.length) throw new Error('Invoice items are required');
      payload.status = 'draft';
    }
    if (['stripe.createInvoice', 'stripe.finalizeInvoice'].includes(type)) payload.auto_advance = false;
    if (type === 'stripe.createInvoice') { payload.collection_method = 'send_invoice'; payload.days_until_due ??= 30; }
    if (type === 'stripe.addInvoiceItem' && (!Number.isSafeInteger(payload.amount) || payload.amount <= 0 || !/^[a-z]{3}$/.test(payload.currency))) throw new Error('Use a positive integer amount in minor units and a lowercase currency code');
    body = kind === 'stripe' ? formEncode(payload).toString() : JSON.stringify(payload);
  }
  const response = await call({ url, method: spec.method, ...(spec.emptyStatus ? { includeResponseMetadata: true } : {}), ...(body !== undefined ? { body, headers: { 'Content-Type': kind === 'stripe' ? 'application/x-www-form-urlencoded' : 'application/json' } } : {}) });
  if (spec.emptyStatus) {
    if (response.status !== spec.emptyStatus) throw new Error('Invoice delivery was not acknowledged by the provider');
    return { id: params.id, receipt: response, providerStatus: 'sent', summary: `Invoice ${params.id} sent by Qonto` };
  }
  const data = response;
  if (spec.collection) {
    const records = data[spec.collection];
    if (!Array.isArray(records)) throw new Error('Provider returned an invalid financial list');
    const next = kind === 'stripe' ? (data.has_more ? records.at(-1)?.id : null) : data.meta?.next_page;
    if (kind === 'stripe' && data.has_more && !next) throw new Error('Provider returned an empty page with more records');
    if (kind === 'qonto' && !data.meta) throw new Error('Qonto pagination metadata is missing');
    return { records, nextCursor: next == null ? null : String(next), complete: next == null, summary: `${records.length} ${kind} records retrieved${next == null ? '' : '; more pages available'}`, receipt: data };
  }
  const record = data.client_invoice || data.client || data.organization || data;
  if (spec.method !== 'GET' && !record.id) throw new Error('Provider did not return a record ID; verify in provider dashboard before retrying');
  return { id: record.id, record, receipt: data, providerStatus: record.status, summary: `${spec.summary}: ${record.id || 'retrieved'}` };
}

// A bounded, resumable import: never label a truncated page set as complete.
export async function collectFinancePages(type, params, execute, maxPages = 100) {
  if (!FINANCE_ACTIONS[type]?.collection) throw new Error('A financial list action is required');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('Invalid page budget');
  let cursor = params.cursor || null;
  const records = new Map(); const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    if (seen.has(cursor)) throw new Error('Provider pagination repeated a cursor');
    seen.add(cursor);
    const result = await execute(type, { ...params, cursor });
    for (const record of result.records) {
      const id = record.id || record.transaction_id;
      if (!id) throw new Error('Financial record is missing its provider ID');
      records.set(id, record);
    }
    cursor = result.nextCursor;
    if (!cursor) return { records: [...records.values()], complete: true, nextCursor: null };
  }
  return { records: [...records.values()], complete: false, nextCursor: cursor };
}
