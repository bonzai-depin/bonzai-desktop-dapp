<template>
  <div class="background"></div>
  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
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
                    model_training
                  </span>
                  Model Training
                </h1>
              </div>
            </div>
          </div>

          <!-- TRAINING PROGRESS -->
          <div
            v-if="training.active"
            class="training notification is-info"
            style="margin-bottom: 1rem"
          >
            <p class="mb-2">
              <span class="fira-sans-condensed-black-italic is-size-4">
                <button
                  disabled
                  class="button is-loading is-info is-small mr-2 p-4"
                ></button>
                Training {{ training.type === "llm" ? "LLM" : "SDXL LoRA" }}
                <span class="ml-1" v-if="training.stage">
                  ({{ training.stage }})
                </span>
              </span>
              <span
                class="fira-sans-condensed-black-italic is-pulled-right is-size-4"
              >
                {{ Math.round(training.pct) }}%
              </span>
            </p>
            <progress
              class="progress is-success"
              :value="Math.max(0, Math.min(100, training.pct))"
              max="100"
            >
              {{ Math.round(training.pct) }}%
            </progress>
            <div class="mt-2" style="font-size: 14px">
              <div>Epoch: {{ training.epoch }}/{{ training.total_epochs }}</div>
              <div>Loss: {{ training.loss?.toFixed(4) || "N/A" }}</div>
              <div v-if="training.eta">ETA: {{ training.eta }}</div>
            </div>
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <!-- ACCESS REQUIREMENTS (no demo for training - requires real datasets) -->
                <AccessRequirements
                  ref="accessRef"
                  level="LVL6"
                  @access-changed="onAccessChanged"
                />

                <!-- TRAINING TYPE SELECTION -->
                <div class="control mb-5 has-text-left">
                  <input
                    v-model="trainingType"
                    :value="'llm'"
                    id="type_llm"
                    type="radio"
                    name="trainingType"
                    checked
                  />
                  <label for="type_llm" class="radio mr-3">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      psychology
                    </span>
                    LLM LoRA
                    <span class="tag is-info is-light ml-1">Llama</span>
                  </label>

                  <input
                    v-model="trainingType"
                    :value="'sdxl'"
                    id="type_sdxl"
                    type="radio"
                    name="trainingType"
                  />
                  <label for="type_sdxl" class="radio">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      image
                    </span>
                    SDXL LoRA
                    <span class="tag is-warning is-light ml-1">Images</span>
                  </label>
                </div>

                <!-- DATASET MANAGEMENT -->
                <div class="notification is-dark mb-5">
                  <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                    <span class="material-symbols-outlined mr-2">dataset</span>
                    Training Datasets
                  </h3>

                  <div class="buttons mb-3">
                    <button
                      class="button is-success is-medium"
                      @click="showCreateDataset = true"
                    >
                      <span class="material-symbols-outlined mr-1">add</span>
                      Create Dataset
                    </button>
                    <button
                      class="button is-info is-medium"
                      @click="loadDatasets"
                    >
                      <span class="material-symbols-outlined mr-1">
                        refresh
                      </span>
                      Refresh
                    </button>
                  </div>

                  <!-- Dataset List -->
                  <div v-if="datasets.length" class="dataset-list">
                    <div
                      v-for="ds in filteredDatasets"
                      :key="ds.id"
                      class="dataset-item"
                      :class="{ 'is-selected': selectedDataset?.id === ds.id }"
                      @click="selectedDataset = ds"
                    >
                      <div class="dataset-info">
                        <span class="material-symbols-outlined mr-2">
                          {{
                            ds.type === "text" ? "description" : "photo_library"
                          }}
                        </span>
                        <div>
                          <strong>{{ ds.name }}</strong>
                          <p class="is-size-7 has-text-grey-light">
                            {{ ds.num_files }} files • {{ ds.type }}
                          </p>
                        </div>
                      </div>
                      <button
                        class="button is-small is-danger"
                        @click.stop="deleteDataset(ds.id)"
                        title="Delete dataset"
                      >
                        <span class="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                  <p v-else class="has-text-grey-light">
                    No datasets yet. Create one to start training.
                  </p>
                </div>

                <!-- LLM TRAINING CONFIGURATION -->
                <div
                  v-if="trainingType === 'llm'"
                  class="notification is-warning mb-5"
                >
                  <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                    <span class="material-symbols-outlined mr-2">tune</span>
                    LLM LoRA Configuration
                  </h3>

                  <div class="field">
                    <label class="label">Base Model</label>
                    <div class="select is-fullwidth">
                      <select v-model="llmConfig.base_model">
                        <option value="llama-3.2-1b">
                          Llama 3.2 1B (Fastest)
                        </option>
                        <option value="llama-3.2-3b">
                          Llama 3.2 3B (Balanced)
                        </option>
                        <option value="llama-3.1-8b">
                          Llama 3.1 8B (Best Quality)
                        </option>
                      </select>
                    </div>
                  </div>

                  <div class="columns">
                    <div class="column">
                      <div class="field">
                        <label class="label">
                          Epochs: {{ llmConfig.epochs }}
                        </label>
                        <input
                          class="slider is-fullwidth"
                          type="range"
                          v-model.number="llmConfig.epochs"
                          min="1"
                          max="10"
                          step="1"
                        />
                      </div>
                    </div>
                    <div class="column">
                      <div class="field">
                        <label class="label">Batch Size</label>
                        <div class="select is-fullwidth">
                          <select v-model.number="llmConfig.batch_size">
                            <option :value="1">1 (Low VRAM)</option>
                            <option :value="2">2</option>
                            <option :value="4">4 (Default)</option>
                            <option :value="8">8 (High VRAM)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="columns">
                    <div class="column">
                      <div class="field">
                        <label class="label">
                          LoRA Rank: {{ llmConfig.lora_r }}
                        </label>
                        <input
                          class="slider is-fullwidth"
                          type="range"
                          v-model.number="llmConfig.lora_r"
                          min="4"
                          max="64"
                          step="4"
                        />
                      </div>
                    </div>
                    <div class="column">
                      <div class="field">
                        <label class="label">
                          LoRA Alpha: {{ llmConfig.lora_alpha }}
                        </label>
                        <input
                          class="slider is-fullwidth"
                          type="range"
                          v-model.number="llmConfig.lora_alpha"
                          min="8"
                          max="128"
                          step="8"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="field">
                    <label class="label">Learning Rate</label>
                    <input
                      class="input"
                      type="number"
                      v-model.number="llmConfig.learning_rate"
                      step="0.00001"
                    />
                  </div>

                  <div class="field">
                    <label class="checkbox">
                      <input type="checkbox" v-model="llmConfig.use_4bit" />
                      Use 4-bit Quantization (QLoRA - saves VRAM)
                    </label>
                  </div>
                </div>

                <!-- SDXL TRAINING CONFIGURATION -->
                <div
                  v-if="trainingType === 'sdxl'"
                  class="notification is-warning mb-5"
                >
                  <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                    <span class="material-symbols-outlined mr-2">tune</span>
                    SDXL LoRA Configuration
                  </h3>

                  <div class="field">
                    <label class="label">
                      Instance Prompt
                      <span class="has-text-danger">*</span>
                    </label>
                    <input
                      class="input"
                      type="text"
                      v-model="sdxlConfig.instance_prompt"
                      placeholder="a photo of sks person"
                    />
                    <p class="help">
                      Use a unique token like "sks" to identify your subject
                    </p>
                  </div>

                  <div class="field">
                    <label class="label">Class Prompt (Optional)</label>
                    <input
                      class="input"
                      type="text"
                      v-model="sdxlConfig.class_prompt"
                      placeholder="a photo of a person"
                    />
                    <p class="help">
                      General class description for prior preservation
                    </p>
                  </div>

                  <div class="columns">
                    <div class="column">
                      <div class="field">
                        <label class="label">
                          Training Steps: {{ sdxlConfig.epochs }}
                        </label>
                        <input
                          class="slider is-fullwidth"
                          type="range"
                          v-model.number="sdxlConfig.epochs"
                          min="100"
                          max="2000"
                          step="100"
                        />
                      </div>
                    </div>
                    <div class="column">
                      <div class="field">
                        <label class="label">Resolution</label>
                        <div class="select is-fullwidth">
                          <select v-model.number="sdxlConfig.resolution">
                            <option :value="512">512 (Fast)</option>
                            <option :value="768">768</option>
                            <option :value="1024">1024 (Best)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="columns">
                    <div class="column">
                      <div class="field">
                        <label class="label">
                          LoRA Rank: {{ sdxlConfig.lora_rank }}
                        </label>
                        <input
                          class="slider is-fullwidth"
                          type="range"
                          v-model.number="sdxlConfig.lora_rank"
                          min="4"
                          max="128"
                          step="4"
                        />
                      </div>
                    </div>
                    <div class="column">
                      <div class="field">
                        <label class="label">Learning Rate</label>
                        <input
                          class="input"
                          type="number"
                          v-model.number="sdxlConfig.learning_rate"
                          step="0.00001"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="field">
                    <label class="checkbox">
                      <input
                        type="checkbox"
                        v-model="sdxlConfig.use_8bit_adam"
                      />
                      Use 8-bit Adam (saves VRAM)
                    </label>
                  </div>
                </div>

                <!-- START TRAINING BUTTON -->
                <button
                  class="button is-danger is-large is-fullwidth mb-5"
                  @click="startTraining"
                  :disabled="!canStartTraining || training.active"
                >
                  <span class="material-symbols-outlined mr-2 is-size-2">
                    rocket_launch
                  </span>
                  Start {{ trainingType === "llm" ? "LLM" : "SDXL" }} Training
                </button>

                <!-- TRAINED MODELS -->
                <div
                  v-if="trainedModels.length"
                  class="notification is-success mb-5"
                >
                  <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                    <span class="material-symbols-outlined mr-2">verified</span>
                    Trained Models
                  </h3>

                  <div
                    v-for="model in trainedModels"
                    :key="model.id"
                    class="trained-model-item"
                  >
                    <div class="model-info">
                      <span class="tag is-dark mr-2">
                        {{ model.type === "llm_lora" ? "🧠 LLM" : "🎨 SDXL" }}
                      </span>
                      <div>
                        <strong>{{ model.id }}</strong>
                        <p class="is-size-7">
                          {{ model.base_model }} • Loss:
                          {{ model.final_loss?.toFixed(4) }}
                        </p>
                      </div>
                    </div>
                    <div class="buttons">
                      <button
                        class="button is-small is-info"
                        @click="exportModel(model)"
                        title="Export model"
                      >
                        <span class="material-symbols-outlined">download</span>
                      </button>
                      <button
                        class="button is-small is-warning"
                        @click="mintModelNFT(model)"
                        title="Mint as NFT"
                      >
                        <span class="material-symbols-outlined">token</span>
                      </button>
                      <button
                        class="button is-small is-danger"
                        @click="deleteModel(model.id)"
                        title="Delete model"
                      >
                        <span class="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- TRAINING ERROR -->
                <div
                  v-if="training.error"
                  class="notification is-danger"
                  style="margin-bottom: 1rem"
                >
                  <strong>Training failed:</strong>
                  {{ training.error }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CREATE DATASET MODAL -->
    <div class="modal" :class="{ 'is-active': showCreateDataset }">
      <div class="modal-background" @click="showCreateDataset = false"></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">Create Training Dataset</p>
          <button
            class="delete"
            aria-label="close"
            @click="showCreateDataset = false"
          ></button>
        </header>
        <section class="modal-card-body">
          <div class="field">
            <label class="label">Dataset Name</label>
            <input
              class="input"
              type="text"
              v-model="newDataset.name"
              placeholder="My Training Dataset"
            />
          </div>

          <div class="field">
            <label class="label">Type</label>
            <div class="select is-fullwidth">
              <select v-model="newDataset.type">
                <option value="text">Text (for LLM training)</option>
                <option value="image">Image (for SDXL LoRA)</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label class="label">
              Upload {{ newDataset.type === "text" ? "Text Files" : "Images" }}
            </label>
            <div class="file has-name is-fullwidth is-boxed">
              <label class="file-label">
                <input
                  class="file-input"
                  type="file"
                  :accept="
                    newDataset.type === 'text'
                      ? '.txt,.md,.json,.jsonl'
                      : 'image/*'
                  "
                  multiple
                  @change="handleDatasetFiles"
                />
                <span class="file-cta">
                  <span class="file-icon">
                    <span class="material-symbols-outlined">upload_file</span>
                  </span>
                  <span class="file-label">
                    Choose
                    {{ newDataset.type === "text" ? "text" : "image" }} files...
                  </span>
                </span>
                <span class="file-name" v-if="newDataset.files.length">
                  {{ newDataset.files.length }} file(s) selected
                </span>
              </label>
            </div>
            <p class="help" v-if="newDataset.type === 'text'">
              Supports .txt, .md, .json, .jsonl formats
            </p>
            <p class="help" v-else>
              Upload 10-50 images of your subject (same size preferred)
            </p>
          </div>

          <!-- Preview uploaded files -->
          <div v-if="newDataset.files.length" class="mt-4">
            <label class="label">Selected Files</label>
            <div class="tags">
              <span
                v-for="(file, idx) in newDataset.files"
                :key="idx"
                class="tag is-dark"
              >
                {{ file.name }}
                <button
                  class="delete is-small"
                  @click="removeDatasetFile(idx)"
                ></button>
              </span>
            </div>
          </div>
        </section>
        <footer class="modal-card-foot">
          <button
            class="button is-success"
            @click="createDataset"
            :disabled="
              !newDataset.name || !newDataset.files.length || creatingDataset
            "
          >
            <span v-if="creatingDataset" class="loader mr-2"></span>
            Create Dataset
          </button>
          <button class="button" @click="showCreateDataset = false">
            Cancel
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script>
import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { v4 as uuid } from "uuid";
import axios from "axios";
import { io } from "socket.io-client";
import AccessRequirements from "./AccessRequirements.vue";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_TRAINING = `${API_BASE}/training`;

export default {
  name: "GenerativeTraining",
  components: {
    AccessRequirements,
  },
  setup() {
    // Training type selection
    const trainingType = ref("llm"); // 'llm' or 'sdxl'

    // Datasets
    const datasets = ref([]);
    const selectedDataset = ref(null);
    const showCreateDataset = ref(false);
    const creatingDataset = ref(false);
    const newDataset = reactive({
      name: "",
      type: "text",
      files: [],
      fileContents: [],
    });

    // Trained models
    const trainedModels = ref([]);

    // LLM Config
    const llmConfig = reactive({
      base_model: "llama-3.2-1b",
      epochs: 3,
      batch_size: 4,
      learning_rate: 0.0002,
      lora_r: 16,
      lora_alpha: 32,
      use_4bit: true,
      max_seq_length: 2048,
    });

    // SDXL Config
    const sdxlConfig = reactive({
      instance_prompt: "",
      class_prompt: "",
      epochs: 500,
      batch_size: 1,
      learning_rate: 0.0001,
      lora_rank: 32,
      resolution: 1024,
      use_8bit_adam: true,
    });

    // Training state
    const training = reactive({
      active: false,
      type: null,
      id: null,
      stage: "",
      pct: 0,
      epoch: 0,
      total_epochs: 0,
      loss: null,
      eta: null,
      error: null,
    });

    // Access control
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (val) => {
      hasAccess.value = val;
    };

    // Socket
    const trainingSocket = ref(null);

    // Computed
    const filteredDatasets = computed(() => {
      const expectedType = trainingType.value === "llm" ? "text" : "image";
      return datasets.value.filter((ds) => ds.type === expectedType);
    });

    const canStartTraining = computed(() => {
      if (!selectedDataset.value) return false;
      if (trainingType.value === "sdxl" && !sdxlConfig.instance_prompt)
        return false;
      if (!hasAccess.value) return false;
      return true;
    });

    // Socket setup
    const setupTrainingSocket = () => {
      trainingSocket.value = io(WS_TRAINING, {
        transports: ["polling", "websocket"],
        forceNew: true,
      });

      trainingSocket.value.on("connect", () => {
        console.log("[training] Socket connected");
      });

      trainingSocket.value.on("training_progress", (data) => {
        if (training.id && data.training_id !== training.id) return;

        training.epoch = data.epoch || 0;
        training.total_epochs = data.total_epochs || 0;
        training.loss = data.loss;
        training.pct = data.progress || 0;
        training.stage = data.stage || "training";
        training.eta = data.eta;
      });

      trainingSocket.value.on("training_complete", async (data) => {
        if (training.id && data.training_id !== training.id) return;

        training.active = false;
        training.pct = 100;
        training.stage = "complete";

        // Reload trained models
        await loadTrainedModels();
      });

      trainingSocket.value.on("training_error", (data) => {
        if (training.id && data.training_id !== training.id) return;

        training.active = false;
        training.error = data.error || "Unknown error";
      });
    };

    // API calls
    const loadDatasets = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/training/datasets`);
        datasets.value = data.datasets || [];
      } catch (e) {
        console.error("Failed to load datasets:", e);
      }
    };

    const loadTrainedModels = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/training/models`);
        trainedModels.value = data.models || [];
      } catch (e) {
        console.error("Failed to load trained models:", e);
      }
    };

    const handleDatasetFiles = async (event) => {
      const files = Array.from(event.target.files || []);
      newDataset.files = files;
      newDataset.fileContents = [];

      for (const file of files) {
        const reader = new FileReader();
        const content = await new Promise((resolve) => {
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(file);
        });
        newDataset.fileContents.push({
          filename: file.name,
          content_base64: content,
        });
      }
    };

    const removeDatasetFile = (idx) => {
      newDataset.files.splice(idx, 1);
      newDataset.fileContents.splice(idx, 1);
    };

    const createDataset = async () => {
      if (!newDataset.name || !newDataset.fileContents.length) return;

      creatingDataset.value = true;
      try {
        const { data } = await axios.post(`${API_BASE}/training/datasets`, {
          name: newDataset.name,
          type: newDataset.type,
          files: newDataset.fileContents,
        });

        if (data.ok) {
          datasets.value.push(data.dataset);
          selectedDataset.value = data.dataset;
          showCreateDataset.value = false;

          // Reset form
          newDataset.name = "";
          newDataset.files = [];
          newDataset.fileContents = [];
        }
      } catch (e) {
        console.error("Failed to create dataset:", e);
        alert(
          "Failed to create dataset: " + (e.response?.data?.error || e.message)
        );
      } finally {
        creatingDataset.value = false;
      }
    };

    const deleteDataset = async (datasetId) => {
      if (!confirm("Delete this dataset?")) return;

      try {
        await axios.delete(`${API_BASE}/training/datasets/${datasetId}`);
        datasets.value = datasets.value.filter((d) => d.id !== datasetId);
        if (selectedDataset.value?.id === datasetId) {
          selectedDataset.value = null;
        }
      } catch (e) {
        console.error("Failed to delete dataset:", e);
      }
    };

    const startTraining = async () => {
      if (!canStartTraining.value) return;

      training.active = true;
      training.type = trainingType.value;
      training.error = null;
      training.pct = 0;
      training.stage = "initializing";

      const endpoint =
        trainingType.value === "llm"
          ? `${API_BASE}/training/llm/start`
          : `${API_BASE}/training/sdxl/start`;

      const payload =
        trainingType.value === "llm"
          ? {
              dataset_id: selectedDataset.value.id,
              ...llmConfig,
            }
          : {
              dataset_id: selectedDataset.value.id,
              ...sdxlConfig,
            };

      try {
        const { data, status } = await axios.post(endpoint, payload, {
          validateStatus: () => true,
        });

        if (status === 202) {
          training.id = data.training_id;
          training.total_epochs =
            trainingType.value === "llm" ? llmConfig.epochs : sdxlConfig.epochs;
        } else {
          training.active = false;
          training.error = data.error || `Failed to start training (${status})`;
        }
      } catch (e) {
        training.active = false;
        training.error = e.message || "Network error";
      }
    };

    const exportModel = async (model) => {
      try {
        const { data } = await axios.post(
          `${API_BASE}/training/models/${model.id}/export`
        );

        if (data.model_path) {
          const result = await window.electronAPI?.saveModel?.(
            `bonzai_${model.type}_${model.id}.zip`,
            data.model_path
          );

          if (result?.success) {
            alert(`Model exported to: ${result.path}`);
          }
        }
      } catch (e) {
        console.error("Export failed:", e);
        alert("Export failed: " + e.message);
      }
    };

    const deleteModel = async (modelId) => {
      if (!confirm("Delete this trained model?")) return;

      try {
        await axios.delete(`${API_BASE}/training/models/${modelId}`);
        trainedModels.value = trainedModels.value.filter(
          (m) => m.id !== modelId
        );
      } catch (e) {
        console.error("Failed to delete model:", e);
      }
    };

    const mintModelNFT = async (model) => {
      // Placeholder for NFT minting
      alert(
        `NFT minting for model ${model.id} coming soon!\n\nThis will create an on-chain record of your trained model.`
      );
    };

    // Watch training type to update dataset type for new datasets
    watch(trainingType, (newType) => {
      newDataset.type = newType === "llm" ? "text" : "image";
    });

    // Lifecycle
    onMounted(async () => {
      setupTrainingSocket();
      await loadDatasets();
      await loadTrainedModels();
    });

    onBeforeUnmount(() => {
      if (trainingSocket.value?.connected) {
        trainingSocket.value.disconnect();
      }
    });

    return {
      trainingType,
      datasets,
      filteredDatasets,
      selectedDataset,
      showCreateDataset,
      creatingDataset,
      newDataset,
      trainedModels,
      llmConfig,
      sdxlConfig,
      training,
      canStartTraining,
      loadDatasets,
      handleDatasetFiles,
      removeDatasetFile,
      createDataset,
      deleteDataset,
      startTraining,
      exportModel,
      deleteModel,
      mintModelNFT,
      // Access control
      accessRef,
      hasAccess,
      onAccessChanged,
    };
  },
};
</script>

