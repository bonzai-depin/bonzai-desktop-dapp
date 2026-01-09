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
                    class="material-symbols-outlined is-size-1 mr-2"
                    style="font-size: 92px !important"
                  >
                    3d_rotation
                  </span>
                  Generative 3D
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button
                  class="button is-medium is-info mr-5"
                  @click="showExamples = !showExamples"
                  title="View examples"
                >
                  <span class="material-symbols-outlined mr-1 is-size-3">
                    {{ showExamples ? "visibility_off" : "lightbulb" }}
                  </span>
                  {{ showExamples ? "Hide" : "Examples" }}
                </button>
                <button
                  class="button is-medium is-warning"
                  :disabled="isLoading"
                  @click="clearScene"
                  title="Clear scene"
                >
                  <span class="material-symbols-outlined mr-1 is-size-3">
                    delete_sweep
                  </span>
                  Clear
                </button>
                <!-- <button
                  class="button is-medium is-success"
                  @click="toggleAutoRotate"
                  title="Toggle rotation"
                >
                  <span class="material-symbols-outlined mr-1">
                    {{ autoRotate ? "pause_circle" : "play_circle" }}
                  </span>
                  {{ autoRotate ? "Stop" : "Rotate" }}
                </button> -->
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
              <div class="column is-5">
                <label class="control-label fira-sans-condensed-black-italic">
                  Lighting
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
                    <span class="time-icon">
                      <span class="material-symbols-outlined is-size-3">
                        {{ preset.class }}
                      </span>
                    </span>
                    <span class="time-label">{{ preset.label }}</span>
                  </button>
                </div>
              </div>
              <div class="column is-7">
                <label class="control-label fira-sans-condensed-black-italic">
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
                    <span class="weather-icon">
                      <span class="material-symbols-outlined is-size-3">
                        {{ weather.class }}
                      </span>
                    </span>
                    <span class="weather-label">{{ weather.label }}</span>
                  </button>
                </div>
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
                <!-- ACCESS REQUIREMENTS -->
                <AccessRequirements
                  ref="accessRef"
                  level="LVL5"
                  :demo-prompt="DEMO_PROMPT"
                  :is-generating="isLoading"
                  @access-changed="onAccessChanged"
                  @demo-generate="onDemoGenerate"
                />

                <form ref="promptForm" @submit.prevent="onSubmit">
                  <textarea
                    id="prompt"
                    class="input is-large is-fullwidth"
                    placeholder="Describe a 3D object... (e.g., A mystical crystal orb with inner glow)"
                    v-model="form.prompt"
                    :disabled="isLoading || !hasAccess"
                    @keydown.enter.exact.prevent="canSubmitWithAccess && onSubmit()"
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
              <li v-for="(item, index) in objectInferences" :key="item.id">
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
import { ref, reactive, computed, onMounted, nextTick } from "vue";
import ThreeViewer from "./ThreeViewer.vue";
import AccessRequirements from "./AccessRequirements.vue";
import useClipboard from "vue-clipboard3";

const DEMO_PROMPT = "A glowing crystal on a stone pedestal";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (defined outside setup for cleanliness)
// ═══════════════════════════════════════════════════════════════════════════

function indent(text, spaces = 4) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

