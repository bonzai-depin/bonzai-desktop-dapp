# Water Rendering Reference — engine patterns + external sources

Local authoring notes for every water-rendering technique in the BonzAI 3D
engine. Update this file whenever a new technique, primitive, or reference
demo is added; prompt-injection and codegen both rely on it.

## External references (must re-review when revisiting water)

### Anderson Mancini — stylized AAA water
- Portfolio index: https://andersonmancini.dev/
- Neotix lab demos: https://www.neotix.com.br/en/lab
- Signature techniques:
  - Reflector-based water (`THREE.Water` ancestor pattern) with animated
    normal-map ripple layers
  - Fresnel edge tint + horizon fade
  - Per-vertex Gerstner displacement
  - Foam via depth-buffer comparison (shallow depth → foam)
- Notable demos: "water-planet", "stylized coast", "floating island"
  (rotating line-up; check the lab page).
- Technique notes we've adopted:
  - Multi-layer scrolling normal-map UDN blend for ocean surface
  - Fresnel halo color mixing on water edges
  - "Planar reflection into RT" used by our `FLUID.oceanWater` (via
    `three/examples/jsm/objects/Water.js`)

### Faraz Shaikh — reflective + refractive water
- Portfolio: https://farazzshaikh.com/demos
- Stylized Water demo: https://water-simulation.vercel.app/
  - Source: `github.com/Faraz-Portfolio/demo-2023-stylized-water`
- Signature techniques:
  - Scene-color + scene-depth FBO feeding refraction + shore-fade
  - Gerstner wave displacement via `glNoise.gln_GerstnerWave`
  - Depth-fade shoreline foam using smoothstep on shore depth
  - Planar reflection camera mirror (custom hook, ~150 lines)
  - HSV-space deep→shallow color lerp
- Adopted via `three-custom-shader-material` (TCSM) + `gl-noise` in our
  engine surface (`SHADER.csm` + `SHADER.wetSurface`).

### Turtle Falls — stylized waterfall
- Live demo: https://turtlefalls.vercel.app/
- Signature look (the exact visual target for our `FLUID.stream`):
  - Vertical streak pattern on a 2D waterfall sheet (flat polygon)
  - UV scroll accelerating quadratically downward
  - Bright white foam cap at top edge (water launching off ledge) and
    bottom edge (impact splash)
  - Sheet alpha fades at horizontal edges so the rectangle disappears
  - Numerous small droplet particles around the fall axis
  - Foam disc + mist puff at impact
- Under the hood (observed, not inspected):
  - Unity's Stylized Water 2 port by Staggart Creations is the likely
    inspiration. The Unity shader uses vertex-gradient for foam and
    pan-noise for streaks; same ideas ported to Three.js here.

### pmndrs / three.js built-ins
- `three/examples/jsm/objects/Water.js` — reflector-based ocean. What
  `FLUID.oceanWater` wraps. Renders the scene into a mirror RT each
  frame, samples an animated normalmap, fresnel-mixes the reflection
  with the water color.

## Engine primitives — what to use when

### Scene-wide surfaces (open horizontal water)
- Fountain basin water pool, moat, lake, puddle, pond, tub, sink:
  → **`FLUID.oceanWater(geom, opts)`**
- Tessellate with `new THREE.RingGeometry(0.02 * r, r, 128, 4+)` so the
  ripple shader has vertices to displace. A plain `CircleGeometry` has
  only 1 radial segment and reads as a flat disc.
- Bake horizontal rotation into the geometry (`geom.rotateX(-Math.PI/2)`)
  rather than on the mesh — prevents vertical-water bugs from accidental
  rotation.z mutations.

### Falling water (waterfalls, fountain streams, pours)
- → **`FLUID.stream({ from, to, width, color, foam, droplets, mist, accel })`**
- Implementation: two crossed vertical plane sheets + waterfall shader +
  droplet Points + foam disc + mist Points. No more thick-tube
  TubeGeometry.
