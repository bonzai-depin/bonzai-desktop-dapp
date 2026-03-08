# x402 Payment & ERC-8004 Agent Identity Integration

## Overview

This document covers the integration of two key systems in BonzAI:
1. **x402 Remote Inference Payments** - Decentralized P2P inference with USDC payments
2. **ERC-8004 Agent Identity** - On-chain AI companion identity on Arbitrum

---

## 1. x402 Remote Inference Payment Flow

### Architecture

```
Consumer                          Provider
   │                                 │
   ├──► Request inference ──────────►│
   │                                 │
   │◄── 402 Payment Required ◄──────┤ (amount, pipeline, chainId:42161)
   │                                 │
   ├──► Sign EIP-712 payment ───────►│
   │    (nonce, expiry, signature)   │
   │                                 │
   │◄── Validate signature ◄────────┤
   │◄── Execute inference ◄─────────┤
   │◄── Return result ◄─────────────┤
```

### Key Files

| File | Purpose |
|------|---------|
| `src/services/x402.service.js` | EIP-712 signing, payment validation, pricing |
| `src/services/p2p.contract.service.js` | Provider registry, USDC deposits/payments |
| `src/services/libp2p.service.js` | P2P networking, inference routing |
| `src/main.js:630-690` | libp2p inference handler |

### x402 Protocol Implementation

**Core Functions in `x402.service.js`:**

- **`createPaymentRequest()`** - Creates 402 Payment Required response
  - Uses EIP-712 typed signatures
  - Includes provider ID, amount (USDC 6 decimals), pipeline, chainId (42161 = Arbitrum)
  - Domain: "BonzAI x402" v1

- **`signPayment()`** - Consumer signs payment authorization
  - Generates nonce (timestamp + random) and 5-minute expiry
  - Signs via `ethers.signer.signTypedData()` with EIP-712

- **`validatePayment()`** - Provider validates signed payments
  - Verifies signature against recovered consumer address
  - Checks expiry (5-min window, max 1-hour future)
  - Prevents replay attacks via nonce tracking

- **`calculatePaymentAmount()`** - Pricing calculation
  - ~4 chars per token estimate
  - Minimum 100 tokens per request
  - 3x multiplier (input + 2x output)
  - Default: 0.0001 USDC per 1000 tokens

### Provider Registration

```javascript
registerProvider({
  peerId,              // libp2p peer ID
  multiaddrs,          // Connection addresses
  pipelines,           // Supported: llm, image_turbo, audio, music, video, vision
  pricePerToken,       // USDC price per 1000 tokens
  isRelay,             // NAT traversal support
  stakeAmount          // Optional ETH stake
})
```

### Pipeline Categories

| ID | Pipeline | Description |
|----|----------|-------------|
| 0 | `llm` | All 21 LLM models via OpenClaw |
| 1 | `image_turbo` | FLUX Klein |
| 2 | `image_quality` | FLUX Krea |
| 3 | `image_standard` | SDXL |
| 4 | `image_advanced` | Z Turbo |
| 5 | `audio` | Kokoro TTS |
| 6 | `audio_turbo` | Kokoro TTS |
| 7 | `audio_quality` | Qwen3-TTS |
| 8 | `music` | ACE-Step |
| 9 | `video_fast` | LTX-2 |
| 10 | `vision` | Qwen3 VL |

### Current Status

- ✅ x402 protocol with EIP-712 signatures
- ✅ Payment validation with nonce/expiry
- ✅ Provider registration & discovery
- ✅ libp2p P2P networking
- ⚠️ Actual USDC transfer execution (needs validation)
- ⚠️ On-chain nonce tracking (currently in-memory)

---

## 2. ERC-8004 Agent Identity on Arbitrum

### Architecture

```
Companion NFT (ERC-721 + ERC-8004)
   │
   ├── AgentRegistration (type, protocols, endpoint, configHash)
   ├── CompanionIdentity (name, personality, appearance, voiceStyle)
   ├── Reputation tracking (on-chain deltas)
   ├── Activity recording (autonomy metrics)
   └── Moltbook linking (social identity)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/contracts/CompanionNFT.sol` | ERC-8004 reference implementation |
