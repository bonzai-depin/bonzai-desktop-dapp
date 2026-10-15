import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as connectors from "../../../src/main/db/repos/connectors.js";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as p from "../../../src/main/db/repos/purchasing.js";
import * as issues from "../../../src/main/db/repos/issues.js";
import * as teams from "../../../src/main/db/repos/teamCommunication.js";
import * as gmaoOps from "../../../src/main/db/repos/gmaoOperations.js";
import * as gmao from "../../../src/main/db/repos/gmao.js";
import { makeCharter } from "../../../src/services/company/charter.js";
for (const id of ["buyer", "maintenance", "other"])
  companies.save({
    ...makeCharter({ name: id, mission: id }),
    id,
    name: id,
    status: "active",
    roles: { CEO: { companion: "a" }, PurchasingManager: { companion: "b" } },
  });
const supplier = p.saveSupplier("buyer", {
  name: "Local supplier",
  brands: ["Daikin"],
  families: ["pump"],
  region: "local",
  contacts: [{ channel: "email", address: "fixture@example.invalid" }],
});
const item = p.saveItem("buyer", { name: "Pump", sku: "P-1", minimum: 3 });
const request = p.saveRequest("buyer", {
  title: "Replenishment without customer OI",
  type: "replenishment",
  technicalConfirmed: true,
  items: [{ label: "Pump", itemId: item.id, quantity: 2 }],
});
assert.ok(request.issueId);
assert.equal(
  issues.getById("buyer", request.issueId).assigneeRole,
  "PurchasingManager",
);
assert.equal(issues.getById("buyer", request.issueId).assigneeCompanion, "b");
assert.match(
  issues.getById("buyer", request.issueId).description,
  /purchasing.snapshot/,
);
assert.equal(
  request.technicalConfirmed,
  false,
  "Autonomous draft must not self-approve a specification",
);
assert.throws(
  () =>
    p.saveRfq("buyer", {
      requestId: request.id,
      supplierId: supplier.id,
      message: "Unverified",
    }),
  /specification/,
);
p.confirmTechnical("buyer", request.id, {
  confirmed: true,
  reviewer: "Technician",
  evidenceReference: "Equipment manufacturer plate",
});
const quote = p.addQuote("buyer", {
  requestId: request.id,
  supplierId: supplier.id,
  reference: "Q-1",
  evidenceReference: "quote-original.pdf",
  items: [
    { requestLineId: request.items[0].id, quantity: 2, unitPriceCents: 20000 },
  ],
  leadDays: 3,
  shippingCents: 0,
  vatRate: 20,
  compatible: true,
  compatibilityEvidence: "Manufacturer reference checked",
  transportConfirmed: true,
  transportEvidence: "Local delivery confirmed",
});
const selected = p.selectQuote("buyer", request.id, {
  quoteId: quote.id,
  confirmed: true,
});
assert.throws(
  () =>
    p.issueOrder("buyer", request.id, {
      confirmed: true,
      deliveryAddress: "Warehouse",
      terms: "Net 30",
    }),
  /threshold/,
);
p.saveSettings("buyer", {
  confirmed: true,
  directionThresholdCents: 30000,
  approvers: [
    { id: "manager", name: "Manager" },
    { id: "director", name: "Director", direction: true },
  ],
  approvalCount: 2,
  followupHours: 24,
  validatedBy: "Owner",
});
p.approveRequest("buyer", request.id, {
  revision: p.read("buyer", "request", request.id).revision,
  quoteRevision: quote.revision,
  approverId: "manager",
  decision: "approved",
  recordedBy: "Owner",
  evidenceReference: "approval-manager",
  confirmed: true,
});
assert.throws(
  () =>
    p.approveRequest("buyer", request.id, {
      revision: p.read("buyer", "request", request.id).revision,
      quoteRevision: quote.revision,
      approverId: "manager",
      decision: "approved",
      recordedBy: "Owner",
      evidenceReference: "duplicate",
      confirmed: true,
    }),
  /already/,
);
assert.throws(
  () =>
    p.issueOrder("buyer", request.id, {
      confirmed: true,
      deliveryAddress: "Warehouse",
      terms: "Net 30",
    }),
  /incomplete/,
);
p.approveRequest("buyer", request.id, {
  revision: p.read("buyer", "request", request.id).revision,
  quoteRevision: quote.revision,
  approverId: "director",
  decision: "approved",
  recordedBy: "Owner",
  evidenceReference: "approval-direction",
  confirmed: true,
});
const order = p.issueOrder("buyer", request.id, {
  confirmed: true,
  deliveryAddress: "Warehouse",
  terms: "Net 30",
});
assert.match(order.number, /PO-\d{4}-00001/);
assert.equal(
  p.issueOrder("buyer", request.id, { confirmed: true }).id,
  order.id,
  "Issuance retry must not create a second order",
);
assert.match(p.documentHtml("buyer", order.id), /Local supplier/);
assert.throws(
  () =>
    p.recordReceipt("buyer", order.id, {
      reference: "BL-over",
      confirmed: true,
      receivedBy: "Tech",
      evidenceReference: "delivery.pdf",
      items: [{ requestLineId: request.items[0].id, quantity: 3 }],
    }),
  /exceeds/,
);
p.recordReceipt("buyer", order.id, {
  reference: "BL-1",
  confirmed: true,
  receivedBy: "Tech",
  evidenceReference: "delivery-1.pdf",
  items: [{ requestLineId: request.items[0].id, quantity: 1 }],
});
assert.equal(
  p.read("buyer", "request", request.id).status,
  "partially_received",
);
const invoice = p.saveSupplierInvoice("buyer", {
  orderId: order.id,
  reference: "INV-1",
  totalCents: order.totalCents,
  evidenceReference: "invoice.pdf",
  dueAt: Date.now() + 86400000,
});
assert.equal(invoice.status, "disputed");
assert.throws(
  () => p.preparePayment("buyer", invoice.id, { confirmed: true }),
  /differences/,
);
assert.throws(
  () => p.recordPayment("buyer", invoice.id, { confirmed: true }),
  /differences/,
);
p.recordReceipt("buyer", order.id, {
  reference: "BL-2",
  confirmed: true,
  receivedBy: "Tech",
  evidenceReference: "delivery-2.pdf",
  items: [{ requestLineId: request.items[0].id, quantity: 1 }],
});
assert.equal(p.snapshot("buyer").items[0].onHand, 2);
assert.equal(
  p.read("buyer", "invoice", invoice.id).status,
  "matched",
  "Full receiving resolves only the receipt exception",
);
assert.deepEqual(p.read("buyer", "invoice", invoice.id).exceptions, []);
p.stockMove("buyer", {
  itemId: item.id,
  type: "reserve",
  quantity: 1,
  reference: "job-1",
  confirmed: true,
});
assert.throws(
  () =>
    p.stockMove("buyer", {
      itemId: item.id,
      type: "consume",
      quantity: 2,
      reference: "job-2",
      confirmed: true,
    }),
  /Insufficient/,
);
assert.throws(
  () =>
    p.recordPayment("buyer", invoice.id, {
      confirmed: true,
      amountCents: order.totalCents,
      method: "bank",
      providerReference: "TX-1",
      verifiedBy: "Owner",
      settledAt: Date.now(),
    }),
  /receipt/i,
);
const prepared = p.preparePayment("buyer", invoice.id, { confirmed: true });
assert.deepEqual(prepared.missing, ["verified_bank_details"]);
assert.equal(prepared.bankDetails, null, "Never invent supplier bank details");
assert.equal(prepared.amountCents, invoice.totalCents);
assert.equal(prepared.receipts.length, 2);
assert.equal(issues.getById("buyer", prepared.issueId).assigneeRole, "CFO");
assert.equal(
  p.preparePayment("buyer", invoice.id, { confirmed: true }).issueId,
  prepared.issueId,
  "Repeated preparation does not duplicate finance tasks",
);
p.saveSupplier("buyer", {
  ...supplier,
  bankDetails: {
    beneficiary: "Supplier fixture",
    iban: "FR1420041010050500013M02606",
    verifiedBy: "Owner",
    evidenceReference: "supplier-rib.pdf",
  },
});
const withBank = p.preparePayment("buyer", invoice.id, { confirmed: true });
assert.equal(withBank.bankDetails.iban, "FR1420041010050500013M02606");
assert.deepEqual(withBank.missing, []);
assert.equal(withBank.issueId, prepared.issueId);
p.recordPayment("buyer", invoice.id, {
  confirmed: true,
  amountCents: order.totalCents,
  method: "bank",
  providerReference: "TX-1",
  receiptReference: "bank-receipt.pdf",
  verifiedBy: "Owner",
  settledAt: Date.now(),
});
assert.equal(p.read("buyer", "invoice", invoice.id).status, "paid");
assert.equal(
  p.read("buyer", "payment_dossier", prepared.id).status,
  "settlement_recorded",
);
assert.throws(
  () => p.preparePayment("buyer", invoice.id, { confirmed: true }),
  /already/,
);
const tool = p.saveEquipment("buyer", {
  name: "Vacuum pump",
  reference: "TOOL-1",
  type: "shared",
});
p.checkoutEquipment("buyer", tool.id, {
  borrower: "Technician",
  condition: "Clean",
  confirmed: true,
});
assert.throws(
  () =>
    p.returnEquipment("buyer", tool.id, {
      confirmed: true,
      clean: false,
      cleaningMinutes: 0,
      condition: "Dirty",
    }),
  /Clean/,
);
p.returnEquipment("buyer", tool.id, {
  confirmed: true,
  clean: true,
  cleaningMinutes: 12,
  condition: "Clean",
  safe: true,
});
assert.equal(
  p.read("buyer", "equipment", tool.id).lastReturn.cleaningMinutes,
  12,
);
const personal = p.saveEquipment("buyer", {
  name: "Gloves",
  reference: "PPE-1",
  type: "personal",
  assignedTo: "Tech",
  expiresAt: Date.now() - 1,
});
const defect = p.reportDefect("buyer", personal.id, {
  confirmed: true,
  photoRefs: ["photo-local"],
  description: "Torn insulation",
});
assert.equal(defect.type, "internal_equipment");
assert.throws(() => p.read("other", "request", request.id), /not found/);
assert.throws(
  () =>
    p.saveRequest("other", {
      sourceCompanyId: "buyer",
      sourceProcurementId: "fake",
    }),
  /explicitly shared/,
);
const rfq = p.saveRfq("buyer", {
  requestId: request.id,
  supplierId: supplier.id,
  message: "Stock availability?",
});
p.recordRfqDispatch("buyer", rfq.id, {
  confirmed: true,
  providerReference: "provider-id",
  sentAt: Date.now() - 25 * 3600000,
});
const reviews = p.runReview("buyer");
assert.ok(reviews.some((r) => r.rfqId === rfq.id));
assert.equal(p.runReview("buyer").length, reviews.length);
assert.throws(
  () =>
    p.recordSupplierReply("buyer", rfq.id, {
      correlationId: "wrong",
      body: "In stock",
      externalReference: "mail",
    }),
  /does not match/,
);
p.recordSupplierReply("buyer", rfq.id, {
  body: "In stock",
  externalReference: "mail",
  resolved: true,
});
assert.equal(p.read("buyer", "rfq", rfq.id).status, "answered");
const dpgf = p.reviewDpgf("buyer", {
  title: "Tender",
  sourceReference: "CCTP.pdf",
  expectedLines: ["A", "B"],
  offeredLines: ["A"],
});
assert.deepEqual(dpgf.missing, ["B"]);
const history = p.importHistory("buyer", [
  {
    source: "sage.xls:1",
    description: "old pump",
    unitPriceCents: 100,
    quantity: 2,
  },
]);
p.confirmHistoryMatch("buyer", history[0].id, {
  confirmed: true,
  itemId: item.id,
  reviewer: "Owner",
});
assert.equal(
  p.snapshot("buyer").items[0].onHand,
  2,
  "Historical data must not change live stock",
);
const site = gmao.saveSite("maintenance", { name: "Plant", trigram: "PLT" });
const wo = gmao.createWorkOrder("maintenance", {
  siteId: site.id,
  title: "Repair pump",
});
const source = gmao.saveProcurement("maintenance", {
  workOrderId: wo.id,
  description: "Replacement",
  items: [{ label: "Pump", quantity: 1, received: 0 }],
});
assert.throws(
  () =>
    p.receiveProcurement("other", {
      conversationId: "fake",
      sourceCompanyId: "maintenance",
      sourceProcurementId: source.id,
    }),
  /explicitly shared/,
);
const thread = teams.request("maintenance", {
  targetTeamId: "buyer",
  targetRole: "PurchasingManager",
  subject: "Pump",
  body: "Please source",
  procurementId: source.id,
  requestKey: "share-1",
});
const shared = p
  .snapshot("buyer")
  .requests.find((r) => r.conversationId === thread.id);
