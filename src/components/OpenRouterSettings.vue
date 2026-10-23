<template>
  <section class="remote-settings" aria-label="Consumer inference source">
    <h3 class="bz-h3">Inference Source</h3>
    <div class="remote-sources" role="group" aria-label="Inference source">
      <button class="bz-btn" :class="source === 'network' ? 'bz-btn--primary' : 'bz-btn--ghost'" @click="source = 'network'">BonzAI Network</button>
      <button class="bz-btn" :class="source === 'openrouter' ? 'bz-btn--primary' : 'bz-btn--ghost'" @click="source = 'openrouter'">OpenRouter</button>
    </div>
    <template v-if="source === 'openrouter'">
      <p class="remote-note">Choose models for creation, roleplay and Smart Workflows. Unselected media categories run locally.</p>
      <form v-if="!remoteInference.connected" class="remote-connect" @submit.prevent="connect">
        <label>OpenRouter API Key<input v-model="apiKey" type="password" autocomplete="off" placeholder="Paste your API key" class="bz-input" /></label>
        <p class="remote-note">Use a key with a spending limit. Your key is encrypted on this device; charges go to your OpenRouter account.</p>
        <div class="remote-actions"><button type="button" class="bz-btn bz-btn--ghost" @click="openKeys">Create a capped key ↗</button><button class="bz-btn bz-btn--primary" :disabled="busy || !apiKey.trim()">{{ busy ? 'Connecting…' : 'Connect OpenRouter' }}</button></div>
      </form>
      <template v-else>
        <div class="remote-account"><span>Connected<span v-if="account && account.remaining != null"> · ${{ Number(account.remaining).toFixed(2) }} key allowance remaining</span></span><button class="bz-btn bz-btn--ghost" :disabled="busy" @click="disconnect">Disconnect</button></div>
        <label>Language model<select v-model="model" class="bz-select" aria-label="Language model"><option value="" disabled>Select a model</option><option v-for="item in filtered" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <p v-if="selected" class="remote-note">{{ (selected.context || 0).toLocaleString() }} context · ${{ price(selected.pricing?.prompt) }} input / ${{ price(selected.pricing?.completion) }} output per million tokens</p>
        <div class="remote-media-grid">
          <label v-for="category in mediaCategories" :key="category.id">{{ category.label }}
            <select v-model="mediaModels[category.id]" class="bz-select" :aria-label="category.label" @focus="loadMedia(category.id)">
              <option value="">Local engine</option>
              <option v-if="mediaModels[category.id] && !mediaCatalog[category.id]?.some(m => m.id === mediaModels[category.id])" :value="mediaModels[category.id]">{{ mediaModels[category.id] }}</option>
              <option v-for="item in mediaCatalog[category.id] || []" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </label>
        </div>
        <label v-if="mediaModels.speech">Speech voice<input v-model="speechVoice" class="bz-input" placeholder="Provider voice ID"  /></label>
        <details v-if="mediaModels.speech && voices.length" class="remote-voices"><summary>Choose a voice</summary><div role="group" aria-label="Available voices"><button v-for="voice in voices" :key="voice" type="button" class="bz-btn" :class="speechVoice === voice ? 'bz-btn--primary' : 'bz-btn--ghost'" :aria-pressed="speechVoice === voice" @click="speechVoice = voice">{{ voice }}</button></div></details>
        <p class="remote-note">3D scenes use the language model. Music and training use BonzAI engines. Video duration and aspect ratio must be supported by the selected model.</p>
        <p v-if="videoModel" class="remote-note">Video: {{ (videoModel.supported_durations || []).join(', ') }} seconds · {{ (videoModel.supported_aspect_ratios || []).join(', ') }}</p>
        <details v-if="videoJobs.length"><summary>Video jobs · {{ videoJobs.length }}</summary><div v-for="job in videoJobs" :key="job.id" class="remote-account"><span>{{ job.model }} · {{ job.status }}</span><button class="bz-btn bz-btn--ghost" :disabled="busy" @click="resumeVideo(job.id)">Recover video</button></div><video v-if="recoveredVideo" :src="recoveredVideo" controls class="remote-video" /></details>
        <label>Maximum output tokens<input v-model.number="maxTokens" class="bz-input" type="number" min="128" max="32768" step="128" /></label>
        <label class="remote-consent"><input v-model="consent" type="checkbox" />Send conversation and workflow inputs to OpenRouter and its model providers. Selected images, audio and video references are uploaded too. Automated team and roleplay requests also use this account.</label>
      </template>
    </template>
    <p v-else class="remote-note">Use the providers selected below for BonzAI Network inference.</p>
    <p v-if="error" role="alert" class="remote-error">{{ error }}</p>
    <p v-if="saved" role="status" class="remote-note">Inference source saved.</p>
    <button class="bz-btn bz-btn--primary" :disabled="busy || (source === 'openrouter' && (!remoteInference.connected || !model || !consent))" @click="save">Use {{ source === 'openrouter' ? 'OpenRouter' : 'BonzAI Network' }}</button>
  </section>
