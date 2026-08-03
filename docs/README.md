# Engineering Documentation

This directory contains concise references for implemented BonzAI systems. Public user manuals are maintained at [docs.bonzai.sh](https://docs.bonzai.sh).

| Document | Scope |
| --- | --- |
| [BonzAI Company](BONZAI_BACK_OFFICE.md) | Company rooms, work records, artifacts, connectors, and local persistence |
| [3D and game engine](BONZAI_3D_GAME_ENGINE.md) | Object and level generation, gameplay runtime, and ownership workflow |
| [Protocol architecture](BONZAI_V4_ARCHITECTURE.md) | Implemented protocol and economic layers |
| [Companion-token access](COMPANION_TOKEN_ACCESS.md) | Skill access and default-companion cold start |
| [Attestation signer](ATTESTATION_SIGNER_SETUP.md) | Production signer setup and rotation |
| [Product demo pipeline](PRODUCT_DEMO_PIPELINE.md) | Deterministic capture and cinematic assembly |
| [Internationalization](I18N.md) | Translation catalogs and validation |

Markdown under `openclaw/`, `hermes/`, and `src/skills/threejs/` is packaged or loaded as runtime prompt material. It is source code for inference behavior, not general repository documentation.

Do not add completed plans, speculative proposals, duplicate user manuals, meeting notes, or generated research reports here. Update the relevant canonical document when implemented behavior changes.
