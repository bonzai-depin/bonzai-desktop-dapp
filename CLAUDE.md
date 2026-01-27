# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BonzAI is a decentralized, privacy-preserving desktop application combining:
- AI inference engine (LLM + multimodal generation)
- Electron desktop framework with Vue 3 frontend
- Web3/blockchain integration (NFT minting, wallet connection)
- Python Flask backend for ML inference

## Development Commands

```bash
# Install dependencies
npm install
pip install -r src/server/requirements.txt

# Start development (Electron + hot reload + Flask server auto-spawn)
npm run start

# Linting
npm run lint

# Build distribution packages (DMG/DEB/ZIP)
npm run make

# Publish to GitHub releases
npm run publish
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Vue 3 Renderer (src/components/*.vue)                   │
│ - GenerativeText (local llama-cpp)                      │
│ - GenerativeImage (FLUX/SDXL via Flask)                 │
│ - GenerativeVideo (LTX-2 via Flask)                     │
│ - GenerativeMusic (ChatterBox via Flask)                  │
│ - Generative3D, GenerativeRobot, SmartAgent             │
│ State: Pinia (inferenceStore.js, web3.store.js)         │
└─────────────────────┬───────────────────────────────────┘
                      │ IPC via preload.js (context bridge)
┌─────────────────────▼───────────────────────────────────┐
│ Electron Main Process (src/main.js)                     │
│ - Python server launcher (dev: python3, prod: binary)   │
│ - Local LLM via node-llama-cpp                          │
│ - System info (RAM/VRAM/GPU monitoring)                 │
│ - Electron Store (persistent data)                      │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP/WebSocket (port 65000)
┌─────────────────────▼───────────────────────────────────┐
│ Python Flask Server (src/server/diffuser.py)            │
│ Endpoints: /image, /video, /audio/music, /3d, /robot/*  │
│ Models: FLUX, SDXL, LTX-2, MusicGen, LeRobot            │
│ Socket.IO for real-time progress                        │
└─────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main.js` | Electron main process - IPC handlers, Python server spawn, node-llama-cpp |
| `src/preload.js` | Context bridge exposing electronAPI to renderer |
| `src/renderer.ts` | Vue 3 app entry point |
| `src/App.vue` | Root component with tab-based navigation |
| `src/server/diffuser.py` | Flask ML server with all inference pipelines |
| `src/stores/inferenceStore.js` | Unified history for all generation types |
| `src/stores/web3.store.js` | Wallet state and blockchain data |
| `src/stores/skillStore.js` | Skill state and purchased skills |
| `src/config/web3.config.js` | Network addresses, token contracts, level thresholds, skill registry |
| `src/components/SmartAgent.vue` | Skill browser and runner interface |
| `src/components/skills/*.vue` | Modular skill UI components (DSLA, TCG, Polymarket) |
| `src/skills/builtin/*.js` | Built-in skill definitions |
| `src/services/skill.service.js` | Skill loading, validation, and execution |
| `forge.config.mjs` | Electron Forge packaging, code signing, PyInstaller embedding |

## IPC Communication Pattern

Renderer → Main via `window.electronAPI.methodName()` (defined in preload.js)
Main handlers in `src/main.js` via `ipcMain.handle('channel', handler)`

Common channels:
- `model-*` - LLM model operations
- `store-*` - Persistent storage
- `proxy-*` - External API proxying
- `get-system-info` - Hardware stats

## Web3 Integration

- Multi-chain: Ethereum + Arbitrum
- Wallet: MetaMask (injected) with WalletConnect fallback
- NFT minting: Pinata IPFS upload → smart contract mint
- Level system: 6 tiers (LVL1-LVL5 + LVL∞) requiring BONZAI tokens
- Contracts in `src/contracts/` (BonzaiAccessPass, BonzaiLevelRegistry, BonzaiEconomy)

## Skill System (SmartAgent)

BonzAI includes a modular skill system in `src/components/SmartAgent.vue` that allows users to run specialized AI-powered tools.

### Skill Architecture

