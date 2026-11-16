import { confirmedReceipt } from './transactionReceipt.js';
/**
 * BonzAI Skill Ownership Service
 *
 * Manages companion co-ownership of skills on the BonzaiSkillOwnership contract (Base).
 * Handles registration, deregistration, revenue claiming, and cross-chain attestation.
 *
 * Revenue flow (USDC-only marketplace):
 *   SkillOwnership registrations → companion-token access to compatible skills
 *   → weighted by BONZAI_balance * profileScore → credited to companion wallets
 *   → claimable via claimRevenue().
 */

import { ethers } from 'ethers';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { agentWalletService } from './agentWallet.service.js';
import { owsService } from './ows.service.js';
import { OWSEthersSigner } from './owsSigner.adapter.js';
import { walletCredentials, ensureOWSPassphrase } from './walletCredentials.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABI (Human-readable for ethers v6)
// ═══════════════════════════════════════════════════════════════════════════

const SKILL_OWNERSHIP_ABI = [
  // Registration
  'function registerCompanion(bytes32 skillId, uint256 companionTokenId, address companionWallet, uint8 profileScore, uint256 attestationDeadline, bytes attestation) external',
  'function deregisterCompanion(bytes32 skillId, uint256 companionTokenId) external',
  'function updateCompanionRegistration(bytes32 skillId, uint256 companionTokenId, address newWallet, uint8 newProfileScore, uint256 attestationDeadline, bytes attestation) external',

  // Signer management (admin-only on-chain, read-only for everyone else)
  'function attestationSigner() view returns (address)',

  // Events (for historical distribution breakdown)
  'event CompanionRevenueShare(bytes32 indexed skillId, address indexed wallet, uint256 indexed companionTokenId, uint256 share, uint256 weight, uint256 totalWeight, uint256 timestamp)',
  'event RevenueDistributedUSDC(bytes32 indexed skillId, uint256 totalAmount, uint256 recipientCount, uint256 timestamp)',

  // Revenue (Native ETH revenue)
  'function distributeRevenue(bytes32 skillId, uint256 amount) payable',
  'function claimRevenue() external',

  // Views
  'function unclaimedRevenue(address wallet) view returns (uint256)',
  'function getSkillCompanions(bytes32 skillId) view returns (tuple(uint256 companionTokenId, address companionWallet, address ownerAddress, uint8 profileScore, uint256 registeredAt, bool active)[])',
  'function getSkillCompanionCount(bytes32 skillId) view returns (uint256)',
  'function isCompanionRegistered(uint256 companionTokenId, bytes32 skillId) view returns (bool)',
  'function getCompanionRegistration(uint256 companionTokenId, bytes32 skillId) view returns (tuple(uint256 companionTokenId, address companionWallet, address ownerAddress, uint8 profileScore, uint256 registeredAt, bool active))',
  'function getUnclaimedRevenuePerSkill(address wallet, bytes32 skillId) view returns (uint256)',
  'function getStats() view returns (uint256 totalDistributed, uint256 totalClaimed, uint256 contractBalance)',
  'function categoryToIndex(string category) view returns (uint8)',

  // Admin
  'function setAttestationSigner(address signer) external',
  'function setSkillRegistry(address registry) external',
  'function setTreasury(address treasury) external',
];

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY MAPPING (matches BonzaiCompanions.sol bit packing order)
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORY_INDICES = {
  education: 0,
  entertainment: 1,
  fashion: 2,
  finance: 3,
  food: 4,
  healthcare: 5,
  housing: 6,
  beauty: 7,
  reading: 8,
  social: 9,
  travel: 10,
  sports: 11,
};

/**
 * Get the spending profile category index for a category name
 * @param {string} category - Category name (e.g., "finance")
 * @returns {number} Index (0-11) or -1 if not found
 */
