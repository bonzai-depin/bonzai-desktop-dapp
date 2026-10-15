/** Deterministic preparation, never an eligibility or submission certificate. */
import { currentGrantDocument } from './grantDocuments.js';
export function prepareGrant(dossier, documents, now = Date.now()) {
  const reusable = documents.filter(d => currentGrantDocument(d, dossier, now));
  const required = dossier.requiredDocumentTypes || [];
  const attached = reusable.filter(d => (dossier.documentIds || []).includes(d.id) || (d.documentType && required.includes(d.documentType)));
  const missing = required.filter(type => !attached.some(d => d.documentType === type));
  const blockers = [];
  if (!dossier.ruleVersion || !/^https:\/\//.test(dossier.ruleSource || '')) blockers.push('Verify the official rule and version.');
  if (!required.length) blockers.push('Define the required document types.');
  if (missing.length) blockers.push('Some required documents are missing.');
  if (!dossier.eligibilityReviewedAt) blockers.push('Eligibility needs human review.');
  if (dossier.quoteSignedAt && dossier.offerAcceptedAt && dossier.quoteSignedAt < dossier.offerAcceptedAt) blockers.push('Quote predates the recorded offer acceptance; review chronology.');
  return { documentIds: attached.map(d => d.id), blockers, missing, preparedAt: now,
    summary: [dossier.title, `Beneficiary: ${dossier.beneficiary}`, `Scheme: ${dossier.scheme || ''}`, `Territory: ${dossier.territory}`, `Installation: ${dossier.workOrderReference || ''}`, `Rule: ${dossier.ruleSource || ''} (${dossier.ruleVersion || ''})`].join('\n') };
}
export function paymentCandidate(dossiers, transaction) {
  if (!transaction.id || !Number.isSafeInteger(transaction.amountCents) || transaction.amountCents <= 0 || !transaction.reference) throw new Error('A bank transaction ID, exact reference and positive integer cents are required.');
  const candidates = dossiers.filter(d => d.stage === 'awarded' && d.applicationReference === transaction.reference && d.awardedCents - (d.receivedCents || 0) >= transaction.amountCents);
  return candidates.length === 1 ? candidates[0] : null;
}
