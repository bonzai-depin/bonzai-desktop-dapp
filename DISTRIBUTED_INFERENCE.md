# BonzAI Distributed Inference Architecture

## Overview

BonzAI nodes can operate as both **consumers** (requesting inference) and **providers** (serving inference). Providers earn USDC via the x402 payment protocol.

**Architecture:**
- **Arbitrum**: Smart contract for provider registry, access control, payments
- **libp2p**: P2P networking layer for discovery, connectivity, NAT traversal

**Key Principles:**
- No staking required - access levels determine provider capabilities
- Pipeline-based routing (consumers request capabilities, not specific models)
- Zero-knowledge provider model (no data stored on provider unless local)
- Fully decentralized - no company-owned relay infrastructure
- Automatic NAT traversal via libp2p relay network

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Access Level Gating](#access-level-gating)
3. [P2P Networking Layer (libp2p)](#p2p-networking-layer-libp2p)
4. [Relay Incentive Model](#relay-incentive-model)
5. [Smart Contract Registry](#smart-contract-registry)
6. [x402 Payment Protocol](#x402-payment-protocol)
7. [OpenClaw API Gateway](#openclaw-api-gateway)
8. [Zero-Knowledge Provider Model](#zero-knowledge-provider-model)
9. [Pipeline-Based Routing](#pipeline-based-routing)
10. [Consumer/Provider Toggle](#consumerprovider-toggle)
11. [Implementation Roadmap](#implementation-roadmap)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BONZAI DISTRIBUTED NETWORK                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                         ┌─────────────────────┐                             │
│                         │   Arbitrum Chain    │                             │
│                         │  ┌───────────────┐  │                             │
│                         │  │BonzAINetwork  │  │                             │
│                         │  │- Registry     │  │                             │
│                         │  │- Payments     │  │                             │
│                         │  │- Access Lvls  │  │                             │
│                         │  └───────────────┘  │                             │
│                         └──────────┬──────────┘                             │
│                                    │                                         │
│                          Register/Query/Pay                                  │
│                                    │                                         │
│    ┌───────────────────────────────┼───────────────────────────────┐        │
│    │                               │                               │        │
│    ▼                               ▼                               ▼        │
│ ┌──────────────┐            ┌──────────────┐            ┌──────────────┐   │
│ │  Provider A  │◄──────────►│  Provider B  │◄──────────►│  Provider C  │   │
│ │ (Public IP)  │   libp2p   │ (Behind NAT) │   libp2p   │ (Public IP)  │   │
│ │              │            │              │            │              │   │
│ │ isRelay=true │───────────►│ Uses relay   │◄───────────│ isRelay=true │   │
│ └──────────────┘   relays   └──────────────┘   relays   └──────────────┘   │
│        ▲                           ▲                           ▲            │
│        │                           │                           │            │
│        └───────────────────────────┼───────────────────────────┘            │
│                                    │                                         │
│                              libp2p DHT                                      │
│                         (Distributed Discovery)                              │
│                                    │                                         │
│                                    ▼                                         │
│                           ┌──────────────┐                                  │
│                           │   Consumer   │                                  │
│                           │  1. Query    │                                  │
│                           │  2. Dial     │                                  │
│                           │  3. Infer    │                                  │
│                           │  4. Pay      │                                  │
│                           └──────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Access Level Gating

Providers don't stake BONZAI. Instead, their **existing access level** determines which pipelines they can offer remotely. This leverages the existing BonzaiLevelRegistry contract.

### Access Levels → Provider Capabilities

| Level | BONZAI Required | Pipelines Allowed |
|-------|-----------------|-------------------|
| LVL1 | 100 | `llm_*` (basic models only) |
| LVL2 | 1,000 | LVL1 + `image_turbo`, `audio` |
| LVL3 | 10,000 | LVL2 + `image_quality`, `audio_turbo`, `video_fast` |
| LVL4 | 100,000 | LVL3 + `image_advanced`, `audio_quality`, `vision` |
| LVL5 | 1,000,000 | All pipelines |
| LVL∞ | NFT Pass | All pipelines (same as LVL5) |

---

## P2P Networking Layer (libp2p)

### Why libp2p?

libp2p provides decentralized networking primitives without requiring company infrastructure:

| Feature | How libp2p Handles It |
|---------|----------------------|
| **Peer Identity** | Cryptographic peer IDs (derived from keypair) |
| **Discovery** | Kademlia DHT - no central server |
| **NAT Traversal** | Hole-punching + Circuit Relay v2 |
| **Encryption** | Noise protocol (end-to-end) |
| **Multiplexing** | Multiple streams over single connection |

### Peer ID vs URL

Instead of registering a URL, providers register a **libp2p peer ID**:

```
Before: "https://my-server.com:3002"     ← Requires public IP, port forwarding
After:  "QmYx7eFzK...n3kF3n"            ← Works behind any NAT
```

### Connection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONNECTION FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Consumer                              Provider (behind NAT)                 │
│     │                                         │                              │
│     │  1. Query Arbitrum contract             │                              │
│     │     getProvidersForPipeline()           │                              │
│     │     → Returns peerId: "Qm456..."        │                              │
│     │                                         │                              │
│     │  2. libp2p.dial("Qm456...")             │                              │
│     │                                         │                              │
│     │  3. libp2p attempts:                    │                              │
│     │     a) Direct connection (fails - NAT)  │                              │
│     │     b) Hole-punch via DCUtR             │                              │
│     │     c) Circuit relay via "Qm123..."     │                              │
│     │        (public IP provider)             │                              │
│     │                                         │                              │
│     │  4. Connection established              │                              │
│     │     (encrypted, multiplexed)            │                              │
│     │◄───────────────────────────────────────►│                              │
│     │                                         │                              │
│     │  5. Open stream: /bonzai/v1/inference   │                              │
│     │──────────────────────────────────────────►                             │
│     │                                         │                              │
│     │  6. Send request + x402 payment auth    │                              │
│     │──────────────────────────────────────────►                             │
│     │                                         │                              │
│     │  7. Receive inference result            │                              │
│     │◄──────────────────────────────────────────                             │
│     │                                         │                              │
│     │  8. Provider claims payment on-chain    │                              │
│     │                                         │                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### libp2p Integration

```javascript
// src/services/libp2p.service.js

import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { webSockets } from '@libp2p/websocket';
import { webRTC } from '@libp2p/webrtc';
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { kadDHT } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';

// Bootstrap nodes (other BonzAI providers with public IPs)
// These are discovered dynamically from the contract
const BOOTSTRAP_NODES = [];

export async function createBonzaiNode(options = {}) {
  const { isRelay = false } = options;

  const services = {
    identify: identify(),
    dht: kadDHT({
      clientMode: false,  // Full DHT participation
    }),
  };

  // If provider opts to be a relay, enable relay server
  if (isRelay) {
    services.relay = circuitRelayServer({
      reservations: {
        maxReservations: 128,  // Max simultaneous relay clients
      },
    });
  }

  const node = await createLibp2p({
    transports: [
      webSockets(),
      webRTC(),
      circuitRelayTransport({
        discoverRelays: 1,  // Auto-discover relay nodes
      }),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [
      bootstrap({ list: BOOTSTRAP_NODES }),
    ],
    services,
  });

  await node.start();
  console.log(`[libp2p] Started with peer ID: ${node.peerId.toString()}`);
  console.log(`[libp2p] Listening on:`, node.getMultiaddrs().map(ma => ma.toString()));

  return node;
}

// Protocol handler for inference requests
export function registerInferenceProtocol(node, handler) {
  node.handle('/bonzai/v1/inference', async ({ stream, connection }) => {
    const remotePeer = connection.remotePeer.toString();
    console.log(`[libp2p] Inference request from ${remotePeer}`);

    // Read request
    const chunks = [];
    for await (const chunk of stream.source) {
      chunks.push(chunk);
    }
    const request = JSON.parse(Buffer.concat(chunks).toString());

    // Handle inference
    const response = await handler(request, remotePeer);

    // Write response
    await stream.sink([Buffer.from(JSON.stringify(response))]);
  });
}
```

---

## Relay Incentive Model

Providers with public IPs can opt-in to relay traffic for NAT'd providers. They earn a percentage of the relayed inference fees.

### Fee Distribution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FEE DISTRIBUTION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Consumer pays: $1.00 USDC for inference                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  SCENARIO A: Direct connection (provider has public IP)            │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ Protocol Fee (2.5%)     │ $0.025  → Protocol Treasury       │   │    │
│  │  │ Provider Fee (97.5%)    │ $0.975  → Provider                │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  │  SCENARIO B: Relayed connection (provider behind NAT)              │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ Protocol Fee (2.5%)     │ $0.025  → Protocol Treasury       │   │    │
│  │  │ Relay Fee (5%)          │ $0.050  → Relay Provider          │   │    │
│  │  │ Provider Fee (92.5%)    │ $0.925  → Inference Provider      │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Relay fee is configurable (default 5%, range 1-10%)                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Relay?

| Benefit | Description |
|---------|-------------|
| **Passive Income** | Earn fees by simply having a public IP |
| **Network Health** | More relays = better connectivity for everyone |
| **No Extra Hardware** | Same BonzAI node, just a toggle |
| **Low Overhead** | Relay traffic is lightweight (just forwarding) |

### Relay Registration

```solidity
struct Provider {
    address owner;
    string peerId;              // libp2p peer ID
    string[] pipelines;
    uint256 pricePerToken;
    uint256 totalEarnings;
    uint256 successfulJobs;
    uint256 failedJobs;
    uint64 registeredAt;
    bool active;

    // Relay fields
    bool isRelay;               // Opt-in to relay traffic
    uint256 relayFeeBps;        // Relay fee in basis points (500 = 5%)
    uint256 relayEarnings;      // Lifetime relay earnings
    uint256 relayedJobs;        // Count of relayed inferences
}
```

### Payment Flow with Relay

```solidity
function processPayment(
    bytes32 providerId,
    bytes32 relayProviderId,    // Zero if direct connection
    address consumer,
    uint256 amount,
    // ... ERC-3009 fields
) external {
    Provider storage provider = providers[providerId];
    require(provider.owner == msg.sender, "Not provider");

    // Execute transfer from consumer
    usdc.transferWithAuthorization(...);

    // Calculate fees
    uint256 protocolFee = (amount * protocolFeeBps) / 10000;
    uint256 remaining = amount - protocolFee;

    uint256 relayFee = 0;
    if (relayProviderId != bytes32(0)) {
        Provider storage relay = providers[relayProviderId];
        require(relay.isRelay, "Not a relay");
        relayFee = (remaining * relay.relayFeeBps) / 10000;

        // Pay relay
        IERC20(address(usdc)).transfer(relay.owner, relayFee);
        relay.relayEarnings += relayFee;
        relay.relayedJobs++;

        remaining -= relayFee;
    }

    // Pay provider
    IERC20(address(usdc)).transfer(provider.owner, remaining);
    provider.totalEarnings += remaining;
    provider.successfulJobs++;

    // Pay protocol
    IERC20(address(usdc)).transfer(protocolFeeRecipient, protocolFee);

    emit PaymentProcessed(providerId, relayProviderId, consumer, amount, protocolFee, relayFee);
}
```

---

## Smart Contract Registry

### Contract: `BonzAINetwork` (Arbitrum)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IBonzaiLevelRegistry {
    function getLevel(address user) external view returns (uint8);
}

contract BonzAINetwork is Ownable {

    // ═══════════════════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════════════════

    struct Provider {
        address owner;
        string peerId;              // libp2p peer ID (e.g., "QmYx7...")
        string[] pipelines;
        uint256 pricePerToken;      // USDC per 1K tokens (6 decimals)
        uint256 totalEarnings;
        uint256 successfulJobs;
        uint256 failedJobs;
        uint64 registeredAt;
        bool active;

        // Relay
        bool isRelay;
        uint256 relayFeeBps;        // e.g., 500 = 5%
        uint256 relayEarnings;
        uint256 relayedJobs;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    IERC3009 public immutable usdc;
    IBonzaiLevelRegistry public immutable levelRegistry;

    uint256 public protocolFeeBps = 250;        // 2.5%
    uint256 public minRelayFeeBps = 100;        // 1% minimum
    uint256 public maxRelayFeeBps = 1000;       // 10% maximum
    address public protocolFeeRecipient;

    mapping(string => uint8) public pipelineMinLevel;
    mapping(bytes32 => Provider) public providers;
    mapping(address => bytes32) public providerByOwner;
    mapping(string => bytes32[]) public providersByPipeline;
    bytes32[] public allProviderIds;
    bytes32[] public relayProviderIds;          // Providers that can relay

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    event ProviderRegistered(bytes32 indexed providerId, address indexed owner, string peerId, bool isRelay);
    event ProviderUpdated(bytes32 indexed providerId, string peerId, string[] pipelines);
    event RelayStatusChanged(bytes32 indexed providerId, bool isRelay, uint256 relayFeeBps);
    event PaymentProcessed(
        bytes32 indexed providerId,
        bytes32 indexed relayProviderId,
        address indexed consumer,
        uint256 amount,
        uint256 protocolFee,
        uint256 relayFee
    );

    // ═══════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════

    constructor(
        address _usdc,
        address _levelRegistry,
        address _feeRecipient
    ) Ownable(msg.sender) {
        usdc = IERC3009(_usdc);
        levelRegistry = IBonzaiLevelRegistry(_levelRegistry);
        protocolFeeRecipient = _feeRecipient;

        // Initialize pipeline levels (LVL 1-4)
        _initPipelineLevels();
    }

    function _initPipelineLevels() internal {
        // LVL 1: Basic LLMs
        pipelineMinLevel["llm_llama_3_1_8b"] = 1;
        pipelineMinLevel["llm_hermes_4_14b"] = 1;
        pipelineMinLevel["llm_mythomax_13b"] = 1;
        pipelineMinLevel["llm_qwen_2_5_coder_32b"] = 1;

        // LVL 2: Basic generation
        pipelineMinLevel["image_turbo"] = 2;
        pipelineMinLevel["audio"] = 2;

        // LVL 3: Quality generation
        pipelineMinLevel["image_quality"] = 3;
        pipelineMinLevel["image_standard"] = 3;
        pipelineMinLevel["audio_turbo"] = 3;
        pipelineMinLevel["video_fast"] = 3;
        pipelineMinLevel["music"] = 3;

        // LVL 4: Advanced
        pipelineMinLevel["image_advanced"] = 4;
        pipelineMinLevel["audio_quality"] = 4;
        pipelineMinLevel["vision"] = 4;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════

    function registerProvider(
        string calldata peerId,
        string[] calldata pipelines,
        uint256 pricePerToken,
        bool isRelay,
        uint256 relayFeeBps
    ) external returns (bytes32 providerId) {
        require(providerByOwner[msg.sender] == bytes32(0), "Already registered");
        require(pipelines.length > 0, "No pipelines");
        require(bytes(peerId).length > 0, "No peer ID");

        if (isRelay) {
            require(relayFeeBps >= minRelayFeeBps && relayFeeBps <= maxRelayFeeBps, "Invalid relay fee");
        }

        // Verify access level
        uint8 userLevel = levelRegistry.getLevel(msg.sender);
        for (uint i = 0; i < pipelines.length; i++) {
            require(userLevel >= pipelineMinLevel[pipelines[i]], "Insufficient level");
        }

        providerId = keccak256(abi.encodePacked(msg.sender, block.timestamp, block.prevrandao));

        providers[providerId] = Provider({
            owner: msg.sender,
            peerId: peerId,
            pipelines: pipelines,
            pricePerToken: pricePerToken,
            totalEarnings: 0,
            successfulJobs: 0,
            failedJobs: 0,
            registeredAt: uint64(block.timestamp),
            active: true,
            isRelay: isRelay,
            relayFeeBps: relayFeeBps,
            relayEarnings: 0,
            relayedJobs: 0
        });

        providerByOwner[msg.sender] = providerId;
        allProviderIds.push(providerId);

        if (isRelay) {
            relayProviderIds.push(providerId);
        }

        for (uint i = 0; i < pipelines.length; i++) {
            providersByPipeline[pipelines[i]].push(providerId);
        }

        emit ProviderRegistered(providerId, msg.sender, peerId, isRelay);
    }

    function setRelayStatus(bool isRelay, uint256 relayFeeBps) external {
        bytes32 providerId = providerByOwner[msg.sender];
        require(providerId != bytes32(0), "Not registered");

        if (isRelay) {
            require(relayFeeBps >= minRelayFeeBps && relayFeeBps <= maxRelayFeeBps, "Invalid relay fee");
        }

        Provider storage p = providers[providerId];
        bool wasRelay = p.isRelay;

        p.isRelay = isRelay;
        p.relayFeeBps = relayFeeBps;

        // Update relay index
        if (isRelay && !wasRelay) {
            relayProviderIds.push(providerId);
        } else if (!isRelay && wasRelay) {
            _removeFromRelayIndex(providerId);
        }

        emit RelayStatusChanged(providerId, isRelay, relayFeeBps);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DISCOVERY
    // ═══════════════════════════════════════════════════════════════════════

    function getProvidersForPipeline(
        string calldata pipeline,
        uint256 maxResults
    ) external view returns (
        bytes32[] memory providerIds,
        string[] memory peerIds,
        uint256[] memory prices,
        bool[] memory isRelays
    ) {
        bytes32[] storage candidates = providersByPipeline[pipeline];

        uint256 activeCount = 0;
        for (uint i = 0; i < candidates.length && activeCount < maxResults; i++) {
            if (providers[candidates[i]].active) activeCount++;
        }

        providerIds = new bytes32[](activeCount);
        peerIds = new string[](activeCount);
        prices = new uint256[](activeCount);
        isRelays = new bool[](activeCount);

        uint256 idx = 0;
        for (uint i = 0; i < candidates.length && idx < activeCount; i++) {
            Provider storage p = providers[candidates[i]];
            if (p.active) {
                providerIds[idx] = candidates[i];
                peerIds[idx] = p.peerId;
                prices[idx] = p.pricePerToken;
                isRelays[idx] = p.isRelay;
                idx++;
            }
        }
    }

    function getRelayProviders(uint256 maxResults) external view returns (
        bytes32[] memory providerIds,
        string[] memory peerIds,
        uint256[] memory relayFees
    ) {
        uint256 count = relayProviderIds.length < maxResults ? relayProviderIds.length : maxResults;

        providerIds = new bytes32[](count);
        peerIds = new string[](count);
        relayFees = new uint256[](count);

        for (uint i = 0; i < count; i++) {
            Provider storage p = providers[relayProviderIds[i]];
            if (p.active && p.isRelay) {
                providerIds[i] = relayProviderIds[i];
                peerIds[i] = p.peerId;
                relayFees[i] = p.relayFeeBps;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PAYMENTS
    // ═══════════════════════════════════════════════════════════════════════

    function processPayment(
        bytes32 providerId,
        bytes32 relayProviderId,
        address consumer,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        Provider storage provider = providers[providerId];
        require(provider.owner == msg.sender, "Not provider");
        require(provider.active, "Inactive");

        // Transfer from consumer
        usdc.transferWithAuthorization(
            consumer,
            address(this),
            amount,
            validAfter,
            validBefore,
            nonce,
            signature
        );

        // Calculate fees
        uint256 protocolFee = (amount * protocolFeeBps) / 10000;
        uint256 remaining = amount - protocolFee;
        uint256 relayFee = 0;

        // Pay relay if applicable
        if (relayProviderId != bytes32(0)) {
            Provider storage relay = providers[relayProviderId];
            require(relay.isRelay && relay.active, "Invalid relay");

            relayFee = (remaining * relay.relayFeeBps) / 10000;
            IERC20(address(usdc)).transfer(relay.owner, relayFee);
            relay.relayEarnings += relayFee;
            relay.relayedJobs++;
            remaining -= relayFee;
        }

        // Pay provider
        IERC20(address(usdc)).transfer(provider.owner, remaining);
        provider.totalEarnings += remaining;
        provider.successfulJobs++;

        // Pay protocol
        if (protocolFee > 0) {
            IERC20(address(usdc)).transfer(protocolFeeRecipient, protocolFee);
        }

        emit PaymentProcessed(providerId, relayProviderId, consumer, amount, protocolFee, relayFee);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════════════════

    function _removeFromRelayIndex(bytes32 providerId) internal {
        for (uint i = 0; i < relayProviderIds.length; i++) {
            if (relayProviderIds[i] == providerId) {
                relayProviderIds[i] = relayProviderIds[relayProviderIds.length - 1];
                relayProviderIds.pop();
                break;
            }
        }
    }
}
```

---

## x402 Payment Protocol

### Payment Flow over libp2p

```
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│   Consumer   │                    │   Provider   │                    │  Arbitrum    │
└──────┬───────┘                    └──────┬───────┘                    └──────┬───────┘
       │                                   │                                   │
       │  1. libp2p.dial(peerId)           │                                   │
       │──────────────────────────────────►│                                   │
       │                                   │                                   │
       │  2. Open stream /bonzai/v1/infer  │                                   │
       │──────────────────────────────────►│                                   │
       │                                   │                                   │
       │  3. Send request (no payment)     │                                   │
       │──────────────────────────────────►│                                   │
       │                                   │                                   │
       │  4. 402 Payment Required          │                                   │
       │   { amount, providerId, chainId } │                                   │
       │◄──────────────────────────────────│                                   │
       │                                   │                                   │
       │  5. Sign ERC-3009 authorization   │                                   │
       │                                   │                                   │
       │  6. Send request + payment auth   │                                   │
       │──────────────────────────────────►│                                   │
       │                                   │                                   │
       │                                   │  7. Validate signature            │
       │                                   │                                   │
       │                                   │  8. Execute inference             │
       │                                   │                                   │
       │  9. Stream result                 │                                   │
       │◄──────────────────────────────────│                                   │
       │                                   │                                   │
       │                                   │  10. Claim payment on-chain       │
       │                                   │      processPayment(...)          │
       │                                   │──────────────────────────────────►│
       │                                   │                                   │
       │                                   │  11. USDC distributed             │
       │                                   │◄──────────────────────────────────│
```

### Request/Response Format (libp2p stream)

```typescript
// Request
interface InferenceRequest {
  pipeline: string;           // "image_turbo", "llm_llama_3_1_8b", etc.
  params: Record<string, any>;  // Pipeline-specific params
  payment?: PaymentAuthorization;  // Included on retry after 402
}

// Response (success)
interface InferenceResponse {
  ok: true;
  result: any;                // Pipeline-specific result
  usage: {
    tokens?: number;
    durationMs: number;
  };
}

// Response (payment required)
interface PaymentRequiredResponse {
  ok: false;
  error: "payment_required";
  payment: {
    amount: string;           // USDC wei
    providerId: string;
    relayProviderId?: string;
    chainId: number;          // 42161 for Arbitrum
    contract: string;         // BonzAINetwork address
  };
}
```

---

## OpenClaw API Gateway

### Two-Server Architecture (Updated for libp2p)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BonzAI Node                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        libp2p Node                                      ││
│  │  Peer ID: QmYx7eFzK...                                                  ││
│  │  Protocols: /bonzai/v1/inference, /bonzai/v1/health                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│         │                                           │                        │
│         │ Routes LLM requests                       │ Routes diffusion       │
│         ▼                                           ▼                        │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │     OpenClaw API (Port 3002)    │  │    Flask Server (Port 65000)   │  │
│  │         node-llama-cpp          │  │      Diffusion Pipelines       │  │
│  ├─────────────────────────────────┤  ├─────────────────────────────────┤  │
│  │ Pipelines:                      │  │ Pipelines:                     │  │
│  │ - llm_llama_3_1_8b              │  │ - image_turbo, image_quality   │  │
│  │ - llm_hermes_4_14b              │  │ - audio, audio_turbo, music    │  │
│  │ - llm_mythomax_13b              │  │ - video_fast                   │  │
│  │ - ... (21 LLMs)                 │  │ - vision                       │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
│                                                                              │
│  Local requests: Direct to servers (no payment)                             │
│  Remote requests: Via libp2p + x402 payment                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Zero-Knowledge Provider Model

> **Remote inference stores NOTHING on the provider side unless consumer == provider.**

### Implementation

```javascript
// src/services/libp2p.service.js

node.handle('/bonzai/v1/inference', async ({ stream, connection }) => {
  const remotePeer = connection.remotePeer.toString();
  const request = await readRequest(stream);

  // Check if local request (same wallet)
  const isLocal = await isLocalConsumer(request.payment?.from);

  // Execute inference
  const result = await executeInference(request);

  // Send response
  await writeResponse(stream, result);

  // Storage policy
  if (isLocal) {
    // Local: save to history, keep files
    await saveToHistory(request, result);
  } else {
    // Remote: zero storage
    // - Don't log prompts
    // - Don't save generated files
    // - Don't record in history
    // Result was streamed directly to consumer
  }
});
```

---

## Consumer/Provider Toggle

### Settings UI

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           NETWORK SETTINGS                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Network Mode                                                               │
│  ○ Local Only      Offline, no network features                            │
│  ○ Consumer        Use remote providers when local unavailable             │
│  ● Provider        Earn USDC by serving inference                          │
│                                                                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PROVIDER SETTINGS                                                          │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Status        ● Online │ 47 peers │ 3 relay connections           │    │
│  │ Peer ID       QmYx7eFzKn3...kF3n  [Copy]                          │    │
│  │ NAT Type      Symmetric (using relay)                              │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Pricing                                                                    │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ Price per 1K tokens (LLM)     $0.0001 USDC                        │    │
│  │ Price per image generation    $0.001 USDC                         │    │
│  │ Price per audio generation    $0.0005 USDC                        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Pipelines (based on your access level: LVL3)                               │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ ☑ llm_llama_3_1_8b        ☑ image_turbo      ☑ audio              │    │
│  │ ☑ llm_hermes_4_14b        ☑ image_quality    ☑ audio_turbo        │    │
│  │ ☑ llm_mythomax_13b        ☐ image_advanced*  ☑ video_fast         │    │
│  │ ☑ llm_qwen_2_5_coder_32b  ☑ image_standard   ☐ audio_quality*     │    │
│  │                                               ☑ music              │    │
│  │ * Requires LVL4                                                   │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Relay                                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ ☐ Act as relay for other providers                                │    │
│  │   Earn 5% of relayed inference fees                               │    │
│  │   (Requires public IP or port forwarding)                         │    │
│  │                                                                    │    │
│  │   Your NAT type: Symmetric                                        │    │
│  │   ⚠ Relay mode not available - no public connectivity            │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌──────────────────┐                                                      │
│  │ Register/Update  │  Registered ✓ │ Earnings: $12.50 │ Jobs: 234        │
│  └──────────────────┘                                                      │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: libp2p Integration
- [x] Add libp2p to package.json
- [x] Create `src/services/libp2p.service.js`
- [x] Add IPC handlers in `src/main.js` (p2p-start, p2p-stop, p2p-status, p2p-dial, p2p-inference, p2p-health)
- [x] Add preload bindings in `src/preload.js`
- [x] Implement `/bonzai/v1/inference` protocol handler
- [x] Implement `/bonzai/v1/health` protocol handler
- [ ] Implement peer ID generation (deterministic from wallet) - currently random
- [ ] Test DHT discovery and hole-punching
- [ ] Add bootstrap nodes from contract registry

### Phase 2: Smart Contract
- [ ] Deploy BonzAINetwork to Arbitrum Sepolia
- [ ] Integrate with existing BonzaiLevelRegistry
- [ ] Test provider registration with peer IDs
- [ ] Test relay registration and fee distribution
- [ ] Test payment flow with testnet USDC

### Phase 3: Provider Mode
- [ ] Add libp2p node startup to main.js
- [ ] Route incoming libp2p requests to OpenClaw/Flask
- [ ] Implement x402 middleware for remote requests
- [ ] Implement zero-knowledge response handling
- [ ] Add provider/relay settings UI

### Phase 4: Consumer Mode
- [ ] Implement discovery client (contract query + libp2p dial)
- [ ] Add fallback logic: local → remote
- [ ] Implement ERC-3009 signing for payments
- [ ] Handle relay routing transparently

### Phase 5: Production
- [ ] Deploy contract to Arbitrum mainnet
- [ ] Security review
- [ ] Load testing with multiple providers
- [ ] Bootstrap node infrastructure (initial public-IP providers)

---

## Dependencies

### New npm packages (installed)

```json
{
  "@chainsafe/libp2p-noise": "^15.1.0",
  "@chainsafe/libp2p-yamux": "^6.0.2",
  "@libp2p/bootstrap": "^10.1.0",
  "@libp2p/circuit-relay-v2": "^1.1.0",
  "@libp2p/identify": "^2.1.0",
  "@libp2p/kad-dht": "^12.1.0",
  "@libp2p/tcp": "^9.1.0",
  "@libp2p/webrtc": "^4.1.0",
  "@libp2p/websockets": "^8.1.0",
  "it-pipe": "^3.0.1",
  "libp2p": "^1.4.0",
  "uint8arrays": "^5.1.0"
}
```

---

## References

- [libp2p Documentation](https://docs.libp2p.io/)
- [libp2p Circuit Relay v2](https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md)
- [Arbitrum Native USDC](https://arbiscan.io/address/0xaf88d065e77c8cC2239327C5EDb3A432268e5831)
- [ERC-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
