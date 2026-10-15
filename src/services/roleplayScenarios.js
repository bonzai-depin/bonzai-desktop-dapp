/** Keep refreshed bundled scenes while preserving explicitly regenerated artwork. */
export function mergeRoleplayScenarios(defaults, stored, resolveAsset) {
  const saved = Array.isArray(stored) ? stored : [];
  const ids = new Set(defaults.map(scene => scene.id));
  return [...defaults.map(scene => {
    const previous = saved.find(entry => entry.id === scene.id);
    const keepImage = previous?.imageRegenerated || /^data:image\//.test(previous?.image || '');
    return { ...scene, image: keepImage ? previous.image : resolveAsset(scene.defaultImage), ...(keepImage ? { imageRegenerated: true } : {}) };
  }), ...saved.filter(scene => !ids.has(scene.id))];
}
