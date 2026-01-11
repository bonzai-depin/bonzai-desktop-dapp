<template>
  <!-- Server Status Notification (using standard notification pattern) -->
  <div
    v-if="serverStatus.show"
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
                  finance_mode
                </span>
                Prediction
              </h1>
            </a>
          </li>
        </ul>
      </div>
    </div>
    <!-- Each component has inline access requirements with demo mode -->
    <GenerativeText v-if="modelMode == 'chat'" />
    <GenerativeMusic v-if="modelMode == 'music'" />
    <GenerativeImage v-if="modelMode == 'image'" />
    <GenerativeVideo v-if="modelMode == 'video'" :existingImageBase64="videoImageBase64" />
    <Generative3D v-if="modelMode == '3D'" />
    <GenerativeRobot v-if="modelMode == 'robot'" />
    <SmartAgent v-if="modelMode == 'agent'" />
  </div>
  <BonzaiBottomBar />
</template>

<script>
import { ref, reactive, provide, onMounted, onUnmounted } from "vue";
import GenerativeText from "./components/GenerativeText.vue";
import GenerativeImage from "./components/GenerativeImage.vue";
import GenerativeVideo from "./components/GenerativeVideo.vue";
import GenerativeMusic from "./components/GenerativeMusic.vue";
import Generative3D from "./components/Generative3D.vue";
import GenerativeRobot from "./components/GenerativeRobot.vue";
import SmartAgent from "./components/SmartAgent.vue";
import BonzaiBottomBar from "./components/BonzaiBottomBar.vue";

export default {
  name: "App",

  components: {
    GenerativeText,
    GenerativeImage,
    GenerativeVideo,
    GenerativeMusic,
    Generative3D,
    GenerativeRobot,
    SmartAgent,
    BonzaiBottomBar,
  },
  setup() {
    const modelMode = ref("chat");
    const systemValues = ref({});
    const videoImageBase64 = ref("");

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
    };
  },
};
</script>

<style>
/* Local fonts for offline mode - bundled with the app */
@import "./assets/fonts/fonts.css";

.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;

  border-radius: 100%;
}

.fira-sans-thin {
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  font-style: normal;
}

.fira-sans-regular {
  font-family: "Fira Sans", sans-serif;
  font-weight: 400;
  font-style: normal;
}

.fira-sans-condensed-thin {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 100;
  font-style: normal;
}

.fira-sans-condensed-black-italic {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 900;
  font-style: italic;
}

#app {
  position: relative;
  font-family: "Fira Sans", sans-serif;
  font-weight: 400;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin: 0 !important;
  padding: 0 !important;
}

#bonzai {
}

html,
body {
  box-sizing: border-box !important;
  -webkit-user-select: none;
  -webkit-app-region: no-drag;
  overflow: hidden;
}

.system {
  position: absolute;
  top: 32px;
  right: 18px;
  height: 9.5vh !important;
  z-index: 777;
}

.button {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 900;
  font-style: italic !important;
  border-radius: 6px;
  cursor: pointer !important;
  text-transform: none;
  /* box-shadow: 8px 8px 0 rgba(#61378e, 0.2); */
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  transition: 200ms ease-in;
  transform: translate3d(0, 0, 0);
}

