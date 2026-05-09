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
          <p class="bz-eyebrow">{{ kindLabel }}</p>
          <h2 class="bz-h2">Inspector</h2>
          <BzCloseButton
            class="bz-rail__close"
            size="md"
            aria-label="Close inspector"
            title="Close (Esc)"
            @click="close"
          />
        </header>

        <div class="bz-rail__body">
          <!-- Preview — image / video / audio thumb-or-player -->
          <div v-if="g?.mediaUrl" class="bz-rail__preview">
            <img v-if="isImage" :src="g.mediaUrl" alt="" />
            <video v-else-if="isVideo" :src="g.mediaUrl" controls preload="metadata" />
            <audio v-else-if="isAudio" :src="g.mediaUrl" controls />
            <div v-else class="bz-rail__preview-stub bz-meta">No preview</div>
          </div>

          <!-- Prompt block — top-of-mind data -->
          <section v-if="g?.prompt" class="bz-rail__group">
            <p class="bz-eyebrow">Prompt</p>
            <p class="bz-rail__prompt">{{ g.prompt }}</p>
          </section>
          <section v-if="g?.negativePrompt" class="bz-rail__group">
            <p class="bz-eyebrow">Negative</p>
            <p class="bz-rail__prompt bz-rail__prompt--soft">{{ g.negativePrompt }}</p>
          </section>

          <!-- Model + parameters — the technical record. Mono. -->
          <section class="bz-rail__group">
            <p class="bz-eyebrow">Model</p>
            <dl class="bz-kv">
              <template v-for="row in modelRows" :key="row.k">
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

const isImage = computed(() => g.value?.kind === "image" || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(g.value?.mediaUrl || "") || /^data:image\//.test(g.value?.mediaUrl || ""));
const isVideo = computed(() => g.value?.kind === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(g.value?.mediaUrl || ""));
const isAudio = computed(() => g.value?.kind === "audio" || g.value?.kind === "music" || /\.(mp3|wav|ogg|flac|m4a)(\?|$)/i.test(g.value?.mediaUrl || ""));

const ORIGIN_LABEL = {
  local: "Local",
  consumer: "Remote provider",
  private: "Private (sharded)",
};
const originLabel = computed(() => ORIGIN_LABEL[g.value?.networkMode] || g.value?.networkMode || "");

const modelRows = computed(() => {
  const v = g.value || {};
  const rows = [];
  if (v.model || v.modelId) rows.push({ k: "Model", v: v.model || v.modelId });
  if (v.seed != null)       rows.push({ k: "Seed", v: String(v.seed) });
  if (v.steps != null)      rows.push({ k: "Steps", v: String(v.steps) });
  if (v.guidanceScale != null) rows.push({ k: "Guidance", v: String(v.guidanceScale) });
  if (v.width && v.height)  rows.push({ k: "Size", v: `${v.width}×${v.height}` });
  if (v.ts)                 rows.push({ k: "Created", v: new Date(v.ts).toLocaleString() });
  return rows;
});

const extraRows = computed(() => {
  const e = g.value?.extra || {};
  return Object.keys(e).map((k) => ({ k, v: String(e[k]) }));
});

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
  bottom: 64px;            /* leave the bottom bar visible */
  width: min(360px, 92vw);
  z-index: var(--bz-z-modal);
  background: var(--bz-card);
  border-left: 1px solid var(--bz-border);
  box-shadow: var(--bz-elev-3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bz-rail__header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  gap: var(--bz-space-3);
  padding: var(--bz-space-5) var(--bz-space-5) var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
}
.bz-rail__header .bz-eyebrow { margin: 0 0 var(--bz-space-1) 0; }
.bz-rail__header h2 { margin: 0; color: var(--bz-fg); }
.bz-rail__close { grid-row: span 2; align-self: start; }

.bz-rail__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--bz-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-6);
}

/* Preview — fills width, capped height so even portraits don't dominate. */
.bz-rail__preview {
  width: 100%;
  border-radius: var(--bz-r);
  overflow: hidden;
  background: var(--bz-canvas);
  display: flex;
  align-items: center;
  justify-content: center;
}
.bz-rail__preview img,
.bz-rail__preview video {
  width: 100%;
  max-height: 360px;
  object-fit: contain;
  display: block;
}
.bz-rail__preview audio {
  width: 100%;
  margin: var(--bz-space-3);
}
.bz-rail__preview-stub {
  padding: var(--bz-space-7);
}

/* Prompt block — wrapping prose, calmer color. */
.bz-rail__group {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}
.bz-rail__group .bz-eyebrow { margin: 0; }
.bz-rail__prompt {
  margin: 0;
  font-size: var(--bz-size-body);
  line-height: var(--bz-line-body);
  color: var(--bz-fg);
  white-space: pre-wrap;
  word-break: break-word;
}
.bz-rail__prompt--soft { color: var(--bz-fg-mid); }

/* Key/value grid for the model + on-chain blocks. */
.bz-kv {
  margin: 0;
  display: grid;
  grid-template-columns: minmax(0, 88px) minmax(0, 1fr);
  gap: var(--bz-space-2) var(--bz-space-4);
  font-size: var(--bz-size-meta);
}
.bz-kv dt {
  color: var(--bz-fg-low);
  text-transform: uppercase;
  letter-spacing: var(--bz-track-eyebrow);
  font-size: var(--bz-size-micro);
  padding-top: 2px;
}
.bz-kv dd {
  margin: 0;
  color: var(--bz-fg);
  word-break: break-word;
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
