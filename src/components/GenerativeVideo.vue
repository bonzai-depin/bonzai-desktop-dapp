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
                    movie
                  </span>
                  Generative Video
                </h1>
              </div>
            </div>
          </div>

          <!-- GENERATION PROGRESS -->
          <div
            v-if="generation && generation.active"
            class="generation notification is-info"
            style="margin-bottom: 1rem"
          >
            <p class="mb-2">
              <span class="fira-sans-condensed-black-italic is-size-4">
                <button
                  disabled
                  class="button is-loading is-info is-small mr-2 p-4"
                ></button>
                Generating Media
                <span class="ml-1" v-if="generation.stage">
                  ({{ generation.stage }})
                </span>
              </span>
              <span
                class="fira-sans-condensed-black-italic is-pulled-right is-size-4"
              >
                {{ generationPctRounded }}%
              </span>
            </p>
            <progress
              class="progress is-success"
              :value="generationPctClamped"
              max="100"
            >
              {{ generationPctRounded }}%
            </progress>
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <!-- MODE/QUALITY TOGGLES -->
                <div class="control mb-5 has-text-left">
                  <input
                    v-model="mode"
                    :value="'turbo'"
                    id="mode_speed"
                    type="radio"
                    name="mode"
                    checked
                  />
                  <label for="mode_speed" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      acute
                    </span>
                    Turbo
                  </label>

                  <input
                    v-model="mode"
                    :value="'quality'"
                    id="mode_quality"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_quality" class="radio mr-1">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      high_quality
                    </span>
                    Quality
                  </label>

                  <input
                    v-model="mode"
                    :value="'ltx2'"
                    id="mode_ltx2"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_ltx2" class="radio mr-1">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      auto_awesome
                    </span>
                    LTX-2
                  </label>

                  <span class="control">
                    <input
                      v-model="quality"
                      :value="'sd'"
                      id="mode_quality_sd"
                      type="radio"
                      name="mode_quality"
                      checked
                    />
                    <label for="mode_quality_sd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        sd
                      </span>
                    </label>
                    <input
                      v-model="quality"
                      :value="'hd'"
                      id="mode_quality_hd"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_hd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        hd
                      </span>
                    </label>
                    <input
                      v-model="quality"
                      :value="'fhd'"
                      id="mode_quality_fhd"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_fhd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        full_hd
                      </span>
                    </label>
                  </span>
                </div>

                <!-- READINESS CTA -->
                <div
                  v-if="showUpdateCTA"
                  class="notification is-danger mb-6 mt-6 p-6"
                  style="margin-bottom: 1rem"
                >
                  <p class="mb-2">
                    <strong class="fira-sans-condensed-black-italic is-size-2">
                      Download Required
                    </strong>
                    <span v-if="readiness.missingRepos.length">
                      <ul style="margin-top: 0.5rem; text-transform: lowercase">
                        <li v-for="d in readiness.repoDetails" :key="d.repo">
                          <span
                            class="material-symbols-outlined is-size-3 mr-1"
                          >
                            deployed_code
                          </span>
                          {{ d.repo }}
                        </li>
                      </ul>
                    </span>
                    <span v-if="readiness.missingGguf">
                      <ul style="text-transform: lowercase">
                        <li v-for="gguf in readiness.ggufNames">
                          <span
                            class="material-symbols-outlined is-size-3 mr-1"
                          >
                            deployed_code
                          </span>
                          {{ gguf }}
                        </li>
                      </ul>
                    </span>
                  </p>
                  <hr />
                  <div class="buttons">
                    <button
                      class="button is-warning mr-5 is-large"
                      @click="prefetchForMode"
                      :disabled="downloads.active || readiness.authRequired"
                      title="(Re)download required files"
                    >
                      <span class="material-symbols-outlined mr-1">
                        download
                      </span>
                      Download Now
                    </button>
                  </div>
                </div>

                <!-- GENERATION ERROR -->
                <div
                  v-else-if="generation && generation.error"
                  class="notification is-danger"
                  style="margin-bottom: 1rem"
                >
                  <strong>I wasn't able to generate your video.</strong>
                  Please retry, with different, lower settings or upgrade your
                  hardware.
                </div>
                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads && downloads.active"
                  class="notification is-info p-6"
                  style="margin-bottom: 1.25rem"
                >
                  <p class="mb-2">
                    <span class="fira-sans-condensed-black-italic is-size-4">
                      Downloading
                      <button
                        disabled
                        class="button is-loading is-info is-small mr-2 p-4"
                      ></button>
                    </span>
                    <span
                      class="fira-sans-condensed-black-italic is-pulled-right is-size-1"
                    >
                      {{ Math.round(downloads.total_progress || 0) }}%
                    </span>
                  </p>
                  <progress
                    class="progress is-success is-large"
                    :value="downloads.progress || 0"
                    max="100"
                  >
                    {{ Math.round(downloads.progress || 0) }}%
                  </progress>
                  <div
                    v-if="downloadTaskList.length"
                    style="max-height: 180px; overflow: auto"
                  >
                    <ul>
                      <li
                        v-for="t in downloadTaskList"
                        :key="t.task_id"
                        class="is-size-7 columns"
                      >
                        <div class="column has-text-left">
                          <span class="material-symbols-outlined is-size-6">
                            deployed_code
                          </span>
                          {{ t.filename }} —
                          <span class="fira-sans-condensed-black-italic">
                            {{ t.status }}
                          </span>
                        </div>
                        <div
                          class="column is-2 fira-sans-condensed-black-italic has-text-right"
                        >
                          {{ Math.round(t.progress || 0) }}%
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- IMAGE PICKER + GENERATE -->
                <div class="notification p4 preview">
                  <div class="file is-fullwidth is-medium">
                    <label class="file-label">
                      <input
                        class="file-input"
                        type="file"
                        accept="image/*"
                        @change="onImagePicked"
                      />
                      <span class="file-cta">
                        <span class="file-icon">
                          <span class="material-symbols-outlined">image</span>
                        </span>
                        <span class="file-label">Browse...</span>
                      </span>
                    </label>
                  </div>

                  <div class="mt-4" v-if="imagePreviewUrl">
                    <img
                      :src="imagePreviewUrl"
                      class="preview"
                      alt="preview"
                      style="width: 100%; border-radius: 4px"
                    />
                  </div>
                </div>

                <!-- ACCESS REQUIREMENTS -->
                <AccessRequirements
                  ref="accessRef"
                  level="LVL4"
                  :demo-prompt="DEMO_PROMPT"
                  :is-generating="isLoading"
                  @access-changed="onAccessChanged"
                  @demo-generate="onDemoGenerate"
                />

                <form ref="promptForm" @submit.prevent>
                  <div class="columns">
                    <div class="column is-8">
                      <input
                        class="input is-large"
                        type="text"
                        placeholder="Describe your animation..."
                        v-model="form.prompt"
                        @keyup.enter="canGenerateWithAccess && sendMessage(form.prompt)"
                        :disabled="isLoading || !hasAccess"
                      />
                    </div>
                    <div class="column is-4">
                      <button
                        class="button is-warning is-large pl-2 is-fullwidth"
                        :disabled="isLoading || !hasAnyImage || !hasAccess"
                        @click="sendMessage(form.prompt)"
                        title="Generate video from image"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          animation
                        </span>
                        Animate
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <div class="models__activity--payouts mt-5">
            <div class="columns">
              <!-- RESULTS -->
              <ol class="chat" v-if="inferences && inferences.length">
                <li
                  v-for="(inference, index) in inferences"
                  :key="inference.id || index"
                >
                  <div class="question">
                    <!-- Video Player - UPDATED: Use HTTP streaming URL -->
                    <video
                      v-if="getVideoUrl(inference)"
                      :src="getVideoUrl(inference)"
                      controls
                      style="
                        width: 100vh;
                        border: 1px solid rgba(255, 255, 255, 1);
                        border-radius: 4px;
                      "
                    ></video>
                    <div class="pb-5 mb-5 mt-5">
                      <button
                        class="button is-medium is-success copy is-pulled-right ml-5 mr-0 p-0 pl-1 pr-4"
                        @click="downloadVideo(index)"
                        title="Save video"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-2">
                          save
                        </span>
                        Download
                      </button>
                      <button
                        class="button is-medium is-danger is-pulled-right ml-2 p-0 pl-1 pr-1"
                        @click="removeInference(index)"
                        title="Remove this result"
                      >
                        <span class="material-symbols-outlined is-size-2">
                          delete
                        </span>
                      </button>
                      <button
                        class="button is-medium is-success copy is-pulled-left p-0 pl-1 pr-1"
                        @click="copy(inference?.answer?.data?.video_path || ''); setCopied(index)"
                      >
                        <span
                          class="material-symbols-outlined is-size-2"
                          v-if="!hasCopy[index]"
                        >
                          content_copy
                        </span>
                        <span
                          class="material-symbols-outlined is-size-2"
                          v-else
                        >
                          check
                        </span>
                      </button>
                      <button
                        disabled
                        class="button is-medium is-warning copy is-pulled-left ml-5 pl-2"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          token
                        </span>
                        Mint
                      </button>
                    </div>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  ref,
  reactive,
  shallowRef,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  toRefs,
} from "vue";
import { v4 as uuid } from "uuid";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { io } from "socket.io-client";

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

