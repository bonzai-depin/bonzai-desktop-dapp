# Lens flare — sun/emissive pass

Canonical author: **Anderson Mancini — `ektogamat/lensflare-threejs-vanilla`**
Also: `ektogamat/R3F-Ultimate-Lens-Flare` (R3F version, same shader).

See also: `_AUTHORS.md`, `clouds.md` (sun position source).

## The target look

Anderson Mancini's portfolio at **https://andersonmancini.dev** is the
definitive lens flare reference for Three.js. Key visual components:
- **Central glare** — soft halo centered on the sun/emissive source.
- **Ghost chain** — 6-8 offset copies of the sun at shrinking scale, tinted
  differently, along a line through the center of the screen.
- **Anamorphic streak** — a horizontal bright line indicating wide-aperture
  lens dispersion.
- **Hexagonal artifacts** — star-burst ghosts shaped like camera iris.
- **Star burst** — radial rays rotating slowly around the sun.
- **Rainbow HSV spectrum** — chromatic fringe on the ghosts.
- **Lens dirt modulation** — low-frequency screen-space texture amplifies
  or dims the flare based on where the camera is pointed. Looks like dust
  on the lens.

## The shader (`src/LensFlare.js`, 589 LoC)

Built as a `ShaderPass` for `pmndrs/postprocessing`-compatible
`EffectComposer` usage. Single-file vanilla JS.

Core fragment shader based on **ShaderToy 4sX3Rs** (Benjamin
"BLaKKed") + **XtKfRV** (LeWloup).

Key sub-functions:
- `drawflare(uv, sunPos, rainbow)` — main flare draw, blends central glare
  + ghost chain + halo.
- `glare(d, intensity, tint)` — single-ghost scalable rim glow.
- `sdHex(uv)` — SDF for hexagonal ghosts (iris-shaped artifacts).
- Rainbow spectrum — HSV rotation via cos/sin.

### Uniforms
```
uniform vec2  uLensPosition;        // sun in NDC (-1..1)
uniform float uGlareSize;            // central halo scale
uniform float uFlareSize;            // ghost scale multiplier
uniform float uFlareSpeed;           // star-burst rotation
uniform float uHaloScale;
uniform float uStarPoints;           // number of rays
uniform bool  uAnimated;
uniform bool  uAnamorphic;           // horizontal streak on/off
uniform bool  uSecondaryGhosts;      // additional ghost ring
uniform bool  uStarBurst;
uniform float uGhostScale;
uniform bool  uAdditionalStreaks;
uniform bool  uFollowMouse;          // useful for UI or debug
uniform float uOpacity;
uniform vec3  uColorGain;            // master tint
uniform sampler2D uDirtTexture;      // lens dirt (16:9 low-res)
```

### Blend modes
Via `postprocessing.BlendFunction`:
- `NORMAL` — default, replaces color.
- `ADD` — additive for subtle bloom interaction.
- `PIN_LIGHT` — classic "Optical Flares" After Effects look.
- `OVERLAY` — strong contrast punch.

## Integration with BonzAI engine

**Current state**: engine has its own `LensFlareEffect` Effect subclass in
`ThreeViewer.vue` (inspired by Mancini but custom). Used by the orrery
default scene via `setLensFlare({ position, strength, occlusionTest })`.
Real raycast occlusion via the `_rayOcclusion` method (hardened against
null matrixWorld, sprites, transmission materials). BVH-accelerated
thanks to three-mesh-bvh patches.

**Decision**: keep our custom Effect — it's integrated with:
- `occlusionTest: true` → raycast against the scene every frame.
- Fallback ambience pass auto-sets lens flare on the brightest emissive
  hero when the generated scene didn't specify one.
- Strength tied to the render-quality preset.

Mancini's `lensflare-threejs-vanilla` is worth reading for:
- The rainbow HSV spectrum implementation if we want to add it to our
  existing shader.
- Lens dirt texture modulation — we don't have this yet. Adding a low-res
  16:9 "lens dirt" texture (subtle spots + smudges) that modulates the
  final flare intensity by `texture2D(uDirt, uv).r` would add a layer of
  realism. Cost: one sampler bind + one multiply.
- Hexagonal ghost SDF — more authentic than our circular ghosts.

## Real-world sun positions

If the scene has a `DirectionalLight` playing the role of sun, the lens
flare's world position is:
```js
const sunWorld = new THREE.Vector3()
  .subVectors(light.position, light.target.position)
  .normalize()
  .multiplyScalar(100)
  .add(this.camera.position);   // 100 units in the light's forward direction
```

For generated scenes with a specific emissive hero, use that mesh's world
position directly (fallback ambience does this).

## Anti-patterns

- **Running a full-res post pass for the lens flare** — it can be
  half-res and upsampled for 40% cost savings with no visible difference.
- **Fixed flare strength regardless of sun visibility** — use raycast
  occlusion (`occlusionTest: true`) so the flare dims when something
  passes in front of the sun. Massively improves realism.
- **Flare always at screen center** — project the sun's world position
  every frame; allow it to go off-screen cleanly (no flare when the sun
  isn't in view).
- **No blend mode option** — different scene palettes need different
  blends. Expose `blendFunction` on `setLensFlare({...})`.
