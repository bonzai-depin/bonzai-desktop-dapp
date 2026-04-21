/**
 * BonzAI Leaderboard Service
 *
 * Companion leaderboard with multiple ranking modes and category champions.
 * All revenue/net-worth values are USDC-based (per the USDC-only marketplace).
 *
 * Ranking modes:
 *   - 'net_worth'      BONZAI balance (agent wallet, aggregated across chains)
 *   - 'total_revenue'  Sum of all CompanionRevenueShare event payouts
 *   - 'unclaimed'      Current unclaimed USDC revenue on-chain
 *   - 'activity'       Skill registration count (most active co-owner)
 *
 * Category champions: top companion per spending category (education, finance, etc).
 *
 * Data sources:
 *   - CompanionMinted events on Base (BonzaiCompanions) → global companion set
 *   - BONZAI balance on Ethereum + Arbitrum + Base (aggregated)
 *   - BonzaiSkillOwnership.CompanionRevenueShare events (historical revenue)
 *   - BonzaiSkillOwnership.unclaimedRevenueUSDC (current unclaimed)
 *   - CompanionRegistered events (skill co-ownership count)
 */

import { ethers } from 'ethers';
import { companionService } from './companion.service.js';
import { skillOwnershipService } from './skillOwnership.service.js';
import { web3Service } from './web3.service.js';
import { CONFIG } from '../config/web3.config.js';
import { tokenService } from './token.service.js';

const BONZAI_TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
];

const COMPANIONS_ABI_EVENTS = [
  'event CompanionMinted(uint256 indexed tokenId, address indexed owner, address indexed agentWallet)',
];

const OWNERSHIP_ABI_EVENTS = [
  'event CompanionRegistered(bytes32 indexed skillId, uint256 indexed companionTokenId, address ownerAddress, address companionWallet, uint8 profileScore, uint256 timestamp)',
  'event CompanionRevenueShare(bytes32 indexed skillId, address indexed wallet, uint256 indexed companionTokenId, uint256 share, uint256 weight, uint256 totalWeight, uint256 timestamp)',
];

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHERS
// ═══════════════════════════════════════════════════════════════════════════

async function getAggregateBonzaiBalance(wallet) {
  if (!wallet) return 0n;
  const chains = ['ethereum', 'arbitrum', 'base'];
  let total = 0n;
  await Promise.all(chains.map(async (chain) => {
    try {
      const provider = await web3Service.getProvider(chain);
      const addr = CONFIG.tokens?.BONZAI?.[chain];
      if (!addr) return;
      const token = new ethers.Contract(addr, BONZAI_TOKEN_ABI, provider);
      const bal = await token.balanceOf(wallet);
      total += bal;
    } catch { /* chain unreachable */ }
  }));
  return total;
}

async function fetchAllMintedCompanions() {
  const addr = CONFIG.companionNFT_BASE?.contractAddress;
  if (!addr) return [];
  try {
    const provider = await web3Service.getProvider('base');
    const contract = new ethers.Contract(addr, COMPANIONS_ABI_EVENTS, provider);
    const filter = contract.filters.CompanionMinted();
    const events = await contract.queryFilter(filter, 0, 'latest');
    return events.map((ev) => ({
      tokenId: ev.args.tokenId.toString(),
      owner: ev.args.owner,
      agentWallet: ev.args.agentWallet,
    }));
  } catch (e) {
    console.warn('[Leaderboard] Failed to index CompanionMinted events:', e.message);
    return [];
  }
}

async function fetchRevenueShareEvents(contract) {
  try {
    const events = await contract.queryFilter(
      contract.filters.CompanionRevenueShare(),
      0,
      'latest'
    );
    return events.map((ev) => ({
      skillId: ev.args.skillId,
      wallet: ev.args.wallet,
      companionTokenId: ev.args.companionTokenId.toString(),
      share: ev.args.share,
      timestamp: Number(ev.args.timestamp),
    }));
  } catch { return []; }
}

async function fetchRegistrationEvents(contract) {
  try {
    const events = await contract.queryFilter(
      contract.filters.CompanionRegistered(),
      0,
      'latest'
    );
    return events.map((ev) => ({
      skillId: ev.args.skillId,
      companionTokenId: ev.args.companionTokenId.toString(),
      ownerAddress: ev.args.ownerAddress,
      companionWallet: ev.args.companionWallet,
      profileScore: Number(ev.args.profileScore),
      timestamp: Number(ev.args.timestamp),
    }));
  } catch { return []; }
}

