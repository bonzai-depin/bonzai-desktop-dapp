import { get } from "../connection.js";
import * as grants from "./companyGrants.js";
import * as billing from "./companyBilling.js";
import * as purchasing from "./purchasing.js";
import * as blobs from "../blobs.js";
import fs from "node:fs";

const decode = (r) => ({
  ...JSON.parse(r.data || "{}"),
  id: r.id,
  updatedAt: r.updated_at,
});
export function overview(companyId) {
  grants.assertCompany(companyId);
  const db = get().db;
  const count = (table, where = "", ...args) =>
    db
      .prepare(`SELECT count(*) AS n FROM ${table} WHERE company_id=? ${where}`)
      .get(companyId, ...args).n;
  return {
    clients: count("gmao_clients"),
    sites: count("gmao_sites"),
    workOrders: count("gmao_work_orders"),
    equipment: count("gmao_assets"),
    invoices: count("company_billing_invoices"),
    grantApplications: count("company_grants_records", "AND kind='dossier'"),
    grantDocuments: count(
      "company_grants_records",
      "AND kind='document' AND json_extract(data,'$.draft') IS NOT 1",
    ),
    purchases: count("purchasing_records", "AND kind='request'"),
    sales: count("company_sales_records"),
    imports: count("company_intake_sources"),
    intakeReviews: count("company_intake_sources", "AND status='review'"),
    tasks: count("issues"),
    completed: count("issues", "AND status='done'"),
  };
}
// Projection only: the original invoice, receipt and attachment remain authoritative.
export function deliverables(companyId, input = {}) {
  grants.assertCompany(companyId);
  const db = get().db,
    rows = [];
  for (const r of db
    .prepare(
      "SELECT id,data,updated_at FROM company_grants_records WHERE company_id=? AND kind='document' ORDER BY updated_at DESC",
    )
    .all(companyId)) {
    const d = decode(r);
    rows.push({
      id: "grant:" + r.id,
      recordId: d.dossierId,
      kind: "grant",
      title: d.label || "Document",
      ext: d.ext,
      status: d.draft ? "Draft" : "Document",
      updatedAt: r.updated_at,
    });
  }
  for (const r of db
    .prepare(
      "SELECT * FROM company_billing_invoices WHERE company_id=? ORDER BY updated_at DESC",
    )
    .all(companyId)) {
    const d = decode(r);
    rows.push({
      id: "invoice:" + r.id,
      recordId: r.id,
      kind: "invoice",
      title: r.number || d.title || "Invoice",
      ext: "html",
      status: r.status,
      updatedAt: r.updated_at,
    });
    for (const a of d.attachments || [])
      rows.push({
        id: "invoice:" + r.id + ":" + a.id,
        recordId: r.id,
        kind: "invoice",
        title: a.filename,
        ext: a.blobExt,
        status: "Evidence",
        updatedAt: a.addedAt,
      });
  }
  for (const r of db
    .prepare(
      "SELECT * FROM purchasing_records WHERE company_id=? AND kind IN ('order','evidence','invoice') ORDER BY updated_at DESC",
    )
    .all(companyId)) {
    const d = decode(r);
    if (r.kind === "invoice" && !d.document) continue;
    rows.push({
      id: "purchase:" + r.id,
      recordId: r.kind === "evidence" ? d.recordId : r.id,
      recordKind: r.kind === "evidence" ? d.recordKind : r.kind,
      kind: "purchase",
      title:
        d.title ||
        d.label ||
        d.filename ||
        d.number ||
        d.reference ||
        "Purchase document",
      ext: r.kind === "order" ? "html" : d.blobExt || d.document?.blobExt,
      status: d.status || "Evidence",
      updatedAt: r.updated_at,
    });
  }
  for (const r of db
    .prepare(
      "SELECT * FROM gmao_documents WHERE company_id=? AND blob_id IS NOT NULL ORDER BY updated_at DESC",
    )
    .all(companyId))
    rows.push({
      id: "maintenance:" + r.id,
      recordId: r.work_order_id,
      kind: "maintenance",
      title: r.original_name || r.filename,
      ext: r.blob_ext,
      status: r.status,
      updatedAt: r.updated_at,
    });
  const query = String(input.query || "").toLocaleLowerCase();
  const filtered = rows
    .filter(
      (r) =>
        (!input.kind || r.kind === input.kind) &&
        (!query ||
          String(r.title || "")
            .toLocaleLowerCase()
            .includes(query)),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const offset = Math.max(0, Number(input.offset) || 0),
    limit = Math.min(100, Math.max(1, Number(input.limit) || 40));
  return {
    total: filtered.length,
    rows: filtered.slice(offset, offset + limit),
  };
}
export async function readDeliverable(companyId, input = {}) {
  grants.assertCompany(companyId);
  const [kind, id, attachmentId] = String(input.id || "").split(":");
  const db = get().db;
  let doc;
  if (kind === "grant") {
    const d = grants.recordById(companyId, "document", id);
    doc = { blobId: d.blob_id, blobExt: d.ext };
  } else if (kind === "invoice") {
    const row = db
      .prepare(
        "SELECT * FROM company_billing_invoices WHERE company_id=? AND id=?",
      )
      .get(companyId, id);
    if (!row) throw new Error("Document not found in this team.");
    if (!attachmentId) return { html: billing.documentHtml(companyId, id) };
    doc = decode(row).attachments?.find((a) => a.id === attachmentId);
  } else if (kind === "maintenance") {
    const row = db
      .prepare("SELECT * FROM gmao_documents WHERE company_id=? AND id=?")
      .get(companyId, id);
    if (row) doc = { blobId: row.blob_id, blobExt: row.blob_ext };
  } else if (kind === "purchase") {
    const row = db
      .prepare("SELECT * FROM purchasing_records WHERE company_id=? AND id=?")
      .get(companyId, id);
    if (!row) throw new Error("Document not found in this team.");
    if (row.kind === "order")
      return { html: purchasing.documentHtml(companyId, id) };
    const d = decode(row);
    doc = row.kind === "evidence" ? d : d.document;
  }
  if (
    !doc ||
    !/^[a-f0-9]{64}$/.test(doc.blobId) ||
    !/^[a-z0-9]{1,10}$/.test(doc.blobExt)
  )
    throw new Error("Document not found in this team.");
  const file = blobs.blobPath(doc.blobId, doc.blobExt);
  if ((await fs.promises.stat(file)).size > 30 * 1024 * 1024)
    throw new Error("Document exceeds preview size. Open its original record.");
  return {
    base64: (await fs.promises.readFile(file)).toString("base64"),
    ext: doc.blobExt,
  };
}
