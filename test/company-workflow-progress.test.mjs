import test from "node:test";
import assert from "node:assert/strict";
import { taskProgress } from "../src/services/company/workflowProgress.js";
import {
  interventionProgress,
  GAS_CONTRACT_TERMS,
  calculateGasContractQuote,
  gasProfileApplies,
} from "../src/services/company/gmaoProcess.js";
import {
  mapInventorySheets,
  readInventoryFile,
} from "../src/services/company/inventoryImport.js";
import { PDFDocument } from "pdf-lib";
import { applyPdfSignature } from "../src/services/company/pdfSignature.js";
import * as XLSX from "xlsx";

test("task progress never treats a draft, approval wait or missing receipt as successful work", () => {
  const done = (s) => s.find((s) => s.id === "result").status;
  assert.equal(done(taskProgress({ status: "open" })), "pending");
  assert.equal(done(taskProgress({ status: "done" })), "blocked");
  const execution = { steps: [{ id: "send", status: "waiting_approval" }] };
  assert.equal(
    taskProgress({ status: "queued", execution }).find(
      (s) => s.id === "approval",
    ).status,
    "waiting",
  );
  execution.steps[0].status = "completed";
  execution.agent = { status: "running" };
  assert.notEqual(done(taskProgress({ status: "done", execution })), "done");
  execution.agent.status = "complete";
  assert.equal(done(taskProgress({ status: "done", execution })), "done");
  execution.agent = {
    status: "waiting_owner",
    wait: { question: "Which client?" },
  };
  assert.ok(
    taskProgress({ status: "blocked", execution }).some(
      (s) => s.status === "waiting" && s.detail === "Which client?",
    ),
  );
});

test("OI stages keep technician completion, SF, billing and manager closure separate", () => {
  const wo = {
    id: "oi",
    status: "restored",
    receiptConfirmedAt: 1,
    repairMode: "with_quote",
    purchaseOrder: "PO1",
  };
  const events = [
    {
      workOrderId: "oi",
      eventType: "process_purchase_order_returned",
      evidence: { purchaseOrder: "PO1" },
    },
  ];
  const data = {
    events,
    attachments: [{ workOrderId: "oi" }],
    quotes: [{ workOrderId: "oi", status: "purchase_order_received" }],
    procurements: [{ workOrderId: "oi", proformaReceivedAt: 1 }],
  };
  assert.equal(
    interventionProgress(wo, data).action,
    "service_acceptance_requested",
  );
  events.push({
    workOrderId: "oi",
    eventType: "process_service_acceptance_requested",
    evidence: { purchaseOrder: "OLD" },
  });
  assert.equal(
    interventionProgress(wo, data).action,
    "service_acceptance_requested",
    "old PO proof cannot validate a new PO",
  );
  events.push({
    workOrderId: "oi",
    eventType: "process_service_acceptance_requested",
    evidence: { purchaseOrder: "PO1" },
  });
  assert.equal(interventionProgress(wo, data).code, "service");
  wo.serviceAcceptanceReceivedAt = 2;
  assert.equal(interventionProgress(wo, data).action, "billing_requested");
  events.push({ workOrderId: "oi", eventType: "process_billing_requested" });
  assert.equal(interventionProgress(wo, data).code, "billing");
  assert.equal(interventionProgress(wo, data).stages.at(-1).status, "active");
  wo.status = "completed";
  wo.closureStatus = "closed";
  assert.ok(
    interventionProgress(wo, data).stages.every((s) => s.status === "done"),
  );
  const direct = interventionProgress(
    { id: "other", status: "restored", receiptConfirmedAt: 1 },
    { attachments: [{ workOrderId: "other" }] },
  );
  assert.equal(direct.action, "close");
  assert.equal(direct.stages.length, 4);
});

