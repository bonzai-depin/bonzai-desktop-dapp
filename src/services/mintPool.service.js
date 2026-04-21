/**
 * BonzAI Mint Pool Service
 *
 * Manages epoch-based per-content-type revenue pools for LVL holders.
 * 6 pools (0=text, 1=audio, 2=image, 3=video, 4=3D, 5=training).
 *
 * Features:
 * - Register BONZAI balance for current epoch (on-chain, time-based epochs)
 * - Fetch epoch info and lifetime deposits
 * - Claim from past epochs within grace period
 * - Check user qualification per pool
 * - Batch claim from multiple pools in a single transaction
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { POOL_LABELS as SHARED_POOL_LABELS } from '../constants/index.js';

// BonzaiMintPool ABI (time-based epochs, on-chain registration)
const MINT_POOL_ABI = [
  // Read functions
  'function currentEpoch() view returns (uint256)',
  'function epochDuration() view returns (uint256)',
  'function genesisTime() view returns (uint256)',
  'function isEpochFinalized(uint256 epochId) view returns (bool)',
  'function getEpochInfo(uint256 epochId) view returns (uint256 startTime, uint256 endTime, uint256 totalRegistered, bool finalized)',
  'function getEpochDeposits(uint256 epochId) view returns (uint256[6])',
  'function getEpochClaimedPerPool(uint256 epochId) view returns (uint256[6])',
  'function getAllTotalDeposited() view returns (uint256[6])',
  'function getAllPoolThresholds() view returns (uint256[6])',
  'function qualifiesForPool(address user, uint8 poolIndex) view returns (bool)',
  'function previewClaim(uint256 epochId, uint8 poolIndex, address user) view returns (uint256)',
  'function hasClaimedEpoch(uint256 epochId, address user, uint8 poolIndex) view returns (bool)',
  'function isRegistered(uint256 epochId, address user) view returns (bool)',
  'function registeredBalances(uint256 epochId, address user) view returns (uint256)',
  'function totalClaimed() view returns (uint256)',
  'function claimConfirmedBlock(uint256 epochId, address user) view returns (uint256)',
  'function NUM_POOLS() view returns (uint256)',

  // Write functions
  'function registerForEpoch()',
  'function confirmClaim(uint256 epochId)',
  'function claimEpoch(uint256 epochId, uint8 poolIndex)',
  'function claimEpochBatch(uint256 epochId, uint8[] poolIndices)',

  // Events
  'event PoolDeposit(uint8 indexed poolIndex, uint256 amount, address indexed depositor, uint256 indexed epochId)',
  'event EpochClaimed(uint256 indexed epochId, uint8 indexed poolIndex, address indexed claimer, uint256 amount)',
  'event Registered(uint256 indexed epochId, address indexed wallet, uint256 balance)',
  'event RegistrationRequested(uint256 indexed epochId, address indexed wallet)',
  'event ConfirmClaimRequested(uint256 indexed epochId, address indexed wallet)',
  'event ClaimConfirmed(uint256 indexed epochId, address indexed wallet, uint256 balance, uint256 blockNumber)',
];

const POOL_LABELS = SHARED_POOL_LABELS;

// Service state
const state = reactive({
  isLoading: false,
  isClaiming: false,
  isRegistering: false,
  error: null,

  // Epoch info
  currentEpoch: 0,
  epochDuration: 0,
  genesisTime: 0,
  latestFinalizedEpoch: null,  // Most recent finalized epoch info

  // Lifetime stats
  totalDeposited: [0, 0, 0, 0, 0, 0],
  poolThresholds: [0, 0, 0, 0, 0, 0],
  totalClaimed: 0,

  // User qualification (based on current balance)
  userQualifies: [false, false, false, false, false, false],

  // BonzaiUnlock status
  allUnlocked: false,

  // User registration status for current epoch
  isRegisteredCurrentEpoch: false,
  registeredBalance: 0,

  lastFetch: null,
});

/**
 * Get MintPool contract instance
 */
async function getPoolContract(withSigner = false) {
  const poolAddress = CONFIG.mintPool?.contractAddress;
  if (!poolAddress) {
    throw new Error('MintPool contract not deployed. Set CONFIG.mintPool.contractAddress');
  }

  if (withSigner) {
    const browserProvider = await web3Service.getBrowserProvider();
    const signer = await browserProvider.getSigner();
    return new ethers.Contract(poolAddress, MINT_POOL_ABI, signer);
  }

  let provider;
  try {
    provider = await web3Service.getProvider('base');
  } catch { /* */ }
  if (!provider) {
    provider = new ethers.JsonRpcProvider(CONFIG.networks?.base?.rpc || 'https://mainnet.base.org');
  }
  return new ethers.Contract(poolAddress, MINT_POOL_ABI, provider);
}

/**
 * Fetch pool stats and epoch info
 */
