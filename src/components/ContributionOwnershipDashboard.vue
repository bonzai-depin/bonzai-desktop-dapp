<template>
  <div class="ownership bz-economy">
    <div class="ownership__workspace bz-page-content">
      <header class="ownership__header bz-page-header">
        <div><p class="bz-eyebrow">Your part of BonzAI</p><h1 class="bz-h1"><span class="material-symbols-outlined bz-title-icon" aria-hidden="true">fingerprint</span> Ownership</h1></div>
        <div class="ownership__header-actions"><button class="bz-btn bz-btn--ghost" :aria-expanded="protocolGuideState.open" @click="protocolGuideState.open = !protocolGuideState.open">{{ protocolGuideState.open ? 'Back to Library' : 'Web3 Guide' }}</button><span class="ownership__network"><span class="material-symbols-outlined" aria-hidden="true">hub</span>{{ network.name }}</span><button class="bz-iconbtn" aria-label="Refresh ownership" :disabled="loading" @click="refreshDashboard"><span class="material-symbols-outlined" :class="{ rotating: loading }" aria-hidden="true">refresh</span></button></div>
      </header>

      <ProtocolGuide v-if="protocolGuideState.open" />
      <template v-else>
      <section class="ownership__overview" aria-label="Your asset overview">
        <div v-for="metric in metrics" :key="metric.label"><span>{{ metric.label }}</span><strong class="bz-metric">{{ loading && !assets.length ? '—' : number(metric.value) }}</strong><small>{{ metric.note }}</small></div>
      </section>

      <div class="ownership__layout">
        <main class="ownership__library" :aria-busy="loading">
          <div class="ownership__library-head"><div><p class="bz-eyebrow">Made by you</p><h2>Your library</h2></div><button class="bz-btn bz-btn--primary bz-btn--sm" @click="navigate(category === 'dataset' ? 'datasets' : 'image')"><span class="material-symbols-outlined" aria-hidden="true">add</span>{{ category === 'dataset' ? 'Create Dataset' : 'Create' }}</button></div>
          <div class="ownership__tabs" role="tablist" aria-label="Asset categories"><button v-for="item in categories" :id="`ownership-tab-${item.id}`" :key="item.id" role="tab" :aria-selected="category === item.id" aria-controls="ownership-results" :tabindex="category === item.id ? 0 : -1" @click="category = item.id" @keydown="tabKey($event, item.id)">{{ item.label }}<span class="bz-metric">{{ item.id === 'all' ? assets.length : assets.filter(asset => asset.kind === item.id).length }}</span></button></div>
          <div class="ownership__toolbar"><label class="ownership__search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="query" type="search" aria-label="Search your assets" placeholder="Search your work, tokens or contributors" /></label><select v-model="filter" aria-label="Filter publishing status"><option value="all">All statuses</option><option value="minted">Mint recorded</option><option value="training">Training-ready</option><option value="blocked">Restricted</option></select><select v-model="sort" aria-label="Sort assets"><option value="recent">Recent first</option><option value="name">Name A–Z</option></select></div>
          <div v-if="errors.length" class="ownership__notice" role="alert"><span class="material-symbols-outlined" aria-hidden="true">info</span><div><p v-for="error in errors" :key="error">{{ error }}</p><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="loading" @click="refreshDashboard">Retry</button></div></div>
          <section id="ownership-results" role="tabpanel" :aria-labelledby="`ownership-tab-${category}`" tabindex="0">
            <div v-if="loading && !assets.length" class="ownership__loading" role="status"><span class="material-symbols-outlined rotating" aria-hidden="true">progress_activity</span>Loading your library…</div>
            <div v-else-if="!filtered.length" class="ownership__empty">
              <div class="ownership__empty-art" aria-hidden="true"><span class="material-symbols-outlined">fingerprint</span></div>
              <h3>{{ assets.length ? 'No matching assets' : 'Your next creation starts here.' }}</h3>
              <p>{{ assets.length ? 'Try another name, category or publishing status.' : 'Minted creations, trained models and contribution packs come together in this library.' }}</p>
              <button v-if="assets.length" class="bz-btn bz-btn--ghost" @click="resetFilters">Reset filters</button>
              <div v-else class="ownership__empty-actions"><button class="bz-btn bz-btn--primary" @click="navigate('image')">Create something original</button><button class="bz-btn bz-btn--ghost" @click="navigate('tune')">Train a model</button></div>
            </div>
            <div v-else class="ownership__grid">
              <button v-for="asset in pageAssets" :key="asset.id" class="ownership__asset" :class="{ 'is-selected': selectedId === asset.id }" :aria-pressed="selectedId === asset.id" @click="selectAsset(asset)">
                <div class="ownership__preview" :class="`is-${asset.kind}`"><img v-if="asset.image && !failedImages.has(asset.id)" :src="asset.image" :alt="asset.title" @error="failedImages.add(asset.id)" /><template v-else><span class="material-symbols-outlined ownership__asset-glyph" aria-hidden="true">{{ icon(asset) }}</span><span class="ownership__preview-label">{{ asset.kind === 'dataset' ? 'Contribution pack' : asset.kind === 'model' ? 'Trained on your terms' : `${asset.type} creation` }}</span><strong v-if="asset.kind === 'dataset'" class="bz-metric">{{ number(asset.records) }}<small> records</small></strong></template><span class="ownership__type">{{ asset.kind === 'creation' ? asset.type : asset.kind }}</span></div>
                <div class="ownership__asset-body"><h3 :title="asset.title">{{ asset.title }}</h3><p>{{ asset.tokenId != null ? `Token #${asset.tokenId}` : asset.symbol ? `$${asset.symbol}` : date(asset.date) }}</p><div class="ownership__asset-foot"><span class="ownership__status" :class="{ 'is-restricted': asset.blocked }"><span aria-hidden="true"></span>{{ asset.blocked ? 'Restricted' : asset.status }}</span><span class="material-symbols-outlined" aria-hidden="true">arrow_outward</span></div></div>
              </button>
            </div>
            <div v-if="filtered.length > pageSize" class="ownership__pagination"><span>{{ page * pageSize + 1 }}–{{ Math.min((page + 1) * pageSize, filtered.length) }} of {{ filtered.length }}</span><div><button class="bz-iconbtn" aria-label="Previous assets" :disabled="page === 0" @click="page--"><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button><button class="bz-iconbtn" aria-label="Next assets" :disabled="(page + 1) * pageSize >= filtered.length" @click="page++"><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button></div></div>
          </section>
        </main>

        <aside ref="inspector" class="ownership__rail" aria-label="Ownership details">
          <section v-if="selected" class="ownership__inspector" aria-live="polite">
            <div class="ownership__section-head"><p class="bz-eyebrow">Asset details</p><button class="bz-iconbtn" aria-label="Close asset details" @click="selectedId = ''"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></div>
            <h2>{{ selected.title }}</h2><span class="ownership__detail-kind">{{ selected.kind }} · {{ selected.status }}</span>
            <dl class="ownership__facts"><div><dt>Record source</dt><dd>This device</dd></div><div v-if="selected.tokenId != null"><dt>Token ID</dt><dd class="bz-metric">#{{ selected.tokenId }}</dd></div><div v-if="selected.kind === 'creation'"><dt>Discovery</dt><dd>{{ selected.discoverable ? 'Enabled in public metadata' : 'Not listed; minted content is public' }}</dd></div><div v-if="selected.kind === 'creation'"><dt>Training use</dt><dd>{{ selected.training ? 'Eligible in record' : 'Not enabled' }}</dd></div><div v-if="selected.kind === 'model'"><dt>Base model</dt><dd>{{ selected.baseModel || 'Not recorded' }}</dd></div><div v-if="selected.kind === 'model'"><dt>Revenue route</dt><dd>{{ selected.route ? 'Registered in record' : 'Not configured' }}</dd></div><div v-if="selected.kind === 'dataset'"><dt>Royalty-bearing records</dt><dd class="bz-metric">{{ number(selected.royalties) }}</dd></div><div><dt>Contributors</dt><dd class="bz-metric">{{ number(selected.owners.length || selected.ownerCount || 0) }}</dd></div></dl>
            <p v-if="selected.detail" class="ownership__notice">{{ selected.detail }}</p>
            <div v-if="selected.owners.length" class="ownership__contributors"><p class="bz-eyebrow">Attribution</p><span v-for="owner in selected.owners" :key="owner" class="bz-mono" :title="owner">{{ short(owner) }}</span></div>
            <div class="ownership__detail-actions"><a v-if="selected.nft?.explorerUrl && safeOwnershipLink(selected.nft.explorerUrl)" class="bz-btn bz-btn--ghost" :href="safeOwnershipLink(selected.nft.explorerUrl)" target="_blank" rel="noopener noreferrer">View Mint Transaction ↗</a><a v-if="selected.nft?.metadataUrl && safeOwnershipLink(selected.nft.metadataUrl)" class="bz-btn bz-btn--ghost" :href="safeOwnershipLink(selected.nft.metadataUrl)" target="_blank" rel="noopener noreferrer">View Public Metadata ↗</a><a v-if="marketLink" class="bz-btn bz-btn--primary" :href="marketLink" target="_blank" rel="noopener noreferrer">View on marketplace<span class="material-symbols-outlined" aria-hidden="true">north_east</span></a><button class="bz-btn bz-btn--ghost" @click="navigate(selected.kind === 'creation' ? 'markets' : 'tune')">{{ selected.kind === 'creation' ? 'Explore token markets' : 'Open Tune' }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button></div>
          </section>
          <section v-else class="ownership__identity"><div class="ownership__identity-mark" aria-hidden="true"><span class="material-symbols-outlined">fingerprint</span></div><p class="bz-eyebrow">Creator identity</p><h2>{{ walletAddress ? 'Connected & creating.' : 'Start local. Own more.' }}</h2><p>{{ walletAddress ? 'Your library stays on this device. Use your wallet to inspect onchain records.' : 'Create and train freely. Connect a wallet when you’re ready for onchain ownership.' }}</p><div v-if="walletAddress" class="ownership__wallet bz-mono" :title="walletAddress">{{ short(walletAddress) }}</div><button v-else class="bz-btn bz-btn--primary" @click="connect">Connect<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button><div class="ownership__memory"><span class="material-symbols-outlined" aria-hidden="true">lock</span><span>Local provenance<strong>{{ memorySummary }}</strong></span></div></section>
          <section class="ownership__membership"><span class="material-symbols-outlined" aria-hidden="true">workspace_premium</span><p class="bz-eyebrow">Beyond your own creations</p><h2>Own a share of the activity.</h2><p>Stake BONZAI to join level-based rewards from protocol fees in USDC and social tokens.</p><div v-if="walletAddress && stakingConfigured" class="ownership__stake"><strong class="bz-metric">{{ number(stakingState.position?.amount || 0) }}</strong><span>BONZAI staked</span></div><button class="bz-btn bz-btn--ghost" @click="openRewards">Explore rewards<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button></section>
        </aside>
      </div>
      </template>
      <footer class="ownership__footer"><span class="material-symbols-outlined" aria-hidden="true">hard_drive</span><p>Library records are stored locally. Mint records and revenue routes shown here are not a live wallet balance or verification of current ownership.</p><span v-if="refreshedAt">Updated {{ time(refreshedAt) }}</span></footer>
    </div>
  </div>
</template>

<script setup>
import ProtocolGuide from './ProtocolGuide.vue'
import { protocolGuideState } from '../services/protocolNavigation.js'
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js'
import { allInferences, initializeStore } from '../stores/inferenceStore.js'
import { loadContributionLedger } from '../services/contribution.service.js'
import { memoryService } from '../services/memory.service.js'
import { bonzaiStakingService } from '../services/bonzaiStaking.service.js'
import { useBonzaiWeb3 } from '../composables/useBonzaiWeb3.js'
import { useI18n } from '../i18n/index.js'
import { ownershipAssets, filterOwnershipAssets, safeOwnershipLink } from '../services/ownershipAssets.js'
const i18n = useI18n(), network = CONFIG.networks[ECONOMY_NETWORK_KEY]
const API_BASE = import.meta.env.VITE_API_BASE || window.electronAPI?.env?.API_BASE || 'http://127.0.0.1:65000'
const { walletAddress, connect } = useBonzaiWeb3()
const models = ref([]), packs = ref([]), memory = ref(null), loading = ref(true), errors = ref([]), refreshedAt = ref(null)
const category = ref('all'), query = ref(''), filter = ref('all'), sort = ref('recent'), selectedId = ref(''), page = ref(0), inspector = ref(null), failedImages = ref(new Set())
const categories = [{ id: 'all', label: 'All assets' }, { id: 'creation', label: 'Creations' }, { id: 'model', label: 'Models' }, { id: 'dataset', label: 'Datasets' }]
const pageSize = 9, stakingState = bonzaiStakingService.state, stakingConfigured = bonzaiStakingService.isConfigured
let disposed = false, controller
const assets = computed(() => ownershipAssets(allInferences.value, models.value, packs.value))
const filtered = computed(() => filterOwnershipAssets(assets.value, { kind: category.value, query: query.value, state: filter.value, sort: sort.value }))
const pageAssets = computed(() => filtered.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
const selected = computed(() => assets.value.find(asset => asset.id === selectedId.value))
const marketLink = computed(() => safeOwnershipLink(selected.value?.nft?.marketplaceUrl))
const metrics = computed(() => [
  { label: 'Creations', value: assets.value.filter(asset => asset.kind === 'creation').length, note: 'With local mint records' },
  { label: 'Trained models', value: models.value.length, note: 'Your original intelligence' },
  { label: 'Contribution packs', value: packs.value.length, note: 'The data behind the work' },
  { label: 'Contributors', value: new Set(assets.value.flatMap(asset => asset.owners.map(owner => String(owner).toLowerCase()))).size, note: 'Wallets attributed in records' },
])
const memorySummary = computed(() => memory.value ? `${number(memory.value.rawSources?.length || 0)} sources · ${number(memory.value.atomicNotes?.length || 0)} notes` : 'Memory not loaded')
const number = value => i18n.number(Number(value) || 0, { maximumFractionDigits: 2 })
const short = value => String(value).length > 20 ? `${String(value).slice(0, 8)}…${String(value).slice(-6)}` : value
const date = value => value && Number.isFinite(new Date(value).getTime()) ? i18n.date(value, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Saved on this device'
const time = value => i18n.date(value, { hour: '2-digit', minute: '2-digit' })
const icon = asset => asset.kind === 'dataset' ? 'dataset' : asset.kind === 'model' ? 'neurology' : ({ image: 'image', video: 'movie', audio: 'headphones', object: 'deployed_code' }[asset.type] || 'article')
function navigate(mode) { window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: mode })) }
function openRewards() { window.dispatchEvent(new CustomEvent('bonzai:open-rewards')) }
function resetFilters() { category.value = 'all'; query.value = ''; filter.value = 'all' }
async function selectAsset(asset) { selectedId.value = asset.id; await nextTick(); if (window.innerWidth < 1050) inspector.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
function tabKey(event, id) { const index = categories.findIndex(item => item.id === id); const next = event.key === 'ArrowRight' ? (index + 1) % categories.length : event.key === 'ArrowLeft' ? (index + categories.length - 1) % categories.length : event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : null; if (next === null) return; event.preventDefault(); category.value = categories[next].id; nextTick(() => document.getElementById(`ownership-tab-${category.value}`)?.focus()) }
async function refreshDashboard() {
  controller?.abort(); const request = new AbortController(); controller = request
  loading.value = true; errors.value = []
  const timeout = promise => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 12000) })]).finally(() => clearTimeout(timer)) }
  const results = await Promise.allSettled([
    timeout(initializeStore()), Promise.resolve().then(() => loadContributionLedger()), timeout(memoryService.getUserMemory()),
    axios.get(`${API_BASE}/training/models`, { timeout: 10000, signal: request.signal }),
    walletAddress.value && stakingConfigured.value ? timeout(bonzaiStakingService.fetchPosition()) : Promise.resolve(),
  ])
  if (disposed || controller !== request) return
  const notices = []
  if (results[0].status === 'rejected') notices.push('Creation history could not be loaded. Previously loaded records remain visible.')
  if (results[1].status === 'fulfilled') packs.value = results[1].value || []; else notices.push('Contribution packs could not be loaded.')
  if (results[2].status === 'fulfilled') memory.value = results[2].value; else notices.push('Local memory is unavailable.')
  if (results[3].status === 'fulfilled') models.value = (results[3].value.data?.models || []).map(model => ({ ...model, ...model.economy })); else notices.push('Trained models are unavailable. Check the local server, then retry.')
  if (results[4].status === 'rejected') notices.push('The staking position could not be refreshed.')
  errors.value = notices; loading.value = false; refreshedAt.value = Date.now()
}
watch([category, query, filter, sort], () => { page.value = 0 })
watch(walletAddress, refreshDashboard)
onMounted(refreshDashboard)
onBeforeUnmount(() => { disposed = true; controller?.abort() })
</script>

