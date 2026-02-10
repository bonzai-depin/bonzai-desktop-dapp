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
| **Remote** | Connect to P2P providers | Paid (USDC) |

```
LOCAL MODE
  OpenClaw ───HTTP (free)───► localhost:3002 (BonzAI Desktop)

REMOTE MODE
  OpenClaw ───► Arbitrum Contract ───► libp2p dial to provider (pay USDC)
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
  "version": "1.1.0",
  "pipelines": ["llm", "image_turbo", "audio", "music", "video_fast", "vision"]
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
| `/image/turbo` | 65000 | POST | Bearer/Demo | Fast image generation |
| `/image/quality` | 65000 | POST | Bearer/Demo | High quality image generation |
| `/image/standard` | 65000 | POST | Bearer/Demo | Standard image generation |
| `/image/advanced` | 65000 | POST | Bearer/Demo | Advanced image generation |
| `/audio/turbo` | 65000 | POST | Bearer/Demo | Fast TTS |
| `/audio/quality/persona` | 65000 | POST | Bearer/Demo | Persona-based TTS |
| `/audio/quality/design` | 65000 | POST | Bearer/Demo | Voice design from description |
| `/audio/quality/clone` | 65000 | POST | Bearer/Demo | Voice cloning from audio |
| `/audio/music` | 65000 | POST | Bearer/Demo | Music generation |
| `/video` | 65000 | POST | Bearer/Demo | Video generation |
| `/vision/analyze` | 65000 | POST | Bearer/Demo | Image analysis |

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
  "userId": "user-wallet-address"
}
```

### Commands

**Companion & Scenario:**
- `!companion list` - List available companions
- `!companion select <name>` - Select a companion
- `!scenario list` - List scenarios
- `!scenario select <name>` - Select a scenario

