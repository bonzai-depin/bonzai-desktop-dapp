<template>
  <pre>{{ mySystem }}</pre>
  <div class="columns">
    <div class="column is-4 is-paddingless">
      <div class="models tabs">
        <ul class="models__list">
          <li class="models__list-item model bonzai has-text-left">
            <div class="shade"></div>
            <div class="logo"></div>
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
          <li class="models__list-item model video disabled">
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">movie</span>
                Video
              </h1>
            </a>
            <div class="level">
              <div class="tags has-addons level-item">
                <span class="tag">Coming</span>
                <span class="tag is-primary">Soon</span>
              </div>
            </div>
          </li>
          <li class="models__list-item model music disabled">
            <a>
              <h1>
                <span class="material-symbols-outlined is-size-1">
                  headphones
                </span>
                Music
              </h1>
            </a>
            <div class="level">
              <div class="tags has-addons level-item">
                <span class="tag">Coming</span>
                <span class="tag is-primary">Soon</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
    <GenerativeText v-if="modelMode == 'chat'" />
    <GenerativeImage v-if="modelMode == 'image'" />
  </div>
</template>

<script>
import { ref } from "vue";
import GenerativeText from "./components/GenerativeText.vue";
import GenerativeImage from "./components/GenerativeImage.vue";

export default {
  name: "App",
  components: {
    GenerativeText,
    GenerativeImage,
  },
  setup() {
    const modelMode = ref("chat");
    const systemValues = ref({});

    const mySystem = async () => {
      const mySystemValues = await window.electronAPI.systemInformation();
      systemValues.value = mySystemValues;
      return mySystemValues;
    };

    return {
      mySystem,
      modelMode,
    };
  },
  async mounted() {
    const systemReady = await this.mySystem();
    console.log("Ready to start, sir.", systemReady);
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

.tabs {
  width: 100%;
}

.tabs ul {
  -webkit-flex-direction: column;
  flex-direction: column;
}

.tabs ul li {
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
  box-shadow: 10px 0 25px #000;
  cursor: pointer;
}

.tabs li + li {
  width: 100%;
  margin-left: 0;
}

.tabs li.is-active {
  width: 100%;
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  font-style: normal;
}

.tabs li.is-active a {
  border-bottom-color: #fff;
  color: #fff;
}

.tabs li:not(.is-active) {
  filter: grayscale(100%);
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
}

.tabs li:not(.is-active):hover {
  filter: none;
}

.tabs li.disabled {
  filter: grayscale(100%) !important;
  cursor: not-allowed !important;
}

.tabs li a {
  justify-content: left;
  border: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.tabs li a h1 {
  color: #fff;
  font-size: 48px;
  font-weight: 100;
  text-shadow: 1px 1px 1px #777;
  border: none;
}

.tabs li.bonzai {
  /* aspect-ratio: 16/9; */
  height: 20vh;
  width: 100%;
  background: #61378e;
  border-bottom: 10vh solid #61378e;
  filter: none !important;
}

.tabs li.bonzai .logo {
  height: 20vh;
  width: 100%;
  background: url("https://www.bonzai.sh/bonzai_logo-full.png") no-repeat;
  background-size: contain;
}

.tabs li.chat {
  /* aspect-ratio: 16/9; */
  height: 20vh;
  background: url("https://www.bonzai.sh/bonzai_chat.jpg") no-repeat;
  background-size: cover;
}

.tabs li.image {
  height: 20vh;
  background: url("https://www.bonzai.sh/bonzai_image.jpg") no-repeat;
  background-size: cover;
}

.tabs li.video {
  height: 20vh;
  background: url("https://www.bonzai.sh/bonzai_video.jpg") no-repeat;
  background-size: cover;
}

.tabs li.music {
  height: 20vh;
  background: url("https://www.bonzai.sh/bonzai_music.jpg") no-repeat;
  background-size: cover;
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
</style>
