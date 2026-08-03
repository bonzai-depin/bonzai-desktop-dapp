<template>
  <div class="markets bz-tab-shell">
    <header class="markets__header bz-screen-header">
      <div class="bz-screen-titleblock"><p class="bz-eyebrow">{{ i18n.t('views.markets.eyebrow') }}</p><h1 class="bz-h1">{{ i18n.t('views.markets.title') }}</h1><p class="bz-screen-subtitle">Live companion, model, and game markets.</p></div>
      <button class="bz-iconbtn" type="button" :title="i18n.t('common.refresh')" :disabled="loading" @click="refresh"><span class="material-symbols-outlined">refresh</span></button>
    </header>
    <div class="markets__filters" role="tablist">
      <button v-for="item in filters" :key="item.id" :class="{ 'is-active': filter === item.id }" type="button" @click="filter = item.id">{{ item.label }}</button>
      <span>{{ visible.length }} assets</span>
    </div>
    <div v-if="loading" class="markets__state">{{ i18n.t('views.markets.reading') }}</div>
    <div v-else-if="error" class="markets__state is-error">{{ error }} <button class="bz-btn bz-btn--ghost bz-btn--sm" @click="refresh">{{ i18n.t('common.retry') }}</button></div>
    <div v-else class="markets__layout">
      <aside class="markets__list">
        <button v-for="asset in visible" :key="asset.address" :class="['markets__asset', { 'is-active': selected?.address === asset.address }]" type="button" @click="selected = asset">
          <img v-if="asset.imageURI" :src="asset.imageURI" alt="" /><span v-else class="material-symbols-outlined">{{ assetIcon(asset.kind) }}</span>
          <span><strong>{{ asset.name }}</strong><small>${{ asset.symbol }} · {{ kindLabel(asset.kind) }}</small></span>
          <span class="markets__quote"><strong>{{ usd(asset.market?.priceUsd) }}</strong><small :class="changeClass(asset.market?.priceChange?.h24)">{{ percent(asset.market?.priceChange?.h24) }}</small></span>
        </button>
        <div v-if="!visible.length" class="markets__state">{{ i18n.t('views.markets.noAssets') }}</div>
      </aside>
      <main v-if="selected" class="markets__detail">
        <header class="markets__token-head"><div><p class="bz-eyebrow">{{ kindLabel(selected.kind) }}</p><h2>{{ selected.name }} <span>${{ selected.symbol }}</span></h2></div><a v-if="selected.market?.url" class="bz-btn bz-btn--ghost bz-btn--sm" :href="selected.market.url" target="_blank">{{ i18n.t('views.markets.trade') }} <span class="material-symbols-outlined">open_in_new</span></a></header>
        <div ref="chartEl" class="markets__chart"></div>
        <div class="markets__metrics">
          <div><small>{{ i18n.t('views.markets.price') }}</small><strong>{{ usd(selected.market?.priceUsd) }}</strong></div><div><small>{{ i18n.t('views.markets.liquidity') }}</small><strong>{{ usd(selected.market?.liquidity?.usd) }}</strong></div><div><small>{{ i18n.t('views.markets.volume') }}</small><strong>{{ usd(selected.market?.volume?.h24) }}</strong></div><div><small>{{ i18n.t('views.markets.change') }}</small><strong :class="changeClass(selected.market?.priceChange?.h24)">{{ percent(selected.market?.priceChange?.h24) }}</strong></div>
        </div>
        <section class="markets__tokenomics">
          <h3>{{ i18n.t('views.markets.tokenomics') }}</h3>
          <div v-if="selected.kind === 'game'" class="markets__allocation markets__allocation--game"><span style="--size:100">100% creator issuance</span></div>
          <div v-else class="markets__allocation"><span style="--size:96">96% liquidity</span><span style="--size:4">4% creators</span></div>
          <p v-if="selected.kind === 'companion'">Swap fees route to the companion, owner, protocol, and contribution pools.</p>
          <p v-else-if="selected.kind === 'game'">The token is permanently linked to its registered game collectible. Distribution and liquidity remain explicit creator actions.</p>
          <p v-else>Model revenue follows the immutable contributor route recorded at launch.</p>
        </section>
        <footer><span class="bz-mono">{{ selected.address }}</span><span>1,000,000,000 fixed supply · {{ selected.kind === 'game' ? 'collectible-backed' : 'LP locked' }}</span></footer>
      </main>
      <main v-else class="markets__state">{{ i18n.t('views.markets.select') }}</main>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createChart, ColorType } from 'lightweight-charts'
