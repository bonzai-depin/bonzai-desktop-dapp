import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as gmao from "../../../src/main/db/repos/gmao.js";
import * as ops from "../../../src/main/db/repos/gmaoOperations.js";
import * as blobs from "../../../src/main/db/blobs.js";
import * as portability from "../../../src/main/db/repos/companyPortability.js";
import { createDeliveryService } from "../../../src/main/gmao/delivery.js";
import { makeCharter } from "../../../src/services/company/charter.js";
import { executeLocalAction } from "../../../src/services/company/gmao.js";
const { db } = get();
const charter = {
  ...makeCharter({
    name: "Maintenance fixture",
    mission: "Isolated maintenance acceptance",
  }),
  id: "ops-fixture",
  status: "active",
};
companies.save(charter);
companies.save({ ...charter, id: "other-fixture" });
globalThis.window = { electronAPI: { db: { gmao: { ...gmao, ...ops } } } };
const company = charter.id,
  other = "other-fixture";
gmao.bootstrap(company);
assert.equal(
  gmao.snapshot(company).sites.length,
  0,
  "production bootstrap must never add demo sites",
);
assert.equal(gmao.snapshot(company).kpis.compliancePct, null);
const c = ops.saveClient(company, {
    name: "Client A",
    email: "customer@example.invalid",
    phone: "+33600000000",
  }),
  c2 = ops.saveClient(company, { name: "Client B" });
const contract = ops.saveServiceContract(company, {
  name: "Maintenance standard",
  clientId: c.id,
  vatRate: 20,
});
const site = gmao.saveSite(company, {
  name: "Bureau",
  trigram: "B01",
  clientId: c.id,
  serviceContractId: contract.id,
});
const site2 = gmao.saveSite(company, {
  name: "Boutique",
  trigram: "B02",
  clientId: c2.id,
});
const foreign = gmao.saveSite(other, { name: "Private", trigram: "PRV" });
assert.throws(
  () => gmao.saveSite(other, { id: site.id, name: "Hijack", trigram: "HJK" }),
  /autre entreprise/,
);
assert.throws(
  () =>
    gmao.saveSite(company, {
      name: "Mismatch",
      trigram: "X",
      clientId: c2.id,
      serviceContractId: contract.id,
    }),
  /contrat/,
);
const split = gmao.saveAsset(company, {
  siteId: site.id,
  equipmentType: "split",
  assetCode: "SP01",
});
const cold = gmao.saveAsset(company, {
  siteId: site.id,
  equipmentType: "groupe froid",
  assetCode: "GF01",
});
assert.throws(
  () =>
    gmao.createWorkOrder(company, {
      siteId: site2.id,
      assetId: split.id,
      title: "Wrong site",
    }),
  /équipement/,
);
assert.throws(
  () =>
    gmao.createWorkOrder(company, {
      siteId: foreign.id,
      title: "Wrong company",
    }),
  /Référence/,
);
assert.throws(
  () =>
    gmao.createWorkOrder(company, {
      siteId: site.id,
      title: "Fake completion",
      status: "completed",
    }),
  /commence/,
);
assert.throws(
  () =>
    gmao.createWorkOrder(company, {
      siteId: site.id,
      title: "Fake proof",
      serviceAcceptance: true,
    }),
  /preuve/,
);
const wo = gmao.createWorkOrder(company, {
  siteId: site.id,
  assetId: split.id,
  title: "Réparer la climatisation",
  priority: "P3",
  requestKey: "first-oi",
});
assert.equal(
  gmao.createWorkOrder(company, {
    siteId: site.id,
    title: "double click",
    requestKey: "first-oi",
  }).id,
  wo.id,
);
assert.throws(
  () => gmao.updateWorkOrder(company, wo.id, { serviceAcceptance: true }),
  /métier/,
);
assert.throws(
  () => gmao.addEvent(other, wo.id, { note: "Unauthorized" }),
  /Référence/,
);
await assert.rejects(
  () =>
    executeLocalAction(company, "field.completeJob", {
      jobId: wo.id,
      technicianName: "Lou",
      notes: "Pretend",
      photoRefs: ["fake"],
    }),
  /sur site/,
);
assert.equal(gmao.getWorkOrder(company, wo.id).status, "reported");
const at = Date.UTC(2026, 9, 7, 8),
  second = gmao.createWorkOrder(company, {
    siteId: site2.id,
    title: "Second",
    priority: "P3",
  });
