<template>
  <!-- When fullscreen is active we teleport the whole skill to <body> so no
       ancestor transform (tabs, smart-agent container, etc.) collapses the
       `position: fixed` layer and the background leaks through. -->
  <Teleport to="body" :disabled="!isFullscreen">
    <div
      class="mass-chat-skill"
      :class="{ fullscreen: isFullscreen }"
      :style="
        isFullscreen
          ? {
              position: 'fixed',
              inset: '0',
              zIndex: 9999,
              background: 'var(--bz-canvas)',
              overflowY: 'auto',
              padding: '24px',
            }
          : null
      "
    >
      <div class="arena-scoreboard">
        <div class="arena-score-card">
          <span>Ready Models</span>
          <strong>{{ availableModels.length }}</strong>
        </div>
        <div class="arena-score-card">
          <span>Selected</span>
          <strong>{{ selectedModels.length }}</strong>
        </div>
        <div class="arena-score-card">
          <span>Responses</span>
          <strong>{{ results.length }}</strong>
        </div>
        <div class="arena-score-card">
          <span>State</span>
          <strong>{{ isRunning ? 'Running' : 'Idle' }}</strong>
        </div>
      </div>

      <div class="arena-toolbar">
        <button
          class="bz-iconbtn"
          @click="showLibrary = !showLibrary"
          title="Prompt library"
        >
          <span class="material-symbols-outlined">library_books</span>
        </button>
        <button
          class="bz-iconbtn"
          @click="isFullscreen = !isFullscreen"
          :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
        >
          <span class="material-symbols-outlined">
            {{ isFullscreen ? "fullscreen_exit" : "fullscreen" }}
          </span>
        </button>
      </div>

      <!-- Prompt Library -->
      <div
        v-if="showLibrary"
        class="arena-library skill-panel"
      >
        <h2
          class="bz-h2 skill-section-title"
        >
          <span
            class="material-symbols-outlined"
            style="vertical-align: middle"
          >
            library_books
          </span>
          Prompt Library
        </h2>
        <p
          v-if="savedPrompts.length === 0"
          class="bz-meta"
        >
          No saved prompts yet. Run a comparison and click "Save to library".
        </p>
        <div v-else class="library-grid">
          <div v-for="(p, i) in savedPrompts" :key="p.id" class="library-card">
            <div class="library-card-body" @click="loadSavedPrompt(p)">
              <div class="bz-meta library-card-meta">
                {{ new Date(p.savedAt).toLocaleDateString() }} ·
                {{ p.models?.length || 0 }} models
              </div>
              <div class="library-card-prompt">
                {{ p.prompt.slice(0, 140)
                }}{{ p.prompt.length > 140 ? "…" : "" }}
              </div>
            </div>
            <button
              class="bz-iconbtn bz-iconbtn--sm danger-icon"
              @click.stop="deleteSavedPrompt(i)"
            >
              <span class="material-symbols-outlined" style="font-size: 14px">
                delete
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Model selection — only shows LLMs that are downloaded locally.
         Ungettable/undownloaded models are hidden to keep the selector
         focused on what the user can actually run right now. Download
         gaps are handled by SmartAgent's standard "Download Required"
         banner earlier in the flow. -->
      <div
        class="arena-models skill-panel"
      >
        <h2
          class="bz-h2 skill-section-title"
        >
          Select Models
          <span class="bz-meta bz-mono title-count">
            ({{ selectedModels.length }} /
            {{ availableModels.length }} selected)
          </span>
        </h2>

        <div
          v-if="availableModels.length === 0"
          class="bz-meta"
        >
          No LLMs downloaded yet. Use the Chat tab to download at least two
          models, then come back to compare them.
        </div>
        <div v-else class="mass-chat-model-grid">
          <label
            v-for="m in availableModels"
            :key="m.filename"
            class="mass-chat-model-card"
            :class="{ selected: selectedModels.includes(m.filename) }"
          >
            <input
              type="checkbox"
              :value="m.filename"
              v-model="selectedModels"
              class="mass-chat-checkbox"
            />
            <div class="model-card-content">
              <strong class="model-card-name">{{ m.modelname }}</strong>
              <div class="model-card-meta bz-meta bz-mono">
                {{ m.parameters ? (m.parameters / 1e9).toFixed(1) + "B" : "" }}
                {{
                  m.context
                    ? " • " + (m.context / 1024).toFixed(0) + "K ctx"
                    : ""
                }}
                · {{ m.filesize || "—" }}
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- Prompt + Run -->
      <section class="arena-prompt skill-panel">
        <h2
          class="bz-h2 skill-section-title"
        >
          Prompt
        </h2>
        <textarea
          v-model="prompt"
          class="skill-textarea"
          rows="3"
          placeholder="Ask every selected model the same question..."
        ></textarea>

        <div
          class="skill-action-row"
        >
          <div style="flex: 1"></div>
          <button
            v-if="prompt.trim()"
            class="bz-iconbtn"
            @click="saveCurrentPrompt"
          >
            <span class="material-symbols-outlined">save</span>
          </button>
          <button
            class="bz-btn bz-btn--success bz-btn--lg mass-chat-cta"
            :class="{ 'bz-btn--running': isRunning }"
            :disabled="
              isRunning || !prompt.trim() || selectedModels.length === 0
            "
            @click="runMassChat"
          >
            <span class="material-symbols-outlined">play_arrow</span>
            Run Mass Chat ({{ selectedModels.length || 0 }})
            <span v-if="isRunning" class="bz-btn__progress"></span>
          </button>
        </div>
      </section>

      <!-- Split View Results -->
      <section
        v-if="results.length > 0"
        class="arena-responses skill-panel"
      >
        <div
          class="skill-panel-head"
        >
          <h2
            class="bz-h2 skill-section-title"
          >
            Responses
          </h2>
          <button
            class="bz-btn"
            :disabled="results.length === 0"
            @click="exportMarkdown"
            title="Export comparison to markdown"
          >
            <span class="material-symbols-outlined">download</span>
            Export
          </button>
        </div>
        <div class="mass-chat-grid" :style="gridStyle">
          <div v-for="r in results" :key="r.filename" class="mass-chat-panel">
            <header class="panel-header">
              <div class="response-title-row">
                <span
                  class="material-symbols-outlined"
                  style="font-size: 18px; color: var(--bz-info)"
                >
                  neurology
                </span>
                <strong class="response-modelname">{{ r.modelname }}</strong>
              </div>
              <span class="bz-meta bz-mono">
                <template v-if="r.status === 'running'">generating…</template>
                <template v-else-if="r.status === 'done'">
                  {{ r.tokensPerSecond.toFixed(1) }} tok/s ·
                  {{ r.durationMs }}ms
                </template>
                <template v-else-if="r.status === 'pending'">queued</template>
                <template v-else-if="r.status === 'error'">error</template>
              </span>
            </header>
            <div class="panel-body">
              <template v-if="r.status === 'error'">
                <div class="bz-notice bz-notice--danger"><p class="bz-notice__text">{{ r.error }}</p></div>
              </template>
              <template v-else>
                <div
                  v-if="!r.response && r.status === 'running'"
                  class="response-text"
                >
                  …
                </div>
                <vue-markdown
                  v-else
                  :source="r.response"
                  class="response-text"
                />
                <img
                  v-if="r.imageUrl"
                  :src="r.imageUrl"
                  class="response-image"
                  alt="Visualization"
                />
              </template>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import VueMarkdown from "vue-markdown-render";