import { loadMarkets } from '../services/markets.service.js'
import { useI18n } from '../i18n/index.js'
const i18n=useI18n()
const filters=computed(()=>[{id:'all',label:i18n.t('common.all')},{id:'companion',label:'Companions'},{id:'game',label:'Games'},{id:'fine_tuned',label:'Fine-tuned'},{id:'abliterated',label:'Abliterated'}])
const filter=ref('all'), assets=ref([]), selected=ref(null), loading=ref(true), error=ref(''), chartEl=ref(null); let chart
const visible=computed(()=>filter.value==='all'?assets.value:assets.value.filter(a=>a.kind===filter.value))
const usd=value=>value==null?'Not indexed':i18n.number(Number(value),{style:'currency',currency:'USD',maximumSignificantDigits:6})
const percent=value=>value==null?'—':new Intl.NumberFormat(i18n.state.locale,{style:'percent',signDisplay:'exceptZero',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)/100); const changeClass=value=>Number(value)>=0?'is-up':'is-down'
const kindLabel=kind=>({companion:'Companion',game:'Game',fine_tuned:'Fine-tuned model',abliterated:'Abliterated model'}[kind]||kind)
const assetIcon=kind=>({companion:'smart_toy',game:'sports_esports'}[kind]||'model_training')
async function refresh(){loading.value=true;error.value='';try{assets.value=await loadMarkets();selected.value=assets.value.find(a=>a.address===selected.value?.address)||assets.value[0]||null}catch(e){error.value=e.message}finally{loading.value=false}}
async function draw(){await nextTick();chart?.remove();chart=null;if(!chartEl.value||!selected.value)return;chart=createChart(chartEl.value,{height:280,layout:{background:{type:ColorType.Solid,color:'transparent'},textColor:'#8f8a9b'},grid:{vertLines:{color:'rgba(128,110,150,.12)'},horzLines:{color:'rgba(128,110,150,.12)'}},rightPriceScale:{borderVisible:false},timeScale:{borderVisible:false}});const series=chart.addAreaSeries({lineColor:'#a855f7',topColor:'rgba(168,85,247,.28)',bottomColor:'rgba(168,85,247,0)',lineWidth:2});let data=selected.value.history||[];if(data.length<2&&selected.value.market?.priceUsd){const now=Math.floor(Date.now()/1000);data=[{time:now-60,value:Number(selected.value.market.priceUsd)},{time:now,value:Number(selected.value.market.priceUsd)}]}series.setData(data);chart.timeScale().fitContent()}
watch(selected,draw);watch(filter,()=>{if(!visible.value.includes(selected.value))selected.value=visible.value[0]||null});onMounted(refresh);onBeforeUnmount(()=>chart?.remove())
</script>

