<template>
  <div class="bz-input" :class="{ 'bz-input--focused': isFocused, 'bz-input--disabled': disabled }">
    <!-- Attachment chip stack — sits above the textarea -->
    <div v-if="attachments?.length" class="bz-input__atts">
      <span
        v-for="(att, i) in attachments"
        :key="att.id || i"
        class="bz-input__att"
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          {{ attIcon(att) }}
        </span>
        <span class="bz-input__att-name">{{ att.name }}</span>
        <button
          type="button"
          class="bz-input__att-remove"
          :aria-label="`Remove ${att.name}`"
          @click="$emit('remove-attachment', i)"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </span>
    </div>

    <!-- Textarea — auto-grows to a cap, then scrolls -->
    <textarea
      ref="taEl"
      v-model="text"
      :placeholder="placeholder"
      :disabled="disabled"
      class="bz-input__field"
      :style="{ height: height + 'px' }"
      rows="1"
      @focus="isFocused = true"
      @blur="isFocused = false"
      @input="onInput"
      @keydown="onKeydown"
    ></textarea>

    <!-- Toolbar — attachments left, send button right -->
    <div class="bz-input__bar">
      <div class="bz-input__tools">
        <button
          v-if="enableAttachments"
          type="button"
          class="bz-input__tool"
          title="Attach file"
          aria-label="Attach file"
          @click="$emit('attach')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">attach_file</span>
        </button>
        <slot name="tools"></slot>
        <span v-if="hint" class="bz-input__hint bz-meta">{{ hint }}</span>
      </div>

      <div class="bz-input__send">
        <span class="bz-input__shortcut bz-mono bz-meta">
          {{ sendHint }}
        </span>
        <button
          type="button"
          class="bz-btn bz-btn--primary bz-input__submit"
          :disabled="!canSubmit"
          @click="submit"
        >
          <span v-if="streaming">
            <BonzaiPulse variant="dot" />
            Streaming…
          </span>
          <span v-else-if="loading">Sending…</span>
          <span v-else>Send</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import BonzaiPulse from "../BonzaiPulse.vue";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "Message BonzAI…" },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  streaming: { type: Boolean, default: false },
  /** Attachments shown as chips above the textarea. */
  attachments: { type: Array, default: () => [] },
  /** Whether to show the paperclip / attach button. */
  enableAttachments: { type: Boolean, default: true },
  /** Optional caption next to the tools (e.g. "Roleplay · Adult"). */
  hint: { type: String, default: "" },
  /** Min auto-grow rows. Cap is 320 px (~14 lines @ 1.55 line-height). */
  minHeight: { type: Number, default: 56 },
  maxHeight: { type: Number, default: 320 },
});

const emit = defineEmits(["update:modelValue", "submit", "attach", "remove-attachment"]);

const taEl = ref(null);
const isFocused = ref(false);
const height = ref(props.minHeight);

const text = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const canSubmit = computed(
  () => !props.disabled && !props.loading && text.value.trim().length > 0,
);

// macOS uses ⌘ Enter; everything else uses Ctrl Enter. Detection is
// good-enough via navigator.platform.
const isMac = computed(() => /mac|iphone|ipad/i.test(navigator.platform));
const sendHint = computed(() => (isMac.value ? "⌘⏎" : "Ctrl ⏎"));

function autosize() {
  const el = taEl.value;
  if (!el) return;
  el.style.height = "0px";
  const next = Math.min(Math.max(props.minHeight, el.scrollHeight + 2), props.maxHeight);
  height.value = next;
  el.style.height = next + "px";
}

function onInput() {
  nextTick(autosize);
}

function onKeydown(e) {
  // Cmd/Ctrl+Enter sends. Plain Enter inserts a newline (the default).
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submit();
  }
}

function submit() {
  if (!canSubmit.value) return;
  emit("submit", text.value);
}

const ATTACHMENT_ICON = {
  image: "image",
  audio: "graphic_eq",
  video: "movie",
  file: "description",
};
function attIcon(att) { return ATTACHMENT_ICON[att?.kind] || "attach_file"; }

watch(() => props.modelValue, () => nextTick(autosize));
onMounted(() => nextTick(autosize));

defineExpose({
  focus() { taEl.value?.focus(); },
});
</script>

<style scoped>
/* Multi-line auto-grow input — the chat tab's primary surface.
   The textarea grows from `minHeight` to `maxHeight`; past the cap it
   scrolls. Toolbar and send button live in a footer row inside the
   same bordered shell so the focus ring tracks the whole composer. */

.bz-input {
  position: relative;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  padding: var(--bz-space-3) var(--bz-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  transition:
    border-color var(--bz-dur-base) var(--bz-ease-out),
    box-shadow var(--bz-dur-base) var(--bz-ease-out),
    background var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-input--focused {
  border-color: var(--bz-border-brand);
  box-shadow:
    0 0 0 1px var(--bz-border-brand),
    0 0 24px var(--bz-purple-soft);
}
.bz-input--disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* Attachment chips */
.bz-input__atts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin-bottom: var(--bz-space-2);
}
.bz-input__att {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 4px 6px 4px var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
}
.bz-input__att .material-symbols-outlined {
  font-size: 14px !important;
  color: var(--bz-fg-low);
}
.bz-input__att-name {
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-input__att-remove {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-low);
  cursor: pointer;
  margin-left: 2px;
}
.bz-input__att-remove:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}
.bz-input__att-remove .material-symbols-outlined {
  font-size: 14px !important;
}

/* Textarea — visually flush within the shell */
.bz-input__field {
  width: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: 16px;
  line-height: var(--bz-line-body);
  resize: none;
  overflow-y: auto;
  padding: 4px 0;
  caret-color: var(--bz-purple-300);
}
.bz-input__field::placeholder {
  color: var(--bz-fg-low);
  font-style: italic;
}
.bz-input__field::selection {
  background: var(--bz-purple-soft);
  color: var(--bz-fg);
}

/* Toolbar row */
.bz-input__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.bz-input__tools {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  min-width: 0;
}
.bz-input__tool {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--bz-r);
  color: var(--bz-fg-mid);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast),
    color var(--bz-dur-fast);
}
.bz-input__tool:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border);
}
.bz-input__tool .material-symbols-outlined { font-size: 18px !important; }
.bz-input__hint {
  margin-left: var(--bz-space-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bz-input__send {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
}
.bz-input__shortcut {
  color: var(--bz-fg-low);
}

/* Submit — uses the canonical bz-btn primary which carries the brand
   gradient. The send button is the brand moment of every chat turn. */
.bz-input__submit {
  height: 36px;
  padding: 0 var(--bz-space-4);
  background: var(--bz-gradient-brand);
  border: 0;
  color: #fff;
  border-radius: var(--bz-r);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  cursor: pointer;
  transition: filter var(--bz-dur-fast) var(--bz-ease-out);
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
}
.bz-input__submit:hover:not(:disabled) { filter: brightness(1.08); }
.bz-input__submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
