/**
 * BonzAI Token Issuance Service
 *
 * Handles skill token deployment and Uniswap liquidity pool creation.
 *
 * Features:
 * - ERC20 token deployment for skills
 * - Uniswap V3 pool creation (SKILL/ETH)
 * - For DSLA prediction markets: SKILL/DSLA pool creation
 * - Initial liquidity provision
 */

import { ethers } from 'ethers';
import { reactive, readonly } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const ERC20_FACTORY_ABI = [
  'function createToken(string name, string symbol, uint256 totalSupply) returns (address)',
  'event TokenCreated(address indexed token, string name, string symbol, uint256 totalSupply)',
];

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

// Uniswap V3 Factory and Router ABIs (simplified)
const UNISWAP_FACTORY_ABI = [
  'function createPool(address tokenA, address tokenB, uint24 fee) returns (address pool)',
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
];

const UNISWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)',
];

const UNISWAP_POSITION_MANAGER_ABI = [
  'function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
];

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT ADDRESSES (Arbitrum)
// ═══════════════════════════════════════════════════════════════════════════

const CONTRACTS = {
  // Uniswap V3 on Arbitrum
  uniswapFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  uniswapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  uniswapPositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  // WETH on Arbitrum
  weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  // DSLA token on Arbitrum (placeholder - update with real address)
  dsla: '0x0000000000000000000000000000000000000000', // TODO: Add real DSLA address
};

// Fee tiers for Uniswap V3
const FEE_TIERS = {
  LOW: 500,      // 0.05%
  MEDIUM: 3000,  // 0.3%
  HIGH: 10000,   // 1%
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // Issued tokens by skill ID
  issuedTokens: {},

  // Current DSLA/ETH price
  dslaEthPrice: null,
  dslaEthPriceUpdatedAt: null,

  // Loading states
  isDeploying: false,
  isCreatingPool: false,
  isAddingLiquidity: false,
  isFetchingPrice: false,

  // Transaction history
  transactions: [],

  error: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'bonzai-skill-tokens';

const loadIssuedTokens = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      state.issuedTokens = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[Token] Failed to load issued tokens:', e);
  }
};

const saveIssuedToken = (skillId, tokenData) => {
  try {
    state.issuedTokens[skillId] = tokenData;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.issuedTokens));
  } catch (e) {
    console.warn('[Token] Failed to save issued token:', e);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PRICE FETCHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch current DSLA/ETH price from CoinGecko or DEX
 */
const fetchDslaEthPrice = async () => {
  state.isFetchingPrice = true;

  try {
    // Try CoinGecko first
    if (window.externalProxy?.get) {
      const result = await window.externalProxy.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=dsla-protocol&vs_currencies=eth'
      );

      if (result.success && result.data?.['dsla-protocol']?.eth) {
        state.dslaEthPrice = result.data['dsla-protocol'].eth;
        state.dslaEthPriceUpdatedAt = Date.now();
        return state.dslaEthPrice;
      }
    }

    // Fallback: Use a mock price for development
    console.warn('[Token] Using mock DSLA/ETH price');
    state.dslaEthPrice = 0.0000015; // Mock: ~$0.003 at $2000 ETH
    state.dslaEthPriceUpdatedAt = Date.now();
    return state.dslaEthPrice;
  } catch (e) {
    console.error('[Token] Failed to fetch DSLA/ETH price:', e);
    // Use mock price on error
    state.dslaEthPrice = 0.0000015;
    state.dslaEthPriceUpdatedAt = Date.now();
    return state.dslaEthPrice;
  } finally {
    state.isFetchingPrice = false;
  }
};

/**
 * Calculate DSLA amount from ETH amount
 */
const ethToDsla = (ethAmount) => {
  if (!state.dslaEthPrice || state.dslaEthPrice === 0) {
    return 0;
  }
  return ethAmount / state.dslaEthPrice;
};

/**
 * Calculate ETH amount from DSLA amount
 */
