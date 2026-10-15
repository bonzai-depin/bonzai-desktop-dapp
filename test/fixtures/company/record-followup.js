import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as gmao from "../../../src/main/db/repos/gmao.js";
import * as ops from "../../../src/main/db/repos/gmaoOperations.js";
import * as billing from "../../../src/main/db/repos/companyBilling.js";
import * as records from "../../../src/main/db/repos/recordOperations.js";
import { createRecordDelivery } from "../../../src/main/gmao/recordDelivery.js";
import * as connectors from "../../../src/main/db/repos/connectors.js";
import {
  exportBundle,
  importBundle,
} from "../../../src/main/db/repos/companyPortability.js";
import { makeCharter } from "../../../src/services/company/charter.js";
const db = get().db,
  c = "record-test",
  other = "record-other";
for (const id of [c, other]) {
  companies.save({
    ...makeCharter({ name: id, mission: "test" }),
    id,
    status: "active",
  });
  gmao.bootstrap(id);
}
const client = ops.saveClient(c, {
    name: "Client",
    email: "client@example.invalid",
  }),
  site = gmao.saveSite(c, {
    name: "Site",
    trigram: "TST",
    clientId: client.id,
  });
const wo = gmao.createWorkOrder(c, {
  siteId: site.id,
  title: "Repair pump",
  type: "corrective",
});
const p = gmao.saveProcurement(c, {
  workOrderId: wo.id,
  description: "Pump",
  items: [{ label: "Pump A", quantity: 2 }],
});
let parts = records.partsForOrders(c, [wo.id]);
assert.equal(parts.length, 1);
const part = parts[0],
  line = {
    description: "Pump A",
    quantity: 1,
    unitCents: 10000,
    vatRate: 20,
    procurementId: p.id,
    partKey: part.partKey,
  };
const input = {
  clientId: client.id,
  kind: "unit",
  workOrderIds: [wo.id],
  issuedAt: Date.now(),
  dueAt: Date.now() + 86400000,
  lines: [line],
};
const inv = billing.saveInvoice(c, input);
assert.equal(
  records.partsForOrders(c, [wo.id])[0].customerInvoices[0].id,
  inv.id,
);
assert.throws(
  () => billing.saveInvoice(c, { ...input, lines: [{ ...line, quantity: 2 }] }),
  /quantité/,
);
assert.throws(
  () => billing.saveInvoice(c, { ...input, workOrderIds: [] }),
  /interventions/,
);
assert.throws(
  () =>
    records.setPartDisposition(c, {
      procurementId: p.id,
      partKey: part.partKey,
      included: true,
      reason: "Contract",
      confirmed: true,
    }),
  /brouillons/,
);
const p2 = gmao.saveProcurement(c, {
  workOrderId: wo.id,
  description: "Seal",
  items: [{ label: "Seal", quantity: 1 }],
});
const part2 = records
  .partsForOrders(c, [wo.id])
  .find((x) => x.procurementId === p2.id);
records.setPartDisposition(c, {
  ...part2,
  included: true,
  reason: "CCAP article 3",
  confirmed: true,
});
assert.throws(
  () =>
    billing.saveInvoice(c, {
      ...input,
      lines: [{ ...line, procurementId: p2.id, partKey: part2.partKey }],
    }),
  /incluse/,
);
assert.throws(
  () => records.snapshot(other, { kind: "customerInvoice", id: inv.id }),
  /Référence/,
);
const email = connectors.create(c, { kind: "sendgrid", authType: "none" }),
  sms = connectors.create(c, {
    kind: "twilio",
    authType: "none",
    accountIdentifier: "AC" + "a".repeat(32),
  });
let calls = [],
  mode = "ok";
