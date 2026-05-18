<template>
  <div class="background"></div>

  <div class="bz-tab-shell">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12">
          <header class="bz-screen-header">
            <div class="bz-screen-titleblock">
              <p class="bz-eyebrow">Create</p>
                <h1 class="bz-h1 fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined bz-title-icon"
                    aria-hidden="true"
                  >
                    3d_rotation
                  </span>
                  Generative 3D
                </h1>
            </div>
            <div class="bz-screen-actions">
                <button
                  class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
                  @click="showExamples = !showExamples"
                  title="View examples"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    {{ showExamples ? "visibility_off" : "lightbulb" }}
                  </span>
                  {{ showExamples ? "Hide" : "Examples" }}
                </button>
                <button
                  class="bz-btn bz-btn--warning fira-sans-condensed-black-italic"
                  :disabled="isLoading"
                  @click="clearScene"
                  title="Clear scene"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    delete_sweep
                  </span>
                  Clear
                </button>
            </div>
          </header>

          <!-- GENERATION PROGRESS -->
          <div v-if="isLoading" class="three-progress-card">
            <div class="three-progress-card__head">
              <div>
                <span class="three-progress-card__title fira-sans-condensed-black-italic">
                  <BonzaiPulse variant="dot" />
                  {{ stream.phase || 'Initializing' }}
                </span>
                <p v-if="stream.subtitle" class="three-progress-card__subtitle">
                  {{ stream.subtitle }}
                </p>
              </div>
              <span class="three-progress-card__pct fira-sans-condensed-black-italic">
                {{ streamProgress }}%
              </span>
            </div>
            <BonzaiPulse variant="bar" :percent="streamProgress" />
            <div class="three-progress-card__meta">
              <span>
                  {{ stream.tokenCount }} / {{ stream.maxTokens }} tokens
              </span>
              <span
                  :title="stream.tokenCount === 0
                    ? 'Computing attention over the system prompt before generation starts'
                    : 'True generation rate (excludes prefill)'"
                >
                  <template v-if="stream.tokenCount === 0">
                    warming up…
                  </template>
                  <template v-else>
                    {{ stream.tokensPerSec || '–' }} tok/s
                  </template>
              </span>
              <span>
                  {{ Math.round(stream.elapsedMs / 1000) }}s
              </span>
              <span
                  v-if="stream.prefillMs > 200"
                  title="Time the model spent computing attention over the prompt before the first token streamed back"
                >
                  prefill {{ (stream.prefillMs / 1000).toFixed(1) }}s
              </span>
            </div>

            <div class="three-progress-card__tip" :title="stream.tip">
              <BonzaiPulse variant="dot" />
              <span>
                {{ stream.tip || 'Preparing the 3D scene...' }}
              </span>
            </div>

            <div v-if="stream.preview" class="three-progress-card__preview">
              <div class="three-progress-card__preview-header">
                <span class="material-symbols-outlined" aria-hidden="true">terminal</span>
                <span>Live blueprint feed</span>
              </div>
              <pre
                ref="streamPreviewEl"
                class="three-progress-card__preview-body"
              >{{ stream.preview }}<span class="three-progress-card__cursor">▌</span></pre>
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
                <span class="material-symbols-outlined example-icon" aria-hidden="true">{{ example.icon }}</span>
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
                  class="three-notice three-notice--danger"
                >
                  <div class="three-notice__body">
                    <strong class="three-notice__title fira-sans-condensed-black-italic">
                      Download Required
                    </strong>
                    <ul class="download-list">
                      <li
                        v-for="model in missingRequiredModels"
                        :key="model.filename"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          deployed_code
                        </span>
                        <span class="download-item-name">
                          {{ model.role }}: {{ model.filename }}
                        </span>
                        <span class="download-item-size">
                          {{ model.filesize }}
                        </span>
                      </li>
                    </ul>
                  </div>
                  <button
                    class="bz-btn bz-btn--warning fira-sans-condensed-black-italic"
                    @click="downloadAllModels"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">download</span>
                    Download All
                  </button>
                </div>

                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="three-progress-card"
                >
                  <div class="three-progress-card__head">
                    <span class="three-progress-card__title fira-sans-condensed-black-italic">
                      <BonzaiPulse variant="dot" />
                      Downloading
                    </span>
                    <span class="three-progress-card__pct fira-sans-condensed-black-italic">
                      {{ Math.round(downloads.total_progress || 0) }}%
                    </span>
                  </div>
                  <BonzaiPulse variant="bar" :percent="downloads.progress || 0" />
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

                <GenerativeInput
                  v-model="form.prompt"
                  placeholder="Describe a 3D object..."
                  submit-label="Generate"
                  running-label="Building"
                  :running="isLoading"
                  :disabled="!canSubmitWithAccess || !hasAccess || !isModel"
                  shortcut-hint="⌘⏎"
                  @submit="onSubmit"
                />

                <!-- REFINE MODE -->
                <div
                  v-if="lastGeneratedCode && !isLoading"
                  class="refine-section mt-3"
                >
                  <div class="field has-addons">
                    <div class="control is-expanded">
                      <input
                        class="bz-field-input"
                        v-model="refinePrompt"
                        placeholder="Refine: make it taller, add fire particles, change material to ice..."
                        :disabled="isLoading"
                        @keydown.enter.exact.prevent="onRefine"
                      />
                    </div>
                    <div class="control">
                      <button
                        class="bz-btn bz-btn--success fira-sans-condensed-black-italic"
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
          <div class="environment-controls bz-3d-environment mt-5">
            <div class="bz-3d-control-group bz-3d-control-group--lighting">
              <div class="bz-3d-control-head">
                <span class="material-symbols-outlined">wb_sunny</span>
                <span>Lighting</span>
              </div>
              <div class="bz-3d-selector" role="group" aria-label="Lighting preset">
                <button
                  v-for="preset in lightingPresets"
                  :key="preset.id"
                  class="bz-3d-option"
                  :class="{ 'is-selected': currentTime === preset.id }"
                  @click="setTimeOfDay(preset.id)"
                  :title="preset.label"
                >
                  <span class="material-symbols-outlined">{{ preset.class }}</span>
                  <span>{{ preset.label }}</span>
                </button>
              </div>
            </div>

            <div class="bz-3d-control-group bz-3d-control-group--weather">
              <div class="bz-3d-control-head">
                <span class="material-symbols-outlined">cloud</span>
                <span>Weather</span>
              </div>
              <div class="bz-3d-selector" role="group" aria-label="Weather preset">
                <button
                  v-for="weather in weatherOptions"
                  :key="weather.id"
                  class="bz-3d-option"
                  :class="{ 'is-selected': currentWeather === weather.id }"
                  @click="setWeather(weather.id)"
                  :title="weather.label"
                >
                  <span class="material-symbols-outlined">{{ weather.class }}</span>
                  <span>{{ weather.label }}</span>
                </button>
              </div>
            </div>

            <div class="bz-3d-control-group bz-3d-control-group--performance">
              <div class="bz-3d-control-head">
                <span class="material-symbols-outlined">speed</span>
                <span>Performance</span>
              </div>
              <div class="bz-3d-selector" role="group" aria-label="Performance preset">
                <button
                  v-for="preset in performancePresets"
                  :key="preset.id"
                  class="bz-3d-option"
                  :class="{ 'is-selected': currentPerformance === preset.id }"
                  @click="setPerformance(preset.id)"
                  :title="preset.label"
                >
                  <span class="material-symbols-outlined">{{ preset.class }}</span>
                  <span>{{ preset.label }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- VIEWER -->
          <div class="viewer-container">
            <div class="viewer-wrapper">
              <ThreeViewer
                ref="threeViewer"
                :enablePhysics="enablePhysics"
                :initial-time-of-day="currentTime"
                :initial-weather="currentWeather"
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
                  class="bz-h2 fira-sans-condensed-black-italic"
                >
                  <span class="material-symbols-outlined bz-section-icon">
                    history
                  </span>
                  Generation History
                </h2>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item buttons">
                <button
                  class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                  @click="importHistory()"
                >
                  <span class="material-symbols-outlined mr-2">upload</span>
                  Import
                </button>
                <button
                  class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                  @click="exportHistory()"
                  :disabled="objectInferences.length === 0"
                >
                  <span class="material-symbols-outlined mr-2">download</span>
                  Export
                </button>
                <button
                  class="bz-btn bz-btn--sm bz-btn--destructive fira-sans-condensed-black-italic"
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
                  <div class="three-history-preview">
                    <img
                      v-if="historyThumbnail(item)"
                      :src="historyThumbnail(item)"
                      :alt="item.screenshots?.[0]?.label || item.prompt || '3D object preview'"
                    />
                    <div v-else class="three-history-preview__empty">
                      <span class="material-symbols-outlined" aria-hidden="true">3d_rotation</span>
                    </div>
                  </div>
                  <div class="history-header">
                    <span class="answer__model">
                      <span class="material-symbols-outlined mr-2">neurology</span>
                      {{ item.model || 'three-js' }}
                      <span v-if="item.tokensPerSecond" class="answer__tps">
                        @ {{ item.tokensPerSecond }} tok/s
                      </span>
                    </span>
                    <span class="history-meta fira-sans-condensed-black-italic">
                      {{ formatHistoryDate(item.timestamp || item.createdAt) }}
                    </span>
                  </div>

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
                  <GenerativeActions
                    :actions="actionsFor(item)"
                    @action="(id) => handleAction(id, item)"
                  />
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
      <BzCloseButton class="screenshot-modal-close" size="md" aria-label="Close screenshot" @click="closeScreenshotModal" />
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
          class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
          @click="downloadScreenshot(screenshotModal.currentShot)"
        >
          <span class="material-symbols-outlined mr-1">download</span>
          Download
        </button>
        <button class="bz-btn bz-btn--primary fira-sans-condensed-black-italic" @click="downloadAllScreenshots">
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

  <Transition name="bz-image-toast">
    <div
      v-if="pendingDelete"
      class="bz-image-delete-toast"
      role="status"
      aria-live="polite"
    >
      <span class="material-symbols-outlined" aria-hidden="true">delete</span>
      <span class="bz-image-delete-toast__body">
        {{ pendingDelete.all ? 'Clear 3D history?' : 'Delete this object?' }}
      </span>
      <button type="button" class="bz-image-delete-toast__ghost" @click="dismissDeleteToast">
        Cancel
      </button>
      <button type="button" class="bz-image-delete-toast__danger" @click="confirmDeleteObject">
        {{ pendingDelete.all ? 'Clear' : 'Delete' }}
      </button>
    </div>
  </Transition>
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
import BonzaiPulse from "./BonzaiPulse.vue";
import BzCloseButton from "./BzCloseButton.vue";
import GenerativeInput from "./generative/GenerativeInput.vue";
import GenerativeActions from "./generative/GenerativeActions.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { fetchNFT3DCode } from "../services/contentNFT.service.js";
import { inspector as generationInspector } from "../services/generationInspector.service.js";
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

  // STEP 0: Strip reasoning/thinking tags (Qwen 3.5, GLM, Nanbeige, etc.)
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

  // STEP 3.4: Correct common LLM typos of pre-declared API functions.
  // The model occasionally scrambles function name word order or drops
  // a prefix. Each entry maps a typo variant → canonical name. Match
  // uses word boundaries + lookahead for `(` so we only hit call sites,
  // not substrings inside identifiers like `prevSetObjectInfo`.
  const API_TYPO_FIXES = [
    // setObjectInfo
    [/\bobjectSetInfo\s*\(/g, "setObjectInfo("],
    [/\bsetObjectinfo\s*\(/g, "setObjectInfo("],
    [/\bsetobjectInfo\s*\(/g, "setObjectInfo("],
    [/\bSetObjectInfo\s*\(/g, "setObjectInfo("],
    [/\bsetObject\s*\(/g,     "setObjectInfo("],
    [/\bsetSceneInfo\s*\(/g,  "setObjectInfo("],
    // addUpdateCallback
    [/\baddUpdateCall\s*\(/g,      "addUpdateCallback("],
    [/\bregisterUpdate\s*\(/g,     "addUpdateCallback("],
    [/\bonUpdate\s*\(/g,           "addUpdateCallback("],
    [/\bonFrameUpdate\s*\(/g,      "addUpdateCallback("],
    // Post FX setters — mostly forget the "set" prefix.
    [/\bsetFilmgrain\s*\(/g, "setFilmGrain("],
    [/\bsetDof\s*\(/g,       "setDoF("],
    [/\bsetLensflare\s*\(/g, "setLensFlare("],
    [/\bsetChroma\s*\(/g,    "setChromatic("],
    [/\bsetAo\s*\(/g,        "setAO("],
  ];
  for (const [re, replacement] of API_TYPO_FIXES) {
    out = out.replace(re, replacement);
  }

  // STEP 3.4b: Fix the "const NAMESPACE.Member = ..." anti-pattern.
  // The codegen sometimes treats engine namespaces (MAT, TEX, FLUID, …)
  // as if they were writable namespaces it could declare into:
  //
  //   const MAT.PolishedBrass = new THREE.MeshPhysicalMaterial({...});
  //   const TEX.Custom = TEX.stone(...);
  //
  // That's a JS syntax error — `const` requires a bare identifier, not
  // a member expression — and produces the misleading "Identifier 'MAT'
  // has already been declared" message because the parser bails after
  // reading `const MAT` and seeing the `.`. Strip the `const` so the
  // assignment becomes a plain property write (the engine namespaces
  // are object refs and accept new properties).
  //
  // This rewrite intentionally runs BEFORE the wrapper-reserved
  // stripper below so the namespace identifier survives intact.
  const NAMESPACE_NAMES = "MAT|TEX|SHADER|FLUID|H|helpers|P|CELESTIAL|FX";
  out = out.replace(
    new RegExp(`\\b(?:const|let|var)\\s+(${NAMESPACE_NAMES})\\.(\\w+)\\s*=`, "g"),
    "$1.$2 =",
  );

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

  // STEP 3.6: Collapse duplicate top-level `const/let/var NAME = ...`
  // declarations. The LLM "thinks out loud" mid-code — re-declaring the
  // same variable (e.g. lathe profile) multiple times while working
  // through variants at the module's top level.
  //
  // CRITICAL: only strip duplicates that share MODULE TOP-LEVEL scope
  // (brace depth 0). Block-scoped bindings inside `for` loop headers
  // (`for (let i = 0; ...)`) or different loop bodies that happen to
  // share a name like `const angle` / `const spout` are legal JS —
  // they live in separate block scopes and must NOT be stripped.
  //
  // Uses the same brace-balancing walker as stripReservedDecl so
  // multi-line RHS values (arrow functions, object literals,
  // Vector2(...) arrays) are caught as single ranges.
  {
    // Pre-compute the nesting depth at every index so we can cheaply
    // test whether a match is at top-level.
    const depths = new Int32Array(out.length + 1);
    {
      let d = 0, inStr = null;
      for (let i = 0; i < out.length; i++) {
        depths[i] = d;
        const ch = out[i];
        if (inStr) {
          if (ch === "\\") { i++; continue; }
          if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
        if (ch === "{" || ch === "(" || ch === "[") d++;
        else if (ch === "}" || ch === ")" || ch === "]") d--;
      }
      depths[out.length] = d;
    }

    const declRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
    const occurrences = new Map();
    let m;
    while ((m = declRe.exec(out)) !== null) {
      // Only consider top-level declarations (depth 0 at the keyword).
      if (depths[m.index] !== 0) continue;
      const name = m[1];
      const startIdx = m.index;
      const afterEq = m.index + m[0].length;
      // Walk forward balancing braces until we hit top-level ; or \n.
      let i = afterEq;
      let depth = 0;
      let inStr = null;
      while (i < out.length) {
        const ch = out[i];
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
      if (!occurrences.has(name)) occurrences.set(name, []);
      occurrences.get(name).push({ start: startIdx, end: i });
    }
    const toComment = [];
    for (const [name, ranges] of occurrences) {
      if (ranges.length < 2) continue;
      for (let k = 0; k < ranges.length - 1; k++) toComment.push(ranges[k]);
    }
    toComment.sort((a, b) => b.start - a.start);
    for (const r of toComment) {
      const block = out.slice(r.start, r.end);
      const firstLine = block.split("\n", 1)[0].slice(0, 90);
      out = out.slice(0, r.start) +
            `// (removed duplicate declaration: ${firstLine.replace(/\s+/g, ' ')}…)` +
            out.slice(r.end);
    }
  }

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
  // setHeightFog is intentionally NOT exposed here. Weather (fog, rain,
  // lightning, lens droplets) is scene-level state owned by the viewer;
  // generated scenes inherit whatever the user selected in the weather
  // panel rather than forcing their own atmosphere.
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

function stripJSComments(code) {
  let out = "";
  let i = 0;
  let inStr = null;
  let inLine = false;
  let inBlock = false;

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      i++;
      continue;
    }

    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inStr) {
      out += ch;
      if (ch === "\\") {
        out += next || "";
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      out += ch;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function validateRenderableUserCode(userCode) {
  const executable = stripJSComments(String(userCode || "")).trim();

  if (!executable) {
    return { ok: false, reason: "LLM produced comments/prose but no executable JavaScript" };
  }

  if (!/root\.add\s*\(/.test(executable)) {
    return { ok: false, reason: "Generated code never adds visible objects to root" };
  }

  const createsRenderable =
    /\bnew\s+THREE\.(?:Mesh|Group|Points|Sprite|Line|LineSegments|InstancedMesh)\b/.test(executable) ||
    /\b(?:FLUID|FX|CELESTIAL)\./.test(executable) ||
    /\bH\.(?:dust|bubbles|sparks|smoke|label|text|ribbon|trail)\s*\(/.test(executable);

  if (!createsRenderable) {
    return { ok: false, reason: "Generated code does not create any renderable geometry or engine object" };
  }

  return { ok: true, reason: "" };
}

function stripThinkBlocks(text) {
  let out = String(text || "");
  out = out.replace(/<think>[\s\S]*?<\/think>\s*/gi, "");
  out = out.replace(/<\|thinking\|>[\s\S]*?<\|\/thinking\|>\s*/gi, "");
  out = out.replace(/<think>[\s\S]*$/gi, "");
  out = out.replace(/<\|thinking\|>[\s\S]*$/gi, "");
  return out.trim();
}

function modelFromResolved(resolved, role) {
  return {
    role,
    modelname: resolved.name,
    modeldesc: resolved.description,
    url: resolved.url,
    filename: resolved.filename,
    filesize: resolved.size,
    filesizeBytes: resolved.filesizeBytes,
    parameters: resolved.parameters,
    activeParameters: resolved.activeParameters,
    isMoE: resolved.isMoE,
    context: resolved.context,
    thinking: resolved.thinking,
    draftModel: resolved.draftModel || null,
    draftUrl: resolved.draftUrl || null,
    specType: resolved.specType || null,
    specDraftNMax: resolved.specDraftNMax || null,
    mtp: resolved.mtp || false,
  };
}

export default {
  name: "Generative3D",
  components: { ThreeViewer, AccessRequirements, MintModal, BonzaiPulse, BzCloseButton, GenerativeInput, GenerativeActions },
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
    const pendingDelete = ref(null);
    let pendingDeleteTimer = null;

    // ───── Game-style loading screen state ────────────────────────────────
    // Driven by the streaming LLM call. Each phase resets these and the
    // tip rotator picks a new flavor message every few seconds while the
    // generation runs. Token count + tok/s come straight from the stream;
    // progress is estimated against the configured maxTokens for the phase.
    const stream = reactive({
      active: false,
      phase: "",          // "Designing Blueprint" | "Vibe Coding" | "Rendering" | "Refining" | "Retrying"
      subtitle: "",       // optional secondary line
      tokenCount: 0,
      maxTokens: 1,
      tokensPerSec: 0,    // TRUE generation rate (excludes prefill) — what the user wants to read
      elapsedMs: 0,
      prefillMs: 0,       // time-to-first-token; large for big prompts
      preview: "",        // last N chars of the streamed output
      tip: "",            // rotating loader tip
    });

    /**
     * Loader tips. Themed to scene/world generation, in the spirit of
     * "Calibrating polygons" / "Compiling shaders" loading screens that
     * games used to ship with. Pulled from this pool every 2.4s while
     * a generation is running.
     */
    const LOADER_TIPS = [
      "Calibrating polygons…",
      "Compiling shaders…",
      "Tessellating surfaces…",
      "Baking lightmaps…",
      "Aligning normals…",
      "Casting global illumination…",
      "Spawning particle systems…",
      "Sourcing artisanal pixels…",
      "Negotiating with the GPU…",
      "Defragmenting the matrix…",
      "Whispering to the polygons…",
      "Rendering the first triangle…",
      "Tuning the bloom shader…",
      "Folding the mesh in half…",
      "Pre-warming the raytracer…",
      "Inflating ambient occlusion…",
      "Calibrating the skybox…",
      "Polishing the bevels…",
      "Quantum-aligning vertices…",
      "Reticulating splines…",
    ];
    let _tipTimer = null;
    function _rotateTip() {
      const next = LOADER_TIPS[Math.floor(Math.random() * LOADER_TIPS.length)];
      // Avoid the immediate same tip twice in a row.
      stream.tip = next === stream.tip ? LOADER_TIPS[(LOADER_TIPS.indexOf(next) + 1) % LOADER_TIPS.length] : next;
    }
    function _startTipRotator() {
      _stopTipRotator();
      _rotateTip();
      _tipTimer = setInterval(_rotateTip, 2400);
    }
    function _stopTipRotator() {
      if (_tipTimer) {
        clearInterval(_tipTimer);
        _tipTimer = null;
      }
    }

    /**
     * Strip `<think>…</think>` blocks from a streaming preview so the
     * model's internal monologue never leaks into the loading screen
     * (matches the GenerativeText behavior). Tolerates an unterminated
     * `<think>` (live stream): we just hide everything from the open tag
     * onward until `</think>` arrives.
     */
    function _stripThinkForPreview(text) {
      if (!text) return "";
      let out = "";
      let cursor = 0;
      while (cursor < text.length) {
        const open = text.indexOf("<think>", cursor);
        if (open === -1) {
          out += text.slice(cursor);
          break;
        }
        out += text.slice(cursor, open);
        const close = text.indexOf("</think>", open + 7);
        if (close === -1) break; // mid-think, hide tail
        cursor = close + 8;
      }
      return out;
    }

    function _resetStream(phase, maxTokens, subtitle = "") {
      stream.active = true;
      stream.phase = phase;
      stream.subtitle = subtitle;
      stream.tokenCount = 0;
      stream.maxTokens = Math.max(1, maxTokens);
      stream.tokensPerSec = 0;
      stream.elapsedMs = 0;
      stream.prefillMs = 0;
      stream.preview = "";
      _startTipRotator();
    }

    function _endStream() {
      stream.active = false;
      _stopTipRotator();
    }

    /**
     * Estimated progress 0–99% (we never claim 100 until the phase ends —
     * the actual token budget is rarely hit exactly).
     */
    const streamProgress = computed(() => {
      if (!stream.active) return 0;
      const pct = Math.floor((stream.tokenCount / stream.maxTokens) * 100);
      return Math.min(99, Math.max(0, pct));
    });

    // Auto-scroll the live preview to keep the latest tokens visible.
    const streamPreviewEl = ref(null);
    watch(
      () => stream.preview,
      () => {
        nextTick(() => {
          const el = streamPreviewEl.value;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
    );
    // Use shared inference store for 3D objects
    const objectInferences = computed(() =>
      inferenceStore.state.objectInferences.filter((item) => item?.success !== false),
    );
    const hasCopy = reactive([]);
    const enablePhysics = ref(true);
    const currentTime = ref(localStorage.getItem("bonzai-3d-time") || "day");
    const currentWeather = ref(localStorage.getItem("bonzai-3d-weather") || "sunny");
    const lightIntensity = ref(1.0);
    const loadedModelFilename = ref(null);
    const form = reactive({ prompt: "" });
    const lastGeneratedCode = ref('');
    const refinePrompt = ref('');
    const downloadProgress = ref(0);
    const modelAvailability = reactive({
      planner: false,
      codegen: false,
    });

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
        refreshRequiredModelAvailability();
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
          await refreshRequiredModelAvailability();
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
        const requiredFilenames = new Set(
          requiredModelFiles.value.map((model) => model.filename),
        );
        const relevantLLM = activeLLM.filter((d) =>
          requiredFilenames.has(d.filename),
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
            if (requiredFilenames.has(data.filename)) {
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

    // Computed: needs download if either required LLM model is missing
    const needsDownload = computed(() => !isModel.value);

    // Download required models (LLM)
    const downloadAllModels = async () => {
      if (downloads.active) return;

      downloads.active = true;
      downloads.status = "downloading";
      downloads.progress = 0;
      downloads.total_progress = 0;
      downloads.pipeline = { tasks: {} };

      try {
        for (const model of missingRequiredModels.value) {
          const llmTaskId = `llm-${model.filename}`;
          downloads.pipeline.tasks[llmTaskId] = {
            task_id: llmTaskId,
            filename: model.filename,
            label: model.role,
            status: "downloading",
            progress: 0,
          };

          const llmProgressHandler = (e, data) => {
            if (data.filename === model.filename) {
              const pct = Math.round(data.percent * 100);
              downloads.pipeline.tasks[llmTaskId].progress = pct;
              updateTotalProgress();
            }
          };
          window.electronAPI.onDownloadProgress(llmProgressHandler);

          const success = await window.electronAPI.downloadModel(
            model.url,
            model.filename,
          );

          if (success) {
            downloads.pipeline.tasks[llmTaskId].status = "completed";
            downloads.pipeline.tasks[llmTaskId].progress = 100;
            for (const role of model.roles || [model.role]) {
              modelAvailability[role.toLowerCase()] = true;
            }
          } else {
            downloads.pipeline.tasks[llmTaskId].status = "failed";
          }
          updateTotalProgress();
        }

        if (isModel.value) {
          downloads.status = "completed";
          downloads.progress = 100;
          downloads.total_progress = 100;
        } else {
          downloads.status = "failed";
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

    // Performance tiers — engine-level quality preset. Dials pixel ratio,
    // N8AO, SMAA, bloom kernel, DoF gating, shadow map size, and BVH
    // auto-build threshold.
    const performancePresets = ref([
      { id: "low",    label: "Low",    class: "battery_android_full" },
      { id: "medium", label: "Medium", class: "speed" },
      { id: "high",   label: "High",   class: "bolt" },
      { id: "ultra",  label: "Ultra",  class: "diamond" },
    ]);
    const currentPerformance = ref("high");

    // 3D model split:
    // - Planner rewrites the prompt into a geometric blueprint.
    // - Codegen writes the actual Three.js object.
    const plannerModel = computed(() =>
      modelFromResolved(resolveLLM("qwen3_5_9b_deepseek_v4_flash", "q4"), "Planner"),
    );
    const codeModel = computed(() =>
      modelFromResolved(resolveLLM("qwen3_5_9b_deepseek_v4_flash", "q4"), "Codegen"),
    );
    const requiredModels = computed(() => [plannerModel.value, codeModel.value]);
    const requiredModelFiles = computed(() => {
      const byFilename = new Map();
      for (const model of requiredModels.value) {
        const existing = byFilename.get(model.filename);
        if (existing) {
          existing.roles.push(model.role);
          existing.role = existing.roles.join(" + ");
        } else {
          byFilename.set(model.filename, { ...model, roles: [model.role] });
        }
      }
      return [...byFilename.values()];
    });

    const reasoningEnabled = ref(false);

    const currentModel = computed(() => codeModel.value);
    const missingRequiredModels = computed(() =>
      requiredModelFiles.value.filter((model) =>
        model.roles.some((role) => !modelAvailability[role.toLowerCase()]),
      ),
    );
    const isModel = computed(() => missingRequiredModels.value.length === 0);

    const examplePrompts = ref([
      {
        icon: "settings",
        title: "Clockwork Heart",
        description: "Beating mechanism with blood-glass chambers",
        prompt: "An anatomical clockwork heart resting on a brass plinth — the outer shell is a semi-transparent glass dome with subtle iridescent sheen, through which four pulsing chambers of deep red translucent liquid can be seen slowly beating to an unseen rhythm. Around the equator of the heart runs a crown of ornate brass gear teeth, rotating just perceptibly. Delicate gold arterial tubes arc out of the top and loop back down into the heart's sides. The plinth is a polished marble slab with rune-like gold filigree. The whole piece is haloed in a faint crimson glow, crimson mist trailing from the base, fine gold flecks drifting around it.",
      },
      {
        icon: "foundation",
        title: "Gem Pedestal",
        description: "Faceted gems resting on a marble pedestal",
        prompt: "A circular white-marble pedestal with a mirror-polished gold rim, atop which rest a small pile of faceted gemstones — ruby, sapphire, emerald, topaz, amethyst — each cut into distinct sharp facets that catch highlights and cast deep shadows where they meet the stone. The marble surface shows subtle grey veining running through it, polished to catch a faint reflection of the gems sitting on it. Gold dust motes drift in the air; a low mist curls at the base; each gem glows faintly from within, bright enough that the highlights bloom softly. Museum jewel-display lighting — single warm key light plus cool ambient fill from above.",
      },
      {
        icon: "water_drop",
        title: "Cascading Fountain",
        description: "Tiered basins with reflective falling water",
        prompt: "An ornate three-tier stone fountain with water cascading from the smallest top basin down through the middle and into the wide bottom pool. Each basin is a shallow carved bowl with a gold inlay rim — the stone is deeply pitted and weathered, with moss darkening every crevice. Water inside each tier is a true reflective surface mirroring the scene above and showing real caustic patterns rippling across the pool floor below. Slender water columns pour between tiers, breaking into droplets and a fine mist where they impact. A central stone pillar connects the tiers with small gold spouts at each rim — the gold polished smooth so it catches and reflects the environment sharply, in contrast to the matte weathered stone.",
      },
      {
        icon: "blur_circular",
        title: "Seer's Orb",
        description: "Crystal ball with cosmic nebula interior",
        prompt: "A large crystal-ball seer's orb cradled on an ornate bronze stand with three curved claw feet, each foot detailed with relief carvings that catch deep shadow between the toes. Inside the clear glass sphere, a deep purple cosmic nebula swirls hypnotically — stars, gas clouds and violet light drifting in real time, bright enough that the interior glow bleeds through the glass and blooms softly around the surface. A violet halo surrounds the outer sphere. Three amethyst gemstones are inset into the stand's base with faceted cuts that glint sharply. The bronze is polished along the claws and weathered-dark in the recesses, so the environment reflection plays across the smooth parts while the crevices sit in cool shadow. Purple mist curls at the foot; cyan sparks slowly orbit the orb.",
      },
      {
        icon: "shield",
        title: "Holographic Shield",
        description: "Kite shield with live hologram interface",
        prompt: "A floating kite-shaped shield with a live holographic emerald-green interface projected across its front face — animated scanlines, flickering tactical data, a traveling signal wave bright enough to bloom off the plate. The shield body is deeply-etched brushed steel with relief circuit channels running vertically, the recesses dark with AO, the raised lands catching sharp highlights. Gold stud rivets at each corner and dark leather straps on the back. A translucent green force-field dome surrounds the entire shield, pulsing gently. A slow-rotating chrome ring orbits around it and shows a real reflection of the hologram on its inner face. Tiny green sparks orbit at varying radii.",
      },
      {
        icon: "science",
        title: "Alchemist's Flask",
        description: "Bubbling flask on gimbal with pouring potion",
        prompt: "An Erlenmeyer flask of clear glass mounted on a three-axis polished-brass gimbal, tilted at an angle and pouring a glowing emerald-green potion into a waiting glass goblet below. The glass has true refractive transmission so the potion colour bends through the walls; the potion itself glows bright enough that the pour-stream halo blooms softly. The potion surface ripples gently and fine bubbles rise through the liquid. Each brass ring carries etched rune-bands in its recessed channel, dark with shadow against the polished outer edge, and the rings rotate on their own axes at slightly different speeds. The pouring stream is a continuous column of flowing liquid with droplet accents, splashing outward where it strikes the goblet. The whole assembly sits on a dark oak plinth with subtle green mist hanging in the air.",
      },
      {
        icon: "blur_circular",
        title: "Levitating Crystal",
        description: "Sharp amethyst spire orbiting a base platform",
        prompt: "A large sharply-faceted amethyst crystal levitating upright above a low obsidian platform deeply inscribed with gold rune glyphs — the glyphs recessed enough that the channels carry cool AO shadow while the gold catches highlights. The crystal slowly rotates and bobs gently on an unseen current; each facet catches the environment reflection differently, with a violet inner glow bright enough to bloom around the sharp edges. Eight smaller floating gems — sapphires, emeralds, rubies — orbit the platform on a horizontal ring, each catching the central crystal's violet glow. A purple fresnel halo surrounds the main crystal and a faint translucent hemisphere dome of energy covers the platform. Violet mist drifts at the base; tiny violet sparks rise steadily.",
      },
      {
        icon: "local_fire_department",
        title: "Lava Obelisk",
        description: "Tall obsidian pillar with flowing lava veins",
        prompt: "An imposing black obsidian obelisk standing on a rough rocky platform — the obelisk's four faces deeply pitted and weathered, every crack and crater catching contact shadow. Glowing orange-red lava veins run down each face in jagged lightning-bolt patterns, visibly flowing and pulsing with heat, hot enough that the bright cores bloom into the air around them. A gold band wraps the top third and catches sharp environment reflections across its polished surface. The rocky platform below is shattered in layered slabs that cast soft shadows into each other. Ember particles rise continuously from the base, warm red mist pools at its feet and orange caustic light dances on the ground around it. Dust motes catch the lava's glow.",
      },
      {
        icon: "auto_awesome",
        title: "Starforge Anvil",
        description: "Glowing anvil with stellar metal being hammered",
        prompt: "A blacksmith's anvil forged from dark meteorite iron with a pitted, star-textured surface, mounted on a worn stone pillar whose erosion has left deep channels and crevices down its sides. A stellar ingot of molten star-metal lies glowing on the anvil's top — intense amber-orange, surface churning with heat, bright enough that the whole ingot blooms and casts warm rim-light onto the anvil. A heavy leather-gripped steel hammer hovers above, rising and falling in a slow rhythm and striking the ingot on each beat. On every impact a burst of golden splash particles erupts. The anvil and stone pillar sit in a pool of deep contact shadow where they meet the ground. Hundreds of golden sparks drift continuously in the surrounding air.",
      },
      {
        icon: "egg_alt",
        title: "Iridescent Dragon Egg",
        description: "Cracking egg on a nest of embers",
        prompt: "A large dragon egg — ovoid, taller than wide — with a tightly-overlapping iridescent scaled shell that shifts colors from bronze to violet to teal as the viewing angle changes. Each scale is raised enough to cast soft shadow on the one beneath, so the full surface reads as real relief rather than a flat texture. Three jagged thermal cracks run across the shell, lava-orange glow bleeding through from within — bright enough that the molten glow blooms around the cracks. The egg rests in a woven nest of twisted branches interspersed with glowing embers; the weave tangles deeply, with each branch-crossover dark in shadow. Caustic orange light patterns the ground beneath the nest, warm mist rises and hundreds of ember sparks drift upward continuously. A subtle orange halo surrounds the egg.",
      },
      {
        icon: "balance",
        title: "Balance of Fates",
        description: "Golden scales tipping with gemstone weights",
        prompt: "An ornate golden balance scale standing on a white-marble plinth with grey veining that the polish catches as faint reflection. The central column is intricately carved with fluted relief and leaf motifs — the recesses dark with contact shadow, the raised surfaces catching sharp highlights. Two shallow gold dishes hang from gold chain links at either end of a horizontal crossbeam; each chain link sits in soft shadow against the next. The left dish holds three ruby octahedron gemstones that glow bright enough to bloom around their sharp edges, the right dish is empty. The crossbeam tilts slowly back and forth as if weighing invisible fates. Amber mist pools below the plinth; fine gold dust drifts around the piece with sparks orbiting the gems.",
      },
      {
        icon: "hardware",
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
      return `/no_think
You are a 3D production designer. Return a compact ASSEMBLY BLUEPRINT for the exact object below. Do not reason. Do not write a thinking process.

OBJECT: "${userText}"

For every visible sub-part, include: SHAPE, MATERIAL with hex color for solids, Y range, size/proportion, and function. Use y=0 as the ground origin. Total height must be 0.3-1.5 units. Parts on top must start at the exact top Y of the part below. Liquids inside containers must remain inside the container.

ARCHETYPE TAGS (optional, recommended) — when the scene is one of the
recognized archetypes below, OPEN the blueprint with the matching tag on its
own line. This is a STYLE HINT for the codegen, not a contract — the engine
guarantees correct water rendering regardless of how the codegen builds the
geometry, so don't agonize over picking a tag. Use one only if it cleanly
fits.

  [ARCHETYPE: TIERED_FOUNTAIN, tiers=N, baseRadius=R]
      Multi-tier / cascading water feature.
  [ARCHETYPE: SINGLE_BASIN, radius=R]
      One bowl + rim + water surface.
  [ARCHETYPE: LIQUID_VESSEL, container=<vesselName>, fill=<color>, level=0.0–1.0]
      Liquid inside a flask / goblet / cauldron.
  [ARCHETYPE: OPEN_WATER, footprint=N×N]
      Pool / lake / moat / scrying basin.
  [ARCHETYPE: STREAM, from=<part>, to=<part>]
      Pouring / falling water column.

LIQUID RULE. Whenever a sub-part is water, potion, blood,
acid, oil, lava, mercury, or any other liquid, describe ONLY:
  - Which container or footprint holds it
  - The semantic type (water | lava | potion | blood | oil | mercury | acid)
  - Optional color tint and fill level
Do NOT write "BaseColor #xxxxxx Roughness 0.1 Metalness 0.1 Transparency 0.8"
for a liquid. The engine has dedicated shaders per liquid type and will pick
the correct optics; spec'ing material parameters yourself produces a flat
dull disc when the codegen translates it literally.

FORMAT: One or two archetype tag lines if useful, then ONE dense paragraph of 120-220 words. No bullets. No markdown. No code. No <think>.

RULES:
- Stay EXACTLY faithful to the user's intent — do not change the subject or add unrelated elements
- DO add structural sub-parts the object would realistically have (a bottle needs a cork, a sword needs a pommel)
- Every color must have a hex code (except liquids — see LIQUID RULE). If user didn't specify, pick vivid realistic ones
- Output ONLY the blueprint.`;
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

      return `${detectArchetypeHint(userText)}You are an expert Three.js developer building a bespoke scene
from the task below. Match the app's AAA quality bar, but do not copy
the default scene.

CRITICAL: Output ONLY raw JavaScript code. No thinking, no reasoning,
no <think> tags, no explanation, no markdown fences. Start with
setObjectInfo() immediately.

TASK: "${userText}"

═══ QUALITY CONTRACT — NON-NEGOTIABLE ═══
The orrery reference uses EVERY subsystem of the engine. Your output
must reach the same coverage. Before returning code, verify it contains
AT MINIMUM each of the following. Count your actual calls — do not
substitute one for another.

  [A] Hero silhouette: 1 dominant shape + 2-3 supporting forms.
  [B] FROM MAT LIBRARY: at least 4 named material presets
      (MAT.gold, MAT.brass, MAT.obsidian, MAT.ruby, MAT.glass, etc.)
      — NOT four hand-rolled MeshPhysicalMaterials.
  [C] FROM TEX LIBRARY: at least 2 procedural textures
      (TEX.stone, TEX.marble, TEX.wood, TEX.runes, TEX.circuit, etc.)
  [D] FROM SHADER LIBRARY: at least 2 animated shaders
      (SHADER.nebula, fresnel, hologram, lava, caustics, portal,
       flowParticles, dissolve, iridescence).
  [E] FROM FX LIBRARY: at least 2 scene-level FX
      (FX.withGlow on the emissive hero AND FX.godRayCone radiating
       from a bright light source. Add FX.batch for any scatter > 10
       meshes.)
  [F] FROM CELESTIAL LIBRARY: 1 starfield + 1 nebulaCloud dome
      (unless the scene is explicitly indoors — interiors use
       H.dust + SHADER.flowParticles as the atmosphere layer instead.)
  [G] PHYSICS: await P.init(); at least 1 static collider +
      1 dynamic body (gems, debris, leaves, coins, etc.).
  [H] POST OVERRIDE: setLensFlare({ position, strength: 0.3-0.6,
      occlusionTest: true }) on any scene with a dominant emissive
      source (core, ingot, lava, crystal, orb, lantern).
  [I] ANIMATION: addUpdateCallback({ time, deltaTime }) driving at
      least one orbit / rotation / pulse / breathing cycle.
  [J] CONNECTED COMPOSITION — most-failed rule, read carefully:
      - NO sub-part may float away from its parent. A column MUST
        reach from its pedestal top to its capital base with no gap.
      - A ring/gimbal/cage around a central hero MUST have inner
        radius > hero's outer radius + clearance (use the hero's
        boundingSphere or geometry.boundingBox). Never let rings
        clip through the flask/orb/core they surround.
      - A liquid inside a vessel MUST be created via
        H.fillLiquid(vesselMesh, color, { fillLevel }) AFTER the
        vessel has been positioned AND its parent transforms applied.
        Pass the MESH, not the geometry. The engine re-snaps the
        liquid group's world transform to the vessel's world
        transform automatically, so it works inside tilted gimbals.
      - Every vertical element's top = the next element's bottom.
        Pedestal top at y=0.05 → base bottom at y=0.05.
        Base top at y=0.2 → column bottom at y=0.2.
        Column top at y=0.5 → head bottom at y=0.5.
        NO gaps, NO overlaps.
      - Ground plane always at y=0. No sub-part has y < 0 unless
        you're carving into the ground (moat floor, etc.).
      - PARENT/CHILD Y COMPOUNDS — read carefully. When the blueprint
        gives ABSOLUTE world Y values (e.g. ringInner at y=0.20), and
        you nest the rings as parent → child via Group.add(), the
        child's position.y is RELATIVE to its parent. Setting both
        ringMid.position.y = 0.16 AND ringInner.position.y = 0.20
        AFTER ringMid.add(ringInner) makes ringInner sit at world
        y = 0.16 + 0.20 = 0.36 — not the intended 0.20.

        FIX — pick ONE of these patterns per assembly:
          (A) FLAT: add every part to root with its absolute Y.
              root.add(ringOuter); ringOuter.position.y = 0.12;
              root.add(ringMid);   ringMid.position.y   = 0.16;
              root.add(ringInner); ringInner.position.y = 0.20;
              root.add(flask);     flask.position.y     = 0.22;
          (B) NESTED: parent absorbs the parent's Y, children offset
              from the parent. ringInner.position.y = 0.04 means
              "0.04 above ringMid", not "world y = 0.04".
              const ringOuter = new THREE.Group();
              ringOuter.position.y = 0.12;
              const ringMid = new THREE.Group();
              ringMid.position.y = 0.04;          // 0.04 above ringOuter
              const ringInner = new THREE.Group();
              ringInner.position.y = 0.04;        // 0.04 above ringMid
              const flask = ...;
              flask.position.y = 0.02;            // 0.02 above ringInner
              ringInner.add(flask);
              ringMid.add(ringInner);
              ringOuter.add(ringMid);
              root.add(ringOuter);

        For multi-axis gimbals, pattern (B) is required because each
        ring needs to rotate independently and animate its children.
        For loose stacks (pedestal + base + column + head), pattern
        (A) is fine.

Scenes that meet fewer than 8 of the 10 requirements FAIL quality
review. Treat this list as a self-check before emitting return root;

═══ APPLIED-AUTOMATICALLY BASELINE (already active — do not set) ═══
These are ALWAYS on before your code runs. You do not need to invoke
them unless you want scene-specific overrides:
  - ACES Filmic tone mapping, HDR pipeline, SMAA anti-aliasing
  - N8AO (screen-space AO) at quality tier "High"
  - Selective HDR bloom (threshold 0.9)
  - Chromatic aberration (0.08) + film grain (0.025) + color grade
  - HDR IBL (user-selected preset: studio / day / sunset / night)
  - Scene-level weather (fog, rain, lens droplets, lightning) —
    DO NOT call setHeightFog or setScreenDroplets.

═══ LIQUID CONVENTION — applies to EVERY liquid in the scene ═══
The engine runs a FLUID.normalize() post-pass that walks the scene graph
and swaps materials on any mesh you tag with the convention below. This
is the SCALABLE path: it works for any liquid scenario (water, lava,
potion, blood, oil, mercury, acid…) without you needing to know about
specific helpers.

  ── For a water/lava/potion SURFACE (open pool, lake, moat, fountain
     pool top, lava lake, vat surface, pond): build any horizontal
     planar geometry (CircleGeometry, RingGeometry, PlaneGeometry) with
     ANY placeholder material, then tag it:

       const surface = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({color:0x000}));
       surface.userData.fluid = {
         type: "water",        // water | lava | potion | blood | oil | mercury | acid | elixir | ice
         color: 0x4a90c4,      // optional — engine has good defaults per type
         fillLevel: 0.75,      // ignored on standalone surfaces
       };
       surface.rotation.x = -Math.PI / 2;
       parent.add(surface);

     The engine swaps surface.material to a transmissive water shader
     with the right caustics, fresnel, ripple animation, foam threshold.

  ── For LIQUID INSIDE A CONTAINER (potion in a flask, mead in a goblet,
     ale in a stein, water in a bowl, lava in a cauldron, blood in a
     basin, oil in a jar): tag the CONTAINER mesh:

       bottleMesh.userData.fluidContainer = {
         type: "potion",
         color: 0x9c27ff,      // optional
         fillLevel: 0.65,      // 0..1 of vessel interior height
       };

     The engine fills the vessel via H.fillLiquid → FLUID.upgradeFill,
     auto-positioning the liquid body inside the vessel's interior with
     a properly-shaded animated surface. You do NOT call H.fillLiquid
     yourself — just tag the container and the engine handles it.

  ── For preferred / fastest path on common archetypes, the high-level
     helpers still exist (and are usually a one-liner):
       FLUID.tieredFountain({ tiers, baseRadius })   — fountain
       FLUID.fountainBasin({ radius, y })             — single basin
       FLUID.stream({ from, to, radius })             — pouring column
       FLUID.oceanWater(geom, opts)                   — explicit ocean
     Use them when they match. When they don't, hand-roll the geometry
     and rely on the convention above — both yield correct water.

  ── ANTI-PATTERN: do NOT spec a liquid as \`MeshStandardMaterial({
     color: 0x4682B4, transparent: true, opacity: 0.8 })\`. That renders
     as a flat dull blue disc. The convention exists so you can describe
     intent ("this is water") without spec'ing material parameters that
     don't reproduce real water optics.

  ── ANTI-PATTERN: do NOT add a hand-rolled CircleGeometry "water
     surface" inside a vessel that you also tagged as a fluidContainer.
     One or the other — never both. The engine fills containers via the
     userData tag.

═══ MANDATORY AAA CHECKLIST — apply to EVERY scene, not just templates ═══
Every generation must pass these requirements. Treat them as the quality bar.

  [1] LIQUIDS: any water/potion/blood/acid/lava surface MUST use FLUID.*
      - Flat pool / lake / moat / basin top     → FLUID.oceanWater(geom, opts)
      - Multi-tier cascading fountain (3+ tiers)→ root.add(FLUID.tieredFountain({ tiers: 3, baseRadius: 0.55 }));
          This is THE fountain primitive. One call. Do NOT hand-roll
          bowls + streams separately when the scene is a tiered fountain.
      - Single fountain tier (bowl + rim + water)→ FLUID.fountainBasin({radius, y})
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
      Purple #8b5cf6 / var(--bz-purple-300), Green var(--bz-emerald-500) / var(--bz-emerald-500),
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
- \`const NAMESPACE.X = ...\` — JavaScript SYNTAX ERROR. \`const\` requires
  a plain identifier, never a member expression. The error reads
  "Identifier 'MAT' has already been declared" but the actual cause is
  the dot. Wrong:
      const MAT.PolishedBrass = new THREE.MeshPhysicalMaterial({...});
      const TEX.Wood = TEX.wood('#5a3a1a');
  Right (use a local const, then USE it):
      const polishedBrass = new THREE.MeshPhysicalMaterial({...});
      const woodTex = TEX.wood('#5a3a1a');
      // …later: new THREE.Mesh(geo, polishedBrass);
  Reusing engine presets is fine — \`MAT.brass\`, \`MAT.gold\`,
  \`TEX.stone(...)\` are just READS, they don't declare anything.

═══ QUALITY REFERENCE — do not copy the default scene ═══
The default scene is an Arcane Orrery. It is ONLY a quality benchmark:
layered geometry, material presets, procedural textures, shader accents,
volumetric-looking FX, weather-aware lighting, and animation callbacks.
Your subject, silhouette, parts, title, and description MUST come from
TASK, not from the orrery.

═══ SCENE ENVIRONMENT — DO NOT TOUCH ═══
The viewer provides the visual ground (grid, sky, stars, weather).
P.init() auto-creates an infinite physics ground collider.
  * NEVER add a floor / ground / platform mesh at or below y=0.
  * NEVER add a "visible: false" BoxGeometry as a physics floor —
    it shows up as a transmission-buffer artifact under any
    transparent hero.
  * NEVER add a large horizontal plane at the base of the scene.
  * The root of your scene starts at y=0. Every sub-part has y > 0.

═══ TRANSPARENT GLASS CONTAINERS — exact recipe ═══
Glass vessels (flasks, orbs, goblets, jars) MUST use this material
shape or they render as opaque white:
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff,       // neutral — do not tint with emissive
    transmission: 0.95,    // required
    ior: 1.5,
    roughness: 0.04,
    thickness: 0.2,
    clearcoat: 1.0,
    transparent: true,
    opacity: 1.0,          // opacity 1 is correct with transmission
  });
Do NOT set emissive on glass. Do NOT set opacity < 0.5 — that fights
with transmission. After adding the container, call
  const liquid = H.fillLiquid(containerMesh, 0x40ff80, { fillLevel: 0.6 });
  FLUID.upgradeFill(liquid);
  root.add(liquid);
Pass the MESH (not geometry). The engine snaps liquid to the
container's world transform automatically.

// Pedestal with procedural texture + MAT preset rim
const stoneTex = TEX.stone('#3a3640'); stoneTex.repeat.set(3, 3);
const dais = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.06, 96),
  new THREE.MeshPhysicalMaterial({ color: 0x7a7680, map: stoneTex,
    roughness: 0.82, metalness: 0.05, clearcoat: 0.15 }));
dais.position.y = -0.03; dais.receiveShadow = true; root.add(dais);
const daisRim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.006, 24, 128), MAT.gold);
daisRim.rotation.x = Math.PI / 2; daisRim.position.y = 0.003; root.add(daisRim);

// Hero glass with internal shader-driven nebula
const coreY = 0.62;
const nebulaCore = new THREE.Mesh(new THREE.SphereGeometry(0.105, 64, 64),
  SHADER.nebula(0x8b5cf6, 0x0a0a0f));
nebulaCore.position.y = coreY; root.add(nebulaCore);
const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 96, 96),
  new THREE.MeshPhysicalMaterial({ color: 0xf0f0ff, transmission: 0.96, ior: 1.5,
    roughness: 0.03, thickness: 0.25, clearcoat: 1.0, transparent: true }));
orb.position.y = coreY; root.add(orb);
const halo = new THREE.Mesh(new THREE.SphereGeometry(0.17, 48, 48),
  SHADER.fresnel(0xa855f7, 2.5, 0.75));
halo.position.y = coreY; root.add(halo);

// Lens flare on the dominant emissive hero
setLensFlare({ position: new THREE.Vector3(0, coreY, 0), strength: 0.3,
  tint: 0xc28dff, anamorphic: 1.0, occlusionTest: true });

// Volumetric god rays
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  root.add(FX.godRayCone({
    from: new THREE.Vector3(Math.cos(a) * 0.06, coreY - 0.02, Math.sin(a) * 0.06),
    to:   new THREE.Vector3(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62),
    color: 0xa855f7, spread: 0.12, intensity: 0.45 }));
}

// Orbiting rings + planets
const rings = [];
[{ r: 0.28, mat: MAT.gold, speed: 0.45 },
 { r: 0.36, mat: MAT.brass, tilt: Math.PI / 3, speed: 0.3 },
 { r: 0.44, mat: MAT.silver, tilt: Math.PI / 6, speed: 0.2 }
].forEach((def, i) => {
  const tilt = new THREE.Group(); tilt.position.y = coreY;
  if (def.tilt) tilt.rotation.x = def.tilt;
  root.add(tilt);
  const spin = new THREE.Group(); tilt.add(spin);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(def.r, 0.008, 16, 192), def.mat);
  ring.rotation.x = Math.PI / 2; spin.add(ring);
  const marbleTex = TEX.marble('#08306a', '#f5c776');
  const planet = new THREE.Mesh(new THREE.SphereGeometry(0.032, 48, 48),
    new THREE.MeshPhysicalMaterial({ map: marbleTex, metalness: 0.35, roughness: 0.28,
      clearcoat: 1.0, clearcoatRoughness: 0.08 }));
  planet.position.set(def.r, 0, 0); spin.add(planet);
  rings.push({ spin, speed: def.speed, phase: i * (Math.PI * 2 / 3) });
});

// Backdrop
const stars = CELESTIAL.starfield({ count: 1400, radius: 9, size: 36, twinkle: 0.75 });
stars.position.y = coreY; root.add(stars);
root.add(CELESTIAL.nebulaCloud({ dome: true, count: 420,
  bounds: { x: 6, y: 4.5, z: 6 }, innerRadius: 4.2,
  colorA: 0x8b5cf6, colorB: 0xfe2d6e, brightness: 1.0, size: 58 }));

// Atmosphere aura + per-frame animation
const aura = SHADER.flowParticles({ count: 900, bounds: { x: 0.55, y: 0.75, z: 0.55 },
  color: 0x8b5cf6, color2: 0x10b981, size: 32, speed: 0.35, swirl: 0.5 });
aura.position.y = coreY; aura.userData.excludeFromBBox = true; root.add(aura);
addUpdateCallback(({ time }) => {
  for (const r of rings) r.spin.rotation.y = time * r.speed + r.phase;
  nebulaCore.rotation.y = time * 0.15;
});

═══ HARD-LEARNED ANTI-PATTERNS ═══
- Liquid inside a glass container: H.fillLiquid(containerMesh, color,
  { fillLevel }) THEN FLUID.upgradeFill(result). NEVER hand-roll a flat
  CircleGeometry/PlaneGeometry at a hard-coded Y — it floats above the rim.
- NEVER wrap engine calls in "typeof FLUID !== 'undefined'" guards. They
  silently skip the call and produce broken scenes.
- NEVER hand-roll four MeshPhysicalMaterial instances when MAT.gold /
  MAT.brass / MAT.obsidian / MAT.ruby etc. already exist. Use the presets.
- NEVER leave the hero floating above its pedestal — every vertical
  element must reach from base to head without a visible gap.
- The cinematic post baseline is ALREADY ACTIVE. Do not call setFilmGrain,
  setChromatic, setColorGrade, setAO, or setBloom unless you're
  overriding the baseline. DO call setLensFlare({ position, strength,
  occlusionTest: true }) when the scene has a dominant emissive hero.

${detectArchetypeHint(userText)}OUTPUT CODE FOR: "${userText}"`;
    };

    /**
     * Soft archetype hint — the engine's FLUID.normalize() pass now
     * guarantees that any liquid mesh tagged with `userData.fluid` or
     * `userData.fluidContainer` gets the right water shader, regardless
     * of how the codegen built it. So this function is no longer the
     * load-bearing directive it was — it's a STYLE HINT that nudges the
     * model toward the most appropriate built-in helper when one exists,
     * but doesn't punish the model for hand-rolling.
     *
     * If a high-confidence archetype is detected, we emit a small
     * "Suggested helper" note. The convention rules in the main prompt
     * carry the actual safety guarantees.
     *
     * Returns "" for non-water scenes.
     */
    function detectArchetypeHint(text) {
      const t = (text || "").toLowerCase();

      // 1. Explicit ARCHETYPE tag from the blueprint phase — highest signal.
      // Format: [ARCHETYPE: NAME, key=val, key=val]
      const tagMatch = (text || "").match(/\[ARCHETYPE:\s*([A-Z_]+)([^\]]*)\]/);
      let tagName = null;
      const tagParams = {};
      if (tagMatch) {
        tagName = tagMatch[1];
        const paramStr = tagMatch[2] || "";
        for (const pair of paramStr.split(",")) {
          const [k, v] = pair.split("=").map((s) => (s || "").trim());
          if (k && v) tagParams[k.toLowerCase()] = v;
        }
      }

      // 2. Natural-language fallbacks (work even without the tag).
      const numericTier = t.match(/\b(\d+)[\s-]*tier(s|ed)?\b/);
      const wordTier = t.match(/\b(two|three|four|five|six|seven)[\s-]*tier(s|ed)?\b/);
      const wordToNum = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
      const inferredTierCount = numericTier
        ? parseInt(numericTier[1], 10)
        : wordTier
          ? wordToNum[wordTier[1]]
          : null;

      const isFountainWord = /\bfountain\b/.test(t);
      const isCascading = /\bcascad(ing|e)\b|\bstacked\b/.test(t) && (isFountainWord || /\bbasin|bowl|tier\b/.test(t));

      // 3. Resolve to a single archetype.
      let archetype = tagName;
      let params = { ...tagParams };
      if (!archetype) {
        if ((isFountainWord && inferredTierCount && inferredTierCount >= 2) || isCascading) {
          archetype = "TIERED_FOUNTAIN";
          params.tiers = String(inferredTierCount || 3);
        } else if (isFountainWord) {
          archetype = "SINGLE_BASIN";
        } else if (/\b(pool|lake|moat|pond|reservoir|scrying basin)\b/.test(t)) {
          archetype = "OPEN_WATER";
        }
      }
      if (!archetype) return "";

      // 4. Emit the soft hint. The engine's FLUID.normalize() guarantees
      // any tagged liquid mesh gets the right shader, so these are
      // "suggested helpers" not enforcement walls.
      if (archetype === "TIERED_FOUNTAIN") {
        const tiers = parseInt(params.tiers, 10) || inferredTierCount || 3;
        const baseRadius = parseFloat(params.baseradius) || 0.55;
        return `// SUGGESTED HELPER for this scene:
//   root.add(FLUID.tieredFountain({ tiers: ${tiers}, baseRadius: ${baseRadius.toFixed(2)} }));
// One call, fully assembled (basins + rims + water + cascading streams).
// If you instead build the fountain by hand, tag every water surface
// with userData.fluid = { type: "water" } and every bowl with
// userData.fluidContainer = { type: "water", fillLevel: 0.7 } — the
// engine's FLUID.normalize pass will swap in the correct water shader
// regardless. Either approach yields proper transmissive water.

`;
      }
      if (archetype === "SINGLE_BASIN") {
        const radius = parseFloat(params.radius) || 0.6;
        return `// SUGGESTED HELPER for this scene:
//   root.add(FLUID.fountainBasin({ radius: ${radius.toFixed(2)}, y: 0.0 }));
// Or hand-build and tag the bowl with
//   userData.fluidContainer = { type: "water", fillLevel: 0.75 };

`;
      }
      if (archetype === "OPEN_WATER") {
        return `// SUGGESTED PATH for this scene's water surface:
//   const water = new THREE.Mesh(geom, ...placeholderMaterial);
//   water.userData.fluid = { type: "water" };
// FLUID.normalize will swap the material to the proper transmissive
// shader. Or call FLUID.oceanWater(geom, opts) directly for explicit
// control.

`;
      }
      if (archetype === "LIQUID_VESSEL") {
        return `// SUGGESTED PATH for the liquid in the vessel:
//   vesselMesh.userData.fluidContainer = { type: "potion", fillLevel: 0.7 };
// FLUID.normalize will fill the vessel via H.fillLiquid + FLUID.upgradeFill.

`;
      }
      if (archetype === "STREAM") {
        return `// SUGGESTED HELPER for the pouring water:
//   root.add(FLUID.stream({ from: Vector3, to: Vector3, radius: 0.025 }));

`;
      }
      return "";
    }

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
    /**
     * Streaming LLM call — tokens arrive over IPC in real time, the
     * loading screen updates as they land. Falls back to the legacy
     * non-streaming path if the renderer doesn't expose chatStream.
     *
     * Caller-supplied `onProgress({text, tokenCount, elapsedMs})` is
     * invoked on every chunk; the 3D pipeline uses it to feed the
     * game-style loading screen with a live preview + tok/s readout.
     */
    const callLLM = async (prompt, options = {}, onProgress) => {
      const canStream =
        typeof window?.electronAPI?.chatStream === "function" &&
        typeof window?.electronAPI?.onChatToken === "function";

      const extraOpts = {};
      if (options.maxTokens) extraOpts.maxTokens = options.maxTokens;
      if (options.temperature !== undefined) extraOpts.temperature = options.temperature;
      if (options.thoughtTokens !== undefined) extraOpts.thoughtTokens = options.thoughtTokens;
      if (typeof options.enableThinking === "boolean") extraOpts.enableThinking = options.enableThinking;

      if (!canStream) {
        // Legacy non-streaming path (left in place so callers without
        // streaming support still work).
        if (!window.electronAPI?.chat) throw new Error("Chat API not available");
        const response = await Promise.race([
          window.electronAPI.chat(prompt, { ...extraOpts, returnMetadata: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3600000)),
        ]);
        if (!response) throw new Error("Empty response from LLM");
        if (typeof response === "object" && response.text !== undefined) return response;
        return { text: String(response), tokenCount: 0, elapsedMs: 0 };
      }

      // Streaming path
      let fullText = "";
      let tokenCount = 0;
      const startedAt = performance.now();
      // Time-to-first-token marks the prefill boundary. Everything before
      // it = attention compute over the prompt; after = pure generation.
      // Splitting them is the only honest way to display tok/s — if a
      // 30B model takes 60s to chew through 10K tokens of system prompt
      // and then generates 5K tokens at 10 tok/s, the naïve "total /
      // elapsed" rate reads as 4.5 tok/s which is misleading.
      let firstTokenAt = 0;

      const unsubscribe = window.electronAPI.onChatToken((chunk) => {
        if (typeof chunk !== "string" || chunk.length === 0) return;
        if (firstTokenAt === 0) firstTokenAt = performance.now();
        tokenCount++;
        fullText += chunk;
        const now = performance.now();
        const elapsedMs = now - startedAt;
        const prefillMs = firstTokenAt - startedAt;
        const genMs = now - firstTokenAt;
        try {
          onProgress?.({
            text: fullText,
            tokenCount,
            elapsedMs,
            prefillMs,
            genMs,
          });
        } catch (e) {
          console.warn("[3D] stream onProgress threw:", e);
        }
      });

      try {
        const result = await window.electronAPI.chatStream(prompt, extraOpts);
        // chatStream returns the assistant text — prefer it over our
        // accumulated buffer in case the IPC ordering ever drops a chunk.
        if (typeof result === "string" && result.length >= fullText.length) {
          fullText = result;
        }
      } finally {
        unsubscribe();
      }

      const finishedAt = performance.now();
      return {
        text: fullText,
        tokenCount,
        elapsedMs: finishedAt - startedAt,
        prefillMs: firstTokenAt > 0 ? firstTokenAt - startedAt : 0,
        genMs: firstTokenAt > 0 ? finishedAt - firstTokenAt : 0,
      };
    };

    // ═══════════════════════════════════════════════════════════════════════
    // UI ACTIONS
    // ═══════════════════════════════════════════════════════════════════════
    const setTimeOfDay = (time) => {
      currentTime.value = time;
      localStorage.setItem("bonzai-3d-time", time);
      threeViewer.value?.setTimeOfDay(time);
    };

    const setPerformance = (level) => {
      currentPerformance.value = level;
      threeViewer.value?.setRenderQuality(level);
    };
    const setWeather = (weather) => {
      currentWeather.value = weather;
      localStorage.setItem("bonzai-3d-weather", weather);
      threeViewer.value?.setWeather(weather);
    };

    const setLightIntensity = (intensity) => {
      lightIntensity.value = intensity;
      threeViewer.value?.setLightIntensity(intensity);
    };

    const restoreViewerEnvironmentControls = () => {
      const viewer = threeViewer.value;
      if (!viewer) return;
      viewer.setTimeOfDay(currentTime.value);
      viewer.setWeather(currentWeather.value);
      viewer.setRenderQuality(currentPerformance.value);
      viewer.setLightIntensity(lightIntensity.value);
    };

    const waitForViewerReady = async (timeoutMs = 5000) => {
      const start = performance.now();
      while (performance.now() - start < timeoutMs) {
        const viewer = threeViewer.value;
        if (
          viewer?.isReady &&
          viewer?.scene &&
          viewer?.renderer &&
          viewer?._sceneObjects?.get?.("ground")
        ) {
          return viewer;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return threeViewer.value;
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

    const historyThumbnail = (item) => item?.thumbnail || item?.screenshots?.[0]?.dataUrl || "";

    const handleSuccess = (data) => console.log("Generation success:", data);
    const handleError = (data) => console.error("Generation error:", data);

    const captureViewerSnapshot = async (label = "Preview") => {
      await nextTick();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return threeViewer.value?.captureSnapshot?.(label, { quality: "ultra" }) || null;
    };

    const formatHistoryDate = (value) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    const removeInference = async (originalIndex) => {
      await removeObjectInference(originalIndex);
    };

    const clearDeleteToastTimer = () => {
      if (!pendingDeleteTimer) return;
      window.clearTimeout(pendingDeleteTimer);
      pendingDeleteTimer = null;
    };

    const dismissDeleteToast = () => {
      clearDeleteToastTimer();
      pendingDelete.value = null;
    };

    const requestDeleteObject = (item) => {
      if (!item) return;
      clearDeleteToastTimer();
      pendingDelete.value = {
        id: item.id,
        index: item._originalIndex,
        all: false,
      };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const requestClearHistory = () => {
      if (!objectInferences.value.length) return;
      clearDeleteToastTimer();
      pendingDelete.value = { all: true };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const confirmDeleteObject = async () => {
      const pending = pendingDelete.value;
      if (!pending) return;
      dismissDeleteToast();

      if (pending.all) {
        await clearObjectInferences();
        hasCopy.length = 0;
        return;
      }

      const idx = objectInferences.value.findIndex((item) => item.id === pending.id);
      await removeInference(idx >= 0 ? idx : pending.index);
    };

    const applyInference = async (item) => {
      if (!item.code || !threeViewer.value) return;
      try {
        await threeViewer.value.applyModuleCode(item.code, "replace");
        restoreViewerEnvironmentControls();
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

    const inspectInference = (item) => {
      if (!item) return;
      const screenshots = Array.isArray(item.screenshots) ? item.screenshots : [];
      generationInspector.show({
        id: item.id,
        kind: "object",
        mediaUrl: historyThumbnail(item),
        prompt: item.prompt || "",
        outputText: item.code || "",
        model: item.model || currentModel.value?.modelname || "three-js",
        modelId: currentModel.value?.filename || "",
        ts: item.timestamp,
        createdAt: item.createdAt,
        status: item.success === false ? "Error" : "Complete",
        errorMessage: item.success === false ? item.notes || "" : "",
        mintState: item.nft || null,
        extra: {
          ...(item.mode ? { mode: item.mode } : {}),
          ...(item.tokensPerSecond ? { tokensPerSecond: `${item.tokensPerSecond} tok/s` } : {}),
          ...(item.blueprint ? { blueprint: item.blueprint } : {}),
          screenshots: String(screenshots.length),
          codeChars: String((item.code || "").length),
          snapshotQuality: screenshots[0]?.quality || (item.thumbnail ? "ultra" : ""),
        },
      });
    };

    const actionsFor = (item) => {
      const minted = !!item?.nft;
      return [
        { id: "inspect", icon: "info", label: "Inspect", variant: "default", title: "Inspect generation metadata" },
        { id: "copy", icon: hasCopy[item._originalIndex] ? "check" : "content_copy", label: hasCopy[item._originalIndex] ? "Copied" : "Reuse", variant: "default", title: "Copy prompt into composer" },
        { id: "mint", icon: minted ? "check_circle" : "token", label: minted ? "Minted" : "Mint", variant: minted ? "success" : "default", disabled: minted },
        { id: "load", icon: "visibility", label: "Load", variant: "primary", disabled: !item?.success, title: "Load this scene" },
        { id: "retry", icon: "autorenew", label: "Retry", variant: "default", disabled: isLoading.value, title: "Regenerate with the same prompt" },
        { id: "delete", icon: "delete", label: "Delete", variant: "destructive", title: "Remove this result" },
      ];
    };

    const handleAction = (id, item) => {
      switch (id) {
        case "inspect": inspectInference(item); break;
        case "copy": copyPrompt(item.prompt, item._originalIndex); break;
        case "mint": openMint(item); break;
        case "load": applyInference(item); break;
        case "retry": regenerateFromInference(item); break;
        case "delete": requestDeleteObject(item); break;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // HISTORY MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════
    const clearHistory = async () => {
      requestClearHistory();
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
                thumbnail: item.thumbnail || item.screenshots?.[0]?.dataUrl || "",
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
          restoreViewerEnvironmentControls();
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
      const matches = requiredModels.value.filter((model) => model.filename === filename);
      for (const match of matches) {
        modelAvailability[match.role.toLowerCase()] = available;
      }
      return available;
    };

    const refreshRequiredModelAvailability = async () => {
      const results = await Promise.all(
        requiredModels.value.map(async (model) => ({
          role: model.role.toLowerCase(),
          available: await window.electronAPI.checkModel(model.filename),
        })),
      );
      for (const result of results) {
        modelAvailability[result.role] = result.available;
      }
      for (const model of requiredModelFiles.value) {
        const available = await window.electronAPI.checkModel(model.filename);
        for (const role of model.roles) {
          modelAvailability[role.toLowerCase()] = available;
        }
      }
      return results.every((result) => result.available);
    };

    const downloadModel = async (url, filename) => {
      if (!url || !filename) return;

      downloadProgress.value = 0;

      window.electronAPI.onDownloadProgress((e, data) => {
        if (data.filename === filename) {
          downloadProgress.value = Math.round(data.percent * 100);
        }
      });

      const success = await window.electronAPI.downloadModel(url, filename);

      downloadProgress.value = 0;

      if (success) {
        await isModelAvailable(filename);
      }
    };

    const deleteModel = async (filename) => {
      if (!filename) return;
      const success = await window.electronAPI.deleteModel(filename);

      if (success) {
        const matches = requiredModels.value.filter((model) => model.filename === filename);
        for (const match of matches) {
          modelAvailability[match.role.toLowerCase()] = false;
        }
        if (loadedModelFilename.value === filename) {
          loadedModelFilename.value = null;
        }
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // MODEL LOADING
    // ═══════════════════════════════════════════════════════════════════════
    const loadModelForGeneration = async (targetModel = codeModel.value) => {
      if (loadedModelFilename.value === targetModel.filename) return;

      lastStatus.value = `Loading ${targetModel.role} Model...`;
      try {
        // Cap context at 32K — 3D prompts are ~20K tokens max, and larger contexts
        // waste memory on KV cache and cause very slow prefill (100K+ = minutes of prefill)
        // forceReload ensures we get fresh context even if another tab loaded the model
        // with a different context size
        await window.electronAPI.loadModel({
          filename: targetModel.filename,
          parameters: targetModel.parameters,
          activeParameters: targetModel.activeParameters,
          isMoE: targetModel.isMoE,
          // 64K — the Qwen 3.6 35B A3B model supports 128K natively.
          // 32K was forcing the full-orrery reference to truncate
          // generated code mid-emission; 64K gives the blueprint + the
          // orrery skeleton + cheatsheets + rules ~48K of input while
          // still leaving ~16-20K for output and any thinking tokens.
          context: 65536,
          filesizeBytes: targetModel.filesizeBytes,
          flashAttention: targetModel.flashAttention,
          draftModel: targetModel.draftModel || null,
          draftUrl: targetModel.draftUrl || null,
          specType: targetModel.specType || null,
          specDraftNMax: targetModel.specDraftNMax || null,
          mtp: targetModel.mtp || false,
          forceReload: true,
        });
        loadedModelFilename.value = targetModel.filename;
        lastStatus.value = "Let's go!";
      } catch (error) {
        throw new Error(`Model loading failed: ${error.message}`);
      }
    };

          const defaultCode = `export default async function generate(params) {
  const { THREE, helpers: H, setObjectInfo, addUpdateCallback,
          setColorGrade, setLensFlare, setAO, setBloom } = params;
  const { MAT, TEX, SHADER, FLUID, P, CELESTIAL, FX } = params._engine;
  const root = new THREE.Group();
  root.name = "ArcaneOrrery";

  setObjectInfo({
    title: "Arcane Orrery",
    description: "A breathing mechanical cosmos — armillary rings carry blue-marble planets veined with gold around a nebula core, over a mirrored moat and rune-carved dais, lit against a cold deep-space IBL."
  });

  // ── Scene-specific object lookdev. The viewer owns time-of-day,
  // weather, sky, clouds, and HDR environment, so this default object
  // does not call setEnvironment().
  setAO({ radius: 0.9, intensity: 4.0, falloff: 0.3, quality: "Ultra" });
  setBloom({ intensity: 1.0, threshold: 0.75, smoothing: 0.2, radius: 0.7 });
  setColorGrade({ saturation: 1.12, contrast: 1.05 });

  // ── Physics world (Rapier) ─────────────────────────────────────────
  // P.init() auto-creates an infinite physics ground collider at y=0.
  await P.init({ gravity: -4.5 });

  // ── Stone dais ──────────────────────────────────────────────────────
  // Plain MeshPhysicalMaterial — the TCSM wet-surface variant is
  // available via SHADER.wetSurface for any LLM-generated scene that
  // wants rain reactivity, but the default orrery ships with the stock
  // PBR material because TCSM currently collides with THREE.Water's
  // internal transmission/reflection passes (the moat uses Water, and
  // those reflected passes invalidate TCSM-patched programs).
  const stoneTex = TEX.stone('#3a3640');
  stoneTex.repeat.set(3, 3);
  const daisGeo = new THREE.CylinderGeometry(0.44, 0.48, 0.06, 96);
  const daisMat = new THREE.MeshPhysicalMaterial({
    color: 0x7a7680, map: stoneTex,
    roughness: 0.82, metalness: 0.05, clearcoat: 0.15,
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
  // each frame, then samples a ripple normalmap to distort it.
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

  // ── Rune-engraved marble base ───────────────────────────────────────
  // Stock MeshPhysicalMaterial with the procedural runes texture. The
  // SHADER.csm pulsing-rune variant is available for LLM generations
  // (see shader cheatsheet) but kept out of the default for stability
  // with the Water-based moat reflection/transmission pipeline.
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
    color: 0x252028, roughness: 0.25, metalness: 0.15,
    clearcoat: 0.85, map: baseTex,
    emissive: 0xf5c776, emissiveMap: baseTex, emissiveIntensity: 0.35,
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
  // Substantial lathe profile that reaches almost up to the core — the
  // previous 0.32-unit column left a visible gap and made the head read
  // as "floating." Now the column flows from a wide decorative base at
  // y=0 to a tapered collar at y=0.50, continues as a slender brass
  // stem up to y=0.62 (where the core orb sits), with an upper capital
  // ring catching the rim of the armillary sphere.
  const columnProfile = [
    new THREE.Vector2(0.04, 0.00),
    new THREE.Vector2(0.06, 0.03),
    new THREE.Vector2(0.055, 0.10),
    new THREE.Vector2(0.045, 0.20),
    new THREE.Vector2(0.040, 0.30),
    new THREE.Vector2(0.050, 0.34),
    new THREE.Vector2(0.038, 0.38),
    new THREE.Vector2(0.030, 0.50),
    new THREE.Vector2(0.020, 0.58),
    new THREE.Vector2(0.025, 0.60),
    new THREE.Vector2(0.020, 0.62),
  ];
  const column = new THREE.Mesh(new THREE.LatheGeometry(columnProfile, 48), MAT.brass);
  column.position.y = 0.18;
  column.castShadow = true;
  root.add(column);

  // ── Central axis rod through the core ──────────────────────────────
  // The rod continues from the column's upper stem UP through the glass
  // orb and past the hologram ring. The glass orb's 0.96 transmission
  // reveals the rod passing through its interior — architecturally
  // correct for an armillary sphere and anchors the head visually.
  const axisRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.44, 20),
    MAT.brass
  );
  axisRod.position.y = 1.02;   // rod spans y = 0.80 → 1.24
  axisRod.castShadow = true;
  root.add(axisRod);

  // Gold finial cap on the upper rod tip — a classic orrery crown.
  const finialTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 20, 20),
    MAT.gold
  );
  finialTop.position.y = 1.25;
  finialTop.castShadow = true;
  root.add(finialTop);

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
  // Decorative object backdrop. The actual viewer sky, clouds, weather,
  // and HDR environment remain controlled by ThreeViewer.
  const stars = CELESTIAL.starfield({ count: 1400, radius: 9, size: 36, twinkle: 0.75 });
  stars.position.y = coreY;
  root.add(stars);

  const nebulaInner = CELESTIAL.nebulaCloud({
    dome: true,
    count: 420,
    bounds: { x: 6.0, y: 4.5, z: 6.0 },
    innerRadius: 4.2,
    colorA: 0x8b5cf6,
    colorB: 0xfe2d6e,
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
    colorA: 0x10b981,
    colorB: 0xa855f7,
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
      const viewer = await waitForViewerReady();
      if (!viewer) return;


      try {
        await viewer.applyModuleCode(defaultCode, "replace");
        restoreViewerEnvironmentControls();
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
        await loadModelForGeneration(plannerModel.value);
        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        // Reset chat history to free context for new generation
        await window.electronAPI.resetChat();

        console.log("═══════════════════════════════════════════════════════");
        console.log("3D CODE GENERATION");
        console.log("═══════════════════════════════════════════════════════");

        // Phase 1: Enhance prompt — decompose into explicit geometric blueprint
        lastStatus.value = "Designing blueprint...";
        // Keep the planner terse. Thinking-capable models can otherwise
        // spend the whole budget on <think> text and never reach the actual
        // blueprint, so request-level thinking is explicitly disabled below.
        const BLUEPRINT_MAX_TOKENS = 768;
        _resetStream("Designing Blueprint", BLUEPRINT_MAX_TOKENS, "Drafting the world before we render it.");
        const blueprintResult = await callLLM(
          buildEnhancePrompt(form.prompt),
          {
            maxTokens: BLUEPRINT_MAX_TOKENS,
            temperature: 0.35,
            thoughtTokens: 0,
            enableThinking: false,
          },
          ({ text, tokenCount, elapsedMs }) => {
            const visible = _stripThinkForPreview(text);
            stream.tokenCount = tokenCount;
            stream.elapsedMs = elapsedMs;
            stream.tokensPerSec = elapsedMs > 0 ? +(tokenCount / (elapsedMs / 1000)).toFixed(1) : 0;
            // Keep the last ~600 chars in the preview so it never overflows.
            stream.preview = visible.length > 600 ? "…" + visible.slice(-600) : visible;
          },
        );
        const blueprint = stripThinkBlocks(blueprintResult.text) ||
          `${detectArchetypeHint(form.prompt)}${form.prompt}`;
        const blueprintTokS = blueprintResult.elapsedMs > 0
          ? ((blueprintResult.tokenCount / blueprintResult.elapsedMs) * 1000).toFixed(1)
          : null;
        console.log("Enhanced blueprint:", blueprint);
        console.log(`Blueprint: ${blueprintResult.tokenCount} tokens in ${(blueprintResult.elapsedMs / 1000).toFixed(1)}s (${blueprintTokS || '?'} tok/s), prefill: ${((blueprintResult.prefillMs || 0) / 1000).toFixed(1)}s`);
        // Truncation guard — if the blueprint hit the cap (within 8 tokens
        // of the budget) AND doesn't end on terminal punctuation, the
        // codegen will get an incomplete spec. Loud warning so we notice
        // when the budget needs another bump.
        if (blueprintResult.tokenCount >= BLUEPRINT_MAX_TOKENS - 8) {
          const tail = blueprint.slice(-2).trim();
          if (!/[.!?"]/.test(tail)) {
            console.warn(
              `[3D] Blueprint hit the ${BLUEPRINT_MAX_TOKENS}-token cap and looks truncated ` +
              `(ends with "${blueprint.slice(-30)}"). Consider raising BLUEPRINT_MAX_TOKENS.`
            );
          }
        }

        // Phase 2: Generate Three.js code from blueprint
        // Reset chat again — the blueprint exchange is in history and the code prompt
        // is very large (Three.js reference docs), so we need maximum context available
        await loadModelForGeneration(codeModel.value);
        await window.electronAPI.resetChat();
        lastStatus.value = "Vibe Coding...";
        const codePrompt = buildObjectPrompt(blueprint);
        // 16K output budget — the orrery reference is ~270 lines and
        // our quality bar expects new scenes to match that volume. The
        // Keep thinking disabled for 3D codegen. Hybrid reasoning models
        // can otherwise burn output budget before emitting executable JS.
        const codeMaxTokens = 16384;
        _resetStream("Vibe Coding", codeMaxTokens, "Hand-stitching three.js geometry, frame by frame.");
        const codeResult = await callLLM(
          codePrompt,
          {
            maxTokens: codeMaxTokens,
            temperature: 0.7,
            thoughtTokens: 0,
            enableThinking: false,
          },
          ({ text, tokenCount, elapsedMs, prefillMs, genMs }) => {
            const visible = _stripThinkForPreview(text);
            stream.tokenCount = tokenCount;
            stream.elapsedMs = elapsedMs;
            stream.prefillMs = prefillMs;
            // Real generation rate excludes prefill so the readout
            // doesn't get dragged down by the system prompt.
            stream.tokensPerSec = genMs > 0 ? +(tokenCount / (genMs / 1000)).toFixed(1) : 0;
            stream.preview = visible.length > 600 ? "…" + visible.slice(-600) : visible;
          },
        );
        const codeTokS = codeResult.elapsedMs > 0
          ? ((codeResult.tokenCount / codeResult.elapsedMs) * 1000).toFixed(1)
          : null;
        console.log("Raw LLM output:", codeResult.text);
        console.log(`Code gen: ${codeResult.tokenCount} tokens in ${(codeResult.elapsedMs / 1000).toFixed(1)}s (${codeTokS || '?'} tok/s), prefill: ${((codeResult.prefillMs || 0) / 1000).toFixed(1)}s`);
        // Codegen truncation telemetry. The wrapper template already
        // provides `scene.add(root); return root;` — user code never
        // emits a `return` statement, so the only honest signal of
        // truncation is the final character. Clean ends finish on
        // `;`, `}`, or `)`. Mid-token truncation leaves an alphabetic
        // letter, comma, or open paren as the final char.
        const codeTail = codeResult.text.trim().slice(-80);
        const lastChar = codeTail.slice(-1);
        const looksTruncated = !/[;)}\]]/.test(lastChar);
        if (looksTruncated) {
          console.warn(
            `[3D] Codegen ended mid-statement at ${codeResult.tokenCount}/${codeMaxTokens} tokens ` +
            `(tail: "${codeTail.slice(-40)}"). Either the model hit its slot context cap (verify ` +
            `"-np 1" in the llama-server startup args, then restart Electron) or it emitted an ` +
            `EOG token early.`
          );
        }

        let code = normalizeLLMCode(codeResult.text);
        let userCodeMatch = code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        let userCode = userCodeMatch ? userCodeMatch[1].trim() : "";

        // Retry heuristic — fires when phase-2 produces anything we
        // can't safely run: empty output, or output truncated mid-code
        // (token budget ran out, context limit hit). Detected via:
        //   (a) no userCode extracted
        //   (b) userCode exists but has badly mismatched braces, which
        //       normalizeLLMCode couldn't auto-fix. Truncated output
        //       typically ends mid-expression with many more `{` than `}`.
        let renderCheck = validateRenderableUserCode(userCode);
        const openBraces  = (userCode.match(/\{/g) || []).length;
        const closeBraces = (userCode.match(/\}/g) || []).length;
        const truncated = userCode && (openBraces - closeBraces > 5
                                       || !/return\s+root\s*;?\s*$/.test(userCode.replace(/\s+$/, "").slice(-400))
                                          && userCode.length > 2000
                                          && openBraces > closeBraces);
        if (!userCode || truncated || !renderCheck.ok) {
          console.warn(
            `[3D] Phase-2 ${userCode ? (truncated ? 'produced truncated code' : renderCheck.reason) : 'produced empty code'} — retrying with terse prompt.`
          );
          lastStatus.value = "Retrying...";
          _resetStream("Retrying", 8192, "First pass came back unsteady — re-rolling with a tighter prompt.");
          await window.electronAPI.resetChat();
          const tersePrompt = `You are a Three.js developer. Output ONLY raw JavaScript. No markdown, no prose, no <think>. Start with setObjectInfo(...).

TASK: ${blueprint}

Pre-declared: THREE, scene, root, MAT, TEX, SHADER, FLUID, P, H, FX, CELESTIAL, addUpdateCallback, setObjectInfo. Cinematic post-FX baseline is already applied.
For water/potion/blood: use FLUID.oceanWater / FLUID.fountainBasin / FLUID.stream / H.fillLiquid+FLUID.upgradeFill.
For glow: FX.withGlow(mesh, color, {scale, intensity}).
For physics: await P.init(); P.body(mesh, {...}).
Every mesh goes on root. The code MUST include root.add(...) calls for visible objects. Keep object height 0.3-1.5. No imports. No markdown fences.

OUTPUT CODE:`;
          const retry = await callLLM(
            tersePrompt,
            { maxTokens: 8192, temperature: 0.6, thoughtTokens: 0, enableThinking: false },
            ({ text, tokenCount, elapsedMs }) => {
              const visible = _stripThinkForPreview(text);
              stream.tokenCount = tokenCount;
              stream.elapsedMs = elapsedMs;
              stream.tokensPerSec = elapsedMs > 0 ? +(tokenCount / (elapsedMs / 1000)).toFixed(1) : 0;
              stream.preview = visible.length > 600 ? "…" + visible.slice(-600) : visible;
            },
          );
          console.log("Retry raw output:", retry.text);
          code = normalizeLLMCode(retry.text);
          userCodeMatch = code.match(
            /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
          );
          userCode = userCodeMatch ? userCodeMatch[1].trim() : "";
          renderCheck = validateRenderableUserCode(userCode);
        }

        console.log("User code:", userCode || "(empty — LLM produced no code)");
        if (!userCode) {
          throw new Error(
            "LLM produced no usable code (thinking may have consumed all tokens). Try again.",
          );
        }
        if (!renderCheck.ok) {
          throw new Error(`${renderCheck.reason}. Try again or use a larger 3D code model.`);
        }

        // Render
        lastStatus.value = "Rendering...";
        _resetStream("Rendering", 1, "Compiling shaders and casting first light.");
        // Rendering doesn't stream tokens — we just want the loading
        // screen to flip into "Rendering" while the GPU does its job.
        // Set a fake "almost done" progress so the bar reads right.
        stream.tokenCount = 1;
        stream.maxTokens = 1;
        await viewer.applyModuleCode(code, "replace");
        restoreViewerEnvironmentControls();

        // Store for refinement
        lastGeneratedCode.value = userCode;

        // Combined tok/s from both phases
        const totalTokens = blueprintResult.tokenCount + codeResult.tokenCount;
        const totalMs = blueprintResult.elapsedMs + codeResult.elapsedMs;
        const tokensPerSecond = totalMs > 0 ? ((totalTokens / totalMs) * 1000).toFixed(1) : null;

        lastStatus.value = `Crafted! (${tokensPerSecond || '?'} tok/s)`;
        const snapshot = await captureViewerSnapshot("Preview");
        const savedRecord = await addObjectInference(form.prompt, code, {
          success: true,
          blueprint,
          tokensPerSecond,
          model: currentModel.value.modelname,
          screenshots: snapshot ? [snapshot] : [],
          thumbnail: snapshot?.dataUrl || "",
        });
        console.log("[3D] Inference saved to history:", savedRecord?.id);
        form.prompt = "";
      } catch (e) {
        console.error("❌ Generation error:", e);
        lastStatus.value = "❌ Failed: " + e.message;
      } finally {
        _endStream();
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
        await loadModelForGeneration(codeModel.value);
        const viewer = threeViewer.value;
        if (!viewer) throw new Error("Viewer not initialized");

        // Reset chat history to free context for refinement
        await window.electronAPI.resetChat();

        const prompt = buildRefinePrompt(lastGeneratedCode.value, refinePrompt.value);
        const refineMaxTokens = 8192;
        _resetStream("Refining", refineMaxTokens, "Sculpting on top of the existing scene.");
        const result = await callLLM(
          prompt,
          {
            maxTokens: refineMaxTokens,
            temperature: 0.7,
            thoughtTokens: 0,
            enableThinking: false,
          },
          ({ text, tokenCount, elapsedMs, prefillMs, genMs }) => {
            const visible = _stripThinkForPreview(text);
            stream.tokenCount = tokenCount;
            stream.elapsedMs = elapsedMs;
            stream.prefillMs = prefillMs;
            // Real generation rate excludes prefill so the readout
            // doesn't get dragged down by the system prompt.
            stream.tokensPerSec = genMs > 0 ? +(tokenCount / (genMs / 1000)).toFixed(1) : 0;
            stream.preview = visible.length > 600 ? "…" + visible.slice(-600) : visible;
          },
        );
        const tokensPerSecond = result.elapsedMs > 0 ? ((result.tokenCount / result.elapsedMs) * 1000).toFixed(1) : null;
        console.log(`Refine: ${result.tokenCount} tokens in ${(result.elapsedMs / 1000).toFixed(1)}s (${tokensPerSecond || '?'} tok/s)`);

        const code = normalizeLLMCode(result.text);
        const userCodeMatch = code.match(
          /\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/,
        );
        const refinedUserCode = userCodeMatch?.[1]?.trim() || "";
        if (!refinedUserCode) throw new Error("Refinement produced no code");
        const renderCheck = validateRenderableUserCode(refinedUserCode);
        if (!renderCheck.ok) throw new Error(`Refinement failed: ${renderCheck.reason}`);

        lastGeneratedCode.value = refinedUserCode;
        _resetStream("Rendering", 1, "Compiling shaders and casting first light.");
        stream.tokenCount = 1;
        stream.maxTokens = 1;
        await viewer.applyModuleCode(code, "replace");
        restoreViewerEnvironmentControls();
        lastStatus.value = `Refined! (${tokensPerSecond || '?'} tok/s)`;
        const snapshot = await captureViewerSnapshot("Preview");
        await addObjectInference(`[Refine] ${refinePrompt.value}`, code, {
          success: true,
          tokensPerSecond,
          model: currentModel.value.modelname,
          screenshots: snapshot ? [snapshot] : [],
          thumbnail: snapshot?.dataUrl || "",
        });
        refinePrompt.value = '';
      } catch (e) {
        console.error("Refine error:", e);
        lastStatus.value = "Refine failed: " + e.message;
      } finally {
        _endStream();
        isLoading.value = false;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════
    onMounted(async () => {
      // Load object inferences from shared store
      await loadObjectInferences();

      // Check if the required planner and codegen models are already downloaded
      await refreshRequiredModelAvailability();

      // Resume any active downloads
      resumeActiveDownloadIfAny();

      await nextTick();
      waitForViewerReady().then(() => {
        restoreViewerEnvironmentControls();
        return loadDefaultObject();
      });
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
      clearDeleteToastTimer();
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
      // Game-style streaming loader
      stream,
      streamProgress,
      streamPreviewEl,
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
      performancePresets,
      currentPerformance,
      setPerformance,
      setLightIntensity,
      copyPrompt,
      historyThumbnail,
      formatHistoryDate,
      clearScene,
      handleSuccess,
      handleError,
      useExample,
      removeInference,
      pendingDelete,
      dismissDeleteToast,
      confirmDeleteObject,
      actionsFor,
      handleAction,
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
      missingRequiredModels,
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
.three-prompt-input {
  min-height: 7rem;
}

.level-item.buttons {
  gap: var(--bz-space-2);
}

h1.bz-h1 {
  font-size: var(--bz-size-h1) !important;
  line-height: var(--bz-line-tight);
  text-align: left;
  margin: 0;
}

h2.bz-h2 {
  font-size: var(--bz-size-h2) !important;
  line-height: var(--bz-line-tight);
  text-align: left;
  margin: 0;
}

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
  box-shadow: 0 8px 32px var(--bz-scrim);
  aspect-ratio: 16 / 9;
  width: 100%;
}
.viewer-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bz-scrim-deep);
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
  padding: var(--bz-space-5) var(--bz-space-6);
  flex: 1;
  min-height: 0;
  width: 100%;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
}
.models__deployment-install > .columns {
  display: block;
  margin: 0;
}
.models__deployment-install > .columns > .column {
  width: 100%;
  padding: 0 !important;
}
.models__activity--payouts {
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r) !important;
  background: var(--bz-card);
  width: 100%;
}
.models__activity--payouts > .columns {
  margin: 0;
}
.models__activity--payouts > .columns > .column {
  padding: 0;
}
h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: var(--bz-fg);
}
.bz-screen-header .bz-h1 {
  font-size: var(--bz-size-h1) !important;
  line-height: var(--bz-line-tight);
  text-align: left;
}
.bz-screen-header .bz-eyebrow {
  margin: 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  line-height: 1.2;
  text-align: left;
  font-weight: 400;
}
.bz-screen-header .bz-title-icon {
  color: var(--bz-purple-300);
  font-size: 28px !important;
}
.bz-screen-header .bz-screen-subtitle {
  margin: 0;
  max-width: 60ch;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
  text-align: left;
  font-weight: 400;
}
p {
  margin-bottom: 1em;
  font-size: 24px;
  color: var(--bz-fg);
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
}
.notification {
  opacity: 0.8;
}
.environment-controls.bz-3d-environment {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.45fr);
  gap: var(--bz-space-4, 16px);
  padding: var(--bz-space-5, 20px) !important;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-lg, 8px);
  background: var(--bz-surface);
}
.bz-3d-control-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3, 12px);
}
.bz-3d-control-group--performance {
  grid-column: 1 / -1;
}
.bz-3d-control-head {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2, 8px);
  color: var(--bz-fg);
  font-size: var(--bz-size-meta, 13px);
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0;
}
.bz-3d-control-head .material-symbols-outlined {
  font-size: 19px;
  color: var(--bz-accent);
}
.bz-3d-selector {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: var(--bz-space-2, 8px);
}
.bz-3d-control-group--weather .bz-3d-selector {
  grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
}
.bz-3d-control-group--performance .bz-3d-selector {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
.bz-3d-option {
  min-width: 0;
  min-height: 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bz-space-2, 8px);
  padding: 10px 12px;
  color: var(--bz-fg-muted);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-radius-md, 8px);
  background: var(--bz-panel-soft, var(--bz-surface-alt));
  cursor: pointer;
  font-family: "Fira Sans", sans-serif;
  font-size: var(--bz-size-body, 14px);
  font-weight: 650;
  line-height: 1.1;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
}
.bz-3d-option:hover {
  color: var(--bz-fg);
  border-color: var(--bz-border-strong, var(--bz-accent));
  background: var(--bz-surface-raised, var(--bz-surface));
  transform: translateY(-1px);
}
.bz-3d-option.is-selected {
  color: var(--bz-control-selected-fg);
  border-color: var(--bz-control-selected-border);
  background: var(--bz-control-selected-bg);
}
.bz-3d-option .material-symbols-outlined {
  flex: 0 0 auto;
  font-size: 20px;
  color: currentColor;
}
.bz-3d-option span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 980px) {
  .environment-controls.bz-3d-environment {
    grid-template-columns: 1fr;
  }
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
  color: var(--bz-fg-faint) !important;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
}
.mode-btn:hover {
  color: var(--bz-fg) !important;
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg);
}
.mode-btn.active {
  color: var(--bz-control-selected-fg) !important;
  border: 1px solid var(--bz-control-selected-border) !important;
  background: var(--bz-control-selected-bg) !important;
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
  border: 1px solid var(--bz-fg-faint);
  background: transparent;
  color: var(--bz-fg-mid);
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.iteration-pill:hover {
  border-color: var(--bz-fg-mid);
  color: var(--bz-fg);
}
.iteration-pill.active {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
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
  color: var(--bz-info);
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
  border-bottom: 1px solid var(--bz-border);
}
.download-list li:last-child {
  border-bottom: none;
}
.download-list .material-symbols-outlined {
  color: var(--bz-fg-mid);
  font-size: 1.25em;
}
.download-item-name {
  flex: 1;
  font-weight: 500;
}
.download-item-size {
  color: var(--bz-fg-low);
  font-size: 0.9em;
  margin-left: 1em;
}

.rotating {
  animation: bz-spin 1s linear infinite;
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
  margin-bottom: var(--bz-space-5);
  padding: var(--bz-space-4);
}
.example-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--bz-space-3);
}
.example-card {
  min-height: 136px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  grid-template-areas:
    "icon title"
    "icon desc";
  align-content: start;
  gap: var(--bz-space-2) var(--bz-space-3);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  color: var(--bz-fg);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    transform var(--bz-dur-fast) var(--bz-ease-out),
    box-shadow var(--bz-dur-fast) var(--bz-ease-out);
}
.example-card:hover {
  background: var(--bz-raised);
  border-color: var(--bz-border-brand);
  transform: translateY(-2px);
  box-shadow: var(--bz-elev-brand);
}
.example-icon {
  grid-area: icon;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bz-border-brand);
  border-radius: var(--bz-r-sm);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
  font-size: 22px !important;
  line-height: 1;
}
.example-title {
  grid-area: title;
  margin: 0;
  color: var(--bz-fg);
  font-family: var(--bz-font-display);
  font-size: var(--bz-size-h3);
  font-weight: 400;
  line-height: var(--bz-line-tight);
}
.example-desc {
  grid-area: desc;
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
}
div.question {
  height: 100%;
  border: 1px solid var(--bz-border);
  padding: var(--bz-space-3);
  margin: 0 !important;
  box-shadow: none;
  border-radius: var(--bz-r);
  background: var(--bz-card);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  overflow: hidden;
}
.history-header {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 0.75em;
  font-size: var(--bz-size-meta);
  color: var(--bz-fg);
  flex-wrap: wrap;
}
.history-icon {
  font-size: 24px;
}
.history-badge {
  padding: 3px 24px 4px 8px;
  border: 1px solid var(--bz-border-strong);
  background-color: var(--bz-border);
  border-radius: 24px;
  font-size: 22px;
  font-weight: 600;
  text-transform: uppercase;
}
.history-meta {
  margin-left: auto;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.answer__model {
  font-weight: 600;
  color: var(--bz-fg-low);
  display: flex;
  align-items: center;
}
.answer__tps {
  color: var(--bz-emerald-500);
  font-weight: 700;
  margin-left: 4px;
}
.history-prompt {
  display: none;
}

.three-history-preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}

.three-history-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.three-history-preview__empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--bz-fg-low);
}

.three-history-preview__empty .material-symbols-outlined {
  font-size: 48px !important;
}

.bz-image-delete-toast {
  position: fixed;
  right: max(var(--bz-space-5), env(safe-area-inset-right));
  bottom: max(var(--bz-space-5), env(safe-area-inset-bottom));
  z-index: 80;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  max-width: min(420px, calc(100vw - 32px));
  padding: var(--bz-space-3);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  box-shadow: var(--bz-shadow-lg);
  color: var(--bz-fg);
}

.bz-image-delete-toast .material-symbols-outlined {
  font-size: 18px !important;
  color: var(--bz-danger);
}

.bz-image-delete-toast__body {
  min-width: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
}

.bz-image-delete-toast__ghost,
.bz-image-delete-toast__danger {
  height: 30px;
  border-radius: var(--bz-r-sm);
  padding: 0 var(--bz-space-3);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta);
  cursor: pointer;
}

.bz-image-delete-toast__ghost {
  background: transparent;
  border: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
}

.bz-image-delete-toast__ghost:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.bz-image-delete-toast__danger {
  background: var(--bz-danger-soft);
  border: 1px solid var(--bz-danger-soft);
  color: var(--bz-danger);
  font-weight: 700;
}

.bz-image-delete-toast__danger:hover {
  filter: brightness(1.08);
}

.bz-image-toast-enter-active,
.bz-image-toast-leave-active {
  transition:
    opacity var(--bz-dur-base) var(--bz-ease-out),
    transform var(--bz-dur-base) var(--bz-ease-out);
}

.bz-image-toast-enter-from,
.bz-image-toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.bz-image-toast-enter-to,
.bz-image-toast-leave-from {
  opacity: 1;
  transform: translateY(0);
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
  color: var(--bz-danger);
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
  color: var(--bz-fg);
  background: var(--bz-border);
  box-shadow: 8px 8px 0 var(--bz-purple-glow);
  border: 1px solid var(--bz-fg-faint) !important;
  transition: 200ms ease-in;
}
::placeholder {
  color: var(--bz-border) !important;
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
  background: var(--bz-border);
  border: 2px solid var(--bz-border-strong);
  color: var(--bz-fg-low);
  cursor: pointer;
  transition: all 0.2s ease;
}

.reasoning-toggle-btn:hover {
  background: var(--bz-border-strong);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg);
}

.reasoning-toggle-btn.active {
  background: rgba(32, 156, 238, 0.4);
  border-color: var(--bz-info);
  color: var(--bz-fg);
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
/* Canvas-first treatment — first child renders as a full-width hero,
   subsequent items wrap into a 2-column grid (50% each on desktop) so
   the action cluster on every card stays on a single line. Same shape
   GenerativeImage / Video / Audio use. */
ol.chat {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  grid-auto-rows: 1fr;
  align-items: stretch;
  gap: var(--bz-space-4);
  list-style: none;
  padding: 0;
  margin: var(--bz-space-5) 0;
}
@media (min-width: 880px) {
  ol.chat {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
ol.chat .history-item:not(:first-child) {
  width: 100%;
}
ol.chat .history-item:not(:first-child) hr {
  display: none;
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
  display: flex;
  min-width: 0;
  animation: bz-rise 0.4s ease-out forwards;
  opacity: 0;
}

.history-item > .question {
  width: 100%;
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
  background: var(--bz-control-selected-bg);
  border: 2px solid var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px var(--bz-scrim);
  transition: all 0.2s ease;
  z-index: 100;
  animation: bz-rise 0.3s ease-out;
}

.scroll-to-top-btn:hover {
  background: var(--bz-control-selected-bg);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--bz-scrim);
}

.scroll-to-top-btn .material-symbols-outlined {
  font-size: 24px;
  border: none;
}

/* ═══════════════════════════════════════════════════════════════════════
   SCREENSHOTS PREVIEW (in history)
   ═══════════════════════════════════════════════════════════════════════ */
.screenshots-preview {
  display: none;
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
  border-color: var(--bz-purple-500);
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
  background: var(--bz-scrim-deep);
  color: var(--bz-fg);
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
  animation: bz-fade-in 0.2s ease;
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
  background: var(--bz-card);
  border-radius: 12px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px var(--bz-scrim-strong);
  border: 1px solid var(--bz-border);
}

.screenshot-modal-close {
  position: absolute;
  top: -40px;
  right: 0;
  background: none;
  border: none;
  color: var(--bz-fg);
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
  border-bottom: 1px solid var(--bz-border);
}

.screenshot-modal-header h3 {
  margin: 0;
  color: var(--bz-fg);
  font-size: 1.1rem;
}

.screenshot-modal-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-btn {
  background: var(--bz-border);
  border: none;
  color: var(--bz-fg);
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: var(--bz-purple-soft);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-indicator {
  color: var(--bz-fg-mid);
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
  box-shadow: 0 4px 20px var(--bz-scrim);
}

.screenshot-modal-footer {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--bz-border);
}

.refine-section {
  border: 1px solid var(--bz-emerald-soft);
  border-radius: 6px;
  padding: 0.5rem;
  background: rgba(72, 199, 142, 0.05);
}

.refine-section .input {
  background: var(--bz-scrim);
  border-color: var(--bz-emerald-soft);
  color: var(--bz-fg);
}

.refine-section .input::placeholder {
  color: var(--bz-fg-low);
}

.three-progress-card,
.three-notice {
  position: relative;
  margin-bottom: 1rem;
  padding: 14px 16px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
}

.three-progress-card__head,
.three-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.three-progress-card__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.three-progress-card__subtitle {
  margin: 6px 0 0;
  color: var(--bz-muted);
  font-size: 0.9rem;
}

.three-progress-card__pct {
  color: var(--bz-fg);
  font-size: 1.45rem;
  line-height: 1;
}

.three-progress-card :deep(.bz-pulse-wrap--bar) {
  margin-top: 12px;
}

.three-progress-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 10px;
  color: var(--bz-muted);
  font-family: var(--bz-font-mono);
  font-size: 0.78rem;
}

.three-progress-card__tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-card);
  color: var(--bz-muted);
}

.three-progress-card__preview {
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-canvas);
}

.three-progress-card__preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--bz-border);
  color: var(--bz-muted);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.three-progress-card__preview-body {
  margin: 0;
  padding: 12px;
  height: 120px;
  max-height: 120px;
  text-align: left;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-mono);
  font-size: 0.78rem;
  line-height: 1.45;
}

.three-progress-card__cursor {
  display: inline-block;
  color: var(--bz-purple-300);
  animation: bz-caret 1s steps(1) infinite;
}

.three-notice--danger {
  border-color: color-mix(in srgb, var(--bz-danger) 42%, var(--bz-border));
  background: var(--bz-danger-soft);
}

.three-notice__body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.three-notice__title {
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.three-notice .download-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.three-notice .download-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--bz-muted);
}

.three-progress-card .download-list {
  margin-top: 12px;
}

@keyframes bz-caret {
  50% { opacity: 0; }
}
</style>
