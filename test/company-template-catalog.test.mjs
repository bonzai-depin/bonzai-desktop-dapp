import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE_GROUPS, TEMPLATE_PRESENTATION, templatePresentation, filterTemplates } from '../src/services/company/templateCatalog.js';
import { PAPERASSE_TEMPLATES } from '../src/services/company/paperasseTeams.js';
import { workflowTeamPresets } from '../src/services/company/workflowTeams.js';
import { operationText } from '../src/i18n/operations.js';

const workflows = Object.keys(TEMPLATE_PRESENTATION).map(id => ({ id, title: id, templateId: id === 'hvac_gmao' ? 'hvac_residential' : id, connectors: ['qonto'], goals: ['Preserve this executable task'] }));
test('every catalog template is available by default and belongs to exactly one business category', () => {
  const all = filterTemplates(workflows);
  assert.equal(all.length, workflows.length);
  assert.equal(new Set(all.map(row => row.id)).size, workflows.length);
  const grouped = TEMPLATE_GROUPS.filter(group => group.id !== 'all').flatMap(group => filterTemplates(workflows, { category: group.id }));
  assert.equal(grouped.length, workflows.length);
  for (const id of Object.keys(PAPERASSE_TEMPLATES)) assert.ok(all.some(row => row.id === id), `${id} is discoverable`);
});
test('French template search works by title, description and tool without requiring accents', () => {
  assert.deepEqual(filterTemplates(workflows, { query: 'devis commandes', locale: 'fr' }).map(row => row.id), ['purchasing_team']);
  assert.deepEqual(filterTemplates(workflows, { query: 'cloture', locale: 'fr' }).map(row => row.id), ['paperasse_accounting']);
  assert.equal(filterTemplates(workflows, { query: 'QONTO', category: 'finance', locale: 'fr' }).length, 4);
  assert.equal(filterTemplates(workflows, { query: 'not a real business template' }).length, 0);
});
test('business browsing separates grants, purchasing, sales, accounting and legal work', () => {
  assert.deepEqual(filterTemplates(workflows, { category: 'grants' }).map(row => row.id), ['government_grants']);
  assert.deepEqual(filterTemplates(workflows, { category: 'purchasing' }).map(row => row.id), ['purchasing_team']);
  assert.deepEqual(filterTemplates(workflows, { category: 'sales' }).map(row => row.id), ['sales_team', 'leads']);
  assert.deepEqual(filterTemplates(workflows, { category: 'accounting' }).map(row => row.id), ['paperasse_accounting', 'paperasse_tax_review', 'paperasse_personal_tax']);
  assert.deepEqual(filterTemplates(workflows, { category: 'compliance' }).map(row => row.id), ['paperasse_audit', 'paperasse_notarial']);
  assert.ok(filterTemplates(workflows, { category: 'property' }).some(row => row.id === 'paperasse_property'));
  assert.ok(!TEMPLATE_GROUPS.some(group => group.id === 'studio'));
});
test('template previews describe deliverables and can be found by their output', () => {
  const maintenance = templatePresentation(workflows.find(row => row.id === 'hvac_gmao'), 'fr-FR');
  assert.equal(maintenance.catalogCategory, 'Maintenance et interventions');
  assert.ok(maintenance.catalogDeliverables.includes('Rapports d’intervention'));
  assert.deepEqual(filterTemplates(workflows, { query: 'intervention reports' }).map(row => row.id), ['hvac_gmao']);
  for (const workflow of filterTemplates(workflows)) assert.ok(workflow.catalogDeliverables.length >= 2, workflow.id);
});
test('unclassified imported templates stay visible in the custom category', () => {
  const custom = { id: 'business-experiment', title: 'Business experiment', category: 'unknown-legacy-category' };
  assert.equal(filterTemplates([custom], { category: 'custom' })[0].id, custom.id);
  assert.equal(custom.category, 'unknown-legacy-category', 'browsing does not mutate saved data');
});
test('catalog localization cannot change the workflow, selected team or operational instructions', () => {
  const original = structuredClone(workflows[0]);
  const french = templatePresentation(workflows[0], 'fr');
  assert.equal(french.catalogTitle, 'Gestion de maintenance assistée par ordinateur (GMAO)');
  assert.equal(french.templateId, 'hvac_residential');
  assert.deepEqual(french.goals, original.goals); assert.deepEqual(french.connectors, original.connectors);
  assert.deepEqual(workflows[0], original);
  assert.equal(templatePresentation(workflows[0], 'en').catalogTitle, 'Computerized Maintenance Management System');
});
test('professional setup requirements and starter work are translated into French', () => {
  for (const template of Object.values(PAPERASSE_TEMPLATES)) {
    for (const source of [...template.initialGoals, ...template.intakeQuestions.map(question => question.label)]) {
      assert.notEqual(operationText(source, 'fr'), source, source);
    }
  }
});

test('built-in production templates explain their outputs in French without changing the workflow', () => {
  const preset = workflowTeamPresets([{id:'meditation-forge-v1.0.0',name:'Meditation Forge',description:'Create a guided meditation.'}])[0];
  const localized = templatePresentation(preset, 'fr');
  assert.equal(localized.catalogDescription, 'Une méditation guidée prête à écouter');
  assert.ok(localized.catalogDeliverables.includes('Narration guidée'));
  assert.equal(localized.executionWorkflowId, preset.executionWorkflowId);
});
