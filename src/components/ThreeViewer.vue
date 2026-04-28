<template>
  <div ref="threeContainer" class="three-container">
    <div class="loading-overlay" v-if="isGenerating">
      <button disabled class="button is-loading is-info is-large"></button>
      <p class="fira-sans-condensed-black-italic">Generating object...</p>
    </div>
    <div class="perf-stats">
      <div class="notification is-info stat-notification">
        <span class="material-symbols-outlined">speed</span>
        <span ref="fpsDisplay" class="fira-sans-condensed-black-italic">
          60 FPS
        </span>
      </div>
      <div class="notification is-info stat-notification">
        <span class="material-symbols-outlined">category</span>
        <span ref="objectCountDisplay" class="fira-sans-condensed-black-italic">
          0 Objects
        </span>
      </div>
    </div>
    <div class="controls-hint">
      <span>🖱️ Drag to orbit • Scroll to zoom • Right-drag to pan</span>
    </div>
  </div>
</template>

<script>
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PMREMGenerator } from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
// Vite resolves `?url` imports to the emitted asset URL so the HDR
// ships correctly with both dev server and packaged Electron renderer.
import skyHdrUrl from "../assets/sky.hdr?url";
// AAA post stack: pmndrs/postprocessing (merged composer) + N8AO (SSAO).
// Replaces the three/examples EffectComposer + UnrealBloomPass +
// SMAAPass + BokehPass + hand-rolled ShaderPasses path. Custom FX
// (FilmGrain, Chromatic, ColorGrade, LensFlare, Underwater, Droplets)
// are now Effect subclasses packed into a single EffectPass so the
// whole chain runs as one merged fullscreen triangle per frame.
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  Effect,
  BloomEffect,
  DepthOfFieldEffect,
  SMAAEffect,
  BlendFunction,
  KernelSize,
} from "postprocessing";
import { N8AOPostPass } from "n8ao";
import { Uniform, Vector2 as PPVector2 } from "three";
// three-mesh-bvh: accelerated raycasts + BVH-based bounds, huge win
// for the lens-flare occlusion sweep and any future collision work.
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from "three-mesh-bvh";
// New weather system (Bruno + Faraz patterns — see recipes/*.md).
import { WeatherSystem } from "../engine/weather/WeatherSystem.js";
import { RainLines }     from "../engine/weather/RainLines.js";
import { LightningBolt } from "../engine/weather/LightningBolt.js";
// CSM disabled — the three/examples/jsm CSM implementation patches
// every material via onBeforeCompile to inject cascade-sampling GLSL,
// and the shader chunks it reaches for no longer exist in r182, so
// every patched program fails to link (`useProgram: program not valid`
// spammed every frame) and the scene renders black. When a maintained
// CSM port lands we can reinstate it; until then the single high-res
// directional in setupLighting handles shadow-casting.
import { markRaw, shallowRef } from "vue";

// Install three-mesh-bvh on the three prototypes once at module load.
// acceleratedRaycast is opt-in per-geometry (via computeBoundsTree) —
// meshes without a boundsTree fall back to the default raycast path,
// so patching is zero-cost for code that doesn't build a BVH.
if (!THREE.BufferGeometry.prototype.computeBoundsTree) {
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

// ═══════════════════════════════════════════════════════════════════════
// CUSTOM EFFECTS (pmndrs/postprocessing Effect subclasses)
// Each subclass carries only the fragment shader + uniform declarations —
// postprocessing supplies the fullscreen vertex shader and pipeline glue.
// The shader entry is `mainImage(const in vec4 inputColor, const in vec2
// uv, out vec4 outputColor)` where inputColor is the previous effect's
// output in the merged pipeline (no tDiffuse sampling needed).
// ═══════════════════════════════════════════════════════════════════════

const filmGrainShader = `
uniform float uTime;
uniform float uStrength;
uniform float uVignette;
float _hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 col = inputColor.rgb;
  float g = _hash(uv * vec2(1920.0, 1080.0) + uTime * 60.0);
  col += (g - 0.5) * uStrength;
  vec2 v = uv - 0.5;
  float vig = 1.0 - dot(v, v) * uVignette * 2.2;
  col *= clamp(vig, 0.0, 1.0);
  outputColor = vec4(col, inputColor.a);
}
`;
class FilmGrainEffect extends Effect {
  constructor() {
    super("FilmGrainEffect", filmGrainShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ["uTime", new Uniform(0)],
        ["uStrength", new Uniform(0.04)],
        ["uVignette", new Uniform(0.25)],
      ]),
    });
  }
  update(_renderer, _inputBuffer, deltaTime) {
    this.uniforms.get("uTime").value += deltaTime;
  }
}

const chromaticShader = `
uniform float uStrength;
uniform float uFalloff;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength < 0.001) { outputColor = inputColor; return; }
  vec2 d = uv - 0.5;
  float r = pow(length(d) * 2.0, uFalloff) * uStrength * 0.04;
  vec2 dir = normalize(d + 1e-6);
  vec4 rC = texture2D(inputBuffer, uv - dir * r);
  vec4 gC = texture2D(inputBuffer, uv);
  vec4 bC = texture2D(inputBuffer, uv + dir * r);
  outputColor = vec4(rC.r, gC.g, bC.b, gC.a);
}
`;
class ChromaticEffect extends Effect {
  constructor() {
    super("ChromaticEffect", chromaticShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ["uStrength", new Uniform(0.0)],
        ["uFalloff", new Uniform(2.2)],
      ]),
    });
  }
}

const colorGradeShader = `
uniform float uHueShift;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
vec3 _rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 _hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 hsv = _rgb2hsv(inputColor.rgb);
  hsv.x = fract(hsv.x + uHueShift / 6.2831);
  hsv.y *= uSaturation;
  vec3 rgb = _hsv2rgb(hsv);
  rgb = (rgb - 0.5) * uContrast + 0.5;
  rgb = rgb * uGain + uLift;
  outputColor = vec4(rgb, inputColor.a);
}
`;
class ColorGradeEffect extends Effect {
  constructor() {
    super("ColorGradeEffect", colorGradeShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ["uHueShift", new Uniform(0)],
        ["uSaturation", new Uniform(1)],
        ["uContrast", new Uniform(1)],
        ["uLift", new Uniform(new THREE.Color(0x000000))],
        ["uGain", new Uniform(new THREE.Color(0xffffff))],
      ]),
    });
  }
}

const lensFlareShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uSunScreen;
uniform float uStrength;
uniform float uOcclusion;
uniform vec3 uTint;
uniform float uAnamorphic;
vec3 _ghost(vec2 uv, vec2 sun, float scale, float falloff, vec3 tint) {
  vec2 dir = sun - vec2(0.5);
  vec2 gUv = vec2(0.5) + dir * scale;
  float d = length(uv - gUv);
  float a = pow(max(0.0, 1.0 - d * falloff), 3.5);
  return tint * a;
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uStrength < 0.001 || uOcclusion < 0.01) { outputColor = inputColor; return; }
  float aspect = uResolution.x / uResolution.y;
  vec3 flare = vec3(0.0);
  flare += _ghost(uv, uSunScreen,  0.5,  22.0, vec3(1.00, 0.86, 0.55));
  flare += _ghost(uv, uSunScreen,  0.2,  35.0, vec3(0.55, 0.80, 1.00));
  flare += _ghost(uv, uSunScreen, -0.1,  28.0, vec3(1.00, 0.55, 0.30));
  flare += _ghost(uv, uSunScreen, -0.3,  32.0, vec3(0.50, 1.00, 0.70));
  flare += _ghost(uv, uSunScreen, -0.5,  25.0, vec3(0.90, 0.50, 0.90));
  flare += _ghost(uv, uSunScreen, -0.8,  40.0, vec3(0.70, 0.70, 1.00));
  float haloD = length(uv - uSunScreen);
  flare += uTint * pow(max(0.0, 1.0 - haloD * 3.2), 5.0) * 1.4;
  vec2 streakD = vec2((uv.x - uSunScreen.x) * 0.12, (uv.y - uSunScreen.y));
  float streak = exp(-dot(streakD * vec2(1.0, 18.0), streakD * vec2(1.0, 18.0)));
  flare += uTint * streak * uAnamorphic * 1.2;
  vec2 rDir = (uv - uSunScreen) * vec2(aspect, 1.0);
  float ang = atan(rDir.y, rDir.x);
  float bursts = pow(0.5 + 0.5 * cos(ang * 8.0 + uTime * 0.3), 20.0);
  flare += uTint * bursts * exp(-length(rDir) * 4.0) * 0.8;
  outputColor = vec4(inputColor.rgb + flare * uStrength * uOcclusion, inputColor.a);
}
`;
class LensFlareEffect extends Effect {
  constructor(rw, rh) {
    super("LensFlareEffect", lensFlareShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ["uTime", new Uniform(0)],
        ["uResolution", new Uniform(new PPVector2(rw, rh))],
        ["uSunScreen", new Uniform(new PPVector2(-10, -10))],
        ["uStrength", new Uniform(0)],
        ["uOcclusion", new Uniform(1)],
        ["uTint", new Uniform(new THREE.Color(0xffd8a8))],
        ["uAnamorphic", new Uniform(1)],
      ]),
    });
  }
  update(_renderer, _inputBuffer, deltaTime) {
    this.uniforms.get("uTime").value += deltaTime;
  }
}

const underwaterShader = `
uniform float uTime;
uniform float uActive;
uniform vec3 uColor;
uniform float uDistort;
uniform float uRays;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uActive < 0.001) { outputColor = inputColor; return; }
  vec2 duv = uv + vec2(
    sin(uv.y * 40.0 + uTime * 1.6) * uDistort,
    sin(uv.x * 30.0 + uTime * 1.2) * uDistort
  );
  vec4 col = texture2D(inputBuffer, duv);
  float tintAmt = uActive * 0.6;
  col.rgb = mix(col.rgb, uColor, tintAmt);
  col.rgb *= mix(1.0, 0.65, uActive);
  float rays = sin(uv.x * 40.0 + sin(uv.y * 3.0 + uTime * 0.4) * 2.0) * 0.5 + 0.5;
  rays *= smoothstep(0.0, 1.0, 1.0 - uv.y);
  col.rgb += vec3(0.7, 0.9, 1.0) * rays * uRays * uActive;
  outputColor = col;
}
`;
class UnderwaterEffect extends Effect {
  constructor() {
    super("UnderwaterEffect", underwaterShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ["uTime", new Uniform(0)],
        ["uActive", new Uniform(0)],
        ["uColor", new Uniform(new THREE.Color(0x0a3c5a))],
        ["uDistort", new Uniform(0.004)],
        ["uRays", new Uniform(0.35)],
      ]),
    });
  }
  update(_renderer, _inputBuffer, deltaTime) {
    this.uniforms.get("uTime").value += deltaTime;
  }
}

const dropletShader = `
uniform float uTime;
uniform vec2 uResolution;
uniform float uDensity;
uniform float uSpeed;
uniform float uSize;
vec2 _hash2(vec2 p){
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
vec3 _cellDroplet(vec2 uv, float t){
  vec2 gridSize = vec2(8.0, 5.0);
  vec2 cellUV = uv * gridSize;
  vec2 cellId = floor(cellUV);
  vec2 cellLocal = fract(cellUV) - 0.5;
  vec2 rnd = _hash2(cellId);
  float fallT = fract(t * uSpeed * (0.6 + rnd.x * 0.8) + rnd.y);
  vec2 center = vec2((rnd.x - 0.5) * 0.6, 0.5 - fallT * 1.0);
  float r = uSize * (0.6 + rnd.x * 0.8);
  float tear = length((cellLocal - center) * vec2(1.0, 0.6));
  float mask = smoothstep(r, r * 0.6, tear);
  float life = smoothstep(0.0, 0.1, fallT) * smoothstep(1.0, 0.8, fallT);
  mask *= life;
  vec2 offs = (cellLocal - center) * mask * 0.35;
  return vec3(mask, offs);
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uDensity <= 0.001) { outputColor = inputColor; return; }
  vec3 d = _cellDroplet(uv, uTime);
  vec2 refractUv = uv + d.yz * 0.08 * uDensity;
  vec3 col;
  col.r = texture2D(inputBuffer, refractUv + d.yz * 0.006).r;
  col.g = texture2D(inputBuffer, refractUv).g;
  col.b = texture2D(inputBuffer, refractUv - d.yz * 0.006).b;
  vec3 baseCol = texture2D(inputBuffer, uv).rgb;
  float hl = smoothstep(0.5, 1.0, d.x) * pow(1.0 - length(d.yz) * 4.0, 4.0);
  col += hl * 0.4;
  vec3 outCol = mix(baseCol, col, clamp(d.x * uDensity * 2.0, 0.0, 1.0));
  outputColor = vec4(outCol, 1.0);
}
`;
class DropletEffect extends Effect {
  constructor(rw, rh) {
    super("DropletEffect", dropletShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ["uTime", new Uniform(0)],
        ["uResolution", new Uniform(new PPVector2(rw, rh))],
        ["uDensity", new Uniform(0)],
        ["uSpeed", new Uniform(0.6)],
        ["uSize", new Uniform(0.07)],
      ]),
    });
  }
  update(_renderer, _inputBuffer, deltaTime) {
    this.uniforms.get("uTime").value += deltaTime;
  }
}

export default {
  name: "ThreeViewer",
  props: {
    hideUI: { type: Boolean, default: false },
    enablePhysics: { type: Boolean, default: true }
  },
  data() {
    return {
      isGenerating: false,
      currentTimeOfDay: "day",
      currentWeather: "sunny",
      lightIntensity: 1.0,
      _envMap: null,
      physics: { world: null, bodies: [], objects: [], constraints: [] },
    };
  },
  setup() {
    const scene = shallowRef(null);
    const camera = shallowRef(null);
    const renderer = shallowRef(null);
    const composer = shallowRef(null);
    const controls = shallowRef(null);
    const clock = shallowRef(null);
    return { scene, camera, renderer, composer, controls, clock };
  },
  created() {
    this._animationId = null;
    this._updateCallbacks = [];
    this._sceneObjects = new Map();
    this._lights = {};
    this._ro = null;
    this._lastFrameTime = 0;
    this._frameCount = 0;
    this._fps = 0;
    this._objectCount = 0;
    this._particleVelocities = [];
    this._weatherParticles = null;
    this._weatherVelocities = [];
    this._targetFogDensity = 0;
    this._rainParticles = null;
    this._rainVelocities = [];
    this._snowParticles = null;
    this._snowVelocities = [];
    this._splashParticles = null;
    this._splashLife = null;
    this._windStrength = 0.5;
    this._lightningEnabled = false;
    this._lightningTimer = 0;
    this._lightningActive = false;
    this._lightningFlashTime = 0;
    this._nextLightning = 5;
    this._cloudLayer2 = null;
    this._lowCloud = null;
    this._cloudGroup = null;
    this._cloudTexture = null;
    this._skyMesh = null;
    this._cloudLayer = null;
    this._stars = null;
    this._celestialBody = null;
    this._celestialGlow = null;
    this._moonCraters = null;
    this._sunRays = null;
    this._sunLight = null;

    // Shim: LLMs often call mesh.computeBoundingBox() instead of mesh.geometry.computeBoundingBox()
    if (!THREE.Mesh.prototype.computeBoundingBox) {
      THREE.Mesh.prototype.computeBoundingBox = function () {
        this.geometry.computeBoundingBox();
      };
      Object.defineProperty(THREE.Mesh.prototype, 'boundingBox', {
        get() { return this.geometry ? this.geometry.boundingBox : null; },
        set(v) { if (this.geometry) this.geometry.boundingBox = v; },
        configurable: true,
      });
    }

    this._presets = {
      sunrise: {
        skyTop: 0x1a1040,
        skyMid: 0xff8866,
        skyBottom: 0xffddaa,
        horizonGlow: 0xffffcc,
        horizonWidth: 0.025,
        horizonIntensity: 1.2,
        ambient: { color: 0xffd4aa, intensity: 1.0 },
        main: { color: 0xffaa66, intensity: 3.0, position: [60, 15, 50] },
        fill: { color: 0x6688cc, intensity: 1.8 },
        hemisphere: { sky: 0xffaa77, ground: 0x554433, intensity: 1.8 },
        fog: { color: 0xffcc99, density: 0.0015 },
        exposure: 1.3,
        moon: 0,
        groundColor: 0x353540,
        celestialColor: 0xffcc66,
        celestialY: 0.06,
        celestialSize: 18,
        bloomStrength: 0.15,
        starsOpacity: 0.15,
        showCelestial: true,
      },
      day: {
        skyTop: 0x1166dd,
        skyMid: 0x55aaff,
        skyBottom: 0xaaddff,
        horizonGlow: 0xffffff,
        horizonWidth: 0.015,
        horizonIntensity: 0.3,
        ambient: { color: 0xffffff, intensity: 0.6 },
        main: { color: 0xfffff8, intensity: 1.8, position: [20, 60, 30] },
        fill: { color: 0x99ccff, intensity: 1.0 },
        hemisphere: { sky: 0x99ddff, ground: 0x887788, intensity: 0.8 },
        fog: { color: 0xccddff, density: 0.0008 },
        exposure: 1.0,
        moon: 0,
        groundColor: 0x404048,
        celestialColor: 0xffffee,
        celestialY: 0.85,
        celestialSize: 15,
        bloomStrength: 0.11,
        starsOpacity: 0,
        showCelestial: false,
      },
      afternoon: {
        skyTop: 0x2266cc,
        skyMid: 0x66aaee,
        skyBottom: 0xddeeff,
        horizonGlow: 0xffeedd,
        horizonWidth: 0.018,
        horizonIntensity: 0.7,
        ambient: { color: 0xfff8ee, intensity: 1.4 },
        main: { color: 0xffeedd, intensity: 3.2, position: [50, 35, 20] },
        fill: { color: 0x88aacc, intensity: 2.2 },
        hemisphere: { sky: 0xaaccee, ground: 0x776655, intensity: 2.2 },
        fog: { color: 0xddeeff, density: 0.001 },
        exposure: 1.35,
        moon: 0,
        groundColor: 0x3a3a42,
        celestialColor: 0xffeedd,
        celestialY: 0.45,
        celestialSize: 16,
        bloomStrength: 0.11,
        starsOpacity: 0,
        showCelestial: false,
      },
      sunset: {
        skyTop: 0x0a0525,
        skyMid: 0xff5533,
        skyBottom: 0xffbb55,
        horizonGlow: 0xffee88,
        horizonWidth: 0.03,
        horizonIntensity: 1.35,
        ambient: { color: 0xffaa77, intensity: 0.9 },
        main: { color: 0xff6633, intensity: 2.8, position: [80, 8, 30] },
        fill: { color: 0x5533aa, intensity: 1.5 },
        hemisphere: { sky: 0xff7744, ground: 0x443322, intensity: 1.6 },
        fog: { color: 0xff8855, density: 0.0018 },
        exposure: 1.25,
        moon: 0,
        groundColor: 0x302530,
        celestialColor: 0xff5500,
        celestialY: 0.02,
        celestialSize: 22,
        bloomStrength: 0.15,
        starsOpacity: 0.25,
        showCelestial: true,
      },
      night: {
        skyTop: 0x000008,
        skyMid: 0x050818,
        skyBottom: 0x0a1530,
        horizonGlow: 0x203050,
        horizonWidth: 0.012,
        horizonIntensity: 0.45,
        ambient: { color: 0x4466aa, intensity: 0.6 },
        main: { color: 0x6688bb, intensity: 1.0, position: [-30, 50, -20] },
        fill: { color: 0x334466, intensity: 0.8 },
        hemisphere: { sky: 0x223355, ground: 0x151520, intensity: 0.9 },
        fog: { color: 0x080c18, density: 0.002 },
        exposure: 1.1,
        moon: 4.0,
        groundColor: 0x181820,
        celestialColor: 0xddeeff,
        celestialY: 0.6,
        celestialSize: 12,
        bloomStrength: 0.08,
        starsOpacity: 1.0,
        showCelestial: true,
      },
    };
    // Weather presets — scene-level only. Each preset bundles:
    //   fog: built-in FogExp2 density (legacy fallback when height-fog off)
    //   rain/snow: particle multipliers 0..1
    //   cloudOpacity / lightning / windStrength / ambientDim: atmospherics
    //   lensDroplets: screen-space lens rain 0..1
    //   heightFog: {density, distortion, color, direction} for the
    //     domain-warped fBm fog (Faraz Shaikh port). Apply sceneWide.
    this._weatherPresets = {
      sunny: {
        fog: 0, rain: 0, snow: 0, cloudOpacity: 0, lightning: false,
        windStrength: 0.2, ambientDim: 1.0, lensDroplets: 0,
        heightFog: null,
      },
      cloudy: {
        fog: 0.004, rain: 0, snow: 0, cloudOpacity: 0.7, lightning: false,
        windStrength: 0.5, ambientDim: 0.7, lensDroplets: 0,
        heightFog: { density: 0.008, distortion: 0.6, color: 0x9ba3b0,
                     direction: { x: 0.02, y: 0, z: 0.015 } },
      },
      // Fog density recalibrated for hero-object framing (scenes ~50m
      // across). Previous values were tuned for landscape scenes and
      // produced a solid grey band blocking the horizon. Densities
      // below have been roughly halved so the horizon visibly fades
      // without becoming opaque. Distortion also dialed back so fog
      // reads as a soft haze rather than heavy swirling puffs.
      rainy: {
        fog: 0.006, rain: 1.0, snow: 0, cloudOpacity: 0.85, lightning: false,
        windStrength: 1.5, ambientDim: 0.5, lensDroplets: 0.45,
        heightFog: { density: 0.008, distortion: 0.4, color: 0x545b68,
                     direction: { x: 0.08, y: 0, z: 0.05 } },
      },
      stormy: {
        fog: 0.009, rain: 1.0, snow: 0, cloudOpacity: 0.95, lightning: true,
        windStrength: 3.0, ambientDim: 0.3, lensDroplets: 0.75,
        heightFog: { density: 0.012, distortion: 0.6, color: 0x2a303a,
                     direction: { x: 0.15, y: 0, z: 0.1 } },
      },
      snowy: {
        fog: 0.004, rain: 0, snow: 1.0, cloudOpacity: 0.75, lightning: false,
        windStrength: 0.8, ambientDim: 0.6, lensDroplets: 0,
        heightFog: { density: 0.006, distortion: 0.4, color: 0xd6dce4,
                     direction: { x: 0.04, y: 0, z: 0.03 } },
      },
      blizzard: {
        fog: 0.012, rain: 0, snow: 1.0, cloudOpacity: 0.95, lightning: false,
        windStrength: 4.0, ambientDim: 0.35, lensDroplets: 0,
        heightFog: { density: 0.016, distortion: 0.6, color: 0xc0c8d2,
                     direction: { x: 0.2, y: 0, z: 0.15 } },
      },
      foggy: {
        fog: 0.018, rain: 0, snow: 0, cloudOpacity: 0.4, lightning: false,
        windStrength: 0.3, ambientDim: 0.55, lensDroplets: 0,
        heightFog: { density: 0.025, distortion: 0.8, color: 0x8a94a3,
                     direction: { x: 0.01, y: 0, z: 0.01 } },
      },
    };
  },
  async mounted() {
    await this.$nextTick();
    await this.initThree();
    window.addEventListener("resize", this.onWindowResize);
  },
  beforeUnmount() {
    this.cleanup();
  },
  methods: {
    initPhysicsWorld() {
      const world = new CANNON.World();
      world.gravity.set(0, -9.82, 0);
      world.broadphase = new CANNON.SAPBroadphase(world);
      world.allowSleep = true;
      world.solver.iterations = 10;
      this.physics.world = world;
      const groundShape = new CANNON.Plane();
      const groundBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        mass: 0,
        shape: groundShape,
      });
      groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      this.physics.world.addBody(groundBody);
      this.physics.groundBody = groundBody;
      const groundBoxShape = new CANNON.Box(new CANNON.Vec3(100, 0.5, 100));
      const groundBoxBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        mass: 0,
        shape: groundBoxShape,
        position: new CANNON.Vec3(0, -0.5, 0),
      });
      this.physics.world.addBody(groundBoxBody);
      const defaultMaterial = new CANNON.Material("default");
      const defaultContact = new CANNON.ContactMaterial(
        defaultMaterial,
        defaultMaterial,
        { friction: 0.4, restitution: 0.3 }
      );
      world.addContactMaterial(defaultContact);
      world.defaultContactMaterial = defaultContact;
    },
    async initThree() {
      let el = this.$refs.threeContainer;
      if (!el) {
        await this.$nextTick();
        el = this.$refs.threeContainer;
        if (!el) return;
      }
      const rect = el.getBoundingClientRect();
      let width = Math.floor(rect.width || 640),
        height = Math.floor(rect.height || 360);
      if (width <= 0) width = 640;
      if (height <= 0) height = 360;
      const scene = new THREE.Scene();
      // Fog FULLY REMOVED. Was producing a visible horizon band against
      // the starfield/particle background. Pristine horizon requires
      // no distance fog at all.
      scene.fog = null;
      scene.background = null;
      this.scene = markRaw(scene);
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 3000);
      camera.position.set(4, 3, 5);
      camera.lookAt(0, 0.8, 0);
      this.camera = markRaw(camera);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
      });
      renderer.setSize(width, height, true);
      // Full Retina — was previously capped at 1.5, which renders a
      // 2.0-DPR display at 75% native resolution and reads as soft /
      // low-res throughout. Cap at 2 to avoid worst-case 3x cost on
      // ultra-high-density displays.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.useLegacyLights = false;
      renderer.localClippingEnabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer = markRaw(renderer);
      renderer.debug.checkShaderErrors = false;
      while (el.firstChild && el.firstChild.tagName === "CANVAS") {
        el.removeChild(el.firstChild);
      }
      el.insertBefore(renderer.domElement, el.firstChild);
      const pmremGen = new PMREMGenerator(renderer);
      pmremGen.compileEquirectangularShader();
      this.renderer.setClearColor(0x000000, 0);
      try {
        const hdrLoader = new RGBELoader();
        const hdrUrl = new URL("../assets/sky.hdr", import.meta.url).href;
        const hdrTexture = await hdrLoader.loadAsync(hdrUrl);
        hdrTexture.encoding = THREE.LinearEncoding;
        hdrTexture.wrapS = hdrTexture.wrapT = THREE.ClampToEdgeWrapping;
        const envMap = pmremGen.fromEquirectangular(hdrTexture).texture;
        this._envMap = envMap;
        scene.environment = envMap;
        scene.environmentIntensity = 0.7;
        this.renderer.toneMappingExposure = 1.1;
        hdrTexture.dispose();
      } catch (e) {
        console.warn("HDR Environment failed:", e);
      }
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.minDistance = 1.0;
      controls.maxDistance = 60.0;
      // Clamp camera above ground. `maxPolarAngle` is the max angle
      // from the orbit target's +Y axis. π/2 = horizontal; anything
      // larger puts the camera below the target. Previous value of
      // `Math.PI * 0.85` (153°) allowed the camera to dip deep below
      // the ground plane. Cap just past horizontal so the user can
      // glance slightly down but never go under the scene.
      controls.maxPolarAngle = Math.PI / 2 + 0.05;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.65;
      this.controls = markRaw(controls);
      this.clock = markRaw(new THREE.Clock());
      this.setupSkySphere();
      this.setupCloudShell();
      this.setupStars();
      this.setupCelestialBody();
      this.setupSunRays();
      this.setupLighting();
      this.setupEnvironment();
      this.setupPostProcessing();
      this.setupWeatherSystem();
      if (typeof ResizeObserver !== "undefined") {
        this._ro = new ResizeObserver((entries) => {
          const cr = entries[0]?.contentRect;
          if (!cr || !this.renderer || !this.camera) return;
          const w = Math.max(1, Math.floor(cr.width)),
            h = Math.max(1, Math.floor(cr.height));
          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();
          this.renderer.setSize(Math.min(w, 3000), Math.min(h, 3000), true);
          if (this.composer)
            this.composer.setSize(Math.min(w, 3000), Math.min(h, 3000));
        });
        this._ro.observe(el);
      }
      this.initPhysicsWorld();
      this.setupDragControls();
      this.applyEnvironmentPreset("day");
      // Apply the default render-quality preset ("high") — tunable by
      // the user via setRenderQuality("low"|"medium"|"high"|"ultra").
      this.setRenderQuality("high");
      this.startRenderLoop();
    },
    setupDragControls() {
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      let dragging = null;
      let dragOffset = new THREE.Vector3();
      const el = this.$refs.threeContainer;

      const getIntersects = (event) => {
        const rect = el.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, this.camera);

        const draggables = [];
        this.scene.traverse((obj) => {
          if (obj.userData?.isDraggable || obj.parent?.userData?.isDraggable) {
            draggables.push(obj);
          }
        });
        return raycaster.intersectObjects(draggables, true);
      };

      const onMouseDown = (event) => {
        if (event.button !== 2) return; // Right click only
        event.preventDefault();
        const intersects = getIntersects(event);
        if (intersects.length > 0) {
          let target = intersects[0].object;
          // Walk up to find draggable parent (group)
          while (target && !target.userData?.isDraggable && target.parent) {
            target = target.parent;
          }
          if (target?.userData?.isDraggable) {
            this.controls.enabled = false;
            dragging = target;
            plane.setFromNormalAndCoplanarPoint(
              new THREE.Vector3(0, 1, 0),
              intersects[0].point
            );
            const intersection = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, intersection);
            dragOffset.copy(dragging.position).sub(intersection);
            el.style.cursor = "grabbing";
          }
        }
      };

      const onMouseMove = (event) => {
        if (dragging) {
          const rect = el.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, this.camera);
          const intersection = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(plane, intersection)) {
            const newPos = intersection.add(dragOffset);
            dragging.position.x = newPos.x;
            dragging.position.z = newPos.z;
            // Update physics body if exists
            if (dragging.userData?.physicsBody) {
              const body = dragging.userData.physicsBody;
              body.position.x = newPos.x;
              body.position.z = newPos.z;
              body.velocity.set(0, 0, 0);
              body.angularVelocity.set(0, 0, 0);
            }
          }
        } else {
          // Hover cursor
          const intersects = getIntersects(event);
          let foundDraggable = false;
          for (const hit of intersects) {
            let target = hit.object;
            while (target && !target.userData?.isDraggable && target.parent)
              target = target.parent;
            if (target?.userData?.isDraggable) {
              foundDraggable = true;
              break;
            }
          }
          el.style.cursor = foundDraggable ? "grab" : "grab";
        }
      };

      const onMouseUp = () => {
        if (dragging) {
          // Apply impulse based on movement if has physics
          if (dragging.userData?.physicsBody) {
            const body = dragging.userData.physicsBody;
            body.wakeUp();
          }
          dragging = null;
          this.controls.enabled = true;
          el.style.cursor = "grab";
        }
      };

      el.addEventListener("mousedown", onMouseDown);
      el.addEventListener("mousemove", onMouseMove);
      el.addEventListener("mouseup", onMouseUp);
      el.addEventListener("mouseleave", onMouseUp);

      this._dragCleanup = () => {
        el.removeEventListener("mousedown", onMouseDown);
        el.removeEventListener("mousemove", onMouseMove);
        el.removeEventListener("mouseup", onMouseUp);
        el.removeEventListener("mouseleave", onMouseUp);
      };
    },
    makePhysicsHelpers() {
      const world = this.physics.world;
      return {
        box({ x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1 }) {
          const shape = new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));
          const body = new CANNON.Body({ mass: 0 });
          body.addShape(shape);
          body.position.set(x, y, z);
          world.addBody(body);
          return body;
        },
        bodyForMesh(mesh, mass = 1, shape = null) {
          if (!shape) {
            mesh.geometry.computeBoundingBox();
            const b = mesh.geometry.boundingBox;
            const size = new THREE.Vector3();
            b.getSize(size);
            shape = new CANNON.Box(
              new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)
            );
          }
          const body = new CANNON.Body({ mass });
          body.addShape(shape);
          body.position.copy(mesh.position);
          body.quaternion.copy(mesh.quaternion);
          this.physics.world.addBody(body);
          body.__mesh = mesh;
          this.physics.objects.push(body);
          return body;
        },
      };
    },
    /* COMPREHENSIVE HELPERS - Low-poly RPG items, physics, interactivity */
    _getSoftCircleTexture() {
      // Shared soft-edged circular sprite so PointsMaterial renders as
      // rounded motes instead of flat squares. Built once, cached on the
      // component instance.
      if (this.__softCircleTex) return this.__softCircleTex;
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0.0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.65)");
      grad.addColorStop(0.75, "rgba(255,255,255,0.12)");
      grad.addColorStop(1.0, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      this.__softCircleTex = t;
      return t;
    },
    createHelpers(addUpdateCallback) {
      const self = this;
      const SOFT = this._getSoftCircleTexture();
      return {
        // ═══════════════════════════════════════════════════════════════════
        // MATERIAL HELPERS - Realistic & Stylized
        // ═══════════════════════════════════════════════════════════════════
        // Realistic PBR materials
        glass: (color = 0xffffff, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0,
            roughness: o.roughness ?? 0.05,
            transmission: o.transmission ?? 0.95,
            thickness: o.thickness ?? 0.15,
            ior: o.ior ?? 1.5,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            transparent: true,
            ...o,
          }),
        gem: (color = 0xff0000, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0,
            roughness: 0.03,
            transmission: 0.92,
            thickness: 1.5,
            ior: o.ior ?? 1.8,
            clearcoat: 1,
            emissive: color,
            emissiveIntensity: o.glow ?? 0.25,
            transparent: true,
            ...o,
          }),
        metal: (color = 0xffd700, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 1,
            roughness: o.roughness ?? 0.2,
            clearcoat: o.clearcoat ?? 0.8,
            emissive: color,
            emissiveIntensity: o.glow ?? 0.1,
            ...o,
          }),
        matte: (color = 0x888888, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: o.metalness ?? 0.05,
            roughness: o.roughness ?? 0.7,
            clearcoat: o.clearcoat ?? 0.2,
            ...o,
          }),
        glow: (color = 0x00ffff, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            emissive: color,
            emissiveIntensity: o.intensity ?? 0.8,
            metalness: 0,
            roughness: 0.3,
            transparent: true,
            opacity: o.opacity ?? 1,
            ...o,
          }),
        // H.liquid(color, opts) — material only (for manual geometry)
        liquid: (color = 0xff0000, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            roughness: o.roughness ?? 0.2,
            metalness: 0.02,
            clearcoat: 0.5,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: o.opacity ?? 0.88,
            depthWrite: false,
            side: THREE.DoubleSide,
            ...o,
          }),
        // H.fillLiquid(containerMesh, color, opts) — builds liquid geometry that
        // perfectly matches the container's interior. Works by extracting the
        // LatheGeometry profile (or using bbox for other geometry types),
        // trimming at fill height, and capping with a surface disc.
        // fillLevel: 0-1 (default 0.7 = 70% full). inset: shrink factor (default 0.93).
        fillLiquid: (containerMesh, color = 0xff0000, o = {}) => {
          const fill = o.fillLevel ?? 0.7;
          const inset = o.inset ?? 0.93;
          const geo = containerMesh.geometry;
          if (!geo.boundingBox) geo.computeBoundingBox();
          const gBox = geo.boundingBox;
          const gMinY = gBox.min.y;
          const gMaxY = gBox.max.y;
          const gHeight = gMaxY - gMinY;
          const fillY = gMinY + gHeight * fill;

          // Realistic liquid — dense colored body visible through transmission glass.
          // Uses opacity-only transparency (NO transmission) so the glass container's
          // transmission pipeline renders correctly on top. The liquid appears as a
          // solid colored volume; the glass refracts it naturally.
          const liqOpacity = o.opacity ?? 0.88;
          const liquidMat = new THREE.MeshPhysicalMaterial({
            color,
            roughness: 0.2,
            metalness: 0.02,
            clearcoat: 0.5,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: liqOpacity,
            depthWrite: false,
            side: THREE.DoubleSide,
          });

          let liquidGeo;
          let surfaceRadius;

          // Try to extract LatheGeometry profile for perfect liquid shape
          if (geo.parameters && geo.parameters.points) {
            const origPoints = geo.parameters.points;
            const segments = geo.parameters.segments || 64;
            const CENTER_THRESH = 0.02; // points with r < this are center-axis closures, not wall

            // Find the INTERIOR WALL of the container: skip center-axis
            // closure points (r ≈ 0) which are structural, not wall geometry.
            // Also skip any points past a neck closure (where r returns to ≈ 0
            // mid-profile, e.g. vials with flared lips above a sealed neck).
            const wallPoints = [];
            let passedFirstWall = false;
            for (let i = 0; i < origPoints.length; i++) {
              const pt = origPoints[i];
              const r = pt.x;

              // Once we've seen real wall points and hit center again, stop —
              // we've reached the neck closure (interior ends here)
              if (passedFirstWall && r < CENTER_THRESH) break;

              // Skip center-axis closure points
              if (r < CENTER_THRESH) continue;

              passedFirstWall = true;

              if (pt.y <= fillY) {
                wallPoints.push(new THREE.Vector2(r * inset, pt.y));
              } else {
                // Interpolate the exact fill-level crossing
                if (i > 0) {
                  const prev = origPoints[i - 1];
                  const prevR = Math.max(prev.x, CENTER_THRESH);
                  if (prev.y < fillY) {
                    const t = (fillY - prev.y) / (pt.y - prev.y);
                    const interpR = prevR + (r - prevR) * t;
                    wallPoints.push(new THREE.Vector2(interpR * inset, fillY));
                  }
                }
                break;
              }
            }

            if (wallPoints.length >= 2) {
              const bottomY = gMinY; // Use geometry bbox min, not first wall point
              surfaceRadius = wallPoints[wallPoints.length - 1].x;

              // Build closed profile: center-bottom → wall bottom-to-top → center-top
              const profile = [new THREE.Vector2(0.001, bottomY)];
              for (const wp of wallPoints) profile.push(wp);
              profile.push(new THREE.Vector2(0.001, fillY));

              liquidGeo = new THREE.LatheGeometry(profile, segments);
            }
          }

          // Fallback for non-Lathe geometries: use a cylinder matching bbox
          if (!liquidGeo) {
            const rX = (gBox.max.x - gBox.min.x) / 2 * inset;
            const rZ = (gBox.max.z - gBox.min.z) / 2 * inset;
            const r = Math.max(rX, rZ);
            const liquidH = gHeight * fill;
            liquidGeo = new THREE.CylinderGeometry(r, r, liquidH, 32, 1, false);
            liquidGeo.translate(0, gMinY + liquidH / 2, 0);
            surfaceRadius = r;
          }

          const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
          // Surface disc at fill level (visible meniscus — glossy top of liquid)
          if (!surfaceRadius) surfaceRadius = (gBox.max.x - gBox.min.x) / 2 * inset * 0.9;
          const surfaceGeo = new THREE.CircleGeometry(surfaceRadius, 64);
          const surfaceMat = new THREE.MeshPhysicalMaterial({
            color,
            roughness: 0.05,
            metalness: 0.05,
            clearcoat: 1.0,
            clearcoatRoughness: 0.0,
            transparent: true,
            opacity: liqOpacity * 0.95,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
          surface.rotation.x = -Math.PI / 2;
          surface.position.y = fillY; // geometry-local — group carries world transform

          // The lathe liquid geometry was authored in the container's
          // GEOMETRY-LOCAL frame (Y values come from the container's
          // bbox). The cleanest way to place it correctly is to make
          // the liquid a CHILD of the container — three.js then handles
          // every transform (tilt, gimbal nesting, animation) for free.
          //
          // We auto-parent here. If the user-level code does
          // `someGroup.add(liquidGroup)` afterwards, three.js will
          // move the liquid out of the container and the engine's
          // _snapLiquidsToContainers post-pass moves it back. So
          // either ignoring the return value or doing the obvious
          // root.add(...) both produce a correctly-placed liquid.
          const group = new THREE.Group();
          group.name = "liquid_fill";
          group.add(liquidMesh);
          group.add(surface);
          // Tag for the post-layout validator. The validator finds the
          // group by name + this userData ref and snaps it back into
          // the container if user code moved it out.
          group.userData.liquidContainer = containerMesh;
          // Auto-parent. Identity local transform — geometry already
          // matches the container's local frame.
          containerMesh.add(group);
          return group;
        },
        fire: (o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color: o.color ?? 0xff6600,
            emissive: o.color ?? 0xff4400,
            emissiveIntensity: o.intensity ?? 1.2,
            metalness: 0,
            roughness: 0.5,
            transparent: true,
            opacity: o.opacity ?? 0.9,
            side: THREE.DoubleSide,
            ...o,
          }),
        ice: (color = 0xaaddff, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0,
            roughness: 0.15,
            transmission: 0.85,
            thickness: 1.2,
            ior: 1.31,
            clearcoat: 1,
            emissive: 0x88ccff,
            emissiveIntensity: 0.1,
            ...o,
          }),
        lava: (o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color: o.color ?? 0xff2200,
            emissive: 0xff4400,
            emissiveIntensity: o.intensity ?? 1.5,
            metalness: 0.3,
            roughness: 0.6,
            ...o,
          }),
        leather: (color = 0x8b4513, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0,
            roughness: o.roughness ?? 0.8,
            clearcoat: 0.15,
            ...o,
          }),
        velvet: (color = 0x660066, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0,
            roughness: 0.95,
            sheen: 1,
            sheenRoughness: 0.3,
            sheenColor: new THREE.Color(color).multiplyScalar(1.5),
            ...o,
          }),

        // LOW-POLY / STYLIZED materials (flat shading, no reflections)
        lowPoly: (color = 0x888888, o = {}) => {
          const m = new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            ...o,
          });
          return m;
        },
        toon: (color = 0x888888, o = {}) => {
          const m = new THREE.MeshToonMaterial({ color, ...o });
          return m;
        },
        cartoon: (color = 0x888888, o = {}) =>
          new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0,
            roughness: 1,
            clearcoat: 0,
            flatShading: true,
            ...o,
          }),

        // ═══════════════════════════════════════════════════════════════════
        // LIGHT HELPERS
        // ═══════════════════════════════════════════════════════════════════
        light: (color = 0xffffff, intensity = 2, distance = 5) => {
          const l = new THREE.PointLight(color, intensity, distance);
          l.castShadow = false;
          return l;
        },
        spot: (color = 0xffffff, intensity = 2, o = {}) => {
          const l = new THREE.SpotLight(color, intensity);
          l.angle = o.angle ?? Math.PI / 6;
          l.penumbra = o.penumbra ?? 0.3;
          l.distance = o.distance ?? 10;
          return l;
        },

        // ═══════════════════════════════════════════════════════════════════
        // PARTICLE HELPERS (auto-animated)
        // ═══════════════════════════════════════════════════════════════════
        particles: (count = 50, o = {}) => {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array(count * 3);
          const spread = o.spread ?? 1,
            baseY = o.baseY ?? 0.5,
            heightRange = o.heightRange ?? 1;
          for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * spread * 2;
            pos[i * 3 + 1] = baseY + Math.random() * heightRange;
            pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
          }
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          const mat = new THREE.PointsMaterial({
            color: o.color ?? 0xffffff,
            size: o.size ?? 0.05,
            transparent: true,
            opacity: o.opacity ?? 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            map: SOFT, alphaTest: 0.01, sizeAttenuation: true,
          });
          return new THREE.Points(geo, mat);
        },
        sparks: (count = 30, o = {}) => {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array(count * 3);
          const vels = [];
          const spread = o.spread ?? 0.5,
            baseY = o.baseY ?? 0;
          for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * spread * 2;
            pos[i * 3 + 1] = baseY + Math.random() * 0.5;
            pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
            vels.push({
              x: (Math.random() - 0.5) * 0.3,
              y: 0.5 + Math.random() * 0.8,
              z: (Math.random() - 0.5) * 0.3,
            });
          }
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          const mat = new THREE.PointsMaterial({
            color: o.color ?? 0xff6600,
            size: o.size ?? 0.08,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            map: SOFT, alphaTest: 0.01, sizeAttenuation: true,
          });
          const pts = new THREE.Points(geo, mat);
          pts.userData = { vels, baseY, maxY: o.maxY ?? 2, spread, excludeFromBBox: true };
          addUpdateCallback(({ deltaTime }) => {
            const p = pts.geometry.attributes.position.array;
            for (let i = 0; i < count; i++) {
              p[i * 3] += pts.userData.vels[i].x * deltaTime;
              p[i * 3 + 1] += pts.userData.vels[i].y * deltaTime;
              p[i * 3 + 2] += pts.userData.vels[i].z * deltaTime;
              if (p[i * 3 + 1] > pts.userData.maxY) {
                p[i * 3] = (Math.random() - 0.5) * pts.userData.spread * 2;
                p[i * 3 + 1] = pts.userData.baseY;
                p[i * 3 + 2] = (Math.random() - 0.5) * pts.userData.spread * 2;
              }
            }
            pts.geometry.attributes.position.needsUpdate = true;
          });
          return pts;
        },
        bubbles: (count = 20, o = {}) => {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array(count * 3);
          const vels = [];
          const spread = o.spread ?? 0.3,
            baseY = o.baseY ?? 0,
            height = o.height ?? 1;
          for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * spread * 2;
            pos[i * 3 + 1] = baseY + Math.random() * height;
            pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
            vels.push({
              y: 0.1 + Math.random() * 0.2,
              wobble: Math.random() * Math.PI * 2,
            });
          }
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          const mat = new THREE.PointsMaterial({
            color: o.color ?? 0xffffff,
            size: o.size ?? 0.04,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            map: SOFT, alphaTest: 0.01, sizeAttenuation: true,
          });
          const pts = new THREE.Points(geo, mat);
          pts.userData = { vels, baseY, maxY: baseY + height, spread, excludeFromBBox: true };
          addUpdateCallback(({ deltaTime, time }) => {
            const p = pts.geometry.attributes.position.array;
            for (let i = 0; i < count; i++) {
              p[i * 3] +=
                Math.sin(time * 2 + pts.userData.vels[i].wobble) *
                deltaTime *
                0.1;
              p[i * 3 + 1] += pts.userData.vels[i].y * deltaTime;
              p[i * 3 + 2] +=
                Math.cos(time * 2 + pts.userData.vels[i].wobble) *
                deltaTime *
                0.1;
              if (p[i * 3 + 1] > pts.userData.maxY) {
                p[i * 3] = (Math.random() - 0.5) * pts.userData.spread * 2;
                p[i * 3 + 1] = pts.userData.baseY;
                p[i * 3 + 2] = (Math.random() - 0.5) * pts.userData.spread * 2;
              }
            }
            pts.geometry.attributes.position.needsUpdate = true;
          });
          return pts;
        },
        smoke: (count = 40, o = {}) => {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array(count * 3);
          const vels = [];
          const spread = o.spread ?? 0.5,
            baseY = o.baseY ?? 0;
          for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * spread * 2;
            pos[i * 3 + 1] = baseY + Math.random();
            pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
            vels.push({
              x: (Math.random() - 0.5) * 0.2,
              y: 0.15 + Math.random() * 0.2,
              z: (Math.random() - 0.5) * 0.2,
            });
          }
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          const mat = new THREE.PointsMaterial({
            color: o.color ?? 0x888888,
            size: o.size ?? 0.15,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            map: SOFT, alphaTest: 0.01, sizeAttenuation: true,
          });
          const pts = new THREE.Points(geo, mat);
          pts.userData = { vels, baseY, maxY: o.maxY ?? 3, spread, excludeFromBBox: true };
          addUpdateCallback(({ deltaTime }) => {
            const p = pts.geometry.attributes.position.array;
            for (let i = 0; i < count; i++) {
              p[i * 3] += pts.userData.vels[i].x * deltaTime;
              p[i * 3 + 1] += pts.userData.vels[i].y * deltaTime;
              p[i * 3 + 2] += pts.userData.vels[i].z * deltaTime;
              if (p[i * 3 + 1] > pts.userData.maxY) {
                p[i * 3] = (Math.random() - 0.5) * pts.userData.spread * 2;
                p[i * 3 + 1] = pts.userData.baseY;
                p[i * 3 + 2] = (Math.random() - 0.5) * pts.userData.spread * 2;
              }
            }
            pts.geometry.attributes.position.needsUpdate = true;
          });
          return pts;
        },
        dust: (count = 50, o = {}) => {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array(count * 3);
          const spread = o.spread ?? 2;
          for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * spread * 2;
            pos[i * 3 + 1] = Math.random() * 2;
            pos[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
          }
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          const mat = new THREE.PointsMaterial({
            color: o.color ?? 0xffffee,
            size: o.size ?? 0.03,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            map: SOFT, alphaTest: 0.01, sizeAttenuation: true,
          });
          const pts = new THREE.Points(geo, mat);
          pts.userData.excludeFromBBox = true;
          addUpdateCallback(({ time }) => {
            const p = pts.geometry.attributes.position.array;
            for (let i = 0; i < count; i++) {
              p[i * 3] += Math.sin(time * 0.5 + i) * 0.001;
              p[i * 3 + 1] += Math.sin(time * 0.3 + i * 0.5) * 0.001;
              p[i * 3 + 2] += Math.cos(time * 0.4 + i) * 0.001;
            }
            pts.geometry.attributes.position.needsUpdate = true;
          });
          return pts;
        },

        // ═══════════════════════════════════════════════════════════════════
        // BASIC MESH HELPERS
        // ═══════════════════════════════════════════════════════════════════
        mesh: (geometry, material) => {
          const m = new THREE.Mesh(geometry, material);
          m.castShadow = true;
          m.receiveShadow = true;
          return m;
        },

        // ═══════════════════════════════════════════════════════════════════
        // LOW-POLY RPG ITEM HELPERS
        // ═══════════════════════════════════════════════════════════════════

        // Crystals & Gems
        crystal: (o = {}) => {
          const sides = o.sides ?? 6,
            height = o.height ?? 0.6,
            radius = o.radius ?? 0.2;
          const geo = new THREE.ConeGeometry(radius, height, sides);
          geo.translate(0, height / 2, 0);
          const mat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.color ?? 0x9966ff,
                flatShading: true,
                transparent: true,
                opacity: 0.9,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.color ?? 0x9966ff,
                transmission: 0.8,
                thickness: 1,
                ior: 1.8,
                roughness: 0.1,
                metalness: 0,
                emissive: o.color ?? 0x9966ff,
                emissiveIntensity: o.glow ?? 0.2,
              });
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true;
          return m;
        },
        gemstone: (o = {}) => {
          const geo =
            o.shape === "round"
              ? new THREE.IcosahedronGeometry(o.size ?? 0.15, 0)
              : new THREE.OctahedronGeometry(o.size ?? 0.15, 0);
          const mat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.color ?? 0xff0066,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.color ?? 0xff0066,
                transmission: 0.85,
                thickness: 1.5,
                ior: 2.0,
                roughness: 0.05,
                emissive: o.color ?? 0xff0066,
                emissiveIntensity: 0.15,
              });
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true;
          return m;
        },

        // Coins & Currency
        coin: (o = {}) => {
          const geo = new THREE.CylinderGeometry(
            o.radius ?? 0.15,
            o.radius ?? 0.15,
            o.thickness ?? 0.03,
            o.lowPoly ? 12 : 32
          );
          const mat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.color ?? 0xffd700,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.color ?? 0xffd700,
                metalness: 1,
                roughness: 0.3,
                clearcoat: 0.5,
              });
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true;
          return m;
        },

        // Heart shape
        heart: (o = {}) => {
          const shape = new THREE.Shape();
          const s = o.size ?? 0.3;
          shape.moveTo(0, s * 0.3);
          shape.bezierCurveTo(0, s * 0.6, -s * 0.5, s * 0.8, -s * 0.5, s * 0.5);
          shape.bezierCurveTo(-s * 0.5, s * 0.2, 0, 0, 0, -s * 0.3);
          shape.bezierCurveTo(0, 0, s * 0.5, s * 0.2, s * 0.5, s * 0.5);
          shape.bezierCurveTo(s * 0.5, s * 0.8, 0, s * 0.6, 0, s * 0.3);
          const geo = new THREE.ExtrudeGeometry(shape, {
            depth: o.depth ?? 0.15,
            bevelEnabled: !o.lowPoly,
            bevelThickness: 0.02,
            bevelSize: 0.02,
            bevelSegments: o.lowPoly ? 1 : 3,
          });
          geo.center();
          const mat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.color ?? 0xff3366,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.color ?? 0xff3366,
                roughness: 0.4,
                metalness: 0.1,
                clearcoat: 0.3,
              });
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true;
          return m;
        },

        // Star shape
        star: (o = {}) => {
          const points = o.points ?? 5,
            outer = o.outer ?? 0.25,
            inner = o.inner ?? 0.12;
          const shape = new THREE.Shape();
          for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? outer : inner;
            const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
            if (i === 0) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          shape.closePath();
          const geo = new THREE.ExtrudeGeometry(shape, {
            depth: o.depth ?? 0.08,
            bevelEnabled: false,
          });
          geo.center();
          const mat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.color ?? 0xffdd00,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.color ?? 0xffdd00,
                metalness: 0.8,
                roughness: 0.3,
              });
          const m = new THREE.Mesh(geo, mat);
          m.castShadow = true;
          return m;
        },

        // Key
        key: (o = {}) => {
          const g = new THREE.Group();
          const mat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.color ?? 0xd4a84b,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.color ?? 0xd4a84b,
                metalness: 0.9,
                roughness: 0.35,
              });
          // Handle (ring)
          const handle = new THREE.Mesh(
            new THREE.TorusGeometry(
              o.handleSize ?? 0.12,
              0.025,
              8,
              o.lowPoly ? 6 : 16
            ),
            mat
          );
          handle.rotation.y = Math.PI / 2;
          handle.position.y = 0.35;
          handle.castShadow = true;
          g.add(handle);
          // Shaft
          const shaft = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.4, 0.02),
            mat
          );
          shaft.position.y = 0.08;
          shaft.castShadow = true;
          g.add(shaft);
          // Teeth
          const teeth1 = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.025, 0.02),
            mat
          );
          teeth1.position.set(0.04, -0.08, 0);
          teeth1.castShadow = true;
          g.add(teeth1);
          const teeth2 = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.025, 0.02),
            mat
          );
          teeth2.position.set(0.03, -0.12, 0);
          teeth2.castShadow = true;
          g.add(teeth2);
          return g;
        },

        // Potion bottles (various shapes)
        potionBottle: (o = {}) => {
          const g = new THREE.Group();
          const shape = o.shape ?? "round"; // round, flask, vial, diamond
          const liquidColor = o.liquidColor ?? 0xff3333;
          const glassColor = o.glassColor ?? 0xaaddff;
          let bottleGeo, liquidGeo;

          if (shape === "round") {
            bottleGeo = new THREE.SphereGeometry(
              0.25,
              o.lowPoly ? 8 : 24,
              o.lowPoly ? 6 : 18
            );
            bottleGeo.scale(1, 1.05, 1); // Less stretched
            liquidGeo = new THREE.SphereGeometry(
              0.23, // A bit larger
              o.lowPoly ? 8 : 24,
              o.lowPoly ? 6 : 18
            );
            liquidGeo.scale(1, 0.95, 1); // Scaled to fit

          } else if (shape === "flask") {
            bottleGeo = new THREE.CylinderGeometry(
              0.08,
              0.22,
              0.5,
              o.lowPoly ? 8 : 16
            );
            liquidGeo = new THREE.CylinderGeometry(
              0.06,
              0.19,
              0.42,
              o.lowPoly ? 8 : 16
            );
          } else if (shape === "vial") {
            bottleGeo = new THREE.CylinderGeometry(
              0.08,
              0.08,
              0.5,
              o.lowPoly ? 8 : 16
            );
            liquidGeo = new THREE.CylinderGeometry(
              0.065,
              0.065,
              0.4,
              o.lowPoly ? 8 : 16
            );
          } else {
            // diamond
            bottleGeo = new THREE.OctahedronGeometry(0.25, 0);
            bottleGeo.scale(1, 1.5, 1);
            liquidGeo = new THREE.OctahedronGeometry(0.21, 0);
            liquidGeo.scale(1, 1.4, 1);
          }

          // Liquid FIRST (inside)
          const liqMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: liquidColor,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: liquidColor,
                transmission: 0.5,
                thickness: 1,
                ior: 1.33,
                roughness: 0.1,
                emissive: o.glow ? liquidColor : 0x000000,
                emissiveIntensity: o.glow ? 0.4 : 0,
              });
          const liquid = new THREE.Mesh(liquidGeo, liqMat);
                    bottleGeo.computeBoundingBox();
          liquidGeo.computeBoundingBox();
          const bottleMinY = bottleGeo.boundingBox.min.y;
          const liquidHeight = liquidGeo.boundingBox.max.y - liquidGeo.boundingBox.min.y;
          liquid.position.y = 0.35 + bottleMinY + liquidHeight / 2 + 0.02; // a bit of margin
          liquid.castShadow = true;
          g.add(liquid);

          // Glass bottle SECOND (outside) - needs to render after liquid
          const glassMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: glassColor,
                transparent: true,
                opacity: 0.35,
                flatShading: true,
                depthWrite: false,
              })
            : new THREE.MeshPhysicalMaterial({
                color: glassColor,
                transmission: 0.9,
                thickness: 0.5,
                ior: 1.5,
                roughness: 0.05,
                transparent: true,
              });
          const bottle = new THREE.Mesh(bottleGeo, glassMat);
          bottle.position.y = 0.35;
          bottle.castShadow = true;
          bottle.renderOrder = 1;
          g.add(bottle);

          // Cork
          const corkMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: 0x8b5a2b,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: 0x8b5a2b,
                roughness: 0.9,
              });
          const corkY =
            shape === "round" ? 0.65 : shape === "diamond" ? 0.72 : 0.62;
          const cork = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.07, 0.08, o.lowPoly ? 8 : 12),
            corkMat
          );
          cork.position.y = corkY;
          cork.castShadow = true;
          g.add(cork);

          // Glow light for non-lowpoly or if explicitly requested
          if (o.glow) {
            const glow = new THREE.PointLight(
              liquidColor,
              o.lowPoly ? 1.0 : 1.5,
              2
            );
            glow.position.y = 0.35;
            g.add(glow);
          }

          // Diamonds
          if (o.diamonds) {
            const diamondGeo = new THREE.OctahedronGeometry(0.02, 0);
            const diamondMat = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              transmission: 1.0,
              ior: 2.4,
              roughness: 0,
            });
            for (let i = 0; i < 5; i++) {
              const diamond = new THREE.Mesh(diamondGeo, diamondMat);
              diamond.position.set(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2 + 0.2,
                (Math.random() - 0.5) * 0.2
              );
              diamond.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
              );
              g.add(diamond);
            }
          }

          // Liquid physics sloshing effect
          g.userData.liquid = liquid;
          g.userData.bottle = bottle;
          let time = 0;
          const liquidUpdate = ({ deltaTime }) => {
            time += deltaTime;
            const { liquid, bottle, lastPos } = g.userData;
            if (!liquid || !bottle) return;

            if (!lastPos) {
              g.userData.lastPos = new THREE.Vector3();
              bottle.getWorldPosition(g.userData.lastPos);
            }

            const currentPos = bottle.getWorldPosition(new THREE.Vector3());
            const velocity = new THREE.Vector3()
              .subVectors(currentPos, g.userData.lastPos)
              .divideScalar(deltaTime);
            g.userData.lastPos.copy(currentPos);

            // Sloshing effect
            liquid.rotation.z = -velocity.x * 0.5;
            liquid.rotation.x = velocity.z * 0.5;

            // Gentle bobbing
            const initialY = 0.35 + bottleMinY + liquidHeight / 2 + 0.02;
            liquid.position.y = initialY + Math.sin(time * 5) * 0.005;
          };

          if (o.addUpdateCallback) {
            o.addUpdateCallback(liquidUpdate);
          }

          return g;
        },

        // Sword
        sword: (o = {}) => {
          const g = new THREE.Group();
          const bladeMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.bladeColor ?? 0xcccccc,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.bladeColor ?? 0xcccccc,
                metalness: 1,
                roughness: 0.2,
                clearcoat: 0.8,
              });
          const handleMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.handleColor ?? 0x4a3728,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.handleColor ?? 0x4a3728,
                roughness: 0.8,
              });
          const guardMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.guardColor ?? 0xffd700,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.guardColor ?? 0xffd700,
                metalness: 0.9,
                roughness: 0.3,
              });

          // Blade
          const bladeLen = o.bladeLength ?? 0.8;
          const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, bladeLen, 0.02),
            bladeMat
          );
          blade.position.y = bladeLen / 2 + 0.15;
          blade.castShadow = true;
          g.add(blade);
          // Guard
          const guard = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.04, 0.06),
            guardMat
          );
          guard.position.y = 0.12;
          guard.castShadow = true;
          g.add(guard);
          // Handle
          const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.035, 0.18, o.lowPoly ? 6 : 12),
            handleMat
          );
          handle.position.y = 0;
          handle.castShadow = true;
          g.add(handle);
          // Pommel
          const pommel = new THREE.Mesh(
            new THREE.SphereGeometry(
              0.04,
              o.lowPoly ? 6 : 12,
              o.lowPoly ? 4 : 8
            ),
            guardMat
          );
          pommel.position.y = -0.12;
          pommel.castShadow = true;
          g.add(pommel);

          return g;
        },

        // Axe
        axe: (o = {}) => {
          const g = new THREE.Group();
          const bladeMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.bladeColor ?? 0x888888,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.bladeColor ?? 0x888888,
                metalness: 0.9,
                roughness: 0.3,
              });
          const handleMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.handleColor ?? 0x5c4033,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.handleColor ?? 0x5c4033,
                roughness: 0.85,
              });

          // Handle
          const handle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.04, 0.7, o.lowPoly ? 6 : 12),
            handleMat
          );
          handle.castShadow = true;
          g.add(handle);
          // Axe head (wedge shape)
          const headShape = new THREE.Shape();
          headShape.moveTo(0, -0.15);
          headShape.lineTo(0.2, -0.12);
          headShape.lineTo(0.25, 0);
          headShape.lineTo(0.2, 0.12);
          headShape.lineTo(0, 0.15);
          headShape.lineTo(0, -0.15);
          const headGeo = new THREE.ExtrudeGeometry(headShape, {
            depth: 0.04,
            bevelEnabled: false,
          });
          headGeo.center();
          const head = new THREE.Mesh(headGeo, bladeMat);
          head.position.set(0.12, 0.28, 0);
          head.rotation.y = Math.PI / 2;
          head.castShadow = true;
          g.add(head);

          return g;
        },

        // Shield
        shield: (o = {}) => {
          const g = new THREE.Group();
          const shape = o.shape ?? "heater"; // heater, round, kite
          const frameMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.frameColor ?? 0x222222,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.frameColor ?? 0x222222,
                metalness: 0.3,
                roughness: 0.7,
              });
          const faceMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.faceColor ?? 0xcc2222,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.faceColor ?? 0xcc2222,
                metalness: 0.2,
                roughness: 0.6,
              });
          const trimMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.trimColor ?? 0xffd700,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.trimColor ?? 0xffd700,
                metalness: 0.9,
                roughness: 0.3,
              });

          let shieldGeo;
          if (shape === "round") {
            shieldGeo = new THREE.CylinderGeometry(
              0.4,
              0.4,
              0.06,
              o.lowPoly ? 12 : 32
            );
            shieldGeo.rotateX(Math.PI / 2);
          } else {
            // Heater/kite shield shape
            const s = new THREE.Shape();
            s.moveTo(0, 0.5);
            s.quadraticCurveTo(0.35, 0.45, 0.35, 0.2);
            s.lineTo(0.3, -0.2);
            s.quadraticCurveTo(0.15, -0.5, 0, -0.55);
            s.quadraticCurveTo(-0.15, -0.5, -0.3, -0.2);
            s.lineTo(-0.35, 0.2);
            s.quadraticCurveTo(-0.35, 0.45, 0, 0.5);
            shieldGeo = new THREE.ExtrudeGeometry(s, {
              depth: 0.08,
              bevelEnabled: true,
              bevelThickness: 0.02,
              bevelSize: 0.02,
              bevelSegments: o.lowPoly ? 1 : 2,
            });
            shieldGeo.center();
          }

          const shield = new THREE.Mesh(shieldGeo, faceMat);
          shield.castShadow = true;
          g.add(shield);

          // Center boss/medallion
          const boss = new THREE.Mesh(
            new THREE.SphereGeometry(
              0.08,
              o.lowPoly ? 8 : 16,
              o.lowPoly ? 6 : 12
            ),
            trimMat
          );
          boss.position.z = 0.06;
          boss.castShadow = true;
          g.add(boss);

          // Studs around edge
          if (o.studs !== false) {
            const studCount = o.lowPoly ? 8 : 12;
            for (let i = 0; i < studCount; i++) {
              const angle = (i / studCount) * Math.PI * 2;
              const r = shape === "round" ? 0.35 : 0.32;
              const stud = new THREE.Mesh(
                new THREE.SphereGeometry(0.025, 6, 4),
                trimMat
              );
              stud.position.set(
                Math.sin(angle) * r,
                Math.cos(angle) * r * (shape === "round" ? 1 : 0.9),
                0.05
              );
              stud.castShadow = true;
              g.add(stud);
            }
          }

          return g;
        },

        // Book
        book: (o = {}) => {
          const g = new THREE.Group();
          const coverMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.coverColor ?? 0x8b4513,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.coverColor ?? 0x8b4513,
                roughness: 0.8,
              });
          const pageMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: 0xfff8dc,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: 0xfff8dc,
                roughness: 0.9,
              });
          const trimMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.trimColor ?? 0xffd700,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.trimColor ?? 0xffd700,
                metalness: 0.8,
                roughness: 0.3,
              });

          if (o.open) {
            // Open book
            const leftCover = new THREE.Mesh(
              new THREE.BoxGeometry(0.35, 0.03, 0.45),
              coverMat
            );
            leftCover.position.set(-0.18, 0.015, 0);
            leftCover.rotation.z = -0.1;
            leftCover.castShadow = true;
            g.add(leftCover);
            const rightCover = new THREE.Mesh(
              new THREE.BoxGeometry(0.35, 0.03, 0.45),
              coverMat
            );
            rightCover.position.set(0.18, 0.015, 0);
            rightCover.rotation.z = 0.1;
            rightCover.castShadow = true;
            g.add(rightCover);
            const pages = new THREE.Mesh(
              new THREE.BoxGeometry(0.32, 0.08, 0.42),
              pageMat
            );
            pages.position.y = 0.05;
            pages.castShadow = true;
            g.add(pages);
          } else {
            // Closed book
            const cover = new THREE.Mesh(
              new THREE.BoxGeometry(0.3, 0.08, 0.4),
              coverMat
            );
            cover.castShadow = true;
            g.add(cover);
            const pages = new THREE.Mesh(
              new THREE.BoxGeometry(0.28, 0.06, 0.38),
              pageMat
            );
            pages.position.x = 0.01;
            pages.castShadow = true;
            g.add(pages);
            const spine = new THREE.Mesh(
              new THREE.BoxGeometry(0.02, 0.082, 0.402),
              trimMat
            );
            spine.position.x = -0.15;
            spine.castShadow = true;
            g.add(spine);
          }

          return g;
        },

        // Scroll
        scroll: (o = {}) => {
          const g = new THREE.Group();
          const paperMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.color ?? 0xfff5e1,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.color ?? 0xfff5e1,
                roughness: 0.85,
              });
          const woodMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: 0x5c4033,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: 0x5c4033,
                roughness: 0.8,
              });

          // Paper roll
          const paper = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 0.5, o.lowPoly ? 8 : 16),
            paperMat
          );
          paper.rotation.z = Math.PI / 2;
          paper.castShadow = true;
          g.add(paper);
          // Wooden ends
          const end1 = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.55, o.lowPoly ? 6 : 12),
            woodMat
          );
          end1.rotation.z = Math.PI / 2;
          end1.castShadow = true;
          g.add(end1);
          // End caps
          const cap1 = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 6, 4),
            woodMat
          );
          cap1.position.x = 0.28;
          cap1.castShadow = true;
          g.add(cap1);
          const cap2 = cap1.clone();
          cap2.position.x = -0.28;
          g.add(cap2);

          return g;
        },

        // Chest
        chest: (o = {}) => {
          const g = new THREE.Group();
          const woodMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.woodColor ?? 0x6b4423,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.woodColor ?? 0x6b4423,
                roughness: 0.75,
              });
          const metalMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.metalColor ?? 0xffd700,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.metalColor ?? 0xffd700,
                metalness: 0.9,
                roughness: 0.3,
              });

          const w = o.width ?? 0.5,
            h = o.height ?? 0.3,
            d = o.depth ?? 0.35;

          // Base
          const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat);
          base.position.y = h / 2;
          base.castShadow = true;
          g.add(base);

          // Lid (curved top)
          const lidGeo = new THREE.CylinderGeometry(
            d / 2,
            d / 2,
            w,
            o.lowPoly ? 8 : 16,
            1,
            false,
            0,
            Math.PI
          );
          lidGeo.rotateZ(Math.PI / 2);
          const lid = new THREE.Mesh(lidGeo, woodMat);
          lid.position.y = h;
          lid.castShadow = true;
          if (o.open) {
            lid.rotation.x = -0.8;
            lid.position.z = -d / 2 + 0.05;
            lid.position.y = h + 0.1;
          }
          g.add(lid);

          // Metal bands
          const band1 = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02),
            metalMat
          );
          band1.position.y = h / 3;
          band1.castShadow = true;
          g.add(band1);
          const band2 = band1.clone();
          band2.position.y = (2 * h) / 3;
          g.add(band2);

          // Lock
          const lock = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.08, 0.03),
            metalMat
          );
          lock.position.set(0, h, d / 2 + 0.02);
          lock.castShadow = true;
          g.add(lock);

          // Corner studs
          const corners = [
            [w / 2, 0, d / 2],
            [-w / 2, 0, d / 2],
            [w / 2, 0, -d / 2],
            [-w / 2, 0, -d / 2],
          ];
          corners.forEach(([x, y, z]) => {
            const stud = new THREE.Mesh(
              new THREE.SphereGeometry(0.025, 6, 4),
              metalMat
            );
            stud.position.set(x * 0.95, y + 0.03, z * 0.95);
            stud.castShadow = true;
            g.add(stud);
          });

          return g;
        },

        // Crown
        crown: (o = {}) => {
          const g = new THREE.Group();
          const goldMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.color ?? 0xffd700,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.color ?? 0xffd700,
                metalness: 1,
                roughness: 0.2,
                clearcoat: 0.5,
              });
          const gemMat = o.lowPoly
            ? new THREE.MeshLambertMaterial({
                color: o.gemColor ?? 0xff0000,
                flatShading: true,
              })
            : new THREE.MeshPhysicalMaterial({
                color: o.gemColor ?? 0xff0000,
                transmission: 0.8,
                ior: 1.8,
                roughness: 0.1,
              });

          // Base ring
          const base = new THREE.Mesh(
            new THREE.TorusGeometry(
              0.2,
              0.04,
              o.lowPoly ? 6 : 12,
              o.lowPoly ? 12 : 32
            ),
            goldMat
          );
          base.rotation.x = Math.PI / 2;
          base.castShadow = true;
          g.add(base);

          // Points
          const pointCount = o.points ?? 5;
          for (let i = 0; i < pointCount; i++) {
            const angle = (i / pointCount) * Math.PI * 2;
            const point = new THREE.Mesh(
              new THREE.ConeGeometry(0.04, 0.15, o.lowPoly ? 4 : 8),
              goldMat
            );
            point.position.set(
              Math.cos(angle) * 0.2,
              0.1,
              Math.sin(angle) * 0.2
            );
            point.castShadow = true;
            g.add(point);
            // Gem on each point
            const gem = new THREE.Mesh(
              new THREE.SphereGeometry(0.025, 6, 4),
              gemMat
            );
            gem.position.set(
              Math.cos(angle) * 0.2,
              0.18,
              Math.sin(angle) * 0.2
            );
            gem.castShadow = true;
            g.add(gem);
          }

          return g;
        },

        // Ring (jewelry)
        ring: (radius = 0.15, tube = 0.04, mat = null) => {
          const m = new THREE.Mesh(
            new THREE.TorusGeometry(radius, tube, 16, 32),
            mat ||
              new THREE.MeshPhysicalMaterial({
                color: 0xffd700,
                metalness: 1,
                roughness: 0.2,
                clearcoat: 0.8,
              })
          );
          m.castShadow = true;
          return m;
        },

        // Chain
        chain: (length = 5, linkSize = 0.08, mat = null) => {
          const g = new THREE.Group();
          const m =
            mat ||
            new THREE.MeshPhysicalMaterial({
              color: 0xcccccc,
              metalness: 0.9,
              roughness: 0.3,
            });
          for (let i = 0; i < length; i++) {
            const link = new THREE.Mesh(
              new THREE.TorusGeometry(linkSize, linkSize * 0.3, 8, 16),
              m
            );
            link.position.y = -i * linkSize * 1.8;
            link.rotation.x = i % 2 === 0 ? 0 : Math.PI / 2;
            link.castShadow = true;
            g.add(link);
          }
          return g;
        },

        // Rope
        rope: (points, radius = 0.02, mat = null) => {
          const curve = new THREE.CatmullRomCurve3(
            points.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
          );
          const mesh = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 20, radius, 8, false),
            mat ||
              new THREE.MeshPhysicalMaterial({
                color: 0x8b7355,
                roughness: 0.9,
                metalness: 0,
              })
          );
          mesh.castShadow = true;
          return mesh;
        },

        // Plank
        plank: (w = 1, h = 0.1, d = 0.3, mat = null) => {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            mat ||
              new THREE.MeshPhysicalMaterial({
                color: 0x8b6914,
                roughness: 0.7,
                metalness: 0.05,
                clearcoat: 0.2,
              })
          );
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          return mesh;
        },

        // Flame (animated)
        flame: (o = {}) => {
          const g = new THREE.Group();
          const h = o.height ?? 0.5,
            r = o.radius ?? 0.15;
          const inner = new THREE.Mesh(
            new THREE.ConeGeometry(r * 0.6, h * 0.8, 8),
            new THREE.MeshBasicMaterial({
              color: 0xffff00,
              transparent: true,
              opacity: 0.9,
            })
          );
          inner.position.y = h * 0.4;
          g.add(inner);
          const outer = new THREE.Mesh(
            new THREE.ConeGeometry(r, h, 8),
            new THREE.MeshBasicMaterial({
              color: 0xff6600,
              transparent: true,
              opacity: 0.7,
            })
          );
          outer.position.y = h * 0.5;
          g.add(outer);
          const light = new THREE.PointLight(0xff6600, 1, 3);
          light.position.y = h * 0.3;
          g.add(light);
          addUpdateCallback(({ time }) => {
            const f = 0.9 + Math.sin(time * 15) * 0.1;
            inner.scale.set(f, 1 + Math.sin(time * 12) * 0.1, f);
            outer.scale.set(f * 0.95, 1 + Math.sin(time * 10) * 0.15, f * 0.95);
            light.intensity = 0.8 + Math.sin(time * 20) * 0.3;
          });
          return g;
        },

        // ═══════════════════════════════════════════════════════════════════
        // LIQUID HELPERS
        // ═══════════════════════════════════════════════════════════════════
        liquidVolume: (o = {}) => {
          const width = o.width ?? 0.5,
            height = o.height ?? 0.5,
            depth = o.depth ?? 0.5,
            color = o.color ?? 0xff0000,
            segments = o.segments ?? 16;
          const geo = new THREE.BoxGeometry(
            width,
            height,
            depth,
            segments,
            segments,
            segments
          );
          const mat = new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0.1,
            roughness: 0.1,
            transmission: o.transmission ?? 0.6,
            thickness: 2,
            ior: 1.33,
            clearcoat: 0.8,
            emissive: o.glow ? color : 0x000000,
            emissiveIntensity: o.glowIntensity ?? 0.3,
            transparent: true,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          const posAttr = mesh.geometry.attributes.position;
          const origY = new Float32Array(posAttr.count);
          for (let i = 0; i < posAttr.count; i++) {
            origY[i] = posAttr.getY(i);
          }
          mesh.userData = {
            origY,
            waveSpeed: o.waveSpeed ?? 2,
            waveHeight: o.waveHeight ?? 0.02,
            height,
          };
          addUpdateCallback(({ time }) => {
            const pos = mesh.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i),
                z = pos.getZ(i);
              if (mesh.userData.origY[i] > mesh.userData.height * 0.4) {
                const wave =
                  Math.sin(x * 5 + time * mesh.userData.waveSpeed) *
                  Math.cos(z * 5 + time * mesh.userData.waveSpeed) *
                  mesh.userData.waveHeight;
                pos.setY(i, mesh.userData.origY[i] + wave);
              }
            }
            pos.needsUpdate = true;
            mesh.geometry.computeVertexNormals();
          });
          return mesh;
        },
        liquidSphere: (o = {}) => {
          const radius = o.radius ?? 0.35,
            color = o.color ?? 0xff0000;
          const geo = new THREE.SphereGeometry(radius, 32, 32);
          if (o.scaleY) geo.scale(1, o.scaleY, 1);
          const mat = new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0.1,
            roughness: 0.1,
            transmission: o.transmission ?? 0.6,
            thickness: 2,
            ior: 1.33,
            clearcoat: 0.8,
            emissive: o.glow ? color : 0x000000,
            emissiveIntensity: o.glowIntensity ?? 0.3,
            transparent: true,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          return mesh;
        },

        // ═══════════════════════════════════════════════════════════════════
        // PHYSICS HELPERS
        // ═══════════════════════════════════════════════════════════════════
        // Add physics body to a mesh (makes it interactive/movable)
        addPhysics: (mesh, o = {}) => {
          if (!self.physics.world) return mesh;
          const mass = o.mass ?? 1;
          const shape = o.shape ?? "box";
          let cannonShape;

          mesh.geometry.computeBoundingBox();
          const bb = mesh.geometry.boundingBox;
          const size = new THREE.Vector3();
          bb.getSize(size);

          if (shape === "sphere") {
            cannonShape = new CANNON.Sphere(
              (Math.max(size.x, size.y, size.z) / 2) * (o.scale ?? 1)
            );
          } else if (shape === "cylinder") {
            cannonShape = new CANNON.Cylinder(
              size.x / 2,
              size.x / 2,
              size.y,
              12
            );
          } else {
            cannonShape = new CANNON.Box(
              new CANNON.Vec3(
                (size.x / 2) * (o.scale ?? 1),
                (size.y / 2) * (o.scale ?? 1),
                (size.z / 2) * (o.scale ?? 1)
              )
            );
          }

          const body = new CANNON.Body({ mass, shape: cannonShape });
          body.position.copy(mesh.position);
          body.quaternion.copy(mesh.quaternion);

          if (o.friction !== undefined)
            body.material = new CANNON.Material({ friction: o.friction });
          if (o.restitution !== undefined) body.restitution = o.restitution;

          self.physics.world.addBody(body);
          body.__mesh = mesh;
          self.physics.objects.push(body);

          mesh.userData.physicsBody = body;
          mesh.userData.isDraggable = o.draggable !== false;

          return mesh;
        },

        // Make an entire group draggable (adds physics to main body)
        makeDraggable: (group, o = {}) => {
          group.userData.isDraggable = true;
          group.userData.dragConfig = o;
          return group;
        },
      };
    },
    setupSkySphere() {
      const skyGeo = new THREE.SphereGeometry(1200, 64, 64);
      const preset = this._presets[this.currentTimeOfDay || "day"];
      const skyMat = new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color(preset.skyTop) },
          midColor: { value: new THREE.Color(preset.skyMid) },
          bottomColor: { value: new THREE.Color(preset.skyBottom) },
          horizonColor: { value: new THREE.Color(preset.horizonGlow) },
          horizonWidth: { value: preset.horizonWidth },
          horizonIntensity: { value: preset.horizonIntensity },
          // Weather-driven darkening: 1 = normal time-of-day, 0 = full
          // storm overcast. Applied per fragment so the whole dome
          // transforms in sync with rain/snow/fog intensity.
          uWeatherDim:   { value: 1.0 },
          uWeatherTint:  { value: new THREE.Color(0xc0c8d2) },  // overcast grey mix
          uWeatherMix:   { value: 0.0 },                         // 0 = full time-of-day, 1 = full overcast
        },
        vertexShader: `varying vec3 vPos; void main() { vPos = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec3 vPos;
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 bottomColor;
          uniform float uWeatherDim;
          uniform vec3 uWeatherTint;
          uniform float uWeatherMix;
          void main() {
            vec3 dir = normalize(vPos);
            float y = dir.y;
            // Base time-of-day gradient (3 zones).
            vec3 timeColor;
            if (y > 0.25) {
              timeColor = mix(midColor, topColor, smoothstep(0.25, 1.0, y));
            } else if (y > -0.05) {
              timeColor = mix(bottomColor, midColor, smoothstep(-0.05, 0.25, y));
            } else {
              timeColor = bottomColor;
            }
            // Weather dome — a UNIFORM overcast gradient built from the
            // weather tint. Slight vertical variation (darker zenith,
            // ~15% brighter horizon from atmospheric light scatter) so
            // it reads as a real sky, not a flat wall. Crucially it
            // has the SAME shape across the whole dome, so when we
            // blend in the time-of-day gradient by (1 - mix) the
            // dome stays visually uniform even at high mix values.
            vec3 overcastHorizon = uWeatherTint * 1.12;
            vec3 overcastZenith  = uWeatherTint * 0.78;
            vec3 weatherColor = mix(overcastHorizon, overcastZenith,
                                    smoothstep(-0.2, 0.8, y));
            // Final: blend time-of-day toward overcast by mix.
            vec3 color = mix(timeColor, weatherColor, uWeatherMix);
            color *= uWeatherDim;
            gl_FragColor = vec4(color, 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: true,
      });
      const skyMesh = new THREE.Mesh(skyGeo, skyMat);
      skyMesh.position.y = 200;
      skyMesh.renderOrder = -1000;
      this.scene.add(skyMesh);
      this._skyMesh = skyMesh;
    },
    // Simplified volumetric cloud shell — a hemisphere inside the sky
    // dome with a procedural fBm cloud shader. Not true raymarching
    // (Faraz's 4-FBO pipeline is ~16h of work); this is the visually
    // equivalent shell used by most stylized Three.js skyboxes. The
    // density uniform is driven by `weather.clouds` every frame so
    // clouds build up under cloudy/rainy/stormy and clear under sunny.
    setupCloudShell() {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime:      { value: 0 },
          uDensity:   { value: 0 },       // 0..1 — driven by weather.clouds
          uColor:     { value: new THREE.Color(0xffffff) },
          uShadow:    { value: new THREE.Color(0x3a4050) },
          uWindDir:   { value: new THREE.Vector2(0.02, 0.013) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.NormalBlending,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vDir;
          uniform float uTime;
          uniform float uDensity;
          uniform vec3  uColor;
          uniform vec3  uShadow;
          uniform vec2  uWindDir;

          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n2(vec2 p){
            vec2 i = floor(p), f = fract(p);
            f = f*f*(3.0 - 2.0*f);
            return mix(mix(h(i), h(i + vec2(1,0)), f.x),
                       mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y);
          }
          float fbm(vec2 p){
            float s = 0.0, a = 0.5;
            for (int i = 0; i < 5; i++) { s += a * n2(p); p *= 2.0; a *= 0.5; }
            return s;
          }

          void main() {
            // Skip if density is effectively zero (sunny day).
            if (uDensity < 0.01) discard;
            // Project the sphere direction onto a plane so cloud cover
            // reads as a 2D pattern (classic stylized-sky trick).
            vec2 uv = vDir.xz / max(vDir.y, 0.15);
            uv = uv * 0.35 + uWindDir * uTime * 0.6;
            // Two-octave fBm for billowy structure.
            float base = fbm(uv);
            float detail = fbm(uv * 2.4 + vec2(12.7));
            float cloud = base * 0.65 + detail * 0.35;
            // Density threshold rises with uDensity so clouds cover
            // more of the sky as weather worsens.
            float thresh = mix(0.65, 0.28, uDensity);
            float cov = smoothstep(thresh, thresh + 0.22, cloud);
            // Shadow tint at dense cores → softens cloud edges + gives
            // volume from below. Mix white edge → shadow core by density.
            vec3 col = mix(uColor, uShadow, cov * 0.5);
            // Fade at the horizon so clouds don't render below the
            // visible horizon where they'd clip into the ground.
            float horizonFade = smoothstep(0.02, 0.25, vDir.y);
            float alpha = cov * uDensity * horizonFade;
            gl_FragColor = vec4(col, alpha);
          }
        `,
      });
      this._cloudShellMat = mat;
      const geom = new THREE.SphereGeometry(
        900, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2
      );
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = -900;                 // just in front of sky dome
      mesh.frustumCulled = false;
      this._cloudShell = mesh;
      this.scene.add(mesh);
    },
    setupStars() {
      const starCount = 2600;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(starCount * 3),
        size = new Float32Array(starCount),
        col = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const az = Math.random() * Math.PI * 2,
          el = Math.acos(Math.random() * 0.65 + 0.35),
          r = 1100;
        pos[i * 3] = r * Math.sin(el) * Math.cos(az);
        pos[i * 3 + 1] = r * Math.cos(el);
        pos[i * 3 + 2] = r * Math.sin(el) * Math.sin(az);
        size[i] = 0.6 + Math.random() * 2.2;
        const t = Math.random();
        if (t < 0.6) {
          col[i * 3] = 1;
          col[i * 3 + 1] = 1;
          col[i * 3 + 2] = 1;
        } else if (t < 0.8) {
          col[i * 3] = 0.8;
          col[i * 3 + 1] = 0.9;
          col[i * 3 + 2] = 1;
        } else {
          col[i * 3] = 1;
          col[i * 3 + 1] = 0.95;
          col[i * 3 + 2] = 0.8;
        }
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const mat = new THREE.ShaderMaterial({
        uniforms: { t: { value: 0 }, opacity: { value: 0 } },
        vertexShader: `attribute float size; attribute vec3 color; varying vec3 vColor; void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (200.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vColor; uniform float t; uniform float opacity; void main() { float d = length(gl_PointCoord - vec2(0.5)); if (d > 0.5) discard; float glow = pow(1.0 - d * 2.0, 1.6); gl_FragColor = vec4(vColor, glow * (0.8 + 0.2 * sin(t * 2.8)) * opacity); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const stars = new THREE.Points(geo, mat);
      this.scene.add(stars);
      this._stars = stars;
    },
    setupCelestialBody() {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(12, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffffee,
          transparent: true,
          opacity: 0,
        })
      );
      group.add(body);
      this._celestialBody = body;
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = 256;
      glowCanvas.height = 256;
      const gctx = glowCanvas.getContext("2d");
      const grad = gctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, "rgba(255,255,240,0.7)");
      grad.addColorStop(0.2, "rgba(255,240,180,0.35)");
      grad.addColorStop(0.5, "rgba(255,200,120,0.1)");
      grad.addColorStop(1, "rgba(255,150,80,0)");
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, 256, 256);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      glowTex.colorSpace = THREE.SRGBColorSpace;
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0.5,
        })
      );
      glow.scale.set(35, 35, 1);
      glow.visible = false;
      group.add(glow);
      this._celestialGlow = glow;
      const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 8192;
      sunLight.shadow.mapSize.height = 8192;
      sunLight.shadow.camera.near = 10;
      sunLight.shadow.camera.far = 2000;
      sunLight.shadow.camera.left = -8;
      sunLight.shadow.camera.right = 8;
      sunLight.shadow.camera.top = 8;
      sunLight.shadow.camera.bottom = -8;
      sunLight.shadow.bias = -0.0001;
      group.add(sunLight);
      sunLight.target = new THREE.Object3D();
      this.scene.add(sunLight.target);
      this._lights.sun = sunLight;
      const craterGroup = new THREE.Group();
      const craterMat = new THREE.MeshBasicMaterial({
        color: 0xaabbcc,
        transparent: true,
        opacity: 0.35,
      });
      [
        { x: 4, y: 2, r: 3 },
        { x: -5, y: -3, r: 4 },
        { x: 5, y: -1.5, r: 2.5 },
      ].forEach((c) => {
        const cm = new THREE.Mesh(new THREE.CircleGeometry(c.r, 20), craterMat);
        cm.position.set(c.x, c.y, 11);
        craterGroup.add(cm);
      });
      group.add(craterGroup);
      this._moonCraters = craterGroup;
      craterGroup.visible = false;
      group.position.set(260, 600, -500);
      group.visible = false;
      this.scene.add(group);
      this._sceneObjects.set("celestial", group);
    },
    setupSunRays() {
      const rayGroup = new THREE.Group();
      for (let i = 0; i < 12; i++) {
        const ray = new THREE.Mesh(
          new THREE.PlaneGeometry(10, 360),
          new THREE.MeshBasicMaterial({
            color: 0xffffcc,
            transparent: true,
            opacity: 0.035,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        ray.rotation.y = (i / 12) * Math.PI * 2;
        ray.rotation.x = Math.PI / 2;
        rayGroup.add(ray);
      }
      this.scene.add(rayGroup);
      this._sunRays = rayGroup;
      rayGroup.visible = false;
    },
    setupEnvironment() {
      const radius = 55;
      const groundGeo = new THREE.CircleGeometry(radius, 128);
      // Beautiful low-opacity grid — baked into a high-res canvas so
      // there's no per-frame line rasterization or aliasing. Lines are
      // drawn with a soft shadowBlur for a glow feel and low alpha so
      // the grid reads as a subtle backdrop, not a dense mesh. Coarser
      // pitch (every 64px on a 1024px canvas = 16 cells per tile,
      // 6× tile repeat = 96 cells across the disc) prevents moiré.
      const texCanvas = document.createElement("canvas");
      texCanvas.width = 1024;
      texCanvas.height = 1024;
      const ctx = texCanvas.getContext("2d");
      ctx.fillStyle = "#8a7cae";
      ctx.fillRect(0, 0, 1024, 1024);
      // Soft glowing lines — shadowBlur gives an antialiased-looking
      // edge that stays crisp even at mipmapped distances.
      ctx.shadowColor = "rgba(255, 255, 255, 0.25)";
      ctx.shadowBlur = 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1.2;
      for (let i = 0; i <= 1024; i += 64) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
      }
      // Accent — every 4th line slightly brighter for a major/minor look.
      ctx.shadowBlur = 3;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 1024; i += 256) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const tex = new THREE.CanvasTexture(texCanvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.repeat.set(6, 6);
      const groundMat = new THREE.MeshPhysicalMaterial({
        color: 0x8a7cae,
        map: tex,
        metalness: 0.7,
        roughness: 0.28,
        clearcoat: 0.6,
        envMapIntensity: 0.5,
      });
      // Ground stays purple PBR for the dome but gains TWO weather
      // responses: wet shine (rain darkens color + drops roughness for
      // puddle reflectivity) and snow cover (tints white + dulls
      // roughness toward 1.0). Both driven by shared uniforms we
      // update each frame from weather state.
      const groundWeatherUniforms = {
        uGroundWet:  { value: 0 },    // 0..1 — rain
        uGroundSnow: { value: 0 },    // 0..1 — snow
      };
      groundMat.userData.weatherUniforms = groundWeatherUniforms;
      groundMat.onBeforeCompile = (shader) => {
        shader.uniforms.uGroundWet  = groundWeatherUniforms.uGroundWet;
        shader.uniforms.uGroundSnow = groundWeatherUniforms.uGroundSnow;
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>",
            "#include <common>\nuniform float uGroundWet;\nuniform float uGroundSnow;")
          .replace("#include <output_fragment>",
            // Snow tint — pushes color + roughness toward clean white.
            "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.96, 0.98), uGroundSnow * 0.85);\n"
            // Wet darken — damp surfaces are darker than dry.
            + "gl_FragColor.rgb *= mix(1.0, 0.72, uGroundWet);\n"
            + "#include <output_fragment>");
        // Lower material roughness via onBeforeCompile hook: inject a
        // `roughnessFactor *= mix(1.0, 0.25, uGroundWet)` so wet ground
        // becomes sharply reflective while dry stays matte.
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\n"
          + "roughnessFactor *= mix(1.0, 0.25, uGroundWet);\n"
          + "roughnessFactor = mix(roughnessFactor, 0.95, uGroundSnow);"
        );
      };
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);
      this._sceneObjects.set("ground", ground);
      this._groundMat = groundMat;
      // Line grid removed — 1-pixel WebGL line rasterization aliases
      // badly on any movement and caused the flicker the user reported.
      // The baked canvas tile texture on the ground already provides
      // the visible grid structure.
      this.setupCloudLayer();
      this.setupAmbientParticles();
    },
    setupSquareGrid(radius) {
      const group = new THREE.Group();
      const gridColor = 0xb499ff,
        gridSize = radius * 2,
        cellSize = 2,
        lineCount = Math.floor(gridSize / cellSize);
      for (let i = -lineCount / 2; i <= lineCount / 2; i++) {
        const pos = i * cellSize;
        if (Math.abs(pos) < radius) {
          const half = Math.sqrt(radius * radius - pos * pos);
          const fade = 0.45 * (1 - Math.abs(pos) / radius);
          const hGeo = new THREE.BufferGeometry();
          hGeo.setAttribute(
            "position",
            new THREE.BufferAttribute(
              new Float32Array([-half, 0.008, pos, half, 0.008, pos]),
              3
            )
          );
          group.add(
            new THREE.Line(
              hGeo,
              new THREE.LineBasicMaterial({
                color: gridColor,
                transparent: true,
                opacity: fade,
              })
            )
          );
          const vGeo = new THREE.BufferGeometry();
          vGeo.setAttribute(
            "position",
            new THREE.BufferAttribute(
              new Float32Array([pos, 0.008, -half, pos, 0.008, half]),
              3
            )
          );
          group.add(
            new THREE.Line(
              vGeo,
              new THREE.LineBasicMaterial({
                color: gridColor,
                transparent: true,
                opacity: fade,
              })
            )
          );
        }
      }
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.045, radius, 128),
        new THREE.MeshBasicMaterial({
          color: gridColor,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.0085;
      group.add(ring);
      this.scene.add(group);
      this._sceneObjects.set("grid", group);
    },
    setupCloudLayer() {
      const cloudGroup = new THREE.Group();
      const cloudCanvas = document.createElement("canvas");
      cloudCanvas.width = 1024;
      cloudCanvas.height = 1024;
      const ctx = cloudCanvas.getContext("2d");
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 300; i++) {
        const x = Math.random() * 1024,
          y = Math.random() * 1024,
          radius = 30 + Math.random() * 120,
          alpha = 0.15 + Math.random() * 0.25;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
        gradient.addColorStop(0.4, `rgba(240,240,250,${alpha * 0.6})`);
        gradient.addColorStop(1, "rgba(200,200,220,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      const cloudTex = new THREE.CanvasTexture(cloudCanvas);
      cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
      const domeMat = new THREE.MeshBasicMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(400, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
        domeMat
      );
      dome.rotation.x = Math.PI;
      dome.position.y = 50;
      dome.visible = false;   // clouds fully disabled — were producing the "thick tile"
      cloudGroup.add(dome);
      const dome2 = new THREE.Mesh(
        new THREE.SphereGeometry(380, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        domeMat.clone()
      );
      dome2.rotation.x = Math.PI;
      dome2.rotation.y = Math.PI / 3;
      dome2.position.y = 45;
      dome2.visible = false;
      cloudGroup.add(dome2);
      const lowCloud = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshBasicMaterial({
          map: cloudTex,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      lowCloud.rotation.x = -Math.PI / 2;
      lowCloud.position.y = 35;
      lowCloud.visible = false;
      cloudGroup.add(lowCloud);
      this.scene.add(cloudGroup);
      this._cloudLayer = dome;
      this._cloudLayer2 = dome2;
      this._lowCloud = lowCloud;
      this._cloudGroup = cloudGroup;
      this._cloudTexture = cloudTex;
    },
    setupAmbientParticles() {
      const count = 280;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3),
        col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 60;
        pos[i * 3 + 1] = Math.random() * 14 + 2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
        const r = Math.random();
        if (r < 0.33) {
          col[i * 3] = 0.7;
          col[i * 3 + 1] = 0.5;
          col[i * 3 + 2] = 1;
        } else if (r < 0.66) {
          col[i * 3] = 0.4;
          col[i * 3 + 1] = 0.8;
          col[i * 3 + 2] = 1;
        } else {
          col[i * 3] = 1;
          col[i * 3 + 1] = 0.6;
          col[i * 3 + 2] = 0.9;
        }
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: 0.28,
          transparent: true,
          opacity: 0.55,
          vertexColors: true,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
          map: this._getSoftCircleTexture(),
          alphaTest: 0.01,
          depthWrite: false,
        })
      );
      this._particleVelocities = [];
      for (let i = 0; i < count; i++) {
        this._particleVelocities.push({
          orbit: 0.004 + Math.random() * 0.016,
          ySpeed: (Math.random() - 0.5) * 0.18,
        });
      }
      this.scene.add(pts);
      this._sceneObjects.set("ambientParticles", pts);
    },
    setupWeatherSystem() {
      const rainCount = 8000;
      const rainGeo = new THREE.BufferGeometry();
      const rainPos = new Float32Array(rainCount * 3);
      const rainVel = [];
      for (let i = 0; i < rainCount; i++) {
        rainPos[i * 3] = (Math.random() - 0.5) * 120;
        rainPos[i * 3 + 1] = Math.random() * 50 + 5;
        rainPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
        rainVel.push({
          x: (Math.random() - 0.5) * 2,
          y: -25 - Math.random() * 15,
          z: (Math.random() - 0.5) * 2,
        });
      }
      rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
      // Rain — elongated streaks via soft sprite + fast falling verts.
      // The soft circle texture scaled down renders as a teardrop at speed.
      const rain = new THREE.Points(
        rainGeo,
        new THREE.PointsMaterial({
          color: 0x99ccff,
          size: 0.22,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
          map: this._getSoftCircleTexture(),
          alphaTest: 0.01,
          depthWrite: false,
        })
      );
      this.scene.add(rain);
      this._rainParticles = rain;
      this._rainVelocities = rainVel;
      const snowCount = 5000;
      const snowGeo = new THREE.BufferGeometry();
      const snowPos = new Float32Array(snowCount * 3);
      const snowVel = [];
      for (let i = 0; i < snowCount; i++) {
        snowPos[i * 3] = (Math.random() - 0.5) * 120;
        snowPos[i * 3 + 1] = Math.random() * 50 + 5;
        snowPos[i * 3 + 2] = (Math.random() - 0.5) * 120;
        snowVel.push({
          x: (Math.random() - 0.5) * 0.8,
          y: -1.5 - Math.random() * 1.5,
          z: (Math.random() - 0.5) * 0.8,
          wobbleSpeed: 1 + Math.random() * 2,
          wobbleAmp: 0.3 + Math.random() * 0.5,
        });
      }
      snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
      const snow = new THREE.Points(
        snowGeo,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.32,
          transparent: true,
          opacity: 0,
          sizeAttenuation: true,
          map: this._getSoftCircleTexture(),
          alphaTest: 0.01,
          depthWrite: false,
        })
      );
      this.scene.add(snow);
      this._snowParticles = snow;
      this._snowVelocities = snowVel;
      const splashCount = 500;
      const splashGeo = new THREE.BufferGeometry();
      const splashPos = new Float32Array(splashCount * 3);
      const splashLife = new Float32Array(splashCount);
      for (let i = 0; i < splashCount; i++) {
        splashPos[i * 3] = (Math.random() - 0.5) * 80;
        splashPos[i * 3 + 1] = 0.05;
        splashPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
        splashLife[i] = Math.random();
      }
      splashGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(splashPos, 3)
      );
      const splash = new THREE.Points(
        splashGeo,
        new THREE.PointsMaterial({
          color: 0xaaddff,
          size: 0.08,                  // much smaller — was 0.3
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
          map: this._getSoftCircleTexture(),
          alphaTest: 0.01,
          depthWrite: false,
        })
      );
      this.scene.add(splash);
      this._splashParticles = splash;
      this._splashLife = splashLife;
      this._weatherParticles = rain;
      this._weatherVelocities = rainVel;

      // ── New weather pipeline (Bruno + Faraz patterns) ───────────────
      // WeatherSystem owns smoothly-eased properties (rain, snow,
      // fog, etc). Every visual consumer reads from it.
      this.weather = new WeatherSystem();
      // Hide the legacy Points-based rain/snow; the new RainLines mesh
      // is the single precipitation visual. The old particle pools stay
      // allocated so nothing crashes on reference, but they never render.
      if (this._rainParticles) this._rainParticles.visible = false;
      if (this._snowParticles) this._snowParticles.visible = false;
      // Instanced line-quad rain/snow with in-shader camera-wrap +
      // rain↔snow length/speed morph. Single draw call, zero CPU.
      this._rainLines = new RainLines({ count: 6000, tileSize: 40 });
      // Apply the current quality tier (if set; defaults to "high").
      this._rainLines.setQuality(this._renderQuality || "high");
      this.scene.add(this._rainLines.mesh);
      // Visible lightning arcs + impact particles.
      this._lightningBolt = new LightningBolt();
      this.scene.add(this._lightningBolt.group);
    },
    setupLighting() {
      const p = this._presets[this.currentTimeOfDay];
      // Reduced-intensity lighting rig so surface details aren't washed out.
      // Previously: ambient×1.0 + hemi×1.0 + fill×1.0 + fill2×0.6 + rim×0.5 +
      // bounce×0.4 on top of a DirectionalLight(5.0) sun blew past highlight
      // headroom and crushed PBR detail. Dialed back to a classic three-point
      // rig at physically-plausible intensities.
      const ambient = new THREE.AmbientLight(
        p.ambient.color,
        p.ambient.intensity * 0.8
      );
      this.scene.add(ambient);
      const hemi = new THREE.HemisphereLight(
        p.hemisphere.sky,
        p.hemisphere.ground,
        p.hemisphere.intensity * 0.8
      );
      hemi.position.set(0, 50, 0);
      this.scene.add(hemi);
      const fill = new THREE.DirectionalLight(0xaaccff, p.fill.intensity * 0.7);
      fill.position.set(-20, 30, 40);
      this.scene.add(fill);
      const fill2 = new THREE.DirectionalLight(
        0xffddcc,
        p.fill.intensity * 0.45
      );
      fill2.position.set(30, 20, -30);
      this.scene.add(fill2);
      const rim = new THREE.DirectionalLight(0xffffff, 0.38);
      rim.position.set(0, 10, -50);
      this.scene.add(rim);
      const bounce = new THREE.PointLight(0xccbbff, 0.32, 30);
      bounce.position.set(0, 0.5, 0);
      this.scene.add(bounce);

      // ── Primary shadow-casting directional ──────────────────────────
      // Single high-resolution directional map (4096²) tuned for our
      // hero-object framing. Soft PCF filtering smooths the penumbra
      // so we don't need CSM to avoid jagged edges on the scale we
      // render.
      const main = new THREE.DirectionalLight(0xffffff, 0.9);
      main.position.set(-3, 7, 4);
      main.target.position.set(0, 0, 0);
      main.castShadow = true;
      main.shadow.mapSize.width = 4096;
      main.shadow.mapSize.height = 4096;
      main.shadow.bias = -0.0003;
      main.shadow.normalBias = 0.04;
      main.shadow.radius = 4;
      const s = main.shadow.camera;
      s.near = 0.1; s.far = 30;
      s.left = -4; s.right = 4; s.top = 4; s.bottom = -4;
      this.scene.add(main);
      this.scene.add(main.target);
      this._csm = null;

      this._lights = {
        ambient,
        hemi,
        main,
        fill,
        fill2,
        rim,
        bounce,
      };
    },
    setupPostProcessing() {
      // pmndrs/postprocessing EffectComposer — merged-pass architecture.
      // multisampling: 0  — MSAA + N8AO triggers a GL depth/stencil
      //   blit-format mismatch on WebGL 2 (Depth/stencil buffer format
      //   combination not allowed for blit). SMAAEffect at the end of
      //   the chain handles AA instead. Keeping MSAA off is the
      //   recommended setup when any effect reads depth.
      // HalfFloat frame buffer for HDR bloom/tonemap headroom.
      const composer = new EffectComposer(this.renderer, {
        multisampling: 0,
        frameBufferType: THREE.HalfFloatType,
      });
      // postprocessing.setSize takes CSS dimensions; it internally uses
      // renderer.getDrawingBufferSize() (pixelRatio-aware) for the
      // render-target allocations. Previously we passed the domElement's
      // physical width/height (CSS × pixelRatio), which caused
      // setSize() to shrink the renderer to CSS-as-physical dimensions
      // → canvas became half its intended size on Retina.
      const cssSize = this.renderer.getSize(new THREE.Vector2());
      const rw = Math.min(cssSize.x, 3000);
      const rh = Math.min(cssSize.y, 3000);
      composer.setSize(rw, rh);
      composer.addPass(new RenderPass(this.scene, this.camera));

      // ── N8AO: screen-space ambient occlusion ────────────────────────
      // The single biggest quality win in this migration. Grounds every
      // contact surface (gems on a pedestal, water meeting stone, rim
      // meets base) with the dark seam the brain expects from real
      // geometry. Tuned for hero-object framing: ~0.6-unit scenes, so
      // aoRadius sits around 0.6 world units.
      const n8ao = new N8AOPostPass(this.scene, this.camera, rw, rh);
      n8ao.configuration.aoRadius = 0.6;
      n8ao.configuration.distanceFalloff = 0.25;
      n8ao.configuration.intensity = 3.0;
      n8ao.configuration.color = new THREE.Color(0x000000);
      n8ao.setQualityMode("High");
      this._n8aoPass = n8ao;
      composer.addPass(n8ao);

      // ── Custom effects packed into a single EffectPass ─────────────
      // postprocessing merges multiple Effects into ONE fragment shader
      // when they share a pipeline slot, so chromatic + color-grade +
      // lens-flare + droplets + underwater + film-grain all run in one
      // fullscreen triangle. Defining each as an Effect subclass means
      // we keep our shader logic verbatim but pay post costs once.
      const filmGrain = new FilmGrainEffect();
      const chromatic = new ChromaticEffect();
      const colorGrade = new ColorGradeEffect();
      const lensFlare = new LensFlareEffect(rw, rh);
      const underwater = new UnderwaterEffect();
      const droplet = new DropletEffect(rw, rh);
      this._grainPass = filmGrain;
      this._chromaPass = chromatic;
      this._gradePass = colorGrade;
      this._lensFlarePass = lensFlare;
      this._underwaterPass = underwater;
      this._dropletPass = droplet;

      // Bloom — native, selective-threshold. KernelSize.LARGE is the
      // archviz default and gives the soft halo rather than the fuzzy
      // veil that smaller kernels produce.
      const bloom = new BloomEffect({
        intensity: 0.8,
        luminanceThreshold: 0.85,
        luminanceSmoothing: 0.2,
        mipmapBlur: true,
        kernelSize: KernelSize.LARGE,
        radius: 0.7,
      });
      this._bloomPass = bloom;

      // DoF — native depth of field. Focus auto-tracks the orbit
      // target via the effect's `target` property (set in _updateDoF
      // each frame); focalLength/bokehScale control blur shape/size.
      const dof = new DepthOfFieldEffect(this.camera, {
        focusDistance: 0.0,
        focalLength: 0.05,
        bokehScale: 0.0,         // 0 = off; setDoF bumps it
      });
      this._dofEffect = dof;
      // Reusable THREE.Object3D the effect reads for world-space focus.
      this._dofTargetProxy = new THREE.Object3D();

      // SMAA — native implementation, faster than the examples one.
      const smaa = new SMAAEffect();

      // Pack non-depth-dependent effects into a shared EffectPass so
      // they merge into one pipeline; bloom + dof get their own passes
      // since they sample the depth buffer.
      composer.addPass(new EffectPass(this.camera, bloom));
      composer.addPass(new EffectPass(this.camera, dof));
      composer.addPass(
        new EffectPass(
          this.camera,
          droplet,
          underwater,
          chromatic,
          lensFlare,
          colorGrade,
          filmGrain,
        ),
      );
      composer.addPass(new EffectPass(this.camera, smaa));

      this.composer = markRaw(composer);
    },
    setFilmGrain(strength = 0.04, vignette = 0.25) {
      if (!this._grainPass) return;
      this._grainPass.uniforms.get("uStrength").value = strength;
      this._grainPass.uniforms.get("uVignette").value = vignette;
    },
    setChromatic(strength = 0.3, falloff = 2.2) {
      if (!this._chromaPass) return;
      this._chromaPass.uniforms.get("uStrength").value = strength;
      this._chromaPass.uniforms.get("uFalloff").value = falloff;
    },
    setColorGrade(opts = {}) {
      if (!this._gradePass) return;
      const u = this._gradePass.uniforms;
      if (opts.hue !== undefined)        u.get("uHueShift").value   = opts.hue;
      if (opts.saturation !== undefined) u.get("uSaturation").value = opts.saturation;
      if (opts.contrast !== undefined)   u.get("uContrast").value   = opts.contrast;
      if (opts.lift)  u.get("uLift").value.set(opts.lift);
      if (opts.gain)  u.get("uGain").value.set(opts.gain);
    },
    setDoF(opts = {}) {
      if (!this._dofEffect) return;
      // Honor the render-quality gate — low/medium skip bokeh entirely.
      if (this._dofAllowed === false) {
        this._dofEffect.bokehScale = 0;
        return;
      }
      // Legacy {aperture, maxblur, focus} → postprocessing {bokehScale}.
      // Mapping recalibrated: the previous *260 factor turned a 0.006
      // "subtle" aperture into bokehScale 1.56, blurring the whole
      // frame. *40 keeps subtle subtle (0.24) and still allows *2-4*
      // strong blur at aperture 0.05-0.1 for dolly-zoom looks.
      if (opts.aperture !== undefined) {
        this._dofEffect.bokehScale = Math.max(0, opts.aperture * 40.0);
      }
      if (opts.maxblur !== undefined) {
        this._dofEffect.bokehScale = Math.max(
          this._dofEffect.bokehScale,
          opts.maxblur * 40.0,
        );
      }
      if (opts.focus !== undefined) this._dofFixedFocus = opts.focus;
      this._dofAutoFocus = opts.autoFocus !== false;
    },
    _updateDoF() {
      if (!this._dofEffect) return;
      if (this._dofEffect.bokehScale <= 0.01) return;
      // Use the effect's built-in `target` property — postprocessing
      // computes focusDistance from the target's world position and
      // camera projection internally. Hand-rolling focusDistance via
      // (d - near) / (far - near) produced ~0.003 values on typical
      // scenes (near=0.1, far=1000) which is effectively "focus at
      // the near plane," blurring everything else.
      if (!this._dofAutoFocus && this._dofFixedFocus !== undefined) {
        this._dofTargetProxy.position.set(0, 0, 0);
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        this._dofTargetProxy.position
          .copy(this.camera.position)
          .addScaledVector(forward, this._dofFixedFocus);
        this._dofEffect.target = this._dofTargetProxy;
        return;
      }
      if (!this.controls || !this.controls.target) return;
      this._dofTargetProxy.position.copy(this.controls.target);
      this._dofEffect.target = this._dofTargetProxy;
    },
    setLensFlare(opts = {}) {
      if (!this._lensFlarePass) return;
      const u = this._lensFlarePass.uniforms;
      if (opts.strength !== undefined) u.get("uStrength").value = opts.strength;
      if (opts.tint)   u.get("uTint").value.set(opts.tint);
      if (opts.anamorphic !== undefined) u.get("uAnamorphic").value = opts.anamorphic;
      if (opts.position) {
        this._lensFlareSun = opts.position.isVector3
          ? opts.position.clone()
          : new THREE.Vector3(opts.position.x, opts.position.y, opts.position.z);
      }
      if (opts.occlusionTest !== undefined) this._lensFlareOcclusion = opts.occlusionTest;
    },
    setAO(opts = {}) {
      if (!this._n8aoPass) return;
      const c = this._n8aoPass.configuration;
      if (opts.radius !== undefined) c.aoRadius = opts.radius;
      if (opts.intensity !== undefined) c.intensity = opts.intensity;
      if (opts.falloff !== undefined) c.distanceFalloff = opts.falloff;
      if (opts.color !== undefined) c.color = new THREE.Color(opts.color);
      if (opts.quality) this._n8aoPass.setQualityMode(opts.quality); // 'Performance'|'Low'|'Medium'|'High'|'Ultra'
    },
    setBloom(opts = {}) {
      if (!this._bloomPass) return;
      if (opts.intensity !== undefined) this._bloomPass.intensity = opts.intensity;
      if (opts.threshold !== undefined) this._bloomPass.luminanceMaterial.threshold = opts.threshold;
      if (opts.smoothing !== undefined) this._bloomPass.luminanceMaterial.smoothing = opts.smoothing;
      if (opts.radius !== undefined) this._bloomPass.mipmapBlurPass.radius = opts.radius;
    },
    // ─── Height fog (Faraz Shaikh port) ────────────────────────────────
    // Overrides THREE.ShaderChunk fog chunks globally so EVERY material
    // picks up a domain-warped fBm fog with optional SDF-box bounds and
    // wind direction. Pass `enabled: false` to revert to built-in fog.
    // opts: { enabled, color, density, distortion, scale, direction,
    //         speed, boundsMin, boundsMax }
    //   - enabled:     toggle; false restores default FogExp2.
    //   - color:       fog color (hex).
    //   - density:     base FogExp2 density (0..1).
    //   - distortion:  0..1 fBm amount (0 = flat exp, 1 = heavy swirl).
    //   - scale:       noise frequency (world-space).
    //   - direction:   { x, y, z } wind vector for animated domain offset.
    //   - speed:       animation speed.
    //   - boundsMin/Max: optional world-space AABB; fog only inside the box.
    setHeightFog(opts = {}) {
      // FULLY DISABLED. The Faraz-style height-fog chunk override was
      // producing the horizon grey band. No-op for now; full body
      // retained below so re-enabling is a one-line toggle.
      return;
      // eslint-disable-next-line no-unreachable
      const ON = opts.enabled !== false;
      if (!this.scene) return;
      if (!ON) {
        if (this._heightFog) {
          this._heightFog.enabled = false;
          this.scene.fog = this._heightFog.prevSceneFog || null;
        }
        return;
      }
      // Install the override ONCE on THREE.ShaderChunk. After that we
      // only update uniforms.
      if (!this._heightFog) {
        const prevFogPars = THREE.ShaderChunk.fog_pars_fragment;
        const prevFog = THREE.ShaderChunk.fog_fragment;
        const prevFogParsVert = THREE.ShaderChunk.fog_pars_vertex;
        const prevFogVert = THREE.ShaderChunk.fog_vertex;
        // Every custom-fog branch below is gated by USE_HEIGHT_FOG so
        // materials that don't opt in (Water reflectors, three internal
        // materials, anything outside our patch broadcast) keep their
        // original chunk output and don't reference our custom uniforms.
        THREE.ShaderChunk.fog_pars_vertex = `
          #ifdef USE_FOG
            varying float vFogDepth;
            #ifdef USE_HEIGHT_FOG
              varying vec3 vFogWorldPos;
            #endif
          #endif
        `;
        THREE.ShaderChunk.fog_vertex = `
          #ifdef USE_FOG
            vFogDepth = -mvPosition.z;
            #ifdef USE_HEIGHT_FOG
              vFogWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            #endif
          #endif
        `;
        THREE.ShaderChunk.fog_pars_fragment = `
          #ifdef USE_FOG
            uniform vec3 fogColor;
            varying float vFogDepth;
            #ifdef FOG_EXP2
              uniform float fogDensity;
            #else
              uniform float fogNear;
              uniform float fogFar;
            #endif
            #ifdef USE_HEIGHT_FOG
            varying vec3 vFogWorldPos;
            uniform float uFogTime;
            uniform float uFogDistortion;
            uniform float uFogScale;
            uniform vec3  uFogDirection;
            uniform vec3  uFogBoundsMin;
            uniform vec3  uFogBoundsMax;
            uniform float uFogBoundsActive;

            // Cheap value noise + fBm for domain-warped density.
            float hFog(vec3 p){
              return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
            }
            float vnFog(vec3 p){
              vec3 i = floor(p), f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              return mix(
                mix(mix(hFog(i), hFog(i + vec3(1,0,0)), f.x),
                    mix(hFog(i + vec3(0,1,0)), hFog(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(hFog(i + vec3(0,0,1)), hFog(i + vec3(1,0,1)), f.x),
                    mix(hFog(i + vec3(0,1,1)), hFog(i + vec3(1,1,1)), f.x), f.y),
                f.z
              );
            }
            float fbmFog(vec3 p){
              float s = 0.0, a = 0.5;
              for (int i = 0; i < 4; i++) { s += a * vnFog(p); p *= 2.0; a *= 0.5; }
              return s;
            }
            // SDF for AABB — positive outside, negative inside.
            float sdBoxF(vec3 p, vec3 b){
              vec3 q = abs(p) - b;
              return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
            }
            #endif
          #endif
        `;
        THREE.ShaderChunk.fog_fragment = `
          #ifdef USE_FOG
            #ifdef USE_HEIGHT_FOG
              vec3 samp = vFogWorldPos * uFogScale + uFogDirection * uFogTime;
              float d1 = fbmFog(samp);
              float d2 = fbmFog(samp + vec3(d1 * 2.0));
              float heightK = clamp(1.0 - vFogWorldPos.y * 0.08, 0.0, 1.0);
              float noiseMul = mix(1.0, d2 * 1.6, uFogDistortion);
              #ifdef FOG_EXP2
                float rawFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
              #else
                float rawFog = smoothstep(fogNear, fogFar, vFogDepth);
              #endif
              float fogFactor = rawFog * noiseMul * heightK;
              if (uFogBoundsActive > 0.5) {
                vec3 center = 0.5 * (uFogBoundsMin + uFogBoundsMax);
                vec3 half_  = 0.5 * (uFogBoundsMax - uFogBoundsMin);
                float dIn = -sdBoxF(vFogWorldPos - center, half_);
                fogFactor *= smoothstep(0.0, 1.0, dIn);
              }
              fogFactor = clamp(fogFactor, 0.0, 1.0);
              gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
            #else
              // Stock fog path — preserves default three.js behavior for
              // any material that didn't opt into USE_HEIGHT_FOG.
              #ifdef FOG_EXP2
                float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
              #else
                float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
              #endif
              gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
            #endif
          #endif
        `;
        this._heightFog = {
          enabled: true,
          // Name collision trap: `prevFog` would clash with the shader
          // chunk string shorthand below (JS keeps only the last key),
          // corrupting the scene fog restore path. Use a disambiguated
          // property name so teardown points at the correct value.
          prevSceneFog: this.scene.fog,
          prevFogPars, prevFog, prevFogParsVert, prevFogVert,
          uniforms: {
            uFogTime:        { value: 0 },
            uFogDistortion:  { value: 1.0 },
            uFogScale:       { value: 0.04 },
            uFogDirection:   { value: new THREE.Vector3(0.02, 0, 0.03) },
            uFogBoundsMin:   { value: new THREE.Vector3(-100, -100, -100) },
            uFogBoundsMax:   { value: new THREE.Vector3( 100,  100,  100) },
            uFogBoundsActive:{ value: 0.0 },
          },
        };
        // Patch every existing + future material so they pick up the
        // new uniforms. We hook onBeforeCompile globally via a Proxy
        // on WebGLRenderer.compile isn't portable — simpler is to
        // traverse the scene on each setHeightFog call AND subclass
        // future material creations. The traversal approach is enough
        // for our LLM-generated scenes (they're recreated per
        // generate() call anyway).
        this._patchMaterialsForHeightFog = () => {
          const fogUniforms = this._heightFog.uniforms;
          this.scene.traverse((n) => {
            if (!n.material) return;
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) {
              if (!m || m.userData?._heightFogPatched) continue;
              // Opt this material into the custom fog branch via a
              // compile-time define. Materials without this define
              // (Water reflectors, three internal materials, anything
              // outside our traversal) keep the stock fog path and
              // don't reference our custom uniforms — which is why
              // they were failing to link before.
              m.defines = m.defines || {};
              m.defines.USE_HEIGHT_FOG = "";
              m.userData = m.userData || {};
              m.userData._heightFogPatched = true;
              const prev = m.onBeforeCompile;
              m.onBeforeCompile = (shader, renderer) => {
                if (prev) prev(shader, renderer);
                Object.assign(shader.uniforms, fogUniforms);
              };
              m.needsUpdate = true;
            }
          });
        };
      }
      const st = this._heightFog;
      st.enabled = true;
      // Install FogExp2 on the scene so USE_FOG + FOG_EXP2 defines are set.
      if (!(this.scene.fog instanceof THREE.FogExp2)) {
        st.prevFog = this.scene.fog;
      }
      const color = opts.color ?? (this.scene.fog && this.scene.fog.color ? this.scene.fog.color.getHex() : 0x0a0a14);
      const density = opts.density ?? 0.018;
      this.scene.fog = new THREE.FogExp2(color, density);
      if (opts.distortion !== undefined) st.uniforms.uFogDistortion.value = opts.distortion;
      if (opts.scale !== undefined) st.uniforms.uFogScale.value = opts.scale;
      if (opts.direction) st.uniforms.uFogDirection.value.set(
        opts.direction.x ?? 0.02,
        opts.direction.y ?? 0.0,
        opts.direction.z ?? 0.03,
      );
      if (opts.boundsMin && opts.boundsMax) {
        st.uniforms.uFogBoundsMin.value.set(opts.boundsMin.x, opts.boundsMin.y, opts.boundsMin.z);
        st.uniforms.uFogBoundsMax.value.set(opts.boundsMax.x, opts.boundsMax.y, opts.boundsMax.z);
        st.uniforms.uFogBoundsActive.value = 1.0;
      } else if (opts.boundsMin === null) {
        st.uniforms.uFogBoundsActive.value = 0.0;
      }
      this._patchMaterialsForHeightFog();
    },
    async setEnvironment(urlOrPreset, opts = {}) {
      // Accepts either a direct HDR/EXR URL or a preset name:
      //   'studio' → neutral softbox IBL (procedural)
      //   'day'    → bundled sky.hdr
      //   'sunset' → warm tinted sky.hdr variant
      //   'night'  → deep-blue procedural
      // Any other string is treated as a URL. Falls back to procedural
      // if the HDR load fails, so generator code never blocks on a
      // missing asset.
      // Preset name → either an asset URL or a procedural fallback.
      // The bundled sky.hdr reaches us through Vite's ?url asset import
      // so it works in both `npm run start` (dev server) and the
      // packaged Electron renderer. Any load failure falls back to the
      // procedural env so a generate() call never hard-fails on IBL.
      const PRESETS = {
        studio: { procedural: "softbox" },
        day:    { url: skyHdrUrl },
        sunset: { url: skyHdrUrl, tint: 0xffc890 },
        night:  { procedural: "night" },
      };
      const preset = typeof urlOrPreset === "string" ? PRESETS[urlOrPreset] : null;
      const resolvedUrl = preset?.url ?? (preset ? null : urlOrPreset);
      const proceduralFallback = preset?.procedural || "softbox";
      let envMap = null;
      if (resolvedUrl) {
        try {
          const loader = new RGBELoader();
          const hdrTex = await loader.loadAsync(resolvedUrl);
          hdrTex.wrapS = hdrTex.wrapT = THREE.ClampToEdgeWrapping;
          const pmrem = new PMREMGenerator(this.renderer);
          pmrem.compileEquirectangularShader();
          envMap = pmrem.fromEquirectangular(hdrTex).texture;
          hdrTex.dispose();
          pmrem.dispose();
        } catch (e) {
          console.warn(`setEnvironment("${urlOrPreset}") HDR load failed — falling back to procedural:`, e?.message || e);
          envMap = this._proceduralEnvMap(proceduralFallback);
        }
      } else if (preset?.procedural) {
        envMap = this._proceduralEnvMap(preset.procedural);
      } else {
        console.warn(`setEnvironment: unknown preset "${urlOrPreset}" — using procedural softbox.`);
        envMap = this._proceduralEnvMap("softbox");
      }
      if (!envMap) return null;
      if (this._envMap && this._envMap.dispose) this._envMap.dispose();
      this._envMap = envMap;
      this.scene.environment = envMap;
      if (opts.background) this.scene.background = envMap;
      if (opts.intensity !== undefined) this.scene.environmentIntensity = opts.intensity;
      return envMap;
    },
    _proceduralEnvMap(preset) {
      // Render a minimal scene (colored gradient sphere or dome) into
      // a PMREM cubemap for cheap procedural IBL. Returns an envMap
      // texture suitable for scene.environment.
      const pmrem = new PMREMGenerator(this.renderer);
      pmrem.compileCubemapShader();
      const envScene = new THREE.Scene();
      const geom = new THREE.SphereGeometry(5, 32, 16);
      let top, bottom;
      if (preset === "softbox") {
        top = new THREE.Color(0xffffff); bottom = new THREE.Color(0x666a78);
      } else if (preset === "night") {
        top = new THREE.Color(0x0a1428); bottom = new THREE.Color(0x020308);
      } else {
        top = new THREE.Color(0xaaccff); bottom = new THREE.Color(0x221a1a);
      }
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { topCol: { value: top }, botCol: { value: bottom } },
        vertexShader: `varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec3 v; uniform vec3 topCol; uniform vec3 botCol; void main(){ float t = v.y * 0.5 + 0.5; gl_FragColor = vec4(mix(botCol, topCol, t), 1.0); }`,
      });
      envScene.add(new THREE.Mesh(geom, mat));
      const envMap = pmrem.fromScene(envScene, 0.04).texture;
      pmrem.dispose();
      geom.dispose();
      mat.dispose();
      return envMap;
    },
    setUnderwater(active = true, opts = {}) {
      if (!this._underwaterPass) return;
      const u = this._underwaterPass.uniforms;
      u.get("uActive").value = typeof active === 'number' ? active : (active ? 1.0 : 0.0);
      if (opts.color)   u.get("uColor").value.set(opts.color);
      if (opts.distort !== undefined) u.get("uDistort").value = opts.distort;
      if (opts.rays    !== undefined) u.get("uRays").value    = opts.rays;
      if (opts.waterY !== undefined) this._waterPlaneY = opts.waterY;
      this._underwaterAuto = opts.auto !== false;
    },
    _updateLensFlareSun() {
      if (!this._lensFlarePass || !this._lensFlareSun) return;
      const projected = this._lensFlareSun.clone().project(this.camera);
      const onScreen = projected.z < 1.0;
      const sx = projected.x * 0.5 + 0.5;
      const sy = projected.y * 0.5 + 0.5;
      this._lensFlarePass.uniforms.get("uSunScreen").value.set(sx, sy);
      let occ = onScreen ? 1.0 : 0.0;
      if (onScreen && this._lensFlareOcclusion && this._rayOcclusion) {
        const hits = this._rayOcclusion(this._lensFlareSun);
        if (hits) occ *= 0.15;
      }
      this._lensFlarePass.uniforms.get("uOcclusion").value = occ;
    },
    _rayOcclusion(sunWorldPos) {
      // Cheap occlusion test — cast from camera to sun, return true if any
      // opaque mesh intersects. Hardened against sprites and detached
      // children: the raycaster needs .camera set for sprites, and we
      // swallow any error from a child whose matrix isn't updated yet.
      if (!this._occlusionRay) this._occlusionRay = new THREE.Raycaster();
      this._occlusionRay.camera = this.camera;   // required for Sprite
      const dir = sunWorldPos.clone().sub(this.camera.position).normalize();
      this._occlusionRay.set(this.camera.position, dir);
      const maxDist = this.camera.position.distanceTo(sunWorldPos);
      this._occlusionRay.near = 0.01;
      this._occlusionRay.far = maxDist;
      // Build a filtered candidate list — skip sprites (don't contribute
      // to occlusion), particles, and anything marked non-raycastable.
      const candidates = [];
      this.scene.traverse((o) => {
        if (!o || !o.isMesh) return;                     // Meshes only
        if (!o.visible) return;
        if (!o.matrixWorld) return;                      // guard nulls
        if (o.userData?.excludeFromBBox) return;         // decorative shells
        if (o.userData?.isWaterPlane) return;            // water refracts
        if (!o.material) return;
        if (o.material.transparent) return;
        if (o.material.transmission > 0) return;
        candidates.push(o);
      });
      try {
        const hits = this._occlusionRay.intersectObjects(candidates, false);
        return hits.length > 0;
      } catch (_) {
        return false;   // don't let post-FX crash the render loop
      }
    },
    _updateUnderwater() {
      if (!this._underwaterPass || !this._underwaterAuto) return;
      let planeY = this._waterPlaneY;
      if (planeY === undefined) {
        let highest = -Infinity;
        this.scene.traverse((o) => {
          if (o.userData?.isWaterPlane && o.visible) {
            const wy = o.getWorldPosition(new THREE.Vector3()).y;
            if (wy > highest) highest = wy;
          }
        });
        if (highest !== -Infinity) planeY = highest;
      }
      if (planeY === undefined) return;
      const dy = this.camera.position.y - planeY;
      const t = 1.0 - Math.min(1.0, Math.max(0.0, (dy + 0.1) / 0.2));
      this._underwaterPass.uniforms.get("uActive").value = t;
    },
    setScreenDroplets(density = 1.0, opts = {}) {
      if (!this._dropletPass) return;
      this._dropletPass.uniforms.get("uDensity").value = density;
      if (opts.speed !== undefined) this._dropletPass.uniforms.get("uSpeed").value = opts.speed;
      if (opts.size !== undefined)  this._dropletPass.uniforms.get("uSize").value = opts.size;
    },
    applyEnvironmentPreset(presetName) {
      const p = this._presets[presetName];
      if (!p) return;
      this.currentTimeOfDay = presetName;
      const skyMat = this._skyMesh.material;
      skyMat.uniforms.topColor.value.set(p.skyTop);
      skyMat.uniforms.midColor.value.set(p.skyMid);
      skyMat.uniforms.bottomColor.value.set(p.skyBottom);
      skyMat.uniforms.horizonColor.value.set(p.horizonGlow);
      skyMat.uniforms.horizonWidth.value = p.horizonWidth;
      skyMat.uniforms.horizonIntensity.value = p.horizonIntensity;
      this._celestialBody.material.color.set(p.celestialColor);
      this._celestialGlow.material.color.set(p.celestialColor);
      const showCelestial =
        presetName === "sunrise" ||
        presetName === "sunset" ||
        presetName === "night";
      const cbGroup = this._sceneObjects.get("celestial");
      if (cbGroup) {
        cbGroup.visible = true;
        cbGroup.position.y = p.celestialY * 520 + 200;
      }
      if (this._celestialBody) {
        this._celestialBody.visible = showCelestial;
        this._celestialBody.material.opacity = showCelestial ? 0.85 : 0;
      }
      if (this._celestialGlow) {
        this._celestialGlow.visible = showCelestial;
        this._celestialGlow.material.opacity = showCelestial ? 0.4 : 0;
      }
      if (this._lights.sun) {
        this._lights.sun.visible = true;
        this._lights.sun.intensity = showCelestial ? 4.0 : 6.0;
        this._lights.sun.color.set(p.celestialColor);
      }
      this._moonCraters.visible = p.moon > 0;
      this._stars.material.uniforms.opacity.value = p.starsOpacity;
      const L = this._lights;
      if (L.ambient) {
        L.ambient.color.set(p.ambient.color);
        L.ambient.intensity = p.ambient.intensity;
      }
      if (L.hemi) {
        L.hemi.color.set(p.hemisphere.sky);
        L.hemi.groundColor.set(p.hemisphere.ground);
        L.hemi.intensity = p.hemisphere.intensity;
      }
      if (L.fill) {
        L.fill.color.set(p.fill.color);
        L.fill.intensity = p.fill.intensity * this.lightIntensity;
      }
      // Fog removed — skip color/density updates (scene.fog is null).
      // if (this.scene.fog) this.scene.fog.color.set(p.fog.color);
      this._targetFogDensity = 0;
      if (this._bloomPass && p.bloomStrength !== undefined) {
        // postprocessing BloomEffect uses .intensity, not .strength.
        this._bloomPass.intensity = p.bloomStrength;
      }
      this._sunRays.visible = false;
      this.renderer.toneMappingExposure = p.exposure * this.lightIntensity;
    },
    // Engine-level quality preset. Trades visual richness for FPS so
    // users on integrated GPUs or on battery can stay at 60. Call with:
    //   setRenderQuality("low")     // every expensive effect off
    //   setRenderQuality("medium")
    //   setRenderQuality("high")    // baseline (default)
    //   setRenderQuality("ultra")   // crank everything
    // Engine-level fallback ambience. Runs AFTER autoEnhanceObject and
    // fills in the atmospheric layer that the orrery has but weaker LLM
    // generations often skip: celestial backdrop, flow-particle aura,
    // emissive-hero glow shell, lens flare on the dominant emissive
    // source. Each check is guarded so a richer generation that already
    // supplied these won't double up.
    // Detect any mesh whose LatheGeometry profile reads as a VESSEL
    // (open-top container: bowl, basin, flask, cup, jar, tub, goblet).
    // Returns an array of { mesh, fillBottomY, openRadius, profileHeight }
    // — a structured list the liquid-validator can auto-fill.
    //
    // Heuristic: the profile must start at or near the axis (closed
    // bottom), reach a maximum radius somewhere in the middle, then
    // shrink back toward the axis BUT end at a non-zero radius (the
    // open rim). Purely solid shapes (spheres, closed bottles) end at
    // r~0, so they're excluded. This catches 95% of vessel shapes the
    // LLM produces without any naming convention.
    _detectVessels(rootObj) {
      const vessels = [];
      rootObj.traverse((n) => {
        if (!n.isMesh || !n.geometry || n.userData?.excludeFromBBox) return;
        if (n.name === "liquid_fill" || n.parent?.name === "liquid_fill") return;
        // Skip anything already wrapped as a water pool.
        if (n.userData?.isWaterPlane) return;
        const g = n.geometry;
        // Must be a LatheGeometry with its original profile data.
        if (!g.parameters || !Array.isArray(g.parameters.points)) return;
        const pts = g.parameters.points;
        if (pts.length < 4) return;

        const CENTER_THRESH = 0.02;
        const firstR = pts[0].x;
        const lastR  = pts[pts.length - 1].x;

        // Closed at both ends → not a vessel (solid sphere/ball/orb).
        if (firstR < CENTER_THRESH && lastR < CENTER_THRESH) return;

        // Find max radius and whether the profile opens "up" (increases
        // in Y direction with a non-zero final rim).
        let maxR = 0;
        let maxRidx = 0;
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 0; i < pts.length; i++) {
          if (pts[i].x > maxR) { maxR = pts[i].x; maxRidx = i; }
          if (pts[i].y < yMin) yMin = pts[i].y;
          if (pts[i].y > yMax) yMax = pts[i].y;
        }
        if (maxR < 0.02) return;                // too narrow — probably a stem
        const profileHeight = yMax - yMin;
        if (profileHeight < 0.04) return;        // too short — probably a disc/rim

        // Decide which end is the OPEN one (bigger r) vs the CLOSED one.
        const openTop = lastR > firstR;
        const openR = openTop ? lastR : firstR;
        if (openR < maxR * 0.3) return;          // neck tapers too narrow → closed vial

        // Depth-to-width ratio: avoid counting shallow plates as vessels.
        if (profileHeight < maxR * 0.3) return;

        vessels.push({
          mesh: n,
          openTop,
          openRadiusGeom: openR,
          maxRadiusGeom: maxR,
          fillBottomYGeom: openTop ? yMin : yMax,
          profileHeight,
        });
      });
      return vessels;
    },

    // Auto-fill detected vessels with liquid and wire pouring streams
    // between stacked ones (fountain pattern). Branches on geometry:
    //   Shallow open basin (rim ≥ 55% of max radius, depth ≤ 1.0 × max
    //     radius)  → FLUID.oceanWater ring at rim height. This is the
    //     same AAA reflector-based water the orrery's moat uses — real
    //     reflections of the sky + scene, animated ripples, Fresnel
    //     edge tint. Use for: fountain tiers, shallow bowls, pools,
    //     tubs, bird baths, cauldrons.
    //   Deep narrow vessel  → H.fillLiquid + FLUID.upgradeFill. The
    //     liquid is mostly hidden behind glass refraction, so we use
    //     a colored volume + animated surface disc. Use for: flasks,
    //     vials, potion bottles, tall goblets, narrow jars.
    _autoFillVessels(rootObj, helpers, _engine) {
      const { FLUID } = _engine || {};
      if (!helpers?.fillLiquid || !FLUID) return;

      // Walk up the tree from `n` and return true if any ancestor was
      // built by an engine helper (FLUID.fountainBasin, etc.). Lets a
      // single ancestor mark protect every mesh in the subtree without
      // tagging each one individually.
      const _isInsideEngineBuiltGroup = (n) => {
        let cur = n.parent;
        while (cur) {
          if (cur.userData?.engineBuilt) return true;
          cur = cur.parent;
        }
        return false;
      };

      const vessels = this._detectVessels(rootObj);
      if (vessels.length === 0) return;
      // Drop any detected vessel that lives inside an engine-built group
      // — the helper has already filled it; the heuristic auto-fill must
      // not add a duplicate water surface on top.
      for (let i = vessels.length - 1; i >= 0; i--) {
        const v = vessels[i];
        if (v.mesh.userData?.engineBuilt || _isInsideEngineBuiltGroup(v.mesh)) {
          vessels.splice(i, 1);
        }
      }
      if (vessels.length === 0) return;

      // Pre-pass: strip LLM-added water ONLY IF it spatially overlaps
      // with a vessel the auto-filler is about to fill. Standalone
      // water (moats, lakes, ponds, orrery water rings) is left alone
      // — it's not a misplaced duplicate, it's an intentional surface.
      //
      // Vessel → bounding cylinder in world space (center XZ + max
      // radius + Y range). Water whose center sits inside any vessel's
      // cylinder is considered a duplicate and stripped; anything
      // outside all cylinders is preserved.
      const _vesselCyls = vessels.map((v) => {
        v.mesh.updateMatrixWorld(true);
        const wp = v.mesh.getWorldPosition(new THREE.Vector3());
        // Convert geometry-local radius to world scale if mesh has scale.
        const ws = v.mesh.getWorldScale(new THREE.Vector3());
        const horizScale = Math.max(ws.x, ws.z);
        return {
          cx: wp.x, cz: wp.z,
          r: v.maxRadiusGeom * horizScale * 1.1,
          yMin: wp.y - v.profileHeight * 0.2,
          yMax: wp.y + v.profileHeight * 1.2,
        };
      });
      const _isInsideAnyVessel = (worldPos) => {
        for (const c of _vesselCyls) {
          if (worldPos.y < c.yMin || worldPos.y > c.yMax) continue;
          const dx = worldPos.x - c.cx, dz = worldPos.z - c.cz;
          if (dx * dx + dz * dz <= c.r * c.r) return true;
        }
        return false;
      };
      const _toStripWater = [];
      rootObj.traverse((n) => {
        if (!n.isMesh || !n.geometry) return;
        if (n.userData?.autoFilled) return;
        // Engine-built helpers (FLUID.fountainBasin, FLUID.tieredFountain,
        // FLUID.stream) tag every mesh they produce. Without this, the
        // stripper kills the helper's own water surface as a "duplicate
        // CircleGeometry inside a vessel," then auto-fill adds its own
        // RingGeometry at a different Y — broken bowls + missing water.
        if (n.userData?.engineBuilt) return;
        if (_isInsideEngineBuiltGroup(n)) return;
        if (n.name === "liquid_fill" || n.parent?.name === "liquid_fill") return;

        const g = n.geometry;
        const isWaterTagged = n.userData?.isWaterPlane === true;
        const isPlanar = g.type === "PlaneGeometry"
                      || g.type === "CircleGeometry"
                      || g.type === "RingGeometry";
        if (!isWaterTagged && !isPlanar) return;
        if (isPlanar) {
          const rx = Math.abs(n.rotation.x);
          const isHorizontal = Math.abs(rx - Math.PI / 2) < 0.3 || rx < 0.3;
          if (!isHorizontal) return;
          const m = n.material;
          if (!m) return;
          const transmissive = m.transmission && m.transmission > 0.3;
          const lowRough = m.roughness !== undefined && m.roughness < 0.15;
          let waterishColor = false;
          if (m.color) {
            const r = m.color.r, gC = m.color.g, b = m.color.b;
            waterishColor = (b > 0.4 && b > r * 1.2) || (r + gC + b < 0.5 && b > r);
          }
          if (!transmissive && !lowRough && !waterishColor) return;
        }
        // Only strip if this water is INSIDE a vessel we're about to fill.
        n.updateMatrixWorld(true);
        const wp = n.getWorldPosition(new THREE.Vector3());
        if (_isInsideAnyVessel(wp)) _toStripWater.push(n);
      });
      for (const w of _toStripWater) {
        try {
          w.parent?.remove(w);
          w.geometry?.dispose?.();
          if (Array.isArray(w.material)) w.material.forEach((x) => x.dispose?.());
          else w.material?.dispose?.();
        } catch (_) {}
      }

      const filledVessels = [];
      const FILL_KEYWORDS = {
        potion: 0x40ff80,
        elixir: 0xa855f7,
        lava:   0xff5a1a,
        blood:  0xb00020,
        acid:   0x7fff40,
        oil:    0x1a1408,
        mercury: 0xc8cce0,
      };

      for (const v of vessels) {
        // Skip if vessel already has liquid.
        let hasLiquid = false;
        v.mesh.traverse?.((c) => {
          if (c.name === "liquid_fill") hasLiquid = true;
          if (c.userData?.isWaterPlane) hasLiquid = true;
        });
        if (!hasLiquid && v.mesh.parent) {
          v.mesh.parent.children?.forEach((c) => {
            if (c === v.mesh) return;
            if (c.name === "liquid_fill" && c.userData?.liquidContainer === v.mesh) hasLiquid = true;
            if (c.userData?.isWaterPlane && c.userData?.waterForContainer === v.mesh) hasLiquid = true;
          });
        }
        if (hasLiquid) { filledVessels.push({ vessel: v, filled: true }); continue; }

        // Pick a color — water blue by default, keyword override.
        let color = 0x5fb4ff;
        const nm = (v.mesh.name || v.mesh.parent?.name || "").toLowerCase();
        for (const [kw, hex] of Object.entries(FILL_KEYWORDS)) {
          if (nm.includes(kw)) { color = hex; break; }
        }

        // Vessel classification:
        //   SHALLOW-OPEN  ≈ basin (fountain tier, bowl, pool, tub)
        //   DEEP-NARROW   ≈ container (flask, goblet, jar)
        const openRatio = v.openRadiusGeom / v.maxRadiusGeom;
        const depthRatio = v.profileHeight / v.maxRadiusGeom;
        const isShallowOpen = openRatio >= 0.55 && depthRatio <= 1.0;

        try {
          if (isShallowOpen) {
            // AAA reflector-based water surface, identical parameters
            // to the orrery's moat. Tessellated RingGeometry with
            // multiple radial segments so the ripple shader actually
            // has vertices to displace — a plain CircleGeometry has
            // only a central vertex and one outer ring, which gave
            // the flat disc look from the last iteration.
            const rimRGeom = v.openRadiusGeom * 0.95;
            // Fill level: 75% of profile height for open basins — the
            // water should sit near the rim, not halfway down.
            const surfaceY = v.profileHeight * 0.75;
            const waterGeo = new THREE.RingGeometry(
              rimRGeom * 0.02,      // tiny inner radius (~center)
              rimRGeom,             // outer radius = fill radius
              128,                  // theta segments
              Math.max(4, Math.round(rimRGeom * 8)), // radial segments for ripple tess.
            );
            // Bake the horizontal rotation INTO the geometry so the
            // water surface is authored flat-on-XZ regardless of what
            // the mesh.rotation ends up being. Prevents vertical water
            // when some other code accidentally mutates rotation.z.
            waterGeo.rotateX(-Math.PI / 2);
            const water = FLUID.oceanWater(waterGeo, {
              color,
              distortionScale: 2.2,
              speed: 1.2,
              rippleDensity: 10.0,
              textureWidth: 1024,
              textureHeight: 1024,
              normalMapSize: 512,
              sunDirection: new THREE.Vector3(0.3, 0.9, 0.4).normalize(),
              sunColor: 0xffffff,
            });
            water.userData.autoFilled = true;
            water.userData.isWaterPlane = true;
            water.userData.waterForContainer = v.mesh;
            v.mesh.add(water);
            water.position.set(0, surfaceY, 0);
            filledVessels.push({
              vessel: v, filled: true, autoFilled: true,
              kind: "basin", rimRGeom, surfaceY,
            });
          } else {
            // Enclosed container — solid liquid body + animated surface.
            const liquid = helpers.fillLiquid(v.mesh, color, { fillLevel: 0.65 });
            if (liquid) {
              liquid.userData.autoFilled = true;
              v.mesh.add(liquid);
              liquid.position.set(0, 0, 0);
              liquid.quaternion.identity();
              liquid.scale.set(1, 1, 1);
              FLUID?.upgradeFill?.(liquid, { waveAmp: 0.002, caustics: 0.85 });
              filledVessels.push({
                vessel: v, filled: true, autoFilled: true, kind: "container",
              });
            }
          }
        } catch (err) {
          console.warn("[ThreeViewer] vessel auto-fill skipped:", err?.message);
        }
      }

      // Stacked vessels → auto-wire pouring streams between them.
      // Sort by world-space Y, then connect consecutive vessels if they
      // share a roughly aligned XZ axis.
      if (filledVessels.length >= 2 && FLUID?.stream) {
        const withY = filledVessels.map((f) => {
          const wp = f.vessel.mesh.getWorldPosition(new THREE.Vector3());
          return { ...f, worldY: wp.y, worldPos: wp };
        }).sort((a, b) => a.worldY - b.worldY);
        // Pair each upper vessel with the next lower one.
        for (let i = withY.length - 1; i > 0; i--) {
          const upper = withY[i];
          const lower = withY[i - 1];
          const horizDist = Math.hypot(
            upper.worldPos.x - lower.worldPos.x,
            upper.worldPos.z - lower.worldPos.z,
          );
          // Only pair vessels that are roughly on the same axis AND
          // vertically separated enough for a stream to make sense.
          const axisTol = Math.max(upper.vessel.maxRadiusGeom, lower.vessel.maxRadiusGeom) * 1.2;
          if (horizDist > axisTol) continue;
          if ((upper.worldY - lower.worldY) < 0.05) continue;
          // Already has a stream between them? Mark + skip.
          const key = `${upper.vessel.mesh.uuid}->${lower.vessel.mesh.uuid}`;
          if (this._autoStreamKeys?.has?.(key)) continue;
          this._autoStreamKeys = this._autoStreamKeys || new Set();
          this._autoStreamKeys.add(key);
          try {
            const from = upper.worldPos.clone();
            from.y += upper.vessel.profileHeight * 0.1;
            const to = lower.worldPos.clone();
            to.y += lower.vessel.profileHeight * 0.5;
            const stream = FLUID.stream({
              from, to,
              radius: Math.min(upper.vessel.maxRadiusGeom, lower.vessel.maxRadiusGeom) * 0.08,
              color: 0x9fd8ff,
            });
            stream.userData.autoAdded = true;
            rootObj.add(stream);
          } catch (_) {}
        }
      }
    },
    /**
     * Move every `liquid_fill` group back into its container mesh.
     *
     * Why this exists: H.fillLiquid auto-parents the liquid into the
     * container at build time, but LLM codegen often follows up with
     * `someParent.add(liquidGroup)` out of habit (because the helper
     * returns the group). three.js's add() removes from previous
     * parent and re-adds to the new one, breaking the auto-parent.
     *
     * The reparent is idempotent — if the liquid is already a child of
     * its container, nothing happens. After reparent we zero the local
     * transform because the lathe geometry was authored in the
     * container's local frame; identity local + container's parent
     * transform = correct world position.
     *
     * Wrapped in try/catch per-node so one bogus group can't kill the
     * whole pass. Runs in its own dedicated pre-pass — never bundled
     * with anything that might crash.
     */
    _snapLiquidsToContainers(root) {
      if (!root || !root.traverse) return;
      const targets = [];
      try {
        root.traverse((n) => {
          if (n && n.name === "liquid_fill" && n.userData?.liquidContainer) {
            targets.push(n);
          }
        });
      } catch (err) {
        console.warn("[ThreeViewer] liquid re-snap traversal failed:", err?.message);
        return;
      }
      // Reparent in a separate loop — modifying the tree mid-traverse
      // changes children arrays under three.js's recursive walk and
      // can skip nodes silently.
      for (const n of targets) {
        try {
          const c = n.userData.liquidContainer;
          if (!c || !c.isObject3D) continue;
          if (n.parent !== c) {
            c.add(n);
            n.position.set(0, 0, 0);
            n.quaternion.identity();
            n.scale.set(1, 1, 1);
          }
        } catch (err) {
          console.warn("[ThreeViewer] liquid re-snap on one node failed:", err?.message);
        }
      }
    },

    async _applyFallbackAmbience(root, _engine) {
      try {
        if (!_engine) return;
        // Defensive: if user code threw (and the wrapper somehow returned
        // a non-Object3D) OR if a downstream pass set result to undefined,
        // bail with a clear log instead of crashing inside three.js's
        // recursive traverse.
        if (!root || !root.traverse || !root.isObject3D) {
          console.warn(
            "[ThreeViewer] fallback ambience skipped — root is not a valid Object3D " +
            "(likely the user code threw before returning, or returned a non-Object3D value)."
          );
          return;
        }
        const { SHADER, FX, CELESTIAL } = _engine;

        // 0a. Ground-plane auto-strip. Generations must never add their
        // own ground/floor — the viewer provides the visual ground and
        // P.init now auto-creates the physics ground collider. Any
        // large horizontal mesh the LLM added at y≈0 becomes a
        // transmission-buffer artifact ("glitched square") when the
        // scene has transparent heroes. Detect + remove them defensively.
        const _floorsToRemove = [];
        root.traverse((n) => {
          if (!n.isMesh || !n.geometry) return;
          n.geometry.computeBoundingBox?.();
          const bb = n.geometry.boundingBox;
          if (!bb) return;
          const sx = bb.max.x - bb.min.x;
          const sy = bb.max.y - bb.min.y;
          const sz = bb.max.z - bb.min.z;
          const worldY = n.getWorldPosition(new THREE.Vector3()).y;
          const isHorizontalSlab = (sy < 0.2) && Math.max(sx, sz) > 2.0;
          const isGrounded = worldY < 0.15;
          if (isHorizontalSlab && isGrounded) _floorsToRemove.push(n);
        });
        for (const f of _floorsToRemove) {
          try {
            f.parent?.remove(f);
            f.geometry?.dispose?.();
            if (Array.isArray(f.material)) f.material.forEach((m) => m.dispose?.());
            else f.material?.dispose?.();
          } catch (_) {}
        }

        // Liquid re-snap moved out — runs unconditionally before this
        // pass via _snapLiquidsToContainers(root), so a crash in the
        // ambience code below can't strand a liquid in the wrong frame.

        // 1. Hero bbox (excludes backdrops)
        const tmpBox = new THREE.Box3();
        const heroBox = new THREE.Box3().makeEmpty();
        let hasStarfield = false;
        let hasNebulaCloud = false;
        let hasAura = false;
        let emissiveHero = null;
        let emissiveScore = 0;
        root.traverse((n) => {
          if (n.userData?.excludeFromBBox) {
            if (n.name === "Starfield" || n.userData?.kind === "starfield") hasStarfield = true;
            if (n.name === "NebulaDome" || n.userData?.kind === "nebula")   hasNebulaCloud = true;
            if (n.name === "FlowAura"   || n.userData?.kind === "aura")     hasAura = true;
            return;
          }
          if ((n.isMesh || n.isPoints) && n.geometry) {
            try { tmpBox.setFromObject(n); if (!tmpBox.isEmpty()) heroBox.union(tmpBox); } catch (_) {}
          }
          // Detect the most-emissive mesh in the scene — biggest
          // (emissiveIntensity × color sum) wins.
          if (n.isMesh && n.material) {
            const m = n.material;
            const ei = m.emissiveIntensity || 0;
            const e = m.emissive;
            if (e && ei > 0.3) {
              const score = ei * (e.r + e.g + e.b);
              if (score > emissiveScore) {
                emissiveScore = score;
                emissiveHero = n;
              }
            }
          }
        });
        if (heroBox.isEmpty()) return;
        const center = heroBox.getCenter(new THREE.Vector3());
        const size = heroBox.getSize(new THREE.Vector3());
        const heroR = Math.max(size.x, size.y, size.z) * 0.5;

        // 2. Starfield backdrop — if the scene has no celestial element
        //    and is being lit in night/studio mode, add a subtle one.
        if (!hasStarfield && CELESTIAL?.starfield) {
          const stars = CELESTIAL.starfield({
            count: 900, radius: Math.max(8, heroR * 15),
            size: 28, twinkle: 0.6,
          });
          stars.name = "Starfield";
          stars.userData.excludeFromBBox = true;
          stars.userData.kind = "starfield";
          stars.userData.autoAdded = true;
          stars.position.copy(center);
          root.add(stars);
        }

        // 3. Flow-particle aura centered on the hero — adds the
        //    "breathing" motion of the orrery's magic halo.
        if (!hasAura && SHADER?.flowParticles) {
          const b = Math.max(heroR * 1.4, 0.4);
          const aura = SHADER.flowParticles({
            count: 500,
            bounds: { x: b, y: b * 1.2, z: b },
            color: 0x8b5cf6, color2: 0x10b981,
            size: 24, speed: 0.3, swirl: 0.45,
          });
          aura.name = "FlowAura";
          aura.userData.excludeFromBBox = true;
          aura.userData.kind = "aura";
          aura.userData.autoAdded = true;
          aura.position.copy(center);
          root.add(aura);
        }

        // 4. Emissive-hero glow shell — if the scene has a clearly
        //    emissive hero but no fresnel shell around it, wrap it.
        if (emissiveHero && FX?.withGlow) {
          const hasChildGlow = emissiveHero.children?.some(
            (c) => c.userData?.kind === "glow-shell"
          );
          if (!hasChildGlow) {
            const emissiveColor = emissiveHero.material.emissive?.getHex?.() || 0x8b5cf6;
            const glow = FX.withGlow(emissiveHero, emissiveColor, {
              scale: 1.08, intensity: 1.1, power: 2.6,
            });
            if (glow && glow !== emissiveHero) {
              glow.userData = glow.userData || {};
              glow.userData.kind = "glow-shell";
              glow.userData.autoAdded = true;
              root.add(glow);
            }
          }
        }

        // 5. Subtle lens flare at the emissive hero's world position.
        //    Skip if the generation already set a flare strength.
        if (emissiveHero) {
          const u = this._lensFlarePass?.uniforms?.get?.("uStrength");
          const existingStrength = u?.value || 0;
          if (existingStrength < 0.01) {
            const heroWorld = new THREE.Vector3();
            emissiveHero.getWorldPosition(heroWorld);
            const emissiveColor = emissiveHero.material.emissive?.getHex?.() || 0xffd8a8;
            this.setLensFlare({
              position: heroWorld,
              strength: 0.25,
              tint: emissiveColor,
              anamorphic: 0.9,
              occlusionTest: true,
            });
          }
        }
      } catch (err) {
        console.warn("[ThreeViewer] fallback ambience failed:", err);
      }
    },
    setRenderQuality(level = "high") {
      const presets = {
        low: {
          pixelRatio: 1.0,
          n8ao: { enabled: false },
          smaa: false,
          chromatic: 0,
          bloom: { intensity: 0.5, radius: 0.5 },
          dofAllowed: false,
          filmGrain: { strength: 0.01, vignette: 0.15 },
          colorGrade: { saturation: 1.0, contrast: 1.0 },
          bvhTriThreshold: Infinity,   // never build BVHs
          shadowMapSize: 1024,
        },
        medium: {
          pixelRatio: Math.min(window.devicePixelRatio, 1.25),
          n8ao: { enabled: true, quality: "Low", intensity: 2.0 },
          smaa: true,
          chromatic: 0.06,
          bloom: { intensity: 0.7, radius: 0.6 },
          dofAllowed: false,
          filmGrain: { strength: 0.02, vignette: 0.2 },
          colorGrade: { saturation: 1.05, contrast: 1.02 },
          bvhTriThreshold: 2000,
          shadowMapSize: 2048,
        },
        high: {
          pixelRatio: Math.min(window.devicePixelRatio, 2),
          n8ao: { enabled: true, quality: "High", intensity: 2.5 },
          smaa: true,
          chromatic: 0.08,
          bloom: { intensity: 0.7, radius: 0.6 },
          dofAllowed: true,
          filmGrain: { strength: 0.025, vignette: 0.22 },
          colorGrade: { saturation: 1.08, contrast: 1.02 },
          bvhTriThreshold: 500,
          shadowMapSize: 4096,
        },
        ultra: {
          pixelRatio: Math.min(window.devicePixelRatio, 2),
          n8ao: { enabled: true, quality: "Ultra", intensity: 3.5 },
          smaa: true,
          chromatic: 0.12,
          bloom: { intensity: 0.85, radius: 0.75 },
          dofAllowed: true,
          filmGrain: { strength: 0.03, vignette: 0.25 },
          colorGrade: { saturation: 1.12, contrast: 1.05 },
          bvhTriThreshold: 300,
          shadowMapSize: 4096,
        },
      };
      const q = presets[level] || presets.high;
      this._renderQuality = level;
      this._bvhTriThreshold = q.bvhTriThreshold;
      // Renderer + composer resolution.
      if (this.renderer) {
        this.renderer.setPixelRatio(q.pixelRatio);
        const sz = this.renderer.getSize(new THREE.Vector2());
        if (this.composer) this.composer.setSize(sz.x, sz.y);
      }
      // Shadow map resolution.
      if (this._lights?.main?.shadow) {
        this._lights.main.shadow.mapSize.width = q.shadowMapSize;
        this._lights.main.shadow.mapSize.height = q.shadowMapSize;
        if (this._lights.main.shadow.map) {
          this._lights.main.shadow.map.dispose();
          this._lights.main.shadow.map = null;
        }
      }
      // N8AO — enable/disable + quality tier.
      if (this._n8aoPass) {
        this._n8aoPass.enabled = q.n8ao.enabled;
        if (q.n8ao.enabled) {
          this._n8aoPass.setQualityMode(q.n8ao.quality);
          this._n8aoPass.configuration.intensity = q.n8ao.intensity;
        }
      }
      // Chromatic + bloom + film grain + color grade — post axes.
      this.setChromatic(q.chromatic, 2.2);
      this.setBloom(q.bloom);
      this.setFilmGrain(q.filmGrain.strength, q.filmGrain.vignette);
      this.setColorGrade(q.colorGrade);
      // DoF gating — low/medium skip bokeh entirely regardless of
      // what the generated scene tries to set.
      this._dofAllowed = q.dofAllowed;
      if (!q.dofAllowed && this._dofEffect) this._dofEffect.bokehScale = 0;
      // Weather system particle count + motion blur scale with perf.
      if (this._rainLines) this._rainLines.setQuality(level);
    },
    _broadcastRainFactor(factor) {
      // Traverse the scene and update any CSM-based wet-surface material's
      // uRainFactor uniform. Safe to call every weather change; tagged
      // materials are identified via userData.wetSurface = true so we
      // don't stomp on anything else.
      this._rainFactor = factor;
      if (!this.scene) return;
      this.scene.traverse((n) => {
        if (!n.material) return;
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of mats) {
          if (m && m.userData?.wetSurface && m.uniforms?.uRainFactor) {
            m.uniforms.uRainFactor.value = factor;
          }
        }
      });
    },
    applyWeatherPreset(mode) {
      const p = this._weatherPresets[mode];
      if (!p) return;
      this.currentWeather = mode;
      // Tween WeatherSystem properties toward the new preset's targets
      // over ~2 seconds — replaces the previous hard-switch. Every new
      // visual subsystem (RainLines, LightningBolt, wet-surface broadcast)
      // reads from `this.weather` each frame so they transition smoothly.
      if (this.weather) this.weather.setMode(mode, 2.0);
      // Legacy FogExp2 density TEMPORARILY forced to 0 alongside the
      // dome + height-fog disables. Atmospheric fog on the starfield +
      // particle background was adding its own horizon haze. Restore
      // `p.fog` when the dome is back.
      this._targetFogDensity = 0;
      // Dome + horizon + ground are transformed together so there's no
      // tiled/dropped-in look. Sky dome mixes to the weather tint and
      // dims. The CircleGeometry ground shares the same tint/dim/mix
      // uniforms, plus a radial alpha fade at its outer edge → the
      // disc dissolves into the sky color at the horizon instead of
      // ending as a hard circle. Grid lines fade uniformly with the
      // weather dim.
      const weatherTints = {
        sunny:    { tint: 0xbfd4e8, mix: 0.00 },
        cloudy:   { tint: 0x9aa2b0, mix: 0.45 },
        rainy:    { tint: 0x545b68, mix: 0.75 },
        stormy:   { tint: 0x4a5465, mix: 0.78 },
        snowy:    { tint: 0xb8c4d2, mix: 0.55 },
        blizzard: { tint: 0x8a94a5, mix: 0.85 },
        foggy:    { tint: 0x9aa0ab, mix: 0.65 },
      };
      const target = weatherTints[mode] || weatherTints.sunny;
      const dim = p.ambientDim ?? 1.0;
      if (this._skyMesh?.material?.uniforms) {
        const u = this._skyMesh.material.uniforms;
        u.uWeatherTint.value.set(target.tint);
        u.uWeatherMix.value = target.mix;
        u.uWeatherDim.value = dim;
      }
      // Ground + grid lines are NOT touched by weather. Only the sky
      // dome transforms — horizon stays constant across every mode.
      if (this._cloudLayer) {
        this._cloudLayer.material.opacity = p.cloudOpacity;
      }
      if (this._cloudLayer2) {
        this._cloudLayer2.material.opacity = p.cloudOpacity * 0.7;
      }
      if (this._lowCloud) {
        this._lowCloud.material.opacity =
          p.cloudOpacity > 0.8 ? p.cloudOpacity * 0.5 : 0;
      }
      // Legacy Points-based rain/snow are permanently disabled — the new
      // RainLines instanced mesh is the single precipitation visual.
      if (this._rainParticles)   this._rainParticles.visible = false;
      if (this._splashParticles) this._splashParticles.visible = p.rain > 0;
      if (this._snowParticles)   this._snowParticles.visible = false;
      if (this._splashParticles) {
        this._splashParticles.material.opacity = p.rain > 0 ? 0.5 * p.rain : 0;
      }
      this._windStrength = p.windStrength || 0.5;
      const wasLightning = this._lightningEnabled;
      this._lightningEnabled = p.lightning || false;
      // If switching OFF lightning mid-strike, force-cancel the active
      // flash so the ambient intensity doesn't stay stuck at peak.
      if (wasLightning && !this._lightningEnabled && this._lightningActive) {
        this._lightningActive = false;
        this._lightningFlashTime = 0;
      }
      const dimFactor = p.ambientDim || 1.0;
      if (this._lights.ambient) {
        this._lights.ambient.intensity =
          (this._presets[this.currentTimeOfDay]?.ambient?.intensity || 2.0) *
          dimFactor;
      }
      // Scene-level lens rain — tied to the weather preset so the
      // droplets-on-lens post FX matches the particle rain and fog.
      if (p.lensDroplets !== undefined) {
        this.setScreenDroplets(p.lensDroplets);
      }
      // Broadcast rain factor to every material marked as wet-surface
      // (SHADER.wetSurface tags userData.wetSurface = true). Each
      // material carves its own fBm puddle mask + ripples from this
      // single float, so the dais, pavers, or any generated stone/
      // tile/wood surface all wet together.
      const wetFactor = Math.max(p.rain || 0, (p.lensDroplets || 0) * 0.6);
      this._broadcastRainFactor(wetFactor);
      // Scene-level height fog TEMPORARILY DISABLED alongside the
      // dome. Fog's world-Y density falloff was rendering a horizontal
      // grey band against the starfield/particle background — the
      // "grey tile surrounding the scene" the user wants to eliminate.
      // Re-enable once the dome is back and we can pair fog color with
      // dome color.
      this.setHeightFog({ enabled: false });
    },
    startRenderLoop() {
      const loop = () => {
        if (this._celestialBody && this._lights.sun) {
          const sunWorldPos = new THREE.Vector3();
          this._celestialBody.getWorldPosition(sunWorldPos);
          this._lights.sun.position.copy(sunWorldPos);
          this._lights.sun.target.position.set(0, 0, 0);
          this._lights.sun.target.updateMatrixWorld();
        }
        const dt = this.clock.getDelta(),
          t = this.clock.elapsedTime;
        if (this.physics.world && this.enablePhysics) {
          this.physics.world.step(1 / 60, dt, 3);
          for (const body of this.physics.objects) {
            if (body.__mesh) {
              body.__mesh.position.copy(body.position);
              body.__mesh.quaternion.copy(body.quaternion);
            }
          }
        }
        if (this._skyMesh) {
          this._skyMesh.position.copy(this.camera.position);
        }
        if (this._stars) {
          this._stars.position.copy(this.camera.position);
        }
        const pts = this._sceneObjects.get("ambientParticles");
        if (pts) {
          const pos = pts.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            pos.array[i * 3] += this._particleVelocities[i].orbit;
            pos.array[i * 3 + 1] += this._particleVelocities[i].ySpeed * dt;
            if (pos.array[i * 3 + 1] > 16) pos.array[i * 3 + 1] -= 14;
          }
          pos.needsUpdate = true;
        }
        if (this._rainParticles && this._rainParticles.visible) {
          const rp = this._rainParticles.geometry.attributes.position;
          const wind = this._windStrength || 1;
          for (let i = 0; i < rp.count; i++) {
            const vel = this._rainVelocities[i];
            rp.array[i * 3] += vel.x * wind * dt;
            rp.array[i * 3 + 1] += vel.y * dt;
            rp.array[i * 3 + 2] += vel.z * wind * dt;
            if (rp.array[i * 3 + 1] < 0) {
              rp.array[i * 3] =
                this.camera.position.x + (Math.random() - 0.5) * 100;
              rp.array[i * 3 + 1] = 40 + Math.random() * 20;
              rp.array[i * 3 + 2] =
                this.camera.position.z + (Math.random() - 0.5) * 100;
            }
          }
          rp.needsUpdate = true;
        }
        if (
          this._splashParticles &&
          this._splashParticles.visible &&
          this._splashLife
        ) {
          const sp = this._splashParticles.geometry.attributes.position;
          for (let i = 0; i < this._splashLife.length; i++) {
            this._splashLife[i] -= dt * 0.9;
            if (this._splashLife[i] < 0) {
              this._splashLife[i] = 1;
              sp.array[i * 3] =
                this.camera.position.x + (Math.random() - 0.5) * 60;
              sp.array[i * 3 + 1] = 0.05 + Math.random() * 0.1;
              sp.array[i * 3 + 2] =
                this.camera.position.z + (Math.random() - 0.5) * 60;
            }
          }
          sp.needsUpdate = true;
        }
        if (this._snowParticles && this._snowParticles.visible) {
          const sp = this._snowParticles.geometry.attributes.position;
          const wind = this._windStrength || 0.5;
          for (let i = 0; i < sp.count; i++) {
            const vel = this._snowVelocities[i];
            const wobble = Math.sin(t * vel.wobbleSpeed + i) * vel.wobbleAmp;
            sp.array[i * 3] += (vel.x * wind + wobble * 0.5) * dt;
            sp.array[i * 3 + 1] += vel.y * dt;
            sp.array[i * 3 + 2] += (vel.z * wind + wobble * 0.3) * dt;
            if (sp.array[i * 3 + 1] < 0) {
              sp.array[i * 3] =
                this.camera.position.x + (Math.random() - 0.5) * 100;
              sp.array[i * 3 + 1] = 35 + Math.random() * 20;
              sp.array[i * 3 + 2] =
                this.camera.position.z + (Math.random() - 0.5) * 100;
            }
          }
          sp.needsUpdate = true;
        }
        if (this._cloudLayer) {
          this._cloudLayer.rotation.y +=
            dt * 0.01 * (this._windStrength || 0.5);
        }
        if (this._cloudLayer2) {
          this._cloudLayer2.rotation.y -=
            dt * 0.008 * (this._windStrength || 0.5);
        }
        if (this._lightningEnabled) {
          // Spawn new strikes only when enabled.
          this._lightningTimer += dt;
          if (this._lightningTimer > this._nextLightning) {
            this._lightningActive = true;
            this._lightningFlashTime = 0.35;
            this._lightningTimer = 0;
            this._nextLightning = 3 + Math.random() * 8;
            if (this._lightningBolt && this.camera) {
              const angle = Math.random() * Math.PI * 2;
              const dist  = 8 + Math.random() * 18;
              const gx = this.camera.position.x + Math.cos(angle) * dist;
              const gz = this.camera.position.z + Math.sin(angle) * dist;
              const origin = new THREE.Vector3(gx + (Math.random() - 0.5) * 2, 22 + Math.random() * 6, gz + (Math.random() - 0.5) * 2);
              const target = new THREE.Vector3(gx, 0, gz);
              this._lightningBolt.strike(origin, target);
            }
          }
        }
        // Flash-decay runs REGARDLESS of _lightningEnabled so that
        // turning lightning off mid-strike still cleanly fades the
        // ambient intensity back to baseline (no stuck-bright bug).
        if (this._lightningActive) {
          this._lightningFlashTime -= dt;
          const elapsed = 0.35 - this._lightningFlashTime;
          const curve = elapsed < 0.08
            ? Math.pow(elapsed / 0.08, 0.5)
            : Math.max(0, 1 - (elapsed - 0.08) / 0.27);
          const n = Math.sin(elapsed * 31.0) * 0.5 + 0.5;
          const spike = Math.pow(n, 3);
          const peak = curve * (0.5 + spike * 0.5) * 8.0;
          if (this._lights.ambient) this._lights.ambient.intensity = peak;
          if (this._lightningFlashTime <= 0) {
            this._lightningActive = false;
            const p = this._weatherPresets[this.currentWeather];
            if (this._lights.ambient) {
              this._lights.ambient.intensity =
                (this._presets[this.currentTimeOfDay]?.ambient?.intensity || 2) *
                (p?.ambientDim || 1);
            }
          }
        }
        // Fog removed — skip density lerp (scene.fog is null).
        // Isolate each LLM-registered update callback. A throw from a
        // single callback used to tank the entire render loop every
        // frame (e.g. `mat.map.uniforms.time.value` on a texture that
        // has no uniforms). After 3 consecutive throws the callback is
        // disabled so the console stops drowning and the rest of the
        // animation (physics, orbit, post FX) keeps running.
        // ── New weather pipeline tick (Bruno + Faraz) ─────────────────
        if (this.weather) this.weather.update(dt);
        if (this._rainLines) this._rainLines.update(dt, t, this.camera, this.weather);
        if (this._lightningBolt) this._lightningBolt.update(dt);
        // Cloud shell — drive density from weather.clouds, animate.
        if (this._cloudShellMat) {
          this._cloudShellMat.uniforms.uTime.value = t;
          this._cloudShellMat.uniforms.uDensity.value = this.weather?.clouds ?? 0;
        }
        // Keep cloud shell + sky dome + stars centered on camera so
        // they never parallax away from the viewer.
        if (this._cloudShell) this._cloudShell.position.copy(this.camera.position);
        // Ground wet/snow shader uniforms track WeatherSystem values
        // each frame so the ground reacts smoothly as weather tweens.
        if (this._groundMat?.userData?.weatherUniforms && this.weather) {
          const wu = this._groundMat.userData.weatherUniforms;
          wu.uGroundWet.value  = this.weather.rain ?? 0;
          wu.uGroundSnow.value = this.weather.snow ?? 0;
        }

        for (const cb of this._updateCallbacks) {
          if (cb._disabled) continue;
          try { cb({ deltaTime: dt, time: t }); cb._errorCount = 0; }
          catch (err) {
            cb._errorCount = (cb._errorCount || 0) + 1;
            if (cb._errorCount >= 3) {
              cb._disabled = true;
              console.warn("[ThreeViewer] update callback disabled after 3 errors:", err?.message);
            }
          }
        }
        if (this.controls) this.controls.update();
        // CSM must update its cascade frustums each frame so the shadow
        // maps stay aligned with the moving camera.
        if (this._csm) this._csm.update();
        // Advance the height-fog animation time every frame so the fBm
        // fog swirls in the configured wind direction.
        if (this._heightFog?.enabled) this._heightFog.uniforms.uFogTime.value = t;
        // uTime on each Effect is advanced in its update() hook
        // (postprocessing calls Effect.update every frame with deltaTime).
        // Nothing to do here for the merged effect chain.
        // Project lens-flare sun to screen space each frame, auto-
        // submerge the underwater pass when the camera crosses a marked
        // water plane, and track DoF focus to the orbit target so the
        // subject stays sharp regardless of zoom.
        this._updateLensFlareSun();
        this._updateUnderwater();
        this._updateDoF();
        if (this.composer) this.composer.render();
        else this.renderer.render(this.scene, this.camera);
        this.updateStats(dt);
        this._animationId = requestAnimationFrame(loop);
      };
      loop();
    },
    updateStats(dt) {
      this._frameCount++;
      this._lastFrameTime += dt;
      if (this._lastFrameTime >= 0.25) {
        const fps = this._frameCount / this._lastFrameTime;
        if (this.$refs.fpsDisplay) {
          this.$refs.fpsDisplay.innerText = fps.toFixed(1) + " FPS";
        }
        if (this.$refs.objectCountDisplay) {
          this.$refs.objectCountDisplay.innerText =
            (this.scene ? this.scene.children.length : 0) + " Objects";
        }
        this._frameCount = 0;
        this._lastFrameTime = 0;
      }
    },
    setTimeOfDay(mode) {
      if (this._presets[mode]) this.applyEnvironmentPreset(mode);
    },
    setWeather(mode) {
      if (this._weatherPresets[mode]) this.applyWeatherPreset(mode);
    },
    setLightIntensity(i) {
      this.lightIntensity = i;
      const p = this._presets[this.currentTimeOfDay];
      if (!p) return;
      if (this._lights.fill) this._lights.fill.intensity = p.fill.intensity * i;
      if (this._lights.ambient)
        this._lights.ambient.intensity = p.ambient.intensity * i;
      if (this._lights.hemi)
        this._lights.hemi.intensity = p.hemisphere.intensity * i;
      this.renderer.toneMappingExposure = p.exposure * i;
    },
    setAutoRotate(enabled) {
      if (this.controls) {
        this.controls.autoRotate = enabled;
        this.controls.update();
      }
    },
    resetCamera() {
      if (this.camera && this.controls) {
        this.camera.position.set(4, 3, 5);
        this.controls.target.set(0, 0.8, 0);
        this.controls.update();
      }
    },
    clear() {
      if (!this.scene) return;
      this._updateCallbacks = [];
      // Reset post-FX that a previous scene might have enabled.
      if (this._dropletPass) this._dropletPass.uniforms.get("uDensity").value = 0;
      if (this._grainPass) {
        this._grainPass.uniforms.get("uStrength").value = 0.04;
        this._grainPass.uniforms.get("uVignette").value = 0.25;
      }
      if (this._chromaPass) this._chromaPass.uniforms.get("uStrength").value = 0;
      if (this._dofEffect) {
        this._dofEffect.bokehScale = 0;
        this._dofFixedFocus = undefined;
      }
      if (this._gradePass) {
        const u = this._gradePass.uniforms;
        u.get("uHueShift").value = 0;
        u.get("uSaturation").value = 1;
        u.get("uContrast").value = 1;
        u.get("uLift").value.set(0x000000);
        u.get("uGain").value.set(0xffffff);
      }
      if (this._lensFlarePass) {
        this._lensFlarePass.uniforms.get("uStrength").value = 0;
        this._lensFlareSun = null;
        this._lensFlareOcclusion = false;
      }
      if (this._underwaterPass) {
        this._underwaterPass.uniforms.get("uActive").value = 0;
        this._waterPlaneY = undefined;
        this._underwaterAuto = false;
      }
      const toRemove = [];
      this.scene.traverse((obj) => {
        if (
          obj.name === "GeneratedObject" ||
          obj.name?.startsWith("Generated_")
        ) {
          toRemove.push(obj);
        }
      });
      for (const obj of toRemove) {
        // Deep-dispose including any BVH boundsTrees we built.
        obj.traverse?.((n) => {
          if (n.geometry) {
            n.geometry.disposeBoundsTree?.();
            n.geometry.dispose?.();
          }
          if (n.material) {
            if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose?.());
            else n.material.dispose?.();
          }
        });
        this.scene.remove(obj);
      }
      this.resetCamera();
    },
    autoEnhanceObject(obj, THREE) {
      const envMap = this._envMap;

      // ── Auto-scale: fit object within 1.5 unit max dimension ──
      // Build the bbox from HERO meshes only — a large backdrop marked
      // `userData.excludeFromBBox` (dome nebula, starfield, mist) must not
      // squash the real scene. Without this filter a 7.5m dome would
      // shrink the hero down to 1.5/7.5 = 0.2× its intended size.
      const heroBox = new THREE.Box3();
      heroBox.makeEmpty();
      const tmpBox = new THREE.Box3();
      obj.traverse((c) => {
        if (!c.isMesh && !c.isPoints && !c.isLine) return;
        if (c.userData?.excludeFromBBox) return;
        if (!c.geometry) return;
        tmpBox.setFromObject(c);
        if (!tmpBox.isEmpty()) heroBox.union(tmpBox);
      });
      if (heroBox.isEmpty()) heroBox.setFromObject(obj);
      const tempSize = heroBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(tempSize.x, tempSize.y, tempSize.z);
      if (maxDim > 1.5) {
        const scale = 1.5 / maxDim;
        obj.scale.multiplyScalar(scale);
        // Recompute from hero-only descendants after scaling.
        const scaledBox = new THREE.Box3();
        scaledBox.makeEmpty();
        obj.traverse((c) => {
          if (!c.isMesh && !c.isPoints && !c.isLine) return;
          if (c.userData?.excludeFromBBox) return;
          if (!c.geometry) return;
          tmpBox.setFromObject(c);
          if (!tmpBox.isEmpty()) scaledBox.union(tmpBox);
        });
        if (scaledBox.isEmpty()) scaledBox.setFromObject(obj);
        const minY = scaledBox.min.y;
        if (minY < 0) obj.position.y -= minY;
      }

      // ── Material enhancement pass ──
      // `this` is rebound inside the non-arrow traverse callback, so
      // capture the component reference for _csm / _bloomPass access.
      const self = this;
      let renderOrderCounter = 10;
      obj.traverse(function (n) {
        if (n.isMesh && n.material) {
          n.material.needsUpdate = true;
          if (envMap && n.material.isMeshPhysicalMaterial) {
            n.material.envMap = envMap;
            n.material.envMapIntensity = 0.65;
          } else {
            n.material.envMapIntensity = 0.65;
          }
          if (!("clearcoat" in n.material)) {
            n.material.clearcoat = 0.2;
          }
          if (n.material.roughness > 0.8) n.material.roughness = 0.55;
          // Fix transmission materials (liquids, glass, gems)
          if (n.material.transmission && n.material.transmission > 0) {
            // Detect liquid materials misusing transmission (transparent+opacity < 1,
            // or low IOR suggesting liquid not glass/gems). Convert to MeshStandardMaterial
            // so they render as visible colored volumes inside glass containers.
            const isLiquid = n.material.transparent && n.material.opacity < 1;
            const hasLowIOR = n.material.ior && n.material.ior < 1.45;
            if (isLiquid || hasLowIOR) {
              const color = n.material.color ? n.material.color.clone() : new THREE.Color(0x888888);
              // Use color as emissive fallback so liquid color is always visible
              const emissive = (n.material.emissive && n.material.emissive.r + n.material.emissive.g + n.material.emissive.b > 0)
                ? n.material.emissive.clone() : color.clone().multiplyScalar(0.7);
              const emissiveI = Math.max(n.material.emissiveIntensity || 0, 0.5);
              n.material = new THREE.MeshStandardMaterial({
                color,
                emissive,
                emissiveIntensity: emissiveI,
                transparent: true,
                opacity: n.material.opacity || 0.85,
                side: THREE.DoubleSide,
                depthWrite: false,
                roughness: 0.2,
                metalness: 0.0,
              });
            } else {
              // True transmission (glass, gems) — keep as-is, don't force transparent
              n.material.side = THREE.DoubleSide;
              // Strip attenuationColor if liquid_fill sibling exists — attenuation
              // tints the liquid and hides its true color through the glass
              if (n.material.attenuationColor) {
                let hasLiquid = false;
                obj.traverse((c) => { if (c.name === "liquid_fill") hasLiquid = true; });
                if (hasLiquid) {
                  n.material.attenuationColor = new THREE.Color(0xffffff);
                  n.material.attenuationDistance = Infinity;
                }
              }
            }
            n.renderOrder = renderOrderCounter++;
          } else if (n.material.transparent) {
            // Non-transmission transparent materials (alpha-blended)
            n.material.depthWrite = false;
            n.renderOrder = renderOrderCounter++;
          } else {
            n.renderOrder = 2;
          }
          n.castShadow = true;
          n.receiveShadow = true;
          // three-mesh-bvh: build an accelerated BVH for any geometry
          // with >500 triangles. Below that the overhead of building
          // the BVH outweighs the raycast speedup. The BVH is used by
          // the patched Mesh.prototype.raycast (installed at module
          // load) and speeds up the lens-flare occlusion sweep plus
          // any physics/pick work the generator wires up.
          if (n.geometry && !n.geometry.boundsTree) {
            const tris = (n.geometry.index ? n.geometry.index.count : n.geometry.attributes.position?.count || 0) / 3;
            const bvhThresh = self._bvhTriThreshold ?? 500;
            if (tris > bvhThresh) {
              try { n.geometry.computeBoundsTree({ maxLeafSize: 10 }); } catch (_) {}
            }
          }
          // CSM: patch every receiving material so it samples from the
          // cascaded shadow maps instead of the legacy directional map.
          // Idempotent — setupMaterial tags the material and skips if
          // already patched.
          if (self._csm && n.material && !n.material.userData?.csmPatched) {
            try {
              self._csm.setupMaterial(n.material);
              n.material.userData = n.material.userData || {};
              n.material.userData.csmPatched = true;
            } catch (_) {}
          }
          // Sync wet-surface uniform with the active weather on every
          // generation — if rain is on and the generated scene has any
          // SHADER.wetSurface material, it wets immediately.
          if (n.material?.userData?.wetSurface && n.material.uniforms?.uRainFactor) {
            n.material.uniforms.uRainFactor.value = self._rainFactor || 0;
          }
          // Height fog: opt this material into the custom fog branch
          // (via USE_HEIGHT_FOG define) and wire its uniforms. Materials
          // without the define keep stock fog — this prevents Water's
          // internal reflector materials from failing to link.
          if (self._heightFog?.enabled && n.material && !n.material.userData?._heightFogPatched) {
            const fogUniforms = self._heightFog.uniforms;
            n.material.defines = n.material.defines || {};
            n.material.defines.USE_HEIGHT_FOG = "";
            n.material.userData = n.material.userData || {};
            n.material.userData._heightFogPatched = true;
            const prev = n.material.onBeforeCompile;
            n.material.onBeforeCompile = (shader, renderer) => {
              if (prev) prev(shader, renderer);
              Object.assign(shader.uniforms, fogUniforms);
            };
            n.material.needsUpdate = true;
          }
        }
      });
      // Gentle bloom boost for generated objects
      if (this._bloomPass) {
        // Leave bloom at its configured level — bumping it every frame
        // undoes our tame baseline and produces the "sun halo blown over
        // a stone fountain" look.
      }
      // If any transmission material was found, ensure scene has a background
      // for the transmission buffer to refract through (null background = black refraction)
      let hasTransmission = false;
      obj.traverse((n) => {
        if (n.isMesh && n.material && n.material.transmission > 0) hasTransmission = true;
      });
      if (hasTransmission && !this.scene.background && this._envMap) {
        this.scene.background = this._envMap;
        this.scene.backgroundBlurriness = 1.0;
        this.scene.backgroundIntensity = 0.3;
      }
    },
    async applyModuleCode(code, mode = "replace") {
      this.isGenerating = true;
      try {
        if (!code || typeof code !== "string")
          throw new Error("Code must be a non-empty string");
        
        let fixedCode = code;
        // Auto-fix LLM brace mismatches. CRITICAL: scope the fix to the
        // USER CODE block (between the START/END markers) — NOT the
        // whole module. Previously we scanned the entire wrapped
        // string and removed the last `}` on imbalance, but a stray
        // `}` emitted by the LLM mid-code closes the generate()
        // function early, making `scene.add(root); return root;`
        // land outside any function → "Illegal return statement".
        // The wrapper is always balanced; imbalances come from user
        // code, so we trim trailing `}` from the USER CODE block
        // until it's balanced.
        const START = "// ── USER CODE START ──";
        const END   = "// ── USER CODE END ──";
        const sIdx = fixedCode.indexOf(START);
        const eIdx = fixedCode.indexOf(END);
        if (sIdx >= 0 && eIdx > sIdx) {
          const blockStart = sIdx + START.length;
          let block = fixedCode.slice(blockStart, eIdx);
          const countBraces = (s) => {
            // Count braces, ignoring those inside strings/comments.
            let o = 0, c = 0, i = 0, inStr = null, inLine = false, inBlock = false;
            while (i < s.length) {
              const ch = s[i];
              if (inLine) { if (ch === "\n") inLine = false; i++; continue; }
              if (inBlock) {
                if (ch === "*" && s[i + 1] === "/") { inBlock = false; i += 2; continue; }
                i++; continue;
              }
              if (inStr) {
                if (ch === "\\") { i += 2; continue; }
                if (ch === inStr) inStr = null;
                i++; continue;
              }
              if (ch === "/" && s[i + 1] === "/") { inLine = true; i += 2; continue; }
              if (ch === "/" && s[i + 1] === "*") { inBlock = true; i += 2; continue; }
              if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; i++; continue; }
              if (ch === "{") o++;
              else if (ch === "}") c++;
              i++;
            }
            return { o, c };
          };
          let { o: bo, c: bc } = countBraces(block);
          // Trim trailing `}` from user code until balanced (or gave up).
          let removed = 0;
          while (bc > bo && removed < 5) {
            const lastBrace = block.lastIndexOf("}");
            if (lastBrace === -1) break;
            block = block.slice(0, lastBrace) + block.slice(lastBrace + 1);
            bc--;
            removed++;
          }
          // Append missing `}` to user code block if still short (capped).
          let appended = 0;
          while (bo > bc && appended < 5) {
            block = block + "\n}";
            bc++;
            appended++;
          }
          if (removed > 0 || appended > 0) {
            console.warn(
              `[ThreeViewer] Auto-balanced user code: removed ${removed} trailing }, appended ${appended} }`
            );
            fixedCode = fixedCode.slice(0, blockStart) + block + fixedCode.slice(eIdx);
          }
        }
        // Final guard — full module balance check.
        const fopen  = (fixedCode.match(/{/g) || []).length;
        const fclose = (fixedCode.match(/}/g) || []).length;
        if (fopen !== fclose)
          throw new Error(
            `Syntax error: mismatched braces (${fopen} vs ${fclose})`
          );
        const blob = new Blob([fixedCode], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        let mod;
        try {
          mod = await import(/* @vite-ignore */ url);
        } catch (err) {
          URL.revokeObjectURL(url);
          throw new Error("Module import failed: " + err.message);
        }
        URL.revokeObjectURL(url);
        const generate = mod?.default;
        if (typeof generate !== "function")
          throw new Error("Module must export default function");
        // CRITICAL: clear the previous generation BEFORE we run the new one.
        // The old flow ran `generate(ctx)` first and then called clear() in
        // replace mode — clear wipes `_updateCallbacks`, which meant every
        // animation / physics tick the module just registered got deleted.
        // Now clear runs first so the new module's callbacks survive.
        if (mode === "replace") this.clear();

        // Baseline AAA post stack — barely-perceptible on each axis
        // so the composite reads as "cinematic" rather than "blurry
        // frame with RGB fringing." Generator code can override any
        // of these per scene. DoF defaults to OFF so scenes only get
        // bokeh when they explicitly opt in.
        this.setFilmGrain(0.025, 0.22);
        this.setChromatic(0.08, 2.2);
        this.setColorGrade({ saturation: 1.08, contrast: 1.02 });
        this.setDoF({ aperture: 0.0, maxblur: 0.0 });
        this.setUnderwater(false, { auto: true, color: 0x1a3860, distort: 0.005, rays: 0.45 });
        this.setAO({ radius: 0.6, intensity: 2.5, falloff: 0.25, quality: "High" });
        this.setBloom({ intensity: 0.7, threshold: 0.9, smoothing: 0.15, radius: 0.6 });

        const addUpdateCallback = (cb) => {
          if (typeof cb === "function") this._updateCallbacks.push(cb);
        };
        const helpers = this.createHelpers(addUpdateCallback);

        // Engine library surface (MAT/TEX/SHADER/FLUID/P). Lazy import so
        // the module loader only pays for it when generation actually runs.
        const { makeLibs } = await import('./gen3d/engine.js');
        const _engine = makeLibs({ THREE, addUpdateCallback });

        const ctx = {
          THREE,
          helpers,
          scene: this.scene,
          camera: this.camera,
          renderer: this.renderer,
          composer: this.composer,
          lights: this._lights,
          controls: this.controls,
          setObjectInfo: (info) => console.log("Object info:", info),
          addUpdateCallback,
          removeUpdateCallback: (cb) => {
            const i = this._updateCallbacks.indexOf(cb);
            if (i >= 0) this._updateCallbacks.splice(i, 1);
          },
          trackObject: (n, obj) => this._sceneObjects.set(n, obj),
          getObject: (n) => this._sceneObjects.get(n),
          // Lens-droplet post-effect: screen-space refractive raindrops
          // rendered over the final frame. density 0 = off, 1 = heavy.
          setScreenDroplets: (density, opts) => this.setScreenDroplets(density, opts),
          // Film grain + vignette post-process. strength 0 = off, ~0.06 heavy.
          setFilmGrain: (strength, vignette) => this.setFilmGrain(strength, vignette),
          // Cinematic post stack (Mancini toolkit):
          //   setChromatic(strength, falloff?)
          //   setDoF({ focus, aperture, maxblur })
          //   setColorGrade({ hue?, saturation?, contrast?, lift?, gain? })
          //   setLensFlare({ position: Vector3, strength, tint?, anamorphic?, occlusionTest? })
          //   setUnderwater(active|float, { color?, distort?, rays?, waterY?, auto? })
          setChromatic:   (strength, falloff) => this.setChromatic(strength, falloff),
          setDoF:          (opts) => this.setDoF(opts),
          setColorGrade:   (opts) => this.setColorGrade(opts),
          setLensFlare:    (opts) => this.setLensFlare(opts),
          setUnderwater:   (active, opts) => this.setUnderwater(active, opts),
          setEnvironment:  (url, opts) => this.setEnvironment(url, opts),
          // Scene-level post tuning the LLM can override per generation.
          // Weather (setHeightFog, setScreenDroplets density, lightning,
          // etc.) is intentionally NOT exposed — weather is user-driven
          // from the Viewer UI and inherits into every generation.
          setAO:           (opts) => this.setAO(opts),
          setBloom:        (opts) => this.setBloom(opts),
          _engine,
        };
        const result = await Promise.race([
          generate(ctx),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Generation timeout (30s)")),
              30000
            )
          ),
        ]);
        // (clear() already ran above — do NOT call it again here or the
        // update callbacks the generator just registered would be wiped.)
        if (result && result.isObject3D) {
          this.autoEnhanceObject(result, THREE);
          // Engine-level liquid auto-fill — detects vessel-shaped
          // LatheGeometry (concave profile, open top) and fills any
          // that lack liquid. Runs regardless of what the prompt was
          // about, so a potion/flask/fountain/tub/bowl always contains
          // correctly-placed water even if the LLM forgot FLUID.*.
          this._autoFillVessels(result, helpers, _engine);

          // Convention-driven liquid normalization. Walks the scene once
          // and upgrades any mesh tagged with userData.fluid /
          // userData.fluidContainer to the proper transmissive water
          // shader. This is the SCALABLE path that lets the codegen
          // invent any liquid scenario without us pattern-matching
          // archetypes in the prompt — the engine guarantees the
          // material layer regardless of how the geometry was built.
          // Runs AFTER _autoFillVessels so explicit tags can override
          // the heuristic auto-fill if the codegen was specific.
          if (_engine?.FLUID?.normalize) {
            try {
              _engine.FLUID.normalize(result, { helpers });
            } catch (err) {
              console.warn("[ThreeViewer] FLUID.normalize failed:", err?.message);
            }
          }
          // Liquid re-snap — must run BEFORE fallback ambience because a
          // crash in ambience would otherwise leave any user-misplaced
          // liquid floating in world space (the "vertical green baton
          // inside a tilted flask" bug). Bullet-proof try/catch inside.
          this._snapLiquidsToContainers(result);
          // Engine-level fallback ambience — starfield, aura, glow
          // shells, lens flare — fills in what weaker generations skip.
          await this._applyFallbackAmbience(result, _engine);
          result.name = "GeneratedObject";
          this.scene.add(result);
          // Build a bounding box that EXCLUDES backdrops (starfields,
          // nebulae, skydomes) — anything marked `userData.excludeFromBBox`.
          // Otherwise a large celestial radius forces the camera to back up
          // and the hero object reads as tiny.
          const box = new THREE.Box3();
          box.makeEmpty();
          const tmpBox = new THREE.Box3();
          result.traverse((child) => {
            if (!child.isMesh && !child.isPoints && !child.isLine) return;
            if (child.userData?.excludeFromBBox) return;
            if (!child.geometry) return;
            tmpBox.setFromObject(child);
            if (!tmpBox.isEmpty()) box.union(tmpBox);
          });
          // Fallback: if nothing qualified, use the full object's bbox.
          if (box.isEmpty()) box.setFromObject(result);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          // Tighter framing — the object should fill ~70% of the viewport
          // rather than sitting at 50%. Prior 2.0× multiplier produced
          // "small floating hero" vibes.
          const dist = Math.max(size.x, size.y, size.z) * 1.5;
          // Aim at the visual center (biased slightly upward) so the camera
          // doesn't sit nose-down against the ground plane.
          this.controls.target.set(center.x, center.y + size.y * 0.1, center.z);
          this.camera.position.set(
            center.x + dist * 0.55,
            center.y + dist * 0.45,
            center.z + dist * 0.55
          );
          this.controls.update();
        }
        this.$emit?.("generation-success", { mode, hasResult: !!result });
        return result;
      } catch (err) {
        console.error(err);
        this.$emit?.("generation-error", { error: err, message: err.message });
        throw err;
      } finally {
        this.isGenerating = false;
      }
    },
    cleanup() {
      window.removeEventListener("resize", this.onWindowResize);
      if (this._animationId) cancelAnimationFrame(this._animationId);
      if (this._ro) this._ro.disconnect?.();
      if (this._dragCleanup) this._dragCleanup();
      if (this.controls) this.controls.dispose?.();
      if (this.composer) this.composer.dispose?.();
      try {
        this.renderer?.dispose();
      } catch (_) {}
      this._updateCallbacks = [];
    },
  },
};
</script>
<style scoped>
.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
  border-radius: 100%;
  vertical-align: middle;
}
.three-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #080810 0%, #101020 50%, #0a1428 100%);
  cursor: grab;
}
.three-container:active {
  cursor: grabbing;
}
.three-container canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: 100% !important;
  height: 100% !important;
}
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 10, 0.95);
  backdrop-filter: blur(10px);
  z-index: 100;
}
.loading-overlay p {
  margin-top: 20px;
  color: #a5a6ff;
  font-size: 18px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.perf-stats {
  position: absolute;
  bottom: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stat-notification {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0.75em 1.25em !important;
  margin: 0 !important;
  font-size: 14px;
  border-radius: 4px;
}
.stat-notification .material-symbols-outlined {
  font-size: 20px;
}
.controls-hint {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  padding: 10px 16px;
  border-radius: 4px;
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.controls-hint span {
  color: rgba(255, 255, 255, 0.6);
  font-family: "Fira Sans", sans-serif;
  font-size: 12px;
  letter-spacing: 0.02em;
}
</style>
