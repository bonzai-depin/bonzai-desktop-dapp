<template>
  <div class="background"></div>

  <div class="bz-tab-shell">
    <div class="models__deployment-install models__deployment-install--chat">
      <!-- ─────────────────────────────────────────────────────────────
           CHAT WORKSPACE — three-column editorial shell.
           Always visible. When no model is downloaded the stream shows
           a setup card; when a model is ready the composer is live.
           History never auto-loads — only appears when a rail item is
           explicitly clicked or a new message is being streamed.
           ───────────────────────────────────────────────────────────── -->
      <ChatLayout
        class="bz-text-chat"
        :messages="threadInferences"
        :autoscroll="true"
        :busy="isLoading"
        :rail-collapsed="isHistoryCollapsed"
        rail-label="chat history"
        :rail-count="railEntries.length"
        @toggle-rail="toggleHistoryRail"
      >
        <!-- LEFT RAIL — date-grouped history -->
        <template #rail>
          <ChatHistoryRail
            :inferences="railEntries"
            :active-id="activeRailId"
            @select="selectFromRail"
            @toggle-pin="togglePinnedInference"
          />
        </template>

        <!-- HEADER — model name + toolset (clear / import / export) -->
        <template #header>
          <div class="bz-text-chat__head bz-page-header">
            <div class="bz-text-chat__head-left">
              <h1 class="bz-h1 fira-sans-condensed-black-italic"><span class="material-symbols-outlined bz-title-icon" aria-hidden="true">chat_bubble</span>
                Chat
              </h1>
              <span class="bz-text-chat__model">{{ chatHeaderTitle }}</span>
            </div>
            <div class="bz-text-chat__head-actions">
              <button
                type="button"
                class="bz-iconbtn"
                :title="isHistoryCollapsed ? 'Show chat history' : 'Hide chat history'"
                :aria-label="isHistoryCollapsed ? 'Show chat history' : 'Hide chat history'"
                :aria-expanded="(!isHistoryCollapsed).toString()"
                :disabled="!railEntries.length"
                @click="toggleHistoryRail"
              >
                <span class="material-symbols-outlined">
                  {{ isHistoryCollapsed ? 'left_panel_open' : 'left_panel_close' }}
                </span>
              </button>
              <button type="button" class="bz-btn bz-btn--ghost" title="Browse models" aria-label="Browse models" @click="openModelPicker">
                <span class="material-symbols-outlined">folder_open</span>{{ $ui("Open model") }}
              </button>
              <button type="button" class="bz-iconbtn" title="Import history" aria-label="Import history" @click="importHistory()">
                <span class="material-symbols-outlined">upload</span>
              </button>
              <button type="button" class="bz-iconbtn" title="Export history" aria-label="Export history" :disabled="!inferences || inferences.length === 0" @click="exportHistory()">
                <span class="material-symbols-outlined">download</span>
              </button>
              <button type="button" class="bz-iconbtn" title="Clear chat" aria-label="Clear chat" @click="resetChat()">
                <span class="material-symbols-outlined">ink_eraser</span>
              </button>
            </div>
          </div>
        </template>

        <!-- STREAM — empty state OR ChatMessage iteration -->
        <template #stream>
          <!-- Access gate (level requirement) — sits above the stream -->
          <div class="bz-text-chat__gate">
            <AccessRequirements
              ref="accessRef"
              level="LVL1"
              @access-changed="onAccessChanged"
            />
            <div v-if="pipelineError" class="bz-notice bz-notice--danger bz-pipeline-notice mt-3">
              <span class="bz-notice__icon"><span class="material-symbols-outlined">error</span></span>
              <div class="bz-notice__body">
                <p class="bz-notice__title">Pipeline error</p>
                <p v-if="pipelineError.code === 'no_providers'" class="bz-notice__text">
                  Your remote providers are offline. Switch network mode or wait for one to come back online.
                </p>
              </div>
              <div class="bz-notice__cta">
                <BzCloseButton size="sm" aria-label="dismiss" @click="pipelineError = null" />
              </div>
            </div>
          </div>

          <!-- A selection never downloads or loads a model without an explicit action. -->
          <div v-if="!isChatReady" class="bz-text-chat__setup">
            <DownloadRequirement category="language"
              :items="[currentModel]"
              :active="!!modelDownloading[currentModel.filename]"
              cancellable
              @cancel="handleRecommendedModel(currentModel)"
              :progress="modelDownloadProgress[currentModel.filename] || 0"
              :disabled="!desktopModelsAvailable || isLoading"
              :error="modelDownloadErrors[currentModel.filename] || ''"
              :title="modelAvailabilityMap[currentModel.filename] ? $t('rcDownloads.modelRequired') : ''"
              :action-label="modelAvailabilityMap[currentModel.filename] ? $t('rcDownloads.loadModel') : ''"
              @download="handleRecommendedModel(currentModel)"
            />
            <button type="button" class="bz-btn bz-btn--ghost" @click="openModelPicker">
              {{ $t('rcDownloads.chooseModel') }}
            </button>
            <p v-if="!desktopModelsAvailable" class="bz-meta" role="status">{{ $t('rcWorkflows.desktopModelRequired') }}</p>
          </div>

          <!-- Default empty state when model is ready but no conversation is active -->
          <div v-else-if="!threadInferences.length" class="bz-text-chat__empty">
            <EmptyChat
              :model-name="chatHeaderTitle"
              :headline="`What are we making with ${chatHeaderTitle}?`"
              subhead=""
              @pick="pickPrompt"
              @browse-models="openModelPicker"
            />
          </div>

          <!-- Active conversation thread (rail selection or currently streaming) -->
          <div v-else class="bz-text-chat__messages" ref="messagesContainer">
            <template v-for="inf in threadInferences" :key="inf.id">
              <!-- User -->
              <ChatMessage
                :data-inference-id="inf.id"
                role="user"
                :content="inf.question"
                :ts="inf.timestamp"
                @edit="editMessage(inf)"
                @delete="deleteMessage(inf)"
              />

              <!-- Assistant -->
              <ChatMessage
                role="assistant"
                :model="inf.model"
                :content="stripThinkBlocks(inf.answer.text)"
                :ts="inf.timestamp"
                :streaming="isLoading && inf.answer.id === streamingInferenceId"
                :error="inf.error"
                :error-message="inf.errorMessage"
                :stopped="!!inf.stopped"
                :can-switch-local="canSwitchInferenceToLocal(inf)"
                :mintable="!!inf.answer.text"
                :minted="!!inf.nft"
                @inspect="onInspectInference(inf)"
                @regenerate="regenerateMessage(inf)"
                @retry="retryMessage(inf)"
                @switch-local="switchInferenceToLocal(inf)"
                @mint="openMint(inf)"
                @delete="deleteMessage(inf)"
              >
                <template #actions>
                  <template v-if="inf.answer.text && !(isLoading && inf.answer.id === streamingInferenceId)">
                    <button type="button" class="chat-workflow-action" @click="createPodcast(inf)"><span class="material-symbols-outlined" aria-hidden="true">podcasts</span>{{ $ui('Podcast') }}</button>
                    <button type="button" class="chat-workflow-action" @click="agentHandoff = inf"><span class="material-symbols-outlined" aria-hidden="true">forward_to_inbox</span>{{ $ui('Send To Agent') }}</button>
                  </template>
                </template>
                <div class="answer markdown-body" @click="handleAnswerClick">
                  <div
                    v-if="inf.tokensPerSecond || (inf.networkMode && inf.networkMode !== 'local')"
                    class="bz-msg-extra-meta"
                  >
                    <span v-if="inf.tokensPerSecond" class="bz-mono bz-meta">
                      {{ inf.tokensPerSecond }} tok/s
                    </span>
                    <span
                      v-if="inf.networkMode && inf.networkMode !== 'local'"
                      class="network-mode-tag"
                      :class="'nm-' + inf.networkMode"
                    >
                      <span class="material-symbols-outlined" style="font-size: 12px">
                        {{ inf.networkMode === 'private' ? 'lock' : 'cloud' }}
                      </span>
                      {{ inf.networkMode === 'private' ? 'PRIVATE' : 'Remote' }}
                    </span>
                  </div>

                  <template
                    v-for="(seg, segIdx) in splitThinkSegments(inf.answer.text)"
                    :key="`${inf.answer.id}-seg-${segIdx}`"
                  >
                    <details
                      v-if="seg.type === 'think' && reasoningEnabled"
                      class="thought-bubble"
                      :class="{ 'thought-bubble--partial': seg.partial }"
                      open
                    >
                      <summary :title="seg.partial ? 'Thinking…' : 'Thought process'">
                        <span class="material-symbols-outlined">network_intelligence_history</span>
                      </summary>
                      <div class="thought-bubble__body">
                        <vue-markdown
                          :source="seg.text"
                          :options="markdownOptions"
                          :plugins="markdownPlugins"
                        />
                      </div>
                    </details>
                    <vue-markdown
                      v-else-if="seg.type === 'content'"
                      :source="seg.text"
                      :options="markdownOptions"
                      :plugins="markdownPlugins"
                    />
                  </template>

                </div>
              </ChatMessage>
              <!-- Suggestion chips — shown after a completed assistant turn -->
              <div
                v-if="!isLoading && !inf.error && inf.answer.text && inf.answer.id !== streamingInferenceId"
                class="bz-suggestion-chips"
              >
                <button
                  v-for="chip in suggestionChips"
                  :key="chip.id"
                  type="button"
                  class="bz-suggestion-chip"
                  :title="chip.title"
                  @click="sendMessage(buildSuggestionPrompt(chip, inf))"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">{{ chip.icon }}</span>
                  {{ chip.label }}
                </button>
              </div>
            </template>
          </div>
        </template>

        <!-- INPUT — composer docks at the bottom of the main column -->
        <template #input>
          <div
            v-if="chatParamsOpen"
            id="chat-params-panel"
            class="bz-chat-params"
          >
            <label class="bz-chat-param">
              <span class="bz-chat-param__label bz-meta">Temperature</span>
              <input
                v-model.number="chatParams.temperature"
                type="range"
                min="0"
                max="2"
                step="0.1"
                :disabled="isLoading"
              />
              <span class="bz-chat-param__value bz-mono">
                {{ chatParams.temperature.toFixed(1) }}
              </span>
            </label>
            <label class="bz-chat-param">
              <span class="bz-chat-param__label bz-meta">Max tokens</span>
              <input
                v-model.number="chatParams.maxTokens"
                type="number"
                min="128"
                max="8192"
                step="128"
                :disabled="isLoading"
              />
            </label>
            <label class="bz-chat-param">
              <span class="bz-chat-param__label bz-meta">Seed</span>
              <input
                v-model="chatParams.seed"
                type="number"
                min="0"
                max="2147483647"
                placeholder="Random"
                :disabled="isLoading"
              />
            </label>
            <label class="bz-chat-param bz-chat-param--system">
              <span class="bz-chat-param__label bz-meta">System prompt</span>
              <textarea
                v-model="chatParams.systemPrompt"
                rows="2"
                placeholder="Optional"
                :disabled="isLoading"
              ></textarea>
            </label>
          </div>
          <ChatInput
            ref="chatInputRef"
            v-model="form.prompt"
            placeholder="Ask anything..."
            aria-label="Chat message input"
            :streaming="isLoading"
            :disabled="!hasAccess || !isChatReady"
            :attachments="chatAttachments"
            :enable-attachments="isMultimodalModel && (remoteInference.active || isMmprojAvailable)"
            :slash-commands="slashCommands"
            :hint="composerHint"
            @submit="hasAccess && sendMessage(form.prompt)"
            @stop="stopGeneration"
            @attach="triggerImageAttach"
            @remove-attachment="removeAttachedImage"
            @run-command="runSlashCommand"
          >
                  <template #before-submit><GenerationDrafts kind="text" :controller="generationDraft" :disabled="isLoading" /></template>
            <template #tools>
              <button
                type="button"
                class="bz-chat-tool"
                :class="{ 'bz-chat-tool--on': chatParamsOpen }"
                :aria-expanded="chatParamsOpen.toString()"
                aria-controls="chat-params-panel"
                title="Advanced parameters"
                :disabled="isLoading"
                @click="chatParamsOpen = !chatParamsOpen"
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  tune
                </span>
              </button>
              <button
                v-if="isThinkingModel"
                type="button"
                class="bz-chat-tool"
                :class="{ 'bz-chat-tool--on': reasoningEnabled }"
                @click="reasoningEnabled = !reasoningEnabled"
                :disabled="isLoading"
                :title="
                  reasoningEnabled
                    ? 'Reasoning ON — model thinks step-by-step'
                    : 'Reasoning OFF — direct answers'
                "
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  network_intelligence_history
                </span>
                <span class="bz-meta">Reasoning</span>
              </button>
            </template>
          </ChatInput>
          <!-- Hidden file input — programmatically triggered by the
               attach button on <ChatInput>. -->
          <input
            ref="hiddenImageInput"
            type="file"
            accept="image/*"
            style="display: none"
            @change="attachImage"
          />
        </template>
      </ChatLayout>

      <Teleport to="body">
    <div v-if="pendingDelete" class="bz-confirmation-backdrop" aria-hidden="true"></div>
    <Transition name="bz-chat-toast">
        <div
          v-if="pendingDelete"
          class="bz-chat-delete-toast"
          role="status"
          aria-live="polite"
        >
          <span class="material-symbols-outlined" aria-hidden="true">delete</span>
          <span class="bz-chat-delete-toast__body">
            Delete this message?
          </span>
          <button type="button" class="bz-chat-delete-toast__ghost" @click="dismissDeleteToast">
            Cancel
          </button>
          <button type="button" class="bz-chat-delete-toast__danger" @click="confirmDeleteMessage">
            Delete
          </button>
        </div>
      </Transition>
  </Teleport>
    </div>
  </div>

  <!-- Mint Modal -->
  <SendToAgentModal v-if="agentHandoff" :content="stripThinkBlocks(agentHandoff.answer.text)" :source-id="String(agentHandoff.id)" @close="agentHandoff = null" />
  <MintModal
    v-if="mintTarget"
    :visible="!!mintTarget"
    v-bind="mintTarget"
    @close="mintTarget = null"
    @minted="onMinted"
  />
