# Engineering Documentation

This directory contains concise references for implemented BonzAI systems. Public user manuals are maintained at [docs.bonzai.sh](https://docs.bonzai.sh).

| Document | Scope |
| --- | --- |
| [Inference engine comparison](INFERENCE_ENGINE_BENCHMARK.md) | Reproducible local server timing, workloads and comparison limits |
| [Media Mint pipeline](MINTING.md) | Selected media, preview, license validation, metadata and confirmation handling |
| [Model transfers](MODEL_TRANSFERS.md) | Parallel downloads, recovery and explicit Hugging Face publishing |
| [Desktop releases](DESKTOP_RELEASES.md) | Native build validation, signing, release assets and size limits |
| [Inference memory lifecycle](INFERENCE_MEMORY.md) | Staged model loading, packed weight streaming, cache ownership, and validation limits |
| [MiniMax H3](MINIMAX_H3.md) | Hybrid INT8/W4 and GGUF loading, MPS execution, sampling and validation |
| [Video enhancement](VIDEO_ENHANCEMENT.md) | SeedVR2 setup, endpoint controls, downloads, output validation and legacy fallback |
| [Company finance](COMPANY_FINANCE.md) | Paperasse teams, Qonto/Stripe capabilities, local evidence and verification |
| [BonzAI Company](BONZAI_BACK_OFFICE.md) | Company rooms, work records, artifacts, connectors, and local persistence |
| [3D and game engine](BONZAI_3D_GAME_ENGINE.md) | Object and level generation, gameplay runtime, and ownership workflow |
| [Smart-agent chat channels](SMART_AGENT_CHAT.md) | Local media/workflow results, X public sessions, isolation and delivery recovery |
| [Locked liquidity](LOCKED_LIQUIDITY.md) | Shared agent/model/game custody, trading-fee accounting and deployment wiring |
| [Protocol configuration](PROTOCOL_CONFIGURATION.md) | Shared public addresses, GitHub build configuration, secrets and verification boundaries |
| [Protocol architecture](BONZAI_V4_ARCHITECTURE.md) | Implemented protocol and economic layers |
| [Smart-agent workers](SMART_AGENT_WORKERS.md) | Signed peer assignments, escrow verification, company backlog and delivery boundaries |
| [Smart-agent provisioning](SMART_AGENT_PROVISIONING.md) | Reserved agent slots, NVDA issuance, immutable liquidity, and deployment boundaries |
| [Companion-token access](COMPANION_TOKEN_ACCESS.md) | Skill access and default-companion cold start |
| [Attestation signer](ATTESTATION_SIGNER_SETUP.md) | Production signer setup and rotation |
| [Product demo pipeline](PRODUCT_DEMO_PIPELINE.md) | Deterministic capture and cinematic assembly |
| [Internationalization](I18N.md) | Translation catalogs and validation |
| [BonzAI v4 UI/UX release checklist](V4_UI_UX_RELEASE_CHECKLIST.md) | Audited release blockers, improvements, and acceptance criteria for the v4 interface |

Markdown under `openclaw/`, `hermes/`, and `src/skills/threejs/` is packaged or loaded as runtime prompt material. It is source code for inference behavior, not general repository documentation.

Do not add completed plans, speculative proposals, duplicate user manuals, meeting notes, or generated research reports here. Update the relevant canonical document when implemented behavior changes.

- [Company workspace activation and business rehearsals](WORKSPACE_ACCESS.md) — payment authority setup, offline licenses, isolated demo workflows and validation boundaries.

- [Application activity](APPLICATION_ACTIVITY.md): global operation reporting, sources, recovery and verification.

- [Performance benchmark](PERFORMANCE_BENCHMARK.md) — standardized scenarios, cross-machine comparisons, local inference measurement and explicit IPFS archival.

- [Roleplay relationships and scene quests](ROLEPLAY_JOURNEYS.md): local relationship tracks, quest progression, gifts, persistence and verification.
