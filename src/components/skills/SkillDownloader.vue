<template>
  <div class="skill-downloader">
    <!-- DOWNLOAD REQUIRED (when not actively downloading and check is complete) -->
    <div
      v-if="modelAvailabilityChecked && hasRequirements && hasMissingModels && !downloads.active"
      class="skill-download-card skill-download-card--danger"
    >
      <div class="skill-download-card__body">
        <strong class="skill-download-card__title fira-sans-condensed-black-italic">
          Download Required
        </strong>
        <!-- Show all missing repos/files -->
        <ul class="skill-download-list">
          <template v-for="model in missingModels" :key="model.key">
            <!-- Repos from readiness check -->
            <li
              v-for="repo in modelReadinessDetails[model.key]?.repos || []"
              :key="repo"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                deployed_code
              </span>
              {{ repo }}
            </li>
            <!-- Files from readiness check -->
            <li
              v-for="file in modelReadinessDetails[model.key]?.files || []"
              :key="file"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                deployed_code
              </span>
              {{ file }}
            </li>
            <!-- Fallback for models without detailed readiness info -->
            <template
              v-if="
                !modelReadinessDetails[model.key]?.repos?.length &&
                !modelReadinessDetails[model.key]?.files?.length
              "
            >
              <!-- Handle array repos (e.g., Qwen TTS) -->
              <template v-if="Array.isArray(model.repo)">
                <li v-for="(r, rIdx) in model.repo" :key="model.key + '_repo_' + rIdx">
                  <span class="material-symbols-outlined" aria-hidden="true">
                    deployed_code
                  </span>
                  {{ r }}
                </li>
              </template>
              <!-- Handle single repo/filename -->
              <li v-else>
                <span class="material-symbols-outlined" aria-hidden="true">
                  deployed_code
                </span>
                {{ model.filename || model.repo || model.name }}
              </li>
            </template>
          </template>
        </ul>
      </div>
        <button
          class="bz-btn bz-btn--agent-cta fira-sans-condensed-black-italic"
          @click="downloadAllMissingModels"
          :disabled="downloads.active"
        >
          <span class="material-symbols-outlined" aria-hidden="true">download</span>
          Download Now
        </button>
    </div>

    <!-- DOWNLOAD PROGRESS -->
    <div
      v-if="downloads.active"
      class="skill-download-card"
    >
      <div class="skill-download-card__head">
        <span class="skill-download-card__title fira-sans-condensed-black-italic">
          <BonzaiPulse variant="dot" />
          Downloading
        </span>
        <span class="skill-download-card__pct fira-sans-condensed-black-italic">
          {{ Math.round(downloads.total_progress || 0) }}%
        </span>
      </div>
      <BonzaiPulse variant="bar" :percent="downloads.progress || 0" />
      <div v-if="downloadTaskList.length" class="skill-download-scroll">
        <ul class="skill-download-list">
          <li
            v-for="t in downloadTaskList"
            :key="t.task_id"
            class="skill-download-task"
          >
            <div class="skill-download-task__name">
              <span class="material-symbols-outlined" aria-hidden="true">
                deployed_code
              </span>
              {{ t.filename }} —
              <span class="fira-sans-condensed-black-italic">
                {{ t.status }}
              </span>
            </div>
            <div class="skill-download-task__pct fira-sans-condensed-black-italic">
              {{ Math.round(t.progress || 0) }}%
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';
import axios from 'axios';
import { getSkillModelRequirements, MODEL_REQUIREMENTS } from '../../skills/flagship.js';
import BonzaiPulse from '../BonzaiPulse.vue';

const API_BASE =
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  'http://127.0.0.1:65000';

const WS_DL = `${API_BASE}/downloads`;

