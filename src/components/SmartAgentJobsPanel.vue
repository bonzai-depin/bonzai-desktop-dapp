<template>
  <section v-if="wallet" class="agent-jobs-panel">
    <header><h3 class="bz-h3">{{ ui("Jobs & Payments") }}</h3><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="loading || busy" @click="refresh">{{ $t('common.refresh') }}</button></header>
    <button class="bz-btn bz-btn--ghost bz-btn--sm" @click="openProtocolGuide('jobs')">Workflow Payment Guide</button>
    <p v-if="!records.length && !loading" class="bz-meta">{{ ui("No paid jobs on this device. Local team agents can keep working without a wallet or mint.") }}</p>
    <section v-if="incoming.length" class="agent-job__body" aria-label="Incoming worker assignments">
      <h4 class="bz-h4">{{ ui("Incoming assignments") }}</h4>
      <article v-for="entry in incoming" :key="entry.id" class="agent-job">
        <strong>{{ entry.packet.terms.title }}</strong>
        <p>{{ entry.packet.delivery ? 'Delivery received for review' : entry.packet.terms.outcome }}</p>
        <p class="bz-meta">{{ ui("Unverified brief · review against escrow before accepting.") }}</p>
        <div class="agent-job__actions">
          <select v-if="!entry.packet.delivery" v-model="incomingAgent[entry.id]" aria-label="Receiving smart agent">
            <option value="">{{ ui("Choose your smart agent") }}</option>
            <option v-for="agent in localAgents" :key="agent.id" :value="agent.id">{{ agent.name }}</option>
          </select>
          <button class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy || (!entry.packet.delivery && !incomingAgent[entry.id])" @click="receive(entry)">{{ ui("Verify and import") }}</button>
          <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="dismiss(entry)">{{ ui("Dismiss") }}</button>
        </div>
      </article>
    </section>
    <p v-if="error" class="job-error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">{{ $t('common.loading') }}</p>
    <section v-if="royalties.length" class="agent-job-royalties" aria-label="Contributor royalties">
      <h4 class="bz-h4">Contributor royalties</h4>
      <p class="bz-meta">These route earnings are separate from smart-agent payments and BONZAI staking rewards. Each balance includes all payments to its contribution route.</p>
      <div v-for="royalty in royalties" :key="royalty.key" class="agent-job-royalties__row">
        <div><strong>{{ royalty.agentName }}</strong><small class="bz-mono">{{ royalty.assetId }}</small></div>
        <p v-if="royalty.failure" class="job-error" role="alert">{{ royalty.failure }}</p>
        <template v-else>
          <span class="bz-mono bz-metric">{{ royalty.amount }} {{ royalty.symbol }}</span>
          <button class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy || loading" @click="claimRoyalty(royalty)">Claim royalties</button>
        </template>
      </div>
    </section>
    <article v-for="record in records" :key="record.jobId" class="agent-job">
      <details>
        <summary><span><strong>{{ record.terms.title }}</strong><small>{{ record.agentName }}</small></span><span class="bz-mono bz-metric">{{ record.amount }} {{ record.symbol }}</span><span>{{ statusLabel(record) }}</span></summary>
        <div class="agent-job__body">
          <p>{{ record.terms.outcome }}</p>
          <p class="bz-meta bz-mono">{{ record.jobId }}</p>
          <p v-if="record.failure" class="job-error" role="alert">{{ record.failure }}</p>
          <template v-if="record.live">
            <p v-if="deadline(record)" class="bz-meta">Deadline: {{ i18n.date(deadline(record) * 1000) }}</p>
            <p v-if="record.live.evidenceHash !== zeroHash" class="bz-meta bz-mono">Evidence: {{ record.live.evidenceHash }}</p>
            <form v-if="isEmployer(record) && record.live.status === 1" class="agent-job__evidence" @submit.prevent="send(record)">
              <label>{{ ui("Worker peer ID") }}<input v-model="peers[record.jobId]" required placeholder="Peer ID or multiaddress" /></label>
              <p class="bz-meta">{{ ui("Shares only this job’s agreed brief with the selected peer. No company memory or credentials are included.") }}</p>
              <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" type="submit">{{ ui("Send brief to worker") }}</button>
              <p v-if="record.handoff?.status === 'received'" role="status">{{ ui("Brief received by peer. Acceptance is a separate step.") }}</p>
            </form>
            <div class="agent-job__actions">
              <button v-if="workerAgent(record) && record.live.status === 2 && charter" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy" @click="queue(record)">{{ record.issueId ? 'Linked to backlog' : 'Add work to backlog' }}</button>
              <button v-if="isWorker(record) && record.live.status === 1" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy" @click="act(record, 'acceptJob')">Accept job</button>
              <button v-if="isEmployer(record) && record.live.status === 1" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="act(record, 'cancelJob')">Cancel and refund</button>
              <button v-if="isEmployer(record) && record.live.status === 3" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy" @click="act(record, 'approveWork')">Approve and pay</button>
              <button v-if="deadline(record) && deadline(record) < now" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="act(record, 'expireJob')">Settle expired job</button>
              <button v-if="BigInt(record.live.withdrawable) > 0n" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy" @click="withdraw(record)">Withdraw {{ tokenAmount(record.live.withdrawable, record.decimals) }} {{ record.symbol }}</button>
              <button v-if="record.agentId && !isWorker(record) && record.live.status === 1" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="requestAgentAction(record, 'smartAgent.acceptJob')">Review agent acceptance</button>
              <button v-if="record.agentId && !isWorker(record) && BigInt(record.live.workerWithdrawable || 0) > 0n" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="requestAgentAction(record, 'smartAgent.withdrawEarnings')">Review agent earnings withdrawal</button>
            </div>
            <form v-if="(isWorker(record) || isEmployer(record)) && [2, 3].includes(record.live.status) && deadline(record) >= now" class="agent-job__evidence" @submit.prevent="act(record, isWorker(record) && record.live.status === 2 && !disputing[record.jobId] ? 'submitWork' : 'raiseDispute', notes[record.jobId])">
              <label>{{ isWorker(record) && record.live.status === 2 && !disputing[record.jobId] ? 'Delivery evidence' : 'Dispute reason' }}<textarea v-model="notes[record.jobId]" required placeholder="Describe the evidence or reason. Only its hash is published onchain." /></label>
              <div class="agent-job__actions">
                <label v-if="isWorker(record) && record.live.status === 2"><input v-model="disputing[record.jobId]" type="checkbox" /> Raise a dispute instead</label>
                <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" type="submit">{{ isWorker(record) && record.live.status === 2 && !disputing[record.jobId] ? 'Submit work' : 'Raise dispute' }}</button>
              </div>
            </form>
            <form v-if="record.agentId && !isWorker(record) && record.live.status === 2 && deadline(record) >= now" class="agent-job__evidence" @submit.prevent="requestAgentAction(record, 'smartAgent.submitResult', notes[record.jobId])">
              <label>Agent delivery evidence<textarea v-model="notes[record.jobId]" required placeholder="Deliverable reference and evidence for review" /></label>
              <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" type="submit">Review agent submission</button>
            </form>
            <form v-if="workerAgent(record) && [3, 4].includes(record.live.status)" class="agent-job__evidence" @submit.prevent="sendDelivery(record)">
              <label>{{ ui("Customer peer ID") }}<input v-model="peers[record.jobId]" required /></label>
              <label>{{ ui("Submitted deliverable") }}<textarea v-model="notes[record.jobId]" required placeholder="Exact text or reference submitted to escrow" /></label>
              <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" type="submit">{{ ui("Send delivery to customer") }}</button>
            </form>
            <CompanyMarkdown v-if="record.delivery?.detail" :source="record.delivery.detail" />
            <p v-if="record.live.status === 6" class="bz-meta">Dispute awaiting arbitration. The published terms determine settlement if its deadline expires.</p>
          </template>
        </div>
      </details>
    </article>
  </section>
