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
                    3d_rotation
                  </span>
                  Generative Game
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
                <form ref="promptForm" @submit.prevent>
                  <textarea
                    class="input is-large is-fullwidth"
                    type="text"
                    placeholder="Describe your three-dimensional asset and press enter to generate..."
                    v-model="form.prompt"
                    @keyup.enter.native="sendMessage(form.prompt)"
                    :disabled="isLoading"
                    style="min-height: 4.2em"
                  ></textarea>
                  <button
                    class="button chat is-loading is-outlined is-info is-large is-fullwidth"
                    v-if="isLoading"
                  ></button>
                </form>
                <ThreeViewer ref="threeViewer" />
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
import ThreeViewer from "./ThreeViewer.vue";
import * as THREE from "three";


export default {
  name: "Generative3D",
  components: {
    VueMarkdown,
    ThreeViewer,
  },
  setup() {
    const mode = ref("turbo");
    const quality = ref("sd");
    const imageGeneration = ref("");
    const isLoading = ref(false);
    const isModel = ref(false);
    const openModel = ref(false);
    const openChat = ref(false);

    const threeViewer = ref(null);

    const availableModels = ref({
      deepseek_1_5_B: {
        modelname: "DeepSeek R1 1.5B",
        modeldesc: `A 1.5B parameters dense model distilled from DeepSeek-R1, based on popular open source model Qwen. DeepSeek-R1 achieves performance comparable to OpenAI-o1 across math, code, and reasoning tasks.`,
        url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        filename: "DeepSeek-R1-Distill-Qwen-1.5B-Q6_K.gguf",
        filesize: "1.46 GB",
      },
    });

    const currentModel = ref({
      modelname: "DeepSeek R1 1.5B",
      modeldesc: `A 1.5B parameters dense model distilled from DeepSeek-R1, based on popular open source model Qwen. DeepSeek-R1 achieves performance comparable to OpenAI-o1 across math, code, and reasoning tasks.`,
      url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
      filename: "DeepSeek-R1-Distill-Qwen-1.5B-Q6_K.gguf",
      filesize: "1.46 GB",
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

    // Provided sendMessage function, updated to dynamically update the ThreeDViewer
    const sendMessage = async (prompt) => {
      isLoading.value = true;
      try {
        // Use form.prompt instead of form.value.prompt
        const assistantResult = await window.electronAPI.chat(form.prompt);
        const assistantMessage = {
          id: uuid(),
          text: assistantResult,
        };

        let cleanedCode = assistantMessage.text.replace(/```/g, "");
        cleanedCode = cleanedCode.replace(/javascript/g, "");
        cleanedCode = cleanedCode.replace(/json/g, "");

        console.log("prompt", cleanedCode);
        inferences.push({ question: prompt, answer: assistantMessage });
        resetForm();
        isLoading.value = false;
        if (threeViewer.value) {
          threeViewer.value.replaceObject(cleanedCode);
        } else {
          console.error("threeViewer is not defined.");
        }
      } catch (e) {
        isLoading.value = false;
        console.error("Error sending message", e);
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
      threeViewer
    };
  },
  async mounted() {
    const readyToPrompt = await this.isModelAvailable(
      this.currentModel.filename
    );
    console.log("Ready to prompt, sir.", readyToPrompt);

    // this.loadModel("DeepSeek-R1-Distill-Qwen-1.5B-Q6_K.gguf");
    this.loadModel("llama3.gguf");
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
  background: url("../assets/bonzai_3d.jpg") no-repeat;
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
  padding: 1em 1em 2.25em;
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
