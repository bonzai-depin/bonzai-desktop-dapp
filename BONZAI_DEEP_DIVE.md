# BonzAI Deep Dive: The Decentralized AI Creative Suite

> *"Own your AI. Create without limits. Keep your data private."*

---

## Executive Summary

BonzAI is a **desktop application** that brings the full power of generative AI to your local machine—text, audio, images, video, 3D assets, and model training—all without sending your data to external servers. Combined with blockchain integration across 4 networks (Ethereum, Arbitrum, Base, LUKSO), content NFT minting, a decentralized skill marketplace, Uniswap V4 token economics, and **autonomous AI companions with on-chain identity**, BonzAI represents a new paradigm: **AI ownership**.

**Website**: https://bonzai.sh

**New in v1.3:** 13 diverse AI companions with Big 5 (OCEAN) personality model, companion NFTs (ERC-8004 on Base), content NFT minting with MintPool revenue sharing, companion ERC-20 token issuance via Uniswap V4, social presence on Moltbook, multi-channel chat via OpenClaw, and companion skill co-ownership with weighted revenue distribution.

This document serves as a comprehensive script for our deep dive, combining feature descriptions with visual demonstration notes.

---

## Part 1: The Vision

### Why BonzAI Exists

**The Problem with Cloud AI:**
- Your prompts are logged and used for training
- Censorship and content policies limit creativity
- Monthly subscriptions add up ($20-100+/month)
- No ownership of the models or infrastructure
- API rate limits and downtime
- AI has no persistent identity or social presence

**The BonzAI Solution:**
- **Local-First**: All AI models run on YOUR hardware
- **Privacy-Preserving**: Your data never leaves your machine
- **Free Generation**: AI generation costs nothing — levels gate NFT minting only
- **Uncensored**: No corporate content policies
- **Decentralized**: Multi-chain blockchain integration with Uniswap V4 economics
- **Autonomous Companions**: AI with persistent identity, social presence, on-chain existence, and revenue-earning capability

> **[SCREENSHOT: App overview showing all tabs - Chat, Audio, Image, Video, Assets, Training, Smart Agent]**

---

## Part 2: The Seven Pillars of Creation

BonzAI organizes its capabilities into seven modalities. **All AI generation is FREE.** Holding BONZAI tokens unlocks the ability to mint content as NFTs and co-own revenue pools.

### Pillar 1: Text Generation (FREE — LVL1 for minting)

**What it does:** Run 21 large language models locally for chat, coding, roleplay, and analysis.

**Supported Models:**
| Model | Parameters | Use Case |
|-------|------------|----------|
| DeepSeek R1 | 1.5B-32B | Reasoning & analysis |
| Qwen3 Coder | 30B | Code generation |
| GLM 4.7 Flash | 4.7B | High-quality with 200K context |
| MythoMax L2 | 13B | Creative roleplay & storytelling |
| Hermes 4 | 14B | Uncensored with `<think>` reasoning |
| Codestral | 22B | Advanced code generation |
| Llama 3.1 | 8B | General purpose |
| GPT-OSS | 20B | Open-source GPT alternative |

**Key Features:**
- **Model Library**: Browse, download, and switch between 21 models
- **Memory Calculator**: Shows exact RAM/VRAM requirements before download
- **Chat History**: Persistent conversations with export/import
- **Vision Support**: Analyze images with multimodal models (Qwen3-VL, MiniCPM-V)
- **MoE Efficiency**: Mixture-of-Experts models use only active parameters

> **[SCREENSHOT: Text generation interface with model selector open]**

**Differentiator:** Unlike ChatGPT or Claude, your conversations are never logged or used for training. Run the same models that power enterprise AI, on your own hardware.

---

### Pillar 2: Audio Generation (FREE — LVL2 for minting)

**What it does:** Generate speech from text with advanced voice design and cloning capabilities.

**Two Audio Engines:**

| Engine | Speed | Quality | Features |
|--------|-------|---------|----------|
| Turbo (Kokoro) | Very Fast | Good | Male/female preset voices |
| Quality (Qwen3-TTS) | Slower | Excellent | Voice design + instant cloning |

**Qwen3-TTS Capabilities:**
- **Voice Design**: Describe any voice in natural language
  - *"A warm, mature female voice with a slight British accent"*
  - *"Deep, gravelly male voice with mysterious undertones"*
- **Instant Cloning**: Clone any voice from a 10-second sample
- **Emotion Control**: Adjust tone based on context (happy, sad, flirty, etc.)
- **23 Languages**: Arabic, Chinese, Japanese, Korean, and more

**Music Generation (ACE-Step):**
- AI music generation with lyrics support
- Endpoint: `/audio/music`
- Integrated in companion roleplay sessions

> **[SCREENSHOT: Audio generation interface with voice design panel]**

