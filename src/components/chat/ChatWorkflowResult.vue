<template>
  <section class="chat-result" aria-label="Workflow result">
    <header><span class="material-symbols-outlined" aria-hidden="true">task_alt</span><strong>{{ result.title }}</strong><span class="bz-eyebrow">LOCAL RESULT</span></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Loading saved media…</p>
    <div v-for="(artifact, index) in result.artifacts" :key="artifact.blobId || index" class="chat-result__artifact">
      <img v-if="artifact.kind === 'image' && urls[index]" :src="urls[index]" :alt="result.title" />
      <audio v-else-if="artifact.kind === 'audio' && urls[index]" :src="urls[index]" controls preload="metadata" />
      <video v-else-if="artifact.kind === 'video' && urls[index]" :src="urls[index]" controls preload="metadata" />
      <pre v-else-if="artifact.text">{{ artifact.text }}</pre>
      <a v-if="urls[index]" class="bz-btn bz-btn--ghost" :href="urls[index]" :download="artifact.name"><span class="material-symbols-outlined" aria-hidden="true">download</span>Save {{ artifact.kind }}</a>
    </div>
    <details v-if="result.text"><summary>Transcript</summary><p class="chat-result__transcript">{{ result.text }}</p></details>
    <p v-for="warning in result.warnings || []" :key="warning" class="chat-result__warning">{{ warning }}</p>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import { chatArtifactUrl } from '../../services/chat/capabilities.js';
const props = defineProps({ result: { type: Object, required: true } });
const urls = ref([]), error = ref(''), loading = ref(false);
watch(() => props.result, async (result, _, onCleanup) => {
  let active = true; onCleanup(() => { active = false; });
  urls.value = []; error.value = ''; loading.value = true;
  try { const loaded = await Promise.all(result.artifacts.map(chatArtifactUrl)); if (active) urls.value = loaded; }
  catch { if (active) error.value = 'Saved media is unavailable. Restore the local artifact to play it.'; }
  finally { if (active) loading.value = false; }
}, { immediate: true });
</script>
<style scoped>
.chat-result { display:grid; gap:var(--bz-space-4); margin-block:var(--bz-space-4); padding:var(--bz-space-4); background:var(--bz-surface-2, var(--bz-card)); border:1px solid var(--bz-border); border-radius:var(--bz-r-lg); color:var(--bz-fg); min-width:0; }
.chat-result header { display:flex; align-items:center; flex-wrap:wrap; gap:var(--bz-space-2); }
.chat-result header .bz-eyebrow { margin-left:auto; }
.chat-result__artifact { display:grid; gap:var(--bz-space-2); min-width:0; }
.chat-result :is(img,video) { width:100%; max-height:420px; object-fit:contain; border-radius:var(--bz-r-md); }
.chat-result audio { width:100%; }
.chat-result pre { white-space:pre-wrap; overflow-wrap:anywhere; max-height:320px; overflow:auto; color:var(--bz-fg); background:var(--bz-canvas); padding:var(--bz-space-3); }
.chat-result__transcript { white-space:pre-wrap; max-height:320px; overflow:auto; }
.chat-result__warning { color:var(--bz-fg-muted); }
.chat-result .bz-btn { justify-self:start; }
.chat-result .bz-btn--ghost { color:var(--bz-fg); background:var(--bz-canvas); border:1px solid var(--bz-border); }
</style>
