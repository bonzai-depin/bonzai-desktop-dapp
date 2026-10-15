// Local, tileable PBR texture sets. A seed changes surface detail without network
// assets or per-frame work. Colour and data maps keep separate colour spaces.
const profiles = {
  stone: { color: 0xaca396, roughness: .88, relief: .025 },
  concrete: { color: 0xa5a39c, roughness: .92, relief: .012 },
  wood: { color: 0x88603d, roughness: .66, relief: .012 },
  metal: { color: 0x9da3ab, roughness: .32, relief: .001, metalness: 1 },
  fabric: { color: 0x827367, roughness: .96, relief: .008 },
  ground: { color: 0x72634a, roughness: .96, relief: .045 },
  sand: { color: 0xc9b58a, roughness: .94, relief: .008 },
};

export function surfacePixels(kind, seed = 1, size = 512) {
  if (!profiles[kind]) throw new Error(`Unknown surface: ${kind}`);
  const hash = (x, y) => {
    let n = Math.imul(x + (seed | 0), 374761393) ^ Math.imul(y + 1, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (u, v, cells) => {
    const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
    const tx = smooth(x - ix), ty = smooth(y - iy);
    const a = hash(ix % cells, iy % cells), b = hash((ix + 1) % cells, iy % cells);
    const c = hash(ix % cells, (iy + 1) % cells), d = hash((ix + 1) % cells, (iy + 1) % cells);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  const color = new Uint8Array(size * size * 4);
  const height = new Uint8Array(color.length);
  const roughness = new Uint8Array(color.length);
  const elevations = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const broad = noise(u, v, 8), fine = noise(u, v, 64);
      let h = broad * .5 + noise(u, v, 24) * .3 + fine * .2;
      if (kind === 'wood') h = .5 + .25 * Math.sin(v * Math.PI * 48 + broad * 5) + (fine - .5) * .12;
      if (kind === 'metal') h = .5 + (noise(u, v, 128) - .5) * .03 + Math.sin(v * Math.PI * 200) * .025;
      if (kind === 'fabric') h = .5 + .22 * Math.sin(u * Math.PI * 64) * Math.cos(v * Math.PI * 64) + (fine - .5) * .08;
      if (kind === 'sand') h = fine * .75 + broad * .25;
      const i = (y * size + x) * 4;
      elevations[y * size + x] = h;
      for (let channel = 0; channel < 3; channel++) {
        color[i + channel] = Math.round(255 * (.72 + .28 * h));
        height[i + channel] = Math.round(255 * h);
        roughness[i + channel] = Math.round(255 * (.72 + .22 * (1 - h) + .06 * fine));
      }
      color[i + 3] = height[i + 3] = roughness[i + 3] = 255;
    }
  }
  // Periodic derivatives produce tangent-space normals without seam edges.
  // Keep height too: callers may choose bump, while GLB exports retain normals.
  const normal = new Uint8Array(color.length);
  const h = (x,y) => elevations[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const dx=(h(x+1,y)-h(x-1,y))*size*.025, dy=(h(x,y+1)-h(x,y-1))*size*.025;
    const length=Math.hypot(dx,dy,1), i=(y*size+x)*4;
    normal[i]=Math.round((-.5*dx/length+.5)*255);
    normal[i+1]=Math.round((-.5*dy/length+.5)*255);
    normal[i+2]=Math.round((.5/length+.5)*255);normal[i+3]=255;
  }
  return { color, height, roughness, normal };
}

export function createSurfaceLibrary(THREE, renderer) {
  const maps = new Map();
  return {
    material(kind = 'stone', options = {}) {
      const profile = profiles[kind];
      if (!profile) throw new Error(`Unknown surface: ${kind}`);
      const { seed = 1, repeat = [1, 1], relief = profile.relief, tileSize = 1, resolution = 512, ...properties } = options;
      const size = [128,256,512,1024].includes(resolution) ? resolution : 512;
      if (!Number.isFinite(tileSize) || tileSize <= 0 || !Number.isFinite(relief) || relief < 0) throw new Error('Surface tileSize must be positive and relief non-negative');
      const key = JSON.stringify([kind, seed, repeat, size]);
      if (!maps.has(key)) {
        const data = surfacePixels(kind, seed, size);
        const textures = Object.fromEntries(Object.entries(data).map(([name, pixels]) => {
          // GLTFExporter merges roughness/metalness through canvas.drawImage;
          // give the browser an image source, not a raw DataTexture image object.
          let texture;
          if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const context = canvas.getContext('2d');
            const image = context.createImageData(size, size);
            image.data.set(pixels);
            context.putImageData(image, 0, 0);
            texture = new THREE.CanvasTexture(canvas);
            texture.flipY = false;
          } else {
            texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
          }
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(repeat[0], repeat[1]);
          texture.colorSpace = name === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() || 1);
          texture.needsUpdate = true;
          return [name, texture];
        }));
        maps.set(key, textures);
      }
      const textures = maps.get(key);
      const material = new THREE.MeshStandardMaterial({ color: profile.color,
        metalness: profile.metalness || 0, roughness: profile.roughness,
        ...properties, map: textures.color, bumpMap: textures.height,
        bumpScale: relief, normalMap: textures.normal,
        normalScale: new THREE.Vector2(relief / (.05 * tileSize), relief / (.05 * tileSize)),
        roughnessMap: textures.roughness });
      material.name = `surface:${kind}`;
      return material;
    },
    dispose() { for (const textures of maps.values()) Object.values(textures).forEach(texture => texture.dispose()); maps.clear(); },
  };
}
