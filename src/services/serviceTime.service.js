/**
 * BonzAI ServiceTime Service
 *
 * Client-side helper for the free P2P inference accounting flow.
 *
 * Flow:
 *   1. Consumer opens a session with a provider. A single EIP-712 envelope is
 *      built and signed ONCE per session (~1h default). No per-request sigs.
 *   2. Consumer sends the signed envelope to the provider over libp2p.
 *   3. Provider uses inference freely until expiryTime.
 *   4. After expiryTime, provider submits batches of closed sessions to
 *      BonzaiServiceTime on Arbitrum. Time is credited per (epoch, pool).
 *   5. At epoch close, provider claims their weighted share of the pool's
 *      provider side (50% by default).
 *
 * Sybil resistance: ONLY the provider needs >= 1000 BONZAI on Arbitrum at
 * submit time. Consumers have no token requirement — end-user mobile apps
 * built on top of BonzAI skills can consume inference freely without any
 * Web3 wallet. No oracle, no attestor.
 */

import { ethers } from "ethers";
import { CONFIG } from "../config/web3.config.js";
import { getSigner, getProvider, switchNetwork } from "./web3.service.js";

// ═══════════════════════════════════════════════════════════════════════════
// ABIs
// ═══════════════════════════════════════════════════════════════════════════

const SERVICE_TIME_ABI = [
  "function submitReceipts((address consumer,address provider,uint8 pipelineId,uint256 openTime,uint256 expiryTime,uint256 nonce,bytes32 providerPeerId)[] sessions, bytes[] signatures)",
  "function claimProviderRewards(uint256 epochId, uint8 poolIndex)",
  "function providerServiceTime(uint256 epochId, uint8 poolIndex, address provider) view returns (uint256)",
  "function totalServiceTime(uint256 epochId, uint8 poolIndex) view returns (uint256)",
  "function providerClaimed(uint256 epochId, uint8 poolIndex, address provider) view returns (bool)",
  "function usedNonces(address consumer, uint256 nonce) view returns (bool)",
  "function pipelineToPool(uint8 pipelineId) pure returns (uint8)",
  "function domainSeparator() view returns (bytes32)",
  "function LVL1_THRESHOLD() view returns (uint256)",
  "function MAX_SESSION_DURATION() view returns (uint256)",
  "event SessionSubmitted(address indexed provider, address indexed consumer, uint8 indexed poolIndex, uint256 epochId, uint256 secondsServed, uint256 nonce)",
  "event ProviderRewardsClaimed(address indexed provider, uint256 indexed epochId, uint8 indexed poolIndex, uint256 providerTime, uint256 totalTime)",
];

const MINT_POOL_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function isEpochFinalized(uint256 epochId) view returns (bool)",
  "function getEpochProviderDeposits(uint256 epochId) view returns (uint256[6])",
];

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const ARBITRUM_CHAIN_ID = 42161;
const DEFAULT_SESSION_DURATION_SEC = 60 * 60; // 1 hour
const LVL1_BONZAI = 1000n * 10n ** 18n;

// EIP-712 types used for signing (must match SESSION_TYPEHASH in contract).
const SESSION_TYPES = {
  ServiceSession: [
    { name: "consumer", type: "address" },
    { name: "provider", type: "address" },
    { name: "pipelineId", type: "uint8" },
    { name: "openTime", type: "uint256" },
    { name: "expiryTime", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "providerPeerId", type: "bytes32" },
  ],
};

const SESSION_ENVELOPE_VERSION = 1;

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

function requireAddress(key) {
  const addr = CONFIG.contracts?.arbitrum?.[key];
  if (!addr || addr === ethers.ZeroAddress) {
    throw new Error(`Missing Arbitrum address for ${key} in web3.config.js`);
  }
  return addr;
}

async function getReadClient() {
  const provider = await getProvider("arbitrum");
  return {
    serviceTime: new ethers.Contract(requireAddress("serviceTime"), SERVICE_TIME_ABI, provider),
    mintPool: new ethers.Contract(requireAddress("mintPool"), MINT_POOL_ABI, provider),
  };
}

