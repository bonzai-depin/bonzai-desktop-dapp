# Interaction
## Raycaster
Raycaster() → .setFromCamera(mouse:Vec2, camera) | .set(origin:Vec3, direction:Vec3)
.intersectObjects(objects[], recursive?) → [{distance, point:Vec3, face, faceIndex, object, uv:Vec2, normal:Vec3, instanceId}]
.near .far .params.Line.threshold .params.Points.threshold
.layers.set(n) — only intersect objects on layer n
## Mouse Position (NDC -1 to 1)
mouse.x = (event.clientX / window.innerWidth) * 2 - 1
mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
Canvas-relative: use getBoundingClientRect()
## Controls (from three/addons/controls/)
OrbitControls(camera, domElement) → .enableDamping .dampingFactor .minDistance .maxDistance
  .minPolarAngle .maxPolarAngle .autoRotate .autoRotateSpeed .target:Vec3 .update()
FlyControls(cam, dom) → .movementSpeed .rollSpeed .update(delta)
PointerLockControls(cam, dom) → .lock() .unlock() .isLocked .moveForward(dist)
TrackballControls, MapControls, FirstPersonControls
## TransformControls
TransformControls(cam, dom) → .attach(obj) .detach() .setMode('translate'|'rotate'|'scale') .setSpace('local'|'world')
## DragControls
DragControls(objects[], cam, dom) → events: 'dragstart' 'drag' 'dragend'
## Coordinate Conversion
World→Screen: vec.project(camera) → screen.x=((vec.x+1)/2)*width
Screen→World: vec.unproject(camera) → ray direction
Ray-Plane: raycaster.ray.intersectPlane(plane, targetVec3)
