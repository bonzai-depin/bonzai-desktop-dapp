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
                    neurology
                  </span>
                  {{ currentModel.modelname }}
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <!-- OpenClaw toggle moved to BonzaiBottomBar -->
                <button
                  class="button is-outlined is-info is-medium fira-sans-condensed-black-italic ml-2 mt-4"
                  @click="openModel = true"
                >
                  <span class="material-symbols-outlined is-size-3 mr-2">
                    folder_open
                  </span>
                  Browse Models
                </button>
              </div>
            </div>
          </div>
          <div class="desc models__activity--payouts pb-0">
            <div class="desc-content">
              {{ currentModel.modeldesc }}

              <hr />
              <span class="fira-sans-condensed-black-italic mt-5 has-text-left">
                <span class="material-symbols-outlined is-size-1 mr-2">
                  computer
                </span>
                Hardware Requirements
              </span>
              <span class="tags pt-3 fira-sans-condensed-black-italic">
                <span class="tag is-info">
                  <span class="material-symbols-outlined">memory</span>
                  {{ computeMemoryRequirements(currentModel).vramGB }} GB VRAM
                </span>
                <span class="tag is-info">
                  <span class="material-symbols-outlined">memory</span>
                  {{ computeMemoryRequirements(currentModel).ramGB }} GB RAM
                </span>
                <span class="tag is-info">
                  {{
                    computeMemoryRequirements(currentModel).breakdown
                      .contextSize
                  }}
                  CTX
                </span>
              </span>
            </div>
          </div>
          <div class="models__deployment-install--cta has-text-right p-0">
            <button
              class="button is-success is-large fira-sans-condensed-black-italic mr-5"
              :class="{ 'is-loading': isLoading }"
              :disabled="isLoading"
              @click="downloadModel(currentModel.url, currentModel.filename)"
              v-if="!isModel"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">
                deployed_code_update
              </span>
              Download
              <span
                class="filesize"
                style="
                  font-size: 15px;
                  top: -20px;
                  right: -25px;
                  text-shadow: none;
                "
                v-if="downloadProgress"
              >
                {{ downloadProgress }}%
              </span>
              <span
                v-else
                class="filesize"
                style="
                  font-size: 15px;
                  top: -20px;
                  right: -25px;
                  text-shadow: none;
                "
              >
                {{ currentModel.filesize }}
              </span>
            </button>
            <button
              class="button is-danger is-large fira-sans-condensed-black-italic mr-5"
              :class="{ 'is-loading': isLoading }"
              :disabled="isLoading"
              @click="deleteModel(currentModel.filename)"
              v-if="isModel"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">
                delete
              </span>
              Delete
              <span
                class="filesize"
                style="font-size: 15px; top: -20px; right: -25px"
              >
                {{ currentModel.filesize }}
              </span>
            </button>
            <!-- Mmproj download for multimodal models -->
            <button
              class="button is-warning is-large fira-sans-condensed-black-italic ml-5 mr-5"
              :class="{ 'is-loading': isLoading }"
              :disabled="isLoading"
              @click="downloadMmproj(currentModel)"
              v-if="isModel && currentModel.isMultimodal && !isMmprojAvailable"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">
                visibility
              </span>
              Download Vision
              <span
                class="filesize"
                style="
                  font-size: 15px;
                  top: -20px;
                  right: -25px;
                  text-shadow: none;
                "
                v-if="mmprojDownloadProgress"
              >
                {{ mmprojDownloadProgress }}%
              </span>
              <span
                v-else
                class="filesize"
                style="
                  font-size: 15px;
                  top: -20px;
                  right: -25px;
                  text-shadow: none;
                "
              >
                {{ currentModel.mmprojFilesize }}
              </span>
            </button>
            <button
              class="button is-success is-large fira-sans-condensed-black-italic ml-5 mr-5"
              v-if="
                !isLoading &&
                isModel &&
                (!currentModel.isMultimodal || isMmprojAvailable)
              "
              @click="openChat = true"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">
                forum
              </span>
              Chat with {{ currentModel.modelname }}
            </button>
          </div>
        </div>
      </div>
      <div class="models__activity has-text-left mt-5">
        <div class="models__activity--payouts mt-5">
          <div class="level">
            <div class="level-left">
              <div class="level-item">
                <h2
                  class="fira-sans-condensed-black-italic has-text-left mt-0"
                  v-if="inferences"
                >
                  <span class="material-symbols-outlined is-size-1 mr-2">
                    forum
                  </span>
                  Chat History
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
                  @click="resetChat()"
                >
                  <span class="material-symbols-outlined mr-2">ink_eraser</span>
                  Clear
                </button>
              </div>
            </div>
          </div>
          <ol class="chat" v-if="inferences && inferences.length > 0">
            <li
              v-for="(inference, displayIndex) in paginatedInferences"
              :key="inference._originalIndex"
              class="history-item"
              :style="{
                animationDelay: `${Math.min(displayIndex * 50, 500)}ms`,
              }"
            >
              <p class="question">{{ inference.question }}</p>
              <div class="answer markdown-body" @click="handleAnswerClick">
                <div class="answer__meta">
                  <span v-if="inference.model" class="answer__model">
                    <span class="material-symbols-outlined mr-2">
                      neurology
                    </span>
                    {{ inference.model }}
                    <span v-if="inference.tokensPerSecond" class="answer__tps">
                      @ {{ inference.tokensPerSecond }} tok/s
                    </span>
                  </span>
                </div>
                <vue-markdown :source="inference.answer.text" />
                <span
                  v-if="
                    isLoading && inference.answer.id === streamingInferenceId
                  "
                  class="streaming-cursor"
                ></span>
                <hr class="answer-divider" />
                <button
                  class="button is-medium is-success copy p-0 pl-1 pr-1 mr-3"
                  @click="
                    copy(inference.answer.text);
                    hasCopy[inference._originalIndex] = true;
                  "
                  v-if="!hasCopy[inference._originalIndex]"
                >
                  <span class="material-symbols-outlined is-size-2">
                    content_copy
                  </span>
                </button>
                <button
                  class="button is-medium is-outlined copy p-0 pl-1 pr-1 mr-3"
                  @click="copy(inference.answer.text)"
                  v-if="hasCopy[inference._originalIndex]"
                >
                  <span class="material-symbols-outlined is-size-2">check</span>
                </button>
                <button
                  class="button is-medium is-warning copy ml-3 pl-2"
                  @click="openMint(inference)"
                  :disabled="!!inference.nft"
                >
                  <span class="material-symbols-outlined is-size-2 mr-2">
                    {{ inference.nft ? "check_circle" : "token" }}
                  </span>
                  {{ inference.nft ? "Minted" : "Mint" }}
                </button>
                <button
                  class="button is-medium is-danger is-pulled-right ml- p-0 pl-1 pr-1"
                  @click="removeInference(inference._originalIndex)"
                  title="Remove this result"
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
            v-if="hasMore && inferences.length > 0"
            class="load-more-sentinel has-text-centered p-4"
          >
            <span v-if="isLoadingMore" class="has-text-grey">
              Loading more...
            </span>
          </div>
        </div>
      </div>
    </div>
    <div class="models__deployment-use" v-if="openModel">
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
                    folder_open
                  </span>
                  Pick a Model
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item mr-4">
                <label
                  class="always-loaded-toggle"
                  :class="{ active: alwaysLoaded }"
                  title="Keep the loaded LLM in memory at all times (still allows hot-swapping)"
                  style="height: 60px"
                >
                  <span class="material-symbols-outlined" style="font-size: 24x; vertical-align: middle">
                    {{ alwaysLoaded ? 'lock' : 'lock_open' }}
                  </span>
                  <span class="fira-sans-condensed-black-italic" style="font-size: 24px">
                    Always On
                  </span>
                  <input
                    type="checkbox"
                    :checked="alwaysLoaded"
                    @change="toggleAlwaysLoaded"
                    style="display: none"
                  />
                  <span class="toggle-switch"></span>
                </label>
              </div>
              <div class="level-item">
                <button
                  class="button is-danger is-large"
                  @click="openModel = false"
                >
                  <span class="material-symbols-outlined is-size-1">close</span>
                </button>
              </div>
            </div>
          </div>
          <!-- Migration Progress -->
          <div
            v-if="migrationProgress.active"
            class="notification is-info mb-4"
          >
            <p class="mb-2">
              <strong class="fira-sans-condensed-black-italic">
                Migrating model files...
              </strong>
              <span class="is-pulled-right fira-sans-condensed-black-italic">
                {{ migrationProgress.pct }}%
              </span>
            </p>
            <progress
              class="progress is-success"
              :value="migrationProgress.pct"
              max="100"
            >
              {{ migrationProgress.pct }}%
            </progress>
            <p class="is-size-7 has-text-white">
              {{ migrationProgress.detail }}
            </p>
          </div>
          <div
            v-if="migrationProgress.error"
            class="notification is-danger mb-4"
          >
            <strong>Migration failed:</strong>
            {{ migrationProgress.error }}
          </div>
          <!-- Model Directory -->
          <div class="model-dir-bar mb-5 p-4">
            <span
              class="material-symbols-outlined mr-2 has-text-white is-size-1"
              style="vertical-align: middle"
            >
              folder
            </span>
            <span class="is-size-7 has-text-grey-light model-dir-path">
              {{ modelDir }}
            </span>
            <button
              class="button is-medium is-outlined is-warning ml-3"
              @click="changeModelDir"
              title="Change model storage location"
              style="box-shadow: none"
            >
              Change
            </button>
          </div>
          <ul class="columns is-multiline has-text-left mt-5">
            <li
              class="column is-6"
              v-for="model in sortedModels"
              :key="model.filename"
            >
              <div
                class="model-card mb-5"
                :class="{
                  'model-card--downloaded':
                    modelAvailabilityMap[model.filename],
                  'model-card--selected':
                    currentModel.filename === model.filename,
                }"
              >
                <button
                  class="button is-outlined is-info is-large fira-sans-condensed-black-italic is-size-5 is-fullwidth"
                  @click="
                    pickModel(model);
                    openModel = false;
                  "
                  style="justify-content: left; box-shadow: none"
                >
                  <span class="material-symbols-outlined is-size-2 mr-2">
                    neurology
                  </span>
                  {{ model.modelname }}
                  <span class="filesize">
                    <span
                      class="material-symbols-outlined is-size-3 mr-2 is-pulled-left"
                    >
                      hard_drive
                    </span>
                    {{ model.filesize }}
                    <button
                      v-if="!modelAvailabilityMap[model.filename]"
                      class="button is-success is-small ml-2"
                      :disabled="modelDownloading[model.filename]"
                      @click.stop="downloadModelInList(model)"
                      title="Download model"
                      style="box-shadow: none"
                    >
                      <span
                        v-if="modelDownloading[model.filename]"
                        class="is-size-7 fira-sans-condensed-black-italic"
                      >
                        {{ modelDownloadProgress[model.filename] || 0 }}%
                      </span>
                      <template v-else>
                        <span
                          class="material-symbols-outlined"
                          style="font-size: 20px"
                        >
                          download
                        </span>
                      </template>
                    </button>
                    <button
                      v-if="modelAvailabilityMap[model.filename]"
                      class="button is-danger is-small ml-2"
                      :disabled="modelDownloading[model.filename]"
                      @click.stop="deleteModelInList(model)"
                      title="Delete model from disk"
                      style="box-shadow: none"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 20px"
                      >
                        delete
                      </span>
                    </button>
                  </span>
                </button>
                <div class="model-card__tip models__activity--payouts">
                  {{ model.modeldesc }}
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="models__deployment-use" v-if="openChat">
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
                    chat
                  </span>
                  Chat with {{ currentModel.modelname }}
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button
                  class="button is-danger is-large"
                  @click="openChat = false"
                >
                  <span class="material-symbols-outlined is-size-1">close</span>
                </button>
              </div>
            </div>
          </div>
          <!-- ACCESS REQUIREMENTS -->
          <AccessRequirements
            ref="accessRef"
            level="LVL1"
            @access-changed="onAccessChanged"
          />

          <form ref="promptForm" @submit.prevent>
            <!-- Image attachment preview for multimodal models -->
            <div
              v-if="isMultimodalModel && attachedImage"
              class="attached-image-preview"
            >
              <img :src="attachedImage.dataUrl" alt="Attached image" />
              <button
                type="button"
                class="delete-btn"
                @click="removeAttachedImage"
                title="Remove image"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
              <span class="image-name">{{ attachedImage.name }}</span>
            </div>

            <div class="chat-input-row">
              <!-- Reasoning toggle for thinking models -->
              <button
                v-if="isThinkingModel"
                type="button"
                class="button reasoning-toggle-btn is-pulled-left mr-3"
                :class="{ active: reasoningEnabled }"
                @click="reasoningEnabled = !reasoningEnabled"
                :disabled="isLoading"
                :title="
                  reasoningEnabled
                    ? 'Reasoning ON — model thinks step-by-step'
                    : 'Reasoning OFF — direct answers'
                "
              >
                <span class="material-symbols-outlined is-size-2">
                  network_intelligence_history
                </span>
              </button>
              <!-- Image attachment button for multimodal models -->
              <label
                v-if="isMultimodalModel && isMmprojAvailable"
                class="button attach-image-btn"
                :class="{ 'has-image': attachedImage }"
                title="Attach an image for analysis"
              >
                <span class="material-symbols-outlined">
                  add_photo_alternate
                </span>
                <input
                  type="file"
                  accept="image/*"
                  @change="attachImage"
                  style="display: none"
                />
              </label>

              <input
                class="input is-large is-fullwidth"
                type="text"
                :placeholder="
                  isMultimodalModel
                    ? 'Ask about an image or just chat...'
                    : 'Ask me something and press enter...'
                "
                v-model="form.prompt"
                @keyup.enter.native="hasAccess && sendMessage(form.prompt)"
                :disabled="isLoading || !hasAccess"
              />
            </div>
            <button
              class="button chat is-loading is-outlined is-info is-large is-fullwidth"
              v-if="isLoading"
            ></button>
          </form>
          <ol class="chat" v-if="inferences && inferences.length > 0">
            <li
              v-for="(inference, displayIndex) in paginatedInferences"
              :key="inference._originalIndex"
              class="history-item"
              :style="{
                animationDelay: `${Math.min(displayIndex * 50, 500)}ms`,
              }"
            >
              <p class="question">{{ inference.question }}</p>
              <div class="answer markdown-body" @click="handleAnswerClick">
                <div class="answer__meta">
                  <span v-if="inference.model" class="answer__model">
                    From {{ inference.model }}
                    <span v-if="inference.tokensPerSecond" class="answer__tps">
                      @ {{ inference.tokensPerSecond }} tok/s
                    </span>
                  </span>
                </div>
                <vue-markdown :source="inference.answer.text" />
                <span
                  v-if="
                    isLoading && inference.answer.id === streamingInferenceId
                  "
                  class="streaming-cursor"
                ></span>
                <hr class="answer-divider" />
                <button
                  class="button is-medium is-success copy p-0 pl-1 pr-1 mr-3"
                  @click="
                    copy(inference.answer.text);
                    hasCopy[inference._originalIndex] = true;
                  "
                  v-if="!hasCopy[inference._originalIndex]"
                >
                  <span class="material-symbols-outlined is-size-2">
                    content_copy
                  </span>
                </button>
                <button
                  class="button is-medium is-outlined copy p-0 pl-1 pr-1 mr-3"
                  @click="copy(inference.answer.text)"
                  v-if="hasCopy[inference._originalIndex]"
                >
                  <span class="material-symbols-outlined is-size-2">check</span>
                </button>
                <button
                  class="button is-medium is-warning copy ml-3 pl-2"
                  @click="openMint(inference)"
                  :disabled="!!inference.nft"
                >
                  <span class="material-symbols-outlined is-size-2 mr-2">
                    {{ inference.nft ? "check_circle" : "token" }}
                  </span>
                  {{ inference.nft ? "Minted" : "Mint" }}
                </button>
                <button
                  class="button is-medium is-danger is-pulled-right ml-5 p-0 pl-1 pr-1"
                  @click="removeInference(inference._originalIndex)"
                  title="Remove this result"
                >
                  <span class="material-symbols-outlined is-size-2">
                    delete
                  </span>
                </button>
              </div>
            </li>
          </ol>
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
  toRaw,
  computed,
  watch,
  nextTick,
  onMounted,
  onUnmounted,
} from "vue";
import { v4 as uuid } from "uuid";
import VueMarkdown from "vue-markdown-render";
import useClipboard from "vue-clipboard3";
import MintModal from "./MintModal.vue";
import { modelStore } from "../stores/modelStore.js";

