<template>
  <div class="markets bz-tab-shell">
    <div class="markets__workspace">
      <header class="markets__header">
        <div><p class="bz-eyebrow">The BonzAI economy</p><h1 class="bz-h1">Token markets</h1><p class="markets__intro">Discover the assets behind smart agents, models and games.</p></div>
        <div class="markets__header-actions"><span class="markets__network"><span class="material-symbols-outlined" aria-hidden="true">hub</span>{{ network.name }}</span><button class="bz-iconbtn" type="button" :aria-label="i18n.t('common.refresh')" :title="i18n.t('common.refresh')" :disabled="loading" @click="refresh"><span class="material-symbols-outlined" :class="{ 'is-refreshing': loading }" aria-hidden="true">refresh</span></button></div>
      </header>

      <div class="markets__overview" aria-label="Market overview">
        <div><span>Issued assets</span><strong class="bz-metric">{{ hasRegistry ? i18n.number(assets.length) : '—' }}</strong><small>{{ !hasRegistry ? 'No registry coverage yet' : coverageIncomplete ? 'Partial registry coverage' : 'Across BonzAI factories' }}</small></div>
        <div><span>Priced markets</span><strong class="bz-metric">{{ hasRegistry ? i18n.number(totals.priced) : '—' }}</strong><small>With an indexed USD price</small></div>
        <div><span>24h volume</span><strong class="bz-metric">{{ money(totals.volume.value, true) }}</strong><small>{{ totals.volume.count }} selected pools reporting</small></div>
        <div><span>Pool liquidity</span><strong class="bz-metric">{{ money(totals.liquidity.value, true) }}</strong><small>{{ totals.liquidity.count }} selected pools reporting</small></div>
      </div>

      <section ref="explorerEl" class="markets__explorer" aria-label="Explore tokens" :aria-busy="loading">
        <div class="markets__toolbar">
          <label class="markets__search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="query" type="search" aria-label="Search tokens" placeholder="Search name, symbol or address" /></label>
          <div class="markets__tools"><button class="bz-btn bz-btn--ghost bz-btn--sm" :aria-pressed="watchOnly" @click="watchOnly = !watchOnly"><span class="material-symbols-outlined" aria-hidden="true">{{ watchOnly ? 'star' : 'star_outline' }}</span>Watchlist<span class="bz-metric">{{ watchlist.length }}</span></button><label class="markets__sort"><span class="material-symbols-outlined" aria-hidden="true">sort</span><select v-model="sort" aria-label="Sort tokens"><option value="liquidity">Top liquidity</option><option value="volume">Top volume</option><option value="change">Top gainers</option><option value="name">Name A–Z</option></select></label></div>
        </div>
        <div class="markets__filters" role="tablist" aria-label="Token categories">
          <button v-for="item in filters" :id="`market-tab-${item.id}`" :key="item.id" role="tab" :aria-selected="filter === item.id" aria-controls="market-panel" :tabindex="filter === item.id ? 0 : -1" type="button" @keydown="onTabKey($event, item.id)" @click="filter = item.id">{{ item.label }}<span class="bz-metric">{{ item.id === 'all' ? assets.length : assets.filter(asset => asset.kind === item.id).length }}</span></button>
        </div>
        <p v-if="error" class="markets__notice is-error" role="alert">{{ error }} <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="loading" @click="refresh">Retry</button></p>
        <p v-else-if="failedSources.length && assets.length" class="markets__notice" role="status">{{ failedSources.map(source => source.label).join(', ') }} listings are unavailable. Other assets are still shown.</p>
        <p v-if="storageError" class="markets__notice" role="status">{{ storageError }}</p>
        <div id="market-panel" role="tabpanel" :aria-labelledby="`market-tab-${filter}`">
          <div v-if="loading && !assets.length" class="markets__loading" role="status"><span class="material-symbols-outlined" aria-hidden="true">radar</span><h2>Reading the market</h2><p>Loading issued tokens and their available pools.</p></div>
          <template v-else-if="visible.length">
            <div class="markets__table-wrap">
              <table class="markets__table"><thead><tr><th scope="col"><span class="sr-only">Watchlist</span></th><th scope="col">Asset</th><th scope="col">Price</th><th scope="col">24h change</th><th scope="col" class="market-volume">24h volume</th><th scope="col" class="market-liquidity">Liquidity</th></tr></thead>
                <tbody><tr v-for="asset in pageAssets" :key="asset.address" :class="{ 'is-selected': selected?.address === asset.address }">
                  <td><button class="markets__star" :aria-label="`${isWatched(asset) ? 'Remove' : 'Add'} ${asset.symbol} ${isWatched(asset) ? 'from' : 'to'} watchlist`" :aria-pressed="isWatched(asset)" @click="toggleWatch(asset)"><span class="material-symbols-outlined" aria-hidden="true">{{ isWatched(asset) ? 'star' : 'star_outline' }}</span></button></td>
                  <td><button class="markets__asset" :aria-label="`Explore ${asset.name}`" :aria-pressed="selected?.address === asset.address" @click="selectAsset(asset)"><span class="markets__avatar"><img v-if="asset.imageURI && !failedImages.has(asset.address)" :src="asset.imageURI" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failedImages.add(asset.address)" /><span v-else class="material-symbols-outlined" aria-hidden="true">{{ assetIcon(asset.kind) }}</span></span><span class="markets__identity"><strong>{{ asset.name }}</strong><small>{{ asset.symbol }}<span> · {{ kindLabel(asset.kind) }}</span></small></span></button></td>
                  <td><strong class="bz-metric">{{ money(asset.market?.priceUsd) }}</strong><small v-if="!asset.market" class="markets__quote-status">{{ asset.marketError ? 'Feed unavailable' : 'Not indexed' }}</small></td>
                  <td><span class="bz-metric" :class="changeClass(asset.market?.priceChange?.h24)">{{ percent(asset.market?.priceChange?.h24) }}</span></td>
                  <td class="market-volume"><span class="bz-metric">{{ money(asset.market?.volume?.h24, true) }}</span></td>
                  <td class="market-liquidity"><span class="bz-metric">{{ money(asset.market?.liquidity?.usd, true) }}</span></td>
                </tr></tbody>
              </table>
            </div>
            <div class="markets__table-footer"><span><span class="bz-metric">{{ page * pageSize + 1 }}–{{ Math.min((page + 1) * pageSize, visible.length) }}</span> of <span class="bz-metric">{{ visible.length }}</span> assets</span><span class="markets__pool-note">Highest-liquidity indexed pool per asset</span><div class="markets__pagination"><button class="bz-iconbtn" aria-label="Previous assets" :disabled="page === 0" @click="page--"><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button><button class="bz-iconbtn" aria-label="Next assets" :disabled="(page + 1) * pageSize >= visible.length" @click="page++"><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button></div></div>
          </template>
          <div v-else-if="assets.length || query || watchOnly || filter !== 'all'" class="markets__empty"><span class="material-symbols-outlined" aria-hidden="true">{{ watchOnly ? 'star_outline' : 'search_off' }}</span><h2>{{ watchOnly ? 'Keep your next move in view.' : 'No matching assets.' }}</h2><p>{{ watchOnly ? 'Star assets to build a watchlist saved on this device.' : 'Try another name, symbol, address or category.' }}</p><button class="bz-btn bz-btn--ghost" @click="clearFilters">Explore all assets</button></div>
          <div v-else class="markets__launch-state">
            <div class="markets__launch-heading"><span class="markets__launch-icon material-symbols-outlined" aria-hidden="true">candlestick_chart</span><div><p class="bz-eyebrow">Agents · Models · Games</p><h2>{{ failedSources.length ? 'The market is temporarily out of reach.' : 'Created here. Discovered here.' }}</h2><p>{{ failedSources.length ? 'Some registries could not be read. Refresh to try again.' : hasRegistry ? 'Tokens issued through BonzAI appear here as they launch.' : `Token listings will open when the issuance contracts are configured on ${network.name}.` }}</p></div></div>
            <div class="markets__launch-links"><button v-for="item in creationLinks" :key="item.mode" @click="openMode(item.mode)"><span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span><span><strong>{{ item.title }}</strong><small>{{ item.subtitle }}</small></span><span class="material-symbols-outlined" aria-hidden="true">north_east</span></button></div>
          </div>
        </div>
      </section>

      <div v-if="selected" class="markets__detail-navigation"><button class="bz-btn bz-btn--ghost bz-btn--sm" @click="explorerEl?.scrollIntoView({ block: 'start' })"><span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span>Back to assets</button><span>{{ selected.symbol }} / {{ network.currency.symbol }}</span></div>
      <section v-if="selected" ref="detailEl" tabindex="-1" class="markets__terminal" aria-label="Selected asset">
        <div class="markets__analysis">
          <header class="markets__token-head"><div><p class="bz-eyebrow">{{ kindLabel(selected.kind) }} <span> / {{ selected.symbol }}</span></p><h2>{{ selected.name }}</h2></div><button class="bz-iconbtn" :aria-label="`${isWatched(selected) ? 'Unwatch' : 'Watch'} ${selected.symbol}`" :aria-pressed="isWatched(selected)" @click="toggleWatch(selected)"><span class="material-symbols-outlined" aria-hidden="true">{{ isWatched(selected) ? 'star' : 'star_outline' }}</span></button></header>
          <div class="markets__price-line"><strong class="markets__price bz-metric">{{ money(selected.market?.priceUsd) }}</strong><span :class="changeClass(selected.market?.priceChange?.h24)"><span class="bz-metric">{{ percent(selected.market?.priceChange?.h24) }}</span> <small>24h</small></span><span v-if="!selected.market" class="markets__status">{{ selected.marketError ? 'Price feed unavailable' : 'Awaiting market data' }}</span></div>
          <div class="markets__chart-toolbar"><span>Price <small>USD</small></span><div aria-label="Chart period" class="markets__ranges"><button v-for="range in ranges" :key="range.id" :aria-pressed="period === range.id" @click="period = range.id">{{ range.label }}</button></div></div>
          <MarketPriceChart v-if="chartPoints.length > 1" :points="chartPoints" :symbol="selected.symbol" :locale="i18n.state.locale" />
          <div v-else class="markets__chart-empty"><span class="material-symbols-outlined" aria-hidden="true">show_chart</span><strong>{{ selected.history?.length > 1 ? 'No observations in this period' : 'A price history starts with observation.' }}</strong><p>{{ selected.history?.length > 1 ? 'Choose a wider period to see earlier prices.' : 'Prices are recorded on refresh. The chart appears after two observations.' }}</p></div>
          <div class="markets__chart-caption"><span>Locally observed prices · <span class="bz-metric">{{ chartPoints.length }}</span> samples</span><a v-if="analyticsUrl" :href="analyticsUrl" target="_blank" rel="noopener noreferrer">Full market chart<span class="material-symbols-outlined" aria-hidden="true">open_in_new</span></a></div>
          <dl class="markets__pool-metrics"><div><dt>Liquidity</dt><dd class="bz-metric">{{ money(selected.market?.liquidity?.usd, true) }}</dd></div><div><dt>24h volume</dt><dd class="bz-metric">{{ money(selected.market?.volume?.h24, true) }}</dd></div><div><dt>24h buys / sells</dt><dd class="bz-metric">{{ count(selected.market?.txns?.h24?.buys) }} <span>/</span> {{ count(selected.market?.txns?.h24?.sells) }}</dd></div></dl>
        </div>

        <aside class="markets__trade" aria-label="Trade asset">
          <header><h2>Trade {{ selected.symbol }}</h2><span class="markets__external-label">Via Uniswap<span class="material-symbols-outlined" aria-hidden="true">open_in_new</span></span></header>
          <div class="markets__sides" role="group" aria-label="Trade direction"><button :aria-pressed="side === 'buy'" @click="side = 'buy'">Buy</button><button :aria-pressed="side === 'sell'" @click="side = 'sell'">Sell</button></div>
          <div class="markets__trade-pair"><div><small>You pay</small><strong>{{ side === 'buy' ? network.currency.symbol : selected.symbol }}</strong></div><span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span><div><small>You receive</small><strong>{{ side === 'buy' ? selected.symbol : network.currency.symbol }}</strong></div></div>
          <p class="markets__trade-description">Choose your amount and review the executable quote, fees and slippage in Uniswap. Confirm with your wallet there.</p>
          <a v-if="tradeUrl" class="bz-btn bz-btn--primary markets__trade-action" :href="tradeUrl" target="_blank" rel="noopener noreferrer">{{ side === 'buy' ? 'Buy' : 'Sell' }} {{ selected.symbol }}<span class="material-symbols-outlined" aria-hidden="true">north_east</span></a>
          <button v-else class="bz-btn markets__trade-action" disabled>{{ selected.marketError ? 'Price feed unavailable' : 'No indexed liquidity' }}</button>
          <p v-if="!tradeUrl" class="markets__trade-note">An indexed pool with liquidity is needed to enable this shortcut.</p>
          <dl class="markets__trade-facts"><div><dt>Network</dt><dd>{{ network.name }}</dd></div><div><dt>Indexed venue</dt><dd>{{ selected.market?.dexId || '—' }}<span v-if="selected.market?.labels?.length"> · {{ selected.market.labels.join(' / ') }}</span></dd></div><div><dt>Quote asset</dt><dd>{{ selected.market?.quoteToken?.symbol || '—' }}</dd></div></dl>
          <p class="markets__trade-note">Displayed prices are indicative. The swap route and final price are confirmed by Uniswap.</p>
        </aside>

        <div class="markets__asset-details"><div><p class="bz-eyebrow">Onchain identity</p><h3>Know the asset.</h3><p>{{ selected.description || assetPurpose(selected.kind) }}</p><p v-if="selected.metadataUnavailable || selected.profileUnavailable" class="markets__notice">Some token details could not be loaded. Refresh to try again.</p></div><dl><div><dt>Token contract</dt><dd><a :href="explorerToken(selected.address)" target="_blank" rel="noopener noreferrer" class="bz-mono">{{ shortAddress(selected.address) }}<span class="material-symbols-outlined" aria-hidden="true">open_in_new</span></a><button class="bz-iconbtn" :aria-label="copied ? 'Token address copied' : 'Copy token address'" @click="copyAddress"><span class="material-symbols-outlined" aria-hidden="true">{{ copied ? 'check' : 'content_copy' }}</span></button></dd></div><div><dt>Issued through</dt><dd>{{ kindLabel(selected.kind) }} factory</dd></div><div v-if="selected.creator || selected.agentWallet"><dt>{{ selected.creator ? 'Creator' : 'Agent wallet' }}</dt><dd class="bz-mono"><a :href="`${network.explorer}/address/${selected.creator || selected.agentWallet}`" target="_blank" rel="noopener noreferrer">{{ shortAddress(selected.creator || selected.agentWallet) }}<span class="material-symbols-outlined" aria-hidden="true">open_in_new</span></a></dd></div><div><dt>Pool</dt><dd><a v-if="analyticsUrl" :href="analyticsUrl" target="_blank" rel="noopener noreferrer">{{ shortAddress(selected.market.pairAddress) }}<span class="material-symbols-outlined" aria-hidden="true">open_in_new</span></a><span v-else>Not indexed</span></dd></div></dl></div>
      </section>

      <footer class="markets__data-footer"><div><span class="material-symbols-outlined" aria-hidden="true">database</span><span>Onchain listings · DEX Screener prices<span v-if="updatedAt"> · Refreshed {{ updatedTime }}</span></span></div><details><summary>Listing sources <span class="bz-metric">{{ sources.filter(source => source.status === 'ready').length }}/{{ sources.length || 3 }}</span></summary><ul><li v-for="source in sources" :key="source.id"><span>{{ source.label }}</span><span :class="{ 'is-error': source.status === 'error' }">{{ source.status === 'ready' ? `${source.count} issued` : source.status === 'error' ? 'Read failed · retry refresh' : 'Not configured' }}</span></li></ul></details></footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js'
