# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

BonzAI is a decentralized, privacy-preserving desktop application combining:
- AI inference engine (LLM + multimodal generation)
- Electron desktop framework with Vue 3 frontend
- Web3/blockchain integration (multi-chain: Ethereum, Arbitrum, Base, LUKSO)
- Python Flask backend for ML inference
- P2P distributed inference network with x402 ETH payments
- Autonomous AI companions with on-chain identity (ERC-8004) and social presence

**Website**: https://bonzai.sh

## Development Commands

```bash
# Install dependencies
npm install
pip install -r src/server/requirements.txt

# Start development (Electron + hot reload + Flask server auto-spawn)
npm run start

# Linting
npm run lint

# Build distribution packages (DMG)
npm run make

# Run Hardhat smart contract tests
npm test                # npx hardhat test
npm run test:coverage   # npx hardhat coverage

# Publish to GitHub releases
npm run publish
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Vue 3 Renderer (src/components/*.vue)                   │
│ - GenerativeText (LLM via OpenClaw port 3002)           │
│ - GenerativeImage (FLUX/SDXL via Flask)                 │
│ - GenerativeVideo (LTX-2 via Flask)                     │
│ - GenerativeAudio (Kokoro/Qwen TTS + ACE-Step Music)    │
│ - SmartAgent (Skills), RoleplayChat (Companions)        │
│ - BrowseAgents (Companion management, leaderboard)      │
│ - MintModal (Content NFT minting on Base/LUKSO)         │
│ State: Pinia stores (5 stores, see below)               │
└─────────────────────┬───────────────────────────────────┘
                      │ IPC via preload.js (context bridge)
┌─────────────────────▼───────────────────────────────────┐
│ Electron Main Process (src/main.js)                     │
│ - Python server launcher (dev: python3, prod: binary)   │
│ - P2P node (libp2p) for distributed inference           │
│ - System info (RAM/VRAM/GPU monitoring)                 │
│ - Electron Store (persistent data)                      │
│ - OpenClaw API (:3002) for webhook handling             │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP (Flask:65000, OpenClaw:3002)
┌─────────────────────▼───────────────────────────────────┐
│ Inference Backends                                      │
│ ├─ OpenClaw (port 3002): 21 LLM models, OpenAI-compat  │
│ └─ Flask (port 65000): Image/Audio/Video/Vision         │
└─────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main.js` | Electron main process - IPC handlers, P2P node, Python server spawn, OpenClaw API |
| `src/preload.js` | Context bridge exposing electronAPI to renderer |
| `src/renderer.ts` | Vue 3 app entry point |
| `src/App.vue` | Root component with tab-based navigation |
| `src/server/diffuser.py` | Flask ML server with all inference pipelines |
| `src/skills/flagship.js` | Model requirements, 13 companion definitions, 13 scenarios, skill mappings |
| `src/config/web3.config.js` | Network addresses, token contracts, level thresholds, Uniswap V4 addresses |
| `src/config/social.config.js` | Moltbook, OpenClaw, ERC-8004 companion NFT configuration |
| `src/services/web3.service.js` | Wallet connection via Reown AppKit (WalletConnect) |
| `src/services/companion.service.js` | Companion minting, metadata (ERC-8004), bare companion flow |
| `src/services/openclaw.handler.js` | OpenClaw webhook handler (uses flagship.js + store) |
| `src/services/lukso.service.js` | LUKSO Universal Profile integration (LSP23 factory) |
| `forge.config.mjs` | Electron Forge packaging, code signing, PyInstaller embedding |
| `hardhat.config.cjs` | Hardhat config (Solidity 0.8.20, sources: ./src/contracts) |
| `scripts/deploy-base-mvp.js` | Deploy script for 8 MVP contracts to Base |

## Components

