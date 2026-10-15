import assert from "node:assert/strict";
import { get } from "./connection.js";
import * as companies from "../../../src/main/db/repos/companies.js";
import * as connectorRepo from "../../../src/main/db/repos/connectors.js";
import * as approvalRepo from "../../../src/main/db/repos/approvals.js";
import * as distributionRepo from "../../../src/main/db/repos/distribution.js";
import * as auditRepo from "../../../src/main/db/repos/audit.js";
import * as purchasing from "../../../src/main/db/repos/purchasing.js";
import { makeCharter } from "../../../src/services/company/charter.js";
import { operationalCharter } from "../../../src/services/company/operationalCharter.js";
import {
  createTaskExecution,
  runTaskExecution,
} from "../../../src/services/company/taskExecution.js";
import { execute } from "../../../src/services/company/skillsRegistry.js";
import {
  gateAction,
  approve,
} from "../../../src/services/company/governance.solo.js";
import { assertBraveSearchRequest } from "../../../src/main/connectors/braveSearch.js";

const companyId = "supplier-search-fixture";
const charter = operationalCharter({
  ...makeCharter({
    name: "Supplier search fixture",
    mission: "Find sourced candidates",
  }),
  id: companyId,
  roles: { PurchasingManager: { companion: "fixture", grantedSkills: [] } },
});
companies.save(charter);
const before = purchasing.saveRequest(companyId, {
  title: "Heat pump parts",
  items: [{ label: "Pump", quantity: 1 }],
});
const issueText = (id) =>
  get().db.prepare("SELECT description FROM issues WHERE id=?").get(id)
    .description;
assert.ok(!issueText(before.issueId).includes("sourcing.searchSuppliers"));
const connector = connectorRepo.create(companyId, {
  kind: "brave_search",
  authType: "apiKey",
});
connectorRepo.setSecretRef(companyId, connector.id, "fixture:stored-securely");
const request = purchasing.saveRequest(companyId, {
  title: "Public supplier research",
  items: [{ label: "Pump", quantity: 1 }],
});
assert.ok(issueText(request.issueId).includes("sourcing.searchSuppliers"));
let networkCalls = 0;
globalThis.window = {
  electronAPI: {
    db: {
      connectors: {
        getByKind: connectorRepo.getByKind,
        get: connectorRepo.getById,
        update: connectorRepo.update,
      },
      approvals: {
        enqueue: approvalRepo.enqueue,
        approve: approvalRepo.approve,
      },
      audit: { append: auditRepo.append },
      distribution: { publish: distributionRepo.publish },
    },
    companyConnector: {
      request: async (spec) => {
        networkCalls++;
        assert.equal(spec.companyId, companyId);
        assert.equal(spec.connectorId, connector.id);
        assert.equal(spec.connectorKind, "brave_search");
        assertBraveSearchRequest(spec.url, spec.method, spec.body);
        return {
          status: 200,
          data: {
            type: "search",
            web: {
              results: [
                {
                  title: "Verified source title",
                  url: "https://supplier.example/catalogue",
                  description: "Public catalogue extract",
                },
              ],
            },
          },
        };
      },
    },
  },
};
const action = {
  type: "sourcing.searchSuppliers",
  query: "pompe chauffage Nantes",
  country: "FR",
  language: "fr",
  count: 3,
};
let saved;
const save = async (state) => {
  saved = structuredClone(state);
};
const gate = (item, step) =>
  gateAction(companyId, charter, item, {
    role: "PurchasingManager",
    issueId: request.issueId,
    stepId: step.id,
  });
const dispatch = (item) =>
  execute(companyId, item.type, item, {
    role: "PurchasingManager",
    charter,
    issueId: request.issueId,
  });
const pending = await runTaskExecution({
  execution: createTaskExecution([action]),
  save,
  gate,
  dispatch,
});
assert.equal(pending.steps[0].status, "waiting_approval");
assert.equal(networkCalls, 0);
const approvalId = pending.steps[0].approvalId;
const approvedAction = await approve(companyId, approvalId);
const complete = await runTaskExecution({
  execution: pending,
  save,
  gate,
  dispatch,
  approval: {
    id: approvalId,
    stepId: pending.steps[0].id,
    action: approvedAction,
  },
});
assert.equal(complete.steps[0].status, "completed");
assert.equal(networkCalls, 1);
const contentId = saved.steps[0].output.contentId;
const stored = distributionRepo.getRecord(companyId, contentId);
assert.equal(stored.meta.source, "sourcing.searchSuppliers");
assert.equal(stored.meta.issueId, request.issueId);
assert.equal(
  stored.meta.evidence.results[0].url,
  "https://supplier.example/catalogue",
);
assert.equal(
  purchasing.snapshot(companyId).suppliers.length,
  0,
  "Search does not create supplier directory entries",
);
connectorRepo.revoke(companyId, connector.id, "fixture");
const unavailable = await dispatch(action);
assert.equal(unavailable.ok, false);
assert.equal(networkCalls, 1);
const demo = await execute(companyId, action.type, action, {
  role: "PurchasingManager",
  charter: { ...charter, demoMode: true },
});
assert.equal(demo.simulated, true);
assert.equal(networkCalls, 1);
assert.equal(get().db.prepare("PRAGMA foreign_key_check").all().length, 0);
console.log(
  "Supplier sourcing: owner approval, bounded mocked network request, local source artifact, inactive connector, conditional task context and demo isolation passed. No live network or credentials.",
);
