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
import { authVault } from "./authVault.service.js";
import { luksoService } from "./lukso.service.js";
import { registerWeb3Service } from "./walletProvider.service.js";

// Reown AppKit - official WalletConnect integration
import { createAppKit } from "@reown/appkit/vue";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { mainnet, arbitrum, base, lukso } from "@reown/appkit/networks";


// Universal Profile custom wallet for LUKSO network
const UP_CUSTOM_WALLET = {
  id: 'universal-profiles',
  name: 'Universal Profile',
  homepage: 'https://universaleverything.io',
  image_url: 'https://wallet.universalprofile.cloud/assets/images/up-logo.png',
  mobile_link: 'io.universaleverything.universalprofiles://',
  desktop_link: '',
  webapp_link: 'https://universaleverything.io',
  app_store: 'https://apps.apple.com/app/universal-profiles/id6702018631',
  play_store: 'https://play.google.com/store/apps/details?id=io.universaleverything.universalprofiles',
};

// Standard wallet IDs shown when NOT on LUKSO
const DEFAULT_WALLET_IDS = [
  'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
  'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa', // Coinbase Wallet
  '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
  '18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1', // Rabby Wallet
];

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

  // Auth provider: which login method was used
  authProvider: null, // 'reown' | 'privy' | null

  // Universal Profile (LUKSO)
  isUniversalProfile: false,
  universalProfileData: null, // { name, description, avatar, tags, links }

  // Authentication (JWT)
  isAuthenticated: false,
  authLevel: null,
  authLevelValue: 0,

  // Balances (aggregated across chains)
  balances: {
    ethereum: 0,
    arbitrum: 0,
    base: 0,
    total: 0,
  },

  // Loading states
  isLoadingBalances: false,
  lastBalanceCheck: null,

  // Error handling
  error: null,
});

// Register state reference for walletProvider (breaks circular import)
registerWeb3Service({ state });

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════════════════════

let browserProvider = null;
const rpcProviders = {};

let eip1193Provider = null; // injected or WalletConnect provider
let appKit = null; // AppKit instance (singleton)

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
    const [ethProvider, arbProvider, baseProvider] = await Promise.all([
      createProviderWithFallback("ethereum"),
      createProviderWithFallback("arbitrum"),
      createProviderWithFallback("base"),
    ]);
    rpcProviders.ethereum = ethProvider;
    rpcProviders.arbitrum = arbProvider;
    rpcProviders.base = baseProvider;
  } catch (e) {
    console.error("[Web3] Failed to initialize RPC providers:", e);
    // Fallback to simple initialization
    rpcProviders.ethereum = new ethers.JsonRpcProvider(
      CONFIG.networks.ethereum.rpc
    );
    rpcProviders.arbitrum = new ethers.JsonRpcProvider(
      CONFIG.networks.arbitrum.rpc
    );
    rpcProviders.base = new ethers.JsonRpcProvider(
      CONFIG.networks.base.rpc
    );
  }
};

/**
 * Initialize AppKit (singleton — createAppKit ignores all subsequent calls).
 */
const initAppKit = () => {
  if (appKit) return appKit;

  const projectId = (
    CONFIG?.walletconnect?.projectId ||
    import.meta?.env?.VITE_WALLETCONNECT_PROJECT_ID ||
    ""
  ).trim();

  if (!projectId) {
    throw new Error(
      "WalletConnect is not configured. Set CONFIG.walletconnect.projectId or VITE_WALLETCONNECT_PROJECT_ID."
    );
  }

  // Detect Electron production mode
  const isElectronProduction = typeof window !== "undefined" &&
    (window.location.protocol === "file:" ||
     window.location.protocol === "app:" ||
     window.location.protocol.startsWith("file"));

  const metadataUrl = isElectronProduction
    ? "https://bonzai.sh"
    : `${window.location.protocol}//${window.location.host}`;

  const metadata = {
    name: 'BonzAI',
    description: 'BonzAI Desktop DApp',
    url: metadataUrl,
    icons: ['https://bonzai.sh/icon.png'],
  };

  // Clear cached recent wallets to prevent stale/broken entries in the modal
  try { localStorage.removeItem('@appkit/recent_wallets'); } catch { /* noop */ }
  try { localStorage.removeItem('@appkit/recent_wallet'); } catch { /* noop */ }

  appKit = createAppKit({
    adapters: [new EthersAdapter()],
    networks: [base, mainnet, arbitrum, lukso],
    defaultNetwork: base,
    metadata,
    projectId,
    features: {
      analytics: false,
    },
    customWallets: [UP_CUSTOM_WALLET],
    includeWalletIds: DEFAULT_WALLET_IDS,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#10b981',
    },
  });

  return appKit;
};

