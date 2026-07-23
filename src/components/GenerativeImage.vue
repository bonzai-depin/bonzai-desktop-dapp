<template>
  <div class="background"></div>
  <div class="bz-tab-shell">
    <GenerativeWorkspace
      v-model="mode"
      :eyebrow="$t('create.eyebrow')"
      :title="$t('create.imageTitle')"
      icon="image"
      :modes="imageModeItems"
      :progress="workspaceProgress"
      :history-label="$t('create.history')"
      :disabled="isLoading"
    >
      <template #modebar-extra>
        <div class="bz-image-quality">
          <span class="bz-eyebrow">{{ $t('create.resolution') }}</span>
          <ModeChipBar
            v-model="quality"
            :items="qualityModeItems"
            :disabled="isLoading"
            compact
          />
        </div>
      </template>

      <template #panel>
        <div class="bz-image-panel">
          <div
            v-if="showUpdateCTA && readiness.currentMode == mode"
            class="bz-img-notice bz-img-notice--danger"
            role="status"
          >
            <div class="bz-img-notice__icon">
              <span class="material-symbols-outlined">deployed_code</span>
            </div>
            <div class="bz-img-notice__body">
              <p class="bz-img-notice__title fira-sans-condensed-black-italic">
                {{ $t('create.downloadRequired') }}
              </p>
              <p class="bz-img-notice__text">
                This image mode needs local model files before it can run.
              </p>
              <ul v-if="readiness.repoDetails.length || readiness.missingGguf" class="bz-img-notice__list">
                <li v-for="d in readiness.repoDetails" :key="d.repo">
                  <span class="material-symbols-outlined" aria-hidden="true">folder</span>
                  <span>{{ d.repo }}</span>
                </li>
                <li v-for="gguf in readiness.ggufNames" :key="gguf">
                  <span class="material-symbols-outlined" aria-hidden="true">draft</span>
                  <span>{{ gguf }}</span>
                </li>
              </ul>
              <ul v-if="readiness.notes.length" class="bz-img-notice__notes">
                <li v-for="(n, i) in readiness.notes" :key="i">{{ n }}</li>
              </ul>
            </div>
            <div class="bz-img-notice__actions">
              <button
                type="button"
                class="bz-btn bz-btn--primary"
                :disabled="downloads.active || readiness.authRequired"
                title="Download required files for this mode"
                @click="prefetchForMode"
              >
                <span class="material-symbols-outlined" aria-hidden="true">download</span>
                Download
              </button>
            </div>
          </div>

          <div v-else-if="generation.error" class="bz-img-notice bz-img-notice--danger" role="alert">
            <div class="bz-img-notice__icon">
              <span class="material-symbols-outlined">warning</span>
            </div>
            <div class="bz-img-notice__body">
              <p class="bz-img-notice__title fira-sans-condensed-black-italic">
                {{ $t('create.generationFailed') }}
              </p>
              <p class="bz-img-notice__text">{{ generation.error }}</p>
            </div>
          </div>

          <div v-if="downloads && downloads.active" class="bz-img-download" role="status">
            <div class="bz-img-download__head">
              <span class="bz-img-download__title fira-sans-condensed-black-italic">
                {{ $t('create.downloading') }}
              </span>
              <span class="bz-img-download__percent fira-sans-condensed-black-italic">
                {{ Math.round(downloads.total_progress || 0) }}%
              </span>
            </div>
            <BonzaiPulse variant="bar" :percent="downloads.progress || 0" />
            <ul v-if="downloadTaskList.length" class="bz-img-download__tasks">
              <li v-for="t in downloadTaskList" :key="t.task_id || t.filename">
                <span class="material-symbols-outlined" aria-hidden="true">deployed_code</span>
                <span class="bz-img-download__file">{{ t.filename }}</span>
                <span class="bz-img-download__status fira-sans-condensed-black-italic">
                  {{ t.status }}
                </span>
                <span class="bz-mono">{{ Math.round(t.progress || 0) }}%</span>
              </li>
            </ul>
          </div>

          <AccessRequirements
            ref="accessRef"
            level="LVL3"
            @access-changed="onAccessChanged"
          />

          <div v-if="isEditMode" class="bz-image-reference">
            <label class="bz-image-reference__picker">
              <input
                type="file"
                accept="image/*"
                @change="onImagePicked"
              />
              <span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span>
              <span class="bz-image-reference__copy">
                <span class="bz-image-reference__title">Reference image</span>
                <span class="bz-image-reference__meta">
                  {{ pickedImageName || "Choose an image to edit" }}
                </span>
              </span>
            </label>
            <div v-if="imagePreviewUrl" class="bz-image-reference__preview">
              <img :src="imagePreviewUrl" alt="Selected image preview" />
            </div>
          </div>

          <GenerativeInput
            ref="promptInput"
            v-model="form.prompt"
            :placeholder="
              isEditMode
                ? 'Describe how to edit the image...'
                : 'Describe your image...'
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
        </div>
      </template>

      <template #historyActions>
        <div class="bz-image-history-actions">
          <button type="button" class="bz-iconbtn" title="Import history" aria-label="Import history" @click="importHistory()">
            <span class="material-symbols-outlined" aria-hidden="true">upload</span>
          </button>
          <button
            type="button"
            class="bz-iconbtn"
            title="Export history"
            aria-label="Export history"
            :disabled="inferences.length === 0"
            @click="exportHistory()"
          >
            <span class="material-symbols-outlined" aria-hidden="true">download</span>
          </button>
          <button type="button" class="bz-iconbtn bz-iconbtn--danger" title="Clear history" aria-label="Clear history" @click="clearHistory()">
            <span class="material-symbols-outlined" aria-hidden="true">ink_eraser</span>
          </button>
        </div>
      </template>

      <template #history>
        <div
          v-if="inferences.length"
          ref="masonryGridRef"
          class="bz-image-masonry"
          :style="{ '--bz-image-masonry-columns': masonryColumns.length }"
        >
          <ol
            v-for="(column, columnIndex) in masonryColumns"
            :key="columnIndex"
            class="bz-image-masonry__column"
          >
            <li
              v-for="entry in column"
              :key="entry.inference.id || entry.inference._originalIndex"
              class="history-item"
              :style="{ transitionDelay: `${Math.min(entry.displayIndex * 12, 96)}ms` }"
            >
              <div class="question">
                <img
                  class="generated__image"
                  :src="imageDataUrl(entry.inference)"
                  alt="Generated image"
                  title="Open full screen preview"
                  :loading="entry.displayIndex < 6 ? 'eager' : 'lazy'"
                  decoding="async"
                  :fetchpriority="entry.displayIndex < 3 ? 'high' : 'auto'"
                  :style="imageAspectStyle(entry.inference)"
                  @click="openImageFullscreen(entry.inference)"
                />
                <div
                  v-if="entry.inference.networkMode && entry.inference.networkMode !== 'local'"
                  class="bz-image-card__caption"
                >
                  <span class="bz-origin-pill" :class="`bz-origin-pill--${entry.inference.networkMode}`">
                    <span class="bz-origin-pill__dot"></span>
                    {{ entry.inference.networkMode === 'private' ? 'Private' : 'Remote' }}
                  </span>
                </div>
                <GenerativeActions
                  :actions="actionsFor(entry.inference)"
                  @action="(id) => handleAction(id, entry.inference)"
                />
              </div>
            </li>
          </ol>
        </div>
        <BonzaiEmptyState
          v-else
          size="small"
          icon="image"
          :title="$t('create.noImages')"
          :subtitle="$t('create.noImagesCopy')"
          :show-orb="false"
        />

        <div
          ref="loadMoreSentinel"
          v-if="hasMore"
          class="load-more-sentinel"
        >
          <span v-if="isLoadingMore" class="bz-meta">Loading more...</span>
        </div>
      </template>
    </GenerativeWorkspace>

    <Transition name="bz-image-toast">
      <div
        v-if="pendingDelete"
        class="bz-image-delete-toast"
        role="status"
        aria-live="polite"
      >
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        <span class="bz-image-delete-toast__body">
          Delete this image?
        </span>
        <button type="button" class="bz-image-delete-toast__ghost" @click="dismissDeleteToast">
          Cancel
        </button>
        <button type="button" class="bz-image-delete-toast__danger" @click="confirmDeleteImage">
          Delete
        </button>
      </div>
    </Transition>
  </div>

  <!-- Mint Modal -->
  <MintModal
    v-if="mintTarget"
    :visible="!!mintTarget"
    v-bind="mintTarget"
    @close="mintTarget = null"
    @minted="onMinted"
  />

  <Teleport to="body">
    <Transition name="bz-image-lightbox">
      <div
        v-if="fullscreenImage"
        class="bz-image-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Generated image preview"
        @click.self="closeImageFullscreen"
      >
        <BzCloseButton class="bz-image-lightbox__close" size="md" aria-label="Close preview" @click="closeImageFullscreen" />
        <img :src="imageDataUrl(fullscreenImage)" alt="Generated image full screen preview" />
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import {
  ref,
  reactive,
  shallowRef,
  computed,
  inject,
  nextTick,
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
import BonzaiEmptyState from "./BonzaiEmptyState.vue";
import BzCloseButton from "./BzCloseButton.vue";
import GenerativeActions from "./generative/GenerativeActions.vue";
import GenerativeInput from "./generative/GenerativeInput.vue";
import GenerativeWorkspace from "./generative/GenerativeWorkspace.vue";
import ModeChipBar from "./generative/ModeChipBar.vue";
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
  components: {
    AccessRequirements,
    MintModal,
    BonzaiPulse,
    BonzaiEmptyState,
    BzCloseButton,
    GenerativeActions,
    GenerativeInput,
    GenerativeWorkspace,
    ModeChipBar,
  },
  setup() {
    const { inferenceRequest } = useInferenceRouter();

    // ------------ injected from App -------
    const goAnimateToVideo = inject("goAnimateToVideo", () => {});
    const fullscreenImage = ref(null);

    // Animate an inference image by switching to video tab
    const animate = (inference) => {
      const img = inference?.answer?.data?.image;
      if (!img) return;
      goAnimateToVideo(img);
    };
    const openImageFullscreen = (inference) => {
      if (imageDataUrl(inference)) fullscreenImage.value = inference;
    };
    const closeImageFullscreen = () => {
      fullscreenImage.value = null;
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
    const pendingDelete = ref(null);
    let pendingDeleteTimer = null;
    const imageModeItems = [
      { value: "turbo", label: "Turbo", icon: "bolt", title: "Fast Flux generation" },
      { value: "standard", label: "Standard", icon: "photo_camera", title: "SDXL generation" },
      { value: "quality", label: "Quality", icon: "high_quality", title: "Higher fidelity generation" },
      { value: "turbo_edit", label: "Edit", icon: "brush", title: "Edit an existing image" },
    ];
    const qualityModeItems = [
      { value: "sd", label: "SD", icon: "sd", title: "512 x 768" },
      { value: "hd", label: "HD", icon: "hd", title: "720 x 1280" },
      { value: "fhd", label: "FHD", icon: "full_hd", title: "1024 x 1920" },
      { value: "2k", label: "2K", icon: "2k", title: "1440 x 2560" },
      { value: "4k", label: "4K", icon: "4k", title: "2160 x 4096" },
    ];
    // Use shallowRef for inferences - base64 images are large and don't need deep reactivity
    const inferences = shallowRef([]);
    const hasCopy = shallowRef([]);

    // ------------ lazy loading pagination ----------------
    const ITEMS_PER_PAGE = 10;
    const initialMasonryColumnCount = () => {
      if (typeof window === "undefined") return 1;
      return window.innerWidth >= 1180 ? 3 : window.innerWidth >= 760 ? 2 : 1;
    };
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const masonryGridRef = ref(null);
    const masonryColumnCount = ref(initialMasonryColumnCount());
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);
    let masonryGridResizeObserver = null;

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
      () => displayedCount.value < reversedInferences.value.length,
    );

    const estimateImageRatio = (inference) => {
      const data = inference?.answer?.data || {};
      const width = Number(data.width || inference?.width || 0);
      const height = Number(data.height || inference?.height || 0);
      if (width > 0 && height > 0) return height / width;
      return 0.66;
    };

    const imageAspectStyle = (inference) => {
      const data = inference?.answer?.data || {};
      const width = Number(data.width || inference?.width || 0);
      const height = Number(data.height || inference?.height || 0);
      if (width > 0 && height > 0) return { aspectRatio: `${width} / ${height}` };
      return null;
    };

    const sniffImageMime = (imageData) => {
      if (!imageData) return "image/webp";
      const dataUrlMatch = String(imageData).match(/^data:([^;]+);base64,/i);
      if (dataUrlMatch) return dataUrlMatch[1];
      try {
        const head = atob(String(imageData).slice(0, 32));
        if (head.startsWith("\x89PNG")) return "image/png";
        if (head.startsWith("\xff\xd8\xff")) return "image/jpeg";
        if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
      } catch {}
      return "image/webp";
    };

    const imageDataUrl = (inference) => {
      const data = inference?.answer?.data || {};
      const image = data.image || inference?.imageData || inference?.image || "";
      if (!image) return "";
      if (/^data:image\//i.test(image)) return image;
      const mime = data.mime_type || data.mimeType || inference?.mime_type || inference?.mimeType || sniffImageMime(image);
      return `data:${mime};base64,${image}`;
    };

    const masonryColumns = computed(() => {
      const count = Math.max(
        1,
        Math.min(masonryColumnCount.value, paginatedInferences.value.length || 1),
      );
      const columns = Array.from({ length: count }, () => []);
      const heights = Array.from({ length: count }, () => 0);

      paginatedInferences.value.forEach((inference, displayIndex) => {
        const firstOpenColumn = columns.findIndex((column) => column.length === 0);
        const columnIndex = firstOpenColumn >= 0
          ? firstOpenColumn
          : heights.indexOf(Math.min(...heights));

        columns[columnIndex].push({ inference, displayIndex });
        heights[columnIndex] += estimateImageRatio(inference) + 0.12;
      });

      return columns;
    });

    const updateMasonryColumnCount = () => {
      const width =
        masonryGridRef.value?.clientWidth ||
        document.querySelector(".bz-workspace__history")?.clientWidth ||
        window.innerWidth;
      const nextCount = width >= 1180 ? 3 : width >= 760 ? 2 : 1;
      if (masonryColumnCount.value !== nextCount) {
        masonryColumnCount.value = nextCount;
      }
    };

    const setupMasonryGridObserver = () => {
      masonryGridResizeObserver?.disconnect();
      masonryGridResizeObserver = null;
      nextTick(() => {
        updateMasonryColumnCount();
        if (!masonryGridRef.value) return;
        masonryGridResizeObserver = new ResizeObserver(updateMasonryColumnCount);
        masonryGridResizeObserver.observe(masonryGridRef.value);
      });
    };

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      displayedCount.value = Math.min(
        displayedCount.value + ITEMS_PER_PAGE,
        reversedInferences.value.length,
      );
      nextTick(() => {
        updateMasonryColumnCount();
        isLoadingMore.value = false;
      });
    };

    // Reset to initial count when new inference is added
    const resetToFirstPage = () => {
      displayedCount.value = ITEMS_PER_PAGE;
      nextTick(updateMasonryColumnCount);
    };

    // Intersection Observer for infinite scroll
    let scrollObserver = null;
    const setupScrollObserver = () => {
      if (scrollObserver) scrollObserver.disconnect();
      if (!loadMoreSentinel.value) return;

      // Use the scroll container as root for proper intersection detection
      const root =
        scrollContainer.value ||
        document.querySelector(".bz-workspace");
      scrollObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore.value) {
            loadMore();
          }
        },
        { root, rootMargin: "900px 0px 900px 0px", threshold: 0 },
      );
      scrollObserver.observe(loadMoreSentinel.value);
    };

    // Scroll to top handler
    const scrollToTop = () => {
      const container =
        scrollContainer.value ||
        document.querySelector(".bz-workspace");
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
    const workspaceProgress = computed(() =>
      generation.value.active
        ? {
            active: true,
            pct: generationPctClamped.value,
            label: "Crafting...",
          }
        : null,
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
      if (
        allTasksComplete &&
        !["completed", "failed", "cancelled"].includes(downloads.status)
      ) {
        console.log(
          "[Downloads] All tasks completed, forcing status to completed",
        );
        downloads.status = "completed";
        downloads.total_progress = 100;
        downloads.progress = 100;
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
      downloads.status = "downloading";
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
            mode: mode.value,
            quality: quality.value,
            width: response.data.width || payload.width,
            height: response.data.height || payload.height,
            mimeType: response.data.mime_type || response.data.mimeType || sniffImageMime(response.data.image),
            steps: payload.steps,
            guidanceScale: payload.guidance_scale,
            lora: payload.lora,
            hasReferenceImage: isEditMode.value,
            elapsedMs,
            timestamp: Date.now(),
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
            width: response.data.width || payload.width,
            height: response.data.height || payload.height,
            steps: payload.steps,
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

        // Route through the unified handler only when consumer networking is
        // active. In local/provider modes this component already posts to
        // Flask directly; routing first would run the same pipeline twice.
        const networkMode = await window.electronAPI?.store?.get?.(
          "p2p.networkMode",
          "local",
        );
        const canRouteThroughIpc = payload.pipeline && networkMode === "consumer" && !isEditMode.value;
        if (canRouteThroughIpc) {
          const routed = await inferenceRequest(payload.pipeline, payload);
          if (routed?.ok && routed.result) {
            _lastRoutingMode = routed.private
              ? 'private'
              : routed.remote
                ? 'remote'
                : 'local';
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

    const clearDeleteToastTimer = () => {
      if (!pendingDeleteTimer) return;
      window.clearTimeout(pendingDeleteTimer);
      pendingDeleteTimer = null;
    };

    const dismissDeleteToast = () => {
      clearDeleteToastTimer();
      pendingDelete.value = null;
    };

    const requestDeleteImage = (inference) => {
      if (!inference) return;
      clearDeleteToastTimer();
      pendingDelete.value = {
        id: inference.id,
        index: inference._originalIndex,
      };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const confirmDeleteImage = async () => {
      const pending = pendingDelete.value;
      if (!pending) return;
      dismissDeleteToast();
      const idx = inferences.value.findIndex((item) => item.id === pending.id);
      await removeInference(idx >= 0 ? idx : pending.index);
    };

    const clearHistory = async () => {
      dismissDeleteToast();
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
      nextTick(() => {
        setupMasonryGridObserver();
        setupScrollObserver();
      });
      // Attach scroll listener for scroll-to-top button
      const container = document.querySelector(".bz-workspace");
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
      if (masonryGridResizeObserver) {
        masonryGridResizeObserver.disconnect();
        masonryGridResizeObserver = null;
      }
      // Cleanup scroll listener
      if (scrollContainer.value) {
        scrollContainer.value.removeEventListener("scroll", handleScroll);
      }
      clearDeleteToastTimer();
      // Note: generation socket is shared and managed by generationStore
    });
    watch(
      mode,
      () => {
        probeCurrentMode();
      },
      { immediate: true },
    );

    watch(
      () => paginatedInferences.value.length,
      () => {
        setupMasonryGridObserver();
        nextTick(setupScrollObserver);
      },
    );

    // Open the global generation inspector for a clicked output.
    // Maps the local inference shape onto the inspector's forgiving
    // schema; only the fields we have populate. Image is base64 today
    // so we wrap it as a data URL for the inspector's <img>.
    const openInspector = (inference) => {
      if (!inference) return;
      const data = inference.answer?.data || {};
      const promptText = inference.question || data.prompt || "";
      const wordCount = (text) =>
        String(text || "").trim().split(/\s+/).filter(Boolean).length;
      const mediaUrl = imageDataUrl(inference) || null;
      const width = data.width || inference.width || null;
      const height = data.height || inference.height || null;
      const modeLabel = imageModeItems.find((item) => item.value === inference.mode)?.label
        || imageModeItems.find((item) => item.value === mode.value)?.label
        || inference.mode
        || mode.value;
      const qualityLabel = qualityModeItems.find((item) => item.value === inference.quality)?.label
        || qualityModeItems.find((item) => item.value === quality.value)?.label
        || inference.quality
        || quality.value;
      inspector.show({
        id: inference.id,
        kind: "image",
        mediaUrl,
        imageData: data.image || inference.imageData || inference.image || "",
        mimeType: data.mime_type || data.mimeType || inference.mime_type || inference.mimeType || null,
        prompt: promptText,
        negativePrompt: data.negative_prompt,
        model: inference.model || (mode.value ? `Z-Image (${mode.value})` : null),
        modelId: inference.modelId || inference.pipeline || (mode.value ? `image_${mode.value}` : null),
        status: inference.error ? "Error" : "Complete",
        errorMessage: inference.errorMessage || "",
        seed: data.seed || inference.seed,
        steps: data.steps || inference.steps,
        guidanceScale: data.guidance_scale || inference.guidanceScale,
        ...(width && height ? { width, height } : {}),
        networkMode: inference.networkMode || "local",
        peerId: inference.peerId,
        mintState: inference.nft || null,
        ts: inference.timestamp || inference.ts,
        createdAt: inference.createdAt,
        extra: {
          mode: modeLabel,
          resolutionPreset: qualityLabel,
          pipeline: inference.pipeline || currentPipeline.value,
          endpoint: endpointForMode(),
          elapsedMs: inference.elapsedMs != null ? `${Math.round(inference.elapsedMs)} ms` : "",
          promptChars: String(promptText.length),
          promptWords: String(wordCount(promptText)),
          imageBytes: data.image ? String(Math.round((data.image.length * 3) / 4)) : "",
          referenceImage: inference.hasReferenceImage ? "Yes" : "No",
          ...(inference.lora ? { lora: inference.lora } : {}),
        },
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
        { id: "inspect",  icon: "info",       label: "",   variant: "default",
          title: "Open inspector" },
        { id: "download", icon: "save",          label: "Download",  variant: "primary",     disabled: !hasImage },
        { id: "copy",     icon: hasCopy[inference._originalIndex] ? "check" : "content_copy",
          label: hasCopy[inference._originalIndex] ? "Copied" : "Reuse",
          title: "Reuse this prompt", variant: "default" },
        { id: "mint", icon: minted ? "check_circle" : "token",
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
        case "inspect":
          openInspector(inference);
          break;
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
          requestDeleteImage(inference);
          break;
      }
    };

    return {
      // state
      mode,
      imageModeItems,
      isEditMode,
      quality,
      qualityModeItems,
      form,
      isLoading,
      pendingDelete,
      inferences,
      hasCopy,
      // inspector
      openInspector,
      fullscreenImage,
      openImageFullscreen,
      closeImageFullscreen,
      // unified action cluster
      actionsFor,
      handleAction,
      // lazy loading pagination
      paginatedInferences,
      masonryGridRef,
      masonryColumns,
      loadMoreSentinel,
      hasMore,
      isLoadingMore,
      imageAspectStyle,
      imageDataUrl,
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
      workspaceProgress,
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
      dismissDeleteToast,
      confirmDeleteImage,
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
.bz-image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: var(--bz-space-6);
  background: var(--bz-scrim-deep);
}
.bz-image-lightbox img {
  max-width: min(96vw, 1600px);
  max-height: 92vh;
  object-fit: contain;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-content-radius);
  background: var(--bz-canvas);
  box-shadow: var(--bz-elev-3);
}
.bz-image-lightbox__close {
  position: fixed;
  top: var(--bz-space-5);
  right: var(--bz-space-5);
  z-index: 1;
}
.bz-image-lightbox-enter-active,
.bz-image-lightbox-leave-active {
  transition: opacity var(--bz-dur-base) var(--bz-ease-out);
}
.bz-image-lightbox-enter-from,
.bz-image-lightbox-leave-to {
  opacity: 0;
}
.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
  border-radius: 100%;
}

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: url("../assets/bonzai_image.webp") no-repeat;
  background-size: cover;  overflow: hidden;
}

.bz-tab-shell {
  --bz-image-grid-gap: 12px;
}

.bz-tab-shell :deep(.bz-workspace__history) {
  gap: var(--bz-image-grid-gap);
}

.bz-image-quality {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-3);
  padding-left: var(--bz-space-3);
  border-left: 1px solid var(--bz-border);
}

.bz-image-panel {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
}

.bz-img-notice,
.bz-img-download {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--bz-space-3);
  align-items: start;
  padding: var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}

.bz-img-notice--danger {
  background: var(--bz-danger-soft);
  border-color: var(--bz-danger);
}

.bz-img-notice__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--bz-danger);
}

