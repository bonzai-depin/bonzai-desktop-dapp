import {mintLicenseStatus} from './mintValidation.js';
// Social-token reads and minted-agent-only reserve issuance.
import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { verifyAgentIssuance, verifyMintedAgent, hasMintReference } from './agentMintEligibility.js';
import { assertLaunchWallet } from './smartAgentLaunch.js';
import { BonzaiSmartAgentsABI } from '../contracts/abi/BonzaiSmartAgents.abi.js';
import { BonzaiAgentTokenFactoryABI } from '../contracts/abi/BonzaiAgentTokenFactory.abi.js';
import {
  getPoolInfo as _getPoolInfo,
  getUnclaimedFees as _getUnclaimedFees,
  claimFees as _claimFees,
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
} from './uniswapV4.utils.js';

// Factory ABI - V4 interface
const FACTORY_ABI = [
  // Read functions
  'function companionTokens(uint256 nftTokenId) view returns (address)',
  'function hasToken(uint256 nftTokenId) view returns (bool)',
  'function getToken(uint256 nftTokenId) view returns (address)',
  'function minEthLiquidity() view returns (uint256)',
  'function totalTokensLaunched() view returns (uint256)',
  'function getAllTokens() view returns (address[])',
  'function TOTAL_SUPPLY() view returns (uint256)',

  // Events
  'event CompanionTokenLaunched(uint256 indexed nftTokenId, address indexed token, bytes32 indexed poolId, string symbol, uint256 ethLiquidity, uint256 positionId, uint256 timestamp)',
];

// Companion Token ABI
const TOKEN_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function imageURI() view returns (string)',
  'function agentWallet() view returns (address)',
  'function companionId() view returns (uint256)',
  'function getTokenInfo() view returns (string name_, string symbol_, uint8 decimals_, string image_, address agentWallet_, uint256 companionId_)',
];

// Service state
const state = reactive({
  isLoading: false,
  error: null,
  launchingCompanionId: null,
});
const economyNetwork = () => ECONOMY_NETWORK_KEY;

/**
 * Get factory contract instance
 * @param {boolean} withSigner - Whether to attach signer
 * @returns {Promise<ethers.Contract>}
 */
async function getFactoryContract(withSigner = false) {
  const factoryAddress = CONFIG.companionTokenFactory?.contractAddress || CONFIG.smartAgentIssuance?.factoryAddress;
  if (!factoryAddress) {
    throw new Error('Companion token factory not deployed. Set CONFIG.companionTokenFactory.contractAddress');
  }

  const provider = await web3Service.getProvider(economyNetwork());

  if (withSigner) {
    await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
    const browserProvider = await web3Service.getBrowserProvider();
    const signer = await browserProvider.getSigner();
    return new ethers.Contract(factoryAddress, factoryAddress === CONFIG.smartAgentIssuance?.factoryAddress ? BonzaiAgentTokenFactoryABI : FACTORY_ABI, signer);
  }

  return new ethers.Contract(factoryAddress, factoryAddress === CONFIG.smartAgentIssuance?.factoryAddress ? BonzaiAgentTokenFactoryABI : FACTORY_ABI, provider);
}

/**
 * Verify a persisted NFT reference against the configured onchain collection
 *
 * @param {Object} companion - Companion data object
 * @param {string} companion.id - Unique companion ID
 * @param {string} companion.name - Full companion name
 * @param {string} companion.firstName - First name (becomes symbol)
 * @param {string} companion.agentWallet - Agent wallet address
 * @param {string} companion.imageIPFS - IPFS image URI (optional)
 * @param {number} companion.tokenId - NFT token ID (must be > 0)
 *
 * @returns {Promise<Object>} Launch result with token address and poolId
 */
