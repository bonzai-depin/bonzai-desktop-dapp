/**
 * Storage Service — IPFS uploads via Pinata
 *
 * Handles content & metadata uploads to IPFS via Pinata's API.
 * No wallet signatures or funding required — uses API key auth.
 */

import { ethers } from "ethers";

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} GenerationMeta
 * @property {string} [type] - Content type (e.g. 'image', 'audio', 'video')
 * @property {string} [model] - Model identifier used for generation
 * @property {string} [modelVersion] - Model version string
 * @property {string} [promptHash] - Hash of the prompt used
 * @property {number} [timestamp] - Unix timestamp of generation
 */

/**
 * @typedef {Object} AttributionMeta
 * @property {string} [creator] - Creator wallet address
 * @property {string} [platform] - Platform wallet address
 */

/**
 * @typedef {Object} UploadReceipt
 * @property {string} transactionId - IPFS CID
 * @property {string} timestamp - Upload timestamp from Pinata
 * @property {null} signature - Always null for Pinata uploads
 * @property {string} url - IPFS URI (ipfs://CID)
 * @property {string} gatewayUrl - HTTP gateway URL
 * @property {number} size - Content size in bytes
 * @property {Array<{name: string, value: string}>} tags - Key-value metadata tags
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PINATA_API = "https://api.pinata.cloud";
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

// Auth: JWT (preferred), falls back to API Key + Secret
function getAuthHeaders() {
  const jwt = import.meta.env.VITE_PINATA_JWT;
  if (jwt) {
    return { Authorization: `Bearer ${jwt}` };
  }
  const apiKey = import.meta.env.VITE_PINATA_API_KEY;
  const apiSecret = import.meta.env.VITE_PINATA_API_SECRET;
  if (apiKey && apiSecret) {
    return {
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    };
  }
  throw new Error(
    "Pinata credentials not configured. Set VITE_PINATA_JWT (or VITE_PINATA_API_KEY + VITE_PINATA_API_SECRET) in your .env file.",
  );
}

const STORAGE_CONFIG = {
  gateways: {
    primary: PINATA_GATEWAY,
    backup: "https://ipfs.io/ipfs",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let _initialized = false;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION (lightweight — no wallet needed for Pinata)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the storage service (verifies Pinata credentials).
 * @param {unknown} [_provider] - Unused (kept for API compat with previous Irys-based service)
 * @returns {Promise<boolean>} True if initialization succeeded
 */
export async function initStorage(_provider) {
  // Verify credentials are available
  getAuthHeaders();
  _initialized = true;
  return true;
}

export async function getStorage(_provider) {
  if (!_initialized) return initStorage(_provider);
  return true;
}

export function isInitialized() {
  return _initialized;
}

export function disconnect() {
  _initialized = false;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNDING (no-ops — Pinata uses API plan, no per-upload funding)
// ═══════════════════════════════════════════════════════════════════════════

export async function getBalance() {
  return "unlimited";
}

export async function fund(_amount) {
  return { id: "pinata-no-funding-needed" };
}

export async function estimateCost(_bytes) {
  return "0";
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function toUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data?.buffer instanceof ArrayBuffer)
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data?.length !== undefined) return new Uint8Array(data);
  throw new Error("Unsupported data type for upload");
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Map content type to a file extension for Pinata filename hint.
 */
function extFromMime(contentType) {
  const map = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "text/html": "html",
    "text/plain": "txt",
    "application/json": "json",
    "application/javascript": "js",
    "model/gltf-binary": "glb",
    "model/gltf+json": "gltf",
    "application/octet-stream": "bin",
  };
  return map[contentType] || "bin";
}

/**
 * Build Pinata keyvalues from generation + attribution tags.
 * @param {GenerationMeta} [generation] - Generation metadata
 * @param {AttributionMeta} [attribution] - Attribution metadata
 * @returns {Record<string, string>} Key-value pairs for Pinata metadata
 */
