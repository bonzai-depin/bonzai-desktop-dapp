# Post-Processing — AAA stack (pmndrs/postprocessing + N8AO)

DO NOT hand-roll a composer. The host ThreeViewer owns the composer and
exposes tunable setters. Call the setters from inside `generate()`.

## Baseline (already applied to every scene — only override if needed)
setFilmGrain(0, 0)
setChromatic(0, 2.2)
setColorGrade({ saturation: 1, contrast: 1 })
setDoF({ aperture: 0, maxblur: 0 })        // auto-focus on orbit target
setUnderwater(false, { auto: true, ... })          // auto-triggers below water
setAO({ radius: 0.15, intensity: 1, quality: "High" })
setBloom({ intensity: 0.2, threshold: 1.2 })

## Overrides worth calling
setLensFlare({ position: Vector3, strength: 0.6, occlusionTest: true, tint?, anamorphic? })
setScreenDroplets(density, { speed?, size? })      // 0..1 — lens rain
setColorGrade({ hue?, saturation?, contrast?, lift?, gain? })
setDoF({ aperture: 0.015 })                        // stronger product-shot blur
setAO({ radius: 1.2, intensity: 5.0, quality: "Ultra" })
setBloom({ intensity: 1.4, threshold: 0.6 })
await setEnvironment("studio" | "day" | "sunset" | "night" | url, { background?, intensity? })
Weather and height fog are controlled by the viewer UI, not generated code.

## DO NOT
Do NOT import EffectComposer, UnrealBloomPass, BokehPass, SMAAPass,
ShaderPass, or N8AOPostPass directly. They are pre-wired.
Do NOT call `composer.*` from within generate().
Do NOT touch `renderer.setPixelRatio` or add custom render passes.

## Scene-level FX (geometry, not post)
FX.withGlow(mesh, color, { scale: 1.08, intensity: 1.3 })   // fresnel shell bloom-substitute
FX.godRayCone({ from: Vector3, to: Vector3, color, spread?, intensity? })
await FX.scatter(targetMesh, protoMesh, count, { scaleRange?, alignToNormal?, rotateY? })
FX.batch([meshes], { material? })                   // BatchedMesh single-draw-call pile

## Liquids — optional construction helpers
FLUID.tieredFountain({ tiers: 3, baseRadius: 0.5, spacing: 0.32, pillar: true,
                       stoneColor: 0xc4b69c, waterColor: 0xe2f0eb })
    // Complete cascading fountain in ONE call: bowls + central pillar +
    // clear jets between tiers. Author custom profiles for bespoke architecture.
FLUID.basinWater({ radius: 0.4, y: 0.1, depth: 0.08 }) // add inside a bespoke stone basin
FLUID.fountainBasin({ radius: 0.5, y: 0 })  // single bowl + water pool
FLUID.oceanWater(geometry, { color: 0x0a86c8, ... })  // flat pool / moat
FLUID.jet({ from: Vector3, to: Vector3, radius: 0.008, color: 0xe2f0eb }) // clear cascade
FLUID.stream({ from: Vector3, to: Vector3, radius: 0.02 }) // stylized waterfall sheets
H.fillLiquid(vesselMesh, color, { fillLevel: 0.6 })   // liquid inside a container
FLUID.upgradeFill(result)                             // add animated ripples

## Advanced materials (Faraz Shaikh port — TCSM + glNoise)
SHADER.csm({ base?: THREE.MeshPhysicalMaterial, vert?: string, frag?: string,
             uniforms?: {}, patchMap?: {}, baseOpts?: {} })
    // CustomShaderMaterial wrapper. Your GLSL can write csm_DiffuseColor,
    // csm_Roughness, csm_Metalness, csm_Emissive, csm_Normal, csm_Bump,
    // csm_Position, csm_Clearcoat, csm_Transmission, csm_Iridescence,
    // csm_Sheen — TCSM injects them into the correct chunks. glNoise's
    // gln_sfbm / gln_simplex / gln_worley / gln_voronoi / gln_GerstnerWave
    // are auto-prepended when referenced.

SHADER.wetSurface({ color?, rainFactor?, puddleScale?, puddleBias?,
                    rippleScale?, rippleSpeed?, rippleStrength? })
    // Port of Faraz's rain puddle material. Returns a CSM-wrapped
    // MeshPhysicalMaterial that procedurally carves fBm puddle zones,
    // generates radial ripple normals inside them, and drops roughness
    // so wet spots become sharp reflectors. Use on floors/roads/plazas
    // when the scene is rainy; pair with setScreenDroplets for
    // matched lens rain.
