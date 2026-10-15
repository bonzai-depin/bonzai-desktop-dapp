<template>
  <Teleport to="body">
    <div v-if="connectionDialog.open && !externalWallet" class="bz-modal-overlay connection-overlay" @click.self="close">
      <section ref="dialog" class="bz-modal connection-modal" role="dialog" aria-modal="true" :aria-label="i18n.t('connection.title')" data-i18n-skip>
        <header class="bz-modal__header">
          <h2 class="bz-h2">{{ i18n.t('connection.title') }}</h2>
          <BzCloseButton :aria-label="i18n.t('common.close')" @click="close" />
        </header>
        <div class="connection-body">
          <button type="button" class="connection-option" :disabled="busy" @click="connectExternal">
            <span class="material-symbols-outlined" aria-hidden="true">account_balance_wallet</span>
            <span><strong>{{ i18n.t('auth.connectWallet') }}</strong><small>{{ i18n.t('connection.walletDescription') }}</small></span>
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
          <button type="button" class="connection-option" :disabled="busy || !canSignIn" :aria-describedby="emailNetworkLimited ? 'connection-email-network' : undefined" @click="signIn">
            <span class="material-symbols-outlined" aria-hidden="true">mail</span>
            <span><strong>{{ i18n.t('auth.signIn') }}</strong><small>{{ i18n.t(canSignIn ? 'connection.emailDescription' : 'connection.desktopRequired') }}</small></span>
            <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
          </button>
          <p v-if="emailNetworkLimited" id="connection-email-network" class="connection-status">{{ i18n.t('connection.emailNetworkNotice', { network: economyNetwork.name }) }}</p>
          <p v-if="busy" class="connection-status" role="status">{{ i18n.t('connection.waiting') }}</p>
          <p v-if="connectionDialog.error" class="connection-error" role="alert">{{ connectionDialog.error }}</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useWeb3Store } from '../stores/web3.store.js';
import { useI18n } from '../i18n/index.js';
import { CONFIG, ECONOMY_NETWORK_KEY } from '../config/web3.config.js';
import { useModalAccessibility, suspendModalAccessibility } from '../composables/useModalAccessibility.js';
import { connectionDialog, requestConnection, finishConnection, cancelConnectionDialog } from '../services/connectionDialog.service.js';
import BzCloseButton from './BzCloseButton.vue';

const i18n = useI18n();
const store = useWeb3Store();
const dialog = ref(null);
const busy = ref(false);
const externalWallet = ref(false);
const canSignIn = Boolean(window.electronAPI?.wallet?.open);
const economyNetwork = CONFIG.networks[ECONOMY_NETWORK_KEY];
const emailNetworkLimited = Number(economyNetwork.chainId) !== 1;
let controller;
let attempt = 0;
useModalAccessibility(dialog, { onClose: close });

function close() {
  attempt++;
  controller?.abort();
  busy.value = false;
  cancelConnectionDialog();
}

async function connectExternal() {
  if (busy.value) return;
  const current = ++attempt;
  busy.value = true;
  connectionDialog.error = '';
  // Release focus isolation while the wallet provider owns its own dialog.
  externalWallet.value = true;
  const restoreFocus = suspendModalAccessibility();
  try {
    const result = await store.connect();
    if (current === attempt) finishConnection(result);
  } catch (error) {
    if (current === attempt) finishConnection({ success: false, error: error.message });
  } finally {
    externalWallet.value = false;
    if (current === attempt) busy.value = false;
    await nextTick();
    restoreFocus();
  }
}

async function signIn() {
  if (busy.value || !canSignIn) return;
  const current = ++attempt;
  controller = new AbortController();
  busy.value = true;
  connectionDialog.error = '';
  try {
    const opened = await window.electronAPI.wallet.open({ email: '' });
    if (current !== attempt) return;
    if (!opened?.ok) throw new Error(i18n.t('connection.openFailed'));
    const result = await store.connectWithPrivy({ signal: controller.signal });
    if (current === attempt) finishConnection(result);
  } catch (error) {
    if (current === attempt) finishConnection({ success: false, error: error.message });
  } finally {
    if (current === attempt) busy.value = false;
  }
}

function open() { requestConnection(); }
onMounted(() => window.addEventListener('bonzai:open-connect', open));
onBeforeUnmount(() => {
  window.removeEventListener('bonzai:open-connect', open);
  close();
});
</script>

<style scoped>
.connection-overlay { z-index: 10020; }
.connection-modal { width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; }
.connection-modal h2 { margin: 0; }
.connection-body { display: grid; gap: var(--bz-space-3); padding: var(--bz-space-5); }
.connection-option { display: flex; align-items: center; gap: var(--bz-space-3); width: 100%; min-height: 76px; padding: var(--bz-space-4); text-align: left; background: var(--bz-surface-2); color: var(--bz-fg); border: 1px solid var(--bz-border); border-radius: var(--bz-radius-md); cursor: pointer; }
.connection-option:hover:not(:disabled), .connection-option:focus-visible { border-color: var(--bz-accent); outline: 2px solid var(--bz-accent); outline-offset: 2px; }
.connection-option:disabled { background: var(--bz-panel); color: var(--bz-fg-mid); cursor: default; }
.connection-option > span:nth-child(2) { display: grid; gap: 4px; flex: 1; min-width: 0; }
.connection-option strong { font-size: var(--bz-size-body); }
.connection-option small, .connection-status { color: var(--bz-fg-mid); line-height: 1.5; }
.connection-error { color: var(--bz-danger); overflow-wrap: anywhere; }
.connection-status, .connection-error { margin: 0; font-size: var(--bz-size-caption); }
</style>
