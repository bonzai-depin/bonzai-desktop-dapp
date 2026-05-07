<template>
  <Teleport to="body">
    <div v-if="modelPicker.state.open" class="llm-picker-modal" @click.self="close">
      <div class="llm-picker-shell">
        <header class="llm-picker-header">
          <h2 class="fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined mr-2">neurology</span>
            Choose a model
          </h2>
          <div class="llm-picker-meta">
            <span v-if="sysInfo" class="hw-summary">
              {{ sysInfo.gpu || "GPU" }} · {{ formatGB(effectiveVram) }} effective ·
              {{ formatGB(sysInfo.memBudget) }} RAM budget
            </span>
            <input
              v-model="search"
              type="text"
              placeholder="Search by name or quant…"
              class="input search-input"
            />
            <button class="button is-small close-btn" @click="close" title="Close (Esc)">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </header>

        <div class="llm-picker-body">
          <div class="tier-legend">
            <span class="fit-badge fit-badge--tier0">Comfortable</span>
            <span class="fit-badge fit-badge--tier1">Tight</span>
            <span class="fit-badge fit-badge--tier2">Offload</span>
            <span class="fit-badge fit-badge--tier3">Won't fit</span>
          </div>

          <div class="model-grid">
            <div
              v-for="model in visibleModels"
              :key="model.filename"
              class="model-row"
              :class="{
                'model-row--current': currentFilename === model.filename,
                'model-row--available': availability[model.filename],
                ['model-row--tier' + model.fitTier]: true,
              }"
            >
              <div class="model-name">
                <span class="material-symbols-outlined model-icon">
                  {{ model.fitTier === 3 ? 'block' : 'memory' }}
                </span>
                <strong>{{ model.modelname }}</strong>
                <span class="fit-badge"
                      :class="`fit-badge--tier${model.fitTier}`"
                      :title="model.fitReason">
                  {{ model.fitLabel }}
                </span>
                <span v-if="currentFilename === model.filename" class="active-pill">Loaded</span>
              </div>
              <div class="model-stats">
                <span class="stat">{{ model.filesize }}</span>
                <span class="stat">{{ formatVram(model) }} VRAM</span>
                <span v-if="model.isMoE" class="stat moe">MoE · {{ activeBn(model) }}B active</span>
              </div>
              <div class="model-actions">
                <button
                  v-if="!availability[model.filename]"
                  class="button is-success is-small"
                  :disabled="downloading[model.filename] != null"
                  @click="onDownload(model)"
                >
                  <span v-if="downloading[model.filename] != null">
                    {{ downloading[model.filename] }}%
                  </span>
                  <span v-else>
                    <span class="material-symbols-outlined">download</span>
                    Download
                  </span>
                </button>
                <button
                  v-else
                  class="button is-info is-small"
                  :disabled="loading[model.filename] || currentFilename === model.filename"
                  @click="onLoad(model)"
                >
                  <span v-if="loading[model.filename]">Loading…</span>
                  <span v-else-if="currentFilename === model.filename">Active</span>
                  <span v-else>
                    <span class="material-symbols-outlined">play_arrow</span>
                    Load
                  </span>
                </button>
                <button
                  v-if="availability[model.filename] && currentFilename !== model.filename"
                  class="button is-light is-small"
                  @click="onDelete(model)"
                  title="Delete the downloaded weights"
                >
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
            <div v-if="visibleModels.length === 0" class="empty-state">
              No models match the current search.
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { listAllLLMs } from "../skills/flagship.js";
import { modelStore } from "../stores/modelStore.js";
import { modelPicker } from "../services/modelPicker.service.js";
import {
  computeMemoryRequirements,
  computeFitTier,
  effectiveVramBytes,
} from "../services/modelFit.service.js";

// ─── Hardware profile + fit tier — shared with GenerativeText.vue ───
const sysInfo = ref(null);
const effectiveVram = computed(() => effectiveVramBytes(sysInfo.value));

const fetchSysInfo = async () => {
  try {
    sysInfo.value = await window.electronAPI?.systemInformation?.();
  } catch {}
};

const search = ref("");
const availability = ref({});
const downloading = ref({});
const loading = ref({});
const currentFilename = computed(() => modelStore.state.current?.filename || null);

// Memory + fit-tier logic now lives in modelFit.service.js — single
// source of truth shared with GenerativeText.vue's inline picker.

const allModels = computed(() => {
  const entries = listAllLLMs().map((e) => ({
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
  }));
  // Fit-rank: tier ASC, parameters DESC, name ASC.
  return entries.map((m) => {
    const mem = computeMemoryRequirements(m);
    const fit = computeFitTier(mem, sysInfo.value);
    return { ...m, fitTier: fit.tier, fitLabel: fit.label, fitReason: fit.reason };
  }).sort((a, b) => {
    if (a.fitTier !== b.fitTier) return a.fitTier - b.fitTier;
    if ((b.parameters || 0) !== (a.parameters || 0)) return (b.parameters || 0) - (a.parameters || 0);
    return a.modelname.localeCompare(b.modelname);
  });
});