gmao.updateWorkOrder(company, wo.id, {
  scheduledAt: at,
  assigneeHuman: "Lou",
  durationMinutes: 90,
});
assert.throws(
  () =>
    gmao.updateWorkOrder(company, second.id, {
      scheduledAt: at + 30 * 60000,
      assigneeHuman: "Lou",
      durationMinutes: 60,
    }),
  /déjà planifié/,
);
gmao.updateWorkOrder(company, second.id, {
  scheduledAt: at + 90 * 60000,
  assigneeHuman: "Lou",
  durationMinutes: 60,
});
for (const status of ["triaged", "assigned", "acknowledged", "en_route"])
  gmao.transitionWorkOrder(company, wo.id, status, { assigneeHuman: "Lou" });
assert.equal(
  gmao.getWorkOrder(company, wo.id).interventionStartedAt,
  null,
  "travel is not arrival",
);
gmao.transitionWorkOrder(company, wo.id, "on_site", { assigneeHuman: "Lou" });
assert.throws(
  () => gmao.transitionWorkOrder(company, wo.id, "restored"),
  /compte-rendu/,
);
const beforeWaiting=gmao.snapshot(company).procurements.length;
gmao.recordAttachmentSheet(company,wo.id,{technicianName:'Lou',workPerformed:'Awaiting access to equipment',waiting:true});
assert.equal(gmao.getWorkOrder(company,wo.id).status,'on_site');
assert.equal(gmao.snapshot(company).procurements.length,beforeWaiting);
const photo = blobs.write(Buffer.from("isolated photo fixture"), "png", {
  source: "gmao",
  sourceId: company,
});
const photoDoc = gmao.addDocument(company, {
  workOrderId: wo.id,
  category: "field_photo",
  mimeType: "image/png",
  blobId: photo.id,
  blobExt: "png",
  originalName: "photo.png",
});
gmao.recordAttachmentSheet(company, wo.id, {
  technicianName: "Lou",
  diagnosis: "Ventilateur défaillant",
  workPerformed: "Diagnostic sur place",
  photoRefs: [photoDoc.id],
  resolved: false,
  repairMode: "with_quote",
  repairDescription: "Ventilateur de remplacement",
});
let purchase = gmao.snapshot(company).procurements[0];
assert.equal(purchase.status, "requested");
assert.equal(gmao.snapshot(company).handoffs.length, 1);
assert.throws(
  () =>
    gmao.saveProcurement(other, {
      id: purchase.id,
      workOrderId: foreign.id,
      description: "Hijack",
      status: "received",
    }),
  /autre entreprise/,
);
assert.throws(
  () => gmao.createQuote(other, second.id, { procurementId: purchase.id }),
  /Référence/,
);
assert.throws(
  () =>
    gmao.transitionWorkOrder(company, wo.id, "assigned", {
      assigneeHuman: "Lou",
    }),
  /pièces/,
);
const supplier = ops.saveSupplier(company, {
  name: "Fournisseur",
  email: "supplier@example.invalid",
});
const handoff = gmao.snapshot(company).handoffs[0];
ops.acknowledgeHandoff(company, handoff.id, { responsible: "Camille" });
purchase = gmao.saveProcurement(company, {
  id: purchase.id,
  supplierId: supplier.id,
  items: [{ label: "Ventilateur", quantity: 2, received: 0 }],
  status: "proforma_received",
  proformaReference: "PRO-42",
  amountCents: 24000,
});
assert.equal(
  gmao.snapshot(company).handoffs.length,
  1,
  "repeat updates never duplicate handoffs",
);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM issues WHERE company_id=? AND assignee_role='PurchasingManager'",
    )
    .get(company).n,
  0,
  "A parts request must not create a purchasing role task inside Maintenance",
);
const quote = gmao.createQuote(company, wo.id, {
  procurementId: purchase.id,
  quoteType: "bpu",
  partsCents: 24000,
  laborCents: 5000,
  vatRate: 20,
});
assert.throws(
  () => gmao.updateQuote(company, quote.id, { status: "sent" }),
  /boîte/,
);
assert.throws(
  () =>
    gmao.saveNotification(company, {
      workOrderId: wo.id,
      notificationType: "quote",
      deliveryStatus: "sent",
    }),
  /boîte/,
);
let externalCalls = 0,
  lastPayload,
  behavior = "success";
