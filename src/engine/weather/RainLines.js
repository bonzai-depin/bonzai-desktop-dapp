/**
 * RainLines — Bruno Simon-style instanced line-quad precipitation.
 *
 * 2048 instanced thin quads authored as vertical "lines", rendered with
 * a custom ShaderMaterial that (a) wraps each line's world position
 * around the camera (so rain follows the user for free, no respawn loop),
 * (b) morphs seamlessly between rain (long fast streaks) and snow
 * (short slow dot-drifts) via length/speed lerp driven by the weather
 * rain/snow properties, (c) stochastically hides lines below a visibility
 * threshold so density is a continuous function of rain intensity.
 *
 * This replaces the previous THREE.Points + CPU-respawn system. Zero
 * per-frame CPU cost, single draw call, correct behavior at any camera
 * velocity.
 *
 * See /src/skills/threejs/recipes/rain.md (Technique A) and
 * /src/skills/threejs/recipes/_AUTHORS.md for citations.
 *
 * Usage:
 *   const rain = new RainLines({ count: 2048, tileSize: 40, maxLength: 2.5 });
 *   scene.add(rain.mesh);
 *   // each frame:
 *   rain.update(dt, time, camera, weather);   // weather is a WeatherSystem instance
 */
import * as THREE from "three";

export class RainLines {
  constructor({
    count     = 6000,
    tileSize  = 40,
    maxLength = 0.6,     // WAS 1.8 — streak too long, filled the screen vertically
    minLength = 0.04,
    maxSpeed  = 1.2,
    minSpeed  = 0.1,
    thickness = 0.0015,   // halved — finer rain + finer snow dots
    color     = 0xdbebff,
  } = {}) {
    this.count    = count;
    this.tileSize = tileSize;
    this.maxLength = maxLength;
    this.minLength = minLength;
    this.maxSpeed  = maxSpeed;
    this.minSpeed  = minSpeed;

    // Per-instance attributes:
    //   aSeed    — random 0..1 per line (drives phase + visibility gate)
    //   aRandom  — extra random for lateral jitter + color bias
    const geom = new THREE.InstancedBufferGeometry();
    // Base quad: 4 vertices forming a thin vertical strip; the vertex
    // shader uses aSide (±0.5 horizontal) and aHeight (0 or 1 vertical)
    // to place each vertex at the current line's top/bottom.
    const positions = new Float32Array([
      -0.5, 0, 0,   // bottom-left
       0.5, 0, 0,   // bottom-right
      -0.5, 1, 0,   // top-left
       0.5, 1, 0,   // top-right
    ]);
    const sides   = new Float32Array([-0.5, 0.5, -0.5, 0.5]);
    const heights = new Float32Array([0, 0, 1, 1]);
    const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("aSide",    new THREE.BufferAttribute(sides, 1));
    geom.setAttribute("aHeight",  new THREE.BufferAttribute(heights, 1));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));

    const seeds    = new Float32Array(count);
    const randoms  = new Float32Array(count);
    const basePos  = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds[i]   = Math.random();
      randoms[i] = Math.random();
      basePos[i * 3]     = (Math.random() - 0.5) * tileSize;
      basePos[i * 3 + 1] = 0;
      basePos[i * 3 + 2] = (Math.random() - 0.5) * tileSize;
    }
    geom.setAttribute("aSeed",    new THREE.InstancedBufferAttribute(seeds, 1));
    geom.setAttribute("aRandom",  new THREE.InstancedBufferAttribute(randoms, 1));
    geom.setAttribute("aBasePos", new THREE.InstancedBufferAttribute(basePos, 3));
    geom.instanceCount = count;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:          { value: 0 },
        uCameraPos:     { value: new THREE.Vector3() },
        uTileSize:      { value: tileSize },
        uLineLength:    { value: maxLength },
        uLineThickness: { value: thickness },
        uMotionBlur:    { value: 0.6 },   // gentle streak — 1.3 produced screen-spanning bars
        uLineSpeed:     { value: maxSpeed },
        uVisibleRatio:  { value: 0 },   // pow(rain+snow, 2) normalized
        uColor:         { value: new THREE.Color(color) },
        uSnowRatio:     { value: 0 },   // 0=rain, 1=snow
        uWindVec:       { value: new THREE.Vector3(0.2, 0, 0.15) },
        uIncline:       { value: 0.25 },  // wind-driven slant amount
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aSide;
        attribute float aHeight;
        attribute float aSeed;
        attribute float aRandom;
        attribute vec3  aBasePos;

        uniform float uTime;
        uniform vec3  uCameraPos;
        uniform float uTileSize;
        uniform float uLineLength;
        uniform float uLineThickness;
        uniform float uLineSpeed;
        uniform float uMotionBlur;
        uniform float uVisibleRatio;
        uniform float uSnowRatio;
        uniform vec3  uWindVec;
        uniform float uIncline;

        varying float vAlphaFade;
        varying float vSnow;

        void main() {
          // Stochastic visibility gate — drop lines below the threshold.
          if (fract(aSeed * 99.17) > uVisibleRatio) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // off-screen
            return;
          }

          // Wrap line base around the camera so the field tiles forever.
          vec3 p = aBasePos;
          p.x = mod(p.x - uCameraPos.x + uTileSize * 0.5, uTileSize) - uTileSize * 0.5 + uCameraPos.x;
          p.z = mod(p.z - uCameraPos.z + uTileSize * 0.5, uTileSize) - uTileSize * 0.5 + uCameraPos.z;

          // Fall progress in [0, 1]: deterministic per-line phase driven
          // by aSeed so each line falls at a unique offset.
          float fallSpan = uTileSize * 0.6;  // total vertical travel
          float yTop = uCameraPos.y + fallSpan * 0.5;
          float t = fract(uTime * uLineSpeed * 0.3 + aSeed);

          // Current top-of-line Y (the upper endpoint).
          float topY = yTop - t * fallSpan;
          // Motion blur — modest length boost for the streak illusion,
          // clamped so lines can't exceed ~2x authored length.
          float blurLen = uLineLength * clamp(0.8 + uLineSpeed * 0.3 * uMotionBlur, 0.8, 2.0);
          p.y = topY + aHeight * blurLen;

          // Wind-driven lateral offset proportional to fall distance.
          // Also apply a per-instance random lateral jitter for organic feel.
          float travelDown = yTop - p.y;
          p.xz += uWindVec.xz * travelDown * uIncline;
          p.x  += (aRandom - 0.5) * 0.04;
          p.z  += (fract(aRandom * 17.3) - 0.5) * 0.04;

          // Thickness billboarding: push aSide outward perpendicular to
          // the camera's right vector so the quad always faces camera.
          vec3 toCam = normalize(uCameraPos - p);
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          // Snow lines are thicker (dot-like) — scale thickness with
          // snow ratio.
          float thickness = uLineThickness * mix(1.0, 3.0, uSnowRatio);
          p += right * aSide * thickness;

          // Fade lines near the top+bottom of their fall (avoid pop-in/out).
          vAlphaFade = min(smoothstep(0.0, 0.1, t), smoothstep(1.0, 0.9, t));
          vSnow = uSnowRatio;

          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlphaFade;
        varying float vSnow;
        void main() {
          // Rain opacity stronger than snow (snow is a dot, rain a streak).
          float a = mix(0.8, 0.95, vSnow) * vAlphaFade;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });

    this.material = mat;
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.frustumCulled = false;    // we do camera-wrap manually
    this.mesh.userData.excludeFromBBox = true;
  }

  /**
   * Call each frame with weather state.
   * @param {number} dt deltaTime
   * @param {number} time running time
   * @param {THREE.Camera} camera
   * @param {WeatherSystem} weather
   */
  update(dt, time, camera, weather) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uCameraPos.value.copy(camera.position);

    const rain = weather?.rain ?? 0;
    const snow = weather?.snow ?? 0;
    const total = rain + snow;
    const snowRatio = total > 0.001 ? snow / total : 0;
    u.uSnowRatio.value = snowRatio;
    // Visibility ramps quadratically with total precipitation.
    u.uVisibleRatio.value = Math.min(1, Math.pow(total, 2));
    // Length + speed morph between rain and snow params.
    u.uLineLength.value = this.maxLength * (1 - snowRatio) + this.minLength * snowRatio;
    u.uLineSpeed.value  = this.maxSpeed  * (1 - snowRatio) + this.minSpeed  * snowRatio;
    // Wind strength drives the incline.
    u.uIncline.value = Math.min(0.6, (weather?.windStrength ?? 0.2) * 0.15);
    // Wind direction — fixed for now, could read from a shared Wind system.
    u.uWindVec.value.set(0.2, 0, 0.15).multiplyScalar(weather?.windStrength ?? 0.2);
  }

  /**
   * Scale visible particle count + motion-blur to the engine's render
   * quality preset. Mesh geometry stays the same (same VRAM); only
   * `instanceCount` shrinks so fewer lines are drawn.
   */
  setQuality(level) {
    const tiers = {
      low:    { fraction: 0.25, motionBlur: 0.3 },
      medium: { fraction: 0.5,  motionBlur: 0.5 },
      high:   { fraction: 1.0,  motionBlur: 0.6 },
      ultra:  { fraction: 1.0,  motionBlur: 0.8 },
    };
    const t = tiers[level] || tiers.high;
    this.mesh.geometry.instanceCount = Math.floor(this.count * t.fraction);
    this.material.uniforms.uMotionBlur.value = t.motionBlur;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
