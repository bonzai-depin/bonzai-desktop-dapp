<template>
  <div class="background"></div>

  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12">
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
                  class="button is-medium is-warning mr-5"
                  :disabled="isLoading"
                  @click="clearScene"
                  title="Clear scene"
                >
                  <span class="material-symbols-outlined mr-1 is-size-3">
                    delete_sweep
                  </span>
                  Clear
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
                Crafting...
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
                <!-- DOWNLOAD REQUIRED PANEL -->
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
                      <span class="material-symbols-outlined mr-2">
                        deployed_code
                      </span>
                      <span class="download-item-name">
                        {{ currentModel.filename }}
                      </span>
                      <span class="download-item-size">
                        {{ currentModel.filesize }}
                      </span>
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

                <!-- ACCESS REQUIREMENTS -->
                <AccessRequirements
                  ref="accessRef"
                  level="LVL5"
                  @access-changed="onAccessChanged"
                />

                <form ref="promptForm" @submit.prevent="onSubmit">
                  <textarea
                    id="prompt"
                    class="input is-large is-fullwidth"
                    placeholder="Describe a 3D object... (e.g., A mystical crystal orb with inner glow)"
                    v-model="form.prompt"
                    :disabled="isLoading || !hasAccess || !isModel"
                    @keydown.enter.exact.prevent="
                      canSubmitWithAccess && hasAccess && onSubmit()
                    "
                    style="min-height: 5em"
                  ></textarea>
                  <button
                    class="button chat is-loading is-outlined is-info is-large is-fullwidth"
                    v-if="isLoading"
                  ></button>
                </form>

                <!-- REFINE MODE -->
                <div
                  v-if="lastGeneratedCode && !isLoading"
                  class="refine-section mt-3"
                >
                  <div class="field has-addons">
                    <div class="control is-expanded">
                      <input
                        class="input is-medium"
                        v-model="refinePrompt"
                        placeholder="Refine: make it taller, add fire particles, change material to ice..."
                        :disabled="isLoading"
                        @keydown.enter.exact.prevent="onRefine"
                      />
                    </div>
                    <div class="control">
                      <button
                        class="button is-medium is-success"
                        @click="onRefine"
                        :disabled="isLoading || !refinePrompt.trim()"
                      >
                        <span class="material-symbols-outlined mr-1">tune</span>
                        Refine
                      </button>
                    </div>
                  </div>
                </div>
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
                :enablePhysics="enablePhysics"
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
                    <span class="answer__model">
                      <span class="material-symbols-outlined mr-2">neurology</span>
                      {{ item.model || 'three-js' }}
                      <span v-if="item.tokensPerSecond" class="answer__tps">
                        @ {{ item.tokensPerSecond }} tok/s
                      </span>
                    </span>
                    <span class="history-meta fira-sans-condensed-black-italic">
                      {{ item.id }}
                    </span>
                  </div>
                  <hr />
                  <p class="history-prompt">{{ item.blueprint || item.prompt }}</p>

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
                        <img
                          :src="shot.dataUrl"
                          :alt="shot.label || shot.name"
                        />
                        <span class="screenshot-label">
                          {{ shot.label || shot.name }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div v-if="!item.success" class="error-note">
                    <span class="material-symbols-outlined mr-1">error</span>
                    {{ item.notes }}
                  </div>
                  <hr />
                  <button
                    class="button is-medium is-success copy is-pulled-left p-0 pl-1 pr-1 mr-3"
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
                    class="button is-medium is-warning ml-2 is-pulled-left mr-3"
                    @click="openMint(item)"
                    :disabled="!!item.nft"
                  >
                    <span class="material-symbols-outlined mr-1">
                      {{ item.nft ? "check_circle" : "token" }}
                    </span>
                    {{ item.nft ? "Minted" : "Mint" }}
                  </button>
                  <button
                    v-if="item.success"
                    class="button is-medium is-warning ml-2 is-pulled-left mr-3"
                    @click="applyInference(item)"
                    title="Load this scene"
                  >
                    <span class="material-symbols-outlined mr-1">
                      visibility
                    </span>
                    Load
                  </button>
                  <button
                    class="button is-medium is-warning ml-2 is-pulled-left mr-3"
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
          {{ screenshotModal.currentShot?.label || "Screenshot" }}
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
            {{ screenshotModal.currentIndex + 1 }} /
            {{ screenshotModal.shots?.length || 0 }}
          </span>
          <button
            class="nav-btn"
            :disabled="
              screenshotModal.currentIndex >=
              (screenshotModal.shots?.length || 1) - 1
            "
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
        <button class="button is-success ml-2" @click="downloadAllScreenshots">
          <span class="material-symbols-outlined mr-1">folder_zip</span>
          Download All
        </button>
      </div>
    </div>
  </div>

  <!-- Mint Modal -->
  <MintModal
    v-if="mintTarget"
    :visible="!!mintTarget"
    v-bind="mintTarget"
    @close="mintTarget = null"
    @minted="onMinted"
  />
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
import MintModal from "./MintModal.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { fetchNFT3DCode } from "../services/contentNFT.service.js";
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

const skillFiles = import.meta.glob('../skills/threejs/*/SKILL.md', { as: 'raw', eager: true });
const recipeFiles = import.meta.glob('../skills/threejs/recipes/*.md', { as: 'raw', eager: true });

// Server URL for downloads
const SERVER_URL =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${SERVER_URL}/downloads`;

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

  // STEP 0: Strip reasoning/thinking tags (Qwen 3.5, DeepSeek R1, Nanbeige, etc.)
  out = out.replace(/<think>[\s\S]*?<\/think>\s*/gi, "");
  out = out.replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>\s*/gi, "");
  out = out.replace(/<think>[\s\S]*$/gi, ""); // unclosed <think> tag
  out = out.replace(/<\|thinking\|>[\s\S]*$/gi, ""); // unclosed thinking tag
  // Strip any /nothink or /think directives echoed back by the model
  out = out.replace(/^\s*\/no?think\s*/i, "");

  // STEP 1: Extract code from markdown fences (handles text before/after fences)
  const fenceMatch = out.match(/```(?:javascript|js|typescript|ts)?\s*\n([\s\S]*?)```/i);
  if (fenceMatch) {
    out = fenceMatch[1];
  } else {
    // Fallback: strip fences at boundaries only
    out = out.replace(/^```(?:javascript|js|typescript|ts)?[\r\n]*/gi, "");
    out = out.replace(/[\r\n]*```\s*$/gi, "");
  }
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
    "",
  );
  out = out.replace(/^(I'll|Let me|I will|I've)[^.]*\.\s*/gi, "");
  out = out.replace(/^(Sure|Of course|Certainly)[^.]*\.\s*/gi, "");
  out = out.replace(
    /\n\s*(This code|The above|This creates|Note:|Explanation:)[\s\S]*$/gi,
    "",
  );

  // STEP 3: Remove module syntax (the LLM sometimes adds these)
  out = out.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*/g, "");
  out = out.replace(
    /export\s+default\s+async\s+function\s*\w*\s*\([^)]*\)\s*\{/g,
    "",
  );
  out = out.replace(/export\s+default\s+function\s*\w*\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/async\s+function\s+generate\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/function\s+generate\s*\([^)]*\)\s*\{/g, "");
  out = out.replace(/export\s+default\s+/g, "");
  out = out.replace(/return\s+root\s*;?\s*$/gm, "");

  // STEP 3.5: Strip ALL declarations of wrapper-reserved variables.
  // The wrapper already declares these — any LLM redeclaration (via params, window,
  // require, destructuring, new, literal, or anything else) causes runtime errors.
  // One comprehensive pass instead of pattern-specific regexes.

  // First: strip any destructuring from params/window (catches all shapes)
  out = out.replace(/(?:const|let|var)\s*\{[^}]*\}\s*=\s*(?:params|window)\s*;?\s*/g, "");

  // Strip individual declarations of reserved names — regardless of RHS
  const WRAPPER_RESERVED = [
    "THREE", "scene", "camera", "root", "H", "helpers", "MAT", "TEX",
    "addUpdateCallback", "setObjectInfo", "physics", "CANNON",
  ];
  for (const name of WRAPPER_RESERVED) {
    out = out.replace(
      new RegExp(`(?:const|let|var)\\s+${name}\\s*=[^;\\n]*;?[ \\t]*`, "g"),
      "",
    );
  }
  // Also strip root.name assignment (wrapper sets it)
  out = out.replace(/root\.name\s*=\s*['"][^'"]*['"]\s*;?\s*/g, "");

  // STEP 4: Fix MAT/TEX/H redeclarations
  // Strip full MAT/TEX/H object redefinitions (LLM sometimes redefines the entire library)
  out = out.replace(/(?:const|let|var)?\s*MAT\s*=\s*\{[\s\S]*?\n\s*\};\s*/g, "");
  out = out.replace(/(?:const|let|var)?\s*TEX\s*=\s*\{[\s\S]*?\n\s*\};\s*/g, "");
  // Strip everything before setObjectInfo if it starts with orphaned object properties
  // (LLM sometimes generates partial object literals like "bubbles: function() {...}")
  const setObjIdx = out.indexOf("setObjectInfo");
  if (setObjIdx > 0) {
    const before = out.slice(0, setObjIdx);
    // If the code before setObjectInfo has orphaned "key: function" or "key: value," patterns
    // but no proper variable declarations, it's garbage from an object literal
    if (/^\s*\w+\s*:\s*(?:function|\{|new\s)/.test(before.trim()) && !/(?:const|let|var)\s/.test(before)) {
      out = out.slice(setObjIdx);
    }
  }
  // Strip all addUpdateCallback calls (animation is disabled — scene is static)
  // Handles: addUpdateCallback((...) => { ... }); and root.addUpdateCallback(...)
  // Match balanced braces up to 2 levels deep
  out = out.replace(/(?:root\.)?addUpdateCallback\s*\(\s*\([\s\S]*?\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;?\s*/g, "");
  out = out.replace(/(?:root\.)?addUpdateCallback\s*\(\s*function[\s\S]*?\}\s*\)\s*;?\s*/g, "");

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
      `new THREE.${cls}`,
    );
  });

  // STEP 5: Fix common mistakes
  out = out.replace(/scene\.add\s*\(\s*(?!root)(\w+)\s*\)/g, "root.add($1)");
  out = out.replace(/\bhelpers\./g, "H.");
  out = out.replace(/params\.H\./g, "H.");
  out = out.replace(/params\.TEX/g, "TEX");
  out = out.replace(/params\.MAT/g, "MAT");

  // STEP 5.5: Remove stray export statements (e.g. "export { root }")
  out = out.replace(/export\s*\{[^}]*\}\s*;?\s*/g, "");
  out = out.replace(/export\s+\w+\s*;?\s*$/gm, "");

  // STEP 5.6: Remove scene-level lights the LLM shouldn't add (scene already has lighting)
  out = out.replace(/(?:const|let|var)\s+\w*[Aa]mbient\w*\s*=\s*new\s+THREE\.AmbientLight\([^)]*\)\s*;?/g, "// (ambient light removed — scene has lighting)");
  out = out.replace(/(?:const|let|var)\s+\w*[Dd]irectional\w*\s*=\s*new\s+THREE\.DirectionalLight\([^)]*\)\s*;?/g, "// (directional light removed — scene has lighting)");
  out = out.replace(/root\.add\s*\(\s*\w*[Aa]mbient\w*\s*\)\s*;?/g, "");
  out = out.replace(/root\.add\s*\(\s*\w*[Dd]irectional\w*\s*\)\s*;?/g, "");
  // Also catch inline: root.add(new THREE.AmbientLight(...))
  out = out.replace(/root\.add\s*\(\s*new\s+THREE\.AmbientLight\([^)]*\)\s*\)\s*;?/g, "");
  out = out.replace(/root\.add\s*\(\s*new\s+THREE\.DirectionalLight\([^)]*\)\s*\)\s*;?/g, "");

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

  // STEP 6.5: Fix common LLM code errors

  // Fix: new THREE.Mesh(new THREE.Group()...) — Group is not geometry.
  // Replace with just the Group approach: create group, add children, root.add(group)
  out = out.replace(
    /new\s+THREE\.Mesh\s*\(\s*new\s+THREE\.Group\(\)[^)]*\)/g,
    "new THREE.Group()",
  );

  // Fix: H.bubbles/dust/sparks/smoke called inside addUpdateCallback — these create
  // particle systems and should be called once, not every frame.
  // Extract H.xxx() calls from inside addUpdateCallback and move before it.
  const updateCallbackMatch = out.match(
    /addUpdateCallback\s*\(\s*\(\s*\{[^}]*\}\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*;?/,
  );
  if (updateCallbackMatch) {
    const callbackBody = updateCallbackMatch[1];
    const helperCallPattern = /\s*(?:const\s+\w+\s*=\s*)?H\.(dust|bubbles|sparks|smoke)\s*\([^)]*\)\s*;?/g;
    const helperCalls = callbackBody.match(helperCallPattern);
    if (helperCalls) {
      // Remove from callback body
      let cleanedBody = callbackBody.replace(helperCallPattern, "");
      // Reconstruct the addUpdateCallback
      const fullMatch = updateCallbackMatch[0];
      const cleanedCallback = fullMatch.replace(callbackBody, cleanedBody);
      // Insert helper calls before the addUpdateCallback
      const helperBlock = helperCalls
        .map((c) => c.trim())
        .filter(Boolean)
        .join("\n");
      out = out.replace(fullMatch, helperBlock + "\n" + cleanedCallback);
    }
  }

  // STEP 7: Clean up
  out = out.trim();
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/^\s*try\s*\{\s*\n?/, "");
  out = out.replace(/\}\s*catch\s*\([^)]*\)\s*\{[\s\S]*?\}\s*$/, "");

  // STEP 8: Wrap in module structure with pre-built material library
  // No try/catch here — errors must propagate so applyModuleCode can report them.
  // ThreeViewer.applyModuleCode has its own error handling for real execution.
  return `
export default async function generate(params) {
  const THREE = params.THREE;
  const scene = params.scene;
  const root = new THREE.Group();
  root.name = "GeneratedObject";
  const addUpdateCallback = params.addUpdateCallback;
  const setObjectInfo = params.setObjectInfo;
  const helpers = params.helpers;
  const H = helpers;

  // ── Pre-built Material Library (MAT.*) ──
  var MAT = {
    gold: new THREE.MeshPhysicalMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.3, clearcoat: 0.5 }),
    silver: new THREE.MeshPhysicalMaterial({ color: 0xc0c0c0, metalness: 0.9, roughness: 0.2, clearcoat: 0.5 }),
    bronze: new THREE.MeshPhysicalMaterial({ color: 0xcd7f32, metalness: 0.85, roughness: 0.35, clearcoat: 0.3 }),
    copper: new THREE.MeshPhysicalMaterial({ color: 0xb87333, metalness: 0.8, roughness: 0.4 }),
    iron: new THREE.MeshPhysicalMaterial({ color: 0x555555, metalness: 0.85, roughness: 0.5 }),
    steel: new THREE.MeshPhysicalMaterial({ color: 0x888899, metalness: 0.9, roughness: 0.15, clearcoat: 0.7 }),
    ruby: new THREE.MeshPhysicalMaterial({ color: 0xcc0033, transmission: 0.6, ior: 2.4, emissive: 0xcc0033, emissiveIntensity: 0.3 }),
    emerald: new THREE.MeshPhysicalMaterial({ color: 0x00cc66, transmission: 0.6, ior: 2.4, emissive: 0x00cc66, emissiveIntensity: 0.3 }),
    sapphire: new THREE.MeshPhysicalMaterial({ color: 0x0066cc, transmission: 0.6, ior: 2.4, emissive: 0x0066cc, emissiveIntensity: 0.3 }),
    amethyst: new THREE.MeshPhysicalMaterial({ color: 0x9966cc, transmission: 0.6, ior: 2.4, emissive: 0x9966cc, emissiveIntensity: 0.3 }),
    diamond: new THREE.MeshPhysicalMaterial({ color: 0xeeffff, transmission: 0.9, ior: 2.4, roughness: 0.0, clearcoat: 1.0 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.9, roughness: 0.05, ior: 1.5 }),
    obsidian: new THREE.MeshPhysicalMaterial({ color: 0x1a1a2e, metalness: 0.3, roughness: 0.1, clearcoat: 0.8 }),
    bone: new THREE.MeshPhysicalMaterial({ color: 0xf5f0dc, roughness: 0.7, metalness: 0 }),
    flesh: new THREE.MeshPhysicalMaterial({ color: 0xd4956a, roughness: 0.8, metalness: 0 }),
    leaf: new THREE.MeshPhysicalMaterial({ color: 0x2d7d3a, roughness: 0.7, metalness: 0 }),
    bark: new THREE.MeshPhysicalMaterial({ color: 0x5a3520, roughness: 0.9, metalness: 0 }),
    clay: new THREE.MeshPhysicalMaterial({ color: 0xc4764e, roughness: 0.95, metalness: 0 }),
    marble: new THREE.MeshPhysicalMaterial({ color: 0xf0ece2, roughness: 0.3, metalness: 0, clearcoat: 0.4 }),
    lava: new THREE.MeshPhysicalMaterial({ color: 0xff3300, emissive: 0xff3300, emissiveIntensity: 0.8, roughness: 0.6 }),
    ice: new THREE.MeshPhysicalMaterial({ color: 0xaaddff, transmission: 0.7, ior: 1.31, roughness: 0.1 }),
    sand: new THREE.MeshPhysicalMaterial({ color: 0xd2b48c, roughness: 0.95, metalness: 0 }),
    snow: new THREE.MeshPhysicalMaterial({ color: 0xfafafa, roughness: 0.8, metalness: 0 }),
  };

  // ── Pre-built Texture Generators (TEX.*) — returns CanvasTexture ──
  var TEX = {
    wood: (baseColor, grainColor) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const x = c.getContext('2d'); x.fillStyle = baseColor || '#7a5230'; x.fillRect(0,0,256,256);
      x.strokeStyle = grainColor || '#5a3520'; x.globalAlpha = 0.3;
      for (let i=0;i<50;i++) { x.beginPath(); const y=Math.random()*256; x.moveTo(0,y);
        x.bezierCurveTo(85,y+(Math.random()-0.5)*20,170,y+(Math.random()-0.5)*20,256,y+(Math.random()-0.5)*10);
        x.lineWidth=0.5+Math.random()*2; x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
    },
    stone: (baseColor) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const x = c.getContext('2d'); x.fillStyle = baseColor || '#888888'; x.fillRect(0,0,256,256);
      x.globalAlpha = 0.15;
      for (let i=0;i<300;i++) { x.fillStyle = Math.random()>0.5 ? '#aaaaaa' : '#666666';
        x.fillRect(Math.random()*256, Math.random()*256, 2+Math.random()*6, 2+Math.random()*6); }
      x.globalAlpha = 0.1; x.strokeStyle = '#333';
      for (let i=0;i<8;i++) { x.beginPath(); x.moveTo(Math.random()*256,Math.random()*256);
        x.lineTo(Math.random()*256,Math.random()*256); x.lineWidth=0.5; x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
    },
    metal: (baseColor) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const x = c.getContext('2d'); x.fillStyle = baseColor || '#999999'; x.fillRect(0,0,256,256);
      x.globalAlpha = 0.08;
      for (let i=0;i<120;i++) { x.strokeStyle = Math.random()>0.5 ? '#cccccc' : '#777777';
        x.beginPath(); const y=Math.random()*256; x.moveTo(0,y); x.lineTo(256,y+(Math.random()-0.5)*4);
        x.lineWidth=0.3+Math.random(); x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
    },
    fabric: (baseColor) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const x = c.getContext('2d'); x.fillStyle = baseColor || '#8b4444'; x.fillRect(0,0,128,128);
      x.globalAlpha = 0.1; x.strokeStyle = '#000';
      for (let i=0;i<128;i+=3) { x.beginPath(); x.moveTo(i,0); x.lineTo(i,128); x.moveTo(0,i); x.lineTo(128,i); x.lineWidth=0.5; x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
    },
    leather: (baseColor) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128;
      const x = c.getContext('2d'); x.fillStyle = baseColor || '#6b3a2a'; x.fillRect(0,0,128,128);
      x.globalAlpha = 0.15;
      for (let i=0;i<200;i++) { x.fillStyle = Math.random()>0.5 ? '#7a4a3a' : '#5a2a1a';
        x.beginPath(); x.arc(Math.random()*128,Math.random()*128,1+Math.random()*3,0,Math.PI*2); x.fill(); }
      const t = new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
    },
  };

  // Bind to params to prevent scoping errors if LLM uses params.TEX, etc.
  params.MAT = MAT;
  params.TEX = TEX;
  params.H = H;
  params.helpers = H;

  // ── USER CODE START ──
