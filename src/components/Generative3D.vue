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
import { resolveLLM } from "../skills/flagship.js";
import { makeLibs } from "./gen3d/engine.js";
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

// Prompt-injection reference: CHEATSHEET.md (concise) not SKILL.md (full).
// Full SKILL.md files (500-660 lines each) ballooned the code-gen prompt to
// ~2300 lines and drove prefill times past 13 minutes on small LLMs; the
// cheatsheets are 32-46 lines each and cover the same API surface.
const skillFiles = import.meta.glob('../skills/threejs/*/CHEATSHEET.md', { as: 'raw', eager: true });
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
    const codeMatch = out.match(/"code"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);
    if (codeMatch) {
      out = codeMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .trim();
    }
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

  // First: strip any destructuring from params/window (catches all shapes).
  // The `(?!\.)` lookahead prevents partial matches on `params._engine`,
  // which would otherwise leave `._engine;` as an orphan expression.
  out = out.replace(/(?:const|let|var)\s*\{[^}]*\}\s*=\s*(?:params|window)(?!\s*\.)\s*;?\s*/g, "");

  // Strip individual declarations of reserved names — regardless of RHS.
  // The RHS may be a multi-line arrow / function expression, so we need
  // a brace-balancing walker instead of a one-line regex. Previous regex
  // `[^;\\n]*;?` matched only the first line of `const setObjectInfo =
  // (info) => {` and left the body `{ window.__sceneInfo = info; };`
  // dangling — that orphan block was the source of "Illegal return
  // statement" on module import.
  const WRAPPER_RESERVED = [
    "THREE", "scene", "camera", "root", "H", "helpers", "MAT", "TEX",
    "addUpdateCallback", "setObjectInfo", "physics", "CANNON",
  ];
  const stripReservedDecl = (src, name) => {
    const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`, "g");
    let result = "";
    let cursor = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const startIdx = m.index;
      const afterEq = m.index + m[0].length;
      // Find end of declaration: scan forward, balancing braces.
      // End condition: top-level ';' or newline AFTER all braces close.
      let i = afterEq;
      let depth = 0;
      let inStr = null; // quote char if inside a string
      while (i < src.length) {
        const ch = src[i];
        if (inStr) {
          if (ch === "\\") { i += 2; continue; }
          if (ch === inStr) inStr = null;
          i++; continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; i++; continue; }
        if (ch === "{" || ch === "(" || ch === "[") { depth++; i++; continue; }
        if (ch === "}" || ch === ")" || ch === "]") { depth--; i++; continue; }
        if (depth === 0 && (ch === ";" || ch === "\n")) { i++; break; }
        i++;
      }
      result += src.slice(cursor, startIdx);
      cursor = i;
    }
    result += src.slice(cursor);
    return result;
  };
  for (const name of WRAPPER_RESERVED) {
    out = stripReservedDecl(out, name);
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
  // Animations are NOW allowed — the engine's shader ticker and physics loop
  // depend on addUpdateCallback, and user scenes (orreries, fountains, etc.)
  // are much livelier with them on. We no longer regex-strip these calls;
  // the earlier non-greedy strip was the root cause of the fountain scene
  // failing (nested `.forEach(c => { ... })` inside an addUpdateCallback
  // tripped the regex and left orphan `});` fragments behind).

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

  // STEP 5.1: Strip LLM redeclarations of pre-injected identifiers.
  // Models frequently open the scene with something like
  //   `const { THREE, scene, root, MAT, TEX, SHADER, FLUID, H, P, addUpdateCallback } = this;`
  // or standalone `const THREE = params.THREE;` — both throw
  // "Identifier 'X' has already been declared" once we inline into the
  // wrapper, because the wrapper already hoists every one of those names.
  // Kill any destructure or const whose left-hand side contains a protected
  // identifier.
  const PROTECTED = [
    'THREE', 'scene', 'camera', 'renderer', 'root',
    'H', 'helpers', 'MAT', 'TEX', 'SHADER', 'FLUID', 'P', 'CELESTIAL', 'FX',
    'addUpdateCallback', 'removeUpdateCallback', 'setObjectInfo',
    'setFilmGrain', 'setScreenDroplets',
    'setChromatic', 'setDoF', 'setColorGrade', 'setLensFlare', 'setUnderwater', 'setEnvironment',
    'setAO', 'setBloom',
    'params',
  ];
  const protectedRE = new RegExp(`\\b(${PROTECTED.join('|')})\\b`);
  // Destructuring: const { THREE, scene, ... } = anything;
  out = out.replace(
    /(?:const|let|var)\s*\{[^}]*\}\s*=\s*[^;]+;?/g,
    (match) => (protectedRE.test(match) ? `// (removed redeclaration: ${match.replace(/\s+/g, ' ').slice(0, 80)}…)` : match)
  );
  // Single-binding: const THREE = something;
  for (const name of PROTECTED) {
    const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*[^;]+;?`, 'g');
    out = out.replace(re, `// (removed redeclaration of ${name})`);
  }
  // `this.X` references on a module-scope wrapper point at nothing useful —
  // swap them for the local identifier since it's already in scope.
  out = out.replace(/\bthis\.(THREE|scene|camera|renderer|root|H|helpers|MAT|TEX|SHADER|FLUID|P|addUpdateCallback|setObjectInfo)\b/g, '$1');

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
  // Post-FX toggles — defensive no-ops if the host doesn't provide them
  // so generated code never throws for optional effects.
  const setFilmGrain      = params.setFilmGrain      || (() => {});
  const setScreenDroplets = params.setScreenDroplets || (() => {});
  const setChromatic      = params.setChromatic      || (() => {});
  const setDoF            = params.setDoF            || (() => {});
  const setColorGrade     = params.setColorGrade     || (() => {});
  const setLensFlare      = params.setLensFlare      || (() => {});
  const setUnderwater     = params.setUnderwater     || (() => {});
  const setEnvironment    = params.setEnvironment    || (async () => {});
  const setAO             = params.setAO             || (() => {});
  const setBloom          = params.setBloom          || (() => {});
  const helpers = params.helpers;
  const H = helpers;

  // Engine libraries (MAT, TEX, SHADER, FLUID, P, CELESTIAL, FX) — injected
  // by ThreeViewer via ctx._engine so they share the same update loop the
  // helpers use.
  const { MAT, TEX, SHADER, FLUID, P, CELESTIAL, FX } = params._engine;
  params.MAT = MAT; params.TEX = TEX; params.SHADER = SHADER;
  params.FLUID = FLUID; params.P = P; params.CELESTIAL = CELESTIAL; params.FX = FX;
  params.H = H; params.helpers = H;

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

    // 3D default: Qwen3.6 35B A3B Q2_K_XL — MoE with 3B active params fits
    // comfortably in ~16GB VRAM while delivering frontier-tier code generation
    // for Three.js scene synthesis.
    const _3dModel = resolveLLM("qwen_3_6_35b_a3b", "q2");
    const model = {
        modelname: _3dModel.name,
        modeldesc: _3dModel.description,
        url: _3dModel.url,
        filename: _3dModel.filename,
        filesize: _3dModel.size,
        filesizeBytes: _3dModel.filesizeBytes,
        parameters: _3dModel.parameters,
        activeParameters: _3dModel.activeParameters,
        isMoE: _3dModel.isMoE,
        context: _3dModel.context,
        thinking: _3dModel.thinking,
    };

    const reasoningEnabled = ref(false);

    const currentModel = computed(() => model);

    const examplePrompts = ref([
      {
        icon: "\u2699\ufe0f",
        title: "Clockwork Heart",
        description: "Beating mechanism with blood-glass chambers",
        prompt: "An anatomical clockwork heart resting on a brass plinth — the outer shell is a semi-transparent glass dome with subtle iridescent sheen, through which four pulsing chambers of deep red translucent liquid can be seen slowly beating to an unseen rhythm. Around the equator of the heart runs a crown of ornate brass gear teeth, rotating just perceptibly. Delicate gold arterial tubes arc out of the top and loop back down into the heart's sides. The plinth is a polished marble slab with rune-like gold filigree. The whole piece is haloed in a faint crimson glow, crimson mist trailing from the base, fine gold flecks drifting around it.",
      },
      {
        icon: "\ud83c\udfdb\ufe0f",
        title: "Gem Pedestal",
        description: "Faceted gems resting on a marble pedestal",
        prompt: "A circular white-marble pedestal with a mirror-polished gold rim, atop which rest a small pile of faceted gemstones — ruby, sapphire, emerald, topaz, amethyst — each cut into distinct sharp facets that catch highlights and cast deep shadows where they meet the stone. The marble surface shows subtle grey veining running through it, polished to catch a faint reflection of the gems sitting on it. Gold dust motes drift in the air; a low mist curls at the base; each gem glows faintly from within, bright enough that the highlights bloom softly. Museum jewel-display lighting — single warm key light plus cool ambient fill from above.",
      },
      {
        icon: "\u26f2",
        title: "Cascading Fountain",
        description: "Tiered basins with reflective falling water",
        prompt: "An ornate three-tier stone fountain with water cascading from the smallest top basin down through the middle and into the wide bottom pool. Each basin is a shallow carved bowl with a gold inlay rim — the stone is deeply pitted and weathered, with moss darkening every crevice. Water inside each tier is a true reflective surface mirroring the scene above and showing real caustic patterns rippling across the pool floor below. Slender water columns pour between tiers, breaking into droplets and a fine mist where they impact. A central stone pillar connects the tiers with small gold spouts at each rim — the gold polished smooth so it catches and reflects the environment sharply, in contrast to the matte weathered stone.",
      },
      {
        icon: "\ud83d\udd2e",
        title: "Seer's Orb",
        description: "Crystal ball with cosmic nebula interior",
        prompt: "A large crystal-ball seer's orb cradled on an ornate bronze stand with three curved claw feet, each foot detailed with relief carvings that catch deep shadow between the toes. Inside the clear glass sphere, a deep purple cosmic nebula swirls hypnotically — stars, gas clouds and violet light drifting in real time, bright enough that the interior glow bleeds through the glass and blooms softly around the surface. A violet halo surrounds the outer sphere. Three amethyst gemstones are inset into the stand's base with faceted cuts that glint sharply. The bronze is polished along the claws and weathered-dark in the recesses, so the environment reflection plays across the smooth parts while the crevices sit in cool shadow. Purple mist curls at the foot; cyan sparks slowly orbit the orb.",
      },
      {
        icon: "\ud83d\udee1\ufe0f",
        title: "Holographic Shield",
        description: "Kite shield with live hologram interface",
        prompt: "A floating kite-shaped shield with a live holographic emerald-green interface projected across its front face — animated scanlines, flickering tactical data, a traveling signal wave bright enough to bloom off the plate. The shield body is deeply-etched brushed steel with relief circuit channels running vertically, the recesses dark with AO, the raised lands catching sharp highlights. Gold stud rivets at each corner and dark leather straps on the back. A translucent green force-field dome surrounds the entire shield, pulsing gently. A slow-rotating chrome ring orbits around it and shows a real reflection of the hologram on its inner face. Tiny green sparks orbit at varying radii.",
      },
      {
        icon: "\ud83e\uddea",
        title: "Alchemist's Flask",
        description: "Bubbling flask on gimbal with pouring potion",
        prompt: "An Erlenmeyer flask of clear glass mounted on a three-axis polished-brass gimbal, tilted at an angle and pouring a glowing emerald-green potion into a waiting glass goblet below. The glass has true refractive transmission so the potion colour bends through the walls; the potion itself glows bright enough that the pour-stream halo blooms softly. The potion surface ripples gently and fine bubbles rise through the liquid. Each brass ring carries etched rune-bands in its recessed channel, dark with shadow against the polished outer edge, and the rings rotate on their own axes at slightly different speeds. The pouring stream is a continuous column of flowing liquid with droplet accents, splashing outward where it strikes the goblet. The whole assembly sits on a dark oak plinth with subtle green mist hanging in the air.",
      },
      {
        icon: "\ud83d\udd2e",
        title: "Levitating Crystal",
        description: "Sharp amethyst spire orbiting a base platform",
        prompt: "A large sharply-faceted amethyst crystal levitating upright above a low obsidian platform deeply inscribed with gold rune glyphs — the glyphs recessed enough that the channels carry cool AO shadow while the gold catches highlights. The crystal slowly rotates and bobs gently on an unseen current; each facet catches the environment reflection differently, with a violet inner glow bright enough to bloom around the sharp edges. Eight smaller floating gems — sapphires, emeralds, rubies — orbit the platform on a horizontal ring, each catching the central crystal's violet glow. A purple fresnel halo surrounds the main crystal and a faint translucent hemisphere dome of energy covers the platform. Violet mist drifts at the base; tiny violet sparks rise steadily.",
      },
      {
        icon: "\ud83d\udd25",
        title: "Lava Obelisk",
        description: "Tall obsidian pillar with flowing lava veins",
        prompt: "An imposing black obsidian obelisk standing on a rough rocky platform — the obelisk's four faces deeply pitted and weathered, every crack and crater catching contact shadow. Glowing orange-red lava veins run down each face in jagged lightning-bolt patterns, visibly flowing and pulsing with heat, hot enough that the bright cores bloom into the air around them. A gold band wraps the top third and catches sharp environment reflections across its polished surface. The rocky platform below is shattered in layered slabs that cast soft shadows into each other. Ember particles rise continuously from the base, warm red mist pools at its feet and orange caustic light dances on the ground around it. Dust motes catch the lava's glow.",
      },
      {
        icon: "\ud83c\udf0c",
        title: "Starforge Anvil",
        description: "Glowing anvil with stellar metal being hammered",
        prompt: "A blacksmith's anvil forged from dark meteorite iron with a pitted, star-textured surface, mounted on a worn stone pillar whose erosion has left deep channels and crevices down its sides. A stellar ingot of molten star-metal lies glowing on the anvil's top — intense amber-orange, surface churning with heat, bright enough that the whole ingot blooms and casts warm rim-light onto the anvil. A heavy leather-gripped steel hammer hovers above, rising and falling in a slow rhythm and striking the ingot on each beat. On every impact a burst of golden splash particles erupts. The anvil and stone pillar sit in a pool of deep contact shadow where they meet the ground. Hundreds of golden sparks drift continuously in the surrounding air.",
      },
      {
        icon: "\ud83d\udc09",
        title: "Iridescent Dragon Egg",
        description: "Cracking egg on a nest of embers",
        prompt: "A large dragon egg — ovoid, taller than wide — with a tightly-overlapping iridescent scaled shell that shifts colors from bronze to violet to teal as the viewing angle changes. Each scale is raised enough to cast soft shadow on the one beneath, so the full surface reads as real relief rather than a flat texture. Three jagged thermal cracks run across the shell, lava-orange glow bleeding through from within — bright enough that the molten glow blooms around the cracks. The egg rests in a woven nest of twisted branches interspersed with glowing embers; the weave tangles deeply, with each branch-crossover dark in shadow. Caustic orange light patterns the ground beneath the nest, warm mist rises and hundreds of ember sparks drift upward continuously. A subtle orange halo surrounds the egg.",
      },
      {
        icon: "\u2696\ufe0f",
        title: "Balance of Fates",
        description: "Golden scales tipping with gemstone weights",
        prompt: "An ornate golden balance scale standing on a white-marble plinth with grey veining that the polish catches as faint reflection. The central column is intricately carved with fluted relief and leaf motifs — the recesses dark with contact shadow, the raised surfaces catching sharp highlights. Two shallow gold dishes hang from gold chain links at either end of a horizontal crossbeam; each chain link sits in soft shadow against the next. The left dish holds three ruby octahedron gemstones that glow bright enough to bloom around their sharp edges, the right dish is empty. The crossbeam tilts slowly back and forth as if weighing invisible fates. Amber mist pools below the plinth; fine gold dust drifts around the piece with sparks orbiting the gems.",
      },
      {
        icon: "\u2694\ufe0f",
        title: "Rune Sword Altar",
        description: "Sword embedded in stone with magical aura",
        prompt: "A broadsword driven vertically halfway into a rough-hewn stone altar. The altar's surface is scarred with chisel marks and shallow weathering, each groove catching deep shadow. The blade is polished brushed steel engraved with cyan runic script running down its length — the runes cut deeply into the steel so they hold shadow, and the glyphs themselves glow bright cyan, hot enough to bloom softly across the blade. The crossguard and fittings are mirror-polished gold catching sharp environment reflections; the grip is dark wrapped leather with thread-line detail; a faceted sapphire pommel glints at the end. A cyan dissolve-pulse ripples across the blade every few seconds. A translucent cyan energy hemisphere covers the altar. A circular rune inscription glows on the ground around the altar base. Cyan mist curls upward, cyan sparks rise continuously, and faint caustic light patterns the surrounding ground.",
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
        // Skip loaders (not useful for procedural scenes). postprocessing
        // cheatsheet IS useful now — it tells the LLM the setters exist
        // and warns against hand-rolling a composer.
        if (path.includes('threejs-loaders')) continue;
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

═══ MANDATORY AAA CHECKLIST — apply to EVERY scene, not just templates ═══
Every generation must pass these requirements. The default orrery scene
demonstrates all of them — treat it as the quality bar.

  [1] LIQUIDS: any water/potion/blood/acid/lava surface MUST use FLUID.*
      - Flat pool / lake / moat / basin top     → FLUID.oceanWater(geom, opts)
      - Fountain tier (bowl + rim + water)      → FLUID.fountainBasin({radius, y})
      - Pouring / falling column                → FLUID.stream({from, to, radius})
      - Liquid inside a glass container          → H.fillLiquid(c, color) THEN FLUID.upgradeFill(liquid)
      - Lava                                     → SHADER.lava({hot, cold})
      - NEVER build liquids from raw MeshPhysicalMaterial{transmission:...}
      - NEVER build a flat CircleGeometry / PlaneGeometry at a
        hand-picked Y to represent liquid inside a vessel. It will
        float above or below the rim. H.fillLiquid reads the vessel's
        LatheGeometry interior and produces a correctly-positioned
        liquid body + surface disc automatically. Pass the CONTAINER
        MESH (not its geometry) as first arg.
      - NEVER wrap engine calls in "typeof FLUID !== 'undefined'" or
        "if (FLUID && FLUID.surface)" defensive guards. MAT/TEX/SHADER
        /FLUID/P/FX/CELESTIAL are ALWAYS pre-declared. These guards
        silently skip the call and produce broken scenes.

  [2] GEMS / CRYSTALS: always faceted + colored lights
      - Use MAT.gem({color}) or MAT.gemRuby / gemEmerald / gemSapphire / gemAmethyst / gemTopaz / gemDiamond
        These set flatShading:true so every facet catches light differently.
      - For low-poly faceted geometry use OctahedronGeometry / DodecahedronGeometry /
        IcosahedronGeometry / TetrahedronGeometry at detail 0.
      - Drop root.add(MAT.gemLights(radius)) near any gem cluster to add the
        violet/pink/cyan point-light halo that makes gems truly pop.

  [3] MAGICAL GLOW / AURA: wrap the hero in moving particles
      - SHADER.flowParticles({bounds, color, color2, size, speed}) around
        any magical core, spellbook, energy object, artifact.
      - SHADER.nebula(inner, outer) inside an orb for a cosmos core.
      - SHADER.portal(color) for rifts, warp gates, magic mirrors.

  [4] ATMOSPHERIC DEPTH: the scene must breathe
      - CELESTIAL.nebulaCloud({dome:true, bounds, innerRadius}) if the scene
        calls for cosmic / mystical backdrop.
      - FLUID.mist + H.dust for close-range atmospheric motes.
      - H.sparks for impact / ember particles.

  [5] CINEMATIC FINISH — the AAA post stack (pmndrs/postprocessing).
      A cinematic BASELINE is already applied for every generation:
        setFilmGrain(0.035, 0.35)
        setChromatic(0.22, 2.2)
        setColorGrade({ saturation: 1.12, contrast: 1.04 })
        setDoF({ aperture: 0.006, maxblur: 0.006 })   // auto-focus on orbit target
        setUnderwater(false, { auto: true, ... })     // auto-triggers below water
        setAO({ radius: 0.6, intensity: 3.0 })        // N8AO screen-space AO
        setBloom({ intensity: 0.8, threshold: 0.85 }) // selective mipmap bloom
      You only need to call a setter when you want a scene-specific OVERRIDE
      or to enable one of these extra effects:
      - setLensFlare({ position: sunVec3, strength: 0.6, occlusionTest: true })
                                          if the scene has a visible sun or
                                          dominant emissive light source.
      - setScreenDroplets(0.3)            rain / aquatic / underwater mood.
      - setColorGrade({ ... })            re-tint for a specific mood.
      - setDoF({ aperture: 0.015 })       stronger blur for product-shot vibe.
      - setAO({ radius: 1.2, intensity: 5.0, quality: "Ultra" })
                                          deeper crevice shadows for stone/
                                          archviz/product renders.
      - setBloom({ intensity: 1.4, threshold: 0.6 })
                                          stronger glow for magical / neon
                                          scenes where highlights should glare.
      - await setEnvironment("studio" | "day" | "sunset" | "night")
                                          swap IBL preset for a scene-appropriate
                                          reflection/lighting base.

  [5b] POST-PROCESS-FREE BLOOM (cheaper than selective bloom):
      For any glowing hero (orb, crystal, magical core):
        root.add(FX.withGlow(coreMesh, 0x8b5cf6, { scale: 1.08, intensity: 1.3 }));
      Or use MAT.fakeGlow on a scaled-up shell mesh directly.

  [5c] MESH-BASED VOLUMETRIC LIGHT:
      For sunbeams through windows, magical shafts, spell channels:
        root.add(FX.godRayCone({ from: sunPos, to: floorPoint, color: 0xffe8a0 }));

  [6] PHYSICS for anything that can roll / fall / stack
      - await P.init({gravity: -4 to -9.81});
      - P.body(mesh, {type:'static'|'dynamic', shape, restitution, friction, density, angularDamping, radius?})
      - Dynamic gems/dice/rocks should use shape:'ball' with opts.radius for
        controlled rolling. Add rb.setAngvel({x,y,z}, true) for tumble on spawn.

  [7] BONZAI PALETTE (use when the prompt doesn't dictate a scheme)
      Purple #8b5cf6 / #a855f7, Green #10b981 / #48c78e,
      Pink #fe2d6e / #fe7eb0, Dark #0a0a0f

RULE: If the prompt is for "a gem", "a sword", "a potion", a single sculpture,
you STILL wrap it with items 3-5 (aura, atmosphere, grain). A lone mesh on a
black background is NEVER acceptable.

═══ RUNTIME SURFACE (pre-declared — never redeclare these names) ═══
  THREE, scene, camera, root (THREE.Group — add everything here)
  setObjectInfo({title, description})
  addUpdateCallback((ctx) => {...})   // ctx = { time, deltaTime } — YES, animate freely
  MAT, TEX, SHADER, FLUID, P, H

═══ MATERIAL LIBRARY (MAT.*) — reuse these before hand-rolling PBR ═══
Metals  : MAT.gold / silver / bronze / copper / iron / steel / chrome / brass / titanium / gunmetal / rust
Gems    : MAT.ruby / sapphire / emerald / amethyst / diamond / topaz / jade / obsidian / glass / crystal / ice
Organic : MAT.bone / flesh / leaf / bark / clay / marble / porcelain / ceramic / pearl / coral / moss
Energy  : MAT.lava / neon_cyan / neon_pink / neon_violet
Earth   : MAT.sand / snow / rubber / plastic / leather / velvet_black / silk_white
All entries are shared MeshPhysicalMaterial instances — clone() if you need per-mesh tweaks.

═══ PROCEDURAL TEXTURES (TEX.*) — all return CanvasTexture with RepeatWrapping ═══
  TEX.wood(base?, grain?), TEX.stone(base?), TEX.metal(base?), TEX.marble(base?, vein?)
  TEX.concrete(base?), TEX.rust(base?), TEX.grass(), TEX.scales(base?, ridge?)
  TEX.carbon(base?), TEX.brick(base?, mortar?), TEX.hexgrid(base?, line?)
  TEX.circuit(base?, trace?), TEX.fabric(base?), TEX.leather(base?), TEX.runes(base?, rune?)
Call .repeat.set(x, y) on the texture if you need tiling.

═══ SHADER LIBRARY (SHADER.*) — animated ShaderMaterial factories ═══
  SHADER.fresnel(color, power = 3, opacity = 0.9)              — rim halo for glowing halos / auras
  SHADER.hologram(color = 0x00e5ff, lineFreq = 80)             — scanlines + flicker for UI / energy
  SHADER.nebula(inner, outer)                                   — cosmic swirl inside spheres
  SHADER.lava(hot, cold, speed)  OR  SHADER.lava({hot, cold, speed, chroma?, displacement?, emissiveBoost?})
      Domain-warped molten flow with gradient-perturbed normals (bubbling
      surface, not a flat plane), RGB heat-shimmer at the crack edges,
      and pulsing worley-driven bright cores between cooled plates.
  SHADER.water(shallow, deep, speed)  OR  SHADER.water({shallow, deep, speed, chroma?, caustics?, waveAmp?})
      Lightweight (non-PBR) wavy surface with chromatic fresnel edge fringe
      and RGB-split worley caustics — use for distant lakes / stylized
      water. Real transmissive water → FLUID.surface / waterMaterial.
  SHADER.dissolve(base, edge, progress)                         — edge-glowing dissolve (animate progress)
  SHADER.forcefield(color, freq)                                — pulsing shield bands
  SHADER.iridescence(base)                                      — PBR with physical iridescence
  SHADER.starfield(density)                                     — back-sided skydome stars
  SHADER.caustics(color, {scale?, speed?, chroma?, intensity?, additive?}) — RGB-split worley caustics. Three wavelength-offset cell samples produce true chromatic fringing on the highlights. Default additive; set additive:false for an opaque caustic film.
  SHADER.portal(color, {color2?, speed?, swirl?, intensity?})            — swirling energy-rift shader for planes/discs. Twisted radial noise + bright event-horizon rim. Use for magic mirrors, warp gates, spell portals.
  SHADER.flowParticles({count?, bounds?, color?, color2?, size?, speed?, swirl?}) — organic swirling point-cloud driven by a 3D noise flow field. Returns a THREE.Points ready to add to root. No update-callback wiring needed.
  SHADER.hologram(color, lineFreq, { signalSpeed?, blink?, blinkRate?, additive?, opacity?, fresnelPower?, fresnelOnly? }) — Mancini/ektogamat recipe. Fresnel rim × scanline × traveling signal wave × blink. Additive by default for projection feel.
Every SHADER is hooked into the engine tick: uTime advances automatically.

═══ FX — MESH-BASED SCENE EFFECTS ═══
  FX.godRayCone({ from, to, color?, spread?, intensity? })
      Volumetric light shaft via a cone mesh with additive radial shader.
      Zero post-process cost. Use instead of screen-space god rays when
      you need scene-aware lighting through windows/portals.

  FX.withGlow(mesh, color, { scale?, intensity?, power? })
      Wraps a mesh with a fresnel-additive shell for post-process-FREE
      bloom. Cheaper than selective bloom, works everywhere:
        root.add(FX.withGlow(orb, 0x8b5cf6, { scale: 1.08, intensity: 1.3 }));

  FX.scatter(targetMesh, protoMesh, count, { scaleRange?, alignToNormal?, rotateY? })
      Scatter instanced copies of prototype across target surface via
      MeshSurfaceSampler. For foliage, crowds, debris fields. async —
      returns a Promise<InstancedMesh>.

  FX.batch([meshes], { material? })
      Collapse many varied-geometry meshes into a single BatchedMesh
      (one draw call, one material). Use for gem piles, debris, crowds
      of small unique props where InstancedMesh isn't enough. Pass the
      meshes you'd otherwise add to root — the batch replaces them.

  MAT.fakeGlow({ color, intensity?, power? })
      Raw material for the fake-glow technique. Pair with a cloned
      geometry scaled up 1.05–1.10× as a shell around any mesh.

═══ MATCAP MATERIALS (MAT.matcap*) ═══
MeshMatcapMaterial-backed presets that shade purely from a baked sphere
gradient — zero lights, gorgeous polish on small props. Use for hero gems,
cursed orbs, trophy pieces where you want a consistent jewel look that
doesn't respond to scene lighting.
  MAT.matcapGold, MAT.matcapChrome, MAT.matcapPearl
  MAT.matcapEmerald, MAT.matcapRuby, MAT.matcapOnyx
  MAT.matcap({base?, mid?, highlight?, rim?, color?, flatShading?}) — custom matcap

Water surface materials (waterMaterial, FLUID.stream, FLUID.surface) now
ship chromatic fresnel edge fringing + animated RGB worley caustics on the
surface itself — no post-processing needed to get the "dispersed light"
look. Tune via {caustics: 0..1, chroma: 0..0.05}.

═══ WATER + FLUID — UNIFIED LIQUID RULES ═══
Every liquid in a scene MUST share the same rendering — ripples, caustics,
fresnel, transmission. Mixing raw MeshPhysicalMaterial with FLUID.* produces
visually inconsistent fluids. STRICT RULES:

  [X] NEVER construct a new THREE.MeshPhysicalMaterial with transmission
     for anything that represents liquid (potion, blood, acid, water, oil).
  [X] NEVER build streams as raw TubeGeometry + material — use FLUID.stream.
  [X] NEVER use SHADER.water as a standalone shader — it exists only for
     back-compat and routes through the unified waterMaterial.

  [OK] Flat open water (pool, lake, moat, scrying basin, fountain top):
        FLUID.oceanWater(geometry, { color, distortionScale, speed, rippleDensity })
  [OK] FOUNTAIN BASIN (bowl + rim + water, all ready to use):
        root.add(FLUID.fountainBasin({ radius: 0.6, y: 0.0 }));
        // Returns a complete Group: stone bowl, gold inlay, obsidian lip,
        // reflective oceanWater surface. Use this for EVERY fountain tier.
        // Do NOT hand-build LatheGeometry bowls if a basin is the goal.
  [OK] Liquid on arbitrary geometry (basin interior, dish top, pond bed):
        FLUID.surface(geometry, { color, deep, waveAmp, caustics, chroma })
  [OK] Liquid INSIDE a container (flask, vial, goblet, cauldron):
        const liquid = H.fillLiquid(container, color, { fillLevel });
        FLUID.upgradeFill(liquid, { waveAmp: 0.003, caustics: 0.9 });
        // The upgradeFill call swaps the surface disc to waterMaterial so
        // the potion ripples like every other liquid in the scene.
  [OK] Pouring / cascading / falling water:
        FLUID.stream({ from: Vector3, to: Vector3, radius, color })
  [OK] Impact / splash bursts:
        FLUID.splash({ at: Vector3, count, color })
  [OK] Custom mesh that should be water-material:
        new THREE.Mesh(geometry, MAT.liquid({ color, waveAmp, caustics }))

  FLUID.stream({from, to, radius, color, deep?, droplets?})
      Curved, tapered TubeGeometry from A to B with the refractive water
      shader applied — wave displacement, foam on crests, depth tinting,
      accent droplets orbiting the column. THE default primitive for any
      pouring / cascading / falling water.

  FLUID.surface(geometry, {color, deep?, waveAmp?, waveFreq?, flow?})
      Applies the REFRACTIVE water shader (MeshPhysicalMaterial + fbm
      vertex displacement + PBR normal perturbation + RGB caustics) to
      any geometry. Use for liquid INSIDE a container: potion surface in
      a vial, acid pool, colored fluid in a glass jar — anywhere
      transmission through the fluid body is the point.

  FLUID.oceanWater(geometry, {color, distortionScale?, speed?, sunDirection?, sunColor?, textureWidth?, textureHeight?, normalMap?})
      AAA reflector-based water using THREE.Water. The scene is rendered
      to a render target each frame, then sampled with UVs perturbed by
      an animated normalmap. Fresnel mixes the reflection with the clear
      water color. THIS IS THE TECHNIQUE USED BY water-simulation.vercel.app.
      Use for mirror pools, lake surfaces, scrying basins, open water —
      anywhere the reflection of the environment sells the liquid.
      Default color 0x0a86c8 (clear blue); pass a darker color for deep
      water. distortionScale controls ripple strength (1 = calm, 5 = storm).

  FLUID.splash({at, count, color, size})
      Burst of individual refractive droplet SPHERES (each a real mesh
      with the water shader), tumbling outward from the impact point.
      Not flat sprites — volumetric drops.

Lighter particle-only helpers (use for foam/spray ONLY, not for the body
of the water):

  FLUID.pour({from, to, rate, color})   — sparse droplet stream, gravity-biased
  FLUID.mist({bounds, count, color})    — rising volumetric fog
  FLUID.pool({bounds, yBase, color})    — jittery particle surface (rarely needed — use FLUID.surface instead)

Legacy helpers still available:
  H.sparks/dust/bubbles/smoke/fire
  H.fillLiquid(containerMesh, color, {fillLevel, inset, opacity})
      For COLORED liquid inside glass containers (vials, potion bottles).

═══ CELESTIAL ═══
Shader-driven point clouds for skyboxes, galaxies, and nebulae. Every
star has a soft disc + cross-glare + twinkle — NOT flat dots.

  CELESTIAL.starfield({count, radius, colorA?, colorB?, colorC?, size?, twinkle?})
      Sphere-shell of twinkling stars. Parent to the scene when you want
      a spacey backdrop around the object (drop it centered on the hero).

  CELESTIAL.galaxy({count, arms, radius, inner?, outer?, size?, spin?})
      Spiral galaxy point cloud with arm swirl + per-radius color.
      Auto-rotates on its Y axis.

  CELESTIAL.nebulaCloud({count, bounds, colorA?, colorB?})
      Volumetric-looking nebula — large soft stars scattered in a bounding
      box, colored with a two-color gradient.

═══ PHYSICS (P.*) — Rapier, real dynamics ═══
  await P.init({ gravity: -9.81 });                 — once per scene, before any P.body(...)
  P.body(mesh, { type, shape, restitution, friction, density, linearDamping, angularDamping })
    type:  'dynamic' (default) | 'static' | 'kinematic'
    shape: 'box' (default) | 'ball' | 'capsule' | 'cylinder'
  P.impulse(rec, {x,y,z})      — kick a body
  P.setLinvel(rec, {x,y,z})    — set velocity

═══ POST-FX ═══
  setScreenDroplets(density, {speed?, size?})
      Rain-on-lens post effect. Screen-space refractive droplets distort
      the scene behind them with RGB chromatic dispersion per drop.
      density: 0 = off (default), 0.3 = drizzle, 1.0 = heavy rain.
      Useful for aquatic / underwater / rainy atmospheres — calling it
      once is enough; it's a post pass, not a particle system.

  setFilmGrain(strength, vignette)
      Cinematic grain overlay + soft vignette on the final frame.
      strength: 0 = clean, 0.04 = default cinematic, 0.08 = heavy grain.
      vignette: 0 = off, 0.25 = default, 0.6 = moody dark edges.

  setChromatic(strength, falloff?)
      Radial RGB-offset post pass. 0 = clean, 0.3 = subtle cyberpunk,
      1.0 = heavy distortion. Corner-weighted — centre stays clean.
      Call once at scene start: setChromatic(0.3).

  setDoF({ aperture, maxblur?, focus?, autoFocus? })
      Bokeh depth-of-field. By default the focus distance auto-tracks
      the orbit target, so the hero stays sharp as the user zooms. You
      almost always want just:   setDoF({ aperture: 0.015 });
      aperture: 0 = off, 0.012 = subtle, 0.025 = strong, 0.05 = heavy.
      Only pass a fixed 'focus' + 'autoFocus: false' for dolly-zoom
      cinematic effects where you want the focal plane locked.

  setColorGrade({ hue?, saturation?, contrast?, lift?, gain? })
      Hue rotation + saturation + contrast + lift/gain tint.
      Examples: cyberpunk: setColorGrade({saturation:1.3, contrast:1.15, gain:0xe0c8ff}).
                Sepia:     setColorGrade({saturation:0.3, gain:0xd4b480}).
                Cold:      setColorGrade({saturation:1.1, gain:0xc8d8ff}).

  setLensFlare({ position: Vector3, strength, tint?, anamorphic?, occlusionTest? })
      Anderson-Mancini-style screen-space lens flare with ghost chain +
      anamorphic streak + star-burst. Pass a world-space sun position;
      the flare is auto-projected to screen each frame. occlusionTest:
      true does a per-frame raycast so solid objects block the flare.
      setLensFlare({ position: new THREE.Vector3(8,6,-5), strength: 0.7, tint: 0xffd8a8, occlusionTest: true }).

  setUnderwater(active, { color?, distort?, rays?, waterY?, auto? })
      Submerged screen pass — blue tint + wave UV distortion + god-ray
      bars. Pass active=true for always-on, or auto=true + waterY=<y>
      to auto-activate when the camera crosses below that Y.
Ground plane: make a flat BoxGeometry at y=0 with opacity 0 and give it a static box body — catches falling debris.

═══ ANIMATION — YES, please ═══
  addUpdateCallback(({ time, deltaTime }) => {
    mesh.rotation.y = time * 0.5;
    mesh.position.y = 0.5 + Math.sin(time * 2) * 0.05;
  });
Drive orbits, pulses, gear spin, breathing, mechanism cycles. Keep logic idempotent: never mutate arrays or spawn geometry inside the callback.

═══ THREE.JS REFERENCE ═══
${skillsContext}
${recipeHint ? `\n═══ PATTERN HINT ═══\n${recipeHint}\n` : ''}
═══ AAA COMPOSITION CHECKLIST ═══
Aim for every generated piece to hit at least 4 of these:
  ✓ A hero silhouette — one dominant shape the eye locks onto
  ✓ Layered materials — pair a transmissive/iridescent element with a metallic one and an absorbing matte one
  ✓ One animated mechanism — rotating, orbiting, pulsing, or physics-driven
  ✓ One shader-driven surface — nebula/lava/hologram/water/fresnel
  ✓ Atmosphere — FLUID.mist OR H.dust OR SHADER.caustics on the ground
  ✓ Accent light — emissive highlights or SHADER.fresnel halo around a focal element
  ✓ Small physics details — optional, but 3-8 P.body dynamic props (gems, debris) make it feel alive
  ✓ Spatial cohesion — every sub-part positioned from a parent's bounding box, never hardcoded

═══ RULES ═══
- RAW JS only, COMPLETE code, no external assets, no post-processing, no markdown
- Object scale: fit ~1x1 footprint, height 0.3 - 1.5 world units, centered at origin
- Use complex geometry (LatheGeometry, ExtrudeGeometry, TubeGeometry along Curve3, BufferGeometry) — avoid plain boxes/spheres unless layered under a shader
- Shader materials go on their own meshes, not on detailed PBR geometry
- Always call \`await\` before P.init if you use physics
- Do NOT redeclare THREE/root/H/MAT/TEX/SHADER/FLUID/P/addUpdateCallback/setObjectInfo
- LatheGeometry points are Vector2(x=radius, y=height), bottom-to-top; closed vessels start and end at x ≈ 0
- TubeGeometry requires a Curve3 (CatmullRomCurve3, QuadraticBezierCurve3), NEVER an array of points
- MeshPhysicalMaterial has NO 'transparency' property — use 'transmission' / 'opacity'
- For liquid INSIDE glass, use H.fillLiquid(container, color, {fillLevel}); don't hand-roll a liquid mesh
- Compute dependent positions from parent geometry bounding boxes — no hardcoded y values for lids/bases/rings

═══ FORBIDDEN — these will crash ═══
- Nested MAT paths (MAT.gems, MAT.metals) — MAT is flat
- 'transparency' / 'specular' on MeshPhysicalMaterial
- requestAnimationFrame / setInterval / setTimeout (use addUpdateCallback)
- AxesHelper / GridHelper / debug gizmos

═══ QUALITY EXAMPLE — compact reference ═══
// Cinematic post baseline is already applied; only add scene overrides.
await P.init({ gravity: -4.5 });                                   // physics (optional)
const floor = new THREE.Mesh(new THREE.BoxGeometry(6,0.02,6),
  new THREE.MeshBasicMaterial({ visible:false }));
floor.castShadow = false; floor.userData.excludeFromBBox = true;
root.add(floor); P.body(floor, { type:'static', shape:'box' });

// Liquid in a glass vessel — CORRECT PATTERN:
//   1. Build container as a LatheGeometry MESH.
//   2. Pass the MESH (not its geometry) to H.fillLiquid.
//   3. Upgrade the returned group with FLUID.upgradeFill.
// H.fillLiquid reads the lathe profile and builds a liquid body +
// surface disc that sit INSIDE the container at the requested fill
// level. NEVER hand-roll a flat PlaneGeometry/CircleGeometry at a
// hard-coded Y — it will float above the rim.
const vessel = new THREE.Mesh(new THREE.LatheGeometry(profile, 48),
  new THREE.MeshPhysicalMaterial({ color:0xeef7ff, transmission:0.95,
    ior:1.5, roughness:0.04, thickness:0.2, clearcoat:1 }));
root.add(vessel);
const liquid = H.fillLiquid(vessel, 0x40ff80, { fillLevel:0.6 });
FLUID.upgradeFill(liquid, { waveAmp:0.003, caustics:0.9 });
root.add(liquid);

// WRONG — do NOT do this:
//   const liquidPlane = new THREE.Mesh(new THREE.CircleGeometry(r),
//     new THREE.MeshPhysicalMaterial({ color, transmission:1.0 }));
//   liquidPlane.position.y = 0.18; root.add(liquidPlane);
// This hand-picks a Y that never matches the vessel's actual rim and
// produces a potion floating in mid-air above the flask.

// Glow hero without paying post-bloom cost:
root.add(FX.withGlow(vessel, 0x8b5cf6, { scale:1.08, intensity:1.2 }));

// Atmosphere + motion:
const aura = SHADER.flowParticles({ count:600, bounds:{x:0.5,y:0.7,z:0.5},
  color:0x8b5cf6, color2:0x10b981, speed:0.35, swirl:0.5 });
aura.userData.excludeFromBBox = true; root.add(aura);
addUpdateCallback(({ time }) => { vessel.rotation.y = time*0.1; });

// Lens flare override only when there's a dominant emissive source:
// setLensFlare({ position: sunPos, strength:0.55, occlusionTest:true });

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
          setTimeout(() => reject(new Error("Timeout")), 3600000),
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
  const { THREE, scene, helpers: H, setObjectInfo, addUpdateCallback,
          setFilmGrain, setChromatic, setDoF, setColorGrade, setLensFlare,
          setUnderwater, setAO, setBloom, setEnvironment } = params;
  const { MAT, TEX, SHADER, FLUID, P, CELESTIAL, FX } = params._engine;
  const root = new THREE.Group();
  root.name = "ArcaneOrrery";

  setObjectInfo({
    title: "Arcane Orrery",
    description: "A breathing mechanical cosmos — armillary rings carry blue-marble planets veined with gold around a nebula core, over a mirrored moat and rune-carved dais, lit against a cold deep-space IBL."
  });

  // ── Scene-specific post overrides (baseline already covers grain,
  // subtle chromatic, color grade, AO and bloom). We bump AO because
  // this scene is all contact surfaces, push bloom selectively for
  // the emissive nebula hero, and swap IBL to the night preset so
  // brass/gold/silver catch cool reflections.
  setAO({ radius: 0.9, intensity: 4.0, falloff: 0.3, quality: "Ultra" });
  setBloom({ intensity: 1.0, threshold: 0.75, smoothing: 0.2, radius: 0.7 });
  setColorGrade({ saturation: 1.12, contrast: 1.05 });
  await setEnvironment("night", { intensity: 0.55 });

  // ── Physics world (Rapier). ──────────────────────────────────────────
  // The collider floor is INVISIBLE but explicitly marked no-shadow so it
  // doesn't project a square onto the dais.
  await P.init({ gravity: -4.5 });
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.02, 6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  floorMesh.position.y = -0.001;
  floorMesh.castShadow = false;
  floorMesh.receiveShadow = false;
  floorMesh.userData.excludeFromBBox = true;
  root.add(floorMesh);
  P.body(floorMesh, { type: 'static', shape: 'box', friction: 0.8 });

  // ── Visible stone dais (receives orrery shadow) ─────────────────────
  // Compact scene: total hero bbox kept under 1.5m so no auto-scale
  // squashes anything; the orrery renders at the exact dimensions below.
  const stoneTex = TEX.stone('#3a3640');
  stoneTex.repeat.set(3, 3);
  const daisGeo = new THREE.CylinderGeometry(0.44, 0.48, 0.06, 96);
  const daisMat = new THREE.MeshPhysicalMaterial({
    color: 0x7a7680, map: stoneTex, roughness: 0.82, metalness: 0.05, clearcoat: 0.15,
  });
  const dais = new THREE.Mesh(daisGeo, daisMat);
  dais.position.y = -0.03;
  dais.receiveShadow = true;
  dais.castShadow = false;
  root.add(dais);

  // Gold rim inlay around the dais edge.
  const daisRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.006, 24, 128),
    MAT.gold
  );
  daisRim.rotation.x = Math.PI / 2;
  daisRim.position.y = 0.003;
  daisRim.receiveShadow = true;
  root.add(daisRim);

  // ── Water moat — AAA reflector-based water (THREE.Water under the
  // hood). The pool renders a real reflection of the scene into an RT
  // each frame, then samples a ripple normalmap to distort it. This is
  // the exact technique used at water-simulation.vercel.app.
  //
  // Ring geometry works as the water plane — reflector handles its own
  // RT internally, perturbs UVs via the animated normalmap, and Fresnel-
  // mixes the reflection with the clear blue water color.
  const moatGeo = new THREE.RingGeometry(0.50, 1.10, 128, 4);
  const moat = FLUID.oceanWater(moatGeo, {
    color: 0x0a86c8,              // clear blue
    distortionScale: 2.2,
    speed: 1.2,
    rippleDensity: 10.0,          // tight ripples on a ~2m pool
    textureWidth: 1024,
    textureHeight: 1024,
    normalMapSize: 512,
    sunDirection: new THREE.Vector3(0.3, 0.9, 0.4).normalize(),
    sunColor: 0xffffff,
  });
  moat.rotation.x = -Math.PI / 2;
  moat.position.y = 0.02;
  root.add(moat);

  // Stone floor BENEATH the water — becomes visible through the clear
  // water where the reflection fresnel fades. This is what gives the
  // pool depth.
  const poolFloorTex = TEX.stone('#1a1230');
  poolFloorTex.repeat.set(3, 3);
  const poolFloor = new THREE.Mesh(
    new THREE.RingGeometry(0.50, 1.10, 128, 1),
    new THREE.MeshPhysicalMaterial({
      color: 0x4a2878, map: poolFloorTex,
      roughness: 0.85, metalness: 0.1,
      emissive: 0x1a0a2a, emissiveIntensity: 0.4,
    })
  );
  poolFloor.rotation.x = -Math.PI / 2;
  poolFloor.position.y = -0.02;
  poolFloor.receiveShadow = true;
  root.add(poolFloor);

  // Obsidian rims (outer + inner lip).
  const moatRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.10, 0.025, 24, 192),
    MAT.obsidian
  );
  moatRim.rotation.x = Math.PI / 2;
  moatRim.position.y = 0.022;
  moatRim.castShadow = true;
  root.add(moatRim);

  const moatLipInner = new THREE.Mesh(
    new THREE.TorusGeometry(0.50, 0.018, 24, 128),
    MAT.obsidian
  );
  moatLipInner.rotation.x = Math.PI / 2;
  moatLipInner.position.y = 0.022;
  moatLipInner.castShadow = true;
  root.add(moatLipInner);

  // ── Rune-engraved marble base with gold filigree ────────────────────
  const baseTex = TEX.runes('#1a1308', '#f5c776');
  baseTex.repeat.set(2, 1);
  const baseProfile = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.42, 0),
    new THREE.Vector2(0.42, 0.03),
    new THREE.Vector2(0.38, 0.05),
    new THREE.Vector2(0.36, 0.08),
    new THREE.Vector2(0.36, 0.14),
    new THREE.Vector2(0.34, 0.16),
    new THREE.Vector2(0.12, 0.18),
    new THREE.Vector2(0.10, 0.20),
    new THREE.Vector2(0.001, 0.20),
  ];
  const baseGeo = new THREE.LatheGeometry(baseProfile, 64);
  const baseMat = new THREE.MeshPhysicalMaterial({
    color: 0x252028, roughness: 0.25, metalness: 0.15, clearcoat: 0.85, map: baseTex,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.castShadow = true; baseMesh.receiveShadow = true;
  root.add(baseMesh);

  // Gold rim band around the top plate of the base.
  const rimGeo = new THREE.TorusGeometry(0.34, 0.012, 24, 128);
  const rim = new THREE.Mesh(rimGeo, MAT.gold);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.175;
  rim.castShadow = true;
  root.add(rim);

  // ── Rune-shard debris around the base (FX.batch = 1 draw call) ─────
  // Eighteen little obsidian tetrahedra scattered around the plinth.
  // Each catches AO where it meets the rune base, and the shared
  // purple emissive drives a subtle bloom halo across the pile.
  // FX.batch collapses all eighteen into a single BatchedMesh.
  const shardMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a2028, metalness: 0.4, roughness: 0.55,
    emissive: 0xa855f7, emissiveIntensity: 0.35,
  });
  const shards = [];
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
    const rad = 0.36 + Math.random() * 0.06;
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.009, 0), shardMat);
    m.position.set(Math.cos(ang) * rad, 0.19 + Math.random() * 0.008, Math.sin(ang) * rad);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    shards.push(m);
  }
  const shardBatch = FX.batch(shards, { material: shardMat });
  root.add(shardBatch);

  // ── Central column holding up the orrery head ──────────────────────
  const columnProfile = [
    new THREE.Vector2(0.04, 0), new THREE.Vector2(0.05, 0.05),
    new THREE.Vector2(0.035, 0.15), new THREE.Vector2(0.03, 0.28),
    new THREE.Vector2(0.05, 0.3), new THREE.Vector2(0.035, 0.32),
  ];
  const column = new THREE.Mesh(new THREE.LatheGeometry(columnProfile, 48), MAT.brass);
  column.position.y = 0.18;
  column.castShadow = true;
  root.add(column);

  // ── Nebula core: BonzAI-palette inner sphere + glass orb + halo ────
  const coreY = 0.62;
  const innerCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 64, 64),
    SHADER.nebula(0x8b5cf6, 0x0a0a0f)        // BonzAI purple on near-black
  );
  innerCore.position.y = coreY;
  root.add(innerCore);

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 96, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0xf0f0ff, transmission: 0.96, ior: 1.5, roughness: 0.03,
      thickness: 0.25, clearcoat: 1.0, transparent: true,
    })
  );
  orb.position.y = coreY;
  root.add(orb);

  const coreHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 48, 48),
    SHADER.fresnel(0xa855f7, 2.5, 0.75)       // BonzAI violet glow
  );
  coreHalo.position.y = coreY;
  root.add(coreHalo);

  // NOTE: Previous builds layered a fakeGlow shell at 1.8× the core to
  // simulate bloom. The new pmndrs BloomEffect + selective threshold
  // produce real post-bloom on the nebula shader's emissive output —
  // the extra shell is redundant and was doubling the halo intensity.

  // ── Lens flare: the core IS the sun ────────────────────────────────
  // Mancini's signature flare with ghost chain + anamorphic streak,
  // projected from the core's world position each frame. Raycast
  // occlusion is on, so the orrery's rings and pedestal partially
  // occlude the flare as the camera orbits.
  setLensFlare({
    position: new THREE.Vector3(0, coreY, 0),
    strength: 0.3,
    tint: 0xc28dff,
    anamorphic: 1.0,
    occlusionTest: true,
  });

  // ── God-ray cones radiating down from the core ─────────────────────
  // Four cones tilted outward — volumetric light shafts that read as
  // magical energy lancing into the moat. Mesh-based so no post cost.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const ray = FX.godRayCone({
      from: new THREE.Vector3(Math.cos(a) * 0.06, coreY - 0.02, Math.sin(a) * 0.06),
      to:   new THREE.Vector3(Math.cos(a) * 0.62, 0.08,          Math.sin(a) * 0.62),
      color: 0xa855f7,
      spread: 0.12,
      intensity: 0.45,
    });
    root.add(ray);
  }

  // ── Holographic projection ring — ektogamat recipe ────────────────
  // A thin torus hovering above the rings with hologram v2 material
  // (fresnel × scanlines × traveling signal × blink). fresnelOnly mode
  // so the body is transparent and only the rim glows, selling the
  // projection look.
  const projRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.012, 16, 128),
    SHADER.hologram(0x10b981, 60.0, {
      signalSpeed: 2.5,
      blink: 0.35,
      blinkRate: 2.0,
      fresnelOnly: true,
      additive: true,
      opacity: 0.85,
      fresnelPower: 1.8,
    })
  );
  projRing.rotation.x = Math.PI / 2;
  projRing.position.y = coreY + 0.32;
  root.add(projRing);
  addUpdateCallback(({ time }) => {
    projRing.rotation.z = time * 0.15;   // slow spin
  });

  // ── Three armillary rings — blue-marble-with-gold-veins planets ────
  // Each planet shares the same marble recipe but at different base/vein
  // tones (deep ocean to ice-blue) so they read as distinct worlds while
  // staying visually unified.
  const ringDefs = [
    { r: 0.28, mat: MAT.gold,   tiltX: 0,              tiltZ: 0,              speed: 0.45, marble: { base: '#08306a', vein: '#f5c776' }, halo: 0x4a9eff },  // deep ocean
    { r: 0.36, mat: MAT.brass,  tiltX: Math.PI / 3,    tiltZ: 0,              speed: 0.30, marble: { base: '#0a4a96', vein: '#ffd87a' }, halo: 0x5fb4ff },  // cobalt
    { r: 0.44, mat: MAT.silver, tiltX: Math.PI / 6,    tiltZ: Math.PI / 2.5,  speed: 0.20, marble: { base: '#1a6ec8', vein: '#fce37a' }, halo: 0x7ac8ff },  // sky
  ];
  const rings = [];
  for (let i = 0; i < ringDefs.length; i++) {
    const def = ringDefs[i];
    const tiltGroup = new THREE.Group();
    tiltGroup.position.y = coreY;
    tiltGroup.rotation.x = def.tiltX;
    tiltGroup.rotation.z = def.tiltZ;
    root.add(tiltGroup);

    const spinGroup = new THREE.Group();
    tiltGroup.add(spinGroup);

    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(def.r, 0.008, 16, 192),
      def.mat
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.castShadow = true;
    spinGroup.add(ringMesh);

    // Procedural blue-marble texture with gold veins. Wraps the sphere
    // twice so the vein pattern reads at any zoom. Clearcoat + low
    // roughness gives the polished-marble highlight.
    const marbleTex = TEX.marble(def.marble.base, def.marble.vein);
    marbleTex.repeat.set(2, 1);
    const planetMat = new THREE.MeshPhysicalMaterial({
      map: marbleTex,
      color: 0xffffff,
      metalness: 0.35,
      roughness: 0.28,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.032, 48, 48), planetMat);
    planet.castShadow = true;
    const planetHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.046, 24, 24),
      SHADER.fresnel(def.halo, 2.2, 0.55)
    );
    planet.add(planetHalo);
    planet.position.set(def.r, 0, 0);
    spinGroup.add(planet);

    rings.push({ tiltGroup, spinGroup, planet, speed: def.speed, phase: i * (Math.PI * 2 / 3) });
  }

  // ── Orbital animation ──────────────────────────────────────────────
  addUpdateCallback(({ time }) => {
    for (const r of rings) {
      r.spinGroup.rotation.y = time * r.speed + r.phase;
    }
    innerCore.rotation.y = time * 0.15;
    innerCore.rotation.x = time * 0.08;
    coreHalo.rotation.y = time * 0.1;
  });

  // ── Atmosphere: starfield + half-dome nebula + magic aura ─────────
  // Starfield shell far out, past the orrery and the camera. Auto-scale
  // is ~0.85× on a ~1.76m scene, so native distances should be ~6-10m
  // to read as a distant sky.
  const stars = CELESTIAL.starfield({ count: 1400, radius: 9, size: 36, twinkle: 0.75 });
  stars.position.y = coreY;
  root.add(stars);

  // DOME NEBULA — BonzAI purple/pink inner, green/violet outer.
  const nebulaInner = CELESTIAL.nebulaCloud({
    dome: true,
    count: 420,
    bounds: { x: 6.0, y: 4.5, z: 6.0 },
    innerRadius: 4.2,
    colorA: 0x8b5cf6,              // BonzAI purple
    colorB: 0xfe2d6e,              // BonzAI pink
    brightness: 1.0,
    size: 58,
  });
  nebulaInner.position.y = 0.2;
  root.add(nebulaInner);

  const nebulaOuter = CELESTIAL.nebulaCloud({
    dome: true,
    count: 260,
    bounds: { x: 9.0, y: 7.0, z: 9.0 },
    innerRadius: 6.5,
    colorA: 0x10b981,              // BonzAI green
    colorB: 0xa855f7,              // BonzAI violet
    brightness: 0.6,
    size: 80,
  });
  nebulaOuter.position.y = 0.4;
  root.add(nebulaOuter);

  // Flow-field magic aura — BonzAI purple × green swirl.
  const aura = SHADER.flowParticles({
    count: 900,
    bounds: { x: 0.55, y: 0.75, z: 0.55 },
    color:  0x8b5cf6,              // purple
    color2: 0x10b981,              // green
    size: 32,
    speed: 0.35,
    swirl: 0.5,
  });
  aura.position.y = coreY;
  aura.userData.excludeFromBBox = true;
  root.add(aura);

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
          maxTokens: reasoningEnabled.value ? 12288 : 10240,
          temperature: 0.7,
          thoughtTokens: reasoningEnabled.value ? undefined : 0,
        });
        const codeTokS = codeResult.elapsedMs > 0
          ? ((codeResult.tokenCount / codeResult.elapsedMs) * 1000).toFixed(1)
          : null;
        console.log("Raw LLM output:", codeResult.text);
        console.log(`Code gen: ${codeResult.tokenCount} tokens in ${(codeResult.elapsedMs / 1000).toFixed(1)}s (${codeTokS || '?'} tok/s), prefill: ${((codeResult.prefillMs || 0) / 1000).toFixed(1)}s`);

        let code = normalizeLLMCode(codeResult.text);
        let userCodeMatch = code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        let userCode = userCodeMatch ? userCodeMatch[1].trim() : "";

        // Retry path — if phase-2 produced no extractable code (small LLM
        // got eaten by prefill, thinking tokens, etc.) fall back to a
        // terse code-only prompt that reuses the blueprint and drops all
        // the verbose rules/reference. Gives the model one last chance
        // before we surface a failure to the user.
        if (!userCode) {
          console.warn("[3D] Phase-2 produced empty code — retrying with terse prompt.");
          lastStatus.value = "Retrying...";
          await window.electronAPI.resetChat();
          const tersePrompt = `You are a Three.js developer. Output ONLY raw JavaScript. No markdown, no prose, no <think>. Start with setObjectInfo(...).

TASK: ${blueprint}

Pre-declared: THREE, scene, root, MAT, TEX, SHADER, FLUID, P, H, FX, CELESTIAL, addUpdateCallback, setObjectInfo. Cinematic post-FX baseline is already applied.
For water/potion/blood: use FLUID.oceanWater / FLUID.fountainBasin / FLUID.stream / H.fillLiquid+FLUID.upgradeFill.
For glow: FX.withGlow(mesh, color, {scale, intensity}).
For physics: await P.init(); P.body(mesh, {...}).
Every mesh goes on root. Keep object height 0.3-1.5. No imports. No markdown fences.

OUTPUT CODE:`;
          const retry = await callLLM(tersePrompt, {
            maxTokens: 8192,
            temperature: 0.6,
            thoughtTokens: 0,
          });
          console.log("Retry raw output:", retry.text);
          code = normalizeLLMCode(retry.text);
          userCodeMatch = code.match(
            /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
          );
          userCode = userCodeMatch ? userCodeMatch[1].trim() : "";
        }

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
        const result = await callLLM(prompt, { maxTokens: reasoningEnabled.value ? 10240 : 8192, temperature: 0.7, thoughtTokens: reasoningEnabled.value ? undefined : 0 });
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
      enablePhysics,
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
