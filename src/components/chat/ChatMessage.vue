<template>
  <article
    class="bz-msg"
    :class="[
      `bz-msg--${role}`,
      { 'bz-msg--streaming': streaming },
    ]"
  >
    <!-- Marker — left-edge identifier. User: a dot. Assistant: a
         brand-purple gradient dot. Tool: an info dot. Keeps the column
         aligned without a heavyweight avatar. -->
    <span
      class="bz-msg__marker"
      :class="`bz-msg__marker--${role}`"
      :title="markerTitle"
      aria-hidden="true"
    ></span>

    <!-- Header — role label + model badge + timestamp + ellipsis menu -->
    <header class="bz-msg__head">
      <span class="bz-eyebrow bz-msg__role">{{ roleLabel }}</span>
      <span v-if="model" class="bz-msg__model bz-mono">{{ model }}</span>
      <span v-if="ts" class="bz-msg__ts bz-mono bz-meta">{{ tsLabel }}</span>

      <div class="bz-msg__actions">
        <button
          type="button"
          class="bz-msg__action"
          :title="copied ? 'Copied' : 'Copy message'"
          :aria-label="copied ? 'Copied' : 'Copy'"
          @click="onCopy"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            {{ copied ? 'check' : 'content_copy' }}
          </span>
        </button>
        <button
          v-if="role === 'assistant'"
          type="button"
          class="bz-msg__action"
          title="Inspect"
          aria-label="Open inspector"
          @click="$emit('inspect')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">info</span>
        </button>
        <button
          v-if="role === 'assistant'"
          type="button"
          class="bz-msg__action"
          title="Regenerate"
          aria-label="Regenerate response"
          @click="$emit('regenerate')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
        </button>
      </div>
    </header>

    <!-- Thinking block — collapsible "show reasoning" section. Only
         renders when the model produces explicit thinking output. -->
    <details v-if="thinking" class="bz-msg__thinking">
      <summary class="bz-eyebrow">Thinking</summary>
      <div class="bz-msg__thinking-body">{{ thinking }}</div>
    </details>

    <!-- Body — the actual message content. Slot for parent's renderer
         (markdown render goes here) or fallback to plain text. -->
    <div class="bz-msg__body">
      <slot>
        <div v-if="content" class="bz-msg__plain">{{ content }}</div>
      </slot>
      <span v-if="streaming" class="bz-msg__caret" aria-hidden="true">▎</span>
    </div>

    <!-- Footer — attachments / tool call summary -->
    <footer
      v-if="attachments?.length || toolCalls?.length"
      class="bz-msg__foot"
    >
      <div v-if="attachments?.length" class="bz-msg__atts">
        <span
          v-for="(att, i) in attachments"
          :key="i"
          class="bz-msg__att"
        >
          <span class="material-symbols-outlined">{{ attIcon(att) }}</span>
          <span>{{ att.name || att.label || 'attachment' }}</span>
        </span>
      </div>
      <div v-if="toolCalls?.length" class="bz-msg__tools">
        <span
          v-for="(tool, i) in toolCalls"
          :key="i"
          class="bz-tag bz-mono"
          :title="tool.detail"
        >
          {{ tool.name }}
        </span>
      </div>
    </footer>
  </article>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  /** "user" | "assistant" | "tool" | "system" */
  role: { type: String, default: "assistant" },
  /** Plain-text content (used when no slot is provided). */
  content: { type: String, default: "" },
  /** Optional thinking / reasoning text — collapsed by default. */
  thinking: { type: String, default: "" },
  /** Model name shown as a mono badge in the header. */
  model: { type: String, default: "" },
  /** Unix ts (ms) — rendered as relative ("12s ago") in the header. */
  ts: { type: Number, default: 0 },
  /** True while the message is being streamed from the model. */
  streaming: { type: Boolean, default: false },
  /** Optional attachments: [{ kind, name, label }, …] */
  attachments: { type: Array, default: () => [] },
  /** Optional tool calls: [{ name, detail }, …] */
  toolCalls: { type: Array, default: () => [] },
});

defineEmits(["inspect", "regenerate"]);

const ROLE_LABEL = {
  user: "You",
  assistant: "BonzAI",
  tool: "Tool",
  system: "System",
};
const roleLabel = computed(() => ROLE_LABEL[props.role] || props.role);
const markerTitle = computed(() => roleLabel.value);

const tsLabel = computed(() => {
  if (!props.ts) return "";
  const ms = Date.now() - props.ts;
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(props.ts).toLocaleDateString();
});

const ATTACHMENT_ICON = {
  image: "image",
  audio: "graphic_eq",
  video: "movie",
  file: "description",
};
function attIcon(att) {
  return ATTACHMENT_ICON[att?.kind] || "attach_file";
}

const copied = ref(false);
let _resetTimer = null;
async function onCopy() {
  const text = props.content;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    if (_resetTimer) clearTimeout(_resetTimer);
    _resetTimer = setTimeout(() => { copied.value = false; }, 1600);
  } catch {}
}
</script>

<style scoped>
/* Editorial chat message — Claude-meets-Linear cadence.
   Single column, max-width controlled by parent. The header is a
   small eyebrow row; the body is the focus; actions reveal on hover. */

