<template>
  <!-- Awaiting Signature Notification -->
  <div
    v-if="authState.isAwaitingSignature"
    class="server-notification notification is-warning"
  >
    <p class="mb-2">
      <span class="fira-sans-condensed-black-italic is-size-4">
        <button
          disabled
          class="button is-loading is-warning is-small mr-2 p-4"
        ></button>
        Awaiting signature...
      </span>
    </p>
    <p class="is-size-6" style="opacity: 0.8">
      Please sign the message in your wallet to authenticate.
    </p>
    <progress class="progress is-small is-warning" max="100"></progress>
  </div>

  <!-- Autonomous Companion Away Notification -->
  <div
    v-else-if="skillStore.autonomousMode && skillStore.isIdle"
    class="server-notification notification is-info companion-notification"
    @click="goToCompanionChat"
    style="cursor: pointer"
  >
    <button class="delete" @click.stop="skillStore.updateActivity()"></button>
    <p class="mb-2">
      <span class="fira-sans-condensed-black-italic is-size-4">
        <span
          class="material-symbols-outlined mr-2"
          style="vertical-align: middle"
        >
          self_improvement
        </span>
        Companion active
      </span>
      <span class="is-pulled-right">
        <span
          class="material-symbols-outlined"
          style="vertical-align: middle; opacity: 0.7"
        >
          arrow_forward
        </span>
      </span>
    </p>
    <p class="is-size-6" style="opacity: 0.8">
      {{ skillStore.autonomousSession?.companion?.name || "Your companion" }} is
      continuing their day while you're away.
      <span v-if="skillStore.missedMessages > 0" class="has-text-weight-bold">
        ({{ skillStore.missedMessages }} new message{{
          skillStore.missedMessages > 1 ? "s" : ""
        }})
      </span>
    </p>
    <progress
      v-if="skillStore.isGeneratingAutonomous"
      class="progress is-small is-info"
      max="100"
    ></progress>
  </div>

  <!-- Server Status Notification (using standard notification pattern) -->
  <div
    v-else-if="serverStatus.show"
    class="server-notification notification"
    :class="{
      'is-info':
        serverStatus.type === 'restarting' || serverStatus.type === 'starting',
      'is-success': serverStatus.type === 'ready',
      'is-danger':
        serverStatus.type === 'crashed' || serverStatus.type === 'error',
      'is-warning': serverStatus.type === 'stopped',
    }"
  >
    <button class="delete" @click="serverStatus.show = false"></button>
    <p class="mb-2">
      <span class="fira-sans-condensed-black-italic is-size-4">
        <button
          v-if="
            serverStatus.type === 'restarting' ||
            serverStatus.type === 'starting'
          "
          disabled
          class="button is-loading is-info is-small mr-2 p-4"
        ></button>
        <span
          v-else
          class="material-symbols-outlined mr-2"
          style="vertical-align: middle"
        >
          {{
            serverStatus.type === "ready"
              ? "check_circle"
              : serverStatus.type === "crashed" || serverStatus.type === "error"
                ? "error"
                : "info"
          }}
        </span>
        {{ serverStatus.message }}
      </span>
      <span v-if="serverStatus.canRetry" class="is-pulled-right">
        <button class="button is-small is-warning" @click="handleServerRestart">
          <span class="material-symbols-outlined mr-1" style="font-size: 16px">
            refresh
          </span>
          Retry
        </button>
      </span>
    </p>
    <progress
      v-if="
        serverStatus.type === 'restarting' || serverStatus.type === 'starting'
      "
      class="progress is-small"
      :class="{
        'is-info': serverStatus.type === 'starting',
        'is-warning': serverStatus.type === 'restarting',
      }"
      max="100"
    ></progress>
  </div>

  <!-- APP SHELL — compact 240px left-rail nav + main work area.
       Each row keeps its branded image with a shade overlay so labels
       stay legible. Active state shows a brand-purple bar on the
       left edge and a tinted shade. Collapses to icon-only at
       narrow viewports. -->
  <div id="bonzai">
    <nav class="bz-nav" aria-label="Primary">
      <header class="bz-nav__brand">
        <div class="bz-nav__logo" aria-hidden="true"></div>
        <button
          v-if="systemValues && systemValues.memBudget"
          class="bz-nav__mem"
          title="Available memory budget for AI inference (click for details)"
          @click="openSpecsModal"
        >
          <span class="material-symbols-outlined" aria-hidden="true">memory</span>
          <span class="bz-mono">
            {{ (systemValues.memBudget / 1024 ** 3).toFixed(0) }}&nbsp;GB
          </span>
        </button>
      </header>

      <ul class="bz-nav__list">
        <li
          v-for="t in navTabs"
          :key="t.id"
          class="bz-nav__item"
          :class="[`bz-nav__item--${t.id}`, { 'is-active': modelMode === t.id }]"
          @click="modelMode = t.id"
          tabindex="0"
          role="button"
          :aria-pressed="modelMode === t.id"
          :aria-label="t.label"
          @keydown.enter.prevent="modelMode = t.id"
          @keydown.space.prevent="modelMode = t.id"
        >
          <span class="bz-nav__shade" aria-hidden="true"></span>
          <span class="bz-nav__icon material-symbols-outlined" aria-hidden="true">
            {{ t.icon }}
          </span>
          <span class="bz-nav__label fira-sans-condensed-black-italic">
            {{ t.label }}
          </span>
          <span class="bz-nav__active-bar" aria-hidden="true"></span>
        </li>
      </ul>
    </nav>

    <main class="bz-main">
      <!-- Each component carries inline access requirements; the main
           column flexes to fill the rest of the viewport. -->
      <GenerativeText v-if="modelMode == 'chat'" key="chat" />
      <GenerativeAudio v-if="modelMode == 'music'" key="music" />
      <GenerativeImage v-if="modelMode == 'image'" key="image" />
      <GenerativeVideo
        v-if="modelMode == 'video'"
        key="video"
        :existingImageBase64="videoImageBase64"
      />
      <Generative3D v-if="modelMode == '3D'" key="3D" />
      <GenerativeTraining v-if="modelMode == 'robot'" key="robot" />
      <SmartAgent v-if="modelMode == 'agent'" key="agent" />
      <Company v-if="modelMode == 'company'" key="company" />
    </main>
  </div>
  <BonzaiBottomBar />

  <!-- Global LLM model picker — callable from anywhere via
       `import modelPicker from "../services/modelPicker.service.js"`
       then `modelPicker.show()`. Lives at App.vue level so it doesn't
       depend on any specific tab being mounted. Uses Teleport inside
       its own template to escape this stacking context. -->
  <LlmModelPickerModal />

  <!-- Global command palette — Cmd-K / Ctrl-K from anywhere.
       Lists tabs + tools; runtime sources can register dynamic
       commands via `commandPalette.register({...})`. -->
  <CommandPalette />

  <!-- Generation inspector — slide-in 360 px right rail. Open via
       `inspector.show(generation)` from any Generative tab when the
       user picks an output. Replaces inline metadata clutter. -->
  <GenerationInspector />

  <!-- Hardware Specifications & Performance Modal -->
  <div
    v-if="showSpecsModal"
    class="specs-modal-overlay"
    @click.self="showSpecsModal = false"
  >
    <div class="specs-modal">
      <div class="has-text-right">
        <BzCloseButton
          size="md"
          aria-label="Close hardware specs"
          @click="showSpecsModal = false"
        />
      </div>

      <div class="specs-modal-header has-text-center">
        <span class="material-symbols-outlined" style="font-size: 48px; color: #3e8ed0">
          memory
        </span>
        <h2 class="fira-sans-condensed-black-italic is-size-3 has-text-centered mt-2 has-text-white">
          Hardware Specifications
        </h2>
      </div>

      <div class="specs-modal-body mt-4 has-text-left">
        <!-- Hardware Info -->
        <div class="specs-section" v-if="specsData.hardware">
          <h3 class="fira-sans-condensed-black-italic is-size-5 mb-3 has-text-white">
            <span class="material-symbols-outlined mr-2" style="vertical-align: middle">computer</span>
            System
          </h3>
          <table class="table is-fullwidth specs-table">
            <tbody>
              <tr>
                <td class="specs-label">CPU</td>
                <td class="specs-value fira-sans-condensed-black-italic">{{ specsData.hardware.cpu }}</td>
              </tr>
              <tr>
                <td class="specs-label">Cores / Threads</td>
                <td class="specs-value fira-sans-condensed-black-italic">{{ specsData.hardware.cpuCores }} / {{ specsData.hardware.cpuThreads }}</td>
              </tr>
              <tr>
                <td class="specs-label">CPU Speed</td>
                <td class="specs-value fira-sans-condensed-black-italic">{{ specsData.hardware.cpuSpeed }} GHz</td>
              </tr>
              <tr>
                <td class="specs-label">GPU</td>
                <td class="specs-value fira-sans-condensed-black-italic">{{ specsData.hardware.gpu }}</td>
              </tr>
              <tr>
                <td class="specs-label">Total RAM</td>
                <td class="specs-value fira-sans-condensed-black-italic">{{ (specsData.hardware.ram / 1024 ** 3).toFixed(0) }} GB</td>
              </tr>
              <tr>
                <td class="specs-label">Inference Budget</td>
                <td class="specs-value fira-sans-condensed-black-italic" style="color: #39d582">{{ (specsData.hardware.memBudget / 1024 ** 3).toFixed(1) }} GB</td>
              </tr>
              <tr v-if="specsData.hardware.vram > 0">
                <td class="specs-label">VRAM</td>
                <td class="specs-value fira-sans-condensed-black-italic">{{ (specsData.hardware.vram / 1024).toFixed(0) }} GB</td>
              </tr>
              <tr>
                <td class="specs-label">OS</td>
                <td class="specs-value fira-sans-condensed-black-italic">{{ specsData.hardware.os }}</td>
              </tr>
              <tr>
                <td class="specs-label">Architecture</td>
                <td class="specs-value fira-sans-condensed-black-italic">{{ specsData.hardware.arch }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Performance Stats -->
        <div class="specs-section mt-5" v-if="specsData.performance">
          <h3 class="fira-sans-condensed-black-italic is-size-5 mb-3 has-text-white">
            <span class="material-symbols-outlined mr-2" style="vertical-align: middle">speed</span>
            Average Performance
          </h3>
          <table class="table is-fullwidth specs-table">
            <thead>
              <tr>
                <th class="specs-label">Content Type</th>
                <th class="specs-label has-text-right">Metric</th>
                <th class="specs-label has-text-right">Samples</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 18px">chat</span>
                  Text
                </td>
                <td class="has-text-right fira-sans-condensed-black-italic">
                  <template v-if="specsData.performance.text.count > 0">
                    {{ specsData.performance.text.avgTokPerSec.toFixed(1) }} tok/s
                  </template>
                  <span v-else class="has-text-grey">--</span>
                </td>
                <td class="has-text-right">{{ specsData.performance.text.count }}</td>
              </tr>
              <tr>
                <td>
                  <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 18px">image</span>
                  Image
                </td>
                <td class="has-text-right fira-sans-condensed-black-italic">
                  <template v-if="specsData.performance.image.count > 0">
                    {{ specsData.performance.image.avgElapsed.toFixed(1) }}s
                  </template>
                  <span v-else class="has-text-grey">--</span>
                </td>
                <td class="has-text-right">{{ specsData.performance.image.count }}</td>
              </tr>
              <tr>
                <td>
                  <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 18px">movie</span>
                  Video
                </td>
                <td class="has-text-right fira-sans-condensed-black-italic">
                  <template v-if="specsData.performance.video.count > 0">
                    {{ specsData.performance.video.avgElapsed.toFixed(1) }}s
                  </template>
                  <span v-else class="has-text-grey">--</span>
                </td>
                <td class="has-text-right">{{ specsData.performance.video.count }}</td>
              </tr>
              <tr>
                <td>
                  <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 18px">record_voice_over</span>
                  Audio — TTS / Voice Cloning
                </td>
                <td class="has-text-right fira-sans-condensed-black-italic">
                  <template v-if="specsData.performance.audioTts.count > 0">
                    {{ specsData.performance.audioTts.avgElapsed.toFixed(1) }}s
                  </template>
                  <span v-else class="has-text-grey">--</span>
                </td>
                <td class="has-text-right">{{ specsData.performance.audioTts.count }}</td>
              </tr>
              <tr>
                <td>
                  <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 18px">music_note</span>
                  Audio — Music
                </td>
                <td class="has-text-right fira-sans-condensed-black-italic">
                  <template v-if="specsData.performance.audioMusic.count > 0">
                    {{ specsData.performance.audioMusic.avgElapsed.toFixed(1) }}s
                  </template>
                  <span v-else class="has-text-grey">--</span>
                </td>
                <td class="has-text-right">{{ specsData.performance.audioMusic.count }}</td>
              </tr>
              <tr>
                <td>
                  <span class="material-symbols-outlined mr-1" style="vertical-align: middle; font-size: 18px">3d_rotation</span>
                  3D
                </td>
                <td class="has-text-right fira-sans-condensed-black-italic">
                  <template v-if="specsData.performance.object.count > 0">
                    {{ specsData.performance.object.avgTokPerSec.toFixed(1) }} tok/s
                  </template>
                  <span v-else class="has-text-grey">--</span>
                </td>
                <td class="has-text-right">{{ specsData.performance.object.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, provide, onMounted, onUnmounted } from "vue";
import GenerativeText from "./components/GenerativeText.vue";
import GenerativeImage from "./components/GenerativeImage.vue";
import GenerativeVideo from "./components/GenerativeVideo.vue";
import GenerativeAudio from "./components/GenerativeAudio.vue";
import Generative3D from "./components/Generative3D.vue";
import GenerativeTraining from "./components/GenerativeTraining.vue";
import Company from "./components/Company.vue";
import SmartAgent from "./components/SmartAgent.vue";
import BonzaiBottomBar from "./components/BonzaiBottomBar.vue";
import LlmModelPickerModal from "./components/LlmModelPickerModal.vue";
import CommandPalette from "./components/CommandPalette.vue";
import GenerationInspector from "./components/GenerationInspector.vue";
import BzCloseButton from "./components/BzCloseButton.vue";
import { authService } from "./services/auth.service.js";
import { themeService } from "./services/theme.service.js";
import { useSkillStore } from "./stores/skillStore.js";
import { initOpenClawHandler } from "./services/openclaw.handler.js";
import { modelStore } from "./stores/modelStore.js";
import { getPerformanceStats, getHardwareSpecs, initializeStore } from "./stores/inferenceStore.js";

export default {
  name: "App",

  components: {
    GenerativeText,
    GenerativeImage,
    GenerativeVideo,
    GenerativeAudio,
    Generative3D,
    GenerativeTraining,
    SmartAgent,
    Company,
    BonzaiBottomBar,
    LlmModelPickerModal,
    CommandPalette,
    GenerationInspector,
    BzCloseButton,
  },
  setup() {
    const modelMode = ref("chat");
    // Nav tab catalog. The order here is the visual order in the rail.
    // Adding a tab is one entry here + a `<v-if>` row in the main column.
    const navTabs = [
      { id: "chat",    label: "Chat",     icon: "chat" },
      { id: "music",   label: "Audio",    icon: "headphones" },
      { id: "image",   label: "Image",    icon: "image" },
      { id: "video",   label: "Video",    icon: "movie" },
      { id: "3D",      label: "Assets",   icon: "3d_rotation" },
      { id: "robot",   label: "Training", icon: "exercise" },
      { id: "agent",   label: "Agents",   icon: "automation" },
      { id: "company", label: "Company",  icon: "storefront" },
    ];
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

    // Server status tracking for self-healing notifications
    const serverStatus = reactive({
      show: false,
      type: "info", // 'ready', 'restarting', 'crashed', 'error', 'starting', 'stopped'
      message: "",
      canRetry: false,
    });

    let unsubscribeServerStatus = null;
    let autoHideTimeout = null;

    const goAnimateToVideo = (b64) => {
      videoImageBase64.value = b64 || "";
      modelMode.value = "video"; // switch view
    };

    // Navigate directly to companion chat
    const goToCompanionChat = () => {
      skillStore.requestSkillNavigation("roleplay-companion-v1.0.0");
      skillStore.clearMissedMessages();
      skillStore.updateActivity();
      modelMode.value = "agent";
    };

    // Open Browse Models from bottom bar → switch to chat tab and signal GenerativeText
    const openBrowseModels = () => {
      modelMode.value = "chat";
      // Short delay to let GenerativeText mount if not already
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("bonzai:show-browse-models"));
      }, 50);
    };

    // External tab-switch via window event — used by the command
    // palette and other global UI surfaces. The event detail is the
    // tab key (chat / image / video / music / 3D / agent / robot /
    // company); unknown values are ignored so a stale dispatch can't
    // wedge the UI on a non-existent route.
    const VALID_MODES = new Set(["chat", "image", "video", "music", "3D", "agent", "robot", "company"]);
    const onSetModeEvent = (e) => {
      const next = e?.detail;
      if (typeof next === "string" && VALID_MODES.has(next)) {
        modelMode.value = next;
      }
    };

    // Provide goAnimateToVideo so child components can use it
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
          // Auto-hide after 3 seconds
          if (autoHideTimeout) clearTimeout(autoHideTimeout);
          autoHideTimeout = setTimeout(() => {
            serverStatus.show = false;
          }, 3000);
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

    onMounted(() => {
      // Apply the user's persisted theme before any component paints —
      // setting data-theme on <html> is synchronous so first render
      // already uses the chosen palette.
      themeService.init();

      // Initialize unified inference store (loads persisted generation history)
      initializeStore();

      // Load system info — returns instantly via os.totalmem(), no timeout needed
      const loadSystemInfo = async () => {
        try {
          systemValues.value = await window.electronAPI.systemInformation();
        } catch (e) {
          console.warn("Failed to load system info:", e.message);
        }
      };
      loadSystemInfo();
      // Refresh every 30s so memBudget reflects current available memory
      sysInfoInterval = setInterval(loadSystemInfo, 30000);

      // Initialize model store (query current model + start listening for changes)
      modelStore.initialize().then(() => modelStore.startListening());

      // Set window title with version
      window.electronAPI
        .getAppVersion()
        .then((version) => {
          document.title = `BonzAI v${version}`;
        })
        .catch(() => {
          document.title = "BonzAI";
        });

      // Initialize OpenClaw webhook handler
      initOpenClawHandler();

      // Listen for bottom bar → browse models request
      window.addEventListener("bonzai:open-browse-models", openBrowseModels);

      // Command palette → tab switch. The palette dispatches a
      // `bonzai:set-mode` event with the tab key in `detail`; we map
      // it onto the local `modelMode` ref so the same tab UI updates.
      window.addEventListener("bonzai:set-mode", onSetModeEvent);

      // Command palette → hardware modal. The picker / palette
      // owns no modal state itself; it just dispatches an event.
      window.addEventListener("bonzai:open-specs", openSpecsModal);

      // Subscribe to server status events
      unsubscribeServerStatus = window.electronAPI.onServerStatus((data) => {
        console.log("[App] Server status:", data);

        // Clear any pending auto-hide
        if (autoHideTimeout) {
          clearTimeout(autoHideTimeout);
          autoHideTimeout = null;
        }

        serverStatus.show = true;
        serverStatus.type = data.status;
        serverStatus.message = data.message || "";
        serverStatus.canRetry = data.canRetry || false;

        // Auto-hide success messages after 3 seconds
        if (data.status === "ready") {
          autoHideTimeout = setTimeout(() => {
            serverStatus.show = false;
          }, 3000);
        }
      });
    });

    onUnmounted(() => {
      if (unsubscribeServerStatus) {
        unsubscribeServerStatus();
      }
      if (autoHideTimeout) {
        clearTimeout(autoHideTimeout);
      }
      if (sysInfoInterval) {
        clearInterval(sysInfoInterval);
      }
      modelStore.stopListening();
      window.removeEventListener("bonzai:open-browse-models", openBrowseModels);
      window.removeEventListener("bonzai:set-mode", onSetModeEvent);
      window.removeEventListener("bonzai:open-specs", openSpecsModal);
    });

    return {
      systemValues,
      modelMode,
      navTabs,
      videoImageBase64,
      goAnimateToVideo,
      goToCompanionChat,
      serverStatus,
      handleServerRestart,
      authState,
      skillStore,
      showSpecsModal,
      specsData,
      openSpecsModal,
    };
  },
};
</script>

