<template>
  <Transition name="notif">
    <div v-if="authState.isAwaitingSignature" key="auth" class="bz-notif bz-notif--warning">
      <div class="bz-notif__body">
        <span class="bz-notif__title">{{ i18n.t('auth.awaiting') }}</span>
        <span class="bz-notif__desc">{{ i18n.t('auth.signMessage') }}</span>
      </div>
      <BonzaiPulse variant="dot" />
    </div>

    <div v-else-if="skillStore.autonomousMode && skillStore.isIdle" key="companion" class="bz-notif bz-notif--info" @click="goToCompanionChat" style="cursor:pointer">
      <div class="bz-notif__body">
        <span class="bz-notif__title">{{ i18n.t('companion.active', { name: skillStore.autonomousSession?.companion?.name || 'Companion' }) }}</span>
        <span class="bz-notif__desc">
          {{ i18n.t('companion.continuing') }}
          <strong v-if="skillStore.missedMessages > 0">({{ i18n.tc('companion.newMessages', skillStore.missedMessages) }})</strong>
        </span>
      </div>
      <BzCloseButton size="sm" variant="subtle" :aria-label="i18n.t('auth.dismiss')" @click.stop="skillStore.updateActivity()" />
    </div>

    <div v-else-if="generationToast.show" key="generation" class="bz-notif bz-notif--success">
      <div class="bz-notif__body">
        <span class="bz-notif__title">{{ generationToast.title }}</span>
        <span class="bz-notif__desc">{{ generationToast.desc }}</span>
      </div>
      <BzCloseButton size="sm" variant="subtle" :aria-label="i18n.t('auth.dismiss')" @click="generationToast.show = false" />
    </div>

    <div v-else-if="serverStatus.show" key="server" class="bz-notif bz-notif--server" :class="notifClass">
      <div class="bz-notif__server-icon">
        <span class="material-symbols-outlined">{{ serverStatusIcon }}</span>
      </div>
      <div class="bz-notif__body">
        <span class="bz-notif__title">{{ serverStatus.message }}</span>
        <span class="bz-notif__desc">{{ serverStatusDescription }}</span>
        <span v-if="serverStatus.type === 'starting' || serverStatus.type === 'restarting'" class="bz-notif__rail" aria-hidden="true"></span>
      </div>
      <div style="display:flex; align-items:center; gap:var(--bz-space-2)">
        <button v-if="serverStatus.canRetry" class="bz-btn bz-btn--ghost" style="font-size:var(--bz-size-micro); padding:4px var(--bz-space-3)" @click="handleServerRestart">
          <span class="material-symbols-outlined" style="font-size:14px">refresh</span>
          {{ i18n.t('common.retry') }}
        </button>
        <BzCloseButton size="sm" variant="subtle" :aria-label="i18n.t('auth.dismiss')" @click="serverStatus.show = false" />
      </div>
    </div>

    <span v-else key="none"></span>
  </Transition>

  <div id="bonzai">
    <nav class="bz-sidebar" :aria-label="i18n.t('nav.primary')">
      <div class="bz-sidebar__brand">
        <span class="bz-sidebar__wordmark">BonzAI</span>
        <div v-if="!isConnected && !isConnecting" class="bz-sidebar__auth">
          <a href="#" class="bz-sidebar__auth-link" @click.prevent="connect">{{ i18n.t('auth.connectWallet') }}</a>
          <span class="bz-sidebar__auth-sep"> {{ i18n.t('auth.or') }} </span>
          <a href="#" class="bz-sidebar__auth-link" @click.prevent="openPrivyWallet">{{ i18n.t('auth.signIn') }}</a>
        </div>
        <div v-if="isConnected && walletAddress" class="bz-sidebar__wallet bz-sidebar__wallet--top">
          <div class="bz-sidebar__wallet-info" @click="copyAddress">
            <span v-if="upAvatarUrl" class="bz-sidebar__up-avatar"><img :src="upAvatarUrl" alt="" /></span>
            <span class="bz-sidebar__wallet-addr">{{ upDisplayName ? '@'+upDisplayName : truncatedAddress }}</span>
            <span class="bz-sidebar__level">{{ displayedHighestLevelKey || 'LVL0' }}</span>
          </div>
          <div class="bz-sidebar__balance">
            <span class="bz-sidebar__balance-amt">{{ formatBalance(totalBalance) }}</span>
            <span class="bz-sidebar__balance-token">BONZAI</span>
          </div>
          <div class="bz-sidebar__wallet-actions">
            <button class="bz-sidebar__wallet-btn" @click="refresh" :title="i18n.t('common.refresh')">
              <span class="material-symbols-outlined" :class="{ spinning: isRefreshing }">sync</span>
            </button>
            <button class="bz-sidebar__wallet-btn" @click="disconnect" :title="i18n.t('common.disconnect')">
              <span class="material-symbols-outlined">logout</span>
            </button>
          </div>
        </div>
        <MeshPresence embedded />
      </div>

      <div class="bz-sidebar__nav-shell" :class="{ 'has-more': sidebarCanScroll && !sidebarAtBottom }">
      <div ref="sidebarNav" class="bz-sidebar__nav" @scroll="updateSidebarScrollState">
        <div class="bz-sidebar__group">
          <span class="bz-sidebar__label">{{ i18n.t('nav.create') }}</span>
          <button v-for="t in createItems" :key="t.id" class="bz-sidebar__item" :class="{ 'is-active': modelMode === t.id }" :title="t.label" @click="modelMode = t.id" :aria-pressed="modelMode === t.id">
            <span class="bz-sidebar__item-icon material-symbols-outlined">{{ t.icon }}</span>
            <span class="bz-sidebar__item-label">{{ t.label }}</span>
          </button>
        </div>

        <div class="bz-sidebar__group">
          <span class="bz-sidebar__label">{{ i18n.t('nav.earn') }}</span>
          <button v-for="t in earnItems" :key="t.id" class="bz-sidebar__item" :class="{ 'is-active': modelMode === t.id }" :title="t.label" @click="handleEarnAction(t.id)" :aria-pressed="modelMode === t.id">
            <span class="bz-sidebar__item-icon material-symbols-outlined">{{ t.icon }}</span>
            <span class="bz-sidebar__item-label">{{ t.label }}</span>
          </button>
        </div>

        <div class="bz-sidebar__group">
          <span class="bz-sidebar__label">{{ i18n.t('nav.automate') }}</span>
          <button v-for="t in automateItems" :key="t.id" class="bz-sidebar__item" :class="{ 'is-active': modelMode === t.id }" :title="t.label" @click="modelMode = t.id" :aria-pressed="modelMode === t.id">
            <span class="bz-sidebar__item-icon material-symbols-outlined">{{ t.icon }}</span>
            <span class="bz-sidebar__item-label">{{ t.label }}</span>
          </button>
        </div>

        <div class="bz-sidebar__group">
          <span class="bz-sidebar__label">{{ i18n.t('nav.train') }}</span>
          <button v-for="t in trainItems" :key="t.id" class="bz-sidebar__item" :class="{ 'is-active': modelMode === t.id }" :title="t.label" @click="modelMode = t.id" :aria-pressed="modelMode === t.id">
            <span class="bz-sidebar__item-icon material-symbols-outlined">{{ t.icon }}</span>
            <span class="bz-sidebar__item-label">{{ t.label }}</span>
          </button>
        </div>

        <div class="bz-sidebar__group">
          <span class="bz-sidebar__label">{{ i18n.t('nav.help') }}</span>
          <button class="bz-sidebar__item" :class="{ 'is-active': modelMode === 'memory' }" :title="i18n.t('nav.memory')" @click="modelMode = 'memory'" :aria-pressed="modelMode === 'memory'">
            <span class="bz-sidebar__item-icon material-symbols-outlined">neurology</span>
            <span class="bz-sidebar__item-label">{{ i18n.t('nav.memory') }}</span>
          </button>
          <button class="bz-sidebar__item" :class="{ 'is-active': modelMode === 'harness' }" :title="i18n.t('nav.harness')" @click="modelMode = 'harness'" :aria-pressed="modelMode === 'harness'">
            <span class="bz-sidebar__item-icon material-symbols-outlined">device_hub</span>
            <span class="bz-sidebar__item-label">{{ i18n.t('nav.harness') }}</span>
          </button>
          <button class="bz-sidebar__item" :class="{ 'is-active': modelMode === 'licenses' }" :title="i18n.t('nav.licenses')" @click="modelMode = 'licenses'" :aria-pressed="modelMode === 'licenses'">
            <span class="bz-sidebar__item-icon material-symbols-outlined">article</span>
            <span class="bz-sidebar__item-label">{{ i18n.t('nav.licenses') }}</span>
          </button>
        </div>

        <div class="bz-sidebar__group bz-sidebar__group--settings">
          <span class="bz-sidebar__label">{{ i18n.t('nav.settings') }}</span>
          <LanguageSelector class="bz-sidebar__language" />
          <div class="bz-sidebar__theme-picker">
            <button class="bz-sidebar__theme-arrow" @click="cycleTheme(-1)" :title="i18n.t('theme.previous')">
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <div class="bz-sidebar__theme-display">
              <div class="bz-sidebar__theme-swatch">
                <span v-for="c in currentTheme.swatch" :key="c" class="bz-sidebar__theme-dot" :style="{ background: c }"></span>
              </div>
              <span class="bz-sidebar__theme-name">{{ currentTheme.name }}</span>
            </div>
            <button class="bz-sidebar__theme-arrow" @click="cycleTheme(1)" :title="i18n.t('theme.next')">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="bz-sidebar__scroll-hint"
        :class="{ 'is-hidden': !sidebarCanScroll || sidebarAtBottom }"
        :title="i18n.t('nav.moreBelow')"
        :aria-label="i18n.t('nav.moreBelow')"
        @click="scrollSidebarForward"
      >
        <span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_down</span>
      </button>
      </div>

      <div class="bz-sidebar__footer">
        <button class="bz-sidebar__footer-action bz-sidebar__serve" @click="showNetworkModal = true" :title="p2pModeLabel">
          <span class="material-symbols-outlined bz-sidebar__serve-icon">{{ p2pModeIcon }}</span>
          <span class="bz-sidebar__serve-label">{{ p2pModeLabel }}</span>
        </button>

        <div class="bz-sidebar__footer-action bz-sidebar__model" @click="openBrowseModels" :title="i18n.t('network.browseModels')">
          <span class="material-symbols-outlined bz-sidebar__model-icon">neurology</span>
          <span class="bz-sidebar__model-name">{{ sidebarModelName || i18n.t('network.noModel') }}</span>
          <span v-if="alwaysLoaded" class="bz-sidebar__model-lock material-symbols-outlined" :title="i18n.t('network.alwaysLoaded')">lock</span>
        </div>

        <button v-if="systemValues?.memBudget" class="bz-sidebar__footer-action bz-sidebar__specs" @click="openSpecsModal" :title="(systemValues.memBudget / 1024**3).toFixed(0) + ' GB'">
          <span class="material-symbols-outlined">memory</span>
          <span>{{ (systemValues.memBudget / 1024**3).toFixed(0) }} GB</span>
        </button>
      </div>
    </nav>

    <main class="bz-main">
      <GenerativeText v-if="modelMode == 'chat'" key="chat" />
      <GenerativeAudio v-if="modelMode == 'music'" key="music" />
      <GenerativeImage v-if="modelMode == 'image'" key="image" />
      <GenerativeVideo v-if="modelMode == 'video'" key="video" :existing-image-base64="videoImageBase64" />
      <Generative3D v-if="modelMode == 'game'" key="game" />
      <GenerativeTraining v-if="modelMode == 'tune'" key="tune" mode="tune" />
      <GenerativeTraining v-if="modelMode == 'uncensor'" key="uncensor" mode="uncensor" />
      <GenerativeTraining v-if="modelMode == 'datasets'" key="datasets" mode="tune" />
      <GenerativeTraining v-if="modelMode == 'finetune'" key="finetune" mode="tune" />
      <GenerativeTraining v-if="modelMode == 'robot-train-chat'" key="robot-train-chat" mode="tune" />
      <SmartAgent v-if="modelMode == 'agent'" key="agent" />
      <ContributionOwnershipDashboard v-if="modelMode == 'economy'" key="economy" />
      <Markets v-if="modelMode == 'markets'" key="markets" />
      <AgentJobBoard v-if="jobsEnabled && modelMode == 'jobs'" key="jobs" />
      <MemoryGraph v-if="modelMode == 'memory'" key="memory" />
      <KeepAlive>
        <Company v-if="modelMode == 'company'" key="company" />
      </KeepAlive>
      <HarnessView v-if="modelMode == 'harness'" key="harness" />
      <ModelLicenses v-if="modelMode == 'licenses'" key="licenses" />
    </main>
  </div>

  <LlmModelPickerModal />
  <CommandPalette />
  <GenerationInspector />

  <RewardsModal v-if="showRewardsModal" @close="showRewardsModal = false" />

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showNetworkModal" class="network-modal-overlay" @click.self="showNetworkModal = false">
        <div class="network-modal">
          <div class="network-modal-header">
            <div class="network-titleblock">
              <p class="bz-eyebrow">Network</p>
              <h2 class="bz-h2">
                <span class="material-symbols-outlined">{{ p2pModeIcon }}</span>
                Network Settings
              </h2>
            </div>
            <BzCloseButton size="md" aria-label="Close network settings" @click="showNetworkModal = false" />
          </div>
          <div class="network-modal-body"><NetworkSettings /></div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="showAuthModal" class="auth-modal-overlay" @click.self="showAuthModal = false">
        <div class="auth-modal">
          <div class="auth-modal-header">
            <div class="bz-modal-titleblock">
              <p class="bz-eyebrow">Session</p>
              <h2 class="bz-h1">Session Status</h2>
            </div>
            <BzCloseButton size="md" aria-label="Close session status" @click="showAuthModal = false" />
          </div>
          <div class="auth-modal-body">
            <div class="auth-status-banner" :class="authStatusClass">
              <span class="status-dot-large" :class="authStatusClass"></span>
              <span class="status-label fira-sans-condensed-black-italic">{{ authStatusText }}</span>
            </div>
            <div class="auth-details">
              <div class="detail-row"><span class="label">Wallet</span><span class="value monospace">{{ truncatedAddress }}</span></div>
              <div class="detail-row" v-if="authState.level"><span class="label">Level</span><span class="value">{{ authState.level }}</span></div>
              <div class="detail-row"><span class="label">Session</span><span class="value" :class="{ 'value--danger': needsReauth, 'value--warning': tokenExpiringSoon }">{{ tokenExpiresIn > 0 ? formatExpiry(tokenExpiresIn) : "Expired" }}</span></div>
              <div class="detail-row" v-if="pendingOps > 0"><span class="label">Queued</span><span class="value value--warning">{{ pendingOps }}</span></div>
              <div class="detail-row" v-if="vaultStatus.isUnlocked"><span class="label">Vault</span><span class="value value--success">Unlocked</span></div>
            </div>
            <div class="auth-actions">
              <button v-if="needsReauth" class="bz-btn bz-btn--warning auth-action-btn fira-sans-condensed-black-italic" @click="handleReauth" :disabled="isReauthing" :class="{ 'bz-btn--running': isReauthing }"><span class="material-symbols-outlined mr-2">refresh</span>Reconnect Session</button>
              <button v-else-if="tokenExpiringSoon" class="bz-btn bz-btn--primary auth-action-btn fira-sans-condensed-black-italic" @click="handleRefreshToken" :disabled="isRefreshingToken" :class="{ 'bz-btn--running': isRefreshingToken }"><span class="material-symbols-outlined mr-2">sync</span>Refresh Token</button>
              <p v-else class="auth-ok">Your session is active. No action needed.</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="showPrivyLogin" class="privy-modal-overlay" @click.self="closePrivyLogin">
        <div class="privy-modal">
          <div class="privy-modal-header">
            <div class="bz-modal-titleblock">
              <p class="bz-eyebrow">Account</p>
              <h2 class="bz-h1">Sign In</h2>
            </div>
            <BzCloseButton size="md" aria-label="Close sign-in" @click="closePrivyLogin" />
          </div>
          <div class="privy-modal-body">
            <p class="privy-subtitle">Sign in with email — no crypto wallet needed. Your wallet opens in a secure window.</p>
            <button class="bz-btn bz-btn--success bz-btn--lg auth-action-btn fira-sans-condensed-black-italic" @click="openPrivyWallet"><span class="material-symbols-outlined mr-2">open_in_new</span>Open Wallet</button>
            <div v-if="privyError" class="privy-error-card mt-4"><span class="material-symbols-outlined" style="font-size: 16px">error</span><span>{{ privyError }}</span></div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div v-if="showSpecsModal" class="bz-modal-overlay" @click.self="showSpecsModal = false">
        <div class="bz-modal" role="dialog" aria-modal="true" aria-label="System specifications">
          <div class="bz-modal__header">
            <div><span class="bz-eyebrow">System</span><h2 class="bz-h2" style="margin:0">Hardware Specifications</h2></div>
            <BzCloseButton size="md" aria-label="Close" @click="showSpecsModal = false" />
          </div>
          <div class="bz-modal__body">
            <div v-if="specsData.hardware" class="bz-specs-grid">
              <div class="bz-specs-item"><span class="bz-specs-item__label">CPU</span><span class="bz-specs-item__value bz-mono">{{ specsData.hardware.cpu }}</span></div>
              <div class="bz-specs-item"><span class="bz-specs-item__label">Cores / Threads</span><span class="bz-specs-item__value bz-mono">{{ specsData.hardware.cpuCores }} / {{ specsData.hardware.cpuThreads }}</span></div>
              <div class="bz-specs-item"><span class="bz-specs-item__label">CPU Speed</span><span class="bz-specs-item__value bz-mono">{{ specsData.hardware.cpuSpeed }} GHz</span></div>
              <div class="bz-specs-item"><span class="bz-specs-item__label">GPU</span><span class="bz-specs-item__value bz-mono">{{ specsData.hardware.gpu }}</span></div>
              <div class="bz-specs-item"><span class="bz-specs-item__label">Total RAM</span><span class="bz-specs-item__value bz-mono">{{ (specsData.hardware.ram / 1024**3).toFixed(0) }} GB</span></div>
              <div class="bz-specs-item bz-specs-item--highlight"><span class="bz-specs-item__label">Inference Budget</span><span class="bz-specs-item__value bz-mono" style="color:var(--bz-emerald-500)">{{ (specsData.hardware.memBudget / 1024**3).toFixed(1) }} GB</span></div>
              <div v-if="specsData.hardware.vram > 0" class="bz-specs-item"><span class="bz-specs-item__label">VRAM</span><span class="bz-specs-item__value bz-mono">{{ (specsData.hardware.vram / 1024).toFixed(0) }} GB</span></div>
              <div class="bz-specs-item"><span class="bz-specs-item__label">OS</span><span class="bz-specs-item__value bz-mono">{{ specsData.hardware.os }}</span></div>
              <div class="bz-specs-item"><span class="bz-specs-item__label">Architecture</span><span class="bz-specs-item__value bz-mono">{{ specsData.hardware.arch }}</span></div>
            </div>
            <div v-if="specsData.performance" class="bz-specs-section">
              <h3 class="bz-h3">Average Performance</h3>
              <div class="bz-specs-grid">
                <div class="bz-specs-item"><span class="bz-specs-item__label">Text</span><span v-if="specsData.performance.text.count > 0" class="bz-specs-item__value bz-mono">{{ specsData.performance.text.avgTokPerSec.toFixed(1) }} tok/s</span><span v-else class="bz-specs-item__value bz-mono" style="color:var(--bz-fg-faint)">--</span></div>
                <div class="bz-specs-item"><span class="bz-specs-item__label">Image</span><span v-if="specsData.performance.image.count > 0" class="bz-specs-item__value bz-mono">{{ specsData.performance.image.avgElapsed.toFixed(1) }}s</span><span v-else class="bz-specs-item__value bz-mono" style="color:var(--bz-fg-faint)">--</span></div>
                <div class="bz-specs-item"><span class="bz-specs-item__label">Video</span><span v-if="specsData.performance.video.count > 0" class="bz-specs-item__value bz-mono">{{ specsData.performance.video.avgElapsed.toFixed(1) }}s</span><span v-else class="bz-specs-item__value bz-mono" style="color:var(--bz-fg-faint)">--</span></div>
                <div class="bz-specs-item"><span class="bz-specs-item__label">Audio</span><span v-if="specsData.performance.audioTts.count > 0" class="bz-specs-item__value bz-mono">{{ specsData.performance.audioTts.avgElapsed.toFixed(1) }}s</span><span v-else class="bz-specs-item__value bz-mono" style="color:var(--bz-fg-faint)">--</span></div>
                <div class="bz-specs-item"><span class="bz-specs-item__label">Music</span><span v-if="specsData.performance.audioMusic.count > 0" class="bz-specs-item__value bz-mono">{{ specsData.performance.audioMusic.avgElapsed.toFixed(1) }}s</span><span v-else class="bz-specs-item__value bz-mono" style="color:var(--bz-fg-faint)">--</span></div>
                <div class="bz-specs-item"><span class="bz-specs-item__label">3D</span><span v-if="specsData.performance.object.count > 0" class="bz-specs-item__value bz-mono">{{ specsData.performance.object.avgTokPerSec.toFixed(1) }} tok/s</span><span v-else class="bz-specs-item__value bz-mono" style="color:var(--bz-fg-faint)">--</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { defineAsyncComponent, ref, reactive, provide, computed, onMounted, onUnmounted, watch } from "vue";