import { hasPurchasedSkill, isDevMode } from "../../services/agent.service.js";
import { listAllLLMs } from "../../skills/flagship.js";

const SKILL_ID = "mass-chat-v1.0.0";
const PROMPT_LIBRARY_KEY = "bonzai.mass-chat.library";
const VOTE_KEY = "bonzai.mass-chat.votes";
const MAX_LIBRARY = 100;

const API_BASE =
  (typeof process !== "undefined" && process.env?.VITE_API_BASE) ||
  (window?.electronAPI?.env && window.electronAPI.env.API_BASE) ||
  "http://127.0.0.1:65000";

// Build a plain-object LLM spec from a flagship catalog entry. Keeping this
// as a standalone factory (rather than passing reactive model refs directly
// over IPC) is what prevents the "object could not be cloned" error — Vue
// reactive proxies are not structuredClone-able.
function specFromCatalog(entry) {
  return {
    filename: entry.filename,
    url: entry.url,
    filesizeBytes: entry.filesizeBytes,
    parameters: entry.parameters,
    context: entry.context,
    // Human-readable fields included for the loader's metadata pass.
    modelname: entry.name,
  };
}

export default {
  name: "MassChatSkill",
  components: { VueMarkdown },
  props: {
    skill: { type: Object, default: null },
  },
  setup(props, { emit }) {
    const isFullscreen = ref(false);
    const showLibrary = ref(false);
    const prompt = ref("");
    const selectedModels = ref([]);
    const results = ref([]);
    const isRunning = ref(false);
    const generateImages = ref(false);
    const savedPrompts = ref([]);
    const votes = ref({});

    // Only the LLMs currently downloaded on disk. Undownloaded models
    // are hidden — the standard SmartAgent download banner handles gaps.
    const availableModels = ref([]);

    // ─── Catalog + library loading ───────────────────────────────────────
    const hydrateCatalog = async () => {
      const catalog = listAllLLMs();
      const checks = await Promise.all(
        catalog.map(async (entry) => {
          try {
            const r = await window.electronAPI?.checkModel?.(entry.filename);
            return r?.exists || r === true ? entry : null;
          } catch {
            return null;
          }
        }),
      );
      const ready = checks.filter(Boolean).map((entry) => ({
        filename: entry.filename,
        modelname: entry.name,
        url: entry.url,
        filesize: entry.size,
        filesizeBytes: entry.filesizeBytes,
        parameters: entry.parameters,
        context: entry.context,
      }));
      // Sort by size ascending (fastest first).
      ready.sort((a, b) => (a.filesizeBytes || 0) - (b.filesizeBytes || 0));
      availableModels.value = ready;
    };

    const loadLibrary = async () => {
      try {
        const saved = await window.electronAPI?.store?.get(
          PROMPT_LIBRARY_KEY,
          [],
        );
        savedPrompts.value = Array.isArray(saved) ? saved : [];
      } catch {
        savedPrompts.value = [];
      }
      try {
        const v = await window.electronAPI?.store?.get(VOTE_KEY, {});
        votes.value = v && typeof v === "object" ? v : {};
      } catch {
        votes.value = {};
      }
    };

    const gridStyle = computed(() => {
      const n = Math.max(1, results.value.length);
      const cols = isFullscreen.value ? Math.min(3, n) : Math.min(2, n);
      return { "grid-template-columns": `repeat(${cols}, minmax(0, 1fr))` };
    });

    // Refresh catalog when a download finishes elsewhere in the app so the
    // selector picks up newly-available models without requiring a tab
    // switch. No per-row download UI — just hydrate on completion.
    let unsubDownload = null;
    onMounted(async () => {
      unsubDownload = window.electronAPI?.onDownloadProgress?.((_e, data) => {
        if (data?.done || data?.percent >= 1 || data?.percent >= 100) {
          hydrateCatalog();
        }
      });
      await Promise.all([hydrateCatalog(), loadLibrary()]);
    });

    onBeforeUnmount(() => {
      try {
        if (typeof unsubDownload === "function") unsubDownload();
      } catch {}
    });

    // ─── Per-model execution ─────────────────────────────────────────────
    const runOneModel = async (entry) => {
      const result = results.value.find((r) => r.filename === entry.filename);
      if (!result) return;
      result.status = "running";
      const startedAt = performance.now();

      // Build a plain-object spec for IPC. This is critical — passing the
      // reactive `entry` (or anything derived from a Vue ref) triggers
      // "object could not be cloned" because Electron's structuredClone
      // doesn't handle Proxy wrappers.
      const modelSpec = {
        filename: entry.filename,
        url: entry.url,
        filesizeBytes: entry.filesizeBytes,
        parameters: entry.parameters,
        context: entry.context,
        modelname: entry.modelname,
      };

      try {
        await window.electronAPI.loadModel(modelSpec);
        await window.electronAPI.resetChat?.();

        let tokenCount = 0;
        const unsubToken = window.electronAPI.onChatToken?.((chunk) => {
          if (chunk?.text) {
            result.response += chunk.text;
            tokenCount += 1;
          }
        });

        const reply = await window.electronAPI.chat(prompt.value, {
          temperature: 0.7,
          maxTokens: 512,
        });
        if (!result.response) {
          const text = typeof reply === "string" ? reply : reply?.text || "";
          result.response = text;
          tokenCount = (text.split(/\s+/).filter(Boolean) || []).length;
        }
        try {
          if (typeof unsubToken === "function") unsubToken();
        } catch {}

        const durationMs = performance.now() - startedAt;
        result.durationMs = Math.round(durationMs);
        result.tokensPerSecond =
          tokenCount > 0 ? tokenCount / (durationMs / 1000) : 0;

        if (generateImages.value) {
          await generateImageForResult(result);
        }
        result.status = "done";
      } catch (e) {
        console.error("[MassChat] run failed on", entry.filename, e);
        result.status = "error";
        result.error = e?.message || String(e);
      }
    };

    const generateImageForResult = async (result) => {
      try {
        const snippet = (result.response || "")
          .slice(0, 220)
          .replace(/\s+/g, " ");
        if (!snippet) return;
        const imgRes = await fetch(`${API_BASE}/image/turbo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `A visual metaphor for: ${snippet}`,
            width: 512,
            height: 512,
            num_inference_steps: 4,
            guidance_scale: 0.0,
          }),
        });
        if (!imgRes.ok) return;
        const body = await imgRes.json();
        if (body?.image_base64) {
          result.imageUrl = `data:image/png;base64,${body.image_base64}`;
        }
      } catch (e) {
        console.warn("[MassChat] Image gen failed:", e?.message);
      }
    };

    const runMassChat = async () => {
      if (!isDevMode() && !(await hasPurchasedSkill(SKILL_ID))) {
        console.warn("[MassChat] Skill not purchased — execution blocked.");
        return;
      }
      if (!prompt.value.trim() || selectedModels.value.length === 0) return;

      isRunning.value = true;
      emit("status-update", "Starting mass chat...");

      // Build plain-object rows from the downloaded-model catalog. Each row
      // is mutated in place as the run progresses.
      results.value = selectedModels.value.map((filename) => {
        const m = availableModels.value.find((x) => x.filename === filename);
        return {
          filename,
          modelname: m?.modelname || filename,
          url: m?.url,
          filesizeBytes: m?.filesizeBytes,
          parameters: m?.parameters,
          context: m?.context,
          status: "pending",
          response: "",
          durationMs: 0,
          tokensPerSecond: 0,
          imageUrl: null,
          error: null,
        };
      });

      // Sequential — loading multiple GGUFs concurrently would OOM on macOS.
      for (const entry of results.value) {
        emit("status-update", `Running ${entry.modelname}…`);
        await runOneModel(entry);
      }

      emit("status-update", "Mass chat complete.");
      isRunning.value = false;
    };

    // ─── Voting + Library + Export ───────────────────────────────────────
    const vote = async (filename, delta) => {
      votes.value = {
        ...votes.value,
        [filename]: votes.value[filename] === delta ? 0 : delta,
      };
      try {
        await window.electronAPI?.store?.set(VOTE_KEY, votes.value);
      } catch {}
    };

    const saveCurrentPrompt = async () => {
      if (!prompt.value.trim()) return;
      const entry = {
        id: `pl-${Date.now()}`,
        savedAt: Date.now(),
        prompt: prompt.value,
        models: [...selectedModels.value],
      };
      const next = [entry, ...savedPrompts.value].slice(0, MAX_LIBRARY);
      savedPrompts.value = next;
      try {
        await window.electronAPI?.store?.set(PROMPT_LIBRARY_KEY, next);
      } catch {}
    };

    const loadSavedPrompt = (p) => {
      prompt.value = p.prompt;
      selectedModels.value = [...(p.models || [])];
      showLibrary.value = false;
    };

    const deleteSavedPrompt = async (idx) => {
      savedPrompts.value = savedPrompts.value.filter((_, i) => i !== idx);
      try {
        await window.electronAPI?.store?.set(
          PROMPT_LIBRARY_KEY,
          savedPrompts.value,
        );
      } catch {}
    };

    const exportMarkdown = () => {
      if (results.value.length === 0) return;
      const lines = [
        `# Mass Chat Comparison`,
        ``,
        `**Prompt:** ${prompt.value}`,
        ``,
        `Generated: ${new Date().toISOString()}`,
        ``,
        `---`,
        ``,
      ];
      for (const r of results.value) {
        lines.push(`## ${r.modelname}`);
        if (r.status === "done") {
          lines.push(
            `_${r.tokensPerSecond.toFixed(1)} tok/s · ${r.durationMs}ms_`,
          );
          lines.push("");
          lines.push(r.response || "_(no response)_");
        } else if (r.status === "error") {
          lines.push(`**Error:** ${r.error}`);
        }
        lines.push("");
        lines.push("---");
        lines.push("");
      }
      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mass-chat-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    };

    return {
      isFullscreen,
      showLibrary,
      prompt,
      selectedModels,
      availableModels,
      results,
      isRunning,
      generateImages,
      savedPrompts,
      votes,
      gridStyle,
      runMassChat,
      vote,
      saveCurrentPrompt,
      loadSavedPrompt,
      deleteSavedPrompt,
      exportMarkdown,
    };
  },
};
</script>

<style scoped>
.mass-chat-skill {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
  color: var(--bz-fg);
}
.skill-panel {
  padding: var(--bz-space-5);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.skill-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-4);
  margin-bottom: var(--bz-space-4);
}
.skill-panel-actions,
.skill-action-row,
.response-title-row {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}
.skill-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bz-space-4);
}
.skill-title-icon {
  color: var(--bz-purple-300);
  font-size: 42px !important;
  line-height: 1;
}
.skill-section-title {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin: 0 0 var(--bz-space-4);
  color: var(--bz-fg);
}
.skill-textarea {
  width: 100%;
  min-height: 132px;
  padding: var(--bz-space-4);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  color: var(--bz-fg);
  font: inherit;
  resize: vertical;
}
.skill-textarea:focus {
  outline: none;
  border-color: var(--bz-border-brand);
}
.danger-icon { color: var(--bz-danger); }
.title-count { margin-left: var(--bz-space-2); }

