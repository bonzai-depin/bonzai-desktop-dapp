/**
 * BonzAI Companion NFT Service
 *
 * Manages companion NFTs including:
 * - Minting new companions (costs BONZAI tokens based on rarity)
 * - Built-in companions (free, non-transferable)
 * - Marketplace listing and purchasing
 * - Access control verification
 */

import { ethers } from 'ethers';
import { reactive, computed } from 'vue';
import { CONFIG } from '../config/web3.config.js';
import { web3Service } from './web3.service.js';

// Contract ABI (key functions only)
const COMPANION_NFT_ABI = [
  // View functions
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getCompanion(uint256 tokenId) view returns (tuple(address creator, uint256 createdAt, bytes32 personalityHash, bytes32 loraHash, uint8 rarity, uint8 gender, bool isVerified, bool isBuiltIn, uint256 totalChats, uint256 totalMessages))',
  'function getListing(uint256 tokenId) view returns (tuple(bool isListed, uint256 price, address seller))',
  'function canUseCompanion(address user, uint256 tokenId) view returns (bool)',
  'function canUseBuiltIn(string builtInId) view returns (bool)',
  'function getBuiltInTokenId(string builtInId) view returns (uint256)',
  'function getBuiltInCompanionIds() view returns (string[])',
  'function getCreatorCompanions(address creator) view returns (uint256[])',
  'function mintPrices(uint8 rarity) view returns (uint256)',
  'function platformFeeBps() view returns (uint256)',
  'function royaltyInfo(uint256 tokenId, uint256 salePrice) view returns (address receiver, uint256 amount)',

  // Write functions
  'function mintCompanion(string metadataURI, bytes32 personalityHash, bytes32 loraHash, uint8 rarity, uint8 gender, uint96 royaltyBps) returns (uint256)',
  'function listCompanion(uint256 tokenId, uint256 price)',
  'function delistCompanion(uint256 tokenId)',
  'function purchaseCompanion(uint256 tokenId)',
  'function verifyCompanion(uint256 tokenId)',

  // Events
  'event CompanionMinted(uint256 indexed tokenId, address indexed creator, uint8 rarity, uint8 gender, string metadataURI)',
  'event CompanionListed(uint256 indexed tokenId, address indexed seller, uint256 price)',
  'event CompanionDelisted(uint256 indexed tokenId)',
  'event CompanionSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price)',
];

// ERC20 ABI for BONZAI token approval
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

// Rarity enum matching contract
export const Rarity = {
  Common: 0,
  Rare: 1,
  Epic: 2,
  Legendary: 3,
  Mythic: 4,
};

// Gender enum matching contract
export const Gender = {
  Neutral: 0,
  Female: 1,
  Male: 2,
};

// Rarity display names and colors
export const RARITY_CONFIG = {
  [Rarity.Common]: { name: 'Common', color: '#9CA3AF', bgColor: '#1F2937' },
  [Rarity.Rare]: { name: 'Rare', color: '#3B82F6', bgColor: '#1E3A5F' },
  [Rarity.Epic]: { name: 'Epic', color: '#8B5CF6', bgColor: '#2D1B4E' },
  [Rarity.Legendary]: { name: 'Legendary', color: '#F59E0B', bgColor: '#422006' },
  [Rarity.Mythic]: { name: 'Mythic', color: '#EC4899', bgColor: '#500724' },
};

// Reactive state
const state = reactive({
  contractAddress: null,
  isLoading: false,
  error: null,

  // Companion data
  ownedCompanions: [],
  createdCompanions: [],
  builtInCompanions: [],
  listedCompanions: [],

  // Pricing
  mintPrices: {},
  platformFeeBps: 250,
});

// Computed values
const isInitialized = computed(() => !!state.contractAddress);

/**
 * Initialize the companion service with contract address
 */
function initialize(contractAddress) {
  state.contractAddress = contractAddress;
  console.log('[CompanionService] Initialized with contract:', contractAddress);
}

/**
 * Get contract instance
 */
function getContract(withSigner = false) {
  if (!state.contractAddress) {
    throw new Error('Companion service not initialized');
  }

  const provider = web3Service.getProvider();
  if (!provider) {
    throw new Error('No provider available');
  }

  if (withSigner) {
    const signer = provider.getSigner();
    return new ethers.Contract(state.contractAddress, COMPANION_NFT_ABI, signer);
  }

  return new ethers.Contract(state.contractAddress, COMPANION_NFT_ABI, provider);
}

/**
 * Get BONZAI token contract
 */
function getBonzaiContract(withSigner = false) {
  const tokenAddress = CONFIG.tokens.BONZAI.arbitrum;
  const provider = web3Service.getProvider();

  if (withSigner) {
    const signer = provider.getSigner();
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  }

  return new ethers.Contract(tokenAddress, ERC20_ABI, provider);
}

