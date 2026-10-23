<template>
  <aside ref="presenceRoot" data-i18n-skip class="mesh-presence" :class="{ 'is-open': open, 'is-embedded': embedded, 'is-compact': compact }">
    <button
      type="button"
      class="mesh-presence__trigger"
      :aria-expanded="open"
      :aria-controls="panelId"
      :aria-label="modeLabel"
      :title="modeLabel"
      @click="toggle"
    >
      <span class="material-symbols-outlined" aria-hidden="true">sensors</span>
      <span class="mesh-presence__signal" :class="{ 'is-online': store.state.started }" aria-hidden="true"></span>
      <span class="mesh-presence__copy">
        <strong>{{ modeLabel }}</strong>
        <small>{{ presenceLabel }}</small>
      </span>
      <span v-if="store.state.unread" class="mesh-presence__badge">{{ Math.min(store.state.unread, 9) }}</span>
    </button>

    <div class="local-token-count" :title="usageAvailable ? i18n.number(lifetimeTokens) + ' ' + i18n.t('rc.mesh.tokens') : 'Available in desktop app'" :aria-label="i18n.t('rc.mesh.tokens')">
      <span class="material-symbols-outlined" aria-hidden="true">data_usage</span>
      <span class="local-token-count__copy"><span>{{ i18n.t('rc.mesh.tokens') }}</span><strong>{{ usageAvailable ? formattedTokenCount : '—' }}</strong></span>
    </div>

    <section v-if="open" :id="panelId" class="mesh-presence__panel">
      <header>
        <div>
          <p class="bz-eyebrow">{{ i18n.t('rc.mesh.title') }}</p>
          <h2 class="bz-h2">{{ modeLabel }}</h2>
        </div>
        <button class="bz-iconbtn bz-iconbtn--sm" :title="i18n.t('common.settings')" :aria-label="i18n.t('common.settings')" @click="openSettings">
          <span class="material-symbols-outlined">tune</span>
        </button>
      </header>

      <div class="mesh-presence__stats" :aria-label="i18n.t('rc.mesh.title')">
        <span><strong>{{ store.state.connectedPeers }}</strong> {{ i18n.t('rc.mesh.connected') }}</span>
        <span><strong>{{ store.state.lanPeers }}</strong> {{ i18n.t('rc.mesh.lan') }}</span>
        <span><strong>{{ modeLabel }}</strong></span>
      </div>

      <div class="mesh-presence__activity">
        <p class="bz-eyebrow">{{ i18n.t('rc.mesh.activity') }}</p>
        <ol v-if="store.state.events.length">
          <li v-for="event in store.state.events.slice(0, 8)" :key="event.id">
            <span class="mesh-presence__event-dot" :class="`is-${event.type}`"></span>
            <span>{{ event.label }}</span>
            <time>{{ relativeTime(event.ts) }}</time>
          </li>
        </ol>
        <div v-else class="mesh-presence__empty">{{ i18n.t('rc.mesh.empty') }}</div>
      </div>
    </section>
  </aside>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, useId } from "vue";
import meshStore from "../stores/meshStore.js";

defineProps({
  embedded: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
});

import { operationText } from '../i18n/operations.js';
import { useI18n } from '../i18n/index.js';
const i18n = useI18n();
const panelId = useId();
const store = meshStore;
const presenceLabel = computed(() => !store.state.started ? i18n.t('rc.mesh.offline') : Math.max(store.state.connectedPeers, store.state.lanPeers) ? i18n.t('rc.mesh.peers', { count: Math.max(store.state.connectedPeers, store.state.lanPeers) }) : i18n.t('rc.mesh.discovering'));
const open = ref(false);
const lifetimeTokens = ref(0);
const usageAvailable = ref(false);
const presenceRoot = ref(null);
function dismissPanels(event) {
  if (event.type === 'keydown' && event.key !== 'Escape') return;
  if (event.type === 'pointerdown' && presenceRoot.value?.contains(event.target)) return;
  open.value = false;
}
let stopTokenListener = null;
const modeName = computed(() => i18n.t(store.state.mode === 'local' ? 'common.private' : `network.${store.state.mode}`));
const modeLabel = computed(() => operationText(({local: 'Private Mode', consumer: 'Consumer Mode', provider: 'Provider Mode'})[store.state.mode] || 'Private Mode', i18n.state.locale));
const formattedTokenCount = computed(() => {
  const value = lifetimeTokens.value;
  if (value >= 1_000_000_000) return `${Number((value / 1_000_000_000).toFixed(1))}B`;
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 10_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return i18n.number(value);
});