// Debounce utility for persistence
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

/**
 * Compute RAM and VRAM memory requirements for a model.
 *
 * For standard dense models:
 *   - Model weights: parameters * bytesPerParam (based on quantization)
 *   - KV cache: 2 * layers * headDim * kvHeads * context * dtype (fp16=2 bytes)
 *   - Overhead: ~10% buffer for scratch space, activations
 *
 * For MoE (Mixture of Experts) models:
 *   - VRAM: activeParameters determine inference compute
 *   - RAM: Full model weights loaded, experts swapped as needed
 *   - MoE models can run on smaller GPUs by keeping experts in RAM
 *
 * @param {Object} model - Model config from availableModels
 * @param {Object} options - Optional overrides
 * @param {string} options.quantization - Quantization type (e.g., 'Q4_K_M', 'Q5_K_M', 'TQ1_0')
 * @param {number} options.contextSize - Override default context size
 * @returns {Object} { vram, ram, diskSpace, canOffload, description }
 */
const computeMemoryRequirements = (model, options = {}) => {
  const {
    parameters,
    activeParameters,
    isMoE = false,
    context: defaultContext,
    filename = "",
  } = model;

  const contextSize = options.contextSize || defaultContext || 4096;

  // For VRAM estimation, cap KV cache context at a practical inference size.
  // The model's max context is a capability, not a static allocation —
  // KV cache grows dynamically during inference. Most engines default to 4096-8192.
  const kvContextSize = Math.min(contextSize, 8192);

  // Estimate bytes per parameter based on quantization from filename
  const getQuantBytesPerParam = (fname) => {
    const f = fname.toLowerCase();
    if (f.includes("tq1_0") || f.includes("q1_0")) return 0.2; // ~1.6 bits
    if (f.includes("iq2_")) return 0.28; // ~2.25 bits
    if (f.includes("q2_k")) return 0.3125; // ~2.5 bits
    if (f.includes("iq3_")) return 0.375; // ~3 bits
    if (f.includes("q3_k")) return 0.4375; // ~3.5 bits
    if (f.includes("iq4_")) return 0.5; // ~4 bits
    if (f.includes("q4_k") || f.includes("q4_0") || f.includes("q4_1"))
      return 0.5625; // ~4.5 bits
    if (f.includes("q5_k") || f.includes("q5_0") || f.includes("q5_1"))
      return 0.6875; // ~5.5 bits
    if (f.includes("q6_k")) return 0.8125; // ~6.5 bits
    if (f.includes("q8_k") || f.includes("q8_0")) return 1.0; // 8 bits
    if (f.includes("f16") || f.includes("fp16")) return 2.0; // 16 bits
    if (f.includes("f32") || f.includes("fp32")) return 4.0; // 32 bits
    return 0.5625; // Default to Q4_K estimate
  };

  const bytesPerParam = getQuantBytesPerParam(options.quantization || filename);

  // Estimate model dimensions from parameters (rough approximation)
  // For transformer: params ≈ 12 * L * d^2 where L=layers, d=hidden_dim
  // Simplify: assume layers ≈ sqrt(params / 2e9) * 8, capped
  //
  // For MoE models, use activeParameters for estimation since total params
  // are inflated by expert FFNs, not by additional layers/heads.
  const estimateFrom = isMoE && activeParameters ? activeParameters : parameters;

  const estimateLayers = (params) => {
    const p = params / 1e9;
    if (p <= 1.5) return 12;
    if (p <= 3) return 24;
    if (p <= 8) return 32;
    if (p <= 14) return 40;
    if (p <= 20) return 48;
    if (p <= 34) return 60;
    if (p <= 70) return 80;
    return 96;
  };

  const estimateHeadDim = (params) => {
    const p = params / 1e9;
    if (p <= 3) return 64;
    if (p <= 8) return 128;
    return 128;
  };

  const estimateKVHeads = (params) => {
    const p = params / 1e9;
    if (p <= 3) return 8;
    if (p <= 8) return 8;
    if (p <= 14) return 8;
    return 8; // GQA typically uses fewer KV heads
  };

  // Use model-specified architecture values if available, otherwise estimate.
  // MoE models should specify these since generic estimation from total params is unreliable.
  const layers = model.layers || estimateLayers(estimateFrom);
  const headDim = model.headDim || estimateHeadDim(estimateFrom);
  const kvHeads = model.kvHeads || estimateKVHeads(estimateFrom);

  // KV cache size: 2 (K+V) * layers * kvHeads * headDim * context * 2 (fp16)
  const kvCacheBytes = 2 * layers * kvHeads * headDim * kvContextSize * 2;

  // Model weights size
  const modelWeightsBytes = parameters * bytesPerParam;

  // Overhead for activations, scratch space (~10-15%)
  const overheadFactor = 1.1;

  let vramBytes, ramBytes, canOffload, description;

  if (isMoE && activeParameters) {
    // MoE model: only active parameters needed in VRAM for compute
    // Full model loads to RAM, experts swap in/out as needed

    // Active parameters for VRAM (what's actually computed per token)
    const activeWeightsBytes = activeParameters * bytesPerParam;

    // VRAM: active weights + KV cache + overhead
    vramBytes = (activeWeightsBytes + kvCacheBytes) * overheadFactor;

    // RAM: full model weights (experts stay in RAM until needed)
    // In practice, node-llama-cpp loads full model to RAM, GPU pulls active layers
    ramBytes = modelWeightsBytes * overheadFactor;

    canOffload = true;

    description =
      `MoE model with ${(parameters / 1e9).toFixed(1)}B total / ${(activeParameters / 1e9).toFixed(1)}B active params. ` +
      `VRAM needed: ${(vramBytes / 1e9).toFixed(1)}GB (active params + KV cache). ` +
      `RAM needed: ${(ramBytes / 1e9).toFixed(1)}GB (full model). ` +
      `Experts offload to RAM when not in use.`;
  } else {
    // Dense model: all weights needed in VRAM for inference
    vramBytes = (modelWeightsBytes + kvCacheBytes) * overheadFactor;
    ramBytes = modelWeightsBytes * 0.5; // System RAM as backup/swap

    canOffload = false;

    description =
      `Dense model with ${(parameters / 1e9).toFixed(1)}B params. ` +
      `VRAM needed: ${(vramBytes / 1e9).toFixed(1)}GB (weights + KV cache). ` +
      `Can offload layers to RAM if VRAM is insufficient.`;
  }

  return {
    vram: vramBytes,
    vramGB: +(vramBytes / 1e9).toFixed(2),
    ram: ramBytes,
    ramGB: +(ramBytes / 1e9).toFixed(2),
    diskSpace: modelWeightsBytes,
    diskSpaceGB: +(modelWeightsBytes / 1e9).toFixed(2),
    kvCacheGB: +(kvCacheBytes / 1e9).toFixed(2),
    canOffload,
    isMoE,
    description,
    // Breakdown for debugging
    breakdown: {
      parameters,
      activeParameters: activeParameters || parameters,
      bytesPerParam,
      layers,
      headDim,
      kvHeads,
      contextSize,
    },
  };
};

