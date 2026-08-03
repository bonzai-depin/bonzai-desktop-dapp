---
name: bonzai
description: Local-first AI generation, companions, skills, and peer inference through BonzAI Desktop
version: 2.1.0
homepage: https://bonzai.sh
platforms: [macos, linux]
metadata:
  hermes:
    tags: [ai, inference, image-generation, tts, music, video, companions, p2p]
    category: ai
    requires_toolsets: [web]
    timeout: 600
---

# BonzAI

Use BonzAI Desktop when a user wants local language or multimodal generation, companion chat, or BonzAI skills. Local inference is free. Discovered peers can contribute compute without receiving private memory or application data; providers participate in protocol reward pools rather than charging the user per request.

## Procedure

1. Check `GET http://localhost:3002/health`.
2. If unavailable, ask the user to start BonzAI Desktop.
3. Send commands or chat to `POST http://localhost:3002/webhook`.
4. Use a stable `channelId` and set `platform` to `hermes`.
5. Wait for the synchronous response. Initial model downloads and media generation may take several minutes.

```json
{
  "platform": "hermes",
  "channelId": "stable-session-id",
  "message": "!bonzai status",
  "userId": "stable-user-id",
  "imageBase64": null
}
```

## Commands

- `!bonzai status`, `network`, `models`, `model <name>`, `reset`, or `help`.
- `!bonzai generate image|image_quality|image_standard <prompt>`.
- `!bonzai generate video <prompt>`.
- `!bonzai generate audio|audio_quality <text>`.
- `!bonzai generate music <prompt>`.
- `!bonzai generate vision` with an image supplied in `imageBase64`.
- `!bonzai companion list|select <name>` and `scenario list|select <name>`.
- `!bonzai skill list|info|search|run`.
- `!bonzai autonomous on|off|status`.

A message without a command prefix chats with the selected companion.

Optional companion minting commands are `!bonzai mint bare`, `companion`, `status`, and `finalize`. Minting requires configured protocol infrastructure and is never required for local generation.

## Direct language endpoint

```text
Base URL: http://localhost:3002/v1
Endpoint:  /chat/completions
```

Discover the active model from BonzAI. Do not assume a fixed inventory. For images, audio, music, video, or vision, prefer webhook commands so the desktop app can validate model availability and route the request.

## Verification

- Treat an `error` response as failure; do not manufacture a result.
- Return generated local paths or response fields exactly as supplied by BonzAI.
- If a model is missing, surface the required download instead of selecting an unrelated model silently.
- If ownership infrastructure is unavailable, preserve local creation and explain that publishing is unavailable.

Resources: [bonzai.sh](https://bonzai.sh) and [docs.bonzai.sh](https://docs.bonzai.sh).
