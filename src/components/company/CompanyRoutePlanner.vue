<template>
  <details class="route company-screen" data-i18n-skip>
    <summary><span class="material-symbols-outlined" aria-hidden="true">route</span>{{ t('Plan a technician route', 'Planifier une tournée') }}</summary>
    <form @submit.prevent="preview" @input="plan=null" @change="plan=null">
      <div class="route-fields"><label>{{ t('Technician', 'Technicien') }}<input v-model="technician" required /></label><label>{{ t('Departure', 'Départ') }}<input v-model="start" type="datetime-local" required /></label></div>
      <label>{{ t('Add a visit', 'Ajouter une intervention') }}<select v-model="selected" :aria-label="t('Add a visit', 'Ajouter une intervention')"><option value="">{{ t('Choose a visit', 'Choisir une intervention') }}</option><option v-for="work in available" :key="work.id" :value="work.id">{{ work.title }}</option></select></label>
      <button type="button" class="bz-btn bz-btn--ghost" :disabled="!selected" @click="stops.push({workOrderId:selected,travelMinutes:0});selected='';plan=null">{{ t('Add', 'Ajouter') }}</button>
      <ol><li v-for="(stop,index) in stops" :key="stop.workOrderId"><strong>{{ orders.find(o=>o.id===stop.workOrderId)?.title }}</strong><label>{{ t('Travel from previous stop (min)', 'Trajet depuis l’étape précédente (min)') }}<input v-model.number="stop.travelMinutes" type="number" min="0" max="1440" required /></label><button type="button" class="bz-iconbtn" :disabled="index===0" :aria-label="t('Move earlier','Avancer')" @click="move(index)"><span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span></button><button type="button" class="bz-iconbtn" :aria-label="t('Remove visit','Retirer l’intervention')" @click="stops.splice(index,1);plan=null"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></li></ol>
      <label>{{ t('Travel-time source', 'Source des temps de trajet') }}<input v-model="reference" required /></label>
      <p>{{ t('Use reviewed travel times. Existing visits, parts availability and contract checks remain in effect.', 'Renseignez des temps de trajet vérifiés. Les contrôles de planning, de pièces et de contrat restent applicables.') }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <button class="bz-btn bz-btn--ghost" :disabled="busy || !stops.length">{{ t('Preview route', 'Aperçu de la tournée') }}</button>
    </form>
    <section v-if="plan" class="route-preview"><p v-for="stop in plan.stops" :key="stop.workOrderId"><strong>{{ new Date(stop.scheduledAt).toLocaleTimeString(i18n.state.locale, {hour:'2-digit',minute:'2-digit'}) }}</strong> · {{ stop.title }} · {{ stop.durationMinutes }} min</p><button class="bz-btn bz-btn--primary" :disabled="busy" @click="apply">{{ t('Confirm schedule', 'Confirmer le planning') }}</button></section>
  </details>
</template>
<script setup>
import "./company-design.css";
import {ref,computed} from 'vue';
import {useCompanyDraft} from '../../services/company/viewDrafts.js';
import {operationText} from '../../i18n/operations.js';
import {i18n} from '../../i18n/index.js';
const props=defineProps({companyId:String,orders:{type:Array,default:()=>[]}});
const t=(en,fr)=>i18n.state.locale.startsWith('fr')?fr:operationText(en,i18n.state.locale);
const technician=ref(''),start=ref(''),stops=ref([]),selected=ref(''),reference=ref(''),plan=ref(null),error=ref(''),busy=ref(false);
useCompanyDraft(() => props.companyId + ':route', {technician,start,stops,reference});
const available=computed(()=>props.orders.filter(o=>!['completed','cancelled'].includes(o.status)&&!stops.value.some(s=>s.workOrderId===o.id)));
const api=()=>window.electronAPI.db.gmaoMaintenance;
function move(i){const s=stops.value.splice(i,1)[0];stops.value.splice(i-1,0,s);plan.value=null;}
async function preview(){busy.value=true;error.value='';try{plan.value=await api().planRoute(props.companyId,{technician:technician.value,startAt:new Date(start.value).getTime(),stops:JSON.parse(JSON.stringify(stops.value))});}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function apply(){busy.value=true;error.value='';try{await api().applyRoute(props.companyId,{...JSON.parse(JSON.stringify(plan.value)),confirmed:true,evidenceReference:reference.value});plan.value=null;stops.value=[];}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<style scoped>
.route{border:1px solid var(--bz-border);border-radius:14px;padding:1.25rem;margin-bottom:1.5rem;background:var(--bz-surface)}summary{display:flex;align-items:center;gap:.6rem;cursor:pointer}form{display:grid;gap:1rem;margin-top:1.5rem}.route-fields{display:grid;grid-template-columns:1fr 1fr;gap:1rem}label{display:grid;gap:.5rem}input,select{min-width:0;width:100%;padding:.75rem;font:inherit;background:var(--bz-bg);border:1px solid var(--bz-border);border-radius:8px;color:var(--bz-fg)}ol{padding:0;list-style:none;display:grid;gap:1rem}li{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}li strong{flex:1;min-width:12rem}li label{max-width:18rem}form>button{justify-self:start}.route-preview{padding-top:1rem;margin-top:1rem;border-top:1px solid var(--bz-border)}@media(max-width:700px){.route-fields{grid-template-columns:1fr}li{align-items:flex-end}}
</style>
