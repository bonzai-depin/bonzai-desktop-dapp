# BonzAI v4 UI/UX release checklist

Status: baseline captured on 2026-09-24; implementation and regression evidence updated through 2026-09-27 for BonzAI v4.0.0 RC.

This is the operational record of the current UI/UX audit. It should be updated as findings are fixed and verified. The audit covered the running renderer in English, French, and Russian at 1280×720, 1024×768, and 800×600, using dark and light themes, plus a review of the related Vue and localization code.

Electron-only IPC behavior was not fully exercised in the browser renderer. Network-backed views were therefore assessed for loading, fallback, and recovery behavior rather than backend correctness.

## Current assessment

BonzAI has a strong local-first product story, clear privacy messaging, recognizable creation workspaces, and effective download blockers. It is not yet UI/UX release-ready because localization, accessibility, responsive layout, and unresolved states contain release-blocking defects.

## 2026-09-27 smart agents, membership and shared controls

The following replaces the corresponding earlier implementation notes. Earlier audit tables remain historical evidence, not descriptions of the updated screens.

| Area | Current behavior | Verification boundary |
| --- | --- | --- |
| Automate → Agents | Opens the existing Roleplay Companion generation form beside a card matching the existing identity, square portrait in the existing white polaroid frame (including the empty preview), bio, spending spider chart and personality layout. The empty chart shows axes; completed profiles use existing spending-profile data and generation logic. Creation, polaroid preview and social token occupy three equal-height columns across the full workspace, with horizontal scrolling on constrained screens. Agent placeholders use a person silhouette. The preview offers saving; the third column exposes the existing atomic token issuance and liquidity-pool flow, with token identity, pairing and permanently locked liquidity disclosed before signing. Compact mode tabs replace the initially collapsed rail. Default agents and the create/import/export toolbar are absent; a compact picker reopens saved custom agents. Skills come from the actual agentic workflow catalog. | Browser regressions cover empty/generated spider charts and theme redraw, generation failure/retry, cancellation, profile/portrait requests, saved workflows, reload, same-name identity preservation and issuance prerequisites at 1280/800/600px in dark/light themes. Storage regressions cover the missing `replaceRoster` IPC handler, durable legacy saves and later SQLite reconciliation. Native inference and live issuance remain acceptance work. |
| Automate → Company | Builds teams from the same saved companion roster. Assigned workflows open their existing runners and keep their access/model requirements. Paid jobs are reviewed and escrowed in the selected agent's social token. Owner-approved accept, deliver and withdraw actions use a signer restricted to the exact escrow call. | Canonical roster and Company tests verify real workflow assignments without connector grants. Create/approval tests exercise endpoint selection, artifacts, busy-device locks, private asset approval and single-use authorization. Full native inference and a live paid job remain acceptance work. |
| Membership and rewards | Same six LVL thresholds. Additional committed BONZAI increases the member's share. Rewards list each actual currency separately; new reward commitments have a disclosed 90-day exit notice. Historical pool claims remain accessible. | Contract and client regressions cover exact token units, stake-time accounting, wallet changes, settlement/refunds and contributor claims. See [Protocol architecture](BONZAI_V4_ARCHITECTURE.md#staking-and-currency-basket-rewards). |
| Downloads | Create, Agent, Company and skill requirements use `DownloadRequirement.vue`, with a prominent accent edge, tinted surface and download icon. Agent creation places it at full width above the form and card, and requires only profile and portrait models. Lowercase category labels with crate icons replace model names and filenames, including progress rows. Headings and percentages use the BonzAI brand font; panels retain sizes/progress/errors without model descriptions. Active downloads offer cancellation; queued agent/3D downloads stop, late agent pipeline starts are cancelled, and Create cancellation covers all tracked pipelines. Redundant per-row “downloading” status is omitted. Remote identifiers retain their original case. | Shared-component regressions cover missing, disabled, active, error and long-name states, including text contrast, at 1280, 800 and 360px. An actual-app comparison verifies full-width placement and matching CREATE/Agents internal typography, spacing and controls in dark/light themes at 1280/800px. |
| Default model | A fresh profile selects Qwen3.5 9B q4. Saved choices remain intact; selected does not mean downloaded or loaded. | Preference and model-store tests verify no automatic download or runtime load. |
| Connection | One Connect modal offers external wallet and email sign-in. Nested dialogs restore focus; cancellation cannot complete an abandoned sign-in. | Email signing currently supports Ethereum only, disclosed in the modal. Robinhood signing requires an external wallet. Native wallet-window acceptance remains separate. |