function normalizeLLMCode(code) {
  let out = String(code);

  // STEP 1: Remove markdown and JSON wrappers
  out = out.replace(/^```(?:javascript|js|typescript|ts)?[\r\n]*/gi, "");
  out = out.replace(/[\r\n]*```\s*$/gi, "");
  out = out.trim();

  if (out.startsWith("{") && out.includes('"code"')) {
    try {
      const codeMatch = out.match(/"code"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);
      if (codeMatch) {
        out = codeMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\t/g, "\t")
          .replace(/\\\\/g, "\\")
          .trim();
      }
    } catch (e) {}
  }

  // STEP 2: Remove LLM preamble
  out = out.replace(
    /^(Here'?s?|This is|Below is|The following)[^:]*:\s*/gi,
    ""
  );
  out = out.replace(/^(I'll|Let me|I will|I've)[^.]*\.\s*/gi, "");
  out = out.replace(/^(Sure|Of course|Certainly)[^.]*\.\s*/gi, "");
  out = out.replace(
    /\n\s*(This code|The above|This creates|Note:|Explanation:)[\s\S]*$/gi,
    ""
  );

  // STEP 3: Remove module syntax (the LLM sometimes adds these)
  out = out.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*/g, "");
  out = out.replace(
    /export\s+default\s+async\s+function\s*\w*\s*\([^)]*\)\s*\{/g,
    ""
  );
  out = out.replace(/export\s+default\s+function\s*\w*\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/async\s+function\s+generate\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/function\s+generate\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/export\s+default\s+/g, "");
  out = out.replace(/return\s+root\s*;?\s*$/gm, "");

  // Remove duplicate declarations (we add these in the wrapper)
  out = out.replace(/const\s+THREE\s*=\s*params\.THREE\s*;?\s*/g, "");
  out = out.replace(/const\s+scene\s*=\s*params\.scene\s*;?\s*/g, "");
  out = out.replace(/const\s+root\s*=\s*new\s+THREE\.Group\(\)\s*;?\s*/g, "");
  out = out.replace(/root\.name\s*=\s*['"][^'"]*['"]\s*;?\s*/g, "");
  out = out.replace(/const\s+helpers\s*=\s*params\.helpers\s*;?\s*/g, "");
  out = out.replace(/const\s+H\s*=\s*(helpers|params\.helpers)\s*;?\s*/g, "");
  out = out.replace(
    /const\s+addUpdateCallback\s*=\s*params\.addUpdateCallback\s*;?\s*/g,
    ""
  );
  out = out.replace(
    /const\s+setObjectInfo\s*=\s*params\.setObjectInfo\s*;?\s*/g,
    ""
  );
  out = out.replace(/const\s+physics\s*=\s*params\.physics\s*;?\s*/g, "");
  out = out.replace(/const\s+CANNON\s*=\s*params\.CANNON\s*;?\s*/g, "");

  // STEP 4: Fix THREE.* prefixes
  const threeClasses = [
    "BoxGeometry",
    "SphereGeometry",
    "CylinderGeometry",
    "ConeGeometry",
    "TorusGeometry",
    "PlaneGeometry",
    "CircleGeometry",
    "RingGeometry",
    "OctahedronGeometry",
    "IcosahedronGeometry",
    "TorusKnotGeometry",
    "TubeGeometry",
    "ExtrudeGeometry",
    "LatheGeometry",
    "ShapeGeometry",
    "BufferGeometry",
    "EdgesGeometry",
    "MeshPhysicalMaterial",
    "MeshStandardMaterial",
    "MeshBasicMaterial",
    "MeshLambertMaterial",
    "MeshPhongMaterial",
    "MeshToonMaterial",
    "PointsMaterial",
    "ShaderMaterial",
    "SpriteMaterial",
    "LineBasicMaterial",
    "PointLight",
    "DirectionalLight",
    "AmbientLight",
    "SpotLight",
    "HemisphereLight",
    "Group",
    "Mesh",
    "Points",
    "Sprite",
    "Object3D",
    "Line",
    "LineSegments",
    "Vector2",
    "Vector3",
    "Vector4",
    "Color",
    "Quaternion",
    "Euler",
    "Matrix4",
    "Box3",
    "Float32BufferAttribute",
    "BufferAttribute",
    "CanvasTexture",
    "TextureLoader",
    "Shape",
    "Path",
    "CatmullRomCurve3",
  ];

  threeClasses.forEach((cls) => {
    out = out.replace(
      new RegExp(`\\bnew\\s+(?!THREE\\.)${cls}\\b`, "g"),
      `new THREE.${cls}`
    );
  });

  // STEP 5: Fix common mistakes
  out = out.replace(/scene\.add\s*\(\s*(?!root)(\w+)\s*\)/g, "root.add($1)");
  out = out.replace(/\bhelpers\./g, "H.");

  // STEP 6: Balance braces
  let openBraces = (out.match(/\{/g) || []).length;
  let closeBraces = (out.match(/\}/g) || []).length;
  while (closeBraces < openBraces) {
    out += "\n}";
    closeBraces++;
  }
  while (closeBraces > openBraces && out.trimEnd().endsWith("}")) {
    out = out.trimEnd().slice(0, -1);
    closeBraces--;
  }

  // STEP 7: Clean up
  out = out.trim();
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/^\s*try\s*\{\s*\n?/, "");
  out = out.replace(/\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?\}\s*$/, "");

  // STEP 8: Wrap in module structure
  return `
export default async function generate(params) {
  const THREE = params.THREE;
  const scene = params.scene;
  const root = new THREE.Group();
  root.name = "GeneratedObject";
  const physics = params.physics;
  const CANNON = params.CANNON;
  const addUpdateCallback = params.addUpdateCallback;
  const setObjectInfo = params.setObjectInfo;
  const helpers = params.helpers;
  const H = helpers;

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

function createMockTHREE() {
  const mockMesh = {
    position: { set: () => {}, x: 0, y: 0, z: 0 },
    rotation: { set: () => {}, x: 0, y: 0, z: 0 },
    scale: { set: () => {}, x: 1, y: 1, z: 1 },
    add: () => {},
    castShadow: false,
    receiveShadow: false,
    material: {},
    geometry: { attributes: { position: { array: [], needsUpdate: false } } },
    userData: {},
    name: "",
  };

  return new Proxy(
    {},
    {
      get: (target, prop) => {
        if (
          ["Group", "Mesh", "Points", "Object3D", "Line", "Sprite"].includes(
            prop
          )
        ) {
          return function () {
            return {
              ...mockMesh,
              isObject3D: true,
              children: [],
              add(child) {
                this.children.push(child);
              },
            };
          };
        }
        if (prop.endsWith("Geometry")) {
          return function () {
            return { dispose: () => {}, attributes: {} };
          };
        }
        if (prop.endsWith("Material")) {
          return function () {
            return { dispose: () => {}, needsUpdate: false };
          };
        }
        if (prop === "Color") {
          return function () {
            return { set: () => this, r: 0, g: 0, b: 0 };
          };
        }
        if (prop === "Vector3" || prop === "Vector2") {
          return function (x = 0, y = 0, z = 0) {
            return {
              x,
              y,
              z,
              set: () => this,
              copy: () => this,
              clone: () => this,
            };
          };
        }
        if (
          [
            "PointLight",
            "SpotLight",
            "DirectionalLight",
            "AmbientLight",
          ].includes(prop)
        ) {
          return function () {
            return { ...mockMesh, intensity: 1, color: {} };
          };
        }
        // Constants
        if (["DoubleSide", "FrontSide", "BackSide"].includes(prop)) return 0;
        if (["AdditiveBlending", "NormalBlending"].includes(prop)) return 1;
        if (["RepeatWrapping", "ClampToEdgeWrapping"].includes(prop))
          return 1000;
        // Default mock constructor
        return function () {
          return { ...mockMesh };
        };
      },
    }
  );
}

const createMockHelpers = () => {
  const mockObject = {
    position: { set: () => {}, copy: () => {} },
    rotation: { set: () => {}, copy: () => {} },
    scale: { set: () => {}, copy: () => {} },
    add: () => {},
    clone: () => mockObject,
    traverse: (fn) => fn(mockObject),
    geometry: {
      attributes: {
        position: {
          array: new Float32Array(300),
          needsUpdate: false,
          getX: () => 0,
          getY: () => 0,
          getZ: () => 0,
          setXYZ: () => {},
        },
      },
    },
    material: {},
    userData: {},
    isObject3D: true,
  };

  // ONLY helpers that ACTUALLY exist in ThreeViewer.createHelpers()
  const actualHelpers = [
    // Materials
    "glass",
    "gem",
    "metal",
    "matte",
    "glow",
    "liquid",
    "fire",
    "ice",
    "lava",
    "leather",
    "velvet",
    "lowPoly",
    "toon",
    "cartoon",
    // Lights
    "light",
    "spot",
    // Particles
    "particles",
    "sparks",
    "bubbles",
    "smoke",
    "dust",
    // Basic
    "mesh",
    // RPG Items
    "crystal",
    "gemstone",
    "coin",
    "heart",
    "star",
    "key",
    "potionBottle",
    "sword",
    "axe",
    "shield",
    "book",
    "scroll",
    "chest",
    "crown",
    "ring",
    "chain",
    "rope",
    "plank",
    "flame",
    // Liquids
    "liquidVolume",
    "liquidSphere",
    // Physics
    "addPhysics",
    "makeDraggable",
  ];

  const helpers = {};
  for (const name of actualHelpers) {
    helpers[name] = () => mockObject;
  }

  return helpers;
};

export default {
  name: "Generative3D",
  components: { ThreeViewer, AccessRequirements },
  setup() {
    // ═══════════════════════════════════════════════════════════════════════
    // REACTIVE STATE
    // ═══════════════════════════════════════════════════════════════════════
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
    const isModelLoaded = ref(false);
    const form = reactive({ prompt: "" });

    const MAX_RETRY_ATTEMPTS = 3;

    // ═══════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════════════════
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (val) => {
      hasAccess.value = val;
    };
    const onDemoGenerate = (demoPrompt) => {
      form.prompt = demoPrompt;
      onSubmit(true); // true = isDemo
    };

    const canSubmitWithAccess = computed(() => {
      return form.prompt.trim() && !isLoading.value && hasAccess.value;
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STATIC DATA
    // ═══════════════════════════════════════════════════════════════════════
    const lightingPresets = ref([
      { id: "sunrise", label: "Sunrise", icon: "🌅", class: "wb_twilight" },
      { id: "day", label: "Day", icon: "☀️", class: "wb_sunny" },
      { id: "afternoon", label: "Afternoon", icon: "🌤️", class: "wb_sunny" },
      { id: "sunset", label: "Sunset", icon: "🌇", class: "wb_twilight" },
      { id: "night", label: "Night", icon: "🌙", class: "moon_stars" },
    ]);

    const weatherOptions = ref([
      { id: "sunny", label: "Clear", icon: "☀️", class: "wb_sunny" },
      { id: "cloudy", label: "Clouds", icon: "☁️", class: "cloud" },
      { id: "rainy", label: "Rain", icon: "🌧️", class: "rainy" },
      { id: "stormy", label: "Storm", icon: "🌧️", class: "rainy" },
      { id: "snowy", label: "Snow", icon: "❄️", class: "weather_snowy" },
      { id: "blizzard", label: "Blizzard", icon: "❄️", class: "weather_snowy" },
      { id: "foggy", label: "Fog", icon: "🌫️", class: "foggy" },
    ]);

    const currentModel = ref({
      modelname: "Qwen 2.5 Coder 14B",
      modeldesc:
        "14B-parameter Qwen 2.5 Coder instruction-tuned model with 128K context. State-of-the-art code generation and reasoning. Best for: serious development work, complex refactoring, and code agents requiring stronger understanding.",
      url: "https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/qwen2.5-coder-14b-instruct-q4_k_m.gguf",
      filename: "qwen2.5-coder-14b-instruct-q4_k_m.gguf",
      filesize: "8.93 GB",
      parameters: 14000000000,
      context: 131072,
    });

    const examplePrompts = ref([
      {
        icon: "🏴‍☠️",
        title: "Treasure Chest",
        description: "Open chest with gold and gems",
        prompt:
          "Open wooden treasure chest with gold coins and colorful gems inside. Gold trim bands, curved lid, sparkle particles rising.",
      },
      {
        icon: "⚔️",
        title: "Magic Sword",
        description: "Glowing enchanted blade",
        prompt:
          "Floating sword with silver blade, gold crossguard, brown leather handle. Blue magical glow and spiral particles.",
      },
      {
        icon: "🧪",
        title: "Health Potion",
        description: "Red healing elixir",
        prompt:
          "Round glass potion bottle with glowing red liquid inside, cork stopper, bubbles floating up.",
      },
      {
        icon: "💎",
        title: "Crystal Cluster",
        description: "Purple crystals on rock",
        prompt:
          "Cluster of purple crystals growing from a dark stone base. Inner glow and floating dust particles.",
      },
      {
        icon: "🛡️",
        title: "Knight Shield",
        description: "Medieval battle shield",
        prompt:
          "Medieval heater shield with red face, black border, gold boss in center, gold studs around edge.",
      },
      {
        icon: "👑",
        title: "Royal Crown",
        description: "Golden jeweled crown",
        prompt:
          "Golden crown with 6 points, each topped with a colored gemstone. On a purple velvet cushion.",
      },
      {
        icon: "🔑",
        title: "Skeleton Key",
        description: "Ornate golden key",
        prompt:
          "Golden skeleton key with circular handle, long shaft, teeth at bottom. Floating with magical sparkles.",
      },
      {
        icon: "📖",
        title: "Spell Book",
        description: "Open magical tome",
        prompt:
          "Open leather-bound spell book with glowing pages. Purple particles rising from the text.",
      },
      {
        icon: "🪙",
        title: "Coin Stack",
        description: "Pile of gold coins",
        prompt:
          "Stack of gold coins in a small pile, some scattered. Golden sparkle particles.",
      },
      {
        icon: "🔮",
        title: "Crystal Ball",
        description: "Fortune teller orb",
        prompt:
          "Glass crystal ball on bronze claw stand. Purple mist swirling inside, ethereal glow.",
      },
      {
        icon: "⚗️",
        title: "Alchemy Flask",
        description: "Bubbling potion flask",
        prompt:
          "Triangular flask with bubbling green liquid, cork top, rising steam particles.",
      },
      {
        icon: "🐉",
        title: "Dragon Egg",
        description: "Glowing scaled egg",
        prompt:
          "Large dragon egg with iridescent scales sitting in a nest of glowing embers. Orange inner glow.",
      },
    ]);

    // ═══════════════════════════════════════════════════════════════════════
    // PROMPT BUILDERS
    // ═══════════════════════════════════════════════════════════════════════
    const buildObjectPrompt = (userText) => {
      return `You are an expert Three.js developer. Generate a 3D object for:

