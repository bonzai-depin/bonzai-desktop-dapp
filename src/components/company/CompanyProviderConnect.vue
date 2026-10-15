<script setup>
import './company-design.css';
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { COMPANY_OAUTH_PROVIDERS } from '../../shared/companyOAuth.js';
import { useModalAccessibility } from '../../composables/useModalAccessibility.js';
import { operationError, operationText } from '../../i18n/operations.js';
import { i18n } from '../../i18n/index.js';
import BzCloseButton from '../BzCloseButton.vue';

const props = defineProps({ companyId: { type: String, required: true }, connector: { type: Object, required: true } });
const emit = defineEmits(['close', 'connected']);
const dialog = ref(null), loading = ref(true), busy = ref(false), configured = ref(false), error = ref(''), advanced = ref(false);
const draft = reactive({ clientId: '', clientSecret: '', tenant: 'common' });
const provider = computed(() => COMPANY_OAUTH_PROVIDERS[props.connector.kind]);
const api = () => window.electronAPI?.companyConnector;
const identity = { companyId: props.companyId, connectorId: props.connector.id };
const ui = text => operationText(text, i18n.state.locale);
let disposed = false;
useModalAccessibility(dialog, { onClose: close });
onMounted(async () => {
  try {
    if (!api()?.oauthStatus) throw new Error('Restart BonzAI to enable provider sign-in.');
    configured.value = (await api().oauthStatus({ kind: props.connector.kind })).ready;
  } catch (e) { error.value = operationError(e, i18n.state.locale); }
  finally { loading.value = false; }
});
onBeforeUnmount(() => {
  disposed = true;
  if (busy.value) api()?.cancelOAuth?.(identity).catch(() => {});
  draft.clientSecret = '';
});
async function close() {
  if (busy.value) {
    try { await api().cancelOAuth(identity); }
    catch (e) { error.value = operationError(e, i18n.state.locale); return; }
  }
  emit('close');
}
async function connect() {
  if (busy.value || loading.value) return;
  busy.value = true; error.value = '';
  try {
    if (advanced.value && draft.clientId.trim()) {
      configured.value = (await api().configureOAuth({ kind: props.connector.kind, ...draft })).ready;
      draft.clientSecret = '';
    }
    if (!configured.value) throw new Error('Provider sign-in needs one-time administrator setup.');
    const result = await api().authorizeOAuth(identity);
    if (!disposed) emit('connected', result);
  } catch (e) { if (!disposed) error.value = operationError(e, i18n.state.locale); }
  finally { busy.value = false; }
}
</script>

<template>
  <Teleport to="body">
    <div class="provider-overlay company-screen" data-i18n-skip @click.self="!busy && close()">
      <section ref="dialog" class="provider-dialog" role="dialog" aria-modal="true" :aria-labelledby="`provider-title-${connector.id}`" :aria-busy="busy || loading">
        <header>
          <span class="provider-icon material-symbols-outlined" aria-hidden="true">{{ provider.icon }}</span>
          <h2 :id="`provider-title-${connector.id}`">{{ ui('Connect') }} {{ provider.title }}</h2>
          <BzCloseButton :aria-label="ui('Close')" @click="close" />
        </header>
        <div class="provider-content">
          <p>{{ ui('Choose your account in your browser and approve access. Your password is never entered in BonzAI.') }}</p>
          <div class="provider-permission"><span class="material-symbols-outlined" aria-hidden="true">verified_user</span><span>{{ ui(provider.permissions) }}</span></div>
          <p v-if="loading" role="status">{{ ui('Checking sign-in availability…') }}</p>
          <p v-else-if="busy" class="provider-pending" role="status"><span class="material-symbols-outlined" aria-hidden="true">open_in_browser</span>{{ ui('Finish signing in in your browser. This window will update automatically.') }}</p>
          <p v-else-if="!configured && !error" class="provider-setup-note" role="status">{{ ui('Provider sign-in needs one-time administrator setup.') }}</p>
          <p v-if="error" class="provider-error" role="alert">{{ error }}</p>
          <details :open="advanced" @toggle="advanced = $event.target.open">
            <summary>{{ ui('Administrator setup') }}</summary>
            <div class="provider-setup">
              <p>{{ ui('Configure the provider application once for this device. Other team connections reuse it.') }}</p>
              <p class="company-caption">{{ provider.provider === 'google' ? ui('Use a Google Desktop app with Gmail or Calendar API enabled.') : ui('Use a Microsoft public desktop app with a loopback redirect: http://localhost/callback.') }}</p>
              <label>{{ ui('Desktop application ID') }}<input v-model.trim="draft.clientId" :disabled="busy" autocomplete="off" /></label>
              <label v-if="provider.provider === 'google'">{{ ui('Desktop client secret (if provided)') }}<input v-model="draft.clientSecret" :disabled="busy" type="password" autocomplete="off" /></label>
              <label v-else>{{ ui('Microsoft tenant') }}<input v-model.trim="draft.tenant" :disabled="busy" autocomplete="off" placeholder="common" /></label>
            </div>
          </details>
        </div>
        <footer>
          <button class="bz-btn bz-btn--ghost" @click="close">{{ ui('Cancel') }}</button>
          <button class="bz-btn bz-btn--primary" :disabled="busy || loading || (!configured && !(advanced && draft.clientId)) || !api()?.authorizeOAuth" @click="connect">
            <span class="material-symbols-outlined" aria-hidden="true">open_in_browser</span>
            {{ busy ? ui('Waiting for sign-in…') : provider.provider === 'google' ? ui('Continue with Google') : ui('Continue with Microsoft') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.provider-overlay{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:24px;background:rgb(0 0 0 / .55);backdrop-filter:blur(8px)}
.provider-dialog{width:min(100%,540px);max-height:calc(100dvh - 48px);display:flex;flex-direction:column;overflow:hidden;background:var(--bz-panel);border:1px solid var(--bz-border-strong);border-radius:var(--bz-r-lg)}
.provider-dialog header{display:flex;align-items:center;gap:12px;padding:24px;border-bottom:1px solid var(--bz-border)}
.provider-dialog h2{flex:1;font:italic 900 26px/1.2 var(--bz-font-metric);margin:0}
.provider-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:var(--bz-r);background:var(--bz-accent-soft);color:var(--bz-accent)}
.provider-content{display:grid;gap:20px;padding:24px;overflow:auto;min-height:0}
.provider-content p{margin:0;line-height:1.6;color:var(--bz-fg-mid)}
.provider-permission,.provider-pending{display:flex;align-items:start;gap:12px;padding:16px;background:var(--bz-canvas);border-radius:var(--bz-r)}
.provider-permission .material-symbols-outlined{font-size:20px;color:var(--bz-fg-mid)}
.provider-content .provider-error{color:var(--bz-danger)}
.provider-content details{border-top:1px solid var(--bz-border);padding-top:16px}
.provider-content summary{cursor:pointer;font-size:13px;color:var(--bz-fg-mid)}
.provider-setup{display:grid;gap:16px;padding-top:16px}
.provider-setup label{display:grid;gap:6px;font-size:13px}
.provider-dialog footer{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:10px;padding:20px 24px;border-top:1px solid var(--bz-border)}
@media(max-width:520px){.provider-overlay{padding:12px}.provider-dialog{max-height:calc(100dvh - 24px)}.provider-content,.provider-dialog header{padding:20px}.provider-dialog footer{padding:16px 20px}}
</style>
