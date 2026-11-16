import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { ethers } from 'ethers';
import solc from 'solc';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../src/config/web3.config.js';

// Replace only app integration imports; execute the actual service functions and
// ethers ABI encoding against a deterministic JSON-RPC contract runner.
async function loadService(filename, walletService) {
  const url = new URL(`../src/services/${filename}`, import.meta.url);
  let source = await readFile(url, 'utf8');
  globalThis.__rewardWallet = walletService;
  source = source.replace(/^import \{ web3Service \} from .*;?$/m, 'const web3Service = globalThis.__rewardWallet;');
  source = source.replace(/^import \{ (getSigner, getProvider, switchNetwork) \} from .*;$/m, 'const { $1 } = globalThis.__rewardWallet;');
  source = source.replace(/^import \{ (agentWalletService|owsService|OWSEthersSigner) \} from .*;$/gm, 'const $1 = {};');
  source = source.replace(/^import \{ canMintContentType, checkAllLevels \} from .*;$/m, 'const canMintContentType = () => ({ canMint: true }); const checkAllLevels = async () => {};');
  source = source.replace(/import \{\s+getPoolInfo as _getPoolInfo,[\s\S]*?\} from '.\/uniswapV4.utils.js';/, 'const _getPoolInfo = () => {}; const getUniswapTradeUrl = () => {}; const getBaseScanUrl = () => {}; const getDexScreenerUrl = () => {};');
  source = source.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => `from '${specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source + `\n//# sourceURL=${filename}`).toString('base64')}`);
}