async function fetchPoolStats() {
  state.isLoading = true;
  state.error = null;

  try {
    const contract = await getPoolContract(false);
    const userAddress = web3Service.state.walletAddress;

    // Fetch core data
    const [currentEpoch, epochDuration, genesisTime, deposited, thresholds, claimed] = await Promise.all([
      contract.currentEpoch(),
      contract.epochDuration(),
      contract.genesisTime(),
      contract.getAllTotalDeposited(),
      contract.getAllPoolThresholds(),
      contract.totalClaimed(),
    ]);

    state.currentEpoch = Number(currentEpoch);
    state.epochDuration = Number(epochDuration);
    state.genesisTime = Number(genesisTime);
    state.totalClaimed = parseFloat(ethers.formatEther(claimed));

    for (let i = 0; i < 6; i++) {
      state.totalDeposited[i] = parseFloat(ethers.formatEther(deposited[i]));
      state.poolThresholds[i] = parseFloat(ethers.formatEther(thresholds[i]));
    }

    // Fetch latest finalized epoch info (current - 1, if it exists)
    if (state.currentEpoch >= 1) {
      const prevEpochId = state.currentEpoch - 1;
      const [epochInfo, epochDeposits] = await Promise.all([
        contract.getEpochInfo(prevEpochId),
        contract.getEpochDeposits(prevEpochId),
      ]);

      if (epochInfo.finalized) {
        state.latestFinalizedEpoch = {
          epochId: prevEpochId,
          startTime: Number(epochInfo.startTime),
          endTime: Number(epochInfo.endTime),
          totalRegistered: ethers.formatEther(epochInfo.totalRegistered),
          deposits: epochDeposits.map(d => parseFloat(ethers.formatEther(d))),
        };
      }
    }

    // Fetch user qualification and registration if wallet connected
    if (userAddress) {
      // Check BonzaiUnlock status — unlocked users qualify for all pools
      let isUnlocked = false;
      try {
        const unlockAddress = CONFIG.levelUnlock?.registryAddress;
        if (unlockAddress) {
          const unlockProvider = new ethers.JsonRpcProvider(CONFIG.networks?.base?.rpc || 'https://mainnet.base.org');
          const unlockContract = new ethers.Contract(
            unlockAddress,
            ['function hasUnlocked(address) view returns (bool)'],
            unlockProvider,
          );
          isUnlocked = await unlockContract.hasUnlocked(userAddress);
        }
      } catch { /* unlock contract may not be available */ }

      const qualifyPromises = [];
      for (let i = 0; i < 6; i++) {
        qualifyPromises.push(contract.qualifiesForPool(userAddress, i));
      }
      const [qualResults, isRegistered, regBalance] = await Promise.all([
        Promise.all(qualifyPromises),
        contract.isRegistered(state.currentEpoch, userAddress),
        contract.registeredBalances(state.currentEpoch, userAddress),
      ]);

      state.allUnlocked = isUnlocked;

      for (let i = 0; i < 6; i++) {
        state.userQualifies[i] = isUnlocked || qualResults[i];
      }
      state.isRegisteredCurrentEpoch = isRegistered;
      state.registeredBalance = parseFloat(ethers.formatEther(regBalance));
    }

    state.lastFetch = Date.now();
  } catch (e) {
    console.error('[MintPool] fetchPoolStats failed:', e);
    state.error = e.message;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Register for the current epoch.
 * Sends a Chainlink Functions request to fetch cross-chain BONZAI balances.
 * The contract callback adds Base balance on-chain and completes registration.
 * Registration is async — the user must wait for the oracle callback.
 *
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
async function registerForEpoch() {
  state.isRegistering = true;
  state.error = null;

  try {
    await web3Service.switchNetwork?.('base');

    const contract = await getPoolContract(true);

    console.log(`[MintPool] Requesting registration for epoch ${state.currentEpoch}...`);
    const tx = await contract.registerForEpoch();
    console.log(`[MintPool] Registration request tx sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[MintPool] Registration request confirmed in block ${receipt.blockNumber}`);

    // Parse RegistrationRequested event for requestId
    let requestId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'RegistrationRequested') {
          requestId = parsed.args.requestId;
          break;
        }
      } catch {
        // Skip non-matching logs
      }
    }

    console.log(`[MintPool] Oracle request sent: ${requestId}. Waiting for callback...`);

    return {
      success: true,
      txHash: receipt.hash,
      requestId,
      epochId: state.currentEpoch,
      pending: true,
    };
  } catch (e) {
    console.error('[MintPool] registerForEpoch failed:', e);
    state.error = e.message;
    return { success: false, error: e.message };
  } finally {
    state.isRegistering = false;
  }
}

/**
 * Confirm balance before claiming (flash loan protection).
 * Sends a Chainlink Functions request to re-verify the user still holds
 * >= registered balance. The callback sets the confirmed block.
 * Must be called in a separate block BEFORE claimEpoch/claimEpochBatch.
 *
 * @param {number} epochId - Epoch to confirm claim for
 * @returns {Promise<{success: boolean, txHash?: string, error?: string}>}
 */
