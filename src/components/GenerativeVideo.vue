<template>
  <div class="background"></div>
  <div class="bz-tab-shell">
    <div class="models__deployment-install bz-page-content">
      <div class="columns">
        <div class="column is-12">
          <header class="bz-screen-header bz-page-header">
            <div class="bz-screen-titleblock">
              <p class="bz-eyebrow">{{ $t('create.eyebrow') }}</p>
                <h1 class="bz-h1 fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined bz-title-icon"
                    aria-hidden="true"
                  >
                    movie
                  </span>
                  {{ $t('create.videoTitle') }}
                </h1>
            </div>
          </header>

          <!-- GENERATION PROGRESS -->
          <div
            v-if="generation && generation.active"
            class="video-progress-card"
          >
            <div class="video-progress-card__head">
              <span class="video-progress-card__title video-progress-card__title--pill fira-sans-condensed-black-italic">
                <BonzaiPulse variant="dot" />
                {{ generationStageLabel }}
              </span>
              <span class="video-progress-card__pct fira-sans-condensed-black-italic">
                {{ generationPctRounded }}%
              </span>
            </div>
            <BonzaiPulse variant="bar" :percent="generationPctClamped" />
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <div v-if="remoteMedia" class="video-control-stack">
                  <div class="video-control-row"><span class="bz-eyebrow">Duration</span><ModeChipBar v-model="duration" :items="remoteVideoOptions.durations.map(value => ({ value, label: `${value}s` }))" compact /></div>
                  <div class="video-control-row"><span class="bz-eyebrow">Aspect Ratio</span><ModeChipBar v-model="remoteRatio" :items="remoteVideoOptions.ratios.map(value => ({ value, label: value }))" compact /></div>
                  <div class="video-control-row"><span class="bz-eyebrow">Resolution</span><ModeChipBar v-model="remoteResolution" :items="remoteVideoOptions.resolutions.map(value => ({ value, label: value }))" compact /></div>
                  <div class="video-control-row"><span class="bz-eyebrow">Mode</span><ModeChipBar v-model="mode" :items="videoModeItems" compact /></div>
                </div>
                <div v-else class="video-control-stack">
                  <div class="video-control-row">
                    <span class="bz-eyebrow">{{ $t('create.quality') }}</span>
                    <ModeChipBar v-model="videoModel" :items="videoModelItems" compact />
                  </div>
                  <div v-if="videoModel !== 'quality'" class="video-control-row">
                    <span class="bz-eyebrow">{{ $t('create.mode') }}</span>
                    <ModeChipBar v-model="mode" :items="videoModeItems" compact />
                  </div>
                  <div v-else class="video-control-row">
                    <span class="bz-eyebrow">{{ $t('create.mode') }}</span>
                    <span class="bz-pill">Image to video only</span>
                  </div>
                  <div class="video-control-row">
                    <span class="bz-eyebrow">{{ $t('create.duration') }}</span>
                    <ModeChipBar v-model="duration" :items="durationItems" compact />
                  </div>
                  <div class="video-control-row">
                    <span class="bz-eyebrow">FPS</span>
                    <ModeChipBar
                      v-if="videoModel === 'fast'"
                      v-model="fps"
                      :items="fpsItems"
                      compact
                    />
                    <span v-else-if="videoModel === 'sota'" class="bz-pill">24fps + audio</span>
                    <ModeChipBar
                      v-else
                      v-model="wanFps"
                      :items="wanFpsItems"
                      compact
                    />
                  </div>
                  <div class="video-control-row">
                    <span class="bz-eyebrow">Resolution</span>
                    <ModeChipBar v-model="quality" :items="qualityItems" compact />
                  </div>
                </div>

                <DownloadRequirement category="video"
                  v-if="!remoteMedia && (showUpdateCTA || downloads.active)"
                  :items="[...readiness.repoDetails, ...readiness.ggufNames]"
                  :active="downloads.active"
                  cancellable
                  :cancelling="isCancellingDownloads"
                  @cancel="cancelCurrentPipeline"
                  :progress="downloads.total_progress || downloads.progress || 0"
                  :tasks="downloadTaskList"
                  :disabled="readiness.authRequired"
                  :error="readiness.authRequired ? $t('rcDownloads.authRequired') : downloads.status === 'failed' ? $t('rcDownloads.downloadFailed') : ''"
                  @download="prefetchForMode"
                />

                <!-- GENERATION ERROR -->
                <div
                  v-else-if="generation && generation.error"
                  class="video-notice video-notice--danger"
                >
                  <div class="video-notice__body">
                    <strong class="video-notice__title fira-sans-condensed-black-italic">Generation failed</strong>
                    <span>{{ generation.error }}</span>
                  </div>
                </div>
                <!-- IMAGE PICKER (only for I2V mode) -->
                <div v-if="mode === 'i2v' || videoModel === 'quality'" class="video-image-picker">
                  <div class="video-image-picker__input file is-fullwidth is-medium">
                    <label class="file-label video-image-picker__label">
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
                        <span class="file-label">
                          {{ pickedImageName || 'Browse image' }}
                        </span>
                      </span>
                    </label>
                  </div>

                  <div class="video-image-picker__preview" v-if="imagePreviewUrl">
                    <img
                      :src="imagePreviewUrl"
                      class="video-image-picker__image"
                      alt="preview"
                    />
                  </div>
                </div>

                <!-- ACCESS REQUIREMENTS -->
                <p v-if="remoteMedia" class="bz-eyebrow">OpenRouter · {{ remoteInference.mediaModels?.video }}</p>
          <AccessRequirements v-if="!remoteMedia"
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
                  :disabled="!canGenerate || (!remoteMedia && !hasAccess)"
                  shortcut-hint="⌘⏎"
                  @submit="sendMessage(form.prompt)"
                >
                  <template #before-submit><GenerationDrafts kind="video" :controller="generationDraft" :disabled="isLoading" /></template>
                  <template #tools>
                    <button v-if="hasAnyImage" type="button" class="bz-btn bz-btn--sm bz-btn--ghost video-prompt-create" :disabled="isEnhancingPrompt || isLoading" @click="createVideoPrompt">
                      <span class="material-symbols-outlined" aria-hidden="true">movie_edit</span>{{ $ui(isEnhancingPrompt ? 'Creating prompt…' : 'Create Video Prompt') }}
                    </button>
                    <span v-if="promptFeedback" role="status" class="video-prompt-feedback">{{ $ui(promptFeedback) }}</span>
                    <button
                      type="button"
                      class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                      :class="{ 'bz-btn--running': isEnhancingPrompt }"
                      :disabled="isEnhancingPrompt || !form.prompt.trim()"
                      title="Rewrite prompt for LTX/Wan video models"
                      @click="enrichPrompt"
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">auto_fix_high</span>
                      {{ isEnhancingPrompt ? 'Enriching' : 'Enrich prompt' }}
                    </button>
                  </template>
                </GenerativeInput>
              </div>
            </div>
            <hr class="mt-5" />

            <!-- GENERATION HISTORY HEADER -->
            <div class="level pt-5 mt-5">
              <div class="level-left">
                <div class="level-item">
                  <h2 class="bz-h2 fira-sans-condensed-black-italic" v-if="inferences">
                    <span class="material-symbols-outlined bz-section-icon">
                      history
                    </span>
                    Generation History
                  </h2>
                </div>
              </div>
              <div class="level-right">
                <div class="level-item buttons">
                  <RoleplayHistoryToggle v-model="includeRoleplay" />
