<template>
  <section
    class="bz-gen-input"
    :class="{
      'bz-gen-input--focused': isFocused,
      'bz-gen-input--disabled': disabled,
      'bz-gen-input--running': running,
    }"
  >
    <!-- Optional title block — eyebrow + display headline. Shown only
         when both `eyebrow` and `headline` are provided; tabs that
         render their own header pass nothing and the block hides. -->
    <header v-if="eyebrow || headline" class="bz-gen-input__head">
      <p v-if="eyebrow" class="bz-eyebrow">{{ eyebrow }}</p>
      <h1 v-if="headline" class="bz-display">{{ headline }}</h1>
      <p v-if="subhead" class="bz-meta bz-gen-input__sub">{{ subhead }}</p>
    </header>

    <!-- Mode toggles — shared shape across all generative tabs.
         Caller passes `modes` as an array of { value, label, icon }.
         v-model:mode binds the selected value. The chip styling
         matches NetworkSettings' tier filter chips. -->
    <div v-if="modes?.length" class="bz-gen-input__modes">
      <button
        v-for="m in modes"
        :key="m.value"
        type="button"
        class="bz-mode-chip"
        :class="{ 'bz-mode-chip--on': mode === m.value }"
        :disabled="disabled || (m.disabled === true)"
        :title="m.title"
        @click="$emit('update:mode', m.value)"
      >
        <span v-if="m.icon" class="material-symbols-outlined" aria-hidden="true">
          {{ m.icon }}
        </span>
        <span>{{ m.label }}</span>
        <span v-if="m.badge" class="bz-mode-chip__badge bz-mono bz-meta">
          {{ m.badge }}
        </span>
      </button>
    </div>

    <!-- Reference attachment chip — for img-to-img / img-to-video /
         vision tabs. Caller controls visibility via slot. -->
    <slot name="attachment" />

    <!-- Prompt + send row -->
    <div class="bz-gen-input__shell">
      <textarea
        ref="taEl"
        v-model="text"
        :placeholder="placeholder || i18n.t('workspace.defaultPrompt')"
        :disabled="disabled"
        class="bz-gen-input__field"
        :style="{ height: height + 'px' }"
        rows="1"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @input="onInput"
        @keydown="onKeydown"
      ></textarea>

      <!-- Optional negative-prompt — collapsed details element. Diffusion
           tabs surface this; chat / TTS hide it. -->
      <details
        v-if="enableNegativePrompt"
        class="bz-gen-input__neg"
        :open="negativePromptOpen"
      >
        <summary class="bz-eyebrow" @click="negativePromptOpen = !negativePromptOpen">
          {{ i18n.t('workspace.negative') }}
          <span class="bz-mono bz-meta">{{ i18n.t('workspace.avoid') }}</span>
        </summary>
        <textarea
          v-model="negativeText"
          class="bz-gen-input__field bz-gen-input__field--neg"
          rows="2"
          :placeholder="i18n.t('workspace.blurryPrompt')"
          :disabled="disabled"
        ></textarea>
      </details>

      <!-- Toolbar — tools slot left, generate button right -->
      <div class="bz-gen-input__bar">
        <div class="bz-gen-input__tools">
          <slot name="tools" />
          <span v-if="hint" class="bz-meta bz-gen-input__hint">{{ hint }}</span>
        </div>

        <div class="bz-gen-input__send">
          <span v-if="shortcutHint" class="bz-mono bz-meta bz-gen-input__shortcut">
            {{ shortcutHint }}
          </span>
          <slot name="before-submit" />
          <button
            type="button"
            class="bz-btn bz-btn--primary bz-gen-input__submit"
            :disabled="!canSubmit"
            @click="submit"
          >
            <BonzaiPulse v-if="running" variant="dot" />
            <span v-if="running">{{ runningLabel }}</span>
            <span v-else-if="loading">{{ loadingLabel }}</span>
            <span v-else>{{ submitLabel }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Generation progress — when `running` and `progressPercent` are
         set, show the BonzaiPulse bar with the brand sweep. The legacy
         `is-info notification` + Bulma progress bar combo is retired. -->
    <div v-if="running && progressPercent != null" class="bz-gen-input__progress">
      <div class="bz-gen-input__progress-row">
        <span class="bz-shout">{{ progressLabel }}</span>
        <span class="bz-mono bz-gen-input__pct">{{ progressPercent }}%</span>
      </div>
      <BonzaiPulse variant="bar" :percent="progressPercent" />
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";
import BonzaiPulse from "../BonzaiPulse.vue";
import { useI18n } from "../../i18n/index.js";

const i18n = useI18n();

const props = defineProps({
  // Content
  modelValue:        { type: String, default: "" },
  negativePrompt:    { type: String, default: "" },
  placeholder:       { type: String, default: "" },

  // Editorial header (optional)
  eyebrow:           { type: String, default: "" },
  headline:          { type: String, default: "" },
  subhead:           { type: String, default: "" },

  // Mode toggle row (optional)
  modes:             { type: Array, default: () => [] },
  mode:              { type: [String, Number], default: "" },

  // Submit
  submitLabel:       { type: String, default: "Generate" },
  loadingLabel:      { type: String, default: "Starting…" },
  runningLabel:      { type: String, default: "Generating" },
  loading:           { type: Boolean, default: false },
  running:           { type: Boolean, default: false },
  disabled:          { type: Boolean, default: false },

  // Optional in-flight progress (0–100)
  progressPercent:   { type: Number, default: null },
  progressLabel:     { type: String, default: "Crafting…" },

  // Hints
  hint:              { type: String, default: "" },
  /** Shortcut hint shown next to the send button (e.g. "⌘⏎"). */
  shortcutHint:      { type: String, default: "" },

  // Negative prompt
  enableNegativePrompt: { type: Boolean, default: false },
  negativePromptDefaultOpen: { type: Boolean, default: false },

  // Auto-grow bounds
  minHeight:         { type: Number, default: 80 },
  maxHeight:         { type: Number, default: 320 },
});

const emit = defineEmits([
  "update:modelValue",
  "update:negativePrompt",
  "update:mode",
  "submit",
]);

const taEl = ref(null);
const isFocused = ref(false);
const height = ref(props.minHeight);
const negativePromptOpen = ref(props.negativePromptDefaultOpen);

const text = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

const negativeText = computed({
  get: () => props.negativePrompt,
  set: (v) => emit("update:negativePrompt", v),
});

const canSubmit = computed(
  () => !props.disabled && !props.loading && !props.running && text.value.trim().length > 0,
);

function autosize() {
  const el = taEl.value;
  if (!el) return;
  el.style.height = "0px";
  const next = Math.min(Math.max(props.minHeight, el.scrollHeight + 2), props.maxHeight);
  height.value = next;
  el.style.height = next + "px";
}

function onInput() { nextTick(autosize); }

function onKeydown(e) {
  // ⌘/Ctrl-Enter sends. Plain Enter inserts a newline.
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submit();
  }
}

