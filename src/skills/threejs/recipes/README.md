# BonzAI 3D Engine — Recipes & Technique References

This folder is the **go-to local reference repository** for every
rendering technique the engine uses. Each recipe documents:
- The canonical author(s) + source repos.
- The technique itself, with shader/code fragments where relevant.
- How the engine adopted it (or planned to).
- Known failure modes + anti-patterns.

If you need to (re-)study a technique, start here. If the local recipe
points to an external repo, check `_AUTHORS.md` first for the author +
all their other relevant work.

## Navigation

### Author index
- `_AUTHORS.md` — **Start here.** Every cited author + every repo ever
  referenced by the engine, with links and "which engine primitive(s)
  they influenced."

### Weather + atmosphere
- `weather_system.md` — Bruno's property aggregator + DayCycles pattern.
- `rain.md` — Bruno's RainLines (instanced line quads) + Faraz's storm drops.
- `clouds.md` — Faraz's volumetric raymarch (Nubis-style).
- `fog.md` — Faraz's pseudo-height-fog shader chunk override.
- `lightning.md` — Faraz's noise-spike + Bruno's three-phase cascade.
- `snow.md` — Bruno's rain↔snow morph + accumulation heightmap.
- `wet_ground.md` — Faraz's PuddleMaterial + MirrorMaterial.

### Water
- `water.md` — Orrery moat quality target + FLUID primitives +
  stylized waterfall (turtlefalls / Faraz water).

### Lighting + post
- `lens_flare.md` — Mancini's Ultimate Lens Flare + our Effect port.
- `ambient_occlusion.md` — N8AO (WebGL, current) + N8AO-WebGPU (future).

### Object generation
- `crystals.md`, `furniture.md`, `mechanical.md`, `organic.md`,
  `vessels.md`, `weapons.md` — Object-category recipes with canonical
  Three.js patterns. Injected into LLM prompts when keyword-matched.

### Architecture
- `portfolio_patterns.md` — Architecture lessons from Bruno Simon's
  folio-2025 (game-loop ordering, shared uniforms, property pattern,
  render-to-texture, quality tiers).

## Maintenance rules

1. **Every time a new author/repo is added to the engine, add them to
   `_AUTHORS.md`**. Even for a single technique. If it ever inspired any
   line of code, it should be citable.
2. **Every new recipe file cites back to `_AUTHORS.md`** — don't
   duplicate author info across files.
3. **Every recipe has an Anti-patterns section** — document what we
   tried that didn't work. Future-you will thank past-you.
4. **Recipes can include shader fragments** but avoid full-file paste;
   link to the canonical source instead.
5. **Update adoption status** (Currently / Upgrade path / Deferred)
   whenever the engine's implementation changes.

## Recipe injection into LLM prompts

The phase-2 codegen prompt in `Generative3D.vue` scores recipes by keyword
match against the user's prompt and injects the top scorer as a "PATTERN
HINT". See the `recipeFiles` glob + scoring logic in `buildObjectPrompt`.

Recipes with high injection value:
- Object-category recipes (crystals/weapons/vessels/furniture/mechanical/organic)
- `water.md` for any water/liquid keyword match
- `weather_system.md` + `rain.md` + `fog.md` when the prompt involves
  atmospherics

Weather recipes are NOT typically injected (weather is scene-level, not
object-level). They inform engine development, not LLM prompts.
