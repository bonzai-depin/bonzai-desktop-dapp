# Fog — pseudo height fog + swirling FBM

Canonical author: **Faraz Shaikh — `demo-2022-pseudo-height-fog/src/lib/Fog.tsx`**

See also: `_AUTHORS.md`, `weather_system.md`, `clouds.md`.

## The technique

Three.js has a `FogExp2` uniform fog that multiplies fragment color by
`exp(-density² · depth²)`. That's a FLAT fog — no spatial variation.

Faraz's pseudo-height-fog overrides `THREE.ShaderChunk.fog_fragment`,
`fog_pars_fragment`, `fog_pars_vertex`, and `fog_vertex` GLOBALLY at boot
so every material automatically picks up:

1. **Height-bounded fog region** via an SDF box (`sdBox`) — fog only inside
   the AABB specified by `uFogBoundsMin/Max`. Outside the box, no fog.
2. **Animated FBM density** — `FBM(p + FBM(p + uFogDirection · uFogTime ·
   uFogScale))` for domain-warped swirling density. The `uFogDirection`
   vector makes the fog visibly drift (wind).
3. **Per-material uniform injection** — traverse the scene, monkey-patch
   each material's `onBeforeCompile` to merge the custom fog uniforms
   into its shader. Gated by a `USE_HEIGHT_FOG` define so materials that
   shouldn't use it (water reflectors, internal three-js materials) skip
   the custom path and use stock FogExp2.

## Current engine implementation

Already adopted. See `ThreeViewer.vue :: setHeightFog`.

Key points:
- The override is installed ONCE on `THREE.ShaderChunk` (on first call).
- Every generated scene's materials are patched via `autoEnhanceObject`
  (set `defines.USE_HEIGHT_FOG = ""` + inject uniforms).
- `_heightFog.uniforms.uFogTime.value = t` is advanced each frame in the
  render loop.
- The weather system drives `setHeightFog({ color, density, distortion,
  direction })` through `applyWeatherPreset`.

## Weather preset → fog config mapping (current)

| Mode | density | distortion | color | direction |
|---|---|---|---|---|
| sunny | 0 | — | — | — |
| cloudy | 0.008 | 0.6 | `0x9ba3b0` | slow |
| rainy | 0.02 | 0.9 | `0x545b68` | medium |
| stormy | 0.028 | 1.2 | `0x2a303a` | fast |
| snowy | 0.015 | 0.7 | `0xd6dce4` | slow |
| blizzard | 0.038 | 1.1 | `0xc0c8d2` | very fast |
| foggy | 0.045 | 1.4 | `0x8a94a3` | almost still |

## Shader contract

```glsl
// fog_pars_fragment (patched)
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  #ifdef USE_HEIGHT_FOG
    varying vec3 vFogWorldPos;
    uniform float uFogTime;
    uniform float uFogDistortion;
    uniform float uFogScale;
    uniform vec3  uFogDirection;
    uniform vec3  uFogBoundsMin;
    uniform vec3  uFogBoundsMax;
    uniform float uFogBoundsActive;
    // + FBM helpers + sdBox
  #endif
#endif

// fog_fragment (patched)
#ifdef USE_FOG
  #ifdef USE_HEIGHT_FOG
    vec3 samp = vFogWorldPos * uFogScale + uFogDirection * uFogTime;
    float d1 = fbmFog(samp);
    float d2 = fbmFog(samp + vec3(d1 * 2.0));
    float heightK = clamp(1.0 - vFogWorldPos.y * 0.08, 0.0, 1.0);
    float noiseMul = mix(1.0, d2 * 1.6, uFogDistortion);
    #ifdef FOG_EXP2
      float rawFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float rawFog = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    float fogFactor = rawFog * noiseMul * heightK;
    if (uFogBoundsActive > 0.5) {
      vec3 center = 0.5 * (uFogBoundsMin + uFogBoundsMax);
      vec3 half_  = 0.5 * (uFogBoundsMax - uFogBoundsMin);
      float dIn = -sdBoxF(vFogWorldPos - center, half_);
      fogFactor *= smoothstep(0.0, 1.0, dIn);
    }
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
  #else
    // stock FogExp2 — fallback for unpatched materials
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
#endif
```

**The `USE_HEIGHT_FOG` define is critical.** Without it, every material
(including Water's internal reflector materials) would compile the custom
fog branch and reference undeclared uniforms → `useProgram: program not valid`
spam at 60 Hz.

## Failure modes we've hit (and fixed)

1. **Water reflection materials don't get uniforms** — the first version
   overrode chunks globally without define-gating. Water's internally-cloned
   materials compiled the custom fog path with no uniforms → program invalid.
   Fixed by wrapping in `#ifdef USE_HEIGHT_FOG` and only setting the define
   on materials our patcher touches.
2. **Uniforms advance via the composer update loop** — not via
   `registerShader` because not all fog materials are registered shaders.
   The render loop directly writes `uFogTime.value = t` each frame.
3. **Scene traversal on every weather change** — OK for one-time setup
   but expensive if called every frame. `_patchMaterialsForHeightFog`
   is only called when the override is first installed; `autoEnhanceObject`
   patches new materials as they're added.

## Anti-patterns

- **Globally override `THREE.ShaderChunk` without a define guard** →
  third-party materials (Water, OutlinePass internals) crash on compile.
- **Tie fog color to ambient light color** — fog doesn't follow ambient;
  it follows atmospheric conditions. Keep `fogColor` independent of
  `ambient.color`.
- **Fog density > 0.05** → scene becomes pea soup at any distance.
  Keep density in [0, 0.045] for readability.
- **Set `uFogTime` only in the weather system** → fog freezes when the
  weather isn't actively changing. Advance in the render loop.
