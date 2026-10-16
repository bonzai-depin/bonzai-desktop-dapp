<template>
  <div class="bz-license" data-i18n-skip>
    <header class="bz-license__hero">
      <div>
        <p class="bz-eyebrow">{{ $t('nav.help') }}</p>
        <h1 class="bz-h1 bz-license__title"><span class="material-symbols-outlined bz-title-icon" aria-hidden="true">verified_user</span> {{ $t('views.licenses.title') }}</h1>
        <p class="bz-license__copy">{{ $t('rcLicenses.intro') }}</p>
      </div>
      <span class="bz-license__count" role="status">{{ $t('rcLicenses.count', { visible: filteredRows.length, total: rows.length }) }}</span>
    </header>

    <section class="bz-license__toolbar" :aria-label="$t('rcLicenses.filters')">
      <label class="bz-license__field bz-license__search">
        <span>{{ $t('rcLicenses.search') }}</span>
        <input v-model="search" type="search" class="bz-field-input" :placeholder="$t('rcLicenses.searchHint')" />
      </label>
      <label class="bz-license__field">
        <span>{{ $t('rcLicenses.modality') }}</span>
        <select v-model="activeModality">
          <option value="all">{{ $t('rcLicenses.all') }}</option>
          <option v-for="modality in modalities" :key="modality" :value="modality">{{ modalityLabel(modality) }}</option>
        </select>
      </label>
      <label class="bz-license__field">
        <span>{{ $t('rcLicenses.installation') }}</span>
        <select v-model="activeInstallation">
          <option value="all">{{ $t('rcLicenses.all') }}</option>
          <option value="installed">{{ $t('rcLicenses.installed') }}</option>
          <option value="missing">{{ $t('rcLicenses.missing') }}</option>
          <option value="unknown">{{ $t('rcLicenses.unknown') }}</option>
        </select>
      </label>
      <label class="bz-license__field">
        <span>{{ $t('rcLicenses.license') }}</span>
        <select v-model="activeLicense">
          <option value="all">{{ $t('rcLicenses.all') }}</option>
          <option v-for="license in licenseFilters" :key="license" :value="license">{{ licenseLabel(license) }}</option>
        </select>
      </label>
      <label class="bz-license__field">
        <span>{{ $t('rcLicenses.sort') }}</span>
        <select v-model="sortMode">
          <option value="name">{{ $t('rcLicenses.model') }}</option>
          <option value="license">{{ $t('rcLicenses.license') }}</option>
          <option value="modality">{{ $t('rcLicenses.modality') }}</option>
        </select>
      </label>
    </section>
    <div class="bz-license__actions">
      <button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="checkingInstalled" @click="checkInstalled">
        {{ checkingInstalled ? $t('rcLicenses.checking') : $t('rcLicenses.refreshInstalled') }}
      </button>
      <button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="refreshingMetadata || !unverifiedRepos.length" @click="refreshMetadata">
        {{ refreshingMetadata ? $t('rcLicenses.refreshing') : $t('rcLicenses.refreshMetadata') }}
      </button>
      <button v-if="hasFilters" type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="clearFilters">{{ $t('rcLicenses.clearFilters') }}</button>
    </div>
    <p class="bz-license__notice" role="status">{{ metadataMessage || $t('rcLicenses.metadataHint') }}</p>
    <p v-if="installationUnavailable" class="bz-license__notice">{{ $t('rcLicenses.installationHint') }}</p>

    <section class="bz-license__table" :aria-label="$t('views.licenses.title')" :aria-busy="checkingInstalled">
      <div class="bz-license__row bz-license__row--head" aria-hidden="true">
        <span>{{ $t('rcLicenses.model') }}</span>
        <span>{{ $t('rcLicenses.modality') }}</span>
        <span>{{ $t('rcLicenses.license') }}</span>
        <span>{{ $t('rcLicenses.installation') }}</span>
        <span>{{ $t('rcLicenses.details') }}</span>
      </div>
      <template v-for="row in filteredRows" :key="row.id">
        <article class="bz-license__row" :class="{ 'is-open': expandedId === row.id }">
          <div class="bz-license__model">
            <strong>{{ row.name }}</strong>
            <span>{{ row.description }}</span>
          </div>
          <span class="bz-license__type">{{ row.modalities.map(modalityLabel).join(' · ') }}</span>
          <div class="bz-license__license">
            <span class="bz-license__badge">{{ licenseLabel(row.licenseType) }}</span>
          </div>
          <span class="bz-license__type">{{ installationLabel(row.installed) }}</span>
          <button class="bz-license__view" type="button" :aria-expanded="expandedId === row.id" :aria-controls="detailId(row)" :aria-label="$t('rcLicenses.detailsFor', { name: row.name })" @click="expandedId = expandedId === row.id ? '' : row.id">
            {{ expandedId === row.id ? $t('common.close') : $t('rcLicenses.view') }}
            <span class="material-symbols-outlined" aria-hidden="true">{{ expandedId === row.id ? 'expand_less' : 'expand_more' }}</span>
          </button>
        </article>
        <section v-if="expandedId === row.id" :id="detailId(row)" class="bz-license__detail" :aria-label="$t('rcLicenses.detailsFor', { name: row.name })">
          <div>
            <p class="bz-license__detail-title">{{ $t('rcLicenses.declaredTerms') }}</p>
            <p>{{ row.imported ? $t('rcLicenses.importedHint') : $t('rcLicenses.termsHint') }}</p>
            <ul v-if="row.sources.length" class="bz-license__sources">
              <li v-for="source in row.sources" :key="source.url">
                <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.label }}<span class="material-symbols-outlined" aria-hidden="true">open_in_new</span></a>
              </li>
            </ul>
          </div>
          <dl>
            <div><dt>{{ $t('rcLicenses.commercial') }}</dt><dd>{{ $t('rcLicenses.checkPermissions') }}</dd></div>
            <div><dt>{{ $t('rcLicenses.redistribution') }}</dt><dd>{{ $t('rcLicenses.checkRedistribution') }}</dd></div>
            <div><dt>{{ $t('rcLicenses.derivatives') }}</dt><dd>{{ $t('rcLicenses.checkDerivatives') }}</dd></div>
            <div><dt>{{ $t('rcLicenses.attribution') }}</dt><dd>{{ $t('rcLicenses.checkNotices') }}</dd></div>
          </dl>
        </section>
      </template>
      <div v-if="!filteredRows.length" class="bz-license__empty">
        <strong>{{ checkingInstalled ? $t('rcLicenses.checking') : $t('rcLicenses.noMatches') }}</strong>
        <p>{{ $t('rcLicenses.noMatchesHint') }}</p>
        <button v-if="hasFilters" type="button" class="bz-btn bz-btn--ghost bz-btn--sm" @click="clearFilters">{{ $t('rcLicenses.clearFilters') }}</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { listAllLLMs, MODEL_REQUIREMENTS } from '../skills/flagship.js';
