import test from "node:test";
import assert from "node:assert/strict";
import { routeGoalToRole } from "../src/services/company/charter.js";
import { requiresOwnerApproval } from "../src/services/company/governance.solo.js";
import { approvalSummary } from "../src/services/company/approvalPresentation.js";
import {
  monthDays,
  scopedOperations,
  dayKey,
} from "../src/services/company/gmaoPresentation.js";
test("human evidence and purchasing cannot be silently approved by an agent", () => {
  for (const action of [
    { type: "gmao.updateQuote", status: "purchase_order_received" },
    { type: "gmao.updateQuote", status: "rejected" },
    { type: "gmao.updateProcurement", status: "received" },
    { type: "gmao.registerCompliance", status: "valid" },
    { type: "gmao.transitionWorkOrder", status: "acknowledged" },
  ])
    assert.equal(requiresOwnerApproval(action), true, action.type);
  assert.equal(
    requiresOwnerApproval({ type: "gmao.notifyClient" }),
    false,
    "Preparing a draft has no external effect",
  );
  const summary = approvalSummary(
    {
      type: "gmao.updateProcurement",
      workOrderId: "w",
      amountCents: 12000,
      supplierName: "Supplier",
      receiptReference: "BL-42",
      items: [{ label: "Courroie", quantity: 3, received: 1 }],
    },
    {
      workOrders: [
        { id: "w", workOrderNumber: "OT-42", title: "Repair ventilation" },
      ],
    },
    "fr",
  );
  assert.equal(
    summary.fields.find((f) => f.label === "Intervention").value,
    "OT-42 · Repair ventilation",
  );
  assert.match(summary.fields.find((f) => f.label === "Montant").value, /120/);
  assert.equal(summary.fields.find((f) => f.label === "Bon de réception").value, "BL-42");
  assert.equal(summary.fields.find((f) => f.label === "Articles").value, "Courroie · 3 demandé(s) · 1 reçu(s)");
});
test("client scope and calendar preserve real dossiers at month boundaries", () => {
  const data = {
    sites: [
      { id: "s1", clientId: "c1" },
      { id: "s2", clientId: "c2" },
    ],
    workOrders: [
      { id: "w1", siteId: "s1" },
      { id: "w2", siteId: "s2" },
    ],
    procurements: [
      { id: "p1", workOrderId: "w1" },
      { id: "p2", workOrderId: "w2" },
    ],
    outbox: [{ id: "m1", workOrderId: "w2" }],
  };
  const scope = scopedOperations(data, "c1");
  assert.deepEqual(
    scope.workOrders.map((w) => w.id),
    ["w1"],
  );
  assert.equal(scope.outbox.length, 0);
  assert.equal(scope.procurements.length, 1);
  const days = monthDays(new Date(2026, 11, 15));
  assert.equal(days.length, 42);
  assert.equal(days[0].getDay(), 1);
  assert.equal(new Set(days.map(dayKey)).size, 42);
  assert.ok(days.some((d) => d.getFullYear() === 2027));
});

test("maintenance purchase briefs go to the buyer", () => {
  assert.equal(
    routeGoalToRole(
      { directive: "Préparer une demande fournisseur pour OI-42" },
      { roles: { PurchasingManager: {companion:"priya"} } },
    ),
    "PurchasingManager",
  );
});
