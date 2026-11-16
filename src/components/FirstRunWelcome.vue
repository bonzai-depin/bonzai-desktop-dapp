<template>
  <Teleport to="body">
    <Transition name="welcome">
      <div class="welcome-overlay">
        <section ref="dialogRef" class="welcome-window" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <header class="welcome-header">
            <div>
              <p class="bz-eyebrow">{{ i18n.t('onboarding.eyebrow') }}</p>
              <h1 :id="titleId" class="bz-h1">{{ i18n.t('onboarding.title') }}</h1>
              <p class="welcome-version">BonzAI v{{ version }}</p>
            </div>
            <LanguageSelector />
          </header>

          <div class="welcome-body">
          <div class="welcome-art" aria-hidden="true"><img src="../assets/bonzai_brand_background.jpg" alt="" /><img class="welcome-logo" src="../assets/bonzai_logo-full.png" alt="" /></div>
            <div class="welcome-copy">
            <p>{{ i18n.t('onboarding.intro') }}</p>
            <section class="welcome-recommendation" aria-live="polite">
              <span class="material-symbols-outlined">memory</span>
              <div><p class="bz-eyebrow">{{ recommendation?.pooled ? i18n.t('meshDevices.withLinked') : $ui('Selected for your device') }}</p>
                <h2>{{ detecting ? $ui('Checking your hardware…') : recommendation?.model.name || $ui('Choose your first model') }}</h2>
                <p v-if="recommendation?.pooled">{{ i18n.t('meshDevices.pooledCopy') }}</p>
                <p v-else-if="recommendation">{{ $ui('Quality-first local intelligence. Your conversations stay on this device.') }}</p>
                <p v-else>{{ $ui('Explore the model library to choose a model for your device.') }}</p>
                <p v-if="recommendation?.pooled && recommendation.local" class="welcome-alone">{{ i18n.t('meshDevices.aloneModel', { model: recommendation.local.model.name }) }}</p>
                <div v-if="recommendation" class="welcome-specs"><span><strong class="bz-metric">{{ (recommendation.required / 1e9).toFixed(1) }} GB</strong> {{ $ui('estimated memory') }}</span><span><strong class="bz-metric">8K</strong> {{ $ui('context estimate') }}</span><span>{{ $ui('Free local inference') }}</span></div>
              </div>
            </section>
            <MeshDevices class="welcome-devices" />
          </div>

          <div class="welcome-tools" :aria-label="i18n.t('onboarding.choose')">
            <button
              v-for="tool in tools"
              :key="tool.mode"
              type="button"
              class="welcome-tool"
              @click="start(tool.mode)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">{{ tool.icon }}</span>
              <span>
                <strong>{{ i18n.t(tool.title) }}</strong>
                <small>{{ i18n.t(tool.copy) }}</small>
              </span>
              <span class="material-symbols-outlined welcome-tool__arrow" aria-hidden="true">arrow_forward</span>
            </button>
          </div>

          </div>
          <footer class="welcome-footer">
            <p>{{ i18n.t('onboarding.downloads') }}</p>
            <button type="button" class="bz-btn bz-btn--primary bz-btn--lg" @click="start('chat')">
              {{ i18n.t('onboarding.start') }}
              <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, useId, onMounted } from 'vue'
import { recommendFirstRunModel } from '../services/modelRecommendation.js'
import { listAllLLMs } from '../skills/flagship.js'
import modelStore from '../stores/modelStore.js'
import { MODEL_PREFERENCE_KEY } from '../config/modelDefaults.js'
import { version } from '../../package.json'
import { useModalAccessibility } from '../composables/useModalAccessibility.js'
import LanguageSelector from './LanguageSelector.vue'
import MeshDevices from './MeshDevices.vue'
import meshStore from '../stores/meshStore.js'
import { useI18n } from '../i18n/index.js'

const emit = defineEmits(['complete'])
const i18n = useI18n()
const titleId = useId()
const dialogRef = ref(null)
const hardware = ref(null), detecting = ref(true)
// Linking a device during onboarding immediately raises what can be recommended.
const recommendation = computed(() => {
  try { return recommendFirstRunModel(listAllLLMs(), hardware.value, { pooledBudget: meshStore.state.pooledBudget }) }
  catch { return null }
})
onMounted(async () => {
  try { hardware.value = await window.electronAPI?.systemInformation?.() }
  catch { hardware.value = null }
  finally { detecting.value = false }
})
useModalAccessibility(dialogRef, { onClose: () => start('chat') })
const tools = [
  { mode: 'chat', icon: 'chat', title: 'onboarding.textTitle', copy: 'onboarding.textCopy' },
  { mode: 'image', icon: 'image', title: 'onboarding.imageTitle', copy: 'onboarding.imageCopy' },
  { mode: 'music', icon: 'graphic_eq', title: 'onboarding.audioTitle', copy: 'onboarding.audioCopy' },
  { mode: 'video', icon: 'movie', title: 'onboarding.videoTitle', copy: 'onboarding.videoCopy' },
  { mode: 'game', icon: 'view_in_ar', title: 'onboarding.threeTitle', copy: 'onboarding.threeCopy' },
]

function start(mode) {
  try { if (recommendation.value && !localStorage.getItem(MODEL_PREFERENCE_KEY)) modelStore.setPreferred(recommendation.value.model) } catch { /* Keep onboarding usable with unavailable storage. */ }
  emit('complete', mode)
}
</script>

