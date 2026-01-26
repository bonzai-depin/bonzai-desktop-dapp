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

                <!-- MODE & STRATEGY SELECTORS (side by side) -->
                <div
                  class="environment-controls models__activity--payouts mb-4"
                >
                  <div class="columns is-multiline">
                    <!-- Mode (Standard/Quality) -->
                    <div class="column is-6">
                      <label
                        class="control-label fira-sans-condensed-black-italic"
                      >
                        Mode
                      </label>
                      <div class="mode-buttons compact">
                        <button
                          v-for="mode in modelModes"
                          :key="mode.id"
                          class="mode-btn"
                          :class="{ active: modelMode === mode.id }"
                          @click="modelMode = mode.id"
                          :title="mode.description"
                        >
                          <span class="mode-icon">
                            <span class="material-symbols-outlined is-size-4">
                              {{ mode.icon }}
                            </span>
                          </span>
                          <span class="mode-label">{{ mode.label }}</span>
                        </button>
                      </div>
                    </div>

                    <!-- Strategy (Generation approach) -->
                    <div class="column is-6">
                      <label
                        class="control-label fira-sans-condensed-black-italic"
                      >
                        Strategy
                      </label>
                      <div class="mode-buttons compact">
                        <button
                          v-for="mode in generationModes"
                          :key="mode.id"
                          class="mode-btn small"
                          :class="{ active: generationMode === mode.id }"
                          @click="generationMode = mode.id"
                          :title="mode.description"
                        >
                          <span class="mode-icon">
                            <span class="material-symbols-outlined is-size-3">
                              {{ mode.icon }}
                            </span>
                          </span>
                          <span class="mode-label">{{ mode.label }}</span>
                        </button>
                      </div>
                    </div>

                    <!-- Vision Analysis Indicator (always active) -->
                    <div class="column is-6 mt-2">
                      <div class="vision-indicator" :class="{ ready: visionModelReady }">
                        <span class="material-symbols-outlined vision-icon">
                          {{ visionModelReady ? 'visibility' : 'visibility_off' }}
                        </span>
                        <span class="vision-label">
                          Vision Analysis
                          <span v-if="visionModelReady" class="ml-2 tag is-success active fira-sans-condensed-black-italic">Active</span>
                          <span v-else class="ml-2 tag is-danger pending fira-sans-condensed-black-italic">Download Required</span>
                        </span>
                      </div>
                    </div>
                    <div class="column is-6 mt-2">
                      <!-- STRATEGY INFO -->
                      <div class="notification is-info mb-4 strategy-info">
                        <span class="material-symbols-outlined info-icon">
                          info
                        </span>
                        <span>
                          {{
                            generationModes.find((m) => m.id === generationMode)
                              ?.description
                          }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- DOWNLOAD REQUIRED PANEL (LLM + Vision bundled) -->
                <div
                  v-if="needsDownload && !downloads.active"
                  class="notification is-danger mb-4 p-5"
                >
                  <p class="mb-3">
                    <strong class="fira-sans-condensed-black-italic is-size-2">
                      Download Required
                    </strong>
                  </p>
                  <ul class="download-list has-text-left">
                    <li v-if="!isModel">
                      <span class="material-symbols-outlined mr-2">deployed_code</span>
                      <span class="download-item-name">
                        {{ currentModel.filename }}
                      </span>
                      <span class="download-item-size">
                        {{ currentModel.filesize }}
                      </span>
                    </li>
                    <li v-if="!visionModelReady">
                      <span class="material-symbols-outlined mr-2">
                        visibility
                      </span>
                      <span class="download-item-name">{{ VISION_MODEL.name }}</span>
                      <span class="download-item-size">{{ VISION_MODEL.filesize }}</span>
                    </li>
                  </ul>
                  <button
                    class="button is-warning mt-3 is-large"
                    @click="downloadAllModels"
                  >
                    <span class="material-symbols-outlined mr-2">download</span>
                    Download All
                  </button>
                </div>

                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="notification is-info mb-4 p-5"
                >
                  <p class="mb-2">
                    <span class="fira-sans-condensed-black-italic is-size-4">
                      Downloading
                      <button
                        disabled
                        class="button is-loading is-info is-small mr-2 p-4"
                      ></button>
                    </span>
                    <span
                      class="fira-sans-condensed-black-italic is-pulled-right is-size-1"
                    >
                      {{ Math.round(downloads.total_progress || 0) }}%
                    </span>
                  </p>
                  <progress
                    class="progress is-success is-large"
                    :value="downloads.progress || 0"
                    max="100"
                  >
                    {{ Math.round(downloads.progress || 0) }}%
                  </progress>
                  <div
                    v-if="downloadTaskList.length"
                    style="max-height: 180px; overflow: auto"
                  >
                    <ul>
                      <li
                        v-for="t in downloadTaskList"
                        :key="t.task_id"
                        class="is-size-7 columns"
                        style="text-transform: lowercase"
                      >
                        <div class="column has-text-left">
                          <span class="material-symbols-outlined is-size-6">
                            deployed_code
                          </span>
                          {{ t.filename }} —
                          <span class="fira-sans-condensed-black-italic">
                            {{ t.status }}
                          </span>
                        </div>
                        <div
                          class="column is-2 fira-sans-condensed-black-italic has-text-right"
                        >
                          {{ Math.round(t.progress || 0) }}%
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>

                <form ref="promptForm" @submit.prevent="onSubmit">
                  <textarea
                    id="prompt"
                    class="input is-large is-fullwidth"
                    placeholder="Describe a 3D object... (e.g., A mystical crystal orb with inner glow)"
                    v-model="form.prompt"
                    :disabled="isLoading || !hasAccess || !isModel"
                    @keydown.enter.exact.prevent="
                      canSubmitWithAccess && onSubmit()
                    "
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

          <!-- ENVIRONMENT CONTROLS -->
          <div class="environment-controls models__activity--payouts mt-5">
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

          <!-- GENERATION HISTORY HEADER -->
          <div class="level mb-4 mt-5" v-if="objectInferences.length > 0">
            <div class="level-left">
              <div class="level-item">
                <h2
                  class="fira-sans-condensed-black-italic has-text-white is-size-2"
                >
                  <span class="material-symbols-outlined is-size-1 mr-2">
                    history
                  </span>
                  Generation History
                </h2>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item buttons">
                <button
                  class="button is-warning is-small"
                  @click="importHistory()"
                >
                  <span class="material-symbols-outlined mr-2">upload</span>
                  Import
                </button>
                <button
                  class="button is-warning is-small ml-4"
                  @click="exportHistory()"
                  :disabled="objectInferences.length === 0"
                >
                  <span class="material-symbols-outlined mr-2">download</span>
                  Export
                </button>
                <button
                  class="button is-danger is-small ml-4"
                  @click="clearHistory()"
                >
                  <span class="material-symbols-outlined mr-2">ink_eraser</span>
                  Clear
                </button>
              </div>
            </div>
          </div>

          <!-- History -->
          <div v-if="objectInferences.length > 0">
            <ol class="chat">
              <li
                v-for="(item, displayIndex) in paginatedInferences"
                :key="item.id"
                class="history-item"
                :style="{
                  animationDelay: `${Math.min(displayIndex * 50, 500)}ms`,
                }"
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

                  <!-- Multi-angle Screenshots Preview -->
                  <div
                    v-if="item.screenshots && item.screenshots.length > 0"
                    class="screenshots-preview"
                  >
                    <div class="screenshots-grid">
                      <div
                        v-for="(shot, shotIdx) in item.screenshots"
                        :key="shotIdx"
                        class="screenshot-thumb"
                        @click="openScreenshotModal(item, shotIdx)"
                        :title="shot.label || shot.name"
                      >
                        <img :src="shot.dataUrl" :alt="shot.label || shot.name" />
                        <span class="screenshot-label">{{ shot.label || shot.name }}</span>
                      </div>
                    </div>
                    <div
                      v-if="item.visionVerified"
                      class="vision-verified-badge"
                    >
                      <span class="material-symbols-outlined">verified</span>
                      Vision Verified
                    </div>
                  </div>

                  <div v-if="!item.success" class="error-note">
                    <span class="material-symbols-outlined mr-1">error</span>
                    {{ item.notes }}
                  </div>
                  <hr />
                  <button
                    class="button is-medium is-success copy is-pulled-left p-0 pl-1 pr-1"
                    @click="copyPrompt(item.prompt, item._originalIndex)"
                  >
                    <span
                      class="material-symbols-outlined is-size-2"
                      v-if="!hasCopy[item._originalIndex]"
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
                    title="Load this scene"
                  >
                    <span class="material-symbols-outlined mr-1">
                      visibility
                    </span>
                    Load
                  </button>
                  <button
                    class="button is-medium is-info ml-2 is-pulled-left"
                    @click="regenerateFromInference(item)"
                    :disabled="isLoading"
                    title="Regenerate with same prompt"
                  >
                    <span class="material-symbols-outlined mr-1">
                      autorenew
                    </span>
                    Retry
                  </button>
                  <button
                    disabled
                    class="button is-medium is-warning ml-2 is-pulled-left"
                    title="Mint as NFT (coming soon)"
                  >
                    <span class="material-symbols-outlined mr-1">token</span>
                    Mint
                  </button>
                  <button
                    class="button is-medium is-danger is-pulled-right p-0 pl-1 pr-1"
                    @click="removeInference(item._originalIndex)"
                    title="Delete"
                  >
                    <span class="material-symbols-outlined is-size-2">
                      delete
                    </span>
                  </button>
                </div>
              </li>
            </ol>
            <!-- LAZY LOAD SENTINEL -->
            <div
              ref="loadMoreSentinel"
              v-if="hasMore"
              class="load-more-sentinel has-text-centered p-4"
            >
              <span v-if="isLoadingMore" class="has-text-grey">
                Loading more...
              </span>
            </div>

            <!-- SCROLL TO TOP BUTTON -->
            <button
              v-if="showScrollTop"
              class="scroll-to-top-btn"
              @click="scrollToTop"
              title="Scroll to top"
            >
              <span class="material-symbols-outlined">arrow_upward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Screenshot Modal -->
  <div
    v-if="screenshotModal.visible"
    class="screenshot-modal-overlay"
    @click.self="closeScreenshotModal"
  >
    <div class="screenshot-modal">
      <button class="screenshot-modal-close" @click="closeScreenshotModal">
        <span class="material-symbols-outlined">close</span>
      </button>
      <div class="screenshot-modal-header">
        <h3 class="fira-sans-condensed-black-italic">
          {{ screenshotModal.currentShot?.label || 'Screenshot' }}
        </h3>
        <div class="screenshot-modal-nav">
          <button
            class="nav-btn"
            :disabled="screenshotModal.currentIndex <= 0"
            @click="navigateScreenshot(-1)"
          >
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <span class="nav-indicator">
            {{ screenshotModal.currentIndex + 1 }} / {{ screenshotModal.shots?.length || 0 }}
          </span>
          <button
            class="nav-btn"
            :disabled="screenshotModal.currentIndex >= (screenshotModal.shots?.length || 1) - 1"
            @click="navigateScreenshot(1)"
          >
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>
      <div class="screenshot-modal-content">
        <img
          v-if="screenshotModal.currentShot"
          :src="screenshotModal.currentShot.dataUrl"
          :alt="screenshotModal.currentShot.label"
        />
      </div>
      <div class="screenshot-modal-footer">
        <button
          class="button is-info"
          @click="downloadScreenshot(screenshotModal.currentShot)"
        >
          <span class="material-symbols-outlined mr-1">download</span>
          Download
        </button>
        <button
          class="button is-success ml-2"
          @click="downloadAllScreenshots"
        >
          <span class="material-symbols-outlined mr-1">folder_zip</span>
          Download All
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import ThreeViewer from "./ThreeViewer.vue";
import AccessRequirements from "./AccessRequirements.vue";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { io } from "socket.io-client";
import {
  addObjectInference,
  loadObjectInferences,
  removeObjectInference,
  clearObjectInferences,
  inferenceStore,
} from "../stores/inferenceStore";