/**
 * Load mint prices for all rarities
 */
async function loadMintPrices() {
  try {
    const contract = getContract();

    const prices = await Promise.all([
      contract.mintPrices(Rarity.Common),
      contract.mintPrices(Rarity.Rare),
      contract.mintPrices(Rarity.Epic),
      contract.mintPrices(Rarity.Legendary),
      contract.mintPrices(Rarity.Mythic),
    ]);

    state.mintPrices = {
      [Rarity.Common]: prices[0],
      [Rarity.Rare]: prices[1],
      [Rarity.Epic]: prices[2],
      [Rarity.Legendary]: prices[3],
      [Rarity.Mythic]: prices[4],
    };

    state.platformFeeBps = await contract.platformFeeBps();

    return state.mintPrices;
  } catch (e) {
    console.error('[CompanionService] Failed to load mint prices:', e);
    throw e;
  }
}

/**
 * Get formatted mint price for a rarity
 */
function getMintPriceFormatted(rarity) {
  const price = state.mintPrices[rarity];
  if (!price) return '0';
  return ethers.formatEther(price);
}

/**
 * Load built-in companions
 */
async function loadBuiltInCompanions() {
  try {
    const contract = getContract();
    const builtInIds = await contract.getBuiltInCompanionIds();

    state.builtInCompanions = [];

    for (const builtInId of builtInIds) {
      const tokenId = await contract.getBuiltInTokenId(builtInId);
      const companion = await contract.getCompanion(tokenId);
      const uri = await contract.tokenURI(tokenId);

      state.builtInCompanions.push({
        builtInId,
        tokenId: tokenId.toString(),
        uri,
        ...parseCompanionData(companion),
      });
    }

    return state.builtInCompanions;
  } catch (e) {
    console.error('[CompanionService] Failed to load built-in companions:', e);
    throw e;
  }
}

/**
 * Load companions owned by user
 */