/**
 * Ensure there is an EIP-1193 wallet provider available.
 * Uses Reown AppKit for WalletConnect integration.
 *
 * @param {Object} opts
 * @param {boolean} opts.auto - if true, try to reuse existing session without showing modal
 */
export const ensureWalletProvider = async (opts = {}) => {
  const { auto = false } = opts;

  if (typeof window === "undefined") {
    throw new Error("Wallet provider requires a browser-like environment.");
  }

  // Initialize AppKit (singleton)
  const modal = initAppKit();

  // Check if already connected via AppKit
  const walletProvider = modal.getWalletProvider();
  if (walletProvider) {
    eip1193Provider = walletProvider;
    state.walletType = 'walletconnect';
    return eip1193Provider;
  }

  // If auto mode, don't show modal - just return null
  if (auto) {
    return null;
  }

  // Open the modal and wait for connection
  try {
    await modal.open();

    // Wait for connection with timeout (poll for provider)
    const connected = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Connection timeout'));
      }, 120000); // 2 minute timeout

      let modalWasOpen = false;
      const interval = setInterval(() => {
        const provider = modal.getWalletProvider();
        if (provider) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(provider);
          return;
        }
        // Track if modal has been open
        if (modal.isOpen()) {
          modalWasOpen = true;
        }
        // Check if modal was closed without connecting (only after it was open)
        if (modalWasOpen && !modal.isOpen()) {
          clearInterval(interval);
          clearTimeout(timeout);
          reject(new Error('Wallet connection cancelled'));
        }
      }, 300);
    });

    eip1193Provider = connected;
    state.walletType = 'walletconnect';

    // Close the modal now that we have the provider
    await modal.close();

    return eip1193Provider;
  } catch (err) {
    console.warn('[Web3] Connection failed/cancelled:', err.message);
    throw err;
  }
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
    state.authProvider = 'reown';

    // Get current chain
    const network = await browserProvider.getNetwork();
    state.currentChainId = Number(network.chainId);

    // Fetch balances across chains
    await fetchAllBalances();

    // Set up event listeners
    setupEventListeners();

    // Check if the connected address is a Universal Profile on LUKSO.
    // Uses its own LUKSO RPC, so works regardless of the current chain.
    await checkIsUniversalProfile(state.walletAddress);

    // ═══════════════════════════════════════════════════════════════════════
    // AUTHENTICATION FLOW
    //
    // Priority order (minimize signatures):
    // 1. Try token refresh (HttpOnly cookie) - no signature
    // 2. Try vault session restore - no signature if vault already unlocked
    // 3. Full auth with ONE signature (auth + vault key derivation combined)
    // ═══════════════════════════════════════════════════════════════════════

    // First, always try token refresh (no user interaction)
    try {
      const refreshResult = await authService.refreshToken();
      state.isAuthenticated = true;
      state.authLevel = refreshResult.level;
      state.authLevelValue = refreshResult.level_value;
      console.log(`[Web3] Token refreshed, level ${refreshResult.level}`);
    } catch (refreshError) {
      // Refresh failed - need signature-based authentication
      console.log("[Web3] Token refresh failed, requesting signature...");

      try {
        const signer = await browserProvider.getSigner();

        // Single signature flow: authenticate AND initialize vault from same signature
        const authResult = await authService.authenticateWithVault(signer);

        state.isAuthenticated = true;
        state.authLevel = authResult.level;
        state.authLevelValue = authResult.levelValue;

        console.log(`[Web3] Authenticated with level ${authResult.level}`);
      } catch (authError) {
        // User rejected signature or auth failed
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
  try {
    // Privy-specific logout
    if (state.authProvider === 'privy') {
      try {
        const { privyService } = await import('./privy.service.js');
        await privyService.logout();
      } catch (e) {
        console.warn('[Web3] Privy logout warning:', e.message);
      }
    }

    // Disconnect via AppKit (Reown)
    if (appKit && state.authProvider !== 'privy') {
      try {
        await appKit.disconnect();
      } catch (e) {
        console.warn('[Web3] AppKit disconnect warning:', e.message);
      }
    }

    // Lock the vault (clears in-memory secrets)
    try {
      authVault.lockVault();
    } catch (e) {
      console.warn('[Web3] Vault lock warning:', e.message);
    }

    // Logout from auth service
    authService.logout();
  } finally {
    state.isConnected = false;
    state.walletAddress = null;
    state.currentChainId = null;
    state.walletType = null;
    state.authProvider = null;
    state.isUniversalProfile = false;
    state.universalProfileData = null;
    state.isAuthenticated = false;
    state.authLevel = null;
    state.authLevelValue = 0;
    state.balances = { ethereum: 0, arbitrum: 0, total: 0 };
    state.lastBalanceCheck = null;
    state.error = null;

    removeEventListeners();

    // Clear browser provider
    browserProvider = null;
    eip1193Provider = null;
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
    // Fetch balances in parallel across all chains
    const [ethBalance, arbBalance, baseBalance] = await Promise.all([
      fetchBalanceOnChain("ethereum"),
      fetchBalanceOnChain("arbitrum"),
      fetchBalanceOnChain("base"),
    ]);

    state.balances.ethereum = ethBalance;
    state.balances.arbitrum = arbBalance;
    state.balances.base = baseBalance;
    state.balances.total = ethBalance + arbBalance + baseBalance;
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
    } else {
      throw e;
    }
  }

  // Update state directly — WalletConnect providers may not fire chainChanged
  state.currentChainId = network.chainId;
  if (eip1193Provider) {
    browserProvider = new ethers.BrowserProvider(eip1193Provider);
  }

  return true;
};

