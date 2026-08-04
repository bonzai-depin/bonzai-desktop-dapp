/**
 * Storage Service — IPFS uploads via Pinata
 *
 * Handles content & metadata uploads to IPFS via Pinata's API.
 * No wallet signatures or funding required — uses API key auth.
 *
 * The actual Pinata request happens entirely in the Electron main process
 * (see src/main/pinataPublish.js) — the Pinata JWT / API key+secret never
 * enter the renderer. This module only normalizes upload input and calls
 * window.electronAPI.storage.publish; retrieval (fetchContent etc.) still
 * happens here directly since Pinata's public gateway is unauthenticated.
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

const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

// Hard client-side ceiling matching src/main/pinataPublish.js's
// MAX_UPLOAD_BYTES — fails fast (before the IPC round-trip) on an oversized
// upload; the main process enforces the real bound regardless.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MiB

/**
 * The publishing bridge exposed by preload.js. Credentials are read and
 * injected entirely in the main process — this module never builds an
 * Authorization / pinata_api_key header itself.
 */
function getPublishBridge() {
  const api = typeof window !== "undefined" ? window.electronAPI?.storage : undefined;
  if (!api?.publish) {
    throw new Error("Pinata publishing is only available inside the BonzAI desktop app.");
  }
  return api;
}

async function publish(payload) {
  const bridge = getPublishBridge();
  const result = await bridge.publish(payload);
  if (!result || result.ok === false) {
    throw new Error(result?.error || "Pinata publish failed");
  }
  const { ok: _ok, ...receipt } = result;
  return receipt;
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
 * Initialize the storage service. Credential availability is no longer
 * checked here — the Pinata JWT/API key live in the main process and are
 * validated at publish time, so local (non-publishing) use of this service
 * works whether or not Pinata is configured.
 * @param {unknown} [_provider] - Unused (kept for API compat with previous Irys-based service)
 * @returns {Promise<boolean>} True if initialization succeeded
 */
export async function initStorage(_provider) {
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

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD — pinFileToIPFS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload content to IPFS via Pinata. The actual request (and the credential
 * it needs) happens in the main process; this just normalizes `data` and
 * hands it to the storage:publish bridge.
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

  if (uploadData.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Upload too large: ${uploadData.byteLength} bytes exceeds the ${MAX_UPLOAD_BYTES}-byte limit`,
    );
  }

  return publish({ kind: "content", data: uploadData, contentType, generation, attribution });
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
  return publish({ kind: "metadata", metadata, generation, attribution });
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

const FILE_EXT_CONTENT_TYPES = {
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

/**
 * Upload a file from disk to IPFS via Pinata (Electron only). The file is
 * read in the main process (src/main/pinataPublish.js), not here — the
 * renderer never touches the filesystem for this path.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {GenerationMeta} [generation] - Generation metadata
 * @param {AttributionMeta} [attribution] - Attribution metadata
 * @returns {Promise<UploadReceipt>} Upload receipt
 */
export async function uploadFile(filePath, generation, attribution) {
  const ext = filePath.split(".").pop().toLowerCase();
  const contentType = FILE_EXT_CONTENT_TYPES[ext] || "application/octet-stream";

  return publish({ kind: "file", filePath, contentType, generation, attribution });
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
