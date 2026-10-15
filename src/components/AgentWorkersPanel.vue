<template>
  <section class="worker-panel">
    <header><h3 class="bz-h3">{{ $ui('Peer workers') }}</h3><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="refresh"><span class="material-symbols-outlined" aria-hidden="true">radar</span>{{ $t('common.refresh') }}</button></header>
    <p v-if="error" role="alert" class="worker-error">{{ error }}</p>
    <p v-if="notice" role="status" class="bz-meta">{{ notice }}</p>
    <p v-if="!workers.length" class="bz-meta">{{ $ui('No verified workers found on connected peers. Enable Consumer or Provider mode to connect.') }}</p>
    <div class="worker-grid">
      <button v-for="worker in workers" :key="worker.key + worker.peerId" class="worker-choice" :class="{ selected: selected?.key === worker.key }" @click="selected = worker; ticket = null">
        <span class="material-symbols-outlined" aria-hidden="true">person</span><strong>{{ worker.grant.name }}</strong><small>{{ worker.grant.capabilities.join(' · ') }}</small>
      </button>
    </div>
    <form v-if="selected" class="worker-request" @submit.prevent="hiring = true">
      <label>{{ $ui('Capability') }}<select v-model="capability"><option v-for="cap in selected.grant.capabilities" :key="cap">{{ cap }}</option></select></label>
      <template v-if="capability === 'workflow'">
        <label>{{ $ui('Workflow') }}<select v-model="workflowId" required><option value="">{{ $t('common.select') }}</option><option v-for="flow in selectedWorkflows" :key="flow.id" :value="flow.id">{{ flow.name }}</option></select></label>
        <label v-for="(field, key) in workflow?.inputs || {}" :key="key">{{ field.label || key }}<input v-model="workflowInputs[key]" :type="field.type === 'number' ? 'number' : 'text'" :min="field.min" :max="field.max" :required="field.required" /></label>
      </template>
      <label v-else>{{ $ui('Instructions shared with this worker') }}<textarea v-model="prompt" required /></label>
      <label v-if="capability === 'vision'">{{ $ui('Image') }}<input type="file" accept="image/png,image/jpeg,image/webp" @change="readImage" /></label>
      <button class="bz-btn bz-btn--primary" :disabled="busy || (capability === 'workflow' ? !workflowId : !prompt)">{{ $ui('Review paid job') }}</button>
    </form>
    <div v-for="job in acceptedJobs" :key="job.jobId" class="worker-actions">
      <span>{{ job.terms.title }}</span><button class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy" @click="runJob(job)">{{ $ui('Run accepted job') }}</button>
    </div>
    <div v-if="ticket" class="worker-ticket">
      <strong>{{ ticket.status }}</strong><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="checkTicket">{{ $t('common.refresh') }}</button>
      <CompanyMarkdown v-if="ticket.result?.text" :source="ticket.result.text" />
      <button v-for="artifact in ticket.result?.artifacts || []" :key="artifact.id" class="bz-btn bz-btn--ghost" :disabled="busy" @click="download(artifact)"><span class="material-symbols-outlined" aria-hidden="true">download</span>{{ artifact.name || artifact.mimeType }}</button>
      <template v-for="file in received" :key="file.id"><button class="bz-btn bz-btn--ghost bz-btn--sm" @click="exportFile(file)">{{ $ui('Save file') }} · {{ file.name || file.mimeType }}</button><img v-if="file.mimeType.startsWith('image/')" :src="file.uri" :alt="$ui('Worker delivery')" class="worker-image" /><audio v-else-if="file.mimeType.startsWith('audio/')" :src="file.uri" controls /><video v-else-if="file.mimeType.startsWith('video/')" :src="file.uri" controls class="worker-image" /></template>
    </div>
    <details v-if="providerRuns.length" class="worker-owner"><summary>{{ $ui('Work on this device') }}</summary>
      <article v-for="run in providerRuns" :key="run.requestId" class="worker-ticket">
        <div class="worker-actions"><strong>{{ run.title }}</strong><span>{{ run.status }}</span></div>
        <CompanyMarkdown v-if="run.result?.text" :source="run.result.text" />
        <p v-if="run.error" class="worker-error">{{ run.error }}</p>
        <button v-if="run.status === 'completed' && run.jobId" class="bz-btn bz-btn--primary bz-btn--sm" @click="emit('request-agent-action', { type: 'smartAgent.submitResult', agentId: run.agentId, jobId: run.jobId, resultURI: deliveryEvidence(run) })">{{ $ui('Review delivery submission') }}</button>
        <button v-if="run.status === 'completed'" class="bz-btn bz-btn--ghost bz-btn--sm" @click="copyDelivery(run)">{{ $ui('Copy delivery evidence') }}</button>
      </article>
    </details>
    <details class="worker-owner"><summary>{{ $ui('Manage my workers') }}</summary>
      <label>{{ $ui('Smart agent') }}<select v-model="agentId"><option value="">{{ $t('common.select') }}</option><option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option></select></label>
      <template v-if="agent">
        <div class="worker-scopes"><label v-for="cap in allowedCaps" :key="cap"><input v-model="scopes" type="checkbox" role="switch" :value="cap" />{{ cap }}</label></div>
        <div v-if="scopes.includes('fineTune')" class="worker-request">
          <label>{{ $ui('Local training model') }}<input v-model="trainingModel" /></label>
          <label>{{ $ui('Training mode') }}<select v-model="trainingMode"><option value="llm">Tune</option><option value="abliterate">Uncensor</option></select></label>
          <label v-if="trainingMode === 'llm'">{{ $ui('Local dataset ID') }}<input v-model="trainingDataset" /></label>
        </div>
        <p class="bz-meta">{{ $ui('Authorize this device for seven days. Only selected capabilities are public. Private memory and credentials stay here.') }}</p>
        <div class="worker-actions"><button class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy || !scopes.length" @click="publish">{{ $ui('Authorize worker') }}</button><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="unpublish">{{ $ui('Stop offering work') }}</button></div>
        <details><summary>{{ $ui('Delegate to another device') }}</summary>
          <label>{{ $ui('Provider peer ID') }}<input v-model="delegatePeer" /></label>
          <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy || !delegatePeer || !scopes.length" @click="delegate">{{ $ui('Sign provider authorization') }}</button>
          <label>{{ $ui('Signed authorization') }}<textarea v-model="authorization" /></label>
          <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy || !authorization" @click="importAuthorization">{{ $ui('Import authorization on this device') }}</button>
        </details>
        <details><summary>{{ $ui('Ownership and execution wallet') }}</summary>
          <label>{{ $ui('Execution wallet') }}<input v-model="executionWallet" placeholder="0x…" /></label><button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy || !executionWallet" @click="changeWallet">{{ $ui('Update execution wallet') }}</button>
          <label>{{ $ui('NFT recipient') }}<input v-model="recipient" placeholder="0x…" /></label>
          <p class="bz-meta">{{ $ui('Transfer revokes existing execution grants. Private chats, credentials and previously earned tokens do not transfer.') }}</p>
          <button class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy || !recipient" @click="transfer">{{ $ui('Review NFT transfer in wallet') }}</button>
        </details>
      </template>
    </details>
    <SmartAgentHireModal v-if="hiring && selected" :agent="hireAgent" :company-id="companyId" :execution="execution" @close="hiring = false" @hired="hired" />
  </section>
