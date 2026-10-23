<template>
  <div class="skill-runner" :class="{ 'skill-runner--production': skill.execution?.managesGeneration }">
    <!-- Model Requirements Section -->
    <div v-if="modelRequirements.length > 0" class="model-requirements skill-panel">
      <h3 v-if="!skill.execution?.managesGeneration || missingModels.length" class="skill-panel__title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined" aria-hidden="true">deployed_code</span>
        Required Models
      </h3>

      <DownloadRequirement
        v-for="model in missingModels"
        :key="model.key"
        :items="[model]"
        :active="downloadingModel === model.key"
        :progress="downloadProgress"
        :disabled="!!downloadingModel"
        :cancellable="skill.execution?.managesGeneration"
        @cancel="cancelDownload"
        @download="downloadModel(model)"
      />

      <!-- Available Models -->
      <p v-if="skill.execution?.managesGeneration && !missingModels.length" class="production-download-ready"><span class="material-symbols-outlined">check_circle</span>Required downloads ready</p>
      <div v-if="!skill.execution?.managesGeneration" class="available-models">
        <div class="skill-chip-list">
          <span
            v-for="model in modelRequirements"
            :key="model.key"
            class="skill-chip"
            :class="isModelAvailable(model) ? 'skill-chip--success' : 'skill-chip--danger'"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              {{ isModelAvailable(model) ? 'check_circle' : 'error' }}
            </span>
            {{ model.name }}
            <span class="bz-mono">
              ({{ model.vram }})
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- LLM Auto-Fill Section -->
    <div v-if="hasInputs && !isChatBased && !skill.execution?.managesGeneration" class="autofill-section skill-panel">
      <div class="skill-panel__head">
        <div>
          <h3 class="skill-panel__title fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
            AI Auto-Fill
          </h3>
          <p class="skill-help">
            Describe what you want and let AI fill in the details
          </p>
        </div>
          <button
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            :disabled="!autoFillPrompt || isAutoFilling || !canAutoFill"
            @click="autoFillInputs"
            :class="{ 'bz-btn--running': isAutoFilling }"
          >
            <span v-if="isAutoFilling" class="material-symbols-outlined rotating" aria-hidden="true">
              progress_activity
            </span>
            <span v-else class="material-symbols-outlined" aria-hidden="true">magic_button</span>
            {{ isAutoFilling ? 'Generating...' : 'Generate' }}
          </button>
      </div>
          <textarea
            v-model="autoFillPrompt"
            class="skill-input skill-textarea"
            placeholder="Describe what you want to create (e.g., 'A cozy coffee shop scene with warm lighting and jazz music')..."
            rows="2"
            :disabled="isAutoFilling"
          ></textarea>
    </div>

    <!-- Skill Inputs Form -->
    <div v-if="hasInputs && !isChatBased" class="skill-inputs skill-panel">
      <h3 class="skill-panel__title fira-sans-condensed-black-italic">
        <span class="material-symbols-outlined" aria-hidden="true">tune</span>
        {{ skill.execution?.managesGeneration ? 'Production Settings' : 'Skill Settings' }}
      </h3>

      <div class="skill-form-grid">
        <div
          v-for="(field, key) in skill.inputs"
          :key="key"
          v-show="!(localInputs.soundtrack && ['duration', 'instrumental'].includes(key))"
          class="skill-field"
          :class="{ 'skill-field--full': isWideField(field) }"
        >
          <div class="skill-field__inner">
            <label class="skill-label fira-sans-condensed-black-italic">
              {{ field.label || key }}
            </label>

            <!-- String Input -->
            <div v-if="field.type === 'string'" class="control">
              <input
                v-if="!isLongText(field)"
                class="skill-input"
                type="text"
                v-model="localInputs[key]"
                :placeholder="field.description || `Enter ${field.label || key}`"
              />
              <textarea
                v-else
                class="skill-input skill-textarea"
                v-model="localInputs[key]"
                :placeholder="field.description || `Enter ${field.label || key}`"
                rows="3"
              ></textarea>
            </div>

            <!-- Number Input -->
            <div v-else-if="field.type === 'number'" class="control">
              <input
                class="skill-input"
                type="number"
                v-model.number="localInputs[key]"
                :min="field.min"
                :max="field.max"
                :placeholder="field.description"
              />
            </div>

            <!-- Select Input -->
            <div v-else-if="field.type === 'select'" class="control">
                <select class="skill-input" v-model="localInputs[key]">
                  <option v-for="opt in field.options" :key="opt" :value="opt">
                    {{ formatOption(opt) }}
                  </option>
                </select>
            </div>

            <!-- Boolean Input -->
            <div v-else-if="field.type === 'boolean'" class="control">
              <label class="skill-checkbox">
                <input type="checkbox" v-model="localInputs[key]" />
                {{ field.description || 'Enable' }}
              </label>
            </div>

            <!-- Image Input -->
            <div v-else-if="field.type === 'image'" class="control">
              <div class="file has-name is-fullwidth">
                <label class="file-label">
                  <input
                    class="file-input"
                    type="file"
                    accept="image/*"
                    @change="handleImageUpload($event, key)"
                  />
                  <span class="file-cta">
                    <span class="file-icon">
                      <span class="material-symbols-outlined">upload</span>
                    </span>
                    <span class="file-label">Choose image…</span>
                  </span>
                  <span class="file-name" v-if="localInputs[key]">
                    Image loaded
                  </span>
                </label>
              </div>
              <div v-if="localInputs[key]" class="image-preview mt-2">
                <img :src="getImagePreview(localInputs[key])" alt="Preview" style="max-height: 100px;" />
              </div>
            </div>

            <div v-if="field.type === 'audio' || field.type === 'images'" class="production-file-input">
              <label class="production-file-picker bz-btn bz-btn--ghost"><span class="material-symbols-outlined">upload</span>{{ field.type === 'audio' ? 'Choose Song' : 'Add Manga Panels' }}<input type="file" :accept="field.type === 'audio' ? 'audio/*' : 'image/*'" :multiple="field.type === 'images'" @change="handleMediaUpload($event, key, field.type)" /></label>
              <div v-if="field.type === 'images'" class="production-panels">
                <div v-for="(panel, index) in localInputs[key]" :key="index"><img :src="getImagePreview(panel)" :alt="'Panel ' + (index + 1)" /><span>{{ index + 1 }}</span><button type="button" :disabled="index === 0" aria-label="Move panel earlier" @click="movePanel(key, index)">←</button><button type="button" aria-label="Remove panel" @click="localInputs[key].splice(index, 1)">×</button></div>
              </div>
              <div v-else-if="localInputs[key]" class="production-attached">Song attached <button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="localInputs[key] = ''">Remove</button></div>
            </div>
            <a v-if="key === 'h3Accepted'" href="https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">Review MiniMax H3 License</a>
            <p v-if="field.description && field.type !== 'boolean'" class="skill-help">
              {{ field.description }}
            </p>
          </div>
        </div>
      </div>

      <p v-if="inputError" role="alert" class="production-input-error">{{ inputError }}</p>
      <!-- Run Button -->
      <div class="skill-run-actions">
        <button
          class="bz-btn bz-btn--agent-cta bz-btn--lg fira-sans-condensed-black-italic"
          :disabled="!canRun || isExecuting"
          @click="executeSkill"
          :class="{ 'bz-btn--running': isExecuting }"
        >
          <span v-if="isExecuting" class="material-symbols-outlined rotating" aria-hidden="true">
            progress_activity
          </span>
          <span v-else class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
          {{ isExecuting ? executionStatus : actionLabel }}

        </button>
      </div>
    </div>

    <!-- Chat-Based Skill Setup (Roleplay) -->
    <div v-if="isChatBased" class="chat-setup">
      <slot name="chat-interface" :skill="skill" :inputs="localInputs">
        <!-- Default chat setup UI - override with slot -->
        <div class="bz-notice bz-notice--info">
          <span class="bz-notice__icon"><span class="material-symbols-outlined" aria-hidden="true">chat</span></span>
          <div class="bz-notice__body"><p class="bz-notice__text">This skill uses a chat interface. Please configure the chat settings to begin.</p></div>
        </div>
      </slot>
    </div>

    <!-- Execution Results -->
    <div v-if="executionResult && !isChatBased" class="execution-results">
      <slot name="results" :result="executionResult">
        <!-- Default results display -->
        <div class="bz-notice bz-notice--stacked" :class="executionResult.success === false ? 'bz-notice--danger' : 'bz-notice--info'">
          <h4 class="skill-panel__title fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
            {{ executionResult.success === false ? 'Needs attention' : executionResult.queued ? 'Task queued' : 'Workflow result' }}
          </h4>
          <pre class="skill-result-code">{{ JSON.stringify(executionResult, null, 2) }}</pre>
        </div>
      </slot>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, reactive, onMounted, onUnmounted } from 'vue';