### Main Components (`src/components/`)
| Component | Purpose |
|-----------|---------|
| `GenerativeText.vue` | LLM chat interface with 21 model options |
| `GenerativeImage.vue` | Image generation (4 modes: turbo/standard/advanced/quality) |
| `GenerativeVideo.vue` | Video generation (LTX-2, text-to-video + image-to-video) |
| `GenerativeAudio.vue` | TTS (Kokoro turbo, Qwen quality) + music (ACE-Step) |
| `Generative3D.vue` | 3D asset generation via AI-generated Three.js code |
| `GenerativeTraining.vue` | Model training (LeRobot integration) |
| `SmartAgent.vue` | Skill execution interface |
| `ThreeViewer.vue` | WebGL 3D preview renderer |
| `AccessRequirements.vue` | Level unlock UI (token holding or ETH payment) |
| `BonzaiBottomBar.vue` | Bottom navigation with wallet/level status |
| `MintModal.vue` | Content NFT minting modal (Base ERC-721 / LUKSO LSP8) |
| `ContextBanner.vue` | Contextual notifications banner |
| `NetworkSettings.vue` | Network configuration UI |

### Skill Components (`src/components/skills/`)
| Component | Purpose |
|-----------|---------|
| `RoleplayChat.vue` | Full companion roleplay with TTS, image, video generation (~9300 lines) |
| `BrowseAgents.vue` | Companion management, skill ownership, revenue, leaderboard |
| `SkillRunner.vue` | Generic skill execution UI |
| `SkillDownloader.vue` | Skill package download/install |
| `MeditationForgeSkill.vue` | Meditation experience generator |
| `DSLASkill.vue` | DSLA prediction market skill |
| `PolymarketSkill.vue` | Polymarket analysis skill |
| `TCGSkill.vue` | Trading card game insurance skill |

## Services (`src/services/`)

| Service | Purpose |
|---------|---------|
| `web3.service.js` | Reown AppKit wallet connection, multi-chain support |
| `companion.service.js` | Companion minting on Base, ERC-8004 metadata, bare companions |
| `companionToken.service.js` | Companion ERC-20 token launch via CompanionTokenFactory |
| `fineTuneToken.service.js` | Fine-tune model ERC-20 token launch via FineTuneTokenFactory |
| `contentNFT.service.js` | Content NFT minting on Base (ERC-721) and LUKSO (LSP8) |
| `mintPool.service.js` | MintPool epoch registration, claiming, pool queries |
| `skillOwnership.service.js` | Companion co-ownership registration, revenue claiming |
| `leaderboard.service.js` | Companion leaderboard (real data + mock fallback) |
| `agentWallet.service.js` | Local deterministic agent wallets for companions |
| `lukso.service.js` | LUKSO Universal Profile (LSP23 factory, LSP6 controller) |
| `auth.service.js` | JWT authentication for Flask server |
| `storage.service.js` | IPFS uploads via Pinata for metadata and content |
| `moltbook.service.js` | Moltbook social network API integration |
| `openclaw.handler.js` | OpenClaw webhook → companion response pipeline |
| `skill.service.js` | Skill loading, validation, execution |
| `level.service.js` | Level checking, unlock status |
| `token.service.js` | BONZAI token balance queries |
| `x402.service.js` | EIP-712 payment signatures for P2P inference |
| `x402Executor.service.js` | x402 payment execution |
| `p2p.contract.service.js` | Provider registry + payment contract interactions |
| `purchaseExecutor.service.js` | Autonomous purchase execution for companions |
| `sellerRegistry.service.js` | Seller/provider registration |
| `marketplace.service.js` | Order book marketplace |

## Stores (`src/stores/`)

| Store | Purpose |
|-------|---------|
| `inferenceStore.js` | Unified history for all generation types |
| `web3.store.js` | Wallet state, token balances, level status |
| `skillStore.js` | Loaded skills, execution state |
| `mintStore.js` | Content NFT minting state |
| `generationStore.js` | Active generation state |

## Inference Pipelines

### LLM Models (21 models via OpenClaw, port 3002)

All LLM inference goes through OpenClaw's OpenAI-compatible API at `/v1/chat/completions`.

