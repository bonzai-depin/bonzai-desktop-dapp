# BonzAI UX Overhaul Plan

> Status: **Production Push** — Phase 1 complete. Phase 2 production UX pass complete across active surfaces; deep Roleplay decomposition remains the only intentionally deferred architectural split.
> Last updated: 2026-05-12

---

## Phase 1: Chat Experience (COMPLETE — Sprint 1–5)

### Sprint 1: Foundation & Critical Fixes

| # | Feature | What It Does | Files Changed | Status |
|---|---------|--------------|---------------|--------|
| 1.1 | Hardware-aware landing | Show ranked model recommendations based on detected RAM/VRAM. Inline download with progress. Cancel/Retry. | `GenerativeText.vue`, `LlmModelPickerModal.vue`, `main.js`, `preload.js` | 🟢 Done |
| 1.2 | Stop generation | AbortController in main process. Send button swaps to red Stop square during streaming. Partial message preserved with "[stopped]" badge. | `main.js`, `preload.js`, `GenerativeText.vue`, `ChatInput.vue` | 🟢 Done |
| 1.3 | Unified message toolbar | Single hover-revealed toolbar per message: Edit · Regenerate · Copy · Delete. Remove duplicate `GenerativeActions` from assistant body. | `ChatMessage.vue`, `GenerativeText.vue` | 🟢 Done |
| 1.4 | Fix duplicate scroll watches | Remove duplicate `messagesContainer` ref and watch blocks. Use single `getStreamEl()` helper. | `GenerativeText.vue` | 🟢 Done |
| 1.5 | Fix scoped DOM injection | Replace `document.querySelectorAll(".markdown-body pre")` with scoped query inside component. Move into custom markdown renderer. | `GenerativeText.vue` | 🟢 Done |
| 1.6 | Fix CodeBlock stub | Implement `extractSlotText()` to read default slot content for copy. | `CodeBlock.vue` | 🟢 Done |
| 1.7 | Confirm before clear chat | Replace immediate `resetChat()` with a `confirm()` or custom toast. | `GenerativeText.vue` | 🟢 Done |

### Sprint 2: Conversation Flow

| # | Feature | What It Does | Files Changed | Status |
|---|---------|--------------|---------------|--------|
| 2.1 | Typing skeleton | 3-dot pulsing placeholder inside assistant message while waiting for first token. | `ChatMessage.vue` | 🟢 Done |
| 2.2 | Streaming indicator | Brand-purple gradient sweep along left edge of streaming message. | `ChatMessage.vue`, `tokens.css` | ⚪ Removed by request — caret remains |
| 2.3 | Inline error handling | Red-left-border error notice on failed messages with "Retry" and "Switch to local mode" buttons. Partial message preserved. | `GenerativeText.vue`, `ChatMessage.vue` | 🟢 Done |
| 2.4 | Per-message edit | Click Edit on user message → prefill composer with that text → truncate history after that point → resubmit. | `GenerativeText.vue`, `ChatMessage.vue` | 🟢 Done |
| 2.5 | Per-message regenerate | Bind `@regenerate` event to retry the same prompt with a fresh response. | `GenerativeText.vue` | 🟢 Done |
| 2.6 | Per-message delete | Delete single Q&A pair with confirmation toast (non-blocking). | `GenerativeText.vue`, `ChatMessage.vue` | 🟢 Done |
| 2.7 | Suggestion chips | After every assistant response, render contextual chips: "Go deeper" / "Clarify" / "Make code". | `GenerativeText.vue`, `ChatMessage.vue` | 🟢 Done |

### Sprint 3: History Navigation

| # | Feature | What It Does | Files Changed | Status |
|---|---------|--------------|---------------|--------|
| 3.1 | Auto-titles | First 40 chars of first prompt become conversation title. Optional: lightweight LLM summarize. | `ChatHistoryRail.vue`, `GenerativeText.vue` | 🟢 Done |
| 3.2 | Rail search | Search bar in rail header. Fuzzy index over all conversation content. | `ChatHistoryRail.vue` | 🟢 Done |
| 3.3 | Branching | Edit any message → creates a fork. Forks shown as indented sub-threads in rail. | `ChatHistoryRail.vue`, `GenerativeText.vue` | 🟢 Done |
| 3.4 | Pinning | Pin conversations so they stick to the top of the rail and persist across reloads. | `ChatHistoryRail.vue`, `GenerativeText.vue` | 🟢 Done |
| 3.5 | Rail metadata | Show token count · duration · model name per item. | `ChatHistoryRail.vue`, `GenerativeText.vue` | 🟢 Done |
| 3.6 | Collapsible rail | Header toggle collapses chat history to an icon rail with count and accessible reopen affordance. | `ChatLayout.vue`, `GenerativeText.vue` | 🟢 Done |