assert.ok(shared);
assert.equal(shared.workOrderId, wo.id);
assert.ok(teams.readProcurement("buyer", thread.id).technicalContext);
assert.throws(() => teams.readProcurement("other", thread.id), /not shared/);
// Independent approval seats survive delegation; tender ordering requires complete DPGF evidence.
const policy = {
  confirmed: true,
  directionThresholdCents: 30000,
  approvalCount: 2,
  followupHours: 24,
  validatedBy: "Owner",
  approvers: [
    { id: "manager", name: "Manager" },
    { id: "deputy", name: "Deputy", deputyFor: "manager" },
    { id: "director", name: "Director", direction: true },
  ],
};
p.saveSettings("buyer", policy);
assert.throws(
  () =>
    p.saveSettings("buyer", {
      ...policy,
      approvers: [
        { id: "a", name: "A", deputyFor: "b" },
        { id: "b", name: "B", deputyFor: "a" },
      ],
    }),
  /cycle/,
);
const tender = p.saveRequest("buyer", {
  title: "Tender spare parts",
  type: "tender",
  dpgfId: dpgf.id,
  technicalConfirmed: true,
  items: [{ label: "Pump", quantity: 2 }],
});
p.confirmTechnical("buyer", tender.id, {
  confirmed: true,
  reviewer: "Technician",
  evidenceReference: "Manufacturer specification",
});
const tenderQuote = p.addQuote("buyer", {
  ...quote,
  id: undefined,
  requestId: tender.id,
  items: [
    { requestLineId: tender.items[0].id, quantity: 2, unitPriceCents: 20000 },
  ],
});
p.selectQuote("buyer", tender.id, { quoteId: tenderQuote.id, confirmed: true });
const approval = {
  revision: p.read("buyer", "request", tender.id).revision,
  quoteRevision: tenderQuote.revision,
  confirmed: true,
  decision: "approved",
  recordedBy: "Owner",
  evidenceReference: "Signed approval",
};
assert.throws(
  () =>
    p.approveRequest("buyer", tender.id, {
      ...approval,
      revision: approval.revision - 1,
      approverId: "manager",
    }),
  /changed/,
);
assert.throws(
  () =>
    p.approveRequest("buyer", tender.id, {
      ...approval,
      quoteRevision: approval.quoteRevision - 1,
      approverId: "manager",
    }),
  /changed/,
);
p.approveRequest("buyer", tender.id, { ...approval, approverId: "manager" });
assert.throws(
  () =>
    p.approveRequest("buyer", tender.id, { ...approval, approverId: "deputy" }),
  /already/,
);
p.approveRequest("buyer", tender.id, { ...approval, approverId: "director" });
assert.throws(
  () => p.issueOrder("buyer", tender.id, { confirmed: true }),
  /DPGF/,
);
p.saveSettings("buyer", policy);
assert.throws(
  () => p.issueOrder("buyer", tender.id, { confirmed: true }),
  /incomplete/,
);
assert.doesNotThrow(
  () =>
    p.approveRequest("buyer", tender.id, {
      ...approval,
      approverId: "manager",
    }),
  "Renewed policy approval must remain possible",
);
// External delivery is exercised through a fake connector; no provider receives a message.
connectors.create("buyer", { kind: "sendgrid", authType: "none" });
connectors.create("buyer", {
  kind: "twilio",
  authType: "none",
  accountIdentifier: "AC" + "1".repeat(32),
});
const multiSupplier = p.saveSupplier("buyer", {
  name: "Supplier multiple contacts",
  contacts: [
    { channel: "email", address: "test@example.invalid" },
    { channel: "whatsapp", address: "+596696000000" },
  ],
});
assert.throws(
  () =>
    p.addQuote("buyer", {
      ...quote,
      id: undefined,
      requestId: defect.id,
      items: [
        { requestLineId: defect.items[0].id, quantity: 1, unitPriceCents: 100 },
      ],
      vatRate: undefined,
    }),
  /VAT/,
);
const changed = p.saveRequest("buyer", {
  title: "Changing draft",
  items: [{ label: "Valve", quantity: 1 }],
});
p.confirmTechnical("buyer", changed.id, {
  confirmed: true,
  reviewer: "Tech",
  evidenceReference: "Photo",
});
const oldDraft = p.saveRfq("buyer", {
  requestId: changed.id,
  supplierId: supplier.id,
  message: "Old specification",
});
const sameTechnical = p.saveRequest("buyer", {
  ...p.read("buyer", "request", changed.id),
  neededAt: Date.now(),
});
assert.equal(
  sameTechnical.technicalConfirmed,
  true,
  "Non-technical changes retain the actual review",
);
assert.equal(sameTechnical.issueId, changed.issueId);
issues.update("buyer", changed.issueId, { status: "cancelled" });
const newTechnical = p.saveRequest("buyer", {
  ...sameTechnical,
  items: [{ ...sameTechnical.items[0], quantity: 2 }],
  technicalConfirmed: true,
});
assert.equal(
  newTechnical.technicalConfirmed,
  false,
  "Changed content revokes prior review regardless of draft flags",
);
assert.equal(newTechnical.technicalEvidence, null);
assert.equal(newTechnical.issueId, changed.issueId);
assert.equal(
  issues.getById("buyer", changed.issueId).status,
  "cancelled",
  "Editing a draft cannot restart cancelled team work",
);
const outgoing = p.saveRfq("buyer", {
  requestId: request.id,
  supplierId: multiSupplier.id,
  message: "Confirm availability",
  subject: "Test only",
});
const calls = [];
p.configureDelivery(async (spec) => {
  calls.push(spec);
  return spec.connectorKind === "sendgrid"
    ? { status: 202, headers: { "x-message-id": "test-provider-id" } }
    : { status: 200, data: {} };
});
await assert.rejects(
  p.sendRfq("buyer", oldDraft.id, {
    confirmed: true,
    revision: oldDraft.revision,
    emailSender: "buyer@example.invalid",
  }),
  /specification changed/,
);
await assert.rejects(
  p.sendRfq("buyer", outgoing.id, {
    confirmed: true,
    revision: outgoing.revision - 1,
  }),
  /changed/,
);
assert.equal(calls.length, 0);
await assert.rejects(
  p.sendRfq("buyer", outgoing.id, {
    confirmed: true,
    revision: outgoing.revision,
    emailSender: "buyer@example.invalid",
    whatsappSender: "+596696000001",
  }),
  (error) => error.outcome === "unknown",
);
let pending = p.read("buyer", "rfq", outgoing.id);
assert.equal(pending.status, "delivery_unknown");
assert.equal(pending.dispatches[0].status, "submitted");
assert.equal(
  pending.dispatches[1].status,
  "unknown",
  "HTTP 200 without a WhatsApp message receipt is not submission evidence",
);
assert.ok(
  JSON.parse(calls[0].body).content[0].value.includes(outgoing.correlationId),
);
assert.equal(calls[0].companyId, "buyer");
await assert.rejects(
  p.sendRfq("buyer", outgoing.id, {
    confirmed: true,
    revision: pending.revision,
    emailSender: "buyer@example.invalid",
    whatsappSender: "+596696000001",
  }),
  /Verify/,
);
assert.equal(
  calls.length,
  2,
  "Uncertain outcomes are never automatically sent again",
);
pending = p.resolveRfqDelivery("buyer", outgoing.id, {
  confirmed: true,
  index: 1,
  sent: false,
  evidenceReference: "Provider-console-no-message",
  verifiedBy: "Owner",
});
p.configureDelivery(async (spec) => {
  calls.push(spec);
  return {
    status: 201,
    data: { sid: "SM" + "2".repeat(32), status: "queued" },
  };
});
const delivered = await p.sendRfq("buyer", outgoing.id, {
  confirmed: true,
  revision: pending.revision,
  emailSender: "buyer@example.invalid",
  whatsappSender: "+596696000001",
});
assert.equal(delivered.status, "awaiting_reply");
assert.equal(
  calls.length,
  3,
  "A verified retry must skip the email already accepted",
);
assert.equal(calls[2].connectorKind, "twilio");
assert.equal(
  delivered.dispatches[1].providerStatus,
  "queued",
  "Provider acceptance does not claim recipient delivery",
);
// A configured purchasing team receives new GMAO requests automatically, with attribution.
const charter = companies.getById("maintenance");
companies.save({
  ...charter,
  purchasingTeamId: "buyer",
  purchasingRole: "PurchasingManager",
});
const routed = gmao.saveProcurement("maintenance", {
  workOrderId: wo.id,
  description: "Auto-routed replacement",
  items: [{ label: "Valve", quantity: 1, received: 0 }],
});
assert.ok(
  p.snapshot("buyer").requests.some((r) => r.sourceProcurementId === routed.id),
);
console.log("Purchasing workflow passed");