async function loadOwnedCompanions(userAddress) {
  if (!userAddress) return [];

  try {
    state.isLoading = true;
    const contract = getContract();
    const totalSupply = await contract.totalSupply();

    state.ownedCompanions = [];

    // Check ownership for each token (inefficient but works for now)
    // In production, use events or subgraph
    for (let i = 0; i < totalSupply; i++) {
      try {
        const owner = await contract.ownerOf(i);
        if (owner.toLowerCase() === userAddress.toLowerCase()) {
          const companion = await contract.getCompanion(i);
          const uri = await contract.tokenURI(i);
          const listing = await contract.getListing(i);

          state.ownedCompanions.push({
            tokenId: i.toString(),
            uri,
            listing: parseListingData(listing),
            ...parseCompanionData(companion),
          });
        }
      } catch (e) {
        // Token may not exist or be burned
        continue;
      }
    }

    return state.ownedCompanions;
  } catch (e) {
    console.error('[CompanionService] Failed to load owned companions:', e);
    throw e;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Load companions created by user
 */
async function loadCreatedCompanions(creatorAddress) {
  if (!creatorAddress) return [];

  try {
    const contract = getContract();
    const tokenIds = await contract.getCreatorCompanions(creatorAddress);

    state.createdCompanions = [];

    for (const tokenId of tokenIds) {
      const companion = await contract.getCompanion(tokenId);
      const uri = await contract.tokenURI(tokenId);
      const owner = await contract.ownerOf(tokenId);

      state.createdCompanions.push({
        tokenId: tokenId.toString(),
        uri,
        owner,
        ...parseCompanionData(companion),
      });
    }

    return state.createdCompanions;
  } catch (e) {
    console.error('[CompanionService] Failed to load created companions:', e);
    throw e;
  }
}

/**
 * Parse companion data from contract
 */
function parseCompanionData(data) {
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
 * Parse listing data from contract
 */
function parseListingData(data) {
  return {
    isListed: data.isListed,
    price: data.price,
    priceFormatted: ethers.formatEther(data.price),
    seller: data.seller,
  };
}

/**
 * Check if user can use a companion
 */
async function canUseCompanion(userAddress, tokenId) {
  try {
    const contract = getContract();
    return await contract.canUseCompanion(userAddress, tokenId);
  } catch (e) {
    console.error('[CompanionService] Failed to check companion access:', e);
    return false;
  }
}

/**
 * Check if user can use a built-in companion (always true for built-ins)
 */
async function canUseBuiltIn(builtInId) {
  try {
    const contract = getContract();
    return await contract.canUseBuiltIn(builtInId);
  } catch (e) {
    console.error('[CompanionService] Failed to check built-in access:', e);
    return true; // Built-ins are always accessible
  }
}

/**
 * Mint a new companion NFT
 * @param {Object} params - Minting parameters
 * @param {string} params.metadataURI - IPFS URI to metadata JSON
 * @param {string} params.personalityHash - keccak256 hash of personality traits
 * @param {string} params.loraHash - Optional hash of LoRA weights
 * @param {number} params.rarity - Rarity tier (0-4)
 * @param {number} params.gender - Gender (0=Neutral, 1=Female, 2=Male)
 * @param {number} params.royaltyBps - Creator royalty in basis points (0-1000)
 */
async function mintCompanion({ metadataURI, personalityHash, loraHash, rarity, gender, royaltyBps = 500 }) {
  try {
    state.isLoading = true;

    // Ensure prices are loaded
    if (Object.keys(state.mintPrices).length === 0) {
      await loadMintPrices();
    }

    const price = state.mintPrices[rarity];
    if (!price) {
      throw new Error('Invalid rarity tier');
    }

    // Check BONZAI balance
    const bonzai = getBonzaiContract();
    const userAddress = web3Service.state.walletAddress;
    const balance = await bonzai.balanceOf(userAddress);

    if (balance < price) {
      throw new Error(`Insufficient BONZAI balance. Need ${ethers.formatEther(price)} BONZAI`);
    }

    // Approve BONZAI spending if needed
    const allowance = await bonzai.allowance(userAddress, state.contractAddress);
    if (allowance < price) {
      console.log('[CompanionService] Approving BONZAI spending...');
      const bonzaiWithSigner = getBonzaiContract(true);
      const approveTx = await bonzaiWithSigner.approve(state.contractAddress, price);
      await approveTx.wait();
      console.log('[CompanionService] BONZAI approved');
    }

    // Hash personality if string provided
    const personalityBytes = typeof personalityHash === 'string' && !personalityHash.startsWith('0x')
      ? ethers.keccak256(ethers.toUtf8Bytes(personalityHash))
      : personalityHash;

    // Hash LoRA if provided
    const loraBytes = loraHash
      ? (typeof loraHash === 'string' && !loraHash.startsWith('0x')
        ? ethers.keccak256(ethers.toUtf8Bytes(loraHash))
        : loraHash)
      : ethers.ZeroHash;

    // Mint companion
    const contract = getContract(true);
    const tx = await contract.mintCompanion(
      metadataURI,
      personalityBytes,
      loraBytes,
      rarity,
      gender,
      royaltyBps
    );

    console.log('[CompanionService] Minting companion, tx:', tx.hash);
    const receipt = await tx.wait();

    // Find token ID from event
    const mintEvent = receipt.logs.find(log => {
      try {
        const parsed = contract.interface.parseLog(log);
        return parsed?.name === 'CompanionMinted';
      } catch { return false; }
    });

    let tokenId = null;
    if (mintEvent) {
      const parsed = contract.interface.parseLog(mintEvent);
      tokenId = parsed.args.tokenId.toString();
    }

    console.log('[CompanionService] Companion minted, tokenId:', tokenId);

    return {
      success: true,
      tokenId,
      txHash: receipt.hash,
    };
  } catch (e) {
    console.error('[CompanionService] Failed to mint companion:', e);
    state.error = e.message;
    return {
      success: false,
      error: e.message,
    };
  } finally {
    state.isLoading = false;
  }
}

/**
 * List a companion for sale
 */
async function listCompanion(tokenId, priceInBonzai) {
  try {
    state.isLoading = true;

    const price = ethers.parseEther(priceInBonzai.toString());
    const contract = getContract(true);

    const tx = await contract.listCompanion(tokenId, price);
    const receipt = await tx.wait();

    console.log('[CompanionService] Companion listed:', tokenId);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (e) {
    console.error('[CompanionService] Failed to list companion:', e);
    return {
      success: false,
      error: e.message,
    };
  } finally {
    state.isLoading = false;
  }
}

/**
 * Delist a companion from sale
 */
async function delistCompanion(tokenId) {
  try {
    state.isLoading = true;

    const contract = getContract(true);
    const tx = await contract.delistCompanion(tokenId);
    const receipt = await tx.wait();

    console.log('[CompanionService] Companion delisted:', tokenId);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (e) {
    console.error('[CompanionService] Failed to delist companion:', e);
    return {
      success: false,
      error: e.message,
    };
  } finally {
    state.isLoading = false;
  }
}

/**
 * Purchase a listed companion
 */
async function purchaseCompanion(tokenId) {
  try {
    state.isLoading = true;

    const contract = getContract();
    const listing = await contract.getListing(tokenId);

    if (!listing.isListed) {
      throw new Error('Companion is not listed for sale');
    }

    const price = listing.price;
    const userAddress = web3Service.state.walletAddress;

    // Check BONZAI balance
    const bonzai = getBonzaiContract();
    const balance = await bonzai.balanceOf(userAddress);

    if (balance < price) {
      throw new Error(`Insufficient BONZAI balance. Need ${ethers.formatEther(price)} BONZAI`);
    }

    // Approve BONZAI spending
    const allowance = await bonzai.allowance(userAddress, state.contractAddress);
    if (allowance < price) {
      console.log('[CompanionService] Approving BONZAI for purchase...');
      const bonzaiWithSigner = getBonzaiContract(true);
      const approveTx = await bonzaiWithSigner.approve(state.contractAddress, price);
      await approveTx.wait();
    }

    // Purchase
    const contractWithSigner = getContract(true);
    const tx = await contractWithSigner.purchaseCompanion(tokenId);
    const receipt = await tx.wait();

    console.log('[CompanionService] Companion purchased:', tokenId);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (e) {
    console.error('[CompanionService] Failed to purchase companion:', e);
    return {
      success: false,
      error: e.message,
    };
  } finally {
    state.isLoading = false;
  }
}

/**
 * Verify a companion (creator only)
 */
async function verifyCompanion(tokenId) {
  try {
    const contract = getContract(true);
    const tx = await contract.verifyCompanion(tokenId);
    await tx.wait();

    return { success: true };
  } catch (e) {
    console.error('[CompanionService] Failed to verify companion:', e);
    return {
      success: false,
      error: e.message,
    };
  }
}

/**
 * Load marketplace listings
 */
async function loadMarketplaceListings(limit = 50) {
  try {
    state.isLoading = true;
    const contract = getContract();
    const totalSupply = await contract.totalSupply();

    state.listedCompanions = [];

    for (let i = 0; i < Math.min(Number(totalSupply), 500); i++) {
      try {
        const listing = await contract.getListing(i);

        if (listing.isListed) {
          const companion = await contract.getCompanion(i);
          const uri = await contract.tokenURI(i);

          // Get royalty info
          const [royaltyReceiver, royaltyAmount] = await contract.royaltyInfo(i, listing.price);

          state.listedCompanions.push({
            tokenId: i.toString(),
            uri,
            listing: parseListingData(listing),
            royalty: {
              receiver: royaltyReceiver,
              amount: ethers.formatEther(royaltyAmount),
              percentage: (Number(royaltyAmount) * 100 / Number(listing.price)).toFixed(1),
            },
            ...parseCompanionData(companion),
          });

          if (state.listedCompanions.length >= limit) break;
        }
      } catch (e) {
        continue;
      }
    }

    return state.listedCompanions;
  } catch (e) {
    console.error('[CompanionService] Failed to load listings:', e);
    throw e;
  } finally {
    state.isLoading = false;
  }
}

/**
 * Get companion details by token ID
 */
async function getCompanionDetails(tokenId) {
  try {
    const contract = getContract();

    const [companion, uri, owner, listing] = await Promise.all([
      contract.getCompanion(tokenId),
      contract.tokenURI(tokenId),
      contract.ownerOf(tokenId),
      contract.getListing(tokenId),
    ]);

    // Get royalty info if listed
    let royalty = null;
    if (listing.isListed) {
      const [royaltyReceiver, royaltyAmount] = await contract.royaltyInfo(tokenId, listing.price);
      royalty = {
        receiver: royaltyReceiver,
        amount: ethers.formatEther(royaltyAmount),
        percentage: (Number(royaltyAmount) * 100 / Number(listing.price)).toFixed(1),
      };
    }

    return {
      tokenId: tokenId.toString(),
      uri,
      owner,
      listing: parseListingData(listing),
      royalty,
      ...parseCompanionData(companion),
    };
  } catch (e) {
    console.error('[CompanionService] Failed to get companion details:', e);
    throw e;
  }
}

/**
 * Fetch metadata from IPFS
 */
async function fetchMetadata(uri) {
  try {
    // Convert IPFS URI to HTTP gateway
    let url = uri;
    if (uri.startsWith('ipfs://')) {
      url = uri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
    }

    const response = await fetch(url);
    return await response.json();
  } catch (e) {
    console.error('[CompanionService] Failed to fetch metadata:', e);
    return null;
  }
}

// Export service
export const companionService = {
  state,
  isInitialized,

  // Initialization
  initialize,

  // Loading
  loadMintPrices,
  loadBuiltInCompanions,
  loadOwnedCompanions,
  loadCreatedCompanions,
  loadMarketplaceListings,

  // Queries
  getMintPriceFormatted,
  canUseCompanion,
  canUseBuiltIn,
  getCompanionDetails,
  fetchMetadata,

  // Transactions
  mintCompanion,
  listCompanion,
  delistCompanion,
  purchaseCompanion,
  verifyCompanion,

  // Constants
  Rarity,
  Gender,
  RARITY_CONFIG,
};

export default companionService;
