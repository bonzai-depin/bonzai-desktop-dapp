<template scoped>
  <div class="background"></div>
  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12 p-5">
          <div class="level">
                  <div class="level-left">
                    <div class="level-item">
                      <h1 class="fira-sans-condensed-black-italic">
                        <span
                          class="material-symbols-outlined mr-2"
                          style="font-size: 92px !important"
                        >
                          image
                        </span>
                        Generative Image
                      </h1>
                    </div>
                  </div>
                  <div class="level-right">
                    <div class="level-item">
                      <button
                        class="button is-outlined is-info is-large fira-sans-condensed-black-italic ml-5"
                        @click="openModel = true"
                      >
                        <span class="material-symbols-outlined is-size-1">
                          folder_open
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <div class="control mb-5 has-text-left">
                  <input
                    v-model="mode"
                    :value="'turbo'"
                    id="mode_speed"
                    type="radio"
                    name="mode"
                    checked
                  />
                  <label for="mode_speed" class="radio mr-2">
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
                    :value="'intermediate'"
                    id="mode_intermediate"
                    type="radio"
                    name="mode"
                  />
                  <label for="mode_intermediate" class="radio mr-2">
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 32px !important"
                    >
                      balance
                    </span>
                    Balanced
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
                  <span class="control" v-if="mode != 'turbo'">
                    <input
                      v-model="quality"
                      :value="'sd'"
                      id="mode_quality_sd"
                      type="radio"
                      name="mode_quality"
                      checked
                    />
                    <label for="mode_quality_sd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        sd
                      </span>
                    </label>
                    <input
                      v-model="quality"
                      :value="'hd'"
                      id="mode_quality_hd"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_hd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        hd
                      </span>
                    </label>
                    <input
                      v-model="quality"
                      :value="'fhd'"
                      id="mode_quality_fhd"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_fhd" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        full_hd
                      </span>
                    </label>
                    <input
                      v-model="quality"
                      :value="'2k'"
                      id="mode_quality_2k"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_2k" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        2k
                      </span>
                    </label>
                    <input
                      v-model="quality"
                      :value="'4k'"
                      id="mode_quality_4k"
                      type="radio"
                      name="mode_quality"
                    />
                    <label for="mode_quality_4k" class="radio quality">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        4k
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
                      <div class="logo watermark" style="position: absolute; width: 128px; bottom: 4.5em; right: 1em;"><img src="https://www.bonzai.sh/bonzai_logo-full.png" /></div>
                      <img class="generated__image" :src="'data:image/png;base64,' +inference.answer.data.image"   />
                      <hr />
                      <button
                        class="button is-medium is-warning copy is-pulled-left ml-5 mr-0"
                        style="border-bottom-width: 4px; border-color: rgba(0, 0, 0, 0.7); height: 2.65em;"
                        @click="copy(inference.question.text)"
                      >
                        <span class="material-symbols-outlined mr-1 is-size-1">branding_watermark</span>Remove Watermark
                      </button>
                      <button
                        class="button is-medium is-success copy is-pulled-right ml-5 mr-0"
                        @click="copy(inference.question.text)"
                      >
                        <span class="material-symbols-outlined is-size-1">save</span>
                      </button>
                      <button
                        class="button is-medium is-success copy is-pulled-left"
                        @click="
                          copy(inference.question);
                          hasCopy[index] = true;
                        "
                        v-if="!hasCopy[index]"
                      >
                        <span class="material-symbols-outlined is-size-1">
                          content_copy
                        </span>
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
import axios from "axios";

export default {
  name: "GenerativeImage",
  components: {
    VueMarkdown,
  },
  setup() {
    const mode = ref("turbo");
    const quality = ref("sd");
    const imageGeneration = ref("");
    const isLoading = ref(false);
    const isModel = ref(false);
    const openModel = ref(false);
    const openChat = ref(false);
    const availableModels = ref({
      flux: {
        modelname: "Flux.1-schnell",
        modeldesc: `A 12 billion parameter rectified flow transformer capable of generating images from text descriptions.`,
        url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell",
        filename: "pixelwave_flux1_schnell_04_Q6_K_M.gguf",
        filesize: "12 GB",
      },
    });

    const currentModel = ref({
      modelname: "Flux.1-schnell",
      modeldesc: `A 12 billion parameter rectified flow transformer capable of generating images from text descriptions.`,
      url: "https://huggingface.co/black-forest-labs/FLUX.1-schnell",
      filename: "pixelwave_flux1_schnell_04_Q6_K_M.gguf",
      filesize: "12 GB",
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
        
        switch(quality.value) {
          case "sd":
            payload.height=480;
            payload.width=640;
            break;
            case "hd":
            payload.height=720;
            payload.width=1280;
            break;
            case "fhd":
            payload.height=1080;
            payload.width=1920;
            break;
            case "2k":
            payload.height=1440;
            payload.width=2560;
            break;
            case "4k":
            payload.height=2160;
            payload.width=4096;
            break;
            default:
            payload.height=480;
            payload.width=640;
            break
        }

        console.log('Generating image using the following payload:', payload);

        // Make the POST request to your endpoint
        const response = await axios.post(
          "http://127.0.0.1:65000/image/"+mode.value,
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
      imageGeneration,
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
  background: url("https://www.bonzai.sh/bonzai_image.jpg") no-repeat;
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

.generated__image {
  width: 100% !important;
  height: 100% !important;
  border: 1px solid rgba(255, 255, 255, 1);
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
  padding: 1em 1em 3.5em;
  margin-top: 2em !important;
  margin-bottom: 1em !important;
  font-weight: 700;
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  border-radius: 4px;
  backdrop-filter: blur(6px);
}

p.question .generated__image {
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
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

hr {
  margin: 12px 0;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.015);
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
