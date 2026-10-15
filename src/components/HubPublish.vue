<template>
  <section class="hub-publish" aria-label="Upload model to Hugging Face">
    <div class="hub-publish__head"><h4>Share on Hugging Face</h4><button v-if="!busy" class="bz-iconbtn" aria-label="Close upload" @click="$emit('close')"><span class="material-symbols-outlined">close</span></button></div>
    <p>Create a new model repository. Only the listed model files leave this device; training data and local provenance are excluded.</p>
    <p v-if="loading" role="status">Inspecting model files…</p>
    <template v-if="preview">
      <details><summary>{{ preview.files.length }} files · {{ (preview.bytes / 1024 ** 2).toFixed(1) }} MB — review upload</summary><ul><li v-for="file in preview.files" :key="file.path">{{ file.repo_path || file.path }}</li></ul></details>
      <form @submit.prevent="upload">
        <label>New repository<input v-model.trim="repository" placeholder="your-account/model-name" required :disabled="busy" pattern="[^/ ]+/[^/ ]+" /></label>
        <label>Write token<input v-model="token" type="password" autocomplete="off" placeholder="hf_…" required :disabled="busy" /></label>
        <p class="hub-publish__hint">The token is used for this upload only and is never saved.</p>
        <label class="hub-publish__check"><input v-model="isPrivate" type="checkbox" :disabled="busy" />Private repository</label>
        <label class="hub-publish__check"><input v-model="confirmed" type="checkbox" required :disabled="busy" />I reviewed these files and have permission to publish them.</label>
        <button class="bz-btn bz-btn--primary" :disabled="busy || !confirmed || !token || !repository">{{ busy ? 'Uploading…' : isPrivate ? 'Upload privately' : 'Publish publicly' }}</button>
      </form>
    </template>
    <p v-if="status" role="status">{{ status }}</p>
    <p v-if="error" class="hub-publish__error" role="alert">{{ error }}</p>
    <a v-if="url" :href="url" target="_blank" rel="noopener noreferrer">View uploaded model on Hugging Face ↗</a>
  </section>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import axios from 'axios';
const props = defineProps({ modelId: { type:String, required:true }, apiBase: { type:String, required:true } });
defineEmits(['close']);
const preview=ref(null), loading=ref(true), repository=ref(''), token=ref(''), isPrivate=ref(true), confirmed=ref(false), busy=ref(false), status=ref(''), error=ref(''), url=ref('');
let timer, disposed=false;
const storageKey=`bonzai.hubUpload.${props.modelId}`;
async function poll(id) {
  try {
    const {data}=await axios.get(`${props.apiBase}/training/hub-uploads/${id}`);
    if(disposed) return;
    status.value=data.status;
    if(data.status==='complete' || data.status==='error') {
      busy.value=false; url.value=data.url || ''; error.value=data.error || ''; sessionStorage.removeItem(storageKey); return;
    }
  } catch(e) { if(disposed) return; if(e.response?.status===404){busy.value=false;error.value='Upload status was lost after a server restart. Check your Hugging Face repository before retrying.';sessionStorage.removeItem(storageKey);return;} status.value='Connection interrupted. Checking upload status…'; }
  if(!disposed) timer=setTimeout(()=>poll(id),2000);
}
async function upload() {
  busy.value=true; error.value=''; status.value='Starting upload…';
  try {
    const {data}=await axios.post(`${props.apiBase}/training/models/${encodeURIComponent(props.modelId)}/hub-upload`, {repository:repository.value,token:token.value,private:isPrivate.value,confirmed:confirmed.value,digest:preview.value.digest});
    sessionStorage.setItem(storageKey,data.job_id); poll(data.job_id);
  } catch(e) { error.value=e.response?.data?.error || 'Unable to start upload.'; busy.value=false; }
  finally {token.value='';}
}
onMounted(async()=>{
  const existing=sessionStorage.getItem(storageKey);
  if(existing){busy.value=true;poll(existing);}
  try {preview.value=(await axios.get(`${props.apiBase}/training/models/${encodeURIComponent(props.modelId)}/hub-preview`)).data;}
  catch(e){error.value=e.response?.data?.error || 'Unable to inspect model files.';}
  finally{loading.value=false;}
});
onBeforeUnmount(()=>{disposed=true;clearTimeout(timer);token.value='';});
</script>
<style scoped>
.hub-publish, .hub-publish * { box-sizing:border-box; min-width:0; }
.hub-publish { overflow-wrap:anywhere; padding:20px; margin-top:12px; border:1px solid var(--bz-border); border-radius:var(--bz-radius-lg); color:var(--bz-fg); background:var(--bz-surface); }
.hub-publish__head {display:flex;align-items:center;justify-content:space-between;gap:12px;}
h4 {margin:0;font-size:18px;color:var(--bz-fg);}
p,summary {font-size:13px;line-height:1.5;color:var(--bz-fg-muted);margin:10px 0;}
form {display:grid;gap:12px;max-width:640px;margin-top:16px;}
label {display:grid;gap:6px;font-size:14px;color:var(--bz-fg);}
input:not([type=checkbox]) {width:100%;padding:10px;background:var(--bz-canvas);color:var(--bz-fg);border:1px solid var(--bz-border);border-radius:6px;}
.hub-publish__check {display:flex;align-items:flex-start;gap:8px;}
ul {max-height:180px;overflow:auto;overflow-wrap:anywhere;font-size:12px;}
.hub-publish__error {color:var(--bz-danger);}
a {color:var(--bz-accent);}
</style>
