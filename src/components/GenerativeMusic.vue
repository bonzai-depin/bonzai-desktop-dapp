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
                    headphones
                  </span>
                  Generative Music
                </h1>
              </div>
            </div>
          </div>

          <!-- GENERATION PROGRESS -->
          <div
            v-if="generation.active"
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
                {{ Math.round(generation.pct) }}%
              </span>
            </p>
            <progress
              class="progress is-success"
              :value="Math.max(0, Math.min(100, generation.pct))"
              max="100"
            >
              {{ Math.round(generation.pct) }}%
            </progress>
          </div>

          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <!-- MODE/QUALITY TOGGLES (kept for consistency; 'quality' may map to duration/bitrate on server) -->
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
                  class="notification is-danger mb-6 mt-6"
                  style="margin-bottom: 1rem"
                >
                  <p class="mb-2">
                    <strong class="fira-sans-condensed-black-italic">
                      Model Download Required
                    </strong>
                    <span v-if="readiness.missingRepos.length">
                      <ul style="margin-top: 0.5rem">
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
                      <span class="material-symbols-outlined is-size-3 mr-1">
                        deployed_code
                      </span>
                      {{ readiness.ggufName || "Unknown (server-configured)" }}
                    </span>
                    <span v-if="readiness.notes.length">
                      <br />
                      Notes:
                      <ul style="margin-top: 0.5rem">
                        <li v-for="(n, i) in readiness.notes" :key="i">
                          • {{ n }}
                        </li>
                      </ul>
                    </span>
                  </p>
                  <hr />
                  <div class="buttons">
                    <button
                      class="button is-warning mr-5"
                      @click="prefetchForMode"
                      :disabled="downloads.active || readiness.authRequired"
                    >
                      <span class="material-symbols-outlined mr-1">
                        download
                      </span>
                      Download Now
                    </button>
                    <button
                      class="button is-info"
                      @click="probeCurrentMode"
                      :disabled="downloads.active"
                    >
                      <span class="material-symbols-outlined mr-1">
                        refresh
                      </span>
                      Refresh
                    </button>
                  </div>
                </div>

                <!-- GENERATION ERROR -->
                <div
                  v-else-if="generation.error"
                  class="notification is-danger"
                  style="margin-bottom: 1rem"
                >
                  <strong>Generation failed:</strong>
                  {{ generation.error }}
                </div>

                <!-- DOWNLOAD PROGRESS -->
                <div
                  v-if="downloads.active"
                  class="notification is-info"
                  style="margin-bottom: 1.25rem"
                >
                  <p class="mb-2">
                    <span class="fira-sans-condensed-black-italic is-size-4">
                      Model Download in Progress
                      <button
                        disabled
                        class="button is-loading is-info is-small mr-2 p-4"
                      ></button>
                    </span>
                    <span
                      class="fira-sans-condensed-black-italic is-pulled-right is-size-1"
                    >
                      {{ Math.round(downloads.progress || 0) }}%
                      <button
                        class="button is-small is-warning mr-4 retry p-1"
                        @click="retryCurrentPipeline"
                        :disabled="
                          !downloads.pipelineId ||
                          downloads.status === 'completed'
                        "
                      >
                        <span class="material-symbols-outlined">
                          restart_alt
                        </span>
                      </button>
                      <button
                        class="button is-small is-danger mr-4 cancel p-1"
                        @click="cancelCurrentPipeline"
                        :disabled="
                          !downloads.pipelineId ||
                          downloads.status === 'completed'
                        "
                      >
                        <span class="material-symbols-outlined">cancel</span>
                      </button>
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

                <!-- PROMPT -->
                <form ref="promptForm" @submit.prevent>
                  <input
                    class="input is-large is-fullwidth"
                    type="text"
                    placeholder="Describe your music and press enter to generate..."
                    v-model="form.prompt"
                    @keyup.enter="sendMessage(form.prompt)"
                    :disabled="isLoading"
                  />
                  <button
                    class="button chat is-loading is-outlined is-info is-large is-fullwidth"
                    v-if="isLoading"
                  ></button>
                </form>

                <!-- RESULTS -->
                <ol class="chat" v-if="inferences.length">
                  <li
                    v-for="(inference, index) in inferences"
                    :key="inference.id || index"
                  >
                    <div class="question">
                      <audio
                        v-if="
                          inference?.answer?.data?.audio_path ||
                          inference?.answer?.data?.music_path
                        "
                        :src="
                          fileUrl(
                            inference.answer.data.audio_path ||
                              inference.answer.data.music_path
                          )
                        "
                        controls
                        style="width: 100%"
                      ></audio>
                      <hr />
                      <button
                        class="button is-medium is-success copy is-pulled-right ml-5 mr-0 p-0 pl-1 pr-1"
                        @click="downloadAudio(index)"
                        title="Save audio"
                      >
                        <span class="material-symbols-outlined is-size-2">
                          save
                        </span>
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
                        @click="copy(inference.question)"
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
                  </li>
                </ol>
              </div>
            </div>
          </div>

          <div class="models__activity--payouts mt-5">
            <div class="columns">
              <h1 class="column is-12 has-text-centered">
                <span
                  class="material-symbols-outlined p-0 m-5"
                  style="font-size: 92px !important"
                >
                  headphones
                </span>
              </h1>
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
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { v4 as uuid } from "uuid";
import useClipboard from "vue-clipboard3";
import axios from "axios";
import { io } from "socket.io-client";