import { loadMarketSnapshot } from '../services/markets.service.js'
import { filterMarketAssets, isMarketAddress, marketAnalyticsUrl, marketNumber, marketTotals, marketTradeUrl, marketWatchlistKey } from '../services/marketData.js'
import { useI18n } from '../i18n/index.js'
import MarketPriceChart from './markets/MarketPriceChart.vue'
const i18n = useI18n()
const network = CONFIG.networks[ECONOMY_NETWORK_KEY]
const filters = [{ id: 'all', label: 'All assets' }, { id: 'companion', label: 'Smart agents' }, { id: 'game', label: 'Games' }, { id: 'fine_tuned', label: 'Fine-tuned' }, { id: 'abliterated', label: 'Uncensored' }]
const creationLinks = [{ mode: 'agent', icon: 'automation', title: 'Smart agents', subtitle: 'Create a skilled agent. Issue its social token.' }, { mode: 'tune', icon: 'model_training', title: 'Original models', subtitle: 'Train, publish and tokenize your work.' }, { mode: 'game', icon: 'sports_esports', title: 'Playable worlds', subtitle: 'Build a game and its own token economy.' }]
const ranges = [{ id: 3600, label: '1H' }, { id: 86400, label: '24H' }, { id: 604800, label: '7D' }, { id: 0, label: 'ALL' }]
const assets = ref([]), sources = ref([]), loading = ref(true), error = ref(''), updatedAt = ref(null), selectedAddress = ref('')
const query = ref(''), filter = ref('all'), sort = ref('liquidity'), watchOnly = ref(false), side = ref('buy'), period = ref(0), page = ref(0), detailEl = ref(null), explorerEl = ref(null)
const pageSize = 6, storageKey = marketWatchlistKey(network.chainId), storageError = ref(''), copied = ref(false), failedImages = ref(new Set())
let controller, copyTimer, disposed = false
const readWatchlist = () => { try { const saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(saved) ? [...new Set(saved.filter(isMarketAddress).map(address => address.toLowerCase()))] : [] } catch { return [] } }
const watchlist = ref(readWatchlist())
const visible = computed(() => filterMarketAssets(assets.value, { kind: filter.value, query: query.value, sort: sort.value, watchlist: watchOnly.value ? watchlist.value : null }))
const pageAssets = computed(() => visible.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
const selected = computed(() => assets.value.find(asset => asset.address === selectedAddress.value) || null)
const hasRegistry = computed(() => sources.value.some(source => source.status === 'ready'))
const coverageIncomplete = computed(() => sources.value.some(source => source.status !== 'ready'))
const failedSources = computed(() => sources.value.filter(source => source.status === 'error'))
const totals = computed(() => marketTotals(assets.value))
const chartPoints = computed(() => (selected.value?.history || []).filter(point => !period.value || point.time >= (updatedAt.value || Date.now()) / 1000 - period.value))
const analyticsUrl = computed(() => marketAnalyticsUrl(selected.value?.market, selected.value?.address, network.chainId))
const tradeUrl = computed(() => marketNumber(selected.value?.market?.liquidity?.usd) > 0 && marketNumber(selected.value?.market?.priceUsd) > 0 ? marketTradeUrl(selected.value.address, network.chainId, side.value) : null)
const updatedTime = computed(() => new Intl.DateTimeFormat(i18n.state.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(updatedAt.value))
function money(value, compact = false) { const number = marketNumber(value); return number === null || number < 0 ? '—' : i18n.number(number, { style: 'currency', currency: 'USD', ...(compact ? { notation: 'compact', maximumFractionDigits: 2 } : number === 0 || number >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumSignificantDigits: 4 }) }) }
const count = value => marketNumber(value) === null ? '—' : i18n.number(Number(value))
const percent = value => marketNumber(value) === null ? '—' : i18n.number(Number(value) / 100, { style: 'percent', signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const changeClass = value => marketNumber(value) === null || Number(value) === 0 ? '' : Number(value) > 0 ? 'is-up' : 'is-down'
const shortAddress = value => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—'
const explorerToken = address => `${network.explorer}/token/${address}`
const kindLabel = kind => ({ companion: 'Smart agent', game: 'Game', fine_tuned: 'Fine-tuned model', abliterated: 'Uncensored model' }[kind] || 'Model')
const assetIcon = kind => ({ companion: 'automation', game: 'sports_esports' }[kind] || 'model_training')
const assetPurpose = kind => kind === 'companion' ? 'A social token for a smart agent, used to settle its jobs in the BonzAI economy.' : kind === 'game' ? 'An issued token linked to a registered BonzAI game collectible. Distribution and liquidity are managed by its creator.' : 'An issued token linked to a model published through BonzAI. Explore its onchain identity before trading.'
const isWatched = asset => watchlist.value.includes(asset.address.toLowerCase())
function toggleWatch(asset) { const address = asset.address.toLowerCase(); watchlist.value = isWatched(asset) ? watchlist.value.filter(item => item !== address) : [...watchlist.value, address]; storageError.value = ''; try { localStorage.setItem(storageKey, JSON.stringify(watchlist.value)) } catch { storageError.value = 'Your watchlist is available for this session, but could not be saved on this device.' } }
function clearFilters() { query.value = ''; filter.value = 'all'; watchOnly.value = false }
async function selectAsset(asset) { selectedAddress.value = asset.address; await nextTick(); detailEl.value?.focus({ preventScroll: true }); detailEl.value?.scrollIntoView({ block: 'start', behavior: 'instant' }) }
function openMode(mode) { window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: mode })) }
async function copyAddress() { try { await navigator.clipboard.writeText(selected.value.address); copied.value = true; clearTimeout(copyTimer); copyTimer = setTimeout(() => { copied.value = false }, 2000) } catch { storageError.value = 'Address could not be copied. Open the token explorer to copy it.' } }
async function refresh() {
  if (controller) controller.abort()
  const request = new AbortController(); controller = request; loading.value = true; error.value = ''
  try {
    const snapshot = await loadMarketSnapshot({ signal: request.signal })
    if (disposed || request.signal.aborted) return
    assets.value = snapshot.assets; sources.value = snapshot.sources; updatedAt.value = snapshot.updatedAt
  } catch { if (!disposed && !request.signal.aborted) error.value = 'Market data could not be refreshed. Please try again.' }
  finally { if (!disposed && !request.signal.aborted) loading.value = false }
}
function onTabKey(event, id) { const index = filters.findIndex(item => item.id === id); const next = event.key === 'Home' ? 0 : event.key === 'End' ? filters.length - 1 : event.key === 'ArrowRight' ? (index + 1) % filters.length : event.key === 'ArrowLeft' ? (index - 1 + filters.length) % filters.length : -1; if (next < 0) return; event.preventDefault(); filter.value = filters[next].id; document.getElementById(`market-tab-${filter.value}`)?.focus() }
watch(visible, list => { page.value = 0; if (!list.some(asset => asset.address === selectedAddress.value)) selectedAddress.value = list[0]?.address || '' })
watch(selectedAddress, () => { side.value = 'buy'; copied.value = false })
onMounted(refresh)
onBeforeUnmount(() => { disposed = true; controller?.abort(); clearTimeout(copyTimer) })
</script>