const service = createDeliveryService({
  printPdf: async (html) => {
    assert.match(html, /Client A/);
    assert.match(html, /DEV-/);
    return Buffer.from("%PDF-1.4\n" + html);
  },
  request: async (spec) => {
    externalCalls++;
    lastPayload = spec;
    if (behavior === "timeout") throw new Error("Timed out");
    if (behavior === "reject") {
      const e = new Error("rejected");
      e.status = 401;
      throw e;
    }
    if (spec.method === "GET")
      return { status: 200, data: { to: "+33600000000", status: "delivered" } };
    return spec.url.includes("twilio")
      ? { status: 201, data: { sid: "SM" + "1".repeat(32), status: "queued" } }
      : { status: 202, headers: { "x-message-id": "fixture-provider-id" } };
  },
});
db.prepare(
  "INSERT INTO connectors(id,company_id,kind,label,auth_type,scopes,account_identifier,status,created_at,updated_at) VALUES('sendgrid-fixture',?,'sendgrid','Email','api-key','[]','sender@example.invalid','active',?,?)",
).run(company, Date.now(), Date.now());
db.prepare(
  "INSERT INTO connectors(id,company_id,kind,label,auth_type,scopes,account_identifier,status,created_at,updated_at) VALUES('twilio-fixture',?,'twilio','SMS','api-key','[]',?,'active',?,?)",
).run(company, "AC" + "1".repeat(32), Date.now(), Date.now());
const pdf = await service.generateDocument(company, {
  kind: "quote",
  workOrderId: wo.id,
  recordId: quote.id,
});
assert.equal(
  (
    await service.generateDocument(company, {
      kind: "quote",
      workOrderId: wo.id,
      recordId: quote.id,
    })
  ).id,
  pdf.id,
  "identical versions reuse immutable file",
);
const draft = ops.saveOutbox(company, {
  workOrderId: wo.id,
  documentId: pdf.id,
  channel: "email",
  sender: "sender@example.invalid",
  recipient: "customer@example.invalid",
  subject: "Votre devis",
  message: "Bonjour, voici votre devis.",
  requestKey: "reviewed-quote",
});
assert.equal(
  ops.saveOutbox(company, {
    workOrderId: wo.id,
    documentId: pdf.id,
    channel: "email",
    sender: "sender@example.invalid",
    recipient: "customer@example.invalid",
    subject: "Votre devis",
    message: "Bonjour, voici votre devis.",
    requestKey: "reviewed-quote",
  }).id,
  draft.id,
);
await assert.rejects(
  () => service.sendOutbox(company, draft.id, { confirmed: true, revision: 0 }),
  /version/,
);
assert.equal(externalCalls, 0);
const sent = await service.sendOutbox(company, draft.id, {
  confirmed: true,
  revision: draft.revision,
});
assert.equal(sent.status, "submitted");
assert.equal(sent.providerId, "fixture-provider-id");
assert.equal(
  JSON.parse(lastPayload.body).attachments[0].filename,
  pdf.filename,
);
assert.equal(gmao.snapshot(company).quotes[0].status, "sent");
await service.sendOutbox(company, draft.id, {
  confirmed: true,
  revision: draft.revision,
});
assert.equal(externalCalls, 1, "double clicks never re-send");
assert.throws(
  () => ops.saveOutbox(company, { ...sent, message: "Changed" }),
  /verrouillé/,
);
gmao.updateQuote(company, quote.id, {
  status: "accepted",
  evidenceReference: "Signed client agreement",
});
gmao.updateQuote(company, quote.id, {
  status: "purchase_order_received",
  purchaseOrder: "BC-42",
  evidenceReference: "BC client PDF",
});
assert.throws(
  () =>
    gmao.saveProcurement(company, {
      id: purchase.id,
      status: "received",
      receiptReference: "BL-42",
    }),
  /Transition/,
);
gmao.saveProcurement(company, {
  id: purchase.id,
  status: "ordered",
  orderReference: "PO-42",
});
gmao.saveProcurement(company, {
  id: purchase.id,
  status: "partially_received",
  receiptReference: "BL-42",
  items: [{ label: "Ventilateur", quantity: 2, received: 1 }],
});
assert.throws(
  () =>
    gmao.transitionWorkOrder(company, wo.id, "assigned", {
      assigneeHuman: "Lou",
    }),
  /pièces/,
);
gmao.saveProcurement(company, {
  id: purchase.id,
  status: "received",
  receiptReference: "BL-43",
  items: [{ label: "Ventilateur", quantity: 2, received: 2 }],
});
assert.equal(gmao.snapshot(company).handoffs[0].status, "completed");
assert.throws(()=>gmao.addEvent(company,wo.id,{eventType:'process_purchase_order_returned',evidence:{purchaseOrder:'fake'}}),/validation/);
assert.throws(()=>gmao.updateWorkOrder(company,wo.id,{repairMode:'none'}),/métier/);
// A received PO is insufficient: its signed file must be returned before repair.
assert.throws(()=>gmao.transitionWorkOrder(company,wo.id,'assigned',{assigneeHuman:'Lou'}),/retourné/);
const signedBlob=blobs.write(Buffer.from('%PDF-1.4 signed PO fixture'),'pdf',{source:'gmao',sourceId:company,mimeType:'application/pdf'});
const signedDoc=gmao.addDocument(company,{workOrderId:wo.id,category:'signed_purchase_order',filename:'signed-po.pdf',blobId:signedBlob.id,blobExt:'pdf',mimeType:'application/pdf'});
assert.throws(()=>gmao.validateProcessStep(company,wo.id,{step:'purchase_order_signed',documentId:signedDoc.id,signer:'Fixture manager'}),/explicitement/);
const wrongDoc=gmao.addDocument(company,{workOrderId:second.id,category:'evidence',filename:'other-po.pdf',blobId:signedBlob.id,blobExt:'pdf'});
assert.throws(()=>gmao.validateProcessStep(company,wo.id,{step:'purchase_order_signed',documentId:wrongDoc.id,signer:'Manager',confirmed:true}),/dossier/);
gmao.validateProcessStep(company,wo.id,{step:'purchase_order_signed',documentId:signedDoc.id,signer:'Fixture manager',confirmed:true});
const unsent=ops.saveOutbox(company,{workOrderId:wo.id,channel:'email',sender:'sender@example.invalid',recipient:c.email,subject:'Unsent',message:'Unsent',documentId:signedDoc.id});
assert.throws(()=>gmao.validateProcessStep(company,wo.id,{step:'purchase_order_returned',outboxId:unsent.id,confirmed:true}),/reçu/);
const sendProcessEmail=async (subject,documentId=null)=>{const mail=ops.saveOutbox(company,{workOrderId:wo.id,channel:'email',sender:'sender@example.invalid',recipient:c.email,subject,message:subject,documentId,requestKey:subject});await service.sendOutbox(company,mail.id,{confirmed:true,revision:mail.revision});return mail;};
const returnMail=await sendProcessEmail('Signed PO return',signedDoc.id);
gmao.validateProcessStep(company,wo.id,{step:'purchase_order_returned',outboxId:returnMail.id,confirmed:true});
for (const status of ["assigned", "acknowledged", "on_site"])
  gmao.transitionWorkOrder(company, wo.id, status, { assigneeHuman: "Lou" });
