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

    <div
      v-if="commandMenuOpen"
      class="bz-input__commands"
      role="listbox"
      aria-label="Slash commands"
    >
      <button
        v-for="(cmd, i) in filteredSlashCommands"
        :key="cmd.id"
        type="button"
        class="bz-input__command"
        :class="{ 'is-active': i === activeCommandIndex }"
        role="option"
        :aria-selected="i === activeCommandIndex ? 'true' : 'false'"
        @mousedown.prevent
        @click="runSlashCommand(cmd)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">
          {{ cmd.icon || 'terminal' }}
        </span>
        <span class="bz-input__command-main">
          <span class="bz-input__command-label">{{ cmd.label }}</span>
          <span class="bz-input__command-desc bz-meta">{{ cmd.description }}</span>
        </span>
        <span class="bz-input__command-token bz-mono">/{{ cmd.id }}</span>
      </button>
    </div>

    <!-- Textarea — auto-grows to a cap, then scrolls -->
    <textarea
      ref="taEl"
      v-model="text"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="ariaLabel"
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
        <button
          v-if="enableDictation"
          type="button"
          class="bz-input__tool"
          :class="{ 'is-active': isDictating }"
          :title="dictationTitle"
          :aria-label="dictationTitle"
          :aria-pressed="isDictating ? 'true' : 'false'"
          :disabled="disabled || streaming"
          @click="toggleDictation"
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            {{ isDictating ? 'mic_off' : dictationSupported ? 'mic' : 'mic_none' }}
          </span>
        </button>
        <span
          v-if="dictationNotice"
          class="bz-input__dictation bz-meta"
          :class="`bz-input__dictation--${dictationTone}`"
          aria-live="polite"
        >
          {{ dictationNotice }}
        </span>
        <slot name="tools"></slot>
        <span v-if="hint" class="bz-input__hint bz-meta">{{ hint }}</span>
      </div>

      <div class="bz-input__send">
        <span class="bz-input__shortcut bz-mono bz-meta">
          {{ sendHint }}
        </span>
        <slot name="before-submit" />
        <button
          v-if="streaming"
          type="button"
          class="bz-btn bz-btn--danger bz-input__submit"
          @click="stop"
        >
          Stop
        </button>
        <button
          v-else
          type="button"
          class="bz-btn bz-btn--primary bz-input__submit"
          :disabled="!canSubmit"
          @click="submit"
        >
          <span v-if="loading">Sending…</span>
          <span v-else>{{ submitLabel }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
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
  /** Whether to show Chromium/Web Speech dictation when available. */
  enableDictation: { type: Boolean, default: true },
  /** Slash commands shown when the composer starts with "/". */
  slashCommands: { type: Array, default: () => [] },
  /** Optional caption next to the tools (e.g. "Roleplay · Adult"). */
  hint: { type: String, default: "" },
  /** Accessible label for the message composer. */
  ariaLabel: { type: String, default: "Message composer" },
  /** Visible label for the submit button. */
  submitLabel: { type: String, default: "Send" },
  /** Min auto-grow rows. Cap is 320 px (~14 lines @ 1.55 line-height). */
  minHeight: { type: Number, default: 56 },
  maxHeight: { type: Number, default: 320 },
});

const emit = defineEmits([
  "update:modelValue",
  "submit",
  "attach",
  "remove-attachment",
  "stop",
  "run-command",
]);

const taEl = ref(null);
const isFocused = ref(false);
const height = ref(props.minHeight);
const recognition = ref(null);
const isDictating = ref(false);
const dictationSupported = ref(false);
const dictationNotice = ref("");
const dictationTone = ref("muted");
const dictationBase = ref("");
let dictationFinal = "";
let dictationNoticeTimer = null;
let dictationHadResult = false;