async function verifyMint(companion) {
  if (!hasMintReference(companion)) throw new Error('Mint an agent slot onchain first.');
  const allowed = [CONFIG.smartAgentIssuance, CONFIG.companionNFT_BASE].find(entry =>
    entry?.contractAddress?.toLowerCase() === companion.contractAddress.toLowerCase() && Number(entry.chainId) === Number(companion.chainId));
  if (!allowed) throw new Error('This agent is not from a configured collection on this network.');
  const provider = await web3Service.getProvider(economyNetwork());
  const minted = await verifyMintedAgent(companion, { collection: allowed.contractAddress, chainId: allowed.chainId, provider,
    contract: new ethers.Contract(allowed.contractAddress, ['function ownerOf(uint256) view returns(address)'], provider) });
  const factoryAddress = allowed === CONFIG.smartAgentIssuance ? allowed.factoryAddress : CONFIG.companionTokenFactory?.contractAddress;
  if (!factoryAddress) return { ...minted, tokenAddress: null };
  const factory = new ethers.Contract(factoryAddress, ['function companionContract() view returns(address)', 'function getToken(uint256) view returns(address)'], provider);
  if ((await factory.companionContract()).toLowerCase() !== allowed.contractAddress.toLowerCase()) throw new Error('Wrong agent registry.');
  const token = await factory.getToken(minted.id);
  const identity = allowed === CONFIG.smartAgentIssuance
    ? await new ethers.Contract(allowed.contractAddress, BonzaiSmartAgentsABI, provider).getIdentity(minted.id) : null;
  return { ...minted, ready: identity?.ready ?? true, tokenAddress: token === ethers.ZeroAddress ? null : token };
}

// Read owned slots from the configured collection; imports never establish ownership.
async function getOwnedAgentSlots() {
  const config = CONFIG.smartAgentIssuance;
  const wallet = web3Service.state.walletAddress;
  if (!wallet) throw new Error('Connect the wallet that owns your agent slot.');
  if (!config?.contractAddress) throw new Error('The agent slot collection is not configured.');
  const provider = await web3Service.getProvider(economyNetwork());
  if (Number((await provider.getNetwork()).chainId) !== Number(config.chainId)) throw new Error('Wrong network for agent slots.');
  const contract = new ethers.Contract(config.contractAddress, BonzaiSmartAgentsABI, provider);
  const ids = await contract.getOwnerCompanions(wallet);
  const slots = [];
  for (const id of ids) {
    const ref = { tokenId: String(id), contractAddress: config.contractAddress, chainId: Number(config.chainId) };
    await verifyMintedAgent(ref, { collection: config.contractAddress, chainId: config.chainId, provider, contract, wallet });
    const [identity, token] = await Promise.all([contract.getIdentity(id), contract.socialToken(id)]);
    if (token === ethers.ZeroAddress) slots.push({ ...ref, ready: identity.ready, name: identity.name, owner: wallet });
  }
  if (wallet.toLowerCase() !== web3Service.state.walletAddress?.toLowerCase()) throw new Error('Wallet changed. Refresh your slots.');
  return slots;
}