const visibleModels = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return allModels.value;
  return allModels.value.filter((m) =>
    m.modelname.toLowerCase().includes(q) || m.filename.toLowerCase().includes(q),
  );
});

const formatGB = (bytes) => `${((bytes || 0) / 1e9).toFixed(1)} GB`;
const formatVram = (model) => `${computeMemoryRequirements(model).vramGB} GB`;
const activeBn = (model) =>
  ((model.activeParameters || model.parameters || 0) / 1e9).toFixed(1);

// ─── Availability & actions ────────────────────────────────────────
async function refreshAvailability() {
  const out = {};
  for (const m of allModels.value) {
    try {
      out[m.filename] = await window.electronAPI?.checkModel?.(m.filename);
    } catch {
      out[m.filename] = false;
    }
  }
  availability.value = out;
}

let _unsubProgress = null;

async function onDownload(model) {
  if (!window.electronAPI?.downloadModel) return;
  downloading.value[model.filename] = 0;
  const ok = await window.electronAPI.downloadModel(model.url, model.filename);
  delete downloading.value[model.filename];
  if (ok) availability.value[model.filename] = true;
}

async function onLoad(model) {
  if (!window.electronAPI?.loadModel) return;
  loading.value[model.filename] = true;
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
    loading.value[model.filename] = false;
  }
}

async function onDelete(model) {
  if (!window.electronAPI?.deleteModel) return;
  if (!confirm(`Delete the local copy of ${model.modelname}?`)) return;
  await window.electronAPI.deleteModel(model.filename);
  availability.value[model.filename] = false;
}

function close() {
  modelPicker.hide();
}

function onKey(e) {
  if (!modelPicker.state.open) return;
  if (e.key === "Escape") close();
}

// ─── Lifecycle ─────────────────────────────────────────────────────
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
  // Track per-file download progress events. Single listener; we
  // demux to the right `downloading[filename]` slot.
  _unsubProgress = window.electronAPI?.onDownloadProgress?.((_event, data) => {
    if (data?.filename && downloading.value[data.filename] !== undefined) {
      downloading.value[data.filename] = Math.round((data.percent || 0) * 100);
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  if (_unsubProgress) { try { _unsubProgress(); } catch {} _unsubProgress = null; }
});
</script>

<style scoped>
.llm-picker-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 10, 16, 0.85);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 24px;
}

.llm-picker-shell {
  flex: 1;
  background: var(--bonzai-bg, #11141d);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.llm-picker-header {
  padding: 18px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  justify-content: space-between;
}

.llm-picker-header h2 {
  margin: 0;
  font-size: 1.4rem;
  color: var(--bonzai-text, #f4f4f4);
  display: flex;
  align-items: center;
}

.llm-picker-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 280px;
  justify-content: flex-end;
}

.hw-summary {
  font-size: 0.78rem;
  color: rgba(244, 244, 244, 0.65);
  white-space: nowrap;
}

.search-input {
  min-width: 220px;
  max-width: 340px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--bonzai-text, #f4f4f4);
  height: 36px;
}

.close-btn {
  background: transparent;
  color: rgba(244, 244, 244, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.llm-picker-body {
  flex: 1;
  overflow: auto;
  padding: 16px 24px 24px;
}

.tier-legend {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  font-size: 0.72rem;
}

.model-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.model-row {
  display: grid;
  grid-template-columns: minmax(280px, 2fr) minmax(220px, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}

.model-row:hover { background: rgba(255, 255, 255, 0.05); }
.model-row--current { border-color: rgba(80, 180, 255, 0.45); background: rgba(80, 180, 255, 0.08); }
.model-row--available .model-icon { color: rgba(120, 220, 130, 0.85); }
.model-row--tier3 { opacity: 0.55; }

.model-name {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--bonzai-text, #f4f4f4);
}

.model-icon { color: rgba(244, 244, 244, 0.4); font-size: 22px !important; }

.active-pill {
  background: rgba(80, 180, 255, 0.18);
  border: 1px solid rgba(80, 180, 255, 0.4);
  color: rgba(150, 200, 255, 0.9);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.model-stats {
  display: flex;
  gap: 12px;
  font-size: 0.78rem;
  color: rgba(244, 244, 244, 0.7);
}

.model-stats .stat { white-space: nowrap; }
.model-stats .moe { color: rgba(255, 200, 120, 0.85); }

.model-actions {
  display: flex;
  gap: 6px;
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: rgba(244, 244, 244, 0.5);
}

.fit-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid currentColor;
}
.fit-badge--tier0 { color: #1f8b4c; background: rgba(31, 139, 76, 0.14); }
.fit-badge--tier1 { color: #c9a227; background: rgba(201, 162, 39, 0.14); }
.fit-badge--tier2 { color: #cf6a1e; background: rgba(207, 106, 30, 0.14); }
.fit-badge--tier3 { color: #b13a3a; background: rgba(177, 58, 58, 0.14); }
</style>