const wallet = '0x0000000000000000000000000000000000000001';
let failure = false;
let blockNumber = 100;
let confirmedBlock = 100n;
let claimsPaused = true;
let stakeAmount = ethers.parseEther('1000');
const collectionA = '0x0000000000000000000000000000000000000010';
const collectionB = '0x0000000000000000000000000000000000000020';
const modelTokenA = '0x0000000000000000000000000000000000000030';
const modelTokenB = '0x0000000000000000000000000000000000000040';
let modelPublished = true;
let launchRequest = null;
let creatorRecipients = [];
const stakingVault = '0x0000000000000000000000000000000000000002';
const contractCalls = [];
const calls = [];
const iface = new ethers.Interface([
  'event ModelTokenLaunched(address contentCollection,uint256 indexed contentTokenId,address indexed token,bytes32 indexed poolId,string symbol,uint256 ethLiquidity,uint256 positionId,address creator,uint256 timestamp)',
  'function currentEpoch() view returns(uint256)',
  'function epochDuration() view returns(uint256)',
  'function genesisTime() view returns(uint256)',
  'function totalClaimed() view returns(uint256)',
  'function getAllTotalDeposited() view returns(uint256[6])',
  'function getAllPoolThresholds() view returns(uint256[6])',
  'function getEpochInfo(uint256) view returns(uint256 startTime,uint256 endTime,uint256 totalRegistered,bool finalized)',
  'function getEpochHolderDeposits(uint256) view returns(uint256[6])',
  'function qualifiesForPool(address,uint8) view returns(bool)',
  'function registeredBalances(uint256,address) view returns(uint256)',
  'function previewHolderClaim(uint256,uint8,address) view returns(uint256)',
  'function hasClaimedEpoch(uint256,address,uint8) view returns(bool)',
  'function isRegistered(uint256,address) view returns(bool)',
  'function unclaimedRevenue(address) view returns(uint256)',
  'function claimConfirmedBlock(uint256,address) view returns(uint256)',
  'function MIN_CLAIM_BLOCK_GAP() view returns(uint256)',
  'function claimsPaused() view returns(bool)',
  'function paused() view returns(bool)',
  'function isEpochFinalized(uint256) view returns(bool)',
  'function getEpochProviderDeposits(uint256) view returns(uint256[6])',
  'function providerServiceTime(uint256,uint8,address) view returns(uint256)',
  'function totalServiceTime(uint256,uint8) view returns(uint256)',
  'function providerClaimed(uint256,uint8,address) view returns(bool)',
  'function serviceTimeAttestor() view returns(address)',
  'function stakingVault() view returns(address)',
  'function LVL1_THRESHOLD() view returns(uint256)',
  'function positions(address) view returns(uint256 amount,uint256 lockedUntil,uint256 updatedAt,uint32 contributionScore)',
  'function getModelProfile() view returns(string metadataURI,string description,string imageURI,string modelKind,bytes32 validationHash)',
  'function getToken(address collection,uint256 tokenId) view returns(address)',
  'function hasToken(address collection,uint256 tokenId) view returns(bool)',
  'function minEthLiquidity() view returns(uint256)',
  'function launchValidatedToken(address contentCollection,uint256 contentTokenId,string name,string symbol,string metadataURI,string description,string imageURI,string modelKind,bytes32 validationHash,address creator) payable returns(address token,bytes32 poolId)',
  'function creator() view returns(address)',
  'function liquidityVault() view returns(address)',
  'function liquidityPosition(address) view returns(uint256)',
  'function factory() view returns(address)',
  'function positions(uint256) view returns(address currency0,address currency1,address beneficiary,address agentCollection,uint256 agentId,bool registered)',
  'function setCreatorRecipients(uint256 id,address[] wallets,uint16[] shares)',
  'function getCreatorRecipients(uint256) view returns(tuple(address wallet,uint16 bps)[])',
  'function getPoolConfig(bytes32 poolId) view returns(address beneficiary,address companionOwner,uint8 poolType,uint8 mintPoolIndex,bool active)',
  'function routeIdFor(address publisher,bytes32 sourceAssetId) pure returns(bytes32)',
  'function registerRoute(bytes32 assetId,string metadataURI,address[] wallets,uint16[] baseBps,uint16[] contributionScores,string[] roles) returns(bytes32)',
]);
const provider = { getBlockNumber: async () => blockNumber, call: async ({ data, to }) => {
  if (failure) throw new Error('RPC unavailable');
  const fn = iface.getFunction(data.slice(0, 10));
  const args = iface.decodeFunctionData(fn, data);
  calls.push(fn.name);
  contractCalls.push({ name: fn.name, to, args });
  if (fn.name === 'getToken') return iface.encodeFunctionResult(fn, [!modelPublished ? ethers.ZeroAddress : args[0].toLowerCase() === collectionA ? modelTokenA : modelTokenB]);
  if (fn.name === 'hasToken') return iface.encodeFunctionResult(fn, [modelPublished]);
  if (fn.name === 'minEthLiquidity') return iface.encodeFunctionResult(fn, [ethers.parseEther('0.01')]);
  if (fn.name === 'liquidityVault' || fn.name === 'factory') return iface.encodeFunctionResult(fn, [wallet]);
  if (fn.name === 'liquidityPosition') return iface.encodeFunctionResult(fn, [1n]);
  if (fn.name === 'positions' && fn.inputs[0].type === 'uint256') return iface.encodeFunctionResult(fn,[ethers.ZeroAddress,modelTokenA,wallet,ethers.ZeroAddress,0n,true]);
  if (fn.name === 'getCreatorRecipients') return iface.encodeFunctionResult(fn, [creatorRecipients]);
  if (fn.name === 'creator') return iface.encodeFunctionResult(fn, [wallet]);
  if (fn.name === 'getPoolConfig') return iface.encodeFunctionResult(fn, [wallet, ethers.ZeroAddress, 1n, 5n, true]);
  if (fn.name === 'routeIdFor') return iface.encodeFunctionResult(fn, [ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'bytes32'], args))]);
  if (fn.name === 'getModelProfile') return iface.encodeFunctionResult(fn, ['ipfs://model', 'A tested model', 'ipfs://image', 'fine_tuned', ethers.id('validation')]);
  if (fn.name === 'paused' || fn.name === 'providerClaimed') return iface.encodeFunctionResult(fn, [false]);
  if (fn.name === 'getEpochProviderDeposits') return iface.encodeFunctionResult(fn, [Array(6).fill(ethers.parseEther('2'))]);
  if (fn.name === 'providerServiceTime') return iface.encodeFunctionResult(fn, [10n]);
  if (fn.name === 'totalServiceTime') return iface.encodeFunctionResult(fn, [20n]);
  if (fn.name === 'claimsPaused') return iface.encodeFunctionResult(fn, [claimsPaused]);
  if (fn.name === 'serviceTimeAttestor') return iface.encodeFunctionResult(fn, [wallet]);
  if (fn.name === 'stakingVault') return iface.encodeFunctionResult(fn, [stakingVault]);
  if (fn.name === 'LVL1_THRESHOLD') return iface.encodeFunctionResult(fn, [ethers.parseEther('1000')]);
  if (fn.name === 'positions') return iface.encodeFunctionResult(fn, [stakeAmount, 0n, 123456n, 0n]);
  if (fn.name === 'claimConfirmedBlock') return iface.encodeFunctionResult(fn, [confirmedBlock]);
  if (fn.name === 'MIN_CLAIM_BLOCK_GAP') return iface.encodeFunctionResult(fn, [2n]);
  if (fn.name === 'getEpochInfo') return iface.encodeFunctionResult(fn, [1n, 2n, ethers.parseEther('1000'), true]);
  if (['getAllTotalDeposited', 'getAllPoolThresholds', 'getEpochHolderDeposits'].includes(fn.name)) return iface.encodeFunctionResult(fn, [Array(6).fill(ethers.parseEther('0.5'))]);
  if (['currentEpoch', 'epochDuration', 'genesisTime', 'totalClaimed', 'registeredBalances'].includes(fn.name)) return iface.encodeFunctionResult(fn, [1n]);
  return iface.encodeFunctionResult(fn, [fn.name === 'previewHolderClaim' || fn.name === 'unclaimedRevenue' ? ethers.parseEther('1.25') : true]);
} };
CONFIG.mintPool.contractAddress = wallet;
CONFIG.skillRegistry.ownershipContractAddress = wallet;
CONFIG.p2pNetwork.serviceTimeAddress = wallet;
CONFIG.fineTuneTokenFactory.contractAddress = wallet;
CONFIG.stakingEconomy.revenueRouterAddress = wallet;
CONFIG.uniswap[ECONOMY_NETWORK_KEY].feeHook = wallet;
const mockWeb3 = { state: { walletAddress: wallet }, getProvider: async () => provider, getSigner: async () => ({ getAddress: async () => wallet }), switchNetwork: async () => { throw new Error('Unexpected wallet mutation'); } };
const { mintPoolService } = await loadService('mintPool.service.js', mockWeb3);
const { getUnclaimedRevenue, getUnclaimedRevenueUSDC } = await loadService('skillOwnership.service.js', mockWeb3);
const serviceTime = await loadService('serviceTime.service.js', mockWeb3);
const agentService = await loadService('agent.service.js', mockWeb3);
const { fineTuneTokenService } = await loadService('fineTuneToken.service.js', mockWeb3);
const { contentHashForRegistry } = await loadService('contributionRegistry.service.js', mockWeb3);
const { bonzaiRevenueRouterService, normalizeRouteParticipants } = await loadService('bonzaiRevenueRouter.service.js', mockWeb3);

