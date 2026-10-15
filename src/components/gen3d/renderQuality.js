import * as THREE from 'three';

// Frame the actual box from the chosen view, rather than a bounding sphere.
// Shallow levels otherwise occupy a small island in the middle of the preview.
export function fitLevelOrbit(bounds, fovDegrees, aspect) {
  const target = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(.78, .72, .92).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  const tanY = Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2);
  const tanX = tanY * Math.max(aspect, .1);
  let distance = 1;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const offset = new THREE.Vector3(x,y,z).sub(target);
    distance = Math.max(distance, offset.dot(direction) + 1.12 * Math.max(Math.abs(offset.dot(right)) / tanX, Math.abs(offset.dot(up)) / tanY));
  }
  return { target, position: target.clone().addScaledVector(direction, distance), distance };
}

// Renderer responsibilities apply to old saved generations as well as new ones.
// Material identity, custom shaders and intentionally unlit effects stay authored.
export function prepareGeneratedSurfaces(root, maxAnisotropy = 8) {
  root.traverse(node => {
    if (!node.isMesh || !node.geometry) return;
    const materials = (Array.isArray(node.material) ? node.material : [node.material]).filter(Boolean);
    const lit = materials.filter(material => material.isMeshStandardMaterial || material.isMeshPhongMaterial || material.isMeshLambertMaterial);
    if (!lit.length) return;
    if (!node.geometry.attributes.normal) node.geometry.computeVertexNormals();
    const opaque = lit.some(material => !material.transmission && (!material.transparent || material.alphaTest > 0));
    // Explicit opt-out for particles, glass effects and deliberate shadow proxies.
    node.castShadow = node.userData.castShadow ?? opaque;
    node.receiveShadow = node.userData.receiveShadow ?? true;
    for (const material of lit) {
      for (const key of ['map', 'emissiveMap']) {
        const texture = material[key];
        if (texture?.isTexture && texture.colorSpace === THREE.NoColorSpace &&
            (texture.isCanvasTexture || texture.image?.tagName === 'IMG')) {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.needsUpdate = true;
        }
      }
      for (const key of ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap']) {
        const texture = material[key];
        if (!texture?.isTexture) continue;
        texture.anisotropy = Math.max(1, Math.min(maxAnisotropy, 8));
        texture.needsUpdate = true;
      }
    }
  });
}

// Fit in light space, not in camera space. Fixed +/-4m shadow bounds silently
// lost almost all shadows on level-sized scenes (and on off-centre assets).
export function fitDirectionalShadow(light, bounds) {
  if (!light?.shadow || bounds.isEmpty()) return;
  light.updateMatrixWorld(true);
  light.target.updateMatrixWorld(true);
  light.shadow.updateMatrices(light);
  const box = new THREE.Box3();
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(light.shadow.camera.matrixWorldInverse));
      }
    }
  }
  const size = box.getSize(new THREE.Vector3());
  const padding = Math.max(.1, Math.max(size.x, size.y) * .04);
  const camera = light.shadow.camera;
  camera.left = box.min.x - padding;
  camera.right = box.max.x + padding;
  camera.bottom = box.min.y - padding;
  camera.top = box.max.y + padding;
  camera.near = Math.max(.01, -box.max.z - padding);
  camera.far = Math.max(camera.near + 1, -box.min.z + padding);
  camera.updateProjectionMatrix();
  const texel = Math.max(size.x, size.y) / light.shadow.mapSize.x;
  light.shadow.normalBias = Math.max(.001, texel * .6);
  light.shadow.bias = -.00008;
  light.shadow.needsUpdate = true;
}
