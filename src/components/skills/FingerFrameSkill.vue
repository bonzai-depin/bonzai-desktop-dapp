<template>
  <div class="finger-frame-studio">
    <section class="finger-frame-stage">
      <video
        v-if="resultPath || sourceUrl"
        :src="resultPath ? mediaUrl(resultPath) : sourceUrl"
        controls
        playsinline
        class="finger-frame-video"
      />
      <button v-else type="button" class="finger-frame-drop" @click="selectVideo">
        <span class="material-symbols-outlined" aria-hidden="true">video_file</span>
        <strong>Choose a gesture clip</strong>
        <span>Two hands, one frame, one continuous shot</span>
      </button>

      <div v-if="running" class="finger-frame-progress" role="status">
        <BonzaiPulse variant="bar" :percent="progress" width="min(360px, 72vw)" />
        <strong>{{ status }}</strong>
        <span>{{ progress }}%</span>
      </div>

      <div v-if="analysis && !running" class="finger-frame-readout">
        <span class="material-symbols-outlined" aria-hidden="true">gesture</span>
        Frame held in {{ Math.round(analysis.coverage * 100) }}% of the clip
      </div>
    </section>

    <section class="finger-frame-console">
      <div class="finger-frame-source">
        <div>
          <span class="bz-eyebrow">Source</span>
          <strong>{{ filename || 'No clip selected' }}</strong>
        </div>
        <button type="button" class="bz-btn bz-btn--ghost" :disabled="running" @click="selectVideo">
          <span class="material-symbols-outlined" aria-hidden="true">folder_open</span>
          {{ sourcePath ? 'Replace' : 'Choose clip' }}
        </button>
      </div>

      <div class="finger-frame-controls">
        <div>
          <label class="finger-frame-label" for="finger-style">World</label>
          <select id="finger-style" v-model="style" class="finger-frame-select" :disabled="running">
            <option v-for="preset in styles" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
          </select>
        </div>
        <div>
          <label class="finger-frame-label" for="finger-engine">Render</label>
          <select id="finger-engine" v-model="engine" class="finger-frame-select" :disabled="running">
            <option value="fast">Fast · LTX-2</option>
            <option value="quality">Quality · Wan 2.2</option>
          </select>
        </div>
      </div>

      <label class="finger-frame-label" for="finger-direction">Direction</label>
      <textarea
        id="finger-direction"
        v-model="direction"
        class="finger-frame-prompt"
        rows="3"
        :disabled="running"
        placeholder="Describe what comes alive inside the frame"
      />

      <p v-if="error" class="finger-frame-error">{{ error }}</p>

      <div class="finger-frame-actions">
        <button
          type="button"
          class="bz-btn bz-btn--agent-cta bz-btn--lg"
          :disabled="!sourcePath || running"
          @click="createEffect"
        >
          <span class="material-symbols-outlined" aria-hidden="true">auto_awesome_motion</span>
          {{ running ? 'Directing…' : 'Create effect' }}
        </button>
        <button
          v-if="resultPath"
          type="button"
          class="bz-btn bz-btn--primary bz-btn--lg"
          @click="saveResult"
        >
          <span class="material-symbols-outlined" aria-hidden="true">save</span>
          Save video
        </button>
      </div>
    </section>
  </div>
</template>

<script>
import { computed, ref, watch } from "vue";
import BonzaiPulse from "../BonzaiPulse.vue";

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

const STYLE_PRESETS = [
  { id: "anime", label: "Ink anime", prompt: "hand-painted Japanese anime, expressive ink contours, luminous cel shading" },
  { id: "ukiyo", label: "Ukiyo-e dream", prompt: "living ukiyo-e print, mineral pigments, textured washi paper, elegant linework" },
  { id: "cinematic", label: "Cinematic", prompt: "premium cinematic world, precise art direction, volumetric natural light, tactile detail" },
  { id: "clay", label: "Clay studio", prompt: "meticulous stop-motion clay world, handcrafted surfaces, warm studio lighting" },
  { id: "watercolor", label: "Watercolour", prompt: "animated watercolor painting, bleeding pigments, delicate paper grain, poetic motion" },
];