${indent(out, 2)}
  // ── USER CODE END ──

  scene.add(root);
  return root;
}
`;
}

export default {
  name: "Generative3D",
  components: { ThreeViewer, AccessRequirements, MintModal },
  setup() {
    // ------------ NFT Minting ---------
    const mintTarget = ref(null);

    const openMint = (item) => {
      // Always mint the Three.js code — the interactive 3D viewer is the
      // collectible, never a static screenshot.
      mintTarget.value = {
        inferenceType: "object",
        inferenceId: item.id,
        content: item.code,
        contentType: "model/gltf+json",
        prompt: item.prompt,
        generation: {
          type: "text-to-3d",
          model: currentModel.value.modelname || "three-js",
          timestamp: item.timestamp,
          threeCode: item.code,
          tokensPerSecond: item.tokensPerSecond || null,
        },
      };
    };

    const onMinted = (result) => {
      const inf = savedInferences.value.find(
        (i) => i.id === mintTarget.value?.inferenceId,
      );
      if (inf) inf.nft = result;
      mintTarget.value = null;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // REACTIVE STATE
    // ═══════════════════════════════════════════════════════════════════════
    const isLoading = ref(false);
    const threeViewer = ref(null);
    const lastStatus = ref("");
    const showExamples = ref(false);
    // Use shared inference store for 3D objects
    const objectInferences = computed(
      () => inferenceStore.state.objectInferences,
    );
    const hasCopy = reactive([]);
    const enablePhysics = ref(true);
    const currentTime = ref("day");
    const currentWeather = ref("sunny");
    const lightIntensity = ref(1.0);
    const isModelLoaded = ref(false);
    const form = reactive({ prompt: "" });
    const lastGeneratedCode = ref('');
    const refinePrompt = ref('');
    const downloadProgress = ref(0);
    const isModel = ref(false);

    // ═══════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════════════════
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

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
        ["completed", "failed", "cancelled"].includes(t.status),
      );
      const anyTaskPending = Object.values(merged).some((t) =>
        ["downloading", "pending"].includes(t.status),
      );
      if (!allTasksComplete && next >= 100) {
        next = anyTaskPending ? 99 : 100;
      }

      downloads.progress = next;
      downloads.total_progress = next;

      if (allTasksComplete && downloads.status === "downloading") {
        downloads.status = "completed";
      }

      const wasActive = downloads.active;
      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status,
      );

      // Refresh readiness when download completes
      if (wasActive && !downloads.active && downloads.status === "completed") {
        console.log("[Downloads] Download completed, refreshing readiness");
        isModelAvailable(currentModel.value.filename);
      }
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
            `${SERVER_URL}/downloads/status/${pipelineId}`,
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
          await isModelAvailable(currentModel.value.filename);
        }
        if (downloads.status === "failed") clearInterval(t);
      }, 1000);
    };

    // Resume active download if any
    const resumeActiveDownloadIfAny = async () => {
      let hasActiveDownloads = false;

      // Check for active LLM downloads via Electron API
      try {
        const activeLLM =
          (await window.electronAPI?.getActiveDownloads?.()) || [];
        const relevantLLM = activeLLM.filter(
          (d) => d.filename === currentModel.value.filename,
        );

        if (relevantLLM.length > 0) {
          hasActiveDownloads = true;
          downloads.active = true;
          downloads.status = "downloading";
          downloads.pipeline = downloads.pipeline || { tasks: {} };

          for (const dl of relevantLLM) {
            const taskId = `llm_${dl.filename}`;
            downloads.pipeline.tasks[taskId] = {
              task_id: taskId,
              filename: dl.filename,
              status: "downloading",
              progress: Math.round((dl.percent || 0) * 100),
            };
          }

          // Subscribe to progress updates
          window.electronAPI.onDownloadProgress((e, data) => {
            if (data.filename === currentModel.value.filename) {
              const taskId = `llm_${data.filename}`;
              if (downloads.pipeline.tasks[taskId]) {
                downloads.pipeline.tasks[taskId].progress = Math.round(
                  data.percent * 100,
                );
                updateTotalProgress();
              }
            }
          });

          updateTotalProgress();
        }
      } catch (e) {
        console.error(
          "[Generative3D] Failed to check active LLM downloads:",
          e,
        );
      }

      if (!hasActiveDownloads) {
        downloads.active = false;
      }
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

    // Computed: needs download if LLM model missing
    const needsDownload = computed(() => !isModel.value);

    // Download required models (LLM)
    const downloadAllModels = async () => {
      if (downloads.active) return;

      downloads.active = true;
      downloads.status = "downloading";
      downloads.progress = 0;
      downloads.total_progress = 0;
      downloads.pipeline = { tasks: {} };

      const llmTaskId = "llm-gguf";

      try {
        if (!isModel.value) {
          downloads.pipeline.tasks[llmTaskId] = {
            task_id: llmTaskId,
            filename: currentModel.value.filename,
            status: "downloading",
            progress: 0,
          };

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
            currentModel.value.filename,
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

        if (isModel.value) {
          downloads.status = "completed";
          downloads.progress = 100;
          downloads.total_progress = 100;
        }
      } catch (e) {
        console.error("Download error:", e);
        downloads.status = "failed";
      } finally {
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
      () => displayedCount.value < objectInferences.value.length,
    );

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          objectInferences.value.length,
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
        { root, rootMargin: "100px" },
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

    const model = {
        modelname: "Qwen3.5 27B Q2",
        modeldesc:
          "27B-parameter hybrid attention model from Alibaba with Gated DeltaNet + Gated Attention and 262K context. Q2_K_XL quantization fits 32GB unified memory. Best for: code generation, creative writing, reasoning, and general-purpose AI on consumer hardware.",
        url: "https://huggingface.co/unsloth/Qwen3.5-27B-GGUF/resolve/main/Qwen3.5-27B-UD-Q2_K_XL.gguf",
        filename: "qwen3.5-27b-ud-q2_k_xl.gguf",
        filesize: "11.2 GB",
        filesizeBytes: 11.2e9,
        parameters: 27000000000,
        isMoE: false,
        context: 262000,
    };

    const reasoningEnabled = ref(false);

    const currentModel = computed(() => model);

    const examplePrompts = ref([
      {
        icon: "🏴‍☠️",
        title: "Treasure Chest",
        description: "Ornate chest with riches",
        prompt:
          "Open pirate treasure chest. Body and curved lid built with ExtrudeGeometry from a Shape profile, wood texture via TEX.wood Canvas map. MAT.gold trim bands as TorusGeometry rings. Inside: scattered gold coins (CylinderGeometry + MAT.gold) and gem clusters (IcosahedronGeometry + MeshPhysicalMaterial transmission 0.85, ior 2.0 in ruby/emerald/sapphire colors). Lid hinged open at 110 degrees. H.sparks golden particles rising from the coins. Lid has iron lock plate (MAT.iron).",
      },
      {
        icon: "⚔️",
        title: "Enchanted Sword",
        description: "Rune-etched floating blade",
        prompt:
          "Floating enchanted longsword. Blade via ExtrudeGeometry from a tapered Shape profile, MAT.steel with clearcoat 1.0 and anisotropy. Rune engravings on blade via Canvas procedural texture map. Gold crossguard (ExtrudeGeometry swept curves + MAT.gold). Leather-wrapped grip (CylinderGeometry + TEX.leather). Pommel gemstone (IcosahedronGeometry + MeshPhysicalMaterial transmission 0.8, emissive blue). Blue energy ShaderMaterial aura around the blade. H.sparks blue spiral particles orbiting.",
      },
      {
        icon: "🧪",
        title: "Elixir Vial",
        description: "Potion with red liquid",
        prompt:
          "Round glass potion vial. Bottle body via LatheGeometry smooth profile with narrow neck and flared lip. H.glass(0xffffff) for glass. Liquid inside: H.fillLiquid(vialMesh, 0xCC0000, {fillLevel: 0.7}) — deep red opaque liquid, added to root. No PointLights or emissive glow on the liquid. Gold cork stopper (CylinderGeometry + MAT.gold) positioned at the vial opening. H.bubbles rising inside the liquid. H.dust faint mist around the base.",
      },
      {
        icon: "💎",
        title: "Crystal Cluster",
        description: "Amethyst formation on rock",
        prompt:
          "Cluster of amethyst crystals growing from a rough stone base. Base via LatheGeometry irregular profile with TEX.stone Canvas texture. 8-12 crystal spires at varying angles and heights, each a ConeGeometry (hexagonal, 6 sides) with MeshPhysicalMaterial transmission 0.8, ior 1.8, emissive purple, emissiveIntensity 0.25. Crystals range from small to large. H.dust floating particles catching light.",
      },
      {
        icon: "🛡️",
        title: "Battle Shield",
        description: "Heraldic shield with emblem",
        prompt:
          "Medieval heater shield. Shield body via ExtrudeGeometry from a pointed-bottom Shape profile with slight convex curve via bevelEnabled. Face painted with Canvas procedural texture: red field, black border, golden lion emblem, rivets around the edge. MAT.iron for the body with the canvas texture as map. Gold boss center piece (LatheGeometry + MAT.gold). Rim trim (TorusGeometry shaped to follow shield edge + MAT.steel). Leather arm straps on the back (ExtrudeGeometry + TEX.leather).",
      },
      {
        icon: "👑",
        title: "Royal Crown",
        description: "Jeweled golden crown on velvet",
        prompt:
          "Ornate royal crown on a velvet cushion. Crown band via LatheGeometry with ornate profile, MAT.gold. Six points rising from the band via ExtrudeGeometry from pointed Shape. Each point topped with a different gemstone (OctahedronGeometry + MeshPhysicalMaterial transmission 0.85, ior 2.4): ruby, emerald, sapphire, amethyst, diamond, topaz. Filigree cross-arches connecting points (TubeGeometry along CatmullRomCurve3 + MAT.gold). Cushion below (BoxGeometry with rounded edges + H.velvet deep purple). H.dust golden particles.",
      },
      {
        icon: "🔑",
        title: "Arcane Key",
        description: "Ornate key with magic aura",
        prompt:
          "Ornate golden skeleton key floating upright. Handle: circular ring (TorusGeometry + MAT.gold) with decorative inner filigree (TubeGeometry spirals along CatmullRomCurve3). Shaft: long hexagonal rod (CylinderGeometry 6 sides + MAT.gold). Teeth at bottom: ExtrudeGeometry from a complex Shape with notches and wards. A gemstone set in the handle ring (IcosahedronGeometry + MeshPhysicalMaterial transmission, emissive cyan). ShaderMaterial glow aura surrounding the key. H.sparks cyan particles orbiting.",
      },
      {
        icon: "📖",
        title: "Spell Book",
        description: "Open tome with living pages",
        prompt:
          "Open leather-bound spell book floating at an angle. Covers via ExtrudeGeometry rectangular Shapes with TEX.leather texture, slightly curved. Spine connecting covers (ExtrudeGeometry arc + TEX.leather). Pages fanning open: multiple thin PlaneGeometry sheets with Canvas procedural text/rune textures, staggered at angles. Page edges slightly curled. Gold corner clasps (ExtrudeGeometry + MAT.gold). Glowing runes on the open pages via emissive Canvas texture. H.sparks purple arcane particles rising from the text.",
      },
      {
        icon: "⚙️",
        title: "Clockwork Core",
        description: "Steampunk gear mechanism",
        prompt:
          "Steampunk clockwork mechanism. Central glass sphere housing (MeshPhysicalMaterial transmission 0.9, ior 1.5) containing a glowing energy core (ShaderMaterial plasma effect). Three concentric gear rings around it (ExtrudeGeometry gear-tooth Shapes + MAT.bronze) at different angles. Brass support frame (TubeGeometry along curves + MAT.copper). Small pistons (CylinderGeometry). H.sparks orange sparks from gear contacts. Steam wisps (H.smoke). Canvas engraved gauge texture on the base plate.",
      },
      {
        icon: "🔮",
        title: "Seer's Orb",
        description: "Crystal ball with swirling cosmos",
        prompt:
          "Crystal ball on an ornate bronze stand. Orb: IcosahedronGeometry detail 4, MeshPhysicalMaterial transmission 0.92, ior 1.8, clearcoat 1.0. Inside: ShaderMaterial inner sphere with nebula/cosmos fragment shader (swirling colors, noise-based). Stand: LatheGeometry ornate profile with three claw feet (ExtrudeGeometry + MAT.bronze). H.dust ethereal particles floating around. Faint fresnel glow rim on the orb surface.",
      },
      {
        icon: "⚗️",
        title: "Alchemist's Lab",
        description: "Flask with bubbling brew",
        prompt:
          "Triangular Erlenmeyer flask on a bronze ring stand. Flask via LatheGeometry with conical-to-narrow-neck profile, H.glass(0xffffff) for glass. Liquid inside: H.fillLiquid(flaskMesh, 0x00CC44, {fillLevel: 0.65}) — green opaque liquid, added to root. No PointLights or emissive glow on the liquid. H.bubbles inside the liquid. Cork stopper (CylinderGeometry + Canvas wood texture) positioned at the flask opening. Bronze tripod stand with ring holder (TubeGeometry + MAT.bronze). H.smoke steam rising from the top.",
      },
      {
        icon: "🐉",
        title: "Dragon Egg",
        description: "Cracking egg in ember nest",
        prompt:
          "Large dragon egg in a nest of embers. Egg shape via LatheGeometry ovoid profile. Outer shell: ShaderMaterial with procedural iridescent scale pattern (voronoi-based, color shifting). Cracks across the surface revealing inner lava glow (emissive orange, emissiveIntensity 1.2). Nest: ring of intertwined branches (multiple TubeGeometry along random CatmullRomCurve3 paths, TEX.wood). Glowing embers scattered in nest (tiny SphereGeometry + H.glow orange). H.sparks rising ember particles.",
      },
    ]);

    // ═══════════════════════════════════════════════════════════════════════
    // PROMPT BUILDERS
    // ═══════════════════════════════════════════════════════════════════════
    // PROMPT ENHANCER — decompose vague descriptions into geometric blueprints
    // ═══════════════════════════════════════════════════════════════════════
    const buildEnhancePrompt = (userText) => {
      return `You are a AAA 3D artist designing a single object for rendering. Decompose the user's description into a detailed ASSEMBLY BLUEPRINT — a structured list of every sub-part with its exact look, position, and spatial relationship to the other parts.

