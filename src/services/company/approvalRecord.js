// Read-only navigation targets for approvals whose payload lives in a saved record.
// Preserve the approved ID and revision; never choose the first record in a list.
export function approvalRecordTarget(action = {}) {
  const kind = {
    "billing.chorusAction": "invoice",
    "records.sendMessage": "recordMessage",
    "purchasing.sendRfq": "rfq",
    "purchasing.approveRequest": "purchaseRequest",
    "purchasing.issueOrder": "purchaseRequest",
  }[action.type];
  if (!kind || typeof action.recordId !== "string" || !action.recordId.trim())
    return null;
  return {
    kind,
    id: action.recordId,
    revision: action.input?.revision ?? null,
  };
}
export function approvalRecordLabel(target, locale = "en") {
  const fr = String(locale).startsWith("fr");
  if (target?.kind === "recordMessage") return fr ? "Voir le message" : "View message";
  if (target?.kind === "purchaseRequest")
    return fr ? "Voir la demande d’achat" : "View purchase request";
  return target?.kind === "invoice"
    ? fr
      ? "Voir la facture"
      : "View invoice"
    : fr
      ? "Voir la demande fournisseur"
      : "View supplier request";
}
export function approvalRecordTitle(action, locale = "en") {
  const fr = String(locale).startsWith("fr");
  if (action?.type === "records.sendMessage") return fr ? "Envoyer le message validé" : "Send reviewed message";
  if (action?.type === "purchasing.approveRequest")
    return action.input?.decision === "rejected"
      ? fr
        ? "Refuser la demande d’achat"
        : "Reject purchase request"
      : fr
        ? "Valider la demande d’achat"
        : "Approve purchase request";
  if (action?.type === "purchasing.issueOrder")
    return fr ? "Créer le bon de commande" : "Create purchase order";
  if (action?.type === "purchasing.sendRfq")
    return fr ? "Envoyer la demande fournisseur" : "Send supplier request";
  if (action?.type === "billing.chorusAction")
    return (
      {
        upload: fr
          ? "Transmettre le PDF à Chorus"
          : "Upload invoice PDF to Chorus",
        submit: fr
          ? "Déposer la facture dans Chorus"
          : "Submit invoice to Chorus",
        status: fr ? "Consulter le statut Chorus" : "Check Chorus status",
      }[action.input?.operation] ||
      (fr ? "Action Chorus à valider" : "Review Chorus action")
    );
  return null;
}