import GenerativeText from "./components/GenerativeText.vue";
import GenerativeImage from "./components/GenerativeImage.vue";
import GenerativeVideo from "./components/GenerativeVideo.vue";
import GenerativeAudio from "./components/GenerativeAudio.vue";
import Generative3D from "./components/Generative3D.vue";
import GenerativeTraining from "./components/GenerativeTraining.vue";
import ContributionOwnershipDashboard from "./components/ContributionOwnershipDashboard.vue";
import Markets from "./components/Markets.vue";
import Company from "./components/Company.vue";
import HarnessView from "./components/HarnessView.vue";
import ModelLicenses from "./components/ModelLicenses.vue";
import SmartAgent from "./components/SmartAgent.vue";
import BonzaiPulse from "./components/BonzaiPulse.vue";
import BzCloseButton from "./components/BzCloseButton.vue";
import LlmModelPickerModal from "./components/LlmModelPickerModal.vue";
import CommandPalette from "./components/CommandPalette.vue";
import GenerationInspector from "./components/GenerationInspector.vue";
import AgentJobBoard from "./components/AgentJobBoard.vue";
import LanguageSelector from "./components/LanguageSelector.vue";
import RewardsModal from "./components/RewardsModal.vue";
import NetworkSettings from "./components/NetworkSettings.vue";
import MeshPresence from "./components/MeshPresence.vue";
import { authService, userInitiatedReAuth, refreshToken } from "./services/auth.service.js";
import { authVault } from "./services/authVault.service.js";
import { themeService } from "./services/theme.service.js";
import { useSkillStore } from "./stores/skillStore.js";
import { initOpenClawHandler } from "./services/openclaw.handler.js";
import { modelStore } from "./stores/modelStore.js";
import companyStore from "./stores/companyStore.js";
import meshStore from "./stores/meshStore.js";
import generationStore from "./stores/generationStore.js";
import { modelPicker } from "./services/modelPicker.service.js";
import { getPerformanceStats, getHardwareSpecs, initializeStore } from "./stores/inferenceStore.js";
import { useBonzaiWeb3 } from "./composables/useBonzaiWeb3.js";
import { CONFIG } from "./config/web3.config.js";
import { levelService, checkAllLevels } from "./services/level.service.js";
import { useI18n } from "./i18n/index.js";

