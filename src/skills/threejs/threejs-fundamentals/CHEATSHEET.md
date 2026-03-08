# Fundamentals
## Scene
Scene() → .background(Color|Texture|CubeTexture) .environment(envMap) .fog(Fog|FogExp2)
Fog(color, near, far) | FogExp2(color, density)
## Cameras
PerspectiveCamera(fov, aspect, near, far) → .position.set(x,y,z) .lookAt(x,y,z) .updateProjectionMatrix()
OrthographicCamera(left, right, top, bottom, near, far)
## Object3D (base for Mesh, Group, Light, Camera)
.position.set(x,y,z) .rotation.set(x,y,z) .scale.set(x,y,z)
.add(child) .remove(child) .traverse(fn) .visible=bool
.getWorldPosition(vec3) .getWorldQuaternion(quat) .getWorldDirection(vec3)
.layers.set(n) .layers.enable(n) .layers.disable(n)
## Group
Group() → .add(mesh1, mesh2) — empty container for transforms
## Mesh
Mesh(geometry, material) → .castShadow .receiveShadow .renderOrder
Mesh(geometry, [mat1, mat2]) — multi-material
## Vector3
Vector3(x,y,z) → .set .copy .clone .add .sub .multiply .multiplyScalar .normalize .negate .lerp
.length() .lengthSq() .distanceTo(v) .dot(v) .cross(v) .angleTo(v)
.applyMatrix4(m) .applyQuaternion(q) .project(cam) .unproject(cam)
## Vector2
Vector2(x,y) → same API as Vector3 (2D)
## Color
Color(hex|string) → .setHex .setRGB(r,g,b) .setHSL(h,s,l) .lerp(c,a) .multiply(c)
## Quaternion
Quaternion() → .setFromEuler(e) .setFromAxisAngle(axis,angle) .setFromRotationMatrix(m)
.multiply(q) .slerp(target,t) .normalize() .invert()
## Euler
Euler(x,y,z,order) — orders: 'XYZ','YXZ','ZXY','XZY','YZX','ZYX'
## MathUtils
THREE.MathUtils: clamp lerp mapLinear degToRad radToDeg randFloat randInt smoothstep
## Clock
Clock() → .getDelta() .getElapsedTime()
