import * as THREE from 'three';

const materialsOf = node => (Array.isArray(node.material) ? node.material : [node.material]).filter(Boolean);
const visibleMeshes = root => {
  const result = [];
  root.traverseVisible(node => { if (node.isMesh && node.geometry && !node.userData.excludeFromBBox) result.push(node); });
  return result;
};

// Hard errors are objective runtime defects, never an arbitrary polygon target.
// A low-poly or minimalist brief remains legitimate; counts are review context.
export function inspectScene(root) {
  root.updateMatrixWorld(true);
  const errors = [], warnings = [], geometries = new Set(), materials = new Set();
  let meshes = 0, instances = 0, triangles = 0, drawCalls = 0, textured = 0;
  const finite = attribute => {
    for (let i = 0; i < attribute.count; i++) for (let j = 0; j < attribute.itemSize; j++) {
      if (!Number.isFinite(attribute.getComponent(i, j))) return false;
    }
    return true;
  };
  for (const node of visibleMeshes(root)) {
    meshes++;
    const label = node.name || `mesh ${meshes}`, geometry = node.geometry, position = geometry.attributes.position;
    if (!node.matrixWorld.elements.every(Number.isFinite)) errors.push(`${label}: non-finite transform`);
    if (!position?.count) { errors.push(`${label}: empty geometry`); continue; }
    if (!geometries.has(geometry)) {
      geometries.add(geometry);
      for (const key of ['position', 'normal', 'uv']) {
        if (geometry.attributes[key] && !finite(geometry.attributes[key])) errors.push(`${label}: non-finite ${key} data`);
      }
      if (geometry.index) for (let i = 0; i < geometry.index.count; i++) {
        if (geometry.index.getX(i) >= position.count) { errors.push(`${label}: triangle index outside vertex buffer`); break; }
      }
    }
    const count = node.isInstancedMesh ? node.count : 1;
    if (node.isInstancedMesh) {
      instances += count;
      const transform = new THREE.Matrix4();
      for (let i = 0; i < count; i++) {
        node.getMatrixAt(i, transform);
        if (!transform.elements.every(Number.isFinite)) { errors.push(`${label}: non-finite instance transform`); break; }
      }
    }
    triangles += Math.floor(Math.min(geometry.drawRange.count, geometry.index?.count ?? position.count) / 3) * count;
    drawCalls += Array.isArray(node.material) ? Math.max(1, geometry.groups.length) : 1;
    const mats = materialsOf(node);
    mats.forEach(material => materials.add(material));
    if (mats.some(m => m.map || m.normalMap || m.bumpMap)) {
      textured++;
      if (!geometry.attributes.uv && mats.some(m => m.isMeshStandardMaterial)) warnings.push(`${label}: textured PBR geometry has no UVs`);
    }
  }
  const level = root.userData.worldScale;
  if (drawCalls > (level ? 160 : 120)) warnings.push(`${drawCalls} estimated draw calls: instance or merge repeated detail`);
  if (triangles > (level ? 600000 : 200000)) warnings.push(`${triangles} triangles: reduce invisible subdivisions before sacrificing silhouette`);
  return { meshes, instances, triangles, drawCalls, materials:materials.size, texturedMeshes:textured,
    errors:[...new Set(errors)].slice(0,8), warnings:[...new Set(warnings)].slice(0,6) };
}

function frame(box, direction, fov, aspect, label) {
  const target = box.getCenter(new THREE.Vector3());
  direction.normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  const tanY = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tanX = tanY * Math.max(.1, aspect);
  let distance = .01;
  for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
    const v = new THREE.Vector3(x,y,z).sub(target);
    distance = Math.max(distance, v.dot(direction) + 1.16 * Math.max(Math.abs(v.dot(right))/tanX, Math.abs(v.dot(up))/tanY));
  }
  return {label, target, distance, position:target.clone().addScaledVector(direction,distance)};
}

export function qualityViews(root, fov = 45, aspect = 1.5) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3(), parts = [];
  for (const node of visibleMeshes(root)) {
    node.geometry.computeBoundingBox();
    if (node.isInstancedMesh) {
      const matrix = new THREE.Matrix4();
      // Instance bounds are aggregated separately: one repeated module is the
      // useful detail target, not a box encompassing the entire population.
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i,matrix);matrix.premultiply(node.matrixWorld);
        const box=node.geometry.boundingBox.clone().applyMatrix4(matrix);
        bounds.union(box);if(i<32)parts.push(box);
      }
    } else {
      const box = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
      bounds.union(box);parts.push(box);
    }
  }
  if (bounds.isEmpty()) return [];
  const size=bounds.getSize(new THREE.Vector3()), centre=bounds.getCenter(new THREE.Vector3());
  const maxSize=Math.max(size.x,size.y,size.z);
  const candidates=parts.filter(box=>{
    const s=box.getSize(new THREE.Vector3());
    return s.y>size.y*.12 && Math.max(s.x,s.y,s.z)<maxSize*.8 && s.length()>maxSize*.04;
  }).sort((a,b)=>{
    const rank=box=>box.getSize(new THREE.Vector3()).length() / (1+box.getCenter(new THREE.Vector3()).distanceTo(centre)/maxSize);
    return rank(b)-rank(a);
  });
  const detail=candidates[0] || bounds;
  return [frame(bounds,new THREE.Vector3(.78,.6,.92),fov,aspect,'Overall construction'),
    frame(bounds,new THREE.Vector3(-.85,.3,-1),fov,aspect,'Reverse construction'),
    frame(detail,new THREE.Vector3(.8,.3,1),fov,aspect,'Surface and joint detail')];
}