.button.is-success {
  background: linear-gradient(rgba(57, 213, 130, 0.66), #26b569);
  border: 4px solid #1d8b51 !important;
  text-shadow: 1px -1px 1px #22a05d;
  border-width: 0px 0px 3px !important;
}

.button:hover {
  transition: 200ms ease-in;
  box-shadow: 18px 18px 0 rgba(97, 55, 142, 0.66);
}

@keyframes move {
  0% {
    -webkit-transform-origin: bottom left;
    -moz-transform-origin: bottom left;
    -ms-transform-origin: bottom left;
    -o-transform-origin: bottom left;
    transform-origin: bottom left;
    transform: scale(1.3);
    -ms-transform: scale(1.3);
    /* IE 9 */

    -webkit-transform: scale(1.3);
    /* Safari and Chrome */

    -o-transform: scale(1.3);
    /* Opera */

    -moz-transform: scale(1.3);
    /* Firefox */
  }
  50% {
    transform: scale(1.6);
    -ms-transform: scale(1.6);
    /* IE 9 */

    -webkit-transform: scale(1.6);
    /* Safari and Chrome */

    -o-transform: scale(1.6);
    /* Opera */

    -moz-transform: scale(1.6);
    /* Firefox */
  }
  100% {
    transform-origin: bottom left;
    transform: scale(1.3);
    -ms-transform: scale(1.3);
    /* IE 9 */

    -webkit-transform: scale(1.3);
    /* Safari and Chrome */

    -o-transform: scale(1.3);
    /* Opera */

    -moz-transform: scale(1.3);
    /* Firefox */
  }
}

.tabs.menu {
  width: 100%;
}

.tabs.menu ul {
  -webkit-flex-direction: column;
  flex-direction: column;
}

.tabs.menu ul li {
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
  box-shadow: 10px 0 25px #000;
  cursor: pointer;
}

.tabs.menu li + li {
  width: 100%;
  margin-left: 0;
}

.tabs.menu li.is-active {
  width: 100%;
  font-family: "Fira Sans", sans-serif;
  font-weight: 300;
  font-style: normal;
}

.tabs.menu li.is-active a {
  border-bottom-color: #fff;
  color: #fff;
}

.tabs.menu li:not(.is-active) {
  filter: grayscale(100%);
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
}

.tabs.menu li:not(.is-active):hover {
  filter: none;
}

.tabs.menu li.disabled {
  filter: grayscale(100%) !important;
  cursor: not-allowed !important;
}

.tabs.menu li a {
  justify-content: left;
  border: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.tabs.menu li a h1 {
  color: #fff;
  font-size: 48px;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100 !important;
  font-style: normal;
  text-shadow: 1px 1px 1px #000;
  border: none;
}

.tabs.menu li.bonzai {
  /* aspect-ratio: 16/9; */
  padding-top: 1em;
  height: 14vh;
  width: 100%;
  background: #61378e;
  border-bottom: 10vh solid #61378e;
  filter: none !important;
}

.tabs.menu li.bonzai .logo {
  margin: 5px;
  height: 11.33vh;
  width: 100%;
  background: url("./assets/bonzai_logo-full.png") no-repeat;
  background-size: contain;
}

.tabs.menu li.bonzai .memory {
  height: 7vh;
}

.tabs.menu li.chat {
  /* aspect-ratio: 16/9; */
  height: 11.33vh;
  background: url("./assets/bonzai_chat.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.image {
  height: 11.33vh;
  background: url("./assets/bonzai_image.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.video {
  height: 11.33vh;
  background: url("./assets/bonzai_video.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.music {
  height: 11.33vh;
  background: url("./assets/bonzai_music.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.three {
  height: 11.33vh;
  background: url("./assets/bonzai_3d.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.robot {
  height: 11.33vh;
  background: url("./assets/bonzai_robots.jpg") no-repeat;
  background-size: cover;
  background-position: center 33%;
}

.tabs.menu li.agent {
  height: 11.33vh;
  background: url("./assets/bonzai_agent.jpg") no-repeat;

  background-size: cover;
  background-position: center 66%;
}

p.question {
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 1em;
  margin-top: 2em !important;
  margin-bottom: 1em !important;
  font-weight: 700;
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  border-radius: 4px;
  backdrop-filter: blur(6px);
}

div.answer {
  margin-bottom: 2em !important;
  padding: 1em;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: -8px 8px 0 rgba(57, 213, 130, 0.25);
  border-radius: 4px;
  backdrop-filter: blur(6px);
  background: rgba(255, 255, 255, 0.1);
  font-size: 24px;
  color: #fff;
  text-align: justify;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transform: translate3d(0, 0, 0);
}

div.answer strong {
  color: rgba(57, 213, 130, 0.75);
}

div.answer p {
  margin-bottom: 0 !important;
}

div.answer ol {
  padding-left: 1em !important;
}

div.answer table thead tr th {
  font-family: "Fira Sans Condensed", sans-serif;
  font-style: italic;
  font: 900;
  color: #fff !important;
  text-transform: uppercase;
}

div.answer table td {
  text-align: left;
  padding-bottom: 20px !important;
}

/* Server Status Notification */
.server-notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  min-width: 400px;
  max-width: 600px;
  padding: 1.25rem 2.5rem 1.25rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    transform: translateX(-50%) translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

.server-notification p {
  margin-bottom: 0.5rem !important;
  font-size: 16px;
  text-align: left;
}

.server-notification .progress {
  margin-top: 0.5rem;
}

.server-notification .delete {
  position: absolute;
  right: 0.5rem;
  top: 0.5rem;
}
</style>
