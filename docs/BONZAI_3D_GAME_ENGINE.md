# BonzAI 3D and Game Engine

## 3D speed and quality benchmark plan

Requested 16 October 2026. Execution began 17 October 2026. The protocol below defines
qualification; measured results and the scope actually exercised are recorded in the execution section.
Do not interpret the full matrix or the 30% target as completed acceptance.
The primary metric is elapsed time from submission to a correct, usable rendered result,
including planning, validation and repairs. Raw tokens per second is a diagnostic, not the
product outcome. Preserve local inference, cross-platform support and construction quality.

### Baseline to capture

Source inspection at `fb58e7d` found:

- The default 3D model is Qwen3.8 27B LOW MTP IQ4_XS; planner and code generator resolve
  the same model. Record the actual resolved filename and hash for every experiment.
- Native MTP uses `draft-mtp` with a configured maximum of two draft tokens and one
  parallel slot. Configuration alone does not prove successful speculation or useful acceptance.
- The loader requests GPU offload, Q8 KV caches, and at most 32K context; it avoids reloading
  an already-running matching model. Record actual runtime allocation and offload.
- Planning allows up to 3,200 output tokens. Initial code generation allows up to 16,384
  tokens, or 8,192 for the reference-image path. These are ceilings, not actual usage.
- Thinking is already disabled for these calls. References are already selected by subject;
  do not assume every Three.js reference is injected or recommend disabling thinking again.
- Runtime recovery can make three repair attempts; structural repair can generate a full
  replacement up to 8,192 tokens. Trace the actual nested attempt sequence and total cost.

Verify these facts against the benchmark revision before running. Relevant code lives in
`src/components/Generative3D.vue`, `src/components/gen3d/generationContract.js`,
`src/components/gen3d/assemblyContract.js`, `src/services/llamaServer.manager.js`,
`src/services/llamaServer.pool.js`, `src/main.js`, and `src/config/modelDefaults.js`.

### Phase 1 — Instrument the complete path

Give each generation one trace ID and each planning, code, review and repair call a child ID.
Measure monotonic durations for queueing, model loading, prompt processing, first token,
decoding, parsing, execution, material loading, first visible frame, construction checks,
visual review, each repair and saving. Distinguish the first preview from final validation.
Separate overlapping intervals so stage totals do not double-count concurrent work.

Record input/output tokens, cached prompt tokens where exposed, context occupancy,
decode tokens/sec, draft tokens proposed/accepted and acceptance ratio, repair counts,
error category, final status, peak process/GPU memory where available, swap delta and
renderer frame time. Mark unavailable counters as unavailable; do not infer acceptance
from the configured draft length. Record whether cancellation and saving work correctly.

Capture OS, CPU/GPU, RAM/VRAM, runtime build/commit, application revision, model hash,
quantization, actual server arguments, sampling parameters, seed and power mode.
Keep prompts, generated code and renders local by default. Export results explicitly.
Do not log secrets or upload user projects for benchmarking.

### Phase 2 — Establish representative fixtures

Freeze a suite of 24 briefs: 12 objects, six levels and six games. Include simple and complex
cases, prompt-only and reference-image inputs, French and English, plus held-out briefs
that are not used while tuning. Each fixture needs explicit dimensions or tolerances where
relevant, required components, material intent, expected behavior and a pass rubric.

Object cases must include the emergency lantern (separated glass/frame, visible emitter,
credible illumination), a chair with supported legs, a hinged container, a fountain,
transparent and reflective objects, and an unfamiliar multi-part object. Level cases cover
interiors, exteriors, correct scale, navigation clearance, repeated assets and lighting.
Game cases cover controls, collision, objectives, restart and completion conditions.
Also exercise a targeted edit, malformed output recovery and saving/reopening a result.

Check geometry visibility, finite transforms, bounds, declared assembly relationships,
shader/runtime errors and required behavior deterministically. Inspect fixed multi-angle
renders and short interaction captures for recognizability, construction, materials,
lighting, fidelity and animation. Reviewers should not see the experimental configuration.
Any automated visual judge is supplementary and must be calibrated against human review.
Nonempty geometry alone is not a successful asset; a running scene alone is not a playable game.

### Phase 3 — Run controlled experiments

Start with six representative fixtures and three paired seeds per configuration. Randomize
configuration order to reduce thermal bias. Then validate finalists on all 24 fixtures with
at least five seeds. Report medians, tail latency, dispersion, failures and confidence intervals;
small samples make p95 estimates provisional. Never omit failed or timed-out runs.

Use separate cold-load and warm-model cohorts. Keep resolution, renderer quality, sampling,
briefs and validation rules constant. Run initially without competing generation work, then
measure a realistic shared-workload cohort separately. Do not interrupt live user jobs.
Pause for thermal or memory pressure and record incomplete trials rather than counting them
as fast successes. Fixed seeds help pairing but do not guarantee identical cross-backend output.

| Experiment | Controlled comparison | Decision evidence |
| --- | --- | --- |
| Native MTP | Off versus draft maximum 2, 3 and 4 | Accepted tokens, verification overhead, total valid-result latency |
| Runtime build | Shipped build versus a compatible candidate | Same models and settings; correctness and all supported OSes |
| Prompt processing | Current references versus tighter task-specific references and stable-prefix caching | Prefill cost, cache hits, lost capabilities |
| Code representation | Current JavaScript versus compact helper calls/validated scene data | Token reduction, construction quality and expressive coverage |
| Repair strategy | Existing recovery versus component-local edits | Repair success, preserved geometry and total retry cost |
| Model choice | Current model versus eligible smaller coding models/quantizations | Valid results per minute, fidelity and memory pressure |
| Planning | Current separate plan versus compact/shared construction specification | Total tokens and first-pass assembly correctness |
| Context/memory | Current allocation versus measured right-sized contexts | No truncation, OOM, swap growth or quality loss |

Change one factor at a time before testing combinations. Confidence thresholds or other
speculation algorithms are later experiments only if supported by the shipped runtime.
Increasing draft length is not presumed beneficial. Keep a measured non-MTP fallback.
Do not reduce token ceilings until actual completion lengths are known: truncation can
increase repairs and make generation slower overall.

