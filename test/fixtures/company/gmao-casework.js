import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as gmao from "../../../src/main/db/repos/gmao.js";
import * as ops from "../../../src/main/db/repos/gmaoOperations.js";
import * as maintenance from "../../../src/main/db/repos/gmaoMaintenance.js";
import { createDeliveryService } from "../../../src/main/gmao/delivery.js";
import * as cases from "../../../src/main/db/repos/gmaoCasework.js";
import * as intake from "../../../src/main/db/repos/companyIntake.js";
import * as purchasing from "../../../src/main/db/repos/purchasing.js";
import * as portability from "../../../src/main/db/repos/companyPortability.js";
import * as blobs from "../../../src/main/db/blobs.js";
import { makeCharter } from "../../../src/services/company/charter.js";
import {
  normalizeVisit,
  normalizePart,
  normalizeFluid,
  durationMinutes,
  normalizeMaintenanceDocument,
  evidenceDate,
} from "../../../src/shared/maintenanceEvidence.js";
import { classifyGmaoDocument } from "../../../src/services/company/gmaoIntelligence.js";
import { calculateContractQuote } from "../../../src/services/company/contractPricing.js";
import { importBatch } from "../../../src/main/gmao/importBatch.js";
import { documentHtml } from "../../../src/services/company/gmaoDocuments.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
const id = "casework-fixture",
  db = get().db;
for (const key of [id, "other-casework"]) {
  companies.save({
    ...makeCharter({ name: key, mission: "Synthetic CMMS acceptance" }),
    id: key,
    status: "active",
  });
  gmao.bootstrap(key);
}
const site = gmao.saveSite(id, { name: "North site", trigram: "NTH" }),
  south = gmao.saveSite(id, { name: "South site", trigram: "STH" });