<style>
/* Local fonts for offline mode - bundled with the app */
@import "./assets/fonts/fonts.css";

/* Global design tokens — the single source of truth for colour,
   typography, spacing, motion, elevation. Components consume the
   --bz-* custom properties; new literals must be promoted here.
   See /DESIGN.md for the system rationale and rules. */
@import "./assets/tokens.css";

/* Theme variants — each `data-theme="X"` selector overrides the
   color tokens above. Default theme requires no attribute set.
   See themes.css for the catalog and theme.service.js for the
   runtime switcher. */
@import "./assets/themes.css";

/* Button + icon-button system. Global so every component reaches for
   the same primitives — see buttons.css for the variant catalog. */
@import "./assets/buttons.css";

/* Notice / banner system — small inline state surfaces (info / success
   / warning / danger). Replaces ad-hoc Bulma `notification` tints. */
@import "./assets/notices.css";

/* ═══════════════════════════════════════════════════════════════════════════
   BASE STYLES
   ═══════════════════════════════════════════════════════════════════════════ */

html,
body {
  -webkit-app-region: no-drag;
  -webkit-user-select: none;
  box-sizing: border-box !important;
  overflow: hidden;
  height: 100%;
  margin: 0;
}

/* Suppress scrollbars on all generative views — content scrolls via .models__deployment-install */
.models__deployment-install {
  scrollbar-width: none; /* Firefox */
}
.models__deployment-install::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Electron */
}

