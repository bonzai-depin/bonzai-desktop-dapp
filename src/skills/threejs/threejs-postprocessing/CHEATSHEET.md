# Post-Processing
## Setup
EffectComposer(renderer) → .addPass(pass) .render() .setSize(w,h)
RenderPass(scene, camera) — always first pass
Use composer.render() instead of renderer.render()
## Bloom
UnrealBloomPass(resolution:Vec2, strength, radius, threshold) → .strength .radius .threshold .enabled
## Anti-Aliasing
ShaderPass(FXAAShader) → uniforms.resolution.value.set(1/w, 1/h)
SMAAPass(w*pixelRatio, h*pixelRatio)
## SSAO
SSAOPass(scene, camera, w, h) → .kernelRadius .minDistance .maxDistance .output
## Depth of Field
BokehPass(scene, camera, {focus, aperture, maxblur})
## Film/Grain
FilmPass(noiseIntensity, scanlineIntensity, scanlineCount, grayscale)
## Vignette
ShaderPass(VignetteShader) → uniforms.offset.value uniforms.darkness.value
## Color
ShaderPass(ColorCorrectionShader) → uniforms.powRGB.value:Vec3 uniforms.mulRGB.value:Vec3
ShaderPass(GammaCorrectionShader)
## Outline
OutlinePass(resolution:Vec2, scene, camera) → .selectedObjects[] .edgeStrength .edgeGlow .edgeThickness .visibleEdgeColor .hiddenEdgeColor
## Effects
GlitchPass() → .goWild=bool
HalftonePass(w, h, {shape, radius, scatter})
RenderPixelatedPass(pixelSize, scene, camera)
## Custom ShaderPass
{uniforms:{tDiffuse:{value:null}, ...custom}, vertexShader, fragmentShader}
tDiffuse = input texture from previous pass (auto-provided)
## Selective Bloom
mesh.layers.enable(BLOOM_LAYER) → darken non-bloomed before bloom pass → restore after
## Resize
composer.setSize(w,h); fxaaPass.uniforms.resolution.value.set(1/(w*pr), 1/(h*pr))
