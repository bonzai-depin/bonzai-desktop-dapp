<template>
  <Teleport to="body">
    <Transition name="bz-modal">
      <div
        v-if="commandPalette.state.open"
        class="bz-cmdk"
        @click.self="close"
      >
        <div ref="dialogRef" class="bz-cmdk__shell" data-i18n-skip role="dialog" aria-modal="true" :aria-label="$t('rc.palette.title')" @click.stop>
          <!-- Search input (auto-focus) -->
          <div class="bz-cmdk__search">
            <span class="material-symbols-outlined bz-cmdk__icon">search</span>
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              class="bz-cmdk__input"
              :placeholder="$t('rc.palette.search')"
              :aria-label="$t('rc.palette.search')"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              :aria-controls="listId"
              :aria-activedescendant="activeId ? `${listId}-${activeId}` : undefined"
              @keydown.down.prevent="move(1)"
              @keydown.up.prevent="move(-1)"
              @keydown.enter.prevent="runActive()"
            />
            <span class="bz-mono bz-meta bz-cmdk__count">
              {{ filtered.length }}
            </span>
          </div>

          <!-- Results — grouped -->
          <div class="bz-cmdk__results" ref="resultsEl" :id="listId" role="listbox" tabindex="-1" :aria-label="$t('rc.palette.title')">
            <template v-for="group in grouped" :key="group.name">
              <div class="bz-cmdk__group-head bz-eyebrow">{{ group.name }}</div>
              <button
                v-for="cmd in group.items"
                :key="cmd.id"
                type="button"
                role="option"
                :id="`${listId}-${cmd.id}`"
                :aria-selected="cmd.id === activeId"
                tabindex="-1"
                class="bz-cmdk__row"
                :class="{ 'bz-cmdk__row--active': cmd.id === activeId }"
                @click="run(cmd.id)"
                @mouseenter="setActive(cmd.id)"
              >
                <span class="bz-cmdk__row-label">{{ cmd.label }}</span>
                <span v-if="cmd.shortcut" class="bz-cmdk__row-shortcut bz-mono">
                  {{ cmd.shortcut }}
                </span>
              </button>
            </template>

            <div v-if="filtered.length === 0" class="bz-cmdk__empty">
              <p class="bz-h3">{{ $t('rc.palette.noMatches') }}</p>
              <p class="bz-meta">
                {{ $t('rc.palette.trySearch') }}
              </p>
            </div>
          </div>

          <!-- Footer hints -->
          <footer class="bz-cmdk__footer">
            <span class="bz-meta">
              {{ $t('rc.palette.hint') }}
            </span>
            <button type="button" class="bz-btn bz-btn--ghost" @click="close">{{ $t('common.close') }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted, useId } from "vue";
import { commandPalette } from "../services/commandPalette.service.js";
import { useModalAccessibility } from '../composables/useModalAccessibility.js';

// Two-way bind the search query to the service so external callers
// can prefill it, and keep the modal as the single source of UI state.
const query = computed({
  get: () => commandPalette.state.query,
  set: (v) => commandPalette.setQuery(v),
});

const inputEl = ref(null);
const dialogRef = ref(null);
const listId = useId();
useModalAccessibility(dialogRef, { onClose: close, initialFocus: inputEl });
const resultsEl = ref(null);
const activeId = ref(null);

// Lightweight fuzzy ranking — substring match across label + keywords,
// scored by where the match lands. Better than alphabetical, lighter
// than a full fuzzy lib.
function score(cmd, q) {
  if (!q) return 1;
  const hay = (cmd.label + " " + (cmd.keywords || "")).toLowerCase();
  const idx = hay.indexOf(q);
  if (idx < 0) return 0;
  // Earlier match wins; exact label match wins more.
  if (cmd.label.toLowerCase().startsWith(q)) return 100 - idx;
  if (cmd.label.toLowerCase().includes(q)) return 50 - idx;
  return 10 - idx;
}

