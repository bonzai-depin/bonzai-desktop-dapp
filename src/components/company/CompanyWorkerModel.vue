<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { listAllLLMs } from '../../skills/flagship.js';
import { canonicalWorkerModelKey, rankWorkerModels, prepareWorkerModel, workerModelFiles } from '../../services/company/workerModels.js';
import { formatModelLabel } from '../../services/company/presentation.js';
import { operationText, operationError } from '../../i18n/operations.js';
import { i18n } from '../../i18n/index.js';
import { useModalAccessibility } from '../../composables/useModalAccessibility.js';
import BzCloseButton from '../BzCloseButton.vue';
import './company-design.css';

const props = defineProps({ modelValue: { default: null }, roleKey: { type: String, required: true }, roleLabel: String, workerId: String, save: Function, disabled: Boolean });
const emit = defineEmits(['update:modelValue', 'saved']);
const ui = text => operationText(text, i18n.state.locale);
const catalog = listAllLLMs();
const open = ref(false), dialog = ref(null), loading = ref(false), busy = ref(false), persisting = ref(false), error = ref(''), advanced = ref(false), query = ref('');
const hardware = ref(null), availability = ref({}), selectedKey = ref(null), progress = ref(0), activeFile = ref(null);
const ranking = computed(() => rankWorkerModels({ models: catalog, role: props.roleKey, hardware: hardware.value, availability: availability.value }));
const current = computed(() => catalog.find(m => m.key === canonicalWorkerModelKey(props.modelValue)));
const selected = computed(() => ranking.value.models.find(m => m.key === selectedKey.value));
const alternatives = computed(() => ranking.value.models.filter(m => `${m.name} ${m.filename}`.toLowerCase().includes(query.value.toLowerCase())).slice(0, 80));
const label = model => model?.name || '';
const fitLabel = model => ui(!ranking.value.knownHardware ? 'Memory check unavailable' : model.cpuOnly && model.fit.tier === 0 ? 'Fits in memory · runs on CPU' : ['Fits this device', 'Limited memory headroom', 'Uses slower CPU offload', 'Too large for this device'][model.fit.tier]);
const canApply = computed(() => !loading.value && !busy.value && selected.value && selected.value.checked && selected.value.fit.tier < 3);
let controller, unsubscribe, disposed = false, request = 0;
useModalAccessibility(dialog, { onClose: close });

async function show() {
  if (props.disabled) return;
  open.value = true; loading.value = true; error.value = ''; advanced.value = false; query.value = ''; selectedKey.value = null;
  hardware.value = null; availability.value = {};
  const id = ++request;
  try {
    const api = window.electronAPI;
    const info = await Promise.resolve().then(() => api?.systemInformation?.()).catch(() => null);
    const files = [...new Set(catalog.flatMap(m => workerModelFiles(m).map(f => f.filename)))];
    if (!api?.checkModel) throw new Error('Model availability could not be checked.');
    const checked = {};
    // Keep IPC batches small; opening a picker must not flood the running teams.
    for (let offset=0; offset<files.length; offset+=8) {
      if (disposed || id !== request) return;
      await Promise.all(files.slice(offset,offset+8).map(async name => { checked[name] = Boolean(await api.checkModel(name)); }));
    }
    if (disposed || id !== request) return;
    hardware.value = info; availability.value = checked;
    selectedKey.value = ranking.value.recommended?.key || current.value?.key || null;
    advanced.value = !ranking.value.recommended;
  } catch(e) { if (id === request) error.value = operationError(e,i18n.state.locale); }
  finally { if (id === request) loading.value = false; }
}
async function close() {
  if (persisting.value) return;
  ++request; controller?.abort();
  if (activeFile.value) await Promise.resolve().then(() => window.electronAPI?.cancelModelDownload?.(activeFile.value)).catch(() => {});
  open.value = false;
}
async function apply() {
  if (!canApply.value) return;
  busy.value = true; error.value = ''; progress.value = 0;
  controller = new AbortController();
  unsubscribe = window.electronAPI?.onDownloadProgress?.((_event,data) => {
    if (data.filename === activeFile.value) progress.value = Math.max(0,Math.min(100,Math.round((data.percent || 0)*100)));
  });
  try {
    const key = await prepareWorkerModel(selected.value, window.electronAPI, { signal: controller.signal, onFile: file => { activeFile.value = file.downloadId || file.filename; progress.value = 0; } });
    activeFile.value = null;
    controller.signal.throwIfAborted();
    availability.value = { ...availability.value, ...Object.fromEntries(selected.value.files.map(file => [file.filename, true])) };
    persisting.value = true;
    if (props.save) await props.save(key);
    if (!disposed) { emit('update:modelValue',key); emit('saved',key); open.value = false; }
  } catch(e) { if (open.value && !controller.signal.aborted) error.value = operationError(e,i18n.state.locale); }
  finally { unsubscribe?.(); unsubscribe = null; activeFile.value = null; busy.value = false; persisting.value = false; }
}
watch(() => props.roleKey, () => { if (open.value) void close(); });
watch(() => props.workerId, () => { if (open.value) void close(); });
onBeforeUnmount(() => { disposed=true; ++request; controller?.abort(); unsubscribe?.(); });
</script>