const service = createRecordDelivery({
  printPdf: async () => Buffer.from("%PDF-fixture"),
  request: async (spec) => {
    calls.push(spec);
    if (mode === "unknown") throw new Error("timeout");
    if (mode === "reject") return { status: 400 };
    if (spec.method === "GET")
      return {
        status: 200,
        data: spec.url.includes("twilio")
          ? { to: "+33600000000", status: "delivered" }
          : {
              messages: [
                {
                  to_email: "client@example.invalid",
                  msg_id: "sg-1",
                  status: "delivered",
                },
              ],
            },
      };
    return {
      status: spec.url.includes("twilio") ? 201 : 202,
      headers: { "x-message-id": "sg-1" },
      data: { sid: "SM" + "b".repeat(32) },
    };
  },
});
for (const kind of ["workOrder", "customerInvoice"]) {
  const id = kind === "workOrder" ? wo.id : inv.id;
  let draft = await service.prepareMessage(c, {
    kind,
    id,
    channel: "email",
    recipient: "client@example.invalid",
    sender: "sender@example.invalid",
    body: "Reviewed document",
    attachPdf: true,
  });
  assert.ok(draft.attachment.blobId);
  await assert.rejects(() => service.sendMessage(c, draft.id, {}), /Validez/);
  assert.equal(calls.length, kind === "workOrder" ? 0 : 2);
  const sent = await service.sendMessage(c, draft.id, {
    confirmed: true,
    revision: 1,
  });
  assert.equal(sent.status, "submitted");
  assert.equal((await service.checkDelivery(c, draft.id)).status, "delivered");
  const n = calls.length;
  await service.sendMessage(c, draft.id, { confirmed: true, revision: 1 });
  assert.equal(calls.length, n, "No duplicate accepted send");
}
const before = calls.length;
let draft = await service.prepareMessage(c, {
  kind: "workOrder",
  id: wo.id,
  channel: "sms",
  recipient: "+33600000000",
  sender: "+33100000000",
  body: "WO status",
});
mode = "unknown";
await assert.rejects(
  () => service.sendMessage(c, draft.id, { confirmed: true, revision: 1 }),
  /incertain/,
);
assert.equal(
  records.snapshot(c, { kind: "workOrder", id: wo.id }).messages[0].status,
  "unknown",
);
await assert.rejects(
  () => service.sendMessage(c, draft.id, { confirmed: true, revision: 1 }),
  /incertain/,
);
assert.equal(calls.length, before + 1);
service.reconcileMessage(c, draft.id, {
  confirmed: true,
  outcome: "not_sent",
  evidence: "Provider console reference",
});
mode = "ok";
assert.equal(
  (await service.sendMessage(c, draft.id, { confirmed: true, revision: 1 }))
    .status,
  "submitted",
);
assert.equal((await service.checkDelivery(c, draft.id)).status, "delivered");
draft = await service.prepareMessage(c, {
  kind: "customerInvoice",
  id: inv.id,
  channel: "email",
  recipient: "client@example.invalid",
  sender: "sender@example.invalid",
  body: "Old",
});
billing.saveInvoice(c, { ...inv, notes: "New revision" });
await assert.rejects(
  () => service.sendMessage(c, draft.id, { confirmed: true, revision: 1 }),
  /changé/,
);
// Supplier originals are actual uploaded files, never a fabricated replacement invoice.
const sup = "supplier-test";
db.prepare("INSERT INTO purchasing_records VALUES(?,?,?,?,?,?,?)").run(
  sup,
  c,
  "invoice",
  JSON.stringify({
    orderId: "not-used-in-messaging",
    reference: "SUP-1",
    status: "matched",
    totalCents: 10000,
  }),
  1,
  Date.now(),
  Date.now(),
);
await assert.rejects(
  () =>
    service.prepareMessage(c, {
      kind: "supplierInvoice",
      id: sup,
      channel: "email",
      sender: "sender@example.invalid",
      recipient: "supplier@example.invalid",
      body: "Invoice",
      attachPdf: true,
    }),
  /original/,
);
records.attachSource(c, {
  kind: "supplierInvoice",
  id: sup,
  version: records.record(c, "supplierInvoice", sup).version,
  filename: "original.pdf",
  base64: Buffer.from("%PDF-original").toString("base64"),
});
draft = await service.prepareMessage(c, {
  kind: "supplierInvoice",
  id: sup,
  channel: "email",
  sender: "sender@example.invalid",
  recipient: "supplier@example.invalid",
  body: "Invoice",
  attachPdf: true,
});
assert.equal(draft.attachment.filename, "original.pdf");
await service.sendMessage(c, draft.id, { confirmed: true, revision: 1 });
const policy = records.saveReminder(c, {
  kind: "workOrder",
  id: wo.id,
  enabled: true,
  days: 1,
});
assert.equal(records.runReminders(c, { now: policy.nextAt + 1 }).length, 1);
assert.equal(
  records.runReminders(c, { now: policy.nextAt + 86400000 * 3 }).length,
  0,
  "Open task is never duplicated",
);
assert.ok(
  records.snapshot(c, { kind: "workOrder", id: wo.id }).reminder.issueId,
);
db.prepare("UPDATE gmao_work_orders SET status='completed' WHERE id=?").run(
  wo.id,
);
records.runReminders(c, { now: policy.nextAt + 86400000 * 4 });
assert.equal(
  records.snapshot(c, { kind: "workOrder", id: wo.id }).reminder.enabled,
  false,
);
// A customer's dispute or promise controls reminders, never accounting settlement.
const invoiceFollow = records.saveReminder(c,{kind:'customerInvoice',id:inv.id,enabled:true,days:2});
const responseInput={kind:'customerInvoice',id:inv.id,version:records.snapshot(c,{kind:'customerInvoice',id:inv.id}).record.version,note:'Customer asked to check the scope',evidenceReference:'Customer email 42'};
const dispute=records.saveCollection(c,{...responseInput,status:'disputed'});
assert.ok(!records.runReminders(c,{now:invoiceFollow.nextAt+1}).some(job=>job.labels.includes(inv.id)));
assert.throws(()=>records.saveCollection(c,{...responseInput,status:'resolved'}),/Response changed/);
const promise=records.saveCollection(c,{...responseInput,previousId:dispute.id,status:'promised',promisedAt:Date.now()+10*86400000});
assert.ok(!records.runReminders(c,{now:invoiceFollow.nextAt+1}).some(job=>job.labels.includes(inv.id)));
records.saveCollection(c,{...responseInput,previousId:promise.id,status:'resolved'});
assert.notEqual(records.snapshot(c,{kind:'customerInvoice',id:inv.id}).record.status,'paid');
// Invoice policies use the same independent reminder engine; closed financial records stop.
for (const [kind, id] of [
  ["customerInvoice", inv.id],
  ["supplierInvoice", sup],
]) {
  const follow = records.saveReminder(c, { kind, id, enabled: true, days: 2 });
  const jobs = records.runReminders(c, { now: follow.nextAt + 1 });
  assert.ok(jobs.some((job) => job.labels.includes(id)));
}
const stableOriginal = records.activities(
  c,
  "supplierInvoice",
  sup,
  "attachment",
)[0].blobId;
db.prepare(
  "UPDATE purchasing_records SET data=json_set(data,'$.status','paid') WHERE id=?",
).run(sup);
const paidCopy = await service.prepareMessage(c, {
  kind: "supplierInvoice",
  id: sup,
  channel: "email",
  sender: "sender@example.invalid",
  recipient: "supplier@example.invalid",
  body: "Paid invoice copy",
  attachPdf: true,
});
assert.equal(
  paidCopy.attachment.blobId,
  stableOriginal,
  "Settlement never invalidates the original supplier PDF",
);
records.runReminders(c, { now: Date.now() + 10 * 86400000 });
assert.equal(
  records.snapshot(c, { kind: "supplierInvoice", id: sup }).reminder.enabled,
  false,
);
companies.save({ ...companies.getById(c), demoMode: true });
const count = calls.length;
await assert.rejects(
  () => service.sendMessage(c, paidCopy.id, { confirmed: true, revision: 1 }),
  /démonstration/,
);
assert.equal(calls.length, count, "Demo cannot dispatch a record message");
companies.save({ ...companies.getById(c), demoMode: false });
// Verify restart recovery on a journal written before an interrupted network operation.
const m = records.activities(c, "customerInvoice", inv.id, "message")[0];
records.put(
  c,
  "customerInvoice",
  inv.id,
  "message",
  { ...m, status: "submitting" },
  m.id,
);
records.recoverMessages();
assert.equal(
  records.activities(c, "customerInvoice", inv.id, "message")[0].status,
  "unknown",
);
// Remove only the deliberately incomplete supplier fixture before validating full recovery.
db.prepare("DELETE FROM gmao_record_activity WHERE record_id=?").run(sup);
db.prepare("DELETE FROM purchasing_records WHERE id=?").run(sup);
const bundle = exportBundle(c),
  restored = importBundle(bundle);
const state = db
  .prepare(
    "SELECT data FROM gmao_record_activity WHERE company_id=? AND kind='reminder'",
  )
  .get(restored.id);
assert.equal(JSON.parse(state.data).enabled, false);
assert.ok(
  db
    .prepare("SELECT id FROM gmao_part_dispositions WHERE company_id=?")
    .get(restored.id),
);
console.log(
  "Part allocation, duplicate billing prevention, contract inclusion, record-scoped email/SMS/PDF, approval, uncertainty, stale versions, reminders and recovery passed.",
);
