// Compare construction and material choices, ignoring names, camera, particles
// and procedural texture noise. Used to reject repeated designs, not to score art.
export function sceneDesignSignature(root) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  const meshes = [];
  function hash(values) {
    let h = 2166136261;
    for (const value of values) {
      const text = typeof value === 'number' ? String(Math.round(value * 100000) / 100000) : String(value);
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
      h = Math.imul(h ^ 124, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  root.traverse(node => {
    if (!node.isMesh || !node.geometry || node.userData?.excludeFromBBox) return;
    const geometry = node.geometry;
    const materials = (Array.isArray(node.material) ? node.material : [node.material]).filter(Boolean);
    const materialValues = materials.flatMap(material => [material.type, material.color?.getHex(), material.emissive?.getHex(),
      material.roughness, material.metalness, material.transmission, material.opacity, material.ior, material.vertexShader, material.fragmentShader]);
    meshes.push(hash([
      hash(geometry.attributes.position?.array || []), hash(geometry.index?.array || []),
      hash(geometry.attributes.normal?.array || []), hash(node.morphTargetInfluences || []), hash(node.skeleton?.boneMatrices || []),
      hash(node.matrixWorld.elements), node.count ?? 1,
      hash(node.instanceMatrix?.array || []), hash(node.instanceColor?.array || []),
      ...materialValues,
    ]));
  });
  return meshes.length ? `design-v1:${hash(meshes.sort())}` : null;
}
