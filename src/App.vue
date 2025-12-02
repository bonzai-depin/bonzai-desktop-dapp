<template>
  <div class="columns">
    <div class="column is-4 is-paddingless">
      <div class="models tabs menu">
        <ul class="models__list">
          <li class="models__list-item model bonzai has-text-left">
            <div class="shade"></div>
            <div class="logo">
              <span
                v-if="systemValues.value"
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
                    (systemValues.value.ram + systemValues.value.vram) /
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
            :existingImageBase64="videoImageBase64"
          >
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">movie</span>
                Video
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
                Music
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
                Game
              </h1>
            </a>
          </li>
          <li
            class="models__list-item model robot"
            :class="{ 'is-active': modelMode == '3D' }"
            @click="modelMode = 'robot'"
          >
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">
                  precision_manufacturing
                </span>
                Robots
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
                <span class="material-symbols-outlined is-size-1">hub</span>
                Smart Agents
              </h1>
            </a>
          </li>
        </ul>
      </div>
    </div>
    <GenerativeText v-if="modelMode == 'chat'" />
    <GenerativeImage v-if="modelMode == 'image'" />
    <GenerativeVideo v-if="modelMode == 'video'" />
    <GenerativeMusic v-if="modelMode == 'music'" />
    <Generative3D v-if="modelMode == '3D'" />
    <SmartAgent v-if="modelMode == 'agent'" />
  </div>
</template>

<script>
import { ref } from "vue";
import GenerativeText from "./components/GenerativeText.vue";
import GenerativeImage from "./components/GenerativeImage.vue";
import GenerativeVideo from "./components/GenerativeVideo.vue";
import GenerativeMusic from "./components/GenerativeMusic.vue";
import Generative3D from "./components/Generative3D.vue";
import SmartAgent from "./components/SmartAgent.vue";

export default {
  name: "App",
  components: {
    GenerativeText,
    GenerativeImage,
    GenerativeVideo,
    GenerativeMusic,
    Generative3D,
    SmartAgent,
  },
  setup() {
    const modelMode = ref("chat");
    const systemValues = ref({});
    const videoImageBase64 = ref("");

    const goAnimateToVideo = (b64) => {
      videoImageBase64.value = b64 || "";
      modelMode.value = "video"; // switch view
    };

    return {
      systemValues,
      modelMode,
      videoImageBase64,
      goAnimateToVideo,
    };
  },
  async mounted() {
    const mySystemValues = await window.electronAPI.systemInformation();
    this.systemValues.value = mySystemValues;
    console.log("Ready to start, sir.", this.systemValues);
  },
};
</script>

<style>
@import url("https://fonts.googleapis.com/css2?family=Fira+Sans+Condensed:ital,wght@0,100;1,900&family=Fira+Sans:wght@100;400&display=swap");
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

html,
body {
  box-sizing: border-box !important;
  -webkit-user-select: none;
  -webkit-app-region: no-drag;
  overflow: hidden;
}

.system {
  position: absolute;
  top: 20px;
  right: 8px;
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
  font-weight: 100;
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
  font-weight: 100;
  text-shadow: 1px 1px 1px #777;
  border: none;
}

.tabs.menu li.bonzai {
  /* aspect-ratio: 16/9; */
  height: 10vh;
  width: 100%;
  background: #61378e;
  border-bottom: 10vh solid #61378e;
  filter: none !important;
}

.tabs.menu li.bonzai .logo {
  margin: 5px;
  height: 10vh;
  width: 100%;
  background: url("assets/bonzai_logo-full.png") no-repeat;
  background-size: contain;
}

.tabs.menu li.bonzai .memory {
  height: 7vh;
}

.tabs.menu li.chat {
  /* aspect-ratio: 16/9; */
  height: 12vh;
  background: url("assets/bonzai_chat.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.image {
  height: 12vh;
  background: url("assets/bonzai_image.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.video {
  height: 12vh;
  background: url("assets/bonzai_video.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.music {
  height: 12vh;
  background: url("assets/bonzai_music.jpg") no-repeat;
  background-size: cover;
}

.tabs.menu li.three {
  height: 12vh;
  background: url("assets/bonzai_3d.jpg") no-repeat;
  background-size: cover;
  background-position: center center;
}

.tabs.menu li.robot {
  height: 12vh;
  background: url("assets/bonzai_robots.jpg") no-repeat;
  background-size: cover;
  background-position: center center;
}

.tabs.menu li.agent {
  height: 17vh;
  background: url("assets/bonzai_agent.jpg") no-repeat;

  background-size: cover;
  background-position: bottom center;
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
</style>
