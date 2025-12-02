<template>
  <div class="background"></div>

  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12 p-5">
          <div class="level">
            <div class="level-left">
              <div class="level-item">
                <h1 class="fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined mr-2"
                    style="font-size: 92px !important"
                  >
                    view_in_ar
                  </span>
                  3D Object Generator
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button
                  class="button is-medium is-info mr-2"
                  @click="showExamples = !showExamples"
                  title="View examples"
                >
                  <span class="material-symbols-outlined mr-1">
                    {{ showExamples ? "visibility_off" : "lightbulb" }}
                  </span>
                  {{ showExamples ? "Hide" : "Examples" }}
                </button>
                <button
                  class="button is-medium is-warning mr-2"
                  :disabled="isLoading"
                  @click="clearScene"
                  title="Clear scene"
                >
                  <span class="material-symbols-outlined mr-1">
                    delete_sweep
                  </span>
                  Clear
                </button>
                <button
                  class="button is-medium is-success"
                  @click="toggleAutoRotate"
                  title="Toggle rotation"
                >
                  <span class="material-symbols-outlined mr-1">
                    {{ autoRotate ? "pause_circle" : "play_circle" }}
                  </span>
                  {{ autoRotate ? "Stop" : "Rotate" }}
                </button>
              </div>
            </div>
          </div>

          <!-- GENERATION PROGRESS -->
          <div
            v-if="isLoading"
            class="generation notification is-info"
            style="margin-bottom: 1rem"
          >
            <p class="mb-2">
              <span class="fira-sans-condensed-black-italic is-size-4">
                <button
                  disabled
                  class="button is-loading is-info is-small mr-2 p-4"
                ></button>
                {{ lastStatus }}
              </span>
            </p>
            <progress class="progress is-success" max="100">
              Generating...
            </progress>
          </div>

          <!-- ENVIRONMENT CONTROLS -->
          <div class="environment-controls models__activity--payouts mb-4">
            <div class="columns is-multiline">
              <!-- Lighting Presets (5 beautiful options) -->
              <div class="column is-7">
                <label class="control-label fira-sans-condensed-black-italic">
                  <span class="material-symbols-outlined mr-1">palette</span>
                  Lighting Preset
                </label>
                <div class="time-buttons">
                  <button
                    v-for="preset in lightingPresets"
                    :key="preset.id"
                    class="time-btn"
                    :class="{ active: currentTime === preset.id }"
                    @click="setTimeOfDay(preset.id)"
                    :title="preset.label"
                  >
                    <span class="time-icon">{{ preset.icon }}</span>
                    <span class="time-label">{{ preset.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Weather -->
              <div class="column is-5">
                <label class="control-label fira-sans-condensed-black-italic">
                  <span class="material-symbols-outlined mr-1">cloud</span>
                  Weather
                </label>
                <div class="weather-buttons">
                  <button
                    v-for="weather in weatherOptions"
                    :key="weather.id"
                    class="weather-btn"
                    :class="{ active: currentWeather === weather.id }"
                    @click="setWeather(weather.id)"
                    :title="weather.label"
                  >
                    <span class="weather-icon">{{ weather.icon }}</span>
                    <span class="weather-label">{{ weather.label }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="columns">
              <!-- Light Intensity -->
              <div class="column is-12">
                <label class="control-label fira-sans-condensed-black-italic">
                  <span class="material-symbols-outlined mr-1">light_mode</span>
                  Light Intensity: {{ Math.round(lightIntensity * 100) }}%
                </label>
                <input
                  type="range"
                  class="light-slider"
                  min="0"
                  max="200"
                  :value="lightIntensity * 100"
                  @input="setLightIntensity($event.target.value / 100)"
                />
              </div>
            </div>
          </div>

          <!-- Example Prompts -->
          <div
            class="examples-panel models__activity--payouts"
            v-if="showExamples"
          >
            <div class="example-grid">
              <div
                v-for="(example, idx) in examplePrompts"
                :key="idx"
                class="example-card"
                @click="useExample(example)"
              >
                <div class="example-icon">{{ example.icon }}</div>
                <div class="example-title">{{ example.title }}</div>
                <div class="example-desc">{{ example.description }}</div>
              </div>
            </div>
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <form ref="promptForm" @submit.prevent="onSubmit">
                  <textarea
                    class="input is-large is-fullwidth"
                    placeholder="Describe a 3D object... (e.g., 'A mystical crystal orb with inner glow')"
                    v-model="form.prompt"
                    :disabled="isLoading"
                    @keydown.enter.exact.prevent="onSubmit"
                    style="min-height: 5em"
                  ></textarea>
                  <button
                    class="button chat is-loading is-outlined is-info is-large is-fullwidth"
                    v-if="isLoading"
                  ></button>
                </form>
              </div>
            </div>
          </div>

          <!-- VIEWER -->
          <div class="viewer-container">
            <div class="viewer-wrapper">
              <ThreeViewer
                ref="threeViewer"
                @generation-success="handleSuccess"
                @generation-error="handleError"
              />
            </div>
          </div>

          <!-- History -->
          <div v-if="objectInferences.length > 0">
            <ol class="chat">
              <li
                v-for="(item, index) in objectInferences.slice(-10).reverse()"
                :key="item.id"
              >
                <div class="question">
                  <div class="history-header">
                    <span
                      class="history-badge fira-sans-condensed-black-italic"
                    >
                      <span class="history-icon">
                        <span
                          class="material-symbols-outlined is-size-3"
                          v-if="item.success"
                        >
                          check_circle
                        </span>
                        <span
                          class="material-symbols-outlined is-size-3"
                          v-else
                        >
                          error
                        </span>
                      </span>
                      3D Object
                    </span>
                    <span class="history-meta fira-sans-condensed-black-italic">
                      {{ item.id }}
                    </span>
                  </div>
                  <hr />
                  <p class="history-prompt">{{ item.prompt }}</p>
                  <div v-if="!item.success" class="error-note">
                    <span class="material-symbols-outlined mr-1">error</span>
                    {{ item.notes }}
                  </div>
                  <hr />
                  <button
                    class="button is-medium is-success copy is-pulled-left p-0 pl-1 pr-1"
                    @click="copyPrompt(item.prompt, index)"
                  >
                    <span
                      class="material-symbols-outlined is-size-2"
                      v-if="!hasCopy[index]"
                    >
                      content_copy
                    </span>
                    <span class="material-symbols-outlined is-size-2" v-else>
                      check
                    </span>
                  </button>
                  <button
                    v-if="item.success"
                    class="button is-medium is-warning ml-5 is-pulled-left"
                    @click="applyInference(item)"
                    title="Load"
                  >
                    <span class="material-symbols-outlined mr-1">refresh</span>
                    Load
                  </button>
                  <button
                    class="button is-medium is-danger is-pulled-right p-0 pl-1 pr-1"
                    @click="removeInference(index)"
                    title="Delete"
                  >
                    <span class="material-symbols-outlined is-size-2">
                      delete
                    </span>
                  </button>
                  <button
                    class="button is-medium is-success ml-5 is-pulled-right mr-5 pl-3 pr-3"
                    @click="retryGeneration(item)"
                    title="Retry"
                  >
                    <span class="material-symbols-outlined is-size-3">
                      replay
                    </span>
                  </button>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, nextTick } from "vue";
import ThreeViewer from "./ThreeViewer.vue";
import useClipboard from "vue-clipboard3";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default {
  name: "Generative3D",
  components: { ThreeViewer },
  setup() {
    const isLoading = ref(false);
    const threeViewer = ref(null);
    const lastStatus = ref("");
    const showExamples = ref(false);
    const objectInferences = ref([]);
    const hasCopy = reactive([]);
    const autoRotate = ref(true);

    const currentTime = ref("day");
    const currentWeather = ref("sunny");
    const lightIntensity = ref(1.0);

    // 5 BEAUTIFUL LIGHTING PRESETS
    const lightingPresets = ref([
      { id: "sunrise", label: "Sunrise", icon: "🌅" },
      { id: "day", label: "Day", icon: "☀️" },
      { id: "afternoon", label: "Afternoon", icon: "🌤️" },
      { id: "sunset", label: "Sunset", icon: "🌇" },
      { id: "night", label: "Night", icon: "🌙" },
    ]);

    const weatherOptions = ref([
      { id: "sunny", label: "Clear", icon: "☀️" },
      { id: "cloudy", label: "Cloudy", icon: "☁️" },
      { id: "rainy", label: "Rain", icon: "🌧️" },
      { id: "snowy", label: "Snow", icon: "❄️" },
      { id: "foggy", label: "Fog", icon: "🌫️" },
    ]);

    const currentModel = ref({
      modelname: "Qwen3 Coder 30B A3B",
      modeldesc: "30.5B-parameter model for code generation",
      filename: "qwen3-coder-30b-a3b-instruct-ud-q3_k_xl.gguf",
      parameters: 30500000000,
      context: 262144,
    });
    const isModelLoaded = ref(false);
    const form = reactive({ prompt: "" });

    // DRAMATICALLY IMPROVED EXAMPLE PROMPTS
    const examplePrompts = ref([
      {
        icon: "💎",
        title: "Cosmic Crystal Cluster",
        description: "Bioluminescent alien crystals with energy particles",
        prompt: `A magnificent alien crystal cluster growing from volcanic obsidian rock. The main crystal is a 2-unit tall hexagonal prism using MeshPhysicalMaterial with transmission:0.92, thickness:4, ior:2.4, color:0x44ffaa. Create 8 smaller satellite crystals in varying sizes (0.3-0.8 units) arranged organically around the base, each with different hues (cyan, purple, pink, gold). Add internal PointLights (intensity:3) inside the larger crystals creating caustic glow effects. Create 200 tiny energy particles orbiting the cluster using Points with AdditiveBlending, animated in spiral patterns. The crystals should slowly pulse their emissive intensity (0.3-0.8) creating a breathing effect. Add floating dust motes (100 particles) drifting lazily upward. The obsidian base should use metalness:0.9, roughness:0.1 with subtle purple veins.`,
      },
      {
        icon: "🏴‍☠️",
        title: "Pirate Treasure Chest",
        description: "Overflowing gold coins and precious gems",
        prompt: `An ornate wooden treasure chest overflowing with riches. The chest is open at 45 degrees, made of dark mahogany (roughness:0.7, color:0x3d1f0d) with brass metal bands and corners (metalness:0.95, roughness:0.15, color:0xd4af37). Inside and spilling out: 50+ gold coins using IcosahedronGeometry flattened on Y-axis, scattered realistically with physics-like placement. Add 15 cut gemstones using OctahedronGeometry with MeshPhysicalMaterial transmission:0.9 - rubies (red), emeralds (green), sapphires (blue), diamonds (white with ior:2.4). Include a golden chalice, pearl necklace (spheres on curved path), and a jeweled crown. Add subtle golden PointLight inside the chest (intensity:2, color:0xffd700) making coins glimmer. Animate occasional sparkle particles rising from the treasure.`,
      },
      {
        icon: "🐲",
        title: "Dragon's Egg Nest",
        description: "Glowing scaled egg with magical fire",
        prompt: `A large dragon egg (1.5 units tall) nested in a bed of burning embers and gold coins. The egg shell is made of overlapping hexagonal scales using custom geometry, with MeshPhysicalMaterial: iridescence:1.0, iridescenceIOR:2.0, clearcoat:0.8, creating rainbow shimmer. The egg has internal glow (PointLight intensity:4, color:0xff4400) with visible veins of light through thinner shell patches. Subtle movement animation shows the egg occasionally rocking. Below: create a nest of glowing coals (emissive orange/red spheres), golden coins scattered around, and small magical flames (animated cone geometries with emissive material, transparent tips). Add rising ember particles (200) floating upward with random drift. Heat distortion effect simulated with floating transparent planes.`,
      },
      {
        icon: "⚔️",
        title: "Legendary Excalibur",
        description: "Mythical sword with flowing runes",
        prompt: `The legendary sword Excalibur embedded in an ancient stone. The blade is 2 units long, using MeshPhysicalMaterial with metalness:1.0, roughness:0.05, clearcoat:1.0 for mirror finish. Create intricate Celtic runes along the blade using thin box geometries with emissive cyan material that pulse in sequence (wave animation). The crossguard is ornate gold with embedded rubies (transmission material). The pommel contains a spinning magical orb (transmission:0.95, ior:2.0). The stone base is weathered grey with moss patches (green rougher areas). Add a divine light beam from above (SpotLight, volumetric effect with transparent cone). 100 particles of magical energy spiral around the blade. Ground-level mist using low-opacity particles.`,
      },
      {
        icon: "🤖",
        title: "Cyberpunk Mech Core",
        description: "Floating reactor with holographic displays",
        prompt: `A floating cyberpunk reactor core with holographic interfaces. Central sphere (radius:0.8) uses MeshPhysicalMaterial transmission:0.85, thickness:3, with internal glowing plasma (animated noise-based color shift cyan/purple). Three concentric rotating rings orbit the core at different angles and speeds, made of brushed metal (metalness:0.9) with glowing cyan edge strips. Holographic display panels float nearby - create using thin planes with emissive grid textures, slight transparency, and scan-line animation. Add floating data particles streaming between panels. 6 smaller satellite orbs orbit the main core. Electrical arcs occasionally jump between components (animated line geometry with emissive material). Base platform with hexagonal tech pattern.`,
      },
      {
        icon: "🌸",
        title: "Ethereal Spirit Flower",
        description: "Bioluminescent alien bloom with pollen",
        prompt: `An otherworldly flower from an alien forest. 6 large translucent petals using MeshPhysicalMaterial: transmission:0.7, thickness:1.5, color gradient from deep purple base to glowing cyan tips via vertex colors. Petals slowly open and close (breathing animation, scale 0.9-1.1). Bioluminescent veins run through each petal (thin emissive tubes) with light that pulses from stem to tip. Central stamen cluster with 12 glowing orbs (emissive yellow-green). The stem is organic and twisted, semi-transparent with visible internal structure. 150 floating pollen particles drift upward with gentle random motion, using Points with warm yellow color and AdditiveBlending. Crystal pot base with inner glow. Add tiny orbiting firefly particles.`,
      },
      {
        icon: "🏛️",
        title: "Ancient Floating Shrine",
        description: "Mystical ruins with energy waterfall",
        prompt: `A fragment of an ancient temple floating in the void. Weathered stone platform (3x3 units) with broken columns at corners - use cylinder geometry with noise-displaced vertices for weathering. Central altar with eternal flame (animated emissive cone with particle embers). Magical chains with broken links dangle from edges (torus links connected). Growing vines and moss patches on surfaces (green accent color). An energy waterfall flows off one edge - create with 500 particles flowing downward in a curtain pattern, cyan/white with AdditiveBlending. Glowing runes carved into the altar pulse softly. Anti-gravity crystals underneath emit purple light holding the structure aloft. Dust motes float in light beams. Cracked floor reveals magical core beneath.`,
      },
      {
        icon: "⏰",
        title: "Steampunk Chronosphere",
        description: "Time machine with spinning gears",
        prompt: `An intricate steampunk time device. Central gyroscope housing (3 nested rotating rings at perpendicular angles) made of brass (metalness:0.85, color:0xb87333, roughness:0.2). Inside: a glowing temporal core using MeshPhysicalMaterial transmission:0.9, animated swirling energy texture. 12 visible brass gears of varying sizes rotate around the outside, with teeth that interlock. Glass vacuum tubes with glowing plasma (emissive filaments inside). Copper pipes with occasional steam particle emission. Analog gauges with moving needles on the base platform. Lightning occasionally arcs between brass contact points (animated line geometry, emissive blue-white). Base of polished mahogany wood with brass fittings. Floating temporal particles phase in and out of existence.`,
      },
    ]);

    const setTimeOfDay = (time) => {
      currentTime.value = time;
      if (threeViewer.value) threeViewer.value.setTimeOfDay(time);
    };

    const setWeather = (weather) => {
      currentWeather.value = weather;
      if (threeViewer.value) threeViewer.value.setWeather(weather);
    };

    const setLightIntensity = (intensity) => {
      lightIntensity.value = intensity;
      if (threeViewer.value) threeViewer.value.setLightIntensity(intensity);
    };

    const toggleAutoRotate = () => {
      autoRotate.value = !autoRotate.value;
      if (threeViewer.value) threeViewer.value.setAutoRotate(autoRotate.value);
    };

    onMounted(async () => {
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "objectInferences",
          []
        );
        if (Array.isArray(saved)) objectInferences.value = saved;
      } catch (e) {}

      await nextTick();
      setTimeout(() => loadDefaultObject(), 500);
    });

    const saveInferences = async () => {
      try {
        await window.electronAPI?.store?.set?.(
          "objectInferences",
          JSON.parse(JSON.stringify(objectInferences.value))
        );
      } catch (e) {}
    };

    // BEAUTIFUL TREASURE CHEST WITH TRUE 3D DEPTH
    const loadDefaultObject = async () => {
      const viewer = threeViewer.value;
      if (!viewer) return;

      const defaultCode = `export default async function generate(params) {
  const THREE = params.THREE;
  const scene = params.scene;
  const addUpdateCallback = params.addUpdateCallback;
  const setObjectInfo = params.setObjectInfo;
  const root = new THREE.Group();
  root.name = "GeneratedChestUpgraded";

  setObjectInfo({
    title: "Legendary Treasure Chest (Upgraded Engine)",
    description: "High-quality PBR treasure chest with brightened coins, mixed gems, jewelry, crown, chalice, artifacts, sparkles, and AAA-tier shading."
  });

  // ============================================================================
  // CLEAN LIGHTING PRESET for Generated Objects
  // ============================================================================
  function createCleanLighting(THREE) {
    return {
      // soft fill from the treasure interior
      interiorFill: new THREE.PointLight(0xffd49c, 0.25, 2.0, 1.0),

      // optional subtle rim
      rimLight: new THREE.DirectionalLight(0xfff4d2, 0.15),

      // master intensity factor (can be controlled by UI)
      masterIntensity: 1.0,

      applyIntensity(factor) {
        this.masterIntensity = factor;
        this.interiorFill.intensity = 0.25 * factor;
        this.rimLight.intensity = 0.15 * factor;
      },

      addTo(root) {
        // soft treasure fill
        this.interiorFill.position.set(0, 0.55, 0);
        root.add(this.interiorFill);

        // soft overhead rim
        this.rimLight.position.set(1, 2, 1);
        root.add(this.rimLight);
      }
    };
  }


  ////////////////////////////////////////////////////////////////////////////
  // GEOMETRY CONSTANTS
  ////////////////////////////////////////////////////////////////////////////

  const chestWidth = 2.8;
  const chestDepth = 1.7;
  const chestHeight = 1.4;
  const thick = 0.12;

const innerMinX = -(chestWidth / 2 - thick * 1.1);
const innerMaxX =  (chestWidth / 2 - thick * 1.1);

const innerMinZ = -(chestDepth / 2 - thick * 1.1);
const innerMaxZ =  (chestDepth / 2 - thick * 1.1);
  const baseY = thick + 0.03;

  ////////////////////////////////////////////////////////////////////////////
  // MATERIALS
  ////////////////////////////////////////////////////////////////////////////

  // Procedural wood texture
  const woodCanvas = document.createElement("canvas");
  woodCanvas.width = 512;
  woodCanvas.height = 512;
  const wctx = woodCanvas.getContext("2d");

  // Base wood color
  wctx.fillStyle = "#3a2415";
  wctx.fillRect(0, 0, 512, 512);

  // Subtle grain lines
  for (let i = 0; i < 160; i++) {
    const y = Math.random() * 512;
    const alpha = 0.08 + Math.random() * 0.08;
    const style = "rgba(80,60,40," + alpha + ")";
    wctx.strokeStyle = style;
    wctx.lineWidth = 1 + Math.random() * 3;
    wctx.beginPath();
    wctx.moveTo(0, y);
    wctx.lineTo(512, y + (Math.random() * 40 - 20));
    wctx.stroke();
  }

  const woodTex = new THREE.CanvasTexture(woodCanvas);
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(1, 1);

  const woodMat = new THREE.MeshPhysicalMaterial({
    map: woodTex,
    roughness: 0.55,
    metalness: 0.05,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
    color: 0x6e4429,
    sheen: 0.2,
    sheenRoughness: 0.5
  });

  const innerWoodMat = new THREE.MeshPhysicalMaterial({
    map: woodTex,
    roughness: 0.75,
    metalness: 0.02,
    clearcoat: 0.2,
    color: 0x3a2415
  });


  // ==========================================================
  // CHEST BODY (static)
  // ==========================================================
  const bodyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(chestWidth, chestHeight, chestDepth),
    woodMat
  );

  bodyMesh.position.y = chestHeight / 2;

  // const woodMat = new THREE.MeshPhysicalMaterial({
  //   map: woodTex,
  //   roughness: 0.55,
  //   metalness: 0.05,
  //   clearcoat: 0.3,
  //   clearcoatRoughness: 0.4,
  //   color: 0x6e4429,
  //   sheen: 0.2,
  //   sheenRoughness: 0.5
  // });

  // const woodMat = new THREE.MeshPhysicalMaterial({
  //   map: woodTex,
  //   roughness: 0.75,
  //   metalness: 0.02,
  //   clearcoat: 0.2,
  //   color: 0x3a2415
  // });

  // BEAUTIFUL CRYSTAL GLASS MATERIAL
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.0,
  roughness: 0.015,          // ultra polished
  transmission: 0.98,         // maximum refraction
  thickness: 2.2,             // depth of refraction
  ior: 1.66,                  // higher than glass → jewel sparkle
  dispersion: 0.045,          // fake chromatic aberration
  envMapIntensity: 1.85,      // brighter reflections
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,
  attenuationTint: new THREE.Color(0xb0dfff),
  attenuationDistance: 1.25,
  iridescence: 0.45,
  iridescenceIOR: 1.6,
  iridescenceThicknessRange: [120, 380], // thin-film rainbow effect
  sheen: 0.28,
  sheenColor: new THREE.Color(0x99caff),
  sheenRoughness: 0.2,
    transparent: true,         // IMPORTANT
  opacity: 0.5,             // REGULATES visibility
});

  ////////////////////////////////////////////////////////////////////////////
  // METAL MATERIALS
  ////////////////////////////////////////////////////////////////////////////

  const goldTrimMat = new THREE.MeshPhysicalMaterial({
    color: 0xe8c35f,
    metalness: 1.0,
    roughness: 0.25,
    emissive: 0x4a350a,
    emissiveIntensity: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1
  });

  const goldMatBright = new THREE.MeshPhysicalMaterial({
    color: 0xffe38a,
    metalness: 1.0,
    roughness: 0.15,
    emissive: 0x663300,
    emissiveIntensity: 0.35,
    clearcoat: 0.9,
    clearcoatRoughness: 0.15
  });

  const goldMatNormal = new THREE.MeshPhysicalMaterial({
    color: 0xf6cf52,
    metalness: 1.0,
    roughness: 0.25,
    emissive: 0x221400,
    emissiveIntensity: 0.1,
    clearcoat: 0.6
  });

  const goldMatAntique = new THREE.MeshPhysicalMaterial({
    color: 0xc9a24b,
    metalness: 1.0,
    roughness: 0.45,
    emissive: 0x1a1200,
    emissiveIntensity: 0.05,
    clearcoat: 0.4
  });

  const metalMats = [ goldTrimMat, goldMatBright, goldMatNormal, goldMatAntique ];

  ////////////////////////////////////////////////////////////////////////////
  // GEM MATERIALS
  ////////////////////////////////////////////////////////////////////////////

  const gemColors = [
    0xff2e4d, // ruby
    0x33ffb6, // emerald
    0x3385ff, // sapphire
    0xdd55ff, // amethyst
    0xffffff, // diamond
    0xffaa00, // topaz
    0x00ffee, // aqua
    0xff6699  // rose quartz
  ];

  function makeGemMaterial(col) {
    return new THREE.MeshPhysicalMaterial({
      color: col,
      metalness: 0.0,
      roughness: 0.03,
      transmission: 0.92,
      thickness: 1.5,
      ior: col === 0xffffff ? 2.42 : 1.8,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      emissive: col,
      emissiveIntensity: 0.25
    });
  }


  ////////////////////////////////////////////////////////////////////////////
  // BASE STRUCTURE (HOLLOW CHEST SHELL)
  ////////////////////////////////////////////////////////////////////////////

  // FLOOR
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(chestWidth, thick, chestDepth),
    woodMat
  );
  floor.position.set(0, thick / 2, 0);
  floor.castShadow = true;
  floor.receiveShadow = true;
  root.add(floor);

  // BACK WALL
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(chestWidth, chestHeight, thick),
    woodMat
  );
  backWall.position.set(0, chestHeight / 2, -chestDepth / 2 + thick / 2);
  backWall.castShadow = true;
  root.add(backWall);

  // FRONT WALL (shorter)
  const frontWall = new THREE.Mesh(
    new THREE.BoxGeometry(chestWidth, chestHeight, thick),
    woodMat
  );
  frontWall.position.set(0, chestHeight / 2 , chestDepth / 2 - thick / 2);
  root.add(frontWall);

  // LEFT WALL
  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(thick, chestHeight, chestDepth - thick * 2),
    woodMat
  );
  leftWall.position.set(-chestWidth / 2 + thick / 2, chestHeight / 2, 0);
  leftWall.castShadow = true;
  root.add(leftWall);

  // RIGHT WALL
  const rightWall = leftWall.clone();
  rightWall.position.x = chestWidth / 2 - thick / 2;
  rightWall.castShadow = true;
  root.add(rightWall);

  ////////////////////////////////////////////////////////////////////////////
  // GOLD TRIM HELPERS
  ////////////////////////////////////////////////////////////////////////////

  function addTrim(x, y, z, sx, sy, sz) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      goldTrimMat
    );
    trim.position.set(x, y, z);
    trim.castShadow = true;
    root.add(trim);
  }

  // TOP perimeter trims
  addTrim(0, chestHeight +0.04, -chestDepth / 2 + 0.06, chestWidth + 0.05, 0.08, 0.12);
  addTrim(0, chestHeight +0.04,  chestDepth / 2 - 0.06, chestWidth + 0.05, 0.08, 0.12);

  // Vertical corner trims
  addTrim(-chestWidth / 2 + 0.06, chestHeight / 2, 0, 0.1, chestHeight, 0.1);
  addTrim( chestWidth / 2 - 0.06, chestHeight / 2, 0, 0.1, chestHeight, 0.1);


  ////////////////////////////////////////////////////////////////////////////
  // CHEST INTERNAL BOUNDS FOR TREASURE PLACEMENT
  ////////////////////////////////////////////////////////////////////////////

  const minX = innerMinX;
  const maxX = innerMaxX;
  const minZ = innerMinZ;
  const maxZ = innerMaxZ;
    ////////////////////////////////////////////////////////////////////////////
  // COIN GENERATION HELPERS
  ////////////////////////////////////////////////////////////////////////////

  // Cylinder geometry reused for all coins
  const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.028, 24);

  function spawnCoinAt(x, y, z, mat) {
    const c = new THREE.Mesh(coinGeo, mat);
    c.position.set(x, y, z);
    c.rotation.x = Math.PI / 2;
    c.rotation.z = Math.random() * Math.PI;
    c.castShadow = true;
    c.receiveShadow = false;
    root.add(c);
    return c;
  }

  ////////////////////////////////////////////////////////////////////////////
  // FILL CHEST WITH BRIGHT LAYERED COINS
  ////////////////////////////////////////////////////////////////////////////

  const allCoins = [];

  function fillCoinsLayer(count, baseY, spread) {
    for (let i = 0; i < count; i++) {
      const cx = minX + Math.random() * (maxX - minX);
      const cz = minZ + Math.random() * (maxZ - minZ);
      const cy = baseY + Math.random() * spread;
      const mat = metalMats[Math.floor(Math.random() * metalMats.length)];
      const coin = spawnCoinAt(cx, cy, cz, mat);
      allCoins.push(coin);
    }
  }

  // 6 layers of coins, progressively higher
  fillCoinsLayer(45, baseY + 0.03, 0.04);
  fillCoinsLayer(60, baseY + 0.15, 0.06);
  fillCoinsLayer(75, baseY + 0.28, 0.07);
  fillCoinsLayer(90, baseY + 0.43, 0.08);
  fillCoinsLayer(105, baseY + 0.60, 0.09);
  fillCoinsLayer(120, baseY + 0.78, 0.11);

  ////////////////////////////////////////////////////////////////////////////
  // GEM SHAPES (3 varieties)
  ////////////////////////////////////////////////////////////////////////////

  const gemGeoA = new THREE.OctahedronGeometry(0.12, 0);
  const gemGeoB = new THREE.ConeGeometry(0.14, 0.30, 6);
  const gemGeoC = new THREE.IcosahedronGeometry(0.13, 0);

  const gemGeos = [gemGeoA, gemGeoB, gemGeoC];

  ////////////////////////////////////////////////////////////////////////////
  // PLACE GEMS THROUGHOUT THE CHEST
  ////////////////////////////////////////////////////////////////////////////

  const allGems = [];

  function spawnGem() {
    const ggeo = gemGeos[Math.floor(Math.random() * gemGeos.length)];
    const gcol = gemColors[Math.floor(Math.random() * gemColors.length)];
    const gmat = makeGemMaterial(gcol);

    const gx = minX + Math.random() * (maxX - minX);
    const gz = minZ + Math.random() * (maxZ - minZ);
    const gy = baseY + 0.25 + Math.random() * 0.85;

    const gem = new THREE.Mesh(ggeo, gmat);
    gem.position.set(gx, gy, gz);
    gem.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    gem.castShadow = true;
    gem.receiveShadow = false;
    root.add(gem);
    allGems.push(gem);
  }

  for (let i = 0; i < 100; i++) {
    spawnGem();
  }

  ////////////////////////////////////////////////////////////////////////////
  // JEWELRY: RINGS
  ////////////////////////////////////////////////////////////////////////////

  const ringGeo = new THREE.TorusGeometry(0.14, 0.04, 16, 28);
  for (let i = 0; i < 14; i++) {
    const ringMat = metalMats[Math.floor(Math.random() * metalMats.length)];
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(
      minX + Math.random() * (maxX - minX),
      baseY + 0.35 + Math.random() * 0.75,
      minZ + Math.random() * (maxZ - minZ)
    );
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    ring.castShadow = true;
    ring.receiveShadow = false;
    root.add(ring);
  }

  ////////////////////////////////////////////////////////////////////////////
  // JEWELRY: SIMPLE NECKLACE (pearls-ish)
  ////////////////////////////////////////////////////////////////////////////

  const pearlMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff6e8,
    roughness: 0.25,
    metalness: 0.1,
    clearcoat: 0.4,
    clearcoatRoughness: 0.15
  });

  const pearlGeo = new THREE.SphereGeometry(0.055, 16, 16);

  for (let i = 0; i < 22; i++) {
    const t = i / 22;
    const px = 0.4 + Math.sin(t * Math.PI * 1.4) * 0.55;
    const pz = -0.2 + t * 0.9;
    const py = baseY + 0.55 + Math.sin(t * Math.PI) * 0.25;

    const pearl = new THREE.Mesh(pearlGeo, pearlMat);
    pearl.position.set(px, py, pz);
    pearl.castShadow = true;
    pearl.receiveShadow = false;
    root.add(pearl);
  }

  ////////////////////////////////////////////////////////////////////////////
  // ORNATE CROWN
  ////////////////////////////////////////////////////////////////////////////

  const crown = new THREE.Group();

  const crownBase = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.055, 12, 36),
    goldMatBright
  );
  crownBase.rotation.x = Math.PI / 2;
  crown.add(crownBase);

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const cx = Math.cos(angle) * 0.22;
    const cz = Math.sin(angle) * 0.22;

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.17, 6),
      goldMatBright
    );
    tip.position.set(cx, 0.10, cz);
    tip.rotation.x = -Math.PI / 2;
    tip.castShadow = true;
    crown.add(tip);

    const tipGem = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 10),
      makeGemMaterial(gemColors[i % gemColors.length])
    );
    tipGem.position.set(cx, 0.17, cz);
    tipGem.castShadow = true;
    crown.add(tipGem);
  }

  crown.position.set(0.65, baseY + 0.92, -0.22);
  crown.rotation.x = 0.28;
  crown.rotation.z = -0.25;
  root.add(crown);

  ////////////////////////////////////////////////////////////////////////////
  // CHALICE
  ////////////////////////////////////////////////////////////////////////////

  const chalice = new THREE.Group();

  const chaliceBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.20, 0.07, 16),
    goldMatBright
  );
  chaliceBase.position.y = 0.035;
  chalice.add(chaliceBase);

  const chaliceStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.08, 0.24, 12),
    goldMatBright
  );
  chaliceStem.position.y = 0.17;
  chalice.add(chaliceStem);

  const chaliceBowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.12, 0.20, 24, 1, true),
    goldMatBright
  );
  chaliceBowl.position.y = 0.37;
  chalice.add(chaliceBowl);

  chalice.position.set(-0.62, baseY + 0.52, 0.12);
  chalice.rotation.z = 0.18;
  chalice.castShadow = true;
  chalice.receiveShadow = false;
  root.add(chalice);


  ////////////////////////////////////////////////////////////////////////////
  // SPARKLES (soft floating fireflies)
  ////////////////////////////////////////////////////////////////////////////

  const sparkleCount = 70;
  const sparkleGeo = new THREE.BufferGeometry();
  const sparklePos = new Float32Array(sparkleCount * 3);
  const sparkleSpeed = [];

  for (let i = 0; i < sparkleCount; i++) {
    sparklePos[i * 3 + 0] = (Math.random() - 0.5) * (chestWidth * 0.9);
    sparklePos[i * 3 + 1] = baseY + 0.25 + Math.random() * 1.1;
    sparklePos[i * 3 + 2] = (Math.random() - 0.5) * (chestDepth * 0.9);
    sparkleSpeed.push(0.25 + Math.random() * 0.45);
  }

  sparkleGeo.setAttribute("position", new THREE.BufferAttribute(sparklePos, 3));

  const sparkleMat = new THREE.PointsMaterial({
    color: 0xffffcc,
    size: 0.055,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
  root.add(sparkles);
    ////////////////////////////////////////////////////////////////////////////
  // COINS SPILLING OUTSIDE THE CHEST (ALL LYING FLAT)
  ////////////////////////////////////////////////////////////////////////////

  function spawnSpillCoin() {
    const mat = metalMats[Math.floor(Math.random() * metalMats.length)];

    const c = new THREE.Mesh(coinGeo, mat);
    c.castShadow = true;

    // Radius arc in front of chest
    const angle = (Math.random() * 0.9) + 0.35;
    const r = 1.1 + Math.random() * 0.65;

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r + 0.35; 
    const y = 0.015 + Math.random() * 0.02;

    c.position.set(x, y, z);

    // Always horizontal
    c.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);

    return c;
  }

  for (let i = 0; i < 45; i++) {
    const sc = spawnSpillCoin();
    root.add(sc);
  }

  ////////////////////////////////////////////////////////////////////////////
  // GEMS SPILLING OUTSIDE THE CHEST
  ////////////////////////////////////////////////////////////////////////////

  function spawnSpillGem() {
    const ggeo = gemGeos[Math.floor(Math.random() * gemGeos.length)];
    const gcol = gemColors[Math.floor(Math.random() * gemColors.length)];
    const gmat = makeGemMaterial(gcol);

    const g = new THREE.Mesh(ggeo, gmat);
    g.castShadow = true;

    const angle = (Math.random() * 0.9) + 0.35;
    const r = 1.05 + Math.random() * 0.7;

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r + 0.35;
    const y = 0.04 + Math.random() * 0.04;

    g.position.set(x, y, z);
    g.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    return g;
  }

  for (let i = 0; i < 22; i++) {
    const g = spawnSpillGem();
    root.add(g);
  }

  ////////////////////////////////////////////////////////////////////////////
  // FINAL ADJUSTMENTS TO CROWN + CHALICE
  ////////////////////////////////////////////////////////////////////////////

  crown.traverse(function(n) {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = false;
    }
  });

  chalice.traverse(function(n) {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = false;
    }
  });

  ////////////////////////////////////////////////////////////////////////////
  // ANIMATION SYSTEM (Part 1 - Time + Sparkles + Gem Drift)
  ////////////////////////////////////////////////////////////////////////////

  let t = 0;

  addUpdateCallback(function(ctx) {
    const dt = ctx.deltaTime;
    if (!dt) return;

    t += dt;

    //////////////////////////////////////////////////////////////////////////
    // SPARKLES FLOATING UP
    //////////////////////////////////////////////////////////////////////////

    const p = sparkles.geometry.attributes.position;
    for (let i = 0; i < sparkleCount; i++) {
      let y = p.getY(i);
      let x = p.getX(i);

      y += sparkleSpeed[i] * dt * 0.25;
      x += Math.sin(t * 1.8 + i * 0.35) * dt * 0.28;

      if (y > baseY + 1.45) {
        y = baseY + 0.25;
        x = (Math.random() - 0.5) * (chestWidth * 0.9);
      }

      p.setXYZ(i, x, y, p.getZ(i));
    }
    p.needsUpdate = true;

    //////////////////////////////////////////////////////////////////////////
    // GEMS SLOW ROTATION
    //////////////////////////////////////////////////////////////////////////

    for (let i = 0; i < allGems.length; i++) {
      const g = allGems[i];
      g.rotation.y += dt * 0.35;
      g.rotation.x += dt * 0.1;
    }

    //////////////////////////////////////////////////////////////////////////
    // COINS SUBTLE SHIMMER
    //////////////////////////////////////////////////////////////////////////

    const shimmer = 0.18 + Math.sin(t * 5.2) * 0.06;
    goldMatEmissive.emissiveIntensity = shimmer;
    goldMatBright.emissiveIntensity = shimmer + 0.05;
  });


  ////////////////////////////////////////////////////////////////////////////
  // GOLD DUST PARTICLES OUTSIDE CHEST (ambient glitter)
  ////////////////////////////////////////////////////////////////////////////

  const dustCount = 140;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSpeed = [];

  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3 + 0] = (Math.random() - 0.5) * 4;
    dustPos[i * 3 + 1] = Math.random() * 1.6 + 0.1;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 4;

    dustSpeed.push(0.25 + Math.random() * 0.5);
  }

  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));

  const dustMat = new THREE.PointsMaterial({
    color: 0xffe0aa,
    size: 0.045,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const dust = new THREE.Points(dustGeo, dustMat);
  root.add(dust);


// ========================================================================
// PERFECTLY ALIGNED, OBLIQUE, REALISTIC TREASURE CHEST LID
// ========================================================================

// HEIGHT of back trim top
const backTrimY = chestHeight + 0.08;

// Create hinge pivot
const lidPivot = new THREE.Group();
lidPivot.position.set(
  0,
  backTrimY,                // EXACT height of gold trim
  -chestDepth / 2 + thick/2 // EXACTLY at back wall inner edge
);

// Create lid group (local space)
const lidGroup = new THREE.Group();

// ---------------------------
// BASE PANEL (inner face)
// ---------------------------
const lidBase = new THREE.Mesh(
  new THREE.BoxGeometry(chestWidth, thick, chestDepth),
  woodMat
);

// The base needs to sit *behind* the hinge axis
lidBase.position.set(0, 0, -chestDepth * 0.50);
lidGroup.add(lidBase);

// ---------------------------
// CURVED TOP PANEL
// ---------------------------
const lidRadius = chestDepth / 2;

const lidCurve = new THREE.CylinderGeometry(
  lidRadius,
  lidRadius,
  chestWidth,
  32,
  1,
  false,
  0,
  Math.PI
);

const lidTop = new THREE.Mesh(lidCurve, woodMat);

// Proper curvature direction:
lidTop.rotation.z = Math.PI / 2;
lidTop.rotation.x = Math.PI;

// Align with base
lidTop.position.set(0, thick / 2, -chestDepth * 0.50);
lidGroup.add(lidTop);

// ---------------------------
// GOLD TRIM
// ---------------------------
const lidTrim = new THREE.Mesh(
  new THREE.BoxGeometry(chestWidth + 0.05, 0.08, chestDepth + 0.05),
  goldTrimMat
);

// Same offset
lidTrim.position.set(0, 0, -chestDepth * 0.50);
lidGroup.add(lidTrim);

// Add constructed lid to hinge pivot
lidPivot.add(lidGroup);

// ========================================================================
// PERFECT OPEN ANGLE — *THIS is the beautiful oblique treasure-chest angle*
// ========================================================================
lidPivot.rotation.x = 0.5;   // (-75.6°) — natural, elegant backward lean

// Add to scene
root.add(lidPivot);


  ////////////////////////////////////////////////////////////////////////////
  // INTERNAL BOUNCE HIGHLIGHTS (small hemisphere light)
  ////////////////////////////////////////////////////////////////////////////

  const bounceLight = new THREE.HemisphereLight(0xfff4d0, 0x442200, 0.35);
  bounceLight.position.set(0, baseY + 0.65, -0.2);
  root.add(bounceLight);


  ////////////////////////////////////////////////////////////////////////////
  // ANIMATION EXTENSION (dust + glow pulse)
  ////////////////////////////////////////////////////////////////////////////

  addUpdateCallback(function(ctx) {
    const dt = ctx.deltaTime;
    if (!dt) return;

    // Glow pulsing
    glowMat.opacity = 0.20 + Math.sin(t * 1.8) * 0.06;

    // Dust drifting upward
    const dp = dust.geometry.attributes.position;
    for (let i = 0; i < dustCount; i++) {
      let x = dp.getX(i);
      let y = dp.getY(i);
      let z = dp.getZ(i);

      y += dustSpeed[i] * dt * 0.18;
      x += Math.sin(t * 1.2 + i * 0.22) * dt * 0.18;
      z += Math.cos(t * 1.1 + i * 0.17) * dt * 0.18;

      if (y > 2.0) {
        y = 0.05 + Math.random() * 0.25;
        x = (Math.random() - 0.5) * 4;
        z = (Math.random() - 0.5) * 4;
      }

      dp.setXYZ(i, x, y, z);
    }
    dp.needsUpdate = true;

    // Micro specular shimmer
    microSpecMat.opacity = 0.10 + Math.sin(t * 6.0) * 0.03;
  });
    ////////////////////////////////////////////////////////////////////////////
  // TREASURE PILE SHADING BOOST (fake AO + depth-based brightness)
  ////////////////////////////////////////////////////////////////////////////

  const pileBoostPlaneGeo = new THREE.PlaneGeometry(1.9, 1.1);
  const pileBoostPlaneMat = new THREE.MeshBasicMaterial({
    color: 0xffc56a,
    opacity: 0.22,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const pileBoost = new THREE.Mesh(pileBoostPlaneGeo, pileBoostPlaneMat);
  pileBoost.rotation.x = -Math.PI / 2;
  pileBoost.position.set(0, baseY + 0.28, -0.1);
  root.add(pileBoost);


  ////////////////////////////////////////////////////////////////////////////
  // TREASURE HOTSPOT FLASHES (random glints on metal)
  ////////////////////////////////////////////////////////////////////////////

  const hotspotCount = 10;
  const hotspots = [];
  const hotspotGeo = new THREE.CircleGeometry(0.09, 12);

  for (let i = 0; i < hotspotCount; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfff7d0,
      opacity: 0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const h = new THREE.Mesh(hotspotGeo, mat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(
      (Math.random() - 0.5) * 1.5,
      baseY + 0.32 + Math.random() * 0.35,
      -0.15 + (Math.random() - 0.5) * 0.65
    );
    hotspots.push(h);
    root.add(h);
  }


  ////////////////////////////////////////////////////////////////////////////
  // CHEST INTERIOR REFLECTION PLANES (fake indirect lighting)
  ////////////////////////////////////////////////////////////////////////////

  const reflPlaneGeo = new THREE.PlaneGeometry(1.9, 1.0);
  const reflPlaneMat = new THREE.MeshBasicMaterial({
    color: 0xffe4b0,
    opacity: 0.08,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const reflPlane = new THREE.Mesh(reflPlaneGeo, reflPlaneMat);
  reflPlane.rotation.x = -Math.PI / 2;
  reflPlane.position.set(0, baseY + 0.18, -0.1);
  root.add(reflPlane);

  const reflPlane2 = new THREE.Mesh(reflPlaneGeo, reflPlaneMat.clone());
  reflPlane2.rotation.x = -Math.PI / 2;
  reflPlane2.position.set(0, baseY + 0.42, -0.1);
  reflPlane2.material.opacity = 0.05;
  root.add(reflPlane2);


  ////////////////////////////////////////////////////////////////////////////
  // CAMERA MICRO-PARALLAX EFFECT (shimmer that reacts to movement)
  ////////////////////////////////////////////////////////////////////////////

  let prevCamPos = new THREE.Vector3();

  addUpdateCallback(function(ctx) {
    if (!ctx.camera) return;

    const cam = ctx.camera;
    const movement = cam.position.distanceTo(prevCamPos);

    // Increase sparkle and reflection brightness when camera moves
    const extra = Math.min(1.0, movement * 3.5);

    pileBoostPlaneMat.opacity = 0.20 + extra * 0.10;
    reflPlaneMat.opacity = 0.07 + extra * 0.05;

    prevCamPos.copy(cam.position);
  });


  ////////////////////////////////////////////////////////////////////////////
  // HOTSPOT FLASH ANIMATION
  ////////////////////////////////////////////////////////////////////////////

  addUpdateCallback(function(ctx) {
    const dt = ctx.deltaTime;
    if (!dt) return;

    for (let i = 0; i < hotspotCount; i++) {
      const h = hotspots[i];
      const tmod = (t * 1.6 + i * 0.35) % 4.0;

      // Fade-in / fade-out cycle
      let op = 0;
      if (tmod < 0.35) op = tmod / 0.35;
      else if (tmod > 2.5 && tmod < 2.85) op = 1 - (tmod - 2.5) / 0.35;

      // Final softened opacity
      h.material.opacity = op * 0.55;

      // Micro-size shimmer
      const scale = 0.08 + Math.sin((t * 3.0) + i) * 0.015;
      h.scale.setScalar(scale);
    }
  });


  ////////////////////////////////////////////////////////////////////////////
  // FINAL TREASURE ENHANCEMENT LOOP (rotate some gems, wobble artifacts)
  ////////////////////////////////////////////////////////////////////////////

  addUpdateCallback(function(ctx) {
    const dt = ctx.deltaTime;
    if (!dt) return;

    // Gem rotation is handled earlier — add wobble to jewelry
    for (let i = 0; i < artifactItems.length; i++) {
      const item = artifactItems[i];
      item.rotation.y += dt * 0.12 * (i % 2 === 0 ? 1 : -1);
      item.rotation.x += dt * 0.05;
    }
  });

  // PHYSICS AUTO-DROP AFTER 3 SECONDS
  if (params.physics && params.physics.world) {
    setTimeout(() => {
      // Create falling treasures
      for (let i = 0; i < 50; i++) {
        const shape = new params.CANNON.Sphere(0.08);
        const body = new params.CANNON.Body({
          mass: 0.1,
          shape,
          position: new params.CANNON.Vec3(
            (Math.random()-0.5)*1.2,
            chestHeight + 0.8 + Math.random()*0.4,
            (Math.random()-0.5)*1.2
          ),
        });

        // Visual mesh
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 16, 16),
          goldMatBright
        );
        mesh.castShadow = true;

        root.add(mesh);
        params.physics.addBody(body, mesh);
      }
    }, 3000);
  }


  ////////////////////////////////////////////////////////////////////////////
  // RETURN OBJECT FROM MODULE
  ////////////////////////////////////////////////////////////////////////////

  scene.add(root);
  return root;
}
  `;

      try {
        await viewer.applyModuleCode(defaultCode, "replace");
      } catch (err) {
        console.error("Failed to load default object:", err);
      }
    };

    const { toClipboard } = useClipboard();

    const copyPrompt = async (text, index) => {
      try {
        await toClipboard(text);
        hasCopy[index] = true;
        setTimeout(() => (hasCopy[index] = false), 2000);
      } catch (e) {
        console.error("Copy failed:", e);
      }
    };

    const clearScene = () => {
      if (threeViewer.value) threeViewer.value.clear();
    };

    const handleSuccess = (data) => {
      console.log("Generation success:", data);
    };

    const handleError = (data) => {
      console.error("Generation error:", data);
    };

    const useExample = (example) => {
      form.prompt = example.prompt;
      showExamples.value = false;
    };

    const removeInference = async (index) => {
      const realIndex = objectInferences.value.length - 1 - index;
      objectInferences.value.splice(realIndex, 1);
      await saveInferences();
    };

    const applyInference = async (item) => {
      if (!item.code || !threeViewer.value) return;
      try {
        await threeViewer.value.applyModuleCode(item.code, "replace");
      } catch (err) {
        console.error("Failed to apply inference:", err);
      }
    };

    const retryGeneration = async (item) => {
      form.prompt = item.prompt;
    };

    const loadModelForGeneration = async () => {
      if (!isModelLoaded.value) {
        const payload = {
          filename: currentModel.value.filename,
          parameters: currentModel.value.parameters,
          context: currentModel.value.context,
        };
        lastStatus.value = "📥 Loading AI model...";
        try {
          await window.electronAPI.loadModel(payload);
          isModelLoaded.value = true;
          lastStatus.value = "✅ Model ready";
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          throw new Error(`Model loading failed: ${error.message}`);
        }
      }
    };

    const buildObjectPrompt = (userText) => {
      return `You are an ELITE Three.js artist creating STUNNING, AWARD-WINNING 3D objects with VFX-quality rendering.

══════════════════════════════════════════════════════════════════════════
REQUIREMENTS
══════════════════════════════════════════════════════════════════════════

1. Create PHOTOREALISTIC objects using advanced MeshPhysicalMaterial
2. Use transmission (0.8-0.95) for glass/crystal/gems
3. Use proper ior values: glass=1.5, water=1.33, diamond=2.4, crystal=1.8
4. Add clearcoat for wet/lacquered surfaces
5. Use iridescence for rainbow/oil effects
6. Add emissive materials for glowing elements
7. Create particle systems (100-300 particles) for atmosphere
8. Add PointLights inside glowing objects
9. Smooth animations: floating, rotating, pulsing, orbiting
10. Position objects ABOVE ground (y >= 0.1)
11. Cast shadows with castShadow = true

══════════════════════════════════════════════════════════════════════════
FORBIDDEN - WILL CAUSE ERRORS
══════════════════════════════════════════════════════════════════════════

❌ THREE.CapsuleGeometry - use CylinderGeometry + SphereGeometry
❌ THREE.TextGeometry - use canvas textures instead
❌ External textures/loaders - create procedurally

══════════════════════════════════════════════════════════════════════════
CONTEXT AVAILABLE
══════════════════════════════════════════════════════════════════════════

{ THREE, scene, camera, lights, controls, setObjectInfo, addUpdateCallback }

══════════════════════════════════════════════════════════════════════════
OUTPUT - Return ONLY valid JSON:
══════════════════════════════════════════════════════════════════════════

{"title": "Name", "description": "Brief description", "code": "complete ES module"}

══════════════════════════════════════════════════════════════════════════
USER REQUEST: ${userText.trim()}
══════════════════════════════════════════════════════════════════════════

Create a BREATHTAKING 3D masterpiece with beautiful materials, atmospheric particles, and smooth animations. Make it look like it belongs in a AAA game or Pixar film.`;
    };

    const parseLLMResponse = (raw) => {
      try {
        let t = raw.trim();
        t = t
          .replace(/^```(?:json|javascript|js)?/i, "")
          .replace(/```$/i, "")
          .trim();

        if (t.length > 100 && !t.endsWith("}") && !t.endsWith('"')) {
          const lastBraceIndex = t.lastIndexOf("}");
          if (lastBraceIndex > 0) t = t.substring(0, lastBraceIndex + 1);
        }

        if (!t.startsWith("{")) {
          return { title: "Generated Object", description: "", code: t };
        }

        const obj = JSON.parse(t);
        if (!obj || typeof obj.code !== "string")
          throw new Error("Missing 'code'");
        if (obj.code.length < 100) throw new Error("Code too short");

        const openBraces = (obj.code.match(/{/g) || []).length;
        const closeBraces = (obj.code.match(/}/g) || []).length;
        if (Math.abs(openBraces - closeBraces) > 0)
          throw new Error(`Incomplete code`);

        return obj;
      } catch (e) {
        throw new Error(`Parse error: ${e.message}`);
      }
    };

    function normalizeLLMCode(code) {
      let out = String(code);

      //
      // STEP 1 — Strip backticks and imports
      //
      out = out.replace(/`/g, "");
      out = out.replace(/import\s+[^;]+;/g, "");

      //
      // STEP 2 — Remove ALL existing exports to avoid duplicates
      //
      out = out.replace(
        /export\s+default\s+async\s+function\s+generate[^{]*\{/g,
        ""
      );
      out = out.replace(/export\s+default\s+function\s+generate[^{]*\{/g, "");
      out = out.replace(/export\s+default\s+async\s+function[^{]*\{/g, "");
      out = out.replace(/export\s+default\s+function[^{]*\{/g, "");
      out = out.replace(/export\s+default\s+/g, "");
      out = out.replace(/export\s+{[^}]+};?/g, "");

      //
      // STEP 3 — Remove top-level "return root" if it exists
      //
      out = out.replace(/return\s+root\s*;?/g, "");

      //
      // STEP 4 — Ensure THREE.* prefix for geometries
      //
      out = out.replace(
        /\bnew\s+(BoxGeometry|SphereGeometry|CylinderGeometry|ConeGeometry|TorusGeometry|PlaneGeometry|CircleGeometry)\b/g,
        (match) => "new THREE." + match.split("new ")[1]
      );

      //
      // STEP 5 — Promote MeshStandard → MeshPhysical with defaults
      //
      out = out.replace(
        /new THREE\.MeshStandardMaterial\s*\(\s*\{/g,
        "new THREE.MeshPhysicalMaterial({ metalness:0.35, roughness:0.45, clearcoat:0.25, clearcoatRoughness:0.12,"
      );

      //
      // STEP 6 — Remove any stray top-level statements that would break modules
      //
      // (Prevents "Unexpected token" when random text appears)
      //
      out = out.trim();

      //
      // STEP 7 — Wrap safely into ONE clean export block
      //
      return `
export default async function generate(params) {
  const THREE = params.THREE;
  const scene = params.scene;
  const root = new THREE.Group();
  root.name = "GeneratedObject";
  const physics = params.physics;
  const CANNON = params.CANNON;
  
  try {
${indent(out, 4)}

    scene.add(root);
    return root;
  } catch (err) {
    console.error("Generated object error:", err);
    scene.add(root);
    return root;
  }
}
  `;
    }

    function indent(text, spaces = 2) {
      const pad = " ".repeat(spaces);
      return text
        .split("\n")
        .map((line) => (line.trim() ? pad + line : line))
        .join("\n");
    }

    const onSubmit = async () => {
      if (!form.prompt.trim()) return;

      isLoading.value = true;
      lastStatus.value = "🎨 Preparing...";

      const inferenceId = uuid();
      let inference = {
        id: inferenceId,
        prompt: form.prompt,
        timestamp: new Date().toLocaleTimeString(),
        success: false,
        title: "",
        notes: "",
        code: "",
      };

      try {
        lastStatus.value = "🔍 Checking model...";
        await loadModelForGeneration();

        const llmPrompt = buildObjectPrompt(form.prompt);
        lastStatus.value = "🤖 AI generating...";

        if (!window.electronAPI?.chat)
          throw new Error("Chat API not available");

        const llmPromise = window.electronAPI.chat(llmPrompt);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 600000)
        );

        const assistantResult = await Promise.race([
          llmPromise,
          timeoutPromise,
        ]);
        if (!assistantResult) throw new Error("Empty response");

        lastStatus.value = "📝 Processing...";

        const parsedResult = parseLLMResponse(String(assistantResult));
        const title = parsedResult.title || "Generated Object";
        const description = parsedResult.description || "";
        let code = parsedResult.code || "";

        if (!code || code.trim().length < 50) throw new Error("Code too short");

        // NEW: sanitize and enhance code
        code = normalizeLLMCode(code);

        console.log("Final Normalized Code:", code);

        lastStatus.value = "⚙️ Creating 3D object...";

        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        await viewer.applyModuleCode(code, "replace");

        lastStatus.value = "✅ Created: " + title;

        inference.success = true;
        inference.title = title;
        inference.notes = description;
        inference.code = code;

        objectInferences.value.push(inference);
        await saveInferences();
        form.prompt = "";
      } catch (e) {
        console.error("❌ Generation error:", e);
        lastStatus.value = "❌ Failed: " + e.message;
        inference.notes = e.message;
        objectInferences.value.push(inference);
        await saveInferences();
      } finally {
        isLoading.value = false;
      }
    };

    return {
      isLoading,
      threeViewer,
      lastStatus,
      showExamples,
      objectInferences,
      hasCopy,
      autoRotate,
      currentTime,
      currentWeather,
      lightIntensity,
      lightingPresets,
      weatherOptions,
      form,
      examplePrompts,
      setTimeOfDay,
      setWeather,
      setLightIntensity,
      toggleAutoRotate,
      copyPrompt,
      clearScene,
      handleSuccess,
      handleError,
      useExample,
      removeInference,
      applyInference,
      retryGeneration,
      onSubmit,
    };
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

.columns {
  position: relative !important;
}

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  left: 0;
  top: 0;
  background: url("src/assets/bonzai_3d.jpg") no-repeat center center;
  background-size: cover;
  filter: blur(6px);
  animation: move 40s ease infinite;
  overflow: hidden;
}

@keyframes move {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.viewer-container {
  position: relative;
  margin: 2em 0;
  border-radius: 8px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  aspect-ratio: 16 / 9;
  width: 100%;
}

.viewer-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.models__deployment {
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
}

.models__deployment-install {
  overflow-y: auto;
  padding: 6em;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
}

.models__activity--payouts {
  padding: 2em 3em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}

h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: #fff;
  text-align: right;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

p {
  margin-bottom: 1em;
  font-size: 24px;
  color: #fff;
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
}

.generation {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1001;
  opacity: 0.95;
  backdrop-filter: blur(32px);
}

.notification {
  opacity: 0.8;
}

/* ═══════════════════════════════════════════════════════════════ */
/* ENVIRONMENT CONTROLS */
/* ═══════════════════════════════════════════════════════════════ */
.environment-controls {
  padding: 1.5em 2em !important;
}

.control-label {
  display: flex;
  align-items: center;
  color: #fff;
  font-size: 16px;
  margin-bottom: 0.75em;
}

.control-label .material-symbols-outlined {
  font-size: 22px;
  color: rgba(97, 55, 142, 1);
}

.time-buttons,
.weather-buttons {
  display: flex;
  gap: 0.5em;
  flex-wrap: wrap;
}

.time-btn,
.weather-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.6em 1em;
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #fff;
}

.time-btn:hover,
.weather-btn:hover {
  background: rgba(97, 55, 142, 0.4);
  border-color: rgba(97, 55, 142, 0.6);
  transform: translateY(-2px);
}

.time-btn.active,
.weather-btn.active {
  background: rgba(97, 55, 142, 0.6);
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 12px rgba(97, 55, 142, 0.5);
}

.time-icon,
.weather-icon {
  font-size: 1.6em;
}

.time-label,
.weather-label {
  font-size: 0.75em;
  font-family: "Fira Sans", sans-serif;
  font-weight: 500;
  margin-top: 0.25em;
}

.light-slider {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.4);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.light-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #9966ff, #66ccff);
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease;
}

.light-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.light-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #9966ff, #66ccff);
  cursor: pointer;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* ═══════════════════════════════════════════════════════════════ */
/* EXAMPLES & HISTORY */
/* ═══════════════════════════════════════════════════════════════ */
.examples-panel {
  margin-bottom: 2em;
  padding: 1.5em;
}

.example-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5em;
  margin-top: 1em;
}

.example-card {
  padding: 1.5em;
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.example-card:hover {
  background: rgba(97, 55, 142, 0.4);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(97, 55, 142, 0.4);
}

.example-icon {
  font-size: 3em;
  margin-bottom: 0.5em;
  text-align: center;
}

.example-title {
  color: #fff;
  font-weight: bold;
  font-size: 18px;
  margin-bottom: 0.5em;
  font-family: "Fira Sans", sans-serif;
}

.example-desc {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin-bottom: 0.5em;
}

div.question {
  border: 8px solid rgba(255, 255, 255, 1);
  padding: 2em 3em 6em;
  margin-top: 2em !important;
  margin-bottom: 1em !important;
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  border-radius: 4px;
  backdrop-filter: blur(32px);
  background: rgba(0, 0, 0, 0.66);
}

.history-header {
  display: flex;
  align-items: center;
  gap: 0.75em;
  font-size: 18px;
  color: #fff;
  flex-wrap: wrap;
}

.history-icon {
  font-size: 24px;
}

.history-badge {
  padding: 3px 24px 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  font-size: 22px;
  font-weight: 600;
  text-transform: uppercase;
}

.history-meta {
  margin-left: auto;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

.history-prompt {
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  font-weight: 400;
  margin: 0.75em 0;
  line-height: 1.6;
}

.error-note {
  color: #ff6b6b;
  font-size: 14px;
  display: flex;
  align-items: center;
  margin-top: 0.75em;
  padding: 0.5em;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 6px;
}

form {
  position: relative;
}

hr {
  margin: 12px 0;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.015);
}

.input {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  transition: 200ms ease-in;
}

::placeholder {
  color: rgba(255, 255, 255, 0.1) !important;
  opacity: 1 !important;
}

.button.chat.is-loading {
  position: absolute;
  width: 32px;
  height: 32px;
  right: 10px;
  bottom: 14px;
  border: none !important;
  box-shadow: none !important;
}

ul,
ol {
  padding: 0;
  list-style-type: none;
}

ol.chat {
  display: flex;
  flex-direction: column-reverse;
}

.button.copy {
  transition: all 0.15s ease;
}

.button.copy:hover {
  transform: scale(1.05);
}

.three-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;

  /* Force minimum usable dimensions */
  min-width: 300px;
  min-height: 300px;
}
</style>