</template>

<script>
import GenerationDrafts from "./generative/GenerationDrafts.vue";
import { useGenerationDraft } from "../composables/useGenerationDraft.js";
import { visibleText } from "../shared/visibleText.js";
import { reportOperation } from "../stores/activityStore.js";
import { bonzaiCodeBlockPlugin } from "../shared/markdownCode.js";
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
import { recordedMintGeneration } from "../services/mintValidation.js";
import MintModal from "./MintModal.vue";
import { remoteInference, refreshRemoteInference } from '../stores/remoteInference.js';
import DownloadRequirement from "./DownloadRequirement.vue";
import { DEFAULT_LLM_ID, DEFAULT_LLM_TIER, selectPreferredModel } from "../config/modelDefaults.js";
import { modelStore } from "../stores/modelStore.js";
import { memoryService } from "../services/memory.service.js";
import {
  LLM_BASE_MODELS,
  LLM_TIER_ORDER,
  LLM_TIER_LABELS,
  listAllLLMs,
  resolveLLM,
} from "../skills/flagship.js";

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
function stripThinkBlocks(text) { return visibleText(text); }

function estimateTokenCount(text) {
  const clean = stripThinkBlocks(text || "");
  if (!clean) return 0;
  const words = clean.match(/\S+/g)?.length || 0;
  return Math.max(words, Math.ceil(clean.length / 4));
}

