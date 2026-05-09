<template>
  <Teleport to="body">
    <Transition name="bz-modal">
      <div
        v-if="modelPicker.state.open"
        class="bz-picker"
        role="dialog"
        aria-modal="true"
        @click.self="close"
      >
        <div class="bz-picker__shell">
          <!-- Header — display title + hardware capsule + search + close -->
          <header class="bz-picker__header">
            <div class="bz-picker__heading">
              <p class="bz-eyebrow">Local model</p>
              <h1 class="bz-display">Choose your engine.</h1>
              <p class="bz-picker__subhead bz-meta">
                Ranked by how comfortably each model fits the hardware
                you have right now. The highlighted row is the engine
                currently loaded.
              </p>
            </div>

            <aside class="bz-hw" v-if="sysInfo">
              <div class="bz-hw__row">
                <span class="bz-eyebrow">GPU</span>
                <span class="bz-hw__value bz-mono">
                  {{ sysInfo.gpu || "—" }}
                </span>
              </div>
              <div class="bz-hw__row">
                <span class="bz-eyebrow">Effective VRAM</span>
                <span class="bz-hw__value bz-mono">
                  {{ fmtBytes(effectiveVram) }}
                </span>
              </div>
              <div class="bz-hw__row">
                <span class="bz-eyebrow">RAM budget</span>
                <span class="bz-hw__value bz-mono">
                  {{ fmtBytes(sysInfo.memBudget) }}
                </span>
              </div>
            </aside>

            <BzCloseButton
              class="bz-picker__close"
              size="md"
              aria-label="Close picker"
              title="Close (Esc)"
              @click="close"
            />
          </header>

          <!-- Toolbar — search + tier filters -->
          <div class="bz-picker__toolbar">
            <div class="bz-search">
              <span class="material-symbols-outlined bz-search__icon">search</span>
              <input
                v-model="search"
                type="text"
                class="bz-search__input"
                placeholder="Filter by name, family, or quant…"
              />
              <span class="bz-search__count bz-mono bz-meta">
                {{ visibleModels.length }} / {{ allModels.length }}
              </span>
            </div>
            <div class="bz-filters">
              <button
                v-for="t in tierFilters"
                :key="t.tier"
                class="bz-chip"
                :class="{ 'bz-chip--on': activeTiers.has(t.tier) }"
                @click="toggleTier(t.tier)"
              >
                <span class="bz-chip__dot" :class="`bz-chip__dot--t${t.tier}`"></span>
                {{ t.label }}
              </button>
            </div>
          </div>

          <!-- Body — grouped by tier -->
          <div class="bz-picker__body">
            <section
              v-for="group in visibleGroups"
              :key="group.tier"
              class="bz-group"
            >
              <header class="bz-group__head">
                <span
                  class="bz-group__dot"
                  :class="`bz-group__dot--t${group.tier}`"
                ></span>
                <span class="bz-eyebrow">{{ group.label }}</span>
                <span class="bz-group__count bz-mono bz-meta">
                  {{ group.models.length }}
                </span>
              </header>

              <div class="bz-rows">
                <div
                  v-for="model in group.models"
                  :key="model.filename"
                  class="bz-row"
                  :class="{
                    'bz-row--current': currentFilename === model.filename,
                    'bz-row--unfit':   model.fitTier === 3,
                    'bz-row--ready':   availability[model.filename],
                  }"
                  @click="onActivate(model)"
                >
                  <!-- Status dot (left) -->
                  <span
                    class="bz-row__status"
                    :class="rowStatusClass(model)"
                    :title="rowStatusTitle(model)"
                  ></span>

                  <!-- Title block -->
                  <div class="bz-row__title">
                    <span class="bz-h3">{{ model.modelname }}</span>
                    <span class="bz-row__meta bz-mono bz-meta">
                      {{ shortFilename(model.filename) }}
                    </span>
                  </div>

                  <!-- Stats — mono, tabular -->
                  <div class="bz-row__stats">
                    <span class="bz-stat">
                      <span class="bz-eyebrow">Disk</span>
                      <span class="bz-mono">{{ model.filesize || "—" }}</span>
                    </span>
                    <span class="bz-stat">
                      <span class="bz-eyebrow">VRAM</span>
                      <span class="bz-mono">{{ vramOf(model) }}</span>
                    </span>
                    <span class="bz-stat" v-if="model.isMoE">
                      <span class="bz-eyebrow">Active</span>
                      <span class="bz-mono">{{ activeBn(model) }} B</span>
                    </span>
                  </div>

                  <!-- Action -->
                  <div class="bz-row__action">
                    <span
                      v-if="currentFilename === model.filename"
                      class="bz-loaded-pill"
                    >
                      <span class="bz-loaded-pill__dot"></span>
                      Loaded
                    </span>

                    <button
                      v-else-if="!availability[model.filename]"
                      class="bz-btn bz-btn--ghost"
                      :class="{ 'bz-btn--running': downloading[model.filename] != null }"
                      :disabled="downloading[model.filename] != null"
                      @click.stop="onDownload(model)"
                    >
                      <template v-if="downloading[model.filename] != null">
                        <span class="bz-mono">{{ downloading[model.filename] }}%</span>
                        <span class="bz-btn__progress bz-generating"></span>
                      </template>
                      <template v-else>Download</template>
                    </button>

                    <button
                      v-else
                      class="bz-btn bz-btn--primary"
                      :disabled="loading[model.filename] || model.fitTier === 3"
                      @click.stop="onLoad(model)"
                    >
                      {{ loading[model.filename] ? "Loading…" : "Load" }}
                    </button>

                    <!-- Delete is one click away, never primary. -->
                    <button
                      v-if="availability[model.filename] && currentFilename !== model.filename"
                      class="bz-iconbtn bz-row__delete"
                      @click.stop="onDelete(model)"
                      title="Remove downloaded weights"
                      aria-label="Delete model"
                    >
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div v-if="visibleModels.length === 0" class="bz-empty">
              <p class="bz-h2">Nothing matches that filter.</p>
              <p class="bz-meta">Try clearing the tier chips or simplifying the search.</p>
            </div>
          </div>

          <!-- Footer — keep one line of breathing room + hint -->
          <footer class="bz-picker__footer">
            <span class="bz-meta">
              <span class="bz-mono">Esc</span> to close ·
              <span class="bz-mono">↩</span> to load the highlighted row
            </span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, reactive } from "vue";
