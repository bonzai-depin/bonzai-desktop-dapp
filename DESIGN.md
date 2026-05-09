# BonzAI Design System

> Status: **v1.13** — App shell + chat workspace fully revamped.
> The 33 %-wide tab column with giant-icon Bulma menu retired — replaced
> by a compact 240 px `<nav class="bz-nav">` rail (collapses to 64 px
> at narrow viewports). The `Chat` tab now actually adopts
> `<ChatLayout>`'s three-column shell (rail · stream · input dock),
> with the new `<ChatHistoryRail>` component grouping past
> conversations by date and `<EmptyChat>` rendering Mistral-style
> prompt cards on first land. Pre-chat setup state is a single
> editorial card with hardware-footprint chips and one primary CTA
> instead of four giant Bulma buttons. Bottom bar moved off the
> Bulma purple flat to `--bz-panel` with a subtle brand-purple
> radial glow. Six themes still ship via `[data-theme]`.
> Reference implementations: `LlmModelPickerModal.vue`,
> `CommandPalette.vue`, `GenerationInspector.vue`, `BonzaiPulse.vue`,
> `BzCloseButton.vue`, `NetworkSettings.vue` (rail + theme picker),
> `src/components/chat/*`, `src/components/generative/*`,
> `src/services/theme.service.js`, `src/assets/themes.css`,
> all four Generative tab components.

This document captures the visual + interaction system for BonzAI. It is
the contract: every component should reach for the rules and tokens
here before introducing its own. When this file and the codebase
disagree, **this file is wrong** — bring them back into alignment in
the same change.

---

## 1 · Brand essence

BonzAI sits at the intersection of three product worlds:

| World | What it asks of the UI |
|---|---|
| **AI & LLM platforms** | Editorial calm, content-first, generation as cinema |
| **Design & Creative tools** | The work occupies the canvas; chrome gets out of the way |
| **Fintech & Crypto** | Precision, trust, monospaced data, no decoration where stakes are real |

Four words anchor the brand:

1. **Cultivation** — the bonsai metaphor; the tool grows with the user
2. **Privacy as architecture** — structurally private, not contractually
3. **Mastery / depth** — multi-modal, multi-chain, multi-protocol; not a toy
4. **Crypto-native ownership** — users participate; tokens, NFTs, P2P

The design vocabulary is **purple-monochrome**. Purple is the brand;
emerald is the spark; everything else recedes. The voice is editorial,
never busy. Motion is cinematic, never bouncy.

---

## 2 · Color · the 60 / 30 / 10 system

All color tokens live in `src/assets/tokens.css`. **Every color used in
a component must be a `--bz-*` variable.** Literals are forbidden in
component styles.

### 60 % — Canvas (dark, calm)

Five elevation levels. Pick by depth, never by glassmorphism.

| Token | Hex | Use |
|---|---|---|
| `--bz-canvas` | `#0a0a0f` | Page background |
| `--bz-panel` | `#11141d` | Persistent rails (sidebar, bottom bar) |
| `--bz-card` | `#161a26` | Content cards, modal shells |
| `--bz-raised` | `#1d2230` | Hover state, active row |
| `--bz-overlay` | `rgba(8,10,16,0.78)` | Modal backdrop |

### 30 % — Brand purple

| Token | Hex | Use |
|---|---|---|
| `--bz-purple-100` | `#c4a8e8` | Tints, focus rings on dark, chip backgrounds |
| `--bz-purple-300` | `#8b5cf6` | Highlight, hover-on-brand |
| `--bz-purple-500` | `#61378e` | Canonical brand primary |
| `--bz-purple-700` | `#3a1f5c` | Pressed states, gradient deep stop |
| `--bz-purple-900` | `#1c0d2c` | Brand-biased near-black |

The **brand gradient** (`--bz-gradient-brand`: 135°, `#61378e` →
`#8b5cf6`) is reserved for **identity moments**:

- Hero CTA on a screen
- Generation-in-progress affordance
- The "Loaded model" pill in the picker
- Wallet-connect call to action

It is **never** decorative chrome, never on a card, never on a
section header. Three identity moments per screen, max.

### 10 % — Energy accent (semantic only)

| Token | Hex | Use |
|---|---|---|
| `--bz-emerald-300` | `#34d399` | Success tint |
| `--bz-emerald-500` | `#10b981` | "Done / online / ready" |
| `--bz-emerald-700` | `#047857` | Pressed success |
| `--bz-emerald-soft` | `rgba(16,185,129,0.14)` | Backgrounds for success states |

**Hard rule:** if you're tempted to use emerald on something that
isn't strictly a "this is good" signal — reach for purple instead.
Emerald earns its appearance by meaning.

### Status (semantic only — never decorative)

| Token | Hex | Use |
|---|---|---|
| `--bz-danger` | `#e25555` | Errors, destructive actions, "won't fit" |
| `--bz-warning` | `#d4a017` | Tight fit, pending, attention |
| `--bz-info` | `#5aa9e8` | Neutral system info, offload state |

All three have `--bz-*-soft` companions for backgrounds.

### Text scale — four stops, no opacity hierarchy

| Token | Hex | Use |
|---|---|---|
| `--bz-fg` | `#f0f0f5` | Primary text, headings |
| `--bz-fg-mid` | `#c2c2cc` | Secondary, captions, body in dense lists |
| `--bz-fg-low` | `#74748a` | Tertiary, metadata, helper text |
| `--bz-fg-faint` | `#4a4a55` | Placeholder, disabled, divider hint |

**Replace every `rgba(255,255,255,0.7)` you find with `--bz-fg-mid`.**
Opacity-on-white reads as "dim"; the four-stop scale reads as
"intentional".

### Borders

| Token | Use |
|---|---|
| `--bz-border` (`rgba(255,255,255,0.07)`) | Default hairline |
| `--bz-border-strong` (`rgba(255,255,255,0.14)`) | Emphasis on dark cards |
| `--bz-border-brand` (`rgba(139,92,246,0.45)`) | Selection, focus, active |

---