async function personalizeAgent(companion) {
  const {MODEL_REQUIREMENTS}=await import('../skills/flagship.js');
  const rights=mintLicenseStatus(companion.imageGeneration || {},MODEL_REQUIREMENTS);
  if(!rights.allowed)throw new Error(`${rights.reason} Regenerate the portrait with a commercially permitted model before publishing.`);
  const config = CONFIG.smartAgentIssuance;
  if (!config?.contractAddress) throw new Error('The agent slot collection is not configured.');
  const expectedWallet = web3Service.state.walletAddress;
  await web3Service.switchNetwork(economyNetwork());
  await assertLaunchWallet(web3Service, config.chainId, expectedWallet);
  const provider = await web3Service.getBrowserProvider();
  const contract = new ethers.Contract(config.contractAddress, BonzaiSmartAgentsABI, await provider.getSigner());
  const { id } = await verifyMintedAgent(companion, { collection: config.contractAddress, chainId: config.chainId, provider, contract, wallet: expectedWallet });
  if (await contract.socialToken(id) !== ethers.ZeroAddress) throw new Error('Agent identity is locked after token issuance.');
  const { storageService } = await import('./storage.service.js');
  const { walletProviderService } = await import('./walletProvider.service.js');
  const { companionService } = await import('./companion.service.js');
  const name = String(companion.name || '').trim();
  const symbol = String(companion.tokenSymbol || companion.firstName || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!name || name.length > 96 || !symbol || symbol.length > 12) throw new Error('Set the agent name and a symbol of 1–12 characters first.');
  let image = companion.image;
  if (!/^(data:image\/|https:\/\/|ipfs:\/\/|ar:\/\/)/.test(image || '')) throw new Error('Generate or provide a portrait before publishing the agent.');
  await storageService.getStorage(web3Service.getEip1193Provider());
  if (image.startsWith('data:image/')) {
    const result = await storageService.uploadBase64({ base64Data: image, contentType: image.slice(5, image.indexOf(';')) });
    image = result.gatewayUrl || result.url;
  }
  const wallet = await walletProviderService.createAgentWallet(companion.id, { firstName: companion.firstName, lastName: companion.familyName });
  const metadata = companionService.buildERC8004RegistrationWithSpending({ ...companion, imageUri: image }, companion.spendingHabits || {});
  const uploaded = await storageService.uploadMetadata(metadata, { type: 'smart-agent-personalization' });
  const uri = uploaded.gatewayUrl || uploaded.url;
  if (!uri || !image) throw new Error('Public metadata upload did not return a URI.');
  await assertLaunchWallet(web3Service, config.chainId, expectedWallet);
  const tx = await contract.personalize(id, uri, name, symbol, image, wallet.address);
  const receipt = await tx.wait();
  if (Number(receipt.status) !== 1) throw new Error('Agent personalization reverted.');
  return { agentWallet: wallet.address, tokenSymbol: symbol, metadataURI: uri, isBare: false, needsSetup: false };
}

async function getIssuanceTerms(companion) {
  if (companion.needsSetup) throw new Error('Publish this agent’s identity to its attached slot before launching.');
  const config = CONFIG.smartAgentIssuance;
  if (!config?.contractAddress || !config.factoryAddress) throw new Error('Reserved token issuance is not configured.');
  const provider = await web3Service.getProvider(economyNetwork());
  const contract = new ethers.Contract(config.contractAddress, BonzaiSmartAgentsABI, provider);
  const factory = new ethers.Contract(config.factoryAddress, BonzaiAgentTokenFactoryABI, provider);
  const { identity } = await verifyAgentIssuance(companion, { collection: config.contractAddress,
    chainId: config.chainId, provider, contract, factory, factoryAddress: config.factoryAddress, wallet: web3Service.state.walletAddress });
  const nvda = new ethers.Contract(await factory.nvda(), ['function decimals() view returns(uint8)'], provider);
  const decimals = Number(await nvda.decimals());
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Unsupported NVDA precision.');
  return { name: identity.name, symbol: identity.symbol, wallet: identity.wallet, decimals };
}