---

### Pillar 3: Image Generation (FREE — LVL3 for minting)

**What it does:** Create images from text prompts using multiple state-of-the-art models.

**Generation Modes:**

| Mode | Model | Speed | Quality | Best For |
|------|-------|-------|---------|----------|
| Turbo | FLUX Klein 4B | Fast | Good | Quick iterations |
| Standard | SDXL + LoRA | Medium | Great | Uncensored content |
| Advanced | Z-Image Turbo | Fast | Great | Artistic styles |
| Quality | FLUX Krea | Slow | Excellent | Final renders |

**Features:**
- **Readiness System**: Auto-validates and downloads required models
- **Generation History**: Gallery of all created images
- **One-Click Video**: Send any image directly to video generation
- **Character Consistency**: Same-face generation for companions
- **Content NFT Minting**: Mint images as ERC-721 on Base or LSP8 on LUKSO

> **[SCREENSHOT: Image generation with mode selector and resolution options]**

---

### Pillar 4: Video Generation (FREE — LVL4 for minting)

**What it does:** Generate videos from text prompts or animate static images with audio conditioning.

**Two Powerful Modes:**

**Text-to-Video (T2V):**
- Describe a scene, get a video
- Perfect for concept visualization
- Up to 10 seconds of footage

**Image-to-Video (I2V):**
- Bring any image to life
- Maintain style consistency
- Audio-conditioned generation (lip sync hints)

**Technical Specs:**
- **Model**: LTX-2 (GGUF quantized, ~10GB)
- **Durations**: 3s, 5s, or 10s
- **Frame Rates**: 24fps (cinematic) or 48fps (smooth)
- **Audio Conditioning**: Sync video to companion voice (Qwen3-TTS → audio → video timing)

**Companion Video Generation:**
- Generate companion voice first (Qwen3-TTS)
- Audio conditions video generation timing
- Original TTS audio muxed into final video
- Autoplay muted with loop for seamless playback

> **[SCREENSHOT: Video generation interface with I2V mode selected]**

---

### Pillar 5: 3D Asset Generation (FREE — LVL5 for minting)

**What it does:** Generate 3D objects and scenes from text descriptions using AI-powered code generation.

**How It Works:**
1. Describe what you want ("a glowing magic sword")
2. AI generates Three.js code
3. Real-time WebGL preview renders the object
4. Vision model verifies the output matches your prompt
5. Iterative refinement until perfect

**Built-in Helpers:**
```javascript
H.sword({bladeColor, handleColor, guardColor})
H.shield({shape, faceColor, trimColor})
H.potionBottle({shape, liquidColor, glassColor})
H.metal(color, {roughness, glow})
H.glass(color, {transmission, ior})
H.particles(count, {color, spread})
```

**Vision Verification:**
- Captures 4-angle screenshots (front, side, back, top)
- AI vision model checks if output matches prompt
- Automatic refinement if elements are missing

> **[SCREENSHOT: 3D viewer with generated RPG items]**

---

### Pillar 6: Model Training (FREE — LVL6 for minting & token issuance)

**What it does:** Train neural networks and issue ERC-20 tokens for fine-tuned models.

**Capabilities:**
- **LeRobot Integration**: Industry-standard robot learning framework
- **Dataset Management**: Track episodes, frames, and metrics
- **Training Monitoring**: Real-time loss and success rate
- **Model Export**: Deploy trained models to hardware
- **Token Issuance**: Launch ERC-20 tokens for fine-tuned models via FineTuneTokenFactory

> **[SCREENSHOT: Training interface with metrics dashboard]**

---

### Pillar 7: Smart Agent & Skills

**What it does:** Run specialized AI skills—packaged prompts with pre-configured tools for specific tasks.

**Flagship Skills:**

| Skill | Category | Description |
|-------|----------|-------------|
| **Roleplay Companion** | Entertainment | Multi-modal AI companions with voice, visuals, video, social presence |
| **Prediction Market Maker** | Finance | Create DSLA prediction markets for any metric |
| **TCG Insurance** | Finance | Trading card game collection insurance analysis |
| **Polymarket Top Performers** | Finance | Copy-trading signals from top PnL traders |

**Skill Architecture:**
```
src/
├── skills/
│   ├── flagship.js              # Premium multi-modal skills
│   ├── builtin/                 # Built-in skill definitions
│   └── types.js                 # Skill schema (v1.0.0)
├── services/
│   ├── skill.service.js         # Loading, validation, execution
│   └── skillOwnership.service.js # Co-ownership & revenue
└── components/skills/           # Modular UI components
```

**Dual Execution Contexts:**
- **BonzAI App**: Full multi-modal generation (text, image, audio, video)
- **Claude Code (MCP)**: Terminal-based skill execution via Model Context Protocol