<button
                    type="button"
                    class="bz-iconbtn"
                    title="Import history"
                    aria-label="Import history"
                    @click="importHistory()"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">upload</span>
                  </button>
                  <button
                    type="button"
                    class="bz-iconbtn"
                    title="Export history"
                    aria-label="Export history"
                    @click="exportHistory()"
                    :disabled="!inferences || inferences.length === 0"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">download</span>
                  </button>
                  <button
                    type="button"
                    class="bz-iconbtn bz-iconbtn--danger"
                    title="Clear history"
                    aria-label="Clear history"
                    @click="clearHistory()"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">
                      ink_eraser
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <div class="mt-5">
              <!-- GENERATION HISTORY HEADER -->
              <div>
                <div
                  v-if="reversedInferences.length"
                  ref="masonryGridRef"
                  class="bz-video-masonry"
                  :style="{ '--bz-video-masonry-columns': masonryColumns.length }"
                >
                <ol
                  v-for="(column, columnIndex) in masonryColumns"
                  :key="columnIndex"
                  class="bz-video-masonry__column"
                >
                  <li
                    v-for="entry in column"
                    :key="entry.inference.id || entry.inference._originalIndex"
                    class="history-item"
                    :style="{
                      animationDelay: `${Math.min(entry.displayIndex * 35, 240)}ms`,
                    }"
                  >
                    <div class="question">
                      <!-- Video Player - UPDATED: Use HTTP streaming URL -->
                      <video
                        v-if="getVideoUrl(entry.inference)"
                        :src="getVideoUrl(entry.inference)"
                        controls
                        class="generated__video"
                        preload="metadata"
                        playsinline
                        :style="videoAspectStyle(entry.inference)"
                      ></video>
                      <div class="bz-img-meta" v-if="entry.inference.networkMode && entry.inference.networkMode !== 'local'">
                        <span class="bz-origin-pill" :class="`bz-origin-pill--${entry.inference.networkMode}`">
                          <span class="bz-origin-pill__dot"></span>
                          {{ entry.inference.networkMode === 'private' ? 'Private' : 'Remote' }}
                        </span>
                      </div>
                      <p v-if="enhancementStatus[entry.inference.id]?.stage === 'downloading' && !enhancementErrors[entry.inference.id]"
                         class="bz-video-enhance-status" role="status">
                        {{ $t('rcDownloads.downloading') }} SeedVR2 · {{ enhancementStatus[entry.inference.id].percent }}%
                      </p>
                      <p v-if="enhancementErrors[entry.inference.id] || entry.inference.answer?.data?.enhancement_error" class="bz-video-enhance-status bz-video-enhance-status--error" role="alert">
                        {{ enhancementErrors[entry.inference.id] || entry.inference.answer?.data?.enhancement_error }}
                      </p>
                      <GenerativeActions
                        :actions="actionsFor(entry.inference)"
                        @action="(id) => handleAction(id, entry.inference)"
                      />
                    </div>
                  </li>
                </ol>
                </div>

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

  <div v-if="showH3Terms" ref="h3Dialog" class="bz-h3-terms" role="dialog" aria-modal="true" aria-labelledby="h3-terms-title">
    <div class="bz-h3-terms__panel">
      <span class="material-symbols-outlined bz-h3-terms__mark" aria-hidden="true">movie</span>
      <h2 id="h3-terms-title" class="bz-h2 fira-sans-condensed-black-italic">MiniMax H3</h2>
      <p>
        H3 is a third-party model governed by the MiniMax H3 Community License and acceptable-use restrictions.
        Generated video and audio remain on this device. Quantized weights and standalone VAEs are Unsloth
        derivatives and are not an official MiniMax product.
      </p>
      <label class="bz-h3-terms__check">
        <input v-model="h3TermsChecked" type="checkbox" />
        <span>I have read and agree to the model terms.</span>
      </label>
      <a
        href="https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE"
        target="_blank"
        rel="noreferrer"
      >Read the license</a>
      <a
        href="https://huggingface.co/unsloth/MiniMax-H3-GGUF/blob/main/NOTICE"
        target="_blank"
        rel="noreferrer"
      >Read the Unsloth notice</a>
      <div class="bz-h3-terms__actions">
        <button type="button" class="bz-btn bz-btn--ghost" @click="showH3Terms = false">Cancel</button>
        <button type="button" class="bz-btn bz-btn--primary" :disabled="!h3TermsChecked" @click="acceptH3Terms">
          Agree and continue
        </button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="pendingDelete" class="bz-confirmation-backdrop" aria-hidden="true"></div>
    <Transition name="bz-image-toast">
    <div
      v-if="pendingDelete"
      class="bz-image-delete-toast"
      role="status"
      aria-live="polite"
    >
      <span class="material-symbols-outlined" aria-hidden="true">delete</span>
      <span class="bz-image-delete-toast__body">
        {{ pendingDelete.all ? 'Clear video history?' : 'Delete this video?' }}
      </span>
      <button type="button" class="bz-image-delete-toast__ghost" @click="dismissDeleteToast">
        Cancel
      </button>
      <button type="button" class="bz-image-delete-toast__danger" @click="confirmDeleteVideo">
        {{ pendingDelete.all ? 'Clear' : 'Delete' }}
      </button>
    </div>
  </Transition>
  </Teleport>
</template>