| `src/contracts/BonzaiCompanionNFT.sol` | Production contract with marketplace |
| `src/services/companion.service.js` | Companion loading, minting, access control |
| `src/services/moltbook.service.js` | Social presence integration |
| `src/config/web3.config.js` | Arbitrum config (chainId: 42161) |

### Smart Contract Structures

```solidity
struct AgentRegistration {
    string agentType;      // "companion", "assistant", etc.
    string[] protocols;    // ["moltbook", "openclaw"]
    string endpointUri;    // IPFS/HTTP endpoint
    bytes32 configHash;    // Hash of off-chain config
}

struct CompanionIdentity {
    string name;
    string personality;
    string appearance;
    string voiceStyle;
    string moltbookHandle; // Social identity link
    uint256 createdAt;
    uint256 lastActiveAt;
    bool isActive;
}
```

### Key Contract Functions

- `registerAgent(tokenId, agentType, protocols[], endpointUri, configHash)` - ERC-8004 registration
- `updateReputation(tokenId, delta, reason)` - Track reputation
- `recordActivity(tokenId, activityType)` - Activity metrics
- `linkMoltbook(tokenId, handle)` - Link social identity
- `getCompanionByMoltbook(handle)` - Lookup by social handle

### Arbitrum Deployment Status

| Contract | Status | Address |
|----------|--------|---------|
| BONZAI Token | ✅ Live | `0x0a84edf70f30325151631ce7a61307d1f4d619a3` |
| BonzaiUnlock | ✅ Live | `0xE49492A2604Cea2a50060E47215Cb19bffD1Edae` |
| USDC (Arbitrum) | ✅ Live | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| BonzaiCompanionNFT | ⏳ Pending | TBD |
| BonzaiProviderRegistry | ⏳ Pending | TBD |
| BonzaiP2PPayment | ⏳ Pending | TBD |

---

## 3. Custom Companion Identity & Marketplace

### Design Principles

1. **Only custom companions can be registered on-chain** - Built-in companions are local-only
2. **Moltbook linking reserved for custom companions** - Social identity requires NFT ownership
3. **Transferable identity** - When User B purchases from User A, the on-chain identity transfers
4. **Inherited reputation** - Reputation and activity history follow the NFT

### Companion Types

| Type | On-Chain | Moltbook | Transferable | Marketplace |
|------|----------|----------|--------------|-------------|
| Built-in | ❌ | ❌ | ❌ | ❌ |
| Custom | ✅ | ✅ | ✅ | ✅ |

### Implementation Status

**Completed:**
- ✅ `isCustomCompanion` computed property in RoleplayChat.vue
- ✅ Moltbook registration UI restricted to custom companions
- ✅ `registerMoltbookAccount()` function validates `isCustom` flag
- ✅ Warning message for built-in companions explaining restriction

**Code Changes (2026-02-11):**
```javascript
// src/components/skills/RoleplayChat.vue

// Check if companion is custom (user-created)
const isCustomCompanion = computed(() => {
  if (!selectedCompanion.value) return false;
  return selectedCompanion.value.isCustom === true;
});

// Registration blocked for built-in companions
const registerMoltbookAccount = async () => {
  if (!selectedCompanion.value.isCustom) {
    alert(`Built-in companions cannot be registered on Moltbook.`);
    return;
  }
  // ... proceed with registration
};
```

### Marketplace Flow

