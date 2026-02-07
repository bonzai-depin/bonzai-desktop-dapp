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
                    exercise
                  </span>
                  Training
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
                <!-- ACCESS REQUIREMENTS -->
                <AccessRequirements
                  ref="accessRef"
                  level="LVL6"
                  :is-generating="training.active"
                  :demo-prompt="DEMO_PROMPT"
                  @access-changed="onAccessChanged"
                  @demo-generate="onDemoGenerate"
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
                    :disabled="!hasAccess"
                  />
                  <label for="type_llm" class="radio mr-3">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      chat
                    </span>
                    Chat Model
                    <span class="tag is-info is-light ml-1">LLaMa</span>
                  </label>

                  <input
                    v-model="trainingType"
                    :value="'sdxl'"
                    id="type_sdxl"
                    type="radio"
                    name="trainingType"
                    :disabled="!hasAccess"
                  />
                  <label for="type_sdxl" class="radio">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      image
                    </span>
                    Image Model
                    <span class="tag is-warning is-light ml-1">SDXL</span>
                  </label>
                </div>

                <!-- DATASET MANAGEMENT -->
                <div class="models__activity--payouts mb-5">
                  <h3
                    class="fira-sans-condensed-black-italic is-size-4 mb-3 has-text-left"
                  >
                    <span class="material-symbols-outlined mr-2">dataset</span>
                    Training Datasets
                  </h3>

                  <div class="buttons mb-3">
                    <button
                      class="button is-success is-medium mr-5"
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
                </div>

                <!-- LLM TRAINING CONFIGURATION -->
                <div
                  v-if="trainingType === 'llm'"
                  class="models__activity--payouts mb-5"
                >
                  <h3 class="fira-sans-condensed-black-italic is-size-3 mb-3">
                    <span class="material-symbols-outlined mr-2 is-size-2">
                      tune
                    </span>
                    LoRA Configuration
                  </h3>

                  <div class="field has-text-left mt-5">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Base Model
                    </label>
                    <div class="select is-fullwidth is-medium mb-5 is-large">
                      <select v-model="llmConfig.base_model">
                        <option value="llama-3.2-1b">
                          LLaMa 3.2 1B (Fastest)
                        </option>
                        <option value="llama-3.2-3b">
                          LLaMa 3.2 3B (Balanced)
                        </option>
                        <option value="llama-3.1-8b">
                          LLaMa 3.1 8B (Best Quality)
                        </option>
                      </select>
                    </div>
                  </div>

                  <div class="columns has-text-left mb-5">
                    <div class="column">
                      <div class="field">
                        <label
                          class="label fira-sans-condensed-black-italic is-size-5"
                        >
                          Epochs: {{ llmConfig.epochs }}
                        </label>
                        <input
                          class="slider is-fullwidth p-4"
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
                        <label
                          class="label fira-sans-condensed-black-italic is-size-5"
                        >
                          Batch Size
                        </label>
                        <div class="select is-fullwidth is-large">
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

                  <div class="columns has-text-left mb-5">
                    <div class="column">
                      <div class="field">
                        <label
                          class="label fira-sans-condensed-black-italic is-size-5"
                        >
                          LoRA Rank: {{ llmConfig.lora_r }}
                        </label>
                        <input
                          class="slider is-fullwidth p-4"
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
                        <label
                          class="label fira-sans-condensed-black-italic is-size-5"
                        >
                          LoRA Alpha: {{ llmConfig.lora_alpha }}
                        </label>
                        <input
                          class="slider is-fullwidth p-4"
                          type="range"
                          v-model.number="llmConfig.lora_alpha"
                          min="8"
                          max="128"
                          step="8"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="field has-text-left">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Learning Rate
                    </label>
                    <input
                      class="input is-large"
                      type="number"
                      v-model.number="llmConfig.learning_rate"
                      step="0.00001"
                    />
                  </div>

                  <div class="field mt-5">
                    <label class="checkbox fira-sans-condensed-black-italic">
                      <input
                        class="mr-2"
                        type="checkbox"
                        v-model="llmConfig.use_4bit"
                      />
                      4-bit Quantization
                    </label>
                  </div>
                </div>

                <!-- SDXL TRAINING CONFIGURATION -->
                <div
                  v-if="trainingType === 'sdxl'"
                  class="models__activity--payouts mb-5 has-text-left"
                >
                  <h3 class="fira-sans-condensed-black-italic is-size-3 mb-3">
                    <span class="material-symbols-outlined is-size-2 mr-2">
                      tune
                    </span>
                    LoRA Configuration
                  </h3>

                  <div class="field mb-5 mt-5">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Instance Prompt
                      <span class="has-text-danger">*</span>
                    </label>
                    <input
                      class="input is-large"
                      type="text"
                      v-model="sdxlConfig.instance_prompt"
                      placeholder="A photo of sks person"
                    />
                    <p class="help">
                      Use a unique token like "sks" to identify your subject.
                    </p>
                  </div>

                  <div class="field mb-5">
                    <label
                      class="label fira-sans-condensed-black-italic is-size-5"
                    >
                      Class Prompt (Optional)
                    </label>
                    <input
                      class="input is-large"
                      type="text"
                      v-model="sdxlConfig.class_prompt"
                      placeholder="A photo of a person"
                    />
                    <p class="help">
                      General class description for prior preservation.
                    </p>
                  </div>

                  <div class="columns">
                    <div class="column">
                      <div class="field">
                        <label
                          class="label fira-sans-condensed-black-italic is-size-5"
                        >
                          Training Steps: {{ sdxlConfig.epochs }}
                        </label>
                        <input
                          class="slider is-fullwidth p-4"
                          type="range"
                          v-model.number="sdxlConfig.epochs"
                          min="100"
                          max="2000"
                          step="100"
                        />
                      </div>
                    </div>
                    <div class="column">
                      <div class="field mb-5">
                        <label
                          class="label fira-sans-condensed-black-italic is-size-5"
                        >
                          Resolution
                        </label>
                        <div class="select is-fullwidth is-large">
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
                        <label
                          class="label fira-sans-condensed-black-italic is-size-5"
                        >
                          LoRA Rank: {{ sdxlConfig.lora_rank }}
                        </label>
                        <input
                          class="slider is-fullwidth p-4"
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
                        <label
                          class="label fira-sans-condensed-black-italic is-size-5"
                        >
                          Learning Rate
                        </label>
                        <input
                          class="input is-large"
                          type="number"
                          v-model.number="sdxlConfig.learning_rate"
                          step="0.00001"
                        />
                      </div>
                    </div>
                  </div>

                  <div class="field fira-sans-condensed-black-italic is-size-5">
                    <label class="checkbox">
                      <input
                        type="checkbox"
                        v-model="sdxlConfig.use_8bit_adam"
                        class="mr-2"
                      />
                      Use 8-bit Adam
                    </label>
                  </div>
                </div>

                <!-- START TRAINING BUTTON -->
                <button
                  class="button is-danger is-large"
                  @click="startTraining"
                  :disabled="!canStartTraining || training.active"
                >
                  <span class="material-symbols-outlined mr-2 is-size-2">
                    exercise
                  </span>
                  Start Training Now
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

    <!-- CREATE DATASET MODAL (LVL Style - Purple) -->
    <div
      v-if="showCreateDataset"
      class="dataset-modal-overlay"
      @click.self="showCreateDataset = false"
    >
      <div class="dataset-modal">
        <div class="has-text-right">
          <button
            class="button is-danger"
            @click="showCreateDataset = false"
            title="Close"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="dataset-modal-header has-text-center">
          <span class="material-symbols-outlined is-size-1">
            dataset
          </span>
          <h2 class="fira-sans-condensed-black-italic is-size-3">
            Create Training Dataset
          </h2>
        </div>

        <div class="dataset-modal-body has-text-left">
          <!-- Dataset Type Preview -->
          <div class="dataset-type-preview">
            <div class="dataset-modal-status mb-4">
              <span class="dataset-status-pill fira-sans-condensed-black-italic is-size-5">
                {{ newDataset.type === 'text' ? 'TEXT DATASET' : 'IMAGE DATASET' }}
              </span>
            </div>
            <div class="dataset-type-tags">
              <span class="dataset-tag fira-sans-condensed-black-italic">
                {{ newDataset.type === 'text' ? 'LLaMa' : 'SDXL' }}
              </span>
              <span v-if="newDataset.files.length" class="dataset-tag is-count fira-sans-condensed-black-italic">
                {{ newDataset.files.length }} files
              </span>
            </div>
          </div>

          <!-- Form Section -->
          <div class="dataset-form-section">
            <div class="dataset-field mb-5">
              <label class="dataset-label fira-sans-condensed-black-italic">
                Dataset Name
              </label>
              <input
                class="dataset-input"
                type="text"
                v-model="newDataset.name"
                placeholder="My Training Dataset"
              />
            </div>

            <div class="dataset-field mb-5">
              <label class="dataset-label fira-sans-condensed-black-italic">
                Dataset Type
              </label>
              <div class="dataset-select-wrapper">
                <select v-model="newDataset.type" class="dataset-select">
                  <option value="text">Text (for LLM training)</option>
                  <option value="image">Image (for SDXL LoRA)</option>
                </select>
              </div>
            </div>

            <div class="dataset-field">
              <label class="dataset-label fira-sans-condensed-black-italic">
                Upload {{ newDataset.type === "text" ? "Text Files" : "Images" }}
              </label>
              <div class="dataset-upload-zone">
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
                  id="dataset-file-input"
                />
                <label for="dataset-file-input" class="dataset-upload-label">
                  <span class="material-symbols-outlined is-size-2">upload_file</span>
                  <span class="fira-sans-condensed-black-italic">
                    Click to select {{ newDataset.type === "text" ? "text" : "image" }} files
                  </span>
                  <span class="dataset-upload-hint">
                    {{ newDataset.type === 'text' ? 'Supports .txt, .md, .json, .jsonl' : 'Upload 10-50 images (same size preferred)' }}
                  </span>
                </label>
              </div>
            </div>

            <!-- Selected Files Preview -->
            <div v-if="newDataset.files.length" class="dataset-files-preview">
              <label class="dataset-label fira-sans-condensed-black-italic">
                Selected Files
              </label>
              <div class="dataset-file-tags">
                <span
                  v-for="(file, idx) in newDataset.files"
                  :key="idx"
                  class="dataset-file-tag"
                >
                  {{ file.name }}
                  <button
                    class="delete is-small"
                    @click="removeDatasetFile(idx)"
                  ></button>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="dataset-modal-footer mb-5">
          <button
            class="button dataset-primary-btn is-medium fira-sans-condensed-black-italic"
            @click="createDataset"
            :disabled="!newDataset.name || !newDataset.files.length || creatingDataset"
          >
            <span v-if="creatingDataset" class="loader mr-2"></span>
            <span class="material-symbols-outlined mr-2">add_circle</span>
            Create Dataset
          </button>
          <button
            class="button is-danger is-medium"
            @click="showCreateDataset = false"
          >
            Cancel
          </button>
        </div>
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

