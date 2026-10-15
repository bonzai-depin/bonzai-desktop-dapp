const plain = (value) => JSON.parse(JSON.stringify(value));
const api = () => {
  const value = window.electronAPI?.db?.companyBilling;
  if (!value)
    throw new Error(
      "Le moteur de facturation local est indisponible. Redémarrez BonzAI après la mise à jour.",
    );
  return value;
};
export const snapshot = (companyId) => api().snapshot(companyId);
export const saveInvoice = (companyId, input) =>
  api().saveInvoice(companyId, plain(input));
export const importLegacyInvoice = (companyId, id) =>
  api().importLegacyInvoice(companyId, id);
export const saveContractProfile = (companyId, input) =>
  api().saveContractProfile(companyId, plain(input));
export const transitionInvoice = (companyId, id, input) =>
  api().transitionInvoice(companyId, id, plain(input));
export const recordPayment = (companyId, id, input) =>
  api().recordPayment(companyId, id, plain(input));
export const generateDocument = (companyId, id) =>
  api().generateDocument(companyId, id);
export const exportDossier = (companyId, id) =>
  api().exportDossier(companyId, id);
export const saveSubcontractorDossier = (companyId, input) =>
  api().saveSubcontractorDossier(companyId, plain(input));
export const transitionSubcontractorDossier = (companyId, id, input) =>
  api().transitionSubcontractorDossier(companyId, id, plain(input));
export const exportSubcontractorDossier = (companyId, id) =>
  api().exportSubcontractorDossier(companyId, id);

export const saveCustomer = (companyId, input) =>
  api().saveCustomer(companyId, plain(input));
export const attachEvidence = (companyId, kind, id, input) =>
  api().attachEvidence(companyId, kind, id, plain(input));
export const chorusAction = (companyId, id, input) =>
  api().chorusAction(companyId, id, plain(input));

export const reconcileChorusAction = (companyId, id, input) =>
  api().reconcileChorusAction(companyId, id, plain(input));