</template>
<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { loadSmartAgents } from '../services/smartAgentCatalog.js';
import { publishWorker, discoverWorkers, callWorker, receiveWorkerMedia, transferWorker, setWorkerWallet } from '../services/agentWorkers.service.js';
import { workerKey } from '../services/agentWorkerProtocol.js';
import { listSmartAgentJobs, fetchSmartAgentJob } from '../services/smartAgentJobs.service.js';
import { createJobPacket } from '../services/smartAgentHandoff.js';
import { ethers } from 'ethers';
import SmartAgentHireModal from './SmartAgentHireModal.vue';
import CompanyMarkdown from './company/CompanyMarkdown.vue';
import { workerDeliveryEvidence } from '../services/workerOutputs.js';
const deliveryEvidence = run => JSON.stringify(workerDeliveryEvidence(run));
const emit = defineEmits(['request-agent-action']);
const props = defineProps({ companyId: { type: String, default: '' } });
const workflowId = ref(''), workflowInputs = ref({}), workflowCatalog = ref([]), imageBase64 = ref('');
const selectedWorkflows = computed(() => workflowCatalog.value.filter(w => selected.value?.grant.workflows.includes(w.id)));
const workflow = computed(() => selectedWorkflows.value.find(w => w.id === workflowId.value));
const execution = computed(() => ({ capability: capability.value, input: capability.value === 'workflow' ? { workflowId: workflowId.value, inputs: Object.fromEntries(Object.entries(workflowInputs.value).map(([key, value]) => [key, workflow.value?.inputs?.[key]?.type === 'number' ? Number(value) : value])) } : { prompt: prompt.value, ...(imageBase64.value && capability.value === 'vision' ? { params: { image_base64: imageBase64.value } } : {}) } }));
const providerRuns = ref([]);
const acceptedJobs = ref([]), received = ref([]), delegatePeer = ref(''), authorization = ref('');
const workers = ref([]), agents = ref([]), selected = ref(null), agentId = ref(''), scopes = ref(['text', 'image', 'audio']), busy = ref(false), error = ref(''), notice = ref(''), prompt = ref(''), capability = ref('text'), hiring = ref(false), ticket = ref(null), recipient = ref(''), executionWallet = ref('');
const allowedCaps = ['text', 'image', 'audio', 'music', 'video', 'vision', '3d', 'skill', 'workflow', 'fineTune'];
const trainingModel = ref(''), trainingDataset = ref(''), trainingMode = ref('llm');
const workerDefaults = computed(() => scopes.value.includes('fineTune') ? { fineTune: { base_model: trainingModel.value, dataset_id: trainingDataset.value, mode: trainingMode.value } } : {});
const agent = computed(() => agents.value.find(a => a.id === agentId.value));
const hireAgent = computed(() => ({ id: selected.value.key, peerId: selected.value.peerId, name: selected.value.grant.name, chainId: selected.value.grant.chainId, contractAddress: selected.value.grant.collection, tokenId: selected.value.grant.tokenId, tokenAddress: selected.value.identity.token }));
watch(selected, worker => { if (worker && !worker.grant.capabilities.includes(capability.value)) capability.value = worker.grant.capabilities[0]; });
watch(workflow, flow => { workflowInputs.value = Object.fromEntries(Object.entries(flow?.inputs || {}).map(([key, field]) => [key, field.default ?? ''])); });
async function readImage(event) { const file = event.target.files?.[0]; if (!file) return; if (file.size > 1024 * 1024) { error.value = 'Choose an image smaller than 1 MiB.'; return; } const reader = new FileReader(); reader.onload = () => { imageBase64.value = String(reader.result).split(',')[1]; }; reader.readAsDataURL(file); }
async function work(fn) { if (busy.value) return; busy.value = true; error.value = ''; try { await fn(); } catch (e) { error.value = e.shortMessage || e.message; } finally { busy.value = false; } }
async function refresh() { await work(async () => { providerRuns.value = await window.electronAPI.agentWorkerRuns(); workers.value = await discoverWorkers(); agents.value = (await loadSmartAgents()).filter(a => !a.isLocal);
    acceptedJobs.value = (await Promise.all((await listSmartAgentJobs(props.companyId)).filter(j => j.execution && j.employerSignature).map(async j => { try { return (await fetchSmartAgentJob(j.jobId)).status === 2 ? j : null; } catch { return null; } }))).filter(Boolean);
  }); }