// Server URL for vision feedback
const SERVER_URL =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${SERVER_URL}/downloads`;

// Get headers for demo mode requests (auth is handled by global axios interceptor)
const getDemoHeaders = (isDemo = false) => {
  return isDemo ? { "X-Demo-Mode": "true" } : {};
};

// Array of impressive demo prompts for variety
const DEMO_PROMPTS = [
  "A floating ancient spellbook with glowing runes and orbiting magical particles",
  "A dragon egg on a nest of gold coins, cracking with inner fire glow",
  "A mystical hourglass with swirling cosmic sand and floating stars",
  "An enchanted sword embedded in a crystal formation, pulsing with energy",
  "A steampunk mechanical heart with brass gears and glowing tubes",
  "A wizard's staff topped with a swirling galaxy orb and lightning sparks",
  "A phoenix feather quill in an inkwell with magical mist rising",
  "An alchemist's bubbling cauldron with floating ingredient bottles",
  "A crystalline tree with luminescent fruit and fairy dust particles",
  "A treasure map scroll with a glowing compass and floating coins",
  "A magical music box with dancing holographic ballerina",
  "An ancient astrolabe with rotating celestial rings and star particles",
];

// Get a random demo prompt
const getRandomDemoPrompt = () => {
  return DEMO_PROMPTS[Math.floor(Math.random() * DEMO_PROMPTS.length)];
};

const DEMO_PROMPT = getRandomDemoPrompt();

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

// Extract the inner code from a normalized module (for multi-pass generation)
function extractInnerCode(normalizedCode) {
  // Try multiple regex patterns to extract the inner code

  // Pattern 1: Match content between "try {" and "scene.add(root);"
  let match = normalizedCode.match(
    /try\s*\{\s*([\s\S]*?)\n\s*scene\.add\(root\);/
  );

  // Pattern 2: If that fails, try matching until "return root;"
  if (!match || !match[1] || match[1].trim().length < 20) {
    match = normalizedCode.match(/try\s*\{\s*([\s\S]*?)\n\s*return\s+root\s*;/);
  }

  // Pattern 3: Try a more lenient match
  if (!match || !match[1] || match[1].trim().length < 20) {
    match = normalizedCode.match(
      /try\s*\{([\s\S]+?)(?=\s*scene\.add\(root\)|return\s+root)/
    );
  }

  if (match && match[1]) {
    // Remove leading indentation (4 spaces) from each line
    const extracted = match[1]
      .split("\n")
      .map((line) => line.replace(/^    /, ""))
      .join("\n")
      .trim();

    // Verify we got meaningful code (not just whitespace or tiny fragments)
    if (extracted.length > 20) {
      console.log(
        "[extractInnerCode] Extracted",
        extracted.length,
        "chars from normalized code"
      );
      return extracted;
    }
  }

  // Fallback: If this looks like already raw code (no wrapper), return as-is
  if (!normalizedCode.includes("export default async function generate")) {
    console.log("[extractInnerCode] Code appears to be raw, returning as-is");
    return normalizedCode;
  }

  // Last resort: warn and return original
  console.warn(
    "[extractInnerCode] Could not extract inner code, falling back to original"
  );
  return normalizedCode;
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
    // Use shared inference store for 3D objects
    const objectInferences = computed(() => inferenceStore.state.objectInferences);
    const hasCopy = reactive([]);
    const autoRotate = ref(true);
    const currentTime = ref("day");
    const currentWeather = ref("sunny");
    const lightIntensity = ref(1.0);
    const isModelLoaded = ref(false);
    const form = reactive({ prompt: "" });
    const downloadProgress = ref(0);
    const isModel = ref(false);

    // ═══════════════════════════════════════════════════════════════════════
    // GENERATION MODE
    // ═══════════════════════════════════════════════════════════════════════
    const generationMode = ref("normal");
    const generationModes = ref([
      {
        id: "normal",
        label: "Normal",
        icon: "bolt",
        description: "Quick generation with vision verification (up to 3 fixes)",
        visionChecks: 3,
      },
      {
        id: "craftsman",
        label: "Craftsman",
        icon: "diamond",
        description: "High-quality like H.chest helper (up to 5 vision fixes)",
        visionChecks: 5,
      },
    ]);

    const MAX_RETRY_ATTEMPTS = 3;

    // ═══════════════════════════════════════════════════════════════════════
    // VISION ANALYSIS (MANDATORY)
    // ═══════════════════════════════════════════════════════════════════════

    // Multi-angle camera configurations for comprehensive analysis
    const VISION_ANGLES = [
      { name: "front", azimuth: 0, elevation: 15, label: "Front" },
      { name: "side", azimuth: 90, elevation: 15, label: "Side" },
      { name: "back", azimuth: 180, elevation: 15, label: "Back" },
      { name: "top", azimuth: 45, elevation: 60, label: "Top" },
    ];

    // Feedback history to prevent oscillation
    const feedbackHistory = ref([]);
    const visionModelReady = ref(false);
    const visionModelDownloading = ref(false);
    const downloadStatus = ref("");
    const isDownloading = ref(false);

    // ═══════════════════════════════════════════════════════════════════════
    // DOWNLOADS TRACKING (matches GenerativeImage pattern)
    // ═══════════════════════════════════════════════════════════════════════
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
      total_progress: 0,
      status: "pending",
      wsUrl: WS_DL,
      pipeline: { tasks: {} },
    });

    const downloadsSocket = ref(null);
    const lastDlEventAt = ref(0);
    let httpPollTimer = null;

    const socketOpts = {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000,
    };

    // Merge task data
    const mergeTask = (existing, incoming) => {
      if (!existing) return { ...incoming };
      return {
        ...existing,
        ...incoming,
        progress:
          incoming.progress !== undefined
            ? incoming.progress
            : existing.progress,
        status: incoming.status || existing.status,
      };
    };

    // Compute total progress from tasks
    const computeTotalFromTasks = (tasks) => {
      const arr = Object.values(tasks);
      if (!arr.length) return 0;
      const sum = arr.reduce((acc, t) => acc + (t.progress || 0), 0);
      return sum / arr.length;
    };

    // Apply pipeline update from server
    const applyPipelineUpdate = (p) => {
      if (!p) return;
      downloads.pipelineId = p.pipeline_id || downloads.pipelineId;
      downloads.status = p.status || downloads.status || "downloading";

      const existing = downloads.pipeline?.tasks || {};
      const incoming = p.tasks || {};
      const merged = { ...existing };
      for (const [tid, t] of Object.entries(incoming)) {
        merged[tid] = mergeTask(existing[tid], t);
      }
      downloads.pipeline = {
        ...(downloads.pipeline || {}),
        ...p,
        tasks: merged,
      };

      const serverPct = Number(p.total_progress ?? 0);
      const tasksPct = computeTotalFromTasks(merged);
      let next =
        Number.isFinite(serverPct) && serverPct > 0 ? serverPct : tasksPct;

      // Don't show 100% until every task is finished
      const allTasksComplete = Object.values(merged).every((t) =>
        ["completed", "failed", "cancelled"].includes(t.status)
      );
      const anyTaskPending = Object.values(merged).some((t) =>
        ["downloading", "pending"].includes(t.status)
      );
      if (!allTasksComplete && next >= 100) {
        next = anyTaskPending ? 99 : 100;
      }

      downloads.progress = next;
      downloads.total_progress = next;

      if (allTasksComplete && downloads.status === "downloading") {
        downloads.status = "completed";
      }

      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status
      );
    };

    // Ensure WebSocket connection
    const ensureDownloadsSocket = (base = WS_DL) => {
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      downloads.wsUrl = base;
      downloadsSocket.value = io(base, socketOpts);

      downloadsSocket.value.on("connect", () => {
        if (downloads.pipelineId) {
          downloadsSocket.value.emit("subscribe", {
            pipeline_id: downloads.pipelineId,
          });
        }
      });

      downloadsSocket.value.on("download_progress", ({ pipeline }) => {
        lastDlEventAt.value = Date.now();
        if (!pipeline) return;
        applyPipelineUpdate(pipeline);
      });

      downloadsSocket.value.on("disconnect", () => {
        console.warn("[Generative3D] Downloads socket disconnected");
      });
    };

    // HTTP polling fallback
    const kickHttpPollIfStale = (pipelineId) => {
      if (httpPollTimer) clearInterval(httpPollTimer);
      httpPollTimer = setInterval(async () => {
        if (Date.now() - lastDlEventAt.value < 3000) return;
        try {
          const { data } = await axios.get(
            `${SERVER_URL}/downloads/status/${pipelineId}`
          );
          if (data) {
            applyPipelineUpdate(data);
            if (!downloads.active) {
              clearInterval(httpPollTimer);
              httpPollTimer = null;
            }
          }
        } catch {
          clearInterval(httpPollTimer);
          httpPollTimer = null;
        }
      }, 1000);
    };

    // Connect and subscribe to pipeline
    const connectAndSubscribe = (pipelineId, websocketUrl) => {
      if (!pipelineId) return;
      ensureDownloadsSocket(websocketUrl || WS_DL);
      downloads.active = true;
      downloads.pipelineId = pipelineId;
      downloads.status = downloads.status || "downloading";
      try {
        downloadsSocket.value.emit("subscribe", { pipeline_id: pipelineId });
      } catch {}
      kickHttpPollIfStale(pipelineId);
    };

    // Start download tracking
    const startDownloadTracking = (pipelineId, websocketUrl) => {
      connectAndSubscribe(pipelineId, websocketUrl);
      const t = setInterval(async () => {
        if (!downloads.active && downloads.status !== "failed") {
          clearInterval(t);
          // Recheck model status
          await checkVisionModel();
          await isModelAvailable();
        }
        if (downloads.status === "failed") clearInterval(t);
      }, 1000);
    };

    // Resume active download if any
    const resumeActiveDownloadIfAny = async () => {
      try {
        const { data } = await axios.get(`${SERVER_URL}/downloads/list`);
        const active = (data?.pipelines || []).filter((p) =>
          ["pending", "downloading", "retrying", "waiting_retry"].includes(
            p.status
          )
        );
        if (active.length) {
          const { pipeline_id, websocket_url } = active[0];
          startDownloadTracking(pipeline_id, websocket_url || WS_DL);
        }
      } catch {}
    };

    // Computed: sorted task list for display
    const downloadTaskList = computed(() => {
      const tasks = downloads.pipeline?.tasks || {};
      const arr = Object.values(tasks);
      const order = {
        downloading: 0,
        pending: 1,
        completed: 2,
        failed: 3,
        cancelled: 4,
      };
      return arr
        .map((t) => ({ ...t }))
        .sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));
    });

    // Computed: needs download if LLM or vision model missing
    const needsDownload = computed(
      () => !isModel.value || !visionModelReady.value
    );

    // Download all required models (LLM + Vision)
    const downloadAllModels = async () => {
      if (downloads.active) return;

      // Reset downloads state
      downloads.active = true;
      downloads.status = "downloading";
      downloads.progress = 0;
      downloads.total_progress = 0;
      downloads.pipeline = { tasks: {} };

      const needsLlm = !isModel.value;
      const needsVision = !visionModelReady.value;
      const llmTaskId = "llm-gguf";
      const visionTaskId = "vision-model";

      try {
        // Initialize tasks for what we need to download
        if (needsLlm) {
          downloads.pipeline.tasks[llmTaskId] = {
            task_id: llmTaskId,
            filename: currentModel.value.filename,
            status: "pending",
            progress: 0,
          };
        }
        if (needsVision) {
          downloads.pipeline.tasks[visionTaskId] = {
            task_id: visionTaskId,
            filename: VISION_MODEL.name,
            status: "pending",
            progress: 0,
          };
        }

        // Start LLM download via Electron IPC
        if (needsLlm) {
          downloads.pipeline.tasks[llmTaskId].status = "downloading";

          // Set up progress listener for LLM
          const llmProgressHandler = (e, data) => {
            if (data.filename === currentModel.value.filename) {
              const pct = Math.round(data.percent * 100);
              downloads.pipeline.tasks[llmTaskId].progress = pct;
              updateTotalProgress();
            }
          };
          window.electronAPI.onDownloadProgress(llmProgressHandler);

          const success = await window.electronAPI.downloadModel(
            currentModel.value.url,
            currentModel.value.filename
          );

          if (success) {
            downloads.pipeline.tasks[llmTaskId].status = "completed";
            downloads.pipeline.tasks[llmTaskId].progress = 100;
            isModel.value = true;
          } else {
            downloads.pipeline.tasks[llmTaskId].status = "failed";
          }
          updateTotalProgress();
        }

        // Start Vision model download via server-side prefetch (Qwen3-VL HuggingFace)
        if (needsVision) {
          console.log("[Generative3D] Starting Qwen3-VL vision model download (server-side)...");

          downloads.pipeline.tasks[visionTaskId].status = "downloading";
          updateTotalProgress();

          try {
            // Trigger server-side prefetch
            const { data } = await axios.post(`${SERVER_URL}/pipelines/prefetch`, {
              pipeline: VISION_MODEL.pipeline,
            });

            if (data.pipeline_id) {
              // Poll for completion
              let completed = false;
              while (!completed) {
                await new Promise((r) => setTimeout(r, 2000));

                try {
                  const { data: statusData } = await axios.get(
                    `${SERVER_URL}/downloads/status/${data.pipeline_id}`
                  );

                  console.log("[Vision] Download status:", statusData.status, "progress:", statusData.total_progress);

                  if (statusData.status === "completed") {
                    downloads.pipeline.tasks[visionTaskId].status = "completed";
                    downloads.pipeline.tasks[visionTaskId].progress = 100;
                    visionModelReady.value = true;
                    completed = true;
                  } else if (statusData.status === "failed") {
                    downloads.pipeline.tasks[visionTaskId].status = "failed";
                    downloads.pipeline.tasks[visionTaskId].progress = 0;
                    completed = true;
                  } else {
                    // Update progress - server returns total_progress
                    const pct = Math.round(statusData.total_progress || 0);
                    downloads.pipeline.tasks[visionTaskId].progress = pct;
                    downloads.pipeline.tasks[visionTaskId].status = "downloading";
                  }
                  updateTotalProgress();
                } catch (e) {
                  console.error("[Vision] Download status check failed:", e);
                }
              }
            }
          } catch (e) {
            console.error("[Vision] Failed to start download:", e);
            downloads.pipeline.tasks[visionTaskId].status = "failed";
          }

          // Check final status
          await checkVisionModel();
        }

        // Final status
        if (isModel.value && visionModelReady.value) {
          downloads.status = "completed";
          downloads.progress = 100;
          downloads.total_progress = 100;
        }
      } catch (e) {
        console.error("Download error:", e);
        downloads.status = "failed";
      } finally {
        // Mark as inactive after a short delay to show completion
        if (downloads.status === "completed") {
          await new Promise((r) => setTimeout(r, 1500));
        }
        downloads.active = false;
      }
    };

    // Helper to update total progress from all tasks
    const updateTotalProgress = () => {
      const tasks = Object.values(downloads.pipeline?.tasks || {});
      if (!tasks.length) return;
      const sum = tasks.reduce((acc, t) => acc + (t.progress || 0), 0);
      const pct = sum / tasks.length;
      downloads.progress = pct;
      downloads.total_progress = pct;
    };

    // Qwen3-VL vision model configuration (server-side via diffuser.py)
    const VISION_MODEL = {
      pipeline: "qwen3_vision",
      name: "Qwen3-VL 2B",
      repo: "Qwen/Qwen3-VL-2B-Instruct",
      filesize: "~4 GB",
    };

    const visionModelDownloadProgress = ref(0);
    const visionMmprojDownloadProgress = ref(0);
    const visionModelLoaded = ref(false);

    // Vision support status - using server-side Qwen3-VL via diffuser.py
    const visionSupported = ref(true); // Server-side vision is supported

    // Ensure vision model is ready (server-side handles loading)
    // Note: This is now a simple check - actual model status is verified in getVisionFeedback
    const ensureVisionModelLoaded = async () => {
      if (!visionSupported.value) {
        return false;
      }
      // Refresh status
      await checkVisionModel();
      return visionModelReady.value;
    };

    // Check if vision model is available (server-side Qwen3-VL)
    const checkVisionModel = async () => {
      try {
        const { data } = await axios.post(`${SERVER_URL}/pipelines/plan`, {
          pipeline: VISION_MODEL.pipeline,
        });

        // The /pipelines/plan endpoint returns { ok: true/false } to indicate readiness
        console.log("[Generative3D] Vision model check - ok:", data.ok, "repos:", data.repos?.length, "files:", data.required_files?.length);
        visionModelReady.value = data.ok === true;
      } catch (e) {
        // If endpoint returns 404 or other error, check downloads list
        console.error("[Generative3D] Vision model plan check failed:", e.response?.data || e.message);
        try {
          const { data } = await axios.get(`${SERVER_URL}/downloads/list`);
          // Check if qwen3_vision pipeline completed
          const visionPipeline = data.pipelines?.find(p => p.pipeline_id?.includes("qwen3_vision"));
          visionModelReady.value = visionPipeline?.status === "completed";
        } catch (e2) {
          console.error("[Generative3D] Vision model check error:", e2);
          visionModelReady.value = false;
        }
      }
    };

    // Download vision model (server-side Qwen3-VL)
    const downloadVisionModel = async () => {
      if (visionModelDownloading.value) return;
      visionModelDownloading.value = true;

      try {
        downloadStatus.value = "Starting vision model download...";

        // Trigger server-side prefetch
        const { data } = await axios.post(`${SERVER_URL}/pipelines/prefetch`, {
          pipeline: VISION_MODEL.pipeline,
        });

        if (data.pipeline_id) {
          downloadStatus.value = "Downloading vision model...";

          // Poll for completion
          const pollInterval = setInterval(async () => {
            try {
              const { data: statusData } = await axios.get(
                `${SERVER_URL}/downloads/status/${data.pipeline_id}`
              );

              if (statusData.status === "completed") {
                clearInterval(pollInterval);
                await checkVisionModel();
                downloadStatus.value = "Vision model ready!";
                visionModelLoaded.value = true;
                visionModelDownloading.value = false;
              } else if (statusData.status === "failed") {
                clearInterval(pollInterval);
                downloadStatus.value = "Download failed";
                visionModelDownloading.value = false;
              } else {
                // Update progress - server returns total_progress
                visionModelDownloadProgress.value = Math.round(statusData.total_progress || 0);
              }
            } catch (e) {
              console.error("[Vision] Download status check failed:", e);
            }
          }, 2000);
        }
      } catch (e) {
        console.error("Failed to download vision model:", e);
        downloadStatus.value = "Download failed: " + e.message;
        visionModelDownloading.value = false;
      }
    };

    // Capture multi-angle screenshots for vision analysis
    const captureMultiAngleScreenshots = (forVision = true) => {
      const viewer = threeViewer.value;
      if (!viewer) throw new Error("Viewer not initialized");

      return viewer.captureMultiAngleScreenshots(VISION_ANGLES, {
        width: 512,
        height: 512,
        format: "png",
        quality: 0.9,
        disableHDR: forVision, // Disable HDR for vision analysis to get accurate colors
      });
    };

    // Create a 2x2 grid image from 4 screenshots for single vision API call
    const createScreenshotGrid = (screenshots) => {
      return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const cellSize = 512;
        canvas.width = cellSize * 2;  // 1024px wide
        canvas.height = cellSize * 2; // 1024px tall

        // Load all 4 images
        const images = [];
        let loaded = 0;

        screenshots.forEach((shot, index) => {
          const img = new Image();
          img.onload = () => {
            images[index] = img;
            loaded++;
            if (loaded === 4) {
              // Draw images in 2x2 grid: [Front, Side] / [Back, Top]
              // Top-left (0,0): Front
              ctx.drawImage(images[0], 0, 0, cellSize, cellSize);
              // Top-right (1,0): Side
              ctx.drawImage(images[1], cellSize, 0, cellSize, cellSize);
              // Bottom-left (0,1): Back
              ctx.drawImage(images[2], 0, cellSize, cellSize, cellSize);
              // Bottom-right (1,1): Top
              ctx.drawImage(images[3], cellSize, cellSize, cellSize, cellSize);

              // Add labels to each quadrant
              ctx.fillStyle = "white";
              ctx.strokeStyle = "black";
              ctx.lineWidth = 3;
              ctx.font = "bold 24px Arial";
              const labels = ["FRONT", "SIDE", "BACK", "TOP"];
              const positions = [
                [10, 30], [cellSize + 10, 30],
                [10, cellSize + 30], [cellSize + 10, cellSize + 30]
              ];
              labels.forEach((label, i) => {
                ctx.strokeText(label, positions[i][0], positions[i][1]);
                ctx.fillText(label, positions[i][0], positions[i][1]);
              });

              resolve(canvas.toDataURL("image/png", 0.9));
            }
          };
          img.src = shot.dataUrl;
        });
      });
    };

    // Parse vision model response to extract structured feedback
    const parseVisionResponse = (response) => {
      const upperResponse = response.toUpperCase();

      // Extract missing elements FIRST - this influences match decision
      let missingElements = [];
      const missingMatch = response.match(/MISSING:\s*([^\n]+)/i);
      if (missingMatch && missingMatch[1]) {
        const missingStr = missingMatch[1].trim();
        if (missingStr.toLowerCase() !== "none" && missingStr.toLowerCase() !== "n/a" && missingStr.toLowerCase() !== "none.") {
          missingElements = missingStr.split(",").map(s => s.trim()).filter(s => s && s.toLowerCase() !== "none");
        }
      }

      // Extract feedback
      let feedback = response;
      const feedbackMatch = response.match(/FEEDBACK:\s*([^\n]+)/i);
      if (feedbackMatch && feedbackMatch[1]) {
        feedback = feedbackMatch[1].trim();
      }

      // Check for explicit MATCHES (be STRICT - only accept explicit YES, not implied)
      const matchesYes = upperResponse.includes("MATCHES: YES") || upperResponse.includes("MATCHES:YES");
      const matchesNo = upperResponse.includes("MATCHES: NO") || upperResponse.includes("MATCHES:NO");

      // CONSERVATIVE LOGIC: Default to NO unless explicitly YES and no quality issues
      let matches = false;
      if (matchesYes && !matchesNo) {
        // Even if vision says YES, check if it listed quality issues
        if (missingElements.length === 0) {
          // Also check feedback for quality concern keywords
          const feedbackLower = feedback.toLowerCase();
          const hasQualityConcerns = feedbackLower.includes("could be improved") ||
                                     feedbackLower.includes("needs work") ||
                                     feedbackLower.includes("poorly rendered") ||
                                     feedbackLower.includes("not properly") ||
                                     feedbackLower.includes("basic shape") ||
                                     feedbackLower.includes("placeholder") ||
                                     feedbackLower.includes("unclear") ||
                                     feedbackLower.includes("missing detail") ||
                                     feedbackLower.includes("not visible") ||
                                     feedbackLower.includes("hard to identify");
          matches = !hasQualityConcerns;
        }
      }

      return { matches, missingElements, feedback };
    };

    // Get comprehensive vision feedback using 2x2 grid image (single API call)
    const getVisionFeedback = async (prompt, phaseContext = null, isDemo = false) => {
      const viewer = threeViewer.value;
      if (!viewer) throw new Error("Viewer not initialized");

      // Check if vision is supported
      if (!visionSupported.value) {
        console.log("[Vision] Vision verification skipped - not supported");
        return {
          matches: true,
          feedback: "Vision verification skipped (not supported)",
          missing_elements: [],
          angle_results: [],
          screenshots: [],
          skipped: true,
        };
      }

      // Refresh vision model status
      await checkVisionModel();
      if (!visionModelReady.value) {
        console.log("[Vision] Vision verification skipped - model not downloaded");
        return {
          matches: true,
          feedback: "Vision verification skipped (model not downloaded)",
          missing_elements: [],
          angle_results: [],
          screenshots: [],
          skipped: true,
        };
      }

      // Unload code model to free memory for vision model
      await unloadCodeModel();

      // Capture screenshots from all angles
      const screenshots = captureMultiAngleScreenshots();

      // Create 2x2 grid image for single API call
      const gridDataUrl = await createScreenshotGrid(screenshots);

      try {
        // Build analysis prompt for grid image
        const analysisPrompt = `You are a STRICT quality evaluator for 3D rendered objects. Think like a game art director reviewing assets for a AAA game.

