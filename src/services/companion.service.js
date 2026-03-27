/**
 * BonzAI Companion NFT Service
 *
 * Manages companion NFTs on Base (ERC-721 + ERC-8004 Identity Registry).
 * Flat 0.25 ETH mint price, 10K supply cap, no rarity tiers.
 */

import { ethers } from 'ethers';
import { reactive } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';
import { luksoService } from './lukso.service.js';
import { agentWalletService } from './agentWallet.service.js';
import { walletProviderService } from './walletProvider.service.js';
import { coinbaseAgentWalletService } from './coinbaseAgentWallet.service.js';
import * as skillOwnershipService from './skillOwnership.service.js';
import { flagshipSkills } from '../skills/flagship.js';

const BONZAI_TOKEN_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

// ═══════════════════════════════════════════════════════════════════════════
// ABIs
// ═══════════════════════════════════════════════════════════════════════════

// BonzaiCompanions ABI (Base — ERC-8004 + flat ETH mint)
const COMPANION_BASE_ABI = [
  // View functions
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getCompanion(uint256 tokenId) view returns (tuple(address creator, uint256 createdAt, bytes32 personalityHash, uint96 spendingProfile, uint8 gender, bool isVerified))',
  'function canUseCompanion(address user, uint256 tokenId) view returns (bool)',
  'function getCreatorCompanions(address creator) view returns (uint256[])',
  'function getOwnerCompanions(address owner) view returns (uint256[])',
  'function mintPrice() view returns (uint256)',
  'function getSpendingProfile(uint256 tokenId) view returns (uint8[12])',

  // ERC-8004 View functions
  'function getAgentURI(uint256 agentId) view returns (string)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)',
  'function getAgentIdentity(uint256 agentId) view returns (string uri, address wallet, address owner)',

  // Write functions
  'function mintCompanion(string agentURI, bytes32 personalityHash, uint96 spendingProfile, uint8 gender, address agentWallet) payable returns (uint256)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'function setAgentWallet(uint256 agentId, address newWallet)',
  'function unsetAgentWallet(uint256 agentId)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)',
  'function setMetadataBatch(uint256 agentId, string[] metadataKeys, bytes[] metadataValues)',
  'function setPersonalityHash(uint256 tokenId, bytes32 newHash)',
  'function setSpendingProfile(uint256 tokenId, uint96 newProfile)',
  'function verifyCompanion(uint256 tokenId)',

  // Events
  'event CompanionMinted(uint256 indexed tokenId, address indexed creator, uint8 gender, uint96 indexed spendingProfile, string metadataURI)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)',
  'event AgentWalletSet(uint256 indexed agentId, address indexed newWallet, address indexed setBy)',
  'event AgentWalletUnset(uint256 indexed agentId, address indexed previousWallet)',
  'event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)',
];

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// Gender enum matching contract
export const Gender = {
  Neutral: 0,
  Female: 1,
  Male: 2,
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = reactive({
  isLoading: false,
  error: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// OASF v0.8.0 Taxonomy — Skills & Domains
// ═══════════════════════════════════════════════════════════════════════════

// Static skills for all BonzAI companions
export const OASF_SKILLS = [
  { id: 10201, name: 'Text Completion' },
  { id: 10204, name: 'Dialogue Generation' },
  { id: 10207, name: 'Story Generation' },
  { id: 206,   name: 'Image Generation' },
  { id: 70102, name: 'Text to Image' },
  { id: 70103, name: 'Text to Video' },
  { id: 70201, name: 'Text to Speech' },
  { id: 70105, name: 'Visual Question Answering' },
];

// Spending category → OASF domain mapping
export const SPENDING_TO_DOMAIN = {
  education:     { id: 6,    name: 'Education' },
  entertainment: { id: 1302, name: 'Content Creation' },
  fashion:       { id: 20,   name: 'Retail and E-commerce' },
  finance:       { id: 202,  name: 'Finance' },
  food:          { id: 1502, name: 'Food and Beverage' },
  healthcare:    { id: 9,    name: 'Healthcare' },
  housing:       { id: 14,   name: 'Real Estate' },
  beauty:        { id: 2001, name: 'Customer Experience' },
  reading:       { id: 601,  name: 'E-Learning' },
  social:        { id: 2403, name: 'Digital Marketing' },
  travel:        { id: 1506, name: 'Travel Services' },
  sports:        { id: 22,   name: 'Sports and Fitness' },
};

const DOMAIN_THRESHOLD = 5;

/**
 * Compute OASF domains from a companion's spending habits.
 * Includes any category scoring >= DOMAIN_THRESHOLD, plus Blockchain always.
 */
export function computeOASFDomains(spendingHabits = {}) {
  const domains = [{ id: 109, name: 'Blockchain' }];
  for (const [category, mapping] of Object.entries(SPENDING_TO_DOMAIN)) {
    if ((spendingHabits[category] || 0) >= DOMAIN_THRESHOLD) {
      domains.push(mapping);
    }
  }
  return domains;
}

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK SUPPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get available networks for companion minting
 */
function getAvailableNetworks() {
  return [
    {
      id: 'base',
      name: 'Base',
      chainId: 8453,
      standard: 'ERC-8004',
      currency: 'ETH',
      mintPrice: '0.25',
      contractAddress: CONFIG.companionNFT_BASE?.contractAddress,
      available: !!CONFIG.companionNFT_BASE?.contractAddress,
      x402Support: true,
      agentWalletProvider: 'local',
      description: 'Trustless Agent NFT — 0.25 ETH flat',
      features: ['Self-custody agent wallet', 'Spending profile on-chain', 'Native x402'],
    },
  ];
}

/**
 * Check if LUKSO Universal Profile extension is available (for UP attachment)
 */
function isLuksoAvailable() {
  return luksoService.isUPExtensionAvailable();
}

/**
 * Mint companion on Base (primary network).
 * @param {Object} params - Minting parameters
 * @param {string} network - Must be 'base'
 */
async function mintCompanionMultiNetwork(params, network = 'base') {
  if (network !== 'base') {
    throw new Error(`Unsupported network: ${network}. Companion minting is Base-only.`);
  }
  console.log('[CompanionService] Minting on Base with local agent wallet...');
  return await mintCompanionBase(params);
}

// ═══════════════════════════════════════════════════════════════════════════
// MINTING — BASE (Primary: 0.25 ETH flat)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pack 12 spending categories (values 1-10) into a uint96.
 * Categories: education, entertainment, fashion, finance, food, healthcare,
 *             housing, beauty, reading, social, travel, sports
 */
function packSpendingProfile(habits) {
  const cats = ['education', 'entertainment', 'fashion', 'finance', 'food', 'healthcare',
                'housing', 'beauty', 'reading', 'social', 'travel', 'sports'];
  let packed = 0n;
  cats.forEach((cat, i) => {
    packed |= BigInt(Math.min(Math.max(habits[cat] || 0, 0), 15)) << BigInt(i * 4);
  });
  return packed;
}

/**
 * Mint companion on Base with local self-custody agent wallet.
 * Flat 0.25 ETH mint price.
 */
async function mintCompanionBase(params) {
  try {
    state.isLoading = true;

    const config = CONFIG.companionNFT_BASE;
    const chainId = 8453;

    if (!config?.contractAddress) {
      throw new Error('BonzaiCompanions contract not deployed on Base yet');
    }

    // Generate spending profile if not provided
    const spendingHabits = params.spendingHabits || coinbaseAgentWalletService.generateSpendingProfile(params);

    // Create agent wallet for this companion (Privy server wallet or local deterministic)
    const companionId = params.companionId || `companion-${Date.now()}`;
    console.log('[CompanionService] Creating agent wallet for companion:', companionId);

    const agentWallet = await walletProviderService.createAgentWallet(companionId, {
      firstName: params.firstName, lastName: params.lastName,
    });
    console.log('[CompanionService] Agent wallet created:', agentWallet.address);

    // Ensure wallet is on Base network
    const currentChainId = web3Service.state.currentChainId;
    if (currentChainId !== chainId) {
      console.log('[CompanionService] Switching to Base...');
      await web3Service.switchNetwork('base');
    }

    // Get signer
    const provider = await web3Service.getProvider();
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();

    // Build ERC-8004 registration with spending profile (OASF v0.8.0)
    const domains = computeOASFDomains(spendingHabits);
    const agentUri = params.metadataURI;

    // Get contract instance
    const contract = new ethers.Contract(config.contractAddress, COMPANION_BASE_ABI, signer);

    // Get mint price from contract (flat price, no discounts)
    let ethMintPrice;
    try {
      ethMintPrice = await contract.mintPrice();
    } catch {
      ethMintPrice = ethers.parseEther(config.mintPrice || "0.25");
    }

    const ethBalance = await provider.getBalance(userAddress);
    if (ethBalance < ethMintPrice) {
      throw new Error(`Insufficient ETH on Base. Need ${ethers.formatEther(ethMintPrice)} ETH`);
    }

    // Hash personality
    const personalityBytes = typeof params.personalityHash === 'string' && !params.personalityHash.startsWith('0x')
      ? ethers.keccak256(ethers.toUtf8Bytes(params.personalityHash))
      : params.personalityHash || ethers.ZeroHash;

    // Pack spending profile into uint96
    const spendingProfile = packSpendingProfile(spendingHabits);

    // Mint with flat ETH payment
    console.log(`[CompanionService] Minting BonzaiCompanion on Base for ${ethers.formatEther(ethMintPrice)} ETH...`);
    const tx = await contract.mintCompanion(
      agentUri,
      personalityBytes,
      spendingProfile,
      params.gender || 0,
      agentWallet.address,
      { value: ethMintPrice }
    );

    console.log('[CompanionService] Transaction sent:', tx.hash);
    const receipt = await tx.wait();

    // Find token ID from event
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'CompanionMinted' || parsed?.name === 'Registered') {
          tokenId = parsed.args.tokenId?.toString() || parsed.args.agentId?.toString();
          if (tokenId) break;
        }
      } catch { /* skip non-matching logs */ }
    }

    console.log('[CompanionService] Base companion minted! Token ID:', tokenId);

    // Set ERC-8004 OASF agent traits via setMetadataBatch (single transaction)
    if (tokenId) {
      try {
        const traitKeys = ['oasf_skills', 'oasf_domains', 'x402_support', 'oasf_version'];
        const traitValues = [
          ethers.toUtf8Bytes(OASF_SKILLS.map(s => s.id).join(',')),
          ethers.toUtf8Bytes(domains.map(d => d.id).join(',')),
          ethers.toUtf8Bytes('true'),
          ethers.toUtf8Bytes('0.8'),
        ];
        const metaTx = await contract.setMetadataBatch(tokenId, traitKeys, traitValues);
        await metaTx.wait();
        console.log('[CompanionService] ERC-8004 OASF agent traits set (batch)');
      } catch (e) {
        console.warn('[CompanionService] Failed to set agent traits (non-fatal):', e.message);
      }
    }

    return {
      success: true,
      tokenId,
      txHash: receipt.hash,
      network: 'base',
      standard: 'ERC-8004',
      agentWallet: agentWallet.address,
      agentWalletProvider: 'local',
      x402Support: true,
      spendingHabits,
    };
  } catch (e) {
    console.error('[CompanionService] Base mint failed:', e);
    state.error = e.message;
    return {
      success: false,
      error: e.message,
    };
  } finally {
    state.isLoading = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MINTING — ETHEREUM/ARBITRUM (ERC-8004, BONZAI token payment)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// METADATA BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build ERC-8004 agent registration file with spending profile (OASF v0.8.0).
 * This JSON is uploaded to IPFS (Pinata) as the agentURI.
 */
function buildERC8004RegistrationWithSpending(params, spendingHabits = {}) {
  const firstName = params.firstName || '';
  const familyName = params.familyName || '';
  const fullName = params.name || `${firstName} ${familyName}`.trim();
  const description = params.description || `${fullName} - A BonzAI companion`;
  const shortBio = params.shortBio || '';

  const domains = computeOASFDomains(spendingHabits);

  const genderLabel = params.gender === 1 ? 'female' : params.gender === 2 ? 'male' : 'neutral';

  // Build rich attributes for OpenSea trait display
  const attributes = [
    { trait_type: 'Gender', value: genderLabel },
    { trait_type: 'Age', value: params.age != null ? params.age : 25 },
    { trait_type: 'Style', value: params.style || 'openness' },
  ];

  // Add spending categories as numeric traits (OpenSea shows bar charts)
  const spendingCategories = [
    'education', 'entertainment', 'fashion', 'finance', 'food', 'healthcare',
    'housing', 'beauty', 'reading', 'social', 'travel', 'sports',
  ];
  for (const cat of spendingCategories) {
    if (spendingHabits[cat] != null) {
      attributes.push({
        trait_type: cat.charAt(0).toUpperCase() + cat.slice(1),
        value: spendingHabits[cat],
        max_value: 10,
        display_type: 'number',
      });
    }
  }

  // Add OASF domains as trait badges
  for (const domain of domains) {
    attributes.push({ trait_type: 'Domain', value: domain.name });
  }

  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: fullName,
    description,
    short_bio: shortBio,
    image: params.imageUri || '',
    external_url: 'https://bonzai.sh',
    version: '1.0.0',
    author: 'BonzAI',
    license: 'MIT',
    services: [
      {
        name: 'OASF',
        version: '0.8',
        skills: [...OASF_SKILLS],
        domains,
      },
      {
        name: 'libp2p',
        endpoint: 'bonzai-inference-network',
        version: '1.0.0',
      },
    ],
    x402Support: true,
    active: true,
    supportedTrust: ['reputation', 'validation'],
    attributes,
    bonzai: {
      firstName,
      familyName,
      shortBio,
      personality: params.personality || '',
      appearance: params.appearance || '',
      background: params.background || '',
      voiceStyle: params.voiceStyle || '',
      firstMessage: params.firstMessage || '',
      spendingHabits,
    },
  };
}

/**
 * Build ERC-8004 agent registration file (no spending profile).
 */
function buildERC8004Registration(params) {
  return buildERC8004RegistrationWithSpending(params, {});
}

/**
 * Default image asset path for bare/pre-reveal companion mints.
 * Resolved at runtime via import.meta.glob in the renderer.
 */
const BARE_COMPANION_DEFAULT_IMAGE = 'companions/bonzai_companions.webp';

/**
 * Build minimal ERC-8004 registration JSON for a bare (pre-reveal) companion mint.
 * Sets `bonzai.status = 'pending_setup'` so the app detects it as unfinalized.
 *
 * @param {Object} opts
 * @param {string} opts.imageUri - IPFS URI for the default companion image
 * @param {number} [opts.gender=0] - 0=neutral, 1=female, 2=male
 * @param {Object} [opts.spendingHabits={}] - Optional initial spending profile
 * @returns {Object} ERC-8004 registration JSON ready for IPFS upload
 */
function buildBareRegistration({ imageUri, gender = 0, spendingHabits = {} } = {}) {
  const genderLabel = gender === 1 ? 'female' : gender === 2 ? 'male' : 'neutral';

  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'BonzAI Companion — Pending Setup',
    description: 'A BonzAI companion awaiting personalization. Finalize to reveal your unique AI agent.',
    image: imageUri || '',
    external_url: 'https://bonzai.sh',
    version: '1.0.0',
    author: 'BonzAI',
    license: 'MIT',
    services: [],
    x402Support: false,
    active: false,
    supportedTrust: [],
    attributes: [
      { trait_type: 'Gender', value: genderLabel },
      { trait_type: 'Status', value: 'Pending Setup' },
    ],
    bonzai: {
      status: 'pending_setup',
      firstName: '',
      familyName: '',
      shortBio: '',
      personality: '',
      appearance: '',
      background: '',
      voiceStyle: '',
      firstMessage: '',
      spendingHabits,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT WALLET QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get agent wallet for a minted companion
 */
async function getAgentWallet(tokenId, network = 'base') {
  const config = CONFIG.companionNFT_BASE;
  const abi = COMPANION_BASE_ABI;

  if (!config?.contractAddress) {
    throw new Error(`Contract not configured for ${network}`);
  }

  const provider = await web3Service.getProvider();
  const contract = new ethers.Contract(config.contractAddress, abi, provider);
  return await contract.getAgentWallet(tokenId);
}

/**
 * Get full agent identity info
 */
async function getAgentIdentity(tokenId, network = 'base') {
  const config = CONFIG.companionNFT_BASE;
  const abi = COMPANION_BASE_ABI;

  if (!config?.contractAddress) {
    throw new Error(`Contract not configured for ${network}`);
  }

  const provider = await web3Service.getProvider();
  const contract = new ethers.Contract(config.contractAddress, abi, provider);
  const [uri, wallet, owner] = await contract.getAgentIdentity(tokenId);
  return { uri, wallet, owner };
}

/**
 * Update agent wallet for a companion
 */
async function updateAgentWallet(tokenId, newWallet, network = 'base') {
  const config = CONFIG.companionNFT_BASE;
  const abi = COMPANION_BASE_ABI;

  if (!config?.contractAddress) {
    throw new Error(`Contract not configured for ${network}`);
  }

  const provider = await web3Service.getProvider();
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(config.contractAddress, abi, signer);

  const currentWallet = await contract.getAgentWallet(tokenId);

  if (currentWallet === ethers.ZeroAddress) {
    const tx = await contract.setAgentWalletDirect(tokenId, newWallet);
    await tx.wait();
    return { success: true, method: 'direct' };
  }

  throw new Error('Agent wallet already set. Signature from current wallet required.');
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch metadata from IPFS (Pinata gateway)
 */
async function fetchMetadata(uri) {
  try {
    let url = uri;
    if (uri.startsWith('ipfs://')) {
      url = uri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
    } else if (uri.startsWith('ar://')) {
      url = uri.replace('ar://', 'https://gateway.irys.xyz/');
    }

    const response = await fetch(url);
    return await response.json();
  } catch (e) {
    console.error('[CompanionService] Failed to fetch metadata:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BARE COMPANION DETECTION & MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect whether metadata indicates an unfinalized "bare" companion.
 * Bare companions are minted externally with placeholder metadata.
 */
function isBareCompanion(metadata) {
  if (!metadata) return true;
  if (metadata.bonzai?.status === 'pending_setup') return true;
  if (metadata.active === false && (metadata.name || '').includes('Pending Setup')) return true;
  return false;
}

/**
 * Create a placeholder companion object for bare-minted NFTs.
 * Returns a companion shape with `isBare: true` and `needsSetup: true` flags.
 */
function mapBareCompanion(tokenId, onChainData) {
  let gender = 'neutral';
  if (onChainData?.gender === 1) gender = 'female';
  else if (onChainData?.gender === 2) gender = 'male';

  return {
    id: `nft_base_${tokenId}`,
    tokenId: Number(tokenId),
    name: `Companion #${tokenId}`,
    firstName: '',
    familyName: '',
    shortBio: '',
    personality: '',
    appearance: '',
    background: '',
    voiceStyle: '',
    firstMessage: '',
    spendingHabits: {},
    gender,
    age: 25,
    style: 'openness',
    image: null,
    defaultImage: 'companions/bonzai_companions.webp',
    isCustom: true,
    isNFT: true,
    isBare: true,
    needsSetup: true,
    network: 'base',
    standard: 'ERC-8004',
    agentWallet: onChainData?.agentWallet || null,
    creator: onChainData?.creator || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NFT LOADING — Fetch owned companions from chain + IPFS metadata
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve ipfs:// (and legacy ar://) URIs to HTTP gateway URLs.
 */
function resolveMediaUri(uri) {
  if (!uri) return null;
  if (uri.startsWith('ar://')) return uri.replace('ar://', 'https://gateway.irys.xyz/');
  if (uri.startsWith('ipfs://')) return uri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
  return uri; // Already HTTP
}

/**
 * Map IPFS metadata JSON + on-chain struct to the companion shape expected by RoleplayChat.
 */
function mapMetadataToCompanion(metadata, tokenId, onChainData) {
  const bonzai = metadata.bonzai || {};

  // Resolve gender from attributes array or on-chain enum
  let gender = 'neutral';
  if (onChainData?.gender === 1) gender = 'female';
  else if (onChainData?.gender === 2) gender = 'male';
  else {
    const genderAttr = (metadata.attributes || []).find(a => a.trait_type === 'Gender');
    if (genderAttr) gender = genderAttr.value;
  }

  // Resolve age from attributes
  const ageAttr = (metadata.attributes || []).find(a => a.trait_type === 'Age');
  const age = ageAttr?.value || 25;

  // Resolve style from attributes
  const styleAttr = (metadata.attributes || []).find(a => a.trait_type === 'Style');
  const style = styleAttr?.value || 'openness';

  // Build spending habits from bonzai section or attributes
  let spendingHabits = bonzai.spendingHabits || {};
  if (!spendingHabits || Object.keys(spendingHabits).length === 0) {
    const cats = ['education', 'entertainment', 'fashion', 'finance', 'food', 'healthcare',
                  'housing', 'beauty', 'reading', 'social', 'travel', 'sports'];
    for (const cat of cats) {
      const attr = (metadata.attributes || []).find(
        a => a.trait_type?.toLowerCase() === cat
      );
      if (attr) spendingHabits[cat] = attr.value;
    }
  }

  const firstName = bonzai.firstName || metadata.name?.split(' ')[0] || `Companion #${tokenId}`;
  const nameParts = metadata.name?.trim().split(/\s+/) || [];
  const familyName = bonzai.familyName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

  return {
    id: `nft_base_${tokenId}`,
    tokenId: Number(tokenId),
    name: metadata.name || `Companion #${tokenId}`,
    firstName,
    familyName,
    shortBio: bonzai.shortBio || metadata.short_bio || metadata.description || '',
    personality: bonzai.personality || '',
    appearance: bonzai.appearance || '',
    background: bonzai.background || '',
    voiceStyle: bonzai.voiceStyle || '',
    firstMessage: bonzai.firstMessage || '',
    spendingHabits,
    gender,
    age,
    style,
    image: resolveMediaUri(metadata.image) || null,
    isCustom: true,
    isNFT: true,
    network: 'base',
    standard: 'ERC-8004',
    agentWallet: onChainData?.agentWallet || null,
    creator: onChainData?.creator || null,
  };
}

/**
 * Load all companion NFTs owned by the given wallet address on Base.
 * Returns companion objects ready for RoleplayChat.
 */
async function loadOwnedCompanions(walletAddress) {
  const config = CONFIG.companionNFT_BASE;
  if (!config?.contractAddress) {
    return [];
  }

  try {
    const provider = await web3Service.getProvider('base');
    const contract = new ethers.Contract(config.contractAddress, COMPANION_BASE_ABI, provider);

    const tokenIds = await contract.getOwnerCompanions(walletAddress);
    if (!tokenIds || tokenIds.length === 0) return [];

    console.log(`[CompanionService] Found ${tokenIds.length} owned NFTs for ${walletAddress}`);

    const results = await Promise.allSettled(
      tokenIds.map(async (tokenId) => {
        const [companionData, agentUri, identity] = await Promise.all([
          contract.getCompanion(tokenId),
          contract.getAgentURI(tokenId),
          contract.getAgentIdentity(tokenId),
        ]);

        const metadata = await fetchMetadata(agentUri);
        const onChain = {
          creator: companionData.creator,
          gender: Number(companionData.gender),
          agentWallet: identity.wallet,
        };

        // Detect bare (unfinalized) companions
        if (!metadata || isBareCompanion(metadata)) {
          console.log(`[CompanionService] Token #${tokenId} is a bare companion (needs setup)`);
          return mapBareCompanion(tokenId, onChain);
        }

        return mapMetadataToCompanion(metadata, tokenId, onChain);
      })
    );

    const companions = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    console.log(`[CompanionService] Loaded ${companions.length} NFT companions`);
    return companions;
  } catch (e) {
    console.error('[CompanionService] Failed to load owned companions:', e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPANION FINALIZATION (Bare → Full)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Finalize a bare-minted companion with full metadata, image, and on-chain data.
 *
 * @param {number|string} tokenId - On-chain token ID
 * @param {Object} companionData - { firstName, familyName, shortBio, personality, appearance,
 *                                   background, voiceStyle, firstMessage, gender, age, style,
 *                                   imageBase64?, spendingHabits? }
 * @param {Object} options - { skipImageGeneration, skipAgentWallet, onProgress(stage, message, percent) }
 * @returns {Object} { success, tokenId, agentURI, agentWallet, txHashes }
 */
async function finalizeCompanion(tokenId, companionData, options = {}) {
  const { skipImageGeneration, skipAgentWallet, onProgress } = options;
  const progress = (stage, message, percent) => {
    if (onProgress) onProgress(stage, message, percent);
    console.log(`[CompanionService] Finalize #${tokenId}: [${stage}] ${message} (${percent}%)`);
  };

  try {
    const config = CONFIG.companionNFT_BASE;
    if (!config?.contractAddress) throw new Error('BonzaiCompanions contract not configured');

    // Step 1: Verify ownership
    progress('verify', 'Verifying NFT ownership...', 5);
    const provider = await web3Service.getProvider();
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    const contract = new ethers.Contract(config.contractAddress, COMPANION_BASE_ABI, signer);

    const owner = await contract.ownerOf(tokenId);
    if (owner.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error(`You do not own token #${tokenId}`);
    }

    const txHashes = [];

    // Step 2: Generate spending profile from personality
    progress('spending', 'Generating spending profile...', 10);
    const { generateSpendingProfile } = await import('../skills/flagship.js');
    const spendingHabits = companionData.spendingHabits || generateSpendingProfile(companionData);

    // Step 3: Generate image (or use provided)
    let imageIpfsUri = '';
    if (!skipImageGeneration) {
      progress('image', 'Generating companion portrait...', 20);
      const { generateCompanionPicture } = await import('../skills/flagship.js');
      const imageResult = await generateCompanionPicture(companionData);
      const imageBase64 = companionData.imageBase64 || imageResult?.base64 || imageResult?.image;

      if (imageBase64) {
        progress('upload_image', 'Uploading portrait to IPFS...', 35);
        const { irysService } = await import('./irys.service.js');
        const imageReceipt = await irysService.uploadBase64({
          base64Data: imageBase64,
          contentType: 'image/png',
          generation: { type: 'companion-portrait', tokenId: String(tokenId) },
        });
        imageIpfsUri = imageReceipt.url;
      }
    } else if (companionData.imageBase64) {
      progress('upload_image', 'Uploading provided image to IPFS...', 35);
      const { irysService } = await import('./irys.service.js');
      const imageReceipt = await irysService.uploadBase64({
        base64Data: companionData.imageBase64,
        contentType: 'image/png',
        generation: { type: 'companion-portrait', tokenId: String(tokenId) },
      });
      imageIpfsUri = imageReceipt.url;
    }

    // Step 4: Build ERC-8004 registration JSON
    progress('metadata', 'Building metadata...', 45);
    const registration = buildERC8004RegistrationWithSpending({
      ...companionData,
      name: `${companionData.firstName} ${companionData.familyName}`.trim(),
      description: companionData.shortBio,
      imageUri: imageIpfsUri,
    }, spendingHabits);

    // Step 5: Upload registration JSON to IPFS
    progress('upload_metadata', 'Uploading metadata to IPFS...', 55);
    const { irysService } = await import('./irys.service.js');
    const metadataReceipt = await irysService.uploadMetadata(registration, {
      type: 'companion-finalization',
      tokenId: String(tokenId),
    });
    const metadataUri = metadataReceipt.url;

    // Step 6: setAgentURI on-chain
    progress('set_uri', 'Setting agent URI on-chain...', 65);
    const uriTx = await contract.setAgentURI(tokenId, metadataUri);
    await uriTx.wait();
    txHashes.push(uriTx.hash);

    // Step 7: Generate + set agent wallet (if not already set)
    let agentWalletAddress = null;
    if (!skipAgentWallet) {
      const currentWallet = await contract.getAgentWallet(tokenId);
      if (currentWallet === ethers.ZeroAddress) {
        progress('agent_wallet', 'Creating agent wallet...', 72);
        const companionId = `companion-${tokenId}`;
        const agentWallet = await walletProviderService.createAgentWallet(companionId, {
          firstName: companionData.firstName, lastName: companionData.lastName,
        });
        agentWalletAddress = agentWallet.address;

        const walletTx = await contract.setAgentWallet(tokenId, agentWalletAddress);
        await walletTx.wait();
        txHashes.push(walletTx.hash);
      } else {
        agentWalletAddress = currentWallet;
      }
    }

    // Step 8: setSpendingProfile on-chain
    progress('spending_profile', 'Setting spending profile on-chain...', 80);
    const packedProfile = packSpendingProfile(spendingHabits);
    const spendTx = await contract.setSpendingProfile(tokenId, packedProfile);
    await spendTx.wait();
    txHashes.push(spendTx.hash);

    // Step 9: setPersonalityHash on-chain
    progress('personality', 'Setting personality hash on-chain...', 87);
    const personalityText = `${companionData.firstName}|${companionData.personality}|${companionData.appearance}|${companionData.background}`;
    const personalityHash = ethers.keccak256(ethers.toUtf8Bytes(personalityText));
    const hashTx = await contract.setPersonalityHash(tokenId, personalityHash);
    await hashTx.wait();
    txHashes.push(hashTx.hash);

    // Step 10: setMetadataBatch with OASF traits (non-fatal)
    progress('traits', 'Setting OASF agent traits...', 93);
    try {
      const domains = computeOASFDomains(spendingHabits);
      const traitKeys = ['oasf_skills', 'oasf_domains', 'x402_support', 'oasf_version'];
      const traitValues = [
        ethers.toUtf8Bytes(OASF_SKILLS.map(s => s.id).join(',')),
        ethers.toUtf8Bytes(domains.map(d => d.id).join(',')),
        ethers.toUtf8Bytes('true'),
        ethers.toUtf8Bytes('0.8'),
      ];
      const metaTx = await contract.setMetadataBatch(tokenId, traitKeys, traitValues);
      await metaTx.wait();
      txHashes.push(metaTx.hash);
    } catch (e) {
      console.warn('[CompanionService] setMetadataBatch failed (non-fatal):', e.message);
    }

    progress('done', 'Companion finalized!', 100);

    return {
      success: true,
      tokenId,
      agentURI: metadataUri,
      agentWallet: agentWalletAddress,
      spendingHabits,
      txHashes,
    };
  } catch (e) {
    console.error('[CompanionService] Finalization failed:', e);
    return {
      success: false,
      error: e.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SKILL OWNERSHIP
// ═══════════════════════════════════════════════════════════════════════════

async function getBonzaiTokenContract() {
  const network = 'arbitrum'; // BONZAI is on Arbitrum
  const provider = web3Service.getProvider(network);
  const tokenAddress = CONFIG.tokens.BONZAI[network];
  return new ethers.Contract(tokenAddress, BONZAI_TOKEN_ABI, provider);
}

async function calculateSkillOwnership(companion, skill) {
  if (!companion.agentWallet) {
    console.warn(`Companion ${companion.name} has no agent wallet, cannot calculate ownership.`);
    return 0;
  }

  const score = companion.spendingHabits[skill.category] || 0;
  if (score < 5) {
    return 0; // Not eligible
  }

  const tokenContract = await getBonzaiTokenContract();
  const [balance, totalSupply] = await Promise.all([
    tokenContract.balanceOf(companion.agentWallet),
    tokenContract.totalSupply(),
  ]);

  if (totalSupply === 0n) return 0;

  const holdingPercentage = (Number(balance) / Number(totalSupply)) * 100;
  const ownership = holdingPercentage * score;

  return ownership;
}

async function updateAllSkillOwnerships(companion) {
  console.log(`Updating skill ownerships for ${companion.name}...`);
  for (const skill of flagshipSkills) {
    const ownershipPercentage = await calculateSkillOwnership(companion, skill);
    if (ownershipPercentage > 0) {
      console.log(`Companion ${companion.name} now owns ${ownershipPercentage.toFixed(4)}% of skill ${skill.name}`);
    }
  }
}

/**
 * Get revenue data for a companion from the BonzaiSkillOwnership contract
 * @param {Object} companion - Companion object with agentWallet
 * @returns {Promise<{weekly: number, monthly: number}>} Revenue in ETH
 */
async function getCompanionRevenue(companion) {
  if (!companion?.agentWallet) return { weekly: 0, monthly: 0 };

  try {
    const { getUnclaimedRevenue } = await import('./skillOwnership.service.js');
    const unclaimedEth = await getUnclaimedRevenue(companion.agentWallet);
    const monthly = parseFloat(unclaimedEth) || 0;
    const weekly = monthly / 4; // Approximate weekly from unclaimed total
    return { weekly, monthly };
  } catch (err) {
    console.warn('[CompanionService] Failed to fetch companion revenue:', err.message);
    return { weekly: 0, monthly: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDALONE UP DEPLOYMENT (for companions already minted)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deploy a Universal Profile for an already-minted companion.
 * @param {string} companionId - The companion's identifier
 * @param {Object} companion - { name, description, imageUri }
 */
async function deployCompanionUP(companionId, companion) {
  // Ensure agent wallet exists
  let agentWallet = await walletProviderService.getAgentWalletCredentials(companionId);
  if (!agentWallet) {
    agentWallet = await walletProviderService.createAgentWallet(companionId);
  }

  return await luksoService.deployCompanionUniversalProfile({
    companionId,
    name: companion.name,
    description: companion.description || companion.shortBio || '',
    imageUri: companion.imageUri || companion.image || '',
    agentWalletAddress: agentWallet.address,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const companionService = {
  state,

  // Minting
  mintCompanionMultiNetwork,
  mintCompanionBase,

  // Metadata
  buildERC8004RegistrationWithSpending,
  buildERC8004Registration,
  packSpendingProfile,
  fetchMetadata,

  // Network
  getAvailableNetworks,
  isLuksoAvailable,

  // NFT Loading
  loadOwnedCompanions,
  resolveMediaUri,
  mapMetadataToCompanion,

  // Bare Companion Support
  isBareCompanion,
  mapBareCompanion,
  buildBareRegistration,
  BARE_COMPANION_DEFAULT_IMAGE,
  finalizeCompanion,

  // Agent Wallet
  getAgentWallet,
  getAgentIdentity,
  updateAgentWallet,
  agentWallet: agentWalletService,
  coinbaseAgentWallet: coinbaseAgentWalletService,

  // Spending Profile Generation
  generateSpendingProfile: coinbaseAgentWalletService.generateSpendingProfile,

  // Skill Ownership & Revenue
  calculateSkillOwnership,
  updateAllSkillOwnerships,
  getCompanionRevenue,

  // LUKSO
  lukso: luksoService,
  deployCompanionUP,
  deployCompanionUPCrossChain: luksoService.deployCompanionUPCrossChain,

  // OASF v0.8.0
  OASF_SKILLS,
  SPENDING_TO_DOMAIN,
  computeOASFDomains,

  // Constants
  Gender,
};

export default companionService;