export function getCategoryIndex(category) {
  const idx = CATEGORY_INDICES[category?.toLowerCase()];
  return idx !== undefined ? idx : -1;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ACCESS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the BonzaiSkillOwnership contract instance
 * @param {boolean} [withSigner=false] - Whether to connect with signer for write operations
 * @returns {ethers.Contract}
 */
async function getContract(withSigner = false) {
  const contractAddress = CONFIG.skillRegistry.ownershipContractAddress;
  if (!contractAddress) {
    throw new Error('Skill ownership contract address not configured');
  }

  if (withSigner) {
    await web3Service.switchNetwork(ECONOMY_NETWORK_KEY);
    const signer = await web3Service.getSigner();
    return new ethers.Contract(contractAddress, SKILL_OWNERSHIP_ABI, signer);
  }

  const provider = await web3Service.getProvider(ECONOMY_NETWORK_KEY);
  return new ethers.Contract(contractAddress, SKILL_OWNERSHIP_ABI, provider);
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Register a companion as co-owner of a skill
 * @param {string} skillId - bytes32 skill ID
 * @param {number} companionTokenId - NFT token ID on Base
 * @param {string} companionWallet - Agent wallet address
 * @param {number} profileScore - Spending profile score for the skill's category
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function registerCompanionForSkill(skillId, companionTokenId, companionWallet, profileScore) {
  // Pre-flight: check contract is configured
  if (!CONFIG.skillRegistry.ownershipContractAddress) {
    throw new Error(
      'Skill ownership contract not deployed yet. ' +
      'Registration will be available once the BonzaiSkillOwnership contract is live on Base.'
    );
  }

  // Generate attestation signature locally
  const { signature, deadline } = await requestAttestation(
    skillId,
    companionTokenId,
    companionWallet,
    web3Service.state.walletAddress,
    profileScore
  );

  const contract = await getContract(true);
  const tx = await contract.registerCompanion(
    skillId,
    companionTokenId,
    companionWallet,
    profileScore,
    deadline,
    signature
  );
  return await confirmedReceipt(tx);
}

/**
 * Deregister a companion from a skill
 * @param {string} skillId - bytes32 skill ID
 * @param {number} companionTokenId - NFT token ID
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function deregisterCompanionFromSkill(skillId, companionTokenId) {
  const contract = await getContract(true);
  const tx = await contract.deregisterCompanion(skillId, companionTokenId);
  return await confirmedReceipt(tx);
}

/**
 * Update a companion's on-chain registration for a skill. Used when the
 * companion's spending habits (profile score for the skill category) change
 * or the agent wallet is rotated. Re-runs the attestation flow with the
 * current values.
 *
 * @param {string} skillId - bytes32 skill ID
 * @param {number} companionTokenId
 * @param {string} newWallet - fresh agent wallet address
 * @param {number} newProfileScore - updated category score (5..10)
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function updateCompanionRegistration(
  skillId,
  companionTokenId,
  newWallet,
  newProfileScore
) {
  const { signature, deadline } = await requestAttestation(
    skillId,
    companionTokenId,
    newWallet,
    web3Service.state.walletAddress,
    newProfileScore
  );
  const contract = await getContract(true);
  const tx = await contract.updateCompanionRegistration(
    skillId,
    companionTokenId,
    newWallet,
    newProfileScore,
    deadline,
    signature
  );
  return await confirmedReceipt(tx);
}

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Claim all accumulated native ETH revenue.
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function claimAllRevenue() {
  const contract = await getContract(true);
  const tx = await contract.claimRevenue();
  return await confirmedReceipt(tx);
}

/** Do not silently spend from an obsolete USDC action. */
export async function claimAllRevenueUSDC() {
  throw new Error('Skill ownership rewards are paid in ETH. Use claimAllRevenue.');
}

/**
 * Fetch the distribution history for a wallet. Indexes
 * `CompanionRevenueShare` events emitted by `distributeRevenue()` where
 * this wallet was a recipient. Each entry includes the skill ID, share in
 * ETH (wei), weight-on-total ratio, and block timestamp.
 *
 * @param {string} walletAddress
 * @param {number} [fromBlock=0] Optional lower bound; default scans from genesis.
 *                               Pass a recent block for faster queries on chains
 *                               with heavy history (e.g. last 10K blocks).
 * @returns {Promise<Array<{skillId, share, weight, totalWeight, ratio, companionTokenId, blockNumber, txHash, timestamp}>>}
 */
export async function getDistributionHistory(walletAddress, fromBlock = 0) {
  const contract = await getContract();
  if (!contract) return [];
  const filter = contract.filters.CompanionRevenueShare(null, walletAddress);
  const events = await contract.queryFilter(filter, fromBlock, 'latest');
  return events.map((ev) => ({
    skillId: ev.args.skillId,
    wallet: ev.args.wallet,
    companionTokenId: ev.args.companionTokenId.toString(),
    share: ev.args.share.toString(),          // raw ETH (wei)
    weight: ev.args.weight.toString(),
    totalWeight: ev.args.totalWeight.toString(),
    ratio: Number(ev.args.weight) / Number(ev.args.totalWeight || 1n),
    timestamp: Number(ev.args.timestamp),
    blockNumber: ev.blockNumber,
    txHash: ev.transactionHash,
  })).sort((a, b) => b.blockNumber - a.blockNumber);
}

/**
 * Get total unclaimed USDC revenue for a wallet.
 * @param {string} walletAddress - Wallet to query
 * @returns {Promise<string>} Unclaimed USDC amount (raw, 6 decimals)
 */
// Kept only to give legacy callers a clear migration error. This contract pays ETH.
export async function getUnclaimedRevenueUSDC() {
  throw new Error('Skill ownership rewards are paid in ETH. Use getUnclaimedRevenue.');
}

/** Read native ETH revenue; an unavailable RPC must never appear as a zero balance. */
export async function getUnclaimedRevenue(walletAddress) {
  const contract = await getContract();
  return ethers.formatEther(await contract.unclaimedRevenue(walletAddress));
}

/**
 * Get unclaimed revenue for a wallet per skill
 * @param {string} walletAddress - Wallet to query
 * @param {string} skillId - bytes32 skill ID
 * @returns {Promise<string>} Unclaimed ETH amount (formatted)
 */
export async function getCompanionSkillRevenue(walletAddress, skillId) {
  try {
    const contract = await getContract();
    const amount = await contract.getUnclaimedRevenuePerSkill(walletAddress, skillId);
    return ethers.formatEther(amount);
  } catch (err) {
    console.warn('Failed to fetch per-skill revenue:', err.message);
    return '0';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all registered companions for a skill
 * @param {string} skillId - bytes32 skill ID
 * @returns {Promise<Array>} Array of CompanionRegistration objects
 */
export async function getSkillRegistrations(skillId) {
  try {
    const contract = await getContract();
    const registrations = await contract.getSkillCompanions(skillId);
    return registrations.map(reg => ({
      companionTokenId: Number(reg.companionTokenId),
      companionWallet: reg.companionWallet,
      ownerAddress: reg.ownerAddress,
      profileScore: reg.profileScore,
      registeredAt: Number(reg.registeredAt),
      active: reg.active,
    }));
  } catch (err) {
    console.warn('Failed to fetch skill registrations:', err.message);
    return [];
  }
}

/**
 * Check if a companion is registered for a skill
 * @param {number} companionTokenId - NFT token ID
 * @param {string} skillId - bytes32 skill ID
 * @returns {Promise<boolean>}
 */
export async function isCompanionRegistered(companionTokenId, skillId) {
  try {
    const contract = await getContract();
    return await contract.isCompanionRegistered(companionTokenId, skillId);
  } catch (err) {
    console.warn('Failed to check registration:', err.message);
    return false;
  }
}

/**
 * Get all skills a companion is co-owning
 * @param {number} companionTokenId - NFT token ID
 * @param {string[]} allSkillIds - Array of all skill IDs to check
 * @returns {Promise<string[]>} Array of skill IDs the companion is registered for
 */
export async function getCompanionOwnedSkills(companionTokenId, allSkillIds) {
  const ownedSkills = [];
  const contract = await getContract();

  // Batch check registrations
  const checks = await Promise.all(
    allSkillIds.map(skillId =>
      contract.isCompanionRegistered(companionTokenId, skillId).catch(() => false)
    )
  );

  for (let i = 0; i < allSkillIds.length; i++) {
    if (checks[i]) {
      ownedSkills.push(allSkillIds[i]);
    }
  }

  return ownedSkills;
}

/**
 * Get contract statistics
 * @returns {Promise<{totalDistributed: string, totalClaimed: string, contractBalance: string}>}
 */
export async function getStats() {
  try {
    const contract = await getContract();
    const [totalDistributed, totalClaimed, contractBalance] = await contract.getStats();
    return {
      totalDistributed: ethers.formatEther(totalDistributed),
      totalClaimed: ethers.formatEther(totalClaimed),
      contractBalance: ethers.formatEther(contractBalance),
    };
  } catch (err) {
    console.warn('Failed to fetch ownership stats:', err.message);
    return { totalDistributed: '0', totalClaimed: '0', contractBalance: '0' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL ATTESTATION SIGNER
// ═══════════════════════════════════════════════════════════════════════════
//
// Derives a dedicated attestation signer key from the agent wallet master secret.
// This signer produces EIP-191 signatures matching the BonzaiSkillOwnership
// contract's _verifyAttestation() method.
//
// Message format (matches Solidity abi.encodePacked):
//   keccak256(skillId ++ companionTokenId ++ companionWallet ++ ownerAddress
//             ++ profileScore ++ deadline ++ chainId)
//
// In production, this signer address is set as `attestationSigner` on the
// deployed BonzaiSkillOwnership contract via setAttestationSigner().
// ═══════════════════════════════════════════════════════════════════════════

let _attestationSignerCache = null;

/**
 * Get or derive the local attestation signer.
 * Prefers OWS vault wallet "bonzai-attestation-signer" if available.
 * Falls back to legacy derivation: keccak256(masterSecret + "attestation-signer")
 * The signer address is persisted so the contract admin can configure it.
 *
 * @returns {Promise<ethers.Wallet|OWSEthersSigner>}
 */
async function getAttestationSigner() {
  if (_attestationSignerCache) return _attestationSignerCache;

  // Migrate any legacy signing key before reading either wallet backend.
  // An unavailable system keychain must never trigger a new signer identity.
  const storedSignerKey = await walletCredentials.getAttestationKey();

  // Try OWS attestation wallet first
  const OWS_ATTESTATION_WALLET = 'bonzai-attestation-signer';
  try {
    const owsWallet = await owsService.getWallet(OWS_ATTESTATION_WALLET);
    if (owsWallet && !owsWallet.error) {
      const passphrase = await walletCredentials.getOWS('attestation', 'passphrase');
      if (passphrase) {
        _attestationSignerCache = new OWSEthersSigner(OWS_ATTESTATION_WALLET, passphrase);
        console.log('[SkillOwnership] Using OWS attestation signer:', owsWallet.address);
        return _attestationSignerCache;
      }
    }
  } catch { /* OWS not available, fall through */ }

  // Securely stored legacy derivation remains available for recovery.
  const signerKey = storedSignerKey;

  if (signerKey) {
    _attestationSignerCache = new ethers.Wallet(signerKey);
    return _attestationSignerCache;
  }

  // Derive from master secret (legacy)
  const masterSecret = await agentWalletService.getMasterSecret();
  const seed = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'string'],
      [ethers.hexlify(masterSecret), 'attestation-signer']
    )
  );

  const signer = new ethers.Wallet(seed);
  await walletCredentials.setAttestationKey(seed);
  _attestationSignerCache = signer;

  // Try to import into OWS for future use
  try {
    const passphrase = await ensureOWSPassphrase('attestation');
    const importResult = await owsService.importWalletPrivateKey(OWS_ATTESTATION_WALLET, seed, passphrase);
    if (!importResult.error) {
      console.log('[SkillOwnership] Attestation signer migrated to OWS:', importResult.address);
    }
  } catch { /* OWS import failed, protected legacy key still works */ }

  console.log('[SkillOwnership] Attestation signer derived:', signer.address);
  return signer;
}

/**
 * Get the local attestation signer address.
 * This address must be set as `attestationSigner` on the BonzaiSkillOwnership contract.
 *
 * @returns {Promise<string>}
 */
export async function getAttestationSignerAddress() {
  const signer = await getAttestationSigner();
  return signer.address;
}

/**
 * Fetch the attestation signer address currently configured on the contract.
 * Returns `null` if the contract address isn't configured or the read fails.
 *
 * @returns {Promise<string|null>}
 */
export async function getOnChainAttestationSigner() {
  try {
    const contract = await getContract();
    if (!contract) return null;
    return await contract.attestationSigner();
  } catch (e) {
    console.warn('[SkillOwnership] Failed to read attestationSigner:', e.message);
    return null;
  }
}

/**
 * Check whether the on-chain attestation signer matches the locally-derived
 * signer. If they don't match, registration attestations will revert with
 * `InvalidAttestation`. Returns a diagnostic object the admin UI can render.
 *
 * @returns {Promise<{local: string, onChain: string|null, matches: boolean, ready: boolean}>}
 */
export async function checkAttestationSignerState() {
  const [local, onChain] = await Promise.all([
    getAttestationSignerAddress(),
    getOnChainAttestationSigner(),
  ]);
  const matches = !!onChain && !!local && onChain.toLowerCase() === local.toLowerCase();
  return {
    local,
    onChain,
    matches,
    ready: matches,
  };
}

/**
 * Admin-only: push the locally-derived attestation signer address to the
 * BonzaiSkillOwnership contract. Must be called by the contract owner's
 * signer (typically the deployer). Safe to call repeatedly — idempotent if
 * the signer address hasn't changed.
 *
 * @returns {Promise<ethers.TransactionReceipt>}
 */
export async function syncAttestationSignerToContract() {
  const localAddress = await getAttestationSignerAddress();
  const existing = await getOnChainAttestationSigner();
  if (existing && existing.toLowerCase() === localAddress.toLowerCase()) {
    console.log('[SkillOwnership] Attestation signer already synced:', localAddress);
    return null;
  }
  const contract = await getContract(true);
  const tx = await contract.setAttestationSigner(localAddress);
  const receipt = await confirmedReceipt(tx);
  console.log('[SkillOwnership] Attestation signer synced to contract:', localAddress, 'tx:', receipt.hash);
  return receipt;
}

/**
 * Produce a cross-chain attestation signature.
 *
 * The message matches the Solidity _verifyAttestation() in BonzaiSkillOwnership.sol:
 *   messageHash = keccak256(abi.encodePacked(
 *     skillId, companionTokenId, companionWallet, ownerAddress,
 *     profileScore, deadline, block.chainid
 *   ))
 *   ethSignedHash = toEthSignedMessageHash(messageHash)
 *   signature = sign(ethSignedHash, attestationSignerPrivateKey)
 *
 * @param {string} skillId - bytes32 skill ID
 * @param {number} companionTokenId - NFT token ID on Base
 * @param {string} companionWallet - Agent wallet address
 * @param {string} ownerAddress - NFT owner address
 * @param {number} profileScore - Claimed spending profile score (1-15)
 * @returns {Promise<{signature: string, deadline: number, signerAddress: string}>}
 */
export async function requestAttestation(skillId, companionTokenId, companionWallet, ownerAddress, profileScore) {
  console.log('[SkillOwnership] Generating attestation for companion', companionTokenId, 'skill', skillId);

  const signer = await getAttestationSigner();
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const chainId = CONFIG.skillRegistry.chainId;

  // Encode exactly as the Solidity contract does with abi.encodePacked
  const messageHash = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes32', 'uint256', 'address', 'address', 'uint8', 'uint256', 'uint256'],
      [skillId, companionTokenId, companionWallet, ownerAddress, profileScore, deadline, chainId]
    )
  );

  // Sign the Ethereum-prefixed message hash (EIP-191 personal sign)
  const signature = await signer.signMessage(ethers.getBytes(messageHash));

  console.log('[SkillOwnership] Attestation signed by', signer.address, 'deadline', deadline);

  return {
    signature,
    deadline,
    signerAddress: signer.address,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const skillOwnershipService = {
  getContract,
  registerCompanionForSkill,
  deregisterCompanionFromSkill,
  updateCompanionRegistration,
  claimAllRevenue,
  claimAllRevenueUSDC,
  getUnclaimedRevenue,
  getUnclaimedRevenueUSDC,
  getCompanionSkillRevenue,
  getSkillRegistrations,
  isCompanionRegistered,
  getCompanionOwnedSkills,
  getStats,
  requestAttestation,
  getAttestationSignerAddress,
  getOnChainAttestationSigner,
  checkAttestationSignerState,
  syncAttestationSignerToContract,
  getDistributionHistory,
  getCategoryIndex,
  CATEGORY_INDICES,
};

export default skillOwnershipService;