.mass-chat-skill.fullscreen {
  background: rgba(18, 18, 22, 0.5) !important;
  border-color: rgba(255, 255, 255, 0.08);
}

/* Run CTA — same green treatment as Chart Forecaster's forecast button. */
.mass-chat-cta {
  box-shadow:
    0 0 0 1px rgba(82, 196, 26, 0.4),
    0 4px 16px rgba(82, 196, 26, 0.2);
}

/* Model grid — compact cards for downloaded LLMs only. */
.mass-chat-model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.mass-chat-model-card {
  background: var(--bz-scrim-soft);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  padding: 12px 14px;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
}
.mass-chat-model-card:hover {
  border-color: rgba(255, 255, 255, 0.6);
  background: var(--bz-purple-soft);
}
.mass-chat-model-card.selected {
  border: 1px solid var(--bz-fg);
  background: var(--bz-purple-soft);
}
.mass-chat-checkbox {
  margin-top: 4px;
  flex: 0 0 auto;
  accent-color: rgb(155, 109, 200);
}
.model-card-content {
  flex: 1;
  text-align: left;
}
/* Model name — matches the skill-title gradient + Fira Sans Condensed italic 900. */
.model-card-name {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 16px;
  letter-spacing: 0.3px;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}

/* Response panels */
.mass-chat-grid {
  display: grid;
  gap: 16px;
}
.mass-chat-panel {
  background: var(--bz-scrim);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}