```
src/
├── skills/
│   ├── builtin/                    # Built-in skill definitions
│   │   ├── dslaSmartMarket.js      # DSLA Prediction Market Maker
│   │   ├── tcgPredictionMarket.js  # TCG Insurance
│   │   └── polymarketTopPerformers.js
│   └── types.js                    # Skill schema version
├── components/skills/              # Modular Vue components for skill UIs
│   ├── DSLASkill.vue               # Prediction Market Maker UI
│   ├── TCGSkill.vue                # TCG Insurance UI
│   └── PolymarketSkill.vue         # Polymarket analysis UI
└── services/skill.service.js       # Skill loading and execution
```

### Built-in Skills

| Skill ID | Name | Category | Tags |
|----------|------|----------|------|
| `prediction-market-maker-v1.0.0` | Prediction Market Maker | finance | demo, verified |
| `tcg-insurance-v1.0.0` | Trading Card Game Insurance | finance | demo, verified |
| `polymarket-top-performers-v1.0.0` | Polymarket Top Performers | analysis | verified |

### DSLA Protocol Integration

The Prediction Market Maker skill creates prediction markets using the **DSLA Protocol** (Decentralized Service Level Agreements).

**SLA Data Model:**
- `serviceName`: Human-readable service name
- `serviceTicker`: Short identifier (e.g., ETH, BAYC)
- `serviceAddress`: Flexible string identifier (can be 0x address, domain, API URL, etc.)
- `sloType`: Service Level Objective comparison type
  - `eq` (=), `neq` (!=), `lt` (<), `lte` (<=), `gt` (>), `gte` (>=)
- `sloValue`: Target value as integer (10000 = 100% for percentages, raw value for other metrics)
- `startDate` / `endDate`: SLA monitoring period (timestamps)
- `leverage`: Multiplier for rewards/penalties (1-100x)
- `severity[]` / `penalty[]`: Tiered penalty system (basis points, max 2500 = 25%)
- `whitelisted`: Restrict staking to approved addresses
- `dataSources[]`: External APIs for SLI verification

**Use Cases:**
- Volatility of Returns (DeFi yields, staking APY)
- Volatility of Availability (uptime, latency)
- Volatility of Asset Floors (NFT floors)
- Volatility of Currency Pegs (stablecoins)
- Volatility of Response Time (block times)
- Volatility of Delivery Time (airdrops, mints)

**Verification Flow:**
1. After `endDate`, anyone calls `requestSLI()` on the SLA contract
2. A Messenger oracle fetches data from configured data sources
3. Oracle returns the Service Level Indicator (SLI) value on-chain
4. Smart contract compares SLI vs SLO and distributes rewards/penalties

## Environment Variables

```
GITHUB_TOKEN          # For releases
VITE_PINATA_JWT       # IPFS uploads
VITE_NFT_CONTRACT     # Smart contract address
VITE_SIGNALING_SERVER # P2P signaling
BONZAI_SERVER_PORT    # Flask server port (default: 65000)
```

## Build System

- **Vite** - Three configs: main, preload, renderer (`vite.*.config.ts`)
- **Electron Forge** - App packaging and distribution
- **PyInstaller** - Compiles diffuser.py to platform binary for production
- **CI/CD** - GitHub Actions for build, code signing (macOS), and release

## Port Configuration

- Flask server: `65000` (env: `BONZAI_SERVER_PORT`)
- Model cache: `~/bonzai-models/`

## Generation Flow

1. User interacts with GenerativeX.vue component
2. For local LLM: IPC to main.js → node-llama-cpp inference
3. For other modalities: HTTP POST to Flask server (port 65000)
4. Progress updates via Socket.IO
5. Result saved to inferenceStore
6. Optional NFT minting via Pinata + smart contract

## Video Generation Endpoint

| Endpoint | Model | Description |
|----------|-------|-------------|
| `/video` | LTX-2 | Fast video generation with GGUF quantization (~10GB) |

### LTX-2 Video Configuration

The `/video` endpoint uses LTX-2 (19B DiT) with Q3_K_S GGUF quantization:
- **Text-to-Video (t2v)**: Generate video from text prompt only
- **Image-to-Video (i2v)**: Generate video from image + text prompt
- **Cross-platform**: Works on CUDA, MPS (Apple Silicon), and CPU

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