// Follow the same shared part from request through its supplier invoice.
const linkedRequest=p.snapshot('buyer').requests.find(r=>r.sourceProcurementId===routed.id);
p.confirmTechnical('buyer',linkedRequest.id,{confirmed:true,reviewer:'Technician',evidenceReference:'Manufacturer valve reference'});
const linkedQuote=p.addQuote('buyer',{requestId:linkedRequest.id,supplierId:supplier.id,reference:'Q-linked',evidenceReference:'Supplier PDF',items:[{requestLineId:linkedRequest.items[0].id,quantity:1,unitPriceCents:15000}],leadDays:2,shippingCents:0,vatRate:20,compatible:true,compatibilityEvidence:'Manufacturer specification',transportConfirmed:true,transportEvidence:'Supplier delivery'});
p.selectQuote('buyer',linkedRequest.id,{quoteId:linkedQuote.id,confirmed:true});
p.saveSettings('buyer',{confirmed:true,directionThresholdCents:30000,approvers:[{id:'manager',name:'Manager'},{id:'director',name:'Director',direction:true}],approvalCount:2,followupHours:24,validatedBy:'Owner'});
for(const approverId of ['manager','director'])p.approveRequest('buyer',linkedRequest.id,{revision:p.read('buyer','request',linkedRequest.id).revision,quoteRevision:linkedQuote.revision,approverId,decision:'approved',recordedBy:'Owner',evidenceReference:'Approved quote',confirmed:true});
const linkedOrder=p.issueOrder('buyer',linkedRequest.id,{confirmed:true,deliveryAddress:'Plant',terms:'30 days'});
p.recordReceipt('buyer',linkedOrder.id,{reference:'BL-linked',receivedBy:'Technician',evidenceReference:'Signed receipt',confirmed:true,items:[{requestLineId:linkedRequest.items[0].id,quantity:1}]});
const linkedInvoice=p.saveSupplierInvoice('buyer',{orderId:linkedOrder.id,reference:'SUP-linked',totalCents:18000,dueAt:Date.now()+86400000,evidenceReference:'Supplier invoice original'});
const {partsForOrders}=await import('../../../src/main/db/repos/partTraceability.js');
const tracked=partsForOrders('maintenance',[wo.id]).find(line=>line.procurementId===routed.id);
assert.equal(tracked.supplierInvoices[0].id,linkedInvoice.id);
assert.equal(tracked.supplierInvoices[0].costUnitCents,15000);
assert.equal(tracked.received,1);
assert.equal(linkedInvoice.items[0].requestLineId,linkedRequest.items[0].id,'Supplier invoice retains the purchased line association');
assert.throws(()=>partsForOrders('other',[wo.id]),/Référence/);
console.log('Shared parts preserve received quantities, purchase cost and supplier invoice evidence.');

