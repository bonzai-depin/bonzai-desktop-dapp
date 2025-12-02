<template>
  <div ref="threeContainer" class="three-container">
    <div class="loading-overlay" v-if="isGenerating">
      <button disabled class="button is-loading is-info is-large"></button>
      <p class="fira-sans-condensed-black-italic">Generating object...</p>
    </div>

    <div class="perf-stats" v-if="!hideUI">
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

    <div class="controls-hint" v-if="!hideUI">
      <span>🖱️ Drag to orbit • Scroll to zoom • Right-drag to pan</span>
    </div>
  </div>
</template>

<script>
/* -------------------------------------------------
   UPGRADED THREE.JS CORE IMPORTS (VITE-FRIENDLY)
--------------------------------------------------- */
import * as THREE from "three";
/* Physics */
import * as CANNON from "cannon-es";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/* PMREM + ENVIRONMENT (for REAL gold & gems reflections) */
import { PMREMGenerator } from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

/* Post-Processing */
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

/* Vue */
import { markRaw, shallowRef } from "vue";

export default {
  name: "ThreeViewer",
  props: { hideUI: { type: Boolean, default: false } },

  data() {
    return {
      isGenerating: false,

      /* Time of day, weather, lighting exposure scalar */
      currentTimeOfDay: "day",
      currentWeather: "sunny",
      lightIntensity: 1.0,

      /* PMREM + Environment */
      _envMap: null,
      physics: {
        world: null,
        bodies: [],
        objects: [], // maps CANNON bodies to THREE meshes
        constraints: [],
      },
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
    /* internal state objects */
    this._animationId = null;
    this._updateCallbacks = [];
    this._sceneObjects = new Map();
    this._lights = {};
    this._ro = null;

    /* profiling */
    this._lastFrameTime = 0;
    this._frameCount = 0;
    this._fps = 0;
    this._objectCount = 0;

    /* environment animation */
    this._particleVelocities = [];
    this._weatherParticles = null;
    this._weatherVelocities = [];
    this._targetFogDensity = 0;

    /* sky + celestial */
    this._skyMesh = null;
    this._cloudLayer = null;
    this._stars = null;
    this._celestialBody = null;
    this._celestialGlow = null;
    this._moonCraters = null;
    this._sunRays = null;
    this._sunLight = null;

    /* -------
       LIGHTING PRESETS (ACES-tuned)
       ------- */
    this._presets = {
      sunrise: {
        skyTop: 0x1a1040,
        skyMid: 0xff8866,
        skyBottom: 0xffddaa,
        horizonGlow: 0xffffcc,
        horizonWidth: 0.025,
        horizonIntensity: 1.2,
        ambient: { color: 0xffd4aa, intensity: 1.2 },
        main: { color: 0xffaa66, intensity: 4.0, position: [60, 15, 50] },
        fill: { color: 0x6688cc, intensity: 1.0 },
        hemisphere: { sky: 0xffaa77, ground: 0x443322, intensity: 1.2 },
        fog: { color: 0xffcc99, density: 0.002 },
        exposure: 1.65,
        moon: 0,
        groundColor: 0x353540,
        celestialColor: 0xffcc66,
        celestialY: 0.06,
        celestialSize: 18,
        bloomStrength: 0.5,
        starsOpacity: 0.15,
        showSunRays: false,
        sunRayIntensity: 0.4,
      },

      day: {
        skyTop: 0x1166dd,
        skyMid: 0x55aaff,
        skyBottom: 0xaaddff,
        horizonGlow: 0xffffff,
        horizonWidth: 0.015,
        horizonIntensity: 0.55,
        ambient: { color: 0xffffff, intensity: 1.4 },
        main: { color: 0xfffff8, intensity: 4.0, position: [20, 60, 30] },
        fill: { color: 0x99ccff, intensity: 1.15 },
        hemisphere: { sky: 0x99ddff, ground: 0x667766, intensity: 1.35 },
        fog: { color: 0xccddff, density: 0.0013 },
        exposure: 1.55,
        moon: 0,
        groundColor: 0x404048,
        celestialColor: 0xffffee,
        celestialY: 0.85,
        celestialSize: 15,
        bloomStrength: 0.25,
        starsOpacity: 0,
        showSunRays: false,
        sunRayIntensity: 0.25,
      },

      afternoon: {
        skyTop: 0x2266cc,
        skyMid: 0x66aaee,
        skyBottom: 0xddeeff,
        horizonGlow: 0xffeedd,
        horizonWidth: 0.018,
        horizonIntensity: 0.7,
        ambient: { color: 0xfff8ee, intensity: 1.3 },
        main: { color: 0xffeedd, intensity: 3.8, position: [50, 35, 20] },
        fill: { color: 0x88aacc, intensity: 1.1 },
        hemisphere: { sky: 0xaaccee, ground: 0x665544, intensity: 1.2 },
        fog: { color: 0xddeeff, density: 0.0017 },
        exposure: 1.58,
        moon: 0,
        groundColor: 0x3a3a42,
        celestialColor: 0xffeedd,
        celestialY: 0.45,
        celestialSize: 16,
        bloomStrength: 0.25,
        starsOpacity: 0,
        showSunRays: false,
        sunRayIntensity: 0.3,
      },

      sunset: {
        skyTop: 0x0a0525,
        skyMid: 0xff5533,
        skyBottom: 0xffbb55,
        horizonGlow: 0xffee88,
        horizonWidth: 0.03,
        horizonIntensity: 1.35,
        ambient: { color: 0xffaa77, intensity: 1.1 },
        main: { color: 0xff6633, intensity: 3.4, position: [80, 8, 30] },
        fill: { color: 0x5533aa, intensity: 0.85 },
        hemisphere: { sky: 0xff7744, ground: 0x332211, intensity: 1.1 },
        fog: { color: 0xff8855, density: 0.0025 },
        exposure: 1.52,
        moon: 0,
        groundColor: 0x302530,
        celestialColor: 0xff5500,
        celestialY: 0.02,
        celestialSize: 22,
        bloomStrength: 0.5,
        starsOpacity: 0.25,
        showSunRays: false,
        sunRayIntensity: 0.6,
      },

      night: {
        skyTop: 0x000008,
        skyMid: 0x050818,
        skyBottom: 0x0a1530,
        horizonGlow: 0x203050,
        horizonWidth: 0.012,
        horizonIntensity: 0.45,
        ambient: { color: 0x4466aa, intensity: 0.75 },
        main: { color: 0x6688bb, intensity: 0.8, position: [-30, 50, -20] },
        fill: { color: 0x334466, intensity: 0.45 },
        hemisphere: { sky: 0x223355, ground: 0x101015, intensity: 0.55 },
        fog: { color: 0x080c18, density: 0.0028 },
        exposure: 1.38,
        moon: 4.0,
        groundColor: 0x181820,
        celestialColor: 0xddeeff,
        celestialY: 0.6,
        celestialSize: 12,
        bloomStrength: 0.1,
        starsOpacity: 1.0,
        showSunRays: false,
        sunRayIntensity: 0,
      },
    };

    /* WEATHER SYSTEM */
    this._weatherPresets = {
      sunny: { fog: 0, particles: 0, cloudOpacity: 0 },
      cloudy: { fog: 0.003, particles: 0, cloudOpacity: 0.35 },
      rainy: {
        fog: 0.007,
        particles: 2000,
        cloudOpacity: 0.6,
        particleType: "rain",
      },
      snowy: {
        fog: 0.005,
        particles: 1500,
        cloudOpacity: 0.45,
        particleType: "snow",
      },
      foggy: { fog: 0.013, particles: 0, cloudOpacity: 0.2 },
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

      // Broadphase = MUCH faster
      world.broadphase = new CANNON.SAPBroadphase(world);
      world.allowSleep = true;

      // Solver tuning
      world.solver.iterations = 10;
      world.solver.tolerance = 0.001;

      this.physics.world = world;
    },
    /* ---------------------------------------------------
       INIT THREE + PMREM + ENVIRONMENT MAP + HDR SKY
    ---------------------------------------------------- */
    async initThree() {
      let el = this.$refs.threeContainer;
      if (!el) {
        await this.$nextTick();
        el = this.$refs.threeContainer;
        if (!el) return;
      }

      const rect = el.getBoundingClientRect();
      let width = Math.floor(rect.width || 640);
      let height = Math.floor(rect.height || 360);
      if (width <= 0) width = 640;
      if (height <= 0) height = 360;

      /* --------------------------
         SCENE + FOG
      --------------------------- */
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0xccddff, 0.0013);
      this.scene = markRaw(scene);

      /* --------------------------
         CAMERA
      --------------------------- */
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 3000);
      camera.position.set(4, 3, 5);
      camera.lookAt(0, 0.8, 0);
      this.camera = markRaw(camera);

      /* --------------------------
         RENDERER (UPGRADED)
      --------------------------- */
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
      });
      renderer.setSize(width, height, true);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      /* BETTER SHADOWS */
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      /* ACES + Lower Exposure (requested) */
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      renderer.useLegacyLights = false;

      /* Correct color space for Vite + Three.js r162+ */
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      this.renderer = markRaw(renderer);

      renderer.debug.checkShaderErrors = false;

      const dpr = Math.min(window.devicePixelRatio, 1.5); // prevent retina overload
      renderer.setPixelRatio(dpr);

      /* Ensure clean canvas injection */
      while (el.firstChild && el.firstChild.tagName === "CANVAS") {
        el.removeChild(el.firstChild);
      }
      el.insertBefore(renderer.domElement, el.firstChild);

      /* --------------------------
         PMREM + HDR ENVIRONMENT MAP
      --------------------------- */
      const pmremGen = new PMREMGenerator(renderer);
      pmremGen.compileEquirectangularShader();

      this.renderer.useLegacyLights = false;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.renderer.setClearColor(0x000000, 0); // full transparent bg

      try {
        /* This HDR must be inside your public/ folder:
           /public/hdr/studio_small_03_1k.hdr
        */
        const hdrLoader = new RGBELoader();

        const hdrUrl = new URL(
          "../assets/studio_small_03_1k.hdr",
          import.meta.url
        ).href;

        const hdrTexture = await hdrLoader.loadAsync(hdrUrl);
        hdrTexture.wrapS = hdrTexture.wrapT = THREE.ClampToEdgeWrapping;
        hdrTexture.minFilter = THREE.LinearFilter;
        hdrTexture.magFilter = THREE.LinearFilter;

        const envMap = pmremGen.fromEquirectangular(hdrTexture).texture;
        envMap.minFilter = THREE.LinearFilter;
        envMap.magFilter = THREE.LinearFilter;
        this._envMap = envMap;
        scene.environment = envMap;

        hdrTexture.dispose();
      } catch (e) {
        console.warn("HDR Environment failed to load:", e);
      }

      /* --------------------------
         ORBIT CONTROLS (UPGRADED)
      --------------------------- */
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;

      controls.enableZoom = true;
      controls.enablePan = true;

      controls.minDistance = 1.0;
      controls.maxDistance = 60.0;

      controls.maxPolarAngle = Math.PI * 0.85;

      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.65;

      this.controls = markRaw(controls);

      /* --------------------------
         INIT SUBSYSTEMS
      --------------------------- */
      this.clock = markRaw(new THREE.Clock());

      this.setupSkySphere();
      this.setupStars();
      this.setupCelestialBody();
      this.setupSunRays();

      this.setupLighting();
      this.setupEnvironment();
      this.setupPostProcessing();
      this.setupWeatherSystem();

      /* --------------------------
         RESIZE OBSERVER
      --------------------------- */
      if (typeof ResizeObserver !== "undefined") {
        this._ro = new ResizeObserver((entries) => {
          const cr = entries[0]?.contentRect;
          if (!cr || !this.renderer || !this.camera) return;

          const w = Math.max(1, Math.floor(cr.width));
          const h = Math.max(1, Math.floor(cr.height));

          this.camera.aspect = w / h;
          this.camera.updateProjectionMatrix();

          const maxSize = 3000;
          const cw = Math.min(w, maxSize);
          const ch = Math.min(h, maxSize);

          this.renderer.setSize(cw, ch, true);
          if (this.composer) this.composer.setSize(cw, ch);
        });
        this._ro.observe(el);
      }

      this.initPhysicsWorld();

      /* --------------------------
         START RENDER LOOP
      --------------------------- */
      this.startRenderLoop();
    },
    /* ---------------------------------------------------
       SKY SPHERE — Smooth gradients + horizon glow
    ---------------------------------------------------- */
    setupSkySphere() {
      const skyGeo = new THREE.SphereGeometry(1200, 64, 64);

      const preset = this._presets[this.currentTimeOfDay || "day"];

      const skyMat = new THREE.ShaderMaterial({
        uniforms: {
          // Static sky colors (from your day preset)
          topColor: { value: new THREE.Color(preset.skyTop) },
          midColor: { value: new THREE.Color(preset.skyMid) },
          bottomColor: { value: new THREE.Color(preset.skyBottom) },

          // Horizon glow (your values)
          horizonColor: { value: new THREE.Color(preset.horizonGlow) },
          horizonWidth: { value: preset.horizonWidth },
          horizonIntensity: { value: preset.horizonIntensity },

          // ==== Required dynamic uniforms (these FIX the "NaN horizon rays" bug) ====

          // internal animation time (starts at 0)
          uTime: { value: 0.0 },

          // sun direction derived from your "celestialY = 0.85"
          // X and Z small tilt, Y comes from preset
          sunPosition: {
            value: new THREE.Vector3(0.2, preset.celestialY, 0.25),
          },

          // approximate sunlight strength (matching your main.intensity = 4.0)
          sunIntensity: { value: preset.main.intensity * 0.25 },

          // global exposure (matches your preset)
          exposure: { value: preset.exposure },

          // soft atmosphere density default
          atmosphereDensity: { value: 0.6 },

          // tint for scattering (very subtle)
          skyTint: { value: new THREE.Color(0x99bbff) },
        },
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = (modelMatrix * vec4(position,1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vPos;

          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 bottomColor;
          uniform vec3 horizonColor;

          uniform float horizonWidth;
          uniform float horizonIntensity;

          void main() {
            vec3 dir = normalize(vPos);
            float y = dir.y;

            vec3 color;

            if (y > 0.25) {
              float t = smoothstep(0.25, 1.0, y);
              color = mix(midColor, topColor, t);
            }
            else if (y > -0.05) {
              float t = smoothstep(-0.05, 0.25, y);
              color = mix(bottomColor, midColor, t);
            }
            else {
              color = bottomColor;
            }

            // Softer horizon
float h = 0.0;

            // Reduce atmospheric scatter brightness
            float scatter = exp(-abs(y) * 4.0) * 0.05;
            color += scatter * 0.15;

            gl_FragColor = vec4(color, 0.999);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
      });

      const skyMesh = new THREE.Mesh(skyGeo, skyMat);
      skyMesh.position.y = 200; // <<<<< FIX
      this.scene.add(skyMesh);
      this._skyMesh = skyMesh;
    },

    /* ---------------------------------------------------
       STARS — upper hemisphere only, twinkle shader
    ---------------------------------------------------- */
    setupStars() {
      const starCount = 2600;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(starCount * 3);
      const size = new Float32Array(starCount);
      const col = new Float32Array(starCount * 3);

      for (let i = 0; i < starCount; i++) {
        const az = Math.random() * Math.PI * 2;
        const el = Math.acos(Math.random() * 0.65 + 0.35); /* upper dome only */
        const r = 1100;

        const sx = r * Math.sin(el) * Math.cos(az);
        const sy = r * Math.cos(el);
        const sz = r * Math.sin(el) * Math.sin(az);

        pos[i * 3 + 0] = sx;
        pos[i * 3 + 1] = sy;
        pos[i * 3 + 2] = sz;

        size[i] = 0.6 + Math.random() * 2.2;

        const t = Math.random();
        if (t < 0.6) {
          col[i * 3 + 0] = 1.0;
          col[i * 3 + 1] = 1.0;
          col[i * 3 + 2] = 1.0;
        } else if (t < 0.8) {
          col[i * 3 + 0] = 0.8;
          col[i * 3 + 1] = 0.9;
          col[i * 3 + 2] = 1.0;
        } else {
          col[i * 3 + 0] = 1.0;
          col[i * 3 + 1] = 0.95;
          col[i * 3 + 2] = 0.8;
        }
      }

      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          t: { value: 0.0 },
          opacity: { value: 0.0 },
        },
        vertexShader: `
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;

          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (200.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          uniform float t;
          uniform float opacity;

          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;

            float glow = pow(1.0 - d * 2.0, 1.6);
            float tw = 0.8 + 0.2 * sin(t * 2.8);

            gl_FragColor = vec4(vColor, glow * tw * opacity);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const stars = new THREE.Points(geo, mat);
      this.scene.add(stars);
      this._stars = stars;
    },

    /* ---------------------------------------------------
       CELESTIAL BODY — Sun/Moon + glow + craters
    ---------------------------------------------------- */
    setupCelestialBody() {
      const group = new THREE.Group();

      /* Main body */
      const bodyGeo = new THREE.SphereGeometry(18, 48, 48);
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      group.add(body);
      this._celestialBody = body;

      /* Glow sprite */
      const glowCanvas = document.createElement("canvas");
      glowCanvas.width = 512;
      glowCanvas.height = 512;

      const gctx = glowCanvas.getContext("2d");
      const grad = gctx.createRadialGradient(256, 256, 0, 256, 256, 256);
      grad.addColorStop(0.0, "rgba(255,255,240,1.0)");
      grad.addColorStop(0.15, "rgba(255,240,180,0.75)");
      grad.addColorStop(0.4, "rgba(255,200,120,0.25)");
      grad.addColorStop(1.0, "rgba(255,150,80,0.0)");
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, 512, 512);

      const glowTex = new THREE.CanvasTexture(glowCanvas);
      glowTex.colorSpace = THREE.SRGBColorSpace;

      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(180, 180, 1);
      group.add(glow);
      this._celestialGlow = glow;

      // REAL sunlight from celestial body
      const sunLight = new THREE.DirectionalLight(0xffffff, 3.0); // intensity tuned
      sunLight.castShadow = true;

      // This makes the REAL light follow the sun mesh:
      sunLight.position.set(0, 0, 0);
      group.add(sunLight);

      this._lights.sun = sunLight;

      /* Moon craters */
      const craterGroup = new THREE.Group();
      const craterMat = new THREE.MeshBasicMaterial({
        color: 0xaabbcc,
        transparent: true,
        opacity: 0.35,
      });

      const craterData = [
        { x: 5, y: 3, r: 4 },
        { x: -6, y: -4, r: 5 },
        { x: 6, y: -2, r: 3 },
        { x: -3, y: 7, r: 4 },
        { x: 2, y: -7, r: 3 },
      ];

      craterData.forEach((c) => {
        const cg = new THREE.CircleGeometry(c.r, 20);
        const cm = new THREE.Mesh(cg, craterMat);
        cm.position.set(c.x, c.y, 17);
        craterGroup.add(cm);
      });

      group.add(craterGroup);
      this._moonCraters = craterGroup;
      craterGroup.visible = false;

      group.position.set(260, 480, -420);
      this.scene.add(group);
      this._sceneObjects.set("celestial", group);
    },

    /* ---------------------------------------------------
       SUN RAYS — large additive planes
    ---------------------------------------------------- */
    setupSunRays() {
      const rayGroup = new THREE.Group();
      const rayCount = 12;

      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2.0;
        const geo = new THREE.PlaneGeometry(10, 360);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffffcc,
          transparent: true,
          opacity: 0.035,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
        });

        const ray = new THREE.Mesh(geo, mat);
        ray.rotation.y = angle;
        ray.rotation.x = Math.PI / 2;
        rayGroup.add(ray);
      }

      this.scene.add(rayGroup);
      this._sunRays = rayGroup;
      rayGroup.visible = false;
    },
    /* ---------------------------------------------------
       GROUND — reflective metallic carbon + constant tone
       (consistent across all times of day)
    ---------------------------------------------------- */
    setupEnvironment() {
      const radius = 55;

      const groundGeo = new THREE.CircleGeometry(radius, 128);

      // Create metallic carbon effect — consistent for all presets
      const texCanvas = document.createElement("canvas");
      texCanvas.width = 512;
      texCanvas.height = 512;
      const ctx = texCanvas.getContext("2d");

      // Base silver-carbon tone (slightly purple tinted)
      ctx.fillStyle = "#8a7cae";
      ctx.fillRect(0, 0, 512, 512);

      // Carbon fiber weave — subtle & uniform
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 512; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }

      // Diagonal shimmering strands
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 0.8;
      for (let d = -512; d < 1024; d += 14) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + 512, 512);
        ctx.stroke();
      }

      const tex = new THREE.CanvasTexture(texCanvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(18, 18);

      const groundMat = new THREE.MeshPhysicalMaterial({
        color: 0x8a7cae,
        map: tex,

        // Makes the whole scene BRIGHTER and more visible
        metalness: 0.85,
        roughness: 0.15,
        reflectivity: 1.0,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.5,
      });

      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = 0;
      ground.receiveShadow = true;
      this.scene.add(ground);
      this._sceneObjects.set("ground", ground);

      // Fully circular square-grid overlay
      this.setupSquareGrid(radius);

      // Clouds around hemisphere
      this.setupCloudLayer();

      // Ambient floating particles (cosmic dust)
      this.setupAmbientParticles();
    },

    /* ---------------------------------------------------
       GRID — Square grid clipped perfectly to circle
    ---------------------------------------------------- */
    setupSquareGrid(radius) {
      const group = new THREE.Group();
      const gridColor = 0xb499ff;

      const gridSize = radius * 2;
      const cellSize = 2;
      const lineCount = Math.floor(gridSize / cellSize);

      for (let i = -lineCount / 2; i <= lineCount / 2; i++) {
        const pos = i * cellSize;

        if (Math.abs(pos) < radius) {
          const half = Math.sqrt(radius * radius - pos * pos);

          // Horizontal
          const hGeo = new THREE.BufferGeometry();
          hGeo.setAttribute(
            "position",
            new THREE.BufferAttribute(
              new Float32Array([-half, 0.008, pos, half, 0.008, pos]),
              3
            )
          );
          const fade = 0.45 * (1 - Math.abs(pos) / radius);
          const hMat = new THREE.LineBasicMaterial({
            color: gridColor,
            transparent: true,
            opacity: fade,
          });
          group.add(new THREE.Line(hGeo, hMat));

          // Vertical
          const vGeo = new THREE.BufferGeometry();
          vGeo.setAttribute(
            "position",
            new THREE.BufferAttribute(
              new Float32Array([pos, 0.008, -half, pos, 0.008, half]),
              3
            )
          );
          const vMat = new THREE.LineBasicMaterial({
            color: gridColor,
            transparent: true,
            opacity: fade,
          });
          group.add(new THREE.Line(vGeo, vMat));
        }
      }

      // Outer boundary ring (soft glow)
      const ringGeo = new THREE.RingGeometry(radius - 0.045, radius, 128);
      const ringMat = new THREE.MeshBasicMaterial({
        color: gridColor,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.0085;
      group.add(ring);

      this.scene.add(group);
      this._sceneObjects.set("grid", group);
    },

    /* ---------------------------------------------------
       CLOUD LAYER — subtle atmospheric dome
    ---------------------------------------------------- */
    setupCloudLayer() {
      const geo = new THREE.SphereGeometry(
        520,
        32,
        16,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      );

      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0, // dynamically controlled by weather
        side: THREE.BackSide,
        depthWrite: false,
      });

      const clouds = new THREE.Mesh(geo, mat);
      clouds.rotation.x = Math.PI;
      this.scene.add(clouds);
      this._cloudLayer = clouds;
    },

    /* ---------------------------------------------------
       AMBIENT PARTICLES — floating cosmic dust
    ---------------------------------------------------- */
    setupAmbientParticles() {
      const count = 280;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        pos[i * 3 + 0] = (Math.random() - 0.5) * 60;
        pos[i * 3 + 1] = Math.random() * 14 + 2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 60;

        // Color variation: cool / magenta / cyan
        const r = Math.random();
        if (r < 0.33) {
          col[i * 3 + 0] = 0.7;
          col[i * 3 + 1] = 0.5;
          col[i * 3 + 2] = 1.0;
        } else if (r < 0.66) {
          col[i * 3 + 0] = 0.4;
          col[i * 3 + 1] = 0.8;
          col[i * 3 + 2] = 1.0;
        } else {
          col[i * 3 + 0] = 1.0;
          col[i * 3 + 1] = 0.6;
          col[i * 3 + 2] = 0.9;
        }
      }

      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

      const mat = new THREE.PointsMaterial({
        size: 0.18,
        transparent: true,
        opacity: 0.55,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });

      const pts = new THREE.Points(geo, mat);
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

    /* ---------------------------------------------------
       WEATHER SYSTEM — fog, rain, snow, cloud fade
    ---------------------------------------------------- */
    setupWeatherSystem() {
      const count = 2500;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const vel = [];

      for (let i = 0; i < count; i++) {
        pos[i * 3 + 0] = (Math.random() - 0.5) * 90;
        pos[i * 3 + 1] = Math.random() * 32 + 5;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 90;

        vel.push({
          x: (Math.random() - 0.5) * 0.4,
          y: -4 - Math.random() * 4,
          z: (Math.random() - 0.5) * 0.4,
        });
      }

      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

      const mat = new THREE.PointsMaterial({
        color: 0xaaddff,
        size: 0.11,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
      });

      const weather = new THREE.Points(geo, mat);

      this._weatherVelocities = vel;
      this._weatherParticles = weather;
      this.scene.add(weather);
    },
    /* ---------------------------------------------------
       LIGHTING — Ambient + Hemisphere + Key/Fill
    ---------------------------------------------------- */
    /* ---------------------------------------------------
   LIGHTING — Single Celestial Light Architecture
---------------------------------------------------- */
    setupLighting() {
      const scene = this.scene;
      const p = this._presets[this.currentTimeOfDay];

      /* --------------------------------------------
     1) Ambient Light (soft global illumination)
  --------------------------------------------- */
      const ambient = new THREE.AmbientLight(
        p.ambient.color,
        p.ambient.intensity
      );
      scene.add(ambient);

      /* --------------------------------------------
     2) Hemisphere Light (subtle sky tint)
  --------------------------------------------- */
      const hemi = new THREE.HemisphereLight(
        p.hemisphere.sky,
        p.hemisphere.ground,
        p.hemisphere.intensity
      );
      scene.add(hemi);

      /* ---------------------------------------------------
     3) *** TRUE SUN LIGHT (The ONLY key light) ***
     Created inside setupCelestialBody(), stored as:
        this._lights.sun
     We DO NOT create another directional light here.
  ---------------------------------------------------- */

      // Ensure the celestial “sun” exists
      if (!this._lights.sun) {
        console.warn(
          "Celestial sunLight was not created — check setupCelestialBody()."
        );
      }

      /* ---------------------------------------------------
     4) (Optional) Fill Light — low power
        Softens shadows without creating hotspots
  ---------------------------------------------------- */
      const fill = new THREE.DirectionalLight(0x99ccff, p.fill.intensity);
      fill.position.set(-20, 25, -20);
      fill.castShadow = false;
      scene.add(fill);

      /* ---------------------------------------------------
     5) DISABLE the duplicated main directional light
        (Keep reference so existing code doesn't break)
  ---------------------------------------------------- */
      const dummyMain = new THREE.DirectionalLight(0xffffff, 0);
      dummyMain.visible = false;
      dummyMain.intensity = 0;
      scene.add(dummyMain);

      /* ---------------------------------------------------
     6) Store lights in the registry
  ---------------------------------------------------- */
      this._lights.ambient = ambient;
      this._lights.hemi = hemi;
      this._lights.main = dummyMain; // preserved but disabled
      this._lights.fill = fill;
    },

    /* ---------------------------------------------------
       POST-PROCESSING — Bloom + SMAA
    ---------------------------------------------------- */
    setupPostProcessing() {
      const renderer = this.renderer;
      const camera = this.camera;
      const scene = this.scene;

      const composer = new EffectComposer(renderer);
      const maxSize = 3000; // safe for all GPUs, avoids renderbuffer overflow
      const rw = Math.min(renderer.domElement.width, maxSize);
      const rh = Math.min(renderer.domElement.height, maxSize);

      composer.setSize(rw, rh);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

      // Base render pass
      composer.addPass(new RenderPass(scene, camera));

      // Bloom pass (stronger for metals, gems)
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(rw, rh),
        0.25,
        0.6,
        0.0
      );
      this._bloomPass = bloom;
      composer.addPass(bloom);

      // Anti-aliasing
      const smaa = new SMAAPass(rw, rh);
      composer.addPass(smaa);

      this.composer = markRaw(composer);
    },

    /* ---------------------------------------------------
       UPDATE: Time of day preset → Lighting + Sky + Bloom
    ---------------------------------------------------- */
    applyEnvironmentPreset(presetName) {
      const p = this._presets[presetName];
      if (!p) return;

      this.currentTimeOfDay = presetName;

      // Sky
      const skyMat = this._skyMesh.material;
      skyMat.uniforms.topColor.value.set(p.skyTop);
      skyMat.uniforms.midColor.value.set(p.skyMid);
      skyMat.uniforms.bottomColor.value.set(p.skyBottom);
      skyMat.uniforms.horizonColor.value.set(p.horizonGlow);
      skyMat.uniforms.horizonWidth.value = p.horizonWidth;
      skyMat.uniforms.horizonIntensity.value = p.horizonIntensity;

      // Celestial body
      this._celestialBody.material.color.set(p.celestialColor);
      this._celestialGlow.material.color.set(p.celestialColor);

      const cbGroup = this._sceneObjects.get("celestial");
      if (cbGroup) {
        cbGroup.position.y = p.celestialY * 520 + 200;
      }

      // Moon visibility
      this._moonCraters.visible = p.moon > 0;
      this._moonCraters.children.forEach((cr) => {
        cr.material.opacity = p.moon * 0.2;
      });

      // Stars
      this._stars.material.uniforms.opacity.value = p.starsOpacity;

      // Lights
      const L = this._lights;
      if (L.ambient)
        (L.ambient.color.set(p.ambient.color),
          (L.ambient.intensity = p.ambient.intensity));
      if (L.hemi) {
        L.hemi.color.set(p.hemisphere.sky);
        L.hemi.groundColor.set(p.hemisphere.ground);
        L.hemi.intensity = p.hemisphere.intensity;
      }
      // Disabled main key — celestial light is the ONLY key
      if (L.main) {
        L.main.visible = false;
        L.main.intensity = 0;
      }
      if (L.fill) {
        L.fill.color.set(p.fill.color);
        L.fill.intensity = p.fill.intensity * this.lightIntensity;
      }

      // Fog
      this.scene.fog.color.set(p.fog.color);
      this._targetFogDensity = p.fog.density;

      // Bloom
      this._bloomPass.strength = p.bloomStrength;

      // Sun rays visibility
      // this._sunRays.visible = p.showSunRays;
      // --- HARD DISABLE SUN RAYS ---
      this._sunRays.visible = false;
      this._sunRays.children.forEach((ray) => {
        ray.material.opacity = 0.0;
        ray.material.color.set(0x000000);
      });

      // Exposure
      this.renderer.toneMappingExposure = p.exposure * this.lightIntensity;
    },

    /* ---------------------------------------------------
       WEATHER MODE (rain, snow, fog, cloud opacity)
    ---------------------------------------------------- */
    applyWeatherPreset(mode) {
      const p = this._weatherPresets[mode];
      if (!p) return;

      this.currentWeather = mode;

      // Fog density target
      this._targetFogDensity = p.fog;

      // Clouds fade
      this._cloudLayer.material.opacity = p.cloudOpacity;

      // Weather particles fade
      if (this._weatherParticles) {
        this._weatherParticles.material.opacity = p.particles > 0 ? 0.85 : 0.0;
      }

      this._weatherParticleType = p.particleType || "none";
    },

    /* ---------------------------------------------------
       RENDER LOOP — physics + particles + postFX
    ---------------------------------------------------- */
    startRenderLoop() {
      const loop = () => {
        // === SUN LIGHT FOLLOWS CELESTIAL BODY ===
        // === REAL SUN LIGHT (the only light) ===
        if (this._celestialBody && this._lights.sun) {
          const sunWorldPos = new THREE.Vector3();
          this._celestialBody.getWorldPosition(sunWorldPos);

          this._lights.sun.position.copy(sunWorldPos);
          this._lights.sun.target.position.set(0, 0, 0);
          this._lights.sun.target.updateMatrixWorld();
        }
        const dt = this.clock.getDelta();
        const t = this.clock.elapsedTime;

        if (this.physics.world) {
          this.physics.world.step(1 / 60, dt, 3);

          // Sync meshes to physics bodies
          for (const body of this.physics.objects) {
            if (body.__mesh) {
              body.__mesh.position.copy(body.position);
              body.__mesh.quaternion.copy(body.quaternion);
            }
          }
        }

        // Camera-follow sky + stars
        if (this._skyMesh) {
          this._skyMesh.position.copy(this.camera.position);
        }
        if (this._stars) {
          this._stars.position.copy(this.camera.position);
        }

        // Sunrays rotation
        if (this._sunRays) {
          this._sunRays.rotation.y += dt * 0.05;
        }

        // Animate ambient particles
        const pts = this._sceneObjects.get("ambientParticles");
        if (pts) {
          const pos = pts.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            pos.array[i * 3 + 0] += this._particleVelocities[i].orbit;
            pos.array[i * 3 + 1] += this._particleVelocities[i].ySpeed * dt;
            if (pos.array[i * 3 + 1] > 16) pos.array[i * 3 + 1] -= 14;
          }
          pos.needsUpdate = true;
        }

        // Weather (rain/snow)
        if (this._weatherParticles) {
          const p = this._weatherParticles.geometry.attributes.position;
          const type = this._weatherParticleType;

          for (let i = 0; i < p.count; i++) {
            p.array[i * 3 + 0] += this._weatherVelocities[i].x * dt;
            p.array[i * 3 + 1] += this._weatherVelocities[i].y * dt;
            p.array[i * 3 + 2] += this._weatherVelocities[i].z * dt;

            // Reset below ground
            if (p.array[i * 3 + 1] < 0) {
              p.array[i * 3 + 0] = (Math.random() - 0.5) * 90;
              p.array[i * 3 + 1] = Math.random() * 32 + 5;
              p.array[i * 3 + 2] = (Math.random() - 0.5) * 90;
            }
          }
          p.needsUpdate = true;
        }

        // Fog interpolation (smooth)
        this.scene.fog.density +=
          (this._targetFogDensity - this.scene.fog.density) * dt * 0.5;

        // Apply callbacks (LLM-generated objects)
        for (const cb of this._updateCallbacks) cb({ deltaTime: dt, time: t });

        // Update controls
        if (this.controls) this.controls.update();

        // Render via composer
        if (this.composer) this.composer.render();
        else this.renderer.render(this.scene, this.camera);

        // Profile updates
        this.updateStats(dt);

        this._animationId = requestAnimationFrame(loop);
      };

      loop();
    },

    /* ---------------------------------------------------
       STATS (FPS, object count)
    ---------------------------------------------------- */
    updateStats(dt) {
      this._frameCount++;
      this._lastFrameTime += dt;

      if (this._lastFrameTime >= 0.25) {
        const fps = this._frameCount / this._lastFrameTime;
        this._fps = fps;

        if (this.$refs.fpsDisplay) {
          this.$refs.fpsDisplay.innerText = fps.toFixed(1) + " FPS";
        }

        const count = this.scene ? this.scene.children.length : 0;
        this._objectCount = count;

        if (this.$refs.objectCountDisplay) {
          this.$refs.objectCountDisplay.innerText = count + " Objects";
        }

        this._frameCount = 0;
        this._lastFrameTime = 0;
      }
    },
    /* ---------------------------------------------------
       PUBLIC API — Time of day
    ---------------------------------------------------- */
    setTimeOfDay(mode) {
      if (!this._presets[mode]) return;
      this.applyEnvironmentPreset(mode);
    },

    /* ---------------------------------------------------
       PUBLIC API — Weather
    ---------------------------------------------------- */
    setWeather(mode) {
      if (!this._weatherPresets[mode]) return;
      this.applyWeatherPreset(mode);
    },

    /* ---------------------------------------------------
       PUBLIC API — Light Intensity
    ---------------------------------------------------- */
    setLightIntensity(i) {
      this.lightIntensity = i;
      const p = this._presets[this.currentTimeOfDay];
      if (!p) return;

      if (this._lights.main) this._lights.main.intensity = p.main.intensity * i;
      if (this._lights.fill) this._lights.fill.intensity = p.fill.intensity * i;
      if (this._lights.ambient)
        this._lights.ambient.intensity = p.ambient.intensity * i;
      if (this._lights.hemi)
        this._lights.hemi.intensity = p.hemisphere.intensity * i;

      this.renderer.toneMappingExposure = p.exposure * i;
    },

    /* ---------------------------------------------------
       PUBLIC API — Auto-rotate camera
    ---------------------------------------------------- */
    setAutoRotate(enabled) {
      if (!this.controls) return;
      this.controls.autoRotate = enabled;
      this.controls.update();
    },

    /* ---------------------------------------------------
       PUBLIC API — Reset camera
    ---------------------------------------------------- */
    resetCamera() {
      if (!this.camera || !this.controls) return;

      this.camera.position.set(4, 3, 5);
      this.controls.target.set(0, 0.8, 0);
      this.controls.update();
    },

    /* ---------------------------------------------------
       Clear old generated objects
    ---------------------------------------------------- */
    clear() {
      if (!this.scene) return;
      this._updateCallbacks = [];

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
        this.scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material))
            obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      }

      this.resetCamera();
    },

    autoEnhanceObject(obj, THREE) {
      obj.traverse(function (n) {
        if (n.isMesh) {
          if (n.material) {
            n.material.needsUpdate = true;
            n.material.envMapIntensity = 1.6;

            if (!("clearcoat" in n.material)) {
              n.material.clearcoat = 0.2;
              n.material.clearcoatRoughness = 0.12;
            }

            if (n.material.roughness > 0.8) n.material.roughness = 0.55;

            if (n.material.metalness < 0.1) n.material.metalness = 0.25;

            // === MATERIAL CONFLICT FIX for chest lid ===
            if (n.isMesh && n.material) {
              // Prevent "white burn" on gold surfaces
              if (n.material.metalness > 0.8 && n.material.roughness < 0.25) {
                // Tone down reflections for gold
                n.material.envMapIntensity = 1.0;
                n.material.roughness = Math.max(0.22, n.material.roughness);

                // Slight specular curb
                if ("specularIntensity" in n.material) {
                  n.material.specularIntensity *= 0.8;
                }
              }

              // Fix z-fighting between gold rim & wooden panel
              n.renderOrder = 2;
            }
          }
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
    },

    /* ---------------------------------------------------
       applyModuleCode — LLM-generated Three.js module loader
       The heart of the 3D engine
    ---------------------------------------------------- */
    async applyModuleCode(code, mode = "replace") {
      this.isGenerating = true;

      try {
        if (!code || typeof code !== "string") {
          throw new Error("Code must be a non-empty string");
        }

        // prevent crashes from unsupported geometries
        if (/THREE\.CapsuleGeometry/.test(code)) {
          throw new Error(
            "CapsuleGeometry does not exist — use Cylinder or Sphere instead."
          );
        }

        // balanced braces check
        const open = (code.match(/{/g) || []).length;
        const close = (code.match(/}/g) || []).length;
        if (open !== close) {
          throw new Error(
            `Syntax error: mismatched braces (${open} vs ${close})`
          );
        }

        // dynamic import
        const blob = new Blob([code], { type: "text/javascript" });
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
        if (typeof generate !== "function") {
          throw new Error("Module must export default function");
        }

        // context passed to LLM-generated module
        const ctx = {
          THREE,
          CANNON,

          physics: {
            world: this.physics.world,
            addBody: (body, mesh) => {
              this.physics.bodies.push(body);
              this.physics.world.addBody(body);

              if (mesh) {
                body.__mesh = mesh;
                this.physics.objects.push(body);
              }
            },
            addConstraint: (c) => this.physics.constraints.push(c),
          },

          scene: this.scene,
          camera: this.camera,
          renderer: this.renderer,
          composer: this.composer,
          lights: this._lights,
          controls: this.controls,

          setObjectInfo: (info) => console.log("Object info:", info),

          addUpdateCallback: (cb) => {
            if (typeof cb === "function") this._updateCallbacks.push(cb);
          },
          removeUpdateCallback: (cb) => {
            const i = this._updateCallbacks.indexOf(cb);
            if (i >= 0) this._updateCallbacks.splice(i, 1);
          },

          trackObject: (n, obj) => this._sceneObjects.set(n, obj),
          getObject: (n) => this._sceneObjects.get(n),
        };

        // timeout
        const result = await Promise.race([
          generate(ctx),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Generation timeout (30s)")),
              30000
            )
          ),
        ]);

        // clear old object
        if (mode === "replace") {
          this.clear();
        }

        // attach new object
        if (result && result.isObject3D) {
          this.autoEnhanceObject(result, THREE);
          result.name = "GeneratedObject";
          this.scene.add(result);

          // auto-camera framing
          const box = new THREE.Box3().setFromObject(result);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const dist = maxDim * 1.8;

          this.controls.target.copy(center);
          this.camera.position.set(
            center.x + dist * 0.6,
            center.y + dist * 0.4,
            center.z + dist * 0.6
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

    /* ---------------------------------------------------
       CLEANUP — Remove listeners, stop animation, free GL
    ---------------------------------------------------- */
    cleanup() {
      window.removeEventListener("resize", this.onWindowResize);

      if (this._animationId) cancelAnimationFrame(this._animationId);
      if (this._ro) this._ro.disconnect?.();

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