const rafThrottle = (fn) => {
  let rafId = null;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      fn(...lastArgs);
      rafId = null;
    });
  };
};
import {
  generationStore,
  ensureGenerationSocket,
  startGeneration,
  setBlocked,
  setError,
  stopGeneration,
  clearError,
} from "../stores/generationStore";
import AccessRequirements from "./AccessRequirements.vue";

const DEMO_PROMPT = "A bonsai tree gently swaying in a soft breeze, leaves rustling";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const WS_DL = `${API_BASE}/downloads`;
const WS_GEN = `${API_BASE}/generation`;

export default {
  name: "GenerativeVideo",
  components: { AccessRequirements },
  props: { existingImageBase64: { type: String, default: "" } },
  setup(props) {
    const mode = ref("turbo");
    const quality = ref("sd");
    const isLoading = ref(false);
    const form = reactive({ prompt: "" });
    // Use shallowRef for inferences - video data is large
    const inferences = shallowRef([]);
    const hasCopy = shallowRef([]);
    const planReq = reactive({ controller: null, seq: 0 });

    // Debounced persistence
    const persistInferences = debounce(async (data) => {
      try {
        await window.electronAPI?.store?.set?.("videoInferences", data);
      } catch {}
    }, 500);

    // ------------ access control -----------
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

    const onDemoGenerate = (demoPrompt) => {
      form.prompt = demoPrompt;
      sendMessage(demoPrompt, true); // true = isDemo
    };

    const canGenerateWithAccess = computed(() => hasAccess.value && !isLoading.value);

    const readiness = reactive({
      ok: true,
      missingRepos: [],
      repoDetails: [],
      missingGguf: false,
      ggufName: null,
      notes: [],
      authRequired: false,
      authRepos: [],
    });

    // Use shared generation store for persistent state across view navigation
    const generation = computed(() => generationStore.state.video);

    // Computed properties for progress display (avoid repeated Math.round in template)
    const generationPctRounded = computed(() => Math.round(generation.value?.pct || 0));
    const generationPctClamped = computed(() => Math.max(0, Math.min(100, generation.value?.pct || 0)));

    const showUpdateCTA = computed(
      () =>
        readiness.authRequired ||
        generation.blocked ||
        !readiness.ok ||
        readiness.missingRepos.length > 0 ||
        readiness.missingGguf
    );

    const snap64 = (v) => {
      const m = 64;
      const down = Math.floor(v / m) * m;
      const up = Math.ceil(v / m) * m;
      const candidate = Math.abs(v - down) <= Math.abs(up - v) ? down : up;
      return Math.max(256, Math.min(1024, candidate));
    };

    const toWanFrames = (n) => {
      const k = Math.round((n - 1) / 4);
      return Math.max(5, 1 + 4 * k);
    };

    const endpointForMode = () => {
      if (mode.value === "turbo") return "/image/video/turbo";
      if (mode.value === "ltx2") return "/video/ltx2";
      return "/image/video/quality";
    };
    const pipelineForMode = () => {
      if (mode.value === "turbo") return "ltx_video";
      if (mode.value === "ltx2") return "ltx2_video";
      return "wan_video";
    };

    const normalizeFramesForWan = (frames) => {
      const n = Math.max(5, Number(frames) || 5);
      const k = Math.round((n - 1) / 4);
      return 1 + 4 * k;
    };

    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
      total_progress: 0,
      status: "pending",
      pipeline: { tasks: {} },
      wsUrl: null,
    });
    const downloadsSocket = ref(null);
    const lastDlEventAt = ref(0);
    let httpPollTimer = null;

    const socketOpts = {
      transports: ["polling", "websocket"],
      upgrade: true,
      forceNew: true,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 60,
      reconnectionDelay: 1000,
      path: "/socket.io",
    };

    const mergeTask = (dst, src) => {
      if (!dst) return { ...src };
      const out = { ...dst, ...src };
      if (typeof dst.progress === "number" && typeof src.progress === "number")
        out.progress = Math.max(dst.progress || 0, src.progress || 0);
      if (
        typeof dst.downloaded_size === "number" &&
        typeof src.downloaded_size === "number"
      )
        out.downloaded_size = Math.max(
          dst.downloaded_size,
          src.downloaded_size
        );
      if (
        typeof dst.total_size === "number" &&
        typeof src.total_size === "number"
      )
        out.total_size = Math.max(dst.total_size, src.total_size);
      return out;
    };

    const computeTotalFromTasks = (tasksObj) => {
      const tasks = Object.values(tasksObj || {});
      if (!tasks.length) return 0;
      let totalBytes = 0,
        doneBytes = 0;
      for (const t of tasks) {
        const tot = Number(t.total_size || 0);
        const done = Number(t.downloaded_size || 0);
        if (tot > 0) {
          totalBytes += tot;
          doneBytes += Math.min(done, tot);
        }
      }
      if (totalBytes > 0) return (doneBytes / totalBytes) * 100;
      const sumPct = tasks.reduce((s, t) => s + Number(t.progress || 0), 0);
      return sumPct / tasks.length;
    };

    const applyPipelineUpdate = (p) => {
      if (!p) return;
      downloads.pipelineId = p.pipeline_id || downloads.pipelineId;
      downloads.status = p.status || downloads.status || "downloading";
      const existing = downloads.pipeline?.tasks || {};
      const incoming = p.tasks || {};
      const merged = { ...existing };
      for (const [tid, t] of Object.entries(incoming))
        merged[tid] = mergeTask(existing[tid], t);
      downloads.pipeline = {
        ...(downloads.pipeline || {}),
        ...p,
        tasks: merged,
      };
      const serverPct = Number(p.total_progress ?? 0);
      const tasksPct = computeTotalFromTasks(merged);
      let next =
        Number.isFinite(serverPct) && serverPct > 0 ? serverPct : tasksPct;
      const tasksList = Object.values(merged);
      const anyActive = tasksList.some((t) =>
        ["downloading", "pending"].includes(t.status)
      );
      if (anyActive) next = Math.min(next, 99.9);
      downloads.total_progress = next;
      downloads.progress = next;

      // Safety check: if all tasks are completed but status wasn't updated, force completion
      const allTasksComplete = tasksList.length > 0 && tasksList.every((t) => t.status === "completed");
      if (allTasksComplete && downloads.status === "downloading") {
        console.log("[Downloads] All tasks completed, forcing status to completed");
        downloads.status = "completed";
      }

      downloads.active = !["completed", "failed", "cancelled"].includes(
        downloads.status
      );
    };

    const ensureDownloadsSocket = (base = WS_DL) => {
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      downloads.wsUrl = base;
      downloadsSocket.value = io(base, socketOpts);
      downloadsSocket.value.on("connect", () => {
        if (downloads.pipelineId)
          downloadsSocket.value.emit("subscribe", {
            pipeline_id: downloads.pipelineId,
          });
      });
      // Throttle download_progress events with RAF to avoid excessive re-renders
      const throttledProgressHandler = rafThrottle(({ pipeline }) => {
        lastDlEventAt.value = Date.now();
        if (!pipeline) return;
        applyPipelineUpdate(pipeline);
      });
      downloadsSocket.value.on("download_progress", throttledProgressHandler);
      downloadsSocket.value.on("connect_error", (e) =>
        console.warn("[downloads] connect_error", e?.message || e)
      );
      downloadsSocket.value.on("error", (e) =>
        console.warn("[downloads] error", e)
      );
    };

    const kickHttpPollIfStale = (pipelineId) => {
      if (httpPollTimer) clearInterval(httpPollTimer);
      httpPollTimer = setInterval(async () => {
        const idleMs = Date.now() - lastDlEventAt.value;
        if (idleMs < 1500) return;
        try {
          const { data } = await axios.get(
            `${API_BASE}/downloads/status/${pipelineId}`
          );
          if (data) {
            applyPipelineUpdate(data);
            if (!downloads.active) {
              clearInterval(httpPollTimer);
              httpPollTimer = null;
            }
          }
        } catch {
          clearInterval(httpPollTimer);
          httpPollTimer = null;
        }
      }, 1000);
    };

    const connectAndSubscribe = (pipelineId, websocketUrl) => {
      if (!pipelineId) return;
      ensureDownloadsSocket(websocketUrl || WS_DL);
      downloads.active = true;
      downloads.pipelineId = pipelineId;
      downloads.status = downloads.status || "downloading";
      try {
        downloadsSocket.value.emit("subscribe", { pipeline_id: pipelineId });
      } catch {}
      kickHttpPollIfStale(pipelineId);
    };

    const startDownloadTracking = (pipelineId, websocketUrl) => {
      connectAndSubscribe(pipelineId, websocketUrl);
      const t = setInterval(async () => {
        if (!downloads.active && downloads.status !== "failed") {
          clearInterval(t);
          await probeCurrentMode();
        }
        if (downloads.status === "failed") clearInterval(t);
      }, 1000);
    };

    const resumeActiveDownloadIfAny = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/downloads/list`);
        const active = (data?.pipelines || []).filter((p) =>
          ["pending", "downloading", "retrying", "waiting_retry"].includes(
            p.status
          )
        );
        if (!active.length) return;
        ensureDownloadsSocket();
        active.forEach((pl) => connectAndSubscribe(pl.pipeline_id));
      } catch {}
    };

    const cancelCurrentPipeline = async () => {
      if (!downloads.pipelineId) return;
      try {
        const { data, status } = await axios.post(
          `${API_BASE}/downloads/cancel/${downloads.pipelineId}`,
          {},
          { validateStatus: () => true }
        );
        if (status === 200) {
          downloads.status = "cancelled";
          downloads.active = false;
        }
      } catch {}
    };

    const retryCurrentPipeline = async () => {
      if (!downloads.pipelineId) return;
      try {
        const { data, status } = await axios.post(
          `${API_BASE}/downloads/retry/${downloads.pipelineId}`,
          {},
          { validateStatus: () => true }
        );
        if (status === 202 && data?.pipeline_id)
          startDownloadTracking(
            data.pipeline_id,
            data.websocket_url || downloads.wsUrl || WS_DL
          );
      } catch {}
    };

    const applyPlanToReadiness = (data) => {
      const repos = Array.isArray(data?.repos) ? data.repos : [];
      const incompleteRepos = repos.filter(
        (r) =>
          r && (r.ok === false || (Number.isFinite(r.missing) && r.missing > 0))
      );
      readiness.missingRepos = [
        ...new Set(incompleteRepos.map((r) => r.repo).filter(Boolean)),
      ];
      readiness.repoDetails = incompleteRepos.map((r) => ({
        repo: r.repo,
        missing: Number.isFinite(r.missing) ? r.missing : null,
        root: r.root || null,
      }));
      const ggufs = Array.isArray(data?.gguf_status) ? data.gguf_status : [];
      const missingGgufs = ggufs.filter((g) => g && g.configured && !g.exists);
      readiness.missingGguf = missingGgufs.length > 0;
      readiness.ggufNames = missingGgufs.map((g) =>
        (g.path || g.name || "").split("/").pop()
      );
      readiness.authRequired = !!data?.auth_required;
      readiness.authRepos = Array.isArray(data?.auth_repos)
        ? data.auth_repos
        : [];
      readiness.notes = Array.isArray(data?.notes) ? data.notes : [];
      const serverOk = !!data?.ok;
      readiness.ok =
        serverOk &&
        !readiness.authRequired &&
        readiness.missingRepos.length === 0 &&
        !readiness.missingGguf;

      // If files are still missing after a "completed" download, reset download state
      // This prevents showing 100% progress when work is actually needed
      if (!readiness.ok && downloads.status === "completed") {
        downloads.status = "pending";
        downloads.progress = 0;
        downloads.total_progress = 0;
        downloads.active = false;
        downloads.pipeline = { tasks: {} };
      }
    };

    const apply403ToReadiness = (res) => {
      readiness.authRequired = true;
      readiness.ok = false;
      readiness.notes = [];
      readiness.authRepos = [];
      if (Array.isArray(res?.data?.repos)) {
        for (const r of res.data.repos) {
          if (r?.repo) readiness.authRepos.push(r.repo);
          if (r?.hint) readiness.notes.push(r.hint);
          if (r?.error && !r?.hint) readiness.notes.push(r.error);
        }
      }
      if (res?.data?.hint) readiness.notes.push(res.data.hint);
      setBlocked("video", true);
    };

    const apply409ToReadiness = (res) => {
      readiness.ok = false;
      setBlocked("video", true);
      const rs = res?.data?.repo_status;
      if (rs?.repo) {
        const missingCount = Array.isArray(rs?.missing)
          ? rs.missing.length
          : typeof rs?.missing === "number"
            ? rs.missing
            : 1;
        const exists = typeof rs?.exists === "boolean" ? rs.exists : true;
        const entry = {
          repo: rs.repo,
          missing: Math.max(1, missingCount),
          root: rs.root || null,
        };
        const idx = readiness.repoDetails.findIndex((x) => x.repo === rs.repo);
        if (idx >= 0) readiness.repoDetails[idx] = entry;
        else readiness.repoDetails.push(entry);
        if (!exists)
          readiness.notes.push(`${rs.repo}: repository not found locally`);
      }
      const hint = res?.data?.hint;
      if (hint) readiness.notes.push(hint);
    };

    // Cache key for plan results
    const getPlanCacheKey = (pipeline) => `planCache_video_${pipeline}`;

    // Load cached plan result
    const loadCachedPlan = async (pipeline) => {
      try {
        const key = getPlanCacheKey(pipeline);
        const cached = await window.electronAPI?.store?.get?.(key, null);
        if (cached && cached.timestamp) {
          // Cache is valid for 24 hours
          const age = Date.now() - cached.timestamp;
          if (age < 24 * 60 * 60 * 1000) {
            return cached.data;
          }
        }
      } catch {}
      return null;
    };

    // Save plan result to cache
    const savePlanToCache = async (pipeline, data) => {
      try {
        const key = getPlanCacheKey(pipeline);
        await window.electronAPI?.store?.set?.(key, {
          timestamp: Date.now(),
          data,
        });
      } catch {}
    };

    const probeCurrentMode = async () => {
      readiness.ok = true;
      readiness.missingRepos = [];
      readiness.repoDetails = [];
      readiness.missingGguf = false;
      readiness.ggufName = null;
      readiness.notes = [];
      readiness.authRequired = false;
      readiness.authRepos = [];
      setBlocked("video", false);
      const pipeline = pipelineForMode();
      try {
        planReq.controller?.abort();
      } catch {}
      const controller = new AbortController();
      planReq.controller = controller;
      const mySeq = ++planReq.seq;
      try {
        const { data, status } = await axios.post(
          `${API_BASE}/pipelines/plan`,
          { pipeline, deep_validate: true },
          { signal: controller.signal, validateStatus: () => true, timeout: 10000 }
        );
        if (mySeq !== planReq.seq) return;
        if (status >= 200 && status < 300) {
          applyPlanToReadiness(data);
          // Cache successful result for offline mode
          await savePlanToCache(pipeline, data);
        } else {
          readiness.ok = false;
          readiness.notes = [`Planner returned HTTP ${status}.`];
        }
      } catch (e) {
        const aborted =
          e?.code === "ERR_CANCELED" ||
          e?.name === "CanceledError" ||
          e?.message === "canceled";
        if (!aborted) {
          // Try to use cached plan for offline mode
          const cachedPlan = await loadCachedPlan(pipeline);
          if (cachedPlan && cachedPlan.ok) {
            applyPlanToReadiness(cachedPlan);
            readiness.notes.push("Using cached status (offline mode)");
          } else {
            readiness.ok = false;
            readiness.notes = [e?.message || "Network error while planning"];
          }
        }
      } finally {
        if (planReq.controller === controller) planReq.controller = null;
      }
    };

    const prefetchForMode = async () => {
      const pipeline = pipelineForMode();
      try {
        const res = await axios.post(
          `${API_BASE}/pipelines/prefetch`,
          { pipeline, deep_validate: true },
          { validateStatus: () => true }
        );
        if (res.status === 202) {
          const started = Array.isArray(res.data?.pipelines_started)
            ? res.data.pipelines_started
            : [];
          const pid =
            started[started.length - 1] || res.data?.pipeline_id || null;
          const ws =
            res.data?.download_websocket_url ||
            res.data?.websocket_url ||
            WS_DL;
          if (pid) startDownloadTracking(pid, ws);
          return;
        }
        if (res.status >= 200 && res.status < 300) {
          await probeCurrentMode();
          return;
        }
        if (res.status === 403) return apply403ToReadiness(res);
        if (res.status === 409) {
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }
        setError("video", res?.data?.error || `Prefetch failed (${res.status})`);
      } catch (e) {
        setError("video", e?.message || "Network error");
      }
    };

    // Socket is managed by the shared generationStore

    const requestWithDownloadTracking = async (url, payload, onSuccess) => {
      try {
        isLoading.value = true;
        const res = await axios.post(url, payload, {
          validateStatus: () => true,
        });
        if (res.status === 202) {
          const pid =
            res.data?.pipeline_id ||
            (Array.isArray(res.data?.pipelines_started) &&
              res.data.pipelines_started.slice(-1)[0]) ||
            null;
          const ws =
            res.data?.download_websocket_url ||
            res.data?.websocket_url ||
            WS_DL;
          if (pid) startDownloadTracking(pid, ws);
          return;
        }
        if (res.status >= 200 && res.status < 300) {
          setBlocked("video", false);
          await onSuccess(res);
          return;
        }
        if (res.status === 403) return apply403ToReadiness(res);
        if (res.status === 409) {
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }
        setError("video", res?.data?.error || `Request failed (${res.status})`);
      } catch (err) {
        setError("video", err?.message || "Network error");
      } finally {
        isLoading.value = false;
      }
    };

    const pickedImageName = ref("");
    const uploadedImageBase64 = ref("");
    const imagePreviewUrl = computed(() => {
      if (uploadedImageBase64.value)
        return "data:image/png;base64," + uploadedImageBase64.value;
      if (props.existingImageBase64)
        return "data:image/png;base64," + props.existingImageBase64;
      return "";
    });
    const hasAnyImage = computed(
      () => !!(uploadedImageBase64.value || props.existingImageBase64)
    );

    const onImagePicked = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      pickedImageName.value = file.name;
      const b64 = await fileToBase64(file);
      uploadedImageBase64.value = String(b64).replace(
        /^data:image\/[a-zA-Z+]+;base64,/,
        ""
      );
    };
    const fileToBase64 = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

    const sendMessage = async (prompt, isDemo = false) => {
      if (!prompt) return;
      if (!hasAnyImage.value) return;
      // Allow demo generation even without access
      if (!isDemo && !hasAccess.value) return;

      const sizeMaps = {
        turbo: { sd: [480, 640], hd: [480, 832], fhd: [768, 1280] },
        quality: { sd: [480, 640], hd: [480, 832], fhd: [1024, 1728] },
        ltx2: { sd: [512, 768], hd: [576, 1024], fhd: [768, 1280] },
      };
      const pick = sizeMaps[mode.value] || sizeMaps.turbo;
      const [h, w] = pick[quality.value] || pick.sd;
      let frames = mode.value === "turbo" ? 96 : mode.value === "ltx2" ? 97 : 41;
      let payload;
      if (mode.value === "quality") {
        frames = normalizeFramesForWan(frames);
        payload = {
          prompt: actualPrompt,
          height: h,
          width: w,
          frames: Math.min(frames, 81),
          fps: 8,
          steps: 10,
          guidance_scale: 3,
          auto_download: true,
          image_base64:
            uploadedImageBase64.value ||
            (props.existingImageBase64 || "").trim(),
        };
      } else if (mode.value === "ltx2") {
        // LTX-2: Fast distilled model with FP8 quantization
        // Frames must be (n*8)+1 for LTX-2
        frames = ((frames - 1) >> 3) * 8 + 1;
        payload = {
          prompt: actualPrompt,
          height: h,
          width: w,
          frames: frames,
          fps: 24,
          steps: 8, // Distilled model uses 4-10 steps
          guidance_scale: 1.0, // Distilled uses guidance 1.0
          use_fp8: true, // Enable FP8 quantization (CUDA only)
          enable_memory_offloading: true,
          auto_download: true,
          negative_prompt:
            "worst quality, inconsistent motion, blurry, jittery, distorted, " +
            "deformed, bad anatomy, extra limbs, low resolution, watermark",
          image_base64:
            uploadedImageBase64.value ||
            (props.existingImageBase64 || "").trim(),
        };
      } else {
        payload = {
          prompt: actualPrompt,
          height: h,
          width: w,
          frames: frames,
          fps: 24,
          steps: 100,
          guidance_scale: 5.0,
          max_sequence_length: 512,
          seed: 42,
          negative_prompt: `deformed face, ugly face, bad face, mutated face, disfigured face,
    "deformed limbs, extra limbs, missing limbs, bad hands, extra fingers,
    "fused fingers, bad anatomy, mutation, blurry, low quality, worst quality,
    "poorly drawn, amateur, distorted body, wrong proportions`,
          enable_memory_offloading: true,
          auto_download: true,
          image_base64:
            uploadedImageBase64.value ||
            (props.existingImageBase64 || "").trim(),
        };
      }
      const url = `${API_BASE}${endpointForMode()}`;
      ensureGenerationSocket();
      startGeneration("video"); // Initialize generation state
      const onSuccess = async (response) => {
        // UPDATED: Check for video_url OR video_path
        if (response?.data?.video_path || response?.data?.video_url) {
          // Update shallowRef by replacing array
          const newInference = {
            question: `${mode.value}-i2v`,
            answer: response,
            id: uuid(),
          };
          inferences.value = [...inferences.value, newInference];
          hasCopy.value = [...hasCopy.value, false];
          // Debounced persistence
          persistInferences([...inferences.value]);
        }
      };
      await requestWithDownloadTracking(url, payload, onSuccess);
    };

    const { toClipboard } = useClipboard();
    const copy = async (txt) => {
      try {
        await toClipboard(txt);
      } catch {}
    };

    // Get video URL - use streaming endpoint for local files
    const getVideoUrl = (inference) => {
      const data = inference?.answer?.data;
      if (!data) return "";
      // Prefer HTTP streaming URL if already provided
      if (data.video_url) return data.video_url;
      // Use streaming endpoint for local file paths
      if (data.video_path) {
        if (/^https?:\/\//i.test(data.video_path)) return data.video_path;
        // Use the streaming endpoint for local files
        return `${API_BASE}/media/stream?path=${encodeURIComponent(data.video_path)}`;
      }
      return "";
    };

    // Convert local path to streaming URL
    const fileUrl = (p) => {
      if (!p) return "";
      if (/^https?:\/\//i.test(p)) return p;
      return `${API_BASE}/media/stream?path=${encodeURIComponent(p)}`;
    };

    const downloadVideo = async (idx) => {
      const data = inferences[idx]?.answer?.data;
      if (!data) return;
      const path = data.video_path;
      if (!path) return;
      const defaultName =
        path.split("/").pop() || `bonzai-video-${Date.now()}.mp4`;
      const result = await window.electronAPI?.saveVideo?.(defaultName, path);
      if (!result?.success)
        console.error("Save cancelled or failed", result?.error);
    };

    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.value.length) return;
      // Update shallowRef by replacing arrays
      inferences.value = inferences.value.filter((_, i) => i !== idx);
      hasCopy.value = hasCopy.value.filter((_, i) => i !== idx);
      // Debounced persistence
      persistInferences([...inferences.value]);
    };

    // Set copy state for an index (works with shallowRef)
    const setCopied = (index) => {
      const newHasCopy = [...hasCopy.value];
      newHasCopy[index] = true;
      hasCopy.value = newHasCopy;
      setTimeout(() => {
        const reset = [...hasCopy.value];
        reset[index] = false;
        hasCopy.value = reset;
      }, 2000);
    };

    const loadHistory = async () => {
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "videoInferences",
          []
        );
        if (Array.isArray(saved)) {
          inferences.value = saved;
          hasCopy.value = new Array(saved.length).fill(false);
        }
      } catch {}
    };

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
      return arr
        .map((t) => ({ ...t }))
        .sort((a, b) => {
          const sa = order[a.status] ?? 99;
          const sb = order[b.status] ?? 99;
          if (sa !== sb) return sa - sb;
          return (b.progress || 0) - (a.progress || 0);
        });
    });

    onMounted(async () => {
      ensureGenerationSocket();
      await resumeActiveDownloadIfAny();
      await loadHistory();
      await probeCurrentMode();
    });

    onBeforeUnmount(() => {
      if (downloadsSocket.value?.connected) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      if (httpPollTimer) {
        clearInterval(httpPollTimer);
        httpPollTimer = null;
      }
      // Note: generation socket is shared and managed by generationStore
    });

    watch(
      mode,
      () => {
        probeCurrentMode();
      },
      { immediate: true }
    );

    return {
      mode,
      quality,
      form,
      isLoading,
      inferences,
      hasCopy,
      readiness,
      showUpdateCTA,
      generation,
      generationPctRounded,
      generationPctClamped,
      downloads,
      downloadTaskList,
      onImagePicked,
      pickedImageName,
      hasAnyImage,
      imagePreviewUrl,
      // access control
      accessRef,
      hasAccess,
      canGenerateWithAccess,
      onAccessChanged,
      onDemoGenerate,
      DEMO_PROMPT,
      // actions
      sendMessage,
      copy,
      setCopied,
      downloadVideo,
      removeInference,
      prefetchForMode,
      cancelCurrentPipeline,
      retryCurrentPipeline,
      probeCurrentMode,
      fileUrl,
      getVideoUrl,
    };
  },
};
</script>

