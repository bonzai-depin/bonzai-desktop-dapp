<template>
  <div class="background"></div>
  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12 p-5">
          <div class="level">
            <div class="level-left">
              <div class="level-item" style="position: relative">
                <h1 class="fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined is-size-1 mr-2"
                    style="font-size: 92px !important"
                  >
                    neurology
                  </span>
                  {{ currentModel.modelname }}
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
          <p class="desc">
            {{ currentModel.modeldesc }}
          </p>
          <div class="models__deployment-install--cta has-text-right p-0">
            <button
              class="button is-success is-large fira-sans-condensed-black-italic mr-5"
              :class="{ 'is-loading': isLoading }"
              :disabled="isLoading"
              @click="downloadModel(currentModel.url, currentModel.filename)"
              v-if="!isModel"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">
                deployed_code_update
              </span>
              Download
              <span
                class="filesize"
                style="
                  font-size: 15px;
                  top: -20px;
                  right: -25px;
                  text-shadow: none;
                "
                v-if="downloadProgress"
              >
                {{ downloadProgress }}%
              </span>
              <span
                v-else
                class="filesize"
                style="
                  font-size: 15px;
                  top: -20px;
                  right: -25px;
                  text-shadow: none;
                "
              >
                {{ currentModel.filesize }}
              </span>
            </button>
            <button
              class="button is-danger is-large fira-sans-condensed-black-italic mr-5"
              :class="{ 'is-loading': isLoading }"
              :disabled="isLoading"
              @click="deleteModel(currentModel.filename)"
              v-if="isModel"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">
                delete
              </span>
              Delete
              <span
                class="filesize"
                style="font-size: 15px; top: -20px; right: -25px"
              >
                {{ currentModel.filesize }}
              </span>
            </button>
            <button
              class="button is-success is-large fira-sans-condensed-black-italic ml-5 mr-5"
              v-if="!isLoading && isModel"
              @click="
                openChat = true;
                loadModel(currentModel.filename);
              "
            >
              <span class="material-symbols-outlined is-size-3 mr-2">
                forum
              </span>
              Chat with {{ currentModel.modelname }}
            </button>
            <button
              class="button is-success is-large fira-sans-condensed-black-italic ml-5"
              disabled
            >
              <span class="material-symbols-outlined is-size-3 mr-2">
                public
              </span>
              Serve to Peers
            </button>
          </div>
        </div>
      </div>
      <div class="models__activity has-text-left mt-5 pt-5">
        <div class="models__activity--payouts">
          <div class="level">
            <div class="level-left">
              <div class="level-item">
                <h2 class="fira-sans-condensed-black-italic has-text-left mt-0">
                  <span class="material-symbols-outlined is-size-1 mr-2">
                    trophy
                  </span>
                  Payout History
                </h2>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <a
                  href="https://app.uniswap.org/swap?chain=arbitrum&outputCurrency=0x0a84edf70f30325151631ce7a61307d1f4d619a3"
                  target="_blank"
                  class="button is-info is-outlined is-medium is-fullwidth-mobile"
                >
                  <span class="material-symbols-outlined mr-2">
                    shopping_cart
                  </span>
                  Buy BONZAI
                </a>
              </div>
            </div>
          </div>
          <p>
            Serve
            <span class="fira-sans-condensed-black-italic">
              {{ currentModel.modelname }}
            </span>
            to Peers to earn
            <span class="fira-sans-condensed-black-italic">$TAO</span>
            .
          </p>
        </div>
        <div class="models__activity--payouts mt-5">
          <div class="level">
            <div class="level-left">
              <div class="level-item">
                <h2
                  class="fira-sans-condensed-black-italic has-text-left mt-0"
                  v-if="inferences"
                >
                  <span class="material-symbols-outlined is-size-1 mr-2">
                    forum
                  </span>
                  Chat History
                </h2>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button
                  class="button is-info is-danger is-medium is-fullwidth-mobile"
                  @click="resetChat()"
                >
                  <span class="material-symbols-outlined mr-2">ink_eraser</span>
                  Clear
                </button>
              </div>
            </div>
          </div>
          <ol class="chat" v-if="inferences && inferences.length > 0">
            <li v-for="(inference, index) in inferences">
              <p class="question">{{ inference.question }}</p>
              <div class="answer" style="white-space: pre-line">
                <vue-markdown :source="inference.answer.text" />
                <button
                  class="button is-medium is-success copy is-pulled-right"
                  @click="
                    copy(inference.answer.text);
                    hasCopy[index] = true;
                  "
                  v-if="!hasCopy[index]"
                >
                  <span class="material-symbols-outlined">content_copy</span>
                  Copy
                </button>
                <button
                  class="button is-medium is-outlined copy is-pulled-right"
                  @click="copy(inference.answer.text)"
                  v-if="hasCopy[index] && hasCopy[index] == true"
                >
                  <span class="material-symbols-outlined">check</span>
                </button>
              </div>
              <span class="answer__id"># {{ inference.answer.id }}</span>
            </li>
          </ol>
          <p v-else>
            <span v-if="isModel">
              Chat with
              <span class="fira-sans-condensed-black-italic">
                {{ currentModel.modelname }}
              </span>
              to get started.
            </span>
            <span v-else>
              Download
              <span class="fira-sans-condensed-black-italic">
                {{ currentModel.modelname }}
              </span>
              to get started.
            </span>
          </p>
        </div>
      </div>
    </div>
    <div class="models__deployment-use" v-if="openModel">
      <div class="columns">
        <div class="column is-12 p-5">
          <div class="level">
            <div class="level-left">
              <div class="level-item">
                <h1 class="fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined is-size-1 mr-2"
                    style="font-size: 92px !important"
                  >
                    folder_open
                  </span>
                  Pick a Model
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button
                  class="button is-outlined is-info is-large fira-sans-condensed-black-italic ml-5"
                  @click="openModel = false"
                >
                  <span class="material-symbols-outlined is-size-1">Close</span>
                </button>
              </div>
            </div>
          </div>
          <ul class="columns is-multiline has-text-left">
            <li class="column is-6" v-for="model in availableModels">
              <button
                class="button is-outlined is-info is-large fira-sans-condensed-black-italic is-size-3 is-fullwidth"
                @click="
                  pickModel(model);
                  openModel = false;
                "
                style="justify-content: left"
              >
                <span class="material-symbols-outlined is-size-2 mr-2">
                  neurology
                </span>
                {{ model.modelname }}
                <span class="filesize">{{ model.filesize }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="models__deployment-use" v-if="openChat">
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
                    chat
                  </span>
                  Chat with {{ currentModel.modelname }}
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button
                  class="button is-outlined is-info is-large fira-sans-condensed-black-italic ml-5"
                  @click="openChat = false"
                >
                  <span class="material-symbols-outlined is-size-1">Close</span>
                </button>
              </div>
            </div>
          </div>
          <form ref="promptForm" @submit.prevent>
            <input
              class="input is-large is-fullwidth"
              type="text"
              placeholder="Ask me something and press enter..."
              v-model="form.prompt"
              @keyup.enter.native="sendMessage(form.prompt)"
              :disabled="isLoading"
            />
            <button
              class="button chat is-loading is-outlined is-info is-large is-fullwidth"
              v-if="isLoading"
            ></button>
          </form>
          <ol class="chat" v-if="inferences && inferences.length > 0">
            <li v-for="(inference, index) in inferences">
              <p class="question">{{ inference.question }}</p>
              <div class="answer" style="white-space: pre-line">
                <vue-markdown :source="inference.answer.text" />
                <button
                  class="button is-medium is-success copy is-pulled-right"
                  @click="
                    copy(inference.answer.text);
                    hasCopy[index] = true;
                  "
                  v-if="!hasCopy[index]"
                >
                  <span class="material-symbols-outlined">content_copy</span>
                  Copy
                </button>
                <button
                  class="button is-medium is-outlined copy is-pulled-right"
                  @click="copy(inference.answer.text)"
                  v-if="hasCopy[index] && hasCopy[index] == true"
                >
                  <span class="material-symbols-outlined">check</span>
                </button>
              </div>
              <span class="answer__id"># {{ inference.answer.id }}</span>
            </li>
          </ol>
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

import GenerativeImage from "./GenerativeImage.vue";

export default {
  name: "GenerativeText",
  components: {
    VueMarkdown,
    GenerativeImage,
  },
  setup() {
    const downloadProgress = ref(0);
    const isLoading = ref(false);
    const isModel = ref(false);
    const openModel = ref(false);
    const openChat = ref(false);
    const availableModels = ref({
      deepseek_1_5_B: {
        modelname: "DeepSeek R1 1.5B",
        modeldesc: `A 1.5B parameters dense model distilled from DeepSeek-R1, based on popular open source model Qwen. DeepSeek-R1 achieves performance comparable to OpenAI-o1 across math, code, and reasoning tasks.`,
        url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        filename: "DeepSeek-R1-Distill-Qwen-1.5B-Q6_K.gguf",
        filesize: "1.46 GB",
      },
      deepseek_7_B: {
        modelname: "DeepSeek R1 7B",
        modeldesc: `A 7B parameters dense model distilled from DeepSeek-R1, based on popular open source model Qwen. DeepSeek-R1 achieves performance comparable to OpenAI-o1 across math, code, and reasoning tasks.`,
        url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        filename: "DeepSeek-R1-Distill-Qwen-7B-Q6_K.gguf",
        filesize: "6.25 GB",
      },
      deepseek_14_B: {
        modelname: "DeepSeek R1 14B",
        modeldesc: `A 14B parameters dense model distilled from DeepSeek-R1, based on popular open source model Qwen. DeepSeek-R1 achieves performance comparable to OpenAI-o1 across math, code, and reasoning tasks.`,
        url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        filename: "DeepSeek-R1-Distill-Qwen-14B-Q6_K.gguf",
        filesize: "12.12 GB",
      },
      deepseek_32_B: {
        modelname: "DeepSeek R1 32B",
        modeldesc: `A 32B parameters dense model distilled from DeepSeek-R1, based on popular open source model Qwen. DeepSeek-R1 achieves performance comparable to OpenAI-o1 across math, code, and reasoning tasks.`,
        url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        filename: "DeepSeek-R1-Distill-Qwen-32B-Q6_K.gguf",
        filesize: "26.89 GB",
      },
      phi: {
        modelname: "Phi 3.8B",
        modeldesc: `A 3.8B parameters LLM model built by Microsoft. Phi is a lightweight, state-of-the-art open model trained with synthetic data and high-quality publicly available websites data.`,
        url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
        filename: "phi.gguf",
        filesize: "2.39 GB",
      },
      llama2: {
        modelname: "LLaMA 2 7B",
        modeldesc: `A 7B parameters LLM model built by Meta.`,
        url: "https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf",
        filename: "llama2.gguf",
        filesize: "4.08 GB",
      },
      llama3: {
        modelname: "LLaMA 3.1 8B",
        modeldesc: `A 8B parameters LLM model built by Meta.`,
        url: "https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
        filename: "llama3.gguf",
        filesize: "4.92 GB",
      },
      mistral: {
        modelname: "Mistral 7B",
        modeldesc: `A 7B parameters LLM model built by Mistral AI, the French OpenAI.`,
        url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        filename: "llama2.gguf",
        filesize: "4.37 GB",
      },
      qwen_coder: {
        modelname: "Qwen Coder 3 30B",
        modeldesc: `A 30B parameters LLM model dedicated to code generation, built by Alibaba.`,
        filename: "Qwen3-Coder-30B-A3B-Instruct-Q3_K_S.gguf",
        filesize: "13.29 GB",
      }
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

    const downloadModel = async (url, filename) => {
      isLoading.value = true;

      console.log("Now downloading model...", url, filename);
      downloadProgress.value = 0;

      window.electronAPI.onDownloadProgress((e, data) => {
        if (data.filename === currentModel.value.filename) {
          downloadProgress.value = Math.round(data.percent * 100);
        }
      });

      const success = await window.electronAPI.downloadModel(url, filename);
      isLoading.value = false;
      downloadProgress.value = 0;

      if (success) {
        isModel.value = true;
        console.log("Model download success!");
      } else {
        console.error("Model download failure...");
      }
      isLoading.value = false;
    };

    const deleteModel = async (filename) => {
      isLoading.value = true;
      const success = await window.electronAPI.deleteModel(filename);
      console.log("Now deleting model...", filename);
      if (success) {
        isModel.value = false;
        console.log("Model deleting success!");
      } else {
        console.error("Model deleting failure...");
      }
      isLoading.value = false;
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
        // Inference
        const assistantResult = await window.electronAPI.chat(form.prompt);

        const assistantMessage = {
          id: uuid(),
          text: assistantResult,
          // role: MessageRole.Assistant,
        };

        console.log("prompt", assistantMessage);
        inferences.push({ question: prompt, answer: assistantMessage });
        resetForm();
        isLoading.value = false;
      } catch (e) {
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
      downloadProgress,
      isLoading,
      isModel,
      availableModels,
      currentModel,
      isModelAvailable,
      pickModel,
      downloadModel,
      deleteModel,
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
  background: url("https://www.bonzai.sh/bonzai_chat.jpg") no-repeat;
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
  cursor: not-allowed;
  transition: 400ms ease-in;
  transform: translate3d(0, 0, 0);
}

.tabs li:not(.is-active):hover {
  filter: none;
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
  margin-bottom: 3em;
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
  margin-bottom: 2em;
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
