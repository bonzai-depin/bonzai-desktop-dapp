import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as intake from "../../../src/main/db/repos/companyIntake.js";
import * as gmao from "../../../src/main/db/repos/gmao.js";
import * as purchasing from "../../../src/main/db/repos/purchasing.js";
import * as connectors from "../../../src/main/db/repos/connectors.js";
import * as portability from "../../../src/main/db/repos/companyPortability.js";
import { makeCharter } from "../../../src/services/company/charter.js";
const { db } = get();
for (const id of ["intake", "other"])
  companies.save({
    ...makeCharter({ name: id, mission: "Manage client operations" }),
    id,
    name: id,
    status: "active",
    roles: { CEO: { companion: "a" }, PurchasingManager: { companion: "b" } },
  });
function process(text, actions, { grounded = true } = {}) {
  if (grounded)
    text += "\n" + actions.map((a) => JSON.stringify(a.data)).join("\n");
  const s = intake.ingest("intake", {
    name: "Incoming record",
    chunks: [text],
  });
  const job = intake.claim("intake");
  assert.equal(job.id, s.id);
  return intake.finish("intake", {
    id: s.id,
    lease: job.lease,
    actions: actions.map((a) => ({
      ...a,
      confidence: a.confidence ?? 0.99,
      evidence: text,
    })),
  });
}
let s = process("Client CFE, info@cfe.example, 12 rue Bleue", [
  {
    type: "client",
    data: { name: "CFE", email: "info@cfe.example", address: "12 rue Bleue" },
  },
]);
assert.equal(s.actions[0].status, "applied");
const clientId = s.actions[0].result[0].id;
assert.equal(
  intake.ingest("intake", { name: "Renamed.txt", chunks: [s.text] }).duplicate,
  true,
);
assert.throws(() => intake.readSource("other", { id: s.id }), /not found/);
s = process("Client CFE, new address", [
  { type: "client", data: { name: "CFE", address: "Other street" } },
]);
assert.equal(s.status, "review");
assert.equal(
  db.prepare("SELECT address FROM gmao_clients WHERE id=?").get(clientId)
    .address,
  "12 rue Bleue",
);
intake.review("intake", {
  actionId: s.actions[0].id,
  revision: s.actions[0].revision,
  decision: "dismiss",
});
s = process("Site HQ at CFE, 12 rue Bleue", [
  {
    type: "site",
    data: { name: "HQ", client: "CFE", address: "12 rue Bleue" },
  },
]);
assert.equal(s.status, "completed");
s = process(
  "OI-100, HQ, maintenance on 2026-10-20 08:00 +02:00, technician Alex",
  [
    {
      type: "work_order",
      data: {
        reference: "OI-100",
        site: "HQ",
        title: "Maintenance",
        status: "assigned",
        scheduledAt: "2026-10-20T08:00:00+02:00",
        technician: "Alex",
        durationMinutes: 60,
      },
    },
  ],
);
assert.equal(s.actions[0].status, "applied", JSON.stringify(s));
assert.equal(
  gmao.getWorkOrder("intake", s.actions[0].result[0].id).status,
  "assigned",
);
s = process("OI-100 repeated in another document", [
  {
    type: "work_order",
    data: {
      reference: "OI-100",
      site: "HQ",
      title: "Maintenance",
      status: "assigned",
      scheduledAt: "2026-10-20T08:00:00+02:00",
      technician: "Alex",
      durationMinutes: 60,
    },
  },
]);
assert.equal(s.status, "completed");
assert.equal(
  db
    .prepare("SELECT count(*) n FROM gmao_work_orders WHERE company_id=?")
    .get("intake").n,
  1,
);
s = process("OI-101 has allegedly been completed", [
  {
    type: "work_order",
    data: {
      reference: "OI-101",
      site: "HQ",
      title: "Service complete",
      status: "completed",
    },
  },
]);
assert.equal(s.status, "review");
assert.equal(db.prepare("SELECT count(*) n FROM gmao_work_orders").get().n, 1);
s = process(
  "SupplyCo proforma P-12: Pump PUMP-1 x2 at 100 EUR, freight 15 EUR, VAT20, lead 3 days",
  [
    {
      type: "proforma",
      data: {
        reference: "P-12",
        supplier: "SupplyCo",
        title: "Replacement pumps",
        lines: [
          { sku: "PUMP-1", name: "Pump", quantity: 2, unitPriceCents: 10000 },
        ],
        shippingCents: 1500,
        vatRate: 20,
        leadDays: 3,
      },
    },
  ],
);
assert.equal(s.status, "completed", JSON.stringify(s));
let ps = purchasing.snapshot("intake");
assert.equal(ps.items.length, 1);
assert.equal(ps.quotes.length, 1);
assert.equal(ps.orders.length, 0);
assert.equal(ps.receipts.length, 0);
s = process("Supplier P-12 repeat at a different price", [
  {
    type: "proforma",
    data: {
      reference: "P-12",
      supplier: "SupplyCo",
      lines: [
        { sku: "PUMP-1", name: "Pump", quantity: 2, unitPriceCents: 50000 },
      ],
      shippingCents: 1500,
      vatRate: 20,
      leadDays: 3,
    },
  },
]);
assert.equal(s.status, "review");
assert.equal(purchasing.snapshot("intake").quotes.length, 1);
s = process("Invoice F-1 for CFE, service 100 EUR HT, VAT20, total120 EUR", [
  {
    type: "invoice",
    data: {
      reference: "F-1",
      client: "CFE",
      lines: [
        { label: "Service", quantity: 1, unitPriceCents: 10000, vatRate: 20 },
      ],
      totalCents: 12000,
    },
  },
]);
assert.equal(s.status, "completed", JSON.stringify(s));
assert.equal(
  db.prepare("SELECT status FROM company_billing_invoices").get().status,
  "draft",
);
s = process("Invoice F-2 incorrect total", [
  {
    type: "invoice",
    data: {
      reference: "F-2",
      client: "CFE",
      lines: [
        { label: "Service", quantity: 1, unitPriceCents: 10000, vatRate: 20 },
      ],
      totalCents: 99999,
    },
  },
]);
assert.equal(s.status, "review");
assert.equal(
  db.prepare("SELECT count(*) n FROM company_billing_invoices").get().n,
  1,
);
s = process("Grant BAR-TH-129 for CFE installation APP-1 in Martinique", [
  {
    type: "grant",
    data: {
      title: "CFE installation",
      beneficiary: "CFE",
      territory: "Martinique",
      scheme: "BAR-TH-129",
      applicationReference: "APP-1",
    },
  },
]);
assert.equal(s.status, "completed", JSON.stringify(s));
s = process("Prepare accounting summary of these records for October", [
  {
    type: "task",
    data: {
      title: "October accounts",
      description: "Prepare accounting summary",
      role: "CEO",
    },
  },
]);
assert.equal(s.status, "completed");
const taskId = s.actions[0].result[0].id;
assert.equal(
  db.prepare("SELECT assignee_companion FROM issues WHERE id=?").get(taskId)
    .assignee_companion,
  "a",
);
s = process("Low confidence supplier name spelling", [
  { type: "client", confidence: 0.3, data: { name: "NewCo" } },
]);
assert.equal(s.status, "review");
// A believable model confidence is not proof of facts absent from its source.
s = process(
  "Client visitor with no supplied email",
  [
    {
      type: "client",
      data: { name: "Phantom", email: "invented@example.org" },
    },
  ],
  { grounded: false },
);
assert.equal(s.status, "review");
assert.match(s.actions[0].error, /source does not support/);
assert.throws(
  () =>
    intake.review("other", {
      actionId: s.actions[0].id,
      revision: s.actions[0].revision,
      confirmed: true,
    }),
  /not found/,
);
assert.throws(
  () =>
    intake.review("intake", {
      actionId: s.actions[0].id,
      revision: 0,
      confirmed: true,
    }),
  /changed/,
);
const reviewed = intake.review("intake", {
  actionId: s.actions[0].id,
  revision: s.actions[0].revision,
  confirmed: true,
  data: { name: "Verified visitor", email: "verified@example.org" },
});
assert.equal(reviewed.actions[0].status, "applied");
const receipt = reviewed.actions[0];
assert.equal(
  intake.readRecord("intake", {
    actionId: receipt.id,
    recordId: receipt.result[0].id,
  }).email,
  "verified@example.org",
);
assert.throws(
  () =>
    intake.readRecord("other", {
      actionId: receipt.id,
      recordId: receipt.result[0].id,
    }),
  /not linked/,
);
// Partial supplier evidence still creates usable parts and a request, without an invented zero freight.
s = process("SupplyCo proforma P-13", [
  {
    type: "proforma",
    data: {
      reference: "P-13",
      supplier: "SupplyCo",
      lines: [
        { sku: "VALVE-1", name: "Valve", quantity: 2, unitPriceCents: 9000 },
      ],
    },
  },
]);
assert.equal(s.status, "completed", JSON.stringify(s));
assert.ok(s.actions[0].result[0].pending);
ps = purchasing.snapshot("intake");
assert.equal(ps.proformas.length, 1);
assert.equal(ps.quotes.length, 1);
assert.equal(ps.proformas[0].shippingCents, null);
const requestsBefore = ps.requests.length;
s = process("SupplyCo P-13 with confirmed terms", [
  {
    type: "proforma",
    data: {
      reference: "P-13",
      supplier: "SupplyCo",
      lines: [
        { sku: "VALVE-1", name: "Valve", quantity: 2, unitPriceCents: 9000 },
      ],
      shippingCents: 1000,
      vatRate: 20,
      leadDays: 5,
    },
  },
]);
assert.equal(s.status, "completed", JSON.stringify(s));
assert.equal(purchasing.snapshot("intake").requests.length, requestsBefore);
assert.equal(purchasing.snapshot("intake").proformas[0].status, "quoted");
s = process("Invoice F-3 with unknown tax", [
  {
    type: "invoice",
    data: {
      reference: "F-3",
      client: "CFE",
      lines: [{ label: "Service", quantity: 1, unitPriceCents: 10000 }],
      totalCents: 10000,
    },
  },
]);
assert.equal(s.status, "review");
// Entity dependencies are ordered even if the model lists the intervention first.
s = process("CFE Annex visit", [
  {
    type: "work_order",
    data: {
      title: "Annex visit",
      site: "Annex",
      reference: "OI-102",
      status: "reported",
    },
  },
  {
    type: "site",
    data: { name: "Annex", client: "CFE", address: "14 rue Bleue" },
  },
]);
assert.equal(s.status, "completed", JSON.stringify(s));
assert.ok(s.actions[1].result.some((r) => r.type === "task"));
// Recognized spreadsheet rows are recomputed in main; wrong or missing model actions cannot overwrite them.
const table = JSON.stringify({
  table: "Planning",
  headers: [
    "Référence OI",
    "Site",
    "Objet",
    "Date prévue",
    "Technicien",
    "Statut",
  ],
  rows: [
    {
      row: 2,
      cells: [
        "OI-103",
        "HQ",
        "Inspection",
        "20/10/2026 10:00",
        "Alex",
        "Planifié",
      ],
    },
  ],
  timezone: "Europe/Paris",
});
s = process(table, [], { grounded: false });
assert.equal(s.status, "completed", JSON.stringify(s));
const visit = gmao.getWorkOrder("intake", s.actions[0].result[0].id);
assert.equal(visit.status, "assigned");
assert.equal(visit.scheduledAt, Date.parse("2026-10-20T08:00:00Z"));
// Durable extraction is separate from record application and can survive a restart.
db.prepare(
  "INSERT INTO blobs(id,ext,byte_length,mime_type,created_at) VALUES(?,?,?,?,?)",
).run("e".repeat(64), "txt", 20, "text/plain", Date.now());
const pending = intake.ingest("intake", {
  name: "pending.txt",
  blobId: "e".repeat(64),
  ext: "txt",
  chunks: [""],
  needsExtraction: true,
});
const extract = intake.claim("intake");
assert.equal(extract.extracted, false);
intake.renew("intake", { id: extract.id, lease: extract.lease });
intake.extracted("intake", {
  id: extract.id,
  lease: extract.lease,
  chunks: ["Nothing actionable in this source."],
});
const after = intake.claim("intake");
assert.equal(after.extracted, true);
intake.finish("intake", { id: after.id, lease: after.lease, actions: [] });
const queued = intake.ingest("intake", {
  name: "Crash recovery",
  chunks: ["Recovery source text"],
});
const lease = intake.claim("intake");
assert.equal(intake.claim("intake"), null);
db.prepare(
  "UPDATE companies SET charter=json_set(charter,'$.status','paused') WHERE id=?",
).run("intake");
assert.throws(
  () =>
    intake.finish("intake", { id: lease.id, lease: lease.lease, actions: [] }),
  /paused/,
);
db.prepare(
  "UPDATE companies SET charter=json_set(charter,'$.status','active') WHERE id=?",
).run("intake");
db.prepare("UPDATE company_intake_sources SET lease_until=0 WHERE id=?").run(
  queued.id,
);
const recovered = intake.claim("intake");
assert.notEqual(recovered.lease, lease.lease);
assert.throws(
  () =>
    intake.finish("intake", { id: lease.id, lease: lease.lease, actions: [] }),
  /lease expired/,
);
intake.finish("intake", {
  id: recovered.id,
  lease: recovered.lease,
  actions: [],
});
const envelope = process("NewChild, newchild@example.org", [], {
  grounded: false,
});
assert.throws(
  () =>
    intake.ingest("other", {
      name: "attachment",
      chunks: ["Address facts"],
      parentId: envelope.id,
    }),
  /not found/,
);
const attachment = intake.ingest("intake", {
  name: "address.txt",
  chunks: ["NewChild: 2 rue Claire"],
  parentId: envelope.id,
});
const joined = intake.claim("intake");
assert.match(joined.chunk, /newchild@example.org/);
const joinedResult = intake.finish("intake", {
  id: joined.id,
  lease: joined.lease,
  actions: [
    {
      type: "client",
      confidence: 0.99,
      evidence: "NewChild: 2 rue Claire",
      data: {
        name: "NewChild",
        email: "newchild@example.org",
        address: "2 rue Claire",
      },
    },
  ],
});
assert.equal(joinedResult.status, "completed");
// More than one thousand rows survive chunking/restarts without duplicating records.
for (let i = 0; i < 1010; i++) {
  const r = process(`Client N${i}, c${i}@fixture.invalid`, [
    { type: "client", data: { name: `N${i}`, email: `c${i}@fixture.invalid` } },
  ]);
  assert.equal(r.status, "completed");
}
assert.equal(
  db
    .prepare("SELECT count(*) n FROM gmao_clients WHERE company_id=?")
    .get("intake").n,
  1013,
);
assert.equal(
  intake.snapshot("intake", { offset: 1000, limit: 20 }).sources.length,
  20,
);
const c = connectors.create("intake", { kind: "gmail", authType: "none" });
intake.saveMailbox("intake", { connectorId: c.id, enabled: true });
assert.throws(
  () => intake.saveMailbox("other", { connectorId: c.id, enabled: true }),
  /active Gmail/,
);
const bundle = portability.exportBundle("intake", { includePayloads: false });
assert.ok(bundle.tables.company_intake_sources.length > 1000);
const restored = portability.importBundle(bundle, { name: "Restored intake" });
assert.ok(restored.id);
const restoredState = intake.snapshot(restored.id);
assert.equal(restoredState.mailboxes[0].enabled, false);
const restoredFollowups = db
  .prepare(
    "SELECT description,labels FROM issues WHERE company_id=? AND created_by='document-intake'",
  )
  .all(restored.id);
const firstSourceIds = bundle.tables.company_intake_sources.map((s) => s.id);
assert.ok(restoredFollowups.length);
for (const row of restoredFollowups)
  assert.equal(
    firstSourceIds.some((id) => row.description.includes(id)),
    false,
    "restored tasks must reference restored source IDs",
  );
console.log(
  "Company intake passed: records, scope, duplicate imports, evidence gates, leases, 1,010 clients and restore",
);