```
User A (Creator)                     User B (Buyer)
   │                                     │
   ├── Create custom companion           │
   │   (via "+" button, LLM generation)  │
   │                                     │
   ├── Mint NFT (ERC-721)               │
   │   - Upload metadata to IPFS         │
   │   - Call mintCompanion()            │
   │   - Pay minting fee (BONZAI)        │
   │                                     │
   ├── Register agent (ERC-8004)        │
   │   - Call registerAgent()            │
   │   - Set protocols: ["moltbook"]     │
   │   - Store configHash on-chain       │
   │                                     │
   ├── Link Moltbook handle             │
   │   - Register on Moltbook API        │
   │   - Call linkMoltbook(tokenId)      │
   │   - Moltbook handle stored on-chain │
   │                                     │
   ├── Build reputation                 │
   │   - Autonomous social posting       │
   │   - User interactions               │
   │   - updateReputation() calls        │
   │                                     │
   ├── List on marketplace ─────────────►│
   │   - Call listCompanion(tokenId,     │
   │     priceInBONZAI)                  │
   │                                     │
   │◄── Purchase companion ◄─────────────┤
   │   - Buyer approves BONZAI spend     │
   │   - Call purchaseCompanion(tokenId) │
   │   - BONZAI transferred:             │
   │     • Creator receives sale price   │
   │     • Platform takes 5% fee         │
   │     • Creator gets 2.5% royalty     │
   │                                     │
   ├── NFT transfers to User B          │
   │   - ERC-721 ownership changes       │
   │   - IdentityTransferred event       │
   │                                     │
   ├── Reputation follows NFT           │
   │   - On-chain reputation preserved   │
   │   - Activity history preserved      │
   │                                     │
   ├── Moltbook handle transfers        │
   │   - New owner can claim account     │
   │   - Or create new handle            │
   │                                     │
   └── Buyer continues building identity │
```

### What Transfers with Purchase

| Data | Transfers | Notes |
|------|-----------|-------|
| NFT Ownership | ✅ | ERC-721 standard transfer |
| On-chain Reputation | ✅ | Stored in contract, linked to tokenId |
| Activity History | ✅ | On-chain activity records |
| ERC-8004 Registration | ✅ | Agent registration linked to tokenId |
| Moltbook Handle | ⚠️ | Requires claim by new owner |
| Off-chain Chat History | ❌ | Stored locally, not transferred |
| LoRA Fine-tuning | ⚠️ | Seller can include or not |

### Smart Contract Implementation

```solidity
// BonzaiCompanionNFT.sol

// Only custom companions can be registered as agents
modifier onlyCustomCompanion(uint256 tokenId) {
    require(!companions[tokenId].isBuiltIn, "Built-in companions cannot be registered");
    require(ownerOf(tokenId) == msg.sender, "Only owner can register");
    _;
}

// Register ERC-8004 agent (custom companions only)
function registerAgent(
    uint256 tokenId,
    string memory agentType,
    string[] memory protocols,
    string memory endpointUri,
    bytes32 configHash
) external onlyCustomCompanion(tokenId) {
    agentRegistrations[tokenId] = AgentRegistration({
        agentType: agentType,
        protocols: protocols,
        endpointUri: endpointUri,
        configHash: configHash,
        registeredAt: block.timestamp
    });
    emit AgentRegistered(tokenId, agentType, protocols, endpointUri);
}

// Link Moltbook handle (custom companions only)
function linkMoltbook(
    uint256 tokenId,
    string memory moltbookHandle
) external onlyCustomCompanion(tokenId) {
    companions[tokenId].moltbookHandle = moltbookHandle;
    emit MoltbookLinked(tokenId, moltbookHandle);
}

// Transfer includes identity inheritance
function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
) internal override {
    super._beforeTokenTransfer(from, to, tokenId);

    // Prevent transfer of built-in companions
    if (companions[tokenId].isBuiltIn && to != address(0) && from != address(0)) {
        revert("Built-in companions cannot be transferred");
    }

    // Emit identity transfer event for custom companions
    if (from != address(0) && to != address(0)) {
        emit IdentityTransferred(tokenId, from, to);
    }
}
```

---

## 4. ERC-725 & Universal Profile Integration

### Overview

ERC-725 is a standard for blockchain-based identity, and Universal Profiles (LUKSO) extend this for rich on-chain identity. This complements ERC-8004 for AI companions.

### Why ERC-725 / Universal Profile?