test('holder preview calls the implemented selector and preserves wei precision', async () => {
  assert.equal(await mintPoolService.previewClaim(1, 0), ethers.parseEther('1.25'));
  assert.equal(calls.at(-1), 'previewHolderClaim');
});

test('epoch statistics read holder deposits from the deployed contract selector', async () => {
  await mintPoolService.fetchPoolStats();
  assert.ok(calls.includes('getEpochHolderDeposits'));
  assert.deepEqual([...mintPoolService.state.latestFinalizedEpoch.deposits], Array(6).fill(0.5));
});

test('unavailable reward reads do not masquerade as zero or unregistered', async () => {
  failure = true;
  try {
    await assert.rejects(mintPoolService.previewClaim(1, 0), /RPC unavailable/);
    await assert.rejects(mintPoolService.hasClaimedEpoch(1, 0), /RPC unavailable/);
    await assert.rejects(mintPoolService.isRegisteredForEpoch(1), /RPC unavailable/);
    await assert.rejects(getUnclaimedRevenue(wallet), /RPC unavailable/);
  } finally { failure = false; }
});

test('skill ownership revenue uses the deployed native ETH getter and 18 decimals', async () => {
  assert.equal(await getUnclaimedRevenue(wallet), '1.25');
  assert.equal(calls.at(-1), 'unclaimedRevenue');
  await assert.rejects(getUnclaimedRevenueUSDC(wallet), /paid in ETH/);
});

