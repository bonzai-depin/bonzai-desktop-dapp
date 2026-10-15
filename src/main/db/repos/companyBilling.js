import {validatePartLines} from './partTraceability.js';
import * as audit from "./audit.js";
import { randomUUID, createHash } from "node:crypto";
import { get } from "../connection.js";
import * as blobs from "../blobs.js";
import { owned } from "./gmaoIntegrity.js";
import {
  calculateInvoice,
  invoiceIssues,
  cents,
} from "../../../services/company/billingDomain.js";
import { saveClient as saveGmaoClient } from "./gmaoOperations.js";
import { billingDocumentHtml } from "../../../services/company/billingDocuments.js";

const decode = (row) =>
  row
    ? {
        ...JSON.parse(row.data || "{}"),
        id: row.id,
        companyId: row.company_id,
        clientId: row.client_id,
        profileId: row.profile_id,
        subcontractorId: row.subcontractor_id,
        serviceContractId: row.service_contract_id,
        legacyInvoiceId: row.legacy_invoice_id,
        number: row.number,
        status: row.status,
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.name ? { name: row.name } : {}),
      }
    : null;
const record = (table, companyId, id) => decode(owned(table, companyId, id));
const all = (table, companyId) =>
  get()
    .db.prepare(
      `SELECT * FROM ${table} WHERE company_id=? ORDER BY updated_at DESC`,
    )
    .all(companyId)
    .map(decode);
