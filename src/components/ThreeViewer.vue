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
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { markRaw, shallowRef } from "vue";

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
        get() { return this.geometry.boundingBox; },
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
    this._weatherPresets = {
      sunny: {
        fog: 0,
        rain: 0,
        snow: 0,
        cloudOpacity: 0,
        lightning: false,
        windStrength: 0.2,
        ambientDim: 1.0,
      },
      cloudy: {
        fog: 0.004,
        rain: 0,
        snow: 0,
        cloudOpacity: 0.7,
        lightning: false,
        windStrength: 0.5,
        ambientDim: 0.7,
      },
      rainy: {
        fog: 0.012,
        rain: 1.0,
        snow: 0,
        cloudOpacity: 0.85,
        lightning: false,
        windStrength: 1.5,
        ambientDim: 0.5,
      },
      stormy: {
        fog: 0.018,
        rain: 1.0,
        snow: 0,
        cloudOpacity: 0.95,
        lightning: true,
        windStrength: 3.0,
        ambientDim: 0.3,
      },
      snowy: {
        fog: 0.008,
        rain: 0,
        snow: 1.0,
        cloudOpacity: 0.75,
        lightning: false,
        windStrength: 0.8,
        ambientDim: 0.6,
      },
      blizzard: {
        fog: 0.025,
        rain: 0,
        snow: 1.0,
        cloudOpacity: 0.95,
        lightning: false,
        windStrength: 4.0,
        ambientDim: 0.35,
      },
      foggy: {
        fog: 0.035,
        rain: 0,
        snow: 0,
        cloudOpacity: 0.4,
        lightning: false,
        windStrength: 0.3,
        ambientDim: 0.55,
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
      scene.fog = new THREE.FogExp2(0xccddff, 0.0013);
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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
        scene.environmentIntensity = 0.4;
        this.renderer.toneMappingExposure = 1.0;
        hdrTexture.dispose();
      } catch (e) {
        console.warn("HDR Environment failed:", e);
      }
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.minDistance = 1.0;
      controls.maxDistance = 60.0;
      controls.maxPolarAngle = Math.PI * 0.85;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.65;
      this.controls = markRaw(controls);
      this.clock = markRaw(new THREE.Clock());
      this.setupSkySphere();
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
    createHelpers(addUpdateCallback) {
      const self = this;
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
          liquidMesh.position.copy(containerMesh.position);
          liquidMesh.rotation.copy(containerMesh.rotation);

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
          surface.position.copy(containerMesh.position);
          surface.position.y += fillY;

          const group = new THREE.Group();
          group.name = "liquid_fill";
          group.add(liquidMesh);
          group.add(surface);
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
          });
          const pts = new THREE.Points(geo, mat);
          pts.userData = { vels, baseY, maxY: o.maxY ?? 2, spread };
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
          });
          const pts = new THREE.Points(geo, mat);
          pts.userData = { vels, baseY, maxY: baseY + height, spread };
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
          });
          const pts = new THREE.Points(geo, mat);
          pts.userData = { vels, baseY, maxY: o.maxY ?? 3, spread };
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
          });
          const pts = new THREE.Points(geo, mat);
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
        },
        vertexShader: `varying vec3 vPos; void main() { vPos = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec3 vPos; uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor; void main() { vec3 dir = normalize(vPos); float y = dir.y; vec3 color; if (y > 0.25) { color = mix(midColor, topColor, smoothstep(0.25, 1.0, y)); } else if (y > -0.05) { color = mix(bottomColor, midColor, smoothstep(-0.05, 0.25, y)); } else { color = bottomColor; } gl_FragColor = vec4(color, 1.0); }`,
        side: THREE.BackSide,
        depthWrite: true,
      });
      const skyMesh = new THREE.Mesh(skyGeo, skyMat);
      skyMesh.position.y = 200;
      skyMesh.renderOrder = -1000;
      this.scene.add(skyMesh);
      this._skyMesh = skyMesh;
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
      const sunLight = new THREE.DirectionalLight(0xffffff, 5.0);
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
      const texCanvas = document.createElement("canvas");
      texCanvas.width = 512;
      texCanvas.height = 512;
      const ctx = texCanvas.getContext("2d");
      ctx.fillStyle = "#8a7cae";
      ctx.fillRect(0, 0, 512, 512);
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
      const tex = new THREE.CanvasTexture(texCanvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(18, 18);
      const groundMat = new THREE.MeshPhysicalMaterial({
        color: 0x8a7cae,
        map: tex,
        metalness: 0.7,
        roughness: 0.28,
        clearcoat: 0.6,
        envMapIntensity: 0.5,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);
      this._sceneObjects.set("ground", ground);
      this.setupSquareGrid(radius);
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
      cloudGroup.add(dome);
      const dome2 = new THREE.Mesh(
        new THREE.SphereGeometry(380, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        domeMat.clone()
      );
      dome2.rotation.x = Math.PI;
      dome2.rotation.y = Math.PI / 3;
      dome2.position.y = 45;
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
          size: 0.18,
          transparent: true,
          opacity: 0.55,
          vertexColors: true,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
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
      const rain = new THREE.Points(
        rainGeo,
        new THREE.PointsMaterial({
          color: 0x99ccff,
          size: 0.15,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
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
          size: 0.2,
          transparent: true,
          opacity: 0,
          sizeAttenuation: true,
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
          size: 0.3,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        })
      );
      this.scene.add(splash);
      this._splashParticles = splash;
      this._splashLife = splashLife;
      this._weatherParticles = rain;
      this._weatherVelocities = rainVel;
    },
    setupLighting() {
      const p = this._presets[this.currentTimeOfDay];
      const ambient = new THREE.AmbientLight(
        p.ambient.color,
        p.ambient.intensity
      );
      this.scene.add(ambient);
      const hemi = new THREE.HemisphereLight(
        p.hemisphere.sky,
        p.hemisphere.ground,
        p.hemisphere.intensity
      );
      hemi.position.set(0, 50, 0);
      this.scene.add(hemi);
      const fill = new THREE.DirectionalLight(0xaaccff, p.fill.intensity);
      fill.position.set(-20, 30, 40);
      this.scene.add(fill);
      const fill2 = new THREE.DirectionalLight(
        0xffddcc,
        p.fill.intensity * 0.6
      );
      fill2.position.set(30, 20, -30);
      this.scene.add(fill2);
      const rim = new THREE.DirectionalLight(0xffffff, 0.5);
      rim.position.set(0, 10, -50);
      this.scene.add(rim);
      const bounce = new THREE.PointLight(0xccbbff, 0.4, 30);
      bounce.position.set(0, 0.5, 0);
      this.scene.add(bounce);
      const dummyMain = new THREE.DirectionalLight(0xffffff, 0);
      dummyMain.visible = false;
      this.scene.add(dummyMain);
      this._lights = {
        ambient,
        hemi,
        main: dummyMain,
        fill,
        fill2,
        rim,
        bounce,
      };
    },
    setupPostProcessing() {
      const composer = new EffectComposer(this.renderer);
      const rw = Math.min(this.renderer.domElement.width, 3000),
        rh = Math.min(this.renderer.domElement.height, 3000);
      composer.setSize(rw, rh);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(rw, rh),
        0.2,
        0.5,
        0.7
      );
      this._bloomPass = bloom;
      composer.addPass(bloom);
      composer.addPass(new SMAAPass(rw, rh));
      this.composer = markRaw(composer);
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
      this.scene.fog.color.set(p.fog.color);
      this._targetFogDensity = p.fog.density;
      if (this._bloomPass) {
        this._bloomPass.strength = p.bloomStrength;
      }
      this._sunRays.visible = false;
      this.renderer.toneMappingExposure = p.exposure * this.lightIntensity;
    },
    applyWeatherPreset(mode) {
      const p = this._weatherPresets[mode];
      if (!p) return;
      this.currentWeather = mode;
      this._targetFogDensity = p.fog;
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
      if (this._rainParticles) {
        this._rainParticles.material.opacity = p.rain > 0 ? 0.7 * p.rain : 0;
        this._rainParticles.visible = p.rain > 0;
      }
      if (this._splashParticles) {
        this._splashParticles.material.opacity = p.rain > 0 ? 0.5 * p.rain : 0;
        this._splashParticles.visible = p.rain > 0;
      }
      if (this._snowParticles) {
        this._snowParticles.material.opacity = p.snow > 0 ? 0.85 * p.snow : 0;
        this._snowParticles.visible = p.snow > 0;
      }
      this._windStrength = p.windStrength || 0.5;
      this._lightningEnabled = p.lightning || false;
      const dimFactor = p.ambientDim || 1.0;
      if (this._lights.ambient) {
        this._lights.ambient.intensity =
          (this._presets[this.currentTimeOfDay]?.ambient?.intensity || 2.0) *
          dimFactor;
      }
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
            this._splashLife[i] -= dt * 3;
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
          this._lightningTimer += dt;
          if (this._lightningTimer > this._nextLightning) {
            this._lightningActive = true;
            this._lightningFlashTime = 0.15;
            this._lightningTimer = 0;
            this._nextLightning = 3 + Math.random() * 8;
            if (this._lights.ambient) {
              this._lights.ambient.intensity = 8;
            }
          }
          if (this._lightningActive) {
            this._lightningFlashTime -= dt;
            if (this._lightningFlashTime <= 0) {
              this._lightningActive = false;
              const p = this._weatherPresets[this.currentWeather];
              if (this._lights.ambient) {
                this._lights.ambient.intensity =
                  (this._presets[this.currentTimeOfDay]?.ambient?.intensity ||
                    2) * (p?.ambientDim || 1);
              }
            }
          }
        }
        this.scene.fog.density +=
          (this._targetFogDensity - this.scene.fog.density) * dt * 0.5;
        for (const cb of this._updateCallbacks) cb({ deltaTime: dt, time: t });
        if (this.controls) this.controls.update();
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
      const envMap = this._envMap;

      // ── Auto-scale: fit object within 1.5 unit max dimension ──
      const tempBox = new THREE.Box3().setFromObject(obj);
      const tempSize = tempBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(tempSize.x, tempSize.y, tempSize.z);
      if (maxDim > 1.5) {
        const scale = 1.5 / maxDim;
        obj.scale.multiplyScalar(scale);
        // Recompute after scaling to fix positioning
        const scaledBox = new THREE.Box3().setFromObject(obj);
        const minY = scaledBox.min.y;
        if (minY < 0) {
          obj.position.y -= minY; // lift above ground
        }
      }

      // ── Material enhancement pass ──
      let renderOrderCounter = 10;
      obj.traverse(function (n) {
        if (n.isMesh && n.material) {
          n.material.needsUpdate = true;
          if (envMap && n.material.isMeshPhysicalMaterial) {
            n.material.envMap = envMap;
            n.material.envMapIntensity = 1.0;
          } else {
            n.material.envMapIntensity = 1.0;
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
        }
      });
      // Gentle bloom boost for generated objects
      if (this._bloomPass) {
        this._bloomPass.strength = Math.max(this._bloomPass.strength, 0.18);
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
        let open = (fixedCode.match(/{/g) || []).length;
        let close = (fixedCode.match(/}/g) || []).length;
        // Auto-fix small brace mismatches (common LLM error)
        while (close > open && close - open <= 3) {
          const lastBrace = fixedCode.lastIndexOf('}');
          if (lastBrace === -1) break;
          fixedCode = fixedCode.slice(0, lastBrace) + fixedCode.slice(lastBrace + 1);
          close--;
          console.warn(`[ThreeViewer] Auto-removed trailing } (${open} vs ${close + 1} → ${close})`);
        }
        while (open > close && open - close <= 3) {
          fixedCode += '\n}';
          close++;
          console.warn(`[ThreeViewer] Auto-appended missing } (${open} vs ${close - 1} → ${close})`);
        }
        if (open !== close)
          throw new Error(
            `Syntax error: mismatched braces (${open} vs ${close})`
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
        const addUpdateCallback = (cb) => {
          if (typeof cb === "function") this._updateCallbacks.push(cb);
        };
        const helpers = this.createHelpers(addUpdateCallback);
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
        if (mode === "replace") {
          this.clear();
        }
        if (result && result.isObject3D) {
          this.autoEnhanceObject(result, THREE);
          result.name = "GeneratedObject";
          this.scene.add(result);
          const box = new THREE.Box3().setFromObject(result);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const dist = Math.max(size.x, size.y, size.z) * 2.0;
          // Target vertical center for better framing
          this.controls.target.set(center.x, center.y, center.z);
          // Slightly elevated angle for more dramatic presentation
          this.camera.position.set(
            center.x + dist * 0.6,
            center.y + dist * 0.5,
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
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
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