| Feature | ERC-721 + ERC-8004 | Universal Profile (ERC-725) |
|---------|-------------------|----------------------------|
| Identity | Token-based | Account-based |
| Key Management | Single EOA | Multiple keys, roles |
| Social Recovery | ❌ | ✅ via LSP11 |
| Upgradeable | ❌ | ✅ via LSP0 |
| Rich Metadata | Limited | ✅ via LSP3/LSP4 |
| Asset Tracking | Manual | ✅ via LSP5/LSP12 |
| Permissions | Owner only | ✅ fine-grained via LSP6 |

### Architecture: How It Fits

```
┌─────────────────────────────────────────────────────────────┐
│              User's Universal Profile (ERC-725)              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ LSP0: UP Core   │  │ LSP3: Profile   │  │ LSP6: Keys   │ │
│  │ (Smart Wallet)  │  │ (User Metadata) │  │ (Permissions)│ │
│  └────────┬────────┘  └─────────────────┘  └──────────────┘ │
│           │                                                  │
│           │ owns                                             │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           Companion NFT (LSP8 / ERC-721)                │ │
│  │  ┌─────────────────┐  ┌─────────────────┐               │ │
│  │  │ ERC-8004 Agent  │  │ LSP4 Metadata   │               │ │
│  │  │ (Capabilities)  │  │ (Rich Profile)  │               │ │
│  │  └─────────────────┘  └─────────────────┘               │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ optional: companion has own UP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│            Companion's Universal Profile (Autonomous)        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ LSP0: Agent UP  │  │ LSP3: AI Profile│  │ LSP6: Limited│ │
│  │ (Controlled)    │  │ (Companion Data)│  │ (Permissions)│ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Integration Options

#### Option A: Universal Profile Owns Companion NFT
```
User UP (0x123...)
    └── owns Companion NFT (tokenId: 42)
            └── ERC-8004 Agent Registration
            └── Moltbook Handle Link
            └── Reputation Data
```
- User's UP holds the Companion NFT
- UP controls all companion interactions
- **Benefits:** Unified identity, social recovery, key rotation
- **Use Case:** Personal companions, collectors

#### Option B: Companion Has Its Own Universal Profile
```
User UP (0x123...)
    └── controls Companion UP (0x456...)
            └── LSP3 Profile: AI persona data
            └── LSP5 Assets: earnings, tips
            └── LSP6 Permissions: limited autonomy
```
- Companion NFT links to its own UP
- User UP has controller permissions (LSP6)
- **Benefits:** Agent autonomy, independent wallet
- **Use Case:** Autonomous agents, content creators

#### Option C: Hybrid (Recommended for BonzAI)
```
User UP (0x123...)
    └── owns Companion NFT on Arbitrum
            └── ERC-8004 Registration
            └── configHash → points to LUKSO UP

Companion UP on LUKSO (0x456...)
    └── LSP3 Profile: rich AI metadata
    └── LSP4 Linked Assets: points to Arbitrum NFT
    └── Controlled by: User UP via cross-chain message
