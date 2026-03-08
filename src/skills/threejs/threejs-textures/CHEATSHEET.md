# Textures
## TextureLoader
TextureLoader() → .load(url, onLoad?, onProgress?, onError?) → Texture
## Texture Settings
.colorSpace: SRGBColorSpace (color maps) | default (data maps: normal, roughness, metal)
.wrapS/.wrapT: ClampToEdgeWrapping(default) | RepeatWrapping | MirroredRepeatWrapping
.repeat.set(u,v) .offset.set(u,v) .rotation(rad) .center.set(0.5,0.5)
.minFilter: LinearMipmapLinearFilter(default) | NearestFilter(pixel) | LinearFilter
.magFilter: LinearFilter(default) | NearestFilter(pixel)
.anisotropy = renderer.capabilities.getMaxAnisotropy()
.generateMipmaps=true .flipY=true .needsUpdate=true
## Data/Canvas/Video Texture
DataTexture(Uint8Array, width, height) — procedural from raw data
CanvasTexture(canvas) — from 2D canvas drawing
VideoTexture(videoElement) — auto-updates
## CubeTexture
CubeTextureLoader().load([px,nx,py,ny,pz,nz]) → scene.background | scene.environment | material.envMap
## HDR
RGBELoader().load(url) → texture.mapping=EquirectangularReflectionMapping → scene.environment
EXRLoader().load(url)
PMREMGenerator(renderer) → .fromEquirectangular(tex).texture — prefiltered PBR env
scene.backgroundBlurriness(0-1) .backgroundIntensity .backgroundRotation.y
## Render Target
WebGLRenderTarget(w,h,{minFilter,magFilter,format}) → renderer.setRenderTarget(rt) then render then setRenderTarget(null) → rt.texture
## PBR Texture Maps
map(color,sRGB) normalMap(+normalScale:Vec2) roughnessMap metalnessMap
aoMap(needs uv2!) emissiveMap displacementMap(+displacementScale) alphaMap(+transparent:true)
## UV Mapping
geometry.attributes.uv → .getX(i) .getY(i) .setXY(i,u,v) .needsUpdate=true
geometry.setAttribute('uv2', geometry.attributes.uv) — for aoMap
## Dispose
texture.dispose() — free GPU memory
