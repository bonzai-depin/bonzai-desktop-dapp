/**
 * LUKSO Service - Universal Profiles and LSP8 NFTs
 *
 * Handles Universal Profile connections and LSP8 minting on LUKSO
 */

import { ethers } from "ethers";
import { reactive, readonly } from "vue";
import { ERC725 } from "@erc725/erc725.js";
import { CONFIG } from "../config/web3.config.js";
import { getEip1193Provider, switchNetwork } from "./web3.service.js";
import { agentWalletService } from "./agentWallet.service.js";
import { walletProviderService } from "./walletProvider.service.js";

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
      rpc: "https://rpc.mainnet.lukso.network",
      rpcFallbacks: ["https://rpc.lukso.sigmacore.io", "https://rpc.lukso.gateway.fm"],
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

  // BonzAI Companion LSP8 contract (from web3.config.js)
  lsp8Companion: {
    mainnet: CONFIG.companionNFT_LUKSO?.contractAddress || null,
  },

  // Default network
  defaultNetwork: import.meta.env?.VITE_LUKSO_NETWORK || "mainnet",
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

// LSP8 Companion Contract ABI (for BonzaiCompanionLSP8)
const LSP8_COMPANION_ABI = [
  // Minting
  "function mintCompanion(bytes metadataValue, bytes32 personalityHash, bytes32 loraHash, uint8 rarity, uint8 gender) external payable returns (bytes32)",
  // View functions
  "function getCompanion(bytes32 tokenId) external view returns (tuple(address creator, uint256 createdAt, bytes32 personalityHash, bytes32 loraHash, uint8 rarity, uint8 gender, bool isVerified, bool isBuiltIn, uint256 totalChats, uint256 totalMessages))",
  "function canUseCompanion(address user, bytes32 tokenId) external view returns (bool)",
  "function tokenOwnerOf(bytes32 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function totalMinted() external view returns (uint256)",
  "function mintPrices(uint8 rarity) external view returns (uint256)",
  // Marketplace
  "function listCompanion(bytes32 tokenId, uint256 price) external",
  "function delistCompanion(bytes32 tokenId) external",
  "function purchaseCompanion(bytes32 tokenId) external payable",
  "function getListing(bytes32 tokenId) external view returns (tuple(bool isListed, uint256 price, address seller))",
  // Events
  "event CompanionMinted(bytes32 indexed tokenId, address indexed creator, uint8 rarity, uint8 gender, string metadataURI)",
  "event CompanionListed(bytes32 indexed tokenId, address indexed seller, uint256 price)",
  "event CompanionSold(bytes32 indexed tokenId, address indexed seller, address indexed buyer, uint256 price)",
];

