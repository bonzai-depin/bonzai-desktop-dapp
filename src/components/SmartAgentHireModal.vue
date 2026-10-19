<template>
  <Teleport to="body">
    <div class="bz-modal-overlay" @click.self="close">
      <section ref="dialog" class="bz-modal hire-modal" role="dialog" aria-modal="true" aria-label="Hire smart agent">
        <header class="bz-modal__header"><div><p class="bz-eyebrow">Hire smart agent</p><h2 class="bz-h2">{{ agent.name }}</h2></div><BzCloseButton aria-label="Close hiring" :disabled="busy" @click="close" /></header>
        <div class="hire-body">
          <template v-if="result">
            <p role="status">{{ result.status === 'failed' ? 'The funding transaction failed.' : result.status === 'pending' ? 'Job submitted. Waiting for confirmation.' : 'Job funded. Awaiting the smart agent’s acceptance.' }}</p>
            <p class="hire-reference bz-mono">{{ result.jobId }}</p>
            <p class="hire-reference bz-mono">{{ result.txHash }}</p>
            <p v-if="result.confirmationError" class="hire-error" role="alert">{{ result.confirmationError }}</p>
            <p v-if="result.storageError" class="hire-error" role="alert">{{ result.storageError }}</p>
            <button class="bz-btn bz-btn--primary" @click="close">Done</button>
          </template>
          <template v-else>
            <p v-if="!configured" role="status">Smart-agent job settlement is not configured on this network.</p>
            <button v-else-if="!wallet" class="bz-btn bz-btn--primary" @click="requestConnection">{{ $t('common.connect') }}</button>
            <p v-else-if="loading" role="status">{{ $t('common.loading') }}</p>
            <form v-else-if="quote" @submit.prevent="reviewing ? fund() : review()">
              <label>Desired outcome<input v-model="form.title" required :readonly="reviewing" placeholder="Reconcile this month’s invoices" /></label>
              <label>Scope and acceptance criteria<textarea v-model="form.outcome" required :readonly="reviewing" placeholder="Describe the work, permitted data, deliverables, and how success will be checked." /></label>
              <label>Job payment ({{ quote.symbol }})<input v-model="form.amount" required inputmode="decimal" :readonly="reviewing" placeholder="0.00" /></label>
              <label>Pay with<select v-model="form.paymentMethod" :disabled="reviewing || busy"><option value="social">{{ quote.symbol }}</option><option value="usdc" :disabled="!usdcConfigured">USDC · convert automatically</option></select></label>
              <p v-if="form.paymentMethod==='usdc'" class="bz-meta">Only the missing agent tokens are purchased. The swap and escrow are separate wallet confirmations. If funding stops, purchased tokens stay in your wallet. Refunds are in {{ quote.symbol }}.</p>
              <p v-if="reviewing && checkout && checkout.output!=='0'" class="hire-review">USDC estimate: {{ formatUsdc(checkout.input) }} · Maximum: {{ formatUsdc(checkout.maximumInput) }} · 0.5% slippage · Quote valid for 10 minutes. Network fees are additional.</p>
              <label v-if="execution">{{ $ui('Requesting agent wallet (optional)') }}<input v-model="form.executionCaller" :readonly="reviewing" placeholder="0x…" /></label>
              <div class="hire-terms">
                <span>Currency</span><strong>{{ quote.symbol }}</strong>
                <span>Treasury</span><strong>{{ quote.treasuryBps / 100 }}%</strong>
                <span>BONZAI holder rewards</span><strong>{{ quote.holderBps / 100 }}%</strong>
                <span>Provider</span><strong>{{ (10000 - quote.platformBps - (quote.routeAssetId !== zeroHash ? quote.contributionBps : 0)) / 100 }}%</strong>
                <template v-if="quote.routeAssetId !== zeroHash"><span>Contributor royalties</span><strong>{{ quote.contributionBps / 100 }}%</strong></template>
                <span>Accept within</span><strong>{{ quote.acceptWindow / 86400 }} days</strong>
                <span>Deliver after acceptance</span><strong>{{ quote.deliveryWindow / 86400 }} days</strong>
                <span>Review after delivery</span><strong>{{ quote.reviewWindow / 86400 }} days</strong>
                <span>Dispute resolution</span><strong>{{ quote.disputeWindow / 86400 }} days</strong>
                <span>Arbitrator</span><strong class="bz-mono" :title="quote.arbitrator">{{ shortAddress(quote.arbitrator) }}</strong>
              </div>
              <p class="bz-meta">Payment stays in escrow until settlement. Refunds return the same token. Unreviewed delivery is paid after the review deadline.</p>
              <p class="bz-meta">An unresolved dispute pays submitted work to the agent; otherwise it refunds the employer after the dispute deadline.</p>
              <p v-if="reviewing" class="hire-review">{{ form.amount }} {{ quote.symbol }} will be placed in escrow. Your wallet will request token approval if needed, then job funding.</p>
              <div class="hire-actions">
                <button v-if="reviewing" type="button" class="bz-btn bz-btn--ghost" :disabled="busy" @click="reviewing = false">{{ $t('common.back') }}</button>
                <button class="bz-btn bz-btn--primary" type="submit" :disabled="busy">{{ busy ? 'Waiting for wallet…' : reviewing ? 'Fund job' : 'Review job' }}</button>
              </div>
            </form>
            <p v-if="error" class="hire-error" role="alert">{{ error }}</p>
            <button v-if="error && !quote && configured && wallet" class="bz-btn bz-btn--ghost" :disabled="loading" @click="load">{{ $t('common.retry') }}</button>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue';
