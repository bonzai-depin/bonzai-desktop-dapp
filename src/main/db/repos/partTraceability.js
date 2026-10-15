import { createHash, randomUUID } from "node:crypto";
import { get } from "../connection.js";
import { owned } from "./gmaoIntegrity.js";
import * as audit from "./audit.js";
const db = () => get().db;
const decode = (r) => ({
  ...JSON.parse(r.data || "{}"),
  id: r.id,
  status: r.status || JSON.parse(r.data || "{}").status,
  companyId: r.company_id,
});
const purchases = (companyId, kind) =>
  db()
    .prepare("SELECT * FROM purchasing_records WHERE company_id=? AND kind=?")
    .all(companyId, kind)
    .map(decode);
export const partKey = (item, index) =>
  createHash("sha256")
    .update(JSON.stringify([index, item.label, Number(item.quantity)]))
    .digest("hex");
export function partsForOrders(companyId, ids = []) {
  const rows = [],
    cache = new Map();
  const purchaseRows = (team, kind) => {
    const key = team + ":" + kind;
    if (!cache.has(key)) cache.set(key, purchases(team, kind));
    return cache.get(key);
  };
  const invoiceLines = new Map();
  for (const raw of db()
    .prepare("SELECT * FROM company_billing_invoices WHERE company_id=?")
    .all(companyId)) {
    const i = decode(raw);
    for (const line of i.lines || []) {
      const key = line.procurementId + ":" + line.partKey;
      if (!invoiceLines.has(key)) invoiceLines.set(key, []);
      invoiceLines.get(key).push({
        id: i.id,
        number: i.number || null,
        status: i.status,
        quantity: line.quantity,
        unitCents: line.unitCents,
      });
    }
  }

  for (const id of [...new Set(ids)]) {
    owned("gmao_work_orders", companyId, id);
    for (const p of db()
      .prepare(
        "SELECT * FROM gmao_procurements WHERE company_id=? AND work_order_id=?",
      )
      .all(companyId, id)) {
      const threads = db()
        .prepare(
          "SELECT * FROM team_threads WHERE source_company_id=? AND json_extract(context,'$.procurementId')=?",
        )
        .all(companyId, p.id);
      // Only explicitly shared requests may expose their financial evidence to the source team.
      const linked = threads.flatMap((t) =>
        purchaseRows(t.target_company_id, "request")
          .filter(
            (r) =>
              r.conversationId === t.id &&
              r.sourceCompanyId === companyId &&
              r.sourceProcurementId === p.id,
          )
          .map((r) => ({ r, team: t.target_company_id })),
      );
      const raw = JSON.parse(p.items || "[]");
      const items = raw.length
        ? raw
        : [
            {
              label: p.description,
              quantity: 1,
              received: p.status === "received" ? 1 : 0,
            },
          ];
      items.forEach((item, index) => {
        const key = partKey(item, index);
        const suppliers = linked.flatMap(({ r, team }) =>
          purchaseRows(team, "order")
            .filter((o) => o.requestId === r.id)
            .flatMap((o) =>
              purchaseRows(team, "invoice")
                .filter((i) => i.orderId === o.id)
                .map((i) => ({
                  id: i.id,
                  companyId: team,
                  reference: i.reference,
                  status: i.status,
                  orderId: o.id,
                  orderNumber: o.number,
                  costUnitCents:
                    o.items.find((l) => l.requestLineId === r.items[index]?.id)
                      ?.unitPriceCents ?? null,
                })),
            ),
        );
        const archived = db()
          .prepare(
            "SELECT evidence FROM gmao_work_order_events WHERE company_id=? AND work_order_id=? AND event_type='supplier_invoice_evidence' AND json_extract(evidence,'$.procurementId')=? ORDER BY happened_at DESC,rowid DESC",
          )
          .all(companyId, id, p.id);
        for (const event of archived) {
          const invoice = JSON.parse(event.evidence).supplierInvoice;
          const line = invoice?.items?.find(
            (l) =>
              l.index === index &&
              l.label === item.label &&
              Number(l.quantity) === Number(item.quantity),
          );
          if (line && !suppliers.some((i) => i.id === invoice.id))
            suppliers.push({
              ...invoice,
              costUnitCents: line.costUnitCents,
              historical: true,
            });
        }
        const invoices = invoiceLines.get(p.id + ":" + key) || [];
        const disp = db()
          .prepare(
            "SELECT data FROM gmao_part_dispositions WHERE company_id=? AND procurement_id=? AND part_key=?",
          )
          .get(companyId, p.id, key);
        rows.push({
          procurementId: p.id,
          partKey: key,
          workOrderId: id,
          description: item.label,
          quantity: Number(item.quantity),
          received: Number(item.received || 0),
          status: p.status,
          orderReference: p.order_reference || null,
          supplierInvoices: suppliers,
          customerInvoices: invoices,
          disposition: disp ? JSON.parse(disp.data) : null,
          billedQuantity: invoices.reduce((n, i) => n + Number(i.quantity), 0),
        });
      });
    }
  }
  return rows;
}
export function validatePartLines(companyId, invoice) {
  const parts = partsForOrders(companyId, invoice.workOrderIds || []),
    used = new Map();
  for (const line of invoice.lines || []) {
    if (!line.procurementId && !line.partKey) continue;
    const p = parts.find(
      (p) =>
        p.procurementId === line.procurementId && p.partKey === line.partKey,
    );
    if (!p || p.status === "cancelled")
      throw new Error(
        "La pièce ne correspond pas aux interventions de cette facture.",
      );
    if (p.disposition?.included)
      throw new Error(
        "Cette pièce est incluse au contrat et ne peut pas être refacturée.",
      );
    const key = p.procurementId + ":" + p.partKey;
    const quantity = (used.get(key) || 0) + Number(line.quantity);
    used.set(key, quantity);
    const elsewhere = p.customerInvoices
      .filter((i) => i.id !== invoice.id)
      .reduce((n, i) => n + Number(i.quantity), 0);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity + elsewhere > p.quantity + 1e-8
    )
      throw new Error(
        "Cette quantité de pièces est déjà affectée à une facture.",
      );
    line.partSource = {
      description: p.description,
      quantity: p.quantity,
      workOrderId: p.workOrderId,
      supplierInvoices: p.supplierInvoices,
    };
  }
}
export function setPartDisposition(companyId, input = {}) {
  return db().transaction(() => {
    const p = owned("gmao_procurements", companyId, input.procurementId);
    const part = partsForOrders(companyId, [p.work_order_id]).find(
      (p) =>
        p.procurementId === input.procurementId && p.partKey === input.partKey,
    );
    if (!part) throw new Error("La pièce a changé. Actualisez le dossier.");
    if (input.confirmed !== true || !input.reason?.trim())
      throw new Error("Confirmez le traitement et sa référence contractuelle.");
    if (part.customerInvoices.length)
      throw new Error(
        "Retirez cette pièce des brouillons avant de modifier son traitement.",
      );
    const old = db()
      .prepare(
        "SELECT * FROM gmao_part_dispositions WHERE company_id=? AND procurement_id=? AND part_key=?",
      )
      .get(companyId, p.id, part.partKey);
    const data = {
      included: input.included === true,
      reason: input.reason.trim(),
      recordedAt: Date.now(),
    };
    db()
      .prepare(
        "INSERT INTO gmao_part_dispositions VALUES(?,?,?,?,?,?,?) ON CONFLICT(company_id,procurement_id,part_key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
      )
      .run(
        old?.id || randomUUID(),
        companyId,
        p.id,
        part.partKey,
        JSON.stringify(data),
        old?.created_at || Date.now(),
        Date.now(),
      );
    audit.append(companyId, {
      kind: "action",
      role: "owner",
      action: "parts.billing_disposition",
      status: "recorded",
      recordId: p.id,
    });
    return data;
  })();
}
