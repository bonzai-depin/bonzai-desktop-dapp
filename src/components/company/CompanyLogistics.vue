<template>
  <section class="logistics company-screen">
    <p class="logistics-intro">{{ ui('GMAO defines the need and installation date. Purchasing manages supply and delivery. Changes are shared in the linked team conversation.', 'La GMAO définit le besoin et la date d’intervention. Les achats gèrent l’approvisionnement et la livraison. Les changements sont partagés dans la discussion liée entre équipes.') }}</p>
    <label>{{ ui('Purchase request', 'Demande d’achat') }}<select v-model="requestId" :aria-label="ui('Purchase request', 'Demande d’achat')"><option value="">{{ ui('Select a request', 'Choisir une demande') }}</option><option v-for="r in data.requests" :key="r.id" :value="r.id">{{ r.title }}</option></select></label>
    <p v-if="!data.requests.length">{{ ui('Create a purchase request or share one from GMAO first.', 'Créez une demande d’achat ou transmettez-en une depuis la GMAO.') }}</p>
    <form v-if="request" @submit.prevent="save">
      <div class="logistics-link" v-if="request.sourceCompanyId"><span class="material-symbols-outlined" aria-hidden="true">sync_alt</span>{{ ui('Linked intervention', 'Intervention liée') }} · {{ request.context?.workOrderNumber || request.context?.title || request.workOrderId }}<span v-if="request.sourceScheduledAt"> · {{ new Date(request.sourceScheduledAt).toLocaleString(i18n.state.locale) }}</span></div>
      <ol class="logistics-progress"><li v-for="(stage, index) in stages" :key="stage" :class="{ current: form.stage === stage }"><span class="bz-metric">{{ index + 1 }}</span>{{ stageName(stage) }}</li></ol>
      <div class="logistics-metrics">
        <div><span>{{ ui('Expected job cost', 'Coût prévisionnel') }}</span><strong class="bz-metric">{{ money(assessment.expectedCostCents) }}</strong></div>
        <div><span>{{ ui('Expected margin', 'Marge prévisionnelle') }}</span><strong class="bz-metric">{{ percent(assessment.marginPct) }}</strong></div>
        <div><span>{{ ui('Adverse margin', 'Marge défavorable') }}</span><strong class="bz-metric">{{ percent(assessment.adverseMarginPct) }}</strong></div>
        <div><span>{{ ui('Indicative price at target margin', 'Prix indicatif à la marge cible') }}</span><strong class="bz-metric">{{ money(assessment.suggestedSaleCents) }}</strong></div>
      </div>
      <ul v-if="assessment.warnings.length" class="logistics-warnings"><li v-for="warning in assessment.warnings" :key="warning">{{ warningLabel(warning) }}</li></ul>
      <h3>{{ ui('Shipment','Expédition') }}</h3>
      <div class="logistics-grid">
        <label>{{ ui('Shipment status', 'État de l’expédition') }}<select v-model="form.stage"><option v-for="s in stages" :key="s" :value="s">{{ stageName(s) }}</option></select></label>
        <label>{{ ui('Delivery location', 'Lieu de livraison') }}<input v-model="form.deliveryAddress" required /></label>
        <label>{{ ui('Carrier', 'Transporteur') }}<input v-model="form.carrier" /></label>
        <label>{{ ui('Tracking reference', 'Référence de suivi') }}<input v-model="form.trackingReference" /></label>
        <label>{{ ui('Required on site', 'Nécessaire sur site le') }}<input type="datetime-local" v-model="form.requiredDate" /></label>
        <label>{{ ui('Expected delivery', 'Livraison prévue') }}<input type="datetime-local" v-model="form.expectedDate" /></label>
        <label>{{ ui('Delivery terms / Incoterm and named place', 'Conditions de livraison / Incoterm et lieu nommé') }}<input v-model="form.deliveryTerms" /></label>
        <label>{{ ui('Shipment evidence reference', 'Référence de la preuve d’expédition / livraison') }}<input v-model="form.evidenceReference" :required="form.stage !== 'planning'" /></label>
      </div>
      <h3>{{ ui('Delivered costs', 'Coûts rendus sur site') }}</h3>
      <p>{{ ui('EUR excluding recoverable VAT. Freight here replaces freight in the selected supplier quote. Confirm zero costs with evidence; leave unknown costs missing.', 'EUR hors TVA récupérable. Le transport ci-dessous remplace celui du devis fournisseur retenu. Justifiez les coûts nuls ; laissez les coûts inconnus à renseigner.') }}</p>
      <div class="logistics-cost" v-for="cost in form.costs" :key="cost.category">
        <strong>{{ costName(cost.category) }}</strong>
        <label>{{ ui('Certainty', 'Fiabilité') }}<select v-model="cost.status" :aria-label="ui('Certainty', 'Fiabilité')"><option value="missing">{{ ui('Missing', 'À renseigner') }}</option><option value="estimated">{{ ui('Estimated', 'Estimé') }}</option><option value="confirmed">{{ ui('Confirmed', 'Confirmé') }}</option></select></label>
        <label>EUR<input type="number" min="0" step="0.01" v-model="cost.amount" :disabled="cost.status === 'missing'" :required="cost.status !== 'missing'" /></label>
        <label>{{ ui('Source / inclusion reference', 'Source / référence d’inclusion') }}<input v-model="cost.evidence" :required="cost.status === 'confirmed'" /></label>
        <label>{{ ui('Valid until', 'Valable jusqu’au') }}<input type="datetime-local" v-model="cost.expiry" /></label>
      </div>
      <h3>{{ ui('Job margin', 'Marge de l’intervention') }}</h3>
      <div class="logistics-grid">
        <label>{{ ui('Reviewed selling price, excluding tax (optional)', 'Prix de vente validé HT (facultatif)') }}<input v-model="form.sale" type="number" min="0" step="0.01" /></label>
        <label>{{ ui('Other job costs: labour, travel…', 'Autres coûts : main-d’œuvre, déplacements…') }}<input v-model="form.other" type="number" min="0" step="0.01" required /></label>
        <label>{{ ui('Adverse scenario allowance (EUR)', 'Provision scénario défavorable (EUR)') }}<input v-model="form.contingency" type="number" min="0" step="0.01" required /></label>
        <label>{{ ui('Target gross margin (%)', 'Marge brute cible (%)') }}<input v-model="form.targetMarginPct" type="number" min="0" max="99.99" step="0.01" required /></label>
      </div>
      <p>{{ ui('Incomplete costs produce partial totals. No customer quote or invoice is repriced automatically. Shipment delivery does not confirm accepted parts or completed work.', 'Les coûts incomplets produisent des totaux partiels. Aucun devis ni aucune facture client ne sont modifiés automatiquement. Une livraison ne confirme ni la réception conforme des pièces ni la fin de l’intervention.') }}</p>
      <label>{{ ui('Risks, alternatives and next action', 'Risques, alternatives et prochaine action') }}<textarea v-model="form.notes" rows="3" /></label>
      <label v-if="form.stage !== 'planning'" class="logistics-confirm"><input type="checkbox" v-model="form.confirmed" required />{{ ui('I confirm this shipment status against the evidence provided.', 'Je confirme cet état logistique à partir des justificatifs indiqués.') }}</label>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="saved" role="status">{{ ui('Saved. The linked GMAO team has been notified where applicable.', 'Enregistré. L’équipe GMAO liée a été informée le cas échéant.') }}</p>
      <button type="submit" class="bz-btn bz-btn--primary" :disabled="busy">{{ busy ? ui('Saving…','Enregistrement…') : ui('Save logistics assessment', 'Enregistrer le suivi logistique') }}</button>
    </form>
  </section>
