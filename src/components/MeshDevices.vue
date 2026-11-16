<template>
  <section v-if="available" class="mesh-devices" :class="{ 'is-compact': compact }" :aria-labelledby="titleId">
    <header class="mesh-devices__head">
      <span class="material-symbols-outlined" aria-hidden="true">devices</span>
      <div>
        <h3 :id="titleId" class="mesh-devices__title">{{ i18n.t('meshDevices.title') }}</h3>
        <p v-show="statusLine" class="mesh-devices__status" aria-live="polite">{{ statusLine }}</p>
      </div>
      <strong v-if="store.state.devices.length" class="mesh-devices__total bz-metric">{{ i18n.t('meshDevices.combined', { gb: gb(store.state.pooledBudget) }) }}</strong>
    </header>

    <p v-if="!compact && !store.state.devices.length" class="mesh-devices__intro">{{ i18n.t('meshDevices.intro') }}</p>

    <ul v-if="store.state.devices.length" class="mesh-devices__list">
      <li v-if="store.state.self">
        <span class="mesh-devices__dot is-ready" aria-hidden="true"></span>
        <span class="mesh-devices__name">{{ store.state.self.name }}<small>{{ i18n.t('meshDevices.thisDevice') }}</small></span>
        <span class="mesh-devices__memory">{{ i18n.t('meshDevices.memory', { gb: gb(store.state.self.memBudget) }) }}</span>
        <span></span>
      </li>
      <li v-for="device in store.state.devices" :key="device.peerId">
        <span class="mesh-devices__dot" :class="{ 'is-ready': device.online && device.sharing, 'is-idle': device.online && !device.sharing }" aria-hidden="true"></span>
        <span class="mesh-devices__name">{{ device.name }}<small>{{ deviceStatus(device) }}</small></span>
        <span class="mesh-devices__memory">{{ device.memBudget ? i18n.t('meshDevices.memory', { gb: gb(device.memBudget) }) : '' }}</span>
        <button type="button" class="bz-iconbtn bz-iconbtn--sm" :title="i18n.t('meshDevices.unlinkNamed', { name: device.name })" :aria-label="i18n.t('meshDevices.unlinkNamed', { name: device.name })" :disabled="busy" @click="unlink(device)">
          <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
        </button>
      </li>
    </ul>
    <p v-if="store.state.pool.active" class="mesh-devices__note">{{ i18n.t('meshDevices.inUse', { names: store.state.pool.devices.map(device => device.name).join(', ') }) }}</p>

    <div v-if="store.state.invitation" class="mesh-devices__code">
      <output class="mesh-devices__code-value bz-metric" :aria-label="store.state.invitation.code.split('').join(' ')">{{ store.state.invitation.code }}</output>
      <p>{{ i18n.t('meshDevices.codeHint') }}</p>
      <button type="button" class="bz-btn bz-btn--ghost" @click="cancelInvite">{{ i18n.t('meshDevices.cancel') }}</button>
    </div>

    <form v-else-if="entering" class="mesh-devices__join" @submit.prevent="join">
      <label :for="inputId">{{ i18n.t('meshDevices.codeLabel') }}</label>
      <div class="mesh-devices__join-row">
        <input :id="inputId" ref="codeInput" v-model="code" class="mesh-devices__input" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="ABCD-EFGH" :aria-describedby="error ? errorId : undefined" :aria-invalid="error ? 'true' : undefined" />
        <button type="submit" class="bz-btn bz-btn--primary" :disabled="busy || code.trim().length < 8">{{ busy ? i18n.t('meshDevices.linking') : i18n.t('meshDevices.link') }}</button>
        <button type="button" class="bz-btn bz-btn--ghost" :disabled="busy" @click="stopEntering">{{ i18n.t('meshDevices.cancel') }}</button>
      </div>
    </form>

    <div v-else class="mesh-devices__actions">
      <button type="button" class="bz-btn" :disabled="!store.state.started || busy" @click="showCode">
        <span class="material-symbols-outlined" aria-hidden="true">qr_code_2</span>{{ i18n.t('meshDevices.showCode') }}
      </button>
      <button type="button" class="bz-btn" :disabled="!store.state.started || busy" @click="startEntering">
        <span class="material-symbols-outlined" aria-hidden="true">keyboard</span>{{ i18n.t('meshDevices.enterCode') }}
      </button>
    </div>
    <p v-if="error" :id="errorId" class="mesh-devices__error" role="alert">{{ error }}</p>

    <div v-if="settings && store.state.devices.length" class="mesh-devices__settings">
      <label><input type="checkbox" :checked="store.state.settings.sharing" :disabled="busy" @change="setSetting({ sharing: $event.target.checked })" /> {{ i18n.t('meshDevices.lend') }}</label>
      <label><input type="checkbox" :checked="store.state.settings.pooling === 'auto'" :disabled="busy" @change="setSetting({ pooling: $event.target.checked ? 'auto' : 'off' })" /> {{ i18n.t('meshDevices.borrow') }}</label>
    </div>
    <p v-if="store.state.self && store.state.self.persistentIdentity === false" class="mesh-devices__note">{{ i18n.t('meshDevices.ephemeral') }}</p>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import meshStore from '../stores/meshStore.js'
import { useI18n } from '../i18n/index.js'

defineProps({
  compact: { type: Boolean, default: false },
  settings: { type: Boolean, default: false },
})

const i18n = useI18n()
const store = meshStore
const titleId = useId(), inputId = useId(), errorId = useId()
const available = Boolean(window.electronAPI?.mesh)
const entering = ref(false), busy = ref(false), code = ref(''), error = ref(''), codeInput = ref(null)
let invitationTimer = null

