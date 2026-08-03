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

## Image reconstruction

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
reconstruction. Build starts only when history contains at least one of each.
Its initial workflow is Level, Objects, Gameplay. Once BonzAI assembles that
selection, the canvas becomes a per-level editor with large level tabs, inline
playtesting and a publish action. Palette objects can be stamped by clicking the map or dragged to
an exact position. HTML coordinates are raycast onto the Three.js ground plane,
recorded as world-space placements and rendered after recompilation. This
workflow has no wallet or collectible dependency.

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