import { listAllLLMs } from "../skills/flagship.js";
import { modelStore } from "../stores/modelStore.js";
import { modelPicker } from "../services/modelPicker.service.js";
import {
  computeMemoryRequirements,
  computeFitTier,
  effectiveVramBytes,
} from "../services/modelFit.service.js";
import BzCloseButton from "./BzCloseButton.vue";

// ─────────────────────────────────────────────────────────────────────
// HARDWARE PROFILE
// ─────────────────────────────────────────────────────────────────────
const sysInfo = ref(null);
const effectiveVram = computed(() => effectiveVramBytes(sysInfo.value));
const fetchSysInfo = async () => {
  try { sysInfo.value = await window.electronAPI?.systemInformation?.(); }
  catch {}
};

// ─────────────────────────────────────────────────────────────────────
// LIST + GROUPING
// ─────────────────────────────────────────────────────────────────────
const search = ref("");
const availability = reactive({});
const downloading = reactive({});
const loading = reactive({});
const currentFilename = computed(() => modelStore.state.current?.filename || null);

const TIER_LABEL = {
  0: "Comfortable",
  1: "Tight",
  2: "Offload",
  3: "Won't fit",
};

const tierFilters = [
  { tier: 0, label: "Comfortable" },
  { tier: 1, label: "Tight" },
  { tier: 2, label: "Offload" },
  { tier: 3, label: "Won't fit" },
];

// Default: hide "Won't fit" so the user sees something useful first.
const activeTiers = ref(new Set([0, 1, 2]));
function toggleTier(tier) {
  const next = new Set(activeTiers.value);
  if (next.has(tier)) next.delete(tier); else next.add(tier);
  activeTiers.value = next;
}

const allModels = computed(() => {
  return listAllLLMs()
    .map((e) => {
      const m = {
        filename: e.filename,
        modelname: e.name,
        filesize: e.size,
        parameters: e.parameters,
        activeParameters: e.activeParameters,
        isMoE: e.isMoE,
        context: e.context,
        layers: e.layers,
        kvHeads: e.kvHeads,
        headDim: e.headDim,
        url: e.url,
      };
      const mem = computeMemoryRequirements(m);
      const fit = computeFitTier(mem, sysInfo.value);
      return { ...m, mem, fitTier: fit.tier, fitLabel: fit.label, fitReason: fit.reason };
    })
    .sort((a, b) => {
      if (a.fitTier !== b.fitTier) return a.fitTier - b.fitTier;
      if ((b.parameters || 0) !== (a.parameters || 0)) return (b.parameters || 0) - (a.parameters || 0);
      return a.modelname.localeCompare(b.modelname);
    });
});

