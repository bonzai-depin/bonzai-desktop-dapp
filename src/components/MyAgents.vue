<template>
  <section class="owned-agents" data-i18n-skip>
    <header><span class="bz-meta">{{ $ui('My Agents') }}</span><button class="bz-btn bz-btn--ghost" :disabled="loading" @click="refresh">{{ $ui('Refresh') }}</button></header>
    <p v-if="loading" role="status">{{ $ui('Loading wallet agents…') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="!rows.length && !loading" class="owned-agents__empty"><span class="material-symbols-outlined">groups</span><h2 class="bz-h2">{{ $ui('Your agents start here') }}</h2><button class="bz-btn bz-btn--primary" @click="$emit('create')">{{ $ui('Create Agent') }}</button></div>
    <div v-if="rows.length" class="owned-agents__collection">
      <div class="owned-agents__summary"><h2 class="bz-h2">{{ $ui('Your collection') }}</h2><span>{{ rows.length }} {{ $ui('agents') }}</span></div>
      <div class="owned-agents__list">
        <article v-for="agent in rows" :key="agent.key" :class="{'is-empty-slot': !agent.ready}">
          <div class="owned-agents__portrait">
            <img v-if="portrait(agent)" :src="portrait(agent)" :alt="agent.name" @error="failedImages[agent.key] = true" />
            <template v-else><img class="owned-agents__slot-art" src="../assets/bonzai-knowledge/intelligence.webp" alt="" /><span class="material-symbols-outlined owned-agents__slot-icon">{{ agent.ready ? 'person' : 'add' }}</span></template>
            <span class="owned-agents__serial">{{ agent.localOnly ? $ui("On this device") : "#" + agent.tokenId }}</span>
            <span class="owned-agents__status">{{ $ui(agent.localOnly ? 'Local agent' : agent.tokenAddress ? 'Token launched' : agent.ready ? 'Identity published' : 'Ready to personalize') }}</span>
          </div>
          <div class="owned-agents__body">
            <div class="owned-agents__identity"><h2>{{ agent.ready ? agent.name : $ui('Unwritten identity') }}</h2><span>{{ agent.ready ? (agent.symbol ? '$' + agent.symbol : $ui('Personalized agent')) : $ui('Your minted NFT slot') }}</span></div>
            <div v-if="!agent.localOnly" class="owned-agents__cap"><span>{{ $ui('Social token market cap') }}</span><strong class="bz-metric">{{ capLabel(agent) }}</strong></div>
            <button v-if="agent.local && agent.tokenAddress" class="bz-btn bz-btn--primary" @click="$emit('augment', agent.local)">{{ $ui('Augment') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
            <template v-else-if="agent.localOnly"><button class="bz-btn bz-btn--primary" @click="$emit('use', agent.local)">{{ $ui('Use agent') }}</button><button class="bz-btn bz-btn--secondary" @click="$emit('staff', agent.local)">{{ $ui('Add to team') }}</button></template>
            <button v-else class="bz-btn" :class="agent.ready ? 'bz-btn--secondary' : 'bz-btn--primary'" @click="$emit('setup', agent)">{{ $ui('Set up agent') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
          </div>
        </article>
      </div>
      <p v-if="rows.some(a => a.tokenAddress)" class="bz-meta">{{ $ui('Market data: DexScreener · USD') }}</p>
    </div>
  </section>
</template>
<script setup>
import { companionAvatar } from '../services/company/presentation.js';
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { web3Service } from '../services/web3.service.js';
import { CONFIG } from '../config/web3.config.js';
import companionTokenService from '../services/companionToken.service.js';
import { marketFor } from '../services/markets.service.js';
import { agentCollectionRows, agentMarketCap } from '../services/ownedAgents.js';
const props = defineProps({ agents: { type: Array, default: () => [] } });
defineEmits(['augment', 'create', 'setup', 'use', 'staff']);
const wallet = computed(() => web3Service.state.walletAddress);
const configured = computed(() => Boolean(CONFIG.smartAgentIssuance.contractAddress));
const holdings = ref([]), caps = ref({}), loading = ref(false), error = ref('');
const failedImages = ref({});
function portrait(agent) {
  if (failedImages.value[agent.key]) return '';
  const source = agent.image || agent.local?.picture || agent.local?.image || '';
  const value = source.startsWith('ipfs://') ? source : companionAvatar({ ...agent.local, image: source }) || '';
  if (typeof value !== 'string') return '';
  if (value.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${value.slice(7)}`;
  return /^(https?:|data:image\/|blob:|bonzai-blob:|file:|\/)/.test(value) ? value : '';
}
const rows = computed(() => agentCollectionRows(holdings.value, props.agents));
let revision = 0, controller;
function capLabel(agent) {
  if (!agent.tokenAddress) return '—';
  const value = caps.value[agent.tokenAddress];
  return value == null ? '—' : new Intl.NumberFormat(undefined, {style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
}
async function connect() { try { await web3Service.connectWallet(); } catch { error.value = 'Wallet connection could not be completed. Please try again.'; } }
async function refresh() {
  const run = ++revision; controller?.abort(); controller = new AbortController(); const signal = controller.signal;
  holdings.value = []; caps.value = {}; error.value = ''; loading.value = false;
  if (!wallet.value || !configured.value) return;
  loading.value = true;
  try {
    const result = await companionTokenService.getOwnedAgentSlots({includeIssued:true});
    if (run !== revision) return;
    holdings.value = result; loading.value = false;
    // Market lookup failure never hides an owned agent or invents a zero valuation.
    for (const agent of result) {
      if (run !== revision) return;
      if (!agent.tokenAddress) continue;
      try { const pair = await marketFor(agent.tokenAddress, 6000, signal); if (run === revision) caps.value[agent.tokenAddress] = agentMarketCap(pair); } catch { /* Unindexed pools have no reported market cap. */ }
    }
  } catch { if (run === revision) error.value = 'Your agents could not be loaded. Check your connection and try again.'; }
  finally { if (run === revision) loading.value = false; }
}
watch(wallet, refresh, {immediate:true});
onBeforeUnmount(() => { revision++; controller?.abort(); });
</script>
<style scoped>
.owned-agents{display:grid;gap:24px;color:var(--bz-fg)}.owned-agents>header,.owned-agents__summary{display:flex;align-items:center;justify-content:space-between;gap:16px}.owned-agents__empty{display:grid;justify-items:center;gap:16px;padding:56px 24px;text-align:center}.owned-agents__empty>.material-symbols-outlined{font-size:40px;color:var(--bz-accent)}.owned-agents h2,.owned-agents p{margin:0}.owned-agents__collection{display:grid;gap:24px}.owned-agents__summary>span{color:var(--bz-fg-mid);font-size:14px}.owned-agents__list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px}.owned-agents article{min-width:0;overflow:hidden;border:1px solid var(--bz-border);border-radius:var(--bz-r-md);background:var(--bz-panel)}.owned-agents__portrait{aspect-ratio:1;position:relative;overflow:hidden;background:var(--bz-canvas)}.owned-agents__portrait>img{width:100%;height:100%;object-fit:cover;object-position:center}.owned-agents__portrait>.owned-agents__slot-art{opacity:.28}.owned-agents__slot-icon{position:absolute;inset:0;width:100%;height:100%;display:grid;place-items:center;font-size:64px;color:var(--bz-accent)}.owned-agents__serial,.owned-agents__status{position:absolute;background:var(--bz-panel);color:var(--bz-fg);padding:6px 10px;border:1px solid var(--bz-border);border-radius:var(--bz-r-sm);font-size:12px}.owned-agents__serial{top:12px;left:12px}.owned-agents__status{bottom:12px;left:12px}.owned-agents__body{display:grid;gap:18px;padding:20px}.owned-agents__identity h2{font:900 italic 26px/1.2 var(--bz-font-metric);overflow-wrap:anywhere;margin-bottom:6px}.owned-agents__identity>span{color:var(--bz-fg-mid);font-size:13px}.owned-agents__cap{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:16px;border-top:1px solid var(--bz-border)}.owned-agents__cap>span{color:var(--bz-fg-mid);font-size:12px}.owned-agents__cap strong{font-size:24px}.owned-agents__body>.bz-btn{justify-content:space-between;width:100%}@media(max-width:600px){.owned-agents__summary{align-items:flex-start;flex-direction:column}.owned-agents__list{grid-template-columns:1fr}}
</style>
