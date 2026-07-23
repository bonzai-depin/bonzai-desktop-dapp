# BonzAI v0.9

## 🚀 Revolutionary Features

BonzAI v0.9 represents a paradigm shift in how AI is created, owned, and shared. This release transforms BonzAI from a local AI application into a **decentralized, privacy-preserving, peer-to-peer AI network** with true digital ownership through NFTs.

---

## 🎯 Core Innovations

### 1. **Universal Inference Storage System**
Every AI generation is now persistently stored and accessible:
- ✅ Text (LLM responses)
- ✅ Images (FLUX, SDXL, etc.)
- ✅ Videos (LTX, Wan2.2)
- ✅ Audio/Music (MusicGen)
- ✅ Robotic Datasets (LeRobot)
- ✅ Generated Games

**Implementation**: `src/store/inferenceStore.js`

All inferences are stored in Electron's persistent storage and can be accessed across sessions.

### 2. **NFT Minting for All Outputs**
Transform any AI generation into a tradeable NFT on Arbitrum:
- Automatic IPFS upload via Pinata
- Rich metadata with provenance tracking
- Smart contract integration for on-chain verification
- One-click minting from any inference result

**Implementation**: `src/services/nftMinter.js`

**Requirements**:
- MetaMask installed
- Connected to Arbitrum network
- Pinata API credentials (set in `.env`)

```bash
VITE_PINATA_JWT=your_jwt_token
VITE_NFT_CONTRACT=0x... # BonzAI NFT contract address
```

### 3. **Audio Generation with MusicGen**
Full-featured music generation pipeline:
- Text-to-music synthesis
- Multiple quality levels (7s, 15s, 30s)
- Real-time progress tracking via WebSocket
- Auto-download capability for missing models

**Endpoint**: `/audio/music` (Flask server)
**Component**: `src/components/GenerativeMusic.vue`

### 4. **Robotic Neural Network Training**
Revolutionary LeRobot integration for embodied AI:
- Support for multiple robot platforms (ALOHA, SO-100, Koch)
- Dataset recording and management
- Multiple architectures (ACT, Diffusion Policy, VQ-BeT, TD-MPC)
- Real-time training progress
- Model evaluation and deployment
- NFT minting for trained models

**Endpoints**: `/robot/*` (Flask server)
**Component**: `src/components/GenerativeRobot.vue`

### 5. **Cross-Modal Workflows**
Seamless transitions between modalities:
- **Text → Image**: Queue LLM output directly to image generation
- **Image → Video**: Send generated images to video pipeline

**Usage**:
```javascript
// From text generation
inferenceStore.queueTextToImage(generatedText);

// From image generation
inferenceStore.queueImageToVideo(imageBase64);
```

### 6. **Flagship Multi-Modal Skills**
Pre-packaged AI skills that combine LLM reasoning with image, video, and audio generation:

| Skill | Category | Description |
|-------|----------|-------------|
| **Story Studio** | Entertainment | Generates illustrated stories with narrated audio and animated scenes |
| **Meditation Forge** | Healthcare | Creates personalized guided meditations with ambient soundscapes and calming visuals |
| **Virtual Staging Pro** | Housing | Transforms empty rooms into beautifully staged interiors with multiple design styles |
| **Personal Lookbook** | Fashion | Creates complete outfit visualizations with styling recommendations |
| **Chef's Table** | Food | Generates recipes with step-by-step visuals and cooking technique videos |
| **Lesson Animator** | Education | Turns educational topics into animated explainer videos |
| **Music Video Forge** | Entertainment | Creates music videos with AI-generated visuals synced to audio |
| **Game Asset Foundry** | Entertainment | Generates game assets (characters, environments, items) with turnaround views |
| **Book Trailer Studio** | Reading | Creates cinematic book trailers with narration and atmospheric music |
| **Hairstyle Studio** | Personal Care | Visualizes hairstyles and colors on your photo before your salon visit |