test('claim confirmation survives reload and cannot be claimed before its block gap', async () => {
  assert.deepEqual(await mintPoolService.getClaimStatus(1), { confirmedBlock: 100, blocksRemaining: 2, claimReady: false });
  blockNumber = 102;
  assert.deepEqual(await mintPoolService.getClaimStatus(1), { confirmedBlock: 100, blocksRemaining: 0, claimReady: true });
  confirmedBlock = 0n;
  assert.deepEqual(await mintPoolService.getClaimStatus(1), { confirmedBlock: 0, blocksRemaining: 0, claimReady: false });
});

test('provider eligibility uses the actual MintPool stake vault and paused claims override stake', async () => {
  let eligibility = await serviceTime.checkEligibility();
  assert.equal(eligibility.balance, ethers.parseEther('1000'));
  assert.equal(contractCalls.find(call => call.name === 'positions').to.toLowerCase(), stakingVault);
  assert.equal(eligibility.stakeEligible, true);
  assert.equal(eligibility.claimsPaused, true);
  assert.equal(eligibility.ok, false);
  assert.equal(eligibility.submissionAvailable, false);
  claimsPaused = false;
  stakeAmount = 0n;
  eligibility = await serviceTime.checkEligibility();
  assert.equal(eligibility.ok, false);
  assert.equal(eligibility.stakeEligible, false);
  assert.equal((await serviceTime.flushPending()).skipped, 'verified_service_receipts_required');
});

test('free skill execution creates no synthetic USDC payment or transaction history', async () => {
  assert.deepEqual(await agentService.payRunningFee('skill'), { success: true, free: true, amount: '0', txHash: null });
  assert.deepEqual(agentService.agentService.getTransactionHistory(), []);
  assert.equal(agentService.agentService.runningFee, 0);
});

test('agent execution reports work and never claims an execution fee was paid', async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => JSON.stringify({ [wallet]: { owned: { purchasedAt: 1 } } }) };
  const statuses = [];
  try {
    const result = await agentService.executeAgentWithFee({ id: 'owned', execute: async () => 'done' }, {}, { updateStatus: status => statuses.push(status) });
    assert.equal(result.success, true);
    assert.equal(result.feeTxHash, null);
    assert.deepEqual(statuses, ['Executing agent...']);
    const failure = await agentService.executeAgentWithFee({ id: 'owned', execute: async () => { throw new Error('failed'); } });
    assert.equal(failure.feePaid, false);
    assert.equal(failure.feeTxHash, null);
  } finally { globalThis.localStorage = originalStorage; }
});

test('published contribution digests remain the original proof instead of being hashed twice', () => {
  const digest = ethers.id('dataset content');
  assert.equal(contentHashForRegistry(digest), digest);
  assert.equal(contentHashForRegistry('dataset content'), digest);
});

