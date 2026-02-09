# BonzAI OpenClaw Integration

This integration connects OpenClaw multi-channel gateway to BonzAI's inference pipelines and distributed P2P network, enabling AI companions and generation capabilities across WhatsApp, Telegram, Discord, and Mattermost.

## Features

- **All 11 Pipelines**: LLM, Image (4), Audio (3), Music, Video, Vision
- **P2P Provider Discovery**: Find and use remote BonzAI providers
- **x402 Payments**: USDC payments for remote inference on Arbitrum
- **Self-Inference**: Free when consumer === provider
- **Zero-Knowledge**: Remote requests don't store data on provider

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway (:18789)                    │
│         WhatsApp | Telegram | Discord | Mattermost              │
└─────────────────────────────┬───────────────────────────────────┘
                              │ POST /webhook
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BonzAI Electron App                             │
│                                                                  │
│  Main Process (main.js)               Renderer (Vue)            │
│  ┌─────────────────────┐              ┌─────────────────────┐   │
│  │  OpenClaw API :3002 │◄────IPC─────►│ openclaw.handler.js │   │
│  │  • /webhook         │              │ • All 11 pipelines  │   │
│  │  • /companions      │              │ • P2P routing       │   │
│  │  • /api/llm/*       │              │ • Provider discovery│   │
│  └─────────────────────┘              └─────────────────────┘   │
│           │                                    │                │
│           ▼                                    ▼                │
│  ┌─────────────────┐              ┌─────────────────────────┐   │
│  │   libp2p Node   │              │   Flask Server :65000   │   │
│  │  P2P Inference  │              │   Image/Audio/Video     │   │
│  └─────────────────┘              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start the BonzAI Desktop App

```bash
cd /path/to/bonzai-desktop-dapp
npm run start
```

### 2. Configure OpenClaw Gateway

```yaml
# OpenClaw config
bonzai:
  webhook_url: http://localhost:3002/webhook
  enabled: true
```

### 3. Verify Connection

```bash
cd openclaw
node bridge.js health
```

## Available Pipelines

| Pipeline | Type | Endpoint | Model |
|----------|------|----------|-------|
| `llm` | Text | electronAPI | 21 LLM models |
| `image_turbo` | Image | `/image/turbo` | Fast image generation |
| `image_quality` | Image | `/image/quality` | High quality images |
| `image_standard` | Image | `/image/standard` | Standard quality |
| `image_advanced` | Image | `/image/advanced` | Advanced features |
| `audio_turbo` | Audio | `/audio/turbo` | Fast TTS |
| `audio_quality` | Audio | `/audio/quality/persona` | Persona-based TTS |
| `music` | Music | `/audio/music` | Music generation |
| `video_fast` | Video | `/video` | Video generation |
| `vision` | Vision | `/vision/analyze` | Image analysis |

## Chat Commands

### Roleplay Commands

| Command | Description |
|---------|-------------|
| `!companion list` | List available companions |
| `!companion select <name>` | Select a companion |
| `!scenario list` | List available scenarios |
| `!scenario select <name>` | Select a scenario |
| `!settings audio on\|off` | Toggle voice generation |
| `!settings images on\|off` | Toggle image generation |
| `!settings video on\|off` | Toggle video generation |
| `!settings music on\|off` | Toggle music generation |
| `!settings level <level>` | Set content level (pg/pg13/mature/adult) |
| `!status` | Show current session info |
| `!reset` | Clear conversation history |
| `!models` | List available LLM models |
| `!help` | Show all commands |

### Generation Commands

| Command | Description |
|---------|-------------|
| `!generate image <prompt>` | Generate an image |
| `!generate image_quality <prompt>` | High quality image |
| `!generate music <prompt>` | Generate music |
| `!generate video <prompt>` | Generate video |
| `!generate audio <text>` | Text-to-speech |

### Mode Commands

| Command | Description |
|---------|-------------|
| `!mode local` | Switch to local mode (free) |
| `!mode remote` | Switch to remote mode (paid with USDC) |
| `!mode` | Show current mode |
| `!model <name>` | Load a specific LLM model |
| `!model` | Show current model |
| `!models` | List all available LLM models |

### Skill Commands

| Command | Description |
|---------|-------------|
| `!skill list [category]` | List available BonzAI skills |
| `!skill info <id>` | Show skill details and inputs |
| `!skill run <id> [key=value ...]` | Execute a skill with inputs |
| `!skill search <query>` | Search skills by name/description |
| `!skill categories` | Show skill categories |

### Network Commands (P2P)

| Command | Description |
|---------|-------------|
| `!network status` | Show P2P status and current provider |
| `!network start` | Start P2P node |
| `!network stop` | Stop P2P node |
| `!network providers [pipeline]` | Discover available providers |
| `!network use local` | Use local inference (default) |
| `!network use auto` | Auto-select cheapest provider |
| `!network use <peerId>` | Use specific remote provider |
| `!network mode [local\|consumer\|provider]` | Set network mode |
| `!network pipelines` | List all available pipelines |

## BonzAI Skills

Skills are specialized AI-powered tools that combine prompts, tools, and execution logic. OpenClaw users can discover and run skills directly from chat.

### Available Skills

| Skill ID | Name | Category | Description |
|----------|------|----------|-------------|
| `polymarket-top-performers-v1.0.0` | Polymarket Top Performers | finance | Analyze top PnL traders and find consensus positions |
| `tcg-insurance-v1.0.0` | TCG Insurance | finance | Trading card game market analysis |
| `prediction-market-maker-v1.0.0` | Prediction Market Maker | finance | Create DSLA prediction markets |

### Skill Execution Flow

```
User: !skill run polymarket-top-performers-v1.0.0 numTraders=10 timePeriod=WEEK

Bot: **Polymarket Top Performers** - Results

**Top Recommendations**
1. **Will Trump win the 2024 election?**
   Outcome: Yes (5 traders)
   Price: 52.3%
   Suggested: $150
   [View](https://polymarket.com/event/...)

... more recommendations
```

### Skill Input Format

Inputs are passed as `key=value` pairs:

```
!skill run <skill-id> numTraders=10 timePeriod=WEEK minConviction=2
```

Supported value types:
- **Numbers**: `numTraders=10`, `copyFraction=0.1`
- **Strings**: `category=crypto`, `period=WEEK`
- **Booleans**: `includeExpired=true`, `verbose=false`

### Skill API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/skills` | GET | List all skills |
| `/api/skills/:id` | GET | Get skill details |
| `/api/skills/:id/execute` | POST | Execute a skill |

## P2P Distributed Inference

### Network Modes

| Mode | Description |
|------|-------------|
| `local` | Offline, use only local models |
| `consumer` | Use remote providers when local unavailable |
| `provider` | Earn USDC by serving inference to others |

### Provider Discovery

```
User: !network providers image_turbo

Bot: **Available Providers** (image_turbo)
- `QmYx7eFzK...` | $0.01/image | image_turbo, image_quality
- `Qm456abc...` | $0.015/image | image_turbo, audio

Use `!network use <peerId>` to select a provider.
```

### Per-Pipeline Pricing

Each pipeline type has its own pricing unit:

| Pipeline | Unit | Typical Range |
|----------|------|---------------|
| `llm` | per 1K tokens | $0.0001 - $0.001 |
| `image_*` | per image | $0.01 - $0.05 |
| `audio_*` | per second | $0.001 - $0.005 |
| `music` | per second | $0.03 - $0.10 |
| `video_fast` | per second | $0.05 - $0.20 |
| `vision` | per image | $0.005 - $0.02 |
| `companions` | per message | $0.01 - $0.05 |

### x402 Payment Flow

1. Consumer requests inference from remote provider
2. Provider responds with **402 Payment Required** including:
   - Pipeline-specific price and unit
   - Provider's wallet address
   - Validity window (e.g., 5 minutes)
3. Consumer reviews price and signs ERC-3009 USDC authorization
4. Consumer retries request with payment signature
5. Provider validates signature, executes inference, returns result
6. Provider claims USDC payment on Arbitrum (can be batched)

### Self-Inference

When `consumer === provider` (same peer ID), inference is **FREE**:
- No payment required
- Useful for testing your own provider setup
- Full functionality without USDC

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Main chat endpoint |
| `/health` | GET | Health check |
| `/companions` | GET | List all companions |
| `/scenarios` | GET | List all scenarios |
| `/companion/:id` | GET | Get companion details |
| `/api/llm/chat` | POST | Direct LLM chat |
| `/api/llm/load` | POST | Load an LLM model |
| `/api/llm/unload` | POST | Unload current model |
| `/api/llm/info` | GET | Get LLM status |
| `/api/flask/*` | * | Proxy to Flask server |

## Webhook Format

### Request

```json
{
  "platform": "discord",
  "channelId": "channel-123",
  "message": "Hello Scarlett!",
  "userId": "user-456"
}
```

### Response

```json
{
  "text": "*Scarlett smiles warmly* Hello, darling...",
  "companion": { "id": "scarlett", "name": "Scarlett" },
  "scenario": { "id": "private_spa", "name": "A Night at the Private Spa" },
  "audioPath": "/path/to/audio.wav",
  "imageBase64": "...",
  "videoPath": "/path/to/video.mp4"
}
```

## Data Storage

Channel mappings and sessions are stored in Electron Store:

- `openclawChannelMappings` - Per-channel settings (companion, scenario, network provider)
- `roleplaySessions` - Conversation history
- `openclawNetworkSettings` - Global P2P settings

## Bridge CLI Utility

```bash
# Check if BonzAI is running
node bridge.js health

# List companions
node bridge.js companions

# List scenarios
node bridge.js scenarios

# Send a test message
node bridge.js chat "Hello Scarlett!"

# Show OpenClaw configuration
node bridge.js config
```

## Files

| File | Purpose |
|------|---------|
| `bridge.js` | CLI utility for testing |
| `moltbook-agent.js` | Moltbook ambassador agent |
| `package.json` | Node package configuration |
| `agent-config.json` | Agent configuration |
| `skill.md` | OpenClaw skill definition - teaches OpenClaw how to use BonzAI |

## Installing the BonzAI Skill in OpenClaw

The `skill.md` file teaches OpenClaw how to use BonzAI for AI inference.

**To install:**
1. Open OpenClaw settings
2. Go to Skills/Plugins section
3. Add the `skill.md` file from this directory

**Two modes:**

| Mode | How it works | Cost |
|------|--------------|------|
| **Local** | User runs BonzAI Desktop, OpenClaw calls `localhost:3002` | Free |
| **Remote** | OpenClaw discovers providers from Arbitrum contract, connects via libp2p | Paid (USDC) |

**OpenClaw users can:**
- Generate images, audio, music, and video
- Chat with AI companions in immersive scenarios
- Use 11 different AI pipelines (LLM, image×4, audio×3, music, video, vision)

## Requirements

- BonzAI Desktop App running
- OpenClaw Gateway configured with webhook URL
- For P2P: Arbitrum wallet with USDC (consumer) or registered as provider

## Troubleshooting

### P2P Not Connecting

1. Check `!network status` - ensure node is started
2. Verify NAT type allows connections
3. Try `!network start` to restart the node

### No Providers Found

Provider discovery requires:
1. Deployed contracts on Arbitrum
2. Registered providers in the network
3. Active providers with matching pipelines

### Payment Required Errors

When using remote providers:
1. Ensure USDC balance on Arbitrum
2. Approve payment contract for USDC spending
3. Or use `!network use local` for free local inference