const MemoryGraph = defineAsyncComponent(() => import("./components/MemoryGraph.vue"));

export default {
  name: "App",
  components: {
    GenerativeText, GenerativeImage, GenerativeVideo, GenerativeAudio,
    Generative3D, GenerativeTraining, SmartAgent, Company, HarnessView,
    ContributionOwnershipDashboard, Markets, MemoryGraph, ModelLicenses, AgentJobBoard, LanguageSelector,
    BonzaiPulse, BzCloseButton, LlmModelPickerModal, CommandPalette,
    GenerationInspector, RewardsModal, NetworkSettings, MeshPresence,
  },
  setup() {
    const i18n = useI18n();
    const jobsEnabled = import.meta.env.VITE_ENABLE_EXPERIMENTAL_JOB_BOARD === "1";
    const modelMode = ref("chat");
    const sidebarNav = ref(null);
    const sidebarCanScroll = ref(false);
    const sidebarAtBottom = ref(true);
    let sidebarResizeObserver = null;

    const updateSidebarScrollState = () => {
      const element = sidebarNav.value;
      if (!element) return;
      sidebarCanScroll.value = element.scrollHeight > element.clientHeight + 2;
      sidebarAtBottom.value = !sidebarCanScroll.value || element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
    };

    const scrollSidebarForward = () => {
      const element = sidebarNav.value;
      if (!element) return;
      element.scrollBy({ top: Math.max(120, element.clientHeight * 0.65), behavior: "smooth" });
    };

    const createItems = computed(() => [
      { id: "chat", label: i18n.t('nav.chat'), icon: "chat" }, { id: "image", label: i18n.t('nav.image'), icon: "image" },
      { id: "music", label: i18n.t('nav.audio'), icon: "headphones" }, { id: "video", label: i18n.t('nav.video'), icon: "movie" },
      { id: "game", label: i18n.t('nav.game'), icon: "sports_esports" },
    ]);
    const earnItems = computed(() => [
      { id: "economy", label: i18n.t('nav.ownership'), icon: "account_tree" }, { id: "markets", label: i18n.t('nav.markets'), icon: "monitoring" },
      { id: "rewards", label: i18n.t('nav.rewards'), icon: "trophy" },
    ]);
    const automateItems = computed(() => [
      { id: "agent", label: i18n.t('nav.agents'), icon: "automation" }, { id: "company", label: i18n.t('nav.company'), icon: "storefront" },
      ...(jobsEnabled ? [{ id: "jobs", label: i18n.t('nav.jobs'), icon: "work" }] : []),
    ]);
    const trainItems = computed(() => [
      { id: "tune", label: i18n.t('nav.tune'), icon: "tune" }, { id: "uncensor", label: i18n.t('nav.uncensor'), icon: "lock_open" },
    ]);
    const VALID_MODES = new Set(["chat", "image", "video", "music", "game", "agent", "tune", "uncensor", "datasets", "finetune", "robot-train-chat", "company", ...(jobsEnabled ? ["jobs"] : []), "harness", "economy", "markets", "memory", "licenses"]);
    const handleEarnAction = (id) => {
      if (id === "rewards") showRewardsModal.value = true;
      if (id === "economy") modelMode.value = "economy";
      if (id === "markets") modelMode.value = "markets";
      if (id === "memory") modelMode.value = "memory";
    };

    const onSetModeEvent = (e) => {
      const next = e?.detail;
      if (typeof next === "string" && VALID_MODES.has(next)) modelMode.value = next;
    };
    const onNavigateToTab = (e) => {
      const tab = e?.detail?.tab || e?.detail;
      if (typeof tab === "string" && VALID_MODES.has(tab)) modelMode.value = tab;
    };

    const notifClass = computed(() => {
      const m = {
        ready: "bz-notif--success", starting: "bz-notif--info",
        restarting: "bz-notif--info", crashed: "bz-notif--danger",
        error: "bz-notif--danger", stopped: "bz-notif--warning",
      };
      return m[serverStatus.type] || "bz-notif--info";
    });
    const serverStatusIcon = computed(() => {
      if (serverStatus.type === "ready") return "check_circle";
      if (serverStatus.type === "error" || serverStatus.type === "crashed") return "error";
      if (serverStatus.type === "stopped") return "power_settings_new";
      return "dns";
    });
    const serverStatusDescription = computed(() => {
      if (serverStatus.type === "starting") return i18n.t('server.starting');
      if (serverStatus.type === "restarting") return i18n.t('server.restarting');
      if (serverStatus.type === "ready") return i18n.t('server.ready');
      if (serverStatus.type === "stopped") return i18n.t('server.stopped');
      return i18n.t('server.attention');
    });

    const p2pMode = ref("local");
    const p2pStatus = ref({ started: false });
    let p2pStatusInterval = null;

    const p2pModeIcon = computed(() => {
      if (p2pMode.value === "consumer") return "cloud_download";
      if (p2pMode.value === "provider" && p2pStatus.value.started) return "sensors";
      if (p2pMode.value === "provider") return "cloud_upload";
      return p2pStatus.value.started ? "hub" : "wifi_off";
    });

    const p2pModeLabel = computed(() => {
      if (p2pMode.value === "consumer") return "Consumer Mode";
      if (p2pMode.value === "provider" && p2pStatus.value.started) return "Now Serving";
      if (p2pMode.value === "provider") return "Provider Mode";
      return p2pStatus.value.started ? "Mesh · Private" : "Mesh Offline";
    });

    const refreshP2PStatus = async () => {
      try {
        const status = await window.electronAPI.p2pStatus();
        if (status.ok) p2pStatus.value = status;
        const savedMode = await window.electronAPI.store.get("p2p.networkMode", "local");
        p2pMode.value = savedMode;
      } catch {}
    };

    const systemValues = ref({});
    const videoImageBase64 = ref("");
    let sysInfoInterval = null;
    const showSpecsModal = ref(false);
    const specsData = reactive({ hardware: null, performance: null });

    const openSpecsModal = async () => {
      specsData.hardware = await getHardwareSpecs();
      specsData.performance = getPerformanceStats();
      showSpecsModal.value = true;
    };

    const authState = authService.state;
    const skillStore = useSkillStore();

    const serverStatus = reactive({
      show: false, type: "info", message: "", canRetry: false,
    });

    let unsubscribeServerStatus = null;
    let autoHideTimeout = null;

    const normalizeImageForVideo = (image) => {
      const raw = String(image || "");
      const match = raw.match(/^data:image\/[^;]+;base64,(.+)$/i);
      return match ? match[1] : raw;
    };

    const goAnimateToVideo = (b64) => {
      videoImageBase64.value = normalizeImageForVideo(b64);
      modelMode.value = "video";
    };

    const goToCompanionChat = () => {
      skillStore.requestSkillNavigation("roleplay-companion-v1.0.0");
      skillStore.clearMissedMessages();
      skillStore.updateActivity();
      modelMode.value = "agent";
    };

    const showBrowseModels = () => {
      modelPicker.show();
    };

    const openBrowseModels = () => {
      showBrowseModels();
      window.dispatchEvent(new CustomEvent("bonzai:open-browse-models"));
    };

    provide("goAnimateToVideo", goAnimateToVideo);

    const handleServerRestart = async () => {
      serverStatus.show = true;
      serverStatus.type = "restarting";
      serverStatus.message = "Manually restarting server...";
      serverStatus.canRetry = false;
      try {
        const result = await window.electronAPI.restartServer();
        if (result.success) {
          serverStatus.type = "ready";
          serverStatus.message = "Server restarted successfully!";
          if (autoHideTimeout) clearTimeout(autoHideTimeout);
          autoHideTimeout = setTimeout(() => { serverStatus.show = false; }, 3000);
        } else {
          serverStatus.type = "error";
          serverStatus.message = result.error || "Failed to restart server";
          serverStatus.canRetry = true;
        }
      } catch (e) {
        serverStatus.type = "error";
        serverStatus.message = e.message || "Failed to restart server";
        serverStatus.canRetry = true;
      }
    };

const {
      isConnected, isConnecting, walletAddress, truncatedAddress,
      isUniversalProfile, universalProfileData,
      totalBalance, levels,
      connect: doConnect, connectWithPrivy: doConnectWithPrivy,
      disconnect: doDisconnect, cancelConnection: doCancelConnection,
      refresh: doRefresh, authProvider,
    } = useBonzaiWeb3();

    const isRefreshing = ref(false);
    const showRewardsModal = ref(false);
    const showNetworkModal = ref(false);
    const showAuthModal = ref(false);
    const isReauthing = ref(false);
    const isRefreshingToken = ref(false);
    const showPrivyLogin = ref(false);
    const privyError = ref("");
    const generationToast = reactive({ show: false, title: "", desc: "" });
    let generationToastTimer = null;

    const currentModelName = computed(() => modelStore.state.current?.modelname || null);
    const companyModelSummary = computed(() => {
      if (modelMode.value !== "company") return null;
      const charter = companyStore.activeCompany?.value;
      if (!charter) return null;
      return "Company Settings";
    });
    const sidebarModelName = computed(() => companyModelSummary.value || currentModelName.value || null);
    const alwaysLoaded = computed(() => modelStore.state.alwaysLoaded);

    const currentTheme = computed(() => themeService.active());
    const themes = themeService.list();

    const cycleTheme = (dir) => {
      const idx = themes.findIndex((t) => t.id === themeService.state.current);
      const next = themes[(idx + dir + themes.length) % themes.length];
      themeService.set(next.id);
    };

    const upDisplayName = computed(() => {
      if (!isUniversalProfile.value || !universalProfileData.value) return null;
      return universalProfileData.value.name || null;
    });
    const upAvatarUrl = computed(() => {
      if (!isUniversalProfile.value || !universalProfileData.value) return null;
      const images = universalProfileData.value.profileImage;
      if (!images || !images.length) return null;
      const url = images[0].url;
      if (!url) return null;
      if (url.startsWith("ipfs://")) return url.replace("ipfs://", "https://api.universalprofile.cloud/ipfs/");
      return url;
    });

    const formatBalance = (val) => {
      const n = Number(val || 0);
      if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
      if (n >= 1000) return (n / 1000).toFixed(1) + "K";
      return n.toFixed(0);
    };

    const isLevelUnlockedOrHolding = (lvl) => {
      if (levelService.state.allLevelsUnlocked) return true;
      const cfg = CONFIG.levels[`LVL${lvl}`];
      const required = cfg?.holdingRequired || 0;
      const levelKey = `LVL${lvl}`;
      if (levels.value[levelKey]?.active) return true;
      if (levels.value[levelKey]?.ethUnlocked) return true;
      return totalBalance.value >= required;
    };

    const displayedHighestLevelKey = computed(() => {
      for (let i = 6; i >= 1; i--) {
        if (isLevelUnlockedOrHolding(i)) return `LVL${i}`;
      }
      return "";
    });

    const vaultStatus = computed(() => authVault.getVaultStatus());
    const isAuthenticated = computed(() => authState.isAuthenticated && authState.accessToken);
    const tokenExpiresIn = computed(() => {
      if (!authState.tokenExpiry) return 0;
      return Math.max(0, Math.round((authState.tokenExpiry - Date.now()) / 1000));
    });
    const tokenExpiringSoon = computed(() => tokenExpiresIn.value > 0 && tokenExpiresIn.value < 300);
    const needsReauth = computed(() => !isAuthenticated.value || tokenExpiresIn.value <= 0);
    const pendingOps = computed(() => vaultStatus.value.pendingOperations);
    const authStatusClass = computed(() => {
      if (authProvider.value === 'privy') return "is-success";
      if (needsReauth.value) return "is-danger";
      if (tokenExpiringSoon.value) return "is-warning";
      return "is-success";
    });
    const authStatusText = computed(() => {
      if (authProvider.value === 'privy') return "Privy";
      if (needsReauth.value) return "Expired";
      if (tokenExpiringSoon.value) return "Expiring";
      return "Active";
    });
    const formatExpiry = (seconds) => {
      if (seconds <= 0) return "Expired";
      if (seconds < 60) return `${seconds}s`;
      if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
      return `${Math.round(seconds / 3600)}h`;
    };

    const handleReauth = async () => {
      isReauthing.value = true;
      try {
        if (!isConnected.value) { await doConnect(); if (!isConnected.value) return; }
        await userInitiatedReAuth();
        showAuthModal.value = false;
      } catch (e) {
        console.error("[App] Re-auth failed:", e);
      } finally {
        isReauthing.value = false;
      }
    };
    const handleRefreshToken = async () => {
      isRefreshingToken.value = true;
      try { await refreshToken(); }
      catch (e) { console.error("[App] Token refresh failed:", e); }
      finally { isRefreshingToken.value = false; }
    };

    const connect = async () => { await doConnect(); };
    const disconnect = async () => { await doDisconnect(); };
    const cancelConnection = async () => { await doCancelConnection(); };

    const openPrivyWallet = async () => {
      showPrivyLogin.value = false;
      const result = await window.electronAPI?.wallet?.open?.({ email: '' });
      if (!result?.ok) { privyError.value = 'Failed to open wallet window'; return; }
      doConnectWithPrivy({});
    };
    const closePrivyLogin = () => {
      showPrivyLogin.value = false;
      privyError.value = "";
    };

    const refresh = async () => {
      isRefreshing.value = true;
      await doRefresh();
      await checkAllLevels();
      setTimeout(() => (isRefreshing.value = false), 500);
    };

    const copyAddress = () => {
      if (!walletAddress.value) return;
      navigator.clipboard.writeText(walletAddress.value);
    };

    const handleNeedsReauth = () => { showAuthModal.value = true; };

    onMounted(() => {
      themeService.init();
      requestAnimationFrame(() => {
        updateSidebarScrollState();
        if (sidebarNav.value && typeof ResizeObserver !== "undefined") {
          sidebarResizeObserver = new ResizeObserver(updateSidebarScrollState);
          sidebarResizeObserver.observe(sidebarNav.value);
        }
      });
      initializeStore();
      companyStore.init().catch((e) => console.warn("Failed to boot companies:", e?.message || e));
      meshStore.init().catch((e) => console.warn("Failed to join inference mesh:", e?.message || e));
      generationStore.ensureGenerationSocket();

      const loadSystemInfo = async () => {
        try { systemValues.value = await window.electronAPI.systemInformation(); }
        catch (e) { console.warn("Failed to load system info:", e.message); }
      };
      loadSystemInfo();
      sysInfoInterval = setInterval(loadSystemInfo, 30000);

      modelStore.initialize().then(() => modelStore.startListening());

      window.electronAPI.getAppVersion()
        .then((version) => { document.title = `BonzAI v${version}`; })
        .catch(() => { document.title = "BonzAI"; });

      initOpenClawHandler();
      window.addEventListener("bonzai:open-browse-models", showBrowseModels);
      window.addEventListener("bonzai:set-mode", onSetModeEvent);
      window.addEventListener("navigate-to-tab", onNavigateToTab);
      window.addEventListener("bonzai:open-specs", openSpecsModal);
      window.addEventListener("bonzai:open-network", () => { showNetworkModal.value = true; });
      window.addEventListener("bonzai:open-rewards", () => { showRewardsModal.value = true; });
      window.addEventListener("bonzai:open-connect", () => { showPrivyLogin.value = true; });
      window.addEventListener("auth:needs-reauth", handleNeedsReauth);
      window.addEventListener("auth:expired", handleNeedsReauth);

      if (isConnected.value) checkAllLevels();
      refreshP2PStatus();
      p2pStatusInterval = setInterval(refreshP2PStatus, 30000);

      if (window.electronAPI?.onPrivyOAuthCallback) {
        window.electronAPI.onPrivyOAuthCallback(async (_event, url) => {
          try {
            const parsed = new URL(url);
            const code = parsed.searchParams.get("code");
            const state = parsed.searchParams.get("state");
            const provider = parsed.searchParams.get("provider") || "google";
            if (code && state) {
              const result = await doConnectWithPrivy({ method: "oauth_callback", authorizationCode: code, returnedStateCode: state, provider });
              if (result.success) showPrivyLogin.value = false;
              else privyError.value = result.error || "OAuth sign-in failed";
            }
          } catch (e) { privyError.value = e.message || "OAuth callback failed"; }
        });
      }

      unsubscribeServerStatus = window.electronAPI.onServerStatus((data) => {
        if (autoHideTimeout) { clearTimeout(autoHideTimeout); autoHideTimeout = null; }
        serverStatus.show = true;
        serverStatus.type = data.status;
        serverStatus.message = data.message || "";
        serverStatus.canRetry = data.canRetry || false;
        if (data.status === "ready") {
          autoHideTimeout = setTimeout(() => { serverStatus.show = false; }, 3000);
        }
      });
    });

    onUnmounted(() => {
      sidebarResizeObserver?.disconnect();
      if (unsubscribeServerStatus) unsubscribeServerStatus();
      if (autoHideTimeout) clearTimeout(autoHideTimeout);
      if (sysInfoInterval) clearInterval(sysInfoInterval);
      if (p2pStatusInterval) clearInterval(p2pStatusInterval);
      if (generationToastTimer) clearTimeout(generationToastTimer);
      meshStore.teardown();
      modelStore.stopListening();
      window.removeEventListener("bonzai:open-browse-models", showBrowseModels);
      window.removeEventListener("bonzai:set-mode", onSetModeEvent);
      window.removeEventListener("navigate-to-tab", onNavigateToTab);
      window.removeEventListener("bonzai:open-specs", openSpecsModal);
      window.removeEventListener("auth:needs-reauth", handleNeedsReauth);
      window.removeEventListener("auth:expired", handleNeedsReauth);
    });

    watch([isConnected, walletAddress], async ([connected, addr]) => {
      if (connected && addr) await checkAllLevels();
      requestAnimationFrame(updateSidebarScrollState);
    });

    watch(() => i18n.state.locale, () => requestAnimationFrame(updateSidebarScrollState));

    const generationLabels = computed(() => ({ image: i18n.t('generation.imageComplete'), video: i18n.t('generation.videoComplete'), audio: i18n.t('generation.audioComplete'), text: i18n.t('generation.textComplete'), "3d": i18n.t('generation.threeComplete') }));
    const generationSnapshot = () => ["image", "video", "audio", "text", "3d"].map((key) => ({
      key,
      active: generationStore.state[key]?.active === true,
      stage: generationStore.state[key]?.stage || "idle",
    }));
    watch(
      generationSnapshot,
      (next, prev) => {
        if (!prev) return;
        for (const current of next) {
          const previous = prev.find((item) => item.key === current.key);
          if (previous?.active && !current.active && current.stage === "finished") {
            generationToast.title = generationLabels.value[current.key];
            generationToast.desc = i18n.t('generation.resultReady');
            generationToast.show = true;
            if (generationToastTimer) clearTimeout(generationToastTimer);
            generationToastTimer = setTimeout(() => { generationToast.show = false; }, 6000);
            break;
          }
        }
      },
    );

    return {
      i18n, modelMode, jobsEnabled, createItems, earnItems, automateItems, trainItems,
      sidebarNav, sidebarCanScroll, sidebarAtBottom, updateSidebarScrollState, scrollSidebarForward,
      handleEarnAction,
      systemValues, videoImageBase64, goAnimateToVideo, goToCompanionChat,
      serverStatus, notifClass, serverStatusIcon, serverStatusDescription, handleServerRestart,
      authState, skillStore, showSpecsModal, specsData, openSpecsModal,
      showRewardsModal, showNetworkModal, showAuthModal, showPrivyLogin,
      isConnected, isConnecting, walletAddress, truncatedAddress,
      totalBalance, formatBalance, displayedHighestLevelKey,
      upDisplayName, upAvatarUrl, isRefreshing,
      currentModelName, sidebarModelName, alwaysLoaded, openBrowseModels,
      currentTheme, cycleTheme,
      p2pMode, p2pStatus, p2pModeIcon, p2pModeLabel,
      isReauthing, isRefreshingToken, needsReauth, tokenExpiringSoon,
      tokenExpiresIn, pendingOps, vaultStatus, authStatusClass, authStatusText,
      formatExpiry, handleReauth, handleRefreshToken,
      connect, disconnect, cancelConnection,
      openPrivyWallet, closePrivyLogin, privyError, refresh, copyAddress,
      generationToast,
    };
  },
};
</script>