const a = gmao.saveAsset(id, {
  siteId: site.id,
  assetCode: "K7-A",
  serialNumber: "SER-129",
  equipmentType: "climat",
  technicalSection: "ST1",
});
const b = gmao.saveAsset(id, {
  siteId: site.id,
  assetCode: "K7-B",
  serialNumber: "SER-130",
  equipmentType: "climat",
  technicalSection: "ST1",
});
const donor = gmao.saveAsset(id, {
  siteId: south.id,
  assetCode: "MOTOR",
  equipmentType: "climat",
  technicalSection: "ST1",
});
const foreign = gmao.saveAsset("other-casework", {
  siteId: gmao.saveSite("other-casework", { name: "Foreign" }).id,
  assetCode: "PRIVATE",
  equipmentType: "climat",
});
cases.saveSiteAlias(id, { siteId: site.id, alias: "North depot" });
assert.equal(cases.resolveSite(id, "NORTH DEPOT").id, site.id);
assert.throws(() =>
  cases.saveSiteAlias(id, { siteId: south.id, alias: "NTH" })
);
const wo = gmao.createWorkOrder(id, {
  siteId: site.id,
  assetId: a.id,
  title: "Two-unit repair",
  receivedAt: Date.now() - 60000,
  assigneeHuman: "Alex",
});
const equipment = cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "equipment",
  data: { assetId: a.id, label: "Unit A", outcome: "out_of_service" },
});
cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "equipment",
  data: { assetId: b.id, label: "Unit B", outcome: "operational" },
});
assert.throws(() => cases.assertCaseRestorable(id, wo), /partielle/);
assert.throws(() =>
  cases.saveRecord(id, {
    workOrderId: wo.id,
    kind: "equipment",
    data: { assetId: foreign.id, label: "Foreign" },
  })
);
const visit = cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "visit",
  data: {
    workPerformed: "Motor repair",
    segments: [
      {
        date: "2016-08-31",
        start: "09:00",
        end: "10:00",
        technicians: ["Alex"],
      },
      {
        date: "2016-09-01",
        start: "08:30",
        end: "09:45",
        technicians: ["Alex"],
      },
    ],
  },
});
assert.equal(visit.presenceMinutes, 135);
assert.equal(visit.laborMinutes, 135);
assert.equal(
  normalizeVisit({
    workPerformed: "Two technicians",
    segments: [
      {
        date: "2016-01-22",
        start: "11:00",
        end: "17:00",
        breakMinutes: 60,
        technicians: ["Alex", "Sam"],
      },
    ],
  }).laborMinutes,
  600
);
assert.equal(
  normalizeVisit({ workPerformed: "Duration only", duration: "1,5 H" })
    .laborMinutes,
  null
);
assert.equal(durationMinutes("1 h 30"), 90);
assert.throws(() =>
  normalizeVisit({
    workPerformed: "Overlap",
    segments: [
      {
        date: "2016-01-22",
        start: "11:00",
        end: "13:00",
        technicians: ["Alex"],
      },
      {
        date: "2016-01-22",
        start: "12:00",
        end: "14:00",
        technicians: ["Alex"],
      },
    ],
  })
);
const part = cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "part",
  data: {
    name: "Reused motor",
    origin: "reused",
    quantity: 1,
    owner: "Customer",
    condition: "Used",
    donorAssetId: donor.id,
    recipientAssetId: b.id,
  },
});
assert.equal(part.unitCostCents, null);
assert.equal(normalizePart({ ...part, unitCostCents: 0 }).unitCostCents, 0);
const fluid = cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "fluid",
  data: {
    assetId: a.id,
    circuit: "V3",
    refrigerant: "R407C",
    operation: "added",
    quantityKg: 16.5,
    date: "2016-01-22",
    leakResult: "not_found",
    technician: "Alex",
    followupDate: "2026-11-02",
    followup: "Search leak on return visit",
  },
});
assert.equal(fluid.quantityKg, 16.5);
assert.throws(() => normalizeFluid({ ...fluid, followup: "" }));
const blocker = cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "blocker",
  data: {
    type: "expert",
    reason: "Awaiting manufacturer report",
    owner: "Planner",
    nextAction: "Obtain report",
    dueDate: "2026-11-02",
  },
});
assert.equal(
  db
    .prepare("SELECT count(*) n FROM gmao_procurements WHERE work_order_id=?")
    .get(wo.id).n,
  0
);
assert.throws(
  () =>
    cases.resolveBlocker(id, {
      id: blocker.id,
      revision: 0,
      resolution: "Received",
    }),
  /changé/
);
cases.resolveBlocker(id, {
  id: blocker.id,
  revision: 1,
  resolution: "Manufacturer report received",
});
cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "equipment",
  id: equipment.id,
  revision: equipment.revision,
  data: { ...equipment, outcome: "operational" },
});
assert.doesNotThrow(() => cases.assertCaseRestorable(id, wo));
assert.equal(cases.history(id, { id: equipment.id }).length, 2);
// Ambiguous DST is never silently billed; known offsets handle a real clock change.
assert.equal(
  normalizeVisit({
    workPerformed: "Clock change",
    segments: [
      {
        date: "2026-03-29",
        start: "01:30",
        end: "03:30",
        timezone: "Europe/Paris",
        technicians: ["Alex"],
      },
    ],
  }).laborMinutes,
  60
);
assert.throws(
  () =>
    normalizeVisit({
      workPerformed: "Ambiguous clock",
      segments: [
        {
          date: "2026-10-25",
          start: "02:30",
          end: "03:30",
          timezone: "Europe/Paris",
          technicians: ["Alex"],
        },
      ],
    }),
  /ambigu/
);
assert.throws(() => evidenceDate("2026-99-99"), /Date civile/);
assert.equal(
  normalizeVisit({
    workPerformed: "Duplicate spelling",
    segments: [
      {
        date: "2016-01-22",
        start: "11:00",
        end: "13:00",
        technicians: ["Alex", "ALEX"],
      },
    ],
  }).laborMinutes,
  120
);
assert.equal(
  cases
    .snapshot(id, { workOrderId: wo.id })
    .records.find((r) => r.id === blocker.id).revision,
  2
);
assert.throws(
  () =>
    cases.resolveBlocker(id, {
      id: blocker.id,
      revision: 2,
      resolution: "Again",
    }),
  /plus/
);
const follow = cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "blocker",
  data: {
    type: "return_visit",
    reason: "Observe operation",
    owner: "Alex",
    nextAction: "Return to inspect",
    dueDate: "2026-01-01",
  },
});
assert.ok(
  maintenance
    .snapshot(id, { now: Date.parse("2026-10-22") })
    .obligations.some(
      (o) => o.kind === "casework_followup" && o.status === "late"
    )
);
cases.resolveBlocker(id, {
  id: follow.id,
  revision: 1,
  resolution: "Inspection complete",
});
assert.equal(
  cases
    .assetHistory(id, { assetId: donor.id })
    .records.filter((r) => r.kind === "part").length,
  1
);
assert.equal(
  cases
    .assetHistory(id, { assetId: b.id })
    .records.filter((r) => r.kind === "part").length,
  1
);
assert.equal(
  cases
    .assetHistory(id, { assetId: a.id })
    .records.filter((r) => r.kind === "part").length,
  0
);
const stockItem = purchasing.saveItem(id, {
  name: "Motor",
  sku: "M-1",
  unit: "unit",
});
purchasing.stockMove(id, {
  itemId: stockItem.id,
  type: "receive",
  quantity: 2,
  reference: "Delivery",
  confirmed: true,
});
const move = purchasing.stockMove(id, {
  itemId: stockItem.id,
  type: "consume",
  quantity: 1,
  reference: "Repair",
  confirmed: true,
});
cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "part",
  data: { ...part, origin: "stock", stockMovementId: move.id },
});
assert.throws(
  () =>
    cases.saveRecord(id, {
      workOrderId: wo.id,
      kind: "part",
      data: { ...part, origin: "stock", stockMovementId: move.id },
    }),
  /déjà/
);
assert.equal(
  purchasing.snapshot(id).items.find((i) => i.id === stockItem.id).onHand,
  1
);
gmao.addEvent(id, wo.id, {
  eventType: "stock_update",
  evidence: {
    movementId: "forged",
    requestId: "fake",
    type: "consume",
    quantity: 1,
  },
});
assert.ok(
  !cases
    .stockMovements(id, { workOrderId: wo.id })
    .movements.some((m) => m.id === "forged")
);
// A real shared purchasing receipt is usable without exposing the buyer's stock.
const buyerId = "casework-buyer";
companies.save({
  ...makeCharter({ name: "Parts team", mission: "Synthetic purchasing" }),
  id: buyerId,
  status: "active",
  roles: { PurchasingManager: { companion: "fixture-buyer" } },
});
const sharedProcurement = gmao.saveProcurement(id, {
  workOrderId: wo.id,
  targetTeamId: buyerId,
  description: "Shared replacement motor",
  items: [{ label: "Replacement motor", quantity: 1 }],
});
const sharedRequest = purchasing
  .snapshot(buyerId)
  .requests.find((r) => r.sourceProcurementId === sharedProcurement.id);
