# Loaders
## LoadingManager
LoadingManager() → .onStart(url,loaded,total) .onLoad() .onProgress(url,loaded,total) .onError(url)
Pass to loaders: new TextureLoader(manager), new GLTFLoader(manager)
## TextureLoader
TextureLoader(manager?) → .load(url, onLoad?, onProgress?, onError?) → Texture
## CubeTextureLoader
CubeTextureLoader() → .load([px,nx,py,ny,pz,nz])
## RGBELoader (HDR)
RGBELoader() → .load(url, tex => { tex.mapping=EquirectangularReflectionMapping })
## GLTFLoader (primary 3D format)
GLTFLoader() → .load(url, gltf => { gltf.scene, gltf.animations[], gltf.cameras[] })
DRACOLoader(): .setDecoderPath(path) .preload() → gltfLoader.setDRACOLoader(draco)
KTX2Loader(): .setTranscoderPath(path) .detectSupport(renderer) → gltfLoader.setKTX2Loader(ktx2)
## Other Formats
OBJLoader+MTLLoader: mtl.load(url, mats => { obj.setMaterials(mats); obj.load(url) })
FBXLoader → .load(url, object) — often needs .scale.setScalar(0.01)
STLLoader → .load(url, geometry) — returns BufferGeometry, no material
PLYLoader → .load(url, geometry) — point clouds, .computeVertexNormals()
## Process GLTF
model.traverse(child => { if(child.isMesh) { child.castShadow=true; child.receiveShadow=true } })
model.getObjectByName('name')
Center+scale: Box3().setFromObject(model) → .getCenter(vec) .getSize(vec) → model.position.sub(center)
## Async Pattern
function load(url) { return new Promise((res,rej) => loader.load(url, res, undefined, rej)) }
Promise.all([loadGLTF(a), loadTexture(b), loadRGBE(c)])
## Paths
loader.setPath('base/') .setResourcePath('textures/')
## Parse from buffer
loader.parse(arrayBuffer, '', callback) — for fetch'd data
## Cache
THREE.Cache.enabled=true → .clear() .add(key,data) .get(key) .remove(key)