**IMPORTANT: Model filenames are always lowercase** (e.g. `qwen3.5-27b-q2_k.gguf`, not `Qwen3.5-27B-Q2_K.gguf`). The download URL may use mixed case but the `filename` field in flagship.js and GenerativeText.vue must be lowercase.

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `llm_codestral_22b` | Codestral 22B | 13 GB | 16 GB |
| `llm_deepseek_r1_1_5b` | DeepSeek R1 1.5B | 1.1 GB | 2 GB |
| `llm_deepseek_r1_7b` | DeepSeek R1 7B | 4.7 GB | 6 GB |
| `llm_deepseek_r1_32b` | DeepSeek R1 32B | 19 GB | 24 GB |
| `llm_gemma_3_1b` | Gemma 3 1B | 0.8 GB | 2 GB |
| `llm_gpt_oss_20b` | GPT-OSS 20B | 12 GB | 14 GB |
| `llm_hermes_4_14b` | Hermes 4 14B | 9 GB | 10 GB |
| `llm_llama_2_7b` | LLaMA 2 7B | 4 GB | 6 GB |
| `llm_llama_3_1_8b` | LLaMA 3.1 8B | 5 GB | 6 GB |
| `llm_mistral_7b` | Mistral 7B | 4.4 GB | 6 GB |
| `llm_nemomix_12b_heretic` | NemoMix Unleashed 12B Heretic | 7.5 GB | 10 GB |
| `llm_phi_3_mini` | Phi-3 Mini | 2.4 GB | 4 GB |
| `llm_phi_4_mini` | Phi-4 Mini | 2.5 GB | 4 GB |
| `llm_qwen_2_5_3b` | Qwen 2.5 3B | 2 GB | 4 GB |
| `llm_qwen_coder_7b` | Qwen Coder 7B | 4.7 GB | 6 GB |
| `llm_qwen_coder_14b` | Qwen Coder 14B | 9 GB | 12 GB |
| `llm_qwen_coder_32b` | Qwen Coder 32B | 19 GB | 24 GB |
| `llm_qwen3_coder_30b` | Qwen3 Coder 30B | 18 GB | 24 GB |
| `llm_yi_coder_9b` | Yi Coder 9B | 5.5 GB | 8 GB |
| `llm_glm_4_7_flash` | GLM-4 7B Flash | 4.7 GB | 6 GB |
| `llm_qwen3_coder_next` | Qwen3 Coder Next | 18 GB | 24 GB |

### Flask Pipelines (port 65000)

| Pipeline | Endpoint | Description |
|----------|----------|-------------|
| `image_turbo` | `/image/turbo` | Fast image generation (FLUX Klein) |
| `image_quality` | `/image/quality` | High quality images (Z-Image Turbo) |
| `image_standard` | `/image/standard` | Standard diffusion (SDXL + LoRA, uncensored) |
| `image_advanced` | `/image/advanced` | Advanced generation (Z-Image Turbo) |
| `audio_turbo` | `/audio/turbo` | Fast TTS (Kokoro) |
| `audio_quality` | `/audio/quality/persona` | Persona-based TTS (Qwen3-TTS) |
| `music` | `/audio/music` | AI music with lyrics (ACE-Step) |
| `video_fast` | `/video` | Fast video generation (LTX-2, distilled, 8-10 steps) |
| `vision` | `/vision/analyze` | Vision analysis (Qwen3-VL) |

### NOT Supported
- **No 3D generation** - TRELLIS is not implemented (3D uses AI-generated Three.js code)
- **No music_quality** - Only single music endpoint via ACE-Step

## IPC Communication Pattern

Renderer → Main via `window.electronAPI.methodName()` (defined in preload.js)
Main handlers in `src/main.js` via `ipcMain.handle('channel', handler)`

Common channels:
- `model-*` - LLM model operations
- `store-*` - Persistent storage (Electron Store)
- `proxy-*` - External API proxying
- `get-system-info` - Hardware stats (RAM/VRAM/GPU)
- `p2p-*` - P2P network operations

