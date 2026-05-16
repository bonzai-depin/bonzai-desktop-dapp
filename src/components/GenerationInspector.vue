<template>
  <Teleport to="body">
    <Transition name="bz-rail" @after-leave="afterLeave">
      <aside
        v-if="inspector.state.open"
        class="bz-rail"
        role="complementary"
        aria-label="Generation details"
      >
        <header class="bz-rail__header">
          <div class="bz-rail__title">
            <p class="bz-eyebrow">{{ kindLabel }}</p>
            <h2 class="bz-h2">Inspector</h2>
          </div>
          <BzCloseButton
            class="bz-rail__close"
            size="md"
            aria-label="Close inspector"
            title="Close (Esc)"
            @click="close"
          />
        </header>

        <div class="bz-rail__body">
          <!-- Prompt block — top-of-mind data -->
          <section v-if="g?.prompt" class="bz-rail__group">
            <p class="bz-eyebrow">Prompt</p>
            <p class="bz-rail__prompt">{{ g.prompt }}</p>
          </section>
          <section v-if="g?.negativePrompt" class="bz-rail__group">
            <p class="bz-eyebrow">Negative</p>
            <p class="bz-rail__prompt bz-rail__prompt--soft">{{ g.negativePrompt }}</p>
          </section>
          <section v-if="g?.outputText" class="bz-rail__group">
            <p class="bz-eyebrow">Answer</p>
            <div class="bz-rail__output">{{ g.outputText }}</div>
          </section>
          <section v-if="g?.systemPrompt" class="bz-rail__group">
            <p class="bz-eyebrow">System</p>
            <p class="bz-rail__prompt bz-rail__prompt--soft">{{ g.systemPrompt }}</p>
          </section>

          <!-- Run status and timing — what happened, when, and how much. -->
          <section v-if="runRows.length" class="bz-rail__group">
            <p class="bz-eyebrow">Run</p>
            <dl class="bz-kv">
              <template v-for="row in runRows" :key="row.k">
                <dt>{{ row.k }}</dt>
                <dd :class="{ 'bz-mono': row.mono }">{{ row.v }}</dd>
              </template>
            </dl>
          </section>

          <!-- Model + parameters — the technical record. Mono. -->
          <section v-if="modelRows.length" class="bz-rail__group">
            <p class="bz-eyebrow">Model</p>
            <dl class="bz-kv">
              <template v-for="row in modelRows" :key="row.k">
                <dt>{{ row.k }}</dt>
                <dd class="bz-mono">{{ row.v }}</dd>
              </template>
            </dl>
          </section>
          <section v-if="parameterRows.length" class="bz-rail__group">
            <p class="bz-eyebrow">Parameters</p>
            <dl class="bz-kv">
              <template v-for="row in parameterRows" :key="row.k">
                <dt>{{ row.k }}</dt>
                <dd class="bz-mono">{{ row.v }}</dd>
              </template>
            </dl>
          </section>

          <!-- Network — origin badge + peer ID when sourced via P2P -->
          <section v-if="g?.networkMode" class="bz-rail__group">
            <p class="bz-eyebrow">Origin</p>
            <div class="bz-rail__origin">
              <span class="bz-origin-pill" :class="`bz-origin-pill--${g.networkMode}`">
                <span class="bz-origin-pill__dot"></span>
                {{ originLabel }}
              </span>
              <code v-if="g?.peerId" class="bz-mono bz-meta bz-rail__peer">
                {{ shortId(g.peerId) }}
              </code>
            </div>
          </section>

          <!-- Conversation lineage — useful for forked chats. -->
          <section v-if="lineageRows.length" class="bz-rail__group">
            <p class="bz-eyebrow">Lineage</p>
            <dl class="bz-kv">
              <template v-for="row in lineageRows" :key="row.k">
                <dt>{{ row.k }}</dt>
                <dd :class="{ 'bz-mono': row.mono }">{{ row.v }}</dd>
              </template>
            </dl>
          </section>

          <!-- Stable identifiers — full values stay selectable/copyable. -->
          <section v-if="identityRows.length" class="bz-rail__group">
            <p class="bz-eyebrow">Storage</p>
            <dl class="bz-kv">
              <template v-for="row in identityRows" :key="row.k">
                <dt>{{ row.k }}</dt>
                <dd class="bz-mono">{{ row.v }}</dd>
              </template>
            </dl>
          </section>

          <!-- Mint state — only when present -->
          <section v-if="g?.mintState" class="bz-rail__group">
            <p class="bz-eyebrow">On-chain</p>
            <dl class="bz-kv">
              <template v-if="g.mintState.network">
                <dt>Network</dt>
                <dd>{{ g.mintState.network }}</dd>
              </template>
              <template v-if="g.mintState.contract">
                <dt>Contract</dt>
                <dd class="bz-mono">{{ shortId(g.mintState.contract) }}</dd>
              </template>
              <template v-if="g.mintState.tokenId != null">
                <dt>Token</dt>
                <dd class="bz-mono">#{{ g.mintState.tokenId }}</dd>
              </template>
              <template v-if="g.mintState.txHash">
                <dt>Tx</dt>
                <dd class="bz-mono">{{ shortId(g.mintState.txHash) }}</dd>
              </template>
            </dl>
          </section>

          <!-- Free-form extras the caller wants surfaced -->
          <section v-if="extraRows.length" class="bz-rail__group">
            <p class="bz-eyebrow">Details</p>
            <dl class="bz-kv">
              <template v-for="row in extraRows" :key="row.k">
                <dt>{{ row.k }}</dt>
                <dd class="bz-mono">{{ row.v }}</dd>
              </template>
            </dl>
          </section>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from "vue";
