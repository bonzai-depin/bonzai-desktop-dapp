<template>
  <div class="bz-chr">
    <div class="bz-chr__head">
      <span class="bz-chr__title bz-eyebrow">History</span>
      <span v-if="inferences.length" class="bz-chr__count bz-mono bz-meta">
        {{ inferences.length }}
      </span>
    </div>

    <div v-if="!inferences.length" class="bz-chr__empty">
      <span class="bz-chr__empty-icon" aria-hidden="true">
        <span class="material-symbols-outlined">inbox</span>
      </span>
      <p class="bz-meta" style="color: var(--bz-fg-low);">
        No conversations yet.
      </p>
    </div>

    <ul v-else class="bz-chr__list">
      <li
        v-for="group in grouped"
        :key="group.label"
        class="bz-chr__group"
      >
        <div class="bz-chr__group-label bz-eyebrow">{{ group.label }}</div>
        <ul class="bz-chr__items">
          <li
            v-for="entry in group.items"
            :key="entry.id"
            class="bz-chr__item"
            :class="{ 'is-active': entry.id === activeId }"
            tabindex="0"
            role="button"
            @click="$emit('select', entry)"
            @keydown.enter.prevent="$emit('select', entry)"
            @keydown.space.prevent="$emit('select', entry)"
          >
            <div class="bz-chr__item-prompt">{{ truncate(entry.prompt) }}</div>
            <div class="bz-chr__item-meta">
              <span v-if="entry.model" class="bz-chr__model bz-mono bz-meta">
                {{ entry.model }}
              </span>
              <span v-if="entry.ts" class="bz-meta">
                {{ formatTs(entry.ts) }}
              </span>
            </div>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  /** Each item: { id, prompt, model, ts } */
  inferences: { type: Array, default: () => [] },
  activeId: { type: [String, Number, null], default: null },
});

defineEmits(["select"]);

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

const grouped = computed(() => {
  const today = startOfDay(Date.now());
  const day = 86400000;
  const groups = new Map();

  function bucket(ts) {
    if (!ts) return "Earlier";
    const start = startOfDay(ts);
    const diff = Math.floor((today - start) / day);
    if (diff <= 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return "This week";
    if (diff < 30) return "This month";
    return "Earlier";
  }

  // Most-recent first
  const sorted = [...props.inferences].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  for (const it of sorted) {
    const k = bucket(it.ts);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }

  // Preserve canonical order
  const order = ["Today", "Yesterday", "This week", "This month", "Earlier"];
  return order
    .filter((k) => groups.has(k))
    .map((k) => ({ label: k, items: groups.get(k) }));
});

function truncate(s, n = 60) {
  if (!s) return "(empty)";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

function formatTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
</script>

<style scoped>
/* Date-grouped history rail.
   Tight, dense, scrolls. Each item is a card with a prompt preview
   and a meta line — model name in mono, time stamp in meta scale. */

.bz-chr {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.bz-chr__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bz-space-4) var(--bz-space-4) var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}
.bz-chr__title { color: var(--bz-fg-low); }
.bz-chr__count {
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  padding: 2px var(--bz-space-2);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
}

.bz-chr__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-5);
  text-align: center;
}
.bz-chr__empty-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-low);
}

.bz-chr__list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.bz-chr__group + .bz-chr__group {
  margin-top: var(--bz-space-3);
}

.bz-chr__group-label {
  display: block;
  padding: var(--bz-space-3) var(--bz-space-4) var(--bz-space-2);
  color: var(--bz-fg-low);
}

.bz-chr__items {
  list-style: none;
  margin: 0;
  padding: 0 var(--bz-space-2);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bz-chr__item {
  padding: var(--bz-space-3);
  border-radius: var(--bz-r);
  cursor: pointer;
  outline: none;
  border: 1px solid transparent;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-chr__item:hover {
  background: var(--bz-card);
  border-color: var(--bz-border);
}
.bz-chr__item:focus-visible {
  border-color: var(--bz-border-brand);
  box-shadow: 0 0 0 1px var(--bz-border-brand);
}
.bz-chr__item.is-active {
  background: var(--bz-purple-soft);
  border-color: var(--bz-border-brand);
}

.bz-chr__item-prompt {
  font-size: var(--bz-size-body);
  color: var(--bz-fg);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.bz-chr__item-meta {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-2);
  flex-wrap: wrap;
}
.bz-chr__model {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  padding: 1px var(--bz-space-2);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
