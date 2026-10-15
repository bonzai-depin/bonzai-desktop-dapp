import { operationText } from '../../i18n/operations.js';
export const ACTION_LABELS = {
  'intake.analyze':'Analyze incoming information', 'intake.process':'Process incoming information', 'intake.readSource':'Read source document', 'intake.readRecord':'Read saved record', 'intake.snapshot':'Read imports',
  'sales.saveRecord':'Save customer case', 'sales.handoff':'Share accepted work', 'sales.acceptHandoff':'Create intervention from accepted work', 'sales.runReview':'Review customer follow-ups',
  'records.shareEvidence':'Share business evidence','records.readSharedEvidence':'Read shared evidence','records.listSharedEvidence':'List shared evidence','records.saveCollection':'Record payment response',
  'maintenance.planRoute':'Preview technician route','maintenance.applyRoute':'Confirm technician route','purchasing.saveWarranty':'Update warranty claim',

  'purchasing.saveLogistics': 'Update logistics assessment',
  publishComplianceReport: 'Prepare compliance report',
  publishFinancialReport: 'Prepare financial report',
  publishProductReport: 'Prepare product report',
  publishExperimentReport: 'Prepare experiment report',
  runWorkflow: 'Run workflow', runFineTune: 'Train model', produce: 'Create deliverable',
  vetoAction: 'Block action', amendCharter: 'Update team mission',
  'grants.prepareBatch': 'Prepare applications', 'grants.importInstallations': 'Import installations',
  'grants.reconcilePayment': 'Reconcile a payment', 'grants.recordCorrection': 'Prepare correction',
  'grants.saveDossier': 'Save application', 'grants.advanceDossier': 'Advance application',
  'browser.fillForm': 'Fill reviewed form', 'browser.inspect': 'Read page',
  'browser.navigate': 'Open portal', 'browser.uploadDocument': 'Upload document',
};
export function actionDisplayName(action, locale = 'en') {
  const type = typeof action === 'string' ? action : action?.type;
  if (!type) return operationText('Review action', locale);
  const readable = String(type).split('.').pop().replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[._:-]+/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  return operationText(ACTION_LABELS[type] || readable.charAt(0).toUpperCase()+readable.slice(1), locale);
}
