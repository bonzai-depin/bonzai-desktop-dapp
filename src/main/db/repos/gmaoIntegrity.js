import { get } from "../connection.js";
const refs = {
  sourceDocumentId: "gmao_document_intake",
  matchedWorkOrderId: "gmao_work_orders",
  issueId: "issues",
  contractId: "gmao_contracts",
  clientId: "gmao_clients",
  serviceContractId: "gmao_service_contracts",
  siteId: "gmao_sites",
  assetId: "gmao_assets",
  maintenancePlanId: "gmao_maintenance_plans",
  workOrderId: "gmao_work_orders",
  attachmentSheetId: "gmao_attachment_sheets",
  procurementId: "gmao_procurements",
  supplierId: "gmao_suppliers",
  quoteId: "gmao_quotes",
  invoiceId: "gmao_invoices",
  documentId: "gmao_documents",
  proformaDocumentId: "gmao_documents",
  subcontractorId: "gmao_subcontractors",
};
export function owned(table, companyId, id, optional = false) {
  if (!id && optional) return null;
  const row = get()
    .db.prepare(`SELECT * FROM ${table} WHERE id = ? AND company_id = ?`)
    .get(id || "", companyId);
  if (!row) throw new Error("Référence introuvable dans cette entreprise.");
  return row;
}
export function scopeInput(table, companyId, input = {}) {
  if (input.id) {
    const row = get()
      .db.prepare(`SELECT company_id FROM ${table} WHERE id = ?`)
      .get(input.id);
    if (row && row.company_id !== companyId)
      throw new Error("Cet enregistrement appartient à une autre entreprise.");
  }
  const found = {};
  for (const [key, target] of Object.entries(refs))
    if (input[key]) found[key] = owned(target, companyId, input[key]);
  const wo = found.workOrderId;
  for (const key of [
    "attachmentSheetId",
    "procurementId",
    "quoteId",
    "invoiceId",
    "documentId",
    "proformaDocumentId",
  ]) {
    if (wo && found[key]?.work_order_id && found[key].work_order_id !== wo.id)
      throw new Error("La pièce doit appartenir à la même intervention.");
  }
  if (found.assetId && input.siteId && found.assetId.site_id !== input.siteId)
    throw new Error("L’équipement ne fait pas partie de ce site.");
  if (
    found.serviceContractId &&
    input.clientId &&
    found.serviceContractId.client_id !== input.clientId
  )
    throw new Error("Le contrat ne fait pas partie de ce client.");
  return found;
}
export function validateSchedule(companyId, id, input, current = {}) {
  const at =
    input.scheduledAt === undefined ? current.scheduledAt : input.scheduledAt;
  const who =
    input.assigneeHuman === undefined
      ? current.assigneeHuman
      : input.assigneeHuman;
  const duration = Number(
    input.durationMinutes ?? current.durationMinutes ?? 60,
  );
  if (!Number.isInteger(duration) || duration < 15 || duration > 1440)
    throw new Error("Durée attendue : 15 à 1440 minutes.");
  if (at != null && (!Number.isFinite(at) || at <= 0))
    throw new Error("Créneau invalide.");
  if (
    current.status === "waiting_parts" &&
    (input.scheduledAt !== undefined || input.assigneeHuman !== undefined)
  ) {
    const pending = get()
      .db.prepare(
        "SELECT id FROM gmao_procurements WHERE company_id=? AND work_order_id=? AND status NOT IN ('received','cancelled')",
      )
      .get(companyId, id);
    if (pending)
      throw new Error("Réceptionnez les pièces avant de replanifier.");
    if (
      current.repairMode === "with_quote" &&
      current.quoteStatus !== "purchase_order_received"
    )
      throw new Error("Bon de commande client attendu.");
  }
  if (at && (input.assetId || current.assetId)) {
    const assetId = input.assetId || current.assetId;
    const overlap = get().db.prepare(`SELECT work_order_number FROM gmao_work_orders WHERE company_id=? AND id!=? AND asset_id=? AND type!=? AND status NOT IN ('completed','cancelled') AND scheduled_at<? AND scheduled_at+duration_minutes*60000>? LIMIT 1`).get(companyId,id||'',assetId,input.type||current.type||'corrective',at+duration*60000,at);
    if (overlap) throw new Error(`Préventif et correctif ne peuvent pas se dérouler simultanément sur cet équipement (${overlap.work_order_number}).`);
  }
  if (!at || !who) return;
  const conflict = get()
    .db.prepare(
      `SELECT work_order_number FROM gmao_work_orders WHERE company_id = ? AND id != ? AND assignee_human = ? COLLATE NOCASE AND status NOT IN ('completed','cancelled') AND scheduled_at < ? AND scheduled_at + duration_minutes * 60000 > ? LIMIT 1`,
    )
    .get(companyId, id || "", who.trim(), at + duration * 60000, at);
  if (conflict)
    throw new Error(
      `Ce technicien est déjà planifié sur ${conflict.work_order_number}.`,
    );
}
