import { randomUUID } from "node:crypto";
import { get } from "../db/connection.js";
import * as records from "../db/repos/recordOperations.js";
import * as blobs from "../db/blobs.js";
import { owned } from "../db/repos/gmaoIntegrity.js";
const locks = new Set();
export function createRecordDelivery({ request, printPdf }) {
  function message(companyId, id) {
    const raw = owned("gmao_record_activity", companyId, id);
    if (raw.kind !== "message") throw new Error("Message not found.");
    return { raw, data: JSON.parse(raw.data) };
  }
  const save = (companyId, raw, data) =>
    records.put(
      companyId,
      raw.record_kind,
      raw.record_id,
      "message",
      data,
      raw.id,
    );
  function account(companyId, channel, id) {
    const kind = channel === "email" ? "sendgrid" : "twilio";
    const rows = get()
      .db.prepare(
        "SELECT * FROM connectors WHERE company_id=? AND kind=? AND status='active'",
      )
      .all(companyId, kind)
      .filter((r) => !id || r.id === id);
    if (rows.length !== 1)
      throw new Error(`Configurez un compte ${kind} actif dans Outils.`);
    return rows[0];
  }
  async function prepareMessage(companyId, input = {}) {
    const { kind, id, channel, recipient, sender } = input,
      r = records.record(companyId, kind, id);
    if (!["workOrder", "customerInvoice", "supplierInvoice"].includes(kind))
      throw new Error("Unsupported message record.");
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
        "Vérifiez les adresses email ou les numéros au format international.",
      );
    if (!input.body?.trim() || input.body.length > 30000)
      throw new Error("Renseignez le message (30 000 caractères maximum).");
    if (channel === "sms" && input.attachPdf)
      throw new Error(
        "Les PDF sont joints par email. Le SMS transmet le texte validé.",
      );
    let attachment = null;
    if (input.attachPdf) {
      if (kind === "supplierInvoice") {
        attachment = records
          .activities(companyId, kind, id, "attachment")
          .find((a) => a.documentVersion === r.documentVersion);
        if (!attachment)
          throw new Error("Joignez le PDF original de la facture fournisseur.");
      } else {
        const html = records.sourceHtml(companyId, kind, id),
          bytes = await printPdf(html);
        if (records.record(companyId, kind, id).version !== r.version)
          throw new Error("Le dossier a changé pendant la préparation.");
        const b = blobs.write(bytes, "pdf", {
          mimeType: "application/pdf",
          source: "record-message",
          sourceId: companyId,
        });
        attachment = {
          blobId: b.id,
          blobExt: "pdf",
          filename: `${String(r.title).replace(/[^\p{L}\p{N}_.-]/gu, "_")}.pdf`,
        };
      }
    }
    return records.put(companyId, kind, id, "message", {
      status: "draft",
      channel,
      recipient,
      sender,
      subject: String(input.subject || r.title).slice(0, 200),
      body: input.body.trim(),
      attachment,
      recordVersion: r.version,
      requestKey: randomUUID(),
      revision: 1,
    });
  }
  async function sendMessage(companyId, id, input = {}) {
    const { raw, data: m } = message(companyId, id);
    if (["submitted", "delivered"].includes(m.status)) return { ...m, id };
    if (locks.has(id) || !["draft", "failed"].includes(m.status))
      throw new Error(
        "Vérifiez le résultat incertain avant tout nouvel envoi.",
      );
    if (input.confirmed !== true || input.revision !== m.revision)
      throw new Error(
        "Validez le destinataire, le message et la pièce jointe.",
      );
    const company = JSON.parse(
      get()
        .db.prepare("SELECT charter FROM companies WHERE id=?")
        .get(companyId).charter,
    );
    if (company.demoMode)
      throw new Error("Les envois externes sont désactivés en démonstration.");
    if (
      records.record(companyId, raw.record_kind, raw.record_id).version !==
      m.recordVersion
    )
      throw new Error("Le dossier a changé. Préparez un nouveau message.");
    const conn = account(companyId, m.channel),
      base = {
        companyId,
        connectorId: conn.id,
        connectorKind: conn.kind,
        accountIdentifier: conn.account_identifier,
      };
    let spec;
    if (m.channel === "email") {
      const body = {
        personalizations: [{ to: [{ email: m.recipient }] }],
        from: { email: m.sender },
        subject: m.subject,
        content: [{ type: "text/plain", value: m.body }],
      };
      if (m.attachment) {
        const bytes = blobs.read(m.attachment.blobId, m.attachment.blobExt);
        if (bytes.length > 20 * 1024 * 1024)
          throw new Error("La pièce jointe dépasse 20 Mo.");
        body.attachments = [
          {
            content: bytes.toString("base64"),
            type: "application/pdf",
            filename: m.attachment.filename,
            disposition: "attachment",
          },
        ];
      }
      spec = {
        url: "https://api.sendgrid.com/v3/mail/send",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      };
    } else {
      if (!/^AC[a-f0-9]{32}$/i.test(conn.account_identifier || ""))
        throw new Error("Compte Twilio invalide.");
      spec = {
        url: `https://api.twilio.com/2010-04-01/Accounts/${conn.account_identifier}/Messages.json`,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          To: m.recipient,
          From: m.sender,
          Body: m.body,
        }).toString(),
      };
    }
    locks.add(id);
    let result;
    try {
      save(companyId, raw, {
        ...m,
        status: "submitting",
        connectorId: conn.id,
        approvedAt: Date.now(),
        error: null,
      });
      try {
        result = await request({
          ...base,
          ...spec,
          idempotencyKey: m.requestKey,
        });
        if (!(result.status >= 200 && result.status < 300))
          throw Object.assign(new Error("Provider refused"), {
            status: result.status,
          });
        if (
          m.channel === "sms" &&
          !/^SM[a-f0-9]{32}$/i.test(result.data?.sid || "")
        )
          throw new Error("Missing SMS receipt");
      } catch (e) {
        const status =
          e.status >= 400 && e.status < 500 && e.status !== 408
            ? "failed"
            : "unknown";
        save(companyId, raw, {
          ...m,
          status,
          connectorId: conn.id,
          error:
            status === "failed"
              ? "Envoi refusé par le fournisseur."
              : "Résultat incertain : vérifiez le fournisseur avant de réessayer.",
        });
        throw new Error(
          status === "failed"
            ? "Envoi refusé par le fournisseur."
            : "Résultat incertain : vérifiez le fournisseur avant de réessayer.",
        );
      }
      return save(companyId, raw, {
        ...m,
        status: "submitted",
        connectorId: conn.id,
        submittedAt: Date.now(),
        providerId:
          (m.channel === "email"
            ? result.headers?.["x-message-id"]
            : result.data?.sid) || null,
        receipt: { httpStatus: result.status, provider: conn.kind },
        error: null,
      });
    } finally {
      locks.delete(id);
    }
  }
  async function checkDelivery(companyId, id) {
    const { raw, data: m } = message(companyId, id);
    if (!["submitted", "delivered"].includes(m.status) || !m.providerId)
      throw new Error("Aucun reçu consultable.");
    const conn = account(companyId, m.channel, m.connectorId);
    let status;
    if (m.channel === "sms") {
      if (
        !/^AC[a-f0-9]{32}$/i.test(conn.account_identifier) ||
        !/^SM[a-f0-9]{32}$/i.test(m.providerId)
      )
        throw new Error("Identifiant fournisseur invalide.");
      const r = await request({
        companyId,
        connectorId: conn.id,
        method: "GET",
        url: `https://api.twilio.com/2010-04-01/Accounts/${conn.account_identifier}/Messages/${m.providerId}.json`,
      });
      if (r.status !== 200 || r.data?.to !== m.recipient)
        throw new Error("Reçu non confirmé.");
      status = r.data.status;
    } else {
      const query = `msg_id LIKE "${String(m.providerId).replace(/[^a-zA-Z0-9_.-]/g, "")}%"`;
      const r = await request({
        companyId,
        connectorId: conn.id,
        method: "GET",
        url: `https://api.sendgrid.com/v3/messages?limit=10&query=${encodeURIComponent(query)}`,
      });
      const matches = (r.data?.messages || []).filter(
        (x) =>
          x.to_email === m.recipient &&
          String(x.msg_id).startsWith(m.providerId),
      );
      if (r.status !== 200 || matches.length !== 1)
        throw new Error(
          "Livraison non confirmée. Vérifiez le journal fournisseur.",
        );
      status = matches[0].status;
    }
    // A failed delivery after provider acceptance is not permission to resend automatically.
    return save(companyId, raw, {
      ...m,
      status: ["delivered", "read"].includes(status)
        ? "delivered"
        : [
              "failed",
              "undelivered",
              "bounced",
              "dropped",
              "not_delivered",
            ].includes(status)
          ? "delivery_failed"
          : "submitted",
      providerStatus: status,
      checkedAt: Date.now(),
    });
  }
  function reconcileMessage(companyId, id, input = {}) {
    const { raw, data: m } = message(companyId, id);
    if (
      locks.has(id) ||
      m.status !== "unknown" ||
      input.confirmed !== true ||
      !input.evidence?.trim() ||
      !["submitted", "not_sent"].includes(input.outcome)
    )
      throw new Error(
        "Vérifiez le reçu fournisseur et renseignez sa référence.",
      );
    return save(companyId, raw, {
      ...m,
      status: input.outcome === "not_sent" ? "failed" : "submitted",
      providerId: input.providerId || null,
      reconciliation: { evidence: input.evidence, at: Date.now() },
      error: null,
    });
  }
  return { prepareMessage, sendMessage, checkDelivery, reconcileMessage };
}