.bz-img-notice__title {
  margin: 0;
  color: var(--bz-fg);
  font-size: var(--bz-size-h3);
  letter-spacing: 0;
  text-transform: uppercase;
}

.bz-img-notice__text {
  margin: var(--bz-space-1) 0 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-body);
  line-height: var(--bz-line-body);
}

.bz-img-notice__list,
.bz-img-notice__notes,
.bz-img-download__tasks {
  padding: 0;
  margin: var(--bz-space-4) 0 0;
  list-style: none;
}

.bz-img-notice__list li,
.bz-img-download__tasks li {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto auto;
  gap: var(--bz-space-2);
  align-items: center;
  min-height: 28px;
  color: var(--bz-fg-mid);
}

.bz-img-notice__list li {
  grid-template-columns: 20px minmax(0, 1fr);
}

.bz-img-notice__list .material-symbols-outlined,
.bz-img-download__tasks .material-symbols-outlined {
  font-size: 16px !important;
  color: var(--bz-fg-low);
}

.bz-img-notice__notes li {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
}

.bz-img-download {
  grid-template-columns: minmax(0, 1fr);
}

.bz-img-download__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bz-space-3);
}

.bz-img-download__title,
.bz-img-download__percent {
  color: var(--bz-fg);
  letter-spacing: 0;
  text-transform: uppercase;
}