.bz-msg {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  column-gap: var(--bz-space-3);
  row-gap: var(--bz-space-2);
  padding: var(--bz-space-4) 0;
  border-bottom: 1px solid var(--bz-border);
}
.bz-msg:first-child { padding-top: 0; }
.bz-msg:last-child  { border-bottom: 0; padding-bottom: var(--bz-space-3); }

/* Marker — left-edge dot identifying the role. */
.bz-msg__marker {
  width: 8px;
  height: 8px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-fg-faint);
  margin-top: 8px;
  grid-row: 1 / span 4;
  justify-self: center;
}
.bz-msg__marker--user { background: var(--bz-fg-mid); }
.bz-msg__marker--assistant {
  background: var(--bz-purple-300);
  box-shadow: 0 0 0 3px var(--bz-purple-soft);
}
.bz-msg__marker--tool      { background: var(--bz-info); }
.bz-msg__marker--system    { background: var(--bz-warning); }

/* Header — role / model / time / actions */
.bz-msg__head {
  grid-column: 2;
  display: flex;
  align-items: baseline;
  gap: var(--bz-space-3);
  flex-wrap: wrap;
}
.bz-msg__role {
  color: var(--bz-fg);
  font-weight: 400;
}
.bz-msg__model {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}
.bz-msg__ts { margin-left: auto; }

/* Action cluster — visible on hover for the message. Inline icon
   buttons; never use the brand color for these. */
.bz-msg__actions {
  display: flex;
  gap: 2px;
  margin-left: var(--bz-space-2);
  opacity: 0;
  transition: opacity var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-msg:hover .bz-msg__actions { opacity: 1; }
.bz-msg__actions:focus-within  { opacity: 1; }
.bz-msg__action {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-low);
  cursor: pointer;
  transition: background var(--bz-dur-fast), color var(--bz-dur-fast);
}
.bz-msg__action:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}
.bz-msg__action .material-symbols-outlined { font-size: 16px !important; }

/* Thinking — collapsed by default; calmer cadence than body. */
.bz-msg__thinking {
  grid-column: 2;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  padding: var(--bz-space-2) var(--bz-space-3);
  cursor: pointer;
}
.bz-msg__thinking summary {
  list-style: none;
  color: var(--bz-fg-low);
}
.bz-msg__thinking summary::-webkit-details-marker { display: none; }
.bz-msg__thinking-body {
  margin-top: var(--bz-space-2);
  padding-top: var(--bz-space-2);
  border-top: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  line-height: var(--bz-line-body);
  white-space: pre-wrap;
}

/* Body — the actual content. The slot is what carries markdown.
   :deep so prose styling reaches the renderer's nested elements. */
.bz-msg__body {
  grid-column: 2;
  color: var(--bz-fg);
  font-size: var(--bz-size-body);
  line-height: var(--bz-line-body);
  word-break: break-word;
}
.bz-msg__plain { white-space: pre-wrap; }

.bz-msg__body :deep(p)  { margin: 0 0 var(--bz-space-3) 0; }
.bz-msg__body :deep(p:last-child) { margin-bottom: 0; }
.bz-msg__body :deep(h1),
.bz-msg__body :deep(h2),
.bz-msg__body :deep(h3) {
  margin: var(--bz-space-4) 0 var(--bz-space-2);
  font-family: 'Fira Sans Condensed', sans-serif;
  font-style: italic;
  font-weight: 900;
  color: var(--bz-fg);
}
.bz-msg__body :deep(h1) { font-size: var(--bz-size-h2); }
.bz-msg__body :deep(h2) { font-size: var(--bz-size-h3); }
.bz-msg__body :deep(h3) { font-size: var(--bz-size-body); }
.bz-msg__body :deep(ul),
.bz-msg__body :deep(ol) { margin: 0 0 var(--bz-space-3) var(--bz-space-4); }
.bz-msg__body :deep(li) { margin-bottom: var(--bz-space-1); }
.bz-msg__body :deep(a) {
  color: var(--bz-purple-300);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.bz-msg__body :deep(a:hover) { color: var(--bz-purple-100); }
.bz-msg__body :deep(code) {
  font-family: var(--bz-font-mono);
  font-size: 0.92em;
  padding: 1px 6px;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.bz-msg__body :deep(pre) {
  margin: var(--bz-space-3) 0;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: var(--bz-space-3) var(--bz-space-4);
  overflow-x: auto;
}
.bz-msg__body :deep(pre code) {
  background: transparent;
  border: 0;
  padding: 0;
}
.bz-msg__body :deep(blockquote) {
  margin: 0 0 var(--bz-space-3) 0;
  padding-left: var(--bz-space-4);
  border-left: 2px solid var(--bz-border-strong);
  color: var(--bz-fg-mid);
}

/* Streaming caret — pulses while the assistant is mid-stream. */
.bz-msg__caret {
  display: inline-block;
  margin-left: 2px;
  color: var(--bz-purple-300);
  animation: bz-pulse 1.1s ease-in-out infinite;
}

/* Footer — attachment chips and tool tags. */
.bz-msg__foot {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-2);
}
.bz-msg__atts,
.bz-msg__tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.bz-msg__att {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 3px var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
}
.bz-msg__att .material-symbols-outlined {
  font-size: 14px !important;
  color: var(--bz-fg-low);
}
.bz-tag {
  padding: 2px var(--bz-space-2);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  font-size: var(--bz-size-micro);
  color: var(--bz-fg-mid);
}
</style>
