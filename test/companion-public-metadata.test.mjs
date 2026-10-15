import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../src/config/web3.config.js';

// Run the actual registration and import functions without wallet, network,
// storage or inference integrations. Metadata construction itself is pure.
const url = new URL('../src/services/companion.service.js', import.meta.url);
let source = await readFile(url, 'utf8');
source = source.replace(/^import \{ (web3Service|luksoService|agentWalletService|walletProviderService|coinbaseAgentWalletService) \} from .*;$/gm, 'const $1 = {};');
source = source.replace(/^import \* as skillOwnershipService from .*;$/m, 'const skillOwnershipService = {};');
source = source.replace(/^import \{ flagshipSkills \} from .*;$/m, 'const flagshipSkills = [];');
source = source.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`);
const { companionService } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('public smart-agent metadata round-trips explicit real workflow IDs without publishing private context', () => {
  const assignedWorkflowIds = ['video-captioning-v1.0.0', 'roleplay-companion-v1.0.0'];
  const metadata = companionService.buildERC8004RegistrationWithSpending({
    name: 'Maya', firstName: 'Maya', gender: 1, age: 25,
    assignedWorkflowIds: [...assignedWorkflowIds, assignedWorkflowIds[0], null],
    instructions: 'PRIVATE INSTRUCTIONS', companyMemory: 'PRIVATE COMPANY MEMORY',
    credentials: { apiKey: 'PRIVATE CREDENTIAL' }, grantedSkills: ['skill.notion_docs'],
  });
  assert.deepEqual(metadata.bonzai.assignedWorkflowIds, assignedWorkflowIds);
  assert.doesNotMatch(JSON.stringify(metadata), /PRIVATE|grantedSkills|skill.notion_docs/);
  const imported = companionService.mapMetadataToCompanion(metadata, 0, { gender: 1 });
  assert.deepEqual(imported.assignedWorkflowIds, assignedWorkflowIds);
  assert.equal(imported.tokenId, 0);
  assert.equal(imported.network, ECONOMY_NETWORK_KEY);
  assert.equal(imported.chainId, CONFIG.companionNFT_BASE.chainId);
  assert.equal(imported.contractAddress, CONFIG.companionNFT_BASE.contractAddress);
  imported.assignedWorkflowIds.push('meditation-forge-v1.0.0');
  assert.deepEqual(metadata.bonzai.assignedWorkflowIds, assignedWorkflowIds, 'Editing a local profile cannot mutate published registration data.');
});

test('empty workflow assignments remain explicit and old metadata imports safely', () => {
  const metadata = companionService.buildERC8004RegistrationWithSpending({ name: 'Maya', assignedWorkflowIds: [] });
  assert.deepEqual(metadata.bonzai.assignedWorkflowIds, []);
  assert.deepEqual(companionService.mapMetadataToCompanion({ name: 'Older profile' }, 1, {}).assignedWorkflowIds, []);
});
