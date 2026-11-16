<template>
  <section class="liquidity-fees" aria-label="Trading fees">
    <div class="liquidity-fees__heading"><div><p class="bz-eyebrow">Locked Liquidity</p><h3>Trading fees</h3></div><button class="bz-btn bz-btn--ghost" :disabled="busy || loading" aria-label="Refresh fee balances" @click="refresh">Refresh</button></div>
    <p v-if="loading" role="status">Loading fee balances…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-if="info">
      <p>1% trading fee · {{ kind === 'companion' ? '35% agent wallet / 35% NFT owner / 20% treasury / 10% rewards' : '70% creator / 20% treasury / 10% rewards' }}</p>
      <button class="bz-btn bz-btn--primary" :disabled="busy || loading || pending || !wallet" @click="act('collect')">{{ busy ? 'Confirming transaction…' : 'Collect pool fees' }}</button>
      <p>Anyone can collect. Principal stays locked; fees are credited to their beneficiaries.</p>
      <label v-if="wallet">Fee receiving wallet<input v-model="recipient" class="bz-input" placeholder="0x…" :disabled="busy" /></label>
      <div v-for="currency in info.currencies" :key="currency.address" class="liquidity-fees__currency">
        <strong>{{ currency.symbol }}</strong><span>{{ wallet ? `${currency.amount} claimable in this vault` : 'Connect your wallet to see your share' }}</span>
        <button class="bz-btn bz-btn--ghost" :disabled="busy || loading || pending || !wallet || currency.claimable === 0n" @click="act('claim',currency.address)">Claim my fees</button>
        <span>{{ currency.rewardAmount }} pending rewards</span><button class="bz-btn bz-btn--ghost" :disabled="busy || loading || pending || !wallet || currency.rewards === 0n" @click="act('rewards',currency.address)">Deposit rewards</button>
      </div>
      <button v-if="!wallet" class="bz-btn bz-btn--ghost" :disabled="busy" @click="connect">Connect wallet</button>

    </template>
    <p v-else-if="!loading && !error">No registered liquidity position.</p>
    <p v-if="transaction" role="status"><a :href="`${explorer}/tx/${transaction}`" target="_blank" rel="noopener noreferrer">View {{ pending ? "submitted" : "confirmed" }} transaction ↗</a><span v-if="pending"> · Refresh to check confirmation before trying again.</span></p>
  </section>
</template>
<script setup>
import { CONFIG, ECONOMY_NETWORK_KEY } from '../../config/web3.config.js';
const explorer = CONFIG.networks[ECONOMY_NETWORK_KEY].explorer;
import {computed,ref,watch} from 'vue';
import {web3Service} from '../../services/web3.service.js';
import {getLiquidityVault,transactLiquidityFees} from '../../services/liquidityVault.service.js';
const props=defineProps({token:{type:String,required:true},kind:{type:String,required:true}});
const wallet = computed(() => web3Service.state.walletAddress);
const recipient = ref('');
const info = ref(null), error = ref(''), busy = ref(false), loading = ref(false), transaction = ref(''), pending = ref(false);
let revision = 0;
async function refresh() {
  const current = ++revision;
  loading.value = true; error.value = ''; info.value = null;
  try {
    if (pending.value && transaction.value) {
      const receipt = await (await web3Service.getProvider(ECONOMY_NETWORK_KEY)).getTransactionReceipt(transaction.value);
      if (current !== revision) return;
      if (receipt) { pending.value = false; if (Number(receipt.status) === 0) error.value = 'Transaction reverted.'; }
    }
    const result = await getLiquidityVault(props.token, props.kind, wallet.value);
    if (current === revision) info.value = result;
  } catch (e) { if (current === revision) error.value = e.shortMessage || e.message; }
  finally { if (current === revision) loading.value = false; }
}
async function act(action, currency) {
  if (busy.value || loading.value || pending.value || !wallet.value) return;
  const current = revision, expectedWallet = wallet.value;
  busy.value = true; error.value = '';
  try {
    const hash = await transactLiquidityFees({ token:props.token, kind:props.kind, action, currency, expectedWallet, recipient: recipient.value });
    if (current !== revision) return;
    transaction.value = hash;
    await refresh();
  } catch (e) {
    if (current === revision) { error.value = e.message; if (e.confirmationPending && e.transactionHash) { transaction.value = e.transactionHash; pending.value = true; } }
  } finally { busy.value = false; }
}
async function connect() { try { await web3Service.connectWallet(); } catch (e) { error.value = e.message; } }
watch(() => [props.token, props.kind, wallet.value], () => { recipient.value = wallet.value || ''; info.value = null; transaction.value = ''; pending.value = false; refresh(); }, { immediate:true });
</script>
<style scoped>
.liquidity-fees{grid-column:1/-1;border-top:1px solid var(--bz-border);padding:24px 0;min-width:0;overflow-wrap:anywhere}.liquidity-fees__heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.liquidity-fees h3{margin:4px 0 16px}.liquidity-fees p{margin:12px 0}.liquidity-fees__currency{display:flex;align-items:center;flex-wrap:wrap;gap:16px;padding:16px 0}
</style>
