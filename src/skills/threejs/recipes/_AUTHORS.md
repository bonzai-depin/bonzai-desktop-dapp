# Author Index — techniques referenced across the BonzAI 3D engine

This file is the canonical go-to when you need to (re)locate the primary sources
of a technique. Every recipe in `src/skills/threejs/recipes/*.md` cites back to
one or more of these authors; every cited author is documented here with their
portfolio URL, key repos, and which engine primitive(s) they influenced.

If you add a new author reference anywhere in the codebase, add them here.

---

## Bruno Simon — `brunosimon` on GitHub
- **Portfolio (playable)**: https://bruno-simon.com
- **Key repo**: https://github.com/brunosimon/folio-2025
- **Engine contributions**: weather aggregator pattern, RainLines, Snow
  accumulation, Lightnings, Tornado, DayCycles, Wind uniform, cheap DOF,
  WebGPU TSL rendering architecture.
- **Notable files**:
  - `sources/Game/Weather.js` — property aggregator with overrides
  - `sources/Game/World/RainLines.js` — 2K instanced line quads morphing
    rain↔snow via length/speed lerp
  - `sources/Game/World/Snow.js` — ping-pong RT heightmap for snow
    accumulation + footprint/vehicle tracks
  - `sources/Game/World/Lightnings.js` — three-phase particle cascade
    (anticipation → arc → explosion)
  - `sources/Game/Cycles/DayCycles.js` — keyframed day/dusk/night/dawn
  - `sources/Game/Wind.js` — central `wind.offsetNode` consumed by any mesh
  - `sources/Game/Passes/cheapDOF.js` — tilt-shift DOF via hashBlur
  - `readme.md` — **game-loop ordering numbers (0 → 13)**

## Faraz Shaikh — `FarazzShaikh` on GitHub (demos under `Faraz-Portfolio`)
- **Portfolio**: https://farazzshaikh.com/demos
- **Key repos**:
  - https://github.com/Faraz-Portfolio/demo-2023-rain-puddle
  - https://github.com/Faraz-Portfolio/demo-2024-a-storm-at-midnight
  - https://github.com/Faraz-Portfolio/demo-2025-raymarch-clouds
  - https://github.com/Faraz-Portfolio/demo-2022-pseudo-height-fog
  - https://github.com/Faraz-Portfolio/demo-2023-stylized-water
  - https://github.com/FarazzShaikh/THREE-CustomShaderMaterial (TCSM)
  - https://github.com/FarazzShaikh/glNoise (shared GLSL noise)
  - https://github.com/FarazzShaikh/three-shader-baker
- **Engine contributions**: TCSM foundation, glNoise primitives, wet-surface
  material (rain puddles + ripples), pseudo height fog shader chunk
  override, volumetric cloud pipeline (4-FBO Perlin-Worley system),
  lightning intensity noise spike, grass wind sway, rain drop billboard
  pattern + splash flipbook pattern, planar-reflection Mirror camera.
- **Notable files**:
  - `demo-2025-raymarch-clouds/src/Clouds/CloudsRenderer/index.tsx` —
    4-FBO cloud pipeline (Perlin-Worley 128³ + Worley 32³ + curl 128² +
    weather envelope 256²)
  - `demo-2024-a-storm-at-midnight/src/components/Road/MirrorMaterial.tsx`
    — wet-road shader with planar reflection
  - `demo-2024-a-storm-at-midnight/src/components/Rain/Drops/index.tsx` —
    2000 instanced rain-drop billboards with 5× repeated SDF capsule
  - `demo-2023-rain-puddle/src/Floor/PuddleMaterial.tsx` — fBm puddle mask
    + concentric-ring ripple normals via TCSM patchMap
  - `demo-2022-pseudo-height-fog/src/lib/Fog.tsx` — SDF-boxed FBM height
    fog via global `THREE.ShaderChunk.fog_*` override

## Anderson Mancini — `ektogamat` on GitHub
- **Portfolio**: https://andersonmancini.dev
- **Neotix lab**: https://www.neotix.com.br/en/lab
- **Key repos**:
  - https://github.com/ektogamat/lensflare-threejs-vanilla
  - https://github.com/ektogamat/R3F-Ultimate-Lens-Flare
  - https://github.com/ektogamat/fake-glow-material-threejs
  - https://github.com/ektogamat/threejs-vanilla-holographic-material
  - https://github.com/ektogamat/christmas-threejs
  - https://github.com/ektogamat/mesh-reflector-setup
  - https://github.com/ektogamat/AutoFocusDOF
  - https://github.com/ektogamat/mesh-transition-material
  - https://github.com/ektogamat/webgpu-impostors
  - https://github.com/ektogamat/threejs-particle-skull
- **Engine contributions**: Ultimate Lens Flare pass (real raycast
  occlusion, ghost chain, anamorphic streak), fake-glow fresnel shell
  (`MAT.fakeGlow`, `FX.withGlow`), holographic material (hologram v2
  shader: scanlines + signal wave + blink), "cozy" post-FX preset,
  god-ray cone technique inspiration.

## Andrew Flowers / marioandf — WebGPU ambient occlusion
- **Key repo**: https://github.com/marioandf/n8ao-webgpu
- **Upstream**: https://github.com/N8python/n8ao (N8python — original)
- **Engine contributions**: Ambient occlusion quality tiers (Performance /
  Low / Medium / High / Ultra), userData mask flags
  (`treatAsOpaque`, `cannotReceiveAO`).
- **Status**: WebGPU-only; not adopted yet. We use classic N8AO WebGL via
  `N8AOPostPass` in `pmndrs/postprocessing`'s composer. Bookmarked for the
  future WebGPU migration.

## N8python — classic N8AO (WebGL)
- **Key repo**: https://github.com/N8python/n8ao
- **Engine contributions**: the `N8AOPostPass` we render in the composer
  before bloom — single biggest perceptual upgrade the engine has.

## pmndrs (Paul Henschel et al.)
- **Postprocessing**: https://github.com/pmndrs/postprocessing
- **Engine contributions**: the entire post-process composer, merged-pass
  architecture, `BloomEffect`, `DepthOfFieldEffect`, `SMAAEffect`, the
  `Effect` subclass API that wraps our custom FX.

## gkjohnson — three-mesh-bvh
- **Key repo**: https://github.com/gkjohnson/three-mesh-bvh
- **Engine contributions**: `acceleratedRaycast` + `boundsTree` on any
  mesh with >500 triangles. Lens-flare occlusion sweep 10-100× faster.

## turtlefalls (unknown author, observed demo)
- **Demo**: https://turtlefalls.vercel.app
- **Engine contributions**: visual target for the stylized waterfall
  shader (vertical streak pattern, foam caps, edge fade, many small
  droplets). See `water.md` for engine implementation.

## water-simulation (Faraz Shaikh)
- **Demo**: https://water-simulation.vercel.app
- **Engine contributions**: benchmark water quality for `FLUID.oceanWater`;
  planar reflection + refraction + Fresnel + Gerstner + depth-fade foam.
