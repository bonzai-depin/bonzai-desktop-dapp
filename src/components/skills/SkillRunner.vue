<template>
  <div class="skill-runner">
    <!-- Model Requirements Section -->
    <div v-if="modelRequirements.length > 0" class="model-requirements mb-5">
      <h3 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-4 mb-3">
        <span class="material-symbols-outlined mr-2">deployed_code</span>
        Required Models
      </h3>

      <!-- Missing Models Warning -->
      <div v-if="missingModels.length > 0" class="notification is-danger mb-4">
        <p class="mb-3">
          <strong class="fira-sans-condensed-black-italic is-size-4">
            Download Required
          </strong>
        </p>
        <ul class="model-list">
          <li v-for="model in missingModels" :key="model.key" class="model-item">
            <div class="model-info">
              <span class="material-symbols-outlined mr-2">{{ getModelIcon(model.type) }}</span>
              <div>
                <strong>{{ model.name }}</strong>
                <span class="model-size ml-2 has-text-grey-light">{{ model.size }}</span>
                <p class="is-size-7 has-text-grey-light">{{ model.description }}</p>
              </div>
            </div>
            <button
              class="button is-warning is-small"
              @click="downloadModel(model)"
              :disabled="downloadingModel === model.key"
            >
              <span v-if="downloadingModel === model.key" class="material-symbols-outlined rotating mr-1">
                progress_activity
              </span>
              <span v-else class="material-symbols-outlined mr-1">download</span>
              {{ downloadingModel === model.key ? `${downloadProgress}%` : 'Download' }}
            </button>
          </li>
        </ul>
      </div>

      <!-- Available Models -->
      <div class="available-models">
        <div class="tags">
          <span
            v-for="model in modelRequirements"
            :key="model.key"
            class="tag is-medium"
            :class="isModelAvailable(model) ? 'is-success' : 'is-danger'"
          >
            <span class="material-symbols-outlined mr-1" style="font-size: 16px;">
              {{ isModelAvailable(model) ? 'check_circle' : 'error' }}
            </span>
            {{ model.name }}
            <span class="ml-1 has-text-grey-light" style="font-size: 10px;">
              ({{ model.vram }})
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- LLM Auto-Fill Section -->
    <div v-if="hasInputs && !isChatBased" class="autofill-section models__activity--payouts mb-5">
      <div class="columns is-vcentered">
        <div class="column">
          <h3 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-5">
            <span class="material-symbols-outlined mr-2">auto_awesome</span>
            AI Auto-Fill
          </h3>
          <p class="has-text-grey-light is-size-7">
            Describe what you want and let AI fill in the details
          </p>
        </div>
        <div class="column is-narrow">
          <button
            class="button is-info"
            :disabled="!autoFillPrompt || isAutoFilling || !canAutoFill"
            @click="autoFillInputs"
          >
            <span v-if="isAutoFilling" class="material-symbols-outlined rotating mr-1">
              progress_activity
            </span>
            <span v-else class="material-symbols-outlined mr-1">magic_button</span>
            {{ isAutoFilling ? 'Generating...' : 'Generate' }}
          </button>
        </div>
      </div>
      <div class="field mt-3">
        <div class="control">
          <textarea
            v-model="autoFillPrompt"
            class="textarea"
            placeholder="Describe what you want to create (e.g., 'A cozy coffee shop scene with warm lighting and jazz music')..."
            rows="2"
            :disabled="isAutoFilling"
          ></textarea>
        </div>
      </div>
    </div>

    <!-- Skill Inputs Form -->
    <div v-if="hasInputs && !isChatBased" class="skill-inputs models__activity--payouts">
      <h3 class="fira-sans-condensed-black-italic has-text-white has-text-left is-size-4 mb-4">
        <span class="material-symbols-outlined mr-2">tune</span>
        Skill Settings
      </h3>

      <div class="columns is-multiline">
        <div
          v-for="(field, key) in skill.inputs"
          :key="key"
          class="column"
          :class="getFieldColumnClass(field)"
        >
          <div class="field">
            <label class="label has-text-white has-text-left fira-sans-condensed-black-italic">
              {{ field.label || key }}
            </label>

            <!-- String Input -->
            <div v-if="field.type === 'string'" class="control">
              <input
                v-if="!isLongText(field)"
                class="input is-medium"
                type="text"
                v-model="localInputs[key]"
                :placeholder="field.description || `Enter ${field.label || key}`"
              />
              <textarea
                v-else
                class="textarea"
                v-model="localInputs[key]"
                :placeholder="field.description || `Enter ${field.label || key}`"
                rows="3"
              ></textarea>
            </div>

            <!-- Number Input -->
            <div v-else-if="field.type === 'number'" class="control">
              <input
                class="input is-medium"
                type="number"
                v-model.number="localInputs[key]"
                :min="field.min"
                :max="field.max"
                :placeholder="field.description"
              />
            </div>

            <!-- Select Input -->
            <div v-else-if="field.type === 'select'" class="control">
              <div class="select is-fullwidth is-medium">
                <select v-model="localInputs[key]">
                  <option v-for="opt in field.options" :key="opt" :value="opt">
                    {{ formatOption(opt) }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Boolean Input -->
            <div v-else-if="field.type === 'boolean'" class="control">
              <label class="checkbox">
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

            <p v-if="field.description && field.type !== 'boolean'" class="help has-text-grey-light">
              {{ field.description }}
            </p>
          </div>
        </div>
      </div>

      <!-- Run Button -->
      <div class="control mt-5 has-text-center">
        <button
          class="button is-success is-large"
          :disabled="!canRun || isExecuting"
          @click="executeSkill"
        >
          <span v-if="isExecuting" class="material-symbols-outlined rotating mr-2">
            progress_activity
          </span>
          <span v-else class="material-symbols-outlined mr-2">play_arrow</span>
          {{ isExecuting ? executionStatus : 'Run Skill' }}
          <span class="tag is-warning ml-3 fira-sans-condensed-black-italic">
            {{ skill.pricing?.runningFee || 99 }} BONZAI
          </span>
        </button>
      </div>
    </div>

    <!-- Chat-Based Skill Setup (Roleplay) -->
    <div v-if="isChatBased" class="chat-setup">
      <slot name="chat-interface" :skill="skill" :inputs="localInputs">
        <!-- Default chat setup UI - override with slot -->
        <div class="notification is-info">
          <p>This skill uses a chat interface. Please configure the chat settings to begin.</p>
        </div>
      </slot>
    </div>

    <!-- Execution Results -->
    <div v-if="executionResult && !isChatBased" class="execution-results mt-5">
      <slot name="results" :result="executionResult">
        <!-- Default results display -->
        <div class="notification is-success">
          <h4 class="fira-sans-condensed-black-italic is-size-4">
            <span class="material-symbols-outlined mr-2">check_circle</span>
            Skill Executed Successfully
          </h4>
          <pre class="mt-3" style="white-space: pre-wrap; max-height: 400px; overflow: auto;">{{ JSON.stringify(executionResult, null, 2) }}</pre>
        </div>
      </slot>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, reactive, onMounted } from 'vue';
