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
                    graphic_eq
                  </span>
                  Generative Audio
                </h1>
              </div>
            </div>
          </div>

          <!-- GENERATION PROGRESS -->
          <div
            v-if="generation.active"
            class="generation notification is-info"
            style="margin-bottom: 1rem"
          >
            <p class="mb-2">
              <span class="fira-sans-condensed-black-italic is-size-4">
                <button
                  disabled
                  class="button is-loading is-info is-small mr-2 p-4"
                ></button>
                Generating Audio
                <span class="ml-1" v-if="generation.stage">
                  ({{ generation.stage }})
                </span>
              </span>
              <span
                class="fira-sans-condensed-black-italic is-pulled-right is-size-4"
              >
                {{ Math.round(generation.pct) }}%
              </span>
            </p>
            <progress
              class="progress is-success"
              :value="Math.max(0, Math.min(100, generation.pct))"
              max="100"
            >
              {{ Math.round(generation.pct) }}%
            </progress>
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <!-- MODE TOGGLES (TTS vs Clone) -->
                <div class="control mb-4 has-text-left">
                  <input
                    v-model="mode"
                    :value="'tts'"
                    id="mode_tts"
                    type="radio"
                    name="mode"
                    :checked="mode === 'tts'"
                  />
                  <label for="mode_tts" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      record_voice_over
                    </span>
                    Text to Speech
                  </label>

                  <input
                    v-model="mode"
                    :value="'clone'"
                    id="mode_clone"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_clone" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      genetics
                    </span>
                    Voice Clone
                  </label>

                  <!-- LANGUAGE SELECTOR -->
                  <div class="select is-dark is-pulled-right">
                    <select v-model="language">
                      <option
                        v-for="(name, code) in languages"
                        :key="code"
                        :value="code"
                      >
                        {{ languageFlags[code] }} {{ name }}
                      </option>
                    </select>
                  </div>
                </div>

                <!-- VOICE GENDER SELECTOR (TTS mode only) -->
                <div v-if="mode === 'tts'" class="control mb-4 has-text-left">
                  <input
                    v-model="voiceGender"
                    value="female"
                    id="gender_female"
                    type="radio"
                    name="gender"
                  />
                  <label for="gender_female" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 24px !important"
                    >
                      female
                    </span>
                    Female
                  </label>

                  <input
                    v-model="voiceGender"
                    value="male"
                    id="gender_male"
                    type="radio"
                    name="gender"
                  />
                  <label for="gender_male" class="radio">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 24px !important"
                    >
                      male
                    </span>
                    Male
                  </label>
                </div>

                <!-- VOICE CLONE FILE INPUT -->
                <div v-if="mode === 'clone'">
                  <div class="file is-fullwidth is-medium mb-3">
                    <label class="file-label">
                      <input
                        class="file-input"
                        type="file"
                        accept="audio/*"
                        @change="handleSynthesisFile"
                      />
                      <span class="file-cta">
                        <span class="file-icon">
                          <span class="material-symbols-outlined">
                            upload_file
                          </span>
                        </span>
                        <span class="file-label">Reference Voice (5-10s)</span>
                      </span>
                      <span class="file-name">
                        {{ synthesisFileName || "No file selected" }}
                      </span>
                    </label>
                  </div>
                  <!-- Reference Transcript Input -->
                  <div v-if="synthesisBase64" class="field">
                    <label class="label has-text-white has-text-left is-size-6">
                      <span class="material-symbols-outlined mr-1" style="font-size: 18px; vertical-align: middle;">
                        subtitles
                      </span>
                      Reference Transcript
                      <span class="has-text-grey-light is-size-7 ml-2">
                        (type exactly what is said in the audio)
                      </span>
                    </label>
                    <div class="control">
                      <textarea
                        class="textarea"
                        v-model="referenceTranscript"
                        placeholder="Enter the exact words spoken in your reference audio..."
                        rows="2"
                      ></textarea>
                    </div>
                    <p class="help has-text-grey-light">
                      For best results, provide an accurate transcription of your reference audio.
                    </p>
                  </div>
                </div>

                <!-- READINESS CTA -->
                <div
                  v-if="showUpdateCTA && readiness.currentMode == mode"
                  class="notification is-danger mb-6 mt-6 p-6"
                  style="margin-bottom: 1rem"
                >
                  <p class="mb-2">
                    <strong class="fira-sans-condensed-black-italic is-size-2">
                      Download Required
                    </strong>
                    <span v-if="readiness.missingRepos.length">
                      <ul style="margin-top: 0.5rem; text-transform: lowercase">
                        <li v-for="d in readiness.repoDetails" :key="d.repo">
                          <span
                            class="material-symbols-outlined is-size-3 mr-1"
                          >
                            deployed_code
                          </span>
                          {{ d.repo }}
                        </li>
                      </ul>
                    </span>

                    <span v-if="readiness.missingGguf">
                      <ul style="margin-top: 0.5rem; text-transform: lowercase">
                        <li v-for="gguf in readiness.ggufNames" :key="gguf">
                          <span
                            class="material-symbols-outlined is-size-3 mr-1"
                          >
                            deployed_code
                          </span>
                          {{ gguf }}
                        </li>
                      </ul>
                    </span>

                    <span v-if="readiness.notes.length">
                      <br />
                      Notes:
                      <ul style="margin-top: 0.5rem">
                        <li v-for="(n, i) in readiness.notes" :key="i">
                          • {{ n }}
                        </li>
                      </ul>
                    </span>
                  </p>
                  <hr />
                  <div class="buttons">
                    <button
                      class="button is-warning mr-5 is-large"
                      @click="prefetchForMode"
                      :disabled="downloads.active || readiness.authRequired"
                      title="(Re)download required files"
                    >
                      <span class="material-symbols-outlined mr-1">
                        download
                      </span>
                      Download Now
                    </button>
                  </div>
                </div>

                <!-- GENERATION ERROR -->
                <div
                  v-else-if="generation.error"
                  class="notification is-danger"
                  style="margin-bottom: 1rem"
                >
                  <strong>Generation failed.</strong>
                  {{ generation.error }}
                </div>

                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="notification is-info p-6"
                  style="margin-bottom: 1.25rem"
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
                  level="LVL2"
                  :demo-prompt="DEMO_PROMPT"
                  :is-generating="isLoading"
                  @access-changed="onAccessChanged"
                  @demo-generate="onDemoGenerate"
                  class="mt-5"
                />

                <!-- PROMPT -->
                <form ref="promptForm" @submit.prevent>
                  <input
                    ref="promptInput"
                    class="input is-large is-fullwidth"
                    type="text"
                    :placeholder="promptPlaceholder"
                    v-model="form.prompt"
                    @keyup.enter="
                      canGenerateWithAccess && sendMessage(form.prompt)
                    "
                    :disabled="isLoading || !canGenerateWithAccess"
                  />
                  <button
                    class="button chat is-loading is-outlined is-info is-large is-fullwidth"
                    v-if="isLoading"
                  ></button>
                </form>

                <hr class="mt-5" />

                <!-- GENERATION HISTORY HEADER -->
                <div class="level pt-5 mt-5">
                  <div class="level-left">
                    <div class="level-item">
                      <h2 class="fira-sans-condensed-black-italic has-text-white is-size-2">
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
                        :disabled="inferences.length === 0"
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

                <!-- RESULTS -->
                <ol class="chat" v-if="inferences.length">
                  <li
                    v-for="(inference, displayIndex) in paginatedInferences"
                    :key="inference.id || inference._originalIndex"
                    class="history-item"
                    :style="{ animationDelay: `${Math.min(displayIndex * 50, 500)}ms` }"
                  >
                    <div class="question">
                      <div class="audio-meta">
                        <span class="tag is-dark">
                          {{
                            languageFlags[inference.language] ||
                            inference.language
                          }}
                        </span>
                        <span
                          v-if="inference.hasClone"
                          class="tag is-dark ml-2"
                        >
                          <span class="material-symbols-outlined is-size-6">
                            genetics
                          </span>
                        </span>
                      </div>
                      <!-- Audio Player -->
                      <div class="audio-container">
                        <audio
                          v-if="inference?.answer?.data?.audio_path"
                          :src="fileUrl(inference.answer.data.audio_path)"
                          controls
                          class="audio-player"
                        ></audio>
                      </div>
                      <hr />
                      <p class="prompt-text mt-3">
                        {{ inference.question }}
                      </p>

                      <hr />

                      <button
                        class="button is-medium is-success copy is-pulled-right ml-5 mr-0 p-0 pl-1 pr-4"
                        @click="downloadAudio(inference._originalIndex)"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          save
                        </span>
                        Download
                      </button>
                      <button
                        class="button is-medium is-danger is-pulled-right ml-2 p-0 pl-1 pr-1"
                        @click="removeInference(inference._originalIndex)"
                        title="Remove this result"
                      >
                        <span class="material-symbols-outlined is-size-2">
                          delete
                        </span>
                      </button>
                      <button
                        class="button is-medium is-success copy is-pulled-left p-0 pl-1 pr-1"
                        @click="
                          copy(inference.question);
                          hasCopy[inference._originalIndex] = true;
                          scrollToTop();
                        "
                      >
                        <span
                          class="material-symbols-outlined is-size-2"
                          v-if="!hasCopy[inference._originalIndex]"
                        >
                          content_copy
                        </span>
                        <span
                          class="material-symbols-outlined is-size-2"
                          v-else
                        >
                          check
                        </span>
                      </button>
                      <button
                        disabled
                        class="button is-medium is-warning copy is-pulled-left ml-5 pl-2"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          token
                        </span>
                        Mint
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
    </div>
  </div>