export default {
  name: 'SkillDownloader',
  components: {
    BonzaiPulse,
  },
  props: {
    skillId: {
      type: String,
      required: true,
    },
  },
  emits: ['ready', 'downloading', 'progress'],
  setup(props, { emit }) {
    // Model availability state
    const modelAvailability = reactive({});
    const modelReadinessDetails = reactive({});
    const modelAvailabilityChecked = ref(false);

    // Downloads state
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
      total_progress: 0,
      status: null,
      pipeline: { tasks: {} },
      wsUrl: null,
    });
    const downloadsSocket = ref(null);
    const lastDlEventAt = ref(0);
    let httpPollTimer = null;

    // Computed: Model requirements for selected skill
    const skillModelRequirements = computed(() => {
      if (!props.skillId) return [];
      return getSkillModelRequirements(props.skillId);
    });

    const hasRequirements = computed(() => {
      return skillModelRequirements.value.length > 0;
    });

    const missingModels = computed(() => {
      return skillModelRequirements.value.filter((model) => !isModelReady(model));
    });

    const hasMissingModels = computed(() => {
      return missingModels.value.length > 0;
    });

    // Download task list computed
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
      arr.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
      return arr;
    });

    // Check if a model is ready/available
    const isModelReady = (model) => {
      if (model.type === 'llm') {
        if (!modelAvailabilityChecked.value) return false;
        return modelAvailability[model.filename] === true;
      }
      if (['diffusion', 'audio', 'video', '3d', 'vision', 'forecast'].includes(model.type)) {
        if (!modelAvailabilityChecked.value) return false;
        return modelAvailability[model.key] === true;
      }
      return true;
    };

    // Pipeline mappings
    const pipelineMap = {
      image_standard: 'image_standard',
      image_turbo: 'image_turbo',
      image_quality: 'image_quality',
      image_advanced: 'image_quality',
      audio: 'audio',
      audio_turbo: 'audio_turbo',
      audio_quality: 'audio_quality_persona',
      video_fast: 'video_fast',
      vision: 'qwen3_vision',
      forecast_quality: 'forecast',
    };

    // Check model availability
    const checkModelAvailability = async () => {
      console.log('[SkillDownloader] Checking model availability for', props.skillId);

      // Check LLM models via electron API
      if (window.electronAPI?.checkModel) {
        const llmModelKeys = ['llm_llama_3_1_8b', 'llm_hermes_4_14b', 'llm_nemomix_12b_heretic'];
        for (const key of llmModelKeys) {
          const model = MODEL_REQUIREMENTS[key];
          if (model?.filename) {
            try {
              const exists = await window.electronAPI.checkModel(model.filename);
              modelAvailability[model.filename] = exists;
            } catch (e) {
              modelAvailability[model.filename] = false;
            }
          }
        }
      }

      // Check Flask server readiness for diffusion/audio/video models
      const port = window.BONZAI_SERVER_PORT || 65000;

      const pipelineChecks = Object.entries(pipelineMap).map(
        async ([modelKey, pipeline]) => {
          try {
            const response = await fetch(`http://localhost:${port}/pipelines/plan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pipeline }),
            });
            const data = await response.json();

            if (data.ok) {
              modelAvailability[modelKey] = true;
              modelReadinessDetails[modelKey] = { repos: [], files: [] };
            } else {
              modelAvailability[modelKey] = false;
              const missingRepos = (data.repos || [])
                .filter((r) => r.ok === false || (Number.isFinite(r.missing) && r.missing > 0))
                .flatMap((r) => Array.isArray(r.repo) ? r.repo : [r.repo]);
              const missingFiles = (data.required_files || [])
                .filter((f) => f.ok === false)
                .map((f) => f.filename);
              modelReadinessDetails[modelKey] = {
                repos: missingRepos,
                files: missingFiles,
              };
            }
          } catch (e) {
            modelAvailability[modelKey] = false;
          }
        }
      );

      await Promise.all(pipelineChecks);
      modelAvailabilityChecked.value = true;

      // Emit ready status
      if (!hasMissingModels.value) {
        emit('ready', true);
      }
    };

    // Download all missing models
    const downloadAllMissingModels = async () => {
      if (missingModels.value.length === 0) return;

      downloads.active = true;
      downloads.progress = 0;
      downloads.total_progress = 0;
      downloads.status = 'starting';
      downloads.pipeline = { tasks: {} };
      emit('downloading', true);

      const port = window.BONZAI_SERVER_PORT || 65000;
      let hasActiveDownload = false;

      for (const model of missingModels.value) {
        try {
          // Handle LLM downloads
          if (model.type === 'llm' && model.filename) {
            console.log(`[SkillDownloader] Downloading LLM: ${model.filename}`);
            hasActiveDownload = true;
            // LLM download logic would go here
            continue;
          }

          // Handle Flask pipeline downloads
          const pipeline = pipelineMap[model.key];
          if (!pipeline) continue;

          const res = await axios.post(`http://localhost:${port}/pipelines/prefetch`, {
            pipeline,
          });

          if (res.status === 202 && res.data?.pipeline_id) {
            hasActiveDownload = true;
            startDownloadTracking(res.data.pipeline_id, res.data.websocket_url || WS_DL);
          } else if (res.status === 200) {
            modelAvailability[model.key] = true;
          }
        } catch (e) {
          console.error(`[SkillDownloader] Failed to download ${model.key}:`, e);
        }
      }

      if (!hasActiveDownload) {
        downloads.status = 'completed';
        downloads.active = false;
        downloads.progress = 100;
        downloads.total_progress = 100;
        await checkModelAvailability();
        emit('downloading', false);
        if (!hasMissingModels.value) {
          emit('ready', true);
        }
      }
    };

    // Start WebSocket tracking for download progress
    const startDownloadTracking = (pipelineId, wsUrl) => {
      downloads.pipelineId = pipelineId;
      downloads.wsUrl = wsUrl;

      // Clean up existing socket
      if (downloadsSocket.value) {
        downloadsSocket.value.disconnect();
        downloadsSocket.value = null;
      }

      // Connect to WebSocket
      const sock = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
      });

      sock.on('connect', () => {
        sock.emit('subscribe', { pipeline_id: pipelineId });
      });

      sock.on('download_progress', handleDownloadProgress);
      sock.on('disconnect', () => {
        if (downloads.status !== 'completed' && downloads.status !== 'failed') {
          startHttpPolling();
        }
      });

      downloadsSocket.value = sock;
      startHttpPolling();
    };

    // Handle download progress events
    const handleDownloadProgress = async (data) => {
      if (data.pipeline_id !== downloads.pipelineId) return;

      lastDlEventAt.value = Date.now();
      downloads.status = data.status;
      downloads.progress = data.progress ?? 0;
      downloads.total_progress = data.total_progress ?? downloads.progress;
      downloads.pipeline = data.pipeline || downloads.pipeline;

      emit('progress', {
        progress: downloads.progress,
        total_progress: downloads.total_progress,
        status: downloads.status,
      });

      if (data.status === 'completed' || data.status === 'failed') {
        downloads.active = false;
        cleanupDownloadTracking();
        await checkModelAvailability();
        emit('downloading', false);
        if (!hasMissingModels.value) {
          emit('ready', true);
        }
      }
    };

    // HTTP polling fallback
    const startHttpPolling = () => {
      if (httpPollTimer) return;

      httpPollTimer = setInterval(async () => {
        if (Date.now() - lastDlEventAt.value < 3000) return;
        if (!downloads.pipelineId) return;

        try {
          const port = window.BONZAI_SERVER_PORT || 65000;
          const res = await axios.get(
            `http://localhost:${port}/pipelines/status/${downloads.pipelineId}`
          );
          if (res.data) {
            handleDownloadProgress({
              pipeline_id: downloads.pipelineId,
              ...res.data,
            });
          }
        } catch (e) {
          // Ignore polling errors
        }
      }, 2000);
    };

    // Cleanup download tracking
    const cleanupDownloadTracking = () => {
      if (httpPollTimer) {
        clearInterval(httpPollTimer);
        httpPollTimer = null;
      }
      if (downloadsSocket.value) {
        downloadsSocket.value.disconnect();
        downloadsSocket.value = null;
      }
    };

    // Watch for skill changes
    watch(
      () => props.skillId,
      () => {
        modelAvailabilityChecked.value = false;
        checkModelAvailability();
      }
    );

    onMounted(() => {
      checkModelAvailability();
    });

    onUnmounted(() => {
      cleanupDownloadTracking();
    });

    return {
      downloads,
      downloadTaskList,
      hasRequirements,
      hasMissingModels,
      missingModels,
      modelReadinessDetails,
      downloadAllMissingModels,
      modelAvailability,
      modelAvailabilityChecked,
      isModelReady,
      checkModelAvailability,
    };
  },
};
</script>

