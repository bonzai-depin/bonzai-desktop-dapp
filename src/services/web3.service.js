/**
 * BonzAI Web3 Service
 *
 * Handles wallet connection and multi-chain BONZAI balance aggregation
 * across Ethereum and Arbitrum networks.
 *
 * Patch highlights:
 * - Supports Electron by falling back to WalletConnect when window.ethereum is not injected
 * - Exposes ensureWalletProvider() + getEip1193Provider() for other modules (e.g., LVL∞ registry calls)
 * - Keeps the rest of your service API intact
 */

import { ethers } from "ethers";
import { reactive, readonly, computed } from "vue";
import { CONFIG } from "../config/web3.config.js";

// NOTE: install deps:
//   npm i @walletconnect/ethereum-provider ethers
import EthereumProvider from "@walletconnect/ethereum-provider";

// ═══════════════════════════════════════════════════════════════════════════
// ABI DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
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

  // Wallet type
  walletType: null, // 'injected' | 'walletconnect' | null

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

let eip1193Provider = null; // injected or WalletConnect provider
let wcProvider = null; // WalletConnect provider instance (if used)

/**
 * Initialize RPC providers for balance checking on multiple chains
 */
const initRpcProviders = () => {
  try {
    rpcProviders.ethereum = new ethers.JsonRpcProvider(
      CONFIG.networks.ethereum.rpc
    );
    rpcProviders.arbitrum = new ethers.JsonRpcProvider(
      CONFIG.networks.arbitrum.rpc
    );
  } catch (e) {
    console.error("[Web3] Failed to initialize RPC providers:", e);
  }
};

/**
 * Ensure there is an EIP-1193 wallet provider available.
 * - If window.ethereum exists -> use it (MetaMask in browsers)
 * - Else -> WalletConnect (recommended for Electron)
 *
 * @param {Object} opts
 * @param {boolean} opts.auto - if true, try to reuse existing WalletConnect session without showing QR
 */
export const ensureWalletProvider = async (opts = {}) => {
  const { auto = false } = opts;

  if (typeof window === "undefined") {
    throw new Error("Wallet provider requires a browser-like environment.");
  }

  // 1) Injected provider (MetaMask browser extension, etc.)
  if (window.ethereum) {
    eip1193Provider = window.ethereum;
    state.walletType = "injected";
    return eip1193Provider;
  }

  // 2) WalletConnect fallback
  const projectId = (
    CONFIG?.walletconnect?.projectId ||
    import.meta?.env?.VITE_WALLETCONNECT_PROJECT_ID ||
    ""
  ).trim();
  if (!projectId) {
    throw new Error(
      "No injected wallet found. WalletConnect is not configured. Set CONFIG.walletconnect.projectId or VITE_WALLETCONNECT_PROJECT_ID."
    );
  }

  const chains =
    CONFIG?.walletconnect?.chains && CONFIG.walletconnect.chains.length
      ? CONFIG.walletconnect.chains
      : [1]; // Ethereum mainnet

  // Create once
  if (!wcProvider) {
    wcProvider = await EthereumProvider.init({
      projectId,
      chains,
      showQrModal: !auto,
      optionalChains: CONFIG?.walletconnect?.optionalChains || [],
      metadata: {
        name: "BonzAI",
        description: "BonzAI Desktop DApp",
        url: "https://bonzai.ai",
        icons: ["https://bonzai.ai/icon.png"],
      },
      methods: [
        "eth_requestAccounts",
        "eth_accounts",
        "eth_chainId",
        "eth_sendTransaction",
        "personal_sign",
        "eth_signTypedData",
        "eth_signTypedData_v4",
        "wallet_switchEthereumChain",
        "wallet_addEthereumChain",
      ],
      events: ["accountsChanged", "chainChanged", "disconnect"],
    });
  } else {
    // Update QR modal behavior if caller toggles auto/interactive
    try {
      wcProvider.modal?.setTheme?.("dark");
    } catch {}
  }

  // Attempt silent reconnect first
  const accounts = await wcProvider
    .request({ method: "eth_accounts" })
    .catch(() => []);
  if ((!accounts || accounts.length === 0) && !auto) {
    await wcProvider.connect();
  }

  // Expose for codepaths that expect window.ethereum
  window.ethereum = wcProvider;

  eip1193Provider = wcProvider;
  state.walletType = "walletconnect";
  return eip1193Provider;
};

/**
 * Get current EIP-1193 provider (if any)
 */
export const getEip1193Provider = () => eip1193Provider;

/**
 * Initialize browser wallet provider (ethers BrowserProvider)
 */
const initBrowserProvider = async () => {
  if (!eip1193Provider) {
    // Try to discover without showing QR (auto)
    await ensureWalletProvider({ auto: true });
  }
  if (typeof window === "undefined" || !eip1193Provider) {
    throw new Error("No Web3 wallet detected. Please connect a wallet.");
  }
  browserProvider = new ethers.BrowserProvider(eip1193Provider);
  return browserProvider;
};