const visibleModels = computed(() => {
  const q = search.value.trim().toLowerCase();
  return allModels.value.filter((m) => {
    if (!activeTiers.value.has(m.fitTier)) return false;
    if (!q) return true;
    return m.modelname.toLowerCase().includes(q) || m.filename.toLowerCase().includes(q);
  });
});

const visibleGroups = computed(() => {
  const buckets = new Map();
  for (const m of visibleModels.value) {
    if (!buckets.has(m.fitTier)) buckets.set(m.fitTier, []);
    buckets.get(m.fitTier).push(m);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, models]) => ({ tier, label: TIER_LABEL[tier], models }));
});

// ─────────────────────────────────────────────────────────────────────
// FORMATTING — keep monospace + locale-aware where it counts
// ─────────────────────────────────────────────────────────────────────
const fmtBytes = (b) => {
  const n = Number(b) || 0;
  if (!n) return "—";
  if (n < 1e9) return `${(n / 1e6).toFixed(0)} MB`;
  return `${(n / 1e9).toFixed(1)} GB`;
};
const vramOf = (model) => `${model.mem.vramGB} GB`;
const activeBn = (model) =>
  ((model.activeParameters || model.parameters || 0) / 1e9).toFixed(1);

// Show only the meaningful tail of the GGUF filename (last 38 chars
// truncated mid-string). Filenames are hashes — full paths add noise.
const shortFilename = (name) => {
  if (!name) return "";
  if (name.length <= 42) return name;
  return name.slice(0, 18) + "…" + name.slice(-22);
};

const rowStatusClass = (model) => ({
  "bz-row__status--current":   currentFilename.value === model.filename,
  "bz-row__status--ready":     currentFilename.value !== model.filename && availability[model.filename],
  "bz-row__status--available": currentFilename.value !== model.filename && !availability[model.filename] && model.fitTier !== 3,
  "bz-row__status--unfit":     model.fitTier === 3,
});

const rowStatusTitle = (model) => {
  if (currentFilename.value === model.filename) return "Currently loaded";
  if (availability[model.filename]) return "Downloaded · ready to load";
  if (model.fitTier === 3) return model.fitReason;
  return "Available to download";
};

// ─────────────────────────────────────────────────────────────────────
// AVAILABILITY + ACTIONS
// ─────────────────────────────────────────────────────────────────────
async function refreshAvailability() {
  for (const m of allModels.value) {
    try {
      availability[m.filename] = await window.electronAPI?.checkModel?.(m.filename);
    } catch {
      availability[m.filename] = false;
    }
  }
}

let _unsubProgress = null;

async function onDownload(model) {
  if (!window.electronAPI?.downloadModel) return;
  downloading[model.filename] = 0;
  try {
    const ok = await window.electronAPI.downloadModel(model.url, model.filename);
    if (ok) availability[model.filename] = true;
  } finally {
    delete downloading[model.filename];
  }
}

async function onLoad(model) {
  if (!window.electronAPI?.loadModel) return;
  if (model.fitTier === 3) return; // can't fit — block silently
  loading[model.filename] = true;
  try {
    await window.electronAPI.loadModel({
      modelname: model.modelname,
      filename: model.filename,
      url: model.url,
      parameters: model.parameters,
      context: model.context,
    });
    modelStore.setCurrent(model);
    modelPicker._resolve(model);
  } catch (e) {
    console.error("[ModelPicker] Load failed:", e);
  } finally {
    loading[model.filename] = false;
  }
}

async function onDelete(model) {
  if (!window.electronAPI?.deleteModel) return;
  if (!confirm(`Remove the downloaded copy of ${model.modelname}?`)) return;
  await window.electronAPI.deleteModel(model.filename);
  availability[model.filename] = false;
}

// Single-click row activation: download if missing, load if ready,
// noop if it's already loaded or won't fit. Mirrors the per-row CTA
// so accidental misclicks land on the right action regardless.
function onActivate(model) {
  if (model.fitTier === 3) return;
  if (currentFilename.value === model.filename) return;
  if (availability[model.filename]) onLoad(model);
  else if (downloading[model.filename] == null) onDownload(model);
}

function close() {
  modelPicker.hide();
}

function onKey(e) {
  if (!modelPicker.state.open) return;
  if (e.key === "Escape") close();
  else if (e.key === "Enter") {
    const first = visibleModels.value.find(
      (m) => m.fitTier !== 3 && currentFilename.value !== m.filename,
    );
    if (first) onActivate(first);
  }
}