async function getOwnershipContract() {
  const addr = CONFIG.skillRegistry?.ownershipContractAddress;
  if (!addr) return null;
  const provider = await web3Service.getProvider('base');
  return new ethers.Contract(addr, OWNERSHIP_ABI_EVENTS, provider);
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the full set of companion leaderboard entries from on-chain data.
 * Includes every minted companion (not just the user's). Returns null if
 * contracts aren't deployed — callers should fall back to mock data.
 *
 * Each entry carries: name, agentWallet, tokenId, netWorth (USD),
 * totalRevenueUSDC, unclaimedUSDC, registrationCount, topCategory, activities.
 */
async function buildLeaderboardEntries() {
  if (!CONFIG.companionNFT_BASE?.contractAddress) return null;

  const [minted, ownershipContract] = await Promise.all([
    fetchAllMintedCompanions(),
    getOwnershipContract(),
  ]);
  if (!minted.length) return null;

  const [revenueEvents, registrationEvents] = ownershipContract
    ? await Promise.all([
        fetchRevenueShareEvents(ownershipContract),
        fetchRegistrationEvents(ownershipContract),
      ])
    : [[], []];

  // Aggregate revenue per agent wallet
  const revenueByWallet = new Map();
  for (const ev of revenueEvents) {
    const cur = revenueByWallet.get(ev.wallet) || 0n;
    revenueByWallet.set(ev.wallet, cur + ev.share);
  }

  // Count registrations per companion tokenId
  const registrationsByToken = new Map();
  for (const ev of registrationEvents) {
    registrationsByToken.set(
      ev.companionTokenId,
      (registrationsByToken.get(ev.companionTokenId) || 0) + 1
    );
  }

  // Hydrate each companion with its metadata (parallel). Unknown metadata is
  // tolerated — we still show the entry with a placeholder name.
  const entries = await Promise.all(minted.map(async (m) => {
    let name = `Companion #${m.tokenId}`;
    let image = null;
    try {
      const meta = await companionService.getCompanionMetadata(m.tokenId);
      if (meta?.name) name = meta.name;
      if (meta?.image) image = meta.image;
    } catch { /* metadata fetch best-effort */ }

    const [bonzaiBalance, unclaimedRaw] = await Promise.all([
      getAggregateBonzaiBalance(m.agentWallet),
      (async () => {
        if (!ownershipContract) return '0';
        try {
          return await skillOwnershipService.getUnclaimedRevenueUSDC(m.agentWallet);
        } catch { return '0'; }
      })(),
    ]);

    const bonzaiWhole = Number(ethers.formatEther(bonzaiBalance));
    const bonzaiUsdPrice = tokenService?.state?.bonzaiUsdPrice || 0.01;
    const totalRevenueUSDC = Number(revenueByWallet.get(m.agentWallet) || 0n) / 1_000_000;
    const unclaimedUSDC = Number(unclaimedRaw) / 1_000_000;

    return {
      tokenId: m.tokenId,
      name,
      image,
      owner: m.owner,
      agentWallet: m.agentWallet,
      bonzaiBalance: bonzaiWhole,
      netWorthUSD: bonzaiWhole * bonzaiUsdPrice,
      totalRevenueUSDC,
      unclaimedUSDC,
      registrationCount: registrationsByToken.get(m.tokenId) || 0,
      isMock: false,
    };
  }));

  return entries;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

const VALID_SORT_MODES = ['net_worth', 'total_revenue', 'unclaimed', 'activity'];

function sortEntries(entries, mode) {
  const arr = [...entries];
  if (mode === 'total_revenue') {
    arr.sort((a, b) => b.totalRevenueUSDC - a.totalRevenueUSDC);
  } else if (mode === 'unclaimed') {
    arr.sort((a, b) => b.unclaimedUSDC - a.unclaimedUSDC);
  } else if (mode === 'activity') {
    arr.sort((a, b) => b.registrationCount - a.registrationCount);
  } else {
    arr.sort((a, b) => b.netWorthUSD - a.netWorthUSD);
  }
  arr.forEach((e, i) => { e.rank = i + 1; });
  return arr;
}

/**
 * Get the global companion leaderboard (top 10 by the chosen sort mode).
 *
 * @param {{mode?: 'net_worth'|'total_revenue'|'unclaimed'|'activity', limit?: number}} [opts]
 * @returns {Promise<Array>}
 */
export async function getLeaderboard(opts = {}) {
  const mode = VALID_SORT_MODES.includes(opts.mode) ? opts.mode : 'net_worth';
  const limit = opts.limit || 10;
  try {
    const entries = await buildLeaderboardEntries();
    if (entries?.length) {
      return sortEntries(entries, mode).slice(0, limit);
    }
  } catch (err) {
    console.warn('[Leaderboard] Real data fetch failed, using mock:', err.message);
  }
  return getMockLeaderboard(mode, limit);
}

/**
 * Return the top companion for each spending category. For each category,
 * the winner is the companion with the highest total revenue on skills
 * tagged with that category. Uses the flagship skill definitions to map
 * skillId → category.
 *
 * @returns {Promise<Record<string, {companion: Object, revenueUSDC: number}|null>>}
 */
export async function getCategoryChampions() {
  if (!CONFIG.skillRegistry?.ownershipContractAddress) return {};
  try {
    const ownershipContract = await getOwnershipContract();
    if (!ownershipContract) return {};

    const { flagshipSkills } = await import('../skills/flagship.js');
    const categoryBySkillId = new Map();
    for (const s of flagshipSkills || []) {
      if (s.onChain?.id && s.category) {
        categoryBySkillId.set(s.onChain.id, s.category);
      }
    }

    const [revenueEvents, minted] = await Promise.all([
      fetchRevenueShareEvents(ownershipContract),
      fetchAllMintedCompanions(),
    ]);
    const walletToCompanion = new Map(minted.map((m) => [m.agentWallet, m]));

    // Group: category -> wallet -> total share
    const byCategory = new Map();
    for (const ev of revenueEvents) {
      const category = categoryBySkillId.get(ev.skillId);
      if (!category) continue;
      const walletMap = byCategory.get(category) || new Map();
      walletMap.set(ev.wallet, (walletMap.get(ev.wallet) || 0n) + ev.share);
      byCategory.set(category, walletMap);
    }

    const result = {};
    for (const [category, walletMap] of byCategory.entries()) {
      let bestWallet = null;
      let bestShare = 0n;
      for (const [w, s] of walletMap.entries()) {
        if (s > bestShare) { bestShare = s; bestWallet = w; }
      }
      const companion = bestWallet ? walletToCompanion.get(bestWallet) : null;
      result[category] = companion
        ? {
            companion,
            revenueUSDC: Number(bestShare) / 1_000_000,
          }
        : null;
    }
    return result;
  } catch (e) {
    console.warn('[Leaderboard] Category champions fetch failed:', e.message);
    return {};
  }
}

/**
 * Check if the leaderboard is using mock data (contracts not deployed).
 * @returns {boolean}
 */
export function isUsingMockData() {
  return !CONFIG.skillRegistry?.ownershipContractAddress
    || !CONFIG.companionNFT_BASE?.contractAddress;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════

function getMockLeaderboard(mode, limit) {
  const names = [
    'Aurore Beaumont', 'Marcus Ferrara', 'Mai Tanaka', 'Jin Chen',
    'Zara Okonkwo', 'James Whitmore', 'Priya Sharma', 'Damon Rivers',
    'Sofia Reyes', 'ARIA-7',
  ];
  const entries = names.map((name, i) => ({
    rank: 0,
    tokenId: String(i + 1),
    name,
    image: null,
    owner: null,
    agentWallet: null,
    bonzaiBalance: 100_000_000 - i * 8_000_000,
    netWorthUSD: (100_000_000 - i * 8_000_000) * 0.01,
    totalRevenueUSDC: 4000 - i * 350,
    unclaimedUSDC: (4000 - i * 350) * 0.2,
    registrationCount: 6 - Math.floor(i / 2),
    isMock: true,
  }));
  return sortEntries(entries, mode).slice(0, limit);
}
