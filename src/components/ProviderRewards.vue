<template>
  <section class="provider-rewards" aria-label="Inference provider rewards">
    <h3 class="rewards-section-title"><span class="material-symbols-outlined" aria-hidden="true">memory</span>Inference Provider Rewards</h3>
    <p>Generation service earns a share of funded pools through independently verified service receipts. Local timing records are not claimable balances. Workflow payments are managed separately in Smart Workflows.</p>
    <button class="bz-btn bz-btn--ghost" @click="openProtocolGuide('provider')">Provider Guide</button>
    <p v-if="!configured">Provider reward contracts are not configured on {{ network.name }}.</p>
    <p v-else-if="!wallet">Connect the wallet that served requests to check its rewards.</p>
    <template v-else>
      <div class="provider-rewards__tools"><label>Reward period<input v-model="period" type="number" min="0" step="1" :max="data?.current" placeholder="Latest closed" :disabled="busy" /></label><button class="bz-btn bz-btn--ghost" :disabled="busy" @click="refresh">{{ busy ? 'Loading…' : 'Check Provider Rewards' }}</button></div>
      <template v-if="data"><p v-if="data.paused">Claims are paused pending verified service receipts.</p><p v-else-if="!data.finalized">This period has not been finalized. Claims are not available yet.</p><p v-else>Period {{ data.epoch }} · earned rewards remain claimable after unstaking, with no expiry.</p>
        <div v-for="row in data.rows" :key="row.pool" class="provider-rewards__row"><strong>{{ row.label }}</strong><span>{{ row.seconds }} verified seconds</span><span>{{ row.claimed ? 'Claimed' : `${row.amount} ${network.currency.symbol}` }}</span><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy || !row.canClaim || pending" @click="claim(row)">Claim</button></div>
      </template>
    </template>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="transaction" role="status"><a :href="`${network.explorer}/tx/${transaction}`" target="_blank" rel="noopener noreferrer">View {{ pending ? 'submitted' : 'confirmed' }} transaction ↗</a></p>
  </section>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { web3Service } from '../services/web3.service.js';
import { fetchProviderRewards, claimProviderRewards, isConfigured } from '../services/serviceTime.service.js';
import { openProtocolGuide } from '../services/protocolNavigation.js';
const network = CONFIG.networks[ECONOMY_NETWORK_KEY], configured = isConfigured() && Boolean(CONFIG.mintPool?.contractAddress);
const wallet = computed(() => web3Service.state.walletAddress), period = ref(''), data = ref(null), error = ref(''), busy = ref(false), transaction = ref(''), pending = ref(false);
let revision = 0;
async function refresh() {
  if (!wallet.value || !configured || busy.value) return;
  const request = ++revision; busy.value = true; error.value = '';
  try { if (pending.value && transaction.value) { const receipt = await (await web3Service.getProvider(ECONOMY_NETWORK_KEY)).getTransactionReceipt(transaction.value); if (request !== revision) return; if (receipt) { pending.value = false; if (Number(receipt.status) === 0) error.value = 'Transaction reverted.'; } } const result = await fetchProviderRewards(wallet.value, period.value === '' ? undefined : Number(period.value)); if (request === revision) { data.value = result; period.value = result.epoch; } }
  catch (e) { if (request === revision) { data.value = null; error.value = e.message; } }
  finally { if (request === revision) busy.value = false; }
}
async function claim(row) {
  if (busy.value || pending.value || !row.canClaim) return;
  const expectedWallet = wallet.value; let confirmed = false; busy.value = true; error.value = '';
  try { const receipt = await claimProviderRewards(data.value.epoch, row.pool, expectedWallet); if (wallet.value === expectedWallet) { transaction.value = receipt.hash; confirmed = true; } }
  catch (e) { if (wallet.value === expectedWallet) { error.value = e.message; if (e.transactionHash) { transaction.value = e.transactionHash; pending.value = true; } } }
  finally { busy.value = false; }
  if (confirmed) await refresh();
}
watch(wallet, () => { ++revision; busy.value = false; data.value = null; error.value = ''; transaction.value = ''; pending.value = false; });
</script>
<style scoped>
.provider-rewards { margin:32px 0; border-top:1px solid var(--bz-border); padding-top:24px; }.provider-rewards p { margin:14px 0; color:var(--bz-fg-mid); line-height:1.6; }.provider-rewards__tools,.provider-rewards__row { display:flex; flex-wrap:wrap; gap:16px; align-items:center; padding:12px 0; }.provider-rewards__tools label { display:grid; gap:8px; }.provider-rewards input { padding:10px; width:160px; color:var(--bz-fg); background:var(--bz-panel); border:1px solid var(--bz-border); border-radius:8px; }.provider-rewards__row { border-bottom:1px solid var(--bz-border); }.provider-rewards__row strong { min-width:80px; }.provider-rewards__row button { margin-left:auto; }

.rewards-section-title{display:flex;align-items:center;gap:12px;font-family:var(--bz-font-metric);font-weight:900;font-style:italic;font-size:26px;line-height:1.2;margin:0 0 16px}.rewards-section-title>span{font-size:24px;color:var(--bz-accent);font-variation-settings:'wght' 200}section>p{max-width:85ch;margin:12px 0 20px}details{border-top:1px solid var(--bz-border);padding:20px 0;margin-top:16px}summary{cursor:pointer;font-weight:600;padding:4px 0 12px;font-size:16px}details p{max-width:85ch;margin:12px 0 16px}details button{margin-top:8px}details label{display:grid;gap:8px}input{box-sizing:border-box}section{padding-bottom:24px}@media(max-width:600px){.rewards-section-title{font-size:22px}details{padding:16px 0}}
</style>
