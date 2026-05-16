<template>
  <div class="bzsk" :class="[`bzsk--${shape}`, `bzsk--${density}`]">
    <!-- Each skeleton item traces the outline of a real component.
         Use `rows` prop for list/table; `cards` for grid/card layouts. -->

    <template v-if="shape === 'list'">
      <div
        v-for="i in rows"
        :key="`sk-${i}`"
        class="bzsk__row"
      >
        <div v-if="showAvatar" class="bzsk__avatar" />
        <div class="bzsk__lines">
          <div class="bzsk__line bzsk__line--lg" />
          <div class="bzsk__line bzsk__line--sm" />
        </div>
      </div>
    </template>

    <template v-if="shape === 'table'">
      <div class="bzsk__table-head">
        <div
          v-for="c in tableCols"
          :key="`th-${c}`"
          class="bzsk__th"
        />
      </div>
      <div
        v-for="i in rows"
        :key="`tr-${i}`"
        class="bzsk__table-row"
      >
        <div
          v-for="c in tableCols"
          :key="`td-${i}-${c}`"
          class="bzsk__td"
        />
      </div>
    </template>

    <template v-if="shape === 'card'">
      <div
        v-for="i in cards"
        :key="`card-${i}`"
        class="bzsk__card"
        :style="cardSizeStyle"
      >
        <div class="bzsk__card-media" />
        <div class="bzsk__card-body">
          <div class="bzsk__line bzsk__line--lg" />
          <div class="bzsk__line bzsk__line--md" />
          <div class="bzsk__line bzsk__line--sm" />
        </div>
      </div>
    </template>

    <template v-if="shape === 'hero'">
      <div class="bzsk__hero-media" />
      <div class="bzsk__hero-body">
        <div class="bzsk__line bzsk__line--xl" />
        <div class="bzsk__line bzsk__line--md" />
        <div class="bzsk__line bzsk__line--sm" />
      </div>
    </template>

    <template v-if="shape === 'text'">
      <div v-for="i in rows" :key="`txt-${i}`" class="bzsk__text-block">
        <div class="bzsk__line bzsk__line--md" />
        <div class="bzsk__line bzsk__line--sm" />
      </div>
    </template>

    <template v-if="shape === 'dot'">
      <div v-for="i in dots" :key="`dot-${i}`" class="bzsk__dot" />
    </template>
  </div>
</template>

<script setup>
/**
 * BonzaiSkeleton
 * ──────────────
 * Loading placeholder system modeled after Figma / Linear skeletons.
 *
 * Never show a spinner where content *will* appear. Use skeletons to
 * trace the shape of the expected content so the layout doesn't jump
 * when real data arrives.
 *
 * Shape variants:
 *   `list`   — avatar + two text lines (chat history, inference list)
 *   `table`  — header row + N data rows (data tables, marketplace)
 *   `card`   — media block + title + subtitle + meta (generative outputs)
 *   `hero`   — full-width media + title block (cinematic content preview)
 *   `text`   — simple paragraph lines
 *   `dot`    — pulsing dots inline (button labels, status chips)
 *
 * Props:
 *   `shape`      — see above
 *   `rows`       — number of rows (list / table / text)
 *   `cards`      — number of cards (card shape)
 *   `dots`       — number of inline dots
 *   `tableCols`  — number of table columns
 *   `showAvatar` — show avatar circle in list rows
 *   `cardWidth`  — px or 'stretch'
 *   `cardHeight` — px
 *   `density`    — "default" | "compact" | "spacious"
 */
import { computed } from "vue";

const props = defineProps({
  shape:      { type: String, default: "list", validator: (v) => ["list", "table", "card", "hero", "text", "dot"].includes(v) },
  rows:       { type: Number, default: 4 },
  cards:      { type: Number, default: 3 },
  dots:       { type: Number, default: 3 },
  tableCols:  { type: Number, default: 4 },
  showAvatar: { type: Boolean, default: true },
  cardWidth:  { type: [Number, String], default: "stretch" },
  cardHeight: { type: Number, default: 200 },
  density:    { type: String, default: "default", validator: (v) => ["default", "compact", "spacious"].includes(v) },
});