**Architecture**: Each skill uses a two-phase execution pattern:
1. **Phase 1 (LLM)**: Load language model, generate creative content/analysis
2. **Phase 2 (Media)**: Unload LLM to free memory, generate images/video/audio

**Implementation**: `src/skills/flagship.js`

### 7. **Fixed Video Playback**
Videos now play correctly in the Electron app:
- Custom `app://` protocol for secure local file access
- Proper security checks preventing directory traversal
- Support for all video formats (MP4, MOV, AVI)

**Implementation**: Enhanced `main.js` with secure protocol handler

### 8. **Zero-Knowledge Privacy Layer**
End-to-end encryption for all inferences:
- ECDH key exchange for secure communication
- AES-256-GCM encryption
- Zero-knowledge proofs for authenticity verification
- No plaintext data leaves your machine unless you choose to share

**Implementation**: `src/services/zkPrivacy.js`

**Usage**:
```javascript
// Initialize
await zkPrivacy.init();

// Encrypt for peer
const encrypted = zkPrivacy.encryptForPeer(peerId, inferenceData);

// Generate ZK proof
const proof = zkPrivacy.generateProof(inferenceData);

// Verify proof
const isValid = zkPrivacy.verifyProof(proof, inferenceData);
```

### 9. **P2P Inference Network (Path-Style)**
Distributed AI inference with your friends:
- **Maximum 50 friends** (intimate network design inspired by Path)
- WebRTC-based peer-to-peer connections
- Vetted friend system with invite codes
- Capability discovery (who can run which models)
- Request routing to available peers
- Load balancing across friend network

**Implementation**: `src/services/p2pNetwork.js`