<template>
  <button type="button" class="worker-model-control" :disabled="disabled" :aria-label="`${ui('AI model')} · ${roleLabel || roleKey}`" @click="show" data-i18n-skip>
    <span class="material-symbols-outlined" aria-hidden="true">memory</span>
    <span><small>{{ ui('AI model') }}</small><strong>{{ current ? label(current) : modelValue ? formatModelLabel(modelValue) : ui('Choose for this role') }}</strong></span>
    <span class="material-symbols-outlined worker-model-control__arrow" aria-hidden="true">chevron_right</span>
  </button>
  <Teleport to="body">
    <div v-if="open" class="worker-model-overlay company-screen" data-i18n-skip @click.self="!busy && close()">
      <section ref="dialog" class="worker-model-dialog" role="dialog" aria-modal="true" :aria-label="`${ui('AI model')} · ${roleLabel || roleKey}`" :aria-busy="busy || loading">
        <header><span class="worker-model-symbol material-symbols-outlined" aria-hidden="true">memory</span><div><small>{{ roleLabel || roleKey }}</small><h2>{{ ui('AI model') }}</h2></div><BzCloseButton :disabled="persisting" :aria-label="ui('Close')" @click="close" /></header>
        <div class="worker-model-body">
          <p v-if="loading" role="status">{{ ui('Checking this device and installed models…') }}</p>
          <template v-else>
            <p class="worker-model-purpose">{{ ui(ranking.profile.reason) }}</p>
            <p v-if="current" class="worker-model-current">{{ ui('Current model') }} · {{ label(current) }}</p>
            <button v-if="ranking.recommended" type="button" class="worker-model-recommendation" :aria-pressed="selectedKey === ranking.recommended.key" :disabled="busy" @click="selectedKey = ranking.recommended.key">
              <span class="worker-model-recommendation__title"><span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>{{ ui('Suggested starting point') }}<span v-if="selectedKey === ranking.recommended.key" class="material-symbols-outlined" aria-hidden="true">check_circle</span></span>
              <strong>{{ label(ranking.recommended) }}</strong>
              <span class="worker-model-facts"><span>{{ fitLabel(ranking.recommended) }}</span><span>{{ ui(ranking.recommended.ready ? 'Downloaded' : 'Download required') }} · {{ ranking.recommended.size }}</span></span>
            </button>
            <p v-else-if="ranking.profile.id !== 'unknown'" class="worker-model-note">{{ ui(ranking.knownHardware ? 'No recommended model fits comfortably. Choose a smaller model or review device memory.' : 'Device memory is unavailable. You can choose a model manually.') }}</p>
            <p v-if="selected" class="worker-model-note">{{ ui('Not yet benchmarked in BonzAI.') }}</p>
            <details v-if="selected" class="worker-model-evidence">
              <summary>{{ ui('Selection evidence') }}</summary>
              <p>{{ ui('Role requirements') }}</p>
              <ul><li v-for="requirement in ranking.profile.requirements" :key="requirement">{{ ui(requirement) }}</li></ul>
              <p>{{ ui(selected.evidence.caveat) }}</p>
              <p v-if="selected.evidence.sources.length">{{ ui('Publisher sources') }}</p>
              <ul v-if="selected.evidence.sources.length"><li v-for="source in selected.evidence.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} <span aria-hidden="true">↗</span></a></li></ul>
              <p>{{ ui('Language, task accuracy and speed must be checked with the actual model and device.') }}</p>
            </details>
            <details class="worker-model-manual" :open="advanced" @toggle="advanced = $event.target.open">
              <summary>{{ ui('Choose a different model') }}</summary>
              <label class="worker-model-search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="query" :placeholder="ui('Search models')" :aria-label="ui('Search models')" :disabled="busy" /></label>
              <div class="worker-model-options" role="group" :aria-label="ui('Available models')">
                <button v-for="model in alternatives" :key="model.key" type="button" :aria-pressed="selectedKey === model.key" :disabled="busy || model.fit.tier === 3" @click="selectedKey = model.key">
                  <span><strong>{{ label(model) }}</strong><small>{{ fitLabel(model) }} · {{ model.size }} · {{ ui(model.ready ? 'Downloaded' : 'Download required') }}</small></span><span v-if="selectedKey === model.key" class="material-symbols-outlined" aria-hidden="true">check_circle</span>
                </button>
                <p v-if="!alternatives.length">{{ ui('No matching models') }}</p>
              </div>
            </details>
            <p v-if="selected && selected.key !== ranking.recommended?.key" class="worker-model-current">{{ ui('Selected model') }} · {{ label(selected) }}<br />{{ fitLabel(selected) }}</p>
            <p class="worker-model-note">{{ ui('Used for new work. Running tasks keep their model. Media tools use their own models.') }}</p>
            <p v-if="selected && !selected.ready" class="worker-model-note">{{ ui('Downloads from Hugging Face. Your company data stays on this device.') }}</p>
          </template>
          <div v-if="busy && activeFile" class="worker-model-progress" role="status"><span>{{ ui('Downloading…') }} {{ progress }}%</span><progress :value="progress" max="100" :aria-label="ui('Download progress')" /></div>
          <p v-if="error" class="worker-model-error" role="alert">{{ error }}<button v-if="!busy" class="bz-btn bz-btn--ghost" @click="show">{{ ui('Retry') }}</button></p>
        </div>
        <footer><button class="bz-btn bz-btn--ghost" :disabled="persisting" @click="close">{{ ui('Cancel') }}</button><button class="bz-btn bz-btn--primary" :disabled="!canApply" @click="apply">{{ ui(busy ? activeFile ? 'Downloading…' : 'Saving…' : selected?.ready ? 'Use this model' : 'Download and use') }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.worker-model-control{display:flex;align-items:center;gap:10px;width:100%;min-width:0;text-align:left;padding:12px;border:1px solid var(--bz-border);border-radius:var(--bz-r);background:var(--bz-canvas);color:var(--bz-fg);cursor:pointer;transition:border-color .15s}
.worker-model-control:hover,.worker-model-control:focus-visible{border-color:var(--bz-accent);outline:none}
.worker-model-control>span:nth-child(2){min-width:0;flex:1}.worker-model-control small,.worker-model-control strong{display:block;overflow-wrap:anywhere}.worker-model-control small{font-size:12px;color:var(--bz-fg-mid)}.worker-model-control strong{font:500 14px/1.5 var(--bz-font-body)}.worker-model-control__arrow{font-size:18px;color:var(--bz-fg-mid)}
.worker-model-overlay{position:fixed;inset:0;z-index:250;display:grid;place-items:center;padding:24px;background:rgb(0 0 0 / .55);backdrop-filter:blur(8px)}
.worker-model-dialog{width:min(100%,640px);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;background:var(--bz-panel);border:1px solid var(--bz-border-strong);border-radius:var(--bz-r-lg);overflow:hidden;color:var(--bz-fg)}
.worker-model-dialog header{display:flex;align-items:center;gap:14px;padding:24px;border-bottom:1px solid var(--bz-border)}.worker-model-dialog header>div{flex:1;min-width:0}.worker-model-dialog h2{font:italic 900 28px/1.2 var(--bz-font-metric);margin:4px 0 0}.worker-model-dialog header small{color:var(--bz-fg-mid)}
.worker-model-symbol{display:grid;place-items:center;width:44px;height:44px;background:var(--bz-accent-soft);color:var(--bz-accent);border-radius:var(--bz-r)}
.worker-model-body{padding:24px;overflow:auto;min-height:0;display:grid;gap:18px}.worker-model-body p{margin:0;line-height:1.55}.worker-model-current,.worker-model-note{color:var(--bz-fg-mid);font-size:13px}
.worker-model-recommendation{display:grid;gap:12px;width:100%;text-align:left;border:1px solid var(--bz-border);border-radius:var(--bz-r);padding:20px;background:var(--bz-canvas);color:var(--bz-fg);cursor:pointer}.worker-model-recommendation[aria-pressed=true]{border-color:var(--bz-accent);background:var(--bz-accent-soft)}.worker-model-recommendation>strong{font:600 20px/1.4 var(--bz-font-body);overflow-wrap:anywhere}.worker-model-recommendation__title{display:flex;align-items:center;gap:8px;color:var(--bz-fg-mid);font-size:13px}.worker-model-recommendation__title>span:last-child:not(:first-child){margin-left:auto;color:var(--bz-accent)}.worker-model-facts{display:flex;gap:8px 20px;flex-wrap:wrap;font-size:13px;color:var(--bz-fg-mid)}
.worker-model-body summary{cursor:pointer;padding:4px 0;font-size:14px}.worker-model-search{display:flex;align-items:center;gap:10px;margin:16px 0 8px}.worker-model-search input{width:100%;min-width:0}.worker-model-options{max-height:260px;overflow:auto;display:grid;gap:6px}.worker-model-options button{display:flex;align-items:center;gap:12px;text-align:left;padding:12px;background:var(--bz-canvas);color:var(--bz-fg);border:1px solid var(--bz-border);border-radius:var(--bz-r);cursor:pointer}.worker-model-options button[aria-pressed=true]{border-color:var(--bz-accent)}.worker-model-options button:disabled{opacity:.55;cursor:not-allowed}.worker-model-options button>span:first-child{flex:1;min-width:0}.worker-model-options strong,.worker-model-options small{display:block;overflow-wrap:anywhere}.worker-model-options strong{font-size:14px;font-weight:500}.worker-model-options small{font-size:12px;color:var(--bz-fg-mid);margin-top:4px}
.worker-model-dialog footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;padding:20px 24px;border-top:1px solid var(--bz-border)}.worker-model-error{color:var(--bz-danger)}.worker-model-error button{margin:8px}.worker-model-progress{display:grid;gap:8px}.worker-model-progress progress{width:100%;accent-color:var(--bz-accent)}
.worker-model-evidence{font-size:13px;line-height:1.55;color:var(--bz-fg-mid)}.worker-model-evidence p{margin-top:12px}.worker-model-evidence ul{padding-inline-start:20px;margin:8px 0}.worker-model-evidence li{margin:4px 0}.worker-model-evidence a{color:var(--bz-fg);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.worker-model-evidence a:focus-visible{outline:1px solid var(--bz-accent);outline-offset:3px}
@media(max-width:600px){.worker-model-overlay{padding:12px}.worker-model-dialog{max-height:calc(100dvh - 24px)}.worker-model-dialog header,.worker-model-body{padding:18px}.worker-model-recommendation{padding:16px}.worker-model-dialog footer{padding:16px 18px}}
@media(prefers-reduced-motion:reduce){.worker-model-control{transition:none}}
</style>
