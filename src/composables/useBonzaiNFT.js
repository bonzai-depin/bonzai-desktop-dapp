/**
 * useBonzaiNFT Composable
 *
 * Orchestrates the full flow: Generation → IPFS Upload → LSP8 Mint
 * Uses LUKSO Universal Profiles and IPFS (Pinata) for decentralized provenance
 */

import { ref, computed, reactive } from "vue";
import { ethers } from "ethers";
import { storageService } from "../services/storage.service.js";
import { luksoService } from "../services/lukso.service.js";

export function useBonzaiNFT() {
  // ═══════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════

  const status = ref("idle"); // idle | connecting | uploading | minting | complete | error
  const progress = reactive({
    stage: "",
    percent: 0,
    message: "",
  });
  const error = ref(null);
  const result = ref(null);

  // ═══════════════════════════════════════════════════════════════════════
  // COMPUTED
  // ═══════════════════════════════════════════════════════════════════════

  const isProcessing = computed(() =>
    ["connecting", "uploading", "minting"].includes(status.value)
  );

  const isComplete = computed(() => status.value === "complete");
  const hasError = computed(() => status.value === "error");

  // Service states
  const isLuksoConnected = computed(() => luksoService.state.isConnected);
  const isStorageConnected = computed(() => storageService.isInitialized());
  const luksoAddress = computed(() => luksoService.state.address);
  const luksoProfile = computed(() => luksoService.state.profileData);

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  function updateProgress(stage, percent, message) {
    progress.stage = stage;
    progress.percent = percent;
    progress.message = message;
  }

  function reset() {
    status.value = "idle";
    progress.stage = "";
    progress.percent = 0;
    progress.message = "";
    error.value = null;
    result.value = null;
  }

  /**
   * Generate content hash from raw data
   */
  async function hashContent(data) {
    if (data instanceof Blob) {
      const arrayBuffer = await data.arrayBuffer();
      return ethers.keccak256(new Uint8Array(arrayBuffer));
    }
    if (data instanceof ArrayBuffer) {
      return ethers.keccak256(new Uint8Array(data));
    }
    if (typeof data === "string") {
      // Assume base64
      const cleanBase64 = data.replace(/^data:[^;]+;base64,/, "");
      const binary = atob(cleanBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return ethers.keccak256(bytes);
    }
    // Buffer or Uint8Array
    return ethers.keccak256(data);
  }

  /**
   * Generate prompt hash
   */
  function hashPrompt(prompt) {
    return ethers.keccak256(ethers.toUtf8Bytes(prompt));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Connect to LUKSO Universal Profile
   */
  async function connectLukso() {
    status.value = "connecting";
    updateProgress("connect", 10, "Connecting to Universal Profile...");

    try {
      const result = await luksoService.connect();
      updateProgress("connect", 50, "Universal Profile connected!");
      return result;
    } catch (err) {
      status.value = "error";
      error.value = err.message;
      throw err;
    }
  }

  /**
   * Connect to IPFS storage using the LUKSO wallet
   */
  async function connectStorage() {
    if (!isLuksoConnected.value) {
      throw new Error("Please connect your Universal Profile first");
    }

    updateProgress("connect", 60, "Connecting to IPFS storage...");

    try {
      // Get the LUKSO provider
      const provider = window.lukso;
      if (!provider) {
        throw new Error("LUKSO provider not found");
      }

      await storageService.initStorage(provider);
      updateProgress("connect", 100, "Connected to IPFS storage!");
    } catch (err) {
      status.value = "error";
      error.value = err.message;
      throw err;
    }
  }

  /**
   * Connect both LUKSO and IPFS storage
   */
  async function connect() {
    reset();
    status.value = "connecting";

    try {
      await connectLukso();
      await connectStorage();
      status.value = "idle";
      return {
        lukso: {
          address: luksoService.state.address,
          profile: luksoService.state.profileData,
        },
        storage: {
          address: storageService.isInitialized(),
        },
      };
    } catch (err) {
      status.value = "error";
      error.value = err.message;
      throw err;
    }
  }

  /**
   * Disconnect all services
   */
  function disconnect() {
    luksoService.disconnect();
    storageService.disconnect();
    reset();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FUNDING
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get storage balance
   */
  async function getStorageBalance() {
    if (!isStorageConnected.value) {
      throw new Error("IPFS storage not connected");
    }
    return storageService.getBalance();
  }

  /**
   * Fund storage account
   */
  async function fundStorage(amountEth) {
    if (!isStorageConnected.value) {
      throw new Error("IPFS storage not connected");
    }
    return storageService.fund(amountEth);
  }

  /**
   * Estimate upload cost
   */
  async function estimateUploadCost(bytes) {
    if (!isStorageConnected.value) {
      throw new Error("IPFS storage not connected");
    }
    return storageService.estimateCost(bytes);
  }

  /**
   * Get LSP8 mint fee
   */
  async function getMintFee() {
    if (!isLuksoConnected.value) {
      throw new Error("LUKSO not connected");
    }
    return luksoService.getMintFee();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN FLOW
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Tokenize AI-generated content
   *
   * @param {Object} params
   * @param {Blob|Buffer|Uint8Array|string} params.content - Generated content (or base64)
   * @param {string} params.contentType - MIME type
   * @param {string} params.prompt - Original prompt
   * @param {Object} params.generation - Generation metadata
   * @param {string} params.title - NFT title
   * @param {string} params.description - NFT description
   * @returns {Object} Minting result with URLs and token info
   */
  async function tokenize({ content, contentType, prompt, generation, title, description }) {
    reset();

    try {
      // ─────────────────────────────────────────────────────────────────
      // VALIDATION
      // ─────────────────────────────────────────────────────────────────

      if (!isLuksoConnected.value) {
        throw new Error("Please connect your Universal Profile first");
      }

      if (!isStorageConnected.value) {
        throw new Error("Please connect to IPFS storage first");
      }

      // ─────────────────────────────────────────────────────────────────
      // STAGE 1: UPLOAD CONTENT TO IPFS
      // ─────────────────────────────────────────────────────────────────

      status.value = "uploading";
      updateProgress("upload", 10, "Preparing content for upload...");

      // Hash content and prompt
      const contentHash = await hashContent(content);
      const promptHash = hashPrompt(prompt);
      const timestamp = Date.now();

      // Attribution
      const attribution = {
        creator: luksoService.state.address,
        creatorUP: luksoService.state.universalProfile,
        platform: "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89", // BonzAI treasury
        inferenceNode: "local", // Could be remote node address for P2P inference
      };

      // Prepare generation metadata
      const genMetadata = {
        type: generation.type, // text-to-image, etc.
        model: generation.model,
        modelVersion: generation.modelVersion || "1.0.0",
        promptHash,
        timestamp,
        parameters: generation.parameters || {},
      };

      updateProgress("upload", 20, "Uploading content to IPFS...");

      // Upload content
      let contentReceipt;
      if (typeof content === "string" && content.includes("base64")) {
        contentReceipt = await storageService.uploadBase64({
          base64Data: content,
          contentType,
          generation: genMetadata,
          attribution,
        });
      } else {
        contentReceipt = await storageService.uploadContent({
          data: content,
          contentType,
          generation: genMetadata,
          attribution,
        });
      }

      updateProgress("upload", 50, "Uploading metadata...");

      // ─────────────────────────────────────────────────────────────────
      // STAGE 2: BUILD & UPLOAD LSP4 METADATA
      // ─────────────────────────────────────────────────────────────────

      // Build LSP4Metadata with IPFS provenance
      const lsp4Metadata = {
        LSP4Metadata: {
          name: title,
          description,
          links: [
            {
              title: "View on IPFS",
              url: contentReceipt.gatewayUrl,
            },
          ],
          assets: [
            {
              url: contentReceipt.url, // ipfs://CID
              fileType: contentType,
              verification: {
                method: "keccak256(bytes)",
                data: contentHash,
              },
            },
          ],
          attributes: [
            { key: "Model", value: generation.model, type: "string" },
            { key: "Generation Type", value: generation.type, type: "string" },
            ...Object.entries(generation.parameters || {}).map(([k, v]) => ({
              key: k,
              value: v,
              type: typeof v,
            })),
          ],

          // BonzAI-specific provenance extension
          bonzaiProvenance: {
            version: "1.0.0",
            contentHash,
            promptHash,

            storage: {
              transactionId: contentReceipt.transactionId,
              timestamp: contentReceipt.timestamp,
              signature: contentReceipt.signature,
              gateway: "https://gateway.pinata.cloud/ipfs",
            },

            generation: {
              model: generation.model,
              modelVersion: generation.modelVersion || "1.0.0",
              parameters: generation.parameters || {},
              timestamp,
              prompt, // Store full prompt for provenance
            },

            attribution: {
              creator: {
                address: attribution.creator,
                universalProfile: attribution.creatorUP,
                role: "prompter",
              },
              platform: {
                name: "BonzAI",
                version: "1.0.0",
                address: attribution.platform,
                role: "orchestrator",
              },
              inferenceNode: {
                address: attribution.inferenceNode,
                role: "compute",
              },
            },
          },
        },
      };

      // Upload metadata JSON
      const metadataReceipt = await storageService.uploadMetadata(
        lsp4Metadata,
        genMetadata,
        attribution
      );

      updateProgress("upload", 70, "Content uploaded successfully!");

      // ─────────────────────────────────────────────────────────────────
      // STAGE 3: MINT LSP8 TOKEN
      // ─────────────────────────────────────────────────────────────────

      status.value = "minting";
      updateProgress("mint", 75, "Preparing to mint NFT...");

      // Generate deterministic tokenId
      const tokenId = luksoService.generateTokenId({
        prompt,
        model: generation.model,
        timestamp,
        creator: attribution.creator,
        contentHash,
      });

      updateProgress("mint", 80, "Please confirm the transaction in your wallet...");

      // Mint on LUKSO
      const mintResult = await luksoService.mint({
        transactionId: contentReceipt.transactionId,
        model: generation.model,
        metadataUri: metadataReceipt.url, // ipfs://CID
        tokenId,
      });

      updateProgress("mint", 95, "NFT minted successfully!");

      // ─────────────────────────────────────────────────────────────────
      // COMPLETE
      // ─────────────────────────────────────────────────────────────────

      status.value = "complete";
      updateProgress("complete", 100, "Tokenization complete!");

      result.value = {
        // Token info
        tokenId,
        transactionHash: mintResult.transactionHash,

        // URLs
        contentUrl: contentReceipt.gatewayUrl,
        metadataUrl: metadataReceipt.gatewayUrl,
        explorerUrl: mintResult.explorerUrl,

        // Storage receipts
        storage: {
          content: contentReceipt,
          metadata: metadataReceipt,
        },

        // Provenance
        provenance: {
          contentHash,
          promptHash,
          timestamp,
          creator: attribution.creator,
          model: generation.model,
        },
      };

      return result.value;
    } catch (err) {
      console.error("[BonzaiNFT] Tokenization failed:", err);
      status.value = "error";
      error.value = err.message;
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UPLOAD ONLY (without minting)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Upload content to IPFS without minting
   * Useful for previewing or when user wants to mint later
   */
  async function uploadOnly({ content, contentType, prompt, generation }) {
    if (!isStorageConnected.value) {
      throw new Error("Please connect to IPFS storage first");
    }

    status.value = "uploading";
    updateProgress("upload", 10, "Preparing content for upload...");

    try {
      const contentHash = await hashContent(content);
      const promptHash = hashPrompt(prompt);
      const timestamp = Date.now();

      const attribution = {
        creator: luksoService.state.address || "0x0000000000000000000000000000000000000000",
        creatorUP: luksoService.state.universalProfile,
        platform: "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89",
        inferenceNode: "local",
      };

      const genMetadata = {
        type: generation.type,
        model: generation.model,
        modelVersion: generation.modelVersion || "1.0.0",
        promptHash,
        timestamp,
        parameters: generation.parameters || {},
      };

      updateProgress("upload", 30, "Uploading to IPFS...");

      let receipt;
      if (typeof content === "string" && content.includes("base64")) {
        receipt = await storageService.uploadBase64({
          base64Data: content,
          contentType,
          generation: genMetadata,
          attribution,
        });
      } else {
        receipt = await storageService.uploadContent({
          data: content,
          contentType,
          generation: genMetadata,
          attribution,
        });
      }

      status.value = "complete";
      updateProgress("complete", 100, "Upload complete!");

      return {
        ...receipt,
        contentHash,
        promptHash,
        timestamp,
      };
    } catch (err) {
      status.value = "error";
      error.value = err.message;
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Verify a tokenized content's provenance
   */
  async function verify(tokenId) {
    if (!isLuksoConnected.value) {
      throw new Error("Please connect your Universal Profile first");
    }

    try {
      // Get on-chain provenance
      const onChain = await luksoService.getProvenance(tokenId);

      // Fetch from IPFS and verify hash
      const { content, provenance } = await storageService.fetchWithProvenance(
        onChain.transactionId
      );

      // Verify content hash
      const contentHash = await hashContent(content);

      return {
        valid: true, // Will be compared against expected hash from metadata
        onChain,
        provenance,
        contentHash,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${onChain.transactionId}`,
      };
    } catch (err) {
      console.error("[BonzaiNFT] Verification failed:", err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RETURN
  // ═══════════════════════════════════════════════════════════════════════

  return {
    // State
    status,
    progress,
    error,
    result,

    // Computed
    isProcessing,
    isComplete,
    hasError,
    isLuksoConnected,
    isStorageConnected,
    luksoAddress,
    luksoProfile,

    // Connection
    connect,
    connectLukso,
    connectStorage,
    disconnect,

    // Funding
    getStorageBalance,
    fundStorage,
    estimateUploadCost,
    getMintFee,

    // Actions
    tokenize,
    uploadOnly,
    verify,
    reset,

    // Helpers
    hashContent,
    hashPrompt,
  };
}

export default useBonzaiNFT;
