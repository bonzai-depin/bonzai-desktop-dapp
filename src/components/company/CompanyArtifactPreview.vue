<template>
  <div class="artifact-preview" :class="`is-${kind}`" :aria-busy="loading">
    <p v-if="loading" role="status">{{ ui('Loading preview…') }}</p>
    <div v-else-if="error" class="artifact-preview__error" role="alert">
      <span class="material-symbols-outlined" aria-hidden="true">broken_image</span>
      <p>{{ ui(error) }}</p>
      <button type="button" class="bz-btn bz-btn--ghost" @click="loadSource">{{ ui('Retry preview') }}</button>
    </div>
    <img v-else-if="kind === 'image' && source" :src="source" :alt="artifactTitle(row) || ui('Generated result')" @error="mediaFailed" />
    <video v-else-if="kind === 'video' && source" :src="source" controls playsinline preload="metadata" @error="mediaFailed"></video>
    <audio v-else-if="kind === 'audio' && source" :src="source" controls preload="metadata" @error="mediaFailed"></audio>
    <CompanyMarkdown v-else-if="['text', 'code'].includes(kind)" :source="formattedText" />
    <div v-else class="artifact-preview__file">
      <span class="material-symbols-outlined" aria-hidden="true">{{ kind === '3d' ? 'deployed_code' : 'draft' }}</span>
      <div><strong>{{ artifactTitle(row) || ui('Saved file') }}</strong><span>{{ ui('Download to open this file.') }}</span></div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { artifactKind, artifactSource, artifactPlainText } from "../../services/company/artifactMedia.js";
import { operationText } from "../../i18n/operations.js";
import { i18n } from "../../i18n/index.js";
import CompanyMarkdown from "./CompanyMarkdown.vue";
import {
  artifactText,
  artifactLanguage,
  artifactTitle,
} from "../../services/company/artifactPresentation.js";

const props = defineProps({ row: { type: Object, required: true } });
const ui = value => operationText(value, i18n.state.locale);
const source = ref(''), loading = ref(false), error = ref(''), loadedText = ref(null);
const kind = computed(() => artifactKind(props.row));
let revision = 0, release = () => {};
const mediaFailed = () => { error.value = 'This preview could not be opened. Download the file to try another player.'; };
const text = computed(() => {
 const value = loadedText.value ?? artifactText(props.row);
 if (!props.row.meta?.demoRun) return value;
 let fenced = false;
 return value.split('\n').map(line => {
   if (line.startsWith('```')) { fenced = !fenced; return line; }
   if (fenced) return line;
   const heading = line.match(/^(#{1,3} )(.*)$/);
   if (heading) return heading[1] + operationText(heading[2], i18n.state.locale);
   if (line.startsWith('Status: ')) return operationText('Status', i18n.state.locale) + ': ' + operationText(line.slice(8), i18n.state.locale);
   return operationText(line, i18n.state.locale);
 }).join('\n');
});
const formattedText = computed(() => {
  const language = artifactLanguage(props.row);
  if (!language) return text.value;
  const fence = "`".repeat(
    Math.max(
      3,
      ...[...text.value.matchAll(/`+/g)].map((match) => match[0].length + 1),
    ),
  );
  return `${fence}${language}\n${text.value}\n${fence}`;
});

watch(() => [props.row.id, props.row.blobId, props.row.payload, props.row.pipeline, props.row.meta?.localPath], loadSource, { immediate: true });
async function loadSource() {
  const run = ++revision;
  release(); release = () => {};
  source.value = ''; error.value = ''; loading.value = false; loadedText.value = null;
  const textFile = ['text', 'code'].includes(kind.value);
  if (['3d', 'file'].includes(kind.value) || (textFile && !props.row.blobId && props.row.meta?.payloadEncoding !== 'path')) return;
  loading.value = true;
  try {
    if (textFile) {
      const value = await artifactPlainText(props.row);
      if (run === revision) loadedText.value = value;
    } else {
      const result = await artifactSource(props.row);
      if (run !== revision) { result.release(); return; }
      release = result.release; source.value = result.url;
    }
  } catch (failure) {
    if (run === revision) error.value = failure.message || 'This saved file is empty or unavailable.';
  } finally {
    if (run === revision) loading.value = false;
  }
}
onBeforeUnmount(() => { revision++; release(); });
</script>

<style scoped>
.artifact-preview {
  min-width: 0;
  overflow: hidden;
  color: var(--bz-fg-mid);
}
.artifact-preview img,
.artifact-preview video {
  display: block;
  width: 100%;
  max-height: 560px;
  object-fit: contain;
  background: var(--bz-panel);
  border-radius: var(--bz-r);
}
.artifact-preview audio {
  display: block;
  width: 100%;
}
.artifact-preview__error { display: grid; justify-items: start; gap: var(--bz-space-3); padding: var(--bz-space-5); border: 1px solid var(--bz-border); border-radius: var(--bz-r); }
.artifact-preview__error p { margin: 0; }
.artifact-preview__error > span { color: var(--bz-warning); }
.artifact-preview__file {
  display: flex;
  align-items: center;
  gap: var(--bz-space-4);
  padding: var(--bz-space-5);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
}
.artifact-preview__file > .material-symbols-outlined {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  color: var(--bz-fg-mid);
  font: 400 24px/1 "Material Symbols Outlined";
}
.artifact-preview__file div {
  display: grid;
  gap: var(--bz-space-2);
  min-width: 0;
}
.artifact-preview__file strong {
  color: var(--bz-fg);
  font-size: var(--bz-size-body);
  line-height: 1.4;
  font-weight: 400;
  text-transform: capitalize;
}
.artifact-preview__file div > span {
  color: var(--bz-fg-mid);
  font: 400 var(--bz-size-meta)/1.6 var(--bz-font-mono);
  overflow-wrap: anywhere;
}
</style>
