import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as teams from "../../../src/main/db/repos/teamCommunication.js";
import * as gmao from "../../../src/main/db/repos/gmao.js";
import * as portability from "../../../src/main/db/repos/companyPortability.js";
import * as issues from "../../../src/main/db/repos/issues.js";
import { makeCharter } from "../../../src/services/company/charter.js";
import { applyTemplate } from "../../../src/services/company/templates.js";
import {requiresOwnerApproval} from '../../../src/services/company/governance.solo.js';
assert.equal(requiresOwnerApproval({type:'team.requestWork'}),false,'Local team messages must not require an external-send approval');
assert.equal(requiresOwnerApproval({type:'team.reply'}),false);
assert.equal(requiresOwnerApproval({type:'team.updateProcurement',status:'ordered'}),true,'Cross-team purchasing changes still require review');
const { db } = get();
for (const id of ["maintenance", "purchasing", "sales"])
  companies.save({
    ...makeCharter({ name: id, mission: id }),
    id,
    name: id,
    status: "active",
    roles: {
      CEO: { companion: "same-agent", companionName: "Alex" },
      PurchasingManager: { companion: "buyer", companionName: "Sam" },
    },
  });
const site = gmao.saveSite("maintenance", {
  name: "Private site",
  trigram: "PV1",
});
const order = gmao.createWorkOrder("maintenance", {
  siteId: site.id,
  title: "HVAC repair",
});
const purchase = gmao.saveProcurement("maintenance", {
  workOrderId: order.id,
  description: "Drive belt",
  items: [{ label: "Belt", quantity: 2, received: 0 }],
});
const input = {
  targetTeamId: "purchasing",
  targetRole: "PurchasingManager",
  subject: "Parts for WO",
  body: "Prepare supplier options.",
  procurementId: purchase.id,
  requestKey: "request-1",
};
const thread = teams.request("maintenance", input, { role: "CEO" });
assert.equal(
  teams.request("maintenance", input, { role: "CEO" }).id,
  thread.id,
);
assert.equal(issues.list("purchasing").length, 1);
assert.equal(issues.list("maintenance").length, 0);
assert.equal(thread.messages[0].team_name, "maintenance");
assert.equal(thread.messages[0].author_name, "Alex");
assert.equal(thread.target_role, "PurchasingManager");
assert.throws(
  () =>
    teams.request(
      "maintenance",
      { ...input, body: "Different" },
      { role: "CEO" },
    ),
  /already used/,
);
assert.throws(
  () =>
    teams.request(
      "maintenance",
      { ...input, procurementId: undefined },
      { role: "CEO" },
    ),
  /already used/,
);
assert.throws(
  () => teams.request("maintenance", input, { role: "PurchasingManager" }),
  /already used/,
);
assert.throws(() => teams.read("sales", thread.id), /not shared/);
assert.throws(
  () => teams.reply("sales", { conversationId: thread.id, body: "Intrusion" }),
  /not shared/,
);
assert.throws(
  () =>
    teams.reply(
      "purchasing",
      { conversationId: thread.id, body: "Impersonation" },
      { role: "FakeRole" },
    ),
  /not assigned/,
);
assert.throws(() => teams.request("sales", input), /not found in the sending/);
assert.throws(
  () => teams.request("maintenance", { ...input, targetRole: "FakeRole" }),
  /assigned member/,
);
const shared = teams.readProcurement("purchasing", thread.id);
assert.equal(shared.description, "Drive belt");
assert.equal(shared.intervention.work_order_number, order.workOrderNumber);
assert.equal(shared.site_address, undefined);
const reply = {
  conversationId: thread.id,
  body: "Need the belt specification.",
  requestKey: "reply-1",
};
teams.reply("purchasing", reply, { role: "PurchasingManager" });
teams.reply("purchasing", reply, { role: "PurchasingManager" });
assert.equal(teams.read("maintenance", thread.id).messages.length, 2);
assert.equal(
  teams.read("maintenance", thread.id).messages[1].team_name,
  "purchasing",
);
assert.equal(
  teams.read("maintenance", thread.id).messages[1].author_name,
  "Sam",
);
assert.equal(
  issues.list("purchasing")[0].status,
  "open",
  "A reply does not claim task completion",
);
const update = {
  conversationId: thread.id,
  status: "proforma_received",
  supplierName: "Supplier",
  proformaReference: "P-42",
  amountCents: 9000,
  requestKey: "purchase-update",
};
const updated = teams.updateProcurement("purchasing", update, {
  role: "PurchasingManager",
});
assert.equal(updated.proformaReference, "P-42");
assert.deepEqual(
  teams.updateProcurement("purchasing", update, { role: "PurchasingManager" }),
  updated,
);
assert.throws(
  () =>
    teams.updateProcurement(
      "purchasing",
      { ...update, amountCents: 100 },
      { role: "PurchasingManager" },
    ),
  /already used/,
);
assert.throws(
  () => teams.updateProcurement("sales", update, { role: "CEO" }),
  /not shared/,
);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM team_messages").get().n, 3);
const exported = portability.exportBundle("maintenance");
assert.equal(exported.tables.team_conversation_archives.length, 1);
const restored = portability.importBundle(exported);
const archives = teams.list(restored.id);
assert.equal(archives.length, 1);
assert.equal(archives[0].archived, true);
assert.throws(
  () =>
    teams.reply(restored.id, {
      conversationId: archives[0].id,
      body: "Replay",
    }),
  /not shared/,
);
for (const id of ["purchasing_team", "sales_team"]) {
  const { draft } = applyTemplate(id, { businessName: "Example" });
  assert.equal(draft.template.id, id);
  assert.ok(draft.roles.CEO);
}
assert.equal(
  applyTemplate("hvac_residential").draft.roles.PurchasingManager,
  undefined,
);
console.log(
  "Team isolation, attributed replies, task routing, shared purchasing, idempotency and read-only restore passed.",
);