.mass-chat-panel .panel-header {
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
/* Model name in each response panel — matches the skill title treatment. */
.response-modelname {
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 0.3px;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}
.mass-chat-panel .panel-body {
  padding: 14px 16px;
  overflow-y: auto;
  flex: 1;
  color: rgba(255, 255, 255, 0.92);
}
/* Markdown response — mirrors GenerativeText's rendering. */
.response-text {
  color: rgba(255, 255, 255, 0.92);
  font-size: 14px;
  line-height: 1.6;
  text-align: left;
}
.response-text :deep(p) {
  margin: 0 0 0.75em;
}
.response-text :deep(p:last-child) {
  margin-bottom: 0;
}
.response-text :deep(h1),
.response-text :deep(h2),
.response-text :deep(h3),
.response-text :deep(h4) {
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  margin: 1em 0 0.5em;
  color: rgba(255, 255, 255, 0.95);
}
.response-text :deep(h1) {
  font-size: 20px;
}
.response-text :deep(h2) {
  font-size: 18px;
}
.response-text :deep(h3) {
  font-size: 16px;
}
.response-text :deep(strong) {
  color: var(--bz-fg);
}
.response-text :deep(em) {
  color: rgba(255, 255, 255, 0.85);
}
.response-text :deep(ul),
.response-text :deep(ol) {
  padding-left: 1em;
  margin: 0 0 2em;
}
.response-text :deep(li) {
  margin: 0.75em 0 0.75em;
}
.response-text :deep(code) {
  background: rgba(155, 109, 200, 0.18);
  border: 1px solid rgba(155, 109, 200, 0.3);
  border-radius: 3px;
  padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  color: rgba(255, 200, 140, 0.95);
}
.response-text :deep(pre) {
  background: var(--bz-scrim);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 0.75em 0;
}
.response-text :deep(pre code) {
  background: transparent;
  border: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.9);
}
.response-text :deep(blockquote) {
  border-left: 3px solid rgba(155, 109, 200, 0.6);
  padding-left: 10px;
  margin: 0.5em 0;
  color: var(--bz-fg-mid);
}
.response-text :deep(a) {
  color: #91caff;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.response-text :deep(table) {
  border-collapse: collapse;
  margin: 0.75em 0;
}
.response-text :deep(th),
.response-text :deep(td) {
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 4px 8px;
  font-size: 13px;
}
.response-image {
  margin-top: 10px;
  width: 100%;
  max-width: 320px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.vote-row {
  margin-top: 12px;
  display: flex;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 10px;
}

/* Prompt library */
.library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}
.library-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.library-card-body {
  flex: 1;
  cursor: pointer;
}
.library-card-prompt {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

/* Form inputs */
.input,
.textarea {
  background: var(--bz-scrim);
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--bz-fg);
}
.input::placeholder,
.textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

