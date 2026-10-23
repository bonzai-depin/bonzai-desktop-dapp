<template>
  <Teleport to="body"><div class="bz-modal-overlay" @click.self="close">
    <section ref="dialog" class="bz-modal service-editor" role="dialog" aria-modal="true" :aria-label="$ui('Offer My Agent')" data-i18n-skip>
      <header class="bz-modal__header"><div><p class="bz-eyebrow">{{ $ui('Provider') }}</p><h2 class="bz-h2">{{ $ui('Offer My Agent') }}</h2></div><BzCloseButton :disabled="busy" @click="close" /></header>
      <form @submit.prevent="publish">
        <label>{{ $ui('Smart Agent') }}<select v-model="agentId" required :disabled="busy"><option value="">{{ $ui('Choose an agent') }}</option><option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }}</option></select></label>
        <p v-if="!agents.length" class="bz-meta">{{ $ui('Tokenize a custom agent and issue its social token to offer paid services.') }}</p>
        <div class="service-editor__pair"><label>{{ $ui('Service title') }}<input v-model="draft.title" maxlength="100" required :placeholder="$ui('Maintenance specialist')" /></label><label>{{ $ui('Price per job · agent tokens') }}<input v-model="draft.price" required inputmode="decimal" placeholder="100" /></label></div>
        <label>{{ $ui('What the customer receives') }}<textarea v-model="draft.outcome" maxlength="600" required :placeholder="$ui('A diagnosis grounded in my maintenance library, with cited sources and a recommended action plan.')" /></label>
        <div class="service-editor__heading"><h3 class="bz-h3">{{ $ui('Tokenized expertise') }}</h3><button type="button" class="bz-btn bz-btn--ghost bz-btn--sm" :disabled="busy" @click="loadAssets">{{ $ui('Refresh assets') }}</button></div>
        <p class="bz-meta">{{ $ui('Select the originals this agent may use. Only the package description is advertised.') }}</p>
        <p v-if="!inventory.length" class="service-editor__empty">{{ $ui('Tokenize your models or original content first. Your local assets will appear here.') }}</p>
        <div class="service-editor__assets">
          <article v-for="item in inventory" :key="item.id" :class="{chosen:choices[item.id]}">
            <button type="button" class="service-asset-choice" :aria-pressed="!!choices[item.id]" :disabled="busy || !!inspecting" @click="choose(item)">
              <span class="material-symbols-outlined" aria-hidden="true">{{ choices[item.id] ? 'check_circle' : item.contentType==='training' ? 'neurology' : 'library_books' }}</span>
              <span><strong>{{ sources[item.id]?.title || item.title || $ui(item.contentType==='training' ? 'Tokenized model' : 'Tokenized content') }}</strong><small>{{ item.contentType }} · #{{ item.tokenId }}</small></span><span v-if="inspecting===item.id">{{ $ui('Checking…') }}</span>
            </button>
            <template v-if="choices[item.id]"><label>{{ $ui('Access') }}<select v-model="choices[item.id].use"><option v-for="use in sources[item.id].uses" :key="use" :value="use">{{ $ui(useLabels[use]) }}</option></select></label><label>{{ $ui('License terms') }}<input v-model="choices[item.id].license" required maxlength="1000" :placeholder="$ui('Permitted use, restrictions and attribution')" /></label></template>
          </article>
        </div>
        <label>{{ $ui('Service capability') }}<select v-model="capability"><option v-for="cap in capabilities" :key="cap.id" :value="cap.id">{{ $ui(cap.label) }}</option></select></label>
        <label class="service-editor__consent"><input type="checkbox" v-model="draft.rightsConfirmed" required /> <span>{{ $ui('I have the rights to provide the selected access under these license terms.') }}</span></label>
        <p class="bz-meta">{{ $ui('Access covers one approved job. Knowledge and model weights stay on your device unless original delivery is explicitly selected. Keep Provider mode enabled to accept work.') }}</p>
        <p v-if="error" class="service-editor__error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ $ui(notice) }}</p>
        <footer><button type="button" class="bz-btn bz-btn--ghost" :disabled="busy || !agentId" @click="save">{{ $ui('Save draft') }}</button><button class="bz-btn bz-btn--primary" :disabled="busy || !!inspecting || !agentId || !selected.length">{{ $ui(busy ? 'Checking package…' : 'Sign and offer service') }}</button></footer>
      </form>
    </section>
  </div></Teleport>
</template>
<script setup>
import {ref,reactive,computed,watch,onMounted} from 'vue';
import BzCloseButton from './BzCloseButton.vue';
import {useModalAccessibility} from '../composables/useModalAccessibility.js';
import {publishWorker} from '../services/agentWorkers.service.js';
import {operationError} from '../i18n/operations.js';
import {useI18n} from '../i18n/index.js';
const props=defineProps({agents:{type:Array,default:()=>[]}}),emit=defineEmits(['close','published']);
const i18n=useI18n();
const dialog=ref(null),agentId=ref(''),busy=ref(false),inspecting=ref(''),error=ref(''),notice=ref(''),inventory=ref([]),sources=reactive({}),choices=reactive({}),capability=ref('text');
const draft=reactive({title:'',outcome:'',price:'',rightsConfirmed:false});
const useLabels={knowledge:'Private knowledge · cited answers',model:'Private model · inference only',delivery:'Licensed original · delivered to customer'};
const selected=computed(()=>Object.entries(choices).filter(([,v])=>v).map(([id,v])=>({id,...v})));
const capabilities=computed(()=> selected.value.some(a=>a.use==='delivery') ? [{id:'assets',label:'Deliver licensed originals'}] : selected.value.some(a=>a.use==='model') ? [{id:'text',label:'Text answers'},{id:'3d',label:'3D creation'},{id:'skill',label:'Skill drafting'}] : [
  {id:'text',label:'Text answers'},...(selected.value.some(a=>a.use==='knowledge')?[{id:'image',label:'Image creation'},{id:'audio',label:'Speech creation'},{id:'music',label:'Music creation'},{id:'video',label:'Video creation'},{id:'3d',label:'3D creation'},{id:'skill',label:'Skill drafting'}]:[]),
  ...(selected.value.some(a=>a.use==='delivery')?[{id:'assets',label:'Deliver licensed originals'}]:[])]);
