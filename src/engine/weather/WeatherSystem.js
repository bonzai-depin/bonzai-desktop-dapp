/**
 * WeatherSystem — Bruno Simon-style property aggregator for scene weather.
 *
 * Every visual subsystem (rain particles, height fog, lens droplets,
 * lightning, wet surfaces, wind) READS from a single source of truth
 * here. Presets don't hard-switch values — they tween toward target
 * values over a configurable duration so transitions read as natural
 * weather change rather than scene cuts.
 *
 * See /src/skills/threejs/recipes/weather_system.md for the full recipe
 * and /src/skills/threejs/recipes/_AUTHORS.md for author citations.
 *
 * Property API:
 *   weather.rain           // current eased 0..1 value
 *   weather.snow           // ditto
 *   weather.clouds, humidity, wind, electricField, fog, lensDroplets,
 *   windStrength, ambientDim
 *
 * Overrides (the Bruno pattern):
 *   weather.setMode("rainy", 2.0)    // fade to rainy preset over 2s
 *   weather.set({ rain: 0.7 }, 3.0)   // ad-hoc override for scripted events
 *   weather.update(dt)               // call each frame; advances tweens
 */

const LERP = (a, b, t) => a + (b - a) * t;

export class WeatherProperty {
  constructor(initial = 0) {
    this.value  = initial;   // current displayed value
    this.target = initial;   // value we're easing toward
    this.rate   = 0.5;       // higher = snappier; derived from tween duration
  }
  setTarget(v, duration = 1.5) {
    this.target = v;
    // rate such that we cover ~90% of the gap in `duration` seconds.
    this.rate = 1 / Math.max(0.05, duration) * 2.3;
  }
  tick(dt) {
    const t = 1 - Math.exp(-this.rate * dt);
    this.value = LERP(this.value, this.target, t);
  }
}

export class WeatherSystem {
  constructor() {
    // Core properties. Every consumer reads `.value` each frame.
    // Initial values match "sunny" preset.
    this.properties = {
      rain:          new WeatherProperty(0),
      snow:          new WeatherProperty(0),
      clouds:        new WeatherProperty(0),
      humidity:      new WeatherProperty(0.3),
      wind:          new WeatherProperty(0.2),
      electricField: new WeatherProperty(0),
      // Bulk consumers that used to be read from _weatherPresets.
      fog:           new WeatherProperty(0),
      cloudOpacity:  new WeatherProperty(0),
      lensDroplets:  new WeatherProperty(0),
      windStrength:  new WeatherProperty(0.2),
      ambientDim:    new WeatherProperty(1),
    };
    this.currentMode = "sunny";
    this._lightningEnabled = false;
    // Preset table — same shape as the legacy ThreeViewer presets but
    // owned by the weather system so consumers don't reach back into
    // the viewer.
    this.modes = {
      sunny: {
        rain: 0, snow: 0, clouds: 0, humidity: 0.3, wind: 0.2, electricField: 0,
        fog: 0, cloudOpacity: 0, lensDroplets: 0, windStrength: 0.2,
        ambientDim: 1.0, lightning: false,
      },
      cloudy: {
        rain: 0, snow: 0, clouds: 0.6, humidity: 0.55, wind: 0.4, electricField: 0,
        fog: 0.008, cloudOpacity: 0.7, lensDroplets: 0, windStrength: 0.5,
        ambientDim: 0.7, lightning: false,
      },
      rainy: {
        rain: 0.85, snow: 0, clouds: 0.8, humidity: 0.9, wind: 0.6,
        electricField: 0.15,
        fog: 0.02, cloudOpacity: 0.85, lensDroplets: 0.45, windStrength: 1.5,
        ambientDim: 0.5, lightning: false,
      },
      stormy: {
        rain: 1, snow: 0, clouds: 0.95, humidity: 1, wind: 1,
        electricField: 1,
        fog: 0.028, cloudOpacity: 0.95, lensDroplets: 0.75, windStrength: 3.0,
        ambientDim: 0.3, lightning: true,
      },
      snowy: {
        rain: 0, snow: 0.8, clouds: 0.7, humidity: 0.5, wind: 0.4,
        electricField: 0,
        fog: 0.015, cloudOpacity: 0.75, lensDroplets: 0, windStrength: 0.8,
        ambientDim: 0.6, lightning: false,
      },
      blizzard: {
        rain: 0, snow: 1, clouds: 0.95, humidity: 0.6, wind: 1,
        electricField: 0,
        fog: 0.038, cloudOpacity: 0.95, lensDroplets: 0, windStrength: 4.0,
        ambientDim: 0.35, lightning: false,
      },
      foggy: {
        rain: 0, snow: 0, clouds: 0.4, humidity: 0.8, wind: 0.15,
        electricField: 0,
        fog: 0.045, cloudOpacity: 0.4, lensDroplets: 0, windStrength: 0.3,
        ambientDim: 0.55, lightning: false,
      },
    };
  }

  /**
   * Switch to a named preset with smooth tween.
   * @param {string} mode one of the keys in `this.modes`
   * @param {number} duration seconds to fade in; 0 = instant
   */
  setMode(mode, duration = 1.5) {
    const preset = this.modes[mode] || this.modes.sunny;
    this.currentMode = mode;
    for (const [key, target] of Object.entries(preset)) {
      if (key === "lightning") continue;
      if (this.properties[key]) this.properties[key].setTarget(target, duration);
    }
    this._lightningEnabled = !!preset.lightning;
  }

  /**
   * Ad-hoc override for scripted events (tornado, cinematic storm, etc).
   * @param {object} values e.g. { rain: 1, electricField: 1 }
   * @param {number} duration tween seconds
   */
  set(values, duration = 1.5) {
    for (const [key, v] of Object.entries(values)) {
      if (this.properties[key]) this.properties[key].setTarget(v, duration);
    }
  }

  /**
   * Step all tweens. Call once per frame before any consumer read.
   */
  update(dt) {
    for (const p of Object.values(this.properties)) p.tick(dt);
  }

  /**
   * Eased value accessor (what consumers use).
   */
  get(key) {
    return this.properties[key] ? this.properties[key].value : 0;
  }

  get rain()          { return this.properties.rain.value; }
  get snow()          { return this.properties.snow.value; }
  get clouds()        { return this.properties.clouds.value; }
  get humidity()      { return this.properties.humidity.value; }
  get wind()          { return this.properties.wind.value; }
  get electricField() { return this.properties.electricField.value; }
  get fog()           { return this.properties.fog.value; }
  get cloudOpacity()  { return this.properties.cloudOpacity.value; }
  get lensDroplets()  { return this.properties.lensDroplets.value; }
  get windStrength()  { return this.properties.windStrength.value; }
  get ambientDim()    { return this.properties.ambientDim.value; }
  get lightningEnabled() { return this._lightningEnabled; }
}