// LSP4 Metadata schema for encoding
const LSP4MetadataSchema = [
  {
    name: "LSP4Metadata",
    key: "0x9afb95cacc9f95858ec44aa8c3b685511002e30ae54415823f406128b85b238e",
    keyType: "Singleton",
    valueType: "bytes",
    valueContent: "VerifiableURI",
  },
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
 * Get LUKSO provider — UP Extension preferred, AppKit fallback
 */
async function getProvider() {
  // Priority 1: UP Browser Extension
  if (typeof window !== "undefined" && window.lukso) {
    return window.lukso;
  }

  // Priority 2: AppKit provider (WalletConnect to LUKSO)
  const appKitProvider = getEip1193Provider();
  if (appKitProvider) {
    return appKitProvider;
  }

  throw new Error(
    "No LUKSO provider available. Connect a wallet via WalletConnect or install the Universal Profile Browser Extension."
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

    // If using AppKit (not UP extension) and not on LUKSO, switch chains
    const expectedChainId = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork].chainId;
    if (state.chainId !== expectedChainId) {
      // Try AppKit switchNetwork first (handles add-chain automatically)
      if (!window.lukso) {
        await switchNetwork('lukso');
      } else {
        await switchToLukso();
      }
      // Recreate provider after chain switch
      provider = new ethers.BrowserProvider(luksoProvider);
      signer = await provider.getSigner();
      const updatedNetwork = await provider.getNetwork();
      state.chainId = Number(updatedNetwork.chainId);
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
// APPKIT SYNC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bridge AppKit connection into luksoService internal state without re-requesting accounts.
 * Called by web3.service.js when user switches to LUKSO chain via Reown.
 */
export async function syncFromAppKit(appKitProvider, address) {
  luksoProvider = appKitProvider;
  provider = new ethers.BrowserProvider(appKitProvider);
  signer = await provider.getSigner();
  state.isConnected = true;
  state.address = address;
  state.universalProfile = address;
  state.chainId = 42;
  state.profileData = await fetchProfileData(address);
}

/**
 * Lazy signer getter — reuses existing signer or creates one from current provider.
 */
async function ensureSigner() {
  if (signer) return signer;
  if (!provider && luksoProvider) {
    provider = new ethers.BrowserProvider(luksoProvider);
  }
  if (provider) {
    signer = await provider.getSigner();
    return signer;
  }
  throw new Error("Not connected to LUKSO — no signer available");
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

    // Decode the VerifiableURI — scan for known URL prefix in the hex data.
    // Different profiles use different header sizes (some have a 32-byte hash,
    // some only a 4-byte method prefix), so we locate the URL by pattern.
    const hexData = data.slice(2); // strip "0x"
    const urlPrefixes = [
      '697066733a2f2f',     // ipfs://
      '68747470733a2f2f',   // https://
      '687474703a2f2f',     // http://
    ];

    let url = null;
    for (const prefix of urlPrefixes) {
      const idx = hexData.indexOf(prefix);
      if (idx !== -1) {
        url = ethers.toUtf8String('0x' + hexData.slice(idx));
        break;
      }
    }

    if (url) {
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
async function getLSP8Contract() {
  const s = await ensureSigner();

  const address = LUKSO_CONFIG.lsp8Collection[LUKSO_CONFIG.defaultNetwork];
  if (address === "0x0000000000000000000000000000000000000000") {
    throw new Error("LSP8 Collection not deployed yet. Please check VITE_LUKSO_LSP8_TESTNET or VITE_LUKSO_LSP8_MAINNET environment variables.");
  }

  return new ethers.Contract(address, LSP8_ABI, s);
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
  const contract = await getLSP8Contract();
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
  const contract = await getLSP8Contract();

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
  const contract = await getLSP8Contract();
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
  const contract = await getLSP8Contract();
  return contract.tokenOwnerOf(tokenId);
}

/**
 * Get user's token balance
 */
export async function getBalance(address = null) {
  const contract = await getLSP8Contract();
  const owner = address || state.address;
  const balance = await contract.balanceOf(owner);
  return Number(balance);
}

/**
 * Get collection total supply
 */
export async function getTotalSupply() {
  const contract = await getLSP8Contract();
  const supply = await contract.totalSupply();
  return Number(supply);
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL PROFILE DEPLOYMENT FOR COMPANIONS
// ═══════════════════════════════════════════════════════════════════════════

// LSP23 Factory ABI
const LSP23_ABI = [
  "function deployERC1167Proxies(tuple(address implementation, bytes initializationCalldata) primaryContractDeployment, tuple(address implementation, bytes initializationCalldata, bool addPrimaryContractAddress, bytes extraInitializationParams) secondaryContractDeployment, address postDeploymentModule, bytes postDeploymentModuleCalldata) payable returns (address, address)",
];

// LSP0 ERC725Account ABI (Universal Profile)
const LSP0_ABI = [
  "function setData(bytes32 dataKey, bytes dataValue) external",
  "function setDataBatch(bytes32[] dataKeys, bytes[] dataValues) external",
  "function getData(bytes32 dataKey) external view returns (bytes)",
  "function owner() external view returns (address)",
  "function execute(uint256 operationType, address target, uint256 value, bytes data) external payable returns (bytes)",
  "function supportsInterface(bytes4 interfaceId) external view returns (bool)",
];

// LSP3 Profile data key
const LSP3_PROFILE_KEY = "0x5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5";

// ERC725Y data keys for LSP6 permissions
const PERMISSIONS_PREFIX = "0x4b80742de2bf82acb3630000"; // AddressPermissions:Permissions:<address>
const ADDRESS_PERMISSIONS_ARRAY_KEY = "0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3";
const ADDRESS_PERMISSIONS_ARRAY_LENGTH_KEY = "0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3";
// LSP1 UniversalReceiverDelegate key
const LSP1_DELEGATE_KEY = "0x0cfc51aec37c55a4d0b1a65c6255c4bf2fbdf6277f3cc0730c45b828b6db8b47";

/**
 * Build the post-deployment calldata for LSP23.
 * Sets LSP3 profile, LSP1 delegate, and address permissions on the UP.
 */
function buildPostDeploymentCalldata(agentWalletAddress, companionName, companionDescription, companionImageUri) {
  const factoryConfig = CONFIG.luksoUPFactory;

  // Build LSP3 Profile JSON
  const lsp3Profile = {
    LSP3Profile: {
      name: companionName,
      description: companionDescription || `${companionName} - A BonzAI AI Companion`,
      tags: ["BonzAI", "AI Companion", "Agent"],
      links: [{ title: "BonzAI", url: "https://bonzai.sh" }],
      profileImage: companionImageUri ? [{
        width: 256,
        height: 256,
        url: companionImageUri,
        verification: { method: "keccak256(bytes)", data: ethers.ZeroHash },
      }] : [],
      backgroundImage: [],
    },
  };

  const profileBytes = ethers.toUtf8Bytes(JSON.stringify(lsp3Profile));

  // Build data keys and values for setDataBatch
  const dataKeys = [];
  const dataValues = [];

  // 1. LSP3 Profile
  dataKeys.push(LSP3_PROFILE_KEY);
  dataValues.push(profileBytes);

  // 2. LSP1 UniversalReceiverDelegate
  dataKeys.push(LSP1_DELEGATE_KEY);
  dataValues.push(ethers.zeroPadValue(factoryConfig.universalReceiverDelegate, 32));

  // 3. AddressPermissions[] array length = 1
  dataKeys.push(ADDRESS_PERMISSIONS_ARRAY_LENGTH_KEY);
  dataValues.push(ethers.zeroPadValue(ethers.toBeHex(1), 16));

  // 4. AddressPermissions[0] = agentWalletAddress
  const arrayIndexKey = ADDRESS_PERMISSIONS_ARRAY_KEY.slice(0, 34) +
    "00000000000000000000000000000000";
  dataKeys.push(arrayIndexKey);
  dataValues.push(agentWalletAddress);

  // 5. AddressPermissions:Permissions:<agentWallet> = agent permissions
  const permKey = PERMISSIONS_PREFIX + agentWalletAddress.slice(2).toLowerCase();
  dataKeys.push(permKey);
  dataValues.push(factoryConfig.agentPermissions);

  // Encode setDataBatch call
  const upInterface = new ethers.Interface(LSP0_ABI);
  return upInterface.encodeFunctionData("setDataBatch", [dataKeys, dataValues]);
}

/**
 * Deploy a Universal Profile for a companion via LSP23 factory.
 * Agent wallet EOA is set as LSP6 controller with CALL + TRANSFERVALUE + SETDATA + SIGN.
 *
 * @param {Object} params
 * @param {string} params.companionId - Unique companion identifier
 * @param {string} params.name - Companion name
 * @param {string} params.description - Companion description
 * @param {string} params.imageUri - Companion image URI
 * @param {string} params.agentWalletAddress - Agent wallet EOA address
 * @returns {Promise<Object>} { upAddress, keyManagerAddress, salt, deploymentCalldata }
 */
export async function deployCompanionUniversalProfile(params) {
  const { companionId, name, description, imageUri, agentWalletAddress } = params;
  const factoryConfig = CONFIG.luksoUPFactory;

  if (!agentWalletAddress) {
    throw new Error("Agent wallet address is required for UP deployment");
  }

  console.log("[LUKSO] Deploying UP via LSP23 for companion:", name);

  // Deterministic salt from companion ID
  const salt = ethers.keccak256(
    ethers.toUtf8Bytes("bonzai-companion-" + companionId)
  );

  // Get a signer: prefer agent wallet for self-deployment, fall back to user signer
  let deploymentSigner;
  try {
    deploymentSigner = await walletProviderService.getAgentWalletSigner(companionId, 42);
  } catch {
    deploymentSigner = await ensureSigner();
  }

  // Build post-deployment calldata
  const postDeployCalldata = buildPostDeploymentCalldata(
    agentWalletAddress, name, description, imageUri
  );

  // UP init: initialize(address) with postDeploymentModule as initial owner
  const upInitCalldata = "0xc4d66de8" + ethers.AbiCoder.defaultAbiCoder()
    .encode(["address"], [factoryConfig.postDeploymentModule]).slice(2);

  // KeyManager init: initialize(address) — addPrimaryContractAddress fills UP address
  const kmInitCalldata = "0xc4d66de8";

  // Primary: UP proxy
  const primaryDeployment = {
    implementation: factoryConfig.upImplementation,
    initializationCalldata: upInitCalldata,
  };

  // Secondary: KeyManager proxy
  const secondaryDeployment = {
    implementation: factoryConfig.keyManagerImplementation,
    initializationCalldata: kmInitCalldata,
    addPrimaryContractAddress: true,
    extraInitializationParams: "0x",
  };

  const factory = new ethers.Contract(
    factoryConfig.lsp23FactoryAddress,
    LSP23_ABI,
    deploymentSigner
  );

  // Static call first to predict addresses
  const [predictedUP, predictedKM] = await factory.deployERC1167Proxies.staticCall(
    primaryDeployment,
    secondaryDeployment,
    factoryConfig.postDeploymentModule,
    postDeployCalldata,
  );

  console.log("[LUKSO] Predicted UP:", predictedUP, "KM:", predictedKM);

  // Execute deployment
  const tx = await factory.deployERC1167Proxies(
    primaryDeployment,
    secondaryDeployment,
    factoryConfig.postDeploymentModule,
    postDeployCalldata,
  );

  console.log("[LUKSO] LSP23 deployment tx sent:", tx.hash);
  const receipt = await tx.wait();

  // Store deployment data for cross-chain replay
  const deploymentData = {
    upAddress: predictedUP,
    keyManagerAddress: predictedKM,
    deployedChains: [42],
    deploymentCalldata: tx.data,
    salt,
    companionId,
    agentWalletAddress,
    txHash: receipt.hash,
    createdAt: Date.now(),
  };

  await agentWalletService.storeCompanionUP(companionId, deploymentData);

  console.log("[LUKSO] Companion UP deployed at:", predictedUP);

  return deploymentData;
}

/**
 * Set LSP3 Profile metadata on a companion's UP.
 * setData can be called directly on UP (checks permissions internally).
 */
async function setCompanionProfileMetadata(upAddress, params) {
  const agentSigner = params.companionId
    ? await walletProviderService.getAgentWalletSigner(params.companionId, 42).catch(() => null)
    : null;
  const signerToUse = agentSigner || await ensureSigner();

  const upContract = new ethers.Contract(upAddress, LSP0_ABI, signerToUse);

  const lsp3Profile = {
    LSP3Profile: {
      name: params.name,
      description: params.description || `${params.name} - A BonzAI AI Companion`,
      tags: ["BonzAI", "AI Companion", "Agent"],
      links: [{ title: "BonzAI", url: "https://bonzai.sh" }],
      profileImage: params.imageUri ? [{
        width: 256, height: 256, url: params.imageUri,
        verification: { method: "keccak256(bytes)", data: ethers.ZeroHash },
      }] : [],
      backgroundImage: [],
    },
  };

  const profileBytes = ethers.toUtf8Bytes(JSON.stringify(lsp3Profile));
  const tx = await upContract.setData(LSP3_PROFILE_KEY, profileBytes);
  await tx.wait();

  console.log("[LUKSO] LSP3 Profile metadata set for companion UP");
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE VIA UP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a transaction via the companion's UP.
 * Controller (agent wallet EOA) calls UP.execute() directly.
 * The UP verifies permissions internally via LSP20.
 *
 * @param {string} companionId - Companion identifier
 * @param {string} target - Target contract address
 * @param {bigint|string|number} value - ETH/LYX value to send
 * @param {string} calldata - Encoded function call
 * @param {number} chainId - Chain ID (default: 42 LUKSO)
 * @returns {Promise<Object>} Transaction receipt
 */
export async function executeViaUP(companionId, target, value, calldata, chainId = 42) {
  const upData = await agentWalletService.getCompanionUP(companionId);
  if (!upData?.upAddress) throw new Error("Companion has no UP deployed");

  const agentSigner = await walletProviderService.getAgentWalletSigner(companionId, chainId);

  const up = new ethers.Contract(upData.upAddress, LSP0_ABI, agentSigner);

  // operation 0 = CALL
  const tx = await up.execute(0, target, value, calldata);
  return await tx.wait();
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN REPLAY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deploy the same companion UP on another chain by replaying LSP23 calldata.
 * Prerequisites: same LSP23 factory + implementations must be deployed on target chain.
 *
 * @param {string} companionId - Companion identifier
 * @param {number} targetChainId - Target chain ID (e.g., 8453 for Base, 1 for Ethereum)
 * @returns {Promise<Object>} Transaction receipt
 */
export async function deployCompanionUPCrossChain(companionId, targetChainId) {
  const upData = await agentWalletService.getCompanionUP(companionId);
  if (!upData?.deploymentCalldata) throw new Error("No deployment calldata stored");

  if (upData.deployedChains?.includes(targetChainId)) {
    throw new Error(`Companion UP already deployed on chain ${targetChainId}`);
  }

  const agentSigner = await walletProviderService.getAgentWalletSigner(companionId, targetChainId);

  // Replay same calldata to same factory address
  const tx = await agentSigner.sendTransaction({
    to: CONFIG.luksoUPFactory.lsp23FactoryAddress,
    data: upData.deploymentCalldata,
    value: 0n,
  });

  const receipt = await tx.wait();
  console.log(`[LUKSO] Cross-chain UP deployed on chain ${targetChainId}:`, receipt.hash);

  // Update stored data with new chain
  upData.deployedChains = [...(upData.deployedChains || [42]), targetChainId];
  await agentWalletService.storeCompanionUP(companionId, upData);

  // NOTE: Permissions are per-chain — agent wallet needs to be authorized on new chain separately
  return receipt;
}

/**
 * Mint companion as LSP8 AND optionally deploy a UP for it
 * This is the full LUKSO companion identity flow
 *
 * @param {Object} params - Minting parameters
 * @param {boolean} params.deployUP - Whether to deploy a UP for the companion
 */
export async function mintCompanionWithUP(params) {
  // First, mint the LSP8 token
  const mintResult = await mintCompanion(params);

  if (!mintResult.success) {
    return mintResult;
  }

  // Optionally deploy a UP for the companion
  if (params.deployUP) {
    try {
      const upResult = await deployCompanionUniversalProfile({
        name: params.name,
        description: params.description,
        imageUri: params.imageUri,
        attributes: {
          personality: params.personality,
          style: params.style,
          gender: params.gender,
        },
      });

      return {
        ...mintResult,
        universalProfile: upResult.upAddress,
        upController: upResult.controller,
        upTxHash: upResult.txHash,
      };
    } catch (upError) {
      console.warn("[LUKSO] UP deployment failed, but LSP8 mint succeeded:", upError.message);
      return {
        ...mintResult,
        upDeploymentError: upError.message,
      };
    }
  }

  return mintResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// LSP8 COMPANION MINTING (BonzaiCompanionLSP8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if Universal Profile Extension is available
 */
export function isUPExtensionAvailable() {
  return typeof window !== "undefined" && window.lukso !== undefined;
}

/**
 * Get companion contract instance
 */
async function getCompanionContract() {
  const s = await ensureSigner();

  const address = LUKSO_CONFIG.lsp8Companion.mainnet || CONFIG.companionNFT_LUKSO?.contractAddress;
  if (!address) {
    throw new Error("LSP8 Companion contract not deployed yet");
  }

  return new ethers.Contract(address, LSP8_COMPANION_ABI, s);
}

/**
 * Build LSP4 metadata JSON for a companion
 */
export function buildLSP4Metadata(companion) {
  const attributes = [];

  if (companion.style) {
    attributes.push({ key: "Style", value: companion.style, type: "string" });
  }
  if (companion.gender !== undefined) {
    const genderNames = ["Neutral", "Female", "Male"];
    attributes.push({
      key: "Gender",
      value: genderNames[companion.gender] || "Neutral",
      type: "string",
    });
  }
  if (companion.age) {
    attributes.push({ key: "Age", value: companion.age, type: "number" });
  }
  if (companion.rarity !== undefined) {
    const rarityNames = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
    attributes.push({
      key: "Rarity",
      value: rarityNames[companion.rarity] || "Common",
      type: "string",
    });
  }
  if (companion.personality) {
    attributes.push({
      key: "Personality",
      value: companion.personality.substring(0, 100),
      type: "string",
    });
  }

  const metadata = {
    LSP4Metadata: {
      name: companion.name || "BonzAI Companion",
      description:
        companion.description ||
        `An AI companion created on BonzAI. ${companion.personality || ""}`.trim(),
      links: [
        { title: "BonzAI", url: "https://bonzai.sh" },
        { title: "Documentation", url: "https://docs.bonzai.sh" },
      ],
      icon: [],
      images: [],
      assets: [],
      attributes: attributes,
    },
  };

  if (companion.imageUri) {
    metadata.LSP4Metadata.icon = [
      {
        width: 256,
        height: 256,
        url: companion.imageUri,
        verification: {
          method: "keccak256(bytes)",
          data: "0x0000000000000000000000000000000000000000000000000000000000000000",
        },
      },
    ];
    metadata.LSP4Metadata.images = [
      [
        {
          width: 1024,
          height: 1024,
          url: companion.imageUri,
          verification: {
            method: "keccak256(bytes)",
            data: "0x0000000000000000000000000000000000000000000000000000000000000000",
          },
        },
      ],
    ];
  }

  return metadata;
}

/**
 * Encode LSP4 metadata using ERC725.js
 */
export function encodeCompanionMetadata(companion, metadataUri) {
  const metadata = buildLSP4Metadata(companion);
  const erc725 = new ERC725(LSP4MetadataSchema);

  const encodedData = erc725.encodeData([
    {
      keyName: "LSP4Metadata",
      value: {
        json: metadata,
        url: metadataUri,
      },
    },
  ]);

  return encodedData.values[0];
}

/**
 * Convert gender string to enum value
 */
export function genderToInt(gender) {
  const genderMap = { neutral: 0, female: 1, male: 2, nonbinary: 0, other: 0 };
  return genderMap[gender?.toLowerCase()] ?? 0;
}

/**
 * Convert rarity string to enum value
 */
export function rarityToInt(rarity) {
  const rarityMap = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
  return rarityMap[rarity?.toLowerCase()] ?? 0;
}

/**
 * Get mint price for a rarity level
 */
export async function getCompanionMintPrice(rarity = 0) {
  const contractAddress = LUKSO_CONFIG.lsp8Companion.mainnet || CONFIG.companionNFT_LUKSO?.contractAddress;
  if (!contractAddress) {
    // Return default price from config
    return ethers.parseEther(CONFIG.companionNFT_LUKSO?.mintPrice || "0.1");
  }

  const network = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork];
  const rpcProvider = new ethers.JsonRpcProvider(network.rpc);
  const contract = new ethers.Contract(contractAddress, LSP8_COMPANION_ABI, rpcProvider);

  return await contract.mintPrices(rarity);
}

/**
 * Mint a companion as LSP8 NFT on LUKSO
 */
export async function mintCompanion(params) {
  if (!state.isConnected || !signer) {
    throw new Error("Not connected to Universal Profile");
  }

  const contract = await getCompanionContract();

  // Encode metadata
  const metadataValue = encodeCompanionMetadata(params, params.metadataUri);

  // Generate personality hash
  const personalityHash = ethers.keccak256(
    ethers.toUtf8Bytes(params.personality || params.name || "")
  );

  // LoRA hash (optional)
  const loraHash = params.loraHash || ethers.ZeroHash;

  // Convert enums
  const rarity = typeof params.rarity === "string" ? rarityToInt(params.rarity) : (params.rarity || 0);
  const gender = typeof params.gender === "string" ? genderToInt(params.gender) : (params.gender || 0);

  // Get mint price
  const mintPrice = await getCompanionMintPrice(rarity);

  console.log("[LUKSO] Minting companion with params:", {
    metadataLength: metadataValue.length,
    personalityHash,
    rarity,
    gender,
    mintPrice: ethers.formatEther(mintPrice),
  });

  // Execute mint transaction
  const tx = await contract.mintCompanion(
    metadataValue,
    personalityHash,
    loraHash,
    rarity,
    gender,
    { value: mintPrice }
  );

  console.log("[LUKSO] Mint transaction sent:", tx.hash);

  const receipt = await tx.wait();

  // Extract tokenId from event
  let tokenId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({
        topics: log.topics,
        data: log.data,
      });
      if (parsed && parsed.name === "CompanionMinted") {
        tokenId = parsed.args.tokenId;
        break;
      }
    } catch {
      // Skip logs that don't match
    }
  }

  console.log("[LUKSO] Companion minted! TokenId:", tokenId);

  return {
    success: true,
    tokenId: tokenId ? tokenId.toString() : null,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    network: "lukso",
    explorerUrl: `${LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork].explorer}/tx/${receipt.hash}`,
  };
}

/**
 * Get companion data by tokenId
 */
export async function getCompanionData(tokenId) {
  const contractAddress = LUKSO_CONFIG.lsp8Companion.mainnet || CONFIG.companionNFT_LUKSO?.contractAddress;
  if (!contractAddress) {
    throw new Error("LUKSO companion contract not configured");
  }

  const network = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork];
  const rpcProvider = provider || new ethers.JsonRpcProvider(network.rpc);

  const contract = new ethers.Contract(contractAddress, LSP8_COMPANION_ABI, rpcProvider);

  const bytes32TokenId =
    typeof tokenId === "string" && !tokenId.startsWith("0x")
      ? ethers.zeroPadValue(ethers.toBeHex(BigInt(tokenId)), 32)
      : tokenId;

  const data = await contract.getCompanion(bytes32TokenId);

  return {
    creator: data.creator,
    createdAt: Number(data.createdAt),
    personalityHash: data.personalityHash,
    loraHash: data.loraHash,
    rarity: Number(data.rarity),
    gender: Number(data.gender),
    isVerified: data.isVerified,
    isBuiltIn: data.isBuiltIn,
    totalChats: Number(data.totalChats),
    totalMessages: Number(data.totalMessages),
  };
}

/**
 * Check if user can use a companion
 */
export async function canUseCompanion(userAddress, tokenId) {
  const contractAddress = LUKSO_CONFIG.lsp8Companion.mainnet || CONFIG.companionNFT_LUKSO?.contractAddress;
  if (!contractAddress) return false;

  const network = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork];
  const rpcProvider = provider || new ethers.JsonRpcProvider(network.rpc);

  const contract = new ethers.Contract(contractAddress, LSP8_COMPANION_ABI, rpcProvider);

  const bytes32TokenId =
    typeof tokenId === "string" && !tokenId.startsWith("0x")
      ? ethers.zeroPadValue(ethers.toBeHex(BigInt(tokenId)), 32)
      : tokenId;

  return await contract.canUseCompanion(userAddress, bytes32TokenId);
}

/**
 * List companion for sale
 */
export async function listCompanionForSale(tokenId, priceInLYX) {
  if (!state.isConnected || !signer) {
    throw new Error("Not connected to Universal Profile");
  }

  const contract = await getCompanionContract();

  const bytes32TokenId =
    typeof tokenId === "string" && !tokenId.startsWith("0x")
      ? ethers.zeroPadValue(ethers.toBeHex(BigInt(tokenId)), 32)
      : tokenId;

  const priceWei = ethers.parseEther(priceInLYX.toString());

  const tx = await contract.listCompanion(bytes32TokenId, priceWei);
  const receipt = await tx.wait();

  return { success: true, txHash: receipt.hash };
}

/**
 * Purchase a listed companion
 */
export async function purchaseCompanion(tokenId) {
  if (!state.isConnected || !signer) {
    throw new Error("Not connected to Universal Profile");
  }

  const contract = await getCompanionContract();

  const bytes32TokenId =
    typeof tokenId === "string" && !tokenId.startsWith("0x")
      ? ethers.zeroPadValue(ethers.toBeHex(BigInt(tokenId)), 32)
      : tokenId;

  const listing = await contract.getListing(bytes32TokenId);
  if (!listing.isListed) {
    throw new Error("Companion is not listed for sale");
  }

  const tx = await contract.purchaseCompanion(bytes32TokenId, { value: listing.price });
  const receipt = await tx.wait();

  return { success: true, txHash: receipt.hash };
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
  syncFromAppKit,
  ensureSigner,
  isUPExtensionAvailable,

  // Universal Profile
  fetchProfileData,
  isUniversalProfile,

  // Universal Profile Deployment for Companions (LSP23)
  deployCompanionUniversalProfile,
  setCompanionProfileMetadata,
  mintCompanionWithUP,
  executeViaUP,
  deployCompanionUPCrossChain,

  // LSP8 Content Minting
  generateTokenId,
  getMintFee,
  mint,
  getProvenance,
  getTokenOwner,
  getBalance,
  getTotalSupply,

  // LSP8 Companion Minting
  buildLSP4Metadata,
  encodeCompanionMetadata,
  genderToInt,
  rarityToInt,
  getCompanionMintPrice,
  mintCompanion,
  getCompanionData,
  canUseCompanion,
  listCompanionForSale,
  purchaseCompanion,

  // Config
  config: LUKSO_CONFIG,
};

export default luksoService;
