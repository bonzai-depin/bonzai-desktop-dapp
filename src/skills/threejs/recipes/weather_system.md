# Weather system — central state + daily cycle

Canonical author: **Bruno Simon — `brunosimon/folio-2025`**

Key files to re-read:
- `sources/Game/Weather.js` — property aggregator
- `sources/Game/Cycles/DayCycles.js` — time-of-day keyframed presets
- `sources/Game/Wind.js` — shared `wind.offsetNode`
- `readme.md` — the ordered game-loop priority numbers (0 → 13)

See also: `_AUTHORS.md` for full citation + `rain.md`, `snow.md`, `lightning.md`
for consumers of the weather state.

## The pattern (Bruno's aggregator)

Every weather property is an object with `{ min, max, value, overrideValue, get() }`.
Properties are recomputed every tick from deterministic noise + year/day values.

| Property | Derivation |
|---|---|
| `temperature` | year value + day value + noise(dayProgress · 0.4) · 7.5 |
| `humidity` | year value + noise(dayProgress · 0.36) · 0.2 |
| `electricField` | day value · noise(dayProgress · 0.53) |
| `clouds` | noise(dayProgress · 0.44) |
| `wind` | noise(dayProgress) · 0.5 + 0.5 |
| `rain` | `remapClamp(humidity, 0.65, 1, 0, 1) * remapClamp(clouds, 0, 1, 0, 1)` |
| `snow` | `rain * freezeRatio + meltRatio` (temperature-gated) |

Bruno's noise function is intentionally deterministic + trivially cheap:
```js
// in Weather.js
noise(t) {
  return Math.sin(t) * Math.sin(t * 1.678) * Math.sin(t * 2.345)
}
```

**Why this is a huge pattern:** every visual subsystem (rain, snow, lightning,
water, grass, fog) reads FROM weather state. Nothing owns its own cloud
probability / rain density / humidity — they all derive from the one
aggregator. Consumers auto-sync.

## `override.start(values, duration)` for scripted events

Scripted events (tornado, cinematic storm, scene intro) can force weather
properties for a duration:
```js
weather.override.start({ humidity: 1, clouds: 1, wind: 1 }, 5)  // 5s
```

GSAP tween from current → override → current when duration elapses. Every
consumer reads `weather.rain.get()` which includes any active override.

## Game-loop priority numbers (from Bruno's readme)

Use this order VERBATIM when scheduling engine updates:

```
0   Time / Inputs
1   Player (pre)
2   PhysicalVehicle (pre)
3   Physics
4   Objects / Wireframe
5   Vehicle (post)
6   Player (post)
7   View
8   DayCycles / YearCycles / Weather
9   Wind / Lighting / Tornado
10  Area++ / Foliage / Fog / Reveal / Terrain / Trails / Floor / Grass /
    Leaves / Lightnings / RainLines / Snow / WaterSurface
13  InstancedGroup
```

Rule of thumb: **state first, then geometry that reads state**. Weather at 8,
rain/snow at 10, because those systems pull `weather.rain.value` /
`weather.snow.value` each frame.

## DayCycles (keyframed time-of-day)

Four presets — day, dusk, night, dawn — interpolated via keyframe stops at
`0.0 / 0.15 / 0.25 / 0.35 / 0.6 / 0.8 / 0.9` with a 4-minute loop.

Each preset controls:
- `lightColor`, `lightIntensity`, `shadowColor`
- `fogColorA`, `fogColorB`, `fogNearRatio`, `fogFarRatio`
- `revealColor`, `revealIntensity`
- `electricField`, `temperature`
- Any visual system reads these through a shared `dayCycles.current` handle.

**Single source of truth for lighting.** Systems don't have per-instance
light overrides; they read `dayCycles.current.lightColor`.

## Adoption status in BonzAI engine

**Currently**: weather is a simple preset switch in `ThreeViewer.vue`
(sunny / cloudy / rainy / stormy / snowy / blizzard / foggy). Each preset
bundles rain particle density, height fog density, lens droplet intensity,
etc. There is no property aggregator yet; the properties jump discretely
between presets.

**Next step (Phase 1 upgrade)**: introduce `src/engine/weather/WeatherSystem.js`
with Bruno's property aggregator. Presets become `override.start(...)` calls
that fade in/out smoothly instead of hard-switching. Every consumer
(rain particles, height fog uniform, lens droplets, wind offset) reads
`weather.humidity.get()`, `weather.rain.get()`, etc.

**Current implementation files**:
- `src/components/ThreeViewer.vue` :: `_weatherPresets` — static preset
  objects containing `{ fog, rain, snow, cloudOpacity, lightning,
  windStrength, ambientDim, lensDroplets, heightFog }`
- `src/components/ThreeViewer.vue` :: `applyWeatherPreset(mode)` — applies
  a preset by bulk-setting each consumer.

## Planned refactor (not yet shipped)

```js
// src/engine/weather/WeatherSystem.js
export class WeatherSystem {
  constructor() {
    this.dayProgress = 0
    this.yearProgress = 0
    this.properties = {
      temperature:   new WeatherProperty(-20, 40),
      humidity:      new WeatherProperty(0, 1),
      electricField: new WeatherProperty(0, 1),
      clouds:        new WeatherProperty(0, 1),
      wind:          new WeatherProperty(0, 1),
      rain:          new WeatherProperty(0, 1),
      snow:          new WeatherProperty(0, 1),
    }
    this.override = new WeatherOverride(this.properties)
  }
  update(dt) {
    this.dayProgress += dt / (60 * 60 * 24)   // 24h per game day
    this._recompute()
    this.override.update(dt)
  }
  _recompute() { /* Bruno's formulas */ }
  get rain()          { return this.properties.rain.get() }
  get humidity()      { return this.properties.humidity.get() }
  get clouds()        { return this.properties.clouds.get() }
  // ...
}
```

Consumers then read `weather.rain` instead of hardcoded preset values.