## Web3 Integration

### Networks
- **Ethereum** (chainId 1) - BONZAI token
- **Arbitrum** (chainId 42161) - BONZAI token
- **Base** (chainId 8453) - BONZAI token, 8 MVP protocol contracts, Uniswap V4
- **LUKSO** (chainId 42) - Content NFT (LSP8), Universal Profile integration

### Wallet
- **Reown AppKit** (@reown/appkit) with MetaMask, Coinbase, Trust, Rabby
- WalletConnect for Electron (QR code for mobile wallets)
- Optional chains: Arbitrum, Base, LUKSO

### Token
- **BONZAI** (ERC-20) on Ethereum, Arbitrum, and Base
  - Ethereum: `0xDdA9Ff241C7160be8295EF9Eca2e782361467666`
  - Arbitrum: `0x0a84edf70f30325151631ce7a61307d1f4d619a3`
  - Base: `0xc4d137def384ee0f8857887f5950669ba04984ec`

### Level System — Mint Gating (NOT Generation Gating)

**IMPORTANT**: All AI generation is FREE (LVL0). Levels gate MINTING content as NFTs and co-owning revenue pools.

| Level | BONZAI Hold | Minting Rights | Pool Co-Ownership |
|-------|-------------|----------------|-------------------|
| LVL1 | 1,000 | Text NFTs | Text pool |
| LVL2 | 5,000 | Audio NFTs | Audio pool |
| LVL3 | 10,000 | Image NFTs | Image pool |
| LVL4 | 25,000 | Video NFTs | Video pool |
| LVL5 | 33,000 | 3D NFTs | 3D pool |
| LVL6 | 50,000 | Training NFTs, ERC-20 token issuance | Training pool |

- **Alternative**: 1 ETH one-time payment via BonzaiUnlock on Base unlocks ALL levels permanently
- **Unlocked users mint for free**: Both content NFTs (BonzaiCollectibles) and companions (BonzaiCompanions) have zero mint fee for users who have unlocked via BonzaiUnlock
- **Companion per-wallet cap**: Maximum 4 companions per wallet (MAX_PER_WALLET constant)
- Proceeds split: 50% Foundation / 50% Liquidity

### Treasury Wallets
- Foundation: `0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89`
- Liquidity: `0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93`

## Smart Contracts

### 8 MVP Contracts on Base (chainId 8453)

Deployed via `scripts/deploy-base-mvp.js`. All addresses set in `web3.config.js` after deployment.

| Contract | File | Purpose |
|----------|------|---------|
| `BonzaiUnlock` | `BonzaiUnlock.sol` | 1 ETH all-level unlock, 50/50 proceeds split |
| `BonzaiMintPool` | `BonzaiMintPool.sol` | 6 epoch-based revenue pools (weekly epochs, 256-block flash loan protection) |
| `BonzaiCollectibles` | `BonzaiCollectibles.sol` | ERC-721 content NFT (ERC-1167 clone per user), per-type mint fees (free for unlocked users), 80/20 fee split, ERC-2981 royalties (7.5%), ERC721-C |
| `BonzaiRoyaltySplitter` | `BonzaiRoyaltySplitter.sol` | Secondary royalty distribution (2/3 treasury, 1/3 pools weighted by activity) |
| `BonzaiCompanions` | `BonzaiCompanions.sol` | ERC-721 + ERC-8004 companion NFT, 10K max supply, 4 per wallet, spending profiles (uint96), 0.25 ETH mint (free for unlocked users) |
| `BonzaiUniswapHook` | `BonzaiUniswapHook.sol` | V4 afterSwap hook capturing 1% fee, deployed via CREATE2 for address flags |
| `CompanionTokenFactory` | `CompanionTokenFactory.sol` | Atomic ERC-20 + V4 LP for companions (1B supply, 96/4 split, LP locked at dead address) |
| `FineTuneTokenFactory` | `FineTuneTokenFactory.sol` | Atomic ERC-20 + V4 LP for fine-tuned models (same structure) |

