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
                    smart_toy
                  </span>
                  Robotic Neural Networks
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
                Training Model
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
                <!-- ROBOT/TASK SELECTION -->
                <div class="control mb-5 has-text-left">
                  <label class="label">Robot Type</label>
                  <div class="select is-large is-fullwidth">
                    <select v-model="selectedRobot">
                      <option value="aloha">
                        ALOHA (Bimanual Manipulation)
                      </option>
                      <option value="so100">
                        SO-100 (Mobile Manipulation)
                      </option>
                      <option value="koch_v1_1">
                        Koch v1.1 (Low-Cost Arm)
                      </option>
                      <option value="custom">Custom Configuration</option>
                    </select>
                  </div>
                </div>

                <div class="control mb-5 has-text-left">
                  <label class="label">Task</label>
                  <div class="select is-large is-fullwidth">
                    <select v-model="selectedTask">
                      <option value="pick_and_place">Pick and Place</option>
                      <option value="manipulation">Complex Manipulation</option>
                      <option value="navigation">Navigation</option>
                      <option value="bimanual">Bimanual Coordination</option>
                      <option value="custom">Custom Task</option>
                    </select>
                  </div>
                </div>

                <!-- DATASET MANAGEMENT -->
                <div class="notification is-info mb-5">
                  <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                    <span class="material-symbols-outlined mr-2">dataset</span>
                    Training Datasets
                  </h3>
                  <div class="buttons">
                    <button
                      class="button is-success is-medium"
                      @click="recordDataset"
                      :disabled="isRecording"
                    >
                      <span class="material-symbols-outlined mr-1">
                        fiber_manual_record
                      </span>
                      {{ isRecording ? "Recording..." : "Record New Dataset" }}
                    </button>
                    <button
                      class="button is-info is-medium"
                      @click="loadDataset"
                    >
                      <span class="material-symbols-outlined mr-1">upload</span>
                      Load Dataset
                    </button>
                    <button
                      class="button is-warning is-medium"
                      @click="viewDatasets"
                    >
                      <span class="material-symbols-outlined mr-1">
                        visibility
                      </span>
                      View Datasets ({{ datasets.length }})
                    </button>
                  </div>
                  <div v-if="currentDataset" class="mt-3">
                    <p class="has-text-weight-bold">
                      Current Dataset: {{ currentDataset.name }}
                    </p>
                    <p>Episodes: {{ currentDataset.num_episodes }}</p>
                    <p>Total Frames: {{ currentDataset.total_frames }}</p>
                  </div>
                </div>

                <!-- TRAINING CONFIGURATION -->
                <div class="notification is-warning mb-5">
                  <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                    <span class="material-symbols-outlined mr-2">tune</span>
                    Training Configuration
                  </h3>
                  <div class="field">
                    <label class="label">Model Architecture</label>
                    <div class="select is-fullwidth">
                      <select v-model="trainingConfig.architecture">
                        <option value="act">
                          ACT (Action Chunking Transformer)
                        </option>
                        <option value="diffusion">Diffusion Policy</option>
                        <option value="vqbet">VQ-BeT</option>
                        <option value="tdmpc">TD-MPC</option>
                      </select>
                    </div>
                  </div>
                  <div class="field">
                    <label class="label">
                      Epochs: {{ trainingConfig.epochs }}
                    </label>
                    <input
                      class="slider is-fullwidth"
                      type="range"
                      v-model.number="trainingConfig.epochs"
                      min="10"
                      max="1000"
                      step="10"
                    />
                  </div>
                  <div class="field">
                    <label class="label">Batch Size</label>
                    <div class="select is-fullwidth">
                      <select v-model.number="trainingConfig.batch_size">
                        <option :value="8">8</option>
                        <option :value="16">16</option>
                        <option :value="32">32</option>
                        <option :value="64">64</option>
                      </select>
                    </div>
                  </div>
                  <div class="field">
                    <label class="label">Learning Rate</label>
                    <input
                      class="input"
                      type="number"
                      v-model.number="trainingConfig.learning_rate"
                      step="0.00001"
                    />
                  </div>
                  <div class="field">
                    <label class="checkbox">
                      <input
                        type="checkbox"
                        v-model="trainingConfig.use_pretrained"
                      />
                      Use Pre-trained Weights
                    </label>
                  </div>
                </div>

                <!-- TRAIN BUTTON -->
                <button
                  class="button is-danger is-large is-fullwidth mb-5"
                  @click="startTraining"
                  :disabled="!currentDataset || training.active"
                >
                  <span class="material-symbols-outlined mr-2 is-size-2">
                    model_training
                  </span>
                  Start Training
                </button>

                <!-- EVALUATION & DEPLOYMENT -->
                <div v-if="trainedModel" class="notification is-success mb-5">
                  <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                    <span class="material-symbols-outlined mr-2">verified</span>
                    Trained Model
                  </h3>
                  <p>Model ID: {{ trainedModel.id }}</p>
                  <p>Final Loss: {{ trainedModel.final_loss?.toFixed(4) }}</p>
                  <p>Success Rate: {{ trainedModel.success_rate }}%</p>
                  <div class="buttons mt-3">
                    <button
                      class="button is-info is-medium"
                      @click="evaluateModel"
                    >
                      <span class="material-symbols-outlined mr-1">
                        analytics
                      </span>
                      Evaluate
                    </button>
                    <button
                      class="button is-success is-medium"
                      @click="deployModel"
                    >
                      <span class="material-symbols-outlined mr-1">
                        rocket_launch
                      </span>
                      Deploy to Robot
                    </button>
                    <button
                      class="button is-warning is-medium"
                      @click="exportModel"
                    >
                      <span class="material-symbols-outlined mr-1">
                        download
                      </span>
                      Export Model
                    </button>
                    <button
                      class="button is-danger is-medium"
                      @click="mintModelNFT"
                    >
                      <span class="material-symbols-outlined mr-1">token</span>
                      Mint NFT
                    </button>
                  </div>
                </div>

                <!-- TRAINING HISTORY -->
                <div v-if="trainingHistory.length" class="mt-5">
                  <h3 class="fira-sans-condensed-black-italic is-size-4 mb-3">
                    <span class="material-symbols-outlined mr-2">history</span>
                    Training History
                  </h3>
                  <div class="box" v-for="run in trainingHistory" :key="run.id">
                    <div class="columns">
                      <div class="column">
                        <p class="has-text-weight-bold">
                          {{ run.architecture }}
                        </p>
                        <p>{{ run.robot }} - {{ run.task }}</p>
                        <p class="is-size-7">
                          {{ new Date(run.timestamp).toLocaleString() }}
                        </p>
                      </div>
                      <div class="column has-text-right">
                        <p>Loss: {{ run.final_loss?.toFixed(4) }}</p>
                        <p>
                          Epochs: {{ run.epochs_completed }}/{{
                            run.total_epochs
                          }}
                        </p>
                        <button
                          class="button is-small is-danger mt-2"
                          @click="mintHistoryNFT(run)"
                        >
                          <span class="material-symbols-outlined">token</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from "vue";