OBJECT: "${userText}"

For EACH sub-part of the object, specify ALL of:
- SHAPE: geometry type, profile, proportions (e.g. "LatheGeometry ovoid profile 0.4 wide × 0.5 tall", "CylinderGeometry radius 0.1, height 0.06")
- MATERIAL: surface finish, color with hex code, transparency, metalness, roughness (emissive glow ONLY for energy/magic effects — NEVER for liquids)
- POSITION: where it sits relative to the main body in Y coordinates (e.g. "sits flush on top of the vial opening at the rim's Y", "centered at the base at y=0")
- SIZE: dimensions relative to the main body (e.g. "cork diameter matches the neck inner radius", "blade is 3× the handle length")
- FUNCTION: what this part does visually (seals the top, holds liquid, decorative accent)

SPATIAL RULES you MUST follow:
- Pick a single ground-level origin (y=0) and describe every part's Y range from there
- Parts that sit ON TOP of other parts must start at the top edge of the part below
- Parts INSIDE a container (liquid, objects) must be within the container's interior bounds
- Lids/caps/corks go at the OPENING of the container (its highest point), not in the middle
- Total object height should be 0.3–1.5 units

FORMAT: Write a single dense paragraph. List each sub-part inline with its shape, material, color hex, and Y-position. End with one signature detail.

