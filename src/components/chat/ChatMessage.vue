<template>
  <article
    class="bz-msg"
    :class="[
      `bz-msg--${role}`,
      { 'bz-msg--streaming': streaming },
      { 'bz-msg--error': error },
    ]"
    :aria-busy="streaming ? 'true' : 'false'"
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
      <div class="bz-msg__identity">
        <span class="bz-eyebrow bz-msg__role">{{ roleLabel }}</span>
        <span v-if="model" class="bz-msg__model bz-mono">{{ model }}</span>
      </div>

      <span v-if="ts" class="bz-msg__ts bz-mono bz-meta">{{ tsLabel }}</span>
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
        <div v-else-if="streaming" class="bz-msg__skeleton" aria-label="Loading">
          <span class="bz-msg__dot"></span>
          <span class="bz-msg__dot"></span>
          <span class="bz-msg__dot"></span>
        </div>
      </slot>
      <span v-if="streaming && content" class="bz-msg__caret" aria-hidden="true">▎</span>
    </div>

    <div class="bz-msg__actions">
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
        v-if="role === 'user'"
        type="button"
        class="bz-msg__action"
        title="Edit"
        aria-label="Edit message"
        @click="$emit('edit')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">edit</span>
      </button>
      <button
        v-if="role === 'assistant' && !error && mintable"
        type="button"
        class="bz-msg__action"
        :title="minted ? 'Already minted' : 'Mint answer as NFT'"
        :aria-label="minted ? 'Already minted' : 'Mint answer'"
        @click="$emit('mint')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          {{ minted ? 'check_circle' : 'token' }}
        </span>
      </button>
      <button
        v-if="role === 'assistant' && error"
        type="button"
        class="bz-msg__action"
        title="Retry"
        aria-label="Retry generation"
        @click="$emit('retry')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
      </button>
      <button
        v-if="role === 'assistant' && !error"
        type="button"
        class="bz-msg__action"
        title="Regenerate"
        aria-label="Regenerate response"
        @click="$emit('regenerate')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
      </button>
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
        type="button"
        class="bz-msg__action"
        title="Delete"
        aria-label="Delete message"
        @click="$emit('delete')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
      </button>
    </div>

    <!-- Footer — attachments / tool call summary / error notice -->
    <footer
      v-if="attachments?.length || toolCalls?.length || error || stopped"
      class="bz-msg__foot"
    >
      <div v-if="stopped" class="bz-msg__stopped">
        <span class="material-symbols-outlined" aria-hidden="true">stop_circle</span>
        <span>Stopped</span>
      </div>
      <div v-if="error" class="bz-msg__error">
        <span class="material-symbols-outlined" aria-hidden="true">error</span>
        <span class="bz-msg__error-body">{{ errorMessage || "Generation failed" }}</span>
        <span v-if="role === 'assistant'" class="bz-msg__error-actions">
          <button type="button" class="bz-msg__error-btn" @click="$emit('retry')">
            Retry
          </button>
          <button
            v-if="canSwitchLocal"
            type="button"
            class="bz-msg__error-btn bz-msg__error-btn--primary"
            @click="$emit('switch-local')"
          >
            Switch to local mode
          </button>
        </span>
      </div>
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
import { i18n } from "../../i18n/index.js";

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
  /** True if generation failed but partial text is preserved. */
  error: { type: Boolean, default: false },
  /** True when the user stopped generation and the partial text was preserved. */
  stopped: { type: Boolean, default: false },
  /** Short error message shown in the footer when error is true. */
  errorMessage: { type: String, default: "" },
  /** True when the failed request can be retried through local inference. */
  canSwitchLocal: { type: Boolean, default: false },
  /** True if this message can be minted (has content + not streaming). */
  mintable: { type: Boolean, default: false },
  /** True if this message has already been minted. */
  minted: { type: Boolean, default: false },
  /** Optional attachments: [{ kind, name, label }, …] */
  attachments: { type: Array, default: () => [] },
  /** Optional tool calls: [{ name, detail }, …] */
  toolCalls: { type: Array, default: () => [] },
});

defineEmits(["inspect", "regenerate", "edit", "delete", "retry", "switch-local", "mint"]);



