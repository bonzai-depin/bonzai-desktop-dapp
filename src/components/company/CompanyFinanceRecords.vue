<template>
  <section class="finance-records company-screen" data-i18n-skip>
    <header><span class="material-symbols-outlined" aria-hidden="true">account_balance</span><div><h3>{{ $ui('Financial evidence') }}</h3><p>{{ $ui('Import financial records into Results.') }}</p></div></header>
    <div class="finance-records__controls">
      <label>{{ $ui('Account') }}<select v-model="connectorId" :disabled="busy"><option value="">{{ $ui('Select account') }}</option><option v-for="item in accounts" :key="item.id" :value="item.id">{{ item.label || item.kind }}{{ item.accountIdentifier ? ` · ${item.accountIdentifier}` : '' }}</option></select></label>
      <label>{{ $ui('Records') }}<select v-model="action" :disabled="busy"><option v-for="[key, spec] in actions" :key="key" :value="key">{{ $ui(spec.summary) }}</option></select></label>
      <label v-if="action === 'qonto.listTransactions'">{{ $ui('Bank account ID') }}<input v-model.trim="bankAccountId" :disabled="busy" :placeholder="$ui('Get from organization below')" /></label>
      <label v-if="dated">{{ $ui('From') }}<input v-model="from" type="date" :disabled="busy" /></label>
      <label v-if="dated">{{ $ui('Until (exclusive)') }}<input v-model="to" type="date" :disabled="busy" /></label>
      <label v-if="FINANCE_ACTIONS[action]?.collection">{{ $ui('Resume cursor (optional)') }}<input v-model.trim="cursor" :disabled="busy" :placeholder="$ui('Start from first page')" /></label>
      <button class="bz-btn bz-btn--primary" :disabled="busy || !connectorId || !action" @click="load">{{ $ui(busy ? 'Importing…' : 'Import records') }}</button>
    </div>
    <p v-if="error" role="alert" class="finance-records__notice finance-records__error">{{ $ui(error) }}</p>
    <p v-if="notice" role="status" class="finance-records__notice">{{ $ui(notice, {cursor: result?.nextCursor}) }}</p>
    <details v-if="result"><summary>{{ $ui('Inspect imported evidence') }}</summary><CompanyArtifactPreview :row="{ pipeline: 'text', meta: { format: 'json' }, payload: result }" /></details>
  </section>
</template>
<script setup>
import "./company-design.css";
import { computed, ref, watch } from 'vue';
import CompanyArtifactPreview from './CompanyArtifactPreview.vue';
import { FINANCE_ACTIONS } from '../../services/company/finance/actions.js';
import { collectFinancePages } from '../../services/company/finance/executor.js';
import { executeConnectorAction } from '../../services/company/connectorExecutors.js';
import { publishContent } from '../../services/company/distribution.solo.js';
const props = defineProps({ companyId: { type: String, required: true }, connectors: { type: Array, default: () => [] } });
const connectorId = ref(''), action = ref(''), bankAccountId = ref(''), cursor = ref(''), from = ref(''), to = ref('');
const busy = ref(false), error = ref(''), notice = ref(''), result = ref(null);
const accounts = computed(() => props.connectors.filter(c => ['stripe', 'qonto'].includes(c.kind) && c.status === 'active'));
const selected = computed(() => accounts.value.find(c => c.id === connectorId.value));
const actions = computed(() => Object.entries(FINANCE_ACTIONS).filter(([key, spec]) => key.startsWith(`${selected.value?.kind}.`) && spec.method === 'GET' && !spec.path.includes(':id')));
const dated = computed(() => ['qonto.listTransactions', 'stripe.listBalanceTransactions'].includes(action.value));
watch(action, () => { cursor.value = ''; });
watch(connectorId, () => { action.value = actions.value[0]?.[0] || ''; result.value = null; notice.value = ''; });
async function load() {
  busy.value = true; error.value = ''; notice.value = ''; result.value = null;
  const type = action.value, account = connectorId.value, companyId = props.companyId;
  try {
    if (dated.value && from.value && to.value && from.value >= to.value) throw new Error('End date must be after start date');
    const params = { connectorId: account, cursor: cursor.value || null, ...(type === 'qonto.listTransactions' ? { bank_account_id: bankAccountId.value, ...(from.value ? { settled_at_from: `${from.value}T00:00:00Z` } : {}), ...(to.value ? { settled_at_to: `${to.value}T00:00:00Z` } : {}) } : type === 'stripe.listBalanceTransactions' ? { from: from.value, to: to.value } : {}) };
    const execute = (key, input) => executeConnectorAction(companyId, key, input);
    result.value = FINANCE_ACTIONS[type].collection ? await collectFinancePages(type, params, execute) : await execute(type, params);
    const saved = await publishContent(companyId, { pipeline: 'text', prompt: `${type} · ${new Date().toISOString()}`, payload: JSON.stringify({ source: type, connectorId: account, importedAt: new Date().toISOString(), filters: params, ...result.value }, null, 2), price: 0, role: 'CFO', meta: { format: 'json', source: type, connectorId: account, complete: result.value.complete !== false } });
    if (!saved?.id) throw new Error('Records retrieved but could not be saved locally. Keep this view open and retry after database recovery.');
    notice.value = result.value.complete === false ? 'Partial import saved in Results. More records remain; next cursor: {cursor}.' : 'Evidence saved in Results.';
  } catch (err) { error.value = err.message || 'Import failed'; }
  finally { busy.value = false; }
}
</script>
<style scoped>
.finance-records { margin: 8px 0; padding: 28px 0; border-block: 1px solid var(--bz-border); color: var(--bz-fg); font: 400 14px/1.55 var(--bz-font-body); min-width: 0; }
.finance-records header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 24px; }
.finance-records header > .material-symbols-outlined { font-size: 23px; color: var(--bz-fg-mid); margin-top: 2px; }
.finance-records h3 { margin: 0 0 8px; font: italic 900 23px/1.25 var(--bz-font-metric); }
.finance-records p { color: var(--bz-fg-mid); font-size: 13px; line-height: 1.65; margin: 0; overflow-wrap: anywhere; }
.finance-records__controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: 20px 16px; }
.finance-records label { display: grid; gap: 8px; font-size: 13px; color: var(--bz-fg-mid); min-width: 0; }
.finance-records input, .finance-records select { box-sizing: border-box; width: 100%; min-height: 44px; background: var(--bz-panel); color: var(--bz-fg); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-sm); padding: 10px 12px; font: 400 14px/1.5 var(--bz-font-body); min-width: 0; }
.finance-records :is(input, select):focus-visible { outline: 2px solid var(--bz-accent); outline-offset: 3px; border-color: var(--bz-accent); }
.finance-records__controls > button { min-height: 44px; justify-self: start; }
.finance-records details { margin-top: 24px; border-top: 1px solid var(--bz-border); padding-top: 18px; }
.finance-records summary { color: var(--bz-fg); font-size: 14px; cursor: pointer; margin-bottom: 16px; }
.finance-records .finance-records__notice { margin-top: 20px; padding: 14px 16px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-panel); }
.finance-records .finance-records__error { color: var(--bz-danger); border-color: color-mix(in srgb, var(--bz-danger) 35%, var(--bz-border)); background: var(--bz-danger-soft); }
@media (max-width: 1000px) { .finance-records__controls { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 540px) { .finance-records__controls { grid-template-columns: minmax(0, 1fr); } .finance-records header { gap: 10px; } }
</style>
