# Portfolio patterns — architecture lessons from Bruno Simon's folio-2025

Canonical author: **Bruno Simon — `brunosimon/folio-2025`**
Live demo: https://bruno-simon.com

See also: `_AUTHORS.md`, `weather_system.md`.

## Why this repo matters

Bruno's `folio-2025` is a **playable WebGPU-native portfolio** running at
60 fps with:
- A vehicle physics simulation,
- A full year-time weather system,
- Rain, snow, lightning, tornado as interleaved systems,
- Volumetric-ish water surfaces, animated grass + foliage,
- Tilt-shift cheap DOF + bloom post,
- HDR assets + full day/dusk/night/dawn cycling.

The most valuable takeaways are **architectural** — how he organizes a
complex, stateful, interactive 3D scene with many interdependent systems.

## Lesson 1 — Property aggregator + override pattern

Every piece of dynamic state lives as a `Property` object:
```js
class Property {
  constructor({ min, max, value, weight }) {...}
  overrideValue = undefined
  overrideTween = null
  get() {
    if (this.overrideValue !== undefined) return this.overrideValue
    return clamp(this.value, this.min, this.max)
  }
  override(value, duration) {
    gsap.to(this, { overrideValue: value, duration })
  }
}
```

Used for `weather.humidity`, `dayCycles.lightIntensity`, `wind.strength`,
etc. **Every visual subsystem reads `.get()` — nothing owns its own state.**

Scripted events (tornado, cinematic strike, UI transition) call
`property.override(newValue, duration)` to force a value with a tween.
After duration elapses, it reverts to the derived value.

**Our engine adoption**: Currently `ThreeViewer.vue` applies bulk preset
snapshots via `applyWeatherPreset(mode)`. Each call hard-sets every
property. For smooth transitions (dry → rainy over 5 seconds), we'd
introduce `Property.override` with a GSAP tween.

## Lesson 2 — Game-loop priority ordering

Bruno's README lists update priorities 0-13. The key insight:
**state first, then systems that read state**.

```
 0  Time, Inputs
 1  Player (pre-physics)
 2  Vehicle (pre-physics)
 3  Physics step
 4  Objects / Wireframe debug
 5  Vehicle (post-physics)
 6  Player (post-physics)
 7  View (camera controller)
 8  DayCycles, YearCycles, Weather
 9  Wind, Lighting, Tornado
10  Area, Foliage, Fog, Reveal, Terrain, Trails, Floor, Grass, Leaves,
    Lightnings, RainLines, Snow, WaterSurface
13  InstancedGroup
```

Weather at 8 (before any consumer), wind at 9 (reads weather), everything
visual at 10 (reads weather + wind). No subsystem tries to read state
that hasn't been updated this frame.

**Our engine today**: the render loop has an implicit ordering — physics
step → scene updates → post-FX. No explicit priority system. For the
refactor: introduce a `systems` array with `{ priority, update(dt) }`
objects sorted each frame.

## Lesson 3 — Shared uniform pattern (`wind.offsetNode`)

Bruno has ONE wind object that exposes a TSL function:
```js
wind.offsetNode = Fn(([position]) => {
  return vec2(offset).mul(wind.strength * perlin3d(position))
})
```

Every vertex shader that needs wind (grass, foliage, rain incline, water
ripple) imports and calls `wind.offsetNode(positionWorld)`. Single source
of truth, no desync, no per-material wind uniforms.

**Our engine equivalent** (when we get there): export a `WindSystem` that
owns a single THREE.Vector3 `offsetAt(position, time)` computed in JS +
mirrored uniform on the GPU. Every material that wants wind pulls that
uniform through a shared onBeforeCompile patch.

## Lesson 4 — DayCycles as the single lighting controller

Rather than each light having its own animation:
```js
dayCycles.current = { lightColor, lightIntensity, shadowColor, fogColorA,
  fogColorB, fogNearRatio, fogFarRatio, revealColor, revealIntensity,
  electricField, temperature }
```

Interpolated across keyframes at stops `0.0 / 0.15 / 0.25 / 0.35 / 0.6 /
0.8 / 0.9` with a 4-minute loop (so testing all times of day takes 4 min,
not a real 24h).

Every light/fog/visual system reads `dayCycles.current.*` instead of
having its own day/night state.