test('model profile queries the issued token instead of a nonexistent factory selector', async () => {
  const token = '0x0000000000000000000000000000000000000003';
  const profile = await fineTuneTokenService.getTokenProfile(token);
  assert.equal(profile.imageURI, 'ipfs://image');
  assert.equal(profile.validationHash, ethers.id('validation'));
  assert.equal(contractCalls.at(-1).name, 'getModelProfile');
  assert.equal(contractCalls.at(-1).to.toLowerCase(), token);
});

test('model identity includes its collection, so equal NFT IDs resolve independently', async () => {
  assert.equal(await fineTuneTokenService.getModelToken(collectionA, 1), modelTokenA);
  assert.equal(await fineTuneTokenService.getModelToken(collectionB, 1), modelTokenB);
  assert.equal(await fineTuneTokenService.hasToken(collectionA, 1), true);
  await fineTuneTokenService.getModelProfile(collectionB, 1);
  assert.equal(contractCalls.at(-1).to.toLowerCase(), modelTokenB);
  await assert.rejects(fineTuneTokenService.getModelToken(undefined, 1), /original model NFT collection/);
  failure = true;
  try { await assert.rejects(fineTuneTokenService.hasToken(collectionA, 1), /RPC unavailable/); }
  finally { failure = false; }
});

test('model publication encodes the original NFT collection and publisher metadata', async () => {
  const originalSwitch = mockWeb3.switchNetwork;
  const originalBrowser = mockWeb3.getBrowserProvider;
  const signer = {
    provider, call: provider.call, getAddress: async () => wallet,
    sendTransaction: async request => { launchRequest = request; throw new Error('Stopped at simulated wallet signing'); },
  };
  modelPublished = false;
  mockWeb3.switchNetwork = async () => {};
  mockWeb3.getBrowserProvider = async () => ({ getSigner: async () => signer });
  try {
    const result = await fineTuneTokenService.launchFineTuneToken(collectionB, 1, 'Model', 'MODEL', 'ipfs://model', '0.01', {
      profile: { description: 'Publisher description', image: 'ipfs://image' }, validationHash: ethers.id('publisher attestation'),
    });
    assert.equal(result.success, false);
    assert.match(result.error, /simulated wallet signing/);
    const args = iface.decodeFunctionData('launchValidatedToken', launchRequest.data);
    assert.equal(args.contentCollection.toLowerCase(), collectionB);
    assert.equal(args.contentTokenId, 1n);
    assert.equal(args.validationHash, ethers.id('publisher attestation'));
    assert.equal(args.creator.toLowerCase(), wallet);
    assert.equal(launchRequest.value, ethers.parseEther('0.01'));
  } finally {
    modelPublished = true;
    creatorRecipients = [];
    mockWeb3.switchNetwork = originalSwitch;
    mockWeb3.getBrowserProvider = originalBrowser;
  }
});

test('invalid supplied revenue plans reject instead of silently giving their share to other wallets', () => {
  const valid = { wallet, shareBps: 5000, score: 0 };
  for (const participant of [
    { ...valid, wallet: 'invalid' }, { ...valid, wallet: ethers.ZeroAddress },
    ...[NaN, Infinity, -1, 10001, 1.5, '', false].map(shareBps => ({ ...valid, wallet: collectionA, shareBps })),
    ...[NaN, Infinity, -1, 10001, 1.5, '', false].map(score => ({ ...valid, wallet: collectionA, score })),
    null,
  ]) assert.throws(() => normalizeRouteParticipants([valid, participant], modelTokenA));
  assert.throws(() => normalizeRouteParticipants([valid, { ...valid, wallet: wallet.toUpperCase().replace('0X', '0x') }]), /Duplicate/);
  assert.throws(() => normalizeRouteParticipants([{ ...valid, shareBps: 0 }], modelTokenA), /positive total/);
  assert.throws(() => normalizeRouteParticipants([{ wallet }], modelTokenA), /share/);
  assert.throws(() => normalizeRouteParticipants(null, wallet), /array/);
  assert.deepEqual(normalizeRouteParticipants([], wallet), [{ wallet, role: 'publisher', score: 7000, bps: 10000 }]);
  const plan = normalizeRouteParticipants([
    { ...valid, shareBps: 3333 }, { wallet: collectionA, shareBps: 6666 }, { wallet: collectionB, shareBps: 0 },
  ]);
  assert.equal(plan.reduce((sum, p) => sum + p.bps, 0), 10000);
  assert.equal(plan[0].score, 0);
  assert.equal(plan[2].bps, 0);
});