/* ===== Shared skill styles (match DSLASkill / PolymarketSkill) ===== */

.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px !important;
}

.skill-name {
  font-size: 1.5rem;
  margin: 0;
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51))
    text;
}
.skill-description {
  color: var(--bz-fg-mid);
  margin-bottom: 0.5em;
  text-align: left;
}

/* Agentic redesign: Model Arena */
.arena-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: var(--bz-space-2);
}
.arena-library,
.arena-models,
.arena-prompt,
.arena-responses {
  background: var(--bz-panel);
}
.arena-models {
  position: relative;
}
.arena-models::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--bz-gradient-brand);
  border-radius: var(--bz-r-pill);
}
.arena-prompt {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--bz-space-4);
  align-items: end;
}
.arena-prompt .skill-section-title,
.arena-prompt .skill-textarea {
  grid-column: 1 / -1;
}
.arena-prompt .skill-action-row {
  grid-column: 1 / -1;
  justify-content: flex-end;
}
.mass-chat-model-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.mass-chat-model-card {
  min-height: 88px;
}
.arena-responses .mass-chat-grid {
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)) !important;
}
.mass-chat-panel {
  min-height: 360px;
  max-height: 68vh;
}
.mass-chat-panel .panel-header {
  min-height: 58px;
}
@media (max-width: 780px) {
  .arena-prompt {
    grid-template-columns: 1fr;
  }
}


/* Signature upgrade: arena scoreboard */
.arena-scoreboard {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  gap: var(--bz-space-3);
}
.arena-score-card {
  min-height: 92px;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background:
    linear-gradient(135deg, rgba(155, 109, 200, 0.12), transparent 50%),
    var(--bz-panel);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.arena-score-card span {
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.arena-score-card strong {
  color: var(--bz-fg);
  font-size: clamp(22px, 3vw, 36px);
  line-height: 1;
}
.arena-toolbar {
  margin-top: calc(var(--bz-space-3) * -1);
}
.arena-models,
.arena-prompt,
.arena-responses {
  border-color: var(--bz-border-strong);
}
@media (max-width: 820px) {
  .arena-scoreboard { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

</style>
