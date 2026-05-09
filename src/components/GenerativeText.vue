<template>
  <div class="background"></div>

  <div class="bz-tab-shell">
    <div
      class="models__deployment-install"
      :class="{ 'models__deployment-install--chat': isModel && (!currentModel.isMultimodal || isMmprojAvailable) }"
    >
      <!-- ─────────────────────────────────────────────────────────────
           SETUP STATE — model not yet downloaded (or vision file
           missing for a multimodal model). Editorial card with the
           model identity, hardware footprint, and a single primary
           CTA. Hidden once the model is ready; the chat workspace
           (ChatLayout below) takes over the surface. -->
      <div
        v-if="!isModel || (currentModel.isMultimodal && !isMmprojAvailable)"
        class="bz-text-setup"
      >
        <div class="bz-text-setup__head">
          <div>
            <span class="bz-eyebrow">Model</span>
            <h1 class="bz-display fira-sans-condensed-black-italic">
              {{ currentModel.modelname }}
            </h1>
            <p class="bz-body bz-text-setup__desc" v-if="currentModel.modeldesc">
              {{ currentModel.modeldesc }}
            </p>
          </div>
          <div class="bz-text-setup__head-actions">
            <button
              type="button"
              class="bz-btn"
              @click="openModelPicker"
              title="Browse model catalog"
            >
              <span class="material-symbols-outlined">folder_open</span>
              Browse models
            </button>
          </div>
        </div>

        <div class="bz-text-setup__specs">
          <span class="bz-eyebrow" style="color: var(--bz-fg-low);">Hardware footprint</span>
          <div class="bz-text-setup__chips">
            <span class="bz-chip bz-mono">
              <span class="material-symbols-outlined">memory</span>
              {{ computeMemoryRequirements(currentModel).vramGB }} GB VRAM
            </span>
            <span class="bz-chip bz-mono">
              <span class="material-symbols-outlined">developer_board</span>
              {{ computeMemoryRequirements(currentModel).ramGB }} GB RAM
            </span>
            <span class="bz-chip bz-mono">
              <span class="material-symbols-outlined">data_object</span>
              {{ computeMemoryRequirements(currentModel).breakdown.contextSize }} ctx
            </span>
            <span class="bz-chip bz-mono">
              <span class="material-symbols-outlined">database</span>
              {{ currentModel.filesize }}
            </span>
          </div>
        </div>

        <div class="bz-text-setup__cta">
          <!-- Download (model not yet local) -->
          <button
            v-if="!isModel"
            type="button"
            class="bz-btn bz-btn--primary bz-btn--lg"
            :class="{ 'bz-btn--running': isLoading }"
            :disabled="isLoading"
            @click="downloadModel(currentModel.url, currentModel.filename)"
          >
            <span class="material-symbols-outlined">deployed_code_update</span>
            <span v-if="isLoading && downloadProgress">
              Downloading · {{ downloadProgress }}%
            </span>
            <span v-else>Download · {{ currentModel.filesize }}</span>
          </button>
          <!-- Delete (model is local; we're in setup because vision file is missing) -->
          <button
            v-if="isModel"
            type="button"
            class="bz-btn bz-btn--destructive"
            :disabled="isLoading"
            @click="deleteModel(currentModel.filename)"
          >
            <span class="material-symbols-outlined">delete</span>
            Delete · {{ currentModel.filesize }}
          </button>
          <!-- Vision file (multimodal models only, when missing) -->
          <button
            v-if="isModel && currentModel.isMultimodal && !isMmprojAvailable"
            type="button"
            class="bz-btn bz-btn--primary bz-btn--lg"
            :class="{ 'bz-btn--running': isLoading }"
            :disabled="isLoading"
            @click="downloadMmproj(currentModel)"
          >
            <span class="material-symbols-outlined">visibility</span>
            <span v-if="isLoading && mmprojDownloadProgress">
              Downloading vision · {{ mmprojDownloadProgress }}%
            </span>
            <span v-else>
              Download vision · {{ currentModel.mmprojFilesize }}
            </span>
          </button>
        </div>
      </div>
      <!-- ─────────────────────────────────────────────────────────────
           CHAT WORKSPACE — three-column editorial shell
           Shown once the loaded model is ready (downloaded + vision
           file present if multimodal). Replaces both the legacy
           "browse history" panel and the openChat overlay. The same
           composer is always docked at the bottom — the Mistral /
           Claude / Stripe pattern. The left rail groups past
           inferences by date so the user can pick up any thread; the
           right inspector mounts globally via GenerationInspector. -->
      <ChatLayout
        v-if="isModel && (!currentModel.isMultimodal || isMmprojAvailable)"
        class="bz-text-chat"
        :messages="[]"
        :autoscroll="false"
      >
        <!-- LEFT RAIL — date-grouped history -->
        <template #rail>
          <ChatHistoryRail
            :inferences="railEntries"
            :active-id="activeRailId"
            @select="selectFromRail"
          />
        </template>

        <!-- HEADER — model name + toolset (clear / import / export) -->
        <template #header>
          <div class="bz-text-chat__head">
            <div class="bz-text-chat__head-left">
              <span class="bz-eyebrow">Chat</span>
              <h1 class="bz-h1 fira-sans-condensed-black-italic">
                {{ currentModel.modelname }}
              </h1>
            </div>
            <div class="bz-text-chat__head-actions">
              <button type="button" class="bz-iconbtn" title="Browse models" aria-label="Browse models" @click="openModelPicker">
                <span class="material-symbols-outlined">folder_open</span>
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
            <div v-if="pipelineError" class="bz-notice bz-notice--danger mt-3">
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

          <EmptyChat
            v-if="!inferences || inferences.length === 0"
            :model-name="currentModel.modelname"
            :headline="`What are we making with ${currentModel.modelname}?`"
            subhead="Streaming, vision, code, roleplay — same input. Local first, remote if you want to."
            @pick="pickPrompt"
            @browse-models="openModelPicker"
          />

          <div v-else-if="activeInference" class="bz-text-chat__messages">
            <!-- User -->
            <ChatMessage
              :data-inference-id="activeInference.id"
              role="user"
              :content="activeInference.question"
              :ts="activeInference.timestamp"
            />

            <!-- Assistant -->
            <ChatMessage
              role="assistant"
              :model="activeInference.model"
              :ts="activeInference.timestamp"
              :streaming="isLoading && activeInference.answer.id === streamingInferenceId"
              @inspect="onInspectInference(activeInference)"
            >
              <div class="answer markdown-body" @click="handleAnswerClick">
                <div
                  v-if="activeInference.tokensPerSecond || (activeInference.networkMode && activeInference.networkMode !== 'local')"
                  class="bz-msg-extra-meta"
                >
                  <span v-if="activeInference.tokensPerSecond" class="bz-mono bz-meta">
                    {{ activeInference.tokensPerSecond }} tok/s
                  </span>
                  <span
                    v-if="activeInference.networkMode && activeInference.networkMode !== 'local'"
                    class="network-mode-tag"
                    :class="'nm-' + activeInference.networkMode"
                  >
                    <span class="material-symbols-outlined" style="font-size: 12px">
                      {{ activeInference.networkMode === 'private' ? 'lock' : 'cloud' }}
                    </span>
                    {{ activeInference.networkMode === 'private' ? 'Private' : 'Remote' }}
                  </span>
                </div>

                <template
                  v-for="(seg, segIdx) in splitThinkSegments(activeInference.answer.text)"
                  :key="`${activeInference.answer.id}-seg-${segIdx}`"
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
                      <vue-markdown :source="seg.text" />
                    </div>
                  </details>
                  <vue-markdown
                    v-else-if="seg.type === 'content'"
                    :source="seg.text"
                  />
                </template>

                <GenerativeActions
                  :actions="actionsFor(activeInference)"
                  @action="(id) => handleAction(id, activeInference)"
                />
              </div>
            </ChatMessage>
          </div>
        </template>

        <!-- INPUT — composer docks at the bottom of the main column -->
        <template #input>
          <ChatInput
            ref="chatInputRef"
            v-model="form.prompt"
            :placeholder="
              isMultimodalModel
                ? 'Ask about an image or just chat…'
                : `Message ${currentModel.modelname}…`
            "
            :streaming="isLoading"
            :disabled="!hasAccess"
            :attachments="chatAttachments"
            :enable-attachments="isMultimodalModel && isMmprojAvailable"
            :hint="reasoningEnabled && isThinkingModel ? 'Reasoning ON' : ''"
            @submit="hasAccess && sendMessage(form.prompt)"
            @attach="triggerImageAttach"
            @remove-attachment="removeAttachedImage"
          >
            <template #tools>
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
import ChatLayout from "./chat/ChatLayout.vue";
import ChatMessage from "./chat/ChatMessage.vue";
import ChatInput from "./chat/ChatInput.vue";
import ChatHistoryRail from "./chat/ChatHistoryRail.vue";
import EmptyChat from "./chat/EmptyChat.vue";
import GenerativeActions from "./generative/GenerativeActions.vue";
import BzCloseButton from "./BzCloseButton.vue";
import { requestOpenNetworkModal } from "../services/level.service.js";
import { useInferenceRouter } from "../composables/useInferenceRouter.js";
import { modelPicker } from "../services/modelPicker.service.js";
import { inspector as generationInspector } from "../services/generationInspector.service.js";

export default {
  name: "GenerativeText",
  components: {
    BzCloseButton,
    VueMarkdown,
    GenerativeImage,
    AccessRequirements,
    MintModal,
    ChatLayout,
    ChatMessage,
    ChatInput,
    ChatHistoryRail,
    EmptyChat,
    GenerativeActions,
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

    // Browse-models button now opens the global LLM picker modal
    // (LlmModelPickerModal at App.vue level) instead of toggling a
    // local panel. The legacy panel was 192 lines of duplicated UI;
    // retired in v1.6 of the design system.
    const openModelPicker = () => {
      modelPicker.show();
    };

    // Unified action descriptors fed into <GenerativeActions> for
    // chat messages. Replaces the previous bz-msg-tool inline
    // buttons with the same shared component the image / video /
    // audio tabs use — one action vocabulary across the whole app.
    const actionsFor = (inference) => {
      const minted = !!inference?.nft;
      const copied = !!hasCopy[inference._originalIndex];
      return [
        { id: "copy",
          icon: copied ? "check" : "content_copy",
          label: copied ? "Copied" : "Copy",
          variant: copied ? "success" : "default",
          title: "Copy answer" },
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
        case "copy":
          copy(stripThinkBlocks(inference.answer.text));
          hasCopy[inference._originalIndex] = true;
          break;
        case "mint":   openMint(inference); break;
        case "delete": removeInference(inference._originalIndex); break;
      }
    };

    // Per-message inspector — wired through ChatMessage's @inspect
    // event. Pulls the chat-specific metadata onto the global rail
    // shape (kind/text, model, network origin, mint state if minted).
    const onInspectInference = (inference) => {
      if (!inference) return;
      generationInspector.show({
        kind: "text",
        prompt: inference.question || "",
        model: inference.model || (currentModel.value?.modelname || ""),
        modelId: currentModel.value?.filename,
        ts: inference.timestamp,
        networkMode: inference.networkMode || "local",
        peerId: inference.peerId,
        mintState: inference.nft || null,
        extra: {
          ...(inference.tokensPerSecond ? { tokensPerSecond: inference.tokensPerSecond } : {}),
          ...(inference.answer?.text
            ? { responseChars: String(inference.answer.text.length) }
            : {}),
        },
      });
    };

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
      activeRailId.value = null; // snap to the new inference

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

    // Bottom bar's "browse models" event now opens the global picker.
    // The chat tab no longer hosts its own panel, so this listener is
    // a thin shim — kept so older event dispatches still land correctly.
    const handleShowBrowseModels = () => {
      modelPicker.show();
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

    // ─── Chat-layout integration (rail + empty state) ──────────────
    // Map inferences → rail-friendly entries. Prompt = the question
    // text; ts = inference timestamp. Most-recent first; ChatHistoryRail
    // re-sorts and groups by date itself.
    const railEntries = computed(() =>
      (inferences.value || []).map((inf) => ({
        id: inf.id,
        prompt: inf.question || "(empty prompt)",
        model: inf.model,
        ts: inf.timestamp,
      })),
    );
    const activeRailId = ref(null);

    const selectFromRail = (entry) => {
      activeRailId.value = entry.id;
    };

    // The inference currently shown in the main stream. When the user
    // picks an item from the history rail, only that conversation is
    // rendered. Otherwise the most recent inference is shown.
    const activeInference = computed(() => {
      if (!inferences.value?.length) return null;
      if (activeRailId.value) {
        const found = inferences.value.find((inf) => inf.id === activeRailId.value);
        if (found) return found;
      }
      // Default to most recent (reversedInferences is newest-first)
      return reversedInferences.value[0] || null;
    });

    const pickPrompt = (p) => {
      // EmptyChat passes the prompt object — value or title becomes the
      // composer's seed text, leaving the cursor at the end so the user
      // continues typing from where the suggestion stops.
      const seed = p?.value ?? p?.title ?? "";
      form.prompt = seed;
      nextTick(() => chatInputRef.value?.focus?.());
    };

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
      openModelPicker,
      onInspectInference,
      actionsFor,
      handleAction,
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
      activeInference,
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
      // ChatLayout integration
      railEntries,
      activeRailId,
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
   the scroll behaviour. */
.models__deployment-install--chat {
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
  margin-bottom: var(--bz-space-5);
}

.bz-text-chat__messages {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
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
  background: var(--bz-scrim-strong);
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
  border-bottom-color: var(--bz-fg);
  color: var(--bz-fg);
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
  color: var(--bz-fg);
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
  padding: var(--bz-space-5) var(--bz-space-6);
  flex: 1;
  min-height: 0;
  width: 100%;
  background: var(--bz-scrim-strong);
}

.models__deployment-install--cta {
  position: relative;
  top: -30px;
  right: 2.5em;
}

.models__activity--payouts {
  padding: 4em;
  border: 1px solid var(--bz-border);
  backdrop-filter: blur(32px) !important;
  border-radius: 4px !important;
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
  backdrop-filter: blur(32px);
}

.answer__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  font-family: "Fira Sans", sans-serif;
  color: var(--bz-fg-low);
}

.answer__model {
  font-weight: 600;
  color: var(--bz-fg-low);
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

.filesize {
  min-width: 40%;
  position: absolute;
  top: -10px;
  right: -10px;
  padding: 5px;
  font-size: 20px;
  color: rgba(255, 255, 255, 1);
  background: var(--bz-border-strong);
  border: 1px solid var(--bz-border-strong);
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
  background: var(--bz-scrim-deep);
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
  background: var(--bz-border);
  border: 2px solid var(--bz-border-strong);
  color: var(--bz-fg);
  cursor: pointer;
  transition: all 0.2s ease;
}

.attach-image-btn:hover {
  background: var(--bz-border-strong);
  border-color: var(--bz-fg-low);
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
  background: var(--bz-border);
  border: 2px solid var(--bz-border-strong);
  color: var(--bz-fg-low);
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 4px;
}

.reasoning-toggle-btn:hover {
  background: var(--bz-border-strong);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg);
}

.reasoning-toggle-btn.active {
  background: rgba(32, 156, 238, 0.4);
  border-color: #209cee;
  color: var(--bz-fg);
  box-shadow: 0 0 12px rgba(32, 156, 238, 0.4);
}

.reasoning-toggle-btn.active:hover {
  background: rgba(32, 156, 238, 0.55);
}

.attached-image-preview {
  position: relative;
  margin-bottom: 12px;
  padding: 8px;
  background: var(--bz-scrim);
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
  color: var(--bz-fg);
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
  color: var(--bz-fg-mid);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.input {
  margin-bottom: 2em;
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
  color: #10b981;
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

/* Code blocks */
.markdown-body :deep(pre) {
  position: relative;
  background: var(--bz-scrim-strong);
  border: 1px solid var(--bz-border-strong);
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
  background: var(--bz-purple-soft);
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
  background: var(--bz-border-strong);
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  color: var(--bz-fg-mid);
  cursor: pointer;
  transition: all 0.15s ease;
  z-index: 2;
}

.markdown-body :deep(.code-copy-btn:hover) {
  background: var(--bz-fg-faint);
  color: var(--bz-fg);
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
  background: rgba(32, 156, 238, 0.12);
  border-color: #209cee;
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
.bz-msg-tool .material-symbols-outlined { font-size: 16px !important; }
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
.bz-chat-tool .material-symbols-outlined { font-size: 16px !important; }
.bz-chat-tool--on {
  color: var(--bz-purple-300);
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
}
.bz-chat-tool--on:hover:not(:disabled) {
  color: var(--bz-purple-100);
}
</style>