### Phase 4 — Pursue substantial improvements

Prioritize by measured share of total time, not by intuition. If decoding dominates, extend
reliable helpers for repeated construction and let the model specify dimensions, components,
materials and relationships compactly. Compile those descriptions deterministically while
retaining an escape hatch for bespoke geometry and gameplay. Helpers need parameter
validation, boundary tests and representative renders; template reuse must not erase variety.

If repairs dominate, classify the most frequent failures and improve construction contracts
or helpers at their source. Patch defective components while preserving stable identifiers,
transforms and unaffected geometry. Keep bounded retries and fail clearly when unresolved.
If prefill dominates, improve reference selection and prefix reuse without leaking state
between users/tasks. If loading dominates, verify reuse before changing model lifecycle.

Only consider smaller models or split planner/code models after measuring their quality and
load-switch cost. Keep first-pass, repair-assisted and final quality scores separate so a
configuration cannot conceal poor initial results behind expensive recovery.

### Phase 5 — Acceptance, rollout and reporting

Proposed performance target: at least 30% lower median time to a valid result, with 2x as a
stretch goal, not a forecast. Require no material tail-latency or memory regression and no
new critical construction, gameplay, persistence or cancellation failures. Predefine a small
quality non-inferiority margin before testing; if the sample is inconclusive, collect more
runs instead of declaring equivalence. Track useful results per compute hour and failure rate
alongside successful-run latency to prevent rewarding fast but unreliable configurations.

Validate on macOS/Metal, Windows/CUDA and Linux/CUDA, plus a CPU fallback smoke suite.
Report each hardware cohort separately; do not turn a Mac-specific winner into a universal
default. Run relevant runtime/game tests and end-to-end fixture checks after implementation.
Keep experimental settings reversible, then promote only validated configurations. Recheck
the suite when models, helpers or llama.cpp builds change.

Deliver a local machine-readable run manifest, stage timing table, configuration comparison,
failure taxonomy, paired renders, quality scores and a recommendation with measured limits.
The UI should show human-readable stage durations and total generation time, including
repairs, without presenting speculation estimates as progress percentages.

Execution order: instrumentation → baseline → MTP comparison → largest measured bottleneck
→ combined finalists → held-out quality review → cross-platform checks → controlled rollout.
The original plan made no runtime changes. The execution record below separates implemented
changes, measured experiments and unqualified work.

