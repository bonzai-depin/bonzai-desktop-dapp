<template>
  <div class="bz-workspace">
    <!-- HEADER: eyebrow + title + actions -->
    <header class="bz-workspace__header">
      <div class="bz-workspace__title">
        <span v-if="eyebrow" class="bz-eyebrow">{{ eyebrow }}</span>
        <h1 class="bz-h1">
          <slot name="icon">
            <span v-if="icon" class="material-symbols-outlined bz-workspace__icon">{{ icon }}</span>
          </slot>
          {{ title }}
        </h1>
        <p v-if="subtitle" class="bz-meta bz-workspace__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.headerActions" class="bz-workspace__actions">
        <slot name="headerActions" />
      </div>
    </header>

    <!-- MODE BAR: compact chip row for mode toggles -->
    <div v-if="modes?.length" class="bz-workspace__modebar">
      <button
        v-for="m in modes"
        :key="m.value"
        type="button"
        class="bz-mode-chip"
        :class="{ 'bz-mode-chip--on': modelValue === m.value }"
        :disabled="m.disabled || disabled"
        :aria-pressed="modelValue === m.value"
        :title="m.title"
        @click="$emit('update:modelValue', m.value)"
      >
        <span v-if="m.icon" class="material-symbols-outlined" aria-hidden="true">{{ m.icon }}</span>
        <span>{{ m.label }}</span>
        <span v-if="m.badge" class="bz-mode-chip__badge bz-mono bz-meta">{{ m.badge }}</span>
      </button>
      <slot name="modebar-extra" />
    </div>

    <!-- PROGRESS: BonzaiPulse bar for generation in flight -->
    <div v-if="progress && progress.active" class="bz-workspace__progress">
      <div class="bz-genprogress__row">
        <span class="bz-shout bz-genprogress__label bz-genprogress__label--pill">
          <BonzaiPulse variant="dot" />
          {{ progress.label || i18n.t('generation.crafting') }}
        </span>
        <span class="bz-mono bz-genprogress__pct">{{ Math.round(progress.pct || 0) }}%</span>
      </div>
      <BonzaiPulse variant="bar" :percent="Math.max(0, Math.min(100, progress.pct || 0))" />
    </div>

    <!-- SETUP CARD: shown when prerequisites aren't met -->
    <div v-if="setup && !setup.ready" class="bz-workspace__setup">
      <BonzaiEmptyState
        :show-orb="true"
        :size="'large'"
        :title="setup.title || i18n.t('workspace.ready')"
        :subtitle="setup.subtitle"
        :icon="setup.icon || 'auto_awesome'"
        :primary-action="setup.primaryAction"
        :secondary-action="setup.secondaryAction"
        :footer-text="setup.footer"
      />
    </div>

    <!-- MAIN PANEL: card surface for input + controls -->
    <div v-else class="bz-workspace__panel">
      <slot name="panel" />
    </div>

    <!-- HISTORY: cinematic hero + 2-col grid -->
    <div v-if="$slots.history" class="bz-workspace__history">
      <div v-if="historyLabel" class="bz-workspace__history-head">
        <h2 class="bz-h2">{{ historyLabel }}</h2>
        <slot name="historyActions" />
      </div>
      <slot name="history" />
    </div>

    <!-- EMPTY STATE for history -->
    <div v-else-if="emptyHistory" class="bz-workspace__history-empty">
      <BonzaiEmptyState
        :size="'small'"
        :title="emptyHistory.title || i18n.t('workspace.noOutputs')"
        :subtitle="emptyHistory.subtitle"
        :icon="emptyHistory.icon || 'image'"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * GenerativeWorkspace
 * ──────────────────
 * Unified shell for all non-chat generative tabs (Image, Video, Audio,
 * 3D, Training). Replaces the repetitive Bulma scaffolding in each tab
 * with a single layout pattern.
 *
 * Layout:
 *   Header (eyebrow + title + actions)
 *   Mode bar (compact chip row)
 *   Progress (BonzaiPulse bar, when active)
 *   Panel (card surface — prompt + controls)
 *   History (cinematic hero grid — optional)
 *
 * Slots:
 *   `panel`          — Main input + controls card (required)
 *   `history`        — Generation history grid
 *   `historyActions` — Extra buttons next to history label
 *   `headerActions`  — Buttons in the top-right of header
 *   `modebar-extra`  — Extra controls appended to mode bar
 *
 * Props:
 *   `title`          — h1 heading
 *   `eyebrow`        — Category label above title
 *   `subtitle`       — Beneath title
 *   `icon`           — Material Symbols name (optional, overridden by icon slot)
 *   `modes`          — Array<{value, label, icon, badge, title, disabled}>
 *   `modelValue`     — Currently selected mode value (v-model)
 *   `progress`       — { active, pct, label? } or null
 *   `setup`          — { ready, title, subtitle, icon, primaryAction, secondaryAction, footer }
 *   `emptyHistory`   — { title, subtitle, icon } or null
 *   `historyLabel`   — Section heading for history
 *   `disabled`       — Global disabled state
 */
