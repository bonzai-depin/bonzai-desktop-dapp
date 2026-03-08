# Lighting
## Light Types
AmbientLight(color, intensity) — uniform everywhere, no shadows
HemisphereLight(skyColor, groundColor, intensity) — sky/ground gradient
DirectionalLight(color, intensity) — parallel rays (sun), shadows
PointLight(color, intensity, distance=0, decay=2) — omnidirectional (bulb), shadows
SpotLight(color, intensity, distance, angle, penumbra(0-1), decay) — cone, shadows
RectAreaLight(color, intensity, width, height) — area light, MeshStandard/Physical only, no native shadows
## Shadow Setup
renderer.shadowMap.enabled=true; renderer.shadowMap.type=PCFSoftShadowMap
light.castShadow=true; mesh.castShadow=true; mesh.receiveShadow=true
Shadow types: BasicShadowMap, PCFShadowMap, PCFSoftShadowMap, VSMShadowMap
## DirectionalLight Shadow
shadow.mapSize.set(2048,2048)
shadow.camera: .near .far .left .right .top .bottom (orthographic frustum)
shadow.bias=-0.0001 shadow.normalBias=0.02 shadow.radius=4(soft)
## PointLight Shadow
shadow.mapSize.set(1024,1024) shadow.camera.near/far shadow.bias
## SpotLight Shadow
shadow.mapSize shadow.camera.near/far/fov shadow.bias shadow.focus=1
## Environment Lighting (IBL)
RGBELoader → texture.mapping=EquirectangularReflectionMapping → scene.environment=texture
PMREMGenerator(renderer) → .fromEquirectangular(texture).texture
scene.backgroundBlurriness(0-1) scene.backgroundIntensity
## Common Setups
Three-point: key(1.0)+fill(0.5)+back(0.3)+ambient(0.3)
Outdoor: DirectionalLight(sun)+HemisphereLight(sky,ground)
## Light Properties
.color .intensity .position .target(DirLight/SpotLight) .distance .decay .angle .penumbra