function inferDurationMs(inference, tokenCount = 0) {
  if (Number.isFinite(Number(inference?.durationMs)) && Number(inference.durationMs) > 0) {
    return Number(inference.durationMs);
  }
  const speed = Number(inference?.tokensPerSecond);
  if (speed > 0 && tokenCount > 0) {
    return Math.round((tokenCount / speed) * 1000);
  }
  return null;
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
import ChatLayout from "./chat/ChatLayout.vue";
import SendToAgentModal from "./company/SendToAgentModal.vue";
import ChatMessage from "./chat/ChatMessage.vue";
import ChatInput from "./chat/ChatInput.vue";
import ChatHistoryRail from "./chat/ChatHistoryRail.vue";
import EmptyChat from "./chat/EmptyChat.vue";
import BzCloseButton from "./BzCloseButton.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { useInferenceRouter } from "../composables/useInferenceRouter.js";
import { modelPicker } from "../services/modelPicker.service.js";
import { inspector as generationInspector } from "../services/generationInspector.service.js";

export default {
  name: "GenerativeText",
  components: { GenerationDrafts, DownloadRequirement,
    BzCloseButton,
    VueMarkdown,
    GenerativeImage,
    AccessRequirements,
    MintModal,
    ChatLayout,
    ChatMessage, SendToAgentModal,
    ChatInput,
    ChatHistoryRail,
    EmptyChat,
  },
  setup() {
    const { inferenceRequest } = useInferenceRouter();

    // ------------ NFT Minting ---------
    const agentHandoff = ref(null);
    const createPodcast = (inference) => window.dispatchEvent(new CustomEvent('bonzai:run-agent-workflow', { detail: { skillId: 'podcast-studio-v1.0.0', inputs: { brief: stripThinkBlocks(inference.answer.text) }, sourceId: inference.id } }));
    const mintTarget = ref(null);

    const openMint = (inference) => {
      const visibleAnswer = stripThinkBlocks(inference.answer?.text || "");
      mintTarget.value = {
        inferenceType: "text",
        inferenceId: inference.id,
        content: visibleAnswer,
        contentType: "text/plain",
        prompt: inference.question,
        generation: recordedMintGeneration(inference, {
          type: "text-generation",
          model: inference.model || "llm",
          timestamp: inference.timestamp,
          tokensPerSecond: inference.tokensPerSecond || null,
          modelProvenance: inference.modelProvenance || null,
          contributionParents: inference.modelProvenance?.dataset?.contributionIds || [],
        }),
      };
    };

    const onMinted = async (result) => {
      // Trigger re-render for shallowRef
      const arr = [...inferences.value];
      const inf = arr.find((i) => i.id === mintTarget.value?.inferenceId);
      if (inf) inf.nft = result;
      inferences.value = arr;
      await persistInferences([...inferences.value]);
      mintTarget.value = null;
    };

    const downloadProgress = ref(0);
    const isLoading = ref(false);
    const isModel = ref(false);
    const openModel = ref(false);
    const openChat = ref(false);
    const pipelineError = ref(null);
    const pendingDelete = ref(null);
    const branchDraft = ref(null);
    let pipelineErrorUnsub = null;
    let modelChangedUnsub = null;
    let pendingDeleteTimer = null;
    const reasoningEnabled = ref(false);

    // Model directory
    const modelDir = ref("");

    // Per-model availability tracking for the model list
    const modelAvailabilityMap = reactive({});
    const modelDownloading = reactive({});
    const modelDownloadProgress = reactive({});
    const modelDownloadErrors = reactive({});

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
      isMultimodal: entry.isMultimodal || false,
      mmproj: entry.mmproj || null,
      draftModel: entry.draftModel || null,
      draftUrl: entry.draftUrl || null,
      specType: entry.specType || null,
      specDraftNMax: entry.specDraftNMax || null,
      mtp: entry.mtp || false,
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
    //   2. vramGB / filesize  (smaller, faster local models first)
    //   3. -parameters        (quality tiebreaker when footprint is similar)
    //   4. modelname          (stable alphabetical tiebreaker)
    const sysInfo = ref(null);
    const desktopModelsAvailable = Boolean(window.electronAPI?.checkModel);
    const sortedModels = computed(() => {
      const info = sysInfo.value;
      const enriched = Object.values(availableModels.value).map((m) => {
        const mem = computeMemoryRequirements(m);
        const fit = computeFitTier(mem, info);
        return { ...m, vramGB: mem.vramGB, diskSpaceGB: mem.diskSpaceGB, fitTier: fit.tier, fitLabel: fit.label, fitReason: fit.reason };
      });
      enriched.sort((a, b) => {
        if (a.fitTier !== b.fitTier) return a.fitTier - b.fitTier;
        const av = a.vramGB || Number.MAX_SAFE_INTEGER;
        const bv = b.vramGB || Number.MAX_SAFE_INTEGER;
        if (av !== bv) return av - bv;
        const as = a.filesizeBytes || Number.MAX_SAFE_INTEGER;
        const bs = b.filesizeBytes || Number.MAX_SAFE_INTEGER;
        if (as !== bs) return as - bs;
        const pa = a.parameters || 0, pb = b.parameters || 0;
        if (pa !== pb) return pb - pa;
        return a.modelname.localeCompare(b.modelname);
      });
      return enriched;
    });
    // The first launch selects Qwen3.5 9B; a remembered choice takes precedence.
    // Selected and loaded are separate states, so this cannot trigger inference or a download.
    const currentModel = ref(selectPreferredModel(availableModels.value, modelStore.state.preferredFilename)
      || _entryFromResolved(resolveLLM(DEFAULT_LLM_ID, DEFAULT_LLM_TIER)));
    const loadedModel = ref(null);
    const hasUserSelectedModel = ref(false);
    const chatHeaderTitle = computed(() => remoteInference.active ? `OpenRouter · ${remoteInference.model}` : loadedModel.value?.modelname || currentModel.value?.modelname);
    const activeModelProvenance = computed(() =>
      remoteInference.active ? null : currentModel.value?.model_provenance ||
      currentModel.value?.provenance ||
      loadedModel.value?.model_provenance ||
      loadedModel.value?.provenance ||
      null,
    );

    const sameModelFile = (a, b) =>
      !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

    const isCurrentModelLoaded = computed(() =>
      sameModelFile(loadedModel.value?.filename, currentModel.value?.filename),
    );

    const isChatReady = computed(() => remoteInference.active ? remoteInference.connected && !!remoteInference.model : isCurrentModelLoaded.value);

    const syncCurrentModelFromLoaded = (loaded) => {
      if (!loaded?.filename) return;
      const match = Object.values(availableModels.value).find((m) =>
        sameModelFile(m.filename, loaded.filename),
      );
      currentModel.value = match
        ? { ...match, model_provenance: loaded.model_provenance || loaded.provenance || match.model_provenance || null }
        : { ...currentModel.value, ...loaded };
    };

    const refreshLoadedModel = async () => {
      const loaded = await window.electronAPI?.getLoadedModel?.();
      loadedModel.value = loaded || null;
      if (loaded) {
        hasUserSelectedModel.value = true;
        syncCurrentModelFromLoaded(loaded);
        isModel.value = true;
        if (currentModel.value.isMultimodal && currentModel.value.mmproj) {
          isMmprojAvailable.value = await window.electronAPI.checkMmproj(
            currentModel.value.mmproj,
          );
        }
      }
      return loadedModel.value;
    };

    const pickModel = async (model) => {
      hasUserSelectedModel.value = true;
      modelStore.setPreferred(model);
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
      const available = await window.electronAPI?.checkModel?.(filename);
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

      const result = await window.electronAPI.downloadModel(url, filename);
      isLoading.value = false;
      downloadProgress.value = 0;

      if (downloadSucceeded(result)) {
        isModel.value = true;
        modelAvailabilityMap[filename] = true;
        console.log("Model download success!");
      } else {
        console.error("Model download failure...");
      }
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
            const available = await window.electronAPI?.checkModel?.(
              model.filename,
            );
            modelAvailabilityMap[model.filename] = available;
          } catch {
            modelAvailabilityMap[model.filename] = false;
          }
        }),
      );
    };

    const downloadSucceeded = (result) => {
      if (result === true) return true;
      if (!result || result.canceled || result.error) return false;
      return !!result.savedPath;
    };

    // Download a model from the model list
    const downloadModelInList = async (model) => {
      modelDownloading[model.filename] = true;
      modelDownloadProgress[model.filename] = 0;
      delete modelDownloadErrors[model.filename];
      let success = false;

      const progressHandler = (_e, data) => {
        if (data.filename === model.filename) {
          modelDownloadProgress[model.filename] = Math.round(
            data.percent * 100,
          );
        }
      };
      window.electronAPI.onDownloadProgress(progressHandler);

      try {
        const result = await window.electronAPI.downloadModel(
          model.url,
          model.filename,
        );
        success = downloadSucceeded(result);
        if (success) {
          modelAvailabilityMap[model.filename] = true;
        } else if (result?.canceled) {
          modelDownloadErrors[model.filename] = "Canceled";
        } else {
          modelDownloadErrors[model.filename] = result?.error || "Download failed";
        }
      } catch (e) {
        modelDownloadErrors[model.filename] = e?.message || "Download failed";
        console.error(`Failed to download ${model.filename}:`, e);
      } finally {
        modelDownloading[model.filename] = false;
        modelDownloadProgress[model.filename] = 0;
      }
      return success;
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

    // Browse-models button now opens the global LLM picker modal
    // (LlmModelPickerModal at App.vue level) instead of toggling a
    // local panel. The legacy panel was 192 lines of duplicated UI;
    // retired in v1.6 of the design system.
    const openModelPicker = () => {
      if (remoteInference.active) { window.dispatchEvent(new CustomEvent('bonzai:open-network')); return; }
      modelPicker.show();
    };

    // Per-message inspector — wired through ChatMessage's @inspect
    // event. Pulls the chat-specific metadata onto the global rail
    // shape (kind/text, model, network origin, mint state if minted).
    const onInspectInference = (inference) => {
      if (!inference) return;
      const visibleAnswer = stripThinkBlocks(inference.answer?.text || "");
      const rawAnswer = inference.answer?.text || "";
      const promptText = inference.question || "";
      const wordCount = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;
      const currentParams = inference.requestOptions || getChatRequestOptions();
      generationInspector.show({
        id: inference.id,
        answerId: inference.answer?.id,
        kind: "text",
        elapsedMs: inference.durationMs,
        prompt: promptText,
        outputText: visibleAnswer,
        rawOutputText: rawAnswer,
        model: inference.model || (currentModel.value?.modelname || ""),
        modelId: currentModel.value?.filename,
        ts: inference.timestamp,
        createdAt: inference.createdAt,
        status: inference.error ? "Error" : inference.stopped ? "Stopped" : "Complete",
        errorMessage: inference.errorMessage || "",
        networkMode: inference.networkMode || "local",
        peerId: inference.peerId,
        maxTokens: currentParams.maxTokens,
        temperature: currentParams.temperature,
        seed: currentParams.seed,
        reasoning: inference.reasoningEnabled == null
          ? (isThinkingModel.value ? (reasoningEnabled.value ? "Enabled" : "Disabled") : "Not supported")
          : (inference.reasoningEnabled ? "Enabled" : "Disabled"),
        systemPrompt: String(inference.systemPrompt || chatParams.systemPrompt || "").trim(),
        modelProvenance: inference.modelProvenance || null,
        mintState: inference.nft || null,
        lineage: {
          parentId: inference.branchParentId || null,
          rootId: inference.branchRootId || null,
          depth: Number(inference.branchDepth) || 0,
          pinned: !!inference.pinned,
        },
        extra: {
          promptChars: String(promptText.length),
          promptWords: String(wordCount(promptText)),
          responseChars: String(visibleAnswer.length),
          responseWords: String(wordCount(visibleAnswer)),
          rawResponseChars: String(rawAnswer.length),
          ...(inference.tokensPerSecond ? { tokensPerSecond: `${inference.tokensPerSecond} tok/s` } : {}),
        },
      });
    };

    const loadModel = async (model) => {
      console.log("Now loading (raw)...", model);
      isLoading.value = true;

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
        draftModel: model.draftModel || null,
        draftUrl: model.draftUrl || null,
        specType: model.specType || null,
        specDraftNMax: model.specDraftNMax || null,
        mtp: model.mtp || false,
        // Reasoning is OFF at startup. Live per-request toggle is sent
        // via `chat_template_kwargs` in chatStream — no reload needed.
      };

      console.log("Sending to electronAPI.loadModel:", payload);

      try {
        await window.electronAPI.loadModel(payload);
        loadedModel.value = payload;
        modelStore.setCurrent(model);

        // Update mmproj availability for multimodal models
        if (model.isMultimodal && model.mmproj) {
          isMmprojAvailable.value = await window.electronAPI.checkMmproj(
            model.mmproj,
          );
        } else {
          isMmprojAvailable.value = false;
        }
      } catch (error) {
        modelDownloadErrors[model.filename] = error?.message || "Unable to load model";
      } finally {
        isLoading.value = false;
      }
    };

    const handleRecommendedModel = async (model) => {
      if (!model?.filename) return;
      modelStore.setPreferred(model);
      hasUserSelectedModel.value = true;
      if (modelDownloading[model.filename]) {
        await window.electronAPI?.cancelModelDownload?.(model.filename);
        return;
      }
      if (isLoading.value) return;
      currentModel.value = { ...model };
      await checkMmprojAvailability(model);

      let available = modelAvailabilityMap[model.filename];
      if (available === undefined) {
        available = await isModelAvailable(model.filename);
        modelAvailabilityMap[model.filename] = available;
      }

      if (!available) {
        const downloaded = await downloadModelInList(model);
        if (!downloaded) return;
      }

      await loadModel(model);
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

    // ChatInput attachment-chip integration. The component renders a
    // chip stack from `attachments` (an array); we translate the
    // single-image attachedImage ref into an array shape for that
    // contract. The hidden <input type="file"> sits next to ChatInput
    // in the template and `triggerImageAttach` clicks it.
    const hiddenImageInput = ref(null);
    const chatInputRef = ref(null);
    const chatAttachments = computed(() => {
      if (!attachedImage.value) return [];
      return [{ kind: "image", name: attachedImage.value.name }];
    });
    const triggerImageAttach = () => {
      hiddenImageInput.value?.click();
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

    const toDbGeneration = (inf) => ({
      id: inf.id,
      pipeline: "text",
      mode: "chat",
      prompt: inf.question || "",
      outputText: inf.answer?.text || "",
      modelKey: inf.model || null,
      params: {
        answerId: inf.answer?.id || inf.id,
        tokensPerSecond: inf.tokensPerSecond || null,
        networkMode: inf.networkMode || "local",
        nft: inf.nft || null,
        stopped: !!inf.stopped,
        pinned: !!inf.pinned,
        branchParentId: inf.branchParentId || null,
        branchRootId: inf.branchRootId || null,
        branchDepth: Number(inf.branchDepth) || 0,
        requestOptions: inf.requestOptions || null,
        reasoningEnabled: inf.reasoningEnabled ?? null,
        systemPrompt: inf.systemPrompt || "",
        durationMs: inf.durationMs || null,
      },
      triggeredBy: "user",
      status: inf.error ? "error" : "done",
      error: inf.errorMessage || null,
      createdAt: inf.timestamp || Date.now(),
      finishedAt: inf.timestamp || Date.now(),
    });

    const fromDbGeneration = (row) => {
      const params = row?.params && typeof row.params === "object" ? row.params : {};
      return {
        id: row.id,
        question: row.prompt || "",
        answer: {
          id: params.answerId || row.id,
          text: row.outputText || "",
        },
        type: "text",
        timestamp: row.createdAt || Date.now(),
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
        model: row.modelKey || row.modelFilename || "Unknown",
        tokensPerSecond: params.tokensPerSecond || null,
        networkMode: params.networkMode || "local",
        nft: params.nft || null,
        stopped: !!params.stopped,
        pinned: !!params.pinned,
        branchParentId: params.branchParentId || null,
        branchRootId: params.branchRootId || null,
        branchDepth: Number(params.branchDepth) || 0,
        requestOptions: params.requestOptions || null,
        reasoningEnabled: params.reasoningEnabled ?? null,
        systemPrompt: params.systemPrompt || "",
        durationMs: params.durationMs || null,
        error: row.status === "error",
        errorMessage: row.error || "",
      };
    };

    const saveInferenceToDb = async (inf) => {
      const db = window.electronAPI?.db?.generations;
      if (!db?.create || !db?.update || !inf?.id) return false;
      try {
        const row = toDbGeneration(inf);
        const existing = await db.get?.(inf.id);
        if (existing) {
          await db.update(inf.id, row);
        } else {
          await db.create(row, []);
        }
        return true;
      } catch (e) {
        console.warn("[GenerativeText] Failed to save SQLite generation:", e);
        return false;
      }
    };

    const deleteInferenceFromDb = async (id) => {
      const db = window.electronAPI?.db?.generations;
      if (!db?.delete || !id) return false;
      try {
        await db.delete(id);
        return true;
      } catch (e) {
        console.warn("[GenerativeText] Failed to delete SQLite generation:", e);
        return false;
      }
    };

    const loadInferencesFromDb = async () => {
      const db = window.electronAPI?.db?.generations;
      if (!db?.list) return [];
      try {
        const rows = await db.list({
          pipeline: "text",
          triggeredBy: "user",
          limit: 1000,
        });
        return Array.isArray(rows)
          ? rows
              .filter((row) => row.prompt || row.outputText)
              .map(fromDbGeneration)
              .reverse()
          : [];
      } catch (e) {
        console.warn("[GenerativeText] Failed to load SQLite generations:", e);
        return [];
      }
    };

    const clearTextInferencesFromDb = async () => {
      const db = window.electronAPI?.db?.generations;
      if (!db?.list || !db?.delete) return false;
      try {
        const rows = await db.list({
          pipeline: "text",
          triggeredBy: "user",
          limit: 10000,
        });
        await Promise.all((rows || []).map((row) => db.delete(row.id)));
        return true;
      } catch (e) {
        console.warn("[GenerativeText] Failed to clear SQLite text generations:", e);
        return false;
      }
    };

    // Delete a single inference from history
    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.value.length) return;
      const target = inferences.value[idx];
      await deleteInferenceFromDb(target?.id);
      inferences.value = inferences.value.filter((_, i) => i !== idx);
      hasCopy.value = hasCopy.value.filter((_, i) => i !== idx);
      await persistInferences([...inferences.value]);
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

    const deleteInferenceAtIndex = async (idx) => {
      if (idx < 0 || idx >= inferences.value.length) return;
      const target = inferences.value[idx];
      await deleteInferenceFromDb(target?.id);
      inferences.value = inferences.value.filter((_, i) => i !== idx);
      hasCopy.value = hasCopy.value.filter((_, i) => i !== idx);
      if (activeRailId.value === target?.id) {
        activeRailId.value = inferences.value[idx]?.id || inferences.value[idx - 1]?.id || null;
      }
      await persistInferences([...inferences.value]);
    };

    const deleteMessage = async (inf) => {
      const idx = inferences.value.findIndex((i) => i.id === inf.id);
      if (idx < 0) return;
      clearDeleteToastTimer();
      pendingDelete.value = {
        id: inf.id,
        prompt: inf.question || "",
      };
      pendingDeleteTimer = window.setTimeout(() => {
        pendingDelete.value = null;
        pendingDeleteTimer = null;
      }, 7000);
    };

    const confirmDeleteMessage = async () => {
      const id = pendingDelete.value?.id;
      if (!id) return;
      dismissDeleteToast();
      const idx = inferences.value.findIndex((i) => i.id === id);
      await deleteInferenceAtIndex(idx);
    };

    const editMessage = async (inf) => {
      const idx = inferences.value.findIndex((i) => i.id === inf.id);
      if (idx < 0) return;
      branchDraft.value = {
        parentId: inf.id,
        rootId: inf.branchRootId || inf.id,
        depth: Math.min(Number(inf.branchDepth || 0) + 1, 4),
      };
      activeRailId.value = inf.id;
      isNewChatDraft.value = false;
      form.prompt = inf.question;
      nextTick(() => chatInputRef.value?.focus?.());
    };

    const regenerateMessage = async (inf) => {
      const idx = inferences.value.findIndex((i) => i.id === inf.id);
      if (idx < 0) return;
      const target = inferences.value[idx];
      // Remove the old Q&A pair, then re-send the same prompt so a
      // fresh assistant response is generated in its place.
      await deleteInferenceFromDb(target.id);
      inferences.value = inferences.value.filter((_, i) => i !== idx);
      hasCopy.value = hasCopy.value.filter((_, i) => i !== idx);
      await persistInferences([...inferences.value]);
      await sendMessage(target.question);
    };

    const retryMessage = async (inf) => {
      const idx = inferences.value.findIndex((i) => i.id === inf.id);
      if (idx < 0) return;
      const target = inferences.value[idx];
      // Clear error state before retrying
      target.error = false;
      target.errorMessage = "";
      inferences.value = [...inferences.value];
      // Re-send the same prompt (keep the user message, replace answer)
      await sendMessage(target.question);
    };

    const canSwitchInferenceToLocal = (inf) => {
      return !!inf?.error && !!inf?.networkMode && inf.networkMode !== "local";
    };

    const switchInferenceToLocal = async (inf) => {
      try {
        await window.electronAPI?.store?.set?.("p2p.networkMode", "local");
        await window.electronAPI?.store?.set?.("p2p.pipeline.enabled", false);
        pipelineError.value = null;
      } catch (e) {
        console.warn("[GenerativeText] Failed to switch to local mode:", e);
      }
      await retryMessage(inf);
    };

    const togglePinnedInference = async (entry) => {
      const idx = inferences.value.findIndex((inf) => inf.id === entry.id);
      if (idx < 0) return;
      const next = [...inferences.value];
      next[idx] = {
        ...next[idx],
        pinned: !next[idx].pinned,
      };
      inferences.value = next;
      await persistInferences(next);
    };

    const persistInferences = async (data) => {
      try {
        const serialized = JSON.parse(JSON.stringify(data));
        await Promise.all([
          window.electronAPI?.store?.set?.("textInferences", serialized),
          window.electronAPI?.store?.set?.("unifiedTextInferences", serialized),
          ...serialized.map((inf) => saveInferenceToDb(inf)),
        ]);
      } catch (e) {
        console.error("[GenerativeText] Failed to persist inferences:", e);
      }
    };

    // ─── Streaming performance optimization ──────────────────
    // Batches shallowRef array replacements via requestAnimationFrame
    // so that rapid token-by-token streaming updates coalesce into
    // one reactive render per frame instead of per token.
    let _rafPending = false;
    const scheduleStreamUpdate = () => {
      if (_rafPending) return;
      _rafPending = true;
      requestAnimationFrame(() => {
        inferences.value = [...inferences.value];
        _rafPending = false;
      });
    };

    const initialState = {
      prompt: "",
    };

    const form = reactive({ ...initialState });
    const chatParamsOpen = ref(false);
    const chatParams = reactive({
      temperature: 0.7,
      maxTokens: 2048,
      seed: "",
      systemPrompt: "",
    });
    let appliedSystemPrompt = "";

    const getChatRequestOptions = () => {
      const maxTokens = Math.min(
        8192,
        Math.max(128, Number(chatParams.maxTokens) || 2048),
      );
      const temperature = Math.min(
        2,
        Math.max(0, Number(chatParams.temperature) || 0),
      );
      const seedText = String(chatParams.seed ?? "").trim();
      const seed = seedText === "" ? null : Number(seedText);
      return {
        maxTokens,
        temperature,
        ...(Number.isInteger(seed) && seed >= 0 ? { seed } : {}),
      };
    };

    const buildProvenanceSystemBlock = (provenance) => {
      if (!provenance || typeof provenance !== "object") return "";
      const dataset = provenance.dataset || {};
      const attribution = provenance.attribution || {};
      const origins = Array.isArray(provenance.origins) ? provenance.origins : [];
      const owners = Array.isArray(dataset.dataOwnerWallets)
        ? dataset.dataOwnerWallets
        : Array.isArray(attribution.dataOwnerWallets)
          ? attribution.dataOwnerWallets
          : [];
      const revenuePlan = attribution.revenuePlan || {};
      const participants = Array.isArray(revenuePlan.participants) ? revenuePlan.participants : [];
      const originLines = origins.slice(0, 12).map((origin, index) => {
        const title = origin.pageTitle || origin.sourceUrl || `record ${index + 1}`;
        const owner = origin.dataOwnerWallet || origin.creatorWallet || "unknown owner";
        const source = origin.sourceUrl ? ` source=${origin.sourceUrl}` : "";
        const license = origin.license ? ` license=${origin.license}` : "";
        const tags = Array.isArray(origin.tags) && origin.tags.length ? ` tags=${origin.tags.slice(0, 6).join(", ")}` : "";
        return `${index + 1}. ${title}; owner=${owner}${source}${license}${tags}`;
      });

      return [
        "BonzAI trusted model provenance:",
        `- Model id: ${provenance.model?.id || "unknown"}`,
        `- Base model: ${provenance.model?.baseModel || "unknown"}`,
        `- Dataset: ${dataset.name || dataset.id || "unknown"} (${dataset.type || "unknown"})`,
        `- Known training records: ${dataset.recordCount || origins.length || "unknown"}`,
        `- Data-owner wallets: ${owners.length ? owners.slice(0, 30).join(", ") : "not provided"}`,
        `- Contribution ids: ${Array.isArray(dataset.contributionIds) && dataset.contributionIds.length ? dataset.contributionIds.slice(0, 30).join(", ") : "not provided"}`,
        participants.length
          ? `- Downstream revenue route: ${participants.slice(0, 20).map(p => `${p.wallet || p.address}:${p.shareBps || 0}bps`).join(", ")}`
          : "- Downstream revenue route: not provided",
        "- If the user asks what this model was trained on, answer from this provenance. Never invent missing origins, owners, licenses, or rights.",
        originLines.length ? "- Sample origins:" : "",
        ...originLines,
      ].filter(Boolean).join("\n");
    };

    const effectiveSystemPrompt = computed(() => {
      const userPrompt = String(chatParams.systemPrompt || "").trim();
      const provenanceBlock = buildProvenanceSystemBlock(activeModelProvenance.value);
      return [userPrompt, provenanceBlock].filter(Boolean).join("\n\n");
    });

    const syncSystemPrompt = async (memoryContext = "") => {
      const nextPrompt = [effectiveSystemPrompt.value, memoryContext].filter(Boolean).join("\n\n");
      if (nextPrompt === appliedSystemPrompt) return;
      await window.electronAPI?.setSystemPrompt?.(nextPrompt);
      appliedSystemPrompt = nextPrompt;
    };

    const suggestionChips = [
      {
        id: "deepen",
        label: "Go deeper",
        icon: "travel_explore",
        title: "Ask for a richer follow-up with examples and tradeoffs",
        prompt: ({ question, answer }) =>
          `Go deeper on your previous answer. Use the original question and answer as context, then add the most useful missing details, examples, edge cases, and tradeoffs.\n\nOriginal question:\n${question}\n\nPrevious answer:\n${answer}`,
      },
      {
        id: "clarify",
        label: "Clarify",
        icon: "help",
        title: "Ask for a simpler explanation and assumptions",
        prompt: ({ question, answer }) =>
          `Clarify your previous answer. Start with the plain-English takeaway, define any ambiguous terms, list assumptions, and call out what I should verify next.\n\nOriginal question:\n${question}\n\nPrevious answer:\n${answer}`,
      },
      {
        id: "code",
        label: "Make code",
        icon: "code",
        title: "Turn the answer into a practical implementation",
        prompt: ({ question, answer }) =>
          `Turn your previous answer into practical code or implementation steps. Include file-level guidance, important edge cases, and a short verification checklist. If code is not appropriate, explain the closest concrete artifact instead.\n\nOriginal question:\n${question}\n\nPrevious answer:\n${answer}`,
      },
    ];

    const buildSuggestionPrompt = (chip, inf) => {
      const question = String(inf?.question || "").trim() || "(No original question captured)";
      const answer = stripThinkBlocks(inf?.answer?.text || "").trim() || "(No previous answer captured)";
      return chip.prompt({ question, answer });
    };
    const slashCommands = [
      {
        id: "new",
        label: "New chat",
        description: "Start a blank visible thread",
        icon: "add",
      },
      {
        id: "models",
        label: "Browse models",
        description: "Open the model picker",
        icon: "folder_open",
      },
      {
        id: "history",
        label: "Toggle history",
        description: "Show or hide the history rail",
        icon: "history",
      },
      {
        id: "params",
        label: "Advanced params",
        description: "Open generation controls",
        icon: "tune",
      },
      {
        id: "clear",
        label: "Clear chat",
        description: "Clear saved text history",
        icon: "ink_eraser",
      },
    ];

    // Image attachment for multimodal models
    const attachedImage = ref(null); // { dataUrl, name }
    const isMmprojAvailable = ref(false);
    const mmprojDownloadProgress = ref(0);

    // Check if current model supports vision
    const isMultimodalModel = computed(() => {
      return remoteInference.active ? remoteInference.inputModalities?.includes('image') === true : currentModel.value?.isMultimodal === true;
    });

    // Check if current model supports thinking/reasoning
    const isThinkingModel = computed(() => {
      return !remoteInference.active && currentModel.value?.thinking === true;
    });
    const composerHint = computed(() => {
      if (branchDraft.value) return "Forking conversation";
      return reasoningEnabled.value && isThinkingModel.value ? "Reasoning ON" : "";
    });

    function resetForm() {
      Object.assign(form, initialState);
      attachedImage.value = null;
    }

    async function resetChat() {
      if (
        inferences.value.length > 0 &&
        !confirm("Clear this conversation? This cannot be undone.")
      ) {
        return;
      }
      inferences.value = [];
      activeRailId.value = null;
      isNewChatDraft.value = false;
      // Clear persisted text inferences
      try {
        await Promise.all([
          clearTextInferencesFromDb(),
          window.electronAPI?.store?.set?.("textInferences", []),
          window.electronAPI?.store?.set?.("unifiedTextInferences", []),
        ]);
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
            const existingIds = new Set(inferences.value.map((inf) => inf.id));
            const newItems = data.filter((item) => !existingIds.has(item.id));
            if (newItems.length < data.length) {
              console.log(
                `[GenerativeText] Skipped ${data.length - newItems.length} duplicate(s) on import`,
              );
            }
            inferences.value = [...newItems, ...inferences.value];
            hasCopy.value = new Array(inferences.value.length).fill(false);
            await persistInferences([...inferences.value]);
          }
        } catch (err) {
          console.error("Failed to import history:", err);
        }
      };
      input.click();
    };

    // Load persisted text inferences on component mount.
    // Guarantee every inference has an id so the history rail and
    // activeInference lookup never fail.
    const loadHistory = async () => {
      try {
        let saved = await loadInferencesFromDb();
        if (!saved.length) {
          const hasTextHistory = await window.electronAPI?.store?.has?.(
            "textInferences",
          );
          if (hasTextHistory === false) {
            saved = await window.electronAPI?.store?.get?.(
              "unifiedTextInferences",
              [],
            );
          } else {
            saved = await window.electronAPI?.store?.get?.(
              "textInferences",
              [],
            );
          }
        }
        if (Array.isArray(saved) && saved.length > 0) {
          inferences.value = saved.map((inf) => ({
            ...inf,
            id: inf.id || uuid(),
          }));
          hasCopy.value = new Array(saved.length).fill(false);
        }
      } catch (e) {
        console.error("Failed to load text inferences:", e);
      }
    };

    // Streaming state: the inference currently being streamed
    const streamingText = ref("");
    const streamingInferenceId = ref(null);
    const isStopping = ref(false);

    const stopGeneration = () => {
      if (!isLoading.value) return;
      isStopping.value = true;
      try { window.electronAPI.abortChatStream(); } catch {}
    };

    const sendMessage = async (prompt) => {
      if (!hasAccess.value) return;

      // Clear any stale pipeline error banner so the user sees a fresh
      // result (or a fresh error).
      pipelineError.value = null;

      const memoryContext = remoteInference.active ? '' : await memoryService.buildRecallContext(prompt, { includeUser: true });
      await syncSystemPrompt(memoryContext);
      const chatRequestOptions = getChatRequestOptions();

      isLoading.value = true;
      streamingText.value = "";

      // Create the inference entry immediately so streaming text appears
      const inferenceId = uuid();
      const activityId = `chat:${inferenceId}`;
      reportOperation({id:activityId,title:"Generating text",mode:"chat",status:"running",stage:"Generating",location:"Chat"});
      const answerId = uuid();
      const activeBranch = branchDraft.value ? { ...branchDraft.value } : null;
      streamingInferenceId.value = answerId;
      const modelName = remoteInference.active ? remoteInference.model : currentModel.value?.modelname || "Unknown";
      let configuredNetworkMode = "local";
      let pipelineEnabled = false;
      try {
        configuredNetworkMode = await window.electronAPI?.store?.get?.("p2p.networkMode", "local") || "local";
        pipelineEnabled = !remoteInference.active && await window.electronAPI?.store?.get?.("p2p.pipeline.enabled", false) || false;
      } catch (e) {
        console.warn("[GenerativeText] Failed to read network mode:", e);
      }
      const initialNetworkMode =
        configuredNetworkMode === "consumer"
          ? pipelineEnabled
            ? "private"
            : "remote"
          : "local";
      const newInference = {
        id: inferenceId,
        question: prompt,
        answer: { id: answerId, text: "" },
        image: attachedImage.value?.dataUrl || null,
        model: modelName,
        tokensPerSecond: null,
        networkMode: initialNetworkMode,
        error: false,
        errorMessage: "",
        branchParentId: activeBranch?.parentId || null,
        branchRootId: activeBranch?.rootId || null,
        branchDepth: activeBranch?.depth || 0,
        requestOptions: { ...chatRequestOptions },
        reasoningEnabled: isThinkingModel.value ? reasoningEnabled.value === true : null,
        systemPrompt: [effectiveSystemPrompt.value, memoryContext].filter(Boolean).join("\n\n"),
        userSystemPrompt: String(chatParams.systemPrompt || "").trim(),
        modelProvenance: activeModelProvenance.value,
        timestamp: Date.now(),
        durationMs: null,
      };
      inferences.value = [...inferences.value, newInference];
      hasCopy.value = [...hasCopy.value, false];
      activeRailId.value = newInference.id; // show the new conversation
      isNewChatDraft.value = false;
      branchDraft.value = null;

      try {
        let assistantResult;
        let tokenCount = 0;
        let routingMode = remoteInference.active ? 'remote' : 'local'; // 'local' | 'remote' | 'private'
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
              scheduleStreamUpdate();
            }
          });

          try {
            const result = remoteInference.active ? { useLocal: true, transport: 'openrouter' } : await inferenceRequest('llm', {
              messages: [{ role: 'user', content: prompt }],
              model: currentModel.value?.modelname,
              prompt, // for pipeline orchestrator
              ...chatRequestOptions,
            });

            if (result?.ok && result.result) {
              if (result.pipeline) {
                routingMode = 'private';
                assistantResult = result.result?.text || streamingText.value || '';
              } else if (result.remote) {
                routingMode = 'remote';
                const text = result.result?.choices?.[0]?.message?.content || JSON.stringify(result.result);
                assistantResult = text;
                tokenCount = text.split(/\s+/).length;
                streamingText.value = text;
                const arr = inferences.value;
                const last = arr[arr.length - 1];
                if (last && last.answer.id === answerId) {
                  last.answer.text = text;
                  scheduleStreamUpdate();
                }
              }
            }

            // useLocal or no result: fall through to local streaming
            if (!assistantResult) {
              // Fallback: direct local streaming via llama-server
              const chatOpts = { ...chatRequestOptions, activityId, model: currentModel.value ? JSON.parse(JSON.stringify(currentModel.value)) : null, returnMetadata: remoteInference.active };
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
                    scheduleStreamUpdate();
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
          last.answer.text = typeof assistantResult === "string" ? assistantResult : assistantResult?.text || "";
          if (assistantResult?.source === "openrouter") { last.source = "openrouter"; last.model = assistantResult.model; last.usage = assistantResult.usage; }
          last.tokensPerSecond = assistantResult?.usage?.completion_tokens && elapsedSec > 0 ? (assistantResult.usage.completion_tokens / elapsedSec).toFixed(1) : finalTokPerSec;
          last.networkMode = routingMode;
          last.durationMs = Math.round(elapsedSec * 1000);
          inferences.value = [...arr];
        }

        console.log("prompt", {
          id: answerId,
          text: assistantResult,
          tokPerSec: finalTokPerSec,
        });

        reportOperation({id:activityId,status:isStopping.value?"cancelled":"completed",stage:isStopping.value?"Cancelled":"Ready"});
        // Mark as stopped if user clicked Stop during this turn
        if (isStopping.value) {
          const arr = inferences.value;
          const last = arr[arr.length - 1];
          if (last && last.answer.id === answerId) {
            last.stopped = true;
            // Prefer the accumulated streaming text if the returned result is empty
            if (!assistantResult) last.answer.text = streamingText.value;
            inferences.value = [...arr];
          }
          isStopping.value = false;
        }

        await persistInferences([...inferences.value]);

        resetForm();
        isLoading.value = false;
      } catch (e) {
        reportOperation({id:activityId,status:"failed",stage:"Failed",error:e.message});
        console.error("Chat error:", e);
        const arr = inferences.value;
        const last = arr[arr.length - 1];
        if (last && last.answer.id === answerId) {
          last.answer.text = last.answer.text || streamingText.value || "";
          last.error = true;
          last.errorMessage = e.message || "Generation failed";
          inferences.value = [...arr];
        }
        await persistInferences([...inferences.value]);
        isLoading.value = false;
      } finally {
        streamingText.value = "";
        streamingInferenceId.value = null;
        isStopping.value = false;
      }
    };

    const { toClipboard } = useClipboard();
    const markdownOptions = {
      html: false,
      linkify: true,
      breaks: false,
    };
    const markdownPlugins = [bonzaiCodeBlockPlugin];

    const handleAnswerClick = async (event) => {
      const btn = event.target.closest(".bz-code__copy");
      if (!btn) return;
      const block = btn.closest(".bz-code");
      const code = block?.querySelector("code");
      const icon = btn.querySelector(".material-symbols-outlined");
      const text = code?.textContent || "";
      if (!text) return;
      try {
        await toClipboard(text);
        btn.classList.add("bz-code__copy--ok");
        btn.title = "Copied";
        btn.setAttribute("aria-label", "Copied to clipboard");
        if (icon) icon.textContent = "check";
        setTimeout(() => {
          btn.classList.remove("bz-code__copy--ok");
          btn.title = "Copy code";
          btn.setAttribute("aria-label", "Copy code");
          if (icon) icon.textContent = "content_copy";
        }, 1500);
      } catch (e) {
        console.error("Failed to copy code:", e);
      }
    };

    // Always loaded toggle state (from shared store)
    const alwaysLoaded = computed(() => modelStore.state.alwaysLoaded);
    const toggleAlwaysLoaded = () => {
      modelStore.setAlwaysLoaded(!alwaysLoaded.value);
    };

    watch(() => modelStore.state.preferredFilename, filename => {
      if (loadedModel.value) return;
      const preferred = selectPreferredModel(availableModels.value, filename);
      if (preferred) currentModel.value = { ...preferred };
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
            hasUserSelectedModel.value = true;
            currentModel.value = { ...match };
          }
        }
      },
    );

    // Bottom bar's "browse models" event now opens the global picker.
    // The chat tab no longer hosts its own panel, so this listener is
    // a thin shim — kept so older event dispatches still land correctly.
    const handleShowBrowseModels = () => {
      modelPicker.show();
    };
    const handleChatShortcuts = (event) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        startNewChat();
        return;
      }

      if (key === "o" && event.shiftKey) {
        event.preventDefault();
        openModelPicker();
        return;
      }

      const recentIdx = Number(event.key);
      if (recentIdx >= 1 && recentIdx <= 5) {
        const entry = recentRailEntries.value[recentIdx - 1];
        if (!entry) return;
        event.preventDefault();
        selectFromRail(entry);
      }
    };
    onMounted(() => {
      refreshRemoteInference().catch(() => {});
      window.addEventListener("bonzai:show-browse-models", handleShowBrowseModels);
      window.addEventListener("keydown", handleChatShortcuts);
      pipelineErrorUnsub = window.electronAPI?.onPipelineError?.((err) => {
        pipelineError.value = err;
      });
      modelChangedUnsub = window.electronAPI?.onModelChanged?.((model) => {
        loadedModel.value = model || null;
        if (model) {
          hasUserSelectedModel.value = true;
          syncCurrentModelFromLoaded(model);
          isModel.value = true;
        }
      });
      refreshLoadedModel().catch((e) => {
        console.warn("[GenerativeText] getLoadedModel failed:", e?.message);
      });
      const restoreModelSelection = async () => {
        const custom = await window.electronAPI?.listCustomModels?.() || [];
        for (const model of custom) {
          if (!model.filename) continue;
          availableModels.value[`custom:${model.filename}`] = {
            ...model, modelname: model.modelname || model.name || model.filename,
            filesize: model.filesize || model.size, custom: true,
          };
        }
        if (!loadedModel.value && !hasUserSelectedModel.value) {
          const preferred = selectPreferredModel(availableModels.value, modelStore.state.preferredFilename);
          if (preferred) currentModel.value = { ...preferred };
        }
        await checkAllModelAvailability();
      };
      restoreModelSelection().catch((e) => {
        console.warn("[GenerativeText] model availability scan failed:", e?.message);
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
      window.removeEventListener("keydown", handleChatShortcuts);
      if (pipelineErrorUnsub) { pipelineErrorUnsub(); pipelineErrorUnsub = null; }
      if (modelChangedUnsub) { modelChangedUnsub(); modelChangedUnsub = null; }
      clearDeleteToastTimer();
    });

    // ─── Chat-layout integration (rail + empty state) ──────────────
    // Map inferences → rail-friendly entries. Prompt = the question
    // text; ts = inference timestamp. Most-recent first; ChatHistoryRail
    // re-sorts and groups by date itself.
    const railEntries = computed(() =>
      (inferences.value || []).map((inf) => {
        const tokenCount = estimateTokenCount(inf.answer?.text || "");
        return {
          id: inf.id,
          prompt: inf.question || "(empty prompt)",
          model: inf.model,
          ts: inf.timestamp,
          tokenCount,
          durationMs: inferDurationMs(inf, tokenCount),
          pinned: !!inf.pinned,
          branchParentId: inf.branchParentId || null,
          branchRootId: inf.branchRootId || null,
          branchDepth: Number(inf.branchDepth) || 0,
        };
      }),
    );
    const activeRailId = ref(null);
    const historyRailHidden = ref(false);
    const isHistoryCollapsed = computed(() => !railEntries.value.length || historyRailHidden.value);
    const isNewChatDraft = ref(false);
    const toggleHistoryRail = () => {
      if (railEntries.value.length) historyRailHidden.value = !historyRailHidden.value;
    };
    const startNewChat = () => {
      activeRailId.value = null;
      isNewChatDraft.value = true;
      branchDraft.value = null;
      form.prompt = "";
      nextTick(() => chatInputRef.value?.focus?.());
    };
    const runSlashCommand = async (command) => {
      const id = command?.id;
      form.prompt = "";
      if (id === "new") {
        startNewChat();
      } else if (id === "models") {
        openModelPicker();
      } else if (id === "history") {
        toggleHistoryRail();
      } else if (id === "params") {
        chatParamsOpen.value = true;
      } else if (id === "clear") {
        await resetChat();
      }
      nextTick(() => chatInputRef.value?.focus?.());
    };

    const selectFromRail = (entry) => {
      activeRailId.value = entry.id;
      isNewChatDraft.value = false;
      // Scroll the stream container to bring the selected message into view.
      nextTick(() => {
        const container = getStreamEl();
        const el = messagesContainer.value?.querySelector(`[data-inference-id="${entry.id}"]`);
        if (container && el) {
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const top =
            elRect.top -
            containerRect.top +
            container.scrollTop -
            (container.clientHeight - elRect.height) / 2;
          container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      });
    };

    // The inference currently shown in the main stream. History is
    // never auto-loaded — only renders when the user explicitly clicks
    // a rail item OR when a message is actively streaming.
    const activeInference = computed(() => {
      if (!inferences.value?.length) return null;
      if (activeRailId.value) {
        const found = inferences.value.find((inf) => inf.id === activeRailId.value);
        if (found) return found;
      }
      return null;
    });

    // Thread of inferences to render as a multi-turn conversation.
    // Keep turns chronological so streaming follows the latest exchange.
    const threadInferences = computed(() => {
      const arr = inferences.value || [];
      if (!arr.length) return [];
      if (isNewChatDraft.value && !isLoading.value) return [];

      let idx;
      if (activeRailId.value) {
        idx = arr.findIndex((inf) => inf.id === activeRailId.value);
        if (idx === -1) idx = arr.length - 1;
      } else {
        idx = arr.length - 1;
      }

      const contextSize = 30;
      const startIdx = Math.max(0, idx - contextSize + 1);

      return arr.slice(startIdx, idx + 1).map((inf, i) => ({
        ...inf,
        _originalIndex: startIdx + i,
      }));
    });
    const recentRailEntries = computed(() =>
      [...railEntries.value]
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 5),
    );

    // Message thread container ref for auto-scrolling
    const messagesContainer = ref(null);

    // Helper to find the actual scrollable stream container (parent of messagesContainer)
    const getStreamEl = () => {
      const msg = messagesContainer.value;
      if (!msg) return null;
      // The stream section is the parent in ChatLayout's grid
      return msg.parentElement;
    };

    const pickPrompt = (p) => {
      // EmptyChat passes the prompt object — value or title becomes the
      // composer's seed text, leaving the cursor at the end so the user
      // continues typing from where the suggestion stops.
      const seed = p?.value ?? p?.title ?? "";
      form.prompt = seed;
      nextTick(() => chatInputRef.value?.focus?.());
    };

    const generationDraft = useGenerationDraft({ form, chatParams, currentModel, attachedImage });
    return {
      generationDraft,
      remoteInference,
      downloadProgress,
      isLoading,
      isModel,
      loadedModel,
      isCurrentModelLoaded,
      isChatReady,
      chatHeaderTitle,
      sysInfo, desktopModelsAvailable,
      handleRecommendedModel,
      availableModels,
      sortedModels,
      currentModel,
      isModelAvailable,
      pickModel,
      downloadModel,
      deleteModel,
      loadModel,
      openModel,
      openModelPicker,
      onInspectInference,
      // ChatInput integration
      hiddenImageInput,
      chatInputRef,
      chatAttachments,
      triggerImageAttach,
      // Model list management
      loadModelDir,
      modelDir,
      modelAvailabilityMap,
      modelDownloading,
      modelDownloadProgress,
      modelDownloadErrors,
      downloadModelInList,
      deleteModelInList,
      changeModelDir,
      migrationProgress,
      openChat,
      pipelineError,
      pendingDelete,
      branchDraft,
      composerHint,
      dismissDeleteToast,
      confirmDeleteMessage,
      form,
      chatParams,
      chatParamsOpen,
      sendMessage,
      stopGeneration,
      isStopping,
      inferences,
      resetChat,
      exportHistory,
      importHistory,
      hasCopy,
      removeInference,
      deleteMessage,
      editMessage,
      regenerateMessage,
      retryMessage,
      canSwitchInferenceToLocal,
      switchInferenceToLocal,
      togglePinnedInference,
      handleAnswerClick,
      markdownOptions,
      markdownPlugins,
      suggestionChips,
      buildSuggestionPrompt,
      slashCommands,
      runSlashCommand,
      streamingInferenceId,
      // conversation threading
      threadInferences,
      messagesContainer,
      activeInference,
      loadHistory,
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
      agentHandoff, createPodcast, mintTarget,
      openMint,
      onMinted,
      // Always loaded
      alwaysLoaded,
      toggleAlwaysLoaded,
      // ChatLayout integration
      railEntries,
      activeRailId,
      isHistoryCollapsed,
      toggleHistoryRail,
      selectFromRail,
      pickPrompt,
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

    await this.loadHistory();

    await this.loadModelDir();
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

/* ─────────────────────────────────────────────────────────────────
   SETUP STATE — quiet editorial card. Replaces the legacy giant
   neurology icon + Bulma column header. The setup view appears only
   when the model isn't yet downloaded (or vision file is missing
   for a multimodal model). Once ready, ChatLayout takes over.
   ───────────────────────────────────────────────────────────────── */
.bz-text-setup {
  max-width: 880px;
  margin: var(--bz-space-7) auto;
  padding: var(--bz-space-7) var(--bz-space-6);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  position: relative;
  overflow: hidden;
}
.bz-text-setup::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      ellipse 50% 80% at 0% 0%,
      var(--bz-purple-soft),
      transparent 60%
    );
  pointer-events: none;
  z-index: 0;
}
.bz-text-setup > * { position: relative; z-index: 1; }

.bz-text-setup__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-5);
  margin-bottom: var(--bz-space-6);
}
.bz-text-setup__head h1 { margin: var(--bz-space-2) 0 0; }
.bz-text-setup__desc {
  margin-top: var(--bz-space-3);
  max-width: 60ch;
  color: var(--bz-fg-mid);
}

