import { get } from "../db/connection.js";
import { owned } from "../db/repos/gmaoIntegrity.js";
import { camel, getDossier } from "../db/repos/gmaoOperations.js";
import * as gmao from "../db/repos/gmao.js";
import * as blobs from "../db/blobs.js";
import { documentHtml } from "../../services/company/gmaoDocuments.js";
import crypto from "node:crypto";
const inFlight = new Set();
const messageLocks = new Set();
const publicError = (err) =>
  err?.status
    ? `Le fournisseur a refusé la demande (HTTP ${err.status}). Vérifiez sa configuration.`
    : "La connexion a été interrompue. Vérifiez le fournisseur avant de réessayer.";
function connector(companyId, kind) {
  const rows = get()
    .db.prepare(
      "SELECT * FROM connectors WHERE company_id=? AND kind=? AND status='active'",
    )
    .all(companyId, kind);
  if (rows.length !== 1)
    throw new Error(
      `Configurez un seul compte ${kind} actif pour les envois maintenance.`,
    );
  return rows[0];
}
export function createDeliveryService({ request, printPdf }) {
  async function generateDocument(companyId, input = {}) {
    const dossier = getDossier(companyId, input.workOrderId);
    const kind = input.kind || "intervention";
    const record =
      kind === "quote"
        ? camel(owned("gmao_quotes", companyId, input.recordId))
        : kind === "invoice"
          ? camel(owned("gmao_invoices", companyId, input.recordId))
          : dossier.workOrder;
    if (kind !== "intervention" && record.workOrderId !== dossier.workOrder.id)
      throw new Error("Ce document appartient à une autre intervention.");
    const issuer = get()
      .db.prepare("SELECT name FROM companies WHERE id=?")
      .get(companyId)?.name;
    const html = documentHtml({ kind, record, dossier, issuer });
    const version = crypto.createHash("sha256").update(html).digest("hex");
    const existing = get()
      .db.prepare(
        "SELECT * FROM gmao_documents WHERE company_id=? AND work_order_id=? AND json_extract(metadata,'$.version')=?",
      )
      .get(companyId, dossier.workOrder.id, version);
    if (existing) return camel(existing);
    const bytes = await printPdf(html);
    const concurrent = get()
      .db.prepare(
        "SELECT * FROM gmao_documents WHERE company_id=? AND work_order_id=? AND json_extract(metadata,'$.version')=?",
      )
      .get(companyId, dossier.workOrder.id, version);
    if (concurrent) return camel(concurrent);
    const blob = blobs.write(bytes, "pdf", {
      mimeType: "application/pdf",
      source: "gmao",
      sourceId: companyId,
    });
    const filename = `${record.quoteNumber || record.invoiceNumber || record.workOrderNumber}-${version.slice(0, 8)}.pdf`;
    return gmao.addDocument(companyId, {
      workOrderId: dossier.workOrder.id,
      siteId: dossier.site.id,
      category: kind,
      filename,
      mimeType: "application/pdf",
      blobId: blob.id,
      blobExt: "pdf",
      metadata: { version, kind, recordId: record.id },
    });
  }
  async function sendOutbox(companyId, id, approval = {}) {
    const db = get().db,
      row = owned("gmao_outbox", companyId, id);
    if (["submitted", "delivered"].includes(row.status)) return camel(row);
    if (inFlight.has(id) || row.status === "submitting")
      throw new Error("Envoi déjà en cours.");
    if (!["draft", "failed"].includes(row.status))
      throw new Error(
        "Vérifiez le résultat incertain avant tout nouvel envoi.",
      );
    if (approval.confirmed !== true || approval.revision !== row.revision)
      throw new Error(
        "Validez cette version exacte, son destinataire et sa pièce jointe.",
      );
    const conn = connector(
      companyId,
      row.channel === "email" ? "sendgrid" : "twilio",
    );
    const base = {
      companyId,
      connectorId: conn.id,
      connectorKind: conn.kind,
      accountIdentifier: conn.account_identifier,
    };
    let spec;
    if (row.channel === "email") {
      const payload = {
        personalizations: [{ to: [{ email: row.recipient }] }],
        from: { email: row.sender },
        subject: row.subject,
        content: [{ type: "text/plain", value: row.message }],
        custom_args: { bonzai_outbox_id: row.id },
      };
      if (row.document_id) {
        const doc = owned("gmao_documents", companyId, row.document_id);
        if (
          doc.work_order_id !== row.work_order_id ||
          !doc.blob_id ||
          !doc.blob_ext
        )
          throw new Error("Pièce jointe indisponible.");
        if (
          !/^[a-f0-9]{64}$/.test(doc.blob_id) ||
          !/^[a-z0-9]+$/i.test(doc.blob_ext)
        )
          throw new Error("Référence de fichier invalide.");
        const meta = JSON.parse(doc.metadata || "{}");
        if (["quote", "invoice"].includes(meta.kind)) {
          const current = camel(
            owned(
              meta.kind === "quote" ? "gmao_quotes" : "gmao_invoices",
              companyId,
              meta.recordId,
            ),
          );
          if (current.workOrderId !== row.work_order_id)
            throw new Error("Le document ne correspond plus au dossier.");
          const issuer = db
            .prepare("SELECT name FROM companies WHERE id=?")
            .get(companyId)?.name;
          const version = crypto
            .createHash("sha256")
            .update(
              documentHtml({
                kind: meta.kind,
                record: current,
                dossier: getDossier(companyId, row.work_order_id),
                issuer,
              }),
            )
            .digest("hex");
          if (version !== meta.version)
            throw new Error(
              "Les données ont changé. Générez et relisez le PDF actualisé avant l’envoi.",
            );
        }
        const bytes = blobs.read(doc.blob_id, doc.blob_ext);
        if (bytes.length > 20 * 1024 * 1024)
          throw new Error("La pièce jointe dépasse 20 Mo.");
        payload.attachments = [
          {
            content: bytes.toString("base64"),
            filename: doc.filename,
            type: doc.mime_type || "application/octet-stream",
            disposition: "attachment",
          },
        ];
      }
      spec = {
        url: "https://api.sendgrid.com/v3/mail/send",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      };
    } else {
      if (!/^AC[a-f0-9]{32}$/i.test(conn.account_identifier || ""))
        throw new Error("Compte Twilio invalide.");
      spec = {
        url: `https://api.twilio.com/2010-04-01/Accounts/${conn.account_identifier}/Messages.json`,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          To: row.recipient,
          From: row.sender,
          Body: row.message,
        }).toString(),
      };
    }
    // A provider without idempotency must never receive an automatic retry.
    inFlight.add(id);
    try {
      const changed = db
        .prepare(
          "UPDATE gmao_outbox SET status='submitting',approved_revision=?,approved_at=?,attempt_started_at=?,error=NULL,updated_at=? WHERE id=? AND revision=? AND status IN ('draft','failed')",
        )
        .run(
          row.revision,
          Date.now(),
          Date.now(),
          Date.now(),
          id,
          row.revision,
        ).changes;
      if (!changed) throw new Error("Le brouillon a changé. Relisez-le.");
      db.prepare("UPDATE gmao_outbox SET receipt=? WHERE id=?").run(
        JSON.stringify({ connectorId: conn.id, provider: conn.kind }),
        id,
      );
      let result;
      try {
        result = await request({
          ...base,
          ...spec,
          idempotencyKey: row.request_key,
        });
        if (result.status < 200 || result.status >= 300) {
          const error = new Error("Provider refused");
          error.status = result.status;
          throw error;
        }
      } catch (err) {
        const rejected =
          err.status >= 400 && err.status < 500 && err.status !== 408;
        db.prepare(
          "UPDATE gmao_outbox SET status=?,error=?,updated_at=? WHERE id=?",
        ).run(
          rejected ? "failed" : "unknown",
          publicError(err),
          Date.now(),
          id,
        );
        throw new Error(publicError(err));
      }
      const providerId =
        row.channel === "email"
          ? result.headers?.["x-message-id"]
          : result.data?.sid;
      const providerStatus = result.data?.status || "accepted";
      db.transaction(() => {
        db.prepare(
          "UPDATE gmao_outbox SET status='submitted',provider_id=?,provider_status=?,receipt=?,submitted_at=?,updated_at=? WHERE id=?",
        ).run(
          providerId || null,
          providerStatus,
          JSON.stringify({
            connectorId: conn.id,
            provider: conn.kind,
            httpStatus: result.status,
            id: providerId || null,
          }),
          Date.now(),
          Date.now(),
          id,
        );
        if (row.document_id) {
          const doc = owned("gmao_documents", companyId, row.document_id),
            meta = JSON.parse(doc.metadata || "{}");
          if (meta.kind === "quote") {
            db.prepare(
              "UPDATE gmao_quotes SET status='sent',sent_at=?,updated_at=? WHERE id=? AND company_id=? AND status='draft'",
            ).run(Date.now(), Date.now(), meta.recordId, companyId);
            const latest = db
              .prepare(
                "SELECT id FROM gmao_quotes WHERE company_id=? AND work_order_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
              )
              .get(companyId, row.work_order_id);
            if (latest?.id === meta.recordId)
              db.prepare(
                "UPDATE gmao_work_orders SET quote_status='sent',updated_at=? WHERE id=? AND quote_status='draft'",
              ).run(Date.now(), row.work_order_id);
          }
          if (meta.kind === "invoice") {
            db.prepare(
              "UPDATE gmao_invoices SET status='sent',sent_at=?,updated_at=? WHERE id=? AND company_id=? AND status='draft'",
            ).run(Date.now(), Date.now(), meta.recordId, companyId);
            db.prepare(
              "UPDATE gmao_work_orders SET billing_status='invoice_sent' WHERE id=?",
            ).run(row.work_order_id);
          }
        }
        gmao.addEvent(companyId, row.work_order_id, {
          eventType: "message_submitted",
          note: `${row.channel === "email" ? "Email" : "SMS"} accepté pour envoi à ${row.recipient}`,
          evidence: {
            outboxId: id,
            providerId: providerId || null,
            documentId: row.document_id,
          },
        });
      })();
      return camel(owned("gmao_outbox", companyId, id));
    } catch (error) {
      db.prepare(
        "UPDATE gmao_outbox SET status='unknown',error='Résultat à vérifier auprès du fournisseur avant tout nouvel envoi.',updated_at=? WHERE id=? AND status='submitting'",
      ).run(Date.now(), id);
      throw error;
    } finally {
      inFlight.delete(id);
    }
  }
  async function checkDelivery(companyId, id) {
    const row = owned("gmao_outbox", companyId, id);
    if (!["submitted", "delivered"].includes(row.status) || !row.provider_id)
      throw new Error("Aucun reçu fournisseur consultable.");
    if (messageLocks.has(id)) throw new Error("Vérification en cours.");
    const saved = JSON.parse(row.receipt || "{}");
    const conn = saved.connectorId
      ? owned("connectors", companyId, saved.connectorId)
      : connector(companyId, row.channel === "sms" ? "twilio" : "sendgrid");
    if (conn.status !== "active")
      throw new Error("Reconnectez le compte utilisé pour cet envoi.");
    messageLocks.add(id);
    try {
      let status;
      if (row.channel === "sms") {
        if (
          !/^AC[a-f0-9]{32}$/i.test(conn.account_identifier || "") ||
          !/^SM[a-f0-9]{32}$/i.test(row.provider_id)
        )
          throw new Error("Identifiant Twilio invalide.");
        const response = await request({
          companyId,
          connectorId: conn.id,
          url: `https://api.twilio.com/2010-04-01/Accounts/${conn.account_identifier}/Messages/${row.provider_id}.json`,
          method: "GET",
        });
        if (response.data?.to !== row.recipient)
          throw new Error("Le reçu ne correspond pas au destinataire.");
        status = response.data.status;
      } else {
        const query = `msg_id LIKE "${String(row.provider_id).replace(/[^a-zA-Z0-9_.-]/g, "")}%"`;
        const response = await request({
          companyId,
          connectorId: conn.id,
          url: `https://api.sendgrid.com/v3/messages?limit=10&query=${encodeURIComponent(query)}`,
          method: "GET",
        });
        const matches = (response.data?.messages || []).filter(
          (m) =>
            m.to_email === row.recipient &&
            String(m.msg_id).startsWith(row.provider_id),
        );
        if (matches.length !== 1)
          throw new Error(
            "Livraison non confirmée. Vérifiez le journal SendGrid ; l’accès Email Activity peut être requis.",
          );
        status = matches[0].status;
      }
      const next = ["delivered", "read"].includes(status)
        ? "delivered"
        : [
              "failed",
              "undelivered",
              "not_delivered",
              "bounced",
              "dropped",
            ].includes(status)
          ? "failed"
          : "submitted";
      get()
        .db.prepare(
          "UPDATE gmao_outbox SET status=?,provider_status=?,delivered_at=?,updated_at=? WHERE id=?",
        )
        .run(
          next,
          status,
          next === "delivered" ? Date.now() : null,
          Date.now(),
          id,
        );
      return camel(owned("gmao_outbox", companyId, id));
    } finally {
      messageLocks.delete(id);
    }
  }
  return { generateDocument, sendOutbox, checkDelivery };
}