const sharedItem = purchasing.saveItem(buyerId, {
  name: "Replacement motor",
  sku: "SHARED-1",
});
purchasing.saveRequest(buyerId, {
  id: sharedRequest.id,
  revision: sharedRequest.revision,
  type: "intervention",
  title: sharedRequest.title,
  items: sharedRequest.items.map((item) => ({
    ...item,
    itemId: sharedItem.id,
  })),
});
purchasing.stockMove(buyerId, {
  itemId: sharedItem.id,
  type: "receive",
  quantity: 2,
  reference: "Depot receipt",
  confirmed: true,
});
const sharedMove = purchasing.stockMove(buyerId, {
  itemId: sharedItem.id,
  requestId: sharedRequest.id,
  type: "consume",
  quantity: 1,
  reference: "Shared issue",
  confirmed: true,
});
assert.ok(
  cases
    .stockMovements(id, { workOrderId: wo.id })
    .movements.some((m) => m.id === sharedMove.id && m.shared)
);
const sharedPart = cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "part",
  data: {
    name: "Replacement motor",
    origin: "stock",
    quantity: 1,
    owner: "Contractor",
    condition: "New",
    recipientAssetId: b.id,
    stockMovementId: sharedMove.id,
    unitCostCents: 0,
  },
});
assert.equal(sharedPart.stockReceipt.movementReference, sharedMove.id);
assert.equal(
  sharedPart.stockMovementId,
  null,
  "shared receipt must not become an inaccessible foreign key"
);
const unrelated = gmao.createWorkOrder(id, {
  siteId: site.id,
  title: "Unrelated intervention",
});
assert.ok(
  !cases
    .stockMovements(id, { workOrderId: unrelated.id })
    .movements.some((m) => m.id === sharedMove.id)
);
assert.throws(
  () =>
    cases.saveRecord(id, {
      workOrderId: wo.id,
      kind: "part",
      data: { ...sharedPart, stockMovementId: sharedMove.id },
    }),
  /déjà/
);
assert.equal(
  cases.partCostSummary(id, { workOrderId: wo.id }).partsCents,
  null,
  "unknown reused cost must not become zero"
);

