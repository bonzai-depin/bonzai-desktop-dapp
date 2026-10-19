<script setup>
import './company-design.css';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { connectWithPrivy } from '../../services/web3.service.js';
import { getAvailableAgentWorkflows } from '../../services/agentWorkflows.js';
import { workspaceDiscovery } from '../../services/company/workspaceDiscovery.js';
import { TEMPLATE_GROUPS, filterTemplates } from '../../services/company/templateCatalog.js';
import { useI18n } from '../../i18n/index.js';
import { operationText } from '../../i18n/operations.js';
import { smartWorkflowDiscoveryMessages } from '../../i18n/smartWorkflowDiscoveryMessages.js';
import CompanyBusinessDemo from './CompanyBusinessDemo.vue';

const emit = defineEmits(['choose-template']);
const { locale } = useI18n();
const text = source => smartWorkflowDiscoveryMessages[locale.value]?.[source] || operationText(source, locale.value);
const access = ref(null), error = ref(''), busy = ref(false), order = ref(null), readOnly = ref(false), skipped = ref(false);
const catalog = ref([]), catalogLoading = ref(true), catalogError = ref(false), selectedId = ref(''), query = ref(''), category = ref('all'), expanded = ref(false), showDemo = ref(false);
const purchaseRef = ref(null), detailRef = ref(null), demoRef = ref(null);
const api = window.electronAPI?.workspace;
let timer, disposed = false;
const workflows = computed(() => workspaceDiscovery(catalog.value, locale.value));
const matches = computed(() => filterTemplates(workflows.value, { category: category.value, query: query.value, locale: locale.value }));
const visible = computed(() => expanded.value ? matches.value : matches.value.slice(0, 8));
const featured = computed(() => ['operations', 'wellness', 'media'].map(category => workflows.value.find(w => w.category === category)).filter(Boolean));
const selected = computed(() => workflows.value.find(item => item.id === selectedId.value) || workflows.value[0]);
const categories = computed(() => TEMPLATE_GROUPS.filter(group => group.id === 'all' || workflows.value.some(item => item.category === group.id)));
const canUseTemplate = computed(() => Boolean(access.value?.unlocked || access.value?.bypassed));
const contentOpen = computed(() => (access.value?.unlocked && (!access.value?.bypassed || skipped.value)) || readOnly.value);
watch([category, query], () => { expanded.value = false; });
watch(selectedId, () => { showDemo.value = false; });
async function refresh() {
  try {
    if (!api) throw new Error('Restart the desktop app to enable workspace activation.');
    const status = await api.status();
    if (!disposed) access.value = status;
  } catch (e) { if (!disposed) error.value = e.message; }
}
async function loadCatalog() {
  catalogLoading.value = true; catalogError.value = false;
  try {
    const installed = await getAvailableAgentWorkflows();
    if (disposed) return;
    catalog.value = installed;
    if (!selectedId.value) selectedId.value = workflows.value[0]?.id;
  } catch { if (!disposed) catalogError.value = true; }
  finally { if (!disposed) catalogLoading.value = false; }
}
const openDemo = () => { readOnly.value = true; };
onMounted(() => {
  window.addEventListener('bonzai:open-demo-team', openDemo);
  refresh(); loadCatalog(); timer = setInterval(refresh, 5000);
});
onUnmounted(() => { disposed = true; clearInterval(timer); window.removeEventListener('bonzai:open-demo-team', openDemo); });
async function chooseTemplate() {
  if (!selected.value) return;
  if (!canUseTemplate.value) { purchaseRef.value?.scrollIntoView({ block: 'center', behavior: 'auto' }); return; }
  const id = selected.value.id;
  skipped.value = true;
  await nextTick();
  emit('choose-template', id);
}
async function selectTemplate(id) {
  selectedId.value = id;
  await nextTick();
  detailRef.value?.scrollIntoView({ block: 'start', behavior: 'auto' });
}
async function revealDemo() { showDemo.value = true; await nextTick(); demoRef.value?.scrollIntoView({ block: 'start', behavior: 'auto' }); }
async function verify() {
  if (!order.value) return;
  busy.value = true; error.value = '';
  try { const state = await api.verify(order.value); access.value = { ...access.value, ...state }; if (state.pending) error.value = 'Payment confirmation is pending. You can check again without paying again.'; }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function signIn() {
  busy.value = true; error.value = '';
  try { const result = await connectWithPrivy(); if (result?.success === false) throw new Error(result.error || 'Sign-in cancelled.'); }
  catch (e) { error.value = e.message; } finally { busy.value = false; }
}
function clearCheckout() { if (confirm('Only start another checkout if the previous payment was not sent. Continue?')) { order.value = null; localStorage.removeItem('bonzai-workspace-pending-checkout'); } }
async function checkout(method) {
  if (busy.value || order.value || !access.value?.configured) return;
  busy.value = true; error.value = '';
  try {
    const o = await api.checkout(method); order.value = { orderId: o.id };
    // Keep the original pending order across reloads; never resend automatically.
    localStorage.setItem('bonzai-workspace-pending-checkout', JSON.stringify(order.value));
    if (method === 'wallet') {
      const { getSigner, connectWallet } = await import('../../services/web3.service.js');
      let signer;
      try { signer = await getSigner(); }
      catch { const connection = await connectWallet(); if (connection?.success === false) throw new Error(connection.error || 'Wallet connection cancelled.'); signer = await getSigner(); }
      if (Number((await signer.provider.getNetwork()).chainId) !== o.chainId) throw new Error(`Switch your wallet to chain ${o.chainId} before paying.`);
      const { Contract } = await import('ethers');
      const signature = await signer.signMessage(o.message);
      const token = new Contract(o.token, ['function transfer(address,uint256) returns (bool)'], signer);
      const tx = await token.transfer(o.recipient, o.amount);
      order.value = { orderId: o.id, signature, transactionHash: tx.hash };
      localStorage.setItem('bonzai-workspace-pending-checkout', JSON.stringify(order.value));
    }
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
try { order.value = JSON.parse(localStorage.getItem('bonzai-workspace-pending-checkout') || 'null'); } catch {}
async function restore() { busy.value = true; error.value = ''; try { access.value = await api.restore(); } catch (e) { error.value = e.message; } finally { busy.value = false; } }
async function backup() { try { await api.backup(); } catch (e) { error.value = e.message; } }
</script>

<template>
  <div v-if="contentOpen" class="workspace-content company-screen">
    <div v-if="!access?.bypassed" class="license-strip" data-i18n-skip>
      <span>{{ readOnly && !access?.unlocked ? $ui('Read-only workspace') : access?.test ? $ui('Test activation') : text('Smart Workflows unlocked') }}</span>
      <button class="bz-btn bz-btn--sm" @click="access?.unlocked ? backup() : readOnly = false">{{ access?.unlocked ? $ui('Back up license') : $ui('Unlock workspace') }}</button>
    </div>
    <p v-if="error" class="access-error" role="alert">{{ $ui(error) }}</p>
    <slot />
  </div>
  <section v-else class="workspace-access company-screen" data-i18n-skip>
    <div class="access-inner bz-page-content">
      <header class="access-heading bz-page-header">
        <div><p class="bz-eyebrow">{{ $ui('Automate') }}</p><h1 class="bz-h1"><span class="material-symbols-outlined bz-title-icon" aria-hidden="true">automation</span>{{ text('Smart Workflows') }}</h1></div>
        <div v-if="access?.bypassed" class="temporary-access"><button class="bz-btn bz-btn--primary" @click="skipped = true">{{ $ui('Skip') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button></div>
      </header>
      <section class="workflow-showcase" :aria-label="text('Find your next workflow')">
        <div class="workflow-invitation">
          <svg class="workflow-landscape" viewBox="0 0 600 400" aria-hidden="true"><circle cx="460" cy="105" r="72" fill="currentColor" opacity=".12"/><g fill="none" stroke="currentColor" opacity=".13" stroke-width="1.5"><path v-for="i in 8" :key="i" :d="`M-40 ${270+i*15} Q120 ${110+i*15} 290 ${280+i*10} T650 ${200+i*15}`"/></g></svg>
          <span class="bz-eyebrow">{{ text('Less busywork. More possibility.') }}</span>
          <h2>{{ text('Start with an idea.') }}<br/><em>{{ text('Leave with a result.') }}</em></h2>
          <div class="featured-workflows"><button v-for="workflow in featured" :key="workflow.id" :aria-pressed="selected?.id===workflow.id" @click="selectTemplate(workflow.id)"><span class="material-symbols-outlined" aria-hidden="true">{{ workflow.icon }}</span><span><strong>{{ $ui(workflow.catalogTitle) }}</strong><small>{{ $ui(workflow.hasInstalledWorkflow ? workflow.catalogOutcome : workflow.catalogDescription) }}</small></span><span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button></div>
          <a class="workflow-explore" href="#discovery-title">{{ text('Explore all workflows') }} <span class="material-symbols-outlined" aria-hidden="true">south</span></a>
        </div>
          <article v-if="selected" ref="detailRef" class="workflow-preview" :aria-label="$ui(selected.catalogTitle)">
            <span class="access-eyebrow">{{ $ui(selected.catalogCategory) }}</span><h2>{{ $ui(selected.catalogTitle) }}</h2><p class="preview-outcome">{{ $ui(selected.hasInstalledWorkflow ? selected.catalogOutcome : selected.catalogDescription) }}</p>
            <div class="preview-flow"><section><h3><span class="material-symbols-outlined" aria-hidden="true">input</span>{{ text('You provide') }}</h3><ul><li v-for="input in selected.catalogInputs" :key="input">{{ text(input) }}</li></ul></section><section><h3><span class="material-symbols-outlined" aria-hidden="true">task_alt</span>{{ text('You get') }}</h3><ul><li v-for="result in selected.catalogDeliverables" :key="result">{{ $ui(result) }}</li></ul></section></div>
            <details class="preview-setup"><summary>{{ text('Before you start') }}</summary><p v-if="selected.catalogSetup">{{ text(selected.catalogSetup) }}</p><p v-if="selected.catalogTools.length" class="preview-tools">{{ selected.catalogTools.map(text).join(' · ') }}</p><p>{{ text(selected.hasInstalledWorkflow ? 'Models are downloaded separately when needed. Download size and device requirements are shown before installation.' : 'Start with your files and instructions. Connect outside tools only when the work needs them.') }}</p></details>
            <div class="preview-actions"><button class="bz-btn bz-btn--primary" @click="chooseTemplate">{{ text(canUseTemplate ? 'Use this template' : 'See unlock options') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button><button v-if="selected.demoKind" class="bz-btn bz-btn--ghost" @click="revealDemo"><span class="material-symbols-outlined" aria-hidden="true">play_circle</span>{{ text('Try the guided demo') }}</button></div>
            <p class="preview-note"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span>{{ text('Review before sharing or sending.') }}</p>
          </article>
      </section>
      <section class="discovery" aria-labelledby="discovery-title">
        <header class="section-heading"><div><h2 id="discovery-title">{{ text('Explore all workflows') }}</h2></div><span class="catalog-count"><strong class="bz-metric">{{ workflows.length }}</strong>{{ text('Available workflows') }}</span></header>
        <div class="catalog-controls">
          <label class="catalog-search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="query" type="search" :aria-label="text('Search workflows or results')" :placeholder="text('Search workflows or results')" /></label>
          <select v-model="category" :aria-label="$ui('Category')"><option v-for="group in categories" :key="group.id" :value="group.id">{{ locale.startsWith('fr') ? group.frLabel : $ui(group.label) }}</option></select>
        </div>
        <p v-if="catalogLoading" class="catalog-notice" role="status">{{ text('Loading available workflows…') }}</p>
        <p v-else-if="catalogError" class="catalog-notice" role="alert">{{ text('The installed workflow catalog could not be loaded. Operational templates remain available below.') }}<button class="bz-btn bz-btn--ghost bz-btn--sm" @click="loadCatalog">{{ $ui('Retry') }}</button></p>
        <div class="discovery-layout">
          <div class="catalog-list">
            <div v-if="!visible.length" class="catalog-empty"><span class="material-symbols-outlined" aria-hidden="true">search_off</span><h3>{{ text('No matching workflows') }}</h3><button class="bz-btn bz-btn--ghost" @click="query = ''; category = 'all'">{{ text('Clear filters') }}</button></div>
            <button v-for="workflow in visible" :key="workflow.id" class="discovery-item" :class="{ 'is-selected': selected?.id === workflow.id }" :aria-pressed="selected?.id === workflow.id" @click="selectTemplate(workflow.id)">
              <span class="material-symbols-outlined workflow-symbol" aria-hidden="true">{{ workflow.icon }}</span><span class="discovery-item__body"><span class="discovery-item__category">{{ $ui(workflow.catalogCategory) }}</span><strong>{{ $ui(workflow.catalogTitle) }}</strong><span>{{ $ui(workflow.catalogDescription) }}</span></span><span class="material-symbols-outlined item-arrow" aria-hidden="true">arrow_forward</span>
            </button>
            <button v-if="!expanded && matches.length > visible.length" class="bz-btn bz-btn--ghost show-all" @click="expanded = true">{{ text('Show all workflows') }}<span class="bz-metric">{{ matches.length }}</span><span class="material-symbols-outlined" aria-hidden="true">expand_more</span></button>
          </div>

        </div>
      </section>
      <div v-if="showDemo && selected?.demoKind" ref="demoRef" class="intro-demo"><CompanyBusinessDemo :key="selected.demoKind" :kinds="[selected.demoKind]" /></div>
      <section ref="purchaseRef" class="purchase" aria-labelledby="purchase-title">
        <div class="purchase-summary"><h2 id="purchase-title">{{ text('One unlock. All your workflows.') }}</h2><p>{{ text('Create workspaces, run tasks, review results and keep your projects organized. Personal local generation remains free.') }}</p><p class="purchase-boundary">{{ text('Your existing results remain readable and exportable without unlocking.') }}</p></div>
        <div class="purchase-checkout"><div class="purchase-price"><strong class="bz-metric">1 ETH</strong><span>{{ $ui('Standard unlock price · one-time purchase') }}</span></div><p class="test-price">{{ $ui('Test checkout only: charged 1 USDC with a wallet or US$1 by card, not 1 ETH.') }}</p><div class="purchase-actions"><button class="bz-btn bz-btn--primary" :disabled="busy || !!order || !access?.configured" @click="checkout('card')">{{ $ui('Pay by card') }}</button><button class="bz-btn" :disabled="busy || !!order || !access?.configured" @click="checkout('wallet')">{{ $ui('Pay with wallet') }}</button><button v-if="order" class="bz-btn" :disabled="busy" @click="verify">{{ $ui('Check payment') }}</button></div><p v-if="access && !access.configured && !access.bypassed">{{ $ui('Checkout is not configured yet. You can run the demonstrations and read your existing records.') }}</p><button v-if="order" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="clearCheckout">{{ $ui('Start another checkout') }}</button></div>
      </section>
      <p v-if="error" class="access-error" role="alert">{{ $ui(error) }}</p>
      <footer class="access-footer"><p>{{ text('Browse now, decide later.') }}</p><div class="purchase-actions"><button class="bz-btn bz-btn--ghost" :disabled="busy" @click="signIn">{{ $ui('Sign in with email') }}</button><button class="bz-btn bz-btn--ghost" :disabled="busy || !api" @click="restore">{{ $ui('Restore license') }}</button><button v-if="!access?.bypassed" class="bz-btn bz-btn--ghost" @click="readOnly = true">{{ $ui('View existing records') }}</button></div></footer>
    </div>
  </section>
</template>

<style scoped>
.workspace-content{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}.workspace-content :deep(.company-tab){flex:1;height:auto;min-height:0;overflow:auto}.license-strip{display:flex;flex-shrink:0;justify-content:flex-end;align-items:center;gap:var(--bz-space-3,12px);padding:8px 24px;color:var(--bz-fg-mid);flex-wrap:wrap}.workspace-access{height:100%;min-height:0;width:100%;overflow:auto;box-sizing:border-box;color:var(--bz-fg);scrollbar-width:thin;scrollbar-color:var(--bz-border-strong) transparent}.access-inner{max-width:1600px;margin:0 auto;padding:clamp(20px,3vw,48px);display:grid;gap:36px}.access-heading{display:flex;gap:32px;align-items:center;justify-content:space-between;padding-block:8px 12px}.access-heading>div:first-child{max-width:760px}.access-eyebrow{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--bz-fg-mid)}.access-eyebrow .material-symbols-outlined{color:var(--bz-accent);font-size:20px}.workspace-access h1,.workspace-access h2,.workspace-access h3{color:var(--bz-fg);margin:0}.workspace-access h1{display:flex;align-items:center;gap:12px;font-size:var(--bz-size-h1);line-height:var(--bz-line-tight);margin:12px 0 16px}.workspace-access h2{font-family:var(--bz-font-display);font-size:26px;line-height:1.2}.workspace-access h3{font-family:var(--bz-font-body);font-size:14px;font-weight:600}.workspace-access p{color:var(--bz-fg-mid);line-height:1.6;margin:8px 0 0;font-size:14px}.access-heading p{font-size:16px;max-width:70ch}.temporary-access{display:grid;gap:14px;max-width:290px;flex:0 0 260px;border-left:1px solid var(--bz-border);padding-left:24px;font-size:13px;color:var(--bz-fg-mid);line-height:1.6}.temporary-access button{justify-self:start}.section-heading{display:flex;justify-content:space-between;gap:24px;align-items:start}.catalog-count{display:flex;gap:8px;align-items:center;color:var(--bz-fg-mid);font-size:13px;white-space:nowrap}.catalog-count strong{font-size:24px;color:var(--bz-fg)}.catalog-controls{display:flex;gap:12px;margin:24px 0;align-items:center}.catalog-search{display:flex;align-items:center;gap:10px;flex:1;min-width:0;border:1px solid var(--bz-border);border-radius:var(--bz-r);background:var(--bz-panel);padding:0 14px}.catalog-search:focus-within{border-color:var(--bz-accent)}.catalog-search .material-symbols-outlined{font-size:20px;color:var(--bz-fg-mid)}.catalog-search input{width:100%;min-width:0;border:0!important;box-shadow:none!important;outline:none!important;background:transparent!important;color:var(--bz-fg);padding:13px 0;font:inherit}.catalog-controls select{min-height:46px;max-width:40%;background:var(--bz-panel);color:var(--bz-fg);border:1px solid var(--bz-border);border-radius:var(--bz-r);padding:10px 38px 10px 14px;font:inherit}.catalog-notice{margin:0 0 16px!important;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.discovery-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,1fr);gap:28px;align-items:start}.catalog-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.discovery-item{display:flex;gap:14px;align-items:start;position:relative;padding:20px;text-align:left;min-width:0;cursor:pointer;border:1px solid var(--bz-border);border-radius:var(--bz-r-lg);background:var(--bz-panel);color:var(--bz-fg);font:inherit;transition:background .15s,border-color .15s}.discovery-item:hover{background:var(--bz-raised);border-color:var(--bz-border-strong)}.discovery-item.is-selected{border-color:var(--bz-accent);background:var(--bz-accent-soft)}.workflow-symbol{color:var(--bz-accent);font-size:23px;flex:0 0 auto;padding-top:2px}.discovery-item__body{display:grid;gap:7px;min-width:0}.discovery-item__body strong{font-size:16px;font-weight:600;line-height:1.3}.discovery-item__body>span:last-child{font-size:13px;line-height:1.5;color:var(--bz-fg-mid);overflow-wrap:anywhere}.discovery-item__category{font-size:11px;line-height:1.4;color:var(--bz-fg-mid);padding-right:16px}.item-arrow{position:absolute;right:12px;top:16px;font-size:17px;color:var(--bz-fg-mid)}.show-all{grid-column:1/-1;justify-self:start;margin-top:4px}.workflow-preview{position:sticky;top:20px;min-width:0;padding:26px;border-left:1px solid var(--bz-border);scroll-margin-block:24px}.workflow-preview h2{font-size:30px;margin-top:10px}.preview-outcome{font-size:16px!important;margin-top:14px!important}.preview-flow{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:24px 0;margin-top:8px;border-block-end:1px solid var(--bz-border)}.preview-flow h3{display:flex;gap:8px;align-items:center}.preview-flow .material-symbols-outlined{font-size:18px;color:var(--bz-accent)}.preview-flow ul{margin:12px 0 0;padding:0;list-style:none;display:grid;gap:9px}.preview-flow li{color:var(--bz-fg-mid);font-size:14px;line-height:1.4;overflow-wrap:anywhere}.preview-setup{padding-block:22px}.preview-tools{color:var(--bz-fg)!important;font-weight:500}.preview-actions{display:flex;flex-wrap:wrap;gap:10px}.workspace-access .bz-btn{white-space:normal;text-align:left;min-height:42px;height:auto;flex:0 1 auto}.preview-note{display:flex;gap:8px;align-items:center;font-size:12px!important;margin-top:20px!important}.preview-note .material-symbols-outlined{font-size:18px;flex-shrink:0}.catalog-empty{grid-column:1/-1;padding:40px 20px;text-align:center;display:grid;justify-items:center;gap:16px}.catalog-empty>.material-symbols-outlined{font-size:32px;color:var(--bz-fg-mid)}.purchase{display:grid;grid-template-columns:1.35fr 1fr;gap:54px;border-top:1px solid var(--bz-border);padding-top:32px;scroll-margin-block:24px}.purchase-summary{max-width:640px}.purchase-summary>p{font-size:15px}.purchase-boundary{font-size:13px!important;margin-top:20px!important}.purchase-price{display:flex;align-items:center;gap:18px}.purchase-price strong{font-size:40px;white-space:nowrap}.purchase-price>span{font-size:13px;color:var(--bz-fg-mid);max-width:150px}.test-price{font-size:13px!important;margin-bottom:18px!important}.purchase-actions{display:flex;gap:10px;flex-wrap:wrap}.purchase-checkout>button{margin-top:12px}.access-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-top:24px;border-top:1px solid var(--bz-border)}.access-footer p{margin:0}.access-error{border-left:2px solid var(--bz-danger);padding:12px 16px;background:var(--bz-danger-soft);color:var(--bz-fg)!important}.intro-demo{scroll-margin-block:24px}.workspace-access button:focus-visible,.catalog-controls select:focus-visible{outline:2px solid var(--bz-accent);outline-offset:3px}@media(max-width:1200px){.catalog-list{grid-template-columns:1fr}.access-heading{align-items:start}.discovery-layout{grid-template-columns:minmax(0,1.1fr) minmax(300px,1fr);gap:16px}.workflow-preview{padding:20px}.preview-flow{grid-template-columns:1fr}}@media(max-width:899px){.access-heading{display:grid;gap:22px}.temporary-access{max-width:none;display:flex;align-items:center;border-left:0;border-top:1px solid var(--bz-border);padding:18px 0 0;gap:20px}.temporary-access>span{flex:1}.discovery-layout{grid-template-columns:1fr}.catalog-list{grid-template-columns:repeat(2,minmax(0,1fr))}.workflow-preview{position:static;padding:24px 0 0;border-left:0;border-top:1px solid var(--bz-border)}.preview-flow{grid-template-columns:1fr 1fr}.purchase{grid-template-columns:1fr;gap:24px}.access-footer{align-items:start;flex-direction:column}}@media(max-width:540px){.access-inner{padding:20px 16px;gap:28px}.catalog-list{grid-template-columns:1fr}.section-heading{display:block}.catalog-count{margin-top:12px}.catalog-controls{flex-direction:column;align-items:stretch;margin:18px 0}.catalog-controls select{max-width:none;width:100%}.preview-flow{gap:18px;grid-template-columns:1fr}.discovery-item{padding:18px}.temporary-access{align-items:start}.temporary-access button{flex-shrink:0}.purchase-actions{gap:8px}.purchase-price{align-items:center}.workspace-access h2{font-size:25px}}@media(prefers-reduced-motion:reduce){.discovery-item{transition:none}}

.access-heading .temporary-access{border:0;padding:0;flex:0 0 auto;max-width:none}.workflow-showcase{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:32px;align-items:stretch}.workflow-invitation{position:relative;isolation:isolate;overflow:hidden;padding:32px;border:1px solid var(--bz-border);border-radius:var(--bz-r-lg);background:var(--bz-panel)}.workflow-landscape{position:absolute;inset:auto 0 0;width:100%;height:auto;z-index:-1;color:var(--bz-accent);pointer-events:none}.workflow-invitation>h2{font:900 italic clamp(32px,3vw,48px)/1.13 var(--bz-font-metric);margin:16px 0 28px;max-width:18ch}.workflow-invitation>h2 em{color:var(--bz-accent)}.featured-workflows{display:grid;gap:10px}.featured-workflows button{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:16px;background:var(--bz-canvas);border:1px solid var(--bz-border);border-radius:12px;color:var(--bz-fg);font:inherit;cursor:pointer}.featured-workflows button[aria-pressed=true]{border-color:var(--bz-accent)}.featured-workflows button>span:nth-child(2){flex:1;min-width:0}.featured-workflows strong,.featured-workflows small{display:block}.featured-workflows strong{font-size:16px}.featured-workflows small{font-size:13px;color:var(--bz-fg-mid);line-height:1.5;margin-top:4px}.featured-workflows .material-symbols-outlined{color:var(--bz-accent)}.workflow-explore{display:inline-flex;align-items:center;gap:12px;color:var(--bz-fg);margin-top:28px;font-size:14px}.workflow-showcase .workflow-preview{position:static;display:flex;flex-direction:column;padding:28px;border:1px solid var(--bz-border);border-radius:var(--bz-r-lg);background:var(--bz-panel)}.workflow-preview h2{font:900 italic 28px/1.2 var(--bz-font-metric)}.workflow-preview .preview-actions{margin-top:auto;padding-top:24px}.preview-setup summary{cursor:pointer;font-size:14px;color:var(--bz-fg);padding:12px 0}.preview-flow{padding:20px 0}.discovery-layout{display:block}.catalog-list{grid-template-columns:repeat(3,minmax(0,1fr))}.discovery-item__body>span:last-child{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.section-heading h2{font:900 italic 26px/1.2 var(--bz-font-metric)}#discovery-title{scroll-margin-top:24px}.workflow-invitation{animation:workflow-arrival .35s ease-out}@keyframes workflow-arrival{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.workflow-invitation{animation:none}}@media(max-width:1100px){.catalog-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:800px){.workflow-showcase{grid-template-columns:1fr}.workflow-invitation,.workflow-showcase .workflow-preview{padding:20px}.catalog-list{grid-template-columns:1fr}.workflow-invitation>h2{font-size:34px}}

.workspace-access #purchase-title { font: 900 italic 26px/1.2 var(--bz-font-metric); }
.purchase-price { flex-wrap: wrap; gap: 10px 18px; }
.purchase-price > span { max-width: none; white-space: nowrap; color: var(--bz-accent); background: var(--bz-accent-soft); border: 1px solid var(--bz-border-brand); border-radius: var(--bz-r-sm, 6px); padding: 8px 10px; font-size: 12px; font-weight: 500; }
</style>
