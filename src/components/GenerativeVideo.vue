<template scoped>
  <div class="background"></div>
  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12 p-5">
          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <div class="level">
                  <div class="level-left">
                    <div class="level-item">
                      <h1 class="fira-sans-condensed-black-italic">
                        <span
                          class="material-symbols-outlined mr-2"
                          style="font-size: 92px !important"
                        >
                          movie
                        </span>
                        Generative Video
                      </h1>
                    </div>
                  </div>
                </div>
                <div class="control mb-5 has-text-left">
                  <input
                    v-model="mode"
                    :value="'turbo'"
                    id="mode_speed"
                    type="radio"
                    name="mode"
                    checked
                  />
                  <label for="mode_speed" class="radio mr-5">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      acute
                    </span>
                    Turbo
                  </label>
                  <input
                    v-model="mode"
                    :value="'quality'"
                    id="mode_quality"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_quality" class="radio mr-1">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      high_quality
                    </span>
                    Quality
                  </label>
                  <span class="control">
                    <input
                      v-model="quality"
                      :value="'low'"
                      id="mode_quality_low"
                      type="radio"
                      name="mode_quality"
                      checked
                    />
                    <label for="mode_quality_low" class="radio quality">
                      <span
                        style="font-size: 32px !important"
                      >
                        low
                      </span>
                    </label>
                    <input
                      v-model="quality"
                      :value="'medium'"
                      id="mode_quality_medium"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_medium" class="radio quality">
                      <span
                        style="font-size: 32px !important"
                      >
                        hd
                      </span>
                    </label>
                    <input
                      v-model="quality"
                      :value="'high'"
                      id="mode_quality_high"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_high" class="radio quality">
                      <span
                        style="font-size: 32px !important"
                      >
                        high
                      </span>
                    </label>
                  </span>
                </div>
                <form ref="promptForm" @submit.prevent>
                  <input
                    class="input is-large is-fullwidth"
                    type="text"
                    placeholder="Describe your image and press enter to generate..."
                    v-model="form.prompt"
                    @keyup.enter.native="sendMessage(form.prompt)"
                    :disabled="isLoading"
                  />
                  <button
                    class="button chat is-loading is-outlined is-info is-large is-fullwidth"
                    v-if="isLoading"
                  ></button>
                </form>
                <ol class="chat" v-if="inferences">
                  <li v-for="(inference, index) in inferences">
                    <p class="question">
                      {{ inference.question }}
                      <button
                        class="button is-small is-success copy is-pulled-right"
                        @click="
                          copy(inference.question);
                          hasCopy[index] = true;
                        "
                        v-if="!hasCopy[index]"
                      >
                        <span class="material-symbols-outlined">
                          content_copy
                        </span>
                        Copy
                      </button>
                      <button
                        class="button is-small is-outlined copy is-pulled-right"
                        @click="copy(inference.question.text)"
                        v-if="hasCopy[index] && hasCopy[index] == true"
                      >
                        <span class="material-symbols-outlined">check</span>
                      </button>
                    </p>
                  </li>
                </ol>
              </div>
            </div>
          </div>
          <div class="models__activity--payouts mt-5">
            <div class="columns">
              <h1 class="column is-12 has-text-centered">
                <span
                  class="material-symbols-outlined p-0 m-5"
                  style="font-size: 92px !important"
                >
                  movie
                </span>
              </h1>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, toRaw } from "vue";
import { v4 as uuid } from "uuid";
import VueMarkdown from "vue-markdown-render";
import useClipboard from "vue-clipboard3";

