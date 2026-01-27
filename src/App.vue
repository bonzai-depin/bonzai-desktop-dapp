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
    <progress
      class="progress is-small is-warning"
      max="100"
    ></progress>
  </div>

  <!-- Server Status Notification (using standard notification pattern) -->
  <div
    v-else-if="serverStatus.show"
    class="server-notification notification"
    :class="{
      'is-info': serverStatus.type === 'restarting' || serverStatus.type === 'starting',
      'is-success': serverStatus.type === 'ready',
      'is-danger': serverStatus.type === 'crashed' || serverStatus.type === 'error',
      'is-warning': serverStatus.type === 'stopped'
    }"
  >
    <button class="delete" @click="serverStatus.show = false"></button>
    <p class="mb-2">
      <span class="fira-sans-condensed-black-italic is-size-4">
        <button
          v-if="serverStatus.type === 'restarting' || serverStatus.type === 'starting'"
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
      <span
        v-if="serverStatus.canRetry"
        class="is-pulled-right"
      >
        <button
          class="button is-small is-warning"
          @click="handleServerRestart"
        >
          <span class="material-symbols-outlined mr-1" style="font-size: 16px">refresh</span>
          Retry
        </button>
      </span>
    </p>
    <progress
      v-if="serverStatus.type === 'restarting' || serverStatus.type === 'starting'"
      class="progress is-small"
      :class="{
        'is-info': serverStatus.type === 'starting',
        'is-warning': serverStatus.type === 'restarting'
      }"
      max="100"
    ></progress>
  </div>

  <div id="bonzai" class="columns">
    <div class="column is-4 is-paddingless">
      <div class="models tabs menu">
        <ul class="models__list">
          <li class="models__list-item model bonzai has-text-left">
            <div class="shade"></div>
            <div class="logo">
              <span
                v-if="systemValues && systemValues.ram !== undefined"
                class="system tag is-info is-large is-pulled-right memory fira-sans-condensed-black-italic is-size-2"
              >
                <span
                  class="material-symbols-outlined is-size-1 mr-2"
                  style="font-size: 50px !important"
                >
                  memory
                </span>
                {{
                  (
                    ((systemValues.ram || 0) + (systemValues.vram || 0)) /
                    1024 ** 3
                  ).toFixed(0)
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
                <span class="material-symbols-outlined is-size-1">
                  hub
                </span>
                Agents
              </h1>
            </a>
          </li>
        </ul>
      </div>
    </div>
    <!-- Each component has inline access requirements with demo mode -->
    <GenerativeText v-if="modelMode == 'chat'" />
    <GenerativeAudio v-if="modelMode == 'music'" />
    <GenerativeImage v-if="modelMode == 'image'" />
    <GenerativeVideo v-if="modelMode == 'video'" :existingImageBase64="videoImageBase64" />
    <Generative3D v-if="modelMode == '3D'" />
    <GenerativeTraining v-if="modelMode == 'robot'" />
    <SmartAgent v-if="modelMode == 'agent'" />
  </div>
  <BonzaiBottomBar />
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
    const authState = authService.state;

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

    onMounted(async () => {
      // Get system info
      const mySystemValues = await window.electronAPI.systemInformation();
      systemValues.value = mySystemValues;
      console.log("Ready to start, sir.", systemValues.value);

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
    });

    return {
      systemValues,
      modelMode,
      videoImageBase64,
      goAnimateToVideo,
      serverStatus,
      handleServerRestart,
      authState,
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
  height: 9.5vh !important;
  position: absolute;
  right: 18px;
  top: 32px;
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
  background: url("./assets/bonzai_agent.jpg") no-repeat;
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
  background: url("./assets/bonzai_chat.jpg") no-repeat;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.image {
  background: url("./assets/bonzai_image.jpg") no-repeat;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.music {
  background: url("./assets/bonzai_music.jpg") no-repeat;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.robot {
  background: url("./assets/bonzai_robots.jpg") no-repeat;
  background-position: center 33%;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.three {
  background: url("./assets/bonzai_3d.jpg") no-repeat;
  background-size: cover;
  height: 11.33vh;
}

.tabs.menu li.video {
  background: url("./assets/bonzai_video.jpg") no-repeat;
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
</style>
