# Geometry
## Basic Shapes
BoxGeometry(w, h, d, wSeg?, hSeg?, dSeg?)
SphereGeometry(radius, wSeg=32, hSeg=32, phiStart?, phiLen?, thetaStart?, thetaLen?)
PlaneGeometry(w, h, wSeg?, hSeg?)
CircleGeometry(radius, seg=32, thetaStart?, thetaLen?)
CylinderGeometry(radTop, radBot, height, radSeg=32, hSeg?, openEnded?)
ConeGeometry(radius, height, radSeg=32, hSeg?, openEnded?)
TorusGeometry(radius, tube, radSeg=16, tubSeg=100, arc?)
TorusKnotGeometry(radius, tube, tubSeg=100, radSeg=16, p=2, q=3)
RingGeometry(inner, outer, thetaSeg=32, phiSeg?)
CapsuleGeometry(radius, length, capSeg=4, radSeg=8)
## Platonic
IcosahedronGeometry(radius, detail=0)
OctahedronGeometry(radius, detail=0)
DodecahedronGeometry(radius, detail=0)
TetrahedronGeometry(radius, detail=0)
## Path-Based
LatheGeometry(points: Vector2[], segments=32, phiStart=0, phiLength=2π)
ExtrudeGeometry(shape, {steps, depth, bevelEnabled, bevelThickness, bevelSize, bevelSegments, curveSegments})
TubeGeometry(path: Curve3, tubeSeg=64, radius=1, radSeg=8, closed=false)
Shape() → .moveTo(x,y) .lineTo(x,y) .bezierCurveTo(cp1x,cp1y,cp2x,cp2y,x,y) .quadraticCurveTo(cpx,cpy,x,y)
  shape.holes.push(holePath)
## Curves
CatmullRomCurve3(points: Vector3[], closed?, curveType?, tension?)
QuadraticBezierCurve3(v0, v1, v2)
CubicBezierCurve3(v0, v1, v2, v3)
LineCurve3(v0, v1)
## BufferGeometry
BufferGeometry() → .setAttribute('position', new Float32BufferAttribute(arr, 3))
  .setAttribute('normal', ...) .setAttribute('uv', new Float32BufferAttribute(arr, 2))
  .setIndex(new BufferAttribute(Uint16Array, 1))
  .computeVertexNormals() .computeBoundingBox() .center()
## EdgesGeometry / WireframeGeometry
EdgesGeometry(geo, thresholdAngle=15) → use with LineSegments
WireframeGeometry(geo) → use with LineSegments
## Points
Points(bufferGeo, PointsMaterial) — point clouds
## Lines
Line(geo, LineBasicMaterial) | LineLoop | LineSegments
## InstancedMesh
InstancedMesh(geo, mat, count) → .setMatrixAt(i, matrix4) .setColorAt(i, color)
  .instanceMatrix.needsUpdate=true
## Morph Targets
geometry.morphAttributes.position = [new BufferAttribute(Float32Array, 3)]
mesh.morphTargetInfluences[0] = 0..1