async function getWriteClient() {
  await switchNetwork("arbitrum");
  const signer = await getSigner();
  return {
    signer,
    serviceTime: new ethers.Contract(requireAddress("serviceTime"), SERVICE_TIME_ABI, signer),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION CREATION (consumer side)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build + sign a session envelope. Called ONCE per session on the consumer.
 *
 * @param {object} opts
 * @param {string} opts.providerAddress - Provider EOA (Arbitrum)
 * @param {string} opts.providerPeerId  - libp2p peer ID (string form)
 * @param {number} opts.pipelineId      - 0..11 (see BonzaiProviderRegistry)
 * @param {number} [opts.durationSec]   - defaults to 1 hour
 * @returns {Promise<object>} envelope: { session, signature, domain, consumer, wireJson }
 */
export async function openSession({
  providerAddress,
  providerPeerId,
  pipelineId,
  durationSec = DEFAULT_SESSION_DURATION_SEC,
}) {
  if (!ethers.isAddress(providerAddress)) throw new Error("Invalid provider address");
  if (!providerPeerId) throw new Error("Missing provider peer ID");
  if (pipelineId < 0 || pipelineId > 11) throw new Error("Invalid pipelineId");
  if (durationSec <= 0 || durationSec > 24 * 3600) throw new Error("Invalid durationSec");

  await switchNetwork("arbitrum");
  const signer = await getSigner();
  const consumer = await signer.getAddress();

  const now = Math.floor(Date.now() / 1000);
  const session = {
    consumer,
    provider: ethers.getAddress(providerAddress),
    pipelineId,
    openTime: now,
    expiryTime: now + durationSec,
    nonce: _randomNonce(),
    providerPeerId: _peerIdToBytes32(providerPeerId),
  };

  const domain = {
    name: "BonzaiServiceTime",
    version: "1",
    chainId: ARBITRUM_CHAIN_ID,
    verifyingContract: requireAddress("serviceTime"),
  };

  const signature = await signer.signTypedData(domain, SESSION_TYPES, session);

  return {
    session,
    signature,
    domain,
    consumer,
    // Wire-format blob sent to provider over libp2p.
    wireJson: JSON.stringify({
      v: SESSION_ENVELOPE_VERSION,
      session: {
        ...session,
        openTime: session.openTime.toString(),
        expiryTime: session.expiryTime.toString(),
        nonce: session.nonce.toString(),
      },
      signature,
    }),
  };
}

/**
 * Provider-side: parse an incoming wire envelope. Does not verify the sig
 * (submitReceipts does that on-chain); validates structure only.
 */
export function parseSessionEnvelope(wireJson) {
  const payload = typeof wireJson === "string" ? JSON.parse(wireJson) : wireJson;
  if (payload.v !== SESSION_ENVELOPE_VERSION) throw new Error("Unknown envelope version");
  const s = payload.session;
  if (!s || !payload.signature) throw new Error("Malformed envelope");
  const session = {
    consumer: ethers.getAddress(s.consumer),
    provider: ethers.getAddress(s.provider),
    pipelineId: Number(s.pipelineId),
    openTime: BigInt(s.openTime),
    expiryTime: BigInt(s.expiryTime),
    nonce: BigInt(s.nonce),
    providerPeerId: s.providerPeerId,
  };
  return { session, signature: payload.signature };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER: SUBMIT RECEIPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Provider submits a batch of closed sessions. Each entry is the parsed output
 * of parseSessionEnvelope(). Sessions must have expiryTime <= now.
 *
 * Submission window: the close epoch + 1 epoch of grace.
 */
export async function submitReceipts(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Empty receipt batch");
  }
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  for (const { session } of entries) {
    if (session.expiryTime > nowSec) throw new Error("Session not yet expired");
  }

  const { serviceTime } = await getWriteClient();
  const sessions = entries.map(({ session }) => session);
  const signatures = entries.map(({ signature }) => signature);

  const tx = await serviceTime.submitReceipts(sessions, signatures);
  return tx.wait();
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER: CLAIM REWARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Provider claims their weighted share of the pool's provider side for a
 * finalized epoch. Can be called once per (epoch, poolIndex).
 */
export async function claimProviderRewards(epochId, poolIndex) {
  if (poolIndex < 0 || poolIndex > 5) throw new Error("Invalid poolIndex");
  const { serviceTime } = await getWriteClient();
  const tx = await serviceTime.claimProviderRewards(epochId, poolIndex);
  return tx.wait();
}

// ═══════════════════════════════════════════════════════════════════════════
// READS
// ═══════════════════════════════════════════════════════════════════════════

export async function getProviderServiceTime(epochId, poolIndex, providerAddress) {
  const { serviceTime } = await getReadClient();
  return serviceTime.providerServiceTime(epochId, poolIndex, providerAddress);
}

export async function getTotalServiceTime(epochId, poolIndex) {
  const { serviceTime } = await getReadClient();
  return serviceTime.totalServiceTime(epochId, poolIndex);
}

export async function hasProviderClaimed(epochId, poolIndex, providerAddress) {
  const { serviceTime } = await getReadClient();
  return serviceTime.providerClaimed(epochId, poolIndex, providerAddress);
}

export async function previewProviderRewards(epochId, poolIndex, providerAddress) {
  const { serviceTime, mintPool } = await getReadClient();
  const [providerTime, totalTime, providerPools] = await Promise.all([
    serviceTime.providerServiceTime(epochId, poolIndex, providerAddress),
    serviceTime.totalServiceTime(epochId, poolIndex),
    mintPool.getEpochProviderDeposits(epochId),
  ]);
  if (totalTime === 0n || providerTime === 0n) return 0n;
  const poolBalance = providerPools[poolIndex];
  return (poolBalance * providerTime) / totalTime;
}

export async function getCurrentEpoch() {
  const { mintPool } = await getReadClient();
  return mintPool.currentEpoch();
}

export async function isEpochFinalized(epochId) {
  const { mintPool } = await getReadClient();
  return mintPool.isEpochFinalized(epochId);
}

export function pipelineToPoolIndex(pipelineId) {
  if (pipelineId === 0) return 0;                       // LLM -> text
  if (pipelineId >= 1 && pipelineId <= 4) return 2;     // IMAGE_* -> image
  if (pipelineId >= 5 && pipelineId <= 8) return 1;     // AUDIO_* + MUSIC -> audio
  if (pipelineId === 9) return 3;                       // VIDEO_FAST -> video
  if (pipelineId === 10) return 2;                      // VISION -> image
  if (pipelineId === 11) return 0;                      // PIPELINE_SHARD -> text
  throw new Error(`Invalid pipelineId: ${pipelineId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// SYBIL / ELIGIBILITY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const BONZAI_BALANCE_ABI = ["function balanceOf(address owner) view returns (uint256)"];

export async function hasLvl1OnArbitrum(address) {
  const provider = await getProvider("arbitrum");
  const bonzai = new ethers.Contract(
    CONFIG.tokens.BONZAI.arbitrum,
    BONZAI_BALANCE_ABI,
    provider,
  );
  const bal = await bonzai.balanceOf(address);
  return bal >= LVL1_BONZAI;
}

export const LVL1_THRESHOLD_BONZAI = LVL1_BONZAI;

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════════════════════

function _randomNonce() {
  // 128 bits of entropy is plenty. Stored on-chain per consumer.
  const bytes = ethers.randomBytes(16);
  return BigInt("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
}

function _peerIdToBytes32(peerId) {
  // Hash the ASCII form of the libp2p peer ID to pack it into bytes32.
  // The on-chain contract never decodes this — it only needs binding to the
  // peer identity claimed at session-open time.
  return ethers.keccak256(ethers.toUtf8Bytes(peerId));
}