<style scoped>
.skill-downloader {
  width: 100%;
}

.skill-download-card {
  display: grid;
  gap: var(--bz-space-3);
  margin: var(--bz-space-4) 0 var(--bz-space-6);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
}

.skill-download-card--danger {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  border-color: color-mix(in srgb, var(--bz-danger) 42%, var(--bz-border));
  background: var(--bz-danger-soft);
}

.skill-download-card__body {
  display: grid;
  gap: var(--bz-space-2);
  min-width: 0;
}

.skill-download-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}

.skill-download-card__title,
.skill-download-card__pct {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg);
  font-size: 1.1rem;
  line-height: 1;
}

.skill-download-card__pct {
  font-size: 1.45rem;
}

.skill-download-list {
  display: grid;
  gap: var(--bz-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  text-transform: lowercase;
}

.skill-download-list li,
.skill-download-task {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
}

.skill-download-scroll {
  margin-top: var(--bz-space-4);
  max-height: 180px;
  overflow: auto;
}

.skill-download-task {
  justify-content: space-between;
  padding: var(--bz-space-2) 0;
  border-bottom: 1px solid var(--bz-border);
}

.skill-download-task__name {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  min-width: 0;
}

.skill-download-task__pct {
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
}

@media (max-width: 720px) {
  .skill-download-card--danger {
    grid-template-columns: 1fr;
  }
}
</style>