<style scoped>
/* Fonts imported from App.vue for offline mode */

.training {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1;
  opacity: 0.95;
}

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  background-size: cover;
  overflow: hidden;
}

.models__deployment {
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
}

.models__deployment-install {
  overflow-y: auto;
  padding: 6em;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
}

.models__activity--payouts {
  padding: 4em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}

h1,
h3 {
  color: #fff;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
}

h1 {
  font-size: 64px;
  text-align: right;
}

.label {
  color: #fff;
  font-weight: 600;
}

.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
}

input[type="radio"] {
  display: none;
}

input[type="radio"] + label {
  padding: 6px 16px 12px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}

.notification.is-dark {
  background: rgba(30, 30, 40, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.notification.is-warning {
  background: rgba(255, 221, 87, 0.15);
  color: #fff;
  border: 1px solid rgba(255, 221, 87, 0.3);
}

.notification.is-success {
  background: rgba(72, 199, 142, 0.15);
  color: #fff;
  border: 1px solid rgba(72, 199, 142, 0.3);
}

.dataset-list {
  max-height: 200px;
  overflow-y: auto;
}

.dataset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dataset-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.dataset-item.is-selected {
  background: rgba(97, 55, 142, 0.3);
  border-color: rgba(97, 55, 142, 0.6);
}

.dataset-info {
  display: flex;
  align-items: center;
}

.trained-model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.model-info {
  display: flex;
  align-items: center;
}

.slider {
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.2);
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #61378e;
  cursor: pointer;
}

.input,
.select select {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.checkbox {
  color: #fff;
}

.modal-card {
  background: #1a1a2e;
  color: #fff;
}

.modal-card-head,
.modal-card-foot {
  background: rgba(30, 30, 40, 0.9);
  border-color: rgba(255, 255, 255, 0.1);
}

.modal-card-title {
  color: #fff;
}

.modal-card-body {
  background: #1a1a2e;
}

.modal-card-body .label {
  color: #fff;
}

.modal-card-body .input,
.modal-card-body .select select {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.file-cta,
.file-name {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.help {
  color: rgba(255, 255, 255, 0.6);
}

.loader {
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-bottom-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: rotation 1s linear infinite;
}

@keyframes rotation {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
