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

  <div id="bonzai" class="columns is-gapless">
    <div class="column is-4 is-paddingless">
      <div class="models tabs menu">
        <ul class="models__list">
          <li class="models__list-item model bonzai has-text-left">
            <div class="shade"></div>
            <div class="logo">
              <span
                v-if="systemValues && systemValues.memBudget"
                class="system tag is-info is-large is-pulled-right memory fira-sans-condensed-black-italic is-size-2"
                style="cursor: pointer"
                title="Available memory budget for AI inference (click for details)"
                @click="openSpecsModal"
              >
                <span
                  class="material-symbols-outlined is-size-1 mr-2"
                  style="font-size: 50px !important"
                >
                  memory
                </span>
                {{
                  (systemValues.memBudget / 1024 ** 3).toFixed(0)
                }}
                GB
              </span>
            </div>
          </li>
          <li
            class="models__list-item model chat"
            :class="{ 'is-active': modelMode == 'chat' }"
            @click="modelMode = 'chat'"
          >
            <div class="shade"></div>
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">chat</span>
                Chat
              </h1>
            </a>
          </li>
          <li
            class="models__list-item model music"
            :class="{ 'is-active': modelMode == 'music' }"
            @click="modelMode = 'music'"
          >
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">
                  headphones
                </span>
                Audio
              </h1>
            </a>
          </li>
          <li
            class="models__list-item model image"
            :class="{ 'is-active': modelMode == 'image' }"
            @click="modelMode = 'image'"
          >
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">image</span>
                Image
              </h1>
            </a>
          </li>
          <li
            class="models__list-item model video"
            :class="{ 'is-active': modelMode == 'video' }"
            @click="modelMode = 'video'"
          >
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">movie</span>
                Video
              </h1>
            </a>
          </li>
          <li
            class="models__list-item model three"
            :class="{ 'is-active': modelMode == '3D' }"
            @click="modelMode = '3D'"
          >
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">
                  3d_rotation
                </span>
                Assets
              </h1>
            </a>
          </li>
          <li
            class="models__list-item model robot"
            :class="{ 'is-active': modelMode == 'robot' }"
            @click="modelMode = 'robot'"
          >
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">
                  exercise
                </span>
                Training
              </h1>
            </a>
          </li>
          <li
            class="models__list-item model agent"
            :class="{ 'is-active': modelMode == 'agent' }"
            @click="modelMode = 'agent'"
          >
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">automation</span>
                Agents
              </h1>
            </a>
          </li>
        </ul>
      </div>
    </div>
    <!-- Each component has inline access requirements -->
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
  </div>
  <BonzaiBottomBar />

  <!-- Hardware Specifications & Performance Modal -->
  <div
    v-if="showSpecsModal"
    class="specs-modal-overlay"
    @click.self="showSpecsModal = false"
  >
    <div class="specs-modal">
      <div class="has-text-right">
        <button class="button is-danger" @click="showSpecsModal = false">
          <span class="material-symbols-outlined">close</span>
        </button>
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
import SmartAgent from "./components/SmartAgent.vue";
import BonzaiBottomBar from "./components/BonzaiBottomBar.vue";
import { authService } from "./services/auth.service.js";
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
    BonzaiBottomBar,
  },
  setup() {
    const modelMode = ref("chat");
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
    });

    return {
      systemValues,
      modelMode,
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

.tabs.menu {
  width: 100%;
}

.tabs.menu ul {
  flex-direction: column;
}

.tabs.menu ul li {
  box-shadow: 10px 0 25px #000;
  cursor: pointer;
  transform: translate3d(0, 0, 0);
  transition: 400ms ease-in;
}

.tabs.menu ul li .notification {
  position: absolute;
  top: 1em;
  right: 1em;
  padding: 0.5em 1em;
  width: 100px;
}

.tabs.menu li + li {
  margin-left: 0;
  width: 100%;
}

.tabs.menu li a {
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  border: none;
  justify-content: left;
}

.tabs.menu li a h1 {
  align-items: center;
  border: none;
  color: #fff;
  display: flex;
  font-family: "Fira Sans", sans-serif;
  font-size: 48px;
  font-style: normal;
  font-weight: 100 !important;
  gap: 0.5rem;
  text-shadow: 1px 1px 1px #000;
}

/* Fixed icon sizing to prevent layout shift on font load */
.tabs.menu li a h1 .material-symbols-outlined {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 48px;
  min-width: 48px;
  width: 48px;
}

.tabs.menu li.disabled {
  cursor: not-allowed !important;
  filter: grayscale(100%) !important;
}

.tabs.menu li.is-active {
  font-family: "Fira Sans", sans-serif;
  font-style: normal;
  font-weight: 300;
  width: 100%;
}

.tabs.menu li.is-active a {
  border-bottom-color: #fff;
  color: #fff;
}

.tabs.menu li:not(.is-active) {
  filter: grayscale(100%);
  transform: translate3d(0, 0, 0);
  transition: 400ms ease-in;
}

.tabs.menu li:not(.is-active):hover {
  filter: none;
}

/* Menu Item Backgrounds */
.tabs.menu li.agent {
  background: url("./assets/bonzai_agent.webp") no-repeat;
  background-position: center 66%;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.bonzai {
  background: #61378e;
  border-bottom: 10vh solid #61378e;
  filter: none !important;
  height: 14vh;
  padding-top: 1em;
  width: 100%;
}

.tabs.menu li.bonzai .logo {
  background: url("./assets/bonzai_logo-full.png") no-repeat;
  background-size: contain;
  height: 11.33vh;
  margin: 5px;
  width: 100%;
}

.tabs.menu li.bonzai .memory {
  height: 7vh;
}

.tabs.menu li.chat {
  background: url("./assets/bonzai_chat.webp") no-repeat;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.image {
  background: url("./assets/bonzai_image.webp") no-repeat;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.music {
  background: url("./assets/bonzai_music.webp") no-repeat;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.robot {
  background: url("./assets/bonzai_robots.webp") no-repeat;
  background-position: center 33%;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.three {
  background: url("./assets/bonzai_3d.webp") no-repeat;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.video {
  background: url("./assets/bonzai_video.webp") no-repeat;
  background-size: cover;
  height: 11.33vh;
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
