/**
 * BonzAI ServiceTime — provider-side reward accounting (post-audit shape).
 *
 * The audit (see memory/audit_app_integration.md) replaced the EIP-712
 * envelope handshake that the v1 client used. Sessions are no longer
 * signed by the consumer — the provider self-reports seconds served:
 *
 *     BonzaiServiceTime.recordServiceTime(uint8 pipelineId, uint256 sec)
 *
 * Submission flow:
 *   1. The shard worker (src/server/shard.py) appends one row per
 *      completed session to ~/bonzai-server/service_time.ndjson.
 *   2. The Electron main bridge (src/main/shardSession.js) appends rows
 *      from its own bookkeeping path (kept symmetric so both halves can
 *      contribute when we add bridge-only sessions later).
 *   3. This module reads the ledger via IPC, batches by pipelineId,
 *      submits one `recordServiceTimeBatch` tx, and on success asks
 *      main to truncate the ingested rows.
 *   4. At epoch close the provider calls `claimProviderRewards(epochId,
 *      poolIndex)` to pull their weighted share of the MintPool's
 *      provider-side allocation.
 *
 * Sybil resistance: provider must hold >= LVL1_THRESHOLD (1000 BONZAI)
 * on Arbitrum at submit time. We check before sending the tx so a
 * provider below threshold sees a clean error instead of a wasted
 * gas estimate.
 *
 * Address gap: `BonzaiServiceTime` is not yet populated in
 * web3.config.js (web3.config.js → arbitrum.contracts.serviceTime is
 * pending the audit-deploy). Every on-chain call throws a typed
 * `ServiceTimeNotConfigured` error until that lands; UI surfaces hide
 * the corresponding buttons via `isConfigured()`.
 */

import { ethers } from "ethers";
import { CONFIG } from "../config/web3.config.js";
import { getSigner, getProvider, switchNetwork } from "./web3.service.js";

// ═══════════════════════════════════════════════════════════════════════════
// ABIs (audit-aligned)
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_TIME_ABI = [
  // Provider self-reports session time after the consumer disconnects.
  // pipelineId maps to a MintPool poolIndex via pipelineToPool().
  "function recordServiceTime(uint8 pipelineId, uint256 secondsServed)",
  "function recordServiceTimeBatch(uint8[] pipelineIds, uint256[] secondsServed)",

  // Claim weighted share of the pool's provider-side after epoch close.
  "function claimProviderRewards(uint256 epochId, uint8 poolIndex)",

  // Reads — for UI, eligibility checks, claim availability.
  "function providerServiceTime(uint256 epochId, uint8 poolIndex, address provider) view returns (uint256)",
  "function totalServiceTime(uint256 epochId, uint8 poolIndex) view returns (uint256)",
  "function providerClaimed(uint256 epochId, uint8 poolIndex, address provider) view returns (bool)",
  "function pipelineToPool(uint8 pipelineId) pure returns (uint8)",
  "function LVL1_THRESHOLD() view returns (uint256)",

  "event ServiceTimeRecorded(address indexed provider, uint8 indexed poolIndex, uint256 indexed epochId, uint256 secondsServed)",
  "event ProviderRewardsClaimed(address indexed provider, uint256 indexed epochId, uint8 indexed poolIndex, uint256 providerTime, uint256 totalTime)",
];

const MINT_POOL_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function isEpochFinalized(uint256 epochId) view returns (bool)",
];

const BONZAI_TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

const ARBITRUM_CHAIN_ID = 42161;
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
      "BonzaiServiceTime address is not yet populated in web3.config.js " +
      "(arbitrum.contracts.serviceTime). Pending the audit deploy.",
    );
    this.code = "SERVICE_TIME_NOT_CONFIGURED";
  }
}

