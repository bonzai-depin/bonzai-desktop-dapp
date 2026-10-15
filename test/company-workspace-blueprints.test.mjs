import assert from "node:assert/strict";
import test from "node:test";

import { applyTemplate, listTemplates } from "../src/services/company/templates.js";
import {
  buildWorkspaceBlueprint,
  hydrateWorkspaceChannels,
  inferWorkspaceProfile,
} from "../src/services/company/workspaceBlueprints.js";

test("company context deterministically selects a workspace profile", () => {
  assert.equal(inferWorkspaceProfile({ businessType: "short-term rental operator" }), "hospitality");
  assert.equal(inferWorkspaceProfile({ currentWorkflow: "Qualify CRM leads and move the sales pipeline" }), "revenue");
  assert.equal(inferWorkspaceProfile({ templateId: "solo_law" }), "legal");
  assert.equal(inferWorkspaceProfile({ templateId: "pod_shop" }), "commerce");
  assert.equal(inferWorkspaceProfile({ templateId: "hvac_residential" }), "hvac");
  assert.equal(inferWorkspaceProfile({ profile: "general", currentWorkflow: "Report invoices, payments, pipeline, and risks" }), "general");
});

test("every company template produces an explicit and navigable workspace contract", () => {
  for (const template of listTemplates()) {
    const workspace = buildWorkspaceBlueprint({ templateId: template.id });
    assert.equal(workspace.schemaVersion, 1);
    assert.ok(workspace.defaultChannel);
    assert.ok(workspace.recommendedRoles.length >= 3);
    assert.ok(workspace.channels.some((channel) => channel.view === "command"));
    assert.ok(workspace.channels.some((channel) => channel.view === "org"));
    assert.ok(workspace.channels.some((channel) => channel.view === "connectors"));
    assert.equal(new Set(workspace.channels.map((channel) => channel.key)).size, workspace.channels.length);
  }
});

test("workflow setup stores the inferred channels and provisions a focused team", () => {
  const { draft, requiredConnectors } = applyTemplate("business_ops_team", {
    businessName: "Northstar Services",
    businessType: "service business",
    workflowId: "collections",
    workspaceProfile: "finance",
    currentWorkflow: "Invoice approved work and collect overdue receivables",
  }, {
    connectorKinds: ["quickbooks", "stripe"],
    initialGoals: ["Prepare the overdue invoice queue"],
  });

  assert.equal(draft.workspace.profile, "finance");
  assert.deepEqual(requiredConnectors, ["quickbooks", "stripe"]);
  assert.deepEqual(draft.initialGoals, ["Prepare the overdue invoice queue"]);
  assert.ok(draft.roles.CEO);
  assert.ok(draft.roles.InvoicingSpecialist);
  assert.ok(draft.roles.PaymentsSpecialist);
  assert.equal(draft.roles.CMO, undefined);
  assert.equal(draft.businessContext.workflowId, "collections");
});

test("channel badges are hydrated from live company state without changing the saved schema", () => {
  const workspace = buildWorkspaceBlueprint({ templateId: "hvac_residential" });
  const channels = hydrateWorkspaceChannels(workspace, {
    approvals: [{ id: "approval-1" }],
    gmao: { kpis: { openWorkOrders: 8, duePreventive: 2, slaAtRisk: 3, serviceAcceptancePending: 1, invoicesToSend: 2 } },
  });
  assert.equal(channels.find((channel) => channel.key === "dispatch").badgeValue, 8);
  assert.equal(channels.find((channel) => channel.key === "billing").badgeValue, 3);
  assert.equal(channels.find((channel) => channel.key === "approvals").badgeValue, 1);
  assert.equal(workspace.channels.find((channel) => channel.key === "dispatch").badgeValue, undefined);
});
