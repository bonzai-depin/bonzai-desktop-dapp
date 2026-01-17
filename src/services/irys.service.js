/**
 * Irys Service - Permanent storage with provenance
 *
 * Handles uploads to Arweave via Irys with cryptographic provenance tags
 */

import { WebIrys } from "@irys/sdk";
import { ethers } from "ethers";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const IRYS_CONFIG = {
  // Use devnet for testing, mainnet for production
  network: import.meta.env?.VITE_IRYS_NETWORK || "devnet",
  token: "ethereum", // Payment token

  // Irys nodes
  nodes: {
    devnet: "https://devnet.irys.xyz",
    mainnet: "https://node1.irys.xyz",
  },

  // Arweave gateways
  gateways: {
    primary: "https://arweave.net",
    backup: "https://gateway.irys.xyz",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let irysInstance = null;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize Irys with connected wallet
 * @param {Object} provider - EIP-1193 provider (window.ethereum or WalletConnect)
 * @returns {WebIrys}
 */
export async function initIrys(provider) {
  if (!provider) {
    throw new Error("Wallet provider required for Irys initialization");
  }

  const irys = new WebIrys({
    network: IRYS_CONFIG.network,
    token: IRYS_CONFIG.token,
    wallet: { provider },
  });

  await irys.ready();
  irysInstance = irys;

  console.log(`[Irys] Connected to ${IRYS_CONFIG.network}`);
  console.log(`[Irys] Wallet: ${irys.address}`);

  try {
    const balance = await irys.getLoadedBalance();
    console.log(`[Irys] Balance: ${irys.utils.fromAtomic(balance)} ETH`);
  } catch (e) {
    console.warn("[Irys] Could not fetch balance:", e.message);
  }

  return irys;
}

/**
 * Get or initialize Irys instance
 */
export async function getIrys(provider) {
  if (irysInstance) return irysInstance;
  return initIrys(provider);
}

/**
 * Check if Irys is initialized
 */
export function isInitialized() {
  return irysInstance !== null;
}

/**
 * Disconnect Irys
 */
export function disconnect() {
  irysInstance = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check current Irys balance
 * @returns {string} Balance in ETH
 */
export async function getBalance() {
  if (!irysInstance) throw new Error("Irys not initialized");
  const balance = await irysInstance.getLoadedBalance();
  return irysInstance.utils.fromAtomic(balance);
}

/**
 * Fund Irys account for uploads
 * @param {string} amount - Amount in ETH
 */
export async function fund(amount) {
  if (!irysInstance) throw new Error("Irys not initialized");

  const atomicAmount = irysInstance.utils.toAtomic(amount);
  const response = await irysInstance.fund(atomicAmount);

  console.log(`[Irys] Funded ${amount} ETH. TX: ${response.id}`);
  return response;
}

/**
 * Estimate upload cost
 * @param {number} bytes - File size in bytes
 * @returns {string} Cost in ETH
 */
export async function estimateCost(bytes) {
  if (!irysInstance) throw new Error("Irys not initialized");
  const price = await irysInstance.getPrice(bytes);
  return irysInstance.utils.fromAtomic(price);
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload content with BonzAI provenance tags
 *
 * @param {Object} params
 * @param {Buffer|Uint8Array|Blob} params.data - Content to upload
 * @param {string} params.contentType - MIME type
 * @param {Object} params.generation - Generation metadata
 * @param {Object} params.attribution - Tri-party attribution
 * @returns {Object} Upload receipt with transaction ID
 */
export async function uploadContent({
  data,
  contentType,
  generation = {},
  attribution = {},
}) {
  if (!irysInstance) throw new Error("Irys not initialized");

  // Convert Blob to Buffer if needed
  let uploadData = data;
  if (data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    uploadData = Buffer.from(arrayBuffer);
  }

  // Build provenance tags
  const tags = [
    // Standard tags
    { name: "Content-Type", value: contentType },
    { name: "App-Name", value: "BonzAI" },
    { name: "App-Version", value: "1.0.0" },
  ];

  // Generation metadata tags
  if (generation.type) {
    tags.push({ name: "Generation-Type", value: generation.type });
  }
  if (generation.model) {
    tags.push({ name: "Model-ID", value: generation.model });
  }
  if (generation.modelVersion) {
    tags.push({ name: "Model-Version", value: generation.modelVersion });
  }
  if (generation.promptHash) {
    tags.push({ name: "Prompt-Hash", value: generation.promptHash });
  }
  if (generation.timestamp) {
    tags.push({
      name: "Generation-Timestamp",
      value: String(generation.timestamp),
    });
  }

  // Attribution tags
  if (attribution.creator) {
    tags.push({ name: "Creator-Address", value: attribution.creator });
  }
  if (attribution.creatorUP) {
    tags.push({ name: "Creator-UP", value: attribution.creatorUP });
  }
  if (attribution.platform) {
    tags.push({ name: "Platform-Address", value: attribution.platform });
  }
  if (attribution.inferenceNode) {
    tags.push({ name: "Inference-Node", value: attribution.inferenceNode });
  }

  // Add generation parameters as tags
  if (generation.parameters) {
    for (const [key, value] of Object.entries(generation.parameters)) {
      if (value !== undefined && value !== null) {
        tags.push({
          name: `Param-${key}`,
          value: String(value),
        });
      }
    }
  }

  // Upload with tags
  const receipt = await irysInstance.upload(uploadData, { tags });

  console.log(`[Irys] Uploaded: ${receipt.id}`);
  console.log(`[Irys] URL: ${IRYS_CONFIG.gateways.primary}/${receipt.id}`);

  return {
    transactionId: receipt.id,
    timestamp: receipt.timestamp,
    signature: receipt.signature,
    url: `ar://${receipt.id}`,
    gatewayUrl: `${IRYS_CONFIG.gateways.primary}/${receipt.id}`,
    size: uploadData.byteLength || uploadData.length,
    tags,
  };
}

/**
 * Upload metadata JSON
 */
export async function uploadMetadata(metadata, generation = {}, attribution = {}) {
  const jsonString = JSON.stringify(metadata, null, 2);
  const data = new TextEncoder().encode(jsonString);

  return uploadContent({
    data: Buffer.from(data),
    contentType: "application/json",
    generation,
    attribution,
  });
}

/**
 * Upload file from base64
 * @param {string} base64Data - Base64 encoded content
 * @param {string} contentType - MIME type
 * @param {Object} generation - Generation metadata
 * @param {Object} attribution - Tri-party attribution
 */
export async function uploadBase64({
  base64Data,
  contentType,
  generation = {},
  attribution = {},
}) {
  // Remove data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");

  return uploadContent({
    data: buffer,
    contentType,
    generation,
    attribution,
  });
}

/**
 * Upload file from path (Electron only)
 */
export async function uploadFile(filePath, generation, attribution) {
  // Check if we're in Electron
  const fs = typeof window !== "undefined" && window.require?.("fs");
  if (!fs) throw new Error("File upload only available in Electron");

  const data = fs.readFileSync(filePath);
  const ext = filePath.split(".").pop().toLowerCase();

  const contentTypes = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
  };

  return uploadContent({
    data,
    contentType: contentTypes[ext] || "application/octet-stream",
    generation,
    attribution,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRIEVAL & VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch content from Arweave
 * @param {string} txId - Transaction ID
 * @returns {Response}
 */
export async function fetchContent(txId) {
  const url = `${IRYS_CONFIG.gateways.primary}/${txId}`;
  return fetch(url);
}

/**
 * Fetch and verify content with provenance
 */
export async function fetchWithProvenance(txId) {
  // Fetch content
  const response = await fetchContent(txId);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

  // Fetch transaction metadata from Arweave GraphQL
  const metaResponse = await fetch(`https://arweave.net/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query {
          transaction(id: "${txId}") {
            id
            owner { address }
            tags { name value }
            block { timestamp }
          }
        }
      `,
    }),
  });

  const metaData = await metaResponse.json();
  const tx = metaData.data?.transaction;

  return {
    content: await response.blob(),
    provenance: {
      transactionId: tx?.id || txId,
      owner: tx?.owner?.address,
      timestamp: tx?.block?.timestamp,
      tags: tx?.tags?.reduce((acc, t) => ({ ...acc, [t.name]: t.value }), {}) || {},
    },
  };
}

/**
 * Verify content hash matches stored hash
 */
export async function verifyContentIntegrity(txId, expectedHash) {
  const response = await fetchContent(txId);
  const buffer = await response.arrayBuffer();
  const hash = ethers.keccak256(new Uint8Array(buffer));
  return hash === expectedHash;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const irysService = {
  // Init
  initIrys,
  getIrys,
  isInitialized,
  disconnect,

  // Funding
  getBalance,
  fund,
  estimateCost,

  // Upload
  uploadContent,
  uploadMetadata,
  uploadBase64,
  uploadFile,

  // Retrieval
  fetchContent,
  fetchWithProvenance,
  verifyContentIntegrity,

  // Config
  config: IRYS_CONFIG,
};

export default irysService;