### Sprint 4: SOTA Polish

| # | Feature | What It Does | Files Changed | Status |
|---|---------|--------------|---------------|--------|
| 4.1 | Syntax highlighting | Language detection, label top-left, copy button top-right. Custom markdown renderer. | `CodeBlock.vue`, `GenerativeText.vue` | 🟢 Done |
| 4.2 | Markdown tables | Zebra striping, brand borders, proper cell padding. | `ChatMessage.vue` | 🟢 Done |
| 4.3 | Parameter panel | Collapsible gear icon above composer. Temperature · Max Tokens · System Prompt · Seed. | `GenerativeText.vue`, `preload.js`, `main.js` | 🟢 Done |
| 4.4 | Keyboard shortcuts | Cmd+N (new), Cmd+Shift+O (picker), Cmd+1-5 (recent), `/` commands. | `GenerativeText.vue`, `ChatInput.vue` | 🟢 Done |
| 4.5 | Accessibility | `aria-live="polite"`, `aria-busy`, `aria-label` on ChatInput, keyboard nav in picker. | `ChatLayout.vue`, `ChatMessage.vue`, `ChatInput.vue`, `GenerativeText.vue`, `LlmModelPickerModal.vue` | 🟢 Done |
| 4.6 | Voice dictation | Mic button in the composer uses Chromium/Web Speech when available and streams transcript into the prompt. | `ChatInput.vue` | 🟢 Done |

### Sprint 5: Cleanup

| # | Task | Files | Status |
|---|------|-------|--------|
| 5.1 | Remove dead pagination code | `GenerativeText.vue` | 🟢 Done |
| 5.2 | Remove scroll-to-top button CSS | `GenerativeText.vue` | 🟢 Done |
| 5.3 | Purge Bulma leakage in chat files | `GenerativeText.vue`, `ChatMessage.vue`, `ChatInput.vue` | 🟢 Done |
| 5.4 | Lint + build verification | All | 🟢 Done — `npm run build:vite`, `npm run lint` |

### Chat Success Criteria

- [x] Landing state suggests hardware-appropriate models with one-tap download
- [x] Stop button works; partial messages preserved with "[stopped]" badge
- [x] Unified hover toolbar: Edit/Regenerate/Copy/Delete per message
- [x] Errors inject inline with Retry/Switch buttons
- [x] Rail shows conversation titles + searchable
- [x] Chat history rail is collapsible
- [x] Chat history supports pinned conversations
- [x] Code blocks have syntax highlight + language label + copy
- [x] No duplicate copy buttons
- [x] No dead code (pagination, Intersection Observer, duplicate watches)
- [x] No Bulma `button is-*` or `notification is-*` in chat components
- [x] Keyboard shortcuts work for new chat, picker, history nav
- [x] Voice dictation can fill the chat composer when supported
- [x] `aria-live` and `aria-busy` for streaming

---

## Phase 2: Unified Workspace Shell (ACTIVE — Production Triage)

**Goal:** Every non-chat tab adopts the same structural vocabulary as Chat.

### Production-Day Order

1. **Image / Video / Audio** — migrate the highest-traffic generation tabs onto `GenerativeWorkspace`, `ModeChipBar`, shared empty states, and tokenized controls.
2. **3D** — keep the recently fixed engine stable, replace remaining Bulma shell/progress UI, and verify canvas rendering after every change.
3. **Training / Smart Agent** — standardize dense operational screens with data tables, token inputs, and shared loading states.
4. **Roleplay / BrowseAgents** — schedule as the largest Phase 2/3 split: shared chat infrastructure first, modal and card cleanup second.
5. **Global shell** — remove duplicated modal ownership and legacy Bulma buttons in the live `App.vue` shell only after the tab migrations are stable.
6. **Company** — elevate the autonomous-organization screen into a zero-human operating console: CEO command, org-chart orchestration, work pipeline, governance, proof, and money controls.

