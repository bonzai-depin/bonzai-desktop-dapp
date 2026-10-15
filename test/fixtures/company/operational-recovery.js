import "./billing.js";
import "./purchasing.js";
import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as portability from "../../../src/main/db/repos/companyPortability.js";
import * as purchasing from "../../../src/main/db/repos/purchasing.js";
import * as billing from "../../../src/main/db/repos/companyBilling.js";
import { syncCompanyMemory } from "../../../src/main/db/repos/companyMemory.js";
// Keep this fixture ESM when bundling an imported asynchronous delivery test.
export {};

const db = get().db;
for (const companyId of ["buyer", "billing-test"]) {
  const bundle = portability.exportBundle(companyId);
  const restored = portability.importBundle(bundle);
  assert.equal(restored.status, "paused");
  assert.equal(restored.purchasingTeamId, undefined);
  if (companyId === "buyer") {
    const original = purchasing.snapshot(companyId),
      copy = purchasing.snapshot(restored.id);
    assert.equal(copy.orders.length, original.orders.length);
    assert.equal(copy.payments.length, original.payments.length);
    assert.equal(copy.settings.validatedBy, original.settings.validatedBy);
    assert.ok(
      copy.orders.every((order) =>
        copy.requests.some((request) => request.id === order.requestId),
      ),
    );
    for (const request of copy.requests)
      if (request.restoredSharedOrigin) {
        assert.equal(request.conversationId, undefined);
        assert.equal(request.sourceCompanyId, undefined);
        assert.equal(request.sharedRouteStatus, "archived");
      }
    const corrupted = structuredClone(bundle);
    const order = corrupted.tables.purchasing_records.find(
      (row) => row.kind === "order",
    );
    order.data = JSON.stringify({
      ...JSON.parse(order.data),
      requestId: "another-company-request",
    });
    assert.throws(() => portability.importBundle(corrupted), /reference/);
  } else {
    const original = billing.snapshot(companyId),
      copy = billing.snapshot(restored.id);
    assert.equal(copy.invoices.length, original.invoices.length);
    assert.equal(copy.events.length, original.events.length);
    const paid = copy.invoices.find((invoice) => invoice.status === "paid");
    assert.ok(
      paid.document.blobId,
      "invoice PDF survives with its local content-addressed evidence",
    );
    assert.equal(
      paid.number,
      original.invoices.find((invoice) => invoice.status === "paid").number,
    );
    assert.ok(
      copy.invoices.every((invoice) =>
        copy.clients.some((client) => client.id === invoice.clientId),
      ),
    );
  }
  syncCompanyMemory(restored.id);
  const sources = db
    .prepare(
      "SELECT text_content FROM memory_sources WHERE source_type='company_record' AND json_extract(payload_json,'$.companyId')=?",
    )
    .all(restored.id)
    .map((row) => row.text_content);
  assert.ok(
    sources.some((text) =>
      text.includes(
        companyId === "buyer"
          ? "purchasing_settings"
          : "company_billing_invoices",
      ),
    ),
  );
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
}
console.log(
  "Operational recovery: financial evidence, purchasing policy, remapped links and memory preserved; shared live routes detached.",
);