import { useI18n } from '../i18n/index.js';

const { t } = useI18n();
const search = ref('');
const activeLicense = ref('all');
const activeModality = ref('all');
const activeInstallation = ref('all');
const sortMode = ref('name');
const expandedId = ref('');
const customRows = ref([]);
const fetchedLicenses = ref({});
const availability = ref({});
const checkingInstalled = ref(false);
const refreshingMetadata = ref(false);
const metadataResult = ref(null);
const controllers = new Set();
let disposed = false;

const normalizeLicense = value => {
  const raw = (Array.isArray(value) ? value.filter(v => typeof v === 'string').join(' / ') : typeof value === 'string' ? value : '').trim();
  const lower = raw.toLowerCase();
  if (!raw || ['license metadata pending', 'unknown', 'fetching', 'other'].includes(lower)) return 'unverified';
  if (['apache-2.0', 'apache 2.0'].includes(lower)) return 'Apache-2.0';
  if (lower === 'mit') return 'MIT';
  // Preserve exact custom license names: similar names do not imply equal terms.
  return raw;
};
const repoKeys = repo => (Array.isArray(repo) ? repo : [repo]).filter(value => typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value));
const safeUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
};
const basename = value => String(value || '').replaceAll('\\', '/').split('/').pop().toLowerCase();
const modalityFor = model => model.type === 'llm' ? ['text', ...(model.isMultimodal ? ['vision'] : [])] : [({ diffusion: 'image', ocr: 'vision' })[model.type] || model.type || 'other'];
const catalog = [
  ...listAllLLMs(),
  ...Object.entries(MODEL_REQUIREMENTS).filter(([, model]) => model.type !== 'llm').map(([key, model]) => ({ ...model, key })),
];
const descriptorId = model => model.filename ? 'file:' + basename(model.filename) : 'pipeline:' + (model.pipeline || model.key);
const installedFor = models => {
  const values = models.map(model => availability.value[descriptorId(model)]);
  return values.some(value => value === true) ? true : values.every(value => value === false) ? false : null;
};
const licenseLabel = license => license === 'unverified' ? t('rcLicenses.unverified') : license === 'imported' ? t('rcLicenses.imported') : license;
const modalityLabel = modality => t('rcLicenses.modalities.' + modality);
const installationLabel = value => t('rcLicenses.' + (value === true ? 'installed' : value === false ? 'missing' : 'unknown'));
const detailId = row => 'license-detail-' + encodeURIComponent(row.id);

