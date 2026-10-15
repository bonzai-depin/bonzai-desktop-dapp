# BonzAI 3D and Game Engine

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

Generated meshes are measured in root-local coordinates, including instancing. Missing/duplicate parts, opaque glazing and absent emissive surfaces trigger one complete construction rebuild. If rebuilding fails or does not reduce these errors, the drawable original is restored with unresolved issues recorded. Bounding-envelope deviations and spatial relationships are advisory: overlapping envelopes do not prove intersecting surfaces, especially for glazing inside frames. Runtime/shader failures retain bounded targeted repair and remain errors if unrepaired. Visual review follows construction checks; unresolved concrete issues prevent a verified status. Saved object records retain the contract; refinement updates the plan, and a failed refinement restores the previous source and plan. Legacy records without contracts remain usable.

`H.framedPanels({radius,height,sides,rail,clearance,thickness,y,glassMaterial,frameMaterial})` constructs an open chamber with panes inset from shared rail openings. No solid central housing is added. Tagged light-source assemblies are checked for a nearby point/spot light and opaque obstruction along ten sampled triangle-ray paths; this is a visibility diagnostic, not a guarantee of physical light transport. Candidate construction rebuilds are syntax-checked before rendering, with one targeted syntax-repair attempt; invalid candidates leave the current scene untouched.

`H.radialPanels({radius,height,sides,thickness,y,material,gap})` constructs outward-facing polygonal panels (radius is the apothem). `H.strutBetween(from,to,radius,material,segments)` aligns a support to exact endpoints. Both produce ordinary Three.js meshes suitable for GLB export.

These checks validate bounding envelopes and specified material roles, not solid geometry, watertightness, functional mechanics or semantic correctness of arbitrary objects. An incorrect but internally consistent plan can still pass. No web references are fetched automatically; reference images remain an explicit input. Tests: `node --test test/assembly-contract.test.mjs`; run `BONZAI_UI_URL=http://127.0.0.1:5187 node --test test/assembly-pipeline.browser.test.mjs` against an isolated Vite preview for complete Generate-action coverage with controlled local-inference responses and actual WebGL/persistence. These tests do not establish live-model aesthetic quality.

## Visual quality review

Object and environment generation, including whole-scene refinement, inspect three
actual renders: overall construction, reverse construction, and a close-up of a
significant part (individual instances are eligible). Each image is reviewed
separately by installed local vision at a 768-pixel longest edge, keeping each
request within the shared vision model's 4K context. The camera, clipping range,
controls and render-quality setting are restored after capture. Inspection images
are retained alongside the hero thumbnail in local history.

Two bounded correction attempts render and review again. All views must pass;
category scores use the weakest view and overall scores are recomputed from the
categories rather than trusting the model's reported total. Corrections cannot
trade more than 0.04 in any category or view for an improved total. Worse, failed or
unreviewed corrections restore the previous draft. No implicit model downloads or
peer requests occur. These checks are fallible local-model assessments, not an
AAA certification; they add generation latency.

Passing requires a valid affirmative verdict, minimum category scores and no
unresolved defects. Contradictory model assessments remain drafts.

History distinguishes reviewed assets, drafts with visible defects, and unreviewed
drafts. Missing vision or malformed reviews never count as passes. Games and relief
fallbacks remain unreviewed. Studio uses neutral lighting and softbox reflections;
Environment preserves outdoor settings with a neutral matte support floor; purple
chrome, glowing grids and automatic ambient particles are no longer part of the
presentation. Studio's local PMREM environment contains rectangular HDR emitters
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
