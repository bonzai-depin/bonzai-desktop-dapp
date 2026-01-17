/**
 * LUKSO Service - Universal Profiles and LSP8 NFTs
 *
 * Handles Universal Profile connections and LSP8 minting on LUKSO
 */

import { ethers } from "ethers";
import { reactive, readonly } from "vue";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const LUKSO_CONFIG = {
  // Networks
  networks: {
    mainnet: {
      chainId: 42,
      chainIdHex: "0x2a",
      name: "LUKSO Mainnet",
      rpc: "https://rpc.lukso.gateway.fm",
      explorer: "https://explorer.lukso.network",
      currency: { name: "LYX", symbol: "LYX", decimals: 18 },
    },
    testnet: {
      chainId: 4201,
      chainIdHex: "0x1069",
      name: "LUKSO Testnet",
      rpc: "https://rpc.testnet.lukso.gateway.fm",
      explorer: "https://explorer.execution.testnet.lukso.network",
      currency: { name: "LYXt", symbol: "LYXt", decimals: 18 },
    },
  },

  // BonzAI LSP8 Collection contract
  // TODO: Update after deployment
  lsp8Collection: {
    mainnet: import.meta.env?.VITE_LUKSO_LSP8_MAINNET || "0x0000000000000000000000000000000000000000",
    testnet: import.meta.env?.VITE_LUKSO_LSP8_TESTNET || "0x0000000000000000000000000000000000000000",
  },

  // Default network
  defaultNetwork: import.meta.env?.VITE_LUKSO_NETWORK || "testnet",
};

// LSP8 ABI (minimal for minting)
const LSP8_ABI = [
  "function mint(address to, bytes32 tokenId, string calldata irysTransactionId, string calldata model, bytes calldata metadataURI, bool force, bytes calldata data) external payable",
  "function mintFee() view returns (uint256)",
  "function getProvenance(bytes32 tokenId) view returns (string irysTransactionId, address originalCreator, uint256 creationTimestamp)",
  "function tokenOwnerOf(bytes32 tokenId) view returns (address)",
  "function getDataForTokenId(bytes32 tokenId, bytes32 dataKey) view returns (bytes)",
  "function balanceOf(address tokenOwner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "event ContentMinted(bytes32 indexed tokenId, address indexed creator, string irysTransactionId, string model, uint256 timestamp)",
];

// ERC725 data keys
const LSP4_METADATA_KEY = "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e";

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  isConnected: false,
  address: null,
  universalProfile: null,
  profileData: null,
  chainId: null,
});

// Internal state (not exposed)
let provider = null;
let signer = null;
let luksoProvider = null;

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get LUKSO provider from Universal Profile Extension
 */
async function getProvider() {
  // Check for UP Browser Extension
  if (typeof window !== "undefined" && window.lukso) {
    return window.lukso;
  }

  throw new Error(
    "Universal Profile Browser Extension not found. " +
      "Please install from https://chromewebstore.google.com/detail/universal-profiles/abpickdkkbnbcoepogfhkhennhfhehfn"
  );
}

/**
 * Connect to LUKSO network
 */
export async function connect() {
  try {
    luksoProvider = await getProvider();

    // Request accounts
    const accounts = await luksoProvider.request({
      method: "eth_requestAccounts",
    });

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found");
    }

    // The returned address is the Universal Profile address
    const upAddress = accounts[0];

    // Create ethers provider
    provider = new ethers.BrowserProvider(luksoProvider);
    signer = await provider.getSigner();

    // Get network
    const network = await provider.getNetwork();
    state.chainId = Number(network.chainId);

    // Validate network
    const expectedChainId = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork].chainId;
    if (state.chainId !== expectedChainId) {
      await switchToLukso();
    }

    state.address = upAddress;
    state.universalProfile = upAddress;
    state.isConnected = true;

    // Fetch profile data
    state.profileData = await fetchProfileData(upAddress);

    // Setup listeners
    setupEventListeners(luksoProvider);

    console.log("[LUKSO] Connected to Universal Profile:", upAddress);

    return {
      address: upAddress,
      profile: state.profileData,
      chainId: state.chainId,
    };
  } catch (error) {
    console.error("[LUKSO] Connection failed:", error);
    throw error;
  }
}