// ═══════════════════════════════════════════════════════════════════════════
// WALLET CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connect wallet and aggregate BONZAI balance across chains
 */
export const connectWallet = async () => {
  if (state.isConnecting)
    return { success: false, error: "Connection in progress" };

  state.isConnecting = true;
  state.error = null;

  try {
    // Ensure wallet provider is present (WalletConnect in Electron)
    await ensureWalletProvider({ auto: false });
    await initBrowserProvider();
    initRpcProviders();

    // Request account access
    const accounts = await eip1193Provider.request({
      method: "eth_requestAccounts",
    });

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found. Please unlock your wallet.");
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
      walletType: state.walletType,
    };
  } catch (e) {
    state.error = e.message;
    console.error("[Web3] Connection failed:", e);
    return { success: false, error: e.message };
  } finally {
    state.isConnecting = false;
  }
};

/**
 * Disconnect wallet
 */
export const disconnectWallet = async () => {
  try {
    // WalletConnect: explicitly disconnect session
    if (state.walletType === "walletconnect" && wcProvider?.disconnect) {
      await wcProvider.disconnect().catch(() => {});
    }
  } finally {
    state.isConnected = false;
    state.walletAddress = null;
    state.currentChainId = null;
    state.walletType = null;
    state.balances = { ethereum: 0, arbitrum: 0, total: 0 };
    state.lastBalanceCheck = null;
    state.error = null;

    removeEventListeners();

    // Clear providers - including wcProvider to force fresh instance on reconnect
    browserProvider = null;
    eip1193Provider = null;
    wcProvider = null;

    // Do not hard-delete window.ethereum; only clear if it was ours
    // (If in a browser with an injected provider, leave it intact)
  }
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
      fetchBalanceOnChain("ethereum"),
      fetchBalanceOnChain("arbitrum"),
    ]);

    state.balances.ethereum = ethBalance;
    state.balances.arbitrum = arbBalance;
    state.balances.total = ethBalance + arbBalance;
    state.lastBalanceCheck = Date.now();

    return state.balances;
  } catch (e) {
    console.error("[Web3] Failed to fetch balances:", e);
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

  if (!eip1193Provider) {
    await ensureWalletProvider({ auto: true });
  }

  try {
    await eip1193Provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainIdHex }],
    });
    return true;
  } catch (e) {
    // Chain not added, try to add it
    if (e.code === 4902) {
      await eip1193Provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: network.chainIdHex,
            chainName: network.name,
            nativeCurrency: network.currency,
            rpcUrls: [network.rpc],
            blockExplorerUrls: [network.explorer],
          },
        ],
      });
      return true;
    }
    throw e;
  }
};

/**
 * Switch to Arbitrum (primary network for BonzAI)
 */
export const switchToArbitrum = () => switchNetwork("arbitrum");

// ═══════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

const handleAccountsChanged = async (accounts) => {
  if (!accounts || accounts.length === 0) {
    await disconnectWallet();
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

const handleDisconnect = async () => {
  await disconnectWallet();
};

const setupEventListeners = () => {
  if (!eip1193Provider?.on) return;
  eip1193Provider.on("accountsChanged", handleAccountsChanged);
  eip1193Provider.on("chainChanged", handleChainChanged);
  eip1193Provider.on("disconnect", handleDisconnect);
};

const removeEventListeners = () => {
  if (!eip1193Provider?.removeListener) return;
  eip1193Provider.removeListener("accountsChanged", handleAccountsChanged);
  eip1193Provider.removeListener("chainChanged", handleChainChanged);
  eip1193Provider.removeListener("disconnect", handleDisconnect);
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get truncated wallet address for display
 */
export const truncatedAddress = computed(() => {
  if (!state.walletAddress) return "";
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
  return "Unknown Network";
});

/**
 * Get browser provider for signing transactions
 */
export const getSigner = async () => {
  if (!browserProvider) await initBrowserProvider();
  return browserProvider.getSigner();
};

/**
 * Get ethers BrowserProvider (read/write through connected wallet)
 */
export const getBrowserProvider = async () => {
  if (!browserProvider) await initBrowserProvider();
  return browserProvider;
};

/**
 * Get RPC provider for a specific chain
 */
export const getProvider = (chain = "arbitrum") => {
  if (!rpcProviders[chain]) initRpcProviders();
  return rpcProviders[chain];
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const web3Service = {
  state: readonly(state),

  // Connection
  ensureWalletProvider,
  getEip1193Provider,
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
  getBrowserProvider,
  getProvider,

  // Config reference
  CONFIG,
};

export default web3Service;
