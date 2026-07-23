import test from "node:test";
import assert from "node:assert/strict";

import { COMPANY_CONNECTOR_CATALOG } from "../src/config/companyConnectors.js";
import { SUPPORTED_CONNECTOR_ACTIONS } from "../src/services/company/connectorExecutors.js";
import { SKILL_MANIFESTS } from "../src/services/company/skillManifests.js";
import { applyTemplate } from "../src/services/company/templates.js";

test("every advertised connector action has a production executor", () => {
  const connectorPrefixes = new Set(["stripe", "hubspot", "qbo", "sage", "slack", "email", "gcal", "twilio", "whatsapp", "shopify", "notion"]);
  const missing = [];

  for (const manifest of Object.values(SKILL_MANIFESTS)) {
    for (const action of manifest.actions) {
      if (!connectorPrefixes.has(action.type.split(".")[0])) continue;
      if (!SUPPORTED_CONNECTOR_ACTIONS.has(action.type)) missing.push(`${manifest.id}:${action.type}`);
    }
  }

  assert.deepEqual(missing, [], `Missing production executors: ${missing.join(", ")}`);
});

test("the connector catalog contains no duplicate kinds and retains Sage", () => {
  const kinds = COMPANY_CONNECTOR_CATALOG.map((connector) => connector.kind);
  assert.equal(new Set(kinds).size, kinds.length);
  assert.ok(kinds.includes("sage_accounting"));
});

test("live templates only grant production-backed integrations", () => {
  const live = applyTemplate("business_ops_team", {}, { demoMode: false });
  const demo = applyTemplate("business_ops_team", {}, { demoMode: true });
  const catalogKinds = new Set(COMPANY_CONNECTOR_CATALOG.map((connector) => connector.kind));

  assert.ok(demo.requiredSkills.length >= live.requiredSkills.length);
  assert.ok(live.requiredConnectors.every((kind) => catalogKinds.has(kind)));
  assert.ok(live.requiredSkills.every((skillId) =>
    SKILL_MANIFESTS[skillId].actions.every((action) => SUPPORTED_CONNECTOR_ACTIONS.has(action.type)),
  ));
});