<style scoped>
.welcome-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--bz-z-modal) + 20);
  display: grid;
  place-items: center;
  padding: clamp(16px, 4vw, 48px);
  overflow-y: auto;
  background: var(--bz-overlay);
}
.welcome-window {
  display: flex;
  flex-direction: column;
  color: var(--bz-fg);
  width: min(920px, 100%);
  max-height: min(900px, calc(100vh - 32px));
  overflow: hidden;
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-lg);
  background: var(--bz-card);
  box-shadow: var(--bz-elev-3);
}
.welcome-body { min-height: 0; overflow-y: auto; }
.welcome-tool strong, .welcome-mesh strong { color: var(--bz-fg); }
.welcome-header,
.welcome-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-5);
  padding: var(--bz-space-5) var(--bz-space-6);
}
.welcome-header { border-bottom: 1px solid var(--bz-border); }
.welcome-header h1,
.welcome-header p { margin: 0; }
.welcome-version {
  margin-top: var(--bz-space-1) !important;
  color: var(--bz-purple-300);
  font-family: var(--bz-font-mono);
  font-size: var(--bz-size-meta);
}
.welcome-recommendation{display:flex;gap:20px;padding:24px 0;border-top:1px solid var(--bz-border);margin-bottom:20px}
.welcome-recommendation > span{font-size:36px;color:var(--bz-accent)}
.welcome-recommendation h2{margin:8px 0;font:900 italic 30px var(--bz-font-metric)}
.welcome-recommendation p{margin:8px 0;color:var(--bz-fg-mid)}
.welcome-alone{font-size:13px}
.welcome-devices{margin-bottom:20px}
.welcome-specs{display:flex;gap:20px;flex-wrap:wrap;margin-top:18px;font-size:13px}
.welcome-specs strong{font-size:20px;margin-right:5px}
.welcome-copy { padding: var(--bz-space-5) var(--bz-space-6) 0; }
.welcome-copy > p {
  max-width: 72ch;
  margin: 0 0 var(--bz-space-4);
  color: var(--bz-fg-mid);
  line-height: 1.6;
}
.welcome-mesh {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bz-space-3);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border-brand);
  border-radius: var(--bz-r-sm);
  background: var(--bz-purple-soft);
}
.welcome-mesh > .material-symbols-outlined { color: var(--bz-purple-300); }
.welcome-mesh p { margin: var(--bz-space-1) 0 0; color: var(--bz-fg-mid); line-height: 1.5; }
.welcome-tools {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-3);
  padding: var(--bz-space-5) var(--bz-space-6);
}
.welcome-tool {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-panel);
  color: var(--bz-fg);
  text-align: left;
  cursor: pointer;
}
.welcome-tool:hover,
.welcome-tool:focus-visible { border-color: var(--bz-purple-300); background: var(--bz-raised); }
.welcome-tool > .material-symbols-outlined:first-child { color: var(--bz-purple-300); }
.welcome-tool strong,
.welcome-tool small { display: block; }
.welcome-tool small { margin-top: 3px; color: var(--bz-fg-low); line-height: 1.35; }
.welcome-tool__arrow { color: var(--bz-fg-low); font-size: 18px !important; }
.welcome-footer { border-top: 1px solid var(--bz-border); }
.welcome-footer p { max-width: 58ch; margin: 0; color: var(--bz-fg-low); line-height: 1.45; }
.welcome-footer .bz-btn { flex: 0 0 auto; }
.welcome-enter-active,
.welcome-leave-active { transition: opacity var(--bz-dur-normal) var(--bz-ease-out); }
.welcome-enter-from,
.welcome-leave-to { opacity: 0; }
@media (max-width: 720px) {
  .welcome-header,
  .welcome-footer { align-items: stretch; flex-direction: column; }
  .welcome-tools { grid-template-columns: 1fr; }
  .welcome-header,
  .welcome-copy,
  .welcome-tools,
  .welcome-footer { padding-left: var(--bz-space-4); padding-right: var(--bz-space-4); }
  .welcome-footer .bz-btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .welcome-enter-active,
  .welcome-leave-active { transition: none; }
}

.welcome-header { align-items: flex-start; }
.welcome-header :deep(.bz-sidebar__theme-picker){display:flex;align-items:center;gap:8px;flex-shrink:0}
.welcome-header :deep(.bz-sidebar__theme-display){display:flex;align-items:center;justify-content:center;gap:6px;min-width:80px}
.welcome-header :deep(.bz-sidebar__theme-arrow){display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--bz-border);border-radius:8px;background:var(--bz-panel);color:var(--bz-fg);cursor:pointer}

.welcome-header > div { min-width: 0; }
.welcome-header h1 { font-size: var(--bz-size-h1); overflow-wrap: anywhere; }
.welcome-art { position: relative; height: 150px; overflow: hidden; background: var(--bz-canvas); }
.welcome-art > img:first-child { width: 100%; height: 100%; object-fit: cover; object-position: center 45%; }
.welcome-art .welcome-logo { position: absolute; left: 28px; bottom: 20px; width: 150px; height: auto; }
.welcome-tool small { color: var(--bz-fg-mid); }
.welcome-tools { padding-top: 0; }
.welcome-version { color: var(--bz-fg-mid); margin-top: 8px !important; }
@media (max-width: 720px) { .welcome-art { height: 105px; } .welcome-header { gap: 14px; } }
</style>