</template>

<script>
import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { v4 as uuid } from "uuid";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { io } from "socket.io-client";
import {
  generationStore,
  ensureGenerationSocket,
  startGeneration,
  setBlocked,
  setError,
  stopGeneration,
  clearError,
} from "../stores/generationStore";
import AccessRequirements from "./AccessRequirements.vue";

const DEMO_PROMPT = "Hello, welcome to sovereign AI.";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;
const WS_GEN = `${API_BASE}/generation`;

export default {
  name: "GenerativeAudio",
  components: {
    AccessRequirements,
  },
  setup() {
    // ------------ basic state -------------
    const selectedModel = ref("multilingual");
    const mode = ref("tts"); // 'tts' or 'clone'
    const language = ref("en");
    const exaggerationPct = ref(50); // 0-100 -> maps to 0.0-1.0
    const isLoading = ref(false);
    const form = reactive({ prompt: "" });
    const inferences = reactive([]);
    const hasCopy = reactive([]);
    const promptInput = ref(null);

    // ------------ lazy loading pagination ----------------
    const ITEMS_PER_PAGE = 10;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);

    // Reversed inferences (most recent first) with original index
    const reversedInferences = computed(() => {
      return inferences.map((item, idx) => ({
        ...item,
        _originalIndex: idx,
      })).reverse();
    });

    // Displayed inferences (lazy loaded subset)
    const paginatedInferences = computed(() => {
      return reversedInferences.value.slice(0, displayedCount.value);
    });

    // Check if there are more items to load
    const hasMore = computed(() => displayedCount.value < inferences.length);

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          inferences.length
        );
        isLoadingMore.value = false;
      }, 100);
    };

    // Reset to initial count when new inference is added
    const resetToFirstPage = () => {
      displayedCount.value = ITEMS_PER_PAGE;
    };

    // Intersection Observer for infinite scroll
    let scrollObserver = null;
    const setupScrollObserver = () => {
      if (scrollObserver) scrollObserver.disconnect();
      if (!loadMoreSentinel.value) return;

      // Use the scroll container as root for proper intersection detection
      const root = scrollContainer.value || document.querySelector('.models__deployment-install');
      scrollObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore.value) {
            loadMore();
          }
        },
        { root, rootMargin: '100px' }
      );
      scrollObserver.observe(loadMoreSentinel.value);
    };

    // Scroll to top handler
    const scrollToTop = () => {
      const container = scrollContainer.value || document.querySelector('.models__deployment-install');
      if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
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

    // ------------ access control -----------
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (val) => {
      hasAccess.value = val;
    };
    const onDemoGenerate = (demoPrompt) => {
      form.prompt = demoPrompt;
      sendMessage(demoPrompt, true); // true = isDemo
    };

    const canGenerateWithAccess = computed(() => {
      return canGenerate.value && hasAccess.value;
    });

    // Supported languages (23 languages) - for Multilingual model
    const languages = {
      ar: "Arabic",
      da: "Danish",
      de: "German",
      el: "Greek",
      en: "English",
      es: "Spanish",
      fi: "Finnish",
      fr: "French",
      he: "Hebrew",
      hi: "Hindi",
      it: "Italian",
      ja: "Japanese",
      ko: "Korean",
      ms: "Malay",
      nl: "Dutch",
      no: "Norwegian",
      pl: "Polish",
      pt: "Portuguese",
      ru: "Russian",
      sv: "Swedish",
      sw: "Swahili",
      tr: "Turkish",
      zh: "Chinese",
    };

    const languageFlags = {
      ar: "🇸🇦",
      da: "🇩🇰",
      de: "🇩🇪",
      el: "🇬🇷",
      en: "🇺🇸",
      es: "🇪🇸",
      fi: "🇫🇮",
      fr: "🇫🇷",
      he: "🇮🇱",
      hi: "🇮🇳",
      it: "🇮🇹",
      ja: "🇯🇵",
      ko: "🇰🇷",
      ms: "🇲🇾",
      nl: "🇳🇱",
      no: "🇳🇴",
      pl: "🇵🇱",
      pt: "🇧🇷",
      ru: "🇷🇺",
      sv: "🇸🇪",
      sw: "🇹🇿",
      tr: "🇹🇷",
      zh: "🇨🇳",
    };

    // Voice clone reference file
    const synthesisFile = ref(null);
    const synthesisFileName = ref("");
    const synthesisBase64 = ref("");
    const referenceTranscript = ref(""); // Transcript of what the reference audio says

    // controller for abortable /plan calls
    const planReq = reactive({ controller: null, seq: 0 });

    // ------------ readiness ---------------
    const readiness = reactive({
      ok: true,
      checking: true, // Indicates initial check is in progress
      missingRepos: [],
      repoDetails: [],
      missingGguf: false,
      ggufNames: [],
      notes: [],
      authRequired: false,
      authRepos: [],
      currentMode: null,
    });

    const showUpdateCTA = computed(
      () =>
        !readiness.checking && (
          readiness.authRequired ||
          generation.blocked ||
          !readiness.ok ||
          readiness.missingRepos.length > 0 ||
          readiness.missingGguf
        )
    );

    const canGenerate = computed(() => {
      if (!readiness.ok || readiness.authRequired || generation.active)
        return false;
      // Clone mode requires voice reference AND transcript
      if (mode.value === "clone" && (!synthesisBase64.value || !referenceTranscript.value.trim())) return false;
      return true;
    });

    const promptPlaceholder = computed(() => {
      if (mode.value === "clone") {
        if (!synthesisBase64.value) {
          return "Upload a reference audio file first...";
        }
        if (!referenceTranscript.value.trim()) {
          return "Enter the transcript of your reference audio above...";
        }
        return `Enter text in ${languages[language.value]} to speak in the cloned voice...`;
      }
      return `Enter text in ${languages[language.value]} to convert to speech...`;
    });

    // ------------ generation --------------
    // Use shared generation store for persistent state across view navigation
    const generation = computed(() => generationStore.state.audio);

    // ------------ pipeline/endpoint maps --
    // Use Qwen TTS for both modes (design for TTS, clone for voice cloning)
    const endpointForMode = () => mode.value === 'clone' ? "/audio/quality/clone" : "/audio/quality/design";
    const pipelineForMode = () => mode.value === 'clone' ? "audio_quality_clone" : "audio_quality_design";
    const currentPipeline = computed(() => pipelineForMode());

    // ------------ downloads state/socket --
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
      total_progress: 0,
      status: "pending",
      pipeline: { tasks: {} },
      wsUrl: null,
    });

    const downloadsSocket = ref(null);
    const lastDlEventAt = ref(0);
    let httpPollTimer = null;

    const socketOpts = {
      transports: ["polling", "websocket"],
      upgrade: true,
      forceNew: true,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 60,
      reconnectionDelay: 1000,
      path: "/socket.io",
    };

    const downloadMatchesMode = computed(() => {
      const name = downloads?.pipeline?.pipeline_name || "";
      return name.endsWith(`:${currentPipeline.value}`);
    });

    // ---- helpers to merge and compute byte-weighted progress
    const mergeTask = (dst, src) => {
      if (!dst) return { ...src };
      const out = { ...dst, ...src };
      if (typeof dst.progress === "number" && typeof src.progress === "number")
        out.progress = Math.max(dst.progress || 0, src.progress || 0);
      if (
        typeof dst.downloaded_size === "number" &&
        typeof src.downloaded_size === "number"
      )
        out.downloaded_size = Math.max(
          dst.downloaded_size || 0,
          src.downloaded_size || 0
        );
      if (
        typeof dst.total_size === "number" &&
        typeof src.total_size === "number"
      )
        out.total_size = Math.max(dst.total_size || 0, src.total_size || 0);
      return out;
    };

    const computeTotalFromTasks = (tasksObj) => {
      const tasks = Object.values(tasksObj || {});
      if (!tasks.length) return 0;
      let totalBytes = 0,
        doneBytes = 0;
      for (const t of tasks) {
        const tot = Number(t.total_size || 0);
        const done = Number(t.downloaded_size || 0);
        if (tot > 0) {
          totalBytes += tot;
          doneBytes += Math.min(done, tot);
        }
      }
      if (totalBytes > 0) return (doneBytes / totalBytes) * 100;
      const sumPct = tasks.reduce((s, t) => s + Number(t.progress || 0), 0);
      return sumPct / tasks.length;
    };

    const applyPipelineUpdate = (p) => {
      if (!p) return;
      downloads.pipelineId = p.pipeline_id || downloads.pipelineId;
      downloads.status = p.status || downloads.status || "downloading";

      const existing = downloads.pipeline?.tasks || {};
      const incoming = p.tasks || {};
      const merged = { ...existing };
      for (const [tid, t] of Object.entries(incoming))
        merged[tid] = mergeTask(existing[tid], t);
      downloads.pipeline = {
        ...(downloads.pipeline || {}),
        ...p,
        tasks: merged,
      };

      const serverPct = Number(p.total_progress ?? 0);
      const tasksPct = computeTotalFromTasks(merged);
      let next =
        Number.isFinite(serverPct) && serverPct > 0 ? serverPct : tasksPct;

      const tasksList = Object.values(merged);
      const anyActive = tasksList.some((t) =>
        ["downloading", "pending"].includes(t.status)
      );
      if (anyActive) next = Math.min(next, 99.9);

      downloads.total_progress = next;
      downloads.progress = next;

      // Safety check: if all tasks are completed but status wasn't updated, force completion
      const allTasksComplete =
        tasksList.length > 0 &&
        tasksList.every((t) => t.status === "completed");
      if (allTasksComplete && downloads.status === "downloading") {
        console.log(
          "[Downloads] All tasks completed, forcing status to completed"
        );
        downloads.status = "completed";
      }

      const wasActive = downloads.active;
      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status
      );

      // Immediately refresh readiness when download completes
      if (wasActive && !downloads.active && downloads.status === "completed") {
        console.log("[Downloads] Download completed, refreshing readiness");
        probeCurrentMode();
      }
    };

    // Throttle download progress updates using requestAnimationFrame
    let pendingPipelineUpdate = null;
    let rafPending = false;

    const throttledApplyPipelineUpdate = (pipeline) => {
      pendingPipelineUpdate = pipeline;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          if (pendingPipelineUpdate) {
            applyPipelineUpdate(pendingPipelineUpdate);
            pendingPipelineUpdate = null;
          }
          rafPending = false;
        });
      }
    };

    const ensureDownloadsSocket = (base = WS_DL) => {
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      downloads.wsUrl = base;
      downloadsSocket.value = io(base, socketOpts);

      downloadsSocket.value.on("connect", () => {
        if (downloads.pipelineId)
          downloadsSocket.value.emit("subscribe", {
            pipeline_id: downloads.pipelineId,
          });
      });

      downloadsSocket.value.on("download_progress", ({ pipeline }) => {
        lastDlEventAt.value = Date.now();
        if (!pipeline) return;
        throttledApplyPipelineUpdate(pipeline);
      });

      downloadsSocket.value.on("connect_error", (e) =>
        console.warn("[downloads] connect_error", e?.message || e)
      );
      downloadsSocket.value.on("error", (e) =>
        console.warn("[downloads] error", e)
      );
    };

    const kickHttpPollIfStale = (pipelineId) => {
      if (httpPollTimer) clearInterval(httpPollTimer);
      httpPollTimer = setInterval(async () => {
        const idleMs = Date.now() - lastDlEventAt.value;
        if (idleMs < 1500) return;
        try {
          const { data } = await axios.get(
            `${API_BASE}/downloads/status/${pipelineId}`
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

    const startDownloadTracking = (pipelineId, websocketUrl) => {
      connectAndSubscribe(pipelineId, websocketUrl);
      const t = setInterval(async () => {
        if (!downloads.active && downloads.status !== "failed") {
          clearInterval(t);
          await probeCurrentMode();
        }
        if (downloads.status === "failed") clearInterval(t);
      }, 1000);
    };

    const resumeActiveDownloadIfAny = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/downloads/list`);
        const active = (data?.pipelines || []).filter((p) =>
          ["pending", "downloading", "retrying", "waiting_retry"].includes(
            p.status
          )
        );
        if (!active.length) return;
        ensureDownloadsSocket();
        active.forEach((pl) => connectAndSubscribe(pl.pipeline_id));
      } catch {}
    };

    const cancelCurrentPipeline = async () => {
      if (!downloads.pipelineId) return;
      try {
        const { status } = await axios.post(
          `${API_BASE}/downloads/cancel/${downloads.pipelineId}`,
          {},
          { validateStatus: () => true }
        );
        if (status === 200) {
          downloads.status = "cancelled";
          downloads.active = false;
        }
      } catch {}
    };

    const retryCurrentPipeline = async () => {
      if (!downloads.pipelineId) return;
      try {
        const { data, status } = await axios.post(
          `${API_BASE}/downloads/retry/${downloads.pipelineId}`,
          {},
          { validateStatus: () => true }
        );
        if (status === 202 && data?.pipeline_id)
          startDownloadTracking(
            data.pipeline_id,
            data.websocket_url || downloads.wsUrl || WS_DL
          );
      } catch {}
    };

    // ------------ readiness helpers -------
    const applyPlanToReadiness = (data) => {
      const repos = Array.isArray(data?.repos) ? data.repos : [];
      const incomplete = repos.filter(
        (r) =>
          r && (r.ok === false || (Number.isFinite(r.missing) && r.missing > 0))
      );
      readiness.missingRepos = [
        ...new Set(incomplete.map((r) => r.repo).filter(Boolean)),
      ];
      readiness.repoDetails = incomplete.map((r) => ({
        repo: r.repo,
        missing: Number.isFinite(r.missing) ? r.missing : null,
        root: r.root || null,
      }));
      const ggufs = Array.isArray(data?.gguf_status) ? data.gguf_status : [];
      const missG = ggufs.filter((g) => g && g.configured && !g.exists);
      readiness.missingGguf = missG.length > 0;
      readiness.ggufNames = missG.map((g) =>
        (g.path || g.name || "").split("/").pop()
      );
      readiness.authRequired = !!data?.auth_required;
      readiness.authRepos = Array.isArray(data?.auth_repos)
        ? data.auth_repos
        : [];
      readiness.notes = Array.isArray(data?.notes) ? data.notes : [];
      const serverOk = !!data?.ok;
      readiness.ok =
        serverOk &&
        !readiness.authRequired &&
        readiness.missingRepos.length === 0 &&
        !readiness.missingGguf;
      readiness.checking = false;

      // If files are still missing after a "completed" download, reset download state
      if (!readiness.ok && downloads.status === "completed") {
        downloads.status = "pending";
        downloads.progress = 0;
        downloads.total_progress = 0;
        downloads.active = false;
        downloads.pipeline = { tasks: {} };
      }
    };

    const apply403ToReadiness = (res) => {
      readiness.authRequired = true;
      readiness.ok = false;
      readiness.checking = false;
      readiness.notes = [];
      readiness.authRepos = [];
      if (Array.isArray(res?.data?.repos)) {
        for (const r of res.data.repos) {
          if (r?.repo) readiness.authRepos.push(r.repo);
          if (r?.hint) readiness.notes.push(r.hint);
          if (r?.error && !r?.hint) readiness.notes.push(r.error);
        }
      }
      if (res?.data?.hint) readiness.notes.push(res.data.hint);
      setBlocked("audio", true);
    };

    const apply409ToReadiness = (res) => {
      readiness.ok = false;
      readiness.checking = false;
      setBlocked("audio", true);
      const rs = res?.data?.repo_status;
      if (rs?.repo) {
        const missingCount = Array.isArray(rs?.missing)
          ? rs.missing.length
          : typeof rs?.missing === "number"
            ? rs.missing
            : 1;
        const entry = {
          repo: rs.repo,
          missing: Math.max(1, missingCount),
          root: rs.root || null,
        };
        const idx = readiness.repoDetails.findIndex((x) => x.repo === rs.repo);
        if (idx >= 0) readiness.repoDetails[idx] = entry;
        else readiness.repoDetails.push(entry);
      }
      const hint = res?.data?.hint;
      if (hint) readiness.notes.push(hint);
    };

    // Cache key for plan results
    const getPlanCacheKey = (pipeline) => `planCache_audio_${pipeline}`;

    // Load cached plan result
    const loadCachedPlan = async (pipeline) => {
      try {
        const key = getPlanCacheKey(pipeline);
        const cached = await window.electronAPI?.store?.get?.(key, null);
        if (cached && cached.timestamp) {
          // Cache is valid for 24 hours
          const age = Date.now() - cached.timestamp;
          if (age < 24 * 60 * 60 * 1000) {
            return cached.data;
          }
        }
      } catch {}
      return null;
    };

    // Save plan result to cache
    const savePlanToCache = async (pipeline, data) => {
      try {
        const key = getPlanCacheKey(pipeline);
        await window.electronAPI?.store?.set?.(key, {
          timestamp: Date.now(),
          data,
        });
      } catch {}
    };

    const probeCurrentMode = async () => {
      readiness.checking = true;
      readiness.missingRepos = [];
      readiness.repoDetails = [];
      readiness.missingGguf = false;
      readiness.ggufNames = [];
      readiness.notes = [];
      readiness.authRequired = false;
      readiness.authRepos = [];
      setBlocked("audio", false);

      const pipeline = currentPipeline.value;
      readiness.currentMode = mode.value;

      try {
        planReq.controller?.abort();
      } catch {}
      const controller = new AbortController();
      planReq.controller = controller;
      const mySeq = ++planReq.seq;

      try {
        const { data, status } = await axios.post(
          `${API_BASE}/pipelines/plan`,
          { pipeline, deep_validate: true },
          {
            signal: controller.signal,
            validateStatus: () => true,
            timeout: 10000,
          }
        );

        if (mySeq !== planReq.seq) return;

        if (status >= 200 && status < 300) {
          applyPlanToReadiness(data);
          // Cache successful result for offline mode
          await savePlanToCache(pipeline, data);
        } else {
          readiness.ok = false;
          readiness.checking = false;
          readiness.notes = [`Planner returned HTTP ${status}.`];
        }
      } catch (e) {
        const aborted =
          e?.code === "ERR_CANCELED" ||
          e?.name === "CanceledError" ||
          e?.message === "canceled";
        if (!aborted) {
          // Try to use cached plan for offline mode
          const cachedPlan = await loadCachedPlan(pipeline);
          if (cachedPlan && cachedPlan.ok) {
            applyPlanToReadiness(cachedPlan);
            readiness.notes.push("Using cached status (offline mode)");
          } else {
            readiness.ok = false;
            readiness.checking = false;
            readiness.notes = [e?.message || "Network error while planning"];
          }
        }
      } finally {
        if (planReq.controller === controller) planReq.controller = null;
      }
    };

    // ------------ CTA action --------------
    const prefetchForMode = async () => {
      const pipeline = currentPipeline.value;
      try {
        const res = await axios.post(
          `${API_BASE}/pipelines/prefetch`,
          { pipeline, deep_validate: true },
          { validateStatus: () => true }
        );

        if (res.status === 202) {
          const started = Array.isArray(res.data?.pipelines_started)
            ? res.data.pipelines_started
            : [];
          const pid =
            started[started.length - 1] || res.data?.pipeline_id || null;
          const ws =
            res.data?.download_websocket_url ||
            res.data?.websocket_url ||
            WS_DL;
          if (pid) startDownloadTracking(pid, ws);
          return;
        }

        if (res.status >= 200 && res.status < 300) {
          await probeCurrentMode();
          return;
        }

        if (res.status === 403) return apply403ToReadiness(res);
        if (res.status === 409) {
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }

        setError(
          "audio",
          res?.data?.error || `Prefetch failed (${res.status})`
        );
      } catch (e) {
        setError("audio", e?.message || "Network error");
      }
    };

    // ------------ generation socket -------
    // Socket is managed by the shared generationStore

    // ------------ voice clone file handler
    const handleSynthesisFile = async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        synthesisFile.value = null;
        synthesisFileName.value = "";
        synthesisBase64.value = "";
        return;
      }

      synthesisFile.value = file;
      synthesisFileName.value = file.name;

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(",")[1] || result;
        synthesisBase64.value = base64;
      };
      reader.readAsDataURL(file);
    };

    // Voice gender for TTS mode
    const voiceGender = ref("female");

    // ------------ actions -----------------
    const sendMessage = async (prompt, isDemo = false) => {
      if (!prompt) return;
      // Allow demo generation even without access
      if (!isDemo && !canGenerateWithAccess.value) return;

      let payload;

      if (mode.value === "clone" && synthesisBase64.value) {
        // Clone mode: use reference audio with Qwen TTS clone endpoint
        payload = {
          text: prompt,
          ref_audio_base64: synthesisBase64.value,
          ref_text: referenceTranscript.value.trim(),
          language: languages[language.value] || "English",
          auto_download: true,
        };
      } else {
        // TTS mode: use voice design with Qwen TTS design endpoint
        // Build voice instruction based on selected gender and language
        const genderDesc = voiceGender.value === "male" ? "Male" : "Female";
        const langName = languages[language.value] || "English";
        const instruct = `${genderDesc}, clear and natural speaking voice, ${langName} speaker, pleasant tone`;

        payload = {
          text: prompt,
          instruct,
          language: langName,
          auto_download: true,
        };
      }

      const url = `${API_BASE}${endpointForMode()}`;

      ensureGenerationSocket();
      startGeneration("audio"); // Initialize generation state

      const onSuccess = async (response) => {
        // Check for audio_path in response data
        const audioPath = response?.data?.audio_path || response?.data?.path || response?.data?.output_path;
        if (audioPath) {
          // Normalize the data structure
          const normalizedData = {
            ...response.data,
            audio_path: audioPath,
          };

          // Only store serializable data - axios response contains non-serializable properties
          const newInference = {
            question: prompt,
            answer: {
              status: response.status,
              data: normalizedData,
            },
            id: uuid(),
            language: language.value,
            model: "qwen3-tts",
            hasClone: mode.value === "clone",
            voiceGender: voiceGender.value,
          };

          inferences.push(newInference);
          console.log('[GenerativeAudio] Added inference to history:', newInference.id);

          try {
            await window.electronAPI?.store?.set?.(
              "audioInferences",
              [...inferences]
            );
            console.log('[GenerativeAudio] Saved', inferences.length, 'inferences to storage');
          } catch (e) {
            console.error('[GenerativeAudio] Failed to save to storage:', e);
          }
          form.prompt = "";
          // Reset to first page to show the new result
          resetToFirstPage();
        } else {
          console.warn('[GenerativeAudio] No audio path in response:', response?.data);
        }
      };

      await requestWithDownloadTracking(url, payload, onSuccess, isDemo);
    };

    // ------------ request wrapper ---------
    const requestWithDownloadTracking = async (url, payload, onSuccess, isDemo = false) => {
      try {
        isLoading.value = true;
        const headers = isDemo ? { "X-Demo-Mode": "true" } : {};
        const res = await axios.post(url, payload, {
          headers,
          validateStatus: () => true,
        });

        if (res.status === 202) {
          const pid =
            res.data?.pipeline_id ||
            (Array.isArray(res.data?.pipelines_started) &&
              res.data.pipelines_started.slice(-1)[0]) ||
            null;
          const ws =
            res.data?.download_websocket_url ||
            res.data?.websocket_url ||
            WS_DL;
          if (pid) startDownloadTracking(pid, ws);
          // Don't stop generation yet - download tracking will handle it
          return;
        }

        if (res.status >= 200 && res.status < 300) {
          setBlocked("audio", false);
          stopGeneration("audio"); // Stop generation state on success
          await onSuccess(res);
          return;
        }

        if (res.status === 403) {
          stopGeneration("audio");
          return apply403ToReadiness(res);
        }
        if (res.status === 409) {
          stopGeneration("audio");
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }

        stopGeneration("audio");
        setError("audio", res?.data?.error, res.status);
      } catch (err) {
        stopGeneration("audio");
        setError("audio", err?.message || "Network error");
      } finally {
        isLoading.value = false;
      }
    };

    // ------------ utils -------------------
    const { toClipboard } = useClipboard();
    const copy = async (txt) => {
      try {
        await toClipboard(txt);
      } catch {}
    };

    // Convert local path to streaming URL
    const fileUrl = (p) => {
      if (!p) return "";
      if (/^https?:\/\//i.test(p)) return p;
      return `${API_BASE}/media/stream?path=${encodeURIComponent(p)}`;
    };

    const downloadAudio = async (idx) => {
      const path = inferences[idx]?.answer?.data?.audio_path;
      if (!path) return;
      const defaultName =
        path.split("/").pop() || `bonzai-audio-${Date.now()}.wav`;
      const result = await window.electronAPI?.saveAudio?.(defaultName, path);
      if (!result?.success)
        console.error("Save cancelled or failed", result?.error);
    };

    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.length) return;
      inferences.splice(idx, 1);
      hasCopy.splice(idx, 1);
      try {
        await window.electronAPI?.store?.set?.(
          "audioInferences",
          [...inferences]
        );
      } catch {}
    };

    const clearHistory = async () => {
      inferences.length = 0;
      hasCopy.length = 0;
      try {
        await window.electronAPI?.store?.set?.("audioInferences", []);
      } catch (e) {
        console.error("Failed to clear audio inferences:", e);
      }
    };

    const exportHistory = () => {
      if (inferences.length === 0) return;
      const data = JSON.stringify([...inferences], null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-audio-history-${Date.now()}.json`;
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
            inferences.unshift(...data);
            hasCopy.length = inferences.length;
            hasCopy.fill(false);
            await window.electronAPI?.store?.set?.("audioInferences", [
              ...inferences,
            ]);
          }
        } catch (err) {
          console.error("Failed to import history:", err);
        }
      };
      input.click();
    };

    // --------- derived: stable ordered task list
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
        .sort((a, b) => {
          const sa = order[a.status] ?? 99;
          const sb = order[b.status] ?? 99;
          if (sa !== sb) return sa - sb;
          return (b.progress || 0) - (a.progress || 0);
        });
    });

    // ------------ lifecycle ----------------
    onMounted(async () => {
      ensureGenerationSocket();
      await resumeActiveDownloadIfAny();
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "audioInferences",
          []
        );
        console.log('[GenerativeAudio] Loading saved inferences:', saved?.length || 0);
        if (Array.isArray(saved) && saved.length > 0) {
          // Clear existing and add all saved items
          inferences.length = 0;
          saved.forEach((item) => inferences.push(item));
          console.log('[GenerativeAudio] Loaded', inferences.length, 'inferences');
        }
      } catch (e) {
        console.error('[GenerativeAudio] Failed to load saved inferences:', e);
      }
      await probeCurrentMode();
      // Setup scroll observer after DOM is rendered
      setTimeout(setupScrollObserver, 100);
      // Attach scroll listener for scroll-to-top button
      const container = document.querySelector('.models__deployment-install');
      if (container) {
        scrollContainer.value = container;
        container.addEventListener('scroll', handleScroll, { passive: true });
      }
    });

    onBeforeUnmount(() => {
      if (downloadsSocket.value?.connected) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      if (httpPollTimer) {
        clearInterval(httpPollTimer);
        httpPollTimer = null;
      }
      // Cleanup scroll observer
      if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
      }
      // Cleanup scroll listener
      if (scrollContainer.value) {
        scrollContainer.value.removeEventListener('scroll', handleScroll);
      }
      // Note: generation socket is shared and managed by generationStore
    });

    watch(mode, () => probeCurrentMode(), { immediate: true });

    return {
      selectedModel,
      mode,
      language,
      languages,
      languageFlags,
      exaggerationPct,
      form,
      isLoading,
      inferences,
      hasCopy,
      // lazy loading pagination
      paginatedInferences,
      loadMoreSentinel,
      hasMore,
      isLoadingMore,
      // scroll to top
      showScrollTop,
      scrollToTop,
      synthesisFileName,
      synthesisBase64,
      referenceTranscript,
      readiness,
      canGenerate,
      canGenerateWithAccess,
      showUpdateCTA,
      promptPlaceholder,
      generation,
      downloads,
      downloadTaskList,
      downloadMatchesMode,
      promptInput,
      sendMessage,
      copy,
      downloadAudio,
      removeInference,
      clearHistory,
      exportHistory,
      importHistory,
      prefetchForMode,
      cancelCurrentPipeline,
      retryCurrentPipeline,
      probeCurrentMode,
      handleSynthesisFile,
      fileUrl,
      // Voice gender for TTS
      voiceGender,
      // Access control
      accessRef,
      hasAccess,
      onAccessChanged,
      onDemoGenerate,
      canGenerateWithAccess,
      DEMO_PROMPT,
    };
  },
};
</script>

