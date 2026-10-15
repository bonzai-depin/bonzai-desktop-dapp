<template>
  <section class="public-session" aria-label="Public X session">
    <header class="public-session__heading">
      <div><span class="bz-eyebrow">ONE AGENT · MANY CONVERSATIONS</span><h3 class="fira-sans-condensed-black-italic">Meet the world.</h3><p>{{ agent.name }} can answer mentions with locally generated media and workflow results.</p></div>
      <span class="public-session__status"><span :class="{ 'is-live': session?.settings.enabled }"></span>{{ session?.settings.enabled ? 'Listening on X' : 'Public session paused' }}</span>
    </header>
    <p v-if="!desktop" class="bz-notice" role="status">Open BonzAI Desktop to connect X and run public sessions on this device.</p>
    <p v-if="error" class="bz-notice bz-notice--danger" role="alert">{{ error }}</p>
    <div class="public-session__grid">
      <form class="public-session__settings" @submit.prevent="save">
        <div class="public-session__section-heading"><span class="bz-eyebrow">PUBLIC IDENTITY</span><strong v-if="session">@{{ session.username }}</strong></div>
        <details :open="!session"><summary>X developer app</summary>
          <label>OAuth 2.0 client ID<input v-model.trim="clientId" class="input" autocomplete="off" placeholder="Your app’s public client ID" /></label>
          <p class="public-session__hint">Callback: <code>bonzai://social/callback/x</code></p>
          <button type="button" class="bz-btn bz-btn--secondary" :disabled="busy || !desktop || !clientId" @click="connect">{{ session ? 'Reconnect X account' : 'Connect X account' }}</button>
        </details>
        <label>Public persona<textarea v-model="form.persona" class="textarea" rows="4" maxlength="2000" placeholder="Describe how your agent introduces itself and speaks in public." required></textarea></label>
        <p class="public-session__hint">This persona and public mentions are its context. Your roleplay chats, profile and company memory stay separate.</p>
        <fieldset><legend>Reply capabilities</legend><div class="public-session__media"><label v-for="item in media" :key="item.id"><input type="checkbox" :value="item.id" v-model="form.media" /><span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>{{ item.label }}</label></div></fieldset>
        <fieldset><legend>Agentic workflows</legend><label v-for="workflow in assigned" :key="workflow.id" class="public-session__workflow"><input type="checkbox" :value="workflow.id" v-model="form.workflows" :disabled="workflowChatMode(workflow) === 'interactive'" /><span>{{ workflow.name }}<small v-if="workflowChatMode(workflow) === 'interactive'">Needs its interactive workspace</small></span></label>
          <p v-if="!assigned.length" class="public-session__hint">No available workflows were found. Refresh the workflow catalog.</p>
        </fieldset>
        <div class="public-session__limits"><label>Daily generation limit<input class="input bz-metric" v-model.number="form.dailyLimit" type="number" min="1" max="50" /></label><label>Publication<select v-model="form.automatic" class="input"><option :value="false">Review every reply</option><option :value="true">Automatic replies</option></select></label></div>
        <label class="public-session__check"><input type="checkbox" v-model="form.platformApproved" /><span>I have X’s written approval for this AI reply bot and have labelled the account as automated.</span></label>
        <a class="public-session__hint" href="https://help.x.com/en/rules-and-policies/x-automation" target="_blank" rel="noopener noreferrer">X automation requirements ↗</a>
        <label class="public-session__check"><input type="checkbox" v-model="form.enabled" /><span>Listen for new mentions and generate replies on this device.</span></label>
        <div class="public-session__actions"><button class="bz-btn bz-btn--primary" :disabled="busy || !desktop">{{ busy ? 'Saving…' : 'Save public session' }}</button><button v-if="session?.settings.enabled" type="button" class="bz-btn bz-btn--secondary" :disabled="busy" @click="pause">Pause now</button></div>
        <p class="public-session__hint">BonzAI must remain open and awake. X API usage depends on your developer plan. People can mention the agent with “stop” to opt out.</p>
      </form>
      <section class="public-session__inbox" aria-label="Mention inbox">
        <header><div><span class="bz-eyebrow">MENTIONS & RESULTS</span><h4>Conversations on X <span class="bz-metric">{{ requests.length }}</span></h4></div><button class="bz-iconbtn" aria-label="Refresh public conversations" :disabled="busy || !desktop" @click="refresh"><span class="material-symbols-outlined">refresh</span></button></header>
        <p v-if="session?.error" class="bz-notice bz-notice--danger" role="alert">{{ session.error }}</p>
        <div v-if="!requests.length" class="public-session__empty"><span class="material-symbols-outlined">alternate_email</span><h4>A mention becomes something real.</h4><p>“@{{ session?.username || 'your_agent' }} please make me a calming image.”</p><p>“@{{ session?.username || 'your_agent' }} can I get a 3-minute meditation?”</p><small>New requests appear here after listening is enabled. Audio is delivered on X as a video with a cover.</small></div>
        <article v-for="request in requests" :key="request.id" class="public-session__request">
          <header><a :href="`https://x.com/i/status/${request.post_id}`" target="_blank" rel="noopener noreferrer">View mention ↗</a><span class="public-session__request-status">{{ statusLabel(request.status) }}</span></header>
          <p class="public-session__mention">{{ request.text }}</p>
          <ChatWorkflowResult v-if="request.result" :result="request.result" />
          <label v-if="request.status === 'review'">Reply text<textarea class="textarea" rows="2" :value="edits[request.id] ?? replyPreview(request.result)" @input="edits[request.id] = $event.target.value" maxlength="260"></textarea><small>Up to 130 characters, leaving room for X’s weighted character count.</small><button v-if="edits[request.id] !== undefined" class="bz-btn bz-btn--secondary" :disabled="busy" @click="editReply(request)">Save reply text</button></label>
          <p v-if="request.error" role="status">{{ request.error }}</p>
          <p v-if="request.status === 'unknown'" class="bz-notice">Check the X account before dismissing this request. BonzAI will not post it again automatically.</p>
          <div class="public-session__actions">
            <button v-if="request.status === 'review'" class="bz-btn bz-btn--primary" :disabled="busy || edits[request.id] !== undefined || !session?.settings.enabled || !session?.settings.platformApproved" @click="act('publicPublish', request.id)">Publish reply on X</button>
            <button v-if="request.status === 'failed'" class="bz-btn bz-btn--secondary" :disabled="busy || !session?.settings.enabled" @click="act('publicRetry', request.id)">Retry generation</button>
            <button v-if="['pending','review','failed','unknown'].includes(request.status)" class="bz-btn bz-btn--ghost" :disabled="busy" @click="act('publicDismiss', request.id)">Dismiss</button>
            <a v-if="request.reply_id" :href="`https://x.com/i/status/${request.reply_id}`" class="bz-btn bz-btn--secondary" target="_blank" rel="noopener noreferrer">View published reply ↗</a>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import ChatWorkflowResult from './ChatWorkflowResult.vue';
