---
name: bonzai
description: Decentralized AI inference - generate images, audio, music, video, and chat with AI companions via P2P network
homepage: https://bonzai.sh
user-invocable: true
metadata:
  openclaw:
    requires:
      config:
        - models.providers.bonzai
    # IMPORTANT: Generation can take 1-5 minutes depending on hardware
    # OpenClaw must wait for the full response before sending to user
    timeout: 600  # 10 minutes - video/music generation can be slow
    async: false  # Synchronous request/response - wait for result
---

# BonzAI Skill

Access decentralized AI inference through BonzAI. Generate images, audio, music, video, and chat with AI companions.

## Two Modes

| Mode | Description | Cost |
|------|-------------|------|
| **Local** | User runs BonzAI Desktop | Free |
| **Remote** | Connect to P2P providers | Paid (ETH on Base) |

```
LOCAL MODE
  OpenClaw ───HTTP (free)───► localhost:3002 (BonzAI Desktop)

REMOTE MODE
  OpenClaw ───► Base Contract ───► libp2p dial to provider (pay ETH)
```

## Switching Modes

Commands:
- `!mode local` - Switch to local mode (free)
- `!mode remote` - Switch to remote mode (paid)
- `!mode` - Show current mode

---

# Local Mode

Use when the user has BonzAI Desktop running on their machine.

## Authentication

All Flask server endpoints (port 65000) require authentication. There are two authentication methods:

### Option 1: JWT Bearer Token (Recommended)

Use a JWT token obtained from the `/auth/verify` endpoint after wallet signature verification:

```
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**JWT Authentication Flow:**
1. `POST /auth/challenge` with wallet address → receive challenge
2. Sign the challenge message with wallet
3. `POST /auth/verify` with signature → receive JWT access token
4. Use `Authorization: Bearer <token>` header for all requests

### Option 2: Demo Mode (No Wallet)

For unauthenticated access (limited features), use the demo mode header:

```
Content-Type: application/json
X-Demo-Mode: true
```

Demo mode allows basic generation but may have restrictions on certain pipelines.

### Endpoint Authentication Summary

| Port | Endpoint | Auth Required |
|------|----------|---------------|
| 3002 | `/webhook` | No (internal session management) |
| 3002 | `/health`, `/companions`, `/scenarios` | No |
| 3002 | `/v1/chat/completions` | No (LLM via electronAPI) |
| 65000 | All Flask endpoints | Yes (Bearer token or X-Demo-Mode) |

## Check Availability

```http
GET http://localhost:3002/health
```

Response:
```json
{
  "ok": true,
  "version": "1.3.0",
  "pipelines": ["llm", "image_turbo", "image_quality", "audio", "music", "video_fast", "vision"]
}
```

## Endpoints

| Endpoint | Port | Method | Auth | Description |
|----------|------|--------|------|-------------|
| `/health` | 3002 | GET | None | Check if BonzAI is running |
| `/companions` | 3002 | GET | None | List AI companions |
| `/scenarios` | 3002 | GET | None | List roleplay scenarios |
| `/webhook` | 3002 | POST | None | Main chat/command interface |
| `/v1/chat/completions` | 3002 | POST | None | OpenAI-compatible LLM |
| `/auth/challenge` | 65000 | POST | None | Get auth challenge |
| `/auth/verify` | 65000 | POST | None | Verify signature, get JWT |
| `/auth/demo-token` | 65000 | POST | None | Get demo access token |
| `/image/turbo` | 65000 | POST | Bearer/Demo | Fast image generation (FLUX Klein) |
| `/image/quality` | 65000 | POST | Bearer/Demo | High quality image (FLUX Krea) |
| `/image/standard` | 65000 | POST | Bearer/Demo | Standard image (SDXL, uncensored) |
| `/image/advanced` | 65000 | POST | Bearer/Demo | Advanced image (Z-Image Turbo) |
| `/image/image/turbo` | 65000 | POST | Bearer/Demo | Image-to-image editing |
| `/audio/turbo` | 65000 | POST | Bearer/Demo | Fast TTS (Kokoro) |
| `/audio/quality/persona` | 65000 | POST | Bearer/Demo | Persona-based TTS (Qwen3-TTS) |
| `/audio/quality/design` | 65000 | POST | Bearer/Demo | Voice design from description |
| `/audio/quality/clone` | 65000 | POST | Bearer/Demo | Voice cloning from audio |
| `/audio/music` | 65000 | POST | Bearer/Demo | Music generation (ACE-Step) |
| `/video` | 65000 | POST | Bearer/Demo | Video generation (LTX-2) |
| `/vision/analyze` | 65000 | POST | Bearer/Demo | Image analysis (Qwen3-VL) |
| `/training/datasets` | 65000 | GET | Bearer | List training datasets |
| `/training/start` | 65000 | POST | Bearer | Start model training |
| `/training/models` | 65000 | GET | Bearer | List trained models |

**Auth column legend:**
- `None` - No authentication required
- `Bearer/Demo` - Requires either `Authorization: Bearer <token>` or `X-Demo-Mode: true`

## Webhook Interface

Send commands and chat messages:

```http
POST http://localhost:3002/webhook
Content-Type: application/json

