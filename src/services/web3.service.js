/**
 * BonzAI Web3 Service
 *
 * Handles wallet connection, multi-chain BONZAI balance aggregation,
 * and JWT authentication after WalletConnect.
 *
 * Patch highlights:
 * - Supports Electron by falling back to WalletConnect when window.ethereum is not injected
 * - Exposes ensureWalletProvider() + getEip1193Provider() for other modules (e.g., LVL∞ registry calls)
 * - Integrates with auth.service.js for JWT-based authentication
 */

import { ethers } from "ethers";
import { reactive, readonly, computed } from "vue";
import { CONFIG } from "../config/web3.config.js";
import { authService } from "./auth.service.js";

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
  _connectStartTime: null, // For detecting stuck connection state
  walletAddress: null,
  currentChainId: null,

  // Wallet type
  walletType: null, // 'injected' | 'walletconnect' | null

  // Authentication (JWT)
  isAuthenticated: false,
  authLevel: null,
  authLevelValue: 0,

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
 * Create a provider that tries the primary RPC, then fallbacks
 */
const createProviderWithFallback = async (network) => {
  const config = CONFIG.networks[network];
  const allRpcs = [config.rpc, ...(config.rpcFallbacks || [])];

  for (const rpcUrl of allRpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      // Quick check to verify the RPC works
      await provider.getBlockNumber();
      console.log(`[Web3] Connected to ${network} via ${rpcUrl}`);
      return provider;
    } catch (e) {
      console.warn(`[Web3] RPC ${rpcUrl} failed: ${e.message}`);
    }
  }

  // If all fail, try the primary anyway (it might work later)
  console.error(`[Web3] All ${network} RPCs failed, using primary`);
  return new ethers.JsonRpcProvider(config.rpc);
};

/**
 * Initialize RPC providers for balance checking on multiple chains
 */
