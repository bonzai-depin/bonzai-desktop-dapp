<script setup>
import "./company-design.css";
import { getAvailableAgentWorkflows } from '../../services/agentWorkflows.js';
import CompanyBusinessDemo from './CompanyBusinessDemo.vue';
import {computed,ref,watch,onMounted,onUnmounted} from 'vue';
import {guideReadiness,teamGettingStarted,teamDemoKinds,TEAM_FAQ,BUSINESS_FAQ} from '../../services/company/gettingStarted.js';
const props=defineProps({charter:{type:Object,required:true},views:{type:Array,default:()=>[]},state:{type:Object,default:()=>({})}});
defineEmits(['open-view']);
const workflow=ref(null);
const isWorkflow=computed(()=>Boolean(props.charter.workspace?.executionWorkflowId));
const guide=computed(()=>teamGettingStarted(props.charter,workflow.value));
const demoKinds=computed(()=>teamDemoKinds(props.charter));
const overview=ref({}),error=ref('');let off;
async function load(){const id=props.charter.id;try{const api=window.electronAPI?.db?.companyWorkspace;if(api && !isWorkflow.value){const result=await api.overview(id);if(props.charter.id===id)overview.value=result;}}catch(e){if(props.charter.id===id)error.value=e.message;}}
async function loadWorkflow(){ const id=props.charter.workspace?.executionWorkflowId;if(!id)return;try{const found=(await getAvailableAgentWorkflows()).find(item=>item.id===id)||null;if(props.charter.workspace?.executionWorkflowId===id)workflow.value=found;}catch{ /* The ID-specific guide remains available when the catalog cannot load. */ } }
watch(()=>[props.charter.id,props.charter.workspace?.executionWorkflowId],()=>{workflow.value=null;overview.value={};error.value='';load();loadWorkflow();},{immediate:true});
onMounted(()=>{off=window.electronAPI?.db?.issues?.onChanged?.(e=>{if(e.companyId===props.charter.id)load();});});onUnmounted(()=>off?.());
const readiness=title=>guideReadiness(title,overview.value,{...props.state,mission:props.charter.mission});
const query=ref('');
const faqs=computed(()=>isWorkflow.value ? guide.value.faq : [...(guide.value.faq || BUSINESS_FAQ[guide.value.profile] || []),...TEAM_FAQ.filter(f=>(f[2]!=='grants'||guide.value.profile==='grants') && !guide.value.faq?.some(item=>item[0]===f[0]))]);
const destinations=computed(()=>props.views.filter(v=>!v.utility && v.key!=='getting-started'));
</script>
<template>
 <section class="team-guide company-screen" data-i18n-skip>
  <header><h2 class="fira-sans-condensed-black-italic">{{ $ui('Your first result') }}</h2><p>{{ $ui(guide.introduction || 'Follow these steps in order. Each step opens the workspace where the work happens.') }}</p></header>
  <p v-if="error" role="alert">{{ $ui(error) }}</p>
  <div class="guide-layout">
   <section class="guide-path">
  <ol class="guide-steps">
   <li :class="{'is-recorded':readiness(title)?.recorded}" v-for="([title,target,body],i) in guide.steps" :key="i"><span class="guide-number bz-metric">{{ i+1 }}</span><div><h3>{{ $ui(title) }} <small v-if="readiness(title)">{{ $ui(readiness(title).recorded ? 'Recorded' : 'Not started') }}<template v-if="readiness(title).count !== undefined"> · {{ readiness(title).count }}</template></small></h3><p>{{ $ui(body) }}</p></div><button class="bz-btn" @click="$emit('open-view',target)">{{ $ui('Open workspace') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button></li>
  </ol>
   </section>
   <aside class="guide-outcomes">
    <span class="company-caption">{{ $ui('What you get') }}</span>
    <ul><li v-for="outcome in guide.outcomes" :key="outcome"><span class="material-symbols-outlined" aria-hidden="true">check</span><span>{{ $ui(outcome) }}</span></li></ul>
    <button class="bz-btn" @click="$emit('open-view','deliverables')">{{ $ui('Results') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
   </aside>
  </div>
  <CompanyBusinessDemo v-if="demoKinds.length" :key="charter.id" :kinds="demoKinds" :saved-result="charter.demoResult" />
  <section><h2 class="fira-sans-condensed-black-italic">{{ $ui('Explore this workflow') }}</h2><div class="guide-shortcuts"><button v-for="view in destinations" :key="view.key" class="bz-btn" @click="$emit('open-view',view.key)"><span class="material-symbols-outlined" aria-hidden="true">{{ view.icon }}</span>{{ $ui(view.label) }}</button></div></section>
  <section><h2 class="fira-sans-condensed-black-italic">{{ $ui('Questions and answers') }}</h2><input v-model="query" :placeholder="$ui('Search help')" :aria-label="$ui('Search help')" class="input"/><details v-for="[question,answer,target] in faqs.filter(f=>!query || ($ui(f[0])+' '+$ui(f[1])).toLocaleLowerCase().includes(query.toLocaleLowerCase()))" :key="question"><summary>{{ $ui(question) }}</summary><p>{{ $ui(answer) }}</p><button class="bz-btn" @click="$emit('open-view',target)">{{ $ui('Open workspace') }}</button></details><p v-if="query && !faqs.some(f=>($ui(f[0])+' '+$ui(f[1])).toLocaleLowerCase().includes(query.toLocaleLowerCase()))">{{ $ui('No matching questions. Clear the search or ask the team in Chat.') }}</p></section>
 </section>
</template>
<style scoped>
.team-guide {display:grid;gap:40px;width:100%;min-width:0;margin:0;color:var(--bz-fg);}
.team-guide h2 {font-size:24px;margin:0 0 12px;}
.team-guide h3 small{font:400 13px var(--bz-font-ui);color:var(--bz-fg-mid);margin-left:12px;}
.team-guide h3 {font-size:17px;margin:0 0 8px;}
.team-guide p {line-height:1.65;color:var(--bz-fg-mid);margin:0;}
.guide-steps {list-style:none;padding:0;margin:0;display:grid;gap:12px;}
.guide-steps li {display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:20px;align-items:start;padding:24px 0;border:0;border-bottom:1px solid var(--bz-border);border-radius:0;background:transparent;}
.guide-number {font-size:28px;color:var(--bz-accent);}
.guide-shortcuts {display:flex;gap:8px;flex-wrap:wrap;}
.team-guide details {padding:20px 0;border-bottom:1px solid var(--bz-border);}
.team-guide summary {cursor:pointer;font-weight:600;line-height:1.5;}
.team-guide details p {margin:16px 0;}
.team-guide input {display:block;width:100%;max-width:480px;min-height:44px;margin:8px 0;padding:10px 14px;border:1px solid var(--bz-border);border-radius:10px;background:var(--bz-panel);color:var(--bz-fg);font:inherit;outline:none;box-shadow:none;}
.team-guide input:focus {border-color:var(--bz-accent);}
.team-guide input::placeholder {color:var(--bz-fg-mid);}
.team-guide ul {padding-left:20px;line-height:1.65;color:var(--bz-fg-mid);}
@media(max-width:650px){.guide-steps li{grid-template-columns:28px minmax(0,1fr);padding:18px;gap:12px}.guide-steps .bz-btn{grid-column:2;justify-self:start}.team-guide h2{font-size:24px}}
.guide-layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(240px,1fr);gap:32px;align-items:start}.guide-outcomes{border-left:1px solid var(--bz-border);padding:0 0 0 24px;min-width:0}.guide-outcomes ul{list-style:none;padding:0;display:grid;gap:18px;margin:20px 0 24px}.guide-outcomes li{display:flex;align-items:start;gap:12px;font-size:14px}.guide-outcomes .material-symbols-outlined{font-size:19px;margin-top:3px;color:var(--bz-fg-low)}.guide-steps .is-recorded .guide-number{color:var(--bz-success)}.guide-steps li:first-child{padding-top:0}.team-guide>section:last-child{border-top:1px solid var(--bz-border);padding-top:32px}.team-guide details{max-width:none}.team-guide summary{font-weight:500;padding:4px 0}
@media(max-width:1000px){.guide-layout{grid-template-columns:1fr}.guide-outcomes{max-width:none;border-left:0;border-top:1px solid var(--bz-border);padding:24px 0 0}.guide-outcomes ul{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}
.team-guide .bz-btn { min-height: 42px; height: auto; white-space: normal; line-height: 1.4; }
.team-guide :is(h2,h3,p,li,summary) { overflow-wrap: anywhere; }
.team-guide summary:focus-visible { outline: 2px solid var(--bz-border-brand); outline-offset: 4px; }
</style>