import { ethers } from 'ethers';
import { stablecoinCheckoutConfigured, quoteWorkflowCheckout } from '../services/workflowCheckout.js';
import { smartAgentJobsConfigured, fetchSmartAgentQuote, fundSmartAgentJob } from '../services/smartAgentJobs.service.js';
import { buildSmartAgentJobTerms } from '../services/smartAgentJobTerms.js';
import { web3Service } from '../services/web3.service.js';
import { requestConnection } from '../services/connectionDialog.service.js';
import { useModalAccessibility } from '../composables/useModalAccessibility.js';
import BzCloseButton from './BzCloseButton.vue';
import { withTimeout } from '../utils/withTimeout.js';

const props = defineProps({ agent: { type: Object, required: true }, companyId: { type: String, default: '' }, execution: { type: Object, default: null } });
const emit = defineEmits(['close', 'hired']);
const dialog = ref(null), quote = ref(null), result = ref(null), loading = ref(false), busy = ref(false), error = ref(''), reviewing = ref(false);
const form = reactive({ title: '', outcome: '', amount: '', executionCaller: '', paymentMethod: 'social' });
const usdcConfigured=stablecoinCheckoutConfigured(),checkout=ref(null);
const formatUsdc=value=>ethers.formatUnits(value,6);
const configured = computed(smartAgentJobsConfigured);
const wallet = computed(() => web3Service.state.walletAddress);
const zeroHash = ethers.ZeroHash;
let revision = 0;
useModalAccessibility(dialog, { onClose: close });
function close() { if (!busy.value) emit('close'); }
const shortAddress = value => `${value.slice(0, 8)}…${value.slice(-6)}`;
async function load() {
  const current = ++revision;
  quote.value = null; reviewing.value = false; error.value = '';
  if (!configured.value || !wallet.value) { loading.value = false; return; }
  loading.value = true;
  try { const next = await withTimeout(fetchSmartAgentQuote(props.agent), 15000); if (current === revision) quote.value = next; }
  catch (failure) { if (current === revision) error.value = failure.shortMessage || failure.message; }
  finally { if (current === revision) loading.value = false; }
}
async function review() {
  if(busy.value)return;error.value='';busy.value=true;checkout.value=null;
  const account=wallet.value,rev=revision;
  try { buildSmartAgentJobTerms(quote.value, { ...form, execution: props.execution, executionPeer: props.agent.peerId });
    const result=form.paymentMethod==='usdc'?await quoteWorkflowCheckout(quote.value,form.amount,account):null;
    if(rev===revision&&wallet.value===account){checkout.value=result;reviewing.value=true;}
  } catch(failure){error.value=failure.message;} finally{busy.value=false;}
}
async function fund() {
  if (busy.value || !reviewing.value || !quote.value) return;
  busy.value = true; error.value = '';
  try { result.value = await fundSmartAgentJob(props.agent, quote.value, { ...form, checkout: checkout.value, execution: props.execution, executionPeer: props.agent.peerId, companyId: props.companyId, expectedWallet: wallet.value }); emit('hired', result.value); }
  catch (failure) { error.value = failure.shortMessage || failure.message; reviewing.value = false; }
  finally { busy.value = false; }
}
watch([wallet, () => props.agent.tokenId], load, { immediate: true });
onBeforeUnmount(() => { revision++; });
</script>

<style scoped>
.hire-modal { width: min(580px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; }
.hire-modal h2 { margin: 0; }
.hire-body { padding: var(--bz-space-5); }
.hire-body form { display: grid; gap: var(--bz-space-4); }
.hire-body label { display: grid; gap: var(--bz-space-2); font-size: var(--bz-size-caption); color: var(--bz-fg-mid); }
.hire-body input, .hire-body textarea, .hire-body select { width: 100%; min-height: 42px; padding: var(--bz-space-3); background: var(--bz-panel); color: var(--bz-fg); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-radius-sm); }
.hire-body textarea { min-height: 96px; resize: vertical; }
.hire-terms { display: grid; grid-template-columns: 1fr auto; gap: var(--bz-space-2); font-size: var(--bz-size-caption); }
.hire-terms > span { color: var(--bz-fg-mid); }
.hire-terms strong { color: var(--bz-fg); text-align: right; overflow-wrap: anywhere; }
.hire-actions { display: flex; justify-content: flex-end; gap: var(--bz-space-3); }
.hire-error { color: var(--bz-danger); overflow-wrap: anywhere; }
.hire-review { border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-3); }
.hire-reference { overflow-wrap: anywhere; }
</style>
