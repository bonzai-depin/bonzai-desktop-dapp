import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalRecordTarget,
  approvalRecordLabel,
  approvalRecordTitle,
} from "../src/services/company/approvalRecord.js";
import { approvalSummary } from "../src/services/company/approvalPresentation.js";
test("record-backed approvals retain their exact record and revision for owner inspection", () => {
  const invoice = {
    type: "billing.chorusAction",
    recordId: "invoice-42",
    input: { revision: 7, operation: "submit" },
  };
  assert.deepEqual(approvalRecordTarget(invoice), {
    kind: "invoice",
    id: "invoice-42",
    revision: 7,
  });
  assert.equal(
    approvalRecordLabel(approvalRecordTarget(invoice), "fr"),
    "Voir la facture",
  );
  const summary = approvalSummary(invoice, {}, "en");
  assert.equal(summary.title, "Submit invoice to Chorus");
  assert.ok(summary.fields.some((f) => f.value === "invoice-42"));
  assert.ok(summary.fields.some((f) => f.value === "7"));
  const rfq = {
    type: "purchasing.sendRfq",
    recordId: "rfq-19",
    input: { revision: 0 },
  };
  assert.deepEqual(approvalRecordTarget(rfq), {
    kind: "rfq",
    id: "rfq-19",
    revision: 0,
  });
  assert.equal(
    approvalRecordLabel(approvalRecordTarget(rfq), "en"),
    "View supplier request",
  );
  assert.equal(
    approvalRecordTitle(rfq, "fr"),
    "Envoyer la demande fournisseur",
  );
  for (const type of ["purchasing.approveRequest", "purchasing.issueOrder"]) {
    const action = {
      type,
      recordId: "purchase-8",
      input: { revision: 4, quoteRevision: 12 },
    };
    const target = approvalRecordTarget(action);
    assert.deepEqual(target, {
      kind: "purchaseRequest",
      id: "purchase-8",
      revision: 4,
    });
    assert.equal(approvalRecordLabel(target, "en"), "View purchase request");
    assert.equal(approvalRecordLabel(target, "fr"), "Voir la demande d’achat");
    assert.ok(
      approvalSummary(action, {}, "en").fields.some(
        (f) => f.value === "purchase-8",
      ),
    );
  }
  for (const action of [
    { type: "email.send", recordId: "x" },
    { type: "billing.chorusAction" },
    { type: "purchasing.sendRfq", recordId: " " },
  ])
    assert.equal(approvalRecordTarget(action), null);
});

test('message approvals inspect the exact saved message rather than another invoice draft',()=>{
 const target=approvalRecordTarget({type:'records.sendMessage',recordId:'message-42',input:{revision:1}});
 assert.deepEqual(target,{kind:'recordMessage',id:'message-42',revision:1});
 assert.equal(approvalRecordLabel(target,'fr'),'Voir le message');
});