// Archive review is independent of live state, stock, billing and notifications.
function source(text, name = "scan.pdf") {
  const blob = blobs.write(Buffer.from(text), "pdf", {
    source: "company-intake",
    sourceId: id,
  });
  return intake.ingest(id, {
    name,
    blobId: blob.id,
    ext: "pdf",
    chunks: [text],
    mode: "historical",
  });
}
const input = {
  title: "Historical operation",
  site: "North depot",
  occurredOn: "2016-09-23",
  references: [
    { type: "DI", value: "02210", issuer: "Customer", year: 2016 },
    { type: "BON", value: "B-66389", issuer: "Contractor", year: 2016 },
  ],
  equipment: [
    { assetId: a.id, label: "Unit A", outcome: "out_of_service" },
    { assetId: b.id, label: "Unit B", outcome: "operational" },
  ],
  visits: [
    {
      workPerformed: "Motor reused",
      duration: "1,5 h",
      durationBasis: "unspecified",
    },
  ],
  parts: [part],
  fluids: [fluid],
  signatures: [
    { role: "technician", status: "present", name: "Alex" },
    { role: "contract_manager", status: "absent" },
  ],
};
const before = Object.fromEntries(
  [
    "gmao_work_orders",
    "gmao_procurements",
    "gmao_quotes",
    "gmao_outbox",
    "purchasing_records",
    "issues",
  ].map((t) => [t, db.prepare(`SELECT count(*) n FROM ${t}`).get().n])
);
const src = source(
  "Bon d’intervention B-66389. Opération réalisée le 23/09/2016."
);
const history = cases.importHistory(id, {
  sourceId: src.id,
  data: input,
  confirmed: true,
});
assert.equal(history.documents[0].occurredOn, "2016-09-23");
assert.equal(
  cases.importHistory(id, { sourceId: src.id, data: input, confirmed: true })
    .id,
  history.id
);
const second = source("Second scan of the SAME operation");
assert.throws(
  () =>
    cases.importHistory(id, {
      sourceId: second.id,
      data: input,
      confirmed: true,
    }),
  /Rapprochement/
);
const merged = cases.importHistory(id, {
  sourceId: second.id,
  data: input,
  targetRecordId: history.id,
  confirmed: true,
});
assert.equal(merged.documents.length, 2);
assert.deepEqual(
  Object.fromEntries(
    Object.keys(before).map((t) => [
      t,
      db.prepare(`SELECT count(*) n FROM ${t}`).get().n,
    ])
  ),
  before
);
assert.equal(
  cases.findMatches(id, {
    siteId: site.id,
    references: [
      { type: "DI", value: "02210", issuer: "Customer", year: 2017 },
    ],
  }).length,
  0
);
assert.equal(
  cases.findMatches(id, { siteId: south.id, references: input.references })
    .length,
  0
);
assert.throws(() =>
  cases.importHistory("other-casework", {
    sourceId: src.id,
    data: input,
    confirmed: true,
  })
);
const liveRef = cases.saveRecord(id, {
  workOrderId: wo.id,
  kind: "reference",
  data: { type: "DI", value: "LIVE-56", issuer: "Customer", year: 2026 },
});
const linkedArchive = cases.importHistory(id, {
  sourceId: source("Archive of existing work order").id,
  data: {
    title: "Existing dossier scan",
    site: "North depot",
    references: [
      { type: "DI", value: "LIVE-56", issuer: "Customer", year: 2026 },
    ],
  },
  targetRecordId: liveRef.id,
  confirmed: true,
});
assert.equal(linkedArchive.workOrderId, wo.id);
assert.equal(gmao.getWorkOrder(id, wo.id).status, wo.status);
const uncertain = normalizeMaintenanceDocument({
  title: "Illegible scan",
  site: "North depot",
  visits: [
    {
      workPerformed: "Inspection",
      segments: [
        { date: "2016-01-22", start: "11:00", end: "13:00", technicians: [] },
      ],
    },
  ],
  blockers: [{ type: "expert", reason: "Report pending" }],
  parts: [{ name: "Used motor", origin: "reused", quantity: 1 }],
  sourceLocations: [
    { field: "visa", page: 1, state: "blank", region: [0.1, 0.2, 0.3, 0.2] },
  ],
});
assert.equal(uncertain.visits[0].laborMinutes, null);
assert.equal(uncertain.blockers[0].dueDate, null);
assert.equal(uncertain.parts[0].unitCostCents, null);
assert.throws(
  () =>
    normalizeMaintenanceDocument({
      ...uncertain,
      sourceLocations: [
        { field: "visa", page: 1, region: [0.9, 0.1, 0.3, 0.2] },
      ],
    }),
  /hors page/
);
assert.ok(
  cases
    .findMatches(id, {
      siteId: site.id,
      occurredOn: input.occurredOn,
      title: input.title,
    })
    .some((r) => r.matchKind === "suggested")
);
const currentCopy = intake.ingest(id, {
  name: src.name,
  blobId: src.blobId,
  ext: "pdf",
  chunks: ["Current source"],
});
assert.notEqual(
  currentCopy.id,
  src.id,
  "archive mode cannot inherit live effects through hash deduplication"
);
const manual = source("Unreadable handwriting");
let prepared = intake.prepareArchive(id, { id: manual.id });
assert.equal(prepared.actions[0].status, "review");
prepared = intake.review(id, {
  actionId: prepared.actions[0].id,
  revision: prepared.actions[0].revision,
  confirmed: true,
  decision: "apply",
  data: { ...uncertain, sourceLocations: uncertain.sourceLocations },
});
assert.equal(prepared.status, "completed");
const checkpointSource = intake.ingest(id, {
  name: "Long scan.pdf",
  blobId: blobs.write(Buffer.from("multi-page original"), "pdf").id,
  ext: "pdf",
  needsExtraction: true,
  chunks: [""],
  mode: "historical",
});
let extraction = intake.claim(id);
while (extraction && extraction.id !== checkpointSource.id) {
  intake.finish(id, {
    id: extraction.id,
    lease: extraction.lease,
    actions: [],
  });
  extraction = intake.claim(id);
}
intake.checkpoint(id, {
  id: extraction.id,
  lease: extraction.lease,
  page: { page: 1, total: 2, text: "Page one OCR", method: "ocr" },
});
intake.fail(id, {
  id: extraction.id,
  lease: extraction.lease,
  error: "Interrupted",
});
intake.retry(id, { id: extraction.id });
extraction = intake.claim(id);
assert.equal(extraction.pages[0].text, "Page one OCR");
intake.extracted(id, {
  id: extraction.id,
  lease: extraction.lease,
  chunks: ["Page one OCR. Page two OCR."],
});
// Review path: even high confidence completed-work data cannot apply itself.
const reviewSource = source(
  "Demande d’intervention completed historical evidence",
  "review.pdf"
);
let job = intake.claim(id);
while (job && job.id !== reviewSource.id) {
  intake.finish(id, { id: job.id, lease: job.lease, actions: [] });
  job = intake.claim(id);
}
let result = intake.finish(id, {
  id: job.id,
  lease: job.lease,
  actions: [
    {
      type: "maintenance_document",
      confidence: 1,
      evidence: "completed historical evidence",
      data: {
        ...input,
        references: [
          { type: "DI", value: "NEW-55", issuer: "Customer", year: 2016 },
        ],
      },
    },
  ],
});
assert.equal(result.actions[0].status, "review");
result = intake.review(id, {
  actionId: result.actions[0].id,
  revision: result.actions[0].revision,
  decision: "apply",
  confirmed: true,
  data: result.actions[0].data.data,
});
assert.equal(result.actions[0].status, "applied");
// Pricing is selected by effective date; each unknown amount fails closed.
const client = ops.saveClient(id, {
    name: "Fixture client",
    email: "customer@example.invalid",
  }),
  contract = ops.saveServiceContract(id, {
    clientId: client.id,
    name: "Annual contract",
    reference: "CT-1",
  });