<style>
@import "./assets/fonts/fonts.css";
@import "./assets/tokens.css";
@import "./assets/themes.css";
@import "./assets/buttons.css";
@import "./assets/notices.css";

html, body {
  -webkit-app-region: no-drag;
  -webkit-user-select: none;
  box-sizing: border-box !important;
  overflow: hidden;
  height: 100%;
  margin: 0;
}

#app {
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  font-family: "Fira Sans", sans-serif;
  font-style: normal;
  font-weight: 400;
  margin: 0 !important;
  padding: 0 !important;
  position: relative;
  text-align: left;
  min-height: 100%;
}

.material-symbols-outlined {
  border-radius: 100%;
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
}

.fira-sans-condensed-black-italic {
  font-family: 'Fira Sans Condensed', sans-serif;
  font-weight: 900;
  font-style: italic;
}

/* ─── TOP NOTIFICATION BANNERS ──────────────────────────────────── */
.bz-notif {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bz-space-3) var(--bz-space-5);
  font-size: var(--bz-size-body);
  line-height: 1.4;
  border-bottom: 1px solid var(--bz-border);
  animation: bz-rise 320ms var(--bz-ease-out) both;
}
.bz-notif--info    { background: var(--bz-info-soft);    color: var(--bz-info); }
.bz-notif--success { background: var(--bz-emerald-soft); color: var(--bz-emerald-500); }
.bz-notif--warning { background: var(--bz-warning-soft); color: var(--bz-warning); }
.bz-notif--danger  { background: var(--bz-danger-soft);  color: var(--bz-danger); }