- Shader: vertical streaks via fBm, gravity-accelerated UV scroll
  (speed ramps from 0.4 at top to 2.4 × uAccel at bottom), foam caps,
  edge fade.
- Droplets: default 260 small points accelerating under gravity, respawn
  at top when they pass impact. Lateral drift for organic feel.
- Foam disc: additive circular shader at impact, expanding rings + fBm.
- Mist: 80 soft points rising + fading at the impact ring.

### Liquid inside a closed/narrow container
- Flasks, vials, jars, tall goblets, sealed bottles:
  → **`H.fillLiquid(vesselMesh, color, { fillLevel })`**
- Followed by **`FLUID.upgradeFill(liquid)`** to get animated surface.
- The engine's auto-filler detects open-basin vs closed-container shape
  and picks the right primitive automatically (see
  `_detectVessels` and `_autoFillVessels` in ThreeViewer.vue).

### Arbitrary geometry with water material
- Any already-built surface that should read as water:
  → **`FLUID.surface(geom, opts)`** — water shader on custom mesh.

### Atmospheric mist / spray
- → **`FLUID.mist({ bounds, count, color })`** — soft Points cloud.

### Wet-surface decoration
- For ground / floor surfaces that should react to rain:
  → **`SHADER.wetSurface({ color, rainFactor, ... })`**
- TCSM-wrapped material with fBm puddle mask + ripple normals + sharp
  roughness drop in puddle zones. `rainFactor` is driven by the
  scene-level weather system — the viewer broadcasts to any material
  tagged `userData.wetSurface = true`.

## Quality targets (the bar every water render must hit)

Benchmark against the Arcane Orrery moat, NOT against a primitive
default. The moat demonstrates:
- 128 × 4 ring tessellation (visible ripple displacement at any zoom)
- 1024 × 1024 reflection RT (sharp sky + scene reflection)
- 512² normal map (visible shimmer)
- distortionScale 2.2, speed 1.2, rippleDensity 10
- Sun direction matching scene lighting
- Thin obsidian outer + inner rims to anchor the water visually
- Stone pool floor underneath for transmission depth cues

For **waterfalls**: benchmark against turtlefalls — the tell is vertical
streaks that visibly accelerate down the sheet, foam caps top+bottom,
the sheet fading at horizontal edges, and dense fine droplets (not
chunky balls).

## Anti-patterns — what LLM generations must NOT do

- Thick tube geometry for water streams (reads as a blue noodle).
- Hand-rolled horizontal `PlaneGeometry` / `CircleGeometry` with
  `transmission + opacity: 0.8` for pool water. The auto-filler
  replaces these automatically but the LLM should not produce them.
- `transmission` + `opacity < 0.5` simultaneously — transmission
  requires `opacity: 1.0` for correct refraction.
- Update callbacks writing `waterMesh.rotation.z = time * X` — Euler
  XYZ composition tilts the horizontal disc into vertical.
- Update callbacks writing `mat.map.uniforms.time.value` — `.map` is a
  texture, not a ShaderMaterial. Use the material's own uniforms or
  let `registerShader` advance time automatically.
- Placing the liquid at a hand-picked Y inside a vessel — it will
  float above or below the rim. Use `H.fillLiquid(mesh, ...)` which
  reads the vessel's world transform.

## Cross-links

- `src/components/gen3d/engine.js` — `FLUID.oceanWater`, `FLUID.stream`,
  `FLUID.surface`, `FLUID.upgradeFill`, `FLUID.fountainBasin`, `FLUID.mist`,
  `H.fillLiquid`, `waterMaterial` factory.
- `src/components/ThreeViewer.vue` — `_detectVessels`, `_autoFillVessels`
  (geometry-aware auto-fill logic + stream wiring between stacked vessels).
- `src/skills/threejs/threejs-postprocessing/CHEATSHEET.md` — LLM-facing
  one-pager covering the same water primitives.
