# Wet ground — puddles, ripples, mirror reflection

Canonical author: **Faraz Shaikh**
- `demo-2023-rain-puddle/src/Floor/PuddleMaterial.tsx` (puddle mask + ripples)
- `demo-2024-a-storm-at-midnight/src/components/Road/MirrorMaterial.tsx`
  (planar reflection on top of the puddle shader)
- `demo-2024-a-storm-at-midnight/src/components/Road/MirrorTexture.ts`
  (mirrored camera → RT)

See also: `_AUTHORS.md`, `rain.md`, `water.md`.

## Partial adoption today

`SHADER.wetSurface` in `engine.js` wraps any `MeshPhysicalMaterial` with a
CSM patch that:
- Carves procedural puddle zones from `gln_sfbm(worldPos.xz)`.
- Generates radial ripple normals inside puddles via a 9-cell neighborhood
  integration of `sin(31·d) × windowed distance`.
- Drops roughness from 1.0 → 0.08 inside puddles (wet-spots become sharp
  mirrors of the environment IBL).
- `uRainFactor` cross-fades dry ↔ wet, driven by the scene weather system.

What's missing: **planar reflection** (Faraz's `MirrorMaterial`). Right now,
wet-zone roughness drop gets the environment map reflection but not a real
per-frame reflection of the scene. For scenes with prominent landmarks
(lightning in the sky, neon signs, companion characters) a real mirror
reflection is notably more immersive than IBL-only.

## Faraz's full recipe (`MirrorMaterial.tsx`)

### Layer 1: Puddle mask
```glsl
// Two fBm samples at different scales, smoothstep'd into a binary-ish mask
float m1 = gln_sfbm(vPos.xz * 0.15, ...);
float m2 = gln_sfbm(vPos.xz * 0.45 + vec2(32.1), ...);
float mask = smoothstep(0.4, 0.6, m1 * 0.6 + m2 * 0.4) * uRainFactor;
```

### Layer 2: Ripple normals
```glsl
// Integrate concentric ripples over 3x3 hashed cell neighborhood
float ripples = 0.0;
for (int dy = -1; dy <= 1; dy++)
  for (int dx = -1; dx <= 1; dx++) {
    vec2 cId = floor(rippleUv) + vec2(dx, dy);
    vec2 c   = cId + hash2(cId);
    float d = length(rippleUv - c);
    float phase = uTime * 2.0 + hash(cId) * 6.28;
    float r = exp(-d * 2.8) * sin(31.0 * d - phase) * 0.5 + 0.5;
    r *= smoothstep(0.0, 0.15, d) * smoothstep(1.0, 0.6, d);
    ripples += r;
  }
vec3 bumpN = normalize(vec3(dH_du, 1.0, dH_dv));
```

### Layer 3: Planar reflection (`MirrorMaterial` extension)
```glsl
// Screen-space UV of the reflected pixel
vec4 refClip = uMirrorMatrix * vec4(worldPos, 1.0);
vec2 refUv = refClip.xy / refClip.w * 0.5 + 0.5;
// Perturb the UV by the ripple normal
refUv += bumpN.xz * 0.04;
vec3 refColor = texture2D(uMirrorMap, refUv).rgb;

// HSV brightness boost (v *= 2) so the reflection pops
refColor = boostHsvV(refColor, 2.0);

// Reflection fades with world-space Y distance (farther = dimmer)
float refStrength = mask * smoothstep(0.5, 0.0, abs(worldPos.y - mirrorY));

// Fresnel floor: always at least some reflection at grazing angles
float fres = pow(1.0 - dot(normal, viewDir), 1.0);
refStrength = max(refStrength, fres * mask * 0.4);

csm_DiffuseColor.rgb = mix(csm_DiffuseColor.rgb, refColor, refStrength);
```

### Layer 4: Mirror camera (`MirrorTexture.ts`)
```js
// Mirror across the Y=mirrorY plane
mirrorCam.position.set(
  cam.position.x,
  2 * mirrorY - cam.position.y,
  cam.position.z
);
mirrorCam.rotation.set(
  -cam.rotation.x,
  cam.rotation.y,
  -cam.rotation.z
);

// Render scene (minus this wet-surface mesh) into the RT
scene.traverse(n => { if (n.userData.isMirrorSurface) n.visible = false });
renderer.setRenderTarget(mirrorRT);
renderer.render(scene, mirrorCam);
scene.traverse(n => { if (n.userData.isMirrorSurface) n.visible = true });
```

### Layer 5: Wind micro-normal (`MirrorMaterial.tsx`)
```glsl
// Extra perturbation for windy surfaces (rain driven by gusts)
vec3 windNoise = vec3(
  gln_sfbm(vPos.xz * 3.0 + vec2( 0, uTime), ...),
  gln_sfbm(vPos.xz * 3.0 + vec2(10, uTime), ...),
  gln_sfbm(vPos.xz * 3.0 + vec2(20, uTime), ...)
) - 0.5;
bumpN = normalize(bumpN + windNoise * 0.05);
```

## Upgrade path

Build `FX.wetMirror(mesh, opts)` wrapper:
- Calls `SHADER.wetSurface` (existing).
- Additionally allocates a `MirrorTexture` render target + a `THREE.Camera`
  mirrored across the mesh's world Y plane.
- Hooks `mesh.onBeforeRender` to update the mirror camera + render the
  scene to RT.
- Patches the material's CSM fragment to sample the mirror RT and
  blend per-pixel by puddle mask.

Cost: ~1 extra scene render per frame per wet surface. For the orrery's
dais or a city floor, this is acceptable (~3 ms on mid GPUs). For many
simultaneous wet surfaces, you'd want to share one global "ground mirror"
RT across all of them.

## Tying to weather

The `uRainFactor` uniform on every `SHADER.wetSurface` material is broadcast
by `ThreeViewer.vue :: _broadcastRainFactor`. Called from
`applyWeatherPreset` with `factor = max(rain, lensDroplets * 0.6)`. This
gives a natural delay: when a storm starts, ground wetness ramps in over
the preset transition time.

## Anti-patterns

- **Wet material on every mesh in the scene** → every emissive hero and
  character gets puddled. Tag only ground/floor surfaces with
  `userData.wetSurface = true` for the rainFactor broadcaster.
- **Mirror camera rendering the wet surface itself** → infinite regress /
  self-reflection loop. Always hide the wet mesh before the mirror render,
  restore after.
- **Mirror RT at full resolution** → doubles frame cost. Half-res with
  depth-aware upsample is invisible in final output.
- **Fresnel with flat normal** → reflection reads as isotropic glow. Use
  the puddle ripple normal for the Fresnel dot product so reflection
  moves with ripples.