<style scoped>
.markets { height: 100%; overflow: auto; padding: var(--bz-space-6); background: var(--bz-canvas); color: var(--bz-fg); }
.markets__header, .markets__token-head, .markets__filters { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-4); }
.markets__filters { justify-content: flex-start; margin: 0 0 var(--bz-space-3); border-bottom: 1px solid var(--bz-border); }
.markets__filters button { min-height: 36px; padding: 0; margin-right: var(--bz-space-4); border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--bz-fg-low); font: 600 var(--bz-size-meta) var(--bz-font-ui); cursor: pointer; }
.markets__filters button:hover, .markets__filters button.is-active { color: var(--bz-fg); }
.markets__filters button.is-active { border-color: var(--bz-purple-300); }
.markets__filters span { margin-left: auto; color: var(--bz-fg-low); font-size: var(--bz-size-meta); }
.markets__layout { display: grid; grid-template-columns: minmax(280px, 32%) minmax(0, 1fr); min-height: 600px; border: 1px solid var(--bz-border); border-radius: var(--bz-r); overflow: hidden; background: var(--bz-panel); }
.markets__list { border-right: 1px solid var(--bz-border); background: var(--bz-canvas); }
.markets__asset { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-3); width: 100%; min-height: 68px; padding: var(--bz-space-3); border: 0; border-bottom: 1px solid var(--bz-border); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.markets__asset:hover { background: var(--bz-card); }
.markets__asset.is-active { background: var(--bz-raised); box-shadow: inset 2px 0 var(--bz-purple-300); }
.markets__asset img, .markets__asset > .material-symbols-outlined { width: 40px; height: 40px; border-radius: var(--bz-r-sm); object-fit: cover; background: var(--bz-raised); display: grid; place-items: center; }
.markets__asset strong, .markets__asset small { display: block; }
.markets__asset strong { font-weight: 600; }
.markets__asset small { margin-top: 3px; color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.markets__quote { text-align: right; font-family: var(--bz-font-mono); }
.is-up { color: var(--bz-emerald-500) !important; }
.is-down, .is-error { color: var(--bz-danger) !important; }
.markets__detail { padding: var(--bz-space-5); min-width: 0; }
.markets__token-head h2 { margin: var(--bz-space-1) 0 0; font: italic 900 var(--bz-size-h1) 'Fira Sans Condensed', sans-serif; }
.markets__token-head h2 span { color: var(--bz-fg-low); font: 400 var(--bz-size-body) var(--bz-font-mono); }
.markets__chart { width: 100%; height: 280px; margin-top: var(--bz-space-5); }
.markets__metrics { display: grid; grid-template-columns: repeat(4, 1fr); margin: var(--bz-space-5) 0; border-block: 1px solid var(--bz-border); }
.markets__metrics div { padding: var(--bz-space-4); border-right: 1px solid var(--bz-border); }
.markets__metrics div:last-child { border-right: 0; }
.markets__metrics small, .markets__metrics strong { display: block; }
.markets__metrics small { color: var(--bz-fg-low); margin-bottom: var(--bz-space-2); font-size: var(--bz-size-micro); }
.markets__metrics strong { font-family: var(--bz-font-mono); font-size: var(--bz-size-h3); font-weight: 500; }
.markets__tokenomics h3 { margin: 0 0 var(--bz-space-3); font: 600 var(--bz-size-h3) var(--bz-font-ui); }
.markets__allocation { display: flex; height: 32px; overflow: hidden; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-canvas); }
.markets__allocation span { flex: var(--size); display: grid; place-items: center; min-width: 100px; background: var(--bz-purple-500); color: var(--bz-on-accent); font-size: var(--bz-size-micro); }
.markets__allocation span + span { background: var(--bz-raised); color: var(--bz-fg-mid); }
.markets__allocation--game span { background: var(--bz-emerald-700); }
.markets__tokenomics p { max-width: 65ch; margin: var(--bz-space-3) 0 0; color: var(--bz-fg-mid); line-height: 1.5; }
.markets__detail footer { display: flex; justify-content: space-between; gap: var(--bz-space-4); margin-top: var(--bz-space-6); padding-top: var(--bz-space-3); border-top: 1px solid var(--bz-border); color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.markets__state { display: grid; place-items: center; min-height: 240px; padding: var(--bz-space-6); color: var(--bz-fg-low); }
@media (max-width: 900px) { .markets__layout { grid-template-columns: 1fr; } .markets__list { border-right: 0; border-bottom: 1px solid var(--bz-border); } .markets__metrics { grid-template-columns: 1fr 1fr; } }
</style>