</template>
<script setup>
import "./company-design.css";
import { computed, ref, watch } from 'vue';
import {useCompanyDraft} from '../../services/company/viewDrafts.js';
import {operationText} from '../../i18n/operations.js';
import { i18n } from '../../i18n/index.js';
import { purchasing } from '../../services/company/purchasing.js';
import { LOGISTICS_COSTS, LOGISTICS_STAGES, assessLogistics } from '../../shared/purchasingLogistics.js';
const props = defineProps({ companyId: String, data: Object });
const emit = defineEmits(['saved']);
const ui = (en, fr) => i18n.state.locale === 'fr' ? fr : operationText(en,i18n.state.locale);
const requestId = ref(''), form = ref({ costs: [] }), busy = ref(false), error = ref(''), saved = ref(false);
const request = computed(() => props.data.requests.find(r => r.id === requestId.value));
const quote = computed(() => props.data.quotes.find(q => q.id === request.value?.selectedQuoteId));
const stages = LOGISTICS_STAGES;
const stageName = s => ({ planning:ui('Planning','Préparation'),booked:ui('Booked','Réservé'),dispatched:ui('Dispatched','Expédié'),delayed:ui('Delayed','En retard'),delivered:ui('Delivered','Livré') })[s];
const costName = s => ({freight:ui('Freight','Transport'),insurance:ui('Insurance','Assurance'),handling:ui('Handling','Manutention'),customs:ui('Clearance','Dédouanement'),duties:ui('Non-recoverable duties/taxes','Droits / taxes non récupérables'),storage:ui('Storage','Stockage'),lastMile:ui('Final delivery','Livraison finale')})[s];
const dateInput = n => n ? new Date(n - new Date(n).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
const toCents = n => Math.round(Number(n || 0)*100);
const payload = computed(() => ({ ...form.value, requestId: requestId.value,
  salePriceCents: form.value.sale === '' || form.value.sale == null ? null : toCents(form.value.sale),
  otherJobCostsCents: toCents(form.value.other), contingencyCents: toCents(form.value.contingency), targetMarginPct:Number(form.value.targetMarginPct),
  requiredAt: form.value.requiredDate ? new Date(form.value.requiredDate).getTime() : null,
  expectedAt: form.value.expectedDate ? new Date(form.value.expectedDate).getTime() : null,
  costs: form.value.costs.map(c => ({...c, amountCents:toCents(c.amount), validUntil:c.expiry ? new Date(c.expiry).getTime() : null})) }));
const assessment = computed(() => {
  const scheduled = request.value?.sourceScheduledAt;
  const required = payload.value.requiredAt;
  return assessLogistics({...payload.value, requiredAt:scheduled && required ? Math.min(scheduled,required) : scheduled || required}, quote.value);
});
const money = n => n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat(i18n.state.locale,{style:'currency',currency:'EUR'}).format(n/100);
const percent = n => n == null ? '—' : `${n.toFixed(1)} %`;
function warningLabel(value) {
  const [kind, category] = value.split(':');
  if (category) return `${costName(category)} · ${{missing:ui('Cost missing','Coût manquant'),estimated:ui('Estimate to confirm','Estimation à confirmer'),expired:ui('Offer expired','Offre expirée')}[kind]}`;
  return {quote_missing:ui('Select a supplier quotation to calculate full cost.','Retenez un devis fournisseur pour calculer le coût complet.'),quote_expired:ui('Supplier quotation expired.','Devis fournisseur expiré.'),margin_below_target:ui('Adverse margin is below target.','La marge défavorable est inférieure à la cible.'),delivery_late:ui('Expected delivery is later than the required date.','La livraison prévue est postérieure au besoin.'),shipment_delayed:ui('Shipment delayed: review the intervention schedule.','Expédition retardée : revoir le planning d’intervention.')}[value] || value;
}
function reset() {
  const old = props.data.logistics?.find(p => p.requestId === requestId.value);
  form.value = {stage:'planning',deliveryAddress:'',carrier:'',trackingReference:'',deliveryTerms:'',notes:'',targetMarginPct:30,...old,
    sale:old?.salePriceCents == null ? '' : old.salePriceCents/100,other:(old?.otherJobCostsCents||0)/100,contingency:(old?.contingencyCents||0)/100,
    requiredDate:dateInput(old?.requiredAt || request.value?.neededAt),expectedDate:dateInput(old?.expectedAt),confirmed:false,
    costs:LOGISTICS_COSTS.map(category => {const c=old?.costs.find(c=>c.category===category);return {category,status:'missing',evidence:'',...c,amount:c?.amountCents == null?'':c.amountCents/100,expiry:dateInput(c?.validUntil)};})};
  error.value='';saved.value=false;
}
watch(requestId,reset,{flush:'sync'});
useCompanyDraft(() => props.companyId + ':logistics', {requestId,form});
async function save() {
  if(busy.value)return; busy.value=true;error.value='';saved.value=false;
  try { const result=await purchasing.saveLogistics(props.companyId,payload.value);form.value.revision=result.revision;saved.value=true;emit('saved'); }
  catch(e){error.value=e.message;} finally{busy.value=false;}
}
</script>
<style scoped>
.logistics { display:grid;gap:20px;min-width:0; }
.logistics form { display:grid;gap:24px; }
.logistics p { margin:0;color:var(--bz-fg-muted);line-height:1.6; }
.logistics h3 { margin:8px 0 0; }
.logistics label { display:grid;gap:8px;min-width:0;font-size:.875rem; }
.logistics input,.logistics select,.logistics textarea { width:100%;min-width:0;box-sizing:border-box;padding:10px 14px;background:var(--bz-surface);color:var(--bz-fg);border:1px solid var(--bz-border);border-radius:8px; }
.logistics-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px; }
.logistics-cost { display:grid;grid-template-columns:1fr 1fr .7fr 1.5fr 1fr;gap:16px;align-items:end;padding:16px 0;border-bottom:1px solid var(--bz-border); }
.logistics-progress { display:flex;gap:12px;list-style:none;padding:0;margin:0;flex-wrap:wrap; }
.logistics-progress li { display:flex;gap:10px;align-items:center;padding:12px 16px;border-bottom:2px solid var(--bz-border);color:var(--bz-fg-muted); }
.logistics-progress .current {color:var(--bz-fg);border-color:var(--bz-accent);}
.logistics-link {display:flex;gap:10px;align-items:center;}
.logistics-metrics {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;padding:24px 0;border-block:1px solid var(--bz-border);}
.logistics-metrics div {display:grid;gap:12px;}.logistics-metrics strong {font-size:1.65rem;}
.logistics-warnings {margin:0;line-height:1.8;color:var(--bz-fg);}
.logistics form>button {justify-self:start;}.logistics-confirm {display:flex!important;align-items:center;}.logistics-confirm input{width:auto;}
@media(max-width:1000px){.logistics-cost{grid-template-columns:repeat(2,minmax(0,1fr));}.logistics-cost strong{grid-column:1/-1}.logistics-metrics{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:560px){.logistics-grid,.logistics-cost,.logistics-metrics{grid-template-columns:1fr;}}
</style>