RULES:
- Stay EXACTLY faithful to the user's intent — do not change the subject or add unrelated elements
- DO add structural sub-parts the object would realistically have (a bottle needs a cork, a sword needs a pommel)
- Every color must have a hex code. If user didn't specify, pick vivid realistic ones
- Output ONLY the enriched description paragraph. No code. No markdown. No bullet points. No explanation.`;
    };

    // ═══════════════════════════════════════════════════════════════════════
    const buildObjectPrompt = (userText) => {
      const keywords = userText.toLowerCase().split(/[\s,.-]+/).filter(w => w.length > 3);

      // Score ALL skill files by keyword relevance to the prompt
      const scored = [];
      for (const [path, content] of Object.entries(skillFiles)) {
        // Skip loaders and postprocessing (not useful for object generation)
        if (path.includes('threejs-loaders') || path.includes('threejs-postprocessing')) continue;
        let score = 0;
        const lc = content.toLowerCase();
        for (const w of keywords) { if (lc.includes(w)) score++; }
        // Core skills always get a base score
        if (path.includes('threejs-geometry')) score += 5;
        if (path.includes('threejs-materials')) score += 4;
        if (path.includes('threejs-animation')) score += 3;
        scored.push({ path, content, score });
      }
      scored.sort((a, b) => b.score - a.score);

      // Select best matching recipe hint (if any)
      let recipeHint = '';
      const recipeScored = [];
      for (const [path, content] of Object.entries(recipeFiles)) {
        let score = 0;
        const lc = content.toLowerCase();
        for (const w of keywords) { if (lc.includes(w)) score++; }
        if (score > 0) recipeScored.push({ content, score });
      }
      recipeScored.sort((a, b) => b.score - a.score);
      if (recipeScored.length > 0 && recipeScored[0].score >= 1) {
        recipeHint = recipeScored[0].content;
      }

      // Take top 3 most relevant skill files
      const selectedSkills = scored.slice(0, 3).map(s => s.content);
      const skillsContext = selectedSkills.join("\n\n---\n\n");

      return `You are an expert Three.js developer. Generate AAA-quality 3D objects.