{
  "platform": "openclaw",
  "channelId": "user-session-id",
  "message": "!companion list",
  "userId": "user-wallet-address",
  "imageBase64": null
}
```

### Commands

**Companion & Scenario:**
- `!companion list` - List available companions
- `!companion select <name>` - Select a companion
- `!scenario list` - List scenarios
- `!scenario select <name>` - Select a scenario

**Generation:**
- `!generate image <prompt>` - Fast image (FLUX Klein)
- `!generate image_quality <prompt>` - Quality image (FLUX Krea)
- `!generate image_standard <prompt>` - Standard image (SDXL, uncensored)
- `!generate image_advanced <prompt>` - Advanced image (Z-Image)
- `!generate video <prompt>` - Video (LTX-2)
- `!generate audio <text>` - Fast TTS (Kokoro)
- `!generate audio_quality <text>` - Quality TTS (Qwen3-TTS)
- `!generate music <prompt>` - Music (ACE-Step)
- `!generate vision` - Image analysis (Qwen3-VL, requires image attachment)

**Autonomous Mode:**
- `!autonomous on` - Enable autonomous companion mode
- `!autonomous off` - Disable autonomous mode
- `!autonomous status` - Show status & config
- `!autonomous config idle <minutes>` - Idle timeout (1-60, default 5)
- `!autonomous config interval <minutes>` - Message interval (1-120, default 15)
- `!autonomous config max <count>` - Max messages (1-100, default 12)

**Settings (all enabled by default):**
- `!settings audio on|off` - Toggle voice generation (default: on)
- `!settings images on|off` - Toggle image generation (default: on)
- `!settings video on|off` - Toggle video generation (default: on)
- `!settings music on|off` - Toggle music generation (default: on)
- `!settings level pg|pg13|mature|adult` - Set content level

**Session:**
- `!status` - Show current session
- `!reset` - Clear history
- `!models` - List LLM models
- `!help` - Show all commands

**Model:**
- `!model <name>` - Load specific model
- `!model restore` - Restore model before companion chat

**Network (P2P):**
- `!network status` - Show P2P status
- `!network start` - Start P2P node
- `!network stop` - Stop P2P node
- `!network providers [pipeline]` - Discover providers
- `!network use <local|auto|peerId>` - Select provider
- `!network mode [local|remote]` - Set network mode
- `!network pipelines` - List available pipelines

**Skills:**
- `!skill list [category]` - List available skills
- `!skill info <id>` - Show skill details
- `!skill run <id> [key=value ...]` - Execute a skill
- `!skill search <query>` - Search skills
- `!skill categories` - Show categories

**Minting:**
- `!mint bare [gender]` - Mint a bare companion NFT (no BonzAI Desktop needed)
- `!mint companion <name>` - Mint a complete companion (requires BonzAI Desktop)
- `!mint status` - Check mint status and owned companions
- `!mint finalize <tokenId>` - Finalize a bare companion (requires BonzAI Desktop)

**Chat:** Any message without `!` prefix chats with the selected companion.

### Example: Direct Flask API Call (with JWT)

```http
POST http://localhost:65000/image/turbo
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

{
  "prompt": "A sunset over the ocean, oil painting style",
  "width": 768,
  "height": 512,
  "num_inference_steps": 4
}
```

### Example: Direct Flask API Call (Demo Mode)

```http
POST http://localhost:65000/image/turbo
Content-Type: application/json
X-Demo-Mode: true