async function confirmClaim(epochId) {
  state.isLoading = true;
  state.error = null;

  try {
    await web3Service.switchNetwork?.('base');

    const contract = await getPoolContract(true);

    console.log(`[MintPool] Requesting claim confirmation for epoch ${epochId}...`);
    const tx = await contract.confirmClaim(epochId);
    console.log(`[MintPool] Confirm claim request tx sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[MintPool] Confirm claim request confirmed in block ${receipt.blockNumber}`);

    return { success: true, txHash: receipt.hash, epochId, pending: true };
  } catch (e) {
    console.error('[MintPool] confirmClaim failed:', e);
    state.error = e.message;
    return { success: false, error: e.message };
  } finally {
    state.isLoading = false;
  }
}

/**
 * Claim from a specific epoch/pool.
 * Requires confirmClaim() to have been called in a prior block.
 *
 * @param {number} epochId - Epoch to claim from
 * @param {number} poolIndex - Pool index (0-5)
 * @returns {Promise<{success: boolean, txHash?: string, amount?: number, error?: string}>}
 */
async function claimEpoch(epochId, poolIndex) {
  if (poolIndex < 0 || poolIndex > 5) {
    return { success: false, error: 'Invalid pool index' };
  }

  state.isClaiming = true;
  state.error = null;

  try {
    await web3Service.switchNetwork?.('base');

    const contract = await getPoolContract(true);

    console.log(`[MintPool] Claiming epoch ${epochId}, pool ${poolIndex} (${POOL_LABELS[poolIndex]})...`);
    const tx = await contract.claimEpoch(epochId, poolIndex);
    console.log(`[MintPool] Claim tx sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[MintPool] Claim confirmed in block ${receipt.blockNumber}`);

    // Parse event for claimed amount
    let claimedAmount = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'EpochClaimed') {
          claimedAmount = parseFloat(ethers.formatEther(parsed.args.amount));
          break;
        }
      } catch {
        // Skip non-matching logs
      }
    }

    await fetchPoolStats();

    return {
      success: true,
      txHash: receipt.hash,
      amount: claimedAmount,
      epochId,
      poolIndex,
      poolLabel: POOL_LABELS[poolIndex],
    };
  } catch (e) {
    console.error('[MintPool] claimEpoch failed:', e);
    state.error = e.message;
    return { success: false, error: e.message };
  } finally {
    state.isClaiming = false;
  }
}

/**
 * Batch claim from multiple pools in a single transaction
 *
 * @param {number} epochId - Epoch to claim from
 * @param {number[]} poolIndices - Array of pool indices
 */
async function claimEpochBatch(epochId, poolIndices) {
  state.isClaiming = true;
  state.error = null;

  try {
    await web3Service.switchNetwork?.('base');

    const contract = await getPoolContract(true);

    console.log(`[MintPool] Batch claiming epoch ${epochId}, pools [${poolIndices.map(i => POOL_LABELS[i]).join(', ')}]...`);
    const tx = await contract.claimEpochBatch(epochId, poolIndices);
    console.log(`[MintPool] Batch claim tx sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[MintPool] Batch claim confirmed in block ${receipt.blockNumber}`);

    await fetchPoolStats();

    return { success: true, txHash: receipt.hash, epochId, poolIndices };
  } catch (e) {
    console.error('[MintPool] claimEpochBatch failed:', e);
    state.error = e.message;
    return { success: false, error: e.message };
  } finally {
    state.isClaiming = false;
  }
}

/**
 * Check if user has claimed a specific epoch/pool
 */
async function hasClaimedEpoch(epochId, poolIndex) {
  try {
    const contract = await getPoolContract(false);
    const userAddress = web3Service.state.walletAddress;
    if (!userAddress) return false;
    return await contract.hasClaimedEpoch(epochId, userAddress, poolIndex);
  } catch {
    return false;
  }
}

/**
 * Preview claimable amount for a specific epoch/pool
 */
async function previewClaim(epochId, poolIndex) {
  try {
    const contract = await getPoolContract(false);
    const userAddress = web3Service.state.walletAddress;
    if (!userAddress) return 0n;
    return await contract.previewClaim(epochId, poolIndex, userAddress);
  } catch {
    return 0n;
  }
}

/**
 * Check if user is registered for a specific epoch
 */
async function isRegisteredForEpoch(epochId) {
  try {
    const contract = await getPoolContract(false);
    const userAddress = web3Service.state.walletAddress;
    if (!userAddress) return false;
    return await contract.isRegistered(epochId, userAddress);
  } catch {
    return false;
  }
}

// Computed values
const isConfigured = computed(() => !!CONFIG.mintPool?.contractAddress);
const totalLifetimeDeposited = computed(() => state.totalDeposited.reduce((a, b) => a + b, 0));

// Export service
export const mintPoolService = {
  state: readonly(state),

  // Computed
  isConfigured,
  totalLifetimeDeposited,

  // Methods
  fetchPoolStats,
  registerForEpoch,
  confirmClaim,
  claimEpoch,
  claimEpochBatch,
  hasClaimedEpoch,
  isRegisteredForEpoch,
  previewClaim,

  // Constants
  POOL_LABELS,
};

export default mintPoolService;