CRITICAL: Output ONLY raw JavaScript code. No thinking, no reasoning, no <think> tags, no explanation, no markdown fences. Start with setObjectInfo() immediately.

TASK: "${userText}"

═══ AVAILABLE API (pre-declared, do NOT redeclare) ═══
THREE, root (Group — add meshes here), setObjectInfo({title, description})
MAT.gold/silver/bronze/copper/iron/steel/ruby/emerald/sapphire/amethyst/diamond/glass/obsidian/bone/flesh/leaf/bark/clay/marble/lava/ice/sand/snow — pre-built materials, use directly (e.g. MAT.gold, NOT H.gold)
TEX.wood(color?)/stone(color?)/metal(color?)/fabric(color?)/leather(color?) → CanvasTexture
H.glass(c,{transmission,thickness,ior,roughness})/gem(c,o)/metal(c,o)/matte(c,o)/glow(c,o)/liquid(c,o)/fire(o)/ice(c,o)/lava(o)/leather(c,o)/velvet(c,o)
H.fillLiquid(containerMesh, color, {fillLevel, inset, opacity}) → Group (opaque colored liquid body + surface disc, NO glow)
H.light(c,i,d)/spot(c,i,o)/sparks(n,o)/dust(n,o)/bubbles(n,o)/smoke(n,o)
NOTE: H.glass uses 'transmission' NOT 'transparency'. For gold/silver/iron use MAT.gold etc., NOT H.gold (does not exist)

═══ LIQUID IN CONTAINER — MANDATORY PATTERN ═══
// Build glass container first:
const vialGeo = new THREE.LatheGeometry(points, 64);
const vial = new THREE.Mesh(vialGeo, H.glass(0xffffff));
root.add(vial);
// Then fill with liquid using H.fillLiquid — it creates an opaque colored liquid body + surface disc:
const liquid = H.fillLiquid(vial, 0xCC0000, { fillLevel: 0.7 });
root.add(liquid);
// H.fillLiquid handles ALL liquid material properties internally. The liquid is opaque and colored.
// NEVER build liquid geometry manually. NEVER use MeshPhysicalMaterial for liquid.
// NEVER add PointLight, emissive glow, or any light source near/inside the liquid.
// NEVER create separate spheres, cylinders, or geometry to represent the liquid body.
// The ONLY way to create liquid is H.fillLiquid(). The returned Group is the complete liquid.

═══ THREE.JS REFERENCE ═══
${skillsContext}
${recipeHint ? `\n═══ PATTERN HINT ═══\n${recipeHint}\n` : ''}
═══ RULES ═══
- RAW JS only, COMPLETE code, no external assets, no post-processing
- Objects above y=0, fit ~1x1 footprint, height 0.3-1.5
- Use complex geometry (LatheGeometry, ExtrudeGeometry, TubeGeometry, Shape+extrude, BufferGeometry)
- Use MeshPhysicalMaterial for realism, ShaderMaterial for procedural effects
- NO ANIMATION — do NOT call addUpdateCallback(). The scene is STATIC. Use H.sparks/dust/bubbles for particle effects (they self-animate)
- Do NOT redeclare THREE, root, H, MAT, TEX, addUpdateCallback, setObjectInfo
- LatheGeometry: points are Vector2(x=radius, y=height), must go bottom-to-top
- LatheGeometry for CLOSED vessels (vials, bowls, cups): the profile MUST start AND end at x ≈ 0 (center axis) to create a solid bottom and top. Example: [V2(0.001,0), V2(0.3,0), V2(0.3,0.6), V2(0.15,0.8), V2(0.001,0.8)] — this closes both bottom and top
- new THREE.Mesh() first arg = BufferGeometry, NEVER a Group
- LIQUID INSIDE GLASS: Call H.fillLiquid(glassMesh, color, {fillLevel: 0.7}) AFTER adding the glass mesh to root. It builds an OPAQUE colored liquid body matching the container interior. Add the returned group to root. NEVER build liquid geometry manually — no CylinderGeometry, no SphereGeometry, no custom materials for liquid. NEVER add PointLight or emissive glow near or inside the liquid — the liquid is already correctly colored and visible. NEVER create a separate "large bubble" mesh with PointLight — use H.bubbles() only
- GLASS MATERIAL: Use H.glass(0xffffff) for thin clear glass (thickness 0.15). If making glass manually, use thickness ≤ 0.2 for vials/bottles (thin walls) — high thickness values (>1) make glass look like thick opaque slab. Do NOT set attenuationColor on glass containing colored liquid — it tints the liquid. Do NOT add inner glow PointLights
- TubeGeometry REQUIRES a Curve3 object (e.g. CatmullRomCurve3, QuadraticBezierCurve3), NEVER an array of points
- MeshStandardMaterial and MeshPhysicalMaterial have NO specular property — use metalness/roughness instead
- Position gems/ornaments using Math.cos(angle)*radius and Math.sin(angle)*radius for circular placement

═══ SPATIAL COHESION — CRITICAL ═══
- EVERY sub-part position MUST be derived from the geometry it attaches to. NEVER hardcode Y positions — compute them:
  • Cork/lid: position.y = container.position.y + containerGeoBBox.max.y (sits at the opening)
  • Base/stand: position.y = mainBody.position.y - offset (below the body)
  • Attachments: compute from the parent mesh bounding box
- After creating the main body geometry, call geo.computeBoundingBox() and use geo.boundingBox.min/max to position dependent parts
- Container LatheGeometry profile height (max Y of profile points) determines where lids/corks go. Example:
  const vialGeo = new THREE.LatheGeometry(points, 64); // profile top at y=0.5
  const vial = new THREE.Mesh(vialGeo, glassMat);
  vial.position.y = 0.25; // base of vial in world space
  // Cork MUST go at: vial.position.y + profileTopY = 0.25 + 0.5 = 0.75
  cork.position.y = 0.25 + 0.5; // NOT hardcoded to some arbitrary value
- Parts that wrap around a body (rings, bands, chains) use the body's radius at that height
- ALL sub-parts must be spatially justified — no floating disconnected pieces

