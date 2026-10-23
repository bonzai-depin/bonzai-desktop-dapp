<script setup>
import "./company-design.css";
import {ref,computed,onUnmounted} from 'vue';
import {demoGuide} from '../../services/company/demoGuide.js';
const props=defineProps({embedded:{type:Boolean,default:false},savedResult:{type:Object,default:null},kinds:{type:Array,default:()=>['hvac','billing','grants']}});
const result=ref(props.savedResult),busy=ref(false),error=ref(''),selected=ref(0);
const api=window.electronAPI?.workspace;
const available=Boolean(api);
const labels={hvac:'Maintenance intervention',billing:'Invoice to payment',grants:'Grant application to settlement'};
const availableLabels=computed(()=>Object.fromEntries(Object.entries(labels).filter(([kind])=>props.kinds.includes(kind))));
const current=computed(()=>result.value?.steps?.[selected.value]);
const proof=computed(()=>Object.entries(current.value?.evidence || {}).filter(([key,value])=>['id','status','stage','number','invoiceNumber','title','name','receivedCents','totalCents','paidCents','reference'].includes(key)&&value!=null));
const stop=window.electronAPI?.onWorkspaceDemo?.(value=>{if(busy.value)result.value=value;});
onUnmounted(()=>stop?.());
function openWorkspace(view) {
 window.dispatchEvent(new CustomEvent('bonzai:open-demo-team',{detail:{id:result.value.id,view:view || result.value.view || 'getting-started'}}));
}
async function run(kind){if(busy.value || !available || !props.kinds.includes(kind))return;busy.value=true;error.value='';result.value=null;selected.value=0;try{result.value=await api.demo(kind);}catch(e){error.value=e.message;}finally{busy.value=false;}}
</script>
<template>
<section class="business-demo company-screen" :class="{'business-demo--embedded':embedded}" data-i18n-skip>
 <header v-if="!embedded"><span class="material-symbols-outlined" aria-hidden="true">route</span><div><h2>{{ $ui('Try A Workflow') }}</h2><p>{{ $ui('Follow each step and inspect what was saved. External actions are simulated; your real teams are unchanged.') }}</p></div></header>
 <div class="demo-actions"><button v-for="(label,kind) in availableLabels" :key="kind" class="bz-btn" :disabled="busy || !available" @click="run(kind)"><span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>{{ $ui(embedded ? busy ? 'Running…' : result ? 'Run Again' : 'Run Demo' : label) }}</button><span v-if="embedded" class="demo-inline-note">{{ $ui('Sample data · external actions simulated') }}</span></div>
 <p v-if="error" role="alert">{{error}}</p>
 <div v-if="result" class="demo-walkthrough">
  <div class="demo-summary" aria-live="polite"><strong>{{ $ui(labels[result.kind]) }}</strong><span>{{ result.steps.filter(s=>s.status==='passed').length }} / {{result.steps.length}} · {{ $ui(busy?'Running':result.status==='passed'?'Workflow checks passed':'Workflow needs attention') }}</span></div>
  <div v-if="!busy" class="demo-actions">
   <button class="bz-btn bz-btn--primary" @click="openWorkspace()">{{ $ui('Open demo workspace') }}</button>
   <button class="bz-btn" @click="openWorkspace('deliverables')">{{ $ui('View demo deliverables') }}</button>
  </div>
  <div class="demo-layout">
   <ol><li v-for="(step,i) in result.steps" :key="i"><button :class="{selected:selected===i}" :aria-current="selected===i?'step':undefined" @click="selected=i"><span class="step-number">{{i+1}}</span><span>{{ $ui(step.label) }}</span><span class="material-symbols-outlined" :aria-label="$ui(step.status)">{{step.status==='passed'?'check_circle':step.status==='failed'?'error':'pending'}}</span></button></li></ol>
   <article v-if="current">
    <p class="demo-label">{{ $ui('Step') }} {{selected+1}}</p>
    <h3>{{ $ui(current.label) }}</h3>
    <p>{{ $ui(demoGuide[current.label]?.[0] || current.label) }}</p>
    <p v-if="current.error" role="alert">{{current.error}}</p>
    <div class="demo-evidence" v-if="current.status==='passed'"><strong>{{ $ui('Verified in this rehearsal') }}</strong><p>{{ $ui('The operation completed in the local database. The records below belong only to this demonstration.') }}</p>
     <dl v-if="proof.length"><template v-for="[key,value] in proof" :key="key"><dt>{{ $ui(key==='id'?'Record reference':key==='receivedCents'?'Received amount (cents)':key==='totalCents'?'Total (cents)':key==='paidCents'?'Paid amount (cents)':key==='stage'?'Stage':key==='status'?'Status':key==='name'?'Name':key==='title'?'Title':'Reference') }}</dt><dd>{{value}}</dd></template></dl>
     <details v-if="current.evidence"><summary>{{ $ui('Inspect saved evidence') }}</summary><pre>{{JSON.stringify(current.evidence,null,2)}}</pre></details>
    </div>
    <footer><button class="bz-btn" :disabled="selected===0" @click="selected--">{{ $ui('Previous') }}</button><button class="bz-btn bz-btn--primary" :disabled="selected>=result.steps.length-1" @click="selected++">{{ $ui('Next step') }}</button></footer>
   </article>
  </div>
  <p class="demo-boundary">{{ $ui('Demonstration · simulated external evidence') }}. {{ $ui('No emails, portal submissions or payments are sent. This rehearsal does not test autonomous agent execution or live connectors.') }}</p>
 </div>