// Logistics changes are shared, scoped, evidenced and do not complete the intervention.
{
const costLines=['freight','insurance','handling','customs','duties','storage','lastMile'].map(category=>({category,status:'confirmed',amountCents:category==='freight'?5000:0,evidence:'Supplier confirmed inclusive delivery'}));
const beforeStatus=gmao.getWorkOrder('maintenance',wo.id).status;
const plan=p.saveLogistics('buyer',{requestId:linkedRequest.id,stage:'planning',deliveryAddress:'Plant',costs:costLines,salePriceCents:100000,otherJobCostsCents:10000,targetMarginPct:30,contingencyCents:5000});
assert.equal(plan.assessment.expectedCostCents,30000);
assert.equal(gmao.getWorkOrder('maintenance',wo.id).status,beforeStatus);
assert.ok(teams.read('maintenance',linkedRequest.conversationId).messages.some(m=>m.body.includes('Logistics / Logistique') && m.company_id==='buyer'));
assert.throws(()=>p.saveLogistics('other',{requestId:linkedRequest.id,stage:'planning',deliveryAddress:'Site'}),/not found/);
assert.throws(()=>p.saveLogistics('buyer',{...plan,stage:'delivered',confirmed:false}),/confirm/);
assert.throws(()=>p.saveLogistics('buyer',{...plan,revision:0}),/changed/);
const delayed=p.saveLogistics('buyer',{...plan,stage:'delayed',confirmed:true,evidenceReference:'Carrier delay notice',expectedAt:Date.now()-10000});
const reviews=p.runReview('buyer');
assert.ok(reviews.some(r=>r.logisticsId===plan.id));
const repeated=p.runReview('buyer');
assert.equal(repeated.filter(r=>r.logisticsId===plan.id).length,1);
assert.equal(gmao.getWorkOrder('maintenance',wo.id).status,beforeStatus);

const guarded=p.saveRequest('buyer',{title:'Margin-protected request',type:'internal_equipment',items:[{label:'Pump',quantity:1}]});
p.confirmTechnical('buyer',guarded.id,{confirmed:true,reviewer:'Technician',evidenceReference:'Specification'});
const guardedQuote=p.addQuote('buyer',{requestId:guarded.id,supplierId:supplier.id,reference:'Q-risk',evidenceReference:'Quote',items:[{requestLineId:guarded.items[0].id,quantity:1,unitPriceCents:10000}],leadDays:2,shippingCents:0,vatRate:20,compatible:true,compatibilityEvidence:'Spec',transportConfirmed:true,transportEvidence:'Delivery quote'});
p.selectQuote('buyer',guarded.id,{quoteId:guardedQuote.id,confirmed:true});
const oldRevision=p.read('buyer','request',guarded.id).revision;
p.saveLogistics('buyer',{requestId:guarded.id,stage:'planning',deliveryAddress:'Site',costs:[],targetMarginPct:30});
assert.ok(p.read('buyer','request',guarded.id).revision>oldRevision);
assert.throws(()=>p.issueOrder('buyer',guarded.id,{confirmed:true,deliveryAddress:'Site',terms:'30 days'}),/Review logistics/);
const risky=p.snapshot('buyer').logistics.find(l=>l.requestId===guarded.id);
p.saveLogistics('buyer',{...risky,costs:costLines});
for(const approverId of ['manager','director'])p.approveRequest('buyer',guarded.id,{revision:p.read('buyer','request',guarded.id).revision,quoteRevision:guardedQuote.revision,approverId,decision:'approved',recordedBy:'Owner',evidenceReference:'Reviewed delivered cost',confirmed:true});
assert.ok(p.issueOrder('buyer',guarded.id,{confirmed:true,deliveryAddress:'Site',terms:'30 days'}).id);
gmao.updateWorkOrder('maintenance',wo.id,{scheduledAt:Date.now()-20000});
const live=p.snapshot('buyer');
assert.equal(live.requests.find(r=>r.id===linkedRequest.id).sourceScheduledAt,gmao.getWorkOrder('maintenance',wo.id).scheduledAt);
assert.ok(live.logistics.find(l=>l.id===delayed.id).assessment.warnings.includes('delivery_late'));
console.log('Logistics risk, GMAO handoff and approval invalidation passed.');

}