**Key Features**:
- **Decentralized**: No central server for inference
- **Private**: ZK encryption on all peer communications
- **Efficient**: Requests automatically routed to capable peers
- **Social**: Tight-knit network of trusted friends
- **Rewarding**: Earn $TAO tokens for serving inference requests

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     BonzAI v0.9 Frontend                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ GenerativeText│  │ GenerativeImage│  │GenerativeVideo│     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘     │
│         │                  │                   │              │
│         └──────────────────┴───────────────────┘             │
│                           │                                   │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  Flagship Skills (Multi-Modal Agentic Workflows)     │    │
│  │  Story Studio | Meditation Forge | Virtual Staging   │    │
│  │  Chef's Table | Lesson Animator | Hairstyle Studio   │    │
│  └────────────────────────┬────────────────────────────┘    │
│                           │                                   │
│               ┌───────────▼──────────┐                       │
│               │  Inference Store      │                       │
│               │  (Persistent Storage) │                       │
│               └───────────┬───────────┘                       │
│                           │                                   │
│         ┌─────────────────┴──────────────────┐               │
│         │                                     │               │
│  ┌──────▼──────┐                    ┌────────▼────────┐     │
│  │  NFT Minter │                    │   ZK Privacy    │     │
│  │  (Web3/IPFS)│                    │  (Encryption)   │     │
│  └─────────────┘                    └────────┬────────┘     │
│                                               │               │
│                                      ┌────────▼────────┐     │
│                                      │  P2P Network    │     │
│                                      │  (WebRTC/Peers) │     │
│                                      └─────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Flask Media Server (Python)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  FLUX    │  │   LTX    │  │   Wan    │  │ MusicGen │   │
│  │ (Images) │  │ (Video)  │  │ (Video)  │  │ (Audio)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐                                               │
│  │ LeRobot  │  (Robotic Training)                          │
│  └──────────┘                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ node-llama-cpp│  │ Protocol     │  │ File Manager │     │
│  │ (Local LLM)  │  │ (app://)     │  │ (Save/Load)  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Installation & Setup

### Prerequisites
```bash
# Node.js 18+ and npm
node --version  # v18.0.0+
npm --version   # 8.0.0+

# Python 3.10+ for Flask server
python3 --version  # 3.10+

# MetaMask browser extension for NFT minting
```

### Environment Variables
Create `.env` file in project root:

```bash
# Pinata (for IPFS uploads)
VITE_PINATA_JWT=your_pinata_jwt_token_here
VITE_PINATA_API_KEY=your_api_key_here
VITE_PINATA_SECRET_KEY=your_secret_key_here

# BonzAI NFT Contract (deploy your own or use official)
VITE_NFT_CONTRACT=0x...

# P2P Signaling Server (optional - defaults to bonzai.ai)
VITE_SIGNALING_SERVER=https://signal.bonzai.ai

# Flask Server Port (optional - defaults to 65000)
BONZAI_SERVER_PORT=65000
```

### Installation Steps

```bash
# 1. Clone repository
git clone https://github.com/yourusername/bonzai.git
cd bonzai

# 2. Install dependencies
npm install

# 3. Install Python dependencies for Flask server
pip install -r src/server/requirements.txt

# 4. Build and run
npm run dev
```

---

## 🎮 Usage Guide

### Basic Text Generation
1. Open BonzAI
2. Navigate to **Chat** tab
3. Download a model (e.g., DeepSeek R1 7B)
4. Click "Chat with [Model]"
5. Enter your prompt and press Enter

### Minting an NFT
1. Generate any content (text, image, video, music)
2. Click the **"Mint NFT"** button on the inference result
3. MetaMask will prompt for approval
4. Confirm transaction on Arbitrum
5. Receive your NFT token ID and Arbiscan link

### Cross-Modal Workflow: Text → Image → Video
```
1. Chat Tab → Generate descriptive text
2. Click "Generate Image" on text output
3. Image Tab → Image is auto-generated from text
4. Click "Animate" on generated image
5. Video Tab → Video is created from image
6. Download or mint as NFT
```

### Using Flagship Skills
```
1. Navigate to Smart Agent tab
2. Browse skills by category or search
3. Select a skill (e.g., "Story Studio")
4. Configure inputs using visual selectors
5. Click "Run Skill" to start execution
6. Watch as the skill:
   - Loads the LLM and generates creative content
   - Unloads LLM to free memory
   - Generates images, audio, and video
7. View rich results with image galleries, audio players
8. Mint any output as an NFT
```

**Note**: Skills automatically manage memory by loading/unloading models between phases.

### Training a Robot Model
1. Navigate to **Robot** tab
2. Select robot type (e.g., ALOHA)
3. Choose task (e.g., Pick and Place)
4. Record or load dataset
5. Configure training (architecture, epochs, etc.)
6. Click "Start Training"
7. Monitor real-time progress
8. Evaluate and deploy when complete
9. Mint trained model as NFT

### Using P2P Inference
1. Enable **"P2P Inference"** toggle
2. Click "Manage Friends" to add friends (max 50)
3. Share invite codes with trusted friends
4. When friends are online, your inference requests automatically route to available peers
5. Friends with the required capability respond first
6. All communication is ZK-encrypted

### Enabling Zero-Knowledge Privacy
1. Toggle **"Zero-Knowledge Privacy"** in any generation view
2. All inference requests/responses are now encrypted end-to-end
3. ZK proofs ensure authenticity without revealing content
4. Perfect for sensitive or proprietary AI work

---

## 🔐 Security & Privacy

### ZK Privacy Architecture
- **ECDH Key Exchange**: Secure key derivation between peers
- **AES-256-GCM**: Military-grade encryption
- **Zero-Knowledge Proofs**: Verify without revealing
- **No Plaintext Transmission**: Data never leaves unencrypted

### P2P Network Security
- **Invite-Only**: No random peer connections
- **Friend Limit**: Maximum 50 vetted friends (Path model)
- **WebRTC E2E**: Built-in WebRTC encryption
- **Capability Verification**: Peers can't lie about capabilities

### File Access Security
- **Sandboxed Protocol**: Custom `app://` protocol with security checks
- **Directory Traversal Prevention**: Cannot access system files
- **Scoped Access**: Only app data directory and CWD accessible

---

## 💎 NFT Smart Contract

### BonzAI NFT Contract Features
```solidity
// Simplified interface
interface IBonzAINFT {
    function mint(address to, string memory tokenURI) external returns (uint256);
    function tokenURI(uint256 tokenId) external view returns (string memory);
    function ownerOf(uint256 tokenId) external view returns (address);
}
```

### Metadata Schema
```json
{
  "name": "BonzAI Generated Image #abc123",
  "description": "Generated by BonzAI v0.9 using prompt: '...'",
  "image": "ipfs://...",
  "animation_url": "ipfs://...", // For video/audio
  "external_url": "https://bonzai.ai",
  "attributes": [
    { "trait_type": "Type", "value": "image" },
    { "trait_type": "Model", "value": "Z-Image Turbo" },
    { "trait_type": "Timestamp", "value": "2025-01-..." },
    { "trait_type": "BonzAI Version", "value": "0.9" }
  ],
  "properties": {
    "content_url": "ipfs://...",
    "content_hash": "Qm...",
    "prompt": "A serene mountain landscape...",
    "inference_id": "abc123..."
  }
}
```

---

## 🤝 P2P Network Economics

### Earning $TAO Tokens
When you serve inference requests for friends:
1. Friend sends encrypted inference request
2. Your local models process the request
3. You return encrypted result
4. Smart contract credits you $TAO tokens
5. Tokens accumulate in your wallet

### Token Distribution
- **Per Inference**: 0.1 - 10 $TAO (based on computational cost)
- **Text**: 0.1 $TAO
- **Image**: 1 $TAO
- **Video**: 5 $TAO
- **Audio**: 0.5 $TAO
- **Robotic Training**: 10 $TAO

---

## 🎨 UI/UX Highlights

### Beautiful Glassmorphism Design
- Backdrop blur effects
- Subtle gradients
- High-contrast text
- Material Symbols icons

### Real-Time Progress
- WebSocket-based progress updates
- Per-file download progress
- Training epoch tracking
- Generation step visualization

### Responsive Layout
- Adapts to all screen sizes
- Maximized on launch
- Overlay modals for selections
- Intuitive navigation

---

## 🚧 Roadmap

### v0.9.1 (Q1 2025)
- [ ] Voice-to-text input
- [ ] Multi-modal embeddings search
- [ ] Advanced friend discovery
- [ ] P2P load balancing optimizer

### v1.0 (Q2 2025)
- [ ] Mobile app (React Native)
- [ ] Browser extension
- [ ] Marketplace for trained models
- [ ] DAO governance

---

## 🐛 Known Issues & Troubleshooting

### Video Won't Play
**Solution**: Ensure videos are saved in the app directory or current working directory. Check console for path errors.

### NFT Minting Fails
**Solution**: 
1. Check MetaMask is connected to Arbitrum
2. Ensure you have ETH for gas fees
3. Verify Pinata credentials in `.env`

### P2P Peer Won't Connect
**Solution**:
1. Check firewall settings
2. Verify signaling server is reachable
3. Ensure both peers have accepted friend invite

### Python Server Won't Start
**Solution**:
1. Check port 65000 is not in use
2. Verify Python dependencies installed
3. Check models directory permissions

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🌟 Contributing

We welcome contributions! Please see CONTRIBUTING.md for guidelines.

Key areas for contribution:
- Additional model support
- UI/UX improvements
- Security audits
- Documentation
- Bug fixes

---

## 🙏 Acknowledgments

- **Hugging Face**: For incredible diffusion models
- **Anthropic**: For Claude and inspiration
- **Meta**: For LLaMA and LeRobot
- **Path**: For the intimate social network design philosophy
- **Arbitrum**: For scalable L2 infrastructure
- **IPFS/Pinata**: For decentralized storage

---

## 📞 Support

- **Discord**: https://discord.gg/bonzai
- **Twitter**: @BonzAI_AI
- **Email**: support@bonzai.ai
- **Docs**: https://docs.bonzai.ai

---

**Built with ❤️ by the BonzAI Team**

*"The future of AI is decentralized, private, and owned by creators."*