function event(companyId, id, type, evidence = {}) {
  get()
    .db.prepare(
      "INSERT INTO company_billing_events(id,company_id,invoice_id,event_type,evidence,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      companyId,
      id,
      type,
      JSON.stringify(evidence),
      Date.now(),
    );
  audit.append(companyId, {
    kind: "action",
    role: "owner",
    action: `billing.${type}`,
    status: "recorded",
    recordId: id,
  });
}
function writeInvoice(companyId, row, type, evidence = {}) {
  const now = Date.now();
  get()
    .db.prepare(
      `INSERT INTO company_billing_invoices(id,company_id,client_id,profile_id,legacy_invoice_id,number,status,direction,currency,total_cents,data,revision,created_at,updated_at)
    VALUES(@id,@companyId,@clientId,@profileId,@legacyInvoiceId,@number,@status,'receivable',@currency,@totalCents,@data,@revision,@createdAt,@updatedAt)
    ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,profile_id=excluded.profile_id,number=excluded.number,status=excluded.status,currency=excluded.currency,total_cents=excluded.total_cents,data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at`,
    )
    .run({
      ...row,
      companyId,
      profileId: row.profileId || null,
      legacyInvoiceId: row.legacyInvoiceId || null,
      number: row.number || null,
      currency: row.currency || "EUR",
      revision: (row.revision || 0) + 1,
      createdAt: row.createdAt || now,
      updatedAt: now,
      data: JSON.stringify(row),
    });
  event(companyId, row.id, type, evidence);
  return record("company_billing_invoices", companyId, row.id);
}
function orders(companyId) {
  return get()
    .db.prepare(
      "SELECT w.*,s.client_id,s.service_contract_id FROM gmao_work_orders w JOIN gmao_sites s ON s.id=w.site_id WHERE w.company_id=? ORDER BY w.created_at DESC",
    )
    .all(companyId)
    .map((w) => ({
      id: w.id,
      clientId: w.client_id,
      serviceContractId: w.service_contract_id,
      workOrderNumber: w.work_order_number,
      title: w.title,
      serviceAcceptanceReference: w.service_acceptance_reference,
      serviceAcceptanceReceivedAt: w.service_acceptance_received_at,
      billingStatus: w.billing_status,
    }));
}
export function snapshot(companyId) {
  if (!get().db.prepare("SELECT id FROM companies WHERE id=?").get(companyId))
    throw new Error("Entreprise introuvable.");
  return snapshotData(companyId);
}
function snapshotData(companyId) {
  const db = get().db,
    profiles = all("company_billing_profiles", companyId),
    workOrders = orders(companyId);
  const invoices = all("company_billing_invoices", companyId).map((i) => ({
    ...i,
    issues: invoiceIssues(
      i,
      profiles.find((p) => p.id === i.profileId),
      workOrders,
    ),
  }));
  return {
    profiles,
    chorusConnections: db
      .prepare(
        "SELECT id,label,status,account_identifier AS environment FROM connectors WHERE company_id=? AND kind='chorus' ORDER BY label",
      )
      .all(companyId),
    invoices,
    workOrders,
    clients: db
      .prepare(
        "SELECT id,name,email,phone,address,contact_name AS contactName FROM gmao_clients WHERE company_id=? ORDER BY name",
      )
      .all(companyId),
    contracts: db
      .prepare(
        "SELECT id,name,client_id AS clientId FROM gmao_service_contracts WHERE company_id=? ORDER BY name",
      )
      .all(companyId),
    subcontractors: db
      .prepare(
        "SELECT id,name,registration FROM gmao_subcontractors WHERE company_id=? ORDER BY name",
      )
      .all(companyId),
    dossiers: all("company_billing_subcontractors", companyId),
    legacy: db
      .prepare(
        "SELECT i.*,s.client_id AS clientId,s.service_contract_id AS serviceContractId FROM gmao_invoices i JOIN gmao_work_orders w ON w.id=i.work_order_id JOIN gmao_sites s ON s.id=w.site_id WHERE i.company_id=? AND NOT EXISTS(SELECT 1 FROM company_billing_invoices b WHERE b.legacy_invoice_id=i.id) ORDER BY i.issued_at DESC",
      )
      .all(companyId),
    events: db
      .prepare(
        "SELECT id,invoice_id AS invoiceId,event_type AS eventType,evidence,created_at AS createdAt FROM company_billing_events WHERE company_id=? ORDER BY created_at DESC",
      )
      .all(companyId)
      .map((e) => ({ ...e, evidence: JSON.parse(e.evidence) })),
  };
}
export function saveCustomer(companyId, input = {}) {
  if (!input.name?.trim()) throw new Error("Renseignez le nom du client.");
  const row = saveGmaoClient(companyId, input);
  audit.append(companyId, {
    kind: "action",
    role: "owner",
    action: "billing.customer_saved",
    status: "recorded",
    recordId: row.id,
  });
  return row;
}
export function saveContractProfile(companyId, input = {}) {
  const old = input.id
    ? record("company_billing_profiles", companyId, input.id)
    : null;
  if (input.serviceContractId)
    owned("gmao_service_contracts", companyId, input.serviceContractId);
  if (!input.name?.trim()) throw new Error("Nommez le profil de facturation.");
  const data = { ...old, ...input, id: input.id || randomUUID() };
  if (data.validatedBy && !data.evidenceReference?.trim())
    throw new Error("Référence des conditions validées obligatoire.");
  if (
    data.kCoefficient != null &&
    (!Number.isFinite(data.kCoefficient) || data.kCoefficient < 0)
  )
    throw new Error("Coefficient K invalide.");
  const now = Date.now();
  get()
    .db.prepare(
      `INSERT INTO company_billing_profiles(id,company_id,service_contract_id,name,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET service_contract_id=excluded.service_contract_id,name=excluded.name,data=excluded.data,updated_at=excluded.updated_at`,
    )
    .run(
      data.id,
      companyId,
      data.serviceContractId || null,
      data.name.trim(),
      JSON.stringify(data),
      old?.createdAt || now,
      now,
    );
  audit.append(companyId, {
    kind: "action",
    role: "owner",
    action: "billing.profile_saved",
    status: "recorded",
    recordId: data.id,
  });
  return record("company_billing_profiles", companyId, data.id);
}
export function saveInvoice(companyId, input = {}) {
  return get().db.transaction(() => {
    const old = input.id
      ? record("company_billing_invoices", companyId, input.id)
      : null;
    if (old && old.status !== "draft")
      throw new Error("Seul un brouillon peut être modifié.");
    if (old && input.revision !== old.revision)
      throw new Error("Cette facture a changé. Rechargez avant de modifier.");
    const clientId = input.clientId || old?.clientId;
    owned("gmao_clients", companyId, clientId);
    const profileId = Object.hasOwn(input, "profileId")
        ? input.profileId || null
        : old?.profileId,
      profile = profileId
        ? record("company_billing_profiles", companyId, profileId)
        : null;
    if (
      profile?.serviceContractId &&
      owned("gmao_service_contracts", companyId, profile.serviceContractId)
        .client_id !== clientId
    )
      throw new Error("Ce contrat ne concerne pas ce client.");
    const ids = [...new Set(input.workOrderIds ?? old?.workOrderIds ?? [])],
      available = orders(companyId);
    for (const id of ids) {
      const wo = available.find((w) => w.id === id);
      if (
        !wo ||
        wo.clientId !== clientId ||
        (profile?.serviceContractId &&
          wo.serviceContractId !== profile.serviceContractId)
      )
        throw new Error(
          "Les interventions doivent appartenir au client et au contrat facturés.",
        );
    }
    const row = {
      ...old,
      ...input,
      id: old?.id || randomUUID(),
      status: "draft",
      number: old?.number || null,
      legacyInvoiceId: old?.legacyInvoiceId || null,
      clientId,
      profileId,
      workOrderIds: ids,
      currency: profile?.currency || "EUR",
      kind: input.kind || old?.kind || "standalone",
    };
    if (!["unit", "forfait", "standalone"].includes(row.kind))
      throw new Error("Type de facturation inconnu.");
    for (const key of ["issuedAt", "dueAt", "periodStart", "periodEnd"])
      if (row[key] != null && (!Number.isFinite(row[key]) || row[key] <= 0))
        throw new Error("Date invalide.");
    Object.assign(row, calculateInvoice(row));
    validatePartLines(companyId, row);
    row.document = null;
    row.profileSnapshot = null;
    row.payments = old?.payments || [];
    row.chorus = old?.chorus || null;
    row.attachments = [...(old?.attachments || [])];
    if (
      old?.document &&
      !row.attachments.some((a) => a.blobId === old.document.blobId)
    )
      row.attachments.push({
        ...old.document,
        id: randomUUID(),
        kind: "previous_invoice_pdf",
        addedAt: Date.now(),
      });
    for (const state of ["submitted", "accepted", "rejected"])
      row[`${state}Receipt`] = old?.[`${state}Receipt`] || null;
    if (
      row.chorus?.attempt &&
      ["pending", "unknown"].includes(row.chorus.attempt.status)
    )
      throw new Error(
        "Résolvez le dépôt Chorus incertain avant de modifier cette facture.",
      );
    row.workOrderReferences = ids.map(
      (id) => available.find((w) => w.id === id).workOrderNumber,
    );
    return writeInvoice(
      companyId,
      row,
      old ? "draft_updated" : "draft_created",
    );
  })();
}
export function importLegacyInvoice(companyId, id) {
  return get().db.transaction(() => {
    const existing = get()
      .db.prepare(
        "SELECT * FROM company_billing_invoices WHERE company_id=? AND legacy_invoice_id=?",
      )
      .get(companyId, id);
    if (existing) return decode(existing);
    const legacy = owned("gmao_invoices", companyId, id),
      wo = owned("gmao_work_orders", companyId, legacy.work_order_id),
      site = owned("gmao_sites", companyId, wo.site_id);
    if (!site.client_id) throw new Error("Rattachez le dossier à un client.");
    const profile = all("company_billing_profiles", companyId).find(
      (p) => p.serviceContractId === site.service_contract_id,
    );
    const row = {
      id: randomUUID(),
      clientId: site.client_id,
      profileId: profile?.id || null,
      legacyInvoiceId: id,
      number: legacy.invoice_number,
      status: "draft",
      kind: "unit",
      currency: "EUR",
      workOrderIds: [wo.id],
      issuedAt: legacy.issued_at,
      dueAt: legacy.issued_at + 30 * 86400000,
      legacyNumber: legacy.invoice_number,
      emailStatus: legacy.status === "sent" ? "sent" : "not_sent",
      legacySentAt: legacy.sent_at,
      payments: [],
      lines: [
        {
          description: wo.title || "Prestation",
          quantity: 1,
          unitCents: legacy.subtotal_cents,
          vatRate: legacy.vat_rate,
          admittedCents: null,
        },
      ],
    };
    Object.assign(row, calculateInvoice(row));
    validatePartLines(companyId, row);
    return writeInvoice(companyId, row, "legacy_imported", {
      legacyInvoiceId: id,
      emailStatus: row.emailStatus,
    });
  })();
}
function checkRevision(row, input) {
  if (input.revision !== row.revision)
    throw new Error("Cette version a changé. Rechargez le dossier.");
  if (input.confirmed !== true) throw new Error("Confirmez cette opération.");
}
function receipt(input, companyId, row) {
  if (
    !input.reference?.trim() ||
    !input.recordedBy?.trim() ||
    !input.evidenceReference?.trim()
  )
    throw new Error(
      "Référence externe, justificatif et responsable de la vérification obligatoires.",
    );
  const evidence = (row.attachments || []).find(
    (a) => a.id === input.attachmentId,
  );
  if (!evidence || !blobs.exists(evidence.blobId, evidence.blobExt))
    throw new Error(
      "Joignez le justificatif au dossier avant de confirmer cette étape.",
    );
  return {
    attachmentId: evidence.id,
    blobId: evidence.blobId,
    blobExt: evidence.blobExt,
    reference: input.reference.trim(),
    recordedBy: input.recordedBy.trim(),
    evidenceReference: input.evidenceReference.trim(),
    recordedAt: Date.now(),
    source: "manual_portal_verification",
  };
}
export function transitionInvoice(companyId, id, input = {}) {
  return get().db.transaction(() => {
    const row = record("company_billing_invoices", companyId, id);
    checkRevision(row, input);
    const allowed = {
      draft: ["validated"],
      validated: ["draft", "submitted"],
      submitted: ["accepted", "rejected"],
      rejected: ["draft"],
      accepted: [],
      paid: [],
    };
    if (!allowed[row.status]?.includes(input.status))
      throw new Error("Transition de facture invalide.");
    let proof = {};
    if (input.status === "validated") {
      validatePartLines(companyId, row);
      const profile = row.profileId
        ? record("company_billing_profiles", companyId, row.profileId)
        : null;
      const issues = invoiceIssues(row, profile, orders(companyId));
      if (issues.length) throw new Error(issues.join("\n"));
      if (!input.recordedBy?.trim())
        throw new Error("Identifiez le responsable de validation.");
      for (const other of all("company_billing_invoices", companyId).filter(
        (i) => i.id !== id && !["draft", "rejected"].includes(i.status),
      )) {
        if (
          row.kind === "forfait" &&
          other.profileId === row.profileId &&
          other.kind === "forfait" &&
          other.periodStart <= row.periodEnd &&
          other.periodEnd >= row.periodStart
        )
          throw new Error("Cette période forfaitaire est déjà facturée.");
        if (row.workOrderIds.some((x) => other.workOrderIds?.includes(x)) && !(row.lines.every(l=>l.procurementId&&l.partKey) && other.lines.every(l=>l.procurementId&&l.partKey)))
          throw new Error(
            "Une intervention figure déjà dans une facture validée.",
          );
      }
      if (!row.number) {
        const year = new Date(row.issuedAt).getUTCFullYear();
        get()
          .db.prepare(
            "INSERT INTO company_billing_sequences(company_id,year,last_number) VALUES(?,?,1) ON CONFLICT(company_id,year) DO UPDATE SET last_number=last_number+1",
          )
          .run(companyId, year);
        const n = get()
          .db.prepare(
            "SELECT last_number FROM company_billing_sequences WHERE company_id=? AND year=?",
          )
          .get(companyId, year).last_number;
        row.number = `BZF-${year}-${String(n).padStart(5, "0")}`;
      }
      row.profileSnapshot = profile || row.parties;
      row.document = null;
      proof = { recordedBy: input.recordedBy, validatedAt: Date.now() };
    } else if (input.status === "draft") {
      if (row.status === "rejected" && !input.reason?.trim())
        throw new Error("Expliquez la correction demandée.");
      if (
        row.chorus?.attempt &&
        ["pending", "unknown"].includes(row.chorus.attempt.status)
      )
        throw new Error(
          "Résolvez le dépôt Chorus incertain avant de modifier cette facture.",
        );
      if (row.chorus?.invoiceId)
        throw new Error("La facture est déjà déposée dans Chorus.");
      if (
        row.document &&
        !row.attachments?.some((a) => a.blobId === row.document.blobId)
      )
        row.attachments = [
          ...(row.attachments || []),
          {
            ...row.document,
            id: randomUUID(),
            kind: "previous_invoice_pdf",
            addedAt: Date.now(),
          },
        ];
      row.chorus = null;
      row.document = null;
      proof = { reason: input.reason || "Validation retirée" };
    } else {
      if (input.status === "submitted" && !row.document)
        throw new Error("Générez le PDF de la version validée avant le dépôt.");
      proof = receipt(input, companyId, row);
      if (input.status === "rejected" && !input.reason?.trim())
        throw new Error("Renseignez le motif de rejet.");
      proof.reason = input.reason || null;
      row[`${input.status}Receipt`] = proof;
    }
    row.status = input.status;
    return writeInvoice(companyId, row, input.status, proof);
  })();
}
export function recordPayment(companyId, id, input = {}) {
  return get().db.transaction(() => {
    const row = record("company_billing_invoices", companyId, id);
    checkRevision(row, input);
    if (row.status !== "accepted")
      throw new Error("Enregistrez d’abord l’acceptation de la facture.");
    const evidence = receipt(input, companyId, row),
      amountCents = cents(input.amountCents);
    if (!amountCents && row.amountDueCents !== 0)
      throw new Error("Montant de règlement obligatoire.");
    if ((row.payments || []).some((p) => p.reference === evidence.reference))
      throw new Error("Ce règlement est déjà enregistré.");
    const total =
      (row.payments || []).reduce((s, p) => s + p.amountCents, 0) + amountCents;
    if (total > row.amountDueCents)
      throw new Error("Le règlement dépasse le solde dû.");
    row.payments = [...(row.payments || []), { ...evidence, amountCents }];
    if (total === row.amountDueCents) row.status = "paid";
    return writeInvoice(companyId, row, "payment_recorded", {
      ...evidence,
      amountCents,
    });
  })();
}
export function documentHtml(companyId, id) {
  const row = record("company_billing_invoices", companyId, id);
  return billingDocumentHtml(
    row,
    row.profileSnapshot ||
      (row.profileId
        ? record("company_billing_profiles", companyId, row.profileId)
        : row.parties || {}),
  );
}
export function attachDocument(companyId, id, input = {}) {
  const row = record("company_billing_invoices", companyId, id);
  const version = createHash("sha256")
    .update(documentHtml(companyId, id))
    .digest("hex");
  if (input.version !== version)
    throw new Error("La facture a changé pendant la génération.");
  if (
    !/^[a-f0-9]{64}$/.test(input.blobId || "") ||
    input.blobExt !== "pdf" ||
    !blobs.exists(input.blobId, input.blobExt)
  )
    throw new Error("PDF local introuvable.");
  if (row.document?.version === version) return row;
  return writeInvoice(
    companyId,
    {
      ...row,
      document: {
        blobId: input.blobId,
        blobExt: "pdf",
        filename: input.filename,
        version,
      },
    },
    "document_generated",
    { version },
  );
}
function dossierFiles(row) {
  const seen = new Set(),
    files = [];
  let size = 0;
  for (const file of [row.document, ...(row.attachments || [])].filter(
    Boolean,
  )) {
    const key = `${file.blobId}.${file.blobExt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      !/^[a-f0-9]{64}$/.test(file.blobId || "") ||
      !blobs.exists(file.blobId, file.blobExt)
    )
      throw new Error("Un justificatif du dossier est introuvable.");
    const bytes = blobs.read(file.blobId, file.blobExt);
    size += bytes.length;
    if (size > 100 * 1024 * 1024)
      throw new Error(
        "Le dossier dépasse 100 Mo. Exportez ses pièces séparément.",
      );
    files.push({
      filename: file.filename,
      blobId: file.blobId,
      blobExt: file.blobExt,
      base64: bytes.toString("base64"),
    });
  }
  return files;
}
export function exportDossier(companyId, id) {
  const row = record("company_billing_invoices", companyId, id),
    profile =
      row.profileSnapshot ||
      (row.profileId
        ? record("company_billing_profiles", companyId, row.profileId)
        : row.parties || {});
  return {
    format: "bonzai-billing-dossier",
    version: 1,
    exportedAt: Date.now(),
    invoice: row,
    files: dossierFiles(row),
    profile,
    issues: invoiceIssues(row, profile, orders(companyId)),
    events: get()
      .db.prepare(
        "SELECT event_type,evidence,created_at FROM company_billing_events WHERE company_id=? AND invoice_id=? ORDER BY created_at",
      )
      .all(companyId, id),
    submission: {
      portal:
        profile?.channel === "chorus"
          ? "https://portail.chorus-pro.gouv.fr/"
          : null,
      mode: "manual",
      instruction:
        "Déposer dans le portail, puis conserver le reçu. Cet export ne réalise aucun dépôt.",
    },
  };
}
export function saveSubcontractorDossier(companyId, input = {}) {
  const old = input.id
    ? record("company_billing_subcontractors", companyId, input.id)
    : null;
  if (old && !["draft", "rejected", "conditional"].includes(old.status))
    throw new Error("Ce dossier est verrouillé.");
  if (old) checkRevision(old, { ...input, confirmed: true });
  owned(
    "gmao_subcontractors",
    companyId,
    input.subcontractorId || old?.subcontractorId,
  );
  if (input.profileId)
    owned("company_billing_profiles", companyId, input.profileId);
  const row = {
    ...old,
    ...input,
    id: old?.id || randomUUID(),
    status: "draft",
    history: old?.history || [],
    attachments: old?.attachments || [],
  };
  return writeDossier(companyId, row);
}
function writeDossier(companyId, row) {
  const now = Date.now();
  get()
    .db.prepare(
      `INSERT INTO company_billing_subcontractors(id,company_id,subcontractor_id,profile_id,status,data,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subcontractor_id=excluded.subcontractor_id,profile_id=excluded.profile_id,status=excluded.status,data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at`,
    )
    .run(
      row.id,
      companyId,
      row.subcontractorId,
      row.profileId || null,
      row.status,
      JSON.stringify(row),
      (row.revision || 0) + 1,
      row.createdAt || now,
      now,
    );
  audit.append(companyId, {
    kind: "action",
    role: "owner",
    action: "billing.subcontractor_saved",
    status: "recorded",
    recordId: row.id,
  });
  return record("company_billing_subcontractors", companyId, row.id);
}
export function transitionSubcontractorDossier(companyId, id, input = {}) {
  return get().db.transaction(() => {
    const row = record("company_billing_subcontractors", companyId, id);
    checkRevision(row, input);
    const transitions = {
      draft: ["ready"],
      ready: ["submitted", "draft"],
      submitted: ["signed", "rejected"],
      signed: ["accepted", "conditional", "rejected"],
      conditional: ["draft"],
      rejected: ["draft"],
      accepted: [],
    };
    if (!transitions[row.status]?.includes(input.status))
      throw new Error("Transition de sous-traitance invalide.");
    let proof = { recordedBy: input.recordedBy };
    if (input.status === "ready") {
      if (
        !/^\d{14}$/.test(row.registration || "") ||
        !row.operationReference?.trim() ||
        !row.signatory?.trim() ||
        !["DC4", "DA"].includes(row.declarationType) ||
        !row.annexReferences?.trim()
      )
        throw new Error(
          "Renseignez opération, SIRET, DC4/DA, signataire et annexes.",
        );
    } else if (input.status !== "draft") {
      proof = receipt(input, companyId, row);
      if (
        input.status === "signed" &&
        (!input.contractorSignature?.trim() ||
          !input.subcontractorSignature?.trim())
      )
        throw new Error(
          "Les deux signatures et leurs références sont obligatoires.",
        );
      if (
        ["rejected", "conditional"].includes(input.status) &&
        !input.reason?.trim()
      )
        throw new Error("Précisez les conditions ou le motif de refus.");
    }
    row.status = input.status;
    row.history = [
      ...(row.history || []),
      {
        status: input.status,
        ...proof,
        contractorSignature: input.contractorSignature,
        subcontractorSignature: input.subcontractorSignature,
        reason: input.reason,
        at: Date.now(),
      },
    ];
    return writeDossier(companyId, row);
  })();
}
export function exportSubcontractorDossier(companyId, id) {
  return {
    format: "bonzai-subclic-dossier",
    version: 1,
    dossier: record("company_billing_subcontractors", companyId, id),
    files: dossierFiles(
      record("company_billing_subcontractors", companyId, id),
    ),
    portal: "https://www.subclic.com/",
    mode: "manual",
    instruction:
      "Ce dossier prépare la saisie externe. Les signatures et décisions doivent être enregistrées avec leurs justificatifs.",
  };
}

/** Store bytes, not a user-supplied filename, as durable evidence. */
export function attachEvidence(companyId, kind, id, input = {}) {
  const table =
    kind === "invoice"
      ? "company_billing_invoices"
      : kind === "subcontractor"
        ? "company_billing_subcontractors"
        : null;
  if (!table) throw new Error("Type de dossier invalide.");
  const row = record(table, companyId, id);
  if (input.revision !== row.revision)
    throw new Error("Cette version a changé. Rechargez le dossier.");
  const ext = String(input.filename || "")
    .split(".")
    .pop()
    .toLowerCase();
  if (
    ![
      "pdf",
      "png",
      "jpg",
      "jpeg",
      "webp",
      "txt",
      "csv",
      "json",
      "xml",
    ].includes(ext)
  )
    throw new Error("Format de justificatif non pris en charge.");
  if (
    typeof input.base64 !== "string" ||
    input.base64.length > 28 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64)
  )
    throw new Error("Justificatif invalide ou supérieur à 20 Mo.");
  const bytes = Buffer.from(input.base64, "base64");
  if (!bytes.length || bytes.length > 20 * 1024 * 1024)
    throw new Error("Justificatif vide ou supérieur à 20 Mo.");
  if (ext === "pdf" && bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("Le fichier n’est pas un PDF valide.");
  const stored = blobs.write(bytes, ext, {
    source: "company_billing_evidence",
    sourceId: companyId,
  });
  const attachment = {
    id: randomUUID(),
    blobId: stored.id,
    blobExt: ext,
    filename: String(input.filename).split(/[\\/]/).pop().slice(0, 180),
    byteLength: bytes.length,
    addedAt: Date.now(),
  };
  row.attachments = [...(row.attachments || []), attachment];
  return kind === "invoice"
    ? writeInvoice(companyId, row, "evidence_attached", {
        attachmentId: attachment.id,
        filename: attachment.filename,
      })
    : writeDossier(companyId, row);
}

/** Main-process orchestration only. Never expose finishChorusAction as a renderer IPC. */
export function beginChorusAction(companyId, id, input = {}) {
  return get().db.transaction(() => {
    const row = record("company_billing_invoices", companyId, id);
    checkRevision(row, input);
    if (!["upload", "submit", "status"].includes(input.operation))
      throw new Error("Action Chorus invalide.");
    if (!input.recordedBy?.trim())
      throw new Error("Identifiez le responsable de validation.");
    const profile = row.profileSnapshot;
    if (profile?.channel !== "chorus")
      throw new Error("Profil Chorus validé requis.");
    if (
      row.chorus?.attempt &&
      ["pending", "unknown"].includes(row.chorus.attempt.status)
    )
      throw new Error(
        "Résultat Chorus incertain : vérifiez le portail et enregistrez son justificatif avant de recommencer.",
      );
    if (
      input.operation !== "status" &&
      (row.status !== "validated" || !row.document)
    )
      throw new Error("Facture validée et PDF conservé requis.");
    if (input.operation === "upload" && row.chorus?.pieceJointeId)
      throw new Error("Le PDF est déjà transmis à Chorus.");
    if (input.operation === "submit" && !row.chorus?.pieceJointeId)
      throw new Error("Transmettez le PDF avant de soumettre la facture.");
    if (input.operation === "status" && !row.chorus?.invoiceId)
      throw new Error("Identifiant Chorus manquant.");
    const attempt = {
      id: randomUUID(),
      operation: input.operation,
      status: "pending",
      recordedBy: input.recordedBy,
      startedAt: Date.now(),
      environment: profile.chorus?.environment || "sandbox",
      documentVersion: row.document?.version,
    };
    row.chorus = { ...row.chorus, attempt };
    return writeInvoice(companyId, row, "chorus_requested", {
      operation: input.operation,
      attemptId: attempt.id,
    });
  })();
}
export function finishChorusAction(
  companyId,
  id,
  attemptId,
  { result, error, outcome } = {},
) {
  return get().db.transaction(() => {
    const row = record("company_billing_invoices", companyId, id),
      attempt = row.chorus?.attempt;
    if (attempt?.id !== attemptId || attempt.status !== "pending")
      throw new Error("Tentative Chorus inactive.");
    const operation = attempt.operation;
    if (error) {
      attempt.status = ["rejected", "not_sent", "failed"].includes(outcome)
        ? "failed"
        : "unknown";
      attempt.error = String(error).slice(0, 500);
    } else {
      const valid =
        operation === "upload"
          ? Number.isSafeInteger(result?.pieceJointeId) &&
            result.pieceJointeId > 0
          : result?.codeRetour === 0;
      if (!valid) {
        attempt.status = "unknown";
        attempt.error = "Confirmation Chorus absente.";
      } else {
        const proofBlob = blobs.write(
          Buffer.from(JSON.stringify(result, null, 2)),
          "json",
          {
            mimeType: "application/json",
            source: "chorus_receipt",
            sourceId: companyId,
          },
        );
        const proof = {
          id: randomUUID(),
          blobId: proofBlob.id,
          blobExt: "json",
          filename: `chorus-${operation}-${attemptId}.json`,
          addedAt: Date.now(),
        };
        row.attachments = [...(row.attachments || []), proof];
        attempt.status = "confirmed";
        attempt.receiptAttachmentId = proof.id;
        if (operation === "upload") {
          row.chorus.pieceJointeId = result.pieceJointeId;
          row.chorus.externalStatus = "INTERPRETEE_OCR";
        }
        if (operation === "submit") {
          if (
            !Number.isSafeInteger(result.identifiantFactureCPP) ||
            result.identifiantFactureCPP <= 0 ||
            !result.statutFacture ||
            ["BROUILLON", "INTERPRETEE_OCR"].includes(result.statutFacture)
          ) {
            attempt.status = "unknown";
            attempt.error = "Dépôt final non confirmé.";
          } else {
            row.chorus.invoiceId = result.identifiantFactureCPP;
            row.chorus.externalStatus = result.statutFacture;
            row.status = "submitted";
            row.submittedReceipt = {
              reference: String(result.identifiantFactureCPP),
              recordedBy: attempt.recordedBy,
              recordedAt: Date.now(),
              source: "chorus_api",
              attachmentId: proof.id,
              blobId: proof.blobId,
              blobExt: "json",
              evidenceReference: proof.filename,
              environment: attempt.environment,
            };
          }
        }
        if (operation === "status")
          row.chorus.externalStatus =
            result.statutCourantCode || row.chorus.externalStatus;
      }
    }
    attempt.finishedAt = Date.now();
    return writeInvoice(companyId, row, `chorus_${attempt.status}`, {
      attemptId,
      operation,
      outcome: attempt.status,
    });
  })();
}
/** Resolve an interrupted POST only after a human checks the external portal. */
export function reconcileChorusAction(companyId, id, input = {}) {
  const row = record("company_billing_invoices", companyId, id);
  checkRevision(row, input);
  if (!["pending", "unknown"].includes(row.chorus?.attempt?.status))
    throw new Error("Aucun résultat Chorus incertain.");
  const proof = receipt(input, companyId, row);
  if (input.resolution === "not_submitted") {
    row.chorus.attempt.status = "verified_not_submitted";
  } else if (
    input.resolution === "submitted" &&
    Number.isSafeInteger(input.invoiceId) &&
    input.invoiceId > 0
  ) {
    row.status = "submitted";
    row.chorus.invoiceId = input.invoiceId;
    row.submittedReceipt = proof;
    row.chorus.attempt.status = "confirmed";
  } else throw new Error("Précisez le résultat vérifié dans Chorus.");
  return writeInvoice(companyId, row, "chorus_reconciled", proof);
}
