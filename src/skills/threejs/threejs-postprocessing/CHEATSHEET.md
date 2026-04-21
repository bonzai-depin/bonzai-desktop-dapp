# Post-Processing — AAA stack (pmndrs/postprocessing + N8AO)

DO NOT hand-roll a composer. The host ThreeViewer owns the composer and
exposes tunable setters. Call the setters from inside `generate()`.

## Baseline (already applied to every scene — only override if needed)
setFilmGrain(0.035, 0.35)
setChromatic(0.22, 2.2)
setColorGrade({ saturation: 1.12, contrast: 1.04 })
setDoF({ aperture: 0.006, maxblur: 0.006 })        // auto-focus on orbit target
setUnderwater(false, { auto: true, ... })          // auto-triggers below water
setAO({ radius: 0.6, intensity: 3.0, quality: "High" })
setBloom({ intensity: 0.8, threshold: 0.85 })

## Overrides worth calling
setLensFlare({ position: Vector3, strength: 0.6, occlusionTest: true, tint?, anamorphic? })
setScreenDroplets(density, { speed?, size? })      // 0..1
setColorGrade({ hue?, saturation?, contrast?, lift?, gain? })
setDoF({ aperture: 0.015 })                        // stronger product-shot blur
setAO({ radius: 1.2, intensity: 5.0, quality: "Ultra" })
setBloom({ intensity: 1.4, threshold: 0.6 })
await setEnvironment("studio" | "day" | "sunset" | "night" | url, { background?, intensity? })

## DO NOT
Do NOT import EffectComposer, UnrealBloomPass, BokehPass, SMAAPass,
ShaderPass, or N8AOPostPass directly. They are pre-wired.
Do NOT call `composer.*` from within generate().
Do NOT touch `renderer.setPixelRatio` or add custom render passes.

## Scene-level FX (geometry, not post)
FX.withGlow(mesh, color, { scale: 1.08, intensity: 1.3 })   // fresnel shell bloom-substitute
FX.godRayCone({ from: Vector3, to: Vector3, color, spread?, intensity? })
FX.scatter(targetMesh, protoMesh, count, { scaleRange?, alignToNormal?, rotateY? })
FX.batch([meshes], { material? })                   // BatchedMesh single-draw-call pile