<style scoped>
.ownership { height: 100%; min-height: 0; overflow: auto; background: var(--bz-canvas); color: var(--bz-fg); }
.ownership__workspace { max-width: 1800px; margin: 0 auto; padding: clamp(20px, 2.5vw, 32px); }
.ownership__header, .ownership__header-actions, .ownership__section-head, .ownership__library-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ownership__header { align-items: flex-start; }
.ownership p, .ownership h1, .ownership h2, .ownership h3 { margin: 0; color: inherit; }
.ownership .bz-eyebrow { color: var(--bz-fg-mid); margin-bottom: 7px; }
.ownership h2 { font-size: 24px; line-height: 1.2; font-family: var(--bz-font-metric); font-weight: 900; font-style: italic; }
.ownership__intro { color: var(--bz-fg-mid) !important; margin-top: 10px !important; max-width: 520px; }
.ownership__network { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--bz-fg-mid); white-space: nowrap; }
.ownership__overview { display: grid; grid-template-columns: repeat(4, 1fr); border-block: 1px solid var(--bz-border); margin: 32px 0; padding: 24px 0; gap: 24px; }
.ownership__overview > div { display: grid; gap: 5px; }
.ownership__overview > div + div { border-left: 1px solid var(--bz-border); padding-left: 24px; }
.ownership__overview span, .ownership__overview small { font-size: 12px; color: var(--bz-fg-mid); }
.ownership__overview strong { font-size: 38px; line-height: 1.2; }
.ownership__layout { display: grid; grid-template-columns: minmax(0, 1fr) 296px; gap: 32px; align-items: start; }
.ownership__library, .ownership__rail { min-width: 0; }
.ownership__tabs { display: flex; overflow-x: auto; gap: 24px; border-bottom: 1px solid var(--bz-border); margin-top: 24px; }
.ownership__tabs button { background: transparent; border: 0; border-bottom: 2px solid transparent; padding: 12px 0; color: var(--bz-fg-mid); white-space: nowrap; display: flex; align-items: center; gap: 8px; cursor: pointer; }
.ownership__tabs button[aria-selected="true"] { color: var(--bz-fg); border-bottom-color: var(--bz-purple-100); }
.ownership__tabs .bz-metric { background: var(--bz-panel); padding: 2px 6px; border-radius: 5px; font-size: 12px; }
.ownership__toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
.ownership__search { display: flex; flex: 1 1 220px; align-items: center; gap: 8px; border: 1px solid var(--bz-border); background: var(--bz-panel); border-radius: 8px; padding: 9px 12px; color: var(--bz-fg-mid); }
.ownership__search input { min-width: 0; width: 100%; border: 0; outline: 0; color: var(--bz-fg); background: transparent; font: inherit; font-size: 13px; }
.ownership__search:focus-within { outline: 2px solid var(--bz-purple-100); outline-offset: 2px; }
.ownership select { background: var(--bz-panel); color: var(--bz-fg); border: 1px solid var(--bz-border); border-radius: 8px; padding: 8px; font: inherit; font-size: 12px; max-width: 100%; }
.ownership__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.ownership__asset { border: 1px solid var(--bz-border); border-radius: 12px; overflow: hidden; background: var(--bz-panel); color: var(--bz-fg); padding: 0; text-align: left; min-width: 0; cursor: pointer; transition: border-color .15s, transform .15s; }
.ownership__asset:hover { border-color: var(--bz-purple-100); transform: translateY(-2px); }
.ownership__asset.is-selected { outline: 2px solid var(--bz-purple-100); outline-offset: 2px; }
.ownership__preview { aspect-ratio: 1.35; background: var(--bz-raised); position: relative; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; overflow: hidden; }
.ownership__preview img { width: 100%; height: 100%; object-fit: cover; }
.ownership__asset-glyph { font-size: 52px; color: var(--bz-purple-100); font-variation-settings: 'wght' 200; }
.ownership__preview-label { color: var(--bz-fg-mid); font-size: 12px; }
.ownership__preview strong { font-size: 22px; }
.ownership__preview strong small { font: 12px var(--bz-font-body); }
.ownership__type { position: absolute; top: 10px; left: 10px; padding: 3px 8px; border: 1px solid var(--bz-border); background: var(--bz-panel); border-radius: 4px; font-size: 10px; text-transform: capitalize; }
.ownership__asset-body { padding: 16px; }
.ownership__asset-body h3 { font: 600 15px/1.4 var(--bz-font-body); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; min-height: 42px; overflow-wrap: anywhere; }
.ownership__asset-body > p { font-size: 12px; color: var(--bz-fg-mid); margin-top: 7px; }
.ownership__asset-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; gap: 8px; }
.ownership__asset-foot > .material-symbols-outlined { font-size: 18px; color: var(--bz-fg-mid); }
.ownership__status { font-size: 11px; display: inline-flex; align-items: center; gap: 6px; color: var(--bz-fg-mid); }
.ownership__status > span { width: 5px; height: 5px; border-radius: 50%; background: var(--bz-purple-100); }
.ownership__status.is-restricted { color: var(--bz-warning); }
.ownership__rail { border-left: 1px solid var(--bz-border); padding-left: 28px; }
.ownership__identity-mark { color: var(--bz-purple-100); margin: 0 0 24px; }
.ownership__identity-mark span { font-size: 64px; font-variation-settings: 'wght' 200; }
.ownership__identity h2, .ownership__membership h2 { font-size: 27px; }
.ownership__identity > p:not(.bz-eyebrow), .ownership__membership > p:not(.bz-eyebrow) { margin: 14px 0 20px; color: var(--bz-fg-mid); font-size: 13px; line-height: 1.65; }
.ownership__identity > button, .ownership__membership > button { width: 100%; justify-content: space-between; }
.ownership__wallet { border: 1px solid var(--bz-border); border-radius: 6px; padding: 12px; font-size: 13px; }
.ownership__memory { display: flex; gap: 10px; align-items: center; margin-top: 24px; color: var(--bz-fg-mid); font-size: 12px; }
.ownership__memory strong { display: block; font: 14px var(--bz-font-metric); color: var(--bz-fg); margin-top: 4px; }
.ownership__membership { border-top: 1px solid var(--bz-border); margin-top: 28px; padding-top: 28px; }
.ownership__membership > .material-symbols-outlined { font-size: 32px; color: var(--bz-purple-100); margin-bottom: 20px; }
.ownership__stake { display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px; }
.ownership__stake strong { font-size: 28px; }.ownership__stake span { font-size: 12px; color: var(--bz-fg-mid); }
.ownership__inspector h2 { overflow-wrap: anywhere; font-size: 23px; margin-top: 12px; }
.ownership__detail-kind { display: block; color: var(--bz-fg-mid); font-size: 12px; margin-top: 10px; text-transform: capitalize; }
.ownership__facts { margin: 24px 0; }.ownership__facts div { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--bz-border); font-size: 12px; }.ownership__facts dt { color: var(--bz-fg-mid); }.ownership__facts dd { text-align: right; overflow-wrap: anywhere; margin: 0; }
.ownership__contributors { display: flex; flex-wrap: wrap; gap: 6px; margin: 20px 0; }.ownership__contributors p { width: 100%; }.ownership__contributors span { font-size: 11px; padding: 5px; background: var(--bz-panel); border-radius: 4px; }
.ownership__detail-actions { display: grid; gap: 8px; }.ownership__detail-actions > * { white-space: normal; justify-content: space-between; }
.ownership__empty { padding: 48px 20px 60px; text-align: center; }.ownership__empty-art { margin: 0 auto 24px; width: 90px; height: 110px; display: grid; place-items: center; border: 1px solid var(--bz-border-strong); border-radius: 14px; background: var(--bz-panel); transform: rotate(-6deg); }.ownership__empty-art span { font-size: 48px; color: var(--bz-purple-100); }.ownership__empty h3 { font-family: var(--bz-font-metric); font-size: 28px; font-weight: 900; font-style: italic; }.ownership__empty p { color: var(--bz-fg-mid); max-width: 380px; font-size: 14px; line-height: 1.6; margin: 12px auto 24px; }.ownership__empty-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.ownership__notice { display: flex; align-items: flex-start; gap: 10px; padding: 14px; margin: 16px 0; border-left: 3px solid var(--bz-warning); background: var(--bz-panel); color: var(--bz-fg-mid); font-size: 13px; line-height: 1.5; }.ownership__notice .bz-btn { margin-top: 6px; }
.ownership__loading { display: flex; align-items: center; justify-content: center; padding: 70px 10px; gap: 12px; color: var(--bz-fg-mid); }
.ownership__pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 24px; font-size: 12px; color: var(--bz-fg-mid); }.ownership__pagination > div { display: flex; gap: 8px; }
.ownership__footer { display: flex; align-items: center; gap: 12px; border-top: 1px solid var(--bz-border); padding-top: 20px; margin-top: 32px; color: var(--bz-fg-mid); font-size: 11px; }.ownership__footer p { max-width: 680px; }.ownership__footer > span:last-child:not(.material-symbols-outlined) { margin-left: auto; white-space: nowrap; }
.ownership :is(button, a, select):focus-visible { outline: 2px solid var(--bz-purple-100); outline-offset: 3px; }
.rotating { animation: ownership-spin 1.5s linear infinite; } @keyframes ownership-spin { to { transform: rotate(360deg); } }
@media (max-width: 1200px) { .ownership__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.ownership__layout { grid-template-columns: minmax(0, 1fr) 260px; gap: 24px; }.ownership__rail { padding-left: 24px; } }
@media (max-width: 1049px) { .ownership__layout { grid-template-columns: 1fr; }.ownership__rail { border: 0; border-top: 1px solid var(--bz-border); padding: 24px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }.ownership__membership { margin: 0; padding: 0 0 0 28px; border-top: 0; border-left: 1px solid var(--bz-border); } }
@media (max-width: 620px) { .ownership__header { flex-wrap: wrap; }.ownership__overview { grid-template-columns: repeat(2, 1fr); gap: 20px; }.ownership__overview > div + div { padding-left: 0; border: 0; }.ownership__overview strong { font-size: 32px; }.ownership__tabs { gap: 18px; }.ownership__grid { gap: 12px; }.ownership__asset-body { padding: 12px; }.ownership__rail { grid-template-columns: 1fr; }.ownership__membership { border-left: 0; border-top: 1px solid var(--bz-border); padding: 24px 0 0; }.ownership__footer { flex-wrap: wrap; }.ownership__footer p { flex: 1; }.ownership__footer > span:last-child { margin-left: 0; }.ownership__preview-label { display: none; } }
@media (max-width: 390px) { .ownership__grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .rotating { animation: none; }.ownership__asset { transition: none; } }

.ownership__header, .ownership__layout { gap: 28px; }
.ownership__identity h2, .ownership__membership h2 { font: 900 italic 26px/1.2 var(--bz-font-metric); margin-top: 8px; }
.ownership__empty { padding: 36px 24px 44px; }
.ownership__toolbar select { padding-inline: 12px 32px; }
</style>
