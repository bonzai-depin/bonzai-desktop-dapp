import { actionDisplayName } from "./actionLabels.js";
import { approvalRecordTarget, approvalRecordTitle } from "./approvalRecord.js";
import { operationText } from "../../i18n/operations.js";
const titles = {
  "team.requestWork": "Transmettre une demande à une équipe",
  "team.reply": "Répondre à une équipe",
  "team.updateProcurement": "Confirmer une opération achats",
  "gmao.recordServiceAcceptance": "Enregistrer le service fait client",
  "gmao.validateProcessStep": "Valider une étape du dossier",
  "gmao.updateProcurement": "Confirmer une opération achats",
  "gmao.recordAttachment": "Enregistrer le compte-rendu terrain",
  "gmao.transitionWorkOrder": "Confirmer l’avancement terrain",
  "gmao.updateQuote": "Enregistrer la décision client",
  "gmao.saveInvoice": "Préparer la facture",
  "gmao.notifyClient": "Préparer un message client",
  "email.send": "Envoyer un email",
  "twilio.sendSMS": "Envoyer un SMS",
  "field.completeJob": "Confirmer la réalisation terrain",
  runWorkflow: "Exécuter le workflow de l’agent",
  produce: "Créer un livrable",
};
export function approvalSummary(
  action = {},
  gmao = {},
  locale = "en",
  teams = [],
) {
  const fields = [];
  const add = (label, value) => {
    if (value != null && value !== "")
      fields.push({
        label: operationText(label, locale),
        value:
          typeof value === "object" ? JSON.stringify(value) : String(value),
      });
  };
  const linkedRecord = approvalRecordTarget(action);
  if (linkedRecord) {
    add("Référence", linkedRecord.id);
    add("Version", linkedRecord.revision);
  }
  const workOrder = (gmao?.workOrders || []).find(
    (w) => w.id === (action.workOrderId || action.jobId),
  );
  add(
    "Intervention",
    workOrder
      ? `${workOrder.clientOiNumber || workOrder.workOrderNumber} · ${workOrder.title}`
      : action.workOrderId || action.jobId,
  );
  if (action.targetTeamId)
    add(
      "Destinataire",
      teams.find((t) => t.id === action.targetTeamId)?.name ||
        action.targetTeamId,
    );
  if (action.targetRole) add("Intervenant", operationText(String(action.targetRole).replace(/([a-z])([A-Z])/g, "$1 $2"), locale));
  add("Référence", action.conversationId);
  add("Destinataire", action.recipient || action.to);
  add("Objet", action.subject || action.title);
  add("Message", action.message || action.body);
  add("Fournisseur", action.supplierName);
  if (Array.isArray(action.items)) {
    add(
      "Articles",
      action.items
        .map((item) =>
          operationText(
            "{item} · {quantity} requested · {received} received",
            locale,
            {
              item: item.label || operationText("Article", locale),
              quantity: item.quantity ?? "?",
              received: item.received ?? 0,
            },
          ),
        )
        .join("\n"),
    );
  }
  add(
    "Montant",
    action.amountCents != null
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency: action.currency || "EUR",
        }).format(action.amountCents / 100)
      : action.amount,
  );
  add(
    "Référence",
    action.reference || action.orderReference || action.purchaseOrder,
  );
  add("Preuve", action.evidenceReference || action.documentId);
  add("Bon de réception", action.receiptReference);
  add("Étape", operationText(({purchase_order_signed:"Valider le BC signé", purchase_order_returned:"Valider le retour du BC", service_acceptance_requested:"Demander le service fait", billing_requested:"Transmettre à la facturation", close:"Clôturer après accord client"})[action.step] || action.step || "", locale));
  add("Reçu d’envoi", action.outboxId);
  add("État demandé", action.status);
  add("Signataire", action.customerSignatory || action.signer);
  add("Workflow", action.workflowId);
  add("Description", action.description || action.notes);
  return {
    title: approvalRecordTitle(action, locale) || operationText(
      titles[action.type] || actionDisplayName(action, locale),
      locale,
    ),
    fields,
  };
}