Primary reference: [llama.cpp speculative decoding documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/speculative.md).
The [reported Metal slowdown](https://github.com/ggml-org/llama.cpp/issues/23752) motivates
an on/off comparison; it is not proof that BonzAI has the same bottleneck.

## Execution record — 17 October 2026

### Reproducible local tools

- `scripts/benchmark-3d.mjs` drives the actual Vue Submit action, assembly checks,
  Three.js renderer, history store and reopening through an isolated browser. Only the
  Electron bridge/storage is replaced; inference comes from a loopback llama-server.
- `test/fixtures/3d-benchmark.json` contains 24 fixed briefs (12 assets, six levels,
  six games), six screening cases, explicit checks and a six-dimension 0–5 rubric.
  The current executable fixtures are prompt-only; reference-image qualification remains open.
- `scripts/benchmark-3d-decoding.mjs` compares identical fixed-length requests and optional
  full/reduced preview rendering. These samples establish throughput, not asset quality.
- `scripts/report-3d-benchmark.mjs` includes failures and unreviewed outputs in its
  denominator. Quality acceptance needs saved/reopened output, clean runtime/construction
  checks and a named reviewer scoring every dimension at least 4/5. Games also require
  recorded movement, collision, objective, win, defeat and restart checks. No small-sample
  p95 or confidence interval is invented.
- `scripts/benchmark-3d-review.mjs` evaluates the installed local vision judge against
  recorded screenshot reviews, using the application's response schema and measured scene
  context. It preserves the original reviews and reports unusable responses separately.

Example commands (start the isolated local inference and Vite servers first):

```bash
node scripts/benchmark-3d.mjs --ui=http://127.0.0.1:5179 --llm=http://127.0.0.1:64213 --fixtures=screen --seeds=17,41,97 --out=/absolute/fresh/run-directory
node scripts/benchmark-3d-decoding.mjs --prompt=/absolute/captured-code-prompt.txt --out=/absolute/fresh/decode-directory --tokens=192 --seeds=17,41,97
node scripts/report-3d-benchmark.mjs /absolute/run-directory
node scripts/benchmark-3d-review.mjs /absolute/run-directory http://127.0.0.1:64112
```

Each complete-pipeline run retains a manifest, source diff/new source files, actual prompts
and responses, token/prefill/decode counters, failures, three view captures, saved history,
assembly inspection and a pending visual-review form. Runtime properties, model SHA-256,
OS/CPU/RAM, global free-memory/swap snapshots and actual server command logs identify the
cohort. Memory snapshots are **not peak GPU/process memory measurements**. The vision judge
is optional and disabled in the initial cohort; screenshot review is explicitly unblinded.
The browser is frozen against HMR for a trial. Keep runtime source unchanged during a batch.
Outputs stay local; no model or project is uploaded by these scripts.

### Runtime comparison

Hardware: Apple M1 Max, 32 GB unified memory, macOS arm64. Runtime: shipped
`b1-f4cc787` (`f4cc787b9f9e9fa7b6c9eeef7a767bc40e5f7e3d`). Model:
`qwen3.8-27b-turbofcfusion-735-882-here-uncen-neo-coder-max-low-mtp-iq4_xs.gguf`.
32K context, one slot, Q8 K/V, GPU offload, thinking disabled. Other user applications
remained open; these are local screening measurements, not a dedicated-lab claim.

Captured 7,300-token code prompt, 192-token greedy completions; three repetitions per
configuration, with the first sample reported separately because its cache differs.
The table uses the last two warm samples. All twelve generated prefixes were byte-identical.

| Speculation | Warm decode tokens/s | Warm request seconds | Draft acceptance |
| --- | ---: | ---: | ---: |
| Off | 7.20 | 27.15 | Not applicable |
| MTP depth 2 | 5.25 | 37.13 | 69.8% |
| MTP depth 3 | 5.13 | 38.25 | 63.8% |
| MTP depth 4 | 4.69 | 41.57 | 55.3% |

Off decoded about 37% faster than depth 2 in this small matched sample. High acceptance did
not pay for MTP's extra work on this configuration. This does not qualify a universal CUDA,
CPU or other-Mac default; native MTP is left available for separate hardware measurements.

With MTP off and a real ThreeViewer preview, the warm full-rate request took 34.50s at
5.66 tokens/s. The two reduced-preview requests took 26.63s and 26.75s at 7.37 and 7.33
tokens/s: about 23% less request time, identical text. Measured preview frequency was
about 7.5fps versus 60fps for the warm full-rate sample. Screenshot quality is unchanged.
This is a short decode diagnostic; the complete-pipeline table is separate.

### Changes under evaluation

- Runtime token counters replace transport-chunk estimates. One trace records planning,
  generation, repairs, rendering, review and saving, including failed calls. Unknown counters
  stay unknown. Render currently combines parsing, construction, material loading and GPU
  setup; these are not yet individually timed. Vision-stage duration is recorded, but its
  token usage is not part of the code-model aggregate.
- Generation displays elapsed time and real stages instead of treating the maximum token
  allowance as a progress percentage. Metadata includes stage durations; the final local
  trace also measures the history write itself.
- Task-selected complete reference sections are bounded to 6,000 characters; core geometry
  and PBR references remain. The lantern reference payload fell from 7,440 to 3,653
  characters. The assembly plan is no longer repeated in the same code prompt.
- Polygonal glazing receives an executable dimension-coupled frame/pane recipe. Naming,
  glass-material, emission and measured joint-gap mismatches first try bounded exact edits;
  structural failures retain the full rebuild path. A worse correction restores the drawable
  source. A disjoint contact is actionable when its intended plan is internally consistent;
  overlapping bounds still cannot prove connected surfaces.
- Profile helpers accept finite numeric pairs and native `THREE.Vector2` points. Negative
  lathe radii still fail with a radial-cross-section diagnostic rather than being silently
  changed. The first revised trial exposed this compatibility gap and repeated it through
  all three repairs. Repair prompts now carry a compact runtime/construction guide instead
  of repeating the full generation contract: 10,809 versus 18,118 characters for that failure.
- Preview rendering is capped at 8fps while the local code model is working. Simulation
  continues, captures render directly, and active orbit gestures/games/level walkthroughs keep their normal
  rendering. This is GPU resource sharing, not a reduction of final geometry or material quality.
- Game planning preserves world scale. Runtime acceptance checks an actual visible attached
  player, objectives and a started session. Games also receive visual review. The default
  grounded controller supports registered solid pieces with swept XZ collision and sliding;
  this does not replace full physics for slopes or jumping.
- Restart restores collected actors, rotations/scales, one-shot triggers, initial level and nested state. Form
  typing/focus loss no longer leaves movement held. A terminal defeat cannot be overwritten
  by a win from another callback in the same frame. Player health is consistent with the HUD;
  finite camera/entry arrays are supported and malformed objective bindings are diagnosed.
- Inspection captures are 768 × 768 instead of shrinking a wide application viewport to
  a shallow strip. The renderer size, camera aspect and user view are restored afterward.
- First-generation creative direction no longer tells the model to redesign the assembly
  it just planned. Repeated variations preserve joints and functional construction.

### Complete-pipeline quality gate

The original lantern run rendered and survived save/reopen in 957.2s (15m57s), using 3,745
output tokens. Planning took 111.6s, code generation 840.7s. It had no runtime/assembly
errors and used 36 meshes / 4,636 triangles, but multi-angle review **failed**: hand-built
glass panes protruded beyond the cage and the handle attachment was not convincing.
This is deliberately not counted as an AAA-quality success.

The first revised lantern's initial code step used 2,018 tokens and took 353.0s, versus
3,169 tokens and 840.7s in the original run. **It failed at runtime**, then exhausted three
repairs on the profile input mismatch above. Its faster initial code step is not a validated
result-time improvement. The subsequent courtyard trial was interrupted during planning;
it remains in the failed/interrupted denominator. Replaying the captured lantern with its
first model correction after the helper fix rendered 41 meshes / 3,016 triangles. Three-view
inspection confirmed fitted glazing but still found unsupported handle, foot ring and
emitter construction. That replay also fails the quality gate.

The next frozen-source 27B/MTP-off batch completed all three screening cases:

| Case, seed 17 | Generation time | Output tokens | Outcome |
| --- | ---: | ---: | --- |
| Emergency lantern | 7m07s | 2,541 | Saved/reopened; visual failure: floating cage joint, unsupported emitter and incorrect cap fit |
| Japanese courtyard | 10m41s | 3,884 | Saved/reopened; visual failure: unfinished vegetation/architecture, material-scale problems and lighting mismatch |
| Collect-and-exit game | 19m15s | 5,623 | Runtime failure after three patches: invented geometry/camera APIs; no playable result |

The lantern draft took about 55% less time than the original. This is a combined-change
screen with different cache/host-pressure conditions, **not** a controlled estimate of
quality-preserving speedup. Zero of these three cases met acceptance. Game source inspection
also found incorrect update callback arguments, missing pickup/goal bindings and inconsistent
health logic. Runtime and prompt corrections followed this batch; it does not validate those
later corrections. Recurrent-model cache logs repeatedly forced full prompt reprocessing on
changed repair prompts, so a stable prefix alone did not provide reliable prefill savings.

The smaller `qwen3.5-9b-ud-q2_k_xl.gguf` candidate produced an invalid zero-height base in
two successive 2,317-token planning responses (90.6s and 104.4s). Prompt-only fallback then
entered a repeated-comment loop after roughly 1,950 tokens. The isolated run was interrupted
after over 3,700 output tokens; its partial output is retained. The planned courtyard and
game runs for this candidate were **not attempted**. Its roughly 23 tokens/s did not yield a
usable result. This quantization is rejected by screening, not recommended as a faster default.

One actual-model targeted repair took 73.1s and 185 output tokens, but moved the chamber's
centre to the battery top instead of closing the 0.03-unit gap. Its broad envelopes passed
while the cage sank and the cap floated. Three-view inspection rejected it. Repairs now
receive measured part bounds and explicit centre-coordinate semantics; substantial worsening
of a part's fit to its intended envelope rejects the correction even if the error count falls.
This is a regression safeguard, not a proof of valid contact or a substitute for visual review.

Repeating that captured repair with the improved evidence/prompt changed the base height
from 0.22 to 0.25 and its centre from 0.11 to 0.125, preserving the chamber/cap positions.
The measured gap disappeared in 90.4s with 185 output tokens (61.8s prefill, 27.2s decode).
The targeted joint improved; the asset still fails overall visual acceptance because the
cap fit and unsupported emitter remain wrong. Both repair replays and their three views
are retained, including the failed first edit. They are not fresh-generation trials.

### Visual judge calibration and decision

The installed `meetara-qwen3.5-0.8b-q4_k_m.gguf` plus its vision projector was evaluated
against six saved images from the failed lantern and courtyard. With the app's strict
JSON response format, scene measurements and review prompt, it approved all three lantern
views at 0.95 and rejected the courtyard by largely repeating bounds warnings. That is one
false acceptance among two known-failed assets, not a population accuracy estimate. The
earlier unconstrained diagnostic produced no usable reviews and is preserved separately;
it does not represent the application's structured request.

Consequently local visual assessments are now **advisory**: suggestions and views are saved,
but the current judge cannot set `visionVerified` or drive another automatic geometry rewrite.
Measured runtime/assembly repairs remain active. The bounded visual-correction engine remains
available for a future independently qualified judge; it is disabled in the current UI path.
Thresholds and valid JSON alone cannot compensate for poor visual judgment. Re-enabling
automatic visual correction requires evidence on known-good, known-bad and held-out assets,
including actual repair benefit and false-acceptance rates.

The 24 × five-seed finalist matrix, reference-image cohort, blinded visual review,
peak GPU memory, revised-runtime comparison and Windows/CUDA/Linux/CPU qualification
remain separate acceptance work. Neither a successful renderer test nor a faster decode
sample proves arbitrary AAA generation. Do not expand a rejected configuration into the
expensive finalist matrix merely to accumulate more failed examples.

### Validation and retained evidence

- 150 targeted Node tests passed: assembly/repair, geometry, creative constraints, gameplay,
  collision/restart, timing counters, benchmark acceptance, references and material catalogue.
- Nine real-browser checks passed, with one optional live-model test skipped. Separate actual
  model runs above supply the inference evidence. Browser coverage includes GLB embedded
  materials, square review images and restored viewport state, 480px layout, navigation,
  actual keyboard collision/collection/win/defeat/restart, persistence and advisory reviews.
- Main, preload and renderer Vite production builds passed using isolated `/tmp` outputs;
  the live app's build directory was not cleared. Existing large-chunk and dependency
  externalization warnings remain. These are compilation checks, not signed OS installers.
- Raw trials, configuration snapshots, prompts, partial output, model hashes, rendered views,
  reviews and logs are retained locally in `.local-release-archive/3d-benchmark/`. The main
  frozen batches are under `screening-2026-10-17/`; repair replays have separate directories.

Rollout decision: retain bounded references, GPU preview sharing, authoritative timings,
geometry compatibility and measured repair/runtime fixes. Keep the 27B model; reject the
tested 9B quantization. Explicit non-MTP operation now works, but the global default is not
changed from one Mac cohort. The current judge is advisory. No candidate qualifies for an
AAA label or for the 24 × five-seed finalist phase yet.

The next qualification work must address construction before more effects: compare stronger
eligible code models on these exact failures, expand dimension-linked assemblies with tested
attachments/openings, and qualify a visual judge independently. Generated games must pass an
actual playthrough. Then run the paired multi-seed/held-out and supported-OS matrix; do not
infer a quality-preserving speedup from faster failed drafts.

## Direction

BonzAI keeps its existing renderer as the visual authority. The engine already owns
materials, procedural textures, shaders, fluids, weather, physics, post-processing,
environment lighting and performance presets. Image reconstruction and gameplay are
added above that layer.

The objective is one coherent pipeline:

```
prompt or reference
  -> quality contract
  -> structured world and gameplay specification
  -> validated BonzAI runtime code
  -> multi-angle render review
  -> playable, exportable experience
```

The 3D workspace now exposes four free generation paths:

- **Object**: prompt to a reusable procedural Three.js asset.
- **Level**: prompt to a complete environment.
- **Game**: prompt to a playable Three.js experience using the `GAME` runtime.
- **Image to 3D**: reference image to vision evidence, reconstruction blueprint,
  procedural Three.js render, fidelity review and one bounded correction pass.

## Level exploration

Level generation, repair and refinement use the same world-scale contract. The renderer also marks explicitly requested levels as world-scale, including saved level records, so omitted model metadata cannot shrink them to an object. JavaScript is parsed rather than repaired by counting braces in strings, comments or shaders. Syntax and runtime failures participate in the bounded recovery loop; rendering errors remain failures rather than completed generations.

Generated and saved levels open in Orbit mode, centred on the entire level. Explore is an explicit choice: focus the canvas, use WASD or arrows to move, drag to look, Q/E to descend/ascend, and Shift to move faster. Speed is adjustable in metres per second. Input stops on blur and does not capture typing in prompt fields. Exploration is a free camera, without collision or gravity; playable games retain their GAME-controlled player and camera. Overview fits the projected level bounds with a small margin at both wide and constrained widths; snapshots preserve the exploration camera.

### Shared rendering and construction

Objects and levels share an HDR pipeline with a final ACES tone-mapping pass before output conversion and antialiasing. The main directional light owns the shadow map; its light-space bounds fit the actual asset or level rather than a fixed object-sized region. Fill/ambient/environment illumination is balanced against the key, and backdrop restoration does not raise the environment intensity. Studio temporarily uses neutral lighting without changing the selected environmental settings.

Generated lit meshes cast and receive shadows by default; transmissive and unlit effects are preserved. Set `mesh.userData.castShadow = false` or `receiveShadow = false` for deliberate exceptions. Colour textures and normal/roughness data use their appropriate colour spaces. Existing saved geometry benefits from these renderer fixes when reopened, but new construction requires regeneration or refinement.

`H.bevelBox(width,height,depth,radius,segments=3)` returns reusable chamfered geometry. `MAT.surface(kind,{color,roughness,metalness,repeat:[u,v],relief,seed})` supplies matched local colour, bump and roughness maps for stone, concrete, wood, metal, fabric, ground and sand. Maps are shared for matching parameters, seeded for repeatable detail, embedded in GLB exports, and released with the generation. Relief uses scene units; object-scale parts need much smaller relief than architecture. Use custom profiles and materials for distinctive forms rather than substituting these helpers for modelling.

Planning and visual review distinguish finished primary/secondary/detail construction from blockouts. Level review additionally checks layout, material scale, supporting ground/floors, ground contact and z-fighting. The generation contract explicitly requires authored terrain because the viewer hides its object display floor for levels. Review passes require an overall score of 0.85, every category at least 0.75, and no reported defects; absent vision remains unreviewed. Controlled rendering tests do not establish an AAA quality guarantee for arbitrary model outputs.

## Default asset model

Chat, object-generation planning and code generation default to `qwen3_8_27b_low` at `q4`: DavidAU Turbo Fable **LOW MTP IQ4_XS** (15.3 GB), with a **32,768-token runtime ceiling**, Q8 KV in the singleton chat/3D runtime, and two-token MTP drafting. LOW Q6_K (22.4 GB) and the previous MAX family remain in the catalog. Saved selections of the former MAX Q4 default migrate to LOW IQ4_XS; unrelated explicit model preferences are preserved. The normal download flow applies; no weights are downloaded automatically. Native context is 262K, but this LOW profile deliberately caps requests at 32K (or less if the memory estimator requires it). This is a smaller-memory trial profile, not a measured speed guarantee.

## Procedural asset generation

`generationContract.js` supplies a shared generation and revision contract. The original brief is retained alongside a 350–550 word construction plan (up to 1,800 output tokens). Geometry and material references are always available; texture, animation, shader, interaction and lighting references are selected by subject with a 14,000-character reference budget. Retry uses the same contract. A rendered frame and animation callbacks are validated before success; procedural runtime failures get up to three bounded repair attempts with the actual error. The generated-code THREE facade supports local instance-matrix rotations without modifying the global library or losing translations; supported deterministic repairs run before model repair. Repairs use at most eight exact, uniquely matched text edits (2,048 output tokens), preserving unaffected construction and rejecting ambiguous replacements. Shader compilation failures propagate instead of leaving a falsely successful blank asset. Refinement preserves animation and unaffected geometry instead of enforcing dramatic changes.

The renderer preserves authored roughness, transmission, unlit materials and emission. It no longer fills arbitrary empty vessels or adds fallback stars, glow and lens flares. Postprocessing resets to neutral before execution and does not overwrite authored settings afterwards. Performance presets control sampling and shadow resolution rather than color grading. Object generation defaults to Studio presentation; Environment exposes the existing lighting/weather backdrop. Build/game worlds retain their scale and camera.

`FLUID.basinWater({radius,y,depth,color})` adds a water surface to bespoke basin geometry. Small fountain basins use physical transmissive water with animated normals, stone interiors and no separate ocean reflection pass. `FLUID.jet({from,to,radius,color})` provides curved clear jets and instanced moving droplets. `FLUID.stream` remains available for stylized waterfall sheets, while `FLUID.oceanWater` remains appropriate for larger reflective water bodies. Fountain helpers accept `stoneColor`, `waterColor` and `rim`; bespoke architecture still needs authored geometry.

Validation: `node --test test/generation-contract.test.mjs test/model-context.test.mjs test/game-runtime.test.mjs`. With the Vite preview running, `BONZAI_UI_URL=http://127.0.0.1:5179 node --test test/generation-rendering.browser.test.mjs` executes real WebGL fixtures and checks fluid optics, animation, material preservation and constrained widths. These fixtures do not establish general model quality or device FPS. Existing saved code keeps its authored decoration; regenerate or refine it to adopt the new generation contract.

## Fresh interpretations

Each procedural generation gets a fresh creative direction and up to three previous assembly plans for that same prompt and asset kind. Directions change unspecified form and detailing decisions; explicit constraints stay binding. Reference reconstruction remains faithful, and refinement retains the existing design. Direction metadata is stored with the local inference record.

The shared contract selects subject-appropriate technique guidance for organic, mechanical, architectural, soft-surface and expressive assets. Fluid construction guidance is included only for relevant subjects. There is no fixed mesh template selected by these categories.

A construction/material signature detects duplicate designs among newly saved records for the same prompt. Names, camera and particle decoration do not make an otherwise identical design new. A duplicate receives one bounded design revision; a repeated duplicate is reported as a failure instead of being saved as a fresh asset. This is a duplicate guard, not a perceptual quality score; historical records without signatures cannot be compared this way.

## Image reconstruction

### Context budgeting

3D requests one 32K slot with Q8 KV cache. The loader uses the on-disk GGUF size and available device budget; Qwen3.8's estimate accounts for its 16 full-attention layers rather than treating all 64 hybrid blocks as conventional KV attention. The LOW profile caps this estimate at 32K. The budget reserves 30% of total unified memory plus compute overhead; it does not measure current memory pressure or separately reserve MTP buffers. This is a capacity estimate, not a hardware performance guarantee.

The loaded context is reported separately from the model's advertised maximum. Before each 3D call, llama-server renders the chat template and tokenizes the prompt; the remaining capacity bounds output, with a clear error when meaningful code cannot fit. Code generation uses isolated requests, so another chat's persona and history cannot consume its budget. `test/model-context.test.mjs` covers the 32 GiB case, larger quantizations, precision changes and output budgeting. Main-process changes require a desktop restart and model reload.

BonzAI applies selected img2threejs concepts without replacing its renderer or
introducing a second scene lifecycle. The reconstruction pipeline uses:

- reference admission and suitability checks
- detail inventory and topology classification
- structured component, material, socket and collider specifications
- locked blockout, structure, form, material and interaction passes
- deterministic spec validation
- silhouette, proportion, colour and multi-angle diagnostics
- bounded correction loops

Specifications compile to BonzAI's existing `MAT`, `TEX`, `SHADER`, `FLUID`,
`FX`, `P`, and `GAME` APIs. The current renderer produces every comparison image,
and local vision resolves ambiguous review findings. Specifications and review
history persist with the inference record.

The pipeline deliberately excludes:

- upstream post-processing or environment setup
- a second Three.js scene, camera or render loop
- arbitrary generated imports
- unfinished character-rig and GLTF claims

## Gameplay runtime

`GAME` is created by `makeLibs()` beside the rendering namespaces and shares the
viewer update loop. A generated game creates one session:

```js
const game = GAME.create({
  title: "Relic Run",
  genre: "action adventure",
  state: { score: 0, health: 100 },
  objectives: [
    { id: "relics", type: "collect", label: "Recover 5 relics", target: 5, tag: "relic" },
    { id: "exit", type: "reach", label: "Reach the gate", target: 1, trigger: "gate" },
  ],
});
```

The runtime currently provides:

- ready, running, paused, won, lost and disposed lifecycle states
- keyboard action mapping and edge-triggered input
- player and actor registration
- ordered level registration and transitions
- authored object-to-object interaction graphs
- per-actor update behavior
- follow camera
- trigger volumes and collision checks
- collection, damage, defeat, score and custom events
- collect, score, defeat, reach, survive and custom objectives
- checkpoints and restoration
- accessible HUD
- automatic cleanup when a new generation replaces the current one
- companion-controlled objective navigation and combat

## World Forge compiler

World Forge persists reusable objects, ordered levels, placements, roles,
interactions and ownership references in a versioned project. Its deterministic
compiler runs each generated asset in an isolated builder scope, preserving the
existing rendering code while assembling one playable runtime.

The UI separates work into **Generate** and **Build**. Generate produces either
a level from text or an object from text, with an optional reference image for
reconstruction. **Edit level** opens the level in Build without requiring saved
objects, game rules, a wallet or a collectible. The editor uses an orbital camera
and pauses animation callbacks so the geometry stays still while positioning it.
Click an assembly or use the scene hierarchy to select a nested mesh or a single
instance. Move, rotate and scale use Three.js transform handles or numeric inputs;
optional snapping uses 0.25 units, 15 degrees and 0.1 scale increments.

Saved objects can be dragged onto visible level geometry or selected and placed
with a click. Placement is raycast against level surfaces, with the ground plane
as a fallback, and stored in level coordinates. Gameplay roles and interactions
remain optional, with explicit playtesting separate from editing.

Selective regeneration prompts the local code model for an isolated replacement.
The replacement is fitted to the old bounds and retains the selected transform;
regenerating a placed asset creates a new asset reference only for that placement.
Native geometry uses source paths and structural signatures in `level.partEdits`;
an incompatible source change fails rather than targeting another node. Merged
geometry is editable as a mesh, not as separate disconnected faces. Individual
instances can be replaced without modifying the other instance matrices.

Preview and game compilers share these edits and locally seeded procedural
randomness. Edits are committed after runtime validation, saved in the local
project, and support session Undo/Redo. **Save level** creates a history record
with both renderable source and an editable `levelProject` snapshot, which can
be reopened or exported as GLB. Runtime checks and bounded repair attempts do
not establish the visual quality of a generated replacement.

Validation: `node --test test/level-editing.test.mjs test/game-project.test.mjs`.
With Vite running, `BONZAI_UI_URL=http://127.0.0.1:5179 node --test
test/level-editor.browser.test.mjs` checks the actual editor with deterministic
inference responses; it does not benchmark a live local model.

Each placed instance can be a main character, enemy, trap, collectible, buff,
debuff, checkpoint, platform, goal or scenery object. A level can clear by collecting,
defeating, reaching, surviving, scoring or emitting a custom event. Multiple clear
conditions can require all conditions or any one of them. Reach is one gameplay style,
not an assumed finish marker. Authored interactions connect placed instances and support
activation, collection, damage and unlocking. Playtesting runs directly inside
Build. Publishing becomes available beside the level tabs when every level validates.

Game collectibles are registered with a manifest hash in
`BonzaiGameRegistry`. `GameTokenFactory` only issues an ERC-20 when the caller
owns both the canonical BonzAI collection and the registered game token ID.

The renderer remains the visual authority. New systems consume its public runtime
instead of rewriting it.

## GLB export and collectible attachments

Each successful 3D history item has a **GLB** action. The selected record is rebuilt
in an isolated local viewer so exporting an older item does not export or replace
the current scene. The binary glTF 2.0 file contains geometry, materials, instances
and authored glTF animation clips. JavaScript update callbacks, custom shader code,
physics and postprocessing are not portable glTF behavior; use the source and
interactive viewer for those features.

3D minting prepares the GLB before uploads, then stores the model, JavaScript source
and interactive HTML viewer on IPFS. An export or GLB upload failure stops minting.
Metadata uses the model's `ipfs://` URI as `animation_url`, lists attachments under
`properties.files`, and retains `properties.interactive_viewer` and source provenance.
No storage upload or wallet transaction is performed by local GLB export.

## Runtime recovery

Generated geometry accepts Path contours at the ShapeGeometry/ExtrudeGeometry
boundary by copying them to Shapes without modifying Three.js globally. A runtime
ReferenceError from a single undeclared assignment can be repaired deterministically
using AST positions; unknown input values are never guessed. Generation then has
up to three bounded repair attempts, with actual rendering after each edit. No-op
repairs stop immediately. Exhausted failures retain source and diagnostics in history
for inspection instead of storing an empty result or reporting success.

## Assembly validation

Object and level generation first requests a local, JSON-only assembly plan (`assemblyContract.js`). The plan specifies an operating principle, named functional parts, root-local bounding envelopes, surface roles and contact/containment/order/separation constraints. Malformed JSON/schema receives one retry with the previous response and specific error. After two malformed responses, generation continues from the original brief without claiming a validated plan. Model/transport failures still surface as errors.

Generated meshes are measured in root-local coordinates, including instancing. Missing/duplicate parts, opaque glazing, absent emissive surfaces and disjoint intended contacts first receive a bounded exact-edit repair, then one complete rebuild if necessary. A disjoint contact is actionable only when the planned contact is itself consistent. Other bounding-envelope deviations and spatial relationships remain advisory: overlapping envelopes do not prove intersecting surfaces, especially for glazing inside frames. Repairs that fail, do not reduce errors, or substantially worsen part displacement restore the drawable original. Runtime/shader failures retain bounded targeted repair and remain errors if unrepaired. Visual suggestions follow construction checks. Saved object records retain the contract; refinement updates the plan, and a failed refinement restores the previous source and plan. Legacy records without contracts remain usable.

`H.framedPanels({radius,height,sides,rail,clearance,thickness,y,glassMaterial,frameMaterial})` constructs an open chamber with panes inset from shared rail openings. No solid central housing is added. Tagged light-source assemblies are checked for a nearby point/spot light and opaque obstruction along ten sampled triangle-ray paths; this is a visibility diagnostic, not a guarantee of physical light transport. Candidate construction rebuilds are syntax-checked before rendering, with one targeted syntax-repair attempt; invalid candidates leave the current scene untouched.

`H.radialPanels({radius,height,sides,thickness,y,material,gap})` constructs outward-facing polygonal panels (radius is the apothem). `H.strutBetween(from,to,radius,material,segments)` aligns a support to exact endpoints. Both produce ordinary Three.js meshes suitable for GLB export.

These checks validate bounding envelopes and specified material roles, not solid geometry, watertightness, functional mechanics or semantic correctness of arbitrary objects. An incorrect but internally consistent plan can still pass. No web references are fetched automatically; reference images remain an explicit input. Tests: `node --test test/assembly-contract.test.mjs`; run `BONZAI_UI_URL=http://127.0.0.1:5187 node --test test/assembly-pipeline.browser.test.mjs` against an isolated Vite preview for complete Generate-action coverage with controlled local-inference responses and actual WebGL/persistence. These tests do not establish live-model aesthetic quality.

## Visual quality review

Object and environment generation, including whole-scene refinement, inspect three
actual renders: overall construction, reverse construction, and a close-up of a
significant part (individual instances are eligible). Each image is reviewed
separately by installed local vision at 768 × 768. Output budgets still need to fit
the shared vision model's 4K context. The camera, aspect, renderer size, clipping range,
controls and render-quality setting are restored after capture. Inspection images
are retained alongside the hero thumbnail in local history.

The correction engine supports two bounded attempts, but these are disabled for the
current unqualified visual judge (see calibration above). Its acceptance logic requires all views to pass;
category scores use the weakest view and overall scores are recomputed from the
categories rather than trusting the model's reported total. Corrections cannot
trade more than 0.04 in any category or view for an improved total. Worse, failed or
unreviewed corrections restore the previous draft. No implicit model downloads or
peer requests occur. These checks are fallible local-model assessments, not an
AAA certification; they add generation latency.

Passing requires a valid affirmative verdict, minimum category scores and no
unresolved defects. Contradictory model assessments remain drafts.

History distinguishes advisory AI reviews, drafts with review suggestions, and unreviewed
drafts. Missing vision or malformed reviews never count as passes. Games receive visual
suggestions but still need interaction testing; relief fallbacks remain unreviewed.
Studio uses neutral lighting and softbox reflections. Environment preserves the user's
outdoor settings and stylized reflective ground/grid; levels supply their own ground.
Studio's local PMREM environment contains rectangular HDR emitters
for broad specular highlights. Neither mode changes authored geometry.

Generated async construction IIFEs are awaited using an AST rewrite in both
normalization and the viewer execution boundary (including legacy saved modules).
This prevents empty-root validation and disposal while scanned materials are still
loading. Only directly invoked async function expressions in async scopes are
rewritten; animation callbacks and arbitrary calls are not guessed. Construction
errors propagate to bounded runtime repair. The generation deadline timer is
cleared after settlement. `test/async-construction.browser.test.mjs` verifies delayed
bundled texture loading, saved modules, error propagation and a subsequent retry.

`sceneInspection.js` rejects non-finite geometry/normal/UV/transform data and invalid
indices before declaring a render successful, including the initial animation update.
Shader compilation diagnostics are enabled during the validation frame. Saved
modules are unwrapped before normalization so reopening history does not
redeclare the host runtime or alter its procedural seed. Draw-call, triangle, material and
UV diagnostics accompany visual review. Low polygon counts are not an error:
minimal and low-poly briefs remain valid.

Production construction helpers are shared by preview, level editing and game
compilation:

- `H.latheProfile([[radius,height],...], segments)` creates turned cross-sections;
  include interior walls and a bottom when building a hollow vessel.
- `H.bevelPanel(contour,{depth,bevel,holes,segments})` creates bevelled extrusions
  with actual openings. Coordinates are XY, extrusion runs along +Z.
- `H.worldUV(geometry,tileSize)` returns new geometry with baked physical-scale
  UVs for modular architecture and ordinary GLB export.
- `MAT.surface` now supplies matched linear normal/roughness maps and sRGB color,
  default 512px (128–1024 supported), shared by seed/repeat/resolution. `tileSize`
  sets physical normal scale; `relief:0` disables relief. Bump textures remain for
  compatibility. Export includes the normal textures without custom shader code.

The parametric library (`constructionHelpers.js`) adds 28 Object3D factories:

- Shells and fittings: `hollowTube`, `openVessel`, `openBox`, `wallOpening`,
  `fittedWindow`, `hingedPanel`.
- Architecture and furniture: `stairFlight`, `ramp`, `railing`, `supportFrame`,
  `shelfUnit`, `truss`, `beamGrid`, `archedSpan`.
- Mechanical parts: `wheel`, `wheelAxle`, `gear`, `pulley`, `boltCircle`, `spring`.
- Organic surfaces and detail: `pipeRun`, `taperedBranch`, `loftBody`, `clothPanel`,
  `facetedGem`.
- Placement and lighting: `terrainPatch`, `seatedProp`, `lightSource`.

Dimensions shared by mating parts derive their clearances, rather than asking the
model to calculate separate coordinates. Factories reject invalid dimensions and
bound subdivision counts. `seatedProp` uses the supplied terrain height function
at the placement point; it must run before parenting. It does not solve footprint
support or slope alignment. `gear` is decorative, branches are joined segments,
and lofts provide scaffolding rather than anatomical correctness.

`H.assemble({materials,parts})` builds a named hierarchy from an allowlisted recipe.
Each part has `id`, `helper`, `options`, and optional `parent`, `position`, `rotation`
(radians). Materials in options reference caller-supplied material IDs. Unknown
helpers/options, invalid vectors, unresolved parents and cycles are rejected.
Placement wrappers preserve intrinsic helper orientation. Recipes accept finite
JSON values, not callbacks or code; use direct helpers for terrain/drape callbacks.
The resulting parts remain editable ordinary meshes and export to GLB. Invalid
recipes are not attached to the scene; existing generation repair handles errors.

`constructionCatalogue.js` selects at most eight relevant helper signatures for
initial generation, refinement and repair. `node scripts/audit-3d-construction.mjs`
reports routing coverage for all 296 briefs (240 objects, 28 levels, 28 games).
A helper match is **not** a validated finished asset: every report row retains
`requires-generated-output-review`. Arbitrary custom topology, subject identity,
level reachability and gameplay still require their own validation. No correctness
percentage is inferred from keyword coverage.

Run `node --test test/construction-library.test.mjs` for geometric invariants,
parameter sweeps and recipe rejection. With Vite running, run
`BONZAI_UI_URL=http://127.0.0.1:5179 node --test test/construction-library.browser.test.mjs`
for the actual viewer and binary GLB export. This renderer test uses deterministic
fixtures; it does not claim that all example prompts were generated by a live LLM.

Prompt construction includes short subject-specific examples of hollow profiles,
real openings or manufactured panels. These are construction techniques, not
fixed scenes or replacements for the user's requested design.

Verify with `node --test test/scene-inspection.test.mjs test/render-quality.test.mjs
test/visual-quality.test.mjs test/generation-contract.test.mjs` and, with Vite
running, `BONZAI_UI_URL=http://127.0.0.1:5179 node --test
test/production-rendering.browser.test.mjs`. The latter exercises real WebGL,
embedded GLB textures, multiple views and camera-state restoration at desktop
and constrained widths.

## Example library

The 3D example picker is backed by `src/components/gen3d/exampleLibrary.js`:
296 editable briefs across 28 genre families, with 240 assets, 28 levels and 28
playable prototypes. Search combines subject text, genre and creation-type filters.
Selecting a brief sets Object, Level or Game mode and returns to prompt input;
it never starts inference, downloads, publishes or mints automatically.

Every genre has all three creation types. Coverage includes platforming, action
adventure, RPG, shooting, stealth, horror, survival/crafting, sandbox construction,
racing, sports, fighting, strategy, tactics, tower defense, spatial puzzles,
escape rooms, rhythm, roguelikes, metroidvania, vehicle simulation, farming,
management, space, flight, naval, party, narrative and board/card games.

These are prompt starters, not validated finished games. Playable briefs specify
bounded local single-player loops using the existing GAME API. Levels specify
traversable environments and placement groups, leaving actual mechanics to game
assembly. The library makes no claim of multiplayer or production-scale systems.

The library includes 200 additional asset briefs in 20 kits (10 assets each), bringing the total to 240 assets, 28 levels and 28 game prototypes. Kits cover castle/dungeon/town/station construction, industry, biomes, furniture, farming, vehicles, aircraft, naval objects, characters, equipment, puzzles, traversal, sports, tabletop, defense and set dressing. Each kit specifies common materials and connection dimensions. Filter by kit, genre and type, or search by subject. These are individual generation briefs, not pre-generated assets or a guarantee that independently generated meshes snap together without inspection. The library shows 24 results at a time and reports the full matching count.

### Bundled photographic materials

The local catalogue contains 172 independently selected 2K CC0 material sets in 22
families. The earlier Hyperstrike starter maps have been removed. Full provenance,
map checksums and tags live in `src/assets/materials/catalogue.json`. The maps total
approximately 1.85 GB on disk; only requested materials load into CPU/GPU memory.

Use `await MAT.scanned(exact_id, options)` or a family alias such as `wood`, `metal`,
`fabric`, `leather`, `brick`, `concrete`, `grass`, `snow`, `marble` or `alien`.
`variant: 1` selects a different scan within a family. `MAT.catalogue(query)` lists
relevant IDs. Generation/revision prompts receive a bounded, deterministic shortlist
using names, tags and English/French material terms. The full catalogue never fills
the inference context. Legacy family aliases resolve to the new scans.

Options include `repeat: [1,1]`, `normalStrength: .5`, `aoIntensity: .65` and standard
material properties. Pair with `H.worldUV(geometry, 2)` for a two-metre tile. Await
once and share across instances. Color, OpenGL normal and roughness are required;
AO and metalness maps are used when provided by the source. Missing optional maps
remain absent. Source metalness uses a multiplier of 1, not an accidental zero.

Vite bundles hashed assets for local HTTP and Electron file loading. No runtime
API, remote downloads or credentials are needed. GLB export embeds the used maps.
See [material provenance](../src/assets/materials/README.md) and reproduce with
`node scripts/fetch-material-library.mjs`. This improves surface fidelity; geometry,
lighting and intentional art direction still determine the final result.

### Editor and playtest camera

Scene objects and Rules & Goals open a dismissible right overlay inside the full
viewport. Selection opens the object inspector; AI design inputs have room for
multiline briefs. Transform edits keep the existing scene and camera mounted.

Playtest uses an independent player camera with first- and third-person modes.
WASD/arrows move relative to the view, dragging looks around, Shift sprints,
E/Space interacts, and Escape pauses. Restart resets the run; Back to Build
restores editing. Orbit controls and the studio ground are disabled during play.
The default controller remains grounded; jumping and rigid-body physics require
a custom controller using the physics API.
