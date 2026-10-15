import test from "node:test";
import assert from "node:assert/strict";

import {
  isMaintenanceWorkspace,
  maintenanceAttentionCards,
  maintenanceChannels,
} from "../src/services/company/maintenanceWorkspace.js";

test("HVAC workspaces expose operating channels instead of a generic GMAO destination", () => {
  assert.equal(isMaintenanceWorkspace({ template: { id: "hvac_residential" } }), true);
  assert.equal(isMaintenanceWorkspace({ template: { id: "sales" } }), false);

  const channels = maintenanceChannels({
    kpis: { openWorkOrders: 7, duePreventive: 2, slaAtRisk: 1, serviceAcceptancePending: 3, invoicesToSend: 2 },
  });
  assert.deepEqual(channels.map((channel) => channel.key), ["dispatch", "preventive", "sla-risk", "billing"]);
  assert.equal(channels.find((channel) => channel.key === "dispatch").badge, 7);
  assert.equal(channels.find((channel) => channel.key === "billing").badge, 5);
  assert.equal(channels.find((channel) => channel.key === "preventive").focus, "preventive");
});

test("the conversation brief turns canonical maintenance records into actionable cards", () => {
  const now = 2_000_000;
  const cards = maintenanceAttentionCards({
    workOrders: [
      { id: "wo-risk", workOrderNumber: "OT-104", title: "Cooling failure", priority: "P1", status: "assigned" },
      { id: "wo-cash", workOrderNumber: "OT-099", title: "Compressor repair", priority: "P2", status: "restored", serviceAcceptance: false },
    ],
    sla: [{ workOrderId: "wo-risk", interventionLateMs: 6_000, restorationLateMs: 0 }],
    plans: [{ id: "plan-1", name: "Quarterly air handling inspection", active: true, nextDueAt: now - 1 }],
  }, now);

  assert.equal(cards.length, 3);
  assert.match(cards[0].title, /1 urgent intervention/);
  assert.match(cards[0].detail, /OT-104/);
  assert.equal(cards[1].channel, "preventive");
  assert.match(cards[2].detail, /OT-099/);
  assert.equal(cards[2].channel, "billing");
});