const filtered = computed(() => {
  const q = (commandPalette.state.query || "").trim().toLowerCase();
  return commandPalette.commands.value
    .map((c) => ({ cmd: c, s: score(c, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.cmd);
});

const grouped = computed(() => {
  const map = new Map();
  for (const cmd of filtered.value) {
    const g = cmd.group || "Other";
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(cmd);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});

// Selection follows the filtered list. When the query changes, snap
// the active row to the top so Enter does the obvious thing.
watch(filtered, (list) => {
  activeId.value = list[0]?.id ?? null;
}, { immediate: true });

function setActive(id) { activeId.value = id; }

function move(delta) {
  const list = filtered.value;
  if (list.length === 0) return;
  const idx = Math.max(0, list.findIndex((c) => c.id === activeId.value));
  const next = (idx + delta + list.length) % list.length;
  activeId.value = list[next].id;
  // Keep the active row in view.
  nextTick(() => {
    const row = resultsEl.value?.querySelector(".bz-cmdk__row--active");
    row?.scrollIntoView({ block: "nearest" });
  });
}

function runActive() {
  if (!activeId.value) return;
  commandPalette.run(activeId.value);
}

function run(id) { commandPalette.run(id); }

function close() { commandPalette.hide(); }

// Cmd-K / Ctrl-K toggles. Esc closes. Listener lives on the
// component itself, mounted once at App.vue level.
function onGlobalKey(e) {
  const isToggle =
    (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
  if (isToggle) {
    e.preventDefault();
    commandPalette.toggle();
    return;
  }
  if (commandPalette.state.open && e.key === "Escape") {
    e.preventDefault();
    close();
  }
}

watch(
  () => commandPalette.state.open,
  (open) => {
    if (open) nextTick(() => inputEl.value?.focus());
  },
);

onMounted(() => {
  window.addEventListener("keydown", onGlobalKey);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onGlobalKey);
});
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════════
   COMMAND PALETTE
   Editorial dialog. Search → grouped results → activate. The modal
   does not steal full viewport — it's a focused 560 px panel near the
   top of the screen where the eye lands first when invoking Cmd-K.
   ════════════════════════════════════════════════════════════════════ */

.bz-cmdk {
  position: fixed;
  inset: 0;
  z-index: var(--bz-z-modal);
  background: var(--bz-overlay);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}

.bz-cmdk__shell {
  width: min(560px, 92vw);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  overflow: hidden;
  box-shadow: var(--bz-elev-3);
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

/* Search */
.bz-cmdk__search {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4) var(--bz-space-5);
  border-bottom: 1px solid var(--bz-border);
}
.bz-cmdk__icon {
  font-size: 20px !important;
  color: var(--bz-fg-low);
}
.bz-cmdk__input {
  flex: 1;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-h3);
  font-weight: 400;
  height: 28px;
}
.bz-cmdk__input::placeholder { color: var(--bz-fg-low); }
.bz-cmdk__count { white-space: nowrap; }

/* Results */
.bz-cmdk__results {
  flex: 1;
  overflow-y: auto;
  padding: var(--bz-space-2) 0;
}
.bz-cmdk__group-head {
  padding: var(--bz-space-3) var(--bz-space-5) var(--bz-space-1);
  color: var(--bz-fg-low);
}
.bz-cmdk__row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3) var(--bz-space-5);
  background: transparent;
  border: 0;
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  text-align: left;
  cursor: pointer;
  transition: background var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-cmdk__row:hover,
.bz-cmdk__row--active {
  background: var(--bz-purple-soft);
  color: var(--bz-fg);
}
.bz-cmdk__row-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-cmdk__row-shortcut {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

.bz-cmdk__empty {
  text-align: center;
  padding: var(--bz-space-7) var(--bz-space-5);
}
.bz-cmdk__empty .bz-h3 { color: var(--bz-fg); margin-bottom: var(--bz-space-2); }

/* Footer */
.bz-cmdk__footer {
  padding: var(--bz-space-3) var(--bz-space-5);
  border-top: 1px solid var(--bz-border);
  text-align: center;
  color: var(--bz-fg-low);
}

/* Modal transition — same vocabulary as the picker. */
.bz-modal-enter-active,
.bz-modal-leave-active {
  transition:
    opacity var(--bz-dur-base) var(--bz-ease-out),
    transform var(--bz-dur-base) var(--bz-ease-out);
}
.bz-modal-enter-from,
.bz-modal-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>
