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
                    movie
                  </span>
                  Generative Video
                </h1>
              </div>
            </div>
          </div>

          <!-- GENERATION PROGRESS -->
          <div
            v-if="generation && generation.active"
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
                <!-- MODEL SELECTOR — Quality (Wan2.2) option removed;
                     Fast (LTX-2) is the only available video model now.
                     Kept videoModel = "fast" reactive default so all
                     downstream branching still works unchanged. -->
                <!-- <div class="control mb-3 has-text-left">
                  <input v-model="videoModel" value="fast" id="vm_fast" type="radio" name="video_model" checked />
                  <label for="vm_fast" class="radio mr-2">
                    <span class="material-symbols-outlined" style="font-size: 32px !important">bolt</span>
                    Fast
                  </label>
                </div> -->

                <!-- MODE / DURATION / FPS / RESOLUTION OPTIONS -->
                <div class="control mb-5 has-text-left">
                  <template v-if="videoModel === 'fast'">
                  <input
                    v-model="mode"
                    :value="'t2v'"
                    id="video_mode_t2v"
                    type="radio"
                    name="video_mode"
                  />
                  <label for="video_mode_t2v" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      text_fields
                    </span>
                    From Prompt
                  </label>
                  <input
                    v-model="mode"
                    :value="'i2v'"
                    id="video_mode_i2v"
                    type="radio"
                    name="video_mode"
                    checked
                  />
                  <label for="video_mode_i2v" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      image
                    </span>
                    From Image
                  </label>
                  </template>

                  <template v-if="videoModel === 'quality'">
                  <span class="tag is-info is-light">Image-to-Video only</span>
                  </template>

                  <!-- DURATION TOGGLES -->
                  <span class="control">
                    <template v-if="videoModel === 'quality'">
                      <input v-model="duration" :value="2" id="video_duration_2s" type="radio" name="video_duration" />
                      <label for="video_duration_2s" class="radio duration">2s</label>
                      <input v-model="duration" :value="3" id="video_duration_3s" type="radio" name="video_duration" />
                      <label for="video_duration_3s" class="radio duration">3s</label>
                      <input v-model="duration" :value="5" id="video_duration_5s_q" type="radio" name="video_duration" checked />
                      <label for="video_duration_5s_q" class="radio duration">5s</label>
                    </template>
                    <template v-else>
                      <input v-model="duration" :value="5" id="video_duration_5s" type="radio" name="video_duration" checked />
                      <label for="video_duration_5s" class="radio duration">5s</label>
                      <input v-model="duration" :value="10" id="video_duration_10s" type="radio" name="video_duration" />
                      <label for="video_duration_10s" class="radio duration">10s</label>
                    </template>
                  </span>

                  <!-- FPS (fixed 16fps for Wan2.2, selectable for LTX-2) -->
                  <span v-if="videoModel === 'fast'" class="control">
                    <input v-model="fps" :value="12" id="video_fps_12" type="radio" name="video_fps" checked />
                    <label for="video_fps_12" class="radio fps">12fps</label>
                    <input v-model="fps" :value="24" id="video_fps_24" type="radio" name="video_fps" />
                    <label for="video_fps_24" class="radio fps">24fps</label>
                    <input v-model="fps" :value="48" id="video_fps_48" type="radio" name="video_fps" />
                    <label for="video_fps_48" class="radio fps">48fps</label>
                  </span>
                  <span v-else class="control">
                    <input v-model="wanFps" :value="8" id="wan_fps_8" type="radio" name="wan_fps" />
                    <label for="wan_fps_8" class="radio fps">8fps</label>
                    <input v-model="wanFps" :value="16" id="wan_fps_16" type="radio" name="wan_fps" checked />
                    <label for="wan_fps_16" class="radio fps">16fps</label>
                  </span>

                  <!-- RESOLUTION TOGGLES (real resolutions shown for quality mode) -->
                  <span class="control resolution-toggles">
                    <template v-if="videoModel === 'quality'">
                      <!-- 240p Draft is intentionally tiny so iteration on
                           prompt / framing / negative-prompt tweaks
                           takes ~2-3min on M3 Max instead of 10+. -->
                      <input v-model="quality" value="240p" id="vq_240" type="radio" name="video_quality" />
                      <label for="vq_240" class="radio quality">240×240 (Draft)</label>
                      <input v-model="quality" value="320x240" id="vq_320x240" type="radio" name="video_quality" />
                      <label for="vq_320x240" class="radio quality">320×240</label>
                      <input v-model="quality" value="640x480" id="vq_640x480" type="radio" name="video_quality" checked />
                      <label for="vq_640x480" class="radio quality">640×480</label>
                      <input v-model="quality" value="480p" id="vq_480" type="radio" name="video_quality" />
                      <label for="vq_480" class="radio quality">320×512</label>
                      <input v-model="quality" value="540p" id="vq_540" type="radio" name="video_quality" />
                      <label for="vq_540" class="radio quality">384×672</label>
                      <input v-model="quality" value="720p" id="vq_720" type="radio" name="video_quality" />
                      <label for="vq_720" class="radio quality">480×832</label>
                      <input v-model="quality" value="1080p" id="vq_1080" type="radio" name="video_quality" />
                      <label for="vq_1080" class="radio quality mr-0">576×1024</label>
                    </template>
                    <template v-else>
                      <input v-model="quality" value="480p" id="video_quality_480p" type="radio" name="video_quality" checked />
                      <label for="video_quality_480p" class="radio quality">480p</label>
                      <input v-model="quality" value="540p" id="video_quality_540p" type="radio" name="video_quality" />
                      <label for="video_quality_540p" class="radio quality">540p</label>
                      <input v-model="quality" value="720p" id="video_quality_720p" type="radio" name="video_quality" />
                      <label for="video_quality_720p" class="radio quality">720p</label>
                      <input v-model="quality" value="1080p" id="video_quality_1080p" type="radio" name="video_quality" />
                      <label for="video_quality_1080p" class="radio quality mr-0">1080p</label>
                    </template>
                  </span>

                  <!-- AUTO-ENHANCE TOGGLE (Wan/quality only) -->
                  <span v-if="videoModel === 'quality'" class="control">
                    <input v-model="autoEnhance" id="video_auto_enhance" type="checkbox" />
                    <label for="video_auto_enhance" class="radio quality" :title="'After generation, run Real-ESRGAN x4 + RIFE 4x. Adds 2-4 min.'">
                      Auto-enhance ×4
                    </label>
                  </span>
                </div>

                <!-- READINESS CTA -->
                <div
                  v-if="showUpdateCTA"
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
                      <ul style="text-transform: lowercase">
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
                  v-else-if="generation && generation.error"
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

                <!-- IMAGE PICKER (only for I2V mode) -->
                <div v-if="mode === 'i2v'" class="notification p4 preview">
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
                        <span class="file-label">Browse...</span>
                      </span>
                    </label>
                  </div>

                  <div class="mt-4" v-if="imagePreviewUrl">
                    <img
                      :src="imagePreviewUrl"
                      class="preview"
                      alt="preview"
                      style="width: 100%; border-radius: 4px"
                    />
                  </div>
                </div>

                <!-- ACCESS REQUIREMENTS -->
                <AccessRequirements
                  ref="accessRef"
                  level="LVL4"
                  @access-changed="onAccessChanged"
                />

                <!-- Composer — Milestone 6 unified <GenerativeInput>. -->
                <GenerativeInput
                  v-model="form.prompt"
                  :placeholder="
                    mode === 't2v'
                      ? 'Describe your video…'
                      : 'Describe your animation…'
                  "
                  :submit-label="mode === 't2v' ? 'Generate' : 'Animate'"
                  running-label="Crafting"
                  :running="isLoading"
                  :disabled="!canGenerate || !hasAccess"
                  shortcut-hint="⌘⏎"
                  @submit="sendMessage(form.prompt)"
                />
              </div>
            </div>
            <hr class="mt-5" />

            <!-- GENERATION HISTORY HEADER -->
            <div class="level pt-5 mt-5">
              <div class="level-left">
                <div class="level-item">
                  <h2
                    class="fira-sans-condensed-black-italic has-text-left mt-0 is-size-1 has-text-white"
                    v-if="inferences"
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
                    :disabled="!inferences || inferences.length === 0"
                  >
                    <span class="material-symbols-outlined mr-2">download</span>
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
            <div class="mt-5">
              <!-- GENERATION HISTORY HEADER -->
              <div class="columns">
                <!-- RESULTS -->
                <ol class="chat" v-if="inferences && inferences.length">
                  <li
                    v-for="(inference, displayIndex) in paginatedInferences"
                    :key="inference.id || inference._originalIndex"
                    class="history-item"
                    :style="{
                      animationDelay: `${Math.min(displayIndex * 50, 500)}ms`,
                    }"
                  >
                    <div class="question">
                      <!-- Video Player - UPDATED: Use HTTP streaming URL -->
                      <video
                        v-if="getVideoUrl(inference)"
                        :src="getVideoUrl(inference)"
                        controls
                        class="generated__video"
                      ></video>
                      <div class="bz-img-meta" v-if="inference.networkMode && inference.networkMode !== 'local'">
                        <span class="bz-origin-pill" :class="`bz-origin-pill--${inference.networkMode}`">
                          <span class="bz-origin-pill__dot"></span>
                          {{ inference.networkMode === 'private' ? 'Private' : 'Remote' }}
                        </span>
                      </div>
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
  onMounted,
  onBeforeUnmount,
  watch,
  toRefs,
} from "vue";
import { v4 as uuid } from "uuid";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { io } from "socket.io-client";
import { useInferenceRouter } from "../composables/useInferenceRouter.js";
import AccessRequirements from "./AccessRequirements.vue";
import MintModal from "./MintModal.vue";
import GenerativeActions from "./generative/GenerativeActions.vue";
import GenerativeInput from "./generative/GenerativeInput.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { addVideoInference } from "../stores/inferenceStore.js";

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

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

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;
const WS_GEN = `${API_BASE}/generation`;