const profile = {
  reference: "CT-1 amendment",
  validatedBy: "Manager",
  effectiveFrom: "2026-01-01",
  effectiveUntil: "2026-12-31",
  coefficient: 1.2,
  includedLaborHours: 2,
  travelIncluded: false,
  accessAboveThreshold: "billable",
  allIncludedBelowThreshold: false,
  vatRate: 20,
  rules: [
    { id: "ac", section: "ST1", label: "Cooling", thresholdCents: 10000 },
  ],
};
const version = cases.savePricingVersion(id, {
  contractId: contract.id,
  version: 1,
  profile,
  confirmed: true,
});
const priced = {
  costEvidence: {
    parts: "Supplier quotation SYN-1",
    labor: "Reviewed time and rate sheet",
    travel: "Contract annex B",
    access: "Lift hire quotation SYN-2",
  },
  pricingDate: "2026-10-22",
  pricingCategory: "ac",
  partsCents: 30000,
  laborCents: 40000,
  laborHours: 4,
  travelCents: 5000,
  accessCents: 1000,
};
const amount = calculateContractQuote(priced, version.profile, {
  technicalSection: "ST1",
});
assert.equal(amount.subtotalCents, 50000);
assert.equal(amount.totalCents, 60000);
assert.throws(() =>
  calculateContractQuote({ ...priced, partsCents: null }, version.profile, {
    technicalSection: "ST1",
  })
);
assert.equal(cases.pricingFor(id, contract.id, "2016-01-22"), null);
assert.throws(
  () =>
    cases.savePricingVersion(id, {
      contractId: contract.id,
      version: 2,
      profile,
      confirmed: true,
    }),
  /chevauche/
);
assert.equal(
  classifyGmaoDocument({
    filename: "DEVIS COMPRESSEUR.pdf",
    text: "DEMANDE D’INTERVENTION\nN° SILLAGE :\nDI : 02486\nFournisseur\nTotal TTC",
  }).documentType,
  "work_order"
);
assert.equal(
  classifyGmaoDocument({
    text: "BON D’INTERVENTION\nTotal TTC\nSignature technicien",
  }).documentType,
  "attachment_sheet"
);
// Folders + ZIP copies are idempotent and failures do not stop other files.
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "bonzai-case-batch-"));
try {
  fs.mkdirSync(path.join(folder, "nested"));
  fs.writeFileSync(
    path.join(folder, "nested", "one.txt"),
    "synthetic operation"
  );
  fs.writeFileSync(path.join(folder, "unknown.bin"), "skip");
  const zip = new AdmZip();
  zip.addFile("copy.txt", Buffer.from("synthetic operation"));
  zip.writeZip(path.join(folder, "copies.zip"));
  const batch = await importBatch(id, [folder], { mode: "historical" });
  assert.equal(batch.items.filter((i) => i.status === "saved").length, 1);
  assert.equal(batch.items.filter((i) => i.status === "duplicate").length, 1);
  assert.equal(batch.items.filter((i) => i.status === "skipped").length, 1);
  const damaged = path.join(folder, "damaged.zip"),
    oversized = path.join(folder, "oversized.pdf"),
    link = path.join(folder, "linked.txt"),
    survivor = path.join(folder, "survivor.txt");
  fs.writeFileSync(damaged, "not a ZIP archive");
  fs.writeFileSync(oversized, "");
  fs.truncateSync(oversized, 31 * 1024 * 1024);
  fs.symlinkSync(path.join(folder, "nested", "one.txt"), link);
  fs.writeFileSync(survivor, "independent original after rejected files");
  const isolated = await importBatch(
    id,
    [path.join(folder, "removed.pdf"), damaged, oversized, link, survivor],
    { mode: "historical" }
  );
  assert.equal(isolated.status, "review");
  assert.equal(isolated.items.filter((i) => i.status === "failed").length, 3);
  assert.equal(isolated.items.filter((i) => i.status === "skipped").length, 1);
  assert.equal(
    isolated.items.at(-1).status,
    "saved",
    "one missing or invalid source must not stop the batch"
  );
} finally {
  fs.rmSync(folder, { recursive: true, force: true });
}
// Full deterministic financial chain with custom rates and mocked transport only.
const pricedSite = gmao.saveSite(id, {
  name: "Priced site",
  trigram: "PCE",
  clientId: client.id,
  serviceContractId: contract.id,
});
const pricedAsset = gmao.saveAsset(id, {
  siteId: pricedSite.id,
  assetCode: "AC-1",
  equipmentType: "climat",
  technicalSection: "ST1",
});
const financial = gmao.createWorkOrder(id, {
  siteId: pricedSite.id,
  assetId: pricedAsset.id,
  title: "Contract-priced repair",
  assigneeHuman: "Morgan",
  reportedAt: Date.parse("2026-10-22T08:00:00Z"),
});
cases.saveRecord(id, {
  workOrderId: financial.id,
  kind: "part",
  data: {
    name: "Customer motor",
    origin: "customer_supplied",
    quantity: 1,
    owner: "Customer",
    condition: "Used",
    recipientAssetId: pricedAsset.id,
  },
});
cases.saveRecord(id, {
  workOrderId: financial.id,
  kind: "part",
  data: {
    name: "Purchased unit",
    origin: "purchased",
    quantity: 1,
    owner: "Contractor",
    condition: "New",
    unitCostCents: 30000,
    recipientAssetId: pricedAsset.id,
  },
});
assert.equal(
  cases.partCostSummary(id, { workOrderId: financial.id }).partsCents,
  30000,
  "customer motor is not billed as a purchased part"
);
const fromParts = gmao.createQuote(id, financial.id, {
  ...priced,
  partsCents: 999999,
  partsFromEvidence: true,
  quoteType: "outside_bpu",
});
assert.equal(
  fromParts.totalCents,
  60000,
  "backend recalculates selected evidence instead of trusting UI totals"
);
const quote = gmao.createQuote(id, financial.id, {
  ...priced,
  quoteType: "outside_bpu",
});
assert.equal(quote.totalCents, 60000);
assert.throws(
  () =>
    gmao.createQuote(id, financial.id, {
      ...priced,
      costEvidence: {},
      quoteType: "outside_bpu",
    }),
  /justificatif/
);
assert.throws(
  () =>
    gmao.createQuote(id, financial.id, {
      ...priced,
      partsCents: undefined,
      quoteType: "outside_bpu",
    }),
  /coûts/
);
const service = createDeliveryService({
  printPdf: async (html) => {
    assert.ok(!html.includes("au-delà de 8 h"));
    return Buffer.from("%PDF-1.4 synthetic " + html);
  },
  request: async () => ({
    status: 202,
    headers: { "x-message-id": "mock-transport" },
  }),
});
db.prepare(
  "INSERT INTO connectors(id,company_id,kind,label,auth_type,scopes,account_identifier,status,created_at,updated_at) VALUES('casework-mail',?,'sendgrid','Email','api-key','[]','sender@example.invalid','active',?,?)"
).run(id, Date.now(), Date.now());
const pdf = await service.generateDocument(id, {
  kind: "quote",
  workOrderId: financial.id,
  recordId: quote.id,
});
async function send(subject, documentId = null) {
  const draft = ops.saveOutbox(id, {
    workOrderId: financial.id,
    channel: "email",
    sender: "sender@example.invalid",
    recipient: "customer@example.invalid",
    subject,
    message: subject,
    documentId,
    requestKey: subject,
  });
  await service.sendOutbox(id, draft.id, {
    confirmed: true,
    revision: draft.revision,
  });
  return draft;
}
await send("Quote", pdf.id);
gmao.updateQuote(id, quote.id, {
  status: "accepted",
  evidenceReference: "Signed quotation",
});
gmao.updateQuote(id, quote.id, {
  status: "purchase_order_received",
  purchaseOrder: "BC-FIXTURE",
  evidenceReference: "Purchase order copy",
});
const signedBlob = blobs.write(Buffer.from("%PDF-1.4 PO evidence"), "pdf");
const signed = gmao.addDocument(id, {
  workOrderId: financial.id,
  category: "signed_purchase_order",
  filename: "PO.pdf",
  blobId: signedBlob.id,
  blobExt: "pdf",
});
gmao.validateProcessStep(id, financial.id, {
  step: "purchase_order_signed",
  documentId: signed.id,
  signer: "Manager",
  confirmed: true,
});
const returned = await send("Signed PO", signed.id);
gmao.validateProcessStep(id, financial.id, {
  step: "purchase_order_returned",
  outboxId: returned.id,
  confirmed: true,
});
for (const status of ["triaged", "assigned", "acknowledged", "on_site"])
  gmao.transitionWorkOrder(id, financial.id, status, {
    assigneeHuman: "Morgan",
  });