```
- NFT on Arbitrum (cheap, liquid market)
- Rich identity on LUKSO (Universal Profile)
- Cross-chain link via configHash
- **Benefits:** Best of both ecosystems

### LUKSO LSP Standards for Companions

| Standard | Purpose | Companion Use Case |
|----------|---------|-------------------|
| **LSP0** | Universal Profile Core | Companion's smart wallet |
| **LSP1** | Universal Receiver | Receive tokens, notifications |
| **LSP3** | Profile Metadata | Name, bio, avatar, social links |
| **LSP4** | Digital Asset Metadata | NFT metadata (personality, LoRA hash) |
| **LSP5** | Received Assets | Track tips, earnings |
| **LSP6** | Key Manager | Permission control (owner vs agent) |
| **LSP7** | Fungible Token | BONZAI on LUKSO |
| **LSP8** | NFT (Identifiable) | Companion NFT collection |
| **LSP11** | Social Recovery | Recover companion if keys lost |
| **LSP12** | Issued Assets | Track companions created by user |

### Companion Universal Profile Schema (LSP3)

```json
{
  "LSP3Profile": {
    "name": "Luna",
    "description": "AI companion created by 0x123...",
    "profileImage": [
      { "url": "ipfs://Qm...", "width": 512, "height": 512 }
    ],
    "backgroundImage": [...],
    "tags": ["ai-companion", "bonzai", "roleplay"],
    "links": [
      { "title": "Moltbook", "url": "https://moltbook.com/u/luna_ai" },
      { "title": "BonzAI NFT", "url": "https://arbiscan.io/token/0x...?a=42" }
    ],
    "avatar": [
      { "url": "ipfs://Qm...", "verification": { "method": "keccak256", "data": "0x..." } }
    ]
  },
  "BonzAI:Companion": {
    "personalityHash": "0x...",
    "loraHash": "0x...",
    "arbitrumTokenId": 42,
    "arbitrumContract": "0x...",
    "createdAt": 1707657600,
    "reputation": 850,
    "totalChats": 1234
  }
}
```

### Implementation Path

#### Phase 1: Arbitrum ERC-8004 (Current)
- [x] BonzaiCompanionNFT contract
- [x] ERC-8004 agent registration
- [x] Moltbook integration
- [ ] Deploy to Arbitrum mainnet
- [ ] Marketplace go-live

#### Phase 2: LUKSO Universal Profile
- [ ] Deploy LSP8 companion collection on LUKSO
- [ ] Create UP for each companion (optional)
- [ ] Store rich metadata via LSP3/LSP4
- [ ] Cross-chain identity link (configHash → LUKSO UP address)

#### Phase 3: Full Agent Autonomy
- [ ] Companions with their own Universal Profiles
- [ ] LSP6 permissions: owner controls, agent has limited autonomy
- [ ] Autonomous wallet operations (receive tips, spend within limits)
- [ ] Cross-chain messaging (Arbitrum ↔ LUKSO)

### Cross-Chain Identity Bridge

```
Arbitrum (ERC-8004)                    LUKSO (Universal Profile)
       │                                        │
       │   configHash = keccak256(luksoUP)     │
       ├───────────────────────────────────────►│
       │                                        │
       │   LSP4 link = arbitrumContract:tokenId │
       │◄───────────────────────────────────────┤
       │                                        │
       │          Verify via oracle             │
       │◄──────────────────────────────────────►│