### Adoption Map

| Component | Purpose | Adopted By Chat? | Adopt By |
|-----------|---------|------------------|----------|
| `ChatLayout` | 3-column shell (rail · header · stream · input) | Yes | — |
| `GenerativeWorkspace` | Unified generative shell | No | Image, Video, Audio, 3D, Training |
| `ModeChipBar` | Mode toggle chips | Partial | Image, Video, Audio, SmartAgent, NetworkSettings |
| `GenerativeInput` | Prompt input with mode chips | Partial | Audio, 3D, Training, SmartAgent |
| `GenerativeActions` | Action cluster (copy/save/mint/delete) | Partial | Image, Video, Audio, 3D, Training, RoleplayChat |
| `BonzaiEmptyState` | Empty state hero + cards | No | All tabs |
| `BonzaiPulse` | Loading/progress indicator | Partial | Video, Audio, 3D, Training, SmartAgent |

### Per-Tab Migration Plan

#### Image Tab
- **Status**: 🟢 Shell pass done — shared workspace, mode chips, inline notices, edit reference picker, masonry image grid, tokenized history actions
- **Shell**: `GenerativeWorkspace` replaces Bulma `level` + `columns`
- **Modes**: `ModeChipBar` (Turbo · Standard · Quality · Edit)
- **Resolution**: `ModeChipBar` (SD · HD · FHD · 2K · 4K)
- **Progress**: `BonzaiPulse` bar replaces `progress is-success`
- **History**: Real image grid with no hero; each output keeps its natural aspect ratio
- **Actions**: `GenerativeActions` on each history item

#### Video Tab
- **Status**: 🟢 Production pass done — generation/download progress use `BonzaiPulse`, required-download/error notices use tokenized cards, history uses the same balanced masonry strategy as Image, video prompts persist correctly, visible lazy-loaded tiles preload metadata, and each video opens the shared inspector
- **Shell**: `GenerativeWorkspace`
- **Modes**: `ModeChipBar` (T2V · I2V)
- **Params**: `ModeChipBar` rows for Duration/FPS/Resolution
- **Progress**: `BonzaiPulse` for active generation and downloads
- **History**: Balanced masonry with no hero; video tiles keep their expected ratio and visible tiles load metadata instead of rendering as grey placeholders
- **Cleanup**: Remove dead Wan2.2 code

#### Audio Tab
- **Status**: 🟢 Production pass done — mode/gender controls use `ModeChipBar`; generation/download progress and download/error notices use `BonzaiPulse`/token cards; history cards use waveform playback instead of the native browser audio UI
- **Shell**: `GenerativeWorkspace`
- **Modes**: `ModeChipBar` (TTS · Clone · Music)
- **Input**: `GenerativeInput` for TTS/Clone; custom parameter panel slot below for Music
- **Music UI**: Restyle Ableton pads with **brand-purple glow** instead of neon cyan/pink (hybrid: tokens + studio style)
- **Progress**: `BonzaiPulse`
- **History**: Tokenized grid cards with waveform visualization, single-playback behavior, progress playhead, and shared history actions

#### 3D Tab
- **Status**: 🟡 Progress/action pass done — custom game loader removed from the active template, downloads and generation use `BonzaiPulse`, and primary history/viewer actions use token buttons
- **Shell**: `GenerativeWorkspace`
- **Input**: `GenerativeInput` for prompt; `GenerativeInput` for refine
- **Environment controls**: Collapsible panel, not Bulma columns
- **Loader**: Replace custom "game-loader" with `BonzaiPulse` (per user request)
- **Progress**: `BonzaiPulse`

#### Training Tab
- **Status**: 🟡 Top surface pass done — Dataset/Run uses `ModeChipBar`; training progress uses `BonzaiPulse`
- **Shell**: `GenerativeWorkspace`
- **Modes**: `ModeChipBar` (Dataset · Run)
- **Input**: `GenerativeInput`
- **Progress**: `BonzaiPulse`
- **Tables**: Restyle to match dark theme