const initRpcProviders = async () => {
  try {
    // Try to connect with fallback support
    const [ethProvider, arbProvider] = await Promise.all([
      createProviderWithFallback("ethereum"),
      createProviderWithFallback("arbitrum"),
    ]);
    rpcProviders.ethereum = ethProvider;
    rpcProviders.arbitrum = arbProvider;
  } catch (e) {
    console.error("[Web3] Failed to initialize RPC providers:", e);
    // Fallback to simple initialization
    rpcProviders.ethereum = new ethers.JsonRpcProvider(
      CONFIG.networks.ethereum.rpc
    );
    rpcProviders.arbitrum = new ethers.JsonRpcProvider(
      CONFIG.networks.arbitrum.rpc
    );
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

  // Detect Electron production mode (file:// or app:// protocol)
  const isElectronProduction = typeof window !== "undefined" &&
    (window.location.protocol === "file:" ||
     window.location.protocol === "app:" ||
     window.location.protocol.startsWith("file"));

  // Use verified domain for production Electron (must be configured in WalletConnect Cloud)
  // In development (localhost), use localhost URL
  const metadataUrl = isElectronProduction
    ? "https://bonzai.sh"  // Must be verified in WalletConnect Cloud dashboard
    : `${window.location.protocol}//${window.location.host}`;

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
        url: metadataUrl,
        icons: ["https://bonzai.sh/icon.png"],
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
      // Disable provider ping to reduce connection issues in Electron
      disableProviderPing: true,
      // Required for Electron: skip origin verification at client level
      // Note: WalletConnect Cloud project must have origins configured
      qrModalOptions: {
        // Use dark theme for better visibility in Electron
        themeMode: "dark",
      },
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
    try {
      await wcProvider.connect();
    } catch (connectError) {
      // User cancelled or connection failed - reset the provider for next attempt
      console.warn('[Web3] WalletConnect connection failed/cancelled:', connectError.message);

      // Disconnect and reset the provider so next attempt creates a fresh instance
      try {
        await wcProvider.disconnect().catch(() => {});
      } catch {}
      wcProvider = null;
      eip1193Provider = null;

      throw new Error('Wallet connection cancelled');
    }
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
 * Connect wallet, aggregate BONZAI balance, and authenticate with server.
 *
 * This is a combined flow (Option A):
 * 1. WalletConnect modal (user selects wallet)
 * 2. Sign authentication message (user approves signature)
 * 3. Server issues JWT tokens
 */
export const connectWallet = async () => {
  // Reset connecting state if it's been stuck for more than 60 seconds
  if (state.isConnecting && state._connectStartTime && Date.now() - state._connectStartTime > 60000) {
    console.warn('[Web3] Connection was stuck, resetting state...');
    state.isConnecting = false;
  }

  if (state.isConnecting)
    return { success: false, error: "Connection in progress" };

  state.isConnecting = true;
  state._connectStartTime = Date.now();
  state.error = null;

  try {
    // Ensure wallet provider is present (WalletConnect in Electron)
    await ensureWalletProvider({ auto: false });
    await initBrowserProvider();
    await initRpcProviders();

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

    // Authenticate with server
    // First try to refresh existing token (avoids signature prompt on reconnect)
    try {
      const refreshResult = await authService.refreshToken();
      state.isAuthenticated = true;
      state.authLevel = refreshResult.level;
      state.authLevelValue = refreshResult.level_value;
      console.log(`[Web3] Token refreshed, level ${refreshResult.level}`);
    } catch (refreshError) {
      // Refresh failed - need fresh authentication (triggers sign message prompt)
      console.log("[Web3] Token refresh failed, requesting new signature...");
      try {
        const signer = await browserProvider.getSigner();
        const authResult = await authService.authenticate(signer);

        state.isAuthenticated = true;
        state.authLevel = authResult.level;
        state.authLevelValue = authResult.levelValue;

        console.log(`[Web3] Authenticated with level ${authResult.level}`);
      } catch (authError) {
        // User rejected signature or auth failed
        // Connection still valid, but not authenticated
        console.warn("[Web3] Authentication failed:", authError.message);
        state.isAuthenticated = false;
        state.authLevel = null;
        state.authLevelValue = 0;

        // If user rejected the signature, disconnect
        if (authError.message?.includes("rejected") || authError.message?.includes("denied")) {
          await disconnectWallet();
          return { success: false, error: "Authentication cancelled" };
        }
      }
    }

    // Register signer getter for automatic re-authentication
    authService.setSignerGetter(async () => {
      if (!browserProvider) return null;
      try {
        return await browserProvider.getSigner();
      } catch (e) {
        console.error("[Web3] Failed to get signer for re-auth:", e);
        return null;
      }
    });

    return {
      success: true,
      address: state.walletAddress,
      chainId: state.currentChainId,
      totalBalance: state.balances.total,
      walletType: state.walletType,
      isAuthenticated: state.isAuthenticated,
      authLevel: state.authLevel,
      authLevelValue: state.authLevelValue,
    };
  } catch (e) {
    state.error = e.message;
    console.error("[Web3] Connection failed:", e);
    return { success: false, error: e.message };
  } finally {
    state.isConnecting = false;
    state._connectStartTime = null;
  }
};

/**
 * Disconnect wallet and logout from auth service
 */
export const disconnectWallet = async () => {
  // Remember if we set window.ethereum (WalletConnect case)
  const weSetWindowEthereum = state.walletType === "walletconnect";

  try {
    // WalletConnect: explicitly disconnect session
    if (state.walletType === "walletconnect" && wcProvider?.disconnect) {
      await wcProvider.disconnect().catch(() => {});
    }

    // Logout from auth service
    authService.logout();
  } finally {
    state.isConnected = false;
    state.walletAddress = null;
    state.currentChainId = null;
    state.walletType = null;
    state.isAuthenticated = false;
    state.authLevel = null;
    state.authLevelValue = 0;
    state.balances = { ethereum: 0, arbitrum: 0, total: 0 };
    state.lastBalanceCheck = null;
    state.error = null;

    removeEventListeners();

    // Clear providers - including wcProvider to force fresh instance on reconnect
    browserProvider = null;
    eip1193Provider = null;
    wcProvider = null;

    // Clear window.ethereum if we set it (WalletConnect case)
    // This ensures ensureWalletProvider creates a fresh provider on reconnect
    if (weSetWindowEthereum && window.ethereum) {
      delete window.ethereum;
    }
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
    // Silently return 0 for CALL_EXCEPTION (contract doesn't exist on this chain)
    // Only log unexpected errors
    if (e?.code !== "CALL_EXCEPTION") {
      console.warn(`[Web3] Balance fetch failed on ${chain}:`, e?.message || e);
    }
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
  console.log(`[Web3] Chain changed to ${state.currentChainId}`);

  // Recreate browser provider for the new chain to ensure signer works correctly
  if (eip1193Provider) {
    browserProvider = new ethers.BrowserProvider(eip1193Provider);
    console.log('[Web3] Browser provider recreated for new chain');
  }

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
export const getProvider = async (chain = "arbitrum") => {
  if (!rpcProviders[chain]) await initRpcProviders();
  return rpcProviders[chain];
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION COMPUTED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user is authenticated
 */
export const isAuthenticated = computed(() => state.isAuthenticated);

/**
 * Get authentication level
 */
export const authLevel = computed(() => state.authLevel);

/**
 * Get authentication level value
 */
export const authLevelValue = computed(() => state.authLevelValue);

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
  isAuthenticated,
  authLevel,
  authLevelValue,

  // Providers
  getSigner,
  getBrowserProvider,
  getProvider,

  // Auth service reference
  authService,

  // Config reference
  CONFIG,
};

export default web3Service;
