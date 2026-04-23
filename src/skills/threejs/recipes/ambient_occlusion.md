# Ambient Occlusion — N8AO + N8AO-WebGPU

Canonical authors:
- **N8python — `github.com/N8python/n8ao`** (classic WebGL N8AO, what we use)
- **marioandf / Andrew Flowers — `github.com/marioandf/n8ao-webgpu`**
  (WebGPU rewrite, endorsed by N8python)

See also: `_AUTHORS.md`.

## Why N8AO over stock SSAO

N8AO is the best screen-space ambient occlusion implementation in the
Three.js ecosystem:
- Higher quality per sample than stock SSAO or HBAO.
- Temporal accumulation + denoising built in (not common in WebGL AO).
- Half-resolution rendering + depth-aware upsampling (no blocky edges).
- Smart quality tiers (Performance / Low / Medium / High / Ultra).
- Respects `userData.treatAsOpaque` and `userData.cannotReceiveAO` mask
  flags.

## Current integration

The engine uses classic WebGL `N8AOPostPass` inside
`pmndrs/postprocessing`'s `EffectComposer`:

```js
import { N8AOPostPass } from "n8ao";
const n8ao = new N8AOPostPass(this.scene, this.camera, rw, rh);
n8ao.configuration.aoRadius = 0.6;
n8ao.configuration.distanceFalloff = 0.25;
n8ao.configuration.intensity = 3.0;
n8ao.configuration.color = new THREE.Color(0x000000);
n8ao.setQualityMode("High");
composer.addPass(n8ao);
```

Tied to the render-quality toggle (`setRenderQuality`):

| Quality | AO enabled | Quality mode | Intensity |
|---|---|---|---|
| Low | no | — | — |
| Medium | yes | "Low" | 2.0 |
| High | yes | "High" | 2.5 |
| Ultra | yes | "Ultra" | 3.5 |

## N8AO configuration knobs (complete)

- `aoRadius` — world-space search radius. Tune to scene scale. Hero-object
  framing (scenes ~1m diameter) works with 0.6-1.2.
- `distanceFalloff` — distance beyond which AO fades. Keep ≤ aoRadius / 2.
- `intensity` — multiplier on the final AO value. 2-4 gives visible
  contact shadow without over-darkening crevices.
- `color` — AO tint. Default black; warm brown `0x221a14` can read as
  natural earth shadow for outdoor scenes.
- `screenSpaceRadius` — if true, radius is in pixels not world units.
  Useful for scenes with wildly varying scales.
- `halfRes` — render AO at half resolution with depth-aware upsample.
  Major perf win at visible quality cost.
- `setQualityMode("Performance" | "Low" | "Medium" | "High" | "Ultra")`
  — preset trade-offs for AO samples + denoise samples (8/16/16/64/64 and
  4/4/8/8/16 respectively).

## Mask flags (worth backporting from WebGPU version)

`n8ao-webgpu` introduces two new per-mesh userData flags:
- `userData.treatAsOpaque = true` — transparent / alpha-tested mesh should
  still occlude its background. Useful for foliage cards.
- `userData.cannotReceiveAO = true` — emissive heroes, sky domes, water
  surfaces — don't darken them.

These are **not in the current classic N8AO** but worth patching in for
emissive-heavy scenes like the orrery. Without `cannotReceiveAO`, the
nebula core orb can pick up subtle AO darkening where the armillary rings
cross in front of it, which reads wrong.

## WebGPU migration (`n8ao-webgpu`)

marioandf's `n8ao-webgpu` is the future-facing choice. It uses `three/webgpu`'s
TSL + `PostProcessing` pipeline. **Not compatible with our current
`pmndrs/postprocessing` EffectComposer** — requires full WebGPU pipeline
migration.

Status in the engine: **not adopted yet**. Tracked as a follow-up for when
we migrate to Bruno-Simon-style WebGPU TSL rendering. The WebGPU version
is small (~900 LoC) and maps 1:1 from the WebGL API; porting won't be
hard once the underlying renderer is WebGPU.

## Failure modes we've hit

### 1. MSAA + N8AO → GL_INVALID_OPERATION during blit
N8AO needs a non-MSAA depth texture. Configure the composer with
`multisampling: 0` and let SMAA (later in the chain) handle AA. This
was a painful debug session.

```js
const composer = new EffectComposer(this.renderer, {
  multisampling: 0,                 // CRITICAL: not 4
  frameBufferType: THREE.HalfFloatType,
});
```

### 2. `useProgram: program not valid` during Water reflection
Not an N8AO issue per se, but debugging it was complicated by the AO pass
also failing silently. Root cause was our height-fog chunk override —
fixed by gating the custom fog code behind `#ifdef USE_HEIGHT_FOG`.

### 3. AO intensity > 5 + threshold too low → scene goes black
The combination of Ultra quality + 5.0 intensity on a low-threshold bloom
setup can wipe out all mid-tone detail. Cap Ultra at 3.5 intensity.

## Anti-patterns

- **Running N8AO on the final composite after tonemap** → AO darkens
  LDR values inconsistently. AO must run in HDR linear space, BEFORE
  bloom.
- **AO with `aoRadius` matching the camera distance** → looks like a
  "shadow tint" over the whole scene. Keep aoRadius in world units
  matching the smallest contact detail (~0.5m for human-scale, ~0.05m
  for miniature scenes).
- **Ignoring mask flags** → emissive heroes get darkened, water receives
  AO, sky dome gets AO. All wrong. Tag them with `cannotReceiveAO` once
  we backport the flag.