<style scoped>
.markets { display: block; height: 100%; overflow: auto; min-width: 0; background: var(--bz-canvas); color: var(--bz-fg); container-type: inline-size; }
.markets :is(.bz-btn, .bz-iconbtn, input, select) { box-sizing: border-box; }
.markets__workspace { padding: clamp(16px, 2.5vw, 32px); width: 100%; box-sizing: border-box; max-width: 1800px; margin: 0 auto; }
.markets h1, .markets h2, .markets h3, .markets p, .markets dl, .markets dd { margin: 0; }
.markets h2, .markets h3 { color: var(--bz-fg); font-family: var(--bz-font-display); }
.markets a { color: var(--bz-fg); text-decoration: none; }
.markets a:hover { text-decoration: underline; }
.markets button { cursor: pointer; }
.markets button:disabled { cursor: default; }
.markets :is(button, input, select, a, summary):focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 3px; }
.markets__header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 28px; }
.markets__header .bz-eyebrow { margin-bottom: 8px; }
.markets__header .bz-h1 { font-size: 36px; }
.markets__intro { color: var(--bz-fg-mid); padding-top: 8px; line-height: 1.5; }
.markets__header-actions, .markets__network, .markets__tools, .markets__pagination { display: flex; align-items: center; gap: 10px; }
.markets__network { border: 1px solid var(--bz-border); border-radius: 99px; padding: 8px 12px; font-size: 12px; white-space: nowrap; color: var(--bz-fg-mid); }
.markets__network .material-symbols-outlined { font-size: 16px; }
.markets__overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-block: 1px solid var(--bz-border); margin-bottom: 28px; }
.markets__overview > div { padding: 20px 24px; border-right: 1px solid var(--bz-border); min-width: 0; }
.markets__overview > div:first-child { padding-left: 0; }
.markets__overview > div:last-child { border-right: 0; }
.markets__overview span, .markets__overview small { display: block; font-size: 12px; color: var(--bz-fg-mid); }
.markets__overview strong { display: block; font-size: 30px; line-height: 1.4; margin: 2px 0; }
.markets__overview small { font-size: 11px; color: var(--bz-fg-low); }
.markets__toolbar { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.markets__search { display: flex; flex: 1; max-width: 420px; min-width: 0; align-items: center; gap: 8px; padding: 0 12px; height: 40px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-panel); color: var(--bz-fg-mid); }
.markets__search input { width: 100%; min-width: 0; border: 0; background: transparent; color: var(--bz-fg); font: inherit; font-size: 13px; outline: none; }
.markets__search:focus-within { border-color: var(--bz-accent); }
.markets__search input::placeholder { color: var(--bz-fg-low); }
.markets__sort { display: flex; align-items: center; gap: 6px; }
.markets__sort .material-symbols-outlined { font-size: 18px; color: var(--bz-fg-mid); }
.markets__sort select { max-width: 150px; background: var(--bz-canvas); border: 0; color: var(--bz-fg); padding: 8px 2px; font: 13px var(--bz-font-ui); }
.markets__filters { display: flex; gap: 22px; overflow-x: auto; border-bottom: 1px solid var(--bz-border); }
.markets__filters button { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; min-height: 44px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--bz-fg-mid); padding: 0 0 12px; font: 500 13px var(--bz-font-ui); }
.markets__filters button[aria-selected="true"] { color: var(--bz-fg); border-color: var(--bz-accent); }
.markets__filters button span { font-size: 12px; padding: 2px 5px; border-radius: 4px; background: var(--bz-raised); }
.markets__tools button[aria-pressed="true"], .markets__star[aria-pressed="true"] { color: var(--bz-accent); background: var(--bz-accent-soft); }
.markets__table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.markets__table th { font-size: 11px; font-weight: 400; color: var(--bz-fg-mid); padding: 12px 16px; text-align: right; }
.markets__table td { box-sizing: border-box; padding: 8px 16px; border-top: 1px solid var(--bz-border); text-align: right; height: 64px; }
.markets__table th:first-child, .markets__table td:first-child { width: 42px; padding: 0 4px; }
.markets__table th:nth-child(2), .markets__table td:nth-child(2) { width: 35%; text-align: left; padding-left: 4px; }
.markets__table tbody tr { transition: background .12s ease; }
.markets__table tbody tr:hover { background: var(--bz-panel); }
.markets__table tbody tr.is-selected { background: var(--bz-accent-soft); box-shadow: inset 2px 0 0 var(--bz-accent); }
.markets__table .bz-metric { font-size: 16px; white-space: nowrap; }
.markets__star { display: grid; place-items: center; width: 32px; height: 36px; border: 0; border-radius: var(--bz-r-sm); background: transparent; color: var(--bz-fg-low); }
.markets__star .material-symbols-outlined { font-size: 18px; }
.markets__asset { width: 100%; display: flex; align-items: center; text-align: left; gap: 12px; background: transparent; border: 0; padding: 4px; color: var(--bz-fg); min-width: 0; }
.markets__avatar { display: grid; place-items: center; flex: 0 0 38px; height: 38px; border-radius: 12px; border: 1px solid var(--bz-border); background: var(--bz-raised); color: var(--bz-fg); overflow: hidden; }
.markets__avatar img { width: 100%; height: 100%; object-fit: cover; }
.markets__identity { min-width: 0; }
.markets__identity strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--bz-fg); font-size: 14px; font-weight: 600; }
.markets__identity small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 4px; font-size: 11px; color: var(--bz-fg-mid); }
.markets__quote-status { display: block; font-size: 10px; color: var(--bz-fg-low); margin-top: 3px; }
.markets__table-footer { display: flex; align-items: center; gap: 16px; justify-content: space-between; border-block: 1px solid var(--bz-border); padding: 8px 0; color: var(--bz-fg-low); font-size: 11px; }
.markets__pagination { gap: 4px; }
.markets__pagination button { width: 28px; height: 28px; }
.markets__notice { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 0; font-size: 12px; color: var(--bz-fg-mid); line-height: 1.5; }
.markets__empty, .markets__loading { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; min-height: 280px; padding: 32px 16px; text-align: center; }
.markets__empty > .material-symbols-outlined, .markets__loading > .material-symbols-outlined { font-size: 32px; color: var(--bz-fg-low); }
.markets__empty h2, .markets__loading h2 { font-size: 24px; }
.markets__empty p, .markets__loading p { color: var(--bz-fg-mid); font-size: 13px; }
.markets__launch-state { padding: 42px 0 24px; }
.markets__launch-heading { display: flex; align-items: center; gap: 24px; max-width: 760px; padding: 0 0 32px; }
.markets__launch-icon { width: 84px; height: 84px; border: 1px solid var(--bz-border); background: var(--bz-panel); border-radius: 20px; display: grid; place-items: center; font-size: 40px; color: var(--bz-fg-mid); flex-shrink: 0; }
.markets__launch-heading h2 { font-size: clamp(24px, 3vw, 34px); font-style: italic; font-weight: 900; padding: 10px 0; }
.markets__launch-heading p:not(.bz-eyebrow) { font-size: 13px; color: var(--bz-fg-mid); line-height: 1.6; }
.markets__launch-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--bz-border); border-radius: var(--bz-r); overflow: hidden; }
.markets__launch-links button { display: flex; align-items: center; gap: 14px; padding: 22px 18px; border: 0; border-right: 1px solid var(--bz-border); background: var(--bz-panel); color: var(--bz-fg); text-align: left; }
.markets__launch-links button:last-child { border-right: 0; }
.markets__launch-links button:hover { background: var(--bz-raised); }
.markets__launch-links button > span:nth-child(2) { flex: 1; min-width: 0; }
.markets__launch-links strong { display: block; color: var(--bz-fg); font-size: 14px; }
.markets__launch-links small { display: block; color: var(--bz-fg-mid); font-size: 12px; margin-top: 6px; line-height: 1.5; }
.markets__launch-links button > .material-symbols-outlined:last-child { font-size: 18px; }
.markets__detail-navigation { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 24px; margin-bottom: 10px; color: var(--bz-fg-mid); font-size: 11px; }
.markets__terminal { display: grid; grid-template-columns: minmax(0, 1fr) 310px; border: 1px solid var(--bz-border); border-radius: var(--bz-r); margin-top: 0; overflow: hidden; background: var(--bz-panel); scroll-margin-top: 16px; }
.markets__analysis { min-width: 0; padding: 24px 24px 0; }
.markets__token-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.markets__token-head > div { min-width: 0; }
.markets__token-head .bz-eyebrow { font-size: 11px; overflow-wrap: anywhere; }
.markets__token-head h2 { font-size: 24px; margin-top: 8px; overflow-wrap: anywhere; font-weight: 900; font-style: italic; }
.markets__token-head .bz-eyebrow span { color: var(--bz-fg-low); }
.markets__price-line { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; padding: 14px 0 24px; }
.markets__price { font-size: 34px; line-height: 1.1; overflow-wrap: anywhere; }
.markets__price-line > span { font-size: 13px; }
.markets__price-line small, .markets__status { color: var(--bz-fg-mid); font-size: 11px; }
.markets__chart-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px; font-size: 12px; }
.markets__chart-toolbar small { margin-left: 6px; color: var(--bz-fg-mid); }
.markets__ranges { display: flex; gap: 4px; }
.markets__ranges button { height: 28px; padding: 0 8px; border: 0; border-radius: 4px; background: transparent; color: var(--bz-fg-mid); font: 12px var(--bz-font-ui); }
.markets__ranges button[aria-pressed="true"] { background: var(--bz-raised); color: var(--bz-fg); }
.markets__chart-empty { height: 264px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-block: 1px dashed var(--bz-border); text-align: center; padding: 24px; }
.markets__chart-empty .material-symbols-outlined { font-size: 36px; color: var(--bz-fg-low); }
.markets__chart-empty strong { font-size: 14px; font-weight: 500; }
.markets__chart-empty p { max-width: 42ch; color: var(--bz-fg-mid); font-size: 12px; line-height: 1.5; }
.markets__chart-caption { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 0; font-size: 10px; color: var(--bz-fg-low); }
.markets__chart-caption a, .markets__asset-details a { display: inline-flex; align-items: center; gap: 5px; }
.markets__chart-caption .material-symbols-outlined, .markets__asset-details a .material-symbols-outlined { font-size: 13px; }
.markets__pool-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--bz-border); padding: 18px 0; gap: 12px; }
.markets__pool-metrics dt { font-size: 11px; color: var(--bz-fg-mid); margin-bottom: 8px; }
.markets__pool-metrics dd { font-size: 20px; }
.markets__pool-metrics dd span { color: var(--bz-fg-low); }
.markets__trade { padding: 24px; border-left: 1px solid var(--bz-border); background: var(--bz-card); display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.markets__trade header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
.markets__trade h2 { font-size: 20px; font-style: italic; font-weight: 900; overflow-wrap: anywhere; }
.markets__external-label { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: var(--bz-fg-mid); }
.markets__external-label .material-symbols-outlined { font-size: 13px; }
.markets__sides { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: var(--bz-canvas); border: 1px solid var(--bz-border); padding: 4px; border-radius: var(--bz-r-sm); }
.markets__sides button { height: 34px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--bz-fg-mid); font: 500 13px var(--bz-font-ui); }
.markets__sides button[aria-pressed="true"] { background: var(--bz-control-selected-bg); border-color: var(--bz-control-selected-border); color: var(--bz-control-selected-fg); }
.markets__trade-pair { border-block: 1px solid var(--bz-border); padding: 14px 0; position: relative; }
.markets__trade-pair > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 0; }
.markets__trade-pair > .material-symbols-outlined { color: var(--bz-fg-low); font-size: 16px; display: block; }
.markets__trade-pair small { color: var(--bz-fg-mid); font-size: 12px; }
.markets__trade-pair strong { font-size: 17px; overflow-wrap: anywhere; text-align: right; }
.markets__trade-description, .markets__trade-note { color: var(--bz-fg-mid); font-size: 12px; line-height: 1.6; }
.markets__trade-action { width: 100%; min-height: 42px; height: auto; white-space: normal; overflow-wrap: anywhere; }
.markets a.markets__trade-action { color: var(--bz-on-accent); text-decoration: none; }
.markets__trade-facts { display: grid; gap: 12px; padding-top: 4px; margin-top: auto !important; }
.markets__trade-facts > div { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; }
.markets__trade-facts dt { color: var(--bz-fg-mid); }
.markets__trade-facts dd { text-align: right; overflow-wrap: anywhere; }
.markets__trade-note { font-size: 10px; }
.markets__asset-details { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, .8fr); gap: 40px; padding: 24px; border-top: 1px solid var(--bz-border); }
.markets__asset-details h3 { margin: 8px 0; font-size: 22px; font-style: italic; font-weight: 900; }
.markets__asset-details p:not(.bz-eyebrow) { color: var(--bz-fg-mid); font-size: 12px; line-height: 1.6; max-width: 60ch; overflow-wrap: anywhere; }
.markets__asset-details dl { display: grid; gap: 8px; font-size: 11px; }
.markets__asset-details dl > div { display: flex; gap: 12px; justify-content: space-between; align-items: center; }
.markets__asset-details dt { color: var(--bz-fg-mid); flex-shrink: 0; }
.markets__asset-details dd { display: flex; align-items: center; gap: 6px; text-align: right; overflow-wrap: anywhere; min-width: 0; }
.markets__asset-details .bz-iconbtn { height: 26px; width: 26px; flex-shrink: 0; }
.markets__asset-details .bz-iconbtn .material-symbols-outlined { font-size: 14px; }
.markets__data-footer { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; padding: 18px 0 4px; font-size: 11px; color: var(--bz-fg-low); }
.markets__data-footer > div { display: flex; align-items: center; gap: 8px; line-height: 1.6; }
.markets__data-footer .material-symbols-outlined { font-size: 16px; }
.markets__data-footer details { min-width: 190px; }
.markets__data-footer summary { cursor: pointer; color: var(--bz-fg-mid); }
.markets__data-footer ul { list-style: none; padding: 12px 0 0; margin: 0; display: grid; gap: 10px; }
.markets__data-footer li { display: flex; justify-content: space-between; gap: 20px; }
.markets .is-up { color: color-mix(in srgb, var(--bz-emerald-500) 75%, var(--bz-fg) 25%); }
.markets .is-down, .markets .is-error { color: color-mix(in srgb, var(--bz-danger) 80%, var(--bz-fg) 20%); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@keyframes market-refresh { to { transform: rotate(360deg); } }
.is-refreshing { animation: market-refresh 1.2s linear infinite; }
@media (prefers-reduced-motion: reduce) { .is-refreshing { animation: none; } .markets__table tbody tr { transition: none; } }
@container (max-width: 1000px) { .markets__launch-links button { flex-wrap: wrap; } .markets__launch-links button > span:nth-child(2) { flex-basis: 70%; } .markets__terminal { grid-template-columns: minmax(0, 1fr) 280px; } .markets__analysis, .markets__trade { padding: 20px; } .market-volume { display: none; } .markets__table th:nth-child(2) { width: 40%; } }
@container (max-width: 750px) { .markets__header { align-items: flex-start; flex-direction: column; gap: 16px; } .markets__header-actions { width: 100%; justify-content: space-between; } .markets__terminal { grid-template-columns: minmax(0, 1fr); } .markets__trade { border-left: 0; border-top: 1px solid var(--bz-border); } .markets__trade-pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; } .markets__trade-pair > div { flex-direction: column; align-items: flex-start; } .markets__trade-pair > .material-symbols-outlined { transform: rotate(-90deg); } .markets__asset-details { grid-template-columns: 1fr; gap: 24px; } .markets__overview > div { padding: 16px 12px; } .markets__toolbar { flex-wrap: wrap; gap: 8px; } .markets__search { max-width: none; flex-basis: 100%; } .markets__tools { justify-content: space-between; width: 100%; } .markets__launch-links { grid-template-columns: 1fr; } .markets__launch-links button { border-right: 0; border-bottom: 1px solid var(--bz-border); flex-wrap: nowrap; } .markets__launch-links button:last-child { border-bottom: 0; } }
@container (max-width: 520px) { .markets__overview { grid-template-columns: 1fr 1fr; } .markets__overview > div:nth-child(2) { border-right: 0; } .markets__overview > div:nth-child(3) { padding-left: 0; } .markets__overview > div:nth-child(-n+2) { border-bottom: 1px solid var(--bz-border); } .markets__overview strong { font-size: 28px; } .markets__filters { gap: 18px; } .markets__table th { padding: 12px 4px; } .markets__table td { box-sizing: border-box; padding: 8px 4px; } .market-liquidity, .markets__pool-note { display: none; } .markets__table th:nth-child(2) { width: 45%; } .markets__table th:first-child, .markets__table td:first-child { width: 28px; padding: 0; } .markets__star { width: 28px; } .markets__asset { gap: 8px; padding: 4px 0; } .markets__avatar { flex-basis: 28px; height: 28px; border-radius: 8px; } .markets__avatar .material-symbols-outlined { font-size: 18px; } .markets__identity small > span { display: none; } .markets__identity strong { font-size: 12px; } .markets__table .bz-metric { font-size: 13px; } .markets__launch-heading { align-items: flex-start; gap: 14px; } .markets__launch-icon { width: 42px; height: 42px; border-radius: 10px; font-size: 24px; } .markets__launch-heading .bz-eyebrow { font-size: 10px; } .markets__pool-metrics { gap: 8px; } .markets__pool-metrics dd { font-size: 18px; } .markets__analysis, .markets__trade, .markets__asset-details { padding: 16px; } .markets__chart-empty { padding: 12px; } }

.markets__launch-heading h2, .markets__token-head h2 { font-family: var(--bz-font-metric); font-weight: 900; font-style: italic; line-height: 1.2; }
.markets__launch-heading h2 { margin: 8px 0 12px; padding: 0; }
.markets__launch-links button { padding: 22px 24px; min-width: 0; }
.markets__sort select { padding-inline: 10px 30px; }
</style>
