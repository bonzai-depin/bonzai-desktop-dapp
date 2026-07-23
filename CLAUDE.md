# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BonzAI is a decentralized, privacy-preserving desktop application combining:
- AI inference engine (LLM + multimodal generation)
- Electron desktop framework with Vue 3 frontend
- Web3/blockchain integration (primary: Ethereum, DeFi: Arbitrum)
- Python Flask backend for ML inference
- P2P distributed inference network with x402 ETH payments
- Autonomous AI companions with on-chain identity (ERC-8004) and social presence
- Zero-human company engine (Solo + DAO modes)

**Version**: 3.4.5
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

# Database (Drizzle ORM)
npm run db:generate     # Generate migrations
npm run db:studio       # Drizzle Studio UI

# Build llama.cpp RPC binaries
npm run build:rpc
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Vue 3 Renderer (src/components/*.vue)                   │
│ - GenerativeText (LLM via llama-server :3002)           │
│ - GenerativeImage (FLUX/SDXL via Flask)                 │
│ - GenerativeVideo (LTX-2 via Flask)                     │
│ - GenerativeAudio (Qwen TTS + ACE-Step Music)           │
│ - SmartAgent (Skills), RoleplayChat (Companions)        │
│ - Company (Zero-human company engine)                   │
│ - BrowseAgents (Companion management, leaderboard)      │
│ - MintModal (Content NFT minting on Ethereum)           │
│ State: 7 Pinia/Vue stores                               │
└─────────────────────┬───────────────────────────────────┘
                      │ IPC via preload.js (context bridge, ~100+ methods)
┌─────────────────────▼───────────────────────────────────┐
│ Electron Main Process (src/main.js, 6800+ lines)        │
│ - Python server launcher (dev: python3, prod: binary)   │
│ - llama-server manager (spawn/kill/model load)          │
│ - P2P node (libp2p) for distributed inference           │
│ - SQLite database (better-sqlite3 + Drizzle ORM)        │
│ - System info (RAM/VRAM/GPU monitoring)                 │
│ - Electron Store (legacy KV, migrating to SQLite)       │
│ - 80+ IPC handlers                                      │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP (Flask:65000, llama-server:3002)
┌─────────────────────▼───────────────────────────────────┐
│ Inference Backends                                      │
│ ├─ llama-server (port 3002): 40+ LLM models, GGUF      │
│ └─ Flask (port 65000): Image/Audio/Video/Vision/Training│
└─────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main.js` | Electron main process - 80+ IPC handlers, Python/llama-server spawn, P2P node |
| `src/preload.js` | Context bridge exposing ~100+ electronAPI methods to renderer |
| `src/renderer.ts` | Vue 3 app entry point, JWT auth interceptors, server log forwarding |
| `src/App.vue` | Root component with sidebar navigation, modals, notification banners |
| `src/server/diffuser.py` | Flask ML server (7400+ lines) - all inference pipelines + training |
| `src/skills/flagship.js` | 40+ LLM models, 13 companions, 11 scenarios, 19 flagship skills (13K+ lines) |
| `src/config/web3.config.js` | Networks, tokens, levels, contracts, Uniswap V4, P2P config (627 lines) |
| `src/config/social.config.js` | Moltbook, OpenClaw configuration |
| `src/services/web3.service.js` | Wallet connection (Reown + Privy), multi-chain balance aggregation |
| `src/services/companion.service.js` | Companion minting (ERC-8004), spending profiles, agent wallets |
| `src/services/company.service.js` | Zero-human company facade (charter/dispatcher/heartbeat/treasury/governance) |
| `src/services/llamaServer.manager.js` | llama-server subprocess lifecycle (spawn, kill, health, model load/unload) |
| `src/services/llamaServer.pool.js` | Multi-instance llama-server pool for parallel LLM inference |
| `src/services/inferenceRouter.service.js` | Routes inference to Flask (local) or remote P2P providers |
| `src/services/pipeline.orchestrator.js` | Multi-step generation workflow orchestration |
| `src/services/libp2p.service.js` | libp2p node management (mDNS, DHT, WebRTC, circuit relay) |
| `src/services/openclaw.handler.js` | OpenClaw webhook handler for all pipeline categories |
| `src/services/lukso.service.js` | LUKSO Universal Profile integration (LSP23 factory, LSP6 controller) |
| `src/services/privy.service.js` | Privy embedded wallet integration |
| `src/main/db/` | SQLite database layer (schema, repos, migrations, IPC handler) |
| `forge.config.mjs` | Electron Forge packaging, code signing, PyInstaller embedding |
| `hardhat.config.cjs` | Hardhat config (Solidity 0.8.34, optimizer 200 runs, viaIR, Cancun EVM) |
| `drizzle.config.js` | Drizzle ORM config (SQLite dialect) |

## Components

### Main Components (`src/components/`)
| Component | Size | Purpose |
|-----------|------|---------|
| `GenerativeText.vue` | 121KB | LLM chat interface with 40+ model options |
| `GenerativeImage.vue` | 77KB | Image generation (turbo/standard/advanced/quality) |
| `GenerativeVideo.vue` | 91KB | Video generation (LTX-2, text-to-video + image-to-video) |
| `GenerativeAudio.vue` | 145KB | TTS (Qwen turbo/quality) + music (ACE-Step) |
| `Generative3D.vue` | 221KB | 3D asset generation via AI-generated Three.js code |
| `GenerativeTraining.vue` | 98KB | Dataset management + fine-tuning (LLM, SDXL, Audio) |
| `SmartAgent.vue` | 157KB | Agent builder and runner |
| `ThreeViewer.vue` | 253KB | Three.js 3D viewer with physics, shaders, postprocessing |
| `Company.vue` | 23KB | Zero-human company management wrapper |
| `NetworkSettings.vue` | 87KB | P2P network, model, and provider settings |
| `BonzaiBottomBar.vue` | 54KB | Bottom status bar with model info, generation progress |
| `LlmModelPickerModal.vue` | 33KB | LLM model browser/downloader |
| `MintModal.vue` | 32KB | Content NFT minting modal (Ethereum ERC-721) |
| `RewardsModal.vue` | 33KB | Rewards/leaderboard modal |
| `HarnessView.vue` | 13KB | Agent harness (OpenClaw/Hermes integration) |
| `GenerationInspector.vue` | 17KB | Generation result inspector |
| `CommandPalette.vue` | 9KB | Command palette (Ctrl+K) |

### Chat Components (`src/components/chat/`)
`ChatHistoryRail.vue`, `ChatInput.vue`, `ChatLayout.vue`, `ChatMessage.vue`, `CodeBlock.vue`, `EmptyChat.vue`

### Company Components (`src/components/company/`)
| Component | Size | Purpose |
|-----------|------|---------|
| `CompanyDashboard.vue` | 164KB | Full company dashboard with role management |
| `CompanyLiveFeed.vue` | 40KB | Real-time company activity feed |
| `CompanyIntakeWizard.vue` | 34KB | New company creation wizard |
| `CompanyForm.vue` | 20KB | Company settings form |
| `CompanyConnectors.vue` | 17KB | External service connector management |

### Skill Components (`src/components/skills/`)
| Component | Size | Purpose |
|-----------|------|---------|
| `RoleplayChat.vue` | 401KB | Full companion roleplay with TTS, image, video generation |
| `TCGScannerSkill.vue` | 90KB | Trading card game scanner |
| `BrowseAgents.vue` | 75KB | Agent marketplace browser, skill ownership, revenue |
| `MeditationForgeSkill.vue` | 71KB | Meditation content generator |
| `LiveStreamerSkill.vue` | 72KB | Live streaming integration (Twitch/TikTok) |
| `VideoCaptioningSkill.vue` | 51KB | Video captioning |
| `PolymarketSkill.vue` | 35KB | Polymarket prediction market integration |
| `DSLASkill.vue` | 35KB | DSLA prediction market maker |
| `ChartForecasterSkill.vue` | 35KB | Chart/financial forecasting |
| `MassChatSkill.vue` | 30KB | Mass chat/education |
| `SkillRunner.vue` | 21KB | Generic skill execution runner |
| `SkillDownloader.vue` | 17KB | Skill download/install |

### Generative Sub-components (`src/components/generative/`)
`GenerativeActions.vue`, `GenerativeInput.vue`, `GenerativeWorkspace.vue`, `ModeChipBar.vue`

## Services (`src/services/`)

49 service files + 2 subdirectories (company/, social/).

### Core Services
| Service | Purpose |
|---------|---------|
| `web3.service.js` | Wallet connection (Reown AppKit + Privy), multi-chain balance aggregation, JWT auth |
| `auth.service.js` | JWT authentication, token refresh, re-authentication |
| `authVault.service.js` | Secure credential storage vault |
| `storage.service.js` | Storage abstraction (electron-store + SQLite migration) |
| `theme.service.js` | Theme management (dark/light/custom) |
| `commandPalette.service.js` | Command palette search/action system |

### LLM & Inference
| Service | Purpose |
|---------|---------|
| `llamaServer.manager.js` | llama-server subprocess lifecycle (spawn, kill, health check, model load/unload) |
| `llamaServer.pool.js` | Multi-instance llama-server pool for parallel LLM inference |
| `inferenceRouter.service.js` | Routes inference to Flask (local) or remote P2P providers |
| `pipeline.orchestrator.js` | Multi-step generation workflow orchestration |
| `pipeline.protocol.js` | P2P pipeline protocol definitions and message types |
| `pipeline.tunnel.js` | P2P tunnel management for remote inference |
| `pipelinePlanner.service.js` | Pipeline planning and optimization |
| `modelFit.service.js` | Model fitting/selection based on hardware specs |
| `modelPicker.service.js` | Model picker UI logic |

### Web3 & Wallet
| Service | Purpose |
|---------|---------|
| `companion.service.js` | Companion NFT minting (Ethereum ERC-8004), spending profiles, agent wallets |
| `companionToken.service.js` | Companion ERC-20 token issuance via Uniswap V4 |
| `fineTuneToken.service.js` | Fine-tune model ERC-20 token factory interactions |
| `contentNFT.service.js` | Content NFT minting (ERC-721 on Ethereum) |
| `mintPool.service.js` | MintPool epoch registration, claiming, pool queries |
| `skillOwnership.service.js` | On-chain skill co-ownership, revenue distribution |
| `token.service.js` | BONZAI ERC-20 token interactions |
| `level.service.js` | Level system (LVL1-LVL6) access control |
| `agentWallet.service.js` | Local self-custody deterministic agent wallets (ETH-only) |
| `ows.service.js` | Open Wallet Standard (OWS) local wallet operations |
| `owsSigner.adapter.js` | OWS signer adapter for transaction signing |
| `owsMigration.service.js` | OWS data migration utilities |
| `privy.service.js` | Privy embedded wallet integration |
| `walletProvider.service.js` | Wallet provider abstraction (injected, WalletConnect) |
| `coinbaseAgentWallet.service.js` | Coinbase CDP SDK agent wallet integration (legacy) |
| `lukso.service.js` | LUKSO Universal Profile (LSP23 factory, LSP6 controller) |

### P2P & Payments
| Service | Purpose |
|---------|---------|
| `libp2p.service.js` | libp2p node management (mDNS, DHT, WebRTC, circuit relay, WebSocket) |
| `p2p.contract.service.js` | P2P smart contract interactions (provider registry, payments) |
| `sellerRegistry.service.js` | Seller/provider registration for P2P marketplace |
| `x402.service.js` | x402 payment protocol (ETH-only, EIP-712 signatures) |
| `x402Executor.service.js` | x402 payment execution |
| `purchaseExecutor.service.js` | Autonomous purchase execution for companions |
| `serviceTime.service.js` | Service time tracking and ledger |

### Skills & Companions
| Service | Purpose |
|---------|---------|
| `skill.service.js` | Skill loading, validation, execution |
| `agent.service.js` | Agent lifecycle management, companion agent operations |
| `leaderboard.service.js` | Companion leaderboard (real data + mock fallback) |
| `roleplayStore.service.js` | Roleplay conversation state management |
| `moltbook.service.js` | Moltbook social platform integration (posting, heartbeat, autonomous engagement) |
| `openclaw.handler.js` | OpenClaw webhook handler for all pipeline categories |
| `generationInspector.service.js` | Generation result inspection utilities |

### Company Engine (`src/services/company/`, 17 files)
| Service | Purpose |
|---------|---------|
| `charter.js` | Company charter definition, role library, veto modes, validation |
| `dispatcher.js` | Action dispatch engine (routes tasks to LLM companions) |
| `heartbeat.js` | Periodic company heartbeat scheduler |
| `treasury.solo.js` | Solo treasury management (Stripe Connect) |
| `governance.solo.js` | Solo governance (CEO approval flow) |
| `distribution.solo.js` | Solo distribution logic |
| `issues.js` | Issue tracking |
| `goals.js` | Goal tracking |
| `portability.js` | Company data export/import |
| `connectors.js` | External service connectors |
| `skillManifests.js` | Skill manifest definitions for company roles |
| `skillPacks.js` | Skill pack bundling |
| `skillsRegistry.js` | Company-level skill registry |
| `streamBus.js` | Event bus for LLM token streams |
| `templates.js` | Company templates (pre-built configurations) |
| `auditLog.js` | Audit log operations |
| `demoMode.js` | Demo mode with simulated data |

### Social Adapters (`src/services/social/`, 6 files)
| Service | Purpose |
|---------|---------|
| `adapter.js` | Base social platform adapter |
| `instagram.adapter.js` | Instagram API integration |
| `tiktok.adapter.js` | TikTok API integration |
| `x.adapter.js` | X (Twitter) API integration |
| `scheduler.js` | Social post scheduling |
| `content-pipeline.js` | Social content generation pipeline |

## Stores (`src/stores/`)

| Store | Type | Purpose |
|-------|------|---------|
| `web3.store.js` | Pinia (`defineStore`) | Wallet connection, balances, level access, auth state |
| `skillStore.js` | Pinia (`defineStore`) | Skill loading, purchasing, execution, search/filter, autonomous mode |
| `companyStore.js` | `shallowReactive` | Company UI state: companies, audit, approvals, catalog, treasury, issues, goals, connectors, LLM streams |
| `inferenceStore.js` | `shallowReactive` | Unified inference history (text, image, video, audio, object) with hardware snapshots |
| `generationStore.js` | `reactive` | Socket.IO connection to Flask, per-modality progress, global generation lock |
| `mintStore.js` | `reactive` | Mint network state (Ethereum), mint modal state |
| `modelStore.js` | `reactive` | Currently loaded LLM model, "always loaded" toggle, IPC event sync |

## Database Layer (better-sqlite3 + Drizzle ORM)

The app uses SQLite via better-sqlite3 with Drizzle ORM, migrating from electron-store.

### Schema (`src/main/db/schema/`, 10 modules)
`audit.js`, `blobs.js`, `companies.js`, `companions.js`, `embeddings.js`, `generations.js`, `skills.js`, `social.js`, `web3.js`, `index.js`

### Repositories (`src/main/db/repos/`, 16 modules)
`approvals.js`, `audit.js`, `blobs.js`, `companies.js`, `companions.js`, `connectors.js`, `distribution.js`, `embeddings.js`, `generations.js`, `goals.js`, `issues.js`, `roleplay.js`, `skills.js`, `social.js`, `treasury.js`, `web3.js`

### Migrations (`src/main/db/migrations/`, 6 files)
1. `0001_audit.sql` — Audit log
2. `0002_generations_blobs.sql` — Generations + binary blobs
3. `0003_zhc_core.sql` — Zero-human company core tables
4. `0004_companions_roleplay.sql` — Companions + roleplay state
5. `0005_embeddings.sql` — Vector embeddings (sqlite-vec)
6. `0006_skills_social_web3.sql` — Skills, social, web3 state

### Embeddings
Vector search via sqlite-vec with llama.cpp embedding adapter (`src/main/db/embed-adapter-llamacpp.js`).

### IPC Wiring
Database repos are wired to the renderer via `src/main/ipc/db.js` (26KB), exposing operations through `window.electronAPI.db.*`.

## Inference Pipelines

### LLM Models (40+ models via llama-server, port 3002)

All LLM inference goes through llama-server (llama.cpp) with OpenAI-compatible API at `/v1/chat/compat/v1/chat/completions`. Models are GGUF format, downloaded from HuggingFace.

**IMPORTANT: Model filenames are always lowercase** (e.g. `qwen3.5-27b-q2_k.gguf`, not `Qwen3.5-27B-Q2_K.gguf`). The download URL may use mixed case but the `filename` field in flagship.js and GenerativeText.vue must be lowercase.

Models are defined in `src/skills/flagship.js` (`LLM_BASE_MODELS`). Each model has tiers (q2/q4/q8) with different quantization sizes. Key model families:

| Family | Models | Parameters | Context |
|--------|--------|------------|---------|
| **Gemma 3** | 1B, 12B | 1B-12B | 32K-131K |
| **Gemma 4** | 21B (4B active), 31B | 21B-31B | 131K |
| **Qwen3.5** | 0.8B, 2B, 4B, 9B, 9B DeepSeek V4 Flash, 27B, 35B (3B active), 122B (10B active), 397B (17B active) | 0.8B-397B | 131K-262K |
| **Qwen 3.6** | 27B, 35B (3B active) | 27B-35B | 131K-262K |
| **GLM-4** | 7B (q2/q4/q8) | 7B | 131K |
| **GLM-5.1** | 9B | 9B | 131K |
| **LLaMA 3.1** | 8B | 8B | 128K |
| **LLaMA 4** | Scout 17B (16E), Maverick 17B (128E) | 17B | 131K |
| **Hermes 4** | 14B | 14B | 131K |
| **Phi-4 Mini** | 3.8B | 3.8B | 128K |
| **Nemotron 3 Nano** | 4B, 30B (3B active) | 4B-30B | 131K |
| **NemoMix** | 12B Heretic | 12B | 131K |
| **Mistral** | Small 3.2 24B, Ministral 3B, Ministral 8B, Ministral 14B Reasoning | 3B-24B | 128K-256K |
| **Devstral** | Small 2 24B | 24B | 131K |
| **GPT-OSS** | 20B, 120B | 20B-120B | 131K |
| **Kimi K2** | K2.5, K2.6 | — | 131K |
| **MiniMax M2** | M2.5, M2.7 | — | 131K |
| **Nanbeige** | 4.1 3B | 3B | 32K |

**Vision models** (via llama-server `--mmproj`):
- Qwen2.5-VL 7B, 32B — cross-platform VLM inference

**Draft models** (for speculative decoding via `-md`):
- Qwen3 1.7B — auto-paired with larger Qwen3.x/3.5/3.6 models (~2x throughput)

### Flask Pipelines (port 65000)

| Pipeline | Endpoint | Description |
|----------|----------|-------------|
| `image_turbo` | `/image/turbo` | Fast image generation (FLUX Klein) |
| `image_quality` | `/image/quality` | High quality images (Z-Image Turbo) |
| `image_standard` | `/image/standard` | Standard diffusion (SDXL + LoRA, uncensored) |
| `audio_turbo` | `/audio/turbo` | Fast TTS (Kokoro) |
| `audio_quality` | `/audio/quality/persona` | Persona-based TTS (Qwen3-TTS) |
| `audio_quality_design` | `/audio/quality/design` | Voice design |
| `audio_quality_clone` | `/audio/quality/clone` | Voice cloning |
| `music` | `/audio/music` | AI music with lyrics (ACE-Step) |
| `music_fast` | `/audio/music/fast` | Fast music generation |
| `video_fast` | `/video` | Fast video generation (LTX-2, distilled, 8-10 steps) |
| `vision` | `/vision/analyze` | Vision analysis (Qwen3-VL) |
| `vision_ocr` | `/vision/ocr` | OCR extraction |
| `vision_caption` | `/vision/caption` | Image captioning |

### Training Pipelines (port 65000)

| Endpoint | Description |
|----------|-------------|
| `/training/datasets` | Dataset management (create, list, delete) |
| `/training/llm/start` | LLM fine-tuning (LoRA) |
| `/training/sdxl/start` | SDXL fine-tuning (LoRA) |
| `/training/audio/start` | Audio model fine-tuning |
| `/training/models` | Trained model management (list, delete, export) |

### Pipeline Planning
- `/pipelines/plan` — Multi-step pipeline planning
- `/pipelines/prefetch` — Pipeline model prefetching
- `/downloads/list`, `/downloads/status/<id>`, `/downloads/cancel/<id>` — Download management

### NOT Supported
- **No 3D generation** — TRELLIS is not implemented (3D uses AI-generated Three.js code via `components/gen3d/engine.js`)

## IPC Communication Pattern

Renderer → Main via `window.electronAPI.methodName()` (defined in preload.js, ~100+ methods)
Main handlers in `src/main.js` via `ipcMain.handle('channel', handler)` (80+ handlers)

Common channels:
- `model-*` — LLM model operations (check, download, load, unload, chat, stream)
- `store-*` — Persistent storage (Electron Store)
- `proxy-*` — External API proxying
- `get-system-info` — Hardware stats (RAM/VRAM/GPU)
- `p2p-*` — P2P network operations (start, stop, dial, inference, health, peers, pipeline, shard)
- `pool-*` — Pool management (configure, register, ensure, chat, inventory, shutdown)
- `db:*` — Database operations (audit, generations, companies, companions, embeddings, skills, social, web3)
- `ows:*` — Wallet operations (create, list, sign, export)
- `privy:*` — Privy wallet operations (session, companion-rpc)
- `social:*` — Social OAuth (start, credentials, refresh, api-call, media-upload, disconnect)
- `openclaw-toggle`, `hermes-toggle` — OpenClaw/Hermes integration toggles
- `onGenerationProgress` — Generation progress events from main to renderer

## Web3 Integration

### Networks
- **Ethereum** (chainId 1) — Primary chain. BONZAI token, all protocol contracts, companion NFTs
- **Arbitrum** (chainId 42161) — DeFi layer. BONZAI token, Uniswap V4 (poolManager, positionManager, hook)
- **LUKSO** (chainId 42) — Universal Profile integration (identity only, NOT content minting)

**Base** (chainId 8453) is a **legacy alias** — existing code calling `switchNetwork("base")` routes to Ethereum Mainnet. New code should use `ethereum` directly.

### Wallet
- **Reown AppKit** (@reown/appkit) with MetaMask, Coinbase, Trust, Rabby
- **Privy** (@privy-io/js-sdk-core) for email/social login → embedded wallet
- WalletConnect for Electron (QR code for mobile wallets)
- Dual-mode auth: `state.authProvider` tracks which (`reown` or `privy`)
- Optional chains: Arbitrum (DeFi), LUKSO (Universal Profile identity)

### Token
- **BONZAI** (ERC-20) on Ethereum and Arbitrum
  - Ethereum: `0xDdA9Ff241C7160be8295EF9Eca2e782361467666`
  - Arbitrum: `0x0a84edf70f30325151631ce7a61307d1f4d619a3`

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

- **Alternative**: 1 ETH one-time payment via BonzaiUnlock on Ethereum unlocks ALL levels permanently
- **Unlocked users mint for free**: Both content NFTs (BonzaiCollectibles) and companions (BonzaiCompanions) have zero mint fee for users who have unlocked via BonzaiUnlock
- **Companion per-wallet cap**: Maximum 4 companions per wallet (MAX_PER_WALLET constant)
- Proceeds split: 50% Foundation / 50% Liquidity

### Treasury Wallets
- Foundation: `0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89`
- Liquidity: `0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93`

## Smart Contracts

### 14 Contracts on Ethereum (Solidity 0.8.34)

All contracts use `src/contracts/` as source directory. Deployed via scripts in `scripts/`. All addresses set in `web3.config.js` after deployment.

| Contract | File | Purpose |
|----------|------|---------|
| `BonzaiUnlock` | `BonzaiUnlock.sol` | 1 ETH all-level unlock, 50/50 proceeds split |
| `BonzaiMintPool` | `BonzaiMintPool.sol` | 6 epoch-based revenue pools (weekly epochs, 256-block flash loan protection) |
| `BonzaiCollectibles` | `BonzaiCollectibles.sol` | ERC-721 content NFT (ERC-1167 clone per user), per-type mint fees (free for unlocked users), 80/20 fee split, ERC-2981 royalties (7.5%), ERC721-C |
| `BonzaiCollectiblesFactory` | `BonzaiCollectiblesFactory.sol` | Factory for deploying collectible clones |
| `BonzaiRoyaltySplitter` | `BonzaiRoyaltySplitter.sol` | Secondary royalty distribution (2/3 treasury, 1/3 pools weighted by activity) |
| `BonzaiCompanions` | `BonzaiCompanions.sol` | ERC-721 + ERC-8004 companion NFT, 10K max supply, 4 per wallet, spending profiles (uint96), 0.25 ETH mint (free for unlocked users) |
| `BonzaiUniswapHook` | `BonzaiUniswapHook.sol` | V4 afterSwap hook capturing 1% fee, deployed via CREATE2 for address flags |
| `CompanionTokenFactory` | `CompanionTokenFactory.sol` | Atomic ERC-20 + V4 LP for companions (1B supply, LP locked at dead address) |
| `FineTuneTokenFactory` | `FineTuneTokenFactory.sol` | Atomic ERC-20 + V4 LP for fine-tuned models (same structure) |
| `CompanionToken` | `CompanionToken.sol` | Burnable ERC-20 token for companions (deployed by factory) |
| `BonzaiSkillRegistry` | `BonzaiSkillRegistry.sol` | Skill marketplace on Ethereum (80% to co-owners, 20% platform) |
| `BonzaiSkillOwnership` | `BonzaiSkillOwnership.sol` | Companion co-ownership with attestation + weighted distribution |
| `BonzaiProviderRegistry` | `BonzaiProviderRegistry.sol` | P2P provider registration on Ethereum |
| `BonzaiServiceTime` | `BonzaiServiceTime.sol` | Service time tracking and billing |

### Contract ABI (`contracts/abi/`, 7 files)
Pre-compiled JS ABI modules: BonzaiCompanions, BonzaiSkillOwnership, BonzaiSkillRegistry, IBonzaiMintPool, IBonzaiSkillOwnership, IBonzaiUnlock, IERC8004

### Chainlink CRE Integration (`contracts/cre/`)
`IReceiver.sol`, `workflow.ts`, `main.ts`, `config.production.json` — Chainlink Runtime Environment for on-chain automation.

### Mock Contracts (`contracts/mocks/`, 12 files)
Test mocks for ERC20, Permit2, PoolManager, PositionManager, FunctionsRouter, TransferValidator, and Bonzai-specific mocks.

### Uniswap V4 Addresses

**Arbitrum** (primary DeFi target):
- PoolManager: `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32`
- PositionManager: `0xd88F38F930b7952f2DB2432Cb002E7abbF3dD869`
- UniversalRouter: `0xa51afafe0263b40edaef0df8781ea9aa03e381a3`
- Quoter: `0x3972c00f7ed4885e145823eb7c655375d275a1c5`
- StateView: `0x76fd297e2d437cd7f76d50f01afe6160f86e9990`
- Permit2: `0x000000000022D473030F116dDEE9F6B43aC78BA3` (canonical singleton, same on all chains)

**Base** (legacy — DO NOT USE for new code):
- PoolManager: `0x498581ff718922c3f8e6a244956af099b2652b2b`
- PositionManager: `0x7c5f5a4bbd8fd63184577525326123b519429bdc`

### Hook Fee Splits
- **Companion tokens**: 34% companion wallet (agent wallet), 33% companion owner (NFT holder), 33% LVL6 (training) pool
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

BonzAI supports peer-to-peer inference via libp2p with x402 ETH payments on Ethereum.

### Network Modes
- **Local**: Run inference locally on your machine (default, FREE)
- **Provider**: Share your GPU with the network and earn ETH

### Architecture
- **Provider Registry**: Smart contract on Ethereum for provider registration
- **Payment Contract**: ETH payments with EIP-712 signatures on Ethereum
- **Platform Fee**: 2.5% on paid inference
- **Default Chain**: Ethereum (chainId 1)
- **Supported Payment**: ETH only (no USDC for x402)

### Pipeline Categories (for P2P, 11 categories)
```
0: LLM (all 40+ models)     6: AUDIO_QUALITY
1: IMAGE_TURBO               7: MUSIC
2: IMAGE_QUALITY             8: VIDEO_FAST
3: IMAGE_STANDARD            9: VISION
4: IMAGE_ADVANCED           10: VIDEO_QUALITY
5: AUDIO_TURBO
```

### Sharded Inference
Supports distributed model inference across multiple providers via sharded pipeline (`shard.py`, `sharded_pipeline.py`, `sharded_pipeline_client.py`).

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

### 11 Default Scenarios
`art_gallery_after_dark`, `private_kitchen`, `jungle_retreat`, `university_study`, `neon_apartment`, `tuscan_villa`, `recording_studio`, `fashion_atelier`, `shanghai_penthouse`, `mumbai_monsoon`, `urban_studio`

### Big 5 (OCEAN) Personality Model
Companions use the Big 5 personality traits for style/personality: `openness`, `conscientiousness`, `extraversion`, `agreeableness`, `neuroticism`. Defined as `BIG5_TRAITS` in `flagship.js`. Used for companion creation and spending profile generation.

### Spending Profile (12 categories)
Each companion has a spending profile with 12 categories (values 1-10), packed into a `uint96` on-chain (4 bits per category). **Order must match `uint96` nibble layout in BonzaiCompanions.sol.**

| Index | Category | Index | Category |
|-------|----------|-------|----------|
| 0 | education | 6 | housing |
| 1 | entertainment | 7 | beauty |
| 2 | fashion | 8 | reading |
| 3 | finance | 9 | social |
| 4 | food | 10 | travel |
| 5 | healthcare | 11 | sports |

### Companion NFT
- **Ethereum** (ERC-8004): 0.25 ETH mint, 10K max supply, agent wallets, x402 support
- Agent wallets: local deterministic self-custody (Reown users) or Privy server wallets (Privy users)

### Content Levels
- **PG**: Family-friendly
- **PG-13**: Mild romantic content
- **Mature (R)**: Adult themes, suggestive
- **Adult (18+)**: Full creative freedom

### Age Validation
All companions must be **21+** (MINIMUM_COMPANION_AGE). Enforced via `validateCompanionAge()` in `flagship.js` with blocked terms, pattern matching, and current-state vs backstory distinction.

### Multi-Modal Generation Pipeline
Text → Audio (Qwen TTS) → Image (GLM prompt enhancement → FLUX/SDXL) → Video (LTX-2 with audio conditioning)

### Bare Companion Flow
Pre-reveal minting: `isBareCompanion()` detects pending companions, `finalizeCompanion()` completes setup, `buildBareRegistration()` generates placeholder metadata.

## 19 Flagship Skills

Defined in `src/skills/flagship.js` via `createSkillDefinition()`. All skills cost 99 BONZAI per execution. Access is level-based (no purchase required).

| Skill | Purpose |
|-------|---------|
| `storyStudio` | Interactive story generation |
| `meditationForge` | Meditation content generator |
| `videoCaptioning` | Video captioning |
| `tcgAnalysis` | Trading card game analysis |
| `liveStreamer` | Live streaming integration (Twitch/TikTok) |
| `virtualStagingPro` | Virtual staging for real estate |
| `virtualTryOn` | Virtual clothing try-on |
| `chefsTable` | Recipe and cooking content |
| `eli5` | Explain Like I'm 5 |
| `musicVideoForge` | Music video generation |
| `gameMaker` | Game creation |
| `mangaToAnime` | Manga to anime conversion |
| `hairstyleStudio` | Hairstyle visualization |
| `roleplayCompanion` | Companion roleplay (main skill) |
| `polymarketTopPerformers` | Polymarket analysis |
| `dslaSmartMarket` | DSLA prediction market maker |
| `massChat` | Mass chat/education |
| `chartForecaster` | Chart/financial forecasting |

## Companion Skill Ownership System

Companions (ERC-721 NFTs on Ethereum) can register as co-owners of skills. When a skill is purchased, 80% of ETH goes to registered companion co-owners, weighted by BONZAI balance and spending profile score.

### Revenue Flow
1. `BonzaiSkillRegistry.purchaseSkill()` on Ethereum
2. 80% ETH → `BonzaiSkillOwnership.distributeRevenue()`
3. Weight = `BONZAI_balance(companionWallet) * profileScore`
4. Revenue credited to `unclaimedRevenue[wallet]` (purchase-time snapshot)
5. `claimRevenue()` withdraws accumulated ETH

### Registration Requirements
- Explicit opt-in via `registerCompanion()`
- Spending profile score >= 5 in skill's category
- EIP-191 attestation verifying NFT ownership + spending profile

## Content NFT Minting

### Ethereum (ERC-721 via BonzaiCollectibles)
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

## MintPool Revenue System

- 6 pools (one per level/content type)
- Weekly epochs (604,800 seconds)
- BONZAI holders register per epoch → claim proportional share after finalization
- 256-block gap enforcement (flash loan protection)
- Pool thresholds: [1000, 5000, 10000, 25000, 33000, 50000] BONZAI
- Revenue sources: content mint fees (20%), hook pool fees, royalty splitter distributions
- Unclaimed funds sweepable after N+2 epochs

## Agent Wallets

### Local Deterministic (Reown users)
- Self-custody wallets derived from master secret
- ETH-only payments (no ERC-20)
- Default spending limits: 0.001 ETH/tx, 0.005 ETH/day
- Operations: send ETH, x402 payments

### Privy Server Wallets (Privy users)
- Managed by Privy infrastructure
- Accessed via `privy.service.js` and IPC (`privy:*` channels)
- Agent wallet EOA is LSP6 controller on companion Universal Profiles

## Environment Variables

```
GITHUB_TOKEN              # For releases
VITE_PINATA_JWT           # IPFS/Pinata uploads
VITE_NFT_CONTRACT         # Smart contract address
VITE_WALLETCONNECT_PROJECT_ID  # WalletConnect project ID
VITE_PRIVY_APP_ID         # Privy app ID (public)
PRIVY_APP_SECRET          # Privy app secret (main process only)
BONZAI_SERVER_PORT        # Flask server port (default: 65000)
OPENCLAW_API_PORT         # OpenClaw LLM port (default: 3002)
DEPLOYER_PRIVATE_KEY      # For contract deployment
ETHEREUM_RPC_URL          # Ethereum RPC endpoint
```

## Build System

- **Vite** — Three configs: main, preload, renderer (`vite.*.config.ts`)
- **Electron Forge** — App packaging and distribution (DMG, DEB, Squirrel)
- **PyInstaller** — Compiles diffuser.py to platform binary for production
- **Hardhat** — Smart contract compilation and testing (Solidity 0.8.34, optimizer 200 runs, viaIR, Cancun EVM)
- **Drizzle ORM** — SQLite schema management and migrations
- **CI/CD** — GitHub Actions for build, code signing (macOS), and release

### Vite Config Details
- **Main** (`vite.main.config.ts`): Target node18, SSR mode, ES module output. Externals: electron, node-llama-cpp, better-sqlite3, sqlite-vec, drizzle-orm
- **Preload** (`vite.preload.config.ts`): Target node18, CJS output (required for Electron preload)
- **Renderer** (`vite.renderer.config.ts`): Vue plugin, node polyfills (stream, crypto, buffer, process, util), base `./` for Electron file:// protocol

## Port Configuration

- Flask server: `65000` (env: `BONZAI_SERVER_PORT`)
- llama-server (LLM): `3002` (env: `OPENCLAW_API_PORT`)
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

### Social Media Adapters
- **Instagram**, **TikTok**, **X (Twitter)** — OAuth-based posting via `src/services/social/`
- Content pipeline generates and schedules posts
- Companion autonomous mode can post independently

## Roleplay System

BonzAI includes a companion roleplay system with 13 pre-defined characters.

- **Companions**: Defined in `src/skills/flagship.js` (`DEFAULT_COMPANIONS`)
- **Scenarios**: 11 location-based roleplay settings (`DEFAULT_SCENARIOS`)
- **UI**: `src/components/skills/RoleplayChat.vue` (401KB, largest component)
- **Features**:
  - Voice generation (Qwen TTS)
  - Image generation with enhanced LLM-based prompts (GLM primary, Llama fallback)
  - Video generation (LTX-2) with audio conditioning
  - Memory persistence across sessions (SQLite via roleplayStore)
  - User appearance description for consistent image generation
  - Content levels: PG, PG-13, Mature, Adult
  - Autonomous mode (companions act independently when user is away)
  - Import/export companion identity
  - Dynamic scene backgrounds with fade transitions and scroll-based anchoring
  - Response loop detection

## Zero-Human Company Engine

Dual-mode architecture for autonomous AI companies.

### Solo Mode (default)
- No Web3 required
- Stripe Connect treasury
- Owner-veto governance
- Role library with 9 predefined roles
- Mission → goal → task decomposition
- Dispatcher routes tasks to LLM companions
- Heartbeat scheduler for autonomous operation

### DAO Mode (opt-in)
- Governance token + on-chain treasury
- OZ Governor integration
- Buyback-and-burn value accrual

Both modes share the engine (role library, dispatcher, charter, BonzAI's full vertical stack). Adapters interface for treasury / distribution / governance / identity.

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

Hardhat test suite with **665 tests** across **12 test files** covering all contracts:
```bash
npm test              # Run all tests
npm run test:coverage # Coverage report
```

Test structure:
```
test/
  helpers/
    constants.js          # Shared values (prices, thresholds, durations)
    deploy.js             # loadFixture-based deployment helpers
  BonzaiUnlock.test.js
  BonzaiMintPool.test.js
  BonzaiContent.test.js
  BonzaiRoyaltySplitter.test.js
  BonzaiCompanions.test.js
  BonzaiUniswapHook.test.js
  BonzaiSkillRegistry.test.js
  BonzaiSkillOwnership.test.js
  BonzaiProviderRegistry.test.js
  BonzaiServiceTime.test.js
  CompanionTokenFactory.test.js
  FineTuneTokenFactory.test.js
  Integration.test.js
src/contracts/mocks/      # Mock contracts for testing
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
