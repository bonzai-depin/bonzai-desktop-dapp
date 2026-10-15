<template>
  <Teleport to="body">
    <aside class="server-overlay" :class="{ 'has-error': failed }" aria-label="Local AI server">
      <div class="server-overlay__identity" aria-hidden="true">
        <img src="../assets/logo.png" alt="" />
      </div>
      <div class="server-overlay__copy" role="status" aria-live="polite">
        <span class="server-overlay__eyebrow">BonzAI · local engine</span>
        <h2>{{ title }}</h2>
        <p>{{ failed ? status.message : description }}</p>
      </div>
      <span v-if="busy" class="server-overlay__activity"><span class="material-symbols-outlined" aria-hidden="true">memory</span> Preparing your workspace</span>
      <button v-if="status.canRetry" class="bz-btn bz-btn--primary" @click="$emit('retry')">Retry</button>
      <button class="bz-iconbtn" aria-label="Dismiss server status" @click="$emit('dismiss')"><span class="material-symbols-outlined">close</span></button>
      <div v-if="busy" class="server-overlay__progress" role="progressbar" aria-label="Starting local engine" />
    </aside>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ status: { type: Object, required: true }, description: String });
defineEmits(['retry', 'dismiss']);
const busy = computed(() => ['starting', 'restarting'].includes(props.status.type));
const failed = computed(() => ['error', 'crashed'].includes(props.status.type));
const title = computed(() => ({ starting: 'Starting your local AI', restarting: 'Restarting your local AI', ready: 'Your local AI is ready', stopped: 'Local AI is stopped', error: 'Local AI needs attention', crashed: 'Local AI needs attention' })[props.status.type] || 'Local AI');
</script>

<style scoped>
.server-overlay { position: fixed; inset: 0 0 auto; z-index: 1600; display: flex; align-items: center; gap: 20px; padding: 22px 28px; background: var(--bz-panel); color: var(--bz-fg); border-bottom: 1px solid var(--bz-border-brand); box-shadow: var(--bz-elev-2); }
.server-overlay__identity { display: grid; place-items: center; width: 58px; height: 58px; flex: 0 0 auto; border-radius: 16px; background: var(--bz-accent-soft); }
.server-overlay__identity img { width: 36px; height: 36px; object-fit: contain; }
.server-overlay__copy { flex: 1; min-width: 0; }
.server-overlay__eyebrow { color: var(--bz-fg-muted); font-size: 12px; }
.server-overlay h2 { color: var(--bz-fg); font-family: var(--bz-font-metric); font-size: 27px; margin: 2px 0 4px; }
.server-overlay p { margin: 0; color: var(--bz-fg-muted); font-size: 13px; overflow-wrap: anywhere; max-height: 25vh; overflow-y: auto; }
.server-overlay__activity { display: flex; align-items: center; gap: 8px; color: var(--bz-fg-muted); font-size: 12px; }
.server-overlay__progress { position: absolute; inset: auto 0 0; height: 3px; overflow: hidden; background: var(--bz-border); }
.server-overlay__progress::after { content: ''; position: absolute; width: 30%; height: 100%; background: var(--bz-accent); animation: engine-progress 2s ease-in-out infinite; }
.has-error { border-bottom-color: var(--bz-danger); }
@keyframes engine-progress { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
@media (max-width: 650px) { .server-overlay { padding: 16px; gap: 12px; flex-wrap: wrap; } .server-overlay__identity, .server-overlay__activity { display: none; } .server-overlay h2 { font-size: 23px; } .server-overlay__copy { flex-basis: 65%; } }
@media (prefers-reduced-motion: reduce) { .server-overlay__progress::after { animation: none; width: 100%; opacity: .6; } }
</style>