gmao.recordAttachmentSheet(company, wo.id, {
  technicianName: "Lou",
  workPerformed: "Remplacement et contrôle",
  photoRefs: [photoDoc.id],
  resolved: true,
});
assert.throws(()=>gmao.validateProcessStep(company,wo.id,{step:'service_acceptance_requested',outboxId:returnMail.id,confirmed:true}),/fin des travaux/);
const sfMail=await sendProcessEmail('Request service acceptance');
gmao.validateProcessStep(company,wo.id,{step:'service_acceptance_requested',outboxId:sfMail.id,confirmed:true});
assert.throws(
  () => gmao.recordServiceAcceptance(company, wo.id, { reference: "SF-1" }),
  /signataire/,
);
gmao.recordServiceAcceptance(company, wo.id, {
  reference: "SF-1",
  customerSignatory: "Client fixture",
});
assert.equal(gmao.getWorkOrder(company,wo.id).status,'restored','receiving SF never closes the intervention');
assert.throws(()=>gmao.saveInvoice(company,{workOrderId:wo.id}),/transmission/);
gmao.validateProcessStep(company,wo.id,{step:'billing_requested',confirmed:true});
const invoice = gmao.saveInvoice(company, {
  workOrderId: wo.id,
  quoteId: quote.id,
});
assert.equal(invoice.totalCents, quote.totalCents);
assert.throws(()=>gmao.validateProcessStep(company,wo.id,{step:'close',confirmed:true}),/accord/);
gmao.validateProcessStep(company,wo.id,{step:'close',customerSignatory:'Fixture client',evidenceReference:'Customer closure approval email',confirmed:true});
assert.equal(gmao.getWorkOrder(company,wo.id).closureStatus,'closed');
assert.equal(
  gmao.snapshot(company).assets.find((a) => a.id === split.id).nextServiceAt,
  null,
  "a corrective does not reset the preventive cycle",
);
// Restart and uncertain network results require reconciliation before another send.
const sms = ops.saveOutbox(company, {
  workOrderId: wo.id,
  channel: "sms",
  sender: "+33600000001",
  recipient: "+33600000000",
  subject: "Confirmation",
  message: "Intervention terminée.",
});
const smsSent = await service.sendOutbox(company, sms.id, {
  confirmed: true,
  revision: sms.revision,
});
assert.equal(smsSent.status, "submitted");
assert.equal(
  (await service.checkDelivery(company, sms.id)).status,
  "delivered",
);
const failed = ops.saveOutbox(company, {
  workOrderId: wo.id,
  channel: "sms",
  sender: "+33600000001",
  recipient: "+33600000000",
  subject: "Test",
  message: "Network probe",
});
behavior = "timeout";
await assert.rejects(
  () =>
    service.sendOutbox(company, failed.id, {
      confirmed: true,
      revision: failed.revision,
    }),
  /interrompue/,
);
assert.equal(
  gmao.snapshot(company).outbox.find((m) => m.id === failed.id).status,
  "unknown",
);
const calls = externalCalls;
await assert.rejects(
  () =>
    service.sendOutbox(company, failed.id, {
      confirmed: true,
      revision: failed.revision,
    }),
  /incertain/,
);
assert.equal(externalCalls, calls);
ops.resolveOutbox(company, failed.id, {
  status: "failed",
  evidence: "Provider test log confirms no message",
});
behavior = "success";
await service.sendOutbox(company, failed.id, {
  confirmed: true,
  revision: failed.revision,
});
const paused = ops.saveOutbox(company, {
  workOrderId: wo.id,
  channel: "sms",
  sender: "+33600000001",
  recipient: "+33600000000",
  subject: "Test",
  message: "Restart probe",
});
db.prepare("UPDATE gmao_outbox SET status='submitting' WHERE id=?").run(
  paused.id,
);
assert.equal(ops.recoverOutbox(), 1);
assert.equal(
  gmao.snapshot(company).outbox.find((m) => m.id === paused.id).status,
  "unknown",
);
// Occurrences match equipment, keep scheduled dates, and never collapse overdue visits.
const due = Date.UTC(2026, 8, 30, 9),
  plan = gmao.savePlan(company, {
    name: "Visite split",
    technicalSection: "ST1",
    equipmentType: "split",
    periodicityMonths: 3,
    nextDueAt: due,
  });