function submit() {
  if (!canSubmit.value) return;
  emit("submit", { prompt: text.value, negativePrompt: negativeText.value, mode: props.mode });
}

watch(() => props.modelValue, () => nextTick(autosize));
onMounted(() => nextTick(autosize));

defineExpose({ focus() { taEl.value?.focus(); } });
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════
   GENERATIVE INPUT — single shape across image/video/audio/music/
   text-to-speech tabs. Composes mode toggles + prompt textarea +
   optional negative prompt + brand-gradient generate button. The
   chat tab uses the closely related <ChatInput>; this is the
   diffusion sibling.
   ════════════════════════════════════════════════════════════════ */

.bz-gen-input {
  position: relative;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  padding: var(--bz-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
  transition:
    border-color var(--bz-dur-base) var(--bz-ease-out),
    box-shadow var(--bz-dur-base) var(--bz-ease-out),
    background var(--bz-dur-fast) var(--bz-ease-out);
}

/* Focus / running states get a soft brand-purple halo so the user's
   eye stays anchored on the composer. The halo is a box-shadow, not
   a border-glow, so it doesn't push neighbours around. */
.bz-gen-input--focused {
  border-color: var(--bz-border-brand);
  box-shadow:
    0 0 0 1px var(--bz-border-brand),
    0 0 24px var(--bz-purple-soft);
}
.bz-gen-input--running {
  border-color: var(--bz-border);
  box-shadow: none;
}
.bz-gen-input--disabled { opacity: 0.6; pointer-events: none; }

/* Header */
.bz-gen-input__head { display: grid; gap: var(--bz-space-2); }
.bz-gen-input__head h1 { margin: 0; color: var(--bz-fg); }
.bz-gen-input__head .bz-eyebrow { margin: 0; }
.bz-gen-input__sub { margin: 0; max-width: 60ch; }

/* Mode chips — same shape as NetworkSettings tier filters. */
.bz-gen-input__modes {
  display: flex;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}
.bz-mode-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  height: 36px;
  padding: 0 var(--bz-space-4);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-mode-chip:hover:not(:disabled) {
  color: var(--bz-fg);
  border-color: var(--bz-border-strong);
}
.bz-mode-chip--on {
  background: var(--bz-purple-soft);
  border-color: var(--bz-border-brand);
  color: var(--bz-fg);
}
.bz-mode-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.bz-mode-chip .material-symbols-outlined { font-size: 18px !important; }
.bz-mode-chip__badge {
  margin-left: var(--bz-space-2);
  padding: 1px var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
}

/* Inner shell — the prompt textarea + tools + send all sit in a flat
   group below the chips, sharing the bordered surface above. */
.bz-gen-input__shell {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}

.bz-gen-input__field {
  width: 100%;
  background: transparent;
  border: 0;
  padding: 0;
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: 16px;        /* slightly larger than body for prompt focus */
  line-height: var(--bz-line-body);
  outline: 0;
  resize: none;
  caret-color: var(--bz-purple-300);
}
.bz-gen-input__field::placeholder {
  color: var(--bz-fg-low);
  font-style: italic;
}
.bz-gen-input__field::selection {
  background: var(--bz-purple-soft);
  color: var(--bz-fg);
}
.bz-gen-input__field--neg {
  margin-top: var(--bz-space-2);
  font-size: var(--bz-size-meta);
}

/* Negative-prompt collapsible. */
.bz-gen-input__neg {
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: var(--bz-space-2) var(--bz-space-3);
  background: var(--bz-canvas);
}
.bz-gen-input__neg summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
}
.bz-gen-input__neg summary::-webkit-details-marker { display: none; }
.bz-gen-input__neg .bz-mono.bz-meta { text-transform: none; letter-spacing: 0; }

/* Toolbar */
.bz-gen-input__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.bz-gen-input__tools {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  min-width: 0;
  flex-wrap: wrap;
}
.bz-gen-input__hint { white-space: nowrap; }

.bz-gen-input__send {
  display: flex;
  flex-wrap: wrap;
  margin-left: auto;
  align-items: center;
  gap: var(--bz-space-3);
}
.bz-gen-input__shortcut { color: var(--bz-fg-low); }

/* Submit — reuses bz-btn--primary's brand gradient. */
.bz-gen-input__submit {
  height: 40px;
  padding: 0 var(--bz-space-5);
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  font-size: var(--bz-size-body);
  border: 0;
}

/* Progress block — shown while running. Sweeps brand purple. */
.bz-gen-input__progress {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-3);
}
.bz-gen-input__progress-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.bz-gen-input__pct { color: var(--bz-fg-mid); font-size: var(--bz-size-h3); }
</style>
