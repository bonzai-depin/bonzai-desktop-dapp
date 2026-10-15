import * as teamCommunication from './teamCommunication.js';
import { randomUUID, createHash } from "node:crypto";
import { get } from "../connection.js";
import { owned } from "./gmaoIntegrity.js";
import * as blobs from "../blobs.js";
import * as issues from "./issues.js";
import * as audit from "./audit.js";
import * as billing from "./companyBilling.js";
import { getDossier } from "./gmaoOperations.js";
import { documentHtml as workHtml } from "../../../services/company/gmaoDocuments.js";
export { partsForOrders, setPartDisposition } from "./partTraceability.js";
import { partsForOrders } from "./partTraceability.js";
const db = () => get().db;
const tables = {
  workOrder: "gmao_work_orders",
  customerInvoice: "company_billing_invoices",
  supplierInvoice: "purchasing_records",
  partsRequest: "gmao_procurements",
};
const parse = (r) => ({
  ...JSON.parse(r.data || "{}"),
  id: r.id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export function record(companyId, kind, id) {
  if (!tables[kind]) throw new Error("Unknown business record.");
  const raw = owned(tables[kind], companyId, id);
  if (kind === "supplierInvoice" && raw.kind !== "invoice")
    throw new Error("Supplier invoice not found.");
  const value = { ...JSON.parse(raw.data || "{}"), ...raw };
  if (kind === "supplierInvoice") Object.assign(value, JSON.parse(raw.data));
  const status = value.status;
  return {
    kind,
    id,
    title:
      value.number ||
      value.reference ||
      value.work_order_number ||
      value.description ||
      id,
    status,
    revision: value.revision || null,
    updatedAt: raw.updated_at,
    dueAt: value.dueAt || value.due_at || null,
    terminal: ["paid", "cancelled", "completed"].includes(status),
    raw: value,
    documentVersion: createHash("sha256")
      .update(
        JSON.stringify([
          kind,
          value.reference,
          value.totalCents,
          value.currency,
          (value.items || []).map((l) => [
            l.label,
            l.quantity,
            l.unitPriceCents,
          ]),
        ]),
      )
      .digest("hex"),
    version: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
  };
}
export function activities(companyId, kind, id, type) {
  record(companyId, kind, id);
  return db()
    .prepare(
      "SELECT * FROM gmao_record_activity WHERE company_id=? AND record_kind=? AND record_id=? ORDER BY created_at DESC,rowid DESC",
    )
    .all(companyId, kind, id)
    .filter((r) => !type || r.kind === type)
    .map((r) => ({ ...parse(r), kind: r.kind }));
}
export function put(companyId, kind, id, type, data, oldId) {
  record(companyId, kind, id);
  const old = oldId ? owned("gmao_record_activity", companyId, oldId) : null;
  if (
    old &&
    (old.record_kind !== kind || old.record_id !== id || old.kind !== type)
  )
    throw new Error("Record association changed.");
  const key = old?.id || randomUUID(),
    now = Date.now();
  db()
    .prepare(
      "INSERT INTO gmao_record_activity VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
    )
    .run(
      key,
      companyId,
      kind,
      id,
      type,
      JSON.stringify(data),
      old?.created_at || now,
      now,
    );
  audit.append(companyId, {
    kind: "action",
    role: "owner",
    action: `records.${type}`,
    status: data.status || "recorded",
    recordId: id,
  });
  return {
    ...data,
    id: key,
    kind: type,
    createdAt: old?.created_at || now,
    updatedAt: now,
  };
}
export function snapshot(companyId, { kind, id }) {
  const r = record(companyId, kind, id),
    all = activities(companyId, kind, id);
  let workIds =
    kind === "workOrder"
      ? [id]
      : kind === "customerInvoice"
        ? r.raw.workOrderIds || []
        : kind === "partsRequest"
          ? [r.raw.work_order_id]
          : [];
  let contact = {};
  if (kind === "customerInvoice")
    contact =
      db()
        .prepare(
          "SELECT email,phone FROM gmao_clients WHERE id=? AND company_id=?",
        )
        .get(r.raw.client_id, companyId) || {};
  if (kind === "workOrder")
    contact =
      db()
        .prepare(
          "SELECT c.email,c.phone FROM gmao_sites s JOIN gmao_clients c ON c.id=s.client_id AND c.company_id=s.company_id WHERE s.id=? AND s.company_id=?",
        )
        .get(r.raw.site_id, companyId) || {};
  if (kind === "supplierInvoice") {
    const supplier = db()
      .prepare(
        "SELECT data FROM purchasing_records WHERE id=? AND company_id=? AND kind='supplier'",
      )
      .get(r.raw.supplierId, companyId);
    const contacts = supplier ? JSON.parse(supplier.data).contacts || [] : [];
    contact = {
      email: contacts.find((c) => c.channel === "email")?.address,
      phone: contacts.find(
        (c) => c.channel === "sms" || c.channel === "whatsapp",
      )?.address,
    };
  }
  return {
    contact,
    record: {
      kind,
      id,
      title: r.title,
      status: r.status,
      terminal: r.terminal,
      version: r.version,
      dueAt: r.dueAt,
    },
    messages: all.filter((r) => r.kind === "message"),
    collection: all.find(r => r.kind === "collection") || null,
    reminder: all.find((r) => r.kind === "reminder") || null,
    attachments: all.filter((r) => r.kind === "attachment"),
    parts: partsForOrders(companyId, workIds).filter(
      (p) => kind !== "partsRequest" || p.procurementId === id,
    ),
  };
}
/** Customer responses do not change invoice accounting or prove payment. */
export function saveCollection(companyId, input) {
  return db().transaction(() => {
    const {kind, id, version, status, evidenceReference, note, promisedAt} = input;
    if (!["customerInvoice", "supplierInvoice"].includes(kind)) throw new Error("Choose an invoice.");
    const invoice = record(companyId, kind, id);
    if (invoice.version !== version) throw new Error("Invoice changed. Refresh before saving.");
    if (invoice.terminal) throw new Error("This invoice is already closed.");
    if (!["disputed", "promised", "resolved"].includes(status)) throw new Error("Unknown collection response.");
    if (!String(evidenceReference || "").trim() || !String(note || "").trim()) throw new Error("Describe the response and provide its evidence reference.");
    const date = Number(promisedAt);
    if (status === "promised" && (!Number.isFinite(date) || date <= Date.now())) throw new Error("Choose a future promised payment date.");
    const old = activities(companyId, kind, id, "collection")[0];
    if ((input.previousId || null) !== (old?.id || null)) throw new Error("Response changed. Refresh before saving.");
    const response = put(companyId, kind, id, "collection", {status, evidenceReference: String(evidenceReference).trim(), note: String(note).trim(), promisedAt: status === "promised" ? date : null});
    return response;
  })();
}
export function attachSource(
  companyId,
  { kind, id, filename, base64, version },
) {
  const r = record(companyId, kind, id);
  if (r.version !== version)
    throw new Error(
      "Le dossier a changé. Actualisez avant de joindre le fichier.",
    );
  const bytes = Buffer.from(String(base64 || ""), "base64");
  if (
    bytes.length > 20 * 1024 * 1024 ||
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    throw new Error("Joignez un PDF de moins de 20 Mo.");
  const b = blobs.write(bytes, "pdf", {
    mimeType: "application/pdf",
    source: "record",
    sourceId: companyId,
  });
  return put(companyId, kind, id, "attachment", {
    blobId: b.id,
    blobExt: "pdf",
    filename: String(filename || "document.pdf").replace(/[\\/\r\n]/g, "_"),
    version: r.version,
    documentVersion: r.documentVersion,
  });
}
export function sourceHtml(companyId, kind, id) {
  const r = record(companyId, kind, id);
  if (kind === "customerInvoice") return billing.documentHtml(companyId, id);
  if (kind === "workOrder")
    return workHtml({
      kind: "intervention",
      record: getDossier(companyId, id).workOrder,
      dossier: getDossier(companyId, id),
      issuer: db()
        .prepare("SELECT name FROM companies WHERE id=?")
        .get(companyId).name,
    });
  throw new Error("Joignez le PDF original de la facture fournisseur.");
}
export function saveReminder(companyId, input = {}) {
  const r = record(companyId, input.kind, input.id);
  const days = Number(input.days);
  if (!Number.isFinite(days) || days < 1 || days > 365)
    throw new Error("Choisissez un délai entre 1 et 365 jours.");
  const old = activities(companyId, input.kind, input.id, "reminder")[0];
  return put(
    companyId,
    input.kind,
    input.id,
    "reminder",
    {
      enabled: input.enabled === true && !r.terminal,
      days,
      observedStatus: r.status,
      nextAt: Date.now() + days * 86400000,
      issueId: old?.issueId || null,
      lastPreparedAt: old?.lastPreparedAt || null,
    },
    old?.id,
  );
}
export function runReminders(companyId, { now = Date.now() } = {}) {
  // A stale record creates one persistent review task, never an unapproved send.
  return db().transaction(() => {
    const company = db()
      .prepare("SELECT * FROM companies WHERE id=?")
      .get(companyId);
    if (!company) throw new Error("Team not found.");
    if (company.status !== "active") return [];
    const charter = JSON.parse(company.charter),
      prepared = [];
    for (const row of db()
      .prepare(
        "SELECT * FROM gmao_record_activity WHERE company_id=? AND kind='reminder'",
      )
      .all(companyId)) {
      const policy = JSON.parse(row.data);
      if (!policy.enabled) continue;
      const r = record(companyId, row.record_kind, row.record_id);
      if (r.terminal || r.status !== policy.observedStatus) {
        put(
          companyId,
          row.record_kind,
          row.record_id,
          "reminder",
          {
            ...policy,
            enabled: !r.terminal,
            observedStatus: r.status,
            nextAt: now + policy.days * 86400000,
          },
          row.id,
        );
        continue;
      }
      const response = activities(companyId, row.record_kind, row.record_id, "collection")[0];
      if (response?.status === "disputed" || (response?.status === "promised" && now < response.promisedAt)) continue;
      if (now < policy.nextAt) continue;
      const open = policy.issueId
        ? db()
            .prepare("SELECT status FROM issues WHERE id=? AND company_id=?")
            .get(policy.issueId, companyId)
        : null;
      if (open && !["done", "cancelled"].includes(open.status)) continue;
      const role =
        ["CFO", "OperationsManager", "CEO"].find((k) => charter.roles?.[k]) ||
        "CEO";
      const issue = issues.create(companyId, {
        title: `Relance · ${r.title}`,
        description: `État inchangé : ${r.status}. Ouvrez records.snapshot avec ${JSON.stringify({ kind: row.record_kind, id: row.record_id })}. Vérifiez le dossier et préparez une relance email ou SMS. Tout envoi exige une validation.`,
        assigneeRole: role,
        createdBy: "record-reminder",
        priority: "normal",
        labels: ["record-reminder", row.record_kind, row.record_id],
      });
      put(
        companyId,
        row.record_kind,
        row.record_id,
        "reminder",
        {
          ...policy,
          issueId: issue.id,
          lastPreparedAt: now,
          nextAt: now + policy.days * 86400000,
        },
        row.id,
      );
      prepared.push(issue);
    }
    return prepared;
  })();
}
export function recoverMessages() {
  for (const row of db()
    .prepare(
      "SELECT * FROM gmao_record_activity WHERE kind='message' AND json_extract(data,'$.status')='submitting'",
    )
    .all()) {
    const v = JSON.parse(row.data);
    v.status = "unknown";
    v.error = "Envoi interrompu : vérifiez le reçu avant de réessayer.";
    db()
      .prepare("UPDATE gmao_record_activity SET data=?,updated_at=? WHERE id=?")
      .run(JSON.stringify(v), Date.now(), row.id);
  }
}

export function messageTarget(companyId, id) {
  const row = owned("gmao_record_activity", companyId, id);
  if (row.kind !== "message") throw new Error("Message not found.");
  record(companyId, row.record_kind, row.record_id);
  return { kind: row.record_kind, id: row.record_id, messageId: row.id };
}

/** Share a reference, not a second operational ledger. Only the addressed team can resolve it. */
export function shareEvidence(companyId, input) { return db().transaction(()=>{
  const source=record(companyId,input.kind,input.id);
  if(input.confirmed!==true || source.version!==input.version)throw new Error('Review the current record before sharing.');
  const thread=teamCommunication.request(companyId,{targetTeamId:input.targetTeamId,targetRole:input.targetRole,subject:`Evidence / Justificatif: ${source.title}`.slice(0,200),body:`Shared operational evidence / Justificatif opérationnel partagé. Use records.readSharedEvidence with this conversation ID. The source record remains with its owning team. Do not create duplicate invoices or infer payment.`,requestKey:`evidence:${input.kind}:${input.id}:${source.version}:${input.targetTeamId}:${input.targetRole}`});
  db().prepare('UPDATE team_threads SET context=? WHERE id=?').run(JSON.stringify({evidence:{kind:input.kind,id:input.id,version:source.version}}),thread.id);
  return {conversationId:thread.id};
})(); }
export function listSharedEvidence(companyId) {
  return teamCommunication.list(companyId).filter(t=>!t.archived && t.context?.evidence).map(t=>({conversationId:t.id,title:t.subject,sourceTeam:t.source_team_name}));
}
export function readSharedEvidence(companyId,{conversationId}) {
  const thread=teamCommunication.read(companyId,conversationId), link=thread.context?.evidence;
  if(!link)throw new Error('No operational evidence was shared in this conversation.');
  const r=record(thread.source_company_id,link.kind,link.id);
  return {sourceTeam:thread.source_team_name,kind:link.kind,id:link.id,version:r.version,changedSinceShared:r.version!==link.version,record:r.raw,followup:snapshot(thread.source_company_id,link)};
}
