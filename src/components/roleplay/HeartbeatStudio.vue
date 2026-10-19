<template>
  <section class="heartbeat-studio" aria-label="Heartbeat and social studio">
    <header class="studio-heading"><div><span class="bz-eyebrow">Companion activity</span><h3 class="fira-sans-condensed-black-italic">Heartbeat & Social Studio</h3></div><span class="studio-status">{{ active ? 'Heartbeat enabled' : 'Heartbeat paused' }}</span></header>
    <nav class="studio-tabs" aria-label="Companion activity"><button v-for="item in ['Heartbeat', 'Social studio']" :key="item" class="bz-btn bz-btn--sm" :aria-pressed="tab === item" @click="tab = item">{{ item }}</button></nav>
    <div v-if="tab === 'Heartbeat'" class="heartbeat-body">
      <p>Continue the scene while you’re away. Updates stay in this conversation; nothing is posted to social networks.</p>
      <div class="heartbeat-fields">
        <label>Wait until I’m away<select :value="config.idleTimeout" :disabled="active" @change="change('idleTimeout', $event)"><option v-for="n in [1,3,5,10,15,30,60]" :value="n" :key="n">{{ n }} minutes</option></select></label>
        <label>Time between updates<select :value="config.messageInterval" :disabled="active" @change="change('messageInterval', $event)"><option v-for="n in [5,10,15,30,60,120]" :value="n" :key="n">{{ n }} minutes</option></select></label>
        <label>Stop after<select :value="config.maxMessages" :disabled="active" @change="change('maxMessages', $event)"><option v-for="n in [1,3,6,12,24,48]" :value="n" :key="n">{{ n }} updates</option></select></label>
      </div>
      <div class="studio-footer"><span>{{ count }} / {{ config.maxMessages }} updates · {{ generating ? 'Creating an update…' : active ? 'Waiting for inactivity' : 'Ready when you are' }}</span><button v-if="inSession" class="bz-btn" :class="active ? 'bz-btn--secondary' : 'bz-btn--primary'" :disabled="busy" @click="$emit('toggle', !active)">{{ active ? 'Pause heartbeat' : 'Enable heartbeat' }}</button><span v-else>Enable heartbeat after starting your scene.</span></div>
      <p class="studio-hint">BonzAI must remain open and your device awake. Uses the scene’s image and voice settings; video is off. Pause before changing the schedule. Pausing stops future updates; an update already running may finish.</p>
    </div>
    <div v-else class="social-body">
      <p>Connect an account, prepare a post, then review and publish it. Your private chat is never attached.</p>
      <div class="social-accounts"><article v-for="network in networks" :key="network.id"><span><strong>{{ network.name }}</strong><small>{{ connected[network.id] ? 'Connected' : 'Not connected' }}</small></span><button class="bz-btn bz-btn--sm" :disabled="working" @click="connection(network.id)">{{ connected[network.id] ? 'Disconnect' : 'Connect account' }}</button></article></div>
      <slot name="connections" />
      <div class="social-editor">
        <div class="heartbeat-fields"><label>Publish to<select v-model="platform" :disabled="working"><option value="x">X</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select></label><label>Format<select v-model="format" :disabled="working"><option v-for="type in formats" :key="type" :value="type">{{ type }}</option></select></label></div>
        <label>What should this post be about?<textarea v-model="brief" :disabled="working" rows="2" placeholder="A public update, an idea or a moment to share" /></label>
        <button class="bz-btn bz-btn--secondary" :disabled="working || !brief.trim()" @click="generate">{{ working ? 'Working…' : 'Prepare draft' }}</button>
        <template v-if="draft">
          <label>Review caption<textarea v-model="draft.text" :disabled="working || draft.status !== 'draft'" rows="4" /></label>
          <img v-if="draft.type === 'image' && draft.media" :src="mediaPreview" class="draft-media" alt="Generated post preview" />
          <video v-if="draft.type === 'video' && draft.media" :src="mediaPreview" class="draft-media" controls preload="metadata" />
          <p class="studio-hint">Destination: {{ draft.platform }} · {{ draft.type }} · {{ draft.status }}</p>
          <div class="studio-footer"><button class="bz-btn bz-btn--secondary" :disabled="working" @click="save">Save draft locally</button><button class="bz-btn bz-btn--primary" :disabled="working || draft.status !== 'draft' || !connected[draft.platform] || !draft.text?.trim()" @click="publish">Approve & publish to {{ draft.platform }}</button></div>
          <p v-if="draft.status === 'uncertain'" class="studio-hint">Delivery could not be confirmed. Check your account before preparing another post to avoid publishing twice.</p>
        </template>
      </div>
      <p class="studio-hint">Account authorization opens in your browser. Platform API access and permissions are required. Connecting an account never enables automatic publishing.</p>
      <details v-if="history.length"><summary>Publishing activity · {{ history.length }}</summary><ul><li v-for="item in history" :key="item.id">{{ item.platform }} · {{ item.status }} · {{ new Date(item.time).toLocaleString() }}<p>{{ item.text }}</p></li></ul></details>
    </div>
    <p v-if="error" role="alert" class="bz-notice bz-notice--danger">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  </section>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import { readSocialDraft, saveSocialDraft } from '../../services/social/draftStore.js';