/**
 * Switch wallet to LUKSO network
 */
export async function switchToLukso() {
  const network = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork];

  if (!luksoProvider) {
    luksoProvider = await getProvider();
  }

  try {
    await luksoProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainIdHex }],
    });
  } catch (switchError) {
    // Chain not added, add it
    if (switchError.code === 4902) {
      await luksoProvider.request({
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
      throw switchError;
    }
  }
}

/**
 * Disconnect from LUKSO
 */
export function disconnect() {
  state.isConnected = false;
  state.address = null;
  state.universalProfile = null;
  state.profileData = null;
  state.chainId = null;
  provider = null;
  signer = null;
  luksoProvider = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL PROFILE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch Universal Profile data using raw RPC
 * (Simplified version without erc725.js for initial implementation)
 */
export async function fetchProfileData(address) {
  const network = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork];

  try {
    // LSP3Profile data key
    const LSP3_PROFILE_KEY = "0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5";

    const rpcProvider = new ethers.JsonRpcProvider(network.rpc);

    // Call getData on the Universal Profile
    const upContract = new ethers.Contract(
      address,
      ["function getData(bytes32 dataKey) view returns (bytes)"],
      rpcProvider
    );

    const data = await upContract.getData(LSP3_PROFILE_KEY);

    if (!data || data === "0x") {
      return null;
    }

    // Decode the VerifiableURI
    // Format: 0x + hash function (4 bytes) + hash (32 bytes) + url
    if (data.length > 74) {
      const urlBytes = "0x" + data.slice(74);
      const url = ethers.toUtf8String(urlBytes);

      // Resolve IPFS URL
      let resolvedUrl = url;
      if (url.startsWith("ipfs://")) {
        resolvedUrl = url.replace("ipfs://", "https://api.universalprofile.cloud/ipfs/");
      }

      // Fetch profile JSON
      const response = await fetch(resolvedUrl);
      if (response.ok) {
        const profileJson = await response.json();
        return profileJson.LSP3Profile || profileJson;
      }
    }

    return null;
  } catch (error) {
    console.warn("[LUKSO] Failed to fetch profile:", error);
    return null;
  }
}

/**
 * Check if address is a Universal Profile
 */
export async function isUniversalProfile(address) {
  if (!provider) return false;

  try {
    const contract = new ethers.Contract(
      address,
      ["function supportsInterface(bytes4 interfaceId) view returns (bool)"],
      provider
    );
    // LSP0 ERC725Account interface ID
    return await contract.supportsInterface("0x63cb749b");
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LSP8 MINTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get BonzAI LSP8 Collection contract
 */
function getLSP8Contract() {
  if (!signer) throw new Error("Not connected to LUKSO");

  const address = LUKSO_CONFIG.lsp8Collection[LUKSO_CONFIG.defaultNetwork];
  if (address === "0x0000000000000000000000000000000000000000") {
    throw new Error("LSP8 Collection not deployed yet. Please check VITE_LUKSO_LSP8_TESTNET or VITE_LUKSO_LSP8_MAINNET environment variables.");
  }

  return new ethers.Contract(address, LSP8_ABI, signer);
}

/**
 * Generate deterministic tokenId from content
 */
export function generateTokenId({ prompt, model, timestamp, creator, contentHash }) {
  const packed = ethers.solidityPacked(
    ["string", "string", "uint256", "address", "bytes32"],
    [prompt, model, timestamp, creator, contentHash]
  );
  return ethers.keccak256(packed);
}

/**
 * Get current mint fee
 */
export async function getMintFee() {
  const contract = getLSP8Contract();
  const fee = await contract.mintFee();
  return {
    wei: fee,
    lyx: ethers.formatEther(fee),
  };
}

/**
 * Mint AI-generated content as LSP8 NFT
 *
 * @param {Object} params
 * @param {string} params.irysTransactionId - Arweave TX ID from Irys upload
 * @param {string} params.model - AI model used
 * @param {string} params.metadataUri - URI to LSP4Metadata JSON (ar://...)
 * @param {bytes32} params.tokenId - Content hash as tokenId
 * @param {address} params.to - Recipient (default: sender's UP)
 * @returns {Object} Transaction receipt and token info
 */
export async function mint({ irysTransactionId, model, metadataUri, tokenId, to = null }) {
  const contract = getLSP8Contract();

  // Get mint fee
  const mintFee = await contract.mintFee();

  // Recipient defaults to connected UP
  const recipient = to || state.universalProfile;

  // Encode metadata URI as bytes
  const metadataBytes = ethers.toUtf8Bytes(metadataUri);

  console.log("[LUKSO] Minting NFT...");
  console.log("[LUKSO] TokenId:", tokenId);
  console.log("[LUKSO] Irys TX:", irysTransactionId);
  console.log("[LUKSO] Recipient:", recipient);
  console.log("[LUKSO] Mint Fee:", ethers.formatEther(mintFee), "LYX");

  // Mint transaction
  const tx = await contract.mint(
    recipient,
    tokenId,
    irysTransactionId,
    model,
    metadataBytes,
    true, // force (allow minting to non-LSP1 receivers)
    "0x", // additional data
    { value: mintFee }
  );

  console.log("[LUKSO] Transaction sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("[LUKSO] Transaction confirmed in block:", receipt.blockNumber);

  // Parse ContentMinted event
  let mintTimestamp = Date.now();
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "ContentMinted") {
        mintTimestamp = Number(parsed.args.timestamp) * 1000; // Convert to ms
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  return {
    transactionHash: receipt.hash,
    tokenId,
    irysTransactionId,
    creator: state.address,
    recipient,
    timestamp: mintTimestamp,
    explorerUrl: `${LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork].explorer}/tx/${receipt.hash}`,
  };
}

/**
 * Get provenance data for a minted token
 */
export async function getProvenance(tokenId) {
  const contract = getLSP8Contract();
  const [irysTransactionId, originalCreator, creationTimestamp] = await contract.getProvenance(
    tokenId
  );

  return {
    irysTransactionId,
    originalCreator,
    creationTimestamp: Number(creationTimestamp),
  };
}

/**
 * Get token owner
 */
export async function getTokenOwner(tokenId) {
  const contract = getLSP8Contract();
  return contract.tokenOwnerOf(tokenId);
}

/**
 * Get user's token balance
 */
export async function getBalance(address = null) {
  const contract = getLSP8Contract();
  const owner = address || state.address;
  const balance = await contract.balanceOf(owner);
  return Number(balance);
}

/**
 * Get collection total supply
 */
export async function getTotalSupply() {
  const contract = getLSP8Contract();
  const supply = await contract.totalSupply();
  return Number(supply);
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

function setupEventListeners(luksoProvider) {
  luksoProvider.on("accountsChanged", async (accounts) => {
    if (accounts.length === 0) {
      disconnect();
    } else {
      state.address = accounts[0];
      state.universalProfile = accounts[0];
      state.profileData = await fetchProfileData(accounts[0]);
    }
  });

  luksoProvider.on("chainChanged", (chainId) => {
    state.chainId = parseInt(chainId, 16);
  });

  luksoProvider.on("disconnect", () => {
    disconnect();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const luksoService = {
  // State (readonly)
  state: readonly(state),

  // Connection
  connect,
  disconnect,
  switchToLukso,

  // Universal Profile
  fetchProfileData,
  isUniversalProfile,

  // LSP8
  generateTokenId,
  getMintFee,
  mint,
  getProvenance,
  getTokenOwner,
  getBalance,
  getTotalSupply,

  // Config
  config: LUKSO_CONFIG,
};

export default luksoService;
