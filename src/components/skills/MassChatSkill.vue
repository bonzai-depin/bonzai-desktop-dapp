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
              background: '#0a0a0a',
              overflowY: 'auto',
              padding: '24px',
            }
          : null
      "
    >
      <!-- Skill Header -->
      <div class="models__activity--payouts mb-4 has-text-left">
        <div class="columns is-vcentered">
          <div class="column">
            <h3 class="skill-name is-size-1 fira-sans-condensed-black-italic">
              <span
                class="material-symbols-outlined mr-2"
                style="font-size: 48px; color: var(--bulma-primary)"
              >
                forum
              </span>
              {{ skill?.name || "Mass Chat" }}
            </h3>
            <p class="is-size-5 mt-3 skill-description">
              {{
                skill?.description ||
                "Ask the same question to every downloaded LLM in sequence and compare answers side-by-side."
              }}
            </p>
          </div>
          <div class="column is-narrow">
            <button
              class="button is-outlined is-info mr-5"
              @click="showLibrary = !showLibrary"
              title="Prompt library"
            >
              <span class="material-symbols-outlined">library_books</span>
            </button>
            <button
              class="button is-outlined is-info"
              @click="isFullscreen = !isFullscreen"
              :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
            >
              <span class="material-symbols-outlined">
                {{ isFullscreen ? "fullscreen_exit" : "fullscreen" }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Prompt Library -->
      <div
        v-if="showLibrary"
        class="models__activity--payouts pt-5 pb-5 mt-5"
        style="position: relative; z-index: 11"
      >
        <h2
          class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-4"
        >
          <span
            class="material-symbols-outlined mr-2"
            style="vertical-align: middle"
          >
            library_books
          </span>
          Prompt Library
        </h2>
        <p
          v-if="savedPrompts.length === 0"
          class="has-text-grey-light is-size-6"
        >
          No saved prompts yet. Run a comparison and click "Save to library".
        </p>
        <div v-else class="library-grid">
          <div v-for="(p, i) in savedPrompts" :key="p.id" class="library-card">
            <div class="library-card-body" @click="loadSavedPrompt(p)">
              <div class="is-size-7 has-text-grey-light mb-1">
                {{ new Date(p.savedAt).toLocaleDateString() }} ·
                {{ p.models?.length || 0 }} models
              </div>
              <div class="library-card-prompt">
                {{ p.prompt.slice(0, 140)
                }}{{ p.prompt.length > 140 ? "…" : "" }}
              </div>
            </div>
            <button
              class="button is-small is-danger is-outlined"
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
        class="models__activity--payouts pt-5 pb-5 mt-5"
        style="position: relative; z-index: 11"
      >
        <h2
          class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-4"
        >
          Select Models
          <span class="is-size-6 has-text-grey-light ml-2">
            ({{ selectedModels.length }} /
            {{ availableModels.length }} selected)
          </span>
        </h2>

        <div
          v-if="availableModels.length === 0"
          class="has-text-grey-light is-size-6"
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
              <div class="is-size-7 has-text-grey-light mt-1">
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
      <div
        class="models__activity--payouts pt-5 pb-5 mt-5"
        style="position: relative; z-index: 11"
      >
        <h2
          class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-4"
        >
          Prompt
        </h2>
        <textarea
          v-model="prompt"
          class="textarea is-large"
          rows="3"
          placeholder="Ask every selected model the same question..."
        ></textarea>

        <div
          class="is-flex is-align-items-center mt-4"
          style="gap: 16px; flex-wrap: wrap"
        >
          <div style="flex: 1"></div>
          <button
            v-if="prompt.trim()"
            class="button is-large is-success is-outlined has-text-white mr-2 pl-2 pr-2"
            @click="saveCurrentPrompt"
          >
            <span class="material-symbols-outlined is-size-1">save</span>
          </button>
          <button
            class="button is-success is-large fira-sans-condensed-black-italic pl-2"
            :class="{ 'is-loading': isRunning }"
            :disabled="
              isRunning || !prompt.trim() || selectedModels.length === 0
            "
            @click="runMassChat"
          >
            <span class="material-symbols-outlined is-size-1">play_arrow</span>
            Run Mass Chat ({{ selectedModels.length || 0 }})
          </button>
        </div>
      </div>

      <!-- Split View Results -->
      <div
        v-if="results.length > 0"
        class="models__activity--payouts pt-5 pb-5 mt-5"
        style="position: relative; z-index: 11"
      >
        <div
          class="is-flex is-align-items-center is-justify-content-space-between mb-4"
        >
          <h2
            class="fira-sans-condensed-black-italic is-size-3 has-text-white has-text-left mb-0"
          >
            Responses
          </h2>
          <button
            class="button is-outlined is-info"
            :disabled="results.length === 0"
            @click="exportMarkdown"
            title="Export comparison to markdown"
          >
            <span class="material-symbols-outlined mr-2">download</span>
            Export
          </button>
        </div>
        <div class="mass-chat-grid" :style="gridStyle">
          <div v-for="r in results" :key="r.filename" class="mass-chat-panel">
            <header class="panel-header">
              <div class="is-flex is-align-items-center">
                <span
                  class="material-symbols-outlined mr-1"
                  style="font-size: 18px; color: var(--bulma-info)"
                >
                  neurology
                </span>
                <strong class="response-modelname">{{ r.modelname }}</strong>
              </div>
              <span class="is-size-7 has-text-grey-light">
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
                <div class="notification is-danger is-light">{{ r.error }}</div>
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
      </div>
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
.mass-chat-skill.fullscreen {
  background: rgba(18, 18, 22, 0.5) !important;
  border-color: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(32px);
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
  background: rgba(0, 0, 0, 0.2);
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
  background: rgba(97, 55, 142, 0.2);
}
.mass-chat-model-card.selected {
  border: 1px solid rgba(255, 255, 255, 1);
  background: rgba(97, 55, 142, 0.33);
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
  background: rgba(0, 0, 0, 0.25);
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
  color: white;
}
.response-text :deep(em) {
  color: rgba(255, 255, 255, 0.85);
}
.response-text :deep(ul),
.response-text :deep(ol) {
  padding-left: 1.3em;
  margin: 0 0 0.75em;
}
.response-text :deep(li) {
  margin: 0.2em 0;
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
  background: rgba(0, 0, 0, 0.35);
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
  color: rgba(255, 255, 255, 0.8);
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
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.2);
  color: white;
}
.input::placeholder,
.textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

/* ===== Shared skill styles (match DSLASkill / PolymarketSkill) ===== */

.models__activity--payouts {
  padding: 2em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
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
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 0.5em;
  text-align: left;
}
</style>