import GenerativeImage from "./GenerativeImage.vue";
import AccessRequirements from "./AccessRequirements.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";

export default {
  name: "GenerativeText",
  components: {
    VueMarkdown,
    GenerativeImage,
    AccessRequirements,
    MintModal,
  },
  setup() {
    // ------------ NFT Minting ---------
    const mintTarget = ref(null);

    const openMint = (inference) => {
      mintTarget.value = {
        inferenceType: "text",
        inferenceId: inference.id,
        content: inference.answer?.text,
        contentType: "text/plain",
        prompt: inference.question,
        generation: {
          type: "text-generation",
          model: inference.model || "llm",
          timestamp: inference.timestamp,
          tokensPerSecond: inference.tokensPerSecond || null,
        },
      };
    };

    const onMinted = (result) => {
      // Trigger re-render for shallowRef
      const arr = [...inferences.value];
      const inf = arr.find((i) => i.id === mintTarget.value?.inferenceId);
      if (inf) inf.nft = result;
      inferences.value = arr;
      mintTarget.value = null;
    };

    const downloadProgress = ref(0);
    const isLoading = ref(false);
    const isModel = ref(false);
    const openModel = ref(false);
    const openChat = ref(false);
    const reasoningEnabled = ref(false);

    // Model directory
    const modelDir = ref("");

    // Per-model availability tracking for the model list
    const modelAvailabilityMap = reactive({});
    const modelDownloading = reactive({});
    const modelDownloadProgress = reactive({});

    // Migration progress state
    const migrationProgress = reactive({
      active: false,
      pct: 0,
      detail: "",
      error: null,
    });

    // ------------ access control -----------
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

    const availableModels = ref({
      codestral_22_B: {
        modelname: "Codestral 22B",
        modeldesc:
          "22B-parameter Codestral model from Mistral AI with a 32,768-token context window. Specialized for code generation across 80+ programming languages with Fill-in-Middle support. Best for: dedicated coding copilot, multi-language development, and code completion tasks.",
        url: "https://huggingface.co/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf",
        filename: "codestral-22b-v0.1-q4_k_m.gguf",
        filesize: "13.3 GB",
        filesizeBytes: 13.3e9,
        parameters: 22000000000,
        context: 32768,
      },

      deepseek_R1_1_5_B: {
        modelname: "DeepSeek R1 1.5B",
        modeldesc:
          "1.5B-parameter DeepSeek-R1 distilled model on the Qwen backbone with a 32,768-token context window. Designed to pack strong chain-of-thought style reasoning into a tiny footprint. Best for: background reasoning agents and math/code helpers on very modest hardware.",
        url: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf",
        filename: "deepseek-r1-distill-qwen-1.5b-q4_k_m.gguf",
        filesize: "1.12 GB",
        filesizeBytes: 1.12e9,
        parameters: 1500000000,
        context: 32768,
        thinking: true,
      },

      deepseek_R1_7_B: {
        modelname: "DeepSeek R1 7B",
        modeldesc:
          "7B-parameter DeepSeek-R1 distilled Qwen model with a 32,768-token context window. Provides strong open-weight reasoning for math, code, and analytical tasks. Best for: primary local assistant focused on chain-of-thought reasoning and tool use on a single modern GPU.",
        url: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
        filename: "deepseek-r1-distill-qwen-7b-q4_k_m.gguf",
        filesize: "4.68 GB",
        filesizeBytes: 4.68e9,
        parameters: 7000000000,
        context: 32768,
        thinking: true,
      },

      deepseek_R1_32_B: {
        modelname: "DeepSeek R1 32B",
        modeldesc:
          "32B-parameter DeepSeek-R1 distilled Qwen model with a 32,768-token context window. High-end local reasoning model targeting complex multi-step problems and code. Best for: workstation or multi-GPU setups that need near frontier-level open reasoning quality.",
        url: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf",
        filename: "deepseek-r1-distill-qwen-32b-q4_k_m.gguf",
        filesize: "19.85 GB",
        filesizeBytes: 19.85e9,
        parameters: 32000000000,
        context: 32768,
        thinking: true,
      },

      gemma_3_1_B: {
        modelname: "Gemma 3 1B",
        modeldesc:
          "1B-parameter Gemma 3 instruction-tuned model from Google with a 32,768-token context window. A compact, efficient chat and reasoning model. Best for: lightweight multilingual assistants, summarization, and everyday QA on laptops or edge devices.",
        url: "https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf",
        filename: "gemma-3-1b-it-q4_k_m.gguf",
        filesize: "806 MB",
        filesizeBytes: 806e6,
        parameters: 1000000000,
        context: 32768,
      },

      gemma_3_12_B: {
        modelname: "Gemma 3 12B",
        modeldesc:
          "12B-parameter Gemma 3 instruction-tuned model from Google with a 32,768-token context window. A compact, efficient chat and reasoning model. Best for: lightweight multilingual assistants, summarization, and everyday QA on laptops or edge devices.",
        url: "https://huggingface.co/unsloth/gemma-3-12b-it-GGUF/resolve/main/gemma-3-12b-it-UD-Q4_K_XL.gguf",
        filename: "gemma-3-12b-it-ud-q4_k_xl.gguf",
        filesize: "7.43 GB",
        filesizeBytes: 7.43e9,
        parameters: 12000000000,
        context: 131072,
      },

      gpt_oss_20_B: {
        modelname: "GPT-OSS 20B",
        modeldesc:
          "20B-parameter GPT-OSS model with a long context window (up to around 131,072 tokens depending on runtime). Open-weight alternative to proprietary GPT-style models. Best for: demanding local reasoning, tool-using agents, and advanced coding on high-end hardware.",
        url: "https://huggingface.co/unsloth/gpt-oss-20b-GGUF/resolve/main/gpt-oss-20b-Q4_K_M.gguf",
        filename: "gpt-oss-20b-q4_k_m.gguf",
        filesize: "11.6 GB",
        filesizeBytes: 11.6e9,
        parameters: 20000000000,
        context: 131072,
      },

      hermes_4_14_B: {
        modelname: "Hermes 4 14B",
        modeldesc:
          "14B-parameter Hermes 4 hybrid reasoning model from Nous Research based on Qwen 3 14B with a 32,768-token context window. Features explicit <think> reasoning mode for deliberation. Best for: advanced reasoning, code generation, structured JSON outputs, and creative tasks.",
        url: "https://huggingface.co/bartowski/NousResearch_Hermes-4-14B-GGUF/resolve/main/NousResearch_Hermes-4-14B-Q4_K_M.gguf",
        filename: "nousresearch_hermes-4-14b-q4_k_m.gguf",
        filesize: "8.99 GB",
        filesizeBytes: 8.99e9,
        parameters: 14000000000,
        context: 32768,
      },

      llama_2_7_B: {
        modelname: "LLaMA 2 7B",
        modeldesc:
          "7B-parameter LLaMA 2 chat model from Meta with a 4,096-token context window. Classic open-weight assistant baseline. Best for: compatibility with older llama.cpp tooling, simple chatbots, and lightweight coding helpers.",
        url: "https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf",
        filename: "llama-2-7b-chat-q4_k_m.gguf",
        filesize: "4.08 GB",
        filesizeBytes: 4.08e9,
        parameters: 7000000000,
        context: 4096,
      },

      llama_3_1_8_B: {
        modelname: "LLaMA 3.1 8B",
        modeldesc:
          "8B-parameter LLaMA 3.1 instruct model from Meta with a 131,072-token context window. Modern, strong general-purpose assistant with good multilingual and coding performance. Best for: main local chat and coding assistant on a single recent GPU.",
        url: "https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
        filename: "meta-llama-3.1-8b-instruct-q4_k_m.gguf",
        filesize: "4.92 GB",
        filesizeBytes: 4.92e9,
        parameters: 8000000000,
        context: 131072,
      },

      mistral_7_B: {
        modelname: "Mistral 7B",
        modeldesc:
          "7B-parameter Mistral Instruct v0.2 model from Mistral AI with a 32,768-token context window. Efficient and fast with strong instruction following. Best for: multilingual chat, summarization, and tools/agent orchestration on a single consumer GPU.",
        url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        filename: "mistral-7b-instruct-v0.2-q4_k_m.gguf",
        filesize: "4.37 GB",
        filesizeBytes: 4.37e9,
        parameters: 7000000000,
        context: 32768,
      },

      mythomax_l2_13_B: {
        modelname: "MythoMax L2 13B",
        modeldesc:
          "13B-parameter MythoMax L2 model combining MythoLogic-L2 and Huginn with a 4,096-token context window. Exceptional creative writing and roleplay capabilities with nuanced character portrayal. Best for: interactive fiction, roleplay companions, and creative storytelling.",
        url: "https://huggingface.co/TheBloke/MythoMax-L2-13B-GGUF/resolve/main/mythomax-l2-13b.Q4_K_M.gguf",
        filename: "mythomax-l2-13b.q4_k_m.gguf",
        filesize: "7.87 GB",
        filesizeBytes: 7.87e9,
        parameters: 13000000000,
        context: 4096,
      },

      phi_3_3_8_B: {
        modelname: "Phi-3 Mini 3.8B",
        modeldesc:
          "3.8B-parameter Phi-3 Mini model from Microsoft with a 4,096-token context window. Trained on curated synthetic and filtered web data for strong small-model reasoning. Best for: very fast local chatbots, short-context coding, and educational assistants on CPU or iGPU.",
        url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
        filename: "phi-3-mini-4k-instruct-q4.gguf",
        filesize: "2.39 GB",
        filesizeBytes: 2.39e9,
        parameters: 3800000000,
        context: 4096,
      },

      phi_4_3_8_B: {
        modelname: "Phi-4 Mini 3.8B",
        modeldesc:
          "3.8B-parameter Phi-4 Mini instruction-tuned model from Microsoft with a 128,000-token context window. Long-context, reasoning-focused small model. Best for: document QA, longer chats, and compact local assistants that still handle large prompts.",
        url: "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf",
        filename: "phi-4-mini-instruct-q4_k_m.gguf",
        filesize: "2.49 GB",
        filesizeBytes: 2.49e9,
        parameters: 3800000000,
        context: 128000,
      },

      yi_coder_9_B: {
        modelname: "Yi-Coder 9B Chat",
        modeldesc:
          "9B-parameter Yi-Coder Chat model from 01.AI with 128K context window. First sub-10B model to pass 20% on LiveCodeBench. Supports 52 programming languages. Best for: capable coding assistant on modest hardware, long-context code understanding.",
        url: "https://huggingface.co/bartowski/Yi-Coder-9B-Chat-GGUF/resolve/main/Yi-Coder-9B-Chat-Q5_K_M.gguf",
        filename: "yi-coder-9b-chat-q5_k_m.gguf",
        filesize: "6.26 GB",
        filesizeBytes: 6.26e9,
        parameters: 9000000000,
        context: 131072,
      },

      yi_1_5_coder_9_B: {
        modelname: "Yi-Coder 1.5 9B Chat",
        modeldesc:
          "9B-parameter Yi-Coder Chat model from 01.AI with 128K context window. First sub-10B model to pass 20% on LiveCodeBench. Supports 52 programming languages. Best for: capable coding assistant on modest hardware, long-context code understanding.",
        url: "https://huggingface.co/bartowski/Yi-1.5-9B-Chat-GGUF/resolve/main/Yi-1.5-9B-Chat-Q5_K_M.gguf",
        filename: "yi1.5-coder-9b-chat-q5_k_m.gguf",
        filesize: "6.26 GB",
        filesizeBytes: 6.26e9,
        parameters: 9000000000,
        context: 131072,
      },

      glm_4_7_flash_q2: {
        modelname: "GLM 4.7 Flash Q2",
        modeldesc:
          "30B-parameter Mixture-of-Experts model from Zhipu AI with only 3B active parameters per forward pass and 200K context. Q2_K_XL quantization for fastest inference and lowest memory. Best for: uncensored creative writing, coding assistance, and general-purpose AI on consumer hardware.",
        url: "https://huggingface.co/unsloth/GLM-4.7-Flash-GGUF/resolve/main/GLM-4.7-Flash-UD-Q2_K_XL.gguf",
        filename: "glm-4.7-flash-ud-q2_k_xl.gguf",
        filesize: "11.9 GB",
        filesizeBytes: 11.9e9,
        parameters: 30000000000,
        activeParameters: 3000000000,
        isMoE: true,
        layers: 47,
        kvHeads: 20,
        headDim: 64,
        context: 200000,
      },

      glm_4_7_flash_q4: {
        modelname: "GLM 4.7 Flash Q4",
        modeldesc:
          "30B-parameter Mixture-of-Experts model from Zhipu AI with only 3B active parameters per forward pass and 200K context. Q4_K_XL quantization for balanced quality and speed. Best for: uncensored creative writing, coding assistance, reasoning, and general-purpose AI.",
        url: "https://huggingface.co/unsloth/GLM-4.7-Flash-GGUF/resolve/main/GLM-4.7-Flash-UD-Q4_K_XL.gguf",
        filename: "glm-4.7-flash-ud-q4_k_xl.gguf",
        filesize: "17.5 GB",
        filesizeBytes: 17.5e9,
        parameters: 30000000000,
        activeParameters: 3000000000,
        isMoE: true,
        layers: 47,
        kvHeads: 20,
        headDim: 64,
        context: 200000,
      },

      glm_4_7_flash_q8: {
        modelname: "GLM 4.7 Flash Q8",
        modeldesc:
          "30B-parameter Mixture-of-Experts model from Zhipu AI with only 3B active parameters per forward pass and 200K context. Q8_K_XL quantization for highest quality output. Best for: maximum fidelity creative writing, coding, and reasoning when memory allows.",
        url: "https://huggingface.co/unsloth/GLM-4.7-Flash-GGUF/resolve/main/GLM-4.7-Flash-UD-Q8_K_XL.gguf",
        filename: "glm-4.7-flash-ud-q8_k_xl.gguf",
        filesize: "35.6 GB",
        filesizeBytes: 35.6e9,
        parameters: 30000000000,
        activeParameters: 3000000000,
        isMoE: true,
        layers: 47,
        kvHeads: 20,
        headDim: 64,
        context: 200000,
      },

      qwen3_coder_next_80_B: {
        modelname: "Qwen 3 Coder Next 80B A3B",
        modeldesc:
          "80B-parameter Mixture-of-Experts Qwen3-Coder-Next model with only 3B active parameters per token and a native 262,144-token context window. Hybrid architecture (Gated DeltaNet + Gated Attention + MoE with 512 experts) designed for coding agents and long-horizon agentic reasoning. Best for: advanced coding copilots, multi-file refactoring, complex tool use, and IDE-integrated development agents.",
        url: "https://huggingface.co/unsloth/Qwen3-Coder-Next-GGUF/resolve/main/Qwen3-Coder-Next-Q4_K_M.gguf",
        filename: "qwen3-coder-next-q4_k_m.gguf",
        filesize: "48.5 GB",
        filesizeBytes: 48.5e9,
        parameters: 80000000000,
        activeParameters: 3000000000,
        isMoE: true,
        context: 262144,
      },

      qwen3_5_27_B: {
        modelname: "Qwen 3.5 27B",
        modeldesc:
          "27B-parameter Qwen 3.5 hybrid attention model combining DeltaNet linear attention with Gated Attention and a native 262,144-token context window. Q2_K quantization fits 32GB unified memory. Best for: advanced reasoning, creative writing, coding, and vision-capable tasks on Apple Silicon.",
        url: "https://huggingface.co/unsloth/Qwen3.5-27B-GGUF/resolve/main/Qwen3.5-27B-UD-Q2_K_XL.gguf",
        filename: "qwen3.5-27b-ud-q2_k_xl.gguf",
        filesize: "11.2 GB",
        filesizeBytes: 11.2e9,
        parameters: 27000000000,
        activeParameters: 8000000000,
        context: 262144,
        thinking: true,
      },

      nanbeige_4_1_3_B: {
        modelname: "Nanbeige 4.1 3B",
        modeldesc:
          "3B-parameter Nanbeige 4.1 model fine-tuned via SFT and RL for reasoning, preference alignment, and agentic capabilities. Supports English and Chinese. Excels at code, math, and multi-step reasoning in a compact package. Best for: lightweight reasoning tasks, code generation, tool use, and 3D object generation.",
        url: "https://huggingface.co/Edge-Quant/Nanbeige4.1-3B-Q4_K_M-GGUF/resolve/main/nanbeige4.1-3b-q4_k_m.gguf",
        filename: "nanbeige4.1-3b-q4_k_m.gguf",
        filesize: "2.44 GB",
        filesizeBytes: 2.44e9,
        parameters: 3000000000,
        context: 32768,
      },

      // ─── Qwen 3.5 Family (thinking models) ─────────────────────────────
      qwen3_5_0_8_B: {
        modelname: "Qwen 3.5 0.8B",
        modeldesc:
          "0.8B-parameter Qwen 3.5 ultra-compact hybrid model with Gated DeltaNet + Gated Attention and 131K context. The smallest Qwen3.5, ideal for fast captioning, lightweight assistants, and edge deployment. Best for: video captioning, quick summarization, and background agents on any hardware.",
        url: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
        filename: "qwen3.5-0.8b-q4_k_m.gguf",
        filesize: "600 MB",
        filesizeBytes: 600e6,
        parameters: 800000000,
        context: 131072,
      },

      qwen3_5_9_B_q4: {
        modelname: "Qwen 3.5 9B Q4",
        modeldesc:
          "9B-parameter Qwen 3.5 hybrid model with Gated DeltaNet + Gated Attention and 262K context. Q4_K_XL quantization. Fast dense architecture ideal for code generation, reasoning, and creative tasks. Best for: high-quality output with fast inference on 16GB+ machines.",
        url: "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-UD-Q4_K_XL.gguf",
        filename: "qwen3.5-9b-ud-q4_k_xl.gguf",
        filesize: "5.97 GB",
        filesizeBytes: 5.97e9,
        parameters: 9000000000,
        context: 262144,
        thinking: true,
      },

      qwen3_5_27_B_q4: {
        modelname: "Qwen 3.5 27B Q4",
        modeldesc:
          "27B-parameter Qwen 3.5 hybrid attention model with Q4_K_XL quantization and 262K context. Higher fidelity than Q2_K at the cost of more memory. Best for: users with 48GB+ unified memory wanting better quality Qwen 3.5 output.",
        url: "https://huggingface.co/unsloth/Qwen3.5-27B-GGUF/resolve/main/Qwen3.5-27B-UD-Q4_K_XL.gguf",
        filename: "qwen3.5-27b-ud-q4_k_xl.gguf",
        filesize: "16.7 GB",
        filesizeBytes: 16.7e9,
        parameters: 27000000000,
        activeParameters: 8000000000,
        context: 262144,
        thinking: true,
      },
      qwen3_5_27_B_q8: {
        modelname: "Qwen 3.5 27B Q8",
        modeldesc:
          "27B-parameter Qwen 3.5 hybrid attention model with Q8_K_XL quantization and 262K context. Near-lossless quality for maximum fidelity. Best for: workstations with 64GB+ memory wanting the best Qwen 3.5 27B quality.",
        url: "https://huggingface.co/unsloth/Qwen3.5-27B-GGUF/resolve/main/Qwen3.5-27B-UD-Q8_K_XL.gguf",
        filename: "qwen3.5-27b-ud-q8_k_xl.gguf",
        filesize: "32.4 GB",
        filesizeBytes: 32.4e9,
        parameters: 27000000000,
        activeParameters: 8000000000,
        context: 262144,
        thinking: true,
      },
      qwen3_5_35_B_a3b_iq3: {
        modelname: "Qwen 3.5 35B A3B IQ3",
        modeldesc:
          "35B-parameter MoE Qwen 3.5 model with only 3B active parameters per token and 262K context. IQ3_XXS quantization — compact 3-bit with superior accuracy via Unsloth Dynamic quant. Best for: high-quality 3D code generation and reasoning on consumer hardware.",
        url: "https://huggingface.co/unsloth/Qwen3.5-35B-A3B-GGUF/resolve/main/Qwen3.5-35B-A3B-UD-IQ3_XXS.gguf",
        filename: "qwen3.5-35b-a3b-ud-iq3_xxs.gguf",
        filesize: "13.1 GB",
        filesizeBytes: 13.1e9,
        parameters: 35000000000,
        activeParameters: 3000000000,
        isMoE: true,
        context: 262144,
        thinking: true,
      },
      qwen3_5_35_B_a3b_q2: {
        modelname: "Qwen 3.5 35B A3B",
        modeldesc:
          "35B-parameter MoE Qwen 3.5 model with only 3B active parameters per token and 262K context. Q2_K_XL quantization. Ultra-efficient MoE architecture for fast inference. Best for: lightweight yet capable reasoning on consumer hardware.",
        url: "https://huggingface.co/unsloth/Qwen3.5-35B-A3B-GGUF/resolve/main/Qwen3.5-35B-A3B-UD-Q2_K_XL.gguf",
        filename: "qwen3.5-35b-a3b-ud-q2_k_xl.gguf",
        filesize: "12.9 GB",
        filesizeBytes: 12.9e9,
        parameters: 35000000000,
        activeParameters: 3000000000,
        isMoE: true,
        context: 262144,
        thinking: true,
      },
      qwen3_5_35_B_a3b_q4: {
        modelname: "Qwen 3.5 35B A3B Q4",
        modeldesc:
          "35B-parameter MoE Qwen 3.5 model with 3B active parameters. Q4_K_XL quantization for higher fidelity. Best for: users wanting better quality MoE inference with moderate memory.",
        url: "https://huggingface.co/unsloth/Qwen3.5-35B-A3B-GGUF/resolve/main/Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf",
        filename: "qwen3.5-35b-a3b-ud-q4_k_xl.gguf",
        filesize: "20.6 GB",
        filesizeBytes: 20.6e9,
        parameters: 35000000000,
        activeParameters: 3000000000,
        isMoE: true,
        context: 262144,
        thinking: true,
      },
      qwen3_5_35_B_a3b_q8: {
        modelname: "Qwen 3.5 35B A3B Q8",
        modeldesc:
          "35B-parameter MoE Qwen 3.5 model with 3B active parameters. Q8_K_XL near-lossless quantization. Best for: maximum quality MoE inference on systems with 64GB+ memory.",
        url: "https://huggingface.co/unsloth/Qwen3.5-35B-A3B-GGUF/resolve/main/Qwen3.5-35B-A3B-UD-Q8_K_XL.gguf",
        filename: "qwen3.5-35b-a3b-ud-q8_k_xl.gguf",
        filesize: "38.7 GB",
        filesizeBytes: 38.7e9,
        parameters: 35000000000,
        activeParameters: 3000000000,
        isMoE: true,
        context: 262144,
        thinking: true,
      },
      qwen3_5_122_B_a10b_q2: {
        modelname: "Qwen 3.5 122B A10B",
        modeldesc:
          "122B-parameter MoE Qwen 3.5 model with 10B active parameters and 262K context. Q2_K_XL quantization. Frontier-class reasoning with efficient MoE inference. Best for: high-end workstations with 64GB+ memory.",
        url: "https://huggingface.co/unsloth/Qwen3.5-122B-A10B-GGUF/resolve/main/Qwen3.5-122B-A10B-UD-Q2_K_XL.gguf",
        filename: "qwen3.5-122b-a10b-ud-q2_k_xl.gguf",
        filesize: "46.7 GB",
        filesizeBytes: 46.7e9,
        parameters: 122000000000,
        activeParameters: 10000000000,
        isMoE: true,
        context: 262144,
        thinking: true,
      },
      qwen3_5_122_B_a10b_q4: {
        modelname: "Qwen 3.5 122B A10B Q4",
        modeldesc:
          "122B-parameter MoE Qwen 3.5 model with 10B active parameters. Q4_K_XL quantization (3 shards). Best for: multi-GPU or 128GB+ memory systems wanting high-quality frontier reasoning.",
        url: "https://huggingface.co/unsloth/Qwen3.5-122B-A10B-GGUF/resolve/main/Qwen3.5-122B-A10B-UD-Q4_K_XL-00001-of-00003.gguf",
        filename: "qwen3.5-122b-a10b-ud-q4_k_xl-00001-of-00003.gguf",
        filesize: "68.4 GB",
        filesizeBytes: 68.4e9,
        parameters: 122000000000,
        activeParameters: 10000000000,
        isMoE: true,
        context: 262144,
        thinking: true,
      },
      qwen3_5_397_B_a17b_q2: {
        modelname: "Qwen 3.5 397B A17B",
        modeldesc:
          "397B-parameter MoE Qwen 3.5 model with 17B active parameters and 262K context. Q2_K_XL quantization. The largest Qwen 3.5 variant for maximum reasoning capability. Best for: multi-GPU clusters or 256GB+ memory systems.",
        url: "https://huggingface.co/unsloth/Qwen3.5-397B-A17B-GGUF/resolve/main/Qwen3.5-397B-A17B-UD-Q2_K_XL-00001-of-00005.gguf",
        filename: "qwen3.5-397b-a17b-ud-q2_k_xl-00001-of-00005.gguf",
        filesize: "149 GB",
        filesizeBytes: 149e9,
        parameters: 397000000000,
        activeParameters: 17000000000,
        isMoE: true,
        context: 262144,
        thinking: true,
      },
      qwen3_5_397_B_a17b_q4: {
        modelname: "Qwen 3.5 397B A17B Q4",
        modeldesc:
          "397B-parameter MoE Qwen 3.5 model with 17B active parameters. Q4_K_XL quantization (6 shards). Best for: maximum quality on multi-GPU clusters with 384GB+ total memory.",
        url: "https://huggingface.co/unsloth/Qwen3.5-397B-A17B-GGUF/resolve/main/Qwen3.5-397B-A17B-UD-Q4_K_XL-00001-of-00006.gguf",
        filename: "qwen3.5-397b-a17b-ud-q4_k_xl-00001-of-00006.gguf",
        filesize: "219 GB",
        filesizeBytes: 219e9,
        parameters: 397000000000,
        activeParameters: 17000000000,
        isMoE: true,
        context: 262144,
        thinking: true,
      },

      // ─── Kimi K2.5 (thinking model, MoE 1T/32B) ──────────────────────
      kimi_k2_5_q4: {
        modelname: "Kimi K2.5 Q4",
        modeldesc:
          "1T-parameter MoE model from Moonshot AI with 32B active parameters and 256K context. Q4_K_XL quantization (13 shards). One of the largest open-weight models available. Best for: frontier-class reasoning on multi-GPU clusters with 1TB+ total memory.",
        url: "https://huggingface.co/unsloth/Kimi-K2.5-GGUF/resolve/main/Kimi-K2.5-UD-Q4_K_XL-00001-of-00013.gguf",
        filename: "kimi-k2.5-ud-q4_k_xl-00001-of-00013.gguf",
        filesize: "622 GB",
        filesizeBytes: 622e9,
        parameters: 1000000000000,
        activeParameters: 32000000000,
        isMoE: true,
        context: 256000,
        thinking: true,
      },

      // ─── MiniMax M2.5 (thinking model, MoE 229B/10B) ─────────────────
      minimax_m2_5_q4: {
        modelname: "MiniMax M2.5 Q4",
        modeldesc:
          "229B-parameter MoE model from MiniMax with 10B active parameters and 205K context. Q4_K_XL quantization (4 shards). Strong reasoning and code generation at moderate MoE scale. Best for: high-end workstations with 192GB+ memory.",
        url: "https://huggingface.co/unsloth/MiniMax-M2.5-GGUF/resolve/main/MiniMax-M2.5-UD-Q4_K_XL-00001-of-00004.gguf",
        filename: "minimax-m2.5-ud-q4_k_xl-00001-of-00004.gguf",
        filesize: "131 GB",
        filesizeBytes: 131e9,
        parameters: 229000000000,
        activeParameters: 10000000000,
        isMoE: true,
        context: 205000,
        thinking: true,
      },

      // ─── Devstral Small 2 24B (coding-focused, dense) ─────────────────
      devstral_24_B_q2: {
        modelname: "Devstral 24B",
        modeldesc:
          "24B-parameter dense coding model from Mistral AI with 256K context. Q2_K_XL quantization. Specialized for code generation, debugging, and software engineering tasks. Best for: dedicated coding copilot on consumer GPUs with 16GB+ VRAM.",
        url: "https://huggingface.co/unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF/resolve/main/Devstral-Small-2-24B-Instruct-2512-UD-Q2_K_XL.gguf",
        filename: "devstral-small-2-24b-instruct-2512-ud-q2_k_xl.gguf",
        filesize: "9.29 GB",
        filesizeBytes: 9.29e9,
        parameters: 24000000000,
        context: 256000,
      },
      devstral_24_B_q4: {
        modelname: "Devstral 24B Q4",
        modeldesc:
          "24B-parameter dense coding model from Mistral AI with 256K context. Q4_K_XL quantization for higher fidelity code generation. Best for: serious development work on systems with 24GB+ VRAM.",
        url: "https://huggingface.co/unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF/resolve/main/Devstral-Small-2-24B-Instruct-2512-UD-Q4_K_XL.gguf",
        filename: "devstral-small-2-24b-instruct-2512-ud-q4_k_xl.gguf",
        filesize: "14.5 GB",
        filesizeBytes: 14.5e9,
        parameters: 24000000000,
        context: 256000,
      },
      devstral_24_B_q8: {
        modelname: "Devstral 24B Q8",
        modeldesc:
          "24B-parameter dense coding model from Mistral AI with 256K context. Q8_K_XL near-lossless quantization. Best for: maximum code generation quality on workstations with 48GB+ memory.",
        url: "https://huggingface.co/unsloth/Devstral-Small-2-24B-Instruct-2512-GGUF/resolve/main/Devstral-Small-2-24B-Instruct-2512-UD-Q8_K_XL.gguf",
        filename: "devstral-small-2-24b-instruct-2512-ud-q8_k_xl.gguf",
        filesize: "29 GB",
        filesizeBytes: 29e9,
        parameters: 24000000000,
        context: 256000,
      },

      // ─── Ministral 3 (compact, dense) ─────────────────────────────────
      ministral_3_3_B_q4: {
        modelname: "Ministral 3B",
        modeldesc:
          "3B-parameter compact instruction model from Mistral AI with 256K context. Q4_K_XL quantization. Ultra-lightweight for edge deployment. Best for: fast local assistants, embedded systems, and quick code helpers on minimal hardware.",
        url: "https://huggingface.co/unsloth/Ministral-3-3B-Instruct-2512-GGUF/resolve/main/Ministral-3-3B-Instruct-2512-UD-Q4_K_XL.gguf",
        filename: "ministral-3-3b-instruct-2512-ud-q4_k_xl.gguf",
        filesize: "2.19 GB",
        filesizeBytes: 2.19e9,
        parameters: 3000000000,
        context: 256000,
      },
      ministral_3_8_B_q4: {
        modelname: "Ministral 8B",
        modeldesc:
          "8B-parameter instruction model from Mistral AI with 256K context. Q4_K_XL quantization. Strong general-purpose performance in a compact package. Best for: versatile local assistant with long context on a single consumer GPU.",
        url: "https://huggingface.co/unsloth/Ministral-3-8B-Instruct-2512-GGUF/resolve/main/Ministral-3-8B-Instruct-2512-UD-Q4_K_XL.gguf",
        filename: "ministral-3-8b-instruct-2512-ud-q4_k_xl.gguf",
        filesize: "5.29 GB",
        filesizeBytes: 5.29e9,
        parameters: 8000000000,
        context: 256000,
      },

      qwen3_5_4B: {
        modelname: "Qwen 3.5 4B",
        modeldesc:
          "4B-parameter hybrid Qwen 3.5 model with Gated DeltaNet + Gated Attention and 262K context. Q4_K_M quantization. Compact and fast. Best for: efficient local inference, code generation, and 3D scene crafting on modest hardware.",
        url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
        filename: "qwen3.5-4b-q4_k_m.gguf",
        filesize: "2.8 GB",
        filesizeBytes: 2.8e9,
        parameters: 4000000000,
        context: 262144,
      },
    });

    const sortedModels = computed(() =>
      Object.values(availableModels.value).sort((a, b) =>
        a.modelname.localeCompare(b.modelname)
      )
    );

    const currentModel = ref({
      modelname: "Qwen 3.5 0.8B",
      modeldesc:
        "0.8B-parameter Qwen 3.5 ultra-compact hybrid model with Gated DeltaNet + Gated Attention and 131K context. The smallest Qwen3.5, ideal for fast captioning, lightweight assistants, and edge deployment. Best for: video captioning, quick summarization, and background agents on any hardware.",
      url: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
      filename: "qwen3.5-0.8b-q4_k_m.gguf",
      filesize: "600 MB",
      filesizeBytes: 600e6,
      parameters: 800000000,
      context: 131072,
    });

    const pickModel = async (model) => {
      currentModel.value = { ...model };
      const available = await isModelAvailable(model.filename);
      await checkMmprojAvailability(model);

      // Load model immediately if it's available (and mmproj is available for multimodal models)
      if (available) {
        const canLoad = !model.isMultimodal || isMmprojAvailable.value;
        if (canLoad) {
          await loadModel(model);
        }
      }
    };

    const isModelAvailable = async (filename) => {
      const available = await window.electronAPI.checkModel(filename);
      isModel.value = available;
      return available;
    };

    const downloadModel = async (url, filename) => {
      isLoading.value = true;

      console.log("Now downloading model...", url, filename);
      downloadProgress.value = 0;

      window.electronAPI.onDownloadProgress((e, data) => {
        if (data.filename === currentModel.value.filename) {
          downloadProgress.value = Math.round(data.percent * 100);
        }
      });

      const success = await window.electronAPI.downloadModel(url, filename);
      isLoading.value = false;
      downloadProgress.value = 0;

      if (success) {
        isModel.value = true;
        modelAvailabilityMap[filename] = true;
        console.log("Model download success!");
      } else {
        console.error("Model download failure...");
      }
      isLoading.value = false;
    };

    const deleteModel = async (filename) => {
      isLoading.value = true;
      const success = await window.electronAPI.deleteModel(filename);
      console.log("Now deleting model...", filename);
      if (success) {
        isModel.value = false;
        modelAvailabilityMap[filename] = false;
        console.log("Model deleting success!");
      } else {
        console.error("Model deleting failure...");
      }
      isLoading.value = false;
    };

    // Check availability of all models in the list
    const checkAllModelAvailability = async () => {
      const models = Object.values(availableModels.value);
      await Promise.all(
        models.map(async (model) => {
          try {
            const available = await window.electronAPI.checkModel(
              model.filename,
            );
            modelAvailabilityMap[model.filename] = available;
          } catch {
            modelAvailabilityMap[model.filename] = false;
          }
        }),
      );
    };

    // Download a model from the model list
    const downloadModelInList = async (model) => {
      modelDownloading[model.filename] = true;
      modelDownloadProgress[model.filename] = 0;

      const progressHandler = (_e, data) => {
        if (data.filename === model.filename) {
          modelDownloadProgress[model.filename] = Math.round(
            data.percent * 100,
          );
        }
      };
      window.electronAPI.onDownloadProgress(progressHandler);

      try {
        const success = await window.electronAPI.downloadModel(
          model.url,
          model.filename,
        );
        if (success) {
          modelAvailabilityMap[model.filename] = true;
        }
      } catch (e) {
        console.error(`Failed to download ${model.filename}:`, e);
      } finally {
        modelDownloading[model.filename] = false;
        modelDownloadProgress[model.filename] = 0;
      }
    };

    // Delete a model from the model list
    const deleteModelInList = async (model) => {
      modelDownloading[model.filename] = true;
      try {
        const success = await window.electronAPI.deleteModel(model.filename);
        if (success) {
          modelAvailabilityMap[model.filename] = false;
          // If the deleted model is the currently selected one, update its status
          if (currentModel.value.filename === model.filename) {
            isModel.value = false;
          }
        }
      } catch (e) {
        console.error(`Failed to delete ${model.filename}:`, e);
      } finally {
        modelDownloading[model.filename] = false;
      }
    };

    // Change model directory
    const changeModelDir = async () => {
      // Subscribe to migration progress events
      migrationProgress.active = false;
      migrationProgress.pct = 0;
      migrationProgress.detail = "";
      migrationProgress.error = null;

      let unsubscribe = null;
      if (window.electronAPI?.onMigrationProgress) {
        unsubscribe = window.electronAPI.onMigrationProgress((data) => {
          if (data.phase === "error") {
            migrationProgress.active = false;
            migrationProgress.error = data.detail;
            return;
          }
          if (data.phase === "complete") {
            migrationProgress.active = false;
            migrationProgress.pct = 100;
            migrationProgress.detail = data.detail;
            return;
          }
          migrationProgress.active = true;
          migrationProgress.pct = data.pct || 0;
          migrationProgress.detail = data.detail || "";
        });
      }

      try {
        const result = await window.electronAPI.selectModelDir();
        if (result && typeof result === "string") {
          modelDir.value = result;
          // Re-check all model availability in the new directory
          await checkAllModelAvailability();
          // Re-check current model
          await isModelAvailable(currentModel.value.filename);
        }
      } finally {
        if (unsubscribe) unsubscribe();
      }
    };

    // Load model directory on init
    const loadModelDir = async () => {
      if (window.electronAPI?.getModelDir) {
        modelDir.value = await window.electronAPI.getModelDir();
      }
    };

    // Refresh model availability when the modal opens
    watch(openModel, async (isOpen) => {
      if (isOpen) {
        await checkAllModelAvailability();
      }
    });

    const loadModel = async (model) => {
      console.log("Now loading (raw)...", model);

      const payload = {
        filename: model.filename,
        modelname: model.modelname,
        parameters: model.parameters,
        context: model.context,
        filesizeBytes: model.filesizeBytes,
        activeParameters: model.activeParameters,
        isMoE: model.isMoE,
        isMultimodal: model.isMultimodal || false,
        mmproj: model.mmproj || null,
      };

      console.log("Sending to electronAPI.loadModel:", payload);

      await window.electronAPI.loadModel(payload);

      // Update mmproj availability for multimodal models
      if (model.isMultimodal && model.mmproj) {
        isMmprojAvailable.value = await window.electronAPI.checkMmproj(
          model.mmproj,
        );
      } else {
        isMmprojAvailable.value = false;
      }
    };

    // Image attachment handlers
    const attachImage = (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        attachedImage.value = {
          dataUrl: e.target.result,
          name: file.name,
        };
      };
      reader.readAsDataURL(file);
    };

    const removeAttachedImage = () => {
      attachedImage.value = null;
    };

    // Download mmproj for multimodal models
    const downloadMmproj = async (model) => {
      if (!model.isMultimodal || !model.mmprojUrl) return;

      isLoading.value = true;
      mmprojDownloadProgress.value = 0;

      window.electronAPI.onDownloadProgress((e, data) => {
        if (data.filename === model.mmproj) {
          mmprojDownloadProgress.value = Math.round(data.percent * 100);
        }
      });

      try {
        await window.electronAPI.downloadMmproj(model.mmprojUrl, model.mmproj);
        isMmprojAvailable.value = true;
        console.log("Mmproj download success!");
      } catch (err) {
        console.error("Mmproj download failed:", err);
      }

      isLoading.value = false;
      mmprojDownloadProgress.value = 0;
    };

    // Check mmproj availability when model changes
    const checkMmprojAvailability = async (model) => {
      if (model?.isMultimodal && model?.mmproj) {
        isMmprojAvailable.value = await window.electronAPI.checkMmproj(
          model.mmproj,
        );
      } else {
        isMmprojAvailable.value = false;
      }
    };

    // Use shallowRef for better performance with large chat histories
    const inferences = shallowRef([]);
    const hasCopy = shallowRef([]);

    // ------------ lazy loading pagination ----------------
    const ITEMS_PER_PAGE = 20;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);

    // Get text content from any format
    const getTextContent = (item) => {
      // Component format: answer.text
      if (item.answer?.text !== undefined) return item.answer.text;
      // String answer directly
      if (typeof item.answer === "string") return item.answer;
      // Direct text property
      if (item.text) return item.text;
      return null;
    };

    // Normalize inference to component format
    const normalizeInference = (item) => {
      const textContent = getTextContent(item);
      if (textContent === null) return null;

      // Already in component format with valid data
      if (item.answer?.text !== undefined) {
        return item;
      }

      // Convert any other format to component format
      return {
        ...item,
        question: item.question || item.prompt || "",
        answer: {
          text: textContent,
          id: item.id || item.answer?.id || "",
        },
      };
    };

    // Reversed inferences (most recent first) with original index
    // Normalize data structure for compatibility
    const reversedInferences = computed(() => {
      const normalized = inferences.value
        .map((item, idx) => {
          const norm = normalizeInference(item);
          if (!norm) {
            console.warn("[GenerativeText] Skipping invalid inference:", item);
            return null;
          }
          return {
            ...norm,
            _originalIndex: idx,
          };
        })
        .filter((item) => item && item.answer?.text !== undefined);

      console.log(
        `[GenerativeText] ${inferences.value.length} total, ${normalized.length} valid`,
      );
      return normalized.reverse();
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

    const cleanupScrollObserver = () => {
      if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
      }
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

    const setupScrollListener = () => {
      const container = document.querySelector(".models__deployment-install");
      if (container) {
        scrollContainer.value = container;
        container.addEventListener("scroll", handleScroll, { passive: true });
      }
    };

    const cleanupScrollListener = () => {
      if (scrollContainer.value) {
        scrollContainer.value.removeEventListener("scroll", handleScroll);
      }
    };

    // Delete a single inference from history
    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.value.length) return;
      inferences.value = inferences.value.filter((_, i) => i !== idx);
      hasCopy.value = hasCopy.value.filter((_, i) => i !== idx);
      persistInferences([...inferences.value]);
    };

    // Debounced persistence
    const persistInferences = debounce(async (data) => {
      try {
        // Use JSON.parse/stringify to ensure proper serialization
        await window.electronAPI?.store?.set?.(
          "textInferences",
          JSON.parse(JSON.stringify(data)),
        );
      } catch (e) {
        console.error("[GenerativeText] Failed to persist inferences:", e);
      }
    }, 500);

    const initialState = {
      prompt: "",
    };

    const form = reactive({ ...initialState });

    // Image attachment for multimodal models
    const attachedImage = ref(null); // { dataUrl, name }
    const isMmprojAvailable = ref(false);
    const mmprojDownloadProgress = ref(0);

    // Check if current model supports vision
    const isMultimodalModel = computed(() => {
      return currentModel.value?.isMultimodal === true;
    });

    // Check if current model supports thinking/reasoning
    const isThinkingModel = computed(() => {
      return currentModel.value?.thinking === true;
    });

    function resetForm() {
      Object.assign(form, initialState);
      attachedImage.value = null;
    }

    async function resetChat() {
      inferences.value = [];
      // Clear persisted text inferences
      try {
        await window.electronAPI?.store?.set?.("textInferences", []);
      } catch (e) {
        console.error("Failed to clear text inferences:", e);
      }
    }

    const exportHistory = () => {
      if (!inferences.value || inferences.value.length === 0) return;
      const data = JSON.stringify(inferences.value, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-text-history-${Date.now()}.json`;
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

    // Load persisted text inferences on component mount
    const loadHistory = async () => {
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "textInferences",
          [],
        );
        if (Array.isArray(saved)) {
          inferences.value = saved;
          hasCopy.value = new Array(saved.length).fill(false);
        }
      } catch (e) {
        console.error("Failed to load text inferences:", e);
      }
    };

    // Streaming state: the inference currently being streamed
    const streamingText = ref("");
    const streamingInferenceId = ref(null);

    const sendMessage = async (prompt) => {
      if (!hasAccess.value) return;

      isLoading.value = true;
      streamingText.value = "";

      // Create the inference entry immediately so streaming text appears
      const answerId = uuid();
      streamingInferenceId.value = answerId;
      const modelName = currentModel.value?.modelname || "Unknown";
      const newInference = {
        question: prompt,
        answer: { id: answerId, text: "" },
        image: attachedImage.value?.dataUrl || null,
        model: modelName,
        tokensPerSecond: null,
      };
      inferences.value = [...inferences.value, newInference];
      hasCopy.value = [...hasCopy.value, false];

      try {
        let assistantResult;
        let tokenCount = 0;
        const startTime = performance.now();

        // Check if we have an attached image and current model is multimodal
        if (attachedImage.value && isMultimodalModel.value) {
          console.log("Sending vision message with image...");
          assistantResult = await window.electronAPI.chatVision(
            prompt,
            attachedImage.value.dataUrl,
          );
        } else {
          // Stream text-only inference (with fallback to non-streaming)
          const chatOpts = {};
          if (!reasoningEnabled.value) chatOpts.thoughtTokens = 0;

          const canStream =
            typeof window.electronAPI.chatStream === "function" &&
            typeof window.electronAPI.onChatToken === "function";

          if (canStream) {
            // Subscribe to token stream
            const unsubscribe = window.electronAPI.onChatToken((chunk) => {
              tokenCount++;
              streamingText.value += chunk;
              // Update the last inference's answer text in-place
              const arr = inferences.value;
              const last = arr[arr.length - 1];
              if (last && last.answer.id === answerId) {
                last.answer.text = streamingText.value;
                // Live tok/s update
                const elapsed = (performance.now() - startTime) / 1000;
                if (elapsed > 0.1)
                  last.tokensPerSecond = (tokenCount / elapsed).toFixed(1);
                inferences.value = [...arr];
              }
            });

            try {
              assistantResult = await window.electronAPI.chatStream(
                prompt,
                chatOpts,
              );
            } finally {
              unsubscribe();
            }
          } else {
            // Fallback: non-streaming (old preload without chatStream)
            assistantResult = await window.electronAPI.chat(prompt, chatOpts);
          }
        }

        // Compute final tokens/s
        const elapsedSec = (performance.now() - startTime) / 1000;
        const finalTokPerSec =
          tokenCount > 0 && elapsedSec > 0
            ? (tokenCount / elapsedSec).toFixed(1)
            : null;

        // Final update with complete text (ensures consistency)
        const arr = inferences.value;
        const last = arr[arr.length - 1];
        if (last && last.answer.id === answerId) {
          last.answer.text = assistantResult;
          last.tokensPerSecond = finalTokPerSec;
          inferences.value = [...arr];
        }

        console.log("prompt", {
          id: answerId,
          text: assistantResult,
          tokPerSec: finalTokPerSec,
        });

        // Debounced persistence
        persistInferences([...inferences.value]);

        resetForm();
        isLoading.value = false;
      } catch (e) {
        console.error("Chat error:", e);
        // Remove the empty streaming entry on error
        const arr = inferences.value;
        const last = arr[arr.length - 1];
        if (last && last.answer.id === answerId && !last.answer.text) {
          inferences.value = arr.slice(0, -1);
          hasCopy.value = hasCopy.value.slice(0, -1);
        }
        isLoading.value = false;
      } finally {
        streamingText.value = "";
        streamingInferenceId.value = null;
      }
    };

    const { toClipboard } = useClipboard();

    const copy = async (answer) => {
      try {
        await toClipboard(answer);
        console.log("Answered copied to clipboard.");
      } catch (e) {
        console.error(e);
      }
    };

    // Handle clicks inside answer divs — code block copy via event delegation
    const handleAnswerClick = async (event) => {
      const btn = event.target.closest(".code-copy-btn");
      if (!btn) return;
      const pre = btn.closest("pre");
      if (!pre) return;
      const code = pre.querySelector("code");
      const text = code ? code.textContent : pre.textContent;
      try {
        await toClipboard(text);
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = "Copy";
        }, 1500);
      } catch (e) {
        console.error("Failed to copy code:", e);
      }
    };

    // Inject copy buttons into rendered <pre> code blocks
    const injectCodeCopyButtons = () => {
      const answerEls = document.querySelectorAll(".markdown-body pre");
      answerEls.forEach((pre) => {
        if (pre.querySelector(".code-copy-btn")) return; // already injected
        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.textContent = "Copy";
        btn.type = "button";
        pre.style.position = "relative";
        pre.appendChild(btn);
      });
    };

    // Re-inject copy buttons whenever inferences change
    watch(
      () => inferences.value.length,
      () => nextTick(injectCodeCopyButtons),
    );
    // Also re-inject on streaming updates (answer text changes)
    watch(streamingText, () => nextTick(injectCodeCopyButtons));

    // Always loaded toggle state (from shared store)
    const alwaysLoaded = computed(() => modelStore.state.alwaysLoaded);
    const toggleAlwaysLoaded = () => {
      modelStore.setAlwaysLoaded(!alwaysLoaded.value);
    };

    // Sync modelStore when user picks a model locally
    watch(currentModel, (model) => {
      if (model?.filename) {
        modelStore.setCurrent(model);
      }
    });

    // Sync local state when model changes externally (hot-swap)
    watch(
      () => modelStore.state.current,
      (storeModel) => {
        if (storeModel && storeModel.filename !== currentModel.value.filename) {
          // Find matching model in available models
          const match = Object.values(availableModels.value).find(
            (m) => m.filename === storeModel.filename,
          );
          if (match) {
            currentModel.value = { ...match };
          }
        }
      },
    );

    // Listen for bottom bar "browse models" event
    const handleShowBrowseModels = () => {
      openModel.value = true;
    };
    onMounted(() => {
      window.addEventListener("bonzai:show-browse-models", handleShowBrowseModels);
    });
    onUnmounted(() => {
      window.removeEventListener("bonzai:show-browse-models", handleShowBrowseModels);
    });

    return {
      downloadProgress,
      isLoading,
      isModel,
      availableModels,
      sortedModels,
      currentModel,
      isModelAvailable,
      pickModel,
      downloadModel,
      deleteModel,
      loadModel,
      openModel,
      // Model list management
      loadModelDir,
      modelDir,
      modelAvailabilityMap,
      modelDownloading,
      modelDownloadProgress,
      downloadModelInList,
      deleteModelInList,
      changeModelDir,
      migrationProgress,
      openChat,
      form,
      sendMessage,
      inferences,
      resetChat,
      exportHistory,
      importHistory,
      copy,
      hasCopy,
      removeInference,
      handleAnswerClick,
      streamingInferenceId,
      // lazy loading pagination
      paginatedInferences,
      loadMoreSentinel,
      hasMore,
      isLoadingMore,
      setupScrollObserver,
      cleanupScrollObserver,
      // scroll to top
      showScrollTop,
      scrollToTop,
      setupScrollListener,
      cleanupScrollListener,
      // access control
      accessRef,
      hasAccess,
      onAccessChanged,
      // memory requirements computation
      computeMemoryRequirements,
      // multimodal/vision support
      isMultimodalModel,
      // reasoning toggle
      isThinkingModel,
      reasoningEnabled,
      attachedImage,
      attachImage,
      removeAttachedImage,
      isMmprojAvailable,
      mmprojDownloadProgress,
      downloadMmproj,
      // Network modal
      requestOpenNetworkModal,
      // NFT Minting
      mintTarget,
      openMint,
      onMinted,
      // Always loaded
      alwaysLoaded,
      toggleAlwaysLoaded,
    };
  },
  async mounted() {
    // Load model directory path
    if (window.electronAPI?.getModelDir) {
      this.modelDir = await window.electronAPI.getModelDir();
    }

    const readyToPrompt = await this.isModelAvailable(
      this.currentModel.filename,
    );
    console.log("Ready to prompt, sir.", readyToPrompt);

    // Load default model immediately if available
    if (readyToPrompt) {
      // Check mmproj availability for multimodal models
      if (this.currentModel.isMultimodal && this.currentModel.mmproj) {
        this.isMmprojAvailable = await window.electronAPI.checkMmproj(
          this.currentModel.mmproj,
        );
      }
      const canLoad = !this.currentModel.isMultimodal || this.isMmprojAvailable;
      if (canLoad) {
        try {
          await this.loadModel(this.currentModel);
        } catch (e) {
          console.error("Failed to load default model:", e);
        }
      }
    }

    // Load persisted chat history
    try {
      const saved = await window.electronAPI?.store?.get?.(
        "textInferences",
        [],
      );
      if (Array.isArray(saved) && saved.length > 0) {
        // Replace array (shallowRef requires full replacement, not mutation)
        this.inferences = [...saved];
        this.hasCopy = new Array(saved.length).fill(false);
      }
    } catch (e) {
      console.error("Failed to load text inferences:", e);
    }

    // Setup scroll observer after DOM is rendered
    setTimeout(() => this.setupScrollObserver(), 100);
    // Setup scroll listener for scroll-to-top button
    this.setupScrollListener();

    await this.loadModelDir();
  },
  beforeUnmount() {
    this.cleanupScrollObserver();
    this.cleanupScrollListener();
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");

hr {
  margin: 24px 0 !important;
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

.container {
  max-width: 100% important;
}

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: url("../assets/bonzai_chat.webp") no-repeat;
  background-size: cover;
  filter: blur(6px);
  animation: move 40s ease infinite;
  will-change: transform;
  overflow: hidden;
}

.shade {
  position: absolute;
  width: 100% !important;
  height: 100% !important;
  background: rgba(0, 0, 0, 0.5);
  z-index: -1;
}

.tabs {
  width: 100%;
}

.tabs ul {
  -webkit-flex-direction: column;
  flex-direction: column;
}

.tabs ul li {
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
  box-shadow: 10px 0 25px #000;
}

.tabs li + li {
  width: 100%;
  margin-left: 0;
}

.tabs li.is-active {
  width: 100%;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  font-style: normal;
}

.tabs li.is-active a {
  border-bottom-color: #fff;
  color: #fff;
}

.tabs li:not(.is-active) {
  filter: grayscale(100%);
  cursor: not-allowed;
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
}

.tabs li:not(.is-active):hover {
  filter: none;
}

.tabs li a {
  justify-content: left;
  border: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.tabs li a h1 {
  color: #fff;
  font-size: 48px;
  font-weight: 100;
  text-shadow: 1px 1px 1px #777;
  border: none;
}

.tabs li.bonzai {
  /* aspect-ratio: 16/9; */
  height: 20vh;
  width: 100%;
  background: #61378e;
  border-bottom: 10vh solid #61378e;
  filter: none !important;
}

.tabs li.bonzai .logo {
  height: 20vh;
  width: 100%;
  background: url("../assets/bonzai_logo-full.png") no-repeat;
  background-size: contain;
}

.tabs li.chat {
  /* aspect-ratio: 16/9; */
  height: 20vh;
  background: url("../assets/bonzai_chat.webp") no-repeat;
  background-size: cover;
}

.tabs li.image {
  height: 20vh;
  background: url("../assets/bonzai_image.webp") no-repeat;
  background-size: cover;
}

.tabs li.video {
  height: 20vh;
  background: url("../assets/bonzai_video.webp") no-repeat;
  background-size: cover;
}

.tabs li.music {
  height: 20vh;
  background: url("../assets/bonzai_music.webp") no-repeat;
  background-size: cover;
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
  /* aspect-ratio: 16/9; */
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
}

.models__deployment-install--cta {
  position: relative;
  top: -30px;
  right: 2.5em;
}

.models__activity--payouts {
  padding: 4em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px) !important;
  border-radius: 4px !important;
}

h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: #fff;
  text-align: right;
}

h2 {
  font-size: 48px;
  color: #fff;
  text-align: right;
}

.desc-content,
p {
  margin-bottom: 3em;
  font-size: 24px;
  color: #fff;
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

div.desc p {
  padding: 1em;
  font-size: 28px;
  border-radius: 4px;
  min-height: 126px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
}

.answer__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  font-family: "Fira Sans", sans-serif;
  color: rgba(255, 255, 255, 0.4);
}

.answer__model {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
}

.answer__tps {
  color: #48c774;
  font-weight: 700;
}

.models__deployment-install .card {
  margin: 5em;
}

.filesize {
  min-width: 40%;
  position: absolute;
  top: -10px;
  right: -10px;
  padding: 5px;
  font-size: 20px;
  color: rgba(255, 255, 255, 1);
  background: rgba(255, 255, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  backdrop-filter: blur(32px) !important;
  text-align: right;
}

.models__deployment-use {
  position: absolute;
  z-index: 111;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  padding: 6em;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  transform: translate3d(0, 0, 0);
  overflow: auto;
}

form {
  position: relative;
}

/* Image attachment for multimodal models */
.chat-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.chat-input-row .input {
  flex: 1;
}

.attach-image-btn {
  height: 52px;
  width: 52px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.attach-image-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

.attach-image-btn.has-image {
  background: rgba(72, 199, 116, 0.3);
  border-color: #48c774;
}

/* Reasoning toggle button */
.reasoning-toggle-btn {
  height: 60px;
  width: 60px;
  min-width: 52px;
  padding: 0;
  position: relative;
  top: -24px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 4px;
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

.attached-image-preview {
  position: relative;
  margin-bottom: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.attached-image-preview img {
  max-width: 120px;
  max-height: 80px;
  border-radius: 4px;
  object-fit: cover;
}

.attached-image-preview .delete-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 24px;
  height: 24px;
  padding: 0;
  background: #ff3860;
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.attached-image-preview .delete-btn .material-symbols-outlined {
  font-size: 16px;
}

.attached-image-preview .image-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.input {
  margin-bottom: 2em;
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
  top: 14px;
  border: none !important;
  box-shadow: none !important;
}

.is-loading {
  text-shadow: none !important;
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

/* Slide-in animation for history items */
.history-item {
  animation: slideUp 0.4s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
  }
  to {
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

/* Model directory bar */
.model-dir-bar {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.model-dir-path {
  font-family: monospace;
  word-break: break-all;
  flex: 1;
}

/* Model card in the picker list */
.model-card {
  position: relative;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.model-card--selected {
  border-color: rgba(32, 156, 238, 0.5);
}

.model-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.25rem 0.5rem 0.5rem;
  gap: 0.25rem;
}

.model-card__tip {
  display: none;
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  font-size: 0.75rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
  padding: 1em !important;
  margin-bottom: 4px;
  backdrop-filter: blur(32px);
}

.model-card:hover .model-card__tip {
  display: block;
}

/* Always Loaded Toggle */
.always-loaded-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.2s ease;
}

.always-loaded-toggle:hover {
  background: rgba(255, 255, 255, 0.12);
}

.always-loaded-toggle.active {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: #10b981;
}

.always-loaded-toggle .toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  transition: background 0.2s;
}

.always-loaded-toggle .toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}

.always-loaded-toggle.active .toggle-switch {
  background: #10b981;
}

.always-loaded-toggle.active .toggle-switch::after {
  transform: translateX(16px);
}

/* ── Markdown answer body ─────────────────────────────────────────── */
.markdown-body {
  white-space: normal;
  line-height: 1.7;
}

/* Override the global p rules inside markdown answers */
.markdown-body :deep(p) {
  margin-bottom: 0.75em;
  font-size: 16px;
  line-height: 1.7;
  text-align: left;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

/* Headings */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: #fff;
  margin-top: 1em;
  margin-bottom: 0.5em;
  line-height: 1.3;
  text-align: left;
}

/* Lists — restore proper numbering and bullets */
.markdown-body :deep(ol),
.markdown-body :deep(ul) {
  padding-left: 1.75em;
  margin: 0.5em 0;
  font-size: 16px;
  line-height: 1.7;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(li) {
  margin-bottom: 0.25em;
  padding-left: 0.25em;
}

.markdown-body :deep(li::marker) {
  color: rgba(255, 255, 255, 0.5);
}

/* Blockquotes */
.markdown-body :deep(blockquote) {
  border-left: 3px solid rgba(255, 255, 255, 0.3);
  padding-left: 1em;
  margin: 0.75em 0;
  color: rgba(255, 255, 255, 0.7);
}

/* Code blocks */
.markdown-body :deep(pre) {
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 1em;
  margin: 0.75em 0;
  overflow-x: auto;
  white-space: pre;
}

.markdown-body :deep(pre code) {
  font-family: "Fira Code", "SF Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 15px;
  line-height: 1.5;
  color: #e6e6e6;
  white-space: pre;
  background: none;
  padding: 0;
}

/* Inline code — purple highlight, matching text size */
.markdown-body :deep(code) {
  font-family: "Fira Code", "SF Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 14px;
  background: rgba(97, 55, 142, 0.3);
  padding: 2px 6px;
  border-radius: 3px;
  color: #c4a0ff;
}

/* Reset inline code overrides inside pre blocks */
.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  color: #e6e6e6;
  font-size: 15px;
}

/* Code copy button */
.markdown-body :deep(.code-copy-btn) {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-family: "Fira Sans", sans-serif;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.15s ease;
  z-index: 2;
}

.markdown-body :deep(.code-copy-btn:hover) {
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.answer-divider {
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

/* Streaming cursor */
.streaming-cursor {
  display: inline-block;
  width: 8px;
  height: 1.2em;
  background: #48c774;
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.7s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