#app {
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  color: #2c3e50;
  font-family: "Fira Sans", sans-serif;
  font-style: normal;
  font-weight: 400;
  margin: 0 !important;
  padding: 0 !important;
  position: relative;
  text-align: center;
  min-height: 100%;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TYPOGRAPHY HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

.fira-sans-condensed-black-italic {
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font-weight: 900;
}

.fira-sans-condensed-thin {
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: normal;
  font-weight: 100;
}

.fira-sans-regular {
  font-family: "Fira Sans", sans-serif;
  font-style: normal;
  font-weight: 400;
}

.fira-sans-thin {
  font-family: "Fira Sans", sans-serif;
  font-style: normal;
  font-weight: 100;
}

.material-symbols-outlined {
  border-radius: 100%;
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════════════════════════════════════ */

.button {
  border-radius: 6px;
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  cursor: pointer !important;
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic !important;
  font-weight: 900;
  text-transform: none;
  transform: translate3d(0, 0, 0);
  transition: 200ms ease-in;
}

.button:hover {
  box-shadow: 18px 18px 0 rgba(97, 55, 142, 0.66);
  transition: 200ms ease-in;
}

.button.is-success {
  background: linear-gradient(rgba(57, 213, 130, 0.66), #26b569);
  border: 4px solid #1d8b51 !important;
  border-width: 0px 0px 3px !important;
  text-shadow: 1px -1px 1px #22a05d;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SYSTEM INFO
   ═══════════════════════════════════════════════════════════════════════════ */

.system {
  position: absolute;
  right: 0.5em;
  top: 0.85em;
  z-index: 777;
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION TABS / MENU
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────
   APP SHELL — left-rail nav + main work area. Editorial sidebar
   inspired by Linear / Mistral / Stripe — fixed 240 px width on
   desktop, with the brand tile at the top and a memory-budget pill
   the user can click for system specs. Each tab keeps its branded
   image (the BonzAI character) but tightens to 60 px tall with a
   shade overlay so the text stays legible against any background.
   ────────────────────────────────────────────────────────────── */

#bonzai {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  height: calc(100vh - 80px);
  overflow: hidden;
  background: var(--bz-canvas);
}

.bz-main {
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bz-canvas);
  display: flex;
  flex-direction: column;
}

/* Each tab component mounts as a direct child of .bz-main.
   Replaces the legacy Bulma column grid so content fills the
   available width and height without overflow fights. */
.bz-tab-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.bz-nav {
  display: flex;
  flex-direction: column;
  background: var(--bz-panel);
  border-right: 1px solid var(--bz-border);
  height: 100%;
  overflow-y: auto;
}

/* Brand header — logo strip + memory budget pill */
.bz-nav__brand {
  padding: var(--bz-space-5) var(--bz-space-4) var(--bz-space-4);
  border-bottom: 1px solid var(--bz-border);
  background:
    linear-gradient(180deg, var(--bz-purple-soft) 0%, transparent 100%);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}
.bz-nav__logo {
  background: url("./assets/bonzai_logo-full.png") no-repeat center;
  background-size: contain;
  height: 40px;
  width: 100%;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}
.bz-nav__mem {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--bz-space-2);
  padding: var(--bz-space-2) var(--bz-space-3);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  cursor: pointer;
  transition:
    border-color var(--bz-dur-fast) var(--bz-ease-out),
    color var(--bz-dur-fast) var(--bz-ease-out);
}
.bz-nav__mem:hover {
  border-color: var(--bz-purple-300);
  color: var(--bz-fg);
}
.bz-nav__mem .material-symbols-outlined {
  font-size: 16px !important;
  color: var(--bz-purple-300);
}

/* Tab list — vertical, dense, scrolls */
.bz-nav__list {
  list-style: none;
  margin: 0;
  padding: var(--bz-space-3) var(--bz-space-2);
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Each item — icon (left) · label (center) · brand image (background)
   · active bar (left edge). Hover lifts the shade; active state
   holds the lift and shows the brand-purple bar. */
.bz-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3) var(--bz-space-4);
  height: 56px;
  border-radius: var(--bz-r);
  cursor: pointer;
  outline: none;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  transition:
    transform var(--bz-dur-base) var(--bz-ease-out),
    box-shadow var(--bz-dur-base) var(--bz-ease-out);
  overflow: hidden;
}
.bz-nav__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    rgba(0, 0, 0, 0.7) 0%,
    rgba(0, 0, 0, 0.45) 60%,
    rgba(0, 0, 0, 0.6) 100%
  );
  transition: background var(--bz-dur-base) var(--bz-ease-out);
  pointer-events: none;
}
.bz-nav__icon {
  position: relative;
  z-index: 1;
  font-size: 22px !important;
  color: var(--bz-fg-mid);
  font-variation-settings: "FILL" 0, "wght" 300, "opsz" 24;
  transition: color var(--bz-dur-fast) var(--bz-ease-out);
  flex-shrink: 0;
}
.bz-nav__label {
  position: relative;
  z-index: 1;
  font-size: var(--bz-size-h3);
  color: var(--bz-fg);
  letter-spacing: 0.01em;
  flex: 1;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
.bz-nav__active-bar {
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  background: var(--bz-gradient-brand);
  border-radius: var(--bz-r-pill);
  opacity: 0;
  transform: scaleY(0.6);
  transition:
    opacity var(--bz-dur-base) var(--bz-ease-out),
    transform var(--bz-dur-base) var(--bz-ease-out);
}

.bz-nav__item:hover .bz-nav__shade {
  background: linear-gradient(
    to right,
    rgba(20, 8, 40, 0.55) 0%,
    rgba(0, 0, 0, 0.30) 60%,
    rgba(0, 0, 0, 0.45) 100%
  );
}
.bz-nav__item:hover .bz-nav__icon {
  color: var(--bz-purple-100);
}
.bz-nav__item:focus-visible {
  box-shadow: 0 0 0 2px var(--bz-border-brand);
}

.bz-nav__item.is-active .bz-nav__shade {
  background: linear-gradient(
    to right,
    rgba(97, 55, 142, 0.7) 0%,
    rgba(97, 55, 142, 0.32) 50%,
    rgba(0, 0, 0, 0.4) 100%
  );
}
.bz-nav__item.is-active .bz-nav__icon { color: var(--bz-fg); }
.bz-nav__item.is-active .bz-nav__label { color: var(--bz-fg); }
.bz-nav__item.is-active .bz-nav__active-bar {
  opacity: 1;
  transform: scaleY(1);
}

/* Brand image per tab — kept from the previous design so each row
   carries BonzAI's visual identity. The shade overlay above keeps
   the label legible against any image. */
.bz-nav__item--chat    { background-image: url("./assets/bonzai_chat.webp"); }
.bz-nav__item--image   { background-image: url("./assets/bonzai_image.webp"); }
.bz-nav__item--music   { background-image: url("./assets/bonzai_music.webp"); }
.bz-nav__item--video   { background-image: url("./assets/bonzai_video.webp"); }
.bz-nav__item--3D      { background-image: url("./assets/bonzai_3d.webp"); }
.bz-nav__item--robot   {
  background-image: url("./assets/bonzai_robots.webp");
  background-position: center 33%;
}
.bz-nav__item--agent   {
  background-image: url("./assets/bonzai_agent.webp");
  background-position: center 66%;
}
.bz-nav__item--company {
  background-image: url("./assets/bonzai_company.webp");
  background-position: center 50%;
}

/* Narrow viewport — collapse to 64 px icon-only rail. Labels still
   render but at meta scale, so the muscle memory survives. */
@media (max-width: 1024px) {
  #bonzai { grid-template-columns: 64px minmax(0, 1fr); }
  .bz-nav__brand { padding: var(--bz-space-3) var(--bz-space-2); }
  .bz-nav__logo  { height: 28px; }
  .bz-nav__mem   { display: none; }
  .bz-nav__item  { padding: var(--bz-space-2); justify-content: center; }
  .bz-nav__label { display: none; }
  .bz-nav__icon  { font-size: 24px !important; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHAT MESSAGES
   ═══════════════════════════════════════════════════════════════════════════ */

div.answer {
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  backdrop-filter: blur(6px);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  box-shadow: -8px 8px 0 rgba(57, 213, 130, 0.25);
  color: #fff;
  font-family: "Fira Sans", sans-serif;
  font-size: 24px;
  font-style: normal;
  font-weight: 100;
  margin-bottom: 2em !important;
  padding: 1em;
  text-align: justify;
  transform: translate3d(0, 0, 0);
}

div.answer ol {
  padding-left: 1em !important;
}

div.answer p {
  margin-bottom: 0 !important;
}

div.answer strong {
  color: rgba(57, 213, 130, 0.75);
}

div.answer table td {
  padding-bottom: 20px !important;
  text-align: left;
}

div.answer table thead tr th {
  color: #fff !important;
  font: 900;
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  text-transform: uppercase;
}

p.question {
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  font-weight: 700;
  margin-bottom: 1em !important;
  margin-top: 2em !important;
  padding: 1em;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SERVER STATUS NOTIFICATION
   ═══════════════════════════════════════════════════════════════════════════ */

.server-notification {
  animation: slideIn 0.3s ease-out;
  position: fixed;
  width: 33%;
  top: 1em;
  right: 1em;
  z-index: 1;
  opacity: 0.9;
}

.server-notification .delete {
  position: absolute;
  right: 0.5rem;
  top: 0.5rem;
}

.server-notification .progress {
  margin-top: 0.5rem;
}

.server-notification p {
  font-size: 12px;
  margin-bottom: 0.5rem !important;
  text-align: left;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATIONS
   ═══════════════════════════════════════════════════════════════════════════ */

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Specs Modal */
.specs-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.specs-modal {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  padding: 2em;
  width: 550px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.specs-section {
  padding: 1em;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.specs-table {
  background: transparent !important;
}

.specs-table td,
.specs-table th {
  background: transparent !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: rgba(255, 255, 255, 0.7);
  padding: 0.6em 0.75em;
}

.specs-label {
  color: rgba(255, 255, 255, 0.5) !important;
  font-size: 0.85rem;
}

.specs-value {
  color: #fff !important;
  font-size: 0.95rem;
}
</style>