export default {
  name: "FingerFrameSkill",
  components: { BonzaiPulse },
  emits: ["effect-created", "status-update", "model-requirements-change"],
  setup(_props, { emit }) {
    const sourcePath = ref("");
    const sourceUrl = ref("");
    const filename = ref("");
    const style = ref("anime");
    const engine = ref("fast");
    watch(engine, value => emit('model-requirements-change', {
      workflowId: 'finger-frame-director-v1.0.0', keys: [value === 'quality' ? 'video_quality' : 'video_fast'],
    }), { immediate: true });
    const direction = ref("A hidden world awakens beyond the hands, alive with depth and purposeful motion.");
    const running = ref(false);
    const progress = ref(0);
    const status = ref("");
    const error = ref("");
    const analysis = ref(null);
    const resultPath = ref("");

    const styles = computed(() => STYLE_PRESETS);
    const mediaUrl = (path) => `${API_BASE}/media/stream?path=${encodeURIComponent(path)}`;
    const setStage = (message, pct) => {
      status.value = message;
      progress.value = pct;
      emit("status-update", message);
    };

    const request = async (path, body) => {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 202) {
        throw new Error("The selected local video model is downloading. Run the workflow again when it is ready.");
      }
      if (!response.ok || payload.success === false || payload.error) throw new Error(payload.error || `Workflow failed (${response.status})`);
      return payload;
    };

    const selectVideo = async () => {
      error.value = "";
      const path = await window.electronAPI?.selectVideoFile?.();
      if (!path) return;
      sourcePath.value = path;
      filename.value = path.split(/[\\/]/).pop() || "gesture.mp4";
      sourceUrl.value = `local-video://${path}`;
      resultPath.value = "";
      analysis.value = null;
    };

    const createEffect = async () => {
      if (!sourcePath.value || running.value) return;
      running.value = true;
      error.value = "";
      resultPath.value = "";
      try {
        setStage("Finding the hand frame", 12);
        analysis.value = await request("/workflows/finger-frame/analyze", {
          source_path: sourcePath.value,
        });

        const preset = STYLE_PRESETS.find((item) => item.id === style.value) || STYLE_PRESETS[0];
        const directorPrompt = [
          direction.value.trim(),
          preset.prompt,
          "A cohesive alternate world seen through a hand-made rectangular portal.",
          "Continuous cinematic motion, stable composition, no text, no logos, no camera cuts.",
        ].filter(Boolean).join(" ");
        const duration = Math.max(3, Math.min(8, analysis.value.duration || 5));
        const image = analysis.value.keyframe_base64;

        setStage("Generating the world locally", 42);
        const generated = engine.value === "quality"
          ? await request("/video/quality", {
              prompt: directorPrompt,
              image_base64: image,
              width: 768,
              height: 432,
              num_frames: Math.round(duration * 16) + 1,
              fps: 16,
              num_inference_steps: 4,
              guidance_scale: 1,
              auto_download: false,
            })
          : await request("/video", {
              mode: "i2v",
              prompt: directorPrompt,
              image_base64: image,
              width: 768,
              height: 432,
              frames: 1 + 8 * Math.max(9, Math.round((duration * 24) / 8)),
              frame_rate: 24,
              steps: 10,
              guidance_scale: 1,
              auto_download: false,
            });

        if (!generated.video_path) throw new Error("The video model returned no generated scene. Please retry generation.");
        setStage("Projecting the world into the gesture", 84);
        const composite = await request("/workflows/finger-frame/composite", {
          source_path: sourcePath.value,
          generated_path: generated.video_path,
        });
        if (!composite.video_path) throw new Error("The compositing step returned no video. Please retry the effect.");
        resultPath.value = composite.video_path;
        analysis.value = { ...analysis.value, coverage: composite.coverage };
        setStage("Effect ready", 100);
        emit("effect-created", { ...composite, title: filename.value, prompt: directorPrompt, engine: engine.value,
          generatedScene: { video_path: generated.video_path }, sourceFilename: filename.value });
      } catch (exception) {
        error.value = exception.message || "The effect could not be created.";
        emit("status-update", "");
      } finally {
        running.value = false;
      }
    };

    const saveResult = async () => {
      if (!resultPath.value) return;
      await window.electronAPI?.saveVideo?.("bonzai-finger-frame.mp4", resultPath.value);
    };

    return {
      analysis, createEffect, direction, engine, error, filename, mediaUrl,
      progress, resultPath, running, saveResult, selectVideo, sourcePath,
      sourceUrl, status, style, styles,
    };
  },
};
</script>

<style scoped>
.finger-frame-studio { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(320px, .7fr); min-height: 620px; background: var(--bz-bg); border: 1px solid var(--bz-border); }
.finger-frame-stage { position: relative; display: grid; place-items: center; min-height: 620px; overflow: hidden; background: #09090b; }
.finger-frame-video { width: 100%; height: 100%; max-height: 720px; object-fit: contain; }
.finger-frame-drop { display: grid; place-items: center; gap: 10px; width: min(520px, 80%); aspect-ratio: 16 / 9; color: var(--bz-fg); background: transparent; border: 1px dashed var(--bz-border-strong); cursor: pointer; }
.finger-frame-drop .material-symbols-outlined { font-size: 42px; color: var(--bz-accent); }
.finger-frame-drop strong { font-size: 20px; }
.finger-frame-drop span:last-child { color: var(--bz-fg-muted); }
.finger-frame-progress { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 14px; color: white; background: rgba(8, 8, 10, .78); backdrop-filter: blur(12px); }
.finger-frame-progress span { color: rgba(255,255,255,.68); }
.finger-frame-readout { position: absolute; left: 18px; bottom: 18px; display: flex; align-items: center; gap: 8px; padding: 9px 12px; color: white; background: rgba(9,9,11,.74); border: 1px solid rgba(255,255,255,.18); }
.finger-frame-console { display: flex; flex-direction: column; gap: 22px; padding: 28px; border-left: 1px solid var(--bz-border); }
.finger-frame-source { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--bz-border); }
.finger-frame-source > div { display: grid; gap: 5px; min-width: 0; }
.finger-frame-source strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.finger-frame-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.finger-frame-controls > div { display: grid; gap: 7px; }
.finger-frame-label { color: var(--bz-fg-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
.finger-frame-select, .finger-frame-prompt { width: 100%; color: var(--bz-fg); background: var(--bz-surface); border: 1px solid var(--bz-border); border-radius: 4px; }
.finger-frame-select { height: 42px; padding: 0 10px; }
.finger-frame-prompt { min-height: 118px; padding: 12px; resize: vertical; line-height: 1.5; }
.finger-frame-error { margin: 0; padding: 12px; color: var(--bz-danger, #d95c5c); border-left: 3px solid currentColor; background: color-mix(in srgb, currentColor 8%, transparent); }
.finger-frame-actions { display: flex; gap: 10px; margin-top: auto; }
@media (max-width: 960px) {
  .finger-frame-studio { grid-template-columns: 1fr; }
  .finger-frame-stage { min-height: 420px; }
  .finger-frame-console { border-left: 0; border-top: 1px solid var(--bz-border); }
}
</style>