const rows = computed(() => {
  const groups = new Map();
  for (const model of catalog) {
    const declared = normalizeLicense(model.license);
    const identity = model.baseKey ? 'base:' + model.baseKey : 'repo:' + (repoKeys(model.repo).map(repo => repo.toLowerCase()).sort().join('|') || model.key);
    // Different declared terms stay separate even when weights share a repository.
    const key = identity + ':' + declared;
    if (!groups.has(key)) groups.set(key, { id: key, models: [], name: model.name.replace(/\sQ[0-9A-Z_]+$/, ''), description: model.description || model.filename || '', modalities: [], imported: false });
    groups.get(key).models.push(model);
  }
  const output = [...groups.values()].map(row => {
    const licenses = new Set();
    const sources = new Map();
    for (const model of row.models) {
      const repos = repoKeys(model.repo);
      for (const repo of repos) {
        const fetched = fetchedLicenses.value[repo];
        licenses.add(normalizeLicense(fetched?.license || model.license));
        const url = safeUrl(fetched?.licenseUrl) || safeUrl(model.licenseUrl) || 'https://huggingface.co/' + repo;
        sources.set(url, { url, label: repo });
      }
      if (!repos.length) {
        licenses.add(normalizeLicense(model.license));
        const url = safeUrl(model.licenseUrl);
        if (url) sources.set(url, { url, label: model.name });
      }
    }
    return { ...row, licenseType: [...licenses].sort().join(' / '), modalities: [...new Set(row.models.flatMap(modalityFor))].sort(), sources: [...sources.values()], installed: installedFor(row.models) };
  });
  const knownFiles = new Set(catalog.map(model => basename(model.filename)).filter(Boolean));
  const importedFiles = new Set();
  for (const model of customRows.value) {
    const filename = basename(model.filename);
    if (!filename || knownFiles.has(filename) || importedFiles.has(filename)) continue;
    importedFiles.add(filename);
    output.push({ id: 'custom:' + filename, name: model.modelname || model.name || model.filename, description: model.filename, modalities: ['text'], licenseType: 'imported', sources: [], imported: true, installed: typeof model.available === 'boolean' ? model.available : null });
  }
  return output;
});
const modalities = computed(() => [...new Set(rows.value.flatMap(row => row.modalities))].sort());
const licenseFilters = computed(() => [...new Set(rows.value.map(row => row.licenseType))].sort());
const hasFilters = computed(() => Boolean(search.value || activeLicense.value !== 'all' || activeModality.value !== 'all' || activeInstallation.value !== 'all'));
const filteredRows = computed(() => {
  const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.value.filter(row => {
    const text = [row.name, row.description, licenseLabel(row.licenseType), ...row.modalities.map(modalityLabel), ...row.sources.map(source => source.label)].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term)) && (activeLicense.value === 'all' || row.licenseType === activeLicense.value)
      && (activeModality.value === 'all' || row.modalities.includes(activeModality.value))
      && (activeInstallation.value === 'all' || (activeInstallation.value === 'installed' ? row.installed === true : activeInstallation.value === 'missing' ? row.installed === false : row.installed === null));
  }).sort((a, b) => {
    const key = sortMode.value === 'license' ? 'licenseType' : sortMode.value === 'modality' ? 'modalities' : 'name';
    return String(a[key]).localeCompare(String(b[key])) || a.name.localeCompare(b.name);
  });
});
function clearFilters() { search.value = ''; activeLicense.value = activeModality.value = activeInstallation.value = 'all'; }
watch(licenseFilters, values => { if (activeLicense.value !== 'all' && !values.includes(activeLicense.value)) activeLicense.value = 'all'; });
watch(filteredRows, values => { if (!values.some(row => row.id === expandedId.value)) expandedId.value = ''; });

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  controllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error('Metadata unavailable');
    return await response.json();
  } finally { clearTimeout(timeout); controllers.delete(controller); }
}
async function boundedLocalRead(read) {
  let timeout;
  try { return await Promise.race([read(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Local check timed out')), 6000); })]); }
  finally { clearTimeout(timeout); }
}
const installationUnavailable = computed(() => !checkingInstalled.value && rows.value.some(row => row.installed === null));
async function checkInstalled() {
  if (checkingInstalled.value) return;
  checkingInstalled.value = true;
  try {
    try {
      const imported = window.electronAPI?.listCustomModels ? await boundedLocalRead(() => window.electronAPI.listCustomModels()) : [];
      if (!disposed) customRows.value = Array.isArray(imported) ? imported : [];
    } catch { /* Keep the last known imported catalog on a transient IPC failure. */ }
    const unique = new Map(catalog.map(model => [descriptorId(model), model]));
    const results = await Promise.all([...unique].map(async ([id, model]) => {
      try {
        if (model.filename) {
          const value = window.electronAPI?.checkModel ? await boundedLocalRead(() => window.electronAPI.checkModel(model.filename)) : null;
          return [id, typeof value === 'boolean' ? value : null];
        }
        if (!model.pipeline) return [id, null];
        const port = Number(window.BONZAI_SERVER_PORT) || 65000;
        const data = await fetchJson('http://127.0.0.1:' + port + '/pipelines/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipeline: model.pipeline }) });
        // Auto-download pipelines report ready with an empty plan. That is not
        // evidence that model weights are installed on the current device.
        const requirements = [...(data.plan?.repos_to_fetch || []), ...(data.plan?.single_files || [])];
        return [id, requirements.length && typeof data.ok === 'boolean' ? data.ok : null];
      } catch { return [id, null]; }
    }));
    if (!disposed) availability.value = Object.fromEntries(results);
  } finally { if (!disposed) checkingInstalled.value = false; }
}
const unverifiedRepos = computed(() => [...new Set(catalog.filter(model => normalizeLicense(model.license) === 'unverified').flatMap(model => repoKeys(model.repo)))].filter(repo => !fetchedLicenses.value[repo]));
const metadataMessage = computed(() => metadataResult.value === null ? '' : metadataResult.value ? t('rcLicenses.metadataPartial') : t('rcLicenses.metadataDone'));
async function refreshMetadata() {
  if (refreshingMetadata.value) return;
  refreshingMetadata.value = true;
  metadataResult.value = null;
  const queue = [...unverifiedRepos.value];
  let failures = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length && !disposed) {
        const repo = queue.shift();
        try {
          const data = await fetchJson('https://huggingface.co/api/models/' + repo);
          const card = data.cardData || {};
          const tag = Array.isArray(data.tags) ? data.tags.find(tag => typeof tag === 'string' && tag.startsWith('license:')) : '';
          const license = normalizeLicense(card.license_name || card.license || data.license || tag?.slice(8));
          if (license === 'unverified') { failures++; continue; }
          const rawLink = typeof card.license_link === 'string' ? card.license_link : '';
          const licenseUrl = safeUrl(rawLink) || (rawLink && !rawLink.includes(':') && !rawLink.startsWith('//') ? safeUrl('https://huggingface.co/' + repo + '/blob/main/' + rawLink.replace(/^\//, '')) : '') || 'https://huggingface.co/' + repo;
          if (!disposed) fetchedLicenses.value = { ...fetchedLicenses.value, [repo]: { license, licenseUrl } };
        } catch { failures++; }
      }
    }));
    if (!disposed) metadataResult.value = failures;
  } finally { if (!disposed) refreshingMetadata.value = false; }
}
onMounted(checkInstalled);
onUnmounted(() => { disposed = true; for (const controller of controllers) controller.abort(); });
</script>

<style scoped>
.bz-license { box-sizing: border-box; min-width: 0; height: 100%; overflow: auto; padding: var(--bz-space-6); color: var(--bz-fg); background: var(--bz-canvas); }
.bz-license__hero { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--bz-space-4); padding-bottom: var(--bz-space-5); border-bottom: 1px solid var(--bz-border); }
.bz-license__title { margin: 0; }
.bz-license__copy { max-width: 70ch; margin: var(--bz-space-2) 0 0; color: var(--bz-fg-mid); }
.bz-license__count { font-family: var(--bz-font-metric); font-size: 18px; flex-shrink: 0; color: var(--bz-fg-mid); font-variant-numeric: tabular-nums; }
.bz-license__toolbar { display: grid; grid-template-columns: minmax(200px, 2fr) repeat(4, minmax(110px, 1fr)); gap: var(--bz-space-3); margin: var(--bz-space-5) 0 var(--bz-space-3); }
.bz-license__field { display: grid; gap: var(--bz-space-1); min-width: 0; font-size: var(--bz-size-meta); color: var(--bz-fg-mid); }
.bz-license__field select { width: 100%; min-width: 0; min-height: 42px; padding: 0 var(--bz-space-2); border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-panel); color: var(--bz-fg); font: inherit; }
.bz-license__actions { display: flex; flex-wrap: wrap; gap: var(--bz-space-2); }
.bz-license__actions button { min-height: 36px; }
.bz-license__notice { margin: var(--bz-space-2) 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.bz-license__table { margin-top: var(--bz-space-4); border: 1px solid var(--bz-border); border-radius: var(--bz-r); background: var(--bz-card); overflow: hidden; }
.bz-license__row { display: grid; grid-template-columns: minmax(200px, 1.8fr) minmax(85px, .6fr) minmax(130px, 1fr) minmax(95px, .7fr) minmax(64px, auto); gap: var(--bz-space-3); align-items: center; padding: var(--bz-space-4); border-top: 1px solid var(--bz-border); }
.bz-license__row > * { min-width: 0; overflow-wrap: anywhere; }
.bz-license__row:first-child { border-top: 0; }
.bz-license__row.is-open, .bz-license__row--head { background: var(--bz-raised); }
.bz-license__row--head { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.bz-license__model { display: grid; gap: var(--bz-space-1); }
.bz-license__model strong { color: var(--bz-fg); font-size: var(--bz-size-body); }
.bz-license__model span, .bz-license__type { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: var(--bz-line-body); }
.bz-license__badge { display: inline-flex; align-items: center; min-height: 28px; padding: var(--bz-space-1) var(--bz-space-2); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-sm); background: var(--bz-panel); color: var(--bz-fg); font-family: var(--bz-font-mono); font-size: var(--bz-size-meta); line-height: var(--bz-line-tight); }
.bz-license__view { display: inline-flex; min-height: 36px; align-items: center; justify-content: flex-end; gap: var(--bz-space-1); padding: var(--bz-space-1); border: 0; background: transparent; color: var(--bz-fg-mid); font: inherit; font-size: var(--bz-size-meta); cursor: pointer; }
.bz-license__view:hover { color: var(--bz-fg); }
.bz-license__view .material-symbols-outlined { font-size: 18px; }
.bz-license__detail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--bz-space-5); padding: var(--bz-space-5); border-top: 1px solid var(--bz-border); background: var(--bz-canvas); font-size: var(--bz-size-meta); }
.bz-license__detail p { margin: 0 0 var(--bz-space-2); color: var(--bz-fg-mid); }
.bz-license__detail .bz-license__detail-title { color: var(--bz-fg); }
.bz-license__detail dl { display: grid; gap: var(--bz-space-3); margin: 0; }
.bz-license__detail dl div { display: grid; grid-template-columns: minmax(100px, .8fr) minmax(0, 1fr); gap: var(--bz-space-3); }
.bz-license__detail dt { color: var(--bz-fg-mid); }
.bz-license__detail dd { margin: 0; color: var(--bz-fg); }
.bz-license__sources { display: grid; gap: var(--bz-space-2); margin: var(--bz-space-3) 0 0; padding: 0; list-style: none; }
.bz-license__sources a { display: inline-flex; gap: var(--bz-space-1); align-items: center; min-height: 32px; color: var(--bz-fg); overflow-wrap: anywhere; text-decoration: underline; text-underline-offset: 3px; }
.bz-license__sources .material-symbols-outlined { font-size: 15px; }
.bz-license__empty { padding: var(--bz-space-6); text-align: center; }
.bz-license__empty p { color: var(--bz-fg-mid); }
@media (max-width: 1050px) {
  .bz-license__toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bz-license__search { grid-column: 1 / -1; }
  .bz-license__row { grid-template-columns: minmax(0, 1fr) auto; gap: var(--bz-space-2); }
  .bz-license__model { grid-column: 1 / -1; }
  .bz-license__row--head { display: none; }
  .bz-license__view { grid-column: 2; grid-row: 3 / span 2; }
  .bz-license__license { grid-column: 1; }
  .bz-license__detail { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .bz-license { padding: var(--bz-space-4); }
  .bz-license__hero { flex-direction: column; }
  .bz-license__detail { padding: var(--bz-space-4); }
  .bz-license__detail dl div { grid-template-columns: 1fr; gap: var(--bz-space-1); }
}
</style>