import BonzaiPulse from "../BonzaiPulse.vue";
import BonzaiEmptyState from "../BonzaiEmptyState.vue";
import { useI18n } from "../../i18n/index.js";

const i18n = useI18n();

const props = defineProps({
  title:        { type: String, required: true },
  eyebrow:      { type: String, default: "" },
  subtitle:     { type: String, default: "" },
  icon:         { type: String, default: "" },
  modes:        { type: Array,  default: () => [] },
  modelValue:   { type: [String, Number], default: "" },
  progress:     { type: Object, default: null },
  setup:        { type: Object, default: null },
  emptyHistory: { type: Object, default: null },
  historyLabel: { type: String, default: "History" },
  disabled:     { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue"]);
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════
   GENERATIVE WORKSPACE — unified shell for Image/Video/Audio/3D.
   Replaces Bulma scaffolding with a single editorial layout.
   ════════════════════════════════════════════════════════════════ */

.bz-workspace {
  position: relative;
  overflow-y: auto;
  padding: var(--bz-space-5) var(--bz-space-6);
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-5);
}

/* ── Header ───────────────────────────────────────────────────── */
.bz-workspace__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bz-space-4);
  padding-bottom: var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
}
.bz-workspace__title {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-1);
}
.bz-workspace__title .bz-eyebrow { margin: 0; }
.bz-workspace__title h1 {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-3);
}
.bz-workspace__icon {
  font-size: 28px !important;
  color: var(--bz-purple-300);
}
.bz-workspace__subtitle {
  margin: 0;
  max-width: 60ch;
}
.bz-workspace__actions {
  display: inline-flex;
  gap: var(--bz-space-2);
  flex-shrink: 0;
}

/* ── Mode bar ─────────────────────────────────────────────────── */
.bz-workspace__modebar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-2);
}

/* Reuse mode-chip styling from GenerativeInput — copy here so the
   shell is self-contained even if the input component isn't used. */
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
  font-size: 10px;
}

/* ── Progress ─────────────────────────────────────────────────── */
.bz-workspace__progress {
  position: sticky;
  bottom: var(--bz-space-4);
  z-index: 20;
  padding: var(--bz-space-3) var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  box-shadow: var(--bz-elev-2);
}
.bz-genprogress__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-2);
}
.bz-genprogress__label {
  color: var(--bz-fg);
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
}
.bz-genprogress__label--pill {
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--bz-fg) 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bz-panel) 82%, var(--bz-accent) 18%);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--bz-accent) 24%, transparent);
  animation: bz-progress-pill-pulse 1.8s ease-in-out infinite;
}
.bz-genprogress__pct {
  color: var(--bz-fg-mid);
  font-family: "Fira Sans Condensed", var(--bz-font-body);
  font-weight: 900;
  font-style: italic;
  font-size: var(--bz-size-h3);
}

@keyframes bz-progress-pill-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--bz-accent) 18%, transparent);
    transform: translateY(0);
  }
  50% {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--bz-accent) 0%, transparent);
    transform: translateY(-1px);
  }
}

/* ── Setup / empty ────────────────────────────────────────────── */
.bz-workspace__setup {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
}

/* ── Panel ────────────────────────────────────────────────────── */
.bz-workspace__panel {
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  padding: var(--bz-space-5);
}

/* ── History ──────────────────────────────────────────────────── */
.bz-workspace__history {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
}
.bz-workspace__history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.bz-workspace__history-head h2 { margin: 0; }

.bz-workspace__history-empty {
  min-height: 30vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
