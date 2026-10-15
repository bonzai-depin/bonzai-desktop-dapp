import test from "node:test";
import assert from "node:assert/strict";
import { validateOperationalBackup } from "../src/main/db/repos/operationalBackup.js";

function fixture() {
  return {
    gmao_sites: [{ id: "site-a" }, { id: "site-b" }],
    gmao_assets: [
      { id: "asset-a", site_id: "site-a" },
      { id: "asset-b", site_id: "site-b" },
    ],
    gmao_work_orders: [
      { id: "oi-a", site_id: "site-a", asset_id: "asset-a" },
      { id: "oi-b", site_id: "site-b", asset_id: "asset-b" },
    ],
    gmao_documents: [
      { id: "signed-a", work_order_id: "oi-a", site_id: "site-a" },
      { id: "signed-b", work_order_id: "oi-b", site_id: "site-b" },
      { id: "contract", work_order_id: null, site_id: null, asset_id: null },
    ],
    gmao_attachment_sheets: [
      { id: "visit-a", work_order_id: "oi-a" },
      { id: "visit-b", work_order_id: "oi-b" },
    ],
    gmao_maintenance_plans: [
      { id: "plan-a", asset_id: "asset-a" },
      { id: "plan-b", asset_id: "asset-b" },
      { id: "common-plan", asset_id: null },
    ],
    gmao_maintenance_records: [
      {
        id: "signature",
        kind: "signature",
        site_id: "site-b",
        work_order_id: "oi-b",
        data: JSON.stringify({
          documentId: "signed-b",
          attachmentSheetId: "visit-b",
          role: "technician",
        }),
      },
      {
        id: "programme",
        kind: "programme",
        site_id: "site-b",
        data: JSON.stringify({
          status: "approved",
          planIds: ["plan-b", "common-plan"],
          approvalDocumentId: "contract",
        }),
      },
    ],
  };
}
function update(tables, id, patch) {
  const record = tables.gmao_maintenance_records.find((row) => row.id === id);
  record.data = JSON.stringify({ ...JSON.parse(record.data), ...patch });
}

test("restore preserves common contract proof and unassigned annual programme plans", () => {
  assert.doesNotThrow(() => validateOperationalBackup(fixture()));
});

test("restore cannot reuse another intervention's signed file or field visit", () => {
  for (const patch of [
    { documentId: "signed-a" },
    { documentId: "contract" },
    { documentId: null },
    { attachmentSheetId: "visit-a" },
    { attachmentSheetId: null },
  ]) {
    const tables = fixture();
    update(tables, "signature", patch);
    assert.throws(
      () => validateOperationalBackup(tables),
      /same intervention/,
      JSON.stringify(patch),
    );
  }
});

test("restore cannot transfer a site's annual approval or equipment plans", () => {
  const proof = fixture();
  update(proof, "programme", { approvalDocumentId: "signed-a" });
  assert.throws(() => validateOperationalBackup(proof), /another site/);
  const plans = fixture();
  update(plans, "programme", { planIds: ["plan-a"] });
  assert.throws(
    () => validateOperationalBackup(plans),
    /plan from another site/,
  );
});

test("restore rejects maintenance records moved across equipment and intervention scopes", () => {
  for (const patch of [{ site_id: "site-a" }, { asset_id: "asset-a" }]) {
    const tables = fixture();
    Object.assign(tables.gmao_maintenance_records[0], patch);
    assert.throws(
      () => validateOperationalBackup(tables),
      /mixes site, equipment or intervention scopes/,
    );
  }
});
