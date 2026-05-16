<template>
  <div class="bz-chr">
    <div class="bz-chr__head">
      <span class="bz-chr__title bz-eyebrow">History</span>
      <span v-if="filteredInferences.length" class="bz-chr__count bz-mono bz-meta">
        {{ filteredInferences.length }}
      </span>
    </div>

    <!-- Search -->
    <div v-if="inferences.length" class="bz-chr__search">
      <span class="material-symbols-outlined bz-chr__search-icon" aria-hidden="true">search</span>
      <input
        v-model="query"
        type="text"
        placeholder="Search conversations…"
        class="bz-chr__search-input"
      />
      <button v-if="query" class="bz-chr__search-clear" @click="query = ''">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>

    <div v-if="!filteredInferences.length" class="bz-chr__empty">
      <span class="bz-chr__empty-icon" aria-hidden="true">
        <span class="material-symbols-outlined">inbox</span>
      </span>
      <p class="bz-meta" style="color: var(--bz-fg-low);">
        {{ query ? 'No matches found.' : 'No conversations yet.' }}
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
            :class="{
              'is-active': entry.id === activeId,
              'is-branch': Number(entry.branchDepth || 0) > 0,
            }"
            :style="{ '--branch-depth': Math.min(Number(entry.branchDepth || 0), 4) }"
            tabindex="0"
            role="button"
            @click="$emit('select', entry)"
            @keydown.enter.prevent="$emit('select', entry)"
            @keydown.space.prevent="$emit('select', entry)"
          >
            <div class="bz-chr__item-row">
              <div class="bz-chr__item-prompt">
                <span
                  v-if="Number(entry.branchDepth || 0) > 0"
                  class="bz-chr__branch-icon"
                  aria-hidden="true"
                >
                  <span class="material-symbols-outlined">call_split</span>
                </span>
                <span class="bz-chr__item-prompt-text">{{ truncate(entry.prompt) }}</span>
              </div>
              <button
                type="button"
                class="bz-chr__pin"
                :class="{ 'is-pinned': entry.pinned }"
                :title="entry.pinned ? 'Unpin conversation' : 'Pin conversation'"
                :aria-label="entry.pinned ? 'Unpin conversation' : 'Pin conversation'"
                :aria-pressed="entry.pinned ? 'true' : 'false'"
                @click.stop="$emit('toggle-pin', entry)"
                @keydown.stop
              >
                <span class="material-symbols-outlined" aria-hidden="true">
                  {{ entry.pinned ? 'keep' : 'keep_off' }}
                </span>
              </button>
            </div>
            <div class="bz-chr__item-meta">
              <span v-if="entry.model" class="bz-chr__model bz-mono bz-meta">
                {{ entry.model }}
              </span>
              <span v-if="entry.tokenCount" class="bz-chr__metric bz-mono bz-meta">
                {{ formatTokens(entry.tokenCount) }}
              </span>
              <span v-if="entry.durationMs" class="bz-chr__metric bz-mono bz-meta">
                {{ formatDuration(entry.durationMs) }}
              </span>
              <span v-if="entry.ts" class="bz-meta">
                {{ formatTs(entry.ts) }}
              </span>
              <span v-if="Number(entry.branchDepth || 0) > 0" class="bz-chr__fork bz-meta">
                Fork
              </span>
            </div>
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  /** Each item: { id, prompt, model, ts, branchParentId, branchDepth } */
  inferences: { type: Array, default: () => [] },
  activeId: { type: [String, Number, null], default: null },
});

const emit = defineEmits(["select", "toggle-pin"]);

const query = ref("");

const filteredInferences = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.inferences;
  return props.inferences.filter((inf) =>
    (inf.prompt || "").toLowerCase().includes(q) ||
    (inf.model || "").toLowerCase().includes(q),
  );
});

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

const grouped = computed(() => {
  const today = startOfDay(Date.now());
  const day = 86400000;
  const groups = new Map();
  const pinned = [];

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

  const sourceItems = [...filteredInferences.value];
  const visibleIds = new Set(sourceItems.map((item) => item.id));
  const children = new Map();
  const chronological = sourceItems.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  for (const item of chronological) {
    if (!item.branchParentId) continue;
    if (!children.has(item.branchParentId)) children.set(item.branchParentId, []);
    children.get(item.branchParentId).push(item);
  }

  const sorted = [];
  const visited = new Set();
  const visit = (item) => {
    if (!item || visited.has(item.id)) return;
    visited.add(item.id);
    sorted.push(item);
    for (const child of children.get(item.id) || []) visit(child);
  };
  chronological
    .filter((item) => !item.branchParentId || !visibleIds.has(item.branchParentId))
    .forEach(visit);
  chronological.forEach(visit);

  for (const it of sorted) {
    if (it.pinned) {
      pinned.push(it);
      continue;
    }
    const k = bucket(it.ts);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }

  // Preserve earliest-to-latest group order.
  const order = ["Earlier", "This month", "This week", "Yesterday", "Today"];
  const dateGroups = order
    .filter((k) => groups.has(k))
    .map((k) => ({ label: k, items: groups.get(k) }));
  return pinned.length
    ? [{ label: "Pinned", items: pinned }, ...dateGroups]
    : dateGroups;
});

function truncate(s, n = 80) {
  if (!s) return "(empty)";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

function formatTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTokens(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k tok`;
  return `${n} tok`;
}

function formatDuration(ms) {
  const n = Number(ms) || 0;
  if (n <= 0) return "";
  if (n < 1000) return "<1s";
  const seconds = Math.round(n / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
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
  margin-left: calc(var(--branch-depth, 0) * 12px);
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-chr__item.is-branch {
  border-left-color: var(--bz-border-brand);
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

.bz-chr__item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-2);
}
.bz-chr__item-prompt {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  font-size: var(--bz-size-body);
  color: var(--bz-fg);
  line-height: 1.4;
}
.bz-chr__item-prompt-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-chr__branch-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--bz-purple-300);
}
.bz-chr__branch-icon .material-symbols-outlined {
  font-size: 15px !important;
}
.bz-chr__pin {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--bz-r-sm);
  background: transparent;
  color: var(--bz-fg-low);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--bz-dur-fast),
    color var(--bz-dur-fast),
    background var(--bz-dur-fast),
    border-color var(--bz-dur-fast);
}
.bz-chr__item:hover .bz-chr__pin,
.bz-chr__item:focus-within .bz-chr__pin,
.bz-chr__pin.is-pinned {
  opacity: 1;
}
.bz-chr__pin:hover,
.bz-chr__pin:focus-visible {
  background: var(--bz-raised);
  border-color: var(--bz-border);
  color: var(--bz-fg);
  outline: none;
}
.bz-chr__pin.is-pinned {
  color: var(--bz-purple-300);
}
.bz-chr__pin .material-symbols-outlined {
  font-size: 16px !important;
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
.bz-chr__metric {
  color: var(--bz-fg-low);
  white-space: nowrap;
}
.bz-chr__fork {
  color: var(--bz-purple-300);
}

/* Search bar inside the history rail */
.bz-chr__search {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-3) var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
}
.bz-chr__search-icon {
  font-size: 16px !important;
  color: var(--bz-fg-low);
}
.bz-chr__search-input {
  flex: 1;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
}
.bz-chr__search-input::placeholder {
  color: var(--bz-fg-low);
  font-style: italic;
}
.bz-chr__search-clear {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  color: var(--bz-fg-low);
  cursor: pointer;
}
.bz-chr__search-clear .material-symbols-outlined { font-size: 14px !important; }
</style>