// ─────────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────────
watch(
  () => modelPicker.state.open,
  (open) => {
    if (!open) return;
    fetchSysInfo();
    setTimeout(fetchSysInfo, 1500);
    refreshAvailability();
  },
);

onMounted(() => {
  window.addEventListener("keydown", onKey);
  _unsubProgress = window.electronAPI?.onDownloadProgress?.((_event, data) => {
    if (data?.filename && downloading[data.filename] !== undefined) {
      downloading[data.filename] = Math.round((data.percent || 0) * 100);
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  if (_unsubProgress) { try { _unsubProgress(); } catch {} _unsubProgress = null; }
});
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════════════
   LLM MODEL PICKER  ·  Refreshed against /DESIGN.md
   Editorial layout × purple-monochrome × monospace data.
   No glassmorphism; one cinematic transition; one brand moment
   (the Loaded pill).
   ════════════════════════════════════════════════════════════════════ */

.bz-picker {
  position: fixed;
  inset: 0;
  z-index: var(--bz-z-modal);
  background: var(--bz-overlay);
  display: flex;
  padding: var(--bz-space-5);
}

.bz-picker__shell {
  flex: 1;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--bz-elev-3);
}

/* ─── Header ──────────────────────────────────────────────────── */
.bz-picker__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: start;
  gap: var(--bz-space-6);
  padding: var(--bz-space-6) var(--bz-space-7);
  border-bottom: 1px solid var(--bz-border);
}

.bz-picker__heading .bz-eyebrow {
  margin: 0 0 var(--bz-space-2) 0;
}
.bz-picker__heading h1 {
  margin: 0;
  color: var(--bz-fg);
}
.bz-picker__subhead {
  margin: var(--bz-space-3) 0 0 0;
  max-width: 60ch;
  color: var(--bz-fg-mid);
}

.bz-hw {
  min-width: 240px;
  padding: var(--bz-space-3) var(--bz-space-4);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  display: grid;
  gap: var(--bz-space-2);
}
.bz-hw__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--bz-space-3);
}
.bz-hw__row .bz-eyebrow { white-space: nowrap; }
.bz-hw__value {
  color: var(--bz-fg);
  font-size: var(--bz-size-meta);
  text-align: right;
  max-width: 14em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bz-picker__close { align-self: start; }

/* ─── Toolbar ─────────────────────────────────────────────────── */
.bz-picker__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bz-space-4);
  padding: var(--bz-space-4) var(--bz-space-7);
  border-bottom: 1px solid var(--bz-border);
}

.bz-search {
  flex: 1 1 320px;
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: 0 var(--bz-space-3);
  height: 40px;
  transition: border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-search:focus-within { border-color: var(--bz-border-brand); }
.bz-search__icon {
  font-size: 18px !important;
  color: var(--bz-fg-low);
  margin-right: var(--bz-space-2);
}
.bz-search__input {
  flex: 1;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--bz-fg);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
}
.bz-search__input::placeholder { color: var(--bz-fg-low); }
.bz-search__count { margin-left: var(--bz-space-3); white-space: nowrap; }

.bz-filters {
  display: flex;
  gap: var(--bz-space-2);
  flex-wrap: wrap;
}

.bz-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  height: 32px;
  padding: 0 var(--bz-space-3);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-chip:hover { color: var(--bz-fg); border-color: var(--bz-border-strong); }
.bz-chip--on {
  background: var(--bz-purple-soft);
  border-color: var(--bz-border-brand);
  color: var(--bz-fg);
}
.bz-chip__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-fg-low);
}
.bz-chip__dot--t0 { background: var(--bz-emerald-500); }
.bz-chip__dot--t1 { background: var(--bz-warning); }
.bz-chip__dot--t2 { background: var(--bz-info); }
.bz-chip__dot--t3 { background: var(--bz-danger); }

/* ─── Body / Groups ───────────────────────────────────────────── */
.bz-picker__body {
  flex: 1;
  overflow-y: auto;
  padding: var(--bz-space-5) var(--bz-space-7) var(--bz-space-7);
}

.bz-group + .bz-group { margin-top: var(--bz-space-7); }

.bz-group__head {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-4);
  padding-bottom: var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}
.bz-group__dot {
  width: 8px; height: 8px;
  border-radius: var(--bz-r-pill);
}
.bz-group__dot--t0 { background: var(--bz-emerald-500); }
.bz-group__dot--t1 { background: var(--bz-warning); }
.bz-group__dot--t2 { background: var(--bz-info); }
.bz-group__dot--t3 { background: var(--bz-danger); }
.bz-group__count { margin-left: auto; }

.bz-rows { display: flex; flex-direction: column; gap: var(--bz-space-2); }