<script>
import GenerationDrafts from "./generative/GenerationDrafts.vue";
import { useGenerationDraft } from "../composables/useGenerationDraft.js";
import { videoPromptInstruction } from '../services/videoPrompt.js';
import { userFacingError } from '../services/userFacingError.js';
import { remoteMediaEnabled, remoteInference, refreshRemoteInference } from '../stores/remoteInference.js';
import RoleplayHistoryToggle from './RoleplayHistoryToggle.vue';
import {
  ref,
  reactive,
  shallowRef,
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  watch,
  toRefs,
} from "vue";
import { v4 as uuid } from "uuid";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { videoReuseSettings } from "../services/videoReuse.js";
import { enhanceVideo, videoEnhanceSource } from "../services/videoEnhance.js";
import { io } from "socket.io-client";
import { useInferenceRouter } from "../composables/useInferenceRouter.js";
import AccessRequirements from "./AccessRequirements.vue";
import { recordedMintGeneration } from "../services/mintValidation.js";
import MintModal from "./MintModal.vue";
import BonzaiPulse from "./BonzaiPulse.vue";
import DownloadRequirement from "./DownloadRequirement.vue";
import { cancelLocalDownloads } from "../services/downloadCancellation.js";
import GenerativeActions from "./generative/GenerativeActions.vue";
import GenerativeInput from "./generative/GenerativeInput.vue";
import ModeChipBar from "./generative/ModeChipBar.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { addVideoInference } from "../stores/inferenceStore.js";
import { inspector } from "../services/generationInspector.service.js";
import { generationElapsedMs, formatGenerationTime } from "../shared/generationTiming.js";
import { useModalAccessibility } from '../composables/useModalAccessibility.js';
import { i18n } from '../i18n/index.js';

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
  components: { GenerationDrafts, RoleplayHistoryToggle, DownloadRequirement, AccessRequirements, MintModal, BonzaiPulse, GenerativeActions, GenerativeInput, ModeChipBar },
  props: { existingImageBase64: { type: String, default: "" } },
  setup(props) {
    const { inferenceRequest } = useInferenceRouter();
    refreshRemoteInference().catch(() => {});
    const remoteMedia = computed(() => remoteMediaEnabled('video'));
    const remoteVideoOptions = reactive({ durations: [], ratios: [], resolutions: [] });
    const remoteRatio = ref('16:9'), remoteResolution = ref('');
    onMounted(() => {
      watch(() => remoteMedia.value && remoteInference.mediaModels?.video, async id => {
        if (!id) return;
        try {
          const item = (await window.electronAPI.openRouter.mediaModels('video')).find(m => m.id === id);
          if (!item) return;
          remoteVideoOptions.durations = item.supported_durations || [];
          remoteVideoOptions.ratios = item.supported_aspect_ratios || [];
          remoteVideoOptions.resolutions = item.supported_resolutions || [];
          if (!remoteVideoOptions.durations.includes(duration.value)) duration.value = remoteVideoOptions.durations[0] || 5;
          if (!remoteVideoOptions.ratios.includes(remoteRatio.value)) remoteRatio.value = remoteVideoOptions.ratios[0] || '16:9';
          remoteResolution.value = remoteVideoOptions.resolutions[0] || '';
        } catch (error) { setError('video', error.message); }
      }, { immediate: true });
    });

    // ------------ NFT Minting ---------
    const mintTarget = ref(null);

    let mintSelectionRequest = 0;
    const openMint = async (inference) => {
      const request = ++mintSelectionRequest;
      const videoPath = inference.answer?.data?.video_path;
      let content = getVideoUrl(inference);
      if (videoPath && !/^(?:https?:|bonzai-blob:|data:|file:)/i.test(videoPath) && window.electronAPI?.readFileAsBase64) {
        try {
          content = await window.electronAPI.readFileAsBase64(videoPath);
        } catch (e) {
          console.warn('[GenerativeVideo] Could not read video file:', e);
        }
      }
      if (request !== mintSelectionRequest) return;
      mintTarget.value = {
        inferenceType: 'video',
        inferenceId: inference.id,
        content,
        contentType: inference.answer?.data?.mime_type || (/\.webm(?:$|[?#])/i.test(content || videoPath || '') ? 'video/webm' : 'video/mp4'),
        prompt: inference.question,
        generation: recordedMintGeneration(inference, {
          type: inference.question?.startsWith('i2v') ? 'image-to-video' : 'text-to-video',
          model: inference.model || 'ltx-2',
          timestamp: inference.timestamp,
          elapsedMs: inference.elapsedMs || null,
        }),
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
    const showH3Terms = ref(false);
    const h3Dialog = ref(null);
    useModalAccessibility(h3Dialog, { onClose: () => { showH3Terms.value = false; } });
    const h3TermsChecked = ref(false);
    const h3TermsAccepted = ref(localStorage.getItem("bonzai:minimax-h3-terms") === "accepted");
    const acceptH3Terms = () => {
      if (!h3TermsChecked.value) return;
      localStorage.setItem("bonzai:minimax-h3-terms", "accepted");
      h3TermsAccepted.value = true;
      showH3Terms.value = false;
    };
    // Default to 640×480 (4:3 landscape) for Wan/quality mode — solid
    // working resolution. 240p Draft is still available one click away
    // for fast prompt iteration. LTX (fast) mode overrides this to
    // 480p in the watch() below since 640x480 isn't an LTX preset.
    const quality = ref("640x480");
    const duration = ref(5);       // seconds: default 5s
    const fps = ref(12);           // 12 or 24 (default 12fps for memory efficiency)
    const wanFps = ref(16);         // 8 or 16 (default 16fps for Wan2.2)
    // Auto-enhance: chain /video/enhance (SeedVR2 detail restoration) after
    // /video/quality completes. Default off; cost depends on size and device.
    const autoEnhance = ref(false);
    const reusedSampling = ref({});
    const videoModelItems = [
      { value: "fast", label: "Turbo", icon: "bolt" },
      { value: "quality", label: "Quality", icon: "auto_awesome" },
      { value: "sota", label: "Max", icon: "movie" },
    ];
    const videoModeItems = [
      { value: "t2v", label: "From Prompt", icon: "text_fields" },
      { value: "i2v", label: "From Image", icon: "image" },
    ];
    const fastDurationItems = [
      { value: 2, label: "2s" },
      { value: 3, label: "3s" },
      { value: 5, label: "5s" },
      { value: 10, label: "10s" },
      { value: 15, label: "15s" },
      { value: 30, label: "30s" },
      { value: 60, label: "60s" },
    ];
    const qualityDurationItems = [
      { value: 2, label: "2s" },
      { value: 3, label: "3s" },
      { value: 5, label: "5s" },
      { value: 10, label: "10s" },
      { value: 15, label: "15s" },
      { value: 30, label: "30s" },
      { value: 60, label: "60s" },
    ];
    const fpsItems = [
      { value: 12, label: "12fps" },
      { value: 24, label: "24fps" },
      { value: 48, label: "48fps" },
    ];
    const wanFpsItems = [
      { value: 8, label: "8fps" },
      { value: 16, label: "16fps" },
      { value: 24, label: "24fps" },
    ];
    const fastQualityItems = [
      { value: "480p", label: "480p" },
      { value: "540p", label: "540p" },
      { value: "720p", label: "720p" },
      { value: "1080p", label: "1080p" },
    ];
    const qualityQualityItems = [
      { value: "320x240", label: "320x240" },
      { value: "512x320", label: "512x320" },
      { value: "640x480", label: "640x480" },
      { value: "832x640", label: "832x640" },
      { value: "1024x576", label: "1024x576" },
    ];
    const sotaQualityItems = [
      { value: "256x256", label: "256x256" },
      { value: "512x288", label: "512x288" },
      { value: "640x384", label: "640x384" },
      { value: "960x544", label: "960x544" },
    ];
    const durationItems = computed(() =>
      videoModel.value === "sota"
        ? fastDurationItems.filter((item) => item.value >= 5 && item.value <= 15)
        : videoModel.value === "quality" ? qualityDurationItems : fastDurationItems,
    );
    const qualityItems = computed(() =>
      videoModel.value === "sota"
        ? sotaQualityItems
        : videoModel.value === "quality" ? qualityQualityItems : fastQualityItems,
    );
    const isLoading = ref(false);
    const isEnhancingPrompt = ref(false);
    const form = reactive({ prompt: "" });
    const pendingDelete = ref(null);
    let pendingDeleteTimer = null;
    // Use shallowRef for inferences - video data is large
    const includeRoleplay = ref(localStorage.getItem('bonzai:history:roleplay') !== 'false');
    watch(includeRoleplay, value => { localStorage.setItem('bonzai:history:roleplay', String(value)); displayedCount.value = 12; });
    const inferences = shallowRef([]);
    const hasCopy = shallowRef([]);
    const planReq = reactive({ controller: null, seq: 0 });

    // ------------ lazy loading pagination ----------------
    const ITEMS_PER_PAGE = 5;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const masonryGridRef = ref(null);
    const masonryColumnCount = ref(3);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);
    let masonryGridResizeObserver = null;

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
        .filter((item) => item && (includeRoleplay.value || item.source !== 'roleplay') && (item.answer?.data?.video_path || item.answer?.data?.video_url));

      console.log(`[GenerativeVideo] ${inferences.value.length} total, ${normalized.length} valid`);
      return normalized
        .reverse();
    });

    // Displayed inferences (lazy loaded subset)
    const paginatedInferences = computed(() => {
      return reversedInferences.value.slice(0, displayedCount.value);
    });

    const estimateVideoRatio = (inference) => {
      const data = inference?.answer?.data || {};
      const width = Number(data.width || data.video_width || inference?.width || 0);
      const height = Number(data.height || data.video_height || inference?.height || 0);
      if (width > 0 && height > 0) return height / width;
      const q = String(data.quality || inference?.quality || quality.value || "");
      if (/1080|720|540|480p/i.test(q)) return 9 / 16;
      if (/640x480|320x240/i.test(q)) return 3 / 4;
      if (/240x240/i.test(q)) return 1;
      return 9 / 16;
    };

    const videoAspectStyle = (inference) => {
      const data = inference?.answer?.data || {};
      const width = Number(data.width || data.video_width || inference?.width || 0);
      const height = Number(data.height || data.video_height || inference?.height || 0);
      if (width > 0 && height > 0) return { aspectRatio: `${width} / ${height}` };
      const ratio = estimateVideoRatio(inference);
      if (ratio > 0) return { aspectRatio: `1 / ${ratio}` };
      return null;
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
        heights[columnIndex] += estimateVideoRatio(inference) + 0.16;
      });

      return columns;
    });

    const updateMasonryColumnCount = () => {
      const width =
        masonryGridRef.value?.clientWidth ||
        document.querySelector(".models__deployment-install")?.clientWidth ||
        window.innerWidth;
      const nextCount = width >= 1320 ? 3 : width >= 860 ? 2 : 1;
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

    // Check if there are more items to load
    const hasMore = computed(
      () => displayedCount.value < reversedInferences.value.length
    );

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          reversedInferences.value.length
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
      () => (remoteMedia.value || hasAccess.value) && !isLoading.value
    );

    // Can generate: for t2v mode, just need access; for i2v/quality mode, also need an image
    const canGenerate = computed(() => {
      if (isLoading.value) return false;
      if (!remoteMedia.value && videoModel.value === "quality") return hasAnyImage.value; // Wan2.2 is always I2V
      if (mode.value === "t2v") return true;
      return hasAnyImage.value;
    });

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
    });

    // Use shared generation store for persistent state across view navigation
    const generation = computed(() => generationStore.state.video);
    const generationStageLabel = computed(() => {
      const stage = String(generation.value?.stage || '').toLowerCase();
      const key = /load|start|prepar|queue/.test(stage) ? 'preparing'
        : /prompt|keyframe/.test(stage) ? 'encoding'
        : /decod/.test(stage) ? 'decoding'
        : /sav|export|final|complete/.test(stage) ? 'saving'
        : 'generating';
      return i18n.t(`rc.creation.${key}`);
    });

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

    const endpointForMode = () => ({
      fast: "/video",
      sota: "/video/sota",
      quality: "/video/quality",
    })[videoModel.value];
    const pipelineForMode = () => ({
      fast: "video_fast",
      sota: "video_sota",
      quality: "video_quality",
    })[videoModel.value];

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

    const trackedDownloadPipelines = new Set();
    const cancelledDownloadPipelines = new Set();
    const isCancellingDownloads = ref(false);

    const applyPipelineUpdate = (p) => {
      if (!p || isCancellingDownloads.value || cancelledDownloadPipelines.has(p.pipeline_id)) return;
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
      trackedDownloadPipelines.add(pipelineId);
      cancelledDownloadPipelines.delete(pipelineId);
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
      "video_sota", "minimax_h3",
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
      if (isCancellingDownloads.value) return;
      const pipelineIds = [...trackedDownloadPipelines];
      if (!pipelineIds.length && downloads.pipelineId) pipelineIds.push(downloads.pipelineId);
      if (!pipelineIds.length) return;
      isCancellingDownloads.value = true;
      try {
        await cancelLocalDownloads({ pipelineIds, apiBase: API_BASE });
        pipelineIds.forEach(id => cancelledDownloadPipelines.add(id));
        trackedDownloadPipelines.clear();
        downloads.status = "cancelled";
        downloads.active = false;
      } catch { downloads.status = "failed"; }
      finally { isCancellingDownloads.value = false; }
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
      readiness.ggufNames = [];
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
          if (Array.isArray(res.data?.pipelines_started)) {
            res.data.pipelines_started.forEach(id => trackedDownloadPipelines.add(id));
          }
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
          if (Array.isArray(res.data?.pipelines_started)) {
            res.data.pipelines_started.forEach(id => trackedDownloadPipelines.add(id));
          }
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

    const useExistingImage = ref(true);
    const effectiveImage = computed(() => uploadedImageBase64.value ||
      (useExistingImage.value ? props.existingImageBase64.trim().replace(/^data:image\/[^;]+;base64,/, "") : ""));
    watch(() => props.existingImageBase64, () => { useExistingImage.value = true; });

    const imagePreviewUrl = computed(() => {
      return effectiveImage.value ? "data:image/png;base64," + effectiveImage.value : "";
    });
    const hasAnyImage = computed(() => !!effectiveImage.value);

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

    const stripReasoningTags = (value) =>
      String(value || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<\/?(?:think|thinking|reasoning|analysis|reflection)\b[^>]*>/gi, "")
        .trim();

    const promptFeedback = ref('');
    const createVideoPrompt = async () => {
      if (!effectiveImage.value || isEnhancingPrompt.value || isLoading.value) return;
      const image = effectiveImage.value;
      const originalPrompt = form.prompt;
      const originalDuration = duration.value;
      isEnhancingPrompt.value = true;
      promptFeedback.value = '';
      try {
        const instruction = videoPromptInstruction({ duration: originalDuration, direction: originalPrompt });
        let response;
        if (remoteMediaEnabled('vision')) {
          const routed = await inferenceRequest('vision', { image_base64: image, prompt: instruction });
          if (!routed?.ok) throw new Error(routed?.error || 'Could not analyze the reference image. Please try again.');
          response = routed.result;
        } else {
          response = await window.electronAPI.analyzeLocalImage({ image_base64: image, prompt: instruction, max_tokens: 650 });
        }
        const result = stripReasoningTags(typeof response === 'string' ? response : response?.text || '');
        if (!result) throw new Error('No video prompt was returned. Please try again.');
        if (effectiveImage.value !== image || form.prompt !== originalPrompt || duration.value !== originalDuration) {
          promptFeedback.value = 'Your inputs changed. Create a new prompt from the current scene.';
          return;
        }
        form.prompt = result;
      } catch (error) {
        console.warn('[Video] Image prompt failed:', error);
        promptFeedback.value = userFacingError(error, 'Could not create a video prompt. Please try again.');
      } finally { isEnhancingPrompt.value = false; }
    };

    const enrichPrompt = async () => {
      const promptText = form.prompt.trim();
      if (!promptText || isEnhancingPrompt.value) return;
      isEnhancingPrompt.value = true;
      const modelName = videoModel.value === "quality"
        ? "Wan 2.2 image-to-video"
        : videoModel.value === "sota" ? "MiniMax H3" : "LTX-2";
      try {
        const instruction = `Rewrite this video prompt for ${modelName}. Return only the final prompt, no markdown, no commentary. Make it concrete, cinematic, chronological, and compatible with diffusion video generation. Include subject, setting, camera motion, physical motion, lighting, duration pacing, and avoid contradictory actions.\n\nPrompt: ${promptText}`;
        const response = await window.electronAPI.chat(instruction, {
          maxTokens: 280,
          temperature: 0.35,
          enableThinking: false,
        });
        const enriched = stripReasoningTags(typeof response === "string" ? response : response?.text || "");
        if (enriched) form.prompt = enriched.replace(/^["']|["']$/g, "");
      } catch (err) {
        console.warn("[Video] Prompt enrichment failed:", err?.message || err);
      } finally {
        isEnhancingPrompt.value = false;
      }
    };

    let _lastRoutingMode = 'local';

    const enhancingIds = ref({});
    const enhancementStatus = ref({});
    const enhancementErrors = ref({});

    const enhanceInference = async (inference) => {
      const id = inference?.id;
      const data = inference?.answer?.data;
      const sourcePath = videoEnhanceSource(data);
      if (!id || !sourcePath || enhancingIds.value[id]) return;
      enhancingIds.value = { ...enhancingIds.value, [id]: true };
      enhancementErrors.value[id] = "";
      const enhancementStarted = performance.now();
      try {
        const enh = await enhanceVideo({
          baseUrl: API_BASE, videoPath: sourcePath,
          onProgress: progress => { enhancementStatus.value[id] = progress; },
        });
        if (enh?.video_path) {
          const arr = inferences.value.slice();
          const idx = arr.findIndex((i) => i.id === id);
          if (idx >= 0) {
            arr[idx] = {
              ...arr[idx],
              width: enh.output_size[0], height: enh.output_size[1], fps: enh.output_fps,
              answer: {
                ...arr[idx].answer,
                data: {
                  ...arr[idx].answer.data,
                  video_path: enh.video_path,
                  enhanced: true,
                  enhancement_error: null,
                  enhanced_from: sourcePath,
                  enhancement_backend: enh.backend,
                  enhancement_model: enh.model,
                  enhancement_elapsed_ms: Math.round(performance.now() - enhancementStarted),
                  output_fps: enh.output_fps,
                  output_size: enh.output_size,
                  width: enh.output_size[0], height: enh.output_size[1], fps: enh.output_fps,
                  frames: enh.frame_count,
                },
              },
            };
            inferences.value = arr;
            persistInferences([...arr]);
          }
        }
      } catch (error) {
        enhancementErrors.value[id] = error?.message || String(error);
      } finally {
        const next = { ...enhancingIds.value };
        delete next[id];
        enhancingIds.value = next;
      }
    };

    const sendMessage = async (prompt) => {
      const promptText = String(prompt || "").trim();
      if (!promptText) return;
      // For i2v mode, require an image
      if (mode.value === "i2v" && !hasAnyImage.value) return;
      if (!remoteMedia.value && !hasAccess.value) return;
      _lastRoutingMode = 'local';

      const isQuality = videoModel.value === "quality";
      const isSota = videoModel.value === "sota";
      if (!remoteMedia.value && isSota && !h3TermsAccepted.value) {
        showH3Terms.value = true;
        return;
      }

      // Size mappings: [height, width] for landscape orientation
      const ltxSizeMaps = {
        "480p":  [448, 640],
        "540p":  [512, 960],
        "720p":  [704, 1280],
        "1080p": [1088, 1920],
      };
      const wanSizeMaps = {
        "320x240": [240, 320],
        "512x320": [320, 512],
        "640x480": [480, 640],
        "832x640": [640, 832],
        "1024x576": [576, 1024],
      };
      const sotaSizeMaps = {
        "256x256": [256, 256],
        "512x288": [288, 512],
        "640x384": [384, 640],
        "960x544": [544, 960],
      };

      const activeMaps = isSota ? sotaSizeMaps : isQuality ? wanSizeMaps : ltxSizeMaps;
      let [h, w] = activeMaps[quality.value] || Object.values(activeMaps)[0];

      // Resolve the actual current image, including images passed from other views.
      if ((mode.value === "i2v" || isQuality) && effectiveImage.value) {
        await detectImageAspectRatio(effectiveImage.value);
      }

      // For i2v mode, swap dimensions for portrait images
      // For t2v mode, default to landscape
      if ((mode.value === "i2v" || isQuality) && imageAspectRatio.value === "portrait") {
        [h, w] = [w, h];
      }

      const frameRate = isSota ? 24 : isQuality ? wanFps.value : fps.value;
      const frames = isSota
        ? (17 * Math.ceil((duration.value * 24 - 5) / 17) + 5)
        : isQuality
        ? (duration.value * wanFps.value + 1)
        : normalizeFramesForLTX2(frameRate * duration.value + 1);

      const payload = isSota
        ? {
            prompt: promptText,
            height: h,
            width: w,
            num_frames: frames,
            num_inference_steps: quality.value === "256x256" ? 4 : 8,
            // Backend selects the validated sampler for the installed H3 checkpoint.
            guidance_scale: 1,
            license_accepted: true,
            auto_download: true,
          }
        : isQuality
        ? {
            prompt: promptText,
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
            prompt: promptText,
            height: h,
            width: w,
            frames: frames,
            frame_rate: frameRate,
            steps: 10,
            guidance_scale: 1,
            auto_download: true,
          };

      Object.assign(payload, reusedSampling.value);
      // Include image for i2v mode (LTX-2) or always for Wan2.2 (I2V only)
      if (mode.value === "i2v" || (!remoteMedia.value && isQuality)) {
        payload.image_base64 =
          effectiveImage.value;
      }
      // Capture before awaiting inference: controls may change while a job runs.
      const generationSettings = {
        request: { ...payload }, engine: videoModel.value, mode: mode.value,
        quality: quality.value, duration: duration.value,
        autoEnhance: autoEnhance.value, imageName: pickedImageName.value,
      };
      const generationPipeline = pipelineForMode();
      payload.pipeline = generationPipeline;
      payload.duration = duration.value;
      if (remoteMedia.value) { payload.aspect_ratio = remoteRatio.value; payload.resolution = remoteResolution.value; }
      const url = `${API_BASE}${endpointForMode()}`;

      // The device coordinator releases idle models only after this request owns the device.
      ensureGenerationSocket();
      startGeneration("video"); // Initialize generation state
      const _genStart = performance.now();

      const onSuccess = async (response) => {
        // UPDATED: Check for video_url OR video_path
        if (response?.data?.video_path || response?.data?.video_url) {
          let finalData = {
            ...response.data,
            prompt: promptText,
            mode: generationSettings.mode,
            engine: remoteMedia.value ? "openrouter" : isSota ? "sota" : isQuality ? "quality" : "fast",
            quality: generationSettings.quality,
            duration: response.data?.duration || generationSettings.duration,
            fps: response.data?.fps || (remoteMedia.value ? null : frameRate),
            frames: response.data?.frames || (remoteMedia.value ? null : frames),
            width: response.data?.width || (remoteMedia.value ? null : w),
            height: response.data?.height || (remoteMedia.value ? null : h),
          };

          // Optional Wan restoration preserves the generated clip's timing.
          if (!remoteMedia.value && isQuality && generationSettings.autoEnhance && finalData.video_path) {
            try {
              const enh = await enhanceVideo({ baseUrl: API_BASE, videoPath: finalData.video_path });
              if (enh?.video_path) {
                finalData = {
                  ...finalData,
                  video_path: enh.video_path,
                  enhanced: true,
                  enhanced_from: response.data.video_path,
                  enhancement_backend: enh.backend,
                  enhancement_model: enh.model,
                  enhancement_elapsed_ms: enh.elapsed_ms,
                  output_fps: enh.output_fps,
                  output_size: enh.output_size,
                  width: enh.output_size[0], height: enh.output_size[1], fps: enh.output_fps,
                  frames: enh.frame_count,
                };
              }
            } catch (e) {
              finalData.enhancement_error = e?.message || String(e);
              console.warn("[GenerativeVideo] Enhance error:", e?.message || e);
            }
          }

          const elapsedMs = Math.round(performance.now() - _genStart);
          const newInference = {
            question: promptText,
            generationSettings,
            answer: { data: finalData },
            id: uuid(),
            model: finalData.model || (isSota ? 'minimax-h3' : isQuality ? 'wan2.2-14b' : 'ltx-2'),
            pipeline: generationPipeline,
            mode: generationSettings.mode,
            quality: generationSettings.quality,
            duration: finalData.duration,
            fps: finalData.output_fps || finalData.fps,
            width: finalData.width,
            height: finalData.height,
            elapsedMs,
            networkMode: _lastRoutingMode,
          };
          inferences.value = [...inferences.value, newInference];
          hasCopy.value = [...hasCopy.value, false];
          persistInferences([...inferences.value]);

          addVideoInference(
            promptText,
            finalData.video_path || finalData.video_url,
            {
              pipeline: generationPipeline,
              generationSettings,
              duration: finalData.duration,
              fps: finalData.output_fps || finalData.fps,
              mode: generationSettings.mode,
              quality: generationSettings.quality,
              width: finalData.width,
              height: finalData.height,
              elapsed: elapsedMs / 1000,
              source: response.data.metadata?.source || 'bonzai',
              model: response.data.model, usage: response.data.metadata?.usage,
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
        if (/^(?:https?:|bonzai-blob:|data:|file:)/i.test(data.video_path)) return data.video_path;
        // Use the streaming endpoint for local files
        return `${API_BASE}/media/stream?path=${encodeURIComponent(data.video_path)}`;
      }
      return "";
    };

    const openInspector = (inference) => {
      if (!inference) return;
      const data = inference.answer?.data || {};
      const mediaUrl = getVideoUrl(inference);
      const promptText = inference.question || data.prompt || "";
      const width = data.width || data.video_width || inference.width || null;
      const height = data.height || data.video_height || inference.height || null;
      const frameRate = data.fps || data.frame_rate || inference.fps || fps.value || wanFps.value;
      const durationValue = data.duration || inference.duration || duration.value;
      const modelName = data.model || inference.model || ({
        fast: "LTX-2",
        sota: "MiniMax H3",
        quality: "Wan2.2",
      })[videoModel.value];
      const pipeline = inference.pipeline || data.pipeline || pipelineForMode();

      inspector.show({
        id: inference.id,
        kind: "video",
        elapsedMs: generationElapsedMs(inference),
        mediaUrl,
        prompt: promptText,
        negativePrompt: data.negative_prompt || inference.negativePrompt,
        model: modelName,
        modelId: inference.modelId || pipeline,
        status: inference.error ? "Error" : "Complete",
        errorMessage: inference.errorMessage || inference.error || "",
        seed: data.seed || inference.seed,
        steps: data.num_inference_steps || data.steps || inference.steps,
        guidanceScale: data.guidance_scale || inference.guidanceScale,
        ...(width && height ? { width, height } : {}),
        networkMode: inference.networkMode || "local",
        peerId: inference.peerId,
        mintState: inference.nft || null,
        ts: inference.timestamp || inference.ts,
        createdAt: inference.createdAt,
        extra: {
          mode: mode.value === "i2v" ? "Image to video" : "Text to video",
          engine: ({ fast: "Turbo", sota: "Max", quality: "Quality" })[videoModel.value],
          quality: data.quality || inference.quality || quality.value,
          duration: durationValue ? `${durationValue}s` : "",
          fps: frameRate ? `${frameRate} fps` : "",
          frames: data.num_frames || data.frames || "",
          checkpoint: data.checkpoint || "",
          sampler: data.sampler || "",
          schedule: data.schedule || "",
          enhanced: data.enhanced ? "Yes" : "No",
          ...(data.enhancement_elapsed_ms != null ? { "Enhancement time": formatGenerationTime(data.enhancement_elapsed_ms) } : {}),
          videoPath: data.video_path || "",
        },
      });
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

    const clearDeleteToastTimer = () => {
      if (!pendingDeleteTimer) return;
      window.clearTimeout(pendingDeleteTimer);
      pendingDeleteTimer = null;
    };

    const dismissDeleteToast = () => {
      clearDeleteToastTimer();
      pendingDelete.value = null;
    };

    const requestDeleteVideo = (inference) => {
      if (!inference) return;
      clearDeleteToastTimer();
      pendingDelete.value = {
        id: inference.id,
        index: inference._originalIndex,
        all: false,
      };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const requestClearHistory = () => {
      if (!inferences.value.length) return;
      clearDeleteToastTimer();
      pendingDelete.value = { all: true };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const confirmDeleteVideo = async () => {
      const pending = pendingDelete.value;
      if (!pending) return;
      dismissDeleteToast();

      if (pending.all) {
        inferences.value = [];
        hasCopy.value = [];
        try {
          await window.electronAPI?.store?.set?.("videoInferences", []);
        } catch (e) {
          console.error("Failed to clear video inferences:", e);
        }
        return;
      }

      const idx = inferences.value.findIndex((item) => item.id === pending.id);
      await removeInference(idx >= 0 ? idx : pending.index);
    };

    const clearHistory = async () => {
      requestClearHistory();
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

    // Merge only roleplay rows so an active generation keeps its live state.
    const refreshRoleplayHistory = async () => {
      const rows = await window.electronAPI?.store?.get?.('videoInferences', []);
      if (!Array.isArray(rows)) return;
      const merged = new Map(inferences.value.map(row => [row.id, row]));
      for (const row of rows) if (row.source === 'roleplay') merged.set(row.id, row);
      inferences.value = [...merged.values()].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    };
    onMounted(async () => {
      window.addEventListener('bonzai:roleplay-history-changed', refreshRoleplayHistory);
      ensureGenerationSocket();
      await resumeActiveDownloadIfAny();
      await loadHistory();
      await probeCurrentMode();
      // Setup scroll observer after DOM is rendered
      setTimeout(setupScrollObserver, 100);
      setupMasonryGridObserver();
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
      window.removeEventListener('bonzai:roleplay-history-changed', refreshRoleplayHistory);
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
      { immediate: true }
    );

    // Re-probe when switching video engines.
    watch(videoModel, (newModel) => {
      reusedSampling.value = {};
      duration.value = 5;
      quality.value = newModel === "quality"
        ? "640x480"
        : newModel === "sota" ? "960x544" : "480p";
      probeCurrentMode();
      nextTick(setupMasonryGridObserver);
    });

    watch(
      () => paginatedInferences.value.length,
      () => nextTick(setupMasonryGridObserver),
    );

    // Unified action descriptors for the video history items, fed
    // into <GenerativeActions>. Replaces 5 inline Bulma buttons.
    const actionsFor = (inference) => {
      const hasVideo = !!getVideoUrl(inference);
      const enhanced = inference?.answer?.data?.enhancement_backend === 'seedvr2';
      const enhancing = !!enhancingIds.value[inference.id];
      const minted = !!inference?.nft;
      return [
        { id: "inspect", icon: "info", label: "", variant: "default", title: "Open inspector" },
        { id: "download", icon: "save", label: "Download", variant: "primary", disabled: !hasVideo, title: "Save video" },
        { id: "copy",     icon: hasCopy.value[inference._originalIndex] ? "check" : "content_copy",
          label: hasCopy.value[inference._originalIndex] ? "Copied" : "Reuse",
          title: "Reuse", variant: "default" },
        { id: "enhance",
          icon: enhanced ? "check_circle" : (enhancing ? "progress_activity" : "high_quality"),
          label: enhanced ? "Enhanced" : (enhancing ? "Enhancing…" : "Enhance"),
          variant: enhanced ? "success" : "default",
          disabled: enhanced || enhancing || !hasVideo,
          title: enhanced ? "Enhanced" : "SeedVR2" },
        { id: "mint",
          icon: minted ? "check_circle" : "token",
          label: minted ? "Tokenized" : "Tokenize",
          variant: minted ? "success" : "default",
          disabled: minted },
        { id: "delete",
          icon: "delete",
          label: "Delete",
          variant: "destructive",
          title: "Remove this result" },
      ];
    };
    const reuseInference = async (inference) => {
      const settings = videoReuseSettings(inference);
      videoModel.value = settings.engine;
      // The engine watcher resets resolution/duration; restore after it runs.
      await nextTick();
      reusedSampling.value = settings.sampling;
      mode.value = settings.mode;
      quality.value = settings.quality;
      duration.value = settings.duration;
      if (settings.engine === 'quality') wanFps.value = settings.fps;
      else fps.value = settings.fps;
      autoEnhance.value = settings.autoEnhance;
      form.prompt = settings.prompt;
      useExistingImage.value = false;
      uploadedImageBase64.value = settings.image;
      pickedImageName.value = settings.imageName;
      imageAspectRatio.value = 'landscape';
      if (settings.image) await detectImageAspectRatio(settings.image);
      copy(settings.prompt);
      setCopied(inference._originalIndex);
      scrollToTop();
    };
    const handleAction = (id, inference) => {
      switch (id) {
        case "inspect":  openInspector(inference); break;
        case "download": downloadVideo(inference._originalIndex); break;
        case "copy":
          reuseInference(inference);
          break;
        case "enhance": enhanceInference(inference); break;
        case "mint":    openMint(inference); break;
        case "delete":  requestDeleteVideo(inference); break;
      }
    };

    const generationDraft = useGenerationDraft({ form, mode, videoModel, quality, duration, fps, wanFps, autoEnhance, reusedSampling, uploadedImageBase64, pickedImageName, imageAspectRatio, remoteRatio, remoteResolution });
    const captureVideoDraft = generationDraft.capture;
    generationDraft.capture = () => ({ ...captureVideoDraft(), uploadedImageBase64: effectiveImage.value });

    return {
      generationDraft,
      remoteMedia, remoteInference, remoteVideoOptions, remoteRatio, remoteResolution,
      includeRoleplay,
      reversedInferences,
      mode,
      videoModel,
      showH3Terms,
      h3Dialog,
      generationStageLabel,
      h3TermsChecked,
      acceptH3Terms,
      quality,
      duration,
      fps,
      wanFps,
      autoEnhance,
      videoModelItems,
      videoModeItems,
      durationItems,
      fpsItems,
      wanFpsItems,
      qualityItems,
      form,
      isLoading,
      inferences,
      hasCopy,
      // lazy loading pagination
      paginatedInferences,
      masonryGridRef,
      masonryColumns,
      loadMoreSentinel,
      hasMore,
      isLoadingMore,
      videoAspectStyle,
      // scroll to top
      showScrollTop,
      scrollToTop,
      readiness,
      showUpdateCTA,
      generation,
      generationPctRounded,
      generationPctClamped,
      isEnhancingPrompt,
      enrichPrompt, createVideoPrompt, promptFeedback,
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
      pendingDelete,
      dismissDeleteToast,
      confirmDeleteVideo,
      actionsFor,
      handleAction,
      clearHistory,
      exportHistory,
      importHistory,
      prefetchForMode,
      cancelCurrentPipeline,
      isCancellingDownloads,
      retryCurrentPipeline,
      probeCurrentMode,
      fileUrl,
      getVideoUrl,
      openInspector,
      // Network modal
      requestOpenNetworkModal,
      // NFT Minting
      mintTarget,
      openMint,
      onMinted,
      // Enhance (SeedVR2 detail restoration)
      enhanceInference,
      enhancingIds,
      enhancementStatus,
      enhancementErrors,
    };
  },
};
</script>

<style scoped>
.video-prompt-create{pointer-events:auto}
.video-prompt-feedback{font-size:var(--bz-size-meta);color:var(--bz-fg-mid);max-width:42ch}

.bz-h3-terms {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: var(--bz-space-6);
  background: var(--bz-scrim);
}

.bz-h3-terms__panel {
  width: min(460px, 100%);
  padding: var(--bz-space-7);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-md);
  background: var(--bz-raised);
  box-shadow: var(--bz-shadow-lg);
}

.bz-h3-terms__mark {
  color: var(--bz-purple-300);
  font-size: 32px;
}

.bz-h3-terms__panel p {
  color: var(--bz-fg-muted);
  line-height: 1.55;
}

.bz-h3-terms__check {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-3);
  margin: var(--bz-space-5) 0 var(--bz-space-3);
  color: var(--bz-fg);
}

.bz-h3-terms__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-6);
}

.video-control-stack {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-5);
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

.video-control-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-3);
}

.video-control-row > .bz-eyebrow {
  flex: 0 0 88px;
  margin: 0;
  color: var(--bz-fg-mid);
}

.level-item.buttons {
  gap: var(--bz-space-2);
}

/* Spinner for the Upscale CTA while /video/enhance is in flight */
.is-rotating {
  animation: bz-spin 1s linear infinite;
  display: inline-block;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.video-progress-card,
.video-notice {
  margin-bottom: 1rem;
  padding: 14px 16px;
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
}

.video-progress-card {
  position: sticky;
  bottom: var(--bz-space-4);
  z-index: 20;
  box-shadow: var(--bz-elev-2);
}

.video-progress-card__head,
.video-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.video-progress-card__title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.video-progress-card__title--pill {
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--bz-fg) 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bz-panel) 82%, var(--bz-accent) 18%);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--bz-accent) 24%, transparent);
  animation: bz-progress-pill-pulse 1.8s ease-in-out infinite;
}