═══ FORBIDDEN — these DO NOT EXIST, using them CRASHES ═══
- MAT is FLAT: use MAT.ruby, MAT.gold, MAT.emerald directly. NO MAT.gems, NO MAT.metals, NO nested objects
- MAT has ONLY: gold/silver/bronze/copper/iron/steel/ruby/emerald/sapphire/amethyst/diamond/glass/obsidian/bone/flesh/leaf/bark/clay/marble/lava/ice/sand/snow — NO topaz, NO velvet, NO crystal, NO fabric
- For velvet/leather/fabric: use H.velvet(color), H.leather(color), TEX.fabric(color) — NOT MAT.velvet
- NO H.gold, NO H.silver, NO H.bronze, NO H.iron, NO H.steel — metals are MAT.gold, MAT.silver etc. H.metal(color,opts) is for custom metal colors only
- MeshPhysicalMaterial has NO 'transparency' property — use 'transmission' for see-through glass/gem materials. 'transparency' CRASHES
- NO H.updateParticleSystem — dust/sparks/bubbles animate automatically
- NO addUpdateCallback — the scene is STATIC, no animation loops. Particles (H.sparks/dust/bubbles) self-animate, everything else is static
- NO requestAnimationFrame, NO setInterval, NO setTimeout
- NO physics, NO CANNON — physics engine is NOT available
- NO manual lights (SpotLight, DirectionalLight) — the scene has lighting. Use H.light() or H.spot() only if extra accent lighting is needed
- NO PointLight inside liquids or containers — the liquid color shows through glass naturally without fake glow
- NO AxesHelper, GridHelper, or debug geometry

═══ QUALITY EXAMPLE (match this level) ═══
${defaultCode}

OUTPUT CODE FOR: "${userText}"`;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // REFINE PROMPT BUILDER
    // ═══════════════════════════════════════════════════════════════════════
    const buildRefinePrompt = (existingCode, instruction) => {
      return `You are modifying existing Three.js code. Make the requested change BOLD and VISUALLY OBVIOUS.
CRITICAL: Output ONLY the COMPLETE modified code. No thinking, no reasoning, no <think> tags, no explanation. Start with setObjectInfo() immediately.
Do NOT add reasoning or explanation. Output raw JavaScript only.

═══ CURRENT CODE ═══
${existingCode}

═══ REQUESTED CHANGE ═══
${instruction}

═══ AVAILABLE API ═══
- THREE: Full Three.js library
- root: THREE.Group (add all meshes here)
- setObjectInfo({title, description}): Set object metadata

PRE-BUILT MATERIALS: MAT.gold, MAT.silver, MAT.bronze, MAT.copper, MAT.iron, MAT.steel,
MAT.ruby, MAT.emerald, MAT.sapphire, MAT.amethyst, MAT.diamond,
MAT.glass, MAT.obsidian, MAT.bone, MAT.flesh, MAT.leaf, MAT.bark,
MAT.clay, MAT.marble, MAT.lava, MAT.ice, MAT.sand, MAT.snow

HELPERS: H.glass(color,opts), H.gem(color,opts), H.metal(color,opts),
H.matte(color,opts), H.glow(color,opts), H.liquid(color,opts),
H.fire(opts), H.ice(color,opts), H.lava(opts),
H.leather(color,opts), H.velvet(color,opts)
LIGHTS: H.light(color,intensity,distance), H.spot(color,intensity,opts)
PARTICLES: H.sparks(count,opts), H.dust(count,opts), H.bubbles(count,opts), H.smoke(count,opts)

═══ RULES ═══
- Make the change DRAMATIC and CLEARLY VISIBLE — not subtle tweaks
- If asked to change material/color: replace the ENTIRE material on ALL relevant meshes
- If asked to add something: add at least 2-3 new mesh objects or particle systems
- If asked to resize: change by at least 50% so the difference is obvious
- Keep all existing geometry and materials UNLESS the change requires modifying them
- NO ANIMATION — do NOT call addUpdateCallback(). The scene is STATIC. NO requestAnimationFrame, NO setInterval. Remove any existing addUpdateCallback calls
- NO physics, NO CANNON — physics engine is NOT available
- Do NOT declare THREE, scene, root, H, MAT, TEX, setObjectInfo — they are pre-declared
- H.dust(), H.bubbles(), H.sparks() — call ONCE, root.add() result. They self-animate
- TubeGeometry REQUIRES a Curve3 (CatmullRomCurve3, QuadraticBezierCurve3), NEVER an array of points
- MeshStandardMaterial/MeshPhysicalMaterial have NO specular property — use metalness/roughness. NO 'transparency' property — use 'transmission' for glass/gems
- MAT is FLAT: MAT.ruby, MAT.gold etc. NO MAT.gems, NO nested objects. NO MAT.velvet/topaz/crystal/fabric
- For velvet/leather/fabric: use H.velvet(color), H.leather(color), TEX.fabric(color)
- NO H.gold/silver/bronze/iron/steel — use MAT.gold, MAT.silver etc. for metal materials
- NO H.updateParticleSystem — dust/sparks/bubbles animate automatically
- SPATIAL: compute sub-part positions from geometry bounding boxes — lids at container top, bases below body. Never hardcode Y positions
- Output complete modified code starting with setObjectInfo()