.bz-text-setup__specs {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4) 0;
  margin-bottom: var(--bz-space-5);
  border-top: 1px solid var(--bz-border);
  border-bottom: 1px solid var(--bz-border);
}
.bz-text-setup__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.bz-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 4px var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
}
.bz-chip .material-symbols-outlined {
  font-size: 14px !important;
  color: var(--bz-purple-300);
}

.bz-text-setup__cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-3);
  align-items: center;
  justify-content: flex-end;
}

/* ─────────────────────────────────────────────────────────────────
   CHAT WORKSPACE — overrides for ChatLayout slots. The layout
   itself is generic; these styles tune the header strip and the
   messages container so a Text-tab-specific feel survives.
   ───────────────────────────────────────────────────────────────── */
.bz-text-chat {
  /* Fill the parent flex container edge-to-edge. The input stays
     docked at the bottom via ChatLayout's grid. */
  height: 100%;
  min-height: 0;
}

/* When ChatLayout is active, remove the outer padding and disable
   scrolling on the deployment-install wrapper so ChatLayout owns
   the scroll behaviour.
   NOTE: chained selector (.base.modifier) raises specificity so this
   beats the base .models__deployment-install rule that is declared
   further down in the stylesheet. */
.models__deployment-install.models__deployment-install--chat {
  padding: 0;
  overflow: hidden;
}