const text = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const canSubmit = computed(
  () => !props.disabled && !props.loading && text.value.trim().length > 0,
);
const slashQuery = computed(() => {
  const value = text.value || "";
  const match = value.match(/^\/([^\s]*)$/);
  return match ? match[1].toLowerCase() : null;
});
const filteredSlashCommands = computed(() => {
  if (slashQuery.value === null) return [];
  const q = slashQuery.value;
  return props.slashCommands.filter((cmd) => {
    const haystack = `${cmd.id || ""} ${cmd.label || ""} ${cmd.description || ""}`.toLowerCase();
    return haystack.includes(q);
  });
});
const commandMenuOpen = computed(
  () => isFocused.value && !props.disabled && filteredSlashCommands.value.length > 0,
);
const activeCommandIndex = ref(0);

// macOS uses ⌘ Enter; everything else uses Ctrl Enter. Detection is
// good-enough via navigator.platform.
const isMac = computed(() => /mac|iphone|ipad/i.test(navigator.platform));
const sendHint = computed(() => (isMac.value ? "⌘⏎" : "Ctrl ⏎"));
const dictationTitle = computed(() => {
  if (isDictating.value) return "Stop dictation";
  if (!dictationSupported.value) return "Voice dictation unavailable";
  return "Start dictation";
});

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
  if (commandMenuOpen.value) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeCommandIndex.value =
        (activeCommandIndex.value + 1) % filteredSlashCommands.value.length;
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeCommandIndex.value =
        (activeCommandIndex.value - 1 + filteredSlashCommands.value.length) %
        filteredSlashCommands.value.length;
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      runSlashCommand(filteredSlashCommands.value[activeCommandIndex.value]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      text.value = "";
      return;
    }
  }

  // Cmd/Ctrl+Enter sends. Plain Enter inserts a newline (the default).
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submit();
  }
}

function submit() {
  if (!canSubmit.value) return;
  stopDictation();
  emit("submit", text.value);
}
function stop() {
  stopDictation();
  emit("stop");
}

function runSlashCommand(cmd) {
  if (!cmd) return;
  stopDictation();
  emit("run-command", cmd);
}

function speechCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function clearDictationNoticeTimer() {
  if (!dictationNoticeTimer) return;
  window.clearTimeout(dictationNoticeTimer);
  dictationNoticeTimer = null;
}

function setDictationNotice(message, tone = "muted", timeout = 0) {
  clearDictationNoticeTimer();
  dictationNotice.value = message;
  dictationTone.value = tone;
  if (timeout > 0) {
    dictationNoticeTimer = window.setTimeout(() => {
      dictationNotice.value = "";
      dictationNoticeTimer = null;
    }, timeout);
  }
}

function dictationErrorMessage(error) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked";
    case "no-speech":
      return "No speech detected";
    case "audio-capture":
      return "No microphone found";
    case "network":
      return "Speech service unavailable";
    case "aborted":
      return "Dictation stopped";
    default:
      return "Dictation could not start";
  }
}

async function requestMicAccess() {
  if (!navigator.mediaDevices?.getUserMedia) return true;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
  return true;
}

function mergeDictationText(liveText) {
  const base = dictationBase.value;
  const heard = liveText.trim();
  if (!heard) return base;
  if (!base) return heard;
  return `${base}${/\s$/.test(base) ? "" : " "}${heard}`;
}