## 3 · Typography

Bundled today: **Fira Sans 100 + 400**, **Fira Sans Condensed Black
Italic 900**, **Material Symbols Outlined**, plus the system mono
stack. The weight scale is intentionally narrow — 100, 400, 900 — and
the discipline is rationing the loud one.

### Type primitives

Use the `.bz-*` classes from `tokens.css` instead of inline
`font-size` / `font-weight`. They compose with color and spacing
tokens for everything else.

| Class | Family / weight / style / size | Use |
|---|---|---|
| `.bz-display` | Fira Sans 100 · regular · 40 / 1.15 · –0.02em | The single page hero — quiet by design, contrasts with the section drumbeat below |
| `.bz-h1` | **Fira Sans Condensed 900 italic** · 28 / 1.3 · –0.01em | Major section heading — **brand voice** |
| `.bz-h2` | **Fira Sans Condensed 900 italic** · 22 / 1.3 | Sub-section heading — **brand voice** |
| `.bz-h3` | Fira Sans 400 · 17 / 1.3 | Row title, card title (calm) |
| `.bz-eyebrow` | Fira Sans 400 · 11 · uppercase · +0.10em | Category label above a heading; column header in dense lists |
| `.bz-body` | Fira Sans 400 · 14 / 1.55 (default) | Paragraphs, body |
| `.bz-meta` | 12 · `--bz-fg-low` | Captions, helper text |
| `.bz-micro` | 11 · `--bz-fg-faint` | Footnotes, timestamps |
| `.bz-mono` | system mono · tabular nums | Hashes, addresses, peer IDs, filesizes, hex, BONZAI/ETH amounts |
| `.bz-shout` | **Fira Sans Condensed 900 italic** | Inline brand voice for emphatic copy that isn't a heading (CTA labels, tags, values) |

### The brand voice — Fira Sans Condensed Black Italic

This is BonzAI's cadence on titles. It is **not** a rationed accent;
it's the section drumbeat across every screen. Use it on:

- Every `<h1>` and `<h2>` — automatically, via `.bz-h1` / `.bz-h2`
- Inline emphatic copy via `.bz-shout` (CTA labels, tags, important values)
- The legacy `.fira-sans-condensed-black-italic` class — same render as `.bz-shout`, kept for the existing 50+ template uses

What stays *quiet* (deliberately):

- The page hero (`.bz-display`) — Fira Sans Light at 40 px contrasts with the section drumbeat below; this is what makes the brand voice land when it does appear
- `.bz-h3` and below — row / card titles, body, captions, mono data; if these were also condensed-italic-black, every list would shout

Three-tier cadence per screen:

1. **Quiet display hero** at the top (Fira Sans Light)
2. **Brand-voice section headings** between content blocks (Fira Sans Condensed Black Italic)
3. **Calm body / row / data** within each section (Fira Sans regular + system mono)

If you find a screen feeling *quieter* than the BonzAI brand should
read, the cause is usually missing `.bz-h1` / `.bz-h2` cadence, not
that you should reach for the brand voice on body text.

### Mono usage

If a value is **not a sentence**, render it in `.bz-mono`. Specifically:

- Wallet addresses, peer IDs, transaction hashes, content CIDs
- Model filenames (they're hashes), quantization labels (`q4_k_m`)
- Filesizes, byte counts, VRAM amounts (`9.5 GB`, `18.87 MB`)
- BONZAI / ETH / USDC quantities
- Counts ("12 / 47"), percentages where ratio matters

This is the single biggest readability win across the app and the
fastest way to read as "fintech-grade".

### Address truncation

Long hashes / addresses always truncate mid-string with hover-reveal:
`0x8Ff…fEa89` not `0x8Ff3b2e823b33BeE30e699bB1b6BBc8F622fEa89`. The
helper `shortFilename()` in `LlmModelPickerModal.vue` is the reference
implementation; promote to a shared util when the second consumer
appears.

---

## 4 · Spacing rhythm

All padding / gaps / margins are multiples of 4. Reach for a token,
never type a literal.

| Token | px | Use |
|---|---|---|
| `--bz-space-1` | 4 | Tight gap inside a row (icon ↔ text) |
| `--bz-space-2` | 8 | Inline gap between chips |
| `--bz-space-3` | 12 | Default gap between adjacent fields |
| `--bz-space-4` | 16 | Card padding, list-row padding |
| `--bz-space-5` | 24 | Section padding, modal body inset |
| `--bz-space-6` | 32 | Group gaps, between unrelated content |
| `--bz-space-7` | 48 | Modal outer padding, hero spacing |
| `--bz-space-8` | 64 | Empty-state breathing, hero blocks |

The rule of thumb: **dense, but not crowded.** Lean toward `--bz-space-4`
for default card padding, `--bz-space-5` for section padding,
`--bz-space-6` between unrelated groups.

### Density via space, not opacity

If a list feels too busy, the fix is **more space between rows** or
**fewer columns**, never **more transparent text**. Opacity hierarchy
is forbidden; the four-stop text scale handles all dimming.

---

## 5 · Iconography

We use Material Symbols Outlined, bundled locally in
`src/assets/fonts/`. Icons are **named affordances**, not decoration.

### The triage rules

- **Keep** icons that name a noun (model card, wallet, peer).
- **Keep** icons in primary actions (download, play, send).
- **Drop** icons next to section titles — the heading already says it.
- **Drop** decorative icons in dense rows.
- **Replace** status icons (`check_circle`, `error`) with **typographic + color** signals: a colored dot, an emerald row indicator, a status word in mono.

Audit baseline (May 2026): the codebase had **921** Material Symbols
instances. Target for v1.5: **under 400**. The picker redesign cut
~12 icons from the previous version of that same screen.

### Sizes

- Inline button icons: `font-size: 18px`
- Standalone iconbutton: `36px` square frame, `18px` glyph
- Decorative status dots use a `<span>` with background-color, not an icon

---

## 6 · Elevation

Three shadow steps + a brand glow. Cards **never** carry shadow at
rest; only on hover, focus, or active. This keeps the page calm.

| Token | Use |
|---|---|
| `--bz-elev-1` | Subtle pop on hover |
| `--bz-elev-2` | Floating panels, dropdowns |
| `--bz-elev-3` | Modals |
| `--bz-elev-brand` | Active brand moment (focus ring + purple halo) |

Glassmorphism (`backdrop-filter: blur`) is **deprecated** in v1 except
on the modal overlay itself. Cards on a card-on-canvas layout don't
need blur — `--bz-card` is already a distinct surface.

---

## 7 · Motion · one language

**One vocabulary across the whole app.** Six keyframes maximum, three
durations, three easings.

| Token | Value | Use |
|---|---|---|
| `--bz-dur-fast` | 140 ms | Hover, color, border-color |
| `--bz-dur-base` | 220 ms | Modal open, route change |
| `--bz-dur-slow` | 420 ms | Page-level transition, generative reveal |
| `--bz-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default for entries |
| `--bz-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exits |
| `--bz-ease-stand` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default for state changes |

### Approved keyframes (in `tokens.css`)

| Name | What it does |
|---|---|
| `bz-fade-in` | Pure opacity 0 → 1 |
| `bz-rise` | translateY(8px) + opacity (for items entering a list) |
| `bz-modal-in` | scale 0.96 → 1 + opacity |
| `bz-pulse` | opacity 0.55 ↔ 1 (for "loading"; never on always-visible elements) |
| `bz-gradient-sweep` | Brand purple gradient sweeping across a 1–2px strip |
| `bz-spin` | 0° → 360° rotation, the one rotation primitive — replaces the 19+ local `@keyframes rotate`/`spin` definitions across legacy components |

### The brand "generating" moment

When a download / generation is in flight, render a `.bz-generating`
strip — a 1–2 px gradient bar sweeping in brand purple. **No spinners.
No bouncing dots.** This signature animation is BonzAI's pulse and
appears wherever work is happening.

#### `<BonzaiPulse>` — the prebuilt component

For most cases reach for `<BonzaiPulse>` (in `src/components/`)
instead of hand-rolling the markup. Three variants:

| Variant | Use |
|---|---|
| `strip` (default) | 2 px sweep at the bottom of a card / button. The picker's download button uses this shape. |
| `bar` | Determinate progress bar with the brand sweep over the fill. **Use this in place of `<progress class="progress is-success">`** anywhere a generation has known percent. |
| `dot` | 6 px pulsing brand-purple dot. Inline replacement for `<button class="is-loading">` Bulma spinners. Used inside a row of meta text ("Generating · 12s"). |

```vue
<!-- Determinate generation progress — replaces Bulma progress + spinner -->
<div class="bz-genprogress">
  <div class="bz-genprogress__row">
    <span class="bz-shout">Crafting…</span>
    <span class="bz-mono">{{ pct }}%</span>
  </div>
  <BonzaiPulse variant="bar" :percent="pct" />
</div>

<!-- Inline pending state — replaces `is-loading` button -->
<BonzaiPulse variant="dot" label="Loading model" />
```

Reference implementation: `GenerativeImage.vue`'s `.bz-genprogress`
block — every other generative tab adopts the same shape (label,
percent, BonzaiPulse) when next touched.

### Per-component keyframe migration path

The codebase has ~50 local keyframes (`@keyframes rotate`, `spin`,
`fadeInUp`, `pulse`, `slideIn`, `slideUp`, `move`, `gl-scan`,
`gl-glow-pulse`, `pulseRed`, `pulseGreen`, `wallet-pulse`, `pip-blink`,
`status-blink`, …). Mass-removal is risky because each lives in a
component's `<style scoped>` alongside the rule that uses it. The
migration is **incremental**, one component per pass:

1. Look for `animation: rotate` / `animation: spin` / `animation: fadeInUp` / `animation: pulse` / `animation: pulse-glow` etc.
2. Replace the animation name with the canonical token-defined keyframe (`bz-spin`, `bz-fade-in`, `bz-rise`, `bz-pulse`, `bz-gradient-sweep`)
3. Delete the local `@keyframes` block once nothing in the file references it
4. Replace any `transform: scale(…)` on hover with opacity / border-color (the documented ban)

This work happens **opportunistically** — when a component is touched
for any other reason, do the motion sweep at the same time. Don't
schedule a dedicated full-codebase pass; the risk-to-reward is wrong.

### What's banned

- `transform: scale(...)` on hover (ages instantly; never use it)
- Multiple competing animations on one screen
- Spinners (use `.bz-generating` instead)
- Bounce / spring physics (saved for explicit "delight" moments — case-by-case approval)

---

## 8 · Layout primitives

### Canonical structures

1. **Hero + dense list** — modal (the picker) or full-screen page
   - Display title at the top
   - Hardware / context capsule top-right
   - Toolbar (search + filter chips)
   - Grouped, scrollable list below
2. **Sidebar + canvas** — persistent left rail (modes / sections), main canvas dominated by the work
3. **Section rail + scroll pane** — long settings or content surfaces (NetworkSettings is the reference). 200–240 px sticky rail listing every section heading, single scrollable detail pane on the right. IntersectionObserver keeps the rail's active item in sync with the user's scroll position; clicking a rail item smooth-scrolls the pane. Use this whenever a screen has > 5 distinct sections.
4. **Editorial card grid** — feature surfaces (companion gallery, skill marketplace)
5. **Right-rail inspector** — when an artifact is selected (image, video, generation), open a 320–360 px right rail with metadata, never a modal-on-click. Reference implementation: `GenerationInspector.vue` + `inspector.show()`. The rail leaves the bottom 64 px clear so BonzaiBottomBar stays visible, slides in over **220 ms** with the canonical `--bz-ease-out`. Generative components wire it by importing `inspector` and calling `show(generation)` on output click; the schema is intentionally forgiving — supply only the fields you have. |

### Global UI surfaces (Cmd-K and friends)

Modal-class UI that should be reachable from anywhere lives at
`App.vue` level and exposes a tiny service for show/hide. Today:

| Surface | Service | Trigger |
|---|---|---|
| LLM model picker | `services/modelPicker.service.js` — `modelPicker.show()` | Button in BonzaiBottomBar; palette command `modal.models` |
| Command palette | `services/commandPalette.service.js` — `commandPalette.show()` / `.toggle()` | Cmd-K (mac) / Ctrl-K (win/linux) globally |
| Generation inspector | `services/generationInspector.service.js` — `inspector.show(generation)` | Click on an output (image / video / audio thumb) in any Generative tab; Esc to close |

The **window-event bus** is how a global surface deep-links into a
component-owned modal without prop-drilling. Conventions:

| Event | Detail | Handler lives in |
|---|---|---|
| `bonzai:set-mode` | tab key string (`"chat"`, `"image"`, …) | App.vue |
| `bonzai:open-specs` | — | App.vue (hardware modal) |
| `bonzai:open-network` | — | BonzaiBottomBar |
| `bonzai:open-rewards` | — | BonzaiBottomBar |
| `bonzai:open-browse-models` | — | legacy fallback to chat-tab picker |

When adding a new global surface:
1. Drop the service file under `services/` matching the picker / palette shape (reactive `state` + `show` / `hide` / `toggle`)
2. Mount the component once in `App.vue`'s template
3. If it triggers component-owned modals elsewhere, dispatch a `bonzai:open-X` window event and add the listener in the owning component's `onMounted` / `onUnmounted` pair

### Z-index scale

Use the tokens — never type literals.

| Token | Value |
|---|---|
| `--bz-z-base` | 0 |
| `--bz-z-raised` | 10 |
| `--bz-z-overlay` | 100 |
| `--bz-z-modal` | 1000 |
| `--bz-z-toast` | 2000 |

---

## 9 · Component patterns

### Close buttons — `<BzCloseButton>`

There is **one** close button in the system. Every modal, panel, or
overlay that has a dismiss control uses `<BzCloseButton>` from
`src/components/BzCloseButton.vue`. Anything else is a bug.

```vue
<BzCloseButton aria-label="Close picker" @click="close" />
<!-- with size + variant -->
<BzCloseButton size="sm" variant="subtle" @click="..." />
```

| Prop | Values | Default |
|---|---|---|
| `size` | `sm` (28×28) · `md` (36×36) · `lg` (44×44) | `md` |
| `variant` | `ghost` (hairline border) · `subtle` (no border) | `ghost` |
| `aria-label` | required (string) | "Close" |
| `title` | tooltip override | `aria-label` |

The `is-danger` Bulma close-button pattern — and the assorted
`<button class="button is-danger"><span>close</span></button>`
variants littered across the app — are deprecated. Wherever you find
one, replace it. As of v1.6 it's been applied to: BonzaiBottomBar's
three modal headers, App.vue's specs modal, the LLM picker, the
generation inspector, MintModal, and RewardsModal.

### Generative components — `src/components/generative/`

The Image / Video / Audio tabs share a vocabulary of two
slot-friendly components. The Chat tab uses the chat-namespace
versions for its own input, but the action cluster is shared with
generative tabs so every "what to do with this output" row reads
the same.

| Component | Use |
|---|---|
| `<GenerativeInput>` | Diffusion-tab input. Optional eyebrow + display headline + subhead at top. Mode-chip row (`modes` array of `{ value, label, icon, badge?, title? }`). Auto-grow textarea (80–320 px). Optional negative prompt collapsible. Tools slot below. Brand-gradient submit button on the right with mac/pc shortcut hint. Optional `progressPercent` block during runs (`bz-shout` caption · mono pct · BonzaiPulse bar). |
| `<GenerativeActions>` | Single canonical action cluster. Replaces the 4–6 inline `is-medium is-success / is-warning / is-danger` Bulma buttons in every history item across Image, Video, Audio, and chat-message tools. Driven by an `actions` array of `{ id, icon, label, title?, disabled?, hidden?, variant? }` where `variant ∈ default \| primary \| success \| warning \| destructive`. Emits `action(id)` for the parent to dispatch. |

### History-grid pattern

The Image / Video / Audio tabs all render their generation history
in `<ol class="chat">` lists. The shared CSS rule (lives in each
component's scoped block, copy-paste because Vue scoping):

```css
ol.chat {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bz-space-5);
  list-style: none;
  padding: 0;
  margin: var(--bz-space-5) 0;
}
@media (min-width: 880px) {
  ol.chat { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  ol.chat .history-item:first-child { grid-column: 1 / -1; }  /* hero spans */
}
```

This produces: latest output as a full-width hero, history items
2-per-row on desktop. The action cluster on each card never breaks
across multiple lines because the column is wide enough — and when
the row is too narrow for inline buttons, `<GenerativeActions>`
falls back to a wrapped row of pills via `flex-wrap: wrap`.

### Chat components — `src/components/chat/`

The Chat tab's redesign vocabulary lives in its own namespace so it
doesn't leak into other Generative tabs. Each component is
slot-friendly and has minimal hard requirements.

| Component | Use |
|---|---|
| `<ChatLayout>` | Three-column shell — `rail` slot (left), `header` slot (sticky), default stream + `EmptyChat` fallback, `input` slot, `inspector` slot. Renders `<ChatMessage>`s from a `messages` array unless overridden via the `stream` slot. Auto-scrolls on new messages by default. |
| `<ChatMessage>` | One message. Props: `role` (user/assistant/tool/system), `content`, `thinking`, `model`, `ts`, `streaming`, `attachments`, `toolCalls`. Marker dot left, header eyebrow row (role · mono model · relative ts · hover-revealed actions: copy / inspect / regenerate), collapsible thinking section, slot for the parent's markdown renderer, footer with attachment chips and tool-call tags. Streaming caret pulses while `streaming` is true. |
| `<ChatInput>` | Multi-line auto-grow textarea. v-model bind to a string; emits `submit` on ⌘/Ctrl+Enter (Shift+Enter inserts a newline). Attachment chip stack above the field; toolbar below with attach button + `tools` slot + send button. Send button uses `--bz-gradient-brand` — the brand moment of every chat turn. Emits `attach` and `remove-attachment(index)`. |
| `<CodeBlock>` | Stripe / Linear-grade. Language eyebrow top-left, hover-revealed copy button top-right that flips to a check on success. Mono body, tabular numerics so diff line numbers align. Slot or `code` prop. |
| `<EmptyChat>` | Empty-state. Display headline + subhead, 2×2 grid of prompt cards (icon · title · subtitle, `value` returned via `pick` event), quiet "Choose a different model" link with current model name in mono. |

### Buttons

Three variants total. Adding a fourth requires a DESIGN.md update.

| Class | Use |
|---|---|
| `.bz-btn.bz-btn--primary` | The single most important action on a screen. Brand gradient, white text. |
| `.bz-btn.bz-btn--ghost` | Secondary action. Transparent, hairline border, transitions to raised on hover. |
| `.bz-btn` (default) | Neutral action. Same as ghost without `--ghost`'s background tint. |
| `.bz-iconbtn` | Icon-only, 36 px square. Always carry `aria-label` and `title`. |

`.bz-btn--running` adds a 2 px progress strip at the bottom — used during in-flight downloads / generations.

### Pills + chips

| Class | Use |
|---|---|
| `.bz-chip` | Filter chip, toggle. `.bz-chip--on` flips state. Include a leading `.bz-chip__dot` keyed to a status color. |
| `.bz-loaded-pill` | Brand identity moment — currently loaded model, currently active companion. Brand gradient + uppercase eyebrow type. |

Pills are the canonical tag shape. No square tags; no decorative
backgrounds; pills only.

### Status indicator (left-edge dot)

For dense list rows, lead with an 8 px circular status dot in the
leftmost column instead of an icon. Color carries the meaning:

| Class | Use |
|---|---|
| `.bz-row__status--current` | Brand purple — this row is the active one |
| `.bz-row__status--ready` | Emerald — downloaded / online / installed |
| `.bz-row__status--available` | Mid-gray — present but inactive |
| `.bz-row__status--unfit` | Danger red — explicitly not viable |

This pattern is denser, faster to scan, and quieter than the previous
"icon + badge + pill" combo it replaces.

### Modals

The picker is the reference. Required structure:

1. **Overlay** with `--bz-overlay` background and a single `bz-modal` Vue Transition
2. **Shell** at `--bz-card`, `--bz-r-lg`, `--bz-elev-3`, no glass
3. **Header** — display title left, contextual capsule right, close icon top-right
4. **Body** — scrollable, padded `--bz-space-5` / `--bz-space-7`
5. **Footer** — keyboard hints in mono (`Esc to close · ↩ to confirm`)

Esc always closes. Click-outside always closes. Enter activates the
primary action where one exists.

### Forms

- Inputs are 40 px tall, `--bz-canvas` background, `--bz-border` hairline, `--bz-r` radius
- Focus state: border becomes `--bz-border-brand` — not the standard browser outline
- Placeholder color: `--bz-fg-low`

---

## 10 · Accessibility

- All interactive elements **must** receive the global `:focus-visible` ring (defined in `tokens.css`)
- Color contrast: text on `--bz-canvas` must meet WCAG AA (4.5:1 for body, 3:1 for `.bz-h1+`)
- Don't communicate state with color alone — pair with shape (status dot + label, badge + word, gradient + uppercase eyebrow)
- Every modal has `role="dialog"` and `aria-modal="true"`
- Every icon-only button has `aria-label` and `title`
- Keyboard: Esc closes modals; Enter activates primary; Tab cycles in DOM order

---

## 11 · Crypto-native conventions

Because BonzAI is fintech-adjacent, the bar is higher than for a
typical creative tool. Three rules:

1. **All hashes/addresses/IDs use mono + truncation + copy-on-hover** (see §3 type usage)
2. **Monetary values use mono with tabular numerals** (`font-feature-settings: "tnum" 1`)
3. **Network identity is always visible** when transactions are about to happen — chain name in mono, contract address truncated, action explicitly named

Reference language for transaction confirmations:

> Mint on **Arbitrum** · contract `0x4135…0B93` · 7.5% royalty · 80% to creator

That single line replaces three paragraphs of marketing copy.

---

## 11.5 · Theming · changing the entire look in one go

The design system is **single-source-of-truth for color and texture**.
Every surface paints itself from `--bz-*` tokens declared in
`tokens.css`. A theme is therefore just a small file that overrides
those tokens under a `[data-theme="…"]` selector — same components,
same layouts, completely different feel.

### Files

| File | Purpose |
|---|---|
| `src/assets/tokens.css` | Default palette + structural tokens (always loaded) |
| `src/assets/themes.css` | Alternate palettes scoped under `[data-theme="X"]` |
| `src/services/theme.service.js` | Reactive picker — `init()` / `set(id)` / `list()` / `active()` |
| `src/components/NetworkSettings.vue` | "Appearance" section in the rail; renders the picker |

### Themes shipped

| ID | Vibe |
|---|---|
| `default` | BonzAI brand · dark canvas + brand purple + emerald spark |
| `midnight` | OLED-friendly · deeper canvas + cooler purples |
| `terminal` | Void-black, **emerald-only** · monospace headings, no purple |
| `mistral` | Purple minimalism on a light cream canvas |
| `warm` | Cream + terracotta · Claude × Mastercard warmth |
| `nocturne` | Pure-dark monochrome with a single greyscale accent |

### Adding a new theme

1. Append a `[data-theme="<id>"] { … }` block to `themes.css` overriding
   the color tokens you want to change. Leave structural tokens
   (spacing, type scale, motion durations) alone — they are not part of
   a theme.
2. Add an entry to the `THEMES` array in `theme.service.js` with a
   3-color `swatch` and a one-line `blurb`.
3. The picker UI in NetworkSettings re-renders automatically — no
   wiring required.

### What's themable, what isn't

| Themable | Not themable |
|---|---|
| Canvas / panel / card colors | Spacing rhythm |
| Brand purple ramp + gradient | Type scale (sizes + line-heights) |
| Foreground text scale | Radii |
| Borders + brand glow | Motion durations + easings |
| Status colors and their soft tints | Shadow elevations |
| Display + body font families *(theme override allowed)* | The 6 keyframes |

A theme that keeps the system intact is the one that just changes the
palette. If a theme needs to override structural tokens, that's a sign
the system is too rigid — fix `tokens.css`, not the theme.

---

## 12 · The phased rollout (what's next)

This document ships **Milestone 1**: tokens + typography + the picker
as proof point. The remaining milestones are noted here so the design
direction stays coherent across follow-up work.

| Milestone | Scope |
|---|---|
| **1 — Tokens** ✅ | `tokens.css`, picker redesigned, App.vue wiring |
| **2 — Type + icon diet** ✅ | Section-title shout class neutralized; ~225 literal-color replacements across NetworkSettings + BonzaiBottomBar + all 4 Generative components; modal headers in BottomBar adopt the eyebrow + display-title pattern |
| **3a — Layout: rail + palette** ✅ | NetworkSettings restructured as left-rail + scroll-pane (11 sections, IntersectionObserver-driven active state); Cmd-K / Ctrl-K command palette with fuzzy search across tab navigation + tools; global window-event bus (`bonzai:set-mode`, `bonzai:open-specs`, `bonzai:open-network`, `bonzai:open-rewards`) so any global UI surface can deep-link |
| **3b — Layout: inspector** ✅ | `GenerationInspector.vue` — global slide-in 360 px right rail, opens via `inspector.show(generation)` from any Generative tab. Carries the artifact metadata (prompt, model, seed, network origin, mint state) without modal-on-click. Wired in GenerativeImage as the proof; Text/Video/Audio adopt by adding the import + a single click handler. |
| **3c — Layout: canvas-first** | ⏳ **partial** — GenerativeImage gets the `:first-child` hero treatment via CSS only (latest image hits 880px / 70vh, history collapses to 480px column). No template restructure; the rule generalizes to Video / Audio when their thumbnail markup gets the same `ol.chat` shape. Chat redesign (`GenerativeText`) is more substantial and tracked under Milestone 5. |
| **5a — Chat redesign components** | ✅ — five new components in `src/components/chat/`: `<ChatLayout>` (3-column shell), `<ChatMessage>` (editorial card with thinking/attachments/tool-calls/streaming caret), `<ChatInput>` (multi-line auto-grow, ⌘/Ctrl+Enter to send, attachment chips), `<CodeBlock>` (Stripe/Linear-grade with language label + copy), `<EmptyChat>` (display hero + 4 prompt cards). Standalone — `GenerativeText.vue` adopts when ready. |
| **5b — Chat integration** | ✅ — `GenerativeText.vue` now renders messages through `<ChatMessage>` cards in both surfaces (landing summary + open-chat panel). Each inference becomes a user `<ChatMessage>` + an assistant `<ChatMessage>` pair. Existing think-segment rendering, mint/delete buttons, network-mode badges, tokens/sec indicator, multimodal vision flow, reasoning toggle, and streaming all preserved via the assistant body slot. Per-message inspector wired through `@inspect` → `generationInspector.show({ kind: "text", … })`. |
| **6 — Unified generative vocabulary** ✅ | `<GenerativeInput>` and `<GenerativeActions>` in `src/components/generative/`. **All four primary tabs migrated**: GenerativeText (chat input + action cluster), GenerativeImage (input + actions + origin pill + history grid), GenerativeVideo (input + actions + origin pill + history grid), GenerativeAudio (input + actions + history grid). Reasoning toggle slots into `<ChatInput>`'s tools area; multimodal vision attach handled via the attachment chip stack. ~250 LOC of legacy Bulma forms + buttons retired across the four tabs. |
| **7 — System-wide token sweep** ✅ | Two automated migration passes (text scale + scrim/state) across **30+ Vue components**. 815 literal-color replacements total — `rgba(255,255,255,0.X)` → text scale tokens, `rgba(0,0,0,0.X)` → new `--bz-scrim-*` tokens, Bulma state hexes (`#48c78e`, `#f14668`, `#ffe08a`, `#3e8ed0`) → `--bz-emerald-500` / `--bz-danger` / `--bz-warning` / `--bz-info`. Every interior surface now paints from the same palette. |
| **8 — Theme variants** ✅ | Six themes via `[data-theme]` overrides — *default · midnight · terminal · mistral · warm · nocturne*. `themeService` (`init` / `set` / `list` / `active`), persisted to `localStorage`, applied at app boot. Picker UI lives in `NetworkSettings → Appearance` (rail entry with id `net-appearance`). Themes only override color tokens — structural tokens (spacing, type scale, motion) stay shared. Documented in §11.5. |
| **9 — Close-button unification** ✅ | All known close-button patterns retired in favor of `<BzCloseButton>`. Replaced: Bulma `.delete` (5 sites in BrowseAgents, RoleplayChat, GenerativeText, LiveStreamerSkill), Company icon-only-btn (Dashboard, Connectors, IntakeWizard), MintModal/RewardsModal headers. Imports + `components: { BzCloseButton }` registration verified across all surfaces; renderer rebuild green. |
| **10 — Engaging input shells** ✅ | Both `<GenerativeInput>` and `<ChatInput>` now use a focus halo (1px brand border + 24px purple soft-glow), italic placeholder, purple `caret-color`, 16px font size, and a sweeping brand-gradient strip across the top during streaming via the `bz-gradient-sweep` keyframe. The composer feels like the brand moment of every turn. |
| **5c — Chat history rail + token meter** | ⏳ — `<ChatHistoryRail>` (sticky left column listing past conversations, grouped by date) and `<TokenMeter>` (BonzaiPulse bar above the input showing tokens-used / context-budget). Defer until conversation persistence is consolidated. |
| **4a — Motion vocabulary** ✅ | `bz-spin` keyframe added; `<BonzaiPulse>` component (strip/bar/dot variants); GenerativeImage's progress block (`.bz-genprogress`) is the reference. Migration path documented — per-component keyframe sweeps land opportunistically. |
| **4b — Motion sweep** | Walk the ~50 legacy keyframes (`rotate`/`spin`/`fadeInUp`/`pulse`/`slideIn`/`gl-scan` …) component-by-component, retire each in favour of the token-defined ones. Drop `transform: scale(…)` on hover anywhere it's used. Opportunistic, not a dedicated milestone. |
| **4 — Cinematic motion** | Unify on the 6-keyframe set, retire spinners and `gl-scan`, install `<BonzaiPulse>` brand moment |
| **5 — Inspector pattern** | Right-rail metadata inspector for selected generations (image, video, audio, companion) |

---

## 13 · Working with this document

- Adding a new token? Update `tokens.css` and add a row to the relevant table here in the same change.
- Bumping a global rule (e.g., changing the spacing rhythm)? Update DESIGN.md first; the implementation follows.
- New component pattern? Document it under §9 with the class name, the use, and a link to the reference component.
- Spotting a violation in existing code? Open a follow-up — don't paper over it in a hot path.

The system breaks if `tokens.css` and DESIGN.md drift. Keep them in
sync.

---

*v1.13 · 2026-05-08 · Reference implementations: `src/App.vue` (bz-nav shell), `src/components/GenerativeText.vue` (ChatLayout adoption), `src/components/chat/ChatLayout.vue`, `src/components/chat/ChatHistoryRail.vue`, `src/components/chat/EmptyChat.vue`, `src/components/LlmModelPickerModal.vue`, `src/components/CommandPalette.vue`, `src/components/GenerationInspector.vue`, `src/components/BonzaiPulse.vue`, `src/components/BzCloseButton.vue`, `src/components/AccessRequirements.vue`, `src/services/theme.service.js`, `src/assets/tokens.css`, `src/assets/themes.css`, `src/assets/buttons.css`, `src/assets/notices.css`, all four Generative tab components.*

### Honest list — what still needs hand-finishing

The bulk passes above are mechanical: they convert color literals
and close-button shapes. Fully respecting the design system on a
component still benefits from a hand pass. As of v1.12, these
surfaces have been *tokenized* but not yet *layout-audited* against
the editorial pattern (rail + canvas + inspector / hero + grid):

- `RoleplayChat.vue` — 9.3K LOC; needs its own dedicated turn
- `GenerativeTraining.vue` — vertical wizard with multi-step
  sections; canvas-first doesn't apply, layout audit recommended
- `Company*` components — section rail + IntersectionObserver
  treatment like NetworkSettings; CompanyDashboard / CompanyForm /
  CompanyLiveFeed have their own bespoke patterns
- 8 skill components (`BrowseAgents`, `SkillRunner`,
  `MeditationForgeSkill`, `DSLASkill`, `PolymarketSkill`,
  `TCGScannerSkill`, `LiveStreamerSkill`, `VideoCaptioningSkill`,
  `MassChatSkill`, `ChartForecasterSkill`)

Done in v1.12: AccessRequirements (full rewrite), MintModal interior
(banners + buttons), RewardsModal interior (banners + buttons),
Generative3D (canvas-first hero + 2-per-row grid).

---

## Changelog

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-05-08 | Initial design system, tokens, picker as proof point |
| v1.1 | 2026-05-08 | Milestone 2 — type & color migration across NetworkSettings, BonzaiBottomBar, four Generative components (~225 literal-color replacements). Legacy shout class was incorrectly neutralized in this pass. |
| **v1.2** | 2026-05-08 | **Brand voice corrected.** Fira Sans Condensed Black Italic restored as the canonical voice for `.bz-h1`/`.bz-h2`/`.bz-shout`/`.fira-sans-condensed-black-italic` — section titles use it as the BonzAI drumbeat across every screen, not a rationed accent. The display hero (`.bz-display`) and `.bz-h3` stay calm so the brand cadence has contrast to land against. |
| **v1.3** | 2026-05-08 | Milestone 3a — Cmd-K command palette (`CommandPalette.vue` + service); NetworkSettings restructured as left-rail + scrollable detail pane with IntersectionObserver-driven active state across 11 sections; window-event bus convention documented (`bonzai:set-mode`, `bonzai:open-*`); BonzaiBottomBar listens for `bonzai:open-network` / `bonzai:open-rewards`. |
| **v1.4** | 2026-05-08 | Milestone 3b — `GenerationInspector.vue` global slide-in right rail (360 px, transitions 220 ms ease-out); `services/generationInspector.service.js` exposes `inspector.show(generation)` with a forgiving schema (kind, mediaUrl, prompt, model, seed, network, mint, …); wired in GenerativeImage as the reference proof. Inspector pattern documented in §9 component patterns. |
| **v1.5** | 2026-05-08 | Milestone 4a — `bz-spin` keyframe added; `<BonzaiPulse>` component (strip/bar/dot variants) for "generating" moments; GenerativeImage progress block replaced (Bulma `is-loading` spinner + green progress → BonzaiPulse bar with brand purple sweep + mono percent + .bz-shout caption); per-component keyframe migration path documented — opportunistic, not dedicated. |
| **v1.6** | 2026-05-08 | `<BzCloseButton>` component — single canonical close button across the app; applied to BonzaiBottomBar (×3 modals), App.vue specs, LLM picker, generation inspector, MintModal, RewardsModal. Network rail link filtering — sections hidden by `v-if` are now hidden in the rail too (was silently broken). Legacy LLM picker panel retired (192 lines removed from GenerativeText.vue) — Browse Models button calls `modelPicker.show()`. GenerativeImage canvas-first CSS-only treatment — latest generation renders as 880px / 70vh hero, history items shrink to 480px column. |
| **v1.7** | 2026-05-08 | Milestone 5a — chat redesign component family in `src/components/chat/`: `<ChatLayout>` (3-column shell with rail/header/stream/input/inspector slots), `<ChatMessage>` (editorial card with thinking/attachments/tool-calls, hover-action cluster, streaming caret), `<ChatInput>` (multi-line auto-grow, ⌘/Ctrl-Enter to send, attachment chips, brand-gradient send button), `<CodeBlock>` (Stripe/Linear-grade with language eyebrow + copy), `<EmptyChat>` (display hero + 2×2 prompt cards). All five components are standalone; integration into `GenerativeText.vue` is Milestone 5b. Documented in §9 component patterns. |
| **v1.8** | 2026-05-08 | Milestone 5b — `GenerativeText.vue` integration. Both message-list surfaces (landing summary at line ~219 and open-chat panel at line ~455) replaced with `<ChatMessage>` iteration. Each inference renders as a user message + an assistant message; existing think-segment rendering, multimodal vision badges, network-mode pills, tokens/sec indicator, mint/copy/delete tool cluster all preserved via the assistant body slot. Per-message inspector wired through `onInspectInference()`. Surgical replacement: ~95 LOC of legacy `<ol class="chat">` removed per surface, ~110 LOC of new template added; no changes to the input form, AccessRequirements, or any existing handlers. |
| **v1.9** | 2026-05-08 | Milestone 6 — unified generative vocabulary. `<GenerativeInput>` and `<GenerativeActions>` in `src/components/generative/`. `<GenerativeActions>` replaces inline Bulma button clusters in **all four** generative tabs (Text · Image · Video · Audio) — one shared component, variant-based styling (`default` · `primary` · `success` · `warning` · `destructive`). `<GenerativeInput>` adopted in GenerativeImage's prompt; same import + 5 props for Video / Audio adoption. History grids in Image / Video / Audio use the 2-per-row + first-child-hero CSS rule; CTAs no longer break across lines. Origin pill harmonized between Image and Video. ~150 LOC of legacy buttons retired across the four tabs. |
| **v1.10** | 2026-05-08 | Chat + Audio + Video input migration. **GenerativeText** chat input migrated from Bulma `<input class="input is-large">` + reasoning toggle + multimodal label to `<ChatInput>` with reasoning toggle in the tools slot, multimodal vision attach via attachment chips, ⌘/Ctrl-Enter send. **GenerativeVideo** prompt migrated to `<GenerativeInput>` with mode-aware submit label. **GenerativeAudio** prompt migrated to `<GenerativeInput>` (music-mode bypass preserved). All four primary tabs now share one input vocabulary; ~250 LOC of legacy Bulma forms retired total. |
| **v1.11** | 2026-05-08 | System-wide migration sweep + theming. **Token sweep**: two automated passes (text scale + scrim/state) across 30+ Vue components — 815 literal-color replacements total (547 + 268). New scrim tokens `--bz-scrim-soft / -scrim / -scrim-strong / -scrim-deep` replace ad-hoc `rgba(0,0,0,0.X)` literals. Bulma state hexes routed to canonical status tokens. **Themes**: `themes.css` ships five alternates beside default (midnight, terminal, mistral, warm, nocturne); `theme.service.js` persists choice to localStorage and applies via `[data-theme]`; picker UI in NetworkSettings → Appearance. **Close-button unification**: all `.delete` and Company icon-only-btn close patterns migrated to `<BzCloseButton>` with imports + registrations verified. **Input polish**: focus halo, italic placeholder, purple caret-color, sweeping brand-gradient strip during streaming on both `<GenerativeInput>` and `<ChatInput>`. Renderer rebuild green. |
| **v1.12** | 2026-05-08 | Global primitives + interior migrations. **Two new global stylesheets** imported from `App.vue`: `buttons.css` (`.bz-btn` family with primary / ghost / success / warning / destructive / running variants + `.bz-iconbtn`) and `notices.css` (`.bz-notice` banners with info / success / warning / danger variants). Both are unscoped so every component reaches for the same primitives. **Surfaces migrated**: `AccessRequirements.vue` (full rewrite — calm card with brand-purple soft tint replaces Bulma `notification is-info`), `MintModal.vue` interior (3 banners + 4 buttons + status header migrated), `RewardsModal.vue` interior (5 banners + 5 buttons migrated), `Generative3D.vue` (canvas-first hero + 2-per-row history grid pattern from GenerativeImage applied). **Third token pass**: brand-soft literals (`rgba(97,55,142,X)`, `rgba(72,199,142,X)`, `rgba(241,70,104,X)`, `rgba(255,224,138,X)`, `rgba(62,142,208,X)`) routed to `--bz-purple-soft` / `--bz-emerald-soft` / `--bz-danger-soft` / `--bz-warning-soft` / `--bz-info-soft` — 123 replacements across 24 files. Cumulative: **938 literal-color replacements** since v1.7. Renderer rebuild green. |
| **v1.13** | 2026-05-08 | App shell rebuilt + Chat tab finally adopts ChatLayout. **App shell**: replaced the Bulma `column is-4` (33% wide) tab column + `tabs.menu` giant-icon stack with a compact `<nav class="bz-nav">` — fixed 240 px on desktop, 64 px icon-only at narrow viewports. Each row keeps its WebP brand image with a graduated shade overlay; active state shows a brand-purple gradient bar on the left edge + tinted shade. Memory-budget pill in the brand header. **Chat tab**: now uses `<ChatLayout>` with `<ChatHistoryRail>` (new — date-grouped past inferences with prompt previews) in the rail slot, `<EmptyChat>` (Mistral-style prompt cards) when no history, ChatMessage iteration in the stream slot, ChatInput docked at the bottom. The legacy `openChat` modal-style overlay is gone — the input is always visible once the model is ready. **Setup state**: pre-download view collapsed from a 175-line Bulma `level` + four giant 3D-shadowed buttons to a single editorial card with eyebrow + display title + 4 hardware-footprint chips + one primary CTA. **Bottom bar**: traded the loud `#61378e` flat for `--bz-panel` with a subtle brand-purple radial glow underneath; height to 80 px. |