.bz-text-chat__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.bz-text-chat__head-left .bz-eyebrow {
  display: block;
  margin-bottom: 2px;
  color: var(--bz-fg-low);
}
.bz-text-chat__head-left h1 { margin: 0; font-size: var(--bz-size-h1); }

.bz-text-chat__head-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
}

.bz-text-chat__gate {
  padding: var(--bz-space-4) var(--bz-space-4) 0;
}

.bz-text-chat__gate .bz-pipeline-notice {
  width: 100%;
  max-width: none;
  min-height: 0;
  margin-inline: auto;
  padding: 10px 12px;
  align-items: flex-start;
  gap: var(--bz-space-2);
}

.bz-pipeline-notice .bz-notice__icon {
  width: 18px;
  height: 18px;
  margin-top: 1px;
}

.bz-pipeline-notice .bz-notice__icon .material-symbols-outlined {
  font-size: 16px !important;
}

.bz-pipeline-notice .bz-notice__title {
  margin: 0 0 2px !important;
  font-family: "Fira Sans Condensed", sans-serif !important;
  font-style: italic;
  font-weight: 900;
  font-size: 15px !important;
  line-height: 1.1 !important;
  letter-spacing: 0;
  text-align: left;
  text-transform: uppercase;
}

.bz-pipeline-notice .bz-notice__text {
  max-width: 100%;
  margin: 0 !important;
  font-family: "Fira Sans", sans-serif;
  font-size: 13px !important;
  font-weight: 400;
  line-height: 1.35 !important;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bz-pipeline-notice .bz-notice__cta {
  align-self: flex-start;
}

.bz-text-chat__empty {
  min-height: 100%;
  display: grid;
  place-items: center;
}

.bz-text-chat__messages {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
  padding: var(--bz-space-4);
  min-height: 0;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.bz-text-chat__setup {
  padding: var(--bz-space-4);
}
.bz-text-chat__setup-cta {
  display: flex;
  justify-content: center;
  margin-top: var(--bz-space-5);
}
.bz-text-chat__recommendations {
  max-width: 760px;
  margin: var(--bz-space-5) auto 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--bz-space-3);
}
.bz-model-rec__reason p,
.bz-text-chat__recommendations > p {
  margin: var(--bz-space-2) 0;
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-body);
  font-weight: 400;
  line-height: 1.5;
  text-align: left;
  color: var(--bz-fg-muted);
}
.bz-model-rec__reason summary { cursor: pointer; }

