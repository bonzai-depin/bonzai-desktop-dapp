// Bundled CC0 maps: no third-party requests, including in exported applications.
// Vite resolves hashed assets for both HTTP and packaged Electron file:// builds.
const assets = import.meta.glob('../../assets/materials/*/*.jpg', { eager: true, query: '?url', import: 'default' });
import { resolveMaterial } from './materialCatalogue.js';

export function createScannedLibrary(THREE, renderer) {
  const loaded = new Map(), owned = new Set();
  let disposed = false;
  const loader = new THREE.TextureLoader();
  async function load(kind) {
    const entry = resolveMaterial(kind);
    if (disposed) throw new Error('Material library disposed');
    if (!loaded.has(kind)) {
      const promise = Promise.all(['diffuse', 'normal-gl', 'roughness', 'ao', 'metalness'].map(async name => {
        if (!entry.maps[name]) return null;
        const url = assets[`../../assets/materials/${entry.maps[name].file}`];
        if (!url) throw new Error(`Missing bundled material: ${kind}/${name}`);
        const texture = await loader.loadAsync(url);
        if (disposed) { texture.dispose(); throw new Error('Material library disposed'); }
        owned.add(texture);
        texture.colorSpace = name === 'diffuse' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(16, renderer?.capabilities.getMaxAnisotropy() || 1);
        return texture;
      }));
      loaded.set(kind, promise);
      // A missing map is an explicit generation error, not a silently flat material.
      promise.catch(() => { if (loaded.get(kind) === promise) loaded.delete(kind); });
    }
    return loaded.get(kind);
  }
  return {
    async material(kind, options = {}) {
      const { repeat = [1, 1], normalStrength = .5, aoIntensity = .65, variant = 0, ...properties } = options;
      const entry = resolveMaterial(kind, variant);
      if (!Array.isArray(repeat) || repeat.length !== 2 || !repeat.every(v => Number.isFinite(v) && v > 0)
        || !Number.isFinite(normalStrength) || normalStrength < 0 || !Number.isFinite(aoIntensity) || aoIntensity < 0)
        throw new Error('Scanned material repeat must be positive; normalStrength and aoIntensity must be non-negative');
      const source = await load(entry.id);
      if (disposed) throw new Error('Material library disposed');
      // Separate transforms per material; image sources remain shared in memory.
      const [map, normalMap, roughnessMap, aoMap, metalnessMap] = source.map(original => {
        if (!original) return null;
        const texture = original.clone();
        texture.repeat.set(...repeat); texture.needsUpdate = true;
        owned.add(texture); return texture;
      });
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: metalnessMap ? 1 : 0,
        ...properties, map, normalMap, roughnessMap, aoMap, metalnessMap,
        normalScale: new THREE.Vector2(normalStrength, normalStrength), aoMapIntensity: aoIntensity });
      material.name = `scanned:${entry.id}`;
      return material;
    },
    dispose() { disposed = true; for (const texture of owned) texture.dispose(); owned.clear(); loaded.clear(); },
  };
}