import { inspector } from "../services/generationInspector.service.js";
import BzCloseButton from "./BzCloseButton.vue";

const g = computed(() => inspector.state.generation);

const KIND_LABEL = {
  image: "Image", video: "Video", audio: "Audio", music: "Music", text: "Text",
};
const kindLabel = computed(() => KIND_LABEL[g.value?.kind] || "Generation");

const sniffImageMime = (imageData) => {
  if (!imageData) return "image/webp";
  const value = String(imageData);
  const dataUrlMatch = value.match(/^data:([^;]+);base64,/i);
  if (dataUrlMatch) return dataUrlMatch[1];
  try {
    const head = atob(value.slice(0, 32));
    if (head.startsWith("\x89PNG")) return "image/png";
    if (head.startsWith("\xff\xd8\xff")) return "image/jpeg";
    if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  } catch {}
  return "image/webp";
};

const normalizeImageDataUrl = (value, mime) => {
  if (!value) return "";
  const str = String(value);
  if (/^data:image\//i.test(str)) return str;
  if (/^(https?:|blob:|file:)/i.test(str)) return str;
  if (str.length > 64 && /^[A-Za-z0-9+/=\s]+$/.test(str)) {
    return `data:${mime || sniffImageMime(str)};base64,${str.replace(/\s+/g, "")}`;
  }
  return str;
};

const previewMediaUrl = computed(() => {
  const v = g.value || {};
  if (v.mediaUrl) return normalizeImageDataUrl(v.mediaUrl, v.mimeType || v.mime_type);
  if (v.imageData || v.image) return normalizeImageDataUrl(v.imageData || v.image, v.mimeType || v.mime_type);
  if (v.videoUrl || v.videoPath) return v.videoUrl || v.videoPath;
  if (v.audioUrl || v.audioPath) return v.audioUrl || v.audioPath;
  return "";
});

const isImage = computed(() => g.value?.kind === "image" || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(previewMediaUrl.value || "") || /^data:image\//.test(previewMediaUrl.value || ""));
const isVideo = computed(() => g.value?.kind === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(previewMediaUrl.value || ""));
const isAudio = computed(() => g.value?.kind === "audio" || g.value?.kind === "music" || /\.(mp3|wav|ogg|flac|m4a)(\?|$)/i.test(previewMediaUrl.value || ""));

const ORIGIN_LABEL = {
  local: "Local",
  consumer: "Remote provider",
  private: "Private (sharded)",
};
const originLabel = computed(() => ORIGIN_LABEL[g.value?.networkMode] || g.value?.networkMode || "");

const formatDate = (value) => {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const runRows = computed(() => {
  const v = g.value || {};
  const rows = [];
  if (v.status) rows.push({ k: "Status", v: v.status });
  if (v.errorMessage) rows.push({ k: "Error", v: v.errorMessage });
  if (v.ts || v.createdAt) rows.push({ k: "Created", v: formatDate(v.ts || v.createdAt) });
  if (v.elapsedMs != null) rows.push({ k: "Elapsed", v: `${Math.round(Number(v.elapsedMs))} ms`, mono: true });
  else if (v.extra?.elapsedMs) rows.push({ k: "Elapsed", v: String(v.extra.elapsedMs), mono: true });
  if (v.extra?.tokensPerSecond) rows.push({ k: "Speed", v: String(v.extra.tokensPerSecond), mono: true });
  if (v.extra?.promptWords) rows.push({ k: "Prompt words", v: String(v.extra.promptWords), mono: true });
  if (v.extra?.promptChars) rows.push({ k: "Prompt chars", v: String(v.extra.promptChars), mono: true });
  if (v.extra?.responseWords) rows.push({ k: "Answer words", v: String(v.extra.responseWords), mono: true });
  if (v.extra?.responseChars) rows.push({ k: "Answer chars", v: String(v.extra.responseChars), mono: true });
  return rows;
});

const modelRows = computed(() => {
  const v = g.value || {};
  const rows = [];
  const modelName = String(v.model || "").trim();
  const modelId = String(v.modelId || "").trim();
  if (v.model) rows.push({ k: "Name", v: v.model });
  if (modelId && modelId !== modelName) rows.push({ k: "ID", v: v.modelId });
  if (v.kind) rows.push({ k: "Kind", v: kindLabel.value });
  return rows;
});

const parameterRows = computed(() => {
  const v = g.value || {};
  const rows = [];
  if (v.maxTokens != null) rows.push({ k: "Max tokens", v: String(v.maxTokens) });
  if (v.temperature != null) rows.push({ k: "Temperature", v: String(v.temperature) });
  if (v.seed != null) rows.push({ k: "Seed", v: String(v.seed) });
  if (v.steps != null) rows.push({ k: "Steps", v: String(v.steps) });
  if (v.guidanceScale != null) rows.push({ k: "Guidance", v: String(v.guidanceScale) });
  if (v.width && v.height) rows.push({ k: "Size", v: `${v.width}×${v.height}` });
  if (v.reasoning) rows.push({ k: "Reasoning", v: v.reasoning });
  return rows;
});

const lineageRows = computed(() => {
  const l = g.value?.lineage || {};
  const rows = [];
  if (l.parentId) rows.push({ k: "Parent", v: l.parentId, mono: true });
  if (l.rootId) rows.push({ k: "Root", v: l.rootId, mono: true });
  if (l.depth != null && Number(l.depth) > 0) rows.push({ k: "Depth", v: String(l.depth), mono: true });
  if (l.pinned != null) rows.push({ k: "Pinned", v: l.pinned ? "Yes" : "No" });
  return rows;
});

const identityRows = computed(() => {
  const v = g.value || {};
  const rows = [];
  if (v.id) rows.push({ k: "Message ID", v: v.id });
  if (v.answerId) rows.push({ k: "Answer ID", v: v.answerId });
  if (previewMediaUrl.value && !/^data:/.test(previewMediaUrl.value)) rows.push({ k: "Media URL", v: previewMediaUrl.value });
  return rows;
});

const extraRows = computed(() => {
  const e = g.value?.extra || {};
  const hidden = new Set(["tokensPerSecond", "promptWords", "promptChars", "responseWords", "responseChars", "elapsedMs"]);
  return Object.keys(e)
    .filter((k) => !hidden.has(k))
    .map((k) => ({ k: labelize(k), v: String(e[k]) }));
});

function labelize(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Truncate hashes / IDs to mid-string with a real ellipsis.
function shortId(s) {
  if (!s) return "";
  if (s.length <= 18) return s;
  return s.slice(0, 8) + "…" + s.slice(-6);
}

function close() { inspector.hide(); }
function afterLeave() { inspector._clear(); }

function onKey(e) {
  if (inspector.state.open && e.key === "Escape") {
    e.preventDefault();
    close();
  }
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════════
   GENERATION INSPECTOR — slide-in right rail
   Shared across image / video / audio / music / text Generative tabs.
   The output that triggered the rail dominates the screen; the rail
   contributes the metadata story without obscuring the work.
   ════════════════════════════════════════════════════════════════════ */

.bz-rail {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  height: 100dvh;
  width: min(460px, 92vw);
  z-index: var(--bz-z-modal);
  background: var(--bz-card);
  border-left: 1px solid var(--bz-border);
  box-shadow: var(--bz-elev-3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bz-rail__header {
  position: relative;
  padding: var(--bz-space-5) calc(var(--bz-space-5) + 40px) var(--bz-space-4) var(--bz-space-5);
  border-bottom: 1px solid var(--bz-border);
}
.bz-rail__title {
  min-width: 0;
}
.bz-rail__header .bz-eyebrow { margin: 0 0 var(--bz-space-1) 0; }
.bz-rail__header h2 { margin: 0; color: var(--bz-fg); }
.bz-rail__close {
  position: absolute;
  top: var(--bz-space-4);
  right: var(--bz-space-4);
}

.bz-rail__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--bz-space-5) var(--bz-space-5) var(--bz-space-7);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
}

/* Prompt block — wrapping prose, calmer color. */
.bz-rail__group {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}
.bz-rail__group .bz-eyebrow {
  margin: 0;
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 0;
  color: var(--bz-fg);
}
.bz-rail__prompt {
  margin: 0;
  font-size: var(--bz-size-body);
  line-height: var(--bz-line-body);
  color: var(--bz-fg);
  white-space: pre-wrap;
  word-break: break-word;
}
.bz-rail__prompt--soft { color: var(--bz-fg-mid); }
.bz-rail__output {
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Key/value grid for the model + on-chain blocks. */
.bz-kv {
  margin: 0;
  display: grid;
  grid-template-columns: minmax(116px, 0.42fr) minmax(0, 1fr);
  gap: var(--bz-space-2) var(--bz-space-4);
  font-size: var(--bz-size-meta);
}
.bz-kv dt {
  min-width: 0;
  color: var(--bz-fg-low);
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0;
  font-size: var(--bz-size-micro);
  padding-top: 2px;
  overflow-wrap: anywhere;
}
.bz-kv dd {
  min-width: 0;
  margin: 0;
  color: var(--bz-fg);
  overflow-wrap: anywhere;
  word-break: normal;
  text-align: left;
}

/* Origin pill — same shape as the picker's loaded-pill, color-coded. */
.bz-rail__origin {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  flex-wrap: wrap;
}
.bz-origin-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 4px var(--bz-space-3);
  border-radius: var(--bz-r-pill);
  font-size: var(--bz-size-micro);
  letter-spacing: var(--bz-track-eyebrow);
  text-transform: uppercase;
  border: 1px solid var(--bz-border);
}
.bz-origin-pill__dot {
  width: 6px; height: 6px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-fg-low);
}
.bz-origin-pill--local        { color: var(--bz-fg-mid); }
.bz-origin-pill--consumer     { color: var(--bz-info); border-color: var(--bz-info-soft); }
.bz-origin-pill--consumer .bz-origin-pill__dot { background: var(--bz-info); }
.bz-origin-pill--private      { color: var(--bz-purple-300); border-color: var(--bz-border-brand); background: var(--bz-purple-soft); }
.bz-origin-pill--private .bz-origin-pill__dot { background: var(--bz-purple-300); }

.bz-rail__peer { color: var(--bz-fg-low); }

/* Slide-in transition — the rail's own motion. Fast enough not to
   block the user, slow enough to read as intentional. */
.bz-rail-enter-active,
.bz-rail-leave-active {
  transition: transform var(--bz-dur-base) var(--bz-ease-out);
}
.bz-rail-enter-from,
.bz-rail-leave-to {
  transform: translateX(100%);
}
</style>
