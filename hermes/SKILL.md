---
name: bonzai
description: Decentralized AI inference - generate images, audio, music, video, and chat with AI companions via P2P network
version: 2.0.0
homepage: https://bonzai.sh
platforms: [macos, linux]
metadata:
  hermes:
    tags: [ai, inference, image-generation, tts, music, video, companions, web3, p2p]
    category: ai
    requires_toolsets: [web]
    # Generation can take 1-5 minutes depending on hardware
    # Hermes must wait for the full response before sending to user
    timeout: 600
---

# BonzAI Skill

Access decentralized AI inference through BonzAI. Generate images, audio, music, video, and chat with AI companions.

## When to Use

- User asks to generate images, audio, music, or video locally
- User wants to chat with AI companions
- User mentions BonzAI, decentralized AI, or local inference
- User wants to mint companion NFTs or interact with the BonzAI ecosystem

## Two Modes

| Mode | Description | Cost |
|------|-------------|------|
| **Local** | User runs BonzAI Desktop | Free |
| **Remote** | Connect to P2P providers | Paid (ETH on Base) |

```
LOCAL MODE
  Hermes ───HTTP (free)───► localhost:3002 (BonzAI Desktop)

REMOTE MODE
  Hermes ───► Base Contract ───► libp2p dial to provider (pay ETH)
```

## Procedure

### Step 1: Check Availability

```http
GET http://localhost:3002/health
```

Response:
```json
{
  "status": "ok",
  "llmLoaded": true,
  "modelName": "mythomax-l2-13b.Q5_K_M.gguf",
  "flaskPort": 65000,
  "companions": 13,
  "scenarios": 13,
  "rendererReady": true
}
```

If this fails, BonzAI Desktop is not running. Ask the user to start it.

### Step 2: Use the Webhook Interface

Send commands and chat messages:

```http
POST http://localhost:3002/webhook
Content-Type: application/json

{
  "platform": "hermes",
  "channelId": "hermes-session-id",
  "message": "your message or command here",
  "userId": "hermes-user",
  "imageBase64": null
}
```

**Important:** Always use `"platform": "hermes"` to identify requests from Hermes Agent.

### Step 3: Use Commands or Chat

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
- `!generate vision` - Image analysis (requires image attachment)

**Settings:**
- `!settings audio on|off` - Toggle voice generation
- `!settings images on|off` - Toggle image generation
- `!settings video on|off` - Toggle video generation
- `!settings music on|off` - Toggle music generation
- `!settings level pg|pg13|mature|adult` - Set content level

**Session:**
- `!status` - Show current session
- `!reset` - Clear history
- `!models` - List LLM models
- `!model <name>` - Load specific model
- `!help` - Show all commands

**Skills:**
- `!skill list [category]` - List available skills
- `!skill info <id>` - Show skill details
- `!skill run <id> [key=value ...]` - Execute a skill
- `!skill search <query>` - Search skills

**Minting:**
- `!mint bare [gender]` - Mint a bare companion NFT
- `!mint companion <name>` - Mint a complete companion
- `!mint status` - Check mint status
- `!mint finalize <tokenId>` - Finalize a bare companion

**Chat:** Any message without `!` prefix chats with the selected companion.

## Pitfalls

- BonzAI Desktop must be running on localhost for local mode
- First-time generation for any pipeline downloads models (several GB) — expect longer waits
- Video and music generation can take 1-5 minutes on slower hardware
- The webhook is synchronous — wait for the full response before showing to user
- Images are returned as local file paths, not base64

## Verification

After sending a command, verify:
1. Response contains `"text"` field with the result
2. For generation commands, check for `"imagePath"`, `"audioPath"`, or `"videoPath"`
3. No `"error"` field in the response

## OpenAI-Compatible LLM Endpoint

Hermes Agent can also use BonzAI's LLM directly via the OpenAI-compatible API:

```
Base URL: http://localhost:3002/v1
API Key: bonzai-local (any non-empty string)
Model: bonzai-sovereign
```

This provides access to whichever local LLM model is currently loaded in BonzAI Desktop (38 models available).

## Available Pipelines

| Pipeline | Endpoint | Description |
|----------|----------|-------------|
| `llm` | `/v1/chat/completions` | Local LLM (38 models) |
| `image_turbo` | Flask `:65000/image/turbo` | Fast image (FLUX Klein) |
| `image_quality` | Flask `:65000/image/quality` | Quality image (FLUX Krea) |
| `image_standard` | Flask `:65000/image/standard` | Standard image (SDXL) |
| `image_advanced` | Flask `:65000/image/advanced` | Advanced image (Z-Image) |
| `audio_turbo` | Flask `:65000/audio/turbo` | Fast TTS (Kokoro) |
| `audio_quality` | Flask `:65000/audio/quality/persona` | Persona TTS (Qwen3-TTS) |
| `music` | Flask `:65000/audio/music` | Music (ACE-Step) |
| `video_fast` | Flask `:65000/video` | Video (LTX-2) |
| `vision` | Flask `:65000/vision/analyze` | Vision (Qwen3-VL) |

## Resources

- Website: https://bonzai.sh
- Docs: https://docs.bonzai.sh
- Discord: https://discord.gg/bonzai