const dslaToEth = (dslaAmount) => {
  if (!state.dslaEthPrice) {
    return 0;
  }
  return dslaAmount * state.dslaEthPrice;
};

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN DEPLOYMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deploy a new ERC20 token for a skill
 *
 * @param {Object} params - Token parameters
 * @param {string} params.skillId - Skill ID
 * @param {string} params.name - Token name
 * @param {string} params.symbol - Token symbol
 * @param {string} params.totalSupply - Total supply (as string, will be parsed with 18 decimals)
 * @returns {Promise<{success: boolean, tokenAddress?: string, txHash?: string, error?: string}>}
 */
const deployToken = async ({ skillId, name, symbol, totalSupply }) => {
  state.isDeploying = true;
  state.error = null;

  try {
    // TODO: Enable real deployment after token factory contract is deployed
    const ENABLE_REAL_DEPLOYMENT = false;

    if (!ENABLE_REAL_DEPLOYMENT) {
      // Mock deployment
      console.log('[Token] Mock deployment for:', { skillId, name, symbol, totalSupply });

      const mockTokenAddress = `0x${Date.now().toString(16).padStart(40, '0')}`;
      const mockTxHash = `0x${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

      const tokenData = {
        address: mockTokenAddress,
        name,
        symbol,
        totalSupply,
        decimals: 18,
        deployedAt: Date.now(),
        deployTxHash: mockTxHash,
        pools: {},
        mock: true,
      };

      saveIssuedToken(skillId, tokenData);

      state.transactions.push({
        type: 'token-deploy',
        skillId,
        tokenAddress: mockTokenAddress,
        txHash: mockTxHash,
        timestamp: Date.now(),
        mock: true,
      });

      return { success: true, tokenAddress: mockTokenAddress, txHash: mockTxHash, mock: true };
    }

    // Real deployment (disabled until factory contract deployed)
    const signer = await web3Service.getSigner();
    // ... real deployment logic would go here

    throw new Error('Real token deployment not yet implemented');
  } catch (e) {
    const error = e.message || String(e);
    state.error = error;
    console.error('[Token] Deployment failed:', error);
    return { success: false, error };
  } finally {
    state.isDeploying = false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UNISWAP POOL CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a Uniswap V3 pool for the token
 *
 * @param {Object} params - Pool parameters
 * @param {string} params.skillId - Skill ID
 * @param {string} params.tokenAddress - Token contract address
 * @param {string} params.pairedToken - 'ETH' or 'DSLA'
 * @param {number} params.fee - Fee tier (500, 3000, or 10000)
 * @returns {Promise<{success: boolean, poolAddress?: string, txHash?: string, error?: string}>}
 */
const createPool = async ({ skillId, tokenAddress, pairedToken = 'ETH', fee = FEE_TIERS.MEDIUM }) => {
  state.isCreatingPool = true;
  state.error = null;

  try {
    const ENABLE_REAL_POOLS = false;

    if (!ENABLE_REAL_POOLS) {
      // Mock pool creation
      console.log('[Token] Mock pool creation:', { skillId, tokenAddress, pairedToken, fee });

      const mockPoolAddress = `0x${(Date.now() + 1).toString(16).padStart(40, '0')}`;
      const mockTxHash = `0x${Math.random().toString(16).slice(2)}${(Date.now() + 1).toString(16)}`;

      // Update token data with pool info
      const tokenData = state.issuedTokens[skillId];
      if (tokenData) {
        tokenData.pools[pairedToken] = {
          address: mockPoolAddress,
          fee,
          createdAt: Date.now(),
          createTxHash: mockTxHash,
          liquidity: null,
        };
        saveIssuedToken(skillId, tokenData);
      }

      state.transactions.push({
        type: 'pool-create',
        skillId,
        poolAddress: mockPoolAddress,
        pairedToken,
        fee,
        txHash: mockTxHash,
        timestamp: Date.now(),
        mock: true,
      });

      return { success: true, poolAddress: mockPoolAddress, txHash: mockTxHash, mock: true };
    }

    // Real pool creation
    throw new Error('Real pool creation not yet implemented');
  } catch (e) {
    const error = e.message || String(e);
    state.error = error;
    console.error('[Token] Pool creation failed:', error);
    return { success: false, error };
  } finally {
    state.isCreatingPool = false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LIQUIDITY PROVISION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Add liquidity to a Uniswap pool
 *
 * @param {Object} params - Liquidity parameters
 * @param {string} params.skillId - Skill ID
 * @param {string} params.pairedToken - 'ETH' or 'DSLA'
 * @param {string} params.tokenAmount - Amount of skill token to add
 * @param {string} params.pairedAmount - Amount of paired token (ETH or DSLA)
 * @param {number} params.startingPrice - Starting price in paired token
 * @returns {Promise<{success: boolean, txHash?: string, liquidityTokenId?: string, error?: string}>}
 */
const addLiquidity = async ({ skillId, pairedToken = 'ETH', tokenAmount, pairedAmount, startingPrice }) => {
  state.isAddingLiquidity = true;
  state.error = null;

  try {
    const ENABLE_REAL_LIQUIDITY = false;

    if (!ENABLE_REAL_LIQUIDITY) {
      // Mock liquidity addition
      console.log('[Token] Mock liquidity addition:', { skillId, pairedToken, tokenAmount, pairedAmount, startingPrice });

      const mockTxHash = `0x${Math.random().toString(16).slice(2)}${(Date.now() + 2).toString(16)}`;
      const mockLiquidityTokenId = `${Date.now()}`;

      // Update token data with liquidity info
      const tokenData = state.issuedTokens[skillId];
      if (tokenData && tokenData.pools[pairedToken]) {
        tokenData.pools[pairedToken].liquidity = {
          tokenAmount,
          pairedAmount,
          startingPrice,
          liquidityTokenId: mockLiquidityTokenId,
          addedAt: Date.now(),
          addTxHash: mockTxHash,
        };
        saveIssuedToken(skillId, tokenData);
      }

      state.transactions.push({
        type: 'liquidity-add',
        skillId,
        pairedToken,
        tokenAmount,
        pairedAmount,
        startingPrice,
        txHash: mockTxHash,
        timestamp: Date.now(),
        mock: true,
      });

      return { success: true, txHash: mockTxHash, liquidityTokenId: mockLiquidityTokenId, mock: true };
    }

    // Real liquidity addition
    throw new Error('Real liquidity addition not yet implemented');
  } catch (e) {
    const error = e.message || String(e);
    state.error = error;
    console.error('[Token] Liquidity addition failed:', error);
    return { success: false, error };
  } finally {
    state.isAddingLiquidity = false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE ISSUANCE FLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete token issuance flow:
 * 1. Deploy token
 * 2. Create SKILL/ETH pool
 * 3. Add ETH liquidity
 * 4. For DSLA skills: Create SKILL/DSLA pool and add liquidity
 *
 * @param {Object} params - Issuance parameters
 * @param {string} params.skillId - Skill ID
 * @param {string} params.name - Token name
 * @param {string} params.symbol - Token symbol
 * @param {string} params.totalSupply - Total token supply
 * @param {string} params.initialLiquidityTokens - Tokens to add as initial liquidity
 * @param {string} params.initialLiquidityEth - ETH to add as initial liquidity
 * @param {number} params.startingPriceEth - Starting price in ETH
 * @param {boolean} params.isDslaSkill - Whether this is a DSLA prediction market skill
 * @param {string} params.initialLiquidityDsla - DSLA to add as liquidity (for DSLA skills)
 * @param {Function} params.onProgress - Progress callback
 * @returns {Promise<{success: boolean, tokenData?: Object, error?: string}>}
 */
const issueSkillToken = async ({
  skillId,
  name,
  symbol,
  totalSupply,
  initialLiquidityTokens,
  initialLiquidityEth,
  startingPriceEth,
  isDslaSkill = false,
  initialLiquidityDsla = null,
  onProgress = () => {},
}) => {
  try {
    // Step 1: Deploy token
    onProgress({ step: 1, total: isDslaSkill ? 4 : 2, message: 'Deploying token...' });

    const deployResult = await deployToken({ skillId, name, symbol, totalSupply });
    if (!deployResult.success) {
      return { success: false, error: `Token deployment failed: ${deployResult.error}` };
    }

    const tokenAddress = deployResult.tokenAddress;

    // Step 2: Create SKILL/ETH pool and add liquidity
    onProgress({ step: 2, total: isDslaSkill ? 4 : 2, message: 'Creating SKILL/ETH pool...' });

    const ethPoolResult = await createPool({
      skillId,
      tokenAddress,
      pairedToken: 'ETH',
      fee: FEE_TIERS.MEDIUM,
    });

    if (!ethPoolResult.success) {
      return { success: false, error: `ETH pool creation failed: ${ethPoolResult.error}` };
    }

    const ethLiquidityResult = await addLiquidity({
      skillId,
      pairedToken: 'ETH',
      tokenAmount: initialLiquidityTokens,
      pairedAmount: initialLiquidityEth,
      startingPrice: startingPriceEth,
    });

    if (!ethLiquidityResult.success) {
      return { success: false, error: `ETH liquidity failed: ${ethLiquidityResult.error}` };
    }

    // Steps 3-4: For DSLA skills, also create SKILL/DSLA pool
    if (isDslaSkill && initialLiquidityDsla) {
      onProgress({ step: 3, total: 4, message: 'Creating SKILL/DSLA pool...' });

      const dslaPoolResult = await createPool({
        skillId,
        tokenAddress,
        pairedToken: 'DSLA',
        fee: FEE_TIERS.MEDIUM,
      });

      if (!dslaPoolResult.success) {
        console.warn('[Token] DSLA pool creation failed:', dslaPoolResult.error);
        // Continue anyway - ETH pool is the primary pool
      } else {
        onProgress({ step: 4, total: 4, message: 'Adding DSLA liquidity...' });

        // Calculate starting price in DSLA based on ETH price
        const startingPriceDsla = state.dslaEthPrice ? startingPriceEth / state.dslaEthPrice : 0;

        const dslaLiquidityResult = await addLiquidity({
          skillId,
          pairedToken: 'DSLA',
          tokenAmount: initialLiquidityTokens,
          pairedAmount: initialLiquidityDsla,
          startingPrice: startingPriceDsla,
        });

        if (!dslaLiquidityResult.success) {
          console.warn('[Token] DSLA liquidity failed:', dslaLiquidityResult.error);
        }
      }
    }

    // Return complete token data
    const tokenData = state.issuedTokens[skillId];
    return { success: true, tokenData };
  } catch (e) {
    const error = e.message || String(e);
    state.error = error;
    console.error('[Token] Issuance failed:', error);
    return { success: false, error };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a skill has an issued token
 */
const hasIssuedToken = (skillId) => {
  loadIssuedTokens();
  return !!state.issuedTokens[skillId];
};

/**
 * Get token data for a skill
 */
const getTokenData = (skillId) => {
  loadIssuedTokens();
  return state.issuedTokens[skillId] || null;
};

/**
 * Get transaction history
 */
const getTransactionHistory = () => {
  return [...state.transactions].reverse();
};

/**
 * Initialize service
 */
const initialize = () => {
  loadIssuedTokens();
  fetchDslaEthPrice();
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const tokenService = {
  state: readonly(state),

  // Price
  fetchDslaEthPrice,
  ethToDsla,
  dslaToEth,

  // Token operations
  deployToken,
  createPool,
  addLiquidity,
  issueSkillToken,

  // Utilities
  hasIssuedToken,
  getTokenData,
  getTransactionHistory,
  initialize,

  // Constants
  FEE_TIERS,
  CONTRACTS,
};

export default tokenService;
