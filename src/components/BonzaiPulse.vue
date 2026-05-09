<template>
  <div class="bz-pulse-wrap" :class="`bz-pulse-wrap--${variant}`" :style="wrapStyle">
    <!-- Strip variant — the canonical brand "generating" line.
         Renders as a 1-2 px gradient bar sweeping in brand purple.
         Use anywhere a spinner used to live. -->
    <div v-if="variant === 'strip'" class="bz-pulse-strip bz-generating"></div>

    <!-- Bar variant — same idea but with a determinate progress
         underlay. The sweep animates regardless of percent so the user
         sees activity even when the percent is briefly stuck. -->
    <div v-else-if="variant === 'bar'" class="bz-pulse-bar">
      <div class="bz-pulse-bar__track"></div>
      <div
        class="bz-pulse-bar__fill bz-generating"
        :style="{ width: clampedPct + '%' }"
      ></div>
    </div>

    <!-- Dot variant — a single 6 px brand-purple pulse, useful inline
         in a row of meta text ("Generating · 12s"). Replaces the
         `<button is-loading>` Bulma spinner pattern. -->
    <div v-else-if="variant === 'dot'" class="bz-pulse-dot"></div>

    <!-- Optional caption next to / under the pulse. The caption uses
         the brand voice when shown alongside a strip / bar; otherwise
         it sits inline with body type. -->
    <span
      v-if="label"
      class="bz-pulse-label"
      :class="{ 'bz-pulse-label--inline': variant === 'dot' }"
    >
      <span v-if="variant === 'dot'" class="bz-mono">{{ label }}</span>
      <span v-else class="bz-shout">{{ label }}</span>
    </span>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  /**
   * `strip` — 2 px sweeping line, sits at the bottom of a card or button.
   * `bar`   — full progress bar with determinate percent + sweep.
   * `dot`   — inline pulsing 6 px purple dot. Use inside a text run.
   */
  variant: {
    type: String,
    default: "strip",
    validator: (v) => ["strip", "bar", "dot"].includes(v),
  },
  /** 0–100 — only used when `variant="bar"`. */
  percent: {
    type: [Number, String],
    default: 0,
  },
  /** Optional inline caption ("Generating", "Loading model"). */
  label: {
    type: String,
    default: "",
  },
  /** Override container width — strip / bar default to 100%. */
  width: {
    type: String,
    default: null,
  },
});

const clampedPct = computed(() => {
  const n = Number(props.percent);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
});

const wrapStyle = computed(() => (props.width ? { width: props.width } : null));
</script>

<style scoped>
.bz-pulse-wrap {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-3);
}
.bz-pulse-wrap--strip,
.bz-pulse-wrap--bar { display: flex; flex-direction: column; gap: var(--bz-space-2); width: 100%; }

/* Strip — 2 px brand-purple sweep. Lives at the bottom of a card,
   button, or row. Pure CSS, no JS RAF needed. */
.bz-pulse-strip {
  height: 2px;
  width: 100%;
  border-radius: var(--bz-r-pill);
}

/* Bar — track + fill. Track stays muted; fill carries the sweep so
   even a frozen percent reads as "still working". */
.bz-pulse-bar {
  position: relative;
  height: 6px;
  width: 100%;
  background: var(--bz-canvas);
  border-radius: var(--bz-r-pill);
  overflow: hidden;
}
.bz-pulse-bar__track {
  position: absolute; inset: 0;
  background: var(--bz-canvas);
}
.bz-pulse-bar__fill {
  position: absolute;
  top: 0; bottom: 0; left: 0;
  border-radius: var(--bz-r-pill);
  transition: width var(--bz-dur-base) var(--bz-ease-out);
}

/* Dot — pulses opacity, not scale. Scale-pulse ages instantly. */
.bz-pulse-dot {
  width: 6px; height: 6px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-purple-300);
  box-shadow: 0 0 0 4px var(--bz-purple-soft);
  animation: bz-pulse 1.4s ease-in-out infinite;
  flex-shrink: 0;
}

.bz-pulse-label {
  color: var(--bz-fg);
}
.bz-pulse-label--inline {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-mid);
}
</style>
