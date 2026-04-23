# Clouds — volumetric raymarch, density, lighting

Canonical author: **Faraz Shaikh — `demo-2025-raymarch-clouds`**
Inspired by **Guerrilla Games' "Nubis Evolved"** cloud system (Horizon Zero
Dawn / Horizon Forbidden West).

Key files to re-read:
- `Faraz-Portfolio/demo-2025-raymarch-clouds/src/Clouds/CloudsRenderer/index.tsx`
- `.../materials/CloudMaterial/index.ts`
- `.../materials/shaders/rayMarch.ts`
- `.../shaders/worley.ts`, `.../shaders/perlin.ts`

See also: `_AUTHORS.md`, `weather_system.md`, `fog.md`.

## The pipeline (4 FBOs + one full-screen raymarch)

```
textureA3D (128³)       — Perlin-Worley 4-channel base noise (RGBA = 4 FBM octaves)
textureB3D (32³)         — high-freq Worley FBM detail
textureC2D (128²)        — curl noise for wind advection
textureEnvelope (256²)   — weather map: min height, max height, cloud type (stratus/cumulus/cumulonimbus), density
textureScene (half res)  — scene color + depth for occlusion
textureCloud (half res)  — cloud output
```

All 3D textures generated ONCE at init using a `FullScreenQuad` that iterates
per-depth-slice via `renderer.setRenderTarget(fbo3d, sliceIndex)`. The weather
envelope is regenerated whenever weather properties change.

## Per-frame render sequence

```js
// 1. Render scene to scene FBO (includes depth)
renderer.setRenderTarget(textureScene);
renderer.render(scene, camera);

// 2. Composite clouds at HALF resolution, sampling scene depth so clouds
//    correctly occlude/are-occluded-by opaque geometry
renderer.setRenderTarget(textureCloud);
renderer.autoClear = false;
cloudMaterial.uniforms.sceneDepth.value = textureScene.depthTexture;
fullScreenQuad.render(renderer);  // runs CloudMaterial fragment

// 3. Composite result on screen via additive RenderMaterial
renderer.setRenderTarget(null);
compositeMaterial.uniforms.scene.value = textureScene.texture;
compositeMaterial.uniforms.clouds.value = textureCloud.texture;
fullScreenQuad.render(renderer);
```

Half-res cloud rendering is the big perf lever. Quarter-res also works but
looks blocky on the edges.

## The raymarch (CloudMaterial fragment shader)

```glsl
#define MAX_STEPS 64
#define STEP 0.2

float march(vec3 ro, vec3 rd, float tMin, float tMax, vec3 sunDir) {
  float accum = 0.0;     // transmittance (1 = clear, 0 = opaque)
  float lum   = 0.0;     // accumulated luminance
  vec3 p = ro + rd * tMin;
  float step = STEP;
  float t = tMin;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (t > tMax) break;
    float d = getCloudDensity(p);           // [0, 1]

    // Adaptive step — halve step size when inside a cloud
    step = mix(STEP, STEP * 0.5, smoothstep(0.0, 0.1, d));

    if (d > 0.01) {
      // Secondary march toward the sun to accumulate self-shadowing
      float sunDepth = marchDirectionalLight(p, sunDir);
      float extinct  = exp(-d * step);      // Beer's law
      float scatter  = d * step;
      // Dual-lobe Henyey-Greenstein phase: small-angle forward + wide side
      float phase = dualLobeHenyeyGreenstein(dot(rd, sunDir), 0.8, -0.3, 0.5);
      // Multiple-scattering approximation (4 octaves at 0.1 attenuation)
      float ms = multipleScattering(sunDepth, d);
      lum  += accum * scatter * phase * ms;
      accum *= extinct;
    }
    p += rd * step;
    t += step;
    if (accum < 0.01) break;   // early out — opaque
  }
  return vec4(lum, lum, lum, 1.0 - accum);
}
```

Key sub-functions:
- `getCloudDensity(p)` — samples `textureA3D` (low-freq Perlin-Worley)
  at `p * 0.01`, erodes it with `textureB3D` sampled at `p * 0.1`,
  remapped into the height profile from `textureEnvelope`.
- `dualLobeHenyeyGreenstein(cosTheta, g1, g2, blend)` — realistic cloud
  phase function; forward scatter (g1 = 0.8) + side/back scatter (g2 = -0.3).
- `multipleScattering(sunDepth, density)` — 4-octave Beer's law with
  attenuation `0.1^i` each octave (mimics in-scattering without a second
  ray march).
- `beersLaw(depth, coefficient)` — `exp(-depth * coefficient)`.

## Cloud density field (`getCloudDensity`)

```glsl
float getCloudDensity(vec3 p) {
  vec4 low = texture(textureA3D, p * 0.008);        // base
  float base = dot(low.gba, vec3(0.625, 0.25, 0.125));  // 3-octave FBM from RGBA
  float worley = 1.0 - low.r;
  float baseShape = remap(base, 1.0 - worley, 1.0, 0.0, 1.0);

  // Erode with high-freq Worley
  vec4 high = texture(textureB3D, p * 0.06);
  float detail = dot(high.rgb, vec3(0.625, 0.25, 0.125));
  detail = mix(detail, 1.0 - detail, smoothstep(0.0, 0.5, baseShape));
  float shape = remap(baseShape, detail * 0.2, 1.0, 0.0, 1.0);

  // Weather envelope (sampled XZ) determines vertical profile
  vec4 env = texture(textureEnvelope, p.xz * 0.001);
  float heightProfile = getHeightProfile(p.y, env.g, env.b, env.r);  // min, max, cloudType
  return saturate(shape * heightProfile * env.a);                    // env.a = density multiplier
}
```

## Integration with BonzAI engine

**Current state**: no volumetric clouds. Sky is a procedural gradient shader
(`skyMesh`) + starfield. `CELESTIAL.nebulaCloud` is a point-particle
half-dome (cosmetic only; not volumetric).

**Target architecture**:
1. New file `src/engine/sky/VolumetricClouds.js` exports a `CloudLayer`
   class with `init(renderer, scene, camera)` + `update(dt)` + `render()`.
2. Runs BEFORE `composer.render()` — writes to a fullscreen quad that
   blends additively with the sky.
3. Subscribes to weather: `cloudDensity` uniform ← `weather.clouds`;
   `cloudType` uniform ← blend between stratus (humidity high, wind low),
   cumulus (default), cumulonimbus (storm: electricField high).
4. Shared `textureA3D` / `textureB3D` are cached in the engine init — NOT
   regenerated per frame. Envelope regenerates only when weather changes.

## Cost considerations

- 4 FBOs at half res of a 1920×1080 window ≈ `960 × 540 × 4` RGBA float32 targets
  ≈ ~16 MB each.
- 3D textures: `128³ × RGBA_f16 = ~8 MB`, `32³ × RGBA_f16 = ~128 KB`.
- Raymarch at 64 steps × half-res ≈ ~2 ms on a mid-range GPU.
- Disable entirely on `setRenderQuality("low" | "medium")`; only "high"
  and "ultra" enable clouds.

## Anti-patterns

- **Regenerating 3D textures per frame** — 8 MB upload is catastrophic.
  Build once at init.
- **Raymarching at full res** — skips half-res composite, doubles cost.
- **No depth occlusion** — clouds render in front of mountains/trees,
  breaking immersion. Always sample `sceneDepth` and early-out.
- **Single-lobe phase function** — clouds look matte/gray. Use
  dual-lobe HG for realistic forward + backscatter.
