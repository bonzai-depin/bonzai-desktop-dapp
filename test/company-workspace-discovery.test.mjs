import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceDiscovery } from '../src/services/company/workspaceDiscovery.js';
import { WORKFLOW_PRESETS } from '../src/services/company/workspacePresets.js';
import { filterTemplates } from '../src/services/company/templateCatalog.js';

test('pre-purchase discovery lists the real setup catalog and excludes disabled workflows and roleplay', () => {
  const catalog = [
    { id: 'meditation-forge-v1.0.0', name: 'Meditation Forge', inputs: { duration: { label: 'Minutes' }, intention: { label: 'Intention' } }, requirements: { requiredApis: ['llm', 'audio', 'image'] } },
    { id: 'roleplay-companion-v1.0.0', name: 'Roleplay' },
    { id: 'disabled-test', name: 'Not available', disabled: true },
    { id: 'local-import', name: 'My local workflow', metadata: { workspaceCategory: 'research' }, inputs: { sourceFile: {} } },
  ];
  const cards = workspaceDiscovery(catalog);
  assert.equal(cards.length, WORKFLOW_PRESETS.length + 2);
  assert.equal(cards.some(item => /roleplay|disabled/.test(item.id)), false);
  const meditation = cards.find(item => item.id.startsWith('meditation'));
  assert.deepEqual(meditation.catalogInputs, ['Minutes', 'Intention']);
  assert.deepEqual(meditation.catalogTools, ['Text', 'Audio', 'Images']);
  assert.ok(meditation.catalogDeliverables.includes('Guided narration'));
  assert.equal(meditation.demoKind, null, 'do not pretend a live-generation demo exists');
  assert.equal(cards.find(item => item.id === 'local-import').catalogInputs[0], 'Source File');
  assert.equal(cards.find(item => item.id === 'government_grants').demoKind, 'grants');
  assert.equal(cards.find(item => item.id === 'invoice').demoKind, 'billing');
});
test('outcome search and localized catalog work without a workspace license', () => {
  const cards = workspaceDiscovery([], 'fr');
  assert.ok(filterTemplates(cards, { query: 'facturation', locale: 'fr' }).some(item => item.id === 'invoice'));
  assert.equal(cards.find(item => item.id === 'hvac_gmao').catalogTitle, 'Maintenance CVC');
  assert.ok(cards.every(item => item.catalogInputs.length && item.catalogDeliverables.length));
});