function _addr(key) {
  const a = CONFIG.contracts?.arbitrum?.[key];
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
  const provider = await getProvider("arbitrum");
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
  await switchNetwork("arbitrum");
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
 * Verify the signer holds enough BONZAI on Arbitrum to record service
 * time. Returns { ok, balance, threshold, address }; UI surfaces this
 * before letting the provider attempt submission. Does NOT throw on a
 * config gap — the renderer treats "not configured" as "gating off".
 */
export async function checkEligibility() {
  if (!isConfigured()) {
    return { ok: false, configured: false, balance: 0n, threshold: DEFAULT_LVL1_BONZAI };
  }
  const { serviceTime, bonzai, provider } = await _getReadClients();
  const signer = await getSigner();
  const address = await signer.getAddress();
  let threshold = DEFAULT_LVL1_BONZAI;
  try { threshold = await serviceTime.LVL1_THRESHOLD(); } catch {}
  let balance = 0n;
  if (bonzai) {
    try { balance = await bonzai.balanceOf(address); } catch {}
  }
  return {
    ok: balance >= threshold,
    configured: true,
    address,
    balance,
    threshold,
  };
}

/**
 * Read the ledger, batch by pipelineId, submit
 * `recordServiceTimeBatch`, truncate ingested rows on success.
 *
 * Returns { rowsSubmitted, txHash, totals } or { rowsSubmitted: 0,
 * skipped: <reason> }. Caller can re-run safely; truncation only
 * happens after the tx confirms.
 */
export async function flushPending() {
  if (!isConfigured()) {
    return { rowsSubmitted: 0, skipped: "not_configured" };
  }
  const elig = await checkEligibility();
  if (!elig.ok) {
    return { rowsSubmitted: 0, skipped: "below_lvl1_threshold", balance: elig.balance };
  }

  const rows = await _readLedger();
  if (rows.length === 0) return { rowsSubmitted: 0, skipped: "ledger_empty" };

  // Batch by pipelineId. We round seconds DOWN to integer — the contract
  // stores uint256 seconds; partial-second rows in the ledger get
  // accumulated and only the floor is reported per batch. Trailing
  // sub-second remainder per pipeline stays in the ledger for the next
  // flush.
  const totals = new Map();
  let maxTs = 0;
  for (const r of rows) {
    if (r.ts > maxTs) maxTs = r.ts;
    totals.set(r.pipelineId, (totals.get(r.pipelineId) ?? 0) + (r.seconds ?? 0));
  }
  const pipelineIds = [];
  const secondsServed = [];
  for (const [pid, sec] of totals) {
    const intSec = Math.floor(sec);
    if (intSec <= 0) continue;
    pipelineIds.push(pid);
    secondsServed.push(BigInt(intSec));
  }
  if (pipelineIds.length === 0) {
    return { rowsSubmitted: 0, skipped: "no_complete_seconds" };
  }

  const { serviceTime } = await _getWriteClient();
  const tx = pipelineIds.length === 1
    ? await serviceTime.recordServiceTime(pipelineIds[0], secondsServed[0])
    : await serviceTime.recordServiceTimeBatch(pipelineIds, secondsServed);
  const receipt = await tx.wait();

  await _truncateLedger(maxTs);

  return {
    rowsSubmitted: rows.length,
    txHash: receipt?.hash ?? tx.hash,
    totals: Object.fromEntries(
      pipelineIds.map((pid, i) => [pid, secondsServed[i].toString()]),
    ),
  };
}

/**
 * Provider claim — withdraw weighted share for one (epoch, poolIndex).
 * Renderer-triggered, one tx per claim.
 */
export async function claimProviderRewards(epochId, poolIndex) {
  if (poolIndex < 0 || poolIndex > 5) throw new Error("Invalid poolIndex");
  const { serviceTime } = await _getWriteClient();
  const tx = await serviceTime.claimProviderRewards(epochId, poolIndex);
  return tx.wait();
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
  ARBITRUM_CHAIN_ID,
  DEFAULT_LVL1_BONZAI,
};
