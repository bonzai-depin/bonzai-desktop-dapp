# Contributing to BonzAI

BonzAI welcomes focused contributions that improve local AI, private automation, peer inference, creative tooling, or optional digital ownership. This document defines the engineering contract for contributions.

## Before You Start

1. Search existing issues and pull requests for overlapping work.
2. Open an issue before making a broad architectural change or changing an onchain contract.
3. Keep a pull request limited to one coherent outcome.
4. Never include credentials, private user data, generated model weights, or licensed training data.

For local setup and commands, follow the [README](README.md#development-setup).

## Product Principles

Contributions must preserve these constraints:

- **Local first:** core creation and company workflows must remain useful without a BonzAI-hosted backend.
- **Private by default:** peer discovery never implies permission to read prompts, memory, files, connector data, or company records.
- **Inference remains free:** staking and payments may govern publishing, ownership, or rewards, but not ordinary local generation.
- **Web3 remains optional:** wallet absence must not break local creation, company work, companions, or game building.
- **Cross-platform execution:** do not introduce an MLX-only or operating-system-specific path without a working fallback.
- **Explicit authority:** connectors and agents must request approval before destructive, financial, public, or externally visible actions.
- **Durable work:** company deliverables and their reasoning must remain inspectable after the chat session ends.
- **One visual language:** shared desktop, web, and extension surfaces should use the existing BonzAI tokens and interaction patterns.

## Development Workflow

Create a branch from the current default branch:

```bash
git switch master
git pull --ff-only
git switch -c feat/short-description
```

Use `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, or `chore/` as the branch prefix. Write commits according to [COMMIT_CONVENTIONS.md](COMMIT_CONVENTIONS.md).

Before committing:

1. Review the complete diff, including generated files.
2. Remove secrets, logs, temporary assets, and unrelated formatting churn.
3. Run the narrowest tests that prove the intended behavior.
4. Run broader checks when changing shared state, IPC, persistence, networking, or contracts.
5. Update documentation when behavior, configuration, or public APIs change.

Run `gitleaks git .` before publishing a branch that changes configuration, deployment scripts, authentication, wallets, or connector code. The repository allowlist contains only exact public protocol constants; do not broaden it to suppress an unexplained finding.

## Testing Expectations

Use the repository scripts rather than ad hoc substitutes:

| Change | Minimum verification |
| --- | --- |
| Vue or Electron UI | `npm run build:vite` plus manual interaction testing |
| Three.js or game runtime | `npm run test:game-runtime` and `npm run build:vite` |
| Company connectors | `npm run test:connectors` |
| Internationalized copy | `npm run test:i18n` |
| Smart contracts | `npm test` and relevant deployment checks |
| Web3 services | `npm run test:web3` and `npm run web3:verify:offline` |
| Demo pipeline | `npm run test:demo` |

Add tests for defects and business rules. A regression test should fail if the fixed behavior is removed.

Contract changes require tests for access control, reentrancy, value conservation, boundary conditions, and cross-contract wiring. Do not deploy from a contribution branch.

## Pull Requests

A pull request should include:

- the user or protocol problem being solved
- the implementation approach and notable tradeoffs
- the exact checks run and their results
- screenshots or recordings for visible UI changes
- migration and rollback notes for schema or contract changes
- security and privacy implications where relevant

Keep generated lockfile changes only when dependencies actually changed. Reviewers may ask for a change to be split when its behavior cannot be evaluated independently.

## Design Contributions

Match the existing product rather than adding a parallel design system. Reuse typography, spacing, colors, controls, icons, and motion tokens. Verify compact and expanded layouts, loading and empty states, keyboard access, text overflow, and both light and dark themes where supported.

Do not place explanatory marketing copy inside operational interfaces. Controls should communicate through familiar interaction patterns and concise labels.

## Reporting Security Issues

Do not open a public issue for vulnerabilities, exposed credentials, wallet risks, authorization bypasses, unsafe model loading, or privacy leaks. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contribution is licensed under the repository's [Apache License 2.0](LICENSE).
