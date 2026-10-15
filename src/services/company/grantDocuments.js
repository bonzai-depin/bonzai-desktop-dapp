// Reuse identity evidence, never an installation's invoice or submission receipt.
export const COMPANY_GRANT_DOCUMENTS = ["company_identity", "qualification"];
export function grantDocumentScope(document) {
  if (
    COMPANY_GRANT_DOCUMENTS.includes(document.documentType) &&
    !document.beneficiary &&
    !document.dossierId
  )
    return "company";
  if (
    document.documentType === "tax_notice" &&
    document.beneficiary &&
    !document.dossierId
  )
    return "beneficiary";
  return "application";
}
export function documentBelongsToGrant(document, dossier) {
  if (!dossier) return false;
  if (document.beneficiary && document.beneficiary !== dossier.beneficiary)
    return false;
  if (document.dossierId) return document.dossierId === dossier.id;
  return grantDocumentScope(document) !== "application";
}
export function currentGrantDocument(document, dossier, now = Date.now()) {
  return (
    !document.draft &&
    documentBelongsToGrant(document, dossier) &&
    (!document.validUntil ||
      Date.parse(document.validUntil + "T23:59:59") >= now)
  );
}
