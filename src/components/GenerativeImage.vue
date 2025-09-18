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
                    image
                  </span>
                  Generative Image
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
                <!-- MODE TOGGLES -->
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
                    :value="'intermediate'"
                    id="mode_intermediate"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_intermediate" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      balance
                    </span>
                    Balanced
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

                  <span class="control" v-if="mode !== 'turbo'">
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

                    <input
                      v-model="quality"
                      :value="'2k'"
                      id="mode_quality_2k"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_2k" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        2k
                      </span>
                    </label>

                    <input
                      v-model="quality"
                      :value="'4k'"
                      id="mode_quality_4k"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_4k" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        4k
                      </span>
                    </label>
                  </span>
                </div>

                <!-- READINESS CTA -->
                <div
                  v-if="showUpdateCTA"
                  class="notification is-danger"
                  style="margin-bottom: 1rem"
                >
                  <p class="mb-2">
                    <strong class="fira-sans-condensed-black-italic">
                      Model Download Required
                    </strong>

                    <!-- Repo problems: incomplete / zero-bytes / out-of-sync -->
                    <span v-if="readiness.missingRepos.length">
                      <ul style="margin-top: 0.5rem">
                        <li v-for="d in readiness.repoDetails" :key="d.repo">
                          <span
                            class="material-symbols-outlined is-size-3 mr-1"
                          >
                            deployed_code
                          </span>
                          {{ d.repo }}
                          <!-- <span class="notification is-warning is-size-5 p-2" v-if="d.root">
                            <small>{{ d.root }}</small>
                          </span> -->
                        </li>
                      </ul>
                    </span>

                    <!-- GGUF -->
                    <span v-if="readiness.missingGguf">
                      <span class="material-symbols-outlined is-size-3 mr-1">
                        deployed_code
                      </span>
                      {{ readiness.ggufName || "Unknown (server-configured)" }}
                    </span>

                    <!-- Auth -->
                    <span v-if="readiness.authRequired">
                      <br />
                      <strong>Authentication required</strong>
                      <span v-if="readiness.authRepos.length">
                        — for:
                        <code
                          v-for="r in readiness.authRepos"
                          :key="r"
                          class="ml-1"
                        >
                          {{ r }}
                        </code>
                      </span>
                      <br />
                      Set
                      <code>HF_TOKEN</code>
                      (or
                      <code>HUGGINGFACE_HUB_TOKEN</code>
                      ) in the server environment and ensure you’ve accepted the
                      model terms for these repos. Then restart the server.
                    </span>

                    <!-- Notes -->
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
                      title="(Re)download required files"
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
                      {{ Math.round(downloads.progress) }}%
                      <button
                        v-if="downloads.pipeline?.status === 'failed'"
                        class="button is-small is-link is-warning ml-2"
                        @click="retryCurrentPipeline"
                        :disabled="!downloads.pipelineId"
                      >
                        Retry
                      </button>
                    </span>
                  </p>
                  <progress
                    class="progress is-success is-large"
                    :value="downloads.progress"
                    max="100"
                  >
                    {{ Math.round(downloads.progress) }}%
                  </progress>
                  <!-- <button
                    class="button is-small is-danger mr-4"
                    @click="cancelCurrentPipeline"
                    :disabled="
                      !downloads.pipelineId || downloads.status === 'completed'
                    "
                  >
                    Cancel
                  </button> -->
                  <div
                    v-if="downloads.pipeline?.tasks"
                    style="max-height: 180px; overflow: auto"
                  >
                    <ul>
                      <li
                        v-for="(task, tid) in downloads.pipeline.tasks"
                        :key="tid"
                        class="is-size-7 columns"
                      >
                        <div class="column has-text-left">
                          <span class="material-symbols-outlined is-size-6">
                            deployed_code
                          </span>
                          {{ task.filename }} —
                          <span class="fira-sans-condensed-black-italic">
                            {{ task.status }}
                          </span>
                        </div>
                        <div
                          class="column is-2 fira-sans-condensed-black-italic has-text-right"
                        >
                          {{ Math.round(task.progress) }}%
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
                    placeholder="Describe your image and press enter to generate..."
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
                      <div
                        class="logo watermark"
                        style="
                          position: absolute;
                          width: 128px;
                          bottom: 7em;
                          right: 1em;
                        "
                      >
                        <img src="https://www.bonzai.sh/bonzai_logo-full.png" />
                      </div>
                      <img
                        class="generated__image"
                        :src="
                          'data:image/png;base64,' + inference.answer.data.image
                        "
                      />
                      <hr />
                      <button
                        class="button is-medium is-success copy is-pulled-right ml-5 mr-0 p-0 pl-1 pr-1"
                        @click="downloadImage(index)"
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
                        @click="
                          copy(inference.question);
                          hasCopy[index] = true;
                        "
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
                      <button
                        disabled
                        class="button is-medium is-warning copy is-pulled-left ml-5 pl-2"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          edit_square
                        </span>
                        Edit
                      </button>
                      <button
                        class="button is-medium is-warning copy is-pulled-left ml-5 pl-2"
                        @click="copy(inference.question)"
                      >
                        <span class="material-symbols-outlined is-size-2 mr-1">
                          animation
                        </span>
                        Animate
                      </button>
                    </div>
                  </li>
                </ol>
              </div>
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
  name: "GenerativeImage",
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
      missingRepos: [], // array of repo ids
      repoDetails: [], // [{ repo, missing, root }]
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
    const endpointForMode = (m) =>
      m === "quality"
        ? "/image/quality"
        : m === "intermediate"
        ? "/image/intermediate"
        : "/image/turbo";
    const pipelineForMode = (m) =>
      m === "quality"
        ? "flux"
        : m === "intermediate"
        ? "sdxl_intermediate"
        : "sdxl_turbo";

    // ------------ downloads state/socket --
    const downloads = reactive({
      active: false,
      pipelineId: null,
      progress: 0,
      status: "pending",
      pipeline: null,
      wsUrl: null,
    });
    const downloadsSocket = ref(null);

    const ensureDownloadsSocket = (base = WS_DL) => {
      if (
        downloadsSocket.value &&
        downloadsSocket.value.connected &&
        downloads.wsUrl === base
      )
        return;
      if (downloadsSocket.value) {
        try {
          downloadsSocket.value.disconnect();
        } catch {}
      }
      downloads.wsUrl = base;
      downloadsSocket.value = io(base, {
        transports: ["polling", "websocket"],
      });
      downloadsSocket.value.on("download_progress", ({ pipeline }) => {
        if (!pipeline) return;
        downloads.pipeline = pipeline;
        downloads.pipelineId = pipeline.pipeline_id;
        downloads.progress = pipeline.total_progress || 0;
        downloads.status = pipeline.status || "downloading";
        downloads.active = !["completed", "failed", "cancelled"].includes(
          downloads.status
        );
      });
    };

    const connectAndSubscribe = (pipelineId, websocketUrl) => {
      if (!pipelineId) return;
      ensureDownloadsSocket(websocketUrl || WS_DL);
      downloads.active = true;
      downloads.pipelineId = pipelineId;
      downloads.progress = 0;
      downloads.status = "downloading";
      try {
        downloadsSocket.value.emit("subscribe", { pipeline_id: pipelineId });
      } catch {}
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
    const resetReadiness = () => {
      readiness.ok = true;
      readiness.repos = [];
      readiness.missingReposDetailed = [];
      readiness.missingGguf = false;
      readiness.ggufName = null;
      readiness.notes = [];
      readiness.authRequired = false;
      readiness.authRepos = [];
      generation.blocked = false;
    };

    const applyPlanToReadiness = (data) => {
      const repos = Array.isArray(data?.repos) ? data.repos : [];

      // consider incomplete if ok===false OR numeric missing > 0
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

      // trust server ok, but also force false if we detected missing/incomplete items
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
        // incoming 409 carries either a list of specific missing items or just that it's incomplete.
        const missingCount = Array.isArray(rs?.missing)
          ? rs.missing.length
          : typeof rs?.missing === "number"
          ? rs.missing
          : 1;
        const exists = typeof rs?.exists === "boolean" ? rs.exists : true;
        // Add/merge into detailed list
        const key = rs.repo;
        const idx = readiness.missingReposDetailed.findIndex(
          (x) => x.repo === key
        );
        const entry = {
          repo: key,
          missing: Math.max(1, missingCount),
          root: rs.root || null,
        };
        if (idx >= 0) readiness.missingReposDetailed[idx] = entry;
        else readiness.missingReposDetailed.push(entry);
        if (!exists)
          readiness.notes.push(`${key}: repository not found locally`);
      }
      const hint = res?.data?.hint;
      if (hint) readiness.notes.push(hint);
    };

    // ------------ proactive readiness -----
    const probeCurrentMode = async () => {
      // reset
      readiness.ok = true;
      readiness.missingRepos = [];
      readiness.repoDetails = [];
      readiness.missingGguf = false;
      readiness.ggufName = null;
      readiness.notes = [];
      readiness.authRequired = false;
      readiness.authRepos = [];
      generation.blocked = false;

      const pipeline = pipelineForMode(mode.value);

      try {
        const { data, status } = await axios.post(
          `${API_BASE}/pipelines/plan`,
          { pipeline, deep_validate: true },
          { validateStatus: () => true }
        );

        if (status >= 200 && status < 300) {
          applyPlanToReadiness(data);
        } else {
          // non-2xx: don't hide CTA; add a note and keep ok=false so CTA shows
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
      const pipeline = pipelineForMode(mode.value);
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
          const pid = started[started.length - 1] || null;
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

        if (res.status === 403) {
          apply403ToReadiness(res);
          return;
        }
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
      genSocket.value = io(base, { transports: ["polling", "websocket"] });
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
          if (typeof pct === "number") generation.pct = pct;
          else if (total) generation.pct = (Number(step) / Number(total)) * 100;
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

        if (res.status === 403) {
          apply403ToReadiness(res);
          return;
        }
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
      const payload = { prompt, auto_download: true };
      const sizes = {
        sd: [480, 640],
        hd: [720, 1280],
        fhd: [1080, 1920],
        "2k": [1440, 2560],
        "4k": [2160, 4096],
      };
      const [h, w] = sizes[quality.value] || sizes.sd;
      payload.height = h;
      payload.width = w;
      if (mode.value === "intermediate")
        payload.lora = "cyberrealistic-xl-v6.safetensors";

      const url = `${API_BASE}${endpointForMode(mode.value)}`;
      ensureGenerationSocket();

      const onSuccess = async (response) => {
        if (response?.data?.image || response?.data?.video_path) {
          inferences.push({ question: prompt, answer: response, id: uuid() });
          try {
            await window.electronAPI?.store?.set?.(
              "imageInferences",
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
    const downloadImage = async (idx) => {
      const img = inferences[idx]?.answer?.data?.image;
      if (!img) return;
      const defaultName = `bonzai-${Date.now()}.png`;
      const result = await window.electronAPI?.saveImage?.(defaultName, img);
      if (!result?.success)
        console.error("Save cancelled or failed", result?.error);
    };
    const removeInference = async (idx) => {
      if (idx < 0 || idx >= inferences.length) return;
      inferences.splice(idx, 1);
      hasCopy.splice(idx, 1);
      try {
        await window.electronAPI?.store?.set?.(
          "imageInferences",
          JSON.parse(JSON.stringify(inferences))
        );
      } catch {}
    };
    const loadHistory = async () => {
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "imageInferences",
          []
        );
        if (Array.isArray(saved))
          saved.forEach((item) => inferences.push(item));
      } catch {}
    };

    // ------------ lifecycle ----------------
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
      // state
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
      // actions
      sendMessage,
      copy,
      downloadImage,
      removeInference,
      prefetchForMode,
      cancelCurrentPipeline,
      retryCurrentPipeline,
      probeCurrentMode,
    };
  },
};
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");

.generation {
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1;
  opacity: 0.9;
}
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
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
  background: url("https://www.bonzai.sh/bonzai_image.jpg") no-repeat;
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
.generated__image {
  width: 100% !important;
  height: 100% !important;
  border: 1px solid rgba(255, 255, 255, 1);
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
  padding: 1em 1em 5em;
  margin-top: 2em !important;
  margin-bottom: 1em !important;
  font-weight: 700;
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  border-radius: 4px;
  backdrop-filter: blur(6px);
}
div.question .generated__image {
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
}
form {
  position: relative;
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
</style>