/* ─── Row ─────────────────────────────────────────────────────── */
.bz-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1.4fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-5);
  padding: var(--bz-space-4) var(--bz-space-5);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  cursor: pointer;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-row:hover {
  background: var(--bz-raised);
  border-color: var(--bz-border-strong);
}
.bz-row--current {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
}
.bz-row--unfit {
  cursor: not-allowed;
  opacity: 0.55;
}
.bz-row--unfit:hover { background: var(--bz-canvas); }

/* Status dot — leftmost column. Color = state at a glance. */
.bz-row__status {
  width: 8px; height: 8px;
  border-radius: var(--bz-r-pill);
  background: var(--bz-fg-faint);
  align-self: center;
  justify-self: center;
}
.bz-row__status--current   { background: var(--bz-purple-300); box-shadow: 0 0 0 4px var(--bz-purple-soft); }
.bz-row__status--ready     { background: var(--bz-emerald-500); }
.bz-row__status--available { background: var(--bz-fg-low); }
.bz-row__status--unfit     { background: var(--bz-danger); }

/* Title block */
.bz-row__title {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-1);
  min-width: 0;
}
.bz-row__title .bz-h3 {
  color: var(--bz-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-row__meta { color: var(--bz-fg-low); }

/* Stats */
.bz-row__stats {
  display: flex;
  gap: var(--bz-space-5);
  align-items: baseline;
  flex-wrap: wrap;
}
.bz-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 60px;
}
.bz-stat .bz-mono { color: var(--bz-fg); }

/* Action column */
.bz-row__action {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  justify-content: flex-end;
}

/* ─── Loaded brand moment ────────────────────────────────────── */
.bz-loaded-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: 6px var(--bz-space-3);
  background: var(--bz-gradient-brand);
  color: #fff;
  border-radius: var(--bz-r-pill);
  font-size: var(--bz-size-micro);
  letter-spacing: var(--bz-track-eyebrow);
  text-transform: uppercase;
  font-weight: 400;
}
.bz-loaded-pill__dot {
  width: 6px; height: 6px;
  border-radius: var(--bz-r-pill);
  background: #fff;
}

/* ─── Buttons ─────────────────────────────────────────────────── */
.bz-btn {
  height: 36px;
  padding: 0 var(--bz-space-4);
  background: transparent;
  border: 1px solid var(--bz-border-strong);
  color: var(--bz-fg);
  border-radius: var(--bz-r);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition:
    background var(--bz-dur-fast) var(--bz-ease-out),
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-btn:hover:not(:disabled) {
  background: var(--bz-raised);
  border-color: var(--bz-purple-300);
}
.bz-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.bz-btn--primary {
  background: var(--bz-gradient-brand);
  border-color: transparent;
  color: #fff;
}
.bz-btn--primary:hover:not(:disabled) {
  filter: brightness(1.08);
  border-color: transparent;
}
.bz-btn--ghost { background: var(--bz-canvas); }
.bz-btn--running { padding-bottom: 4px; }
.bz-btn__progress {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 2px;
  border-radius: 0 0 var(--bz-r) var(--bz-r);
}

.bz-iconbtn {
  width: 36px; height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
  border-radius: var(--bz-r);
  cursor: pointer;
  transition: background var(--bz-dur-fast), color var(--bz-dur-fast);
}
.bz-iconbtn:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
  border-color: var(--bz-border-strong);
}
.bz-iconbtn .material-symbols-outlined { font-size: 18px !important; }

.bz-row__delete:hover {
  color: var(--bz-danger);
  border-color: var(--bz-danger-soft);
}

/* ─── Empty state ─────────────────────────────────────────────── */
.bz-empty {
  text-align: center;
  padding: var(--bz-space-8) var(--bz-space-5);
  color: var(--bz-fg-mid);
}
.bz-empty .bz-h2 { color: var(--bz-fg); margin-bottom: var(--bz-space-3); }

/* ─── Footer ──────────────────────────────────────────────────── */
.bz-picker__footer {
  padding: var(--bz-space-3) var(--bz-space-7);
  border-top: 1px solid var(--bz-border);
  text-align: center;
  color: var(--bz-fg-low);
}

/* ─── Modal transition (one motion language) ────────────────── */
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

/* ─── Responsive ─────────────────────────────────────────────── */
@media (max-width: 960px) {
  .bz-picker__header {
    grid-template-columns: 1fr;
  }
  .bz-row {
    grid-template-columns: 8px 1fr auto;
  }
  .bz-row__stats { display: none; }
}
</style>
