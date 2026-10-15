import test from "node:test";
import assert from "node:assert/strict";
import {
  addWorkingHours,
  reportDeadline,
  localTimestamp,
  regulatoryDates,
  equipmentMetrics,
  scheduledReportDeadlines,
  accessFailures,
  openingIntervals,
} from "../src/services/company/maintenanceRules.js";
import { mapMaintenanceSheets } from "../src/services/company/maintenanceImport.js";
import {
  mapInventorySheets,
  readInventoryFile,
} from "../src/services/company/inventoryImport.js";
import { monographicHtml } from "../src/services/company/maintenanceDocuments.js";
import { assertReadablePdfForm } from "../src/services/company/pdfTextGuard.js";
import * as XLSX from "xlsx";
const hour = 3600000,
  day = 24 * hour,
  policy = {
    calendarValidated: true,
    workingDays: [1, 2, 3, 4, 5],
    holidays: [],
    timezone: "Europe/Paris",
    onCallReportHour: 9,
  };
test("report deadlines distinguish calendar/working hours and next morning through DST", () => {
  const restoredAt = Date.parse("2026-10-23T14:30:00Z");
  assert.equal(
    new Date(addWorkingHours(restoredAt, 48, policy)).toISOString(),
    "2026-10-27T15:30:00.000Z",
  );
  assert.equal(
    reportDeadline({ restoredAt }, "ST2", policy).dueAt,
    restoredAt + 48 * hour,
  );
  assert.equal(
    reportDeadline({ restoredAt }, "ST1", { timezone: "Europe/Paris" }).dueAt,
    null,
  );
  assert.equal(
    new Date(
      reportDeadline(
        { restoredAt: Date.parse("2026-10-24T22:30Z"), onCall: true },
        "ST1",
        policy,
      ).dueAt,
    ).toISOString(),
    "2026-10-26T08:00:00.000Z",
  );
  const holidays = { ...policy, holidays: ["2026-10-26"] };
  assert.equal(
    new Date(addWorkingHours(restoredAt, 48, holidays)).toISOString(),
    "2026-10-28T15:30:00.000Z",
  );
});
test("regulatory dates retain real last inspections and leap-month limits", () => {
  const at = Date.parse("2024-02-29T12:00:00Z"),
    d = regulatoryDates({
      lastInspectionAt: at,
      lastRequalificationAt: at,
      lastGasServiceAt: at,
    });
  assert.equal(
    new Date(d.inspectionDueAt).toISOString(),
    "2028-02-29T12:00:00.000Z",
  );
  assert.equal(
    new Date(d.requalificationDueAt).toISOString(),
    "2034-02-28T12:00:00.000Z",
  );
  assert.equal(
    new Date(d.gasServiceDueAt).toISOString(),
    "2025-02-28T12:00:00.000Z",
  );
  assert.equal(regulatoryDates({}).inspectionDueAt, null);
});
test("availability does not double-count overlap or invent an operating-hours denominator", () => {
  const w = [
    {
      type: "corrective",
      reportedAt: 1,
      interventionStartedAt: hour,
      restoredAt: 3 * hour,
      unavailableFrom: hour,
      unavailableUntil: 3 * hour,
    },
    {
      type: "preventive",
      unavailableFrom: 2 * hour,
      unavailableUntil: 4 * hour,
    },
  ];
  assert.equal(equipmentMetrics(w, 0, 8 * hour).availabilityPct, null);
  assert.deepEqual(equipmentMetrics(w, 0, 8 * hour, 8), {
    failureCount: 1,
    downtimeHours: 3,
    mttrHours: 2,
    mtbfHours: 5,
    availabilityPct: 62.5,
  });
});
test("weekly deadline backlog retains unsent earlier periods from activation", () => {
  const p = {
    ...policy,
    enabled: true,
    activatedAt: Date.parse("2026-10-01T00:00Z"),
    equipmentReportCadence: "weekly",
    periodicReportHour: 17,
  };
  const reports = scheduledReportDeadlines(
    Date.parse("2026-10-20T12:00Z"),
    p,
    "s",
  );
  assert.ok(reports.some((r) => r.period === "2026-10-01"));
  assert.ok(reports.some((r) => r.period === "2026-10-22"));
  assert.ok(reports.every((r) => r.dueAt >= p.activatedAt));
  assert.equal(
    new Date(localTimestamp("2026-10-22", 17, policy.timezone)).toISOString(),
    "2026-10-22T15:00:00.000Z",
  );
});
test("dynamic CPR fallback cannot become misleading model input", () => {
  for (const input of [
    { isPureXfa: true },
    { info: { IsXFAPresent: true } },
    {
      text: "Please wait... If this message is not eventually replaced by the proper contents of the document, your PDF viewer may not be able to display this type of document.",
    },
  ])
    assert.throws(
      () => assertReadablePdfForm(input),
      (e) => e.code === "PDF_XFA_REVIEW_REQUIRED",
    );
  assert.doesNotThrow(() =>
    assertReadablePdfForm({
      text: "Please wait at the security gate. Present the completed CPR.",
    }),
  );
});
test("maintenance matrix separates exact frequencies and conditional operations", () => {
  const rows = [
    ["title"],
    ["", "", "Operation", "Sem", "Ann", "2 ann", "Selon besoin", "Observation"],
    ["", "", "VMC"],
    ["", "", "Clean", "x", "", "", "", "first"],
    ["", "", "Certificate", "", "x", "", "", ""],
    ["", "", "Mouths", "", "", "x", "", ""],
    ["", "", "Change worn part", "", "", "", "x", "on inspection"],
  ];
  const plans = mapMaintenanceSheets(
    [{ name: "Ventilation", rows }],
    "ST2 gamme.xls",
  );
  assert.deepEqual(
    plans.map((p) => [p.periodicityMonths, p.conditionBased]),
    [
      [6, false],
      [12, false],
      [24, false],
      [null, true],
    ],
  );
  assert.ok(plans.every((p) => p.technicalSection === "ST2"));
  assert.equal(plans[3].operations[0].sourceRow, 7);
});
test("macro-enabled inventory ignores styled empty rows/history while preserving quantities, dates and unknown condition", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    [
      "Site",
      "Appareil",
      "Marque de l’équipement",
      "Référence de l’équipement",
      "Nbre Installation",
      "Identification Bâtiment",
      "Date d’acquisition",
    ],
    ["A", "Split", "Brand", "REF", 3, "Building", 2015],
    ["A", "", "", "", "", "", ""],
  ]);
  sheet["A1048576"] = { t: "s", v: "", s: { font: { bold: true } } };
  sheet["!ref"] = "A1:G1048576";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "CLIM");
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["Site", "Appareil"],
      ["A", "Duplicate historical equipment"],
    ]),
    "OI-2023",
  );
  const bytes = XLSX.write(book, { type: "buffer", bookType: "xlsm" });
  const imported = await readInventoryFile(
    { name: "ST1.xlsm", size: bytes.length, arrayBuffer: async () => bytes },
    [{ id: "a", name: "A", trigram: "A" }],
  );
  assert.equal(imported.length, 1);
  assert.equal(imported[0].quantity, 3);
  assert.equal(imported[0].condition, "unknown");
  assert.equal(imported[0].modelReference, "REF");
  assert.equal(imported[0].buildingName, "Building");
  assert.equal(imported[0].metadata.acquisitionDateSource, "2015");
  const vent = mapInventorySheets(
    [
      {
        name: "VENTILATION",
        rows: [
          ["Site", "Description", "Fabricant", "Modèle", "Désignation local"],
          ["A", "Extraction", "Maker", "Model", "Kitchen"],
        ],
      },
    ],
    [{ id: "a", name: "A" }],
    "Inventaire VEN.xlsx",
  );
  assert.equal(vent[0].technicalSection, "ST2");
  assert.equal(vent[0].domainCode, "AER");
});