import { getAgentWorkflowIds } from '../../services/agentWorkflows.js';
import { workflowChatMode } from '../../services/chat/capabilities.js';
import { tickPublicSessions } from '../../services/chat/publicRuntime.js';
import { publicReplyText } from '../../services/social/xClient.js';
const props = defineProps({ agent: { type: Object, required: true }, catalog: { type: Array, default: () => [] } });
const api = window.electronAPI?.social;
const desktop = Boolean(api?.publicList);
const session = ref(null), requests = ref([]), error = ref(''), clientId = ref(''), busy = ref(false);
const defaults = () => ({ persona: '', media: ['image', 'audio'], workflows: [], dailyLimit: 5, automatic: false, platformApproved: false, enabled: false });
const form = reactive(defaults());
const edits = reactive({});
const replyPreview = result => { try { return publicReplyText(result); } catch { return result.replyText || result.text || result.title; } };
const editReply = request => work(async () => { await api.publicEdit(request.id, edits[request.id]); delete edits[request.id]; });
const media = [{ id: 'image', label: 'Images', icon: 'image' }, { id: 'audio', label: 'Voice', icon: 'graphic_eq' }, { id: 'music', label: 'Music', icon: 'music_note' }, { id: 'video', label: 'Video', icon: 'movie' }];
const assigned = computed(() => props.catalog.filter(item => getAgentWorkflowIds(props.agent, props.catalog).includes(item.id)));
const statusLabel = status => ({ pending: 'Queued', generating: 'Generating locally', review: 'Ready for review', preparing: 'Preparing media', publishing: 'Publishing', posted: 'Published', failed: 'Generation failed', skipped: 'Dismissed', unknown: 'Check X account' })[status] || status;
async function refresh(loadForm = false) {
  if (!desktop) return;
  try {
    const agentId = props.agent.id;
    const [sessions, inbox, config] = await Promise.all([api.publicList(), api.publicRequests(agentId), api.xClient()]);
    if (props.agent.id !== agentId) return;
    session.value = sessions.find(item => item.agent_id === agentId) || null;
    requests.value = inbox;
    if (loadForm === true) { Object.assign(form, defaults(), session.value?.settings || {}); clientId.value = config.clientId; }
  } catch (e) { error.value = e.message; }
}
async function work(fn) { busy.value = true; error.value = ''; try { await fn(); await refresh(); } catch (e) { error.value = e.message; } finally { busy.value = false; } }
const connect = () => work(async () => { await api.xClient(clientId.value); const result = await api.oauthStart({ platform: 'x', companionId: props.agent.id }); if (!result.success) throw new Error(result.error); await api.publicConfigure(props.agent.id, { ...form, enabled: false }); });
const save = () => work(async () => { await api.publicConfigure(props.agent.id, JSON.parse(JSON.stringify(form))); tickPublicSessions().catch(() => {}); });
const pause = () => work(async () => { await api.publicPause(props.agent.id); form.enabled = false; });
const act = (method, id) => work(() => api[method](id));
const onError = event => { if (event.detail.agentId === props.agent.id) error.value = event.detail.message; };
watch(() => props.agent.id, () => { error.value = ''; refresh(true); }, { immediate: true });
onMounted(() => { window.addEventListener('bonzai:public-sessions-updated', refresh); window.addEventListener('bonzai:public-session-error', onError); });
onUnmounted(() => { window.removeEventListener('bonzai:public-sessions-updated', refresh); window.removeEventListener('bonzai:public-session-error', onError); });
</script>
<style scoped>
.public-session { color:var(--bz-fg); text-align:left; padding:var(--bz-space-6); border:1px solid var(--bz-border); border-radius:var(--bz-r-xl); background:var(--bz-card); }
.public-session__heading { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; padding-bottom:24px; border-bottom:1px solid var(--bz-border); }
.public-session h3 { font-size:clamp(28px,3vw,42px); line-height:1.15; margin:8px 0 12px; color:var(--bz-fg); }
.public-session h4 { color:var(--bz-fg); font-size:20px; margin:8px 0; }
.public-session p { color:var(--bz-fg-muted); line-height:1.6; }
.public-session__status { display:flex; align-items:center; gap:8px; font-size:13px; white-space:nowrap; padding:10px 12px; border:1px solid var(--bz-border); border-radius:var(--bz-r-pill); }
.public-session__status>span { height:7px; width:7px; background:var(--bz-fg-muted); border-radius:50%; }.public-session__status>span.is-live { background:var(--bz-accent); }
.public-session__grid { display:grid; grid-template-columns:minmax(270px, .85fr) minmax(0,1.4fr); gap:32px; margin-top:24px; }
.public-session__settings { display:grid; align-content:start; gap:20px; }.public-session label { display:grid; gap:8px; color:var(--bz-fg); font-size:14px; }
.public-session :is(input:not([type=checkbox]),textarea,select) { width:100%; background:var(--bz-canvas); color:var(--bz-fg); border:1px solid var(--bz-border); border-radius:var(--bz-r-md); padding:12px; height:auto; box-shadow:none; }
.public-session :is(input,textarea,select,button) { font-family:var(--bz-font-body); box-sizing:border-box; }.public-session a:not(.bz-btn) { color:var(--bz-fg); text-decoration:underline; text-underline-offset:3px; }.public-session textarea { resize:vertical; }.public-session :is(input,textarea,select):focus-visible { outline:2px solid var(--bz-accent); outline-offset:3px; }
.public-session details { border:1px solid var(--bz-border); padding:14px; border-radius:var(--bz-r-md); }.public-session details[open]>summary { margin-bottom:16px; }
.public-session code { color:var(--bz-fg); background:var(--bz-canvas); overflow-wrap:anywhere; }
.public-session__section-heading,.public-session__inbox>header,.public-session__request>header { display:flex; justify-content:space-between; align-items:center; gap:16px; }
.public-session__hint { font-size:12px; line-height:1.6; color:var(--bz-fg-muted); }.public-session__hint a { color:inherit; }
.public-session fieldset { display:grid; gap:10px; border:0; padding:0; min-width:0; }.public-session legend { margin-bottom:12px; font-weight:600; }
.public-session__media { display:grid; grid-template-columns:1fr 1fr; gap:8px; }.public-session__media label { display:flex; gap:8px; align-items:center; padding:12px; border:1px solid var(--bz-border); border-radius:var(--bz-r-md); }
.public-session .public-session__workflow,.public-session .public-session__check { display:flex; align-items:flex-start; gap:10px; line-height:1.5; }.public-session input[type=checkbox] { accent-color:var(--bz-accent); margin-top:4px; flex-shrink:0; }
.public-session__workflow small { display:block; color:var(--bz-fg-muted); }.public-session__limits { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.public-session__actions { display:flex; gap:8px; flex-wrap:wrap; }.public-session__inbox { border-left:1px solid var(--bz-border); padding-left:32px; min-width:0; }
.public-session :is(.bz-btn--secondary,.bz-btn--ghost) { color:var(--bz-fg); background:var(--bz-canvas); border:1px solid var(--bz-border); }
.public-session .bz-btn:disabled { opacity:1; color:var(--bz-fg-muted); background:var(--bz-canvas); border:1px solid var(--bz-border); cursor:not-allowed; }
.public-session__empty { display:grid; gap:14px; padding:48px 16px; }.public-session__empty>.material-symbols-outlined { font-size:48px; color:var(--bz-accent); }.public-session__empty small { color:var(--bz-fg-muted); line-height:1.6; }
.public-session__request { border-top:1px solid var(--bz-border); padding-block:24px; overflow-wrap:anywhere; }.public-session__request-status { font-size:12px; color:var(--bz-fg-muted); }.public-session .public-session__mention { color:var(--bz-fg); margin-block:16px; }
@media(max-width:1000px) { .public-session__grid { grid-template-columns:1fr; }.public-session__inbox { border-left:0; border-top:1px solid var(--bz-border); padding:24px 0 0; }.public-session__heading { flex-direction:column; } }
@media(max-width:560px) { .public-session { padding:16px; }.public-session__limits { grid-template-columns:1fr; } }
</style>
