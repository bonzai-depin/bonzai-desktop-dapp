# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BonzAI is a decentralized, privacy-preserving desktop application combining:
- AI inference engine (LLM + multimodal generation)
- Electron desktop framework with Vue 3 frontend
- Web3/blockchain integration (NFT minting, wallet connection)
- Python Flask backend for ML inference
- P2P distributed inference network with x402 payments

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
│ - GenerativeText (LLM via OpenClaw port 3002)           │
│ - GenerativeImage (FLUX/SDXL via Flask)                 │
│ - GenerativeVideo (LTX-2 via Flask)                     │
│ - GenerativeAudio (Kokoro/Qwen TTS + ACE-Step Music)    │
│ - SmartAgent (Skills), RoleplayChat (Companions)        │
│ State: Pinia (inferenceStore.js, web3.store.js)         │
└─────────────────────┬───────────────────────────────────┘
                      │ IPC via preload.js (context bridge)
┌─────────────────────▼───────────────────────────────────┐
│ Electron Main Process (src/main.js)                     │
│ - Python server launcher (dev: python3, prod: binary)   │
│ - P2P node (libp2p) for distributed inference           │
│ - System info (RAM/VRAM/GPU monitoring)                 │
│ - Electron Store (persistent data)                      │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP (Flask:65000, OpenClaw:3002)
┌─────────────────────▼───────────────────────────────────┐
│ Inference Backends                                      │
│ ├─ OpenClaw (port 3002): 21 LLM models, OpenAI-compat   │
│ └─ Flask (port 65000): Image/Audio/Video/Vision         │
└─────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/main.js` | Electron main process - IPC handlers, P2P node, Python server spawn |
| `src/preload.js` | Context bridge exposing electronAPI to renderer |
| `src/renderer.ts` | Vue 3 app entry point |
| `src/App.vue` | Root component with tab-based navigation |
| `src/server/diffuser.py` | Flask ML server with all inference pipelines |
| `src/stores/inferenceStore.js` | Unified history for all generation types |
| `src/stores/web3.store.js` | Wallet state and blockchain data |
| `src/config/web3.config.js` | Network addresses, token contracts, level thresholds |
| `src/skills/flagship.js` | Model requirements, companion definitions, skill mappings |
| `src/services/web3.service.js` | Wallet connection via Reown AppKit (WalletConnect) |
| `src/services/p2p.service.js` | libp2p P2P networking |
| `src/services/x402.service.js` | EIP-712 payment signatures for P2P inference |
| `forge.config.mjs` | Electron Forge packaging, code signing, PyInstaller embedding |

## Inference Pipelines

### LLM Models (21 models via OpenClaw, port 3002)

All LLM inference goes through OpenClaw's OpenAI-compatible API at `/v1/chat/completions`.

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
| `llm_mythomax_13b` | MythoMax 13B | 7.9 GB | 10 GB |
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
| `image_turbo` | `/image/turbo` | Fast image generation |
| `image_quality` | `/image/quality` | High quality images |
| `image_standard` | `/image/standard` | Standard diffusion |
| `image_advanced` | `/image/advanced` | Advanced generation |
| `audio_turbo` | `/audio/turbo` | Fast TTS |
| `audio_quality` | `/audio/quality/persona` | Persona-based TTS |
| `music` | `/audio/music` | AI music with lyrics |
| `video_fast` | `/video` | Text/image to video |
| `vision` | `/vision/analyze` | Vision analysis |

### NOT Supported
- **No 3D generation** - TRELLIS is not implemented
- **No music_quality** - Only single music endpoint via ACE-Step

## IPC Communication Pattern

Renderer → Main via `window.electronAPI.methodName()` (defined in preload.js)
Main handlers in `src/main.js` via `ipcMain.handle('channel', handler)`

Common channels:
- `model-*` - LLM model operations
- `store-*` - Persistent storage
- `proxy-*` - External API proxying
- `get-system-info` - Hardware stats
- `p2p-*` - P2P network operations

## Web3 Integration

- **Networks**: Ethereum Mainnet + Arbitrum One
- **Wallet**: Reown AppKit (@reown/appkit) with MetaMask, Coinbase, Trust, Rabby
- **Token**: BONZAI (ERC-20) on both chains
- **Level System**: All features require BONZAI token holdings for access
  - LVL1 (1K BONZAI): Text/LLM generation
  - LVL2 (5K BONZAI): Audio generation (TTS, voice clone, music)
  - LVL3 (10K BONZAI): Image generation, Vision analysis
  - LVL4 (25K BONZAI): Video generation, Premium agents (Roleplay Companion)
  - LVL5 (33K BONZAI): 3D generation, Expert agents
  - LVL6 (50K BONZAI): Model Training (LLM finetune, LoRA)
  - **Alternative**: 1 ETH one-time payment unlocks all levels
  - **Demo Mode**: Limited free trials available for most endpoints

## P2P Distributed Inference

BonzAI supports peer-to-peer inference via libp2p with x402 USDC payments.

### Network Modes
- **Local**: Run inference locally on your machine (default, FREE)
- **Provider**: Share your GPU with the network and earn USDC

### Architecture
- **Provider Registry**: Smart contract on Arbitrum for provider registration
- **Payment Contract**: USDC payments with EIP-712 signatures
- **Platform Fee**: 2.5% on paid inference

### Pipeline Categories (for P2P)
```
0: LLM (all 21 models)
1: IMAGE_TURBO
2: IMAGE_QUALITY
3: IMAGE_STANDARD
4: IMAGE_ADVANCED
5: AUDIO_TURBO
6: AUDIO_QUALITY
7: MUSIC
8: VIDEO_FAST
9: VISION
```

### Key P2P Files
- `src/services/p2p.service.js` - libp2p node management
- `src/services/x402.service.js` - Payment validation
- `src/services/p2p.contract.service.js` - Contract interactions
- `src/contracts/BonzaiProviderRegistry.sol` - Provider registry
- `src/contracts/BonzaiP2PPayment.sol` - Payment processing

## Environment Variables

```
GITHUB_TOKEN          # For releases
VITE_PINATA_JWT       # IPFS uploads
VITE_NFT_CONTRACT     # Smart contract address
BONZAI_SERVER_PORT    # Flask server port (default: 65000)
OPENCLAW_API_PORT     # OpenClaw LLM port (default: 3002)
```

## Build System

- **Vite** - Three configs: main, preload, renderer (`vite.*.config.ts`)
- **Electron Forge** - App packaging and distribution
- **PyInstaller** - Compiles diffuser.py to platform binary for production
- **CI/CD** - GitHub Actions for build, code signing (macOS), and release

## Port Configuration

- Flask server: `65000` (env: `BONZAI_SERVER_PORT`)
- OpenClaw LLM: `3002` (env: `OPENCLAW_API_PORT`)
- Model cache: `~/bonzai-models/`

## Generation Flow

1. User interacts with GenerativeX.vue component
2. For LLM: HTTP POST to OpenClaw (port 3002) → `/v1/chat/completions`
3. For other modalities: HTTP POST to Flask server (port 65000)
4. Progress updates via Socket.IO
5. Result saved to inferenceStore
6. Optional NFT minting via Pinata + smart contract

## Roleplay System

BonzAI includes a companion roleplay system with pre-defined characters.

- **Companions**: Defined in `src/skills/flagship.js` (`DEFAULT_COMPANIONS`)
- **Scenarios**: Location-based roleplay settings
- **UI**: `src/components/skills/RoleplayChat.vue`
- **Features**:
  - Voice generation (Qwen TTS)
  - Image generation with enhanced LLM-based prompts (GLM Flash primary, Llama fallback)
  - Video generation (LTX-2)
  - Memory persistence across sessions
  - User appearance description for consistent image generation in intimate scenes
  - Content levels: PG, PG-13, Mature, Adult

## Video Generation

| Endpoint | Model | Description |
|----------|-------|-------------|
| `/video` | LTX-2 | GGUF quantized, ~10GB, supports t2v and i2v |

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
