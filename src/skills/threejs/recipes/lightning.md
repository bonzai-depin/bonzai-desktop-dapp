# Lightning + thunder — storms

Canonical authors:
- **Faraz Shaikh — `demo-2024-a-storm-at-midnight/src/components/Lights.jsx`**
  + `.../Rain/Thunder.tsx` (noise-intensity spike + positional thunder audio)
- **Bruno Simon — `folio-2025/sources/Game/World/Lightnings.js`** (three-phase
  particle cascade)

See also: `_AUTHORS.md`, `weather_system.md`, `rain.md`.

## The problem with naive lightning

Adding a `DirectionalLight` that flicks `visible = true/false` looks
instant and harsh. Real lightning has:
- A sub-second flash with a clear rise/fall curve.
- Multiple micro-flashes within a single strike.
- A dimmer "preflash" before the main hit.
- Warm → cold → warm color tail.
- Spatial audio that lags behind the visual by (distance / speed-of-sound).

## Faraz's technique (noise-driven spike)

In `Lights.jsx`, lightning is a dedicated `directionalLight` whose intensity
ramps from 0 → peak → 0 via smoothstep on a noise value:

```js
const n = simplex.noise2D(0, time * 5);        // 0..1 @ 5Hz
const spike = smoothstep(0.7, 0.95, n);        // only fire at high values
light.intensity = spike * 25.0 * lightningActive;
```

`lightningActive` is a boolean gated by a `setTimeout` loop that schedules
thunder every 5-20 s randomly. When active, `light.intensity` flickers
naturally because of the underlying noise.

Thunder audio (`Thunder.tsx`): Howl.js loads N thunder clip sprites,
`makeThunder()` picks a random one and plays at the next `setTimeout`.

## Bruno's technique (three-phase particle cascade)

In `Lightnings.js`, every lightning strike is a scripted event with three
phases, not a single flash:

### Phase 1 — Anticipation (~0.5s before the hit)
- 32 sprite particles arranged in a ring at the ground impact point.
- Each rises 1.5 units over 0.5s, scale fade in-then-out.
- Subtle hum audio builds (electric field).
- Purpose: telegraph the upcoming strike so it's not a jarring surprise.

### Phase 2 — Arc (~0.1s)
- `LineGeometry` with 15 control points vertically, with lateral noise.
- 15 world-units tall from sky to ground.
- Easing scale (0 → 1 → 0) in ~100ms.
- `DirectionalLight` intensity burst during this phase.
- Thunder audio plays at impact time + (distance / speed-of-sound) delay.

### Phase 3 — Explosion (~0.3s)
- Small burst of 24 particles at the ground impact point.
- Radial outward velocity, gravity decay.
- Fades in ~300ms.

### Trigger probability

Bruno makes strikes weather-responsive:
```js
hitChances = max(0, weather.clouds) * max(0, weather.electricField) * weather.humidity;
// sample per second with frequency parameter (2 strikes/s max at peak)
if (Math.random() < hitChances * frequency * dt) triggerStrike();
```

So a calm day has ~0 strikes/s. A heavy storm (clouds=1, electricField=1,
humidity=1) has up to 2 strikes/s.

## Current engine implementation

`ThreeViewer.vue :: applyWeatherPreset` sets `_lightningEnabled = true/false`
based on the preset. `startRenderLoop` checks the flag and:
- Every 3-11s random, triggers `_lightningActive = true` + `_lightningFlashTime = 0.15s`.
- During active window, bumps `_lights.ambient.intensity = 8`.
- Flash decays when timer expires; ambient restores to preset baseline.

That's the v1. It's a single flash with no phases and no noise modulation.

## Upgrade plan

Combine Faraz's noise-driven intensity curve with Bruno's three-phase
structure. Implement as `src/engine/weather/Lightning.js`:

```js
export class LightningSystem {
  constructor({ scene, light, weather }) { ... }
  update(dt) {
    const chance = Math.max(0, weather.clouds) *
                   Math.max(0, weather.electricField) *
                   weather.humidity *
                   this.frequency * dt;
    if (Math.random() < chance) this._triggerStrike();
    for (const strike of this._active) strike.update(dt);
  }
  _triggerStrike() {
    this._active.push(new Strike({
      phases: [
        { type: "anticipation", duration: 0.5, onUpdate: ... },
        { type: "arc",          duration: 0.1, onUpdate: ... },
        { type: "explosion",    duration: 0.3, onUpdate: ... },
      ],
      onLight: (intensity) => this.light.intensity = intensity,
      position: this._pickStrikePosition(),
    }));
  }
}
```

Each phase modulates the shared `DirectionalLight` intensity and spawns
ephemeral particle systems. The overall `light.intensity` is noise-driven
via Faraz's smoothstep pattern during the arc phase.

## Audio sync

- Pre-load 3-5 thunder variations (low rumble, mid crack, sharp nearby,
  distant rumble) as Howler sprites or `THREE.PositionalAudio`.
- Compute `delay = distance(strikePos, camera) / 343m/s` — at 50m that's
  ~150ms, felt as a noticeable thunder-lag.
- Play with `setTimeout(play, delay * 1000)`.

## Anti-patterns

- **Single `visible = true` flash** → feels like a stroboscopic jump, no
  cinematic weight.
- **Lightning with no audio lag** → breaks immersion; brain expects
  thunder-after-flash.
- **Fixed lightning frequency** → always-on storms get monotonous. Drive
  frequency from `weather.electricField × weather.clouds × weather.humidity`.
- **Lightning that illuminates everything uniformly** → real lightning is
  directional; use a `DirectionalLight` not `AmbientLight` for the flash.