const ROLE_LABEL = {
  user: "YOU",
  assistant: "BONZAI",
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
  return new Date(props.ts).toLocaleDateString(i18n.state.locale);
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
    if (window.electronAPI?.copyText) {
      await window.electronAPI.copyText(text);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      copyWithTextarea(text);
    }
    copied.value = true;
    if (_resetTimer) clearTimeout(_resetTimer);
    _resetTimer = setTimeout(() => { copied.value = false; }, 1600);
  } catch {
    try {
      copyWithTextarea(text);
      copied.value = true;
      if (_resetTimer) clearTimeout(_resetTimer);
      _resetTimer = setTimeout(() => { copied.value = false; }, 1600);
    } catch {}
  }
}

function copyWithTextarea(text) {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
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
  margin-top: 2px;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--bz-space-3);
}
.bz-msg__identity {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  min-width: 0;
}
.bz-msg__role {
  color: var(--bz-fg);
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
  text-transform: uppercase;
  flex-shrink: 0;
}
.bz-msg__model {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bz-msg__ts {
  justify-self: end;
  flex-shrink: 0;
  line-height: 1;
  white-space: nowrap;
}

/* Action cluster — bottom-left on hover/focus for every message.
   Inline icon buttons; never use the brand color for these. */
.bz-msg__actions {
  grid-column: 2;
  display: flex;
  justify-content: flex-start;
  gap: 2px;
  min-height: 26px;
  opacity: 0;
  transition: opacity var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-msg:hover .bz-msg__actions,
.bz-msg__actions:focus-within {
  opacity: 1;
}
.bz-msg__action {
  width: 26px;
  height: 26px;
  min-width: 26px;
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
.bz-msg__action .material-symbols-outlined {
  font-size: 16px !important;
  overflow: visible;
}

/* Error state */
.bz-msg--error { border-left: 3px solid var(--bz-error, #d32f2f); }

.bz-msg__error {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  color: var(--bz-error, #d32f2f);
  font-size: var(--bz-size-meta);
}
.bz-msg__error .material-symbols-outlined {
  font-size: 16px !important;
}
.bz-msg__error-body {
  min-width: 0;
}
.bz-msg__error-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
}
.bz-msg__error-btn {
  height: 26px;
  border: 1px solid color-mix(in srgb, var(--bz-error, #d32f2f) 45%, transparent);
  border-radius: var(--bz-r-xs);
  background: transparent;
  color: var(--bz-error, #d32f2f);
  font-size: var(--bz-size-meta);
  font-weight: 700;
  line-height: 1;
  padding: 0 var(--bz-space-2);
  cursor: pointer;
}
.bz-msg__error-btn:hover {
  background: color-mix(in srgb, var(--bz-error, #d32f2f) 10%, transparent);
}
.bz-msg__error-btn--primary {
  background: color-mix(in srgb, var(--bz-error, #d32f2f) 12%, transparent);
}

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
.bz-msg__body :deep(strong),
.bz-msg__body :deep(b) {
  color: var(--bz-fg);
  font-weight: 700;
}
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
.bz-msg__body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--bz-space-3) 0;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.bz-msg__body :deep(th),
.bz-msg__body :deep(td) {
  padding: var(--bz-space-2) var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
  text-align: left;
  vertical-align: top;
}
.bz-msg__body :deep(th) {
  background: var(--bz-card);
  color: var(--bz-fg);
  font-weight: 600;
}
.bz-msg__body :deep(tr:nth-child(even) td) {
  background: var(--bz-canvas);
}
.bz-msg__body :deep(tr:last-child td) { border-bottom: 0; }

/* Typing skeleton — 3-dot pulse shown while waiting for first token. */
.bz-msg__skeleton {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: var(--bz-space-2) 0;
}
.bz-msg__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-purple-300);
  animation: bz-skeleton-bounce 1.4s ease-in-out infinite;
}
.bz-msg__dot:nth-child(1) { animation-delay: 0s; }
.bz-msg__dot:nth-child(2) { animation-delay: 0.2s; }
.bz-msg__dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bz-skeleton-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
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
.bz-msg__stopped,
.bz-msg__atts,
.bz-msg__tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.bz-msg__stopped {
  align-items: center;
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}
.bz-msg__stopped .material-symbols-outlined {
  font-size: 16px !important;
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
