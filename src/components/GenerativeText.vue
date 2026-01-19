<template>
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
                loadModel(currentModel);
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
            <span class="fira-sans-condensed-black-italic">$USDC</span>
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
              <div class="level-item buttons">
                <button
                  class="button is-warning is-small"
                  @click="importHistory()"
                >
                  <span class="material-symbols-outlined mr-2">upload</span>
                  Import
                </button>
                <button
                  class="button is-warning is-small ml-4"
                  @click="exportHistory()"
                  :disabled="!inferences || inferences.length === 0"
                >
                  <span class="material-symbols-outlined mr-2">download</span>
                  Export
                </button>
                <button
                  class="button is-danger is-small ml-4"
                  @click="resetChat()"
                >
                  <span class="material-symbols-outlined mr-2">ink_eraser</span>
                  Clear
                </button>
              </div>
            </div>
          </div>
          <ol class="chat" v-if="inferences && inferences.length > 0">
            <li
              v-for="(inference, displayIndex) in paginatedInferences"
              :key="inference._originalIndex"
              class="history-item"
              :style="{ animationDelay: `${Math.min(displayIndex * 50, 500)}ms` }"
            >
              <p class="question">{{ inference.question }}</p>
              <div class="answer" style="white-space: pre-line">
                <vue-markdown :source="inference.answer.text" />
                <button
                  class="button is-medium is-success copy is-pulled-right"
                  @click="
                    copy(inference.answer.text);
                    hasCopy[inference._originalIndex] = true;
                  "
                  v-if="!hasCopy[inference._originalIndex]"
                >
                  <span class="material-symbols-outlined">content_copy</span>
                  Copy
                </button>
                <button
                  class="button is-medium is-outlined copy is-pulled-right"
                  @click="copy(inference.answer.text)"
                  v-if="hasCopy[inference._originalIndex] && hasCopy[inference._originalIndex] == true"
                >
                  <span class="material-symbols-outlined">check</span>
                </button>
              </div>
              <span class="answer__id"># {{ inference.answer.id }}</span>
            </li>
          </ol>
          <!-- LAZY LOAD SENTINEL -->
          <div
            ref="loadMoreSentinel"
            v-if="hasMore && inferences.length > 0"
            class="load-more-sentinel has-text-centered p-4"
          >
            <span v-if="isLoadingMore" class="has-text-grey">
              Loading more...
            </span>
          </div>

          <!-- SCROLL TO TOP BUTTON -->
          <button
            v-if="showScrollTop"
            class="scroll-to-top-btn"
            @click="scrollToTop"
            title="Scroll to top"
          >
            <span class="material-symbols-outlined">arrow_upward</span>
          </button>
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
                  class="button is-danger is-large"
                  @click="openModel = false"
                >
                  <span class="material-symbols-outlined is-size-1">close</span>
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
                  class="button is-danger is-large"
                  @click="openChat = false"
                >
                  <span class="material-symbols-outlined is-size-1">close</span>
                </button>
              </div>
            </div>
          </div>
          <!-- ACCESS REQUIREMENTS -->
          <AccessRequirements
            ref="accessRef"
            level="LVL1"
            :demo-prompt="DEMO_PROMPT"
            :is-generating="isLoading"
            @access-changed="onAccessChanged"
            @demo-generate="onDemoGenerate"
          />

          <form ref="promptForm" @submit.prevent>
            <input
              class="input is-large is-fullwidth"
              type="text"
              placeholder="Ask me something and press enter..."
              v-model="form.prompt"
              @keyup.enter.native="hasAccess && sendMessage(form.prompt)"
              :disabled="isLoading || !hasAccess"
            />
            <button
              class="button chat is-loading is-outlined is-info is-large is-fullwidth"
              v-if="isLoading"
            ></button>
          </form>
          <ol class="chat" v-if="inferences && inferences.length > 0">
            <li
              v-for="(inference, displayIndex) in paginatedInferences"
              :key="inference._originalIndex"
              class="history-item"
              :style="{ animationDelay: `${Math.min(displayIndex * 50, 500)}ms` }"
            >
              <p class="question">{{ inference.question }}</p>
              <div class="answer" style="white-space: pre-line">
                <vue-markdown :source="inference.answer.text" />
                <button
                  class="button is-medium is-success copy is-pulled-right"
                  @click="
                    copy(inference.answer.text);
                    hasCopy[inference._originalIndex] = true;
                  "
                  v-if="!hasCopy[inference._originalIndex]"
                >
                  <span class="material-symbols-outlined">content_copy</span>
                  Copy
                </button>
                <button
                  class="button is-medium is-outlined copy is-pulled-right"
                  @click="copy(inference.answer.text)"
                  v-if="hasCopy[inference._originalIndex] && hasCopy[inference._originalIndex] == true"
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
import { ref, reactive, shallowRef, toRaw, computed } from "vue";
import { v4 as uuid } from "uuid";
import VueMarkdown from "vue-markdown-render";
import useClipboard from "vue-clipboard3";

