/**
 * Provider reward reads and claims. Local service ledgers are untrusted evidence:
 * reward submission requires an independent attestor and verified onchain receipts.
 * This client never converts unsigned local seconds into reward entitlement.
 */

import { ethers } from "ethers";
import { CONFIG, ECONOMY_NETWORK_KEY } from "../config/web3.config.js";
import { getSigner, getProvider, switchNetwork } from "./web3.service.js";
import { web3Service } from "./web3.service.js";
import { confirmedReceipt } from './transactionReceipt.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABIs (audit-aligned)
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_TIME_ABI = [
  "function paused() view returns (bool)",
  "function claimsPaused() view returns (bool)",
  "function serviceTimeAttestor() view returns (address)",

  // Claim weighted share of the pool's provider-side after epoch close.
  "function claimProviderRewards(uint256 epochId, uint8 poolIndex)",

  // Reads — for UI, eligibility checks, claim availability.
  "function providerServiceTime(uint256 epochId, uint8 poolIndex, address provider) view returns (uint256)",
  "function totalServiceTime(uint256 epochId, uint8 poolIndex) view returns (uint256)",
  "function providerClaimed(uint256 epochId, uint8 poolIndex, address provider) view returns (bool)",
  "function pipelineToPool(uint8 pipelineId) pure returns (uint8)",
  "function LVL1_THRESHOLD() view returns (uint256)",

  "event ServiceTimeRecorded(address indexed provider, uint8 indexed poolIndex, uint256 indexed epochId, uint256 secondsServed, uint8 pipelineId)",
  "event ProviderRewardsClaimed(address indexed provider, uint256 indexed epochId, uint8 indexed poolIndex, uint256 providerTime, uint256 totalTime, uint256 paidAmount)",
];

const MINT_POOL_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function isEpochFinalized(uint256 epochId) view returns (bool)",
  "function stakingVault() view returns (address)",
  "function getEpochProviderDeposits(uint256 epochId) view returns (uint256[6])",
];

const BONZAI_TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

const ECONOMY_CHAIN_ID = CONFIG.p2pNetwork.chainId;
// Default LVL1 threshold — used as a UI-side hint when the contract
// read fails (e.g., address gap). Real threshold comes from
// `LVL1_THRESHOLD()` view at submit time.
const DEFAULT_LVL1_BONZAI = 1000n * 10n ** 18n;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG ACCESS
// ═══════════════════════════════════════════════════════════════════════════

export class ServiceTimeNotConfigured extends Error {
  constructor() {
    super(
      "BonzaiServiceTime is not configured on the BonzAI economy chain.",
    );
    this.code = "SERVICE_TIME_NOT_CONFIGURED";
  }
}

function _addr(key) {
  const addresses = {
    serviceTime: CONFIG.p2pNetwork?.serviceTimeAddress,
    mintPool: CONFIG.mintPool?.contractAddress,
    bonzaiToken: CONFIG.stakingEconomy?.tokenAddress,
  };
  const a = addresses[key];
  if (!a || a === ethers.ZeroAddress) return null;
  return a;
}

export function isConfigured() {
  return Boolean(_addr("serviceTime"));
}

function _requireServiceTime() {
  const a = _addr("serviceTime");
  if (!a) throw new ServiceTimeNotConfigured();
  return a;
}

async function _getReadClients() {
  const provider = await getProvider(ECONOMY_NETWORK_KEY);
  return {
    serviceTime: new ethers.Contract(_requireServiceTime(), SERVICE_TIME_ABI, provider),
    mintPool:    _addr("mintPool")
      ? new ethers.Contract(_addr("mintPool"), MINT_POOL_ABI, provider) : null,
    bonzai:      _addr("bonzaiToken")
      ? new ethers.Contract(_addr("bonzaiToken"), BONZAI_TOKEN_ABI, provider) : null,
    provider,
  };
}