The user requested: "${prompt}"

IMAGE LAYOUT (2x2 grid):
- Top-left: FRONT view | Top-right: SIDE view
- Bottom-left: BACK view | Bottom-right: TOP view

YOUR STANDARD: HIGH PRODUCTION VALUE. This should look like a polished game asset, not a programmer art placeholder.

EVALUATION CRITERIA:
1. PRESENCE: Is each requested element actually visible and identifiable?
2. MATERIALS: Do surfaces have appropriate materials? (metallic, glossy, matte, glowing, transparent as needed)
   - Plain gray/white = FAIL. Objects need proper colors and material properties.
3. DETAIL: Are there meaningful details? Bevels, patterns, sub-elements, visual interest?
   - A "sword" that's just a rectangle = FAIL. It needs a blade, guard, handle.
   - A "treasure chest" needs wood grain texture, metal bands, proper lid shape.
4. LIGHTING/GLOW: If something should glow or emit light, does it actually glow?
5. COHESION: Do parts form a unified, intentional design? Or random disconnected shapes?
6. POSITIONING: Properly grounded (not floating, not clipping through floor)?
7. SCALE: Are proportions correct? Does it look right?

REJECT (MATCHES: NO) if:
- Objects are basic untextured geometry (plain boxes, spheres, cylinders)
- Colors/materials are obviously wrong or missing (gray metal instead of gold, no glow on magic items)
- Requested details are absent (coins with no embossing, gems with no facets, swords with no guard)
- It looks like a quick prototype rather than a finished asset
- You would be embarrassed to show this to an artist

ACCEPT (MATCHES: YES) only if:
- All requested elements are present AND well-executed
- Materials are appropriate and visually interesting
- The object has polish and attention to detail
- You would be PROUD to use this in a game

Step-by-step analysis:
1. List what the user asked for
2. For EACH element: Is it present? Is it HIGH QUALITY or just placeholder geometry?
3. Overall: Is this production-ready or needs more work?

