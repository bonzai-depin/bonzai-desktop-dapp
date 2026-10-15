import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompanyWorkspacePlan,
  classifyCompanyBrief,
  COMPANY_BRIEF_STARTERS,
} from "../src/services/company/conversationalWorkspace.js";

test("company briefs route to the workflow that matches the owner's language", () => {
  assert.equal(classifyCompanyBrief("We lose track of overdue invoices in QuickBooks"), "collections");
  assert.equal(classifyCompanyBrief("Warm HubSpot leads never get a second follow-up"), "leads");
  assert.equal(classifyCompanyBrief("Customer refund requests get buried in our inbox"), "support");
  assert.equal(classifyCompanyBrief("Give me one brief on how the business ran this week"), "reporting");
});

test("HVAC briefs provision the maintenance workspace, including French GMAO language", () => {
  assert.equal(classifyCompanyBrief("Nous gérons une GMAO pour la maintenance préventive et le dispatch des techniciens"), "hvac");
  const plan = buildCompanyWorkspacePlan("HVAC work orders, SLA risk and service acceptance");
  assert.equal(plan.templateId, "hvac_residential");
  assert.match(plan.outcome, /intervention/i);
});

test("workspace plans always include actionable goals and supported tool identifiers", () => {
  for (const starter of COMPANY_BRIEF_STARTERS) {
    const plan = buildCompanyWorkspacePlan(starter.prompt);
    assert.ok(plan.id);
    assert.ok(plan.title);
    assert.ok(plan.outcome);
    assert.ok(plan.goals.length >= 4);
    if(plan.id==='grants') assert.deepEqual(plan.connectors,[], 'local browser work needs no paid connector subscription');
    else assert.ok(plan.connectors.length >= 4);
    assert.ok(plan.connectors.every((kind) => /^[a-z0-9_]+$/.test(kind)));
  }
});

test("a returned plan cannot mutate the shared plan catalog", () => {
  const first = buildCompanyWorkspacePlan("invoice cash collection");
  first.goals.pop();
  first.connectors.pop();
  const second = buildCompanyWorkspacePlan("invoice cash collection");
  assert.equal(second.goals.length, 4);
  assert.equal(second.connectors.length, 4);
});
