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
                    image
                  </span>
                  Generative Image
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
                Generating Media
                <span class="ml-1" v-if="generation.stage">
                  ({{ generation.stage }})
                </span>
              </span>
              <span
                class="fira-sans-condensed-black-italic is-pulled-right is-size-4"
              >
                {{ generationPctRounded }}%
              </span>
            </p>
            <progress
              class="progress is-success"
              :value="generationPctClamped"
              max="100"
            >
              {{ generationPctRounded }}%
            </progress>
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <!-- MODE TOGGLES -->
                <div class="control mb-5 has-text-left">
                  <input
                    v-model="mode"
                    :value="'turbo'"
                    id="mode_turbo"
                    type="radio"
                    name="mode"
                    checked
                  />
                  <label for="mode_turbo" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      bolt
                    </span>
                    Turbo
                  </label>

                  <input
                    v-model="mode"
                    :value="'standard'"
                    id="mode_standard"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_standard" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      photo_camera
                    </span>
                    Standard
                  </label>

                  <input
                    v-model="mode"
                    :value="'advanced'"
                    id="mode_advanced"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_advanced" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      auto_awesome
                    </span>
                    Advanced
                  </label>

                  <input
                    v-model="mode"
                    :value="'quality'"
                    id="mode_quality"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_quality" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      high_quality
                    </span>
                    Quality
                  </label>

                  <input
                    v-model="mode"
                    :value="'turbo_edit'"
                    id="mode_turbo_edit"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_turbo_edit" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      brush
                    </span>
                    Edit
                  </label>

                  <span class="control">
                    <input
                      v-model="quality"
                      :value="'sd'"
                      id="mode_quality_sd"
                      type="radio"
                      name="mode_quality"
                      checked
                    />
                    <label for="mode_quality_sd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        sd
                      </span>
                    </label>

                    <input
                      v-model="quality"
                      :value="'hd'"
                      id="mode_quality_hd"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_hd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        hd
                      </span>
                    </label>

                    <input
                      v-model="quality"
                      :value="'fhd'"
                      id="mode_quality_fhd"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_fhd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        full_hd
                      </span>
                    </label>

                    <input
                      v-model="quality"
                      :value="'2k'"
                      id="mode_quality_2k_bar"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_2k_bar" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        2k
                      </span>
                    </label>

                    <input
                      v-model="quality"
                      :value="'4k'"
                      id="mode_quality_4k_bar"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_4k_bar" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        4k
                      </span>
                    </label>
                  </span>
                </div>

                <!-- READINESS CTA (only for current mode) -->
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
                        <li v-for="gguf in readiness.ggufNames">
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
                      title="(Re)download required files for this mode"
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
                  level="LVL3"
                  :demo-prompt="DEMO_PROMPT"
                  :is-generating="isLoading"
                  @access-changed="onAccessChanged"
                  @demo-generate="onDemoGenerate"
                />

                <!-- IMAGE PICKER (Edit modes only) -->
                <div
                  class="notification p-4 preview mb-5"
                  v-if="isEditMode"
                >
                  <div class="file is-fullwidth is-medium">
                    <label class="file-label">
                      <input
                        class="file-input"
                        type="file"
                        accept="image/*"
                        @change="onImagePicked"
                      />
                      <span class="file-cta">
                        <span class="file-icon">
                          <span class="material-symbols-outlined">image</span>
                        </span>
                        <span class="file-label">Browse image to edit...</span>
                      </span>
                    </label>
                  </div>
                  <div class="mt-4" v-if="imagePreviewUrl">
                    <img
                      :src="imagePreviewUrl"
                      class="preview-image"
                      alt="preview"
                    />
                  </div>
                </div>

                <!-- PROMPT -->
                <form ref="promptForm" @submit.prevent>
                  <input
                    ref="promptInput"
                    class="input is-large is-fullwidth"
                    type="text"
                    :placeholder="
                      isEditMode
                        ? 'Describe how to edit the image...'
                        : 'Describe your image and press enter to generate...'
                    "
                    v-model="form.prompt"
                    @keyup.enter="
                      canGenerateWithAccess &&
                      (!isEditMode || hasInputImage) &&
                      sendMessage(form.prompt)
                    "
                    :disabled="
                      isLoading ||
                      !canGenerateWithAccess ||
                      (isEditMode && !hasInputImage)
                    "
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
                      <h2
                        class="fira-sans-condensed-black-italic is-size-1 has-text-white"
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
                        <span class="material-symbols-outlined mr-2">
                          upload
                        </span>
                        Import
                      </button>
                      <button
                        class="button is-warning is-small ml-4"
                        @click="exportHistory()"
                        :disabled="inferences.length === 0"
                      >
                        <span class="material-symbols-outlined mr-2">
                          download
                        </span>
                        Export
                      </button>
                      <button
                        class="button is-danger is-small ml-4"
                        @click="clearHistory()"
                      >
                        <span class="material-symbols-outlined mr-2">
                          ink_eraser
                        </span>
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
                    :style="{
                      animationDelay: `${Math.min(displayIndex * 50, 500)}ms`,
                    }"
                  >
                    <div class="question">
                      <div
                        class="logo watermark"
                        style="
                          position: absolute;
                          width: 128px;
                          bottom: 7em;
                          right: 2em;
                        "
                      >
                        <img src="src/assets/bonzai_logo-full.png" />
                      </div>
                      <img
                        class="generated__image"
                        :src="
                          'data:image/png;base64,' + inference.answer.data.image
                        "
                      />
                      <hr />
                      <button
                        class="button is-medium is-success copy is-pulled-right ml-5 mr-0 p-0 pl-1 pr-4"
                        @click="downloadImage(inference._originalIndex)"
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
                          setCopied(inference._originalIndex);
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
                      <button
                        class="button is-medium is-warning copy is-pulled-left ml-5 pl-2"
                        @click="loadImageForEdit(inference)"
                        :disabled="!inference?.answer?.data?.image"
                        title="Edit this image with Flux Kontext"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          edit
                        </span>
                        Edit
                      </button>
                      <button
                        class="button is-medium is-warning copy is-pulled-left ml-5 pl-2"
                        @click="animate(inference)"
                        :disabled="!inference?.answer?.data?.image"
                        title="Animate this image"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          animation
                        </span>
                        Animate
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
</template>