const generated = gmao.generatePreventive(company, due, due + 100 * 86400000);
assert.equal(generated.generated, 2);
assert.ok(generated.workOrders.every((w) => w.assetId === split.id));
assert.ok(
  generated.workOrders.every((w) => !w.scheduledAt && w.preventiveDueAt),
);
assert.equal(generated.workOrders[0].campaignColor, "VERT");
assert.equal(
  gmao.generatePreventive(company, due, due + 100 * 86400000).generated,
  0,
);
const intake = gmao.ingestDocument(company, {
  originalName: "proforma.pdf",
  extractedText: "Fournisseur proforma",
  matchedWorkOrderId: second.id,
});
assert.throws(
  () =>
    gmao.applyDocumentIntake(company, intake.id, {
      documentType: "supplier_proforma",
      workOrderId: second.id,
    }),
  /demande achats/,
);
assert.equal(gmao.snapshot(company).documentIntake[0].status, "to_review");
assert.equal(
  ops.searchWorkOrders(company, { query: "climatisation" }).results.length,
  1,
);
assert.equal(
  ops.getDossier(company, wo.workOrderNumber).client.name,
  "Client A",
);
// No truncation masquerading as global metrics.
const bundle = portability.exportBundle(company),
  restored = portability.importBundle(bundle),
  snap = gmao.snapshot(restored.id);
