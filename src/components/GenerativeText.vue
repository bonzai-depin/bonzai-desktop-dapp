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
                  <span v-if="inference.model" class="answer__model p-5">
                    <span class="material-symbols-outlined mr-2">
                      neurology
                    </span>
                    {{ inference.model }}
                    <span v-if="inference.tokensPerSecond" class="answer__tps">
                      @ {{ inference.tokensPerSecond }} tok/s
                    </span>
                  </span>
                  <span v-if="inference.networkMode && inference.networkMode !== 'local'" class="network-mode-tag" :class="'nm-' + inference.networkMode">
                    <span class="material-symbols-outlined" style="font-size: 12px">{{ inference.networkMode === 'private' ? 'lock' : 'cloud' }}</span>
                    {{ inference.networkMode === 'private' ? 'Private' : 'Remote' }}
                  </span>
                </div>
                <template
                  v-for="(seg, segIdx) in splitThinkSegments(inference.answer.text)"
                  :key="`${inference.answer.id}-seg-${segIdx}`"
                >
                  <details
                    v-if="seg.type === 'think' && reasoningEnabled"
                    class="thought-bubble"
                    :class="{ 'thought-bubble--partial': seg.partial }"
                    open
                  >
                    <summary :title="seg.partial ? 'Thinking…' : 'Thought process'">
                      <span class="material-symbols-outlined">
                        network_intelligence_history
                      </span>
                    </summary>
                    <div class="thought-bubble__body">
                      <vue-markdown :source="seg.text" />
                    </div>
                  </details>
                  <vue-markdown
                    v-else-if="seg.type === 'content'"
                    :source="seg.text"
                  />
                </template>
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
                    copy(stripThinkBlocks(inference.answer.text));
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
                  @click="copy(stripThinkBlocks(inference.answer.text))"
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
                  <span
                    v-if="model.fitLabel"
                    class="fit-badge"
                    :class="`fit-badge--tier${model.fitTier}`"
                    :title="model.fitReason"
                  >
                    {{ model.fitLabel }}
                  </span>
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
                <h1 class="fira-sans-condensed-black-italic is-size-1">
                  <span
                    class="material-symbols-outlined mr-2"
                    style="font-size: 64px !important"
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

          <!-- Pipeline error banner -->
          <div v-if="pipelineError" class="notification is-danger mb-4" style="display: flex; align-items: flex-start; gap: 12px">
            <span class="material-symbols-outlined" style="font-size: 28px">error</span>
            <div class="fira-sans-condensed-black-italic" style="flex: 1">
              <div v-if="pipelineError.code === 'no_providers'" style="margin-top: 6px; font-size: 0.9em; opacity: 0.85">
                Your remote providers are offline. Please switch network mode, or wait for remote providers to come online.
              </div>
            </div>
            <button class="delete" @click="pipelineError = null" aria-label="dismiss"></button>
          </div>

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
                  <span v-if="inference.networkMode && inference.networkMode !== 'local'" class="network-mode-tag" :class="'nm-' + inference.networkMode">
                    <span class="material-symbols-outlined" style="font-size: 12px">{{ inference.networkMode === 'private' ? 'lock' : 'cloud' }}</span>
                    {{ inference.networkMode === 'private' ? 'Private' : 'Remote' }}
                  </span>
                </div>
                <template
                  v-for="(seg, segIdx) in splitThinkSegments(inference.answer.text)"
                  :key="`${inference.answer.id}-seg-${segIdx}`"
                >
                  <details
                    v-if="seg.type === 'think' && reasoningEnabled"
                    class="thought-bubble"
                    :class="{ 'thought-bubble--partial': seg.partial }"
                    open
                  >
                    <summary :title="seg.partial ? 'Thinking…' : 'Thought process'">
                      <span class="material-symbols-outlined">
                        network_intelligence_history
                      </span>
                    </summary>
                    <div class="thought-bubble__body">
                      <vue-markdown :source="seg.text" />
                    </div>
                  </details>
                  <vue-markdown
                    v-else-if="seg.type === 'content'"
                    :source="seg.text"
                  />
                </template>
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
                    copy(stripThinkBlocks(inference.answer.text));
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
                  @click="copy(stripThinkBlocks(inference.answer.text))"
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
import { addTextInference } from "../stores/inferenceStore.js";
import {
  LLM_BASE_MODELS,
  LLM_TIER_ORDER,
  LLM_TIER_LABELS,
  listAllLLMs,
  resolveLLM,
} from "../skills/flagship.js";