#### Smart Agent Tab
- **Status**: 🟢 Marketplace pass done — tab/category navigation uses `ModeChipBar`; download states use token notices and `BonzaiPulse`; the browse surface is now a searchable agent marketplace with operating stats, featured workflow, fit/access/output metadata, and tokenized action mechanics
- **Shell**: `GenerativeWorkspace`
- **Modes**: `ModeChipBar` (Browse · Agents · Run)
- **Category filter**: `ModeChipBar` chips
- **Skill cards**: Design system card layout, not Bulma `media` object
- **Actions**: `GenerativeActions`

#### Company Tab
- **Status**: 🟢 Operating-console pass done — default Command surface, shared `ModeChipBar` navigation, BonzAI buttons, token pills, dense operating KPI strip, pinned telemetry/live feed, and management controls
- **Command surface**: CEO → delegation → execution → governance → proof loop visible on first screen
- **Org orchestration**: staffed roles, queues, LLM assignment, and budget are summarized before opening the full org chart
- **Money outcome**: treasury balance, spend guardrails, connector gaps, and revenue/spend summaries visible in-context
- **Cleanup done**: production, audit, and treasury tables migrated to `BonzaiDataTable`; empty table states use `BonzaiEmptyState`
- **Future depth**: consider a deeper org-chart canvas once execution telemetry is richer

#### RoleplayChat (~12K lines)
- **Status**: 🟡 Production hardening pass done — dark-theme text/buttons/notices are token-overridden while the full split remains a larger follow-up
- **Split into 3**: `RoleplaySetup.vue`, `RoleplayChatThread.vue`, `RoleplaySettingsModal.vue`
- **Setup**: Tokenize entirely (remove all Bulma)
- **Chat thread**: Use `ChatLayout` + `ChatMessage` + `ChatInput` (share chat infrastructure)
- **Modals**: `bz-modal` shell instead of Bulma `modal-card`
- **Multi-modal**: Keep TTS/image/video generation but use shared components

#### BrowseAgents
- **Status**: 🟡 Visible first-screen pass done — companions grid and leaderboard now use tokenized cards, `BonzaiEmptyState`, and `BonzaiDataTable`
- **Grid**: CSS grid + tokens, not Bulma `columns is-multiline`
- **Cards**: Design system cards, not Bulma `media` object
- **Revenue display**: Next — migrate detail modal revenue cards away from `notification is-success`
- **Tables**: Leaderboard migrated; companion modal tables still need `BonzaiDataTable`

#### App.vue Shell
- **Status**: 🟡 Button cleanup pass done — App auth/Privy actions use `bz-btn` variants with token status text
- **Retired surface**: `BonzaiBottomBar.vue` is no longer part of the active shell and should not receive new UX work
- **Deduplicate modals**: Network/Auth/Privy/Rewards live only in `App.vue`
- **Buttons**: Top-level `button is-*` leakage removed from `App.vue`
- **Forms**: All `.input`/`.textarea`/`.select` → tokenized custom inputs
- **Colors**: Ban `has-text-white/grey-light/success/warning/danger` → token colors
- **Spacing**: Ban `mb-5`, `mt-5`, `p-5` → `var(--bz-space-*)`

---

## Phase 3: Global Motion & Polish (Deferred)

- Replace all local `@keyframes` with token-defined ones
- Remove `transform: scale(...)` on hover everywhere
- Standardize on `BonzaiPulse` for ALL loading states
- Create shared components for repeated patterns:
  - `DownloadRequired` — setup card when model missing
  - `DownloadProgress` — inline download with cancel
  - `HistoryHeader` — Import/Export/Clear actions
- Complete theme compliance audit

---

## Design References

| App | What We Borrow |
|-----|---------------|
| **Perplexity** | Conversational depth, inline citations, suggestion chips, search-first |
| **ElevenLabs** | Dark precision, content-first frames, calm hierarchy, gradient orbs |
| **Factory.ai** | Universal agent presence, "Droid" task delegation pattern |
| **Suno** | Inline parameter control, creation-as-composition UX |
| **Kling** | Generative media control, preview-in-context |

---

## Notes

- **Parameter panel**: Hidden behind gear icon (Advanced). Clean composer for casual users.
- **RoleplayChat**: Use bespoke UI but **reuse tokens** (not Bulma). Share chat infrastructure.
- **3D Loader**: Replace custom game-loader with `BonzaiPulse` (user request).
- **Audio Music UI**: Hybrid approach — studio pad grid concept survives, but colors restyled to brand-purple tones.