async function _getWriteClient() {
  await switchNetwork(ECONOMY_NETWORK_KEY);
  const signer = await getSigner();
  return {
    signer,
    serviceTime: new ethers.Contract(_requireServiceTime(), SERVICE_TIME_ABI, signer),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEDGER ACCESS (IPC to main)
// ═══════════════════════════════════════════════════════════════════════════
//
// The NDJSON ledger lives on disk under ~/bonzai-server/service_time.ndjson.
// Renderer can't read filesystem directly; main exposes:
//   electronAPI.serviceTime.readLedger() → row[]
//   electronAPI.serviceTime.truncateLedger(beforeTs) → bytesRemoved
// preload.js wires these.

async function _readLedger() {
  const api = window.electronAPI?.serviceTime;
  if (!api?.readLedger) {
    throw new Error("electronAPI.serviceTime.readLedger not exposed — preload wiring missing");
  }
  return await api.readLedger();
}

async function _truncateLedger(beforeTs) {
  const api = window.electronAPI?.serviceTime;
  if (!api?.truncateLedger) {
    throw new Error("electronAPI.serviceTime.truncateLedger not exposed");
  }
  return await api.truncateLedger(beforeTs);
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate the on-disk ledger into per-pipelineId totals. Used by
 * NetworkSettings.vue to show what's pending submission. Doesn't mutate
 * anything.
 *
 * @returns {Promise<{ pendingSeconds: Record<number, number>, rows: number, bytes: number }>}
 */
export async function getPendingSummary() {
  const rows = await _readLedger();
  const pendingSeconds = {};
  let bytes = 0;
  for (const r of rows) {
    pendingSeconds[r.pipelineId] = (pendingSeconds[r.pipelineId] ?? 0) + (r.seconds ?? 0);
    bytes += r._raw_size ?? 0;
  }
  return { pendingSeconds, rows: rows.length, bytes };
}

/**
 * Verify the signer satisfies the provider threshold on the economy chain
 * time. Returns { ok, balance, threshold, address }; UI surfaces this
 * before letting the provider attempt submission. Does NOT throw on a
 * config gap — the renderer treats "not configured" as "gating off".
 */
export async function checkEligibility() {
  if (!isConfigured()) {
    return { ok: false, configured: false, balance: 0n, threshold: DEFAULT_LVL1_BONZAI };
  }
  const address = web3Service.state.walletAddress;
  if (!address) return { ok: false, configured: true, balance: 0n, threshold: DEFAULT_LVL1_BONZAI, submissionAvailable: false, reason: 'wallet_required' };
  const { serviceTime, mintPool, provider } = await _getReadClients();
  const [threshold, claimsPaused, attestor, vaultAddress] = await Promise.all([
    serviceTime.LVL1_THRESHOLD(), serviceTime.claimsPaused(), serviceTime.serviceTimeAttestor(),
    mintPool ? mintPool.stakingVault() : ethers.ZeroAddress,
  ]);
  if (vaultAddress === ethers.ZeroAddress) return { ok: false, configured: false, balance: 0n, threshold, address, claimsPaused, attestor, submissionAvailable: false };
  const vault = new ethers.Contract(vaultAddress, ['function positions(address) view returns (uint256 amount,uint256 lockedUntil,uint256 updatedAt,uint32 contributionScore)'], provider);
  const balance = (await vault.positions(address)).amount;
  return {
    ok: balance >= threshold && !claimsPaused && attestor !== ethers.ZeroAddress,
    stakeEligible: balance >= threshold,
    configured: true,
    address,
    balance,
    threshold,
    claimsPaused,
    attestor,
    submissionAvailable: false,
  };
}

/**
 * Unsigned local ledgers cannot authorize rewards. Preserve all local records
 * until an independently verified receipt workflow is implemented.
 */
export async function flushPending() {
  if (!isConfigured()) return { rowsSubmitted: 0, skipped: "not_configured" };
  return {
    rowsSubmitted: 0,
    skipped: 'verified_service_receipts_required',
    message: 'Provider rewards require independently verified service receipts. Local activity stays on this device; reward submission is unavailable.',
  };
}

/**
 * Provider claim — withdraw weighted share for one (epoch, poolIndex).
 * Renderer-triggered, one tx per claim.
 */
export async function claimProviderRewards(epochId, poolIndex, expectedWallet = web3Service.state.walletAddress) {
  if (!Number.isSafeInteger(epochId) || epochId < 0 || !Number.isInteger(poolIndex) || poolIndex < 0 || poolIndex > 5) throw new Error("Invalid reward period or pool");
  const rewards = await fetchProviderRewards(expectedWallet, epochId);
  if (!rewards.rows[poolIndex].canClaim) throw new Error(rewards.paused ? 'Provider reward claims are paused.' : !rewards.stakeEligible ? 'The provider stake threshold is not met.' : 'No finalized reward is available for this pool.');
  const { serviceTime, signer } = await _getWriteClient();
  if (!expectedWallet || (await signer.getAddress()).toLowerCase() !== expectedWallet.toLowerCase()) throw new Error('Wallet changed. Refresh provider rewards before claiming.');
  const tx = await serviceTime.claimProviderRewards(epochId, poolIndex);
  return confirmedReceipt(tx);
}

/** Read chain receipts, never the unauthenticated local timing ledger. */
export async function fetchProviderRewards(wallet, requestedEpoch) {
  if (!ethers.isAddress(wallet || '')) throw new Error('Connect your provider wallet.');
  const { serviceTime, mintPool, provider } = await _getReadClients();
  if (!mintPool) throw new Error('Provider reward pool is not configured.');
  const [current, claimsPaused, pausedAll, attestor, threshold, vaultAddress] = await Promise.all([mintPool.currentEpoch(), serviceTime.claimsPaused(), serviceTime.paused(), serviceTime.serviceTimeAttestor(), serviceTime.LVL1_THRESHOLD(), mintPool.stakingVault()]);
  const paused = claimsPaused;
  const vault = vaultAddress !== ethers.ZeroAddress ? new ethers.Contract(vaultAddress, ['function positions(address) view returns (uint256 amount,uint256 lockedUntil,uint256 updatedAt,uint32 contributionScore)'], provider) : null;
  const stake = vault ? (await vault.positions(wallet)).amount : 0n;
  const stakeEligible = Boolean(vault) && stake >= threshold;
  const epoch = requestedEpoch ?? Math.max(0, Number(current) - 1);
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch > Number(current)) throw new Error('Choose an existing reward period.');
  const [finalized, deposits] = await Promise.all([mintPool.isEpochFinalized(epoch), mintPool.getEpochProviderDeposits(epoch)]);
  const rows = await Promise.all(['Text', 'Audio', 'Images', 'Video', '3D', 'Training'].map(async (label, pool) => {
    const [seconds, total, claimed] = await Promise.all([serviceTime.providerServiceTime(epoch, pool, wallet), serviceTime.totalServiceTime(epoch, pool), serviceTime.providerClaimed(epoch, pool, wallet)]);
    const amount = total > 0n && !claimed ? deposits[pool] * seconds / total : 0n;
    return { pool, label, seconds: seconds.toString(), claimed, amount: ethers.formatEther(amount), canClaim: finalized && !paused && amount > 0n };
  }));
  return { epoch, current: Number(current), paused, finalized, stakeEligible, threshold: ethers.formatEther(threshold), rows };
}

// ─── Reads (UI-facing) ──────────────────────────────────────────────────

export async function getProviderServiceTime(epochId, poolIndex, providerAddress) {
  const { serviceTime } = await _getReadClients();
  return await serviceTime.providerServiceTime(epochId, poolIndex, providerAddress);
}

export async function getTotalServiceTime(epochId, poolIndex) {
  const { serviceTime } = await _getReadClients();
  return await serviceTime.totalServiceTime(epochId, poolIndex);
}

export async function hasProviderClaimed(epochId, poolIndex, providerAddress) {
  const { serviceTime } = await _getReadClients();
  return await serviceTime.providerClaimed(epochId, poolIndex, providerAddress);
}

export async function pipelineToPool(pipelineId) {
  const { serviceTime } = await _getReadClients();
  return Number(await serviceTime.pipelineToPool(pipelineId));
}

export async function currentEpoch() {
  const { mintPool } = await _getReadClients();
  if (!mintPool) throw new Error("MintPool address not configured");
  return await mintPool.currentEpoch();
}

export async function isEpochFinalized(epochId) {
  const { mintPool } = await _getReadClients();
  if (!mintPool) throw new Error("MintPool address not configured");
  return await mintPool.isEpochFinalized(epochId);
}

// ─── Constants exposed for tests ────────────────────────────────────────

export const __test = {
  ECONOMY_CHAIN_ID,
  DEFAULT_LVL1_BONZAI,
};
