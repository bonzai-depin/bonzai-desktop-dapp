<template scoped>
  <div class="background"></div>
  <div class="models__deployment column is-8 is-paddingless">
    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12 p-5">
          <!-- Header with Title and Stake BONZAI -->
          <div class="level mb-5">
            <div class="level-left">
              <h1
                class="fira-sans-condensed-black-italic is-size-1 has-text-white"
              >
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px"
                >
                  hub
                </span>
                Smart Agents
              </h1>
            </div>
            <div class="level-right">
              <button
                class="button is-info is-large is-outlined fira-sans-condensed-black-italic"
              >
                <span class="material-symbols-outlined mr-2">
                  shopping_cart
                </span>
                Buy BONZAI
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="tabs is-large is-fullwidth mb-5">
            <ul>
              <li :class="{ 'is-active': activeTab === 'buy' }">
                <a
                  @click.prevent="activeTab = 'buy'"
                  class="fira-sans-condensed-black-italic"
                >
                  <span class="material-symbols-outlined mr-2">
                    shopping_cart
                  </span>
                  Buy
                </a>
              </li>
              <li :class="{ 'is-active': activeTab === 'sell' }">
                <a
                  @click.prevent="activeTab = 'sell'"
                  class="fira-sans-condensed-black-italic"
                >
                  <span class="material-symbols-outlined mr-2">storefront</span>
                  Sell
                </a>
              </li>
              <li :class="{ 'is-active': activeTab === 'run' }">
                <a
                  @click.prevent="activeTab = 'run'"
                  class="fira-sans-condensed-black-italic"
                >
                  <span class="material-symbols-outlined mr-2">
                    auto_read_play
                  </span>
                  Run
                </a>
              </li>
            </ul>
          </div>

          <!-- BUY TAB -->
          <div v-if="activeTab === 'buy'">
            <!-- Copy Swap Example -->
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
                          <span
                            class="material-symbols-outlined is-size-3 mr-2"
                          >
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
                    <ol class="bonzai__agent column is-12 description">
                      <hr />
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Step 1.
                          </span>
                          Spot the top perfoming onchain assets.
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Step 2.
                          </span>
                          Spot the top performing traders in Step 1.
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Step 3.
                          </span>
                          Spot the latest onchain swaps of the top performing
                          traders in Step 2.
                        </p>
                      </li>
                      <li>
                        <p>
                          <span class="fira-sans-condensed-black-italic mr-2">
                            Step 4.
                          </span>
                          Copy the latest onchain swaps spotted in Step 3.
                        </p>
                      </li>
                    </ol>
                    <hr />
                    <h2 class="fira-sans-condensed-black-italic mr-2 is-size-4">Powered by</h2>
                    <img src="https://cdn.prod.website-files.com/60118ca18674407b85935203/64f6f41dcae1161d9e6a7b43_White.svg" />
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
            <!-- Listed Agents -->
            <div
              class="bonzai__agent column is-4"
              v-for="(agent, idx) in agentList"
              :key="idx"
            >
              <h3 class="title is-5 has-text-white">{{ agent.name }}</h3>
              <p class="has-text-white">{{ agent.description }}</p>
              <p class="is-size-7 mt-2 has-text-white">
                Endpoint:
                <code>{{ agent.endpoint }}</code>
              </p>
              <div class="buttons mt-3">
                <button class="button is-success" @click="buyAccess(agent)">
                  <span class="material-symbols-outlined mr-2">
                    shopping_cart
                  </span>
                  Buy Access
                </button>
                <button class="button is-info" @click="executeAgent(agent)">
                  <span class="material-symbols-outlined mr-2">play_arrow</span>
                  Run Agent
                </button>
              </div>
            </div>
          </div>

          <!-- SELL TAB -->
          <div v-if="activeTab === 'sell'">
            <div class="models__activity--payouts">
              <div class="bonzai__agent">
                <div class="columns">
                  <div class="field column is-5">
                    <label
                      class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                    >
                      Name *
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model="agentForm.name"
                        placeholder="Name your Smart Agent"
                      />
                    </div>
                  </div>
                  <div class="field column is-5">
                    <label
                      class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                    >
                      ERC20 Token
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model="agentForm.agentToken"
                        placeholder="0x..."
                      />
                    </div>
                  </div>
                  <div class="field column is-2">
                    <label
                      class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                    >
                      Price in Token
                    </label>
                    <div class="control">
                      <input
                        class="input is-large"
                        v-model.number="agentForm.price"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
                <div class="field">
                  <label
                    class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                  >
                    Description *
                  </label>
                  <div class="control">
                    <textarea
                      class="textarea is-large"
                      v-model="agentForm.description"
                      placeholder="Describe your Smart Agent"
                    ></textarea>
                  </div>
                </div>
                <div class="models__activity--payouts has-text-right p-5 mt-5">
                  <label
                    class="label has-text-white has-text-left fira-sans-condensed-black-italic"
                  >
                    Agentic Workflow *
                  </label>
                  <div
                    v-for="(step, idx) in agentForm.steps"
                    :key="idx"
                    class="box mb-3"
                  >
                    <div class="field">
                      <label
                        class="label has-text-white fira-sans-condensed-black-italic"
                      >
                        Step {{ idx + 1 }} Task
                      </label>
                      <div class="control">
                        <input
                          class="input"
                          v-model="step.task"
                          placeholder="e.g. generate_json"
                        />
                      </div>
                    </div>
                    <div class="field mt-3">
                      <label
                        class="label has-text-white fira-sans-condensed-black-italic"
                      >
                        Endpoint
                      </label>
                      <div class="control">
                        <input
                          class="input"
                          v-model="step.endpoint"
                          placeholder="/llm/json"
                        />
                      </div>
                    </div>
                    <div class="field mt-3">
                      <label
                        class="label has-text-white fira-sans-condensed-black-italic"
                      >
                        Input Expression
                      </label>
                      <div class="control">
                        <input
                          class="input"
                          v-model="step.input"
                          placeholder="e.g. form.prompt or previousTask.result"
                        />
                      </div>
                    </div>
                    <div class="control mt-3 has-text-right">
                      <button
                        class="button is-danger is-small"
                        @click="removeStep(idx)"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div class="control has-text-left">
                    <button
                      class="button is-info is-medium"
                      @click="openSteps = true"
                    >
                      <span class="material-symbols-outlined mr-2">add</span>
                      Add Step
                    </button>
                  </div>
                </div>
                <hr class="mt-5 mb-5" />
                <div class="control mt-4 has-text-right">
                  <button
                    class="button is-success is-large"
                    @click="openRegistryWindow()"
                  >
                    <span class="material-symbols-outlined mr-2">
                      rocket_launch
                    </span>
                    List Agent
                    <div class="tags has-addons">
                      <span
                        class="tag is-warning partner fira-sans-condensed-black-italic"
                      >
                        50K BONZAI
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- RUN TAB -->
          <div v-if="activeTab === 'run'">
            <div v-if="purchasedAgents.length === 0" class="has-text-white">
              You haven't purchased any agents yet.
            </div>
            <div
              class="bonzai__agent column is-4"
              v-for="(agent, idx) in purchasedAgents"
              :key="idx"
            >
              <h3 class="title is-5 has-text-white">{{ agent.name }}</h3>
              <button class="button is-info mt-2" @click="executeAgent(agent)">
                <span class="material-symbols-outlined mr-2">play_arrow</span>
                Run {{ agent.name }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="models__deployment-use" v-if="openSteps">
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
                  Agentic Tasks
                </h1>
              </div>
            </div>
            <div class="level-right">
              <div class="level-item">
                <button
                  class="button is-outlined is-info is-large fira-sans-condensed-black-italic ml-5"
                  @click="openSteps = false"
                >
                  <span class="material-symbols-outlined is-size-1">Close</span>
                </button>
              </div>
            </div>
          </div>
          <ul class="bonzai__agent-steps columns is-multiline">
            <div class="column is-6">
              <h1
                class="fira-sans-condensed-black-italic has-text-left is-size-3"
              >
                Mode
              </h1>
            </div>
            <div class="column is-6">
              <h1
                class="fira-sans-condensed-black-italic has-text-left is-size-3"
              >
                Reasoning
              </h1>
            </div>
            <li class="column is-3">
              <div class="bonzai__agent-steps--item">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 92px !important"
                >
                  sweep
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-4"
                >
                  One-Pass
                </h2>
              </div>
            </li>
            <li class="column is-3">
              <div class="bonzai__agent-steps--item">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 92px !important"
                >
                  checklist
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-4"
                >
                  Multi-Pass
                </h2>
              </div>
            </li>
            <li class="column is-3">
              <div class="bonzai__agent-steps--item">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 92px !important"
                >
                  visibility_lock
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-4"
                >
                  Offline
                </h2>
              </div>
            </li>
            <li class="column is-3">
              <div class="bonzai__agent-steps--item">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 92px !important"
                >
                  public
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-4"
                >
                  Online
                </h2>
              </div>
            </li>
            <div class="column is-12">
              <h1
                class="fira-sans-condensed-black-italic has-text-left is-size-3"
              >
                Generation
              </h1>
            </div>
            <li class="column is-2">
              <div class="bonzai__agent-steps--item pt-6">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px !important"
                >
                  chat
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-5"
                >
                  Script
                </h2>
              </div>
            </li>
            <li class="column is-2">
              <div class="bonzai__agent-steps--item pt-6">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px !important"
                >
                  image
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-5"
                >
                  Picture
                </h2>
              </div>
            </li>
            <li class="column is-2">
              <div class="bonzai__agent-steps--item pt-6">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px !important"
                >
                  movie
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-5"
                >
                  Motion
                </h2>
              </div>
            </li>
            <li class="column is-2">
              <div class="bonzai__agent-steps--item pt-6">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px !important"
                >
                  mic
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-5"
                >
                  Speech
                </h2>
              </div>
            </li>
            <li class="column is-2">
              <div class="bonzai__agent-steps--item pt-6">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px !important"
                >
                  headphones
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-5"
                >
                  Soundtrack
                </h2>
              </div>
            </li>
            <li class="column is-2">
              <div class="bonzai__agent-steps--item pt-6">
                <span
                  class="material-symbols-outlined mr-2"
                  style="font-size: 64px !important"
                >
                  3d_rotation
                </span>
                <h2
                  class="fira-sans-condensed-black-italic has-text-centered is-size-5"
                >
                  Asset
                </h2>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from "vue";

export default {
  name: "SmartAgent",
  setup() {
    const activeTab = ref("buy");
    const agentForm = reactive({
      name: "",
      description: "",
      endpoint: "",
      agentToken: "",
      price: 0,
    });
    const agentList = ref([]);
    const purchasedAgents = ref([]);
    const openSteps = ref(false);
    const exampleAgent = {
      /* ... example data ... */
    };

    // Open a standalone browser window for registry interactions
    const openRegistryWindow = () => {
      window.electronAPI.openWindow({
        url: "https://app.bonzai.sh/registry",
        width: 800,
        height: 600,
      });
    };

    const buyAccess = (agent) => {
      // Open external purchase page in browser
      window.electronAPI.openExternal(
        `https://app.bonzai.sh/purchase/${agent.id}`
      );
    };

    const executeAgent = async (agent) => {
      const res = await fetch(agent.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "example prompt" }),
      });
      const data = await res.json();
      alert(`Result: ${JSON.stringify(data)}`);
    };

    onMounted(async () => {
      // Fetch registry agents list from API
      const res = await fetch("https://api.bonzai.sh/registry/agents");
      agentList.value = await res.json();
      // Fetch purchased agents
      const bought = await window.electronAPI.getPurchasedAgents();
      purchasedAgents.value = bought;
    });

    return {
      activeTab,
      agentForm,
      openSteps,
      agentList,
      purchasedAgents,
      openRegistryWindow,
      buyAccess,
      executeAgent,
    };
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

.input,
textarea {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  transition: 200ms ease-in;
  transform: translate3d(0, 0, 0);
  resize: none;
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

.bonzai__agent-steps--item {
  padding: 1em;
  color: rgba(255, 255, 255, 1);
  height: 20vh;
  border: 1px solid rgba(255, 255, 255, 0.33);
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1vh;
  transition: 200ms ease-in;
  transform: translate3d(0, 0, 0);
}

.bonzai__agent-steps--item:hover {
  border: 1px solid rgba(57, 213, 130, 0.75);
  background: rgba(57, 213, 130, 0.1);
  border-width: 1px 1px 2em 1px;
  cursor: pointer;
  transition: 200ms ease-in;
  transform: translate3d(0, 0, 0);
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
