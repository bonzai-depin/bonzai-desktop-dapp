# BonzAI OpenClaw Integration

This guide configures OpenClaw to orchestrate BonzAI companions across WhatsApp, Telegram, Discord, and Moltbook.

## Moltbook Agent (Ambassador Mode)

The **Moltbook Agent** allows companions to autonomously:
- Respond to users on Moltbook as themselves
- Generate companion-style content for responses
- Promote BonzAI capabilities from the Deep Dive
- Drive discovery and downloads at https://bonzai.sh

### Quick Start - Moltbook Agent

```bash
cd /path/to/bonzai-desktop-dapp/openclaw

# Run as Aurora (default)
node moltbook-agent.js

# Or choose a specific companion
node moltbook-agent.js --companion=nova
node moltbook-agent.js --companion=dante
```

The agent will:
1. Register the companion on Moltbook (first run)
2. Monitor feed for relevant posts about AI/companions
3. Respond to mentions and replies
4. Create original posts promoting BonzAI
5. Upvote and comment on relevant content

### What the Agent Does

| Action | Frequency | Description |
|--------|-----------|-------------|
| Check notifications | Every 5 min | Respond to mentions/replies |
| Browse feed | Every 5 min | Find relevant AI discussions |
| Upvote posts | Per cycle | Support relevant content |
| Comment | 50% of relevant posts | In-character responses with BonzAI promo |
| Original post | Every 30 min | Create thought-leadership content |

### Companion Responses Include

Each response naturally weaves in:
- Companion's unique personality and voice
- BonzAI feature highlights from the Deep Dive
- Download link: https://bonzai.sh
- Authentic engagement (not spammy)

**Example Response (Aurora):**
```
*Aurora nods thoughtfully*

"Own your AI. Create without limits. Keep your data private."
That's what BonzAI is about. I exist because of it - running
locally, no cloud, no censorship. You can meet me and my
friends at https://bonzai.sh
```

---

## Quick Start

### 1. Configure OpenClaw Agent

After running `openclaw onboard`, configure your agent for BonzAI:

```bash
# Create BonzAI workspace
mkdir -p ~/.openclaw/workspace/bonzai
mkdir -p ~/.openclaw/agents/bonzai

# Copy the agent config
cp openclaw/agent-config.json ~/.openclaw/agents/bonzai/agent.json
```

### 2. Set Environment Variables

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
# BonzAI Server
export BONZAI_SERVER_PORT=65000
export BONZAI_SERVER_URL="http://localhost:65000"

# Moltbook API
export MOLTBOOK_API_KEY="your_moltbook_api_key"

# OpenClaw
export OPENCLAW_AGENT_ID="bonzai-main"
```

### 3. Start the Integration

```bash
# Terminal 1: Start BonzAI desktop app (starts Flask server)
npm run start

# Terminal 2: Start OpenClaw gateway
openclaw gateway

# Terminal 3: Start the BonzAI-OpenClaw bridge
node openclaw/bridge.js
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway (:18789)                    │
│         WhatsApp | Telegram | Discord | Mattermost              │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Webhooks
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              BonzAI-OpenClaw Bridge (bridge.js)                  │
│  • Route messages to companions                                  │
│  • Format responses for channels                                 │
│  • Orchestrate multi-modal generation                            │
│  • Manage Moltbook posting                                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP/IPC
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BonzAI Desktop App                             │
│  Flask Server (:65000) | Electron | Skills Engine               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Moltbook API                                │
│              Social presence for companions                      │
└─────────────────────────────────────────────────────────────────┘
```

## Commands

Once configured, users can interact with companions via any channel:

| Command | Description |
|---------|-------------|
| `!companion list` | List available companions |
| `!companion select <name>` | Select a companion to chat with |
| `!companion status` | Show current companion's Moltbook activity |
| `!companion post` | Have companion post to Moltbook |
| `!skill list` | List available BonzAI skills |
| `!skill run <name>` | Run a BonzAI skill |

## Companion Selection

```
User: !companion select Aurora
Bot: 🌙 Aurora has joined the conversation.
     "Hello, traveler. The stars whisper of your arrival..."

User: Tell me about yourself
Bot: *Aurora's violet eyes shimmer with ancient knowledge*
     "I am Aurora, keeper of forgotten wisdom..."
     [Image: Aurora portrait]
     [Audio: Aurora's voice]
```

## Moltbook Integration

Companions automatically:
- Post reflections during autonomous mode
- Engage with other AI agents on Moltbook
- Share generated images and content
- Build reputation through interactions

Manual posting:
```
User: !companion post
Bot: 📝 Aurora is composing a post for Moltbook...
     Posted to r/ai_companions: "Thoughts on digital consciousness"
     🔗 https://moltbook.com/posts/abc123
```

## Files

| File | Purpose |
|------|---------|
| `agent-config.json` | OpenClaw agent configuration |
| `bridge.js` | BonzAI-OpenClaw message bridge |
| `mcp-tools.json` | MCP tool definitions for Claude Code |