export default {
  name: "GenerativeVideo",
  components: {
    VueMarkdown,
  },
  setup() {
    const mode = ref('turbo');
    const quality = ref("low");
    const isLoading = ref(false);
    const isModel = ref(false);
    const openModel = ref(false);
    const openChat = ref(false);
    const availableModels = ref({
      flux: {
        modelname: "Flux.1-schnell",
        modeldesc: `A 12 billion parameter rectified flow transformer capable of generating images from text descriptions.`,
        url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell",
        filename: "flux.gguf",
        filesize: "25 GB",
      },
    });

    const currentModel = ref({
      modelname: "Flux.1-schnell",
      modeldesc: `A 12 billion parameter rectified flow transformer capable of generating images from text descriptions.`,
      url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell",
      filename: "flux.gguf",
      filesize: "25 GB",
    });

    const pickModel = async (model) => {
      currentModel.value = { ...model };
      await isModelAvailable(model.filename);
    };

    const isModelAvailable = async (filename) => {
      const isModelAvailable = await window.electronAPI.checkModel(filename);
      isModel.value = isModelAvailable;
      return isModel;
    };

    const loadModel = async (filename) => {
      await window.electronAPI.loadModel(filename);
    };

    const inferences = reactive([]);

    const hasCopy = reactive([]);

    const initialState = {
      prompt: "",
    };

    const form = reactive({ ...initialState });

    function resetForm() {
      Object.assign(form, initialState);
    }

    function resetChat() {
      inferences.splice(0);
    }

    const sendMessage = async (prompt) => {
      isLoading.value = true;

      try {
        // Your POST payload
        const payload = {
          prompt: prompt,
        };

        switch (quality.value) {
          case "low":
            payload.height = 320;
            payload.width = 512;
            break;
          case "medium":
            payload.height = 480;
            payload.width = 640;
            break;
          case "high":
            payload.height = 768;
            payload.width = 1024;
            break;
          default:
            payload.height = 320;
            payload.width = 512;
            break;
        }

        payload.frames = 72;
        payload.fps = 24;
        payload.steps = 100;

        console.log("Generating video using the following payload:", payload);

        // Make the POST request to your endpoint
        const response = await axios.post(
          "http://127.0.0.1:65000/video/" + mode.value,
          payload
        );

        // Set the response data (base64 string) to the component's data property
        imageGeneration.value = response.data.image;
        inferences.push({ question: prompt, answer: response });
        console.log("inferences", inferences);
        resetForm();
        isLoading.value = false;
      } catch (error) {
        console.error("Error generating image:", error);

        isLoading.value = false;
      }
    };

    const { toClipboard } = useClipboard();

    const copy = async (answer) => {
      try {
        await toClipboard(answer);
        console.log("Answered copied to clipboard.");
      } catch (e) {
        console.error(e);
      }
    };

    return {
      mode,
      quality,
      isLoading,
      isModel,
      availableModels,
      currentModel,
      isModelAvailable,
      pickModel,
      loadModel,
      openModel,
      openChat,
      form,
      sendMessage,
      inferences,
      resetChat,
      copy,
      hasCopy,
    };
  },
  async mounted() {
    const readyToPrompt = await this.isModelAvailable(
      this.currentModel.filename
    );
    console.log("Ready to prompt, sir.", readyToPrompt);
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");

.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;

  border-radius: 100%;
}

.columns {
  position: relative !important;
}

.container {
  max-width: 100% important;
}

.background {
  position: absolute;
  z-index: -1;
  height: 100%;
  width: 100%;
  background: url("https://www.bonzai.sh/bonzai_video.jpg") no-repeat;
  background-size: cover;
  filter: blur(6px);
  animation: move 40s ease infinite;
  overflow: hidden;
}

.shade {
  position: absolute;
  width: 100% !important;
  height: 100% !important;
  background: rgba(0, 0, 0, 0.5);
  z-index: -1;
}

.models__deployment {
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
}

.models__deployment-install {
  overflow-y: auto;
  padding: 6em;
  /* aspect-ratio: 16/9; */
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
}

.models__activity--payouts {
  padding: 4em;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
  border-radius: 4px !important;
}

h1 {
  margin-top: 0 !important;
  font-size: 64px;
  color: #fff;
  text-align: right;
}

h2 {
  font-size: 48px;
  color: #fff;
  text-align: right;
}

p {
  margin-bottom: 1em;
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

p.desc {
  font-size: 32px;
  border-bottom: 32px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 4px;
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
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 1em;
  box-shadow: -8px 8px 0 rgba(57, 213, 130, 0.25);
  border-radius: 4px;
  backdrop-filter: blur(6px);
  background: rgba(255, 255, 255, 0.1);

  strong {
    color: rgba(57, 213, 130, 0.75);
  }
}

div.answer p {
  margin-bottom: 0 !important;
}

span.answer__id {
  display: block;
  position: absolute;
  top: 0;
  right: 0;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.25);
}

.models__deployment-install .card {
  margin: 5em;
}

.filesize {
  position: absolute;
  top: -10px;
  right: -10px;
  padding: 5px 10px;
  font-size: 20px;
  color: rgba(255, 255, 255, 1);
  background: rgba(255, 255, 255, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  backdrop-filter: blur(32px) !important;
}

.models__deployment-use {
  position: absolute;
  z-index: 111;
  left: 0;
  top: 0;
  height: 100%;
  width: 100%;
  padding: 6em;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  transform: translate3d(0, 0, 0);
  overflow: auto;
}

form {
  position: relative;
}

.input {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  transition: 200ms ease-in;
  transform: translate3d(0, 0, 0);
}

::placeholder {
  color: rgba(255, 255, 255, 0.1) !important;
  opacity: 1 !important;
}

.button.chat.is-loading {
  position: absolute;
  width: 32px;
  height: 32px;
  right: 10px;
  bottom: 14px;
  border: none !important;
  box-shadow: none !important;
}

.is-loading {
  text-shadow: none !important;
}

input[type="radio"] {
  display: none;
}

input[type="radio"] + label {
  padding: 3px 12px 9px;
  color: rgba(255, 255, 255, 0.3) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

input[type="radio"]:checked + label {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: rgba(97, 55, 142, 0.33) !important;
  backdrop-filter: blur(64px) !important;
}

label.radio.quality {
  margin: 0 3px;
  padding: 3px 6px 0;
}

ul,
ol {
  padding: 0;
  list-style-type: none;
}

ol.chat {
  display: flex;
  flex-direction: column-reverse;
}

ol.chat li {
  position: relative;
}
</style>