.bz-chat-params {
  width: 100%;
  margin: 0 0 var(--bz-space-3);
  padding: var(--bz-space-3);
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 150px 120px;
  gap: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
}
.bz-chat-param {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-2);
}
.bz-chat-param--system {
  grid-column: 1 / -1;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
}
.bz-chat-param__label {
  color: var(--bz-fg-low);
  white-space: nowrap;
}
.bz-chat-param__value {
  width: 36px;
  text-align: right;
  color: var(--bz-fg-mid);
}
.bz-chat-param input,
.bz-chat-param textarea {
  min-width: 0;
  width: 100%;
  color: var(--bz-fg);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  font: inherit;
}
.bz-chat-param input[type="range"] {
  accent-color: var(--bz-purple-400);
}
.bz-chat-param input[type="number"] {
  height: 32px;
  padding: 0 var(--bz-space-2);
}
.bz-chat-param textarea {
  resize: vertical;
  min-height: 52px;
  max-height: 140px;
  padding: var(--bz-space-2);
}
.bz-chat-param input:focus,
.bz-chat-param textarea:focus {
  outline: 0;
  border-color: var(--bz-border-brand);
  box-shadow: 0 0 0 1px var(--bz-border-brand);
}
.bz-model-rec {
  display: flex;
  min-width: 0;
  min-height: 118px;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  gap: var(--bz-space-2);
  padding: var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    background var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-model-rec:hover:not(:disabled),
.bz-model-rec:focus-visible {
  background: var(--bz-raised);
  border-color: var(--bz-border-brand);
  outline: none;
}
.bz-model-rec:disabled {
  cursor: progress;
  opacity: 0.7;
}
.bz-model-rec--downloading {
  border-color: var(--bz-border-brand);
}
.bz-model-rec__main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-3);
  min-width: 0;
}
.bz-model-rec__name {
  font-weight: 600;
  line-height: 1.25;
  min-width: 0;
}
.bz-model-rec__fit {
  flex-shrink: 0;
  color: var(--bz-fg-muted);
  font-size: var(--bz-size-micro);
}
.bz-model-rec__meta {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}
.bz-model-rec__action {
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
}
@media (max-width: 900px) {
  .bz-text-chat__recommendations {
    grid-template-columns: 1fr;
  }
  .bz-chat-params {
    grid-template-columns: 1fr;
  }
  .bz-chat-param,
  .bz-chat-param--system {
    grid-template-columns: 1fr;
  }
}

