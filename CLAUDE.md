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
| `src/config/web3.config.js` | Network addresses, token contracts, level thresholds |
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