async function launchToken(companion, options = {}) {
  if (!hasMintReference(companion)) throw new Error('Mint an agent slot onchain first.');
  const config = CONFIG.smartAgentIssuance;
  if (!config?.contractAddress || !config.factoryAddress) throw new Error('Reserved smart-agent token issuance is not configured on this network.');
  if (companion.tokenLaunchStatus === 'pending') throw new Error('An issuance transaction is pending. Check its status before trying again.');
  if (state.isLoading) throw new Error('Another token issuance is in progress.');
  let submitted;
  state.isLoading = true; state.launchingCompanionId = companion.id; state.error = null;
  try {
    const expectedWallet = web3Service.state.walletAddress;
    await web3Service.switchNetwork(economyNetwork());
    await assertLaunchWallet(web3Service, config.chainId, expectedWallet);
    const provider = await web3Service.getBrowserProvider();
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(config.contractAddress, BonzaiSmartAgentsABI, signer);
    const factory = new ethers.Contract(config.factoryAddress, BonzaiAgentTokenFactoryABI, provider);
    const context = { collection: config.contractAddress, chainId: config.chainId, provider, contract, factory, factoryAddress: config.factoryAddress, wallet: expectedWallet };
    const { id, identity } = await verifyAgentIssuance(companion, context);
    const reviewed = options.reviewedIdentity;
    if (!reviewed || reviewed.name !== identity.name || reviewed.symbol !== identity.symbol || reviewed.wallet?.toLowerCase() !== identity.wallet.toLowerCase()) {
      throw new Error('The onchain agent identity changed or was not reviewed. Review issuance again.');
    }
    const minOut = BigInt(options.minNvdaOut || 0);
    const deadline = Number(options.deadline);
    if (minOut <= 0n || minOut >= (1n << 128n) || !Number.isSafeInteger(deadline) || deadline <= Date.now()/1000 || deadline > Date.now()/1000 + 1800) {
      throw new Error('Review a positive minimum NVDA output and a fresh issuance deadline.');
    }
    await assertLaunchWallet(web3Service, config.chainId, expectedWallet);
    // No new ETH payment: only the minted slot's own reserve can fund issuance.
    const tx = await contract.issueToken(id, minOut, deadline);
    submitted = { txHash: tx.hash, tokenLaunchTx: tx.hash, tokenLaunchStatus: 'pending' };
    Object.assign(companion, { tokenLaunchTx: tx.hash, tokenLaunchStatus: 'pending' });
    if (options.onSubmitted) await options.onSubmitted(submitted);
    const receipt = await tx.wait();
    return await issuanceResult(companion, receipt);
  } catch (error) {
    state.error = error.message;
    return { ...submitted, success: false, pending: Boolean(submitted), error: error.message };
  } finally {
    state.isLoading = false; state.launchingCompanionId = null;
  }
}

async function issuanceResult(companion, receipt) {
  if (!receipt) return { success: false, pending: true, tokenLaunchStatus: 'pending' };
  if (Number(receipt.status) !== 1) return { success: false, reverted: true, tokenLaunchStatus: 'reverted', error: 'Token issuance reverted. The reserve remains available.' };
  const config = CONFIG.smartAgentIssuance;
  const iface = new ethers.Interface(BonzaiSmartAgentsABI);
  for (const log of receipt.logs || []) {
    if (log.address.toLowerCase() !== config.contractAddress.toLowerCase()) continue;
    let event; try { event = iface.parseLog(log); } catch { continue; }
    if (event?.name !== 'TokenIssued' || String(event.args.id) !== String(companion.tokenId)) continue;
    return { success: true, tokenAddress: event.args.token, poolId: event.args.poolId, txHash: receipt.hash,
      tokenLaunchTx: receipt.hash, tokenLaunchStatus: 'confirmed', lpLocked: true };
  }
  return { success: false, pending: true, tokenLaunchStatus: 'pending', error: 'The issuance receipt could not be verified. Do not submit another transaction.' };
}

async function refreshIssuance(companion) {
  const config = CONFIG.smartAgentIssuance;
  if (!config?.contractAddress || companion.contractAddress?.toLowerCase() !== config.contractAddress.toLowerCase() || Number(companion.chainId) !== Number(config.chainId)) throw new Error('Restore the original issuance network and collection to check this transaction.');
  const provider = await web3Service.getProvider(economyNetwork());
  if (Number((await provider.getNetwork()).chainId) !== Number(config.chainId)) throw new Error('Wrong issuance network.');
  return issuanceResult(companion, await provider.getTransactionReceipt(companion.tokenLaunchTx));
}

/**
 * Check if a companion has a token
 * @param {number} nftTokenId - Companion NFT token ID
 * @returns {Promise<boolean>}
 */
async function hasToken(nftTokenId) {
  try {
    const factory = await getFactoryContract(false);
    return await factory.hasToken(nftTokenId);
  } catch (e) {
    console.error('[CompanionToken] hasToken check failed:', e);
    return false;
  }
}