const profile = {
  ...GAS_CONTRACT_TERMS,
  validatedAt: 1,
  validatedBy: "Contract owner",
  technicalSection: "ST3",
};
test("gas quote preserves the distinct €300 threshold, €350 deduction and eight-hour allowance", () => {
  const input = {
    quoteType: "outside_bpu",
    partsCents: 30000,
    laborCents: 120000,
    travelCents: 7500,
    accessCents: 10000,
    laborHours: 12,
    vatRate: 20,
  };
  const free = calculateGasContractQuote(input, profile);
  assert.equal(free.totalCents, 0);
  assert.ok(Number.isFinite(free.includedLaborCents));
  const quote = calculateGasContractQuote(
    { ...input, partsCents: 50000 },
    profile,
  );
  assert.equal(quote.includedLaborCents, 80000);
  assert.equal(quote.subtotalCents, 65000);
  assert.equal(quote.totalCents, 78000);
  assert.equal(
    calculateGasContractQuote(
      { ...input, partsCents: 30001, laborCents: 0, accessCents: 0 },
      profile,
    ).subtotalCents,
    0,
  );
  assert.throws(
    () => calculateGasContractQuote(input, { ...profile, validatedAt: null }),
    /Validez/,
  );
  assert.throws(
    () =>
      calculateGasContractQuote(
        { ...input, partsCents: 40000, laborHours: 0 },
        profile,
      ),
    /heures/,
  );
  assert.throws(
    () =>
      gasProfileApplies(profile, {
        domainCode: "REG",
        technicalSection: "ST4",
      }),
    /section/,
  );
  assert.equal(
    gasProfileApplies(profile, { domainCode: "ESP", technicalSection: "ST3" }),
    false,
  );
  assert.throws(() => gasProfileApplies(profile, null), /appareil/);
});

const headers = [
  "N° immeuble",
  "Immeuble en clair",
  "N° batiment",
  "Batiment",
  "Numéro de l'équipement",
  "Nature du fluide",
  "Equipements",
  "Marque",
  "Référence",
  "N° série",
  "Contenance",
  "Longueur du réseau (ml)",
  "Année de mise en service",
  "prochaine requalification",
  "Etat de fonctionnement de l'équipement *",
  "Photo",
  "Commentaires",
];
const sheets = [
  {
    name: "AAA",
    rows: [
      ["Inventaire ESP"],
      [],
      headers,
      [
        "1",
        "Site A",
        "007",
        "B",
        "ESP-01",
        "air",
        "Compresseur",
        "Maker",
        "",
        "",
        "250 l",
        "",
        new Date("2018-10-25T00:00:00Z"),
      ],
      ["", "", "", "", "", "", "Réservoir supplémentaire", "", "", "", "100 l"],
    ],
  },
  {
    name: "BBB",
    rows: [
      headers,
      ["2", "Site B", "002", "", "", "gaz", "Régulateur", "", "", "", "", "16"],
    ],
  },
];
const sites = [
  { id: "a", trigram: "AAA" },
  { id: "b", trigram: "BBB" },
];
test("multi-sheet inventories keep components, dates, missing references and source coordinates", async () => {
  const rows = mapInventorySheets(sheets, sites, "inventaire esp.xls");
  assert.equal(rows.length, 3);
  assert.equal(rows[0].buildingCode, "007");
  assert.equal(rows[0].metadata.commissionedAtSource, "2018-10-25");
  assert.equal(rows[1].metadata.parentAssetCode, "ESP-01");
  assert.equal(rows[1].metadata.inventorySource.referenceProvided, false);
  assert.equal(rows[1].serialNumber, "");
  assert.equal(rows[1].condition, "unknown");
  assert.equal(rows[2].metadata.networkLengthMeters, 16);
  assert.equal(rows[2].metadata.inventorySource.sheet, "BBB");
  assert.throws(() => mapInventorySheets(sheets, [], "source.xls"), /ambigu/);
  const book = XLSX.utils.book_new();
  for (const s of sheets)
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet(s.rows, { cellDates: true }),
      s.name,
    );
  for (const bookType of ["biff8", "xlsx"]) {
    const bytes = XLSX.write(book, { type: "buffer", bookType });
    const file = {
      name: "inventaire esp.xls",
      size: bytes.length,
      arrayBuffer: async () => bytes,
    };
    const parsed = await readInventoryFile(file, sites);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].metadata.commissionedAtSource, "2018-10-25");
    assert.equal(parsed[1].metadata.parentAssetCode, "ESP-01");
  }
});

test("signing creates a PDF copy with unchanged pages and rejects off-page placement", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  doc.addPage([600, 800]);
  const bytes = await doc.save(),
    original = bytes.slice();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  );
  const signed = await applyPdfSignature(bytes, {
    pageIndex: 1,
    x: 50,
    y: 50,
    width: 180,
    height: 60,
    png,
  });
  assert.deepEqual(bytes, original);
  const result = await PDFDocument.load(signed);
  assert.equal(result.getPageCount(), 2);
  assert.ok(signed.length > bytes.length);
  await assert.rejects(
    () =>
      applyPdfSignature(bytes, {
        pageIndex: 2,
        x: 1,
        y: 1,
        width: 1,
        height: 1,
        png,
      }),
    /Page/,
  );
  await assert.rejects(
    () =>
      applyPdfSignature(bytes, {
        pageIndex: 0,
        x: 550,
        y: 1,
        width: 180,
        height: 60,
        png,
      }),
    /page/,
  );
});