.bz-img-download__title {
  font-size: var(--bz-size-h3);
}

.bz-img-download__percent {
  font-size: var(--bz-size-h2);
  line-height: 1;
}

.bz-img-download__file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bz-img-download__status {
  color: var(--bz-fg);
  text-transform: uppercase;
}

.bz-image-reference {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1fr);
  gap: var(--bz-space-4);
  align-items: stretch;
  padding: var(--bz-space-4);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}

.bz-image-reference__picker {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  min-height: 116px;
  padding: var(--bz-space-4);
  border: 1px dashed var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg);
  cursor: pointer;
}

.bz-image-reference__picker:hover {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
}

.bz-image-reference__picker input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
  pointer-events: none;
}

.bz-image-reference__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bz-space-1);
}

.bz-image-reference__title {
  color: var(--bz-fg);
  font-weight: 700;
}

.bz-image-reference__meta {
  color: var(--bz-fg-low);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bz-image-reference__preview {
  min-height: 116px;
  border-radius: var(--bz-r-sm);
  overflow: hidden;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
}

.bz-image-reference__preview img {
  width: 100%;
  height: 100%;
  max-height: 240px;
  display: block;
  object-fit: contain;
}

.bz-image-history-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
}

/* ── Image history grid ─────────────────────────────────────────
   No hero item: every output is a peer tile. JS balances explicit
   columns so the gaps stay even without browser row-span artifacts. */