/**
 * Get token address for a companion
 * @param {number} nftTokenId - Companion NFT token ID
 * @returns {Promise<string|null>} Token address or null
 */
async function getCompanionToken(nftTokenId) {
  try {
    const factory = await getFactoryContract(false);
    const tokenAddress = await factory.getToken(nftTokenId);
    return tokenAddress === ethers.ZeroAddress ? null : tokenAddress;
  } catch (e) {
    console.error('[CompanionToken] getToken failed:', e);
    return null;
  }
}

/**
 * Get token info for display
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<Object>} Token info
 */
async function getTokenInfo(tokenAddress) {
  try {
    const provider = await web3Service.getProvider(economyNetwork());
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);

    const [name, symbol, decimals, imageURI, agentWallet, companionId] = await token.getTokenInfo();

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals,
      imageURI,
      agentWallet,
      companionId: companionId.toString(),
    };
  } catch (e) {
    console.error('[CompanionToken] getTokenInfo failed:', e);
    return null;
  }
}

// Delegate to shared uniswapV4 utils with service-specific log prefix
const LOG_PREFIX = 'CompanionToken';
const getPoolInfo = (poolId) => _getPoolInfo(poolId, LOG_PREFIX);
const getUnclaimedFees = (addr) => _getUnclaimedFees(addr, LOG_PREFIX);
const claimFees = () => _claimFees(LOG_PREFIX);

/**
 * Get minimum ETH required for liquidity
 * @returns {Promise<string>} Minimum ETH formatted
 */
async function getMinEthLiquidity() {
  throw new Error('Agent token issuance uses the minted slot’s reserved 1 ETH, not an additional liquidity payment.');
}

/**
 * Get all token addresses from factory
 * @returns {Promise<string[]>} Array of token addresses
 */
async function getAllTokenAddresses({ strict = false } = {}) {
  const addresses = [...new Set([CONFIG.companionTokenFactory?.contractAddress, CONFIG.smartAgentIssuance?.factoryAddress].filter(Boolean))];
  if (!addresses.length) {
    if (strict) throw new Error('No agent token factory is configured.');
    return [];
  }
  const provider = await web3Service.getProvider(economyNetwork());
  const results = await Promise.allSettled(addresses.map(address =>
    new ethers.Contract(address, ['function getAllTokens() view returns(address[])'], provider).getAllTokens()));
  if (strict && results.some(result => result.status === 'rejected')) throw new Error('Unable to verify all configured agent-token markets.');
  const tokens = results.filter(result => result.status === 'fulfilled').flatMap(result => [...result.value]);
  return [...new Map(tokens.map(token => [token.toLowerCase(), token])).values()];
}

async function getTotalTokensLaunched() {
  return (await getAllTokenAddresses({ strict: true })).length;
}

// URL builders delegated to shared uniswapV4 utils (imported above)

// Computed values
const isLaunching = computed(() => state.isLoading);
const launchingId = computed(() => state.launchingCompanionId);
const hasError = computed(() => !!state.error);
const errorMessage = computed(() => state.error);

// Check if factory is configured
const isConfigured = computed(() => {
  return !!(CONFIG.smartAgentIssuance?.contractAddress && CONFIG.smartAgentIssuance?.factoryAddress);
});

// Export service
export const companionTokenService = {
  // State
  state: readonly(state),

  // Computed
  isLaunching,
  launchingId,
  hasError,
  errorMessage,
  isConfigured,

  // Token launch
  launchToken,
  verifyMint,
  getIssuanceTerms,
  personalizeAgent,
  getOwnedAgentSlots,
  refreshIssuance,

  // Queries
  hasToken,
  getCompanionToken,
  getTokenInfo,
  getPoolInfo,
  getUnclaimedFees,
  getMinEthLiquidity,
  getTotalTokensLaunched,
  getAllTokenAddresses,

  // Fee claiming
  claimFees,

  // URL builders
  getUniswapTradeUrl,
  getBaseScanUrl,
  getDexScreenerUrl,
};

export default companionTokenService;
