<template>
  <section v-if="!incomingOnly || state.incoming.length" class="sales company-screen" data-i18n-skip>
    <p v-if="error" role="alert">{{ error }}</p>
    <article v-for="handoff in state.incoming" :key="handoff.id" class="sales-card">
      <h3>{{ handoff.subject }}</h3><p>{{ handoff.team }} · {{ t('Accepted work', 'Travaux acceptés') }}</p>
      <label>{{ t('Receiving site', 'Site destinataire') }}<select v-model="siteIds[handoff.id]"><option value="">{{ t('Choose a site', 'Choisir un site') }}</option><option v-for="site in sites" :key="site.id" :value="site.id">{{ site.name }}</option></select></label>
      <button class="bz-btn bz-btn--primary" :disabled="busy || !siteIds[handoff.id]" @click="accept(handoff)">{{ t('Create intervention', 'Créer l’intervention') }}</button>
    </article>
    <template v-if="!incomingOnly">
      <header class="sales-heading"><h3>{{ t('Customers & sales', 'Clients et ventes') }}</h3><button class="bz-btn bz-btn--primary" @click="edit(null)">{{ t('New customer case', 'Nouveau dossier client') }}</button></header>
      <CompanyMetricStrip :items="salesMetrics" @select="item=>caseFilter=caseFilter===item.id?'':item.id" />
      <div class="sales-grid">
        <aside>
         <label class="company-search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="query" :placeholder="ui('Search customer cases')" :aria-label="ui('Search customer cases')" /></label>
         <div v-if="caseFilter" class="sales-filter"><span class="company-caption">{{ salesMetrics.find(m=>m.id===caseFilter)?.label }}</span><button class="bz-btn bz-btn--ghost bz-btn--sm" @click="caseFilter=''">{{ ui('Clear filters') }}</button></div>
         <p v-if="!state.records.length" class="company-muted">{{ t('Start with an enquiry, renewal or customer feedback.', 'Commencez par une demande, un renouvellement ou un retour client.') }}</p>
         <p v-else-if="!filteredRecords.length" class="company-muted">{{ ui('No matching records.') }}</p>
         <button v-for="record in filteredRecords" :key="record.id" class="sales-card sales-select" :class="{selected:form?.id===record.id}" :aria-pressed="form?.id===record.id" @click="edit(record)"><strong>{{ record.title }}</strong><span>{{ record.customer }}</span><span class="sales-record-meta"><span>{{ stageName(record.stage) }}</span><small v-if="record.nextAt" :class="{'is-due':isDue(record)}">{{ t('Follow-up', 'Suivi') }} · {{ new Date(record.nextAt).toLocaleDateString(i18n.state.locale) }}</small></span></button>
        </aside>
        <form v-if="form" class="sales-card" @submit.prevent="save">
          <header class="sales-record-head"><span class="company-caption">{{ form.customer || t('New prospect','Nouveau prospect') }}</span><h3>{{ form.title || t('New customer case','Nouveau dossier client') }}</h3></header>
          <ol class="sales-progress"><li v-for="stage in visibleStages" :key="stage" :class="{selected:form.stage===stage}">{{ stageName(stage) }}</li></ol>
          <fieldset class="sales-fields" :disabled="!!form.handoff">
            <label>{{ t('Type', 'Type') }}<select v-model="form.type" @change="form.stage='enquiry'"><option v-for="type in types" :key="type[0]" :value="type[0]">{{ t(type[1],type[2]) }}</option></select></label>
            <label>{{ t('Status', 'État') }}<select v-model="form.stage"><option v-for="stage in visibleStages" :key="stage" :value="stage">{{ stageName(stage) }}</option></select></label>
            <label>{{ t('Subject', 'Objet') }}<input v-model="form.title" required /></label>
            <label>{{ t('Customer', 'Client') }}<select v-model="form.clientId" @change="form.customer=state.clients?.find(c=>c.id===form.clientId)?.name || form.customer"><option :value="null">{{ t('New prospect','Nouveau prospect') }}</option><option v-for="client in state.clients || []" :key="client.id" :value="client.id">{{ client.name }}</option></select></label><label v-if="!form.clientId">{{ t('Prospect name','Nom du prospect') }}<input v-model="form.customer" required /></label>
            <label class="sales-wide">{{ t('Request / agreed scope', 'Demande / périmètre convenu') }}<textarea v-model="form.scope" rows="5" required /></label>
            <label v-if="['opportunity','renewal'].includes(form.type)">{{ t('Quote excluding VAT (€)', 'Devis hors taxes (€)') }}<input v-model="amount" type="number" min="0" step="0.01" /></label>
            <label>{{ t('Next follow-up', 'Prochain suivi') }}<input v-model="followup" type="date" /></label>
            <label class="sales-wide">{{ t('Customer decision evidence', 'Justificatif de la décision client') }}<input v-model="form.evidenceReference" :required="['accepted','lost','closed'].includes(form.stage)" /></label>
          </fieldset>
          <button v-if="!form.handoff" class="bz-btn bz-btn--primary" :disabled="busy">{{ t('Save', 'Enregistrer') }}</button>
          <p v-else>{{ t('Scope shared with maintenance. Continue changes in the team chat.', 'Périmètre transmis à la maintenance. Poursuivez les échanges dans la discussion interéquipes.') }}</p>
          <div v-if="form.id && form.stage==='accepted' && !form.handoff" class="sales-handoff">
            <label>{{ t('Receiving team', 'Équipe destinataire') }}<select v-model="targetId" @change="targetRole='' "><option value="">{{ t('Select team', 'Choisir une équipe') }}</option><option v-for="team in state.teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label>
            <label>{{ t('Receiving member', 'Membre destinataire') }}<select v-model="targetRole"><option v-for="role in targetRoles" :key="role" :value="role">{{ roleLabel(role) }}</option></select></label>
            <button type="button" class="bz-btn bz-btn--ghost" :disabled="busy || !targetRole" @click="handoff">{{ t('Share accepted work', 'Transmettre les travaux acceptés') }}</button>
          </div>
        </form>
        <div v-else class="company-empty"><span class="material-symbols-outlined" aria-hidden="true">handshake</span><h3>{{ ui('Select a customer case') }}</h3><p>{{ ui('Review the request, prepare the proposal and track the next follow-up.') }}</p></div>
      </div>
    </template>
  </section>
