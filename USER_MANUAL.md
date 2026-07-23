# BonzAI Desktop Application User Manual

A comprehensive guide to the BonzAI decentralized AI inference desktop application.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [System Requirements](#system-requirements)
3. [Navigation Overview](#navigation-overview)
4. [Chat (Generative Text)](#chat-generative-text)
5. [Audio Generation](#audio-generation)
6. [Image Generation](#image-generation)
7. [Video Generation](#video-generation)
8. [3D Assets](#3d-assets)
9. [Training](#training)
10. [Agentic Skills](#agentic-skills)
11. [Wallet & Level System](#wallet--level-system)
12. [P2P Network](#p2p-network)
13. [OpenClaw Integration](#openclaw-integration)
14. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Installation

1. Download BonzAI Desktop from [bonzai.sh](https://bonzai.sh)
2. Run the installer for your platform (macOS, Windows, or Linux)
3. Launch the application

### First Launch

On first launch, BonzAI will:
- Initialize the Flask inference server (port 65000)
- Create a model directory at `~/bonzai-models/`
- Display the Chat interface by default

The system memory indicator in the top-left shows your available RAM + VRAM.

---

## System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| RAM | 8 GB | 16+ GB |
| VRAM | 4 GB | 8+ GB |
| Storage | 20 GB | 100+ GB (for models) |
| OS | macOS 12+, Windows 10+, Ubuntu 20.04+ | Latest versions |

**GPU Support:**
- NVIDIA CUDA (best performance)
- Apple Silicon MPS (Metal Performance Shaders)
- CPU fallback (slower but works everywhere)

---

## Navigation Overview

The left sidebar provides access to all generation modes:

| Tab | Icon | Description |
|-----|------|-------------|
| **Chat** | `chat` | Local LLM text generation and conversation |
| **Audio** | `headphones` | Text-to-speech, voice cloning, and music generation |
| **Image** | `image` | AI image generation with multiple models |
| **Video** | `movie` | Text-to-video and image-to-video generation |
| **Assets** | `3d_rotation` | 3D model generation |
| **Training** | `exercise` | Robot and model training (LeRobot) |
| **Agents** | `hub` | Agentic skills marketplace |

The bottom bar displays wallet connection, level progress, and P2P network status.

---

## Chat (Generative Text)

### Overview

The Chat tab provides local LLM inference using node-llama-cpp. All processing happens on your device - your conversations never leave your machine.

### Selecting a Model

1. Click the model picker (folder icon) in the top-right
2. Browse available models or search by name
3. Click on a model to load it
4. Wait for the model to load (indicated by "Ready" status)

### Available Models

| Model | Size | Description |
|-------|------|-------------|
| Llama 3.1 8B | 4.7 GB | Fast general-purpose model |
| Mistral 7B | 4.1 GB | Efficient instruction-following |
| DeepSeek R1 7B | 4.7 GB | Reasoning-focused model |
| DeepSeek R1 32B | 19 GB | Advanced reasoning (requires 16+ GB VRAM) |
| Qwen Coder 32B | 19 GB | Code generation specialist |
| Hermes 4 14B | 8.4 GB | Helpful assistant model |
| Codestral 22B | 13 GB | Coding tasks |
| ...and more | | 21 models total |

### Chatting

1. Type your message in the input field
2. Press Enter or click Send
3. The response streams in real-time
4. Use the history panel to review past conversations

### Model Directory

Click the folder icon to change where models are stored. When changing directories, existing models are automatically migrated to the new location.

### OpenClaw Toggle (Lobster Icon)

Enable the lobster toggle to configure OpenClaw to use your local BonzAI LLM as its inference provider instead of cloud services.

---

## Audio Generation

### Overview

Generate speech, clone voices, and create music using local AI models.

### Modes

#### Text-to-Speech (TTS)

Convert text to natural-sounding speech.

1. Select "Text to Speech" mode
2. Choose voice gender (Female/Male)
3. Select language
4. Enter your text
5. Click Generate

**Modes:**
- **Turbo** - Fast, high-quality TTS
- **Quality** - Persona-based TTS with voice design

#### Voice Clone

Clone a voice from an audio sample.

1. Select "Voice Clone" mode
2. Upload a reference audio file (WAV, MP3)
3. Enter the text to speak in the cloned voice
4. Click Generate

#### Music Generation

Create AI-generated music with optional lyrics.

1. Select "Music" mode
2. Enter genre/style tags (e.g., "jazz, smooth, saxophone, 120bpm")
3. Optionally add lyrics with markers:
   ```
   [verse]
   Walking down the street
   [chorus]
   This is the chorus
   ```
4. Set duration (30-240 seconds)
5. Click Generate

**Model:** ACE-Step v1 3.5B (~8.3 GB)

### Playback

Generated audio appears in the history panel. Click to play, or use the download button to save.

---

## Image Generation

### Overview

Generate images from text prompts using various AI models.

### Modes

| Mode | Model | Speed | Quality | Best For |
|------|-------|-------|---------|----------|
| **Turbo** | FLUX Klein | Fast | Good | Quick iterations |
| **Standard** | SDXL 1.0 | Medium | Good | General use |
| **Advanced** | Z Turbo | Medium | High | Detailed images |
| **Quality** | Z-Image Turbo | Slower | Excellent | Final renders |
| **Edit** | Turbo Edit | Fast | Good | Image modifications |

### Resolution Options

| Quality | Resolution |
|---------|------------|
| SD | 512×512 |
| HD | 768×768 |
| FHD | 1024×1024 |
| 2K | 1536×1536 |
| 4K | 2048×2048 |

### Generating Images

1. Select a mode (Turbo, Standard, Advanced, Quality, or Edit)
2. Choose resolution
3. Enter your prompt describing the desired image
4. Click Generate
5. View result in the history panel

### Tips

- Use detailed, descriptive prompts
- Include style keywords (e.g., "oil painting", "photorealistic", "anime style")
- Higher resolutions require more VRAM and time
- Turbo mode is best for experimenting with prompts

### Animate to Video

Click the "Animate" button on any generated image to send it to the Video tab for image-to-video generation.

---

## Video Generation

### Overview

Generate videos from text prompts or images using LTX-2.

### Modes

| Mode | Description |
|------|-------------|
| **From Prompt** (T2V) | Generate video from text description |
| **From Image** (I2V) | Animate a still image into video |

### Settings

| Setting | Options | Description |
|---------|---------|-------------|
| Duration | 5s, 10s | Length of generated video |
| FPS | 12, 24, 48 | Frames per second |
| Resolution | 480p, 540p, 720p, 1080p, 4K | Output resolution |

### Generating Video

1. Select mode (From Prompt or From Image)
2. If using image mode, upload or paste an image
3. Enter a prompt describing the desired motion/action
4. Choose duration, FPS, and resolution
5. Click Generate
6. Wait for processing (video generation takes longer than images)

### Tips

- Start with lower resolutions for faster iteration
- Keep prompts focused on motion and action
- 5-second videos at 480p are fastest for testing
- Higher FPS results in smoother motion but longer generation time

---

## 3D Assets

### Overview

Generate 3D models from text descriptions or images.

### Features

- Text-to-3D generation
- Image-to-3D conversion
- Interactive 3D viewer
- Export to standard formats

### Generating 3D Assets

1. Navigate to the Assets tab
2. Enter a description of the 3D object
3. Optionally upload a reference image
4. Click Generate
5. Use the 3D viewer to inspect the result
6. Export in your preferred format

---

## Training

### Overview

The Training tab provides access to LeRobot for robot learning and model fine-tuning.

### Features

- Dataset collection
- Model training
- Robot control interfaces
- Training visualization

### Getting Started

1. Connect your robot hardware (if applicable)
2. Select a training task
3. Configure training parameters
4. Start the training process
5. Monitor progress in real-time

---

## Agentic Skills

### Overview

Skills are specialized AI-powered tools that combine prompts, tools, and execution logic. Browse, purchase, and run skills from the marketplace.

### Tabs

| Tab | Description |
|-----|-------------|
| **Browse** | Discover and acquire new skills |
| **Run** | Execute skills you own |

### Skill Categories

| Category | Icon | Description |
|----------|------|-------------|
| Finance | `trending_up` | Market analysis, trading, predictions |
| Entertainment | `sports_esports` | Games, media, creative tools |
| Productivity | `work` | Automation, organization, workflows |
| Analysis | `analytics` | Data analysis, research, insights |

### Built-in Skills

| Skill | Category | Description |
|-------|----------|-------------|
| Prediction Market Maker | Finance | Create DSLA prediction markets |
| TCG Insurance | Finance | Trading card game market analysis |
| Polymarket Top Performers | Analysis | Analyze top PnL traders |
| Roleplay Companion | Entertainment | AI companion chat with personas |

### Running Skills

1. Navigate to the "Run" tab
2. Select a skill from your collection
3. Configure any required inputs
4. Click Execute
5. View results in the skill panel

### Skill Requirements

Skills may require specific access levels (LVL1-LVL5). Check the requirement badge on each skill card.

---

## Wallet & Level System

### Connecting Your Wallet

1. Click "Connect Wallet" in the bottom bar
2. Approve the connection in MetaMask or your wallet
3. Sign the authentication message if prompted

### Supported Wallets

- MetaMask
- WalletConnect-compatible wallets

### Networks

- **Ethereum Mainnet** - Primary network
- **Arbitrum One** - Lower fees, P2P payments

### Level System

BonzAI uses a tiered level system to unlock features:

| Level | Required BONZAI | Features |
|-------|-----------------|----------|
| **LVL 1** | 1,000 | Basic generation |
| **LVL 2** | 5,000 | Enhanced resolution |
| **LVL 3** | 25,000 | Advanced models |
| **LVL 4** | 100,000 | Premium features |
| **LVL 5** | 500,000 | All features unlocked |
| **LVL ∞** | Access Pass NFT | Lifetime access |

### Unlocking Levels

You can unlock levels by:
1. **Holding BONZAI tokens** - Simply hold the required amount
2. **Minting an Access Pass NFT** - Permanent unlock even if you sell tokens

### Viewing Your Level

- Your current level is displayed next to your wallet address
- Click any level node in the progress bar to view requirements and benefits

---

## P2P Network

### Overview

BonzAI's P2P network enables decentralized AI inference. You can consume inference from others or provide inference to earn USDC.

### Network Modes

| Mode | Description | Cost |
|------|-------------|------|
| **Local Only** | Offline mode, no network features | Free |
| **Consumer** | Use remote providers when local is unavailable | Paid (USDC) |
| **Provider** | Earn USDC by serving inference to others | Earn |

### Opening Network Settings

Click the "Serve Peers" button in the bottom bar to open the network settings modal.

### Switching Modes

Select your desired mode from the mode selector:
- **Local Only** - Use only your local hardware
- **Consumer** - Access remote providers when needed
- **Provider** - Serve inference to the network

### Starting the P2P Node

1. Select Consumer or Provider mode
2. Click "Start P2P Node"
3. Wait for the node to initialize
4. Your Peer ID will be displayed when connected

### Self-Test

Run the self-test to verify your setup:
1. Click "Run Self-Test"
2. Check that Flask Server shows green (success)
3. Check that P2P Node shows green (success)
4. OpenClaw Server is optional (yellow warning if disabled)

### Provider Settings - Pipeline Pricing

When in Provider mode, you can set individual prices for each pipeline type:

| Pipeline | Unit | Description | Default |
|----------|------|-------------|---------|
| **LLM** | per 1K tokens | Text generation inference | $0.0001 |
| **Image** | per image | All image generation modes | $0.01 |
| **Audio** | per second | Text-to-speech generation | $0.001 |
| **Music** | per second | AI music generation | $0.05 |
| **Video** | per second | Video generation | $0.10 |
| **Vision** | per image | Image analysis | $0.005 |
| **Companions** | per message | Flagship agentic skill (includes LLM + optional audio/image) | $0.02 |

### Relay Settings

| Setting | Description |
|---------|-------------|
| Act as Relay | Help route traffic for other peers (requires public IP) |
| Relay Fee | Percentage earned for relaying (1-10%) |

### Peer Connection Test

Test connectivity to a specific peer:
1. Enter their Peer ID (starts with 12D3KooW...)
2. Click the connect button
3. View connection result and supported pipelines

---

## OpenClaw Integration

### Overview

OpenClaw is an external personal AI assistant that can use BonzAI for inference.

### Two Modes

| Mode | Description | Cost |
|------|-------------|------|
| **Local** | OpenClaw uses your local BonzAI installation | Free |
| **Remote** | OpenClaw uses P2P providers | Paid (USDC) |

### Installing the BonzAI Skill

1. Open OpenClaw settings
2. Navigate to Skills/Plugins
3. Add the `SKILL.md` file from the `openclaw/` directory

### Enabling Local Mode

1. In BonzAI's Chat tab, click the lobster icon
2. This configures OpenClaw to use localhost:3002 for LLM inference

### OpenClaw Commands

When the BonzAI skill is installed in OpenClaw:

**Mode Commands:**
- `!mode local` - Switch to local mode (free)
- `!mode remote` - Switch to remote mode (paid)
- `!mode` - Show current mode

**Model Commands:**
- `!model <name>` - Load a specific LLM model
- `!model` - Show current model
- `!models` - List available models

**Generation Commands:**
- `!generate image <prompt>` - Generate an image
- `!generate music <prompt>` - Generate music
- `!generate video <prompt>` - Generate video
- `!generate audio <text>` - Text-to-speech

**Companion Commands:**
- `!companion list` - List available companions
- `!companion select <name>` - Select a companion
- `!scenario list` - List scenarios
- `!scenario select <name>` - Select a scenario

---

## Troubleshooting

### Server Not Starting

**Symptoms:** "Server not running" error, generation fails

**Solutions:**
1. Check the notification banner for server status
2. Click "Retry" if the server crashed
3. Restart the application
4. Check that port 65000 is not in use by another application

### Model Download Fails

**Symptoms:** "Download Required" notification, model shows as missing

**Solutions:**
1. Ensure stable internet connection
2. Check available disk space (models can be 4-20+ GB)
3. Try downloading again
4. Check Hugging Face login if required

### Out of Memory

**Symptoms:** Generation fails, application freezes

**Solutions:**
1. Close other memory-intensive applications
2. Choose a smaller model
3. Reduce resolution/quality settings
4. Restart the application to clear memory

### P2P Connection Issues

**Symptoms:** Cannot start P2P node, no peers found

**Solutions:**
1. Check your firewall settings
2. Ensure port 4002 is accessible
3. Try restarting the P2P node
4. Check NAT status in network settings

### Wallet Connection Issues

**Symptoms:** Wallet won't connect, stuck on "Connecting..."

**Solutions:**
1. Ensure MetaMask is unlocked
2. Check you're on Ethereum or Arbitrum network
3. Click the cancel button and retry
4. Refresh the application

### Generation Quality Issues

**Symptoms:** Poor quality outputs, artifacts, unexpected results

**Solutions:**
1. Try a more detailed prompt
2. Use Quality mode instead of Turbo
3. Increase resolution
4. Experiment with different models

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message / Generate |
| `Shift+Enter` | New line in input |
| `Escape` | Close modal |

---

## Getting Help

- **Documentation:** [docs.bonzai.sh](https://docs.bonzai.sh)
- **Discord:** [discord.gg/bonzai](https://discord.gg/bonzai)
- **GitHub Issues:** [github.com/anthropics/claude-code/issues](https://github.com/anthropics/claude-code/issues)
- **Website:** [bonzai.sh](https://bonzai.sh)

---

## Version Information

This manual covers BonzAI Desktop v1.1.0.

### Changelog

- Added ACE-Step music generation
- Added OpenClaw integration
- Added P2P network mode selectors
- Improved model migration when changing directories
- Updated UI styling for consistency
