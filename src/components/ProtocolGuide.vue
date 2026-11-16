<template>
  <section class="protocol-guide" aria-label="Web3 Guide">
    <header><div><p class="bz-eyebrow">{{ ui("Publish · Own · Earn") }}</p><h2 class="bz-h2">{{ ui("Web3 Guide") }}</h2></div><span>{{ network.name }}</span></header>
    <div class="protocol-guide__layout">
      <nav aria-label="Web3 activities"><button v-for="item in activities" :key="item.id" :aria-current="selected.id === item.id ? 'page' : undefined" @click="protocolGuideState.activity = item.id"><span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>{{ item.title }}</button></nav>
      <article :aria-labelledby="`protocol-${selected.id}`">
        <p class="protocol-guide__status">{{ selected.configured ? ui('Setup available · verify live terms before signing') : selected.id === 'storage' ? ui('Storage setup required') : ui('Deployment configuration required') }}</p>
        <h3 :id="`protocol-${selected.id}`" class="bz-h2">{{ selected.title }}</h3>
        <ol><li v-for="step in selected.steps" :key="step">{{ step }}</li></ol>
        <dl><div><dt>{{ ui("What it costs") }}</dt><dd>{{ selected.cost }}</dd></div><div><dt>{{ ui("What you get") }}</dt><dd>{{ selected.result }}</dd></div></dl>
        <p v-if="selected.limitation" class="protocol-guide__notice" role="note">{{ selected.limitation }}</p>
        <p v-if="!selected.configured && selected.id !== 'storage'" class="protocol-guide__notice">{{ ui("Required addresses are missing on {network}. You can explore the screen, but this action cannot settle onchain yet.", {network: network.name}) }}</p>
        <button v-if="selected.action !== 'storage'" class="bz-btn bz-btn--primary" @click="navigate(selected.action)">{{ selected.action === 'connect' ? ui('Connect Wallet') : selected.action === 'network' ? ui('Open Network Settings') : ui('Open {destination}', {destination: ui(destinations[selected.action])}) }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
        <section v-else class="protocol-storage" aria-label="Storage settings">
          <h4>{{ ui("Pinata connection") }}</h4>
          <p>{{ storage.persistent ? ui('Your JWT is encrypted on this device and is never bundled with the app.') : ui('Your JWT stays in memory in this browser tab. Reconnect after closing or refreshing it.') }}</p>
          <form @submit.prevent="saveCredentials">
            <label>Pinata JWT<input v-model="jwt" type="password" autocomplete="off" spellcheck="false" :placeholder="ui('Paste your own Pinata JWT')" :disabled="busy" /></label>
            <button class="bz-btn bz-btn--ghost" :disabled="busy || !jwt.trim()">{{ ui("Save Connection") }}</button>
            <button v-if="storage.configured" type="button" class="bz-btn bz-btn--ghost" :disabled="busy" @click="forget">{{ ui("Forget Credentials") }}</button>
          </form>
          <p role="status">{{ storage.configured ? ui('Credentials saved. Permissions and quota are checked when you upload.') : ui('No storage credentials saved.') }} {{ ui("Forgetting credentials does not unpin public files.") }}</p>
          <h4>{{ ui("Upload a public file") }}</h4>
          <label>{{ ui("Choose a file (up to 512 MiB)") }}<input type="file" :disabled="busy" @change="chooseFile" /></label>
          <p v-if="file">{{ file.name }} · {{ file.type || 'application/octet-stream' }} · {{ (file.size / 1048576).toFixed(2) }} MiB</p>
          <label class="protocol-storage__consent"><input v-model="consent" type="checkbox" :disabled="busy || !file" />{{ ui("I have the rights to publish this file and understand it will be public. Pinning must be maintained; deletion of all copies is not guaranteed.") }}</label>
          <button class="bz-btn bz-btn--primary" :disabled="busy || !storage.configured || !file || !consent" @click="upload">{{ busy ? ui('Working…') : ui('Upload to IPFS') }}</button>
          <p v-if="message" role="status">{{ message }}</p>
          <p v-if="error" class="protocol-storage__error" role="alert">{{ error }}</p>
          <section v-if="receipts.length" aria-label="IPFS receipts"><h4>{{ storage.persistent ? ui('Upload receipts on this device') : ui('Upload receipts this session') }}</h4><ul><li v-for="receipt in receipts" :key="receipt.url"><strong>{{ receipt.name || 'Public upload' }}</strong><code>{{ receipt.url }}</code><a :href="receiptLink(receipt)" target="_blank" rel="noopener noreferrer">{{ ui("Open public file ↗") }}</a></li></ul></section>
        </section>
      </article>
    </div>
  </section>
</template>
<script setup>
import { protocolGuideFr } from '../i18n/protocolGuide.fr.js';
import { operationText } from '../i18n/operations.js';
import { i18n } from '../i18n/index.js';
import { protocolGuideLabelsFr } from '../i18n/protocolGuideLabels.fr.js';
import { ref, computed, onMounted } from 'vue';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { protocolActivities } from '../services/protocolActivities.js';
import { protocolGuideState } from '../services/protocolNavigation.js';
import { storageStatus, configureStorage, removeStorageCredentials, storageReceipts, uploadContent } from '../services/storage.service.js';
import { requestConnection } from '../services/connectionDialog.service.js';
const network = CONFIG.networks[ECONOMY_NETWORK_KEY];
const storage = ref({ configured: false, persistent: Boolean(window.electronAPI?.publicStorage) });
const jwt = ref(''), busy = ref(false), error = ref(''), message = ref(''), file = ref(null), consent = ref(false), receipts = ref([]);
const ui = (text, params = {}) => {
  const translated = i18n.state.locale === 'fr' ? protocolGuideLabelsFr[text] : null;
  return translated ? translated.replace(/\{([^}]+)\}/g, (_, key) => params[key] ?? `{${key}}`) : operationText(text, i18n.state.locale, params);
};
const activities = computed(() => protocolActivities(CONFIG, storage.value).map(item => {
  const translated = i18n.state.locale === 'fr' && protocolGuideFr[item.id];
  if (translated) { const [title, steps, cost, result, limitation = ''] = translated; return {...item, title, steps, cost, result, limitation}; }
  return {...item, title: ui(item.title), steps: item.steps.map(step => ui(step)), cost: ui(item.cost), result: ui(item.result), limitation: ui(item.limitation)};
}));
const selected = computed(() => activities.value.find(item => item.id === protocolGuideState.activity) || activities.value[0]);
const destinations = { image: 'Images', rewards: 'Rewards', agent: 'Smart Agents', tune: 'Tune', game: '3D', markets: 'Markets', company: 'Smart Workflows', datasets: 'Datasets' };
function navigate(action) {
  if (action === 'connect') return requestConnection();
  if (action === 'network') return window.dispatchEvent(new CustomEvent('bonzai:open-network'));
  protocolGuideState.open = false;
  window.dispatchEvent(new CustomEvent('bonzai:set-mode', { detail: action }));
}
async function run(action) { if (busy.value) return; busy.value = true; error.value = ''; message.value = ''; try { await action(); } catch (e) { error.value = e.message; } finally { busy.value = false; } }
const saveCredentials = () => run(async () => { storage.value = await configureStorage(jwt.value); jwt.value = ''; message.value = ui("Connection saved."); });
const forget = () => run(async () => { storage.value = await removeStorageCredentials(); jwt.value = ''; });
function chooseFile(event) { file.value = event.target.files?.[0] || null; consent.value = false; error.value = ''; if (file.value && (!file.value.size || file.value.size > 512 * 1048576)) { file.value = null; error.value = ui("Choose a non-empty file up to 512 MiB."); } }
function receiptLink(receipt) { return /^ipfs:\/\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(receipt.url || '') ? `https://gateway.pinata.cloud/ipfs/${receipt.url.slice(7)}` : undefined; }
const upload = () => run(async () => {
  if (!file.value || !consent.value || !storage.value.configured) return;
  const receipt = await uploadContent({ data: file.value, contentType: file.value.type || 'application/octet-stream', generation: { type: 'file' } });
  receipts.value = [{ ...receipt, name: file.value.name }, ...receipts.value.filter(row => row.url !== receipt.url)];
  message.value = receipt.localRecordWarning || ui("Uploaded. Keep the IPFS URI below.");
  consent.value = false;
});
onMounted(() => run(async () => { storage.value = await storageStatus(); receipts.value = await storageReceipts(); }));
</script>
<style scoped>
.protocol-guide { margin:24px 0; color:var(--bz-fg); }.protocol-guide header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:24px; }.protocol-guide header>span,.protocol-guide__status { color:var(--bz-fg-mid); font-size:13px; }.protocol-guide__layout { display:grid; grid-template-columns:minmax(210px,280px) minmax(0,1fr); gap:32px; }.protocol-guide nav { display:flex; flex-direction:column; gap:4px; }.protocol-guide nav button { display:flex; align-items:center; gap:12px; padding:12px; text-align:left; border:1px solid transparent; background:none; color:var(--bz-fg); border-radius:8px; cursor:pointer; }.protocol-guide nav button[aria-current] { background:var(--bz-panel); border-color:var(--bz-purple-100); }.protocol-guide nav .material-symbols-outlined { color:var(--bz-purple-100); font-variation-settings:'wght' 200; }.protocol-guide article { min-width:0; border-left:1px solid var(--bz-border); padding-left:32px; }.protocol-guide h3 { margin:12px 0 20px; }.protocol-guide ol { padding-left:24px; display:grid; gap:16px; line-height:1.6; }.protocol-guide dl { display:grid; gap:18px; border-block:1px solid var(--bz-border); margin:24px 0; padding:20px 0; }.protocol-guide dt { font-weight:600; margin-bottom:6px; }.protocol-guide dd { margin:0; line-height:1.6; color:var(--bz-fg-mid); }.protocol-guide__notice { padding:14px; background:var(--bz-panel); border-radius:8px; color:var(--bz-fg-mid); line-height:1.6; margin:16px 0; }.protocol-storage { margin-top:24px; }.protocol-storage h4 { margin:24px 0 12px; font-weight:600; }.protocol-storage p { line-height:1.6; font-size:13px; margin:12px 0; color:var(--bz-fg-mid); }.protocol-storage form { display:flex; flex-wrap:wrap; align-items:end; gap:12px; }.protocol-storage label { display:grid; gap:8px; flex:1 1 220px; font-size:13px; }.protocol-storage input:not([type=checkbox]) { padding:10px; background:var(--bz-panel); border:1px solid var(--bz-border); border-radius:8px; color:var(--bz-fg); min-width:0; max-width:100%; }.protocol-storage__consent { display:flex!important; align-items:flex-start; margin:18px 0; line-height:1.6; }.protocol-storage input[type=checkbox] { margin-top:5px; }.protocol-storage__error { color:var(--bz-danger)!important; }.protocol-storage ul { padding:0; list-style:none; }.protocol-storage li { display:grid; gap:8px; padding:16px 0; border-top:1px solid var(--bz-border); overflow-wrap:anywhere; }.protocol-storage code { white-space:normal; }.protocol-guide :is(button,input,a):focus-visible { outline:2px solid var(--bz-purple-100); outline-offset:3px; }
@media(max-width:800px) { .protocol-guide__layout { grid-template-columns:1fr; gap:24px; }.protocol-guide nav { flex-direction:row; overflow:auto; }.protocol-guide nav button { flex-shrink:0; }.protocol-guide article { border:0; padding:0; }.protocol-guide header { flex-wrap:wrap; } }
.protocol-guide a { color:var(--bz-purple-100); text-underline-offset:3px; }.protocol-storage input::file-selector-button { background:var(--bz-panel); color:var(--bz-fg); border:1px solid var(--bz-border); border-radius:6px; padding:8px 12px; margin-right:12px; cursor:pointer; }
</style>