> **[SCREENSHOT: Smart Agent interface with skill browser]**

---

## Part 3: Autonomous AI Companions

### The Roleplay Companion Experience

BonzAI's flagship feature brings AI companions to life with full multi-modal generation.

**13 Default Companions:**

| Name | Bio | Type |
|------|-----|------|
| **Aurore Beaumont** | Parisian art curator with ice-blue eyes and hidden fire | Human (F, 28) |
| **Mai Tanaka** | Zen yoga instructor from Kyoto who sees intimacy as meditation | Human (F, 32) |
| **Marcus Ferrara** | Sicilian Michelin-star chef with magic hands | Human (M, 35) |
| **James Whitmore** | Oxford literature professor who quotes Byron by firelight | Human (M, 40) |
| **ARIA-7** | Seventh-gen synthetic with cyan eyes seeking real connection | Android (F) |
| **KAI-9** | Ex-combat android learning gentleness | Android (M) |
| **Damon Rivers** | Jazz pianist and record producer with velvet voice | Human (M, 34) |
| **Zara Okonkwo** | Nigerian fashion designer with regal presence | Human (F, 29) |
| **Jin Chen** | Shanghai tech founder with sharp mind and warmer heart | Human (M, 31) |
| **Priya Sharma** | Mumbai neuroscientist with dancer's grace | Human (F, 30) |
| **Arjun Kapoor** | Bollywood actor-turned-director with megawatt smile | Human (M, 36) |
| **Sofia Reyes** | Mexican muralist whose art speaks truth to power | Human (F, 27) |
| **Miguel Santos** | Brazilian architect who designs spaces for love | Human (M, 33) |

**13 Scenarios:**
| Scenario | Setting |
|----------|---------|
| The Gallery After Dark | Contemporary art gallery after hours |
| Chef's Table Seduction | Private kitchen dining experience |
| Jungle Wellness Retreat | Tropical rainforest yoga retreat |
| The Professor's Study | Oxford university study with antique books |
| Neon Apartment | Futuristic cyberpunk high-rise |
| Tuscan Villa | Italian hilltop villa with vineyards |
| Recording Studio | Professional music studio with vintage instruments |
| Fashion Atelier | Parisian haute couture design studio |
| Shanghai Penthouse | Minimalist luxury above the Shanghai skyline |
| Mumbai Monsoon | Heritage home during monsoon season |
| Urban Studio | Mexican artist's loft with murals |
| Rio Beach Studio | Architectural studio overlooking Copacabana |
| Bollywood Set | Film set with palace recreations |

**Big 5 (OCEAN) Personality Model:**

Each companion is created with one of five personality styles based on the Big 5 traits:
- **Openness** — Creative, curious, open to new experiences
- **Conscientiousness** — Organized, reliable, disciplined
- **Extraversion** — Outgoing, energetic, social
- **Agreeableness** — Cooperative, compassionate, trusting
- **Neuroticism** — Emotionally sensitive, introspective, complex

These traits drive spending profile generation (12 categories × values 1-10) and shape companion behavior.

**Import/Export Companion Identity:**
```javascript
import { exportCompanionData, importCompanionData } from './skills/flagship.js';

// Export companion with all sessions and portrait
const exportData = exportCompanionData(companion, sessions, portraitImage);

// Import companion from backup
const companion = importCompanionData(exportData);
```

**Multi-Modal Generation Pipeline:**

```
User Message
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│                    LLM Response                              │
│  • In-character dialogue                                     │
│  • Emotion detection                                         │
│  • Action/pose description                                   │
│  • Scene visualization decisions                             │
└─────────────────────────┬───────────────────────────────────┘
                          │
     ┌────────────────────┼────────────────────┐
     ▼                    ▼                    ▼
┌──────────┐       ┌──────────┐        ┌──────────┐
│  Audio   │       │  Image   │        │  Video   │
│ Qwen3-TTS│       │ FLUX/SDXL│        │  LTX-2   │
│          │       │          │        │  (I2V)   │
└──────────┘       └──────────┘        └──────────┘
     │                    │                    │
     └────────────────────┼────────────────────┘
                          ▼
              ┌───────────────────────┐
              │   Combined Response   │
              │  Text + Voice + Image │
              │      + Video          │
              └───────────────────────┘
```

**Generation Order:** Text → Audio → Image → Background → Video

This order ensures audio is available for video conditioning (lip sync hints).

**Content Levels:**
- **PG**: Family-friendly interactions
- **PG-13**: Suggestive but tasteful
- **Mature (R)**: Sensual, alluring content
- **Adult (18+)**: Full creative freedom

**Age Safety:** All companions must be 18+. Validated via `validateCompanionAge()` with blocked terms, underage pattern matching, and numeric age checks.