assert.equal(restored.status, "paused");
assert.equal(snap.clients.length, 2);
assert.equal(snap.handoffs.length, 1);
assert.equal(snap.workOrders.length, gmao.snapshot(company).workOrders.length);
assert.ok(snap.outbox.every((m) => m.status !== "submitting"));
assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
assert.equal(snap.quotes[0].procurementId, snap.procurements[0].id);
assert.ok(
  snap.outbox.some(m => m.documentId === snap.documents.find(d => d.category === "quote").id),
);
// Guardrails for edits, contractual scope and immutable evidence.
assert.throws(
  () =>
    gmao.saveSite(company, {
      ...site,
      clientId: c2.id,
      serviceContractId: null,
    }),
  /historique/,
);
assert.throws(
  () =>
    ops.saveServiceContract(company, { ...contract, endsAt: 1, startsAt: 2 }),
  /fin/,
);
assert.throws(
  () =>
    gmao.savePlan(company, { name: "Invalid cadence", periodicityMonths: 0 }),
  /Périodicité/,
);
assert.throws(
  () =>
    gmao.createWorkOrder(company, {
      siteId: site.id,
      title: "Invented state",
      quoteStatus: "purchase_order_received",
    }),
  /exécution/,
);
assert.throws(
  () =>
    gmao.saveProcurement(company, {
      id: purchase.id,
      items: [{ label: "Other part", quantity: 1, received: 1 }],
    }),
  /lecture seule/,
);
const newDraft = ops.saveOutbox(company, {
  workOrderId: wo.id,
  channel: "sms",
  sender: "+33600000001",
  recipient: "+33600000000",
  message: "Scoped message",
});
assert.throws(
  () => ops.saveOutbox(company, { ...newDraft, workOrderId: second.id }),
  /changer de dossier/,
);
const edited = ops.saveOutbox(company, {
  ...newDraft,
  message: "Reviewed new content",
});
await assert.rejects(
  () =>
    service.sendOutbox(company, newDraft.id, {
      confirmed: true,
      revision: newDraft.revision,
    }),
  /version/,
);
assert.equal(edited.revision, newDraft.revision + 1);
const conflictingRestore = structuredClone(bundle);
conflictingRestore.tables.gmao_quotes[0].procurement_id = "not-in-this-company";
assert.throws(() => portability.importBundle(conflictingRestore), /reference/);
ops.saveServiceContract(company, {
  ...contract,
  settings: { sla: { P1: { interventionHours: 6, restorationHours: 12 } } },
});
const contractual = gmao.createWorkOrder(company, {
  siteId: site.id,
  title: "Contractual visit",
  priority: "P1",
  reportedAt: 100000000,
});
assert.equal(contractual.interventionDueAt, 100000000 + 6 * 3600000);
assert.equal(contractual.restorationDueAt, 100000000 + 12 * 3600000);
assert.equal(
  gmao.createWorkOrder(company, {
    siteId: site2.id,
    title: "No contractual deadline",
    priority: "P1",
  }).interventionDueAt,
  null,
);
assert.equal(
  gmao.createQuote(company, contractual.id, {
    quoteType: "bpu",
    laborCents: 1000,
  }).vatRate,
  20,
);
gmao.transitionWorkOrder(company, contractual.id, "triaged");
assert.equal(
  gmao
    .snapshot(company)
    .notifications.find((n) => n.workOrderId === contractual.id).recipient,
  c.email,
);
// Aggregation must not silently stop at the old 500-record limit.
db.transaction(() => {
  for (let i = 0; i < 505; i++)
    gmao.createWorkOrder(other, {
      siteId: foreign.id,
      title: "Volume test " + i,
      priority: "P3",
    });
})();
assert.equal(gmao.snapshot(other).workOrders.length, 505);
assert.equal(gmao.snapshot(other).kpis.openWorkOrders, 505);
// An existing legacy contract migrates without losing operational history.
const { default: Database } = await import("better-sqlite3");
const { default: fs } = await import("node:fs");
const { default: path } = await import("node:path");
const vec = await import("sqlite-vec");
const legacy = new Database(":memory:");
vec.load(legacy);
legacy.pragma("foreign_keys=ON");
for (const name of fs
  .readdirSync("src/main/db/migrations")
  .filter((n) => n.endsWith(".sql") && n < "0018")
  .sort())
  legacy.exec(
    fs.readFileSync(path.join("src/main/db/migrations", name), "utf8"),
  );