async function publish() { await work(async () => { await publishWorker(agent.value, scopes.value, scopes.value.includes('workflow') ? workflowCatalog.value.map(workflow => workflow.id) : [], workerDefaults.value); notice.value = 'Worker authorization saved. Provider mode is required to serve requests.'; }); }
async function delegate() { await work(async () => { authorization.value = JSON.stringify(await publishWorker(agent.value, scopes.value, scopes.value.includes('workflow') ? workflowCatalog.value.map(workflow => workflow.id) : [], workerDefaults.value, delegatePeer.value.trim()), null, 2); }); }
async function importAuthorization() { await work(async () => { if (authorization.value.length > 65536) throw new Error('Authorization is too large.'); await window.electronAPI.agentWorkerPublish(JSON.parse(authorization.value), { agentId: agent.value.id, defaults: workerDefaults.value }); notice.value = 'Provider authorization imported.'; }); }
async function unpublish() { await work(() => window.electronAPI.agentWorkerUnpublish(workerKey({ chainId: agent.value.chainId, collection: agent.value.contractAddress, tokenId: agent.value.tokenId }))); }
async function transfer() { await work(async () => { const tx = await transferWorker(agent.value, recipient.value); notice.value = tx.hash; await tx.wait(); notice.value = 'NFT transferred. Previous grants revoked.'; }); }
async function changeWallet() { await work(async () => { const tx = await setWorkerWallet(agent.value, executionWallet.value); notice.value = tx.hash; await tx.wait(); notice.value = 'Execution wallet updated. Authorize this worker again to resume discovery.'; }); }
async function hired(record) {
  // Funding does not automatically share data. The existing jobs panel sends the agreed brief.
  notice.value = record.status === 'funded' ? 'Job funded. Send its brief from Smart-agent jobs, then run it after acceptance.' : 'Funding submitted. Check its transaction before retrying.';
}
async function runJob(job) { await work(async () => {
  const worker = workers.value.find(w => String(w.grant.tokenId) === String(job.terms.companionTokenId) && w.grant.chainId === job.terms.chainId && w.peerId === job.terms.executionPeer);
  if (!worker) throw new Error('Refresh and reconnect to this worker first.');
  selected.value = worker;
  const requestId = ethers.id(`bonzai-worker:${job.terms.chainId}:${job.terms.escrow}:${job.jobId}`);
  // Save before dispatch; the same job always uses the same ticket even after restart.
  await window.electronAPI.store.set(`workerTicket:${props.companyId}`, { worker, requestId });
  ticket.value = await callWorker(worker, 'execute', { requestId, ...job.execution, job: createJobPacket(job) });
}); }
async function exportFile(file) { await work(() => window.electronAPI.agentWorkerExportMedia(file)); }
async function copyDelivery(run) { await work(() => navigator.clipboard.writeText(deliveryEvidence(run))); }
async function checkTicket() { await work(async () => { ticket.value = await callWorker(selected.value, 'status', { requestId: ticket.value.requestId }); }); }
async function download(artifact) { await work(async () => { const file = await receiveWorkerMedia(selected.value, ticket.value.requestId, artifact); received.value.push({ ...artifact, ...file });
    const { publishContent } = await import('../services/company/distribution.solo.js');
    if (props.companyId) { const saved = await publishContent(props.companyId, { pipeline: ticket.value.result.pipeline === 'workflow' ? artifact.mimeType.split('/')[0] : ticket.value.result.pipeline, prompt: selected.value.grant.name, blobId: file.id, blobExt: artifact.ext, payload: file.uri, meta: { payloadEncoding: 'text', kind: 'peer-worker-media', artifacts: [{ ...artifact, ...file }], requestId: ticket.value.requestId } }); if (!saved) throw new Error('Media downloaded, but could not be added to company deliverables.'); }
    notice.value = 'Media saved locally.'; }); }