.bz-image-masonry {
  display: grid;
  grid-template-columns: repeat(var(--bz-image-masonry-columns), minmax(0, 1fr));
  gap: var(--bz-image-grid-gap);
  padding: 0;
  margin: 0 0 var(--bz-space-5);
}

.bz-image-masonry__column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-image-grid-gap);
  list-style: none;
  padding: 0;
  margin: 0;
}

.history-item {
  min-width: 0;
  opacity: 1;
  margin: 0;
  transition:
    transform var(--bz-dur-fast) var(--bz-ease-out);
}

div.question {
  position: relative;
  padding: 0;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  overflow: hidden;
}

div.question::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: min(46%, 148px);
  background:
    linear-gradient(
      180deg,
      transparent 0%,
      rgba(0, 0, 0, 0.22) 36%,
      rgba(0, 0, 0, 0.76) 100%
    );
  pointer-events: none;
  z-index: 1;
}

.generated__image {
  width: 100%;
  height: auto;
  min-height: 180px;
  background: var(--bz-canvas);
  object-fit: contain;
  border-radius: 0;
  display: block;
  cursor: zoom-in;
}

.bz-image-card__caption {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--bz-space-3);
  margin: 0;
  position: absolute;
  left: var(--bz-space-3);
  bottom: var(--bz-space-3);
  z-index: 2;
}

div.question > .bz-gen-actions {
  position: absolute;
  right: var(--bz-space-3);
  bottom: var(--bz-space-3);
  z-index: 2;
  max-width: calc(100% - var(--bz-space-6));
  padding: 6px;
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: var(--bz-r-sm);
  backdrop-filter: blur(10px);
}

div.question > .bz-gen-actions :deep(.bz-gen-action) {
  color: var(--bz-on-accent);
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.08);
}

div.question > .bz-gen-actions :deep(.bz-gen-action--primary) {
  color: var(--bz-on-accent);
  border-color: transparent;
  background: var(--bz-gradient-brand);
}

div.question > .bz-gen-actions :deep(.bz-gen-action:hover:not(:disabled)) {
  color: var(--bz-on-accent);
  border-color: rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.16);
}

div.question > .bz-gen-actions :deep(.bz-gen-action--primary:hover:not(:disabled)) {
  background: var(--bz-gradient-brand);
  border-color: transparent;
}

.bz-image-card__caption + .bz-gen-actions {
  max-width: calc(100% - 132px);
}

.load-more-sentinel {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  transform: translateY(8px);
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
