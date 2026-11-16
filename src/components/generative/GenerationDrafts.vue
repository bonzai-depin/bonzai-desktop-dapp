<template>
  <div class="generation-drafts">
    <span v-if="message" class="generation-drafts__message" role="status">{{ $ui(message) }}</span>
    <button type="button" class="bz-iconbtn" :disabled="disabled" :aria-label="$ui('Open drafts')" :title="$ui('Open drafts')" @click="open"><span class="material-symbols-outlined">folder_open</span></button>
    <button type="button" class="bz-btn bz-btn--ghost" :disabled="saving" @click="save"><span class="material-symbols-outlined" aria-hidden="true">save</span>{{ $ui(saving ? 'Saving…' : 'Save Draft') }}</button>
    <Teleport to="body"><dialog ref="dialog" class="generation-drafts__dialog" @click="closeOutside">
      <header><h2 class="bz-display">{{ $ui('Saved Drafts') }}</h2><button type="button" class="bz-iconbtn" :aria-label="$ui('Close')" @click="dialog.close()"><span class="material-symbols-outlined">close</span></button></header>
      <p v-if="!drafts.length">{{ $ui('No saved drafts yet.') }}</p>
      <div v-for="draft in drafts" :key="draft.id" class="generation-drafts__row">
        <button type="button" class="generation-drafts__restore" @click="resume(draft)"><strong>{{ draft.title }}</strong><small>{{ new Date(draft.savedAt).toLocaleString() }}</small></button>
        <button type="button" class="bz-iconbtn" :aria-label="$ui('Delete draft')" @click="remove(draft.id)"><span class="material-symbols-outlined">delete</span></button>
      </div>
    </dialog></Teleport>
  </div>
</template>
<script setup>
import { ref } from 'vue';
import { saveGenerationDraft, listGenerationDrafts, deleteGenerationDraft } from '../../services/generationDrafts.js';
const props=defineProps({kind:{type:String,required:true},controller:{type:Object,required:true},disabled:Boolean});
const dialog=ref(null),drafts=ref([]),saving=ref(false),message=ref('');
async function save(){saving.value=true;try{await saveGenerationDraft(props.kind,props.controller.capture());message.value='Draft saved';}catch{message.value='Could not save this draft. Check available storage and try again.';}finally{saving.value=false;}}
async function open(){try{drafts.value=await listGenerationDrafts(props.kind);dialog.value.showModal();}catch{message.value='Could not open drafts. Please try again.';}}
async function resume(draft){try{await props.controller.restore(draft.state);dialog.value.close();message.value='Draft restored';}catch{message.value='Could not restore this draft. Please try again.';}}
async function remove(id){try{await deleteGenerationDraft(id);drafts.value=await listGenerationDrafts(props.kind);}catch{message.value='Could not delete this draft. Please try again.';}}
function closeOutside(event){if(event.target===dialog.value){const r=dialog.value.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.value.close();}}
</script>
<style scoped>
.generation-drafts{pointer-events:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.generation-drafts__message{font-size:12px;color:var(--bz-muted);max-width:240px}.generation-drafts__dialog{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:75vh;padding:24px;border:1px solid var(--bz-border);border-radius:16px;background:var(--bz-surface);color:var(--bz-fg)}.generation-drafts__dialog::backdrop{background:rgb(0 0 0 / .55)}header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}h2{margin:0;font-weight:900;font-style:italic;font-family:var(--bz-font-metric);font-size:var(--bz-size-h2)}.generation-drafts__row{display:flex;gap:12px;align-items:center;border-top:1px solid var(--bz-border);padding:12px 0}.generation-drafts__restore{flex:1;min-width:0;text-align:left;background:none;border:0;color:inherit;cursor:pointer;display:grid;gap:6px}.generation-drafts__restore strong{overflow-wrap:anywhere}.generation-drafts__restore small{color:var(--bz-muted)}
</style>