Run `npm run test:ui`, `npm run test:connectors`, `npm run test:web3`, `npm run test:startup` and `npm run test:i18n`. With the renderer running, set `BONZAI_UI_URL` when running `npm run test:ui` to enable browser regressions. Contract verification remains `npm test`.

Sidebar: the wordmark toggle persists compact/expanded mode; viewport defaults apply until a choice is saved. Mesh status and network settings share a sensor-icon button labeled Private/Consumer/Provider Mode. Saved mode changes update the store immediately; older pending polls cannot revert the mode. The modeless panel shows concise metrics and activity, with “on local network” wording. Numeric metrics use the BonzAI brand face, and the sidebar wordmark includes the bundled logo. The sidebar displays the existing lifetime token ledger as “Tokens saved”, with compact count formatting and the exact count in its tooltip. No currency conversion, comparison rate or monetary estimate is shown. Unavailable native usage displays a dash.

Roleplay companion selection uses a horizontal portrait roster and a single featured polaroid card with its existing spider chart, skills and actions. Arrow buttons and Left/Right/Home/End keys browse the cast; the explicit choose action commits selection. The roster scrolls on narrow screens and the featured card stacks vertically.

Generation-history actions use opaque theme surfaces and paired foregrounds, including over image/video previews. Shared disabled buttons retain readable text rather than reducing whole-button opacity. A browser contrast matrix checks shared and media controls across all 13 themes in normal, hover, focus, disabled and disabled-hover states (minimum 4.5:1).

Companion/scenario card actions use theme-paired selected and danger colors instead of fixed purple/blue/red fills. Disabled controls use neutral surfaces, and hover-only actions also appear for keyboard focus and touch.

No deployment or wallet transaction was executed. Robinhood production preflight remains blocked on the required addresses and DEX configuration. Company, download, connection and basket labels have semantic translations in seven locales; complete localization of the existing companion creator, launch/job details and service errors still needs review. Browser and simulated contract checks do not establish packaged native inference, screen-reader coverage or live-chain readiness.

## 2026-09-26 implementation and verification

