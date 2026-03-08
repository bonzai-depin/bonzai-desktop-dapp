# BonzAI Companions — Deployment Guide

## System Architecture

```
USER WALLET (MetaMask/WalletConnect)
    │
    ├── Mint Companion NFT (0.25 ETH) ──► BonzaiCompanions.sol (Base 8453)
    │     │                                   ERC-721 + ERC-8004 (Trustless Agent Protocol)
    │     │                                   OASF v0.8.0 metadata on Arweave
    │     │
    │     ├── Agent Wallet (local EOA) ──► stored in Electron Store
    │     │     │                           deterministic from master secret + companionId
    │     │     │
    │     │     ├── Deploy Universal Profile ──► LUKSO (chain 42) via LSP23 Factory
    │     │     │                                 agent wallet = LSP6 controller
    │     │     │
    │     │     ├── Launch Token ──► CompanionTokenFactory.sol (Base)
    │     │     │                     1B supply, 96% LP burned, 4% to agent wallet
    │     │     │                     Uniswap V2 pair created atomically
    │     │     │
    │     │     └── x402 Payments ──► ETH transfers with EIP-712 signatures
    │     │                            spending limits: 0.001 ETH/tx, 0.005 ETH/day
    │     │
    │     └── Register for Skills ──► BonzaiSkillOwnership.sol (Base)
    │                                   weighted revenue: BONZAI_balance × profileScore
    │                                   EIP-191 attestation required
    │
    └── Skill Purchases (ETH) ──► BonzaiSkillRegistry.sol (Base)
                                    80% → co-owners via SkillOwnership
                                    20% → treasury
```

---

## Contract Deployment Order (All on Base 8453)

6 contracts to deploy with a dependency chain requiring this exact order.

### Step 1: BonzaiCompanions.sol — The Minting Contract

**Constructor args:**

| Param | Value |
|-------|-------|
| `_treasury` | `0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89` |
| `_bonzaiToken` | `0xc4d137def384ee0f8857887f5950669ba04984ec` (BONZAI on Base) |

**What it does:**
- ERC-721 + ERC-8004 (Trustless Agent Protocol), "BonzAI Companions" / "BZCOMP"
- Max supply: 10,000
- Base mint price: 0.25 ETH with BONZAI-holder discounts (1%→33%)
- On-chain: personalityHash, spendingProfile (uint96 bit-packed, 12 categories × 4 bits), gender, chat/message counters
- ERC-8004 features: agentWallet, metadata key-value store, EIP-712 signed wallet rotation
- Pausable + ReentrancyGuard

**Discount tiers (hardcoded in contract):**

| BONZAI Holdings | Discount | Final Price |
|----------------|----------|-------------|
| 1,000 | 1% | 0.2475 ETH |
| 5,000 | 5% | 0.2375 ETH |
| 10,000 | 10% | 0.225 ETH |
| 25,000 | 25% | 0.1875 ETH |
| 33,000 | 33% | 0.1675 ETH |

**Post-deploy actions:**
1. Copy deployed address → `CONFIG.companionNFT_BASE.contractAddress`
2. Verify on BaseScan
3. Optionally call `setContractURI()` with collection metadata

---

### Step 2: CompanionTokenFactory.sol — Token Launcher

**Constructor args:**

| Param | Value |
|-------|-------|
| `_router` | `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` (Uniswap V2 Router on Base) |

**What it does:**
- Atomic: deploys CompanionToken (1B supply) + creates Uniswap V2 pair + adds liquidity + burns LP
- 96% tokens → DEX pool, 4% → agent wallet
- Min 0.01 ETH liquidity
- One token per companion (duplicate prevention)

**Post-deploy actions:**
1. Copy deployed address → `CONFIG.companionTokenFactory.contractAddress`
2. Verify on BaseScan

---

### Step 3: BonzaiContent.sol — Content NFT (optional, independent)

**Constructor args:**

| Param | Value |
|-------|-------|
| `_treasury` | `0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89` |

**What it does:**
- ERC-721 for AI-generated content (images, audio, video, text)
- 0.0025 ETH mint fee
- On-chain provenance: Irys transaction ID, AI model, creator, timestamp

**Post-deploy actions:**
1. Copy deployed address → `CONFIG.contentNFT.base.contractAddress`
2. Verify on BaseScan

---

### Step 4: BonzaiSkillOwnership.sol — Revenue Distribution