test('model fee routes remain under the original token creator after an NFT transfer', async () => {
  const originalSwitch = mockWeb3.switchNetwork;
  const originalBrowser = mockWeb3.getBrowserProvider;
  let publisher = collectionA;
  let request = null;
  const signer = { provider, call: provider.call, getAddress: async () => publisher,
    sendTransaction: async tx => { request = tx; throw new Error('Stopped at simulated route signing'); },
  };
  mockWeb3.switchNetwork = async () => {};
  mockWeb3.getBrowserProvider = async () => ({ getSigner: async () => signer });
  const poolId = ethers.id('model pool');
  const model = { id: 'model', nft: { contractAddress: collectionA, tokenId: 1 }, fineTuneToken: { tokenAddress: modelTokenA, poolId } };
  try {
    await assert.rejects(bonzaiRevenueRouterService.registerModelRevenueRoute({ nft: model.nft }), /Launch the model token/);
    await assert.rejects(bonzaiRevenueRouterService.registerModelRevenueRoute(model), /Only the original model token creator/);
    assert.equal(request, null);
    publisher = wallet;
    await assert.rejects(bonzaiRevenueRouterService.registerModelRevenueRoute(model), /simulated route signing/);
    const args = iface.decodeFunctionData('setCreatorRecipients', request.data);
    assert.equal(args.id, 1n);
    assert.deepEqual([...args.wallets], [wallet]);
    assert.deepEqual([...args.shares], [10000n]);
    request = null;
    creatorRecipients = [[wallet, 10000n]];
    const recovered = await bonzaiRevenueRouterService.registerModelRevenueRoute(model);
    assert.equal(recovered.alreadyConfigured, true);
    assert.equal(request, null, 'a confirmed assignment must not ask for another transaction');
    creatorRecipients = [[collectionA, 10000n]];
    await assert.rejects(bonzaiRevenueRouterService.registerModelRevenueRoute(model), /different plan/);
    assert.equal(request, null);
  } finally {
    creatorRecipients = [];
    mockWeb3.switchNetwork = originalSwitch;
    mockWeb3.getBrowserProvider = originalBrowser;
  }
});

test('provider and skill registry client ABIs match the compiled Solidity contracts', async () => {
  const names = ['BonzaiServiceTime', 'BonzaiSkillRegistry'];
  const sources = Object.fromEntries(await Promise.all(names.map(async name => [`${name}.sol`, { content: await readFile(new URL(`../src/contracts/${name}.sol`, import.meta.url), 'utf8') }])));
  // ABI-only compilation is in memory: no generated artifacts or Hardhat cache.
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { outputSelection: { '*': { '*': ['abi'] } } } }), {
    import: path => { try { return { contents: readFileSync(new URL(`../node_modules/${path}`, import.meta.url), 'utf8') }; } catch { return { error: `Missing ${path}` }; } },
  }));
  assert.deepEqual((output.errors || []).filter(error => error.severity === 'error'), []);
  for (const [file, variable, name] of [
    ['serviceTime.service.js', 'SERVICE_TIME_ABI', 'BonzaiServiceTime'],
    ['agent.service.js', 'SKILL_REGISTRY_ABI', 'BonzaiSkillRegistry'],
  ]) {
    const source = await readFile(new URL(`../src/services/${file}`, import.meta.url), 'utf8');
    const block = source.match(new RegExp(`const ${variable} = \\[([\\s\\S]*?)\\n\\];`))[1];
    const declarations = [...block.matchAll(/^[ \t]*['"](function [^'"\n]+|event [^'"\n]+)['"],?$/gm)].map(match => match[1]);
    const client = new ethers.Interface(declarations);
    const actual = new ethers.Interface(output.contracts[`${name}.sol`][name].abi);
    for (const fragment of client.fragments) {
      if (fragment.type === 'function') {
        const deployed = actual.getFunction(fragment.selector);
        assert.ok(deployed, `${file}: ${fragment.name} must exist onchain`);
        assert.deepEqual(fragment.outputs.map(output => output.format('sighash')), deployed.outputs.map(output => output.format('sighash')), `${file}: ${fragment.name} return types`);
      } else if (fragment.type === 'event') {
        const deployed = actual.getEvent(fragment.topicHash);
        assert.ok(deployed, `${file}: ${fragment.name} event signature`);
        assert.deepEqual(fragment.inputs.map(input => Boolean(input.indexed)), deployed.inputs.map(input => Boolean(input.indexed)));
      }
    }
  }
});