const located = p.saveItem('buyer', {name:'Location test',sku:'LOC',minimum:0});
const locRequest = p.saveRequest('buyer', {title:'Reserved repair parts',type:'replenishment',items:[{label:'Location test',itemId:located.id,quantity:2}]});
const move = input => p.stockMove('buyer',{confirmed:true,itemId:located.id,reference:'Warehouse evidence',...input});
move({type:'receive',quantity:10,locationId:'depot'});
move({type:'transfer',quantity:4,locationId:'depot',destinationId:'van-1'});
move({type:'reserve',quantity:3,locationId:'van-1',requestId:locRequest.id});
assert.throws(()=>move({type:'transfer',quantity:2,locationId:'van-1',destinationId:'depot'}),/Insufficient/);
assert.throws(()=>move({type:'release',quantity:1,locationId:'van-1'}),/another request/);
move({type:'fulfill',quantity:2,locationId:'van-1',requestId:locRequest.id});
const inventory = p.snapshot('buyer').items.find(i=>i.id===located.id);
assert.equal(inventory.onHand,8);
assert.equal(inventory.reserved,1);
assert.deepEqual(inventory.locations.find(l=>l.locationId==='van-1'),{locationId:'van-1',onHand:2,reserved:1,available:1});
console.log('Location transfers and request-scoped reservations passed.');
const sales = await import('../../../src/main/db/repos/companySales.js');
let enquiry=sales.saveRecord('buyer',{title:'Replace HVAC unit',customer:'Client',scope:'Install reviewed unit',type:'opportunity',stage:'proposal',amountCents:250000});
assert.throws(()=>sales.handoff('buyer',{id:enquiry.id,revision:enquiry.revision,confirmed:true,targetTeamId:'maintenance',targetRole:'CEO'}),/acceptance/);
enquiry=sales.saveRecord('buyer',{...enquiry,stage:'accepted',evidenceReference:'Signed customer quote Q-42'});
const handed=sales.handoff('buyer',{id:enquiry.id,revision:enquiry.revision,confirmed:true,targetTeamId:'maintenance',targetRole:'CEO'});
assert.throws(()=>sales.acceptHandoff('other',{conversationId:handed.handoff.conversationId,siteId:site.id,confirmed:true}),/shared/);
const accepted=sales.acceptHandoff('maintenance',{conversationId:handed.handoff.conversationId,siteId:site.id,confirmed:true});
assert.equal(sales.acceptHandoff('maintenance',{conversationId:handed.handoff.conversationId,siteId:site.id,confirmed:true}).workOrderId,accepted.workOrderId);
assert.equal(gmao.getWorkOrder('maintenance',accepted.workOrderId).status,'reported');
assert.equal(sales.snapshot('maintenance').incoming.length,0);
const due=sales.saveRecord('buyer',{title:'Renew contract',customer:'Client',scope:'Review renewal terms',type:'renewal',stage:'enquiry',nextAt:Date.now()-1000});
assert.equal(sales.runReview('buyer').length,1);
assert.equal(sales.runReview('buyer').length,0);
console.log('Sales evidence, isolated idempotent handoff and follow-up passed.');