</template>
<script setup>
import "./company-design.css";
import { useCompanyDraft } from "../../services/company/viewDrafts.js";
import {ref,reactive,computed,onMounted,onUnmounted} from 'vue';
import CompanyMetricStrip from './CompanyMetricStrip.vue';
import {formatRoleTitle} from '../../services/company/presentation.js';
import {operationText} from '../../i18n/operations.js';
import {i18n} from '../../i18n/index.js';
const props=defineProps({companyId:String,incomingOnly:Boolean,sites:{type:Array,default:()=>[]}}), emit=defineEmits(['open-work-order']);
const ui=text=>operationText(text,i18n.state.locale);
const t=(en,fr)=>i18n.state.locale.startsWith('fr')?fr:operationText(en,i18n.state.locale);
const state=ref({records:[],incoming:[],teams:[],clients:[]}),form=ref(null),amount=ref(''),followup=ref(''),error=ref(''),busy=ref(false),targetId=ref(''),targetRole=ref(''),siteIds=reactive({});
useCompanyDraft(() => props.companyId + (props.incomingOnly ? ':sales-incoming' : ':sales'), {form, amount, followup, targetId, targetRole});
const query=ref(''),caseFilter=ref('');
const isDue=r=>r.nextAt && r.nextAt<=Date.now() && !['lost','closed'].includes(r.stage);
const filteredRecords=computed(()=>state.value.records.filter(r=>(!caseFilter.value || (caseFilter.value==='followup'?isDue(r):caseFilter.value==='active'?!['closed','lost'].includes(r.stage):r.stage===caseFilter.value)) && [r.title,r.customer,r.scope].some(v=>String(v||'').toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase()))));
const salesMetrics=computed(()=>[
 {id:'active',label:t('Open cases','Dossiers ouverts'),value:state.value.records.filter(r=>!['closed','lost'].includes(r.stage)).length,icon:'folder_open',action:true,selected:caseFilter.value==='active'},
 {id:'followup',label:t('Follow-ups due','Relances à effectuer'),value:state.value.records.filter(isDue).length,icon:'event',action:true,tone:state.value.records.some(isDue)?'warning':null,selected:caseFilter.value==='followup'},
 {id:'proposal',label:t('Proposal','Devis'),value:state.value.records.filter(r=>r.stage==='proposal').length,icon:'request_quote',action:true,selected:caseFilter.value==='proposal'},
 {id:'accepted',label:t('Accepted','Accepté'),value:state.value.records.filter(r=>r.stage==='accepted').length,icon:'handshake',action:true,selected:caseFilter.value==='accepted'},
]);
const api=()=>{const value=window.electronAPI?.db?.companySales;if(!value)throw new Error(t('Restart BonzAI to enable Sales.', 'Redémarrez BonzAI pour activer les ventes.'));return value;};
const visibleStages=computed(()=>['complaint','satisfaction'].includes(form.value?.type)?['enquiry','qualified','closed']:['enquiry','qualified','proposal','accepted','lost','closed']);
const types=[['opportunity','Opportunity','Opportunité'],['renewal','Contract renewal','Renouvellement'],['complaint','Complaint','Réclamation'],['satisfaction','Customer feedback','Retour client']];
const stageName=s=>({enquiry:t('Enquiry','Demande'),qualified:t('Qualified','Qualifié'),proposal:t('Proposal','Devis'),accepted:t('Accepted','Accepté'),lost:t('Lost','Perdu'),closed:t('Closed','Clôturé')})[s];
const targetRoles=computed(()=>state.value.teams.find(t=>t.id===targetId.value)?.roles||[]);
const roleLabel=role=>formatRoleTitle(role,i18n.state.locale);
async function load(){try{state.value=await api().snapshot(props.companyId);}catch(e){error.value=e.message;}}
function edit(r){form.value=r?JSON.parse(JSON.stringify(r)):{type:'opportunity',stage:'enquiry',title:'',customer:'',clientId:null,scope:'',evidenceReference:''};amount.value=r?.amountCents!=null?r.amountCents/100:'';followup.value=r?.nextAt?new Date(r.nextAt).toISOString().slice(0,10):'';}
async function act(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();await load();}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function save(){await act(async()=>{form.value=await api().saveRecord(props.companyId,{...JSON.parse(JSON.stringify(form.value)),amountCents:amount.value===''?null:Math.round(Number(amount.value)*100),nextAt:followup.value?new Date(followup.value+'T12:00:00').getTime():null});});}
async function handoff(){await act(async()=>{form.value=await api().handoff(props.companyId,{id:form.value.id,revision:form.value.revision,targetTeamId:targetId.value,targetRole:targetRole.value,confirmed:true});});}
async function accept(h){await act(async()=>{const result=await api().acceptHandoff(props.companyId,{conversationId:h.id,siteId:siteIds[h.id],confirmed:true});emit('open-work-order',result.workOrderId);});}
let off;onMounted(()=>{load();off=window.electronAPI?.db?.companySales?.onChanged?.(e=>{if(e.companyId===props.companyId)load();});});onUnmounted(()=>off?.());
</script>
<style scoped>
.sales{padding:1rem 0;color:var(--bz-fg)}.sales-heading{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1.5rem}.sales-grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(0,2fr);gap:1.5rem}.sales-card{border:1px solid var(--bz-border);border-radius:16px;padding:1.5rem;background:var(--bz-surface);margin-bottom:1rem}.sales-select{width:100%;text-align:left;display:grid;gap:.65rem;color:inherit;cursor:pointer}.selected{border-color:var(--bz-accent);background:var(--bz-raised)}.sales-fields{border:0;padding:0;min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.5rem 0}.sales label{display:grid;gap:.5rem}.sales input,.sales textarea,.sales select{width:100%;min-width:0;padding:.7rem;font:inherit;border:1px solid var(--bz-border);border-radius:8px;background:var(--bz-bg);color:inherit}.sales-wide{grid-column:1/-1}.sales-progress{list-style:none;display:flex;flex-wrap:wrap;gap:.5rem;padding:0}.sales-progress li{padding:.5rem .7rem;border-radius:8px;border:1px solid var(--bz-border)}.sales-handoff{display:grid;gap:1rem;margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--bz-border)}@media(max-width:800px){.sales-grid,.sales-fields{grid-template-columns:1fr}.sales-heading{align-items:flex-start;flex-direction:column}}
.sales-filter{display:flex;justify-content:space-between;align-items:center;padding:12px 0}.sales-record-head h3{font:italic 900 26px/1.25 var(--bz-font-metric);margin:8px 0 20px;overflow-wrap:anywhere}.sales-record-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}.sales .sales-record-meta .is-due{color:var(--bz-warning)}
</style>