.video-progress-card__pct {
  color: var(--bz-fg);
  font-family: "Fira Sans Condensed", var(--bz-font-body);
  font-weight: 900;
  font-style: italic;
  font-size: 1.45rem;
  line-height: 1;
}

.video-progress-card :deep(.bz-pulse-wrap--bar) {
  margin-top: 12px;
}

@keyframes bz-progress-pill-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--bz-accent) 18%, transparent);
    transform: translateY(0);
  }
  50% {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--bz-accent) 0%, transparent);
    transform: translateY(-1px);
  }
}

.video-download-taskwrap {
  max-height: 180px;
  overflow: auto;
  margin-top: var(--bz-space-4);
}

.video-notice--danger {
  border-color: color-mix(in srgb, var(--bz-danger) 42%, var(--bz-border));
  background: var(--bz-danger-soft);
}

.video-notice__body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.video-notice__title {
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.video-notice ul {
  margin: 0.5rem 0 0;
  padding-left: 0;
  list-style: none;
  text-transform: lowercase;
}

.notification {
  padding: 1.25rem 1.5rem 1.25rem 1.5rem;
}
.video-image-picker {
  display: grid;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-5);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
}

.video-image-picker__label,
.video-image-picker__input :deep(.file-cta) {
  width: 100%;
  box-shadow: none !important;
}