onMounted(async () => { try { workflowCatalog.value = await (await import('../services/agentWorkflows.js')).getAvailableAgentWorkflows(); agents.value = (await loadSmartAgents()).filter(a => !a.isLocal); const saved = await window.electronAPI?.store?.get(`workerTicket:${props.companyId}`); if (saved) { selected.value = saved.worker; ticket.value = { requestId: saved.requestId, status: 'Saved request' }; } } catch(e) { error.value = e.message; } });
</script>
<style scoped>
.worker-panel,.worker-panel * { box-sizing:border-box; }
.worker-panel > *,.worker-owner > * { min-width:0; }
.worker-panel { padding-block: var(--bz-space-5); border-block: 1px solid var(--bz-border); display: grid; gap: var(--bz-space-4); }
.worker-panel header,.worker-actions { display:flex; align-items:center; justify-content:space-between; gap:var(--bz-space-3); flex-wrap:wrap; }
.worker-panel h3,.worker-panel p { margin:0; }.worker-panel label { display:grid; gap:var(--bz-space-2); }
.worker-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr)); gap:var(--bz-space-3); }
.worker-choice { display:grid; gap:var(--bz-space-2); text-align:left; padding:var(--bz-space-4); border:1px solid var(--bz-border); border-radius:var(--bz-radius-md); background:var(--bz-panel); color:var(--bz-fg); }
.worker-choice.selected { border-color:var(--bz-accent); }.worker-choice small { color:var(--bz-fg-mid); overflow-wrap:anywhere; }
.worker-request,.worker-owner[open],.worker-owner details[open] { display:grid; gap:var(--bz-space-3); }.worker-owner summary { cursor:pointer; padding-block:var(--bz-space-3); }
.worker-panel input,.worker-panel select,.worker-panel textarea { min-width:0; width:100%; padding:var(--bz-space-3); background:var(--bz-panel); color:var(--bz-fg); border:1px solid var(--bz-border-strong); border-radius:var(--bz-radius-sm); }.worker-panel textarea { min-height:90px; }
.worker-scopes { display:flex; flex-wrap:wrap; gap:var(--bz-space-3); }.worker-scopes label { display:flex; align-items:center; }.worker-scopes input { appearance:none; width:32px; height:18px; padding:0; border-radius:20px; position:relative; cursor:pointer; background:var(--bz-raised); transition:background .15s; }
.worker-scopes input::after { content:''; position:absolute; width:12px; height:12px; border-radius:50%; top:2px; left:2px; background:var(--bz-fg-mid); transition:transform .15s; }
.worker-scopes input:checked { background:var(--bz-accent); border-color:var(--bz-accent); }.worker-scopes input:checked::after { transform:translateX(14px); background:var(--bz-canvas); }
.worker-image { max-width:100%; max-height:360px; border-radius:var(--bz-radius-sm); }.worker-ticket audio { max-width:100%; }.worker-error { color:var(--bz-danger); overflow-wrap:anywhere; }.worker-ticket { overflow-wrap:anywhere; }
</style>
