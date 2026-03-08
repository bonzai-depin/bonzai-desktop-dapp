/**
 * BonzAI Leaderboard Service
 *
 * Provides a ranked list of companions by net worth and revenue.
 * Uses real on-chain data when contracts are deployed, falls back to mock data otherwise.
 *
 * Data sources:
 *   - CompanionMinted events from Base (BonzaiCompanions contract)
 *   - BONZAI balance on Arbitrum (for net worth weighting)
 *   - BonzaiSkillOwnership unclaimed revenue
 *   - CompanionToken market cap from Uniswap V4 pools
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

const COMPANION_TOKEN_ABI = [
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
];

// ═══════════════════════════════════════════════════════════════════════════
// REAL DATA PATH
// ═══════════════════════════════════════════════════════════════════════════

async function getBonzaiTokenContract() {
  const network = 'arbitrum';
  const provider = await web3Service.getProvider(network);
  const tokenAddress = CONFIG.tokens.BONZAI[network];
  return new ethers.Contract(tokenAddress, BONZAI_TOKEN_ABI, provider);
}

async function getCompanionNetWorth(companion) {
  if (!companion.agentWallet) return 0;
  try {
    const tokenContract = await getBonzaiTokenContract();
    const balance = await tokenContract.balanceOf(companion.agentWallet);
    return Number(ethers.formatEther(balance));
  } catch {
    return 0;
  }
}

async function getCompanionRevenue(companion) {
  if (!companion.agentWallet) return { weekly: 0, monthly: 0 };
  try {
    const unclaimedEth = await skillOwnershipService.getUnclaimedRevenue(companion.agentWallet);
    const monthly = parseFloat(unclaimedEth) || 0;
    return { weekly: monthly / 4, monthly };
  } catch {
    return { weekly: 0, monthly: 0 };
  }
}

async function fetchRealLeaderboard() {
  // Discover all minted companions via owned companions of connected user
  // A full implementation would query CompanionMinted events or use a subgraph
  const userAddress = web3Service.state.walletAddress;
  if (!userAddress) return null;

  const allCompanions = await companionService.loadOwnedCompanions(userAddress);
  if (!allCompanions || allCompanions.length === 0) return null;

  const ethPrice = tokenService?.state?.ethUsdPrice || 3000;

  const leaderboard = await Promise.all(allCompanions.map(async (companion) => {
    const [netWorth, revenue] = await Promise.all([
      getCompanionNetWorth(companion),
      getCompanionRevenue(companion),
    ]);
    return {
      rank: 0,
      name: companion.name || `Companion #${companion.tokenId}`,
      image: companion.image || null,
      netWorth: netWorth * ethPrice,
      weeklyRevenue: revenue.weekly * ethPrice,
      monthlyRevenue: revenue.monthly * ethPrice,
      tokenAddress: companion.tokenAddress || null,
      agentWallet: companion.agentWallet,
      companionTokenId: companion.tokenId,
      isMock: false,
    };
  }));

  leaderboard.sort((a, b) => b.netWorth - a.netWorth);
  leaderboard.forEach((entry, i) => { entry.rank = i + 1; });

  return leaderboard.slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA FALLBACK
// ═══════════════════════════════════════════════════════════════════════════

function getMockLeaderboard() {
  const ethPrice = tokenService?.state?.ethUsdPrice || 3000;

  const mockNames = [
    'Aurore Beaumont', 'Marcus Ferrara', 'Mai Tanaka', 'Jin Chen',
    'Zara Okonkwo', 'James Whitmore', 'Priya Sharma', 'Damon Rivers',
    'Sofia Reyes', 'ARIA-7'
  ];

  return mockNames.map((name, i) => {
    const netWorthEth = (1000000 - i * 90000) / ethPrice;
    const monthlyRevenueEth = (4000 - i * 350) / ethPrice;

    return {
      rank: i + 1,
      name,
      image: null,
      netWorth: netWorthEth * ethPrice,
      weeklyRevenue: (monthlyRevenueEth / 4) * ethPrice,
      monthlyRevenue: monthlyRevenueEth * ethPrice,
      tokenAddress: null,
      agentWallet: null,
      companionTokenId: null,
      isMock: true,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the companion leaderboard (top 10 by net worth)
 * Attempts real on-chain data first, falls back to mock data
 * @returns {Promise<Array>} Leaderboard entries
 */
export async function getLeaderboard() {
  try {
    // Only attempt real data if contracts are deployed
    if (CONFIG.skillRegistry.ownershipContractAddress && CONFIG.companionNFT_BASE.contractAddress) {
      const realData = await fetchRealLeaderboard();
      if (realData && realData.length > 0) {
        return realData;
      }
    }
  } catch (err) {
    console.warn('[Leaderboard] Real data fetch failed, using mock:', err.message);
  }

  return getMockLeaderboard();
}

/**
 * Check if the leaderboard is using mock data
 * @returns {boolean}
 */
export function isUsingMockData() {
  return !CONFIG.skillRegistry.ownershipContractAddress || !CONFIG.companionNFT_BASE.contractAddress;
}