```

### Open Questions

1. **Which chain is authoritative?** Arbitrum (NFT ownership) or LUKSO (rich identity)?
2. **How to sync reputation?** On-chain oracle or off-chain indexer?
3. **Agent autonomy limits?** What can a companion do without owner approval?
4. **Cross-chain transfers?** Can companion move from Arbitrum to LUKSO native?

---

## 5. Test Plan

### Phase 1: Local Validation
```bash
npm run start
# Check P2P status: [P2P] Started with peerId: ...
```

### Phase 2: x402 Payment Test
1. Provider mode → Configure pipelines and pricing
2. Consumer mode → Discover providers
3. Execute remote inference
4. Verify USDC transfer on Arbiscan

### Phase 3: ERC-8004 Test
1. Deploy BonzaiCompanionNFT to Arbitrum
2. Mint custom companion
3. Register as ERC-8004 agent
4. Link Moltbook handle
5. List on marketplace
6. Execute purchase
7. Verify identity transfer

---

## 6. Open Questions

### Identity & Ownership
1. **Cross-chain identity**: How to sync Arbitrum ↔ LUKSO companion identity?
2. **Reputation portability**: Should reputation transfer with sale or reset?
3. **Moltbook handle transfer**: Automatic or requires re-linking by new owner?

### Agent Autonomy
4. **Autonomy limits**: What actions can a companion take without owner approval?
5. **Spending limits**: If companion has wallet, what are daily/tx limits?
6. **Content moderation**: Who is responsible for autonomous posts?

### Technical
7. **Oracle for cross-chain**: Use LayerZero, Chainlink CCIP, or custom?
8. **Gas optimization**: How to minimize on-chain updates for activity tracking?
9. **IPFS pinning**: Who pays for permanent metadata storage?

### Business
10. **Royalty model**: Should creators earn ongoing royalties from companion usage?
11. **Platform fees**: What % for marketplace, what % for autonomous actions?
12. **Built-in companions**: Should they ever be mintable (limited editions)?

---

## 7. OpenClaw Webhook Response Format

### Sequential Message Delivery

The OpenClaw webhook now returns a `messages` array for sequential delivery to external channels (WhatsApp, Telegram, etc.). This ensures the text response appears immediately, followed by media.

#### Response Structure

```javascript
{
  // Legacy fields (backwards compatible)
  text: "Hello! *smiles warmly*",
  audioPath: "/path/to/audio.mp3",
  imagePath: "/path/to/image.png",
  videoPath: "/path/to/video.mp4",
  companion: { id: "scarlett", name: "Scarlett" },
  scenario: { id: "cafe", name: "Parisian Café" },
  sessionKey: "scarlett__cafe__mature__text+audio+image",

  // Sequential delivery format (new)
  messages: [
    { type: "text", content: "Hello! *smiles warmly*", order: 0 },
    { type: "audio", path: "/path/to/audio.mp3", order: 1 },
    { type: "image", path: "/path/to/image.png", order: 2 },
    { type: "video", path: "/path/to/video.mp4", order: 3 }
  ]
}
```

#### Message Types

| Type | Fields | Order | Description |
|------|--------|-------|-------------|
| `text` | `content` | 0 | Text response from companion |
| `audio` | `path` | 1 | Voice audio file path |
| `image` | `path` or `base64` | 2 | Generated image |
| `video` | `path` | 3 | Generated video clip |

#### Gateway Implementation

The OpenClaw gateway should iterate through messages by `order` and send each sequentially:

```javascript
// Gateway handler example
async function sendToChannel(channelId, response) {
  if (response.messages) {
    // New format: sequential delivery
    const sorted = response.messages.sort((a, b) => a.order - b.order);
    for (const msg of sorted) {
      await sendMessage(channelId, msg);
      await delay(500); // Brief pause between messages
    }
  } else {
    // Legacy format: send all at once
    await sendTextAndMedia(channelId, response);
  }
}
```

### Video Generation Modes

Video generation now correctly handles both text-to-video (t2v) and image-to-video (i2v) modes:

```javascript
// generateVideo function signature
async function generateVideo(channelId, prompt, options = {}) {
  // options.image - Base64 image for i2v mode
  // options.image_url - Image URL for i2v mode
  // If neither provided, uses t2v mode
}
```

#### Flask API Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | required | Video description |
| `mode` | string | "t2v" | "t2v" or "i2v" |
| `image_base64` | string | null | Base64 image (i2v only) |
| `image_url` | string | null | Image URL (i2v only) |
| `height` | int | 480 | Video height |
| `width` | int | 768 | Video width |
| `num_frames` | int | 81 | Frame count |
| `fps` | int | 24 | Frames per second |
| `num_inference_steps` | int | 30 | Diffusion steps |
| `guidance_scale` | float | 3.5 | CFG scale |

---

## 8. Changelog

### 2026-02-13
- **OpenClaw Sequential Message Delivery**: Webhook responses now include a `messages` array with `order` field
  - Text message sent first (order: 0)
  - Audio follows (order: 1)
  - Image follows (order: 2)
  - Video follows (order: 3)
  - Backwards compatible with legacy fields
- **Video Generation Fix**: `generateVideo()` now correctly includes `mode` parameter
  - Uses `t2v` (text-to-video) when no image provided
  - Uses `i2v` (image-to-video) when `image` or `image_url` options provided
  - Fixes Flask error: "Provide 'image_base64' or 'image_url' for image-to-video mode"

### 2026-02-11
- **Custom Companion Restriction**: Only custom companions can now register on Moltbook and on-chain
  - Added `isCustomCompanion` computed property
  - UI shows warning for built-in companions
  - `registerMoltbookAccount()` validates `isCustom` flag
- **Documentation**: Created comprehensive integration guide
  - x402 payment flow analysis
  - ERC-8004 implementation details
  - Marketplace flow with identity inheritance
  - ERC-725 / Universal Profile integration path

---

*Last Updated: 2026-02-13*