const recordOps=await import('../../../src/main/db/repos/recordOperations.js');
const ownedWork=recordOps.snapshot('maintenance',{kind:'workOrder',id:wo.id});
const evidenceShare=recordOps.shareEvidence('maintenance',{kind:'workOrder',id:wo.id,version:ownedWork.record.version,targetTeamId:'buyer',targetRole:'CEO',confirmed:true});
assert.equal(recordOps.readSharedEvidence('buyer',evidenceShare).id,wo.id);
assert.throws(()=>recordOps.readSharedEvidence('other',evidenceShare),/shared/);
assert.equal(recordOps.listSharedEvidence('buyer').length,1);
console.log('Explicit operational evidence sharing stays scoped to addressed teams.');
const warranty=p.saveWarranty('buyer',{confirmed:true,title:'Pump seal defect',itemId:item.id,invoiceId:invoice.id,evidenceReference:'Supplier case 12',nextAt:Date.now()-1000,status:'open'});
assert.ok(p.runReview('buyer').some(r=>r));
assert.equal(p.snapshot('buyer').warranties.find(w=>w.id===warranty.id).status,'open');
assert.throws(()=>p.saveWarranty('buyer',{...warranty,confirmed:true,itemId:located.id}),/source cannot change/);
const maintenance=await import('../../../src/main/db/repos/gmaoMaintenance.js');
const routeWork=gmao.createWorkOrder('maintenance',{siteId:site.id,title:'Route visit',type:'corrective'});
const route=maintenance.planRoute('maintenance',{technician:'Tech route',startAt:Date.now()+86400000,stops:[{workOrderId:routeWork.id,travelMinutes:20}]});
assert.equal(route.stops[0].scheduledAt,route.startAt+20*60000);
maintenance.applyRoute('maintenance',{...route,confirmed:true,evidenceReference:'Reviewed road travel'});
assert.equal(gmao.getWorkOrder('maintenance',routeWork.id).assigneeHuman,'Tech route');
assert.throws(()=>maintenance.planRoute('other',{technician:'Tech',startAt:Date.now(),stops:[{workOrderId:routeWork.id,travelMinutes:0}]}),/entreprise/);
console.log('Warranty evidence and reviewed route scheduling passed.');
const routeA=gmao.createWorkOrder('maintenance',{siteId:site.id,title:'Atomic route A',type:'corrective'});
const routeB=gmao.createWorkOrder('maintenance',{siteId:site.id,title:'Atomic route B',type:'corrective'});
const staleRoute=maintenance.planRoute('maintenance',{technician:'Tech',startAt:Date.now()+2*86400000,stops:[{workOrderId:routeA.id,travelMinutes:0},{workOrderId:routeB.id,travelMinutes:10}]});
gmao.updateWorkOrder('maintenance',routeB.id,{title:'Changed after preview'});
assert.throws(()=>maintenance.applyRoute('maintenance',{...staleRoute,confirmed:true,evidenceReference:'Reviewed map'}),/changed/);
assert.equal(gmao.getWorkOrder('maintenance',routeA.id).scheduledAt,null,'A failed route must not leave its first visit scheduled');
const portability=await import('../../../src/main/db/repos/companyPortability.js');
companies.save({...makeCharter({name:'Restore sales',mission:'sales'}),id:'restore-sales',name:'Restore sales',status:'active',roles:{CEO:{companion:'a'}}});
const restoreSale=sales.saveRecord('restore-sales',{title:'Accepted scope',customer:'Client',scope:'Replace HVAC',type:'opportunity',stage:'accepted',amountCents:120000,evidenceReference:'Customer signed quote'});
sales.handoff('restore-sales',{id:restoreSale.id,revision:restoreSale.revision,targetTeamId:'maintenance',targetRole:'CEO',confirmed:true});
const restoredSales=portability.importBundle(portability.exportBundle('restore-sales'));
const restoredCase=sales.snapshot(restoredSales.id).records[0];
assert.equal(restoredCase.handoff,undefined);
assert.ok(restoredCase.archivedHandoff);
console.log('Restored sales records retain history without reconnecting live handoffs.');

const workspaceDocs=await import('../../../src/main/db/repos/companyWorkspace.js');
assert.ok(workspaceDocs.deliverables('buyer').rows.some(d=>d.id==='purchase:'+order.id));
assert.match((await workspaceDocs.readDeliverable('buyer',{id:'purchase:'+order.id})).html,/<html|<!doctype/i);
await assert.rejects(()=>workspaceDocs.readDeliverable('other',{id:'purchase:'+order.id}),/not found/);
const localClient=gmaoOps.saveClient('buyer',{name:'Canonical customer'});
const linkedSale=sales.saveRecord('buyer',{title:'Linked customer',clientId:localClient.id,customer:'Ignored free text',type:'opportunity',stage:'enquiry',scope:'Service request'});
assert.equal(linkedSale.customer,'Canonical customer');
assert.throws(()=>sales.saveRecord('other',{...linkedSale,id:undefined}),/Customer not found/);
