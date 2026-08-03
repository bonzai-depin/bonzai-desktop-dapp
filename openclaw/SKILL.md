---
name: bonzai
description: Local-first AI generation, companions, skills, and peer inference through BonzAI Desktop
homepage: https://bonzai.sh
user-invocable: true
metadata:
  openclaw:
    requires:
      config:
        - models.providers.bonzai
    timeout: 600
    async: false
---

# BonzAI

Use BonzAI Desktop for local language and multimodal inference, companion conversations, and skills. BonzAI may discover peers that contribute available compute, but prompts and private application data are not exposed merely by peer discovery. Inference is free to the user; providers participate in protocol reward pools rather than charging a per-request fee.

## Availability

BonzAI Desktop must be running for the local gateway:

```http
GET http://localhost:3002/health
```

The main synchronous interface is:

```http
POST http://localhost:3002/webhook
Content-Type: application/json

{
  "platform": "openclaw",
  "channelId": "stable-session-id",
  "message": "!bonzai status",
  "userId": "stable-user-id",
  "imageBase64": null
}
```

Retain a stable `channelId` to preserve the corresponding BonzAI session. Wait for the complete response; image, music, and video generation can take several minutes, especially during a first model download.

## Commands

All commands use the `!bonzai` prefix.

### Models and status

- `!bonzai status`: show the current session and network state.
- `!bonzai models`: list available language models.
- `!bonzai model <name>`: load a language model.
- `!bonzai model restore`: restore the model used before companion chat.
- `!bonzai network`: show local and peer capabilities.
- `!bonzai reset`: clear the current conversation history.
- `!bonzai help`: show command help.

### Generation

- `!bonzai generate image <prompt>`: fast image generation.
- `!bonzai generate image_quality <prompt>`: quality image generation.
- `!bonzai generate image_standard <prompt>`: standard image generation.
- `!bonzai generate video <prompt>`: video generation.
- `!bonzai generate audio <text>`: fast speech generation.
- `!bonzai generate audio_quality <text>`: quality speech generation.
- `!bonzai generate music <prompt>`: music generation.
- `!bonzai generate vision`: analyze the attached image supplied in `imageBase64`.

### Companions

- `!bonzai companion list`
- `!bonzai companion select <name>`
- `!bonzai scenario list`
- `!bonzai scenario select <name>`
- `!bonzai settings audio|images|video|music on|off`
- `!bonzai settings level pg|pg13|mature|adult`
- `!bonzai autonomous on|off|status`
- `!bonzai autonomous config idle|interval|max <value>`

A message without a command prefix is sent to the selected companion.

### Skills

- `!bonzai skill list [category]`
- `!bonzai skill info <id>`
- `!bonzai skill search <query>`
- `!bonzai skill run <id> [key=value ...]`

### Optional ownership

- `!bonzai mint bare [gender]`
- `!bonzai mint companion <name>`
- `!bonzai mint status`
- `!bonzai mint finalize <tokenId>`

Minting is optional and requires a configured wallet, economy network, deployed contracts, and decentralized metadata storage. Never imply that minting is required for generation or companion chat.

## Direct language endpoint

BonzAI exposes the currently loaded language model through an OpenAI-compatible endpoint:

```text
Base URL: http://localhost:3002/v1
Endpoint:  /chat/completions
```

Discover model availability from BonzAI instead of assuming a fixed model count or filename.

## Multimodal services

The desktop gateway orchestrates local image, speech, music, video, vision, and training services on the configured Flask port, normally `65000`. Prefer the webhook commands unless a direct service call is required. Direct Flask calls must use the authentication flow implemented by the running server.

## Failure handling

| Condition | Action |
| --- | --- |
| Gateway unavailable | Ask the user to start BonzAI Desktop. |
| Model unavailable | Surface the required model and let the user approve its download. |
| Request still running | Continue waiting up to the configured timeout. |
| Peer unavailable | Retry locally or select another discovered provider without exposing private context. |
| Wallet or contract unavailable | Keep local generation available and explain that only publishing is blocked. |

Resources: [bonzai.sh](https://bonzai.sh) and [docs.bonzai.sh](https://docs.bonzai.sh).