Respond in this EXACT format:
MATCHES: [YES only if genuinely high quality, NO if anything needs improvement]
MISSING: [comma-separated list of missing OR poorly-rendered elements, or "none" if genuinely excellent]
FEEDBACK: [SPECIFIC instructions on what to fix or improve. Be detailed about colors, shapes, positions, textures that need work]`;

        // Single API call with grid image
        const { data } = await axios.post(
          `${SERVER_URL}/vision/analyze`,
          {
            image_base64: gridDataUrl,
            prompt: analysisPrompt,
            max_tokens: 768, // Allow more detailed quality feedback
          },
          {
            headers: getDemoHeaders(isDemo),
          }
        );

        const response = data.response || "";
        const parsed = parseVisionResponse(response);

        console.log(`[Vision:${phaseContext}:grid] Result:`, parsed);

        // Add to feedback history for oscillation prevention
        if (!parsed.matches && parsed.feedback) {
          feedbackHistory.value.push({
            timestamp: Date.now(),
            phase: phaseContext,
            feedback: parsed.feedback,
            missing: parsed.missingElements,
          });
        }

        return {
          matches: parsed.matches,
          feedback: parsed.feedback || "Object matches the prompt.",
          missing_elements: parsed.missingElements,
          angle_results: [{ angle: "grid", label: "All Angles", ...parsed, raw_response: response }],
          screenshots: screenshots, // Return individual screenshots for saving to history
        };
      } catch (e) {
        // Check if it's a 412 error (model not downloaded)
        if (e.response?.status === 412) {
          console.warn(`[Vision] Model not downloaded - skipping vision verification`);
          visionModelReady.value = false;
          return {
            matches: true,
            feedback: "Vision verification skipped (model not downloaded - use Download All to get the vision model)",
            missing_elements: [],
            angle_results: [],
            screenshots: screenshots,
            skipped: true,
          };
        }
        console.error(`[Vision] Failed to analyze grid image:`, e);
        return {
          matches: false,
          feedback: `Analysis failed: ${e.response?.data?.error || e.message}`,
          missing_elements: [],
          angle_results: [],
          screenshots: screenshots,
        };
      }
    };

    // Build prompt with accumulated vision feedback (prevents oscillation)
    const buildFeedbackPrompt = (
      originalPrompt,
      feedback,
      missingElements,
      existingCode = null
    ) => {
      const missingList =
        missingElements.length > 0
          ? `\n\nMISSING ELEMENTS that MUST be added:\n- ${missingElements.join("\n- ")}`
          : "";

      // Include previous feedback to prevent oscillation
      const previousFeedback =
        feedbackHistory.value.length > 1
          ? `\n\n⚠️ PREVIOUS ISSUES (DO NOT REINTRODUCE):\n${feedbackHistory.value
              .slice(0, -1)
              .map((f) => `- ${f.feedback}`)
              .join("\n")}`
          : "";

      return `You are an expert Three.js developer creating GAME-QUALITY 3D assets. Generate a 3D object for:

"${originalPrompt}"

⚠️ VISION ANALYSIS FOUND QUALITY ISSUES (from multiple viewing angles):
${feedback}${missingList}${previousFeedback}

You MUST address ALL feedback. The vision model will REJECT basic/placeholder geometry.

════════════════════════════════════════════════════════════════════
🎨 QUALITY REQUIREMENTS — Address the vision feedback with HIGH QUALITY fixes
════════════════════════════════════════════════════════════════════

- Use rich materials: MeshPhysicalMaterial with metalness, roughness, emissive, clearcoat
- Add DETAIL: sub-components, bevels, patterns - not just basic shapes
- Add lighting (H.light) and particles (H.sparks, H.dust) for polish
- Colors must be appropriate and rich (gold = 0xffd700, ruby = 0xcc0033)
- If vision said "poorly rendered" or "basic shape", add MORE DETAIL

════════════════════════════════════════════════════════════════════
🚨 CRITICAL RULES — VIOLATIONS WILL BREAK THE CODE
════════════════════════════════════════════════════════════════════

