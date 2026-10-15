import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  automationHealth,
  allowsAutonomousPlanning,
  automationPolicy,
  intentSimilarity,
  isDuplicateIntent,
  isAutonomousWorkflowTask,
  retryDelayMs,
} from "../src/shared/companyAutomation.js";

test('workflow teams wait for explicit production requests instead of inventing business work', () => {
  assert.equal(allowsAutonomousPlanning({ workspace: { executionWorkflowId: 'meditation-forge-v1.0.0' } }), false);
  assert.equal(allowsAutonomousPlanning({ workspace: { executionWorkflowId: 'custom-imported-workflow' }, demoMode: true }), false);
  assert.equal(allowsAutonomousPlanning({ workspace: { channels: [{ view: 'gmao' }] } }), true);
  assert.equal(allowsAutonomousPlanning({}), true);
});
test('earlier autonomous workflow plans are distinct from owner-directed tasks, even when they use the same workflow', () => {
  const charter = { workspace: { executionWorkflowId: 'meditation-forge-v1.0.0' } };
  const task = { createdBy: 'ceo', goalId: 'readiness', execution: { steps: [{ action: { type: 'runWorkflow', workflowId: 'meditation-forge-v1.0.0' } }] } };
  assert.equal(isAutonomousWorkflowTask(charter, task, { createdBy: 'ceo' }), true);
  assert.equal(isAutonomousWorkflowTask(charter, { ...task, goalId: null }), true);
  assert.equal(isAutonomousWorkflowTask(charter, task, { createdBy: 'user' }), false);
  assert.equal(isAutonomousWorkflowTask(charter, { ...task, createdBy: 'user' }, { createdBy: 'ceo' }), false);
  assert.equal(isAutonomousWorkflowTask(charter, task), false, 'unknown goal ownership must not block owner work');
  assert.equal(isAutonomousWorkflowTask({}, task, { createdBy: 'ceo' }), false);
});

test("automation policy bounds unsafe values", () => {
  const policy = automationPolicy({ automation: {
    maxActiveGoals: 0, maxOpenIssues: 5000, maxAttempts: 99,
    retryBaseMs: 10, retryMaxMs: 99_999_999,
  } });
  assert.equal(policy.maxActiveGoals, 1);
  assert.equal(policy.maxOpenIssues, 1000);
  assert.equal(policy.maxAttempts, 10);
  assert.equal(policy.retryBaseMs, 1000);
  assert.equal(policy.retryMaxMs, 24 * 60 * 60_000);
});

test("retry policy uses capped exponential backoff", () => {
  const policy = { retryBaseMs: 1000, retryMaxMs: 5000 };
  assert.equal(retryDelayMs(1, policy), 1000);
  assert.equal(retryDelayMs(3, policy), 4000);
  assert.equal(retryDelayMs(8, policy), 5000);
  assert.ok(retryDelayMs(2, policy, "company-a") >= 1700);
  assert.ok(retryDelayMs(2, policy, "company-a") <= 2300);
});

test("CEO intent deduplication is accent and word-order tolerant", () => {
  assert.ok(intentSimilarity("Planifier la maintenance préventive", "Maintenance preventive planifier") > 0.7);
  assert.equal(isDuplicateIntent("Préparer le rapport hebdomadaire", ["Rapport hebdomadaire à préparer"]), true);
  assert.equal(isDuplicateIntent("Relancer les factures impayées", ["Planifier la maintenance préventive"]), false);
});

test("automation health surfaces running and degraded states", () => {
  const now = 1_000_000;
  assert.equal(automationHealth({ leaseExpiresAt: now + 1, activeLane: "roles" }, now).level, "running");
  assert.equal(automationHealth({ consecutiveFailures: 3, lastError: "offline" }, now).level, "error");
  assert.equal(automationHealth({ consecutiveFailures: 0, lastSuccessAt: now - 1, updatedAt: now - 1 }, now).level, "healthy");
});

test("every theme keeps selected controls and tertiary text readable", () => {
  const css = ["src/assets/tokens.css", "src/assets/themes.css"]
    .map((file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
    .join("\n");
  const root = parseVars(css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || "");
  const themes = [["default", {}], ...[...css.matchAll(/\[data-theme="([^"]+)"\]\s*\{([\s\S]*?)\}/g)]
    .map((match) => [match[1], parseVars(match[2])])];

  for (const [name, overrides] of themes) {
    const vars = { ...root, ...overrides };
    const selectedBg = resolveVar(vars["--bz-control-selected-bg"], vars);
    const selectedFg = resolveVar(vars["--bz-control-selected-fg"], vars);
    const panel = resolveVar(vars["--bz-panel"], vars);
    const low = resolveVar(vars["--bz-fg-low"], vars);
    const accentText = resolveVar(vars["--bz-purple-100"], vars);
    assert.ok(contrast(selectedBg, selectedFg) >= 4.5, `${name}: selected control contrast`);
    assert.ok(contrast(panel, low) >= 4.5, `${name}: tertiary text contrast`);
    assert.ok(contrast(panel, accentText) >= 4.5, `${name}: accent text contrast`);
  }
});

function parseVars(block) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .map((match) => [match[1], match[2].trim()]));
}

function resolveVar(value, vars, depth = 0) {
  if (depth > 12) return value;
  const match = /^var\((--[\w-]+)\)$/.exec(value || "");
  return match ? resolveVar(vars[match[1]], vars, depth + 1) : value;
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const rgb = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
