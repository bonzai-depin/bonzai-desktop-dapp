# BonzAI × LUKSO Universal Profiles × Irys Integration

> Decentralized AI content attribution and permanent storage using LUKSO's LSP8 NFT standard and Irys provenance layer on Arweave.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Data Schemas](#data-schemas)
5. [Smart Contracts](#smart-contracts)
6. [Frontend Services](#frontend-services)
7. [Implementation Phases](#implementation-phases)
8. [Cost Estimates](#cost-estimates)
9. [Verification Flow](#verification-flow)

---

## Overview

### Problem Statement

Current AI content attribution lacks:
- **Provenance**: No verifiable chain of creation (human prompt → AI model → output)
- **Permanence**: Centralized storage (Pinata/IPFS pinning services) can disappear
- **Identity**: Wallet addresses don't carry reputation or social context

### Solution

Combine three technologies:

| Component | Purpose | Network |
|-----------|---------|---------|
| **LUKSO Universal Profiles** | Smart contract identity with social metadata | LUKSO L1 |
| **LSP8 Identifiable Digital Asset** | NFT standard with dynamic metadata | LUKSO L1 |
| **Irys** | Permanent storage with provenance proofs | Arweave |

### Why This Stack?

- **LUKSO Universal Profiles** → Users own their identity (not just a wallet address)
- **LSP8** → Rich metadata, dynamic updates, bytes32 tokenIds for content hashing
- **Irys** → Immutable storage with cryptographic provenance, no pinning fees

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BonzAI Desktop App                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Vue 3 Frontend                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │ Generation   │  │ Irys Upload  │  │ LSP8 Mint    │                       │
│  │ Components   │──▶│ Service      │──▶│ Service      │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
│         │                 │                 │                               │
│         ▼                 ▼                 ▼                               │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │                    useBonzaiNFT Composable                   │           │
│  │  - Orchestrates generation → upload → mint flow              │           │
│  │  - Handles tri-party attribution                             │           │
│  └──────────────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Flask Server   │   │     Irys        │   │  LUKSO Network  │
│  (Generation)   │   │   (Arweave)     │   │  (LSP8 + UP)    │
│                 │   │                 │   │                 │
│  /image         │   │  Permanent      │   │  BonzaiLSP8     │
│  /video         │   │  Storage +      │   │  Collection     │
│  /audio         │   │  Provenance     │   │  Contract       │
│  /3d            │   │  Proofs         │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

### Data Flow

```
1. User generates content (image/video/audio/3d)
         │
         ▼
2. Content + metadata uploaded to Irys
   - Returns: arweave://TX_ID
   - Includes: timestamp, signer, provenance tags
         │
         ▼
3. Generate deterministic tokenId
   - keccak256(prompt + model + timestamp + creator)
         │
         ▼
4. Mint LSP8 token on LUKSO
   - tokenId = content hash
   - LSP4Metadata = Irys receipt + attribution
         │
         ▼
5. Update creator's Universal Profile
   - LSP12 Issued Assets reference
```

---

## Core Components

### 1. Universal Profiles (LSP0 + LSP3)

Universal Profiles are smart contract accounts that combine:
- **LSP0**: ERC725Account (key-value store)
- **LSP3**: Profile Metadata (name, description, links, tags)

```javascript
// Universal Profile structure
{
  "LSP3Profile": {
    "name": "Alice.bonzai",
    "description": "AI artist using BonzAI",
    "tags": ["ai-art", "generative"],
    "links": [
      { "title": "Portfolio", "url": "https://alice.art" }
    ],
    "profileImage": [{ "url": "ipfs://...", "width": 400, "height": 400 }],
    "backgroundImage": [{ "url": "ipfs://..." }]
  }
}
```

### 2. LSP8 Identifiable Digital Asset

LSP8 is LUKSO's NFT standard with key differences from ERC-721:

| Feature | ERC-721 | LSP8 |
|---------|---------|------|
| tokenId | uint256 | bytes32 |
| metadata | static URI | dynamic key-value |
| operators | approve() | authorizeOperator() |
| hooks | none | universalReceiver() |

**Why bytes32 tokenId matters**: We can use content hashes as tokenIds for deterministic, collision-resistant identification.

### 3. Irys Provenance Layer

Irys (formerly Bundlr) provides:
- **Permanent storage** on Arweave
- **Cryptographic provenance** with signed receipts
- **Instant availability** (no confirmation wait)
- **Multi-token payment** (ETH, MATIC, SOL, AR)

```javascript
// Irys upload with provenance tags
const receipt = await irys.upload(data, {
  tags: [
    { name: "Content-Type", value: "image/png" },
    { name: "App-Name", value: "BonzAI" },
    { name: "App-Version", value: "1.0.0" },
    { name: "Model-ID", value: "flux-schnell" },
    { name: "Prompt-Hash", value: "0x..." },
    { name: "Creator", value: "0x..." },
    { name: "Timestamp", value: "1705500000000" }
  ]
});
// Returns: { id: "TX_ID", timestamp: 1705500000000, signature: "..." }
```

---

## Data Schemas

### LSP4Metadata with Irys Provenance

```json
{
  "LSP4Metadata": {
    "name": "BonzAI Genesis #1",
    "description": "AI-generated artwork created with FLUX model",
    "links": [
      {
        "title": "View on Arweave",
        "url": "https://arweave.net/{TX_ID}"
      }
    ],
    "icon": [
      {
        "width": 256,
        "height": 256,
        "url": "ar://{THUMBNAIL_TX_ID}",
        "verification": {
          "method": "keccak256(bytes)",
          "data": "0x..."
        }
      }
    ],
    "images": [
      [
        {
          "width": 1024,
          "height": 1024,
          "url": "ar://{TX_ID}",
          "verification": {
            "method": "keccak256(bytes)",
            "data": "0x..."
          }
        }
      ]
    ],
    "assets": [
      {
        "url": "ar://{TX_ID}",
        "fileType": "image/png",
        "verification": {
          "method": "keccak256(bytes)",
          "data": "0x..."
        }
      }
    ],
    "attributes": [
      { "key": "Model", "value": "FLUX Schnell", "type": "string" },
      { "key": "Generation Type", "value": "text-to-image", "type": "string" },
      { "key": "Steps", "value": 4, "type": "number" },
      { "key": "Guidance", "value": 3.5, "type": "number" },
      { "key": "Resolution", "value": "1024x1024", "type": "string" }
    ],

    "bonzaiProvenance": {
      "version": "1.0.0",
      "contentHash": "0x...",
      "promptHash": "0x...",

      "irys": {
        "transactionId": "TX_ID",
        "timestamp": 1705500000000,
        "signature": "...",
        "gateway": "https://arweave.net"
      },

      "generation": {
        "model": "black-forest-labs/FLUX.1-schnell",
        "modelVersion": "1.0.0",
        "parameters": {
          "steps": 4,
          "guidance_scale": 3.5,
          "width": 1024,
          "height": 1024,
          "seed": 12345
        },
        "timestamp": 1705500000000,
        "duration_ms": 2500
      },

      "attribution": {
        "creator": {
          "address": "0x...",
          "universalProfile": "0x...",
          "role": "prompter"
        },
        "platform": {
          "name": "BonzAI",
          "version": "1.0.0",
          "address": "0x...",
          "role": "orchestrator"
        },
        "inferenceNode": {
          "address": "0x...",
          "hardware": "NVIDIA RTX 4090",
          "role": "compute"
        }
      }
    }
  }
}
```

### TokenId Generation

```javascript
/**
 * Generate deterministic tokenId from content attributes
 * @returns {string} bytes32 hex string
 */
function generateTokenId({
  prompt,
  model,
  timestamp,
  creator,
  contentHash
}) {
  const packed = ethers.solidityPacked(
    ["string", "string", "uint256", "address", "bytes32"],
    [prompt, model, timestamp, creator, contentHash]
  );
  return ethers.keccak256(packed);
}
```

---

## Smart Contracts

### BonzaiLSP8Collection.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@lukso/lsp8-contracts/contracts/LSP8IdentifiableDigitalAsset.sol";
import "@lukso/lsp8-contracts/contracts/extensions/LSP8Enumerable.sol";
import "@lukso/lsp4-contracts/contracts/LSP4Constants.sol";

/**
 * @title BonzaiLSP8Collection
 * @notice LSP8 NFT collection for BonzAI AI-generated content
 * @dev Uses bytes32 tokenIds derived from content hashes for provenance
 */
contract BonzaiLSP8Collection is LSP8IdentifiableDigitalAsset, LSP8Enumerable {

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event ContentMinted(
        bytes32 indexed tokenId,
        address indexed creator,
        string irysTransactionId,
        string model,
        uint256 timestamp
    );

    event ProvenanceUpdated(
        bytes32 indexed tokenId,
        bytes32 newMetadataHash
    );

    // ═══════════════════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Platform fee recipient
    address public treasury;

    /// @notice Mint fee in native token (LYX)
    uint256 public mintFee;

    /// @notice Mapping of tokenId to Irys transaction ID
    mapping(bytes32 => string) public irysTransactionIds;

    /// @notice Mapping of tokenId to original creator
    mapping(bytes32 => address) public originalCreators;

    /// @notice Mapping of tokenId to creation timestamp
    mapping(bytes32 => uint256) public creationTimestamps;

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    constructor(
        string memory name_,
        string memory symbol_,
        address newOwner_,
        address treasury_,
        uint256 mintFee_
    )
        LSP8IdentifiableDigitalAsset(
            name_,
            symbol_,
            newOwner_,
            _LSP4_TOKEN_TYPE_NFT,  // 1 = NFT
            _LSP8_TOKENID_FORMAT_UNIQUE_ID  // 2 = Unique ID (hash)
        )
    {
        treasury = treasury_;
        mintFee = mintFee_;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MINTING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Mint a new AI-generated content NFT
     * @param to Recipient address (usually creator's Universal Profile)
     * @param tokenId bytes32 derived from content hash
     * @param irysTransactionId Arweave transaction ID from Irys upload
     * @param metadataURI URI pointing to LSP4Metadata JSON
     * @param force Allow minting to non-LSP1 receivers
     * @param data Additional data for universalReceiver hook
     */
    function mint(
        address to,
        bytes32 tokenId,
        string calldata irysTransactionId,
        string calldata model,
        bytes calldata metadataURI,
        bool force,
        bytes calldata data
    ) external payable {
        require(msg.value >= mintFee, "Insufficient mint fee");
        require(bytes(irysTransactionId).length > 0, "Irys TX ID required");
        require(!_exists(tokenId), "Token already exists");

        // Store provenance data
        irysTransactionIds[tokenId] = irysTransactionId;
        originalCreators[tokenId] = msg.sender;
        creationTimestamps[tokenId] = block.timestamp;

        // Mint the token
        _mint(to, tokenId, force, data);

        // Set token-specific metadata
        _setDataForTokenId(
            tokenId,
            _LSP4_METADATA_KEY,
            metadataURI
        );

        // Transfer fee to treasury
        if (msg.value > 0) {
            (bool success, ) = treasury.call{value: msg.value}("");
            require(success, "Fee transfer failed");
        }

        emit ContentMinted(tokenId, msg.sender, irysTransactionId, model, block.timestamp);
    }

    /**
     * @notice Batch mint multiple tokens
     */
    function mintBatch(
        address to,
        bytes32[] calldata tokenIds,
        string[] calldata irysTransactionIds_,
        string[] calldata models,
        bytes[] calldata metadataURIs,
        bool force,
        bytes calldata data
    ) external payable {
        require(tokenIds.length == irysTransactionIds_.length, "Length mismatch");
        require(tokenIds.length == metadataURIs.length, "Length mismatch");
        require(msg.value >= mintFee * tokenIds.length, "Insufficient mint fee");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            bytes32 tokenId = tokenIds[i];

            require(!_exists(tokenId), "Token already exists");

            irysTransactionIds[tokenId] = irysTransactionIds_[i];
            originalCreators[tokenId] = msg.sender;
            creationTimestamps[tokenId] = block.timestamp;

            _mint(to, tokenId, force, data);
            _setDataForTokenId(tokenId, _LSP4_METADATA_KEY, metadataURIs[i]);

            emit ContentMinted(tokenId, msg.sender, irysTransactionIds_[i], models[i], block.timestamp);
        }

        if (msg.value > 0) {
            (bool success, ) = treasury.call{value: msg.value}("");
            require(success, "Fee transfer failed");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROVENANCE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Get full provenance data for a token
     */
    function getProvenance(bytes32 tokenId) external view returns (
        string memory irysTransactionId,
        address originalCreator,
        uint256 creationTimestamp
    ) {
        require(_exists(tokenId), "Token does not exist");
        return (
            irysTransactionIds[tokenId],
            originalCreators[tokenId],
            creationTimestamps[tokenId]
        );
    }

    /**
     * @notice Verify a token's content hash matches its tokenId
     * @dev For clients to verify content authenticity
     */
    function verifyContentHash(
        bytes32 tokenId,
        string calldata prompt,
        string calldata model,
        uint256 timestamp,
        address creator,
        bytes32 contentHash
    ) external pure returns (bool) {
        bytes32 computedId = keccak256(abi.encodePacked(
            prompt,
            model,
            timestamp,
            creator,
            contentHash
        ));
        return computedId == tokenId;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    function setMintFee(uint256 newFee) external onlyOwner {
        mintFee = newFee;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // OVERRIDES
    // ═══════════════════════════════════════════════════════════════════════

    function _beforeTokenTransfer(
        address from,
        address to,
        bytes32 tokenId,
        bytes memory data
    ) internal virtual override(LSP8IdentifiableDigitalAsset, LSP8Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId, data);
    }
}
```

### Deployment Script

```javascript
// scripts/deploy-lsp8.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const BonzaiLSP8 = await ethers.getContractFactory("BonzaiLSP8Collection");

  const contract = await BonzaiLSP8.deploy(
    "BonzAI Creations",           // name
    "BONZAI",                     // symbol
    deployer.address,             // owner (can be multisig)
    "0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89", // treasury
    ethers.parseEther("0.01")     // mintFee (0.01 LYX)
  );

  await contract.waitForDeployment();
  console.log("BonzaiLSP8Collection deployed to:", await contract.getAddress());
}

main().catch(console.error);
```

---

## Frontend Services

### 1. irys.service.js

```javascript
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
  network: import.meta.env.VITE_IRYS_NETWORK || "devnet",
  token: "ethereum",  // Payment token

  // Irys nodes
  nodes: {
    devnet: "https://devnet.irys.xyz",
    mainnet: "https://node1.irys.xyz"
  },

  // Arweave gateways
  gateways: {
    primary: "https://arweave.net",
    backup: "https://gateway.irys.xyz"
  }
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
    wallet: { provider }
  });

  await irys.ready();
  irysInstance = irys;

  console.log(`[Irys] Connected to ${IRYS_CONFIG.network}`);
  console.log(`[Irys] Wallet: ${irys.address}`);
  console.log(`[Irys] Balance: ${irys.utils.fromAtomic(await irys.getLoadedBalance())} ETH`);

  return irys;
}

/**
 * Get or initialize Irys instance
 */
export async function getIrys(provider) {
  if (irysInstance) return irysInstance;
  return initIrys(provider);
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
  generation,
  attribution
}) {
  if (!irysInstance) throw new Error("Irys not initialized");

  // Build provenance tags
  const tags = [
    // Standard tags
    { name: "Content-Type", value: contentType },
    { name: "App-Name", value: "BonzAI" },
    { name: "App-Version", value: "1.0.0" },

    // Generation metadata
    { name: "Generation-Type", value: generation.type }, // text-to-image, image-to-video, etc.
    { name: "Model-ID", value: generation.model },
    { name: "Model-Version", value: generation.modelVersion || "1.0.0" },
    { name: "Prompt-Hash", value: generation.promptHash },
    { name: "Generation-Timestamp", value: String(generation.timestamp) },

    // Attribution
    { name: "Creator-Address", value: attribution.creator },
    { name: "Creator-UP", value: attribution.creatorUP || "" },
    { name: "Platform-Address", value: attribution.platform },
    { name: "Inference-Node", value: attribution.inferenceNode || "local" }
  ];

  // Add generation parameters as tags
  if (generation.parameters) {
    for (const [key, value] of Object.entries(generation.parameters)) {
      tags.push({
        name: `Param-${key}`,
        value: String(value)
      });
    }
  }

  // Upload with tags
  const receipt = await irysInstance.upload(data, { tags });

  console.log(`[Irys] Uploaded: ${receipt.id}`);
  console.log(`[Irys] URL: ${IRYS_CONFIG.gateways.primary}/${receipt.id}`);

  return {
    transactionId: receipt.id,
    timestamp: receipt.timestamp,
    signature: receipt.signature,
    url: `ar://${receipt.id}`,
    gatewayUrl: `${IRYS_CONFIG.gateways.primary}/${receipt.id}`,
    size: data.byteLength || data.length || data.size,
    tags
  };
}

/**
 * Upload metadata JSON
 */
export async function uploadMetadata(metadata) {
  const jsonString = JSON.stringify(metadata, null, 2);
  const data = new TextEncoder().encode(jsonString);

  return uploadContent({
    data,
    contentType: "application/json",
    generation: metadata.bonzaiProvenance?.generation || {},
    attribution: metadata.bonzaiProvenance?.attribution || {}
  });
}

/**
 * Upload file from path (Electron only)
 */
export async function uploadFile(filePath, generation, attribution) {
  const fs = window.require?.("fs");
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
    gltf: "model/gltf+json"
  };

  return uploadContent({
    data,
    contentType: contentTypes[ext] || "application/octet-stream",
    generation,
    attribution
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

  // Fetch transaction metadata from Irys GraphQL
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
      `
    })
  });

  const metaData = await metaResponse.json();
  const tx = metaData.data?.transaction;

  return {
    content: await response.blob(),
    provenance: {
      transactionId: tx.id,
      owner: tx.owner.address,
      timestamp: tx.block?.timestamp,
      tags: tx.tags.reduce((acc, t) => ({ ...acc, [t.name]: t.value }), {})
    }
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

  // Funding
  getBalance,
  fund,
  estimateCost,

  // Upload
  uploadContent,
  uploadMetadata,
  uploadFile,

  // Retrieval
  fetchContent,
  fetchWithProvenance,
  verifyContentIntegrity,

  // Config
  config: IRYS_CONFIG
};

export default irysService;
```

### 2. lukso.service.js

```javascript
/**
 * LUKSO Service - Universal Profiles and LSP8 NFTs
 *
 * Handles Universal Profile connections and LSP8 minting on LUKSO
 */

import { ethers } from "ethers";
import ERC725 from "@erc725/erc725.js";
import LSP3ProfileSchema from "@erc725/erc725.js/schemas/LSP3ProfileMetadata.json";
import LSP4Schema from "@erc725/erc725.js/schemas/LSP4DigitalAsset.json";
import UniversalProfile from "@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json";
import LSP8 from "@lukso/lsp-smart-contracts/artifacts/LSP8IdentifiableDigitalAsset.json";

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
      currency: { name: "LYX", symbol: "LYX", decimals: 18 }
    },
    testnet: {
      chainId: 4201,
      chainIdHex: "0x1069",
      name: "LUKSO Testnet",
      rpc: "https://rpc.testnet.lukso.gateway.fm",
      explorer: "https://explorer.execution.testnet.lukso.network",
      currency: { name: "LYXt", symbol: "LYXt", decimals: 18 }
    }
  },

  // BonzAI LSP8 Collection contract
  // TODO: Update after deployment
  lsp8Collection: {
    mainnet: "0x0000000000000000000000000000000000000000",
    testnet: "0x0000000000000000000000000000000000000000"
  },

  // Default network
  defaultNetwork: import.meta.env.VITE_LUKSO_NETWORK || "testnet"
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = {
  isConnected: false,
  address: null,
  universalProfile: null,
  profileData: null,
  chainId: null,
  provider: null,
  signer: null
};

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get LUKSO provider from Universal Profile Extension or WalletConnect
 */
async function getProvider() {
  // Check for UP Browser Extension
  if (window.lukso) {
    return window.lukso;
  }

  // Fallback to WalletConnect (would need separate implementation)
  // For now, require UP Extension
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
    const luksoProvider = await getProvider();

    // Request accounts
    const accounts = await luksoProvider.request({
      method: "eth_requestAccounts"
    });

    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found");
    }

    // The returned address is the Universal Profile address
    const upAddress = accounts[0];

    // Create ethers provider
    state.provider = new ethers.BrowserProvider(luksoProvider);
    state.signer = await state.provider.getSigner();

    // Get network
    const network = await state.provider.getNetwork();
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

    return {
      address: upAddress,
      profile: state.profileData,
      chainId: state.chainId
    };
  } catch (error) {
    console.error("[LUKSO] Connection failed:", error);
    throw error;
  }
}

/**
 * Switch wallet to LUKSO network
 */
async function switchToLukso() {
  const network = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork];
  const luksoProvider = await getProvider();

  try {
    await luksoProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainIdHex }]
    });
  } catch (switchError) {
    // Chain not added, add it
    if (switchError.code === 4902) {
      await luksoProvider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: network.chainIdHex,
          chainName: network.name,
          nativeCurrency: network.currency,
          rpcUrls: [network.rpc],
          blockExplorerUrls: [network.explorer]
        }]
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
  state.provider = null;
  state.signer = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL PROFILE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch Universal Profile data using ERC725.js
 */
export async function fetchProfileData(address) {
  const network = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork];

  const erc725 = new ERC725(
    LSP3ProfileSchema,
    address,
    network.rpc,
    { ipfsGateway: "https://api.universalprofile.cloud/ipfs" }
  );

  try {
    const data = await erc725.fetchData("LSP3Profile");
    return data?.value?.LSP3Profile || null;
  } catch (error) {
    console.warn("[LUKSO] Failed to fetch profile:", error);
    return null;
  }
}

/**
 * Check if address is a Universal Profile
 */
export async function isUniversalProfile(address) {
  if (!state.provider) return false;

  try {
    const up = new ethers.Contract(address, UniversalProfile.abi, state.provider);
    // Check for LSP0 ERC725Account interface
    const supportsInterface = await up.supportsInterface("0x63cb749b");
    return supportsInterface;
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
  if (!state.signer) throw new Error("Not connected to LUKSO");

  const address = LUKSO_CONFIG.lsp8Collection[LUKSO_CONFIG.defaultNetwork];
  if (address === "0x0000000000000000000000000000000000000000") {
    throw new Error("LSP8 Collection not deployed yet");
  }

  // Use custom ABI that includes our mint function
  const abi = [
    ...LSP8.abi,
    "function mint(address to, bytes32 tokenId, string calldata irysTransactionId, string calldata model, bytes calldata metadataURI, bool force, bytes calldata data) external payable",
    "function mintFee() view returns (uint256)",
    "function getProvenance(bytes32 tokenId) view returns (string irysTransactionId, address originalCreator, uint256 creationTimestamp)",
    "event ContentMinted(bytes32 indexed tokenId, address indexed creator, string irysTransactionId, string model, uint256 timestamp)"
  ];

  return new ethers.Contract(address, abi, state.signer);
}

/**
 * Generate deterministic tokenId from content
 */
export function generateTokenId({
  prompt,
  model,
  timestamp,
  creator,
  contentHash
}) {
  const packed = ethers.solidityPacked(
    ["string", "string", "uint256", "address", "bytes32"],
    [prompt, model, timestamp, creator, contentHash]
  );
  return ethers.keccak256(packed);
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
export async function mint({
  irysTransactionId,
  model,
  metadataUri,
  tokenId,
  to = null
}) {
  const contract = getLSP8Contract();

  // Get mint fee
  const mintFee = await contract.mintFee();

  // Recipient defaults to connected UP
  const recipient = to || state.universalProfile;

  // Encode metadata URI as bytes
  const metadataBytes = ethers.toUtf8Bytes(metadataUri);

  // Mint transaction
  const tx = await contract.mint(
    recipient,
    tokenId,
    irysTransactionId,
    model,
    metadataBytes,
    true,  // force (allow minting to non-LSP1 receivers)
    "0x", // additional data
    { value: mintFee }
  );

  const receipt = await tx.wait();

  // Parse ContentMinted event
  const event = receipt.logs.find(log => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed.name === "ContentMinted";
    } catch {
      return false;
    }
  });

  return {
    transactionHash: receipt.hash,
    tokenId,
    irysTransactionId,
    creator: state.address,
    timestamp: event ? Number(event.args.timestamp) : Date.now(),
    explorerUrl: `${LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork].explorer}/tx/${receipt.hash}`
  };
}

/**
 * Get provenance data for a minted token
 */
export async function getProvenance(tokenId) {
  const contract = getLSP8Contract();
  const [irysTransactionId, originalCreator, creationTimestamp] =
    await contract.getProvenance(tokenId);

  return {
    irysTransactionId,
    originalCreator,
    creationTimestamp: Number(creationTimestamp)
  };
}

/**
 * Get token metadata
 */
export async function getTokenMetadata(tokenId) {
  const contract = getLSP8Contract();
  const network = LUKSO_CONFIG.networks[LUKSO_CONFIG.defaultNetwork];

  // Use ERC725 to decode LSP4 metadata
  const erc725 = new ERC725(
    LSP4Schema,
    await contract.getAddress(),
    network.rpc
  );

  const data = await erc725.fetchData([
    { keyName: "LSP4Metadata", tokenId }
  ]);

  return data[0]?.value;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════

function setupEventListeners(provider) {
  provider.on("accountsChanged", async (accounts) => {
    if (accounts.length === 0) {
      disconnect();
    } else {
      state.address = accounts[0];
      state.universalProfile = accounts[0];
      state.profileData = await fetchProfileData(accounts[0]);
    }
  });

  provider.on("chainChanged", (chainId) => {
    state.chainId = parseInt(chainId, 16);
    // Optionally warn if wrong network
  });

  provider.on("disconnect", () => {
    disconnect();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const luksoService = {
  // State (readonly)
  get state() {
    return { ...state };
  },

  // Connection
  connect,
  disconnect,
  switchToLukso,

  // Universal Profile
  fetchProfileData,
  isUniversalProfile,

  // LSP8
  generateTokenId,
  mint,
  getProvenance,
  getTokenMetadata,

  // Config
  config: LUKSO_CONFIG
};

export default luksoService;
```

### 3. useBonzaiNFT.js (Composable)

```javascript
/**
 * useBonzaiNFT Composable
 *
 * Orchestrates the full flow: Generation → Irys Upload → LSP8 Mint
 */

import { ref, computed, reactive } from "vue";
import { ethers } from "ethers";
import { irysService } from "../services/irys.service.js";
import { luksoService } from "../services/lukso.service.js";

export function useBonzaiNFT() {
  // ═══════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════

  const status = ref("idle"); // idle | uploading | minting | complete | error
  const progress = reactive({
    stage: "",
    percent: 0,
    message: ""
  });
  const error = ref(null);
  const result = ref(null);

  // ═══════════════════════════════════════════════════════════════════════
  // COMPUTED
  // ═══════════════════════════════════════════════════════════════════════

  const isProcessing = computed(() =>
    ["uploading", "minting"].includes(status.value)
  );

  const isComplete = computed(() => status.value === "complete");
  const hasError = computed(() => status.value === "error");

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
  function hashContent(data) {
    if (data instanceof Blob) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const hash = ethers.keccak256(new Uint8Array(reader.result));
          resolve(hash);
        };
        reader.readAsArrayBuffer(data);
      });
    }
    return ethers.keccak256(data);
  }

  /**
   * Generate prompt hash
   */
  function hashPrompt(prompt) {
    return ethers.keccak256(ethers.toUtf8Bytes(prompt));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN FLOW
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Tokenize AI-generated content
   *
   * @param {Object} params
   * @param {Blob|Buffer|Uint8Array} params.content - Generated content
   * @param {string} params.contentType - MIME type
   * @param {string} params.prompt - Original prompt
   * @param {Object} params.generation - Generation metadata
   * @param {string} params.title - NFT title
   * @param {string} params.description - NFT description
   * @returns {Object} Minting result with URLs and token info
   */
  async function tokenize({
    content,
    contentType,
    prompt,
    generation,
    title,
    description
  }) {
    reset();

    try {
      // ─────────────────────────────────────────────────────────────────
      // VALIDATION
      // ─────────────────────────────────────────────────────────────────

      if (!luksoService.state.isConnected) {
        throw new Error("Please connect your Universal Profile first");
      }

      // ─────────────────────────────────────────────────────────────────
      // STAGE 1: UPLOAD CONTENT TO IRYS
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
        inferenceNode: "local" // Could be remote node address for P2P inference
      };

      // Prepare generation metadata
      const genMetadata = {
        type: generation.type, // text-to-image, etc.
        model: generation.model,
        modelVersion: generation.modelVersion || "1.0.0",
        promptHash,
        timestamp,
        parameters: generation.parameters || {}
      };

      updateProgress("upload", 20, "Uploading content to Arweave...");

      // Upload content
      const contentReceipt = await irysService.uploadContent({
        data: content,
        contentType,
        generation: genMetadata,
        attribution
      });

      updateProgress("upload", 50, "Uploading metadata...");

      // ─────────────────────────────────────────────────────────────────
      // STAGE 2: BUILD & UPLOAD LSP4 METADATA
      // ─────────────────────────────────────────────────────────────────

      // Build LSP4Metadata with Irys provenance
      const lsp4Metadata = {
        LSP4Metadata: {
          name: title,
          description,
          links: [
            {
              title: "View on Arweave",
              url: contentReceipt.gatewayUrl
            }
          ],
          assets: [
            {
              url: contentReceipt.url, // ar://TX_ID
              fileType: contentType,
              verification: {
                method: "keccak256(bytes)",
                data: contentHash
              }
            }
          ],
          attributes: [
            { key: "Model", value: generation.model, type: "string" },
            { key: "Generation Type", value: generation.type, type: "string" },
            ...Object.entries(generation.parameters || {}).map(([k, v]) => ({
              key: k,
              value: v,
              type: typeof v
            }))
          ],

          // BonzAI-specific provenance extension
          bonzaiProvenance: {
            version: "1.0.0",
            contentHash,
            promptHash,

            irys: {
              transactionId: contentReceipt.transactionId,
              timestamp: contentReceipt.timestamp,
              signature: contentReceipt.signature,
              gateway: "https://arweave.net"
            },

            generation: {
              model: generation.model,
              modelVersion: generation.modelVersion || "1.0.0",
              parameters: generation.parameters || {},
              timestamp,
              prompt // Store full prompt for provenance
            },

            attribution: {
              creator: {
                address: attribution.creator,
                universalProfile: attribution.creatorUP,
                role: "prompter"
              },
              platform: {
                name: "BonzAI",
                version: "1.0.0",
                address: attribution.platform,
                role: "orchestrator"
              },
              inferenceNode: {
                address: attribution.inferenceNode,
                role: "compute"
              }
            }
          }
        }
      };

      // Upload metadata JSON
      const metadataReceipt = await irysService.uploadMetadata(lsp4Metadata);

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
        contentHash
      });

      updateProgress("mint", 80, "Please confirm the transaction in your wallet...");

      // Mint on LUKSO
      const mintResult = await luksoService.mint({
        irysTransactionId: contentReceipt.transactionId,
        model: generation.model,
        metadataUri: metadataReceipt.url, // ar://TX_ID
        tokenId
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

        // Irys receipts
        irys: {
          content: contentReceipt,
          metadata: metadataReceipt
        },

        // Provenance
        provenance: {
          contentHash,
          promptHash,
          timestamp,
          creator: attribution.creator,
          model: generation.model
        }
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
  // VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Verify a tokenized content's provenance
   */
  async function verify(tokenId) {
    try {
      // Get on-chain provenance
      const onChain = await luksoService.getProvenance(tokenId);

      // Get token metadata
      const metadata = await luksoService.getTokenMetadata(tokenId);

      // Fetch from Irys and verify hash
      const { content, provenance: irysProvenance } =
        await irysService.fetchWithProvenance(onChain.irysTransactionId);

      // Verify content hash
      const contentHash = await hashContent(content);
      const expectedHash = metadata?.LSP4Metadata?.bonzaiProvenance?.contentHash;
      const hashMatch = contentHash === expectedHash;

      return {
        valid: hashMatch,
        onChain,
        irysProvenance,
        metadata,
        contentHash,
        hashMatch
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

    // Actions
    tokenize,
    verify,
    reset
  };
}

export default useBonzaiNFT;
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Deliverables:**
- [ ] Install dependencies (`@irys/sdk`, `@lukso/lsp-smart-contracts`, `@erc725/erc725.js`)
- [ ] Create `irys.service.js` with upload functionality
- [ ] Create `lukso.service.js` with UP connection
- [ ] Test Irys uploads on devnet
- [ ] Test LUKSO connection with UP Extension

**Testing:**
```bash
# Install deps
npm install @irys/sdk @lukso/lsp-smart-contracts @erc725/erc725.js ethers

# Test Irys upload (devnet)
node -e "
  const { WebIrys } = require('@irys/sdk');
  // ... test upload
"
```

### Phase 2: Smart Contract (Week 3-4)

**Deliverables:**
- [ ] Write `BonzaiLSP8Collection.sol`
- [ ] Write deployment script
- [ ] Deploy to LUKSO Testnet
- [ ] Verify contract on explorer
- [ ] Test minting flow

**Commands:**
```bash
# Install Hardhat + LUKSO tools
npm install --save-dev hardhat @lukso/lsp-smart-contracts

# Compile
npx hardhat compile

# Deploy to testnet
npx hardhat run scripts/deploy-lsp8.js --network luksoTestnet

# Verify
npx hardhat verify --network luksoTestnet <CONTRACT_ADDRESS> "BonzAI Creations" "BONZAI" <OWNER> <TREASURY> "10000000000000000"
```

### Phase 3: Integration (Week 5-6)

**Deliverables:**
- [ ] Create `useBonzaiNFT.js` composable
- [ ] Integrate into generation components (GenerativeImage, GenerativeVideo, etc.)
- [ ] Add "Mint as NFT" button to output panels
- [ ] Implement progress UI
- [ ] Handle errors gracefully

**UI Flow:**
```
[Generate Content] → [Preview] → [Mint as NFT]
                                      ↓
                              [Uploading to Arweave...]
                                      ↓
                              [Minting on LUKSO...]
                                      ↓
                              [Success! View NFT]
```

### Phase 4: Mainnet Launch (Week 7-8)

**Deliverables:**
- [ ] Audit smart contract
- [ ] Deploy to LUKSO Mainnet
- [ ] Switch Irys to mainnet
- [ ] Fund Irys node with ETH
- [ ] Update config with mainnet addresses
- [ ] Launch announcement

**Pre-launch Checklist:**
- [ ] Contract owner is multisig
- [ ] Treasury address is correct
- [ ] Mint fee is reasonable (0.01-0.1 LYX)
- [ ] Irys balance sufficient for initial uploads
- [ ] Error handling tested for all failure modes

### Phase 5: Enhancements (Week 9+)

**Optional Features:**
- [ ] Batch minting (multiple outputs → single transaction)
- [ ] Lazy minting (mint on first transfer/sale)
- [ ] Collection pages (view all BonzAI NFTs)
- [ ] Royalties via LSP8 operators
- [ ] Cross-chain bridging (LUKSO ↔ Ethereum)
- [ ] P2P inference attribution (pay compute providers)

---

## Cost Estimates

### LUKSO (LYX)

| Operation | Gas (approx) | Cost @ 0.001 LYX/gas |
|-----------|--------------|----------------------|
| Deploy LSP8 | ~3M | ~3 LYX |
| Mint single | ~200K | ~0.2 LYX |
| Batch mint (10) | ~1M | ~1 LYX |
| Set metadata | ~50K | ~0.05 LYX |

**Platform mint fee:** 0.01-0.1 LYX recommended

### Irys (Arweave)

| Size | Cost (approx) |
|------|---------------|
| 1 MB | ~$0.0001 |
| 10 MB | ~$0.001 |
| 100 MB | ~$0.01 |
| 1 GB | ~$0.10 |

**Irys is extremely cheap** - permanent storage costs are negligible for typical AI outputs.

### Total Per Mint

| Component | Cost |
|-----------|------|
| Content upload (5MB avg) | ~$0.0005 |
| Metadata upload (5KB) | ~$0.00001 |
| LSP8 mint | ~0.2 LYX (~$0.30) |
| **Total** | **~$0.30** |

---

## Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VERIFICATION FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User provides tokenId (bytes32)                                         │
│           │                                                                 │
│           ▼                                                                 │
│  2. Fetch on-chain provenance from LSP8 contract                            │
│     - irysTransactionId                                                     │
│     - originalCreator                                                       │
│     - creationTimestamp                                                     │
│           │                                                                 │
│           ▼                                                                 │
│  3. Fetch token metadata (LSP4)                                             │
│     - Expected contentHash                                                  │
│     - Expected promptHash                                                   │
│     - bonzaiProvenance object                                               │
│           │                                                                 │
│           ▼                                                                 │
│  4. Fetch content from Irys/Arweave                                         │
│     - Raw content bytes                                                     │
│     - Irys tags (provenance proof)                                          │
│           │                                                                 │
│           ▼                                                                 │
│  5. Compute keccak256(content)                                              │
│           │                                                                 │
│           ▼                                                                 │
│  6. Compare computed hash with expected                                     │
│     - Match → ✅ Content is authentic                                       │
│     - Mismatch → ❌ Content tampered                                        │
│           │                                                                 │
│           ▼                                                                 │
│  7. Return verification result                                              │
│     {                                                                       │
│       valid: true/false,                                                    │
│       contentHash,                                                          │
│       onChainData,                                                          │
│       irysProvenance                                                        │
│     }                                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Dependencies

### npm packages

```json
{
  "dependencies": {
    "@irys/sdk": "^0.2.0",
    "@lukso/lsp-smart-contracts": "^0.14.0",
    "@erc725/erc725.js": "^0.23.0",
    "ethers": "^6.9.0"
  },
  "devDependencies": {
    "hardhat": "^2.19.0",
    "@nomicfoundation/hardhat-toolbox": "^4.0.0"
  }
}
```

### Environment Variables

```env
# Irys
VITE_IRYS_NETWORK=devnet  # or "mainnet"

# LUKSO
VITE_LUKSO_NETWORK=testnet  # or "mainnet"
VITE_LUKSO_LSP8_MAINNET=0x...
VITE_LUKSO_LSP8_TESTNET=0x...

# WalletConnect (for non-extension wallets)
VITE_WALLETCONNECT_PROJECT_ID=...
```

---

## References

- [LUKSO Documentation](https://docs.lukso.tech/)
- [LSP8 Standard](https://docs.lukso.tech/standards/tokens/LSP8-Identifiable-Digital-Asset)
- [LSP4 Metadata](https://docs.lukso.tech/standards/tokens/LSP4-Digital-Asset-Metadata)
- [Universal Profiles](https://docs.lukso.tech/standards/universal-profile/introduction)
- [Irys Documentation](https://docs.irys.xyz/)
- [Arweave Gateway](https://arweave.net/)
- [ERC725.js](https://docs.lukso.tech/tools/erc725js/getting-started)

---

*Last updated: January 2026*
*Version: 1.0.0*