.bz-notif__body { display: flex; flex-direction: column; gap: 2px; }
.bz-notif__title { font-weight: 600; color: var(--bz-fg); }
.bz-notif__desc { font-size: var(--bz-size-meta); color: var(--bz-fg-low); }
.bz-notif--info .bz-notif__title, .bz-notif--success .bz-notif__title,
.bz-notif--warning .bz-notif__title, .bz-notif--danger .bz-notif__title { color: inherit; }
.bz-notif--server {
  padding: var(--bz-space-4) var(--bz-space-5);
  background:
    linear-gradient(90deg, var(--bz-purple-soft), transparent),
    var(--bz-panel);
  border-bottom: 1px solid var(--bz-border-brand);
  box-shadow: var(--bz-elev-2);
}
.bz-notif__server-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  margin-right: var(--bz-space-3);
  color: var(--bz-purple-300);
  border: 1px solid var(--bz-border-brand);
  background: var(--bz-card);
}
.bz-notif__rail {
  position: relative;
  display: block;
  width: min(360px, 50vw);
  height: 3px;
  margin-top: var(--bz-space-2);
  overflow: hidden;
  background: var(--bz-border);
}
.bz-notif__rail::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 42%;
  background: var(--bz-gradient-brand);
  animation: bz-server-rail 1300ms var(--bz-ease-in-out) infinite;
}
@keyframes bz-server-rail {
  0% { transform: translateX(-110%); }
  100% { transform: translateX(260%); }
}