import { heartbeatConfig } from '../../services/roleplayHeartbeat.js';
const props = defineProps({ companion: { type: Object, required: true }, config: { type: Object, required: true }, active: Boolean, count: { type: Number, default: 0 }, generating: Boolean, inSession: Boolean, busy: Boolean });
const emit = defineEmits(['update:config', 'toggle']);
const tab = ref('Heartbeat'), connected = ref({}), working = ref(false), error = ref(''), notice = ref(''), brief = ref(''), platform = ref('x'), format = ref('text'), draft = ref(null), history = ref([]);
const networks = [{id:'x',name:'X'}, {id:'instagram',name:'Instagram'}, {id:'tiktok',name:'TikTok'}];
const mediaPreview = computed(() => draft.value?.media ? `data:${draft.value.mediaType || (draft.value.type === 'image' ? 'image/jpeg' : 'video/mp4')};base64,${draft.value.media}` : '');
const formats = computed(() => platform.value === 'x' ? ['text','image','video'] : platform.value === 'instagram' ? ['image','video'] : ['video']);
watch(formats, types => { if (!types.includes(format.value)) format.value = types[0]; });
let generation = 0;

watch(() => props.companion.id, async () => {
  const token = ++generation; draft.value = null; history.value = []; connected.value = {}; error.value = ''; notice.value = '';
  try { const saved = await readSocialDraft(props.companion.id) || {}; if(token !== generation)return; draft.value = saved.draft || null; history.value = saved.history || []; const result = await window.electronAPI?.social?.getConnected({companionId:props.companion.id}); if(token === generation) connected.value = Object.fromEntries(networks.map(n=>[n.id,!!result?.[n.id]?.connected && !result?.[n.id]?.isExpired])); } catch(e) { if(token === generation) error.value = e.message; }
}, {immediate:true});
function change(name,event) { emit('update:config', {...props.config,...heartbeatConfig({...props.config,[name]:event.target.value})}); }
function persist() { return saveSocialDraft(props.companion.id,{draft:draft.value,history:history.value.slice(0,30)}); }
async function save() { try { await persist(); notice.value = 'Draft saved on this device.'; } catch { error.value = 'Draft could not be saved. Check available disk space and keep this view open.'; } }
async function run(fn) { if(working.value)return; working.value=true;error.value='';notice.value='';try {await fn();}catch(e){error.value=e.message;}finally{working.value=false;} }
async function connection(id) { await run(async()=>{const api=window.electronAPI?.social;if(!api)throw new Error('Social connections require the desktop app.');const token=generation;const companionId=props.companion.id;if(connected.value[id]) {await api.disconnect({platform:id,companionId});if(token===generation)connected.value[id]=false;}else{const result=await api.oauthStart({platform:id,companionId});if(!result?.success)throw new Error(result?.error || 'Account connection was cancelled.');if(token===generation)connected.value[id]=true;}}); }
async function generate() { await run(async()=>{const token=generation;const target=platform.value,type=format.value;const {ContentPipeline}=await import('../../services/social/content-pipeline.js');const content=await new ContentPipeline().generateBaseContent(props.companion,type,{topic:{title:brief.value},platform:target});if(token!==generation)return;if(!content?.text)throw new Error('No draft was generated. Check model availability and retry.');const media = content.media ? await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Cannot prepare media preview.'));reader.readAsDataURL(new Blob([content.media]));}) : null;if(token!==generation)return;draft.value={...content,media,id:crypto.randomUUID(),platform:target,type,status:'draft'};await persist();}); }
async function publish() { await run(async()=>{
  const token=generation, companionId=props.companion.id, item=JSON.parse(JSON.stringify(draft.value));
  if(item.status!=='draft')throw new Error('This draft is not ready to publish.');
  const {socialScheduler}=await import('../../services/social/scheduler.js');const adapter=socialScheduler.getAdapter(companionId,item.platform);
  if(!await adapter.isAuthenticated())throw new Error('Reconnect this account before publishing.');
  if(token!==generation)return;
  // Persist an uncertain state before sending: a timeout/restart must never cause an automatic duplicate.
  const adapted=adapter.adaptContent(item,item.type);
  if(adapted.text!==item.text || (item.platform==='x' && Array.from(item.text).length>130)) throw new Error('The caption is too long for this connector. Shorten it before publishing'+(item.platform==='x' ? ' (130 characters maximum).' : '.'));
  draft.value.status='uncertain';history.value.unshift({id:item.id,platform:item.platform,text:item.text,status:'Delivery unconfirmed',time:Date.now()});await persist();
  const {ContentPipeline}=await import('../../services/social/content-pipeline.js');
  const payload={...item,media:item.media ? Uint8Array.from(atob(item.media),c=>c.charCodeAt(0)).buffer : null};
  const result=await new ContentPipeline()._adaptAndPost(adapter,payload,item.type);
  if(!result?.postId)throw new Error('The platform did not confirm delivery. Check your account.');
  if(token!==generation)return;draft.value.status='published';history.value=history.value.map(entry=>entry.id===item.id ? {...entry,status:'Published'} : entry);await persist();notice.value='Post published.';
}); }
</script>
<style scoped>
.heartbeat-studio{min-width:0;color:var(--bz-fg);padding:20px 0}.studio-heading,.studio-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.studio-heading h3{font-size:24px;margin:4px 0}.studio-status,.studio-hint,small{color:var(--bz-fg-mid);font-size:13px}.studio-tabs{display:flex;gap:8px;margin:20px 0}.studio-tabs [aria-pressed=true]{border-color:var(--bz-accent);background:var(--bz-panel)}.heartbeat-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:16px;margin:20px 0}label{display:flex;flex-direction:column;gap:8px;font-size:14px}select,textarea{width:100%;min-width:0;border:1px solid var(--bz-border);background:var(--bz-canvas);color:var(--bz-fg);border-radius:8px;padding:10px;font:inherit;box-sizing:border-box}textarea{resize:vertical}.studio-footer{margin:20px 0}.studio-hint{line-height:1.6;margin:12px 0}.social-accounts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px;margin:20px 0}.social-accounts article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border:1px solid var(--bz-border);border-radius:12px}.social-accounts small{display:block;margin-top:6px}.social-editor{display:grid;gap:16px}.social-editor>.bz-btn{justify-self:start}.draft-media{max-width:100%;max-height:280px;object-fit:contain;border-radius:8px}li{padding:12px 0;border-bottom:1px solid var(--bz-border);overflow-wrap:anywhere}.bz-notice{margin-top:16px}button:disabled{opacity:.55}p{line-height:1.5}
</style>