1. OUTPUT RAW JAVASCRIPT ONLY — No markdown, no \`\`\`, no JSON, no explanations
2. NEVER OMIT CODE — No "// omitted", "// ...", "(omitted for brevity)", or similar. Write COMPLETE code.
3. GROUND POSITIONING: ALL objects MUST sit ON or ABOVE the ground plane (y=0)
   - Object base should be at y >= 0.05 (never negative!)
   - NEVER set position.y to negative values
4. ALL objects must be added to \`root\` (not scene)
5. ALWAYS capture helper returns: const sword = H.sword({...});
6. Helper parameters are COLORS (hex numbers), not materials
7. SIZE CONSTRAINT: Objects must fit within 1x1 unit footprint (x: -0.5 to 0.5, z: -0.5 to 0.5)
8. HEIGHT: Objects should be 0.3-1.5 units tall (compact, detailed)

════════════════════════════════════════════════════════════════════
AVAILABLE CONTEXT
════════════════════════════════════════════════════════════════════

THREE        — Full Three.js library (use for custom geometry/materials)
root         — THREE.Group to add all objects to
H / helpers  — Convenience helpers

MATERIALS:
  H.metal(color, {roughness, glow, clearcoat})
  H.glass(color, {roughness, transmission, ior})
  H.gem(color, {glow, ior})
  H.liquid(color, {transmission, thickness, glow})
  H.glow(color, {intensity, opacity})

RPG ITEMS:
  H.potionBottle({shape, liquidColor, glassColor, glow, lowPoly})  // shape: round/flask/vial
  H.sword({bladeColor, handleColor, guardColor, bladeLength, lowPoly})
  H.shield({shape, faceColor, trimColor, frameColor, studs, lowPoly})
  H.chest({open, width, height, depth, woodColor, metalColor, lowPoly})
  H.gemstone({color, size, shape, lowPoly})

addUpdateCallback(fn) — Register animation: fn({deltaTime, time})

Generate the COMPLETE code now, ensuring ALL elements from the prompt are present:`;
    };

    // Build patch prompt for targeted fixes (adds to existing code)
    const buildPatchPrompt = (originalPrompt, missingElements, existingCode) => {
      const missingList = missingElements.join(", ");

      return `You are an expert Three.js developer. You need to ADD missing elements to an existing 3D scene.

ORIGINAL REQUEST: "${originalPrompt}"

MISSING ELEMENTS THAT MUST BE ADDED: ${missingList}

EXISTING CODE (already rendered - DO NOT modify this, only ADD to it):
\`\`\`javascript
${existingCode}
\`\`\`

════════════════════════════════════════════════════════════════════
🚨 YOUR TASK: Generate ONLY the code for the MISSING elements
════════════════════════════════════════════════════════════════════

1. OUTPUT RAW JAVASCRIPT ONLY — No markdown, no \`\`\`, no explanations
2. Generate ONLY the new meshes/objects for the missing elements
3. Position them appropriately relative to the existing objects
4. All new objects must be added to \`root\`
5. Do NOT recreate any objects from the existing code

Generate ONLY the additional code for: ${missingList}`;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LAZY LOADING PAGINATION
    // ═══════════════════════════════════════════════════════════════════════
    const ITEMS_PER_PAGE = 10;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);

    // Reversed inferences (most recent first) with original index
    const reversedInferences = computed(() => {
      return objectInferences.value
        .map((item, idx) => ({
          ...item,
          _originalIndex: idx,
        }))
        .reverse();
    });

    // Displayed inferences (lazy loaded subset)
    const paginatedInferences = computed(() => {
      return reversedInferences.value.slice(0, displayedCount.value);
    });

    // Check if there are more items to load
    const hasMore = computed(
      () => displayedCount.value < objectInferences.value.length
    );

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          objectInferences.value.length
        );
        isLoadingMore.value = false;
      }, 100);
    };

    // Intersection Observer for infinite scroll
    let scrollObserver = null;
    const setupScrollObserver = () => {
      if (scrollObserver) scrollObserver.disconnect();
      if (!loadMoreSentinel.value) return;

      // Use the scroll container as root for proper intersection detection
      const root =
        scrollContainer.value ||
        document.querySelector(".models__deployment-install");
      scrollObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore.value) {
            loadMore();
          }
        },
        { root, rootMargin: "100px" }
      );
      scrollObserver.observe(loadMoreSentinel.value);
    };

    // Scroll to top handler
    const scrollToTop = () => {
      const container =
        scrollContainer.value ||
        document.querySelector(".models__deployment-install");
      if (container) {
        container.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    // Handle scroll to show/hide scroll-to-top button (throttled)
    let scrollRafId = null;
    const handleScroll = (e) => {
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        const scrollTop = e.target?.scrollTop || 0;
        showScrollTop.value = scrollTop > 400;
        scrollRafId = null;
      });
    };

    // ═══════════════════════════════════════════════════════════════════════
    // SCREENSHOT MODAL
    // ═══════════════════════════════════════════════════════════════════════
    const screenshotModal = reactive({
      visible: false,
      shots: [],
      currentIndex: 0,
      currentShot: null,
      inferenceId: null,
    });

    const openScreenshotModal = (item, index) => {
      screenshotModal.shots = item.screenshots || [];
      screenshotModal.currentIndex = index;
      screenshotModal.currentShot = screenshotModal.shots[index] || null;
      screenshotModal.inferenceId = item.id;
      screenshotModal.visible = true;
    };

    const closeScreenshotModal = () => {
      screenshotModal.visible = false;
    };

    const navigateScreenshot = (direction) => {
      const newIndex = screenshotModal.currentIndex + direction;
      if (newIndex >= 0 && newIndex < screenshotModal.shots.length) {
        screenshotModal.currentIndex = newIndex;
        screenshotModal.currentShot = screenshotModal.shots[newIndex];
      }
    };

    const downloadScreenshot = (shot) => {
      if (!shot?.dataUrl) return;
      const link = document.createElement("a");
      link.href = shot.dataUrl;
      link.download = `3d-object-${shot.name || "screenshot"}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const downloadAllScreenshots = () => {
      screenshotModal.shots.forEach((shot, idx) => {
        setTimeout(() => downloadScreenshot(shot), idx * 200);
      });
    };

    // ═══════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════════════════
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (val) => {
      hasAccess.value = val;
    };
    const onDemoGenerate = () => {
      // Pick a fresh random prompt each time for variety
      const randomPrompt = getRandomDemoPrompt();
      form.prompt = randomPrompt;
      onSubmit(true); // true = isDemo
    };

    const canSubmitWithAccess = computed(() => {
      return (
        form.prompt.trim() &&
        !isLoading.value &&
        hasAccess.value &&
        isModel.value
      );
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

    // Model mode: standard (Qwen) or quality (GLM)
    const modelMode = ref("standard");
    const modelModes = ref([
      {
        id: "standard",
        label: "Standard",
        icon: "bolt",
        description: "Qwen 2.5 Coder 14B - Fast and efficient code generation",
      },
      {
        id: "quality",
        label: "Quality",
        icon: "diamond",
        description: "GLM 4.7 Flash - Higher quality with 200K context",
      },
    ]);

    const models = {
      standard: {
        modelname: "Qwen 2.5 Coder 14B",
        modeldesc:
          "14B-parameter Qwen 2.5 Coder instruction-tuned model with 128K context. State-of-the-art code generation and reasoning. Best for: serious development work, complex refactoring, and code agents requiring stronger understanding.",
        url: "https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/qwen2.5-coder-14b-instruct-q4_k_m.gguf",
        filename: "qwen2.5-coder-14b-instruct-q4_k_m.gguf",
        filesize: "8.93 GB",
        parameters: 14000000000,
        context: 131072,
      },
      quality: {
        modelname: "GLM 4.7 Flash",
        modeldesc:
          "30B-parameter Mixture-of-Experts model from Zhipu AI with only 3.6B active parameters per forward pass and 200K context. Ultra-efficient MoE architecture delivers strong reasoning at a fraction of the compute.",
        url: "https://huggingface.co/unsloth/GLM-4.7-Flash-GGUF/resolve/main/GLM-4.7-Flash-Q4_K_M.gguf",
        filename: "glm-4.7-flash-q4_k_m.gguf",
        filesize: "18.3 GB",
        parameters: 30000000000,
        activeParameters: 3600000000,
        isMoE: true,
        context: 202752,
      },
    };

    const currentModel = computed(() => models[modelMode.value]);

    // Watch for model mode changes to check availability and reset loaded state
    watch(modelMode, async (newMode) => {
      isModelLoaded.value = false; // Reset since different model needs loading
      await isModelAvailable(models[newMode].filename);
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
          "Round glass potion bottle filled with glowing red liquid (use H.potionBottle with liquidColor: 0xff3333, glassColor: 0xffffff, glow: true). Add a cork stopper on top and animated bubbles rising inside the liquid.",
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
          "Triangular flask shape potion bottle filled with bubbling green liquid (use H.potionBottle with shape: 'flask', liquidColor: 0x33ff66, glassColor: 0xffffff, glow: true). Add a cork stopper and animated steam particles rising from the top.",
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
      return `You are an expert Three.js developer creating GAME-QUALITY 3D assets. Generate a 3D object for:

"${userText}"

════════════════════════════════════════════════════════════════════
🎨 PRODUCTION QUALITY REQUIREMENTS — Your output will be JUDGED by a vision model
════════════════════════════════════════════════════════════════════

Your 3D object MUST look like a polished game asset, NOT programmer art:
- NEVER use plain/default materials (gray, white, flat MeshBasicMaterial)
- ALWAYS use MeshPhysicalMaterial with metalness, roughness, clearcoat, emissive as needed
- Objects need DETAIL: sub-components, bevels, patterns, visual interest
- A "sword" needs blade + guard + handle + pommel (not just a box)
- A "gem" needs facets and glow (not just a colored sphere)
- A "chest" needs wood texture, metal bands, hinges, lock
- Add lighting (H.light, H.spot) to enhance the scene
- Add particles/effects (H.sparks, H.dust, H.bubbles) for magic, fire, sparkle
- Colors should be RICH and APPROPRIATE (gold = 0xffd700, not yellow 0xffff00)

════════════════════════════════════════════════════════════════════
🚨 CRITICAL RULES — VIOLATIONS WILL BREAK THE CODE
════════════════════════════════════════════════════════════════════

1. OUTPUT RAW JAVASCRIPT ONLY — No markdown, no \`\`\`, no JSON, no explanations
2. NEVER OMIT CODE — No "// omitted", "// ...", "(omitted for brevity)", or similar. Write COMPLETE code.
3. GROUND POSITIONING: ALL objects MUST sit ON or ABOVE the ground plane (y=0)
   - Object base should be at y >= 0.05 (never negative!)
   - Use position.y = objectHeight/2 + 0.05 for centered objects
   - NEVER set position.y to negative values
4. ALL objects must be added to \`root\` (not scene)
5. ALWAYS capture helper returns: const sword = H.sword({...});
6. Helper parameters are COLORS (hex numbers), not materials
7. SIZE CONSTRAINT: Objects must fit within 1x1 unit footprint (x: -0.5 to 0.5, z: -0.5 to 0.5)
8. HEIGHT: Objects should be 0.3-1.5 units tall (compact, detailed)

WRONG:  H.sword({...});  sword.position.set(0,-0.5,0);  // BELOW GROUND!
WRONG:  mesh.position.y = -height/2;  // SINKS INTO GROUND!
RIGHT:  const sword = H.sword({...}); sword.position.set(0, 0.1, 0); root.add(sword);
RIGHT:  mesh.position.y = height/2 + 0.05;  // Sits ON ground


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

MATERIALS — ⚠️ These return MATERIALS, NOT meshes! Use with H.mesh(geometry, material)
  ❌ WRONG: const glow = H.glow(0xff0000); glow.position.set(0,1,0);  // ERROR! Materials have no position
  ✅ RIGHT: const mesh = H.mesh(new THREE.SphereGeometry(0.1), H.glow(0xff0000)); mesh.position.set(0,1,0);

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
  H.lowPoly(color)  // Flat shading, matte stylized (MeshLambertMaterial)
  H.lowPolyShiny(color, {shininess, specular})  // Flat shading with shine (MeshPhongMaterial) - Yakudoo/Aviator style
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

RPG ITEMS — ✅ These return THREE.Group/Mesh - you CAN set .position, .scale, .rotation
  ✅ const chest = H.chest({open: true}); chest.position.set(0, 0.1, 0); root.add(chest);
  ✅ const gem = H.gemstone({color: 0xff0000}); gem.position.set(0.2, 0.3, 0); root.add(gem);

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

PRODUCTION QUALITY REQUIREMENTS (applies to ALL approaches):
- NEVER use plain/default materials (gray, white, flat color)
- ALWAYS use MeshPhysicalMaterial with proper properties (metalness, roughness, clearcoat, emissive)
- Objects need DETAIL: bevels, sub-components, visual interest
- Add appropriate lighting (PointLight, SpotLight) to enhance the scene
- Consider adding particles/effects for magic, fire, sparkle, etc.
- A "sword" needs blade + guard + handle + pommel, not just a rectangle
- A "gem" needs facets and glow, not just a colored sphere

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
mesh.position.y = 0.25;  // Slightly above ground
mesh.scale.set(0.4, 0.4, 0.4);  // Fit within 1x1 footprint
mesh.castShadow = true;
root.add(mesh);

// Custom shapes with ExtrudeGeometry (scaled down)
const shape = new THREE.Shape();
shape.moveTo(0, 0);
shape.lineTo(0.4, 0);
shape.lineTo(0.2, 0.4);
shape.closePath();
const extrudeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true });

// Curves (compact)
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.3, 0.2, 0),
  new THREE.Vector3(0, 0.5, 0),
  new THREE.Vector3(0.3, 0.2, 0)
]);
const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.05, 8);

// Animation
addUpdateCallback(({deltaTime, time}) => {
  mesh.rotation.y += deltaTime;
  mesh.position.y = 0.25 + Math.sin(time * 2) * 0.05;
});

════════════════════════════════════════════════════════════════════
════════════════════════════════════════════════════════════════════
CRAFTSMANSHIP REFERENCE — How to build beautiful objects (like H.chest)
════════════════════════════════════════════════════════════════════

The best 3D objects follow this pattern (10-15 meshes, not 50+):

1. GROUP CONTAINER: const g = new THREE.Group();
2. DEFINE MATERIALS with proper MeshPhysicalMaterial settings:
   - Wood: roughness: 0.75, metalness: 0
   - Metal: metalness: 0.9, roughness: 0.3
   - Gems: Use H.gem(color) material (has built-in glow + bloom)
3. MAIN BODY: Primary shape(s)
4. SUB-COMPONENTS: Parts that make it recognizable
   - A chest: base + curved lid + bands + lock + studs
   - A sword: blade + guard + handle + pommel
5. DECORATIVE DETAILS: Small touches (studs, trim, gems)
6. SHADOWS: castShadow = true on all meshes
7. ADD TO ROOT: root.add(g);

ENHANCED RENDERING TIPS (from top CodePen Three.js examples):

LOW-POLY STYLIZED (Yakudoo/Aviator style):
- Use H.lowPoly(color) for matte look or H.lowPolyShiny(color) for slight shine
- Build characters from primitives: BoxGeometry, CylinderGeometry, SphereGeometry
- Vibrant, saturated colors: 0xff6b6b (coral), 0x4ecdc4 (teal), 0xffe66d (yellow)

GLOWING/MAGIC EFFECTS:
- H.glow(color) material for emissive surfaces that bloom
- H.light(color, 1.5, 2) near glowing parts enhances bloom effect
- For gems: H.gem(color, {glow: 0.6}) for sparkly gem with glow

PROFESSIONAL GEOMETRY:
- CURVED shapes: CylinderGeometry, TorusGeometry, SphereGeometry, LatheGeometry
- TAPERED forms: ConeGeometry, different top/bottom radii on cylinders
- MERGED primitives: Build complex shapes from multiple simple ones

POLISH:
- Subtle animation: addUpdateCallback for rotation, floating, pulsing
- Particles: H.sparks, H.dust for atmosphere
- Proper proportions: thicker bases, variation in sizes

════════════════════════════════════════════════════════════════════
COMPLETE EXAMPLES (all fit within 1x1 footprint, positioned ABOVE ground y >= 0)
════════════════════════════════════════════════════════════════════

EXAMPLE A — Magic Sword with Glow (using helpers)
─────────────────────────────────────────
const sword = H.sword({
  bladeColor: 0xccccff,
  handleColor: 0x4a3728,
  guardColor: 0xffd700,
  bladeLength: 0.6,
  lowPoly: false
});
sword.rotation.z = -0.3;  // Slight tilt
sword.scale.set(0.7, 0.7, 0.7);
root.add(sword);  // Already positioned above ground

// Add glow light near blade for bloom effect
const glow = H.light(0x6688ff, 1.5, 2);
glow.position.set(0, 0.6, 0);
root.add(glow);

// Magic particles
const fx = H.sparks(20, { color: 0x88ccff, spread: 0.2, baseY: 0.2, maxY: 0.8 });
root.add(fx);

EXAMPLE B — Crystal Cluster (hybrid approach, fits in 1x1)
─────────────────────────────────────────
const base = new THREE.Mesh(
  new THREE.CylinderGeometry(0.35, 0.4, 0.1, 8),
  H.matte(0x333344)
);
base.position.y = 0.15;
root.add(base);

for (let i = 0; i < 5; i++) {
  const crystal = H.crystal({
    color: [0x9966ff, 0xff66aa, 0x66ffff][i % 3],
    height: 0.25 + Math.random() * 0.3,
    radius: 0.05 + Math.random() * 0.06,
    glow: 0.4
  });
  const angle = (i / 5) * Math.PI * 2;
  const r = 0.12 + Math.random() * 0.15;
  crystal.position.set(Math.cos(angle) * r, 0.2, Math.sin(angle) * r);
  crystal.rotation.set(Math.random() * 0.3, 0, Math.random() * 0.3);
  root.add(crystal);
}

root.add(H.dust(30, { color: 0xccbbff, spread: 0.5 }));
root.add(H.light(0x9966ff, 1.2, 2));

EXAMPLE C — Crafted Object from Scratch (raw Three.js, chest-quality)
─────────────────────────────────────────
// This shows the PATTERN that makes H.chest look great:
const g = new THREE.Group();

// 1. Define materials FIRST
const woodMat = new THREE.MeshPhysicalMaterial({ color: 0x6b4423, roughness: 0.75 });
const metalMat = new THREE.MeshPhysicalMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.3 });

// 2. Main body
const w = 0.5, h = 0.3, d = 0.35;
const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat);
base.position.y = h/2;
base.castShadow = true;
g.add(base);

// 3. Sub-component (curved lid)
const lidGeo = new THREE.CylinderGeometry(d/2, d/2, w, 16, 1, false, 0, Math.PI);
lidGeo.rotateZ(Math.PI/2);
const lid = new THREE.Mesh(lidGeo, woodMat);
lid.position.y = h;
lid.castShadow = true;
g.add(lid);

// 4. Details (metal bands)
const band = new THREE.Mesh(new THREE.BoxGeometry(w+0.02, 0.04, d+0.02), metalMat);
band.position.y = h/3;
band.castShadow = true;
g.add(band);

// 5. Decorative studs
[[w/2, d/2], [-w/2, d/2], [w/2, -d/2], [-w/2, -d/2]].forEach(([x, z]) => {
  const stud = new THREE.Mesh(new THREE.SphereGeometry(0.025), metalMat);
  stud.position.set(x*0.95, 0.03, z*0.95);
  stud.castShadow = true;
  g.add(stud);
});

g.position.y = 0.1;
root.add(g);

EXAMPLE D — Using H.chest with Treasure (easiest approach)
─────────────────────────────────────────
const chest = H.chest({ open: true, woodColor: 0x6b4423, metalColor: 0xffd700 });
chest.position.y = 0.1;
chest.scale.set(0.6, 0.6, 0.6);
root.add(chest);

// Floating coins using raw Three.js
const coins = [];
const coinGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
const coinMat = H.metal(0xffd700, { roughness: 0.2 });

for (let i = 0; i < 8; i++) {
  const coin = new THREE.Mesh(coinGeo, coinMat);
  coin.rotation.x = Math.PI / 2;
  coin.userData.phase = i * 0.8;
  coin.userData.baseY = 0.5 + Math.random() * 0.3;
  coins.push(coin);
  root.add(coin);
}

// Colorful gems - use H.gemstone (returns Group) or H.mesh with H.gem material
const gemColors = [0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0x00ffff];
for (let i = 0; i < 5; i++) {
  // Option 1: Use H.gemstone helper (recommended - returns positionable Group)
  const gem = H.gemstone({ color: gemColors[i], size: 0.08 });
  gem.position.set((Math.random() - 0.5) * 0.3, 0.4 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2);
  root.add(gem);
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
- "Cannot read properties of undefined (reading 'set')" → Something returned undefined. Check:
  1. Material helpers (H.glow, H.gem, H.metal, etc.) return MATERIALS, not meshes!
     ❌ WRONG: const glow = H.glow(0xff0000); glow.position.set(0,1,0);
     ✅ RIGHT: const mesh = H.mesh(new THREE.SphereGeometry(0.1), H.glow(0xff0000)); mesh.position.set(0,1,0);
  2. Use H.gemstone({color}) for positioned gems, not H.gem(color) which is just a material
- Syntax errors → Fix the syntax

OUTPUT ONLY THE FIXED JAVASCRIPT CODE. No markdown, no explanation.
NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write the COMPLETE fixed code.`;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MULTI-PASS PROMPT BUILDERS
    // ═══════════════════════════════════════════════════════════════════════

    // SPECIALIZED MODE: Structure → Details → Polish (3 passes)
    const buildSpecializedPrompts = (userText) => ({
      pass1_structure: `You are an expert Three.js developer. Create the BASIC STRUCTURE for:

"${userText}"

RULES:
- OUTPUT RAW JAVASCRIPT ONLY — No markdown, no \`\`\`, no JSON
- NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write COMPLETE code.
- ALL objects must have y > 0 (above ground plane)
- ALL objects must be added to \`root\` (not scene)
- ALWAYS capture helper returns: const x = H.something({...});

CONTEXT: THREE, root, H/helpers, addUpdateCallback(fn)

THIS PASS: Focus ONLY on basic geometry and structure:
- Main shapes and forms (boxes, cylinders, spheres)
- Basic positioning and scale
- Simple materials (H.matte, H.metal)
- NO particles, NO complex materials, NO animations yet

HELPERS: H.mesh(geometry, material), H.matte(color), H.metal(color), H.glass(color)

Generate the basic structure. Output raw JavaScript only:`,

      pass2_details: (
        previousCode
      ) => `You are an expert Three.js developer. ENHANCE this 3D object with details.

ORIGINAL REQUEST: "${userText}"

CURRENT CODE:
${previousCode}

THIS PASS: Add DETAILS and MATERIALS:
- Replace simple materials with rich ones (H.gem, H.glass, H.glow, H.liquid)
- Add decorative elements (trim, studs, engravings)
- Add small detail meshes
- Improve material properties (metalness, roughness, emissive)

AVAILABLE MATERIALS:
H.metal(color, {roughness, glow, clearcoat}), H.glass(color, {transmission}),
H.gem(color, {glow}), H.glow(color, {intensity}), H.liquid(color, {glow}),
H.fire(), H.ice(), H.lava(), H.leather(color), H.velvet(color)

RULES:
- Keep ALL existing geometry and structure
- ONLY add materials and detail meshes
- NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write COMPLETE code.
- Output the COMPLETE enhanced code
- Raw JavaScript only, no markdown

Output the enhanced code:`,

      pass3_polish: (
        previousCode
      ) => `You are an expert Three.js developer. POLISH this 3D object with effects.

ORIGINAL REQUEST: "${userText}"

CURRENT CODE:
${previousCode}

THIS PASS: Add POLISH and EFFECTS:
- Add particles (H.sparks, H.bubbles, H.dust, H.smoke)
- Add lights (H.light, H.spot)
- Add animations with addUpdateCallback
- Fine-tune positions and visual balance

AVAILABLE EFFECTS:
H.sparks(count, {color, spread}), H.bubbles(count, {color}),
H.dust(count, {color}), H.smoke(count), H.particles(count, {color, size})
H.light(color, intensity, distance), H.spot(color, intensity)

ANIMATION EXAMPLE:
addUpdateCallback(({deltaTime, time}) => {
  mesh.rotation.y += deltaTime;
  material.emissiveIntensity = 1 + Math.sin(time * 2) * 0.3;
});

RULES:
- Keep ALL existing code
- ADD particles, lights, and animations
- NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write COMPLETE code.
- Output the COMPLETE polished code
- Raw JavaScript only, no markdown

Output the final polished code:`,
    });

    // CRITIQUE MODE: Generate → Review & Improve (2 passes)
    const buildCritiquePrompts = (userText) => ({
      pass1_generate: `You are an expert Three.js developer. Generate a 3D object for:

"${userText}"

RULES:
- OUTPUT RAW JAVASCRIPT ONLY — No markdown, no \`\`\`, no JSON
- NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write COMPLETE code.
- ALL objects must have y > 0 (above ground plane)
- ALL objects must be added to \`root\` (not scene)
- ALWAYS capture helper returns: const x = H.something({...});

CONTEXT: THREE, root, H/helpers, addUpdateCallback(fn)

HELPERS:
Materials: H.metal, H.glass, H.gem, H.matte, H.glow, H.liquid, H.fire, H.ice, H.lava
Particles: H.sparks, H.bubbles, H.dust, H.smoke, H.particles
Lights: H.light, H.spot
Items: H.crystal, H.coin, H.heart, H.star, H.key, H.sword, H.shield, H.chest, H.crown

Generate a complete 3D object with materials, particles, lights, and animation.
Output raw JavaScript only:`,

      pass2_critique: (
        previousCode
      ) => `You are an expert Three.js code reviewer. CRITIQUE and IMPROVE this code.

ORIGINAL REQUEST: "${userText}"

CURRENT CODE:
${previousCode}

REVIEW CHECKLIST:
1. Does it match the user's request? If not, fix it.
2. Are there enough details? Add more meshes if sparse.
3. Are materials interesting? Upgrade boring materials.
4. Are there particles? Add if missing.
5. Is there lighting? Add point lights for drama.
6. Is there animation? Add subtle movement.
7. Is the scale appropriate? Objects must fit within 1x1 footprint, height 0.3-1.5 units.
8. Is it visually balanced? Center and arrange properly.

IMPROVEMENTS TO MAKE:
- Add at least 2 more detail meshes
- Ensure at least one emissive/glowing element
- Add particles if none exist
- Add animation if static
- Improve material variety

OUTPUT: The COMPLETE improved code (not a diff).
NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write COMPLETE code.
Raw JavaScript only, no markdown, no explanations:`,
    });

    // ADDITIVE MODE: Base → Accessories → Effects (3 passes)
    const buildAdditivePrompts = (userText) => ({
      pass1_base: `You are an expert Three.js developer. Create the BASE OBJECT for:

"${userText}"

RULES:
- OUTPUT RAW JAVASCRIPT ONLY — No markdown, no \`\`\`
- NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write COMPLETE code.
- ALL objects must have y > 0 (above ground plane)
- ALL objects must be added to \`root\` (not scene)

THIS PASS: Create ONLY the main/central object:
- The primary shape that defines what this is
- 3-5 meshes maximum for the core form
- Basic but appropriate materials
- NO accessories, NO effects, NO particles

CONTEXT: THREE, root, H/helpers

Example for "treasure chest": Just the chest box and lid, nothing else.
Example for "magic sword": Just the blade and handle, nothing else.

Generate the base object. Raw JavaScript only:`,

      pass2_accessories: (
        previousCode
      ) => `You are an expert Three.js developer. ADD ACCESSORIES to this object.

ORIGINAL REQUEST: "${userText}"

BASE OBJECT CODE:
${previousCode}

THIS PASS: Add ACCESSORIES and DECORATIONS:
- Items that complement the main object
- Decorative elements (gems, studs, trim, engravings)
- Supporting props (stand, base, holder)
- Small related items around/on the main object

EXAMPLES:
- Treasure chest → Add coins, gems, jewelry around it
- Magic sword → Add floating runes, gem in pommel
- Potion → Add cork, label, bubbles inside
- Crown → Add gems in each point, velvet cushion

RULES:
- Keep ALL existing base code unchanged
- ADD 5-10 new accessory meshes
- Position accessories relative to the base
- Use complementary materials
- NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write COMPLETE code.

Output the COMPLETE code with accessories. Raw JavaScript only:`,

      pass3_effects: (
        previousCode
      ) => `You are an expert Three.js developer. ADD EFFECTS to complete this object.

ORIGINAL REQUEST: "${userText}"

CURRENT CODE:
${previousCode}

THIS PASS: Add MAGICAL EFFECTS to bring it to life:
- Particle systems (sparks, dust, bubbles, smoke)
- Dynamic lighting (point lights, spotlights)
- Animations (rotation, floating, pulsing, glowing)
- Atmospheric effects

AVAILABLE EFFECTS:
H.sparks(count, {color, spread, baseY, maxY})
H.bubbles(count, {color, spread, baseY, height})
H.dust(count, {color, spread, size})
H.smoke(count, {color, spread})
H.light(color, intensity, distance)
H.spot(color, intensity, {angle, penumbra})

ANIMATION:
addUpdateCallback(({deltaTime, time}) => {
  // Rotate, pulse, float, etc.
});

RULES:
- Keep ALL existing code unchanged
- ADD particles, lights, and animations
- NEVER OMIT CODE — No "// omitted", "// ...", or placeholders. Write COMPLETE code.
- Make it feel magical/alive
- At least 2 particle systems
- At least 1 animated element

Output the COMPLETE final code. Raw JavaScript only:`,
    });

    // EXTREME MODE: Craftsman-quality generation (like H.chest helper)
    const buildExtremePrompt = (userText) => {
      // Reference code showing the H.chest helper style - QUALITY over QUANTITY
      const referenceCode = `// QUALITY REFERENCE - The H.chest helper (our best object):
// Only ~10 meshes, but each is WELL-CRAFTED with proper materials and positioning

const g = new THREE.Group();

// Define materials FIRST with proper MeshPhysicalMaterial settings
const woodMat = new THREE.MeshPhysicalMaterial({
  color: 0x6b4423,  // Rich brown
  roughness: 0.75,  // Wood is rough
  metalness: 0.0,   // Wood is not metallic
});
const metalMat = new THREE.MeshPhysicalMaterial({
  color: 0xffd700,  // Gold
  metalness: 0.9,   // Very metallic
  roughness: 0.3,   // Slightly polished
});

const w = 0.5, h = 0.3, d = 0.35;

// MAIN BODY - Base box
const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), woodMat);
base.position.y = h / 2;
base.castShadow = true;
g.add(base);

// LID - Curved cylinder (half)
const lidGeo = new THREE.CylinderGeometry(d/2, d/2, w, 16, 1, false, 0, Math.PI);
lidGeo.rotateZ(Math.PI / 2);
const lid = new THREE.Mesh(lidGeo, woodMat);
lid.position.y = h;
lid.castShadow = true;
g.add(lid);

// METAL BANDS - Horizontal straps
const band1 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02), metalMat);
band1.position.y = h / 3;
band1.castShadow = true;
g.add(band1);
const band2 = band1.clone();
band2.position.y = (2 * h) / 3;
g.add(band2);

// LOCK - Front clasp
const lock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.03), metalMat);
lock.position.set(0, h, d/2 + 0.02);
lock.castShadow = true;
g.add(lock);

// CORNER STUDS - Decorative details
const corners = [[w/2, 0, d/2], [-w/2, 0, d/2], [w/2, 0, -d/2], [-w/2, 0, -d/2]];
corners.forEach(([x, y, z]) => {
  const stud = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), metalMat);
  stud.position.set(x * 0.95, y + 0.03, z * 0.95);
  stud.castShadow = true;
  g.add(stud);
});

root.add(g);`;

      return `You are a CRAFTSMAN creating hand-crafted 3D objects like a skilled artisan.

Generate a beautifully-crafted 3D object for: "${userText}"

════════════════════════════════════════════════════════════════════
QUALITY REFERENCE - Study this chest code carefully:
════════════════════════════════════════════════════════════════════

${referenceCode}

════════════════════════════════════════════════════════════════════
CRAFTSMANSHIP PRINCIPLES (what makes the chest beautiful):
════════════════════════════════════════════════════════════════════

1. LOGICAL SUB-COMPONENTS: Break the object into meaningful parts
   - A chest has: base, lid, bands, lock, corner studs
   - A sword has: blade, guard, handle, pommel, possibly gems
   - A potion has: bottle, liquid, cork, label, glow effect

2. PROPER MATERIALS: Use MeshPhysicalMaterial with correct settings
   - Wood: roughness: 0.7-0.8, metalness: 0
   - Metal: metalness: 0.8-1.0, roughness: 0.2-0.4
   - Gems: Use H.gem(color) with glow
   - Glass: transmission: 0.9, roughness: 0.1

3. RICH COLORS: Not generic, but specific
   - Gold: 0xffd700 (not yellow 0xffff00)
   - Wood: 0x6b4423 or 0x8b4513 (not generic brown)
   - Ruby: 0xcc0033, Emerald: 0x00cc66, Sapphire: 0x0066cc

4. DECORATIVE DETAILS: Small touches that add polish
   - Corner studs, rivets, trim pieces
   - Beveled edges (use bevel in ExtrudeGeometry)
   - Patterns created with loops

5. PROPER SHADOWS: castShadow = true on all meshes

6. GROUP STRUCTURE: Use THREE.Group to organize parts

════════════════════════════════════════════════════════════════════
MESH COUNT GUIDELINE: 8-20 meshes (quality over quantity!)
════════════════════════════════════════════════════════════════════

DO NOT try to create 50+ meshes. Focus on making 10-15 PERFECT meshes.

════════════════════════════════════════════════════════════════════
AVAILABLE HELPERS
════════════════════════════════════════════════════════════════════

Materials (return Material, use with H.mesh or THREE.Mesh):
  H.metal(color, {roughness, glow, clearcoat})
  H.glass(color, {roughness, transmission, ior})
  H.gem(color, {glow, ior})
  H.matte(color, {roughness})
  H.glow(color, {intensity})

Utility:
  H.mesh(geometry, material) — Creates mesh with shadows enabled
  H.light(color, intensity, distance) — PointLight
  H.sparks(count, {color, spread}) — Particle effects

RULES:
- OUTPUT RAW JAVASCRIPT ONLY — No markdown, no \`\`\`
- NEVER OMIT CODE — Write COMPLETE code
- ALL objects y > 0 (above ground)
- Add to \`root\` not scene
- ALWAYS capture returns: const x = H.mesh(...);

════════════════════════════════════════════════════════════════════
NOW CRAFT A BEAUTIFUL OBJECT FOR: "${userText}"
════════════════════════════════════════════════════════════════════

Think like an artisan. Quality over quantity. Write complete code.`;
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
      maxAttempts,
      passLabel = ""
    ) => {
      const label = passLabel ? `[${passLabel}] ` : "";
      let rawCode = null;
      let normalizedCode = null;
      let lastError = null;

      // Ensure code generation model is loaded (may have switched to vision model)
      await loadModelForGeneration();

      console.log(`${label}Starting generation...`);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (attempt === 1) {
            lastStatus.value = passLabel
              ? `${passLabel}: Generating...`
              : `Generating...`;
            rawCode = await callLLM(initialPrompt);
          } else {
            lastStatus.value = passLabel
              ? `${passLabel}: Healing...`
              : `Healing...`;
            const fixPrompt = buildErrorFixPrompt(
              rawCode,
              lastError,
              userDescription
            );
            rawCode = await callLLM(fixPrompt);
          }

          normalizedCode = normalizeLLMCode(rawCode);
          console.log(
            `${label}Attempt ${attempt} - Normalized code:`,
            normalizedCode.substring(0, 500)
          );

          lastStatus.value = passLabel
            ? `${passLabel}: Validating...`
            : `Validating...`;
          const validationError = await validateCode(normalizedCode);

          if (!validationError) {
            console.log(`${label}✅ Code valid on attempt ${attempt}`);
            return normalizedCode;
          }

          lastError = validationError;
          console.warn(`${label}Attempt ${attempt} failed:`, validationError);
        } catch (e) {
          lastError = e.message;
          console.error(`${label}Attempt ${attempt} error:`, e);
        }
      }

      console.error(
        `${label}All ${maxAttempts} attempts failed. Last error:`,
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
        scrollToTop();
      } catch (e) {
        console.error("Copy failed:", e);
      }
    };

    const handleSuccess = (data) => console.log("Generation success:", data);
    const handleError = (data) => console.error("Generation error:", data);

    const removeInference = async (originalIndex) => {
      await removeObjectInference(originalIndex);
    };

    const applyInference = async (item) => {
      if (!item.code || !threeViewer.value) return;
      try {
        await threeViewer.value.applyModuleCode(item.code, "replace");
      } catch (err) {
        console.error("Failed to apply inference:", err);
      }
    };

    const regenerateFromInference = async (item) => {
      if (!item.prompt) return;
      // Set the prompt from the inference
      form.prompt = item.prompt;
      // Optionally set the same generation mode
      if (
        item.mode &&
        generationModes.value.some((m) => m.value === item.mode)
      ) {
        generationMode.value = item.mode;
      }
      // Trigger generation
      await onSubmit();
    };

    // ═══════════════════════════════════════════════════════════════════════
    // HISTORY MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════
    const clearHistory = async () => {
      await clearObjectInferences();
      hasCopy.length = 0;
    };

    const exportHistory = () => {
      if (objectInferences.value.length === 0) return;
      const data = JSON.stringify(objectInferences.value, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-3d-history-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const importHistory = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            // Add each imported item to the store
            for (const item of data) {
              await addObjectInference(item.prompt, item.code, {
                mode: item.mode,
                screenshots: item.screenshots,
                visionVerified: item.visionVerified,
                success: item.success,
                title: item.title,
                notes: item.notes,
              });
            }
            hasCopy.length = objectInferences.value.length;
            hasCopy.fill(false);
          }
        } catch (err) {
          console.error("Failed to import history:", err);
        }
      };
      input.click();
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MODEL MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════
    const isModelAvailable = async (filename) => {
      const available = await window.electronAPI.checkModel(filename);
      isModel.value = available;
      return available;
    };

    const downloadModel = async (url, filename) => {
      if (!url || !filename) return;

      downloadProgress.value = 0;

      window.electronAPI.onDownloadProgress((e, data) => {
        if (data.filename === currentModel.value.filename) {
          downloadProgress.value = Math.round(data.percent * 100);
        }
      });

      const success = await window.electronAPI.downloadModel(url, filename);

      downloadProgress.value = 0;

      if (success) {
        isModel.value = true;
      }
    };

    const deleteModel = async (filename) => {
      if (!filename) return;
      const success = await window.electronAPI.deleteModel(filename);

      if (success) {
        isModel.value = false;
        isModelLoaded.value = false;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MODEL LOADING
    // ═══════════════════════════════════════════════════════════════════════
    const loadModelForGeneration = async () => {
      if (isModelLoaded.value) return;

      lastStatus.value = "Loading Code Model...";
      try {
        // Pass full model object including activeParameters and isMoE for proper context calculation
        await window.electronAPI.loadModel({
          filename: currentModel.value.filename,
          parameters: currentModel.value.parameters,
          activeParameters: currentModel.value.activeParameters,
          isMoE: currentModel.value.isMoE,
          context: currentModel.value.context,
        });
        isModelLoaded.value = true;
        // Invalidate vision model state since we switched to code model
        visionModelLoaded.value = false;
        lastStatus.value = "Let's go!";
        await new Promise((r) => setTimeout(r, 500));
      } catch (error) {
        throw new Error(`Model loading failed: ${error.message}`);
      }
    };

    // Unload the coding model to free memory for vision model
    const unloadCodeModel = async () => {
      if (!isModelLoaded.value) return;

      console.log("[Generative3D] Unloading code model to free memory for vision...");
      try {
        await window.electronAPI.unloadModel();
        isModelLoaded.value = false;
        console.log("[Generative3D] Code model unloaded successfully");
      } catch (error) {
        console.warn("[Generative3D] Failed to unload code model:", error);
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
    // ═══════════════════════════════════════════════════════════════════════
    // VISION-INTEGRATED GENERATION HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    // Run vision check and apply targeted fix if needed
    const runVisionCheckAndFix = async (
      code,
      prompt,
      phaseLabel,
      maxFixes = 2,
      isDemo = false
    ) => {
      const viewer = threeViewer.value;
      if (!viewer) return { code, verified: true, skipped: true };

      // Check if vision is supported
      if (!visionSupported.value) {
        console.log(`[Vision:${phaseLabel}] Vision verification skipped - not yet supported`);
        return { code, verified: true, skipped: true };
      }

      let currentCode = code;

      for (let fix = 1; fix <= maxFixes; fix++) {
        lastStatus.value = `${phaseLabel}: Vision check ${fix}/${maxFixes}...`;
        await new Promise((r) => setTimeout(r, 500)); // Let render settle

        try {
          const feedback = await getVisionFeedback(prompt, phaseLabel, isDemo);
          console.log(`[Vision:${phaseLabel}] Result:`, feedback);

          // If vision was skipped, return success
          if (feedback.skipped) {
            console.log(`[Vision:${phaseLabel}] Vision skipped - returning success`);
            return { code: currentCode, verified: true, skipped: true };
          }

          if (feedback.matches) {
            console.log(`[Vision:${phaseLabel}] ✓ Verified!`);
            return { code: currentCode, verified: true, screenshots: feedback.screenshots };
          }

          // Try targeted fix first if we have specific missing elements
          if (feedback.missing_elements?.length > 0 && fix < maxFixes) {
            console.log(`[Vision:${phaseLabel}] Attempting targeted fix...`);
            lastStatus.value = `${phaseLabel}: Adding missing elements...`;

            const patchPrompt = buildPatchPrompt(
              prompt,
              feedback.missing_elements,
              currentCode
            );

            const patchCode = await generateWithRetry(
              patchPrompt,
              prompt,
              2,
              `${phaseLabel} Patch`
            );

            if (patchCode) {
              // Merge patch with existing code - patch is wrapped in IIFE to avoid variable collisions
              const innerPatch = extractInnerCode(patchCode);
              const innerCurrent = extractInnerCode(currentCode);
              // Wrap patch in IIFE to create separate scope and avoid "already declared" errors
              const wrappedPatch = `\n\n// === Vision Patch: Added elements ===\n(() => {\n${innerPatch}\n})();`;
              currentCode = wrapWithModule(innerCurrent + wrappedPatch);
              await viewer.applyModuleCode(currentCode, "replace");
              continue; // Check again
            }
          }

          // Fall back to full regeneration
          console.log(`[Vision:${phaseLabel}] Full regeneration with feedback...`);
          lastStatus.value = `${phaseLabel}: Regenerating...`;

          const feedbackPrompt = buildFeedbackPrompt(
            prompt,
            feedback.feedback,
            feedback.missing_elements || [],
            currentCode
          );

          const improvedCode = await generateWithRetry(
            feedbackPrompt,
            prompt,
            MAX_RETRY_ATTEMPTS,
            `${phaseLabel} Fix`
          );

          if (improvedCode) {
            currentCode = improvedCode;
            await viewer.applyModuleCode(currentCode, "replace");
          } else {
            console.log(`[Vision:${phaseLabel}] Fix failed, keeping current`);
            return { code: currentCode, verified: false, screenshots: feedback.screenshots };
          }
        } catch (visionErr) {
          console.error(`[Vision:${phaseLabel}] Error:`, visionErr);
          return { code: currentCode, verified: false };
        }
      }

      // Final check after all fixes
      try {
        const finalFeedback = await getVisionFeedback(prompt, phaseLabel, isDemo);
        return {
          code: currentCode,
          verified: finalFeedback.matches,
          screenshots: finalFeedback.screenshots,
        };
      } catch {
        return { code: currentCode, verified: false };
      }
    };

    // Wrap inner code with module structure
    const wrapWithModule = (innerCode) => {
      return `// Generated 3D Object
${innerCode}`;
    };

    const onSubmit = async (isDemo = false) => {
      if (!form.prompt.trim()) return;
      // Allow demo generation even without access
      if (!isDemo && !canSubmitWithAccess.value) return;

      // Check if model is downloaded
      if (!isModel.value) {
        console.error("❌ Generation error: Model not downloaded");
        lastStatus.value = "Please download the AI model first";
        return;
      }

      // Check vision model - required for all generation
      if (!visionModelReady.value) {
        console.error("❌ Generation error: Vision model not downloaded");
        lastStatus.value = "Please download the Vision model first";
        return;
      }

      isLoading.value = true;
      lastStatus.value = "Preparing...";

      // Clear feedback history for new generation
      feedbackHistory.value = [];

      const inference = {
        id: uuid(),
        prompt: form.prompt,
        timestamp: new Date().toLocaleTimeString(),
        success: false,
        title: "",
        notes: "",
        code: "",
        mode: generationMode.value,
        screenshots: [], // Multi-angle screenshots
        visionVerified: false,
      };

      try {
        await loadModelForGeneration();
        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        let finalCode = null;
        let finalScreenshots = [];
        let verified = false;
        const mode = generationMode.value;
        const modeConfig = generationModes.value.find((m) => m.id === mode);
        const visionChecks = modeConfig?.visionChecks || 1;

        if (mode === "normal") {
          // ═══════════════════════════════════════════════════════════════
          // NORMAL MODE: Generate → Vision verify → Fix if needed (up to 3 fixes)
          // ═══════════════════════════════════════════════════════════════
          console.log("═══════════════════════════════════════════════════════");
          console.log("NORMAL MODE: Generate with vision verification");
          console.log("═══════════════════════════════════════════════════════");

          lastStatus.value = "Generating...";
          const llmPrompt = buildObjectPrompt(form.prompt);
          let code = await generateWithRetry(llmPrompt, form.prompt, MAX_RETRY_ATTEMPTS);
          if (!code) throw new Error("Failed to generate code");

          await viewer.applyModuleCode(code, "replace");
          const result = await runVisionCheckAndFix(code, form.prompt, "Normal", 3, isDemo);
          finalCode = result.code;
          verified = result.verified;
          finalScreenshots = result.screenshots || [];

        } else if (mode === "craftsman") {
          // ═══════════════════════════════════════════════════════════════
          // CRAFTSMAN MODE: High-quality prompt + more vision iterations (up to 5)
          // ═══════════════════════════════════════════════════════════════
          console.log("═══════════════════════════════════════════════════════");
          console.log("CRAFTSMAN MODE: High-quality generation like H.chest");
          console.log("═══════════════════════════════════════════════════════");

          lastStatus.value = "Crafting...";
          const llmPrompt = buildExtremePrompt(form.prompt);
          let code = await generateWithRetry(llmPrompt, form.prompt, MAX_RETRY_ATTEMPTS, "Craftsman");
          if (!code) throw new Error("Failed to generate code");

          await viewer.applyModuleCode(code, "replace");
          const result = await runVisionCheckAndFix(code, form.prompt, "Craftsman", 5, isDemo);
          finalCode = result.code;
          verified = result.verified;
          finalScreenshots = result.screenshots || [];

        } else {
          // Fallback to normal mode for any unknown mode
          console.log("Unknown mode, falling back to normal");
          lastStatus.value = "Generating...";
          const llmPrompt = buildObjectPrompt(form.prompt);
          let code = await generateWithRetry(llmPrompt, form.prompt, MAX_RETRY_ATTEMPTS);
          if (!code) throw new Error("Failed to generate code");
          await viewer.applyModuleCode(code, "replace");
          const result = await runVisionCheckAndFix(code, form.prompt, "Normal", 3, isDemo);
          finalCode = result.code;
          verified = result.verified;
          finalScreenshots = result.screenshots || [];
        }

        if (!finalCode) throw new Error("Failed to generate valid code");

        // Capture final multi-angle screenshots if we don't have them
        if (!finalScreenshots || finalScreenshots.length === 0) {
          try {
            finalScreenshots = captureMultiAngleScreenshots(false); // Keep HDR for final images
          } catch (e) {
            console.error("Failed to capture final screenshots:", e);
          }
        }

        lastStatus.value = verified ? "✓ Vision Verified!" : "Crafted!";
        // Add to shared inference store - ensure plain serializable data
        // Use JSON.parse/stringify to strip any non-serializable properties (Vue proxies, functions, etc.)
        const serializableScreenshots = (finalScreenshots || []).map(s => ({
          name: String(s.name || ""),
          label: String(s.label || ""),
          azimuth: Number(s.azimuth || 0),
          elevation: Number(s.elevation || 0),
          dataUrl: String(s.dataUrl || ""),
        }));
        const inferenceData = JSON.parse(JSON.stringify({
          mode: generationMode.value,
          screenshots: serializableScreenshots,
          visionVerified: verified,
          success: true,
        }));
        await addObjectInference(form.prompt, finalCode, inferenceData);
        form.prompt = "";
      } catch (e) {
        console.error("❌ Generation error:", e);
        lastStatus.value = "❌ Failed: " + e.message;
        // Try to capture screenshots even on failure
        let errorScreenshots = [];
        try {
          errorScreenshots = captureMultiAngleScreenshots(false); // Keep HDR for display
        } catch {}
        // Add failed attempt to store - ensure plain serializable data
        const serializableErrorScreenshots = (errorScreenshots || []).map(s => ({
          name: String(s.name || ""),
          label: String(s.label || ""),
          azimuth: Number(s.azimuth || 0),
          elevation: Number(s.elevation || 0),
          dataUrl: String(s.dataUrl || ""),
        }));
        const errorInferenceData = JSON.parse(JSON.stringify({
          mode: generationMode.value,
          screenshots: serializableErrorScreenshots,
          visionVerified: false,
          success: false,
          notes: String(e.message || "Unknown error"),
        }));
        await addObjectInference(form.prompt, "", errorInferenceData);
      } finally {
        isLoading.value = false;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════
    onMounted(async () => {
      // Load object inferences from shared store
      await loadObjectInferences();

      // Check if the model is already downloaded
      await isModelAvailable(currentModel.value.filename);

      // Check if vision model is available (await to get accurate initial state)
      await checkVisionModel();

      // Resume any active downloads
      resumeActiveDownloadIfAny();

      await nextTick();
      setTimeout(() => loadDefaultObject(), 500);
      // Setup scroll observer after DOM is rendered
      setTimeout(setupScrollObserver, 100);
      // Attach scroll listener for scroll-to-top button
      const container = document.querySelector(".models__deployment-install");
      if (container) {
        scrollContainer.value = container;
        container.addEventListener("scroll", handleScroll, { passive: true });
      }
    });

    onBeforeUnmount(() => {
      // Cleanup scroll observer
      if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
      }
      // Cleanup scroll listener
      if (scrollContainer.value) {
        scrollContainer.value.removeEventListener("scroll", handleScroll);
      }
      // Cleanup downloads socket
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      // Cleanup HTTP poll timer
      if (httpPollTimer) {
        clearInterval(httpPollTimer);
        httpPollTimer = null;
      }
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
      // lazy loading pagination
      paginatedInferences,
      loadMoreSentinel,
      hasMore,
      isLoadingMore,
      // scroll to top
      showScrollTop,
      scrollToTop,
      hasCopy,
      autoRotate,
      currentTime,
      currentWeather,
      lightIntensity,
      lightingPresets,
      weatherOptions,
      // Model mode
      modelMode,
      modelModes,
      // Generation mode
      generationMode,
      generationModes,
      // Vision (optional - not yet fully supported in node-llama-cpp)
      VISION_MODEL,
      visionSupported,
      visionModelReady,
      visionModelLoaded,
      visionModelDownloading,
      downloadVisionModel,
      ensureVisionModelLoaded,
      // Screenshot modal
      screenshotModal,
      openScreenshotModal,
      closeScreenshotModal,
      navigateScreenshot,
      downloadScreenshot,
      downloadAllScreenshots,
      // Bundled downloads
      needsDownload,
      isDownloading,
      downloadStatus,
      downloadAllModels,
      downloads,
      downloadTaskList,
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
      clearHistory,
      exportHistory,
      importHistory,
      applyInference,
      regenerateFromInference,
      onSubmit,
      // Access control
      accessRef,
      hasAccess,
      canSubmitWithAccess,
      onAccessChanged,
      onDemoGenerate,
      DEMO_PROMPT,
      // Model management
      currentModel,
      downloadProgress,
      isModel,
      isModelAvailable,
      downloadModel,
      deleteModel,
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
  background: url("../assets/bonzai_3d.jpg") no-repeat center center;
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
  position: relative;
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
  gap: 0.6em;
  flex-wrap: wrap;
}
.time-btn,
.weather-btn {
  width: 4.2em;
  font-size: 1em !important;
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
.mode-buttons {
  display: flex;
  gap: 0.8em;
  flex-wrap: wrap;
}
.mode-btn {
  min-width: 6em;
  font-size: 1em !important;
  font-weight: 400;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
}
.mode-btn:hover {
  color: rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.4);
  border-color: rgba(255, 255, 255, 1);
}
.mode-btn.active {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.5) !important;
  backdrop-filter: blur(64px) !important;
}
.mode-icon {
  font-size: 1.6em;
}
.mode-label {
  font-size: 0.8em;
  font-family: "Fira Sans", sans-serif;
  font-weight: 500;
  margin-top: 0.25em;
}
.mode-description {
  font-family: "Fira Sans", sans-serif;
  text-align: left !important;
}

/* Compact mode buttons */
.mode-buttons.compact {
  gap: 0.5em;
}
.mode-btn.small {
  min-width: auto;
  padding: 8px 12px;
}
.mode-btn.small .mode-icon {
  font-size: 1.2em;
}
.mode-btn.small .mode-label {
  font-size: 0.7em;
}

/* Vision Toggle Row (iOS style) */
.vision-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5em 0;
}
.vision-toggle-left {
  display: flex;
  align-items: center;
  gap: 0.75em;
}
.vision-toggle-left .vision-icon {
  font-size: 1.5em;
  color: #61378e;
}
.vision-toggle-text {
  display: flex;
  flex-direction: column;
}
.vision-toggle-subtitle {
  font-size: 0.75em;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

/* iOS Toggle Switch */
.ios-toggle {
  position: relative;
  display: inline-block;
  width: 51px;
  height: 31px;
  cursor: pointer;
}
.ios-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ios-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}
.ios-toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 31px;
  transition: 0.3s;
}
.ios-toggle-slider:before {
  position: absolute;
  content: "";
  height: 27px;
  width: 27px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  border-radius: 50%;
  transition: 0.3s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}
.ios-toggle input:checked + .ios-toggle-slider {
  background: linear-gradient(135deg, #61378e 0%, #8b5fbf 100%);
}
.ios-toggle input:checked + .ios-toggle-slider:before {
  transform: translateX(20px);
}
.ios-toggle input:disabled + .ios-toggle-slider {
  background-color: rgba(255, 255, 255, 0.1);
}

/* Vision download/iterations */
.vision-download-prompt,
.vision-download-progress {
  display: flex;
  align-items: center;
}
.vision-iterations {
  display: flex;
  align-items: center;
}
.iteration-pills {
  display: flex;
  gap: 0.5em;
}
.iteration-pill {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.iteration-pill:hover {
  border-color: rgba(255, 255, 255, 0.6);
  color: white;
}
.iteration-pill.active {
  background: linear-gradient(135deg, #61378e 0%, #8b5fbf 100%);
  border-color: transparent;
  color: white;
}

/* Strategy Info Notification */
.strategy-info {
  display: flex;
  align-items: flex-start;
  gap: 0.75em;
  padding: 1em 1.25em !important;
  background: rgba(32, 156, 238, 0.15) !important;
  border: 1px solid rgba(32, 156, 238, 0.3) !important;
}

.strategy-info .info-icon {
  font-size: 16px;
  color: #209cee;
  flex-shrink: 0;
}

.strategy-info span:last-child {
  font-size: 12px;
  line-height: 1.4;
}

/* Download List */
.download-list {
  list-style: none;
  margin: 0 0 0.5rem 0;
  padding: 0;
}
.download-list li {
  display: flex;
  align-items: center;
  padding: 0.5em 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.download-list li:last-child {
  border-bottom: none;
}
.download-list .material-symbols-outlined {
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.25em;
}
.download-item-name {
  flex: 1;
  font-weight: 500;
}
.download-item-size {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9em;
  margin-left: 1em;
}

.rotating {
  animation: rotate 1s linear infinite;
}
@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
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
  flex-direction: column;
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

/* Fade-in animation for history items */
.history-item {
  animation: fadeInUp 0.4s ease-out forwards;
  opacity: 0;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.load-more-sentinel {
  min-height: 20px;
}

/* Scroll to top button */
.scroll-to-top-btn {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(97, 55, 142, 0.9);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  z-index: 100;
  animation: fadeInUp 0.3s ease-out;
}

.scroll-to-top-btn:hover {
  background: rgba(97, 55, 142, 1);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.scroll-to-top-btn .material-symbols-outlined {
  font-size: 24px;
  border: none;
}

/* ═══════════════════════════════════════════════════════════════════════
   VISION INDICATOR
   ═══════════════════════════════════════════════════════════════════════ */
.vision-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.vision-indicator.ready {
  border-color: rgba(57, 213, 130, 0.75);
}

.vision-icon {
  color: rgba(255, 255, 255, 0.5);
}

.vision-indicator.ready .vision-icon {
  color: rgba(57, 213, 130, 1);
}

.vision-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

/* ═══════════════════════════════════════════════════════════════════════
   SCREENSHOTS PREVIEW (in history)
   ═══════════════════════════════════════════════════════════════════════ */
.screenshots-preview {
  margin: 1rem 0;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.screenshots-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.screenshot-thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
}

.screenshot-thumb:hover {
  border-color: #61378e;
  transform: scale(1.05);
}

.screenshot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.screenshot-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 2px 4px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 0.65rem;
  text-align: center;
  text-transform: uppercase;
}

.vision-verified-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  margin-top: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: linear-gradient(135deg, rgba(46, 204, 113, 0.2), rgba(39, 174, 96, 0.2));
  border: 1px solid rgba(46, 204, 113, 0.5);
  border-radius: 4px;
  color: #2ecc71;
  font-size: 0.75rem;
}

.vision-verified-badge .material-symbols-outlined {
  font-size: 14px;
}

/* ═══════════════════════════════════════════════════════════════════════
   SCREENSHOT MODAL
   ═══════════════════════════════════════════════════════════════════════ */
.screenshot-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.screenshot-modal {
  background: #1a1a2e;
  border-radius: 12px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.screenshot-modal-close {
  position: absolute;
  top: -40px;
  right: 0;
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 8px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.screenshot-modal-close:hover {
  opacity: 1;
}

.screenshot-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.screenshot-modal-header h3 {
  margin: 0;
  color: white;
  font-size: 1.1rem;
}

.screenshot-modal-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(97, 55, 142, 0.5);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-indicator {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  min-width: 50px;
  text-align: center;
}

.screenshot-modal-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  min-height: 400px;
  overflow: auto;
}

.screenshot-modal-content img {
  max-width: 100%;
  max-height: 70vh;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.screenshot-modal-footer {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
