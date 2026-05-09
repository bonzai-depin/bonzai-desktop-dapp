<template>
  <div class="background"></div>
  <div class="bz-tab-shell">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12">
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

          <!-- GENERATION PROGRESS — Milestone 4 motion language.
               Replaces the Bulma `is-loading` spinner + green progress
               bar with the BonzAI pulse: brand-purple sweep over the
               determinate fill, mono percent, .bz-shout caption. -->
          <div v-if="generation.active" class="bz-genprogress">
            <div class="bz-genprogress__row">
              <span class="bz-shout bz-genprogress__label">Crafting…</span>
              <span class="bz-mono bz-genprogress__pct">
                {{ generationPctRounded }}%
              </span>
            </div>
            <BonzaiPulse variant="bar" :percent="generationPctClamped" />
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
                  @access-changed="onAccessChanged"
                />

                <!-- IMAGE PICKER (Edit modes only) -->
                <div class="notification p-4 preview mb-5" v-if="isEditMode">
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

                <!-- PROMPT — Milestone 6 unified input. Replaces the
                     bulma is-large + is-loading scaffold with the
                     shared <GenerativeInput> shape used across the
                     image / video / audio tabs. -->
                <GenerativeInput
                  v-model="form.prompt"
                  :placeholder="
                    isEditMode
                      ? 'Describe how to edit the image…'
                      : 'Describe your image…'
                  "
                  submit-label="Generate"
                  running-label="Crafting"
                  :running="isLoading"
                  :disabled="
                    !canGenerateWithAccess ||
                    (isEditMode && !hasInputImage)
                  "
                  shortcut-hint="⌘⏎"
                  @submit="sendMessage(form.prompt)"
                />

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
                        @click="openInspector(inference)"
                        style="cursor: zoom-in"
                        title="Open inspector"
                      />
                      <!-- Origin pill — Milestone 6 unified vocabulary -->
                      <div class="bz-img-meta" v-if="inference.networkMode && inference.networkMode !== 'local'">
                        <span class="bz-origin-pill" :class="`bz-origin-pill--${inference.networkMode}`">
                          <span class="bz-origin-pill__dot"></span>
                          {{ inference.networkMode === 'private' ? 'Private' : 'Remote' }}
                        </span>
                      </div>

                      <!-- Unified action cluster — replaces 6 inline
                           Bulma buttons with the canonical
                           <GenerativeActions> component. -->
                      <GenerativeActions
                        :actions="actionsFor(inference)"
                        @action="(id) => handleAction(id, inference)"
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
import { useInferenceRouter } from "../composables/useInferenceRouter.js";

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
import MintModal from "./MintModal.vue";
import BonzaiPulse from "./BonzaiPulse.vue";
import GenerativeActions from "./generative/GenerativeActions.vue";
import GenerativeInput from "./generative/GenerativeInput.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { addImageInference } from "../stores/inferenceStore.js";
import { inspector } from "../services/generationInspector.service.js";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;
const WS_GEN = `${API_BASE}/generation`;