watch(capabilities,list=>{if(!list.some(c=>c.id===capability.value))capability.value=list[0].id;});
const close=()=>{if(!busy.value)emit('close');};useModalAccessibility(dialog,{onClose:close});
async function loadAssets(){try{inventory.value=await window.electronAPI.agentServiceAssets();}catch(e){error.value=operationError(e,i18n.locale.value);}}
async function choose(item){if(choices[item.id]){delete choices[item.id];return;}const selectedAgent=agentId.value;inspecting.value=item.id;error.value='';try{const source=await window.electronAPI.agentServiceAssetInspect(item.id);if(agentId.value!==selectedAgent)return;sources[item.id]=source;choices[item.id]={use:sources[item.id].uses[0],license:''};}catch(e){error.value=operationError(e,i18n.locale.value);}finally{inspecting.value='';}}
async function save(){error.value='';try{await window.electronAPI.store.set(`agentServiceDraft:${agentId.value}`,JSON.parse(JSON.stringify({...draft,assets:selected.value,capability:capability.value})));notice.value='Draft saved on this device.';}catch(e){error.value=operationError(e,i18n.locale.value);}}
watch(agentId,async id=>{Object.keys(choices).forEach(k=>delete choices[k]);Object.assign(draft,{title:'',outcome:'',price:'',rightsConfirmed:false});notice.value='';if(!id)return;try{const saved=await window.electronAPI.store.get(`agentServiceDraft:${id}`);if(id!==agentId.value)return;if(saved){Object.assign(draft,{title:saved.title,outcome:saved.outcome,price:saved.price,rightsConfirmed:false});for(const asset of saved.assets||[]){if(id!==agentId.value)return;const item=inventory.value.find(i=>i.id===asset.id);if(item){await choose(item);if(choices[item.id])Object.assign(choices[item.id],{use:asset.use,license:asset.license});}}capability.value=saved.capability||'text';}}catch(e){error.value=operationError(e,i18n.locale.value);}});
async function publish(){busy.value=true;error.value='';try{const assets=selected.value;
  if(capability.value!=='assets' && assets.some(a=>a.use==='delivery')) throw new Error('Choose original delivery as the service capability, or remove download access from this offer.');
  if(capability.value==='assets' && assets.some(a=>a.use!=='delivery')) throw new Error('An original delivery offer may contain only assets licensed for delivery.');
  const descriptor=await publishWorker(props.agents.find(a=>a.id===agentId.value),[capability.value],[],{},null,{...draft,assets});await save();emit('published',descriptor);emit('close');
}catch(e){error.value=operationError(e,i18n.locale.value);}finally{busy.value=false;}}
onMounted(loadAssets);
</script>
<style scoped>
.service-editor{width:min(820px,calc(100vw - 32px));max-height:calc(100dvh - 32px);display:flex;flex-direction:column;overflow:hidden;color:var(--bz-fg)}
.service-editor h2,.service-editor h3,.service-editor p{margin:0}.service-editor form{overflow:auto;padding:24px;display:grid;gap:20px}.service-editor label{display:grid;gap:8px;color:var(--bz-fg-mid);font-size:13px}.service-editor input:not([type=checkbox]),.service-editor select,.service-editor textarea{box-sizing:border-box;width:100%;min-width:0;background-color:var(--bz-canvas);color:var(--bz-fg);border:1px solid var(--bz-border-strong);border-radius:var(--bz-r);padding:12px;font:inherit}.service-editor select{padding-right:40px}.service-editor textarea{min-height:90px;resize:vertical}.service-editor__pair{display:grid;grid-template-columns:2fr 1fr;gap:16px}.service-editor__heading,footer{display:flex;align-items:center;justify-content:space-between;gap:16px}.service-editor__assets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.service-editor__assets article{border:1px solid var(--bz-border);border-radius:var(--bz-r-md);padding:16px;display:grid;gap:12px;align-content:start}.service-editor__assets article.chosen{border-color:var(--bz-accent)}.service-asset-choice{display:flex;align-items:center;gap:12px;width:100%;border:0;background:none;text-align:left;color:var(--bz-fg);cursor:pointer;padding:0}.service-asset-choice span{min-width:0}.service-asset-choice strong{display:block;overflow-wrap:anywhere}.service-asset-choice small{display:block;color:var(--bz-fg-mid);margin-top:4px}.service-asset-choice>.material-symbols-outlined{color:var(--bz-accent)}.service-editor label.service-editor__consent{display:flex;align-items:center;gap:12px}.service-editor__empty{padding:24px;border:1px dashed var(--bz-border);border-radius:var(--bz-r);color:var(--bz-fg-mid)}.service-editor__error{color:var(--bz-danger)}footer{padding-top:8px;border-top:1px solid var(--bz-border)}@media(max-width:600px){.service-editor form{padding:16px}.service-editor__pair,.service-editor__assets{grid-template-columns:1fr}.service-editor footer{flex-wrap:wrap}}
</style>
