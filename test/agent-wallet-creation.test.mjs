import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const saved = new Map(), wallets = new Map();
let creations = 0, persist = true;
globalThis.window = { electronAPI: { store: {
  get: async key => saved.get(key),
  set: async (key, value) => { if (!persist) return false; saved.set(key, value); return true; },
} } };
globalThis.__agentWalletCreation = {
  agentWalletService: { hasAgentWallet: async () => false },
  privyService: { getServerWalletMapping: async () => null, createServerWallet: async () => { throw Error('Unimplemented cloud wallet must not be used'); } },
  owsService: {
    getWallet: async name => wallets.get(name) || { error: 'Wallet not found' },
    createWallet: async name => { creations++; const result = { name, address: `0x${String(creations).padStart(40, '0')}` }; wallets.set(name, result); return result; },
  },
};
const url = new URL('../src/services/walletProvider.service.js', import.meta.url);
let source = await readFile(url, 'utf8');
source = source.replace(/^import \{ (agentWalletService|privyService|owsService) \} from .*$/gm, 'const { $1 } = globalThis.__agentWalletCreation;');
source = source.replace(/^import \{ (OWSEthersSigner|owsMigrationService) \} from .*$/gm, 'const $1 = {};');
source = source.replace(/^import \{ walletCredentials, ensureOWSPassphrase \} from .*$/m, 'const walletCredentials = {}; const ensureOWSPassphrase = async () => "test-only-secret";');
source = source.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`);
source = source.replace(/import\('ethers'\)/g, `import('${import.meta.resolve('ethers')}')`);
const { walletProviderService: service } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('email owners create local agent wallets and repeated launches retain the same identity', async () => {
  service.registerWeb3Service({ state: { authProvider: 'privy' } });
  const first = await service.createAgentWallet('agent-1', { firstName: 'Maya', lastName: 'Studio' });
  assert.equal(first.provider, 'ows');
  assert.equal((await service.createAgentWallet('agent-1')).address, first.address);
  assert.equal(creations, 1);
  const second = await service.createAgentWallet('agent-2', { firstName: 'Maya', lastName: 'Studio' });
  assert.notEqual(first.address, second.address, 'equally named agents must not share a wallet');
});

test('retry after a failed mapping write recovers the existing vault wallet', async () => {
  persist = false;
  const before = creations;
  await assert.rejects(service.createAgentWallet('agent-retry'), /mapping could not be saved/);
  assert.equal(creations, before + 1);
  persist = true;
  const recovered = await service.createAgentWallet('agent-retry');
  assert.equal(creations, before + 1);
  assert.equal(recovered.provider, 'ows');
});