// Debounce utility for persistence
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

/**
 * Split a model output string into ordered segments of either visible
 * `content` or model `think` (the latter from `<think>…</think>` blocks
 * a hybrid-thinking model emits when its template inserts them).
 *
 * - Tolerates streaming / unterminated `<think>` (last segment marked partial).
 * - Tolerates multiple think blocks in one response.
 * - Never emits the raw `<think>` / `</think>` tags themselves; the segment
 *   `type` carries that information for the renderer.
 *
 * @returns {{type: 'content'|'think', text: string, partial?: boolean}[]}
 */
function splitThinkSegments(text) {
  if (!text) return [];
  const OPEN = "<think>";
  const CLOSE = "</think>";
  const out = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf(OPEN, cursor);
    if (open === -1) {
      const tail = text.slice(cursor);
      if (tail) out.push({ type: "content", text: tail });
      break;
    }
    if (open > cursor) {
      out.push({ type: "content", text: text.slice(cursor, open) });
    }
    const close = text.indexOf(CLOSE, open + OPEN.length);
    if (close === -1) {
      // Stream still inside a think block — emit what we have so far,
      // but only if there's something to show. An empty/whitespace-only
      // partial means the model has just opened `<think>` and not yet
      // generated; hide the bubble until tokens arrive.
      const partial = text.slice(open + OPEN.length);
      if (partial.trim().length > 0) {
        out.push({ type: "think", text: partial, partial: true });
      }
      break;
    }
    // Skip empty `<think></think>` pairs entirely — some models emit them
    // out of habit even when reasoning is disabled.
    const inner = text.slice(open + OPEN.length, close);
    if (inner.trim().length > 0) {
      out.push({ type: "think", text: inner });
    }
    cursor = close + CLOSE.length;
  }
  return out;
}

/**
 * Strip every `<think>…</think>` segment from a string (used for clipboard
 * copy and for any caller that wants only the user-facing answer).
 */
function stripThinkBlocks(text) {
  if (!text) return "";
  return splitThinkSegments(text)
    .filter((s) => s.type === "content")
    .map((s) => s.text)
    .join("")
    .trim();
}

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
// Memory + fit-tier math lives in src/services/modelFit.service.js so
// LlmModelPickerModal.vue uses the same algorithm. Re-imported into this
// module's scope so the existing template references and the
// component's `return { computeMemoryRequirements }` continue to resolve
// without changes.
import { computeMemoryRequirements, computeFitTier } from "../services/modelFit.service.js";


import GenerativeImage from "./GenerativeImage.vue";
import AccessRequirements from "./AccessRequirements.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { useInferenceRouter } from "../composables/useInferenceRouter.js";