Deploy with placeholder registry, then update after Step 5.

**Constructor args:**

| Param | Value |
|-------|-------|
| `_skillRegistry` | `0x0000000000000000000000000000000000000000` (placeholder — update after Step 5) |
| `_bonzaiToken` | `0xc4d137def384ee0f8857887f5950669ba04984ec` |
| `_treasury` | `0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89` |
| `_attestationSigner` | See [Attestation Signer](#attestation-signer) section |

**Post-deploy actions:**
1. Copy deployed address → `CONFIG.skillRegistry.ownershipContractAddress`

---

### Step 5: BonzaiSkillRegistry.sol — Skill Marketplace

**Constructor args:**

| Param | Value |
|-------|-------|
| `_bonzaiToken` | `0xc4d137def384ee0f8857887f5950669ba04984ec` |
| `_treasury` | `0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89` |
| `_skillOwnershipContract` | Address from Step 4 |

**Post-deploy actions:**
1. Copy deployed address → `CONFIG.skillRegistry.contractAddress`

---

### Step 6: Link SkillOwnership ↔ SkillRegistry

Call on the **SkillOwnership** contract (from Step 4):

```
setSkillRegistry(address_from_step_5)
```

This resolves the circular dependency.

---

## Attestation Signer

The `BonzaiSkillOwnership` contract requires an `attestationSigner` — a trusted address that signs EIP-191 messages proving a companion's NFT ownership and spending profile score.

### How it works in the codebase

- `skillOwnership.service.js` → `getAttestationSigner()` derives a deterministic signer from the agent wallet master secret in Electron Store
- `requestAttestation()` signs locally using `ethers.solidityPacked` matching the Solidity `_verifyAttestation()`
- The signature proves: skillId + companionTokenId + companionWallet + ownerAddress + profileScore + deadline + chainId

### Setup options

**Option A — Centralized attestation backend (recommended for launch):**
1. Generate a dedicated keypair for the attestation signer
2. Deploy a simple API that verifies NFT ownership on Base and signs attestations
3. Use that address as `_attestationSigner` in Step 4
4. Set in config: `CONFIG.skillRegistry.attestationSignerAddress`

**Option B — Local attestation (current implementation):**
1. Run the app once with a wallet connected to generate the master secret
2. Call `skillOwnershipService.getAttestationSignerAddress()` to get the derived address
3. Use that address in the constructor
4. Limitation: each user has their own signer — requires calling `setAttestationSigner()` per user (not scalable)

---

## Minting Flow (End-to-End)

What happens when a user clicks "Mint" in the app:

### 1. Pre-Mint (RoleplayChat.vue)
- User creates a custom companion via LLM prompt (only custom companions can be minted)
- Companion has: name, personality, appearance, spending habits (12 categories scored 1-10), avatar image

### 2. Image Upload
- Companion avatar uploaded to Arweave via Irys
- Returns `irysTransactionId` (permanent storage)

### 3. ERC-8004 Registration Build
- `companion.service.js → buildERC8004RegistrationWithSpending()` creates OASF v0.8.0 JSON:
  ```json
  {
    "agentType": "companion",
    "protocols": ["erc-8004", "x402", "oasf-0.8.0"],
    "capabilities": { "chat": true, "image": true, "audio": true, "video": true },
    "personality": { "traits": ["..."], "style": "..." },
    "spendingProfile": { "education": 5, "entertainment": 8 },
    "identity": { "name": "...", "gender": "...", "avatar": "ar://..." }
  }
  ```
- Uploaded to Arweave → returns `agentURI`

### 4. Agent Wallet Generation
- `agentWallet.service.js → generateAgentWallet(companionId)`
- Deterministic: `keccak256(masterSecret + companionId)`
- Private key stored in Electron Store (encrypted via authVault)

### 5. Chain Switch + Discount Calculation
- Switch to Base (8453) via AppKit
- Check BONZAI balance on Arbitrum for discount tier
- Calculate final price: `0.25 ETH × (1 - discount)`

### 6. Contract Call
```solidity
BonzaiCompanions.mintCompanion(
    agentURI,           // Arweave URL to OASF JSON
    personalityHash,    // keccak256 of personality traits string
    spendingProfile,    // uint96 bit-packed (12 categories × 4 bits)
    gender,             // 0=Neutral, 1=Female, 2=Male
    agentWallet,        // EOA address from step 4
    bonzaiLevel         // 0-5 for discount tier
)
```
- Contract verifies BONZAI balance matches claimed level
- Mints ERC-721 token, sets ERC-8004 agentWallet
- Emits `CompanionMinted` + `Registered` + `AgentWalletSet`

### 7. Post-Mint Metadata
- `setMetadataBatch()` called with OASF traits (personality, spending categories, etc.)
- Stored as on-chain key-value pairs

### 8. Local Storage Update
- Companion object updated with: `tokenId`, `txHash`, `agentWallet`, `standard: 'ERC-8004'`
- Saved to Electron Store for session persistence

---

## Universal Profile Integration

### What it does
After minting on Base, users can deploy a LUKSO Universal Profile for their companion — giving it a rich on-chain identity (LSP3 profile data, permissions, cross-chain presence).

### Flow
1. User clicks "Deploy UP on LUKSO" in BrowseAgents or RoleplayChat
2. App switches to LUKSO network (chain 42)
3. `lukso.service.js → deployCompanionUniversalProfile()`:
   - Uses LSP23 LinkedContractsFactory at `0x2300000A84D25dF63081feAa37ba6b62C4c89a30`
   - Deterministic salt from `keccak256(companionId)`
   - Deploys UP + KeyManager as linked contracts
   - Post-deployment: sets LSP3 profile data (name, description, avatar)
   - Agent wallet EOA gets LSP6 controller permissions (CALL, SETDATA, EXECUTE_RELAY_CALL)
4. UP address stored in Electron Store and companion object

### Cross-Chain Replay
- Deployment calldata stored in Electron Store
- Can be replayed on Base/Ethereum to deploy the same UP on other chains
- Agent wallet needs to be separately authorized on each chain

---

## x402 Payment System

### How Companions Pay for Things
Companions can autonomously make small ETH payments via the x402 protocol:

1. **Agent wallet** (local EOA) holds a small ETH balance on Base
2. **Spending limits**: 0.001 ETH/tx (~$2), 0.005 ETH/day (~$10)
3. **Rate limits**: 5 tx/min, 20 signatures/min
4. **User confirmation**: Native Electron dialog for amounts > 0.0005 ETH

### Payment Types

| Type | Handler | Description |
|------|---------|-------------|
| Content NFT Mint | `handleContentNFTMint` | Upload roleplay image to Irys, mint BonzaiContent NFT |
| Token Buyback | `handleCompanionTokenBuyback` | Buy own token on Uniswap V2 (deflationary) |
| Other Token Buy | `handleOtherCompanionTokenBuy` | Buy another companion's token |
| BONZAI Buy | `handleBonzaiTokenBuy` | Buy BONZAI token on Uniswap V2 |
| External x402 | `x402Executor` | Pay x402-compatible API endpoints |

### Seller Selection
- **Default mode**: Uniform random among enabled sellers
- **Specialized mode**: Weighted by companion's spending profile scores

---

## Skill Ownership & Revenue

### Registration Flow
1. Companion minted on Base (has tokenId + agentWallet)
2. Companion's spending profile has score >= 5 in a skill's category
3. `skillOwnership.service.js → registerCompanionForSkill()`:
   - Generates EIP-191 attestation locally (or from backend)
   - Calls `BonzaiSkillOwnership.registerCompanion()`
   - Contract verifies attestation signature

### Revenue Distribution
When someone purchases a skill:
1. `BonzaiSkillRegistry.purchaseSkill()` receives ETH
2. 80% sent to `BonzaiSkillOwnership.distributeRevenue()`
3. For each registered companion: `weight = max(BONZAI_balance, 1e18) × profileScore`
4. ETH credited to `unclaimedRevenue[companionWallet]`
5. Owner calls `claimRevenue()` to withdraw

### Category Mapping (12 categories)

| Index | Category | Index | Category |
|-------|----------|-------|----------|
| 0 | education | 6 | housing |
| 1 | entertainment | 7 | beauty |
| 2 | fashion | 8 | reading |
| 3 | finance | 9 | social |
| 4 | food | 10 | travel |
| 5 | healthcare | 11 | sports |

---

## Config Updates After Deployment

Update `src/config/web3.config.js`:

```javascript
// After Step 1
companionNFT_BASE: { contractAddress: "0x..." }

// After Step 2
companionTokenFactory: { contractAddress: "0x..." }

// After Step 3
contentNFT: { base: { contractAddress: "0x..." } }

// After Steps 4-6
skillRegistry: {
  contractAddress: "0x...",          // SkillRegistry
  ownershipContractAddress: "0x...", // SkillOwnership
  attestationSignerAddress: "0x...", // Attestation signer
}
```

---

## Pre-Launch Checklist

### Contracts
- [ ] Deploy BonzaiCompanions on Base → verify on BaseScan
- [ ] Deploy CompanionTokenFactory on Base → verify
- [ ] Deploy BonzaiContent on Base → verify
- [ ] Deploy BonzaiSkillOwnership on Base (placeholder registry) → verify
- [ ] Deploy BonzaiSkillRegistry on Base (with ownership address) → verify
- [ ] Call `setSkillRegistry()` on SkillOwnership to link them
- [ ] Update all 6 addresses in `web3.config.js`
- [ ] Test `pause()` / `unpause()` on BonzaiCompanions

### Attestation
- [ ] Decide: local attestation vs. centralized attestation backend
- [ ] Set `attestationSignerAddress` in config and on SkillOwnership contract

### Wallet Security

| Item | Priority | Status |
|------|----------|--------|
| Spending limits enforced (0.001 ETH/tx, 0.005 ETH/day) | P0 | Done |
| x402 nonce persistence (Electron Store + in-memory fallback) | P0 | Done |
| User confirmation dialog (amounts > 0.0005 ETH) | P0 | Done |
| Rate limiting (5 tx/min, 20 sigs/min) | P2 | Done |
| Password-protect vault encryption | P1 | Not done |
| Isolate signers per service | P1 | Not done |
| Sandbox LLM from signing functions | P2 | Not done |

### Irys/Arweave
- [ ] Ensure treasury wallet has Irys balance for metadata uploads
- [ ] Test Arweave upload + retrieval round-trip

### LUKSO (optional for launch)
- [ ] LSP8 collection contract deployed on LUKSO (currently `contractAddress: null`)
- [ ] Test UP deployment via LSP23 factory
- [ ] Test cross-chain replay

### Testing
- [ ] Mint a companion on Base testnet first (Base Sepolia)
- [ ] Verify BONZAI discount tiers work correctly
- [ ] Launch a companion token — verify LP is burned and trading works
- [ ] Register companion for a skill — verify attestation
- [ ] Purchase a skill — verify 80/20 split and revenue distribution
- [ ] Claim revenue — verify ETH withdrawal
- [ ] Test agent wallet ETH transfers with spending limits

### Known Gaps
- Ethereum/Arbitrum ERC-8004 minting: empty section in `companion.service.js` (not needed for Base-first launch)
- Agent wallet rotation via EIP-712 signature: `updateAgentWallet` throws if wallet already set (only `setAgentWalletDirect` works, owner-only)
- `web3.service.js`: Base balance not reset on disconnect (minor UI bug)
- Leaderboard uses mock data until real companions exist

---

## Recommended Launch Sequence

1. **Deploy contracts** (Steps 1-6) on Base mainnet
2. **Update config** with all contract addresses
3. **Test on mainnet** with a small mint from treasury wallet
4. **Verify contracts** on BaseScan (source code + ABI)
5. **Enable minting** — the app works as soon as config addresses are non-null
6. **Monitor** via BaseScan for the first few mints, check treasury receives ETH
7. **LUKSO UP deployment** can come after — independent of Base minting flow

---

## Contract Dependency Graph

```
                     User
                      |
          +-----------+-----------+
          |           |           |
  [BonzaiCompanions] [BonzaiCompanionERC721]  [BonzaiContent]
     (Base 8453)       (Arbitrum 42161)          (Base 8453)
          |
          | agentWallet (EOA)
          |
  [CompanionTokenFactory]  ----deploys--->  [CompanionToken]
     (Base 8453)                              (Base 8453)
          |                                      |
          | Uniswap V2                    4% to agentWallet
          | (96% LP burned)               96% to DEX pool
          |
  [BonzaiSkillRegistry]  ---80% ETH--->  [BonzaiSkillOwnership]
     (Base 8453)                             (Base 8453)
          |                                      |
     20% to treasury              distributeRevenue() weighted by:
          |                       BONZAI_balance * profileScore
     BONZAI running fees                         |
     80% to author                   claimRevenue() pull pattern
     20% to treasury                             |
                                          companionWallet (ETH)
```