// Debounce utility for persistence
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

import GenerativeImage from "./GenerativeImage.vue";
import AccessRequirements from "./AccessRequirements.vue";

const DEMO_PROMPT = "Explain what makes a bonsai tree special in exactly 3 sentences.";

export default {
  name: "GenerativeText",
  components: {
    VueMarkdown,
    GenerativeImage,
    AccessRequirements,
  },
  setup() {
    const downloadProgress = ref(0);
    const isLoading = ref(false);
    const isModel = ref(false);
    const openModel = ref(false);
    const openChat = ref(false);

    // ------------ access control -----------
    const accessRef = ref(null);
    const hasAccess = ref(false);

    const onAccessChanged = (access) => {
      hasAccess.value = access;
    };

    const onDemoGenerate = (demoPrompt) => {
      form.prompt = demoPrompt;
      sendMessage(demoPrompt, true); // true = isDemo
    };
    const availableModels = ref({
      codestral_22_B: {
        modelname: "Codestral 22B",
        modeldesc:
          "22B-parameter Codestral model from Mistral AI with a 32,768-token context window. Specialized for code generation across 80+ programming languages with Fill-in-Middle support. Best for: dedicated coding copilot, multi-language development, and code completion tasks.",
        url: "https://huggingface.co/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf",
        filename: "codestral-22b-v0.1-q4_k_m.gguf",
        filesize: "13.3 GB",
        parameters: 22000000000,
        context: 32768,
      },

      deepseek_R1_1_5_B: {
        modelname: "DeepSeek R1 1.5B",
        modeldesc:
          "1.5B-parameter DeepSeek-R1 distilled model on the Qwen backbone with a 32,768-token context window. Designed to pack strong chain-of-thought style reasoning into a tiny footprint. Best for: background reasoning agents and math/code helpers on very modest hardware.",
        url: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf",
        filename: "deepseek-r1-distill-qwen-1.5b-q4_k_m.gguf",
        filesize: "1.12 GB",
        parameters: 1500000000,
        context: 32768,
      },

      deepseek_R1_7_B: {
        modelname: "DeepSeek R1 7B",
        modeldesc:
          "7B-parameter DeepSeek-R1 distilled Qwen model with a 32,768-token context window. Provides strong open-weight reasoning for math, code, and analytical tasks. Best for: primary local assistant focused on chain-of-thought reasoning and tool use on a single modern GPU.",
        url: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
        filename: "deepseek-r1-distill-qwen-7b-q4_k_m.gguf",
        filesize: "4.68 GB",
        parameters: 7000000000,
        context: 32768,
      },

      deepseek_R1_32_B: {
        modelname: "DeepSeek R1 32B",
        modeldesc:
          "32B-parameter DeepSeek-R1 distilled Qwen model with a 32,768-token context window. High-end local reasoning model targeting complex multi-step problems and code. Best for: workstation or multi-GPU setups that need near frontier-level open reasoning quality.",
        url: "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf",
        filename: "deepseek-r1-distill-qwen-32b-q4_k_m.gguf",
        filesize: "19.85 GB",
        parameters: 32000000000,
        context: 32768,
      },

      gemma_3_1_B: {
        modelname: "Gemma 3 1B",
        modeldesc:
          "1B-parameter Gemma 3 instruction-tuned model from Google with a 32,768-token context window. A compact, efficient chat and reasoning model. Best for: lightweight multilingual assistants, summarization, and everyday QA on laptops or edge devices.",
        url: "https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf",
        filename: "gemma-3-1b-it-q4_k_m.gguf",
        filesize: "806 MB",
        parameters: 1000000000,
        context: 32768,
      },

      gpt_oss_20_B: {
        modelname: "GPT-OSS 20B",
        modeldesc:
          "20B-parameter GPT-OSS model with a long context window (up to around 131,072 tokens depending on runtime). Open-weight alternative to proprietary GPT-style models. Best for: demanding local reasoning, tool-using agents, and advanced coding on high-end hardware.",
        url: "https://huggingface.co/unsloth/gpt-oss-20b-GGUF/resolve/main/gpt-oss-20b-Q4_K_M.gguf",
        filename: "gpt-oss-20b-q4_k_m.gguf",
        filesize: "11.6 GB",
        parameters: 20000000000,
        context: 131072,
      },

      hermes_4_14_B: {
        modelname: "Hermes 4 14B",
        modeldesc:
          "14B-parameter Hermes 4 hybrid reasoning model from Nous Research based on Qwen 3 14B with a 32,768-token context window. Features explicit <think> reasoning mode for deliberation. Best for: advanced reasoning, code generation, structured JSON outputs, and creative tasks.",
        url: "https://huggingface.co/bartowski/NousResearch_Hermes-4-14B-GGUF/resolve/main/NousResearch_Hermes-4-14B-Q4_K_M.gguf",
        filename: "nousresearch_hermes-4-14b-q4_k_m.gguf",
        filesize: "8.99 GB",
        parameters: 14000000000,
        context: 32768,
      },

      llama_2_7_B: {
        modelname: "LLaMA 2 7B",
        modeldesc:
          "7B-parameter LLaMA 2 chat model from Meta with a 4,096-token context window. Classic open-weight assistant baseline. Best for: compatibility with older llama.cpp tooling, simple chatbots, and lightweight coding helpers.",
        url: "https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF/resolve/main/llama-2-7b-chat.Q4_K_M.gguf",
        filename: "llama-2-7b-chat-q4_k_m.gguf",
        filesize: "4.08 GB",
        parameters: 7000000000,
        context: 4096,
      },

      llama_3_1_8_B: {
        modelname: "LLaMA 3.1 8B",
        modeldesc:
          "8B-parameter LLaMA 3.1 instruct model from Meta with a 131,072-token context window. Modern, strong general-purpose assistant with good multilingual and coding performance. Best for: main local chat and coding assistant on a single recent GPU.",
        url: "https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
        filename: "meta-llama-3.1-8b-instruct-q4_k_m.gguf",
        filesize: "4.92 GB",
        parameters: 8000000000,
        context: 131072,
      },

      mistral_7_B: {
        modelname: "Mistral 7B",
        modeldesc:
          "7B-parameter Mistral Instruct v0.2 model from Mistral AI with a 32,768-token context window. Efficient and fast with strong instruction following. Best for: multilingual chat, summarization, and tools/agent orchestration on a single consumer GPU.",
        url: "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        filename: "mistral-7b-instruct-v0.2-q4_k_m.gguf",
        filesize: "4.37 GB",
        parameters: 7000000000,
        context: 32768,
      },

      phi_3_3_8_B: {
        modelname: "Phi-3 Mini 3.8B",
        modeldesc:
          "3.8B-parameter Phi-3 Mini model from Microsoft with a 4,096-token context window. Trained on curated synthetic and filtered web data for strong small-model reasoning. Best for: very fast local chatbots, short-context coding, and educational assistants on CPU or iGPU.",
        url: "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf",
        filename: "phi-3-mini-4k-instruct-q4.gguf",
        filesize: "2.39 GB",
        parameters: 3800000000,
        context: 4096,
      },

      phi_4_3_8_B: {
        modelname: "Phi-4 Mini 3.8B",
        modeldesc:
          "3.8B-parameter Phi-4 Mini instruction-tuned model from Microsoft with a 128,000-token context window. Long-context, reasoning-focused small model. Best for: document QA, longer chats, and compact local assistants that still handle large prompts.",
        url: "https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf",
        filename: "phi-4-mini-instruct-q4_k_m.gguf",
        filesize: "2.49 GB",
        parameters: 3800000000,
        context: 128000,
      },

      qwen_2_5_3_B: {
        modelname: "Qwen 2.5 3B",
        modeldesc:
          "3.09B-parameter Qwen 2.5 instruction-tuned model from Alibaba/Qwen with a 32,768-token context window. Multilingual generalist with good code and tool-use skills. Best for: compact but capable assistants, RAG front-ends, and small coding copilots.",
        url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q5_k_m.gguf",
        filename: "qwen2.5-3b-instruct-q5_k_m.gguf",
        filesize: "2.44 GB",
        parameters: 3090000000,
        context: 32768,
      },

      qwen_2_5_coder_7_B: {
        modelname: "Qwen 2.5 Coder 7B",
        modeldesc:
          "7B-parameter Qwen 2.5 Coder instruction-tuned model from Alibaba with a 32,768-token context window. Code specialist trained on 5.5T tokens including source code. Best for: everyday coding tasks, debugging, code completion on consumer hardware.",
        url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q5_k_m.gguf",
        filename: "qwen2.5-coder-7b-instruct-q5_k_m.gguf",
        filesize: "5.48 GB",
        parameters: 7000000000,
        context: 32768,
      },

      qwen_2_5_coder_14_B: {
        modelname: "Qwen 2.5 Coder 14B",
        modeldesc:
          "14B-parameter Qwen 2.5 Coder instruction-tuned model with 128K context. State-of-the-art code generation and reasoning. Best for: serious development work, complex refactoring, and code agents requiring stronger understanding.",
        url: "https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/qwen2.5-coder-14b-instruct-q4_k_m.gguf",
        filename: "qwen2.5-coder-14b-instruct-q4_k_m.gguf",
        filesize: "8.93 GB",
        parameters: 14000000000,
        context: 131072,
      },

      qwen_2_5_coder_32_B: {
        modelname: "Qwen 2.5 Coder 32B",
        modeldesc:
          "32B-parameter Qwen 2.5 Coder - the current SOTA open-source code LLM with GPT-4o-level coding abilities. 128K context for large codebases. Best for: professional development, multi-file refactoring, code agents, and complex software reasoning.",
        url: "https://huggingface.co/bartowski/Qwen2.5-Coder-32B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-32B-Instruct-Q4_K_M.gguf",
        filename: "qwen2.5-coder-32b-instruct-q4_k_m.gguf",
        filesize: "19.9 GB",
        parameters: 32000000000,
        context: 131072,
      },

      qwen_3_coder_30_B: {
        modelname: "Qwen3 Coder 30B A3B",
        modeldesc:
          "30.5B-parameter Mixture-of-Experts Qwen3-Coder A3B model with a native 262,144-token context window. Specialized for code understanding and generation across very large repositories. Best for: serious local coding copilots, multi-file refactoring, and advanced software reasoning.",
        url: "https://huggingface.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF/resolve/main/Qwen3-Coder-30B-A3B-Instruct-UD-Q5_K_XL.gguf",
        filename: "qwen3-coder-30b-a3b-instruct-ud-q5_k_xl.gguf",
        filesize: "21.7 GB",
        parameters: 30500000000,
        context: 262144,
      },

      yi_coder_9_B: {
        modelname: "Yi-Coder 9B Chat",
        modeldesc:
          "9B-parameter Yi-Coder Chat model from 01.AI with 128K context window. First sub-10B model to pass 20% on LiveCodeBench. Supports 52 programming languages. Best for: capable coding assistant on modest hardware, long-context code understanding.",
        url: "https://huggingface.co/bartowski/Yi-Coder-9B-Chat-GGUF/resolve/main/Yi-Coder-9B-Chat-Q5_K_M.gguf",
        filename: "yi-coder-9b-chat-q5_k_m.gguf",
        filesize: "6.26 GB",
        parameters: 9000000000,
        context: 131072,
      },
    });

    const currentModel = ref({
      modelname: "Gemma 3 1B",
      modeldesc:
        "1B-parameter Gemma 3 instruction-tuned model from Google with a 32,768-token context window. A compact, efficient chat and reasoning model. Best for: lightweight multilingual assistants, summarization, and everyday QA on laptops or edge devices.",
      url: "https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf",
      filename: "gemma-3-1b-it-q4_k_m.gguf",
      filesize: "806 MB",
      parameters: 1000000000,
      context: 32768,
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

    const loadModel = async (model) => {
      console.log("Now loading (raw)...", model);

      const payload = {
        filename: model.filename,
        parameters: model.parameters,
        context: model.context,
      };

      console.log("Sending to electronAPI.loadModel:", payload);

      await window.electronAPI.loadModel(payload);
    };

    // Use shallowRef for better performance with large chat histories
    const inferences = shallowRef([]);
    const hasCopy = shallowRef([]);

    // ------------ lazy loading pagination ----------------
    const ITEMS_PER_PAGE = 20;
    const displayedCount = ref(ITEMS_PER_PAGE);
    const loadMoreSentinel = ref(null);
    const isLoadingMore = ref(false);
    const showScrollTop = ref(false);
    const scrollContainer = ref(null);

    // Reversed inferences (most recent first) with original index
    const reversedInferences = computed(() => {
      return inferences.value.map((item, idx) => ({
        ...item,
        _originalIndex: idx,
      })).reverse();
    });

    // Displayed inferences (lazy loaded subset)
    const paginatedInferences = computed(() => {
      return reversedInferences.value.slice(0, displayedCount.value);
    });

    // Check if there are more items to load
    const hasMore = computed(() => displayedCount.value < inferences.value.length);

    // Load more items
    const loadMore = () => {
      if (isLoadingMore.value || !hasMore.value) return;
      isLoadingMore.value = true;
      setTimeout(() => {
        displayedCount.value = Math.min(
          displayedCount.value + ITEMS_PER_PAGE,
          inferences.value.length
        );
        isLoadingMore.value = false;
      }, 100);
    };

    // Reset to initial count when new inference is added
    const resetToFirstPage = () => {
      displayedCount.value = ITEMS_PER_PAGE;
    };

    // Intersection Observer for infinite scroll
    let scrollObserver = null;
    const setupScrollObserver = () => {
      if (scrollObserver) scrollObserver.disconnect();
      if (!loadMoreSentinel.value) return;

      // Use the scroll container as root for proper intersection detection
      const root = scrollContainer.value || document.querySelector('.models__deployment-install');
      scrollObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore.value) {
            loadMore();
          }
        },
        { root, rootMargin: '100px' }
      );
      scrollObserver.observe(loadMoreSentinel.value);
    };

    const cleanupScrollObserver = () => {
      if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
      }
    };

    // Scroll to top handler
    const scrollToTop = () => {
      const container = scrollContainer.value || document.querySelector('.models__deployment-install');
      if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    // Handle scroll to show/hide scroll-to-top button (throttled)
    let scrollRafId = null;
    const handleScroll = (e) => {
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        const scrollTop = e.target?.scrollTop || 0;
        showScrollTop.value = scrollTop > 400;
        scrollRafId = null;
      });
    };

    const setupScrollListener = () => {
      const container = document.querySelector('.models__deployment-install');
      if (container) {
        scrollContainer.value = container;
        container.addEventListener('scroll', handleScroll, { passive: true });
      }
    };

    const cleanupScrollListener = () => {
      if (scrollContainer.value) {
        scrollContainer.value.removeEventListener('scroll', handleScroll);
      }
    };

    // Debounced persistence
    const persistInferences = debounce(async (data) => {
      try {
        await window.electronAPI?.store?.set?.("textInferences", data);
      } catch {}
    }, 500);

    const initialState = {
      prompt: "",
    };

    const form = reactive({ ...initialState });

    function resetForm() {
      Object.assign(form, initialState);
    }

    async function resetChat() {
      inferences.value = [];
      // Clear persisted text inferences
      try {
        await window.electronAPI?.store?.set?.("textInferences", []);
      } catch (e) {
        console.error("Failed to clear text inferences:", e);
      }
    }

    const exportHistory = () => {
      if (!inferences.value || inferences.value.length === 0) return;
      const data = JSON.stringify(inferences.value, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bonzai-text-history-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    const importHistory = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (Array.isArray(data)) {
            inferences.value = [...data, ...inferences.value];
            hasCopy.value = new Array(inferences.value.length).fill(false);
            await persistInferences([...inferences.value]);
          }
        } catch (err) {
          console.error("Failed to import history:", err);
        }
      };
      input.click();
    };

    // Load persisted text inferences on component mount
    const loadHistory = async () => {
      try {
        const saved = await window.electronAPI?.store?.get?.(
          "textInferences",
          []
        );
        if (Array.isArray(saved)) {
          inferences.value = saved;
          hasCopy.value = new Array(saved.length).fill(false);
        }
      } catch (e) {
        console.error("Failed to load text inferences:", e);
      }
    };

    const sendMessage = async (prompt, isDemo = false) => {
      // Allow demo generation even without access
      if (!isDemo && !hasAccess.value) return;

      isLoading.value = true;

      try {
        // Inference
        const assistantResult = await window.electronAPI.chat(prompt);

        const assistantMessage = {
          id: uuid(),
          text: assistantResult,
        };

        console.log("prompt", assistantMessage);
        // Update shallowRef by replacing array
        const newInference = { question: prompt, answer: assistantMessage };
        inferences.value = [...inferences.value, newInference];
        hasCopy.value = [...hasCopy.value, false];

        // Debounced persistence
        persistInferences([...inferences.value]);

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
      exportHistory,
      importHistory,
      copy,
      hasCopy,
      // lazy loading pagination
      paginatedInferences,
      loadMoreSentinel,
      hasMore,
      isLoadingMore,
      setupScrollObserver,
      cleanupScrollObserver,
      // scroll to top
      showScrollTop,
      scrollToTop,
      setupScrollListener,
      cleanupScrollListener,
      // access control
      accessRef,
      hasAccess,
      onAccessChanged,
      onDemoGenerate,
      DEMO_PROMPT,
    };
  },
  async mounted() {
    const readyToPrompt = await this.isModelAvailable(
      this.currentModel.filename
    );
    console.log("Ready to prompt, sir.", readyToPrompt);

    // Load persisted chat history
    try {
      const saved = await window.electronAPI?.store?.get?.("textInferences", []);
      if (Array.isArray(saved) && saved.length > 0) {
        // Replace array (shallowRef requires full replacement, not mutation)
        this.inferences = [...saved];
        this.hasCopy = new Array(saved.length).fill(false);
      }
    } catch (e) {
      console.error("Failed to load text inferences:", e);
    }

    // Setup scroll observer after DOM is rendered
    setTimeout(() => this.setupScrollObserver(), 100);
    // Setup scroll listener for scroll-to-top button
    this.setupScrollListener();
  },
  beforeUnmount() {
    this.cleanupScrollObserver();
    this.cleanupScrollListener();
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");

.material-symbols-outlined {
  font-variation-settings:
    "FILL" 0,
    "wght" 100,
    "GRAD" -25,
    "opsz" 48;

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
  background: url("../assets/bonzai_chat.jpg") no-repeat;
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
  background: url("../assets/bonzai_logo-full.png") no-repeat;
  background-size: contain;
}

.tabs li.chat {
  /* aspect-ratio: 16/9; */
  height: 20vh;
  background: url("../assets/bonzai_chat.jpg") no-repeat;
  background-size: cover;
}

.tabs li.image {
  height: 20vh;
  background: url("../assets/bonzai_image.jpg") no-repeat;
  background-size: cover;
}

.tabs li.video {
  height: 20vh;
  background: url("../assets/bonzai_video.jpg") no-repeat;
  background-size: cover;
}

.tabs li.music {
  height: 20vh;
  background: url("../assets/bonzai_music.jpg") no-repeat;
  background-size: cover;
}

.models__deployment {
  position: relative;
  background: transparent;
  padding: 0 !important;
  margin: 0 !important;
}

.models__deployment-install {
  position: relative;
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
  padding: 1em;
  font-size: 28px;
  border-radius: 4px;
  min-height: 126px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(32px);
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
  flex-direction: column;
}

ol.chat li {
  position: relative;
}

/* Fade-in animation for history items */
.history-item {
  animation: fadeInUp 0.4s ease-out forwards;
  opacity: 0;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.load-more-sentinel {
  min-height: 20px;
}

/* Scroll to top button */
.scroll-to-top-btn {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(97, 55, 142, 0.9);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  z-index: 100;
  animation: fadeInUp 0.3s ease-out;
}

.scroll-to-top-btn:hover {
  background: rgba(97, 55, 142, 1);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
}

.scroll-to-top-btn .material-symbols-outlined {
  font-size: 24px;
  border: none;
}

/* Background animation */
@keyframes move {
  0% {
    transform: scale(1.1);
    transform-origin: bottom left;
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1.1);
    transform-origin: bottom left;
  }
}
</style>