test("availability only charges downtime during the verified opening calendar", () => {
  const from = Date.parse("2026-10-02T00:00Z"),
    to = Date.parse("2026-10-05T22:00Z");
  const windows = openingIntervals(from, to, {
    ...policy,
    openingStartHour: 8,
    openingEndHour: 16,
  });
  assert.equal(windows.length, 2);
  const w = [
    {
      type: "corrective",
      reportedAt: from,
      unavailableFrom: Date.parse("2026-10-02T14:00Z"),
      unavailableUntil: Date.parse("2026-10-05T08:00Z"),
    },
  ];
  const metrics = equipmentMetrics(w, from, to, null, windows);
  assert.equal(metrics.availabilityPct, 87.5);
  assert.equal(metrics.mtbfHours, 14);
  assert.equal(
    openingIntervals(from, to, policy),
    null,
    "a total opening-hours number cannot invent daily windows",
  );
});
test("monographic export labels missing evidence and escapes source text", () => {
  const html = monographicHtml(
    {
      asset: { asset_code: "ESP-1", quantity: 2 },
      site: { name: "<script>alert(1)</script>" },
      profile: {
        name: "Pressure vessel",
        acquiredAt: Date.parse("2020-01-01"),
      },
      regulatory: {},
      updatedAt: Date.now(),
    },
    "en",
  );
  assert.match(html, /Equipment code/);
  assert.match(html, /Not recorded/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /\[object Object\]/);
});
