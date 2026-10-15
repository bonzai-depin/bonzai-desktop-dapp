# Repository Guide

This file defines the working rules for contributors and coding agents in the BonzAI Desktop repository. Product behavior and source code take precedence over historical assumptions.

## Product principles

- BonzAI is local-first. Models, prompts, generation history, company memory, and credentials remain on the user's device by default.
- Local inference is free. Staking and protocol assets govern publishing, ownership, markets, and rewards, not access to inference.
- Company automation uses a one-time workspace license; existing records remain readable/exportable while locked, and demo rehearsals stay accessible. Personal local inference remains free.
- Wallet and onchain features are optional. Core creation and company workflows must remain useful without them.
- The configured economy chain is the source of truth. Do not hard-code a network where `src/config/web3.config.js` already provides it.
- Features must work across supported operating systems. Do not introduce an MLX-only requirement.
- Privacy boundaries are explicit: peer discovery never grants access to prompts, memories, company data, or local files.

## Architecture

```text
Vue 3 renderer
  -> Electron context bridge and IPC
  -> Electron main process, SQLite, model management, libp2p
  -> local OpenAI-compatible LLM and Flask multimodal services
  -> optional EVM contracts, wallets, decentralized storage, and markets
```

Key paths:

| Path | Responsibility |
| --- | --- |
| `src/App.vue` | Product shell and navigation |
| `src/components/` | Vue views and shared interface components |
| `src/components/gen3d/` | Three.js generation and game runtime |
| `src/main.js` | Electron lifecycle, IPC, models, and networking |
| `src/main/db/` | SQLite schema, migrations, and repositories |
| `src/server/diffuser.py` | Image, audio, video, and vision inference |
| `src/services/` | Company, inference, storage, wallet, and protocol services |
| `src/skills/flagship.js` | Built-in companions, models, scenarios, and skills |
| `src/contracts/` | Solidity protocol contracts |
| `test/` | Contract, runtime, connector, and service tests |

## Development

```bash
npm install
python scripts/install-python-deps.py
npm start
```

Run the checks relevant to a change:

```bash
npm run build:vite
npm test
npm run test:game-runtime
npm run test:connectors
npm run test:demo
npm run test:i18n
npm run web3:verify:offline
```

The `lint` script checks TypeScript and TSX only. Do not claim repository-wide lint coverage from that command.

## Implementation rules

1. Read exports, callers, shared utilities, and tests before changing behavior.
2. Keep changes scoped. Follow established Vue, service, IPC, and contract patterns.
3. Prefer deterministic code for routing, validation, retries, and transformations. Use models where judgment is required.
4. Preserve local-first operation and surface every network or connector action to the user.
5. Require explicit approval for destructive, financial, publishing, or external-system actions.
6. Store secrets through the existing secure local facilities. Never log or commit credentials, keys, mnemonics, or tokens.
7. Keep model filenames lowercase even when a download URL uses mixed case.
8. Treat Markdown in `openclaw/`, `hermes/`, and `src/skills/threejs/` as runtime assets. Changes there can alter packaged prompts and generation behavior.
9. Do not edit generated ABI or build artifacts by hand. Regenerate them from their source.
10. Add tests that encode the business reason for changed behavior, not only the current implementation.

## Interface rules

- Use the tokens and typography defined in `src/assets/tokens.css`, `src/assets/themes.css`, and `src/assets/fonts/fonts.css`.
- Keep Desktop, Web, and BonzAI+ visually cohesive where they share rendering and themes.
- Maintain readable contrast in dark and light themes. Muted text must still be legible.
- Prefer concise labels, direct workflows, and reusable product controls over explanatory panels.
- Verify changed views at desktop and constrained widths. Check loading, empty, error, disabled, and long-content states.

See [DESIGN.md](DESIGN.md) for the canonical visual rules.

## Documentation

Keep repository documentation current and operational. Do not add strategy decks, completed implementation plans, duplicate manuals, or speculative roadmaps to the root. Public product manuals belong at [docs.bonzai.sh](https://docs.bonzai.sh); concise engineering references belong in `docs/` and must be linked from [docs/README.md](docs/README.md).

Commits must follow [COMMIT_CONVENTIONS.md](COMMIT_CONVENTIONS.md), and contributions must follow [CONTRIBUTING.md](CONTRIBUTING.md).
