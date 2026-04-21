/**
 * Generative3D engine — extended library injected into every generated
 * module. Adds rich materials, procedural textures, shader library,
 * particle/fluid helpers and a Rapier-backed physics API on top of the
 * existing H.* helpers from ThreeViewer.
 *
 * Shipped as a single helper-factory so the LLM-generated code stays
 * small: `const { MAT, TEX, SHADER, FLUID, P } = makeLibs({ THREE, addUpdateCallback, root });`
 */
import { Water } from 'three/examples/jsm/objects/Water.js';

// Shared soft-disc sprite — same canvas-built gradient the ThreeViewer
// helpers use. Each Points material we build references this so particles
// render as rounded motes instead of aliased squares.
let _softSprite = null;
function getSoftSprite(THREE) {
  if (_softSprite) return _softSprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _softSprite = new THREE.CanvasTexture(c);
  _softSprite.minFilter = THREE.LinearFilter;
  _softSprite.magFilter = THREE.LinearFilter;
  _softSprite.generateMipmaps = false;
  return _softSprite;
}

export function makeLibs({ THREE, addUpdateCallback }) {
  const SOFT = getSoftSprite(THREE);
  // ═══════════════════════════════════════════════════════════════════════
  // MAT — physical materials. Generous surface so the LLM rarely needs to
  // hand-roll MeshPhysicalMaterial. All materials clone-safe (shared instances
  // don't mutate). Consumers may override by cloning if they need one-off.
  // ═══════════════════════════════════════════════════════════════════════
  const pbr = (o) => new THREE.MeshPhysicalMaterial(o);
  const MAT = {
    // Metals
    gold:       pbr({ color: 0xffd700, metalness: 1.0, roughness: 0.22, clearcoat: 0.55 }),
    silver:     pbr({ color: 0xe8e8ea, metalness: 1.0, roughness: 0.14 }),
    bronze:     pbr({ color: 0xcd7f32, metalness: 0.95, roughness: 0.34 }),
    copper:     pbr({ color: 0xb87333, metalness: 0.95, roughness: 0.36 }),
    iron:       pbr({ color: 0x3e3e46, metalness: 0.9,  roughness: 0.55 }),
    steel:      pbr({ color: 0x9097a6, metalness: 1.0, roughness: 0.12, clearcoat: 0.85 }),
    chrome:     pbr({ color: 0xf4f7fb, metalness: 1.0, roughness: 0.03, clearcoat: 1.0 }),
    brass:      pbr({ color: 0xd6b15a, metalness: 1.0, roughness: 0.28, clearcoat: 0.4 }),
    titanium:   pbr({ color: 0x8c8a92, metalness: 1.0, roughness: 0.42 }),
    gunmetal:   pbr({ color: 0x2a2e33, metalness: 0.95, roughness: 0.35 }),
    rust:       pbr({ color: 0x8b3a1a, metalness: 0.4,  roughness: 0.85 }),
    // Gems / transparent
    ruby:       pbr({ color: 0xe01037, metalness: 0, roughness: 0.02, transmission: 0.9,  ior: 1.76, clearcoat: 1.0, transparent: true }),
    emerald:    pbr({ color: 0x18c06f, metalness: 0, roughness: 0.02, transmission: 0.9,  ior: 1.58, clearcoat: 1.0, transparent: true }),
    sapphire:   pbr({ color: 0x0f4fd8, metalness: 0, roughness: 0.02, transmission: 0.9,  ior: 1.77, clearcoat: 1.0, transparent: true }),
    amethyst:   pbr({ color: 0x8e5cc9, metalness: 0, roughness: 0.04, transmission: 0.88, ior: 1.55, clearcoat: 1.0, transparent: true }),
    diamond:    pbr({ color: 0xffffff, metalness: 0, roughness: 0.0,  transmission: 0.95, ior: 2.42, clearcoat: 1.0, transparent: true, dispersion: 1.0 }),
    topaz:      pbr({ color: 0xffce5a, metalness: 0, roughness: 0.04, transmission: 0.9,  ior: 1.61, clearcoat: 1.0, transparent: true }),
    jade:       pbr({ color: 0x66b090, metalness: 0, roughness: 0.35, transmission: 0.6,  ior: 1.66, clearcoat: 0.8, transparent: true }),
    obsidian:   pbr({ color: 0x0c0c16, metalness: 0.3, roughness: 0.08, clearcoat: 0.95 }),
    glass:      pbr({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 0.98, ior: 1.5, thickness: 0.15, clearcoat: 1.0, transparent: true }),
    crystal:    pbr({ color: 0xd7ecff, metalness: 0, roughness: 0.02, transmission: 0.95, ior: 1.5, thickness: 0.4, clearcoat: 1.0, transparent: true }),
    ice:        pbr({ color: 0xbde7ff, metalness: 0, roughness: 0.12, transmission: 0.72, ior: 1.31, clearcoat: 1.0, transparent: true }),
    // Organic / matte
    bone:       pbr({ color: 0xf2ead0, roughness: 0.78 }),
    flesh:      pbr({ color: 0xd4956a, roughness: 0.85, clearcoat: 0.3 }),
    leaf:       pbr({ color: 0x2d7d3a, roughness: 0.55, sheen: 0.6, sheenColor: 0x3fcc66 }),
    bark:       pbr({ color: 0x5a3520, roughness: 0.95 }),
    clay:       pbr({ color: 0xc4764e, roughness: 0.95 }),
    marble:     pbr({ color: 0xf0ece2, roughness: 0.24, clearcoat: 0.6 }),
    porcelain:  pbr({ color: 0xfaf6ee, roughness: 0.16, clearcoat: 1.0, clearcoatRoughness: 0.06 }),
    ceramic:    pbr({ color: 0xe3d4c1, roughness: 0.3, clearcoat: 0.55 }),
    pearl:      pbr({ color: 0xfaf4f0, roughness: 0.18, clearcoat: 1.0, iridescence: 0.85, iridescenceIOR: 1.3 }),
    coral:      pbr({ color: 0xff7a68, roughness: 0.85, sheen: 0.5, sheenColor: 0xff9890 }),
    // Energy / stylized
    lava:       pbr({ color: 0xff3a0a, emissive: 0xff6a20, emissiveIntensity: 1.4, roughness: 0.7 }),
    neon_cyan:  pbr({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0 }),
    neon_pink:  pbr({ color: 0xff2ea0, emissive: 0xff2ea0, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0 }),
    neon_violet:pbr({ color: 0x8e2ff0, emissive: 0x8e2ff0, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0 }),
    // Earthy
    sand:       pbr({ color: 0xd2b48c, roughness: 0.96 }),
    snow:       pbr({ color: 0xfafafa, roughness: 0.84, sheen: 0.5 }),
    moss:       pbr({ color: 0x4f7a3a, roughness: 0.95, sheen: 0.4, sheenColor: 0x7ac060 }),
    // Rubber / plastic
    rubber:     pbr({ color: 0x1c1c1c, roughness: 0.95 }),
    plastic:    pbr({ color: 0xdcdce0, roughness: 0.45, clearcoat: 0.8 }),
    // Fabrics use sheen + high roughness
    velvet_black: pbr({ color: 0x151015, roughness: 1.0, sheen: 1.0, sheenColor: 0xd070a0, sheenRoughness: 0.85 }),
    silk_white:   pbr({ color: 0xeeeae0, roughness: 0.65, sheen: 0.9, sheenColor: 0xffffff, sheenRoughness: 0.4 }),
    leather:    pbr({ color: 0x6b3a2a, roughness: 0.8 }),
  };

  // ═══════════════════════════════════════════════════════════════════════
  // TEX — canvas procedural textures. All returning THREE.CanvasTexture with
  // repeat wrapping enabled; call `.repeat.set(x, y)` on the returned texture
  // to tile. Base color / accent color arguments are all optional.
  // ═══════════════════════════════════════════════════════════════════════
  const canvas = (size) => {
    const c = document.createElement('canvas');
    c.width = c.height = size || 256;
    return { el: c, g: c.getContext('2d') };
  };
  const asTex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const noise2D = (g, w, h, scale, shade) => {
    const d = g.getImageData(0, 0, w, h);
    for (let i = 0; i < d.data.length; i += 4) {
      const n = (Math.random() - 0.5) * shade;
      d.data[i] = Math.max(0, Math.min(255, d.data[i] + n));
      d.data[i + 1] = Math.max(0, Math.min(255, d.data[i + 1] + n));
      d.data[i + 2] = Math.max(0, Math.min(255, d.data[i + 2] + n));
    }
    g.putImageData(d, 0, 0);
  };
  const TEX = {
    wood(base, grain) {
      const { el, g } = canvas(512);
      g.fillStyle = base || '#7a5230'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = grain || '#5a3520'; g.globalAlpha = 0.35;
      for (let i = 0; i < 80; i++) {
        g.beginPath();
        const y = Math.random() * 512;
        g.moveTo(0, y);
        g.bezierCurveTo(170, y + (Math.random() - 0.5) * 28, 340, y + (Math.random() - 0.5) * 28, 512, y + (Math.random() - 0.5) * 14);
        g.lineWidth = 0.4 + Math.random() * 2.2;
        g.stroke();
      }
      return asTex(el);
    },
    stone(base) {
      const { el, g } = canvas(512);
      g.fillStyle = base || '#6d6d72'; g.fillRect(0, 0, 512, 512);
      noise2D(g, 512, 512, 1, 28);
      g.globalAlpha = 0.25;
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = '#1d1d22';
        g.beginPath();
        let x = Math.random() * 512, y = Math.random() * 512;
        g.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (Math.random() - 0.5) * 90;
          y += (Math.random() - 0.5) * 90;
          g.lineTo(x, y);
        }
        g.lineWidth = 0.6; g.stroke();
      }
      return asTex(el);
    },
    metal(base) {
      const { el, g } = canvas(256);
      g.fillStyle = base || '#9c9c9f'; g.fillRect(0, 0, 256, 256);
      g.globalAlpha = 0.1;
      for (let i = 0; i < 200; i++) {
        g.strokeStyle = Math.random() > 0.5 ? '#cccccc' : '#6f6f72';
        g.beginPath();
        const y = Math.random() * 256;
        g.moveTo(0, y); g.lineTo(256, y + (Math.random() - 0.5) * 4);
        g.lineWidth = 0.3 + Math.random(); g.stroke();
      }
      return asTex(el);
    },
    marble(base, vein) {
      const { el, g } = canvas(512);
      g.fillStyle = base || '#efe9dc'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = vein || '#8a7a65'; g.globalAlpha = 0.3;
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        let x = Math.random() * 512, y = Math.random() * 512;
        g.moveTo(x, y);
        for (let k = 0; k < 12; k++) {
          x += (Math.random() - 0.5) * 70;
          y += (Math.random() - 0.5) * 70;
          g.lineTo(x, y);
        }
        g.lineWidth = 0.3 + Math.random() * 1.5; g.stroke();
      }
      return asTex(el);
    },
    concrete(base) {
      const { el, g } = canvas(512);
      g.fillStyle = base || '#b9b6b0'; g.fillRect(0, 0, 512, 512);
      noise2D(g, 512, 512, 1, 38);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = Math.random() > 0.5 ? '#5a5a5d' : '#efefef';
        g.globalAlpha = 0.14;
        g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 0, Math.PI * 2); g.fill();
      }
      return asTex(el);
    },
    rust(base) {
      const { el, g } = canvas(512);
      g.fillStyle = base || '#7b3a20'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = ['#3b1a0e', '#9c4a22', '#d96a38', '#2a1108'][Math.floor(Math.random() * 4)];
        g.globalAlpha = 0.15 + Math.random() * 0.3;
        g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 14, 0, Math.PI * 2); g.fill();
      }
      return asTex(el);
    },
    grass() {
      const { el, g } = canvas(256);
      g.fillStyle = '#274d20'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 600; i++) {
        g.strokeStyle = ['#3a7a28', '#4f9a30', '#6fb84a', '#1e3a16'][Math.floor(Math.random() * 4)];
        g.globalAlpha = 0.8;
        g.beginPath();
        const x = Math.random() * 256, y = Math.random() * 256;
        g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y - 2 - Math.random() * 6);
        g.lineWidth = 0.6; g.stroke();
      }
      return asTex(el);
    },
    scales(base, ridge) {
      const { el, g } = canvas(256);
      g.fillStyle = base || '#2b6b40'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = ridge || '#0f3a20';
      const r = 12;
      for (let y = 0; y < 256 + r; y += r * 0.9) {
        for (let x = 0; x < 256 + r; x += r * 2) {
          const ox = (Math.floor(y / (r * 0.9)) % 2) * r;
          g.beginPath(); g.arc(x + ox, y, r, Math.PI, 0, true); g.stroke();
        }
      }
      return asTex(el);
    },
    carbon(base) {
      const { el, g } = canvas(256);
      g.fillStyle = base || '#1e1e22'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#3a3a40';
      for (let y = 0; y < 256; y += 8) {
        for (let x = 0; x < 256; x += 8) {
          const ox = (Math.floor(y / 8) % 2) * 4;
          g.strokeRect(x + ox, y, 8, 8);
        }
      }
      return asTex(el);
    },
    brick(base, mortar) {
      const { el, g } = canvas(256);
      g.fillStyle = mortar || '#3a3630'; g.fillRect(0, 0, 256, 256);
      const bW = 56, bH = 22;
      for (let row = 0; row < 12; row++) {
        const ox = (row % 2) * (bW / 2);
        const y = row * (bH + 2);
        for (let col = -1; col < 6; col++) {
          const x = col * (bW + 2) + ox;
          g.fillStyle = ['#8c2f1c', '#a44227', '#6e1e10', '#b85035'][Math.floor(Math.random() * 4)];
          g.fillRect(x, y, bW, bH);
        }
      }
      return asTex(el);
    },
    hexgrid(base, line) {
      const { el, g } = canvas(256);
      g.fillStyle = base || '#0a0c18'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = line || '#00bcd4'; g.lineWidth = 1.2;
      const R = 18;
      for (let q = -1; q < 10; q++) for (let r = -1; r < 10; r++) {
        const x = R * 1.5 * q;
        const y = R * Math.sqrt(3) * (r + (q % 2) / 2);
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i;
          const px = x + R * Math.cos(a), py = y + R * Math.sin(a);
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath(); g.stroke();
      }
      return asTex(el);
    },
    circuit(base, trace) {
      const { el, g } = canvas(512);
      g.fillStyle = base || '#0c1218'; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = trace || '#22e0a0'; g.lineWidth = 1.4;
      for (let i = 0; i < 40; i++) {
        g.beginPath();
        let x = Math.floor(Math.random() * 64) * 8, y = Math.floor(Math.random() * 64) * 8;
        g.moveTo(x, y);
        const steps = 4 + Math.floor(Math.random() * 8);
        for (let k = 0; k < steps; k++) {
          if (Math.random() > 0.5) x += (Math.random() > 0.5 ? 1 : -1) * 8 * (1 + Math.floor(Math.random() * 6));
          else y += (Math.random() > 0.5 ? 1 : -1) * 8 * (1 + Math.floor(Math.random() * 6));
          g.lineTo(x, y);
        }
        g.stroke();
      }
      // solder pads
      g.fillStyle = trace || '#22e0a0';
      for (let i = 0; i < 60; i++) {
        g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 2, 0, Math.PI * 2); g.fill();
      }
      return asTex(el);
    },
    fabric(base) {
      const { el, g } = canvas(128);
      g.fillStyle = base || '#8b4444'; g.fillRect(0, 0, 128, 128);
      g.globalAlpha = 0.12; g.strokeStyle = '#000';
      for (let i = 0; i < 128; i += 3) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.lineWidth = 0.5; g.stroke();
      }
      return asTex(el);
    },
    leather(base) {
      const { el, g } = canvas(256);
      g.fillStyle = base || '#6b3a2a'; g.fillRect(0, 0, 256, 256);
      g.globalAlpha = 0.18;
      for (let i = 0; i < 400; i++) {
        g.fillStyle = Math.random() > 0.5 ? '#7a4a3a' : '#5a2a1a';
        g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3.5, 0, Math.PI * 2); g.fill();
      }
      return asTex(el);
    },
    runes(base, rune) {
      const { el, g } = canvas(512);
      g.fillStyle = base || '#1a120a'; g.fillRect(0, 0, 512, 512);
      g.fillStyle = rune || '#c8a050';
      g.font = '28px serif'; g.globalAlpha = 0.85;
      const glyphs = '\u16A0\u16A2\u16A6\u16B1\u16B7\u16C1\u16C7\u16D2\u16E1\u16E6\u16EB';
      for (let i = 0; i < 64; i++) {
        const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        g.fillText(ch, Math.random() * 480, 30 + Math.random() * 480);
      }
      return asTex(el);
    },
    // Procedural matcap — a sphere-view gradient that MeshMatcapMaterial uses
    // as its entire shading model. Gives a polished jewel / chrome look with
    // zero lights. opts: { base, highlight, rim, hotspot: [u,v] }
    matcap(opts = {}) {
      const size = opts.size || 256;
      const { el, g } = canvas(size);
      const base      = opts.base      || '#2a2f3a';
      const mid       = opts.mid       || '#7a8090';
      const highlight = opts.highlight || '#ffffff';
      const rim       = opts.rim       || '#080810';
      const hs = opts.hotspot || [0.35, 0.3];
      // Background (behind the sphere, visible if the sphere shrinks)
      g.fillStyle = rim; g.fillRect(0, 0, size, size);
      // Core sphere fill — radial gradient from base to rim
      const cx = size * 0.5, cy = size * 0.5, r = size * 0.5;
      const core = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      core.addColorStop(0.0, mid);
      core.addColorStop(0.6, base);
      core.addColorStop(1.0, rim);
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = core; g.fill();
      // Specular hotspot — small bright disc near the top-left.
      const hx = size * hs[0], hy = size * hs[1];
      const hot = g.createRadialGradient(hx, hy, 0, hx, hy, size * 0.32);
      hot.addColorStop(0.0, highlight);
      hot.addColorStop(0.4, highlight + '80');
      hot.addColorStop(1.0, '#00000000');
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = hot; g.fillRect(0, 0, size, size);
      const t = new THREE.CanvasTexture(el);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    },
    // Tileable water normal map — procedural FBM heightfield converted to
    // RGB-encoded normals. Plugs into THREE.Water / FLUID.oceanWater so
    // the reflected world ripples and scatters exactly as in
    // water-simulation.vercel.app (which uses THREE.Water with a normal
    // map of this type). Tileable thanks to wrapping modulo lookup.
    waterNormal(size = 512) {
      const s = size;
      // Simple cosine-hash noise — enough for a normal map, no deps.
      const hash = (x, y) => {
        const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return h - Math.floor(h);
      };
      const smoothNoise = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        const xf = x - xi,       yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const a = hash(xi, yi),       b = hash(xi + 1, yi);
        const c = hash(xi, yi + 1),   d = hash(xi + 1, yi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      };
      const fbm = (x, y) => {
        let v = 0, amp = 0.5, freq = 1;
        for (let o = 0; o < 4; o++) {
          v += amp * smoothNoise(x * freq, y * freq);
          freq *= 2; amp *= 0.5;
        }
        return v;
      };
      // Build a tileable heightfield at the map scale.
      const H = new Float32Array(s * s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          // Domain 0..1 scaled to 6 freq units — tiles at module boundary
          const u = (x / s) * 6, v = (y / s) * 6;
          H[y * s + x] = fbm(u, v);
        }
      }
      // Convert heightfield to normal map via central-difference gradient.
      const { el, g } = canvas(s);
      const img = g.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const hL = H[y * s + ((x - 1 + s) % s)];
          const hR = H[y * s + ((x + 1) % s)];
          const hD = H[((y - 1 + s) % s) * s + x];
          const hU = H[((y + 1) % s) * s + x];
          const dx = (hR - hL) * 4.0;
          const dy = (hU - hD) * 4.0;
          const nx = -dx, ny = -dy, nz = 1.0;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
          const i = (y * s + x) * 4;
          img.data[i]     = ((nx / len) * 0.5 + 0.5) * 255;
          img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
          img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(el);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      // Normal maps must stay in linear space, not sRGB.
      t.colorSpace = THREE.NoColorSpace;
      return t;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SHADER — reusable ShaderMaterial factories. Each returns a fresh
  // material; uniforms are exposed as `.userData.uniforms` if the LLM
  // wants to tween them in an update callback. Internally we register a
  // time-driven update so `uTime` always advances.
  // ═══════════════════════════════════════════════════════════════════════
  const _shaderTicker = { time: 0, materials: [] };
  addUpdateCallback?.(({ time }) => {
    _shaderTicker.time = time;
    for (const m of _shaderTicker.materials) if (m.uniforms?.uTime) m.uniforms.uTime.value = time;
  });
  const registerShader = (mat) => { _shaderTicker.materials.push(mat); return mat; };
  const GLSL_NOISE = `
    // Simplex-ish cheap hash noise (enough for volumetric looks).
    float hash(vec3 p){ return fract(sin(dot(p, vec3(27.16, 57.1, 113.5))) * 43758.5453); }
    vec2  hash2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
    float noise(vec3 p){
      vec3 i = floor(p); vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                     mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                     mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
    // Domain-warped fbm — swirls the domain via one fbm before sampling
    // another. Produces organic, flowing patterns instead of uniform turbulence.
    float fbmWarped(vec3 p, float t){
      vec3 q = vec3(fbm(p + vec3(0.0, 0.0, t)), fbm(p + vec3(5.2, 1.3, t * 0.7)), fbm(p + vec3(-2.1, 3.4, t * 1.1)));
      return fbm(p + q * 1.2);
    }
    // Worley / cellular noise — animated caustic cells. The t parameter
    // scales the per-cell drift used for animation; return value is the
    // squared distance to the nearest cell, which peaks at cell edges
    // (the caustic envelope).
    float worley(vec2 p, float t){
      vec2 n = floor(p); vec2 f = fract(p);
      float d = 1.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash2(n + g);
        o = 0.5 + 0.5 * sin(t + 6.2831 * o);
        vec2 r = g + o - f;
        d = min(d, dot(r, r));
      }
      return d;
    }
    // Caustic-specific worley: returns the CAUSTIC INTENSITY (bright at cell
    // edges, dark in cell centers). Sharper + inverse of raw worley.
    float caustic(vec2 p, float t){
      float d = worley(p, t);
      return pow(1.0 - smoothstep(0.0, 0.6, d), 3.0);
    }
  `;

  // ═══════════════════════════════════════════════════════════════════════
  // MATCAP presets — MeshMatcapMaterial baked with the procedural matcap
  // texture from TEX.matcap. Gives polished jewel / chrome shading with
  // zero lights, which reads as "AAA character render" on small props.
  // Use for cut gems, cursed orbs, trophy pieces that shouldn't respond
  // to local lighting.
  // ═══════════════════════════════════════════════════════════════════════
  MAT.matcap = (opts = {}) => new THREE.MeshMatcapMaterial({
    matcap: TEX.matcap(opts),
    color: opts.color || 0xffffff,
    flatShading: !!opts.flatShading,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1.0,
  });
  MAT.matcapGold    = MAT.matcap({ base: '#8a6400', mid: '#e8c050', highlight: '#fffce0', rim: '#261a00' });
  MAT.matcapChrome  = MAT.matcap({ base: '#2a3040', mid: '#a0b0c8', highlight: '#ffffff', rim: '#050810' });
  MAT.matcapPearl   = MAT.matcap({ base: '#e0d8e8', mid: '#f4e8ff', highlight: '#ffffff', rim: '#40384a' });
  MAT.matcapEmerald = MAT.matcap({ base: '#084030', mid: '#28b070', highlight: '#e8fff4', rim: '#021810' });
  MAT.matcapRuby    = MAT.matcap({ base: '#4a0810', mid: '#e02040', highlight: '#fff0f4', rim: '#180204' });
  MAT.matcapOnyx    = MAT.matcap({ base: '#080810', mid: '#2a2838', highlight: '#b0a8ff', rim: '#000000' });

  // ═══════════════════════════════════════════════════════════════════════
  // MAT.gem / MAT.facetedGem — the CANONICAL gem material. Adapted from
  // isladjan's gem-rendering technique (flat vertex normals + colored
  // point lights), modernized for Three.js r125+ by using
  // material.flatShading instead of the removed computeFlatVertexNormals.
  //
  // Every triangle gets its own normal, so light catches each facet at a
  // different angle — which is what sells "cut crystal" vs "sphere".
  // Pair with a ring of colored point lights (violet / pink / cyan) for
  // the full jewel effect.
  //
  //   const ruby = new THREE.Mesh(
  //     new THREE.OctahedronGeometry(0.4, 0),
  //     MAT.gem({ color: 0xe01037 })
  //   );
  //   root.add(MAT.gemLights(0.6));  // colored point-light ring
  //
  // opts: { color, emissive?, emissiveIntensity?, clearcoat?, ior? }
  MAT.gem = (opts = {}) => new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0xe01037,
    metalness: opts.metalness ?? 0.15,
    roughness: opts.roughness ?? 0.08,
    clearcoat: opts.clearcoat ?? 1.0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.04,
    transmission: opts.transmission ?? 0.4,
    ior: opts.ior ?? 1.9,
    thickness: opts.thickness ?? 0.6,
    emissive: new THREE.Color(opts.emissive ?? opts.color ?? 0xe01037),
    emissiveIntensity: opts.emissiveIntensity ?? 0.25,
    transparent: true,
    flatShading: true,            // the gem rendering cue from isladjan —
                                   // each facet catches light differently
    side: THREE.DoubleSide,
    envMapIntensity: opts.envMapIntensity ?? 1.2,
  });
  MAT.facetedGem = MAT.gem;       // alias — use whichever name feels right
  // Preset shortcuts with classic gem hues.
  MAT.gemRuby     = () => MAT.gem({ color: 0xe01037 });
  MAT.gemEmerald  = () => MAT.gem({ color: 0x18c06f, ior: 1.58 });
  MAT.gemSapphire = () => MAT.gem({ color: 0x0f4fd8, ior: 1.77 });
  MAT.gemAmethyst = () => MAT.gem({ color: 0x8e5cc9, ior: 1.55 });
  MAT.gemTopaz    = () => MAT.gem({ color: 0xffce5a, ior: 1.61 });
  MAT.gemDiamond  = () => MAT.gem({ color: 0xffffff, ior: 2.42, transmission: 0.95, thickness: 0.4 });

  // ── MAT.fakeGlow / H.addGlow — Mancini's post-process-free bloom trick
  // A fresnel-only additive shell material. Clone any mesh at 1.05× scale
  // with this material and you get a visible halo around it — cheaper
  // than selective bloom, works through portals, stackable.
  //
  //   const orbMesh = ...;
  //   root.add(orbMesh);
  //   H.addGlow(orbMesh, 0x8b5cf6, { scale: 1.08, intensity: 1.5 });
  //
  // OR use the material directly:
  //   const shell = new THREE.Mesh(geom.clone().scale(1.05), MAT.fakeGlow({color}));
  MAT.fakeGlow = (opts = {}) => new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,           // glow around the OUTSIDE — back-face
                                     // of the scaled-up shell renders as rim
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor:     { value: new THREE.Color(opts.color ?? 0x8b5cf6) },
      uPower:     { value: opts.power ?? 2.5 },
      uIntensity: { value: opts.intensity ?? 1.2 },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uPower; uniform float uIntensity;
      varying vec3 vN; varying vec3 vV;
      void main(){
        // Using BackSide, dot(N,V) is negative inside — flip it for the
        // outer shell to glow.
        float f = pow(1.0 - abs(dot(vN, vV)), uPower);
        gl_FragColor = vec4(uColor * f * uIntensity, f);
      }`,
  });

  // Colored point-light halo for gems. Returns a Group with 5 lights in
  // violet / pink / magenta surrounding the target — the same multi-
  // color setup isladjan uses to make gem facets pop. Add this near any
  // gem, crystal, or jewel cluster.
  //
  //   root.add(MAT.gemLights(0.4));   // radius 0.4 halo
  //
  // opts (first arg can be a number = radius):
  //   { radius, intensity?, center? }
  MAT.gemLights = (radius = 0.4, opts = {}) => {
    if (typeof radius === 'object') { opts = radius; radius = opts.radius ?? 0.4; }
    const g = new THREE.Group();
    const I = opts.intensity ?? 0.6;
    const C = opts.center || new THREE.Vector3(0, 0, 0);
    const add = (color, pos, mul = 1.0) => {
      const l = new THREE.PointLight(color, I * mul, radius * 6);
      l.position.set(C.x + pos[0] * radius, C.y + pos[1] * radius, C.z + pos[2] * radius);
      g.add(l);
    };
    add(0xff5de0, [ 1.5,  0.3,  0.5], 1.0);  // bright pink — right
    add(0x5854ff, [-1.5,  0.3,  0.8], 1.0);  // deep indigo — left
    add(0x632ecf, [ 0.0, -0.4,  0.4], 1.0);  // violet — front-low
    add(0x632ecf, [-0.4,  0.5,  0.4], 0.5);  // violet accent
    add(0xa855f7, [ 0.3, -0.2,  0.6], 0.5);  // BonzAI violet fill
    // Gentle ambient so shadows aren't pitch black.
    const amb = new THREE.AmbientLight(0xf1a4ff, 0.2);
    g.add(amb);
    return g;
  };

  const SHADER = {
    fresnel(color = 0x00ffff, power = 3.0, opacity = 0.9) {
      const m = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uPower: { value: power },
          uOpacity: { value: opacity },
        },
        vertexShader: `
          varying vec3 vN; varying vec3 vV;
          void main(){
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uPower; uniform float uOpacity;
          varying vec3 vN; varying vec3 vV;
          void main(){
            float f = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), uPower);
            gl_FragColor = vec4(uColor * f, f * uOpacity);
          }`,
      });
      return registerShader(m);
    },
    // Hologram v2 — Mancini/ektogamat recipe. Fresnel rim × scanline mask
    // × traveling signal wave × blink, additive blend. This is what sells
    // a mesh as "sci-fi projection" vs striped plastic.
    //   opts: { color?, lineFreq?, signalSpeed?, blink?, blinkRate?,
    //           additive?, opacity?, fresnelPower?, fresnelOnly? }
    hologram(color = 0x00e5ff, lineFreq = 80.0, opts = {}) {
      if (typeof color === 'object' && !(color instanceof THREE.Color) && typeof color !== 'number' && typeof color !== 'string') {
        opts = color; color = opts.color ?? 0x00e5ff; lineFreq = opts.lineFreq ?? 80.0;
      }
      const u = {
        uTime:         { value: 0 },
        uColor:        { value: new THREE.Color(color) },
        uFreq:         { value: lineFreq },
        uSignalSpeed:  { value: opts.signalSpeed ?? 2.0 },
        uBlink:        { value: opts.blink ?? 0.6 },          // 0 = off, 1 = full blink
        uBlinkRate:    { value: opts.blinkRate ?? 4.0 },
        uOpacity:      { value: opts.opacity ?? 1.0 },
        uFresnelPower: { value: opts.fresnelPower ?? 1.4 },
        uFresnelOnly:  { value: (opts.fresnelOnly ? 1.0 : 0.0) },
      };
      const m = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: opts.additive !== false ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: u,
        vertexShader: `
          varying vec3 vN; varying vec3 vV; varying vec3 vWp;
          void main(){
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWp = wp.xyz;
            vN = normalize(normalMatrix * normal);
            vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uTime; uniform float uFreq;
          uniform float uSignalSpeed; uniform float uBlink; uniform float uBlinkRate;
          uniform float uOpacity; uniform float uFresnelPower; uniform float uFresnelOnly;
          varying vec3 vN; varying vec3 vV; varying vec3 vWp;
          void main(){
            // 1) Fresnel rim — edges glow brighter than centre.
            float fres = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), uFresnelPower);
            // 2) Scanlines on world-space Y — stationary bars.
            float scan = 0.5 + 0.5 * sin(vWp.y * uFreq);
            // 3) Traveling signal wave — a second, slower sine that moves
            //    vertically, creating a scanning signal feel.
            float signal = smoothstep(0.5, 1.0, sin((vWp.y - uTime * uSignalSpeed) * 3.0));
            // 4) Blink — periodically dim the whole material by a fraction
            //    of uBlink. Subtle at 0.3, dramatic at 0.9.
            float blinkTrig = step(0.95, fract(uTime * uBlinkRate));
            float blink = 1.0 - uBlink * blinkTrig;
            // 5) Combine. fresnelOnly=1 means the scanlines/signal gate
            //    only the rim (body is transparent), matching Mancini's
            //    "projected ghost" variant.
            float body  = mix(scan, 1.0, signal * 0.8);
            float mask  = mix(body, 1.0, uFresnelOnly);
            float alpha = fres * mask * blink * uOpacity;
            vec3  col   = uColor * (0.6 + fres * 0.8 + signal * 0.4);
            gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
          }`,
      });
      return registerShader(m);
    },
    nebula(inner = 0x8a2cff, outer = 0x0a0a2a) {
      const m = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uInner: { value: new THREE.Color(inner) },
          uOuter: { value: new THREE.Color(outer) },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          ${GLSL_NOISE}
          uniform float uTime; uniform vec3 uInner; uniform vec3 uOuter;
          varying vec3 vP;
          void main(){
            vec3 p = vP * 2.5 + vec3(uTime * 0.04, uTime * 0.05, uTime * 0.03);
            float n = fbm(p);
            float d = length(vP);
            float glow = smoothstep(1.1, 0.0, d);
            vec3 c = mix(uOuter, uInner, pow(n, 1.6));
            gl_FragColor = vec4(c * glow, 1.0);
          }`,
      });
      return registerShader(m);
    },
    // Lava shader — domain-warped fbm flow with gradient-perturbed normals,
    // chromatic heat-shimmer at the crust cracks, and pulsing hot cores.
    // Signature: lava(hot, cold, speed)  OR  lava({hot, cold, speed, chroma, displacement, emissiveBoost})
    lava(hot = 0xff6a20, cold = 0x1a0800, speed = 0.25) {
      let opts = {};
      if (typeof hot === 'object' && !(hot instanceof THREE.Color) && typeof hot !== 'number' && typeof hot !== 'string') {
        opts = hot; hot = opts.hot ?? 0xff6a20; cold = opts.cold ?? 0x1a0800; speed = opts.speed ?? 0.25;
      }
      const chroma         = opts.chroma ?? 0.12;
      const displacement   = opts.displacement ?? 0.035;
      const emissiveBoost  = opts.emissiveBoost ?? 1.8;
      const u = {
        uTime:      { value: 0 },
        uHot:       { value: new THREE.Color(hot) },
        uCold:      { value: new THREE.Color(cold) },
        uSpeed:     { value: speed },
        uChroma:    { value: chroma },
        uDisp:      { value: displacement },
        uEmissive:  { value: emissiveBoost },
      };
      const m = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: `
          ${GLSL_NOISE}
          uniform float uTime; uniform float uSpeed; uniform float uDisp;
          varying vec3 vP;
          varying vec3 vN;
          varying vec3 vWorldN;
          varying vec3 vViewDir;
          varying float vFlow;
          void main(){
            vec3 p = position;
            // Low-frequency domain-warped flow displaces the crust upward
            // where hot material rises — not a flat plane but a churning
            // surface. Gradient below perturbs the shading normal.
            vec3 flowP = p * 3.0 + vec3(0.0, uTime * uSpeed, 0.0);
            float h  = fbmWarped(flowP, uTime * uSpeed * 0.8);
            float hx = fbmWarped(flowP + vec3(0.15, 0.0, 0.0), uTime * uSpeed * 0.8) - h;
            float hz = fbmWarped(flowP + vec3(0.0, 0.0, 0.15), uTime * uSpeed * 0.8) - h;
            p += normal * (h - 0.5) * uDisp;
            vFlow = h;
            vP = p;
            vN = normalize(normalMatrix * (normal + vec3(hx, 0.0, hz) * 2.5));
            vWorldN = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vViewDir = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          ${GLSL_NOISE}
          uniform float uTime; uniform float uSpeed;
          uniform vec3 uHot; uniform vec3 uCold;
          uniform float uChroma; uniform float uEmissive;
          varying vec3 vP; varying vec3 vN;
          varying vec3 vWorldN; varying vec3 vViewDir; varying float vFlow;
          void main(){
            // Two stacked noise octaves: the base crust pattern + fine-grain
            // detail that crawls faster. The high-freq layer is what reads
            // as "glowing cracks" between cooled plates.
            float n1 = fbmWarped(vP * 4.0 + vec3(0.0, uTime * uSpeed, 0.0), uTime * uSpeed);
            float n2 = fbmWarped(vP * 14.0 + vec3(uTime * uSpeed * 2.2, 0.0, 0.0), uTime * uSpeed * 1.3);
            float base = smoothstep(0.30, 0.90, n1 + n2 * 0.35);

            // Chromatic hot-spot fringing — sample R/G/B at slightly
            // offset frequencies so the glow splits at the crack edges.
            // Real lava has this because the emission peaks at different
            // wavelengths over the cooling gradient.
            float hotR = smoothstep(0.28, 0.88, fbmWarped(vP * 4.0 + vec3(uChroma,  0.0, 0.0), uTime * uSpeed) + n2 * 0.35);
            float hotB = smoothstep(0.32, 0.92, fbmWarped(vP * 4.0 + vec3(-uChroma, 0.0, 0.0), uTime * uSpeed) + n2 * 0.35);
            vec3 c = mix(uCold, uHot, base);
            c += vec3(hotR, base, hotB) * uHot * pow(base, 3.0) * uEmissive;

            // Worley-driven bright crack spots. These are the "molten
            // rivers" between cooled plates — they pulse independently
            // of the base crust so the surface never locks into a static
            // pattern.
            float crack = caustic(vP.xz * 2.6, uTime * uSpeed * 1.4);
            c += uHot * crack * (1.0 - base) * 0.9;

            // View-dependent heat shimmer: grazing angles dim slightly
            // (heat haze) while head-on viewing shows saturated color.
            float ndv = max(dot(normalize(vN), normalize(vViewDir)), 0.0);
            c *= 0.85 + ndv * 0.25;

            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      m.userData.uniforms = u;
      return registerShader(m);
    },
    // Lightweight water shader (non-PBR). For transmission-grade water use
    // FLUID.surface / waterMaterial. This one is right for distant lake
    // planes and stylized water where full PBR transmission is overkill.
    // Signature: water(shallow, deep, speed)  OR  water({shallow, deep, speed, chroma, caustics, waveAmp})
    water(shallow = 0x20b8d0, deep = 0x064c66, speed = 0.4) {
      let opts = {};
      if (typeof shallow === 'object' && !(shallow instanceof THREE.Color) && typeof shallow !== 'number' && typeof shallow !== 'string') {
        opts = shallow;
        shallow = opts.shallow ?? 0x20b8d0;
        deep = opts.deep ?? 0x064c66;
        speed = opts.speed ?? 0.4;
      }
      const chroma   = opts.chroma ?? 0.02;
      const caustics = opts.caustics ?? 0.4;
      const waveAmp  = opts.waveAmp ?? 0.08;
      const u = {
        uTime:       { value: 0 },
        uShallow:    { value: new THREE.Color(shallow) },
        uDeep:       { value: new THREE.Color(deep) },
        uSpeed:      { value: speed },
        uChroma:     { value: chroma },
        uCaustics:   { value: caustics },
        uWaveAmp:    { value: waveAmp },
      };
      const m = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: u,
        vertexShader: `
          ${GLSL_NOISE}
          uniform float uTime; uniform float uSpeed; uniform float uWaveAmp;
          varying float vWave;
          varying vec3 vWaveGrad;
          varying vec3 vWorldN;
          varying vec3 vViewDir;
          varying vec3 vWorldP;
          void main(){
            vec3 p = position;
            vec3 flowP = p * 2.0 + vec3(uTime * uSpeed, 0.0, uTime * uSpeed * 0.7);
            float w  = fbmWarped(flowP, uTime * uSpeed * 0.8);
            float wx = fbmWarped(flowP + vec3(0.15, 0.0, 0.0), uTime * uSpeed * 0.8) - w;
            float wz = fbmWarped(flowP + vec3(0.0, 0.0, 0.15), uTime * uSpeed * 0.8) - w;
            p.y += (w - 0.5) * uWaveAmp;
            vWave = w;
            vWaveGrad = vec3(wx, 1.0, wz);
            vWorldN = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vWorldP = wp.xyz;
            vViewDir = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          ${GLSL_NOISE}
          uniform vec3 uShallow; uniform vec3 uDeep;
          uniform float uTime; uniform float uChroma; uniform float uCaustics;
          varying float vWave;
          varying vec3 vWaveGrad;
          varying vec3 vWorldN;
          varying vec3 vViewDir;
          varying vec3 vWorldP;
          void main(){
            float t = clamp((vWave - 0.5) * 2.0 + 0.5, 0.0, 1.0);
            vec3 c = mix(uDeep, uShallow, t);

            // Chromatic fresnel — per-channel exponent split.
            vec3 Nw = normalize(vWorldN + vec3(vWaveGrad.x, 0.0, vWaveGrad.z) * 0.4);
            float ndv = max(dot(Nw, normalize(vViewDir)), 0.0);
            vec3 fringe = vec3(
              pow(1.0 - ndv, 3.0 - uChroma * 20.0),
              pow(1.0 - ndv, 3.4),
              pow(1.0 - ndv, 3.8 + uChroma * 20.0)
            );
            c += fringe * 0.35;

            // RGB worley caustics on the surface.
            vec2 cUV = vWorldP.xz * 2.0 + vWaveGrad.xz * 0.7;
            float cR = caustic(cUV + vec2(uChroma * 6.0, 0.0), uTime * 0.8);
            float cG = caustic(cUV, uTime * 0.8);
            float cB = caustic(cUV - vec2(uChroma * 6.0, 0.0), uTime * 0.8);
            c += vec3(cR, cG, cB) * uCaustics;

            gl_FragColor = vec4(c, 0.92);
          }`,
      });
      m.userData.uniforms = u;
      return registerShader(m);
    },
    dissolve(base = 0xffffff, edge = 0xff6a00, progress = 0.0) {
      const m = new THREE.ShaderMaterial({
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uBase: { value: new THREE.Color(base) },
          uEdge: { value: new THREE.Color(edge) },
          uProgress: { value: progress },
        },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          ${GLSL_NOISE}
          uniform vec3 uBase; uniform vec3 uEdge; uniform float uProgress;
          varying vec3 vP;
          void main(){
            float n = fbm(vP * 5.0);
            if (n < uProgress) discard;
            float edge = smoothstep(uProgress, uProgress + 0.1, n);
            vec3 c = mix(uEdge, uBase, edge);
            gl_FragColor = vec4(c, 1.0);
          }`,
      });
      return registerShader(m);
    },
    forcefield(color = 0x20ccff, freq = 14.0) {
      const m = new THREE.ShaderMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uFreq: { value: freq },
        },
        vertexShader: `
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal);
            vV = normalize(cameraPosition - wp.xyz);
            vP = position;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uTime; uniform float uFreq;
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){
            float f = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 2.0);
            float bands = 0.5 + 0.5 * sin(vP.y * uFreq + uTime * 4.0);
            float rings = 0.5 + 0.5 * sin(length(vP) * uFreq * 0.6 - uTime * 3.0);
            float pulse = mix(bands, rings, 0.5);
            gl_FragColor = vec4(uColor, f * pulse * 0.85);
          }`,
      });
      return registerShader(m);
    },
    iridescence(base = 0xffffff) {
      return new THREE.MeshPhysicalMaterial({
        color: base,
        metalness: 0.6,
        roughness: 0.12,
        iridescence: 1.0,
        iridescenceIOR: 1.5,
        iridescenceThicknessRange: [100, 800],
        clearcoat: 1.0,
      });
    },
    starfield(density = 1.2) {
      const m = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { uTime: { value: 0 }, uDensity: { value: density } },
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          ${GLSL_NOISE}
          uniform float uTime; uniform float uDensity;
          varying vec3 vP;
          float stars(vec3 p){
            p *= 40.0 * uDensity;
            vec3 ip = floor(p); vec3 fp = fract(p);
            float h = hash(ip);
            float d = length(fp - 0.5);
            return smoothstep(0.06, 0.0, d) * step(0.995, h);
          }
          void main(){
            vec3 d = normalize(vP);
            vec3 bg = mix(vec3(0.02, 0.02, 0.08), vec3(0.04, 0.01, 0.12), d.y * 0.5 + 0.5);
            float s = stars(d + vec3(uTime * 0.002, 0.0, 0.0));
            gl_FragColor = vec4(bg + s, 1.0);
          }`,
      });
      return registerShader(m);
    },
    // RGB-split worley caustics. Three wavelength-offset cell samples
    // composite into R/G/B channels so highlights display chromatic
    // fringing — matches the water-simulation reference aesthetic.
    // opts: { color, scale, speed, chroma, intensity, additive }
    caustics(color = 0x80e0ff, opts = {}) {
      if (typeof color === 'object' && !(color instanceof THREE.Color) && !Array.isArray(color) && typeof color !== 'number' && typeof color !== 'string') {
        // called as caustics({color, ...opts})
        opts = color; color = opts.color ?? 0x80e0ff;
      }
      const scale     = opts.scale ?? 3.5;
      const speed     = opts.speed ?? 0.7;
      const chroma    = opts.chroma ?? 0.12;
      const intensity = opts.intensity ?? 1.0;
      const additive  = opts.additive ?? true;
      const m = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: {
          uTime:      { value: 0 },
          uColor:     { value: new THREE.Color(color) },
          uScale:     { value: scale },
          uSpeed:     { value: speed },
          uChroma:    { value: chroma },
          uIntensity: { value: intensity },
        },
        vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          ${GLSL_NOISE}
          uniform vec3 uColor;
          uniform float uTime;
          uniform float uScale;
          uniform float uSpeed;
          uniform float uChroma;
          uniform float uIntensity;
          varying vec2 vUv; varying vec3 vP;
          void main(){
            float t = uTime * uSpeed;
            vec2 p = vUv * uScale;
            // Three chromatic offsets — R wraps one way, G centered, B the
            // other. Cells themselves drift at (slightly) different rates
            // to give the RGB spots an independent, not locked, motion.
            float cR = caustic(p + vec2( uChroma,  uChroma * 0.4), t * 1.00);
            float cG = caustic(p,                                   t * 1.05);
            float cB = caustic(p - vec2( uChroma,  uChroma * 0.4), t * 1.10);
            // Second-octave stacked caustic — gives the shimmering bright
            // centers where cells overlap.
            vec3 hi = vec3(
              caustic(p * 2.1 + 0.3, t * 1.3),
              caustic(p * 2.1,        t * 1.3),
              caustic(p * 2.1 - 0.3,  t * 1.3)
            );
            vec3 col = vec3(cR, cG, cB) + hi * 0.55;
            col *= uIntensity;
            // Tint toward uColor but preserve the chromatic split on bright
            // parts — multiply, so the color is a "glass tint" over the RGB
            // worley rather than flattening it.
            vec3 outCol = col * mix(vec3(1.0), uColor, 0.5);
            float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
            gl_FragColor = vec4(outCol, a);
          }`,
      });
      return registerShader(m);
    },
    // ─── PORTAL — swirling energy rift ──────────────────────────────────
    // Use on a plane or disc to render a magical portal. The shader spins a
    // radial twisted noise field with a rotating inner ring and a bright
    // event-horizon rim. opts: { color, color2?, speed?, swirl?, intensity? }
    portal(color = 0x7f4fff, opts = {}) {
      if (typeof color === 'object' && !(color instanceof THREE.Color) && typeof color !== 'number' && typeof color !== 'string') {
        opts = color; color = opts.color ?? 0x7f4fff;
      }
      const color2    = opts.color2    ?? 0xff4fd0;
      const speed     = opts.speed     ?? 0.6;
      const swirl     = opts.swirl     ?? 3.5;
      const intensity = opts.intensity ?? 1.0;
      const m = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime:      { value: 0 },
          uColor:     { value: new THREE.Color(color) },
          uColor2:    { value: new THREE.Color(color2) },
          uSpeed:     { value: speed },
          uSwirl:     { value: swirl },
          uIntensity: { value: intensity },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          ${GLSL_NOISE}
          uniform float uTime; uniform float uSpeed; uniform float uSwirl; uniform float uIntensity;
          uniform vec3 uColor; uniform vec3 uColor2;
          varying vec2 vUv;
          void main(){
            vec2 p = vUv - 0.5;
            float r = length(p) * 2.0;
            if (r > 1.0) discard;
            float a = atan(p.y, p.x);
            // Twisted radial UV — more twist near the center.
            float twist = uSwirl * (1.0 - r);
            float u = fract((a / 6.2831) + twist + uTime * uSpeed * 0.15);
            float v = r;
            // Noise swirls
            float n = fbmWarped(vec3(u * 6.0, v * 4.0, uTime * uSpeed), uTime * uSpeed);
            float glow = pow(1.0 - r, 2.2);                          // fall-off
            float rim  = smoothstep(0.92, 0.98, r) * (1.0 - smoothstep(0.98, 1.05, r));
            float bands = 0.5 + 0.5 * sin(r * 18.0 - uTime * uSpeed * 6.0);
            vec3 inner  = mix(uColor * 1.2, uColor2 * 1.2, n);
            vec3 outer  = mix(uColor * 0.5, uColor2 * 0.8, bands);
            vec3 col    = mix(outer, inner, glow);
            col += uColor2 * rim * 1.8;               // hot event-horizon rim
            col *= uIntensity;
            float alpha = clamp(glow * 1.2 + rim * 1.3, 0.0, 1.0);
            gl_FragColor = vec4(col, alpha);
          }`,
      });
      return registerShader(m);
    },
    // ─── FLOW-FIELD PARTICLES — organic swirling point cloud ───────────
    // count particles drifting through a 3D noise flow field. No update
    // callback needed; motion is entirely shader-driven via uTime.
    // opts: { color, color2?, count?, bounds?, size?, speed?, swirl? }
    flowParticles(opts = {}) {
      const count  = opts.count  ?? 1400;
      const bounds = opts.bounds ?? { x: 2, y: 2, z: 2 };
      const color  = new THREE.Color(opts.color  || 0x9f6cff);
      const color2 = new THREE.Color(opts.color2 || 0x3ef0ff);
      const size   = opts.size   ?? 28;
      const speed  = opts.speed  ?? 0.25;
      const swirl  = opts.swirl  ?? 1.4;
      const pos = new Float32Array(count * 3);
      const seed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * bounds.x * 2;
        pos[i * 3 + 1] = (Math.random() - 0.5) * bounds.y * 2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * bounds.z * 2;
        seed[i] = Math.random();
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime:   { value: 0 },
          uSize:   { value: size },
          uSpeed:  { value: speed },
          uSwirl:  { value: swirl },
          uColor:  { value: color },
          uColor2: { value: color2 },
          uBounds: { value: new THREE.Vector3(bounds.x, bounds.y, bounds.z) },
        },
        vertexShader: `
          ${GLSL_NOISE}
          uniform float uTime; uniform float uSize; uniform float uSpeed; uniform float uSwirl;
          uniform vec3 uBounds;
          attribute float aSeed;
          varying float vLife;
          varying float vSeed;
          void main(){
            // Flow field: three fbm samples offset per-axis → curl-ish motion.
            vec3 p = position;
            float t = uTime * uSpeed;
            vec3 flow = vec3(
              fbm(p * 0.8 + vec3(0.0, 0.0, t)) - 0.5,
              fbm(p * 0.8 + vec3(5.2, 1.3, t)) - 0.5,
              fbm(p * 0.8 + vec3(-2.1, 3.4, t)) - 0.5
            );
            p += flow * uSwirl * (sin(t + aSeed * 6.28) * 0.5 + 0.5);
            // Wrap around bounds so particles never leave the volume.
            p = mod(p + uBounds, uBounds * 2.0) - uBounds;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * (1.0 - length(p) / length(uBounds) * 0.4) * (1.0 / -mv.z);
            vLife = 0.5 + 0.5 * sin(t * 1.7 + aSeed * 6.28);
            vSeed = aSeed;
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform vec3 uColor2;
          varying float vLife; varying float vSeed;
          void main(){
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;
            float soft = smoothstep(0.5, 0.0, d);
            vec3 col = mix(uColor, uColor2, vSeed);
            gl_FragColor = vec4(col, soft * vLife * 0.75);
          }`,
      });
      const pts = new THREE.Points(geom, mat);
      pts.userData.uniforms = mat.uniforms;
      registerShader(mat);
      return pts;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  // WATER material factory — upgrades any geometry into realistic liquid.
  // Built on top of MeshPhysicalMaterial (full PBR transmission pipeline
  // handles refraction + reflection) with `onBeforeCompile` patches that
  // inject fbm-noise displacement, moving wave normals, and depth tinting.
  // Uniforms advance via the shared `_shaderTicker`.
  // ═══════════════════════════════════════════════════════════════════════
  const waterMaterial = (opts = {}) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: opts.color || 0x5fc8ff,
      metalness: 0,
      // Slightly rougher — fully-glassy (0.03) reads as oil slick, not water.
      roughness: opts.roughness ?? 0.1,
      // Default to partial transmission; full 0.94 makes the water invisible
      // on dark backgrounds. 0.72 leaves enough tint to read as blue liquid
      // while still refracting what's underneath.
      transmission: opts.transmission ?? 0.72,
      ior: 1.33,
      thickness: opts.thickness ?? 0.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: opts.opacity ?? 0.94,
      side: opts.side ?? THREE.DoubleSide,
      depthWrite: false,
      specularIntensity: 1.0,
      // Subtle attenuation — light passing through "deep" water tints.
      attenuationColor: new THREE.Color(opts.deep || 0x0a3e5a),
      attenuationDistance: opts.attenuationDistance ?? 1.2,
    });
    const u = {
      uTime: { value: 0 },
      uWaveAmp: { value: opts.waveAmp ?? 0.025 },
      uWaveFreq: { value: opts.waveFreq ?? 2.2 },
      uFlow: { value: new THREE.Vector3(...(opts.flow || [0, -1, 0])) },
      uDeep: { value: new THREE.Color(opts.deep || 0x0a3e5a) },
      uFoam: { value: new THREE.Color(opts.foam || 0xffffff) },
      uFoamThreshold: { value: opts.foamThreshold ?? 0.78 },
      uCausticStrength: { value: opts.caustics ?? 0.55 },
      uChroma: { value: opts.chroma ?? 0.018 },
    };
    mat.userData.uniforms = u;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uWaveAmp = u.uWaveAmp;
      shader.uniforms.uWaveFreq = u.uWaveFreq;
      shader.uniforms.uFlow = u.uFlow;
      shader.uniforms.uDeep = u.uDeep;
      shader.uniforms.uFoam = u.uFoam;
      shader.uniforms.uFoamThreshold = u.uFoamThreshold;
      shader.uniforms.uCausticStrength = u.uCausticStrength;
      shader.uniforms.uChroma = u.uChroma;

      shader.vertexShader = `
        uniform float uTime;
        uniform float uWaveAmp;
        uniform float uWaveFreq;
        uniform vec3 uFlow;
        varying float vWave;
        varying vec3 vWaveGrad;
        varying vec3 vWorldN;
        varying vec3 vWorldP;
        varying vec3 vViewDir;
        ${GLSL_NOISE}

        // Shared helpers for the wave field — computed in begin_vertex but
        // also needed in beginnormal_vertex so that PBR shading actually
        // follows the waves instead of using flat normals.
        float waterHeight(vec3 flowP) {
          float w1 = fbmWarped(flowP, uTime * 0.5);
          float w2 = fbmWarped(flowP * 2.6 + vec3(uTime * 1.3, 0.0, 0.0), uTime * 0.7);
          return (w1 - 0.5) * 0.65 + (w2 - 0.5) * 0.35;
        }
      ` + shader.vertexShader;

      // Perturb the OBJECT-SPACE NORMAL from the wave gradient BEFORE
      // defaultnormal_vertex runs. Without this, MeshPhysicalMaterial's
      // PBR pipeline uses the original flat normal — the water looks
      // glassy-flat with no highlight movement even though the geometry
      // is displaced. This is the single biggest reason "water doesn't
      // look like water" on a shader-displaced mesh.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        vec3 flowPn = position * uWaveFreq + uFlow * uTime * 0.8;
        float wn  = waterHeight(flowPn);
        float wnx = waterHeight(flowPn + vec3(0.15, 0.0, 0.0)) - wn;
        float wnz = waterHeight(flowPn + vec3(0.0, 0.0, 0.15)) - wn;
        // Perturbation strength scales with wave amplitude.
        vec3 objectNormal = normalize(normal + vec3(-wnx, 0.0, -wnz) * uWaveAmp * 18.0);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif
        `
      );

      // Domain-warped fbm displacement with analytic gradient. Two octaves
      // at different flow speeds produce the "primary swell + surface
      // chop" motion real water has.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        vec3 transformed = vec3(position);
        vec3 flowP = transformed * uWaveFreq + uFlow * uTime * 0.8;
        float wave = waterHeight(flowP);
        transformed += normal * wave * uWaveAmp;
        vWave = wave;
        float dx = waterHeight(flowP + vec3(0.15, 0.0, 0.0)) - wave;
        float dz = waterHeight(flowP + vec3(0.0, 0.0, 0.15)) - wave;
        vWaveGrad = vec3(dx, 1.0, dz);
        vWorldN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vWorldP = wp.xyz;
        vViewDir = normalize(cameraPosition - wp.xyz);
        `
      );

      shader.fragmentShader = `
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        uniform float uFoamThreshold;
        uniform float uTime;
        uniform float uCausticStrength;
        uniform float uChroma;
        varying float vWave;
        varying vec3 vWaveGrad;
        varying vec3 vWorldN;
        varying vec3 vWorldP;
        varying vec3 vViewDir;
        ${GLSL_NOISE}
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        // ── Depth tint ─────────────────────────────────────────────────
        float depthT = clamp(gl_FragCoord.z * 1.5, 0.0, 1.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep, depthT * 0.35);

        // ── Chromatic fresnel (wavelength-dependent IOR) ───────────────
        // Real water refracts red slightly less than blue, so grazing
        // angles show a rainbow fringe. We approximate by using three
        // different Fresnel exponents per channel instead of a single
        // scalar — the surface reads as prismatic at edges without
        // needing a render-target round-trip. The wave gradient is mixed
        // into the normal so the fringing follows the ripple geometry.
        vec3 Nw = normalize(vWorldN + vec3(vWaveGrad.x, 0.0, vWaveGrad.z) * 0.4);
        vec3 V = normalize(vViewDir);
        float ndv = max(dot(Nw, V), 0.0);
        vec3 fringe = vec3(
          pow(1.0 - ndv, 3.4 - uChroma * 20.0),
          pow(1.0 - ndv, 3.8),
          pow(1.0 - ndv, 4.2 + uChroma * 20.0)
        );
        // Grazing edge glow; the per-channel split is the chromatic part.
        gl_FragColor.rgb += fringe * 0.22;

        // ── Animated RGB caustic highlights on the surface ────────────
        // Three offset worley samples on R/G/B act as caustic fringes —
        // the light spots separate by wavelength at high frequencies, which
        // is the signature look of the water-simulation reference.
        vec2 cUV = vWorldP.xz * 2.4 + vWaveGrad.xz * 0.8;
        float cR = caustic(cUV + vec2(uChroma * 6.0, 0.0), uTime * 0.7);
        float cG = caustic(cUV, uTime * 0.7);
        float cB = caustic(cUV - vec2(uChroma * 6.0, 0.0), uTime * 0.7);
        vec3 causticCol = vec3(cR, cG, cB);
        gl_FragColor.rgb += causticCol * uCausticStrength * (1.0 - depthT * 0.6);

        // ── Foam on crests ────────────────────────────────────────────
        float foamMask = smoothstep(uFoamThreshold - 0.1, uFoamThreshold, abs(vWave) * 2.5);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uFoam, foamMask * 0.85);
        gl_FragColor.a = clamp(gl_FragColor.a + foamMask * 0.3, 0.0, 1.0);
        `
      );
    };
    // Register for time-tick updates.
    registerShader({ uniforms: u });
    return mat;
  };
  SHADER.water = (shallow = 0x5fc8ff, deep = 0x0a3e5a) =>
    waterMaterial({ color: shallow, deep, waveAmp: 0.03, waveFreq: 2.2, flow: [0, -1, 0] });

  // MAT.liquid — the UNIFIED liquid material. Every fluid in a scene should
  // use this (or one of the FLUID.* helpers that build on it) so the whole
  // scene renders with consistent wave physics, chromatic caustics, and
  // fresnel. Use directly when you want to wrap your own geometry:
  //   new THREE.Mesh(geom, MAT.liquid({ color: 0x40ff80, waveAmp: 0.008 }))
  MAT.liquid = (opts = {}) => waterMaterial({
    color: opts.color ?? 0x5fc8ff,
    deep:  opts.deep  ?? 0x0a3e5a,
    waveAmp:  opts.waveAmp  ?? 0.015,
    waveFreq: opts.waveFreq ?? 3.0,
    flow: opts.flow || [0.0, -0.2, 0.0],
    caustics: opts.caustics ?? 0.7,
    chroma:   opts.chroma   ?? 0.022,
    transmission: opts.transmission ?? 0.72,
    roughness:    opts.roughness    ?? 0.1,
    foamThreshold: opts.foamThreshold ?? 0.7,
    thickness: opts.thickness ?? 0.4,
  });



  // ═══════════════════════════════════════════════════════════════════════
  // CELESTIAL — star fields, galaxies, nebulae, atmospheric dust.
  // Higher-quality replacements for bare Points. Each returns a single
  // THREE.Points (or Group) driven by custom ShaderMaterial — sized in
  // world space, twinkling, gradient-colored, additive-blended.
  // ═══════════════════════════════════════════════════════════════════════
  const makeStarMaterial = (opts = {}) => {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: opts.size ?? 20 },
        uTwinkle: { value: opts.twinkle ?? 0.6 },
        uBrightness: { value: opts.brightness ?? 1.0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aSeed;
        uniform float uTime;
        uniform float uSize;
        uniform float uTwinkle;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vColor = aColor;
          float tw = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 6.2831);
          vTwinkle = mix(1.0, tw, uTwinkle);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uSize * (1.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uBrightness;
        varying vec3 vColor;
        varying float vTwinkle;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float r = length(p);
          if (r > 0.5) discard;
          float core = smoothstep(0.5, 0.0, r);
          float glare = (max(0.0, 1.0 - abs(p.x) * 24.0) + max(0.0, 1.0 - abs(p.y) * 24.0)) * smoothstep(0.5, 0.15, r);
          float a = (core * 0.8 + glare * 0.25) * uBrightness;
          gl_FragColor = vec4(vColor * vTwinkle, a);
        }`,
    });
    registerShader(m);
    return m;
  };
  const CELESTIAL = {
    starfield(opts = {}) {
      const count = opts.count ?? 600;
      const radius = opts.radius ?? 6;
      const colorA = new THREE.Color(opts.colorA || 0xffffff);
      const colorB = new THREE.Color(opts.colorB || 0xbfd9ff);
      const colorC = new THREE.Color(opts.colorC || 0xffd9a8);
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const sz = new Float32Array(count);
      const sd = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        // Distribute on a sphere shell
        const u = Math.random(), v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radius * (0.85 + Math.random() * 0.3);
        pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.cos(phi);
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        const t = Math.random();
        const c = t < 0.6 ? colorA : (t < 0.85 ? colorB : colorC);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        sz[i] = 0.3 + Math.random() * 1.3;
        sd[i] = Math.random();
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geom.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      geom.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      const pts = new THREE.Points(geom, makeStarMaterial({
        size: opts.size ?? 28,
        twinkle: opts.twinkle ?? 0.7,
        brightness: opts.brightness ?? 0.85,
      }));
      pts.renderOrder = -10;
      pts.frustumCulled = false;
      // Flag as a backdrop so the camera framing in ThreeViewer ignores it
      // when computing the bounding box — otherwise the starfield's large
      // radius forces the camera to back up and the hero object looks tiny.
      pts.userData.excludeFromBBox = true;
      return pts;
    },
    galaxy(opts = {}) {
      const count = opts.count ?? 3500;
      const arms = opts.arms ?? 4;
      const radius = opts.radius ?? 3;
      const inner = new THREE.Color(opts.inner || 0xffd8a0);
      const outer = new THREE.Color(opts.outer || 0x6ca8ff);
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const sz = new Float32Array(count);
      const sd = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const t = Math.pow(Math.random(), 0.5);
        const r = t * radius;
        const arm = Math.floor(Math.random() * arms);
        const armTwist = 3.5;
        const angle = (arm / arms) * Math.PI * 2 + r * armTwist + (Math.random() - 0.5) * 0.6;
        const spread = (1 - t) * 0.15 + 0.05;
        pos[i * 3]     = r * Math.cos(angle) + (Math.random() - 0.5) * spread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.6 * (1 - t);
        pos[i * 3 + 2] = r * Math.sin(angle) + (Math.random() - 0.5) * spread;
        const mix = inner.clone().lerp(outer, t);
        col[i * 3] = mix.r; col[i * 3 + 1] = mix.g; col[i * 3 + 2] = mix.b;
        sz[i] = 0.4 + Math.random() * 1.2;
        sd[i] = Math.random();
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geom.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      geom.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      const mat = makeStarMaterial({ size: opts.size ?? 40, twinkle: 0.25 });
      const pts = new THREE.Points(geom, mat);
      const spin = opts.spin ?? 0.08;
      addUpdateCallback?.(({ time }) => { pts.rotation.y = time * spin; });
      return pts;
    },
    nebulaCloud(opts = {}) {
      const count = opts.count ?? 220;
      const bounds = opts.bounds || { x: 3, y: 2, z: 3 };
      const colorA = new THREE.Color(opts.colorA || 0x6e3dff);
      const colorB = new THREE.Color(opts.colorB || 0xff4fa0);
      const inner = opts.innerRadius ?? 0; // empty ball in the middle so the
                                            // object in the center stays visible
      const dome = opts.dome ?? false;     // half-sphere — drop all points
                                            // below y = 0 so the nebula sits
                                            // behind/above the scene as a
                                            // proper sky dome instead of a
                                            // ball enclosing it.
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const sz = new Float32Array(count);
      const sd = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        let x, y, z, d;
        do {
          x = (Math.random() - 0.5) * bounds.x * 2;
          y = dome ? Math.random() * bounds.y : (Math.random() - 0.5) * bounds.y * 2;
          z = (Math.random() - 0.5) * bounds.z * 2;
          d = Math.sqrt(x * x + y * y + z * z);
        } while (d < inner);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        const c = colorA.clone().lerp(colorB, Math.random());
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        // Smaller defaults so density doesn't sum to white under additive.
        sz[i] = 1.0 + Math.random() * 1.8;
        sd[i] = Math.random();
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geom.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      geom.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      geom.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      const pts = new THREE.Points(geom, makeStarMaterial({
        size: opts.size ?? 34,
        twinkle: 0.12,
        brightness: opts.brightness ?? 0.55,
      }));
      pts.renderOrder = -10;
      pts.frustumCulled = false;
      pts.userData.excludeFromBBox = true;
      return pts;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  // FLUID — particle-driven fluid helpers. These are simulated at the
  // update-callback layer (no full CFD, no external libs). Each returns
  // a THREE.Points (or Group) ready to `root.add`.
  //
  // FLUID.pour({from:Vector3, to:Vector3, rate:particles/sec, color, life})
  // FLUID.pool({bounds, color, count, viscosity})
  // FLUID.splash({at, count, color})
  // FLUID.mist({bounds, density, color})
  // ═══════════════════════════════════════════════════════════════════════
  const FLUID = {
    // ─── FILLED-CONTAINER LIQUID UPGRADE ──────────────────────────────
    // H.fillLiquid builds a solid colored body + a flat surface disc for
    // liquid inside a glass container. The surface defaults to plain
    // MeshPhysicalMaterial, which looks dead next to every other liquid
    // in the scene. This swaps the surface material to the unified
    // waterMaterial so it ripples, caustics, and fresnel-glows like
    // every FLUID.* helper. Use on anything fillLiquid returns:
    //   const liquid = H.fillLiquid(flask, 0x40ff80, { fillLevel: 0.6 });
    //   FLUID.upgradeFill(liquid, { waveAmp: 0.003, caustics: 0.9 });
    // ─── READY-MADE FOUNTAIN BASIN ────────────────────────────────────
    // Stone bowl + gold/obsidian rim + visible water pool + caustic-lit
    // floor — returned as a Group ready to `root.add(...)`. Every call
    // produces visible, rippling blue water so the LLM can't generate a
    // "fountain with invisible water" by accident.
    //
    //   root.add(FLUID.fountainBasin({ radius: 0.6, y: 0.0 }));
    //   root.add(FLUID.fountainBasin({ radius: 0.3, y: 0.35 }));
    //   root.add(FLUID.stream({ from: upperRim, to: lowerCenter, radius: 0.015 }));
    //
    // opts: { radius, y?, depth?, rim?, waterColor?, floorColor? }
    fountainBasin(opts = {}) {
      const R = opts.radius ?? 0.5;
      const y = opts.y ?? 0.0;
      const depth  = opts.depth ?? 0.12;
      const rimMat = opts.rim   || MAT.obsidian;
      const group = new THREE.Group();

      // Closed-contour bowl: outer shell goes up, rim wraps over, inner
      // wall comes down to a real floor. Revolved, this produces a solid
      // bowl visible from any angle — outer wall, top rim, inner wall,
      // and a floor disc that catches transmission from the water above.
      //
      //       _____            ← top rim
      //      /     \           ← outer wall
      //     /   __  \          ← inner wall
      //    |   /  \  |
      //    |  |    | |         ← inner floor at (R*0.82, depth*0.22)
      //     \_|    |_/         ← outer wall bottom
      //       |____|           ← closed bottom at y=0
      //
      const floor  = depth * 0.22;
      const rimY   = depth;
      const inR    = R * 0.86;              // inner rim radius
      const outR   = R * 1.00;              // outer rim radius
      const bowlProfile = [
        new THREE.Vector2(0.001,       0),        // center bottom (near axis)
        new THREE.Vector2(R * 0.90,    0),        // outer bottom
        new THREE.Vector2(outR,        depth * 0.15),
        new THREE.Vector2(outR,        rimY),     // outer rim top
        new THREE.Vector2(inR,         rimY),     // inner rim (top)
        new THREE.Vector2(inR * 0.94,  rimY * 0.7),
        new THREE.Vector2(R * 0.82,    floor),    // inner floor edge
        new THREE.Vector2(0.001,       floor),    // inner floor centre
      ];
      const bowlGeo = new THREE.LatheGeometry(bowlProfile, 128);
      bowlGeo.computeVertexNormals();
      const bowlTex = TEX.stone('#1a1428');
      bowlTex.repeat.set(3, 3);
      const bowlMat = new THREE.MeshPhysicalMaterial({
        color: opts.floorColor ?? 0x3e2a68,
        map: bowlTex,
        roughness: 0.7,
        metalness: 0.1,
        clearcoat: 0.35,
        side: THREE.DoubleSide,            // CRITICAL — bowl interior was
                                            // back-face-culled before.
      });
      const bowl = new THREE.Mesh(bowlGeo, bowlMat);
      bowl.position.y = y;
      bowl.castShadow = true;
      bowl.receiveShadow = true;
      group.add(bowl);

      // Dedicated floor disc inside the bowl — gives the water something
      // solid + textured to refract through. Without this, clear water
      // shows the sky through the basin.
      const poolFloor = new THREE.Mesh(
        new THREE.CircleGeometry(R * 0.82, 96),
        new THREE.MeshPhysicalMaterial({
          color: 0x4a3278,
          map: bowlTex,
          roughness: 0.85,
          metalness: 0.05,
          emissive: 0x1a0a2a,
          emissiveIntensity: 0.35,
        })
      );
      poolFloor.rotation.x = -Math.PI / 2;
      poolFloor.position.y = y + floor + 0.002;
      poolFloor.receiveShadow = true;
      group.add(poolFloor);

      // Gold inlay band at rim.
      const rimTorus = new THREE.Mesh(
        new THREE.TorusGeometry(outR, R * 0.014, 16, 128),
        MAT.gold
      );
      rimTorus.rotation.x = Math.PI / 2;
      rimTorus.position.y = y + rimY;
      rimTorus.castShadow = true;
      group.add(rimTorus);

      // Outer obsidian lip.
      const outerLip = new THREE.Mesh(
        new THREE.TorusGeometry(outR * 1.02, R * 0.022, 16, 128),
        rimMat
      );
      outerLip.rotation.x = Math.PI / 2;
      outerLip.position.y = y + rimY * 0.92;
      outerLip.castShadow = true;
      group.add(outerLip);

      // Water surface — reflector-based ocean water, sitting ~80% up the
      // interior (a visible gap between water and rim is what reads as
      // "pool inside bowl" vs "disc on top").
      const waterR = inR * 0.94;
      const waterGeo = new THREE.CircleGeometry(waterR, 128);
      const water = this.oceanWater(waterGeo, {
        color: opts.waterColor ?? 0x0a86c8,
        distortionScale: 1.6,
        speed: 1.2,
        // Tighter ripples for smaller basins — density scales inversely.
        rippleDensity: Math.max(8.0, 16.0 / Math.max(R, 0.2)),
        textureWidth: 1024,
        textureHeight: 1024,
        normalMapSize: 512,
      });
      water.rotation.x = -Math.PI / 2;
      water.position.y = y + floor + (rimY - floor) * 0.75;
      group.add(water);

      return group;
    },
    upgradeFill(fillGroup, opts = {}) {
      if (!fillGroup || !fillGroup.children) return fillGroup;
      // H.fillLiquid returns a group with [liquidBody, surfaceDisc]. The
      // disc is always the topmost CircleGeometry mesh. Find it without
      // assuming ordering.
      let disc = null;
      fillGroup.traverse((c) => {
        if (c.isMesh && c.geometry && c.geometry.type === 'CircleGeometry') disc = c;
      });
      if (!disc) return fillGroup;
      const color = disc.material.color ? disc.material.color.getHex() : 0x5fc8ff;
      disc.material.dispose?.();
      disc.material = waterMaterial({
        color: opts.color ?? color,
        deep:  opts.deep  ?? 0x0a3e5a,
        waveAmp:  opts.waveAmp  ?? 0.003,        // tiny ripples suit a flask
        waveFreq: opts.waveFreq ?? 8.0,          // tight frequency
        flow: opts.flow || [0.0, 0.0, 0.0],
        caustics: opts.caustics ?? 0.9,
        chroma:   opts.chroma   ?? 0.025,
        transmission: opts.transmission ?? 0.8,
        roughness:    opts.roughness    ?? 0.08,
        foamThreshold: opts.foamThreshold ?? 0.85,
        thickness: opts.thickness ?? 0.2,
      });
      return fillGroup;
    },
    // ─── MESH-BASED WATER (the one you should use for fountains) ───────
    // stream: curved TubeGeometry from A to B, water shader applied.
    // Looks like a real flowing column — not point spray.
    stream(opts = {}) {
      const radius = opts.radius ?? 0.035;
      const segments = opts.segments ?? 48;
      const radialSegs = opts.radialSegs ?? 16;
      // Accept multiple input shapes: explicit `curve`, a Curve passed as
      // `from` (common LLM pattern), an array of points, or the canonical
      // `{from: Vector3, to: Vector3}` pair.
      let curve, from, to;
      const maybeCurve = opts.curve || (opts.from && typeof opts.from.getPoint === 'function' ? opts.from : null);
      const maybePoints = Array.isArray(opts.points) ? opts.points
        : (Array.isArray(opts.from) ? opts.from : null);
      if (maybeCurve) {
        curve = maybeCurve;
        from = curve.getPoint(0);
        to = curve.getPoint(1);
      } else if (maybePoints && maybePoints.length >= 2) {
        curve = new THREE.CatmullRomCurve3(maybePoints.map(p => p.clone ? p.clone() : new THREE.Vector3(p.x, p.y, p.z)));
        from = maybePoints[0];
        to = maybePoints[maybePoints.length - 1];
      } else {
        from = opts.from || new THREE.Vector3(0, 1, 0);
        to = opts.to || new THREE.Vector3(0, 0, 0);
        // Slight lateral arc so the stream reads as falling, not dropping.
        const mid = from.clone().lerp(to, 0.5);
        mid.add(new THREE.Vector3((to.x - from.x) * 0.15, 0, (to.z - from.z) * 0.15));
        curve = new THREE.CatmullRomCurve3([from.clone(), mid, to.clone()]);
      }
      const geom = new THREE.TubeGeometry(curve, segments, radius, radialSegs, false);
      // Per-vertex taper: narrow the bottom 30% so the stream tapers naturally.
      const pos = geom.attributes.position;
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const taper = 1.0 - t * 0.35;
        // The center of each ring of 'radialSegs+1' verts is at the curve point.
        const ringCenter = curve.getPoint(t);
        for (let j = 0; j <= radialSegs; j++) {
          const idx = s * (radialSegs + 1) + j;
          const x = pos.getX(idx), y = pos.getY(idx), z = pos.getZ(idx);
          const dx = x - ringCenter.x, dy = y - ringCenter.y, dz = z - ringCenter.z;
          pos.setXYZ(idx, ringCenter.x + dx * taper, ringCenter.y + dy * taper, ringCenter.z + dz * taper);
        }
      }
      geom.computeVertexNormals();
      // Stream-tuned water material. The shader's vertex displacement on
      // a tube surface produces a sausage-link effect at normal
      // amplitudes — streams need near-zero displacement so the tube
      // stays smooth, plus a higher transmission so the column looks
      // clear (not a thick blue noodle).
      const mat = waterMaterial({
        color: opts.color || 0x88d8ff,
        deep: opts.deep || 0x1a5a8a,
        waveAmp: opts.waveAmp ?? 0.001,       // was 0.012 — way too crinkled
        waveFreq: opts.waveFreq ?? 24.0,
        flow: [0, -1, 0],
        foamThreshold: 0.9,                    // only flash foam at crests
        thickness: 0.15,
        transmission: 0.85,                    // clearer glass column
        roughness: 0.06,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = false; mesh.receiveShadow = false;
      // Optional accent droplets — faint particles around the stream axis.
      const dropCount = opts.droplets ?? 60;
      if (dropCount > 0) {
        const dropGeom = new THREE.BufferGeometry();
        const dpos = new Float32Array(dropCount * 3);
        const dvel = new Float32Array(dropCount);
        for (let i = 0; i < dropCount; i++) {
          const t = Math.random();
          const p = curve.getPoint(t);
          dpos[i * 3] = p.x + (Math.random() - 0.5) * radius * 2.5;
          dpos[i * 3 + 1] = p.y;
          dpos[i * 3 + 2] = p.z + (Math.random() - 0.5) * radius * 2.5;
          dvel[i] = 0.8 + Math.random() * 0.4;
        }
        dropGeom.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
        const dropMat = new THREE.PointsMaterial({
          color: opts.color || 0xbfe8ff,
          size: radius * 0.8,
          transparent: true,
          opacity: 0.75,
          map: SOFT, alphaTest: 0.01,
          sizeAttenuation: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const drops = new THREE.Points(dropGeom, dropMat);
        const yTop = from.y, yBottom = to.y;
        addUpdateCallback?.(({ deltaTime }) => {
          const arr = dropGeom.attributes.position.array;
          for (let i = 0; i < dropCount; i++) {
            arr[i * 3 + 1] -= dvel[i] * deltaTime * (yTop - yBottom);
            if (arr[i * 3 + 1] < yBottom) {
              const t = Math.random();
              const p = curve.getPoint(t);
              arr[i * 3] = p.x + (Math.random() - 0.5) * radius * 2.5;
              arr[i * 3 + 1] = yTop - Math.random() * 0.05;
              arr[i * 3 + 2] = p.z + (Math.random() - 0.5) * radius * 2.5;
            }
          }
          dropGeom.attributes.position.needsUpdate = true;
        });
        const group = new THREE.Group();
        group.add(mesh); group.add(drops);
        return group;
      }
      return mesh;
    },

    // surface: apply the water shader to any geometry you already built
    // (a basin's bowl top, a pond plane, a lake, a puddle). Returns a Mesh.
    surface(geometry, opts = {}) {
      const mat = waterMaterial({
        color: opts.color || 0x5fc8ff,
        deep: opts.deep || 0x0a3e5a,
        waveAmp: opts.waveAmp ?? 0.02,
        waveFreq: opts.waveFreq ?? 4,
        flow: opts.flow || [0.0, -0.15, 0.0],
        foamThreshold: opts.foamThreshold ?? 0.72,
        thickness: opts.thickness ?? 0.6,
        caustics: opts.caustics,
        chroma: opts.chroma,
        transmission: opts.transmission,
        roughness: opts.roughness,
      });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.receiveShadow = true;
      return mesh;
    },

    // ─── OCEAN WATER — THREE.Water with reflection RT (AAA) ─────────────
    // This is the exact technique used by water-simulation.vercel.app:
    // - A hidden Reflector renders the scene into an RT each frame.
    // - The water fragment shader samples that RT with UVs perturbed by
    //   two animated offsets into an RGB-normalmap texture, which
    //   simulates ripple-driven reflection distortion.
    // - Fresnel mixes reflection intensity with a clear water color.
    // - Per-frame `uTime` advancement drives the normalmap scroll.
    //
    // Use this for mirror-pools, lakes, the surface of a scrying basin —
    // anywhere the hero visual is "you see the scene reflected in the
    // water". Use FLUID.surface for a refractive fluid (inside a bowl,
    // an acid pool, a potion surface).
    //
    // opts: { color?, sunColor?, sunDirection?, distortionScale?,
    //         textureWidth?, textureHeight?, normalMap?, speed?, size? }
    oceanWater(geometry, opts = {}) {
      const normals = opts.normalMap || TEX.waterNormal(opts.normalMapSize || 512);
      normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
      const water = new Water(geometry, {
        textureWidth:  opts.textureWidth  ?? 1024,
        textureHeight: opts.textureHeight ?? 1024,
        waterNormals:  normals,
        sunDirection:  opts.sunDirection || new THREE.Vector3(0.35, 0.78, 0.51).normalize(),
        sunColor:      opts.sunColor || 0xffffff,
        // Clear blue default — water-simulation uses a similar hue.
        waterColor:    opts.color ?? 0x0a86c8,
        distortionScale: opts.distortionScale ?? 3.2,
        fog: opts.fog ?? false,
        alpha: opts.alpha ?? 1.0,
        side: THREE.DoubleSide,
      });
      // Ripple tiling density — the Water shader multiplies worldPos.xz
      // by this uniform before sampling the normalmap. Default is 1.0,
      // which is too sparse for sub-meter scenes; 6-12 works for small
      // pools, 1-3 for large lakes.
      water.material.uniforms.size.value = opts.rippleDensity ?? 6.0;
      const speed = opts.speed ?? 1.0;
      addUpdateCallback?.(({ deltaTime }) => {
        water.material.uniforms.time.value += (deltaTime || 1 / 60) * speed;
      });
      water.receiveShadow = true;
      // Mark as a water plane so ThreeViewer's underwater-pass auto-detect
      // can find the water surface Y in world space.
      water.userData.isWaterPlane = true;
      return water;
    },

    // ─── PARTICLE FLUIDS (legacy API kept for compatibility) ────────────
    pour(opts = {}) {
      const from = opts.from || new THREE.Vector3(0, 1, 0);
      const to = opts.to || new THREE.Vector3(0, 0, 0);
      const rate = opts.rate || 40;
      const life = opts.life || 1.5;
      const color = new THREE.Color(opts.color || 0x20b8d0);
      const maxP = Math.ceil(rate * life * 1.2);
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(maxP * 3);
      const vel = new Float32Array(maxP * 3);
      const age = new Float32Array(maxP);
      const alive = new Uint8Array(maxP);
      for (let i = 0; i < maxP; i++) age[i] = 99;
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color, size: opts.size || 0.02, transparent: true, opacity: 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending,
        map: SOFT, alphaTest: 0.01, sizeAttenuation: true,
      });
      const pts = new THREE.Points(geom, mat);
      let accum = 0;
      addUpdateCallback?.(({ deltaTime }) => {
        accum += deltaTime * rate;
        while (accum >= 1) {
          accum -= 1;
          for (let i = 0; i < maxP; i++) {
            if (!alive[i]) {
              pos[i * 3] = from.x + (Math.random() - 0.5) * 0.02;
              pos[i * 3 + 1] = from.y;
              pos[i * 3 + 2] = from.z + (Math.random() - 0.5) * 0.02;
              vel[i * 3] = (to.x - from.x) / life + (Math.random() - 0.5) * 0.1;
              vel[i * 3 + 1] = (to.y - from.y) / life;
              vel[i * 3 + 2] = (to.z - from.z) / life + (Math.random() - 0.5) * 0.1;
              age[i] = 0; alive[i] = 1;
              break;
            }
          }
        }
        for (let i = 0; i < maxP; i++) {
          if (!alive[i]) continue;
          age[i] += deltaTime;
          vel[i * 3 + 1] -= 9.8 * deltaTime * 0.3;
          pos[i * 3] += vel[i * 3] * deltaTime;
          pos[i * 3 + 1] += vel[i * 3 + 1] * deltaTime;
          pos[i * 3 + 2] += vel[i * 3 + 2] * deltaTime;
          if (age[i] > life || pos[i * 3 + 1] < to.y - 0.2) alive[i] = 0;
        }
        geom.attributes.position.needsUpdate = true;
      });
      return pts;
    },
    // Mesh-based splash: instead of flat dots, individual refractive
    // droplet spheres tumble outward from the impact point. The spheres
    // use the shared water shader so they match the stream's look.
    splash(opts = {}) {
      const at = opts.at || new THREE.Vector3();
      const count = Math.min(opts.count || 30, 60);
      const baseColor = opts.color || 0x88d8ff;
      const dropMat = waterMaterial({
        color: baseColor, deep: opts.deep || 0x1a5a8a,
        waveAmp: 0.005, waveFreq: 8, thickness: 0.15, foamThreshold: 1.0,
      });
      const dropGeom = new THREE.SphereGeometry(opts.size || 0.02, 12, 10);
      const group = new THREE.Group();
      const drops = [];
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(dropGeom, dropMat);
        m.position.copy(at);
        const a = Math.random() * Math.PI * 2;
        const s = 0.8 + Math.random() * 0.6;
        drops.push({
          mesh: m,
          vx: Math.cos(a) * s,
          vy: 1.2 + Math.random() * 1.4,
          vz: Math.sin(a) * s,
          age: Math.random() * 0.5,
          origin: at.clone(),
        });
        group.add(m);
      }
      addUpdateCallback?.(({ deltaTime }) => {
        for (const d of drops) {
          d.age += deltaTime;
          d.vy -= 9.8 * deltaTime;
          d.mesh.position.x += d.vx * deltaTime;
          d.mesh.position.y += d.vy * deltaTime;
          d.mesh.position.z += d.vz * deltaTime;
          // Shrink the drop as it ages so it fades into the surface.
          const life = 1.4;
          const fade = Math.max(0.001, 1 - d.age / life);
          d.mesh.scale.setScalar(fade);
          if (d.age > life || d.mesh.position.y < d.origin.y - 0.3) {
            d.mesh.position.copy(d.origin);
            const a = Math.random() * Math.PI * 2;
            const s = 0.8 + Math.random() * 0.6;
            d.vx = Math.cos(a) * s;
            d.vy = 1.2 + Math.random() * 1.4;
            d.vz = Math.sin(a) * s;
            d.age = 0;
            d.mesh.scale.setScalar(1);
          }
        }
      });
      return group;
    },
    pool(opts = {}) {
      const bounds = opts.bounds || { x: 0.4, z: 0.4 };
      const count = opts.count || 400;
      const color = new THREE.Color(opts.color || 0x20b8d0);
      const pos = new Float32Array(count * 3);
      const vel = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * bounds.x * 2;
        pos[i * 3 + 1] = (opts.yBase || 0) + Math.random() * 0.02;
        pos[i * 3 + 2] = (Math.random() - 0.5) * bounds.z * 2;
        vel[i * 3] = (Math.random() - 0.5) * 0.1;
        vel[i * 3 + 1] = 0;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color, size: opts.size || 0.015, transparent: true, opacity: 0.75, depthWrite: false, map: SOFT, alphaTest: 0.01, sizeAttenuation: true });
      const pts = new THREE.Points(geom, mat);
      addUpdateCallback?.(({ time }) => {
        for (let i = 0; i < count; i++) {
          pos[i * 3 + 1] = (opts.yBase || 0) + Math.sin(time * 2 + pos[i * 3] * 10 + pos[i * 3 + 2] * 10) * 0.01;
        }
        geom.attributes.position.needsUpdate = true;
      });
      return pts;
    },
    mist(opts = {}) {
      const bounds = opts.bounds || { x: 0.6, y: 0.4, z: 0.6 };
      const count = opts.count || 180;
      const color = new THREE.Color(opts.color || 0xffffff);
      const pos = new Float32Array(count * 3);
      const vel = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * bounds.x * 2;
        pos[i * 3 + 1] = Math.random() * bounds.y;
        pos[i * 3 + 2] = (Math.random() - 0.5) * bounds.z * 2;
        vel[i * 3] = (Math.random() - 0.5) * 0.05;
        vel[i * 3 + 1] = 0.02 + Math.random() * 0.05;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color, size: opts.size || 0.04, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, map: SOFT, alphaTest: 0.01, sizeAttenuation: true });
      const pts = new THREE.Points(geom, mat);
      // Atmospheric — don't let it drive the camera-framing bbox.
      pts.userData.excludeFromBBox = true;
      addUpdateCallback?.(({ deltaTime }) => {
        for (let i = 0; i < count; i++) {
          pos[i * 3] += vel[i * 3] * deltaTime;
          pos[i * 3 + 1] += vel[i * 3 + 1] * deltaTime;
          pos[i * 3 + 2] += vel[i * 3 + 2] * deltaTime;
          if (pos[i * 3 + 1] > bounds.y) {
            pos[i * 3 + 1] = 0;
            pos[i * 3] = (Math.random() - 0.5) * bounds.x * 2;
            pos[i * 3 + 2] = (Math.random() - 0.5) * bounds.z * 2;
          }
        }
        geom.attributes.position.needsUpdate = true;
      });
      return pts;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  // P — Rapier-backed physics. Lazy-loads the wasm module on first P.init().
  // Typical flow:
  //    await P.init({ gravity: -9.81 });
  //    const ground = new THREE.Mesh(...); root.add(ground);
  //    P.body(ground, { type: 'static', shape: 'box' });
  //    const ball = new THREE.Mesh(...); root.add(ball);
  //    P.body(ball, { shape: 'ball', restitution: 0.7 });
  // ═══════════════════════════════════════════════════════════════════════
  let _rapier = null;
  const P = {
    world: null,
    bodies: [],
    async init(opts = {}) {
      if (!_rapier) {
        const mod = await import('@dimforge/rapier3d-compat');
        // Rapier 0.19 prefers an options object; passing none was the
        // pre-0.19 form and logs a deprecation warning.
        await mod.init({});
        _rapier = mod;
      }
      const g = opts.gravity != null
        ? (typeof opts.gravity === 'number' ? { x: 0, y: opts.gravity, z: 0 } : opts.gravity)
        : { x: 0, y: -9.81, z: 0 };
      P.world = new _rapier.World(g);
      addUpdateCallback?.(({ deltaTime }) => {
        if (!P.world) return;
        P.world.timestep = Math.min(Math.max(deltaTime, 1 / 120), 1 / 30);
        P.world.step();
        for (const b of P.bodies) {
          if (b.rb.bodyType() === 1) continue; // static
          const t = b.rb.translation();
          const r = b.rb.rotation();
          b.mesh.position.set(t.x, t.y, t.z);
          b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        }
      });
      return P;
    },
    body(mesh, opts = {}) {
      if (!P.world || !_rapier) throw new Error('Call `await P.init()` before P.body()');
      const type = opts.type || 'dynamic';
      let desc;
      if (type === 'static') desc = _rapier.RigidBodyDesc.fixed();
      else if (type === 'kinematic') desc = _rapier.RigidBodyDesc.kinematicPositionBased();
      else desc = _rapier.RigidBodyDesc.dynamic();
      desc.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z);
      desc.setRotation({ x: mesh.quaternion.x, y: mesh.quaternion.y, z: mesh.quaternion.z, w: mesh.quaternion.w });
      if (opts.linearDamping != null) desc.setLinearDamping(opts.linearDamping);
      if (opts.angularDamping != null) desc.setAngularDamping(opts.angularDamping);
      const rb = P.world.createRigidBody(desc);
      const geo = mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const hx = Math.max(0.01, (bb.max.x - bb.min.x) / 2 * mesh.scale.x);
      const hy = Math.max(0.01, (bb.max.y - bb.min.y) / 2 * mesh.scale.y);
      const hz = Math.max(0.01, (bb.max.z - bb.min.z) / 2 * mesh.scale.z);
      const shape = opts.shape || 'box';
      // Optional explicit collider sizing. Default derives from the mesh's
      // bounding box, which is usually correct, but opts.radius lets the
      // caller shrink a collider (e.g. gems that should nest together).
      const ballR = opts.radius ?? Math.max(hx, hy, hz);
      const capR  = opts.radius ?? Math.max(hx, hz);
      const capH  = opts.height ?? hy;
      let cDesc;
      if (shape === 'ball') cDesc = _rapier.ColliderDesc.ball(ballR);
      else if (shape === 'capsule') cDesc = _rapier.ColliderDesc.capsule(capH, capR);
      else if (shape === 'cylinder') cDesc = _rapier.ColliderDesc.cylinder(capH, capR);
      else cDesc = _rapier.ColliderDesc.cuboid(opts.hx ?? hx, opts.hy ?? hy, opts.hz ?? hz);
      if (opts.restitution != null) cDesc.setRestitution(opts.restitution);
      if (opts.friction != null) cDesc.setFriction(opts.friction);
      if (opts.density != null) cDesc.setDensity(opts.density);
      P.world.createCollider(cDesc, rb);
      const rec = { mesh, rb };
      P.bodies.push(rec);
      return rec;
    },
    impulse(rec, v) {
      const vec = Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : v;
      rec.rb.applyImpulse(vec, true);
    },
    setLinvel(rec, v) {
      const vec = Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : v;
      rec.rb.setLinvel(vec, true);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  // FX — scene-level effects: volumetric light shafts, instanced scatter,
  // etc. Mesh-based effects that aren't post-processing but change the
  // scene's feel. These are Mancini-style "fake-it-cheaply" primitives.
  // ═══════════════════════════════════════════════════════════════════════
  const FX = {
    // FX.batch([meshes], { material? }) — collapse N meshes of varying
    // geometry into a single THREE.BatchedMesh (r168+) draw call. The
    // input meshes are absorbed: their geometries are copied into the
    // batch, their transforms preserved, and the originals are detached
    // from their parents. Use for scatter/debris/foliage where you want
    // the silhouette of varied props with the perf of a single draw.
    // Falls back to a normal Group if BatchedMesh isn't available.
    batch(meshes, opts = {}) {
      if (!Array.isArray(meshes) || meshes.length === 0) return new THREE.Group();
      if (typeof THREE.BatchedMesh !== 'function') {
        // Older three build — fall back to grouping everything.
        const g = new THREE.Group();
        for (const m of meshes) g.add(m);
        return g;
      }
      // Pre-scan: totals for BatchedMesh capacity.
      let vertCount = 0, indexCount = 0;
      for (const m of meshes) {
        if (!m || !m.geometry) continue;
        vertCount += m.geometry.attributes.position.count;
        indexCount += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
      }
      // Shared material — the batch renders every geometry with ONE
      // material. Pull from the first mesh by default; caller can
      // override via opts.material.
      const mat = opts.material || meshes[0].material || new THREE.MeshStandardMaterial({ color: 0xcccccc });
      const batched = new THREE.BatchedMesh(meshes.length, vertCount, indexCount, mat);
      batched.castShadow = true;
      batched.receiveShadow = true;
      const m4 = new THREE.Matrix4();
      for (const src of meshes) {
        if (!src || !src.geometry) continue;
        const geomClone = src.geometry.clone();
        if (!geomClone.index) geomClone.setIndex(
          [...Array(geomClone.attributes.position.count).keys()]
        );
        // BatchedMesh API (r168+): addGeometry registers the geometry
        // and returns a geometryId; addInstance(geometryId) registers
        // an instance slot and returns the instanceId that setMatrixAt
        // expects. Skipping addInstance makes setMatrixAt throw with
        // "Invalid instanceId" because the instance array is still
        // empty.
        const geomId = batched.addGeometry(geomClone);
        const instanceId = batched.addInstance(geomId);
        src.updateMatrix();
        m4.copy(src.matrix);
        batched.setMatrixAt(instanceId, m4);
        // Detach from any parent so the caller doesn't accidentally
        // keep the old un-batched copy around.
        if (src.parent) src.parent.remove(src);
      }
      return batched;
    },
    // Volumetric god rays via a cone mesh with radial-falloff additive
    // shader. Zero post-process cost, works through windows/portals, no
    // render target needed. Mancini's preferred technique — he noted
    // this beats screen-space god-rays for scene-controlled lighting.
    //
    //   root.add(FX.godRayCone({
    //     from: new THREE.Vector3(0, 3, 0),
    //     to:   new THREE.Vector3(0, 0, 0),
    //     color: 0xffe8a0,
    //     spread: 0.6,
    //     intensity: 0.9,
    //   }));
    godRayCone(opts = {}) {
      const from = opts.from || new THREE.Vector3(0, 3, 0);
      const to   = opts.to   || new THREE.Vector3(0, 0, 0);
      const diff = to.clone().sub(from);
      const len  = diff.length();
      const spread = opts.spread ?? 0.6;
      const color  = opts.color  ?? 0xffe8a0;
      const intensity = opts.intensity ?? 0.9;

      const geom = new THREE.ConeGeometry(spread, len, 32, 1, true);
      // Shift so apex is at origin, base at y=-len.
      geom.translate(0, -len / 2, 0);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uColor:     { value: new THREE.Color(color) },
          uIntensity: { value: intensity },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vH;
          void main(){
            vUv = uv;
            vH = (1.0 - uv.y);           // 1 at apex, 0 at base
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uIntensity;
          varying vec2 vUv; varying float vH;
          void main(){
            // Radial fade from cone axis to edge.
            float r = abs(vUv.x - 0.5) * 2.0;
            float radial = pow(max(0.0, 1.0 - r), 2.5);
            // Height fade: bright near apex, fading to base.
            float height = pow(vH, 1.4);
            float a = radial * height * uIntensity;
            gl_FragColor = vec4(uColor * a, a);
          }`,
      });
      const mesh = new THREE.Mesh(geom, mat);
      // Orient the cone so apex points at `from` and base is at `to`.
      mesh.position.copy(from);
      // Cone default apex is +Y; we shifted so apex is at local origin,
      // base at -Y. Rotate so -Y axis points at `to`.
      const down = new THREE.Vector3(0, -1, 0);
      const dir  = diff.clone().normalize();
      mesh.quaternion.setFromUnitVectors(down, dir);
      mesh.userData.excludeFromBBox = true;
      mesh.renderOrder = 999;
      return mesh;
    },

    // Scatter instances of a prototype mesh across the surface of a
    // target mesh using THREE.MeshSurfaceSampler. The workhorse for
    // foliage, crowds, debris fields — Windland's tree distribution.
    //
    //   const ground = new THREE.Mesh(planeGeom, grassMat);
    //   root.add(ground);
    //   const tree = new THREE.Mesh(treeGeom, treeMat);
    //   root.add(FX.scatter(ground, tree, 300, { scaleRange: [0.8, 1.4] }));
    //
    // opts: { scaleRange?, alignToNormal?, rotateY?, seed? }
    async scatter(targetMesh, protoMesh, count = 100, opts = {}) {
      const { MeshSurfaceSampler } = await import('three/examples/jsm/math/MeshSurfaceSampler.js');
      const sampler = new MeshSurfaceSampler(targetMesh).build();
      const inst = new THREE.InstancedMesh(protoMesh.geometry, protoMesh.material, count);
      const tmpPos = new THREE.Vector3();
      const tmpN   = new THREE.Vector3();
      const tmpM   = new THREE.Matrix4();
      const tmpQ   = new THREE.Quaternion();
      const tmpS   = new THREE.Vector3();
      const up     = new THREE.Vector3(0, 1, 0);
      const [sMin, sMax] = opts.scaleRange || [0.9, 1.1];
      const alignN = opts.alignToNormal !== false;
      const rotY   = opts.rotateY !== false;
      for (let i = 0; i < count; i++) {
        sampler.sample(tmpPos, tmpN);
        if (alignN) tmpQ.setFromUnitVectors(up, tmpN.normalize());
        else tmpQ.identity();
        if (rotY) {
          const yq = new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2);
          tmpQ.multiply(yq);
        }
        const s = sMin + Math.random() * (sMax - sMin);
        tmpS.set(s, s, s);
        tmpM.compose(tmpPos, tmpQ, tmpS);
        inst.setMatrixAt(i, tmpM);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = true;
      inst.receiveShadow = true;
      return inst;
    },

    // Helper: wrap any existing mesh with a fake-glow halo shell. Returns
    // the GROUP (original + shell) so callers can drop it straight into
    // root. Preserves the original mesh's position/rotation via reparenting.
    //
    //   const orb = new THREE.Mesh(sphereGeom, MAT.crystal);
    //   root.add(FX.withGlow(orb, 0x8b5cf6, { scale: 1.08, intensity: 1.3 }));
    withGlow(mesh, color = 0x8b5cf6, opts = {}) {
      const group = new THREE.Group();
      group.add(mesh);
      const shellGeom = mesh.geometry.clone();
      const shellMat  = MAT.fakeGlow({
        color,
        intensity: opts.intensity ?? 1.3,
        power: opts.power ?? 2.5,
      });
      const shell = new THREE.Mesh(shellGeom, shellMat);
      const s = opts.scale ?? 1.07;
      shell.scale.set(s, s, s);
      mesh.add(shell);
      return group;
    },
  };

  return { MAT, TEX, SHADER, FLUID, P, CELESTIAL, FX };
}