### Additional Contracts
| Contract | File | Purpose |
|----------|------|---------|
| `BonzaiSkillRegistry` | `BonzaiSkillRegistry.sol` | Skill marketplace on Base (80% to co-owners, 20% platform) |
| `BonzaiSkillOwnership` | `BonzaiSkillOwnership.sol` | Companion co-ownership with attestation + weighted distribution |
| `BonzaiProviderRegistry` | `BonzaiProviderRegistry.sol` | P2P provider registration on Base |
| `BonzaiP2PPayment` | `BonzaiP2PPayment.sol` | P2P ETH payment processing |
| `CompanionToken` | `CompanionToken.sol` | Individual companion ERC-20 token (deployed by factory) |

### Uniswap V4 Addresses (Base)
- PoolManager: `0x498581ff718922c3f8e6a244956af099b2652b2b`
- PositionManager: `0x7c5f5a4bbd8fd63184577525326123b519429bdc`
- Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3`

### Hook Fee Splits
- **Companion tokens**: 33% treasury, 33% companion owner, 34% companion wallet
- **FineTune tokens**: 80% creator, 10% treasury, 10% MintPool (LVL6 training pool)

### Cross-Contract Wiring (performed after deployment)
```
Content  → MintPool, RoyaltySplitter
MintPool → Content, RoyaltySplitter, FeeHook
Hook     → CompanionFactory (authorized), FineTuneFactory (authorized)
CompanionFactory → Companions (NFT ownership check)
FineTuneFactory  → Content (NFT ownership check)
```

## P2P Distributed Inference

BonzAI supports peer-to-peer inference via libp2p with x402 ETH payments on Base.

### Network Modes
- **Local**: Run inference locally on your machine (default, FREE)
- **Provider**: Share your GPU with the network and earn ETH

### Architecture
- **Provider Registry**: Smart contract on Base for provider registration
- **Payment Contract**: ETH payments with EIP-712 signatures on Base
- **Platform Fee**: 2.5% on paid inference
- **Default Chain**: Base (8453) — cheap gas ~$0.001

### Pipeline Categories (for P2P)
```
0: LLM (all 21 models)
1: IMAGE_TURBO        5: AUDIO_TURBO
2: IMAGE_QUALITY       6: AUDIO_QUALITY
3: IMAGE_STANDARD      7: MUSIC
4: IMAGE_ADVANCED      8: VIDEO_FAST
                       9: VISION
                       10: VIDEO_QUALITY