hr {
  margin: 24px 0 !important;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--bz-border-strong),
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

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: url("../assets/bonzai_chat.webp") no-repeat;
  background-size: cover;  overflow: hidden;
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

h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: var(--bz-fg);
  text-align: right;
}

h2 {
  font-size: 48px;
  color: var(--bz-fg);
  text-align: right;
}

.desc-content,
p {
  margin-bottom: 3em;
  font-size: 24px;
  color: var(--bz-fg);
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
  border: 1px solid var(--bz-border);
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
  margin-left: 0;
  vertical-align: middle;
}

.network-mode-tag.nm-private {
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 0;
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

.models__deployment-install .card {
  margin: 5em;
}

form {
  position: relative;
}

::placeholder {
  color: var(--bz-border) !important;
  opacity: 1 !important;
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
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
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
  color: var(--bz-fg);
  padding: 1em !important;
  margin-bottom: 4px;
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
  background: var(--bz-card);
  border: 1px solid var(--bz-border-strong);
  color: var(--bz-fg-mid);
  transition: all 0.2s ease;
}

.always-loaded-toggle:hover {
  background: var(--bz-border-strong);
}

.always-loaded-toggle.active {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: var(--bz-emerald-500);
}

.always-loaded-toggle .toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--bz-border-strong);
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
  background: var(--bz-emerald-500);
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

