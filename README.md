# BonzAI Desktop

BonzAI is a local-first AI workspace for creating media, running agentic teams, building companions, and producing playable 3D experiences. Models and business memory run on the user's machine by default. Peer discovery can extend local capacity without turning private work into a centralized SaaS dataset.

The application combines an Electron and Vue desktop client, local language and multimodal inference, a private company operations layer, a libp2p inference mesh, and optional onchain ownership. AI generation is free to run locally; staking and collectibles apply to publishing, ownership, and protocol participation rather than access to inference.

> BonzAI is under active development. Review the configuration and deployment checks before using onchain features with real assets.

## What BonzAI Does

### Create locally

- Chat and code with downloadable GGUF language models.
- Generate and edit images with local diffusion pipelines.
- Create speech, voices, and music.
- Generate text-to-video and image-to-video clips.
- Build 3D objects from text or from a prompt plus reference image.
- Generate complete Three.js levels and refine them conversationally.
- Fine-tune supported models and retain the resulting artifacts.

Generation history persists locally and can move between modalities, such as text to image and image to video.

### Run an agentic company

BonzAI Company turns companions and workflow skills into a private operating team for small businesses. An owner can brief one team or the whole company through chat, inspect goals and task progress, review durable deliverables inline, and approve sensitive actions. Company memory, work records, and artifacts are stored locally in SQLite.

The connector layer covers common small-business systems, including accounting, payments, commerce, CRM, communications, and productivity tools. Sage remains a first-class accounting integration. Credentials are stored locally and connector actions are routed through explicit permission and approval policies.

### Build companions

Companions are persistent agentic personas with memory, multimodal conversations, voices, scenarios, wallets, and workflow skills. They can work directly with a user or join a BonzAI Company team. Their identity and work remain useful without blockchain access; optional ownership features can publish companion identities and tokens.

### Create games

The 3D workspace is organized around a concise Generate and Build workflow:

1. Generate a reusable object from text or a reference image.
2. Generate a complete level as a Three.js scene.
3. Assemble levels and place history objects directly on the canvas.
4. Describe gameplay, roles, interactions, and clear conditions in natural language.
5. Playtest the result or let a companion play it autonomously.
6. Publish a validated game as an optional collectible and issue a game token.

The runtime supports level transitions, players and actors, collision and trigger volumes, checkpoints, camera control, object interactions, agentic play, and collect, score, defeat, reach, survive, or custom objectives. See [the 3D and game engine notes](docs/BONZAI_3D_GAME_ENGINE.md).

### Share compute privately

The libp2p mesh discovers nearby or configured BonzAI peers and advertises model capabilities. Local mode keeps inference on the current machine. Provider mode can contribute available compute to the network. Peer presence is deliberately separated from access to private prompts, memory, and company data.

### Own and publish work

Web3 features are optional. The protocol layer supports:

- BONZAI staking-based publishing levels
- content, companion, model, 3D object, level, and game collectibles
- companion and model tokens
- game tokens and game registration
- skill access based on ownership of a skill owner's companion token
- mint pools, royalties, contribution accounting, and provider rewards

Robinhood Chain is the default economy network in the current configuration. Ethereum, Arbitrum, Base, LUKSO, and Robinhood testnet integrations remain available where their corresponding contracts and environment variables are configured. The canonical BONZAI asset must be bridged; deployment scripts must not create an independently mintable replacement token.

## Architecture

```text
Vue 3 renderer
  |- Create: text, image, audio, video, 3D, training
  |- Automate: companions, skills, company teams
  |- Earn: ownership, markets, rewards
  `- Pinia state and local generation history
          |
          | Electron context bridge / IPC
          v
Electron main process
  |- SQLite company memory and artifacts
  |- model downloads and llama.cpp processes
  |- libp2p peer discovery and inference routing
  |- secure local file and credential access
  `- Python inference server lifecycle
          |
          +--> OpenAI-compatible local LLM endpoints
          `--> Flask multimodal pipelines on port 65000

Optional protocol layer
  `- EVM contracts, wallets, decentralized storage, and markets
```

Important locations:

| Path | Responsibility |
| --- | --- |
| `src/App.vue` | Desktop shell and product navigation |
| `src/components/` | Vue product surfaces |
| `src/components/gen3d/` | Three.js generation, project compiler, and game runtime |
| `src/main.js` | Electron lifecycle, IPC, models, and networking |
| `src/main/db/` | SQLite schema, migrations, and repositories |
| `src/server/diffuser.py` | Local image, audio, video, and vision inference |
| `src/services/` | Company, inference, storage, wallet, and protocol services |
| `src/skills/flagship.js` | Built-in companions, scenarios, models, and skills |
| `src/contracts/` | Solidity protocol contracts |
| `test/` | Contract, runtime, connector, and service tests |

## Requirements

- Node.js 20 or later and npm
- Python 3.10 or later
- Git and a C/C++ build toolchain for native Node modules
- macOS, Windows, or Linux
- Sufficient disk and memory for the models you choose to download
- A supported GPU is strongly recommended for image, audio, and video generation

Model availability varies by operating system and hardware. BonzAI presents model requirements before download; contributors should not hard-code Apple-only or MLX-only execution paths.

## Development Setup

```bash
git clone https://github.com/bonzai-depin/bonzai-desktop-dapp.git
cd bonzai-desktop-dapp

npm install
python3 -m venv .venv
source .venv/bin/activate
pip install -r src/server/requirements.txt

cp .env.example .env
npm start
```

`npm start` builds the Electron main and preload bundles, starts the Vite renderer, and launches Electron. The Python server is spawned by the desktop process in development.

Most local creation features do not require wallet configuration. Populate only the environment variables needed for the integrations you are developing. Never commit private keys, access tokens, mnemonics, connector credentials, or production `.env` files.

## Verification

Run the checks relevant to your change before opening a pull request:

```bash
npm run build:vite          # Electron and renderer production bundles
npm test                    # Hardhat contract suite
npm run test:game-runtime   # 3D game runtime
npm run test:connectors     # Company connector contracts
npm run test:web3           # Protocol payment services
npm run test:demo           # Product demo pipeline
npm run test:i18n           # Translation catalog consistency
npm run web3:verify:offline # Static production configuration checks
gitleaks git .              # Full-history credential scan
```

The current `lint` script covers TypeScript files only. Do not describe the repository as fully lint-clean unless the command and its scope have both been verified.

## Packaging

```bash
npm run package   # Package the current macOS arm64 build
npm run make      # Produce a macOS DMG
npm run make:x64  # Produce a macOS x64 DMG
```

Cross-platform signed releases are built through the workflows in `.github/workflows`. Release jobs require the relevant signing, notarization, and GitHub secrets. Local packaging can omit bundled Python and llama.cpp runtimes when their platform binaries have not been built.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). It explains setup, change scope, privacy and protocol requirements, testing expectations, and the pull-request process. Every commit must follow [COMMIT_CONVENTIONS.md](COMMIT_CONVENTIONS.md).

Security-sensitive issues should not be disclosed in a public issue. Follow the private reporting process in [SECURITY.md](SECURITY.md).

## Documentation

- [Company architecture and product intent](docs/BONZAI_BACK_OFFICE.md)
- [3D and game engine](docs/BONZAI_3D_GAME_ENGINE.md)
- [Companion wallet security plan](docs/COMPANION_WALLET_SECURITY_PLAN.md)
- [Environment configuration](.env.example)

Product documentation is published at [docs.bonzai.sh](https://docs.bonzai.sh).

## License

BonzAI is licensed under the [Apache License 2.0](LICENSE). Contributions are accepted under the same license.