```

## Companion System

### 13 Default Companions (defined in `flagship.js`)

| ID | Name | Gender | Age | Type |
|----|------|--------|-----|------|
| `aurore` | Aurore Beaumont | Female | 28 | Human |
| `mai` | Mai Tanaka | Female | 32 | Human |
| `marcus` | Marcus Ferrara | Male | 35 | Human |
| `james` | James Whitmore | Male | 40 | Human |
| `aria` | ARIA-7 | Female | N/A (appears 25) | Android |
| `kai` | KAI-9 | Male | N/A (appears 30) | Android |
| `damon` | Damon Rivers | Male | 34 | Human |
| `zara` | Zara Okonkwo | Female | 29 | Human |
| `jin` | Jin Chen | Male | 31 | Human |
| `priya` | Priya Sharma | Female | 30 | Human |
| `arjun` | Arjun Kapoor | Male | 36 | Human |
| `sofia` | Sofia Reyes | Female | 27 | Human |
| `miguel` | Miguel Santos | Male | 33 | Human |

### 13 Default Scenarios
`art_gallery_after_dark`, `private_kitchen`, `jungle_retreat`, `university_study`, `neon_apartment`, `tuscan_villa`, `recording_studio`, `fashion_atelier`, `shanghai_penthouse`, `mumbai_monsoon`, `urban_studio`, `rio_beach_studio`, `bollywood_set`

### Big 5 (OCEAN) Personality Model
Companions use the Big 5 personality traits for style/personality: `openness`, `conscientiousness`, `extraversion`, `agreeableness`, `neuroticism`. Defined as `BIG5_TRAITS` in `flagship.js`. Used for companion creation and spending profile generation.

### Spending Profile (12 categories)
Each companion has a spending profile with 12 categories (values 1-10), packed into a `uint96` on-chain (4 bits per category):
| Index | Category | Index | Category |
|-------|----------|-------|----------|
| 0 | education | 6 | housing |
| 1 | entertainment | 7 | beauty |
| 2 | fashion | 8 | reading |
| 3 | finance | 9 | social |
| 4 | food | 10 | sports |
| 5 | healthcare | 11 | travel |

### Companion NFT (Base Only)
- **Base** (ERC-8004): 0.25 ETH mint, 10K max supply, agent wallets, x402 support

### Content Levels
- **PG**: Family-friendly
- **PG-13**: Mild romantic content
- **Mature (R)**: Adult themes, suggestive
- **Adult (18+)**: Full creative freedom

### Age Validation
All companions must be 18+. Enforced via `validateCompanionAge()` in `flagship.js` with blocked terms and pattern matching.

### Multi-Modal Generation Pipeline
Text → Audio (Qwen TTS) → Image (GLM Flash prompt enhancement → FLUX/SDXL) → Video (LTX-2 with audio conditioning)

### Bare Companion Flow
Pre-reveal minting: `isBareCompanion()` detects pending companions, `finalizeCompanion()` completes setup, `buildBareRegistration()` generates placeholder metadata.

## Companion Skill Ownership System

Companions (ERC-721 NFTs on Base) can register as co-owners of skills. When a skill is purchased, 80% of ETH goes to registered companion co-owners, weighted by BONZAI balance and spending profile score.

### Revenue Flow
1. `BonzaiSkillRegistry.purchaseSkill()` on Base
2. 80% ETH → `BonzaiSkillOwnership.distributeRevenue()`
3. Weight = `BONZAI_balance(companionWallet) * profileScore`
4. Revenue credited to `unclaimedRevenue[wallet]` (purchase-time snapshot)
5. `claimRevenue()` withdraws accumulated ETH

### Registration Requirements
- Explicit opt-in via `registerCompanion()`
- Spending profile score >= 5 in skill's category
- EIP-191 attestation verifying NFT ownership + spending profile

## Content NFT Minting

### Base (ERC-721 via BonzaiCollectibles)
Each user gets their own collection clone (ERC-1167) via BonzaiCollectiblesFactory.

**Per-type mint fees** (natural LVL progression):

| Type | Index | Level | Mint Fee |
|------|-------|-------|----------|
| Text | 0 | LVL1 | 0.0005 ETH |
| Audio | 1 | LVL2 | 0.001 ETH |
| Image | 2 | LVL3 | 0.0015 ETH |
| Video | 3 | LVL4 | 0.0025 ETH |
| 3D | 4 | LVL5 | 0.0035 ETH |
| Training | 5 | LVL6 | 0.005 ETH |

- Fee split: 80% treasury, 20% to content-type pool (via MintPool)
- ERC-2981 royalties: 7.5%
- ERC721-C transfer validation (Limit Break)

### LUKSO (LSP8)
- Mint fee: 15 LYX
- NFT 2.0 standard with Universal Profile support

## MintPool Revenue System

- 6 pools (one per level/content type)
- Weekly epochs (604,800 seconds)
- BONZAI holders register per epoch → claim proportional share after finalization
- 256-block gap enforcement (flash loan protection)
- Pool thresholds: [1000, 5000, 10000, 25000, 33000, 50000] BONZAI
- Revenue sources: content mint fees (20%), hook pool fees, royalty splitter distributions
- Unclaimed funds sweepable after N+2 epochs

## Environment Variables

```
GITHUB_TOKEN          # For releases
VITE_PINATA_JWT       # IPFS/Pinata uploads
VITE_NFT_CONTRACT     # Smart contract address
BONZAI_SERVER_PORT    # Flask server port (default: 65000)
OPENCLAW_API_PORT     # OpenClaw LLM port (default: 3002)
DEPLOYER_PRIVATE_KEY  # For contract deployment
BASE_RPC_URL          # Base RPC endpoint (default: https://mainnet.base.org)
```

## Build System

- **Vite** - Three configs: main, preload, renderer (`vite.*.config.ts`)
- **Electron Forge** - App packaging and distribution
- **PyInstaller** - Compiles diffuser.py to platform binary for production
- **Hardhat** - Smart contract compilation and testing (Solidity 0.8.20, optimizer 200 runs, viaIR)
- **CI/CD** - GitHub Actions for build, code signing (macOS), and release

## Port Configuration

- Flask server: `65000` (env: `BONZAI_SERVER_PORT`)
- OpenClaw LLM: `3002` (env: `OPENCLAW_API_PORT`)
- OpenClaw Gateway: `18789` (for multi-channel chat)
- Model cache: `~/bonzai-models/`

## Social Integration

### Moltbook
- Reddit-like social platform for AI agents
- Companions auto-register, post autonomously, heartbeat engagement
- Config: `src/config/social.config.js` (MOLTBOOK_CONFIG)

### OpenClaw (Multi-Channel Chat)
- Gateway at port 18789 for WhatsApp, Telegram, Discord, Mattermost
- Webhooks forwarded to renderer via IPC (same code path as desktop UI)
- Config: `src/config/social.config.js` (OPENCLAW_CONFIG)

## Roleplay System

BonzAI includes a companion roleplay system with 13 pre-defined characters.

- **Companions**: Defined in `src/skills/flagship.js` (`DEFAULT_COMPANIONS`)
- **Scenarios**: 13 location-based roleplay settings (`DEFAULT_SCENARIOS`)
- **UI**: `src/components/skills/RoleplayChat.vue`
- **Features**:
  - Voice generation (Qwen TTS)
  - Image generation with enhanced LLM-based prompts (GLM Flash primary, Llama fallback)
  - Video generation (LTX-2) with audio conditioning
  - Memory persistence across sessions
  - User appearance description for consistent image generation
  - Content levels: PG, PG-13, Mature, Adult
  - Autonomous mode (companions act independently when user is away)
  - Import/export companion identity
  - Dynamic scene backgrounds with fade transitions and scroll-based anchoring

## Video Generation

| Endpoint | Model | Description |
|----------|-------|-------------|
| `/video` | LTX-2 (Turbo) | Distilled GGUF, ~10GB, 8-10 steps, t2v and i2v |

Request example:
```json
{
  "prompt": "A cat walking in the garden",
  "height": 480,
  "width": 768,
  "num_frames": 81,
  "fps": 24,
  "num_inference_steps": 30,
  "guidance_scale": 3.5,
  "image_base64": "..."
}
```

## Testing

Hardhat test suite with ~468 tests covering all 8 MVP contracts:
```bash
npm test              # Run all tests
npm run test:coverage # Coverage report
```

Test structure:
```
test/
  helpers/
    constants.js      # Shared values (prices, thresholds, durations)
    deploy.js         # loadFixture-based deployment helpers
  BonzaiUnlock.test.js
  BonzaiMintPool.test.js
  BonzaiContent.test.js
  BonzaiRoyaltySplitter.test.js
  BonzaiCompanions.test.js
  BonzaiUniswapHook.test.js
  CompanionTokenFactory.test.js
  FineTuneTokenFactory.test.js
  Integration.test.js
src/contracts/mocks/  # Mock contracts for testing
```

---

## Code Assistant Rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

### Rule 1 — Think Before Coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

### Rule 2 — Simplicity First
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

### Rule 3 — Surgical Changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

### Rule 4 — Goal-Driven Execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

### Rule 5 — Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

### Rule 6 — Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

### Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

### Rule 8 — Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

### Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

### Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

### Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

### Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.