export default {
  name: "GenerativeVideo",
  components: { AccessRequirements, MintModal, GenerativeActions, GenerativeInput },
  props: { existingImageBase64: { type: String, default: "" } },
  setup(props) {
    const { inferenceRequest } = useInferenceRouter();

    // ------------ NFT Minting ---------
    const mintTarget = ref(null);

    const openMint = async (inference) => {
      const videoPath = inference.answer?.data?.video_path;
      let content = null;
      if (videoPath && window.electronAPI?.readFileAsBase64) {
        try {
          content = await window.electronAPI.readFileAsBase64(videoPath);
        } catch (e) {
          console.warn('[GenerativeVideo] Could not read video file:', e);
        }
      }
      mintTarget.value = {
        inferenceType: 'video',
        inferenceId: inference.id,
        content,
        contentType: 'video/mp4',
        prompt: inference.question,
        generation: {
          type: inference.question?.startsWith('i2v') ? 'image-to-video' : 'text-to-video',
          model: inference.model || 'ltx-2',
          timestamp: inference.timestamp,
          elapsedMs: inference.elapsedMs || null,
        },
      };
    };

    const onMinted = (result) => {
      // Trigger re-render for shallowRef
      const arr = [...inferences.value];
      const inf = arr.find(i => i.id === mintTarget.value?.inferenceId);
      if (inf) inf.nft = result;
      inferences.value = arr;
      mintTarget.value = null;
    };

    const mode = ref("i2v"); // "t2v" (text-to-video) or "i2v" (image-to-video)
    // Default to quality (Wan 2.2). LTX-2 is kept available for the
    // text-to-video path and faster batch jobs, but Wan's two-stage
    // diffusion + Lightning 4-step distillation produces materially
    // better motion + character consistency on MPS.
    const videoModel = ref("quality");
    // Default to 640×480 (4:3 landscape) for Wan/quality mode — solid
    // working resolution. 240p Draft is still available one click away
    // for fast prompt iteration. LTX (fast) mode overrides this to
    // 480p in the watch() below since 640x480 isn't an LTX preset.
    const quality = ref("640x480");
    const duration = ref(5);       // seconds: default 5s
    const fps = ref(12);           // 12 or 24 (default 12fps for memory efficiency)
    const wanFps = ref(16);         // 8 or 16 (default 16fps for Wan2.2)
    // Auto-enhance: chain /video/enhance (Real-ESRGAN x4 + RIFE 4x) after
    // /video/quality completes. Default off — adds 2-4 min per generation.
    const autoEnhance = ref(false);
    const isLoading = ref(false);
    const form = reactive({ prompt: "" });
    // Use shallowRef for inferences - video data is large
    const inferences = shallowRef([]);
    const hasCopy = shallowRef([]);
    const planReq = reactive({ controller: null, seq: 0 });

    // ------------ lazy loading pagination ----------------
    const ITEMS_PER_PAGE = 5;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);

    // Get video path from any format
    const getVideoPath = (item) => {
      // Component format: answer.data.video_path or video_url
      if (item.answer?.data?.video_path) return item.answer.data.video_path;
      if (item.answer?.data?.video_url) return item.answer.data.video_url;
      // Unified store format: videoPath
      if (item.videoPath) return item.videoPath;
      // Direct properties
      if (item.video_path) return item.video_path;
      if (item.video_url) return item.video_url;
      if (item.data?.video_path) return item.data.video_path;
      return null;
    };

    // Normalize inference to component format
    const normalizeInference = (item) => {
      const videoPath = getVideoPath(item);
      if (!videoPath) return null;

      // Already in component format with valid data
      if (item.answer?.data?.video_path || item.answer?.data?.video_url) {
        return item;
      }

      // Convert any other format to component format
      return {
        ...item,
        question: item.prompt || item.question || '',
        answer: {
          status: item.answer?.status || 200,
          data: {
            video_path: videoPath,
            ...(item.answer?.data || {}),
          },
        },
      };
    };

    // Reversed inferences (most recent first) with original index
    // Filter out invalid entries and normalize data structure
    const reversedInferences = computed(() => {
      const normalized = inferences.value
        .map((item, idx) => {
          const norm = normalizeInference(item);
          if (!norm) {
            console.warn('[GenerativeVideo] Skipping invalid inference:', item);
            return null;
          }
          return {
            ...norm,
            _originalIndex: idx,
          };
        })
        .filter((item) => item && (item.answer?.data?.video_path || item.answer?.data?.video_url));

      console.log(`[GenerativeVideo] ${inferences.value.length} total, ${normalized.length} valid`);
      return normalized
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

    // Debounced persistence
    const persistInferences = debounce(async (data) => {
      try {
        // Use JSON.parse/stringify to ensure proper serialization
        await window.electronAPI?.store?.set?.(
          "videoInferences",
          JSON.parse(JSON.stringify(data))
        );
      } catch (e) {
        console.error("[GenerativeVideo] Failed to persist inferences:", e);
      }
    }, 500);

    // ------------ access control -----------
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

    const canGenerateWithAccess = computed(
      () => hasAccess.value && !isLoading.value
    );

    // Can generate: for t2v mode, just need access; for i2v/quality mode, also need an image
    const canGenerate = computed(() => {
      if (isLoading.value) return false;
      if (videoModel.value === "quality") return hasAnyImage.value; // Wan2.2 is always I2V
      if (mode.value === "t2v") return true;
      return hasAnyImage.value;
    });

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
    });

    // Use shared generation store for persistent state across view navigation
    const generation = computed(() => generationStore.state.video);

    // Computed properties for progress display (avoid repeated Math.round in template)
    const generationPctRounded = computed(() =>
      Math.round(generation.value?.pct || 0)
    );
    const generationPctClamped = computed(() =>
      Math.max(0, Math.min(100, generation.value?.pct || 0))
    );

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

    const endpointForMode = () => videoModel.value === "quality" ? "/video/quality" : "/video";
    const pipelineForMode = () => videoModel.value === "quality" ? "video_quality" : "video_fast";

    const normalizeFramesForLTX2 = (frames) => {
      // LTX-2 frames must be 8n+1
      const n = Math.max(9, Number(frames) || 25);
      const k = Math.round((n - 1) / 8);
      return 1 + 8 * k;
    };

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
          dst.downloaded_size,
          src.downloaded_size
        );
      if (
        typeof dst.total_size === "number" &&
        typeof src.total_size === "number"
      )
        out.total_size = Math.max(dst.total_size, src.total_size);
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

    // Pipeline names relevant to this view
    const VIDEO_PIPELINES = [
      "video_fast", "ltx2_video_gguf", "ltx2_video", "ltx_video",
      "video_quality", "wan_i2v",
    ];

    const isRelevantPipeline = (pipelineName) => {
      return VIDEO_PIPELINES.some((p) => pipelineName === p || pipelineName?.startsWith(p));
    };

    const resumeActiveDownloadIfAny = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/downloads/list`);
        const active = (data?.pipelines || []).filter((p) =>
          ["pending", "downloading", "retrying", "waiting_retry"].includes(p.status) &&
          isRelevantPipeline(p.pipeline_name)
        );
        if (!active.length) return;
        ensureDownloadsSocket();
        active.forEach((pl) => connectAndSubscribe(pl.pipeline_id));
      } catch {}
    };

    const cancelCurrentPipeline = async () => {
      if (!downloads.pipelineId) return;
      try {
        const { data, status } = await axios.post(
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

    const applyPlanToReadiness = (data) => {
      const repos = Array.isArray(data?.repos) ? data.repos : [];
      const incompleteRepos = repos.filter(
        (r) =>
          r && (r.ok === false || (Number.isFinite(r.missing) && r.missing > 0))
      );
      readiness.missingRepos = [
        ...new Set(incompleteRepos.map((r) => r.repo).filter(Boolean)),
      ];
      readiness.repoDetails = incompleteRepos.map((r) => ({
        repo: r.repo,
        missing: Number.isFinite(r.missing) ? r.missing : null,
        root: r.root || null,
      }));
      // Handle required_files from the plan response (single files like GGUF, FP8, etc.)
      const requiredFiles = Array.isArray(data?.required_files)
        ? data.required_files
        : [];
      const missingFiles = requiredFiles.filter(
        (f) => f && (!f.exists || !f.ok)
      );
      readiness.missingGguf = missingFiles.length > 0;
      readiness.ggufNames = missingFiles.map((f) =>
        (f.name || f.path || "").split("/").pop()
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
      // This prevents showing 100% progress when work is actually needed
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
      setBlocked("video", true);
    };

    const apply409ToReadiness = (res) => {
      readiness.ok = false;
      readiness.checking = false;
      setBlocked("video", true);
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
    const getPlanCacheKey = (pipeline) => `planCache_video_${pipeline}`;

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
      setBlocked("video", false);
      const pipeline = pipelineForMode();
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

    const prefetchForMode = async () => {
      const pipeline = pipelineForMode();
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
          "video",
          res?.data?.error || `Prefetch failed (${res.status})`
        );
      } catch (e) {
        setError("video", e?.message || "Network error");
      }
    };

    // Socket is managed by the shared generationStore

    const requestWithDownloadTracking = async (url, payload, onSuccess) => {
      try {
        isLoading.value = true;

        // Route through unified inference handler
        if (payload.pipeline) {
          const routed = await inferenceRequest(payload.pipeline, payload);
          if (routed?.ok && routed.remote && routed.result) {
            _lastRoutingMode = routed.pipeline ? 'private' : 'remote';
            setBlocked("video", false);
            stopGeneration("video");
            await onSuccess({ status: 200, data: routed.result });
            return;
          }
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
          setBlocked("video", false);
          await onSuccess(res);
          return;
        }
        if (res.status === 403) return apply403ToReadiness(res);
        if (res.status === 409) {
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }
        setError("video", res?.data?.error, res.status);
      } catch (err) {
        setError("video", err?.message || "Network error");
      } finally {
        isLoading.value = false;
      }
    };

    const pickedImageName = ref("");
    const uploadedImageBase64 = ref("");
    const imageAspectRatio = ref("landscape"); // "landscape" or "portrait"

    const imagePreviewUrl = computed(() => {
      if (uploadedImageBase64.value)
        return "data:image/png;base64," + uploadedImageBase64.value;
      if (props.existingImageBase64)
        return "data:image/png;base64," + props.existingImageBase64;
      return "";
    });
    const hasAnyImage = computed(
      () => !!(uploadedImageBase64.value || props.existingImageBase64)
    );

    // Detect aspect ratio from image dimensions
    const detectImageAspectRatio = (base64) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const ratio = img.width >= img.height ? "landscape" : "portrait";
          imageAspectRatio.value = ratio;
          resolve(ratio);
        };
        img.onerror = () => {
          imageAspectRatio.value = "landscape";
          resolve("landscape");
        };
        img.src = "data:image/png;base64," + base64;
      });
    };

    const onImagePicked = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      pickedImageName.value = file.name;
      const b64 = await fileToBase64(file);
      uploadedImageBase64.value = String(b64).replace(
        /^data:image\/[a-zA-Z+]+;base64,/,
        ""
      );
      // Detect aspect ratio after image is loaded
      await detectImageAspectRatio(uploadedImageBase64.value);
    };
    const fileToBase64 = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

    let _lastRoutingMode = 'local';

    // /video/enhance is gated by the same _ensure_files_present_or_start
    // pre-flight as other pipelines: when ESRGAN weights are missing
    // and `auto_download:true`, the first POST returns 202 (download
    // accepted) without running the enhance. We need to wait for the
    // download to finish (small files, ~64 MB total) and retry. After
    // first run, weights are cached and the first POST succeeds.
    const callEnhanceWithRetry = async (videoPath) => {
      const body = JSON.stringify({
        video_path: videoPath,
        upscale: true,
        interp_factor: 4,
        variant: "default",
        auto_download: true,
      });
      for (let attempt = 0; attempt < 12; attempt++) {  // ≤ 60s wait window
        const r = await fetch(`${API_BASE}/video/enhance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (r.status === 202) {
          await new Promise((res) => setTimeout(res, 5000));
          continue;
        }
        if (!r.ok) {
          console.warn("[GenerativeVideo] Enhance failed:", r.status, await r.text());
          return null;
        }
        return await r.json();
      }
      console.warn("[GenerativeVideo] Enhance timed out waiting for weight download");
      return null;
    };

    // Per-inference enhance state. Map<inferenceId, true> while in flight.
    const enhancingIds = ref({});

    const enhanceInference = async (inference) => {
      const id = inference?.id;
      const data = inference?.answer?.data;
      if (!id || !data?.video_path || data?.enhanced || enhancingIds.value[id]) return;
      enhancingIds.value = { ...enhancingIds.value, [id]: true };
      try {
        const enh = await callEnhanceWithRetry(data.video_path);
        if (enh?.video_path) {
          const arr = inferences.value.slice();
          const idx = arr.findIndex((i) => i.id === id);
          if (idx >= 0) {
            arr[idx] = {
              ...arr[idx],
              answer: {
                ...arr[idx].answer,
                data: {
                  ...arr[idx].answer.data,
                  video_path: enh.video_path,
                  enhanced: true,
                  enhanced_from: data.video_path,
                  output_fps: enh.output_fps,
                  output_size: enh.output_size,
                },
              },
            };
            inferences.value = arr;
            persistInferences([...arr]);
          }
        }
      } finally {
        const next = { ...enhancingIds.value };
        delete next[id];
        enhancingIds.value = next;
      }
    };

    const sendMessage = async (prompt) => {
      if (!prompt) return;
      // For i2v mode, require an image
      if (mode.value === "i2v" && !hasAnyImage.value) return;
      if (!hasAccess.value) return;
      _lastRoutingMode = 'local';

      const isQuality = videoModel.value === "quality";

      // Size mappings: [height, width] for landscape orientation
      const ltxSizeMaps = {
        "480p":  [448, 640],
        "540p":  [512, 960],
        "720p":  [704, 1280],
        "1080p": [1088, 1920],
      };
      const wanSizeMaps = {
        // 640×480 (4:3 landscape) — default working resolution. Stored
        // as [h, w] like the other entries.
        "640x480": [480, 640],
        // 320×240 (4:3 landscape) — small-bracket preview between draft
        // and full 640×480.
        "320x240": [240, 320],
        // 240p draft preset: square 240×240 matches the M3 Max
        // benchmark in the published Wan workflow (~150-180s end-to-end
        // for 81 frames). Use this to iterate on prompt / negative /
        // framing before committing to a higher-res render.
        "240p":  [240, 240],
        "480p":  [320, 512],
        "540p":  [384, 672],
        "720p":  [480, 832],
        "1080p": [576, 1024],
      };

      const activeMaps = isQuality ? wanSizeMaps : ltxSizeMaps;
      let [h, w] = activeMaps[quality.value] || activeMaps["480p"];

      // For i2v mode, swap dimensions for portrait images
      // For t2v mode, default to landscape
      if (mode.value === "i2v" && imageAspectRatio.value === "portrait") {
        [h, w] = [w, h];
      }

      const frameRate = isQuality ? wanFps.value : fps.value;
      const frames = isQuality ? (duration.value * wanFps.value + 1) : (frameRate * duration.value + 1);

      const payload = isQuality
        ? {
            prompt: prompt,
            height: h,
            width: w,
            num_frames: frames,
            fps: wanFps.value,
            // QuantStack Q5_K_M GGUF + Lightning Seko V1 LoRA on top.
            // Locked to the distillation point: 4 steps + CFG 1.0.
            // Anything else produces broken output.
            num_inference_steps: 4,
            guidance_scale: 1.0,
            auto_download: true,
          }
        : {
            mode: mode.value,
            prompt: prompt,
            height: h,
            width: w,
            frames: frames,
            frame_rate: frameRate,
            steps: 10,
            guidance_scale: 1,
            auto_download: true,
          };

      // Include image for i2v mode (LTX-2) or always for Wan2.2 (I2V only)
      if (mode.value === "i2v" || isQuality) {
        payload.image_base64 =
          uploadedImageBase64.value || (props.existingImageBase64 || "").trim();
      }
      const url = `${API_BASE}${endpointForMode()}`;

      // Free GPU memory: unload local LLM + clear cached Flask models
      try {
        await window.electronAPI?.unloadModel?.();
        await fetch(`${API_BASE}/memory/clear`, { method: "POST" });
      } catch (e) {
        console.warn("[GenerativeVideo] Memory clear:", e.message);
      }

      ensureGenerationSocket();
      startGeneration("video"); // Initialize generation state
      const _genStart = Date.now();

      const onSuccess = async (response) => {
        // UPDATED: Check for video_url OR video_path
        if (response?.data?.video_path || response?.data?.video_url) {
          let finalData = response.data;

          // Auto-enhance: only meaningful for /video/quality (Wan) since LTX
          // already produces higher-FPS output. Chain Real-ESRGAN x4 + RIFE 4x
          // before surfacing the result so the inference card lands enhanced.
          if (isQuality && autoEnhance.value && finalData.video_path) {
            try {
              const enh = await callEnhanceWithRetry(finalData.video_path);
              if (enh?.video_path) {
                finalData = {
                  ...finalData,
                  video_path: enh.video_path,
                  enhanced: true,
                  enhanced_from: response.data.video_path,
                  output_fps: enh.output_fps,
                  output_size: enh.output_size,
                };
              }
            } catch (e) {
              console.warn("[GenerativeVideo] Enhance error:", e?.message || e);
            }
          }

          const elapsedMs = Date.now() - _genStart;
          const newInference = {
            question: `${mode.value}-i2v`,
            answer: { data: finalData },
            id: uuid(),
            model: isQuality ? 'wan2.2-14b' : 'ltx-2',
            elapsedMs,
            networkMode: _lastRoutingMode,
          };
          inferences.value = [...inferences.value, newInference];
          hasCopy.value = [...hasCopy.value, false];
          persistInferences([...inferences.value]);

          addVideoInference(
            `${mode.value}-i2v`,
            finalData.video_path || finalData.video_url,
            {
              pipeline: pipelineForMode(),
              duration: duration.value,
              fps: finalData.output_fps || fps.value,
              elapsed: elapsedMs / 1000,
              source: 'bonzai',
              networkMode: _lastRoutingMode,
              enhanced: !!finalData.enhanced,
            },
          );

          resetToFirstPage();
        }
      };
      await requestWithDownloadTracking(url, payload, onSuccess);
    };

    const { toClipboard } = useClipboard();
    const copy = async (txt) => {
      try {
        await toClipboard(txt);
      } catch {}
    };

    // Get video URL - use streaming endpoint for local files
    const getVideoUrl = (inference) => {
      const data = inference?.answer?.data;
      if (!data) return "";
      // Prefer HTTP streaming URL if already provided
      if (data.video_url) return data.video_url;
      // Use streaming endpoint for local file paths
      if (data.video_path) {
        if (/^https?:\/\//i.test(data.video_path)) return data.video_path;
        // Use the streaming endpoint for local files
        return `${API_BASE}/media/stream?path=${encodeURIComponent(data.video_path)}`;
      }
      return "";
    };

    // Convert local path to streaming URL
    const fileUrl = (p) => {
      if (!p) return "";
      if (/^https?:\/\//i.test(p)) return p;
      return `${API_BASE}/media/stream?path=${encodeURIComponent(p)}`;
    };

    const downloadVideo = async (idx) => {
      const data = inferences.value[idx]?.answer?.data;
      if (!data) return;
      const path = data.video_path;
      if (!path) return;
      const defaultName =
        path.split("/").pop() || `bonzai-video-${Date.now()}.mp4`;
      const result = await window.electronAPI?.saveVideo?.(defaultName, path);
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
        await window.electronAPI?.store?.set?.("videoInferences", []);
      } catch (e) {
        console.error("Failed to clear video inferences:", e);
      }
    };

    const exportHistory = () => {
      if (!inferences.value || inferences.value.length === 0) return;
      const data = JSON.stringify(inferences.value, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-video-history-${Date.now()}.json`;
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

    // Set copy state for an index (works with shallowRef)
    const setCopied = (index) => {
      const newHasCopy = [...hasCopy.value];
      newHasCopy[index] = true;
      hasCopy.value = newHasCopy;
      setTimeout(() => {
        const reset = [...hasCopy.value];
        reset[index] = false;
        hasCopy.value = reset;
      }, 2000);
    };

    const loadHistory = async () => {
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "videoInferences",
          []
        );
        if (Array.isArray(saved)) {
          inferences.value = saved;
          hasCopy.value = new Array(saved.length).fill(false);
        }
      } catch {}
    };

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

    onMounted(async () => {
      ensureGenerationSocket();
      await resumeActiveDownloadIfAny();
      await loadHistory();
      await probeCurrentMode();
      // Setup scroll observer after DOM is rendered
      setTimeout(setupScrollObserver, 100);
      // Attach scroll listener for scroll-to-top button
      const container = document.querySelector(".models__deployment-install");
      if (container) {
        scrollContainer.value = container;
        container.addEventListener("scroll", handleScroll, { passive: true });
      }

      // Check for pending image-to-video from roleplay chat
      const pendingImage = sessionStorage.getItem('pendingI2VImage');
      if (pendingImage) {
        sessionStorage.removeItem('pendingI2VImage');
        // Extract base64 from data URL
        const base64Match = pendingImage.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (base64Match) {
          uploadedImageBase64.value = base64Match[1];
          await detectImageAspectRatio(uploadedImageBase64.value);
          console.log('[GenerativeVideo] Loaded pending image from roleplay chat');
        }
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

    // Re-probe when switching between fast (LTX-2) and quality (Wan2.2)
    watch(videoModel, (newModel) => {
      // Reset duration and quality to mode-appropriate defaults.
      // Quality (Wan) defaults to 640×480 / 5s; fast (LTX-2) goes to
      // its own 480p preset.
      duration.value = 5;
      quality.value = newModel === "quality" ? "640x480" : "480p";
      probeCurrentMode();
    });

    // Unified action descriptors for the video history items, fed
    // into <GenerativeActions>. Replaces 5 inline Bulma buttons.
    const actionsFor = (inference) => {
      const hasVideo = !!inference?.answer?.data?.video_path;
      const enhanced = !!inference?.answer?.data?.enhanced;
      const enhancing = !!enhancingIds[inference.id];
      const minted = !!inference?.nft;
      return [
        { id: "download", icon: "save", label: "Download", variant: "primary", disabled: !hasVideo, title: "Save video" },
        { id: "copy",     icon: hasCopy[inference._originalIndex] ? "check" : "content_copy",
          label: hasCopy[inference._originalIndex] ? "Copied" : "Reuse",
          title: "Reuse this prompt", variant: "default" },
        { id: "enhance",
          icon: enhanced ? "check_circle" : (enhancing ? "progress_activity" : "high_quality"),
          label: enhanced ? "Enhanced" : (enhancing ? "Enhancing…" : "Upscale ×4"),
          variant: enhanced ? "success" : "default",
          disabled: enhanced || enhancing || !hasVideo,
          title: enhanced ? "Already enhanced (×4 spatial + 4× temporal)" : "Upscale ×4 + interpolate to 4× framerate" },
        { id: "mint",
          icon: minted ? "check_circle" : "token",
          label: minted ? "Minted" : "Mint",
          variant: minted ? "success" : "default",
          disabled: minted },
        { id: "delete",
          icon: "delete",
          label: "Delete",
          variant: "destructive",
          title: "Remove this result" },
      ];
    };
    const handleAction = (id, inference) => {
      switch (id) {
        case "download": downloadVideo(inference._originalIndex); break;
        case "copy":
          form.prompt = inference.question;
          copy(inference.question);
          setCopied(inference._originalIndex);
          scrollToTop();
          break;
        case "enhance": enhanceInference(inference); break;
        case "mint":    openMint(inference); break;
        case "delete":  removeInference(inference._originalIndex); break;
      }
    };

    return {
      mode,
      videoModel,
      quality,
      duration,
      fps,
      wanFps,
      autoEnhance,
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
      readiness,
      showUpdateCTA,
      generation,
      generationPctRounded,
      generationPctClamped,
      downloads,
      downloadTaskList,
      onImagePicked,
      pickedImageName,
      hasAnyImage,
      imagePreviewUrl,
      imageAspectRatio,
      // access control
      accessRef,
      hasAccess,
      onAccessChanged,
      canGenerateWithAccess,
      canGenerate,
      // actions
      sendMessage,
      copy,
      setCopied,
      downloadVideo,
      removeInference,
      actionsFor,
      handleAction,
      clearHistory,
      exportHistory,
      importHistory,
      prefetchForMode,
      cancelCurrentPipeline,
      retryCurrentPipeline,
      probeCurrentMode,
      fileUrl,
      getVideoUrl,
      // Network modal
      requestOpenNetworkModal,
      // NFT Minting
      mintTarget,
      openMint,
      onMinted,
      // Enhance (Real-ESRGAN x4 + RIFE 4x)
      enhanceInference,
      enhancingIds,
    };
  },
};
</script>

<style scoped>
/* Spinner for the Upscale CTA while /video/enhance is in flight */
.is-rotating {
  animation: spin 1s linear infinite;
  display: inline-block;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Fonts imported from App.vue for offline mode */
.generation {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1;
  opacity: 0.9;
}
.notification {
  padding: 1.25rem 1.5rem 1.25rem 1.5rem;
}
.preview {
  box-shadow: 8px 8px 0 var(--bz-purple-glow);
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
  background: url("../assets/bonzai_video.webp") no-repeat;
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

.generated__video {
  width: 100%;
  height: auto;
  max-height: var(--bz-content-max-h);
  object-fit: contain;
  border-radius: var(--bz-content-radius);
  display: block;
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
label.radio.quality,
label.radio.duration,
label.radio.fps {
  margin: 0 3px;
  padding: 6px 12px;
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 600;
  font-size: 14px;
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
  top: -3em;
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
  top: -3em;
  right: -1.25em;
  opacity: 0.5;
}

.history-item {
  animation: bz-fade-rise 600ms var(--bz-ease-out) forwards;
  opacity: 0;
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

/* ════════════════════════════════════════════════════════════════
    Phase 3 — cinematic content-first (Runway-style).
    Hero video is full-bleed edge-to-edge with metadata overlay.
    History wraps into a 2-column grid with minimal chrome.
    ════════════════════════════════════════════════════════════════ */

ol.chat {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bz-space-5);
  list-style: none;
  padding: 0;
  margin: var(--bz-space-5) 0;
}

/* Hero */
ol.chat .history-item:first-child {
  grid-column: 1 / -1;
}
ol.chat .history-item:first-child .question {
  background: transparent;
  border: none;
  padding: 0;
  border-radius: 0;
}
ol.chat .history-item:first-child video {
  max-height: 85vh;
  width: 100%;
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: var(--bz-r-sm);
}
/* Bottom scrim for overlay controls */
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
ol.chat .history-item:first-child .bz-origin-pill {
  background: rgba(0, 0, 0, 0.65);
  border-color: transparent;
  color: var(--bz-fg);
  backdrop-filter: blur(4px);
}

/* History grid */
@media (min-width: 880px) {
  ol.chat { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  ol.chat .history-item:first-child { grid-column: 1 / -1; }
}
ol.chat .history-item:not(:first-child) .question {
  padding: var(--bz-space-3);
}
ol.chat .history-item:not(:first-child) video {
  width: 100%;
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: var(--bz-r-sm);
}

.bz-img-meta {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  margin: var(--bz-space-3) 0;
}
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
.bz-origin-pill--consumer { color: var(--bz-info); border-color: var(--bz-info-soft); }
.bz-origin-pill--consumer .bz-origin-pill__dot { background: var(--bz-info); }
.bz-origin-pill--private  { color: var(--bz-purple-300); border-color: var(--bz-border-brand); background: var(--bz-purple-soft); }
.bz-origin-pill--private .bz-origin-pill__dot { background: var(--bz-purple-300); }
</style>
