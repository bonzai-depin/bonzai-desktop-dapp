import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../src/components/company/${name}`, import.meta.url), 'utf8');
const dashboard = read('CompanyDashboard.vue');
const feed = read('CompanyLiveFeed.vue');
const template = dashboard.slice(0, dashboard.indexOf('<script'));
const exposed = dashboard.slice(dashboard.lastIndexOf('return {'));

test('the work list renders: planning reads goals from a binding the dashboard exposes', () => {
  // A name that setup() does not return throws during render and leaves the
  // owner unable to open the work list, schedules or outcome reviews at all.
  const binding = template.match(/<CompanyPlanning[^>]*:goals="([A-Za-z]+)"/)?.[1];
  assert.ok(binding, 'CompanyPlanning receives goals from a single named binding');
  assert.match(exposed, new RegExp(`\\b${binding}\\b`), `${binding} is returned from setup()`);
});

test('the audit trail can be exported from the activity view the owner can open', () => {
  // The export is the owner's only way to take the tamper-evident history out
  // of the app, so it must sit on a reachable view, not an unlinked panel.
  assert.match(feed, /\$emit\('export-audit'\)/);
  assert.match(template, /<CompanyLiveFeed[^>]*@export-audit="exportAuditTrail"/);
  assert.match(exposed, /\bexportAuditTrail\b/);
});

test('a task shows as overdue when its outcome has missed its deadline', () => {
  assert.match(template, /v-if="item\.goal\?\.overdue \|\| item\.issue\?\.overdue"/);
});