**Generation:**
- `!generate image <prompt>` - Generate image (fast)
- `!generate image_quality <prompt>` - High quality image
- `!generate music <prompt>` - Generate music
- `!generate video <prompt>` - Generate video
- `!generate audio <text>` - Text-to-speech

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
  "message": "Hello Scarlett, you look beautiful tonight.",
  "userId": "user1"
}
```

Response:
```json
{
  "text": "*Scarlett looks up with a warm smile* Why thank you, darling...",
  "companion": {"id": "scarlett", "name": "Scarlett"},
  "scenario": {"id": "jazz_club", "name": "The Blue Note Jazz Club"},
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

## Compact Models (< 4 GB)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `gemma_3_1b` | Gemma 3 1B | 0.8 GB | 2 GB |
| `deepseek_r1_1_5b` | DeepSeek R1 1.5B | 1.1 GB | 2 GB |
| `qwen_2_5_3b` | Qwen 2.5 3B | 2 GB | 4 GB |
| `phi_3_mini` | Phi-3 Mini 4K | 2.4 GB | 4 GB |
| `phi_4_mini` | Phi-4 Mini | 2.5 GB | 4 GB |

## Standard Models (4-8 GB)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `llama_2_7b` | LLaMA 2 7B Chat | 4 GB | 6 GB |
| `mistral_7b` | Mistral 7B Instruct | 4.4 GB | 6 GB |
| `deepseek_r1_7b` | DeepSeek R1 7B | 4.7 GB | 6 GB |
| `qwen_coder_7b` | Qwen 2.5 Coder 7B | 4.7 GB | 6 GB |
| `llama_3_1_8b` | LLaMA 3.1 8B | 4.92 GB | 6 GB |
| `glm_4_7_flash` | GLM 4.7 Flash | 5 GB | 6 GB |
| `qwen3_coder_next` | Qwen3 Coder Next | 5 GB | 6 GB |
| `yi_coder_9b` | Yi Coder 9B | 5.7 GB | 8 GB |
| `mythomax_13b` | MythoMax L2 13B | 7.87 GB | 10 GB |

## Large Models (8-14 GB)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `qwen_coder_14b` | Qwen 2.5 Coder 14B | 8.9 GB | 10 GB |
| `hermes_4_14b` | Hermes 4 14B | 8.99 GB | 10 GB |
| `gpt_oss_20b` | GPT-OSS 20B | 12 GB | 14 GB |
| `codestral_22b` | Codestral 22B | 13 GB | 16 GB |

## Extra Large Models (16+ GB)

| Model Key | Name | Size | VRAM |
|-----------|------|------|------|
| `deepseek_r1_32b` | DeepSeek R1 32B | 19 GB | 24 GB |
| `qwen_coder_32b` | Qwen 2.5 Coder 32B | 19 GB | 24 GB |
| `qwen3_coder_30b` | Qwen3 Coder 30B A3B | 20 GB | 24 GB |

---

# Available Pipelines

## Text Generation

| Pipeline | Endpoint | Description |
|----------|----------|-------------|
| `llm` | via electronAPI | Local LLM inference (21 models available) |

## Image Generation

| Pipeline | Endpoint | Speed | Quality |
|----------|----------|-------|---------|
| `image_turbo` | `/image/turbo` | Fast | Good |
| `image_standard` | `/image/standard` | Medium | Good |
| `image_advanced` | `/image/advanced` | Medium | High |
| `image_quality` | `/image/quality` | Slower | Excellent |

## Audio Generation

| Pipeline | Endpoint | Features |
|----------|----------|----------|
| `audio_turbo` | `/audio/turbo` | Fast, high-quality TTS |
| `audio_quality_persona` | `/audio/quality/persona` | Persona-based TTS with voice design |
| `audio_quality_design` | `/audio/quality/design` | Create voice from text description |
| `audio_quality_clone` | `/audio/quality/clone` | Clone voice from reference audio |

## Music Generation

| Pipeline | Endpoint | Features |
|----------|----------|----------|
| `music` | `/audio/music` | Lyrics support, genre tags, 30-240s |

## Video Generation

| Pipeline | Endpoint | Features |
|----------|----------|----------|
| `video_fast` | `/video` | Text-to-video, image-to-video |

## Vision Analysis

| Pipeline | Endpoint | Features |
|----------|----------|----------|
| `vision` | `/vision/analyze` | Image analysis, description, OCR |

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

**Resolutions:** 512×512 (SD), 768×768 (HD), 1024×1024 (FHD), 1536×1536 (2K), 2048×2048 (4K)

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

### Video

```json
{
  "pipeline": "video_fast",
  "params": {
    "prompt": "A cat playing with yarn",
    "height": 480,
    "width": 768,
    "num_frames": 81,
    "fps": 24,
    "num_inference_steps": 30,
    "guidance_scale": 3.5,
    "image_base64": null
  }
}
```

**Modes:**
- Text-to-Video: Omit `image_base64`
- Image-to-Video: Include `image_base64` (base64-encoded image)

**Resolutions:** 480p, 540p, 720p, 1080p, 4K
**Duration:** 5s or 10s
**FPS:** 12, 24, 48

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

# Remote Mode

Use when connecting to BonzAI providers on the P2P network.

## Step 1: Discover Providers

Query the BonzAI contract on Arbitrum to find available providers:

**Contract:** `BonzAINetwork` on Arbitrum One (42161)
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
// { "pipeline": "image_turbo", "price": "10000", "unit": "image", "currency": "USDC" }
```

Or query multiple pipelines at once:

```javascript
await stream.sink([JSON.stringify({ pipelines: ["llm", "image_turbo", "companions"] })]);

// Response
{
  "pricing": {
    "llm": { "price": "100", "unit": "1K tokens" },
    "image_turbo": { "price": "10000", "unit": "image" },
    "companions": { "price": "20000", "unit": "message" }
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
    "amount": "10000",
    "unit": "image",
    "currency": "USDC",
    "decimals": 6,
    "humanAmount": "0.01",
    "providerId": "0xabc123...",
    "relayProviderId": "0xdef456...",
    "chainId": 42161,
    "contract": "0x...",
    "validFor": 300
  }
}
```

### Per-Pipeline Pricing

Each pipeline type has its own pricing unit:

| Pipeline | Unit | Example Price |
|----------|------|---------------|
| `llm` | per 1K tokens | $0.0001 |
| `image_*` | per image | $0.01 |
| `audio_*` | per second | $0.001 |
| `music` | per second | $0.05 |
| `video_fast` | per second | $0.10 |
| `vision` | per image | $0.005 |
| `companions` | per message | $0.02 |

### Sign and Retry

After reviewing the price, sign an ERC-3009 USDC authorization:

```javascript
// Sign USDC transfer authorization (EIP-712)
const signature = await wallet.signTypedData({
  domain: { name: "USD Coin", version: "2", chainId: 42161, verifyingContract: USDC_ADDRESS },
  types: {
    TransferWithAuthorization: [
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

### USDC on Arbitrum

- **Token:** Native USDC on Arbitrum One
- **Address:** `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- **Decimals:** 6 (1000000 = $1.00)

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
| `audio_turbo` | 2-5s | 10-30s | Fast TTS |
| `music` | 30-120s | 3-10 min | 60s audio at 27 steps |
| `video_fast` | 1-3 min | 5-15 min | 81 frames at 24fps |
| `vision` | 5-15s | 30-60s | Image analysis |

**IMPORTANT:** The webhook endpoint (`/webhook` on port 3002) handles requests synchronously. The gateway MUST wait for the full response before sending to the user. A premature timeout will result in the user receiving an error even though generation succeeds.

First-time generation for any pipeline may take longer due to model download (several GB per model).

---

# Error Handling

| Error | Mode | Description | Solution |
|-------|------|-------------|----------|
| Connection refused | Local | BonzAI Desktop not running | Start the desktop app |
| 401 Unauthorized | Local | Missing or invalid auth | Add `Authorization: Bearer <token>` or `X-Demo-Mode: true` |
| 403 Forbidden | Local | Insufficient level for feature | Upgrade BONZAI token holdings |
| `payment_required` | Remote | Provider requires payment | Sign ERC-3009 USDC authorization and retry |
| `insufficient_level` | Remote | Provider can't serve this pipeline | Try different provider or upgrade |
| `provider_offline` | Remote | Provider not responding | Try different provider |

---

# Resources

- Website: https://bonzai.sh
- Docs: https://docs.bonzai.sh
- Discord: https://discord.gg/bonzai
- GitHub: https://github.com/bonzai-ai