<style scoped>
/* Fonts imported from App.vue for offline mode */

.generation {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1;
  opacity: 0.9;
}
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
  background: url("../assets/bonzai_music.jpg") no-repeat;
  background-size: cover;
  filter: blur(6px);
  animation: move 40s ease infinite;
  overflow: hidden;
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
  text-align: right;
}
p {
  margin-bottom: 1em;
  font-size: 24px;
  color: #fff;
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
}
div.question {
  border: 1px solid rgba(255, 255, 255, 0);
  padding: 2em 2em 5em;
  margin-top: 2em !important;
  margin-bottom: 1em !important;
  font-weight: 700;
  background-color: rgba(255, 255, 255, 0.1);
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  border-radius: 4px;
  backdrop-filter: blur(26px);
  position: relative;
}
.audio-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.audio-player {
  width: 100%;
  height: 48px;
  border-radius: 4px;
}
.audio-meta {
  top: -12px;
  right: 32px;
  position: absolute;
  display: flex;
  align-items: center;
}
.prompt-text {
  font-size: 16px !important;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
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
input[type="radio"] {
  display: none;
}
input[type="radio"] + label {
  padding: 3px 12px 9px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}
input[type="radio"] + label.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}
.select.is-dark select {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  height: 48px;
  color: #fff;
}
.select.is-dark select:hover {
  border-color: rgba(255, 255, 255, 0.5);
}
.file-label {
  width: 100%;
}
.file-cta,
.file-name {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}
.file-name {
  max-width: none;
  flex: 1;
}
.help {
  margin-top: 0.5rem;
}
.slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  cursor: pointer;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
}
.tag.is-dark {
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
}
.tag.is-warning {
  background: rgba(255, 221, 87, 0.8);
  color: #000;
}
.tag.is-clickable {
  cursor: pointer;
  transition: transform 0.1s ease;
}
.tag.is-clickable:hover {
  transform: scale(1.05);
  background: rgba(50, 50, 50, 0.8);
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
ol.chat li {
  position: relative;
}
.notification.is-warning.is-light {
  background: rgba(255, 221, 87, 0.15);
  color: #fff;
}
.label.has-text-white {
  color: #fff !important;
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

/* Background animation */
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
</style>