</template>

<script setup>
import { operationText } from '../i18n/operations.js';
import CompanyMarkdown from './company/CompanyMarkdown.vue';
import { loadSmartAgents, smartAgentCatalog } from '../services/smartAgentCatalog.js';
import { sendSmartAgentJob, importSmartAgentJob, queueSmartAgentJob, sendSmartAgentDelivery, importSmartAgentDelivery } from '../services/smartAgentJobs.service.js';
import { computed, reactive, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { ethers } from 'ethers';
import { web3Service } from '../services/web3.service.js';
import { openProtocolGuide } from '../services/protocolNavigation.js';
import { listSmartAgentJobs, fetchSmartAgentJob, actOnSmartAgentJob, withdrawSmartAgentPayment, smartAgentJobsConfigured, knownSmartAgentRoyaltyRoutes } from '../services/smartAgentJobs.service.js';
import { getTokenRoyaltyEntitlement, claimTokenRoyalties } from '../services/bonzaiRevenueRouter.service.js';
import { useI18n } from '../i18n/index.js';
import { withTimeout } from '../utils/withTimeout.js';

const props = defineProps({ companyId: { type: String, default: '' }, charter: { type: Object, default: null } });
const emit = defineEmits(['request-agent-action']);
const i18n = useI18n();
const ui = text => operationText(text, i18n.state.locale);
const wallet = computed(() => web3Service.state.walletAddress);
const records = ref([]), loading = ref(false), busy = ref(false), error = ref(''), now = ref(Math.floor(Date.now() / 1000));
const royalties = ref([]), incoming = ref([]);
const incomingAgent = reactive({}), peers = reactive({});
const localAgents = computed(() => smartAgentCatalog.agents.filter(agent => agent.tokenAddress && agent.agentWallet));
const workerAgent = record => localAgents.value.find(agent => agent.agentWallet?.toLowerCase() === record.live?.worker?.toLowerCase() && String(agent.tokenId) === record.live?.companionTokenId);
const notes = reactive({}), disputing = reactive({});
const zeroHash = ethers.ZeroHash;
let revision = 0;
let timer;
async function refresh() {
  const current = ++revision;
  error.value = '';
  const currentWallet = wallet.value;
  const isParty = record => [record.employer, record.worker].some(address => address?.toLowerCase() === currentWallet?.toLowerCase());
  // A contributor can have royalties without being the employer or worker.
  // Only inspect jobs already recorded on this device, then verify their route onchain.
  let saved;
  try {
    await loadSmartAgents();
    const nextIncoming = await window.electronAPI?.agentJobsInbox?.() || [];
    if (current !== revision) return;
    incoming.value = nextIncoming;
    for (const entry of nextIncoming) incomingAgent[entry.id] ??= '';
    saved = currentWallet ? await listSmartAgentJobs(props.companyId, null) : [];
  } catch (failure) { if (current === revision) { error.value = failure.message; loading.value = false; } return; }
  if (current !== revision) return;
  records.value = saved.filter(isParty);
  royalties.value = [];
  if (!saved.length || !smartAgentJobsConfigured()) { loading.value = false; return; }
  loading.value = true;
  const results = await Promise.all(saved.map(async record => {
    try { return { ...record, live: await withTimeout(fetchSmartAgentJob(record.jobId), 15000, i18n.t('rcWorkflows.timeout')) }; }
    catch (failure) { return { ...record, failure: failure.shortMessage || failure.message }; }
  }));
  const entitlements = await Promise.all(knownSmartAgentRoyaltyRoutes(results).map(async route => {
    try { return { ...route, ...await withTimeout(getTokenRoyaltyEntitlement(route.assetId, route.currency, currentWallet), 15000, i18n.t('rcWorkflows.timeout')) }; }
    catch (failure) { return { ...route, failure: failure.shortMessage || failure.message }; }
  }));
  if (current === revision) {
    records.value = results.filter(record => isParty(record.live || record) || workerAgent(record));
    royalties.value = entitlements.filter(item => item.failure || BigInt(item.rawAmount) > 0n);
    const unavailable = results.find(record => !isParty(record) && record.failure && record.terms?.routeAssetId && record.terms.routeAssetId !== zeroHash);
    if (unavailable) error.value = unavailable.failure;
    loading.value = false;
  }
}
const isWorker = record => record.live?.worker.toLowerCase() === wallet.value?.toLowerCase();
const isEmployer = record => record.live?.employer.toLowerCase() === wallet.value?.toLowerCase();
const tokenAmount = (value, decimals) => ethers.formatUnits(value, decimals);
const statusLabel = record => record.live ? ['Unknown', 'Awaiting acceptance', 'In progress', 'Awaiting review', 'Settled', 'Refunded', 'Disputed'][record.live.status] : record.status;
const deadline = record => ({ 1: record.live?.acceptBy, 2: record.live?.deliverBy, 3: record.live?.reviewBy, 6: record.live?.resolveBy })[record.live?.status] || 0;
async function run(work) {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try { await work(); await refresh(); }
  catch (failure) { error.value = failure.shortMessage || failure.message; }
  finally { busy.value = false; }
}
async function act(record, action, detail) {
  const expectedWallet = wallet.value;
  await run(async () => {
    // Preserve the evidence locally; the smart contract receives only its hash.
    if (detail) localStorage.setItem(`bonzai.jobEvidence.${record.jobId}.${action}`, JSON.stringify({ detail, at: Date.now() }));
    await actOnSmartAgentJob(action, record.jobId, detail, { expectedWallet });
  });
}
const withdraw = record => { const expectedWallet = wallet.value; return run(() => withdrawSmartAgentPayment(record.live.currency, expectedWallet)); };
const claimRoyalty = royalty => { const expectedWallet = wallet.value; return run(() => claimTokenRoyalties(royalty.assetId, royalty.currency, { expectedWallet })); };
async function sendDelivery(record) { await run(() => sendSmartAgentDelivery(record, peers[record.jobId], notes[record.jobId])); }
async function send(record) { await run(() => sendSmartAgentJob(record, peers[record.jobId])); }
async function receive(entry) {
  await run(async () => {
    if (entry.packet.delivery) { await importSmartAgentDelivery(entry.packet, props.companyId); await window.electronAPI.agentJobsDismiss(entry.id); return; }
    const agent = localAgents.value.find(item => item.id === incomingAgent[entry.id]);
    if (!agent) throw new Error('Choose a local smart agent.');
    await importSmartAgentJob(entry.packet, agent, props.companyId);
    await window.electronAPI.agentJobsDismiss(entry.id);
  });
}
async function dismiss(entry) { await run(() => window.electronAPI.agentJobsDismiss(entry.id)); }
async function queue(record) { await run(() => queueSmartAgentJob(record, props.charter, workerAgent(record))); }
const requestAgentAction = (record, type, detail = '') => emit('request-agent-action', { type, agentId: record.agentId, jobId: record.jobId, resultURI: detail });
watch([wallet, () => props.companyId], refresh, { immediate: true });
onMounted(() => { window.addEventListener('bonzai:smart-agent-job', refresh); timer = setInterval(() => { now.value = Math.floor(Date.now() / 1000); }, 1000); });
onBeforeUnmount(() => { revision++; window.removeEventListener('bonzai:smart-agent-job', refresh); clearInterval(timer); });
</script>

<style scoped>
.agent-jobs-panel { margin-top: var(--bz-space-5); border-top: 1px solid var(--bz-border); padding-top: var(--bz-space-4); }
.agent-jobs-panel > header { display: flex; justify-content: space-between; align-items: center; gap: var(--bz-space-3); }
.agent-job { border-bottom: 1px solid var(--bz-border); padding-block: var(--bz-space-3); }
.agent-job summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--bz-space-3); cursor: pointer; }
.agent-job summary > span:first-child { flex: 1; min-width: 120px; }
.agent-job small { display: block; color: var(--bz-fg-mid); margin-top: 4px; }
.agent-job__body { display: grid; gap: var(--bz-space-3); padding-top: var(--bz-space-3); overflow-wrap: anywhere; }
.agent-job__body p { margin: 0; }
.agent-job__actions { display: flex; flex-wrap: wrap; gap: var(--bz-space-2); align-items: center; }
.agent-job-royalties { padding-block: var(--bz-space-3); border-bottom: 1px solid var(--bz-border); }
.agent-job-royalties > h4 { margin: 0 0 var(--bz-space-2); }
.agent-job-royalties__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bz-space-3); padding-block: var(--bz-space-2); }
.agent-job-royalties__row > div { flex: 1; min-width: 160px; overflow-wrap: anywhere; }
.agent-job-royalties__row small { display: block; color: var(--bz-fg-mid); margin-top: var(--bz-space-1); }
.agent-job__evidence > label { display: grid; gap: var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-caption); }
.agent-job__evidence input, .agent-job__actions select { background: var(--bz-panel); color: var(--bz-fg); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-radius-sm); padding: var(--bz-space-3); max-width: 100%; }
.agent-job__evidence textarea { width: 100%; min-height: 72px; background: var(--bz-panel); color: var(--bz-fg); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-radius-sm); padding: var(--bz-space-3); margin-bottom: var(--bz-space-2); }
.job-error { color: var(--bz-danger); }
</style>