import { v4 as uuid } from "uuid";
import axios from "axios";
import { io } from "socket.io-client";
import { inferenceStore } from "../store/inferenceStore";
import { nftMinter } from "../services/nftMinter";

const API_BASE = "http://127.0.0.1:65000";

export default {
  name: "GenerativeRobot",
  setup() {
    const selectedRobot = ref("aloha");
    const selectedTask = ref("pick_and_place");
    const currentDataset = ref(null);
    const datasets = ref([]);
    const isRecording = ref(false);
    const trainedModel = ref(null);
    const trainingHistory = ref([]);

    const trainingConfig = reactive({
      architecture: "act",
      epochs: 100,
      batch_size: 16,
      learning_rate: 0.0001,
      use_pretrained: true,
    });

    const training = reactive({
      active: false,
      stage: "",
      pct: 0,
      epoch: 0,
      total_epochs: 0,
      loss: null,
      eta: null,
    });

    const trainingSocket = ref(null);

    onMounted(async () => {
      await inferenceStore.init();
      await loadHistory();
      setupTrainingSocket();
    });

    const setupTrainingSocket = () => {
      trainingSocket.value = io(`${API_BASE}/training`, {
        transports: ["websocket", "polling"],
      });

      trainingSocket.value.on("training_progress", (data) => {
        training.epoch = data.epoch || 0;
        training.total_epochs = data.total_epochs || 0;
        training.loss = data.loss;
        training.pct = data.progress || 0;
        training.stage = data.stage || "training";
        training.eta = data.eta;
      });

      trainingSocket.value.on("training_complete", (data) => {
        training.active = false;
        training.pct = 100;
        trainedModel.value = {
          id: data.model_id,
          final_loss: data.final_loss,
          success_rate: data.success_rate || 0,
          path: data.model_path,
        };
        saveTrainingRun(data);
      });

      trainingSocket.value.on("training_error", (data) => {
        training.active = false;
        alert(`Training failed: ${data.error}`);
      });
    };

    const recordDataset = async () => {
      try {
        isRecording.value = true;
        const { data } = await axios.post(`${API_BASE}/robot/record`, {
          robot_type: selectedRobot.value,
          task: selectedTask.value,
        });

        currentDataset.value = data.dataset;
        datasets.value.push(data.dataset);
        alert(
          `Recording complete! Captured ${data.dataset.num_episodes} episodes.`
        );
      } catch (e) {
        alert(`Recording failed: ${e.message}`);
      } finally {
        isRecording.value = false;
      }
    };

    const loadDataset = async () => {
      // Trigger file picker via Electron API
      const result = await window.electronAPI?.pickDatasetFile?.();
      if (result && result.dataset) {
        currentDataset.value = result.dataset;
        datasets.value.push(result.dataset);
      }
    };

    const viewDatasets = () => {
      // Open datasets view modal
      alert(`You have ${datasets.value.length} datasets available.`);
    };

    const startTraining = async () => {
      if (!currentDataset.value) {
        alert("Please load or record a dataset first.");
        return;
      }

      training.active = true;
      training.stage = "initializing";
      training.pct = 0;
      training.total_epochs = trainingConfig.epochs;

      try {
        await axios.post(`${API_BASE}/robot/train`, {
          dataset_id: currentDataset.value.id,
          robot_type: selectedRobot.value,
          task: selectedTask.value,
          architecture: trainingConfig.architecture,
          epochs: trainingConfig.epochs,
          batch_size: trainingConfig.batch_size,
          learning_rate: trainingConfig.learning_rate,
          use_pretrained: trainingConfig.use_pretrained,
        });
      } catch (e) {
        training.active = false;
        alert(`Training failed to start: ${e.message}`);
      }
    };

    const evaluateModel = async () => {
      if (!trainedModel.value) return;

      try {
        const { data } = await axios.post(`${API_BASE}/robot/evaluate`, {
          model_id: trainedModel.value.id,
        });

        alert(
          `Evaluation Results:\nSuccess Rate: ${data.success_rate}%\nAvg Reward: ${data.avg_reward}`
        );
      } catch (e) {
        alert(`Evaluation failed: ${e.message}`);
      }
    };

    const deployModel = async () => {
      if (!trainedModel.value) return;

      try {
        await axios.post(`${API_BASE}/robot/deploy`, {
          model_id: trainedModel.value.id,
          robot_type: selectedRobot.value,
        });

        alert("Model deployed successfully! Robot is now operational.");
      } catch (e) {
        alert(`Deployment failed: ${e.message}`);
      }
    };

    const exportModel = async () => {
      if (!trainedModel.value) return;

      const result = await window.electronAPI?.saveModel?.(
        `bonzai_model_${trainedModel.value.id}.pth`,
        trainedModel.value.path
      );

      if (result?.success) {
        alert(`Model exported to: ${result.path}`);
      }
    };

    const mintModelNFT = async () => {
      if (!trainedModel.value) return;

      try {
        const dataset = {
          id: trainedModel.value.id,
          robot: selectedRobot.value,
          task: selectedTask.value,
          architecture: trainingConfig.architecture,
          final_loss: trainedModel.value.final_loss,
          success_rate: trainedModel.value.success_rate,
          timestamp: Date.now(),
        };

        const result = await nftMinter.mint(dataset, "robotic");

        await inferenceStore.addRoboticDataset({
          ...dataset,
          nft: result,
        });

        alert(
          `NFT minted successfully!\nToken ID: ${result.tokenId}\nView on Arbiscan: ${result.explorerUrl}`
        );
      } catch (e) {
        alert(`NFT minting failed: ${e.message}`);
      }
    };

    const mintHistoryNFT = async (run) => {
      try {
        const result = await nftMinter.mint(run, "robotic");
        alert(`NFT minted! Token ID: ${result.tokenId}`);
      } catch (e) {
        alert(`Minting failed: ${e.message}`);
      }
    };

    const saveTrainingRun = (data) => {
      const run = {
        id: data.model_id || uuid(),
        robot: selectedRobot.value,
        task: selectedTask.value,
        architecture: trainingConfig.architecture,
        total_epochs: trainingConfig.epochs,
        epochs_completed: data.epoch || trainingConfig.epochs,
        final_loss: data.final_loss,
        timestamp: Date.now(),
      };

      trainingHistory.value.unshift(run);
      inferenceStore.addRoboticDataset(run);
    };

    const loadHistory = async () => {
      await inferenceStore.loadRoboticDatasets();
      trainingHistory.value = inferenceStore.state.roboticDatasets.slice(0, 10);
    };

    return {
      selectedRobot,
      selectedTask,
      currentDataset,
      datasets,
      isRecording,
      trainingConfig,
      training,
      trainedModel,
      trainingHistory,
      recordDataset,
      loadDataset,
      viewDatasets,
      startTraining,
      evaluateModel,
      deployModel,
      exportModel,
      mintModelNFT,
      mintHistoryNFT,
    };
  },
};
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");

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
  background: url("src/assets/bonzai_robot.jpg") no-repeat;
  background-size: cover;
  filter: blur(6px);
  animation: move 40s ease infinite;
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
  background: rgba(0, 0, 0, 0.6);
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

.label {
  color: #fff;
  font-weight: 600;
}

.box {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  margin-bottom: 1em;
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
</style>