.notif-enter-active { animation: bz-rise 320ms var(--bz-ease-out) both; }
.notif-leave-active { animation: bz-fade-in 220ms var(--bz-ease-in) both reverse; }

/* ─── APP SHELL ─────────────────────────────────────────────────── */
#bonzai {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
  background: var(--bz-canvas);
}

.bz-main {
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bz-canvas);
}

.bz-tab-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ─── SIDEBAR ───────────────────────────────────────────────────── */
.bz-sidebar {
  display: flex;
  flex-direction: column;
  background: var(--bz-panel);
  border-right: 1px solid var(--bz-border);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.bz-sidebar__brand {
  padding: var(--bz-space-5) var(--bz-space-5) var(--bz-space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--bz-space-2);
  flex: 0 0 auto;
}

.bz-sidebar__wordmark {
  font-family: 'Fira Sans Condensed', sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 18px;
  color: var(--bz-purple-300);
  letter-spacing: -0.01em;
}

/* Auth links — text-only, small, below the wordmark. */
.bz-sidebar__auth {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.bz-sidebar__auth-link {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: color var(--bz-dur-fast);
}
.bz-sidebar__auth-link:hover {
  color: var(--bz-purple-300);
}
.bz-sidebar__auth-sep {
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
}

.bz-sidebar__nav-shell {
  flex: 1;
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.bz-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-4);
  height: 100%;
  padding: var(--bz-space-3) var(--bz-space-3) var(--bz-space-2);
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--bz-border) transparent;
}