<style scoped>
/* Fonts imported from App.vue for offline mode */
.generation {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1;
  opacity: 0.9;
}
.notification {
  padding: 1.25rem 1.5rem 1.25rem 1.5rem;
}
.preview {
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
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
.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: url("src/assets/bonzai_video.jpg") no-repeat;
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
  background: rgba(0, 0, 0, 0.5);
}
.models__activity--payouts {
  padding: 4em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}
h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: #fff;
  text-align: right;
}
p {
  margin-bottom: 1em;
  font-size: 24px;
  color: #fff;
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transform: translate3d(0, 0, 0);
}
div.question {
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 1em 1em 2em;
  margin-top: 2em !important;
  margin-bottom: 1em !important;
  font-weight: 700;
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  border-radius: 4px;
  backdrop-filter: blur(6px);
}
hr {
  margin: 12px 0;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.015);
}
.input {
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
  bottom: 14px;
  border: none !important;
  box-shadow: none !important;
}
.is-loading {
  text-shadow: none !important;
}
input[type="radio"] {
  display: none;
}
input[type="radio"] + label {
  padding: 3px 12px 9px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}
input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}
label.radio.quality {
  margin: 0 3px;
  padding: 3px 6px 0;
}
ul,
ol {
  padding: 0;
  list-style-type: none;
}
ol.chat {
  display: flex;
  flex-direction: column-reverse;
}
ol.chat li {
  position: relative;
}
.retry {
  position: absolute;
  top: -3em;
  right: 2.75em;
  opacity: 0.5;
}
.retry:hover,
.cancel:hover {
  box-shadow: none;
  opacity: 1;
}
.cancel {
  position: absolute;
  top: -3em;
  right: -1.25em;
  opacity: 0.5;
}
</style>