export default {
  name: "GenerativeText",
  components: {
    VueMarkdown,
    GenerativeImage,
    AccessRequirements,
    MintModal,
  },
  setup() {
    const { inferenceRequest } = useInferenceRouter();

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
    const pipelineError = ref(null);
    let pipelineErrorUnsub = null;
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

    // ─── Derived from LLM_BASE_MODELS (flagship.js) ──────────────────────
    // Each (base model × tier) becomes a picker entry. Source of truth is the
    // base registry; this block just maps to the shape this component expects
    // (modelname / modeldesc / filesize rather than name / description / size).
    const _entryFromResolved = (entry) => ({
      baseKey: entry.baseKey,
      tier: entry.tier,
      availableTiers: entry.availableTiers,
      modelname: entry.name,
      modeldesc: entry.description,
      url: entry.url,
      filename: entry.filename,
      filesize: entry.size,
      filesizeBytes: entry.filesizeBytes,
      parameters: entry.parameters,
      activeParameters: entry.activeParameters,
      isMoE: entry.isMoE,
      context: entry.context,
      thinking: entry.thinking,
      layers: entry.layers,
      kvHeads: entry.kvHeads,
      headDim: entry.headDim,
      shards: entry.shards,
    });

    const availableModels = ref(
      Object.fromEntries(
        listAllLLMs().map((entry) => [
          entry.key.replace(/^llm_/, ""),
          _entryFromResolved(entry),
        ])
      )
    );

    // ─── Tier state per base model (for future tier-dropdown UI) ────────
    // Default tier is Q4; per-base overrides allow the picker to highlight
    // the active tier card. Wired but not yet surfaced as a dropdown — each
    // tier currently appears as its own card in the list.
    const tierByBase = ref(
      Object.fromEntries(
        Object.keys(LLM_BASE_MODELS).map((baseKey) => [
          baseKey,
          LLM_BASE_MODELS[baseKey].tiers.q4 ? "q4" : Object.keys(LLM_BASE_MODELS[baseKey].tiers)[0],
        ])
      )
    );

    const setTierForBase = (baseKey, tier) => {
      tierByBase.value[baseKey] = tier;
    };

    // Hardware-fit ranking: load once on mount, then re-sort when it lands.
    // Sort key, low → high:
    //   1. fitTier            (0=comfortable, 1=tight, 2=offload, 3=won't fit)
    //   2. -parameters        (within each tier, prefer the largest model that
    //                          still fits — better quality at the same compute)
    //   3. modelname          (alphabetical tiebreaker for stable ordering)
    //
    // Until sysInfo arrives we use a placeholder that returns tier=1 for all,
    // collapsing the sort to "biggest first". After mount the computed re-runs
    // and the fit tiering takes over.
    const sysInfo = ref(null);
    const sortedModels = computed(() => {
      const info = sysInfo.value;
      const enriched = Object.values(availableModels.value).map((m) => {
        const mem = computeMemoryRequirements(m);
        const fit = computeFitTier(mem, info);
        return { ...m, vramGB: mem.vramGB, fitTier: fit.tier, fitLabel: fit.label, fitReason: fit.reason };
      });
      enriched.sort((a, b) => {
        if (a.fitTier !== b.fitTier) return a.fitTier - b.fitTier;
        const pa = a.parameters || 0, pb = b.parameters || 0;
        if (pa !== pb) return pb - pa;
        return a.modelname.localeCompare(b.modelname);
      });
      return enriched;
    });

    // Default model sourced from the registry — Qwen3.5 0.8B Q4 is the
    // lightest option and always has a single tier, so it's safe as a start.
    const currentModel = ref(_entryFromResolved(resolveLLM("qwen3_5_0_8b")));

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
        // Reasoning is OFF at startup. Live per-request toggle is sent
        // via `chat_template_kwargs` in chatStream — no reload needed.
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

      // Clear any stale pipeline error banner so the user sees a fresh
      // result (or a fresh error).
      pipelineError.value = null;

      // Lazy-spawn: nothing auto-loads at boot. The send button is only
      // rendered when the picked model is on disk, so we can trust it here.
      // loadModel is idempotent — main.js short-circuits if this model is
      // already the running subprocess.
      if (currentModel.value?.filename) {
        await loadModel(currentModel.value);
      }

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
        let routingMode = 'local'; // 'local' | 'remote' | 'private'
        const startTime = performance.now();

        // Check if we have an attached image and current model is multimodal
        if (attachedImage.value && isMultimodalModel.value) {
          console.log("Sending vision message with image...");
          assistantResult = await window.electronAPI.chatVision(
            prompt,
            attachedImage.value.dataUrl,
          );
        } else {
          // Unified inference routing — main process decides local vs remote vs pipeline
          // Subscribe to token streams (works for both local chatStream and pipeline tokens)
          const pipelineUnsub = window.electronAPI.onPipelineToken?.((chunk) => {
            tokenCount++;
            streamingText.value += chunk;
            const arr = inferences.value;
            const last = arr[arr.length - 1];
            if (last && last.answer.id === answerId) {
              last.answer.text = streamingText.value;
              const elapsed = (performance.now() - startTime) / 1000;
              if (elapsed > 0.1)
                last.tokensPerSecond = (tokenCount / elapsed).toFixed(1);
              inferences.value = [...arr];
            }
          });

          try {
            const result = await inferenceRequest('llm', {
              messages: [{ role: 'user', content: prompt }],
              model: currentModel.value?.modelname,
              prompt, // for pipeline orchestrator
              maxTokens: 2048,
            });

            if (result?.ok && result.result) {
              if (result.pipeline) {
                routingMode = 'private';
                assistantResult = result.result?.text || streamingText.value || '';
              } else if (result.remote) {
                routingMode = 'remote';
                // Remote provider: extract from OpenAI-compatible response
                const text = result.result?.choices?.[0]?.message?.content || JSON.stringify(result.result);
                assistantResult = text;
                tokenCount = text.split(/\s+/).length;
                streamingText.value = text;
                const arr = inferences.value;
                const last = arr[arr.length - 1];
                if (last && last.answer.id === answerId) {
                  last.answer.text = text;
                  inferences.value = [...arr];
                }
              }
            }

            // useLocal or no result: fall through to local streaming
            if (!assistantResult) {
              // Fallback: direct local streaming via llama-server
              const chatOpts = {};
              if (!reasoningEnabled.value) chatOpts.thoughtTokens = 0;
              // Live toggle of hybrid reasoning. Forwarded to llama-server
              // as request-level `chat_template_kwargs.enable_thinking`,
              // which overrides the server-startup default per request —
              // no model reload required. Only sent for thinking-capable
              // models so non-thinking templates aren't surprised.
              if (isThinkingModel.value) {
                chatOpts.enableThinking = reasoningEnabled.value === true;
              }

              const canStream =
                typeof window.electronAPI.chatStream === "function" &&
                typeof window.electronAPI.onChatToken === "function";

              if (canStream) {
                const unsubscribe = window.electronAPI.onChatToken((chunk) => {
                  tokenCount++;
                  streamingText.value += chunk;
                  const arr = inferences.value;
                  const last = arr[arr.length - 1];
                  if (last && last.answer.id === answerId) {
                    last.answer.text = streamingText.value;
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
                assistantResult = await window.electronAPI.chat(prompt, chatOpts);
              }
            }
          } finally {
            if (pipelineUnsub) pipelineUnsub();
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
          last.networkMode = routingMode;
          inferences.value = [...arr];
        }

        console.log("prompt", {
          id: answerId,
          text: assistantResult,
          tokPerSec: finalTokPerSec,
        });

        // Debounced persistence
        persistInferences([...inferences.value]);

        // Save to unified inference store with performance metadata
        addTextInference(prompt, assistantResult, {
          model: modelName,
          tokensUsed: tokenCount,
          tokensPerSecond: finalTokPerSec,
          elapsed: elapsedSec,
          source: 'bonzai',
          networkMode: routingMode,
        });

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
      pipelineErrorUnsub = window.electronAPI?.onPipelineError?.((err) => {
        pipelineError.value = err;
      });
      // Fetch hardware profile so the picker can rank models by fit. The
      // detail (gpu name, exact vram) lands on a second call once the
      // si.* probes finish in main; the first call returns instantly with
      // ram + memBudget which is enough to start ordering.
      const fetchSysInfo = async () => {
        try {
          const info = await window.electronAPI?.systemInformation?.();
          if (info) sysInfo.value = info;
        } catch (e) {
          console.warn("[GenerativeText] systemInformation failed:", e?.message);
        }
      };
      fetchSysInfo();
      // Second pass after 1.5s gives main's background si.graphics() probe
      // a chance to populate vram/gpu — without this, discrete-GPU users
      // would see the conservative fallback ranking on first paint.
      setTimeout(fetchSysInfo, 1500);
    });
    onUnmounted(() => {
      window.removeEventListener("bonzai:show-browse-models", handleShowBrowseModels);
      if (pipelineErrorUnsub) { pipelineErrorUnsub(); pipelineErrorUnsub = null; }
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
      pipelineError,
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
      // think-block rendering
      splitThinkSegments,
      stripThinkBlocks,
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

    // Check availability so the UI reflects downloaded-vs-not state, but DO
    // NOT auto-load. llama-server is lazy-spawned — it only starts when the
    // user actually runs inference (on their first message). This keeps boot
    // clean even when no model exists on disk.
    const readyToPrompt = await this.isModelAvailable(
      this.currentModel.filename,
    );
    if (readyToPrompt && this.currentModel.isMultimodal && this.currentModel.mmproj) {
      this.isMmprojAvailable = await window.electronAPI.checkMmproj(
        this.currentModel.mmproj,
      );
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
  background-size: cover;  overflow: hidden;
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
  margin-left: 8px;
  vertical-align: middle;
}

.nm-remote {
  background: rgba(62, 142, 208, 0.15);
  color: #3e8ed0;
  border: 1px solid rgba(62, 142, 208, 0.3);
}

.nm-private {
  background: rgba(72, 199, 142, 0.12);
  color: #48c78e;
  border: 1px solid rgba(72, 199, 142, 0.3);
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

/* ───────── Reasoning / <think> rendering ─────────────────────────────────
 * Hybrid-thinking models (Qwen3, DeepSeek-R1) emit a <think>…</think> block
 * before the user-facing answer. The renderer splits the stream into segments
 * and only shows the think block when the user has reasoning enabled, never
 * with the raw tags. The block collapses to a one-line summary by default
 * (HTML <details>) so long thoughts don't dominate the chat.
 *
 * Visual language matches `.reasoning-toggle-btn`: white-on-dark base, blue
 * `#209cee` accent. Pairing the bubble with the toggle makes it obvious
 * that one drives the other.
 */
.thought-bubble {
  display: inline-block;
  margin: 0.5rem 0 0.85rem;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.92em;
  transition: all 0.2s ease;
  overflow: hidden;
}

.thought-bubble[open] {
  display: block;
  background: rgba(32, 156, 238, 0.12);
  border-color: #209cee;
  color: #fff;
  box-shadow: 0 0 12px rgba(32, 156, 238, 0.4);
}

.thought-bubble > summary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  transition: all 0.2s ease;
}

.thought-bubble[open] > summary {
  width: auto;
  min-width: 36px;
  padding: 0 0.5rem;
  border-bottom: 1px solid rgba(32, 156, 238, 0.35);
}

.thought-bubble:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}

.thought-bubble[open]:hover {
  background: rgba(32, 156, 238, 0.2);
}

.thought-bubble > summary::-webkit-details-marker {
  display: none;
}

.thought-bubble > summary .material-symbols-outlined {
  font-size: 1.25em;
  opacity: 0.95;
}

.thought-bubble__body {
  padding: 0.5rem 0.85rem 0.6rem;
  background: rgba(0, 0, 0, 0.15);
}

.thought-bubble :deep(p),
.thought-bubble :deep(li) {
  color: rgba(255, 255, 255, 0.85);
  margin: 0.25rem 0;
}

.thought-bubble :deep(code) {
  background: rgba(0, 0, 0, 0.3);
}

.thought-bubble--partial > summary::after {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #209cee;
  margin-left: 0.4rem;
  animation: thought-pulse 1s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(32, 156, 238, 0.8);
}

@keyframes thought-pulse {
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

/* Hardware-fit indicator on model picker cards. Color encodes the
   fit tier; the title attribute carries the human-readable reason. */
.fit-badge {
  display: inline-block;
  margin-left: 0.6rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  vertical-align: middle;
  line-height: 1.4;
  border: 1px solid currentColor;
}
.fit-badge--tier0 { color: #1f8b4c; background: rgba(31, 139, 76, 0.10); }
.fit-badge--tier1 { color: #c9a227; background: rgba(201, 162, 39, 0.10); }
.fit-badge--tier2 { color: #cf6a1e; background: rgba(207, 106, 30, 0.10); }
.fit-badge--tier3 { color: #b13a3a; background: rgba(177, 58, 58, 0.10); }
</style>
