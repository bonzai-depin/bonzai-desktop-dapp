<template>
  <div class="bzes" :class="[`bzes--${size}`, { 'bzes--orb': showOrb }]">
    <!-- Decorative atmospheric orb — ElevenLabs-style ambient bloom.
         Pure decoration; never behind readable text. -->
    <div v-if="showOrb" class="bzes__orb" aria-hidden="true" />

    <div class="bzes__content">
      <!-- Optional icon — Material Symbols, renamed to noun affordance -->
      <div v-if="icon" class="bzes__icon">
        <span class="material-symbols-outlined">{{ icon }}</span>
      </div>

      <!-- Display title — Fira Sans Light, quiet hero -->
      <h2 v-if="title" class="bzes__title bz-display">{{ title }}</h2>

      <!-- Subtitle — body color, mid weight -->
      <p v-if="subtitle" class="bzes__subtitle">{{ subtitle }}</p>

      <!-- Prompt-card grid (2×2) — same pattern as EmptyChat -->
      <div v-if="prompts && prompts.length" class="bzes__prompts">
        <button
          v-for="(p, idx) in prompts"
          :key="idx"
          class="bzes__prompt-card"
          @click="$emit('pick', p.value)"
        >
          <span class="bzes__prompt-icon material-symbols-outlined">{{ p.icon }}</span>
          <span class="bzes__prompt-title">{{ p.title }}</span>
          <span class="bzes__prompt-desc">{{ p.subtitle }}</span>
        </button>
      </div>

      <!-- CTA action row -->
      <div v-if="$slots.actions || primaryAction || secondaryAction" class="bzes__actions">
        <slot name="actions">
          <button
            v-if="primaryAction"
            class="bz-btn bz-btn--primary"
            @click="primaryAction.onClick"
          >
            {{ primaryAction.label }}
          </button>
          <button
            v-if="secondaryAction"
            class="bz-btn bz-btn--ghost"
            @click="secondaryAction.onClick"
          >
            {{ secondaryAction.label }}
          </button>
        </slot>
      </div>

      <!-- Optional footer meta -->
      <div v-if="$slots.footer || footerText" class="bzes__footer">
        <slot name="footer">
          <span class="bzes__footer-text bz-micro">{{ footerText }}</span>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * BonzaiEmptyState
 * ────────────────
 * Generic cinematic empty state for any tab or surface.
 *
 * Replaces one-off empty-state markup across RoleplayChat,
 * GenerativeTraining, skill components, and marketplace screens.
 *
 * Uses the Runway/ElevenLabs principle: the empty state is not
 * "nothing here" — it's a *canvas* for the brand to breathe.
 *
 * Variants by size:
 *   `large`   — full-tab hero (chat empty, generative empty) — 64px title
 *   `medium`  — panel / modal empty — 32px title
 *   `small`   — inline list empty — 20px title
 *   `compact` — table row empty — no orb, minimal padding
 *
 * Props:
 *   `title`            — Display headline (can be long)
 *   `subtitle`         — Body text explaining the empty state
 *   `icon`             — Material Symbols name (noun affordance)
 *   `prompts`          — Array<{icon, title, subtitle, value}>
 *   `primaryAction`    — { label, onClick }
 *   `secondaryAction`  — { label, onClick }
 *   `footerText`       — Small meta line at bottom
 *   `showOrb`          — Render the atmospheric purple orb
 *   `size`             — "large" | "medium" | "small" | "compact"
 *
 * Events:
 *   `@pick` — emitted with prompt.value when a prompt card is clicked
 */
defineProps({
  title:           { type: String, default: "" },
  subtitle:        { type: String, default: "" },
  icon:            { type: String, default: "" },
  prompts:         { type: Array,  default: () => [] },
  primaryAction:   { type: Object, default: null },
  secondaryAction: { type: Object, default: null },
  footerText:      { type: String, default: "" },
  showOrb:         { type: Boolean, default: true },
  size:            { type: String, default: "large", validator: (v) => ["large", "medium", "small", "compact"].includes(v) },
});

