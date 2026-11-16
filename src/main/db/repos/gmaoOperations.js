/** Operational records share the company's local boundary, including maintenance ↔ purchasing. */
import * as casework from './gmaoCasework.js';
import { GAS_CONTRACT_TERMS, interventionProgress } from "../../../services/company/gmaoProcess.js";
import { v4 as uuid } from "uuid";
import { get } from "../connection.js";
import { owned, scopeInput } from "./gmaoIntegrity.js";
import * as gmao from "./gmao.js";
import { validatePricingProfile } from '../../../services/company/contractPricing.js';
import { dossierContext } from './gmaoMaintenance.js';
export const camel = (row) =>
  row
    ? Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
          [
            "items",
            "settings",
            "receipt",
            "calculation",
            "metadata",
            "photo_refs",
            "measurements",
            "parts_used",
            "evidence",
          ].includes(k) && typeof v === "string"
            ? JSON.parse(v)
            : v,
        ]),
      )
    : null;
const all = (table, id) =>
  get()
    .db.prepare(
      `SELECT * FROM ${table} WHERE company_id = ? ORDER BY created_at DESC`,
    )
    .all(id)
    .map(camel);
export function operationsSnapshot(id) {
  return {
    clients: all("gmao_clients", id),
    serviceContracts: all("gmao_service_contracts", id),
    suppliers: all("gmao_suppliers", id),
    handoffs: all("gmao_handoffs", id),
    outbox: all("gmao_outbox", id),
  };
}
function save(table, companyId, input, fields) {
  scopeInput(table, companyId, input);
  if (!input.name?.trim()) throw new Error("Le nom est obligatoire.");
  const now = Date.now(),
    id = input.id || uuid(),
    existing = input.id ? owned(table, companyId, id) : {};
  const row = {
    id,
    company_id: companyId,
    ...fields,
    created_at: existing.created_at || now,
    updated_at: now,
  };
  const keys = Object.keys(row);
  get()
    .db.prepare(
      `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((k) => "@" + k).join(",")}) ON CONFLICT(id) DO UPDATE SET ${keys
        .filter((k) => !["id", "company_id", "created_at"].includes(k))
        .map((k) => k + "=excluded." + k)
        .join(",")}`,
    )
    .run(row);
  return camel(owned(table, companyId, id));
}
export function saveClient(id, input = {}) {
  return save("gmao_clients", id, input, {
    name: input.name?.trim(),
    contact_name: input.contactName || null,
    email: input.email || null,
    phone: input.phone || null,
    address: input.address || null,
    active: input.active === false ? 0 : 1,
  });
}
export function saveServiceContract(id, input = {}) {
  owned("gmao_clients", id, input.clientId);
  for (const key of ["startsAt", "endsAt"])
    if (input[key] != null && (!Number.isFinite(input[key]) || input[key] <= 0))
      throw new Error("Dates du contrat invalides.");
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt)
    throw new Error("La fin du contrat doit suivre son début.");
  if (input.id) {
    const previous = owned("gmao_service_contracts", id, input.id);
    if (previous.client_id !== input.clientId)
      throw new Error("Le client d’un contrat existant ne peut pas changer.");
  }
  for (const policy of Object.values(input.settings?.sla || {}))
    for (const key of [
      "interventionHours",
      "restorationHours",
      "maxDowntimeHours",
    ])
      if (
        policy[key] != null &&
        (!Number.isFinite(policy[key]) || policy[key] < 0)
      )
        throw new Error("Délai contractuel invalide.");
  if (input.settings?.gasFranchise) {
    const profile = input.settings.gasFranchise;
    if (!['ST3','ST4'].includes(profile.technicalSection) || !String(profile.validatedBy || '').trim() || input.gasValidated !== true) throw new Error('Validez les conditions de franchise gaz, leur section et le responsable de validation.');
    input = {...input, settings:{...input.settings, gasFranchise:{...GAS_CONTRACT_TERMS, technicalSection:profile.technicalSection, validatedBy:profile.validatedBy.trim(), validatedAt:Date.now()}}};
  }
  if (input.settings?.pricingProfile) input = { ...input, settings: { ...input.settings,
    pricingProfile: validatePricingProfile(input.settings.pricingProfile, { confirmed: input.pricingValidated === true }),
  } };
  const vat = Number(input.vatRate ?? 0);
  if (!Number.isFinite(vat) || vat < 0 || vat > 100)
    throw new Error("TVA invalide.");
  return save("gmao_service_contracts", id, input, {
    client_id: input.clientId,
    name: input.name?.trim(),
    reference: input.reference || null,
    starts_at: input.startsAt || null,
    ends_at: input.endsAt || null,
    vat_rate: vat,
    currency: input.currency || "EUR",
    settings: JSON.stringify(input.settings || {}),
  });
}
export function saveSupplier(id, input = {}) {
  return save("gmao_suppliers", id, input, {
    name: input.name?.trim(),
    email: input.email || null,
    phone: input.phone || null,
    reference: input.reference || null,
    notes: input.notes || null,
  });
}
export function acknowledgeHandoff(companyId, id, input = {}) {
  const row = owned("gmao_handoffs", companyId, id);
  if (row.status === "completed") return camel(row);
  if (!String(input.responsible || "").trim())
    throw new Error("Identifiez le responsable achats.");
  get()
    .db.prepare(
      "UPDATE gmao_handoffs SET status = 'acknowledged', responsible = ?, note = ?, updated_at = ? WHERE id = ?",
    )
    .run(input.responsible.trim(), input.note || null, Date.now(), id);
  get()
    .db.prepare("UPDATE gmao_procurements SET responsible = ? WHERE id = ?")
    .run(input.responsible.trim(), row.procurement_id);
  gmao.addEvent(companyId, row.work_order_id, {
    eventType: "purchasing_acknowledged",
    actorName: input.responsible,
    note: "Demande prise en charge par les achats",
    evidence: { handoffId: id, procurementId: row.procurement_id },
  });
  return camel(owned("gmao_handoffs", companyId, id));
}
export function getDossier(companyId, reference) {
  const db = get().db;
  const rows = db
    .prepare(
      "SELECT id FROM gmao_work_orders WHERE company_id = ? AND (id = ? OR work_order_number = ? OR client_oi_number = ?)",
    )
    .all(companyId, reference, reference, reference);
  if (rows.length !== 1)
    throw new Error(
      rows.length
        ? "Référence ambiguë : précisez le numéro interne de l’intervention."
        : "Intervention introuvable.",
    );
  const workOrder = gmao.getWorkOrder(companyId, rows[0].id),
    site = camel(owned("gmao_sites", companyId, workOrder.siteId));
  const related = {};
  for (const [key, table] of Object.entries({
    events: "gmao_work_order_events",
    documents: "gmao_documents",
    quotes: "gmao_quotes",
    invoices: "gmao_invoices",
    procurements: "gmao_procurements",
    attachments: "gmao_attachment_sheets",
    handoffs: "gmao_handoffs",
    outbox: "gmao_outbox",
  }))
    related[key] = db
      .prepare(
        `SELECT * FROM ${table} WHERE company_id = ? AND work_order_id = ?`,
      )
      .all(companyId, workOrder.id)
      .map(camel);
  const fieldEvidence=casework.snapshot(companyId,{workOrderId:workOrder.id});
  const serializedEvidence=JSON.stringify(fieldEvidence.records);
  return {
    workOrder,
    site,
    client: site.clientId
      ? camel(owned("gmao_clients", companyId, site.clientId))
      : null,
    asset: workOrder.assetId
      ? camel(owned("gmao_assets", companyId, workOrder.assetId))
      : null,
    ...related,
    casework: fieldEvidence,
    relatedAssets: db.prepare('SELECT id,asset_code,serial_number FROM gmao_assets WHERE company_id=?').all(companyId).filter(a=>serializedEvidence.includes(a.id)).map(camel),
    maintenance: dossierContext(companyId, workOrder),
    process: interventionProgress(workOrder, related),
  };
}
export function searchWorkOrders(companyId, input = {}) {
  const query = String(input.query || "").slice(0, 200),
    limit = Math.min(100, Math.max(1, Number(input.limit) || 30));
  const rows = get()
    .db.prepare(
      `SELECT w.*, s.name AS site_name, s.client_id, c.name AS client_name FROM gmao_work_orders w JOIN gmao_sites s ON s.id=w.site_id LEFT JOIN gmao_clients c ON c.id=s.client_id WHERE w.company_id=? AND (?='' OR s.client_id=?) AND (?='' OR w.status=?) AND (w.work_order_number LIKE ? OR COALESCE(w.client_oi_number,'') LIKE ? OR w.title LIKE ? OR s.name LIKE ? OR c.name LIKE ?) ORDER BY w.reported_at DESC LIMIT ?`,
    )
    .all(
      companyId,
      input.clientId || "",
      input.clientId || "",
      input.status || "",
      input.status || "",
      ...Array(5).fill("%" + query + "%"),
      limit + 1,
    );
  return {
    results: rows.slice(0, limit).map(camel),
    hasMore: rows.length > limit,
  };
}
export function saveOutbox(companyId, input = {}) {
  scopeInput("gmao_outbox", companyId, input);
  const db = get().db,
    now = Date.now(),
    existing = input.id ? owned("gmao_outbox", companyId, input.id) : null;
  if (existing && !["draft", "failed"].includes(existing.status))
    throw new Error(
      "Ce message est verrouillé : conservez son reçu et créez un nouveau brouillon.",
    );
  if (existing && input.workOrderId !== existing.work_order_id)
    throw new Error("Un message ne peut pas changer de dossier.");
  const channel = input.channel || "email",
    recipient = String(input.recipient || "").trim(),
    sender = String(input.sender || "").trim();
  const valid =
    channel === "email"
      ? (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      : (v) => /^\+[1-9]\d{7,14}$/.test(v);
  if (
    !["email", "sms"].includes(channel) ||
    !valid(recipient) ||
    !valid(sender)
  )
    throw new Error(
      channel === "sms"
        ? "Numéros expéditeur et destinataire au format international (+…)."
        : "Adresses expéditeur et destinataire invalides.",
    );
  if (!String(input.message || "").trim())
    throw new Error("Le message est vide.");
  if (channel === "sms" && input.documentId)
    throw new Error(
      "Les PDF se joignent aux emails ; le SMS contient uniquement le texte validé.",
    );
  owned("gmao_work_orders", companyId, input.workOrderId);
  const document = input.documentId
    ? owned("gmao_documents", companyId, input.documentId)
    : null;
  if (
    document &&
    (!document.blob_id || document.work_order_id !== input.workOrderId)
  )
    throw new Error(
      "Joignez une version locale du document de cette intervention.",
    );
  const notification = input.notificationId ? owned('gmao_customer_notifications', companyId, input.notificationId) : null;
  if (notification && notification.work_order_id !== input.workOrderId) throw new Error('La notification appartient à une autre intervention.');
  const key = existing?.request_key || (notification ? 'notification-' + notification.id : input.requestKey) || uuid();
  const duplicate = db
    .prepare("SELECT * FROM gmao_outbox WHERE company_id=? AND request_key=?")
    .get(companyId, key);
  if (!existing && duplicate) return camel(duplicate);
  const id = existing?.id || uuid();
  db.prepare(
    `INSERT INTO gmao_outbox(id,company_id,work_order_id,document_id,channel,recipient,sender,subject,message,status,revision,request_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'draft',?,?,?,?) ON CONFLICT(id) DO UPDATE SET document_id=excluded.document_id,channel=excluded.channel,recipient=excluded.recipient,sender=excluded.sender,subject=excluded.subject,message=excluded.message,status='draft',revision=excluded.revision,approved_revision=NULL,approved_at=NULL,error=NULL,updated_at=excluded.updated_at`,
  ).run(
    id,
    companyId,
    input.workOrderId,
    input.documentId || null,
    channel,
    recipient,
    sender,
    String(input.subject || "Intervention").trim(),
    input.message,
    (existing?.revision || 0) + 1,
    key,
    existing?.created_at || now,
    now,
  );
  if (notification) db.prepare("UPDATE gmao_customer_notifications SET delivery_status='prepared', metadata=?,updated_at=? WHERE id=?").run(JSON.stringify({...JSON.parse(notification.metadata || '{}'),outboxId:id}),now,notification.id);
  return camel(owned("gmao_outbox", companyId, id));
}
export function recoverOutbox() {
  return get()
    .db.prepare(
      "UPDATE gmao_outbox SET status='unknown', error='Envoi interrompu : vérifiez le fournisseur avant toute nouvelle tentative.', updated_at=? WHERE status='submitting'",
    )
    .run(Date.now()).changes;
}
export function resolveOutbox(companyId, id, input = {}) {
  const row = owned("gmao_outbox", companyId, id);
  if (row.status !== "unknown")
    throw new Error(
      "Seul un résultat incertain peut être rapproché manuellement.",
    );
  if (
    !["submitted", "failed"].includes(input.status) ||
    !String(input.evidence || "").trim()
  )
    throw new Error("Indiquez le résultat vérifié et sa preuve fournisseur.");
  if (input.status === "submitted" && !input.providerId)
    throw new Error("Le reçu fournisseur est obligatoire.");
  get()
    .db.prepare(
      "UPDATE gmao_outbox SET status=?,provider_id=?,receipt=?,approved_revision=NULL,updated_at=? WHERE id=?",
    )
    .run(
      input.status,
      input.providerId || null,
      JSON.stringify({
        ...JSON.parse(row.receipt || "{}"),
        manuallyReconciled: true,
        evidence: input.evidence,
      }),
      Date.now(),
      id,
    );
  gmao.addEvent(companyId, row.work_order_id, {
    eventType: "delivery_reconciled",
    note: input.evidence,
    evidence: { outboxId: id, status: input.status },
  });
  return camel(owned("gmao_outbox", companyId, id));
}