import { getSkillModelRequirements, MODEL_REQUIREMENTS } from '../../skills/flagship.js';

export default {
  name: 'SkillRunner',
  props: {
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
          localInputs[key] = field.default;
        });
      }
    };

    // Watch for skill changes
    watch(() => props.skill, () => {
      initializeInputs();
      executionResult.value = null;
    }, { immediate: true });

    // Computed properties
    const modelRequirements = computed(() => {
      if (!props.skill?.id) return [];
      return getSkillModelRequirements(props.skill.id);
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
      // Check if LLM model is available for auto-fill
      const llmModel = modelRequirements.value.find(m => m.type === 'llm');
      return llmModel ? isModelAvailable(llmModel) : false;
    });

    // Methods
    const isModelAvailable = (model) => {
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

    const getFieldColumnClass = (field) => {
      if (field.type === 'string' && isLongText(field)) return 'is-12';
      if (field.type === 'image') return 'is-12';
      return 'is-6';
    };

    const isLongText = (field) => {
      return field.description?.toLowerCase().includes('describe') ||
             field.label?.toLowerCase().includes('description') ||
             field.default?.length > 50;
    };

    const formatOption = (opt) => {
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

    const downloadModel = async (model) => {
      downloadingModel.value = model.key;
      downloadProgress.value = 0;
      emit('download-model', model, (progress) => {
        downloadProgress.value = progress;
      });
    };

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
    });

    return {
      localInputs,
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
      getFieldColumnClass,
      isLongText,
      formatOption,
      handleImageUpload,
      getImagePreview,
      downloadModel,
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
  padding: 0.75rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.model-requirements .model-item:last-child {
  border-bottom: none;
}

.model-requirements .model-info {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.model-requirements .model-size {
  font-size: 0.8rem;
}

.available-models {
  margin-top: 1rem;
}

.autofill-section {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 1rem;
}

.skill-inputs {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 1.5rem;
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
  margin-top: 1.5rem;
}

.execution-results pre {
  background: rgba(0, 0, 0, 0.3);
  padding: 1rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