const pendingEquipment = cases.saveRecord(id, {
  workOrderId: financial.id,
  kind: "equipment",
  data: {
    assetId: pricedAsset.id,
    label: "Cooling unit",
    outcome: "out_of_service",
  },
});
assert.throws(
  () =>
    gmao.recordAttachmentSheet(id, financial.id, {
      technicianName: "Morgan",
      workPerformed: "Partial repair",
      resolved: true,
    }),
  /partielle/
);
assert.equal(gmao.getWorkOrder(id, financial.id).status, "on_site");
cases.saveRecord(id, {
  id: pendingEquipment.id,
  revision: 1,
  workOrderId: financial.id,
  kind: "equipment",
  data: { ...pendingEquipment, outcome: "operational" },
});
gmao.recordAttachmentSheet(id, financial.id, {
  technicianName: "Morgan",
  workPerformed: "Repair and test",
  resolved: true,
});
const sf = await send("Request service acceptance");
gmao.validateProcessStep(id, financial.id, {
  step: "service_acceptance_requested",
  outboxId: sf.id,
  confirmed: true,
});
gmao.recordServiceAcceptance(id, financial.id, {
  reference: "SF-FIXTURE",
  customerSignatory: "Client",
});
gmao.validateProcessStep(id, financial.id, {
  step: "billing_requested",
  confirmed: true,
});
const invoice = gmao.saveInvoice(id, {
  workOrderId: financial.id,
  quoteId: quote.id,
});
assert.equal(invoice.totalCents, 60000);
assert.equal(invoice.vatCents, 10000);
const fluidFollow = cases.saveRecord(id, {
  workOrderId: financial.id,
  kind: "fluid",
  data: { ...fluid, followupDate: "2026-10-23" },
});
assert.ok(
  maintenance
    .snapshot(id)
    .obligations.some((o) => o.recordId === fluidFollow.id)
);
cases.resolveFluidFollowup(id, {
  id: fluidFollow.id,
  revision: 1,
  resolution: "Follow-up report received; original finding retained",
  documentId: signed.id,
});
assert.ok(
  !maintenance
    .snapshot(id)
    .obligations.some((o) => o.recordId === fluidFollow.id)
);
assert.equal(
  cases
    .snapshot(id, { workOrderId: financial.id })
    .records.find((r) => r.id === fluidFollow.id).leakResult,
  "not_found"
);
const amendment = cases.savePricingVersion(id, {
  contractId: contract.id,
  version: 2,
  supersedes: version.id,
  profile: { ...profile, effectiveFrom: "2026-11-01", coefficient: 1.5 },
  confirmed: true,
});
assert.equal(cases.pricingFor(id, contract.id, "2026-10-22").version, 1);
assert.equal(cases.pricingFor(id, contract.id, "2026-11-01").version, 2);
assert.equal(
  gmao.snapshot(id).quotes.find((q) => q.id === quote.id).totalCents,
  60000,
  "later amendment must not reprice an issued quote"
);
const dossier = ops.getDossier(id, wo.id);
const html = documentHtml({
  kind: "intervention",
  record: {},
  dossier,
  issuer: "Fixture",
});
assert.ok(html.includes("Two-unit repair"));
assert.ok(html.includes("Fluides et suivi"));
assert.ok(html.includes("135 min"));
assert.ok(html.includes("Réemploi"));
if (process.env.CMMS_REPORT_OUTPUT)
  fs.writeFileSync(process.env.CMMS_REPORT_OUTPUT, html);
const bundle = portability.exportBundle(id);
assert.ok(bundle.tables.gmao_case_records.length > 0);
const restored = portability.importBundle(bundle);
assert.ok(restored);
const restoredSite = gmao
  .snapshot(restored.id)
  .sites.find((s) => s.trigram === "NTH");
assert.equal(
  cases.findMatches(restored.id, {
    siteId: restoredSite.id,
    references: input.references,
  }).length,
  1,
  "reference scope survives backup ID remapping"
);

console.log(
  "CMMS audit acceptance passed: archives, scopes, evidence, labor, reuse, fluids, blockers, pricing, batch imports and restore. No live sends."
);