<script>
import {
  ref,
  reactive,
  shallowRef,
  computed,
  inject,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { v4 as uuid } from "uuid";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { io } from "socket.io-client";

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

// Debounce function for persistence operations
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// RAF-throttled function for high-frequency events (socket progress)
const rafThrottle = (fn) => {
  let rafId = null;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      fn(...lastArgs);
      rafId = null;
    });
  };
};
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

const DEMO_PROMPT =
  "A majestic bonsai tree on a floating island, sunset lighting, digital art";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;
const WS_GEN = `${API_BASE}/generation`;

export default {
  name: "GenerativeImage",
  components: { AccessRequirements },
  setup() {
    // ------------ injected from App -------
    const goAnimateToVideo = inject("goAnimateToVideo", () => {});

    // Animate an inference image by switching to video tab
    const animate = (inference) => {
      const img = inference?.answer?.data?.image;
      if (!img) return;
      goAnimateToVideo(img);
    };

    // ------------ basic state -------------
    const mode = ref("turbo");
    const quality = ref("sd");
    const isLoading = ref(false);
    const form = reactive({ prompt: "" });
    // Use shallowRef for inferences - base64 images are large and don't need deep reactivity
    const inferences = shallowRef([]);
    const hasCopy = shallowRef([]);

    // ------------ lazy loading pagination ----------------
    const ITEMS_PER_PAGE = 10;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);

    // Reversed inferences (most recent first) with original index
    const reversedInferences = computed(() => {
      return inferences.value
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
      () => displayedCount.value < inferences.value.length
    );

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          inferences.value.length
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

    // Handle scroll to show/hide scroll-to-top button
    const handleScroll = rafThrottle((e) => {
      const scrollTop = e.target?.scrollTop || 0;
      showScrollTop.value = scrollTop > 400;
    });

    // Debounced persistence to avoid excessive writes
    const persistInferences = debounce(async (data) => {
      try {
        await window.electronAPI?.store?.set?.("imageInferences", data);
      } catch {}
    }, 500);

    // ------------ image editing state -----
    const pickedImageName = ref("");
    const uploadedImageBase64 = ref("");
    const imagePreviewUrl = computed(() => {
      if (uploadedImageBase64.value)
        return "data:image/png;base64," + uploadedImageBase64.value;
      return "";
    });
    const hasInputImage = computed(() => !!uploadedImageBase64.value);

    // ------------ refs ---------------------
    const promptInput = ref(null);

    // ------------ access control -----------
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

    const onDemoGenerate = (demoPrompt) => {
      form.prompt = demoPrompt;
      sendMessage(demoPrompt, true); // true = isDemo
    };

    // controller for abortable /plan calls (parity w/ Video view)
    const planReq = reactive({ controller: null, seq: 0 });

    // ------------ readiness ---------------
    const readiness = reactive({
      ok: true,
      missingRepos: [],
      repoDetails: [],
      missingGguf: false,
      ggufName: null,
      notes: [],
      authRequired: false,
      authRepos: [],
      currentMode: null,
    });

    const showUpdateCTA = computed(
      () =>
        readiness.authRequired ||
        generation.blocked ||
        !readiness.ok ||
        readiness.missingRepos.length > 0 ||
        readiness.missingGguf
    );

    const canGenerate = computed(
      () => readiness.ok && !readiness.authRequired && !generation.active
    );

    // Combined check: technical readiness AND access rights
    const canGenerateWithAccess = computed(
      () => canGenerate.value && hasAccess.value
    );

    // ------------ generation --------------
    // Use shared generation store for persistent state across view navigation
    const generation = computed(() => generationStore.state.image);

    // Computed properties for progress display (avoid repeated Math.round in template)
    const generationPctRounded = computed(() =>
      Math.round(generation.value.pct)
    );
    const generationPctClamped = computed(() =>
      Math.max(0, Math.min(100, generation.value.pct))
    );

    // ------------ pipeline/endpoint maps --
    const endpointForMode = () => {
      const m = mode.value;
      if (m === "turbo_edit") return "/image/image/turbo";
      return `/image/${m}`;
    };
    const pipelineForMode = (m) => {
      if (m === "turbo_edit") return "flux_klein";
      if (m === "quality") return "flux_krea";
      if (m === "advanced") return "z_image_turbo";
      if (m === "standard") return "sdxl";
      if (m === "turbo") return "flux_klein";
      return "flux_klein"; // default
    };
    const currentPipeline = computed(() => pipelineForMode(mode.value));

    // Check if current mode requires image input (edit modes)
    const isEditMode = computed(() => mode.value === "turbo_edit");

    // ------------ downloads state/socket --
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0, // visual bar (kept in sync with total_progress)
      total_progress: 0, // authoritative % (server or tasks-computed)
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

    // ---- helpers to merge and compute byte-weighted progress (parity w/ Video)
    const mergeTask = (dst, src) => {
      if (!dst) return { ...src };
      const out = { ...dst, ...src };
      if (
        typeof dst.progress === "number" &&
        typeof src.progress === "number"
      ) {
        out.progress = Math.max(dst.progress || 0, src.progress || 0);
      }
      if (
        typeof dst.downloaded_size === "number" &&
        typeof src.downloaded_size === "number"
      ) {
        out.downloaded_size = Math.max(
          dst.downloaded_size || 0,
          src.downloaded_size || 0
        );
      }
      if (
        typeof dst.total_size === "number" &&
        typeof src.total_size === "number"
      ) {
        out.total_size = Math.max(dst.total_size || 0, src.total_size || 0);
      }
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

      // Don't show 100% until every task is finished (prevents the "100% while tasks pending" bug)
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

      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status
      );
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
        if (downloads.pipelineId) {
          downloadsSocket.value.emit("subscribe", {
            pipeline_id: downloads.pipelineId,
          });
        }
      });

      // Throttle download_progress events with RAF to avoid excessive re-renders
      const throttledProgressHandler = rafThrottle(({ pipeline }) => {
        lastDlEventAt.value = Date.now();
        if (!pipeline) return;
        applyPipelineUpdate(pipeline);
      });
      downloadsSocket.value.on("download_progress", throttledProgressHandler);

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
        if (status === 202 && data?.pipeline_id) {
          startDownloadTracking(
            data.pipeline_id,
            data.websocket_url || downloads.wsUrl || WS_DL
          );
        }
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
      // Check for missing GGUFs from gguf_status (legacy) or required_files (new)
      const ggufs = Array.isArray(data?.gguf_status) ? data.gguf_status : [];
      const requiredFiles = Array.isArray(data?.required_files) ? data.required_files : [];
      const missG = ggufs.filter((g) => g && g.configured && !g.exists);
      const missReq = requiredFiles.filter((f) => f && !f.ok && !f.exists);
      const allMissing = [...missG, ...missReq];
      readiness.missingGguf = allMissing.length > 0;
      readiness.ggufNames = allMissing.map((g) =>
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
      setBlocked("image", true);
    };

    const apply409ToReadiness = (res) => {
      readiness.ok = false;
      setBlocked("image", true);
      const rs = res?.data?.repo_status;
      if (rs?.repo) {
        const missingCount = Array.isArray(rs?.missing)
          ? rs.missing.length
          : typeof rs?.missing === "number"
            ? rs.missing
            : 1;
        const exists = typeof rs?.exists === "boolean" ? rs.exists : true;
        const entry = {
          repo: rs.repo,
          missing: Math.max(1, missingCount),
          root: rs.root || null,
        };
        const idx = readiness.repoDetails.findIndex((x) => x.repo === rs.repo);
        if (idx >= 0) readiness.repoDetails[idx] = entry;
        else readiness.repoDetails.push(entry);
        if (!exists)
          readiness.notes.push(`${rs.repo}: repository not found locally`);
      }
      const hint = res?.data?.hint;
      if (hint) readiness.notes.push(hint);
    };

    // Cache key for plan results
    const getPlanCacheKey = (pipeline) => `planCache_image_${pipeline}`;

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
      readiness.ok = true;
      readiness.missingRepos = [];
      readiness.repoDetails = [];
      readiness.missingGguf = false;
      readiness.ggufName = null;
      readiness.notes = [];
      readiness.authRequired = false;
      readiness.authRepos = [];
      setBlocked("image", false);

      const pipeline = currentPipeline.value;
      readiness.currentMode = mode.value;

      // cancel a previous /plan in-flight (match Video view)
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

        if (mySeq !== planReq.seq) return; // stale response

        if (status >= 200 && status < 300) {
          applyPlanToReadiness(data);
          // Cache successful result for offline mode
          await savePlanToCache(pipeline, data);
        } else {
          readiness.ok = false;
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
          "image",
          res?.data?.error || `Prefetch failed (${res.status})`
        );
      } catch (e) {
        setError("image", e?.message || "Network error");
      }
    };

    // ------------ generation socket -------
    // Socket is managed by the shared generationStore

    // ------------ actions -----------------
    const sendMessage = async (prompt, isDemo = false) => {
      if (!prompt) return;
      // Allow demo generation even without access
      if (!isDemo && !canGenerateWithAccess.value) return;

      // Edit modes require an input image
      if (isEditMode.value && !uploadedImageBase64.value) return;

      const payload = { prompt, auto_download: true, mode: mode.value };
      const sizes = {
        default: [1024, 1024],
        sd: [512, 768],
        hd: [720, 1280],
        fhd: [1024, 1920],
        "2k": [1440, 2560],
        "4k": [2160, 4096],
      };
      const [h, w] = sizes[quality.value] || sizes.default;
      payload.height = h;
      payload.width = w;

      if (isEditMode.value) {
        // Flux Klein I2I - optimized for speed
        payload.image_base64 = uploadedImageBase64.value;
        payload.guidance_scale = 1.0;
        payload.steps = 4;
      } else if (mode.value === "standard") {
        // SDXL standard mode
        payload.lora = "cyberrealistic-xl-v6.safetensors";
      } else if (mode.value === "turbo") {
        // Flux Klein turbo mode - optimized for speed
        payload.steps = 4;
      }
      payload.pipeline = currentPipeline.value;

      // Build endpoint URL
      const url = `${API_BASE}${endpointForMode()}`;

      ensureGenerationSocket();
      startGeneration("image"); // Initialize generation state

      const onSuccess = async (response) => {
        if (response?.data?.image) {
          // Only store serializable data - axios response object contains non-serializable
          // properties (config.transformRequest, request object) that break persistence
          const newInference = {
            question: prompt,
            answer: {
              status: response.status,
              data: response.data,
            },
            id: uuid(),
          };
          // Update shallowRef by replacing array (triggers reactivity)
          inferences.value = [...inferences.value, newInference];
          hasCopy.value = [...hasCopy.value, false];
          // Debounced persistence
          persistInferences([...inferences.value]);
          form.prompt = "";
          // Reset to first page to show the new result
          resetToFirstPage();
        } else {
          console.warn("[GenerativeImage] No image in response:", response?.data);
        }
      };

      await requestWithDownloadTracking(url, payload, onSuccess);
    };

    // ------------ request wrapper ---------
    const requestWithDownloadTracking = async (url, payload, onSuccess) => {
      try {
        isLoading.value = true;
        const res = await axios.post(url, payload, {
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
          return;
        }

        if (res.status >= 200 && res.status < 300) {
          setBlocked("image", false);
          stopGeneration("image"); // Release generation lock on success
          await onSuccess(res);
          return;
        }

        if (res.status === 403) return apply403ToReadiness(res);
        if (res.status === 409) {
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }

        setError("image", res?.data?.error, res.status);
      } catch (err) {
        setError("image", err?.message || "Network error");
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

    // Set copy state for an index (works with shallowRef)
    const setCopied = (index) => {
      const newHasCopy = [...hasCopy.value];
      newHasCopy[index] = true;
      hasCopy.value = newHasCopy;
      // Auto-reset after 2 seconds
      setTimeout(() => {
        const reset = [...hasCopy.value];
        reset[index] = false;
        hasCopy.value = reset;
      }, 2000);
    };

    // ------------ image picker (edit mode) --
    const fileToBase64 = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

    const onImagePicked = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      pickedImageName.value = file.name;
      const b64 = await fileToBase64(file);
      uploadedImageBase64.value = String(b64).replace(
        /^data:image\/[a-zA-Z+]+;base64,/,
        ""
      );
    };

    // Load an existing inference image into edit mode
    const loadImageForEdit = (inference) => {
      const img = inference?.answer?.data?.image;
      if (!img) return;
      // Switch to edit mode
      mode.value = "turbo_edit";
      // Set the image (already base64 without prefix)
      uploadedImageBase64.value = img;
      pickedImageName.value = "Generated image";
      // Scroll to top and focus prompt input
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Focus after scroll completes and Vue updates the DOM
      setTimeout(() => {
        promptInput.value?.focus();
      }, 300);
    };

    const downloadImage = async (idx) => {
      const img = inferences.value[idx]?.answer?.data?.image;
      if (!img) {
        console.error("No image found at index", idx);
        return;
      }
      const defaultName = `bonzai-${Date.now()}.png`;
      const result = await window.electronAPI?.saveImage?.(defaultName, img);
      if (!result?.success)
        console.error("Save cancelled or failed", result?.error);
    };
    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.value.length) return;
      // Update shallowRef by replacing arrays
      inferences.value = inferences.value.filter((_, i) => i !== idx);
      hasCopy.value = hasCopy.value.filter((_, i) => i !== idx);
      // Debounced persistence
      persistInferences([...inferences.value]);
    };

    const clearHistory = async () => {
      inferences.value = [];
      hasCopy.value = [];
      try {
        await window.electronAPI?.store?.set?.("imageInferences", []);
      } catch (e) {
        console.error("Failed to clear image inferences:", e);
      }
    };

    const exportHistory = () => {
      if (inferences.value.length === 0) return;
      const data = JSON.stringify(inferences.value, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-image-history-${Date.now()}.json`;
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
            inferences.value = [...data, ...inferences.value];
            hasCopy.value = new Array(inferences.value.length).fill(false);
            await persistInferences([...inferences.value]);
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
          "imageInferences",
          []
        );
        if (Array.isArray(saved)) {
          // Load into shallowRef by replacing the array
          inferences.value = saved;
          hasCopy.value = new Array(saved.length).fill(false);
        }
      } catch {}
      await probeCurrentMode();
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
        scrollContainer.value.removeEventListener("scroll", handleScroll);
      }
      // Note: generation socket is shared and managed by generationStore
    });
    watch(
      mode,
      () => {
        probeCurrentMode();
      },
      { immediate: true }
    );

    return {
      // state
      mode,
      isEditMode,
      quality,
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
      // image editing
      pickedImageName,
      uploadedImageBase64,
      imagePreviewUrl,
      hasInputImage,
      onImagePicked,
      loadImageForEdit,
      promptInput,
      // readiness
      readiness,
      canGenerate,
      canGenerateWithAccess,
      showUpdateCTA,
      // generation
      generation,
      generationPctRounded,
      generationPctClamped,
      // downloads
      downloads,
      downloadTaskList,
      downloadMatchesMode,
      // access control
      accessRef,
      hasAccess,
      onAccessChanged,
      onDemoGenerate,
      DEMO_PROMPT,
      // actions
      sendMessage,
      copy,
      setCopied,
      downloadImage,
      removeInference,
      clearHistory,
      exportHistory,
      importHistory,
      prefetchForMode,
      cancelCurrentPipeline,
      retryCurrentPipeline,
      probeCurrentMode,
      animate,
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
  background: url("../assets/bonzai_image.jpg") no-repeat;
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

.generated__image {
  width: 100% !important;
  height: auto !important;
  max-height: 60vh;
  object-fit: contain;
  border: 8px solid rgba(255, 255, 255, 1);
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
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transform: translate3d(0, 0, 0);
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
}

div.question .generated__image {
  /* box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66); */
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
  transform: translate3d(0, 0, 0);
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
.is-loading {
  text-shadow: none !important;
}
input[type="radio"] {
  display: none;
}
input[type="radio"] + label {
  padding: 3px 12px 9px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}
input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}
label.radio.quality {
  margin: 0 3px;
  padding: 3px 6px 0;
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
.retry {
  position: absolute;
  top: -5em;
  right: 2.75em;
  opacity: 0.5;
}
.retry:hover,
.cancel:hover {
  box-shadow: none;
  opacity: 1;
}
.cancel {
  position: absolute;
  top: -5em;
  right: -2em;
  opacity: 0.5;
}
.notification.preview {
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
}
.preview-image {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
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