const gb = bytes => i18n.number(Math.round((Number(bytes) || 0) / 1e9))
const statusLine = computed(() => {
  if (!store.state.started) return i18n.t('meshDevices.offline')
  if (store.state.nearby > 0) return i18n.tc('meshDevices.nearby', store.state.nearby)
  return store.state.devices.length ? '' : i18n.t('meshDevices.searching')
})
const deviceStatus = device => i18n.t(!device.online ? 'meshDevices.away' : device.sharing ? 'meshDevices.ready' : 'meshDevices.notLending')
const ERRORS = { invalid_code: 'errorCode', no_invitation: 'errorNoInvitation', no_devices: 'errorNoDevices', mesh_offline: 'errorOffline' }
const explain = reason => i18n.t(`meshDevices.${ERRORS[reason] || 'errorFailed'}`)

async function run(action) {
  busy.value = true
  error.value = ''
  try { return await action() }
  catch { error.value = explain(); return null }
  finally { busy.value = false }
}

async function showCode() {
  const result = await run(() => store.invite())
  if (result && !result.ok) error.value = explain(result.error)
}
const cancelInvite = () => run(() => store.cancelInvite())
async function startEntering() {
  entering.value = true
  error.value = ''
  await nextTick()
  codeInput.value?.focus()
}
function stopEntering() {
  entering.value = false
  code.value = ''
  error.value = ''
}
async function join() {
  const result = await run(() => store.join(code.value))
  if (!result) return
  if (result.ok) stopEntering()
  else error.value = explain(result.error)
}
const unlink = device => run(() => store.unlink(device.peerId))
const setSetting = patch => run(() => store.updateDeviceSettings(patch))

// While a code is on screen, notice quickly when the other device uses it or it expires.
watch(() => Boolean(store.state.invitation), (open) => {
  clearInterval(invitationTimer)
  invitationTimer = open ? setInterval(() => store.refreshDevices(), 2000) : null
}, { immediate: true })
onMounted(() => { if (available) store.refreshDevices() })
onUnmounted(() => clearInterval(invitationTimer))
</script>

<style scoped>
.mesh-devices { display: grid; gap: var(--bz-space-3); padding: var(--bz-space-4); border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-panel); color: var(--bz-fg); font-family: var(--bz-font-body); }
.mesh-devices.is-compact { padding: var(--bz-space-3) 0 0; border: 0; border-top: 1px solid var(--bz-border); border-radius: 0; background: transparent; }
.mesh-devices__head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-3); }
.mesh-devices__head > .material-symbols-outlined { color: var(--bz-purple-300); }
.mesh-devices__title { margin: 0; font-size: var(--bz-size-body); font-weight: 600; color: var(--bz-fg); }
.mesh-devices__status { margin: 2px 0 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.mesh-devices__total { font-size: var(--bz-size-h3); white-space: nowrap; }
.mesh-devices__intro, .mesh-devices__note, .mesh-devices__code p { margin: 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.5; }
.mesh-devices__list { list-style: none; margin: 0; padding: 0; display: grid; }
.mesh-devices__list li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto 36px; align-items: center; gap: var(--bz-space-3); min-height: 44px; border-top: 1px solid var(--bz-border); }
.mesh-devices__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bz-fg-faint); }
.mesh-devices__dot.is-ready { background: var(--bz-emerald-500); }
.mesh-devices__dot.is-idle { background: var(--bz-warning); }
.mesh-devices__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--bz-size-body); }
.mesh-devices__name small { margin-left: var(--bz-space-2); color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.mesh-devices__memory { color: var(--bz-fg-mid); font: var(--bz-size-meta) var(--bz-font-mono); white-space: nowrap; }
.mesh-devices__list .bz-iconbtn { width: 36px; height: 36px; }
.mesh-devices__actions, .mesh-devices__join-row { display: flex; flex-wrap: wrap; gap: var(--bz-space-2); }
.mesh-devices__actions .bz-btn .material-symbols-outlined { font-size: 18px; margin-right: 6px; }
.mesh-devices__code { display: grid; justify-items: start; gap: var(--bz-space-2); }
.mesh-devices__code-value { font-size: var(--bz-size-display); letter-spacing: 0.08em; line-height: 1.1; color: var(--bz-fg); user-select: all; overflow-wrap: anywhere; }
.mesh-devices__join { display: grid; gap: var(--bz-space-2); }
.mesh-devices__join label { color: var(--bz-fg-mid); font-size: var(--bz-size-meta); }
.mesh-devices__input { flex: 1 1 160px; min-width: 0; min-height: 36px; padding: 0 var(--bz-space-3); border: 1px solid var(--bz-border-strong); border-radius: var(--bz-r-sm); background: var(--bz-card); color: var(--bz-fg); font: var(--bz-size-body) var(--bz-font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
.mesh-devices__input:focus-visible { outline: 2px solid var(--bz-purple-300); outline-offset: 2px; }
.mesh-devices__input[aria-invalid="true"] { border-color: var(--bz-danger); }
.mesh-devices__error { margin: 0; color: var(--bz-danger); font-size: var(--bz-size-meta); }
.mesh-devices__settings { display: grid; gap: var(--bz-space-2); padding-top: var(--bz-space-3); border-top: 1px solid var(--bz-border); }
.mesh-devices__settings label { display: flex; align-items: flex-start; gap: var(--bz-space-2); min-height: 24px; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.45; cursor: pointer; }
.mesh-devices__settings input { margin-top: 2px; accent-color: var(--bz-purple-500); }
@media (max-width: 520px) {
  .mesh-devices__head { grid-template-columns: auto minmax(0, 1fr); }
  .mesh-devices__total { grid-column: 1 / -1; }
  .mesh-devices__actions .bz-btn, .mesh-devices__join-row .bz-btn { flex: 1 1 auto; }
}
</style>