.bz-sidebar__nav::-webkit-scrollbar { width: 4px; }
.bz-sidebar__nav::-webkit-scrollbar-track { background: transparent; }
.bz-sidebar__nav::-webkit-scrollbar-thumb { background: var(--bz-border); border-radius: 4px; }

.bz-sidebar__nav-shell.has-more::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 44px;
  pointer-events: none;
  background: linear-gradient(transparent, var(--bz-panel));
}

.bz-sidebar__scroll-hint {
  position: absolute;
  z-index: 2;
  right: 10px;
  bottom: 12px;
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--bz-purple-300);
  cursor: pointer;
  opacity: 1;
  visibility: visible;
  transition: opacity var(--bz-dur-fast), visibility var(--bz-dur-fast), border-color var(--bz-dur-fast), color var(--bz-dur-fast);
}

.bz-sidebar__scroll-hint.is-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.bz-sidebar__scroll-hint:hover {
  color: var(--bz-fg);
}

.bz-sidebar__scroll-hint .material-symbols-outlined {
  font-size: 17px !important;
  animation: bz-scroll-hint-bounce 1.4s ease-in-out infinite;
}

@keyframes bz-scroll-hint-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(3px); }
}

@media (prefers-reduced-motion: reduce) {
  .bz-sidebar__scroll-hint .material-symbols-outlined { animation: none; }
}

.bz-sidebar__group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.bz-sidebar__group--settings {
  margin-top: auto;
}

.bz-sidebar__language {
  margin-bottom: var(--bz-space-1);
}

.bz-sidebar__label {
  font-size: var(--bz-size-micro);
  font-weight: 500;
  color: var(--bz-fg-low);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: var(--bz-space-1) var(--bz-space-3) var(--bz-space-2);
}

.bz-sidebar__item {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  width: 100%;
  padding: var(--bz-space-2) var(--bz-space-3);
  border: none;
  border-radius: var(--bz-r-sm);
  background: transparent;
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-body);
  cursor: pointer;
  transition: background var(--bz-dur-fast) var(--bz-ease-out), color var(--bz-dur-fast) var(--bz-ease-out);
  text-align: left;
}

.bz-sidebar__item:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}

.bz-sidebar__item.is-active {
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
  font-weight: 500;
}

.bz-sidebar__item-icon {
  font-size: 18px !important;
  flex-shrink: 0;
}

.bz-sidebar__item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ─── SIDEBAR FOOTER ────────────────────────────────────────────── */
.bz-sidebar__footer {
  padding: var(--bz-space-2) var(--bz-space-3) var(--bz-space-3);
  border-top: 1px solid var(--bz-border);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  flex: 0 0 auto;
}

@media (max-height: 900px) and (min-width: 1025px) {
  .bz-sidebar__brand {
    padding: var(--bz-space-3) var(--bz-space-4) var(--bz-space-2);
    gap: var(--bz-space-1);
  }

  .bz-sidebar__wallet--top {
    margin-top: var(--bz-space-1);
  }

  .bz-sidebar__nav {
    gap: 2px;
    padding: var(--bz-space-1) var(--bz-space-2);
  }

  .bz-sidebar__group:not(.bz-sidebar__group--settings) {
    display: flex;
    gap: 0;
  }

  .bz-sidebar__label {
    padding: 1px var(--bz-space-2) 2px;
    font-size: 10px;
  }

  .bz-sidebar__item {
    min-height: 24px;
    gap: 6px;
    padding: 2px var(--bz-space-2);
    font-size: var(--bz-size-meta);
    line-height: 1.15;
  }

  .bz-sidebar__item-icon {
    font-size: 15px !important;
  }

  .bz-sidebar__group--settings {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 0;
  }

  .bz-sidebar__group--settings > .bz-sidebar__label {
    grid-column: 1 / -1;
  }

  .bz-sidebar__language {
    margin-bottom: 0;
  }

  .bz-sidebar__footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--bz-space-1);
    padding: var(--bz-space-1) var(--bz-space-2) var(--bz-space-2);
  }

  .bz-sidebar__specs {
    grid-column: 1 / -1;
  }
}

@media (max-height: 680px) and (min-width: 1025px) {
  .bz-sidebar__brand {
    padding: var(--bz-space-2) var(--bz-space-3);
  }
  .bz-sidebar__nav {
    gap: 0;
  }
  .bz-sidebar__label {
    padding-block: 0 1px;
    font-size: 9px;
  }
  .bz-sidebar__item {
    min-height: 22px;
    padding-block: 1px;
    font-size: var(--bz-size-micro);
  }
}

.bz-sidebar__footer-action {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  width: 100%;
  min-height: 36px;
  padding: var(--bz-space-2) var(--bz-space-3);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  font-family: var(--bz-font-body);
  cursor: pointer;
  transition: border-color var(--bz-dur-fast), color var(--bz-dur-fast);
  justify-content: flex-start;
  text-align: left;
}

.bz-sidebar__footer-action:hover {
  border-color: var(--bz-purple-300);
  color: var(--bz-fg);
}

.bz-sidebar__footer-action .material-symbols-outlined {
  font-size: 14px !important;
  color: var(--bz-purple-300);
}

.bz-sidebar__theme {
  flex: 0;
  padding: var(--bz-space-2) !important;
}

/* ─── SERVE MODE INDICATOR ──────────────────────────────────────── */
.bz-sidebar__serve {
  border-style: solid;
}

.bz-sidebar__serve-label {
  font-weight: 500;
}

/* ─── THEME PICKER ──────────────────────────────────────────────── */
.bz-sidebar__theme-picker {
  display: flex;
  align-items: center;
  gap: 0;
  padding: var(--bz-space-1) var(--bz-space-2);
}

.bz-sidebar__theme-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-mid);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color var(--bz-dur-fast), color var(--bz-dur-fast);
}

.bz-sidebar__theme-arrow:hover {
  border-color: var(--bz-purple-300);
  color: var(--bz-fg);
}

.bz-sidebar__theme-arrow .material-symbols-outlined {
  font-size: 14px !important;
}

.bz-sidebar__theme-display {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.bz-sidebar__theme-swatch {
  display: flex;
  gap: 3px;
}

.bz-sidebar__theme-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px var(--bz-fg-low);
}

.bz-sidebar__theme-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--bz-fg);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ─── SIDEBAR MODEL INDICATOR ───────────────────────────────────── */
.bz-sidebar__model {
  border-style: solid;
}

.bz-sidebar__model-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: inherit;
  font-family: var(--bz-font-body);
  font-weight: 500;
  font-size: var(--bz-size-meta);
}

.bz-sidebar__model-lock {
  font-size: 12px !important;
  color: var(--bz-emerald-500);
  flex-shrink: 0;
}

/* ─── SIDEBAR WALLET ────────────────────────────────────────────── */
.bz-sidebar__wallet {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-1);
}

.bz-sidebar__wallet--top {
  width: 100%;
  margin-top: var(--bz-space-2);
}

.bz-sidebar__wallet-btn {
  display: flex;
  align-items: center;
  gap: var(--bz-space-1);
  padding: var(--bz-space-1) var(--bz-space-2);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  color: var(--bz-fg-low);
  font-size: var(--bz-size-meta);
  font-family: var(--bz-font-body);
  cursor: pointer;
  transition: border-color var(--bz-dur-fast), color var(--bz-dur-fast);
}

.bz-sidebar__wallet-btn:hover { border-color: var(--bz-purple-300); color: var(--bz-fg); }
.bz-sidebar__wallet-btn .material-symbols-outlined { font-size: 14px !important; }

.bz-sidebar__wallet-btn--primary {
  background: var(--bz-purple-soft);
  border-color: var(--bz-purple-300);
  color: var(--bz-purple-300);
}

.bz-sidebar__wallet-info {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-1) var(--bz-space-2);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  cursor: pointer;
  transition: border-color var(--bz-dur-fast);
  font-size: var(--bz-size-meta);
}