"${userText}"

════════════════════════════════════════════════════════════════════
🚨 CRITICAL RULES — VIOLATIONS WILL BREAK THE CODE
════════════════════════════════════════════════════════════════════

1. OUTPUT RAW JAVASCRIPT ONLY — No markdown, no \`\`\`, no JSON, no explanations
2. ALL objects must have y > 0 (above ground plane)
3. ALL objects must be added to \`root\` (not scene)
4. ALWAYS capture helper returns: const sword = H.sword({...});
5. Helper parameters are COLORS (hex numbers), not materials

WRONG:  H.sword({...});  sword.position.set(0,1,0);  // Missing assignment!
RIGHT:  const sword = H.sword({...}); sword.position.set(0,1,0); root.add(sword);


════════════════════════════════════════════════════════════════════
AVAILABLE CONTEXT
════════════════════════════════════════════════════════════════════

THREE        — Full Three.js library (use for custom geometry/materials)
root         — THREE.Group to add all objects to
H / helpers  — Convenience helpers (see below)
addUpdateCallback(fn) — Register animation: fn({deltaTime, time})

════════════════════════════════════════════════════════════════════
APPROACH 1: USE HELPERS (Recommended for RPG/game items)
════════════════════════════════════════════════════════════════════

MATERIALS — Pass to H.mesh() or use directly
  H.metal(color, {roughness, glow, clearcoat})
  H.glass(color, {roughness, transmission, ior})
  H.gem(color, {glow, ior})
  H.matte(color, {roughness})
  H.glow(color, {intensity, opacity})
  H.liquid(color, {transmission, thickness, glow})
  H.fire({color, intensity, opacity})
  H.ice(color)
  H.lava({color, intensity})
  H.leather(color)
  H.velvet(color)
  H.lowPoly(color)  // Flat shading, stylized
  H.toon(color)
  H.cartoon(color)

LIGHTS
  H.light(color, intensity, distance) → PointLight
  H.spot(color, intensity, {angle, penumbra, distance}) → SpotLight

PARTICLES (auto-animated)
  H.particles(count, {color, size, spread, baseY, heightRange})
  H.sparks(count, {color, spread, baseY, maxY})
  H.bubbles(count, {color, spread, baseY, height})
  H.smoke(count, {color, spread})
  H.dust(count, {color, spread, size, opacity})

RPG ITEMS — All return THREE.Group or Mesh
  H.crystal({color, height, radius, glow, lowPoly})
  H.gemstone({color, size, shape, lowPoly})  // shape: "round" or "octahedron"
  H.coin({color, radius, thickness, lowPoly})
  H.heart({color, size, depth, lowPoly})
  H.star({color, points, outer, inner, depth, lowPoly})
  H.key({color, lowPoly})
  H.potionBottle({shape, liquidColor, glassColor, glow, lowPoly})  // shape: round/flask/vial/diamond
  H.sword({bladeColor, handleColor, guardColor, bladeLength, lowPoly})
  H.axe({bladeColor, handleColor, lowPoly})
  H.shield({shape, faceColor, trimColor, frameColor, studs, lowPoly})  // shape: heater/round/kite
  H.book({open, coverColor, trimColor, lowPoly})
  H.scroll({color, lowPoly})
  H.chest({open, width, height, depth, woodColor, metalColor, lowPoly})
  H.crown({color, gemColor, points, lowPoly})
  H.ring(radius, tube, material)
  H.chain(length, linkSize, material)
  H.rope(pointsArray, radius, material)
  H.plank(width, height, depth, material)
  H.flame({height, radius})  // Animated fire

LIQUIDS
  H.liquidVolume({width, height, depth, color, waveSpeed, waveHeight, glow})
  H.liquidSphere({radius, color, scaleY, glow})

PHYSICS
  H.addPhysics(mesh, {mass, shape, friction, restitution})  // shape: box/sphere/cylinder
  H.makeDraggable(group)

UTILITY
  H.mesh(geometry, material) — Creates mesh with shadows enabled

════════════════════════════════════════════════════════════════════
APPROACH 2: RAW THREE.JS (For custom/complex objects)
════════════════════════════════════════════════════════════════════

You can use any Three.js class directly:

// Custom geometry
const geo = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshPhysicalMaterial({
  color: 0xff0000,
  metalness: 0.5,
  roughness: 0.3,
  clearcoat: 0.8
});
const mesh = new THREE.Mesh(geo, mat);
mesh.position.y = 0.5;
mesh.castShadow = true;
root.add(mesh);

// Custom shapes with ExtrudeGeometry
const shape = new THREE.Shape();
shape.moveTo(0, 0);
shape.lineTo(1, 0);
shape.lineTo(0.5, 1);
shape.closePath();
const extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true });

// Curves
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(1, 1, 0),
  new THREE.Vector3(2, 0, 0)
]);
const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.1, 8);

// Animation
addUpdateCallback(({deltaTime, time}) => {
  mesh.rotation.y += deltaTime;
  mesh.position.y = 0.5 + Math.sin(time * 2) * 0.1;
});

════════════════════════════════════════════════════════════════════
COMPLETE EXAMPLES
════════════════════════════════════════════════════════════════════

EXAMPLE A — Magic Sword (using helpers)
─────────────────────────────────────────
const sword = H.sword({
  bladeColor: 0xccccff,
  handleColor: 0x4a3728,
  guardColor: 0xffd700,
  bladeLength: 1.0,
  lowPoly: false
});
sword.position.set(0, 0.8, 0);
sword.rotation.z = -0.3;
root.add(sword);

const glow = H.light(0x6688ff, 2, 3);
glow.position.set(0, 1.2, 0);
root.add(glow);

const fx = H.sparks(30, { color: 0x88ccff, spread: 0.3, baseY: 0.5, maxY: 1.5 });
root.add(fx);

EXAMPLE B — Crystal Cluster (hybrid approach)
─────────────────────────────────────────
const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.6, 0.8, 0.2, 8),
  H.matte(0x333344)
);
base.position.y = 0.1;
root.add(base);

for (let i = 0; i < 7; i++) {
  const crystal = H.crystal({
    color: [0x9966ff, 0xff66aa, 0x66ffff][i % 3],
    height: 0.4 + Math.random() * 0.5,
    radius: 0.08 + Math.random() * 0.1,
    glow: 0.4
  });
  const angle = (i / 7) * Math.PI * 2;
  const r = 0.2 + Math.random() * 0.25;
  crystal.position.set(Math.cos(angle) * r, 0.2, Math.sin(angle) * r);
  crystal.rotation.set(Math.random() * 0.3, 0, Math.random() * 0.3);
  root.add(crystal);
}

root.add(H.dust(50, { color: 0xccbbff, spread: 1.2 }));
root.add(H.light(0x9966ff, 1.5, 4));

EXAMPLE C — Animated Treasure (raw Three.js + animation)
─────────────────────────────────────────
const chest = H.chest({ open: true, woodColor: 0x6b4423, metalColor: 0xffd700 });
chest.position.y = 0.3;
root.add(chest);

// Floating coins using raw Three.js
const coins = [];
const coinGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
const coinMat = H.metal(0xffd700, { roughness: 0.2 });

for (let i = 0; i < 8; i++) {
  const coin = new THREE.Mesh(coinGeo, coinMat);
  coin.rotation.x = Math.PI / 2;
  coin.userData.phase = i * 0.8;
  coin.userData.baseY = 0.6 + Math.random() * 0.3;
  coins.push(coin);
  root.add(coin);
}

addUpdateCallback(({time}) => {
  coins.forEach((coin, i) => {
    const angle = time * 0.5 + coin.userData.phase;
    coin.position.x = Math.cos(angle) * 0.3;
    coin.position.z = Math.sin(angle) * 0.3;
    coin.position.y = coin.userData.baseY + Math.sin(time * 2 + i) * 0.1;
    coin.rotation.z = time * 2;
  });
});

root.add(H.sparks(40, { color: 0xffdd66, spread: 0.5, baseY: 0.4, maxY: 1.2 }));

════════════════════════════════════════════════════════════════════
NOW GENERATE CODE FOR: "${userText}"
════════════════════════════════════════════════════════════════════
Output raw JavaScript code only. No markdown. No explanation.`;
    };

    const buildErrorFixPrompt = (brokenCode, error, originalDescription) => {
      return `Fix this Three.js code error.

ORIGINAL REQUEST: "${originalDescription}"

ERROR: ${error}

BROKEN CODE:
${brokenCode}

COMMON FIXES:
- "X is not defined" after "const Y = H.something()" → Change X to Y everywhere
- Syntax errors → Fix the syntax

OUTPUT ONLY THE FIXED JAVASCRIPT CODE. No markdown, no explanation.`;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LLM & VALIDATION
    // ═══════════════════════════════════════════════════════════════════════
    const callLLM = async (prompt) => {
      if (!window.electronAPI?.chat) {
        throw new Error("Chat API not available");
      }
      const response = await Promise.race([
        window.electronAPI.chat(prompt),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 360000)
        ),
      ]);
      if (!response) throw new Error("Empty response from LLM");
      return String(response);
    };

    const validateCode = async (code) => {
      // Try to import as ES module and execute with mocks
      const blob = new Blob([code], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);

      try {
        const mod = await import(/* @vite-ignore */ url);
        URL.revokeObjectURL(url);

        const generate = mod?.default;
        if (typeof generate !== "function") {
          return "Module must export a default function";
        }

        // Test execution with mocks
        const mockParams = {
          THREE: createMockTHREE(),
          scene: { add: () => {} },
          physics: { world: null },
          CANNON: {},
          addUpdateCallback: () => {},
          setObjectInfo: () => {},
          helpers: createMockHelpers(),
        };

        await generate(mockParams);
        return null; // Success!
      } catch (e) {
        URL.revokeObjectURL(url);
        return `Error: ${e.message}`;
      }
    };

    const generateWithRetry = async (
      initialPrompt,
      userDescription,
      maxAttempts
    ) => {
      let rawCode = null;
      let normalizedCode = null;
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (attempt === 1) {
            lastStatus.value = `Generating...`;
            rawCode = await callLLM(initialPrompt);
          } else {
            lastStatus.value = `Healing...`;
            const fixPrompt = buildErrorFixPrompt(
              rawCode,
              lastError,
              userDescription
            );
            rawCode = await callLLM(fixPrompt);
          }

          normalizedCode = normalizeLLMCode(rawCode);
          console.log(
            `Attempt ${attempt} - Normalized code:`,
            normalizedCode.substring(0, 500)
          );

          lastStatus.value = `Validating...`;
          const validationError = await validateCode(normalizedCode);

          if (!validationError) {
            console.log(`✅ Code valid on attempt ${attempt}`);
            return normalizedCode;
          }

          lastError = validationError;
          console.warn(`Attempt ${attempt} failed:`, validationError);
        } catch (e) {
          lastError = e.message;
          console.error(`Attempt ${attempt} error:`, e);
        }
      }

      console.error(
        `All ${maxAttempts} attempts failed. Last error:`,
        lastError
      );
      return normalizedCode; // Return last attempt anyway
    };

    // ═══════════════════════════════════════════════════════════════════════
    // UI ACTIONS
    // ═══════════════════════════════════════════════════════════════════════
    const setTimeOfDay = (time) => {
      currentTime.value = time;
      threeViewer.value?.setTimeOfDay(time);
    };

    const setWeather = (weather) => {
      currentWeather.value = weather;
      threeViewer.value?.setWeather(weather);
    };

    const setLightIntensity = (intensity) => {
      lightIntensity.value = intensity;
      threeViewer.value?.setLightIntensity(intensity);
    };

    const toggleAutoRotate = () => {
      autoRotate.value = !autoRotate.value;
      threeViewer.value?.setAutoRotate(autoRotate.value);
    };

    const clearScene = () => {
      threeViewer.value?.clear();
    };

    const useExample = (example) => {
      form.prompt = example.prompt;
      showExamples.value = false;
    };

    const { toClipboard } = useClipboard();

    const copyPrompt = async (text, index) => {
      try {
        form.prompt = text;
        await toClipboard(text);
        hasCopy[index] = true;
        setTimeout(() => (hasCopy[index] = false), 2000);
        document
          .querySelector("#prompt")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (e) {
        console.error("Copy failed:", e);
      }
    };

    const handleSuccess = (data) => console.log("Generation success:", data);
    const handleError = (data) => console.error("Generation error:", data);

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

    // ═══════════════════════════════════════════════════════════════════════
    // PERSISTENCE
    // ═══════════════════════════════════════════════════════════════════════
    const saveInferences = async () => {
      try {
        await window.electronAPI?.store?.set?.(
          "objectInferences",
          JSON.parse(JSON.stringify(objectInferences.value))
        );
      } catch (e) {}
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MODEL LOADING
    // ═══════════════════════════════════════════════════════════════════════
    const loadModelForGeneration = async () => {
      if (isModelLoaded.value) return;

      lastStatus.value = "Loading Model...";
      try {
        await window.electronAPI.loadModel({
          filename: currentModel.value.filename,
          parameters: currentModel.value.parameters,
          context: currentModel.value.context,
        });
        isModelLoaded.value = true;
        lastStatus.value = "Let's go!";
        await new Promise((r) => setTimeout(r, 500));
      } catch (error) {
        throw new Error(`Model loading failed: ${error.message}`);
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // DEFAULT OBJECT
    // ═══════════════════════════════════════════════════════════════════════
    const loadDefaultObject = async () => {
      const viewer = threeViewer.value;
      if (!viewer) return;

      const defaultCode = `export default async function generate(params) {
  const THREE = params.THREE;
  const scene = params.scene;
  const addUpdateCallback = params.addUpdateCallback;
  const setObjectInfo = params.setObjectInfo;
  const helpers = params.helpers;
  const root = new THREE.Group();
  root.name = "GeneratedChestUpgraded";

  setObjectInfo({ title: "Legendary Treasure Chest", description: "High-quality PBR treasure chest with coins, gems, jewelry, crown, chalice, and sparkles." });

  const chestWidth = 2.8, chestDepth = 1.7, chestHeight = 1.4, thick = 0.12;
  const innerMinX = -(chestWidth / 2 - thick * 1.1), innerMaxX = (chestWidth / 2 - thick * 1.1);
  const innerMinZ = -(chestDepth / 2 - thick * 1.1), innerMaxZ = (chestDepth / 2 - thick * 1.1);
  const baseY = thick + 0.03;

  // Wood texture
  const woodCanvas = document.createElement("canvas"); woodCanvas.width = 512; woodCanvas.height = 512;
  const wctx = woodCanvas.getContext("2d");
  wctx.fillStyle = "#3a2415"; wctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) { const y = Math.random() * 512; wctx.strokeStyle = "rgba(80,60,40," + (0.08 + Math.random() * 0.08) + ")"; wctx.lineWidth = 1 + Math.random() * 3; wctx.beginPath(); wctx.moveTo(0, y); wctx.lineTo(512, y + (Math.random() * 40 - 20)); wctx.stroke(); }
  const woodTex = new THREE.CanvasTexture(woodCanvas); woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  const woodMat = new THREE.MeshPhysicalMaterial({ map: woodTex, roughness: 0.55, metalness: 0.05, clearcoat: 0.3, color: 0x6e4429 });

  const goldTrimMat = helpers.metal(0xe8c35f, { roughness: 0.25, glow: 0.1 });
  const goldMatBright = helpers.metal(0xffe38a, { roughness: 0.15, glow: 0.35 });
  const metalMats = [goldTrimMat, goldMatBright];

  const gemColors = [0xff2e4d, 0x33ffb6, 0x3385ff, 0xdd55ff, 0xffffff, 0xffaa00];

  // Chest base
  const floor = helpers.mesh(new THREE.BoxGeometry(chestWidth, thick, chestDepth), woodMat); floor.position.set(0, thick / 2, 0); root.add(floor);
  const backWall = helpers.mesh(new THREE.BoxGeometry(chestWidth, chestHeight, thick), woodMat); backWall.position.set(0, chestHeight / 2, -chestDepth / 2 + thick / 2); root.add(backWall);
  const frontWall = helpers.mesh(new THREE.BoxGeometry(chestWidth, chestHeight, thick), woodMat); frontWall.position.set(0, chestHeight / 2, chestDepth / 2 - thick / 2); root.add(frontWall);
  const leftWall = helpers.mesh(new THREE.BoxGeometry(thick, chestHeight, chestDepth - thick * 2), woodMat); leftWall.position.set(-chestWidth / 2 + thick / 2, chestHeight / 2, 0); root.add(leftWall);
  const rightWall = leftWall.clone(); rightWall.position.x = chestWidth / 2 - thick / 2; root.add(rightWall);

  // Gold trim
  const trim = helpers.mesh(new THREE.BoxGeometry(chestWidth + 0.05, 0.08, 0.12), goldTrimMat); trim.position.set(0, chestHeight + 0.04, -chestDepth / 2 + 0.06); root.add(trim);

  // Coins
  const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.028, 24);
  for (let layer = 0; layer < 6; layer++) {
    for (let i = 0; i < 50 + layer * 15; i++) {
      const mat = metalMats[Math.floor(Math.random() * metalMats.length)];
      const c = helpers.mesh(coinGeo, mat);
      c.position.set(innerMinX + Math.random() * (innerMaxX - innerMinX), baseY + 0.03 + layer * 0.15 + Math.random() * 0.08, innerMinZ + Math.random() * (innerMaxZ - innerMinZ));
      c.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI);
      root.add(c);
    }
  }

  // Gems
  const gemGeos = [new THREE.OctahedronGeometry(0.12), new THREE.IcosahedronGeometry(0.13)];
  const allGems = [];
  for (let i = 0; i < 80; i++) {
    const gmat = helpers.gem(gemColors[i % gemColors.length]);
    const gem = helpers.mesh(gemGeos[i % 2], gmat);
    gem.position.set(innerMinX + Math.random() * (innerMaxX - innerMinX), baseY + 0.25 + Math.random() * 0.85, innerMinZ + Math.random() * (innerMaxZ - innerMinZ));
    gem.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    root.add(gem); allGems.push(gem);
  }

  // Rings
  for (let i = 0; i < 10; i++) {
    const ring = helpers.ring(0.14, 0.04, metalMats[i % 2]);
    ring.position.set(innerMinX + Math.random() * (innerMaxX - innerMinX), baseY + 0.35 + Math.random() * 0.75, innerMinZ + Math.random() * (innerMaxZ - innerMinZ));
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    root.add(ring);
  }

  // Crown
  const crown = new THREE.Group();
  const crownBase = helpers.mesh(new THREE.TorusGeometry(0.22, 0.055, 12, 36), goldMatBright); crownBase.rotation.x = Math.PI / 2; crown.add(crownBase);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const tip = helpers.mesh(new THREE.ConeGeometry(0.06, 0.17, 6), goldMatBright);
    tip.position.set(Math.cos(angle) * 0.22, 0.10, Math.sin(angle) * 0.22); tip.rotation.x = -Math.PI / 2; crown.add(tip);
    const tipGem = helpers.mesh(new THREE.SphereGeometry(0.035, 10, 10), helpers.gem(gemColors[i % gemColors.length]));
    tipGem.position.set(Math.cos(angle) * 0.22, 0.17, Math.sin(angle) * 0.22); crown.add(tipGem);
  }
  crown.position.set(0.65, baseY + 0.92, -0.22); crown.rotation.set(0.28, 0, -0.25); root.add(crown);

  // Chalice
  const chalice = new THREE.Group();
  chalice.add(helpers.mesh(new THREE.CylinderGeometry(0.15, 0.20, 0.07, 16), goldMatBright));
  const stem = helpers.mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.24, 12), goldMatBright); stem.position.y = 0.17; chalice.add(stem);
  const bowl = helpers.mesh(new THREE.CylinderGeometry(0.20, 0.12, 0.20, 24, 1, true), goldMatBright); bowl.position.y = 0.37; chalice.add(bowl);
  chalice.position.set(-0.62, baseY + 0.52, 0.12); chalice.rotation.z = 0.18; root.add(chalice);

  // Sparkles
  const sparkles = helpers.particles(70, { color: 0xffffcc, size: 0.055, spread: chestWidth * 0.45, baseY: baseY + 0.25, heightRange: 1.1 });
  root.add(sparkles);
  const sparkleSpeed = []; for (let i = 0; i < 70; i++) sparkleSpeed.push(0.25 + Math.random() * 0.45);

  // Lid
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, chestHeight + 0.08, -chestDepth / 2 + thick / 2);
  const lidGroup = new THREE.Group();
  const lidBase = helpers.mesh(new THREE.BoxGeometry(chestWidth, thick, chestDepth), woodMat); lidBase.position.set(0, 0, -chestDepth * 0.50); lidGroup.add(lidBase);
  const lidCurve = new THREE.CylinderGeometry(chestDepth / 2, chestDepth / 2, chestWidth, 32, 1, false, 0, Math.PI);
  const lidTop = helpers.mesh(lidCurve, woodMat); lidTop.rotation.z = Math.PI / 2; lidTop.rotation.x = Math.PI; lidTop.position.set(0, thick / 2, -chestDepth * 0.50); lidGroup.add(lidTop);
  const lidTrim = helpers.mesh(new THREE.BoxGeometry(chestWidth + 0.05, 0.08, chestDepth + 0.05), goldTrimMat); lidTrim.position.set(0, 0, -chestDepth * 0.50); lidGroup.add(lidTrim);
  lidPivot.add(lidGroup); lidPivot.rotation.x = 0.5; root.add(lidPivot);

  // Animation
  let t = 0;
  addUpdateCallback(function(ctx) {
    const dt = ctx.deltaTime; if (!dt) return; t += dt;
    const p = sparkles.geometry.attributes.position;
    for (let i = 0; i < 70; i++) {
      let y = p.getY(i), x = p.getX(i);
      y += sparkleSpeed[i] * dt * 0.25; x += Math.sin(t * 1.8 + i * 0.35) * dt * 0.28;
      if (y > baseY + 1.45) { y = baseY + 0.25; x = (Math.random() - 0.5) * (chestWidth * 0.9); }
      p.setXYZ(i, x, y, p.getZ(i));
    }
    p.needsUpdate = true;
    for (let g of allGems) { g.rotation.y += dt * 0.35; g.rotation.x += dt * 0.1; }
    goldMatBright.emissiveIntensity = 0.25 + Math.sin(t * 5) * 0.08;
  });

  scene.add(root);
  return root;
}`;

      try {
        await viewer.applyModuleCode(defaultCode, "replace");
      } catch (err) {
        console.error("Failed to load default object:", err);
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MAIN SUBMIT HANDLER
    // ═══════════════════════════════════════════════════════════════════════
    const onSubmit = async (isDemo = false) => {
      if (!form.prompt.trim()) return;
      // Allow demo generation even without access
      if (!isDemo && !canSubmitWithAccess.value) return;

      isLoading.value = true;
      lastStatus.value = "Preparing...";

      const inference = {
        id: uuid(),
        prompt: form.prompt,
        timestamp: new Date().toLocaleTimeString(),
        success: false,
        title: "",
        notes: "",
        code: "",
      };

      try {
        await loadModelForGeneration();

        const llmPrompt = buildObjectPrompt(form.prompt);
        const code = await generateWithRetry(
          llmPrompt,
          form.prompt,
          MAX_RETRY_ATTEMPTS
        );

        if (!code) throw new Error("Failed to generate valid code");

        lastStatus.value = "Crafting Object...";
        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        await viewer.applyModuleCode(code, "replace");

        lastStatus.value = "Crafted!";
        inference.success = true;
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

    // ═══════════════════════════════════════════════════════════════════════
    // LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════
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

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN
    // ═══════════════════════════════════════════════════════════════════════
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
      onSubmit,
      // Access control
      accessRef,
      hasAccess,
      canSubmitWithAccess,
      onAccessChanged,
      onDemoGenerate,
      DEMO_PROMPT,
    };
  },
};
</script>

<style scoped>
/* Fonts imported from App.vue for offline mode */
.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
  border-radius: 100%;
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
  padding: 4em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}
h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: #fff;
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
  width: 4.2em;
  font-size: 1.3em !important;
  font-weight: 400;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 9px 12px 9px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
}
.time-btn:hover,
.weather-btn:hover {
  color: rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.4);
  border-color: rgba(255, 255, 255, 1);
}
.time-btn.active,
.weather-btn.active {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
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
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
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
  min-width: 300px;
  min-height: 300px;
}
</style>
