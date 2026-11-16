import test from "node:test";
import assert from "node:assert/strict";
import { operationalCharter } from "../src/services/company/operationalCharter.js";
import {
  executeOperationalAction,
  OPERATIONAL_ACTIONS,
} from "../src/services/company/operationalActions.js";
import { isOperationalTable } from "../src/shared/companyOperations.js";
import { execute as executeSkill } from "../src/services/company/skillsRegistry.js";
import { requiresOwnerApproval } from "../src/services/company/governance.solo.js";

test("business roles gain real local tools without replacing approval policy or regranting revoked skills", () => {
  const charter = {
    id: "team",
    roles: {
      PurchasingManager: {
        companion: "a",
        grantedSkills: ["skill.sendgrid_email"],
      },
      CFO: { companion: "b", grantedSkills: [] },
    },
    rules: { vetoMode: { payment: "APPROVE" } },
  };
  const upgraded = operationalCharter(charter);
  assert.ok(
    upgraded.roles.PurchasingManager.grantedSkills.includes(
      "skill.local_purchasing",
    ),
  );
  assert.ok(upgraded.roles.CFO.grantedSkills.includes("skill.local_billing"));
  assert.ok(
    upgraded.roles.CFO.grantedSkills.includes("skill.local_purchasing"),
  );
  assert.equal(upgraded.rules, charter.rules);
  assert.equal(charter.operationalVersion, undefined);
  upgraded.roles.CFO.grantedSkills = [];
  assert.deepEqual(operationalCharter(upgraded).roles.CFO.grantedSkills, []);
});
test("operational action routing passes existing IDs and typed input without pretending to execute a payment", async () => {
  const calls = [];
  globalThis.window = {
    electronAPI: {
      db: {
        purchasing: {
          recordPayment: async (...args) => {
            calls.push(args);
            return { id: "receipt" };
          },
        },
      },
    },
  };
  try {
    await assert.rejects(
      () =>
        executeOperationalAction("team", "purchasing.recordPayment", {
          input: {},
        }),
      /record ID/,
    );
    const result = await executeOperationalAction(
      "team",
      "purchasing.recordPayment",
      { recordId: "invoice", input: { reference: "bankreceipt" } },
    );
    assert.deepEqual(calls, [
      ["team", "invoice", { reference: "bankreceipt" }],
    ]);
    assert.match(result.summary, /own evidence/);
    assert.equal(OPERATIONAL_ACTIONS["billing.snapshot"].read, true);
  } finally {
    delete globalThis.window;
  }
});
test("v1 upgrade adds sourcing and purchasing finance without regranting revoked base tools", () => {
  const old = {
    operationalVersion: 1,
    roles: {
      PurchasingManager: { companion: "pm", grantedSkills: [] },
      CFO: { companion: "cfo", grantedSkills: [] },
      PaymentsSpecialist: { companion: "finance", grantedSkills: [] },
      DocumentController: { grantedSkills: [] },
    },
  };
  const upgraded = operationalCharter(old);
  assert.equal(upgraded.operationalVersion, 4);
  assert.deepEqual(upgraded.roles.PurchasingManager.grantedSkills, [
    "skill.brave_supplier_search", "skill.local_records",
  ]);
  assert.deepEqual(upgraded.roles.CFO.grantedSkills, [
    "skill.local_purchasing", "skill.local_records",
  ]);
  assert.deepEqual(upgraded.roles.PaymentsSpecialist.grantedSkills, [
    "skill.local_purchasing",
  ]);
  assert.deepEqual(upgraded.roles.DocumentController.grantedSkills, ["skill.local_records", "skill.local_casework"]);
  upgraded.roles.PurchasingManager.grantedSkills = [];
  upgraded.roles.CFO.grantedSkills = [];
  assert.equal(
    operationalCharter(upgraded),
    upgraded,
    "v4 preserves explicit revocation",
  );
  const noPurchasing = operationalCharter({
    operationalVersion: 1,
    roles: { CFO: { grantedSkills: [] } },
  });
  assert.deepEqual(noPurchasing.roles.CFO.grantedSkills, ["skill.local_records"]);
});
test("all operational namespaces participate in backup and memory while unrelated tables do not", () => {
  for (const table of [
    "company_billing_invoices",
    "purchasing_records",
    "gmao_maintenance_records",
  ])
    assert.equal(isOperationalTable(table), true);
  for (const table of [
    "wallets",
    "companies",
    "gmao_unsafe;DROP TABLE companies",
  ])
    assert.equal(isOperationalTable(table), false);
});
test("new operational network actions remain approved and cannot escape demo mode", async () => {
  let called = 0;
  globalThis.window = {
    electronAPI: {
      db: {
        purchasing: {
          sendRfq: async () => {
            called++;
          },
        },
        companyBilling: {
          chorusAction: async () => {
            called++;
          },
        },
        audit: { append: async () => ({ id: "audit" }) },
      },
    },
  };
  try {
    for (const type of ["purchasing.sendRfq", "billing.chorusAction"]) {
      assert.equal(requiresOwnerApproval({ type }), true);
      const result = await executeSkill(
        "team",
        type,
        { recordId: "record", input: { confirmed: true } },
        { charter: { demoMode: true } },
      );
      assert.equal(result.status, "simulated");
      assert.equal(result.simulated, true);
    }
    assert.equal(called, 0);
  } finally {
    delete globalThis.window;
  }
});
test("an uncertain Chorus result cannot complete the agent’s task step", async () => {
  globalThis.window = {
    electronAPI: {
      db: {
        companyBilling: {
          chorusAction: async () => ({
            chorus: {
              attempt: {
                status: "unknown",
                error: "Verify portal before retrying",
              },
            },
          }),
        },
      },
    },
  };
  try {
    await assert.rejects(
      () =>
        executeOperationalAction("team", "billing.chorusAction", {
          recordId: "invoice",
          input: { operation: "submit" },
        }),
      /Verify portal/,
    );
  } finally {
    delete globalThis.window;
  }
});

test('casework migration preserves revoked existing tools and requires approval for evidence writes',()=>{
  const upgraded=operationalCharter({operationalVersion:3,roles:{DocumentController:{grantedSkills:[]},CFO:{grantedSkills:[]}}});
  assert.deepEqual(upgraded.roles.DocumentController.grantedSkills,['skill.local_casework']);
  assert.deepEqual(upgraded.roles.CFO.grantedSkills,[]);
  upgraded.roles.DocumentController.grantedSkills=[];
  assert.deepEqual(operationalCharter(upgraded).roles.DocumentController.grantedSkills,[]);
  for(const method of ['saveRecord','resolveBlocker','resolveFluidFollowup','savePricingVersion'])assert.equal(requiresOwnerApproval({type:'casework.'+method}),true);
  assert.equal(OPERATIONAL_ACTIONS['casework.assetHistory'].read,true);
});