**Our engine today**: the Lighting panel offers sunrise/day/afternoon/
sunset/night as discrete presets via `setTimeOfDay(mode)`. Each preset
hard-applies values. No interpolation.

**Potential upgrade**: add `dayProgress ∈ [0, 1]` as a continuous value;
lerp between adjacent presets each frame. Full smooth day/night cycle
with no extra shader changes.

## Lesson 5 — Render-to-texture pattern

Bruno uses ping-pong RTs for:
- Snow heightmap accumulation (read last frame, write this frame).
- Vehicle wheel tracks (write-only accumulation; no read).
- Water surface displacement from splashes.

Three.js primer:
```js
const rtA = new THREE.WebGLRenderTarget(256, 256, { type: HalfFloatType });
const rtB = rtA.clone();
let [read, write] = [rtA, rtB];
function update(dt) {
  shaderMat.uniforms.tPrev.value = read.texture;
  renderer.setRenderTarget(write);
  fullscreenQuad.render(renderer);
  renderer.setRenderTarget(null);
  [read, write] = [write, read];
}
```

Costs: two RTs at the given resolution. For 256² HalfFloat single-channel,
~0.5 MB each. Single render per frame. Suitable for anything requiring
"remember yesterday" state (accumulation, decay, smoothing).

## Lesson 6 — Scripted events via weather.override

Tornados, cinematic storms, portal openings are all just:
```js
weather.override.start({
  humidity: 1,
  clouds: 1,
  wind: 1,
  electricField: 1,
}, 5.0)   // 5 second transition
dayCycles.override.start({
  lightColor: new Color("pink"),
  fogColorA: new Color("red"),
}, 5.0)
```

When the timer expires, everything fades back. No per-event lighting
setup, no per-event fog override — the override system handles it.

## Lesson 7 — Separate Rapier physics from visual state

Physics bodies (Rapier) are the authoritative source for position +
rotation. Visual meshes read `body.translation()` / `body.rotation()` each
frame. Never write to body transforms from visual code; only via Rapier's
API (`setLinvel`, `applyImpulse`, etc.).

Our engine already follows this — `engine.js :: P.init()` registers an
update callback that reads body → writes mesh.

## Lesson 8 — Per-mesh auto-instancing (`InstancedGroup`)

Bruno's `InstancedGroup` wraps any `THREE.Group` and auto-promotes
repeated child meshes (same geometry + material) into `InstancedMesh`.
Single draw call per unique material.

Our engine has `FX.batch([meshes])` for explicit batching, but no
auto-instancing wrapper. Worth adding for LLM-generated scenes that
include repetitive props (crystals, tiles, petals).

## Lesson 9 — Quality tiers as multipliers

`folio-2025` exposes `qualityLevel: 0 | 1 | 2` that:
- Toggles DOF (on at level 0+, off at 2).
- Halves bloom RT (at 1+).
- Reduces cloud raymarch steps (at 2 only).
- Disables snow accumulation shader (at 2 only).

**Our engine today** has `setRenderQuality("low" | "medium" | "high" |
"ultra")` that already follows this pattern. Good.

## Lesson 10 — Sub-1ms physics via Rapier WASM

Rapier 3D compiled from Rust to WASM runs a full vehicle simulation +
multiple ragdolls at sub-millisecond cost on mid-range laptops. Don't
use Cannon-es or Ammo.js for anything new.

Our engine uses `@dimforge/rapier3d-compat` — same lineage.

## Integration priorities for BonzAI

Phase 1 (~20 hrs, high-impact):
1. Introduce `WeatherSystem` property aggregator.
2. Port `RainLines` to WebGL (replaces current Points-based rain).
3. Lightning refactor: three-phase + noise-driven intensity.
4. Add lens flare (already done — ours).
5. Rain splashes with flipbook atlas.

Phase 2 (~25 hrs):
1. Volumetric cloud pipeline (`VolumetricClouds.js`).
2. Wet-ground material with planar reflection (`FX.wetMirror`).
3. DayCycles interpolation + shared fog driver.
4. Shared Wind uniform.

Phase 3 (deferred):
1. Snow accumulation heightmap.
2. WebGPU migration → `n8ao-webgpu`, TSL water, TSL bloom.
3. Cheap DOF tilt-shift pass.