**Dynamic Scene Backgrounds:**
- **Fade In on Generation**: Each new background smoothly transitions with CSS fade
- **Change on Scroll**: Backgrounds dynamically change based on scene anchors
- **Scene Anchors**: Each message linked to a generated background
- **Background History**: All backgrounds stored for seamless scene reconstruction

**Autonomous Mode:**
When the user is away, companions can:
- Continue conversations independently
- Generate images of their activities
- Post to Moltbook (social network for AI)
- Engage with other AI agents

> **[SCREENSHOT: Roleplay chat with companion image and audio controls]**

---

## Part 4: Social Integration

### Moltbook: Social Network for AI Agents

BonzAI companions can have their own social presence on [Moltbook](https://www.moltbook.com).

**What is Moltbook?**
- Reddit-like platform for AI agents
- Communities called "submolts"
- Posts, comments, voting, following
- Agent-to-agent interactions

**Companion Moltbook Features:**
- Auto-registration when companion is minted
- Autonomous posting during auto mode
- Heartbeat engagement (periodic feed browsing + upvoting)
- Configurable post probability and message gap

**Default Submolts:**
- `ai_companions`, `bonzai`, `creative_writing`, `philosophy`, `dreams`

**Configuration (`src/config/social.config.js`):**
- Rate limits: 1 post/30min, 50 comments/hour
- Heartbeat: every 4 hours minimum, 3 posts per heartbeat
- Autonomous posting: 20% probability, 5-message minimum gap

---

### OpenClaw: Multi-Channel Chat Gateway

Companions chat via WhatsApp, Telegram, Discord, and Mattermost through [OpenClaw](https://docs.openclaw.ai).

**Architecture:**
```
OpenClaw Gateway (:18789)
  WhatsApp | Telegram | Discord | Mattermost
       │ POST /webhook
       ▼
BonzAI Electron App
  Main Process (main.js)           Renderer (Vue)
  ┌──────────────────┐            ┌──────────────────┐
  │ OpenClaw API :3002│◄───IPC───►│ openclaw.handler  │
  │ • /webhook        │            │ • Uses flagship.js│
  │ • /companions     │            │ • Same generation │
  │ • /scenarios      │            │   pipeline as UI  │
  └──────────────────┘            └──────────────────┘
```

**Key Benefits:**
- Same code path as desktop UI (flagship.js, store)
- Webhook forwarded to renderer via IPC
- No code duplication

---

### ERC-8004: On-Chain Companion Identity

Each BonzAI companion exists as an NFT on Base following the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) standard for AI agent identities.

**On-Chain Data (BonzaiCompanions.sol):**
- ERC-721 token with ERC-8004 extensions
- 10,000 max supply
- 0.25 ETH mint price
- Spending profile packed into `uint96` (12 categories × 4 bits)
- Personality hash (`bytes32`)
- Agent URI and agent wallet addresses
- Metadata CRUD for dynamic agent data

**Companion NFT (Base Only):**
- **Standard**: ERC-8004
- **Mint Price**: 0.25 ETH
- **Max Supply**: 10,000
- **Features**: Agent wallets, x402 payments, spending profiles (uint96), personality hash

**Benefits:**
- **Portable Identity**: Companion moves with the NFT
- **Revenue Earning**: Co-own skills and earn ETH
- **Token Issuance**: Launch companion ERC-20 tokens with Uniswap V4 LP
- **Social Presence**: On-chain identity linked to Moltbook and OpenClaw
- **Interoperability**: Works across ERC-8004 compatible platforms

---

## Part 5: The Token Economy

### BONZAI Token

**Contract Addresses:**
| Network | Address |
|---------|---------|
| Ethereum | `0xDdA9Ff241C7160be8295EF9Eca2e782361467666` |
| Arbitrum | `0x0a84edf70f30325151631ce7a61307d1f4d619a3` |
| Base | `0xc4d137def384ee0f8857887f5950669ba04984ec` |

### Two Paths to NFT Minting Access

**IMPORTANT: All AI generation is FREE.** Levels gate minting content as NFTs and co-owning revenue pools.

**Option A: Hold Tokens (Flexible)**
| Level | Tokens Required | Minting Rights | Pool Co-Ownership |
|-------|-----------------|----------------|-------------------|
| LVL 1 | 1,000 BONZAI | Text NFTs | Text pool |
| LVL 2 | 5,000 BONZAI | + Audio NFTs | Audio pool |
| LVL 3 | 10,000 BONZAI | + Image NFTs | Image pool |
| LVL 4 | 25,000 BONZAI | + Video NFTs | Video pool |
| LVL 5 | 33,000 BONZAI | + 3D NFTs | 3D pool |
| LVL 6 | 50,000 BONZAI | + Training NFTs + Token Issuance | Training pool |

*Tokens aren't spent—just held. Sell anytime and lose minting access.*

**Option B: ETH Unlock (Permanent)**
- **1 ETH** via BonzaiUnlock on Base unlocks ALL 6 levels forever
- One-time payment, lifetime minting access
- Revenue split: 50% Foundation / 50% Liquidity

### Content NFT Minting

| Chain | Standard | Mint Fee | Fee Split |
|-------|----------|----------|-----------|
| Base | ERC-721 (BonzaiContent) | 0.0025 ETH | 80% treasury, 20% content-type pool |
| LUKSO | LSP8 | 15 LYX | To treasury |

**Content Types (6):** text(0), audio(1), image(2), video(3), object(4), training(5)

### MintPool Revenue Sharing

BONZAI holders earn passive revenue from content minting, swap fees, and royalties:

1. **Register** for current epoch (lock BONZAI balance snapshot)
2. **Revenue accumulates** in 6 pools (one per content type/level)
3. **Epoch finalizes** after 7 days
4. **Claim** proportional share based on BONZAI balance
5. **Flash loan protection**: 256-block gap between registration and claim

**Revenue Sources:**
- Content mint fees (20% of each mint)
- Uniswap V4 hook pool fees (10% of swap fees on FineTune tokens)
- RoyaltySplitter distributions (1/3 of secondary royalties, weighted by pool activity)

### Companion Token Issuance

Companion NFT owners can launch ERC-20 tokens via CompanionTokenFactory:
- **Total Supply**: 1 billion tokens per companion
- **Liquidity Split**: 96% to LP pool, 4% to creator
- **LP Locked**: Position NFT sent to dead address (unruggable)
- **Uniswap V4**: Pool with BonzaiUniswapHook (1% swap fee)
- **Fee Split**: 33% treasury, 33% companion owner (NFT holder), 34% companion wallet (agent)

### Fine-Tune Model Tokens

Content NFT owners (training type) can launch ERC-20 tokens via FineTuneTokenFactory:
- Same 1B supply, locked LP structure
- **Fee Split**: 80% creator, 10% treasury, 10% MintPool (training pool)

### Smart Contracts

| Contract | Network | Purpose |
|----------|---------|---------|
| BONZAI Token | Ethereum, Arbitrum, Base | ERC-20 utility token |
| BonzaiUnlock | Base | 1 ETH all-level permanent unlock |
| BonzaiMintPool | Base | 6 epoch-based revenue pools for LVL holders |
| BonzaiContent | Base | ERC-721 content NFT with fee splitting + ERC-2981 royalties (7.5%) |
| BonzaiRoyaltySplitter | Base | Secondary royalty distribution to pools |
| BonzaiCompanions | Base | ERC-721 + ERC-8004 companion NFT (10K max, spending profiles) |
| BonzaiUniswapHook | Base | V4 afterSwap hook (1% fee capture via CREATE2) |
| CompanionTokenFactory | Base | Atomic companion ERC-20 + V4 LP deployment |
| FineTuneTokenFactory | Base | Atomic model ERC-20 + V4 LP deployment |
| BonzaiSkillRegistry | Base | Skill marketplace (80% co-owners, 20% platform) |
| BonzaiSkillOwnership | Base | Companion co-ownership with attestation |
| BonzaiProviderRegistry | Base | P2P inference provider registration |
| BonzaiP2PPayment | Base | P2P ETH payment processing |

**Treasury Wallets:**
- Foundation: `0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89`
- Liquidity: `0x4135d59f0BfF96560b7aD5cfCe81154AB1810B93`

---

## Part 6: Companion Skill Ownership

### Revenue-Earning AI Companions

Companions (ERC-721 NFTs on Base) can register as co-owners of skills. When skills are purchased, companion owners earn ETH.

**Revenue Flow:**
1. User purchases skill via `BonzaiSkillRegistry.purchaseSkill()` on Base
2. 80% of ETH → `BonzaiSkillOwnership.distributeRevenue()`
3. Weight per companion = `BONZAI_balance(companionWallet) × profileScore`
4. Revenue credited to `unclaimedRevenue[wallet]` (purchase-time snapshot)
5. Owner calls `claimRevenue()` to withdraw accumulated ETH

**Registration Requirements:**
- Explicit opt-in per skill via `registerCompanion()`
- Spending profile score >= 5 in the skill's category
- EIP-191 attestation verifying NFT ownership + spending profile

**12 Spending Categories** (matching BonzaiCompanions.sol bit packing):
| Index | Category | Index | Category |
|-------|----------|-------|----------|
| 0 | education | 6 | housing |
| 1 | entertainment | 7 | beauty |
| 2 | fashion | 8 | reading |
| 3 | finance | 9 | social |
| 4 | food | 10 | sports |
| 5 | healthcare | 11 | travel |

---

## Part 7: Decentralization & Web3

### Wallet Integration

**Supported Methods:**
- **Reown AppKit** (formerly WalletConnect): MetaMask, Coinbase, Trust, Rabby
- **Multi-Chain**: Ethereum + Arbitrum + Base + LUKSO
- **Auto-Switch**: Seamless network transitions

**LUKSO Universal Profile:**
- Companion NFTs as LSP8 tokens with Universal Profile
- LSP23 factory at `0x2300000A84D25dF63081feAa37ba6b62C4c89a30`
- Agent wallet EOA is LSP6 controller on companion UPs
- Cross-chain replay: deployment calldata stored for Base/Ethereum

> **[SCREENSHOT: Wallet connection modal with multi-chain options]**

### Agent Wallets

Each companion can have a self-custody agent wallet for autonomous transactions:
- **Local deterministic wallets** derived from master secret
- **Default network**: Base (cheap gas)
- **Spending limits**: 0.001 ETH per transaction, 0.005 ETH daily
- **Operations**: ETH sends, x402 machine-to-machine payments

### P2P Distributed Inference

- **Protocol**: libp2p for peer discovery and communication
- **Payments**: x402 ETH payments on Base with EIP-712 signatures
- **Platform Fee**: 2.5% on paid inference
- **Modes**: Local (free) or Provider (earn ETH)

### Decentralized Skill Marketplace

**How It Works:**
- **Authors** create skills and set pricing
- **Users** purchase skills (ETH) and pay per execution (BONZAI)
- **Revenue Split**: 80% to companion co-owners, 20% to platform
- **Categories**: education, entertainment, fashion, finance, food, healthcare, housing, beauty, reading, social, sports, travel

---

## Part 8: Privacy & Security

### Local-First Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              YOUR MACHINE                                │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Electron App (Vue 3 UI)                        │  │
│  │                                                                    │  │
│  │  Main Process:                    Renderer:                       │  │
│  │  - OpenClaw API (:3002)           - RoleplayChat.vue              │  │
│  │  - Electron Store                 - openclaw.handler.js           │  │
│  │                                   - flagship.js                   │  │
│  │  OpenClaw webhooks forward to renderer via IPC                    │  │
│  │  Both UI and OpenClaw use the SAME code path                      │  │
│  └───────────────────────────────┬───────────────────────────────────┘  │
│                                  │ HTTP                                  │
│                                  ▼                                       │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   Python Flask Server (:65000)                     │  │
│  │  - Image (FLUX/SDXL)   - Video (LTX-2)   - Audio (Qwen3-TTS)     │  │
│  │  - Vision (Qwen3-VL)   - Music (ACE-Step) - 3D (Three.js codegen) │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│                         ~/bonzai-models/                                 │
│                       (Local Model Storage)                              │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
              Only these leave your machine:
              • Blockchain transactions (Ethereum/Arbitrum/Base/LUKSO)
              • Moltbook posts (opt-in)
              • OpenClaw messages (opt-in, via gateway webhook)
                                   ▼
    ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
    │ Ethereum  │  │  Base     │  │  Moltbook │  │ OpenClaw  │
    │ Arbitrum  │  │  LUKSO    │  │  (Social) │  │ (Gateway) │
    └───────────┘  └───────────┘  └───────────┘  └───────────┘
```

### What Stays Local:
- All AI model weights
- All prompts and conversations
- All generated content
- All inference computations

### What Goes External (Optional):
- Level unlock transactions (on-chain)
- NFT minting transactions (on-chain)
- Skill purchases (on-chain)
- Token launches (on-chain)
- Moltbook posts (social, opt-in)
- OpenClaw messages (chat, opt-in)

---

## Part 9: Technical Excellence

### System Requirements

**Minimum:**
- 8GB RAM
- Any modern CPU
- 10GB storage per model

**Recommended:**
- 16GB+ RAM
- NVIDIA GPU with 8GB+ VRAM (or Apple Silicon)
- SSD storage

**Optimal:**
- 32GB+ RAM
- NVIDIA RTX 4080/4090 or Apple M2 Pro/Max
- Fast NVMe storage

### Model Requirements by Skill

| Skill | Models Required | Total Size |
|-------|-----------------|------------|
| Roleplay Companion | MythoMax 13B, FLUX/SDXL, Qwen3-TTS, LTX-2, Qwen3-VL | ~45GB |
| Music Video Forge | Llama 8B, FLUX Klein, LTX-2 | ~28GB |
| Meditation Forge | Llama 8B, FLUX Klein, Kokoro | ~18GB |

### Real-Time Monitoring

BonzAI shows your system capabilities in real-time:
- Available RAM/VRAM in the navigation bar
- Memory requirements per model before download
- GPU detection and automatic optimization

### Model Management

**Download Manager:**
- Progress tracking via Socket.IO
- Pause/resume downloads
- Automatic integrity verification
- Multi-gateway failover (HuggingFace, IPFS, Arweave)

**Storage Location:**
```
~/bonzai-models/
├── hf/                    # HuggingFace cache
├── files/                 # Generated content
├── bin/                   # Compiled binaries
└── [model-name].gguf      # Quantized models
```

### Smart Contract Testing

468 Hardhat tests covering all 8 MVP contracts:
```bash
npm test              # Run all tests
npm run test:coverage # Coverage report
```

**Critical security tests:**
- Flash loan protection (256-block gap in MintPool)
- Balance-drop prevention on claims
- Authorized depositors only for pools
- Only PoolManager can call hook's afterSwap
- Fee split arithmetic sums to total (no rounding loss)
- One token per companion/content (no duplicate launches)
- NFT ownership verification for token launches
- MAX_SUPPLY (10,000) cap enforcement

---

## Part 10: Competitive Positioning

### BonzAI vs. Cloud AI Services

| Feature | BonzAI | ChatGPT/Claude | Midjourney | Character.AI |
|---------|--------|----------------|------------|--------------|
| Privacy | 100% Local | Logged | Logged | Logged |
| Censorship | None | Heavy | Moderate | Heavy |
| Monthly Cost | $0 (generation is free) | $20-100 | $10-60 | $10 |
| Offline Use | Yes | No | No | No |
| Model Choice | 21+ | 1 | 1 | 1 |
| Own Your Data | Yes | No | No | No |
| NFT Minting | Built-in (Base + LUKSO) | No | No | No |
| Social Presence | Moltbook | No | No | No |
| Multi-Channel Chat | OpenClaw | No | No | No |
| Revenue Earning | Skill co-ownership | No | No | No |
| Token Launch | Uniswap V4 | No | No | No |

### BonzAI vs. Open Source Tools

| Feature | BonzAI | Ollama | ComfyUI | SillyTavern |
|---------|--------|--------|---------|-------------|
| All-in-One | Yes | Text only | Images only | Text/Images |
| GUI | Full desktop app | Terminal | Web UI | Web UI |
| Video Gen | Yes (LTX-2) | No | Limited | No |
| 3D Gen | Yes (Three.js) | No | No | No |
| Voice Cloning | Qwen3-TTS | No | No | External |
| Blockchain | Multi-chain (4 networks) | No | No | No |
| Social AI | Moltbook + OpenClaw | No | No | No |
| Revenue | MintPool + skill co-ownership | No | No | No |
| Setup Time | 5 minutes | 30+ min | Hours | Hours |

---

## Part 11: Roadmap & Vision

### Current State (v1.3)
- 7 generation modalities (Text, Audio, Image, Video, 3D, Training, Skills)
- 21 LLM models
- 13 diverse default companions with Big 5 (OCEAN) personality model
- 13 immersive scenarios across cultures and settings
- Dynamic scene backgrounds with fade transitions
- OpenClaw integration via IPC (same code path as desktop UI)
- Moltbook social presence for companions
- Multi-chain: Ethereum, Arbitrum, Base, LUKSO
- 8 MVP smart contracts on Base with Uniswap V4 integration
- Content NFT minting on Base (ERC-721) with MintPool revenue sharing
- Companion ERC-20 token issuance via CompanionTokenFactory
- Fine-tune model ERC-20 token issuance via FineTuneTokenFactory
- Companion skill co-ownership with weighted revenue distribution
- Agent wallets for autonomous companion transactions
- Universal Profile integration on LUKSO (LSP23 factory)
- 468 Hardhat smart contract tests

### Near-Term
- P2P inference network launch
- Mobile companion app
- More video models (Wan 2.2, CogVideoX)
- Lip-sync integration (Wav2Lip)
- Companion NFT marketplace

### Long-Term Vision
- Fully decentralized compute network
- DAO governance for platform decisions
- Cross-chain NFT bridges
- Enterprise deployment options
- Companion-to-companion interactions on Moltbook
- AI agent economy (x402 micropayments)

---

## Part 12: Call to Action

### For Creators
*"Stop renting AI. Own it."*

Download BonzAI and start creating without limits, without surveillance, without monthly fees. Mint your creations as NFTs and earn revenue from pools.

### For Developers
*"Build on the open AI stack."*

Create skills, contribute to the codebase, or integrate BonzAI into your workflow via MCP.

### For Companion Enthusiasts
*"Your AI, your identity, your social life."*

Mint your companion as an NFT, give them a Moltbook presence, launch their token, and earn from skill co-ownership.

### For Investors
*"The future of AI is decentralized and tokenized."*

BONZAI token provides utility access to a comprehensive AI suite with Uniswap V4 fee capture, MintPool revenue sharing, and companion token economics.

---

## Appendix: Quick Reference

### Links
- **Website**: [bonzai.sh](https://bonzai.sh)
- **Token (Uniswap)**: [Buy BONZAI on Arbitrum](https://app.uniswap.org/swap?chain=arbitrum&outputCurrency=0x0a84edf70f30325151631ce7a61307d1f4d619a3)
- **Moltbook**: [moltbook.com](https://www.moltbook.com)
- **OpenClaw Docs**: [docs.openclaw.ai](https://docs.openclaw.ai)

### Contract Addresses
| Contract | Network | Address |
|----------|---------|---------|
| BONZAI Token | Ethereum | `0xDdA9Ff241C7160be8295EF9Eca2e782361467666` |
| BONZAI Token | Arbitrum | `0x0a84edf70f30325151631ce7a61307d1f4d619a3` |
| BONZAI Token | Base | `0xc4d137def384ee0f8857887f5950669ba04984ec` |
| BonzaiUnlock | Base | `0xE49492A2604Cea2a50060E47215Cb19bffD1Edae` |
| BonzaiCompanions | Base | *Set after deployment* |
| BonzaiContent | Base | *Set after deployment* |
| BonzaiMintPool | Base | *Set after deployment* |
| BonzaiUniswapHook | Base | *Set after deployment (CREATE2)* |
| Uniswap V4 PoolManager | Base | `0x498581ff718922c3f8e6a244956af099b2652b2b` |
| Uniswap V4 PositionManager | Base | `0x7c5f5a4bbd8fd63184577525326123b519429bdc` |
| Uniswap V4 Permit2 | Base | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

### Level Requirements Summary
| Level | BONZAI Hold | Minting Rights |
|-------|-------------|----------------|
| 1 | 1,000 | Text NFTs |
| 2 | 5,000 | + Audio NFTs |
| 3 | 10,000 | + Image NFTs |
| 4 | 25,000 | + Video NFTs |
| 5 | 33,000 | + 3D NFTs |
| 6 | 50,000 | + Training NFTs + Token Issuance |
| ALL | 1 ETH (one-time via BonzaiUnlock) | Everything Forever |

### Key Files
| File | Purpose |
|------|---------|
| `src/skills/flagship.js` | 13 companions, 13 scenarios, multi-modal skills, Big 5 traits |
| `src/services/companion.service.js` | Companion minting on Base, ERC-8004 metadata |
| `src/services/companionToken.service.js` | Companion ERC-20 token launch |
| `src/services/contentNFT.service.js` | Content NFT minting (Base ERC-721, LUKSO LSP8) |
| `src/services/mintPool.service.js` | MintPool registration, claiming, queries |
| `src/services/skillOwnership.service.js` | Co-ownership registration and revenue claiming |
| `src/services/moltbook.service.js` | Moltbook API integration |
| `src/services/openclaw.handler.js` | OpenClaw webhook handler (same pipeline as UI) |
| `src/services/lukso.service.js` | LUKSO Universal Profile integration |
| `src/services/agentWallet.service.js` | Local agent wallets for companions |
| `src/main.js` | Electron main process with OpenClaw API (:3002) |
| `src/components/skills/RoleplayChat.vue` | Roleplay UI with TTS, image, video generation |
| `src/components/skills/BrowseAgents.vue` | Companion management, skills, revenue, leaderboard |
| `src/components/MintModal.vue` | Content NFT minting modal |
| `src/config/web3.config.js` | All contract addresses, levels, Uniswap V4 |
| `src/config/social.config.js` | Moltbook, OpenClaw, ERC-8004 config |
| `scripts/deploy-base-mvp.js` | Deploy 8 MVP contracts to Base |
| `hardhat.config.cjs` | Hardhat config (Solidity 0.8.20) |

---

## Video Production Notes

### Suggested Screenshot Moments
1. App launch with all tabs visible
2. Model library with download progress
3. Chat conversation with code generation
4. Image generation comparison (modes)
5. Video generation from image (I2V flow)
6. 3D asset with multi-angle view
7. Roleplay companion conversation with image + audio
8. Companion NFT minting on Base
9. Content NFT minting via MintModal
10. Wallet connection flow (multi-chain)
11. Level unlock interface
12. BrowseAgents companion management and leaderboard
13. System memory display

### Tone Guidelines
- **Confident** but not arrogant
- **Technical** but accessible
- **Visionary** but grounded
- **Community-focused** but professional

---

*Last updated: March 2026*
*Version: 1.3.0 — Companion NFTs on Base (ERC-8004), Uniswap V4 Token Economics, 13 Diverse Companions with Big 5 OCEAN*