const cardSizeStyle = computed(() => ({
  width: props.cardWidth === "stretch" ? "100%" : `${props.cardWidth}px`,
}));
</script>

<style scoped>
/* ─── Shared skeleton shimmer ──────────────────────────────────── */

.bzsk {
  --bzsk-shimmer: linear-gradient(
    90deg,
    var(--bz-hairline-0) 0%,
    var(--bz-surface-3) 50%,
    var(--bz-hairline-0) 100%
  );
}

/* The shimmer track — a linear gradient that sweeps across.
   Applied to every skeleton block element. */
.bzsk__line,
.bzsk__avatar,
.bzsk__card-media,
.bzsk__hero-media,
.bzsk__th,
.bzsk__td,
.bzsk__dot,
.bzsk__card {
  background: var(--bzsk-shimmer);
  background-size: 200% 100%;
  animation: bzsk-shimmer 1.8s ease-in-out infinite;
  border-radius: var(--bz-r-sm);
}

@keyframes bzsk-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Line sizing system */
.bzsk__line {
  height: 12px;
  margin-bottom: var(--bz-space-2);
}
.bzsk__line:last-child { margin-bottom: 0; }
.bzsk__line--xl { width: 60%; height: 20px; border-radius: var(--bz-r-sm); }
.bzsk__line--lg { width: 45%; height: 14px; }
.bzsk__line--md { width: 70%; height: 12px; }
.bzsk__line--sm { width: 35%; height: 10px; }

/* ─── LIST ─────────────────────────────────────────────────────── */
.bzsk__row {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3) 0;
  border-bottom: 1px solid var(--bz-hairline-0);
}
.bzsk__avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--bz-r-pill);
  flex-shrink: 0;
}
.bzsk__lines { flex: 1; display: flex; flex-direction: column; }

/* ─── TABLE ────────────────────────────────────────────────────── */
.bzsk__table-head {
  display: flex;
  gap: var(--bz-space-3);
  padding: var(--bz-space-2) 0;
  border-bottom: 1px solid var(--bz-border);
}
.bzsk__th {
  flex: 1;
  height: 10px;
  border-radius: var(--bz-r-pill);
}
.bzsk__table-row {
  display: flex;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3) 0;
  border-bottom: 1px solid var(--bz-hairline-0);
}
.bzsk__td {
  flex: 1;
  height: 12px;
  border-radius: var(--bz-r-pill);
}

/* ─── CARD ─────────────────────────────────────────────────────── */
.bzsk--card {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--bz-space-4);
}
.bzsk__card {
  display: flex;
  flex-direction: column;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  overflow: hidden;
  padding-bottom: var(--bz-space-4);
  /* Shimmer overrides for card shell */
  background: var(--bz-card);
  animation: none;
}
.bzsk__card-media {
  width: 100%;
  height: v-bind("cardHeight + 'px'");
  border-radius: 0;
  animation: bzsk-shimmer 1.8s ease-in-out infinite;
}
.bzsk__card-body {
  padding: var(--bz-space-4) var(--bz-space-4) 0;
}

/* ─── HERO ─────────────────────────────────────────────────────── */
.bzsk__hero-media {
  width: 100%;
  height: 320px;
  border-radius: var(--bz-r);
  margin-bottom: var(--bz-space-4);
}
.bzsk__hero-body {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  padding: 0 var(--bz-space-2);
}

/* ─── TEXT ─────────────────────────────────────────────────────── */
.bzsk__text-block {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  padding: var(--bz-space-2) 0;
  border-bottom: 1px solid var(--bz-hairline-0);
}

/* ─── DOT ──────────────────────────────────────────────────────── */
.bzsk--dot {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
}
.bzsk__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--bz-r-pill);
}

/* Density */
.bzsk--density-compact .bzsk__row { padding: var(--bz-space-2) 0; }
.bzsk--density-spacious .bzsk__row { padding: var(--bz-space-4) 0; }
</style>