</template>
<script setup>
import { ref, computed, onMounted } from 'vue';
import { remoteInference, refreshRemoteInference } from '../stores/remoteInference.js';
const api = window.electronAPI?.openRouter;
const source = ref('network'), apiKey = ref(''), model = ref(''), maxTokens = ref(2048), consent = ref(false), busy = ref(false), error = ref(''), saved = ref(false), models = ref([]), account = ref(null);
const mediaCategories = [{ id: 'image', label: 'Images' }, { id: 'speech', label: 'Speech' }, { id: 'video', label: 'Video' }, { id: 'vision', label: 'Image analysis' }];
const mediaModels = ref({ image: '', speech: '', video: '', vision: '' }), mediaCatalog = ref({}), speechVoice = ref(''), videoJobs = ref([]), recoveredVideo = ref('');
const videoModel = computed(() => mediaCatalog.value.video?.find(m => m.id === mediaModels.value.video));
const voices = computed(() => { const list = mediaCatalog.value.speech?.find(m => m.id === mediaModels.value.speech)?.supported_voices; return Array.isArray(list) ? list.filter(v => typeof v === 'string') : []; });
async function loadMedia(category) { if (!api.mediaModels || mediaCatalog.value[category]) return; try { mediaCatalog.value[category] = await api.mediaModels(category); } catch (e) { error.value = e.message; } }
const resumeVideo = id => run(async () => { const result = await api.resumeVideo(id); recoveredVideo.value = result.video_url;
  const rows = await window.electronAPI?.store?.get?.('videoInferences', []) || [];
  if (!rows.some(row => row.openRouterJobId === id || row.answer?.data?.metadata?.jobId === id)) {
    const record = { id: `openrouter-${id}`, openRouterJobId: id, question: 'Recovered OpenRouter Video', timestamp: Date.now(), model: result.model, source: 'openrouter', networkMode: 'remote', elapsedMs: result.elapsed_ms, answer: { status: 200, data: result } };
    await window.electronAPI?.store?.set?.('videoInferences', [...rows, record]);
  }
  videoJobs.value = await api.videoJobs(); });
const selected = computed(() => models.value.find(m => m.id === model.value));
const filtered = computed(() => models.value);
const price = value => (Number(value || 0) * 1e6).toFixed(2);
async function run(work) { busy.value = true; error.value = ''; saved.value = false; try { await work(); } catch (e) { error.value = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); } finally { busy.value = false; } }
async function load() { models.value = await api.models(); account.value = await api.account(); videoJobs.value = await api.videoJobs?.() || []; for (const category of Object.keys(mediaModels.value)) await loadMedia(category); }
const connect = () => run(async () => { await api.connect(apiKey.value); apiKey.value = ''; await refreshRemoteInference(); await load(); });
const disconnect = () => run(async () => { await api.disconnect(); await refreshRemoteInference(); account.value = null; models.value = []; });
// Vue refs contain reactive proxies; IPC requires a plain media-selection map.
const save = () => run(async () => { await api.configure({ source: source.value, model: model.value, mediaModels: { ...mediaModels.value }, speechVoice: speechVoice.value, maxTokens: maxTokens.value, consent: consent.value }); await refreshRemoteInference(); saved.value = true; });
const openKeys = () => window.electronAPI?.openExternal?.('https://openrouter.ai/settings/keys');
onMounted(() => run(async () => { if (!api) throw new Error('Restart BonzAI to enable OpenRouter settings.'); await refreshRemoteInference(); mediaModels.value = { image: '', speech: '', video: '', vision: '', ...(remoteInference.mediaModels || {}) }; speechVoice.value = remoteInference.speechVoice || ''; source.value = remoteInference.source; model.value = remoteInference.model || ''; maxTokens.value = remoteInference.maxTokens; consent.value = remoteInference.consent === true; if (remoteInference.connected) await load(); }));
</script>
<style scoped>
.remote-settings, .remote-settings * { box-sizing:border-box; }
.remote-settings { min-width:0; display:grid; gap:16px; max-width:780px; padding:24px 0; border-block:1px solid var(--bz-border); }
.remote-settings h3,.remote-settings p { margin:0; }
.remote-settings label,.remote-connect { display:grid; gap:8px; min-width:0; }
.remote-connect { gap:16px; }
.remote-settings input:not([type=checkbox]),.remote-settings select { width:100%; min-height:44px; padding:10px 36px 10px 12px; color:var(--bz-fg); background:var(--bz-surface); border:1px solid var(--bz-border); border-radius:8px; }
.remote-sources,.remote-actions,.remote-account { display:flex; align-items:center; flex-wrap:wrap; gap:12px; }
.remote-account { justify-content:space-between; }
.remote-settings .bz-btn--ghost { color:var(--bz-fg); }
.remote-media-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
.remote-voices summary { cursor:pointer; color:var(--bz-fg); padding:8px 0; }
.remote-voices > div { display:flex; flex-wrap:wrap; gap:8px; max-height:180px; overflow:auto; padding:8px 0; }
.remote-video { width:100%; max-height:360px; margin-top:12px; }
.remote-note { color:var(--bz-fg-mid); font-size:13px; line-height:1.5; }
.remote-settings .remote-consent { display:flex; align-items:flex-start; gap:10px; line-height:1.5; font-size:13px; }
.remote-error { color:var(--bz-danger); }
.remote-settings > button { justify-self:start; }
</style>