.bz-sidebar__wallet-info:hover { border-color: var(--bz-purple-300); }

.bz-sidebar__up-avatar { width: 16px; height: 16px; border-radius: 50%; overflow: hidden; flex-shrink: 0; }
.bz-sidebar__up-avatar img { width: 100%; height: 100%; object-fit: cover; }

.bz-sidebar__wallet-addr {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--bz-fg);
}

.bz-sidebar__level {
  font-family: 'Fira Sans Condensed', sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 11px;
  color: var(--bz-purple-300);
  flex-shrink: 0;
}

.bz-sidebar__balance {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 0 var(--bz-space-2);
  font-family: 'Fira Sans Condensed', sans-serif;
  font-weight: 900;
  font-style: italic;
}

.bz-sidebar__balance-amt { font-size: 14px; color: var(--bz-fg); }
.bz-sidebar__balance-token { font-size: 10px; color: var(--bz-fg-low); }

.bz-sidebar__wallet-actions {
  display: flex;
  gap: var(--bz-space-1);
}

.bz-sidebar__wallet-actions .bz-sidebar__wallet-btn { flex: 1; justify-content: center; }

.spinning { animation: bz-spin 1s linear infinite; }

/* ─── MODAL ─────────────────────────────────────────────────────── */
.bz-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bz-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--bz-z-modal);
}

.bz-modal {
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  width: 560px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bz-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--bz-space-5) var(--bz-space-5) var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
}

.bz-modal__body {
  padding: var(--bz-space-4) var(--bz-space-5) var(--bz-space-5);
  overflow-y: auto;
}

.modal-enter-active { animation: bz-modal-in var(--bz-dur-base) var(--bz-ease-out) both; }
.modal-leave-active { animation: bz-fade-in var(--bz-dur-fast) var(--bz-ease-in) both reverse; }

/* ─── SPECS GRID ────────────────────────────────────────────────── */
.bz-specs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
}

.bz-specs-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bz-space-2) var(--bz-space-3);
  background: var(--bz-panel);
  border-radius: var(--bz-r-sm);
}

.bz-specs-item--highlight { background: var(--bz-emerald-soft); }
.bz-specs-item__label { font-size: var(--bz-size-meta); color: var(--bz-fg-low); }
.bz-specs-item__value { font-size: var(--bz-size-data); color: var(--bz-fg); }
.bz-specs-section { margin-top: var(--bz-space-5); }
.bz-specs-section .bz-h3 { margin: 0 0 var(--bz-space-3); }

/* ─── NETWORK MODAL ─────────────────────────────────────────────── */
.network-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bz-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.network-modal {
  width: min(1180px, calc(100vw - 32px));
  max-height: min(920px, 92vh);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.network-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  padding: var(--bz-space-5);
  background: var(--bz-panel);
  border-bottom: 1px solid var(--bz-border);
}

.network-titleblock {
  display: grid;
  gap: var(--bz-space-1);
}

.network-titleblock .bz-eyebrow,
.network-titleblock h2 {
  margin: 0;
}

.network-titleblock h2 {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg);
}

.network-titleblock .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 24px !important;
}

.network-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--bz-space-5);
}

.network-modal-body :deep(.network-settings) {
  height: auto;
  max-height: none;
  padding: 0;
}

.network-modal-body :deep(.panel) {
  max-width: none;
}

/* ─── AUTH MODAL ────────────────────────────────────────────────── */
.auth-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bz-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
}

.auth-modal {
  width: 90%;
  max-width: 400px;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  overflow: hidden;
}

.auth-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--bz-space-4) var(--bz-space-5);
  border-bottom: 1px solid var(--bz-border);
}

.auth-modal-body { padding: 20px; }

.auth-status-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.auth-status-banner.is-success { background: var(--bz-emerald-soft); border: 1px solid var(--bz-emerald-soft); }
.auth-status-banner.is-warning { background: rgba(255, 224, 138, 0.15); border: 1px solid var(--bz-warning-soft); }
.auth-status-banner.is-danger { background: var(--bz-danger-soft); border: 1px solid var(--bz-danger-soft); }

.status-dot-large {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.status-dot-large.is-success { background: var(--bz-emerald-500); box-shadow: 0 0 12px var(--bz-emerald-500); }
.status-dot-large.is-warning { background: var(--bz-warning); box-shadow: 0 0 12px var(--bz-warning); }
.status-dot-large.is-danger { background: var(--bz-danger); box-shadow: 0 0 12px var(--bz-danger); }

.status-label { font-size: 18px; color: var(--bz-fg); }

.auth-details { margin-bottom: 20px; }
.auth-details .detail-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.auth-details .detail-row:last-child { border-bottom: none; }
.auth-details .label { color: rgba(255, 255, 255, 0.6); font-size: 13px; }
.auth-details .value { color: var(--bz-fg); font-size: 13px; font-weight: 600; }
.auth-details .value.monospace { font-family: "JetBrains Mono", monospace; }
.auth-details .value--danger { color: var(--bz-danger); }
.auth-details .value--warning { color: var(--bz-warning); }
.auth-details .value--success { color: var(--bz-emerald-500); }
.auth-actions { padding-top: 10px; }
.auth-action-btn {
  width: 100%;
  justify-content: center;
  margin-top: 10px;
}
.auth-ok {
  margin: 0;
  color: var(--bz-muted);
  font-size: 13px;
  text-align: center;
}

/* ─── PRIVY MODAL ───────────────────────────────────────────────── */
.privy-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bz-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.privy-modal {
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  max-width: 400px;
  width: 90vw;
  overflow: hidden;
}

.privy-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--bz-space-4) var(--bz-space-5);
  border-bottom: 1px solid var(--bz-border);
}

.privy-modal-body { padding: 24px; }

.privy-subtitle {
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
  margin-bottom: 24px;
}

.privy-error-card {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
  background: var(--bz-danger-soft);
  border: 1px solid var(--bz-danger);
  border-radius: var(--bz-r-sm);
  color: var(--bz-danger);
  font-size: var(--bz-size-meta);
}

/* ─── BZ MODAL TITLEBLOCK ───────────────────────────────────────── */
.bz-modal-titleblock { display: grid; gap: var(--bz-space-2); }
.bz-modal-titleblock h1,
.bz-modal-titleblock h2 { margin: 0; color: var(--bz-fg); }
.bz-modal-titleblock .bz-eyebrow { margin: 0; }

/* ─── TRANSITIONS ───────────────────────────────────────────────── */
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

/* Height-constrained overrides live after the base control rules. */
@media (max-height: 900px) and (min-width: 1025px) {
  .bz-sidebar__theme-picker {
    padding: 2px 3px;
  }

  .bz-sidebar__theme-arrow {
    width: 21px;
    height: 21px;
  }

  .bz-sidebar__theme-name {
    max-width: 54px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bz-sidebar__footer-action {
    min-height: 31px;
    padding: 4px var(--bz-space-2);
  }
}

/* ─── COMPACT VIEWPORT ──────────────────────────────────────────── */
@media (max-width: 1024px) {
  #bonzai { grid-template-columns: 72px minmax(0, 1fr); }
  .bz-sidebar__wordmark { display: none; }
  .bz-sidebar__brand { padding: var(--bz-space-2); justify-content: center; }
  .bz-sidebar__label { display: none; }
  .bz-sidebar__item { justify-content: center; min-height: 25px; padding: 3px; }
  .bz-sidebar__item-label { display: none; }
  .bz-sidebar__footer { display: none; }
  .bz-sidebar__nav { align-items: stretch; gap: 1px; padding: var(--bz-space-1); }
  .bz-sidebar__group { gap: 0; }
  .bz-sidebar__group--settings { margin-top: 0; }
  .bz-sidebar__theme-picker { width: 100%; padding: 1px; }
  .bz-sidebar__theme-arrow { width: 18px; height: 18px; }
  .bz-sidebar__theme-display { min-width: 24px; }
  .bz-sidebar__theme-name { display: none; }
  .bz-sidebar__language { margin: 0; }
}

/* ─── SUPPRESS SCROLLBARS ───────────────────────────────────────── */
.models__deployment-install { scrollbar-width: none; }
.models__deployment-install::-webkit-scrollbar { display: none; }
</style>