test('provider reward preview preserves earned claims after unstaking and honors the explicit claims pause', async () => {
  const originalStake = stakeAmount, originalPaused = claimsPaused;
  try {
    claimsPaused = false; stakeAmount = ethers.parseEther('1000');
    let result = await serviceTime.fetchProviderRewards(wallet, 0);
    assert.equal(result.rows.length, 6);
    assert.equal(result.rows[0].amount, '1.0');
    assert.equal(result.rows[0].canClaim, true);
    stakeAmount = 0n;
    result = await serviceTime.fetchProviderRewards(wallet, 0);
    assert.equal(result.stakeEligible, false);
    assert.equal(result.rows[0].canClaim, true);
    stakeAmount = ethers.parseEther('1000'); claimsPaused = true;
    assert.equal((await serviceTime.fetchProviderRewards(wallet, 0)).rows[0].canClaim, false);
    await assert.rejects(serviceTime.claimProviderRewards(0, 0, wallet), /paused/);
    await assert.rejects(serviceTime.fetchProviderRewards(wallet, 2), /existing reward period/);
  } finally { stakeAmount = originalStake; claimsPaused = originalPaused; }
});


test('model launch recovery verifies the factory receipt and never resubmits liquidity', async () => {
  const original = provider.getTransactionReceipt;
  try {
    provider.getTransactionReceipt = async () => null;
    assert.deepEqual(await fineTuneTokenService.recoverLaunch(collectionA, 1, ethers.id('tx')), { pending: true });
    provider.getTransactionReceipt = async () => ({status:0});
    assert.deepEqual(await fineTuneTokenService.recoverLaunch(collectionA, 1, ethers.id('tx')), { reverted: true });
    const log = iface.encodeEventLog(iface.getEvent('ModelTokenLaunched'), [collectionA, 1, modelTokenA, ethers.id('pool'), 'MODEL', ethers.parseEther('0.01'), 1, wallet, 100]);
    provider.getTransactionReceipt = async () => ({status:1,hash:ethers.id('tx'),logs:[{...log,address:wallet}]});
    const result = await fineTuneTokenService.recoverLaunch(collectionA, 1, ethers.id('tx'));
    assert.equal(result.tokenAddress.toLowerCase(),modelTokenA);
    assert.equal(result.contributionRouting.mode,'allocation-pending');
    await assert.rejects(fineTuneTokenService.recoverLaunch(collectionB, 1, ethers.id('tx')), /No matching model launch/);
    provider.getTransactionReceipt = async () => ({status:1,hash:ethers.id('tx'),logs:[{...log,address:collectionB}]});
    await assert.rejects(fineTuneTokenService.recoverLaunch(collectionA, 1, ethers.id('tx')), /No matching model launch/);
  } finally {provider.getTransactionReceipt = original;}
});
