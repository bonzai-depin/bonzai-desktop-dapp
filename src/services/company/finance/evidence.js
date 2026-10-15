import * as distribution from '../distribution.solo.js';
import { reconcilePayouts } from './reconcile.js';
const isEvidence = row => /^(qonto|stripe|finance)\./.test(row?.meta?.source || '');
export async function executeFinanceLocal(companyId, type, params, context, store = distribution) {
  if (type === 'finance.listEvidence') {
    const records = (await store.listCatalog(companyId)).filter(isEvidence).map(row => ({ id: row.id, title: row.prompt, source: row.meta.source, complete: row.meta.complete, createdAt: row.createdAt }));
    return { status: 'completed', records, receipt: { records }, summary: `${records.length} local financial evidence records` };
  }
  if (type === 'finance.readEvidence') {
    if (!params.contentId) throw new Error('An existing company evidence ID is required');
    const row = await store.getRecord(companyId, params.contentId);
    if (!row || !isEvidence(row)) throw new Error('Financial evidence not found in this company');
    const record = JSON.parse(row.payload);
    return { status: 'completed', contentId: row.id, record, receipt: { contentId: row.id }, summary: row.prompt };
  }
  if (type !== 'finance.reconcilePayouts') throw new Error('Unknown local financial action');
  const result = reconcilePayouts(params);
  const saved = await store.publishContent(companyId, { pipeline: 'text', prompt: 'Payout settlement reconciliation · review required', payload: JSON.stringify(result, null, 2), price: 0, role: context.role, companion: context.companion, issueId: context.issueId, meta: { format: 'json', source: type, complete: true, scope: 'local_draft' } });
  if (!saved?.id) throw new Error('Reconciliation could not be saved in company Results');
  return { ...result, contentId: saved.id };
}