/**
 * Switch to Arbitrum
 */
export const switchToArbitrum = () => switchNetwork("arbitrum");

/**
 * Switch to Base (primary network for payments)
 */
export const switchToBase = () => switchNetwork("base");

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

/**
 * Check if the connected address is a Universal Profile on LUKSO.
 * If so, fetch LSP3 data and sync luksoService.
 */
const checkIsUniversalProfile = async (address) => {
  try {
    console.log("[Web3] Checking if address is UP on LUKSO:", address);
    const luksoRpc = new ethers.JsonRpcProvider(CONFIG.networks.lukso.rpc);
    const code = await luksoRpc.getCode(address);
    if (code === "0x") {
      // No contract at this address on LUKSO — not a UP
      console.log("[Web3] No contract at address on LUKSO, not a UP");
      state.isUniversalProfile = false;
      state.universalProfileData = null;
      return;
    }
    const contract = new ethers.Contract(
      address,
      ["function supportsInterface(bytes4 interfaceId) view returns (bool)"],
      luksoRpc
    );
    // LSP0 ERC725Account interface ID
    const isUP = await contract.supportsInterface("0x24871b3d");
    console.log("[Web3] supportsInterface result:", isUP);

    state.isUniversalProfile = isUP;

    if (isUP) {
      console.log("[Web3] Address is a Universal Profile on LUKSO");
      state.universalProfileData = await luksoService.fetchProfileData(address);
      console.log("[Web3] UP profile data:", state.universalProfileData);
      // Sync luksoService with AppKit connection
      if (eip1193Provider) {
        await luksoService.syncFromAppKit(eip1193Provider, address);
      }
    } else {
      state.universalProfileData = null;
    }
  } catch (err) {
    console.warn("[Web3] UP detection failed:", err.message);
    state.isUniversalProfile = false;
    state.universalProfileData = null;
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

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Connect via Privy (email/social login).
 * The Privy embedded wallet becomes the owner wallet, providing an EIP-1193
 * provider that plugs into the same ethers BrowserProvider path as Reown.
 *
 * @param {Object} options
 * @param {'email'|'google'|'apple'} options.method - Login method
 * @param {string} [options.email] - Required if method === 'email'
 * @param {string} [options.otpCode] - OTP code for email verification
 * @returns {Promise<{success: boolean, address?: string, needsOtp?: boolean, error?: string}>}
 */
export const connectWithPrivy = async (options = {}) => {
  if (state.isConnecting) return { success: false, error: "Connection in progress" };

  state.isConnecting = true;
  state._connectStartTime = Date.now();
  state.error = null;

  try {
    // No desktop-side Privy auth — the wallet window handles everything.
    // Just wait for the wallet address to arrive from the wallet window.
    const walletAddress = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Wallet setup timed out. Open the wallet window and sign in.')), 60000);

      // Check if address was already cached from a previous session
      window.electronAPI?.wallet?.getAddress?.().then(cached => {
        if (cached) {
          clearTimeout(timeout);
          resolve(cached);
        }
      });

      // Listen for address from the wallet window
      const cleanup = window.electronAPI?.onWalletAddress?.((address) => {
        clearTimeout(timeout);
        if (cleanup) cleanup();
        resolve(address);
      });
    });

    // Create a provider that delegates signing to the wallet window
    const privyProvider = {
      request: async ({ method, params }) => {
        if (['eth_requestAccounts', 'eth_accounts'].includes(method)) return [walletAddress];
        if (method === 'eth_chainId') return '0x2105';
        if (method === 'wallet_switchEthereumChain') return null; // Always on Base
        if (['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign'].includes(method)) {
          return window.electronAPI.wallet.signRequest({ method, params });
        }
        const rpc = new ethers.JsonRpcProvider(CONFIG.networks?.base?.rpc || 'https://mainnet.base.org');
        return rpc.send(method, params || []);
      },
    };

    eip1193Provider = privyProvider;
    browserProvider = new ethers.BrowserProvider(eip1193Provider);

    state.walletAddress = walletAddress;
    state.isConnected = true;
    state.authProvider = 'privy';
    state.walletType = 'privy';

    // Initialize RPC providers for balance checks
    await initRpcProviders();

    // Get current chain
    try {
      const network = await browserProvider.getNetwork();
      state.currentChainId = Number(network.chainId);
    } catch {
      state.currentChainId = 8453; // Default to Base
    }

    // Fetch balances
    await fetchAllBalances();

    // Privy users are authenticated by default (Privy handles auth)
    state.isAuthenticated = true;
    state.authLevel = 'privy';
    state.authLevelValue = 0;

    console.log(`[Web3] Connected via Privy: ${state.walletAddress}`);

    return {
      success: true,
      address: state.walletAddress,
      chainId: state.currentChainId,
      totalBalance: state.balances.total,
      walletType: 'privy',
      isAuthenticated: true,
      authProvider: 'privy',
    };
  } catch (e) {
    state.error = e.message;
    console.error('[Web3] Privy connection failed:', e);
    return { success: false, error: e.message };
  } finally {
    state.isConnecting = false;
    state._connectStartTime = null;
  }
};

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
export const getProvider = async (chain = "base") => {
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
  connectWithPrivy,
  disconnectWallet,

  // Balances
  fetchAllBalances,

  // Networks
  switchNetwork,
  switchToArbitrum,
  switchToBase,

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

  // AppKit
  getAppKit: () => appKit,

  // Auth service reference
  authService,

  // Config reference
  CONFIG,
};

export default web3Service;