{
  "prompt": "A sunset over the ocean, oil painting style",
  "width": 768,
  "height": 512,
  "num_inference_steps": 4
}
```

Response:
```json
{
  "ok": true,
  "image_base64": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

### Example: Generate Image via Webhook

```http
POST http://localhost:3002/webhook
Content-Type: application/json

{
  "platform": "openclaw",
  "channelId": "session1",
  "message": "!generate image A sunset over the ocean, oil painting style",
  "userId": "user1"
}
```

Response:
```json
{
  "text": "**Image Generated**",
  "imagePath": "/path/to/generated/image.png"
}
```

**Note:** Images are returned as local file paths (not base64) for WhatsApp/media compatibility.

### Example: Companion Chat

```http
POST http://localhost:3002/webhook
Content-Type: application/json

{
  "platform": "openclaw",
  "channelId": "chat1",
  "message": "Hello Aurore, you look beautiful tonight.",
  "userId": "user1"
}
```

Response:
```json
{
  "text": "*Aurore looks up with a warm smile* Why thank you, darling...",
  "companion": {"id": "aurore", "name": "Aurore Beaumont"},
  "scenario": {"id": "art_gallery_after_dark", "name": "Art Gallery After Dark"},
  "audioPath": "/path/to/voice.mp3",
  "imagePath": "/path/to/generated/image.png",
  "videoPath": "/path/to/video.mp4"
}
```

**Media Response Notes:**
- `imagePath` - PNG image file path
- `audioPath` - MP3 audio file path (smaller than WAV, preferred for messaging)
- `videoPath` - MP4 video file path (only when video generation is enabled)

All media files are stored in `$MODEL_DIR/files/` and can be accessed directly.

---

# Available LLM Models

Load a specific LLM model on demand:

- `!model <name>` - Load specific model
- `!model` - Show current model and saved model
- `!model restore` - Restore the model that was loaded before companion chat
- `!models` - List all available models

## Companion Chat Model Switching

When you chat with a companion, BonzAI automatically:
1. **Saves** your current model (e.g., Gemma)
2. **Loads** MythoMax 13B (optimized for roleplay)
3. **Keeps** MythoMax loaded during the companion session

To restore your original model:
- Use `!model restore` to switch back
- Use `!reset` to clear chat history and restore model
- Or use `!model <name>` to load any specific model

## Compact Models (< 3 GB)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `gemma_3_1b` | Gemma 3 1B | 0.8 GB | 2 GB |
| `deepseek_r1_1_5b` | DeepSeek R1 Distill 1.5B | 1.1 GB | 2 GB |
| `ministral_3b_q4` | Ministral 3B | 2.2 GB | 4 GB |
| `phi_3_mini` | Phi-3 Mini 4K | 2.4 GB | 4 GB |
| `nanbeige_4_1_3b` | Nanbeige 4.1 3B | 2.4 GB | 4 GB |
| `phi_4_mini` | Phi-4 Mini | 2.5 GB | 4 GB |
| `qwen3_5_4b` | Qwen3.5 4B | 2.8 GB | 4 GB |

## Standard Models (3-8 GB)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `llama_2_7b` | LLaMA 2 7B Chat | 4 GB | 6 GB |
| `mistral_7b` | Mistral 7B Instruct | 4.4 GB | 6 GB |
| `deepseek_r1_7b` | DeepSeek R1 Distill 7B | 4.7 GB | 6 GB |
| `llama_3_1_8b` | LLaMA 3.1 8B | 4.9 GB | 6 GB |
| `qwen3_coder_next` | Qwen3 Coder Next | 5 GB | 6 GB |
| `ministral_8b_q4` | Ministral 8B | 5.3 GB | 8 GB |
| `yi_coder_9b` | Yi Coder 9B | 5.7 GB | 8 GB |
| `qwen3_5_9b_q4` | Qwen3.5 9B Q4 | 6 GB | 8 GB |
| `mythomax_13b` | MythoMax L2 13B | 7.9 GB | 10 GB |

## Large Models (8-15 GB)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `hermes_4_14b` | Hermes 4 14B | 9 GB | 10 GB |
| `devstral_24b_q2` | Devstral 24B Q2 | 9.3 GB | 12 GB |
| `qwen3_5_27b` | Qwen3.5 27B (Q2_K) | 10.5 GB | 14 GB |
| `gpt_oss_20b` | GPT-OSS 20B | 12 GB | 14 GB |
| `glm_4_7_q2` | GLM 4.7 Flash Q2 | 11.9 GB | 14 GB |
| `qwen3_5_35b_a3b_q2` | Qwen3.5 35B A3B (Q2_K_XL) | 12.9 GB | 16 GB |
| `qwen3_5_35b_a3b_iq3` | Qwen3.5 35B A3B IQ3 | 13.1 GB | 16 GB |
| `codestral_22b` | Codestral 22B | 13 GB | 16 GB |
| `devstral_24b_q4` | Devstral 24B Q4 | 14.5 GB | 18 GB |

## Extra Large Models (15-40 GB)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `qwen3_5_27b_q4` | Qwen3.5 27B Q4 | 16.7 GB | 20 GB |
| `glm_4_7_q4` | GLM 4.7 Flash Q4 | 17.5 GB | 20 GB |
| `deepseek_r1_32b` | DeepSeek R1 Distill 32B | 19 GB | 24 GB |
| `qwen3_5_35b_a3b_q4` | Qwen3.5 35B A3B Q4 | 20.6 GB | 24 GB |
| `devstral_24b_q8` | Devstral 24B Q8 | 29 GB | 32 GB |
| `qwen3_5_27b_q8` | Qwen3.5 27B Q8 | 32.4 GB | 36 GB |
| `glm_4_7_q8` | GLM 4.7 Flash Q8 | 35.6 GB | 38 GB |
| `qwen3_5_35b_a3b_q8` | Qwen3.5 35B A3B Q8 | 38.7 GB | 42 GB |

## Massive Models (40+ GB, multi-GPU)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `qwen3_5_122b_a10b_q2` | Qwen3.5 122B A10B Q2 | 46.7 GB | 52 GB |
| `qwen3_5_122b_a10b_q4` | Qwen3.5 122B A10B Q4 | 68.4 GB | 72 GB |
| `minimax_m2_5_q4` | MiniMax M2.5 Q4 | 131 GB | 140 GB |
| `qwen3_5_397b_a17b_q2` | Qwen3.5 397B A17B Q2 | 149 GB | 160 GB |
| `qwen3_5_397b_a17b_q4` | Qwen3.5 397B A17B Q4 | 219 GB | 230 GB |
| `kimi_k2_5_q4` | Kimi K2.5 Q4 | 622 GB | 640 GB |

**Total: 38 LLM models**

---

# Available Pipelines

## Text Generation

| Pipeline | Endpoint | Description |
|----------|----------|-------------|
| `llm` | via electronAPI | Local LLM inference (38 models available) |

## Image Generation

| Pipeline | Endpoint | Speed | Quality |
|----------|----------|-------|---------|
| `image_turbo` | `/image/turbo` | Fast | Good (FLUX Klein) |
| `image_standard` | `/image/standard` | Medium | Good (SDXL, uncensored) |
| `image_advanced` | `/image/advanced` | Medium | High (Z-Image Turbo) |
| `image_quality` | `/image/quality` | Slower | Excellent (FLUX Krea) |

## Audio Generation

| Pipeline | Endpoint | Features |
|----------|----------|----------|
| `audio_turbo` | `/audio/turbo` | Fast TTS (Kokoro) |
| `audio_quality` | `/audio/quality/persona` | Persona-based TTS (Qwen3-TTS) |
| `audio_quality_design` | `/audio/quality/design` | Create voice from text description |
| `audio_quality_clone` | `/audio/quality/clone` | Clone voice from reference audio |

## Music Generation

| Pipeline | Endpoint | Features |
|----------|----------|----------|
| `music` | `/audio/music` | Lyrics support, genre tags, 30-240s (ACE-Step) |

## Video Generation

| Pipeline | Endpoint | Features |
|----------|----------|----------|
| `video_fast` | `/video` | Text-to-video, image-to-video (LTX-2) |

## Vision Analysis

| Pipeline | Endpoint | Features |
|----------|----------|----------|
| `vision` | `/vision/analyze` | Image analysis, description, OCR (Qwen3-VL) |

---

# Pipeline Parameters

### LLM

```json
{
  "pipeline": "llm",
  "params": {
    "messages": [
      {"role": "system", "content": "You are helpful."},
      {"role": "user", "content": "Hello!"}
    ],
    "max_tokens": 1000,
    "temperature": 0.7
  }
}
```

### Image (All Pipelines)

```json
{
  "pipeline": "image_turbo",
  "params": {
    "prompt": "A sunset over the ocean, oil painting",
    "negative_prompt": "blurry, low quality",
    "width": 768,
    "height": 512,
    "num_inference_steps": 4,
    "guidance_scale": 3.5,
    "seed": -1
  }
}
```

**Resolutions:** 512x512 (SD), 768x768 (HD), 1024x1024 (FHD), 1536x1536 (2K), 2048x2048 (4K)

### Audio (TTS)

```json
{
  "pipeline": "audio_turbo",
  "params": {
    "text": "Hello, welcome to BonzAI!",
    "voice": "af_heart",
    "speed": 1.0
  }
}
```

**Voices:**
- Female: `af_heart`, `af_bella`, `af_nicole`, `af_sarah`, `af_sky`
- Male: `am_adam`, `am_michael`, `am_fenrir`

**Response Format:**
All audio endpoints return both WAV and MP3 paths. Use `audio_path_mp3` for smaller file sizes (recommended for messaging platforms):
```json
{
  "ok": true,
  "audio_path": "/path/to/audio.wav",
  "audio_path_mp3": "/path/to/audio.mp3"
}
```

### Music

```json
{
  "pipeline": "music",
  "params": {
    "prompt": "jazz, smooth, saxophone, 120bpm",
    "lyrics": "[verse]\nWalking down the street\n[chorus]\nThis is the chorus",
    "duration": 60,
    "steps": 27,
    "guidance_scale": 15.0,
    "seed": -1
  }
}
```

**Duration:** 30-240 seconds
**Steps:** 27 (fast) or 60 (quality)

### Video (Fast - LTX-2)

```json
{
  "pipeline": "video_fast",
  "params": {
    "prompt": "A cat playing with yarn",
    "mode": "t2v",
    "height": 448,
    "width": 640,
    "frames": 61,
    "frame_rate": 12,
    "steps": 10,
    "guidance_scale": 1,
    "image_base64": null
  }
}
```

**Video Notes:**
- `frames` (not `num_frames`) - LTX requires 8n+1 frames
- `frame_rate` (not `fps`) - Frames per second
- `steps` (not `num_inference_steps`) - Inference steps (10 for distilled model)
- **Modes:** `t2v` (text-to-video) or `i2v` (image-to-video, provide `image_base64`)
- **Resolutions:** 448x640 (default), 480x768, 720p, 1080p
- **Duration:** 5s or 10s
- **FPS:** 12, 24, 48

### Vision

```json
{
  "pipeline": "vision",
  "params": {
    "image_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "prompt": "Describe this image in detail"
  }
}
```

---

# Autonomous Mode

Companions can act independently when the user is idle, generating messages, exploring their scenario, and engaging in activities.

## How It Works

1. User enables autonomous mode via `!autonomous on`
2. When the user goes idle (default: 5 minutes of inactivity), the companion starts generating messages
3. Messages are generated at regular intervals (default: every 15 minutes)
4. After reaching the max message count (default: 12), autonomous mode auto-stops
5. When the user returns, they see all missed messages

## Configuration

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `idle` | 5 min | 1-60 | Minutes before user is considered idle |
| `interval` | 15 min | 1-120 | Minutes between autonomous messages |
| `max` | 12 | 1-100 | Maximum autonomous messages before stopping |

## Commands

```
!autonomous on          # Enable autonomous mode
!autonomous off         # Disable autonomous mode
!autonomous status      # Show status, config, message count
!autonomous config idle 10       # Set idle timeout to 10 minutes
!autonomous config interval 20   # Set message interval to 20 minutes
!autonomous config max 50        # Allow up to 50 autonomous messages
```

## Activity Variety

Companions cycle through different activity types for narrative variety:
- **Routine** - Daily activities and habits
- **Explore** - Discovering something new
- **Hobby** - Engaging in personal interests
- **Reflect** - Quiet reflection or daydreaming
- **Social** - Interacting with others in the scenario
- **Adventure** - Small adventures or unexpected situations
- **Creative** - Creative or expressive activities
- **Relax** - Self-care and relaxation

---

# Available Skills

BonzAI includes built-in skills that combine multiple AI pipelines for complex tasks.

## Commands

```
!skill list [category]           # List available skills
!skill info <id>                 # Show skill details and inputs
!skill run <id> [key=value ...]  # Execute a skill
!skill search <query>            # Search skills by name/description
!skill categories                # Show skill categories
```

## Built-in Skills

| Skill ID | Name | Category | Level | Description |
|----------|------|----------|-------|-------------|
| `story-studio-v1.0.0` | Story Studio | entertainment | 3 | Illustrated, narrated stories with original artwork and audio |
| `meditation-forge-v1.0.0` | Meditation Forge | healthcare | 3 | Personalized guided meditations with calming visuals and ASMR |
| `virtual-staging-pro-v1.0.0` | Virtual Staging Pro | housing | 3 | Transform empty rooms into beautifully staged interiors |
| `virtual-try-on-v1.0.0` | Virtual Try-On | fashion | 3 | Visualize clothes and styles before buying |
| `chefs-table-v1.0.0` | Chef's Table | food | 3 | Restaurant-quality recipes with professional food photography |
| `eli5-v1.0.0` | ELI5 | education | 3 | Break down complex topics into simple visual explanations |
| `music-video-forge-v1.0.0` | Music Video Forge | entertainment | 4 | Music video visuals with AI imagery and animations |
| `game-maker-v1.0.0` | Game Maker | entertainment | 5 | Complete 2D/3D game concepts with characters and environments |
| `manga-to-anime-v1.0.0` | Manga to Anime | entertainment | 4 | Transform manga panels into animated anime sequences |
| `hairstyle-studio-v1.0.0` | Hairstyle Studio | personal-care | 3 | Visualize different hairstyles and colors on your photo |
| `roleplay-companion-v1.0.0` | Roleplay Companion | entertainment | 4 | Immersive roleplay with text, audio, images, and video |

**Level Note:** Levels gate NFT minting, not skill access. All AI generation is free (LVL0).

---

# Companion Minting

Mint BonzAI Companion NFTs (ERC-8004) on Base directly from OpenClaw.

## Two Modes

| Mode | What it does | Requirements |
|------|-------------|--------------|
| **Bare Mint** | Mint a placeholder companion NFT (pending setup) | Privy wallet + 0.25 ETH on Base |
| **Complete Mint** | Mint a fully configured companion with personality, image, and voice | BonzAI Desktop running + Privy wallet + 0.25 ETH |

## Commands

```
!mint bare [gender]            # Mint a bare companion (gender: female, male, neutral)
!mint companion <name>         # Mint a complete companion (requires BonzAI Desktop)
!mint status                   # Check mint status and owned companions
!mint finalize <tokenId>       # Finalize a bare companion (requires BonzAI Desktop)
```

## Bare Mint (No BonzAI Desktop Required)

Mints a placeholder companion NFT on Base that can be personalized later in the BonzAI app. This is the simplest onboarding path for non-crypto users.

**Flow:**
1. User signs in via Privy (email or social — no MetaMask needed)
2. Privy embedded wallet acts as NFT owner
3. A Privy server wallet is created as the companion's agent wallet
4. The `mintCompanion()` function is called on the BonzaiCompanions contract (Base)
5. The companion appears as "Pending Setup" — user can finalize later in BonzAI Desktop

**On-chain call:**
```
BonzaiCompanions.mintCompanion(
  agentURI,           // Arweave URI to bare registration JSON
  personalityHash,    // bytes32(0) — set during finalization
  spendingProfile,    // uint96(0) — set during finalization
  gender,             // 0=neutral, 1=female, 2=male
  agentWallet         // Privy server wallet address
)
Value: 0.25 ETH
Chain: Base (8453)
Contract: BonzaiCompanions
```

**Privy wallet policy (applied to the server wallet):**
```json
{
  "rules": [
    {
      "name": "allow_spending",
      "conditions": [{
        "field_source": "ethereum_transaction",
        "field": "value",
        "operator": "lte",
        "value": "1000000000000000"
      }],
      "action": "ALLOW"
    },
    { "name": "deny_all", "conditions": [], "action": "DENY" }
  ]
}
```

### Example: Bare Mint

```http
POST http://localhost:3002/webhook
Content-Type: application/json

{
  "platform": "openclaw",
  "channelId": "user-session-1",
  "message": "!mint bare female",
  "userId": "user@example.com"
}
```

Response:
```json
{
  "text": "Companion #42 minted on Base! Gender: female. Visit bonzai.sh to personalize your companion.",
  "companion": {
    "tokenId": 42,
    "network": "base",
    "standard": "ERC-8004",
    "status": "pending_setup",
    "agentWallet": "0x1234...abcd",
    "txHash": "0xabc123..."
  }
}
```

## Complete Mint (BonzAI Desktop Required)

Mints a fully configured companion with:
- Personality, appearance, and background generated by LLM
- Portrait image generated by FLUX/SDXL
- Voice style assigned (Qwen TTS)
- Spending profile computed from personality traits
- All metadata uploaded to Arweave and set on-chain

This requires BonzAI Desktop to be running (for inference pipelines).

### Example: Complete Mint

```http
POST http://localhost:3002/webhook
Content-Type: application/json

{
  "platform": "openclaw",
  "channelId": "user-session-1",
  "message": "!mint companion Sakura Tanaka",
  "userId": "user@example.com"
}
```

Response:
```json
{
  "text": "Companion 'Sakura Tanaka' (#43) minted on Base with full personality, portrait, and voice!",
  "companion": {
    "tokenId": 43,
    "name": "Sakura Tanaka",
    "network": "base",
    "standard": "ERC-8004",
    "status": "active",
    "agentWallet": "0x5678...efgh",
    "agentURI": "ar://abc123...",
    "txHash": "0xdef456..."
  },
  "imagePath": "/path/to/companion-portrait.png"
}
```

## Finalize a Bare Companion

Transform a bare (pending setup) companion into a fully configured one. Requires BonzAI Desktop.

```
!mint finalize 42
```

This triggers the full companion setup flow:
1. Verify NFT ownership
2. Generate personality and spending profile
3. Generate portrait image
4. Upload metadata to Arweave
5. Set agentURI, spendingProfile, personalityHash on-chain
6. Set OASF agent traits via setMetadataBatch

---

# Remote Mode

Use when connecting to BonzAI providers on the P2P network.

## Step 1: Discover Providers

Query the BonzAI contract on Base to find available providers:

**Contract:** `BonzaiProviderRegistry` on Base (8453)
**Address:** See https://bonzai.sh for current deployment

```javascript
// Query providers for a pipeline
const providers = await contract.getProvidersForPipeline("image_turbo", 10);
// Returns: providerIds[], peerIds[], pricingHashes[], isRelays[]
```

Response:
```json
{
  "providers": [
    {
      "providerId": "0xabc123...",
      "peerId": "12D3KooWExample...",
      "pipelines": ["llm", "image_turbo", "audio", "companions"],
      "isRelay": true
    }
  ]
}
```

## Step 1b: Price Discovery (Optional)

To compare prices before committing, send a **dry-run request** (empty params):

```javascript
// Connect and request pricing without execution
const stream = await connection.newStream('/bonzai/v1/pricing');
await stream.sink([JSON.stringify({ pipeline: "image_turbo" })]);

// Provider returns pricing without requiring payment
const response = await readStream(stream);
// { "pipeline": "image_turbo", "price": "10000000000000", "unit": "image", "currency": "ETH" }
```

Or query multiple pipelines at once:

```javascript
await stream.sink([JSON.stringify({ pipelines: ["llm", "image_turbo", "companions"] })]);

// Response
{
  "pricing": {
    "llm": { "price": "100000000000", "unit": "1K tokens" },
    "image_turbo": { "price": "10000000000000", "unit": "image" },
    "companions": { "price": "20000000000000", "unit": "message" }
  }
}
```

This allows consumers to:
1. Compare prices across multiple providers
2. Display pricing to users before they commit
3. Auto-select the cheapest provider for a given pipeline

## Step 2: Connect via libp2p

Dial the provider directly using their peer ID:

```javascript
// Dial provider
const connection = await libp2p.dial(peerId);

// Open inference stream
const stream = await connection.newStream('/bonzai/v1/inference');

// Send request
await stream.sink([JSON.stringify({
  pipeline: "image_turbo",
  params: {
    prompt: "A sunset over the ocean",
    width: 768,
    height: 512
  }
})]);
```

## Step 3: Handle Payment (x402)

Provider responds with **402 Payment Required** including pipeline-specific pricing:

```json
{
  "ok": false,
  "error": "payment_required",
  "payment": {
    "pipeline": "image_turbo",
    "amount": "10000000000000",
    "unit": "image",
    "currency": "ETH",
    "decimals": 18,
    "humanAmount": "0.00001",
    "providerId": "0xabc123...",
    "relayProviderId": "0xdef456...",
    "chainId": 8453,
    "contract": "0x...",
    "validFor": 300
  }
}
```

### Per-Pipeline Pricing

Each pipeline type has its own pricing unit:

| Pipeline | Unit | Example Price (ETH) |
|----------|------|---------------------|
| `llm` | per 1K tokens | 0.0000001 |
| `image_*` | per image | 0.00001 |
| `audio_*` | per second | 0.000001 |
| `music` | per second | 0.00005 |
| `video_fast` | per second | 0.0001 |
| `vision` | per image | 0.000005 |
| `companions` | per message | 0.00002 |

### Sign and Retry

After reviewing the price, sign an EIP-712 ETH payment authorization:

```javascript
// Sign ETH payment authorization (EIP-712)
const signature = await wallet.signTypedData({
  domain: { name: "BonzaiP2PPayment", version: "1", chainId: 8453, verifyingContract: PAYMENT_CONTRACT },
  types: {
    PaymentAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" }
    ]
  },
  message: {
    from: consumerAddress,
    to: payment.providerId,
    value: payment.amount,
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + payment.validFor,
    nonce: randomBytes32()
  }
});

// Retry with payment
await stream.sink([JSON.stringify({
  pipeline: "image_turbo",
  params: { prompt: "A sunset over the ocean", width: 768, height: 512 },
  payment: {
    signature,
    from: consumerAddress,
    validAfter: 0,
    validBefore: Math.floor(Date.now() / 1000) + 300,
    nonce: nonce,
    amount: payment.amount
  }
})]);
```

## Step 4: Receive Result

```json
{
  "ok": true,
  "result": {
    "image_base64": "iVBORw0KGgoAAAANSUhEUgAA..."
  },
  "usage": {
    "durationMs": 3500
  }
}
```

---

# Payment (Remote Mode Only)

### ETH on Base

- **Chain:** Base (8453)
- **Currency:** ETH (native)
- **Decimals:** 18
- **Gas:** ~$0.001 per transaction

### Fee Distribution

| Recipient | Direct Connection | Via Relay |
|-----------|-------------------|-----------|
| Provider | 97.5% | 92.5% |
| Relay | - | 5% |
| Protocol | 2.5% | 2.5% |

### Self-Inference

If consumer wallet === provider wallet, no payment required.

---

# Expected Response Times

Generation times vary significantly based on hardware (GPU vs CPU, VRAM). The gateway should use the timeout specified in metadata (600s = 10 minutes).

| Pipeline | Typical Time (GPU) | Typical Time (CPU) | Notes |
|----------|-------------------|-------------------|-------|
| `llm` | 2-10s | 10-60s | Depends on model size |
| `image_turbo` | 5-15s | 30-120s | Fast model, 4 steps |
| `image_quality` | 15-45s | 2-5 min | High quality, more steps |
| `audio_turbo` | 2-5s | 10-30s | Fast TTS (Kokoro) |
| `audio_quality` | 5-15s | 30-90s | Persona TTS (Qwen3-TTS) |
| `music` | 30-120s | 3-10 min | 60s audio at 27 steps |
| `video_fast` | 1-3 min | 5-15 min | LTX-2, 61 frames |
| `vision` | 5-15s | 30-60s | Image analysis (Qwen3-VL) |

**IMPORTANT:** The webhook endpoint (`/webhook` on port 3002) handles requests synchronously. The gateway MUST wait for the full response before sending to the user. A premature timeout will result in the user receiving an error even though generation succeeds.

First-time generation for any pipeline may take longer due to model download (several GB per model).

---

# Error Handling

| Error | Mode | Description | Solution |
|-------|------|-------------|----------|
| Connection refused | Local | BonzAI Desktop not running | Start the desktop app |
| 401 Unauthorized | Local | Missing or invalid auth | Add `Authorization: Bearer <token>` or `X-Demo-Mode: true` |
| 403 Forbidden | Local | Insufficient level for feature | Upgrade BONZAI token holdings |
| `payment_required` | Remote | Provider requires payment | Sign EIP-712 ETH authorization and retry |
| `insufficient_level` | Remote | Provider can't serve this pipeline | Try different provider or upgrade |
| `provider_offline` | Remote | Provider not responding | Try different provider |

---

# Resources

- Website: https://bonzai.sh
- Docs: https://docs.bonzai.sh
- Discord: https://discord.gg/bonzai
- GitHub: https://github.com/bonzai-ai