function buildKeyValues(generation = {}, attribution = {}) {
  const kv = { "App-Name": "BonzAI", "App-Version": "2.0.0" };
  if (generation.type) kv["Generation-Type"] = generation.type;
  if (generation.model) kv["Model-ID"] = generation.model;
  if (generation.modelVersion) kv["Model-Version"] = generation.modelVersion;
  if (generation.promptHash) kv["Prompt-Hash"] = generation.promptHash;
  if (generation.timestamp)
    kv["Generation-Timestamp"] = String(generation.timestamp);
  if (attribution.creator) kv["Creator-Address"] = attribution.creator;
  if (attribution.platform) kv["Platform-Address"] = attribution.platform;
  return kv;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD — pinFileToIPFS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload content to IPFS via Pinata.
 *
 * @param {Object} params
 * @param {Uint8Array|ArrayBuffer|Blob|string} params.data - Content to upload
 * @param {string} params.contentType - MIME type
 * @param {GenerationMeta} [params.generation] - Generation metadata
 * @param {AttributionMeta} [params.attribution] - Attribution metadata
 * @returns {Promise<UploadReceipt>} Upload receipt
 */
export async function uploadContent({
  data,
  contentType,
  generation = {},
  attribution = {},
}) {
  let uploadData = data;
  if (data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    uploadData = new Uint8Array(arrayBuffer);
  } else {
    uploadData = toUint8Array(data);
  }

  const ext = extFromMime(contentType);
  const fileName = `bonzai-${generation.type || "content"}-${Date.now()}.${ext}`;

  const formData = new FormData();
  formData.append("file", new Blob([uploadData], { type: contentType }), fileName);
  formData.append(
    "pinataMetadata",
    JSON.stringify({
      name: fileName,
      keyvalues: buildKeyValues(generation, attribution),
    }),
  );
  formData.append(
    "pinataOptions",
    JSON.stringify({ cidVersion: 1 }),
  );

  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${errBody}`);
  }

  const result = await res.json();
  const cid = result.IpfsHash;


  return {
    transactionId: cid,
    timestamp: result.Timestamp,
    signature: null,
    url: `ipfs://${cid}`,
    gatewayUrl: `${PINATA_GATEWAY}/${cid}`,
    size: result.PinSize || uploadData.byteLength || uploadData.length,
    tags: Object.entries(buildKeyValues(generation, attribution)).map(
      ([name, value]) => ({ name, value }),
    ),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD — pinJSONToIPFS (metadata)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload JSON metadata to IPFS via Pinata.
 *
 * @param {Record<string, unknown>} metadata - JSON-serializable metadata object
 * @param {GenerationMeta} [generation] - Generation metadata tags
 * @param {AttributionMeta} [attribution] - Attribution metadata tags
 * @returns {Promise<UploadReceipt>} Upload receipt
 */
export async function uploadMetadata(
  metadata,
  generation = {},
  attribution = {},
) {
  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `bonzai-metadata-${Date.now()}.json`,
        keyvalues: buildKeyValues(generation, attribution),
      },
      pinataOptions: { cidVersion: 1 },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Pinata metadata upload failed (${res.status}): ${errBody}`);
  }

  const result = await res.json();
  const cid = result.IpfsHash;


  return {
    transactionId: cid,
    timestamp: result.Timestamp,
    signature: null,
    url: `ipfs://${cid}`,
    gatewayUrl: `${PINATA_GATEWAY}/${cid}`,
    size: result.PinSize,
    tags: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD — base64 convenience
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload base64-encoded content to IPFS via Pinata.
 *
 * @param {Object} params
 * @param {string} params.base64Data - Base64-encoded content (with or without data URI prefix)
 * @param {string} params.contentType - MIME type
 * @param {GenerationMeta} [params.generation] - Generation metadata
 * @param {AttributionMeta} [params.attribution] - Attribution metadata
 * @returns {Promise<UploadReceipt>} Upload receipt
 */
export async function uploadBase64({
  base64Data,
  contentType,
  generation = {},
  attribution = {},
}) {
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
  const data = base64ToUint8Array(cleanBase64);

  return uploadContent({
    data,
    contentType,
    generation,
    attribution,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD — file from path (Electron only)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload a file from disk to IPFS via Pinata (Electron only).
 *
 * @param {string} filePath - Absolute path to the file
 * @param {GenerationMeta} [generation] - Generation metadata
 * @param {AttributionMeta} [attribution] - Attribution metadata
 * @returns {Promise<UploadReceipt>} Upload receipt
 */
export async function uploadFile(filePath, generation, attribution) {
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
 * Fetch content from IPFS by CID.
 * @param {string} cid - IPFS content identifier
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchContent(cid) {
  const url = `${PINATA_GATEWAY}/${cid}`;
  return fetch(url);
}

/**
 * Fetch content with provenance metadata.
 * @param {string} cid - IPFS content identifier
 * @returns {Promise<{content: Blob, provenance: {transactionId: string, owner: null, timestamp: null, tags: Record<string, never>}}>}
 */
export async function fetchWithProvenance(cid) {
  const response = await fetchContent(cid);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

  return {
    content: await response.blob(),
    provenance: {
      transactionId: cid,
      owner: null,
      timestamp: null,
      tags: {},
    },
  };
}

/**
 * Verify content integrity by comparing keccak256 hash.
 * @param {string} cid - IPFS content identifier
 * @param {string} expectedHash - Expected keccak256 hash (0x-prefixed)
 * @returns {Promise<boolean>} True if content matches expected hash
 */
export async function verifyContentIntegrity(cid, expectedHash) {
  const response = await fetchContent(cid);
  const buffer = await response.arrayBuffer();
  const hash = ethers.keccak256(new Uint8Array(buffer));
  return hash === expectedHash;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD — JSON convenience (alias for uploadMetadata)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload JSON to IPFS (alias for uploadMetadata).
 * @param {Record<string, unknown>} json - JSON-serializable object
 * @param {GenerationMeta} [generation] - Generation metadata tags
 * @param {AttributionMeta} [attribution] - Attribution metadata tags
 * @returns {Promise<UploadReceipt>} Upload receipt
 */
export async function uploadJSON(json, generation = {}, attribution = {}) {
  return uploadMetadata(json, generation, attribution);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const storageService = {
  // Init
  initStorage,
  getStorage,
  isInitialized,
  disconnect,

  // Funding (no-ops)
  getBalance,
  fund,
  estimateCost,

  // Upload
  uploadContent,
  uploadMetadata,
  uploadBase64,
  uploadFile,
  uploadJSON,

  // Retrieval
  fetchContent,
  fetchWithProvenance,
  verifyContentIntegrity,

  // Config
  config: STORAGE_CONFIG,
};

export default storageService;
