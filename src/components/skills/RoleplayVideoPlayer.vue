<template>
  <div class="roleplay-video-player">
    <video ref="player" :key="src" :src="src || undefined" :poster="poster"
      controls playsinline preload="metadata"
      @error="failed = true" @loadeddata="failed = false" />
    <div v-if="failed || !src" class="roleplay-video-player__error" role="alert">
      <span>Unable to play this video. The file may be unavailable or its format unsupported.</span>
      <button v-if="src" class="bz-btn bz-btn--ghost bz-btn--sm" type="button" @click="retry">Retry</button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { roleplayVideoSource } from '../../utils/roleplayVideo.js';
const props = defineProps({ source: String, poster: String });
const retryVersion = ref(0);
const source = computed(() => roleplayVideoSource(props.source));
const src = computed(() => {
  if (!retryVersion.value || !/^bonzai-blob:/i.test(source.value)) return source.value;
  // Chromium also caches failed media reads outside the HTTP cache. A fresh
  // local URL retries the file; never modify remote URLs (they may be signed).
  const url = new URL(source.value);
  url.searchParams.set('playback-retry', String(retryVersion.value));
  return url.href;
});
const player = ref(null);
const failed = ref(false);
watch(src, () => { failed.value = false; });
watch(() => props.source, () => { retryVersion.value = 0; });
async function retry() {
  failed.value = false;
  retryVersion.value += 1;
  await nextTick();
  const video = player.value;
  if (!video) return;
  video.load();
  // A retry is an explicit user gesture; autoplay is never needed to use controls.
  video.play()?.catch(() => {
    // A blocked play gesture or a source change is not a broken media file.
    if (player.value === video && video.error) failed.value = true;
  });
}
</script>

<style scoped>
.roleplay-video-player video { display: block; width: 100%; max-height: 70vh; background: var(--bz-canvas); border-radius: var(--bz-radius-md, 8px); }
.roleplay-video-player__error { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: var(--bz-fg); background: var(--bz-surface); font-size: .875rem; }
.roleplay-video-player__error button { flex-shrink: 0; }
</style>