const API_BASE = "http://127.0.0.1:65000";
const WS_DL = `${API_BASE}/downloads`;
const WS_GEN = `${API_BASE}/generation`;

export default {
  name: "GenerativeMusic",
  setup() {
    // ------------ basic state -------------
    const mode = ref("turbo");
    const quality = ref("sd");
    const isLoading = ref(false);
    const form = reactive({ prompt: "" });
    const inferences = reactive([]);
    const hasCopy = reactive([]);

    // ------------ readiness ---------------
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

    const showUpdateCTA = computed(
      () =>
        readiness.authRequired ||
        generation.blocked ||
        !readiness.ok ||
        readiness.missingRepos.length > 0 ||
        readiness.missingGguf
    );

    // ------------ generation --------------
    const generation = reactive({
      active: false,
      id: null,
      pct: 0,
      stage: "starting",
      error: null,
      blocked: false,
    });

    // ------------ pipeline/endpoint maps --
    // If your server uses a different path or pipeline key, tweak these two lines:
    const endpointForMode = () => "/audio/music";
    const pipelineForMode = () => "musicgen";

    // ------------ downloads state/socket --
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
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

    const applyPipelineUpdate = (p) => {
      if (!p) return;
      downloads.pipelineId = p.pipeline_id || downloads.pipelineId;
      downloads.status = p.status || downloads.status || "downloading";
      const nextPct = Number(p.total_progress || 0);
      downloads.progress = Math.max(Number(downloads.progress || 0), nextPct);

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
      downloadsSocket.value.on("download_progress", ({ pipeline }) => {
        lastDlEventAt.value = Date.now();
        if (!pipeline) return;
        applyPipelineUpdate(pipeline);
      });
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
        await axios.post(
          `${API_BASE}/downloads/cancel/${downloads.pipelineId}`
        );
      } catch {}
    };
    const retryCurrentPipeline = async () => {
      if (!downloads.pipelineId) return;
      try {
        await axios.post(`${API_BASE}/downloads/retry/${downloads.pipelineId}`);
      } catch {}
    };

    // ------------ readiness helpers -------
    const applyPlanToReadiness = (data) => {
      const repos = Array.isArray(data?.repos) ? data.repos : [];
      const incomplete = repos.filter(
        (r) =>
          r && (r.ok === false || (Number.isFinite(r.missing) && r.missing > 0))
      );
      readiness.missingRepos = [
        ...new Set(incomplete.map((r) => r.repo).filter(Boolean)),
      ];
      readiness.repoDetails = incomplete.map((r) => ({
        repo: r.repo,
        missing: Number.isFinite(r.missing) ? r.missing : null,
        root: r.root || null,
      }));
      const ggufs = Array.isArray(data?.gguf_status) ? data.gguf_status : [];
      const missG = ggufs.find((g) => g && g.configured && !g.exists);
      readiness.missingGguf = !!missG;
      readiness.ggufName = missG
        ? (missG.path || missG.name || "").split("/").pop()
        : null;
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
      generation.blocked = true;
    };

    const apply409ToReadiness = (res) => {
      readiness.ok = false;
      generation.blocked = true;
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

    const probeCurrentMode = async () => {
      readiness.ok = true;
      readiness.missingRepos = [];
      readiness.repoDetails = [];
      readiness.missingGguf = false;
      readiness.ggufName = null;
      readiness.notes = [];
      readiness.authRequired = false;
      readiness.authRepos = [];
      generation.blocked = false;

      const pipeline = pipelineForMode();

      try {
        const { data, status } = await axios.post(
          `${API_BASE}/pipelines/plan`,
          { pipeline, deep_validate: true },
          { validateStatus: () => true }
        );
        if (status >= 200 && status < 300) applyPlanToReadiness(data);
        else {
          readiness.ok = false;
          readiness.notes = [`Planner returned HTTP ${status}.`];
        }
      } catch (e) {
        readiness.ok = false;
        readiness.notes = [e?.message || "Network error while planning"];
      }
    };

    // ------------ CTA action --------------
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

        generation.error =
          res?.data?.error || `Prefetch failed (${res.status})`;
      } catch (e) {
        generation.error = e?.message || "Network error";
      }
    };

    // ------------ generation socket -------
    const genSocket = ref(null);
    const ensureGenerationSocket = (base = WS_GEN) => {
      if (genSocket.value && genSocket.value.connected) return;
      genSocket.value = io(base, socketOpts);
      genSocket.value.on("gen_started", ({ generation_id }) => {
        Object.assign(generation, {
          id: generation_id,
          active: true,
          error: null,
          stage: "starting",
          pct: 0,
        });
      });
      genSocket.value.on(
        "gen_progress",
        ({ generation_id, stage, step, total, pct }) => {
          if (generation.id && generation_id && generation_id !== generation.id)
            return;
          generation.stage = stage || generation.stage;
          if (typeof pct === "number")
            generation.pct = Math.max(generation.pct, pct);
          else if (total)
            generation.pct = Math.max(
              generation.pct,
              (Number(step) / Number(total)) * 100
            );
          if (!generation.active) generation.active = true;
        }
      );
      genSocket.value.on("gen_finished", ({ generation_id }) => {
        if (generation.id && generation_id && generation_id !== generation.id)
          return;
        generation.pct = 100;
        generation.stage = "finished";
        generation.active = false;
      });
      genSocket.value.on("gen_error", ({ generation_id, error }) => {
        if (generation.id && generation_id && generation_id !== generation.id)
          return;
        generation.error = error || "Unknown error";
        generation.stage = "error";
        generation.active = false;
      });
    };

    // ------------ request wrapper ---------
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
          generation.blocked = false;
          await onSuccess(res);
          return;
        }

        if (res.status === 403) return apply403ToReadiness(res);
        if (res.status === 409) {
          apply409ToReadiness(res);
          await probeCurrentMode();
          return;
        }

        generation.error = res?.data?.error || `Request failed (${res.status})`;
        generation.active = false;
      } catch (err) {
        generation.error = err?.message || "Network error";
        generation.active = false;
      } finally {
        isLoading.value = false;
      }
    };

    // ------------ actions -----------------
    const sendMessage = async (prompt) => {
      if (!prompt) return;

      // Map UI 'quality' to duration/bitrate presets (adjust to your backend contract)
      const durationByQuality = { sd: 7, hd: 15, fhd: 30 };
      const duration = durationByQuality[quality.value] || durationByQuality.sd;

      const payload = {
        prompt,
        duration_sec: duration,
        auto_download: true,
      };

      const url = `${API_BASE}${endpointForMode()}`;

      ensureGenerationSocket();
      Object.assign(generation, {
        active: true,
        stage: "starting",
        pct: 0,
        error: null,
      });

      const onSuccess = async (response) => {
        if (
          response?.data?.audio_path ||
          response?.data?.music_path ||
          response?.data?.audio_base64
        ) {
          inferences.push({ question: prompt, answer: response, id: uuid() });
          try {
            await window.electronAPI?.store?.set?.(
              "musicInferences",
              JSON.parse(JSON.stringify(inferences))
            );
          } catch {}
          form.prompt = "";
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

    const fileUrl = (p) =>
      p && /^https?:\/\//i.test(p) ? p : p ? `file://${p}` : "";
    const downloadAudio = async (idx) => {
      const path =
        inferences[idx]?.answer?.data?.audio_path ||
        inferences[idx]?.answer?.data?.music_path;
      const b64 = inferences[idx]?.answer?.data?.audio_base64;
      const defaultName =
        (path && path.split("/").pop()) || `bonzai-music-${Date.now()}.wav`;

      // Prefer disk path; fallback to base64 save if your preload exposes saveAudioBase64
      if (path) {
        const result = await window.electronAPI?.saveAudio?.(defaultName, path);
        if (!result?.success)
          console.error("Save cancelled or failed", result?.error);
      } else if (b64) {
        const result = await window.electronAPI?.saveAudioBase64?.(
          defaultName,
          b64
        );
        if (!result?.success)
          console.error("Save cancelled or failed", result?.error);
      }
    };

    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.length) return;
      inferences.splice(idx, 1);
      hasCopy.splice(idx, 1);
      try {
        await window.electronAPI?.store?.set?.(
          "musicInferences",
          JSON.parse(JSON.stringify(inferences))
        );
      } catch {}
    };

    const loadHistory = async () => {
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "musicInferences",
          []
        );
        if (Array.isArray(saved))
          saved.forEach((item) => inferences.push(item));
      } catch {}
    };

    // --------- derived: stable ordered task list
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

    // ------------ lifecycle ----------------
    onMounted(async () => {
      ensureGenerationSocket();
      await resumeActiveDownloadIfAny();
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "musicInferences",
          []
        );
        if (Array.isArray(saved))
          saved.forEach((item) => inferences.push(item));
      } catch {}
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
      if (genSocket.value?.connected) {
        try {
          genSocket.value.disconnect();
        } catch {}
      }
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
      downloads,
      downloadTaskList,
      sendMessage,
      copy,
      downloadAudio,
      removeInference,
      prefetchForMode,
      cancelCurrentPipeline,
      retryCurrentPipeline,
      probeCurrentMode,
      fileUrl,
    };
  },
};
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
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
  background: url("src/assets/bonzai_music.jpg") no-repeat;
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
h2 {
  font-size: 48px;
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
p.desc {
  font-size: 32px;
  border-bottom: 32px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 4px;
}
p.question {
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 1em;
  margin-top: 2em !important;
  margin-bottom: 1em !important;
  font-weight: 700;
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  border-radius: 4px;
  backdrop-filter: blur(6px);
}
div.answer {
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 1em;
  box-shadow: -8px 8px 0 rgba(57, 213, 130, 0.25);
  border-radius: 4px;
  backdrop-filter: blur(6px);
  background: rgba(255, 255, 255, 0.1);
}
div.answer p {
  margin-bottom: 0 !important;
}
span.answer__id {
  display: block;
  position: absolute;
  top: 0;
  right: 0;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.25);
}
form {
  position: relative;
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
.generation {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1;
  opacity: 0.9;
}
</style>