legacy
  .prepare(
    "INSERT INTO companies(id,name,mode,status,charter,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  )
  .run("old", "Old workspace", "solo", "paused", "{}", 1, 1);
legacy
  .prepare(
    "INSERT INTO gmao_contracts(id,company_id,name,client_contact_name,client_email,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  )
  .run(
    "old-contract",
    "old",
    "Client contract",
    "Historic client",
    "historic@example.invalid",
    1,
    1,
  );
legacy
  .prepare(
    "INSERT INTO gmao_sites(id,company_id,contract_id,name,trigram,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
  )
  .run("old-site", "old", "old-contract", "Existing site", "OLD", 1, 1);
legacy.exec(
  fs.readFileSync("src/main/db/migrations/0018_gmao_operations.sql", "utf8"),
);
assert.equal(
  legacy.prepare("SELECT client_id FROM gmao_sites").get().client_id,
  "legacy-client-old-contract",
);
assert.equal(
  legacy.prepare("SELECT email FROM gmao_clients").get().email,
  "historic@example.invalid",
);
assert.equal(legacy.prepare("PRAGMA foreign_key_check").all().length, 0);
legacy.close();
console.log(
  "GMAO lifecycle, isolation, planning, purchasing, immutable PDF, approved email/SMS transport fixtures, delivery recovery, intake, and paused restore passed. No live sends.",
);

const gasContract=ops.saveServiceContract(company,{name:'Validated gas terms',clientId:c.id,vatRate:20,gasValidated:true,settings:{gasFranchise:{profile:'gas_franchise_25_004',technicalSection:'ST3',validatedBy:'Contract owner',thresholdCents:1}}});
assert.equal(gasContract.settings.gasFranchise.thresholdCents,30000,'canonical source terms cannot be overridden');
assert.throws(()=>ops.saveServiceContract(company,{name:'Unvalidated',clientId:c.id,settings:{gasFranchise:gasContract.settings.gasFranchise}}),/Validez/);
const gasSite=gmao.saveSite(company,{name:'Gas site',trigram:'GAS',clientId:c.id,serviceContractId:gasContract.id});
const gasAsset=gmao.saveAsset(company,{siteId:gasSite.id,assetCode:'GAS-01',equipmentType:'gas regulator',domainCode:'REG',technicalSection:'ST3'});
const gasWork=gmao.createWorkOrder(company,{siteId:gasSite.id,assetId:gasAsset.id,title:'Gas maintenance'});
const gasQuote=gmao.createQuote(company,gasWork.id,{quoteType:'outside_bpu',partsCents:50000,laborCents:120000,laborHours:12,travelCents:7500,accessCents:10000});
assert.equal(gasQuote.totalCents,78000);assert.equal(gasQuote.calculation.contractTerms.sourceSection,'ST 04');