onMounted(async () => {
  document.addEventListener('pointerdown', dismissPanels);
  document.addEventListener('keydown', dismissPanels);
  try {
    const total = await window.electronAPI?.usage?.getLifetimeTokens?.();
    usageAvailable.value = total != null && Number.isFinite(Number(total));
    lifetimeTokens.value = Math.max(0, Number(total) || 0);
  } catch { usageAvailable.value = false; }
  stopTokenListener = window.electronAPI?.usage?.onLifetimeTokensChanged?.((total) => {
    usageAvailable.value = Number.isFinite(Number(total));
    lifetimeTokens.value = Math.max(0, Number(total) || 0);
  });
});

onUnmounted(() => { stopTokenListener?.(); document.removeEventListener('pointerdown', dismissPanels); document.removeEventListener('keydown', dismissPanels); });

function toggle() {
  open.value = !open.value;
  if (open.value) store.markRead();
}
function openSettings() {
  open.value = false;
  window.dispatchEvent(new CustomEvent("bonzai:open-network"));
}
function relativeTime(ts) {
  return i18n.relative(Number(ts || Date.now()));
}
</script>

<style scoped>
.mesh-presence { position: fixed; top: var(--bz-space-4); right: var(--bz-space-4); z-index: 8500; width: min(370px, calc(100vw - 32px)); font-family: var(--bz-font-body); }
.mesh-presence.is-embedded { position: relative; inset: auto; z-index: 30; width: 100%; margin-top: var(--bz-space-2); }
.mesh-presence__trigger { width: 100%; min-height: 48px; display: flex; align-items: center; gap: var(--bz-space-3); padding: var(--bz-space-2) var(--bz-space-3); color: var(--bz-fg); background: var(--bz-panel); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-sm); box-shadow: var(--bz-elev-2); cursor: pointer; text-align: left; }
.is-embedded .mesh-presence__trigger { min-height: 38px; padding: var(--bz-space-2); background: var(--bz-raised); border-color: var(--bz-border); box-shadow: none; }
.mesh-presence__trigger:focus-visible { outline: 2px solid var(--bz-purple-300); outline-offset: 2px; }
.mesh-presence__signal { width: 9px; height: 9px; border-radius: 50%; background: var(--bz-fg-faint); flex: 0 0 auto; }
.mesh-presence__signal.is-online { background: var(--bz-emerald-500); box-shadow: 0 0 0 4px var(--bz-emerald-soft); }
.mesh-presence__copy { display: grid; flex: 1; min-width: 0; line-height: 1.25; }
.mesh-presence__copy strong { font-size: var(--bz-size-meta); font-weight: 400; }
.mesh-presence__copy small { color: var(--bz-fg-low); font-size: var(--bz-size-micro); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mesh-presence__badge { min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 10px; color: var(--bz-on-accent); background: var(--bz-purple-500); font: 11px/1 var(--bz-font-mono); }
.mesh-presence__tokens { display: flex; align-items: center; gap: var(--bz-space-2); min-height: 30px; padding: var(--bz-space-1) var(--bz-space-2); color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.mesh-presence__tokens .material-symbols-outlined { color: var(--bz-purple-300); font-size: 15px; }
.mesh-presence__tokens strong { color: var(--bz-fg); font-family: var(--bz-font-mono); font-weight: 500; }
.mesh-presence__panel { margin-top: var(--bz-space-2); padding: var(--bz-space-4); background: var(--bz-panel); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-sm); box-shadow: var(--bz-elev-3); animation: bz-rise var(--bz-dur-base) var(--bz-ease-out); }
.is-embedded .mesh-presence__panel { position: fixed; top: 72px; left: 248px; width: min(370px, calc(100vw - 264px)); }
.mesh-presence__panel header { display: flex; justify-content: space-between; gap: var(--bz-space-3); align-items: flex-start; padding-bottom: var(--bz-space-4); border-bottom: 1px solid var(--bz-border); }
.mesh-presence__panel h2, .mesh-presence__panel p { margin: 0; }
.mesh-presence__privacy { display: flex; gap: var(--bz-space-3); padding: var(--bz-space-4) 0; color: var(--bz-fg-mid); }
.mesh-presence__privacy > span { color: var(--bz-emerald-500); }
.mesh-presence__privacy p { display: grid; gap: var(--bz-space-1); font-size: var(--bz-size-meta); }
.mesh-presence__privacy p span { color: var(--bz-fg-low); line-height: 1.45; }
.mesh-presence__stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; overflow: hidden; background: var(--bz-border); border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); }
.mesh-presence__stats span { display: grid; gap: 2px; padding: var(--bz-space-3); color: var(--bz-fg-low); background: var(--bz-raised); font-size: var(--bz-size-micro); }
.mesh-presence__stats strong { color: var(--bz-fg); font: 400 var(--bz-size-meta)/1.2 var(--bz-font-mono); }
.mesh-presence__activity { padding-top: var(--bz-space-4); }
.mesh-presence__activity ol { list-style: none; margin: var(--bz-space-2) 0 0; padding: 0; max-height: 246px; overflow: auto; }
.mesh-presence__activity li { display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: var(--bz-space-2); padding: 10px 0; border-bottom: 1px solid var(--bz-border); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.mesh-presence__activity time { color: var(--bz-fg-low); font: 11px/1 var(--bz-font-mono); }
.mesh-presence__event-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bz-purple-300); }
.mesh-presence__event-dot.is-inference_completed { background: var(--bz-emerald-500); }
.mesh-presence__event-dot.is-peer_disconnected { background: var(--bz-fg-faint); }
.mesh-presence__empty { margin-top: var(--bz-space-3); padding: var(--bz-space-5) 0; color: var(--bz-fg-low); text-align: center; font-size: var(--bz-size-meta); }
@media (max-width: 720px) { .mesh-presence { top: var(--bz-space-2); right: var(--bz-space-2); width: calc(100vw - 16px); } }
.mesh-presence.is-embedded.is-compact { display: grid; justify-items: center; margin-top: 0; }.is-embedded.is-compact .mesh-presence__trigger { width: 40px; min-height: 36px; justify-content: center; }.is-embedded.is-compact .mesh-presence__copy, .is-embedded.is-compact .mesh-presence__badge, .is-embedded.is-compact .mesh-presence__trigger > .material-symbols-outlined { display: none; }.is-embedded.is-compact .mesh-presence__tokens { display: grid; justify-items: center; gap: 0; padding-inline: 0; }.is-embedded.is-compact .mesh-presence__tokens > span:last-child { font-size: 0; }.is-embedded.is-compact .mesh-presence__tokens strong { font-size: 10px; }.is-embedded.is-compact .mesh-presence__panel { position: fixed; top: var(--bz-space-3); left: 96px; width: min(300px, calc(100vw - 112px)); }

