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
                    style="font-size: 64px !important"
                  >
                    hub
                  </span>
                  Smart Agents
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button class="button chat is-warning is-large">
                  <span class="material-symbols-outlined is-size-3 mr-2">
                    send_money
                  </span>
                  STAKE BONZAI
                </button>
              </div>
            </div>
          </div>
          <div class="tabs is-large is-fullwidth">
            <ul>
              <li class="is-active">
                <a class="fira-sans-condensed-black-italic">
                  <span class="material-symbols-outlined is-size-1 mr-2 mb-2">
                    shopping_cart
                  </span>
                  Buy
                </a>
              </li>
              <li>
                <a class="fira-sans-condensed-black-italic">
                  <span class="material-symbols-outlined is-size-1 mr-2 mb-2">
                    storefront
                  </span>
                  Sell
                </a>
              </li>
              <li>
                <a class="fira-sans-condensed-black-italic">
                  <span class="material-symbols-outlined is-size-1 mr-2 mb-2">
                    auto_read_play
                  </span>
                  Run
                </a>
              </li>
            </ul>
          </div>
          <div class="models__activity--payouts">
            <div class="columns">
              <div class="column is-12">
                <div
                  class="columns is-8 is-multiline control mb-5 has-text-left"
                >
                <div class="bonzai__agent column is-4">
                    <input
                      v-model="mode"
                      :value="'agent_chat_network_bittensor'"
                      id="agent_chat_network_bittensor"
                      type="radio"
                      name="mode"
                      checked
                    />
                    <label for="agent_chat_network_bittensor" class="radio">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        analytics
                      </span>
                      Copy Swap
                      <div class="tags has-addons">
                        <span
                          class="tag partner fira-sans-condensed-black-italic"
                        >
                          Arbitrum
                        </span>
                        <span
                          class="tag is-info partner fira-sans-condensed-black-italic"
                        >
                          Online
                        </span>
                      </div>
                    </label>
                  </div>
                  <div class="bonzai__agent column is-8">
                    <div class="control has-text-right">
                      <button class="button chat is-success is-medium">
                        <span class="material-symbols-outlined is-size-3 mr-2">
                          shopping_cart
                        </span>
                        Buy
                        <div class="tags has-addons">
                          <span
                            class="tag is-warning partner fira-sans-condensed-black-italic"
                          >
                            0.1 ETH
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                  <ol class="bonzai__agent column is-12 description ">
                    <hr />
                    <li><p><span class="fira-sans-condensed-black-italic mr-2">Step 1.</span>Spot the top perfoming onchain assets.</p></li>
                    <li><p><span class="fira-sans-condensed-black-italic mr-2">Step 2.</span>Spot the top performing traders in Step 1.</p></li>
                    <li><p><span class="fira-sans-condensed-black-italic mr-2">Step 3.</span>Spot the latest onchain swaps of the top performing traders in Step 2.</p></li>
                    <li><p><span class="fira-sans-condensed-black-italic mr-2">Step 4.</span>Copy the latest onchain swaps spotted in Step 3.</p></li>
                  </ol>
                  <!-- <div class="bonzai__agent column is-4">
                    <input
                      v-model="mode"
                      :value="'agent_chat_code_solidity'"
                      id="agent_chat_code_solidity"
                      type="radio"
                      name="mode"
                      checked
                    />
                    <label for="agent_chat_code_solidity" class="radio">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        code
                      </span>
                      Chat with Smart Contracts
                      <div class="tags has-addons">
                        <span
                          class="tag partner fira-sans-condensed-black-italic"
                        >
                          Arbitrum
                        </span>
                        <span
                          class="tag is-info partner fira-sans-condensed-black-italic"
                        >
                          Online
                        </span>
                      </div>
                    </label>
                  </div>
                  <div class="bonzai__agent column is-8">
                    <div class="control has-text-right">
                      <button class="button chat is-success is-medium">
                        <span class="material-symbols-outlined is-size-3 mr-2">
                          work
                        </span>
                        Hire Agent
                        <div class="tags has-addons">
                          <span
                            class="tag is-warning partner fira-sans-condensed-black-italic"
                          >
                            5K BONZAI to
                            <span class="material-symbols-outlined is-size-5">
                              lock_open_right
                            </span>
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                  <hr />
                  <div class="bonzai__agent column is-4">
                    <input
                      v-model="mode"
                      :value="'agent_chat_network_bittensor'"
                      id="agent_chat_network_bittensor"
                      type="radio"
                      name="mode"
                      checked
                    />
                    <label for="agent_chat_network_bittensor" class="radio">
                      <span
                        class="material-symbols-outlined"
                        style="font-size: 32px !important"
                      >
                        analytics
                      </span>
                      Chat with Analytics
                      <div class="tags has-addons">
                        <span
                          class="tag partner fira-sans-condensed-black-italic"
                        >
                          Bittensor
                        </span>
                        <span
                          class="tag is-info partner fira-sans-condensed-black-italic"
                        >
                          Online
                        </span>
                      </div>
                    </label>
                  </div>
                  <div class="bonzai__agent column is-8">
                    <div class="control has-text-right">
                      <button class="button chat is-success is-medium">
                        <span class="material-symbols-outlined is-size-3 mr-2">
                          work
                        </span>
                        Hire Agent
                        <div class="tags has-addons">
                          <span
                            class="tag is-warning partner fira-sans-condensed-black-italic"
                          >
                            33K BONZAI to
                            <span class="material-symbols-outlined is-size-5">
                              lock_open_right
                            </span>
                          </span>
                        </div>
                      </button>
                    </div>
                  </div> -->
                </div>
              </div>
            </div>
          </div>
          <!-- <div class="models__activity--payouts mt-5">
            <div class="columns is-multiline">
              <div class="column is-12 has-text-left">
                <div class="level">
                  <div class="level-left">
                    <div class="level-item">
                      <h2
                        class="fira-sans-condensed-black-italic has-text-left mt-0"
                      >
                        <span class="material-symbols-outlined is-size-1 mr-2">
                          automation
                        </span>
                        My Agents
                      </h2>
                    </div>
                  </div>
                </div>
              </div>
              <div class="column is-12 has-text-left">
                <p>
                  Hire
                  <span class="fira-sans-condensed-black-italic">
                    your 1st smart agent
                  </span>
                  to start
                  <span class="fira-sans-condensed-black-italic">
                    automating your life
                  </span>
                  .
                </p>
              </div>
            </div>
          </div> -->
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
  name: "SmartAgent",
  components: {
    VueMarkdown,
  },
  setup() {
    const mode = ref("chat");
    const quality = ref("sd");
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
  background: url("https://www.bonzai.sh/bonzai_agent.jpg") no-repeat;
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

.tabs a {
  color: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

.tabs a:hover {
  color: rgba(255, 255, 255, 1);
  border-color: rgba(255, 255, 255, 1);
}

.tabs li.is-active a {
  color: #ffe08a;
  border-color: #ffe08a;
}

hr {
  margin: 12px 0;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.015);
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

.bonzai__agent {
}

input[type="radio"] + label {
  padding: 3px 12px 9px;
  width: 100%;
  height: 100%;
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

.tags {
  position: absolute;
  top: -15px;
  right: -8px;
  text-shadow: none;
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