The RC remains blocked. The fixes below are implemented; unchecked items elsewhere in this document remain acceptance work, rather than implied completion. Economic launch blockers and documentation discrepancies are recorded in [Protocol architecture](BONZAI_V4_ARCHITECTURE.md#rc-economy-audit--2026-09-26).

| Area | Implemented correction | Evidence / remaining boundary |
| --- | --- | --- |
| Shared dialogs | Stack-aware focus isolation, Tab wrapping, Escape and restoration; applied to welcome, command palette, model picker, Company intake, Rewards, image preview, H3 terms and shell settings dialogs. | Browser keyboard regression covers welcome, command palette and transition into Network settings; remaining feature dialogs still require migration and screen-reader review. |
| Shell | Creation backgrounds use the content containing block; primary navigation has 44px rows and explicit accessible names; compact settings controls have 36px targets; model/network controls stay available. Action links became buttons and ordinary text can be selected. | Automated document/background bounds at 1280×768, 1024×768 and 800×600 in dark/light themes. |
| Welcome | Readable strong text, persistent footer, scrollable body and visible language choice. | Constrained-window visual review; keyboard focus starts inside the dialog and background becomes inert. |
| Navigation | Creation uses one 3D label; financial destinations are grouped under Protocol. Built-in palette commands have semantic translations and lead to existing views; Harness opens its own screen. | Local creation and provenance remain accessible without a wallet. |
| Company intake | No industry/template selected before user choice; six initial options with More templates; labeled inputs, button semantics and inline failure. | Advanced intake dialog migrated; conversational onboarding remains the default. |
| Audio | Explicit backend language values and localized display names keep selection, placeholder and synthesis language aligned. | Language selector is labeled and excluded from legacy text mutation. |
| Chat, Music and Memory | The original hardware-ranked Chat recommendation is superseded by the Qwen3.5 9B preference and shared download panel above. Collapsed empty history, optional desktop-bridge guards, Simple/Advanced music modes, Draft lyrics, searchable styles and Memory empty-state actions remain. Empty Memory does not allocate a WebGL renderer. | Browser regressions cover download requirements, empty-state actions, Music modes and filtered styles; 800px light-theme screenshots reviewed. |
| Image, video and 3D | Mode selection is exposed to assistive technology; descriptions name actual image/video models and input requirements. Video reports the active stage. 3D starts with intent and prompt, with environment settings under Advanced and confirmed Clear. | Runtime/memory estimates need device measurements; complete generation remains native acceptance. |
| Licenses | Search, modality/installation/license filters, deduplicated aliases, stable unknown states, readable badges and explicit metadata refresh. | Four behavioral tests pass; metadata does not establish version-specific usage rights. |
| Training | Capabilities are checked before import; unsupported modalities are disabled, all dataset rows validated, and Uncensor has loading/error/retry plus converter/quantizer prerequisites. Fake audio/video training returns 501 before creating jobs/artifacts. Publication distinguishes local file checks from independent validation and preserves confirmed token issuance when revenue routing needs retry. | Image raw-file import and real local training are not verified. |
| Harness | Installation guidance, detection/verify, configure/enable, health test, copyable endpoints/diagnostics, searchable collapsed command reference and bounded reads. | Custom installation-folder Locate and native Electron setup still need cross-platform acceptance. |
| Protocol UI | Unavailable staking forms are replaced by wallet/network/configuration prerequisites. Rewards use actual locked stake and persisted claim-confirmation state. Skill revenue reads the canonical ETH contract. Markets have keyboard tabs and bounded loading, and no fabricated price history. | Successful financial execution awaits configured and verified Robinhood deployments. |
| Localization | Semantic keys added for shell/Mesh and changed workflows. Shared catalog validation rejects executable expressions and untranslated long prose. Reviewed overrides correct the identified French terminology. | Legacy DOM localization remains in other views; extraction/catalog quality is not rendered coverage or a human review of every translation. |

Browser regression: start the renderer with `npx vite --config vite.renderer.config.ts --host 127.0.0.1 --port 5178`, then run `BONZAI_UI_URL=http://127.0.0.1:5178 node --test test/v4-ui.browser.test.mjs` with Chrome installed. The test is skipped during non-browser test runs unless that URL is supplied. Run `npm run build:vite`, `npm run test:i18n` and `node --test test/i18n-catalog.test.mjs test/v4-release.test.mjs` as well.

The browser renderer cannot verify packaged IPC, model downloads/inference, wallet signing or native dialogs. Keyboard tests do not replace a screen-reader acceptance pass. Full migration from the legacy localization bridge, all-theme contrast measurement, remaining feature-dialog migration, further creation refinements, model-specific license review and production integration remain open.

## 2026-09-25 live revalidation

The renderer was rechecked against the current working tree in the browser at 1280×800, 1024×768, and 800×600. The highest-risk baseline findings remain reproducible.

| Area | Current evidence | RC status |
| --- | --- | --- |
| First-run welcome | The content clearly explains local inference, the private mesh, optional wallet use, and text/image/audio/video/3D creation. The dialog has `role="dialog"` and `aria-modal="true"`, but initial focus remains on `body` and the application behind it is neither inert nor hidden from assistive technology. | Blocked on modal behavior |
| Responsive shell | Create views still add the sidebar width to a full-width decorative background: body width measured 1520px at 1280px, 1096px at 1024px, and 872px at 800px. The document clips the excess rather than resolving the layout. | Blocked |
| Compact navigation | At 800px and 1024px the visible labels collapse, while accessible names degrade to Material Symbols names such as `chat`, `image`, `headphones`, and `movie`. | Blocked |
| Audio | The selected option is Arabic while the disabled editor says to enter English text. The language selector itself has no accessible label. | Blocked |
| Company wizard | In the English interface, the first and implicitly selected workflow is still the French HVAC preset, with a French summary below a mostly English template list. The wizard container also lacks dialog semantics. | Blocked |
| Localization | French is substantially improved in the shell and Harness introduction, but English remains in Mesh status, token status, integration capability labels, and several ownership command descriptions. Chinese showed the same partial-English behavior. | Blocked |
| Automated i18n check | `npm run test:i18n` passes (`7 locales, 196 keys, 272 source files checked`) despite the visible runtime leakage above. The check does not yet validate rendered coverage or translation quality. | Insufficient gate |
| Chat empty state | Model recommendations still expose `Unknown` metadata, and the empty history rail is expanded before a conversation exists. | Needs correction |
| Agents | The default workspace exposes taxonomy filters and command controls while the content area says `Coming soon` and reports zero workflows. | Needs product decision |
| OpenClaw and Hermes | Local/privacy messaging is clear, but both not-installed integrations only expose disabled Enable/Sync actions. The long command reference dominates the page and provides no guided install, locate, test, or diagnostics path. | Needs guided setup |
| Interaction sizing | Primary sidebar rows measure about 24px high; language and theme arrows measure about 21px. These remain below the audit targets. | Blocked |
| Action semantics | `Connect wallet` and `Sign in` are still links to `#` even though they trigger application actions. | Blocked |

The live French Harness pass also confirmed why catalog completeness is not a useful release gate by itself: the page can be mostly translated while retaining conspicuous English product status and command descriptions.

## Release blockers

- [ ] Replace visible mixed-language and incorrect translations, beginning with a human review of French.
- [ ] Remove dependence on exact rendered-English phrase matching for localization.
- [ ] Fix dialog focus, keyboard navigation, accessible names, selection semantics, target sizes, and contrast.
- [ ] Remove horizontal document overflow at every supported window size.
- [ ] Ensure every primary route resolves to content, a purposeful empty state, or an actionable error with retry.
- [x] Fix the Company wizard's French HVAC preset being selected in the English interface.
- [x] Fix the Audio language control displaying Arabic while the editor requests English.

## What works well

- The first-run experience clearly introduces local inference, privacy, the optional wallet, and the network mesh.
- Model download requirements are generally prominent and shown in context.
- Creation views share a recognizable workspace structure.
- The initial Company empty state has a clear primary action and useful examples.
- OpenClaw and Hermes integration copy communicates local operation and privacy well.
- The application has shared tokens and themes rather than isolated component styling.

## Localization

- [ ] Replace the legacy DOM `MutationObserver` translation bridge with semantic translation keys.
- [ ] Review all visible French strings for meaning and product context. Known failures include translations equivalent to “Asset Floors” as building floors, “Channel Slug” as an animal, “Upload” as download, and “Unique Viewers” as feminine viewing devices.
- [ ] Translate Mesh status, privacy text, option lists, placeholders, errors, status messages, and accessible labels.
- [ ] Standardize product terminology, including Chat, Mesh, Model, Upload, History, Workflow, Company, and Asset.
- [ ] Reject expression-like translation keys and suspicious identical source/translation values in CI.
- [ ] Extend `npm run test:i18n` beyond catalog presence and syntax to cover translation quality signals and untranslated rendered text.

## Accessibility

- [ ] Give every modal dialog semantics, initial focus, a focus trap, Escape handling, inert background content, and focus restoration.
- [ ] Replace action links and clickable `div` elements with semantic buttons or complete keyboard behavior.
- [ ] Expose mode-chip selection using radio or `aria-pressed` semantics.
- [ ] Label all selects, sliders, search fields, icon buttons, and graph controls programmatically.
- [x] Complete tab semantics in Markets and listbox semantics in the command palette.
- [x] Preserve normal Tab navigation in the command palette.
- [ ] Raise compact control targets from roughly 20–28px to at least 36px; use 44px for primary touch-compatible actions.
- [ ] Correct contrast failures in light license badges, dark Mesh status text, and selected navigation labels.
- [x] Remove the global text-selection ban from normal content, errors, endpoints, and license details.
- [ ] Add automated accessibility checks and a keyboard/screen-reader acceptance matrix.

## Responsive layout

- [x] Constrain decorative view backgrounds to the application content grid instead of the viewport.
- [x] Add no-horizontal-overflow tests at 1280, 1024, and 800px widths.
- [x] Preserve model and network access when the sidebar collapses.
- [ ] Keep modal and workspace primary actions visible using sticky footers where needed.
- [x] Define and enforce the minimum supported Electron window size.
- [ ] Verify loading, empty, error, disabled, and long-content states at every supported width.

Observed body widths on creation routes during the audit, reconfirmed on 2026-09-25, were 1520px at a 1280px viewport, 1096px at 1024px, and 872px at 800px. The root document clips this overflow, which prevents a browser scrollbar but still places decorative content outside the application grid.

## Navigation and information architecture

- [ ] Reduce the number of primary sidebar destinations.
- [x] Reconcile “Game,” “3D,” and “3D assets” into one product term.
- [ ] Give Agent Workflows, Agents, and Runner titles that match their active subview.
- [ ] Consolidate the two Mesh presence/settings entry points.
- [ ] Consider grouping Text, Image, Audio, Video, and 3D beneath a stable Create section.
- [ ] Treat Ownership, Markets, and Rewards as an optional Protocol area activated with wallet use.

## Creation workflows

### Chat

- [ ] Provide one hardware-aware recommended model with download size, memory estimate, and a “Why this model?” explanation.
- [x] Eliminate “Unknown” metadata from recommendation cards.
- [x] Collapse the empty history rail until a conversation exists.

### Image

- [ ] Explain Turbo, Standard, Quality, and Edit in terms of time, memory, model, and expected output.

### Audio

- [x] Make the selected language, placeholder, and actual synthesis language agree.
- [x] Localize language choices and add an accessible label.
- [ ] Surface the selected backend, quality/speed tradeoff, sample rate, and a short preview flow.

### Music

- [x] Introduce Simple and Advanced modes.
- [x] Rename the first generation action to “Draft lyrics” and reserve “Generate track” for audio generation.
- [ ] Replace long chip walls with searchable genre, mood, instrument, vocal, and production controls.
- [ ] Programmatically associate every visible label with its select or slider.

### Video

- [ ] Explain Turbo, SOTA, and Quality using model, runtime, memory, audio support, duration, and expected quality.
- [ ] Present H3 adapters by user outcome rather than raw filenames alone.
- [ ] Show staged progress for download, model load, prompt/image encoding, diffusion steps, VAE decode, audio, and export.
- [ ] Show estimated runtime and memory before starting a long generation.

### 3D

- [x] Start with object/scene intent and prompt inputs, then reveal environment and performance settings after generation or under Advanced.
- [x] Disable or confirm Clear when destructive action is possible.

## Agents, Company, OpenClaw, and Hermes

- [x] Replace the default Company intake with a conversational business brief that proposes an operating room, tools, goals, and human approval boundaries.
- [x] Promote the active Company conversation to a channel-based workspace and move work, approvals, results, tools, teammates, and settings into secondary channels.
- [ ] Remove empty workflow taxonomies and command controls from permanent “Coming soon” states, or provide usable built-in workflows.
- [ ] Bound Agents and leaderboard loading with explicit empty, error, timeout, and retry states.
- [ ] Use neutral Company introduction copy rather than hospitality-specific language.
- [x] Do not preselect a Company industry or workflow before locale and user intent are known.
- [x] Limit the first Company template screen to four to six localized choices and place the remainder behind search or “More templates.”
- [x] Keep the Company wizard's Next action visible.
- [ ] Give OpenClaw and Hermes guided Install/Locate, Verify, Configure, Test, Enable, and Diagnostics steps.
- [x] Add copy actions for endpoints and commands.
- [ ] Make the command reference searchable and collapsible, and remove references to obsolete model/runtime names.

## Wallet, ownership, markets, and rewards

- [ ] Keep local provenance and asset workflows useful without a wallet.
- [ ] Hide unavailable financial forms until their wallet, chain, account, and contract prerequisites are satisfied.
- [ ] Replace zero-valued or placeholder protocol dashboards with explicit signed-out and unavailable states.
- [x] Add deterministic timeout, error, and retry handling to market loading.
- [ ] Explain each unavailable prerequisite and give one next action.

## Memory, training, uncensoring, and licenses

- [x] Hide zero-count Memory filters, graph controls, legends, and selected-node panes until memories exist.
- [x] Add Start Chat, Generate, and Import actions to the Memory empty state.
- [x] Prevent unsupported training modality/model combinations before users configure or import data.
- [x] Give Uncensoring a usable model selector or an explicit model-loading action.
- [x] Add search and modality/installed filters to Licenses.
- [x] Remove duplicate license rows and prevent transient “Fetching” values from becoming filter categories.
- [ ] Summarize commercial use, redistribution, derivative/training use, and attribution requirements.

## RC verification order

1. Localization architecture and French review.
2. Responsive overflow, compact navigation, targets, and contrast.
3. Shared modal and accessibility primitives.
4. Content/empty/error/retry states across every primary route.
5. Company preset and Audio language defects.
6. Navigation and terminology consolidation.
7. Simple/Advanced creation modes and model explanations.
8. Guided OpenClaw and Hermes setup.
9. Keyboard, screen-reader, and constrained-window acceptance testing in every supported theme.

## Acceptance criteria

- No horizontal document overflow at supported sizes.
- Every interactive control has a meaningful accessible name and keyboard path.
- Modal focus cannot escape into background content.
- All themes meet WCAG contrast requirements for text and interface components.
- No English leakage or known machine-translation failures in a non-English locale.
- Every loading state terminates in content, empty, or error/retry UI.
- Unavailable actions explain prerequisites and offer a next step.
- Generation workflows show useful progress throughout long-running work.

Roleplay setup now includes a scenario stage carousel with keyboard navigation and explicit selection, a larger high-resolution companion radar chart, and native rating/media buttons with selected state. Skills remain in agent management and are omitted from Roleplay cards and its companion form. The profile field is labeled “Your role.” Browser regressions cover stage selection, ratings, chart size and constrained-width layout.

Roleplay media prioritizes scene images and offers compact optional voice/video/vision downloads with category labels, sizes, scoped progress, cancellation and retry. Download completion enables the requested capability. Existing-companion sessions require language and scene-image models; the portrait model remains an agent-creation requirement. All 13 bundled scene images were regenerated; prompts are recorded in `src/assets/scenarios/generation.json`. Reload merges preserve explicitly regenerated artwork and custom scenarios.

Roleplay setup uses consistent section padding and a matching companion separator. The optional local user profile now covers identity, pronouns, role, relationship, backstory, personality, motivation, boundaries and appearance. Dialogue receives the profile separately from memory summaries, while image generation continues to use appearance only. Legacy descriptions are preserved; browser fallback persistence and desktop/constrained layouts are regression checked.