export default {
  name: "GenerativeImage",
  components: { AccessRequirements, MintModal, BonzaiPulse, GenerativeActions, GenerativeInput },
  setup() {
    const { inferenceRequest } = useInferenceRouter();

    // ------------ injected from App -------
    const goAnimateToVideo = inject("goAnimateToVideo", () => {});

    // Animate an inference image by switching to video tab
    const animate = (inference) => {
      const img = inference?.answer?.data?.image;
      if (!img) return;
      goAnimateToVideo(img);
    };

    // ------------ NFT Minting ---------
    const mintTarget = ref(null);

    const openMint = (inference) => {
      mintTarget.value = {
        inferenceType: "image",
        inferenceId: inference.id,
        content: inference.answer?.data?.image,
        contentType: "image/webp",
        prompt: inference.question,
        generation: {
          type: "text-to-image",
          model: inference.model || inference.pipeline || mode.value,
          timestamp: inference.timestamp,
          elapsedMs: inference.elapsedMs || null,
        },
      };
    };

    const onMinted = (result) => {
      // Trigger re-render for shallowRef
      const arr = [...inferences.value];
      const inf = arr.find(
        (i) =>
          i.id === result.inferenceId || i.id === mintTarget.value?.inferenceId,
      );
      if (inf) inf.nft = result;
      inferences.value = arr;
      mintTarget.value = null;
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

    // Normalize inference to handle both component format and unified store format
    // Component format: { question, answer: { data: { image } } }
    // Get image data from any format
    const getImageData = (item) => {
      // Component format: answer.data.image
      if (item.answer?.data?.image) return item.answer.data.image;
      // Unified store format: imageData
      if (item.imageData) return item.imageData;
      // Direct image property
      if (item.image) return item.image;
      // Base64 data property
      if (item.data?.image) return item.data.image;
      return null;
    };

    // Normalize inference to component format
    const normalizeInference = (item) => {
      const imageData = getImageData(item);
      if (!imageData) return null;

      // Already in component format with valid data
      if (item.answer?.data?.image) {
        return item;
      }

      // Convert any other format to component format
      return {
        ...item,
        question: item.prompt || item.question || "",
        answer: {
          status: item.answer?.status || 200,
          data: {
            image: imageData,
            ...(item.answer?.data || {}),
          },
        },
      };
    };

    // Reversed inferences (most recent first) with original index
    // Single-pass: normalize, filter, and collect in reverse order
    const reversedInferences = computed(() => {
      const items = inferences.value;
      const result = [];
      // Iterate backwards to build reversed order in one pass
      for (let i = items.length - 1; i >= 0; i--) {
        const norm = normalizeInference(items[i]);
        if (norm && norm.answer?.data?.image) {
          norm._originalIndex = i;
          result.push(norm);
        }
      }
      return result;
    });

    // Displayed inferences (lazy loaded subset)
    const paginatedInferences = computed(() => {
      return reversedInferences.value.slice(0, displayedCount.value);
    });

    // Check if there are more items to load
    const hasMore = computed(
      () => displayedCount.value < inferences.value.length,
    );

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          inferences.value.length,
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

    // Handle scroll to show/hide scroll-to-top button
    const handleScroll = rafThrottle((e) => {
      const scrollTop = e.target?.scrollTop || 0;
      showScrollTop.value = scrollTop > 400;
    });

    // Debounced persistence to avoid excessive writes
    const persistInferences = debounce(async (data) => {
      try {
        // Use JSON.parse/stringify to ensure proper serialization
        await window.electronAPI?.store?.set?.(
          "imageInferences",
          JSON.parse(JSON.stringify(data)),
        );
      } catch (e) {
        console.error("[GenerativeImage] Failed to persist inferences:", e);
      }
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

    // controller for abortable /plan calls (parity w/ Video view)
    const planReq = reactive({ controller: null, seq: 0 });

    // ------------ readiness ---------------
    const readiness = reactive({
      ok: true,
      checking: true, // Indicates initial check is in progress
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
        !readiness.checking &&
        (readiness.authRequired ||
          generation.blocked ||
          !readiness.ok ||
          readiness.missingRepos.length > 0 ||
          readiness.missingGguf),
    );

    const canGenerate = computed(
      () => readiness.ok && !readiness.authRequired && !generation.active,
    );

    // Combined check: technical readiness AND access rights
    const canGenerateWithAccess = computed(
      () => canGenerate.value && hasAccess.value,
    );

    // ------------ generation --------------
    // Use shared generation store for persistent state across view navigation
    const generation = computed(() => generationStore.state.image);

    // Computed properties for progress display (avoid repeated Math.round in template)
    const generationPctRounded = computed(() =>
      Math.round(generation.value.pct),
    );
    const generationPctClamped = computed(() =>
      Math.max(0, Math.min(100, generation.value.pct)),
    );

    // ------------ pipeline/endpoint maps --
    const endpointForMode = () => {
      const m = mode.value;
      if (m === "turbo_edit") return "/image/image/turbo";
      return `/image/${m}`;
    };
    const pipelineForMode = (m) => {
      if (m === "turbo_edit") return "image_turbo";
      if (m === "quality" || m === "advanced") return "image_quality";
      if (m === "standard") return "image_standard";
      if (m === "turbo") return "image_turbo";
      return "image_turbo"; // default
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
          src.downloaded_size || 0,
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
        ["downloading", "pending"].includes(t.status),
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
          "[Downloads] All tasks completed, forcing status to completed",
        );
        downloads.status = "completed";
      }

      const wasActive = downloads.active;
      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status,
      );

      // Immediately refresh readiness when download completes
      if (wasActive && !downloads.active && downloads.status === "completed") {
        console.log("[Downloads] Download completed, refreshing readiness");
        probeCurrentMode();
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
        console.warn("[downloads] connect_error", e?.message || e),
      );
      downloadsSocket.value.on("error", (e) =>
        console.warn("[downloads] error", e),
      );
    };

    const kickHttpPollIfStale = (pipelineId) => {
      if (httpPollTimer) clearInterval(httpPollTimer);
      httpPollTimer = setInterval(async () => {
        const idleMs = Date.now() - lastDlEventAt.value;
        if (idleMs < 1500) return;
        try {
          const { data } = await axios.get(
            `${API_BASE}/downloads/status/${pipelineId}`,
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

    // Pipeline names relevant to this view
    const IMAGE_PIPELINES = [
      "image_standard",
      "sdxl",
      "sdxl_intermediate",
      "image_turbo",
      "flux_klein",
      "image_quality",
      "z_image_turbo",
    ];

    const isRelevantPipeline = (pipelineName) => {
      return IMAGE_PIPELINES.some(
        (p) => pipelineName === p || pipelineName?.startsWith(p),
      );
    };

    const resumeActiveDownloadIfAny = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/downloads/list`);
        const active = (data?.pipelines || []).filter(
          (p) =>
            ["pending", "downloading", "retrying", "waiting_retry"].includes(
              p.status,
            ) && isRelevantPipeline(p.pipeline_name),
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
          { validateStatus: () => true },
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
          { validateStatus: () => true },
        );
        if (status === 202 && data?.pipeline_id) {
          startDownloadTracking(
            data.pipeline_id,
            data.websocket_url || downloads.wsUrl || WS_DL,
          );
        }
      } catch {}
    };

    // ------------ readiness helpers -------
    const applyPlanToReadiness = (data) => {
      const repos = Array.isArray(data?.repos) ? data.repos : [];
      const incomplete = repos.filter(
        (r) =>
          r &&
          (r.ok === false || (Number.isFinite(r.missing) && r.missing > 0)),
      );
      readiness.missingRepos = [
        ...new Set(incomplete.map((r) => r.repo).filter(Boolean)),
      ];
      readiness.repoDetails = incomplete.map((r) => ({
        repo: r.repo,
        missing: Number.isFinite(r.missing) ? r.missing : null,
        root: r.root || null,
      }));
      const requiredFiles = Array.isArray(data?.required_files)
        ? data.required_files
        : [];
      const allMissing = requiredFiles.filter((f) => f && !f.ok && !f.exists);
      readiness.missingGguf = allMissing.length > 0;
      readiness.ggufNames = allMissing.map((g) =>
        (g.path || g.name || "").split("/").pop(),
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
      setBlocked("image", true);
    };

    const apply409ToReadiness = (res) => {
      readiness.ok = false;
      readiness.checking = false;
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
      readiness.checking = true;
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
          },
        );

        if (mySeq !== planReq.seq) return; // stale response

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
          { validateStatus: () => true },
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
          res?.data?.error || `Prefetch failed (${res.status})`,
        );
      } catch (e) {
        setError("image", e?.message || "Network error");
      }
    };

    // ------------ generation socket -------
    // Socket is managed by the shared generationStore

    // ------------ actions -----------------
    let _lastRoutingMode = 'local';

    const sendMessage = async (prompt) => {
      if (!prompt) return;
      if (!canGenerateWithAccess.value) return;
      _lastRoutingMode = 'local';

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
        payload.lora = "sdxl-lora.safetensors";
      } else if (mode.value === "turbo") {
        // Flux Klein turbo mode - optimized for speed
        payload.steps = 4;
      }
      payload.pipeline = currentPipeline.value;

      // Build endpoint URL
      const url = `${API_BASE}${endpointForMode()}`;

      // Free GPU memory: unload local LLM + clear cached Flask models
      try {
        await window.electronAPI?.unloadModel?.();
        await fetch(`${API_BASE}/memory/clear`, { method: "POST" });
      } catch (e) {
        console.warn("[GenerativeImage] Memory clear:", e.message);
      }

      ensureGenerationSocket();
      startGeneration("image"); // Initialize generation state
      const _genStart = Date.now();

      const onSuccess = async (response) => {
        if (response?.data?.image) {
          const elapsedMs = Date.now() - _genStart;
          // Only store serializable data - axios response object contains non-serializable
          // properties (config.transformRequest, request object) that break persistence
          const pipelineName = currentPipeline.value;
          const modelName =
            pipelineName === "image_turbo"
              ? "flux-klein"
              : pipelineName === "image_quality"
                ? "z-image-turbo"
                : pipelineName === "image_standard"
                  ? "sdxl"
                  : pipelineName;
          const newInference = {
            question: prompt,
            answer: {
              status: response.status,
              data: response.data,
            },
            id: uuid(),
            model: modelName,
            pipeline: pipelineName,
            elapsedMs,
            networkMode: _lastRoutingMode,
          };
          // Update shallowRef by replacing array (triggers reactivity)
          inferences.value = [...inferences.value, newInference];
          hasCopy.value = [...hasCopy.value, false];
          // Debounced persistence
          persistInferences([...inferences.value]);

          // Save to unified inference store with performance metadata
          addImageInference(prompt, response.data.image, {
            pipeline: pipelineName,
            width: form.width,
            height: form.height,
            steps: form.steps,
            elapsed: elapsedMs / 1000,
            source: 'bonzai',
            networkMode: _lastRoutingMode,
          });

          form.prompt = "";
          // Reset to first page to show the new result
          resetToFirstPage();
        } else {
          console.warn(
            "[GenerativeImage] No image in response:",
            response?.data,
          );
        }
      };

      await requestWithDownloadTracking(url, payload, onSuccess);
    };

    // ------------ request wrapper ---------
    const requestWithDownloadTracking = async (
      url,
      payload,
      onSuccess,
    ) => {
      try {
        isLoading.value = true;

        // Route through unified inference handler (handles local/consumer/provider)
        if (payload.pipeline) {
          const routed = await inferenceRequest(payload.pipeline, payload);
          if (routed?.ok && routed.remote && routed.result) {
            _lastRoutingMode = routed.pipeline ? 'private' : 'remote';
            setBlocked("image", false);
            stopGeneration("image");
            await onSuccess({ status: 200, data: routed.result });
            return;
          }
          // If local or failed, fall through to direct Flask call (supports download tracking)
        }

        const headers = {};
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
        "",
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
          [],
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
      { immediate: true },
    );

    // Open the global generation inspector for a clicked output.
    // Maps the local inference shape onto the inspector's forgiving
    // schema; only the fields we have populate. Image is base64 today
    // so we wrap it as a data URL for the inspector's <img>.
    const openInspector = (inference) => {
      if (!inference) return;
      const data = inference.answer?.data || {};
      const mediaUrl = data.image
        ? "data:image/png;base64," + data.image
        : null;
      inspector.show({
        kind: "image",
        mediaUrl,
        prompt: inference.question || data.prompt,
        negativePrompt: data.negative_prompt,
        model: inference.model || (mode.value ? `Z-Image (${mode.value})` : null),
        modelId: inference.modelId || (mode.value ? `image_${mode.value}` : null),
        seed: data.seed,
        steps: data.steps,
        guidanceScale: data.guidance_scale,
        width: data.width || form.width,
        height: data.height || form.height,
        networkMode: inference.networkMode || "local",
        peerId: inference.peerId,
        ts: inference.timestamp || inference.ts,
      });
    };

    // Unified action descriptors fed into <GenerativeActions>. Each
    // entry maps an action id → its visual + the handler that runs.
    // The variant gates which colour the button picks up; primary is
    // reserved for "do the thing" CTAs (download), success for
    // confirmed states (mint already done), warning for transformative
    // follow-ups (edit / animate), destructive for delete.
    const actionsFor = (inference) => {
      const hasImage = !!inference?.answer?.data?.image;
      const minted = !!inference?.nft;
      return [
        { id: "download", icon: "save",          label: "Download",  variant: "primary",     disabled: !hasImage },
        { id: "copy",     icon: hasCopy[inference._originalIndex] ? "check" : "content_copy",
          label: hasCopy[inference._originalIndex] ? "Copied" : "Reuse",
          title: "Reuse this prompt", variant: "default" },
        { id: "mint",     icon: minted ? "check_circle" : "token",
          label: minted ? "Minted" : "Mint",
          variant: minted ? "success" : "default", disabled: minted },
        { id: "edit",     icon: "edit",       label: "Edit",      variant: "warning",  disabled: !hasImage,
          title: "Edit this image with Flux Kontext" },
        { id: "animate",  icon: "animation",  label: "Animate",   variant: "warning",  disabled: !hasImage,
          title: "Animate this image" },
        { id: "delete",   icon: "delete",     label: "Delete",    variant: "destructive",
          title: "Remove this result" },
      ];
    };

    const handleAction = (id, inference) => {
      switch (id) {
        case "download":
          downloadImage(inference._originalIndex);
          break;
        case "copy":
          form.prompt = inference.question;
          copy(inference.question);
          setCopied(inference._originalIndex);
          scrollToTop();
          break;
        case "mint":
          openMint(inference);
          break;
        case "edit":
          loadImageForEdit(inference);
          break;
        case "animate":
          animate(inference);
          break;
        case "delete":
          removeInference(inference._originalIndex);
          break;
      }
    };

    return {
      // state
      mode,
      isEditMode,
      quality,
      form,
      isLoading,
      inferences,
      hasCopy,
      // inspector
      openInspector,
      // unified action cluster
      actionsFor,
      handleAction,
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
      canGenerateWithAccess,
      onAccessChanged,
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
      // Network modal
      requestOpenNetworkModal,
      // NFT Minting
      mintTarget,
      openMint,
      onMinted,
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
  background: url("../assets/bonzai_image.webp") no-repeat;
  background-size: cover;  overflow: hidden;
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
  background: var(--bz-scrim-strong);
}

.models__activity--payouts {
  padding: 4em;
  border: 1px solid var(--bz-border);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}

.models__activity--payouts h2 {
  font-size: 48px;
  color: var(--bz-fg);
  text-align: right;
}

.generated__image {
  width: 100%;
  height: auto;
  max-height: var(--bz-content-max-h);
  object-fit: contain;
  border-radius: var(--bz-content-radius);
  display: block;
}
h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: var(--bz-fg);
  text-align: right;
}
p {
  margin-bottom: 1em;
  font-size: 24px;
  color: var(--bz-fg);
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transform: translate3d(0, 0, 0);
}
div.question {
  position: relative;
  padding: var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}

div.question .generated__image {
  /* box-shadow: 8px 8px 0 var(--bz-purple-glow); */
}
form {
  position: relative;
}
hr {
  margin: 12px 0;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 1),
    transparent
  );
}
.input {
  color: var(--bz-fg);
  background: var(--bz-border);
  box-shadow: 8px 8px 0 var(--bz-purple-glow);
  transition: 200ms ease-in;
  transform: translate3d(0, 0, 0);
}
::placeholder {
  color: var(--bz-border) !important;
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
  color: var(--bz-fg-faint) !important;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
}
input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: var(--bz-purple-soft) !important;
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
  box-shadow: 8px 8px 0 var(--bz-purple-glow);
}
.preview-image {
  width: 100%;
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
}

/* ── Cinematic content-first treatment — Phase 3 (Runway-style) ──
   Hero image is full-bleed edge-to-edge with metadata overlay.
   History items are a dense 2-column grid with minimal chrome.
   The content IS the design; the interface retreats. */

.history-item {
  animation: bz-fade-rise 600ms var(--bz-ease-out) forwards;
  opacity: 0;
}

ol.chat {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bz-space-5);
  list-style: none;
  padding: 0;
  margin: var(--bz-space-5) 0;
}

/* ── HERO — first item is cinematic full-bleed ───────────────── */
ol.chat .history-item:first-child {
  grid-column: 1 / -1;
}
ol.chat .history-item:first-child .question {
  background: transparent;
  border: none;
  padding: 0;
  border-radius: 0;
}
ol.chat .history-item:first-child .generated__image {
  max-height: 85vh;
  width: 100%;
  max-width: 100%;
  border-radius: var(--bz-r-sm);
}
/* Hide watermark on hero — the image speaks for itself */
ol.chat .history-item:first-child .watermark {
  display: none;
}
/* Subtle bottom scrim so overlay controls read on any image */
ol.chat .history-item:first-child .question::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 120px;
  background: var(--bz-content-scrim);
  pointer-events: none;
  border-radius: 0 0 var(--bz-r-sm) var(--bz-r-sm);
}
/* Overlay metadata at the bottom of the hero image */
ol.chat .history-item:first-child .bz-img-meta {
  position: absolute;
  bottom: var(--bz-space-4);
  left: var(--bz-space-4);
  z-index: 1;
  margin: 0;
}
ol.chat .history-item:first-child .bz-gen-actions {
  position: absolute;
  bottom: var(--bz-space-4);
  right: var(--bz-space-4);
  z-index: 1;
}
/* Dark-backed pills + action buttons for readability over images */
ol.chat .history-item:first-child .bz-origin-pill {
  background: rgba(0, 0, 0, 0.65);
  border-color: transparent;
  color: var(--bz-fg);
  backdrop-filter: blur(4px);
}
ol.chat .history-item:first-child .bz-gen-actions {
  background: rgba(0, 0, 0, 0.55);
  padding: var(--bz-space-2);
  border-radius: var(--bz-r-sm);
  backdrop-filter: blur(4px);
  gap: var(--bz-space-2);
}
ol.chat .history-item:first-child .bz-gen-actions .bz-gen-action {
  border-color: rgba(255, 255, 255, 0.18);
  color: var(--bz-fg);
}
ol.chat .history-item:first-child .bz-gen-actions .bz-gen-action:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.35);
}

/* ── HISTORY GRID ───────────────────────────────────────────── */
@media (min-width: 880px) {
  ol.chat {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  ol.chat .history-item:first-child {
    grid-column: 1 / -1;
  }
}

ol.chat .history-item:not(:first-child) {
  width: 100%;
}
ol.chat .history-item:not(:first-child) .question {
  padding: var(--bz-space-3);
}
ol.chat .history-item:not(:first-child) .generated__image {
  width: 100%;
  max-width: 100%;
  display: block;
  border-radius: var(--bz-r-sm);
}
ol.chat .history-item:not(:first-child) hr {
  border: 0;
  border-top: 1px solid var(--bz-border);
  margin: var(--bz-space-4) 0;
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
  background: var(--bz-purple-500);
  border: 2px solid var(--bz-fg-faint);
  color: var(--bz-fg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px var(--bz-scrim);
  transition: all 0.2s ease;
  z-index: 100;
  animation: fadeInUp 0.3s ease-out;
}

.scroll-to-top-btn:hover {
  background: var(--bz-purple-500);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px var(--bz-scrim);
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

.network-mode-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nm-remote {
  background: rgba(62, 142, 208, 0.15);
  color: var(--bz-info);
  border: 1px solid rgba(62, 142, 208, 0.3);
}

.nm-private {
  background: rgba(72, 199, 142, 0.12);
  color: var(--bz-emerald-500);
  border: 1px solid var(--bz-emerald-soft);
}

/* Generation progress block — Milestone 4 motion. The legacy
   notification + Bulma spinner combo is replaced by:
   shout label · mono percent · BonzaiPulse bar with sweep. */
.bz-genprogress {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-4);
  padding: var(--bz-space-4) var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.bz-genprogress__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.bz-genprogress__label {
  font-size: var(--bz-size-h2);
  color: var(--bz-fg);
}
.bz-genprogress__pct {
  font-size: var(--bz-size-h3);
  color: var(--bz-fg-mid);
}

/* Inline image meta — origin pill row above the action cluster. */
.bz-img-meta {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  margin: var(--bz-space-3) 0;
}

/* Origin pill — same vocabulary as the inspector's network badge. */
.bz-origin-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 4px var(--bz-space-3);
  border-radius: var(--bz-r-pill);
  font-size: var(--bz-size-micro);
  letter-spacing: var(--bz-track-eyebrow);
  text-transform: uppercase;
  border: 1px solid var(--bz-border);
}
.bz-origin-pill__dot {
  width: 6px; height: 6px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-fg-low);
}
.bz-origin-pill--consumer {
  color: var(--bz-info);
  border-color: var(--bz-info-soft);
}
.bz-origin-pill--consumer .bz-origin-pill__dot { background: var(--bz-info); }
.bz-origin-pill--private {
  color: var(--bz-purple-300);
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
}
.bz-origin-pill--private .bz-origin-pill__dot { background: var(--bz-purple-300); }
</style>