async function startDictation() {
  const SpeechRecognition = speechCtor();
  dictationSupported.value = !!SpeechRecognition;
  if (props.disabled || props.streaming) return;
  if (!SpeechRecognition) {
    setDictationNotice("Voice dictation is unavailable here", "warning", 4000);
    return;
  }

  stopDictation();
  dictationBase.value = text.value.trimEnd();
  dictationFinal = "";
  dictationHadResult = false;
  setDictationNotice("Requesting microphone...", "muted");

  try {
    await requestMicAccess();
  } catch (e) {
    const permissionName =
      e?.name === "NotAllowedError" || e?.name === "SecurityError"
        ? "not-allowed"
        : "audio-capture";
    setDictationNotice(dictationErrorMessage(permissionName), "warning", 5000);
    return;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language || "en-US";
  rec.onstart = () => {
    setDictationNotice("Listening...", "active");
  };
  rec.onaudiostart = () => {
    setDictationNotice("Listening...", "active");
  };
  rec.onspeechstart = () => {
    setDictationNotice("Hearing you...", "active");
  };
  rec.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) {
        dictationFinal += transcript;
      } else {
        interim += transcript;
      }
    }
    dictationHadResult = true;
    setDictationNotice("Listening...", "active");
    text.value = mergeDictationText(`${dictationFinal} ${interim}`);
    nextTick(autosize);
  };
  rec.onnomatch = () => {
    setDictationNotice("No speech detected", "warning", 3500);
  };
  rec.onerror = (event) => {
    recognition.value = null;
    isDictating.value = false;
    setDictationNotice(dictationErrorMessage(event?.error), "warning", 5000);
  };
  rec.onend = () => {
    recognition.value = null;
    isDictating.value = false;
    if (dictationNotice.value === "Listening..." || dictationNotice.value === "Hearing you...") {
      setDictationNotice(dictationHadResult ? "Dictation stopped" : "No speech detected", "muted", 2500);
    }
    nextTick(() => taEl.value?.focus());
  };

  recognition.value = rec;
  isDictating.value = true;
  try {
    rec.start();
  } catch (e) {
    recognition.value = null;
    isDictating.value = false;
    setDictationNotice(
      e?.name === "InvalidStateError" ? "Dictation is already running" : "Dictation could not start",
      "warning",
      4000,
    );
  }
}

function stopDictation() {
  if (!recognition.value) {
    isDictating.value = false;
    return;
  }
  const rec = recognition.value;
  recognition.value = null;
  isDictating.value = false;
  try { rec.stop(); } catch { /* recognition may already be stopped */ }
}

function toggleDictation() {
  if (isDictating.value) {
    stopDictation();
  } else {
    startDictation();
  }
}

const ATTACHMENT_ICON = {
  image: "image",
  audio: "graphic_eq",
  video: "movie",
  file: "description",
};
function attIcon(att) { return ATTACHMENT_ICON[att?.kind] || "attach_file"; }

watch(() => props.modelValue, () => nextTick(autosize));
watch(filteredSlashCommands, () => {
  activeCommandIndex.value = 0;
});
watch(
  () => [props.disabled, props.streaming],
  ([disabled, streaming]) => {
    if ((disabled || streaming) && isDictating.value) stopDictation();
  },
);
onMounted(() => {
  dictationSupported.value = !!speechCtor();
  nextTick(autosize);
});
onBeforeUnmount(stopDictation);
onBeforeUnmount(clearDictationNoticeTimer);

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

.bz-input__commands {
  display: grid;
  gap: 2px;
  padding: var(--bz-space-2);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.bz-input__command {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-2);
  border: 1px solid transparent;
  border-radius: var(--bz-r-sm);
  background: transparent;
  color: var(--bz-fg-mid);
  text-align: left;
  cursor: pointer;
}
.bz-input__command:hover,
.bz-input__command.is-active {
  background: var(--bz-raised);
  border-color: var(--bz-border);
  color: var(--bz-fg);
}
.bz-input__command .material-symbols-outlined {
  font-size: 18px !important;
  color: var(--bz-purple-300);
}
.bz-input__command-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.bz-input__command-label,
.bz-input__command-desc,
.bz-input__command-token {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-input__command-label {
  color: var(--bz-fg);
  font-size: var(--bz-size-body);
}
.bz-input__command-desc {
  color: var(--bz-fg-low);
}
.bz-input__command-token {
  max-width: 96px;
  color: var(--bz-fg-low);
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
  min-width: 32px;
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
.bz-input__tool:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.bz-input__tool.is-active {
  color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
  border-color: var(--bz-border-brand);
}
.bz-input__tool .material-symbols-outlined {
  font-size: 18px !important;
  overflow: visible;
}
.bz-input__dictation {
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-input__dictation--active {
  color: var(--bz-purple-300);
}
.bz-input__dictation--warning {
  color: var(--bz-error, #d32f2f);
}
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
  color: var(--bz-on-accent);
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

/* Danger variant for the Stop button during streaming. */
.bz-btn--danger {
  background: var(--bz-error, #d32f2f);
}
.bz-btn--danger:hover {
  filter: brightness(1.1);
}
</style>