.video-image-picker__input :deep(.file-cta) {
  display: flex;
  align-items: center;
  min-height: 42px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  color: var(--bz-fg-mid);
}

.video-image-picker__input :deep(.file-cta:hover) {
  border-color: var(--bz-border-brand);
  color: var(--bz-fg);
  background: var(--bz-raised);
}

.video-image-picker__preview {
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-canvas);
}

.video-image-picker__image {
  display: block;
  width: 100%;
  max-height: 360px;
  object-fit: contain;
  box-shadow: none !important;
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
.models__activity--payouts h2 {
  font-size: 48px;
  color: var(--bz-fg);
  text-align: right;
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
  transform: none;
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
  transform: none;
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
    var(--bz-fg),
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
  color: var(--bz-fg) !important;
  border: 1px solid var(--bz-fg) !important;
  background: var(--bz-purple-soft) !important;
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

.bz-video-masonry {
  display: grid;
  grid-template-columns: repeat(var(--bz-video-masonry-columns), minmax(0, 1fr));
  gap: 12px;
  padding: 0;
  margin: var(--bz-space-5) 0;
}

.bz-video-masonry__column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.history-item {
  min-width: 0;
  animation: bz-fade-rise 480ms var(--bz-ease-out) forwards;
  opacity: 0;
  margin: 0;
}

.history-item .question {
  position: relative;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
}

.generated__video {
  width: 100%;
  height: auto;
  min-height: 180px;
  display: block;
  border-radius: 0;
  background: var(--bz-canvas);
  object-fit: contain;
}

.history-item .bz-gen-actions {
  position: static;
  transform: none;
  flex-wrap: nowrap;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: var(--bz-panel);
  padding: var(--bz-space-3);
  border-top: 1px solid var(--bz-border);
  gap: var(--bz-space-2);
  overflow-x: auto;
  scrollbar-width: thin;
}

.history-item .bz-gen-actions::-webkit-scrollbar {
  height: 4px;
}

.bz-img-meta {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  margin: 0;
  padding: var(--bz-space-2) var(--bz-space-3);
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

.bz-video-enhance-status { padding: .75rem 1rem; font-size: .875rem; color: var(--bz-muted); }
.bz-video-enhance-status--error { color: var(--bz-danger, #e67575); }
</style>
