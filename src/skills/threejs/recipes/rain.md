# Rain — particle streaks + splashes + wet surfaces

Canonical authors:
- **Bruno Simon — `RainLines.js`** (best technique)
- **Faraz Shaikh — `demo-2024-a-storm-at-midnight/src/components/Rain/*`**
  (drops + splashes + mirror road)
- **Faraz Shaikh — `demo-2023-rain-puddle/src/Floor/PuddleMaterial.tsx`**
  (puddle ripples)

See also: `_AUTHORS.md`, `weather_system.md`, `wet_ground.md`, `lightning.md`.

## Technique A — Instanced line-strip rain (Bruno, `RainLines.js`)

**This is the best rain renderer we've seen.** Replaces naive per-particle
billboards with 2048 instanced line quads that wrap around the camera for
infinite rain at constant cost. Morphs into snow via length/speed lerp.

Key implementation details:
- **2048 instanced line quads**, each a 4-vertex strip authored as two
  vertices at the top + two at the bottom of a vertical line with
  per-vertex offset (0/1) used in the vertex shader to generate thickness.
- Per-line attributes: `position` (base XZ), `offset` (0/1 thickness), `random` (seed 0-1).
- **Camera-wrap in vertex shader**: `mod(pos.xz + halfSize, size) - halfSize`
  centers the tile on the camera. Rain never regenerates regardless of
  camera travel.
- Per-line progress: `progress = (localTime + random * 99) % 1`. Drives
  `lineHeight = elevation + length - progress * (length + padding)` clamped
  to the ground.
- `visibleRatio = pow(weather.rain, 2)` → lines below the threshold
  are stochastically hidden: `if (step(visibleRatio, fract(random * 99))) discard`.
- `incline.xz = windTangent * -pos.y * incline` makes rain slant with wind.
- **Rain-to-snow morph in the same mesh**: when `weather.snow` rises,
  `length = lerp(1-3, 0.03, snowRatio)` and `speed = lerp(0.2-0.4, 0.05,
  snowRatio)`. Swap the texture to a small white dot and the same system
  renders snow.

Shader outline (conceptually):
```glsl
// vertex
attribute vec3 aPosition;    // base XZ
attribute float aOffset;      // 0 or 1 (thickness picker)
attribute float aRandom;      // seed

uniform float uTime;
uniform float uLineLen;       // morphs rain→snow
uniform float uLineSpeed;
uniform float uVisibleRatio;  // pow(rain, 2)
uniform vec3  uCameraPos;
uniform vec3  uHalfTile;

void main() {
  // Wrap to camera
  vec3 wrapPos = aPosition;
  wrapPos.xz = mod(aPosition.xz - uCameraPos.xz + uHalfTile.xz, uHalfTile.xz * 2.0) - uHalfTile.xz + uCameraPos.xz;

  // Fall progress
  float t = fract(uTime * uLineSpeed + aRandom * 99.0);
  float yTop = uLineLen + 0.5;
  float yCur = mix(yTop, 0.0, t);

  // Stochastic visibility
  if (step(uVisibleRatio, fract(aRandom * 99.0)) > 0.5) {
    gl_Position = vec4(0.0); return;
  }

  vec3 p = wrapPos;
  p.y += yCur + (aOffset - 0.5) * uLineLen;   // place both ends of the line
  // lateral incline with wind
  p.xz += uWindDir.xz * -p.y * uIncline;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}

// fragment — solid white / soft alpha
```

### Why this beats naive particles
- Zero per-frame CPU work (all GPU instanced).
- Constant count regardless of camera motion (no respawn loops).
- Morphs to snow without rebuilding geometry.
- 60 FPS at 2K+ lines.

### Adoption in BonzAI engine
**Current state**: `ThreeViewer.vue` uses naive `THREE.Points` with per-frame
CPU position updates + respawn at camera-centered box. Works but taps CPU
and has rain-specific code distinct from snow.

**Upgrade path**: port `RainLines.js` to vanilla WebGL as
`src/engine/weather/RainLines.js`. Use `THREE.InstancedBufferGeometry` +
`InstancedMesh` pattern. `LineSegments` + `ShaderMaterial`. ~200 LoC.

## Technique B — Instanced drop billboards (Faraz, `Rain/Drops`)

Used when you want closer, larger, more visible drops that cast streaks
past the camera (car window / helmet POV feel). Good for close-up hero
shots, not scene-wide rain.

Key code:
- **count = 2000**, each instance camera-facing via `THREE.InstancedMesh`.
- Custom fragment uses a **`sdUnevenCapsule` SDF**, repeated 5× via a
  `blur()` function that sums shifted copies (`for(0..5) { acc += sdf(uv + offset_i) }`).
  This creates the streak tail with a single fragment shader invocation.
- Fall at 5 u/s, respawn inside a 5×5×5 box, 20° random angle variance.
- `uRainProgress` fades in/out (smoothstep weather.rain).

## Technique C — Splashes (Faraz, `Rain/Splashes`)

Flipbook animation on the ground.
- **count = 1000** instanced quads.
- 4×5 flipbook sprite atlas (`Splash.png` — frames of a splash ring
  expanding and fading).
- UV selection by progress: `getFlipbookUv(progress, frames=20, cols=4, rows=5)`.
- Each splash lives for ~1s, respawns at a random point on the ground
  (raycast downward from camera projection or from an XY grid).

### Adoption in BonzAI
Ship a small `SHADER.rainSplashes({ bounds, count })` primitive that
reuses a bundled flipbook PNG. Positions re-seeded every cycle via raycast
against the main scene. Already partially served by existing `H.splash`
helper — verify it matches Faraz's flipbook quality.

## Technique D — Wet surfaces

See `wet_ground.md` for full detail. Summary: `SHADER.wetSurface` wraps any
MeshPhysicalMaterial with a CSM patch that carves procedural puddle zones
from fBm, generates radial ripple normals inside them, and drops roughness
to 0.08 in wet spots. `uRainFactor` driven by the weather system.

## Storm composition (Faraz, `demo-2024-a-storm-at-midnight`)

The scene composition itself is worth mirroring:
- HDR environment map with pre-bound `Lightformer` circles for window warmth
  — gives the street a "lit from windows" feel without placing actual lights.
- Additive bloom threshold = 2 (nothing blooms except genuine highlights).
- `BrightnessContrast` as the only grade adjustment.
- Rain + lightning + wet mirror road + grass wind + positional thunder
  audio — ALL driven by a single weather/time controller. Same pattern as
  Bruno's folio.

## Current engine implementation

- `ThreeViewer.vue :: setupWeatherSystem` — allocates rain/snow/splash
  particle pools.
- `ThreeViewer.vue :: startRenderLoop` — per-frame particle updates
  (simple gravity + respawn).
- `ThreeViewer.vue :: setScreenDroplets` — lens-droplet post-FX pass.
- `ThreeViewer.vue :: setHeightFog` — Faraz's pseudo-height-fog chunk
  override, used by rainy/stormy presets.

## Anti-patterns

- **Raw `THREE.Points` at 500+ particles with per-frame CPU respawn** →
  eat CPU. Use instanced line quads or InstancedMesh quads.
- **Per-particle geometry** (cylinders, capsules) → draw-call explosion.
- **Rain that doesn't follow the camera** → players outrun the rain box.
  Always wrap-to-camera in the vertex shader.
- **Hardcoded rain density** → the weather aggregator should own it.
