/**
 * BonzAI Web3 Service
 * 
 * Handles wallet connection and multi-chain BONZAI balance aggregation
 * across Ethereum and Arbitrum networks.
 */

import { ethers } from 'ethers';
import { reactive, readonly, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';

// ═══════════════════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  // Connection
  isConnected: false,
  isConnecting: false,
  walletAddress: null,
  currentChainId: null,
  
  // Balances (aggregated across chains)
  balances: {
    ethereum: 0,
    arbitrum: 0,
    total: 0,
  },
  
  // Loading states
  isLoadingBalances: false,
  lastBalanceCheck: null,
  
  // Error handling
  error: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════════════════════

let browserProvider = null;
const rpcProviders = {};

/**
 * Initialize RPC providers for balance checking on multiple chains
 */
const initRpcProviders = () => {
  try {
    rpcProviders.ethereum = new ethers.JsonRpcProvider(CONFIG.networks.ethereum.rpc);
    rpcProviders.arbitrum = new ethers.JsonRpcProvider(CONFIG.networks.arbitrum.rpc);
  } catch (e) {
    console.error('[Web3] Failed to initialize RPC providers:', e);
  }
};

/**
 * Initialize browser wallet provider
 */
const initBrowserProvider = async () => {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No Web3 wallet detected. Please install MetaMask or another Web3 wallet.');
  }
  browserProvider = new ethers.BrowserProvider(window.ethereum);
  return browserProvider;
};

// ═══════════════════════════════════════════════════════════════════════════
// WALLET CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connect wallet and aggregate BONZAI balance across chains
 */
export const connectWallet = async () => {
  if (state.isConnecting) return { success: false, error: 'Connection in progress' };
  
  state.isConnecting = true;
  state.error = null;
  
  try {
    await initBrowserProvider();
    initRpcProviders();
    
    // Request account access
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please unlock your wallet.');
    }
    
    state.walletAddress = accounts[0];
    state.isConnected = true;
    
    // Get current chain
    const network = await browserProvider.getNetwork();
    state.currentChainId = Number(network.chainId);
    
    // Fetch balances across chains
    await fetchAllBalances();
    
    // Set up event listeners
    setupEventListeners();
    
    return {
      success: true,
      address: state.walletAddress,
      chainId: state.currentChainId,
      totalBalance: state.balances.total,
    };
  } catch (e) {
    state.error = e.message;
    console.error('[Web3] Connection failed:', e);
    return { success: false, error: e.message };
  } finally {
    state.isConnecting = false;
  }
};

/**
 * Disconnect wallet
 */
export const disconnectWallet = () => {
  state.isConnected = false;
  state.walletAddress = null;
  state.currentChainId = null;
  state.balances = { ethereum: 0, arbitrum: 0, total: 0 };
  state.lastBalanceCheck = null;
  state.error = null;
  removeEventListeners();
};

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch BONZAI balance on a specific chain
 */
const fetchBalanceOnChain = async (chain) => {
  if (!state.walletAddress) return 0;
  
  const provider = rpcProviders[chain];
  const tokenAddress = CONFIG.tokens.BONZAI[chain];
  
  if (!provider || !tokenAddress) {
    console.warn(`[Web3] Cannot fetch balance for chain: ${chain}`);
    return 0;
  }
  
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(state.walletAddress);
    const decimals = CONFIG.tokens.BONZAI.decimals;
    return parseFloat(ethers.formatUnits(balance, decimals));
  } catch (e) {
    console.error(`[Web3] Balance fetch failed on ${chain}:`, e);
    return 0;
  }
};

/**
 * Fetch BONZAI balances across all supported chains
 */
export const fetchAllBalances = async () => {
  if (!state.walletAddress) return state.balances;
  
  state.isLoadingBalances = true;
  
  try {
    // Fetch balances in parallel
    const [ethBalance, arbBalance] = await Promise.all([
      fetchBalanceOnChain('ethereum'),
      fetchBalanceOnChain('arbitrum'),
    ]);
    
    state.balances.ethereum = ethBalance;
    state.balances.arbitrum = arbBalance;
    state.balances.total = ethBalance + arbBalance;
    state.lastBalanceCheck = Date.now();
    
    return state.balances;
  } catch (e) {
    console.error('[Web3] Failed to fetch balances:', e);
    state.error = e.message;
    return state.balances;
  } finally {
    state.isLoadingBalances = false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CHAIN SWITCHING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Switch to a specific network
 */
export const switchNetwork = async (networkKey) => {
  const network = CONFIG.networks[networkKey];
  if (!network) {
    throw new Error(`Unknown network: ${networkKey}`);
  }
  
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: network.chainIdHex }],
    });
    return true;
  } catch (e) {
    // Chain not added, try to add it
    if (e.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: network.chainIdHex,
          chainName: network.name,
          nativeCurrency: network.currency,
          rpcUrls: [network.rpc],
          blockExplorerUrls: [network.explorer],
        }],
      });
      return true;
    }
    throw e;
  }
};

/**
 * Switch to Arbitrum (primary network for BonzAI)
 */
export const switchToArbitrum = () => switchNetwork('arbitrum');

// ═══════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

const handleAccountsChanged = async (accounts) => {
  if (!accounts || accounts.length === 0) {
    disconnectWallet();
  } else if (accounts[0] !== state.walletAddress) {
    state.walletAddress = accounts[0];
    await fetchAllBalances();
  }
};

const handleChainChanged = async (chainIdHex) => {
  state.currentChainId = parseInt(chainIdHex, 16);
  // Refresh balances when chain changes
  await fetchAllBalances();
};

const handleDisconnect = () => {
  disconnectWallet();
};

const setupEventListeners = () => {
  if (!window.ethereum) return;
  window.ethereum.on('accountsChanged', handleAccountsChanged);
  window.ethereum.on('chainChanged', handleChainChanged);
  window.ethereum.on('disconnect', handleDisconnect);
};

const removeEventListeners = () => {
  if (!window.ethereum) return;
  window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
  window.ethereum.removeListener('chainChanged', handleChainChanged);
  window.ethereum.removeListener('disconnect', handleDisconnect);
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get truncated wallet address for display
 */
export const truncatedAddress = computed(() => {
  if (!state.walletAddress) return '';
  return `${state.walletAddress.slice(0, 6)}...${state.walletAddress.slice(-4)}`;
});

/**
 * Check if currently on Arbitrum
 */
export const isOnArbitrum = computed(() => {
  return state.currentChainId === CONFIG.networks.arbitrum.chainId;
});

/**
 * Get current network name
 */
export const currentNetworkName = computed(() => {
  for (const [key, network] of Object.entries(CONFIG.networks)) {
    if (network.chainId === state.currentChainId) {
      return network.name;
    }
  }
  return 'Unknown Network';
});

/**
 * Get browser provider for signing transactions
 */
export const getSigner = async () => {
  if (!browserProvider) await initBrowserProvider();
  return browserProvider.getSigner();
};

/**
 * Get RPC provider for a specific chain
 */
export const getProvider = (chain = 'arbitrum') => {
  if (!rpcProviders[chain]) initRpcProviders();
  return rpcProviders[chain];
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const web3Service = {
  state: readonly(state),
  
  // Connection
  connectWallet,
  disconnectWallet,
  
  // Balances
  fetchAllBalances,
  
  // Networks
  switchNetwork,
  switchToArbitrum,
  
  // Computed
  truncatedAddress,
  isOnArbitrum,
  currentNetworkName,
  
  // Providers
  getSigner,
  getProvider,
  
  // Config reference
  CONFIG,
};

export default web3Service;