import DownloadRequirement from '../DownloadRequirement.vue';
import { cancelLocalDownloads } from '../../services/downloadCancellation.js';
import { remoteInference, refreshRemoteInference, remoteRequirementSatisfied } from '../../stores/remoteInference.js';
import { getSkillModelRequirements, MODEL_REQUIREMENTS } from '../../skills/flagship.js';

export default {
  name: 'SkillRunner',
  components: { DownloadRequirement },
  props: {
    initialInputs: { type: Object, default: () => ({}) },
    actionLabel: { type: String, default: 'Run workflow' },
    skill: {
      type: Object,
      required: true,
    },
    modelAvailability: {
      type: Object,
      default: () => ({}),
    },
  },
  emits: ['execute', 'download-model', 'update:inputs'],
  setup(props, { emit }) {
    const localInputs = reactive({});
    const inputError = ref('');
    const checkedModels = reactive({});
    let modelTimer, checking = false, disposed = false, downloadEpoch = 0;
    let activePipelineIds = [], activeFilename = null;
    const autoFillPrompt = ref('');
    const isAutoFilling = ref(false);
    const isExecuting = ref(false);
    const executionStatus = ref('');
    const executionResult = ref(null);
    const downloadingModel = ref(null);
    const downloadProgress = ref(0);

    // Initialize inputs from skill definition
    const initializeInputs = () => {
      if (props.skill?.inputs) {
        Object.entries(props.skill.inputs).forEach(([key, field]) => {
          localInputs[key] = props.initialInputs[key] ?? (key === 'h3Accepted' ? localStorage.getItem('bonzai:minimax-h3-terms') === 'accepted' : structuredClone(field.default));
        });
      }
    };

    // Watch for skill changes
    watch(() => props.skill, () => {
      initializeInputs();
      executionResult.value = null;
    }, { immediate: true });

    // Computed properties
    refreshRemoteInference().catch(() => {});
    const modelRequirements = computed(() => {
      if (!props.skill?.id) return [];
      return getSkillModelRequirements(props.skill.id).filter(model => !remoteRequirementSatisfied(model)).filter(model => !(localInputs.soundtrack && (model.key === 'music_fast' || model.parentKey === 'music_fast')));
    });

    const missingModels = computed(() => {
      return modelRequirements.value.filter(model => !isModelAvailable(model));
    });

    const hasInputs = computed(() => {
      return props.skill?.inputs && Object.keys(props.skill.inputs).length > 0;
    });

    const isChatBased = computed(() => {
      return props.skill?.chatBased === true || props.skill?.execution?.type === 'chat';
    });

    const canRun = computed(() => {
      return missingModels.value.length === 0;
    });

    const canAutoFill = computed(() => {
      if (remoteInference.active) return true;
      // Check if LLM model is available for auto-fill
      const llmModel = modelRequirements.value.find(m => m.type === 'llm');
      return llmModel ? isModelAvailable(llmModel) : false;
    });

    // Methods
    const isModelAvailable = (model) => {
      if (props.skill.execution?.managesGeneration) return checkedModels[model.key] === true;
      // Check via props or assume available if not specified
      if (props.modelAvailability[model.key] !== undefined) {
        return props.modelAvailability[model.key];
      }
      // For LLM models, check if file exists
      if (model.type === 'llm') {
        return props.modelAvailability[model.filename] ?? true;
      }
      return true; // Assume available by default
    };

    const getModelIcon = (type) => {
      const icons = {
        llm: 'psychology',
        diffusion: 'image',
        audio: 'headphones',
        video: 'movie',
        '3d': '3d_rotation',
      };
      return icons[type] || 'deployed_code';
    };

    const isWideField = (field) => {
      return (field.type === 'string' && isLongText(field)) || ['image', 'audio', 'images'].includes(field.type);
    };

    const isLongText = (field) => {
      return field.label === 'Creative Brief' || field.description?.toLowerCase().includes('describe') ||
             field.label?.toLowerCase().includes('description') ||
             field.default?.length > 50;
    };

    const formatOption = (opt) => {
      const voices = { af_heart: 'Heart · American English', af_bella: 'Bella · American English', am_adam: 'Adam · American English', am_michael: 'Michael · American English', bf_emma: 'Emma · British English', bm_george: 'George · British English' };
      if (voices[opt]) return voices[opt];
      if (typeof opt === 'string') {
        return opt.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      return opt;
    };

    const handleImageUpload = async (event, key) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        localInputs[key] = base64;
      };
      reader.readAsDataURL(file);
    };

    const getImagePreview = (base64) => {
      if (base64.startsWith('data:')) return base64;
      return `data:image/png;base64,${base64}`;
    };

    async function handleMediaUpload(event, key, type) {
      inputError.value = '';
      const files = [...(event.target.files || [])];
      try {
        if (type === 'images' && files.length + (localInputs[key]?.length || 0) > 24) throw new Error('Choose up to 24 panels.');
        for (const file of files) {
          if (file.size > (type === 'audio' ? 100 : 20) * 1024 ** 2) throw new Error('This file is too large. Use an image under 20 MB or audio under 100 MB.');
          const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
          if (type === 'images') localInputs[key] = [...(localInputs[key] || []), data]; else localInputs[key] = data;
        }
      } catch (error) { inputError.value = error.message || 'Could not open this media.'; }
      event.target.value = '';
    }
    function movePanel(key, index) { [localInputs[key][index - 1], localInputs[key][index]] = [localInputs[key][index], localInputs[key][index - 1]]; }
    const base = () => window.electronAPI?.env?.API_BASE || 'http://127.0.0.1:65000';
    async function checkModels() {
      if (!props.skill.execution?.managesGeneration || checking || disposed) return;
      checking = true;
      for (const model of modelRequirements.value) {
        try {
          if (model.type === 'llm') checkedModels[model.key] = await window.electronAPI?.checkModel?.(model.filename) === true;
          else {
            const response = await fetch(`${base()}/pipelines/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipeline: model.pipeline || model.key }), signal: AbortSignal.timeout(5000) });
            checkedModels[model.key] = response.ok && (await response.json()).ok === true;
          }
        } catch { checkedModels[model.key] = false; }
      }
      checking = false;
    }
    const downloadModel = async (model) => {
      if (props.skill.execution?.managesGeneration) {
        if (downloadingModel.value) return;
        const epoch = ++downloadEpoch;
        downloadingModel.value = model.key; inputError.value = ''; downloadProgress.value = 0;
        let unsubscribe;
        try {
          if (model.type === 'llm') {
            activeFilename = model.filename;
            unsubscribe = window.electronAPI?.onDownloadProgress?.((_event, data) => {
              if (data.filename === model.filename) downloadProgress.value = Math.round((data.percent || 0) * 100);
            });
            if (!await window.electronAPI?.downloadModel?.(model.url, model.filename)) throw new Error('The download did not finish. Retry when ready.');
          } else {
            const response = await fetch(`${base()}/pipelines/prefetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipeline: model.pipeline || model.key }), signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error('The download could not start. Check the local server.');
            const data = await response.json();
            activePipelineIds = data.pipelines_started?.length ? data.pipelines_started : data.pipeline_id ? [data.pipeline_id] : [];
            if (response.status === 202 && !activePipelineIds.length) throw new Error('Download tracking is unavailable. Check Downloads before retrying.');
            while (activePipelineIds.length && !disposed && epoch === downloadEpoch) {
              const states = await Promise.all(activePipelineIds.map(async id => {
                const res = await fetch(`${base()}/downloads/status/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
                if (!res.ok) throw new Error('Could not check download progress.');
                return res.json();
              }));
              if (states.some(item => ['failed', 'cancelled', 'canceled'].includes(item.status))) throw new Error('The download stopped. Check Downloads and retry.');
              downloadProgress.value = Math.round(states.reduce((sum, item) => sum + (item.total_progress || item.progress || 0), 0) / states.length);
              if (states.every(item => item.status === 'completed')) break;
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
          if (epoch === downloadEpoch && !disposed) await checkModels();
        } catch (error) { if (epoch === downloadEpoch) inputError.value = error.message; }
        finally { unsubscribe?.(); if (epoch === downloadEpoch) { downloadingModel.value = null; activePipelineIds = []; activeFilename = null; } }
        return;
      }
      downloadingModel.value = model.key;
      downloadProgress.value = 0;
      emit('download-model', model, (progress) => {
        downloadProgress.value = progress;
      });
    };

    async function cancelDownload() {
      try {
        await cancelLocalDownloads({ filenames: activeFilename ? [activeFilename] : [], pipelineIds: activePipelineIds, apiBase: base() });
        downloadEpoch++; downloadingModel.value = null; activeFilename = null; activePipelineIds = [];
      } catch { inputError.value = 'Could not stop this download. Retry cancellation.'; }
    }

    const autoFillInputs = async () => {
      if (!autoFillPrompt.value || isAutoFilling.value) return;

      isAutoFilling.value = true;

      try {
        // Build prompt for LLM to fill inputs
        const inputSchema = Object.entries(props.skill.inputs)
          .filter(([key]) => !['image', 'object'].includes(props.skill.inputs[key].type))
          .map(([key, field]) => {
            let schema = `- "${key}": ${field.label || key}`;
            if (field.type === 'select') {
              schema += ` (options: ${field.options.join(', ')})`;
            } else if (field.type === 'number') {
              schema += ` (number${field.min !== undefined ? `, min: ${field.min}` : ''}${field.max !== undefined ? `, max: ${field.max}` : ''})`;
            }
            if (field.description) {
              schema += ` - ${field.description}`;
            }
            return schema;
          }).join('\n');

        const prompt = `Based on this user request: "${autoFillPrompt.value}"

Fill in the following fields for the "${props.skill.name}" skill:
${inputSchema}

Output ONLY valid JSON with the field names as keys. Example:
{"fieldName": "value", "anotherField": "value"}

Return ONLY the JSON, no explanation.`;

        // Use electronAPI to generate text
        if (window.electronAPI?.chat) {
          const response = await window.electronAPI.chat(prompt);

          // Extract JSON from response
          let json;
          try {
            // Try to extract JSON from code blocks or raw response
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                             response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              json = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            } else {
              json = JSON.parse(response);
            }

            // Apply generated values to inputs
            Object.entries(json).forEach(([key, value]) => {
              if (localInputs.hasOwnProperty(key)) {
                localInputs[key] = value;
              }
            });
          } catch (e) {
            console.warn('[SkillRunner] Failed to parse auto-fill response:', e);
          }
        }
      } catch (e) {
        console.error('[SkillRunner] Auto-fill error:', e);
      } finally {
        isAutoFilling.value = false;
      }
    };

    const executeSkill = async () => {
      isExecuting.value = true;
      executionStatus.value = 'Starting...';
      executionResult.value = null;

      try {
        emit('execute', {
          skillId: props.skill.id,
          inputs: { ...localInputs },
          updateStatus: (status) => {
            executionStatus.value = status;
          },
        });
      } catch (e) {
        console.error('[SkillRunner] Execution error:', e);
      }
    };

    const setExecutionResult = (result) => {
      executionResult.value = result;
      isExecuting.value = false;
      executionStatus.value = '';
    };

    onMounted(() => {
      initializeInputs();
      void checkModels();
      if (props.skill.execution?.managesGeneration) modelTimer = setInterval(() => void checkModels(), 10000);
    });
    onUnmounted(() => { disposed = true; clearInterval(modelTimer); });

    return {
      inputError, handleMediaUpload, movePanel, localInputs,
      autoFillPrompt,
      isAutoFilling,
      isExecuting,
      executionStatus,
      executionResult,
      downloadingModel,
      downloadProgress,
      modelRequirements,
      missingModels,
      hasInputs,
      isChatBased,
      canRun,
      canAutoFill,
      isModelAvailable,
      getModelIcon,
      isWideField,
      isLongText,
      formatOption,
      handleImageUpload,
      getImagePreview,
      downloadModel,
      cancelDownload,
      autoFillInputs,
      executeSkill,
      setExecutionResult,
    };
  },
};
</script>

<style scoped>
.skill-runner {
  width: 100%;
  color: var(--bz-fg);
}

.skill-panel {
  display: grid;
  gap: var(--bz-space-4);
  margin-bottom: var(--bz-space-5);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-card);
}

.skill-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}

.skill-panel__title {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0;
  color: var(--bz-fg);
  font-size: 1.25rem;
  line-height: 1;
}

.model-requirements .model-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.model-requirements .model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--bz-space-3);
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--bz-border);
}

.model-requirements .model-item:last-child {
  border-bottom: none;
}

.model-requirements .model-info {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 0;
  color: var(--bz-fg-mid);
}

.model-requirements .model-info p {
  margin: var(--bz-space-1) 0 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: 1.35;
}

.model-requirements .model-size {
  margin-left: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

.available-models {
  margin-top: 1rem;
}

.skill-chip-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}

.skill-chip,
.skill-price-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  min-height: 28px;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: 999px;
  background: var(--bz-panel);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.skill-chip--success {
  border-color: color-mix(in srgb, var(--bz-emerald-500) 46%, var(--bz-border));
  background: var(--bz-emerald-soft);
  color: var(--bz-emerald-300);
}

.skill-chip--danger {
  border-color: color-mix(in srgb, var(--bz-danger) 46%, var(--bz-border));
  background: var(--bz-danger-soft);
  color: var(--bz-danger);
}

.skill-price-pill {
  border-color: color-mix(in srgb, var(--bz-warning) 52%, var(--bz-border));
  background: var(--bz-warning-soft);
  color: var(--bz-warning);
}

.skill-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-4);
}

.skill-field--full {
  grid-column: 1 / -1;
}

.skill-field__inner,
.skill-run-actions {
  display: grid;
  gap: var(--bz-space-2);
}

.skill-label {
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
}

.skill-input {
  width: 100%;
  min-height: 40px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  outline: 0;
  background: var(--bz-panel);
  color: var(--bz-fg);
  font: inherit;
}

.skill-input:focus {
  border-color: var(--bz-border-brand);
}

.skill-textarea {
  min-height: 88px;
  padding-top: var(--bz-space-3);
  resize: vertical;
}

.skill-checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.skill-help {
  margin: 0;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: 1.4;
}

.image-preview {
  border-radius: 4px;
  overflow: hidden;
  display: inline-block;
}

.image-preview img {
  border-radius: 4px;
}

.execution-results {
  margin-top: var(--bz-space-5);
}

.skill-result-code {
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  background: var(--bz-scrim);
  padding: var(--bz-space-4);
  border-radius: 8px;
  color: var(--bz-fg-mid);
  font-size: 0.85rem;
}

@media (max-width: 760px) {
  .skill-panel__head {
    align-items: stretch;
    flex-direction: column;
  }

  .skill-form-grid {
    grid-template-columns: 1fr;
  }
}

.rotating {
  animation: bz-spin 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.skill-runner--production .skill-panel{background:transparent;border:0;padding:0;min-width:0}
.skill-runner--production .skill-label{font-family:var(--bz-font-body);font-style:normal;font-weight:500;font-size:14px}
.skill-runner--production .skill-help{color:var(--bz-fg-mid)}
.skill-runner--production .skill-field,.skill-runner--production .skill-field__inner,.skill-runner--production .control{min-width:0}
.skill-runner--production a{color:var(--bz-accent);font-size:13px}
.production-download-ready{display:flex;align-items:center;gap:8px;color:var(--bz-fg-mid);font-size:13px;margin:0}
.production-download-ready .material-symbols-outlined{color:var(--bz-success);font-size:18px}
.production-file-picker{position:relative;justify-content:center;width:fit-content;max-width:100%;overflow:hidden}
.production-file-picker input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;max-width:100%;min-width:0}
.production-file-picker:focus-within{outline:2px solid var(--bz-accent);outline-offset:2px}
.production-file-picker .material-symbols-outlined{font-size:18px}
</style>

<style scoped>
.production-panels{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}.production-panels>div{width:100px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.production-panels img{width:100px;height:100px;object-fit:cover;border-radius:var(--bz-r)}.production-panels button{background:var(--bz-raised);color:var(--bz-fg);border:1px solid var(--bz-border);border-radius:4px;cursor:pointer}.production-attached{display:flex;align-items:center;gap:12px;margin-top:12px}.production-input-error{color:var(--bz-danger)}
</style>