// Demo prompt for unauthenticated users
const DEMO_PROMPT = "Train a custom LoRA model on your own data";

export default {
  name: "GenerativeTraining",
  components: { AccessRequirements },
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

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

    // Socket
    const trainingSocket = ref(null);

    // Computed
    const filteredDatasets = computed(() => {
      const expectedType = trainingType.value === "llm" ? "text" : "image";
      return datasets.value.filter((ds) => ds.type === expectedType);
    });

    const canStartTraining = computed(() => {
      if (!hasAccess.value) return false;
      if (!selectedDataset.value) return false;
      if (trainingType.value === "sdxl" && !sdxlConfig.instance_prompt)
        return false;
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

    // Demo generation handler - simulates training progress
    const onDemoGenerate = async () => {
      training.active = true;
      training.type = trainingType.value;
      training.error = null;
      training.pct = 0;
      training.stage = "initializing";
      training.epoch = 0;
      training.total_epochs = 3;
      training.loss = null;

      // Simulate training stages
      const stages = [
        { stage: "loading model", pct: 5, delay: 800 },
        { stage: "preparing dataset", pct: 15, delay: 600 },
        { stage: "training", pct: 25, epoch: 1, loss: 2.45, delay: 1000 },
        { stage: "training", pct: 50, epoch: 2, loss: 1.82, delay: 1000 },
        { stage: "training", pct: 75, epoch: 3, loss: 1.24, delay: 1000 },
        { stage: "saving model", pct: 90, loss: 0.89, delay: 600 },
        { stage: "complete", pct: 100, delay: 400 },
      ];

      for (const step of stages) {
        await new Promise((r) => setTimeout(r, step.delay));
        training.stage = step.stage;
        training.pct = step.pct;
        if (step.epoch) training.epoch = step.epoch;
        if (step.loss) training.loss = step.loss;
      }

      training.active = false;

      // Add a demo trained model to the list
      trainedModels.value.unshift({
        id: `demo-${trainingType.value}-${Date.now()}`,
        type: trainingType.value === "llm" ? "llm_lora" : "sdxl_lora",
        base_model: trainingType.value === "llm" ? "llama-3.2-1b" : "sdxl",
        final_loss: 0.89,
        created_at: new Date().toISOString(),
        isDemo: true,
      });
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
      canStartTraining,
      // Demo
      DEMO_PROMPT,
      onDemoGenerate,
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
  background: url("../assets/bonzai_robots.webp") no-repeat;
  background-size: cover;
  filter: blur(6px);
  animation: move 40s ease infinite;
  will-change: transform;
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
  text-align: left;
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

/* Dataset Modal (LVL Style - Purple) */
.dataset-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dataset-modal {
  width: 92%;
  max-width: 520px;
  background: #0a0a0f;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  position: relative;
  color: #fff;
}

.dataset-modal-header {
  text-align: center;
  margin-bottom: 18px;
}

.dataset-modal-header .material-symbols-outlined {
  color: #9333ea;
  display: block;
  margin-bottom: 8px;
}

.dataset-modal-badge {
  display: inline-block;
  padding: 6px 16px;
  background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
  border-radius: 20px;
  font-weight: 900;
  color: #fff;
  margin-bottom: 10px;
}

.dataset-modal-header h2 {
  margin: 0;
  color: #fff;
}

.dataset-modal-body {
  margin-bottom: 16px;
}

.dataset-type-preview {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 1.5em;
  border: 1px solid rgba(147, 51, 234, 0.25);
  margin-bottom: 16px;
  text-align: center;
}

.dataset-modal-status {
  margin-bottom: 10px;
}

.dataset-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: 999px;
  border: 2px solid rgba(147, 51, 234, 0.6);
  color: #a855f7;
  font-size: 14px;
  font-weight: 600;
  background: rgba(147, 51, 234, 0.1);
  text-transform: uppercase;
}

.dataset-type-tags {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

.dataset-tag {
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
}

.dataset-tag.is-count {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  font-weight: 600;
}

.dataset-form-section {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 1.5em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 16px;
}

.dataset-field {
  margin-bottom: 16px;
}

.dataset-field:last-child {
  margin-bottom: 0;
}

.dataset-label {
  display: block;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 8px;
  font-size: 14px;
}

.dataset-input,
.dataset-select {
  width: 100%;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
  transition: border-color 0.2s ease;
}

.dataset-input:focus,
.dataset-select:focus {
  outline: none;
  border-color: #9333ea;
}

.dataset-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.dataset-select-wrapper {
  position: relative;
}

.dataset-select {
  appearance: none;
  cursor: pointer;
}

.dataset-select option {
  background: #1a1a2e;
  color: #fff;
}

.dataset-upload-zone {
  position: relative;
  border: 2px dashed rgba(147, 51, 234, 0.4);
  border-radius: 10px;
  padding: 2em;
  text-align: center;
  transition: all 0.2s ease;
  cursor: pointer;
}

.dataset-upload-zone:hover {
  border-color: #9333ea;
  background: rgba(147, 51, 234, 0.05);
}

.dataset-upload-zone .file-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.dataset-upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
}

.dataset-upload-label .material-symbols-outlined {
  color: #9333ea;
}

.dataset-upload-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.dataset-files-preview {
  margin-top: 16px;
}

.dataset-file-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.dataset-file-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(147, 51, 234, 0.15);
  border: 1px solid rgba(147, 51, 234, 0.3);
  border-radius: 6px;
  color: #a855f7;
  font-size: 12px;
}

.dataset-preview-box {
  background: rgba(147, 51, 234, 0.08);
  border: 1px solid rgba(147, 51, 234, 0.25);
  border-radius: 10px;
  padding: 1em 1.25em;
}

.dataset-preview-box p:first-child {
  color: #9333ea;
  margin-bottom: 8px;
  font-size: 13px;
}

.dataset-preview-text {
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1.5;
}

.dataset-preview-text strong {
  color: #a855f7;
}

.dataset-modal-footer {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.dataset-modal-footer .button {
  flex: 1;
  cursor: pointer;
}

.dataset-primary-btn {
  background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
  border: none;
  color: #fff;
}

.dataset-primary-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
}

.dataset-primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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
</style>
