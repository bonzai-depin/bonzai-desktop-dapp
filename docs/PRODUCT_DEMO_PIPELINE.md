# BonzAI Product Demo and PixVerse Film Pipeline

Status: Desktop pilot implemented  
Owner: BonzAI product and creative tooling  
Scope: Desktop, Web, BonzAI+, and documentation visuals  
Last reviewed: 2026-07-22

## Implemented CLI

The Desktop pilot validates JSON feature manifests, captures the production renderer through an isolated Electron harness, composites those exact product states with approved cinematic plates, records provenance, and exports an H.264 1920x1080 60 fps master.

PixVerse is never given application screenshots. It produces standalone brand plates: intros, outros, abstract bridges, and non-factual effects. The compositor places exact BonzAI UI between those plates.

Prerequisites: project dependencies installed, `ffmpeg` and `ffprobe` on `PATH`, and a current renderer bundle produced by `npm run build:vite`.

```bash
npm run demo -- validate --feature company-agentic-team
npm run demo -- capture --feature company-agentic-team
npm run demo -- compose --feature company-agentic-team --skip-capture \
  --reel /path/to/approved-bonzai-reel.mp4 \
  --output output/demos/company-agentic-team/<run-id>

npm run demo -- capture --feature companion-experience
npm run demo -- compose --feature companion-experience --skip-capture \
  --reel /path/to/approved-bonzai-reel.mp4 \
  --output output/demos/companion-experience/<run-id>
```

`--format product` is an alias for capture and `--format cinematic` is an alias for composition. Use `--output <run-directory>` to continue a specific capture.

Current scope is Desktop. Web and BonzAI+ capture adapters, deterministic interaction recording, OCR, artifact scoring, and final human approval remain follow-up work.

## Purpose

### Goal

Generate a faithful demo of any BonzAI feature from a versioned script, then place it inside a cinematic product film without asking a generative model to reproduce the interface.

The system has two outputs:

- **Product demo:** deterministic capture of the real application and real workflow.
- **Product film:** approved cinematic brand plates surrounding exact product captures.

AI-generated video must never fabricate product behavior and present it as a screen recording.

### Feature manifest

Create one JSON manifest per feature under `demos/features/`. The implemented pilots are `demos/features/company-agentic-team.json` and `demos/features/companion-experience.json`; this YAML illustrates the intended expanded schema:

```yaml
id: company-agentic-team
title: Company Agentic Team
surface: desktop
route: company
fixture: company-smb-demo
viewport: [1920, 1080]
locale: en
claims:
  - Local agents coordinate one recurring business workflow.
  - Sensitive actions remain inside the owner's approval policy.
steps:
  - action: click
    target: team.new
  - action: fill
    target: team.workflow
    value: Draft approved invoices and surface overdue payments.
  - action: click
    target: team.create
  - action: waitFor
    target: team.work-inbox
heroFrames:
  - team.workflow
  - team.approval
docs: https://docs.bonzai.sh/...
```

### Deterministic capture layer

- Run Desktop through Playwright's Electron driver, Web through a controlled browser context, and BonzAI+ through a loaded-extension browser context.
- Give each manifest a `surface` value of `desktop`, `web`, or `extension`; shared stories may compose captures from several surfaces.
- Add stable `data-demo-id` hooks to significant controls and states.
- Seed fixtures through a dedicated demo-data adapter, not production databases or live accounts.
- Mock external services at the IPC/network boundary with contract-accurate responses.
- Capture mouse movement, focus, dialogs, loading, success, and error states.
- Record at a stable 1920x1080 canvas and 60 fps where the capture system supports it.
- Export screenshots of every hero state for deterministic composition. Do not upload them to a video model.
- Redact secrets, addresses, account IDs, and personal data before any external upload.

### Story compiler

The compiler turns a feature manifest into:

- Capture instructions.
- A shot list and duration budget.
- Narration and concise on-screen claims.
- Exact product holds and interaction recordings.
- Approved cinematic plate ranges and transition durations.
- Music brief, sound-design cues, and final mix targets.
- A provenance file containing source commit, app version, claims, assets, and API task IDs.

Product claims come from a reviewed registry. The script must fail if a scene uses an unapproved claim or references a missing application state.

### PixVerse boundary

PixVerse may generate:

- Full-frame branded intros and outros.
- Japanese-art narrative bridges between meaningful product steps.
- Atmosphere, particles, light, and non-factual cinematic overlays.
- Background plates that contain no application controls or required typography.

PixVerse must not receive or regenerate application screens. It must not render controls, labels, scenarios, balances, forms, or documentation. Product transitions are captured from the real application or represented as a short cinematic bridge followed by the untouched destination state.

Approved PixVerse outputs are supplied to `compose` as a reel. Their source prompts, task IDs, seeds, and checksums remain part of the creative asset ledger; the product-film provenance stores the reel checksum and exact source ranges used.

### Typography and composition

- Never ask the video model to render product or final brand typography.
- Composite exact BonzAI fonts, logo, claims, and CTA during mastering.
- Keep text present before the visual it describes, not after it.
- Use a bottom-to-top alpha fade only when contrast is required; avoid opaque caption bars.
- The final logo frame uses the approved BonzAI artwork, optical centering, and a direct `bonzai.sh` CTA.
- Brand assets are versioned and hashed. The same illustration cannot repeat within one answer or film unless repetition is narratively intentional.

### Sound and mastering

- Generate or license music from a reviewed brief; store rights and provenance.
- Keep dialogue, interface sound, score, and effects on separate stems.
- Prefer original Japanese instrumentation and orchestration without imitating a named recording or artist.
- Deliver 1080p masters at 60 fps. Preserve native generated frames; do not apply blanket optical-flow interpolation.
- If a PixVerse plate is generated below 60 fps, use clean cadence duplication. Never interpolate application footage.
- Master loudness consistently and keep speech intelligible on mobile speakers.

### Demo CLI structure

```text
demos/
  features/*.yaml
  fixtures/*.json
  brand/manifest.json
  claims/approved.json
  music/*.yaml
scripts/demo/
  cli.mjs
  validate.mjs
  capture-electron.mjs
  capture-web.mjs
  capture-extension.mjs
  compile-story.mjs
  pixverse-client.mjs
  chain-shots.mjs
  qa-video.mjs
  master.mjs
output/demos/<feature>/<run-id>/
  capture/
  master/
  provenance.json
```

### Demo security

- Never upload live customer data, user media, wallet secrets, private companions, or company connector data.
- Never upload BonzAI product captures to generative video services.
- Use synthetic fixtures and obvious demo labels.
- Apply concurrency and credit budgets per run.
- Require confirmation before any run expected to exceed its configured credit ceiling.

### Automated visual QA

- Verify resolution, duration, codec, frame rate, audio streams, and loudness.
- Compare every product hold against its captured source frame.
- Detect blank frames, frozen spans, duplicate scenes, black bars, logo displacement, and text overflow.
- Run OCR to ensure generated footage has not introduced fake interface text.
- Verify approved claims against the feature manifest.
- Produce contact sheets and low-resolution review proxies before final mastering.
- Require human approval for the final film.

## Official References

- [PixVerse API workflow](https://docs.platform.pixverse.ai/how-does-the-api-work-882967m0)
- [PixVerse C1 capabilities](https://docs.platform.pixverse.ai/c1-2067883m0)
- [PixVerse first/last-frame generation](https://docs.platform.pixverse.ai/how-to-use-transitionfirst-last-frame-feature-882973m0)
- [PixVerse generation status](https://docs.platform.pixverse.ai/how-to-get-video-generation-status-882972m0)