.mesh-presence.is-embedded { display: flex; flex-direction: column; gap: 12px; }
.local-token-count { order: -1; display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; border: 0; border-radius: var(--bz-r-sm); padding: 14px 10px; color: var(--bz-fg); background: var(--bz-emerald-soft); }
.local-token-count > .material-symbols-outlined { color: var(--bz-emerald-500); }
.local-token-count__copy { display: grid; gap: 3px; flex: 1; font-size: 11px; }
.local-token-count__copy strong { font: italic 900 28px/1.15 'Fira Sans Condensed', sans-serif; color: var(--bz-fg); }
.mesh-presence__copy strong, .mesh-presence__privacy strong { color: var(--bz-fg); }
.is-embedded .mesh-presence__trigger { background: var(--bz-raised); border: 1px solid var(--bz-border-strong); padding: 10px 8px; }
.is-compact .local-token-count { flex-direction: column; gap: 4px; padding: 8px 2px; }
.is-compact .local-token-count__copy > span { display: none; }
.is-compact .local-token-count__copy strong { font-size: 12px; }
.mesh-presence.is-embedded.is-compact { align-items: center; }
.is-embedded.is-compact .mesh-presence__trigger { position: relative; }
.is-embedded.is-compact .mesh-presence__trigger > .material-symbols-outlined { display: block; font-size: 20px; color: var(--bz-fg-mid); }
.is-embedded.is-compact .mesh-presence__signal { position: absolute; width: 5px; height: 5px; top: 5px; right: 5px; box-shadow: none; }
.mesh-presence__trigger:hover { border-color: var(--bz-accent); background: var(--bz-control-hover); }
.mesh-presence__panel { max-height: calc(100dvh - 96px); overflow-y: auto; }
/* Same control treatment as the sidebar model and hardware buttons. */
.is-embedded .mesh-presence__trigger {
  position: relative; min-height: 36px; padding: var(--bz-space-2) var(--bz-space-3);
  gap: var(--bz-space-2); background: var(--bz-card); border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm); color: var(--bz-fg-low); font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta); box-shadow: none;
  transition: border-color var(--bz-dur-fast), color var(--bz-dur-fast);
}
.is-embedded .mesh-presence__trigger:hover { background: var(--bz-card); border-color: var(--bz-purple-300); color: var(--bz-fg); }
.is-embedded .mesh-presence__trigger > .material-symbols-outlined { font-size: 14px; color: var(--bz-purple-300); }
.is-embedded .mesh-presence__copy strong { color: inherit; font-weight: 500; }
.is-embedded .mesh-presence__copy small { display: none; }
.is-embedded .mesh-presence__signal { display: none; }
.is-embedded.is-compact .mesh-presence__trigger { width: 100%; }
@media (max-height: 900px) and (min-width: 1025px) {
  .is-embedded .mesh-presence__trigger { padding: 4px var(--bz-space-2); }
}
</style>
