# Snow — particle morph from rain + accumulation heightmap

Canonical author: **Bruno Simon — `folio-2025`**
- `sources/Game/World/RainLines.js` — rain↔snow morph
- `sources/Game/World/Snow.js` — ping-pong RT heightmap

See also: `_AUTHORS.md`, `rain.md`, `weather_system.md`.

## Technique A — Snow-as-rain-morph (Bruno's `RainLines.js`)

**The same instanced mesh renders both rain and snow.** When
`weather.snow` rises, vertex uniforms morph:

```glsl
float snowRatio = weather.snow / (weather.rain + weather.snow + 0.001);

// Line length: 1-3 world units for rain, 0.03 (dot-sized) for snow
float length = mix(uRainLen, uSnowLen, snowRatio);
// Fall speed: 0.2-0.4 for rain (fast streaks), 0.05 for snow (drifting flakes)
float speed  = mix(uRainSpeed, uSnowSpeed, snowRatio);
// Visibility gate: different weather property controls each
float vis    = mix(pow(weather.rain, 2), pow(weather.snow, 2), snowRatio);
```

Texture can also swap:
- Rain: thin white line via fragment (no texture).
- Snow: 64×64 white dot sprite via fragment.

Benefits:
- Single draw call covers both precipitation types.
- Mixed states (sleet — partial rain + partial snow at transition temperatures)
  are visually correct because the two properties coexist.
- Gradient transitions (snow starting as rain then freezing over a minute)
  happen via snowRatio lerp.

## Technique B — Snow accumulation heightmap (Bruno's `Snow.js`)

Snow accumulates on the ground. Bruno's technique:

### The heightmap RT
- A **ping-pong `WebGLRenderTarget`** of size 257² (power-of-2 +1 for edge
  coverage), format `HalfFloatType`, type `RedFormat` — one channel for
  elevation.
- Two RTs swapped each frame: `rtPrev` reads, `rtCurrent` writes.

### Per-frame update shader
```glsl
// Sample previous elevation + add snow for this frame + decay toward ambient
float prev = texture(rtPrev, vUv).r;
vec3 world = uvToWorld(vUv);

// Noise-driven snow accumulation — looks like natural drifts
float noise = noise(world.xz * 0.1) * noise(world.xz * 0.07);

// Add snow this frame (positive if snow is falling)
float accum = weather.snow * dt * 10.0 * noise;

// Footprint/track mask — from a separate RT the vehicle/player writes to
float track = texture(uTrackMask, vUv).r;
accum -= track * dt * 5.0;   // tracks compress snow

// Melt when warm
float melt = max(0, temperature - 0.5) * dt * 0.3;

float newHeight = clamp(prev + accum - melt, -1.0, 0.5);
gl_FragColor = vec4(newHeight, 0, 0, 1);
```

### The visible ground mesh
- 256×256 subdivided quad grid stretched over the ground.
- Vertex shader samples `rtCurrent` for elevation per vertex + applies to Y.
- Computes per-corner heights for lighting-correct normals:
  ```glsl
  vec3 a = sampleElevation(uv);
  vec3 b = sampleElevation(uv + vec2(dx, 0));
  vec3 c = sampleElevation(uv + vec2(0, dy));
  vec3 n = normalize(cross(b - a, c - a));
  ```
- White or pale-blue snow shader with subtle glint from `pow(fresnel, 32)`.

### Track mask
A separate 512² RT that the vehicle / character writes to each frame via a
small orthographic pass. Rapier body positions → XY projection → paint
brush mark into the mask.

### Water melt path
When temperature rises, elevation decays toward -1 (ground level). At
temperature > some threshold, switch back to rain visuals and zero the
height map. Over a few minutes the ground transitions from snowy → muddy
→ rainy → dry.

## Current engine implementation

`ThreeViewer.vue` uses naive `THREE.Points` for snow with per-frame CPU
position updates + sine wobble for side-to-side drift. No accumulation;
snow disappears on impact. Works for ambient mood but has none of the
systemic correctness of Bruno's approach.

## Upgrade path (deferred)

Snow accumulation heightmap is HIGH effort (~10-12 hours) for a MEDIUM
impact feature that only matters when the engine has:
- A consistent ground plane to accumulate on (LLM scenes vary).
- Persistent character/vehicle to leave tracks.
- Long-running sessions where accumulation is visible.

**Defer until outdoor scenes become a primary use case.** Meanwhile,
port the snow-as-rain-morph pattern first (rain.md Technique A): same
instanced mesh, both rain and snow.

## Anti-patterns

- **Separate rain and snow systems** → double the draw calls, double
  the CPU respawn overhead, no natural sleet/transition state.
- **Snow particles that "poof" on ground contact** → reveals the trick.
  Either accumulate on a heightmap or respawn silently above camera.
- **Snow with zero lateral drift** → falls straight down; real snow
  swirls. Use `sin(t × 1.7 + seed)` horizontal offset.
- **Snow pure white at full opacity** → blows out bloom + destroys
  visibility. Use slight grey (`#f5f8fc`) and cap opacity at 0.85.