defineEmits(["pick"]);
</script>

<style scoped>
.bzes {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 100%;
  overflow: hidden;
}

/* ─── Size variants ────────────────────────────────────────────── */

.bzes--large {
  min-height: 60vh;
  padding: var(--bz-space-8) var(--bz-space-5);
}
.bzes--large .bzes__title {
  font-size: var(--bz-size-display);
  line-height: var(--bz-line-display);
}
.bzes--large .bzes__subtitle {
  max-width: 480px;
  margin: var(--bz-space-3) 0 0;
}

.bzes--medium {
  min-height: 40vh;
  padding: var(--bz-space-6) var(--bz-space-5);
}
.bzes--medium .bzes__title {
  font-size: var(--bz-size-h1);
  line-height: var(--bz-line-tight);
}

.bzes--small {
  min-height: 24vh;
  padding: var(--bz-space-5) var(--bz-space-4);
}
.bzes--small .bzes__title {
  font-size: var(--bz-size-h2);
  line-height: var(--bz-line-tight);
}

.bzes--compact {
  min-height: auto;
  padding: var(--bz-space-4) var(--bz-space-3);
}
.bzes--compact .bzes__title {
  font-size: var(--bz-size-h3);
  margin: 0;
}
.bzes--compact .bzes__subtitle {
  font-size: var(--bz-size-meta);
  margin: var(--bz-space-1) 0 0;
}

/* ─── Atmospheric Orb ────────────────────────────────────────────
   A soft radial bloom sits behind the content, providing brand
   atmosphere without interfering with readability. */

.bzes--orb { min-height: 50vh; }
.bzes__orb {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 400px;
  height: 320px;
  background: var(--bz-orb-gradient);
  animation: bz-orb-drift 12s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}

/* ─── Content stack ────────────────────────────────────────────── */

.bzes__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 600px;
}

.bzes__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--bz-r);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-100);
  margin-bottom: var(--bz-space-4);
}
.bzes__icon .material-symbols-outlined { font-size: 24px !important; }

.bzes__title {
  color: var(--bz-fg);
  font-weight: 100;
  letter-spacing: var(--bz-track-display);
  margin: 0;
}

.bzes__subtitle {
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-body);
  line-height: var(--bz-line-body);
}

/* ─── Prompt cards ───────────────────────────────────────────────
   Same pattern as EmptyChat: 2×2 grid of clickable starter prompts. */

.bzes__prompts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-3);
  width: 100%;
  max-width: 480px;
  margin-top: var(--bz-space-6);
}

.bzes__prompt-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--bz-space-3) var(--bz-space-4);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    background var(--bz-dur-fast) var(--bz-ease-out),
    transform var(--bz-dur-fast) var(--bz-ease-spring);
}
.bzes__prompt-card:hover {
  border-color: var(--bz-border-brand);
  background: var(--bz-raised);
  transform: translateY(-1px);
}

.bzes__prompt-icon {
  color: var(--bz-purple-100);
  font-size: 18px !important;
  margin-bottom: var(--bz-space-1);
}
.bzes__prompt-title {
  font-family: 'Fira Sans Condensed', sans-serif;
  font-style: italic;
  font-weight: 900;
  font-size: var(--bz-size-h3);
  color: var(--bz-fg);
  line-height: 1.3;
}
.bzes__prompt-desc {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-low);
  line-height: 1.4;
}

/* ─── Actions ──────────────────────────────────────────────────── */

.bzes__actions {
  display: inline-flex;
  gap: var(--bz-space-3);
  margin-top: var(--bz-space-6);
}

/* ─── Footer ───────────────────────────────────────────────────── */

.bzes__footer {
  margin-top: var(--bz-space-5);
}
.bzes__footer-text {
  color: var(--bz-fg-faint);
}
</style>