</section>
</template>
<style scoped>
.business-demo{border:1px solid var(--bz-border);border-radius:16px;padding:clamp(16px,2vw,32px);color:var(--bz-fg);background:var(--bz-panel);display:grid;gap:24px;min-width:0}.business-demo header{display:flex;align-items:start;gap:14px}.business-demo h2{font-family:var(--bz-font-metric);font-size:24px;margin:0 0 8px}.business-demo h3{font-size:22px;line-height:1.3;margin:10px 0 18px}.business-demo p{color:var(--bz-fg-mid);line-height:1.65;margin:0}.demo-actions{display:flex;gap:12px;flex-wrap:wrap}.demo-actions button{white-space:normal;text-align:left;min-height:44px}.demo-summary{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:20px}.demo-layout{display:grid;grid-template-columns:minmax(220px, .85fr) minmax(0,1.4fr);border:1px solid var(--bz-border);border-radius:12px;overflow:hidden}.business-demo ol{list-style:none;margin:0;padding:12px;border-right:1px solid var(--bz-border)}.business-demo li button{display:grid;grid-template-columns:28px 1fr 22px;align-items:center;width:100%;gap:12px;padding:14px;text-align:left;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--bz-fg);font:inherit;cursor:pointer}.business-demo li button:hover,.business-demo li button.selected{background:var(--bz-canvas);border-color:var(--bz-border)}.step-number{color:var(--bz-accent)}article{padding:clamp(18px,2vw,32px);min-width:0}.demo-evidence{background:var(--bz-canvas);padding:18px;border:1px solid var(--bz-border);border-radius:10px;margin:24px 0}.demo-evidence p{margin-top:8px;font-size:14px}dl{display:grid;grid-template-columns:1fr 1.5fr;gap:12px;font-size:14px}dd{margin:0;overflow-wrap:anywhere}dt{color:var(--bz-fg-mid)}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font-size:12px}footer{display:flex;justify-content:space-between;gap:12px;margin-top:24px}.demo-boundary{margin-top:18px!important;font-size:13px}summary{cursor:pointer;padding:12px 0}.demo-label{text-transform:uppercase;letter-spacing:.08em;font-size:12px}@media(max-width:760px){.demo-layout{grid-template-columns:1fr}.business-demo ol{border-right:0;border-bottom:1px solid var(--bz-border)}}
.business-demo--embedded{padding:0;border:0;border-radius:0;background:transparent;gap:20px}.business-demo--embedded>.demo-actions{align-items:center}.demo-inline-note{font-size:12px;color:var(--bz-fg-mid)}
</style>