.markdown-body :deep(strong),
.markdown-body :deep(b) {
  color: var(--bz-fg);
  font-weight: 700;
}

/* Headings */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--bz-fg);
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
  color: var(--bz-fg-low);
}

/* Blockquotes */
.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--bz-fg-faint);
  padding-left: 1em;
  margin: 0.75em 0;
  color: var(--bz-fg-mid);
}

/* Inline code — purple highlight, matching text size */
.markdown-body :deep(code) {
  font-family: "Fira Code", "SF Mono", "Cascadia Code", "Consolas", monospace;
  font-size: 14px;
  background: var(--bz-purple-soft);
  padding: 2px 6px;
  border-radius: 3px;
  color: #c4a0ff;
}

/* Code blocks — custom markdown-it fence renderer. */
.markdown-body :deep(.bz-code) {
  margin: 0.85em 0 var(--bz-space-4);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  overflow: hidden;
}
.markdown-body :deep(.bz-code__head) {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  padding: 4px var(--bz-space-2) 4px var(--bz-space-3);
  background: var(--bz-card);
  border-bottom: 1px solid var(--bz-border);
}
.markdown-body :deep(.bz-code__lang) {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-micro);
  letter-spacing: var(--bz-track-eyebrow);
  text-transform: uppercase;
}
.markdown-body :deep(.bz-code__copy) {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-low);
  cursor: pointer;
}
.markdown-body :deep(.bz-code__copy:hover) {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border);
}
.markdown-body :deep(.bz-code__copy--ok) {
  color: var(--bz-emerald-500);
}
.markdown-body :deep(.bz-code__copy .material-symbols-outlined) {
  font-size: 16px !important;
  overflow: visible;
}
.markdown-body :deep(.bz-code__body) {
  margin: 0;
  padding: var(--bz-space-3) var(--bz-space-4);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  overflow-x: auto;
  white-space: pre;
}
.markdown-body :deep(.bz-code__body code) {
  display: block;
  padding: 0;
  background: transparent;
  border: 0;
  color: inherit;
  font-family: var(--bz-font-mono);
  font-size: 13px;
  line-height: 1.55;
  white-space: inherit;
  font-feature-settings: "tnum" 1, "calt" 0;
}
.markdown-body :deep(.bz-code-token--comment) { color: var(--bz-fg-low); font-style: italic; }
.markdown-body :deep(.bz-code-token--keyword) { color: var(--bz-purple-300); font-weight: 700; }
.markdown-body :deep(.bz-code-token--string) { color: var(--bz-emerald-500); }
.markdown-body :deep(.bz-code-token--number) { color: var(--bz-warning); }
.markdown-body :deep(.bz-code-token--tag) { color: var(--bz-purple-100); font-weight: 700; }
.markdown-body :deep(.bz-code-token--punct) { color: var(--bz-fg-low); }

.answer-divider {
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

/* Streaming cursor */
.streaming-cursor {
  display: inline-block;
  width: 8px;
  height: 1.2em;
  background: var(--bz-emerald-500);
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
 * Visual language matches the compact chat controls: white-on-dark base with
 * `var(--bz-info)` accent, so reasoning reads as a local message affordance.
 */
.thought-bubble {
  display: inline-block;
  margin: 0.5rem 0 0.85rem;
  background: var(--bz-border);
  border: 2px solid var(--bz-border-strong);
  border-radius: 4px;
  color: var(--bz-fg-low);
  font-size: 0.92em;
  transition: all 0.2s ease;
  overflow: hidden;
}

.thought-bubble[open] {
  display: block;
  background: var(--bz-info-soft);
  border-color: var(--bz-info);
  color: var(--bz-fg);
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
  background: var(--bz-border-strong);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg);
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
  background: var(--bz-scrim-soft);
}

.thought-bubble :deep(p),
.thought-bubble :deep(li) {
  color: var(--bz-fg);
  margin: 0.25rem 0;
}

.thought-bubble :deep(code) {
  background: var(--bz-scrim);
}

.thought-bubble--partial > summary::after {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bz-info);
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
.fit-badge--tier0 { color: var(--bz-emerald-500); background: rgba(31, 139, 76, 0.10); }
.fit-badge--tier1 { color: #c9a227; background: rgba(201, 162, 39, 0.10); }
.fit-badge--tier2 { color: #cf6a1e; background: rgba(207, 106, 30, 0.10); }
.fit-badge--tier3 { color: #b13a3a; background: rgba(177, 58, 58, 0.10); }

/* ════════════════════════════════════════════════════════════════
   CHAT STREAM (Milestone 5b) — replaces .chat<ol> + .history-item.
   Centered max-width column carrying ChatMessage cards. The chat
   tab inherits this from the new vocabulary; the legacy block above
   is kept where v-if=inferences references it but is no longer
   rendered after this milestone lands.
   ════════════════════════════════════════════════════════════════ */

.bz-chat-stream {
  max-width: 760px;
  margin: var(--bz-space-5) auto 0;
  padding: 0 var(--bz-space-3);
}

/* Inline meta inside the assistant body slot — tokens/sec + origin
   pill. Sits above the markdown render. */
.bz-msg-extra-meta {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-3);
  flex-wrap: wrap;
}

/* Chat-specific message tools — copy / mint / delete. The
   ChatMessage component carries copy/inspect/regenerate as built-in
   hover actions; mint and delete are chat-tab features kept here. */
.bz-msg-tools {
  display: flex;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-4);
  padding-top: var(--bz-space-3);
  border-top: 1px solid var(--bz-border);
}
.bz-msg-tool {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 6px var(--bz-space-3);
  background: transparent;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-msg-tool:hover:not(:disabled) {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border-strong);
}
.bz-msg-tool:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.bz-msg-tool .material-symbols-outlined {
  font-size: 16px !important;
  overflow: visible;
}
.bz-msg-tool--done {
  color: var(--bz-emerald-500);
  border-color: var(--bz-emerald-soft);
}
.bz-msg-tool--minted {
  color: var(--bz-emerald-500);
  border-color: var(--bz-emerald-soft);
  background: var(--bz-emerald-soft);
}
.bz-msg-tool--destructive {
  margin-left: auto;
}
.bz-msg-tool--destructive:hover:not(:disabled) {
  color: var(--bz-danger);
  border-color: var(--bz-danger-soft);
  background: var(--bz-danger-soft);
}

/* Tools-slot button inside <ChatInput> — reasoning toggle.
   Same shape as the chat-tool buttons above ChatMessage's body,
   sized for the smaller composer toolbar. */
.bz-chat-tool {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  height: 32px;
  padding: 0 var(--bz-space-3);
  background: transparent;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast),
    color var(--bz-dur-fast),
    border-color var(--bz-dur-fast);
}
.bz-chat-tool:hover:not(:disabled) {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border-strong);
}
.bz-chat-tool:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.bz-chat-tool .material-symbols-outlined {
  font-size: 16px !important;
  overflow: visible;
}
.bz-chat-tool--on {
  color: var(--bz-purple-300);
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
}
.bz-chat-tool--on:hover:not(:disabled) {
  color: var(--bz-purple-100);
}

/* ── Suggestion chips (mid-conversation prompts) ── */
.bz-suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  padding: var(--bz-space-2) 0 var(--bz-space-4) var(--bz-space-7);
}
.bz-suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 30px;
  padding: 6px var(--bz-space-3);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--bz-dur-fast),
    border-color var(--bz-dur-fast),
    color var(--bz-dur-fast);
}
.bz-suggestion-chip .material-symbols-outlined {
  font-size: 15px !important;
  overflow: visible;
}
.bz-suggestion-chip:hover {
  background: var(--bz-raised);
  border-color: var(--bz-border-brand);
  color: var(--bz-fg);
}

.bz-chat-delete-toast {
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
.bz-chat-delete-toast .material-symbols-outlined {
  font-size: 18px !important;
  color: var(--bz-danger);
}
.bz-chat-delete-toast__body {
  min-width: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
}
.bz-chat-delete-toast__ghost,
.bz-chat-delete-toast__danger {
  height: 30px;
  border-radius: var(--bz-r-sm);
  padding: 0 var(--bz-space-3);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta);
  cursor: pointer;
}
.bz-chat-delete-toast__ghost {
  background: transparent;
  border: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
}
.bz-chat-delete-toast__ghost:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}
.bz-chat-delete-toast__danger {
  background: var(--bz-danger-soft);
  border: 1px solid var(--bz-danger-soft);
  color: var(--bz-danger);
  font-weight: 700;
}
.bz-chat-delete-toast__danger:hover {
  filter: brightness(1.08);
}
.bz-chat-toast-enter-active,
.bz-chat-toast-leave-active {
  transition:
    opacity var(--bz-dur-base) var(--bz-ease-out),
    transform var(--bz-dur-base) var(--bz-ease-out);
}
.bz-chat-toast-enter-from,
.bz-chat-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>

<style scoped>
.chat-workflow-action{display:inline-flex;align-items:center;gap:5px;border:1px solid transparent;border-radius:var(--bz-r-sm);background:transparent;color:var(--bz-fg-mid);padding:3px 7px;font-size:12px;cursor:pointer}.chat-workflow-action:hover{background:var(--bz-raised);color:var(--bz-fg)}.chat-workflow-action .material-symbols-outlined{font-size:16px}
</style>
