<template>
  <div class="artifact-preview" :class="`is-${kind}`">
    <img v-if="kind === 'image' && source" :src="source" :alt="row.prompt || 'Generated result'" />
    <video v-else-if="kind === 'video' && source" :src="source" controls preload="metadata"></video>
    <audio v-else-if="kind === 'audio' && source" :src="source" controls preload="metadata"></audio>
    <VueMarkdown v-else-if="kind === 'text'" :source="text" />
    <div v-else class="artifact-preview__file">
      <span class="material-symbols-outlined" aria-hidden="true">deployed_code</span>
      <div><strong>{{ row.pipeline || 'Artifact' }} result</strong><span>{{ row.blobExt || 'Stored output' }} · {{ row.id }}</span></div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import VueMarkdown from "vue-markdown-render";

const props = defineProps({ row: { type: Object, required: true } });
const source = ref("");
const kind = computed(() => {
  const pipeline = String(props.row.pipeline || "").toLowerCase();
  if (pipeline === "image") return "image";
  if (pipeline === "video") return "video";
  if (["audio", "music", "speech"].includes(pipeline)) return "audio";
  if (["text", "vision"].includes(pipeline)) return "text";
  return "file";
});
const text = computed(() => String(props.row.payload || props.row.meta?.text || "No textual output was returned."));

watch(() => [props.row.blobId, props.row.payload, props.row.pipeline], loadSource, { immediate: true });

async function loadSource() {
  source.value = "";
  if (props.row.blobId && window.electronAPI?.db?.blobs?.url) {
    try {
      source.value = await window.electronAPI.db.blobs.url(props.row.blobId, props.row.blobExt, mimeFor(props.row.pipeline, props.row.blobExt));
      return;
    } catch {}
  }
  const payload = props.row.payload;
  if (typeof payload !== "string" || !payload) return;
  source.value = payload.startsWith("data:") ? payload : `data:${mimeFor(props.row.pipeline, props.row.blobExt)};base64,${payload}`;
}

function mimeFor(pipeline, ext) {
  const value = String(pipeline || ext || "").toLowerCase();
  if (value === "image" || value === "png") return "image/png";
  if (["audio", "music", "speech", "mp3"].includes(value)) return "audio/mpeg";
  if (value === "video" || value === "mp4") return "video/mp4";
  if (["3d", "gltf"].includes(value)) return "model/gltf+json";
  return "application/octet-stream";
}
</script>

<style scoped>
.artifact-preview { min-width: 0; overflow: hidden; color: var(--bz-fg-mid); }
.artifact-preview img, .artifact-preview video { display: block; width: 100%; max-height: 420px; object-fit: contain; background: var(--bz-panel); }
.artifact-preview audio { display: block; width: 100%; }
.artifact-preview__file { display: flex; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-4); border: 1px solid var(--bz-border); background: var(--bz-panel); }
.artifact-preview__file > span { color: var(--bz-purple-100); font-size: 24px; }
.artifact-preview__file div { display: grid; gap: var(--bz-space-1); min-width: 0; }
.artifact-preview__file strong { color: var(--bz-fg); font-size: var(--bz-size-meta); font-weight: 400; text-transform: capitalize; }
.artifact-preview__file span { color: var(--bz-fg-low); font: 400 var(--bz-size-micro)/1.3 var(--bz-font-mono); overflow-wrap: anywhere; }
</style>
