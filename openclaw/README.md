# BonzAI OpenClaw Integration

This integration connects OpenClaw multi-channel gateway to BonzAI's companion and skill system, enabling AI companions to interact across WhatsApp, Telegram, Discord, and Mattermost.

## Architecture

The OpenClaw integration uses the **same code path as the desktop UI**:

1. **Webhook** arrives at main.js (port 3002)
2. **Main process** forwards to renderer via IPC
3. **Renderer** uses existing flagship.js and store
4. **Response** sent back via IPC to main process
5. **Main process** returns response to OpenClaw gateway

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
│  │  • /webhook         │              │ • Uses flagship.js  │   │
│  │  • /companions      │              │ • Uses store        │   │
│  │  • /scenarios       │              │ • Same generation   │   │
│  │  • /api/llm/*       │              │   pipeline as UI    │   │
│  └─────────────────────┘              └─────────────────────┘   │
│           │                                    │                │
│           ▼                                    ▼                │
│  ┌─────────────────┐              ┌─────────────────────────┐   │
│  │ node-llama-cpp  │              │   Flask Server :65000   │   │
│  │   (LLM Engine)  │              │   Image/Audio/Video     │   │
│  └─────────────────┘              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Benefits:**
- Same code path as desktop UI (flagship.js, store)
- No code duplication
- Production builds work automatically
- Uses existing companion/scenario data from store

## Quick Start

### 1. Start the BonzAI Desktop App

```bash
cd /path/to/bonzai-desktop-dapp
npm run start
```

This starts everything:
- Electron app with OpenClaw API on port 3002
- Flask server on port 65000
- Renderer with OpenClaw webhook handler

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

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Main chat endpoint (forwards to renderer) |
| `/health` | GET | Health check with companion/scenario counts |
| `/companions` | GET | List all companions (from store) |
| `/scenarios` | GET | List all scenarios (from store) |
| `/companion/:id` | GET | Get companion details |
| `/api/llm/chat` | POST | Direct LLM chat |
| `/api/llm/load` | POST | Load an LLM model |
| `/api/llm/unload` | POST | Unload current model |
| `/api/llm/info` | GET | Get LLM status |
| `/api/flask/*` | * | Proxy to Flask server |

## Webhook Format

```json
{
  "platform": "discord",
  "channelId": "channel-123",
  "message": "Hello Scarlett!",
  "userId": "user-456"
}
```

Response:

```json
{
  "text": "*Scarlett smiles warmly* Hello, darling...",
  "companion": { "id": "scarlett", "name": "Scarlett" },
  "scenario": { "id": "private_spa", "name": "A Night at the Private Spa" },
  "audioPath": "/path/to/audio.wav",
  "imageBase64": "..."
}
```

## Chat Commands

| Command | Description |
|---------|-------------|
| `!companion list` | List available companions |
| `!companion select <name>` | Select a companion |
| `!scenario list` | List available scenarios |
| `!scenario select <name>` | Select a scenario |
| `!settings audio on\|off` | Toggle voice generation |
| `!settings images on\|off` | Toggle image generation |
| `!settings level <level>` | Set content level (pg/pg13/mature/adult) |
| `!reset` | Clear conversation history |
| `!help` | Show all commands |

## Data Storage

Companion and scenario data is stored in the **Electron Store** (same as desktop UI):

- `store.get('companions')` - Custom companions
- `store.get('scenarios')` - Custom scenarios

Predefined companions/scenarios from flagship.js are merged with custom ones.

## Bridge CLI Utility

The `bridge.js` file is a CLI utility for testing:

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

## Moltbook Agent

The Moltbook ambassador agent (`moltbook-agent.js`) runs as a separate process:

```bash
node moltbook-agent.js
```

| Activity | Frequency |
|----------|-----------|
| Check notifications | Every 5 min |
| Browse feed | Every 5 min |
| Upvote/comment | Every 5 min |
| Thought-leadership post | Daily |

## Files

| File | Purpose |
|------|---------|
| `bridge.js` | CLI utility for testing |
| `moltbook-agent.js` | Moltbook ambassador agent |
| `package.json` | Node package configuration |
