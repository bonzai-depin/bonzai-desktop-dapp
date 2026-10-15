<template>
  <DownloadRequirement
    v-if="(modelAvailabilityChecked && hasRequirements && hasMissingModels) || downloads.active"
    :items="missingDownloadItems"
    :active="downloads.active"
    cancellable
    :cancelling="isCancellingDownloads"
    @cancel="cancelActiveDownloads"
    :progress="downloads.total_progress || downloads.progress || 0"
    :tasks="downloadTaskList"
    :error="downloads.status === 'failed' ? $t('rcDownloads.downloadFailed') : ''"
    @download="downloadAllMissingModels"
  />
</template>

<script>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';
import axios from 'axios';
import { getSkillModelRequirements, MODEL_REQUIREMENTS } from '../../skills/flagship.js';
import { cancelLocalDownloads } from '../../services/downloadCancellation.js';
import DownloadRequirement from '../DownloadRequirement.vue';

const API_BASE =
  (typeof process !== 'undefined' && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  'http://127.0.0.1:65000';

const WS_DL = `${API_BASE}/downloads`;

export default {
  name: 'SkillDownloader',
  components: {
    DownloadRequirement,
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

    const missingDownloadItems = computed(() => missingModels.value.flatMap(model => {
      const details = modelReadinessDetails[model.key];
      const files = [...(details?.repos || []), ...(details?.files || [])];
      const entries = files.length ? files : Array.isArray(model.repo) ? model.repo : [model.filename || model.repo || model.name];
      return entries.map(entry => ({ ...(typeof entry === 'string' ? { name: entry } : entry), category: model.type }));
    }));

    const hasMissingModels = computed(() => {
      return missingModels.value.length > 0;
    });

    // Download task list computed
    const downloadTaskList = computed(() => {
      const tasks = downloads.pipeline?.tasks || {};
      const arr = Object.values(tasks).map(task => ({ ...task, pipeline: task.pipeline || downloads.pipeline?.pipeline_name }));
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
      video_sota: 'video_sota',
      video_quality: 'video_quality',
      vision: 'vision',
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
      if (downloads.active || isCancellingDownloads.value) return;
      const run = ++downloadRun;
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
        if (run !== downloadRun) return;
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
            if (run !== downloadRun) {
              cancelledPipelines.add(res.data.pipeline_id);
              await cancelLocalDownloads({ pipelineIds: [res.data.pipeline_id], apiBase: API_BASE });
              return;
            }
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

    const isCancellingDownloads = ref(false);
    let downloadRun = 0;
    const trackedPipelines = new Set();
    const cancelledPipelines = new Set();
    const cancelActiveDownloads = async () => {
      isCancellingDownloads.value = true;
      downloadRun++;
      try {
        await cancelLocalDownloads({ pipelineIds: [...trackedPipelines], apiBase: API_BASE });
        for (const id of trackedPipelines) cancelledPipelines.add(id);
        trackedPipelines.clear();
        downloads.status = 'cancelled';
        downloads.active = false;
        cleanupDownloadTracking();
        emit('downloading', false);
        await checkModelAvailability();
      } catch { downloads.status = 'failed'; }
      finally { isCancellingDownloads.value = false; }
    };

    // Start WebSocket tracking for download progress
    const startDownloadTracking = (pipelineId, wsUrl) => {
      trackedPipelines.add(pipelineId);
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
        if (!['completed', 'failed', 'cancelled'].includes(downloads.status)) {
          startHttpPolling();
        }
      });

      downloadsSocket.value = sock;
      startHttpPolling();
    };

    // Handle download progress events
    const handleDownloadProgress = async (data) => {
      if (downloads.status === 'cancelled' || isCancellingDownloads.value || cancelledPipelines.has(data?.pipeline_id)) return;
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
      missingDownloadItems,
      cancelActiveDownloads,
      isCancellingDownloads,
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