OUTPUT:`;
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LLM
    // ═══════════════════════════════════════════════════════════════════════
    const callLLM = async (prompt, options = {}) => {
      if (!window.electronAPI?.chat) {
        throw new Error("Chat API not available");
      }
      const extraOpts = { returnMetadata: true };
      if (options.maxTokens) extraOpts.maxTokens = options.maxTokens;
      if (options.temperature !== undefined)
        extraOpts.temperature = options.temperature;
      if (options.thoughtTokens !== undefined)
        extraOpts.thoughtTokens = options.thoughtTokens;
      const response = await Promise.race([
        window.electronAPI.chat(prompt, extraOpts),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 1800000),
        ),
      ]);
      if (!response) throw new Error("Empty response from LLM");
      // Return metadata object { text, tokenCount, elapsedMs } when available
      if (typeof response === 'object' && response.text !== undefined) {
        return response;
      }
      return { text: String(response), tokenCount: 0, elapsedMs: 0 };
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
        // Store for refinement
        const userCodeMatch = item.code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        lastGeneratedCode.value = userCodeMatch ? userCodeMatch[1].trim() : '';
      } catch (err) {
        console.error("Failed to apply inference:", err);
      }
    };

    const regenerateFromInference = async (item) => {
      if (!item.prompt) return;
      // Set the prompt from the inference
      form.prompt = item.prompt;
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
    // IMPORT FROM NFT
    // ═══════════════════════════════════════════════════════════════════════
    const importTokenId = ref("");
    const isImportingNFT = ref(false);

    const importFromNFT = async () => {
      const tokenId = importTokenId.value.trim();
      if (!tokenId || isImportingNFT.value) return;

      isImportingNFT.value = true;
      try {
        const result = await fetchNFT3DCode(tokenId);
        if (!result || !result.code) {
          console.error("[Generative3D] No 3D code found in NFT metadata");
          return;
        }

        // Save to inference store
        const record = await addObjectInference(
          result.prompt || `[NFT #${tokenId}]`,
          result.code,
          { success: true },
        );

        // Load into viewer
        if (threeViewer.value && result.code) {
          await threeViewer.value.applyModuleCode(result.code, "replace");
          const userCodeMatch = result.code.match(
            /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
          );
          lastGeneratedCode.value = userCodeMatch ? userCodeMatch[1].trim() : "";
        }

        importTokenId.value = "";
      } catch (err) {
        console.error("[Generative3D] Failed to import NFT:", err);
      } finally {
        isImportingNFT.value = false;
      }
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
        // Cap context at 32K — 3D prompts are ~20K tokens max, and larger contexts
        // waste memory on KV cache and cause very slow prefill (100K+ = minutes of prefill)
        // forceReload ensures we get fresh context even if another tab loaded the model
        // with a different context size
        await window.electronAPI.loadModel({
          filename: currentModel.value.filename,
          parameters: currentModel.value.parameters,
          activeParameters: currentModel.value.activeParameters,
          isMoE: currentModel.value.isMoE,
          context: 32768,
          filesizeBytes: currentModel.value.filesizeBytes,
          flashAttention: currentModel.value.flashAttention,
          forceReload: true,
        });
        isModelLoaded.value = true;
        lastStatus.value = "Let's go!";
      } catch (error) {
        throw new Error(`Model loading failed: ${error.message}`);
      }
    };

          const defaultCode = `export default async function generate(params) {
  const { THREE, scene, helpers: H, setObjectInfo } = params;
  const root = new THREE.Group();
  root.name = "ArcaneOrrery";

  setObjectInfo({ title: "Arcane Orrery", description: "A magical mechanical solar system with crystal orb, orbiting celestial bodies on golden armillary rings, gear mechanisms, and floating rune particles." });

  // ── Pre-built materials ──
  const MAT = {
    gold: new THREE.MeshPhysicalMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.3, clearcoat: 0.5 }),
    bronze: new THREE.MeshPhysicalMaterial({ color: 0xcd7f32, metalness: 0.85, roughness: 0.35, clearcoat: 0.3 }),
  };

  // ── Procedural engraved texture for the base ──
  const baseTexCanvas = document.createElement('canvas');
  baseTexCanvas.width = 512; baseTexCanvas.height = 512;
  const btx = baseTexCanvas.getContext('2d');
  btx.fillStyle = '#2a1a0a'; btx.fillRect(0, 0, 512, 512);
  btx.strokeStyle = '#c8a050'; btx.lineWidth = 1.5; btx.globalAlpha = 0.4;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    btx.beginPath(); btx.moveTo(256, 256);
    btx.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250); btx.stroke();
  }
  for (let r = 40; r < 260; r += 50) {
    btx.beginPath(); btx.arc(256, 256, r, 0, Math.PI * 2); btx.stroke();
  }
  const runes = '\\u16A0\\u16A2\\u16A6\\u16B1\\u16B7\\u16C1\\u16C7\\u16D2';
  btx.globalAlpha = 0.6; btx.font = '28px serif'; btx.fillStyle = '#c8a050';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    btx.fillText(runes[i], 256 + Math.cos(a) * 180 - 10, 256 + Math.sin(a) * 180 + 10);
  }
  const baseTex = new THREE.CanvasTexture(baseTexCanvas);

  // ── Base pedestal ──
  const basePoints = [
    new THREE.Vector2(0.001, 0), new THREE.Vector2(0.4, 0),
    new THREE.Vector2(0.42, 0.02), new THREE.Vector2(0.42, 0.04),
    new THREE.Vector2(0.38, 0.06), new THREE.Vector2(0.35, 0.08),
    new THREE.Vector2(0.35, 0.14), new THREE.Vector2(0.38, 0.16),
    new THREE.Vector2(0.38, 0.18), new THREE.Vector2(0.15, 0.20),
    new THREE.Vector2(0.12, 0.22), new THREE.Vector2(0.12, 0.25),
    new THREE.Vector2(0.001, 0.25)
  ];
  const baseGeo = new THREE.LatheGeometry(basePoints, 64);
  const baseMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a1a0a, metalness: 0.3, roughness: 0.5,
    clearcoat: 0.4, map: baseTex
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.castShadow = true; baseMesh.receiveShadow = true;
  root.add(baseMesh);

  // ── Gear mechanism at base ──
  const makeGear = (innerR, outerR, teeth, thickness) => {
    const shape = new THREE.Shape();
    const step = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step, a1 = a0 + step * 0.25;
      const a2 = a0 + step * 0.35, a3 = a0 + step * 0.65;
      const a4 = a0 + step * 0.75;
      if (i === 0) shape.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
      shape.lineTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
      shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
      shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
      shape.lineTo(Math.cos(a4) * innerR, Math.sin(a4) * innerR);
    }
    shape.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, 0, innerR * 0.4, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  };
  const gearMat = MAT.bronze.clone();
  const gear1Geo = makeGear(0.08, 0.12, 16, 0.015);
  const gear1 = new THREE.Mesh(gear1Geo, gearMat);
  gear1.rotation.x = -Math.PI / 2; gear1.position.set(0.22, 0.19, 0);
  gear1.castShadow = true; root.add(gear1);
  const gear2Geo = makeGear(0.05, 0.08, 12, 0.015);
  const gear2 = new THREE.Mesh(gear2Geo, gearMat);
  gear2.rotation.x = -Math.PI / 2; gear2.position.set(0.35, 0.19, 0.08);
  gear2.castShadow = true; root.add(gear2);

  // ── Central pillar ──
  const pillarGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 16);
  const pillarMat = MAT.gold.clone();
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = 0.50; pillar.castShadow = true;
  root.add(pillar);

  // ── Central crystal orb with inner glow shader ──
  const orbGeo = new THREE.IcosahedronGeometry(0.15, 4);
  const orbMat = new THREE.MeshPhysicalMaterial({
    color: 0xaaddff, transmission: 0.92, ior: 1.8, thickness: 2.0,
    roughness: 0.02, metalness: 0.0, clearcoat: 1.0,
    emissive: 0x4488ff, emissiveIntensity: 0.4,
    transparent: true, depthWrite: false
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.y = 0.85; orb.castShadow = true;
  root.add(orb);

  // Inner glow core
  const coreGeo = new THREE.IcosahedronGeometry(0.06, 2);
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x66ccff) } },
    vertexShader: \`
      varying vec3 vNormal; varying vec3 vPosition;
      uniform float uTime;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec3 pos = position;
        pos += normal * sin(uTime * 3.0 + position.y * 10.0) * 0.008;
        vPosition = pos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }\`,
    fragmentShader: \`
      uniform vec3 uColor; uniform float uTime;
      varying vec3 vNormal; varying vec3 vPosition;
      void main() {
        float pulse = 0.6 + 0.4 * sin(uTime * 2.0);
        float rim = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
        vec3 col = uColor * (pulse + rim * 0.5);
        gl_FragColor = vec4(col, 0.9);
      }\`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 0.85;
  root.add(core);

  const orbLight = new THREE.PointLight(0x4488ff, 2.5, 3);
  orbLight.position.y = 0.85; root.add(orbLight);

  // ── Armillary rings (3 orbiting rings with planets) ──
  const ringGroup = new THREE.Group();
  ringGroup.position.y = 0.85;
  root.add(ringGroup);

  const makeRing = (radius, tubeR) => {
    const geo = new THREE.TorusGeometry(radius, tubeR, 8, 64);
    return new THREE.Mesh(geo, MAT.gold.clone());
  };

  const ring1 = makeRing(0.30, 0.008); ring1.castShadow = true;
  const ring2 = makeRing(0.40, 0.006); ring2.rotation.x = Math.PI / 3; ring2.castShadow = true;
  const ring3 = makeRing(0.50, 0.006); ring3.rotation.x = -Math.PI / 4; ring3.rotation.z = Math.PI / 6; ring3.castShadow = true;
  ringGroup.add(ring1, ring2, ring3);

  // ── Planet 1: Gas giant (procedural shader) ──
  const planet1Geo = new THREE.IcosahedronGeometry(0.06, 3);
  const planet1Mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: \`varying vec2 vUv; varying vec3 vPos;
      void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\`,
    fragmentShader: \`uniform float uTime; varying vec2 vUv; varying vec3 vPos;
      void main() {
        float bands = sin(vPos.y * 40.0 + uTime * 0.5) * 0.5 + 0.5;
        vec3 c1 = vec3(0.8, 0.5, 0.2); vec3 c2 = vec3(0.9, 0.7, 0.4);
        vec3 col = mix(c1, c2, bands);
        float storm = smoothstep(0.3, 0.35, length(vPos.xz - vec2(0.02, 0.0)));
        col = mix(vec3(0.9, 0.3, 0.1), col, storm);
        gl_FragColor = vec4(col, 1.0);
      }\`
  });
  const planet1 = new THREE.Mesh(planet1Geo, planet1Mat);
  planet1.castShadow = true;

  // ── Planet 2: Rocky world ──
  const planet2Geo = new THREE.IcosahedronGeometry(0.04, 2);
  const planet2Mat = new THREE.MeshPhysicalMaterial({
    color: 0x886644, roughness: 0.8, metalness: 0.2,
    clearcoat: 0.1
  });
  const planet2 = new THREE.Mesh(planet2Geo, planet2Mat);
  planet2.castShadow = true;

  // ── Planet 3: Ice world ──
  const planet3Geo = new THREE.IcosahedronGeometry(0.05, 3);
  const planet3Mat = new THREE.MeshPhysicalMaterial({
    color: 0xaaeeff, transmission: 0.3, ior: 1.31,
    roughness: 0.15, metalness: 0.0, clearcoat: 0.8,
    emissive: 0x88ccff, emissiveIntensity: 0.15
  });
  const planet3 = new THREE.Mesh(planet3Geo, planet3Mat);
  planet3.castShadow = true;

  root.add(planet1, planet2, planet3);

  // ── Floating rune particles ──
  const runeCount = 60;
  const runeGeo = new THREE.BufferGeometry();
  const runePos = new Float32Array(runeCount * 3);
  const runeVels = [];
  for (let i = 0; i < runeCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = 0.55 + Math.random() * 0.25;
    runePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    runePos[i * 3 + 1] = 0.85 + r * Math.cos(phi);
    runePos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    runeVels.push({ theta, phi, r, speed: 0.2 + Math.random() * 0.3 });
  }
  runeGeo.setAttribute('position', new THREE.BufferAttribute(runePos, 3));
  const runeMat = new THREE.PointsMaterial({
    color: 0xffcc44, size: 0.025, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const runeParticles = new THREE.Points(runeGeo, runeMat);
  root.add(runeParticles);

  // ── Dust ambiance ──
  const dust = H.dust(40, { spread: 0.8, color: 0xffeebb, size: 0.02 });
  dust.position.y = 0.3;
  root.add(dust);

  // ── Static planet positions ──
  planet1.position.set(0.30, 0.85, 0);
  planet2.position.set(0.20, 1.20, 0.35);
  planet3.position.set(-0.35, 1.10, 0.35);

  scene.add(root);
  return root;
}`;


    // ═══════════════════════════════════════════════════════════════════════
    // DEFAULT OBJECT
    // ═══════════════════════════════════════════════════════════════════════
    const loadDefaultObject = async () => {
      const viewer = threeViewer.value;
      if (!viewer) return;


      try {
        await viewer.applyModuleCode(defaultCode, "replace");
      } catch (err) {
        console.error("Failed to load default object:", err);
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MAIN SUBMIT HANDLER
    const onSubmit = async () => {
      if (!form.prompt.trim()) return;
      if (!canSubmitWithAccess.value) return;

      if (!isModel.value) {
        lastStatus.value = "Please download the AI model first";
        return;
      }

      isLoading.value = true;
      lastStatus.value = "Preparing...";

      try {
        await loadModelForGeneration();
        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        // Reset chat history to free context for new generation
        await window.electronAPI.resetChat();

        console.log("═══════════════════════════════════════════════════════");
        console.log("3D CODE GENERATION");
        console.log("═══════════════════════════════════════════════════════");

        // Phase 1: Enhance prompt — decompose into explicit geometric blueprint
        lastStatus.value = "Designing blueprint...";
        const blueprintResult = await callLLM(buildEnhancePrompt(form.prompt), {
          maxTokens: 512,
          temperature: 0.9,
          thoughtTokens: 0,
        });
        const blueprint = blueprintResult.text.trim() || form.prompt;
        const blueprintTokS = blueprintResult.elapsedMs > 0
          ? ((blueprintResult.tokenCount / blueprintResult.elapsedMs) * 1000).toFixed(1)
          : null;
        console.log("Enhanced blueprint:", blueprint);
        console.log(`Blueprint: ${blueprintResult.tokenCount} tokens in ${(blueprintResult.elapsedMs / 1000).toFixed(1)}s (${blueprintTokS || '?'} tok/s), prefill: ${((blueprintResult.prefillMs || 0) / 1000).toFixed(1)}s`);

        // Phase 2: Generate Three.js code from blueprint
        // Reset chat again — the blueprint exchange is in history and the code prompt
        // is very large (Three.js reference docs), so we need maximum context available
        await window.electronAPI.resetChat();
        lastStatus.value = "Vibe Coding...";
        const codePrompt = buildObjectPrompt(blueprint);
        const codeResult = await callLLM(codePrompt, {
          maxTokens: reasoningEnabled.value ? 6144 : 4096,
          temperature: 0.7,
          thoughtTokens: reasoningEnabled.value ? undefined : 0,
        });
        const codeTokS = codeResult.elapsedMs > 0
          ? ((codeResult.tokenCount / codeResult.elapsedMs) * 1000).toFixed(1)
          : null;
        console.log("Raw LLM output:", codeResult.text);
        console.log(`Code gen: ${codeResult.tokenCount} tokens in ${(codeResult.elapsedMs / 1000).toFixed(1)}s (${codeTokS || '?'} tok/s), prefill: ${((codeResult.prefillMs || 0) / 1000).toFixed(1)}s`);

        const code = normalizeLLMCode(codeResult.text);
        const userCodeMatch = code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        const userCode = userCodeMatch ? userCodeMatch[1].trim() : "";
        console.log("User code:", userCode || "(empty — LLM produced no code)");

        if (!userCode) {
          throw new Error(
            "LLM produced no usable code (thinking may have consumed all tokens). Try again.",
          );
        }

        // Render
        lastStatus.value = "Rendering...";
        await viewer.applyModuleCode(code, "replace");

        // Store for refinement
        lastGeneratedCode.value = userCode;

        // Combined tok/s from both phases
        const totalTokens = blueprintResult.tokenCount + codeResult.tokenCount;
        const totalMs = blueprintResult.elapsedMs + codeResult.elapsedMs;
        const tokensPerSecond = totalMs > 0 ? ((totalTokens / totalMs) * 1000).toFixed(1) : null;

        lastStatus.value = `Crafted! (${tokensPerSecond || '?'} tok/s)`;
        const savedRecord = await addObjectInference(form.prompt, code, { success: true, blueprint, tokensPerSecond, model: currentModel.value.modelname });
        console.log("[3D] Inference saved to history:", savedRecord?.id);
        form.prompt = "";
      } catch (e) {
        console.error("❌ Generation error:", e);
        lastStatus.value = "❌ Failed: " + e.message;
        await addObjectInference(form.prompt, "", {
          success: false,
          notes: String(e.message || "Unknown error"),
          model: currentModel.value.modelname,
        });
      } finally {
        isLoading.value = false;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // REFINE HANDLER
    // ═══════════════════════════════════════════════════════════════════════
    const onRefine = async () => {
      if (!refinePrompt.value.trim() || !lastGeneratedCode.value) return;
      isLoading.value = true;
      lastStatus.value = "Refining...";
      try {
        await loadModelForGeneration();
        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        // Reset chat history to free context for refinement
        await window.electronAPI.resetChat();

        const prompt = buildRefinePrompt(lastGeneratedCode.value, refinePrompt.value);
        const result = await callLLM(prompt, { maxTokens: reasoningEnabled.value ? 4096 : 3072, temperature: 0.7, thoughtTokens: reasoningEnabled.value ? undefined : 0 });
        const tokensPerSecond = result.elapsedMs > 0 ? ((result.tokenCount / result.elapsedMs) * 1000).toFixed(1) : null;
        console.log(`Refine: ${result.tokenCount} tokens in ${(result.elapsedMs / 1000).toFixed(1)}s (${tokensPerSecond || '?'} tok/s)`);

        const code = normalizeLLMCode(result.text);
        const userCodeMatch = code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        if (!userCodeMatch?.[1]?.trim()) throw new Error("Refinement produced no code");

        lastGeneratedCode.value = userCodeMatch[1].trim();
        await viewer.applyModuleCode(code, "replace");
        lastStatus.value = `Refined! (${tokensPerSecond || '?'} tok/s)`;
        await addObjectInference(`[Refine] ${refinePrompt.value}`, code, { success: true, tokensPerSecond, model: currentModel.value.modelname });
        refinePrompt.value = '';
      } catch (e) {
        console.error("Refine error:", e);
        lastStatus.value = "Refine failed: " + e.message;
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
      currentTime,
      currentWeather,
      lightIntensity,
      lightingPresets,
      weatherOptions,
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
      // Refine mode
      lastGeneratedCode,
      refinePrompt,
      onRefine,
      // Access control
      accessRef,
      hasAccess,
      onAccessChanged,
      canSubmitWithAccess,
      // Model management
      reasoningEnabled,
      currentModel,
      downloadProgress,
      isModel,
      isModelAvailable,
      downloadModel,
      deleteModel,
      // Payout history
      requestOpenNetworkModal,
      // NFT Minting
      mintTarget,
      openMint,
      onMinted,
      // NFT Import
      importTokenId,
      isImportingNFT,
      importFromNFT,
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
  background: url("../assets/bonzai_3d.webp") no-repeat center center;
  background-size: cover;  overflow: hidden;
}
@keyframes move {
  0% {
    transform: scale(1.1);
    transform-origin: bottom left;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1.1);
    transform-origin: bottom left;
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
.answer__model {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
}
.answer__tps {
  color: #48c774;
  font-weight: 700;
  margin-left: 4px;
}
.history-prompt {
  color: rgba(255, 255, 255, 0.9);
  font-size: 16px;
  font-weight: 400;
  margin: 0.75em 0;
  line-height: 1.6;
}
.history-blueprint {
  color: rgba(150, 200, 255, 0.8);
  font-size: 13px;
  font-style: italic;
  margin: 0.25em 0 0.5em 0;
  line-height: 1.5;
  padding: 0.4em 0.6em;
  background: rgba(100, 150, 255, 0.08);
  border-radius: 4px;
  border-left: 2px solid rgba(100, 150, 255, 0.3);
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

/* Reasoning toggle */
.reasoning-toggle {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.reasoning-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}

.reasoning-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}

.reasoning-toggle-btn.active {
  background: rgba(32, 156, 238, 0.4);
  border-color: #209cee;
  color: #fff;
  box-shadow: 0 0 12px rgba(32, 156, 238, 0.4);
}

.reasoning-toggle-btn.active:hover {
  background: rgba(32, 156, 238, 0.55);
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
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
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

.refine-section {
  border: 1px solid rgba(72, 199, 142, 0.3);
  border-radius: 6px;
  padding: 0.5rem;
  background: rgba(72, 199, 142, 0.05);
}

.refine-section .input {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(72, 199, 142, 0.3);
  color: white;
}

.refine-section .input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
</style>
